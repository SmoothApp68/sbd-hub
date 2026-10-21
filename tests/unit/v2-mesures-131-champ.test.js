//
// Prompt 131 (audit 130 n°8) — le champ de la distance refuse le chiffre de trop, comme le
// pavé de la durée : au-delà de 400 km, le champ revient au dernier texte accepté, et rien
// n'est écrit. Environnement jsdom.

require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAT = [{ slug: 'course', nom: 'Course à Pied', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [] }];

test('taper 4001 km : le dernier chiffre n’entre pas, la série garde 400', () => {
  const ecrits = [];
  const s = { exercices: [{ exercise_slug: 'course', series: [{ id: 's1', type_serie: 'travail',
    charge_kg: null, reps: null, duree_s: null, distance_m: null }] }] };
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, s, {
    blocs: Modele.blocsDeSeance(s, CAT), exercice: () => CAT[0],
    precedent: () => null, fantome: () => ({}), tourAtteint: () => 0,
    surValider: () => {}, surEffort: () => {},
    surChamp: (i, j, champ, v) => ecrits.push([champ, v]),
    surNumero: () => {}, surNote: () => {}, surRepos: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {}
  });
  const input = cible.querySelector('[data-champ="distance_km"] input');
  ['4', '40', '400', '4001'].forEach((v) => { input.value = v; input.dispatchEvent(new Event('input')); });
  expect(input.value).toBe('400');
  expect(ecrits.map((e) => e[1])).toEqual(['4', '40', '400']);
  input.value = '400,1'; input.dispatchEvent(new Event('input'));
  expect(input.value).toBe('400');
  input.value = '39,5'; input.dispatchEvent(new Event('input'));
  expect(ecrits[ecrits.length - 1]).toEqual(['distance_km', '39,5']);
});
