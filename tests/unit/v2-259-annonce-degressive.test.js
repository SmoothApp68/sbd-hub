/** @jest-environment node */
//
// 259 — LA DÉGRESSIVE ANNONCÉE EN MOTS DÈS LA SÉRIE D'AVANT (décision d'Aurélien du 06/11/2026).
// « Dernière série : 12 reps, puis baisse à 25 kg et continue. » : les reps visées de la série, la charge de la dégressive telle que
// le plan la calcule déjà (`degressiveDe`) ; sans charge : « puis baisse la charge et continue ». Elle vient du plan.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');

const NB = ' ';
const DEBUT = '2026-11-06T10:00:00+00:00';
const CATALOGUE = {
  curl_poulie: { equipement: 'poulie', mesure: 'charge_reps', muscles_primaires: ['biceps'] },
  curl_biceps_barre_ez: { equipement: 'barre', mesure: 'charge_reps', mouvement: 'curl', muscles_primaires: ['biceps'] }
};

describe('259 — la phrase (moteur)', () => {
  test('reps et charge connues', () => {
    expect(M.phraseAvantDegressive(12, 25)).toBe('Dernière série : 12 reps, puis baisse à 25' + NB + 'kg et continue.');
    expect(M.phraseAvantDegressive(1, 22.5)).toBe('Dernière série : 1 rep, puis baisse à 22,5' + NB + 'kg et continue.');
  });
  test('charge inconnue : « puis baisse la charge et continue »', () => {
    expect(M.phraseAvantDegressive(12, null)).toBe('Dernière série : 12 reps, puis baisse la charge et continue.');
  });
  test('reps inconnues : la phrase reste dite sans chiffre inventé', () => {
    expect(M.phraseAvantDegressive(null, 25)).toBe('Dernière série, puis baisse à 25' + NB + 'kg et continue.');
  });
});

function seance(slug, travail, deg) {
  let k = 0;
  const id = () => 's' + (++k);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: travail });
  se = S.ajouterSerie(se, 0, id);
  se = S.changerType(se, 0, travail, 'degressive');
  return se;
}
const plan = (se, slug) => {
  const e = { seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices }, consignes: { [slug]: null },
    catalogue: CATALOGUE, reglage: 'normal', paris: [], suites: {} };
  const p = T.planDeSeance(e);
  return { e, p, x: p.exercices[0] };
};
const valider = (se, j, charge, reps) => S.valider(S.modifierSerie(se, 0, j, { charge_kg: charge, reps: reps }), 0, j, new Date(DEBUT));

describe('259 — dans le plan', () => {
  test('la série qui précède la dégressive porte l’annonce : les reps de la série, la charge de la dégressive du plan', () => {
    let se = seance('curl_poulie', 2);
    se = valider(se, 0, 30, 12);
    se.exercices[0].series[1].reps_visees = 12;   // la visée de la routine
    se.exercices[0].series[1].charge_kg = 30;
    const { e, p, x } = plan(se, 'curl_poulie');
    expect(x.degressive.apres).toBe(1);
    expect(x.degressive.iSerie).toBe(2);
    expect(x.degressive.annonce).toBe('Dernière série : 12 reps, puis baisse à ' + String(x.degressive.charge).replace('.', ',') + NB + 'kg et continue.');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('DISCRIMINANT — la charge de l’annonce est celle de la ligne dégressive (jamais recalculée à part)', () => {
    let se = seance('curl_poulie', 2);
    se = valider(se, 0, 40, 10);
    se = valider(se, 1, 40, 10);
    const { x } = plan(se, 'curl_poulie');
    expect(x.degressive.annonce).toContain('baisse à ' + String(x.degressive.charge).replace('.', ',') + NB + 'kg');
    expect(x.lignes[2].degressive.charge).toBe(x.degressive.charge);
  });

  test('I133 — une annonce qui ment sur la charge est refusée par l’invariant', () => {
    let se = seance('curl_poulie', 2);
    se = valider(se, 0, 30, 12);
    const { e, p } = plan(se, 'curl_poulie');
    p.exercices[0].degressive.annonce = 'Dernière série : 12 reps, puis baisse à 99' + NB + 'kg et continue.';
    expect(T.verifierPlan(p, e).erreurs.some((m) => /I133/.test(m))).toBe(true);
  });

  test('sans dégressive dans la routine : aucune annonce', () => {
    let k = 0;
    const id = () => 's' + (++k);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'curl_poulie', id, { series: 3 });
    const { x } = plan(se, 'curl_poulie');
    expect(x.degressive).toBeNull();
  });
});
