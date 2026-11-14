/** @jest-environment node */
//
// « Les mots disent vrai » PR 5a-bis (MOTEUR §9.48 bis, I167) — LA SUITE LIT AUJOURD'HUI.
//
// Le défaut (diagnostic « live contre rechargé », 14/11/2026) : en séance, `app.js suiteDe` passait au moteur la séance du jour SANS `routine_id`. La zone d'une
// séance se lit par sa routine, sinon par la médiane de ses reps : 5, 5, 5, 5 sous une routine en Hypertrophie tombait dans Lourd, le jour sortait de la zone du plan
// et la suite redonnait la consigne d'HIER (« La prochaine fois : une rep de plus, 90 kg × 5 » ; la vraie suite est 90 kg × 6).
//   1. la fabrique de l'app (`faits.groupeDuJour`) porte le `routine_id`, et `suiteDe` l'appelle (garde de source) ;
//   2. avec elle : 90 × 6 ; sans (le défaut, gardé exprès) : 90 × 5 niveau 4 — la fois d'AVANT ;
//   3. I167 (`verifierPlan`) : une charge répétée aujourd'hui ⇒ la consigne de la suite est datée du jour de la séance — DISCRIMINANT sur un plan réel.
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js'); require('../../v2/js/palier.js'); require('../../v2/js/profil.js'); require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Faits = require('../../v2/js/faits.js').creer();
const fs = require('fs');
const path = require('path');

let n = 0;
const ser = (l) => l.map(([kg, r, ex], i) => Object.assign({ id: 's' + (++n), rang: i + 1, charge_kg: kg, reps: r, rpe: null, ressenti: null, type_serie: 'travail',
  exercise_slug: 'dc', au_max_reserve: null, validee_a: 'v', source: 'app' }, ex || {}));
const mk = (id, d, l, rid) => ({ seance: Object.assign({ id, debut: d }, rid ? { routine_id: rid } : {}), series: ser(l) });
const H = () => [mk('H0', '2026-11-04T18:00:00+01:00', [[90, 5], [90, 5], [90, 5]], 'R'), mk('H1', '2026-11-11T18:00:00+01:00', [[90, 5], [90, 4]], 'R')];
const JOUR = [[90, 5], [90, 5], [90, 5], [90, 5, { ressenti: 'reste_0', au_max_reserve: 0 }]];
const DEBUT = '2026-11-14T10:00:00+01:00', APRES = '2026-11-14T11:00:00+01:00';
const opts = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, zonePlan: 'hypertrophie', zonesDeRoutine: { R: 'hypertrophie' } };
const suite = (groupeDuJour) => M.suiteDExercice(H(), groupeDuJour, undefined, APRES, opts);
const lc = (c) => [c.ligne.charge, c.ligne.vise, c.niveau];

describe('la suite d\'un exercice, en séance (live)', () => {
  test('VÉRITÉ : la séance suivante réelle (aujourd\'hui dans l\'histoire, routine connue) = 90 kg × 6, niveau 5', () => {
    const c = M.consigneDExercice(H().concat([mk('T', DEBUT, JOUR, 'R')]), undefined, '2026-11-18T18:00:00+01:00', opts).consigne;
    expect([c.etat, c.ligne.charge, c.ligne.vise, c.niveau]).toEqual(['progression', 90, 6, 5]);
  });
  test('la fabrique de l\'app porte le routine_id de la séance (sinon null) et rien d\'autre que la séance et les séries', () => {
    const g = Faits.groupeDuJour({ id: 'T', debut: DEBUT, routine_id: 'R', fin: null }, ser(JOUR));
    expect(g.seance).toEqual({ debut: DEBUT, routine_id: 'R' });
    expect(Faits.groupeDuJour({ debut: DEBUT }, []).seance).toEqual({ debut: DEBUT, routine_id: null });
  });
  test('AVEC la fabrique de l\'app : 90 × 6, niveau 5, daté du jour ; SANS routine_id (le défaut, gardé exprès) : la fois d\'AVANT, 90 × 5, niveau 4', () => {
    const bon = suite(Faits.groupeDuJour({ debut: DEBUT, routine_id: 'R' }, ser(JOUR)));
    expect(lc(bon.apres.consigne)).toEqual([90, 6, 5]);
    expect(M.jourCivil(bon.apres.consigne.fondement.date)).toBe('2026-11-14');
    const mauvais = suite({ seance: { debut: DEBUT }, series: ser(JOUR) });
    expect(lc(mauvais.apres.consigne)).toEqual([90, 5, 4]);
    expect(M.jourCivil(mauvais.apres.consigne.fondement.date)).toBe('2026-11-11');
  });
  test('l\'annonce dit la ligne vraie (90 kg × 6), jamais le silence, quand le test n\'est pas confirmé (arbitrage du 14/11/2026)', () => {
    const bon = suite(Faits.groupeDuJour({ debut: DEBUT, routine_id: 'R' }, ser(JOUR)));
    const cAvant = M.consigneDExercice(H(), undefined, DEBUT, opts).consigne;
    const k = M.constatDuJour(cAvant, bon.apres.consigne, 'normal', bon.cranSuivant, { series: ser(JOUR).map((x) => ({ charge_kg: x.charge_kg, reps: x.reps })) }, DEBUT, false, bon.testConfirme === true);
    expect(String(k.suite).replace(/[  ]/g, ' ')).toBe('La prochaine fois : une rep de plus, 90 kg × 6.');
  });
  test('garde de source : `suiteDe` (app.js) construit le groupe du jour par `faits.groupeDuJour`, jamais à la main', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const i = src.indexOf('function suiteDe(slug)');
    const corps = src.slice(i, src.indexOf('function constatPour', i));
    expect(corps).toMatch(/faits\.groupeDuJour\(seance, faites\)/);
    expect(corps).not.toMatch(/\{\s*seance:\s*\{\s*debut:\s*seance\.debut\s*\}/);
  });
});

