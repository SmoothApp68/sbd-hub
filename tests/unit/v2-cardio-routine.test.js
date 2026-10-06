/** @jest-environment node */
//
// 54-1 — LA DURÉE DU CARDIO DESCEND EN SÉANCE (ECRAN-SAISIE §7 septendecies.3,
// delta F2). Elles suivent les reps : la routine d'abord (`duree_cible_s`,
// `distance_cible_m`), puis la dernière séance ; lues par le fantôme, jamais
// écrites dans la série.

require('../../v2/js/modele.js');
const S = require('../../v2/js/seance.js');

// La routine telle que l'app la donne à `Seance.creer` (`Routines.enSaisie`) :
// un tapis à 7 min / 600 m, une série de travail.
const ROUTINE = { id: 'r1', exercices: [{ exercise_slug: 'tapis',
  series: [{ type_serie: 'travail', reps: null, charge_kg: null, duree_s: 420, distance_m: 600 }] }] };
let n = 0;
const seance = () => S.creer({ id: 'S1', userId: 'u', routine: ROUTINE, idSerie: () => 's' + (++n) });

describe('54-1 — le tapis de la routine, en séance', () => {
  test('⚠️ DISCRIMINANT — jamais fait : le fantôme montre 07:00 et 600 m', () => {
    const f = S.fantome(seance(), 0, 0, null);
    expect([f.duree_s, f.distance_m]).toEqual([420, 600]);
  });

  test('⚠️ DISCRIMINANT — déjà fait à 10 min la dernière fois : toujours 07:00 (la routine d’abord)', () => {
    const prec = { series: [{ type_serie: 'travail', duree_s: 600, distance_m: 900, charge_kg: null, reps: null }] };
    const f = S.fantome(seance(), 0, 0, prec);
    expect([f.duree_s, f.distance_m]).toEqual([420, 600]);
  });

  test('sans durée dans la routine : la dernière séance, comme avant', () => {
    const r = { id: 'r2', exercices: [{ exercise_slug: 'tapis', series: [{ type_serie: 'travail', reps: null, charge_kg: null }] }] };
    const s = S.creer({ id: 'S2', userId: 'u', routine: r, idSerie: () => 's' + (++n) });
    const prec = { series: [{ type_serie: 'travail', duree_s: 600, distance_m: 900, charge_kg: null, reps: null }] };
    expect([S.fantome(s, 0, 0, prec).duree_s, S.fantome(s, 0, 0, prec).distance_m]).toEqual([600, 900]);
  });

  test('une intention, jamais une observation : la série reste vide, et rien ne part en base', () => {
    const s = seance();
    const serie = s.exercices[0].series[0];
    expect([serie.duree_s, serie.distance_m, serie.duree_cible_s, serie.distance_cible_m]).toEqual([null, null, 420, 600]);
    expect(S.COLONNES_SET).not.toContain('duree_cible_s');
    expect(S.COLONNES_SET).not.toContain('distance_cible_m');
  });
});
