/** @jest-environment node */
//
// Lot E « revue des règles », A5 (20/11/2026, MOTEUR §9.39 et §14.8, I238) — PAS DE DÉGRESSIVE APRÈS UN RATÉ HORS DE LA RÈGLE DE L'ESCALIER.
// Le levier « Dégressive » de la réaction n'existe que si `Moteur.degressivePossible` la permet (isolation, ni Lourd ni Mix, ni sèche,
// ni décharge, ni Entretenir, ni débutant). La 3e branche (haltères polyarticulaires, sans filtre de zone ni de phase) est supprimée.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const cles = (x) => ((x.rate && x.rate.boutons) || []).map((b) => b.cle);

// Une isolation (2 muscles) ; un polyarticulaire (3 muscles ou plus : `estPolyarticulaire`).
const ISOLATION = { muscles_primaires: ['biceps'], muscles_secondaires: [], muscles_stabilisateurs: [] };
const POLY = { muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoides_anterieurs'], muscles_stabilisateurs: [] };

// Un exercice aux haltères, 4 séries visées 10 à 20 kg ; la 1re faite à 20 × 6 (sous la zone), réglage Franc.
function scene(o) {
  const z = o.zone || 'hypertrophie';
  let k = 0;
  const id = () => 's' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'exo', id, { series: 4 });
  se.exercices[0].series.forEach((s) => { s.reps_visees = 10; });
  se = S.modifierSerie(se, 0, 0, { charge_kg: 20, reps: 6 });
  se = S.valider(se, 0, 0, new Date(Date.UTC(2026, 10, 20, 10, 2, 0)));
  const e = {
    seance: { id: 'S', debut: '2026-11-20T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes },
    consignes: { exo: { consigne: { etat: 'progression', zone: z, palier: 20, n: 4, ligne: { charge: 20, vise: 10 }, haut: null }, contexte: { cran: 22, haut: null }, pas: 2 } },
    reglage: 'franc', objectif: 'muscle', paris: [], phase: o.phase || null, debutant: false,
    catalogue: { exo: Object.assign({ equipement: 'haltere', mesure: 'charge_reps', pas: 2, nom: 'exo' }, o.muscles) }
  };
  const p = T.planDeSeance(e);
  return { e, p, x: p.exercices[0] };
}

describe('moteur — la 3e branche supprimée', () => {
  const sous = { niveau: 'serie', role: 'travail', charge: 20, reps: 6, vise: 10, bas: 8, haut: 12, rang: 1, derniere: false, reglage: 'franc',
    objectif: 'muscle', barre: false, materiel: 'haltere', pas: 2, chauffeValidee: true, reposReel: 120, reposCible: 120, sousZoneAvant: 0 };
  test('⚠️ DISCRIMINANT — un polyarticulaire aux haltères (ni isolation) : plus de « Dégressive »', () => {
    const d = M.reactionAuRate(Object.assign({}, sous, { isolation: false, peutDegressive: true }));
    expect(d.leviers).not.toContain('degressive');
    expect(d.leviers).toEqual(['repos']);
  });
  test('témoin — une isolation où la dégressive est permise : « Dégressive »', () => {
    const d = M.reactionAuRate(Object.assign({}, sous, { isolation: true, peutDegressive: true }));
    expect(d.leviers).toEqual(['repos', 'degressive']);
  });
});

describe('moteur — plus de levier « Rest-pause » (21/11/2026, I268)', () => {
  const sous = { niveau: 'serie', role: 'travail', charge: 20, reps: 6, vise: 10, bas: 8, haut: 12, rang: 1, derniere: false, reglage: 'franc',
    objectif: 'muscle', barre: false, materiel: 'machine', pas: 2, chauffeValidee: true, reposReel: 120, reposCible: 120, sousZoneAvant: 0 };
  test('⚠️ DISCRIMINANT — même un contexte qui dirait « permis » n\'offre aucun rest-pause, ni sur une machine sans dégressive', () => {
    const d = M.reactionAuRate(Object.assign({}, sous, { isolation: false, peutDegressive: false, peutRestPause: true }));
    expect(d.leviers).not.toContain('rest_pause');
    expect(d.leviers).toEqual(['repos']);
    expect(M.boutonDeRate('rest_pause', {})).not.toMatch(/Rest-pause/);
  });
});

describe('plan — le levier lit `degressivePossible`', () => {
  test('témoin — isolation, Hypertrophie, hors sèche : le levier « Dégressive » sort, I238 propre', () => {
    const { e, p, x } = scene({ muscles: ISOLATION });
    expect(cles(x)).toContain('degressive');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('⚠️ DISCRIMINANT — polyarticulaire aux haltères : aucun levier « Dégressive »', () => {
    const { e, p, x } = scene({ muscles: POLY });
    expect(x.rate).toBeTruthy();
    expect(cles(x)).not.toContain('degressive');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('⚠️ DISCRIMINANT — isolation en zone Lourd : aucun levier « Dégressive »', () => {
    const { e, p, x } = scene({ muscles: ISOLATION, zone: 'lourd' });
    expect(x.rate).toBeTruthy();
    expect(cles(x)).not.toContain('degressive');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('⚠️ DISCRIMINANT — isolation en sèche : aucun levier « Dégressive », la phrase de la sèche reste', () => {
    const { e, p, x } = scene({ muscles: ISOLATION, phase: 'seche' });
    expect(x.rate).toBeTruthy();
    expect(cles(x)).not.toContain('degressive');
    expect(x.rate.phrase).toMatch(/sèche/);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('I238 forgé — un levier « Dégressive » posé en sèche est refusé', () => {
    const { e, p, x } = scene({ muscles: ISOLATION, phase: 'seche' });
    x.rate.boutons = x.rate.boutons.concat([{ cle: 'degressive', texte: 'Dégressive', pris: false }]);
    expect(T.verifierPlan(p, e).erreurs.filter((m) => /^I238/.test(m))).toHaveLength(1);
  });
});
