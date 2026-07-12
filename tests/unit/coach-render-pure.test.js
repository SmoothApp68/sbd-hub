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
