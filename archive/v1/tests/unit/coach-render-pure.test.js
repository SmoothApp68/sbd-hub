// Chantier Coach étape 1 — render lecture seule.
// vm-extraction de la vraie source app.js : applyTdeeAdjustment.
// Critère : le TDEE ne s'applique que sur clic, et POSE la valeur (non-cumulatif
// → réappliquer ne fait pas dériver la cible).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!m) throw new Error('NOT FOUND: ' + name);
  let depth = 0, i = src.indexOf('{', m.index), started = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}

function makeCtx(db) {
  const saved = [];
  const ctx = vm.createContext({
    db,
    saveDB: () => saved.push(1),
    showToast: () => {},
    renderCoachToday: () => {},
    __saved: saved
  });
  vm.runInContext(extractFn(APP, 'applyTdeeAdjustment'), ctx);
  return ctx;
}

describe('applyTdeeAdjustment — non-cumulatif, idempotent', () => {
  test('POSE la valeur (pas +=) : un clic → valeur exacte', () => {
    const db = { user: { tdeeAdjustment: 0 } };
    const ctx = makeCtx(db);
    vm.runInContext('applyTdeeAdjustment(150)', ctx);
    expect(db.user.tdeeAdjustment).toBe(150);
  });
  test('deux clics identiques → pas de dérive (150, pas 300)', () => {
    const db = { user: { tdeeAdjustment: 0 } };
    const ctx = makeCtx(db);
    vm.runInContext('applyTdeeAdjustment(150)', ctx);
    vm.runInContext('applyTdeeAdjustment(150)', ctx);
    expect(db.user.tdeeAdjustment).toBe(150);
  });
  test('remplace une valeur existante (ne s\'empile pas sur un offset antérieur)', () => {
    const db = { user: { tdeeAdjustment: -100 } };
    const ctx = makeCtx(db);
    vm.runInContext('applyTdeeAdjustment(150)', ctx);
    expect(db.user.tdeeAdjustment).toBe(150); // pas 50
  });
  test('valeur négative (séche) posée correctement + saveDB appelé', () => {
    const db = { user: { tdeeAdjustment: 0 } };
    const ctx = makeCtx(db);
    vm.runInContext('applyTdeeAdjustment(-150)', ctx);
    expect(db.user.tdeeAdjustment).toBe(-150);
    expect(vm.runInContext('__saved.length', ctx)).toBe(1);
  });
});

// ── Coach étape 2a : getVolumeByMuscleGroup exclut les warm-ups ──────────────
const ENGINE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');

describe('getVolumeByMuscleGroup — warm-ups exclus (double test)', () => {
  function run(exo) {
    // Stubs des dépendances (getMuscleGroup/getLogsInRange) — la fonction SOUS
    // TEST (getVolumeByMuscleGroup) est extraite de la vraie source ; on teste
    // son filtre warm-up, pas le mapping muscle.
    const ctx = vm.createContext({
      getLogsInRange: () => [{ exercises: [exo] }],
      getMuscleGroup: () => 'Quadriceps'
    });
    vm.runInContext(extractFn(ENGINE, 'getVolumeByMuscleGroup'), ctx);
    return vm.runInContext('getVolumeByMuscleGroup()', ctx);
  }
  test('sets setType=warmup NE sont plus comptés (ancien !isWarmup les comptait)', () => {
    const exo = { name: 'Squat (Barre)', allSets: [
      { setType: 'warmup', reps: 5 }, { setType: 'warmup', reps: 3 },
      { setType: 'normal', reps: 5 }, { setType: 'normal', reps: 5 }, { setType: 'normal', reps: 5 }
    ] };
    expect(run(exo).quads).toBe(3); // pas 5
  });
  test('isWarmup=true aussi exclu (les deux formats)', () => {
    const exo = { name: 'Squat (Barre)', allSets: [
      { isWarmup: true, reps: 5 }, { setType: 'normal', reps: 5 }, { setType: 'normal', reps: 5 }
    ] };
    expect(run(exo).quads).toBe(2);
  });
  test('exo sans allSets/series → 0 (fallback exo.sets MORT : `|| []` rend toujours un array)', () => {
    // Quirk préexistant NON introduit par ce fix : `exo.allSets || exo.series || []`
    // donne toujours un tableau → Array.isArray vrai → la branche exo.sets est
    // inatteignable. Observé, figé tel quel (signalé au rapport, hors scope).
    expect(run({ name: 'Squat (Barre)', sets: 4 }).quads).toBe(0);
  });
});

