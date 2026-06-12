// Harnais de caractérisation READY-C2-a — fige le comportement ACTUEL des
// fonctions readiness/bien-être que C2-b/c/d vont toucher. Même infrastructure
// que la Phase A (vm-extraction de la VRAIE source, aucune réimplémentation,
// stubs instrumentés). Les tests décrivent ce que le code FAIT — y compris ses
// bugs et quirks connus, nommés explicitement. Toute valeur a été observée par
// probe AVANT d'être figée (observe-then-assert).
//
// Surprises vs diagnostic (détaillées dans audit/READY-C2a-harness.md) :
//  - getStressVolumeModifier : la branche stress>=4 est VIVANTE au niveau
//    fonction (→0.80) ; le fossile est au niveau système (champ jamais écrit).
//  - Fast-Track : la moyenne readiness est ARRONDIE avant le seuil 85 →
//    la frontière effective est 84.5 (84.9 → +5kg).
//  - calculateReadiness(10,10,10,10) = 78, pas 100 (soreness inversé 11-x).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const IMP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'import.js'), 'utf8');

function extractFn(src, name) {
  const sm = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!sm) throw new Error('NOT FOUND in source: ' + name);
  const start = sm.index;
  const lineEnd = src.indexOf('\n', start);
  const firstLine = src.slice(start, lineEnd);
  if (firstLine.includes('{') && firstLine.trimEnd().endsWith('}')) return firstLine; // one-liner
  const rest = src.slice(lineEnd);
  const em = rest.match(/\n\}/);
  return src.slice(start, em ? lineEnd + em.index + 2 : src.length);
}
// Extraction d'une constante objet top-level (var X = { ... };) — vraie source.
function extractVar(src, name) {
  const sm = src.match(new RegExp('^var ' + name + ' = \\{', 'm'));
  if (!sm) throw new Error('NOT FOUND var in source: ' + name);
  const rest = src.slice(sm.index);
  const em = rest.match(/\n\};/);
  return rest.slice(0, em.index + 3);
}

const PREAMBLE = (function () {
  const fromApp = ['getTodayStr', 'hasTodayReadiness', 'getTodayReadiness',
    'calculateReadiness', 'getReadinessLoadAdjustment', 'getStressVolumeModifier',
    'computeAdaptiveSRSThreshold', 'getCyclePhaseModifier', 'getEffectiveSRS',
    'shouldDeload', 'wpDetectPhase', '_wpComputeWorkWeightPenalties',
    'wpDoubleProgressionWeight', 'wpFindBestMatch', 'wpNormalizeName', 'wpRound25',
    'generateId', 'calcE1RM', 'convertWorkoutToSession'];
  const fromImp = ['createSession', 'finalizeSessionFromSeries'];
  let p = '';
  fromApp.forEach(function (n) { p += extractFn(APP, n) + '\n'; });
  p += extractVar(APP, 'BLOCK_DURATION') + '\n';
  fromImp.forEach(function (n) { p += extractFn(IMP, n) + '\n'; });
  return p;
})();

