//
// v2 — 261 : L'ORDRE D'AFFICHAGE D'UN SUPERSET PAR TOURS (`THTours.ordonner`, maquette-superset-entrelace-v4).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//   DES SÉRIES FAITES DANS LE DÉSORDRE. Sur un superset validé de haut en bas, « une série garde sa place » et « une série
//   suit la dernière cochée » donnent le même écran ; il faut A3 avant B2 (la place reste) et A1 A2 avant B1 (le bloc SEUL).
// Les huit cas de la maquette : 1 chauffe · 2 séries inégales · 3 dégressive · 4 commencé seul · 5 court · 6 sauté / ajouté ·
// 7 correction · 8 triset.
require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
const Tours = require('../../v2/js/tours.js');

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé Couché (Haltère)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'po', nom: 'Pull-over', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['dos'], muscles_secondaires: [] },
  { slug: 'ec', nom: 'Écarté Machine', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] }
];

// Une série : 'T' travail, 'C' chauffe, 'D' dégressive ; un nombre derrière = faite à la minute N (validee_a).
function serie(code) {
  const m = /^([TCD])(\d+)?$/.exec(code);
  const t = { C: 'echauffement', T: 'travail', D: 'degressive' }[m[1]];
  return { type_serie: t, charge_kg: 50, reps: 8, validee_a: m[2] ? '2026-11-06T10:' + String(m[2]).padStart(2, '0') + ':00Z' : null };
}
// `[slug, [codes]]` ; tous dans le même groupe.
function bloc(exos) {
  const seance = { exercices: exos.map(([slug, codes]) => ({ exercise_slug: slug, groupe_superset: 1, series: codes.map(serie) })) };
  const blocs = Modele.blocsDeSeance(seance, CATALOGUE);
  expect(blocs).toHaveLength(1);
  return blocs[0];
}
// « A1 B1 » : le badge (lettre + tour) de chaque ligne ; « A↓ » pour une dégressive, « A » pour une chauffe.
const lire = (b) => b.lignes.map((s) => s.etiquette || '?').join(' ');
const ordre = (exos) => Tours.ordonner(bloc(exos)).blocs.map((b) => (b.genre === 'tour' ? 'T' + b.n : b.genre === 'seul' ? 'SEUL' : 'CHAUFFE') + ':' + lire(b));

