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

  // ══ LES QUATRE MESURES ═══════════════════════════════════════════════════
  //
  // `exercises.mesure` définit QUATRE façons d'enregistrer une série, et toute
  // la grille de saisie avait été dessinée pour la première. Mesuré en base :
  //
  //   charge_reps     173 exos   22 056 séries de travail
  //   reps             45 exos    2 300   — pompes, tractions, dips
  //   temps            12 exos    1 275   — planche, gainage
  //   distance_temps    7 exos      501   — rando, course, natation, tapis
  //
  // 4 076 séries — 15 % de l'historique — ne s'enregistrent pas en charge ×
  // reps. Une planche à « 0 kg × 45 » est absurde, et c'est ce que la grille
  // unique produisait.
  //
  // Les données sont propres : chaque mesure ne remplit que ses colonnes, sans
  // une exception sur 28 103 séries. Rien à nettoyer, seulement à afficher.

  // ══ LA DURÉE SE SAISIT PAR DÉCALAGE, COMME UN PAVÉ DE CHRONOMÉTRAGE ══════
  //
  // Le chantier 24 avait tranché « l'unité suit la mesure » : secondes pour un
  // gainage, minutes pour une sortie. Vérifié sur device, c'était encore une
  // règle à apprendre, et elle ne couvrait pas l'écart réel entre exercices —
  // mesuré sur les séries : L-Sit 5 à 10 s, planche 10 s à 2 min, escaliers
  // 30 s à 8 min, pilates 15 min à 1 h, escalade 1 h 30 à 2 h, randonnée
  // jusqu'à 6 h 35. Un facteur MILLE entre les deux bouts.
  //
  // Les chiffres entrent PAR LA DROITE et poussent les autres vers la gauche :
  //
  //   `5` `0`           -> 00:50
  //   `1` `3` `0` `0`   -> 13:00
  //   `2` `0` `0` `0` `0` -> 02:00:00
  //
  // Aucune règle à deviner, aucune conversion, aucun choix d'unité : le même
  // geste vaut pour dix secondes et pour six heures. Et il n'y a plus deux
  // unités pour une seule colonne — `duree_min` a disparu avec son facteur 60.
  //
  // `saisie` dit au rendu quel champ construire ; `facteur` ne sépare plus que
  // les kilomètres des mètres.
  var CHAMPS_MESURE = {
    charge_kg:   { cle: 'charge_kg',  entete: 'KG',       unite: 'kg',  facteur: 1,    saisie: 'nombre' },
    reps:        { cle: 'reps',       entete: 'REPS',     unite: null,  facteur: 1,    saisie: 'nombre' },
    duree:       { cle: 'duree_s',    entete: 'DURÉE',    unite: null,  facteur: 1,    saisie: 'chrono' },
    // La DISTANCE ne change pas : une seule base de dix, une seule unité utile.
    // Taper `8,76` en kilomètres est aussi rapide que `8760` en mètres et plus
    // lisible. Le décalage n'apporte rien là où il n'y a ni trois groupes ni
    // base de soixante.
    distance_km: { cle: 'distance_m', entete: 'DISTANCE', unite: 'km',  facteur: 1000, saisie: 'nombre' }
  };

  // ── Le pavé de chronométrage, en fonctions pures ────────────────────────
  //
  // ⚠️ LE TAMPON DE CHIFFRES EST UN ÉTAT, et il ne peut pas se déduire de la
  // valeur. `6·3·5·0·0` passe par « 6350 » (63 min 50 s = 3 830 s) ; la forme
  // canonique de 3 830 s est « 10350 » (1 h 03 min 50), et repartir de celle-là
  // au chiffre suivant donnerait 1:03:50 au lieu de 6:35:00. Le tampon vit donc
  // dans le champ tant qu'on tape, et se recompose depuis la valeur au rendu
  // suivant — sans perte, puisque la valeur, elle, est exacte à la seconde.
  var MAX_DUREE_S = 9 * 3600 + 59 * 60 + 59;   // 9:59:59 — 35 999 s, LA borne
  var MAX_CHIFFRES_DUREE = 5;                  // sa conséquence, pas une règle

  function deux(n) { return (n < 10 ? '0' : '') + n; }

  function sansZerosDeTete(s) { return String(s).replace(/^0+(?=\d)/, ''); }

  // Un chiffre de plus, par la droite. UNE SEULE borne, et c'est la VALEUR :
  // au-delà de **9:59:59**, le chiffre n'entre pas.
  //
  // ⚠️ Elle existe parce que le pavé ne doit JAMAIS produire une durée qu'il ne
  // sait pas reprendre. Les groupes bruts acceptent 99 minutes et 99 secondes :
  // « 99999 » vaudrait 10 h 40 min 39 s, dont la forme canonique est
  // « 104039 » — SIX chiffres. En rouvrant la série, le champ afficherait la
  // bonne heure et refuserait ensuite tout nouveau chiffre. Un pavé qui écrit
  // ce qu'il ne peut plus relire est un piège, et il ne se voit qu'à la
  // réédition, sur device, jamais en CI.
  //
  // Un compteur de chiffres serait REDONDANT, et le banc de mutation l'a
  // prouvé : au-dessus de cinq chiffres, le premier groupe vaut au moins dix
  // heures, donc la borne de valeur a déjà refusé. Le remplacer par 99 ne
  // faisait tomber aucun test — un garde-fou qu'aucune mutation ne tue est un
  // garde-fou mort (leçon de `palier.js`). `MAX_CHIFFRES_DUREE` reste comme ce
  // qu'il est vraiment : la CONSÉQUENCE de la borne, que les tests vérifient.
  //
  // Aucun groupe n'est tronqué au passage : le chiffre de trop n'entre pas,
  // rien n'est silencieusement perdu.
  function poserChiffreDuree(chiffres, chiffre) {
    var courant = String(chiffres === null || chiffres === undefined ? '' : chiffres);
    var c = String(chiffre).replace(/\D/g, '');
    if (c.length !== 1) return courant;
    var suite = sansZerosDeTete(courant + c);
    return dureeDeChiffres(suite) > MAX_DUREE_S ? courant : suite;
  }

  // Effacer retire le dernier chiffre, par la droite — geste inverse exact.
  function retirerChiffreDuree(chiffres) {
    return String(chiffres === null || chiffres === undefined ? '' : chiffres).slice(0, -1);
  }

  // Les groupes se lisent DEUX PAR DEUX depuis la droite, et aucun n'est
  // tronqué : « 6350 » vaut 63 minutes 50 secondes, ce qui est une durée, pas
  // une erreur. La valeur est donc toujours exactement ce que les chiffres
  // disent — et c'est `formatChrono` qui la rend sous forme d'horloge, où les
  // minutes et les secondes sont par construction sous 60.
  function dureeDeChiffres(chiffres) {
    var s = String(chiffres === null || chiffres === undefined ? '' : chiffres).replace(/\D/g, '');
    if (!s) return null;
    var ss = Number(s.slice(-2) || 0);
    var mm = Number(s.slice(-4, -2) || 0);
    var hh = Number(s.slice(0, -4) || 0);
    return hh * 3600 + mm * 60 + ss;
  }

  // L'inverse : la forme canonique d'une durée déjà enregistrée, pour que le
  // champ reparte de ce qu'il affiche.
  function chiffresDeDuree(secondes) {
    if (secondes === null || secondes === undefined || secondes === '') return '';
    var n = Number(secondes);
    if (!isFinite(n)) return '';
    n = Math.max(0, Math.round(n));
    var hh = Math.floor(n / 3600), mm = Math.floor((n % 3600) / 60), ss = n % 60;
    return sansZerosDeTete((hh ? String(hh) + deux(mm) : String(mm)) + deux(ss));
  }

  // « 00:50 » · « 13:00 » · « 02:00:00 ». Les heures ne s'affichent QUE si
  // elles existent : cinq caractères inutiles sur un gainage de dix secondes,
  // c'est cinq de trop.
  function formatChrono(secondes) {
    if (secondes === null || secondes === undefined || secondes === '') return '';
    var n = Number(secondes);
    if (!isFinite(n)) return '';
    n = Math.max(0, Math.round(n));
    var hh = Math.floor(n / 3600), mm = Math.floor((n % 3600) / 60), ss = n % 60;
    return (hh ? deux(hh) + ':' : '') + deux(mm) + ':' + deux(ss);
  }

  // Le libellé est rappelé sous le nom de l'exercice : sans lui, une ligne à
  // deux colonnes au milieu de lignes à trois désoriente.
  //
  // `effort` : la colonne n'existe QUE là où il y a des répétitions. Sur
  // `temps` et `distance_temps`, aucune colonne, aucune question, rien en base.
  // C'est une décision, pas un oubli — un RPE sur un gainage produisait deux
  // notations dans la même colonne, sur deux lignes voisines (`−1` sur un
  // développé, `9` sur une planche). On ne demande pas une donnée qu'on ne
  // sait pas formuler correctement.
  var GABARITS = {
    charge_reps:    { mesure: 'charge_reps',    champs: ['charge_kg', 'reps'],
                      effort: true,  libelle: 'CHARGE × REPS' },
    reps:           { mesure: 'reps',           champs: ['reps'],
                      effort: true,  libelle: 'REPS SEULES' },
    temps:          { mesure: 'temps',          champs: ['duree'],
                      effort: false, libelle: 'DURÉE' },
    distance_temps: { mesure: 'distance_temps', champs: ['duree', 'distance_km'],
                      effort: false, libelle: 'DISTANCE ET DURÉE' }
  };

  var MESURES = Object.keys(GABARITS);

  // Une mesure inconnue — catalogue pas encore synchronisé, exercice ajouté
  // côté serveur — ne doit ni planter ni rendre une grille vide. On retombe sur
  // `charge_reps`, de loin la plus courante, et on TAIT le libellé : affirmer
  // « CHARGE × REPS » sur un exercice qu'on ne connaît pas serait mentir avec
  // aplomb. `inconnue` le dit à la vue.
  function gabaritDe(exo) {
    var m = exo && exo.mesure;
    var g = Object.prototype.hasOwnProperty.call(GABARITS, m) ? GABARITS[m] : null;
    if (g) return g;
    return { mesure: 'charge_reps', champs: GABARITS.charge_reps.champs,
             effort: true, libelle: null, inconnue: true };
  }

  function champDeMesure(nom) {
    return Object.prototype.hasOwnProperty.call(CHAMPS_MESURE, nom)
      ? CHAMPS_MESURE[nom] : null;
  }

  // La colonne « précédent » : 62 px. `formatMesure` y déborderait — on donne
  // la grandeur qui porte l'information, et elle seule.
  //   charge_reps → « 122,5×5 » · reps → « 12 » · temps → « 45 s »
  //   distance_temps → « 6 h 35 » (la distance ne tient pas, la durée gagne)
  function formatPrecedent(serie, mesure) {
    if (!serie) return '—';
    if (mesure === 'reps') {
      return serie.reps === null || serie.reps === undefined ? '—' : String(serie.reps);
    }
    // ⚠️ EN HORLOGE, comme le champ juste à côté. `formatDuree` dirait « 45 s »
    // à trois millimètres d'un champ qui dit « 00:45 » : deux écritures du même
    // chiffre sur la même ligne, et c'est la famille de défauts que l'audit v1
    // a cataloguée. La grille de saisie est une horloge ; le journal — cartes,
    // détail, résumés — reste en prose et garde `formatDuree`. Les deux ne se
    // rencontrent jamais.
    if (mesure === 'temps' || mesure === 'distance_temps') {
      return formatChrono(serie.duree_s) || '—';
    }
    if (serie.charge_kg === null || serie.charge_kg === undefined) return '—';
    return nombre(serie.charge_kg) +
      (serie.reps === null || serie.reps === undefined ? '' : '\u00d7' + serie.reps);
  }

  // ⚠️ `Number(null)` vaut ZÉRO, et `isFinite(0)` vaut vrai.
  //
  // Sans cette garde, une série dont le champ est vide remontait « 0 » comme
  // s'il avait été mesuré — la « planche à 0 » que ce chantier supprime,
  // réintroduite par la porte de derrière. Le test l'a attrapée avant l'écran.
  function valeurNumerique(s, champ) {
    var v = s && s[champ];
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // Le maximum d'un champ sur un lot de séries, rendu en texte. `null` si
  // aucune série ne le porte — on n'affiche pas un zéro faute de mieux.
  function texteMax(series, champ, format) {
    var max = null;
    (series || []).forEach(function (s) {
      var v = valeurNumerique(s, champ);
      if (v === null) return;
      if (max === null || v > max) max = v;
    });
    return max === null ? null : format(max);
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

  // ── L'aperçu d'une carte de séance (ECRAN-SAISIE §7 bis.5) ──────────────
  //
  // Les TROIS PREMIERS exercices dans l'ordre de la séance, puis « et N autres ».
  // Trois, parce que les séances font 8,1 exercices en moyenne et que tout
  // afficher rendrait la semaine illisible. Les trois PREMIERS, parce que
  // l'ordre porte l'intention : le mouvement principal vient en premier.
  //
  // ⚠️ Le PALIER manque, et ce n'est pas un oubli. Le §7 bis.5 veut « palier ×
  // meilleures reps au palier ». Le palier au sens du §7 du moteur exige les
  // exclusions des §4.1 (chauffe probable), §5 (montée) et §6 — c'est-à-dire le
  // moteur de progression, hors périmètre ici. La règle de majorité du §7.2
  // prise seule ne reconnaît un palier que sur 63,9 % des séance-exercices,
  // contre 93-98 % avec les exclusions : un tiers des cartes serait muet et
  // certaines afficheraient un chiffre que le moteur contredira ensuite. Deux
  // voix pour le même chiffre : la famille de défauts que l'audit v1 a
  // cataloguée. La colonne de droite attend le moteur.
  var APERCU_MAX = 3;

  // « et 1 autre exercice », « et 3 autres exercices ». Les DEUX mots
  // s'accordent — le second était resté au pluriel.
  function libelleAutres(n) {
    var k = Number(n) || 0;
    if (k <= 0) return '';
    return 'et ' + k + (k > 1 ? ' autres exercices' : ' autre exercice');
  }

  // La colonne de droite porte la MEILLEURE SÉRIE (§7 bis.5), pas le palier.
  //
  // Corrigé au chantier 18 après vérification sur device : le palier est la
  // charge tenue sur la majorité des séries — la grandeur du MOTEUR, elle décide
  // de la suite. Ce n'est pas ce qu'on lit dans un journal. Sur le hack squat du
  // 24/08 (`122,6×10 ×3 + 127,6×10`), le palier vaut 122,6 et c'est juste, mais
  // ce qu'on a fait de mieux ce jour-là, c'est 127,6 × 10.
  //
  // Les deux grandeurs cohabitent et ne se fusionnent pas.
  //
  // `etats` est la table de THPalier.etatsExercices, calculée une fois sur tout
  // le cache. Un exercice absent de la table reste « indéterminé » : aucune
  // hypothèse, jamais une valeur par défaut.
  function apercuExercices(series, exercices, palier, etats) {
    var index = indexerExercices(exercices || []);
    var vus = {}, ordre = [];
    trierParRang(series || []).forEach(function (s) {
      if (!s || !s.exercise_slug || vus[s.exercise_slug]) return;
      vus[s.exercise_slug] = true;
      ordre.push({ slug: s.exercise_slug, nom: nommer(index, s.exercise_slug) });
    });

    var tete = ordre.slice(0, APERCU_MAX);
    if (palier) {
      var parExo = {};
      palier.decouperParExercice(series || []).forEach(function (se) { parExo[se.slug] = se.series; });
      tete.forEach(function (e) {
        var r = palier.analyser(parExo[e.slug] || [], (etats || {})[e.slug]);
        // Une meilleure série absente ne s'invente pas : la ligne n'affiche
        // alors que le nom.
        e.charge = r.meilleure ? r.meilleure.charge : null;
        e.reps = r.meilleure ? r.meilleure.reps : null;
      });
    }

    // ⚠️ LES TROIS AUTRES MESURES N'ONT PAS DE PALIER, ET C'EST CORRECT.
    //
    // `palier.analyser` écarte toute série sans charge NI reps : sur `reps`,
    // `temps` et `distance_temps` il rend une absence propre — `palier: null`,
    // `meilleure: null`, `erreur: 'aucune-serie-de-travail'`. Pas un zéro, pas
    // un plantage. Le journal restait donc muet là où il y avait quelque chose
    // à dire : « 12 » pour des tractions, « 50 s » pour une planche.
    //
    // On ne demande pas au moteur ce qu'il ne sait pas : on lit la meilleure
    // série DIRECTEMENT, dans la grandeur de la mesure. Aucune formule, aucune
    // comparaison — le maximum de ce qui a été fait.
    tete.forEach(function (e) {
      var g = gabaritDe(index[e.slug]);
      if (g.mesure === 'charge_reps') return;
      var siennes = (series || []).filter(function (s) {
        return s && s.exercise_slug === e.slug && estTravail(s);
      });
      if (!siennes.length) return;
      if (g.mesure === 'reps') {
        // Pas de clé du tout quand il n'y a rien à dire : « rien » et « zéro »
        // ne doivent pas se ressembler, même en interne.
        var t = texteMax(siennes, 'reps', String);
        if (t !== null) e.valeur = t;
        return;
      }
      var longue = null, plusLongue = null;
      siennes.forEach(function (s) {
        var d = valeurNumerique(s, 'duree_s');
        if (d === null) return;
        if (longue === null || d > plusLongue) { longue = s; plusLongue = d; }
      });
      if (longue === null) return;
      e.valeur = formatDuree(longue.duree_s);
      if (g.mesure === 'distance_temps' && longue.distance_m) {
        e.complement = '\u00b7 ' + formatDistance(longue.distance_m);
      }
    });

    return {
      tete: tete,
      // Jamais « et 0 autres exercices » : une séance de trois exercices ou
      // moins est montrée en entier, il n'y a rien à annoncer.
      autres: Math.max(0, ordre.length - APERCU_MAX)
    };
  }

  function resumerSeance(seance, series, exercices, palier, etats) {
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

    // Une séance dont AUCUNE série n'est en cache n'est pas une séance vide :
    // elle est incomplète. Vérifié en base — toutes les séances ont leurs
    // séries, randonnées et natations comprises (charge `aucune`, mesure
    // `distance_temps`). L'afficher « 0 exercice · 0 série » la ferait passer
    // pour un fait légitime alors que c'est un manque, et le manque se dit.
    var incomplet = listeSeries.length === 0;

    return {
      id: seance.id,
      titre: seance.titre || 'Séance',
      incomplet: incomplet,
      debut: seance.debut,
      salle: seance.salle_norme || seance.salle || '',
      nbExercices: Object.keys(slugs).length,
      nbSeriesTravail: nbTravail,
      // Une sortie ne se résume pas en séries : elle se résume en durée et
      // distance. Elle reste visible, simplement plus discrète.
      // Une séance incomplète n'est jamais classée en sortie : `sortie` part de
      // `listeSeries.length > 0`, donc sans série il vaut déjà faux.
      estSortie: sortie,
      // Une sortie n'a pas d'aperçu d'exercices : elle se dit en durée et en
      // distance. On ne construit donc rien qu'on n'affichera pas.
      apercu: sortie ? null : apercuExercices(listeSeries, exercices, palier, etats),
      dureeTotale: dureeTotale || null,
      distanceTotale: distanceTotale || null
    };
  }

  var api = {
    LETTRES: LETTRES,
    TYPES_CONNUS: TYPES_CONNUS,
    MESURES: MESURES,
    GABARITS: GABARITS,
    CHAMPS_MESURE: CHAMPS_MESURE,
    gabaritDe: gabaritDe,
    champDeMesure: champDeMesure,
    MAX_CHIFFRES_DUREE: MAX_CHIFFRES_DUREE,
    MAX_DUREE_S: MAX_DUREE_S,
    poserChiffreDuree: poserChiffreDuree,
    retirerChiffreDuree: retirerChiffreDuree,
    dureeDeChiffres: dureeDeChiffres,
    chiffresDeDuree: chiffresDeDuree,
    formatChrono: formatChrono,
    formatPrecedent: formatPrecedent,
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
    nommer: nommer,
    construireBlocs: construireBlocs,
    resumerSeance: resumerSeance,
    apercuExercices: apercuExercices,
    libelleAutres: libelleAutres
  };

  // Pas de module ES6 (contrainte du dépôt) : namespace global côté navigateur,
  // module.exports côté Jest.
  racine.THModele = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
