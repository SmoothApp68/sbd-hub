/** @jest-environment node */
//
// 49-U4 — le constat de fin de bloc lit le plan (MOTEUR §9.13 bis, I10 ;
// ECRAN-SAISIE §3.9).
//
// LE CONSTAT DU 26/09/2026 (D4). Sous l'ancienne règle, le coach proposait
// 127,5 sur la série 2 ; la séance a fait 125 × 8, 127,5 × 4, 130 × 4. Trois
// charges différentes : aucune charge répétée, donc aucun palier pour
// `analyser`, et le constat — calculé à part sur les séries BRUTES — disait
// « Pas de palier aujourd'hui » juste après une montée annoncée « dans ta
// zone ». Le plan, lui, sait que la ligne 2 était une ligne du coach, et
// qu'elle a tenu.

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const P = require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const AVANT = '2026-09-26T10:00:00+00:00';
const APRES = '2026-09-26T12:00:00+00:00';
const OPTS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };

// La séance du jour : trois séries de travail, validées ou non.
const serie = (id, kg, reps) => ({ id, type_serie: 'travail', charge_kg: kg, reps, rpe: null, ressenti: null,
  validee_a: kg === null ? null : '2026-09-26T10:30:00Z', source: kg === null ? null : 'app' });
// Un pari tel que l'app l'écrit, observé sur sa série.
const pari = (sid, rang, role, charge, vise, extra) => Object.assign({
  id: 'p-' + sid, exercise_slug: 'terre', set_observe: sid, valeur_predite: vise, borne_basse: 3, borne_haute: 5,
  fondement: Object.assign({ rang, charge, role, seance: 'S' }, extra || {})
});

// ── LE DÉCOR DU 26/09 ───────────────────────────────────────────────────────
const set = (sid, kg, reps, rang) => ({ id: sid + '-' + rang, session_id: sid, exercise_slug: 'terre',
  charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', rang, validee_a: 'v', source: 'app' });
const jour = (d) => (d === '01' ? '2026-08-' : '2026-09-') + d + 'T18:00:00+00:00';
const HISTOIRE = [['z', '01', [[127.5, 3], [127.5, 3], [127.5, 3]]], ['a', '05', [[120, 5], [120, 5], [120, 5]]],
  ['b', '12', [[122.5, 5], [122.5, 5], [122.5, 5]]], ['c', '19', [[125, 5], [125, 5], [125, 5], [130, 4]]]]
  .map(([sid, d, l]) => ({ seance: { id: sid, debut: jour(d) }, series: l.map(([kg, r], i) => set(sid, kg, r, i + 1)) }));
const ETAT = P.etatsExercices(P.seanceExercices([].concat(...HISTOIRE.map((g) =>
  g.series.map((s) => Object.assign({ slug: 'terre' }, s))))));
const CONS = M.consigneDExercice(HISTOIRE, ETAT.terre, AVANT, OPTS);

// Le plan d'une séance de trois séries, les paris donnés, la suite calculée
// comme l'app la calcule (sur l'historique augmenté des séries faites).
function planDu26(series, paris, sansSuite) {
  const faites = series.filter((s) => S.partEnBase(s));
  const fini = faites.length === series.length;
  const suite = fini && !sansSuite
    ? M.suiteDExercice(HISTOIRE, { seance: { debut: AVANT }, series: faites }, ETAT.terre, APRES, OPTS) : null;
  const entrees = { seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'terre', series }] },
    consignes: { terre: CONS }, reglage: 'normal', paris,
    suites: suite ? { terre: { consigne: suite.apres.consigne, cranSuivant: suite.cranSuivant } } : {} };
  return { entrees, plan: T.planDeSeance(entrees) };
}

