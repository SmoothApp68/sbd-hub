/** @jest-environment node */
//
// 27/11/2026 (SÉCURITÉ, I282, MOTEUR §14.5 bis, décision du fondateur) — « PASSER À 3-5 REPS » NE SE DIT JAMAIS à un exercice à ménager ni à une
// personne protégée (65 ans et plus connus, débutant, objectif Forme). Deux cartes y mènent : le schéma Mix → Lourd (au blocage d'une barre en Mix)
// et la règle de bord (sous 3 reps, six séances sans monter). Ces cas-là reçoivent le silence ou la marche suivante de l'escalier, jamais le lourd.
// Aucun autre profil ne change (les témoins en bas).

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

// ── le schéma Mix → Lourd ───────────────────────────────────────────────────
const DEBUT = '2026-10-01T10:00:00+00:00';
const CMIX = { etat: 'test_propose', zone: 'mix', palier: 100, niveau: 7, n: 4,
  ligne: { charge: 100, vise: 7 }, haut: { charge: 102.5, vise: 6, k: 1 }, fondement: {} };
const MEILLEUR = { palier: 100, niveau: 7 };
const REPLI = { palier: 95, niveau: 6, debut: '2026-09-20T10:00:00+00:00', reps: [6, 6, 6, 6], ligne: [95, 6] };

function decorMix(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 4 });
  const k = Object.assign({}, CMIX, opt.consigne || {});
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: opt.compteur === undefined ? 4 : opt.compteur, meilleur: MEILLEUR, blocages: [] }, repli: REPLI };
  const e = Object.assign({ seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { couche: c }, reglage: 'normal', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { couche: 'Développé Couché (Barre)' }, seriesRoutine: { couche: 4 }, marches: [] } }, opt.entrees || {});
  return { e, p: T.planDeSeance(e) };
}
const erreurs282 = (p, e) => T.verifierPlan(p, e).erreurs.filter((y) => /^I282/.test(y));
const MENAGEE = { zonesMenagees: { couche: { zones: ['epaule'], choisie: null } } };
const PROFILS = { menagee: MENAGEE, plus65: { plus65: true }, debutant: { debutant: true }, forme: { objectif: 'forme' } };