test('harnais c2 : les sources réelles s\'extraient proprement', () => {
  expect(PREAMBLE).toMatch(/function wpDetectPhase\(/);
  expect(PREAMBLE).toMatch(/function _wpComputeWorkWeightPenalties\(/);
  expect(PREAMBLE).toMatch(/var BLOCK_DURATION = \{/);
  expect(PREAMBLE).toMatch(/function convertWorkoutToSession\(/);
});

function makeCtx(db, extra) {
  const calls = { saveDB: 0 };
  const c = Object.assign({
    db: db, console: console, Math: Math, Date: Date, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number, Boolean: Boolean,
    parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, Infinity: Infinity,
    DAYS_FULL: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    WP_SYNONYMS: {},
    saveDB: function () { calls.saveDB++; },
  }, extra || {});
  c._calls = calls;
  vm.createContext(c);
  vm.runInContext(PREAMBLE, c);
  return c;
}
const TODAY = new Date().toISOString().split('T')[0];

// ── 1. calculateReadiness — pondérations Helms figées ────────────────────────
describe('calculateReadiness (Helms 0.35/0.25/0.15/0.25, soreness inversé 11-x, ×10)', () => {
  const calc = (s, e, m, so) => vm.runInContext(`calculateReadiness(${s},${e},${m},${so})`, makeCtx({}));
  test('tous à 5 → 53', () => expect(calc(5, 5, 5, 5)).toBe(53));
  test('tous à 1 → 33 (soreness 1 inversé = 10 remonte le score)', () => expect(calc(1, 1, 1, 1)).toBe(33));
  test('tous à 10 → 78 et PAS 100 (soreness 10 inversé = 1)', () => expect(calc(10, 10, 10, 10)).toBe(78));
  test('cas parfait réel : 10,10,10, soreness 1 → 100 (clamp haut atteint)', () => expect(calc(10, 10, 10, 1)).toBe(100));
  test('entrées paires 2,4,6,8 (futur mapping 1-5 ×2) → 34', () => expect(calc(2, 4, 6, 8)).toBe(34));
});

// ── 2. getReadinessLoadAdjustment — table complète + frontières ───────────────
describe('getReadinessLoadAdjustment — table 90/80/70/60/50/40', () => {
  const adj = (s) => vm.runInContext(`getReadinessLoadAdjustment(${s})`, makeCtx({}));
  test('paliers exacts : 90→1.03, 80→1.00, 70→0.97, 60→0.93, 50→0.90, 40→0.85, 39→0.80', () => {
    expect([90, 80, 70, 60, 50, 40, 39].map(adj)).toEqual([1.03, 1.00, 0.97, 0.93, 0.90, 0.85, 0.80]);
  });
  test('frontières basses : 89→1.00, 79→0.97, 69→0.93, 59→0.90, 49→0.85', () => {
    expect([89, 79, 69, 59, 49].map(adj)).toEqual([1.00, 0.97, 0.93, 0.90, 0.85]);
  });
});

// ── 3. _wpComputeWorkWeightPenalties — sommeil / rhrAlert ────────────────────
describe('_wpComputeWorkWeightPenalties — pénalités saisies (post-A1)', () => {
  const pen = (wb) => vm.runInContext("_wpComputeWorkWeightPenalties('Squat','hypertrophie',[])",
    makeCtx({ todayWellbeing: wb, exercises: {}, user: {}, weeklyPlan: null }));
  test('sleep ≤ 2 aujourd\'hui → sleepMult 0.95', () => expect(pen({ date: TODAY, sleep: 2 }).sleepMult).toBe(0.95));
  test('sleep 3 → 1.0 (seuil strict ≤ 2)', () => expect(pen({ date: TODAY, sleep: 3 }).sleepMult).toBe(1.0));
  test('date périmée → 1.0 même avec sleep 1', () => expect(pen({ date: '2020-01-01', sleep: 1 }).sleepMult).toBe(1.0));
  test('todayWellbeing null → sleepMult 1.0 et rhrMult 1.0', () => {
    const p = pen(null);
    expect(p.sleepMult).toBe(1.0);
    expect(p.rhrMult).toBe(1.0);
  });
  test('rhrAlert warning → 0.95 / danger → 0.80 / niveau inconnu → 1.0', () => {
    expect(pen({ date: TODAY, rhrAlert: { level: 'warning' } }).rhrMult).toBe(0.95);
    expect(pen({ date: TODAY, rhrAlert: { level: 'danger' } }).rhrMult).toBe(0.80);
    expect(pen({ date: TODAY, rhrAlert: { level: 'info' } }).rhrMult).toBe(1.0);
  });
  test('NB : rhrAlert est lu SANS contrôle de date (contrairement au sommeil)', () => {
    // Caractérisation : un rhrAlert d'hier (date périmée) pénalise quand même.
    expect(pen({ date: '2020-01-01', rhrAlert: { level: 'danger' } }).rhrMult).toBe(0.80);
  });
  test('cumul sleep 2 + danger → cumulPenalty 0.76 (0.95 × 0.80)', () => {
    expect(pen({ date: TODAY, sleep: 2, rhrAlert: { level: 'danger' } }).cumulPenalty).toBeCloseTo(0.76, 10);
  });
});

// ── 4. wpDetectPhase — branches saisies ──────────────────────────────────────
describe('wpDetectPhase — branche wellbeing (deload auto) et branche readiness (force)', () => {
  function phase(db) { const c = makeCtx(db); return { r: vm.runInContext('wpDetectPhase()', c), db: c.db }; }
  function mondayISO() {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const baseWP = () => ({ lastDeloadDate: mondayISO(),
    currentBlock: { blockStartDate: Date.now() - 2 * 86400000, phase: 'x', week: 1 } });

  test('(sleep+motivation)/2 = 40% < 45 → deload AUTOMATIQUE, avant tout le reste', () => {
    expect(phase({ user: { trainingMode: 'powerbuilding' }, todayWellbeing: { sleep: 2, motivation: 2 },
      weeklyPlan: null, logs: [] }).r).toBe('deload');
  });
  test('frontière : 50% (sleep 2 + motivation 3) → pas de deload → hypertrophie (S1 cycle)', () => {
    expect(phase({ user: {}, todayWellbeing: { sleep: 2, motivation: 3 },
      weeklyPlan: baseWP(), logs: [], readiness: [] }).r).toBe('hypertrophie');
  });
  test('motivation absente → garde falsy → branche sautée même avec sleep 1', () => {
    expect(phase({ user: {}, todayWellbeing: { sleep: 1 },
      weeklyPlan: baseWP(), logs: [], readiness: [] }).r).toBe('hypertrophie');
  });
  test('sans todayWellbeing → hypertrophie (cycle S1 powerbuilding intermédiaire)', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [], readiness: [] }).r).toBe('hypertrophie');
  });
  test('2 scores readiness < 50 → phase forcée \'force\' (cap APRE 0.92 > 0.85 — quirk S9 du C0)', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readiness: [{ date: TODAY, score: 45 }, { date: TODAY, score: 40 }] }).r).toBe('force');
  });
  test('1 seul score < 50 → reste hypertrophie', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readiness: [{ date: TODAY, score: 45 }] }).r).toBe('hypertrophie');
  });
  test('0 score bas → hypertrophie', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readiness: [{ date: TODAY, score: 80 }] }).r).toBe('hypertrophie');
  });
  test('PRIORITÉ : wellbeing < 45 ET 2 scores bas → deload gagne (early return)', () => {
    expect(phase({ user: {}, todayWellbeing: { sleep: 2, motivation: 2 }, weeklyPlan: baseWP(), logs: [],
      readiness: [{ date: TODAY, score: 45 }, { date: TODAY, score: 40 }] }).r).toBe('deload');
  });
  test('effet de bord figé : sync db.weeklyPlan.currentBlock.phase/week', () => {
    const r = phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readiness: [{ date: TODAY, score: 45 }, { date: TODAY, score: 40 }] });
    expect(r.db.weeklyPlan.currentBlock.phase).toBe('force');
    expect(r.db.weeklyPlan.currentBlock.week).toBe(1);
  });
});

