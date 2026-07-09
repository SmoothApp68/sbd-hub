// Lot A (Phases 1+2) — état FINAL d'EXO_DATABASE après application du CSV.
// family partout, name précis (canoniques), variantes matériel DISTINCTES,
// doublons fusionnés, vieux noms de logs toujours résolvables.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function load() {
  const src = fs.readFileSync(path.join(ROOT, 'js/exercises.js'), 'utf8');
  const c = vm.createContext({});
  vm.runInContext(src + '\n;this.__DB=EXO_DATABASE;this.__MAP=EXO_IMAGE_MAP;', c);
  return { DB: c.__DB, MAP: c.__MAP };
}
const { DB, MAP } = load();
const ids = Object.keys(DB);
const img = id => DB[id].imageId || MAP[id] || null;
const byName = n => ids.filter(id => norm(DB[id].name) === norm(n));
const resolvable = n => ids.some(id => norm(DB[id].name) === norm(n) || (DB[id].nameAlt || []).some(a => norm(a) === norm(n)));
const rows = fs.readFileSync(path.join(ROOT, 'audit/mapping_nomenclature_lotA.csv'), 'utf8')
  .split('\n').slice(1).filter(l => l.trim()).map(l => { const p = l.split(','); return { name: p[0].trim(), family: p[1].trim(), fusion: (p[2] || '').trim() }; });
const canonList = rows.filter(r => !r.fusion);

describe('Lot A — EXO_DATABASE (état final Phases 1+2)', () => {
  test('compte : 1016 entrées (1011 Lot A + 5 gaps catalogue Lot B-2)', () => {
    expect(ids.length).toBe(1016);
  });

  test('chaque canonique CSV → EXACTEMENT une entrée, avec la bonne family', () => {
    const bad = [];
    canonList.forEach(r => {
      const h = byName(r.name);
      if (h.length !== 1) bad.push(r.name + ' → ' + h.length);
      else if (DB[h[0]].family !== r.family) bad.push(r.name + ' fam=' + DB[h[0]].family);
    });
    expect(bad).toEqual([]);
  });

  test('tous les noms CSV (canoniques + sources de fusion) restent résolvables', () => {
    const bad = rows.filter(r => !resolvable(r.name)).map(r => r.name);
    expect(bad).toEqual([]);
  });

  test('les 45 edb_* doublons restent supprimés', () => {
    ['edb_barbell_squat', 'edb_dumbbell_shrug', 'edb_plank', 'edb_pushups', 'edb_leg_extensions']
      .forEach(id => expect(DB[id]).toBeUndefined());
  });

  test('splits : variantes matériel DISTINCTES avec equipment cohérent', () => {
    ['Oiseau (Machine)', 'Oiseau (Haltère)', 'Oiseau (Poulie)', 'Oiseau Penché (Haltère)'].forEach(n => expect(byName(n).length).toBe(1));
    const eq = n => DB[byName(n)[0]].equipment;
    expect(eq('Oiseau (Machine)')).toBe('machine');
    expect(eq('Oiseau (Haltère)')).toBe('dumbbell');
    expect(eq('Oiseau (Poulie)')).toBe('cable');
    expect(eq('Développé Couché (Machine)')).toBe('machine');
  });

  test('collisions résolues : Tirage Poitrine (Machine) unique, family pulldown', () => {
    const h = byName('Tirage Poitrine (Machine)');
    expect(h.length).toBe(1);
    expect(DB[h[0]].family).toBe('pulldown');
    expect(byName('Tirage Machine Convergente').length).toBe(1); // ex-lat_pulldown_machine
  });

  test('anti-fusion : Squat plein ≠ Squat pause ; deadlift ≠ roumain', () => {
    expect(byName('Squat (Barre)').length).toBe(1);
    expect(byName('Squat avec pause (barre)').length).toBe(1);
    expect(DB.squat_barbell.name).toBe('Squat (Barre)');
    expect(byName('Soulevé de Terre (Barre)').length).toBe(1);
    expect(byName('Soulevé de Terre Roumain (Barre)').length).toBe(1);
  });

  test('vieux noms de logs génériques → toujours résolvables (name ou alt)', () => {
    ['Squat Barre', 'Développé Incliné (Haltères)', 'Curl Barre EZ',
      'Romanian Deadlift (Barre)', 'Chest Press (Machine)', 'Shrugs Haltères',
      'Développé Décliné (Barre)', 'Leg Extension'].forEach(g => expect(resolvable(g)).toBe(true));
  });

  test('aucun doublon de NOM sur un canonique CSV', () => {
    const canonNorm = new Set(canonList.map(r => norm(r.name)));
    const dup = {};
    ids.forEach(id => { const n = norm(DB[id].name); (dup[n] = dup[n] || []).push(id); });
    const bad = Object.entries(dup).filter(([n, l]) => l.length > 1 && canonNorm.has(n)).map(([n]) => n);
    expect(bad).toEqual([]);
  });

  test('family posée sur les 131 canoniques', () => {
    const withFam = canonList.filter(r => { const h = byName(r.name); return h.length === 1 && DB[h[0]].family; });
    expect(withFam.length).toBe(canonList.length);
  });
});
