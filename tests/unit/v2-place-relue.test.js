/** @jest-environment node */
//
// G7 (27/11/2026, MOTEUR §14.7 ter, I281) — LA PLACE RELUE À CHAQUE SÉANCE. Une série de plus acceptée ne vit que tant que le muscle
// a de la place (la règle de volume, §14.6, la même qu'à la proposition), sans douleur récente ni zone à ménager sur l'exercice.
// Sinon elle s'arrête, une fois, en gris, avec sa raison ; une décision ne s'efface jamais en silence.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const C = { etat: 'progression', zone: 'volume', palier: 27, niveau: 12, n: 3,
  ligne: { charge: 27, vise: 12 }, haut: { charge: 29, vise: 12, k: 1 }, fondement: {} };
const MEILLEUR = { palier: 27, niveau: 12 };
const PLACE = { pectoraux: { place: true, moyenne: 8, seuil: 10, fenetres: 12 } };
const SANS_PLACE = { pectoraux: { place: false, moyenne: 12, seuil: 10, fenetres: 12 } };
const CAT = { pecs: { equipement: 'machine', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] } };
const acceptee = { seance: 'S0', jour: '2026-10-01', exercice: 'pecs', marche: 'serie_de_plus', reponse: 'acceptee', compteur: 4,
  debut: '2026-10-01T10:00:00+00:00', n: 3 };
const precedent = (nSeries) => ({ seance: { id: 'S0', debut: '2026-10-01T10:00:00+00:00' },
  series: Array.from({ length: nSeries }, () => ({ charge_kg: 27, reps: 12, type_serie: 'travail' })) });

function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S2', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'pecs', id, { series: 3 });
  const c = { consigne: C, libelles: M.libellesConsigne(C), compteur: { compteur: 5, meilleur: MEILLEUR, blocages: [] }, repli: null };
  const e = { seance: { id: 'S2', debut: '2026-10-04T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: { pecs: c }, reglage: 'normal', paris: [], suites: {}, phase: 'maintien', catalogue: CAT,
    volume: opt.volume === undefined ? PLACE : opt.volume,
    escalier: { cartes: [], compteurs: [{ exercice: 'pecs', jour: '2026-10-01', compteur: 4, seance: 'S0' }], noms: {},
                seriesRoutine: { pecs: 3 }, marches: [acceptee] } };
  if (opt.precedent) e.precedents = { pecs: opt.precedent };
  if (opt.douleurs) e.douleurs = opt.douleurs;
  if (opt.zonesMenagees) e.zonesMenagees = opt.zonesMenagees;
  return { e, p: T.planDeSeance(e) };
}
const erreurs281 = (p, e) => T.verifierPlan(p, e).erreurs.filter((y) => /^I281/.test(y));

describe('G7 — la fonction du moteur', () => {
  test('la raison de l\'arrêt, jamais un seuil nouveau', () => {
    expect(M.serieDePlusRelue({ place: true, douleur: false, menagee: false })).toBeNull();
    expect(M.serieDePlusRelue({ place: false })).toBe('volume');
    expect(M.serieDePlusRelue({ place: true, douleur: true })).toBe('douleur');
    expect(M.serieDePlusRelue({ place: true, menagee: true })).toBe('menagee');
    expect(M.serieDePlusRelue(null)).toBe('volume');
  });
  test('les trois phrases : un fait, « tu », la fin dite', () => {
    expect(M.phraseSerieDePlusArretee('volume')).toBe('Ton muscle n\'a plus de place cette semaine : la série de plus s\'arrête.');
    expect(M.phraseSerieDePlusArretee('douleur')).toMatch(/^Tu as eu mal ici récemment/);
    expect(M.phraseSerieDePlusArretee('menagee')).toMatch(/^Cette zone est à ménager/);
    expect(M.phraseSerieDePlusArretee('autre')).toBeNull();
  });
});

