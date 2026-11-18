//
// v2 — 233 : DÉPLACER UN EXERCICE (menu ⋯ Monter / Descendre, glissement par la poignée ou l'appui long sur le nom).
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



const ordre = (s) => s.exercices.map((e) => e.exercise_slug);
const groupes = (s) => s.exercices.map((e) => e.groupe_superset);

describe('233 — THSeance.deplacerExercice : l’exercice entier, par le chemin de la séance', () => {
  test('dans un superset, il change de place dans son groupe — le groupe reste', () => {
    const s = seanceDe([['dc', 2, 1], ['ec', 2, 1], ['pd', 2, null]]);
    const t = Seance.deplacerExercice(s, 0, 1, true);
    expect(ordre(t)).toEqual(['ec', 'dc', 'pd']);
    expect(groupes(t)[0]).not.toBeNull();
    expect(groupes(t)[0]).toBe(groupes(t)[1]);
    expect(groupes(t)[2]).toBeNull();
  });
  test('ses séries le suivent (aucune série n’est touchée)', () => {
    const s = seanceDe([['dc', 3, 1], ['ec', 2, 1]]);
    const t = Seance.deplacerExercice(s, 0, 1, true);
    expect(t.exercices.map((e) => e.series.length)).toEqual([2, 3]);
    expect(t.exercices[1].series.map((x) => x.id)).toEqual(s.exercices[0].series.map((x) => x.id));
  });
  test('un exercice seul passe avant un superset (le groupe reste entier)', () => {
    const s = seanceDe([['dc', 2, 1], ['ec', 2, 1], ['pd', 2, null]]);
    const t = Seance.deplacerExercice(s, 2, 0, false);
    expect(ordre(t)).toEqual(['pd', 'dc', 'ec']);
    expect(groupes(t)[1]).toBe(groupes(t)[2]);
  });
  test('sur lui-même, à sa place, ou hors bornes : la séance est INCHANGÉE', () => {
    const s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    expect(Seance.deplacerExercice(s, 0, 0, true)).toBe(s);
    expect(Seance.deplacerExercice(s, 0, 1, false)).toBe(s);
    expect(Seance.deplacerExercice(s, 5, 0, false)).toBe(s);
  });
});

function rendreSeanceSansGlisse(s) {
  const cible = document.createElement('div');
  document.body.appendChild(cible);
  Rendu().rendreBlocsSeance(cible, s, {
    blocs: blocs(s),
    tourAtteint: () => 0, exercice: (slug) => INDEX[slug], precedent: () => null,
    fantome: (i, j) => Seance.fantome(s, i, j, null),
    surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {}, surMenuExercice: () => {}, surMenuBloc: () => {}
  });
  return cible;
}

describe('18/11 — réordonner n’arrive jamais sans le vouloir : plus de glissement en séance', () => {
  test('aucune poignée ⠿ en séance, ni sur un exercice seul ni dans un superset', () => {
    expect(rendreSeanceSansGlisse(seanceDe([['dc', 2, null], ['ec', 2, null]])).querySelectorAll('.poignee-exo')).toHaveLength(0);
    expect(rendreSeanceSansGlisse(seanceDe([['dc', 2, 1], ['ec', 2, 1]])).querySelectorAll('.poignee-exo')).toHaveLength(0);
  });
  test('le glissement d’un exercice n’existe plus (ni code, ni style, ni appel)', () => {
    const lire = (f) => require('fs').readFileSync(require('path').join(__dirname, '../../v2', f), 'utf8');
    for (const f of ['js/rendu.js', 'js/app.js', 'styles.css']) {
      const t = lire(f);
      expect(t).not.toMatch(/poignee-exo|pris-exo|en-deplacement|surDeplacerExercice|deplacerExerciceVers|brancherDeplacementExercice/);
    }
  });
});

describe('233 — Monter / Descendre : seulement dans le menu ⋯ d’un exercice de SUPERSET (Réorganiser ne range que des blocs)', () => {
  const entrees = (n) => Array.from(n.querySelectorAll('button')).map((b) => [b.textContent, b.disabled || b.getAttribute('aria-disabled') === 'true']);
  test('la feuille d’un exercice de superset : Monter grisé en tête, Descendre actif', () => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleExercice(cible, { nom: 'Développé', surRemplacer: () => {}, surDegrouper: () => {}, surSupprimer: () => {},
      surMonter: null, surDescendre: () => {} });
    const e = entrees(cible);
    expect(e.find((x) => x[0] === 'Monter')[1]).toBe(true);
    expect(e.find((x) => x[0] === 'Descendre')[1]).toBe(false);
  });
  test('la feuille d’un bloc ne porte plus « Monter » ni « Descendre » : « Réorganiser… » est le seul chemin', () => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleBloc(cible, { superset: false, noms: 'x', surRemplacer: () => {}, surGrouper: () => {}, surAjouterApres: () => {},
      surSupprimer: () => {}, surMonter: () => {}, surDescendre: () => {}, surReorganiser: () => {} });
    const e = entrees(cible);
    expect(e.some((x) => x[0] === 'Monter' || x[0] === 'Descendre')).toBe(false);
    expect(e.some((x) => /^Réorganiser/.test(x[0]))).toBe(true);
  });

});
