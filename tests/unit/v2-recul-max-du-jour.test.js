/** @jest-environment node */
//
// 193-5 (MOTEUR §9.28, delta du 31/10/2026) — LES RECULS À PLUS DE REPS SE CALENT SUR LE MAX DU JOUR.
// La table (Tuchscherer, RPE 10 = marge 0), le max du jour, la charge du recul, la correction personnelle rejouée, les phrases.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const g = (kg, reps, extra) => Object.assign({ charge_kg: kg, reps: reps, type_serie: 'travail' }, extra || {});
const r = (kg, reps, extra) => Object.assign({ charge_kg: kg, reps: reps, type_serie: 'recul' }, extra || {});
const sp = (t) => t.replace(/[  ]/g, ' ');
const auMax = (grosse, grosseReps, marge, reps, extra) =>
  M.reculAuMax(Object.assign({ grosse: grosse, grosseReps: grosseReps, marge: marge, reps: reps, cran: 2.5 }, extra || {}));

describe('193-5 — la table', () => {
  test('les 12 valeurs, et la marge décale de m reps', () => {
    expect(M.PCT_MAX_PAR_REPS).toEqual([100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0]);
    expect(M.pctDuMax(1, 0)).toBe(100);
    expect(M.pctDuMax(4, 1)).toBe(86.3);       // 4 reps en en gardant 1 = 5 reps à fond
    expect(M.pctDuMax(8, 2)).toBe(73.9);
    expect(M.pctDuMax(12, 0)).toBe(68);
  });
  test('au-delà de 12 : pas de règle (null) ; une marge fractionnaire s’interpole', () => {
    expect(M.pctDuMax(11, 2)).toBeNull();
    expect(M.pctDuMax(13, 0)).toBeNull();
    expect(M.pctDuMax(4, 1.5)).toBeCloseTo(85.0, 5);
  });
  test('Epley n’est pas touché : 150 × 5 → 175', () => { expect(M.unRMEpley(150, 5)).toBeCloseTo(175, 6); });
});

describe('193-5 — les cas de la maquette (réglage Franc, visée Lourd = marge 1)', () => {
  test('couché 132,5 × 4 marge 1, reculs × 8 → max du jour ≈ 154 kg, 74 %, 112,5 kg', () => {
    const x = auMax(132.5, 4, 1, 8);
    expect(x.charge).toBe(112.5);
    expect(Math.round(x.max)).toBe(154);
    expect(Math.round(x.pct)).toBe(74);
  });
  test('135 × 4 + correction +2,5 % → 117,5', () => { expect(auMax(135, 4, 1, 8, { correction: 0.025 }).charge).toBe(117.5); });
  test('squat 135 × 4, reculs × 6 → 122,5 ; soulevé 170 × 4, reculs × 5 → 160', () => {
    expect(auMax(135, 4, 1, 6).charge).toBe(122.5);
    expect(auMax(170, 4, 1, 5).charge).toBe(160);
  });
  test('marge inconnue = 0 ; égalité du cran : vers le bas ; jamais au niveau de la grosse', () => {
    expect(auMax(100, 4, null, 8).marge).toBe(0);
    // 100 × 4 sans marge : max 116,3 ; × 73,9 % = 85,6 ; cran 5 : 85 (le plus proche)
    expect(auMax(100, 4, 0, 8, { cran: 5 }).charge).toBe(85);
    const y = auMax(100, 7, 0, 8);
    expect(y.charge).toBeLessThan(100);
  });
  test('la règle ne s’applique pas : mêmes reps, moins de reps, reps inconnues, au-delà de 12 → null (la 193-1 reste)', () => {
    expect(auMax(150, 6, 1, 6)).toBeNull();
    expect(auMax(150, 6, 1, 4)).toBeNull();
    expect(auMax(150, null, 1, 8)).toBeNull();
    expect(auMax(150, 4, 1, 11)).toBeNull();     // 11 + 2 > 12
    expect(auMax(150, 11, 2, 12)).toBeNull();
  });
  test('haltères : une charge que la salle fait, jamais au-dessus de la grosse', () => {
    const salle = { materiel: 'halteres', charges: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32] };
    const x = M.reculAuMax({ grosse: 30, grosseReps: 4, marge: 1, reps: 8, salle: salle });
    expect(salle.charges).toContain(x.charge);
    expect(x.charge).toBeLessThan(30);
  });
});

