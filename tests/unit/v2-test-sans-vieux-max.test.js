/** @jest-environment node */
//
// « PAS D'ESSAI SUR UN VIEUX MAX » (19/11/2026, MOTEUR §9.32) — une barre en reprise longue (`Moteur.repriseDe` = `longue` au premier jour de la
// semaine) ou sans max ne reçoit, en semaine de mesure, ni essai, ni montée, ni série « au max », ni pari. Le cas réel : le squat fait UNE fois le
// 18/04/2026 (100 kg × 5, force estimée 116,7 kg) a reçu un essai à 107,5 kg × 1 le 16/11.
//
//   1. la règle du moteur (`testBarreTestable`, `testBarreDuJour`, `testProposable`, `phraseSansEssai`) ;
//   2. les faits (`faits.reprisesAvantLeTest`, la date de `seriesDesMaxEstimesAvantLeTest`) ;
//   3. le plan, par le vrai chemin (`planDeSeance`, `verifierPlan` I224 à I227, `verifierPhrases` I26), sur le cas réel ;
//   4. une barre récente et une ancienne le même jour ; aucune barre testable ; une mesure « valable » mais une reprise longue.

process.env.TZ = 'Europe/Paris';
global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');
const Faits = require('../../v2/js/faits.js');

const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
const [SQ, DC, SDT, DM] = Modele.BARRES;
const FICHES = {
  [SQ]: { slug: SQ, nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] },
  [DC]: { slug: DC, nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] },
  [SDT]: { slug: SDT, nom: 'Soulevé de terre', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['ischio_jambiers', 'dos'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] },
  [DM]: { slug: DM, nom: 'Développé militaire', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['deltoides'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] }
};
const INDEX = Modele.indexerExercices(Object.values(FICHES));

// ── l'histoire : `specs` de la plus RÉCENTE à la plus ancienne, comme `c.seances` ──
const jourLocal = (iso) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j, 18, 0, 0); };
function corpus(specs) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((x, i) => {
    const id = 's' + i;
    seances.push({ id, debut: jourLocal(x.jour).toISOString(), fin: null });
    parSeance[id] = x.series.map((s, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k, exercise_slug: s[0], charge_kg: s[1], reps: s[2] }));
    parSeance[id].forEach((s) => series.push(s));
  });
  return { seances, series, exercices: Object.values(FICHES), seriesDe: (id) => parSeance[id] || [], catalogue: () => INDEX, journal: [] };
}
const DEBUT = '2026-11-16';
const faitsDe = (c, slugs) => {
  const f = Faits.creer();
  return { maxEstimes: f.maxEstimesAvantLeTest(c, slugs, DEBUT), seriesDuMax: f.seriesDesMaxEstimesAvantLeTest(c, slugs, DEBUT), reprises: f.reprisesAvantLeTest(c, slugs, DEBUT) };
};

function seance(slugs) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: 3 }); });
  se.exercices.forEach((ex) => ex.series.forEach((s) => { s.reps_visees = 5; }));
  return se;
}
function entrees(se, test, extra) {
  const consignes = {}, catalogue = {};
  se.exercices.forEach((ex) => {
    consignes[ex.exercise_slug] = { consigne: { etat: 'progression', zone: 'lourd', palier: 100, n: 3, ligne: { charge: 100, vise: 5 }, haut: null }, contexte: { cran: 102.5, haut: null } };
    catalogue[ex.exercise_slug] = FICHES[ex.exercise_slug];
  });
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-16T10:00:00Z', edition: false, routine_id: 'R', exercices: se.exercices },
    consignes, reglage: 'normal', paris: [], objectif: 'les_deux', catalogue,
    semaineDeTest: Object.assign({ debut: DEBUT, fin: '2026-11-22', modes: {}, mesures: {}, refus: {} }, test)
  }, extra || {});
}
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };

// Le cas réel : le squat une seule fois, le 18/04 (100 × 5) ; le couché hier encore.
const HISTOIRE_REELLE = [
  { jour: '2026-11-14', series: [[DC, 120, 5], [DC, 120, 5], [DC, 120, 4]] },
  { jour: '2026-11-07', series: [[DC, 117.5, 5], [DC, 117.5, 5]] },
  { jour: '2026-10-31', series: [[DC, 115, 5]] },
  { jour: '2026-04-18', series: [[SQ, 100, 5]] }
];

