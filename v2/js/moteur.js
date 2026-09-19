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

    utiles.sort(function (a, b) { return instant(a.debut) - instant(b.debut); });

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

    var compte = new Map();
    for (var i = 1; i < distinctes.length; i++) {
      var e = auCentieme(distinctes[i] - distinctes[i - 1]);
      if (e <= 0) continue;
      compte.set(e, (compte.get(e) || 0) + 1);
    }

    var pas = null;
    compte.forEach(function (n, e) {
      if (n >= RECURRENCE_PAS && (pas === null || e < pas)) pas = e;
    });
    if (pas === null) return null;
    return { pas: pas, nature: estMultipleDeDemi(pas) ? 'exact' : 'approche' };
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

  var api = {
    FENETRE_HABITUDE: FENETRE_HABITUDE,
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
    // Le pont entre `THPalier.analyser` et `niveauValide` : l'un rend une
    // séance décrite, l'autre attend les seules séries au palier.
    seriesAuPalier: seriesAuPalier,
    habitudeDe: habitudeDe,
    anterieures: anterieures,
    pasDeSalle: pasDeSalle,
    chargeVoisine: chargeVoisine,
    ecartHabituel: ecartHabituel,
    repriseDe: repriseDe
  };

  racine.THMoteur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
