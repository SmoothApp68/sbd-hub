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
    'generateId', 'calcE1RM', 'convertWorkoutToSession',
    'hasTodayCheckin', 'saveDailyCheckin', // READY-C2-b : saisie unique
    '_normalizeCheckinEntry', 'getTodayCheckin', 'getCheckinHistory']; // READY-C2-c : couche d'accès
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
  // READY-C2-c : fixtures sommeil redirigées vers readinessHistory (sleep10 = 2×sleep5),
  // assertions inchangées. Les fixtures rhrAlert restent sur todayWellbeing (relogement = commit RHR).
  const pen = (wb, hist, gh) => vm.runInContext("_wpComputeWorkWeightPenalties('Squat','hypertrophie',[])",
    makeCtx({ todayWellbeing: wb, readinessHistory: hist || [], readiness: [],
      garminHealth: gh || null, exercises: {}, user: {}, weeklyPlan: null }));
  const H = (date, sleep10) => ({ ts: 1, date: date, sleep: sleep10, energy: 6, motivation: 6, soreness: 5, score: 50 });
  test('sleep ≤ 2 aujourd\'hui → sleepMult 0.95', () => expect(pen(null, [H(TODAY, 4)]).sleepMult).toBe(0.95));
  test('sleep 3 → 1.0 (seuil strict ≤ 2)', () => expect(pen(null, [H(TODAY, 6)]).sleepMult).toBe(1.0));
  test('date périmée → 1.0 même avec sleep 1', () => expect(pen(null, [H('2020-01-01', 2)]).sleepMult).toBe(1.0));
  test('aucune saisie → sleepMult 1.0 et rhrMult 1.0', () => {
    const p = pen(null);
    expect(p.sleepMult).toBe(1.0);
    expect(p.rhrMult).toBe(1.0);
  });
  // READY-C2-c : RHR relogé dans db.garminHealth — fixtures redirigées, niveaux inchangés.
  test('rhrAlert warning → 0.95 / danger → 0.80 / niveau inconnu → 1.0 (jour J)', () => {
    expect(pen(null, [], { date: TODAY, rhrAlert: { level: 'warning' } }).rhrMult).toBe(0.95);
    expect(pen(null, [], { date: TODAY, rhrAlert: { level: 'danger' } }).rhrMult).toBe(0.80);
    expect(pen(null, [], { date: TODAY, rhrAlert: { level: 'info' } }).rhrMult).toBe(1.0);
  });
  // READY-C2-c : test INVERSÉ sciemment (ex « rhrAlert lu SANS contrôle de date »).
  // Décision actée Phase 2 : l'alerte n'est valide que le jour de l'import.
  test('rhr_alert_expire_apres_24h : une alerte d\'un autre jour ne pénalise plus', () => {
    expect(pen(null, [], { date: '2020-01-01', rhrAlert: { level: 'danger' } }).rhrMult).toBe(1.0);
  });
  test('cumul sleep 2 + danger → cumulPenalty 0.76 (0.95 × 0.80)', () => {
    expect(pen(null, [H(TODAY, 4)], { date: TODAY, rhrAlert: { level: 'danger' } }).cumulPenalty).toBeCloseTo(0.76, 10);
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

  // READY-C2-c : fixtures wellbeing redirigées vers readinessHistory (x10 = 2×x5),
  // frontières STRICTEMENT identiques.
  test('(sleep+motivation)/2 = 40% < 45 → deload AUTOMATIQUE, avant tout le reste', () => {
    expect(phase({ user: { trainingMode: 'powerbuilding' },
      readinessHistory: [{ ts: 1, date: TODAY, sleep: 4, energy: 6, motivation: 4, soreness: 5, score: 40 }],
      weeklyPlan: null, logs: [] }).r).toBe('deload');
  });
  test('frontière : 50% (sleep 2 + motivation 3) → pas de deload → hypertrophie (S1 cycle)', () => {
    expect(phase({ user: {},
      readinessHistory: [{ ts: 1, date: TODAY, sleep: 4, energy: 6, motivation: 6, soreness: 5, score: 60 }],
      weeklyPlan: baseWP(), logs: [] }).r).toBe('hypertrophie');
  });
  test('motivation absente → garde falsy → branche sautée même avec sleep 1', () => {
    expect(phase({ user: {},
      readinessHistory: [{ ts: 1, date: TODAY, sleep: 2, energy: 6, soreness: 5, score: 60 }],
      weeklyPlan: baseWP(), logs: [] }).r).toBe('hypertrophie');
  });
  test('sans todayWellbeing → hypertrophie (cycle S1 powerbuilding intermédiaire)', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [], readiness: [] }).r).toBe('hypertrophie');
  });
  // READY-C2-c : fixtures redirigées vers readinessHistory (source unique) —
  // assertions STRICTEMENT inchangées.
  test('2 scores readiness < 50 → phase forcée \'force\' (cap APRE 0.92 > 0.85 — quirk S9 du C0)', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readinessHistory: [{ ts: 1, date: TODAY, score: 45 }, { ts: 2, date: TODAY, score: 40 }] }).r).toBe('force');
  });
  test('1 seul score < 50 → reste hypertrophie', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readinessHistory: [{ ts: 1, date: TODAY, score: 45 }] }).r).toBe('hypertrophie');
  });
  test('0 score bas → hypertrophie', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readinessHistory: [{ ts: 1, date: TODAY, score: 80 }] }).r).toBe('hypertrophie');
  });
  test('PRIORITÉ : wellbeing < 45 ET 2 scores bas → deload gagne (early return)', () => {
    expect(phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readinessHistory: [{ ts: 1, date: TODAY, score: 45 },
        { ts: 2, date: TODAY, sleep: 4, energy: 4, motivation: 4, soreness: 5, score: 40 }] }).r).toBe('deload');
  });
  test('effet de bord figé : sync db.weeklyPlan.currentBlock.phase/week', () => {
    const r = phase({ user: {}, weeklyPlan: baseWP(), logs: [],
      readinessHistory: [{ ts: 1, date: TODAY, score: 45 }, { ts: 2, date: TODAY, score: 40 }] });
    expect(r.db.weeklyPlan.currentBlock.phase).toBe('force');
    expect(r.db.weeklyPlan.currentBlock.week).toBe(1);
  });
});

