/** @jest-environment node */
//
// 253-X1 (MOTEUR §9.41, règle 7) — PAS DE CHAUFFE PROPOSÉE SUR UNE ISOLATION DONT LES MUSCLES ONT DÉJÀ ÉTÉ TRAVAILLÉS par un exercice
// précédent de la séance (sauf zone à ménager ; le premier exercice n'est jamais concerné). Invariant I141.
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');

describe('la décision', () => {
  const base = { equipement: 'haltere', reference: 14, e1rm: null, premier: true, isolation: true, forme: true };
  test('isolation déjà travaillée, pas en tête : rien', () => {
    expect(M.propositionDeChauffes(Object.assign({}, base, { premierExercice: false, dejaTravaille: true })).mode).toBe('rien');
  });
  test('zone à ménager : la proposition est gardée', () => {
    expect(M.propositionDeChauffes(Object.assign({}, base, { premierExercice: false, dejaTravaille: true, menagee: true })).mode).toBe('proposer');
  });
  test('premier exercice : inchangé', () => {
    expect(M.propositionDeChauffes(Object.assign({}, base, { premierExercice: true, dejaTravaille: false })).mode).toBe('proposer');
    expect(M.propositionDeChauffes(Object.assign({}, base, { premierExercice: true, dejaTravaille: true })).mode).toBe('proposer');
  });
  test('isolation de muscles pas encore travaillés : inchangé', () => {
    expect(M.propositionDeChauffes(Object.assign({}, base, { premierExercice: false, dejaTravaille: false })).mode).toBe('proposer');
  });
});

describe('le plan — une séance « Haut force »', () => {
  const F = (nom, equipement, prim, sec) => ({ nom, equipement, mesure: 'charge_reps', muscles_primaires: prim, muscles_secondaires: sec || [], muscles_stabilisateurs: [] });
  const CAT = {
    developpe_couche: F('Développé couché', 'barre', ['pectoraux'], ['triceps', 'epaules_avant']),
    rowing_barre: F('Rowing', 'barre', ['dos'], ['biceps']),
    developpe_militaire: F('Développé militaire', 'barre', ['epaules_avant'], ['triceps']),
    curl_halteres: F('Curl', 'haltere', ['biceps']),
    elevations_laterales: F('Élévations latérales', 'haltere', ['epaules_lateral']),
    curl_pupitre: F('Curl pupitre', 'machine', ['biceps'])
  };
  const consigne = (charge) => ({ etat: 'progression', zone: 'force', palier: charge, niveau: 5, n: 3, ligne: { charge, vise: 5 }, haut: null, fondement: {} });
  const plan = (slugs, extra) => {
    let n = 0; const id = () => 'z' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    slugs.forEach((s) => { se = S.ajouterExercice(se, s, id, { series: 3 }); });
    const consignes = {};
    slugs.forEach((s) => { const c = CAT[s].equipement === 'barre' ? 80 : 14; consignes[s] = { consigne: consigne(c), libelles: M.libellesConsigne(consigne(c)), pas: null }; });
    const e = Object.assign({
      seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: [] },
      consignes, catalogue: CAT, reglage: null, paris: [], suites: {}, e1rms: {}, objectif: 'forme'
    }, extra || {});
    const p = T.planDeSeance(e);
    return { e, p, erreurs: T.verifierPlan(p, e).erreurs, prop: p.exercices.map((x) => !!(x && x.proposition)) };
  };

  test('rowing puis curl : aucune proposition sur le curl (le biceps est secondaire du rowing)', () => {
    const r = plan(['rowing_barre', 'curl_halteres']);
    expect(r.prop).toEqual([true, false]);
    expect(r.erreurs).toEqual([]);
  });
  test('développé militaire puis élévations : aucune proposition sur les élévations (deltoïdes déjà travaillés)', () => {
    const r = plan(['developpe_militaire', 'elevations_laterales'], { catalogue: Object.assign({}, CAT, { developpe_militaire: F('DM', 'barre', ['epaules_avant', 'epaules_lateral'], ['triceps']) }) });
    expect(r.prop).toEqual([true, false]);
  });
  test('élévations avec épaule à ménager : la proposition est gardée', () => {
    const r = plan(['developpe_militaire', 'elevations_laterales'], {
      catalogue: Object.assign({}, CAT, { developpe_militaire: F('DM', 'barre', ['epaules_avant', 'epaules_lateral'], ['triceps']) }),
      zonesMenagees: { elevations_laterales: { choisie: false } }
    });
    expect(r.prop[1]).toBe(true);
    expect(r.erreurs.filter((x) => /I141/.test(x))).toEqual([]);
  });
  test('isolation en tête de séance : inchangé', () => {
    expect(plan(['curl_halteres', 'rowing_barre']).prop[0]).toBe(true);
  });
  test('une isolation de muscles encore frais garde sa proposition', () => {
    expect(plan(['developpe_couche', 'curl_halteres']).prop).toEqual([true, true]);
  });
  test('I141 — l’invariant refuse une proposition forcée sur une isolation déjà travaillée', () => {
    const r = plan(['rowing_barre', 'curl_halteres']);
    const p = JSON.parse(JSON.stringify(r.p));
    p.exercices[1].proposition = JSON.parse(JSON.stringify(r.p.exercices[0].proposition));
    expect(T.verifierPlan(p, r.e).erreurs.join('\n')).toMatch(/I141/);
  });
});
