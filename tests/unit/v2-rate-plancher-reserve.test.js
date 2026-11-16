/** @jest-environment node */
//
// 16/11/2026 — LE PLANCHER DE LA RÉACTION AU RATÉ (MOTEUR §9.39 delta, I216). Le « garde N » d'une réaction au raté n'est jamais sous la réserve
// AFFICHÉE de la ligne (reprise longue I206, population protégée I160) : une même carte ne dit plus « garde 2 » puis « garde 1 ».
// Le vrai chemin : la consigne de la reprise longue vient de `consigneDExercice`, la séance de `seance.js`, la réaction de `planDeSeance`.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const sp = (t) => String(t).replace(/[  ]/g, ' ');
const SQ = 'squat_barre';

// ── la consigne de reprise longue, par le vrai moteur : une séance 100 × 9, 9, 9 le 13/04, Franc, aujourd'hui le 16/11 ──
let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: SQ });
const HISTO = [{ seance: { id: 'H1', debut: new Date('2026-04-13T17:00:00Z').toISOString() }, series: [9, 9, 9].map((r) => brute(100, r)) }];
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'franc', edition: false };
const REPRISE = M.consigneDExercice(HISTO, undefined, '2026-11-16T17:00:00Z', OPT).consigne;
// une consigne de progression ordinaire, zone Hypertrophie (réserve de la table : 1 en Normal), pour la population protégée et le témoin
const PROGRESSION = { etat: 'progression', zone: 'hypertrophie', palier: 100, n: 3, ligne: { charge: 100, vise: 9 }, haut: null };

function monter(faits, vise) {
  let k = 0;
  const id = () => 'p-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, SQ, id, { series: 3 });
  se.exercices[0].series.forEach((s) => { s.reps_visees = vise; });
  faits.forEach(([ch, reps], j) => {
    se = S.modifierSerie(se, 0, j, { charge_kg: ch, reps });
    se = S.valider(se, 0, j, new Date(Date.UTC(2026, 10, 16, 10, 0, 0) + (j + 1) * 150000));
  });
  return se;
}
function entrees(se, consigne, extra) {
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-16T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes },
    consignes: { [SQ]: { consigne, contexte: { cran: 102.5, haut: null }, pas: 2.5 } },
    reglage: 'normal', objectif: 'muscle', paris: [],
    catalogue: { [SQ]: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] } }
  }, extra || {});
}
const jouer = (faits, consigne, extra, vise) => {
  const se = monter(faits, vise === undefined ? 9 : vise);
  const e = entrees(se, consigne, extra);
  return { e, p: T.planDeSeance(e) };
};
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };

test('la fixture déclenche VRAIMENT la reprise longue, avec une réserve affichée de 2 en Franc', () => {
  expect(REPRISE.etat).toBe('reprise_longue');
  expect(M.enRepriseLongue(REPRISE)).toBe(true);
  const { p } = jouer([], REPRISE, { reglage: 'franc' });
  expect(p.exercices[0].reserveAffichee).toBe(2);
  expect(p.exercices[0].reserveVisee).toBe(0);   // la table, en Franc : le plancher est une autre valeur
});

describe('reprise longue, Franc : jamais « garde 1 » devant « garde 2 »', () => {
  test('niveau 1 : le cas général dit garde 2', () => {
    const vise = REPRISE.ligne.vise;
    const { e, p } = jouer([[REPRISE.ligne.charge, 5]], REPRISE, { reglage: 'franc' }, vise);
    const x = p.exercices[0];
    expect(x.reserveAffichee).toBe(2);
    expect(x.rate.niveau).toBe('serie');
    expect(x.rate.garde).toBe(2);
    expect(sp(x.rate.phrase)).toMatch(/garde 2/);
    expect(sp(x.rate.phrase)).not.toMatch(/garde 1/);
    propre(p, e);
  });
  test('niveau 2 (cas X) : « la suite vise N, garde 2 »', () => {
    const vise = REPRISE.ligne.vise;
    const c = REPRISE.ligne.charge;
    const { e, p } = jouer([[c, vise - 1], [c, vise - 1]], REPRISE, { reglage: 'franc', objectif: 'force' }, vise);
    const x = p.exercices[0];
    expect(x.rate.cas).toBe('X');
    expect(x.rate.garde).toBe(2);
    expect(sp(x.rate.phrase)).toMatch(/garde 2/);
    propre(p, e);
  });
});

describe('population protégée : le plancher vaut aussi hors reprise longue', () => {
  test('65 ans et plus connus : garde 2 (la table d’Hypertrophie dit 1)', () => {
    const { e, p } = jouer([[100, 5]], PROGRESSION, { plus65: true });
    const x = p.exercices[0];
    expect(x.reserveVisee).toBe(1);
    expect(x.reserveAffichee).toBe(2);
    expect(x.rate.garde).toBe(2);
    expect(sp(x.rate.phrase)).toMatch(/garde 2/);
    propre(p, e);
  });
  test('objectif Forme : garde 2', () => {
    const { e, p } = jouer([[100, 5]], PROGRESSION, { objectif: 'forme' });
    const x = p.exercices[0];
    expect(x.reserveAffichee).toBe(2);
    expect(x.rate.garde).toBe(2);
    propre(p, e);
  });
  test('un débutant : le coach se tait après un raté (calage) — aucune réaction, donc aucun « garde 1 » contre le plancher', () => {
    const { e, p } = jouer([[100, 5]], PROGRESSION, { debutant: true });
    expect(p.exercices[0].reserveAffichee).toBeGreaterThanOrEqual(2);
    expect(p.exercices[0].rate).toBeFalsy();
    propre(p, e);
  });
});

