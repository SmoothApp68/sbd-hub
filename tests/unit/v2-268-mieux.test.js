/** @jest-environment node */
//
// 268 (lot 2, écran D) — « MIEUX UN JOUR » sur une durée ou une distance : un fait sur la ligne du coach, et dans « Tes records du jour ».
// À charge égale ou plus pour une charge portée : 80 m à 20 kg ne bat pas 60 m à 64 kg.

process.env.TZ = 'Europe/Paris';
global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');

const S = (slug, o) => Object.assign({ exercise_slug: slug, type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null }, o);
const passee = (debut, series) => ({ debut, series });
const ce = (debut, series) => ({ debut, series });
const norm = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
const battus = (hist, seance, i) => Modele.recordsBattus(hist, ce('2026-11-07T10:00:00.000Z', seance), i, {});

describe('une durée qui bat la meilleure', () => {
  const hist = [passee('2026-10-12T10:00:00.000Z', [S('planche', { duree_s: 115 })]), passee('2026-10-05T10:00:00.000Z', [S('planche', { duree_s: 90 })])];
  test('le record porte la valeur et l’ancien (sa date)', () => {
    const r = battus(hist, [S('planche', { duree_s: 130 })], 0);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'duree_s', valeur: 130, ancien: 115, ancien_le: '2026-10-12T10:00:00.000Z' });
    expect(r[0].charge).toBeUndefined();   // sans charge : la règle d’avant, octet pour octet
  });
  test('la phrase est un fait, sur la ligne du coach : « Gainage : 2:10, ton meilleur. Avant : 1:55, le 12 oct. »', () => {
    const r = battus(hist, [S('planche', { duree_s: 130 })], 0);
    expect(norm(Modele.phraseDuMeilleur(r, 'Gainage (Planche)', '2026-11-07T10:00:00.000Z'))).toBe('Gainage : 2:10, ton meilleur. Avant : 1:55, le 12 oct.');
  });
  test('jamais un bravo, jamais un point d’exclamation', () => {
    const t = Modele.phraseDuMeilleur(battus(hist, [S('planche', { duree_s: 130 })], 0), 'Gainage (Planche)', '2026-11-07T10:00:00.000Z');
    expect(t).not.toMatch(/!|bravo|félicit/i);
  });
  test('moins bien ou égal : rien', () => {
    expect(battus(hist, [S('planche', { duree_s: 115 })], 0)).toEqual([]);
    expect(Modele.phraseDuMeilleur([], 'Gainage', '2026-11-07T10:00:00.000Z')).toBeNull();
  });
  test('la deuxième série du jour ne se dit « meilleur » que si elle bat aussi la première du jour', () => {
    expect(battus(hist, [S('planche', { duree_s: 130 }), S('planche', { duree_s: 120 })], 1)).toEqual([]);
    expect(battus(hist, [S('planche', { duree_s: 130 }), S('planche', { duree_s: 140 })], 1)[0]).toMatchObject({ valeur: 140, ancien: 130 });
  });
  test('une mobilité (étirement) ne fait aucun record : une tenue plus longue n’est pas un progrès', () => {
    expect(Modele.recordsBattus(hist, ce('2026-11-07T10:00:00.000Z', [S('planche', { duree_s: 300 })]), 0, { sansRecord: true })).toEqual([]);
  });
  test('à plus d’une heure : la prose du journal', () => {
    const r = [{ type: 'duree_s', valeur: 3900, ancien: 3600, ancien_le: '2026-10-12T10:00:00.000Z' }];
    expect(norm(Modele.phraseDuMeilleur(r, 'Marche', '2026-11-07T10:00:00.000Z'))).toBe('Marche : 1 h 05, ton meilleur. Avant : 1 h, le 12 oct.');
  });
});

describe('une charge portée : à charge égale ou plus', () => {
  const hist = [passee('2026-10-03T10:00:00.000Z', [S('fermier', { charge_kg: 64, distance_m: 40 }), S('fermier', { charge_kg: 20, distance_m: 100 })])];
  test('80 m à 20 kg ne bat rien ; 30 m à 64 kg non plus', () => {
    // 80 m à 20 kg : le rival à cette charge ou plus est 100 m à 20 kg (et 40 m à 64 kg) → rien. 80 m à 20 kg ne bat pas 60 m à 64 kg : l’inverse non plus.
    expect(battus(hist, [S('fermier', { charge_kg: 20, distance_m: 80 })], 0)).toEqual([]);
    expect(battus(hist, [S('fermier', { charge_kg: 64, distance_m: 30 })], 0)).toEqual([]);   // 30 m à 64 kg ne bat pas 40 m à 64 kg, même si 100 m à 20 kg est plus loin
  });
  test('DISCRIMINANT — le même exercice, deux charges : chacune se compare à sa charge ou plus', () => {
    const leger = battus(hist, [S('fermier', { charge_kg: 20, distance_m: 90 })], 0);
    expect(leger).toEqual([]);                                   // 100 m à 20 kg est déjà là, et 40 m à 64 kg compte aussi (64 ≥ 20) : 100 m
    const lourd = battus(hist, [S('fermier', { charge_kg: 64, distance_m: 60 })], 0);
    expect(lourd).toHaveLength(1);
    expect(lourd[0]).toMatchObject({ type: 'distance_m', valeur: 60, ancien: 40, charge: 64, ancien_charge: 64 });
  });
  test('un record à une charge jamais atteinte : rien à battre à cette charge ou plus', () => {
    const r = battus(hist, [S('fermier', { charge_kg: 72, distance_m: 10 })], 0);
    expect(r[0]).toMatchObject({ type: 'distance_m', valeur: 10, ancien: null, charge: 72 });
  });
  test('la phrase dit la charge, et celle de l’ancien', () => {
    const r = battus(hist, [S('fermier', { charge_kg: 64, distance_m: 60 })], 0);
    expect(norm(Modele.phraseDuMeilleur(r, 'Marche du Fermier (Haltères)', '2026-11-07T10:00:00.000Z'))).toBe('Marche du Fermier : 60 m à 64 kg, ton meilleur. Avant : 40 m à 64 kg, le 3 oct.');
  });
  test('la médaille du récap : « Plus longue distance, à 64 kg ou plus : 60 m. »', () => {
    const r = battus(hist, [S('fermier', { charge_kg: 64, distance_m: 60 })], 0);
    const p = Modele.phraseDeRecord(r, 'marche du fermier', '2026-11-07T10:00:00.000Z', (s) => s);
    expect(norm(p[0])).toBe('Plus longue distance, à 64 kg ou plus : 60 m.');
    expect(norm(p[1])).toBe('Avant : 40 m à 64 kg, le 3 oct.');
  });
  test('un gainage lesté suit la même règle (charge × durée)', () => {
    const h = [passee('2026-10-03T10:00:00.000Z', [S('planche', { charge_kg: 10, duree_s: 60 })])];
    expect(battus(h, [S('planche', { charge_kg: 5, duree_s: 50 })], 0)).toEqual([]);
    expect(battus(h, [S('planche', { charge_kg: 10, duree_s: 70 })], 0)[0]).toMatchObject({ type: 'duree_s', valeur: 70, charge: 10, ancien: 60 });
  });
});
