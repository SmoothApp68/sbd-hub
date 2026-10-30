/** @jest-environment node */
//
// 193-1 (commit 3) — LA CHARGE D'UN RECUL (MOTEUR §9.28) : la grosse série du jour − un écart, arrondie au cran le plus proche
// du matériel, VERS LE BAS à égalité, jamais au niveau de la grosse ; l'écart se lit sur la dernière séance à reculs.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const g = (kg, reps) => ({ charge_kg: kg, reps: reps, type_serie: 'travail' });
const r = (kg, reps) => ({ charge_kg: kg, reps: reps, type_serie: 'recul' });
const charge = (grosse, ecart, extra) => M.reculDe(Object.assign({ grosse: grosse, ecart: ecart, cran: 2.5 }, extra || {})).charge;

describe('193-1 — la charge : le cran le plus proche, vers le bas à égalité', () => {
  test('150 − 10 % = 135 (cran 2,5)', () => { expect(charge(150, 0.10)).toBe(135); });
  test('152,5 − 10 % = 137,25 → 137,5 (le plus proche), et non 135 : la grosse monte, les reculs suivent', () => {
    expect(charge(152.5, 0.10)).toBe(137.5);
  });
  test('ÉGALITÉ : 150 − 7,5 % = 138,75, à égale distance de 137,5 et 140 → 137,5 (vers le bas)', () => {
    expect(charge(150, 0.075)).toBe(137.5);
  });
  test('cranLePlusProche garde le plus lourd à égalité dans cranSousProcheDe, pas ici : 140 ≠ 137,5', () => {
    const voisine = (c, s) => (s < 0 ? Math.ceil(c / 2.5 - 1e-9) * 2.5 - 2.5 : null);
    expect(M.cranLePlusProche(voisine, 150, 138.75)).toBe(137.5);
  });
  test('pas de 1 kg (disque de 0,5) : 150 → 135 ; 152 − 10 % = 136,8 → 137', () => {
    expect(charge(150, 0.10, { cran: 1 })).toBe(135);
    expect(charge(152, 0.10, { cran: 1 })).toBe(137);
  });
  test('jamais la charge de la grosse ni plus lourd, quel que soit l’écart (borné 5 %)', () => {
    expect(charge(150, 0.05)).toBe(142.5);
    expect(charge(150, 0.001)).toBe(142.5);          // l’écart est borné à 5 %
    expect(charge(150, 0.0)).toBeLessThan(150);
  });
  test('l’écart est borné à 20 %', () => { expect(charge(150, 0.9)).toBe(120); });
  test('haltères : une charge que la salle fait, jamais au-dessus de la grosse', () => {
    const salle = { materiel: 'halteres', charges: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32] };
    const x = M.reculDe({ grosse: 30, ecart: 0.10, cran: 2, salle: salle });
    expect(x.charge).toBe(26);                        // 27 : à égalité entre 26 et 28 → vers le bas
    const y = M.reculDe({ grosse: 10, ecart: 0.10, salle: salle });
    expect(y.charge).toBe(null);                      // rien de plus léger que la plus petite paire
    expect(y.phrase).toMatch(/Rien de plus léger/);
  });
  test('sans grosse série : une ligne vide et une phrase, jamais une charge devinée', () => {
    const x = M.reculDe({ grosse: null, ecart: 0.10 });
    expect(x.charge).toBe(null);
    expect(x.phrase).toBe('Pas de grosse série pour caler tes reculs.');
  });
});

describe('193-1 — l’écart : lu sur la dernière séance à reculs', () => {
  test('sans séance antérieure à reculs : 10 %', () => {
    expect(M.ecartDeRecul(null, 6)).toMatchObject({ ecart: 0.10, depart: true });
    expect(M.ecartDeRecul({ series: [g(150, 4)] }, 6)).toMatchObject({ ecart: 0.10, depart: true });
  });
  test('150 × 4 puis 135 × 6-6-6 pour une cible de 6 : l’écart réel (10 %) est gardé', () => {
    expect(M.ecartDeRecul({ series: [g(150, 4), r(135, 6), r(135, 6), r(135, 6)] }, 6)).toMatchObject({ ecart: 0.10, reel: 0.10, sens: null });
  });
  test('TOUS à cible + 2 ou plus (9-8-8 pour 6) : l’écart baisse de 2,5 points → 7,5 %', () => {
    const e = M.ecartDeRecul({ series: [g(150, 4), r(135, 9), r(135, 8), r(135, 8)] }, 6);
    expect(e.ecart).toBeCloseTo(0.075, 6);
    expect(e.sens).toBe('rapproche');
  });
  test('UNE seule facile (9-6-6) : du bruit, l’écart ne bouge pas', () => {
    expect(M.ecartDeRecul({ series: [g(150, 4), r(135, 9), r(135, 6), r(135, 6)] }, 6).ecart).toBeCloseTo(0.10, 6);
  });
  test('UN recul raté (6-6-4 pour 6) : l’écart monte de 2,5 points → 12,5 %', () => {
    const e = M.ecartDeRecul({ series: [g(150, 4), r(135, 6), r(135, 6), r(135, 4)] }, 6);
    expect(e.ecart).toBeCloseTo(0.125, 6);
    expect(e.sens).toBe('eloigne');
  });
  test('borne basse 5 % : depuis un écart réel de 5 %, il ne descend pas', () => {
    const e = M.ecartDeRecul({ series: [g(150, 4), r(142.5, 9), r(142.5, 9)] }, 6);
    expect(e.ecart).toBeCloseTo(0.05, 6);
  });
  test('borne haute 20 % : depuis un écart réel de 20 %, il ne monte pas', () => {
    const e = M.ecartDeRecul({ series: [g(150, 4), r(120, 3)] }, 6);
    expect(e.ecart).toBeCloseTo(0.20, 6);
  });
  test('l’écart réel arrondi au demi-point : 137,5 ÷ 152,5 (9,8 %) se lit 10 %', () => {
    expect(M.ecartDeRecul({ series: [g(152.5, 3), r(137.5, 6)] }, 6).reel).toBeCloseTo(0.10, 6);
  });
  test('sans cible : l’écart réel, sans ajustement', () => {
    expect(M.ecartDeRecul({ series: [g(150, 4), r(135, 12)] }, null).ecart).toBeCloseTo(0.10, 6);
  });
  test('un recul hors calcul n’est pas lu (le modèle le dit)', () => {
    const e = M.ecartDeRecul({ series: [g(150, 4), Object.assign(r(135, 6), { hors_calcul: true })] }, 6);
    expect(e.depart).toBe(true);
  });
});
