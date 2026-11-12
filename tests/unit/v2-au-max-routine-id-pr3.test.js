/** @jest-environment node */
//
// Chantier « première séance sûre », PR 3 (B5-01, MOTEUR §9.30) — `routine_id` ARRIVE AU PLAN : la carte « Dernière série au max ? » vient dès la
// 2e séance d'un exercice de routine. Avant, `entreesDuPlan` (app.js) ne le passait pas : `propositionAuMax` restait vide, toujours, et
// les tests passaient `routine_id` à la main. Ici : (1) le câblage est lu dans le source de l'app ; (2) le vrai `consigneDExercice`,
// le vrai `planDeSeance` et `verifierPlan` sur les cas du diagnostic (65+, première fois, après un zéro, Forme).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const fs = require('fs');
const path = require('path');

describe('le câblage : l\'objet `seance` donné au plan porte routine_id', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  test('entreesDuPlan : `routine_id: seance.routine_id || null` dans l\'objet seance', () => {
    const i = src.indexOf('seance: { id: seance.id, debut: seance.debut, edition: edition, exercices: exos,');
    expect(i).toBeGreaterThan(0);
    const bloc = src.slice(i, i + 900);
    expect(bloc).toMatch(/routine_id: seance\.routine_id \|\| null/);
  });
});

let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' });
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (liste) => liste.map(([kg, reps], i) => ({ seance: { id: 'H' + i, debut: jourN(i) },
  series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((x) => brute(kg, x)) }));
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };

function monPlan(liste, extra, routine) {
  let k = 0;
  const id = () => 'q-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  se.exercices[0].series.forEach((s) => { s.reps_visees = 8; });
  const avant = new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
  const c = M.consigneDExercice(groupes(liste), undefined, avant, OPTIONS);
  // l'entrée est construite comme `entreesDuPlan` : `routine_id` dans l'objet seance, jamais ajouté à la main ailleurs
  const e = Object.assign({
    seance: { id: 'S', debut: avant, edition: false, routine_id: routine === false ? null : 'R', exercices: se.exercices },
    consignes: { dc: c }, paris: [], suites: {}, reglage: 'normal', objectif: 'les_deux', debutant: false,
    catalogue: { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5,
      muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } }
  }, extra || {});
  const p = T.planDeSeance(e);
  return { p, e, x: p.exercices[0], c };
}
const erreurs = (p, e) => T.verifierPlan(p, e).erreurs;
const TROIS = [[100, 8], [100, 8], [100, 8]];

describe('la carte « Dernière série au max ? » avec routine_id', () => {
  test('2e séance et suivantes d\'un exercice de routine : la carte est proposée, aucun invariant violé', () => {
    const { p, e, x } = monPlan(TROIS);
    expect(x.consigne.etat).not.toBe('silence');
    expect(x.propositionAuMax).toMatchObject({ iSerie: 2, reserve: 0 });
    expect(erreurs(p, e)).toEqual([]);
  });
  test('sans routine_id (séance libre, « Juste un carnet ») : aucune carte', () => {
    expect(monPlan(TROIS, {}, false).x.propositionAuMax || null).toBeNull();
  });
  test('65+ connu : « en gardant 2 reps » (I150)', () => {
    const { p, e, x } = monPlan(TROIS, { plus65: true });
    expect(x.propositionAuMax).toMatchObject({ reserve: 2 });
    expect(String(x.propositionAuMax.titre).replace(/[  ]/g, ' ')).toBe('Dernière série : en gardant 2 reps ?');
    expect(erreurs(p, e)).toEqual([]);
  });
  test('première fois (aucun historique) : aucune carte (I151)', () => {
    const { p, e, x } = monPlan([]);
    expect(M.estPremiereFois(x.consigne)).toBe(true);
    expect(x.propositionAuMax || null).toBeNull();
    expect(erreurs(p, e)).toEqual([]);
  });
  test('après un zéro rep : aucune carte (I154)', () => {
    const { p, e, x } = monPlan([[100, [8, 8, 7]], [102.5, [0, 0, 0]]]);
    expect(x.consigne.etat).toBe('zero_rep');
    expect(x.propositionAuMax || null).toBeNull();
    expect(erreurs(p, e)).toEqual([]);
  });
  test('objectif Forme : aucune carte', () => {
    const { p, e, x } = monPlan(TROIS, { objectif: 'forme' });
    expect(x.propositionAuMax || null).toBeNull();
    expect(erreurs(p, e)).toEqual([]);
  });
  test('une réponse « non » rangée : la carte ne revient pas', () => {
    expect(monPlan(TROIS, { auMaxReponses: { dc: { r: 'non' } } }).x.propositionAuMax || null).toBeNull();
  });
});
