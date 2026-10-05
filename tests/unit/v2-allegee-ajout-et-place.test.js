/** @jest-environment node */
//
// PR 4 de la consolidation « un seul coach, un seul câblage » (relevé du
// 01/10/2026) — LA SEMAINE ALLÉGÉE D'UN EXERCICE AJOUTÉ, ET LA PLACE DE LA
// SÉRIE AJOUTÉE.
//
//   1. « + Série » après une dégressive : la nouvelle série de travail se met
//      après la dernière série de travail, avant les dégressives qui terminent
//      l'exercice (tant qu'aucune n'est faite). Avant, elle tombait APRÈS la
//      dégressive — une série de travail derrière sa dégressive.
//   2. Un exercice ajouté (ou inséré) en pleine semaine allégée reçoit ses
//      seules lignes allégées, comme à l'ouverture (`lignesARetirer`, restreint
//      à lui). Avant, il gardait toutes ses lignes de départ, et la dernière
//      restait « hors plan ». Le remplacement n'y passe pas : sa place reprend
//      les lignes de l'exercice remplacé, déjà allégées.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const types = (se, i) => se.exercices[i || 0].series.map((s) => s.type_serie + (s.validee_a ? '✓' : ''));
function seance(travail) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'curl', id, { series: travail });
  return { se, id };
}
const enDegressive = (se, j) => S.changerType(se, 0, j, 'degressive');
const valider = (se, j) => S.valider(S.modifierSerie(se, 0, j, { charge_kg: 20, reps: 8 }), 0, j, new Date('2026-10-02T10:00:00Z'));

