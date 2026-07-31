// Migration de type de db.routineExos — normalizeRoutineExosInPlace.
//
// Contexte : le fix du crash a rendu le LECTEUR défensif, mais le blob restait pollué
// d'objets chez les utilisateurs ayant cliqué « Appliquer au programme » avant le fix.
// Dès que routineExos sera signé par _computeDataHash (fix 2 de la tranche 1), ce blob
// repartirait vers Supabase : on propagerait la corruption au lieu de la contenir.
//
// Ces tests exécutent la vraie fonction (require de engine.js) et couvrent les quatre
// états réels d'un blob : pollué, propre, legacy chaîne, mixte.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { normalizeRoutineExosInPlace, getProgExosForDay } = require('../../js/engine.js');

const OBJ = (n) => ({ name: n, isPrimary: true, sets: [{ weight: 100, reps: 5 }] });

describe('blob POLLUÉ — les objets deviennent des noms', () => {
  test('un jour entier en objets', () => {
    const d = { routineExos: { Lundi: [OBJ('Squat (Barre)'), OBJ('Rowing Barre')] } };
    expect(normalizeRoutineExosInPlace(d)).toBe(true);
    expect(d.routineExos.Lundi).toEqual(['Squat (Barre)', 'Rowing Barre']);
  });

  test('plusieurs jours, seuls les pollués sont réécrits', () => {
    const propre = ['Squat (Barre)'];
    const d = { routineExos: { Lundi: [OBJ('Rowing Barre')], Mardi: propre } };
    expect(normalizeRoutineExosInPlace(d)).toBe(true);
    expect(d.routineExos.Lundi).toEqual(['Rowing Barre']);
    // Le jour déjà propre garde la MÊME référence : aucune réécriture inutile.
    expect(d.routineExos.Mardi).toBe(propre);
  });
});

describe('blob DÉJÀ PROPRE — no-op, aucune écriture', () => {
  test('rend false et ne touche à rien', () => {
    const jour = ['Squat (Barre)', 'Rowing Barre'];
    const d = { routineExos: { Lundi: jour } };
    expect(normalizeRoutineExosInPlace(d)).toBe(false);
    expect(d.routineExos.Lundi).toBe(jour);          // même référence : pas de réécriture
    expect(d.routineExos.Lundi).toEqual(['Squat (Barre)', 'Rowing Barre']);
  });

  test('idempotence : le 2e passage ne change plus rien', () => {
    const d = { routineExos: { Lundi: [OBJ('Squat (Barre)'), 'Rowing Barre'] } };
    expect(normalizeRoutineExosInPlace(d)).toBe(true);
    const apres = d.routineExos.Lundi;
    expect(normalizeRoutineExosInPlace(d)).toBe(false);
    expect(d.routineExos.Lundi).toBe(apres);
  });

  test('tableau vide : rend false, reste vide', () => {
    const d = { routineExos: { Lundi: [] } };
    expect(normalizeRoutineExosInPlace(d)).toBe(false);
    expect(d.routineExos.Lundi).toEqual([]);
  });
});

describe('blob LEGACY CHAÎNE — volontairement NON converti', () => {
  // Décision explicite : convertir la chaîne en tableau figerait le split sur virgule.
  // Tant qu'elle est stockée telle quelle, le nom d'origine reste récupérable.
  test('la chaîne est laissée intacte, octet pour octet', () => {
    const d = { routineExos: { Lundi: 'Développé couché, prise serrée' } };
    expect(normalizeRoutineExosInPlace(d)).toBe(false);
    expect(d.routineExos.Lundi).toBe('Développé couché, prise serrée');
  });

  test('le nom à virgule serait DÉTRUIT par une conversion — c\'est ce qu\'on évite', () => {
    // Ce que la lecture en fait aujourd'hui (perte réversible, la source est intacte) :
    global.db = { routineExos: { Lundi: 'Développé couché, prise serrée' } };
    expect(getProgExosForDay('Lundi')).toEqual(['Développé couché', 'prise serrée']);
    // Mais le stockage, lui, garde le nom entier — donc la perte reste réparable.
    expect(global.db.routineExos.Lundi).toBe('Développé couché, prise serrée');
    delete global.db;
  });
});

