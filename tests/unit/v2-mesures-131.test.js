/** @jest-environment node */
//
// Prompt 131 — les mesures, exercice par exercice (ECRAN-SAISIE §3 bis.3 bis, §3 ter.5,
// §7 septies.4 ; audit 130). Les tests des modules purs, un `describe` par point.

const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const SERIE = (o) => Object.assign({ exercise_slug: 'course', type_serie: 'travail',
  charge_kg: null, reps: null, duree_s: null, distance_m: null }, o);
const EXOS = [{ slug: 'course', nom: 'Course à Pied', mesure: 'distance_temps', charge: 'aucune' }];

// ── #5 — une série en distance seule ──────────────────────────────────────────
describe('audit 130 n°5 — une série en distance seule se montre', () => {
  test('la colonne « préc. » : la durée si elle est là, sinon la distance (jamais « — »)', () => {
    expect(Modele.formatPrecedent({ distance_m: 5000 }, 'distance_temps')).toBe('5 km');
    expect(Modele.formatPrecedent({ duree_s: 1800, distance_m: 5000 }, 'distance_temps')).toBe('30:00');
    expect(Modele.formatPrecedent({}, 'distance_temps')).toBe('—');
    // Sur `temps`, une distance égarée (un import) ne s'affiche pas : la mesure décide.
    expect(Modele.formatPrecedent({ distance_m: 5000 }, 'temps')).toBe('—');
  });
  test('la page d’exercice : sans aucune durée, la plus longue distance, avec son libellé', () => {
    const m = Modele.meilleureSerieDe('course',
      [SERIE({ distance_m: 5000 }), SERIE({ distance_m: 8200 }), SERIE({ distance_m: 3000 })], EXOS, null, {});
    expect(m.valeur).toBe('8,2 km');
    expect(m.libelle).toBe('Plus longue distance');
    expect(Modele.texteMeilleure(m)).toBe('8,2 km');
  });
  test('avec une durée, rien ne change : la plus longue durée, sa distance en complément, sans libellé', () => {
    const m = Modele.meilleureSerieDe('course',
      [SERIE({ distance_m: 9000 }), SERIE({ duree_s: 1800, distance_m: 5000 })], EXOS, null, {});
    expect(m.valeur).toBe('30 min');
    expect(m.complement).toBe('· 5 km');
    expect(m.libelle).toBeUndefined();
  });
});