describe('1. la règle du moteur', () => {
  test('testBarreTestable : sans max ou en reprise longue, non ; sinon oui ; la mesure n’y change rien', () => {
    expect(M.testBarreTestable({ max: 116.7, reprise: 'aucune' })).toEqual({ testable: true, raison: null });
    expect(M.testBarreTestable({ max: 116.7, reprise: 'courte' })).toEqual({ testable: true, raison: null });
    expect(M.testBarreTestable({ max: 116.7, reprise: 'longue' })).toEqual({ testable: false, raison: 'reprise_longue' });
    expect(M.testBarreTestable({ max: null, reprise: 'aucune' })).toEqual({ testable: false, raison: 'sans_max' });
    expect(M.testBarreTestable({ max: 0, reprise: 'longue' })).toEqual({ testable: false, raison: 'sans_max' });
    expect(M.testBarreTestable({})).toEqual({ testable: false, raison: 'sans_max' });
  });

  test('testBarreDuJour ignore les barres non testables AVANT de choisir : la récente n’est pas « en conflit »', () => {
    const barres = [{ slug: SQ, classe: 'squat', testable: false }, { slug: SDT, classe: 'souleve', testable: true }, { slug: DC, classe: 'couche', testable: true }];
    expect(M.testBarreDuJour(barres, {}, {})).toBe(SDT);
    expect(M.testBarresEnConflit(barres, SDT)).toEqual([]);            // le squat non testable n'est jamais « en conflit » : il dit « pas d'essai »
    expect(M.testBarreDuJour(barres.slice(0, 1), {}, {})).toBeNull();
    // sans le drapeau (`testable` absent) : lue testable, comme avant
    expect(M.testBarreDuJour([{ slug: SQ, classe: 'squat' }], {}, {})).toBe(SQ);
  });

  test('testProposable : aucune barre testable → pas de semaine proposée, quelle que soit la voie ; absent = non lu', () => {
    const hors = { programme: false, semainesEntrainement: 8, semainePrecedenteAllegee: true, dechargeDansJours: null };
    expect(M.testProposable(Object.assign({}, hors, { barresTestables: 0 }))).toEqual({ propose: false, voie: null, raison: 'aucune_barre' });
    expect(M.testProposable(Object.assign({}, hors, { barresTestables: 1 })).propose).toBe(true);
    expect(M.testProposable(hors).propose).toBe(true);
    const prog = { programme: true, phasesFaites: 2, allegeeTerminee: true, maillonManquant: false };
    expect(M.testProposable(Object.assign({}, prog, { barresTestables: 0 })).raison).toBe('aucune_barre');
    expect(M.testProposable(Object.assign({}, prog, { barresTestables: 4 })).propose).toBe(true);
    expect(M.phraseTestPropose({ propose: false, raison: 'aucune_barre' })).toMatch(/aucune de tes quatre barres/);
  });

  test('phraseSansEssai : la phrase exacte, avec ou sans source ; date absolue', () => {
    expect(sp(M.phraseSansEssai('Squat', { charge: 100, reps: 5, date: '2026-04-18' }, '2026-11-16')))
      .toBe('Squat : pas d’essai cette semaine. Ta force estimée vient de 100 kg × 5, le 18 avr. : je n’ai pas de série assez récente pour régler un essai.');
    expect(sp(M.phraseSansEssai('Squat', null, '2026-11-16'))).toBe('Squat : pas d’essai cette semaine.');
    expect(sp(M.phraseSansEssai('Squat', { charge: 100, reps: 5, date: null }, '2026-11-16'))).toBe('Squat : pas d’essai cette semaine.');
  });

  test('le bilan dit « pas d’essai », jamais « pas testé »', () => {
    expect(sp(M.phraseBilanTest('Squat', null, null))).toBe('Squat : pas d’essai.');
  });
});

