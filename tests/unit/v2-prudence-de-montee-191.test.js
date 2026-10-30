/** @jest-environment node */
//
// 191 — LA PRUDENCE DE MONTÉE, SELON L'ÂGE ET L'EXPÉRIENCE (MOTEUR §9.1.2, delta 191, décision d'Aurélien du 30/10/2026).
//   · plafond des sauts de plusieurs crans à +10 % : débutant OU 65 ans et plus ;
//   · débutant de 50 ans et plus : un cran à la fois (dépassement, calage) ;
//   · un cran seul reste permis ; l'année de naissance absente : aucune de ces règles, jamais un âge deviné ;
//   · un seul prédicat, lu par le plafond, le calage, le dépassement et I71 / I73.

process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const P = require('../../v2/js/profil.js');
const T = require('../../v2/js/plan.js');

const AUJOURDHUI = new Date(2026, 9, 30);           // 30/10/2026
const profilNe = (annee, anciennete) => ({ anciennete: anciennete || null, date_naissance: annee === null ? null : annee + '-01-01' });
const ans = (n) => 2026 - n;                         // né le 1er janvier : l'âge au 30/10/2026

// ── 1. Le prédicat ────────────────────────────────────────────────────────────────────────────────────────────────────
describe('191 — prudenceDeMontee : un seul prédicat', () => {
  test('⚠️ 49 et 50 ans, débutant : le plafond à 10 % partout ; « un cran à la fois » dès 50', () => {
    expect(P.prudenceDuProfil(profilNe(ans(49), 'moins_1_an'), AUJOURDHUI)).toEqual({ plafond: 0.10, unCran: false, raison: 'debutant' });
    expect(P.prudenceDuProfil(profilNe(ans(50), 'moins_1_an'), AUJOURDHUI)).toEqual({ plafond: 0.10, unCran: true, raison: 'debutant_age' });
    expect(P.prudenceDuProfil(profilNe(ans(55), 'moins_1_an'), AUJOURDHUI).unCran).toBe(true);
  });
  test('⚠️ 64 et 65 ans, intermédiaire : le plafond à 10 % dès 65, JAMAIS « un cran à la fois »', () => {
    expect(P.prudenceDuProfil(profilNe(ans(64), '1_a_3_ans'), AUJOURDHUI)).toEqual({ plafond: 0.15, unCran: false, raison: null });
    expect(P.prudenceDuProfil(profilNe(ans(65), '1_a_3_ans'), AUJOURDHUI)).toEqual({ plafond: 0.10, unCran: false, raison: 'age' });
    expect(P.prudenceDuProfil(profilNe(ans(80), 'plus_5_ans'), AUJOURDHUI)).toEqual({ plafond: 0.10, unCran: false, raison: 'age' });
  });
  test('l’âge est révolu : né fin décembre 1961, 64 ans le 30/10/2026 → pas encore 65', () => {
    expect(P.prudenceDuProfil({ anciennete: '1_a_3_ans', date_naissance: '1961-12-31' }, AUJOURDHUI).plafond).toBe(0.15);
    expect(P.prudenceDuProfil({ anciennete: '1_a_3_ans', date_naissance: '1961-10-30' }, AUJOURDHUI).plafond).toBe(0.10);
  });
  test('⚠️ année absente : aucune règle d’âge — jamais un âge deviné (le débutant garde son plafond, rien de plus)', () => {
    expect(P.prudenceDuProfil(profilNe(null, 'moins_1_an'), AUJOURDHUI)).toEqual({ plafond: 0.10, unCran: false, raison: 'debutant' });
    expect(P.prudenceDuProfil(profilNe(null, 'plus_5_ans'), AUJOURDHUI)).toEqual({ plafond: 0.15, unCran: false, raison: null });
    expect(P.prudenceDuProfil({}, AUJOURDHUI).raison).toBeNull();
    expect(P.prudenceDuProfil(null, AUJOURDHUI).raison).toBeNull();
    expect(P.prudenceDuProfil({ anciennete: 'moins_1_an', date_naissance: 'pas-une-date' }, AUJOURDHUI).unCran).toBe(false);
    // Sans date de référence : l'âge reste inconnu.
    expect(P.prudenceDuProfil(profilNe(ans(70), '1_a_3_ans'), undefined).plafond).toBe(0.15);
  });
  test('prudenceEffective : une prudence donnée l’emporte ; sans elle, le seul débutant (sans âge)', () => {
    expect(M.prudenceEffective(true, undefined)).toEqual({ plafond: 0.10, unCran: false, raison: 'debutant' });
    expect(M.prudenceEffective(false, undefined)).toEqual({ plafond: 0.15, unCran: false, raison: null });
    expect(M.prudenceEffective(false, { plafond: 0.10, unCran: true, raison: 'debutant_age' })).toEqual({ plafond: 0.10, unCran: true, raison: 'debutant_age' });
    expect(M.prudenceEffective(true, { plafond: 'x' }).plafond).toBe(0.10);
  });
});

