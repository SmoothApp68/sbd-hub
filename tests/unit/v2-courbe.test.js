/** @jest-environment node */
//
// 206 — LA GÉOMÉTRIE DES COURBES (`v2/js/courbe.js`) : pure, sans DOM. Points espacés par la date, trait en moyenne
// glissante sur 3 séances, périodes, repères ronds, mini-courbe.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
const C = require('../../v2/js/courbe.js');

const J = (a, m, j) => new Date(a, m, j, 18, 0, 0);
const P = (d, valeur, record) => ({ debut: d.toISOString(), valeur, record: !!record });

describe('206 — THCourbe', () => {
  test('lisser : moyenne des 3 dernières séances, moins au début — jamais une valeur inventée', () => {
    const l = C.lisser([P(J(2026, 0, 1), 100), P(J(2026, 0, 8), 110), P(J(2026, 0, 15), 120), P(J(2026, 0, 22), 90)]);
    expect(l.map((p) => p.valeur)).toEqual([100, 105, 110, (110 + 120 + 90) / 3]);
  });

  test('dansLaPeriode : 3 mois, 6 mois, 1 an, tout', () => {
    const now = J(2026, 10, 1);
    const pts = [P(J(2024, 0, 1), 1), P(J(2025, 11, 1), 2), P(J(2026, 4, 15), 3), P(J(2026, 9, 1), 4)];
    expect(C.dansLaPeriode(pts, '3m', now).map((p) => p.valeur)).toEqual([4]);
    expect(C.dansLaPeriode(pts, '6m', now).map((p) => p.valeur)).toEqual([3, 4]);
    expect(C.dansLaPeriode(pts, '1a', now).map((p) => p.valeur)).toEqual([2, 3, 4]);
    expect(C.dansLaPeriode(pts, 'tout', now).map((p) => p.valeur)).toEqual([1, 2, 3, 4]);
    expect(C.dansLaPeriode(pts, 'inconnue', now).map((p) => p.valeur)).toEqual([3, 4]);
  });

  test('geometrie : espacée par la DATE, jamais par le rang', () => {
    const g = C.geometrie([P(J(2026, 0, 1), 100), P(J(2026, 0, 2), 101), P(J(2026, 3, 1), 120)]);
    expect(g.points).toHaveLength(3);
    expect(g.points[0].x).toBe(g.gauche);
    expect(g.points[2].x).toBe(g.droite);
    // un jour sur 90 : le deuxième point reste collé au premier.
    expect(g.points[1].x - g.points[0].x).toBeLessThan(5);
  });

  test('geometrie : échelle de la fenêtre, repères ronds qui encadrent, le plus haut en haut', () => {
    const g = C.geometrie([P(J(2026, 0, 1), 141), P(J(2026, 5, 1), 152)]);
    const v = g.graduations.map((x) => x.valeur);
    expect(v[0]).toBeLessThanOrEqual(141);
    expect(v[v.length - 1]).toBeGreaterThanOrEqual(152);
    expect(g.points[1].y).toBeLessThan(g.points[0].y);
    g.graduations.forEach((x) => { expect(x.y).toBeGreaterThanOrEqual(g.haut - 0.01); expect(x.y).toBeLessThanOrEqual(g.bas + 0.01); });
  });

  test('geometrie : le drapeau record voyage, le trait a un point par séance, rien ne prolonge la courbe', () => {
    const g = C.geometrie([P(J(2026, 0, 1), 100), P(J(2026, 0, 8), 110, true), P(J(2026, 0, 15), 105)]);
    expect(g.points.map((p) => p.record)).toEqual([false, true, false]);
    expect(g.trait).toHaveLength(3);
    expect(g.trait[2].x).toBe(g.points[2].x);
    expect(Math.max.apply(null, g.trait.map((p) => p.x))).toBeLessThanOrEqual(g.droite);
  });

  test('geometrie : un seul point ou aucun ne casse rien', () => {
    expect(C.geometrie([]).points).toEqual([]);
    const un = C.geometrie([P(J(2026, 0, 1), 100)]);
    expect(un.points).toHaveLength(1);
    expect(isFinite(un.points[0].x) && isFinite(un.points[0].y)).toBe(true);
    const plat = C.geometrie([P(J(2026, 0, 1), 100), P(J(2026, 1, 1), 100)]);
    plat.points.forEach((p) => expect(isFinite(p.y)).toBe(true));
  });

  test('geometrie : au plus 4 repères de mois, nommés', () => {
    const g = C.geometrie([P(J(2025, 0, 10), 100), P(J(2026, 9, 10), 120)]);
    expect(g.mois.length).toBeGreaterThan(0);
    expect(g.mois.length).toBeLessThanOrEqual(4);
    expect(g.mois[0].libelle).toMatch(/janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc/);
  });

  test('resume : départ, fin, écart ; null écart sous deux points', () => {
    expect(C.resume([])).toBeNull();
    expect(C.resume([P(J(2026, 0, 1), 100)]).ecart).toBeNull();
    expect(C.resume([P(J(2026, 0, 1), 141), P(J(2026, 1, 1), 150), P(J(2026, 2, 1), 152)])).toMatchObject({ debut: 141, fin: 152, ecart: 11, n: 3 });
  });

  test('mini : le trait est le MÊME que celui de la page (moyenne glissante), le dernier point porte le record', () => {
    const m = C.mini([P(J(2026, 0, 1), 100), P(J(2026, 0, 8), 110), P(J(2026, 0, 15), 120, true)]);
    expect(m.trait).toHaveLength(3);
    expect(m.dernier.record).toBe(true);
    expect(C.mini([P(J(2026, 0, 1), 100)]).trait).toEqual([]);
  });

  test('pasRond : 1, 2, 2,5, 5, 10 et leurs multiples', () => {
    expect(C.pasRond(11, 3)).toBe(5);
    expect(C.pasRond(30, 3)).toBe(10);
    expect(C.pasRond(4, 3)).toBe(2);
  });
});

