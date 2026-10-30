/** @jest-environment node */
//
// 193-1 — LA « SÉRIE DE RECUL » (`sets.type_serie = 'recul'`, v2_120, MOTEUR §9.28).
//
// Commit 1 : le type et sa lecture. Une série de recul est une série de travail pour tout ce qui compte ce qui a été fait
// (volume, records), se lit `recul`, se dit « recul », et se programme dans une routine (jamais un type deviné : l'import Hevy
// n'a aucun mappage vers lui).

process.env.TZ = 'Europe/Paris';
global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const S = require('../../v2/js/seance.js');
const R = require('../../v2/js/routines.js');

const recul = (extra) => Object.assign({ charge_kg: 135, reps: 6, type_serie: 'recul', exercise_slug: 'sq' }, extra || {});

describe('193-1 — le type « recul » : la lecture', () => {
  test('connu du modèle, de la saisie et des routines', () => {
    expect(Modele.TYPES_CONNUS).toContain('recul');
    expect(S.TYPES).toContain('recul');
  });
  test('une série de recul est du travail pour les faits, se lit « recul » et se dit « recul »', () => {
    expect(Modele.estRecul(recul())).toBe(true);
    expect(Modele.estTravail(recul())).toBe(true);
    expect(Modele.typeLu(recul())).toBe('recul');
    expect(Modele.motDEchec(recul())).toBe('recul');
  });
  test('« Non, ne compte pas » l’emporte : un recul hors calcul n’est ni travail ni recul', () => {
    expect(Modele.estRecul(recul({ hors_calcul: true }))).toBe(false);
    expect(Modele.estTravail(recul({ hors_calcul: true }))).toBe(false);
  });
  test('les autres types restent ce qu’ils étaient', () => {
    expect(Modele.estRecul({ type_serie: 'travail' })).toBe(false);
    expect(Modele.estRecul({ type_serie: 'test' })).toBe(false);
    expect(Modele.estRecul(null)).toBe(false);
    expect(Modele.typeLu({ type_serie: 'test', charge_kg: 1, reps: 1 })).toBe('travail');
    expect(Modele.typeLu({ type_serie: 'degressive' })).toBe('degressive');
  });
  test('changerType accepte « recul »', () => {
    const seance = { exercices: [{ exercise_slug: 'sq', series: [{ type_serie: 'travail' }] }] };
    expect(S.changerType(seance, 0, 0, 'recul').exercices[0].series[0].type_serie).toBe('recul');
  });
  test('une routine garde le type « recul » (elle ne le convertit pas en travail) ; « test » n’y survit pas', () => {
    expect(R.enSaisie({ type_serie: 'recul' }).type_serie).toBe('recul');
    expect(R.enSaisie({ type_serie: 'test' }).type_serie).toBe('travail');
  });
  test('le volume compte une grosse et trois reculs comme quatre séries de travail', () => {
    const series = [{ type_serie: 'travail' }, recul(), recul(), recul()];
    expect(series.filter(Modele.estTravail).length).toBe(4);
  });
});
