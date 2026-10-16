/** @jest-environment node */
//
// ECRAN-SAISIE §3 bis.3 bis — prompts 100 puis 105 : aucune série ne se valide
// avec une case obligatoire vide. Au ✓, chaque case du gabarit (charge, reps,
// durée, distance, selon la mesure) vaut ce qui est tapé, sinon le chiffre gris
// du coach (le fantôme) ; ni l'un ni l'autre, elle manque. Une seule règle,
// `casesManquantes`, qui rend les cases manquantes dans l'ordre de la ligne (la
// première reçoit le clavier). Le cas du prompt 99 : en haut de zone, le test
// « le cran au-dessus × 3 » n'a pas de chiffre (fantôme charge null).

const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const g = (exo) => Modele.gabaritDe(exo);
const charge = g({ mesure: 'charge_reps' });
const vide = { charge_kg: null, reps: null, duree_s: null, distance_m: null };
const de = (o) => Object.assign({}, vide, o);
const manque = (gab, serie, f) => Seance.casesManquantes(gab, de(serie), de(f));

describe('105 — les cases obligatoires : une seule règle', () => {
  test('le cas du 99 : charge ni tapée ni proposée → elle manque', () => {
    expect(manque(charge, { reps: 3 }, { reps: 3 })).toEqual(['charge_kg']);
  });
  test('une charge tapée est validée ; 0 kg tapé est une charge', () => {
    expect(manque(charge, { charge_kg: 82.5, reps: 5 }, {})).toEqual([]);
    expect(manque(charge, { charge_kg: 0, reps: 5 }, {})).toEqual([]);
  });
  test('le fantôme du coach est validé, comme avant', () => {
    expect(manque(charge, {}, { charge_kg: 80, reps: 5 })).toEqual([]);
  });
  test('⚠️ reps vides sans fantôme : elles manquent (rouge)', () => {
    expect(manque(charge, { charge_kg: 80 }, { charge_kg: 80 })).toEqual(['reps']);
    expect(manque(g({ mesure: 'reps' }), {}, {})).toEqual(['reps']);
  });
  test('reps vides avec fantôme : le chiffre gris est validé', () => {
    expect(manque(charge, { charge_kg: 80 }, { reps: 8 })).toEqual([]);
    expect(manque(g({ mesure: 'reps' }), {}, { reps: 12 })).toEqual([]);
  });
  test('charge et reps vides ensemble : les deux, la charge d’abord (le clavier va sur elle)', () => {
    expect(manque(charge, {}, {})).toEqual(['charge_kg', 'reps']);
  });
  test('⚠️ une planche sans durée : la durée manque ; tapée ou grisée, elle passe', () => {
    const planche = g({ mesure: 'temps' });
    expect(manque(planche, {}, {})).toEqual(['duree']);
    expect(manque(planche, { duree_s: 45 }, {})).toEqual([]);
    expect(manque(planche, {}, { duree_s: 60 })).toEqual([]);
  });
  test('distance et durée : chacune est due ; la distance vide manque seule', () => {
    const course = g({ mesure: 'distance_temps' });
    expect(manque(course, { duree_s: 1800 }, {})).toEqual(['distance_km']);
    expect(manque(course, {}, { distance_m: 5000 })).toEqual(['duree']);
    expect(manque(course, {}, {})).toEqual(['duree', 'distance_km']);
    expect(manque(course, { duree_s: 1800 }, { distance_m: 5000 })).toEqual([]);
  });
  test('chauffe et dégressive : même règle', () => {
    expect(manque(charge, { type_serie: 'chauffe', reps: 5 }, {})).toEqual(['charge_kg']);
    expect(manque(charge, { type_serie: 'degressive', charge_kg: 40 }, {})).toEqual(['reps']);
  });
  test('lest et aide vides : sans lest, sans aide — mais les reps restent dues', () => {
    ['ajoutee', 'assistance'].forEach((c) => {
      const gab = g({ mesure: 'charge_reps', charge: c });
      expect(manque(gab, { reps: 8 }, {})).toEqual([]);
      expect(manque(gab, {}, {})).toEqual(['reps']);
    });
  });
  test('reps seules, durée, distance : jamais de charge demandée', () => {
    ['reps', 'temps', 'distance_temps'].forEach((m) => {
      expect(manque(g({ mesure: m }), {}, {})).not.toContain('charge_kg');
    });
  });
  test('mesure inconnue : on ne sait pas ce qu’il mesure, on n’empêche rien', () => {
    expect(manque(g({ mesure: 'zzz' }), {}, {})).toEqual([]);
  });
  test('une saisie illisible n’est pas un chiffre', () => {
    expect(manque(charge, { charge_kg: 'abc', reps: 5 }, {})).toEqual(['charge_kg']);
    expect(manque(charge, { charge_kg: '', reps: 5 }, {})).toEqual(['charge_kg']);
  });
});
