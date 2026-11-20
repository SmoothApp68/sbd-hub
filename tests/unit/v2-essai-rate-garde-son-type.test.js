/** @jest-environment node */
//
// 193-4 (MOTEUR §9.32) — LE PLAN DE LA SEMAINE DE TEST : le vrai chemin (`seance.js`, `planDeSeance`, `verifierPlan` I88 à I93,
// `verifierPhrases` I26).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');

const sp = (t) => String(t).replace(/[  ]/g, ' ');
const [SQ, DC, SDT, DM] = require('../../v2/js/modele.js').BARRES;
const ACC = 'ecartes_poulie';

const FICHES = {
  [SQ]: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] },
  [DC]: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] },
  [SDT]: { nom: 'Soulevé de terre', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['ischio_jambiers', 'dos'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] },
  [DM]: { nom: 'Développé militaire', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['deltoides'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] },
  [ACC]: { nom: 'Écartés', equipement: 'poulie', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: [], muscles_stabilisateurs: [] }
};

function seance(slugs, n) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: n || 3 }); });
  se.exercices.forEach((ex) => ex.series.forEach((s) => { s.reps_visees = 5; }));
  return se;
}
function entrees(se, test, extra) {
  const consignes = {};
  se.exercices.forEach((ex) => {
    consignes[ex.exercise_slug] = { consigne: { etat: 'progression', zone: 'lourd', palier: 100, n: 3, ligne: { charge: 100, vise: 5 }, haut: null }, contexte: { cran: 102.5, haut: null } };
  });
  const catalogue = {}; se.exercices.forEach((ex) => { catalogue[ex.exercise_slug] = FICHES[ex.exercise_slug]; });
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, routine_id: 'R', exercices: se.exercices },
    consignes, reglage: 'normal', paris: [], objectif: 'les_deux', catalogue,
    semaineDeTest: Object.assign({ debut: '2026-11-02', fin: '2026-11-08', modes: {}, mesures: {}, refus: {}, maxEstimes: { [DC]: 154, [SQ]: 157, [SDT]: 197, [DM]: 73 } }, test || {})
  }, extra || {});
}
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };


const M2 = require('../../v2/js/modele.js');

describe('l’essai raté garde son type (Seance.marquerManquee)', () => {
  const avec = (type, extra) => {
    let se = seance([DC], 3);
    se = S.modifierSerie(se, 0, 0, Object.assign({ charge_kg: 112.5, reps: 0 }, extra || {}));
    se = S.changerType(se, 0, 0, type);
    return se;
  };
  test('test et degressive gardent leur type ; travail et recul passent à echec ; reps, charge, douleur intactes', () => {
    ['test', 'degressive'].forEach((t) => {
      const se = S.marquerManquee(avec(t), 0, 0);
      expect(se.exercices[0].series[0].type_serie).toBe(t);
    });
    ['travail', 'recul'].forEach((t) => {
      const se = S.marquerManquee(avec(t), 0, 0);
      expect(se.exercices[0].series[0].type_serie).toBe('echec');
    });
    const se0 = avec('test'); se0.exercices[0].series[0].douleur = true;
    const s1 = S.marquerManquee(se0, 0, 0).exercices[0].series[0];
    expect([s1.charge_kg, s1.reps, s1.douleur]).toEqual([112.5, 0, true]);
    const s2 = S.marquerManquee(avec('travail'), 0, 0).exercices[0].series[0];
    expect([s2.charge_kg, s2.reps]).toEqual([112.5, 0]);
  });

  test('estZeroDeTravail est faux pour un test à 0 rep, vrai pour un echec à 0 rep', () => {
    expect(M2.estZeroDeTravail({ type_serie: 'test', reps: 0, charge_kg: 112.5 })).toBe(false);
    expect(M2.estZeroDeTravail({ type_serie: 'echec', reps: 0, charge_kg: 112.5 })).toBe(true);
  });

  const essais = (mal) => {
    let se = seance([SQ], 5);
    se = S.modifierSerie(se, 0, 0, { charge_kg: 142.5, reps: 1 });
    se = S.changerType(se, 0, 0, 'test');
    se = S.definirEffort(se, 0, 0, { rpe: 8 });
    se = S.valider(se, 0, 0, new Date('2026-11-03T10:10:00Z'));
    se = S.modifierSerie(se, 0, 1, { charge_kg: 150, reps: 0 });
    se = S.changerType(se, 0, 1, 'test');
    se = S.marquerManquee(se, 0, 1);
    if (mal) se = S.marquerDouleur(se, 0);
    return S.valider(se, 0, 1, new Date('2026-11-03T10:20:00Z'));
  };
  test('essai 1 réussi, essai 2 à 0 rep « manquée » : arrêt « rate », rien de plus (I92), mesure de l’essai 1 (I93), aucune réaction Z', () => {
    const e = entrees(essais(false));
    const p = T.planDeSeance(e);
    const x = p.exercices[0], t = x.semaineDeTest;
    expect(t.essais).toHaveLength(2);
    expect(t.arret).toBe('rate'); expect(t.etat).toBe('arret');
    expect(t.prochain).toBeNull();
    expect(t.mesure.source).toBe('essai'); expect(t.mesure.charge).toBe(142.5);
    expect(x.zeros || []).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('variante « J’ai eu mal » : arrêt « mal »', () => {
    const e = entrees(essais(true));
    const p = T.planDeSeance(e);
    const t = p.exercices[0].semaineDeTest;
    expect(t.arret).toBe('mal'); expect(t.prochain).toBeNull();
    expect(p.exercices[0].zeros || []).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});
