/** @jest-environment node */
//
// Prompt 100 — ECRAN-SAISIE §3 bis.3 bis : une série chargée ne se valide pas
// sans charge. Au ✓ : la charge tapée, sinon le fantôme ; ni l'une ni l'autre,
// pas de validation. Le cas du prompt 99 : en haut de zone, le test « le cran
// au-dessus × 3 » n'a pas de chiffre (fantôme charge null).

const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const g = (exo) => Modele.gabaritDe(exo);
const charge = g({ mesure: 'charge_reps' });

describe('chargeManquante', () => {
  test('le cas du 99 : ni tapée ni proposée → la série ne se valide pas', () => {
    expect(Seance.chargeManquante(charge, { charge_kg: null, reps: null }, { charge_kg: null, reps: 3 })).toBe(true);
  });
  test('une charge tapée est validée', () => {
    expect(Seance.chargeManquante(charge, { charge_kg: 82.5 }, { charge_kg: null })).toBe(false);
  });
  test('0 kg tapé est une charge', () => {
    expect(Seance.chargeManquante(charge, { charge_kg: 0 }, { charge_kg: null })).toBe(false);
  });
  test('le fantôme du coach est validé, comme avant', () => {
    expect(Seance.chargeManquante(charge, { charge_kg: null }, { charge_kg: 80 })).toBe(false);
  });
  test('chauffe et dégressive d’un exercice chargé : même règle', () => {
    expect(Seance.chargeManquante(charge, { type_serie: 'chauffe', charge_kg: null }, { charge_kg: null })).toBe(true);
    expect(Seance.chargeManquante(charge, { type_serie: 'degressive', charge_kg: null }, { charge_kg: null })).toBe(true);
  });
  test('sans charge : reps seules, durée, distance — jamais concernés', () => {
    ['reps', 'temps', 'distance_temps'].forEach((m) => {
      expect(Seance.chargeManquante(g({ mesure: m }), { charge_kg: null }, { charge_kg: null })).toBe(false);
    });
  });
  test('lest et aide vides : sans lest, sans aide — la série se valide', () => {
    expect(Seance.chargeManquante(g({ mesure: 'charge_reps', charge: 'ajoutee' }), { charge_kg: null }, { charge_kg: null })).toBe(false);
    expect(Seance.chargeManquante(g({ mesure: 'charge_reps', charge: 'assistance' }), { charge_kg: null }, { charge_kg: null })).toBe(false);
  });
  test('mesure inconnue : on ne sait pas s’il se charge, on n’empêche pas', () => {
    expect(Seance.chargeManquante(g({ mesure: 'zzz' }), { charge_kg: null }, { charge_kg: null })).toBe(false);
  });
});