describe('261 — l’ordre d’affichage d’un superset', () => {
  test('cas 1 — la chauffe a son bloc avant le tour 1, jamais un tour 0 ; les tours partent de 1', () => {
    expect(ordre([['dc', ['C', 'T', 'T']], ['po', ['T', 'T']]])).toEqual(['CHAUFFE:A', 'T1:A1 B1', 'T2:A2 B2']);
  });
  test('cas 1 — pas de chauffe, pas de bloc CHAUFFE', () => {
    expect(ordre([['dc', ['T']], ['po', ['T']]])).toEqual(['T1:A1 B1']);
  });
  test('cas 2 — séries inégales : le dernier tour dit qui reste seul', () => {
    const r = Tours.ordonner(bloc([['dc', ['T', 'T', 'T', 'T']], ['po', ['T', 'T', 'T']]]));
    expect(r.nbTours).toBe(4);
    expect(r.blocs.map((b) => b.phrase)).toEqual([null, null, null, 'Développé Couché seul : Pull-over a 3 séries.']);
    expect(r.blocs[3].lignes.map((s) => s.etiquette)).toEqual(['A4']);
  });
  test('cas 2 — tours égaux : aucune phrase', () => {
    expect(Tours.ordonner(bloc([['dc', ['T', 'T']], ['po', ['T', 'T']]])).blocs.map((b) => b.phrase)).toEqual([null, null]);
  });
  test('cas 3 — la dégressive reste sous sa série, dans son tour, avant l’autre exercice, et n’ouvre pas de tour', () => {
    const o = Tours.ordonner(bloc([['dc', ['T', 'T', 'T', 'D']], ['po', ['T', 'T', 'T']]]));
    expect(o.nbTours).toBe(3);
    expect(o.blocs[2].lignes.map((s) => s.type_serie)).toEqual(['travail', 'degressive', 'travail']);
    expect(o.blocs[2].lignes.map((s) => s.etiquette)).toEqual(['A3', 'A', 'B3']);
  });
  test('cas 3 — double dégressive : A2, ↓A, B2, ↓B', () => {
    const o = Tours.ordonner(bloc([['dc', ['T', 'T', 'D']], ['po', ['T', 'T', 'D']]]));
    expect(o.blocs[1].lignes.map((s) => s.type_serie)).toEqual(['travail', 'degressive', 'travail', 'degressive']);
  });
  test('cas 4 — commencé seul : A1 A2 faites d’affilée forment le bloc SEUL, les tours reprennent à 1 avec ce qui reste', () => {
    expect(ordre([['dc', ['T1', 'T2', 'T', 'T']], ['po', ['T', 'T', 'T']]]))
      .toEqual(['SEUL:A1 A2', 'T1:A3 B1', 'T2:A4 B2', 'T3:B3']);
  });
  test('cas 4 — le bloc SEUL grossit avec la série faite à la suite, dans l’ordre de validee_a', () => {
    // A2 fait avant A1 : l’ordre réel gagne.
    const o = Tours.ordonner(bloc([['dc', ['T3', 'T1', 'T2', 'T']], ['po', ['T', 'T']]]));
    expect(o.blocs[0].genre).toBe('seul');
    expect(o.blocs[0].lignes.map((s) => s.etiquette)).toEqual(['A2', 'A3', 'A1']);
  });
  test('cas 4 — une seule série faite d’abord n’est PAS un bloc SEUL (un tour normal, B1 vide à côté)', () => {
    expect(ordre([['dc', ['T1', 'T', 'T']], ['po', ['T', 'T']]])).toEqual(['T1:A1 B1', 'T2:A2 B2', 'T3:A3']);
  });
  test('cas 4 — A1 B1 A2 A3 : l’alternance a commencé, aucun bloc SEUL ; B2 reste vide à sa place dans le tour 2', () => {
    const o = Tours.ordonner(bloc([['dc', ['T1', 'T3', 'T4', 'T']], ['po', ['T2', 'T', 'T']]]));
    expect(o.blocs.map((b) => b.genre)).toEqual(['tour', 'tour', 'tour', 'tour']);
    expect(o.blocs[1].lignes.map((s) => s.etiquette)).toEqual(['A2', 'B2']);
    expect(o.blocs[2].lignes.map((s) => s.etiquette)).toEqual(['A3', 'B3']);
  });
  test('cas 4 — A1 B1 puis A2 B2 : rien ne bouge d’un pouce, une série cochée garde sa ligne', () => {
    const avant = ordre([['dc', ['T1', 'T', 'T']], ['po', ['T2', 'T', 'T']]]);
    const apres = ordre([['dc', ['T1', 'T3', 'T']], ['po', ['T2', 'T', 'T']]]);
    expect(apres).toEqual(avant);
  });
  test('cas 5 — court (2 × 2) : même dessin, deux tours, aucun mode spécial', () => {
    expect(ordre([['dc', ['T', 'T']], ['po', ['T', 'T']]])).toEqual(['T1:A1 B1', 'T2:A2 B2']);
  });
  test('cas 6 — un exercice sauté : ses séries restent vides à leur place, rien ne s’efface', () => {
    const o = Tours.ordonner(bloc([['dc', ['T1', 'T2', 'T3', 'T4']], ['po', ['T', 'T', 'T']]]));
    // A1 A2 en tête => SEUL ; A3 A4 reprennent avec B1 B2 B3
    expect(o.blocs.map((b) => b.genre)).toEqual(['seul', 'tour', 'tour', 'tour']);
    const toutes = o.blocs.reduce((n, b) => n + b.lignes.length, 0);
    expect(toutes).toBe(7);
  });
  test('cas 6 — « + Série » prend la première place libre de son exercice : B4 rejoint A4, la phrase « seul » disparaît', () => {
    const o = Tours.ordonner(bloc([['dc', ['T', 'T', 'T', 'T']], ['po', ['T', 'T', 'T', 'T']]]));
    expect(o.blocs[3].lignes.map((s) => s.etiquette)).toEqual(['A4', 'B4']);
    expect(o.blocs[3].phrase).toBeNull();
  });
  test('cas 7 — une correction ne change pas validee_a : la ligne ne bouge pas', () => {
    const a = ordre([['dc', ['T1', 'T', 'T']], ['po', ['T', 'T', 'T']]]);
    const corrige = bloc([['dc', ['T1', 'T', 'T']], ['po', ['T', 'T', 'T']]]);
    corrige.exercices[0].series[0].reps = 9;
    expect(Tours.ordonner(corrige).blocs.map((b) => lire(b))).toEqual(a.map((l) => l.split(':')[1]));
  });
  test('cas 8 — triset : trois exercices par tour, la dégressive de C dans son tour, la phrase du dernier tour', () => {
    const o = Tours.ordonner(bloc([['dc', ['T', 'T', 'T']], ['po', ['T', 'T', 'T']], ['ec', ['T', 'T', 'T', 'D']]]));
    expect(o.blocs[2].lignes.map((s) => s.etiquette)).toEqual(['A3', 'B3', 'C3', 'C']);
    const i = Tours.ordonner(bloc([['dc', ['T', 'T', 'T']], ['po', ['T', 'T', 'T']], ['ec', ['T', 'T']]]));
    expect(i.blocs[2].phrase).toBe('Développé Couché et Pull-over sans Écarté Machine : Écarté Machine a 2 séries.');
    expect(Tours.FORMES).toEqual(['rond', 'carre', 'triangle']);
    expect([0, 1, 2].map(Tours.formeDe)).toEqual(['rond', 'carre', 'triangle']);
  });
  test('l’ordre ne lit que des séries qui existent : rien n’est créé, rien n’est perdu', () => {
    const b = bloc([['dc', ['C', 'T1', 'T2', 'D', 'T']], ['po', ['C', 'C', 'T', 'T']]]);
    const o = Tours.ordonner(b);
    const toutes = b.exercices.reduce((n, e) => n + e.series.length, 0);
    expect(o.blocs.reduce((n, x) => n + x.lignes.length, 0)).toBe(toutes);
    expect(o.blocs[0].genre).toBe('chauffe');
    expect(o.blocs[0].lignes.map((s) => s.etiquette)).toEqual(['A', 'B', 'B']);
  });
});
