//
// v2 — la carte de la semaine de mesure (`carteDeTest`, rendu.js) ne plante pas
// sur une série de mesure.
//
// Défaut : `M` y est une FONCTION locale (`var M = function () { return racine.THModele; }`)
// et la ligne « Mesuré : … , max lu … » appelait `M.kgTexte(...)` au lieu de `M().kgTexte(...)`.
// Dès que `t.mesure.vrai` est faux (mode « série de mesure », le défaut en objectif Forme
// depuis #779), le rendu levait « M.kgTexte is not a function ».
//
// ⚠️ CONFIGURATION DISCRIMINANTE : `mesure.vrai === false`. Avec un vrai max la branche
// `M.kgTexte` n'est jamais évaluée et le défaut ne se voit pas.
//
// Environnement jsdom (pas de docblock `node`).

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/rendu.js');
require('../../v2/js/tours.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const { progTravail } = require('./aide-routine-programmee.js');

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['pectoraux'], muscles_secondaires: [] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);

function rendre(test) {
  const seance = Seance.creer({
    id: 'S', userId: 'u', idSerie: (() => { let n = 0; return () => 'set-' + (++n); })(),
    routine: { id: 'r', exercices: [{ id: 're0', exercise_slug: 'dc', series: progTravail(3),
      reps_visees: null, repos_cible_s: null, groupe_superset: null }] }
  });
  const cible = document.createElement('div');
  window.THRendu.rendreBlocsSeance(cible, seance, {
    blocs: Modele.blocsDeSeance(seance, CATALOGUE),
    tourAtteint: () => 1,
    exercice: (slug) => INDEX[slug],
    precedent: () => null,
    fantome: (i, j) => Seance.fantome(seance, i, j, null),
    semaineDeTest: () => test,
    surChamp: () => {}, surValider: () => {}, surNumero: () => {},
    surEffort: () => {}, surAjoutSerie: () => {}, surSupprimerSerie: () => {}
  });
  return cible;
}

const TEST = (mesure) => ({ barre: true, testee: true, slug: 'dc', mode: 'serie', etat: 'fini',
  essais: [], montee: [], mesure, ajout: null, videsPosees: 0 });

describe('carteDeTest — la ligne « Mesuré »', () => {
  test('une série de mesure (mesure non vraie) : la carte se rend et dit le max lu', () => {
    const c = rendre(TEST({ charge: 100, reps: 5, valeur: 112.4, vrai: false }));
    const l = c.querySelector('.test-mesure');
    expect(l).not.toBeNull();
    expect(l.textContent).toMatch(/Mesuré : .*max lu .*112/);
  });
  test('un vrai max : pas de « max lu »', () => {
    const c = rendre(TEST({ charge: 120, reps: 1, valeur: 120, vrai: true }));
    expect(c.querySelector('.test-mesure').textContent).not.toMatch(/max lu/);
  });
});
