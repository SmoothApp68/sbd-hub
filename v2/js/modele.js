// v2/js/modele.js — transformation des lignes brutes en structure d'affichage.
//
// Module PUR : aucune dépendance au DOM, au réseau, à Supabase. C'est la seule
// partie du socle testable sans navigateur, et donc la seule qui porte des tests.
//
// Vocabulaire (ECRAN-SAISIE-V1 §2.1) :
//   bloc     = l'unité de l'écran. Un exercice normal est un bloc d'un seul,
//              un superset un bloc de 2 à 6. Même objet, même carte, même code.
//   exercice = une ligne de la légende du bloc, repérée par une lettre A, B, C…
//   série    = une ligne de la grille.
//
// Étiquetage (§2.3, §2.4) : la LETTRE identifie l'exercice dans le bloc, le
// CHIFFRE identifie le TOUR. Rien n'est stocké : tout se recalcule à l'affichage
// à partir de « cette série appartient à cet exercice, qui appartient à ce bloc,
// à cette position ».

(function (racine) {
  'use strict';

  var LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Les quatre valeurs réellement présentes en base (28 103 lignes) :
  // travail 26 132 · echauffement 1 458 · degressive 387 · echec 126.
  var TYPES_CONNUS = ['travail', 'echauffement', 'degressive', 'echec'];

  function estTravail(serie) {
    return !!serie && serie.type_serie === 'travail';
  }

  // ── Formatage des unités ────────────────────────────────────────────────
  // Le séparateur décimal est la virgule. Jamais d'unité brute à l'écran.

  function nombre(v, decimales) {
    if (v === null || v === undefined || v === '') return '';
    var n = Number(v);
    if (!isFinite(n)) return '';
    var f = Math.pow(10, decimales === undefined ? 2 : decimales);
    return String(Math.round(n * f) / f).replace('.', ',');
  }

  // 23715 -> « 6 h 35 » · 750 -> « 12 min 30 » · 60 -> « 1 min »
  function formatDuree(secondes) {
    if (secondes === null || secondes === undefined || secondes === '') return '';
    var s = Math.round(Number(secondes));
    if (!isFinite(s) || s < 0) return '';
    if (s < 60) return s + ' s';
    var minutes = Math.floor(s / 60);
    if (minutes < 60) {
      var reste = s % 60;
      return reste ? minutes + ' min ' + reste : minutes + ' min';
    }
    var heures = Math.floor(minutes / 60);
    var min = minutes % 60;
    return min ? heures + ' h ' + (min < 10 ? '0' + min : min) : heures + ' h';
  }

  // 22660 -> « 22,7 km » · 850 -> « 850 m » · 1000 -> « 1 km »
  function formatDistance(metres) {
    if (metres === null || metres === undefined || metres === '') return '';
    var m = Number(metres);
    if (!isFinite(m) || m < 0) return '';
    if (m < 1000) return nombre(m, 0) + ' m';
    return nombre(m / 1000, 1) + ' km';
  }

  // « 52 kg × 12 » · « 6 h 35 · 22,7 km » · « 12 reps »
  function formatMesure(serie) {
    if (!serie) return '';
    var bouts = [];
    var aCharge = serie.charge_kg !== null && serie.charge_kg !== undefined;
    var aReps = serie.reps !== null && serie.reps !== undefined;
    if (aCharge) bouts.push(nombre(serie.charge_kg) + ' kg');
    if (aReps) bouts.push(aCharge ? '× ' + serie.reps : serie.reps + ' reps');
    if (serie.duree_s) bouts.push(formatDuree(serie.duree_s));
    if (serie.distance_m) bouts.push(formatDistance(serie.distance_m));
    return bouts.length ? bouts.join(bouts.length > 1 && !aCharge ? ' · ' : ' ') : '—';
  }

  // ── Catalogue ───────────────────────────────────────────────────────────

  function indexerExercices(exercices) {
    var index = {};
    (exercices || []).forEach(function (e) {
      if (e && e.slug) index[e.slug] = e;
    });
    return index;
  }

  function nommer(index, slug) {
    var e = index && index[slug];
    return (e && e.nom) || slug || '(exercice inconnu)';
  }

  // Une « sortie » n'est pas une séance de musculation : l'exercice ne porte
  // aucune charge et se mesure en temps et/ou en distance. Établi par lecture
  // du catalogue : charge='aucune' + mesure ∈ {temps, distance_temps} couvre
  // Randonnée, Course à pieds, Cyclisme, Marche, Natation, Pilates, Escalade…
  function estExerciceSortie(exo) {
    return !!exo && exo.charge === 'aucune' &&
      (exo.mesure === 'temps' || exo.mesure === 'distance_temps');
  }

  // ── Découpage en blocs ──────────────────────────────────────────────────

  // Deux séries appartiennent au même bloc si elles se suivent par `rang` ET
  // partagent le même groupe de superset — ou, hors superset, le même exercice.
  function memeBloc(a, b) {
    if (!a || !b) return false;
    var ga = a.groupe_superset, gb = b.groupe_superset;
    if (ga !== null && ga !== undefined) return ga === gb;
    if (gb !== null && gb !== undefined) return false;
    return a.exercise_slug === b.exercise_slug;
  }

  // Tri stable par `rang` croissant. `rang` est NOT NULL en base ; une ligne
  // sans rang exploitable est renvoyée en fin de liste.
  function trierParRang(series) {
    return (series || []).slice().sort(function (x, y) {
      var rx = typeof x.rang === 'number' ? x.rang : Infinity;
      var ry = typeof y.rang === 'number' ? y.rang : Infinity;
      return rx - ry;
    });
  }

  // Découpe les séries d'UN exercice (ordre de rang) en paquets : un paquet sort
  // à un tour. Les deux familles de séries non-travail ne s'accrochent pas du
  // même côté, et c'est ce qui les place correctement dans un enchaînement :
  //   · l'échauffement PRÉPARE la série qui suit — il ouvre le paquet suivant,
  //     donc la chauffe de C se pose entre B1 et C1 (§2.5) ;
  //   · une dégressive ou un échec PROLONGE la série qui précède — on descend la
  //     charge sans repos — donc ils restent dans le paquet de cette série, et
  //     l'on obtient A1, A↓, B1 plutôt que A1, B1, A↓.
  function paqueter(seriesExo) {
    var paquets = [];
    var courant = [];
    (seriesExo || []).forEach(function (s) {
      if (!estTravail(s) && s.type_serie !== 'echauffement' && paquets.length) {
        paquets[paquets.length - 1].push(s);
        return;
      }
      courant.push(s);
      if (estTravail(s)) { paquets.push(courant); courant = []; }
    });
    if (courant.length) paquets.push(courant);   // queue sans série de travail
    return paquets;
  }

  /**
   * construireBlocs(series, exercices) -> [bloc]
   *
   * bloc = {
   *   superset: bool,                     // vrai seulement à partir de 2 exercices
   *   exercices: [{ slug, nom, lettre, series, nbTravail }],
   *   series: [série],                    // dans l'ordre d'AFFICHAGE
   *   nbTravail: int, nbTours: int, chronologie: bool, resume: string
   * }
   * série = { …ligne brute, estTravail, tour, etiquette }
   */
  function construireBlocs(series, exercices) {
    var index = indexerExercices(exercices);
    var blocs = [];
    var courant = null;
    var precedente = null;

    // 1. Découpage en blocs et en exercices, dans l'ordre de rang.
    trierParRang(series).forEach(function (brute) {
      if (!courant || !memeBloc(precedente, brute)) {
        courant = { superset: false, exercices: [], series: [], nbTravail: 0,
                    nbTours: 0, chronologie: false, resume: '' };
        blocs.push(courant);
      }
      var slug = brute.exercise_slug;
      var exo = null;
      for (var i = 0; i < courant.exercices.length; i++) {
        if (courant.exercices[i].slug === slug) { exo = courant.exercices[i]; break; }
      }
      if (!exo) {
        exo = { slug: slug, nom: nommer(index, slug), lettre: '', series: [], nbTravail: 0 };
        courant.exercices.push(exo);
      }
      exo.series.push(brute);
      precedente = brute;
    });

    // 2. Étiquetage et ordre d'affichage, bloc par bloc.
    blocs.forEach(function (bloc) {
      // §2.1 et §5.9 : un bloc d'un seul exercice n'est pas un superset — même
      // si `groupe_superset` est renseigné (anomalie des 13 blocs importés).
      bloc.superset = bloc.exercices.length > 1;

      bloc.exercices.forEach(function (exo, i) {
        exo.lettre = bloc.superset ? (LETTRES[i] || '?') : '';
        var tour = 0;
        exo.series = exo.series.map(function (brute) {
          var travail = estTravail(brute);
          if (travail) tour++;
          return Object.assign({}, brute, {
            estTravail: travail,
            // Le tour d'une série de travail est son rang parmi les séries de
            // travail de SON exercice. Une série non-travail n'a pas de tour.
            tour: travail ? tour : null,
            // §2.3 : lettre = exercice, chiffre = tour. Bloc simple → pas de
            // lettre. §2.5 : l'échauffement porte la lettre seule, jamais un
            // libellé — la distinction se fait par le style.
            etiquette: travail ? exo.lettre + tour : exo.lettre
          });
        });
        exo.nbTravail = tour;
        bloc.nbTravail += tour;
        if (tour > bloc.nbTours) bloc.nbTours = tour;
      });

      // §7.1/§7.3 : `validee_a` est NULL sur les 28 103 séries importées. Une
      // série importée n'a pas de tours — elle s'affiche dans l'ordre de `rang`
      // (Hevy a aplati les tours : mesuré, 1 031 blocs groupés par exercice
      // contre 53 entrelacés). Dès qu'une chronologie existe, les tours sont
      // réels et l'affichage s'entrelace (§2.3).
      bloc.chronologie = bloc.exercices.some(function (e) {
        return e.series.some(function (s) { return !!s.validee_a; });
      });

      if (bloc.superset && bloc.chronologie) {
        var paquets = bloc.exercices.map(function (e) { return paqueter(e.series); });
        var profondeur = paquets.reduce(function (m, p) { return Math.max(m, p.length); }, 0);
        for (var t = 0; t < profondeur; t++) {
          for (var e = 0; e < paquets.length; e++) {
            // Tour incomplet : l'exercice qui n'a pas de t-ième paquet ne
            // produit rien. Pas d'étiquette fantôme (§2.4).
            if (paquets[e][t]) bloc.series = bloc.series.concat(paquets[e][t]);
          }
        }
      } else {
        bloc.series = trierParRang(
          bloc.exercices.reduce(function (acc, e) { return acc.concat(e.series); }, []));
      }

      bloc.resume = (bloc.superset ? 'Superset · ' : '') +
        bloc.nbTravail + ' série' + (bloc.nbTravail > 1 ? 's' : '') + ' de travail';
    });

    return blocs;
  }

  // ── Résumé d'une séance pour la liste ───────────────────────────────────

  function resumerSeance(seance, series, exercices) {
    var index = indexerExercices(exercices);
    var listeSeries = series || [];
    var slugs = {};
    var nbTravail = 0, dureeTotale = 0, distanceTotale = 0;
    var sortie = listeSeries.length > 0;

    listeSeries.forEach(function (s) {
      slugs[s.exercise_slug] = true;
      if (estTravail(s)) nbTravail++;
      if (s.duree_s) dureeTotale += Number(s.duree_s) || 0;
      if (s.distance_m) distanceTotale += Number(s.distance_m) || 0;
      if (!estExerciceSortie(index[s.exercise_slug])) sortie = false;
    });

    return {
      id: seance.id,
      titre: seance.titre || 'Séance',
      debut: seance.debut,
      salle: seance.salle_norme || seance.salle || '',
      nbExercices: Object.keys(slugs).length,
      nbSeriesTravail: nbTravail,
      // Une sortie ne se résume pas en séries : elle se résume en durée et
      // distance. Elle reste visible, simplement plus discrète.
      estSortie: sortie,
      dureeTotale: dureeTotale || null,
      distanceTotale: distanceTotale || null
    };
  }

  var api = {
    LETTRES: LETTRES,
    TYPES_CONNUS: TYPES_CONNUS,
    estTravail: estTravail,
    nombre: nombre,
    formatDuree: formatDuree,
    formatDistance: formatDistance,
    formatMesure: formatMesure,
    estExerciceSortie: estExerciceSortie,
    memeBloc: memeBloc,
    trierParRang: trierParRang,
    paqueter: paqueter,
    indexerExercices: indexerExercices,
    construireBlocs: construireBlocs,
    resumerSeance: resumerSeance
  };

  // Pas de module ES6 (contrainte du dépôt) : namespace global côté navigateur,
  // module.exports côté Jest.
  racine.THModele = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
