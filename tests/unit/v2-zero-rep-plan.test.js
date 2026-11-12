/** @jest-environment node */
//
// Chantier « première séance sûre », PR 2 — le PLAN après une séance de zéro rep (MOTEUR §9.42) et la garde « unique » (§9.1.2) :
// le badge, la ligne préremplie, aucun « Au max », le calage qui recommence, les invariants I152 à I154 (positifs ET négatifs :
// un invariant qui ne voit rien est pire qu'aucun).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const A = require('../../v2/js/assistant.js');

let n = 0;
const brute = (kg, reps, extra) => Object.assign({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' }, extra || {});
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: true };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (liste) => liste.map(([kg, reps, extra], i) => ({ seance: { id: 'H' + i, debut: jourN(i) },
  series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((x) => brute(kg, x, extra)) }));
const sp = (t) => String(t).replace(/[  ]/g, ' ');
const BONNE = [100, [8, 8, 7]];

function monPlan(liste, options, extra) {
  let k = 0;
  const id = () => 'q-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  se.exercices[0].series.forEach((s) => { s.reps_visees = 8; });
  se.exercices[0].series[2].au_max = true;
  const avant = new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
  const c = M.consigneDExercice(groupes(liste), undefined, avant, Object.assign({}, OPTIONS, options || {}));
  const e = Object.assign({
    seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices },
    consignes: { dc: c }, paris: [], suites: {}, reglage: 'normal', objectif: 'muscle', debutant: true,
    catalogue: { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5,
      muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } }
  }, extra || {});
  const p = T.planDeSeance(e);
  return { p, e, x: p.exercices[0], c };
}
const erreurs = (p, e) => T.verifierPlan(p, e).erreurs;
const dedans = (liste, re) => liste.filter((m) => re.test(m));

describe('le plan — après un zéro rep (zero_rep)', () => {
  test('p1 — badge « plus léger », ligne 97,5 × 9 préremplie, aucune carte « Au max », aucun test, aucune erreur', () => {
    const { p, e, x } = monPlan([BONNE, [102.5, 0]]);
    expect(x.consigne.etat).toBe('zero_rep');
    expect(x.cranDeMoins).toBe('plus léger');
    expect(x.propositionAuMax || null).toBeNull();
    const aPreremplir = (x.lignes || []).filter((l) => !l.validee && l.prerempli);
    expect(aPreremplir.length).toBeGreaterThan(0);
    aPreremplir.forEach((l) => expect(l.prerempli.charge_kg).toBe(97.5));
    expect((x.lignes || []).some((l) => l.role === 'test')).toBe(false);
    expect(erreurs(p, e)).toEqual([]);
  });
  test('p2 — le badge « un cran de moins » reste réservé au recul et à la vague de bord', () => {
    expect(monPlan([BONNE]).x.cranDeMoins).toBeNull();
  });
  test('p3 — la garde « unique » (A) : aucune erreur, ligne 25 × 1, phrase de la voix', () => {
    const histoire = [[20, 7], [25, 2], [25, 1]];
    let k = 0; const id = () => 'q-s' + (++k);
    const g = [{ seance: { id: 'H0', debut: jourN(0) }, series: histoire.map(([kg, r]) => brute(kg, r)) }];
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 3 });
    const avant = new Date(Date.parse(jourN(0)) + 3 * 864e5).toISOString();
    const c = M.consigneDExercice(g, undefined, avant, OPTIONS);
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices }, consignes: { dc: c }, paris: [], suites: {}, reglage: 'normal',
      catalogue: { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: [], muscles_stabilisateurs: [] } } };
    const p = T.planDeSeance(e);
    expect(p.exercices[0].consigne.etat).toBe('bord_garde');
    expect(c.consigne._lues).toBe(1);                    // le fait qu'I152 relit survit jusqu'au plan
    expect(p.exercices[0].consigne._lues).toBe(1);
    expect(erreurs(p, e)).toEqual([]);
  });
  test('p5 — assistant : les puces du zéro rep', () => {
    expect(A.puces('zero_rep')).toEqual(['Pourquoi tu baisses la charge ?', 'Quand tu remontes ?', 'Et ensuite ?']);
  });
});

