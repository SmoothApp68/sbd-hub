// v2/js/moteur.js — du corpus lu à la zone de travail.
//
// Il applique MOTEUR-PROGRESSION-V2 §8.2 (le format) · §9.1.2 (l'habitude et
// les cinq zones) · §9.2 (le niveau validé) · §9.12 (ne jamais lire l'avenir).
//
// Ce module ne PRESCRIT encore rien : il range. Il dit dans quelle zone un
// exercice se travaille et à quel niveau son palier est tenu ; c'est le
// chantier suivant qui en tirera une consigne. Aucun appelant dans l'app à ce
// commit, et c'est voulu.
//
// Module PUR : aucune dépendance au DOM, au réseau, au cache, au catalogue.
// UNE seule dépendance, `THPalier`, pour `repsComptees` — la règle du §17.4
// (une série `max` compte une rep de moins) est écrite là-bas et ne se réécrit
// pas ici.
//
// ⚠️ TROIS TABLES VOISINES QU'IL NE FAUT JAMAIS CONFONDRE.
//
//   · le FORMAT (§8.2) range une séance PASSÉE pour savoir à quoi la comparer :
//     force, mixte, hypertrophie ;
//   · le RANGEMENT (§9.1.2) va d'une HABITUDE à une zone ;
//   · la ZONE (§9.1.2) porte le bas et le haut des reps qu'on PRESCRIRA.
//
// Les trois ont des bornes proches et différentes, et les confondre casse le
// moteur des deux façons décrites au §9.1.1 : une habitude de 13 range en
// « Séries longues », dont la zone est 15-20 — le rangement et la zone ne
// disent pas la même chose, et c'est normal.

