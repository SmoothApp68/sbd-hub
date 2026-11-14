/** @jest-environment node */
//
// « Les mots disent vrai » PR 2 — I163 dans `verifierPlan`, DANS LES DEUX SENS (MOTEUR §9.44), sur un vrai plan (le décor du 26/09 de
// v2-constat-plan : terre, ligne 125 kg, 3 séries). Le verdict est celui du moteur ; le plan est ensuite falsifié pour prouver que
// la garde voit chaque contradiction.

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const P = require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const esp = (s) => String(s).replace(/[  ]/g, ' ');
const AVANT = '2026-09-26T10:00:00+00:00';
const APRES = '2026-09-26T12:00:00+00:00';
const OPTS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const serie = (id, kg, reps) => ({ id, type_serie: 'travail', charge_kg: kg, reps, rpe: null, ressenti: null,
  validee_a: '2026-09-26T10:30:00Z', source: 'app' });
const set = (sid, kg, reps, rang) => ({ id: sid + '-' + rang, session_id: sid, exercise_slug: 'terre',
  charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', rang, validee_a: 'v', source: 'app' });
const jour = (d) => '2026-09-' + d + 'T18:00:00+00:00';
const HISTOIRE = [['a', '05', 120], ['b', '12', 122.5], ['c', '19', 125]].map(([sid, d, kg]) => ({
  seance: { id: sid, debut: jour(d) }, series: [1, 2, 3].map((r) => set(sid, kg, 5, r)) }));
const ETAT = P.etatsExercices(P.seanceExercices([].concat(...HISTOIRE.map((g) =>
  g.series.map((s) => Object.assign({ slug: 'terre' }, s))))));
const CONS0 = M.consigneDExercice(HISTOIRE, ETAT.terre, AVANT, OPTS);
// La consigne SANS test proposé : les trois séries sont la ligne (la ligne haute a son propre cas, test non fait, dans v2-cible-faite).
const CONS = JSON.parse(JSON.stringify(CONS0));
CONS.consigne.haut = null;

function planDe(reps, cons) {
  const series = reps.map((r, i) => serie('t' + (i + 1), 125, r));
  const suite = M.suiteDExercice(HISTOIRE, { seance: { debut: AVANT }, series: series }, ETAT.terre, APRES, OPTS);
  const entrees = { seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'terre', series }] },
    consignes: { terre: cons || CONS }, reglage: 'normal', paris: [],
    suites: suite ? { terre: { consigne: suite.apres.consigne, cranSuivant: suite.cranSuivant } } : {} };
  return { entrees, plan: T.planDeSeance(entrees) };
}
const i163 = (p, e) => T.verifierPlan(p, e).erreurs.filter((m) => /^I163/.test(m));

describe('I163 — le plan vrai passe, le plan faux est vu', () => {
  test('la prémisse : la ligne du jour est 125 kg × 5 sur 3 séries', () => {
    expect(CONS.consigne.ligne.charge).toBe(125);
    expect(CONS.consigne.ligne.vise).toBe(5);
    expect(CONS.consigne.n).toBe(3);
    expect(CONS0.consigne.haut).toBeTruthy();
  });
  test('5, 5, 5 : « Cible faite », I163 ne dit rien ; falsifié en « Pas encore » : I163 le voit', () => {
    const { entrees, plan } = planDe([5, 5, 5]);
    const k = plan.exercices[0].constat;
    expect(k.cible && k.cible.etat).toBe('faite');
    expect(esp(k.verdict)).toMatch(/^Cible faite/);
    expect(i163(plan, entrees)).toEqual([]);
    k.verdict = 'Pas encore : 125 kg × 5, 5, 5 pour une cible de 5.';
    expect(i163(plan, entrees).join(' ')).toMatch(/toutes les séries sont à la cible/);
  });
  test('5, 5, 3 : « Pas encore … pour une cible de 5 », I163 ne dit rien ; falsifié en « Cible faite » : I163 le voit', () => {
    const { entrees, plan } = planDe([5, 5, 3]);
    const k = plan.exercices[0].constat;
    expect(esp(k.verdict)).toBe('Pas encore : 125 kg × 5, 5, 3 pour une cible de 5.');
    expect(i163(plan, entrees)).toEqual([]);
    k.verdict = 'Cible faite : 125 kg × 5, 5, 3.';
    expect(i163(plan, entrees).join(' ')).toMatch(/à plus d.une rep sous la cible/);
  });
  test('5, 5, 4 : « Cible faite » avec la tolérance nommée ; sans la phrase de tolérance, I163 le voit', () => {
    const { entrees, plan } = planDe([5, 5, 4]);
    const k = plan.exercices[0].constat;
    expect(esp(k.verdict)).toBe('Cible faite : 125 kg × 5, 5, 4. Une série à une rep sous la cible est tolérée.');
    expect(i163(plan, entrees)).toEqual([]);
    k.verdict = 'Cible faite : 125 kg × 5, 5, 4.';
    expect(i163(plan, entrees).join(' ')).toMatch(/sans nommer la tolérance/);
  });
  test('« Pas encore » qui dit une autre cible que la ligne : I163 le voit', () => {
    const { entrees, plan } = planDe([5, 5, 3]);
    plan.exercices[0].constat.verdict = 'Pas encore : 125 kg × 5, 5, 3 pour une cible de 6.';
    expect(i163(plan, entrees).join(' ')).toMatch(/ne dit pas la cible/);
  });
});

