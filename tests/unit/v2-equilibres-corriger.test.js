/** @jest-environment node */
//
// 27/11/2026 (MOTEUR §9.27) — « Je l'ai mal construit : je corrige ? » n'est proposé QUE si le programme refait passe le seuil de la
// carte, avec la marge du coach. Chaque fixture déclenche vraiment le chemin : un programme du coach sous le seuil (carte `malConstruit`),
// et un refait que l'on fait varier.

const H = require('./helpers-equilibres.js');
const { Eq, construire, entree, routine } = H;

const COMPL = { squat_barre: 4, souleve_de_terre_roumain: 2, leg_curl: 2, leg_extension: 4, hip_thrust: 2, oiseau: 1, elevations_laterales: 1, curl: 1, extension_triceps: 1 };
const carte = (a, cle) => a.cartes.filter((c) => c.cle === cle)[0] || null;
const sem = () => { const s = {}; for (let i = 0; i < 20; i++) s[i] = [{ routine: 'r-a', exos: Object.assign({ developpe_couche_barre: 4, rowing_barre: 2 }, COMPL) }]; return s; };
const Rm = routine('r-a', 'Haut A', { developpe_couche_barre: 4, rowing_barre: 2 });   // prévu : 2 pour 4 = 0,50 < 0,60
const ligne = (slug, series, reculs) => ({ exercise_slug: slug, series, reculs: reculs || 0 });
const refaitDe = (tir, pous, reculs) => [{ nom: 'Haut A', exercices: [ligne('developpe_couche_barre', pous), ligne('rowing_barre', tir, reculs)] }];
const analyse = (extra) => Eq.analyser(entree(construire(sem()), Object.assign({ routines: [Rm], programmeDuCoach: true }, extra)));
const corriger = (a) => (carte(a, 'tp-horizontal').propositions || []).some((p) => p.type === 'corriger');

describe('« corriger » seulement si la correction corrige', () => {
  test('la carte parle (programme du coach sous le seuil) : le décor est vrai', () => {
    const c = carte(analyse({ refait: () => refaitDe(4, 4) }), 'tp-horizontal');
    expect(c.coach.malConstruit).toBe(true);
  });
  test('un refait qui passe avec la marge : « corriger » est proposé', () => {
    expect(corriger(analyse({ refait: () => refaitDe(4, 4) }))).toBe(true);   // (4 − 1) / 4 = 0,75
  });
  test('⚠️ le refait IDENTIQUE au programme (le défaut mesuré) : pas de « corriger »', () => {
    expect(corriger(analyse({ refait: () => refaitDe(2, 4) }))).toBe(false);
  });
  test('un refait qui passe SANS marge mais pas avec : pas de « corriger » (3 pour 4 = 0,75, (3 − 1) / 4 = 0,50)', () => {
    expect(corriger(analyse({ refait: () => refaitDe(3, 4) }))).toBe(false);
  });
  test('le seuil de la carte : (a − 1) / b pile à 0,60 passe (4 pour 5 → 0,60)', () => {
    expect(corriger(analyse({ refait: () => refaitDe(4, 5) }))).toBe(true);
    expect(corriger(analyse({ refait: () => refaitDe(3, 5) }))).toBe(false);
  });
  test('les reculs comptent comme des séries de travail, et une liste de séries se lit comme la carte', () => {
    expect(corriger(analyse({ refait: () => refaitDe(2, 4, 2) }))).toBe(true);    // 2 + 2 reculs = 4
    const liste = [{ nom: 'Haut A', exercices: [{ exercise_slug: 'developpe_couche_barre', series: Array.from({ length: 4 }, () => ({ type_serie: 'travail' })) },
      { exercise_slug: 'rowing_barre', series: Array.from({ length: 4 }, () => ({ type_serie: 'travail' })) }] }];
    expect(corriger(analyse({ refait: () => liste }))).toBe(true);
  });
  test('rien de refait (catalogue absent, erreur, liste vide, pas de `refait`) : on ne promet pas', () => {
    expect(corriger(analyse({ refait: () => null }))).toBe(false);
    expect(corriger(analyse({ refait: () => [] }))).toBe(false);
    expect(corriger(analyse({ refait: () => { throw new Error('x'); } }))).toBe(false);
    expect(corriger(analyse({}))).toBe(false);
  });
  test('la carte reste un fait : sans « corriger », elle garde sa phrase et ses autres propositions possibles', () => {
    const c = carte(analyse({ refait: () => refaitDe(2, 4) }), 'tp-horizontal');
    expect(c.fait).toBe('Ton programme prévoit 1 série de tirage pour 2 de poussée.');
    expect(c.propositions.some((p) => p.type === 'corriger')).toBe(false);
  });
  test('le refait est calculé une fois par analyse, et jamais si aucune carte n’est sous la règle', () => {
    let n = 0;
    analyse({ refait: () => { n++; return refaitDe(4, 4); } });
    expect(n).toBeLessThanOrEqual(3);   // une fois par carte en écart au plus (le mémo est par rapport)
    let m = 0;
    const R = routine('r-a', 'Haut A', { developpe_couche_barre: 4, rowing_barre: 4 });
    Eq.analyser(entree(construire(sem()), { routines: [R], programmeDuCoach: true, refait: () => { m++; return refaitDe(4, 4); } }));
    expect(m).toBe(0);
  });
  test('la marge existe et se lit : MARGE_DU_COACH = 1', () => {
    expect(Eq.MARGE_DU_COACH).toBe(1);
  });
  test('un rapport inconnu ne plante pas', () => {
    expect(Eq.correctionCorrige({ e: { refait: () => refaitDe(4, 4) }, cat: {} }, undefined)).toBe(false);
  });
});