// ── I167 : un plan réel, la suite datée d'avant la séance ────────────────────────────────────────────────────
describe('I167 — verifierPlan : la suite lit aujourd\'hui (DISCRIMINANT)', () => {
  const AVANT = '2026-09-26T10:00:00+00:00', APRES2 = '2026-09-26T12:00:00+00:00';
  const OPTS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
  const jour = (d) => '2026-09-' + d + 'T18:00:00+00:00';
  const set = (sid, kg, reps, rang) => ({ id: sid + '-' + rang, session_id: sid, exercise_slug: 'terre', charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', rang, validee_a: 'v', source: 'app' });
  const HIST = [['a', '05', [[120, 5], [120, 5], [120, 5]]], ['b', '12', [[122.5, 5], [122.5, 5], [122.5, 5]]], ['c', '19', [[125, 5], [125, 5], [125, 5]]]]
    .map(([sid, d, l]) => ({ seance: { id: sid, debut: jour(d) }, series: l.map(([kg, r], i) => set(sid, kg, r, i + 1)) }));
  const CONS = M.consigneDExercice(HIST, undefined, AVANT, OPTS);
  const serie = (id, kg, reps) => ({ id, type_serie: 'travail', charge_kg: kg, reps, rpe: null, ressenti: null, validee_a: '2026-09-26T10:30:00Z', source: 'app' });
  const plan = (reps, mutation) => {
    const series = [serie('t1', 125, reps[0]), serie('t2', 125, reps[1]), serie('t3', 125, reps[2])];
    const s = M.suiteDExercice(HIST, { seance: { debut: AVANT }, series }, undefined, APRES2, OPTS);
    const consigne = mutation ? mutation(s.apres.consigne) : s.apres.consigne;
    const entrees = { seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'terre', series }] }, consignes: { terre: CONS }, reglage: 'normal', paris: [],
      suites: { terre: { consigne, cranSuivant: s.cranSuivant, cranSuivantApprochee: s.cranSuivantApprochee === true, testConfirme: s.testConfirme === true } } };
    return { entrees, plan: T.planDeSeance(entrees) };
  };
  const i167 = (p) => T.verifierPlan(p.plan, p.entrees).erreurs.filter((e) => /^I167/.test(e));
  const datee = (d) => (c) => Object.assign({}, c, { fondement: Object.assign({}, c.fondement, { date: d }) });

  test('prémisse : 125 kg × 3 séries = une charge répétée ; la suite réelle est datée du jour de la séance, sans erreur I167', () => {
    const p = plan([5, 5, 5]);
    const c = p.plan.exercices[0].constat;
    expect(c.chargeRepetee).toBe(true);
    expect([c.suiteDate, c.jourDuConstat]).toEqual(['2026-09-26', '2026-09-26']);
    expect(typeof c.suite).toBe('string');
    expect(i167(p)).toEqual([]);
  });
  test('une suite écrite sur la consigne d\'AVANT la séance (daté du 19/09) est refusée, avec la date', () => {
    const e = i167(plan([5, 5, 5], datee('2026-09-19T18:00:00+00:00')));
    expect(e.length).toBe(1);
    expect(e[0]).toMatch(/2026-09-19.*2026-09-26/);
  });
  test('sans charge répétée (trois charges différentes), la suite d\'une séance neutre n\'est pas jugée', () => {
    const series = [serie('t1', 120, 5), serie('t2', 122.5, 5), serie('t3', 125, 5)];
    const entrees = { seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'terre', series }] }, consignes: { terre: CONS }, reglage: 'normal', paris: [],
      suites: { terre: { consigne: datee('2026-09-19T18:00:00+00:00')(CONS.consigne), cranSuivant: null, cranSuivantApprochee: false, testConfirme: false } } };
    const p = { entrees, plan: T.planDeSeance(entrees) };
    expect(p.plan.exercices[0].constat && p.plan.exercices[0].constat.chargeRepetee).not.toBe(true);
    expect(i167(p)).toEqual([]);
  });
});
