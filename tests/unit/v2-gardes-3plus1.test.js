/** @jest-environment node */
//
// 25/11/2026 — LES DEUX TROUS DE GARDE DU 3+1 (MOTEUR §9.53, I270 et I271) :
//   · I270 compte la ligne de puissance des 65 ans et plus ; quand elle est sur l'exercice elle prend la place du troisième élément, le compteur et le « Pendant ce temps » passent au « Pourquoi ? » ;
//   · I271 dit son exemption : une marche essayée (décision déjà prise) n'est jamais une carte de la file.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js'); require('../../v2/js/profil.js'); require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const POLY = { equipement: 'haltere', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['adducteurs'], muscles_stabilisateurs: [] };
function plan65(cpt, niveau, extra) {
  let n = 0; const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'goblet', id, { series: 3 });
  const debut = '2026-11-03T10:00:00+00:00';
  const K = { etat: 'progression', zone: 'mix', palier: 20, niveau, n: 3, ligne: { charge: 20, vise: 8 }, haut: null, fondement: { date: '2026-10-26T17:00:00.000Z', reps: [niveau, niveau, niveau] } };
  const e = Object.assign({ seance: { id: 'S1', debut, edition: false, exercices: se.exercices },
    consignes: { goblet: { consigne: K, libelles: M.libellesConsigne(K, debut), compteur: { compteur: cpt, meilleur: niveau, blocages: [] }, repli: null } },
    reglage: 'normal', paris: [], suites: {}, phase: 'maintien', catalogue: { goblet: POLY }, plus65: true, objectif: 'forme', menagerProfil: [],
    escalier: { cartes: [], compteurs: [], noms: { goblet: 'Squat goblet' }, seriesRoutine: { goblet: 3 }, marches: [] }, programme: { blocs: [], lignes: [] } }, extra || {});
  return { e, p: T.planDeSeance(e) };
}
const erreurs = (p, e, re) => T.verifierPlan(p, e).erreurs.filter((m) => re.test(m));

describe('I270 — la ligne de puissance des 65 ans et plus se compte (les 24 plans mesurés le 25/11/2026)', () => {
  const plans = [];
  [0, 2, 4, 6].forEach((cpt) => [false, true].forEach((_, bloc) => [4, 5, 6].forEach((niveau) => plans.push([cpt, bloc, niveau]))));
  test.each(plans)('compteur %i, variante %i, niveau %i : au plus 3 éléments, aucune erreur I269 à I271', (cpt, _b, niveau) => {
    const { e, p } = plan65(cpt, niveau); const x = p.exercices[0];
    expect(p.puissance && p.puissance.slug).toBe('goblet');
    expect(x.tete.puissance).toBe(true);
    expect(x.tete.tiers).toBeNull();
    const en = x.entete;
    expect(((en.jaune || []).length ? 1 : 0) + ((en.court || en.gris) ? 1 : 0) + (x.tete.tiers ? 1 : 0) + 1).toBeLessThanOrEqual(3);
    expect(erreurs(p, e, /^I2(69|7[01])/)).toEqual([]);
    // le compteur n'est pas caché : il est au « Pourquoi ? », avec ses mots
    if (en.compteur) expect(x.pourquoi.compteur).toBe(en.compteur);
  });
  test('un compteur de 4 séances : la tête ne le dit plus, le « Pourquoi ? » le dit mot pour mot', () => {
    const { p } = plan65(4, 5); const x = p.exercices[0];
    expect(x.entete.compteur).toMatch(/reste ta meilleure charge de travail depuis 4 séances/);
    expect(x.pourquoi.compteur).toBe(x.entete.compteur);
  });
  test('sans puissance (moins de 65 ans), le compteur garde la place du troisième élément', () => {
    const { e, p } = plan65(4, 5, { plus65: false }); const x = p.exercices[0];
    expect(x.tete.puissance).toBe(false); expect(x.tete.tiers).toBe('compteur');
    expect(erreurs(p, e, /^I27[01]/)).toEqual([]);
  });
  test('I270 refuse la puissance non comptée, et un compteur qui quitte la tête sans être au « Pourquoi ? »', () => {
    const { e, p } = plan65(4, 5); const x = p.exercices[0];
    x.tete.puissance = false;
    expect(erreurs(p, e, /^I270.*puissance/).length).toBeGreaterThan(0);
    x.tete.puissance = true; delete x.pourquoi.compteur;
    expect(erreurs(p, e, /^I270.*compteur quitte la tête/).length).toBeGreaterThan(0);
  });
  test('I270 compte 4 quand la tête garde le compteur ET la puissance', () => {
    const { e, p } = plan65(4, 5); const x = p.exercices[0];
    x.tete.tiers = 'compteur';
    expect(erreurs(p, e, /^I270/).length).toBeGreaterThan(0);
  });
});

describe('I271 — l’essai de la marche est une décision prise, jamais une carte de la file', () => {
  test('la marche essayée avec sa carte encore en attente est refusée ; sans carte, rien', () => {
    const { e, p } = plan65(0, 5, { plus65: false }); const x = p.exercices[0];
    x.essaiMarche = { texte: 'C’est fait', annuler: 'Annuler' };
    expect(erreurs(p, e, /^I271.*marche essayée/)).toEqual([]);
    x.carteMarche = { titre: 'm' }; T.tetesDuPlan(p, e);
    expect(x.file.carte).toBe('autre');
    expect(erreurs(p, e, /^I271.*marche essayée/).length).toBe(1);
  });
});