describe('le plan — la première séance toute à zéro : le calage recommence (contradicteur 5)', () => {
  test('p6 — consigne silence/première fois ; calage ouvert ; la charge de départ de la routine n\'est pas re-prescrite', () => {
    const { p, e, x } = monPlan([[60, 0]], { depart: { charge: 60, reps: 8 } });
    expect(erreurs(p, e)).toEqual([]);
    expect(x.consigne.etat).toBe('silence');
    expect(x.consigne.raison).toBe('premiere_fois');
    expect(x.calage).toBeTruthy();
    // la charge échouée n'est pas re-grisée par la cascade de la séance d'avant
    (x.lignes || []).filter((l) => !l.validee && l.type !== 'chauffe').forEach((l) => expect(l.prerempli.charge_kg === null || l.prerempli.charge_kg < 60).toBe(true));
    // le débutant repart du plus petit cran (la barre vide), sous la charge échouée
    const suivante = x.calage.suivante;
    expect(suivante).toBeTruthy();
    expect(suivante.charge).toBeLessThan(60);
  });
  test('p6 bis — une charge habituelle déclarée à la charge échouée ne se rejoue pas', () => {
    const { x } = monPlan([[60, 0]], {}, { habituelles: { dc: 60 }, debutant: false });
    expect(x.calage).toBeTruthy();
    expect(x.calage.habituelle).toBeNull();
    expect(x.calage.demandeHabituelle).toBe(false);
  });
});

describe('les invariants I152 à I154 voient ce qu\'ils doivent voir (cas négatifs)', () => {
  test('I153 : une zero_rep dont la ligne n\'est pas plus légère que la charge échouée', () => {
    const { p, e } = monPlan([BONNE, [102.5, 0]]);
    p.exercices[0].consigne = JSON.parse(JSON.stringify(p.exercices[0].consigne));
    p.exercices[0].consigne.ligne.charge = 102.5;
    expect(dedans(erreurs(p, e), /I153/).length).toBeGreaterThan(0);
  });
  test('I153 : une zero_rep au-dessus du palier ou avec une ligne haute', () => {
    const { p, e } = monPlan([BONNE, [102.5, 0]]);
    const k = JSON.parse(JSON.stringify(p.exercices[0].consigne));
    k.haut = { charge: 105, vise: 3, k: 1 };
    p.exercices[0].consigne = k;
    expect(dedans(erreurs(p, e), /I153.*ligne haute/).length).toBeGreaterThan(0);
  });
  test('I153 : une ligne préremplie au-dessus de la charge dite', () => {
    const { p, e, x } = monPlan([BONNE, [102.5, 0]]);
    const l = (x.lignes || []).filter((q) => !q.validee && q.prerempli)[0];
    l.prerempli = Object.assign({}, l.prerempli, { charge_kg: 100 });
    expect(dedans(erreurs(p, e), /I153.*préremplie/).length).toBeGreaterThan(0);
  });
  test('I153 : la première séance toute à zéro, une ligne préremplie à la charge échouée', () => {
    const { p, e, x } = monPlan([[60, 0]]);
    expect(dedans(erreurs(p, e), /I153/)).toEqual([]);
    const l = (x.lignes || []).filter((q) => !q.validee && q.type !== 'chauffe')[0];
    l.prerempli = Object.assign({}, l.prerempli, { charge_kg: 60 });
    expect(dedans(erreurs(p, e), /I153.*calage/).length).toBeGreaterThan(0);
  });
  test('I154 : une carte « Au max » proposée après un zéro rep', () => {
    const { p, e, x } = monPlan([BONNE, [102.5, 0]]);
    x.propositionAuMax = { iSerie: 2, reserve: 0 };
    expect(dedans(erreurs(p, e), /I154/).length).toBeGreaterThan(0);
  });
  test('I152 : un état « bord » sur une histoire d\'une seule séance lue ; une garde « unique » qui ne garde pas', () => {
    const { p, e, x } = monPlan([[140, [1, 1, 1]], [140, [1, 1, 1]]]);
    expect(x.consigne.etat).toBe('bord');
    expect(x.consigne._lues).toBe(2);
    expect(dedans(erreurs(p, e), /I152/)).toEqual([]);
    const k = Object.assign({}, x.consigne);
    Object.defineProperty(k, '_lues', { value: 1, enumerable: false });
    p.exercices[0].consigne = k;
    expect(dedans(erreurs(p, e), /I152/).length).toBeGreaterThan(0);
  });
});