// ── 2. Le dépassement (186) ───────────────────────────────────────────────────────────────────────────────────────────
let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' });
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'franc', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (liste) => liste.map(([kg, reps], i) => ({ seance: { id: 'H' + i, debut: jourN(i) },
  series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((r) => brute(kg, r)) }));
const avantDe = (liste) => new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
const toutes = (liste) => liste.map((_, i) => 'H' + i);
const SEANCES = [[40, [11, 10, 10]], [40, [11, 10, 10]], [40, [11, 10, 10]], [40, [11, 10, 10]], [40, 15]];
const consigne = (o) => M.consigneDExercice(groupes(SEANCES), undefined, avantDe(SEANCES),
  Object.assign({}, OPTIONS, { seancesSousConsigne: toutes(SEANCES) }, o || {}));
const haut = (c) => (c.consigne.haut ? c.consigne.haut.charge : null);
const prudence = (annee, anciennete) => P.prudenceDuProfil(profilNe(annee === null ? null : ans(annee), anciennete), AUJOURDHUI);

describe('191 — le dépassement : 40 kg × 15 en Franc (deux crans : 45 kg, soit 12,5 %)', () => {
  test('prémisse — sans prudence, deux crans : 45 kg', () => {
    expect(haut(consigne())).toBe(45);
    expect(consigne().consigne.fondement.crans).toBe(2);
  });
  test('⚠️ DISCRIMINANT — 65 ans, intermédiaire : le plafond à 10 % (44 kg) ramène à UN cran, 42,5 kg, et le Pourquoi le dit', () => {
    const c = consigne({ prudence: prudence(65, '1_a_3_ans'), debutant: false });
    expect(haut(c)).toBe(42.5);
    expect(c.consigne.fondement.prudence).toEqual({ quoi: 'plafond', raison: 'age' });
    const pourquoi = M.pourquoiConsigne(c.consigne, 'franc', avantDe(SEANCES)).etat.replace(/[  ]/g, ' ');
    expect(pourquoi).toContain('Le saut reste limité : les tendons s’adaptent plus lentement que les muscles.');
  });
  test('64 ans, intermédiaire : le plafond ordinaire, 45 kg, aucune phrase de prudence', () => {
    const c = consigne({ prudence: prudence(64, '1_a_3_ans'), debutant: false });
    expect(haut(c)).toBe(45);
    expect(c.consigne.fondement.prudence).toBeUndefined();
  });
  test('⚠️ DISCRIMINANT — débutant de 50 ans : UN cran, quel que soit le plafond (même quand deux crans passeraient sous 10 %)', () => {
    // 100 kg × 24 : deux crans = 105 kg (5 %), passent même à 10 % — le débutant de 50 ans n'en prend qu'un.
    const l = [[100, [11, 10, 10]], [100, [11, 10, 10]], [100, [11, 10, 10]], [100, [11, 10, 10]], [100, [24, 24, 24]]];
    const o = { reglage: 'normal', seancesSousConsigne: toutes(l) };
    const f = (p, d) => M.consigneDExercice(groupes(l), undefined, avantDe(l), Object.assign({}, OPTIONS, o, { prudence: p, debutant: d }));
    expect(haut(f(prudence(30, 'moins_1_an'), true))).toBe(107.5);          // débutant de 30 ans : trois crans sous 10 %
    const c = f(prudence(50, 'moins_1_an'), true);
    expect(haut(c)).toBe(102.5);
    expect(c.consigne.fondement.prudence).toEqual({ quoi: 'un_cran', raison: 'debutant_age' });
    expect(M.pourquoiConsigne(c.consigne, 'normal', avantDe(l)).etat.replace(/[  ]/g, ' ')).toContain('Un cran à la fois : les tendons s’adaptent plus lentement que les muscles.');
    expect(haut(f(prudence(49, 'moins_1_an'), true))).toBe(107.5);          // 49 ans : le plafond seul
  });
  test('un cran seul reste TOUJOURS permis : la prudence ralentit la montée, elle ne la bloque pas', () => {
    const l = SEANCES.slice(0, 4).concat([[40, 13]]);                        // +1 à +2 reps au-dessus du haut : un cran de toute façon
    const c = M.consigneDExercice(groupes(l), undefined, avantDe(l), Object.assign({}, OPTIONS, { seancesSousConsigne: toutes(l),
      prudence: prudence(60, 'moins_1_an'), debutant: true }));
    expect(c.consigne.haut && c.consigne.haut.charge).toBe(42.5);
    expect(c.consigne.fondement.prudence).toBeUndefined();                    // rien n'a été ralenti : pas de phrase
  });
  test('année absente : le débutant garde son plafond à 10 % (le comportement d’avant), jamais « un cran à la fois »', () => {
    const c = consigne({ prudence: prudence(null, 'moins_1_an'), debutant: true });
    expect(haut(c)).toBe(42.5);                                              // 45 kg = 12,5 % > 10 %
    const l = [[100, [11, 10, 10]], [100, [11, 10, 10]], [100, [11, 10, 10]], [100, [11, 10, 10]], [100, [24, 24, 24]]];
    const d = M.consigneDExercice(groupes(l), undefined, avantDe(l), Object.assign({}, OPTIONS, { reglage: 'normal', seancesSousConsigne: toutes(l),
      prudence: prudence(null, 'moins_1_an'), debutant: true }));
    expect(haut(d)).toBe(107.5);
  });
  test('sans option `prudence`, le seul `debutant` fait comme avant 191 (compatibilité)', () => {
    expect(haut(consigne({ debutant: true }))).toBe(42.5);
    expect(haut(consigne({ debutant: false }))).toBe(45);
  });
});