describe('193-5 — la correction personnelle (rejouée)', () => {
  // couché 132,5 × 4 (marge 1 : rpe 9) → max ≈ 153,5 ; le recul de 112,5 prévoit 8 reps (marge 2)
  const seance = (reps, cible, extra) => Object.assign({ cible: cible === undefined ? 8 : cible,
    series: [g(132.5, 4, { rpe: 9 }), r(112.5, 8, { rpe: 8 }), r(112.5, reps, { rpe: 8 })] }, extra || {});
  test('12 reps pour 8 prévues (≥ +2) : +2,5 %', () => {
    const c = M.correctionDeRecul([seance(12)]);
    expect(c.valeur).toBe(0.025);
    expect(c.pas[0].prevision).toBe(8);
    expect(c.pas[0].faites).toBe(12);
  });
  test('sous la cible : −2,5 % ; dans la cible : 0', () => {
    expect(M.correctionDeRecul([seance(6)]).valeur).toBe(-0.025);
    expect(M.correctionDeRecul([seance(8)]).valeur).toBe(0);
    expect(M.correctionDeRecul([seance(9)]).valeur).toBe(0);    // 9 < 8 + 2 : pas assez pour monter
  });
  test('cumulée du plus ancien au plus récent, bornée à ± 10 %, sur les 4 dernières séances à plus de reps', () => {
    const pool = [1, 2, 3, 4, 5].map(() => seance(12));
    expect(M.correctionDeRecul(pool).valeur).toBe(0.10);
    expect(M.correctionDeRecul(pool).pas).toHaveLength(4);
    expect(M.correctionDeRecul([seance(12), seance(12), seance(6)]).valeur).toBe(0.025);   // 6 d’abord (−), 12, 12 (+) → rejoué ancien → récent
  });
  test('une séance aux MÊMES reps n’entre pas dans la correction', () => {
    const memes = { cible: 4, series: [g(132.5, 4), r(120, 4), r(120, 8)] };
    expect(M.reculDePlusDeReps(memes)).toBe(false);
    expect(M.correctionDeRecul([memes]).valeur).toBe(0);
  });
  test('la marge du recul tel que fait : un échec compte 0 ; sans note, la marge visée (2)', () => {
    // à l’échec (marge 0) : 112,5 correspond à 73,3 % → 10,3 reps − 0 = 10 prévues ; 12 ≥ 10 + 2 : +2,5 %
    const s = { cible: 8, series: [g(132.5, 4, { rpe: 9 }), r(112.5, 12, { rpe: 10 })] };
    expect(M.correctionDeRecul([s]).pas[0].prevision).toBe(10);
    expect(M.correctionDeRecul([s]).valeur).toBe(0.025);
    const sans = { cible: 8, series: [g(132.5, 4, { rpe: 9 }), r(112.5, 12)] };
    expect(M.correctionDeRecul([sans]).pas[0].prevision).toBe(8);
  });
});

describe('193-5 — les phrases', () => {
  test('sous le recul', () => { expect(sp(M.phraseReculAuMax(112.5, 73.9))).toBe('Recul : 112,5 kg, 74 % de ton max aujourd’hui.'); });
  test('le Pourquoi, sans correction', () => {
    expect(sp(M.pourquoiReculAuMax({ grosse: 132.5, grosseReps: 4, marge: 1, max: 154, reps: 8, pct: 73.9, charge: 112.5, correction: 0, pas: [] })))
      .toBe('Ta grosse série, 132,5 kg × 4 en gardant 1 rep, dit que ton max aujourd’hui est d’environ 154 kg. Pour 8 reps en en gardant 2, c’est 74 % : 112,5 kg.');
  });
  test('sans marge ; avec correction (la dernière série a fait plus que la table)', () => {
    const t = sp(M.pourquoiReculAuMax({ grosse: 132.5, grosseReps: 4, marge: 0, max: 148, reps: 8, pct: 73.9, charge: 112.5, correction: 0.025,
      pas: [{ charge: 112.5, faites: 12, prevision: 10, cible: 8, delta: 0.025 }] }));
    expect(t).toMatch(/132,5 kg × 4 sans marge/);
    expect(t).toMatch(/Ta dernière série à 112,5 kg a fait 12 reps, 2 de plus que la table ne le prévoyait pour toi : je te compte 2,5 % de plus\.$/);
  });
  test('correction négative', () => {
    const t = sp(M.pourquoiReculAuMax({ grosse: 132.5, grosseReps: 4, marge: 1, max: 154, reps: 8, pct: 73.9, charge: 110, correction: -0.025,
      pas: [{ charge: 112.5, faites: 6, prevision: 8, cible: 8, delta: -0.025 }] }));
    expect(t).toMatch(/a fait 6 reps pour une cible de 8 : je te compte 2,5 % de moins\.$/);
  });
});
