/** @jest-environment node */
//
// 273 — « EN FAIRE UNE ROUTINE » depuis la séance d'un mutuel (social 3) : la fonction pure « lignes de `social_structure_seance` →
// structure ». Le chemin est celui de ma séance (`routineDepuisSeance`) ; ici, la porte : chauffes et reculs exclus, supersets gardés,
// tenues gardées, ordre par rang, JAMAIS une charge, liste vide → pas de routine.

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/moteur.js');
const Routines = require('../../v2/js/routines.js');

const CAT = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['ischios'] },
  { slug: 'curl_halteres', nom: 'Curl (Haltère)', equipement: 'haltere', mesure: 'charge_reps', muscles_primaires: ['biceps'], muscles_secondaires: [] },
  { slug: 'extension_triceps_poulie', nom: 'Extension triceps (Poulie)', equipement: 'poulie', mesure: 'charge_reps', muscles_primaires: ['triceps'], muscles_secondaires: [] },
  { slug: 'planche', nom: 'Planche', equipement: 'poids_du_corps', mesure: 'temps', muscles_primaires: ['abdominaux'], muscles_secondaires: [] }
];
const l = (slug, rang, type, reps, extra) => Object.assign({ exercise_slug: slug, rang: rang, type_serie: type, reps: reps, duree_s: null, groupe_superset: null, repos_s: null }, extra || {});
const faire = (lignes, extra) => Routines.structureDepuisLignesSociales(lignes, Object.assign({ titre: 'Haut du corps', auteur: 'Léa', exercices: CAT, routines: [], existants: [] }, extra || {}));

describe('structureDepuisLignesSociales', () => {
  test('les séries de travail seulement : chauffes et reculs exclus', () => {
    const s = faire([l('squat_barre', 1, 'echauffement', 10), l('squat_barre', 2, 'echauffement', 5), l('squat_barre', 3, 'travail', 5),
      l('squat_barre', 4, 'travail', 5), l('squat_barre', 5, 'recul', 8)]);
    expect(s.exercices).toHaveLength(1);
    expect(s.exercices[0].series.map((x) => x.type_serie)).toEqual(['travail', 'travail']);
    expect(s.exercices[0].series.map((x) => x.reps_visees)).toEqual([5, 5]);
  });
  test('un exercice qui n\'a que des chauffes disparaît', () => {
    const s = faire([l('curl_halteres', 1, 'echauffement', 12), l('squat_barre', 2, 'travail', 5)]);
    expect(s.exercices.map((x) => x.exercise_slug)).toEqual(['squat_barre']);
  });
  test('deux exercices en superset gardent leur groupe ; les autres n\'en ont pas', () => {
    const s = faire([l('squat_barre', 1, 'travail', 5), l('curl_halteres', 2, 'travail', 10, { groupe_superset: 1 }),
      l('extension_triceps_poulie', 3, 'travail', 12, { groupe_superset: 1 }), l('curl_halteres', 4, 'travail', 10, { groupe_superset: 1 }),
      l('extension_triceps_poulie', 5, 'travail', 12, { groupe_superset: 1 })]);
    const g = s.exercices.map((x) => x.groupe_superset);
    expect(s.exercices.map((x) => x.exercise_slug)).toEqual(['squat_barre', 'curl_halteres', 'extension_triceps_poulie']);
    expect(g[0]).toBeNull();
    expect(g[1]).not.toBeNull();
    expect(g[2]).toBe(g[1]);
  });
  test('aucune charge dans la sortie, même si on lui en passe', () => {
    const s = faire([l('squat_barre', 1, 'travail', 5, { charge_kg: 140, charge_cible_kg: 140, poids: 140 }), l('squat_barre', 2, 'travail', 5, { charge_kg: 142.5 })]);
    expect(JSON.stringify(s)).not.toMatch(/charge|kg|poids/i);
    expect(JSON.stringify(s)).not.toContain('140');
  });
  test('une tenue garde sa durée', () => {
    const s = faire([l('planche', 1, 'travail', null, { duree_s: 60 }), l('planche', 2, 'travail', null, { duree_s: 45 })]);
    expect(s.exercices[0].series.map((x) => x.duree_cible_s)).toEqual([60, 45]);
  });
  test('l\'ordre est celui du rang, pas celui des lignes reçues', () => {
    const s = faire([l('curl_halteres', 3, 'travail', 10), l('squat_barre', 1, 'travail', 5), l('squat_barre', 2, 'travail', 5)]);
    expect(s.exercices.map((x) => x.exercise_slug)).toEqual(['squat_barre', 'curl_halteres']);
  });
  test('liste vide, ou rien que des chauffes : pas de routine', () => {
    expect(faire([])).toBeNull();
    expect(faire(null)).toBeNull();
    expect(faire([l('squat_barre', 1, 'echauffement', 10), l('squat_barre', 2, 'recul', 8)])).toBeNull();
  });
  test('le nom : « <titre> (<prénom>) », sans prénom le titre seul', () => {
    expect(faire([l('squat_barre', 1, 'travail', 5)]).nom).toBe('Haut du corps (Léa)');
    expect(faire([l('squat_barre', 1, 'travail', 5)], { auteur: '' }).nom).toBe('Haut du corps');
    expect(faire([l('squat_barre', 1, 'travail', 5)], { existants: ['Haut du corps (Léa)'] }).nom).not.toBe('Haut du corps (Léa)');
  });
  test('la forme est celle de ma séance : repos par défaut, origine dite', () => {
    const s = faire([l('squat_barre', 1, 'travail', 5)]);
    expect(s.exercices[0]).toEqual(expect.objectContaining({ repos_cible_s: 180, repos_origine: 'par défaut' }));
  });
});
