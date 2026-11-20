/**
 * @jest-environment node
 */
// Un essai de test RATÉ (0 rep) garde son type `test` (#727, D-ST1) mais n'est pas une série de travail :
// ni volume, ni « exercice fait ». La question du zéro et `faitsDeTest` le voient encore.
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');

const serie = (o) => Object.assign({ id: 's', session_id: 'x', exercise_slug: 'dc', type_serie: 'travail', charge_kg: 100 }, o);
const CAT = [{ slug: 'dc', nom: 'Développé couché', muscles_primaires: ['pectoraux'], muscles_secondaires: [] }];

describe('essai de test raté hors volume', () => {
  test('estTravail : test à 1 rep vrai, test à 0 rep faux, test sans reps (prévu) vrai', () => {
    expect(Modele.estTravail(serie({ type_serie: 'test', reps: 1 }))).toBe(true);
    expect(Modele.estTravail(serie({ type_serie: 'test', reps: 0 }))).toBe(false);
    expect(Modele.estTravail(serie({ type_serie: 'test', reps: null }))).toBe(true);
    expect(Modele.estTravail(serie({ type_serie: 'travail', reps: 5 }))).toBe(true);
  });
  test('le volume de la semaine ne compte pas l’essai raté', () => {
    const series = [serie({ type_serie: 'test', reps: 1 }), serie({ type_serie: 'test', reps: 0 }), serie({ reps: 5 })];
    const v = Semaine.volumeParMuscle(series, CAT);
    expect(v.find((m) => m.muscle === 'pectoraux').series).toBe(2);
  });
  test('la question du zéro et le type `test` voient encore l’essai raté', () => {
    const raté = serie({ type_serie: 'test', reps: 0 });
    expect(Modele.estTravailOuEssai(raté)).toBe(true);
    expect(Modele.estEssaiRate(raté)).toBe(true);
    expect(Modele.estTest(raté)).toBe(true);
  });
});
