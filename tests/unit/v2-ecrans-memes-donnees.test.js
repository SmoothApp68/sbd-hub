/** @jest-environment node */
//
// PR 5 de la consolidation « un seul coach, un seul câblage » (relevé du
// 01/10/2026, décisions du 02/10/2026) — LES ÉCRANS HORS SÉANCE.
//
//   · « Dernière séance » (page d'exercice) : la meilleure série du jour,
//     comme Progression et la carte de séance (`Modele.meilleureSerieDe`).
//   · « Record de charge » : la ligne la plus lourde de la table par reps
//     (`Modele.recordDeLaTable`), exploration comprise.
// Le banc (7 G quindecies) compare les écrans entre eux ; ici, les règles.

process.env.TZ = 'Europe/Paris';

const Modele = require('../../v2/js/modele.js');
const Palier = require('../../v2/js/palier.js');

const EXOS = [{ slug: 'dc', nom: 'Développé Couché', mesure: 'charge_reps', equipement: 'barre' }];
const serie = (id, kg, reps) => ({ id, exercise_slug: 'dc', type_serie: 'travail', charge_kg: kg, reps, rang: Number(id.slice(1)) });
const JOURS = { a: '2026-09-10T10:00:00Z', b: '2026-09-17T10:00:00Z', c: '2026-09-24T10:00:00Z' };
const HISTO = [
  [serie('a1', 90, 12), serie('a2', 90, 12), serie('a3', 90, 12)],
  [serie('b1', 100, 10), serie('b2', 100, 10), serie('b3', 100, 10), serie('b4', 130, 1)],
  [serie('c1', 100, 10), serie('c2', 100, 10), serie('c3', 105, 8)]
];
const dateDe = (s) => JOURS[s.id[0]];
const table = () => Modele.tableParReps([].concat.apply([], HISTO), 'charge_reps', dateDe);

describe('PR 5 — le record de charge : la ligne la plus lourde de la table', () => {
  test('⚠️ DISCRIMINANT — l’exploration à 130 × 1 est le record (l’ancien chemin rendait 105 × 8)', () => {
    expect(Modele.recordDeLaTable(table())).toEqual({ charge: 130, reps: 1, date: JOURS.b });
    const ancien = Modele.meilleureSerieDeTout('dc', HISTO.map((g, i) => ({ cle: 'abc'[i], series: g })), EXOS, Palier, {});
    expect([ancien.charge, ancien.reps]).toEqual([105, 8]);
  });
  test('la fiche et la table disent le même chiffre : aucune ligne plus lourde que le record', () => {
    const r = Modele.recordDeLaTable(table());
    expect(table().every((l) => l.charge <= r.charge)).toBe(true);
  });
  test('à charge égale, celle qui a le plus de reps', () => {
    expect(Modele.recordDeLaTable([{ reps: 1, charge: 140, date: 'x' }, { reps: 3, charge: 140, date: 'y' },
      { reps: 5, charge: 120, date: 'z' }])).toEqual({ charge: 140, reps: 3, date: 'y' });
  });
  test('sans table : une absence, pas un zéro', () => {
    expect(Modele.recordDeLaTable([])).toEqual({ charge: null, reps: null, date: null });
    expect(Modele.recordDeLaTable(null)).toEqual({ charge: null, reps: null, date: null });
  });
});

describe('PR 5 — « Dernière séance » : la meilleure série du jour', () => {
  test('⚠️ DISCRIMINANT — 100 × 10, 100 × 10, 105 × 8 : 105 × 8, pas le palier 100 × 10', () => {
    const m = Modele.meilleureSerieDe('dc', HISTO[2], EXOS, Palier, {});
    expect([m.charge, m.reps]).toEqual([105, 8]);
    const p = Palier.analyser(HISTO[2], undefined, { mesure: 'charge_reps' });
    expect([p.palier, p.reps]).toEqual([100, 10]);
  });
  test('la même valeur que Progression lisait sur le moteur de palier (`meilleure`)', () => {
    HISTO.forEach((g) => {
      const m = Modele.meilleureSerieDe('dc', g, EXOS, Palier, {});
      const p = Palier.analyser(g, undefined, { mesure: 'charge_reps' }).meilleure;
      expect([m.charge, m.reps]).toEqual([p.charge, p.reps]);
    });
  });
});
