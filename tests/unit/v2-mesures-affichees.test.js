/** @jest-environment node */
//
// 119 (audit du 16/10/2026) — UN FIL : une durée s'affiche en durée, une distance en distance, des reps en reps.
// Aurélien, 16/10 : « Pour les exercices calculés en temps, il ne faut pas mettre les reps. »
//
// La table des mesures (`THModele.affichageDeMesure`, `formatMesure`), l'accord unique de « rep » (F10), la prose de
// la médaille (E9 : « 1,3 km », « 12 min », jamais « 1300 m » ni « 12:00 »).

global.self = global;
const Modele = require('../../v2/js/modele.js');

describe('119 — F10 : l’accord de « rep », une fois', () => {
  test('le singulier sous 2, le pluriel à partir de 2, les milliers groupés', () => {
    expect(Modele.repsTexte(0)).toBe('0 rep');
    expect(Modele.repsTexte(1)).toBe('1 rep');
    expect(Modele.repsTexte(2)).toBe('2 reps');
    expect(Modele.repsTexte(1234)).toBe('1 234 reps');
    expect(Modele.uniteReps(1)).toBe('rep');
    expect(Modele.uniteReps(60)).toBe('reps');
  });
  test('la médaille et la série faite le lisent : « 1 rep », jamais « 1 reps »', () => {
    expect(Modele.formatMesure({ reps: 1 })).toBe('1 rep');
    const p = Modele.phraseDeRecord([{ type: 'reps_a_charge', charge: 0, valeur: 1, ancien: null }], 'dips', '2026-10-16');
    expect(p[0]).toBe('Record au poids du corps : 1 rep.');
  });
});

describe('119 — une fonction d’affichage par mesure', () => {
  test('les six mesures ont leur en-tête ; aucune n’écrit « Charge » au-dessus d’une durée', () => {
    const e = (m) => Modele.affichageDeMesure(m).entete;
    expect(e('charge_reps')).toBe('Charge');
    expect(e('reps')).toBe('Reps');
    expect(e('temps')).toBe('Durée');
    expect(e('distance_temps')).toBe('Durée · distance');
    expect(e('charge_distance')).toBe('Charge · distance');
    expect(e('charge_temps')).toBe('Charge · durée');
    expect(Modele.affichageDeMesure('inconnue')).toBeNull();
  });
  test('la valeur suit les colonnes que la série porte', () => {
    expect(Modele.formatMesure({ charge_kg: 52, reps: 12 })).toBe('52 kg × 12');
    expect(Modele.formatMesure({ charge_kg: -22.5, reps: 8 })).toBe('Aide 22,5 kg × 8');
    expect(Modele.formatMesure({ reps: 15 })).toBe('15 reps');
    expect(Modele.formatMesure({ duree_s: 90 })).toBe('1 min 30');
    expect(Modele.formatMesure({ duree_s: 1200, distance_m: 3200 })).toBe('20 min · 3,2 km');
    expect(Modele.formatMesure({ charge_kg: 40, distance_m: 50 })).toBe('40 kg · 50 m');
    expect(Modele.formatMesure({ charge_kg: 10, duree_s: 60 })).toBe('10 kg · 1 min');
    expect(Modele.formatMesure({ charge_kg: 52 })).toBe('52 kg');
    expect(Modele.formatMesure({})).toBe('—');
  });
  test('ce qu’un bilan classe « en reps » : charge × reps et reps seules, rien d’autre', () => {
    expect(Modele.seMesureEnReps({ mesure: 'charge_reps' })).toBe(true);
    expect(Modele.seMesureEnReps({ mesure: 'reps' })).toBe(true);
    expect(Modele.seMesureEnReps({ mesure: 'temps' })).toBe(false);
    expect(Modele.seMesureEnReps({ mesure: 'distance_temps' })).toBe(false);
    expect(Modele.seMesureEnReps(null)).toBe(false);
  });
});

describe('119 — E9 : la médaille écrit comme le journal', () => {
  test('« 1,3 km » et « 12 min », jamais « 1300 m » ni « 12:00 »', () => {
    const p = Modele.phraseDeRecord([
      { type: 'duree_s', valeur: 720, ancien: 600, ancien_le: '2026-09-01' },
      { type: 'distance_m', valeur: 3200, ancien: 1170, ancien_le: '2026-09-01' }
    ], 'tapis', '2026-09-08');
    expect(p[0]).toBe('Plus longue durée : 12 min. Plus longue distance : 3,2 km.');
    expect(p[1]).toBe('Avant : 10 min, le 1er sept.');
  });
  test('une distance seule : « Avant : 850 m » sous 1 000 m', () => {
    const p = Modele.phraseDeRecord([{ type: 'distance_m', valeur: 1300, ancien: 850, ancien_le: '2026-09-01' }],
      'tapis', '2026-09-08');
    expect(p).toEqual(['Plus longue distance : 1,3 km.', 'Avant : 850 m, le 1er sept.']);
  });
});

describe('119 — F9 : « exercice fait », une définition par usage', () => {
  require('../../v2/js/semaine.js');
  const Se = global.THSemaine;
  const CAT = [
    { slug: 'tapis', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [] },
    { slug: 'squat', mesure: 'charge_reps', muscles_primaires: ['quadriceps'] },
    { slug: 'planche', mesure: 'temps', charge: 'aucune', muscles_primaires: ['abdominaux'] }
  ];
  const S = [
    { exercise_slug: 'tapis', type_serie: 'travail', duree_s: 600 },
    { exercise_slug: 'squat', type_serie: 'echauffement', charge_kg: 60, reps: 5 },
    { exercise_slug: 'planche', type_serie: 'travail', duree_s: 60 },
    { exercise_slug: 'squat', type_serie: 'travail', charge_kg: 100, reps: 5 }
  ];
  test('le journal compte le tapis ; le récap, non ; le bilan ne classe que les exercices en reps', () => {
    expect(Object.keys(Modele.exercicesFaits(S)).sort()).toEqual(['planche', 'squat', 'tapis']);
    expect(Se.exercicesDeMusculation(S, CAT)).toEqual(['planche', 'squat']);
    expect(CAT.filter(Modele.seMesureEnReps).map((x) => x.slug)).toEqual(['squat']);
  });
});