describe('206 — étendue minimale de l\'axe', () => {
  test('charge : 133 → 134,5 couvre au moins 10 % de la médiane (13 kg), centrée sur les données', () => {
    const g = C.geometrie([P(J(2026, 0, 1), 133), P(J(2026, 1, 1), 134.5)], null, 'charge');
    const v = g.graduations.map((x) => x.valeur);
    expect(v[v.length - 1] - v[0]).toBeGreaterThanOrEqual(13);
    expect(v[0]).toBeLessThan(133);
    expect(v[v.length - 1]).toBeGreaterThan(134.5);
    // l'écart de 1,5 kg occupe une petite part de la hauteur
    expect(Math.abs(g.points[1].y - g.points[0].y)).toBeLessThan((g.bas - g.haut) * 0.25);
  });
  test('reps : au moins 4 ; secondes : au moins 10', () => {
    const r = C.geometrie([P(J(2026, 0, 1), 12), P(J(2026, 1, 1), 13)], null, 'reps').graduations.map((x) => x.valeur);
    expect(r[r.length - 1] - r[0]).toBeGreaterThanOrEqual(4);
    const t = C.geometrie([P(J(2026, 0, 1), 60), P(J(2026, 1, 1), 62)], null, 'temps').graduations.map((x) => x.valeur);
    expect(t[t.length - 1] - t[0]).toBeGreaterThanOrEqual(10);
  });
  test('une grande variation garde son échelle ; la mini-courbe suit la même règle', () => {
    const g = C.geometrie([P(J(2026, 0, 1), 100), P(J(2026, 1, 1), 150)], null, 'charge');
    expect(g.graduations[0].valeur).toBeLessThanOrEqual(100);
    const plat = C.mini([P(J(2026, 0, 1), 133), P(J(2026, 1, 1), 134.5)], 92, 36, 'charge');
    expect(Math.abs(plat.trait[1].y - plat.trait[0].y)).toBeLessThan(36 * 0.25);
    const fort = C.mini([P(J(2026, 0, 1), 100), P(J(2026, 1, 1), 150)], 92, 36, 'charge');
    expect(Math.abs(fort.trait[1].y - fort.trait[0].y)).toBeGreaterThan(36 * 0.6);
  });
});