// ── 1. LA PLACE DE LA SÉRIE AJOUTÉE ─────────────────────────────────────────
describe('PR 4 — « + Série » : la nouvelle série de travail avant la dégressive', () => {
  test('⚠️ DISCRIMINANT — travail, travail, dégressive → la série ajoutée se place avant la dégressive', () => {
    let { se, id } = seance(3);
    se = enDegressive(se, 2);
    se = S.ajouterSerie(se, 0, id);
    expect(types(se)).toEqual(['travail', 'travail', 'travail', 'degressive']);
    // La ligne ajoutée est vide, et c'est bien la nouvelle (son identifiant).
    expect(se.exercices[0].series[2]).toMatchObject({ id: 's4', charge_kg: null, reps: null, validee_a: null });
  });

  test('deux dégressives en fin d’exercice : la série se place avant les deux', () => {
    let { se, id } = seance(4);
    se = enDegressive(enDegressive(se, 2), 3);
    se = S.ajouterSerie(se, 0, id);
    expect(types(se)).toEqual(['travail', 'travail', 'travail', 'degressive', 'degressive']);
  });

  test('sans dégressive : à la fin, comme avant', () => {
    let { se, id } = seance(2);
    se = S.ajouterSerie(se, 0, id);
    expect(types(se)).toEqual(['travail', 'travail', 'travail']);
    expect(se.exercices[0].series[2].id).toBe('s3');
  });

  test('une dégressive déjà faite : la séquence est entamée, la série va à la fin', () => {
    let { se, id } = seance(3);
    se = valider(valider(valider(enDegressive(se, 2), 0), 1), 2);
    se = S.ajouterSerie(se, 0, id);
    expect(types(se)).toEqual(['travail✓', 'travail✓', 'degressive✓', 'travail']);
  });

  test('une dégressive sans série de travail avant elle : à la fin (rien à précéder)', () => {
    let { se, id } = seance(1);
    se = enDegressive(se, 0);
    se = S.ajouterSerie(se, 0, id);
    expect(types(se)).toEqual(['degressive', 'travail']);
  });

  test('une dégressive au milieu (suivie d’une série de travail) : à la fin', () => {
    let { se, id } = seance(3);
    se = enDegressive(se, 1);
    se = S.ajouterSerie(se, 0, id);
    expect(types(se)).toEqual(['travail', 'degressive', 'travail', 'travail']);
  });

  test('le plan lit la nouvelle série comme une série de travail, la dégressive reste après', () => {
    let { se, id } = seance(3);
    se = enDegressive(se, 2);
    se = S.ajouterSerie(se, 0, id);
    const k = { etat: 'progression', zone: 'hypertrophie', palier: 20, niveau: 9, n: 3, ligne: { charge: 20, vise: 10 },
      haut: null, fondement: {} };
    const e = { seance: { id: 'S', debut: '2026-10-02T09:00:00Z', edition: false, exercices: se.exercices },
      consignes: { curl: { consigne: k } }, catalogue: { curl: { equipement: 'haltere', muscles_primaires: ['biceps'] } },
      paris: [], suites: {} };
    const p = T.planDeSeance(e);
    expect(p.exercices[0].lignes.map((l) => l.type + ':' + l.role)).toEqual(['travail:ligne', 'travail:ligne', 'travail:ligne', 'degressive:hors']);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

// ── 2. LA SEMAINE ALLÉGÉE, RESTREINTE À UN EXERCICE ─────────────────────────
const DEBUT = '2026-10-01T10:00:00+00:00';
const C = { etat: 'progression', zone: 'hypertrophie', palier: 50, niveau: 9, n: 3,
  ligne: { charge: 50, vise: 10 }, haut: null, fondement: {} };
const ACCEPTEE = { seance: 'S0', jour: '2026-10-01', declencheur: 'couche', compteur: 4, reponse: 'acceptee',
  debut: '2026-10-01', fin: M.finAllegee('2026-10-01') };
function decorAllege(series) {
  let n = 0;
  const id = () => 'x' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: series[0] });
  se = S.ajouterExercice(se, 'curl', id, { series: series[1] });
  const cons = (k) => ({ consigne: k, libelles: M.libellesConsigne(k) });
  const e = { seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { couche: cons(Object.assign({}, C, { n: 4 })), curl: cons(C) }, reglage: 'normal', paris: [], suites: {},
    escalier: { cartes: [ACCEPTEE], compteurs: [], noms: {}, seriesRoutine: { couche: 4, curl: 3 } } };
  return { se, e, p: T.planDeSeance(e) };
}

describe('PR 4 — `lignesARetirer(plan, iExo)` : la semaine allégée d’un seul exercice', () => {
  test('prémisse : le plan est en semaine allégée, les deux exercices ont des lignes en trop', () => {
    const { p } = decorAllege([4, 3]);
    expect(p.allegee).not.toBeNull();
    expect(T.lignesARetirer(p)).toEqual([{ iExo: 0, iSerie: 3 }, { iExo: 0, iSerie: 2 }, { iExo: 1, iSerie: 2 }]);
  });
  test('⚠️ DISCRIMINANT — restreinte à l’exercice ajouté : ses seules lignes, pas celles de l’autre', () => {
    const { p } = decorAllege([4, 3]);
    expect(T.lignesARetirer(p, 1)).toEqual([{ iExo: 1, iSerie: 2 }]);
    expect(T.lignesARetirer(p, 0)).toEqual([{ iExo: 0, iSerie: 3 }, { iExo: 0, iSerie: 2 }]);
  });
  test('un « + Série » rajouté sur l’autre exercice après l’ouverture reste : la restriction ne le voit pas', () => {
    // L'ouverture a allégé le couché à 2 lignes ; la personne en rajoute une.
    const { p } = decorAllege([3, 3]);
    expect(T.lignesARetirer(p, 1)).toEqual([{ iExo: 1, iSerie: 2 }]);
    expect(T.lignesARetirer(p, 1).some((r) => r.iExo === 0)).toBe(false);
  });
  test('hors semaine allégée : rien, avec ou sans exercice', () => {
    const { e } = decorAllege([4, 3]);
    const p = T.planDeSeance(Object.assign({}, e, { escalier: Object.assign({}, e.escalier, { cartes: [] }) }));
    expect(T.lignesARetirer(p, 1)).toEqual([]);
  });
});

// ── 3. LE CÂBLAGE : L'EXERCICE AJOUTÉ, ET LUI SEUL ──────────────────────────
//
// `allegeePourAjout` et `exerciceAjoute` (app.js), rejoués dans un bac sur le
// vrai plan et la vraie séance.
describe('PR 4 — l’app allège l’exercice qu’on vient d’ajouter', () => {
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const extraire = (nom) => {
    const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
    if (!m) throw new Error('introuvable : ' + nom);
    return m[0];
  };
  function bac(se, e) {
    const entree = () => Object.assign({}, e, { seance: Object.assign({}, e.seance, { exercices: ctx.seance.exercices }) });
    const ctx = { seance: se, Plan: T, Seance: S, gestes: 0, enEdition: () => false, entree,
      planActuel: () => T.planDeSeance(entree()),
      apresGeste: async () => { ctx.gestes++; } };
    vm.createContext(ctx);
    ['exerciceAjoute', 'allegeePourAjout'].forEach((n) => vm.runInContext(extraire(n), ctx));
    return ctx;
  }

  test('⚠️ DISCRIMINANT — un curl ajouté (3 séries de départ) en semaine allégée garde 2 lignes ; le couché n’est pas touché', async () => {
    // Le couché a été allégé à l'ouverture (2 lignes), puis la personne y a
    // rajouté une série : elle reste.
    const { se, e } = decorAllege([3, 3]);
    const avant = [se.exercices[0]];
    const b = bac(se, e);
    await vm.runInContext('allegeePourAjout(avant, "curl")', Object.assign(b, { avant }));
    expect(b.seance.exercices[0].series).toHaveLength(3);
    expect(b.seance.exercices[1].series).toHaveLength(2);
    expect(b.gestes).toBe(1);
    expect(T.verifierPlan(b.planActuel(), b.entree()).erreurs).toEqual([]);
  });

  test('un exercice déjà là (présent avant l’ajout) n’est pas allégé une seconde fois', async () => {
    const { se, e } = decorAllege([3, 3]);
    const b = bac(se, e);
    b.avant = se.exercices.slice();
    await vm.runInContext('allegeePourAjout(avant, "curl")', b);
    expect(b.seance.exercices[1].series).toHaveLength(3);
    expect(b.gestes).toBe(0);
  });

  test('hors semaine allégée : rien', async () => {
    const { se, e } = decorAllege([3, 3]);
    const sans = Object.assign({}, e, { escalier: Object.assign({}, e.escalier, { cartes: [] }) });
    const b = bac(se, sans);
    b.avant = [se.exercices[0]];
    await vm.runInContext('allegeePourAjout(avant, "curl")', b);
    expect(b.seance.exercices[1].series).toHaveLength(3);
    expect(b.gestes).toBe(0);
  });

  test('le catalogue : l’ajout et l’insertion passent par l’allégée ; le remplacement non', () => {
    const corps = extraire('rendreCatalogue');
    // 51-2 — le remplacement est un chemin partagé avec le frère de « Machine
    // prise » (`remplacerDansLaSeance`) : sa ligne de plus, jamais l'allégée.
    expect(corps.slice(0, corps.indexOf('Seance.insererExercice')))
      .toMatch(/return remplacerDansLaSeance\(intentionCatalogue\.remplace, exo\.slug\)/);
    const rempl = extraire('remplacerDansLaSeance');
    expect(rempl).toMatch(/Seance\.remplacerExercice\([\s\S]*ligneDePlusPourAjout\(avant, slug\)/);
    expect(rempl).not.toMatch(/Allegee/);
    const suite = corps.slice(corps.indexOf('Seance.insererExercice'));
    expect((suite.match(/\.then\(puisAllegeeEtLigneDePlus\)/g) || [])).toHaveLength(2);
  });
});
