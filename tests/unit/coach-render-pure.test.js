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