// ── 3. Le calage (187) ────────────────────────────────────────────────────────────────────────────────────────────────
describe('191 — le calage : réserve 3 ou plus → +2 crans, +1 cran pour le débutant de 50 ans et plus', () => {
  const calage = (p, debutant, serie) => M.calagePremiereFois({ debutant, prudence: p, equipement: 'machine', salle: null, mesure: 'charge_reps', reps: 10,
    prochain: 'travail', series: [serie || { charge: 100, reps: 10, ressenti: 'reste_3_plus', chauffe: false }] });
  test('⚠️ DISCRIMINANT — débutant de 50 ans : « 3 ou plus » → UN cran ; de 49 ans : deux crans', () => {
    const vieux = calage(prudence(50, 'moins_1_an'), true), jeune = calage(prudence(49, 'moins_1_an'), true);
    expect(jeune.suivante.charge).toBeGreaterThan(vieux.suivante.charge);
    expect(vieux.suivante.crans).toBe(1);
    expect(jeune.suivante.crans).toBe(2);
    expect(vieux.unCran).toBe(true);
    expect(vieux.suivante.pourquoi).toBe('facile_un_cran');
    expect(M.libellesCalage(vieux).pourquoi).toBe('Facile : je monte d’un cran. Un cran à la fois : les tendons s’adaptent plus lentement que les muscles.');
    expect(jeune.suivante.pourquoi).toBe('facile');
  });
  test('un cran seul reste permis : « il en restait 2 » → un cran, avec ou sans prudence', () => {
    const s = { charge: 100, reps: 10, ressenti: 'reste_2', chauffe: false };
    expect(calage(prudence(60, 'moins_1_an'), true, s).suivante.crans).toBe(1);
    expect(calage(prudence(60, 'moins_1_an'), true, s).prudence).toBeNull();
  });
  test('année absente : le débutant garde le calage de la 187 (deux crans), jamais « un cran à la fois »', () => {
    const c = calage(prudence(null, 'moins_1_an'), true);
    expect(c.suivante.crans).toBe(2);
    expect(c.unCran).toBe(false);
  });
  test('65 ans, intermédiaire : le plafond du calage est 10 % (la proposition est ramenée sous le plafond), les approches restent', () => {
    const p = prudence(65, '1_a_3_ans');
    const c = M.calagePremiereFois({ debutant: false, prudence: p, equipement: 'machine', salle: { materiel: 'machine', charges: [10, 12, 14, 16, 18, 20, 30], isolation: false },
      mesure: 'charge_reps', reps: 10, prochain: 'travail', series: [{ charge: 20, reps: 10, ressenti: 'reste_3_plus', chauffe: false }] });
    expect(c.plafond).toBe(0.10);
    // 20 kg + 10 % = 22 kg : un cran (30 kg) dépasse ; la salle n'a rien entre 20 et 30 → un seul cran permis, ramené à la même charge ou au cran.
    expect(c.suivante.charge).toBeLessThanOrEqual(30);
    const ordinaire = M.calagePremiereFois({ debutant: false, prudence: prudence(64, '1_a_3_ans'), equipement: 'machine', salle: null,
      mesure: 'charge_reps', reps: 10, prochain: 'travail', series: [{ charge: 20, reps: 10, ressenti: 'reste_3_plus', chauffe: false }] });
    expect(ordinaire.plafond).toBe(0.15);
  });
});

