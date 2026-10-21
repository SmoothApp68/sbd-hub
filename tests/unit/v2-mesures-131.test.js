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

// ── #8 et #9 — les bornes (ECRAN §3 ter.5, décidées le 21/10/2026) ─────────────
describe('audit 130 n°8 et n°9 — les bornes : jamais 0, la distance au plus 400 km', () => {
  const seance = () => ({ exercices: [{ exercise_slug: 'course', series: [SERIE({})] }] });
  const apres = (champs) => Seance.modifierSerie(seance(), 0, 0, champs).exercices[0].series[0];
  test('400 km passent ; 400,1 km ne s’écrivent pas', () => {
    expect(apres({ distance_km: '400' }).distance_m).toBe(400000);
    expect(apres({ distance_km: '400,1' }).distance_m).toBeNull();
    expect(apres({ distance_m: 400001 }).distance_m).toBeNull();
  });
  test('⚠️ 0 ne s’écrit jamais : ni une durée, ni une distance', () => {
    expect(apres({ distance_km: '0' }).distance_m).toBeNull();
    expect(apres({ duree: 0 }).duree_s).toBeNull();
    expect(apres({ duree_s: 0 }).duree_s).toBeNull();
    expect(apres({ duree: 1 }).duree_s).toBe(1);
    expect(apres({ distance_km: '0,5' }).distance_m).toBe(500);
  });
  test('une durée ou une distance à 0 déjà en base est une case vide au ✓', () => {
    const planche = Modele.gabaritDe({ mesure: 'temps' });
    expect(Seance.casesManquantes(planche, { duree_s: 0 }, {})).toEqual(['duree']);
    const course = Modele.gabaritDe({ mesure: 'distance_temps' });
    expect(Seance.casesManquantes(course, { duree_s: 0, distance_m: 0 }, {})).toEqual(['duree', 'distance_km']);
  });
  test('la réparation de la file borne pareil (une seule table)', () => {
    const r = Seance.bornerLigne({ duree_s: 1800, distance_m: 650000 });
    expect(r.change).toBe(true);
    expect(r.ligne.distance_m).toBeNull();
    expect(Seance.bornerLigne({ duree_s: 1800, distance_m: 5000 }).change).toBe(false);
  });
  test('le champ de saisie : la borne en kilomètres, rien pour la charge', () => {
    expect(Modele.maxDeSaisie('distance_km')).toBe(400);
    expect(Modele.maxDeSaisie('charge_kg')).toBeNull();
  });
});
