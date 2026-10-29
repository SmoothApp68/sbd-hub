/** @jest-environment node */
//
// 186 — LE HORS-PALIER (décision d'Aurélien du 29/10/2026, MOTEUR §9.7 bis) et LE CRAN DU MATÉRIEL (§10.2).
//
// Un single (1-2 reps) à +15 % ou plus de la charge de travail, au-delà de deux crans, est un record possible mais jamais
// une charge de travail : ni palier, ni habitude, ni cran. Le type `test` le dit explicitement. Ici les deux côtés de chaque seuil.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
const P = require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

let n = 0;
const b = (kg, r, o) => Object.assign({ id: 'h' + (++n), rang: n, charge_kg: kg, reps: r, type_serie: 'travail', exercise_slug: 'x' }, o || {});
const roles = (series, cran) => P.analyser(series, null, { mesure: 'charge_reps', cran: cran }).series.map((d) => d.role);

describe('186 — hors-palier : les seuils', () => {
  const base = () => [b(150, 5), b(150, 5), b(150, 5)];
  test('+15 % exact, 1 rep : hors palier', () => {
    expect(roles(base().concat([b(172.5, 1)])).pop()).toBe(P.HORS_PALIER);
  });
  test('juste sous +15 % : pas hors palier', () => {
    expect(roles(base().concat([b(170, 1)])).pop()).not.toBe(P.HORS_PALIER);
  });
  test('2 reps : hors palier ; 3 reps : non (c\'est une charge de travail)', () => {
    expect(roles(base().concat([b(190, 2)])).pop()).toBe(P.HORS_PALIER);
    expect(roles(base().concat([b(190, 3)])).pop()).not.toBe(P.HORS_PALIER);
  });
  test('le plancher des deux crans : 7,5 x 1 après 5 x 17 (+50 %, un cran) reste une tentative', () => {
    expect(roles([b(5, 17), b(5, 17), b(7.5, 1)], 2.5).pop()).not.toBe(P.HORS_PALIER);
  });
  test('le type test l\'est à toute charge et à toutes reps', () => {
    expect(roles(base().concat([b(152.5, 8, { type_serie: 'test' })])).pop()).toBe(P.HORS_PALIER);
  });
  test('le palier ne bouge pas à cause du single', () => {
    const seul = P.analyser(base(), null, { mesure: 'charge_reps' }).palier;
    const avec = P.analyser(base().concat([b(190, 1)]), null, { mesure: 'charge_reps' }).palier;
    expect(avec).toBe(seul);
    expect(avec).toBe(150);
  });
  test('sans série à 3 reps ou plus, rien n\'est hors palier', () => {
    expect(P.horsPalierAuto([b(190, 1), b(150, 2)], 2.5)).toEqual([]);
  });
});

describe('186 — le cran du barre et des haltères est le pas du matériel (A4)', () => {
  const dates = ['2026-03-01', '2026-03-05', '2026-03-09', '2026-03-13'];
  const mk = (d, ser) => ({ seance: { id: d, debut: d + 'T18:00:00Z' },
    series: ser.map(([kg, r], i) => ({ id: d + i, rang: i + 1, charge_kg: kg, reps: r, type_serie: 'travail', exercise_slug: 'x', rpe: null, ressenti: null })) });
  const O = (eq) => ({ mesure: 'charge_reps', equipement: eq, intention: 'progresser', reglage: 'normal', edition: false });
  const hist = dates.map((d) => mk(d, [[150, 5], [150, 5], [150, 5], [190, 1]]));

  test('le single à 190 n\'est pas le cran : la ligne ne saute pas à 190', () => {
    const r = M.consigneDExercice(hist, undefined, '2026-03-17T18:00:00Z', O('barre'));
    const c = r.consigne;
    expect(JSON.stringify(c.ligne)).not.toMatch(/190/);
    expect(c.fondement.horsPalier).toBeTruthy();
  });
  test('la reprise repart du dernier palier de travail (pas du single)', () => {
    const r = M.consigneDExercice(hist, undefined, '2026-07-20T18:00:00Z', O('barre'));
    expect(JSON.stringify(r.consigne.ligne)).not.toMatch(/190/);
  });
});
