// Lot B — les templates du générateur émettent des noms PRÉCIS (EXO_DATABASE.name).
// Anti-collapse pause (variante ≠ lift plein), Dips selon slot, maps de lookup (Section D)
// résolvent les nouveaux noms. Parse le TEXTE des fichiers (comment-aware brace matching).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
const exCtx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/exercises.js'), 'utf8') + '\n;this.DB=EXO_DATABASE;', exCtx);
const DB = exCtx.DB;
const PRECISE = new Set(Object.values(DB).map(e => norm(e.name)));
const isPrecise = n => PRECISE.has(norm(n));

// Extrait le corps d'un `var NAME = { ... }` en ignorant commentaires et chaînes.
function bodyOf(src, name) {
  const m = src.match(new RegExp('^var ' + name + '\\s*=\\s*\\{', 'm'));
  if (!m) return null;
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
  return src.slice(start, i + 1);
}
function evalVar(src, name) { return vm.runInNewContext('(' + bodyOf(src, name) + ')'); }

// Récolte les noms d'exercices émis (obj templates: .name ; PPL: exercises[]).
function collectNames(o, out) {
  if (Array.isArray(o)) return o.forEach(x => collectNames(x, out));
  if (o && typeof o === 'object') {
    if (typeof o.name === 'string') out.push(o.name);
    for (const k in o) {
      if (k === 'exercises' && Array.isArray(o[k])) o[k].forEach(s => { if (typeof s === 'string') out.push(s); });
      else if (typeof o[k] === 'object') collectNames(o[k], out);
    }
  }
}

const EMITTERS = ['SBD_VARIANTS', 'WP_ACCESSORIES_BY_PHASE', 'WP_SESSION_TEMPLATES', 'WP_PPL_TEMPLATES'];
const emitted = [];
EMITTERS.forEach(v => collectNames(evalVar(APP, v), emitted));
const uniqEmitted = [...new Set(emitted)];

describe('Lot B — templates générateur émettent des noms précis', () => {
  test('chaque nom émis par les 4 templates existe comme EXO_DATABASE.name précis', () => {
    const bad = uniqEmitted.filter(n => !isPrecise(n));
    expect(bad).toEqual([]);
  });

  test('anti-collapse pause : la variante pause est émise, jamais le lift plein', () => {
    const N = new Set(uniqEmitted.map(norm));
    expect(N.has(norm('Squat avec pause (barre)'))).toBe(true);
    expect(N.has(norm('Soulevé De Terre avec pause'))).toBe(true);
    // les anciens noms génériques ne doivent plus être émis
    expect(N.has(norm('Squat Pause'))).toBe(false);
    expect(N.has(norm('Soulevé de Terre Pause'))).toBe(false);
    // le lift plein reste émis par ailleurs (non collapsé sur la pause)
    expect(N.has(norm('Squat (Barre)'))).toBe(true);
  });

  test('Dips résolu par slot : Dips Torse (pecs) et Dips Triceps (bras), jamais « Dips » nu', () => {
    const N = new Set(uniqEmitted.map(norm));
    expect(N.has(norm('Dips'))).toBe(false);
    expect(N.has(norm('Dips Torse'))).toBe(true);     // slot pecs (WP_ACCESSORIES/WP_SESSION bench)
    expect(N.has(norm('Dips Triceps'))).toBe(true);   // slot bras (WP_PPL push)
  });

  test('pas de collapse de variante : incliné ≠ plat, pause ≠ plein', () => {
    const N = new Set(uniqEmitted.map(norm));
    // le développé incliné est bien émis sous sa forme précise incliné (haltère)
    expect(N.has(norm('Développé Couché Incliné (Haltère)'))).toBe(true);
    // Squat plein et Squat pause coexistent, distincts
    expect(N.has(norm('Squat (Barre)')) && N.has(norm('Squat avec pause (barre)'))).toBe(true);
  });

  test('aucun générique connu ne subsiste dans les templates', () => {
    const generics = ['Bench Press (Barre)', 'Leg Extension', 'Mollets (Machine)', 'Tirage vers Visage',
      'Shrugs', 'High Bar Squat', 'Fentes', 'Gainage (Planche)', 'Tirage Vertical', 'Rowing Haltères',
      'Développé Incliné (Haltères)', 'Oiseau Machine', 'Écarté Machine', 'OHP (Barre)'];
    const N = new Set(uniqEmitted.map(norm));
    const leaked = generics.filter(g => N.has(norm(g)));
    expect(leaked).toEqual([]);
  });
});

describe('Lot B — Section D : les maps de lookup résolvent les nouveaux noms', () => {
  const CATS = evalVar(ENG, 'EXERCISE_CATEGORIES');
  const TRANSFER = evalVar(ENG, 'EXERCISE_TRANSFER_MATRIX');
  const STALE = evalVar(ENG, 'STALENESS_SUBSTITUTES');

  test('EXERCISE_CATEGORIES : pause = variation, Planche = cardio (pas de régression de rotation)', () => {
    expect(CATS['Squat avec pause (barre)']).toBe('variation');
    expect(CATS['Soulevé De Terre avec pause']).toBe('variation');
    expect(CATS['Planche']).toBe('cardio');
  });

  test('EXERCISE_TRANSFER_MATRIX : entrées pause présentes, distinctes du lift plein', () => {
    expect(TRANSFER['Squat avec pause (barre)']).toBeDefined();
    expect(TRANSFER['Squat avec pause (barre)'].family).toBe('squat');
    expect(TRANSFER['Squat avec pause (barre)'].ratio).toBeLessThan(TRANSFER['Squat (Barre)'].ratio);
    expect(TRANSFER['Soulevé De Terre avec pause'].family).toBe('hinge');
  });

  test('STALENESS_SUBSTITUTES : alias précis présents pour les accessoires renommés', () => {
    ['Extension Jambes', 'Leg Curl Allongé (Machine)', 'Extension Mollets Debout (Machine)',
      'Tirage Poitrine (Poulie)', 'Dips Triceps', 'Rowing Poulie Assis - Prise Large']
      .forEach(k => expect(Array.isArray(STALE[k]) && STALE[k].length > 0).toBe(true));
  });

  test('additif : les anciennes clés génériques restent présentes (0 régression ancien nom)', () => {
    expect(CATS['Squat Pause']).toBe('variation');
    expect(CATS['Gainage (Planche)']).toBe('cardio');
    expect(STALE['Leg Extension']).toBeDefined();
  });
});
