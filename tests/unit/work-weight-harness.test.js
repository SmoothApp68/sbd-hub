// Characterization harness for wpComputeWorkWeight (ALGO-A2).
// These tests FREEZE the current real behavior — values AND side effects — by
// running the REAL function source (vm-extracted from app.js/engine.js, no
// reimplementation) against a mock db with instrumented stubs. Any future
// refactor (de-impurification, bounds extraction) must keep these green; if the
// "when" of a side effect legitimately moves, update the test with a comment.
//
// All asserted numbers were captured by executing the function first (probe),
// then asserted — they are the OBSERVED behavior, not the theoretical ideal.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');

function extractFn(src, name) {
  const sm = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!sm) throw new Error('NOT FOUND in source: ' + name);
  const start = sm.index;
  const lineEnd = src.indexOf('\n', start);
  const firstLine = src.slice(start, lineEnd);
  if (firstLine.includes('{') && firstLine.trimEnd().endsWith('}')) return firstLine; // one-liner
  const rest = src.slice(lineEnd);
  const em = rest.match(/\n\}/);
  const end = em ? lineEnd + em.index + 2 : src.length;
  return src.slice(start, end);
}

// Closure of REAL sources needed (non-guarded helpers + the function + safe wrapper).
const PREAMBLE = (function () {
  const fromApp = ['wpCalcE1RM', 'wpRound25', 'wpRound125', 'wpRepsForPhase', 'wpNormalizeName',
    'isE1RMStabilized', 'hadGrindLastSession', 'getUserBW', 'wpFindBestMatch',
    'wpComputeWorkWeight', 'wpComputeWorkWeightSafe'];
  const fromEng = ['getZoneE1RM'];
  let p = '';
  fromApp.forEach(function (n) { p += extractFn(APP, n) + '\n'; });
  fromEng.forEach(function (n) { p += extractFn(ENG, n) + '\n'; });
  return p;
})();