describe('I282 — le schéma Mix → Lourd', () => {
  test('TÉMOIN — une personne ordinaire, en Mix, bloquée : la carte « Passer à 3-5 reps » est posée comme avant', () => {
    const { e, p } = decorMix({ entrees: { objectif: 'muscle' } });
    const x = p.exercices[0];
    expect(x.escalier.marche).toBe('schema');
    expect([x.escalier.carte.oui, x.escalier.carte.nouvelle_zone]).toEqual(['Passer à 3-5 reps', 'lourd']);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  Object.keys(PROFILS).forEach((nom) => {
    test('DISCRIMINANT — ' + nom + ' : aucune carte vers Lourd au 1er déclenchement, aucune erreur', () => {
      const { e, p } = decorMix({ entrees: Object.assign({ objectif: 'muscle' }, PROFILS[nom]) });
      const x = p.exercices[0];
      expect(x.escalier).toBeNull();                              // ni carte, ni marche : la phrase du compteur reste un fait en tête
      expect(x.entete.compteur).toMatch(/depuis 4 séances/);
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
    test(nom + ' : la marche suivante de l\'escalier reste la sienne (2e déclenchement : le repli)', () => {
      const { e, p } = decorMix({ compteur: 8, entrees: Object.assign({ objectif: 'muscle' }, PROFILS[nom]) });
      expect(p.exercices[0].escalier.marche).toBe('repli');
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });
  test('un exercice que le moteur a tenu hors de Lourd (fondement.menagee) ne reçoit pas non plus la carte', () => {
    const { p } = decorMix({ consigne: { fondement: { menagee: true } }, entrees: { objectif: 'muscle' } });
    expect(p.exercices[0].escalier && p.exercices[0].escalier.carte).toBeFalsy();
  });
  test('TÉMOIN — Lourd → Mix (« Passer à 6-8 reps ») n\'est pas touché, même pour une personne protégée', () => {
    const { e, p } = decorMix({ consigne: { zone: 'lourd', palier: 125, niveau: 5, ligne: { charge: 125, vise: 5 } }, entrees: { plus65: true } });
    expect(p.exercices[0].escalier.carte.nouvelle_zone).toBe('mix');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('la fonction du moteur : la raison, ou rien', () => {
    expect(M.versLourdInterdit({ menagee: true, protegee: true })).toBe('menagee');
    expect(M.versLourdInterdit({ protegee: true })).toBe('protegee');
    expect(M.versLourdInterdit({})).toBeNull();
    expect(M.versLourdInterdit(null)).toBeNull();
    expect(M.carteSchema('mix', MEILLEUR, 4, false, 'muscle', true)).toBeNull();
    expect(M.carteSchema('mix', MEILLEUR, 4, false, 'muscle', false).nouvelle_zone).toBe('lourd');
    expect(M.carteSchema('lourd', MEILLEUR, 4, false, 'muscle', true).nouvelle_zone).toBe('mix');
    expect(M.marcheIsolee(1, 'mix', 'maintien', null, false, 100, null, true)).toBeNull();
    expect(M.marcheIsolee(1, 'mix', 'maintien', null, false, 100, null, false)).toBe(M.MARCHE_SCHEMA);
    expect(M.marcheIsolee(1, 'lourd', 'maintien', null, false, 125, null, true)).toBe(M.MARCHE_SCHEMA);
  });
  test('I282 DISCRIMINANT — un plan qui poserait la carte à une personne protégée est refusé', () => {
    const { e, p } = decorMix({ entrees: { objectif: 'muscle' } });          // plan ordinaire : la carte est posée
    expect(erreurs282(p, e)).toEqual([]);
    ['menagee', 'plus65', 'debutant', 'forme'].forEach((nom) => {
      const lu = erreurs282(p, Object.assign({}, e, PROFILS[nom]));
      expect(lu.length).toBe(1);
      expect(lu[0]).toMatch(nom === 'menagee' ? /exercice à ménager/ : /personne protégée/);
    });
  });
});

// ── la règle de bord (sous 3 reps) ──────────────────────────────────────────
let nb = 0;
const brute = (kg, reps, ressenti) => ({ id: 'r' + (++nb), rang: nb, charge_kg: kg, reps, rpe: null, ressenti: ressenti === undefined ? null : ressenti,
  type_serie: 'travail', exercise_slug: 'dc' });
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (liste) => liste.map(([kg, reps, ressenti], i) => ({ seance: { id: 'H' + i, debut: jourN(i) },
  series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((r, j, tout) => brute(kg, r, j === tout.length - 1 ? ressenti : null)) }));
const avantDe = (liste) => new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
const RECORD = [[130, 2], [132.5, 2], [135, 2], [137.5, 2], [140, 2]];
const APRES = [[140, [1, 1, 1]], [137.5, 2], [137.5, 2], [137.5, 2], [137.5, 2], [137.5, 2], [137.5, 2]];
const histoire = (k) => RECORD.concat(APRES.slice(0, k));

function decorBord(entrees) {
  const liste = histoire(6);
  let i = 0;
  const id = () => 's' + (++i);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  const c = M.consigneDExercice(groupes(liste), undefined, avantDe(liste), OPTIONS);
  const e = Object.assign({ seance: { id: 'S1', debut: avantDe(liste), edition: false, exercices: se.exercices },
    consignes: { dc: c }, reglage: 'normal', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { dc: 'Développé Couché (Barre)' }, seriesRoutine: { dc: 3 }, marches: [] } }, entrees || {});
  return { e, p: T.planDeSeance(e), c };
}

describe('I282 — la règle de bord (sous 3 reps, six séances sans monter)', () => {
  test('TÉMOIN — une personne ordinaire : la carte « Passer à 3-5 reps » est posée comme avant', () => {
    const { e, p } = decorBord({ objectif: 'muscle' });
    expect(p.exercices[0].escalier.carte.nouvelle_zone).toBe('lourd');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  Object.keys(PROFILS).forEach((nom) => {
    test('DISCRIMINANT — ' + nom + ' : aucune carte, aucune erreur', () => {
      const entrees = Object.assign({ objectif: 'muscle' }, nom === 'menagee' ? { zonesMenagees: { dc: { zones: ['epaule'], choisie: null } } } : PROFILS[nom]);
      const { e, p } = decorBord(entrees);
      expect(p.exercices[0].escalier).toBeNull();
      // (la consigne de ce décor est calculée sans la zone à ménager : I75 voit une série lourde, qui n'est pas l'objet ici)
      expect(T.verifierPlan(p, e).erreurs.filter((y) => !(nom === 'menagee' && /^I75/.test(y)))).toEqual([]);
    });
  });
  test('I282 DISCRIMINANT — un plan qui poserait la carte de bord à un 65 ans et plus est refusé', () => {
    const { e, p } = decorBord({ objectif: 'muscle' });
    expect(erreurs282(p, e)).toEqual([]);
    expect(erreurs282(p, Object.assign({}, e, { plus65: true })).length).toBe(1);
  });
  test('la carte de bord de la fonction : rien pour qui ne reçoit pas le lourd', () => {
    const b = M.consigneDExercice(groupes(histoire(6)), undefined, avantDe(histoire(6)), OPTIONS).bord;
    expect(M.carteBordSchema(b, true)).toBeNull();
    expect(M.carteBordSchema(b).nouvelle_zone).toBe('lourd');
  });
});