// ── 5. getStressVolumeModifier ───────────────────────────────────────────────
describe('getStressVolumeModifier', () => {
  const stress = (wb) => vm.runInContext('getStressVolumeModifier()', makeCtx({ todayWellbeing: wb }));
  test('branche vivante : motivation ≤ 2 ET sleep ≤ 3 → 0.80', () => expect(stress({ motivation: 2, sleep: 3 })).toBe(0.80));
  test('frontières : motivation 2 + sleep 4 → 1.0 ; motivation 3 + sleep 3 → 1.0', () => {
    expect(stress({ motivation: 2, sleep: 4 })).toBe(1.0);
    expect(stress({ motivation: 3, sleep: 3 })).toBe(1.0);
  });
  test('fossile_stress_inerte — NUANCE vs diagnostic : la branche stress>=4 est VIVANTE '
    + 'au niveau fonction (→ 0.80) ; le fossile est au niveau SYSTÈME (aucun écrivain ne pose '
    + 'todayWellbeing.stress, cf. C2-diagnostic Q5.5)', () => {
    // Si un jour quelqu'un écrit le champ, la réduction s'activera silencieusement.
    expect(stress({ stress: 4 })).toBe(0.80);
    expect(stress({ stress: 5, motivation: 5, sleep: 5 })).toBe(0.80);
  });
  test('todayWellbeing null → 1.0', () => expect(stress(null)).toBe(1.0));
});