// ── 4. Les invariants lisent la prudence du plan ─────────────────────────────────────────────────────────────────────────
describe('191 — I71 et I73 lisent la prudence du plan', () => {
  test('⚠️ le plan porte sa prudence : celle qu’on lui donne, sinon celle du seul débutant', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/plan.js'), 'utf8');
    expect(src).toMatch(/prudence: prudenceDuPlan\(e\)/);
    expect(src).toMatch(/prudence: prudenceDuPlan\(e\), equipement: cat\.equipement/);
  });
  const S = require('../../v2/js/seance.js');
  function decor(prud) {
    let i = 0;
    const id = () => 's' + (++i);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 3 });
    const c = M.consigneDExercice(groupes(SEANCES), undefined, avantDe(SEANCES), Object.assign({}, OPTIONS, { seancesSousConsigne: toutes(SEANCES) }));
    const e = { seance: { id: 'S1', debut: avantDe(SEANCES), edition: false, exercices: se.exercices }, consignes: { dc: c }, reglage: 'franc', paris: [],
      suites: {}, phase: 'maintien', catalogue: null, prudence: prud,
      escalier: { cartes: [], compteurs: [], noms: { dc: 'Développé Couché (Barre)' }, seriesRoutine: { dc: 3 }, marches: [] } };
    return { e, p: T.planDeSeance(e) };
  }
  const erreursI71 = (d, f) => {
    const g = JSON.parse(JSON.stringify(d.p));
    const k = g.exercices[0].consigne;
    k.fondement = Object.assign({}, k.fondement, f);
    k.ligne = Object.assign({}, k.ligne, { charge: 40 });
    k.haut = { charge: 44, vise: 8, n: 1 };
    return T.verifierPlan(g, d.e).erreurs.filter((x) => /^I71/.test(x)).join('|');
  };
  test('I71 — le plan porte la prudence qu’on lui donne ; sans elle, celle du seul débutant', () => {
    expect(decor({ plafond: 0.10, unCran: true, raison: 'debutant_age' }).p.prudence).toEqual({ plafond: 0.10, unCran: true, raison: 'debutant_age' });
    expect(decor(undefined).p.prudence).toEqual({ plafond: 0.15, unCran: false, raison: null });
  });
  test('I71 — ⚠️ DISCRIMINANT : un saut de plusieurs crans avec « un cran à la fois », ou un plafond de 15 % sous une prudence à 10 %, est refusé', () => {
    expect(erreursI71(decor({ plafond: 0.15, unCran: false, raison: null }), { crans: 2, plafond: 0.15 })).toBe('');
    expect(erreursI71(decor({ plafond: 0.10, unCran: false, raison: 'age' }), { crans: 2, plafond: 0.10 })).toBe('');
    expect(erreursI71(decor({ plafond: 0.10, unCran: false, raison: 'age' }), { crans: 2, plafond: 0.15 })).toMatch(/prudence de montée/);
    expect(erreursI71(decor({ plafond: 0.10, unCran: true, raison: 'debutant_age' }), { crans: 2, plafond: 0.10 })).toMatch(/un cran à la fois/);
  });
  test('I73 — un plafond de calage plus haut que celui de la prudence, ou deux crans quand elle dit un cran, est refusé', () => {
    const d = decor({ plafond: 0.10, unCran: true, raison: 'debutant_age' });
    const g = JSON.parse(JSON.stringify(d.p));
    g.exercices[0].calage = { plafond: 0.15, plancher: 20, n: 10, suivante: { charge: 120, reps: 10, role: 'montee', pourquoi: 'facile', crans: 2, depuis: 100 }, iSerie: null };
    g.exercices[0].consigne = Object.assign({}, g.exercices[0].consigne, { etat: 'silence', raison: 'premiere_fois' });
    const e = T.verifierPlan(g, d.e).erreurs.filter((x) => /^I73/.test(x)).join('|');
    expect(e).toMatch(/la prudence de montée dit 10 %/);
    expect(e).toMatch(/2 crans, un seul à la fois/);
  });
});