describe('I163 — un test proposé et laissé de côté se nomme, sans que le plan viole aucun invariant (I26 compris)', () => {
  test('5, 5, 5 sur une consigne avec test à 127,5 kg : « Aujourd\'hui … Le test à 127,5 kg n\'a pas été fait. »', () => {
    const { entrees, plan } = planDe([5, 5, 5], CONS0);
    const k = plan.exercices[0].constat;
    expect(esp(k.verdict)).toBe('Aujourd\'hui : 125 kg × 5, 5, 5. Le test à 127,5 kg n\'a pas été fait.');
    expect(k.cible.etat).toBe('test_non_fait');
    expect(T.verifierPlan(plan, entrees).erreurs).toEqual([]);
  });
});

// PR 4b (MOTEUR §9.47) — la branche 68B fusionnée : une série à fond qui tient la cible se dit dans « Cible faite », sa cause lue sur le jugement du
// moteur ; I162 relit « sans marge » dans le verdict contre ce jugement (jamais contre le verbe de la consigne du jour, qui parle de la séance d'avant).
describe('PR 4b — « Cible faite … sans marge » : I162 lit le verdict contre le jugement de la cible', () => {
  const planFond = (rpes) => {
    const series = [5, 5, 5].map((r, i) => Object.assign(serie('t' + (i + 1), 125, r), rpes[i] ? { rpe: rpes[i] } : {}));
    const suite = M.suiteDExercice(HISTOIRE, { seance: { debut: AVANT }, series: series }, ETAT.terre, APRES, OPTS);
    const entrees = { seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'terre', series }] },
      consignes: { terre: CONS }, reglage: 'normal', paris: [],
      suites: suite ? { terre: { consigne: suite.apres.consigne, cranSuivant: suite.cranSuivant } } : {} };
    return { entrees, plan: T.planDeSeance(entrees) };
  };
  const i16x = (p, e) => T.verifierPlan(p, e).erreurs.filter((m) => /^I16[23]/.test(m));
  test('5, 5, 5 dont la première à fond : « Cible faite : …, une série sans marge. », le jugement porte la cause, rien à signaler', () => {
    const { entrees, plan } = planFond([10, null, null]);
    const k = plan.exercices[0].constat;
    expect(esp(k.verdict)).toBe('Cible faite : 125 kg × 5, 5, 5, une série sans marge.');
    expect(k.cible.sansMarge).toEqual({ derniere: false });
    expect(i16x(plan, entrees)).toEqual([]);
  });
  test('⚠️ DISCRIMINANT — le même verdict sans que le jugement porte la cause : I162 le voit', () => {
    const { entrees, plan } = planFond([10, null, null]);
    plan.exercices[0].constat.cible.sansMarge = null;
    expect(i16x(plan, entrees).join(' ')).toMatch(/I162 .*le constat imprime la cause « sans marge » alors que le jugement de la cible n’en porte aucune/);
  });
  test('⚠️ DISCRIMINANT — « la dernière » dit devant une série à fond qui n\'est pas la dernière : I162 le voit', () => {
    const { entrees, plan } = planFond([10, null, null]);
    plan.exercices[0].constat.verdict = 'Cible faite : 125 kg × 5, 5, 5, la dernière sans marge.';
    expect(i16x(plan, entrees).join(' ')).toMatch(/I162 .*le constat dit « la dernière » alors que la série à fond n’est pas la dernière/);
  });
  test('sans série à fond : « Cible faite » sans cause', () => {
    const { entrees, plan } = planFond([null, null, null]);
    expect(esp(plan.exercices[0].constat.verdict)).toBe('Cible faite : 125 kg × 5, 5, 5.');
    expect(plan.exercices[0].constat.cible.sansMarge).toBeNull();
    expect(i16x(plan, entrees)).toEqual([]);
  });
});