describe('2. les faits', () => {
  test('reprisesAvantLeTest : le squat du 18/04 est en reprise longue au 16/11, le couché de la semaine dernière non', () => {
    const f = faitsDe(corpus(HISTOIRE_REELLE), [SQ, DC, SDT]);
    expect(f.reprises[SQ]).toBe('longue');
    expect(f.reprises[DC]).not.toBe('longue');
    expect(f.reprises[SDT]).toBe('aucune');                              // aucune séance : une première séance n'est pas une reprise
    expect(f.maxEstimes[SQ]).toBeCloseTo(116.7, 1);
    expect(f.maxEstimes[SDT]).toBeNull();
  });

  test('la notion est `Moteur.repriseDe` : la frontière est celle des 84 jours (inclus : courte), sans fenêtre de plus', () => {
    const jours = (n) => { const d = new Date(2026, 10, 16, 18); d.setDate(d.getDate() - n); return d; };
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const deux = (n) => [{ jour: iso(jours(n)), series: [[SQ, 100, 5]] }, { jour: iso(jours(n + 7)), series: [[SQ, 100, 5]] }];
    const re = (n) => faitsDe(corpus(deux(n)), [SQ]).reprises[SQ];
    expect(re(84)).toBe('courte');
    expect(re(85)).toBe('longue');
  });

  test('la série d’où vient la force estimée porte sa date (jour civil)', () => {
    const f = faitsDe(corpus(HISTOIRE_REELLE), [SQ]);
    expect(f.seriesDuMax[SQ]).toEqual({ charge: 100, reps: 5, date: '2026-04-18' });
  });
});

describe('3. le plan — le cas réel du squat', () => {
  const plan = (histoire, slugs, extra, test) => {
    const c = corpus(histoire);
    const f = faitsDe(c, slugs);
    const e = entrees(seance(slugs), Object.assign({}, f, test || {}), extra);
    return { p: T.planDeSeance(e), e };
  };

  test('squat seul le 16/11 : aucune ligne d’essai, ni montée, ni série, ni pari ; la phrase exacte ; les invariants tiennent', () => {
    const { p, e } = plan(HISTOIRE_REELLE, [SQ]);
    const t = p.exercices[0].semaineDeTest;
    expect(t).toMatchObject({ barre: true, testee: false, etat: 'pas_d_essai' });
    expect(t.pasDEssai.raison).toBe('reprise_longue');
    expect(sp(t.pasDEssai.phrase)).toBe('Squat : pas d’essai cette semaine. Ta force estimée vient de 100 kg × 5, le 18 avr. : je n’ai pas de série assez récente pour régler un essai.');
    expect(t.prochain).toBeUndefined(); expect(t.serie).toBeUndefined(); expect(t.montee).toBeUndefined(); expect(t.pari).toBeUndefined(); expect(t.ajout).toBeUndefined();
    expect(p.semaineDeTest.testee).toBeNull();
    expect(p.semaineDeTest.sansEssai).toEqual([SQ]);
    expect(p.exercices[0].auMax).toBeUndefined(); expect(p.exercices[0].propositionAuMax).toBeUndefined();
    // l'ancien essai : 107,5 kg × 1 (92 % de 116,7) n'est écrit nulle part
    expect(JSON.stringify(p.exercices[0].phrases)).not.toMatch(/107,5/);
    // un max qui lit « 116,7 » n'est pas dit non plus (force estimée, jamais « max estimé » à l'écran)
    expect(sp(JSON.stringify(p.exercices[0].phrases))).not.toMatch(/max estimé/);
    propre(p, e);
  });

  test('sans aucune série estimable : la tête seule', () => {
    const { p, e } = plan([{ jour: '2026-04-18', series: [[SQ, 100, 1]] }], [SQ]);
    const t = p.exercices[0].semaineDeTest;
    expect(t.pasDEssai.raison).toBe('sans_max');
    expect(sp(t.pasDEssai.phrase)).toBe('Squat : pas d’essai cette semaine.');
    propre(p, e);
  });

  test('barre récente + barre ancienne le même jour : la récente est testée, l’ancienne dit « pas d’essai »', () => {
    const { p, e } = plan(HISTOIRE_REELLE, [SQ, DC]);
    expect(p.semaineDeTest.testee).toBe(DC);
    expect(p.semaineDeTest.conflits).toEqual([]);
    expect(p.exercices[0].semaineDeTest.pasDEssai.raison).toBe('reprise_longue');
    expect(p.exercices[1].semaineDeTest).toMatchObject({ testee: true, etat: 'a_faire' });
    expect(p.exercices[1].semaineDeTest.prochain.rang).toBe(1);
    propre(p, e);
  });

  test('la vieille barre passe en conflit avec une récente du même groupe (squat + soulevé) : le soulevé récent est testé', () => {
    const h = HISTOIRE_REELLE.concat([{ jour: '2026-11-10', series: [[SDT, 160, 5], [SDT, 160, 5]] }]).sort((a, b) => (a.jour < b.jour ? 1 : -1));
    const { p, e } = plan(h, [SQ, SDT]);
    expect(p.semaineDeTest.testee).toBe(SDT);
    expect(p.semaineDeTest.conflits).toEqual([]);
    expect(p.exercices[0].semaineDeTest.pasDEssai).toBeTruthy();
    propre(p, e);
  });

  test('une mesure encore « valable » (90 jours) n’y change rien : la condition est la reprise', () => {
    const mesure = { valeur: 120, date: jourLocal('2026-08-20').toISOString(), charge: 120, reps: 1 };
    expect(M.testMesureValable([mesure], DEBUT)).not.toBeNull();                       // 88 jours : encore valable
    const histoire = [{ jour: '2026-11-14', series: [[DC, 120, 5]] }, { jour: '2026-08-20', series: [[SQ, 120, 1], [SQ, 100, 5]] }];
    const c = corpus(histoire);
    const f = faitsDe(c, [SQ]);
    expect(f.reprises[SQ]).toBe('longue');
    expect(f.maxEstimes[SQ]).toBeCloseTo(116.7, 1);                                     // la mesure n'entre pas dans le max d'avant la semaine
    const e = entrees(seance([SQ]), Object.assign({ mesures: {} }, f));
    const p = T.planDeSeance(e);
    expect(p.exercices[0].semaineDeTest.pasDEssai.raison).toBe('reprise_longue');
    propre(p, e);
  });

  test('une barre qui n’est pas en reprise longue garde son essai, au max `unRM` (pas de décote)', () => {
    const { p, e } = plan(HISTOIRE_REELLE, [DC]);
    const t = p.exercices[0].semaineDeTest;
    expect(t.testee).toBe(true);
    expect(t.max).toBe(Math.round(120 * (1 + 5 / 30)));
    expect(t.prochain.charge).toBeGreaterThan(0);
    propre(p, e);
  });

  test('un max nul sur la barre testée : plus de « sans_max » à l’écran, aucune barre n’est testée', () => {
    const { p, e } = plan([], [DC]);
    expect(p.exercices[0].semaineDeTest.pasDEssai.raison).toBe('sans_max');
    expect(p.semaineDeTest.testee).toBeNull();
    propre(p, e);
  });
});