describe('le témoin : hors protection, la réserve de la table (1) et « garde 1 » ne changent pas', () => {
  test('Normal, Hypertrophie, aucune population protégée : garde 1', () => {
    const { e, p } = jouer([[100, 5]], PROGRESSION, {});
    const x = p.exercices[0];
    expect(x.reserveAffichee).toBe(1);
    expect(x.rate.garde).toBe(1);
    expect(sp(x.rate.phrase)).toMatch(/garde 1/);
    propre(p, e);
  });
  test('Normal, zone Lourd (la table affiche déjà 2, ce n’est pas un plancher) : la réaction garde sa règle, garde 1', () => {
    const { e, p } = jouer([[100, 2]], Object.assign({}, PROGRESSION, { zone: 'lourd' }), {}, 5);
    const x = p.exercices[0];
    expect(x.reserveAffichee).toBe(2);
    expect(x.rate.garde).toBe(1);
    propre(p, e);
  });
});

describe('Moteur.reactionAuRate — le plancher est une valeur reçue', () => {
  const base = { niveau: 'serie', reps: 5, vise: 9, bas: 8, charge: 100, reserve: null, rang: 0, reglage: 'franc', objectif: 'muscle', barre: true, materiel: 'barre', pas: 2.5 };
  test('sans plancher : inchangé ; avec : max(garde, plancher) ; jamais en dessous', () => {
    expect(M.reactionAuRate(base).garde).toBe(1);
    expect(M.reactionAuRate(Object.assign({}, base, { plancher: 2 })).garde).toBe(2);
    expect(M.reactionAuRate(Object.assign({}, base, { plancher: 1 })).garde).toBe(1);
    expect(M.reactionAuRate(Object.assign({}, base, { plancher: null })).garde).toBe(1);
    expect(M.reactionAuRate(Object.assign({}, base, { reglage: 'prudent', plancher: 1 })).garde).toBe(2);
  });
  // Le cas M (pile sur la cible, réserve notée 0) : dans le plan, la réaction existante de l'écran (§9.14, `x.message`) garde la parole sur cette série ;
  // la décision du moteur, elle, porte le plancher (et x.rate ne s'écrit pas : I115).
  test('cas M : garde 1 sans plancher, garde 2 avec', () => {
    const m = Object.assign({}, base, { reps: 9, reserve: 0, derniere: false });
    expect(M.reactionAuRate(m)).toMatchObject({ cas: 'M', garde: 1 });
    expect(M.reactionAuRate(Object.assign({}, m, { plancher: 2 }))).toMatchObject({ cas: 'M', garde: 2 });
  });
});

describe('I216 — verifierPlan voit un « garde N » sous la réserve affichée', () => {
  test('une phrase qui retombe à garde 1 sous une réserve affichée de 2', () => {
    const { e, p } = jouer([[100, 5]], PROGRESSION, { plus65: true });
    p.exercices[0].rate.garde = 1;
    expect(T.verifierPlan(p, e).erreurs.join('\n')).toMatch(/I216/);
  });
  test('la comparaison à la réserve affichée seule (le pari inchangé) : garde 2 sous une réserve affichée de 3', () => {
    const { e, p } = jouer([[100, 5]], PROGRESSION, { plus65: true });
    expect(p.exercices[0].rate.garde).toBe(2);
    p.exercices[0].reserveAffichee = 3;
    expect(T.verifierPlan(p, e).erreurs.join('\n')).toMatch(/I216 — exercice 0 \(squat_barre\) : une réaction qui dit « garde 2 » sous la réserve affichée de 3/);
  });
  test('le pari d’une ligne recalée au-dessus du garde dit', () => {
    const { e, p } = jouer([[100, 5]], PROGRESSION, { plus65: true });
    p.exercices[0].paris[1].fondement.reserve_visee = 3;
    expect(T.verifierPlan(p, e).erreurs.join('\n')).toMatch(/I216.*un pari de réserve 3/);
  });
  test('un témoin : hors protection, aucune erreur I216 même avec garde 1 sous une table à 2', () => {
    const { e, p } = jouer([[100, 2]], Object.assign({}, PROGRESSION, { zone: 'lourd' }), {}, 5);
    expect(T.verifierPlan(p, e).erreurs.join('\n')).not.toMatch(/I216/);
  });
});

test('la preuve du constat : squat 97,5 × 5 en reprise longue Franc, puis la baisse — « garde 2 » partout, aucune erreur', () => {
  const c = REPRISE.ligne.charge;
  const a = jouer([[c, 5]], REPRISE, { reglage: 'franc' });
  expect(sp(a.p.exercices[0].rate.phrase)).toBe('5 au lieu de 9. Même charge, garde 2, entre 4 et 6.');
  propre(a.p, a.e);
  const b = jouer([[c, 5], [c, 5]], REPRISE, { reglage: 'franc' });
  const r = b.p.exercices[0].rate;
  expect(r.garde).toBe(2);
  expect(sp(r.phrase)).toMatch(/garde 2/);
  expect(sp(r.phrase)).not.toMatch(/garde 1/);
  propre(b.p, b.e);
});
