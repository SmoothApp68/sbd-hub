/** @jest-environment node */
//
// 175 / 3 — LE GROS CRAN (MOTEUR §9.7 / §10.2, décision d'Aurélien du 26/10/2026).
// Un cran est gros quand (T − P) / P dépasse (haut − bas) × 2,5 % : le test se valide alors au plancher
// max(bas − 2, 8 sur une isolation, 4 sinon) dès le premier essai ; raté même là, la cible d'étirement monte de 2 reps par
// essai (au plus haut + 6, jamais plus de 30) ; au plafond de la cible ou après deux essais ratés, la carte des leviers sans
// « Viser plus de reps », ouverte par les poids d'appoint de la machine. Un cran qui n'est pas gros ne change rien.

process.env.TZ = 'Europe/Paris';
global.self = global;

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const T = require('../../v2/js/plan.js');
const S = require('../../v2/js/seance.js');

const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
const serie = (kg, reps, role) => ({ charge_kg: kg, reps: reps, rpe: null, ressenti: null, role: role });
const seance = (debut, palier, ...series) => ({ debut: debut, palier: palier, series: series });
const auPalier = (kg, reps, n) => Array.from({ length: n }, () => serie(kg, reps, 'palier'));
const AVANT = '2026-10-21T10:00:00+00:00';
const SALLE = { materiel: 'machine', charges: [7, 9, 11.5, 14, 16.5, 19] };
const D = ['2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14'].map((d) => d + 'T18:00:00+00:00');
const OPT = { reglage: 'franc', equipement: 'machine', correction: null, salle: SALLE, mesure: 'charge_reps' };
const pour = (seances, o) => M.consignePour(seances, AVANT, Object.assign({}, OPT, o || {}));
// Trois séances à 9 kg × 12 (zone Volume, 10-12), puis ce que l'on veut.
const trois = () => [seance(D[0], 9, ...auPalier(9, 12, 3)), seance(D[1], 9, ...auPalier(9, 12, 3)), seance(D[2], 9, ...auPalier(9, 12, 3))];
const essai = (reps, debut) => seance(debut, 9, ...auPalier(9, 12, 2), serie(11.5, reps, 'exploration'));

describe('175 / 3 — grosCran : la définition', () => {
  const VOLUME = M.zoneParCle('volume');
  test('9 → 11,5 kg en Volume : +28 %, ~11 reps d’écart, le plancher à 8', () => {
    expect(M.grosCran(9, 11.5, VOLUME, false)).toEqual({ de: 9, vers: 11.5, pct: 28, reps: 11, plancher: 8, isolation: false });
  });
  test('DISCRIMINANT — un cran de 2,5 % n’est pas gros : le seuil est (haut − bas) × 2,5 %', () => {
    expect(M.grosCran(100, 102.5, VOLUME, false)).toBeNull();
    // 10-12 : seuil 5 % ; 5,1 % est gros, 5 % ne l'est pas (strictement au-dessus).
    expect(M.grosCran(100, 105, VOLUME, false)).toBeNull();
    expect(M.grosCran(100, 105.1, VOLUME, false)).not.toBeNull();
  });
  test('le plancher : bas − 2, jamais sous 8 sur une isolation, 4 ailleurs, jamais au-dessus du bas', () => {
    expect(M.plancherDuGros(VOLUME, false)).toBe(8);
    expect(M.plancherDuGros(M.zoneParCle('series_longues'), true)).toBe(13);
    expect(M.plancherDuGros(M.zoneParCle('hypertrophie'), false)).toBe(6);
    // Isolation : le minimum de 8 tient (8 − 2 = 6 → 8, mais jamais au-dessus du bas 8).
    expect(M.plancherDuGros(M.zoneParCle('hypertrophie'), true)).toBe(8);
    // Zone de force : 4 au plus bas, jamais au-dessus du bas.
    expect(M.plancherDuGros(M.zoneParCle('lourd'), false)).toBe(3);
    expect(M.plancherDuGros(M.zoneParCle('mix'), false)).toBe(4);
  });
  test('la cible d’étirement : haut + 2 par essai, au plus haut + 6, jamais plus de 30', () => {
    expect(M.cibleDuGros(VOLUME, 1)).toBe(14);
    expect(M.cibleDuGros(VOLUME, 2)).toBe(16);
    expect(M.cibleDuGros(VOLUME, 9)).toBe(18);
    expect(M.cibleMaxDuGros(M.zoneParCle('series_longues'))).toBe(26);
    expect(M.cibleDuGros({ haut: 29, bas: 25 }, 5)).toBe(30);
  });
});

