/** @jest-environment node */
// Contradicteur à froid de #741 (21/11/2026) — ce qu'un brouillon en cours AVANT la mise à jour peut encore porter :
//  1. un geste `rate_prise` au bouton `rest_pause` (la personne l'avait pris) : `x.rate.pris` le relit, I268 ne doit pas le prendre
//     pour une proposition du coach ;
//  2. deux mini-séries `rest_pause` SANS charge, posées par l'ancienne coupe « J'ai peu de temps » : elles restent lues (`restPause`),
//     sans erreur d'invariant.
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js'); require('../../v2/js/palier.js'); require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js'); require('../../v2/js/generateur.js');

function monter(gestes) {
  let k = 0; const id = () => 's' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'rowing', id, { series: 5 });
  se.exercices[0].series.forEach((s) => { s.reps_visees = 10; });
  se = S.modifierSerie(se, 0, 0, { charge_kg: 93, reps: 7 });
  se = S.valider(se, 0, 0, new Date(Date.UTC(2026, 10, 3, 10, 1)));
  (gestes || []).forEach((g) => { se = S.noterGeste(se, g); });
  return se;
}
function planDuRowing(se) {
  const e = { seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes },
    consignes: { rowing: { consigne: { etat: 'progression', zone: 'hypertrophie', palier: 93, n: 5, ligne: { charge: 93, vise: 10 }, haut: null }, contexte: { cran: 95.5, haut: null }, pas: 2.5 } },
    reglage: 'normal', objectif: 'les_deux', paris: [],
    catalogue: { rowing: { equipement: 'machine', mesure: 'charge_reps', pas: 2.5, nom: 'rowing', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } } };
  return { e, p: T.planDeSeance(e) };
}

test('I268 — un geste « rest_pause » noté avant la mise à jour n’est pas une proposition du coach', () => {
  const { e, p } = planDuRowing(monter([{ geste: 'rate_prise', slug: 'rowing', rang: 0, bouton: 'rest_pause' }]));
  expect(T.verifierPlan(p, e).erreurs.filter((x) => /^I268/.test(x))).toEqual([]);
});

test('I268 — un texte du coach qui dit « rest-pause » reste refusé (la lecture de `rate.pris` est seule exemptée)', () => {
  const { e, p } = planDuRowing(monter());
  p.exercices[0].phraseTest = 'Fais un rest-pause.';
  expect(T.verifierPlan(p, e).erreurs.some((x) => /^I268/.test(x))).toBe(true);
});

test('un vieux brouillon de « J’ai peu de temps » : deux mini-séries `rest_pause` SANS charge restent lues, sans erreur', () => {
  let k = 0; const id = () => 'c' + (++k);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'curl_poulie', id, { series: 2 });
  se = S.valider(S.modifierSerie(se, 0, 0, { charge_kg: 30, reps: 12 }), 0, 0, new Date('2026-10-31T10:00:00Z'));
  const exo = Object.assign({}, se.exercices[0]);
  const mini = () => Object.assign(S.serieVide(id), { type_serie: 'degressive', charge_kg: null, rest_pause: true });
  exo.series = exo.series.concat([mini(), mini()]);
  se = Object.assign({}, se, { exercices: [exo] });
  const e = { seance: { id: 'S1', debut: '2026-10-31T10:00:00+00:00', edition: false, exercices: se.exercices }, consignes: { curl_poulie: null },
    catalogue: { curl_poulie: { equipement: 'poulie', mesure: 'charge_reps', muscles_primaires: ['biceps'] } }, reglage: 'normal', paris: [], suites: {} };
  const p = T.planDeSeance(e);
  expect(p.exercices[0].lignes.filter((l) => l.restPause).length).toBe(2);
  expect(T.verifierPlan(p, e).erreurs).toEqual([]);
});