(function (racine) {
  'use strict';

  // ⚠️ LUE TARDIVEMENT, ET SANS REPLI. `moteur.js` se charge après `palier.js`,
  // donc la lecture directe marcherait ; la lecture tardive est quand même la
  // bonne, pour la même raison qu'à `modele.js` : une dépendance manquante doit
  // casser BRUYAMMENT plutôt que rendre un verdict faux en silence. Un repli
  // « si THPalier manque, compte les reps brutes » ferait passer une série à
  // l'échec pour une série pleine, sans que rien ne le dise.
  function Palier() { return racine.THPalier; }

  // §9.1.2 — 8 séances avant de conclure. Mesuré (banc M12) : sur tout
  // l'historique, 7 des 23 exercices actifs d'Aurélien étaient mal rangés par
  // une fenêtre plus longue. La science pondère le récent (Williams 2017) et
  // les coachs changent de reps par cycles de 3 à 6 semaines.
  var FENETRE_HABITUDE = 8;

  // ── LES CINQ ZONES — UNE SEULE TABLE (§9.1.2) ────────────────────────────
  //
  // Clé, libellé, bas et haut vivent ICI et nulle part ailleurs : l'étiquette
  // de l'en-tête de bloc, le menu de correction et la consigne liront tous les
  // trois cette table. Deux tables de zones finiraient par se contredire, et
  // c'est la famille de défauts que l'audit v1 a cataloguée.
  //
  // Les CLÉS sont celles de la contrainte de `zones_exercice` (`v2_046`) : une
  // valeur qui n'y figure pas est refusée par Postgres, donc elle ne doit pas
  // exister ici non plus.
  //
  // ⚠️ LE BAS ET LE HAUT NE SONT PAS LES BORNES DU RANGEMENT. « Séries
  // longues » se prescrit de 15 à 20 mais se déclenche dès une habitude de 13 :
  // « 15-20 reste une zone, pas une cible nue » (§9.1.2) — avec un bas, le
  // moteur repart de là où l'on atterrit après un gros saut.
  var ZONES = [
    { cle: 'lourd',          libelle: 'Lourd',          bas: 3,  haut: 5 },
    { cle: 'mix',            libelle: 'Mix',            bas: 6,  haut: 8 },
    { cle: 'hypertrophie',   libelle: 'Hypertrophie',   bas: 8,  haut: 10 },
    { cle: 'volume',         libelle: 'Volume',         bas: 10, haut: 12 },
    { cle: 'series_longues', libelle: 'Séries longues', bas: 15, haut: 20 }
  ];

  // ── LE RANGEMENT : UNE HABITUDE, UNE ZONE (§9.1.2) ───────────────────────
  //
  // C'est la TABLE qui range, pas l'appartenance à l'intervalle de la zone.
  // Deux zones se chevauchent — 8 appartient à Mix (6-8) comme à Hypertrophie
  // (8-10) — et sans cette table, deux développeurs produiraient deux
  // rangements différents sur la même habitude. Une habitude de 8 range en
  // Hypertrophie ; l'utilisateur peut toujours choisir Mix (ECRAN-SAISIE §3.8).
  //
  // Sous 3 reps, AUCUNE zone : ce sont les maximaux, et le §9.1.2 interdit d'y
  // demander une rep de plus — la variabilité journalière de ±18 % dépasse
  // l'écart entre une rep et deux.
  var RANGEMENT = [
    { jusqua: 2,        cle: null },
    { jusqua: 5,        cle: 'lourd' },
    { jusqua: 7,        cle: 'mix' },
    { jusqua: 9,        cle: 'hypertrophie' },
    { jusqua: 12,       cle: 'volume' },
    { jusqua: Infinity, cle: 'series_longues' }
  ];

  // ── Lecture ──────────────────────────────────────────────────────────────

  function nombre(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // Un instant COMPARABLE. `sessions.debut` est une chaîne ISO 8601, et deux
  // chaînes ISO se comparent lexicographiquement dans l'ordre chronologique —
  // c'est la propriété qui rend le tri et la coupure exacts sans fuseau. Un
  // objet `Date` passe par `toISOString` plutôt que par `String()`, qui rendrait
  // « Sun Sep 20 2026 » et trierait par jour de la semaine.
  function instant(v) {
    if (v === null || v === undefined || v === '') return null;
    return v.toISOString ? v.toISOString() : String(v);
  }

  // La médiane, sur une liste de nombres déjà nettoyée. Longueur paire : la
  // moyenne des deux du milieu — et c'est ELLE qui produit les demi-entiers que
  // le §8.2 et le §9.1.2 arrondissent AU-DESSUS.
  function mediane(valeurs) {
    var l = (valeurs || []).slice().sort(function (a, b) { return a - b; });
    if (!l.length) return null;
    var m = l.length >> 1;
    return (l.length % 2) ? l[m] : (l[m - 1] + l[m]) / 2;
  }

  function repsDe(series) {
    var sortie = [];
    (series || []).forEach(function (s) {
      var r = nombre(s && s.reps);
      if (r !== null) sortie.push(r);
    });
    return sortie;
  }

  // ── §9.1.2 / §3.8 — de l'habitude à la zone ──────────────────────────────

  function zoneParCle(cle) {
    for (var i = 0; i < ZONES.length; i++) {
      if (ZONES[i].cle === cle) return ZONES[i];
    }
    return null;
  }

  // Rend la ZONE (objet complet), jamais sa seule clé : l'appelant a besoin du
  // bas et du haut pour écrire une consigne, et aller les rechercher ailleurs
  // rouvrirait la porte à une seconde table.
  function zoneDe(habitude) {
    var h = nombre(habitude);
    if (h === null) return null;
    for (var i = 0; i < RANGEMENT.length; i++) {
      if (h <= RANGEMENT[i].jusqua) return zoneParCle(RANGEMENT[i].cle);
    }
    return null;
  }

  // §9.1.1 — LA PRIORITÉ, telle qu'elle existe dans le code au 19/09/2026 :
  // la correction de l'utilisateur, sinon l'habitude observée. Le plan d'un
  // programme (rang 1) et le profil de travail déclaré (rang 4) n'existent
  // pas encore ; quand ils arriveront, ils s'inséreront ici et nulle part
  // ailleurs.
  //
  // `correction` est une clé de `zones_exercice`, ou rien. Une clé VIDE veut
  // dire « retour à la déduction » — c'est le sens que lui donne la migration
  // `v2_046` —, donc elle retombe sur l'habitude comme une absence.
  function zoneRetenue(correction, habitude) {
    // `zoneParCle` ne lit que les cinq clés de la table : une valeur inventée,
    // ou `constructor` venu d'une ligne de base, n'y trouve rien et retombe sur
    // la déduction plutôt que de rendre un objet qui n'est pas une zone.
    var choisie = zoneParCle(correction);
    return choisie || zoneDe(habitude);
  }

  // ── §9.2 — LE NIVEAU VALIDÉ ──────────────────────────────────────────────
  //
  // « Le plus haut nombre de reps c tel que les deux premières séries au palier
  // font au moins c, et les suivantes au moins c − 1. »
  //
  // Écrit sans boucle d'essai : le plus haut c qui tient les deux premières est
  // `min(r1, r2)`, et chaque série suivante le borne à `r + 1`. Le minimum de
  // tout ça EST le niveau. `5-5-4-4` -> min(5, 5, 4+1, 4+1) = 5.
  //
  // ⚠️ EN REPS COMPTÉES, jamais brutes : une série `max` — RPE 10 ou
  // `reste_0` — vaut une rep de moins ici, et une seule ici (§17.4). Le format
  // et l'habitude, eux, lisent les reps BRUTES : ils décrivent ce qui a été
  // fait, ils ne valident rien.
  //
  // Une série dont on ne sait pas compter les reps ne se juge pas, et elle ne
  // se saute pas non plus : la sauter décalerait le rang des suivantes, donc
  // changerait qui est « la deuxième série ». Pas de niveau du tout.
  function niveauValide(seriesAuPalier) {
    var liste = seriesAuPalier || [];
    if (!liste.length) return null;

    var comptees = [];
    for (var i = 0; i < liste.length; i++) {
      var r = Palier().repsComptees(liste[i]);
      if (r === null) return null;
      comptees.push(r);
    }

    // Une seule série au palier : son propre compte. Il n'y a pas de « deux
    // premières » à confronter, et refuser de conclure ferait taire le moteur
    // sur une séance parfaitement lisible (§9.2, précisé le 19/09/2026).
    if (comptees.length === 1) return comptees[0];

    var niveau = Math.min(comptees[0], comptees[1]);
    for (var j = 2; j < comptees.length; j++) {
      niveau = Math.min(niveau, comptees[j] + 1);
    }
    return niveau;
  }

  // ── §8.2 — LE FORMAT D'UNE SÉANCE-EXERCICE ───────────────────────────────
  //
  // Médiane des reps des séries RETENUES — celles que le §7 a gardées, donc
  // hors chauffes, rampe, descente de fin, explorations, dégressives et échecs.
  // Une exploration à une rep tirerait la médiane vers le bas et ferait passer
  // une séance d'hypertrophie pour une séance de force.
  //
  // Les bornes : ≤ 6 force · ≤ 8 mixte · au-delà hypertrophie. Une médiane
  // entre deux entiers se range AU-DESSUS (6,5 -> mixte, 8,5 -> hypertrophie),
  // d'où l'arrondi supérieur avant les bandes plutôt que des bandes à demi.
  //
  // Le format NE SE STOCKE PAS (§8.3) : le stocker imposerait de le demander,
  // et il changerait sans que personne ne le mette à jour.
  function formatDe(retenues) {
    var m = mediane(repsDe(retenues));
    if (m === null) return null;
    var n = Math.ceil(m);
    if (n <= 6) return 'force';
    if (n <= 8) return 'mixte';
    return 'hypertrophie';
  }

  // Les séries qui ont TENU le palier — pas toutes les retenues. Une séance
  // `120, 120, 120, 110` a un palier de 120 et quatre retenues : la dernière
  // est du travail entier, mais elle n'a pas tenu le palier et ne dit rien de
  // l'habitude. C'est aussi l'entrée exacte de `niveauValide` (§9.2 : « le rang
  // se compte au palier, pas sur l'exercice »).
  function seriesAuPalier(seanceExercice) {
    var p = nombre(seanceExercice && seanceExercice.palier);
    if (p === null) return [];
    return (seanceExercice.retenues || []).filter(function (s) {
      return nombre(s && s.charge_kg) === p;
    });
  }

  // ── §9.1.2 — L'HABITUDE ──────────────────────────────────────────────────
  //
  // Médiane des reps de TOUTES les séries au palier, sur les 8 dernières
  // séances du couple exercice-format, arrondie à l'entier supérieur.
  //
  // `seances` : des séance-exercices `{ debut, palier, retenues }` — la forme
  // que rend `THPalier.analyser`, datée par `sessions.debut`. L'ordre d'arrivée
  // n'est pas supposé : on trie.
  //
  // ⚠️ `avant` EST OBLIGATOIRE, ET C'EST LE §9.12 RENDU IMPOSSIBLE À OUBLIER.
  // Le moteur ne lit jamais l'avenir : une séance corrigée après coup ne doit
  // pas changer la consigne lue la veille, et une consigne écrite dans
  // `predictions` doit pouvoir se recalculer à l'identique. Sans date de
  // coupure, on ne sait pas ce qu'est « l'avenir » — donc pas d'habitude, plutôt
  // qu'une habitude qui lit tout. La coupure est STRICTE : une séance du jour
  // même ne vote pas pour la consigne de ce jour-là.
  //
  // ⚠️ LE COUPLE EST DÉSIGNÉ PAR LA DERNIÈRE SÉANCE, pas par la première ni par
  // un vote : c'est le format dans lequel on travaille EN CE MOMENT. Un exercice
  // repassé en hypertrophie après un bloc de force doit être rangé sur ses
  // séances d'hypertrophie, pas sur un mélange des deux — c'est tout l'objet du
  // §8.1, où vingt kilos séparent les deux formats du même mouvement.
  //
  // Une séance SANS PALIER ne dit pas ce qui a été tenu : elle est écartée
  // AVANT la fenêtre, sinon elle occuperait un des huit créneaux sans rien y
  // apporter — la fenêtre annoncée serait de 8, la fenêtre réelle de 7.
  function habitudeDe(seances, avant) {
    var coupure = instant(avant);
    if (coupure === null) return null;

    var utiles = (seances || []).filter(function (se) {
      if (!se || nombre(se.palier) === null) return false;
      var d = instant(se.debut);
      return d !== null && d < coupure;
    });
    if (!utiles.length) return null;

    utiles.sort(function (a, b) {
      var da = instant(a.debut), db = instant(b.debut);
      return da < db ? -1 : (da > db ? 1 : 0);
    });

    var couple = formatDe(utiles[utiles.length - 1].retenues);
    var duCouple = utiles.filter(function (se) {
      return formatDe(se.retenues) === couple;
    });

    var reps = [];
    duCouple.slice(-FENETRE_HABITUDE).forEach(function (se) {
      reps = reps.concat(repsDe(seriesAuPalier(se)));
    });

    var m = mediane(reps);
    return m === null ? null : Math.ceil(m);
  }

  var api = {
    FENETRE_HABITUDE: FENETRE_HABITUDE,
    ZONES: ZONES,
    RANGEMENT: RANGEMENT,
    mediane: mediane,
    zoneParCle: zoneParCle,
    zoneDe: zoneDe,
    zoneRetenue: zoneRetenue,
    niveauValide: niveauValide,
    formatDe: formatDe,
    // Le pont entre `THPalier.analyser` et `niveauValide` : l'un rend une
    // séance décrite, l'autre attend les seules séries au palier.
    seriesAuPalier: seriesAuPalier,
    habitudeDe: habitudeDe
  };

  racine.THMoteur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
