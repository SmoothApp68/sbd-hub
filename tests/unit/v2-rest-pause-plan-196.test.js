/** @jest-environment node */
// 196 — LE REST-PAUSE DANS LE PLAN (MOTEUR §9.33, I105, I106) : les mini-séries ne sont jamais des dégressives du coach.
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');

const DEBUT = '2026-10-31T10:00:00+00:00';
const CATALOGUE = { curl_poulie: { equipement: 'poulie', mesure: 'charge_reps', muscles_primaires: ['biceps'] } };

function seance() {
  let k = 0; const id = () => 's' + (++k);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'curl_poulie', id, { series: 1 });
  se = S.modifierSerie(se, 0, 0, { charge_kg: 30, reps: 12 });
  se = S.valider(se, 0, 0, new Date(DEBUT));
  return S.ajouterRestPause(se, 0, 0, id);
}
const planDe = (se) => {
  const e = { seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices }, consignes: { curl_poulie: null },
    catalogue: CATALOGUE, reglage: 'normal', paris: [], suites: {} };
  const p = T.planDeSeance(e);
  return { e, p, x: p.exercices[0] };
};

describe('196 — le plan et les mini-séries', () => {
  test('pas de dégressive du coach, un fantôme à la charge de la série, I105 et I106 tenus', () => {
    const { e, p, x } = planDe(seance());
    expect(x.degressive || null).toBeNull();
    expect(x.lignes.length).toBe(3);
    [1, 2].forEach((i) => {
      expect(x.lignes[i].restPause).toBe(true);
      expect(x.lignes[i].role).toBe('hors');
      expect(x.lignes[i].fantome).toEqual({ charge: 30, reps: null, source: 'rest_pause' });
    });
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('DISCRIMINANT — une dégressive ordinaire reste une dégressive du coach (−22,5 %), sans lecture rest-pause', () => {
    let k = 0; const id = () => 'd' + (++k);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'curl_poulie', id, { series: 1 });
    se = S.valider(S.modifierSerie(se, 0, 0, { charge_kg: 30, reps: 12 }), 0, 0, new Date(DEBUT));
    se = S.ajouterDegressive(se, 0, id);
    const { e, p, x } = planDe(se);
    expect(x.lignes.some((l) => l.restPause)).toBe(false);
    expect(x.degressive.charge).toBe(22.5);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});
