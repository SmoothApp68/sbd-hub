//
// v2 — 233 : LE CHRONO DE TENUE (planche, gainage, isométrie).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
//   UN SUPERSET À SÉRIES INÉGALES, VALIDÉ DANS LE DÉSORDRE.
//
// Sur un superset parfaitement régulier validé de haut en bas — le seul cas
// qu'on teste spontanément —, « l'éclairage porte sur le tour » et
// « l'éclairage porte sur la ligne » donnent exactement le même écran : chaque
// validation complète son tour dans la foulée. Il faut deux choses pour les
// séparer : un exercice plus court que les autres (le tour 3 ne doit pas
// attendre un `C3` qui n'existe pas) et des validations dans le désordre
// (valider A2 seul ne doit rien allumer, B2 ensuite doit tout allumer).
//
// Le rendu tourne sous jsdom : `rendu.js` n'exporte rien en CommonJS (il pose
// `window.THRendu`), et c'est cette surface-là qu'on lit.

// PR 6 de la consolidation — la série de travail et son compte vivent dans
// `modele.js` et `semaine.js`, lus à l'appel par les autres modules.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const { progTravail } = require('./aide-routine-programmee.js');

const Rendu = () => window.THRendu;

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'ec', nom: 'Écarté Poulie', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'pd', nom: 'Pompes Diamant', mesure: 'reps', charge: 'aucune',
    muscles_primaires: ['triceps'], muscles_secondaires: [] },
  { slug: 'pl', nom: 'Planche', mesure: 'temps', charge: 'aucune',
    muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
  { slug: 'cu', nom: 'Curl Haltères', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['biceps'], muscles_secondaires: [] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);

let graine = 0;
const uuid = () => 'set-' + (++graine);

// Une routine : `[slug, nbSéries, groupe]`. `groupe` à null = exercice seul.
function seanceDe(lignes) {
  return Seance.creer({
    id: 'S', userId: 'u', idSerie: uuid,
    routine: {
      id: 'r',
      exercices: lignes.map(([slug, series, groupe], i) => ({
        id: 're' + i, exercise_slug: slug, series: progTravail(series),
        reps_visees: null, repos_cible_s: null,
        groupe_superset: groupe === undefined ? null : groupe
      }))
    }
  });
}

const blocs = (s) => Modele.blocsDeSeance(s, CATALOGUE);

// Valide la j-ième série du i-ième exercice, une minute après la précédente.
let horloge = Date.parse('2026-09-13T10:00:00Z');
function valider(s, i, j) {
  horloge += 60000;
  s = Seance.valider(s, i, j, new Date(horloge));
  return Seance.avancerTours(s, Modele.toursFaitsParGroupe(blocs(s)));
}
function devalider(s, i, j) {
  s = Seance.devalider(s, i, j);
  return Seance.avancerTours(s, Modele.toursFaitsParGroupe(blocs(s)));
}

function rendre(seance) {
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, seance, {
    blocs: blocs(seance),
    tourAtteint: (g) => Seance.tourAtteint(seance, g),
    exercice: (slug) => INDEX[slug],
    precedent: () => null,
    fantome: (i, j) => Seance.fantome(seance, i, j, null),
    surChamp: () => {}, surValider: () => {}, surNumero: () => {},
    surEffort: () => {}, surAjoutSerie: () => {}, surSupprimerSerie: () => {}
  });
  return cible;
}

// Ce que l'écran montre, bloc par bloc : les étiquettes dans l'ordre AFFICHÉ.
const etiquettes = (cible, iBloc) =>
  Array.from(cible.querySelectorAll('.bloc-seance')[iBloc].querySelectorAll('.no-serie'))
    .map((n) => n.textContent);

const allumees = (cible, iBloc) =>
  Array.from(cible.querySelectorAll('.bloc-seance')[iBloc].querySelectorAll('.serie'))
    .map((r) => r.classList.contains('faite'));



function rendreTenue(info, appels) {
  const s = seanceDe([['pl', 2, null]]);
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, s, {
    blocs: Modele.blocsDeSeance(s, CATALOGUE),
    tourAtteint: () => 0, exercice: (slug) => INDEX[slug], precedent: () => null,
    fantome: () => ({}),
    surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {},
    tenueDe: (i, j) => (j === 0 ? info : null),
    surTenueDemarrer: (i, j) => appels.push(['demarrer', i, j]),
    surTenueStop: () => appels.push(['stop']),
    surTenueAnnuler: () => appels.push(['annuler'])
  });
  return cible;
}

describe('233 — le chrono de tenue : ce que l’écran montre', () => {
  test('au repos : « ▶ Chrono » et la durée visée, sur la première série seulement ; le clic démarre CETTE série', () => {
    const appels = [];
    const c = rendreTenue({ actif: false, secondes: 0, cible: 45 }, appels);
    expect(c.querySelectorAll('.tenue')).toHaveLength(1);
    expect(c.querySelector('.tenue-vise').textContent).toBe('visée\u00a00:45');
    c.querySelector('.tenue-go').click();
    expect(appels).toEqual([['demarrer', 0, 0]]);
    expect(c.querySelector('.tenue-t')).toBeNull();
  });
  test('en cours : le compteur, Stop et Annuler ; le tic met à jour le compteur sans redessiner', () => {
    const appels = [];
    const c = rendreTenue({ actif: true, secondes: 32, cible: 45 }, appels);
    expect(c.querySelector('.tenue-t').textContent).toBe('0:32');
    expect(c.querySelector('.tenue-go')).toBeNull();
    const noeud = c.querySelector('.tenue-t');
    expect(Rendu().majTenue(c, 46, 45)).toBe(true);
    expect(c.querySelector('.tenue-t')).toBe(noeud);                       // le même nœud : rien n'a été redessiné
    expect(noeud.textContent).toBe('0:46');
    expect(noeud.classList.contains('atteinte')).toBe(true);               // il CONTINUE au-delà de la cible
    c.querySelector('.tenue-stop').click();
    c.querySelector('.tenue-annuler').click();
    expect(appels).toEqual([['stop'], ['annuler']]);
  });
  test('sans durée visée : pas de « visée », le chrono compte quand même', () => {
    const c = rendreTenue({ actif: false, secondes: 0, cible: null }, []);
    expect(c.querySelector('.tenue-vise')).toBeNull();
    expect(c.querySelector('.tenue-go')).not.toBeNull();
  });
  test('hors séance (éditeur de routine) ou sans `tenueDe` : aucun chrono', () => {
    const s = seanceDe([['pl', 1, null]]);
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, { blocs: Modele.blocsDeSeance(s, CATALOGUE), programme: true, exercice: (slug) => INDEX[slug],
      precedent: () => null, tenueDe: () => ({ actif: false, secondes: 0, cible: 30 }) });
    expect(cible.querySelector('.tenue')).toBeNull();
  });
});