// Les paris que l'ANCIENNE règle écrivait : la proposition du coach (révision
// 1) sur la série 2, prévue en test à 130 (avant 49-U1).
const PARIS_ANCIENS = [
  pari('t1', 1, 'ligne', 125, 5),
  pari('t2', 2, 'coach', 127.5, 3, { revision: 1, charges: [127.5] }),
  pari('t3', 3, 'haut', 130, 4)
];
const SEANCE_26 = [serie('t1', 125, 8), serie('t2', 127.5, 4), serie('t3', 130, 4)];

describe('49-U4 — le cas du 26/09, reconstitué sous l’ancienne règle', () => {
  const { entrees, plan } = planDu26(SEANCE_26, PARIS_ANCIENS);
  const x = plan.exercices[0];

  test('prémisse : la ligne 2 est une ligne du COACH, faite à sa charge ; les trois sont figées', () => {
    expect(x.lignes.map((l) => l.role + ':' + l.charge)).toEqual(['ligne:125', 'coach:127.5', 'test:130']);
    expect(x.lignes.every((l) => l.figee && l.validee)).toBe(true);
  });

  test('prémisse : l’ancien constat, calculé à part sur les séries brutes, disait « Pas de palier aujourd’hui »', () => {
    const ancien = M.constatDExercice(HISTOIRE, { seance: { debut: AVANT }, series: SEANCE_26 },
      ETAT.terre, AVANT, APRES, OPTS);
    expect(ancien.constat.verdict).toMatch(/^Pas de palier aujourd'hui/);
  });

  test('⚠️ DISCRIMINANT — le constat du plan ne dit plus « Pas de palier » : il dit la montée tenue', () => {
    expect(x.constat.verdict).not.toMatch(/Pas de palier/);
    expect(x.constat.montee).toEqual({ charge: 127.5, reps: 4 });
    expect(x.constat.verdict.replace(/[\u00a0\u202f]/g, ' ')).toBe(
      'La montée du coach a tenu : 127,5 × 4, dans ta zone. Elle compte comme un test tenu.');
  });

  test('⚠️ RAPPORTÉ, NON CORRIGÉ — la suite, elle, ne propose aucune charge (`consignePour` en silence)', () => {
    // Trois charges différentes sur la séance du jour : la consigne de la
    // prochaine séance n'a pas de palier. I10 (b) le signale à part ; c'est
    // une décision de fond (Claude.ai, Aurélien), pas de ce commit.
    expect(x.constat.suiteEtat).toBe('silence');
    expect(x.constat.suite).toBeNull();
    const v = T.verifierPlan(plan, entrees);
    expect(v.erreurs.filter((e) => e.indexOf('I10 suite') !== 0)).toEqual([]);
    expect(v.erreurs.filter((e) => e.indexOf('I10 suite') === 0)).toHaveLength(1);
  });
});

// ── LE VERDICT DE LA MONTÉE NE REMPLACE QUE CE QUI LA CONTREDIT ─────────────
//
// Décidé le 27/09/2026 : la montée tenue ne prend la place du verdict que
// s'il la contredit (« Pas de palier », « Pas encore »). Une séance qui a
// tenu PLUS que la montée — ici deux tests à 130 après la montée à 127,5 —
// garde son verdict : il dit déjà mieux.
describe('49-U4 — un verdict qui ne contredit pas la montée reste tel qu’il était', () => {
  const SEANCE = [serie('t1', 125, 5), serie('t2', 127.5, 4), serie('t3', 130, 4), serie('t4', 130, 4)];
  const PARIS = PARIS_ANCIENS.concat([pari('t4', 4, 'haut', 130, 4)]);
  const { entrees, plan } = planDu26(SEANCE, PARIS);
  const x = plan.exercices[0];

  test('prémisse : une montée du coach tenue, puis deux tests tenus à 130', () => {
    expect(x.lignes.map((l) => l.role + ':' + l.charge)).toEqual(['ligne:125', 'coach:127.5', 'test:130', 'test:130']);
    expect(x.lignes.every((l) => l.validee)).toBe(true);
  });

  test('⚠️ DISCRIMINANT — le verdict reste « ta nouvelle charge tient » ; la montée est portée à part', () => {
    expect(x.constat.verdict.replace(/[\u00a0\u202f]/g, ' ')).toBe(
      '4-4 à 130 : ta nouvelle charge tient sur 2 séries, dans ta zone.');
    expect(x.constat.montee).toEqual({ charge: 127.5, reps: 4 });
    expect(T.verifierPlan(plan, entrees).erreurs).toEqual([]);
  });
});

describe('49-U4 — I10 (a) : pas de constat avant la dernière ligne validée', () => {
  test('deux séries faites sur trois : aucun constat, même si une suite est fournie', () => {
    const series = [serie('t1', 125, 8), serie('t2', 127.5, 4), serie('t3', null, null)];
    const suite = M.suiteDExercice(HISTOIRE, { seance: { debut: AVANT }, series: series.slice(0, 2) },
      ETAT.terre, APRES, OPTS);
    const entrees = { seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'terre', series }] },
      consignes: { terre: CONS }, reglage: 'normal', paris: PARIS_ANCIENS.slice(0, 2),
      suites: { terre: { consigne: suite.apres.consigne, cranSuivant: suite.cranSuivant } } };
    expect(T.planDeSeance(entrees).exercices[0].constat).toBeNull();
  });

  test('la dernière validée : le constat apparaît', () => {
    expect(planDu26(SEANCE_26, PARIS_ANCIENS).plan.exercices[0].constat).not.toBeNull();
  });
});

