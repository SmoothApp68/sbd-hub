// Lot A — Phase 1 : family sur exacts non-entassés + suppression des 45 edb_* doublons.
// Charge le vrai EXO_DATABASE et le CSV, vérifie les invariants structurels.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function loadDB() {
  const src = fs.readFileSync(path.join(ROOT, 'js/exercises.js'), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(src + '\n;this.__DB=EXO_DATABASE;this.__MAP=EXO_IMAGE_MAP;', ctx);
  return { DB: ctx.__DB, MAP: ctx.__MAP };
}
const csvRows = fs.readFileSync(path.join(ROOT, 'audit/mapping_nomenclature_lotA.csv'), 'utf8')
  .split('\n').slice(1).filter(l => l.trim()).map(l => { const p = l.split(','); return { name: p[0], family: p[1], fusion: (p[2] || '').trim() }; });

describe('Lot A Phase 1 — EXO_DATABASE', () => {
  const { DB, MAP } = loadDB();
  const ids = Object.keys(DB);
  const familyByName = new Map(csvRows.map(r => [norm(r.name), r.family]));

  test('compte : 963 entrées (1008 − 45 edb_* doublons)', () => {
    expect(ids.length).toBe(963);
  });

  test('les 45 edb_* doublons d\'une entrée curée sont supprimés', () => {
    const gone = ['edb_barbell_squat', 'edb_dumbbell_shrug', 'edb_plank', 'edb_pushups',
      'edb_leg_extensions', 'edb_sumo_deadlift', 'edb_pullups', 'edb_seated_leg_curl'];
    gone.forEach(id => expect(DB[id]).toBeUndefined());
    // aucun edb_* restant ne doit partager un name avec une entrée curée
    const byName = {};
    ids.forEach(id => { const n = norm(DB[id].name); (byName[n] = byName[n] || []).push(id); });
    const stillDup = Object.values(byName).filter(l =>
      l.length > 1 && l.some(i => i.startsWith('edb_')) && l.some(i => !i.startsWith('edb_')));
    expect(stillDup).toEqual([]);
  });

  test('exercices distincts NON supprimés (substring edb ≠ doublon)', () => {
    // ces edb_* portent un nom unique → conservés
    expect(DB['edb_barbell_squat_to_a_bench']).toBeDefined();
    expect(DB['edb_pushups_close_and_wide_hand_positions']).toBeDefined();
  });

  test('family : toute entrée qui a un family a la valeur CSV correspondant à son name', () => {
    let withFamily = 0;
    ids.forEach(id => {
      if (!DB[id].family) return;
      withFamily++;
      const expected = familyByName.get(norm(DB[id].name));
      // family n'est posé que sur des entrées dont le name est un canonique CSV
      expect(expected).toBeDefined();
      expect(DB[id].family).toBe(expected);
    });
    expect(withFamily).toBeGreaterThanOrEqual(35);
  });

  test('family : assignations concrètes correctes', () => {
    expect(DB['plank'].family).toBe('plank');
    expect(DB['deadlift_sumo'].family).toBe('hinge');
    expect(DB['leg_curl_seated'].family).toBe('leg-curl');
    expect(DB['treadmill'].family).toBe('cardio');
    expect(DB['push_up'].family).toBe('push-up');
    expect(DB['hip_thrust_machine'].family).toBe('hip-thrust'); // clé id dupliquée : la gagnante a family
  });

  test('ports imageId : curées sans image ayant récupéré celle de l\'edb supprimé', () => {
    expect(DB['curl_barbell'].imageId).toBe('Barbell_Curl');
    expect(DB['jm_press'].imageId).toBe('JM_Press');
    expect(DB['spider_curl'].imageId).toBe('Spider_Curl');
  });

  test('anti-régression : les canoniques précis restent résolvables (nameAlt conservés)', () => {
    // Phase 1 ne renomme pas encore squat_barbell (Phase 2) : "Squat (Barre)" reste un nameAlt
    expect((DB['squat_barbell'].nameAlt || []).map(norm)).toContain(norm('Squat (Barre)'));
  });
});
