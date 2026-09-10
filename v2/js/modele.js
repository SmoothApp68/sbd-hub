// v2/js/modele.js — transformation des lignes brutes en structure d'affichage.
//
// Module PUR : aucune dépendance au DOM, au réseau, à Supabase. C'est la seule
// partie du socle testable sans navigateur, et donc la seule qui porte des tests.
//
// Vocabulaire (fidèle aux maquettes de v2/maquettes/) :
//   bloc     = une carte de l'écran. Soit un exercice seul, soit un superset.
//   exercice = une ligne d'en-tête dans un bloc, repérée par une lettre A, B, C…
//   série    = une ligne de la grille.
//
// Invariante : l'ordre d'affichage vient de `rang`, JAMAIS de `validee_a`.
// `validee_a` est NULL sur les 28 103 séries importées — rien ici ne le lit.

(function (racine) {
  'use strict';

  var LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Les quatre valeurs réellement présentes en base (28 103 lignes) :
  // travail 26 132 · echauffement 1 458 · degressive 387 · echec 126.
  var LIBELLES_TYPE = {
    travail: 'Travail',
    echauffement: 'Échauffement',
    degressive: 'Dégressive',
    echec: 'Échec'
  };

  function estTravail(serie) {
    return serie && serie.type_serie === 'travail';
  }

  // Deux séries appartiennent au même bloc si elles se suivent par `rang` ET
  // partagent le même groupe de superset — ou, hors superset, le même exercice.
  // Le découpage se fait sur des suites CONTIGUËS : un exercice repris plus loin
  // dans la séance ouvre un nouveau bloc, ce qui est le comportement voulu
  // (l'ordre d'affichage prime sur l'identité de l'exercice).
  function memeBloc(a, b) {
    if (!a || !b) return false;
    var ga = a.groupe_superset, gb = b.groupe_superset;
    if (ga !== null && ga !== undefined) return ga === gb;
    if (gb !== null && gb !== undefined) return false;
    return a.exercise_slug === b.exercise_slug;
  }

  // Tri stable par `rang` croissant. `rang` est NOT NULL en base ; une ligne
  // sans rang exploitable est renvoyée en fin de liste plutôt que d'écraser
  // l'ordre des autres.
  function trierParRang(series) {
    return (series || []).slice().sort(function (x, y) {
      var rx = typeof x.rang === 'number' ? x.rang : Infinity;
      var ry = typeof y.rang === 'number' ? y.rang : Infinity;
      return rx - ry;
    });
  }

  // slug -> nom lisible. Le nom d'un exercice vient de `exercises.nom` via
  // `sets.exercise_slug` ; à défaut on retombe sur le slug, jamais sur du vide.
  function indexerExercices(exercices) {
    var index = {};
    (exercices || []).forEach(function (e) {
      if (e && e.slug) index[e.slug] = e.nom || e.slug;
    });
    return index;
  }

  function nommer(index, slug) {
    return (index && index[slug]) || slug || '(exercice inconnu)';
  }

  /**
   * construireBlocs(series, exercices) -> [bloc]
   *
   * bloc = {
   *   superset: bool,
   *   exercices: [{ slug, nom, lettre, series: [série] }],
   *   series: [série],          // toutes les séries du bloc, dans l'ordre de rang
   *   nbTravail: int,
   *   resume: string
   * }
   * série = { …ligne brute, estTravail, libelleType, etiquette }
   */
  function construireBlocs(series, exercices) {
    var index = indexerExercices(exercices);
    var ordonnees = trierParRang(series);
    var blocs = [];
    var courant = null;
    var precedente = null;

    ordonnees.forEach(function (brute) {
      if (!courant || !memeBloc(precedente, brute)) {
        courant = { superset: false, exercices: [], series: [], nbTravail: 0, resume: '' };
        blocs.push(courant);
      }

      var slug = brute.exercise_slug;
      var exo = null;
      for (var i = 0; i < courant.exercices.length; i++) {
        if (courant.exercices[i].slug === slug) { exo = courant.exercices[i]; break; }
      }
      if (!exo) {
        exo = {
          slug: slug,
          nom: nommer(index, slug),
          lettre: LETTRES[courant.exercices.length] || '?',
          series: []
        };
        courant.exercices.push(exo);
      }

      var travail = estTravail(brute);
      var serie = Object.assign({}, brute, {
        estTravail: travail,
        libelleType: LIBELLES_TYPE[brute.type_serie] || brute.type_serie,
        // A1, A2… pour le travail ; les séries qui ne sont pas du travail
        // portent leur libellé, comme dans les maquettes (« chauffe »).
        etiquette: travail
          ? exo.lettre + (exo.series.filter(estTravail).length + 1)
          : (LIBELLES_TYPE[brute.type_serie] || brute.type_serie)
      });

      exo.series.push(serie);
      courant.series.push(serie);
      if (travail) courant.nbTravail++;
      precedente = brute;
    });

    blocs.forEach(function (b) {
      b.superset = b.exercices.length > 1;
      b.resume = (b.superset ? 'Superset · ' : '') +
        b.nbTravail + ' série' + (b.nbTravail > 1 ? 's' : '') + ' de travail';
    });

    return blocs;
  }

  // Résumé d'une séance pour la liste : titre, date, comptages.
  function resumerSeance(seance, series) {
    var listeSeries = series || [];
    var slugs = {};
    var nbTravail = 0;
    listeSeries.forEach(function (s) {
      slugs[s.exercise_slug] = true;
      if (estTravail(s)) nbTravail++;
    });
    var nbExos = Object.keys(slugs).length;
    return {
      id: seance.id,
      titre: seance.titre || 'Séance',
      debut: seance.debut,
      salle: seance.salle_norme || seance.salle || '',
      nbExercices: nbExos,
      nbSeriesTravail: nbTravail
    };
  }

  var api = {
    LETTRES: LETTRES,
    LIBELLES_TYPE: LIBELLES_TYPE,
    estTravail: estTravail,
    memeBloc: memeBloc,
    trierParRang: trierParRang,
    indexerExercices: indexerExercices,
    construireBlocs: construireBlocs,
    resumerSeance: resumerSeance
  };

  // Pas de module ES6 (contrainte du dépôt) : namespace global côté navigateur,
  // module.exports côté Jest.
  racine.THModele = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