describe('49-U4 — I10 (c) : une séance menée par le coach n’est jamais « Pas de palier »', () => {
  // Hypertrophie 8-10. 50 × 12, puis 52,5 proposé et accepté à 52,5 × 11 —
  // au-dessus de la zone, donc pas une montée « tenue dans la zone » —, puis
  // le test à 55 × 8. Tout a suivi sa ligne ; trois charges, aucun palier.
  const C = { etat: 'progression', zone: 'hypertrophie', palier: 50, niveau: 9, n: 3,
    ligne: { charge: 50, vise: 9 }, haut: { charge: 55, vise: 8, k: 1 } };
  const series = [serie('h1', 50, 12), serie('h2', 52.5, 11), serie('h3', 55, 8)];
  const paris = [
    Object.assign(pari('h1', 1, 'ligne', 50, 9), { exercise_slug: 'x' }),
    Object.assign(pari('h2', 2, 'coach', 52.5, 8, { revision: 1, charges: [52.5] }), { exercise_slug: 'x' }),
    Object.assign(pari('h3', 3, 'haut', 55, 8), { exercise_slug: 'x' })
  ];
  const apres = M.consignePour(M.contratDe([{ seance: { debut: AVANT }, series }], null, 'charge_reps'), APRES, {});
  const entrees = { seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'x', series }] },
    consignes: { x: { consigne: C, contexte: { cran: 52.5, haut: null } } }, reglage: 'normal', paris,
    suites: { x: { consigne: apres, cranSuivant: null } } };
  const x = T.planDeSeance(entrees).exercices[0];

  test('prémisse : toutes suivies, la ligne du coach au-dessus de la zone, la suite sans palier', () => {
    expect(x.lignes.map((l) => l.role)).toEqual(['ligne', 'coach', 'test']);
    expect(apres.etat).toBe('silence');
    expect(M.constatDe(C, apres, 'normal', null).verdict).toMatch(/^Pas de palier/);
  });

  test('⚠️ DISCRIMINANT — le constat dit que le coach a mené les charges, pas « Pas de palier »', () => {
    expect(x.constat.orchestre).toBe(true);
    expect(x.constat.verdict.replace(/[\u00a0\u202f]/g, ' ')).toBe(
      'Le coach a mené tes charges aujourd\'hui : 50 × 12, 52,5 × 11, 55 × 8.');
    expect(T.verifierPlan(T.planDeSeance(entrees), entrees).erreurs).toEqual([]);
  });

  test('témoin : une série qui n’a PAS suivi sa ligne rend le constat d’avant', () => {
    const s2 = [serie('h1', 50, 12), serie('h2', 50, 11), serie('h3', 55, 8)];
    const a2 = M.consignePour(M.contratDe([{ seance: { debut: AVANT }, series: s2 }], null, 'charge_reps'), APRES, {});
    const e2 = Object.assign({}, entrees, { seance: Object.assign({}, entrees.seance, { exercices: [{ exercise_slug: 'x', series: s2 }] }),
      paris: [paris[0], Object.assign({}, paris[1]), paris[2]], suites: { x: { consigne: a2, cranSuivant: null } } });
    const k = T.planDeSeance(e2).exercices[0].constat;
    expect(k.orchestre).toBe(false);
    expect(k.montee).toBeNull();
  });
});

