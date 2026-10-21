// Lot B-2 — les 5 gaps catalogue existent (image non cassée) et TOUTES les valeurs
// des maps de substitution (BEGINNER / SHOULDER_HEAVY / MORPHO) pointent vers des noms
// EXO_DATABASE précis. Garantit « substitutions rebranchées → noms précis ».
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const exCtx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/exercises.js'), 'utf8') + '\n;this.DB=EXO_DATABASE;this.MAP=EXO_IMAGE_MAP;', exCtx);
const DB = exCtx.DB, IMG = exCtx.MAP;
const PRECISE = new Set(Object.values(DB).map(e => norm(e.name)));
const isPrecise = n => PRECISE.has(norm(n));
const idByName = n => Object.keys(DB).find(id => norm(DB[id].name) === norm(n));

const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
function bodyOf(src, name) {
  const m = src.match(new RegExp('^var ' + name + '\\s*=\\s*\\{', 'm'));
  const start = m.index + m[0].length - 1;
  let i = start, depth = 0, str = null;
  for (; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (str) { if (ch === '\\') i++; else if (ch === str) str = null; continue; }
    if (ch === '/' && nx === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && nx === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (!depth) break; }
  }
  return vm.runInNewContext('(' + src.slice(start, i + 1) + ')');
}

const GAPS = [
  { name: 'Soulevé de Terre Roumain (Haltère)', family: 'hinge', equipment: 'dumbbell' },
  { name: 'Élévation Latérale (Machine)', family: 'lateral-raise', equipment: 'machine' },
  { name: 'Low Bar Squat', family: 'squat', equipment: 'barbell' },
  { name: 'Block Pulls (10cm)', family: 'hinge', equipment: 'barbell' },
  { name: 'Développé Couché Prise Neutre (Haltère)', family: 'bench', equipment: 'dumbbell' }
];

describe('Lot B-2 — gaps catalogue créés', () => {
  test('les 5 entrées existent, précises, avec family/equipment attendus', () => {
    GAPS.forEach(g => {
      const id = idByName(g.name);
      expect(id).toBeDefined();
      expect(DB[id].family).toBe(g.family);
      expect(DB[id].equipment).toBe(g.equipment);
    });
  });

  test('image jamais cassée : chaque gap a un imageId (membre de sa family)', () => {
    GAPS.forEach(g => {
      const id = idByName(g.name);
      const img = DB[id].imageId || IMG[id];
      expect(img && img.length > 0).toBe(true);
    });
  });
});

describe('Lot B-2 — substitutions rebranchées vers des noms précis', () => {
  test('BEGINNER_SUBSTITUTES : toutes les valeurs sont précises', () => {
    const M = bodyOf(ENG, 'BEGINNER_SUBSTITUTES');
    const bad = Object.values(M).filter(v => !isPrecise(v));
    expect(bad).toEqual([]);
  });

  test('SHOULDER_HEAVY_ALTERNATIVES : toutes les valeurs sont précises', () => {
    const M = bodyOf(APP, 'SHOULDER_HEAVY_ALTERNATIVES');
    const bad = [...new Set(Object.values(M))].filter(v => !isPrecise(v));
    expect(bad).toEqual([]);
  });

  test('MORPHO_SUBSTITUTIONS : tous les .name de substitution sont précis', () => {
    const M = bodyOf(ENG, 'MORPHO_SUBSTITUTIONS');
    const names = [];
    Object.values(M).forEach(byType => Object.values(byType).forEach(sub => { if (sub && sub.name) names.push(sub.name); }));
    const bad = names.filter(n => !isPrecise(n));
    expect(bad).toEqual([]);
  });

  test('rebranchements spécifiques (anciens génériques → nouveaux noms précis)', () => {
    const BEG = bodyOf(ENG, 'BEGINNER_SUBSTITUTES');
    const SH = bodyOf(APP, 'SHOULDER_HEAVY_ALTERNATIVES');
    expect(BEG['Soulevé de Terre (Barre)']).toBe('Soulevé de Terre Roumain (Haltère)');
    expect(SH['Larsen Press']).toBe('Développé Couché Prise Neutre (Haltère)');
    expect(SH['Développé Militaire (Barre)']).toBe('Élévation Latérale (Machine)');
    // anti-collapse : convergente ≠ tirage convergente (valeur substitution bench)
    expect(SH['Développé Incliné (Haltères)']).toBe('Développé Convergent Machine');
  });
});
