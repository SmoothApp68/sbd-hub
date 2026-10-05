/** @jest-environment node */
//
// 49-U13 — le compteur dans le plan unique (MOTEUR §12.9) : calculé avec la
// consigne figée (`consigneDExercice`), lu par le plan, dit en gris dans
// l'en-tête et en une ligne de la feuille « Pourquoi » à 4 séances ou plus.
// Sous 4 : rien. Rien d'autre ne change — ni les lignes, ni les paris, ni la
// réaction.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const DEBUT = '2026-09-30T10:00:00+00:00';
const C = { etat: 'progression', zone: 'volume', palier: 25, niveau: 12, n: 3,
  ligne: { charge: 25, vise: 12 }, haut: null, fondement: {} };

function plan(compteur) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'curl', id, { series: 3 });
  const consigne = { consigne: C, libelles: M.libellesConsigne(C) };
  if (compteur !== undefined) consigne.compteur = compteur;
  const e = { seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { curl: consigne }, reglage: 'normal', paris: [], suites: {} };
  return { e, p: T.planDeSeance(e) };
}
const compteur = (k) => ({ compteur: k, meilleur: { palier: 25, niveau: 12 }, verdicts: [], blocages: [] });

describe('§12.9 — le compteur, lu par le plan', () => {
  test('à 4 séances : la phrase dans l’en-tête (gris) et dans la feuille « Pourquoi »', () => {
    const { e, p } = plan(compteur(4));
    const x = p.exercices[0];
    const phrase = '25 kg × 12 reste ta meilleure charge de travail depuis 4 séances.';
    expect(x.entete.compteur).toBe(phrase);
    expect(x.pourquoi.compteur).toBe(phrase);
    expect(x.compteur).toEqual({ compteur: 4, meilleur: { palier: 25, niveau: 12 } });
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('à 3 séances : rien', () => {
    const x = plan(compteur(3)).p.exercices[0];
    expect(x.entete.compteur).toBeNull();
    expect('compteur' in x.pourquoi).toBe(false);
  });

  test('une consigne sauvée avant ce chantier (sans compteur) : rien, et rien ne casse', () => {
    const { e, p } = plan(undefined);
    const x = p.exercices[0];
    expect(x.entete.compteur).toBeNull();
    expect(x.compteur).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('rien d’autre ne change : lignes, paris, réaction, en-tête jaune identiques', () => {
    const a = plan(compteur(6)).p.exercices[0];
    const b = plan(compteur(0)).p.exercices[0];
    expect(a.lignes).toEqual(b.lignes);
    // 49-U14 (MOTEUR §14.4) : chaque pari porte le compteur À L'OUVERTURE dans
    // son fondement — c'est la seule différence, et elle est voulue.
    const sansCompteur = (ps) => ps.map((q) => q && Object.assign({}, q,
      { fondement: Object.assign({}, q.fondement, { compteur: undefined }) }));
    expect(a.paris.map((q) => q && q.fondement.compteur)).toEqual([6, 6, 6]);
    expect(b.paris.map((q) => q && q.fondement.compteur)).toEqual([0, 0, 0]);
    expect(sansCompteur(a.paris)).toEqual(sansCompteur(b.paris));
    expect(a.message).toEqual(b.message);
    expect(a.entete.jaune).toEqual(b.entete.jaune);
    expect(a.entete.gris).toEqual(b.entete.gris);
  });

  // 4 pour le compteur (49-U13) ; 5 depuis 49-U18 (l'écart habituel sur les 8
  // derniers écarts, les reprises bornées à la zone, la charge plus lourde sur
  // 12 mois hors barre) ; 6 depuis 50-1 (le poids du corps suit la consigne des
  // charges, MOTEUR §9.17) — le compteur lui-même n'a pas changé de règle.
  test('VERSION_CONSIGNE vaut 6 (50-1)', () => {
    expect(M.VERSION_CONSIGNE).toBe(6);
  });
});