describe('G7 — dans le plan', () => {
  test('de la place : la série de plus continue (comportement inchangé)', () => {
    const { e, p } = decor({ precedent: precedent(4) });
    const x = p.exercices[0];
    expect(x.consigne.serieDePlus).toEqual({ routine: 3 });
    expect(x.entete.plus).toBe('une série de plus, jusqu\'à ton prochain progrès');
    expect(x.serieDePlusArretee).toBeNull();
    expect(erreurs281(p, e)).toEqual([]);
  });
  test('⚠️ DISCRIMINANT — le volume est monté (plus de place) : la série s\'arrête, une fois, en gris, avec sa raison', () => {
    const { e, p } = decor({ volume: SANS_PLACE, precedent: precedent(4) });
    const x = p.exercices[0];
    expect(x.consigne.serieDePlus).toBeUndefined();
    expect(T.lignesAAjouter(p)).toEqual([]);
    expect(x.serieDePlusArretee).toEqual({ raison: 'volume', phrase: 'Ton muscle n\'a plus de place cette semaine : la série de plus s\'arrête.' });
    expect(x.entete.plus).toBe(x.serieDePlusArretee.phrase);
    expect(erreurs281(p, e)).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('une fois seulement : la séance d\'avant n\'avait pas la ligne en plus, le coach se tait', () => {
    const { e, p } = decor({ volume: SANS_PLACE, precedent: precedent(3) });
    const x = p.exercices[0];
    expect(x.consigne.serieDePlus).toBeUndefined();
    expect(x.serieDePlusArretee).toBeNull();
    expect(x.entete.plus).toBeNull();
    expect(erreurs281(p, e)).toEqual([]);
  });
  test('sans base de volume : comme à la proposition, pas de place, la série s\'arrête', () => {
    const { p } = decor({ volume: null, precedent: precedent(4) });
    expect(p.exercices[0].consigne.serieDePlus).toBeUndefined();
    expect(p.exercices[0].serieDePlusArretee.raison).toBe('volume');
  });
  test('douleur récente sur l\'exercice : la série s\'arrête, même avec de la place', () => {
    const { e, p } = decor({ precedent: precedent(4), douleurs: { pecs: ['2026-09-30'] } });
    const x = p.exercices[0];
    expect(x.serieDePlusArretee.raison).toBe('douleur');
    expect(x.consigne.serieDePlus).toBeUndefined();
    expect(erreurs281(p, e)).toEqual([]);
  });
  test('zone à ménager non choisie : la série s\'arrête ; zone choisie : elle continue', () => {
    const a = decor({ precedent: precedent(4), zonesMenagees: { pecs: { zones: ['epaule'], choisie: null } } });
    expect(a.p.exercices[0].consigne.serieDePlus).toBeUndefined();
    expect(a.p.exercices[0].serieDePlusArretee.raison).toBe('menagee');
    expect(erreurs281(a.p, a.e)).toEqual([]);
    const b = decor({ precedent: precedent(4), zonesMenagees: { pecs: { zones: ['epaule'], choisie: 'epaule' } } });
    expect(b.p.exercices[0].consigne.serieDePlus).toEqual({ routine: 3 });
  });
});

describe('G7 — I281 : des violations forgées sont vues', () => {
  test('une série de plus en cours sans place relue', () => {
    const { e, p } = decor({ precedent: precedent(4) });
    const faux = Object.assign({}, e, { volume: SANS_PLACE });
    expect(erreurs281(p, faux).join('\n')).toMatch(/I281 — exercice 0 \(pecs\) : une série de plus en cours alors que la place relue manque \(volume\)/);
  });
  test('une fin dite pour une autre raison, ou pas dite en gris', () => {
    const { e, p } = decor({ volume: SANS_PLACE, precedent: precedent(4) });
    const autre = JSON.parse(JSON.stringify(p));
    autre.exercices[0].serieDePlusArretee.raison = 'douleur';
    expect(erreurs281(autre, e).join('\n')).toMatch(/s’arrête pour « douleur », la place relue dit « volume »/);
    const muette = JSON.parse(JSON.stringify(p));
    muette.exercices[0].entete.plus = null;
    expect(erreurs281(muette, e).join('\n')).toMatch(/n’est pas dite en gris/);
  });
});
