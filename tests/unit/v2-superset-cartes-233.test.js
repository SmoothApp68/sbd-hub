//
// v2 — 233 : LE SUPERSET À LA HEVY (une carte par exercice, validation dans n'importe quel ordre).
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
require('../../v2/js/tours.js');   // 261 : le superset s'affiche par tours
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


// ══ 233 → 261 — LA SÉANCE EN COURS : DES TOURS, LA VALIDATION DANS N'IMPORTE QUEL ORDRE ═════════════
describe('261 — le superset en séance : un bloc par tour (la carte par exercice de 233 est remplacée)', () => {
  test('deux exercices : des TOURS (rail « TOUR n »), A puis B dans chacun, reliés par la barre et l’étiquette « Superset »', () => {
    const c = rendre(seanceDe([['dc', 3, 1], ['ec', 3, 1]]));
    const bloc = c.querySelector('.bloc-seance');
    expect(bloc.classList.contains('en-tours')).toBe(true);
    expect(bloc.querySelector('.superset-t').textContent).toMatch(/^Superset/);
    expect(bloc.querySelectorAll('.carte-ss')).toHaveLength(0);
    const tours = Array.from(bloc.querySelectorAll('.tour'));
    expect(tours.map((t) => t.querySelector('.rail').textContent)).toEqual(['TOUR 1', 'TOUR 2', 'TOUR 3']);
    expect(tours.map((t) => Array.from(t.querySelectorAll('.no-serie')).map((n) => n.textContent)))
      .toEqual([['A1', 'B1'], ['A2', 'B2'], ['A3', 'B3']]);
    // une légende par exercice, le nom écrit en entier ; sur chaque ligne le nom court et la forme de son exercice.
    expect(Array.from(bloc.querySelectorAll('.legende-exo .nom-exo')).map((n) => n.textContent))
      .toEqual(['Développé Couché (Barre)', 'Écarté Poulie']);
    expect(Array.from(tours[0].querySelectorAll('.nom-ligne')).map((n) => n.textContent)).toEqual(['Développé Couché', 'Écarté Poulie']);
    expect(Array.from(tours[0].querySelectorAll('.nom-ligne .forme')).map((f) => f.className)).toEqual(['forme forme-rond', 'forme forme-carre']);
  });

  test('un « + Série · nom » par exercice, et un seul en-tête de colonnes pour les tours', () => {
    const c = rendre(seanceDe([['dc', 2, 1], ['ec', 2, 1]]));
    const bloc = c.querySelector('.bloc-seance');
    expect(bloc.querySelectorAll('.ajout-serie button')).toHaveLength(2);
    expect(bloc.querySelectorAll('.cols-seance')).toHaveLength(1);
  });

  test('la validation se fait dans n’importe quel ordre : B avant A, le tour se compte quand même, la ligne reste à sa place', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = valider(s, 1, 0);                       // B1 d'abord
    expect(Seance.tourAtteint(s, 1)).toBe(0);
    s = valider(s, 0, 0);                       // puis A1 : le tour 1 est fait
    expect(Seance.tourAtteint(s, 1)).toBe(1);
    s = valider(s, 0, 1);                       // A2 sans B2 : le tour 2 n'est pas complet
    expect(Seance.tourAtteint(s, 1)).toBe(1);
    const c = rendre(s);
    // 261 — une ligne est verte quand SA série est faite : A1, B1, A2 ; B2 reste vide, à sa place (tour 2).
    expect(allumees(c, 0)).toEqual([true, true, true, false]);
    const tour2 = c.querySelectorAll('.tour')[1];
    expect(Array.from(tour2.querySelectorAll('.no-serie')).map((n) => n.textContent)).toEqual(['A2', 'B2']);
  });

  test('l’éditeur de routine garde l’enchaînement (option entrelacer), la séance non', () => {
    const s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    expect(Modele.blocsDeSeance(s, CATALOGUE)[0].series.map((x) => x.etiquette)).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(Modele.blocsDeSeance(s, CATALOGUE, { entrelacer: true })[0].series.map((x) => x.etiquette))
      .toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  test('même une fois la chronologie posée, le MODÈLE de la séance en cours ne s’entrelace pas (l’écran range par tours, THTours)', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = valider(s, 0, 0); s = valider(s, 1, 0);
    expect(Modele.blocsDeSeance(s, CATALOGUE)[0].chronologie).toBe(true);
    expect(Modele.blocsDeSeance(s, CATALOGUE)[0].series.map((x) => x.etiquette)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  test('le mode programme (l’éditeur) ne dessine PAS de tours', () => {
    const cible = document.createElement('div');
    const s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    Rendu().rendreBlocsSeance(cible, s, {
      blocs: Modele.blocsDeSeance(s, CATALOGUE, { entrelacer: true }), programme: true,
      tourAtteint: () => 0, exercice: (slug) => INDEX[slug], precedent: () => null, fantome: () => ({}),
      surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {}, surAjoutSerie: () => {}, surSupprimerSerie: () => {}
    });
    expect(cible.querySelectorAll('.tour')).toHaveLength(0);
    expect(cible.querySelectorAll('.en-tours')).toHaveLength(0);
  });
});
