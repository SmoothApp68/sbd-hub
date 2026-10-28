/** @jest-environment node */
//
// 174 (3/3) — SOUS 3 REPS, SIX SÉANCES SANS MONTER : LA ZONE 3-5 EST PROPOSÉE (MOTEUR §9.1.2, décision d'Aurélien du 26/10/2026).
//
//   1  le compte long de la règle de bord : six séances sans dépasser le record ; la vague ne le remet pas à zéro ;
//   2  la carte du schéma, réutilisée : « 140 kg × 2 depuis 6 séances, malgré le recul. », « Passer à 3-5 reps » / « Garder les doubles » ;
//   3  une fois par blocage, à la sixième séance exactement ; le silence dans un bloc de programme en cours (I39) ;
//   4  la réserve n'y est pour rien : noter 0 en réserve ne change pas le compte ; I67.
//
// Chaque cas passe par `consigneDExercice` (comme l'app) puis `planDeSeance`.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

let n = 0;
const brute = (kg, reps, ressenti) => ({
  id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null,
  ressenti: ressenti === undefined ? null : ressenti, type_serie: 'travail', exercise_slug: 'dc'
});
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
function groupes(liste) {
  return liste.map(([kg, reps, ressenti], i) => ({
    seance: { id: 'H' + i, debut: jourN(i) },
    series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((r, j, tout) =>
      brute(kg, r, j === tout.length - 1 ? ressenti : null))
  }));
}
const avantDe = (liste) => new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
const envelope = (liste) => M.consigneDExercice(groupes(liste), undefined, avantDe(liste), OPTIONS);

// Un record à 140 × 2, puis `k` séances sans le dépasser (la première ratée, les suivantes à 137,5 : un recul, puis la vague).
const RECORD = [[130, 2], [132.5, 2], [135, 2], [137.5, 2], [140, 2]];
const APRES = [[140, [1, 1, 1]], [137.5, 2], [137.5, 2], [137.5, 2], [137.5, 2], [137.5, 2], [137.5, 2]];
const histoire = (k) => RECORD.concat(APRES.slice(0, k));
const plat = (s) => String(s).replace(/[  ]/g, ' ');