// ── 6. shouldDeload — critère 1 (wellbeing) ──────────────────────────────────
describe('shouldDeload critère 1 — wellbeing vs seuil adaptatif (fixe 45 si <10 saisies)', () => {
  const logs3 = [1, 3, 5].map((d) => ({ timestamp: Date.now() - d * 86400000, volume: 5000,
    exercises: [{ name: 'Squat', allSets: [{ weight: 100, reps: 5, rpe: 7, isWarmup: false }] }] }));
  const sd = (db) => vm.runInContext('shouldDeload(db.logs, "powerbuilding")', makeCtx(db));
  test('sleep 2 + motivation 2 (40 < 45) → needed:true, trigger \'srs\'', () => {
    const r = sd({ logs: logs3, user: { level: 'intermediaire' }, todayWellbeing: { sleep: 2, motivation: 2 }, readiness: [], weeklyPlan: null });
    expect(r.needed).toBe(true);
    expect(r.trigger).toBe('srs');
    expect(r.reason).toMatch(/sommeil 2\/5/);
  });
  test('frontière : sleep 2 + motivation 3 (50 ≥ 45) → critère 1 ne mord pas → needed:false', () => {
    expect(sd({ logs: logs3, user: { level: 'intermediaire' }, todayWellbeing: { sleep: 2, motivation: 3 }, readiness: [], weeklyPlan: null }).needed).toBe(false);
  });
  test('sleep 3 + motivation 3 → needed:false', () => {
    expect(sd({ logs: logs3, user: { level: 'intermediaire' }, todayWellbeing: { sleep: 3, motivation: 3 }, readiness: [], weeklyPlan: null }).needed).toBe(false);
  });
  test('sans todayWellbeing → needed:false (sur ces logs calmes)', () => {
    expect(sd({ logs: logs3, user: { level: 'intermediaire' }, todayWellbeing: null, readiness: [], weeklyPlan: null }).needed).toBe(false);
  });
  test('< 3 logs → needed:false même avec wellbeing catastrophique', () => {
    expect(sd({ logs: [], user: {}, todayWellbeing: { sleep: 1, motivation: 1 }, readiness: [], weeklyPlan: null }).needed).toBe(false);
  });
});

// ── 7. hasTodayReadiness / getTodayReadiness — le gate du modal ──────────────
describe('hasTodayReadiness / getTodayReadiness', () => {
  const gate = (db) => {
    const c = makeCtx(db);
    return { has: vm.runInContext('hasTodayReadiness()', c), get: vm.runInContext('getTodayReadiness()', c) };
  };
  test('aucune saisie → gate ouvert (false) et getToday null', () => {
    const g = gate({ user: {}, readiness: [] });
    expect(g.has).toBe(false);
    expect(g.get).toBeNull();
  });
  test('entrée du jour → gate fermé + entrée retournée', () => {
    const g = gate({ user: {}, readiness: [{ date: TODAY, score: 70 }] });
    expect(g.has).toBe(true);
    expect(g.get.score).toBe(70);
  });
  test('_readinessSkipDate du jour → gate fermé (sans entrée db.readiness)', () => {
    expect(gate({ user: { _readinessSkipDate: Date.now() }, readiness: [] }).has).toBe(true);
  });
  test('_readinessSkipDate d\'avant-hier (-30h) → gate ouvert', () => {
    expect(gate({ user: { _readinessSkipDate: Date.now() - 30 * 3600000 }, readiness: [] }).has).toBe(false);
  });
  test('double_saisie_possible_actuellement : Bilan du matin rempli (todayWellbeing) '
    + 'ne ferme PAS le gate → le modal readiness redemande sommeil/motivation le même jour', () => {
    expect(gate({ user: {}, readiness: [],
      todayWellbeing: { date: TODAY, sleep: 3, motivation: 3 } }).has).toBe(false);
  });
});