describe('blob MIXTE — chaînes conservées, objets normalisés', () => {
  test('chaînes + objets dans le même tableau', () => {
    const d = { routineExos: { Lundi: ['Squat (Barre)', OBJ('Rowing Barre'), 'Curl Biceps'] } };
    expect(normalizeRoutineExosInPlace(d)).toBe(true);
    expect(d.routineExos.Lundi).toEqual(['Squat (Barre)', 'Rowing Barre', 'Curl Biceps']);
  });

  test('les entrées sans nom exploitable sont SUPPRIMÉES (perte assumée)', () => {
    // Elles s'affichaient « Exercice » dans l'éditeur de routine ; elles ne matchent
    // aucun exercice et ne sont consommables par personne. La migration les retire —
    // c'est une suppression de donnée utilisateur, minuscule mais réelle.
    const d = { routineExos: { Lundi: ['Squat (Barre)', { sets: [] }, null, { name: 42 }] } };
    expect(normalizeRoutineExosInPlace(d)).toBe(true);
    expect(d.routineExos.Lundi).toEqual(['Squat (Barre)']);
  });

  test('les espaces parasites sont rognés', () => {
    const d = { routineExos: { Lundi: ['  Squat (Barre)  '] } };
    expect(normalizeRoutineExosInPlace(d)).toBe(true);
    expect(d.routineExos.Lundi).toEqual(['Squat (Barre)']);
  });
});

describe('entrées dégénérées — aucune levée', () => {
  test.each([
    ['db absent', undefined],
    ['db vide', {}],
    ['routineExos null', { routineExos: null }],
    ['routineExos chaîne', { routineExos: 'nawak' }],
  ])('%s → false, pas de crash', (_libelle, d) => {
    expect(() => normalizeRoutineExosInPlace(d)).not.toThrow();
    expect(normalizeRoutineExosInPlace(d)).toBe(false);
  });

  test('valeur ni tableau ni chaîne : laissée telle quelle, le lecteur rend []', () => {
    const d = { routineExos: { Lundi: { name: 'Squat' } } };
    expect(normalizeRoutineExosInPlace(d)).toBe(false);
    global.db = d;
    expect(getProgExosForDay('Lundi')).toEqual([]);
    delete global.db;
  });
});

// ── Les trois points d'appel doivent exister ────────────────────────────────
// Le comportement des call sites est prouvé au runtime (audit/runtime/
// migration-routineexos-preuve.js, M1/M5) : ici on verrouille seulement leur PRÉSENCE,
// parce qu'une migration branchée à un seul endroit est le mode d'échec réel — le boot
// seul est mesuré insuffisant, _applyCloudBlob écrasant le db migré.
describe('branchement — les trois points d\'entrée du db', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const SUPA = fs.readFileSync(path.join(ROOT, 'js', 'supabase.js'), 'utf8');

  // Assertions booléennes : un toMatch sur 33k lignes dumpe tout le fichier en cas d'échec.
  test('boot (app.js) appelle la migration', () => {
    expect(/normalizeRoutineExosInPlace\(db\)/.test(APP)).toBe(true);
  });

  test('_applyCloudBlob (supabase.js) appelle la migration', () => {
    const fn = SUPA.match(/function _applyCloudBlob[\s\S]*?\n\}/);
    expect(fn).not.toBeNull();
    expect(/normalizeRoutineExosInPlace\(db\)/.test(fn[0])).toBe(true);
  });

  test('le merge de pull (supabase.js) appelle la migration', () => {
    const bloc = SUPA.match(/db = _mergedData;[\s\S]{0,400}/);
    expect(bloc).not.toBeNull();
    expect(/normalizeRoutineExosInPlace\(db\)/.test(bloc[0])).toBe(true);
  });
});

// ── §6.3 — la carte GO ne doit plus lire routineExos en direct ──────────────
describe('§6.3 — buildGoIdleHtml passe par le lecteur défensif', () => {
  const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const fn = APP.match(/function buildGoIdleHtml\(\)[\s\S]*?\n\}/);

  test('buildGoIdleHtml existe', () => expect(fn).not.toBeNull());

  test('todayExos vient de getProgExosForDay, pas de db.routineExos[...]', () => {
    expect(/var todayExos = getProgExosForDay\(today\)/.test(fn[0])).toBe(true);
    expect(/todayExos = \(db\.routineExos/.test(fn[0])).toBe(false);
  });
});
