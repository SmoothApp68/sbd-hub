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

// ── 50-1 (MOTEUR §9.17) — LE POIDS DU CORPS ET L'AIDE SUR LA PAGE D'EXERCICE ──
//
// « Tous les écrans, mêmes données » valait pour une charge. Un exercice en
// `reps` (le corps) n'a pas de charge, une aide en a une NÉGATIVE : la dernière
// séance et le record doivent dire la même chose partout, sans « 0 kg » ni
// signe moins. Le banc (7 G octodecies) le relit à l'écran.
describe('50-1 — la page d’exercice : un exercice en reps et une aide', () => {
  const EXOS2 = [
    { slug: 'tr', nom: 'Corps', mesure: 'reps', charge: 'aucune' },
    { slug: 'as', nom: 'Aide', mesure: 'charge_reps', charge: 'assistance', equipement: 'machine' }
  ];
  const s2 = (slug, id, kg, reps) => ({ id, exercise_slug: slug, type_serie: 'travail', charge_kg: kg, reps, rang: Number(id.slice(1)) });
  const J2 = { a: '2026-09-10T10:00:00Z', b: '2026-09-17T10:00:00Z' };
  const dateDe2 = (s) => J2[s.id[0]];
  const REPS = [[s2('tr', 'a1', null, 8), s2('tr', 'a2', null, 9)], [s2('tr', 'b1', null, 10), s2('tr', 'b2', null, 8)]];
  const AIDE = [[s2('as', 'a1', -30, 8), s2('as', 'a2', -30, 8)], [s2('as', 'b1', -25, 10), s2('as', 'b2', -25, 9)]];

  test('en reps, la dernière séance dit les reps, jamais une charge', () => {
    const m = Modele.meilleureSerieDe('tr', REPS[1], EXOS2, Palier, {});
    expect(m.valeur).toBe('10');
    expect(m.charge).toBeNull();
  });

  test('en reps, le record est le meilleur nombre de reps de tout l’historique', () => {
    const r = Modele.meilleureSerieDeTout('tr', REPS.map((g, i) => ({ cle: 'ab'[i], series: g })), EXOS2, Palier, {});
    expect(r.valeur).toBe('10');
    expect(r.charge).toBeNull();
  });

  test('en reps, la table par reps n’a pas de charge à montrer', () => {
    const t = Modele.tableParReps([].concat.apply([], REPS), 'reps', dateDe2);
    expect(t.length).toBeGreaterThan(0);
    t.forEach((l) => expect(l.charge === 0 || l.charge === undefined || l.charge === null).toBe(true));
  });

  test('⚠️ DISCRIMINANT — une aide : la meilleure série est la MOINS aidée (−25, pas −30)', () => {
    const m = Modele.meilleureSerieDe('as', AIDE[1], EXOS2, Palier, {});
    expect([m.charge, m.reps]).toEqual([-25, 10]);
    expect(Modele.formatMesure({ charge_kg: m.charge, reps: m.reps }).replace(/[  ]/g, ' ')).toBe('Aide 25 kg × 10');
  });

  test('une aide : le record est la ligne la moins aidée de la table, et il se lit « Aide 25 kg × 10 »', () => {
    const t = Modele.tableParReps([].concat.apply([], AIDE), 'charge_reps', dateDe2);
    const r = Modele.recordDeLaTable(t);
    expect([r.charge, r.reps]).toEqual([-25, 10]);
    expect(Modele.formatMesure({ charge_kg: r.charge, reps: r.reps }).replace(/[  ]/g, ' ')).toBe('Aide 25 kg × 10');
    expect(t.every((l) => l.charge <= r.charge)).toBe(true);
  });

  test('une aide : la table se lit sans signe moins, « Aide 25 kg »', () => {
    // La page rend `formatMesure({ charge_kg })` pour une charge négative (rendu.js).
    [-30, -25, -22.5].forEach((kg) => {
      const t = Modele.formatMesure({ charge_kg: kg }).replace(/[  ]/g, ' ');
      expect(t).toBe('Aide ' + String(Math.abs(kg)).replace('.', ',') + ' kg');
      expect(t).not.toMatch(/[−-]/);
    });
  });
});

// ── 51-1 (MOTEUR §9.18) — LA DURÉE ESTIMÉE : UN SEUL CALCUL, PARTOUT ─────────
//
// « Tous les écrans, mêmes données », étendu à la durée d'une routine : la
// carte de la bibliothèque, la feuille « J'ai peu de temps » et la carte du
// raccourci lisent la MÊME estimation (`THMoteur.dureeEstimee`, sur
// `structureDeRoutine`) — jamais un calcul à l'écran. Le banc (7 G vicies) la
// relit à l'écran, routine, feuille et carte côte à côte.
describe('51-1 — la durée estimée : la routine, la feuille et la carte disent la même chose', () => {
  require('../../v2/js/semaine.js');
  require('../../v2/js/profil.js');
  const M = require('../../v2/js/moteur.js');
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const extraire = (nom) => APP.match(new RegExp('^  function ' + nom + '\\b[\\s\\S]*?^  }', 'm'))[0];
  const CAT = { a: { mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
                b: { mesure: 'charge_reps', muscles_primaires: ['dos'], muscles_secondaires: [] } };
  const lignes = (n, ch) => Array.from({ length: n + (ch || 0) }, (_, k) => ({ type_serie: k < (ch || 0) ? 'echauffement' : 'travail', reps: 8 }));
  const ROUTINE = { id: 'r', nom: 'R', exercices: [
    { id: 'x', exercise_slug: 'a', series: lignes(5, 3), repos_cible_s: 240, groupe_superset: null },
    { id: 'y', exercise_slug: 'b', series: lignes(5), repos_cible_s: 180, groupe_superset: null }] };
  const ctx = { Moteur: M, profil: null, parisEscalierConnus: () => [], catalogueIndexe: () => CAT,
    // 53-2 (§9.22) — sans bloc, aucune décharge planifiée.
    local: { blocs: [] }, finsAllegeesConnues: () => [] };
  vm.createContext(ctx);
  ['semaineAllegeeEnCours', 'ciblesPlusCourtes', 'tempsDeLaRoutine'].forEach((n) => vm.runInContext(extraire(n), ctx));

  test('la carte de la routine (et l’aide de la feuille) disent l’estimation du moteur sur la même structure', () => {
    const attendu = M.texteDureeEstimee(M.dureeEstimee(M.structureDeRoutine(ROUTINE.exercices, CAT)));
    ctx.r = ROUTINE;
    expect(vm.runInContext('tempsDeLaRoutine(r).texte', ctx)).toBe(attendu);
  });

  test('la carte du raccourci part de la même estimation : sa structure complète est celle de la routine', () => {
    const complet = M.structureDeRoutine(ROUTINE.exercices, CAT);
    const r = M.raccourcirRoutine(complet, 45);
    expect(M.dureeEstimee(r.exercices)).toBe(r.duree_s);
    expect(r.duree_s).toBeLessThan(M.dureeEstimee(complet));
  });
});