describe('3 bis. les invariants I224 à I227 voient un plan faux', () => {
  const base = () => {
    const c = corpus(HISTOIRE_REELLE);
    const f = faitsDe(c, [SQ, DC]);
    const e = entrees(seance([SQ, DC]), f);
    return { e, p: T.planDeSeance(e) };
  };
  const erreurs = (p, e) => T.verifierPlan(p, e).erreurs.join(' | ');

  test('I224 — un essai, une montée ou un pari sur la barre en reprise longue', () => {
    const { e, p } = base();
    const faux = JSON.parse(JSON.stringify(p));
    faux.exercices[0].semaineDeTest = Object.assign({}, faux.exercices[1].semaineDeTest, { slug: SQ });
    expect(erreurs(faux, e)).toMatch(/I224/);
  });

  test('I224 — la barre non testable qui ne dit pas « pas d’essai »', () => {
    const { e, p } = base();
    const faux = JSON.parse(JSON.stringify(p));
    delete faux.exercices[0].semaineDeTest.pasDEssai;
    expect(erreurs(faux, e)).toMatch(/I224.*ne dit pas/);
  });

  test('I225 — la barre en reprise longue qui prend le créneau, et la barre testable ignorée', () => {
    const { e, p } = base();
    const faux = JSON.parse(JSON.stringify(p));
    faux.semaineDeTest.testee = SQ;
    expect(erreurs(faux, e)).toMatch(/I225.*reprise longue/);
    const faux2 = JSON.parse(JSON.stringify(p));
    faux2.semaineDeTest.testee = null;
    expect(erreurs(faux2, e)).toMatch(/I225.*testable/);
  });

  test('I226 — une charge proposée sans max (le max des entrées fait foi) ; I227 — un pari sans max', () => {
    const { e, p } = base();
    const faux = JSON.parse(JSON.stringify(p));
    const ent = JSON.parse(JSON.stringify(e));
    ent.semaineDeTest.maxEstimes[DC] = null;
    expect(erreurs(faux, ent)).toMatch(/I226/);
    expect(erreurs(faux, ent)).toMatch(/I227/);
    // le trou fermé : un plan qui porte lui-même un max nul avec une charge n'est plus « présent par défaut »
    const sans = JSON.parse(JSON.stringify(p));
    sans.exercices[1].semaineDeTest.max = null;
    expect(erreurs(sans, e)).toMatch(/I226/);
  });

  test('le plan vrai est propre', () => {
    const { e, p } = base();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});
