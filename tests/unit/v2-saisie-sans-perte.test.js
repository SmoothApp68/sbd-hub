/** @jest-environment node */
//
// 115 — RIEN NE SE PERD À LA SAISIE (audit du 16/10/2026, domaine 02-saisie ; décisions d'Aurélien D10).
// Les règles pures que l'écran lit : les séries remplies mais pas validées, que « Terminer » ne garde pas (E4) ;
// et la série qu'« Annuler » remet entière à sa place après un glissement (E2). Le branchement dans l'app réelle
// (feuilles, toast, file d'envoi) est éprouvé au banc d'écran, section 115.

const Seance = require('../../v2/js/seance.js');

const serie = (o) => Object.assign({
  id: null, type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null,
  rpe: null, ressenti: null, note: null, validee_a: null, repos_s: null, reps_visees: null,
  charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null
}, o);
// L'occurrence est posée une fois, à la première construction (`avecOccurrences`), comme dans une vraie séance.
const seanceDe = (exos) => ({
  id: 'S', statut: 'en_cours',
  exercices: exos.map((series, i) => ({ exercise_slug: 'exo-' + i, occurrence: 'o-' + i, series: series }))
});

describe('E4 — les séries remplies, pas validées', () => {
  test('une valeur tapée sur une ligne non validée compte, à sa position', () => {
    const s = seanceDe([
      [serie({ id: 'a', charge_kg: 100, reps: 5, validee_a: '2026-10-16T10:00:00Z' }),
        serie({ id: 'b', charge_kg: 100, reps: 8 })],
      [serie({ id: 'c' }), serie({ id: 'd', reps: 12 })]
    ]);
    expect(Seance.rempliesNonValidees(s)).toEqual([{ iExo: 0, iSerie: 1 }, { iExo: 1, iSerie: 1 }]);
  });

  test('une validée, une importée (partEnBase) et une ligne vide ne comptent pas', () => {
    const s = seanceDe([[
      serie({ id: 'a', charge_kg: 100, reps: 5, validee_a: '2026-10-16T10:00:00Z', source: 'app' }),
      serie({ id: 'b', charge_kg: 80, reps: 10, source: 'hevy' }),
      serie({ id: 'c' })
    ]]);
    expect(Seance.rempliesNonValidees(s)).toEqual([]);
  });

  test('une intention de la routine (reps visées, charge, durée, distance cibles) n’est pas une valeur tapée', () => {
    const s = seanceDe([[serie({ id: 'a', reps_visees: 8, charge_cible_kg: 60, duree_cible_s: 600, distance_cible_m: 2000 })]]);
    expect(Seance.rempliesNonValidees(s)).toEqual([]);
  });

  test('une seule case tapée suffit (la charge sans les reps), une case effacée (« ») non', () => {
    const s = seanceDe([[serie({ id: 'a', charge_kg: 100 }), serie({ id: 'b', reps: '' }), serie({ id: 'c', charge_kg: 0 })]]);
    expect(Seance.rempliesNonValidees(s)).toEqual([{ iExo: 0, iSerie: 0 }, { iExo: 0, iSerie: 2 }]);
  });

  test('une durée ou une distance tapées comptent (planche, tapis)', () => {
    const s = seanceDe([[serie({ id: 'a', duree_s: 45 })], [serie({ id: 'b', distance_m: 3200 })]]);
    expect(Seance.rempliesNonValidees(s).length).toBe(2);
  });

  test('une série dévalidée garde ses valeurs : elle compte', () => {
    const v = seanceDe([[serie({ id: 'a', charge_kg: 100, reps: 5, validee_a: '2026-10-16T10:00:00Z', source: 'app' })]]);
    const d = Seance.devalider(v, 0, 0);
    expect(Seance.rempliesNonValidees(d)).toEqual([{ iExo: 0, iSerie: 0 }]);
  });
});

describe('E2 — « Annuler » remet la série entière, à sa place', () => {
  const faite = (id, kg, reps, o) => serie(Object.assign({ id: id, charge_kg: kg, reps: reps,
    validee_a: '2026-10-16T10:0' + reps + ':00Z', source: 'app', rpe: 8 }, o));
  const s0 = seanceDe([
    [faite('a', 100, 5), faite('b', 102.5, 4, { type_serie: 'echauffement' }), faite('c', 105, 3)],
    [faite('d', 40, 12)]
  ]);

  test('retirer puis remettre rend la même séance : mêmes séries, même ordre, mêmes rangs de sortie', () => {
    const sans = Seance.retirerSerie(s0, 0, 1);
    expect(sans.exercices[0].series.map((x) => x.id)).toEqual(['a', 'c']);
    const remise = Seance.remettreSerie(sans, 0, 1, s0.exercices[0].series[1]);
    expect(remise.exercices).toEqual(s0.exercices);
    expect(Seance.lignes(remise)).toEqual(Seance.lignes(s0));
  });

  test('c’est le même objet qui revient (charge, reps, type, effort, validation, source)', () => {
    const b = s0.exercices[0].series[1];
    const remise = Seance.remettreSerie(Seance.retirerSerie(s0, 0, 1), 0, 1, b);
    expect(remise.exercices[0].series[1]).toBe(b);
  });

  test('en tête et en fin d’exercice aussi ; les autres exercices ne bougent pas', () => {
    const tete = Seance.remettreSerie(Seance.retirerSerie(s0, 0, 0), 0, 0, s0.exercices[0].series[0]);
    expect(tete.exercices).toEqual(s0.exercices);
    const fin = Seance.remettreSerie(Seance.retirerSerie(s0, 1, 0), 1, 0, s0.exercices[1].series[0]);
    expect(fin.exercices).toEqual(s0.exercices);
  });

  test('pur : la séance reçue n’est pas modifiée', () => {
    const sans = Seance.retirerSerie(s0, 0, 2);
    const copie = JSON.stringify(sans);
    Seance.remettreSerie(sans, 0, 2, s0.exercices[0].series[2]);
    expect(JSON.stringify(sans)).toBe(copie);
  });
});
