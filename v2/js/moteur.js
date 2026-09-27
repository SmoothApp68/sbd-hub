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

  // §9.1.2 — LE COUPLE SE DÉSIGNE SUR 3 SÉANCES, À LA MAJORITÉ DE 2.
  //
  // Décidé le 19/09/2026 après simulation sur les vraies séances (`banc_consigne48.py`).
  // Avec la DERNIÈRE séance seule, une décharge isolée à 10 reps faisait
  // basculer la zone d'un bloc de force. Avec la MAJORITÉ DES 8 dernières, le
  // squat passé de 7 reps à 5 le 31/08 restait ignoré cinq séances. Deux sur
  // trois tient les deux bouts : une séance isolée ne fait jamais basculer, un
  // nouveau bloc est suivi dès sa 2ᵉ séance.
  var FENETRE_COUPLE = 3;
  var MAJORITE_COUPLE = 2;

  // §10.2 — le pas se mesure sur 24 mois. Une salle change de matériel, on
  // déménage : un pas d'il y a trois ans ne dit rien de celui d'aujourd'hui.
  var FENETRE_PAS_MOIS = 24;
  // Un écart isolé est du bruit, pas un plan de charges.
  var RECURRENCE_PAS = 3;

  // §9.9 / §12.6 — la coupure, et les deux reprises.
  var FACTEUR_COUPURE = 3;
  var SEUIL_REPRISE_LONGUE = 84;        // 12 semaines, INCLUSES dans la courte
  var AUCUNE_REPRISE = 'aucune';
  var REPRISE_COURTE = 'courte';
  var REPRISE_LONGUE = 'longue';

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

  // ⚠️ UN INSTANT, EN MILLISECONDES — PLUS UNE CHAÎNE (corrigé le 19/09/2026,
  // 48b-3, MOTEUR §9.12).
  //
  // La première écriture comparait les dates COMME DES TEXTES. Ça tient tant
  // que toutes les dates s'écrivent pareil, et le corpus du dépôt s'écrit
  // pareil — d'où un défaut qu'aucun test ne voyait. Mais un même instant
  // s'écrit de DEUX façons dans ce projet :
  //
  //   · l'app écrit `new Date().toISOString()`   -> « 2026-09-20T10:00:00.000Z »
  //   · `sessions.debut` est un `timestamptz`    -> « 2026-09-20T10:00:00+00:00 »
  //
  // et en texte, « +00:00 » passe AVANT « .000Z » — le « + » précède le « . ».
  // Une séance relue du serveur se classait donc avant une coupure écrite par
  // l'app au même instant : **la séance qu'on prescrit se comptait parmi ses
  // propres antécédents**, et le §9.12 tombait précisément là où il compte.
  //
  // `Date.parse` lit les deux écritures et rend le même nombre. Ce qu'il ne
  // sait pas lire rend `NaN`, donc `null` — jamais une comparaison de travers.
  function instant(v) {
    if (v === null || v === undefined || v === '') return null;
    var t = (v && typeof v.getTime === 'function') ? v.getTime() : Date.parse(v);
    return isFinite(t) ? t : null;
  }

  var JOUR = 86400000;

  // Les charges se comparent au centième de kilo. Sans cet arrondi, les écarts
  // d'une poulie convertie des livres ne se comptent pas : `12,2 − 10` vaut
  // 2,1999999999999993 et `16,6 − 14,4` vaut 2,1999999999999996 — trois fois le
  // même pas de 2,2 kg, et trois nombres différents. Le centième est très en
  // dessous de tout incrément réel ; il ne fusionne que ce qui est déjà égal.
  function auCentieme(v) { return Math.round(v * 100) / 100; }

  // Le dixième, pour un pas APPROCHÉ seulement (§10.2) : il ne sert pas à
  // proposer une charge, seulement à dire l'ordre de grandeur du cran.
  function auDixieme(v) { return Math.round(v * 10) / 10; }

  // §10.2 — un pas n'est EXACT que s'il est un multiple de 0,5 kg. En dessous,
  // c'est une conversion des livres, et l'arithmétique dessus est fausse.
  function estMultipleDeDemi(v) { return Math.round(v * 100) % 50 === 0; }

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
  // ── §9.1.1 — LA ZONE EN VIGUEUR, LUE SUR L'HISTORIQUE ────────────────────
  //
  // `zones_exercice` est un historique EN AJOUT SEUL : chaque choix ajoute une
  // ligne, et la plus récente fait foi. Une ligne à zone VIDE ramène à la
  // déduction — c'est ainsi que « Revenir à celle d'après tes séances »
  // s'écrit, sans jamais effacer ce qui a été choisi avant.
  //
  // ⚠️ LE DÉPARTAGE VA JUSQU'À L'IDENTIFIANT, et ce n'est pas du zèle : deux
  // appareils peuvent poser à la même seconde, et `corrigee_a` seul rendrait
  // alors une zone qui dépend de l'ordre d'arrivée des lignes. Deux lectures de
  // la même base donneraient deux consignes.
  function zoneEnVigueur(lignes, slug) {
    var gagnante = null;
    (lignes || []).forEach(function (l) {
      if (!l || l.exercise_slug !== slug) return;
      var t = instant(l.corrigee_a);
      if (t === null) return;
      if (gagnante === null || t > gagnante.t ||
          (t === gagnante.t && String(l.id) > String(gagnante.id))) {
        gagnante = { t: t, id: l.id, zone: l.zone };
      }
    });
    // Une zone vide, ou inconnue, vaut « pas de correction » : `zoneRetenue`
    // retombera sur l'habitude.
    return gagnante && gagnante.zone ? gagnante.zone : null;
  }

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
  // ⚠️ IL SE LIT SUR LE NIVEAU VALIDÉ, PLUS SUR UNE MÉDIANE (corrigé le
  // 19/09/2026, 48b-5a). Et il prend les séries AU PALIER, pas les retenues.
  //
  // La médiane se laissait emporter par UNE SEULE série. Couché à `125 × 8`
  // puis `125 × 5` : médiane 6,5, arrondie à 7, donc « mixte » — pour une
  // séance de force. Le couple de l'habitude basculait avec elle, la zone se
  // tirait alors de dix-huit vieilles séances de couché « mixte » à 100 kg, et
  // le moteur oubliait le test en cours à 130 kg. Trouvé en simulant la
  // consigne séance après séance, invisible en test unitaire.
  //
  // Le niveau validé (§9.2) ne se laisse pas emporter : il se fie aux DEUX
  // PREMIÈRES séries et tolère les suivantes à −1. Sur `8, 5` il vaut 5, donc
  // force — la première série en forme ne décide plus de la séance.
  //
  // Les bornes, sur le niveau et non sur une médiane : ≤ 6 force · 7 ou 8 mixte
  // · 9 et plus hypertrophie. Plus d'arrondi : un niveau validé est entier.
  //
  // Sans série au palier, PAS DE FORMAT — et c'est `niveauValide` qui le dit
  // déjà, y compris quand une série n'a pas de reps comptables.
  //
  // Le format NE SE STOCKE PAS (§8.3) : le stocker imposerait de le demander,
  // et il changerait sans que personne ne le mette à jour.
  function formatDe(seriesAuPalier) {
    var n = niveauValide(seriesAuPalier);
    if (n === null) return null;
    if (n <= 6) return 'force';
    if (n <= 8) return 'mixte';
    return 'hypertrophie';
  }

  // ── §9.1.2 — LE COUPLE, À LA MAJORITÉ DE 2 SUR 3 ─────────────────────────
  //
  // `formats` : ceux des trois dernières séances, de la plus ancienne à la plus
  // récente. On cherche en partant de la PLUS RÉCENTE, et c'est ce qui tranche
  // les égalités : le premier format qui revient au moins deux fois gagne, et à
  // défaut c'est celui de la plus récente.
  //
  // Trois formats différents — force, mixte, hypertrophie — ne donnent aucune
  // majorité : la plus récente l'emporte, parce qu'elle est la seule
  // information fraîche dont on dispose.
  function coupleDe(formats) {
    if (!formats.length) return null;
    for (var i = formats.length - 1; i >= 0; i--) {
      var n = 0;
      for (var j = 0; j < formats.length; j++) if (formats[j] === formats[i]) n++;
      if (n >= MAJORITE_COUPLE) return formats[i];
    }
    return formats[formats.length - 1];
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
  // ⚠️ LE COUPLE EST DÉSIGNÉ PAR 2 DES 3 DERNIÈRES SÉANCES (48b-5a-1), pas par
  // la première : c'est le format dans lequel on travaille EN CE MOMENT. Un exercice
  // repassé en hypertrophie après un bloc de force doit être rangé sur ses
  // séances d'hypertrophie, pas sur un mélange des deux — c'est tout l'objet du
  // §8.1, où vingt kilos séparent les deux formats du même mouvement.
  //
  // Une séance SANS PALIER ne dit pas ce qui a été tenu : elle est écartée
  // AVANT la fenêtre, sinon elle occuperait un des huit créneaux sans rien y
  // apporter — la fenêtre annoncée serait de 8, la fenêtre réelle de 7.
  //
  // ⚠️ LA LECTURE EST SÉPARÉE DE LA MÉDIANE depuis 48b-5a-2, et c'est le
  // §2 undecies : `consignePour` a besoin des MÊMES séances du couple — pour
  // l'avant-dernière, pour remonter un étirement, pour geler la zone. Les
  // recalculer ailleurs ferait deux couples possibles pour un seul exercice.
  function lectureDuCouple(seances, avant) {
    var coupure = instant(avant);
    if (coupure === null) return null;

    // Une séance n'entre que si elle DIT quelque chose : une date lisible,
    // strictement avant la coupure, et au moins une série qui a tenu le palier.
    // `seriesAuPalier` rend déjà [] quand il n'y a pas de palier du tout, donc
    // une pyramide est écartée par la même condition — et AVANT la fenêtre,
    // sinon elle occuperait un des huit créneaux sans rien y apporter.
    var lus = [];
    (seances || []).forEach(function (se) {
      var d = instant(se && se.debut);
      if (d === null || d >= coupure) return;
      var auPalier = seriesAuPalier(se);
      if (!auPalier.length) return;
      lus.push({ instant: d, seance: se, auPalier: auPalier, format: formatDe(auPalier) });
    });
    if (!lus.length) return null;

    lus.sort(function (a, b) { return a.instant - b.instant; });

    // ⚠️ LE COUPLE SE DÉSIGNE SUR TROIS SÉANCES, PAS SUR LA DERNIÈRE (corrigé
    // le 19/09/2026, 48b-5a). La dernière séance seule était trop nerveuse :
    // une décharge isolée faisait basculer la zone d'un bloc entier.
    var couple = coupleDe(lus.slice(-FENETRE_COUPLE).map(function (x) { return x.format; }));

    return {
      couple: couple,
      duCouple: lus.filter(function (x) { return x.format === couple; })
    };
  }

  // La médiane des reps au palier sur les 8 dernières séances DÉJÀ RÉDUITES au
  // couple, arrondie au-dessus. Prise à part parce que le gel de la zone
  // pendant un étirement (§9.7) la rejoue sur un PRÉFIXE de ces séances.
  function habitudeSur(duCouple) {
    var reps = [];
    (duCouple || []).slice(-FENETRE_HABITUDE).forEach(function (x) {
      reps = reps.concat(repsDe(x.auPalier));
    });
    var m = mediane(reps);
    return m === null ? null : Math.ceil(m);
  }

  function habitudeDe(seances, avant) {
    var lecture = lectureDuCouple(seances, avant);
    return lecture === null ? null : habitudeSur(lecture.duCouple);
  }

  // ── §10.2 — LE REPLI DU MATÉRIEL ─────────────────────────────────────────
  //
  // UNE SEULE TABLE, et elle ne sert QU'au rang 3 : quand l'historique ne donne
  // ni pas exact ni charge déjà utilisée au-delà du palier. Décidé le
  // 19/09/2026 : le plus petit saut est le plus prudent — le « pas le plus
  // fréquent » (5 kg à la barre) était trop grand pour les charges légères.
  //
  // Les clés sont celles de `exercises.equipement`. Les matériels absents de la
  // table — poulie, machine, elastique, kettlebell, disque, aucun — n'ont PAS de
  // repli, et c'est un choix : leurs charges viennent d'une conversion ou d'un
  // plan de poids qu'on ne devine pas. L'écran dira « le cran au-dessus », sans
  // chiffre, plutôt qu'un chiffre que la salle ne fait pas.
  //
  // ⚠️ LES HALTÈRES SE NOTENT POUR LA PAIRE, et la salle change de pas au
  // passage d'une paire de 20 kg : de 2 en 2 en dessous (1 kg par main), de 4 en
  // 4 au-dessus (2 kg par main). Mesuré sur les élévations latérales réelles :
  // 18, 20, puis 24 — jamais 22.
  var REPLI_MATERIEL = {
    barre:         { pas: 2.5 },
    machine_smith: { pas: 2.5 },
    haltere:       { pas: 2, pasLourd: 4, bascule: 20 }
  };

  // ⚠️ LA BASCULE APPARTIENT À LA BANDE LÉGÈRE, et l'asymétrie est voulue : on
  // SORT de la bande en montant depuis 20 (20 -> 24), on y RESTE en descendant
  // depuis 20 (20 -> 18). Les deux sens décrivent le même plan de charges.
  function repliDe(equipement, palier, sens) {
    if (!Object.prototype.hasOwnProperty.call(REPLI_MATERIEL, equipement)) return null;
    var r = REPLI_MATERIEL[equipement];
    if (r.pasLourd === undefined) return r.pas;
    return (sens > 0 ? palier >= r.bascule : palier > r.bascule) ? r.pasLourd : r.pas;
  }

  // ── Les séances, lues dans l'ordre et sans lire l'avenir ─────────────────
  //
  // `avant` est obligatoire partout, comme pour `habitudeDe` : le §9.12 ne se
  // tient que si on ne peut pas l'oublier. La coupure est STRICTE — la séance
  // qu'on prescrit n'est jamais son propre antécédent.
  function anterieures(seances, avant) {
    var coupure = instant(avant);
    if (coupure === null) return [];
    var utiles = (seances || []).filter(function (se) {
      var d = instant(se && se.debut);
      return d !== null && d < coupure;
    });
    return utiles.sort(function (a, b) { return instant(a.debut) - instant(b.debut); });
  }

  // Les charges d'une séance-exercice qui COMPTENT pour le plan de charges de la
  // salle : les `votantes` de `THPalier.analyser`, c'est-à-dire le travail ET
  // les explorations — hors chauffes, dégressives et séries ratées.
  //
  // ⚠️ LES EXPLORATIONS EN FONT PARTIE, et c'est le point : une charge tentée
  // une seule fois reste une charge que la salle FAIT. C'est même la seule trace
  // qu'on ait du cran du dessus avant de l'avoir tenu.
  function chargesDe(seanceExercice) {
    var sortie = [];
    ((seanceExercice && seanceExercice.votantes) || []).forEach(function (s) {
      var kg = nombre(s && s.charge_kg);
      if (kg !== null) sortie.push(auCentieme(kg));
    });
    return sortie;
  }

  // ── §10.2 — LE PAS DE LA SALLE ───────────────────────────────────────────
  //
  // « L'app ne demande jamais de combien monter. Elle déduit le pas de la salle
  // depuis les charges déjà utilisées sur cet exercice. »
  //
  // La plus lourde série de chaque séance, sur 24 MOIS — pas tout l'historique.
  // Une salle change de matériel, on déménage : un pas de 2010 ne dit rien de
  // celui d'aujourd'hui. Et pas « toutes les séries » non plus : les back-offs
  // et les rampes d'une même séance créent des écarts qui ne sont pas des crans.
  //
  // UN ÉCART EST RÉCURRENT S'IL REVIENT AU MOINS 3 FOIS. Deux suffiraient à
  // prendre une coïncidence pour un plan de charges ; quatre laisse muet un
  // exercice fait dix fois. On retient LE PLUS PETIT des écarts récurrents :
  // c'est le cran de la salle, les autres en sont des multiples.
  function pasDeSalle(seances, avant) {
    var limite = instant(avant);
    if (limite === null) return null;
    var debut = new Date(limite);
    debut.setUTCMonth(debut.getUTCMonth() - FENETRE_PAS_MOIS);
    var plancher = debut.getTime();

    var lourdes = {};
    anterieures(seances, avant).forEach(function (se) {
      if (instant(se.debut) < plancher) return;
      var charges = chargesDe(se);
      if (!charges.length) return;
      lourdes[Math.max.apply(null, charges)] = true;
    });

    var distinctes = Object.keys(lourdes).map(Number).sort(function (a, b) { return a - b; });
    if (distinctes.length < 2) return null;

    var ecarts = [];
    var compte = new Map();
    for (var i = 1; i < distinctes.length; i++) {
      var e = auCentieme(distinctes[i] - distinctes[i - 1]);
      if (e <= 0) continue;
      ecarts.push(e);
      compte.set(e, (compte.get(e) || 0) + 1);
    }

    var pas = null;
    compte.forEach(function (n, e) {
      if (n >= RECURRENCE_PAS && (pas === null || e < pas)) pas = e;
    });
    if (pas !== null && estMultipleDeDemi(pas)) return { pas: pas, nature: 'exact' };

    // ⚠️ SINON LE PAS EST APPROCHÉ, ET IL VAUT L'ÉCART MÉDIAN — aligné sur le
    // §10.2 le 19/09/2026. Le code rendait le plus petit écart récurrent, ou
    // rien du tout quand aucun ne revenait trois fois ; la spec dit « l'écart
    // médian » depuis 48b-5a-1. Deux phrases pour un seul calcul, c'est le
    // §2 undecies à l'envers, et c'est la spec qui tranche.
    //
    // Le plus petit convenait à un pas EXACT — les autres en sont des multiples
    // — mais pas à un pas approché : sur des charges converties des livres, le
    // plus petit écart est du bruit d'arrondi, la médiane décrit la salle.
    // Arrondi au dixième : un pas approché ne prétend pas au centième.
    //
    // ⚠️ SANS EFFET SUR LES CHARGES PROPOSÉES : `chargeVoisine` ne lit le pas
    // QUE s'il est exact (rang 1). Ce que ce pas décrit, c'est l'ordre de
    // grandeur du cran de la salle, pour qui saura le lire.
    var m = mediane(ecarts);
    if (m === null) return null;
    return { pas: auDixieme(m), nature: 'approche' };
  }

  // ── §10.2 — QUELLE CHARGE PROPOSER, DANS L'ORDRE ─────────────────────────
  //
  // « Le moteur ne propose que des charges que la salle fait. » Quatre rangs, et
  // l'ordre est la décision :
  //
  //   1. le pas EXACT déduit de l'historique : palier ± pas ;
  //   2. sinon la charge DÉJÀ UTILISÉE juste au-delà — sans limite de date,
  //      contrairement au pas : une charge faite il y a trois ans existe
  //      toujours dans la salle, même si le plan de charges a changé depuis ;
  //   3. sinon le repli du MATÉRIEL ;
  //   4. sinon RIEN, et l'écran dira « le cran au-dessus », sans chiffre.
  //
  // ⚠️ LE RANG 2 PASSE AVANT LE RANG 3, et l'ordre inverse est un vrai défaut :
  // sur `60, 65, 70`, le repli de la barre proposerait 67,5 — une charge qui
  // n'a jamais été faite — là où 70 est attesté.
  //
  // ⚠️ UN PAS APPROCHÉ NE SERT À RIEN AU RANG 1. Sur une poulie convertie des
  // livres, `9 + 2,2` donne 11,2, une charge que la machine ne fait pas ; la
  // charge déjà utilisée juste au-dessus, elle, vaut 11,5 et elle est vraie.
  //
  // `sens` : +1 pour la charge au-dessus, −1 pour celle en dessous. Le sens
  // descendant sert à la reprise longue (§9.9).
  function chargeVoisine(seances, avant, palier, equipement, sens) {
    var p = nombre(palier);
    // ⚠️ LA GARDE DE COUPURE VAUT ICI AUSSI, et elle manquait au premier jet.
    // Les rangs 1 et 2 se taisent d'eux-mêmes sans coupure — ils ne lisent que
    // des séances antérieures, et il n'y en a aucune. Mais le rang 3 ne lit
    // AUCUNE séance : le repli du matériel proposait donc une charge alors même
    // qu'on ne savait pas ce qu'était « l'avenir ». Le §9.12 se contournait par
    // la porte de derrière, et c'est un test de bord qui l'a montré.
    if (p === null || instant(avant) === null) return null;
    var dir = nombre(sens) < 0 ? -1 : 1;

    var pas = pasDeSalle(seances, avant);
    if (pas && pas.nature === 'exact') return auCentieme(p + dir * pas.pas);

    var voisine = null;
    anterieures(seances, avant).forEach(function (se) {
      chargesDe(se).forEach(function (c) {
        if (dir > 0 ? c <= p : c >= p) return;
        if (voisine === null || (dir > 0 ? c < voisine : c > voisine)) voisine = c;
      });
    });
    if (voisine !== null) return voisine;

    var repli = repliDe(equipement, p, dir);
    if (repli !== null) return auCentieme(p + dir * repli);

    return null;
  }

  // ── §12.6 / §9.9 — L'ÉCART HABITUEL, LA COUPURE ET LA REPRISE ────────────
  //
  // L'écart habituel est la médiane des écarts, EN JOURS, entre séances
  // consécutives de l'exercice. Une médiane et non une moyenne : une seule
  // coupure de trois mois tirerait la moyenne au point de rendre la règle
  // muette pour toujours.
  //
  // Il faut AU MOINS DEUX séances : avec une seule, il n'y a pas d'écart, donc
  // pas de coupure — une première séance n'est pas une reprise.
  function ecartHabituel(seances, avant) {
    var dates = anterieures(seances, avant).map(function (se) { return instant(se.debut); });
    if (dates.length < 2) return null;
    var ecarts = [];
    for (var i = 1; i < dates.length; i++) ecarts.push((dates[i] - dates[i - 1]) / JOUR);
    return mediane(ecarts);
  }

  // §9.9 — « Après une coupure, le moteur ne demande pas de rep de plus.
  // Au-delà de 12 semaines, il repart un cran sous le dernier palier. »
  //
  // La coupure est STRICTE (§12.6) : à 3 fois l'écart habituel pile, il n'y en a
  // pas. Sinon une semaine de retard sur un exercice hebdomadaire deviendrait
  // une reprise, et le moteur se tairait sans raison.
  //
  // 84 jours INCLUS restent une reprise courte : douze semaines pile, c'est la
  // borne mesurée au banc M14 — jusque-là, la personne tient son palier dès la
  // première séance 73 à 74 fois sur 100.
  //
  // ⚠️ RIEN ICI NE DIT LA DURÉE DE L'ABSENCE, et rien ne doit la dire :
  // `CADRAGE §3.1 bis` interdit tout commentaire sur l'assiduité. Cette fonction
  // rend un CRAN, pas un nombre de jours.
  function repriseDe(seances, avant) {
    var coupure = instant(avant);
    var dates = anterieures(seances, avant).map(function (se) { return instant(se.debut); });
    if (coupure === null || !dates.length) return AUCUNE_REPRISE;
    var habituel = ecartHabituel(seances, avant);
    if (habituel === null) return AUCUNE_REPRISE;

    var depuis = (coupure - dates[dates.length - 1]) / JOUR;
    if (!(depuis > FACTEUR_COUPURE * habituel)) return AUCUNE_REPRISE;
    return depuis <= SEUIL_REPRISE_LONGUE ? REPRISE_COURTE : REPRISE_LONGUE;
  }

  // ── §9.13 — LA CONSIGNE, EN CALCUL PUR ───────────────────────────────────
  //
  // « 125 kg, vise 5 — puis 130 kg en dernière série, vise 4. » Cette fonction
  // ne rend pas une phrase : elle rend les nombres dont une phrase a besoin.
  // 48b-5b écrira la phrase, et c'est lui qui traduira le vocabulaire des rôles
  // d'`analyser` vers celui du contrat ci-dessous.
  //
  // ⚠️ LE MODÈLE DE L'ÉCHELLE, décidé avec Aurélien le 19/09/2026 (§9.7) : la
  // nouvelle charge entre par la DERNIÈRE série — le test — et gagne les séries
  // de la dernière vers la première, une par séance. Après la bascule du palier
  // (§7.2), les séries restées à l'ancien palier continuent de monter une par
  // séance. Les rampes plus légères que l'ancien palier et les chauffes ne
  // bougent pas. Prudent, Normal et Franc sont TROIS VITESSES DE LA MÊME
  // ÉCHELLE, pas trois algorithmes.
  //
  // ENTRÉE. `seances` : les séance-exercices d'UN exercice, chacune
  // `{ debut, palier, series }`, chaque série `{ charge_kg, reps, rpe, ressenti,
  // role }` où `role` vaut `palier` · `travail` · `exploration` · `rampe` ·
  // `autre`. `avant` : le début de la séance prescrite — seules les séances
  // STRICTEMENT antérieures comptent (§9.12). `reglage` : `prudent` · `normal`
  // · `franc`. `equipement` : celui de `exercises.equipement`.
  // `correction` : une clé de zone, qui l'emporte sur tout (§9.1.1).
  //
  // SORTIE. `{ etat, zone, palier, niveau, n, ligne, haut, raison }`. La
  // consigne couvre les `n` DERNIÈRES séries de travail : les `n − k` premières
  // reçoivent `ligne`, les `k` dernières reçoivent `haut`. Les séries d'avant
  // gardent leur fantôme. Une charge `null` se dit « le cran au-dessus » (ou
  // « en dessous »), sans chiffre. `raison` n'existe qu'en silence.
  //
  // ⚠️ `ligne` ET `haut` SONT DES OBJETS, PAS DES TABLEAUX — un seul choix, et
  // c'est celui-là. `{ charge, vise }` et `{ charge, vise, k }` se lisent au
  // point d'appel ; `[130, 4, 2]` demande d'aller relire cette page. Le fichier
  // de cas les écrit en tableaux : c'est le test qui convertit, une fois.

  // Le vocabulaire des rôles du CONTRAT, et la traduction vers les deux
  // ensembles que le reste de `moteur.js` connaît déjà (§7) : `retenues` = le
  // travail, `votantes` = le travail ET les explorations.
  var ROLES_RETENUS    = { palier: true, travail: true };
  var ROLES_VOTANTS    = { palier: true, travail: true, exploration: true };
  var ROLES_EXPLORE    = { exploration: true };
  var ROLES_RAMPE      = { rampe: true };
  var ROLES_RESTE      = { travail: true, rampe: true };

  // §9.1.2 — jamais au-delà de 30 reps, quelle que soit la route qui y mène.
  var PLAFOND_CIBLE = 30;
  // §9.8 — le double saut de Franc ne dépasse pas 10 % de la charge.
  var MARGE_DOUBLE_SAUT = 0.10;
  // §9.8 — « le haut dépassé de 3 reps » : l'une des deux preuves.
  var PREUVE_DEPASSEMENT = 3;

  function cible(v) { return Math.min(v, PLAFOND_CIBLE); }

  // `hasOwnProperty` et non une lecture directe : `role` vient de la base, et
  // `constructor` ou `__proto__` y rendraient une valeur non nulle. Même garde
  // que `zoneParCle` et `repliDe`.
  function estRole(s, table) {
    return !!s && Object.prototype.hasOwnProperty.call(table, s.role) && table[s.role] === true;
  }

  function parRole(series, table) {
    return (series || []).filter(function (s) { return estRole(s, table); });
  }

  // La séance du contrat, vue comme `THPalier.analyser` la rendrait : c'est
  // cette vue, et elle seule, que les fonctions existantes reçoivent.
  function vueDeSeance(se) {
    var series = (se && se.series) || [];
    return {
      debut: se && se.debut,
      palier: se && se.palier,
      series: series,
      retenues: parRole(series, ROLES_RETENUS),
      votantes: parRole(series, ROLES_VOTANTS)
    };
  }

  // Le test d'une séance : la plus lourde exploration, ses séries, leur niveau.
  // `niveauValide` et non les reps brutes — une exploration à RPE 10 compte une
  // rep de moins, comme au palier (§17.4).
  function testDe(vue) {
    var explorations = parRole(vue && vue.series, ROLES_EXPLORE);
    if (!explorations.length) return null;
    var T = null;
    explorations.forEach(function (s) {
      var kg = nombre(s.charge_kg);
      if (kg !== null && (T === null || kg > T)) T = kg;
    });
    if (T === null) return null;
    var aT = explorations.filter(function (s) { return nombre(s.charge_kg) === T; });
    // `reps` est la SAISIE de la première série à cette charge, `niveau` son
    // compte (§17.4). Les deux, parce que la phrase dit « 130 × 5 » — ce que la
    // personne a fait — pendant que le moteur juge sur 4.
    return { charge: T, k: aT.length, reps: nombre(aT[0].reps), niveau: niveauValide(aT) };
  }

  // ── §9.7 — L'ÉPISODE D'ÉTIREMENT ─────────────────────────────────────────
  //
  // Un test raté dont le cran ne pouvait pas être RÉDUIT n'a qu'une sortie :
  // gagner des reps au palier jusqu'à mériter le même test. C'est l'étirement,
  // et il ouvre un ÉPISODE, qui se clôt au retest réussi ou au changement de
  // palier.
  //
  // ⚠️ PENDANT L'ÉPISODE, LA ZONE RESTE CELLE DU PREMIER TEST RATÉ. Décidé le
  // 19/09/2026 après simulation : sinon les reps étirées entrent dans
  // l'habitude et font glisser l'exercice vers une zone plus haute — le curl
  // marteau passait de Volume en Séries longues — et le retest se jugerait
  // contre la mauvaise zone, donc ne viendrait jamais.
  //
  // On remonte les séances du couple au même palier. Une séance sans
  // exploration ne dit rien et se traverse ; la remontée s'arrête à un test
  // réussi, à un changement de palier, ou dès que le cran pouvait être réduit.
  // Rendu du plus RÉCENT au plus ANCIEN : le premier sert au §9.7, le dernier
  // au gel de la zone.
  function episodeEtirement(duCouple, P, vues, avant, equipement, correction) {
    var rates = [];
    for (var i = duCouple.length - 1; i >= 0; i--) {
      var x = duCouple[i];
      if (nombre(x.seance.palier) !== P) break;
      var t = testDe(x.seance);
      if (t === null) continue;
      // « sa zone d'alors » : l'habitude arrêtée à cette séance-là, jamais la
      // zone d'aujourd'hui — elle est justement ce qu'on cherche à figer.
      var z = zoneRetenue(correction, habitudeSur(duCouple.slice(0, i + 1)));
      if (z === null || t.niveau === null || t.niveau >= z.bas) break;
      var c1 = chargeVoisine(vues, avant, P, equipement, 1);
      if (c1 !== null && c1 < t.charge) break;
      rates.push({ rang: i, test: t, auPalier: x.auPalier, debut: x.seance.debut });
    }
    return rates;
  }

  // Les états où l'ÉCHELLE bouge : ceux-là, et eux seuls, ont besoin de
  // l'ancien palier pour se raconter.
  var ETATS_ECHELLE = { rejoint: true, attend: true, tout_passe: true };

  // Les reps SAISIES, dans l'ordre — « 4-4-4 ». Jamais les comptées : la phrase
  // rappelle ce qui a été fait, la note de la série à fond dit le reste.
  function repsSaisies(series) {
    return (series || []).map(function (s) { return nombre(s.reps); });
  }

  // Les charges de travail DISTINCTES d'une séance, dans l'ordre d'apparition —
  // « 100, 110 puis 120 kg, aucune charge répétée ». C'est exactement ce que le
  // §7.2 a refusé de valider, dit à l'endroit.
  function chargesDistinctes(vue) {
    var vues = {}, sortie = [];
    chargesDe(vue).forEach(function (c) {
      if (vues[c] === true) return;
      vues[c] = true;
      sortie.push(c);
    });
    return sortie;
  }

  function faitDuTest(t, debut) {
    return { charge: t.charge, reps: t.reps, niveau: t.niveau, date: debut };
  }

  // ⚠️ LA DERNIÈRE SÉANCE, SÉRIE PAR SÉRIE (48b-6a, MOTEUR §9.13). La feuille
  // « Pourquoi » la relit en entier — chauffes comprises, elles qui ne votent
  // nulle part ailleurs. On PROJETTE les six colonnes plutôt que de rendre les
  // objets d'entrée : le fondement est un contrat, pas une fenêtre ouverte sur
  // ce que l'appelant a bien voulu mettre dans ses séries.
  function seanceDuFondement(vue) {
    return ((vue && vue.series) || []).map(function (s) {
      return {
        charge_kg: s.charge_kg === undefined ? null : s.charge_kg,
        reps: s.reps === undefined ? null : s.reps,
        rpe: s.rpe === undefined ? null : s.rpe,
        ressenti: s.ressenti === undefined ? null : s.ressenti,
        role: s.role === undefined ? null : s.role,
        origine: s.origine === undefined ? null : s.origine
      };
    });
  }

  // §17.4 — LA PREMIÈRE série au palier qui compte une rep de moins. La
  // première : la phrase en nomme une, et le rang se lit sur les séries AU
  // PALIER, pas sur la séance — c'est le rang que l'écran affichera.
  //
  // `cause` dit d'où vient le cran, parce que la phrase change : un RPE de 10
  // se cite tel quel (« était à RPE 10 »), un « reste 0 » se dit en français
  // (« était à fond »). Le RPE l'emporte, comme dans `cranDeSerie`.
  function serieAFondDe(series) {
    for (var i = 0; i < (series || []).length; i++) {
      var s = series[i];
      var brut = nombre(s && s.reps);
      var comptees = Palier().repsComptees(s);
      if (brut === null || comptees === null || comptees >= brut) continue;
      return {
        rang: i + 1, charge: nombre(s.charge_kg), reps: brut, comptees: comptees,
        cause: Palier().cranEffort(s.rpe) !== null ? 'rpe' : 'ressenti'
      };
    }
    return null;
  }

  function consignePour(seances, avant, options) {
    var opt = options || {};
    var reglage = opt.reglage || 'normal';
    var equipement = opt.equipement;
    var correction = opt.correction;

    var vues = (seances || []).map(vueDeSeance);
    var ant = anterieures(vues, avant);
    // 1. Les silences. Une première fois n'a rien à dire, et le dire serait
    // inventer ; une séance sans palier n'a rien TENU (§7.2).
    // Le fondement d'un silence de première fois est VIDE, et pas absent : la
    // phrase n'a besoin d'aucun fait, mais l'appelant lit toujours la même forme.
    if (!ant.length) return { etat: 'silence', raison: 'premiere_fois', fondement: {} };

    var L = ant[ant.length - 1];
    var P = nombre(L.palier);
    var A = seriesAuPalier(L);
    var niv = A.length ? niveauValide(A) : null;
    if (P === null || !A.length || niv === null) {
      // Les CHARGES, et elles seules : « 100, 110 puis 120 kg, aucune charge
      // répétée ». Sans palier il n'y a ni reps au palier ni test à raconter.
      return { etat: 'silence', raison: 'pas_de_palier',
               fondement: { date: L.debut, charges: chargesDistinctes(L),
                            seance: seanceDuFondement(L) } };
    }

    // 2. La zone. La correction l'emporte (§9.1.1) ; sinon l'habitude du couple
    // — gelée au premier test raté si un épisode d'étirement court.
    var lecture = lectureDuCouple(vues, avant);
    var duCouple = lecture === null ? [] : lecture.duCouple;
    var rates = episodeEtirement(duCouple, P, vues, avant, equipement, correction);
    // ⚠️ DEUX HABITUDES, ET CE N'EST PAS UNE DUPLICATION (§9.7, précisé
    // 48b-6a). Le gel porte sur LA ZONE, pas sur ce que la personne fait :
    //
    //   · `habitude` — celle qui CHOISIT la zone, arrêtée au premier test raté
    //     tant que l'épisode court, sans quoi les reps étirées feraient glisser
    //     l'exercice vers une zone plus haute et le retest ne viendrait jamais ;
    //   · `habitudeVraie` — celle que la feuille « Pourquoi » ÉNONCE, sur la
    //     fenêtre entière. Au retest (N9), la zone reste Volume pendant que la
    //     personne fait 13 reps d'habitude : dire 12 serait lui raconter ses
    //     propres séances de travers.
    //
    // Les deux coïncident partout ailleurs, et c'est pour ça qu'un seul cas du
    // fichier les sépare.
    var fondantes = rates.length
      ? duCouple.slice(0, rates[rates.length - 1].rang + 1) : duCouple;
    var habitude = habitudeSur(fondantes);
    var habitudeVraie = habitudeSur(duCouple);
    // Le PREMIER test raté de l'épisode — `rates` va du plus récent au plus
    // ancien, donc c'est le dernier. C'est sa zone qui reste figée (§9.7).
    var figee = rates.length ? rates[rates.length - 1] : null;
    var zone = zoneRetenue(correction, habitude);

    // Le palier de l'avant-dernière séance du couple : il sert à reconnaître
    // les séries RESTÉES à l'ancien palier après une bascule (§7.2), et le
    // déclencheur « deux séances de suite » du réglage Prudent.
    var precedente = duCouple.length >= 2 ? duCouple[duCouple.length - 2] : null;
    var Pv = precedente === null ? null : nombre(precedente.seance.palier);
    var apresBascule = Pv !== null && Pv < P;
    var restes = apresBascule
      ? L.series.filter(function (s) {
          return estRole(s, ROLES_RESTE) && nombre(s.charge_kg) === Pv;
        })
      : [];

    // 5. `n` — les séries que la consigne couvre. Les votantes de `L` (palier,
    // travail, exploration) plus ses rampes restées à l'ancien palier : une
    // rampe qui attend sa montée fait partie de l'échelle ; une rampe plus
    // légère que l'ancien palier n'y est pas.
    var n = L.votantes.length + restes.filter(function (s) {
      return estRole(s, ROLES_RAMPE);
    }).length;

    // ── §9.13 — LE FONDEMENT ─────────────────────────────────────────────
    //
    // Les faits sur lesquels la consigne repose, pour que l'en-tête, la feuille
    // « Pourquoi » et `predictions` n'aient JAMAIS à recalculer une règle du
    // moteur. C'est le §2 undecies appliqué à la frontière : le moteur décide
    // ET fournit de quoi le dire.
    //
    // ⚠️ UNE CLÉ N'Y FIGURE QUE SI ELLE A UN SENS. `test` sans test, `seuil`
    // sans série qui attend : une clé toujours présente et parfois nulle
    // obligerait chaque lecteur à retrancher les cas — et un oubli passerait
    // en silence. L'absence est le signal.
    var aFond = serieAFondDe(A);
    var testDeL = testDe(L);
    function rendre(etat, ligne, haut, plus) {
      var f = { date: L.debut, reps: repsSaisies(A) };
      // §9.13, enrichi le 20/09/2026 (48b-6a) : de quoi écrire la feuille
      // « Pourquoi » sans jamais rejouer une règle du moteur.
      f.seance = seanceDuFondement(L);
      if (habitudeVraie !== null) {
        f.habitude = { valeur: habitudeVraie,
                       seances: Math.min(FENETRE_HABITUDE, duCouple.length) };
      }
      // ⚠️ LE GEL S'EFFACE DEVANT UNE CORRECTION (C3). Il protège la zone
      // DÉDUITE pendant qu'un étirement court ; quand l'utilisateur a choisi la
      // sienne, il n'a plus d'objet, et la feuille ne doit pas raconter un gel
      // qu'elle n'affiche plus. L'épisode, lui, continue : l'état reste
      // `etirement`, seule la zone change.
      if (figee !== null && zoneParCle(correction) === null) {
        f.zoneFigee = { date: figee.debut };
      }
      // §9.1.1 (48b-7) — QUAND UNE ZONE EST CHOISIE, la feuille « Pourquoi »
      // doit pouvoir dire ce que les séances auraient donné. Elle ne le
      // recalcule pas : le moteur le lui donne.
      //
      // ⚠️ SUR L'HABITUDE VRAIE, PAS SUR LA GELÉE. Pendant un étirement, la
      // zone gelée est justement celle que la correction remplace : répondre
      // « ce serait Volume » en citant le gel ferait dire au moteur qu'il
      // déduirait aujourd'hui ce qu'il a cessé de déduire il y a trois séances.
      if (zoneParCle(correction) !== null) {
        var deduite = zoneDe(habitudeVraie);
        f.correction = { zoneDeduite: deduite === null ? null : deduite.cle };
      }
      if (aFond !== null) f.serieAFond = aFond;
      // ⚠️ `testUnCran` NE SE POSE QUE SUR LE TEST DE LA DERNIÈRE SÉANCE. Le
      // test d'un épisode d'étirement (§9.7) arrive par `plus`, sans lui : on
      // ne juge plus la taille d'un cran qu'on a déjà renoncé à réduire.
      if (testDeL !== null) {
        f.test = faitDuTest(testDeL, L.debut);
        f.testUnCran = voisine(P, 1) === testDeL.charge;
      }
      // L'ancien palier n'intéresse que les états où l'échelle BOUGE.
      if (apresBascule && ETATS_ECHELLE[etat] === true) f.palierPrecedent = Pv;
      if (plus) {
        for (var k in plus) {
          if (Object.prototype.hasOwnProperty.call(plus, k)) f[k] = plus[k];
        }
      }
      return {
        etat: etat, zone: zone === null ? null : zone.cle, palier: P, niveau: niv,
        n: n, ligne: ligne, haut: haut, fondement: f
      };
    }
    function ligneDe(charge, vise) { return { charge: charge, vise: vise }; }
    function hautDe(charge, vise, k) { return { charge: charge, vise: vise, k: k }; }
    function voisine(depuis, sens) {
      return chargeVoisine(vues, avant, depuis, equipement, sens);
    }
    function comptees(s) {
      var r = Palier().repsComptees(s);
      return r === null ? null : r;
    }
    function auMoins(series, seuil) {
      return series.some(function (s) { var r = comptees(s); return r !== null && r >= seuil; });
    }
    function toutesAuMoins(series, seuil) {
      return series.length > 0 && series.every(function (s) {
        var r = comptees(s); return r !== null && r >= seuil;
      });
    }

    // 3. La reprise prime sur tout le reste : après une coupure, le moteur ne
    // demande pas de rep de plus (§9.9), et au-delà de 12 semaines il repart un
    // cran dessous. Rien ici ne dit la durée de l'absence (CADRAGE §3.1 bis).
    var reprise = repriseDe(vues, avant);
    if (reprise === REPRISE_COURTE) return rendre('reprise_courte', ligneDe(P, niv), null);
    // §9.9 (delta 49-13, 27/09/2026) — le repli ne descend jamais de plus de
    // 10 % : `repliDeReprise` est la SEULE règle, que le plan réapplique à
    // toute consigne qu'il reçoit (`consigneFigee`).
    if (reprise === REPRISE_LONGUE) return rendre('reprise_longue', ligneDe(repliDeReprise(P, voisine(P, -1)), niv), null);

    // 4. La règle de bord : sous 3 reps d'habitude, il n'y a plus de zone. On
    // monte la charge AUX MÊMES REPS — la variabilité journalière des maximaux
    // dépasse l'écart entre une rep et deux (§9.1.2).
    if (zone === null) return rendre('bord', ligneDe(voisine(P, 1), niv), null);

    var lo = zone.bas;
    var hi = zone.haut;
    var vise = cible(Math.min(niv + 1, hi));

    // 6. Un test dans `L` : l'échelle AVANT la bascule.
    var t = testDe(L);
    if (t !== null && t.niveau !== null) {
      var T = t.charge;
      var k = t.k;
      var lvl = t.niveau;

      if (lvl >= lo) {
        // Franc : le test au HAUT de sa zone emporte tout d'un coup — sauf en
        // zone Lourd, où le §9.7 n'accorde qu'une série de plus par séance.
        if (reglage === 'franc' && lvl >= hi && zone.cle !== 'lourd') {
          return rendre('tout_passe', null, hautDe(T, cible(Math.min(lvl, hi)), n));
        }
        if (reglage === 'prudent') {
          // Prudent garde la charge sur sa série jusqu'à y toucher le haut ;
          // alors, et alors seulement, la précédente la rejoint (§9.8).
          if (lvl >= hi) {
            return rendre('etend', ligneDe(P, vise),
              hautDe(T, cible(Math.min(lvl, hi)), Math.min(k + 1, n)));
          }
          return rendre('garde', ligneDe(P, vise), hautDe(T, cible(Math.min(lvl + 1, hi)), k));
        }
        // Normal et Franc : au BAS de la zone le test est gardé — il a passé,
        // mais tout juste ; au-dessus du bas, il gagne une série de plus.
        if (lvl === lo) return rendre('garde', ligneDe(P, vise), hautDe(T, cible(lvl + 1), k));
        return rendre('etend', ligneDe(P, vise),
          hautDe(T, cible(Math.min(lvl, hi)), Math.min(k + 1, n)));
      }

      // Test RATÉ. D'abord réduire le cran : un test à deux crans qui tombe se
      // refait à UN cran, pas à la même charge.
      if (k === 1 && niv >= hi) {
        var c1Rate = voisine(P, 1);
        if (c1Rate !== null && c1Rate < T) {
          return rendre('retest_un_cran', ligneDe(P, cible(hi)), hautDe(c1Rate, lo, 1));
        }
        // Le cran est irréductible : la zone s'étire. ⚠️ LA CIBLE COMPTE LES
        // REPS PERDUES — `hi + niv − lvl` — sinon on redemanderait le même test
        // sans avoir rien gagné.
        var cibleEtirement = cible(hi + niv - lvl);
        if (niv >= cibleEtirement) {
          return rendre('retest', ligneDe(P, niv), hautDe(T, lo, 1), { cible: cibleEtirement });
        }
        return rendre('etirement', ligneDe(P, cible(Math.min(niv + 1, cibleEtirement))), null,
          { cible: cibleEtirement });
      }
      return rendre('progression', ligneDe(P, vise), null);
    }

    // 7. APRÈS LA BASCULE : la charge a pris la majorité, des séries sont
    // restées dessous. Elles montent une par séance.
    if (restes.length) {
      var ka = A.length;
      var nivRestes = niveauValide(restes);
      if (reglage === 'franc' && niv >= hi && zone.cle !== 'lourd') {
        return rendre('tout_passe', null,
          hautDe(P, cible(Math.min(niv, hi)), ka + restes.length));
      }
      // Prudent attend le HAUT de la zone ; Normal et Franc se contentent d'un
      // cran au-dessus du bas.
      var permis = reglage === 'prudent' ? niv >= hi : niv > lo;
      if (permis) {
        return rendre('rejoint',
          restes.length > 1 ? ligneDe(Pv, nivRestes) : null,
          hautDe(P, cible(Math.min(niv, hi)), ka + 1));
      }
      // ⚠️ `seuil` EST LA CONDITION `permis`, DITE EN CHIFFRE. Un seul calcul
      // (§2 undecies) : « rejoindra quand tu y feras 4 » est exactement
      // `niv > lo`, et « 5 » en Prudent exactement `niv >= hi`. La phrase ne
      // redécide rien, elle lit.
      return rendre('attend', ligneDe(Pv, nivRestes), hautDe(P, vise, ka),
        { seuil: reglage === 'prudent' ? hi : lo + 1 });
    }

    // 8. UN ÉTIREMENT EN COURS, sans test dans `L` : on gagne des reps jusqu'à
    // la cible, puis on refait le même test. La zone est celle d'alors (§9.7).
    if (rates.length) {
      var episode = rates[0];
      var nivAlors = niveauValide(episode.auPalier);
      if (nivAlors !== null) {
        var cibleEnCours = cible(hi + nivAlors - episode.test.niveau);
        var faitEpisode = { test: faitDuTest(episode.test, episode.debut), cible: cibleEnCours };
        if (niv >= cibleEnCours) {
          return rendre('retest', ligneDe(P, niv), hautDe(episode.test.charge, lo, 1), faitEpisode);
        }
        return rendre('etirement', ligneDe(P, cible(Math.min(niv + 1, cibleEnCours))), null,
          faitEpisode);
      }
    }

    // 9. LE DÉCLENCHEUR DU RÉGLAGE (§9.8) — les trois vitesses.
    var declenche;
    if (reglage === 'franc') {
      // Dès qu'UNE série touche le haut : c'est la double progression dynamique.
      declenche = auMoins(A, hi);
    } else if (reglage === 'prudent') {
      // Le repère NSCA « 2-pour-2 » : toutes les séries au haut, deux séances
      // de suite, AU MÊME PALIER — un palier qui change rouvre le compteur.
      declenche = toutesAuMoins(A, hi) && precedente !== null &&
        nombre(precedente.seance.palier) === P && toutesAuMoins(precedente.auPalier, hi);
    } else {
      declenche = niv >= hi;
    }
    if (!declenche) return rendre('progression', ligneDe(P, vise), null);

    var c1 = voisine(P, 1);
    var saut = c1;
    // ⚠️ `preuve` NE SE NOTE QUE SI LE DOUBLE SAUT A ÉTÉ PRIS. Une preuve
    // trouvée puis refusée par la borne des 10 % (F3) ne se dit pas : la
    // phrase annoncerait « on teste deux crans » sur une consigne d'un cran.
    var preuveRetenue = null;
    if (reglage === 'franc' && c1 !== null) {
      // La preuve du double saut : le haut dépassé de 3 reps, ou un effort dit
      // « facile » (§17.3, logique APRE).
      var preuve = auMoins(A, hi + PREUVE_DEPASSEMENT) || A.some(function (s) {
        return Palier().cranDeSerie(s) === 'facile';
      });
      if (preuve) {
        // ⚠️ DEUX CRANS SEULEMENT S'ILS RESTENT SOUS 10 % DE LA CHARGE —
        // corrigé le 19/09/2026 : l'ancienne limite « un cran au plus sur les
        // grosses barres » était à l'envers. Au couché à 125 kg, deux crans
        // font 4 % : permis ; au curl EZ à 30 kg, 17 % : un seul.
        var c2 = voisine(c1, 1);
        if (c2 !== null && auCentieme(c2 - P) <= auCentieme(P * MARGE_DOUBLE_SAUT)) {
          saut = c2;
          preuveRetenue = auMoins(A, hi + PREUVE_DEPASSEMENT) ? 'haut' : 'facile';
        }
      }
    }
    return rendre('test_propose', ligneDe(P, vise), hautDe(saut, lo, 1),
      preuveRetenue === null ? null : { preuve: preuveRetenue });
  }

  // ── §9.14 — LA RÉACTION SÉRIE PAR SÉRIE (chantier 49, 49-R1) ─────────────
  //
  // La consigne se calcule à l'ouverture et ne bouge plus ; la réaction la
  // relit après chaque série VALIDÉE. « 50 × 12, 3 de plus que visé : 52,5 dès
  // la série 2, vise 8 à 10 ? » Elle ne rend pas de phrase (`phraseReaction`
  // s'en charge) : elle rend le plan, le message, la proposition en attente et
  // le numéro de révision (§9.11).
  //
  // ⚠️ UNE FONCTION PURE, et c'est tout son intérêt. L'écran, la feuille
  // « Pourquoi » et `predictions` liront SA sortie ; aucun ne rejouera la
  // règle. Le contexte (cran, seconde charge) se calcule sur les séances
  // ANTÉRIEURES par l'appelant (§9.12) : la séance en cours n'entre ici que par
  // ses séries validées.
  //
  // ENTRÉE. `consigne` : la sortie de `consignePour`. `faites` : les séries
  // validées de l'exercice, parmi les `n` que la consigne couvre, dans l'ordre,
  // `{ charge_kg, reps, rpe, ressenti }`. `contexte` : `{ cran, haut }`, où
  // `cran` est la charge immédiatement au-dessus (ou `null`, « le cran
  // au-dessus » sans chiffre) et `haut` la seconde charge `{ charge, source }`
  // de `secondeCharge`, ou `null`.
  //
  // SORTIE. `{ plan, message, attente, revision }`. Le plan couvre TOUTES les
  // séries de la consigne, validées comprises, avec la charge proposée à
  // chaque rang : la cascade du fantôme en a besoin pour juger une déviation
  // (P4, 25/09/2026). `message.rang` et `attente.rang` sont l'index 0 de la
  // ligne au-dessus de laquelle la phrase s'écrit.

  // §9.14 — 3 reps comptées de marge pour proposer, 5 pour la seconde charge.
  var SEUIL_REACTION = 3;
  var SEUIL_SECONDE_CHARGE = 5;
  // §9.14 — « il faut au moins 5 montées antérieures » pour parler d'habitude.
  var MIN_MONTEES_HABITUDE = 5;
  // Les états où la réaction se tait par règle : rien à tenter (silence) et la
  // règle de bord, sans zone (§9.1.2). ⚠️ PLUS LA REPRISE (delta 49-13,
  // 27/09/2026) : sa consigne reste sans rep de plus, mais une série faite à sa
  // charge avec 3 reps de marge montre que la prudence n'était pas nécessaire,
  // et le coach le dit (mesure R1 : retour à 98 % en médiane).
  var ETATS_MUETS_REACTION = {
    silence: true, bord: true
  };

  // §9.9 (delta 49-13, 27/09/2026) — LE REPLI DE LA REPRISE LONGUE, PLAFONNÉ.
  // « Un cran sous le dernier palier », jamais plus de 10 % sous lui : le cran
  // d'une machine peut valoir 15 à 30 % de la charge (curl pupitre repris à 23
  // pour un palier de 32, −28 %), quand ce repli veut couvrir une perte de 6
  // à 9 %. Au-delà, la consigne garde le dernier palier, sans rep de plus. Un
  // cran sans chiffre (`null`) reste tel quel : on ne sait pas ce qu'il vaut.
  var REPLI_MAX_REPRISE = 0.10;
  function repliDeReprise(palier, cranDessous) {
    var P = nombre(palier), c = nombre(cranDessous);
    if (P === null || c === null) return cranDessous;
    return P - c > P * REPLI_MAX_REPRISE + 1e-9 ? P : cranDessous;
  }

  // L'ÉTAPE DE LA CONSIGNE FIGÉE (§9.13 bis) : le plan la passe sur toute
  // consigne qu'il reçoit — une consigne calculée avant ce jour et gardée pour
  // la séance, ou celle d'un fichier de cas. Pure, et sans effet sur une
  // consigne déjà juste : `consignePour` pose la même règle à la source.
  function consigneFigee(consigne) {
    var c = consigne || null;
    if (c === null || c.etat !== 'reprise_longue' || !c.ligne) return c;
    var l = repliDeReprise(c.palier, c.ligne.charge);
    if (l === c.ligne.charge) return c;
    return Object.assign({}, c, { ligne: Object.assign({}, c.ligne, { charge: l }) });
  }

  function ligneDePlan(charge, vise, zone, source) {
    return { charge: charge, vise: vise, zone: zone, source: source };
  }

  // Le plan de la consigne telle qu'elle a été donnée : les `n − k` premières
  // séries à la ligne, les `k` dernières au test (§9.13).
  function planDeConsigne(c) {
    var n = nombre(c && c.n);
    if (n === null || n <= 0) return [];
    var k = c.haut ? Math.min(nombre(c.haut.k) || 0, n) : 0;
    var plan = [];
    for (var i = 0; i < n; i++) {
      var src = i >= n - k ? c.haut : c.ligne;
      plan.push(ligneDePlan(src ? nombre(src.charge) : null, src ? nombre(src.vise) : null,
        null, 'consigne'));
    }
    return plan;
  }

  // §9.13 (49-C, 26/09/2026) — LE PLAN DE LA SÉANCE EN COURS. La consigne ne
  // couvre plus « les n dernières séries » : elle couvre toutes les séries de
  // travail de la séance, telles qu'elles sont (`Seance.couvertureSeance`).
  // Ce plan-ci part de CETTE couverture, une ligne par série couverte, dans
  // l'ordre : une série validée y apporte sa ligne FIGÉE (celle qu'elle
  // affichait à sa validation, relue dans son pari), les autres la ligne ou
  // le haut de la consigne selon leur rôle.
  //
  // ⚠️ UNE LIGNE FIGÉE PORTE `figee: true`, et `reactionPour` ne la réécrit
  // jamais : ni la montée tenue, ni le retour au palier ne remontent sur une
  // série déjà faite. C'est la règle « une série validée est figée ».
  function planDeCouverture(consigne, couverture) {
    var c = consigne || null;
    if (c === null) return [];
    return (couverture || []).filter(function (x) { return !!x; }).map(function (x) {
      if (x.figee) {
        var f = x.figee;
        return {
          charge: f.charge === undefined ? null : nombre(f.charge),
          vise: f.vise === undefined ? null : nombre(f.vise),
          zone: Array.isArray(f.zone) ? f.zone.slice() : null,
          source: f.source || 'consigne',
          charges: Array.isArray(f.charges) ? f.charges.slice() : null,
          sourceHaut: f.sourceHaut === undefined ? null : f.sourceHaut,
          role: x.role || null,
          figee: true
        };
      }
      var src = x.role === 'haut' ? c.haut : c.ligne;
      var l = ligneDePlan(src ? nombre(src.charge) : null, src ? nombre(src.vise) : null,
        null, 'consigne');
      // §9.13 bis (49-U1) — LE RÔLE DE LA LIGNE VOYAGE AVEC ELLE : la réaction
      // en a besoin pour ne jamais poser une proposition sur un test.
      l.role = x.role === 'haut' ? 'haut' : 'ligne';
      return l;
    });
  }

  function memeCharge(a, b) {
    return a !== null && b !== null && auCentieme(a) === auCentieme(b);
  }

  // `planInitial` (49-C) : le plan de la séance en cours (`planDeCouverture`).
  // Absent, c'est le plan de la consigne seule, sur ses `n` séries — la forme
  // que rejoue le fichier de cas de 49-R1, qui ne change pas.
  function reactionPour(consigne, faites, contexte, planInitial) {
    var c = consigne || null;
    var plan = Array.isArray(planInitial)
      ? planInitial.map(function (p) { return p ? Object.assign({}, p) : p; })
      : planDeConsigne(c);
    var sortie = { plan: plan, message: null, attente: null, revision: 0 };
    if (c === null || ETATS_MUETS_REACTION[c.etat] === true) return sortie;
    // `zone` : une clé chez `consignePour` ; la table des zones donne les bornes.
    var z = typeof c.zone === 'string' ? zoneParCle(c.zone) : null;
    var P = c.ligne ? nombre(c.ligne.charge) : null;
    if (z === null || !c.ligne || P === null || nombre(c.palier) === null) return sortie;

    var ctx = contexte || {};
    var n = plan.length;
    var bornes = [z.bas, z.haut];
    // §9.13 bis (49-U1) — LE RÔLE INITIAL DE CHAQUE LIGNE : celui du plan de la
    // séance quand il est donné, sinon la disposition de la consigne seule
    // (les `k` dernières au test) — la forme que rejoue le fichier de cas.
    var kCons = c.haut ? Math.min(nombre(c.haut.k) || 0, n) : 0;
    var roleInitial = plan.map(function (p, idx) {
      if (Array.isArray(planInitial)) return p && p.role ? p.role : 'ligne';
      return idx >= n - kCons ? 'haut' : 'ligne';
    });
    // Une ligne est un TEST À VENIR tant qu'elle garde la consigne du haut.
    var testAVenir = function (idx) {
      var p = plan[idx];
      return !!p && !p.figee && p.source === 'consigne' && roleInitial[idx] === 'haut';
    };
    var clos = false;        // une montée, ou un refus : plus rien dans ce bloc
    var attente = null;
    var revision = 0;
    var message = null;
    var liste = (faites || []).slice(0, n);

    for (var i = 0; i < liste.length; i++) {
      var s = liste[i] || {};
      var charge = nombre(s.charge_kg);
      var reps = nombre(s.reps);
      var comptees = Palier().repsComptees(s);
      var derniere = i === n - 1;
      message = null;

      // La ligne proposée vient d'être validée : prise, ou refusée (P3).
      if (attente !== null && attente.rang === i) {
        var propose = attente.charges[0];
        attente = null;
        var prise = propose === null
          ? charge !== null && charge > P && !memeCharge(charge, P)
          : charge !== null && (charge > propose || memeCharge(charge, propose));
        clos = true;
        if (!prise) continue;          // refus : le coach se tait jusqu'au bout du bloc

        if (comptees !== null && comptees >= z.bas) {
          // TENUE. La charge montée reste pour la suite, visée au bas de la
          // zone — sauf en Lourd, où le garde-fou du §9.7 n'accorde qu'une
          // série de plus : la série montée l'a déjà prise.
          var change = false;
          if (z.cle !== 'lourd') {
            for (var j = i + 1; j < n; j++) {
              // Une série déjà faite garde sa ligne (49-C, §9.13).
              if (plan[j].figee) continue;
              // Un test à venir garde la sienne : il est déjà la montée (I2,
              // 49-U1). Sans cette garde, 127,5 tenu réécrivait un test prévu
              // à 130 en 127,5 — le défaut du 26/09 par un autre chemin.
              if (testAVenir(j)) continue;
              // Une série que la consigne prévoyait déjà à cette charge garde
              // sa visée (§9.14).
              if (plan[j].source === 'consigne' && memeCharge(plan[j].charge, charge)) continue;
              plan[j] = ligneDePlan(charge, z.bas, bornes.slice(), 'coach');
              change = true;
            }
          }
          if (change) revision += 1;
          if (!derniere) {
            // §9.13 bis, I9 (49-U1) — « ton test a avancé d'une série » se lit
            // SUR LES LIGNES : la charge PROPOSÉE est celle d'un test encore à
            // venir, qui arrive donc une série plus tôt. « Le cran au-dessus »
            // sans chiffre vaut « le cran au-dessus » sans chiffre. Avant,
            // `!!c.haut` le disait de toute montée dès que la consigne portait
            // un test — 127,5 tenu « faisait avancer » un test prévu à 130.
            var avance = false;
            for (var t2 = i + 1; t2 < n; t2++) {
              if (!testAVenir(t2)) continue;
              var tc = nombre(plan[t2].charge);
              if (tc === null ? propose === null : memeCharge(tc, propose)) { avance = true; break; }
            }
            message = comptees >= z.haut
              ? { type: 'haut', rang: i + 1, charge: charge, reps: reps }
              : { type: 'tenue', rang: i + 1, charge: charge, reps: reps, avance: avance };
          }
        } else {
          // PAS ENCORE. Retour à la charge et à la visée du palier ; le pari de
          // la consigne n'a jamais cessé d'exister, rien de neuf ne s'écrit.
          for (var r = i + 1; r < n; r++) {
            if (plan[r].figee) continue;
            plan[r] = ligneDePlan(P, nombre(c.ligne.vise), null, 'retour');
          }
          if (!derniere) {
            message = { type: 'pas_encore', rang: i + 1, charge: charge, reps: reps, palier: P };
          }
        }
        continue;
      }
      if (clos) continue;

      // Toute montée clôt les propositions (P1). Un test prévu suit la
      // consigne ; une montée de son propre chef est un choix : silence.
      if (charge !== null && charge > P && !memeCharge(charge, P)) { clos = true; continue; }

      // Une série au palier, sur une ligne encore celle de la consigne, qui
      // n'est pas la dernière : 3 reps comptées de plus que visé, on propose.
      if (derniere || !memeCharge(charge, P) || plan[i].source !== 'consigne') continue;
      var vise = plan[i].vise;
      if (comptees === null || vise === null) continue;
      var marge = comptees - vise;
      if (marge < SEUIL_REACTION) continue;
      var charges = [ctx.cran === undefined ? null : nombre(ctx.cran)];
      var sourceHaut = null;
      if (marge >= SEUIL_SECONDE_CHARGE && ctx.haut && nombre(ctx.haut.charge) !== null) {
        charges.push(nombre(ctx.haut.charge));
        sourceHaut = ctx.haut.source || null;
      }
      // ⚠️ LA SÉRIE SUIVANTE EST DÉJÀ FAITE (49-C). Sa ligne est figée : si
      // c'était la proposition du coach, elle a bien eu lieu — on la rejoue
      // avec SES charges, celles qu'elle affichait ; sinon, il n'y a pas eu de
      // proposition, et le rejeu n'en invente pas une après coup.
      var suivante = plan[i + 1];
      // §9.14 (décidé le 26/09/2026, 49-U1) — LA SÉRIE SUIVANTE EST DÉJÀ UN
      // TEST : le test est déjà la montée. Pas de proposition, ni seconde
      // charge ; la charge, la visée et le pari du test ne changent pas. Une
      // phrase seulement (I2).
      if (testAVenir(i + 1)) {
        message = { type: 'test_suit', rang: i + 1, charge: charge, reps: reps, marge: marge,
                    test: { charge: suivante.charge, vise: suivante.vise } };
        continue;
      }
      if (suivante && suivante.figee) {
        if (suivante.source !== 'coach') continue;
        charges = Array.isArray(suivante.charges) && suivante.charges.length
          ? suivante.charges.slice() : [suivante.charge];
        sourceHaut = suivante.sourceHaut === undefined ? null : suivante.sourceHaut;
        revision += 1;
        attente = { rang: i + 1, charges: charges.slice() };
        message = { type: 'propose', rang: i + 1, charge: charge, reps: reps,
                    charges: charges, marge: marge, source: sourceHaut };
        continue;
      }
      // §9.14 (delta 49-13, 27/09/2026, #327) — UN TEST EST PRÉVU PLUS LOIN
      // DANS LE BLOC : la proposition prend SA charge, le test avance d'une
      // série. Une seule montée par bloc — le cran du dessus avant un test plus
      // lourd en ajoutait une seconde, plus petite (125, 127,5, puis 130 : rien
      // ne se répétait, la séance suivante ne proposait plus aucune charge).
      // ⚠️ LE « PLUS LOIN » SE LIT SUR LE RÔLE PRÉVU (`roleInitial`), jamais
      // sur le rôle courant : une ligne de test déjà figée, ou revenue à la
      // charge de travail après un « pas encore », reste un test prévu — sinon
      // la décision changerait après coup, et une ligne figée bougerait (I4).
      // Pas de seconde charge : rien au-dessus d'un test (I14).
      var testPrevu = false;
      for (var t3 = i + 1; t3 < n; t3++) {
        if (roleInitial[t3] === 'haut') { testPrevu = true; break; }
      }
      var retrouve = false;
      if (testPrevu && c.haut) {
        charges = [nombre(c.haut.charge)];
        sourceHaut = null;
      } else if (c.etat === 'reprise_longue' && P < nombre(c.palier) && !memeCharge(P, nombre(c.palier))) {
        // §9.14 (delta 49-13) — EN REPRISE LONGUE SOUS LE DERNIER PALIER, la
        // proposition ramène d'abord au palier (« on retrouve ton palier ») ;
        // à partir du palier, la proposition habituelle, le cran du dessus.
        charges = [nombre(c.palier)];
        sourceHaut = null;
        retrouve = true;
      }
      // I3 (49-U1) — une proposition n'est jamais plus basse que la charge
      // prévue de la ligne qu'elle remplace.
      if (suivante && charges[0] !== null && nombre(suivante.charge) !== null &&
          charges[0] < nombre(suivante.charge) && !memeCharge(charges[0], suivante.charge)) continue;
      plan[i + 1] = ligneDePlan(charges[0], z.bas, bornes.slice(), 'coach');
      revision += 1;
      attente = { rang: i + 1, charges: charges.slice() };
      message = { type: 'propose', rang: i + 1, charge: charge, reps: reps,
                  charges: charges, marge: marge, source: sourceHaut };
      if (retrouve) message.retrouve = true;
    }

    sortie.revision = revision;
    sortie.attente = attente;
    // Toutes les séries faites : plus rien à dire dans la grille.
    sortie.message = liste.length >= n ? null : message;
    return sortie;
  }

  // §9.14 — LA SECONDE CHARGE, à 5 reps de marge : ce que le programme fixe,
  // puis ce que la personne fait (son saut habituel), puis la préconisation
  // (deux crans, sous 10 % du palier). `null` si elle ne dépasse pas le cran,
  // ou si le cran n'a pas de chiffre.
  //
  // ⚠️ LE SEUIL SE LIT AU CENTIÈME, comme toutes les charges (`auCentieme`).
  // Un saut habituel de 6,6667 % sur 75 kg vise 80,000025 : sans l'arrondi,
  // 80 kg, la charge vraie, serait « sous » le seuil.
  function secondeCharge(o) {
    var e = o || {};
    var palier = nombre(e.palier);
    var cran = nombre(e.cran);
    if (palier === null || cran === null) return null;
    var retenue = null;
    var programme = nombre(e.programme);
    if (programme !== null) {
      retenue = { charge: programme, source: 'programme' };
    } else {
      var sauts = (e.sauts || []).map(nombre).filter(function (v) { return v !== null; });
      if (sauts.length >= MIN_MONTEES_HABITUDE) {
        var seuil = auCentieme(palier * (1 + mediane(sauts)));
        var plusPetite = null;
        (e.charges || []).forEach(function (v) {
          var ch = nombre(v);
          if (ch === null || auCentieme(ch) < seuil) return;
          if (plusPetite === null || ch < plusPetite) plusPetite = ch;
        });
        if (plusPetite !== null) retenue = { charge: plusPetite, source: 'habitude' };
      }
      if (retenue === null) {
        var suivant = nombre(e.cranSuivant);
        if (suivant !== null && auCentieme(suivant) <= auCentieme(palier * (1 + MARGE_DOUBLE_SAUT))) {
          retenue = { charge: suivant, source: 'preconisation' };
        }
      }
    }
    if (retenue === null || !(retenue.charge > cran) || memeCharge(retenue.charge, cran)) return null;
    return retenue;
  }

  // §9.14 — LE SAUT HABITUEL, relevé séance par séance : la PREMIÈRE série de
  // travail plus lourde que le palier qui suit IMMÉDIATEMENT une série au
  // palier, rapportée au palier. Les chauffes et les autres rôles ne comptent
  // ni comme montée ni comme interruption. Une habitude décrite, comme le pas
  // de salle : COMMENT la personne monte, jamais les seules fois où ça a tenu.
  //
  // `seances` : `[{ palier, series: [{ charge_kg, role }] }]`, les séances
  // antérieures (§9.12), avec les rôles du contrat (`analyser` → §9.13).
  function sautsDeMontee(seances) {
    var sauts = [];
    (seances || []).forEach(function (se) {
      var p = nombre(se && se.palier);
      if (p === null || p <= 0) return;
      var travail = parRole(se.series, ROLES_VOTANTS);
      for (var i = 1; i < travail.length; i++) {
        var avant = nombre(travail[i - 1].charge_kg);
        var ch = nombre(travail[i].charge_kg);
        if (ch === null || !memeCharge(avant, p) || !(ch > p) || memeCharge(ch, p)) continue;
        sauts.push((ch - p) / p);
        return;
      }
    });
    return sauts;
  }

  // §9.14 (49-R2) — LE CONTEXTE DE LA RÉACTION, sur les séances ANTÉRIEURES
  // seulement (§9.12) : le cran au-dessus de la charge proposée (§10.2, la
  // même fonction que le test), le cran suivant, les sauts habituels et les
  // charges déjà utilisées — et de là la seconde charge (`secondeCharge`).
  //
  // ⚠️ LA BASE EST LA CHARGE DE LA LIGNE, pas `consigne.palier` : c'est à elle
  // que la réaction compare (« une série au palier proposé »). En état
  // `attend`, la ligne est l'ancien palier et la proposition monte d'elle.
  //
  // `seances` : les séances du contrat (`contratDe`), `{ debut, palier,
  // series }`. `programme` : la charge qu'un programme fixerait — `null`
  // aujourd'hui, la prise du chantier programmes (§9.10).
  function contexteReaction(seances, avant, consigne, equipement, programme) {
    var vide = { cran: null, haut: null };
    if (!consigne || !consigne.ligne) return vide;
    var base = nombre(consigne.ligne.charge);
    if (base === null) base = nombre(consigne.palier);
    if (base === null) return vide;
    var vues = (seances || []).map(vueDeSeance);
    var cran = chargeVoisine(vues, avant, base, equipement, 1);
    var cranSuivant = cran === null ? null : chargeVoisine(vues, avant, cran, equipement, 1);
    var ant = anterieures(vues, avant);
    var charges = [];
    ant.forEach(function (se) {
      chargesDe(se).forEach(function (c) { if (charges.indexOf(c) < 0) charges.push(c); });
    });
    return {
      cran: cran,
      haut: secondeCharge({ palier: base, cran: cran, cranSuivant: cranSuivant,
        sauts: sautsDeMontee(ant), charges: charges,
        programme: programme === undefined ? null : programme })
    };
  }

  // §9.11 (49-R2, delta 49-4) — LA RÉVISION DE CHAQUE LIGNE, lue sur le plan
  // seul : la première ligne du coach porte la révision 1 (la série
  // proposée), les suivantes la révision 2 (passées à la charge montée). La
  // consigne et le retour au palier gardent la révision 0 : leur pari est
  // celui de l'ouverture.
  function revisionsDuPlan(plan) {
    var vu = false;
    return (plan || []).map(function (p) {
      if (!p || p.source !== 'coach') return 0;
      if (!vu) { vu = true; return 1; }
      return 2;
    });
  }

  // §9.11 (49-C, révisé le 26/09/2026) — LE PARI D'UNE SÉRIE, écrit À SA
  // VALIDATION, juste avant son observation, avec ce que sa ligne affichait à
  // ce moment-là. Plus rien ne s'écrit à l'ouverture : un pari n'existe que
  // pour une série qui a existé.
  //
  // ⚠️ ELLE NE RELANCE PAS LA RÉACTION (§9.13 bis, 49-U3). C'est le plan de
  // séance qui la calcule — sur les séries validées qui PRÉCÈDENT la série
  // `j`, c'est-à-dire ce que l'écran montrait juste avant la validation — et
  // qui la passe ici (`reactionAvant`). Cette fonction ne fait que mettre en
  // forme le pari de la ligne `j` : une seconde réaction, calculée à part,
  // pouvait écrire un pari qui ne disait pas la ligne affichée (D5).
  //
  // `faitesAvant` : ces mêmes séries (le déclencheur d'une révision s'y lit).
  // `options.rang` : le rang de la série au moment de sa validation
  // (`Seance.couvertureSeance`), qui ne changera plus ; `options.role` :
  // `ligne` ou `haut`.
  //
  // UNE ligne : la révision du coach (1 : la série proposée ; 2 : les
  // suivantes, montée tenue), ou la révision 0 — la consigne, ou le retour
  // au palier. Rien si la ligne n'a pas de visée à parier.
  function lignesDePari(consigne, reactionAvant, faitesAvant, j, options) {
    var o = options || {};
    if (!consigne || consigne.etat === 'silence' || j < 0 || !reactionAvant) return [];
    var liste = faitesAvant || [];
    var r = reactionAvant;
    var p = r.plan[j];
    if (!p) return [];
    var z = zoneParCle(consigne.zone);
    var revs = revisionsDuPlan(r.plan);
    var rev = revs[j];
    var rang = o.rang === undefined ? j + 1 : o.rang;
    var fondement = {
      rang: rang,
      charge: p.charge,
      etat: consigne.etat,
      zone: consigne.zone === undefined ? null : consigne.zone,
      reglage: o.reglage === undefined ? null : o.reglage,
      palier: consigne.palier === undefined ? null : consigne.palier,
      niveau: consigne.niveau === undefined ? null : consigne.niveau,
      seance: o.seance === undefined ? null : o.seance
    };
    if (!rev) {
      // La révision 0 : la consigne, ou le retour au palier (qui rend sa
      // valeur au pari de la consigne). Le rôle dit ce que la ligne affichait.
      if (p.vise === null || p.vise === undefined) return [];
      fondement.role = p.source === 'retour' ? 'retour' : (o.role === 'haut' ? 'haut' : 'ligne');
      return [{
        module: MODULE_CONSIGNE,
        exercise_slug: o.slug === undefined ? null : o.slug,
        grandeur: 'reps',
        valeur_predite: p.vise,
        borne_basse: z ? z.bas : null,
        borne_haute: z ? z.haut : null,
        fondement: fondement
      }];
    }
    if (z === null) return [];
    var iDecl = rev === 1 ? j - 1 : revs.indexOf(1);
    var d = liste[iDecl] || {};
    var comptees = Palier().repsComptees(d);
    var viseDecl = r.plan[iDecl] ? r.plan[iDecl].vise : null;
    var propose = rev === 1 && r.message && r.message.type === 'propose' ? r.message : null;
    fondement.revision = rev;
    // Le rang du déclencheur est SON rang (`options.rangs`, par position),
    // pas sa position : après un retrait, les deux ne coïncident plus.
    fondement.declencheur = {
      rang: Array.isArray(o.rangs) && o.rangs[iDecl] !== undefined ? o.rangs[iDecl] : iDecl + 1,
      charge: nombre(d.charge_kg), reps: nombre(d.reps),
      comptees: comptees,
      marge: comptees === null || viseDecl === null ? null : comptees - viseDecl
    };
    fondement.charges = rev === 1 && r.attente ? r.attente.charges.slice() : [p.charge];
    fondement.source = propose ? propose.source : null;
    fondement.role = 'coach';
    return [{
      module: MODULE_CONSIGNE,
      exercise_slug: o.slug === undefined ? null : o.slug,
      grandeur: 'reps',
      valeur_predite: z.bas,
      borne_basse: z.bas,
      borne_haute: z.haut,
      fondement: fondement
    }];
  }

  // §20 — LES PHRASES DE LA RÉACTION. Un fait, jamais un « bravo ».
  // Elles ne lisent que le message et les bornes de la zone : aucune règle ne
  // se rejoue ici. Mêmes insécables que les phrases de l'en-tête (autour du
  // « × », avant les deux-points).
  //
  // Le centième, comme toutes les phrases du moteur (`nombreFr`). Le millième
  // de 49-R1 venait d'un artefact de la simulation (« 21,315 »), corrigé dans
  // le fichier de cas v2 (49-R2).
  function nombreReaction(v) { return nombreFr(v); }
  function croixReaction(a, b) { return croix(a, b); }

  function phraseReaction(message, zone) {
    var m = message || null;
    if (m === null) return null;
    var z = typeof zone === 'string' ? zoneParCle(zone) : (zone || null);
    var fait = croixReaction(m.charge, m.reps);
    switch (m.type) {
      case 'propose': {
        if (z === null) return null;
        var ch = (m.charges || []).map(function (v) {
          return v === null ? 'le cran au-dessus' : nombreReaction(v);
        });
        var quoi = ch.length > 1 ? ch[0] + ', ou ' + ch[1] + ' si tu te sens bien' : ch[0];
        // §9.14 (delta 49-13) — la reprise longue qui ramène au palier le dit.
        if (m.retrouve) quoi = 'on retrouve ton palier, ' + quoi;
        return fait + ', ' + m.marge + ' de plus que visé' + DEUX_POINTS + quoi +
          ' dès la série ' + (m.rang + 1) + ', vise ' + z.bas + ' à ' + z.haut + ' ?';
      }
      case 'tenue':
        return fait + ', dans ta zone' + DEUX_POINTS +
          (m.avance ? 'ton test a avancé d\'une série.' : 'tu montes dès aujourd\'hui.');
      case 'haut':
        return fait + ', le haut de ta zone.';
      case 'test_suit': {
        // §9.14 (26/09/2026) — dans la nouvelle voix du coach, charge d'abord.
        var t = m.test || {};
        var leTest = t.charge === null || t.charge === undefined
          ? 'ton test au cran du dessus' : 'ton test à ' + enKg(t.charge);
        return enKg(m.charge) + INSECABLE + '\u00d7' + INSECABLE + nombreFr(m.reps) + ', ' +
          m.marge + ' de plus que prévu' + DEUX_POINTS + leTest + ' arrive dès la série ' +
          (m.rang + 1) + ', avec de la marge.';
      }
      case 'pas_encore':
        return fait + DEUX_POINTS + 'pas encore. Tu as tenté plus tôt que prévu ; on reprend à ' +
          nombreReaction(m.palier) + '.';
      default:
        return null;
    }
  }


  // ── ECRAN-SAISIE §3.12 — LES PHRASES DE L'EN-TÊTE ────────────────────────
  //
  // La voix du moteur, et c'est pour ça qu'elle vit ICI. Les phrases sont
  // arrêtées dans `maquette-moteur-parle-v2.html`, tableau « L'en-tête, état
  // par état », validé par Aurélien le 19/09/2026.
  //
  // ⚠️ ELLE NE LIT QUE LA CONSIGNE ET SON FONDEMENT, plus la table des zones
  // pour les bornes. Aucune règle du moteur ne se rejoue ici : « rejoindra
  // quand tu y feras 4 » lit `fondement.seuil`, il ne recompare pas un niveau à
  // un bas de zone. C'est le §2 undecies à la frontière de l'écran — et c'est
  // la raison d'être du fondement (§9.13).
  //
  // Trois règles de rédaction (ECRAN-SAISIE §3.12) :
  //   · UNE SEULE phrase grise par en-tête ;
  //   · la ligne jaune qui porte LE PLUS DE SÉRIES vient d'abord, sauf quand
  //     une seule série porte la nouvelle charge ;
  //   · « On le retestera au haut de ta zone » ne se dit QUE si le test raté
  //     valait un seul cran.

  // §10.2 / ECRAN-SAISIE — L'ESPACE INSÉCABLE entre un nombre et son unité,
  // autour du « × », avant les deux-points et dans une date. Sans lui, « 127,5 »
  // et « kg » se séparent en bout de ligne à 360 px, et la charge devient
  // illisible une ligne sur deux.
  // ⚠️ ÉCRITS EN ÉCHAPPEMENT, jamais en clair : une espace insécable est
  // INVISIBLE dans l'éditeur, et la prochaine main qui passe la remplacerait par
  // une espace ordinaire sans le voir. Même raison qu'au moins U+2212 de
  // `rendu.js`.
  var INSECABLE = '\u00a0';
  var DEUX_POINTS = INSECABLE + ': ';

  // §9.11 — L'IDENTITÉ DE CE QUI ÉCRIT, et elle vit ICI, à côté de la règle.
  // `module_version` monte quand une règle du moteur change : deux semaines de
  // prédictions calculées par deux versions différentes ne se comparent pas
  // sans le savoir. ⚠️ Ne JAMAIS la recopier ailleurs — comme `CACHE_V2`, un
  // chiffre recopié ne peut que dériver (CADRAGE §2 undecies).
  var MODULE_CONSIGNE = 'moteur.consigne';
  var VERSION_CONSIGNE = 1;

  // ⚠️ SECONDE LISTE APRÈS `Calendrier.MOIS`, et assumée. L'abréviation ne se
  // dérive pas du nom entier : « février » donne « févr. », « mars » reste
  // « mars » SANS point, « juillet » donne « juil. ». Une règle mécanique se
  // tromperait sur la moitié des mois. Un test vérifie que les deux tables ont
  // douze entrées dans le même ordre — la même garde que `CRAN_DU_RESSENTI`
  // face à `THSeance.RESSENTIS`.
  //
  // Et pas `toLocaleDateString` : il rend un espace ORDINAIRE entre le jour et
  // le mois, et son résultat dépend de l'ICU de l'appareil. Un module pur ne
  // peut pas dépendre de ça.
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                     'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  // ⚠️ LU TARDIVEMENT, SANS REPLI, comme `THPalier`. `modele.js` charge avant
  // `moteur.js` (index.html 325 puis 329), mais un repli « si THModele manque,
  // écris le point décimal » afficherait « 127.5 » à un utilisateur français
  // sans que rien ne le signale.
  function Modele() { return racine.THModele; }

  // La virgule décimale, et pas de zéro inutile : 125 · 127,5 · 24,8.
  function nombreFr(v) { return Modele().nombre(v); }
  function enKg(v) { return nombreFr(v) + INSECABLE + 'kg'; }
  function croix(a, b) { return nombreFr(a) + INSECABLE + '\u00d7' + INSECABLE + nombreFr(b); }

  // « 13 sept. » — le JOUR LOCAL de la séance, comme partout ailleurs à
  // l'écran (`Rendu.dateCourte`). Une séance de 23 h se lit au jour où la
  // personne l'a faite, pas au jour UTC.
  function leJour(iso) {
    var t = instant(iso);
    if (t === null) return '';
    var d = new Date(t);
    return d.getDate() + INSECABLE + MOIS_COURTS[d.getMonth()];
  }

  // « 100, 110 puis 120 » — la dernière se détache, parce que c'est elle qui
  // dit que la série de charges s'arrête là.
  function suiteFr(valeurs) {
    var l = (valeurs || []).map(nombreFr);
    if (l.length <= 1) return l.join('');
    return l.slice(0, -1).join(', ') + ' puis ' + l[l.length - 1];
  }

  // Une charge inconnue se dit, elle ne se tait pas : « le cran au-dessus ».
  // C'est le rang 4 du §10.2 rendu visible — le moteur sait qu'il faut monter,
  // il ne sait pas de combien, et il le dit plutôt que d'inventer un chiffre.
  function fragmentCharge(charge, tete, dessous) {
    if (charge !== null && charge !== undefined) return enKg(charge);
    var mot = 'le cran ' + (dessous ? 'en dessous' : 'au-dessus');
    return tete ? mot.charAt(0).toUpperCase() + mot.slice(1) : mot;
  }

  // ⚠️ L'ORDRE DES DEUX LIGNES EST UNE RÈGLE, pas un goût. La ligne majoritaire
  // passe devant : à trois séries dont deux à 130, on lit « 130 kg sur les 2
  // dernières séries » d'abord. Quand une SEULE série porte la nouvelle charge,
  // le palier reprend la tête et le test se dit « puis … en dernière série ».
  // Sinon l'œil lit la charge du test comme celle de toute la séance.
  //
  // ⚠️ JAMAIS DE POSITION ABSOLUE (ECRAN-SAISIE §3.12, 48b-5b-3). La consigne
  // ne voit que les séries qu'elle couvre ; à l'écran, une rampe ou une chauffe
  // peut les précéder. « Sur la première » tombait, au squat d'Aurélien, sur la
  // rampe à 120. On parle donc DEPUIS LA FIN : « les 2 dernières », « celle
  // d'avant », « les 3 d'avant ».
  function lignesJaunes(c) {
    if (c.etat === 'silence') return [];
    var dessous = c.etat === 'reprise_longue';
    var ligne = c.ligne, haut = c.haut;
    if (!haut) return [fragmentCharge(ligne.charge, true, dessous) + ', vise ' + ligne.vise];
    if (!ligne) return [fragmentCharge(haut.charge, true, false) + ', vise ' + haut.vise];
    if (haut.k === 1) {
      return [
        fragmentCharge(ligne.charge, true, dessous) + ', vise ' + ligne.vise,
        'puis ' + fragmentCharge(haut.charge, false, false) +
          ' en dernière série, vise ' + haut.vise
      ];
    }
    var restantes = c.n - haut.k;
    return [
      fragmentCharge(haut.charge, true, false) + ' sur les ' + haut.k + ' dernières séries, vise ' + haut.vise,
      'et ' + fragmentCharge(ligne.charge, false, dessous) +
        (restantes === 1 ? ' sur celle d\'avant' : ' sur les ' + restantes + ' d\'avant') +
        ', vise ' + ligne.vise
    ];
  }

  // §3.12 (49-U1, ECRAN-SAISIE révisé le 26/09/2026) — L'EN-TÊTE DÉCRIT LA
  // SÉANCE, plus le `n` de la consigne brute. `roles` : la disposition de la
  // consigne sur les séries de travail de la séance, dans l'ordre — `haut` pour
  // une ligne de test, `ligne` sinon (la couverture du plan de séance, §9.13
  // bis). Une routine à 3 sur un historique à 4 se dit « 130 kg sur les 2
  // dernières séries » et « 125 kg sur celle d'avant », pas « les 2 d'avant ».
  //
  // Les formes habituelles — des lignes au palier puis des tests — gardent
  // leurs phrases, mot pour mot. Une forme inhabituelle (un test déjà fait,
  // puis une série ajoutée) se dit dans l'ordre, segment par segment.
  //
  // Rend `{ jaune, segments }` : `segments` est la description STRUCTURÉE, dans
  // l'ordre de la séance — `{ role, charge, vise, nombre }` — et c'est sur
  // elle que `verifierPlan` contrôle que l'en-tête dit exactement les lignes
  // (I6). Les phrases ne lisent qu'elle.
  function enteteDeDisposition(c, roles) {
    if (!c || c.etat === 'silence') return { jaune: [], segments: [] };
    var liste = (roles || []).map(function (r) { return r === 'haut' ? 'haut' : 'ligne'; });
    var segments = [];
    liste.forEach(function (r) {
      var src = r === 'haut' ? c.haut : c.ligne;
      var der = segments[segments.length - 1];
      if (der && der.role === r) { der.nombre++; return; }
      segments.push({ role: r, charge: src ? src.charge : null, vise: src ? src.vise : null, nombre: 1 });
    });
    if (!segments.length) return { jaune: [], segments: [] };
    var a = segments[0].role === 'ligne' ? segments[0].nombre : 0;
    var b = segments[segments.length - 1].role === 'haut' ? segments[segments.length - 1].nombre : 0;
    var habituelle = segments.length === 1 || (segments.length === 2 && a > 0 && b > 0);
    if (habituelle && (a === 0 || c.ligne) && (b === 0 || c.haut)) {
      var forme = Object.assign({}, c, {
        n: a + b,
        ligne: a > 0 ? c.ligne : null,
        haut: b > 0 ? Object.assign({}, c.haut, { k: b }) : null
      });
      return { jaune: lignesJaunes(forme), segments: segments };
    }
    var dessous = c.etat === 'reprise_longue';
    var jaune = segments.map(function (s, i) {
      if (s.charge === undefined || s.vise === undefined) return null;
      var tete = i === 0;
      return (tete ? '' : 'puis ') + fragmentCharge(s.charge, tete, s.role === 'ligne' && dessous) +
        (s.nombre === 1 ? ' sur une série' : ' sur ' + s.nombre + ' séries') + ', vise ' + s.vise;
    }).filter(Boolean);
    return { jaune: jaune, segments: segments };
  }

  function phraseGrise(c) {
    var f = c.fondement || {};
    var z = zoneParCle(c.zone);
    var lo = z === null ? null : z.bas;
    var hi = z === null ? null : z.haut;
    var jour = f.date ? leJour(f.date) : '';
    var auPalier = (f.reps || []).join('-');
    var t = f.test || null;
    var duTest = t === null ? '' : 'Ton test à ' + nombreFr(t.charge) + ' du ' + leJour(t.date);
    var rate = t === null ? '' :
      croix(t.charge, t.reps) + ' le ' + leJour(t.date) + DEUX_POINTS + 'pas encore dans ta zone.';

    switch (c.etat) {
      case 'silence':
        if (c.raison === 'premiere_fois') {
          return 'Première fois ici. Ce que tu notes aujourd\'hui servira de départ.';
        }
        return 'Pas de palier le ' + jour + DEUX_POINTS + suiteFr(f.charges) + INSECABLE +
               'kg, aucune charge répétée. Rien à proposer.';

      case 'progression':
        // ⚠️ L'ANNONCE DU RETEST NE SE DIT QU'À UN SEUL CRAN. À deux crans, le
        // moteur ne sait pas encore ce qu'il retestera : promettre « on le
        // retestera » serait promettre une charge qu'il va réduire.
        if (t !== null) return rate + (f.testUnCran ? ' On le retestera au haut de ta zone.' : '');
        // La note de la série à fond REMPLACE « une de plus », elle ne s'y
        // ajoute pas : une seule phrase grise par en-tête.
        // Dite PAR SA CHARGE, jamais par son rang : « ta 2ᵉ série » comptait
        // parmi les séries du palier, pas parmi les lignes de l'écran.
        if (f.serieAFond) {
          var a = f.serieAFond;
          return 'Ta série à ' + croix(a.charge, a.reps) + ' était à ' +
                 (a.cause === 'rpe' ? 'RPE 10' : 'fond') + DEUX_POINTS +
                 'elle compte pour ' + a.comptees + '.';
        }
        return auPalier + ' le ' + jour + DEUX_POINTS + 'une de plus.';

      case 'test_propose':
        return auPalier + ' le ' + jour + ', ' +
               (f.preuve === 'haut' ? 'le haut dépassé de ' + PREUVE_DEPASSEMENT
                : f.preuve === 'facile' ? 'avec de la marge'
                : 'le haut de ta zone') + DEUX_POINTS +
               (f.preuve ? 'on teste deux crans au-dessus' : 'on teste le cran du dessus') + '.';

      case 'garde':
        if (t.niveau === lo) {
          return duTest + ' est tombé au bas de ta zone' + DEUX_POINTS +
                 'on le garde sur la dernière série.';
        }
        return duTest + ' est entré dans ta zone' + DEUX_POINTS +
               'on le garde sur la dernière série jusqu\'à ' + hi + '.';

      case 'etend':
        return duTest + (t.niveau >= hi ? ' a touché le haut de ta zone' : ' est entré dans ta zone') +
               DEUX_POINTS + 'il gagne une série.';

      // « La série restée à 125 » : l'ancien palier est dans le fondement, et
      // c'est la seule façon de la désigner sans compter les lignes.
      case 'rejoint':
        return (c.ligne ? 'Une série de plus rejoint '
                        : 'La série restée à ' + nombreFr(f.palierPrecedent) + ' rejoint ') +
               nombreFr(c.haut.charge) + '.';

      case 'attend':
        return c.n - c.haut.k === 1
          ? 'La série restée à ' + nombreFr(f.palierPrecedent) + ' rejoindra ' +
            nombreFr(c.haut.charge) + ' quand tu y feras ' + f.seuil + '.'
          : 'Les séries restées à ' + nombreFr(f.palierPrecedent) + ' rejoindront ' +
            nombreFr(c.haut.charge) + ' une à une, quand tu y feras ' + f.seuil + '.';

      case 'tout_passe':
        if (t !== null) {
          return duTest + ' a touché le haut de ta zone' + DEUX_POINTS + 'tout passe.';
        }
        return auPalier + ' le ' + jour + ', le haut de ta zone' + DEUX_POINTS +
               'tout passe à ' + nombreFr(c.haut.charge) + '.';

      case 'retest_un_cran':
        return rate + ' On reteste d\'un seul cran.';

      case 'etirement':
        return 'Ton cran ne peut pas être plus petit' + DEUX_POINTS + 'ta zone s\'étire. ' +
               'On retestera ' + nombreFr(t.charge) + ' quand tu feras ' + f.cible +
               ' à ' + nombreFr(c.ligne.charge) + '.';

      case 'retest':
        return f.cible + ' à ' + nombreFr(c.ligne.charge) + DEUX_POINTS +
               'on retente ' + nombreFr(t.charge) + '.';

      case 'reprise_courte':
        return 'On reprend à ton dernier palier, sans rep de plus.';

      // ⚠️ LA CHARGE CITÉE EST LE PALIER, pas celle de la consigne. « On reprend
      // un cran sous ton dernier palier, 125 kg » : 125 est le palier d'où l'on
      // descend, la consigne dit 122,5. Et RIEN sur la durée de l'absence
      // (CADRAGE §3.1 bis).
      case 'reprise_longue':
        // §9.9 (delta 49-13) — le cran d'en dessous descendait de plus de
        // 10 % : la consigne garde le palier, et ne dit plus « un cran sous ».
        if (c.ligne && memeCharge(nombre(c.ligne.charge), nombre(c.palier))) {
          return 'On reprend à ton dernier palier, sans rep de plus.';
        }
        return 'On reprend un cran sous ton dernier palier, ' + enKg(c.palier) +
               '. Le test te ramènera à ' + nombreFr(c.palier) + '.';

      // Le « 3 » se lit sur la table du rangement, il ne se recopie pas : sous
      // la première borne, il n'y a plus de zone (§9.1.2).
      case 'bord':
        return 'Sous ' + (RANGEMENT[0].jusqua + 1) + ' reps, pas une de plus' + DEUX_POINTS +
               'le cran au-dessus, aux mêmes reps.';
    }
    return '';
  }

  // ── §3.10 — LA FEUILLE « POURQUOI », UNE FONCTION PURE ───────────────────
  //
  // ⚠️ ELLE NE RECALCULE RIEN. Chaque chiffre qu'elle énonce vient du
  // fondement (§9.13) : la dernière séance série par série, l'habitude, la
  // zone figée, le test et son niveau. Une feuille qui rejouerait une règle du
  // moteur finirait par expliquer autre chose que ce que l'en-tête affiche —
  // c'est le §2 undecies appliqué à la frontière la plus visible de l'app.
  //
  // Rend sept champs, `null` là où la ligne n'a pas lieu d'être :
  // `{ seance, zone, palier, etat, donc, reglage, fin }`.

  // ⚠️ LES LIBELLÉS DES RYTHMES VIVENT DANS `profil.js`, et on va les y lire —
  // tardivement, sans repli, comme `THPalier` et `THModele`. Les recopier ici
  // ferait deux tables pour un seul réglage : le jour où l'une change, l'écran
  // Profil et la feuille « Pourquoi » ne diraient plus la même chose, et rien
  // ne le signalerait. `profil.js` charge après `moteur.js` (index.html) mais
  // la lecture n'a lieu qu'au rendu.
  function Profil() { return racine.THProfil; }

  function libelleRythme(cle) {
    var l = Profil().RYTHMES;
    for (var i = 0; i < l.length; i++) if (l[i].cle === cle) return l[i].libelle;
    return null;
  }

  // Le niveau d'un test, dit en français contre sa zone. Les quatre bornes du
  // §9.2, et rien d'autre : sous le bas, au bas, entre, au haut.
  function niveauDuTest(niveau, z) {
    if (z === null || niveau === null) return null;
    if (niveau < z.bas) return 'pas encore dans ta zone';
    if (niveau === z.bas) return 'au bas de ta zone';
    if (niveau >= z.haut) return 'au haut de ta zone';
    return 'dans ta zone';
  }

  // « dans ta zone », « le haut de ta zone » — la même échelle que ci-dessus,
  // dite au milieu d'une phrase plutôt qu'en étiquette de ligne.
  //
  // ⚠️ DEUX CAS, PAS QUATRE, ET C'EST STRUCTUREL. Cette phrase ne sert qu'à
  // `etend` et à `tout_passe`, et ni l'un ni l'autre n'existe sous le bas de
  // la zone : au bas le test est GARDÉ (`if (lvl === lo) return rendre('garde'
  // …)`), en dessous il est raté. Écrire « le bas de ta zone » ici, c'était
  // une branche qu'aucune mutation ne pouvait tuer — mesuré le 20/09 — donc
  // un garde-fou mort, qui a l'air de protéger et ne protège rien.
  function niveauDansPhrase(niveau, z) {
    if (z === null || niveau === null) return null;
    return niveau >= z.haut ? 'le haut de ta zone' : 'dans ta zone';
  }

  var ORIGINES_CHAUFFE = { chauffe: true, chauffe_probable: true };
  var ROLES_LIGNE = {
    degressive: 'dégressive, ne compte pas',
    descente_choisie: 'descente, ne compte pas',
    echec: 'série arrêtée, ne compte pas'
  };

  // La dernière séance, telle que la feuille la relit : les chauffes en UNE
  // ligne — elles ne comptent pas, les détailler noierait ce qui compte — puis
  // chaque autre série avec son rôle.
  function seanceDuPourquoi(c) {
    var f = c.fondement || {};
    if (!f.seance) return null;
    var z = c.etat === 'silence' ? null : zoneParCle(c.zone);
    var t = f.test || null;
    var Pv = f.palierPrecedent === undefined ? null : f.palierPrecedent;
    var chauffes = [], lignes = [];
    f.seance.forEach(function (s) {
      if (ORIGINES_CHAUFFE[s.origine] === true) { chauffes.push(nombreFr(s.charge_kg)); return; }
      var role = '';
      if (ROLES_LIGNE[s.origine]) role = ROLES_LIGNE[s.origine];
      else if (s.role === 'exploration') {
        var n = t !== null && nombre(s.charge_kg) === t.charge ? t.niveau : null;
        var dit = niveauDuTest(n, z);
        role = dit === null ? '' : 'test, ' + dit;
      } else if (Pv !== null && nombre(s.charge_kg) === Pv &&
                 (s.role === 'rampe' || s.role === 'travail')) {
        role = 'restée à ' + nombreFr(s.charge_kg);
      } else if (s.role === 'rampe') role = 'rampe, ne compte pas';
      else if (s.role === 'palier') role = 'au palier';
      lignes.push({ texte: croix(s.charge_kg, s.reps), role: role });
    });
    if (chauffes.length) {
      lignes.unshift({
        texte: chauffes.join(', '),
        role: chauffes.length > 1 ? 'chauffes, ne comptent pas' : 'chauffe, ne compte pas'
      });
    }
    return { date: leJour(f.date), lignes: lignes };
  }

  // La cause du cran d'effort sur le test, lue sur la série elle-même : la
  // phrase dit « à RPE 10 » ou « à fond », et les deux ne se devinent pas.
  function causeDuTest(c) {
    var f = c.fondement || {};
    var t = f.test || null;
    if (t === null || !f.seance) return 'ressenti';
    for (var i = 0; i < f.seance.length; i++) {
      var s = f.seance[i];
      if (s.role === 'exploration' && nombre(s.charge_kg) === t.charge) {
        return Palier().cranEffort(s.rpe) !== null ? 'rpe' : 'ressenti';
      }
    }
    return 'ressenti';
  }

  // « Ton test à 130 a fait 5 à RPE 10, compté 4 » — ce qui a été fait, puis ce
  // qui a été compté, et seulement quand les deux diffèrent (§17.4).
  function faitDuTestEnPhrase(c) {
    var t = c.fondement.test;
    var dit = 'Ton test à ' + nombreFr(t.charge) + ' a fait ' + nombreFr(t.reps);
    if (t.niveau !== null && t.niveau < t.reps) {
      dit += (causeDuTest(c) === 'rpe' ? ' à RPE 10' : ' à fond') +
             ', compté ' + nombreFr(t.niveau);
    }
    return dit;
  }

  // ⚠️ « TOUCHE L'ÉTIQUETTE POUR LA CHANGER » TERMINE TOUTES LES FORMES
  // (48b-7). La ligne de zone en a trois — choisie, figée par un étirement,
  // déduite — et la porte est la même dans les trois : la dire dans deux cas
  // sur trois, c'est laisser croire que la zone n'est pas toujours corrigible.
  var TOUCHE_ETIQUETTE = ' Touche l\'étiquette pour la changer.';

  function zoneDuPourquoi(c) {
    var z = zoneParCle(c.zone);
    if (z === null) return null;
    var f = c.fondement || {};
    var tete = 'Ta zone' + DEUX_POINTS + z.libelle + ', de ' + z.bas + ' à ' + z.haut + ' reps';

    // Choisie : elle se dit d'abord, et ce que les séances auraient donné
    // ensuite — mais SEULEMENT si c'est autre chose. « Ce serait Lourd » sous
    // une zone Lourd choisie ne dit rien à personne, et sous 3 reps
    // d'habitude il n'y a pas de zone à citer du tout.
    if (f.correction) {
      var d = zoneParCle(f.correction.zoneDeduite);
      if (d === null || d.cle === z.cle || !f.habitude) {
        return tete + ', choisie par toi.' + TOUCHE_ETIQUETTE;
      }
      return tete + ', choisie par toi. D\'après tes ' + f.habitude.seances +
             ' dernières séances, ce serait ' + d.libelle + DEUX_POINTS +
             'tu fais ' + f.habitude.valeur + ' reps d\'habitude.' + TOUCHE_ETIQUETTE;
    }
    if (f.zoneFigee) {
      return tete + ', celle de ton test du ' + leJour(f.zoneFigee.date) + DEUX_POINTS +
             'elle ne bouge pas pendant que ta zone s\'étire.' + TOUCHE_ETIQUETTE;
    }
    if (!f.habitude) return tete + '.' + TOUCHE_ETIQUETTE;
    return tete + '. Sur tes ' + f.habitude.seances + ' dernières séances, tu fais ' +
           f.habitude.valeur + ' reps d\'habitude.' + TOUCHE_ETIQUETTE;
  }

  function palierDuPourquoi(c) {
    if (c.palier === null || c.palier === undefined) return null;
    var f = c.fondement || {};
    var dit = 'Ton palier est ' + enKg(c.palier) + ', validé à ' + c.niveau + DEUX_POINTS +
              'tes séries au palier ont fait ' + suiteFr(f.reps) + '.';
    if (f.serieAFond) {
      var a = f.serieAFond;
      dit += ' Ta série à ' + croix(a.charge, a.reps) + ' était à ' +
             (a.cause === 'rpe' ? 'RPE 10' : 'fond') + DEUX_POINTS +
             'elle compte pour ' + a.comptees + '.';
    }
    return dit;
  }

  function etatDuPourquoi(c, reglage) {
    var f = c.fondement || {};
    var z = zoneParCle(c.zone);
    var t = f.test || null;
    var rate = t === null ? '' :
      'Ton test à ' + nombreFr(t.charge) + ' a fait ' + nombreFr(t.reps) +
      DEUX_POINTS + 'pas encore dans ta zone.';

    switch (c.etat) {
      case 'silence':
        return c.raison === 'premiere_fois'
          ? 'Rien avant aujourd\'hui' + DEUX_POINTS + 'ce que tu notes servira de départ.'
          : 'Ta dernière séance n\'a répété aucune charge sur deux séries' + DEUX_POINTS +
            'sans palier, le moteur n\'a rien à proposer.';

      case 'progression':
        return (t !== null ? rate + ' ' : '') +
          'Ton palier n\'est pas encore au haut de ta zone' + DEUX_POINTS +
          'une rep de plus sur chaque série.';

      case 'test_propose':
        var tete = reglage === 'prudent'
          ? 'Toutes tes séries ont touché le haut, deux séances de suite'
          : (c.niveau !== null && z !== null && c.niveau >= z.haut
              ? 'Ton palier a touché le haut de ta zone'
              : 'Une de tes séries a touché le haut de ta zone');
        var dit = tete + DEUX_POINTS + 'on teste le cran du dessus sur la dernière série.';
        if (f.preuve) {
          var ecart = c.haut.charge === null ? null : c.haut.charge - c.ligne.charge;
          dit += ' ' + (f.preuve === 'haut'
              ? 'Tu as dépassé le haut de ' + PREUVE_DEPASSEMENT + ' reps'
              : 'Tu avais de la marge') +
            DEUX_POINTS + 'deux crans, ' + enKg(ecart) + ', soit ' +
            nombreFr(Math.round(ecart / c.ligne.charge * 1000) / 10) + INSECABLE + '% de ta charge, ' +
            'sous la limite de ' + Math.round(MARGE_DOUBLE_SAUT * 100) + INSECABLE + '%.';
        }
        return dit;

      case 'garde':
        if (t.niveau === z.bas) {
          return faitDuTestEnPhrase(c) + ', le bas de ta zone' + DEUX_POINTS + 'il tient. ' +
                 'On le garde sur la dernière série, et quand il fera ' + (z.bas + 1) +
                 ', il gagnera une série.';
        }
        return faitDuTestEnPhrase(c) + ', dans ta zone. En Prudent, il reste sur la dernière ' +
               'série jusqu\'à ' + z.haut + ' ; alors la série d\'avant le rejoindra.';

      case 'etend':
        return faitDuTestEnPhrase(c) + ', ' + niveauDansPhrase(t.niveau, z) + DEUX_POINTS +
               'il gagne une série. La nouvelle charge gagne tes séries de la dernière vers ' +
               'la première, une par séance.';

      case 'tout_passe':
        var fin = DEUX_POINTS + 'en Franc, toutes tes séries passent à ' +
                  nombreFr(c.haut.charge) + '.';
        if (t !== null) {
          return faitDuTestEnPhrase(c) + ', ' + niveauDansPhrase(t.niveau, z) + fin;
        }
        return 'Tes séries à ' + nombreFr(c.haut.charge) + ' ont touché le haut de ta zone' + fin;

      case 'rejoint':
        return nombreFr(c.haut.charge) + ' a pris la majorité de tes séries' + DEUX_POINTS +
               (c.ligne
                 ? 'une série de plus, restée à ' + nombreFr(f.palierPrecedent) + ', la rejoint.'
                 : 'la série restée à ' + nombreFr(f.palierPrecedent) + ' la rejoint.');

      case 'attend':
        return nombreFr(c.haut.charge) + ' a pris la majorité de tes séries. ' +
               (c.n - c.haut.k === 1
                 ? 'La série restée à ' + nombreFr(f.palierPrecedent) + ' la rejoindra quand tu feras '
                 : 'Les séries restées à ' + nombreFr(f.palierPrecedent) +
                   ' la rejoindront une à une, quand tu feras ') +
               f.seuil + ' à ' + nombreFr(c.haut.charge) + '.';

      case 'retest_un_cran':
        return rate + ' Ton palier est au haut' + DEUX_POINTS +
               'on reteste d\'un seul cran, à ' + nombreFr(c.haut.charge) + '.';

      case 'etirement':
        return 'Ton test à ' + nombreFr(t.charge) + ' a fait ' + nombreFr(t.reps) + DEUX_POINTS +
               'pas encore dans ta zone, et ton cran ne peut pas être plus petit. ' +
               'Ta zone s\'étire' + DEUX_POINTS + 'ton palier vise une rep de plus au-delà ' +
               'du haut, jusqu\'à ' + f.cible + ', les ' + z.haut + ' du haut plus les ' +
               (f.cible - z.haut) + ' perdues au test. Alors on retestera ' +
               nombreFr(t.charge) + '.';

      case 'retest':
        return 'Tu as regagné les reps perdues au test, ' + f.cible + ' à ' +
               nombreFr(c.ligne.charge) + DEUX_POINTS + 'on retente ' + nombreFr(t.charge) + '.';

      case 'reprise_courte':
        return 'On reprend à ton dernier palier, sans rep de plus. ' +
               'La progression repart à la séance suivante.';

      case 'reprise_longue':
        if (c.ligne && memeCharge(nombre(c.ligne.charge), nombre(c.palier))) {
          return 'On reprend à ton dernier palier, sans rep de plus' + DEUX_POINTS +
                 'le cran d\'en dessous descendait de plus de 10' + INSECABLE + '%.';
        }
        return 'On reprend un cran sous ton dernier palier, ' + enKg(c.palier) +
               ', sans rep de plus. Le test te ramènera à ' + nombreFr(c.palier) + '.';

      case 'bord':
        return 'Tu travailles sous ' + (RANGEMENT[0].jusqua + 1) + ' reps' + DEUX_POINTS +
               'le moteur ne demande jamais une rep de plus, ' +
               'il propose le plus petit cran de charge.';
    }
    return '';
  }

  function pourquoiConsigne(consigne, reglage) {
    if (!consigne) return null;
    var jaune = lignesJaunes(consigne);
    var muet = consigne.etat === 'silence';
    return {
      seance: seanceDuPourquoi(consigne),
      zone: muet ? null : zoneDuPourquoi(consigne),
      palier: muet ? null : palierDuPourquoi(consigne),
      etat: etatDuPourquoi(consigne, reglage || 'normal'),
      donc: jaune.length ? 'Donc ' + jaune.join(', ') + '.' : null,
      reglage: muet ? null
        : 'Ton réglage' + DEUX_POINTS + libelleRythme(reglage || 'normal') +
          '. Il se change dans Profil.',
      fin: 'Tu veux faire autre chose ? Tape-le, ta saisie fait foi.'
    };
  }

  // ── §3.9 — LE CONSTAT DE FIN DE BLOC ─────────────────────────────────────
  //
  // Quand toutes les séries de travail d'un exercice sont validées, l'en-tête
  // passe de la consigne au constat : ce qui s'est passé aujourd'hui, puis ce
  // qui vient. Le retour immédiat soutient la performance et la motivation
  // (méta-analyse de Weakley et coll., 2023).
  //
  // ⚠️ IL NE RECALCULE AUCUNE RÈGLE, ET C'EST TOUTE SA CONSTRUCTION. Il se lit
  // entre DEUX consignes que le moteur a déjà rendues :
  //
  //   · `consigneAvant` — celle affichée pendant la séance, qui décrit la fois
  //     d'avant ;
  //   · `consigneApres` — la même fonction, sur l'historique PLUS la séance du
  //     jour, avec une coupure après son début.
  //
  // Tout ce qu'il dit sort de leurs deux fondements. Rejouer ici une règle du
  // §9 — « le test est-il dans la zone ? », « le palier a-t-il monté ? » —
  // donnerait deux juges pour une même séance, et le jour où l'un change,
  // l'écran dirait une chose et le lendemain l'autre.
  function constatDe(consigneAvant, consigneApres, reglage, cranSuivant) {
    if (!consigneAvant || !consigneApres) return null;
    var ap = consigneApres.fondement || {};
    var av = consigneAvant.fondement || {};
    var z = zoneParCle(consigneApres.zone);
    var repsDuJour = (ap.reps || []).join('-');
    var testDuJour = ap.test || null;

    // Ce qui compte comme « fait aujourd'hui » : le niveau validé, sauf en
    // Franc, dont le déclencheur est UNE série — le constat se lit donc sur la
    // meilleure, comme la règle qui le suit (§9.8).
    var faitAujourdHui = reglage === 'franc'
      ? (ap.reps || []).reduce(function (m, r) { return r !== null && r > m ? r : m; }, 0)
      : consigneApres.niveau;

    return { verdict: verdictDuJour(consigneAvant, consigneApres, z, repsDuJour,
                                    testDuJour, faitAujourdHui, av, ap),
             suite: suiteDuJour(consigneAvant, consigneApres, z, reglage,
                                faitAujourdHui, cranSuivant) };
  }

  // Ce qui s'est passé. L'ordre des cas EST la règle : le silence d'abord — il
  // n'y a rien à raconter d'autre —, puis ce que la consigne d'avant attendait,
  // puis ce que la séance a donné.
  // ── §9.11 — CE QUE LE MOTEUR ÉCRIT DANS `predictions` (48c) ──────────────
  //
  // L'étage des déductions : ce que le moteur a proposé, puis ce qui s'est
  // réellement produit. C'est ce qui a manqué à la v1, où personne ne savait
  // que les 4 035 kcal et les ratios « Critique » étaient faux avant la
  // vérification sur appareil.
  //
  // ⚠️ UNE LIGNE PAR SÉRIE PROPOSÉE, parce que `set_observe` n'en désigne
  // qu'une. Une consigne de trois séries écrit trois lignes, chacune avec son
  // rang — les `n − k` premières à `ligne`, les `k` dernières à `haut`, comme
  // le plan du fantôme (§9.13, `Seance.couvertureDe`).
  //
  // ⚠️ LE PARI, CE SONT LES REPS. La charge est une prescription qu'on suit ou
  // non, pas une prédiction : elle vit dans le fondement, où elle sert à
  // l'appariement. Les bornes de la zone diront plus tard combien de fois le
  // moteur a visé dedans.
  //
  // Pure : `app.js` fabrique l'identifiant, l'instant et le propriétaire, et
  // ne recalcule aucune règle. Rien quand le moteur se tait.
  //
  // ⚠️ 49-C (26/09/2026) : PLUS APPELÉE PAR L'APP. Les paris ne s'écrivent
  // plus à l'ouverture mais à la validation de chaque série (`lignesDePari`),
  // et la consigne ne couvre plus « n séries » mais celles de la séance en
  // cours (§9.13). Gardée telle quelle : ses tests figent la forme d'un pari de
  // consigne, que `lignesDePari` reprend à l'identique pour la révision 0.
  function lignesDePrediction(consigne, options) {
    var o = options || {};
    if (!consigne || consigne.etat === 'silence' || !consigne.n) return [];
    var z = zoneParCle(consigne.zone);
    var k = consigne.haut && consigne.haut.k ? consigne.haut.k : 0;
    var sortie = [];
    for (var i = 1; i <= consigne.n; i++) {
      var source = i > consigne.n - k ? consigne.haut : consigne.ligne;
      // Une consigne qui couvre n séries sans porter la ligne correspondante
      // n'a rien à parier : on n'invente pas une valeur pour remplir un rang.
      if (!source) return [];
      sortie.push({
        module: MODULE_CONSIGNE,
        exercise_slug: o.slug === undefined ? null : o.slug,
        grandeur: 'reps',
        valeur_predite: source.vise === undefined ? null : source.vise,
        borne_basse: z ? z.bas : null,
        borne_haute: z ? z.haut : null,
        fondement: {
          rang: i,
          charge: source.charge === undefined ? null : source.charge,
          etat: consigne.etat,
          zone: consigne.zone === undefined ? null : consigne.zone,
          reglage: o.reglage === undefined ? null : o.reglage,
          palier: consigne.palier === undefined ? null : consigne.palier,
          niveau: consigne.niveau === undefined ? null : consigne.niveau,
          seance: o.seance === undefined ? null : o.seance
        }
      });
    }
    return sortie;
  }

  // ── §9.11 (48c-2) — L'IDENTIFIANT EST UNE FONCTION DE CE QUE LA LIGNE EST ─
  //
  // ⚠️ APRÈS LA PREMIÈRE SÉANCE RÉELLE : le squat a été noté DEUX FOIS, six
  // lignes au lieu de trois, même `emise_a` à la milliseconde. Une seule page
  // ne le peut pas — la marque « déjà noté » se pose avant toute attente. Il a
  // donc fallu deux réalités JavaScript dont les deux LECTURES du magasin
  // local ont précédé les deux ÉCRITURES, et aucune garde en mémoire ne ferme
  // cette course-là.
  //
  // Ce qui la ferme est ailleurs : à DESTINATION. Deux instances qui calculent
  // la même ligne calculent le même identifiant, et l'insertion qui ignore les
  // doublons fait du second envoi un non-événement. C'est déjà la doctrine de
  // la file (`attente.js` : « l'app fabrique les identifiants elle-même, et
  // l'envoi devient une réécriture IDEMPOTENTE ») — la prédiction y rentre.
  //
  // SHA-256 des trois faits qui définissent la ligne, mis en forme d'UUID
  // valide : version 5 (un nom, pas un hasard) et variante RFC 4122. Sans
  // `crypto.subtle` — contexte non sécurisé —, on rend `null` et l'appelant
  // retombe sur un identifiant aléatoire : le comportement d'avant, pas pire.
  //
  // §9.11 (49-R1) — LA RÉVISION. Une consigne revue en séance est un nouveau
  // pari, à côté du premier : la révision entre dans le nom. ⚠️ LA RÉVISION 0
  // GARDE LA FORMULE À TROIS FAITS, octet pour octet — aucun identifiant déjà
  // en base ne change (test à valeur figée). Seul un entier ≥ 1 ajoute un
  // quatrième fait ; `undefined`, `null` et 0 ne le font jamais, sans quoi
  // « |0 » changerait l'identifiant de tous les paris d'ouverture.
  async function idDePrediction(seance, slug, rang, revision) {
    var c = racine.crypto;
    if (!c || !c.subtle || typeof c.subtle.digest !== 'function') return null;
    if (typeof racine.TextEncoder !== 'function') return null;
    var nom = String(seance) + '|' + String(slug) + '|' + String(rang);
    var rev = nombre(revision);
    if (rev !== null && rev >= 1 && Math.floor(rev) === rev) nom += '|' + String(rev);
    var somme = await c.subtle.digest('SHA-256', new racine.TextEncoder().encode(nom));
    var o = new Uint8Array(somme).slice(0, 16);
    o[6] = (o[6] & 0x0f) | 0x50;
    o[8] = (o[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(o, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
           h.slice(16, 20) + '-' + h.slice(20);
  }

  // ── §9.11 (48c-2) — CE QUE LA SÉRIE FAITE DIT DE LA PRÉDICTION ───────────
  //
  // Deux décisions, et elles sont SÉPARÉES — c'est toute la correction du
  // 21/09. À l'adduction, le moteur proposait « le cran au-dessus » sans
  // chiffre (le cran de la machine étant inconnu) : avec un appariement strict
  // sur la charge, cette ligne ne pouvait JAMAIS être observée.
  //
  //   · RELIER — toujours, dès que la série du rang est validée. Une
  //     exploration dit quelque chose ; elle ne doit pas disparaître de la
  //     table.
  //   · COMPTER — seulement si la consigne a été suivie : même charge ; ou,
  //     charge proposée inconnue, n'importe quelle charge STRICTEMENT au-dessus
  //     du palier. Comparer « vise 4 à 130 » à « 3 à 135 » ne dirait rien de la
  //     visée du moteur.
  //
  // Le palier vient du fondement de la ligne, jamais d'un recalcul : la
  // prédiction porte ses propres faits (§9.13).
  function observationDe(fondement, fait) {
    var f = fondement || {}, x = fait || {};
    if (!x.enBase) return { set_observe: null, valeur_observee: null };
    var palier = nombre(f.palier);
    var faite = nombre(x.charge);
    // §9.11 (49-R2) — UNE PROPOSITION À DEUX CHARGES est suivie par l'une ou
    // l'autre. Chaque pari se juge sur SES charges, jamais sur celles d'un
    // autre pari du même rang.
    var liste = Array.isArray(f.charges) && f.charges.length ? f.charges : [f.charge];
    var suivie = faite !== null && liste.some(function (c) {
      var p = nombre(c);
      return p !== null ? auCentieme(faite) === auCentieme(p)
        : (palier !== null && faite > palier);
    });
    var reps = x.reps === undefined ? null : x.reps;
    return {
      set_observe: x.id || null,
      valeur_observee: suivie ? reps : null
    };
  }

  // ── §3.9 (48b-6b-2) — LA CHARGE DE TEST QUI GAGNE DES SÉRIES ─────────────
  //
  // Un FAIT, lu sur les deux séances, jamais une règle du §9 rejouée : la
  // charge la plus lourde du jour est au-dessus de l'ancien palier, et elle
  // couvre PLUS de séries qu'à la séance d'avant, qui en portait déjà au
  // moins une. C'est l'étape de l'échelle en train de se franchir.
  //
  // ⚠️ « AU MOINS UNE LA FOIS D'AVANT » EST LA MOITIÉ QUI DISCRIMINE. Sans
  // elle, une charge essayée pour la première fois sur deux séries se dirait
  // « ta nouvelle charge tient » alors que rien ne s'étend : il n'y avait pas
  // de barreau en dessous.
  //
  // Les VOTANTES, pas les retenues : une exploration au-dessus du palier
  // compte (c'est précisément elle qui s'étend), la rampe d'échauffement non.
  function extensionDe(av, ap, palierAvant) {
    if (palierAvant === null) return null;
    var jour = parRole((ap || {}).seance, ROLES_VOTANTS);
    if (!jour.length) return null;
    var C = null;
    jour.forEach(function (s) {
      var c = nombre(s.charge_kg);
      if (c !== null && (C === null || c > C)) C = c;
    });
    if (C === null || C <= palierAvant) return null;
    var aC = jour.filter(function (s) { return nombre(s.charge_kg) === C; });
    var avantC = parRole((av || {}).seance, ROLES_VOTANTS).filter(function (s) {
      return nombre(s.charge_kg) === C;
    });
    if (!avantC.length || avantC.length >= aC.length) return null;
    return { charge: C, series: aC, k: aC.length, toutes: aC.length === jour.length,
             niveau: niveauValide(aC) };
  }

  // « 4-4 à 130 : ta nouvelle charge tient sur 2 séries, dans ta zone. »
  //
  // La zone décide de la forme, le compte est toujours dit. Sous le bas, rien
  // ne « tient » encore : la phrase constate le nombre de séries et s'arrête.
  // Sans zone connue (§9.1.2, sous 3 reps d'habitude), la clause de zone tombe
  // plutôt que d'écrire un mot que le moteur n'a pas.
  function phraseExtension(e, z) {
    var tete = e.series.map(function (s) { return nombreFr(s.reps); }).join('-') +
      ' à ' + nombreFr(e.charge) + DEUX_POINTS;
    var combien = e.toutes ? 'toutes tes séries' : e.k + ' séries';
    var dit = niveauDuTest(e.niveau, z);
    if (z !== null && e.niveau !== null && e.niveau < z.bas) {
      return tete + 'sur ' + combien + ', ' + dit + '.';
    }
    if (e.toutes) return tete + 'ta nouvelle charge tient sur toutes tes séries.';
    return tete + 'ta nouvelle charge tient sur ' + combien + (dit ? ', ' + dit : '') + '.';
  }

  function verdictDuJour(cAvant, cApres, z, repsDuJour, t, fait, av, ap) {
    // Aucune charge répétée : il n'y a pas de palier, donc pas de progrès à
    // mesurer. On le dit sans le reprocher.
    if (cApres.etat === 'silence') {
      return 'Pas de palier aujourd\'hui' + DEUX_POINTS + 'rien de répété sur deux séries.';
    }
    var P = nombreFr(cApres.palier);
    if (cAvant.etat === 'silence') return 'Premier repère' + DEUX_POINTS + repsDuJour + ' à ' + P + '.';
    if (cAvant.etat === 'reprise_courte' || cAvant.etat === 'reprise_longue') {
      return 'Reprise faite' + DEUX_POINTS + repsDuJour + ' à ' + P + '.';
    }
    // ⚠️ L'ÉTAPE DE L'ÉCHELLE QUI RÉUSSIT, AVANT LE TEST DU JOUR (48b-6b-2).
    // C'est le trou qu'a trouvé la vérification sur appareil : au squat, 125
    // × 5 puis 130 × 4 et 130 × 4 — exactement la consigne — donnaient « Pas
    // encore : 4-4 à 130 », parce que le NOUVEAU palier (130, niveau 4) se
    // comparait à l'ANCIEN (125, niveau 5). Arithmétiquement vrai,
    // sportivement faux : l'échelle a monté d'un barreau.
    var e = extensionDe(av, ap, nombre(cAvant.palier));
    if (e !== null) return phraseExtension(e, z);
    // ⚠️ UNE SÉANCE PLUS LÉGÈRE NE SE JUGE PAS. Descendre de charge est une
    // décision, pas un échec : le constat la note et s'arrête là (CADRAGE §2
    // terdecies — le moteur ne commente jamais ce qu'il n'a pas demandé).
    var palierAvant = nombre(cAvant.palier);
    if (palierAvant !== null && nombre(cApres.palier) !== null &&
        nombre(cApres.palier) < palierAvant) {
      return 'Aujourd\'hui' + DEUX_POINTS + repsDuJour + ' à ' + P + '.';
    }
    // Un test aujourd'hui : c'est lui qu'on raconte, il porte la décision.
    if (t !== null) {
      var dit = niveauDuTest(t.niveau, z);
      if (z !== null && t.niveau !== null && t.niveau < z.bas) {
        return croix(t.charge, t.reps) + DEUX_POINTS + dit + '.';
      }
      // La fois d'avant n'avait de test que si c'était LA MÊME CHARGE : sinon
      // « 3 reps le 13 sept. » parlerait d'autre chose.
      var avant = av.test && av.test.charge === t.charge ? av.test : null;
      return enKg(t.charge) + DEUX_POINTS +
        (avant ? nombreFr(avant.reps) + ' reps le ' + leJour(avant.date) + ', ' : '') +
        nombreFr(t.reps) + ' aujourd\'hui, ' + dit + '.';
    }
    // Pas de test : le palier a-t-il gagné une rep ? On compare au NIVEAU de la
    // consigne d'avant, celui qu'elle a elle-même calculé.
    var nivAvant = nombre(cAvant.niveau);
    if (nivAvant !== null && fait !== null && fait > nivAvant) {
      var haut = z !== null && fait >= z.haut ? ', ' + niveauDansPhrase(fait, z) : '';
      return enKg(cApres.palier) + DEUX_POINTS + nivAvant + ' reps le ' + leJour(av.date) +
             ', ' + fait + ' aujourd\'hui' + haut + '.';
    }
    return 'Pas encore' + DEUX_POINTS + repsDuJour + ' à ' + P + '.';
  }

  // Ce qui vient. La consigne d'après le dit déjà en jaune : on la reprend
  // telle quelle plutôt que de la réécrire.
  function suiteDuJour(cAvant, cApres, z, reglage, fait, cranSuivant) {
    if (cApres.etat === 'silence') return null;
    var jaune = lignesJaunes(cApres).join(', ');
    var prochaine = 'Prochaine séance' + DEUX_POINTS + jaune + '.';

    if (cApres.etat === 'etirement') {
      return 'Ton cran ne peut pas être plus petit' + DEUX_POINTS + 'ta zone s\'étire. ' +
             prochaine + ' On retestera ' + nombreFr(cApres.fondement.test.charge) +
             ' quand tu feras ' + cApres.fondement.cible + ' à ' + nombreFr(cApres.ligne.charge) + '.';
    }
    if (cApres.etat === 'retest_un_cran') return prochaine + ' On reteste d\'un seul cran.';

    if (cApres.etat === 'progression') {
      var nivAvant = nombre(cAvant.niveau);
      // Rien de gagné : la cible ne bouge pas, et on le dit comme tel plutôt
      // que d'annoncer un manque qui n'a pas changé depuis la dernière fois.
      if (nivAvant !== null && fait !== null && fait <= nivAvant) {
        return 'Même cible la prochaine fois' + DEUX_POINTS + jaune + '.';
      }
      // ⚠️ PRUDENT NE COMPTE PAS LES REPS QUI MANQUENT. Son déclencheur
      // demande TOUTES les séries au haut, DEUX séances de suite : « il te
      // manque une rep » y serait faux la moitié du temps — il en manquerait
      // une, puis une séance entière. La phrase générale ne promet rien.
      if (reglage !== 'prudent' && z !== null && fait !== null && fait < z.haut) {
        var manque = z.haut - fait;
        return 'Il te manque ' + (manque === 1 ? 'une rep' : manque + ' reps') +
               ' pour tester ' + (cranSuivant === null || cranSuivant === undefined
                 ? 'le cran au-dessus' : nombreFr(cranSuivant)) + '.';
      }
    }
    return prochaine;
  }

  // ── §3.8 — L'ÉTIQUETTE DE ZONE ───────────────────────────────────────────
  //
  // « Lourd 3-5 » — le libellé de la zone et ses bornes, ou `null`. C'est la
  // table `ZONES` qui les donne : l'écran ne connaît aucune zone, il affiche
  // ce qu'on lui rend. Rien quand la consigne n'a pas de zone — le silence du
  // moteur et la règle de bord (§9.1.2), où il n'y a plus de zone du tout.
  //
  // Pendant un étirement, `consigne.zone` EST déjà la zone figée : elle se
  // calcule sur l'habitude gelée (§9.7). L'étiquette n'a rien à en savoir.
  function etiquetteZone(consigne) {
    if (!consigne) return null;
    var z = zoneParCle(consigne.zone);
    return z === null ? null : z.libelle + ' ' + z.bas + '-' + z.haut;
  }

  // `{ jaune, gris }` : zéro, une ou deux lignes jaunes, et UNE phrase grise.
  function libellesConsigne(consigne) {
    if (!consigne) return { jaune: [], gris: '' };
    return { jaune: lignesJaunes(consigne), gris: phraseGrise(consigne) };
  }

  // ── §9.13 — LE PONT DEPUIS `analyser`, ET LA CONSIGNE D'UN EXERCICE ──────
  //
  // `analyser` ne connaît pas de rôle « palier » : une série au palier y est
  // une série `travail` à la charge du palier. Le contrat de `consignePour`,
  // lui, les distingue — et sans ce pont, la consigne ne verrait JAMAIS le
  // palier. UNE SEULE FONCTION fait la traduction, dans l'ordre des séries de
  // la séance (`r.series` est déjà l'ordre de `trier`).
  //
  //   travail à la charge du palier → palier
  //   autre travail                 → travail
  //   exploration, rampe            → tels quels
  //   chauffe, chauffe_probable, degressive, descente_choisie, echec → autre
  //   null (séance hors moteur ou sans charge : `sortie` avant tout marquage) → autre
  var ROLES_TELS_QUELS = { exploration: true, rampe: true };

  function seanceDuContrat(debut, resultat) {
    var r = resultat || {};
    var P = nombre(r.palier);
    var series = (r.series || []).map(function (d) {
      var s = (d && d.serie) || {};
      var role;
      if (d && d.role === 'travail') {
        role = (P !== null && nombre(s.charge_kg) === P) ? 'palier' : 'travail';
      } else if (d && Object.prototype.hasOwnProperty.call(ROLES_TELS_QUELS, d.role)) {
        role = d.role;
      } else {
        role = 'autre';
      }
      // ⚠️ `origine` EST LE RÔLE D'`analyser`, GARDÉ TEL QUEL (48b-6a). Le
      // contrat résume six rôles en `autre` — c'est ce qu'il lui faut pour
      // décider. La feuille « Pourquoi », elle, doit DIRE lequel : « chauffes,
      // ne comptent pas » et « dégressive, ne compte pas » sont deux phrases
      // différentes, et les distinguer après coup serait rejouer `analyser`.
      return { charge_kg: s.charge_kg, reps: s.reps, rpe: s.rpe, ressenti: s.ressenti,
               role: role, origine: d && d.role === undefined ? null : d.role };
    });
    return { debut: debut, palier: r.palier === undefined ? null : r.palier, series: series };
  }

  // Le pont, pour un lot de séances d'un exercice. Extrait de
  // `consigneDExercice` au 48b-6b : le constat en a besoin deux fois — une
  // fois pour la consigne d'après, une fois pour `chargeVoisine`, qui lit le
  // contrat et non les séries brutes.
  function contratDe(groupes, etat, mesure) {
    return (groupes || []).map(function (g) {
      var r = Palier().analyser((g && g.series) || [], etat, { mesure: mesure });
      return seanceDuContrat(g && g.seance ? g.seance.debut : null, r);
    });
  }

  // La consigne d'UN exercice de la séance ouverte, silences compris. Pure :
  // `app.js` ne fait que résoudre les valeurs (`mesure` par `gabaritDe`,
  // `reglage` par `Profil.rythmeDe`, `equipement` au catalogue) et les passer.
  // La leçon de 48b-4 : ce qui vit dans `app.js` ne se teste pas.
  //
  // `groupes` : les séances qui portent l'exercice, `{ seance, series }` — la
  // forme de `seancesDeLExercice`. `etat` : `etatsExercices[slug]`, l'exception
  // assumée du §9.12 (il lit tout l'historique). `avant` : le début de la
  // séance ouverte.
  //
  // ⚠️ TROIS SILENCES PASSENT AVANT LE MOTEUR, et ils rendent `null` — pas une
  // consigne muette. `null` veut dire « le moteur n'a rien à faire ici » :
  // l'en-tête n'affiche rien, le fantôme garde sa cascade d'avant.
  //   · une séance en ÉDITION (§7 octies) : le moteur prescrit une séance à
  //     faire, pas une séance faite ;
  //   · l'intention `entretien` : on ne cherche pas à monter ;
  //   · une mesure autre que `charge_reps`, ou inconnue : pas de charge à
  //     prescrire.
  // Les silences DU moteur (première fois, pas de palier) sont autre chose :
  // une consigne à l'état `silence`, avec sa seule phrase grise.
  function consigneDExercice(groupes, etat, avant, options) {
    var o = options || {};
    if (o.edition) return null;
    if ((o.intention || 'progresser') === 'entretien') return null;
    if (o.mesure !== 'charge_reps') return null;
    var seances = contratDe(groupes, etat, o.mesure);
    // §9.1.1 (48b-7) — LE RANG 2 EST BRANCHÉ. Il attendait ici depuis
    // 48b-5b-2, câblé à `null` faute d'un endroit où lire la zone choisie.
    var consigne = consignePour(seances, avant,
      { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null });
    return { consigne: consigne, libelles: libellesConsigne(consigne),
             etiquette: etiquetteZone(consigne),
             pourquoi: pourquoiConsigne(consigne, o.reglage),
             // §9.14 (49-R2) — le contexte de la réaction, UNE FOIS par séance
             // et par exercice, sur les séances antérieures (§9.12).
             contexte: contexteReaction(seances, avant, consigne, o.equipement, null) };
  }

  // ── §3.9 — LE CONSTAT D'UN EXERCICE, DE BOUT EN BOUT ─────────────────────
  //
  // L'app passe l'historique et la séance du jour ; le moteur rend les deux
  // consignes, le cran suivant et le constat. Les silences sont ceux de la
  // consigne, et c'est voulu : là où le moteur ne prescrit rien — Entretenir,
  // Édition, mesure sans charge — il n'a rien à constater non plus.
  //
  // ⚠️ `apres` EST APRÈS LE DÉBUT DE LA SÉANCE DU JOUR, et c'est ce qui fait
  // entrer celle-ci dans le calcul : le moteur ne lit jamais l'avenir
  // (§9.12), donc une coupure au début de la séance l'exclurait — on
  // recalculerait la consigne d'avant et le constat serait vide.
  function constatDExercice(groupes, groupeDuJour, etat, avant, apres, options) {
    var o = options || {};
    var cAvant = consigneDExercice(groupes, etat, avant, o);
    if (!cAvant) return null;
    var s = suiteDExercice(groupes, groupeDuJour, etat, apres, o);
    if (!s) return null;
    return {
      avant: cAvant, apres: s.apres, cranSuivant: s.cranSuivant,
      constat: constatDe(cAvant.consigne, s.apres.consigne, o.reglage, s.cranSuivant)
    };
  }

  // §3.9 (49-U4) — LA SUITE SEULE : la consigne de la PROCHAINE séance, par la
  // même fonction que la consigne (`consigneDExercice`, donc `consignePour`)
  // sur l'historique augmenté de la séance du jour, et le cran au-dessus de
  // son palier. C'est tout ce que le plan de séance ne peut pas savoir seul :
  // il n'a pas l'historique. Le VERDICT, lui, se lit sur le plan
  // (`constatDuJour`) — une seconde règle ne le recalcule plus.
  function suiteDExercice(groupes, groupeDuJour, etat, apres, options) {
    var o = options || {};
    var tous = (groupes || []).concat([groupeDuJour]);
    var cApres = consigneDExercice(tous, etat, apres, o);
    if (!cApres) return null;
    var P = cApres.consigne.palier;
    var cran = P === null || P === undefined ? null
      : chargeVoisine(contratDe(tous, etat, o.mesure), apres, P, o.equipement, 1);
    return { apres: cApres, cranSuivant: cran };
  }

  // ── §3.9, §9.13 bis (49-U4) — LE CONSTAT LU SUR LE PLAN (I10) ────────────
  //
  // Le constat ne contredit jamais le plan du jour. `constatDe` compare deux
  // consignes calculées sur les séries BRUTES : il ne sait pas qu'une charge
  // a été proposée par le coach. Trois charges différentes le même jour —
  // 125, puis 127,5 proposé et tenu, puis le test à 130 — ne font aucun
  // palier répété, et il disait « Pas de palier aujourd'hui » juste après une
  // montée annoncée « dans ta zone » (26/09/2026, D4).
  //
  // `jour` vient du PLAN, jamais d'une règle refaite ici :
  //   · `montee` — `{ charge, reps }`, la plus haute ligne du coach validée à
  //     sa charge ou plus, reps comptées dans la zone : une montée tenue compte
  //     comme un test tenu. Sa phrase ne remplace QUE les verdicts qui la
  //     contredisent — « Pas de palier… », « Pas encore… » ; les autres la
  //     disent déjà (la montée racontée comme un test du jour) ou disent mieux
  //     (« 4-4 à 130 : ta nouvelle charge tient… ») et restent tels quels
  //     (décidé le 27/09/2026, 49-U4) ;
  //   · `suivies` — toutes les séries de travail ont suivi leur ligne (ligne,
  //     test, proposition du coach acceptée) : c'est le coach qui a mené les
  //     charges, et « Pas de palier » serait faux ;
  //   · `faites` — `[{ charge, reps }]`, les séries de travail du jour.
  //
  // La SUITE reste celle de `constatDe` (la consigne d'après) : pas de seconde
  // règle. Rend `{ verdict, suite, montee, orchestre }`, ou `null`.
  function constatDuJour(consigneAvant, consigneApres, reglage, cranSuivant, jour) {
    var base = constatDe(consigneAvant, consigneApres, reglage, cranSuivant);
    if (!base) return null;
    var j = jour || {};
    var m = j.montee || null;
    if (m) {
      var contredit = /^Pas de palier/.test(base.verdict || '') || /^Pas encore/.test(base.verdict || '');
      return { verdict: contredit
                 ? 'La montée du coach a tenu' + DEUX_POINTS + croix(m.charge, m.reps) +
                   ', dans ta zone. Elle compte comme un test tenu.'
                 : base.verdict,
               suite: base.suite, montee: { charge: m.charge, reps: m.reps }, orchestre: false };
    }
    if (j.suivies && consigneApres.etat === 'silence') {
      var dites = (j.faites || []).map(function (f) { return croix(f.charge, f.reps); }).join(', ');
      return { verdict: 'Le coach a mené tes charges aujourd\'hui' + DEUX_POINTS + dites + '.',
               suite: base.suite, montee: null, orchestre: true };
    }
    return { verdict: base.verdict, suite: base.suite, montee: null, orchestre: false };
  }

  var api = {
    FENETRE_HABITUDE: FENETRE_HABITUDE,
    FENETRE_COUPLE: FENETRE_COUPLE,
    MAJORITE_COUPLE: MAJORITE_COUPLE,
    FENETRE_PAS_MOIS: FENETRE_PAS_MOIS,
    RECURRENCE_PAS: RECURRENCE_PAS,
    FACTEUR_COUPURE: FACTEUR_COUPURE,
    SEUIL_REPRISE_LONGUE: SEUIL_REPRISE_LONGUE,
    AUCUNE_REPRISE: AUCUNE_REPRISE,
    REPRISE_COURTE: REPRISE_COURTE,
    REPRISE_LONGUE: REPRISE_LONGUE,
    REPLI_MATERIEL: REPLI_MATERIEL,
    ZONES: ZONES,
    RANGEMENT: RANGEMENT,
    mediane: mediane,
    zoneParCle: zoneParCle,
    zoneDe: zoneDe,
    zoneRetenue: zoneRetenue,
    niveauValide: niveauValide,
    formatDe: formatDe,
    coupleDe: coupleDe,
    // Le pont entre `THPalier.analyser` et `niveauValide` : l'un rend une
    // séance décrite, l'autre attend les seules séries au palier.
    seriesAuPalier: seriesAuPalier,
    habitudeDe: habitudeDe,
    anterieures: anterieures,
    pasDeSalle: pasDeSalle,
    chargeVoisine: chargeVoisine,
    ecartHabituel: ecartHabituel,
    repriseDe: repriseDe,
    consignePour: consignePour,
    reactionPour: reactionPour,
    consigneFigee: consigneFigee,
    REPLI_MAX_REPRISE: REPLI_MAX_REPRISE,
    secondeCharge: secondeCharge,
    sautsDeMontee: sautsDeMontee,
    contexteReaction: contexteReaction,
    revisionsDuPlan: revisionsDuPlan,
    enteteDeDisposition: enteteDeDisposition,
    lignesDePari: lignesDePari,
    planDeCouverture: planDeCouverture,
    phraseReaction: phraseReaction,
    libellesConsigne: libellesConsigne,
    pourquoiConsigne: pourquoiConsigne,
    constatDe: constatDe,
    constatDuJour: constatDuJour,
    suiteDExercice: suiteDExercice,
    contratDe: contratDe,
    MODULE_CONSIGNE: MODULE_CONSIGNE,
    VERSION_CONSIGNE: VERSION_CONSIGNE,
    lignesDePrediction: lignesDePrediction,
    idDePrediction: idDePrediction,
    observationDe: observationDe,
    constatDExercice: constatDExercice,
    etiquetteZone: etiquetteZone,
    // Le menu des zones les affiche toutes (§3.8) : il lit cette table, il ne
    // recopie ni les libellés ni les bornes.
    ZONES: ZONES,
    zoneEnVigueur: zoneEnVigueur,
    seanceDuContrat: seanceDuContrat,
    consigneDExercice: consigneDExercice,
    MOIS_COURTS: MOIS_COURTS,
    INSECABLE: INSECABLE
  };

  racine.THMoteur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