describe('getTopE1RMForLift — mono-formule Brzycki, warm-ups exclus, jamais NaN', () => {
  function run(logs, liftType) {
    const ctx = vm.createContext({ db: { logs }, console });
    vm.runInContext("const VARIANT_KEYWORDS=['pause','spoto','deficit','board'];", ctx);
    ['_getSBDTypeRaw', 'getSBDType'].forEach(fn => vm.runInContext(extractFn(ENGINE, fn), ctx));
    ctx._cache = { sbdType: new Map() };
    vm.runInContext(extractFn(APP, 'calcE1RM'), ctx);
    vm.runInContext(extractFn(ENGINE, 'getTopE1RMForLift'), ctx);
    return vm.runInContext('getTopE1RMForLift(' + JSON.stringify(liftType) + ')', ctx);
  }
  const mkLog = (exo) => ({ timestamp: 1000, exercises: [exo] });
  test('Brzycki cohérent (100×5 → 112), jamais NaN', () => {
    const v = run([mkLog({ name: 'Squat (Barre)', allSets: [{ weight: 100, reps: 5, setType: 'normal' }] })], 'squat');
    expect(v).toBe(113); // calcE1RM(100,5) observé
    expect(Number.isNaN(v)).toBe(false);
  });
  test('warm-ups (setType) exclus du calcul du top e1RM', () => {
    const v = run([mkLog({ name: 'Squat (Barre)', maxRM: 0, allSets: [
      { weight: 200, reps: 1, setType: 'warmup' },   // ne doit PAS compter
      { weight: 100, reps: 5, setType: 'normal' }
    ] })], 'squat');
    expect(v).toBe(113); // pas 200 (le warmup 200×1 est exclu)
  });
  test('ohp via regex toujours supporté', () => {
    const v = run([mkLog({ name: 'Overhead Press', allSets: [{ weight: 60, reps: 5, setType: 'normal' }] })], 'ohp');
    expect(v).toBe(calcRef(60, 5));
  });
  test('aucune donnée → null (pas NaN)', () => {
    expect(run([], 'bench')).toBeNull();
  });
});
function calcRef(w, r) { r = Math.min(r, 20); return r <= 1 ? w : Math.round(w / (1.0278 - 0.0278 * r)); }

// ── Coach étape 2b : getCoachCalibration (seuil hybride) ────────────────────
describe('getCoachCalibration — calibration Potentiel de Performance (âge OU base chronique)', () => {
  const DAY = 86400000;
  function run(logs) {
    const ctx = vm.createContext({ db: { logs }, _cache: { _sortedLogs: null } });
    vm.runInContext(extractFn(ENGINE, 'getSortedLogs'), ctx);
    vm.runInContext(extractFn(APP, 'getCoachCalibration'), ctx);
    return vm.runInContext('getCoachCalibration()', ctx);
  }
  const ago = (d) => ({ timestamp: Date.now() - d * DAY });
  test('0 log → calibrating (week 1, 21j restants)', () => {
    const c = run([]);
    expect(c.calibrating).toBe(true);
    expect(c.weekN).toBe(1);
    expect(c.daysRemaining).toBe(21);
  });
  test('5 jours d\'historique → calibrating, semaine 1', () => {
    const c = run([ago(5), ago(3), ago(1)]);
    expect(c.calibrating).toBe(true);
    expect(c.weekN).toBe(1);
  });
  test('25 jours + ≥3 logs chroniques (7-28j) → NON calibrating', () => {
    const c = run([ago(25), ago(20), ago(15), ago(10), ago(2)]);
    expect(c.calibrating).toBe(false);
    expect(c.daysRemaining).toBe(0);
  });
  test('import ancien (oldest il y a 2 ans) + base chronique → NON calibrating', () => {
    const c = run([ago(730), ago(20), ago(14), ago(9), ago(1)]);
    expect(c.calibrating).toBe(false);
  });
  test('1 log il y a 40j puis rien (0 chronique) → calibrating (l\'âge-seul ratait)', () => {
    const c = run([ago(40)]);
    expect(c.calibrating).toBe(true); // daysElapsed=40 mais chronicBaseLogs=0
  });
});

// ── Coach follow-up étape 1 : calcStreak(readOnly) ne mute rien ─────────────
describe('calcStreak(readOnly) — affichage pur (0 conso freeze, 0 write)', () => {
  const DAY = 86400000;
  function makeStreakCtx(db) {
    const synced = []; const toasts = [];
    const ctx = vm.createContext({
      db, syncToCloud: () => synced.push(1), showToast: (m) => toasts.push(m),
      __synced: synced, __toasts: toasts, window: {}
    });
    ['getISOWeekKey', '_mondayFromISOWeekKey', '_prevISOWeekKey'].forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
    vm.runInContext(extractFn(APP, 'calcStreak'), ctx);
    return ctx;
  }
  // Seed : semaines de séances consécutives récentes + un trou, avec des freezes.
  // (streak >= 4 + trou + freezes > 0 → l'ancien code consommait un freeze.)
  function seedWithGap() {
    const wk = (n) => Date.now() - n * 7 * DAY; // il y a n semaines
    return {
      logs: [wk(1), wk(2), wk(3), wk(4), wk(6)].map(ts => ({ timestamp: ts, exercises: [] })), // trou en semaine 5
      gamification: { streakFreezes: 2, freezeProtectedWeeks: [], freezesUsedAt: [] }
    };
  }
  test('readOnly=true : aucune écriture db, aucun freeze consommé, aucun sync/toast', () => {
    const db = seedWithGap();
    const ctx = makeStreakCtx(db);
    const before = JSON.stringify(db);
    const v = vm.runInContext('calcStreak(true)', ctx);
    expect(JSON.stringify(db)).toBe(before);          // db strictement inchangée
    expect(db.gamification.streakFreezes).toBe(2);    // freeze NON consommé
    expect(vm.runInContext('__synced.length', ctx)).toBe(0);
    expect(vm.runInContext('__toasts.length', ctx)).toBe(0);
    expect(db.weeklyStreak).toBeUndefined();          // pas d'écriture
    expect(typeof v).toBe('number');                  // valeur quand même retournée
  });
  test('défaut (mutant) : écrit weeklyStreak* — comportement historique préservé', () => {
    const db = seedWithGap();
    const ctx = makeStreakCtx(db);
    const v = vm.runInContext('calcStreak()', ctx);
    expect(db.weeklyStreak).toBe(v);                  // écrit la valeur
    expect(db.weeklyStreakRecord).toBe(v);            // high-water posé
  });
});