// ── I10 — verifierPlan voit chaque violation ────────────────────────────────
describe('49-U4 — I10 : verifierPlan voit chaque violation', () => {
  const { entrees, plan } = planDu26(SEANCE_26, PARIS_ANCIENS);
  const copie = () => JSON.parse(JSON.stringify(plan));
  const i10 = (p) => T.verifierPlan(p).erreurs.filter((e) => /^I10 —/.test(e)).join(' ');

  test('prémisse : le plan juste n’a pas d’erreur I10 hors la suite rapportée', () => {
    expect(T.verifierPlan(plan, entrees).erreurs.filter((e) => /^I10 —/.test(e))).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — (a) un constat alors qu’une ligne n’est pas faite', () => {
    const p = copie(); p.exercices[0].lignes[2].validee = false;
    expect(i10(p)).toMatch(/un constat alors qu'une ligne de travail n'est pas faite/);
  });

  test('⚠️ DISCRIMINANT — (b) une montée tenue que le constat ne dit pas', () => {
    const p = copie();
    p.exercices[0].constat.montee = null;
    p.exercices[0].constat.verdict = 'Pas encore : 8-4-4 à 125.';
    expect(i10(p)).toMatch(/une montée du coach a tenu à 127.5, le constat ne la dit pas/);
  });

  test('⚠️ DISCRIMINANT — (b) la montée portée, mais un verdict qui la contredit', () => {
    ['Pas encore : 8-4-4 à 125.', 'Pas de palier aujourd\'hui : rien de répété sur deux séries.'].forEach((v) => {
      const p = copie(); p.exercices[0].constat.verdict = v;
      expect(i10(p)).toMatch(/une montée du coach a tenu à 127.5, le constat ne la dit pas/);
    });
    // Témoin : un verdict qui ne la contredit pas passe.
    const q = copie(); q.exercices[0].constat.verdict = '4-4 à 130 : ta nouvelle charge tient sur 2 séries, dans ta zone.';
    expect(i10(q)).toBe('');
  });

  test('⚠️ DISCRIMINANT — (c) « Pas de palier » alors que tout a suivi le plan', () => {
    const p = copie();
    p.exercices[0].lignes[1].role = 'ligne';            // plus de montée à dire
    p.exercices[0].lignes[1].charge = 127.5;
    p.exercices[0].constat.montee = null;
    p.exercices[0].constat.verdict = 'Pas de palier aujourd\'hui : rien de répété sur deux séries.';
    expect(i10(p)).toMatch(/« Pas de palier » alors que toutes les séries ont suivi le plan/);
  });

  test('(b) la suite : sous la montée, signalée à part ; à sa hauteur, rien', () => {
    const bas = copie(); bas.exercices[0].constat.suiteCharges = [125, null];
    expect(T.verifierPlan(bas).erreurs.join(' ')).toMatch(/I10 suite — .*propose 125/);
    const juste = copie(); juste.exercices[0].constat.suiteCharges = [125, 127.5];
    expect(T.verifierPlan(juste).erreurs.filter((e) => /^I10/.test(e))).toEqual([]);
  });
});
