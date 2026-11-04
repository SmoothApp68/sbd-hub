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


// ══ 233 — DES CARTES À LA SUITE, JAMAIS ENTRELACÉES ════════════════════════
describe('233 — le superset en séance : une carte par exercice', () => {
  test('deux cartes à la suite, reliées par la barre (classe) et l’étiquette « Superset »', () => {
    const c = rendre(seanceDe([['dc', 3, 1], ['ec', 3, 1]]));
    const bloc = c.querySelector('.bloc-seance');
    expect(bloc.classList.contains('en-cartes')).toBe(true);
    expect(bloc.querySelector('.superset-t').textContent).toMatch(/^Superset/);
    const cartes = Array.from(bloc.querySelectorAll('.carte-ss'));
    expect(cartes).toHaveLength(2);
    // chaque carte garde SA légende (consigne, repos) et SES séries : A puis B, jamais A1 B1 A2 B2.
    expect(cartes.map((k) => Array.from(k.querySelectorAll('.no-serie')).map((n) => n.textContent)))
      .toEqual([['A1', 'A2', 'A3'], ['B1', 'B2', 'B3']]);
    expect(cartes.every((k) => k.querySelectorAll('.legende-exo').length === 1)).toBe(true);
    expect(cartes.map((k) => k.querySelector('.nom-exo').textContent))
      .toEqual(['Développé Couché (Barre)', 'Écarté Poulie']);
  });

  test('un « + Série » par carte, et un en-tête de colonnes par carte', () => {
    const c = rendre(seanceDe([['dc', 2, 1], ['pl', 2, 1]]));
    const cartes = Array.from(c.querySelectorAll('.carte-ss'));
    expect(cartes.map((k) => k.querySelectorAll('.ajout-serie button').length)).toEqual([1, 1]);
    expect(cartes.map((k) => k.querySelectorAll('.cols-seance').length)).toEqual([1, 1]);
  });

  test('la validation se fait dans n’importe quel ordre : B avant A, le tour se compte quand même', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = valider(s, 1, 0);                       // B1 d'abord
    expect(Seance.tourAtteint(s, 1)).toBe(0);
    s = valider(s, 0, 0);                       // puis A1 : le tour 1 est fait
    expect(Seance.tourAtteint(s, 1)).toBe(1);
    s = valider(s, 0, 1);                       // A2 sans B2 : le tour 2 n'est pas complet
    expect(Seance.tourAtteint(s, 1)).toBe(1);
    const c = rendre(s);
    // l'éclairage porte sur le TOUR : A1 et B1 allumées, A2 seule non.
    expect(allumees(c, 0)).toEqual([true, false, true, false]);
  });

  test('l’éditeur de routine garde l’enchaînement (option entrelacer), la séance non', () => {
    const s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    expect(Modele.blocsDeSeance(s, CATALOGUE)[0].series.map((x) => x.etiquette)).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(Modele.blocsDeSeance(s, CATALOGUE, { entrelacer: true })[0].series.map((x) => x.etiquette))
      .toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  test('même une fois la chronologie posée, la séance en cours ne s’entrelace pas', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = valider(s, 0, 0); s = valider(s, 1, 0);
    expect(Modele.blocsDeSeance(s, CATALOGUE)[0].chronologie).toBe(true);
    expect(Modele.blocsDeSeance(s, CATALOGUE)[0].series.map((x) => x.etiquette)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });
});