// ── 8. computeAdaptiveSRSThreshold + LP Fast-Track ───────────────────────────
describe('computeAdaptiveSRSThreshold + LP Fast-Track débutant', () => {
  const thr = (scores) => vm.runInContext('computeAdaptiveSRSThreshold()',
    makeCtx({ readiness: scores.map((s, i) => ({ date: '2026-05-' + String(1 + (i % 28)).padStart(2, '0'), score: s })) }));
  test('< 10 saisies → seuil fixe 45, mode \'fixed\'', () => {
    expect(thr([60, 70, 80, 75, 65])).toEqual({ threshold: 45, mode: 'fixed', sessions: 5 });
  });
  test('12 saisies homogènes (σ=0) → seuil = moyenne (quirk : tout score sous SA moyenne déclenche)', () => {
    const r = thr(Array(12).fill(70));
    expect(r).toEqual({ threshold: 70, mean: 70, sigma: 0, mode: 'provisional', sessions: 12 });
  });
  test('30 saisies variées (μ70, σ14.1) → seuil μ−1.5σ = 49, mode \'stable\'', () => {
    const r = thr([90, 80, 70, 60, 50, 90, 80, 70, 60, 50, 90, 80, 70, 60, 50, 90, 80, 70, 60, 50, 90, 80, 70, 60, 50, 90, 80, 70, 60, 50]);
    expect(r.threshold).toBe(49);
    expect(r.mode).toBe('stable');
  });

  const ft = (scores) => {
    const logsFT = [{ timestamp: Date.now() - 2 * 86400000, exercises: [{ name: 'Développé couché',
      allSets: [{ weight: 80, reps: 10, isWarmup: false }, { weight: 80, reps: 10, isWarmup: false }] }] }];
    const c = makeCtx({ user: { level: 'debutant', lpActive: true }, logs: logsFT,
      readiness: scores.map((s, i) => ({ date: '2026-05-' + String(1 + (i % 28)).padStart(2, '0'), score: s })) },
      { isFastTrackDebutant: () => true });
    return vm.runInContext("wpDoubleProgressionWeight('Développé couché', 8, 10)", c);
  };
  test('Fast-Track : moyenne 85 → +5kg (80 → 85)', () => {
    const r = ft(Array(30).fill(85));
    expect(r.weight).toBe(85);
    expect(r.coachNote).toMatch(/\+5kg/);
  });
  test('SURPRISE figée : moyenne 84.9 → +5kg quand même (la moyenne est ARRONDIE avant '
    + 'le seuil 85 — frontière effective 84.5, pas 85)', () => {
    const m = Array(30).fill(85); m[0] = 82; // moyenne exacte 84.9 → Math.round → 85
    expect(ft(m).weight).toBe(85);
  });
  test('moyenne 84.4 → arrondie 84 → dégradé +2.5kg (80 → 82.5)', () => {
    const m = Array(30).fill(85); for (let i = 0; i < 6; i++) m[i] = 82; // moyenne 84.4
    const r = ft(m);
    expect(r.weight).toBe(82.5);
    expect(r.coachNote).toMatch(/dégradé/);
  });
});

// ── 9. convertWorkoutToSession — non-persistance de la readiness ─────────────
describe('convertWorkoutToSession', () => {
  test('readiness_non_persiste_actuellement : activeWorkout.readiness N\'est PAS copié '
    + 'dans la session (C2-b inversera sciemment ce test en branchant la persistance)', () => {
    const c = makeCtx({ logs: [], user: {} });
    const session = vm.runInContext(
      "convertWorkoutToSession({ title: 'T', startTime: Date.now() - 3600000, exercises: [], readiness: { score: 72, loadAdjustment: 0.97 } })", c);
    expect(session.readiness).toBeUndefined();
    expect(Object.keys(session)).not.toContain('readiness');
  });
  test('sanity : la session produite garde titre/durée/volume', () => {
    const c = makeCtx({ logs: [], user: {} });
    const session = vm.runInContext(
      "convertWorkoutToSession({ title: 'T', startTime: Date.now() - 3600000, exercises: [] })", c);
    expect(session.title).toBe('T');
    expect(session.durationSource).toBe('go');
    expect(session.volume).toBe(0);
  });
});
