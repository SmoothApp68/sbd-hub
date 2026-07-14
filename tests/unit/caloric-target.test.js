// Audit justesse calorique — un seul comptage de l'activité.
// calcTDEE lit désormais db.user.goal (recompo −500…), PHASE_KCAL retiré,
// facteur d'activité cappé 1.6/1.7. getDailyCaloricTarget retire le bonus
// jour-séance. vm-extraction de la vraie source.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const ENG = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

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

// Profil aurel : 98 kg, 182 cm, 28 ans, homme.
function tdee(goal, sessions) {
  const ctx = vm.createContext({
    db: { user: { bw: 98, height: 182, age: 28, gender: 'male', goal, trainingMode: 'powerbuilding', tdeeAdjustment: 0 }, logs: [] },
    getLogsInRange: () => Array(sessions).fill({}),
    wpDetectPhase: () => 'hypertrophie'
  });
  vm.runInContext(extractFn(ENG, 'calcTDEE'), ctx);
  return vm.runInContext('calcTDEE(98, 0)', ctx);
}

describe('calcTDEE — objectif branché, un seul comptage', () => {
  test('aurel recompo 5 séances → ~2600-2700 (avant : ~3671 avec PHASE_KCAL+bonus)', () => {
    const v = tdee('recompo', 5);
    expect(v).toBeGreaterThan(2500);
    expect(v).toBeLessThan(2800);
  });
  test('recompo applique bien −500 vs maintien (même facteur)', () => {
    expect(tdee('maintien', 5) - tdee('recompo', 5)).toBe(500);
  });
  test('masse = surplus (+300 vs maintien)', () => {
    expect(tdee('masse', 5) - tdee('maintien', 5)).toBe(300);
  });
  test('sèche = déficit plus marqué (−600)', () => {
    expect(tdee('maintien', 5) - tdee('seche', 5)).toBe(600);
  });
  test('facteur cappé : 6+ séances → 1.7 (plus de 1.85)', () => {
    // BMR aurel = 10*98+6.25*182-5*28+5 = 1982.5 ; round(×1.7) = 3370 (observé)
    expect(tdee('maintien', 6)).toBe(3370);
    // 5 séances → 1.6 → round(1982.5*1.6) = 3172
    expect(tdee('maintien', 5)).toBe(3172);
  });
  test('PHASE_KCAL retiré : la phase n\'influe plus (goal seul pilote)', () => {
    const src = extractFn(ENG, 'calcTDEE');
    expect(src).not.toContain('var PHASE_KCAL'); // table de phase supprimée (le commentaire mentionne l'ex-nom)
    expect(src).toContain('GOAL_KCAL');
  });
});