// Verify the extraction itself succeeds (Phase 1 self-check).
test('harness: real sources extract cleanly', () => {
  expect(PREAMBLE).toMatch(/function wpComputeWorkWeight\(/);
  expect(PREAMBLE).toMatch(/function wpComputeWorkWeightSafe\(/);
  expect(PREAMBLE).toMatch(/function getZoneE1RM\(/);
});

function makeCtx(db, opts) {
  opts = opts || {};
  const calls = { saveDB: 0, showToast: [], setZoneE1RM: [] };
  const ctx = {
    db: db, console: console, Math: Math, Date: Date, JSON: JSON,
    parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN,
    Object: Object, Array: Array, Set: Set, Number: Number, String: String, Boolean: Boolean,
    // real module constants
    WP_PROGRESSION: { upper: { increase: 2.5, decrease: 5.0 }, lower: { increase: 5.0, decrease: 10.0 } },
    LP_CONFIG: { strikesMax: 3, deloadPct: 0.10, dotsSeuil: { M: 250, F: 180 }, durationMaxWeeks: 12, increments: { 'composé_lourd': 2.5, 'composé_leger': 1.25, isolation: 0.5 } },
    BW_FALLBACK_KG: 80,
    WP_SYNONYMS: {},
    isBeginnerMode: opts.isBeginnerMode || false,
    rpeCapReprise: (opts.rpeCapReprise !== undefined ? opts.rpeCapReprise : null),
    // instrumented impure stubs (never the real ones)
    saveDB: function () { calls.saveDB++; },
    showToast: function (m) { calls.showToast.push(m); },
    setZoneE1RM: function () { calls.setZoneE1RM.push(Array.prototype.slice.call(arguments)); },
    // PURE stub of the impure wpDetectPhase — phase controlled by the test
    wpDetectPhase: function () { return opts.phase || 'accumulation'; },
    // safe-wrapper deps
    logErrorToSupabase: function () {},
    _getLastWorkoutData: function () { return { weight: opts.lastWorkoutWeight || 0 }; },
  };
  // optional guarded helpers (default: undefined -> penalties/branches skipped)
  Object.assign(ctx, opts.guardedStubs || {});
  ctx._calls = calls;
  vm.createContext(ctx);
  vm.runInContext(PREAMBLE, ctx);
  return ctx;
}

function run(db, lift, bodyPart, opts) {
  const ctx = makeCtx(db, opts);
  const result = vm.runInContext('wpComputeWorkWeight(' + JSON.stringify(lift) + ',' + JSON.stringify(bodyPart) + ')', ctx);
  return { result: result, calls: ctx._calls, db: db };
}
function runSafe(db, lift, bodyPart, opts) {
  const ctx = makeCtx(db, opts);
  const result = vm.runInContext('wpComputeWorkWeightSafe(' + JSON.stringify(lift) + ',' + JSON.stringify(bodyPart) + ')', ctx);
  return { result: result, calls: ctx._calls, db: db };
}

function squatLog(weight, reps, rpe, daysAgo) {
  return { timestamp: Date.now() - (daysAgo || 3) * 86400000, volume: 5000,
    exercises: [{ name: 'Squat', allSets: [{ weight: weight, reps: reps, rpe: rpe, isWarmup: false }] }] };
}
function nominalDb(over) {
  return Object.assign({
    bestPR: { squat: 150, bench: 100, deadlift: 180 },
    logs: [squatLog(140, 5, 8)],
    exercises: {},
    user: { level: 'intermediaire', gender: 'male', programParams: { goals: [] } },
    weeklyPlan: { currentBlock: { phase: 'accumulation', week: 1 } },
    weeklyPlanHistory: [],
    todayWellbeing: null,
    _recoveryBonus: null,
  }, over || {});
}

describe('wpComputeWorkWeight — caractérisation des VALEURS', () => {
  test('nominal : Squat 140x5 @RPE8, accumulation → 140 (RPE 8 ≤ 8.5 → maintien)', () => {
    expect(run(nominalDb(), 'squat', 'lower').result).toBe(140);
  });
  test('RPE bas (7) → progression +increase(lower=5) → 145', () => {
    expect(run(nominalDb({ logs: [squatLog(140, 5, 7)] }), 'squat', 'lower').result).toBe(145);
  });
  test('cap APRE phase accumulation (0.85) borne 200x1@RPE6 → 192.5', () => {
    const r = run(nominalDb({ logs: [squatLog(200, 1, 6)] }), 'squat', 'lower');
    expect(r.result).toBe(192.5);
  });
  test('hard cap : résultat ≤ 102.5% e1RM quand e1RM connu', () => {
    // e1RM de 200x1@RPE6 ≈ 225 ; le résultat (192.5) reste sous 225*1.025
    const r = run(nominalDb({ logs: [squatLog(200, 1, 6)] }), 'squat', 'lower');
    expect(r.result).toBeLessThanOrEqual(225 * 1.025);
  });
  test('cold start : pas de logs + onboarding PR 150 → 112.5 (PR×0.75)', () => {
    const r = run(nominalDb({ logs: [] }), 'squat', 'lower',
      { guardedStubs: { isColdStart: () => true, getOnboardingPR: () => 150 } });
    expect(r.result).toBe(112.5);
  });
  test('pas de logs ni PR → fallback 60', () => {
    expect(run(nominalDb({ logs: [], bestPR: {} }), 'squat', 'lower').result).toBe(60);
  });
  test('e1RM = 0 (set poids 0 filtré → fallback PR) : pas de NaN, ≥ 20', () => {
    const r = run(nominalDb({ logs: [squatLog(0, 5, 8)] }), 'squat', 'lower');
    expect(isNaN(r.result)).toBe(false);
    expect(r.result).toBe(112.5);
    expect(r.result).toBeGreaterThanOrEqual(20);
  });
  test('fallback PR très bas → PAS de plancher 20kg sur ce chemin : 7.5 (COMPORTEMENT ACTUEL — à challenger)', () => {
    // QUIRK capturé : le plancher absolu 20kg (Math.max(20,...)) n'existe que sur
    // les chemins à PÉNALITÉS, pas sur le fallback cold-start/PR. Ici PR=10 →
    // wpRound25(10*0.75) = 7.5, sous 20kg. Comportement réel, documenté tel quel.
    const r = run(nominalDb({ logs: [], bestPR: { squat: 10 } }), 'squat', 'lower');
    expect(r.result).toBe(7.5);
  });
  test('recovery bonus présent → +2.5 → 142.5', () => {
    const today = new Date().toISOString().split('T')[0];
    const r = run(nominalDb({ _recoveryBonus: { k1: { date: today, bonus: 2.5 } } }), 'squat', 'lower');
    expect(r.result).toBe(142.5);
  });
  test('pénalité sommeil (3 sessions, stabilisé, sleep≤2) → 132.5', () => {
    const today = new Date().toISOString().split('T')[0];
    const logs = [squatLog(140, 5, 8, 1), squatLog(140, 5, 8, 4), squatLog(140, 5, 8, 7)];
    const r = run(nominalDb({ logs: logs, todayWellbeing: { date: today, sleep: 1, motivation: 3 } }), 'squat', 'lower');
    expect(r.result).toBe(132.5);
  });
  test('phase peak (cap APRE 1.00) : 200x1@RPE6 → 205 (cap ne mord pas)', () => {
    const r = run(nominalDb({ logs: [squatLog(200, 1, 6)] }), 'squat', 'lower', { phase: 'peak' });
    expect(r.result).toBe(205);
  });
  test('phase deload (cap APRE 0.75) : 200x1@RPE6 → 170 (cap mord)', () => {
    const r = run(nominalDb({ logs: [squatLog(200, 1, 6)] }), 'squat', 'lower', { phase: 'deload' });
    expect(r.result).toBe(170);
  });
});

describe('wpComputeWorkWeight — caractérisation des EFFETS DE BORD', () => {
  test('shadowWeight écrit dans db.exercises[realName] (= 140 nominal, valeur post-cap pré-bonus)', () => {
    const r = run(nominalDb(), 'squat', 'lower');
    expect(r.db.exercises['Squat'].shadowWeight).toBe(140);
  });
  test('shadowWeight = valeur AVANT le recovery bonus (140, alors que le retour est 142.5)', () => {
    const today = new Date().toISOString().split('T')[0];
    const r = run(nominalDb({ _recoveryBonus: { k1: { date: today, bonus: 2.5 } } }), 'squat', 'lower');
    expect(r.db.exercises['Squat'].shadowWeight).toBe(140);
    expect(r.result).toBe(142.5);
  });
  test('setZoneE1RM appelé 1× sur le chemin nominal', () => {
    expect(run(nominalDb(), 'squat', 'lower').calls.setZoneE1RM.length).toBe(1);
  });
  test('_recoveryBonus consommé (vidé) quand présent', () => {
    const today = new Date().toISOString().split('T')[0];
    const r = run(nominalDb({ _recoveryBonus: { k1: { date: today, bonus: 2.5 } } }), 'squat', 'lower');
    expect(r.db._recoveryBonus.k1).toBeUndefined();
  });
  test('_pendingCoachNote posée quand une pénalité émet une note (sommeil)', () => {
    const today = new Date().toISOString().split('T')[0];
    const logs = [squatLog(140, 5, 8, 1), squatLog(140, 5, 8, 4), squatLog(140, 5, 8, 7)];
    const r = run(nominalDb({ logs: logs, todayWellbeing: { date: today, sleep: 1, motivation: 3 } }), 'squat', 'lower');
    expect(typeof r.db._pendingCoachNote).toBe('string');
    expect(r.db._pendingCoachNote).toMatch(/sommeil/i);
  });
  test('chemin nominal : saveDB et showToast NON appelés', () => {
    const r = run(nominalDb(), 'squat', 'lower');
    expect(r.calls.saveDB).toBe(0);
    expect(r.calls.showToast.length).toBe(0);
  });
  test('chemin LP exit : saveDB 1× + showToast 1×', () => {
    const r = run(nominalDb(), 'squat', 'lower',
      { isBeginnerMode: true, guardedStubs: { checkLPEnd: () => ({ exit: true, message: 'LP terminé' }) } });
    expect(r.calls.saveDB).toBe(1);
    expect(r.calls.showToast.length).toBe(1);
  });
});

describe('wpComputeWorkWeight — kill switch (retour polymorphe)', () => {
  test('pénalités cumulées < 0.70 (weightCut actif, penalty 0.5) → objet {forceActiveRecovery:true}', () => {
    const db = nominalDb({ user: { level: 'intermediaire', gender: 'male', programParams: { goals: [] }, weightCut: { active: true } } });
    const r = run(db, 'squat', 'lower', { guardedStubs: { calcWeightCutPenalty: () => 0.5 } });
    expect(typeof r.result).toBe('object');
    expect(r.result.forceActiveRecovery).toBe(true);
  });

  // BUG LATENT (ALGO-DIAG / A1-F3) — documenté, PAS corrigé ici.
  // wpComputeWorkWeightSafe traite l'objet comme invalide (typeof !== 'number') et
  // retombe sur le dernier poids → le signal forceActiveRecovery n'atteint JAMAIS
  // l'appelant. Fix prévu dans une phase ultérieure. test.failing = rouge volontaire.
  test.failing('wpComputeWorkWeightSafe DEVRAIT propager forceActiveRecovery (BUG : il l\'avale)', () => {
    const db = nominalDb({ user: { level: 'intermediaire', gender: 'male', programParams: { goals: [] }, weightCut: { active: true } } });
    const r = runSafe(db, 'squat', 'lower', { lastWorkoutWeight: 130, guardedStubs: { calcWeightCutPenalty: () => 0.5 } });
    // Réel : r.result === 130 (number). Souhaité : un signal forceActiveRecovery.
    expect(r.result && r.result.forceActiveRecovery).toBe(true);
  });
});