function decor(liste, opt) {
  const o = opt || {};
  let i = 0;
  const id = () => 's' + (++i);
  let se = S.creer({ id: o.seance || 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  const c = envelope(liste);
  const e = { seance: { id: o.seance || 'S1', debut: avantDe(liste), edition: false, exercices: se.exercices },
    consignes: { dc: c }, reglage: 'normal', paris: [], suites: {}, phase: o.phase || 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { dc: 'Développé Couché (Barre)' }, seriesRoutine: { dc: 3 },
                marches: o.marches || [] },
    programme: o.blocs ? { blocs: o.blocs, lignes: [] } : undefined };
  return { e, p: T.planDeSeance(e), c };
}
const sansErreur = (d) => expect(T.verifierPlan(d.p, d.e).erreurs).toEqual([]);

describe('174 (3/3) — le compte long de la règle de bord', () => {
  test('cinq séances sans monter : rien ; six : le compte est là', () => {
    expect(envelope(histoire(5)).bord).toBeNull();
    const b = envelope(histoire(6)).bord;
    expect(b).toMatchObject({ total: 6, charge: 140, reps: 2, aRecule: true });
  });

  test('DISCRIMINANT — la vague (trois séances sans monter) ne remet PAS le compte à zéro', () => {
    // La vague tombe à la 3e séance ; le compte long continue jusqu\'à 6.
    expect(envelope(histoire(3)).consigne.etat).toBe('bord_vague');
    expect(envelope(histoire(6)).bord.total).toBe(6);
  });

  test('un nouveau record remet le compte à zéro', () => {
    const l = histoire(5).concat([[142.5, 2]]);
    expect(envelope(l).bord).toBeNull();
    expect(envelope(l.concat(APRES.slice(1, 6))).bord).toBeNull();
  });

  test('la réserve n\'y est pour rien : les mêmes séances à 0 en réserve donnent le même compte', () => {
    const noter = (l) => l.map(([kg, reps]) => [kg, reps, 'reste_0']);
    expect(envelope(noter(histoire(5))).bord).toBeNull();
    expect(envelope(noter(histoire(6))).bord.total).toBe(6);
  });

  test('un exercice avec une zone, ou au poids du corps, n\'a jamais ce compte', () => {
    const regulier = [[60, 8], [60, 8], [60, 8], [60, 8], [60, 8], [60, 8], [60, 8], [60, 8]];
    expect(envelope(regulier).bord).toBeNull();
  });
});

describe('174 (3/3) — la carte, réutilisée du schéma', () => {
  test('la phrase, le détail et les boutons de la décision', () => {
    const c = M.carteBordSchema(envelope(histoire(6)).bord);
    expect(plat(c.phrase)).toBe('140 kg × 2 depuis 6 séances, malgré le recul.');
    expect(c.detail).toBe('Quelques semaines en 3-5 reps peuvent relancer la barre, avant d\'y revenir.');
    expect([c.oui, c.non]).toEqual(['Passer à 3-5 reps', 'Garder les doubles']);
    expect([c.zone, c.nouvelle_zone]).toEqual([null, 'lourd']);
  });

  test('les simples se disent « les simples » ; sans recul, la phrase se termine sur le compte', () => {
    const c = M.carteBordSchema({ total: 6, charge: 100, reps: 1, aRecule: false });
    expect(plat(c.phrase)).toBe('100 kg × 1 depuis 6 séances.');
    expect(c.non).toBe('Garder les simples');
  });
});

describe('174 (3/3) — dans le plan', () => {
  test('DISCRIMINANT — à la sixième séance : la carte du schéma, vers la zone 3-5 ; I67 et les autres invariants tiennent', () => {
    const d = decor(histoire(6));
    const m = d.p.exercices[0].escalier;
    expect(m.marche).toBe('schema');
    expect(m.carte.nouvelle_zone).toBe('lourd');
    expect(plat(m.carte.phrase)).toBe('140 kg × 2 depuis 6 séances, malgré le recul.');
    sansErreur(d);
  });

  test('DISCRIMINANT — à cinq séances, aucune carte', () => {
    const d = decor(histoire(5));
    expect(d.p.exercices[0].escalier).toBeNull();
    sansErreur(d);
  });

  test('à la septième séance sans réponse : elle ne revient pas', () => {
    const d = decor(histoire(7));
    expect(d.p.exercices[0].escalier).toBeNull();
    sansErreur(d);
  });

  test('une fois par blocage : répondue dans la séance, la carte devient la réponse', () => {
    const rep = { seance: 'S1', jour: M.jourCivil(avantDe(histoire(6))), exercice: 'dc', marche: 'schema',
                  reponse: 'refusee', compteur: 6, debut: avantDe(histoire(6)), n: null };
    const d = decor(histoire(6), { marches: [rep] });
    const m = d.p.exercices[0].escalier;
    expect(m.carte).toBeUndefined();
    expect(m.reponse).toBe('refusee');
    sansErreur(d);
  });

  test('un exercice d\'un bloc de programme en cours : le silence (I39)', () => {
    const debut = M.jourCivil(avantDe(histoire(6)));
    const bloc = { id: 'b1', dossier: 'Force', zone: 'lourd', debut, semaines: 4, decharge: false,
                   statut: 'en_cours', exercices: ['dc'], precedent: null };
    const d = decor(histoire(6), { blocs: [bloc] });
    expect(d.p.exercices[0].escalier).toBeNull();
    sansErreur(d);
  });

  test('la réserve notée ne change rien : même carte avec ou sans', () => {
    const noter = (l) => l.map(([kg, reps]) => [kg, reps, 'reste_0']);
    expect(decor(noter(histoire(6))).p.exercices[0].escalier.marche).toBe('schema');
    expect(decor(noter(histoire(5))).p.exercices[0].escalier).toBeNull();
  });

  test('violations forgées : trop tôt, avec une zone, parle de réserve → I67', () => {
    const d = decor(histoire(6));
    const f = JSON.parse(JSON.stringify(d.p));
    f.exercices[0].escalier.bord.total = 4;
    expect(T.verifierPlan(f, d.e).erreurs.filter((x) => /^I67/.test(x)).length).toBe(1);
    const g = JSON.parse(JSON.stringify(d.p));
    g.exercices[0].consigne.zone = 'lourd';
    expect(T.verifierPlan(g, d.e).erreurs.filter((x) => /^I67/.test(x)).length).toBeGreaterThanOrEqual(1);
    const h = JSON.parse(JSON.stringify(d.p));
    h.exercices[0].escalier.carte.detail = 'Tu es allé à l\'échec.';
    expect(T.verifierPlan(h, d.e).erreurs.filter((x) => /^I67/.test(x)).length).toBe(1);
  });
});