describe('175 / 3 — le test d’un gros cran', () => {
  test('proposé au plancher, pas au bas de la zone', () => {
    const r = pour(trois());
    expect(r).toMatchObject({ etat: 'test_propose', ligne: { charge: 9 }, haut: { charge: 11.5, vise: 8, k: 1 } });
    expect(r.fondement.cranGros).toEqual({ de: 9, vers: 11.5, pct: 28, reps: 11, plancher: 8, isolation: false });
  });
  test('la phrase dit l’écart et ce qui suffit', () => {
    const r = pour(trois());
    const p = M.pourquoiConsigne(r, 'franc');
    expect(esp(JSON.stringify(p))).toMatch(/De 9 à 11,5 kg, c'est \+28 % : environ 11 reps d'écart\. À 11,5 kg, 8 reps suffisent pour t'y installer\./);
  });
  test('validé au plancher : le test est GARDÉ à 11,5 kg, la double progression reprend', () => {
    const r = pour(trois().concat([essai(8, D[3])]));
    expect(r.etat).toBe('garde');
    expect(r.haut).toMatchObject({ charge: 11.5 });
    expect(r.fondement.cranGros).toMatchObject({ valide: true, niveau: 8 });
    expect(esp(JSON.stringify(M.pourquoiConsigne(r, 'franc')))).toMatch(/assez pour t'y installer/);
  });
  test('DISCRIMINANT — un cran qui n’est pas gros : le bas de la zone reste exigé (rien ne change)', () => {
    const fin = SALLE.charges.slice();
    const fine = { materiel: 'machine', charges: [9, 9.25, 9.5, 11.5] };
    const r = pour(trois(), { salle: fine });
    expect(r.etat).toBe('test_propose');
    expect(r.haut.vise).toBe(10);
    expect(r.fondement.cranGros).toBeUndefined();
    expect(fin).toBeTruthy();
  });
  test('raté même au plancher : retour à 9 kg, cible d’étirement à haut + 2 puis + 4 (cap haut + 6)', () => {
    const r1 = pour(trois().concat([essai(7, D[3])]));
    expect(r1.etat).toBe('etirement');
    expect(r1.ligne.charge).toBe(9);
    expect(r1.fondement.cible).toBe(14);
    expect(r1.fondement.cranGros).toMatchObject({ ratees: 1, plafond: 18, carte: false });
  });
  test('le retest, après l’étirement, se joue lui aussi au plancher (jamais le bas de la zone)', () => {
    const s = trois().concat([essai(7, D[3]), seance('2026-10-17T18:00:00+00:00', 9, ...auPalier(9, 14, 3))]);
    const r = pour(s);
    expect(r.etat).toBe('retest');
    expect(r.haut).toMatchObject({ charge: 11.5, vise: 8, k: 1 });
  });
  test('une isolation : le test ne se valide jamais sous 8 reps ; ailleurs, bas − 2 (Hypertrophie 8-10)', () => {
    const s = [0, 1, 2].map((i) => seance(D[i], 9, serie(9, 10, 'palier'), serie(9, 9, 'palier'), serie(9, 9, 'palier')));
    expect(pour(s, { isolation: true }).haut.vise).toBe(8);
    expect(pour(s, { isolation: false }).haut.vise).toBe(6);
  });
  test('DISCRIMINANT — un cran de 2,5 % raté : l’étirement d’avant (la cible compte les reps perdues), rien ne change', () => {
    const lourd = (reps, d) => seance(d, 200, ...auPalier(200, 12, 2), serie(205, reps, 'exploration'));
    const s = [0, 1, 2].map((i) => seance(D[i], 200, ...auPalier(200, 12, 3))).concat([lourd(7, D[3])]);
    const r = pour(s);
    expect(r.etat).toBe('etirement');
    expect(r.fondement.cible).toBe(17);          // 12 + 12 − 7, pas 12 + 2
    expect(r.fondement.cranGros).toBeUndefined();
  });
  test('DISCRIMINANT — une liste d’élastiques n’a pas de pourcentage de charge : jamais de gros cran', () => {
    const r = pour(trois(), { salle: { materiel: 'elastique', charges: [1, 2, 3], noms: ['Vert', 'Rouge', 'Noir'] } });
    expect(r.fondement.cranGros).toBeUndefined();
  });
  test('DISCRIMINANT — deux essais ratés : la carte des leviers est demandée', () => {
    const s = [seance(D[0], 9, ...auPalier(9, 12, 3)), seance(D[1], 9, ...auPalier(9, 12, 2), serie(11.5, 7, 'exploration')),
      seance(D[2], 9, ...auPalier(9, 14, 3)), seance(D[3], 9, ...auPalier(9, 12, 2), serie(11.5, 6, 'exploration'))];
    const r = pour(s);
    expect(r.fondement.cranGros).toMatchObject({ ratees: 2, carte: true });
    expect(r.fondement.cible).toBe(16);
  });
});

const SLUG = 'presse_mollets';
const brute = (() => { let n = 0; return (kg, reps) => ({ id: 'i' + (++n), rang: n, charge_kg: kg, reps: reps, rpe: null, ressenti: null,
  type_serie: 'travail', exercise_slug: SLUG }); })();
// Le même historique, au format des groupes de `consigneDExercice` : trois séances à 9 kg, puis des essais à 11,5 kg.
const groupes = (essais) => {
  const jours = ['09-16', '09-23', '09-30', '10-07', '10-14', '10-17'];
  const g = [];
  const lignes = [[[9, 12], [9, 12], [9, 12]], [[9, 12], [9, 12], [9, 12]], [[9, 12], [9, 12], [9, 12]]];
  void 0;
  essais.forEach((e) => lignes.push(e));
  lignes.forEach((l, i) => g.push({ seance: { id: 'G' + i, debut: '2026-' + jours[i] + 'T18:00:00+00:00' }, series: l.map(([kg, r]) => brute(kg, r)) }));
  return g;
};
const OPTG = { mesure: 'charge_reps', equipement: 'machine', intention: 'progresser', reglage: 'franc', edition: false, salle: SALLE };
const FIN = '2026-10-21T10:00:00+00:00';
function planDe(essais, o) {
  const opt = o || {};
  const c = M.consigneDExercice(groupes(essais), undefined, FIN, Object.assign({}, OPTG, opt.opt || {}));
  c.compteur = { compteur: opt.k || 3, meilleur: { palier: 9, niveau: 12 }, blocages: [] };
  let k = 0;
  const id = () => 's' + (++k);
  const se = S.ajouterExercice(S.creer({ id: 'S1', userId: 'u', idSerie: id }), SLUG, id, { series: 3 });
  const e = {
    seance: { id: 'S1', debut: FIN, edition: false, exercices: se.exercices },
    consignes: { [SLUG]: c },
    catalogue: { [SLUG]: { equipement: 'machine', nom: 'Presse à mollets', muscles_primaires: ['mollets'], muscles_secondaires: [],
      muscles_stabilisateurs: [], mesure: 'charge_reps' } },
    reglage: 'franc', paris: [], suites: {}, phase: 'maintien', debutant: false,
    volume: { mollets: { place: true, moyenne: 8, seuil: 10, fenetres: 12 } },
    escalier: { cartes: [], compteurs: [], noms: {}, seriesRoutine: { [SLUG]: 3 }, marches: opt.marches || [], remplacants: {} }
  };
  const p = T.planDeSeance(e);
  return { c, e, p, x: p.exercices[0] };
}
const DEUX_RATES = [[[9, 12], [9, 12], [11.5, 7]], [[9, 14], [9, 14], [9, 14]], [[9, 12], [9, 12], [11.5, 6]]];

describe('175 / 3 — le plan : la carte des leviers du gros cran, I68, I69', () => {
  test('le test proposé : les invariants tiennent, le plan porte la phrase', () => {
    const { p, x, c } = planDe([]);
    expect(c.consigne.etat).toBe('test_propose');
    expect(T.verifierPlan(p, planDe([]).e).erreurs).toEqual([]);
    expect(x.escalier).toBeFalsy();
  });
  test('un seul essai raté : pas de carte (l’étirement suit, 2 reps de plus)', () => {
    const { p, x, c, e } = planDe([[[9, 12], [9, 12], [11.5, 7]]]);
    expect(c.consigne.etat).toBe('etirement');
    expect(x.escalier && x.escalier.gros).toBeFalsy();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('DEUX essais ratés : la carte des leviers, sans « Viser plus de reps », ouverte par Ma salle', () => {
    const { p, x, c, e } = planDe(DEUX_RATES);
    expect(c.consigne.fondement.cranGros).toMatchObject({ ratees: 2, carte: true, plafond: 18 });
    expect(x.escalier).toMatchObject({ marche: 'leviers', gros: true });
    const cles = x.escalier.carte.leviers.map((l) => l.cle);
    expect(cles[0]).toBe('salle');
    expect(cles).not.toContain('reps');
    expect(esp(x.escalier.carte.leviers[0].texte)).toBe('Les poids d\'appoint de ta Presse à mollets dans Ma salle');
    expect(esp(x.escalier.carte.phrase)).toMatch(/^9 kg × 12, et le cran suivant est de \+28 %\. Pour continuer à monter :$/);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('la carte répondue ne revient pas : le pari « leviers » du jour la rend sans carte', () => {
    const rep = { id: null, seance: 'S1', jour: '2026-10-21', exercice: SLUG, marche: 'leviers', reponse: 'refusee', compteur: 3,
      debut: FIN, n: null, levier: null };
    const { x } = planDe(DEUX_RATES, { marches: [rep] });
    expect(x.escalier).toMatchObject({ marche: 'leviers', gros: true, reponse: 'refusee' });
    expect(x.escalier.carte).toBeUndefined();
  });
  test('I68 DISCRIMINANT — un plancher faux, un « Viser plus de reps » sur la carte, une cible hors borne font échouer le plan', () => {
    const { p, e } = planDe(DEUX_RATES);
    const a = JSON.parse(JSON.stringify(p));
    a.exercices[0].consigne.fondement.cranGros.plancher = 9;
    expect(T.verifierPlan(a, e).erreurs.join('|')).toMatch(/I68/);
    const b = JSON.parse(JSON.stringify(p));
    b.exercices[0].escalier.carte.leviers.splice(1, 0, { cle: 'reps', texte: 'Viser 15 reps', visee: 15 });
    expect(T.verifierPlan(b, e).erreurs.join('|')).toMatch(/I69.*Viser plus de reps/);
    const d = JSON.parse(JSON.stringify(p));
    d.exercices[0].consigne.fondement.cible = 19;
    expect(T.verifierPlan(d, e).erreurs.join('|')).toMatch(/I68.*cible/);
  });
});
