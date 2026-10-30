/** @jest-environment node */
//
// 193-1 (commit 5) — LES SÉRIES DE RECUL À L'ÉCRAN ET DANS LES GESTES : le raccourci « j'ai peu de temps », la série de plus d'une
// routine, la semaine allégée. (L'affichage lui-même — menu de type, aperçu, phrase, Pourquoi, constat — se vérifie sur téléphone.)

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const R = require('../../v2/js/routines.js');
const T = require('../../v2/js/plan.js');

const squat = (extra) => Object.assign({ slug: 'sq', mesure: 'charge_reps', repos: 180, ch: 2, tr: 1, deg: 0, rec: 3, duree: null,
  prim: ['quadriceps'], sec: [], stab: [], equipement: 'barre', groupe: null }, extra || {});
const curl = () => ({ slug: 'cu', mesure: 'charge_reps', repos: 90, ch: 0, tr: 3, deg: 0, rec: 0, duree: null,
  prim: ['biceps'], sec: [], stab: [], equipement: 'haltere', groupe: null });

describe('193-1 — le raccourci et les reculs', () => {
  test('les reculs comptent dans la durée estimée, comme des séries de travail', () => {
    const sans = M.dureeEstimee([squat({ rec: 0 })]);
    const avec = M.dureeEstimee([squat()]);
    expect((avec - sans) % 3).toBe(0);   // trois reculs identiques
    expect(avec).toBeGreaterThan(sans);
  });

  test('la structure d’une routine lit les reculs à part (jamais dans les séries de travail)', () => {
    const s = M.structureDeRoutine([{ exercise_slug: 'sq', repos_cible_s: 180, groupe_superset: null,
      series: [{ type_serie: 'echauffement' }, { type_serie: 'travail' }, { type_serie: 'recul' }, { type_serie: 'recul' }] }],
      { sq: { mesure: 'charge_reps', muscles_primaires: ['quadriceps'], equipement: 'barre' } });
    expect([s[0].ch, s[0].tr, s[0].rec]).toEqual([1, 1, 2]);
  });

  test('on retire un recul avant toute grosse série, jamais tous d’office', () => {
    const avant = [squat(), curl()];
    const d = M.dureeEstimee(avant);
    // une cible qui ne demande qu'un peu de temps : un recul de moins suffit
    const un = M.raccourcirRoutine(avant, Math.floor((d - 60) / 60));
    expect(un.exercices[0].rec).toBeLessThan(3);
    expect(un.exercices[0].tr).toBe(1);
    // une cible inatteignable par les seuls reculs : il en reste un
    const tout = M.raccourcirRoutine(avant, 1);
    expect(tout.exercices[0].rec).toBeGreaterThanOrEqual(1);
    expect(tout.journal.filter((j) => j.quoi === 'recul' && j.i === 0).length).toBeLessThanOrEqual(2);
  });

  test('appliquer le raccourci garde les reculs restants de la routine (jamais un type perdu)', () => {
    const routine = { exercices: [{ id: 'e1', exercise_slug: 'sq', repos_cible_s: 180, groupe_superset: null,
      series: [{ type_serie: 'travail' }, { type_serie: 'recul' }, { type_serie: 'recul' }, { type_serie: 'recul' }] }] };
    const resultat = { exercices: [{ ch: 0, tr: 1, deg: 0, rec: 2 }], journal: [] };
    const sortie = M.appliquerRaccourci(routine, resultat).routine;
    expect(sortie.exercices[0].series.map((s) => s.type_serie)).toEqual(['travail', 'recul', 'recul']);
  });
});

describe('193-1 — la série de plus et la semaine allégée', () => {
  test('la série de plus d’une routine copie la dernière série qui n’est pas un recul', () => {
    const routine = { exercices: [{ id: 'e1', exercise_slug: 'sq', series: [
      { type_serie: 'travail', reps: 4 }, { type_serie: 'recul', reps: 6 }, { type_serie: 'recul', reps: 6 }] }] };
    const sortie = R.ajoutDeSerie(routine, 'sq');
    expect(sortie.map((e) => e.series.map((s) => s.type_serie))[0]).toEqual(['travail', 'travail', 'recul', 'recul']);
  });

  test('une semaine allégée retire les reculs non validés, jamais un recul validé', () => {
    const plan = { allegee: { semaine: 1 }, exercices: [{ iExo: 0, consigne: { allegee: { series: 2 } }, lignes: [
      { iSerie: 0, type: 'travail', role: 'ligne', validee: true },
      { iSerie: 1, type: 'recul', role: 'hors', validee: true },
      { iSerie: 2, type: 'recul', role: 'hors', validee: false },
      { iSerie: 3, type: 'recul', role: 'hors', validee: false }] }] };
    expect(T.lignesARetirer(plan)).toEqual([{ iExo: 0, iSerie: 3 }, { iExo: 0, iSerie: 2 }]);
  });
});
