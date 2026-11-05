//
// 245 — l'unité des haltères sous le champ de charge : « kg, les deux haltères » (une ligne), seulement aux haltères.
// Environnement jsdom.

require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');

const CAT = [
  { slug: 'curl_halteres', nom: 'Curl (Haltère)', equipement: 'haltere', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['biceps'] },
  { slug: 'curl_barre', nom: 'Curl (Barre)', equipement: 'barre', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['biceps'] }
];
const rendre = (slug) => {
  const s = { exercices: [{ exercise_slug: slug, series: [{ id: 's1', type_serie: 'travail', charge_kg: 20, reps: 10 }] }] };
  const cible = document.createElement('div');
  window.THRendu.rendreBlocsSeance(cible, s, {
    blocs: Modele.blocsDeSeance(s, CAT), exercice: (sl) => CAT.filter((e) => e.slug === sl)[0],
    precedent: () => null, fantome: () => ({}), tourAtteint: () => 0,
    surValider: () => {}, surEffort: () => {}, surChamp: () => {}, surNumero: () => {}, surNote: () => {}, surRepos: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {}
  });
  return cible;
};

test('un exercice aux haltères porte la ligne d’aide sous ses en-têtes', () => {
  const l = rendre('curl_halteres').querySelectorAll('.aide-unite');
  expect(l.length).toBe(1);
  expect(l[0].textContent).toBe('kg, les deux haltères');
  expect(l[0].previousElementSibling.classList.contains('cols-seance')).toBe(true);
});
test('une barre : aucune ligne d’aide', () => {
  expect(rendre('curl_barre').querySelectorAll('.aide-unite').length).toBe(0);
});