// ── 5. getStressVolumeModifier ───────────────────────────────────────────────
describe('getStressVolumeModifier', () => {
  // READY-C2-c : branche vivante sur readinessHistory (x10), branche stress
  // fossile toujours sur todayWellbeing — assertions inchangées.
  const stress = (wb, hist) => vm.runInContext('getStressVolumeModifier()',
    makeCtx({ todayWellbeing: wb, readinessHistory: hist || [], readiness: [] }));
  const E = (m10, s10) => [{ ts: 1, date: TODAY, sleep: s10, energy: 6, motivation: m10, soreness: 5, score: 50 }];
  test('branche vivante : motivation ≤ 2 ET sleep ≤ 3 → 0.80', () => expect(stress(null, E(4, 6))).toBe(0.80));
  test('frontières : motivation 2 + sleep 4 → 1.0 ; motivation 3 + sleep 3 → 1.0', () => {
    expect(stress(null, E(4, 8))).toBe(1.0);
    expect(stress(null, E(6, 6))).toBe(1.0);
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
  // READY-C2-c : fixtures sur readinessHistory, conditions/frontières identiques.
  const W = (s10, m10) => [{ ts: 1, date: TODAY, sleep: s10, energy: 6, motivation: m10, soreness: 5, score: 60 }];
  test('sleep 2 + motivation 2 (40 < 45) → needed:true, trigger \'srs\'', () => {
    const r = sd({ logs: logs3, user: { level: 'intermediaire' }, readinessHistory: W(4, 4), readiness: [], weeklyPlan: null });
    expect(r.needed).toBe(true);
    expect(r.trigger).toBe('srs');
    expect(r.reason).toMatch(/sommeil 2\/5/);
  });
  test('frontière : sleep 2 + motivation 3 (50 ≥ 45) → critère 1 ne mord pas → needed:false', () => {
    expect(sd({ logs: logs3, user: { level: 'intermediaire' }, readinessHistory: W(4, 6), readiness: [], weeklyPlan: null }).needed).toBe(false);
  });
  test('sleep 3 + motivation 3 → needed:false', () => {
    expect(sd({ logs: logs3, user: { level: 'intermediaire' }, readinessHistory: W(6, 6), readiness: [], weeklyPlan: null }).needed).toBe(false);
  });
  test('sans saisie → needed:false (sur ces logs calmes)', () => {
    expect(sd({ logs: logs3, user: { level: 'intermediaire' }, todayWellbeing: null, readiness: [], weeklyPlan: null }).needed).toBe(false);
  });
  test('< 3 logs → needed:false même avec saisie catastrophique', () => {
    expect(sd({ logs: [], user: {}, readinessHistory: W(2, 2), readiness: [], weeklyPlan: null }).needed).toBe(false);
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
  // READY-C2-b : test INVERSÉ sciemment (ex `double_saisie_possible_actuellement`).
  // Le gate du modal est désormais hasTodayReadiness() || hasTodayCheckin() —
  // un check-in fait le matin (todayWellbeing/miroirs) supprime le modal pré-séance.
  test('double_saisie_impossible : un check-in du jour, quel que soit son store, '
    + 'ferme le gate unifié (hasTodayCheckin) → plus de double saisie', () => {
    const c = makeCtx({ user: {}, readiness: [],
      todayWellbeing: { date: TODAY, sleep: 3, motivation: 3 } });
    expect(vm.runInContext('hasTodayCheckin()', c)).toBe(true);
    // READY-C2-c : hasTodayReadiness est devenue une façade (skip OU
    // hasTodayCheckin) → true ici aussi. Assertion méta mise à jour dans le
    // même commit que la façade (ce n'était pas un seuil figé, cf. rapport).
    expect(vm.runInContext('hasTodayReadiness()', c)).toBe(true);
  });
});

// ── 8. computeAdaptiveSRSThreshold + LP Fast-Track ───────────────────────────
describe('computeAdaptiveSRSThreshold + LP Fast-Track débutant', () => {
  // READY-C2-c : fixtures sur readinessHistory — assertions inchangées
  const thr = (scores) => vm.runInContext('computeAdaptiveSRSThreshold()',
    makeCtx({ readiness: [], readinessHistory: scores.map((s, i) => ({ ts: i + 1, date: '2026-05-' + String(1 + (i % 28)).padStart(2, '0'), score: s })) }));
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
    const c = makeCtx({ user: { level: 'debutant', lpActive: true }, logs: logsFT, readiness: [],
      readinessHistory: scores.map((s, i) => ({ ts: i + 1, date: '2026-05-' + String(1 + (i % 28)).padStart(2, '0'), score: s })) },
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
  // READY-C2-b : test INVERSÉ sciemment (ex `readiness_non_persiste_actuellement`).
  // Décision Phase 2 : le check-in de séance est persisté dans le log final —
  // generateAlgoSessionDebrief (import.js) reçoit désormais un vrai objet.
  test('readiness_persistee_dans_session : activeWorkout.readiness EST copié dans la session', () => {
    const c = makeCtx({ logs: [], user: {} });
    const session = vm.runInContext(
      "convertWorkoutToSession({ title: 'T', startTime: Date.now() - 3600000, exercises: [], readiness: { sleep: 10, energy: 8, motivation: 6, soreness: 1, score: 88, loadAdjustment: 1.00 } })", c);
    expect(session.readiness).toEqual({ sleep: 10, energy: 8, motivation: 6, soreness: 1, score: 88, loadAdjustment: 1.00 });
  });
  test('pas de readiness sur la séance → pas de champ fantôme dans le log', () => {
    const c = makeCtx({ logs: [], user: {} });
    const session = vm.runInContext(
      "convertWorkoutToSession({ title: 'T', startTime: Date.now() - 3600000, exercises: [] })", c);
    expect(session.readiness).toBeUndefined();
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

// ── READY-C2-b/d — saisie quotidienne unique ─────────────────────────────────
describe('READY-C2-d — saveDailyCheckin (mapping 1-5 → Helms 1-10, source UNIQUE)', () => {
  function save(checkin, dbOver, extra) {
    const c = makeCtx(Object.assign({ readiness: [], readinessHistory: [],
      todayWellbeing: null, wellbeingHistory: [], user: {}, logs: [] }, dbOver || {}), extra || {});
    vm.runInContext('_checkinData = ' + JSON.stringify(checkin), c);
    const score = vm.runInContext('saveDailyCheckin()', c);
    return { score: score, db: c.db, ctx: c };
  }
  const ALL5 = { sleep: 5, energy: 5, motivation: 5, fresh: 5 };

  test('valeur de contrôle : tout à 5 → (10,10,10,1) → score 100', () => {
    expect(save(ALL5).score).toBe(100);
  });
  test('valeur de contrôle : tout à 1 → (2,2,2,9) → score 20', () => {
    expect(save({ sleep: 1, energy: 1, motivation: 1, fresh: 1 }).score).toBe(20);
  });
  test('valeur de contrôle : tout à 3 → (6,6,6,5) → score 60', () => {
    expect(save({ sleep: 3, energy: 3, motivation: 3, fresh: 3 }).score).toBe(60);
  });
  test('item manquant (3/4) → null, aucune écriture', () => {
    const r = save({ sleep: 5, energy: 5, motivation: 5 });
    expect(r.score).toBeNull();
    expect(r.db.readinessHistory.length).toBe(0);
  });
  test('readinessHistory : forme exacte {ts,date,sleep,energy,motivation,soreness,score,pain} '
    + '(strictement identique à C2-b)', () => {
    const r = save(Object.assign({}, ALL5, { fresh: 2, pain: 'Dos' }));
    const e = r.db.readinessHistory[0];
    expect(e.date).toBe(TODAY);
    expect(e.sleep).toBe(10); expect(e.energy).toBe(10); expect(e.motivation).toBe(10);
    expect(e.soreness).toBe(7); // fraîcheur 2 → 11 − 4
    expect(e.pain).toBe('Dos');
    expect(typeof e.ts).toBe('number');
    // forme exacte (clés inchangées vs C2-b)
    expect(Object.keys(e).sort()).toEqual(['date', 'energy', 'motivation', 'pain', 'score', 'sleep', 'soreness', 'ts']);
  });
  test('READY-C2-d : les miroirs db.readiness / todayWellbeing / wellbeingHistory NE sont '
    + 'PLUS écrits (source unique readinessHistory)', () => {
    const r = save(ALL5);
    expect(r.db.readiness).toEqual([]);        // store conservé en lecture, plus alimenté
    expect(r.db.todayWellbeing).toBeNull();    // plus de miroir
    expect(r.db.wellbeingHistory).toEqual([]); // write-only supprimé
    expect(r.db.readinessHistory.length).toBe(1); // seul store écrit
  });
  test('READY-C2-d : un import Garmin du jour (garminHealth) n\'est pas touché par le check-in', () => {
    const r = save(ALL5, { garminHealth: { date: TODAY, rhr: 52, rhrAlert: { level: 'warning' } } });
    expect(r.db.garminHealth).toEqual({ date: TODAY, rhr: 52, rhrAlert: { level: 'warning' } });
    expect(r.db.todayWellbeing).toBeNull();
  });
  test('séance active → activeWorkout.readiness posé (10-scale + loadAdjustment stocké non consommé)', () => {
    const r = save(ALL5, {}, { activeWorkout: {} });
    expect(r.ctx.activeWorkout.readiness).toEqual({ sleep: 10, energy: 10,
      motivation: 10, soreness: 1, score: 100, loadAdjustment: 1.03 });
  });
  test('saveDB appelé exactement 1×', () => {
    expect(save(ALL5).ctx._calls.saveDB).toBe(1);
  });
});

describe('READY-C2-b — hasTodayCheckin (gate unifié, 4 cas)', () => {  const has = (db) => vm.runInContext('hasTodayCheckin()', makeCtx(db));
  test('aucune saisie nulle part → false', () => {
    expect(has({ user: {}, readiness: [], readinessHistory: [], todayWellbeing: null })).toBe(false);
  });
  test('entrée du jour dans readinessHistory (cible) → true', () => {
    expect(has({ user: {}, readiness: [], readinessHistory: [{ date: TODAY, score: 80 }] })).toBe(true);
  });
  test('entrée du jour dans db.readiness (miroir) → true', () => {
    expect(has({ user: {}, readiness: [{ date: TODAY, score: 80 }], readinessHistory: [] })).toBe(true);
  });
  test('todayWellbeing du jour (rétrocompat déploiement) → true ; d\'hier → false', () => {
    expect(has({ user: {}, readiness: [], readinessHistory: [], todayWellbeing: { date: TODAY, sleep: 3 } })).toBe(true);
    expect(has({ user: {}, readiness: [], readinessHistory: [], todayWellbeing: { date: '2020-01-01', sleep: 3 } })).toBe(false);
  });
});

// ── READY-C2-c — couche d'accès unique ───────────────────────────────────────
describe('READY-C2-c — getTodayCheckin / getCheckinHistory', () => {
  const HIST_TODAY = { ts: Date.now(), date: TODAY, sleep: 8, energy: 6, motivation: 10, soreness: 7, score: 68, pain: 'Dos' };
  test('normalisation : les deux échelles calculées une fois (entrée C2-b paire)', () => {
    const c = makeCtx({ readinessHistory: [HIST_TODAY], readiness: [] });
    const e = vm.runInContext('getTodayCheckin()', c);
    expect(e).toEqual({ date: TODAY, ts: HIST_TODAY.ts, score: 68, pain: 'Dos',
      sleep10: 8, energy10: 6, motivation10: 10, soreness10: 7,
      sleep5: 4, energy5: 3, motivation5: 5, fraicheur5: 2 });
  });
  test('ancienne entrée sliders (impaire) → demi-points x5, acceptés (seuils ≤/<)', () => {
    const c = makeCtx({ readinessHistory: [{ ts: 1, date: TODAY, sleep: 5, energy: 7, motivation: 3, soreness: 4, score: 50 }], readiness: [] });
    const e = vm.runInContext('getTodayCheckin()', c);
    expect(e.sleep5).toBe(2.5);
    expect(e.fraicheur5).toBe(3.5);
    expect(e.pain).toBeNull(); // champ absent → null
  });
  test('fallback transitoire db.readiness (entrée pré-C2-b) quand readinessHistory n\'a pas le jour', () => {
    const c = makeCtx({ readinessHistory: [], readiness: [{ date: TODAY, sleep: 6, energy: 6, motivation: 6, soreness: 5, score: 60 }] });
    const e = vm.runInContext('getTodayCheckin()', c);
    expect(e.score).toBe(60);
    expect(e.sleep5).toBe(3);
  });
  test('aucune entrée du jour → null (une entrée d\'hier ne compte pas)', () => {
    const c = makeCtx({ readinessHistory: [{ ts: 1, date: '2020-01-01', sleep: 8, energy: 8, motivation: 8, soreness: 3, score: 80 }], readiness: [] });
    expect(vm.runInContext('getTodayCheckin()', c)).toBeNull();
  });
  test('getCheckinHistory : ordre chrono (tri ts) + slice(-n)', () => {
    const c = makeCtx({ readinessHistory: [
      { ts: 300, date: TODAY, sleep: 8, energy: 8, motivation: 8, soreness: 3, score: 80 },
      { ts: 100, date: '2026-06-10', sleep: 4, energy: 4, motivation: 4, soreness: 7, score: 35 },
      { ts: 200, date: '2026-06-11', sleep: 6, energy: 6, motivation: 6, soreness: 5, score: 60 },
    ], readiness: [] });
    const all = vm.runInContext('getCheckinHistory()', c);
    expect(all.map(e => e.score)).toEqual([35, 60, 80]);
    const last2 = vm.runInContext('getCheckinHistory(2)', c);
    expect(last2.map(e => e.score)).toEqual([60, 80]);
  });
  test('équivalence d\'échelle : sleep10=6 → sleep5=3 (les seuils 1-5 restent exprimables à l\'identique)', () => {
    const c = makeCtx({ readinessHistory: [{ ts: 1, date: TODAY, sleep: 6, energy: 6, motivation: 6, soreness: 5, score: 60 }], readiness: [] });
    const e = vm.runInContext('getTodayCheckin()', c);
    expect(e.sleep5).toBe(3);
    expect(e.sleep5 <= 2).toBe(false); // même verdict que l'ancien todayWellbeing.sleep(3) ≤ 2
  });
});
