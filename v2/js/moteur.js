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
  // §10.2 (delta 49-36) — la charge déjà utilisée PLUS LOURDE, hors barre : 12
  // mois. Les matériels dont la charge change d'une salle à l'autre. La
  // machine Smith suit les machines (décidé le 02/10/2026) : sa barre guidée
  // a son propre poids, qui change d'une machine à l'autre.
  var FENETRE_VOISINE_MOIS = 12;
  var FENETRE_VOISINE_MATERIELS = ['machine', 'machine_smith', 'poulie', 'haltere'];
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
  //
  // §9.1.2 (amendé le 05/10/2026, chantier 53) — LA DÉCLARATION LA PLUS RÉCENTE
  // L'EMPORTE : un bloc pose ses zones à son début, comme des lignes datées
  // (`origine = 'bloc'`) ; une correction de la personne pendant le bloc est
  // plus récente, donc elle l'emporte. Une seule lecture, `ligneDeZoneAu`.
  // ⚠️ `a` (facultatif) : l'instant de la lecture. Une ligne datée APRÈS n'est
  // pas encore en vigueur — un bloc qui commence lundi ne change rien
  // aujourd'hui.
  function zoneEnVigueur(lignes, slug, a) {
    var l = ligneDeZoneAu(lignes, slug, a === undefined ? null : a, true);
    // Une zone vide, ou inconnue, vaut « pas de correction » : `zoneRetenue`
    // retombera sur l'habitude.
    return l && l.zone ? l.zone : null;
  }

  // La ligne de zone EN VIGUEUR à l'instant `a` : la plus récente posée avant
  // lui (jusqu'à l'identifiant, à la même seconde), pour l'exercice `slug`
  // (`null` : toutes les lignes sont les siennes). `inclus` : une ligne posée
  // à l'instant même compte (la lecture du présent) ; sinon, strictement avant
  // (une séance passée, §9.1.1). Sans `a`, toutes les lignes.
  function ligneDeZoneAu(lignes, slug, a, inclus) {
    var t0 = a === null || a === undefined ? null : instant(a);
    if (a !== null && a !== undefined && t0 === null) return null;
    var gagnante = null;
    (lignes || []).forEach(function (l) {
      if (!l || (slug !== null && slug !== undefined && l.exercise_slug !== slug)) return;
      var t = instant(l.corrigee_a);
      if (t === null) return;
      if (t0 !== null && (inclus ? t > t0 : t >= t0)) return;
      if (gagnante === null || t > gagnante.t ||
          (t === gagnante.t && String(l.id) > String(gagnante.id))) {
        gagnante = { t: t, id: l.id, ligne: l };
      }
    });
    return gagnante ? gagnante.ligne : null;
  }

  // ── §9.17 — LE MODE D'UN EXERCICE, LU SUR L'HISTORIQUE ───────────────────
  //
  // `modes_exercice` est, comme `zones_exercice`, un historique EN AJOUT SEUL :
  // chaque choix ajoute une ligne (« Progresser » ou « Entretenir »), la plus
  // récente par `choisi_a` fait foi — jusqu'à l'identifiant, pour que deux
  // appareils qui posent à la même seconde donnent la même lecture. C'est un
  // réglage EXPLICITE : le coach ne le propose jamais (CADRAGE, 15/09 :
  // l'intention ne se déduit pas des données), et rien ici ne le devine.
  //
  // Rend `'progresser'`, `'entretien'`, ou `null` — aucun choix. Une valeur
  // inconnue (une ligne qu'un autre appareil écrirait un jour) ne vaut rien :
  // elle ne change pas l'intention du profil.
  var MODES = ['progresser', 'entretien'];
  function modeEnVigueur(lignes, slug) {
    var gagnante = null;
    (lignes || []).forEach(function (l) {
      if (!l || l.exercise_slug !== slug) return;
      var t = instant(l.choisi_a);
      if (t === null) return;
      if (gagnante === null || t > gagnante.t ||
          (t === gagnante.t && String(l.id) > String(gagnante.id))) {
        gagnante = { t: t, id: l.id, mode: l.mode };
      }
    });
    return gagnante && MODES.indexOf(gagnante.mode) >= 0 ? gagnante.mode : null;
  }

  // L'intention qu'un exercice reçoit : celle du PROFIL est l'interrupteur
  // général (en Entretenir au profil, tous les exercices le sont — §9.17), puis
  // le choix de l'exercice. Le moteur lit ce seul mot (`entretien` ou
  // `progresser`) et ne sait pas d'où il vient : un exercice en Entretenir fait
  // EXACTEMENT ce que fait le mode du profil (I13).
  function intentionDe(intentionProfil, modeExercice) {
    if (intentionProfil === 'entretien') return 'entretien';
    return modeExercice === 'entretien' ? 'entretien' : 'progresser';
  }

  // LE SILENCE DU COACH AU PROFIL (« Juste un carnet », MOTEUR I13, 60-2a) : LE
  // fait que lisent le plan (`planDeSeance`) et tout ce qui vit hors de lui —
  // la semaine allégée annoncée sur une routine, le badge et la carte de fin
  // de bloc d'un programme. Vrai quand l'intention du PROFIL est Entretenir ;
  // le mode d'UN exercice (`modes_exercice`) n'y touche pas : ce sont des faits
  // du programme entier, pas d'un exercice. Aucun appelant n'écrit un second
  // test de `intention` — ils passent ici.
  function coachSeTait(intentionProfil) {
    return intentionDe(intentionProfil, null) === 'entretien';
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
  // ── §9.2 bis — LA CHUTE DE FIN DE SÉANCE (49-U12, delta 49-27) ────────────
  //
  // « Une dernière série qui s'effondre après des séries stables ne dit rien du
  // niveau ; elle dit que la fatigue est arrivée. » La DERNIÈRE série au palier
  // est une chute si :
  //   · au moins deux séries la précèdent ;
  //   · toutes à la même charge ;
  //   · chacune de celles d'avant à UNE REP PRÈS de la première ;
  //   · et elle perd AU MOINS 4 reps ET AU MOINS 30 % sur la première.
  // Tout en REPS COMPTÉES (§17.4) : une série à RPE 10 ou « reste 0 » compte une
  // rep de moins. `10-10-6` → chute ; `10-4-4` → non (c'est la première qui sort
  // du lot) ; `15-15-11` → non (−27 %) ; `10-10-7` → non (−3) ; `10-5` → non.
  // Rend le RANG (1-based) de la chute dans `seriesAuPalier`, ou `null`.
  var CHUTE_REPS = 4;
  var CHUTE_PART = 0.30;

  function chuteDe(seriesAuPalier) {
    var liste = seriesAuPalier || [];
    var n = liste.length;
    if (n < 3) return null;
    var c = [];
    for (var i = 0; i < n; i++) {
      var r = Palier().repsComptees(liste[i]);
      if (r === null) return null;
      c.push(r);
    }
    var charge = nombre(liste[0] && liste[0].charge_kg);
    for (var j = 1; j < n; j++) {
      if (!memeCharge(nombre(liste[j] && liste[j].charge_kg), charge)) return null;
    }
    var premiere = c[0];
    for (var k = 1; k < n - 1; k++) {
      if (Math.abs(c[k] - premiere) > 1) return null;
    }
    var perte = premiere - c[n - 1];
    if (perte < CHUTE_REPS || perte < premiere * CHUTE_PART - 1e-9) return null;
    return n;
  }

  function niveauValide(seriesAuPalier) {
    var liste = seriesAuPalier || [];
    if (!liste.length) return null;
    // §9.2 bis — la chute ne tire pas le niveau : il se calcule sans elle.
    if (chuteDe(liste) !== null) liste = liste.slice(0, -1);

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
  //
  // §14.7 (49-U17) — TANT QUE LA SÉRIE DE PLUS EST ACTIVE, LE NIVEAU SE LIT SUR
  // LES N SÉRIES DE LA ROUTINE (`nRoutine`, posé sur la séance par
  // `marquerSousConsigne`) : la série ajoutée, faite en fin d'exercice et en
  // fatigue, ne le tire pas vers le bas (12, 12, 12 puis 9 → 12, pas 10). Tout
  // le niveau passe par ici — consigne, compteur, repli, constat.
  function seriesAuPalier(seanceExercice) {
    var p = nombre(seanceExercice && seanceExercice.palier);
    if (p === null) return [];
    var A = (seanceExercice.retenues || []).filter(function (s) {
      return nombre(s && s.charge_kg) === p;
    });
    var n = nombre(seanceExercice.nRoutine);
    return n !== null && n >= 1 && A.length > n ? A.slice(0, n) : A;
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
  // ⚠️ LE LEST A SON SAUT, ET LA VALEUR N'EST ÉCRITE QU'ICI (§9.17, 03/10/2026) :
  // 2,5 kg, le plus petit disque d'une ceinture ou d'un gilet — la règle des
  // coachs, puis retour au bas de la fourchette. La version lestée d'un
  // exercice au poids du corps n'est pas d'un matériel de la salle : sa charge
  // s'ajoute au corps, et `equipement` (« aucun », « disque », « machine »…) ne
  // dit rien de son cran. L'app lui donne donc, comme matériel EFFECTIF,
  // `EQUIPEMENT_LEST` (`equipementEffectif`) — la seule clé que cette table
  // lit pour lui. Le départ de la version lestée (`departLeste`) et la carte du
  // lest (`carteLest`) disent la même valeur : ils la lisent ici, jamais en dur.
  var EQUIPEMENT_LEST = 'lest';
  var SAUT_LEST = 2.5;

  var REPLI_MATERIEL = {
    barre:         { pas: 2.5 },
    machine_smith: { pas: 2.5 },
    haltere:       { pas: 2, pasLourd: 4, bascule: 20 }
  };
  REPLI_MATERIEL[EQUIPEMENT_LEST] = { pas: SAUT_LEST };

  // Le matériel que le moteur lit pour un exercice du catalogue : le lest pour
  // une charge ajoutée (`charge = ajoutee`), sinon son équipement. Le moteur ne
  // lit pas le catalogue (§9.13) : l'app résout cette valeur, UNE fois, dans les
  // options de la consigne — celle de l'exercice, de ses frères et de son parent.
  function equipementEffectif(exo) {
    if (!exo) return null;
    return exo.charge === 'ajoutee' ? EQUIPEMENT_LEST : (exo.equipement === undefined ? null : exo.equipement);
  }

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

    // §10.2 (delta 49-36, 01/10/2026) — LE RANG 2, VERS LE HAUT, HORS BARRE :
    // seulement les 12 derniers mois. Un 25 kg du 30/04/2024, sur une autre
    // machine, passait devant le 27 kg de la poulie actuelle — un test à
    // +0,2 kg. D'une salle à l'autre, les piles et les haltères changent ; à la
    // barre, les disques sont les mêmes partout (sans limite), et vers le bas
    // le repli a sa propre limite de 10 % (sans limite non plus).
    var plancher = dir > 0 ? plancherDuMateriel(equipement, avant) : null;
    var voisine = null;
    anterieures(seances, avant).forEach(function (se) {
      if (plancher !== null && instant(se.debut) < plancher) return;
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

  // §10.2 (delta 49-36) et §9.23 (55-1) — LE PLANCHER DES 12 MOIS d'un
  // matériel dont la charge change d'une salle à l'autre (machines, poulies,
  // haltères, Smith) ; `null` à la barre et au poids du corps (toute la vie).
  // UN SEUL CÂBLAGE : la charge voisine du moteur et les records (`THModele.
  // recordsBattus`) lisent la même liste et la même fenêtre, ici.
  function plancherDuMateriel(equipement, avant) {
    if (FENETRE_VOISINE_MATERIELS.indexOf(equipement) < 0) return null;
    var t = instant(avant);
    if (t === null) return null;
    var depuis = new Date(t);
    depuis.setUTCMonth(depuis.getUTCMonth() - FENETRE_VOISINE_MOIS);
    return depuis.getTime();
  }

  // ── §12.6 / §9.9 — L'ÉCART HABITUEL, LA COUPURE ET LA REPRISE ────────────
  //
  // L'écart habituel est la médiane des 8 DERNIERS écarts, EN JOURS, entre
  // séances consécutives de l'exercice (§9.9, delta 49-36 : une seule
  // définition, pour la reprise et pour le compteur, §12.6). Une médiane et non
  // une moyenne : une seule coupure de trois mois tirerait la moyenne au point
  // de rendre la règle muette pour toujours. Les 8 DERNIERS : le rythme actuel,
  // pas celui d'il y a un an — un militaire fait deux fois par semaine à
  // l'automne 2025, une fois par semaine depuis, voyait 14 jours d'absence
  // comme une reprise (séance du 01/10/2026). La zone se lit déjà sur les 8
  // dernières séances : même logique.
  //
  // Il faut AU MOINS DEUX séances : avec une seule, il n'y a pas d'écart, donc
  // pas de coupure — une première séance n'est pas une reprise.
  var ECARTS_HABITUELS = 8;
  function ecartHabituel(seances, avant) {
    var dates = anterieures(seances, avant).map(function (se) { return instant(se.debut); });
    if (dates.length < 2) return null;
    var ecarts = [];
    for (var i = 1; i < dates.length; i++) ecarts.push((dates[i] - dates[i - 1]) / JOUR);
    return mediane(ecarts.slice(-ECARTS_HABITUELS));
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
  //
  // ⚠️ UNE SÉANCE NEUTRE (§7.6, précisé le 29/09/2026) RESTE UNE PRÉSENCE : sa
  // date compte pour le rythme (écart habituel, dernière présence — §9.9),
  // mais elle ne porte AUCUNE charge : ni retenues, ni votantes. Elle ne vote
  // donc ni pour le plan de charges de la salle, ni pour le palier.
  function vueDeSeance(se) {
    var series = (se && se.series) || [];
    var neutre = !!se && se.neutre === true;
    var vue = {
      debut: se && se.debut,
      palier: se && se.palier,
      neutre: neutre,
      // §14.7 (49-U17) — les N séries de la routine, quand une série de plus
      // était active ce jour-là (le niveau se lit sur elles).
      nRoutine: se && typeof se.nRoutine === 'number' ? se.nRoutine : null,
      series: series,
      retenues: neutre ? [] : parRole(series, ROLES_RETENUS),
      votantes: neutre ? [] : parRole(series, ROLES_VOTANTS)
    };
    // §9.10 (53-1) — la FIN de la séance, quand on la connaît : la zone choisie
    // pendant une séance est celle de la séance (`zoneDeLaDerniere`).
    if (se && se.fin) vue.fin = se.fin;
    return vue;
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
  // §9.2 bis — les états qui PROPOSENT un nouveau test : après une chute, ils
  // deviennent « tenir » (`tenue_apres_chute`).
  var ETATS_DE_TEST = { test_propose: true, retest: true, retest_un_cran: true };

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
    // §9.17 — la réponse à la carte du lest (`oui`, `non`), ou `null` : pas
    // encore posée. Une réponse n'est qu'une entrée ; le moteur ne l'écrit pas.
    var lestReponse = opt.lestReponse === 'oui' || opt.lestReponse === 'non' ? opt.lestReponse : null;
    // §9.17 — `lestPossible` : le catalogue a une version lestée de l'exercice.
    // Seul `false` retire la carte (l'app le dit quand `lesteDe` ne trouve rien) :
    // une carte dont « J'ai du lest » ne saurait rien livrer promettrait ce
    // qu'elle ne tient pas, et les reps continuent alors comme sans réponse.
    var lestPossible = opt.lestPossible !== false;

    var vues = (seances || []).map(vueDeSeance);
    // §7.6 — les séances neutres ne comptent que pour le rythme (`repriseDe`,
    // qui lit `vues`) : la dernière séance, celle d'où la consigne repart, est
    // la dernière qui n'est PAS neutre.
    var ant = anterieures(vues, avant).filter(function (se) { return !se.neutre; });
    // 1. Les silences. Une première fois n'a rien à dire, et le dire serait
    // inventer ; une séance sans palier n'a rien TENU (§7.2).
    // Le fondement d'un silence de première fois est VIDE, et pas absent : la
    // phrase n'a besoin d'aucun fait, mais l'appelant lit toujours la même forme.
    if (!ant.length) return { etat: 'silence', raison: 'premiere_fois', fondement: {} };

    var L = ant[ant.length - 1];
    var P = nombre(L.palier);
    var A = seriesAuPalier(L);
    var niv = A.length ? niveauValide(A) : null;
    // §9.17 (03/10/2026) — LE POIDS DU CORPS EST UNE CHARGE QUI VAUT 0, et c'est
    // CE ZÉRO qui le dit : aucun autre champ ne le porte, et le fichier de cas
    // n'en donne pas. Un palier à 0 ne vient jamais d'une vraie charge (« zéro
    // n'est pas une charge », `calculerPalier`) : il vient du contrat d'un
    // exercice en `reps` (`THPalier.analyserPoidsDuCorps`). Il suit la consigne
    // des charges, à une différence près — il n'a pas de cran. Une AIDE est une
    // charge négative (la convention de la base, §9.17) : moins d'aide, c'est
    // monter.
    var poidsDuCorps = P === 0;
    var aide = P !== null && P < 0;
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
    var testDeL = testDe(L);
    // §9.2 bis (49-U12) — une chute sur la dernière séance : son rang parmi les
    // séries au palier, ou `null`. Le niveau `niv` se calcule déjà sans elle,
    // et la note de la série à fond (§17.4) ne la cite pas : « compte pour 5 »
    // serait faux, elle ne compte pas du tout.
    var chute = chuteDe(A);
    var aFond = serieAFondDe(chute !== null ? A.slice(0, -1) : A);
    function rendre(etat, ligne, haut, plus) {
      // §9.2 bis — APRÈS UNE CHUTE, AUCUN NOUVEAU TEST : un test proposé, un
      // retest ou un retest d'un cran devient « tenir » — la ligne au palier,
      // au niveau validé borné au haut de la zone, sans ligne haute. Une
      // échelle en cours (garde, étend, rejoint, attend) n'est pas touchée, ni
      // la réaction en séance (§9.14).
      if (chute !== null && ETATS_DE_TEST[etat] === true && zone !== null) {
        etat = 'tenue_apres_chute';
        ligne = ligneDe(P, cible(Math.min(niv, zone.haut)));
        haut = null;
        plus = null;
      }
      // §9.17 — UN TEST SANS CRAN. Au poids du corps, le coach voudrait monter
      // d'un cran et il n'y en a pas : `haut.charge` est `null` (aucun matériel
      // ne dit le cran d'un corps). Deux sorties, et elles passent APRÈS la
      // chute — un « tenir » n'est jamais une carte :
      //   · `carte_lest` — les DEUX dernières séances ont un niveau au moins égal
      //     au haut de la zone et la carte n'a pas de réponse : la ligne reste (au
      //     haut de la zone, sans ligne haute), et la carte du lest parle, une
      //     fois ;
      //   · `etirement_reps` — sinon (« pas de lest », ou une seule séance au
      //     haut) : la ligne au niveau de la dernière séance + 1, AU-DELÀ de la
      //     zone, sans ligne haute — les reps continuent, la règle des coachs
      //     quand on ne peut pas ajouter de poids.
      if (poidsDuCorps && ETATS_DE_TEST[etat] === true && haut && haut.charge === null && zone !== null) {
        var niveaux = niveauxDesDeuxDernieres();
        if (lestReponse === null && lestPossible && niveaux !== null &&
            niveaux[0] >= zone.haut && niveaux[1] >= zone.haut) {
          etat = 'carte_lest';
          ligne = ligneDe(P, cible(Math.min(niv + 1, zone.haut)));
          plus = { carteLest: { niveaux: niveaux, bas: zone.bas, haut: zone.haut } };
        } else {
          etat = 'etirement_reps';
          ligne = ligneDe(P, cible(niv + 1));
          plus = null;
        }
        haut = null;
      }
      var f = { date: L.debut, reps: repsSaisies(A) };
      if (chute !== null) f.chute = { rang: chute };
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
      // §9.17 — AU POIDS DU CORPS, IL N'Y A PAS DE CRAN : ni au-dessus, ni en
      // dessous, quel que soit le matériel du catalogue (l'hyperextension y est
      // une « machine », dont le pas de pile n'a rien à dire d'un corps).
      if (poidsDuCorps) return null;
      return chargeVoisine(vues, avant, depuis, equipement, sens);
    }
    // §9.17 — le niveau validé des DEUX dernières séances (non neutres), de la
    // plus ancienne à la plus récente ; `null` s'il n'y en a qu'une, ou si l'une
    // n'a pas de niveau. Le niveau se calcule sans la chute (§9.2 bis).
    function niveauxDesDeuxDernieres() {
      if (ant.length < 2) return null;
      var a = niveauValide(seriesAuPalier(ant[ant.length - 2]));
      var b = niveauValide(seriesAuPalier(ant[ant.length - 1]));
      return a === null || b === null ? null : [a, b];
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
    // §9.9 (delta 49-36, 01/10/2026) — UNE REPRISE NE VISE JAMAIS AU-DESSUS DU
    // HAUT DE LA ZONE (52,5 kg × 10 en Mix 6-8, séance du 01/10). Les reprises
    // seulement : l'étirement dépasse la zone exprès. Quand la borne
    // s'applique, le fondement le dit (`borneZone`), et la phrase grise aussi.
    var borne = reprise !== AUCUNE_REPRISE && zone !== null && niv > zone.haut
      ? { borneZone: { zone: zone.cle, haut: zone.haut, niveau: niv } } : null;
    var viseReprise = borne ? zone.haut : niv;
    if (reprise === REPRISE_COURTE) return rendre('reprise_courte', ligneDe(P, viseReprise), null, borne);
    // §9.9 (delta 49-13, 27/09/2026) — le repli ne descend jamais de plus de
    // 10 % : `repliDeReprise` est la SEULE règle, que le plan réapplique à
    // toute consigne qu'il reçoit (`consigneFigee`).
    // §9.17 — ET PAS DE REPLI SOUS UN CORPS, NI SOUS UNE AIDE : une reprise
    // longue garde la charge de travail, sans rep de plus (« Longue pause : on
    // reprend à ta charge de travail »). Le cran en dessous d'un corps n'existe
    // pas, et celui d'une aide — plus d'aide — serait un repli que la règle
    // refuse (I30).
    if (reprise === REPRISE_LONGUE) {
      return rendre('reprise_longue',
        ligneDe(poidsDuCorps || aide ? P : repliDeReprise(P, voisine(P, -1)), viseReprise), null, borne);
    }

    // 4. La règle de bord : sous 3 reps d'habitude, il n'y a plus de zone. On
    // monte la charge AUX MÊMES REPS — la variabilité journalière des maximaux
    // dépasse l'écart entre une rep et deux (§9.1.2).
    //
    // §9.17 — Au poids du corps il n'y a pas de charge à monter : les reps
    // continuent, comme l'étirement (une de plus, sans zone ni ligne haute).
    if (zone === null) {
      if (poidsDuCorps) return rendre('etirement_reps', ligneDe(P, cible(niv + 1)), null);
      return rendre('bord', ligneDe(voisine(P, 1), niv), null);
    }

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
    // §9.17 — ET PAS DE DOUBLE SAUT SUR UNE AIDE : deux crans d'aide en moins
    // d'un coup ne sont pas « 10 % de la charge » (une aide n'est pas une
    // charge qu'on pèse en pourcentage, I30).
    if (reglage === 'franc' && c1 !== null && !aide) {
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
      // §9.13 (49-U18) — la même source que la couverture : sans la ligne de
      // son rôle, la ligne prend l'autre (la charge du coach, jamais rien).
      var src = x.role === 'haut' ? (c.haut || c.ligne) : (c.ligne || c.haut);
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
    // §14.4 (49-U14) — PENDANT UNE SEMAINE ALLÉGÉE, RIEN NE MONTE : ni test, ni
    // proposition en séance (§9.14). La ligne reste la ligne.
    if (c.allegee) return sortie;
    // `zone` : une clé chez `consignePour` ; la table des zones donne les bornes.
    var z = typeof c.zone === 'string' ? zoneParCle(c.zone) : null;
    var P = c.ligne ? nombre(c.ligne.charge) : null;
    if (z === null || !c.ligne || P === null || nombre(c.palier) === null) return sortie;
    // §9.17 — AU POIDS DU CORPS, LA RÉACTION SE TAIT : « 3 reps de plus que visé,
    // je passe ta série 2 au cran au-dessus » n'aurait aucun cran à proposer, et
    // une charge proposée à un corps serait une ligne haute avec une charge
    // (I28). Rien à dire, rien à proposer : à cette marche, le silence. (Le
    // départ de la version lestée, §8.4, n'a pas de charge de travail : son
    // `palier` est nul, et la réaction s'y tait déjà.)
    if (P === 0) return sortie;

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
      // §9.14 (49-U7) — LE CRAN SE LIT AU-DESSUS DE LA CHARGE DE TRAVAIL
      // RETENUE. Un cran connu qui n'est pas au-dessus de `P` — un contexte
      // calculé sur une consigne d'avant le repli plafonné, dont la ligne est
      // plus basse que la consigne figée — vaut « le cran au-dessus », sans
      // chiffre : on ne propose jamais la charge de travail elle-même, ni
      // moins (I3). Dans l'app, le contexte se calcule sur la consigne déjà
      // plafonnée (`consignePour`), et `chargeVoisine` rend toujours plus
      // haut que sa base : rien n'y change.
      var cranLu = ctx.cran === undefined ? null : nombre(ctx.cran);
      if (cranLu !== null && !(cranLu > P && !memeCharge(cranLu, P))) cranLu = null;
      var charges = [cranLu];
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
    // §9.17 — PAS DE CRAN AU POIDS DU CORPS : la réaction se tait (`reactionPour`),
    // et le contexte ne cherche pas une charge à lui proposer.
    if (base === 0) return vide;
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
      // §9.17 — ET PAS DE SECONDE CHARGE SUR UNE AIDE : « ou 130 kg, si tu te
      // sens bien ? » compare à 10 % de la charge, et une aide n'en est pas une
      // (I30). Le cran seul reste proposé : moins d'aide, c'est monter.
      haut: base < 0 ? null : secondeCharge({ palier: base, cran: cran, cranSuivant: cranSuivant,
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
  // se rejoue ici. Les chiffres passent par le formateur de la voix (§20.2) :
  // « 125 kg × 8 », la charge d'abord.
  //
  // ⚠️ LE COACH APPLIQUE D'OFFICE, ET LE DIT (§20.2, 49-U9) : « je passe ta
  // série 2 à 130 kg ». La SEULE question du coach est le choix entre deux
  // charges (la seconde charge, §9.14) — aucune autre phrase ne finit par
  // « ? », et la garde de la voix le vérifie.
  function phraseReaction(message, zone) {
    var m = message || null;
    if (m === null) return null;
    var z = typeof zone === 'string' ? zoneParCle(zone) : (zone || null);
    var fait = chargeFois(m.charge, m.reps, cite(FAIT, { quoi: 'du_jour' }));
    switch (m.type) {
      case 'propose': {
        if (z === null) return null;
        var ch = m.charges || [];
        var vise = ', vise ' + nombreFr(z.bas, regle('zone.bas')) + ' à ' + nombreFr(z.haut, regle('zone.haut')) + '.';
        var serieN = 'ta série ' + nombreFr(m.rang + 1, regle('reaction.rang'));
        var tete = fait + ', ' + nombreFr(m.marge, regle('reaction.marge')) + ' de plus que visé' + DEUX_POINTS;
        // §9.14 — la seconde charge : le seul vrai choix, donc la seule question.
        if (ch.length > 1) {
          return tete + serieN + ' passe ' + versCharge(ch[0]) + vise + ' Ou ' + enKg(ch[1], cite(CIBLE, { role: 'seconde' })) +
            ', si tu te sens bien' + INSECABLE + '?';
        }
        // §9.14 (delta 49-13) — la reprise longue qui ramène à la charge de
        // travail le dit.
        return tete + (m.retrouve ? 'on retrouve ta charge de travail, ' : '') +
          'je passe ' + serieN + ' ' + versCharge(ch[0]) + vise;
      }
      case 'tenue':
        return fait + ', dans ta zone' + DEUX_POINTS +
          (m.avance ? 'ton test a avancé d\'une série.' : 'tu montes dès aujourd\'hui.');
      case 'haut':
        return fait + DEUX_POINTS + 'le haut de ta zone.';
      case 'test_suit': {
        // §9.14 (26/09/2026) — dans la voix du coach, charge d'abord.
        var t = m.test || {};
        var leTest = t.charge === null || t.charge === undefined
          ? 'ton test au cran du dessus' : 'ton test à ' + enKg(t.charge, cite(CIBLE, { role: 'haut' }));
        return fait + ', ' + nombreFr(m.marge, regle('reaction.marge')) + ' de plus que prévu' + DEUX_POINTS + leTest +
          ' arrive dès la série ' + nombreFr(m.rang + 1, regle('reaction.rang')) + ', avec de la marge.';
      }
      case 'pas_encore':
        return fait + DEUX_POINTS + 'pas encore. On revient à ' + enKg(m.palier, cite(CIBLE, { role: 'retour' })) + '.';
      default:
        return null;
    }
  }

  // « à 130 kg », ou « au cran au-dessus » quand la machine ne donne pas de
  // chiffre : la phrase garde sa préposition.
  function versCharge(v) {
    return v === null || v === undefined ? 'au cran au-dessus' : 'à ' + enKg(v, cite(CIBLE, { role: 'coach' }));
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
  //
  // Elle s'écrit dans la COLONNE `predictions.module_version` de chaque pari
  // (`enregistrerPari`), pas dans son fondement. 1 jusqu'à 49-U5 exclu ; 2 depuis
  // 49-U5 (reprise mesurée, une seule montée par bloc — MOTEUR §9.13 bis,
  // précisé le 27/09/2026) ; 3 depuis 49-U8 (une séance sans charge répétée
  // prend sa plus lourde charge tenue dans la zone — MOTEUR §7.6) ; 4 depuis
  // 49-U12 (la chute de fin de séance ne tire plus le niveau et bloque le
  // test suivant — MOTEUR §9.2 bis) ; 5 depuis 49-U18 (delta 49-36 : l'écart
  // habituel sur les 8 derniers écarts, les reprises bornées à la zone, la
  // charge plus lourde sur 12 mois hors barre) ; 6 depuis 50-1 (le poids du corps suit la
  // consigne des charges, la charge valant 0 ; la carte du lest, l'étirement,
  // l'aide, le départ lesté — MOTEUR §9.17). Les paris d'un exercice en `reps`
  // n'existaient pas avant : seule la version dit qu'ils viennent de cette règle.
  // 7 depuis 51-3 (une séance marquée « douleur » est neutre, déclarée — MOTEUR
  // §9.20 : la neutralité change une entrée de la consigne). 8 depuis 53-1 (la
  // charge se reporte au changement de zone — MOTEUR §9.10, l'état
  // `nouvelle_zone`). 9 depuis 54-1 (la zone d'une séance se lit à sa fin pour
  // le compteur et le repli de l'escalier, comme pour le report — MOTEUR §12.2
  // bis : une zone changée en pleine séance change le compteur et le repli).
  // 10 depuis 55-1 (une séance sans heure de fin finit 3 h au plus après son
  // début — MOTEUR §12.2 bis, G2 : une zone changée entre deux séances ne
  // compte plus pour la précédente).
  var MODULE_CONSIGNE = 'moteur.consigne';
  var VERSION_CONSIGNE = 10;

  // ⚠️ LU TARDIVEMENT, SANS REPLI, comme `THPalier`. `modele.js` charge avant
  // `moteur.js` (index.html 325 puis 329), mais un repli « si THModele manque,
  // écris le point décimal » afficherait « 127.5 » à un utilisateur français
  // sans que rien ne le signale.
  function Modele() { return racine.THModele; }

  // §20.2 (49-U9) — LE FORMATEUR DE LA VOIX VIT DANS `modele.js`, le seul :
  // le moteur et le plan l'appellent, aucune phrase ne formate un nombre
  // elle-même. `croix` (« 125 × 5 », sans kg) est partie avec la réécriture.
  // §20 bis (49-U19) — CHAQUE CHIFFRE PORTE SA NATURE ET SON OBJET (`cite`,
  // le dernier argument) : le formateur le déclare au registre quand la phrase
  // se rédige sous capture (`THModele.capturer`), et la garde de cohérence le
  // lit. Hors capture, rien ne change.
  var CIBLE = 'cible_du_jour', FAIT = 'fait_passe', SUIVANTE = 'cible_suivante', REGLE = 'regle';
  function cite(nature, objet) { return { nature: nature, objet: objet === undefined ? null : objet }; }
  // Une règle : sa clé (`zone.haut`, `compteur`, `constante`…), et sa valeur.
  function regle(cle) { return cite(REGLE, { regle: cle }); }
  function nombreFr(v, c) { return Modele().nombre(v, undefined, c); }
  function enKg(v, c) { return Modele().charge(v, undefined, c); }
  function chargeFois(kg, reps, c) { return Modele().chargeFois(kg, reps, undefined, c); }
  function serieFr(kg, reps, c) { return Modele().serie(kg, reps, undefined, c); }
  // « mardi », « aujourd'hui », « le 13 sept. » — contre la RÉFÉRENCE, une
  // entrée (la date de la séance), jamais l'horloge.
  function quand(iso, reference, tete, c) { return Modele().quand(iso, reference, tete, c); }
  // ══ §9.18 (51-1) — « J'AI PEU DE TEMPS » : LA DURÉE ESTIMÉE, LE RACCOURCI ══
  //
  // Le temps se décide AVANT de commencer, sur la routine. Le coach coupe les
  // dernières séries, pas les muscles ; les charges ne changent pas.
  //
  // Une STRUCTURE est la forme d'une routine que ces fonctions lisent, et rien
  // d'autre : `[{ slug, mesure, repos, ch, tr, deg, duree, prim, sec }]` — les
  // chauffes, séries de travail et dégressives comptées, le repos prévu
  // (`null` : porté par l'autre exercice du superset), la durée d'une série de
  // cardio ou de durée, et les muscles principaux et secondaires (un tableau, ou
  // « a/b » comme les cas). `structureDeRoutine` la tire d'une routine de l'app.
  // Référence : `simu_raccourcir.py` ; cas `cas-51-1-peu-de-temps.json`.

  // ⚠️ DES VALEURS PAR DÉFAUT (delta 51-1 bis, T3), PAS DES VÉRITÉS SUR UNE
  // PERSONNE. Vérifiées sur les séances chronométrées d'Aurélien, pas réglées
  // sur lui : la référence reste la fourchette personnelle. Quand l'historique
  // chronométré d'une personne le permettra, elles se liront sur ses propres
  // séances (noté, pas fait). Les cas les figent pour vérifier l'ALGORITHME.
  // UNE SEULE DÉFINITION : aucune fonction ne les recopie (un test lit le corps
  // de chacune et n'y tolère aucun nombre que 0 et 1).
  var DUREE_PAR_DEFAUT = Object.freeze({
    serie: 60,              // une série de travail, ou une chauffe, sans son repos
    changement: 30,         // passer d'un exercice au suivant
    reposSuperset: 15,      // le repos porté par l'autre exercice du superset
    degressive: 45,         // une dégressive
    cardioDebut: 180,       // le cardio de début, raccourci (§9.18, étape 2)
    reposSansReglage: 90    // un exercice seul sans repos programmé (le repos le plus courant)
  });
  var SECONDES_PAR_MINUTE = 60;
  // Les règles du raccourci (§9.18, étapes 4 et 5) — des règles, pas des défauts.
  var PRIORITE_ISOLATION = 1, PRIORITE_POLY = 2, PRIORITE_PREMIER = 3;
  var MUSCLES_POLYARTICULAIRE = 3;          // au moins 3 muscles principaux et secondaires
  var PLANCHER_ISOLATION = 1, PLANCHER_COMPOSE = 2;   // ~2 séries portent presque tout le gain

  function musclesDe(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return String(v || '').split('/').filter(Boolean);
  }
  function compteDe(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }
  function enDuree(e) { return !!e && (e.mesure === 'temps' || e.mesure === 'distance_temps'); }
  function aDesMuscles(e) { return musclesDe(e.prim).length + musclesDe(e.sec).length > 0; }
  // UN POLYARTICULAIRE : au moins 3 muscles principaux et secondaires. Une
  // définition, lue par la priorité du raccourci (§9.18) et par les repos par
  // défaut d'« En faire une routine » (ECRAN-SAISIE §7 quindecies.4, 52-1) —
  // `e` porte `prim` et `sec` (tableaux, ou chaînes « a/b »).
  function estPolyarticulaire(e) {
    return !!e && musclesDe(e.prim).length + musclesDe(e.sec).length >= MUSCLES_POLYARTICULAIRE;
  }
  // Le premier critère qui diffère départage (priorité, puis séries, puis rang).
  function avantDans(a, b) {
    if (!b) return true;
    for (var k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
    return false;
  }

  // L'estimation d'UN exercice. Retiré (rien à faire) : rien, pas même son
  // changement d'exercice (delta 51-1 ter).
  function dureeExercice(e) {
    var D = DUREE_PAR_DEFAUT;
    var ch = compteDe(e.ch), tr = compteDe(e.tr), deg = compteDe(e.deg);
    if (ch + tr + deg === 0) return 0;
    var repos = e.repos === null || e.repos === undefined ? null : Number(e.repos);
    var t = D.changement;
    if (enDuree(e)) return t + (Number(e.duree) || 0) * tr + (repos || 0) * Math.max(0, tr - 1);
    if (ch > 0) t += ch * D.serie + (ch - 1) * REPOS_ENTRE_CHAUFFES + REPOS_APRES_CHAUFFES;
    t += tr * (D.serie + (repos === null ? D.reposSuperset : repos));
    t += deg * D.degressive;
    return t;
  }

  // LA DURÉE ESTIMÉE (une seule fonction), en secondes.
  function dureeEstimee(structure) {
    return (structure || []).reduce(function (t, e) { return t + (e ? dureeExercice(e) : 0); }, 0);
  }

  function copieStructure(structure) {
    return (structure || []).map(function (e) {
      return { slug: e.slug, mesure: e.mesure === undefined ? null : e.mesure,
               repos: e.repos === undefined ? null : e.repos,
               ch: compteDe(e.ch), tr: compteDe(e.tr), deg: compteDe(e.deg),
               duree: e.duree === undefined ? null : e.duree,
               prim: musclesDe(e.prim), sec: musclesDe(e.sec) };
    });
  }

  // RACCOURCIR JUSQU'À LA CIBLE (§9.18), dans l'ordre, en recalculant à chaque
  // pas et en s'arrêtant dès que l'estimation tient. Rend `{ exercices,
  // journal, duree_s, tient }` : la structure (un exercice retiré ou mis à part
  // y reste, à zéro, à sa place), ce qui a changé et pourquoi, l'estimation, et
  // si la cible tient — une cible inatteignable rend la version la plus courte
  // avec `tient = false` (51-1 bis, T4). Pure ; la structure reçue n'est jamais
  // modifiée.
  function raccourcirRoutine(structure, cibleMin) {
    var r = copieStructure(structure);
    var max = Number(cibleMin) * SECONDES_PAR_MINUTE;
    var journal = [];
    var tient = function () { return dureeEstimee(r) <= max; };
    var fin = function () { return { exercices: r, journal: journal, duree_s: dureeEstimee(r), tient: tient() }; };
    var premier = -1;
    r.forEach(function (e, i) { if (premier < 0 && aDesMuscles(e)) premier = i; });
    var priorite = function (e, i) {
      if (i === premier) return PRIORITE_PREMIER;
      return estPolyarticulaire(e) ? PRIORITE_POLY : PRIORITE_ISOLATION;
    };
    if (tient()) return fin();

    // 1. le cardio de fin (sans muscle, après le premier rang) : mis à part.
    r.forEach(function (e, i) {
      if (i === 0 || aDesMuscles(e) || e.ch + e.tr + e.deg === 0) return;
      journal.push({ quoi: 'cardio_fin', i: i, slug: e.slug });
      e.ch = 0; e.tr = 0; e.deg = 0; e.duree = 0;
    });
    if (tient()) return fin();

    // 2. le cardio de début (sans muscle, au premier rang) : 3 minutes.
    var e0 = r[0];
    if (e0 && !aDesMuscles(e0) && enDuree(e0) && e0.tr > 0 && Number(e0.duree) > DUREE_PAR_DEFAUT.cardioDebut) {
      journal.push({ quoi: 'cardio_debut', i: 0, slug: e0.slug, avant: Number(e0.duree), apres: DUREE_PAR_DEFAUT.cardioDebut });
      e0.duree = DUREE_PAR_DEFAUT.cardioDebut;
    }
    if (tient()) return fin();

    // 3. les dégressives, dans l'ordre de la séance.
    for (var k = 0; k < r.length; k++) {
      while (r[k].deg > 0 && !tient()) {
        r[k].deg--;
        journal.push({ quoi: 'degressive', i: k, slug: r[k].slug });
      }
      if (tient()) return fin();
    }

    // 4. une série de travail en moins, à chaque tour : la plus basse priorité,
    // puis le plus de séries, puis le plus loin. Planchers : 2 séries, 1 pour
    // l'isolation. Un exercice sans muscle n'est jamais coupé.
    for (;;) {
      if (tient()) return fin();
      var choix = -1, cle = null;
      r.forEach(function (e, i) {
        if (!aDesMuscles(e)) return;
        var p = priorite(e, i);
        if (e.tr <= (p === PRIORITE_ISOLATION ? PLANCHER_ISOLATION : PLANCHER_COMPOSE)) return;
        var c = [p, -e.tr, -i];
        if (avantDans(c, cle)) { choix = i; cle = c; }
      });
      if (choix < 0) break;
      r[choix].tr--;
      journal.push({ quoi: 'serie', i: choix, slug: r[choix].slug });
    }

    // 5. un exercice entier (avec ses chauffes), seulement si chacun de ses
    // muscles principaux est muscle principal d'un autre exercice gardé ;
    // jamais le premier, jamais un exercice sans muscle principal.
    for (;;) {
      if (tient()) return fin();
      var retire = -1, cleR = null;
      r.forEach(function (e, i) {
        if (i === premier || !e.prim.length || e.ch + e.tr + e.deg === 0) return;
        var couvert = e.prim.every(function (m) {
          return r.some(function (f, j) { return j !== i && f.tr > 0 && f.prim.indexOf(m) >= 0; });
        });
        if (!couvert) return;
        var c = [priorite(e, i), -i];
        if (avantDans(c, cleR)) { retire = i; cleR = c; }
      });
      if (retire < 0) break;
      r[retire].ch = 0; r[retire].tr = 0; r[retire].deg = 0;
      journal.push({ quoi: 'retire', i: retire, slug: r[retire].slug });
    }
    return fin();
  }

  // LA STRUCTURE D'UNE ROUTINE DE L'APP. `exercices` : ceux d'une routine
  // normalisée (au vocabulaire de la saisie, `THRoutines.enSaisie`) ; `index` :
  // le catalogue indexé par slug. Le repos est celui programmé ; sans lui, porté
  // par le suivant du même superset (`null`), sinon le repos le plus courant.
  function structureDeRoutine(exercices, index) {
    var exos = exercices || [];
    var idx = index || {};
    return exos.map(function (e, i) {
      var cat = idx[e.exercise_slug] || {};
      var series = (e && e.series) || [];
      // Le type d'une ligne, par la seule règle (`typeDe` : `travail` quand il manque).
      var nb = function (t) { return series.filter(function (s) { return Modele().typeDe(s) === t; }).length; };
      var g = e.groupe_superset;
      var suivant = exos[i + 1];
      var porte = g !== null && g !== undefined && !!suivant && suivant.groupe_superset === g;
      var repos = e.repos_cible_s !== null && e.repos_cible_s !== undefined ? Number(e.repos_cible_s)
        : (porte ? null : DUREE_PAR_DEFAUT.reposSansReglage);
      var d = null;
      series.forEach(function (s) { if (d === null && s && s.duree_s !== null && s.duree_s !== undefined) d = Number(s.duree_s); });
      return { slug: e.exercise_slug, mesure: cat.mesure || null, repos: repos,
               ch: nb('echauffement'), tr: nb('travail') + nb('echec'), deg: nb('degressive'),
               duree: d, prim: cat.muscles_primaires || [], sec: cat.muscles_secondaires || [] };
    });
  }

  // §9.18 (51-1 ter) — LA STRUCTURE D'UNE SEMAINE ALLÉGÉE, pour l'estimation
  // seulement : les séries de travail d'un exercice coaché (muscles, mesure en
  // charge ou en reps) passent à leur part allégée (`seriesAllegees`, §14.4).
  // Une estimation : à l'écran de la routine, on ne sait pas encore quels
  // exercices auront une consigne ce jour-là.
  function structureAllegee(structure) {
    return copieStructure(structure).map(function (e) {
      if (aDesMuscles(e) && !enDuree(e) && e.tr > 0) e.tr = seriesAllegees(e.tr);
      return e;
    });
  }

  // LA ROUTINE RACCOURCIE, pour démarrer la séance : les mêmes lignes, moins
  // celles que le raccourci retire — les DERNIÈRES séries de travail, les
  // dégressives, les exercices retirés ; les chauffes d'un exercice gardé
  // restent toutes. Le cardio de début garde sa ligne (la durée visée n'est
  // pas une colonne de la séance). Rend `{ routine, retires }` : une COPIE (la
  // routine n'est jamais touchée, ECRAN-SAISIE §6.3) et les identifiants de
  // ligne des exercices retirés ou mis à part.
  function appliquerRaccourci(routine, resultat) {
    var r = (resultat && resultat.exercices) || [];
    var retires = [];
    var exercices = [];
    ((routine && routine.exercices) || []).forEach(function (e, i) {
      var x = r[i];
      if (!x) { exercices.push(e); return; }
      if (x.ch + x.tr + x.deg === 0) { if (e.id !== undefined && e.id !== null) retires.push(e.id); return; }
      var garde = { echauffement: x.ch, travail: x.tr, echec: 0, degressive: x.deg };
      var vus = { echauffement: 0, travail: 0, echec: 0, degressive: 0 };
      var series = (e.series || []).filter(function (s) {
        var t = Modele().typeDe(s);
        if (t === 'echec') t = 'travail';
        vus[t] = (vus[t] || 0) + 1;
        return vus[t] <= (garde[t] || 0);
      });
      exercices.push(Object.assign({}, e, { series: series }));
    });
    return { routine: Object.assign({}, routine, { exercices: exercices }), retires: retires };
  }

  // LES PHRASES (la voix du coach, un seul formateur : `nombreFr`). Arrondies à
  // la minute, toujours « (estimation) ».
  function minutesDe(s) { return Math.round((Number(s) || 0) / SECONDES_PAR_MINUTE); }
  function minutesFr(s, cle) { return nombreFr(minutesDe(s), regle(cle || 'estimation')); }
  function texteDureeEstimee(s) { return 'Environ ' + minutesFr(s) + ' min (estimation)'; }
  function texteDureeAllegee(s) { return 'Semaine allégée : environ ' + minutesFr(s) + ' min (estimation)'; }
  // 60-4 — la durée d'une routine du PROGRAMME CONSTRUIT, sur sa carte : « ≈ 69 min » (insécables). La même
  // minute que les phrases ci-dessus (`minutesDe`) : l'aperçu ne l'arrondit pas à part.
  function texteDureeCourte(s) { return '\u2248\u00a0' + minutesFr(s) + '\u00a0min'; }

  // LA CARTE (§9.18 ; maquette `maquette-adapter-v1.html`). `avant` : la
  // structure complète ; `resultat` : `raccourcirRoutine` ; `nommer(slug)`.
  // Une cible inatteignable ne se promet pas (51-1 bis, T4) : « Au plus court :
  // 35 min (estimation) », bouton « Raccourcir à 35 min ».
  function carteRaccourcir(avant, resultat, cibleMin, nommer) {
    var nom = function (slug) { return nommer ? nommer(slug) : slug; };
    var apres = (resultat && resultat.exercices) || [];
    var lignes = [];
    (avant || []).forEach(function (a, i) {
      var b = apres[i];
      if (!b) return;
      var ta = compteDe(a.tr), ca = compteDe(a.ch), da = compteDe(a.deg);
      if (ta + ca + da > 0 && b.ch + b.tr + b.deg === 0) {
        lignes.push(aDesMuscles(a) ? nom(a.slug) + ' : retiré, ses muscles sont déjà travaillés'
                                   : nom(a.slug) + ' : mis à part pour aujourd’hui');
        return;
      }
      if (enDuree(a) && Number(a.duree) !== Number(b.duree)) {
        lignes.push(nom(a.slug) + ' ' + minutesFr(a.duree, 'duree.avant') + ' → ' + minutesFr(b.duree, 'duree.apres') + ' min');
        return;
      }
      if (ta !== b.tr) {
        lignes.push(nom(a.slug) + ' ' + nombreFr(ta, regle('series.avant')) + ' → ' +
          nombreFr(b.tr, regle('series.apres')) + (b.tr > 1 ? ' séries' : ' série'));
      }
      if (da > 0 && b.deg < da) lignes.push(nom(a.slug) + ' : sans dégressive');
    });
    var tient = !!(resultat && resultat.tient);
    var court = resultat ? resultat.duree_s : 0;
    return {
      tient: tient,
      titre: tient ? 'Pour tenir en ' + nombreFr(cibleMin, regle('cible')) + ' min (estimation)'
                   : 'Au plus court : ' + minutesFr(court) + ' min (estimation)',
      lignes: lignes,
      phrase: 'Tous tes muscles du jour gardent leurs premières séries : ce sont celles qui comptent le plus. ' +
              'Les charges ne changent pas.',
      oui: tient ? 'Raccourcir' : 'Raccourcir à ' + minutesFr(court) + ' min',
      non: 'Garder la séance'
    };
  }

  // ── LES CIBLES DE « J'AI PEU DE TEMPS » (60-1, QUESTIONNAIRE-COACH-V2 §4) ──
  //
  // La durée DÉCLARÉE au profil (`duree_seance_min`) devient la cible proposée
  // quand la routine la dépasse : « Tenir en 60 min ». Sinon, les deux cibles
  // d'avant (45 et 60), celles qui sont plus courtes que la routine. Une seule
  // fonction, une seule règle : l'app lui passe la durée estimée (en secondes)
  // et la valeur du profil, elle ne compare rien elle-même.
  //
  // ⚠️ UNE DURÉE DÉCLARÉE QUI NE TIENT PAS (vide, hors de l'intervalle de la
  // base, pas un entier) N'EST PAS UNE CIBLE : on retombe sur les deux d'avant,
  // jamais sur une cible inventée. Les bornes sont celles de
  // `profiles_rythme_borne` (10 à 300 minutes) — une valeur hors bornes ne vient
  // pas du profil, elle vient d'un cache ou d'un test.
  // Et une durée déclarée qui ne dépasse pas la routine ne propose RIEN de
  // plus : la routine tient dans le temps que la personne a dit avoir.
  var CIBLES_TEMPS_PAR_DEFAUT = Object.freeze([45, 60]);
  var DUREE_DECLAREE_MIN = 10, DUREE_DECLAREE_MAX = 300;

  function dureeDeclaree(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return Math.floor(n) === n && n >= DUREE_DECLAREE_MIN && n <= DUREE_DECLAREE_MAX ? n : null;
  }

  // Rend `[{ min, declaree }]`, de la plus courte à la plus longue.
  function ciblesDeTemps(dureeS, declareeMin) {
    var d = dureeDeclaree(declareeMin);
    if (d !== null && d * SECONDES_PAR_MINUTE < dureeS) return [{ min: d, declaree: true }];
    return CIBLES_TEMPS_PAR_DEFAUT.filter(function (m) { return m * SECONDES_PAR_MINUTE < dureeS; })
      .map(function (m) { return { min: m, declaree: false }; });
  }

  // CE QUE LA PERSONNE A DIT DE SON TEMPS, lu sur une routine (MOTEUR §9.18, 60-2b).
  // Seulement quand une durée visée est DÉCLARÉE et que l'estimation la dépasse
  // (`ciblesDeTemps` : la cible déclarée existe) — la semaine allégée est écartée
  // avant, par l'appelant ; « Juste un carnet » se tait ici (le coach ne propose rien).
  //   · `moins` (« J'ai moins de temps en ce moment ») : la carte de « J'ai peu de temps »
  //     s'ouvre d'elle-même à la durée visée — `ouvrir` donne cette durée, en minutes ;
  //   · `varie` (« Ça varie beaucoup ») : AUCUNE question avant « Démarrer » (un geste de
  //     plus à chaque séance, qu'on finit par fermer sans lire) ; l'estimation se montre
  //     en couleur du coach, pour que le dépassement se voie — `ambre` ;
  //   · `max`, `marge`, vide : rien en séance (le générateur de programme les lira).
  // Rend `{ ouvrir: minutes | null, ambre: booléen }`.
  function reponseDeTemps(tempsReponse, dureeS, declareeMin, intentionProfil) {
    var rien = { ouvrir: null, ambre: false };
    if (coachSeTait(intentionProfil)) return rien;
    var cibles = ciblesDeTemps(dureeS, declareeMin);
    if (!cibles.length || !cibles[0].declaree) return rien;
    // L'ESTIMATION AFFICHÉE (arrondie à la minute) doit dépasser la durée visée : 3 610 s
    // s'écrit « 60 min » — ni carte « tenir en 60 min » ni ambre pour une durée qui ne dépasse pas.
    if (minutesDe(dureeS) <= cibles[0].min) return rien;
    if (tempsReponse === 'moins') return { ouvrir: cibles[0].min, ambre: false };
    if (tempsReponse === 'varie') return { ouvrir: null, ambre: true };
    return rien;
  }

  // 60-4 (G8, MOTEUR §9.18) — LA CIBLE DU PROGRAMME CONSTRUIT. Le programme passe par `raccourcirRoutine` pour tenir
  // la durée que la personne a DÉCLARÉE, et seulement avec « C'est mon maximum », « Moins en ce moment » ou « Ça
  // varie » ; avec « J'ai de la marge » (ou sans réponse) il n'est pas raccourci, et « Juste un carnet » se tait.
  // Rend la durée visée en minutes, ou `null` : pas de raccourci. Les bornes sont celles de la durée déclarée.
  function cibleDuProgramme(tempsReponse, declareeMin, intentionProfil) {
    if (coachSeTait(intentionProfil)) return null;
    if (tempsReponse !== 'max' && tempsReponse !== 'moins' && tempsReponse !== 'varie') return null;
    return dureeDeclaree(declareeMin);
  }

  // Le libellé d'une cible, dans la feuille « J'ai peu de temps » : « 45 min »,
  // ou « Tenir en 60 min » quand c'est la durée de la personne.
  function libelleCibleTemps(cible) {
    var n = nombreFr(cible.min, regle('cible')) + ' min';
    return cible.declaree ? 'Tenir en ' + n : n;
  }

  // ══ §9.20 « J'AI MAL » (51-3) ═══════════════════════════════════════════
  //
  // Sans coach pour la séance, sans compter comme un recul, et jamais bloqué
  // ensuite. AUCUNE RÈGLE NOUVELLE : la séance marquée est NEUTRE (§7.6, par
  // `sansPalierRetenues`), et la reprise passe par la correction de zone et le
  // repli existants (§14.5). Jamais de diagnostic, de localisation, ni de
  // conseil médical : une seule phrase de sécurité, factuelle.

  // « Plus léger, plus de reps » : la zone suivante vers plus de reps, dans
  // l'ordre de la table (lourd → mix → hypertrophie → volume → séries longues) ;
  // séries longues reste. Une zone inconnue n'a pas de suivante.
  function zonePlusDeReps(zone) {
    for (var i = 0; i < ZONES.length; i++) {
      if (ZONES[i].cle === zone) return ZONES[Math.min(ZONES.length - 1, i + 1)].cle;
    }
    return null;
  }

  // La carte de reprise se montre quand la DERNIÈRE séance de l'exercice porte
  // la marque (`douleurs` : une valeur par séance antérieure, dans l'ordre du
  // temps). Elle revient tant que c'est vrai ; une séance sans la marque la
  // fait disparaître.
  function carteReprise(douleurs) {
    var d = douleurs || [];
    return d.length > 0 && d[d.length - 1] === true;
  }

  // LA REPRISE, figée avec la consigne : `null` sans carte. Sinon la zone
  // suivante, et (53-1) LE REPORT vers elle (§9.10) — à défaut, le repli de
  // §14.5 calculé pour elle — `repliEscalier`, la
  // même fonction que l'escalier, contre le MÊME meilleur (celui du compteur) :
  // le dernier palier TENU dans cette zone, strictement sous le meilleur et à
  // 10 % au plus sous lui. I22 le vérifie comme tout repli. Pas de repli (ou
  // pas de meilleur) : pas de « Plus léger » chiffré (§14.5 : repli sauté).
  // La consigne elle-même ne lit jamais la séance douloureuse : elle est neutre.
  //
  // 51-3 bis (D3) — « PLUS LÉGER » EST TOUJOURS PROPOSÉ : quand le repli de
  // §14.5 n'existe pas (aucun palier tenu dans la zone suivante, ou pas de
  // compteur), c'est LE REPLI DE LA REPRISE LONGUE (§9.9) — le cran en dessous
  // (`chargeVoisine`), plafonné à 10 % (`repliDeReprise`) : la règle existante,
  // appelée par ses fonctions, jamais recopiée (`repliDeLaRepriseLongue`).
  function reprisePour(seances, avant, consigne, meilleur, options) {
    var anterieuresSe = anterieures(seances || [], avant);
    if (!carteReprise(anterieuresSe.map(function (se) { return se.douleur === true; }))) return null;
    if (!consigne || consigne.etat === 'silence' || !consigne.ligne || nombre(consigne.palier) === null) return null;
    var zone = zonePlusDeReps(consigne.zone);
    if (zone === null) return null;
    var equipement = (options || {}).equipement;
    // §9.10 (53-1) — « PLUS LÉGER » EST UN CHANGEMENT DE ZONE : la charge se
    // reporte, par la même fonction que la correction à l'étiquette. Sans
    // report (un corps, une aide, un lest, ou séries longues qui restent), les
    // replis d'avant : celui de §14.5, sinon celui de la reprise longue.
    var report = reportSur(seances, avant, consigne.zone, zone, equipement);
    var repli = report === null ? null
      : { source: 'report', palier: nombre(consigne.palier), ligne: [report.charge, report.visee] };
    if (!repli && meilleur) repli = repliEscalier(seances, avant, meilleur, zone);
    if (!repli) repli = repliDeLaRepriseLongue(seances, avant, consigne, zone, equipement);
    return { douleur: true, zone: zone, derniere: anterieuresSe[anterieuresSe.length - 1].debut, repli: repli };
  }

  // §9.9 réutilisé (51-3 bis) : la charge de la reprise longue depuis le palier
  // de la consigne — le cran en dessous, 10 % au plus (au-delà, le palier ;
  // sans cran connu, `null` : « le cran en dessous ») — et la visée bornée à la
  // zone suivante, comme celle du repli de §14.5. Marquée `source`, pour que
  // le plan l'applique comme telle (ce n'est pas un repli d'escalier : I22 ne
  // le juge pas contre le meilleur du compteur, I35 contre lui-même).
  function repliDeLaRepriseLongue(seances, avant, consigne, zone, equipement) {
    var z = zoneParCle(zone);
    var P = nombre(consigne.palier);
    var vues = (seances || []).map(vueDeSeance);
    var charge = repliDeReprise(P, chargeVoisine(vues, avant, P, equipement, -1));
    var niv = nombre(consigne.niveau);
    var vise = niv === null ? z.bas : Math.min(z.haut, Math.max(z.bas, niv));
    return { source: 'reprise_longue', palier: P, ligne: [charge, vise] };
  }

  // « PLUS LÉGER, PLUS DE REPS », appliqué à la consigne de la séance : par le
  // repli de §14.5 (`consigneRepli`, qu'I22 vérifie), ou par le report (§9.10,
  // 53-1) ou le repli de la reprise longue — leur ligne, sans ligne haute. Le
  // plan n'appelle qu'elle.
  function consignePlusLegere(consigne, repli) {
    if (!consigne || !repli) return consigne;
    if (repli.source !== 'reprise_longue' && repli.source !== 'report') return consigneRepli(consigne, repli);
    return Object.assign({}, consigne, { ligne: { charge: repli.ligne[0], vise: repli.ligne[1] }, haut: null,
      plusLegere: { source: repli.source, palier: repli.palier } });
  }

  var TEXTES_DOULEUR = Object.freeze({
    alleger: 'Alléger',
    allegerSous: 'Moins lourd, plus de reps : tu choisis la charge.',
    position: 'Changer de position',
    positionSous: 'Amplitude, écart, tempo : ce qui ne fait pas mal.',
    frere: 'Un frère',
    arreter: 'Arrêter cet exercice',
    arreterSous: 'Passer au suivant : les lignes restantes ne sont pas faites.',
    securite: 'Si la douleur dépasse 5 sur 10, ou ne redescend pas en 24 heures, ' +
              'demande l’avis d’un professionnel.',
    reprisePhrase: 'On reprend comme tu veux. Tu peux toujours changer d’avis depuis l’étiquette de l’exercice.',
    sansCoach: 'Sans coach cette fois'
  });

  // La feuille « J'ai mal » : ses phrases, la voix du coach.
  function feuilleDouleur(nom) {
    var T = TEXTES_DOULEUR;
    return {
      titre: nom + ' : tu as mal',
      phrase: 'Pour aujourd’hui, ' + nom + ' est sans coach : il ne comptera pas comme un recul.',
      choix: [
        { cle: 'alleger', texte: T.alleger, sous: T.allegerSous },
        { cle: 'position', texte: T.position, sous: T.positionSous },
        { cle: 'frere', texte: T.frere, sous: null },
        { cle: 'arreter', texte: T.arreter, sous: T.arreterSous }
      ],
      securite: T.securite
    };
  }

  // La carte de reprise : ses phrases, sans question (§20.2). « Comme avant »
  // dit la consigne normale ; « Plus léger, plus de reps » la ligne du repli,
  // seulement s'il existe.
  function texteRepriseAvant(consigne) {
    var l = consigne && consigne.ligne;
    return l ? 'Comme avant : ' + ligneFois(l.charge, l.vise, false, false, cite(CIBLE, { quoi: 'reprise' })) : null;
  }
  // 51-3 ter (D5, §20 bis) — LE LIBELLÉ NE CONTREDIT JAMAIS SON CHIFFRE. Quand
  // la charge proposée n'est pas plus basse que celle de « Comme avant » (le
  // repli de la reprise longue garde le palier au-delà de 10 %), le choix
  // s'appelle « Plus de reps » : le coach ne dit pas « plus léger » sans l'être.
  // Une charge inconnue se dit « le cran en dessous » (§10.2, rang 4) : elle
  // est plus basse par définition.
  function texteRepriseLeger(repli, consigne) {
    if (!repli) return null;
    var charge = nombre(repli.ligne[0]);
    var avant = consigne && consigne.ligne ? nombre(consigne.ligne.charge) : null;
    var plusLeger = charge === null || avant === null || charge < avant;
    return (plusLeger ? 'Plus léger, plus de reps : ' : 'Plus de reps : ') +
      ligneFois(repli.ligne[0], repli.ligne[1], false, true, cite(CIBLE, { quoi: 'reprise_repli' }));
  }
  function carteRepriseTextes(nom, consigne, reprise) {
    var choix = [{ cle: 'avant', texte: texteRepriseAvant(consigne) }];
    var leger = texteRepriseLeger(reprise && reprise.repli, consigne);
    if (leger) choix.push({ cle: 'leger', texte: leger });
    choix.push({ cle: 'sans', texte: TEXTES_DOULEUR.sansCoach });
    return {
      titre: 'Ta dernière séance de ' + nom + ' était douloureuse.',
      phrase: TEXTES_DOULEUR.reprisePhrase,
      choix: choix
    };
  }

  // Une phrase rédigée pour COMPARER, jamais pour être dite : ses chiffres ne
  // s'inscrivent pas (une capture jetée).
  function sansDeclarer(fn) { return Modele().capturer(fn).texte; }
  var FOIS = INSECABLE + '×' + INSECABLE;

  // Une charge inconnue se dit, elle ne se tait pas : « le cran au-dessus ».
  // C'est le rang 4 du §10.2 rendu visible — le moteur sait qu'il faut monter,
  // il ne sait pas de combien, et il le dit plutôt que d'inventer un chiffre.
  function motDuCran(tete, dessous) {
    var mot = 'le cran ' + (dessous ? 'en dessous' : 'au-dessus');
    return tete ? mot.charAt(0).toUpperCase() + mot.slice(1) : mot;
  }
  function fragmentCharge(charge, tete, dessous, c) {
    return Modele().charge(charge, motDuCran(tete, dessous), c);
  }
  // « 125 kg × 5 » — une ligne de la consigne, la charge d'abord (§20.2). La
  // visée passe par le formateur, avec la charge : une seule citation.
  function ligneFois(charge, vise, tete, dessous, c) {
    return Modele().chargeFois(charge, vise, motDuCran(tete, dessous), c);
  }

  // ⚠️ L'ORDRE DES DEUX LIGNES EST UNE RÈGLE, pas un goût. La ligne majoritaire
  // passe devant : à trois séries dont deux à 130, on lit « 130 kg × 4 sur les
  // 2 dernières séries » d'abord. Quand une SEULE série porte la nouvelle
  // charge, la charge de travail reprend la tête et le test se dit « puis … sur
  // la dernière série ». Sinon l'œil lit la charge du test comme celle de
  // toute la séance.
  //
  // ⚠️ JAMAIS DE POSITION ABSOLUE (ECRAN-SAISIE §3.12, 48b-5b-3). La consigne
  // ne voit que les séries qu'elle couvre ; à l'écran, une rampe ou une chauffe
  // peut les précéder. « Sur la première » tombait, au squat d'Aurélien, sur la
  // rampe à 120. On parle donc DEPUIS LA FIN : « les 2 dernières », « celle
  // d'avant », « les 3 d'avant ».
  // `nature` : `cible_du_jour` (l'en-tête), ou `cible_suivante` (la suite du
  // constat, « Prochaine séance : … ») — les mêmes lignes, une autre nature.
  function lignesJaunes(c, nature) {
    if (c.etat === 'silence') return [];
    var nat = nature || CIBLE;
    var dessous = c.etat === 'reprise_longue' || c.etat === 'nouvelle_zone';
    var ligne = c.ligne, haut = c.haut;
    var cL = cite(nat, { role: 'ligne' }), cH = cite(nat, { role: 'haut' });
    if (!haut) return [ligneFois(ligne.charge, ligne.vise, true, dessous, cL)];
    if (!ligne) return [ligneFois(haut.charge, haut.vise, true, false, cH)];
    if (haut.k === 1) {
      return [
        ligneFois(ligne.charge, ligne.vise, true, dessous, cL),
        'puis ' + ligneFois(haut.charge, haut.vise, false, false, cH) + ' sur la dernière série'
      ];
    }
    var restantes = c.n - haut.k;
    return [
      ligneFois(haut.charge, haut.vise, true, false, cH) + ' sur les ' + nombreFr(haut.k, regle('series')) + ' dernières séries',
      ligneFois(ligne.charge, ligne.vise, false, dessous, cL) +
        (restantes === 1 ? ' sur celle d\'avant' : ' sur les ' + nombreFr(restantes, regle('series')) + ' d\'avant')
    ];
  }

  // §3.12 (49-U1, ECRAN-SAISIE révisé le 26/09/2026) — L'EN-TÊTE DÉCRIT LA
  // SÉANCE, plus le `n` de la consigne brute. `roles` : la disposition de la
  // consigne sur les séries de travail de la séance, dans l'ordre — `haut` pour
  // une ligne de test, `ligne` sinon (la couverture du plan de séance, §9.13
  // bis). Une routine à 3 sur un historique à 4 se dit « 130 kg × 4 sur les 2
  // dernières séries » et « 125 kg × 5 sur celle d'avant », pas « les 2 d'avant ».
  //
  // Les formes habituelles — des lignes à la charge de travail puis des tests —
  // gardent leurs phrases, mot pour mot. Une forme inhabituelle (un test déjà
  // fait, puis une série ajoutée) se dit dans l'ordre, segment par segment.
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
      // §9.13 (49-U18) — la même source que la couverture : une ligne sans la
      // ligne de son rôle prend l'autre (« rejoint » sans ligne basse : la
      // ligne est à la charge du haut).
      var src = r === 'haut' ? (c.haut || c.ligne) : (c.ligne || c.haut);
      var der = segments[segments.length - 1];
      if (der && der.role === r) { der.nombre++; return; }
      segments.push({ role: r, charge: src ? src.charge : null, vise: src ? src.vise : null, nombre: 1 });
    });
    if (!segments.length) return { jaune: [], segments: [] };
    // Et quand TOUS les segments disent les mêmes chiffres (la ligne à la
    // charge du haut), la ligne jaune les dit une fois : « 92 kg × 11 ». Les
    // segments, eux, gardent leurs rôles (I6).
    var unSeul = segments.every(function (x) {
      return memeCharge(nombre(x.charge), nombre(segments[0].charge)) && x.vise === segments[0].vise;
    });
    if (segments.length > 1 && unSeul && segments[0].vise !== null && segments[0].vise !== undefined) {
      return { jaune: [ligneFois(segments[0].charge, segments[0].vise, true, false,
        cite(CIBLE, { role: segments[0].role }))], segments: segments };
    }
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
    var dessous = c.etat === 'reprise_longue' || c.etat === 'nouvelle_zone';
    var jaune = segments.map(function (s, i) {
      if (s.charge === undefined || s.vise === undefined) return null;
      var tete = i === 0;
      return (tete ? '' : 'puis ') + ligneFois(s.charge, s.vise, tete, s.role === 'ligne' && dessous,
        cite(CIBLE, { role: s.role })) +
        (s.nombre === 1 ? ' sur une série' : ' sur ' + nombreFr(s.nombre, regle('series')) + ' séries');
    }).filter(Boolean);
    return { jaune: jaune, segments: segments };
  }

  // La phrase grise. `reference` : la date de la séance pour laquelle la
  // consigne est calculée (`avant`) — c'est contre elle que « mardi » se dit.
  //
  // ⚠️ PLUS DE « PAS DE PALIER » (§20.2, 49-U9). Depuis le §7.6 (49-U8), une
  // séance sans charge répétée prend sa plus lourde charge tenue dans la zone,
  // ou devient neutre : la chaîne complète ne rend plus jamais ce silence. Seul
  // un contrat brut, sans la règle, y tombe encore — et il n'a rien à dire.
  // §9.9 (delta 49-36) — LA RAISON D'UNE VISÉE BORNÉE, dite avec elle (C,
  // principe iii : un chiffre qui change sans raison visible porte sa raison).
  // « Ta zone Mix va jusqu'à 8 : je vise 8. » Rien quand la borne ne joue pas.
  function phraseBorneZone(f) {
    var b = f && f.borneZone;
    var z = b ? zoneParCle(b.zone) : null;
    if (!z) return '';
    return ' Ta zone ' + z.libelle + ' va jusqu\'à ' + nombreFr(z.haut, regle('zone.haut')) + DEUX_POINTS +
           'je vise ' + nombreFr(z.haut, regle('zone.haut')) + '.';
  }

  // §20 (49-U18, principe i) — LE MOT D'ORDRE SE DÉDUIT DU RANG, JAMAIS
  // D'UNE HYPOTHÈSE. La série restée à l'ancien palier (« rejoint », une seule)
  // se lit dans la dernière séance du fondement (`f.seance`) : la première de
  // son échelle (une montée), la dernière, ou entre les deux (« ta série
  // restée »).
  function rangDuReste(f) {
    var echelle = (f.seance || []).filter(function (s) {
      return s && (ROLES_VOTANTS[s.role] === true || ROLES_RESTE[s.role] === true);
    });
    var ou = [];
    echelle.forEach(function (s, i) {
      if (memeCharge(nombre(s.charge_kg), nombre(f.palierPrecedent))) ou.push(i);
    });
    if (ou.length !== 1 || echelle.length < 2) return 'série restée';
    if (ou[0] === 0) return 'première série';
    return ou[0] === echelle.length - 1 ? 'dernière série' : 'série restée';
  }

  // La citation de la série restée porte le MOT D'ORDRE écrit (« première »,
  // « dernière », ou aucun) : la garde de cohérence le compare au rang qu'elle
  // relit elle-même dans le fondement (§20 bis), jamais à ce calcul-ci.
  function citeDuReste(f) {
    var mot = rangDuReste(f);
    return cite(FAIT, { quoi: 'reste',
      ordre: mot === 'première série' ? 'première' : mot === 'dernière série' ? 'dernière' : null });
  }

  function phraseGrise(c, reference) {
    var f = c.fondement || {};
    var z = zoneParCle(c.zone);
    var hi = z === null ? null : z.haut;
    // §20 bis (49-U19) — des fragments RÉDIGÉS À LA DEMANDE : un fragment
    // qu'une branche n'écrit pas ne doit rien déclarer.
    var jour = function () { return f.date ? quand(f.date, reference, true, cite(FAIT, { quoi: 'palier' })) : ''; };
    var auPalier = function () { return serieFr(c.palier, f.reps, cite(FAIT, { quoi: 'palier' })); };
    var t = f.test || null;
    var cT = cite(FAIT, { quoi: 'test' });
    var duTest = function () {
      return t === null ? '' : 'Ton test à ' + enKg(t.charge, cT) + ', ' + quand(t.date, reference, false, cT) + ', ';
    };
    var rate = function () {
      return t === null ? '' :
        quand(t.date, reference, true, cT) + DEUX_POINTS + chargeFois(t.charge, t.reps, cT) +
        ', pas encore dans ta zone.';
    };

    switch (c.etat) {
      case 'silence':
        if (c.raison === 'premiere_fois') {
          return 'Première fois ici' + DEUX_POINTS + 'ce que tu notes aujourd\'hui servira de départ.';
        }
        return '';

      case 'progression':
        // ⚠️ L'ANNONCE DU RETEST NE SE DIT QU'À UN SEUL CRAN. À deux crans, le
        // coach ne sait pas encore ce qu'il retestera : promettre « on le
        // retestera » serait promettre une charge qu'il va réduire.
        if (t !== null) return rate() + (f.testUnCran ? ' On le retestera au haut de ta zone.' : '');
        // La note de la série à fond REMPLACE « une rep de plus », elle ne s'y
        // ajoute pas : une seule phrase grise par en-tête.
        // Dite PAR SA CHARGE, jamais par son rang.
        if (f.serieAFond) {
          var a = f.serieAFond;
          return 'Ta série à ' + chargeFois(a.charge, a.reps, cite(FAIT, { quoi: 'a_fond' })) + ', à ' +
                 (a.cause === 'rpe' ? 'RPE ' + nombreFr(10, regle('constante')) : 'fond') + ', compte pour ' +
                 nombreFr(a.comptees, regle('a_fond.comptees')) + '.';
        }
        return jour() + DEUX_POINTS + auPalier() + '. Une rep de plus.';

      case 'test_propose':
        return jour() + DEUX_POINTS + auPalier() + ', ' +
               (f.preuve === 'haut' ? nombreFr(PREUVE_DEPASSEMENT, regle('constante')) + ' reps au-dessus du haut'
                : f.preuve === 'facile' ? 'avec de la marge'
                : 'le haut de ta zone') + '. ' +
               (f.preuve ? 'On teste deux crans au-dessus' : 'On teste le cran au-dessus') + '.';

      case 'garde':
        if (t.niveau === z.bas) {
          return duTest() + 'est au bas de ta zone' + DEUX_POINTS + 'on le garde sur la dernière série.';
        }
        return duTest() + 'est dans ta zone' + DEUX_POINTS +
               'on le garde sur la dernière série jusqu\'à ' + nombreFr(hi, regle('zone.haut')) + ' reps.';

      case 'etend':
        return duTest() + (t.niveau >= hi ? 'a touché le haut de ta zone' : 'est dans ta zone') +
               DEUX_POINTS + 'il gagne une série.';

      // « Ta première série à 88 kg » : l'ancienne charge de travail est dans
      // le fondement ; le mot d'ordre se lit sur le RANG de la série restée
      // (`rangDuReste`, 49-U18) — « dernière » était écrit d'office, faux sur
      // une montée (88, 92, 92 ; N5 : 125, 130, 130).
      case 'rejoint':
        return (c.ligne ? 'Une série de plus passe à '
                        : 'Ta ' + rangDuReste(f) + ' à ' + enKg(f.palierPrecedent, citeDuReste(f)) + ' passe à ') +
               enKg(c.haut.charge, cite(CIBLE, { role: 'haut' })) + '.';

      case 'attend':
        return c.n - c.haut.k === 1
          ? 'Ta série restée à ' + enKg(f.palierPrecedent, cite(FAIT, { quoi: 'reste' })) + ' passera à ' +
            enKg(c.haut.charge, cite(CIBLE, { role: 'haut' })) + ' quand tu y feras ' + nombreFr(f.seuil, regle('seuil')) + ' reps.'
          : 'Tes séries restées à ' + enKg(f.palierPrecedent, cite(FAIT, { quoi: 'reste' })) + ' passeront à ' +
            enKg(c.haut.charge, cite(CIBLE, { role: 'haut' })) + ' une à une, quand tu y feras ' + nombreFr(f.seuil, regle('seuil')) + ' reps.';

      case 'tout_passe':
        if (t !== null) {
          return duTest() + 'a touché le haut de ta zone' + DEUX_POINTS + 'tout passe à ' +
                 enKg(c.haut.charge, cite(CIBLE, { role: 'haut' })) + '.';
        }
        return jour() + DEUX_POINTS + auPalier() + ', le haut de ta zone. Tout passe à ' +
               enKg(c.haut.charge, cite(CIBLE, { role: 'haut' })) + '.';

      case 'retest_un_cran':
        return rate() + ' On reteste d\'un seul cran.';

      // §9.2 bis (49-U12) — un fait, puis sa conséquence : « Mardi : 80 kg ×
      // 10, 10, 6. Je ne compte pas la dernière série : on tient 80 kg × 10. »
      case 'tenue_apres_chute':
        return jour() + DEUX_POINTS + auPalier() + '. Je ne compte pas la dernière série' + DEUX_POINTS +
               'on tient ' + chargeFois(c.ligne.charge, c.ligne.vise, cite(CIBLE, { role: 'ligne' })) + '.';

      case 'etirement':
        return 'Ta machine ne permet pas un plus petit cran' + DEUX_POINTS + 'ta zone s\'étire. ' +
               'On retestera ' + enKg(t.charge, cite(FAIT, { quoi: 'test' })) + ' quand tu feras ' + nombreFr(f.cible, regle('cible')) +
               ' reps à ' + enKg(c.ligne.charge, cite(CIBLE, { role: 'ligne' })) + '.';

      case 'retest':
        return nombreFr(f.cible, regle('cible')) + ' reps à ' + enKg(c.ligne.charge, cite(CIBLE, { role: 'ligne' })) + DEUX_POINTS +
               'on retente ' + enKg(t.charge, cite(CIBLE, { role: 'haut' })) + '.';

      case 'reprise_courte':
        return 'Reprise après une pause' + DEUX_POINTS + 'ta charge de travail, sans rep de plus.' +
               phraseBorneZone(f);

      // Et RIEN sur la durée de l'absence (CADRAGE §3.1 bis).
      case 'reprise_longue':
        // §9.9 (delta 49-13) — le cran d'en dessous descendait de plus de
        // 10 % : la consigne garde la charge de travail. §20.2 (49-U9) — la
        // phrase le distingue enfin de la reprise courte.
        if (c.ligne && memeCharge(nombre(c.ligne.charge), nombre(c.palier))) {
          return 'Longue pause' + DEUX_POINTS + 'on reprend à ta charge de travail, sans rep de plus.' +
                 phraseBorneZone(f);
        }
        return 'Longue pause' + DEUX_POINTS + 'on reprend un cran en dessous' +
               (c.ligne && nombre(c.ligne.charge) !== null ? ', à ' + enKg(c.ligne.charge, cite(CIBLE, { role: 'ligne' })) : '') +
               '. Le test te ramènera à ' + enKg(c.palier, cite(FAIT, { quoi: 'palier' })) + '.' + phraseBorneZone(f);

      // Le « 3 » se lit sur la table du rangement, il ne se recopie pas : sous
      // la première borne, il n'y a plus de zone (§9.1.2).
      case 'bord':
        return 'Sous ' + nombreFr(RANGEMENT[0].jusqua + 1, regle('constante')) + ' reps, pas de rep de plus' + DEUX_POINTS +
               'le cran au-dessus, aux mêmes reps.';

      // §9.17 — AU POIDS DU CORPS, au haut de la zone, deux séances de suite :
      // la ligne tient, et la carte du lest parle (une fois). Le coach ne dit
      // pas « palier » : « le haut de ta zone », comme partout.
      case 'carte_lest':
        return jour() + DEUX_POINTS + auPalier() + ', le haut de ta zone.';

      // §9.17 — sans cran à monter, les reps continuent : une de plus que la
      // dernière fois, au-delà de la zone. La même phrase que la progression,
      // parce que c'est la même chose dite à un corps.
      case 'etirement_reps':
        return jour() + DEUX_POINTS + auPalier() + '. Une rep de plus.';

      // §8.4 / §9.17 — la version lestée démarre de l'exercice libre : le saut
      // de lest, au bas de la zone. Aucune séance à raconter : elle n'existe pas.
      case 'depart_leste':
        return 'Première fois avec du lest' + DEUX_POINTS + 'on commence à ' +
               enKg(c.ligne.charge, cite(CIBLE, { role: 'ligne' })) + ', au bas de ta zone.';

      // §9.21 (52-1) — la charge de départ de la routine, la première fois.
      case 'depart_routine':
        return 'Première fois ici' + DEUX_POINTS + 'on part de ta charge de départ, ' +
               enKg(c.ligne.charge, cite(CIBLE, { role: 'ligne' })) + '.';

      // §9.10 (53-1) — la zone a changé : d'où vient la charge, la séance
      // citée. L'estimation reste en coulisse : jamais un maximum.
      case 'nouvelle_zone':
        return phraseNouvelleZone(c, reference);
    }
    return '';
  }

  // « Nouvelle zone : Mix. Ta charge déjà tenue en Mix, le 8 déc. : 110 kg × 6. »
  // « Nouveau bloc : Mix. Ta charge déjà tenue en Mix, le 8 déc. : 110 kg × 6. »
  // « Nouvelle zone : Mix. Estimée depuis ton 125 kg × 4, un peu en dessous pour démarrer. »
  // « Nouvelle zone : Mix. Moins de reps, plus de charge : estimée depuis ton 52,5 kg × 10. »
  //
  // §9.10 (53-1 bis) — LA PHRASE DIT LE VRAI SENS : quand la charge estimée
  // MONTE au-dessus du dernier palier (vers une zone de moins de reps), « un
  // peu en dessous » sonnerait faux à côté d'une charge qui monte.
  function reportMonte(c) {
    var r = (c.fondement || {}).report || {};
    var charge = c.ligne ? nombre(c.ligne.charge) : null;
    var P = nombre(c.palier);
    return r.origine === 'estimee' && charge !== null && P !== null && charge > P && !memeCharge(charge, P);
  }
  function phraseNouvelleZone(c, reference) {
    var r = (c.fondement || {}).report || {};
    var d = r.depuis || {};
    var z = zoneParCle(c.zone);
    var cR = cite(FAIT, { quoi: 'report' });
    // §9.10 (53-2 bis, D1) — même phrase, la tête dit d'où vient la zone :
    // un début de bloc (§9.22) dit « Nouveau bloc », le reste « Nouvelle zone ».
    var tete = (r.ligne === LIGNE_BLOC ? 'Nouveau bloc' : 'Nouvelle zone') + DEUX_POINTS + z.libelle + '. ';
    if (r.origine === 'tenue') {
      return tete + 'Ta charge déjà tenue en ' + z.libelle + ', ' + quand(d.date, reference, false, cR) +
             DEUX_POINTS + chargeFois(d.palier, d.niveau, cR) + '.';
    }
    if (reportMonte(c)) {
      return tete + 'Moins de reps, plus de charge' + DEUX_POINTS + 'estimée depuis ton ' + chargeFois(d.palier, d.niveau, cR) + '.';
    }
    return tete + 'Estimée depuis ton ' + chargeFois(d.palier, d.niveau, cR) + ', un peu en dessous pour démarrer.';
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
  function seanceDuPourquoi(c, reference) {
    var f = c.fondement || {};
    if (!f.seance) return null;
    var z = c.etat === 'silence' ? null : zoneParCle(c.zone);
    var t = f.test || null;
    var Pv = f.palierPrecedent === undefined ? null : f.palierPrecedent;
    var chauffes = [], lignes = [];
    f.seance.forEach(function (s) {
      if (ORIGINES_CHAUFFE[s.origine] === true) { chauffes.push(nombreFr(s.charge_kg, cite(FAIT, { quoi: 'seance', champ: 'charge' }))); return; }
      var role = '';
      if (ROLES_LIGNE[s.origine]) role = ROLES_LIGNE[s.origine];
      else if (s.role === 'exploration') {
        var n = t !== null && nombre(s.charge_kg) === t.charge ? t.niveau : null;
        var dit = niveauDuTest(n, z);
        role = dit === null ? '' : 'test, ' + dit;
      } else if (Pv !== null && nombre(s.charge_kg) === Pv &&
                 (s.role === 'rampe' || s.role === 'travail')) {
        role = 'restée à ' + enKg(s.charge_kg, cite(FAIT, { quoi: 'reste' }));
      } else if (s.role === 'rampe') role = 'rampe, ne compte pas';
      else if (s.role === 'palier') role = 'ta charge de travail';
      lignes.push({ texte: chargeFois(s.charge_kg, s.reps, cite(FAIT, { quoi: 'seance' })), role: role });
    });
    if (chauffes.length) {
      lignes.unshift({
        texte: chauffes.join(', '),
        role: chauffes.length > 1 ? 'chauffes, ne comptent pas' : 'chauffe, ne compte pas'
      });
    }
    return { date: quand(f.date, reference, false, cite(FAIT, { quoi: 'palier' })), lignes: lignes };
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

  // « Ton test à 130 kg a fait 5 reps à RPE 10, compté 4 » — ce qui a été
  // fait, puis ce qui a été compté, et seulement quand les deux diffèrent (§17.4).
  function faitDuTestEnPhrase(c) {
    var t = c.fondement.test;
    var dit = 'Ton test à ' + enKg(t.charge, cite(FAIT, { quoi: 'test' })) + ' a fait ' +
              nombreFr(t.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps';
    if (t.niveau !== null && t.niveau < t.reps) {
      dit += (causeDuTest(c) === 'rpe' ? ' à RPE ' + nombreFr(10, regle('constante')) : ' à fond') +
             ', compté ' + nombreFr(t.niveau, cite(FAIT, { quoi: 'test', champ: 'niveau' }));
    }
    return dit;
  }

  // ⚠️ « TOUCHE L'ÉTIQUETTE POUR LA CHANGER » TERMINE TOUTES LES FORMES
  // (48b-7). La ligne de zone en a trois — choisie, figée par un étirement,
  // déduite — et la porte est la même dans les trois : la dire dans deux cas
  // sur trois, c'est laisser croire que la zone n'est pas toujours corrigible.
  var TOUCHE_ETIQUETTE = ' Touche l\'étiquette pour la changer.';

  function zoneDuPourquoi(c, reference) {
    var z = zoneParCle(c.zone);
    if (z === null) return null;
    var f = c.fondement || {};
    var tete = 'Ta zone' + DEUX_POINTS + z.libelle + ', ' + nombreFr(z.bas, regle('zone.bas')) + ' à ' +
               nombreFr(z.haut, regle('zone.haut')) + ' reps';
    var hS = function () { return nombreFr(f.habitude.seances, regle('habitude.seances')); };
    var hV = function () { return nombreFr(f.habitude.valeur, regle('habitude.valeur')); };

    // Choisie : elle se dit d'abord, et ce que les séances auraient donné
    // ensuite — mais SEULEMENT si c'est autre chose. « Ce serait Lourd » sous
    // une zone Lourd choisie ne dit rien à personne, et sous 3 reps
    // d'habitude il n'y a pas de zone à citer du tout.
    if (f.correction) {
      var d = zoneParCle(f.correction.zoneDeduite);
      if (d === null || d.cle === z.cle || !f.habitude) {
        return tete + ', choisie par toi.' + TOUCHE_ETIQUETTE;
      }
      return tete + ', choisie par toi. D\'après tes ' + hS() +
             ' dernières séances, ce serait ' + d.libelle + DEUX_POINTS +
             'tu fais ' + hV() + ' reps d\'habitude.' + TOUCHE_ETIQUETTE;
    }
    if (f.zoneFigee) {
      return tete + ', celle de ton test ' + quand(f.zoneFigee.date, reference, false, cite(FAIT, { quoi: 'zone_figee' })) + DEUX_POINTS +
             'elle ne bouge pas pendant que ta zone s\'étire.' + TOUCHE_ETIQUETTE;
    }
    if (!f.habitude) return tete + '.' + TOUCHE_ETIQUETTE;
    return tete + '. Sur tes ' + hS() + ' dernières séances, tu fais ' +
           hV() + ' reps d\'habitude.' + TOUCHE_ETIQUETTE;
  }

  // §20.2 (49-U9) — « ta charge de travail », plus « palier ». La série à fond
  // ne s'y répète plus : la phrase grise, en tête de la feuille, la dit déjà.
  function palierDuPourquoi(c) {
    if (c.palier === null || c.palier === undefined) return null;
    var f = c.fondement || {};
    // ⚠️ PAS `.map(nombreFr)` : `map` passe l'INDEX en second argument, et il
    // se déclarait comme la citation (relevé du 01/10).
    var cR = cite(FAIT, { quoi: 'palier', champ: 'reps' });
    return 'Ta charge de travail' + DEUX_POINTS + enKg(c.palier, cite(FAIT, { quoi: 'palier' })) + ', validée à ' + nombreFr(c.niveau, cite(FAIT, { quoi: 'palier', champ: 'niveau' })) +
           ' reps. Tes séries y ont fait ' + (f.reps || []).map(function (r) { return nombreFr(r, cR); }).join(', ') + '.';
  }

  // §3.10 (relevé du 01/10, PR 1 de la consolidation) — LA FEUILLE DÉCRIT LA
  // CONSIGNE QUE LE PLAN APPLIQUE, transformée comprise. Sous une semaine
  // allégée ou un repli, le paragraphe de l'état est la phrase déjà dite en
  // gris pour cette transformation (`detailAllegee`, `phraseRepli`) : la
  // feuille ne dit plus « une rep de plus » quand « Donc » en prescrit deux de
  // moins, et elle ne lit plus une ligne haute que la transformation a ôtée
  // (elle plantait dessus). La série de plus garde l'état, et s'y ajoute.
  function etatDuPourquoi(c, reglage, reference) {
    if (c.allegee) {
      var d = detailAllegee(c);
      return 'Semaine allégée' + DEUX_POINTS + FIN_ALLEGEE +
             (d ? ' ' + d.charAt(0).toUpperCase() + d.slice(1) + '.' : '');
    }
    if (c.repli) return phraseRepli(c.repli, reference);
    var e = etatBrutDuPourquoi(c, reglage);
    if (c.serieDePlus && e) {
      return e + ' ' + GRIS_SERIE_DE_PLUS.charAt(0).toUpperCase() + GRIS_SERIE_DE_PLUS.slice(1) + '.';
    }
    return e;
  }

  function etatBrutDuPourquoi(c, reglage) {
    var f = c.fondement || {};
    var z = zoneParCle(c.zone);
    var t = f.test || null;
    var cT = cite(FAIT, { quoi: 'test' });
    var rate = t === null ? '' :
      'Ton test à ' + enKg(t.charge, cT) + ' a fait ' +
      nombreFr(t.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps' +
      DEUX_POINTS + 'pas encore dans ta zone.';
    var cH = cite(CIBLE, { role: 'haut' }), cL = cite(CIBLE, { role: 'ligne' });

    switch (c.etat) {
      // ⚠️ Le silence « pas de palier » n'a plus de paragraphe (§20.2, 49-U9) :
      // la chaîne complète ne le rend plus depuis le §7.6.
      case 'silence':
        return c.raison === 'premiere_fois'
          ? 'Rien avant aujourd\'hui' + DEUX_POINTS + 'ce que tu notes servira de départ.'
          : null;

      case 'progression':
        return (t !== null ? rate + ' ' : '') +
          'Ta charge de travail n\'est pas encore au haut de ta zone' + DEUX_POINTS +
          'une rep de plus sur chaque série.';

      case 'test_propose':
        var tete = reglage === 'prudent'
          ? 'Toutes tes séries ont touché le haut, deux séances de suite'
          : (c.niveau !== null && z !== null && c.niveau >= z.haut
              ? 'Ta charge de travail a touché le haut de ta zone'
              : 'Une de tes séries a touché le haut de ta zone');
        var dit = tete + DEUX_POINTS + 'on teste le cran au-dessus sur la dernière série.';
        if (f.preuve) {
          var ecart = c.haut.charge === null ? null : c.haut.charge - c.ligne.charge;
          var pourcent = ecart === null ? null : Math.round(ecart / c.ligne.charge * 1000) / 10;
          // « dans la limite de 10 % » : l'égalité est permise (§9.8), « sous »
          // disait le contraire.
          dit += ' ' + (f.preuve === 'haut'
              ? 'Tu as dépassé le haut de ' + nombreFr(PREUVE_DEPASSEMENT, regle('constante')) + ' reps'
              : 'Tu avais de la marge') +
            DEUX_POINTS + 'deux crans, ' + enKg(ecart, regle('ecart')) + ', soit ' +
            nombreFr(pourcent, regle('ecart.pourcent')) + INSECABLE + '% de plus, ' +
            'dans la limite de ' + nombreFr(Math.round(MARGE_DOUBLE_SAUT * 100), regle('constante')) + INSECABLE + '%.';
        }
        return dit;

      case 'garde':
        if (t.niveau === z.bas) {
          return faitDuTestEnPhrase(c) + ', le bas de ta zone' + DEUX_POINTS + 'il tient. ' +
                 'On le garde sur la dernière série ; à ' + nombreFr(z.bas + 1, regle('zone.bas+1')) + ' reps, il gagnera une série.';
        }
        return faitDuTestEnPhrase(c) + ', dans ta zone. En Prudent, il reste sur la dernière ' +
               'série jusqu\'à ' + nombreFr(z.haut, regle('zone.haut')) + ' reps ; alors la série d\'avant le rejoindra.';

      case 'etend':
        return faitDuTestEnPhrase(c) + ', ' + niveauDansPhrase(t.niveau, z) + DEUX_POINTS +
               'il gagne une série. La nouvelle charge gagne tes séries une par séance, ' +
               'de la dernière à la première.';

      case 'tout_passe':
        var fin = DEUX_POINTS + 'en Franc, toutes tes séries passent à ' +
                  enKg(c.haut.charge, cH) + '.';
        if (t !== null) {
          return faitDuTestEnPhrase(c) + ', ' + niveauDansPhrase(t.niveau, z) + fin;
        }
        return 'Tes séries à ' + enKg(c.haut.charge, cH) + ' ont touché le haut de ta zone' + fin;

      // Le mot d'ordre se lit sur le RANG (`rangDuReste`, 49-U18) — la même
      // fonction que la phrase grise : « ta dernière série » était écrit
      // d'office ici, et contredisait l'en-tête du couché le 01/10.
      case 'rejoint':
        return enKg(c.haut.charge, cH) + ' a pris la majorité de tes séries' + DEUX_POINTS +
               (c.ligne ? 'une série de plus' : 'ta ' + rangDuReste(f)) + ' passe de ' +
               enKg(f.palierPrecedent, c.ligne ? cite(FAIT, { quoi: 'reste' }) : citeDuReste(f)) + ' à ' +
               enKg(c.haut.charge, cH) + '.';

      case 'attend':
        return enKg(c.haut.charge, cH) + ' a pris la majorité de tes séries. ' +
               (c.n - c.haut.k === 1
                 ? 'Ta série restée à ' + enKg(f.palierPrecedent, cite(FAIT, { quoi: 'reste' })) + ' y passera quand tu feras '
                 : 'Tes séries restées à ' + enKg(f.palierPrecedent, cite(FAIT, { quoi: 'reste' })) +
                   ' y passeront une à une, quand tu feras ') +
               nombreFr(f.seuil, regle('seuil')) + ' reps à ' + enKg(c.haut.charge, cH) + '.';

      // §9.2 bis (49-U12) — une phrase : pourquoi la chute ne compte pas, et
      // pourquoi pas de test tout de suite.
      case 'tenue_apres_chute':
        return 'Ta dernière série a chuté après des séries stables' + DEUX_POINTS +
               'c\'est la fatigue, pas ton niveau. Je ne la compte pas, et on tient ' +
               chargeFois(c.ligne.charge, c.ligne.vise, cL) + ' avant de tester plus lourd.';

      case 'retest_un_cran':
        return rate + ' Ta charge de travail est au haut' + DEUX_POINTS +
               'on reteste d\'un seul cran, à ' + enKg(c.haut.charge, cH) + '.';

      case 'etirement':
        return 'Ton test à ' + enKg(t.charge, cT) + ' a fait ' +
               nombreFr(t.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps' + DEUX_POINTS +
               'pas encore dans ta zone, et ta machine ne permet pas un plus petit cran. ' +
               'Ta zone s\'étire' + DEUX_POINTS + 'à ' + enKg(c.ligne.charge, cL) + ', tu vises une rep ' +
               'de plus au-delà du haut, jusqu\'à ' + nombreFr(f.cible, regle('cible')) + '. Alors on retestera ' +
               enKg(t.charge, cT) + '.';

      case 'retest':
        return 'Tu as regagné les reps perdues au test, ' + nombreFr(f.cible, regle('cible')) + ' reps à ' +
               enKg(c.ligne.charge, cL) + DEUX_POINTS + 'on retente ' + enKg(t.charge, cH) + '.';

      // §9.17 — au poids du corps, sans cran : la carte du lest, ou les reps.
      case 'carte_lest':
        return 'Ta charge de travail est au haut de ta zone depuis deux séances. ' +
               'Un lest te ferait continuer en force : je te le propose, et on tient la ligne en attendant.';

      case 'etirement_reps':
        return 'Au poids du corps, il n\'y a pas de cran à monter' + DEUX_POINTS +
               'tu gagnes des reps, une de plus que la dernière fois.';

      case 'depart_leste':
        return 'Première séance avec du lest' + DEUX_POINTS + 'on part de ' + enKg(c.ligne.charge, cL) +
               ', au bas de ta zone.';

      case 'depart_routine':
        return 'Rien avant aujourd\'hui' + DEUX_POINTS + 'on part de la charge de départ de ta routine, ' +
               enKg(c.ligne.charge, cL) + '. Ensuite, le coach décide d\'après tes séances.';

      // §9.10 (53-1) — la plus basse des deux, dite sans l'estimation.
      case 'nouvelle_zone':
        var rp = f.report || {};
        var dp = rp.depuis || {};
        var zA = zoneParCle(rp.zoneAvant);
        var cR = cite(FAIT, { quoi: 'report' });
        return 'Ta zone passe ' + (zA ? 'de ' + zA.libelle + ' ' : '') + 'à ' + z.libelle + DEUX_POINTS +
               (rp.origine === 'tenue'
                 ? 'je reprends la charge que tu y as déjà tenue, ' + chargeFois(dp.palier, dp.niveau, cR) +
                   ', plutôt qu\'une estimation.'
                 : 'j\'estime ta charge depuis ' + chargeFois(dp.palier, dp.niveau, cR) +
                   (reportMonte(c) ? DEUX_POINTS + 'moins de reps, plus de charge.'
                                   : ', et je la prends un peu en dessous pour démarrer.')) +
               ' On vise le bas de ta zone, ' + nombreFr(z.bas, regle('zone.bas')) +
               ' reps ; la progression reprend à la séance suivante.';

      case 'reprise_courte':
        return 'Reprise après une pause' + DEUX_POINTS + 'ta charge de travail, sans rep de plus. ' +
               'La progression repart à la séance suivante.' + phraseBorneZone(f);

      case 'reprise_longue':
        if (c.ligne && memeCharge(nombre(c.ligne.charge), nombre(c.palier))) {
          return 'Longue pause' + DEUX_POINTS + 'on reprend à ta charge de travail, sans rep de plus. ' +
                 'Le cran d\'en dessous descendait de plus de ' + nombreFr(Math.round(REPLI_MAX_REPRISE * 100), regle('constante')) +
                 INSECABLE + '%.' + phraseBorneZone(f);
        }
        return 'Longue pause' + DEUX_POINTS + 'un cran en dessous' +
               (c.ligne && nombre(c.ligne.charge) !== null ? ', ' + enKg(c.ligne.charge, cL) : '') +
               ', sans rep de plus. Le test te ramènera à ' + enKg(c.palier, cite(FAIT, { quoi: 'palier' })) + '.' + phraseBorneZone(f);

      case 'bord':
        return 'Tu travailles sous ' + nombreFr(RANGEMENT[0].jusqua + 1, regle('constante')) + ' reps' + DEUX_POINTS +
               'je ne te demande jamais une rep de plus, je propose le plus petit cran de charge.';
    }
    return '';
  }

  // `reference` : la date de la séance pour laquelle la feuille s'ouvre (la
  // consigne en séance : le début de la séance en cours). « Ta dernière
  // séance, mardi » se lit contre elle — jamais contre l'horloge.
  // `o.sansDonc` : le plan pose son propre « Donc » (les lignes de la séance
  // en cours) ; celui-ci ne se rédige alors pas — un « Donc » rédigé puis
  // remplacé déclarerait des chiffres que la feuille ne dit pas (§20 bis).
  function pourquoiConsigne(consigne, reglage, reference, options) {
    if (!consigne) return null;
    var o = options || {};
    var jaune = o.sansDonc ? [] : lignesJaunes(consigne);
    var muet = consigne.etat === 'silence';
    return {
      seance: seanceDuPourquoi(consigne, reference),
      zone: muet ? null : zoneDuPourquoi(consigne, reference),
      palier: muet ? null : palierDuPourquoi(consigne),
      etat: etatDuPourquoi(consigne, reglage || 'normal', reference),
      donc: jaune.length ? 'Donc ' + jaune.join(', ') + '.' : null,
      reglage: muet ? null
        : 'Ton réglage' + DEUX_POINTS + libelleRythme(reglage || 'normal') +
          '. Il se change dans Profil.',
      fin: 'Tu peux toujours taper autre chose' + DEUX_POINTS + 'ta saisie fait foi.'
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
  //
  // `reference` : la date de la séance du jour — « 3 reps mardi » se lit contre
  // elle, jamais contre l'horloge.
  function constatDe(consigneAvant, consigneApres, reglage, cranSuivant, reference) {
    var d = constatEnDeux(consigneAvant, consigneApres, reglage, cranSuivant, reference);
    if (!d) return null;
    Modele().reporter(d.verdict.citations);
    Modele().reporter(d.suite.citations);
    return { verdict: d.verdict.texte, suite: d.suite.texte };
  }

  // §20 bis (49-U19) — le verdict et la suite, chacun RÉDIGÉ DANS SA CAPTURE
  // (`{ texte, citations }`) : un verdict remplacé (la montée tenue) ne laisse
  // pas ses citations derrière lui.
  function constatEnDeux(consigneAvant, consigneApres, reglage, cranSuivant, reference) {
    if (!consigneAvant || !consigneApres) return null;
    var ap = consigneApres.fondement || {};
    var av = consigneAvant.fondement || {};
    var z = zoneParCle(consigneApres.zone);
    var repsDuJour = ap.reps || [];
    // Le test DU JOUR seulement : pendant un étirement, le fondement porte le
    // test de l'épisode (§9.7), daté de sa séance — le raconter comme celui
    // d'aujourd'hui (« 66 kg × 12 : pas encore dans ta zone ») disait une
    // séance qui n'a fait que la ligne.
    var testDuJour = ap.test && jourCivil(ap.test.date) === jourCivil(ap.date) ? ap.test : null;

    // Ce qui compte comme « fait aujourd'hui » : le niveau validé, sauf en
    // Franc, dont le déclencheur est UNE série — le constat se lit donc sur la
    // meilleure, comme la règle qui le suit (§9.8).
    var faitAujourdHui = reglage === 'franc'
      ? (ap.reps || []).reduce(function (m, r) { return r !== null && r > m ? r : m; }, 0)
      : consigneApres.niveau;

    var V = Modele();
    return { verdict: V.capturer(function () {
               return verdictDuJour(consigneAvant, consigneApres, z, repsDuJour,
                                    testDuJour, faitAujourdHui, av, ap, reference);
             }),
             suite: V.capturer(function () {
               return suiteDuJour(consigneAvant, consigneApres, z, reglage,
                                  faitAujourdHui, cranSuivant);
             }) };
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
  // Les lignes elles-mêmes : `lignesDePari`, une par série validée (49-C).
  // `lignesDePrediction`, qui les écrivait toutes à l'ouverture, n'avait plus
  // d'appelant depuis 49-C : retirée en 49-U6, avec ses tests.

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
  // valide : version 5 (un nom, pas un hasard) et variante RFC 4122.
  // 59-5 — JAMAIS ALÉATOIRE. Sans `crypto.subtle` (contexte non sécurisé), le
  // repli rendait `null` et l'appelant tirait un identifiant AU HASARD, en
  // silence : un même pari envoyé deux fois devenait deux lignes, et la clé
  // `escalier|…` ne se retrouvait plus. Le repli est désormais un SHA-256 en
  // JavaScript pur (`sha256Pur`), qui rend exactement les mêmes octets.
  //
  // §9.11 (49-R1) — LA RÉVISION. Une consigne revue en séance est un nouveau
  // pari, à côté du premier : la révision entre dans le nom. ⚠️ LA RÉVISION 0
  // GARDE LA FORMULE À TROIS FAITS, octet pour octet — aucun identifiant déjà
  // en base ne change (test à valeur figée). Seul un entier ≥ 1 ajoute un
  // quatrième fait ; `undefined`, `null` et 0 ne le font jamais, sans quoi
  // « |0 » changerait l'identifiant de tous les paris d'ouverture.
  // Prérequis d'« adapter » (04/10/2026) — L'OCCURRENCE ENTRE DANS LE NOM. Un
  // même exercice peut figurer deux fois dans une séance : (séance, exercice,
  // rang, révision) ne suffisait plus à dire QUEL pari. `occurrence`
  // (l'identifiant de l'exercice dans la séance, `THSeance`) s'ajoute en
  // dernier, `|o=…`. Sans elle, le nom est EXACTEMENT celui d'avant : un pari
  // déjà en base garde son identifiant, et se recalcule à l'identique.
  async function idDePrediction(seance, slug, rang, revision, occurrence) {
    var nom = String(seance) + '|' + String(slug) + '|' + String(rang);
    var rev = nombre(revision);
    if (rev !== null && rev >= 1 && Math.floor(rev) === rev) nom += '|' + String(rev);
    if (occurrence) nom += '|o=' + String(occurrence);
    return uuidDuNom(nom);
  }

  // MOTEUR §14 (49-U14) — L'IDENTIFIANT D'UN PARI DE L'ESCALIER, dans un
  // espace de noms à part : `escalier|séance|exercice|marche` (exercice vide
  // pour la semaine allégée). Un nom de consigne commence par l'identifiant de
  // la séance : les deux ne peuvent jamais se rencontrer.
  async function idDEscalier(seance, exercice, marche) {
    return uuidDuNom('escalier|' + String(seance) + '|' + (exercice ? String(exercice) : '') + '|' + String(marche));
  }

  // L'empreinte d'un nom : `crypto.subtle` quand il est là, sinon — ou s'il
  // échoue — le SHA-256 pur. Les deux rendent les mêmes 32 octets ; aucun
  // chemin ne tire au hasard.
  async function empreinte(nom) {
    var c = racine.crypto;
    if (c && c.subtle && typeof c.subtle.digest === 'function' && typeof racine.TextEncoder === 'function') {
      try {
        return new Uint8Array(await c.subtle.digest('SHA-256', new racine.TextEncoder().encode(nom)));
      } catch (e) { /* le repli pur, ci-dessous */ }
    }
    return sha256Pur(utf8(nom));
  }

  // UTF-8 d'une chaîne, sans `TextEncoder` (les paires de substitution
  // deviennent un seul point de code ; une moitié orpheline devient U+FFFD,
  // comme le fait `TextEncoder`).
  function utf8(s) {
    var o = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
        else c = 0xfffd;
      } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) o.push(c);
      else if (c < 0x800) o.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) o.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else o.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return o;
  }

  // SHA-256 (FIPS 180-4) sur un tableau d'octets ; rend un Uint8Array de 32.
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256Pur(octets) {
    var n = octets.length;
    var total = ((n + 9 + 63) >> 6) << 6;
    var m = new Uint8Array(total);
    m.set(octets);
    m[n] = 0x80;
    var bits = n * 8;
    m[total - 4] = (bits >>> 24) & 255; m[total - 3] = (bits >>> 16) & 255;
    m[total - 2] = (bits >>> 8) & 255; m[total - 1] = bits & 255;
    m[total - 5] = Math.floor(n / 0x20000000) & 255;
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    var rotr = function (x, k) { return (x >>> k) | (x << (32 - k)); };
    for (var off = 0; off < total; off += 64) {
      for (var t = 0; t < 16; t++) {
        var j = off + t * 4;
        w[t] = (m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K256[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[i * 4] = (h[i] >>> 24) & 255; out[i * 4 + 1] = (h[i] >>> 16) & 255;
      out[i * 4 + 2] = (h[i] >>> 8) & 255; out[i * 4 + 3] = h[i] & 255;
    }
    return out;
  }

  async function uuidDuNom(nom) {
    var o = (await empreinte(nom)).slice(0, 16);
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
    // §9.17 — AU POIDS DU CORPS, LA SÉRIE FAITE N'A PAS DE CHARGE EN BASE
    // (`charge_kg` vide : `validerSerie` n'écrit que les champs du gabarit), et
    // le pari, lui, porte la charge de sa ligne : 0. Sans cette lecture, la
    // série ne « suivrait » jamais son pari et `valeur_observee` resterait vide :
    // un pari écrit, jamais jugé.
    if (faite === null && palier === 0) faite = 0;
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

  // « 130 kg × 4, 4 : ta nouvelle charge tient sur 2 séries, dans ta zone. »
  //
  // La zone décide de la forme, le compte est toujours dit. Sous le bas, rien
  // ne « tient » encore : la phrase constate et s'arrête. Sans zone connue
  // (§9.1.2, sous 3 reps d'habitude), la clause de zone tombe plutôt que
  // d'écrire un mot que le coach n'a pas.
  function phraseExtension(e, z) {
    var tete = serieFr(e.charge, e.series.map(function (s) { return s.reps; }), cite(FAIT, { quoi: 'du_jour' })) + DEUX_POINTS;
    var combien = e.toutes ? 'toutes tes séries' : nombreFr(e.k, regle('series')) + ' séries';
    var dit = niveauDuTest(e.niveau, z);
    if (z !== null && e.niveau !== null && e.niveau < z.bas) {
      return tete + dit + '.';
    }
    if (e.toutes) return tete + 'ta nouvelle charge tient sur toutes tes séries.';
    return tete + 'ta nouvelle charge tient sur ' + combien + (dit ? ', ' + dit : '') + '.';
  }

  function verdictDuJour(cAvant, cApres, z, repsDuJour, t, fait, av, ap, reference) {
    // ⚠️ Plus de « pas de palier » (§20.2, 49-U9) : depuis le §7.6, la chaîne
    // complète ne rend plus de consigne d'après en silence. Un contrat brut
    // qui y tombe encore n'a pas de verdict.
    if (cApres.etat === 'silence') return null;
    // Rédigé à la demande : seule la branche qui l'écrit le déclare (§20 bis).
    var faitDuJour = function () { return serieFr(cApres.palier, repsDuJour, cite(FAIT, { quoi: 'du_jour' })); };
    if (cAvant.etat === 'silence') return 'Premier repère' + DEUX_POINTS + faitDuJour() + '.';
    if (cAvant.etat === 'reprise_courte' || cAvant.etat === 'reprise_longue') {
      return 'Reprise faite' + DEUX_POINTS + faitDuJour() + '.';
    }
    // §9.10 (53-1) — la première séance d'une nouvelle zone ne se juge pas
    // contre l'ancienne : elle pose un repère.
    if (cAvant.etat === 'nouvelle_zone' && zoneParCle(cAvant.zone)) {
      return 'Premier repère en ' + zoneParCle(cAvant.zone).libelle + DEUX_POINTS + faitDuJour() + '.';
    }
    // ⚠️ L'ÉTAPE DE L'ÉCHELLE QUI RÉUSSIT, AVANT LE TEST DU JOUR (48b-6b-2).
    // C'est le trou qu'a trouvé la vérification sur appareil : au squat, 125
    // × 5 puis 130 × 4 et 130 × 4 — exactement la consigne — donnaient « Pas
    // encore : 4-4 à 130 », parce que la NOUVELLE charge de travail (130,
    // niveau 4) se comparait à l'ANCIENNE (125, niveau 5). Arithmétiquement
    // vrai, sportivement faux : l'échelle a monté d'un barreau.
    var e = extensionDe(av, ap, nombre(cAvant.palier));
    if (e !== null) return phraseExtension(e, z);
    // ⚠️ UNE SÉANCE PLUS LÉGÈRE NE SE JUGE PAS. Descendre de charge est une
    // décision, pas un échec : le constat la note et s'arrête là (CADRAGE §2
    // terdecies — le coach ne commente jamais ce qu'il n'a pas demandé).
    var palierAvant = nombre(cAvant.palier);
    if (palierAvant !== null && nombre(cApres.palier) !== null &&
        nombre(cApres.palier) < palierAvant) {
      return 'Aujourd\'hui' + DEUX_POINTS + faitDuJour() + '.';
    }
    // Un test aujourd'hui : c'est lui qu'on raconte, il porte la décision.
    if (t !== null) {
      var dit = niveauDuTest(t.niveau, z);
      if (z !== null && t.niveau !== null && t.niveau < z.bas) {
        return chargeFois(t.charge, t.reps, cite(FAIT, { quoi: 'du_jour' })) + DEUX_POINTS + dit + '.';
      }
      // La fois d'avant n'avait de test que si c'était LA MÊME CHARGE : sinon
      // « 3 reps mardi » parlerait d'autre chose.
      var avant = av.test && av.test.charge === t.charge ? av.test : null;
      return enKg(t.charge, cite(FAIT, { quoi: 'du_jour' })) + DEUX_POINTS +
        (avant ? nombreFr(avant.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps ' +
                 quand(avant.date, reference, false, cite(FAIT, { quoi: 'test' })) + ', ' : '') +
        nombreFr(t.reps, cite(FAIT, { quoi: 'du_jour', champ: 'reps' })) + ' aujourd\'hui, ' + dit + '.';
    }
    // Pas de test : la charge de travail a-t-elle gagné une rep ? On compare
    // au NIVEAU de la consigne d'avant, celui qu'elle a elle-même calculé.
    var nivAvant = nombre(cAvant.niveau);
    if (nivAvant !== null && fait !== null && fait > nivAvant) {
      var haut = z !== null && fait >= z.haut ? ', ' + niveauDansPhrase(fait, z) : '';
      return enKg(cApres.palier, cite(FAIT, { quoi: 'du_jour' })) + DEUX_POINTS + nombreFr(nivAvant, regle('niveau.avant')) + ' reps ' +
             quand(av.date, reference, false, cite(FAIT, { quoi: 'palier' })) +
             ', ' + nombreFr(fait, regle('niveau.jour')) + ' aujourd\'hui' + haut + '.';
    }
    return 'Pas encore' + DEUX_POINTS + faitDuJour() + '.';
  }

  // Ce qui vient. La consigne d'après le dit déjà en jaune : on la reprend
  // telle quelle plutôt que de la réécrire.
  function suiteDuJour(cAvant, cApres, z, reglage, fait, cranSuivant) {
    if (cApres.etat === 'silence') return null;
    // Rédigée à la demande : seule la branche qui l'écrit la déclare (§20 bis).
    var prochaine = function () { return 'Prochaine séance' + DEUX_POINTS + lignesJaunes(cApres, SUIVANTE).join(', ') + '.'; };

    if (cApres.etat === 'etirement') {
      return 'Ta machine ne permet pas un plus petit cran' + DEUX_POINTS + 'ta zone s\'étire. ' +
             prochaine() + ' On retestera ' + enKg(cApres.fondement.test.charge, cite(FAIT, { quoi: 'test_du_jour' })) +
             ' quand tu feras ' + nombreFr(cApres.fondement.cible, regle('suite.cible')) + ' reps à ' +
             enKg(cApres.ligne.charge, cite(SUIVANTE, { role: 'ligne' })) + '.';
    }
    if (cApres.etat === 'retest_un_cran') return prochaine() + ' On reteste d\'un seul cran.';

    if (cApres.etat === 'progression') {
      var nivAvant = nombre(cAvant.niveau);
      // Rien de gagné : la cible ne bouge pas, et on le dit comme tel plutôt
      // que d'annoncer un manque qui n'a pas changé depuis la dernière fois.
      // ⚠️ « MÊME CIBLE » SEULEMENT SI C'EST LA MÊME (49-U18, principe ii) :
      // la cible d'après vient de la consigne de la séance suivante, et elle
      // se COMPARE à celle du jour. « Même cible : 92 kg × 10 » après une
      // séance qui visait 92 kg × 11 disait le contraire de ce qu'il montrait.
      if (nivAvant !== null && fait !== null && fait <= nivAvant &&
          sansDeclarer(function () { return lignesJaunes(cAvant).join(', '); }) ===
          sansDeclarer(function () { return lignesJaunes(cApres).join(', '); })) {
        // « Même cible » DIT que ce sont les cibles du jour : elles se
        // déclarent comme telles, et la garde les compare à l'en-tête.
        return 'Même cible la prochaine fois' + DEUX_POINTS + lignesJaunes(cApres, CIBLE).join(', ') + '.';
      }
      if (nivAvant !== null && fait !== null && fait <= nivAvant) return prochaine();
      // ⚠️ PRUDENT NE COMPTE PAS LES REPS QUI MANQUENT. Son déclencheur
      // demande TOUTES les séries au haut, DEUX séances de suite : « il te
      // manque une rep » y serait faux la moitié du temps — il en manquerait
      // une, puis une séance entière. La phrase générale ne promet rien.
      // §9.17 — Au poids du corps il n'y a pas de cran à tester : la phrase
      // « pour tester le cran au-dessus » ne se dit pas, la suite est celle du
      // jaune.
      if (reglage !== 'prudent' && z !== null && fait !== null && fait < z.haut &&
          nombre(cApres.palier) !== 0) {
        var manque = z.haut - fait;
        return 'Il te manque ' + (manque === 1 ? 'une rep' : nombreFr(manque, regle('manque')) + ' reps') +
               ' pour tester ' + enKg(cranSuivant, regle('cran_suivant')) + '.';
      }
    }
    return prochaine();
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
  //
  // §9.22 (53-2 bis, D3) — `ligne` : la ligne de zone en vigueur. Posée par
  // un bloc, et pour la zone affichée, l'étiquette porte l'origine :
  // « Mix 6-8 · bloc ».
  function etiquetteZone(consigne, ligne) {
    if (!consigne) return null;
    var z = zoneParCle(consigne.zone);
    if (z === null) return null;
    var bloc = origineDeLaLigne(ligne) === LIGNE_BLOC && ligne.zone === consigne.zone;
    return z.libelle + ' ' + z.bas + '-' + z.haut + (bloc ? ' · bloc' : '');
  }

  // `{ jaune, gris }` : zéro, une ou deux lignes jaunes, et UNE phrase grise.
  // `reference` : la date de la séance pour laquelle la consigne est calculée.
  function libellesConsigne(consigne, reference) {
    if (!consigne) return { jaune: [], gris: '' };
    // Le jaune se rédige dans sa propre capture : la capture de l'appelant ne
    // reçoit que les citations de la phrase grise (§20 bis).
    var jaune = Modele().capturer(function () { return lignesJaunes(consigne); }).texte;
    return { jaune: jaune, gris: phraseGrise(consigne, reference) };
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
  //
  // ⚠️ `options` PORTE LE §7.6 (49-U8) : `{ reglage, equipement, correction }`,
  // les mêmes que la consigne — la zone d'une séance sans palier est celle de
  // SA consigne. Sans elles, le contrat reste celui d'`analyser`, brut.
  //
  // §9.17 — UN EXERCICE EN `reps` A LE CONTRAT D'UNE CHARGE QUI VAUT 0 : le poids
  // du corps (`THPalier.analyserPoidsDuCorps`). C'est la SEULE différence avec
  // un exercice à charge : le contrat qui en sort passe par la même
  // `consignePour`.
  function contratDe(groupes, etat, mesure, options) {
    var seances = (groupes || []).map(function (g) {
      var r = mesure === 'reps'
        ? Palier().analyserPoidsDuCorps((g && g.series) || [])
        : Palier().analyser((g && g.series) || [], etat, { mesure: mesure });
      var se = seanceDuContrat(g && g.seance ? g.seance.debut : null, r);
      // §9.10 (53-1) — la fin de la séance, si elle en a une (la zone choisie
      // pendant la séance est la sienne). Absente, la clé n'existe pas.
      if (g && g.seance && g.seance.fin) se.fin = g.seance.fin;
      // §9.20 (51-3) — LA MARQUE « DOULEUR » est une donnée des séries
      // (`sets.douleur`) : une seule série marquée rend la séance-exercice
      // douloureuse. `sansPalierRetenues` en fait une séance neutre.
      if (seanceDouloureuse((g && g.series) || [])) se.douleur = true;
      return se;
    });
    return options ? sansPalierRetenues(seances, options) : seances;
  }

  // §9.20 (51-3) — UNE SÉANCE-EXERCICE EST DOULOUREUSE quand une de ses séries
  // porte la marque. La seule lecture de `douleur` du moteur.
  function seanceDouloureuse(series) {
    return (series || []).some(function (s) { return !!s && s.douleur === true; });
  }

  // ── §7.6 (49-U8) — UNE SÉANCE SANS CHARGE RÉPÉTÉE ────────────────────────
  //
  // Une séance sans palier (§7.2) n'efface plus la charge de travail : elle
  // prend pour charge de travail la plus lourde charge qu'elle a TENUE DANS LA
  // ZONE — reps comptées (§17.4) au moins au bas de la zone — et ses séries de
  // travail à cette charge deviennent ses séries au palier. Aucune série de
  // travail dans la zone : la séance est NEUTRE, et la consigne suivante
  // repart de la séance d'avant.
  //
  // ⚠️ UNE SÉANCE NEUTRE RESTE UNE PRÉSENCE (delta 49-20, 29/09/2026). Elle
  // reste dans le contrat, marquée `neutre: true` : elle ne compte pas pour
  // la charge (palier, niveau validé, zone, habitude — `vueDeSeance` lui
  // retire ses votantes), mais sa date compte pour l'écart habituel et la
  // dernière présence (§9.9). Retirée de tout, elle faisait conclure à une
  // absence de 135 jours après une séance faite trois jours avant (S014).
  //
  // ⚠️ LA ZONE D'UNE SÉANCE EST CELLE DE LA CONSIGNE QUI LA PRÉCÉDAIT — et pas
  // de circularité : cette consigne se calcule sur les séances STRICTEMENT
  // antérieures, déjà passées par cette même règle. On les traite donc dans
  // l'ordre du temps ; chaque séance ne dépend que de celles d'avant, jamais
  // d'elle-même ni de l'avenir (§9.12). Une consigne sans zone (première fois,
  // règle de bord) laisse la séance neutre : il n'y a rien à tenir « dans ».
  //
  // Pure : les séances d'entrée ne sont jamais modifiées, l'ordre d'arrivée
  // est gardé. `consignePour` n'est appelée QUE pour les séances sans palier —
  // cinq sur cent — et jamais pour les autres.
  function sansPalierRetenues(seances, options) {
    var o = options || {};
    var opts = { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null };
    var liste = seances || [];
    var ordre = liste.map(function (se, i) { return i; }).filter(function (i) {
      return instant(liste[i] && liste[i].debut) !== null;
    }).sort(function (a, b) { return instant(liste[a].debut) - instant(liste[b].debut); });
    var sortie = liste.slice();
    var faites = [];
    ordre.forEach(function (i) {
      var se = liste[i];
      // §9.20 (51-3) — UNE SÉANCE MARQUÉE « DOULEUR » EST NEUTRE, DÉCLARÉE AU
      // LIEU D'ÊTRE DÉDUITE. Le même chemin que la séance sans travail dans la
      // zone, pas une seconde notion : elle ne vote pas pour la charge, et sa
      // date compte pour le rythme. Sans elle, une séance douloureuse plus
      // légère faisait reculer la ligne (squat 120 → 95 kg).
      if (se.douleur === true) {
        se = { debut: se.debut, palier: null, neutre: true, douleur: true, series: se.series || [] };
        sortie[i] = se;
        faites.push(se);
        return;
      }
      if (nombre(se.palier) === null) {
        var avant = consignePour(faites, se.debut, opts);
        var z = zoneParCle(avant && avant.zone);
        var C = null;
        if (z !== null) {
          parRole(se.series, { travail: true }).forEach(function (s) {
            var kg = nombre(s.charge_kg);
            var r = Palier().repsComptees(s);
            if (kg !== null && r !== null && r >= z.bas && (C === null || kg > C)) C = kg;
          });
        }
        if (C === null) {
          se = { debut: se.debut, palier: null, neutre: true, series: se.series || [] };
          sortie[i] = se;
          faites.push(se);
          return;
        }
        var fin = se.fin;
        se = {
          debut: se.debut, palier: C,
          series: (se.series || []).map(function (s) {
            if (!estRole(s, { travail: true }) || nombre(s.charge_kg) !== C) return s;
            var copie = {};
            for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) copie[k] = s[k];
            copie.role = 'palier';
            return copie;
          })
        };
        if (fin) se.fin = fin;
        sortie[i] = se;
      }
      faites.push(se);
    });
    return sortie;
  }

  // ══ §12.9 — LE COMPTEUR DE STAGNATION (49-U13, delta 49-28) ════════════════
  //
  // « Le compteur constate, l'escalier propose. » Il rejoue, dans l'ordre, les
  // séances SOUS CONSIGNE de l'exercice : pour chacune, la consigne qu'elle a
  // reçue (`consignePour` sur les séances d'avant — la même fonction, jamais
  // une seconde règle), puis son verdict :
  //   · REMISE À ZÉRO à la première séance comptée, à une reprise (§9.9, l'état
  //     de la consigne rejouée) et à un changement de zone (§12.2 bis) : le
  //     meilleur devient (palier, niveau) de cette séance, le compteur 0 ;
  //   · PROGRÈS (§12.2 bis), dans cet ordre : le palier monte au-dessus du
  //     meilleur ; sinon, au même palier, le niveau validé monte (§9.2, chute
  //     exclue §9.2 bis) ; sinon un test TENU dans la zone (niveau au moins au
  //     bas) fait mieux que le meilleur test depuis la remise à zéro — plus
  //     lourd, ou aussi lourd et plus de reps. Le même test refait à
  //     l'identique n'est PAS un progrès (« deux pièges trouvés en rejouant ») ;
  //   · SUIVIE : la charge de travail de la séance atteint la charge proposée
  //     (la ligne ; sinon la ligne haute ; sinon le palier). Une séance non
  //     suivie n'ajoute rien au compteur — « ni progrès ni stagnation » — mais
  //     un progrès y reste un progrès (cas K002, K008).
  // Un progrès clôt le blocage en cours (sa durée entre dans `blocages`) et
  // remet le compteur à 0 ; une séance suivie sans progrès l'incrémente. Une
  // remise à zéro ne clôt pas de blocage : on ne sait pas comment il aurait
  // fini.
  //
  // Les séances d'une consigne muette (première fois, aucune charge tenue) ne
  // sont pas comptées : elles n'ont rien reçu. `options.toutes` compte toutes
  // les séances comme sous consigne (les cas du simulateur, sur des historiques
  // qui n'en ont jamais reçu) ; sinon, seules celles marquées `sousConsigne`.
  //
  // Rend `{ compteur, meilleur: { palier, niveau } | null, derniere, verdicts,
  // blocages }` — `derniere` : (palier, niveau) de la dernière séance comptée,
  // « la charge du jour », que la phrase ne cite JAMAIS (§12.8, delta 49-28 :
  // elle peut osciller sous le meilleur). Pure.
  var SEUIL_COMPTEUR = 4;
  var BLOCAGES_CONNUS = 8;
  // ⚠️ PAS DE FENÊTRE : le rejeu couvre TOUTES les séances sous consigne. Les
  // blocages terminés (« plus long que d'habitude ») se comptent sur tout
  // l'historique sous consigne (§12.8) ; une fenêtre les coupait, et la phrase
  // devenait presque inatteignable (revue du 01/10/2026). Le coût, lui, grandit
  // avec l'usage — une consigne par séance comptée, sur tout ce qui la précède :
  // mesuré (Node) ~0 aujourd'hui, ~70 ms par exercice à 50 séances sous consigne
  // sur 200, ~175 ms à 150 sur 350. Signalé dans la PR, avec une reprise
  // incrémentale à prévoir avant que l'historique sous consigne ne grandisse.

  // §9.1.1 — la zone choisie EN VIGUEUR AU DÉBUT d'une séance passée : la plus
  // récente des corrections posées strictement avant elle. Une zone choisie
  // aujourd'hui ne réécrit pas la consigne que les séances d'avant ont reçue.
  function correctionAu(corrections, debut) {
    if (instant(debut) === null) return null;
    var l = ligneDeZoneAu(corrections, null, debut, false);
    return l && l.zone ? l.zone : null;
  }

  function chargeProposee(k) {
    var l = k.ligne ? nombre(k.ligne.charge) : null;
    if (l !== null) return l;
    var h = k.haut ? nombre(k.haut.charge) : null;
    return h !== null ? h : nombre(k.palier);
  }

  function testMeilleur(t, mt) {
    if (mt === null) return true;
    if (t.charge > mt.charge && !memeCharge(t.charge, mt.charge)) return true;
    return memeCharge(t.charge, mt.charge) && t.niveau > mt.niveau;
  }

  // ── §12.2 bis (54-1, delta F1) — LA ZONE D'UNE SÉANCE, LUE À SA FIN ──────
  //
  // « La zone d'une séance se lit à sa fin — une seule fonction pour le report
  // (§9.10), le compteur et le repli de l'escalier : une zone changée pendant
  // la séance est celle de cette séance. » Le compteur et le repli la lisaient
  // à son DÉBUT, le report à sa FIN : une zone changée en pleine séance faisait
  // se contredire le coach (relevé 54-0).
  //
  // `liste` : les séances antérieures, dans l'ordre (`anterieures`) ; `i` : la
  // séance ; `avant` : celle qu'on prescrit. La FIN est l'heure de fin de la
  // séance quand on la connaît, bornée par le début de la séance suivante (ou
  // de celle qu'on prescrit) : une séance sans fin — en cours, ou refermée sans
  // heure — se lit jusque-là. Rend la consigne que la séance a REÇUE : le
  // rythme d'aujourd'hui, la zone choisie en vigueur à sa fin (`o.corrections`,
  // l'historique des choix), sinon `o.correction`.
  // §12.2 bis (55-1, G2) — LA FIN EFFECTIVE d'une séance : son heure de fin
  // quand on la connaît ; SANS HEURE DE FIN (6 des 22 séances de septembre,
  // importées de Hevy), 3 h au plus après son début. Jamais après le début de
  // la suivante (`suivante`), ni après `avant` (la séance qu'on prescrit).
  // Sans la borne des 3 h, une zone changée entre deux séances comptait pour
  // la précédente. Rend un instant (ms), ou `null` sans aucune borne.
  var FIN_SANS_HEURE_MAX = 3 * 3600 * 1000;
  function finEffective(se, suivante, avant) {
    var tL = instant(se && se.debut);
    var borne = instant(avant);
    var tS = suivante ? instant(suivante.debut) : null;
    if (tS !== null && (tL === null || tS > tL) && (borne === null || tS < borne)) borne = tS;
    var fin = instant(se && se.fin);
    if (tL !== null && (fin === null || fin <= tL)) fin = tL + FIN_SANS_HEURE_MAX;
    if (fin !== null && (borne === null || fin < borne)) borne = fin;
    return borne;
  }

  function consigneDeLaSeance(liste, i, avant, o) {
    var se = liste[i];
    var tL = instant(se.debut);
    var suivante = null;
    for (var k = i + 1; k < liste.length; k++) {
      var t = instant(liste[k].debut);
      if (t !== null && t > tL) { suivante = liste[k]; break; }
    }
    var borne = finEffective(se, suivante, avant);
    var correction = o.corrections && borne !== null
      ? correctionAu(o.corrections, new Date(borne + 1).toISOString()) : (o.correction || null);
    return consignePour(liste.slice(0, i), se.debut,
      { reglage: o.reglage, equipement: o.equipement, correction: correction });
  }
  function zoneDeLaSeance(liste, i, avant, o) {
    var k = consigneDeLaSeance(liste, i, avant, o);
    return k && k.zone ? k.zone : null;
  }

  function compteurDe(seances, avant, options) {
    var o = options || {};
    var liste = anterieures(seances || [], avant);
    var meilleur = null, meilleurTest = null, compteur = 0, derniere = null;
    // Une REPRISE vue sur une séance non comptée (sans pari, consigne muette)
    // vaut quand même remise à zéro : elle s'applique à la prochaine séance
    // comptée. La coupure est un fait de calendrier, pas un pari (§12.6).
    var repriseEnAttente = false;
    var zonePrecedente, premiere = true;
    var verdicts = [], blocages = [];
    liste.forEach(function (se, i) {
      if (o.toutes !== true && se.sousConsigne !== true) {
        if (!premiere && repriseDe(liste.slice(0, i), se.debut) !== AUCUNE_REPRISE) repriseEnAttente = true;
        return;
      }
      // La consigne que la séance a REÇUE, sa zone lue À SA FIN (§12.2 bis,
      // 54-1) : la même lecture que le report et le repli.
      var k = consigneDeLaSeance(liste, i, avant, o);
      var v = vueDeSeance(se);
      var P = nombre(v.palier);
      // Une séance NEUTRE (§7.6 : aucune série dans la zone), sans palier fait,
      // ou dont la consigne est muette ou sans zone (bord, reprise sans zone)
      // n'est ni comptée ni jugée (§12.9, 49-29, `deroule_compteur`) — mais une
      // reprise vue là remet quand même à zéro la suivante. Le rejeu lit les
      // séances DU CONTRAT (`contratDe`, où `neutre` est posé) : la même règle
      // de calcul que la consigne vivante.
      // §14.4 (49-U14) — une séance d'une SEMAINE ALLÉGÉE acceptée (`decharge`)
      // n'est ni comptée ni jugée, comme une séance neutre ; elle reste une
      // présence pour la reprise (§9.9) : aucune coupure.
      if (se.neutre === true || se.decharge === true || !k || k.etat === 'silence' || k.zone === null || k.zone === undefined || P === null) {
        if (!premiere && k && repriseDe(liste.slice(0, i), se.debut) !== AUCUNE_REPRISE) repriseEnAttente = true;
        return;
      }
      var A = seriesAuPalier(v);
      var n = A.length ? niveauValide(A) : null;
      var z = zoneParCle(k.zone);
      var t = testDe(v);
      var tenu = t !== null && t.niveau !== null && z !== null && t.niveau >= z.bas;
      var propose = chargeProposee(k);
      var suivie = P !== null && propose !== null && (P > propose || memeCharge(P, propose));
      var rz = premiere || repriseEnAttente || k.etat === 'reprise_courte' || k.etat === 'reprise_longue' ||
               k.zone !== zonePrecedente;
      repriseEnAttente = false;
      var progres = false;
      if (rz) {
        progres = true;
        meilleur = P === null ? null : { palier: P, niveau: n };
        // §12.9 (49-29) — le test tenu ce jour-là est le meilleur test.
        meilleurTest = tenu ? { charge: t.charge, niveau: t.niveau } : null;
        compteur = 0;
      } else {
        // §12.9 (49-29) — le meilleur test se retient À CHAQUE séance où un
        // test est tenu, même quand le progrès vient du palier : sinon le même
        // test refait passerait pour un progrès (§12.2 bis).
        var testMieux = tenu && testMeilleur(t, meilleurTest);
        if (testMieux) meilleurTest = { charge: t.charge, niveau: t.niveau };
        if (P !== null && (meilleur === null ||
            (P > meilleur.palier && !memeCharge(P, meilleur.palier)) ||
            (memeCharge(P, meilleur.palier) && n !== null && (meilleur.niveau === null || n > meilleur.niveau)))) {
          progres = true;
          meilleur = { palier: P, niveau: n };
        } else if (testMieux) {
          progres = true;
        }
        if (progres) {
          if (compteur > 0) blocages.push(compteur);
          compteur = 0;
        } else if (suivie) {
          compteur++;
        }
      }
      // §13.6 (49-U20) — le MEILLEUR après la séance, avec chaque verdict : les
      // frères se lisent là (« avant », « maintenant », un meilleur en hausse).
      verdicts.push({ debut: se.debut, zone: k.zone === undefined ? null : k.zone, progres: progres,
                      suivie: suivie, remise_a_zero: rz, compteur: compteur,
                      meilleur: meilleur === null ? null : { palier: meilleur.palier, niveau: meilleur.niveau } });
      zonePrecedente = k.zone;
      premiere = false;
      derniere = P === null ? null : { palier: P, niveau: n };
    });
    // §12.9 (49-29) — LA REMISE À ZÉRO VAUT DÈS L'OUVERTURE : si la séance qui
    // s'ouvre (`avant`) est une reprise, ou change de zone, le compteur est à
    // zéro — pas de phrase. Une reprise vue sur une séance non comptée depuis
    // la dernière comptée vaut de même. Le meilleur reste ce qu'il était.
    if (!premiere) {
      var kOuverture = consignePour(liste, avant, { reglage: o.reglage, equipement: o.equipement,
        // La zone EN VIGUEUR AUJOURD'HUI, pour la séance qui commence (§12.2 bis :
        // une autre question) : la dernière choisie, par la fonction de la zone
        // en vigueur, sinon `o.correction` — dans l'app, les deux disent la même chose.
        correction: o.corrections ? zoneEnVigueur(o.corrections, null) : (o.correction || null) });
      if (repriseEnAttente || (kOuverture && (kOuverture.etat === 'reprise_courte' ||
          kOuverture.etat === 'reprise_longue' || kOuverture.zone !== zonePrecedente))) {
        compteur = 0;
      }
    }
    return { compteur: compteur, meilleur: meilleur, derniere: derniere, verdicts: verdicts, blocages: blocages };
  }

  // §12.8, §20 — la phrase du compteur. À 4 séances ou plus : « 25 kg × 12
  // reste ta meilleure charge de travail depuis 4 séances. » — LE MEILLEUR depuis la remise à
  // zéro, jamais la charge du jour (delta 49-28). « : c'est plus long que
  // d'habitude pour toi. » seulement si au moins 8 blocages terminés sont
  // connus et que 3 sur 4 ont duré moins de 4 séances. Sous 4 : rien.
  //
  // ⚠️ LES ESPACES SONT CELLES DU FICHIER DE CAS (`cas-49u13-compteur.json`),
  // à l'octet : insécable avant « kg » (le formateur `charge`), espaces
  // ordinaires autour de « × » et avant « : » — comme la proposition de
  // chauffes (49-U10), et pas comme `chargeFois`. Signalé dans la PR.
  function phraseCompteur(c, blocages) {
    if (!c || c.compteur < SEUIL_COMPTEUR || !c.meilleur || c.meilleur.niveau === null) return null;
    var b = blocages || c.blocages || [];
    var courts = b.filter(function (d) { return d < SEUIL_COMPTEUR; }).length;
    var plusLong = b.length >= BLOCAGES_CONNUS && courts * 4 >= b.length * 3;
    var cM = cite(FAIT, { quoi: 'meilleur' }), cR = cite(FAIT, { quoi: 'meilleur', champ: 'reps' });
    return Modele().charge(c.meilleur.palier, undefined, cM) + ' × ' + nombreFr(c.meilleur.niveau, cR) +
      ' reste ta meilleure charge de travail depuis ' + nombreFr(c.compteur, regle('compteur')) + ' séances' +
      (plusLong ? ' : c\'est plus long que d\'habitude pour toi.' : '.');
  }

  // ══ §13.6 (49-U20) — LES FRÈRES : CÔTE À CÔTE, SANS CONCLURE ════════════
  //
  // « Quand un exercice est bloqué et qu'un frère progresse pendant ce temps,
  // le coach le montre côte à côte, sans conclure ; l'escalier propose sa
  // marche comme d'habitude. » Les frères sont les exercices de même
  // `mouvement` au catalogue (`THModele.freresDe`, la source unique) ; leurs
  // verdicts sont ceux du compteur (`compteurDe`, par le même rejeu que
  // l'exercice lui-même). Référence : `coach49.py` (`frere_qui_progresse`,
  // `phrase_frere`) ; cas `cas-49u20-freres.json`.

  // Le blocage court depuis le DERNIER PROGRÈS de l'exercice bloqué (§12.2
  // bis) : le dernier verdict `progres` ; à défaut, son premier verdict.
  function debutDuBlocage(verdicts) {
    var l = (verdicts || []).filter(function (v) { return v && instant(v.debut) !== null; });
    if (!l.length) return null;
    var progres = l.filter(function (v) { return v.progres === true; });
    return (progres.length ? progres[progres.length - 1] : l[0]).debut;
  }

  // Un meilleur (palier, niveau) au-dessus d'un autre : le palier, puis le
  // niveau au même palier.
  function meilleurAuDessus(a, b) {
    var pa = nombre(a.palier), pb = nombre(b.palier);
    if (pa === null || pb === null) return false;
    if (pa > pb && !memeCharge(pa, pb)) return true;
    return memeCharge(pa, pb) && nombre(a.niveau) !== null && nombre(b.niveau) !== null &&
      nombre(a.niveau) > nombre(b.niveau);
  }
  function meilleurDit(m) {
    return !!m && nombre(m.palier) !== null && nombre(m.niveau) !== null;
  }

  // LE FRÈRE QUI A PROGRESSÉ PENDANT LE BLOCAGE. `bloque` : `{ verdicts }` ;
  // `freres` : `[{ id, nom, verdicts }]` (les verdicts de `compteurDe`, avec
  // leur `meilleur`) ; `avant` : la séance qui s'ouvre. Un frère compte s'il a
  // un progrès STRICTEMENT après le début du blocage et avant la séance, et si
  // son meilleur a monté — un test tenu qui ne change pas le meilleur n'a rien
  // à montrer. « Maintenant » : son dernier verdict avant la séance ; « avant » :
  // son dernier verdict au début du blocage ou avant — `null` s'il n'en a pas,
  // ou si sa zone n'est pas celle de « maintenant » (pas de flèche entre deux
  // zones). Plusieurs : le progrès le plus récent, puis l'ordre alphabétique
  // du nom. Rend `{ id, nom, avant, maintenant }` ou `null`. Pure.
  function frereQuiProgresse(bloque, freres, avant) {
    var depuis = instant(debutDuBlocage(bloque && bloque.verdicts));
    if (depuis === null) return null;
    var fin = instant(avant);
    var retenus = [];
    (freres || []).forEach(function (f) {
      if (!f) return;
      var vus = (f.verdicts || []).filter(function (v) {
        var t = v ? instant(v.debut) : null;
        return t !== null && (fin === null || t < fin);
      }).sort(function (a, b) { return instant(a.debut) - instant(b.debut); });
      var progres = vus.filter(function (v) { return v.progres === true && instant(v.debut) > depuis; });
      if (!progres.length) return;
      var maintenant = vus[vus.length - 1];
      if (!meilleurDit(maintenant.meilleur)) return;
      var anciens = vus.filter(function (v) { return instant(v.debut) <= depuis; });
      var ancien = anciens.length ? anciens[anciens.length - 1] : null;
      if (ancien && ancien.zone !== maintenant.zone) ancien = null;
      // Un « avant » sans niveau ne se dit pas (pas de flèche) — mais son
      // palier compte encore : un palier qui n'a pas monté n'est pas un progrès.
      if (ancien && !meilleurDit(ancien.meilleur)) {
        var pa = nombre(ancien.meilleur && ancien.meilleur.palier), pm = nombre(maintenant.meilleur.palier);
        if (pa !== null && !(pm > pa && !memeCharge(pm, pa))) return;
        ancien = null;
      }
      if (ancien && !meilleurAuDessus(maintenant.meilleur, ancien.meilleur)) return;
      retenus.push({ quand: instant(progres[progres.length - 1].debut), id: f.id === undefined ? null : f.id,
                     nom: String(f.nom === undefined || f.nom === null ? f.id : f.nom),
                     avant: ancien ? { palier: nombre(ancien.meilleur.palier), niveau: nombre(ancien.meilleur.niveau) } : null,
                     maintenant: { palier: nombre(maintenant.meilleur.palier), niveau: nombre(maintenant.meilleur.niveau) } });
    });
    if (!retenus.length) return null;
    retenus.sort(function (a, b) {
      if (a.quand !== b.quand) return b.quand - a.quand;
      return a.nom < b.nom ? -1 : (a.nom > b.nom ? 1 : 0);
    });
    var r = retenus[0];
    return { id: r.id, nom: r.nom, avant: r.avant, maintenant: r.maintenant };
  }

  // LA PHRASE, en gris, après celle du compteur : « Pendant ce temps, Développé
  // Couché (Haltère) : 40 kg × 10 → 42 kg × 10. », ou sans « avant » :
  // « Pendant ce temps, Développé Couché (Haltère) progresse : 42 kg × 10. »
  // Par le formateur unique (`chargeFois`) ; « avant » et « maintenant » sont
  // des FAITS PASSÉS (§20 bis), chacun sa source (`frere.avant`,
  // `frere.maintenant`). Les deux-points et la flèche ont les espaces du
  // fichier de cas, comme la phrase du compteur qu'elle suit.
  function phraseFrere(f) {
    if (!f || !f.nom || !meilleurDit(f.maintenant)) return null;
    var dit = function (m, quoi) { return chargeFois(nombre(m.palier), nombre(m.niveau), cite(FAIT, { quoi: quoi })); };
    return 'Pendant ce temps, ' + f.nom +
      (meilleurDit(f.avant) ? ' : ' + dit(f.avant, 'frere.avant') + ' → ' : ' progresse : ') +
      dit(f.maintenant, 'frere.maintenant') + '.';
  }

  // ══ §14.4 (49-U14) — L'ESCALIER, PREMIÈRE MARCHE : LA SEMAINE ALLÉGÉE ════
  //
  // « Quand tout cale en même temps, c'est souvent de la fatigue. » Tout est
  // pur ici : les compteurs viennent des paris (le compteur de chaque exercice
  // est figé dans le fondement de chaque pari de consigne), la date de la
  // séance qui s'ouvre vient de l'appelant. Référence : `coach49.py`
  // (`blocage_generalise`, `phrase_carte`, `consigne_allegee`,
  // `series_allegees`, `fin_allegee`) ; cas `cas-49u14-semaine-allegee.json`.
  var PAS_ESCALIER = 4;               // un déclenchement : 4, 8, 12…
  var FENETRE_BLOCAGE_JOURS = 7;      // de 0 à 7 jours avant, le jour même compris
  var AUTRES_EXERCICES_MIN = 2;       // au moins deux AUTRES exercices à 4 ou plus
  var NOMS_MAX_CARTE = 4;             // au-delà, les 3 premiers puis « et N autres exercices »
  var PART_ALLEGEE = 0.6;             // 60 % des séries de la routine
  var REPS_EN_MOINS = 2;
  var DUREE_ALLEGEE_JOURS = 7;        // du jour d'acceptation à J+6 compris
  var MODULE_ESCALIER = 'escalier';
  var MARCHE_SEMAINE_ALLEGEE = 'semaine_allegee';
  // Les trois constantes de la semaine allégée, écrites PAR LE FORMATEUR et
  // déclarées comme règles : le texte ne les recopie pas.
  function detailCarte() {
    return 'Quand tout cale en même temps, c\'est souvent de la fatigue. Je te propose une ' +
      'semaine allégée : mêmes exercices, mêmes charges, ' +
      nombreFr(Math.round(PART_ALLEGEE * 100), regle('constante')) + ' % des séries, ' +
      nombreFr(REPS_EN_MOINS, regle('constante')) + ' reps de moins, pendant ' +
      nombreFr(DUREE_ALLEGEE_JOURS, regle('constante')) + ' jours. Rien ne monte.';
  }
  var PHRASE_REFUS = 'Séance normale. Au prochain blocage, je regarderai exercice par exercice.';

  function estDeclenchement(c) {
    var n = nombre(c);
    return n !== null && n >= PAS_ESCALIER && n % PAS_ESCALIER === 0;
  }

  // Le JOUR CIVIL local d'un instant, « AAAA-MM-JJ » ; une date déjà au jour
  // passe telle quelle.
  function jourCivil(v) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var t = instant(v);
    if (t === null) return null;
    var d = new Date(t);
    var deux = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate());
  }
  function numeroDuJour(jour) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour || ''));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / JOUR) : null;
  }
  function ajouterJours(jour, n) {
    var k = numeroDuJour(jour);
    if (k === null) return null;
    var d = new Date((k + n) * JOUR);
    var deux = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate());
  }
  // L'ordre alphabétique de `coach49.py` : par points de code, sans locale
  // (« Écarté » vient après « Rowing », comme dans les cas).
  function avantAlpha(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  // LA DÉTECTION. `jours` : `{ "AAAA-MM-JJ": { exercice: compteur à l'ouverture } }`
  // — les séances SOUS CONSIGNE, lues dans les paris (et, pour la séance du
  // jour, dans les compteurs déjà figés). `jour` : la date de la séance qui
  // s'ouvre ; ses exercices sont `jours[jour]`. `noms` (facultatif) : le nom
  // affiché d'un exercice, qui sert aussi à l'ordre alphabétique.
  // Rend `null` ou `{ declencheur, compteur, cites: [exercices] }`.
  // `candidats` (facultatif) : les exercices qui PEUVENT déclencher — ceux de
  // la séance qui s'ouvre, quand d'autres séances du même jour sont lues.
  function blocageGeneralise(jours, jour, noms, candidats) {
    var J = jours || {}, d0 = numeroDuJour(jour);
    var nomDe = function (x) { return noms && noms[x] ? String(noms[x]) : String(x); };
    var aujourdhui = J[jour] || {};
    var declencheurs = Object.keys(aujourdhui).filter(function (x) {
      return estDeclenchement(aujourdhui[x]) && (!candidats || candidats.indexOf(x) >= 0);
    });
    if (d0 === null || !declencheurs.length) return null;
    declencheurs.sort(function (a, b) {
      return nombre(aujourdhui[b]) - nombre(aujourdhui[a]) || avantAlpha(nomDe(a), nomDe(b));
    });
    var d = declencheurs[0];
    // Le compteur d'un autre exercice : le plus grand de la fenêtre.
    var max = {};
    Object.keys(J).forEach(function (jr) {
      var k = numeroDuJour(jr);
      if (k === null || d0 - k < 0 || d0 - k > FENETRE_BLOCAGE_JOURS) return;
      Object.keys(J[jr] || {}).forEach(function (x) {
        var c = nombre(J[jr][x]);
        if (x === d || c === null) return;
        if (max[x] === undefined || c > max[x]) max[x] = c;
      });
    });
    var autres = Object.keys(max).filter(function (x) { return max[x] >= PAS_ESCALIER; });
    if (autres.length < AUTRES_EXERCICES_MIN) return null;
    autres.sort(function (a, b) { return max[b] - max[a] || avantAlpha(nomDe(a), nomDe(b)); });
    return { declencheur: d, compteur: nombre(aujourdhui[d]), cites: [d].concat(autres) };
  }

  // « A, B et C : aucun n'a progressé depuis 4 séances. » — au plus 4 noms ;
  // au-delà, les 3 premiers puis « et N autres exercices ».
  function phraseCarte(noms) {
    var l = (noms || []).map(String);
    var liste;
    if (l.length > NOMS_MAX_CARTE) {
      liste = l.slice(0, 3).join(', ') + ' et ' + nombreFr(l.length - 3, regle('carte.autres')) + ' autres exercices';
    } else if (l.length > 1) {
      liste = l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1];
    } else {
      liste = l.join('');
    }
    return liste + ' : aucun n\'a progressé depuis ' + nombreFr(PAS_ESCALIER, regle('constante')) + ' séances.';
  }

  // 60 % des séries de travail de la routine, au plus proche, au moins une :
  // 1 → 1, 2 → 1, 3 → 2, 4 → 2, 5 → 3, 6 → 4.
  function seriesAllegees(n) {
    var k = nombre(n);
    if (k === null || k < 1) return 1;
    return Math.max(1, Math.round(k * PART_ALLEGEE + 1e-9));
  }

  // LA CONSIGNE ALLÉGÉE : la même charge que la ligne de la consigne normale
  // (sans ligne basse, celle de la ligne haute — §12.9, 49-30), 2 reps de
  // moins (au moins 1), aucune ligne haute, et ne COUVRE que les premières
  // séries (`couvre`). `allegee` porte de quoi écrire l'en-tête et l'invariant.
  // `decharge` : la semaine est la décharge planifiée d'un programme (§9.22).
  function consigneAllegee(consigne, seriesRoutine, decharge) {
    var c = consigne || null;
    if (!c || c.etat === 'silence') return c;
    var src = c.ligne || c.haut;
    if (!src) return c;
    var routine = Math.max(1, nombre(seriesRoutine) || 1);
    var series = seriesAllegees(routine);
    var vise = nombre(src.vise);
    return Object.assign({}, c, {
      ligne: { charge: src.charge, vise: vise === null ? null : Math.max(1, vise - REPS_EN_MOINS) },
      haut: null,
      n: series,
      couvre: series,
      allegee: decharge === true ? { series: series, routine: routine, decharge: true } : { series: series, routine: routine }
    });
  }

  // « 125 kg × 3 » par le FORMATEUR UNIQUE (`chargeFois`), exactement comme
  // les autres en-têtes — décidé par Aurélien le 01/10/2026 (#345) : les
  // insécables autour de « × » aussi, là où les cas n'en mettaient qu'avant
  // « kg ». Et, en gris, « 2 séries au lieu de 4, cette semaine ».
  function phraseAllegee(c) {
    var l = c && c.ligne;
    return l ? Modele().chargeFois(nombre(l.charge), nombre(l.vise), undefined, cite(CIBLE, { role: 'ligne' })) : null;
  }
  function detailAllegee(c) {
    var a = c && c.allegee;
    if (!a) return null;
    return nombreFr(a.series, regle('allegee.series')) + (a.series > 1 ? ' séries' : ' série') + ' au lieu de ' +
           nombreFr(a.routine, regle('allegee.routine')) + ', cette semaine';
  }

  // La phrase grise de l'exercice : le détail ; pendant la décharge d'un
  // programme, nommée — « Semaine de décharge : mêmes charges, moins de
  // séries. 2 séries au lieu de 4, cette semaine. » (maquette cycles v1).
  function grisAllegee(c) {
    var d = detailAllegee(c);
    if (!d || !c.allegee.decharge) return d;
    return 'Semaine de décharge' + DEUX_POINTS + 'mêmes charges, moins de séries. ' + d + '.';
  }

  // Le dernier jour (J+6) et le bandeau : « Semaine allégée jusqu'au 7 oct. : … ».
  function finAllegee(jour) { return ajouterJours(jourCivil(jour), DUREE_ALLEGEE_JOURS - 1); }
  function bandeauAllegee(fin) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fin || ''));
    if (!m) return null;
    return 'Semaine allégée jusqu’au ' + Modele().jourCourt(String(fin), regle('allegee.fin')) +
      ' : ' + FIN_ALLEGEE;
  }
  // Ce que la semaine allégée change, dit UNE fois : le bandeau et la feuille
  // « Pourquoi » le lisent.
  var FIN_ALLEGEE = 'mêmes charges, moins de séries, loin de l’échec. Rien ne monte.';

  // Les cartes passées, lues dans les paris de l'escalier : `{ jour, seance,
  // declencheur, compteur, reponse, debut, fin }`.
  function cartesDesParis(paris) {
    return (paris || []).filter(function (l) {
      return l && l.module === MODULE_ESCALIER && l.fondement && l.fondement.marche === MARCHE_SEMAINE_ALLEGEE;
    }).map(function (l) {
      var f = l.fondement;
      return { id: l.id || null, seance: f.seance || null, jour: f.jour || jourCivil(f.debut),
               declencheur: f.declencheur, compteur: nombre(f.compteur), reponse: f.reponse,
               debut: f.debut || null, fin: f.fin || null,
               // §14.5 (49-U15) — les exercices cités : une carte répondue dans
               // la séance les garde de toute marche isolée (I21).
               cites: Array.isArray(f.cites) ? f.cites.slice() : [] };
    });
  }

  // La période allégée en cours au jour `jour` : la carte ACCEPTÉE dont la
  // période le contient, ou `null`.
  function periodeAllegee(cartes, jour) {
    var j = numeroDuJour(jourCivil(jour));
    if (j === null) return null;
    var p = null;
    (cartes || []).forEach(function (c) {
      if (!c || c.reponse !== 'acceptee') return;
      var a = numeroDuJour(c.debut), b = numeroDuJour(c.fin);
      if (a !== null && b !== null && a <= j && j <= b && (!p || c.debut > p.debut)) p = c;
    });
    return p;
  }

  // LA MÉMOIRE (§14.3) : une carte, acceptée ou refusée, ne revient pas tant
  // que son déclencheur n'a pas progressé — un compteur à l'ouverture, sur une
  // séance POSTÉRIEURE à la carte, plus bas que celui de la carte ; aucune
  // carte pendant une période allégée. `compteurs` : `[{ exercice, jour,
  // compteur }]`, lus dans les paris de consigne.
  function carteAutorisee(declencheur, jour, cartes, compteurs, blocs) {
    if (periodeAllegee(cartes, jour)) return false;
    // §9.22 (53-2) — PAS DE CUMUL : la carte se tait autour d'une décharge
    // planifiée (des 14 jours qui la précèdent jusqu'à sa fin).
    if (!carteAllegeeAutorisee(blocs, jour)) return false;
    var derniere = null;
    (cartes || []).forEach(function (c) {
      if (c && c.declencheur === declencheur && c.jour <= jour && (!derniere || c.jour > derniere.jour)) derniere = c;
    });
    if (!derniere) return true;
    var seuil = derniere.compteur === null || derniere.compteur === undefined ? PAS_ESCALIER : derniere.compteur;
    return (compteurs || []).some(function (x) {
      return x && x.exercice === declencheur && x.jour > derniere.jour && x.jour <= jour &&
        nombre(x.compteur) !== null && nombre(x.compteur) < seuil;
    });
  }

  // L'OBSERVATION DU PARI ACCEPTÉ, SANS SÉRIE : 1 si le déclencheur progresse
  // avant son prochain déclenchement, 0 à son prochain déclenchement. Rend
  // `null` (pas encore tranché) ou `{ valeur, jour, seance }` — la séance qui
  // tranche, la première dans l'ordre du temps.
  function observationSemaineAllegee(carte, compteurs) {
    if (!carte || carte.reponse !== 'acceptee') return null;
    var c0 = nombre(carte.compteur);
    if (c0 === null) return null;
    var prochain = c0 - (c0 % PAS_ESCALIER) + PAS_ESCALIER;
    var apres = (compteurs || []).filter(function (x) {
      return x && x.exercice === carte.declencheur && x.jour > carte.jour && nombre(x.compteur) !== null;
    }).sort(function (a, b) { return avantAlpha(String(a.debut || a.jour), String(b.debut || b.jour)); });
    for (var i = 0; i < apres.length; i++) {
      var v = nombre(apres[i].compteur);
      if (v < c0) return { valeur: 1, jour: apres[i].jour, seance: apres[i].seance || null, debut: apres[i].debut || null };
      if (v >= prochain) return { valeur: 0, jour: apres[i].jour, seance: apres[i].seance || null, debut: apres[i].debut || null };
    }
    return null;
  }

  // ══ §9.22 (53-2) — LES PROGRAMMES À CYCLES ════════════════════════════════
  //
  // « Un programme fixe la zone de tes barres, la durée du bloc et sa
  // décharge. Il ne choisit jamais un exercice, ne touche pas à leur ordre, et
  // ne décide pas des charges : le coach continue de le faire. » Tout est pur
  // ici ; une fonction par notion. Référence : `cycles53.py` ; cas
  // `cas-53-2-cycles.json`. Un bloc : `{ id, dossier, zone, debut, semaines,
  // decharge, exercices, statut, precedent }` (la table `blocs`, v2_058).
  var ZONES_DE_BLOC = ['lourd', 'mix'];      // §19.2 amendé : la force seulement
  var SANS_CUMUL_JOURS = 14;                 // §14.4 : une réduction s'applique une fois
  var SEMAINES_BLOC_MIN = 3;
  var SEMAINES_BLOC_MAX = 6;
  var SEMAINES_BLOC_DEFAUT = 4;
  var MODULE_PROGRAMME = 'programme';
  var GRANDEUR_PROGRAMME = 'exercices_en_progres';
  var BLOC_EN_COURS = 'en_cours';

  // « Semaine k sur N » = (jour − début) ÷ 7 + 1, AU CALENDRIER — jamais en
  // séances : le coach ne commente pas l'assiduité. `null` avant et après.
  function semaineDuBloc(bloc, jour) {
    var d = bloc ? numeroDuJour(jourCivil(bloc.debut)) : null;
    var j = numeroDuJour(jourCivil(jour));
    var n = bloc ? nombre(bloc.semaines) : null;
    if (d === null || j === null || n === null || j < d) return null;
    var k = Math.floor((j - d) / 7) + 1;
    return k <= n ? k : null;
  }

  // Le premier jour de la dernière semaine : début + 7 × (semaines − 1).
  function debutDecharge(bloc) {
    var n = bloc ? nombre(bloc.semaines) : null;
    if (n === null || n < 1) return null;
    return ajouterJours(jourCivil(bloc.debut), 7 * (n - 1));
  }
  function finDuBloc(bloc) {
    var n = bloc ? nombre(bloc.semaines) : null;
    if (n === null || n < 1) return null;
    return ajouterJours(jourCivil(bloc.debut), 7 * n - 1);
  }

  // LA DÉCHARGE PLANIFIÉE A LIEU : le bloc en prévoit une, et aucune semaine
  // allégée ne s'est terminée moins de 14 jours avant son début (pas de cumul,
  // §14.4) — ni pendant elle. `finsAllegees` : les derniers jours des semaines
  // allégées acceptées.
  function dechargePlanifiee(bloc, finsAllegees) {
    if (!bloc || bloc.decharge !== true) return false;
    var d = numeroDuJour(debutDecharge(bloc));
    if (d === null) return false;
    return !(finsAllegees || []).some(function (f) {
      var k = numeroDuJour(jourCivil(f));
      return k !== null && k > d - SANS_CUMUL_JOURS && k < d + 7;
    });
  }

  // LA CARTE D'UNE SEMAINE ALLÉGÉE SE TAIT des 14 jours qui précèdent la
  // décharge planifiée d'un bloc en cours JUSQU'À LA FIN de cette décharge
  // (le défaut corrigé au rejeu de `cycles53.py` : elle restait possible
  // pendant la décharge).
  function carteAllegeeAutorisee(blocs, jour) {
    var j = numeroDuJour(jourCivil(jour));
    if (j === null) return true;
    return !(blocs || []).some(function (b) {
      if (!b || b.statut !== BLOC_EN_COURS || b.decharge !== true) return false;
      var d = numeroDuJour(debutDecharge(b));
      return d !== null && j >= d - SANS_CUMUL_JOURS && j <= d + 6;
    });
  }

  // La période de la décharge planifiée en cours au jour `jour` : `{ debut,
  // fin, semaine, semaines, bloc }`, ou `null`. Une décharge qui a sauté (pas
  // de cumul) n'en a pas.
  function dechargeDuJour(blocs, jour, finsAllegees) {
    var j = numeroDuJour(jourCivil(jour));
    if (j === null) return null;
    var p = null;
    (blocs || []).forEach(function (b) {
      if (p || !b || b.statut !== BLOC_EN_COURS || !dechargePlanifiee(b, finsAllegees)) return;
      var d = numeroDuJour(debutDecharge(b));
      if (d !== null && j >= d && j <= d + 6) {
        p = { debut: debutDecharge(b), fin: ajouterJours(debutDecharge(b), 6), semaine: nombre(b.semaines),
              semaines: nombre(b.semaines), bloc: b.id === undefined ? null : b.id };
      }
    });
    return p;
  }

  // Les périodes des décharges planifiées (blocs en cours et terminés) : le
  // compteur ne compte ni ne juge leurs séances, comme une semaine allégée.
  function periodesDecharge(blocs, finsAllegees) {
    return (blocs || []).filter(function (b) {
      return b && (b.statut === BLOC_EN_COURS || b.statut === 'termine') && dechargePlanifiee(b, finsAllegees);
    }).map(function (b) { return { debut: debutDecharge(b), fin: ajouterJours(debutDecharge(b), 6) }; });
  }

  // AU DÉBUT D'UN BLOC, une ligne de zone par exercice du bloc, datée du début
  // (00:00, l'heure locale), `origine = 'bloc'` (§9.1.2 amendé : la
  // déclaration la plus récente l'emporte). Une zone hors Lourd/Mix ne pose
  // rien (I37). `ids` : `fabriquer()` rend un identifiant neuf par ligne.
  // Le début d'un bloc, à 00:00 heure locale : la date de ses lignes.
  function minuitDuDebut(bloc) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((bloc && jourCivil(bloc.debut)) || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0).toISOString() : null;
  }
  function zonesPosees(bloc, fabriquer, userId) {
    if (!bloc || ZONES_DE_BLOC.indexOf(bloc.zone) < 0) return [];
    var minuit = minuitDuDebut(bloc);
    if (!minuit) return [];
    var vus = {};
    return (bloc.exercices || []).filter(function (slug) {
      if (!slug || vus[slug]) return false;
      vus[slug] = true;
      return true;
    }).map(function (slug) {
      return { id: typeof fabriquer === 'function' ? fabriquer() : null, user_id: userId === undefined ? null : userId,
               exercise_slug: slug, zone: bloc.zone, corrigee_a: minuit, origine: 'bloc',
               bloc_id: bloc.id === undefined ? null : bloc.id };
    });
  }

  // LA ZONE PROPOSÉE POUR LE PREMIER BLOC (MOTEUR §9.22, 60-2b) : elle suit
  // l'OBJECTIF du questionnaire — Force ou Les deux → Lourd (la force se travaille
  // lourde) ; Muscle, Forme ou sans réponse → Mix (le défaut d'avant). Une
  // PROPOSITION : la feuille du programme la laisse modifiable. Elle ne vaut que pour
  // un premier bloc ; le suivant garde sa règle fixe (`blocSuivant`). Pure, sans
  // lire le profil : l'appelant passe l'objectif.
  function zoneDuPremierBloc(objectif) {
    return objectif === 'force' || objectif === 'les_deux' ? 'lourd' : 'mix';
  }

  // LE BLOC SUIVANT, PAR UNE RÈGLE FIXE (Mix → Lourd → Mix…, mêmes durée et
  // exercices, une décharge à chaque fin) — JAMAIS DÉDUITE DU BLOC PASSÉ (§20.1).
  function blocSuivant(bloc) {
    if (!bloc || ZONES_DE_BLOC.indexOf(bloc.zone) < 0) return null;
    return { zone: bloc.zone === 'mix' ? 'lourd' : 'mix', semaines: nombre(bloc.semaines),
             decharge: true, exercices: (bloc.exercices || []).slice() };
  }

  // LES EXERCICES PAR DÉFAUT : les barres polyarticulaires (au moins 3 muscles
  // principaux et secondaires, `estPolyarticulaire`) des routines du dossier,
  // dans l'ordre, sans doublon — PLUS les exercices prioritaires du
  // questionnaire (MOTEUR §9.22, 60-2b) qui sont dans ces routines, même hors
  // barre : la force se travaille lourde sur l'exercice qu'on veut améliorer.
  // `catalogue` : `{ [slug]: { equipement, muscles_primaires,
  // muscles_secondaires } }` ; `priorites` : `profiles.priorites` tel que la
  // base le donne (des slugs d'exercice ET des clés de zone — seuls les slugs
  // des routines comptent ; une priorité absente des routines ne fait rien, une
  // valeur qui n'est pas une liste non plus). Toujours décochable : ce n'est
  // qu'une coche de départ.
  function exercicesParDefaut(slugs, catalogue, priorites) {
    var vus = {};
    var voulus = {};
    (Array.isArray(priorites) ? priorites : []).forEach(function (p) {
      if (typeof p === 'string') voulus[p] = true;
    });
    return (slugs || []).filter(function (slug) {
      if (!slug || vus[slug]) return false;
      if (Object.prototype.hasOwnProperty.call(voulus, slug)) { vus[slug] = true; return true; }
      var e = catalogue && Object.prototype.hasOwnProperty.call(catalogue, slug) ? catalogue[slug] : null;
      if (!e || e.equipement !== 'barre' || e.charge === 'ajoutee') return false;
      if (!estPolyarticulaire({ prim: e.muscles_primaires, sec: e.muscles_secondaires })) return false;
      vus[slug] = true;
      return true;
    });
  }

  // LE BILAN, en faits, HORS SEMAINE DE DÉCHARGE : pour chaque exercice du bloc,
  // sa première et sa dernière charge de travail (palier, niveau validé) ; et
  // les paris de consigne sur les exercices du bloc, observés, et tenus
  // (observée ≥ prédite). `seances` : `{ [slug]: [{ date, palier, niveau }] }` ;
  // `paris` : `[{ date, exercice, predite, observee }]` (de consigne
  // seulement : l'appelant écarte l'escalier et le programme).
  function bilanDuBloc(bloc, seances, paris) {
    var d = bloc ? numeroDuJour(jourCivil(bloc.debut)) : null;
    var n = bloc ? nombre(bloc.semaines) : null;
    var sortie = { exercices: {}, paris: 0, tenus: 0 };
    if (d === null || n === null) return sortie;
    var dd = bloc.decharge === true ? numeroDuJour(debutDecharge(bloc)) : null;
    var dans = function (date) {
      var j = numeroDuJour(jourCivil(date));
      if (j === null || j < d || j >= d + 7 * n) return false;
      return dd === null || j < dd;
    };
    var exos = bloc.exercices || [];
    exos.forEach(function (slug) {
      var l = ((seances || {})[slug] || []).filter(function (s) {
        return s && dans(s.date) && nombre(s.palier) !== null && nombre(s.niveau) !== null;
      }).slice().sort(function (a, b) { return avantAlpha(String(jourCivil(a.date)), String(jourCivil(b.date))); });
      if (!l.length) return;
      var a = l[0], b = l[l.length - 1];
      var premiere = [nombre(a.palier), nombre(a.niveau)], derniere = [nombre(b.palier), nombre(b.niveau)];
      sortie.exercices[slug] = { premiere: premiere, derniere: derniere,
        change: !memeCharge(premiere[0], derniere[0]) || premiere[1] !== derniere[1] };
    });
    (paris || []).forEach(function (q) {
      if (!q || exos.indexOf(q.exercice) < 0 || !dans(q.date)) return;
      var pr = nombre(q.predite), ob = nombre(q.observee);
      if (pr === null || ob === null) return;
      sortie.paris++;
      if (ob >= pr) sortie.tenus++;
    });
    return sortie;
  }

  // Les exercices du bilan qui ont PROGRESSÉ : la dernière charge plus lourde,
  // ou la même avec plus de reps. L'observation du pari de programme.
  function progresDuBilan(bilan) {
    var x = (bilan && bilan.exercices) || {};
    return Object.keys(x).filter(function (slug) {
      var a = x[slug].premiere, b = x[slug].derniere;
      return (b[0] > a[0] && !memeCharge(a[0], b[0])) || (memeCharge(a[0], b[0]) && b[1] > a[1]);
    }).length;
  }

  // §9.22 (53-2 bis, 53-2 ter) — LES LIGNES INERTES. Un bloc pose ses lignes
  // datées de son début ; arrêté AVANT, il ne doit rien changer : une ligne
  // POSÉE par un bloc arrêté (`arrete`), datée de son début, après l'arrêt
  // (`modifie_a`), est IGNORÉE — retirée de la liste, comme absente, et jamais
  // lue comme « sans zone » : la lecture retombe sur la ligne d'avant (une
  // correction de la personne d'avant le programme tient). Les lignes d'un
  // bloc arrêté en cours de route ont valu jusqu'à l'arrêt ; la ligne de
  // l'arrêt elle-même (datée de l'arrêt, pas du début) reste. Pure : la seule
  // lecture des zones de l'app passe par elle.
  function lignesDeZoneValides(lignes, blocs) {
    var arretes = {};
    (blocs || []).forEach(function (b) {
      var t = b && b.statut === 'arrete' ? instant(b.modifie_a) : null;
      var m = t !== null ? instant(minuitDuDebut(b)) : null;
      if (m !== null) arretes[b.id] = { arret: t, debut: m };
    });
    return (lignes || []).filter(function (l) {
      if (!l || l.origine !== LIGNE_BLOC || !Object.prototype.hasOwnProperty.call(arretes, l.bloc_id)) return true;
      var a = arretes[l.bloc_id], t = instant(l.corrigee_a);
      return !(t !== null && t === a.debut && t > a.arret);
    });
  }

  // §9.22 (53-2 ter) — LE PROGRAMME D'UN BLOC : ses blocs, en remontant
  // `precedent`, jusqu'au premier. Une boucle (une donnée abîmée) s'arrête.
  function blocsDuProgramme(bloc, blocs) {
    var parId = {};
    (blocs || []).forEach(function (b) { if (b && b.id !== undefined) parId[b.id] = b; });
    var chaine = [], vus = {}, b = bloc;
    while (b && !vus[b.id]) {
      vus[b.id] = true;
      chaine.push(b);
      b = b.precedent ? (parId[b.precedent] || null) : null;
    }
    return chaine;
  }

  // §9.22 (53-2 ter) — L'ARRÊT REND LA ZONE D'AVANT LE PROGRAMME. Pendant ou
  // après le bloc : pour chaque exercice du bloc dont la ligne en vigueur à
  // l'instant `a` vient d'un bloc de ce programme, une ligne datée de `a`,
  // origine « bloc », `bloc_id` du bloc arrêté, avec la zone en vigueur juste
  // avant le début du PREMIER bloc (nulle : « d'après tes séances »). Un
  // exercice que la personne a corrigé pendant le programme : rien. Avant le
  // début : rien non plus — aucune ligne du bloc n'est en vigueur, et ses
  // lignes à venir sont inertes (`lignesDeZoneValides`). `blocs` : l'état
  // APRÈS l'arrêt (le bloc arrêté porte son statut et `modifie_a`). Pure.
  function lignesDArret(bloc, blocs, lignes, a, fabriquer, userId) {
    if (!bloc || instant(a) === null) return [];
    var programme = blocsDuProgramme(bloc, blocs);
    var ids = {};
    programme.forEach(function (b) { ids[b.id] = true; });
    var avant = minuitDuDebut(programme[programme.length - 1]);
    var lues = lignesDeZoneValides(lignes, blocs);
    var vus = {};
    return (bloc.exercices || []).map(function (slug) {
      if (!slug || vus[slug]) return null;
      vus[slug] = true;
      var l = ligneDeZoneAu(lues, slug, a, true);
      if (!l || l.origine !== LIGNE_BLOC || !l.zone || !ids[l.bloc_id]) return null;
      var d = avant ? ligneDeZoneAu(lues, slug, avant, false) : null;
      return { id: typeof fabriquer === 'function' ? fabriquer() : null, user_id: userId === undefined ? null : userId,
               exercise_slug: slug, zone: d && d.zone ? d.zone : null, corrigee_a: a, origine: LIGNE_BLOC,
               bloc_id: bloc.id };
    }).filter(Boolean);
  }

  // §9.10 (53-2 bis, D1 ; 53-2 ter) — LA LIGNE QUI COMMENCE UN BLOC, ou `null` :
  // une ligne de bloc qui pose la zone du bloc, datée de son début (00:00).
  // La ligne d'un arrêt porte aussi l'origine « bloc » (et parfois une zone,
  // celle d'avant le programme) : ce n'est pas un début de bloc.
  function ligneDeDebutDeBloc(ligne, blocs) {
    if (!ligne || ligne.origine !== LIGNE_BLOC || !ligne.zone) return null;
    var b = (blocs || []).filter(function (x) { return x && x.id === ligne.bloc_id; })[0];
    if (!b || b.zone !== ligne.zone) return null;
    var m = minuitDuDebut(b);
    return m && instant(m) === instant(ligne.corrigee_a) ? ligne : null;
  }

  // Le bloc en cours d'un dossier (un seul : l'index `blocs_un_en_cours`), et
  // ceux d'un exercice au jour `jour` (I39 : « Changer de schéma » se tait).
  // §9.22 (53-2 bis) — DE SON DÉBUT JUSQU'AU CHOIX : entre la fin du bloc et
  // le geste de la personne, rien ne change sans elle — le bloc compte encore.
  // Avant son début, il ne compte pas encore (§9.12).
  function blocEnCours(blocs, dossier) {
    return (blocs || []).filter(function (b) { return b && b.statut === BLOC_EN_COURS && b.dossier === dossier; })[0] || null;
  }
  function exercicesEnBloc(blocs, jour) {
    var sortie = {};
    (blocs || []).forEach(function (b) {
      if (!b || b.statut !== BLOC_EN_COURS) return;
      if (semaineDuBloc(b, jour) === null && !blocTermine(b, jour)) return;
      (b.exercices || []).forEach(function (slug) { sortie[slug] = true; });
    });
    return sortie;
  }

  // ── Ce que le programme dit — par le formateur unique ──
  // `bornes` : « Mix (6-8) » — la feuille et la phrase du bloc suivant.
  function libelleZoneDeBloc(zone, bornes) {
    var z = zoneParCle(zone);
    if (!z) return '';
    return bornes ? z.libelle + ' (' + nombreFr(z.bas, regle('zone.bas')) + '-' + nombreFr(z.haut, regle('zone.haut')) + ')'
                  : z.libelle;
  }
  // « Bloc Mix · semaine 2 sur 4 » ; avant le début, « Bloc Mix · dès le lundi
  // 12 oct. » ; après la fin, « Bloc Mix terminé » — jusqu'au choix (§9.22).
  function badgeDuBloc(bloc, jour) {
    if (!bloc) return null;
    var tete = 'Bloc ' + libelleZoneDeBloc(bloc.zone);
    var k = semaineDuBloc(bloc, jour);
    if (k !== null) {
      return tete + ' · semaine ' + nombreFr(k, regle('bloc.semaine')) + ' sur ' +
        nombreFr(nombre(bloc.semaines), regle('bloc.semaines'));
    }
    var j = numeroDuJour(jourCivil(jour)), d = numeroDuJour(jourCivil(bloc.debut));
    if (j !== null && d !== null && j < d) return tete + ' · dès le ' + Modele().jourNomme(jourCivil(bloc.debut), regle('bloc.debut'));
    return tete + ' terminé';
  }
  function blocTermine(bloc, jour) {
    var j = numeroDuJour(jourCivil(jour)), f = numeroDuJour(finDuBloc(bloc));
    return !!bloc && bloc.statut === BLOC_EN_COURS && j !== null && f !== null && j > f;
  }
  // Le bandeau de la décharge planifiée — jamais présentée comme
  // scientifiquement requise.
  var FIN_DECHARGE = 'Mêmes charges, moins de séries, loin de l’échec.';
  function bandeauDecharge(semaine, semaines) {
    return 'Semaine ' + nombreFr(semaine, regle('bloc.semaine')) + ' sur ' + nombreFr(semaines, regle('bloc.semaines')) +
      DEUX_POINTS + 'la décharge prévue par ton programme. ' + FIN_DECHARGE;
  }
  // La carte de fin de bloc, en faits : le titre, une ligne par exercice
  // (`{ nom, valeur }` : deux colonnes, maquette cycles v1), les paris, le pari de programme s'il y en avait un, et le bloc suivant.
  // `noms` : `{ [slug]: nom }` ; `pari` : `{ predite, observee }` ou `null`.
  function carteFinDeBloc(bloc, bilan, noms, pari) {
    if (!bloc || !bilan) return null;
    var nom = function (s) { return noms && noms[s] ? noms[s] : s; };
    var cP = cite(FAIT, { quoi: 'bilan' });
    var lignes = (bloc.exercices || []).filter(function (s) { return bilan.exercices[s]; }).map(function (s) {
      var x = bilan.exercices[s];
      return { nom: nom(s), valeur: chargeFois(x.premiere[0], x.premiere[1], cP) +
        (x.change ? ' → ' + chargeFois(x.derniere[0], x.derniere[1], cP) : ', inchangé') };
    });
    var p = bilan.paris, t = bilan.tenus;
    var phraseParis = p === 0 ? 'Le coach n’avait fait aucun pari sur ce bloc.'
      : 'Le coach avait fait ' + nombreFr(p, regle('bilan.paris')) + (p > 1 ? ' paris' : ' pari') + ' sur ce bloc' +
        DEUX_POINTS + nombreFr(t, regle('bilan.tenus')) + (t > 1 ? ' ont tenu.' : ' a tenu.');
    var phrasePari = null;
    if (pari && nombre(pari.predite) !== null && nombre(pari.observee) !== null) {
      var pp = nombre(pari.predite), po = nombre(pari.observee);
      phrasePari = 'Le coach avait parié que tes ' + nombreFr(pp, regle('programme.predite')) + ' exercices progresseraient' +
        DEUX_POINTS + nombreFr(po, regle('programme.observee')) + (po > 1 ? ' ont progressé.' : ' a progressé.');
    }
    var suivant = blocSuivant(bloc);
    // §9.22 (53-2 bis, D3) — la règle, sans jargon : « Le suivant, comme le
    // font les programmes de force : Lourd (3-5) sur tes mouvements à la barre,
    // 4 semaines, décharge la dernière semaine. Les autres exercices gardent
    // leur zone. » `suivantZone` : le morceau que l'écran met en gras.
    var zS = suivant ? zoneParCle(suivant.zone) : null;
    var suivantZone = zS ? libelleZoneDeBloc(suivant.zone, true) : null;
    return {
      titre: 'Ton bloc ' + libelleZoneDeBloc(bloc.zone) + ' est terminé.',
      entete: 'Pendant ce bloc',
      lignes: lignes, paris: phraseParis, pari: phrasePari,
      suivant: zS ? 'Le suivant, comme le font les programmes de force' + DEUX_POINTS + suivantZone +
        ' sur tes mouvements à la barre, ' + nombreFr(suivant.semaines, regle('bloc.semaines')) + ' semaines' +
        (suivant.decharge ? ', décharge la dernière semaine' : '') + '. Les autres exercices gardent leur zone.' : null,
      suivantZone: suivantZone,
      commencer: suivant ? 'Commencer le bloc ' + libelleZoneDeBloc(suivant.zone) : null,
      ajuster: 'Ajuster le bloc',
      arreter: 'Arrêter le programme'
    };
  }

  // ══ §14.5 (49-U15) — L'ESCALIER, DEUXIÈME MARCHE : LE BLOCAGE ISOLÉ ══════
  //
  // « Un exercice cale seul : une marche à la fois, selon sa zone et la
  // phase. » Tout est pur ici. Référence : `coach49.py` (`repli_de`,
  // `marche_isolee`, `carte_schema`, `consigne_repli`, `phrase_repli`,
  // `phrase_seche`) ; cas `cas-49u15-blocage-isole.json`. La série de plus
  // (zones muscle hors sèche) attend la règle de volume (PR 2b, 2c) : d'ici
  // là, sa marche ne propose RIEN.
  var FENETRE_REPLI_JOURS = 90;       // le repli : dans les 3 derniers mois (§14.2)
  var ZONES_FORCE = ['lourd', 'mix'];
  var MARCHE_SCHEMA = 'schema';
  var MARCHE_REPLI = 'repli';
  var MARCHE_SECHE = 'seche_rien';
  var MARCHE_SERIE_DE_PLUS = 'serie_de_plus';
  var MARCHE_SILENCE = 'silence';
  // Lourd → Mix, Mix → Lourd : le schéma voisin, et les deux libellés.
  var SCHEMAS = {
    lourd: { vers: 'mix', oui: 'Passer à 6-8 reps', non: 'Garder 3-5' },
    mix: { vers: 'lourd', oui: 'Passer à 3-5 reps', non: 'Garder 6-8' }
  };
  var DETAIL_SCHEMA = 'En force, une série de plus aide peu. Changer de schéma quelques semaines ' +
    'relance souvent la barre, avant d\'y revenir.';
  var FIN_SECHE = ' En sèche, je ne te propose rien de plus.';

  // Le n-ième déclenchement isolé depuis le dernier progrès : n = (compteur −
  // 4) / 4 + 1, moins les déclenchements répondus par une carte de semaine
  // allégée dont l'exercice était le déclencheur. Entre deux déclenchements,
  // la marche du dernier (le silence s'y lit : « la phrase quitte l'en-tête »).
  // 0 sous le premier déclenchement.
  function nIsole(compteur, repondus) {
    var c = nombre(compteur);
    if (c === null || c < PAS_ESCALIER) return 0;
    return Math.floor((c - PAS_ESCALIER) / PAS_ESCALIER) + 1 - (nombre(repondus) || 0);
  }

  // Les déclenchements de `exercice` répondus par une carte de semaine allégée
  // (acceptée ou refusée) DEPUIS SON DERNIER PROGRÈS : la carte a lui pour
  // déclencheur, un compteur au plus égal à celui d'aujourd'hui, et aucun
  // compteur plus bas n'a été vu sur cet exercice entre la carte et `jour`.
  // `cartes` : `cartesDesParis` ; `compteurs` : `[{ exercice, jour, compteur }]`.
  function declenchementsRepondus(exercice, jour, compteur, cartes, compteurs) {
    var c = nombre(compteur);
    if (c === null) return 0;
    return (cartes || []).filter(function (k) {
      var kc = nombre(k && k.compteur);
      if (!k || k.declencheur !== exercice || kc === null || kc < PAS_ESCALIER || kc > c) return false;
      if (k.reponse !== 'acceptee' && k.reponse !== 'refusee') return false;
      if (!k.jour || k.jour > jour) return false;
      return !(compteurs || []).some(function (x) {
        return x && x.exercice === exercice && x.jour > k.jour && x.jour <= jour &&
          nombre(x.compteur) !== null && nombre(x.compteur) < kc;
      });
    }).length;
  }

  // La table de §14.5 : `n` (1, 2, 3 et plus), la zone, la phase.
  // §14.7 (49-U17) — LES ZONES MUSCLE HORS SÈCHE : n = 1 → la série de plus si
  // la règle de volume laisse de la place (`place === true` ; `null`, pas de
  // base, n'en laisse pas), sinon le repli tout de suite ; n = 2 → le repli si
  // une série de plus a été proposée depuis le dernier progrès (`proposee`),
  // sinon le silence (le repli a déjà eu son tour). Zones force et sèche :
  // inchangé (§14.5).
  //
  // §9.17 — `palier` (facultatif) : la charge de travail de l'exercice. AU POIDS
  // DU CORPS (0) il n'y a ni changement de schéma ni repli — pas de charge —, et
  // sur une AIDE (négative) pas de repli : à ces marches, le silence. La série de
  // plus, elle, reste possible : elle ne touche pas à la charge.
  function marcheIsolee(n, zone, phase, place, proposee, palier) {
    var m = marcheIsoleeBrute(n, zone, phase, place, proposee);
    var p = nombre(palier);
    if (p === 0 && (m === MARCHE_SCHEMA || m === MARCHE_REPLI)) return MARCHE_SILENCE;
    if (p !== null && p < 0 && m === MARCHE_REPLI) return MARCHE_SILENCE;
    return m;
  }

  function marcheIsoleeBrute(n, zone, phase, place, proposee) {
    var k = nombre(n);
    if (k === null || k < 1) return null;
    if (k >= 3) return MARCHE_SILENCE;
    var muscle = ZONES_FORCE.indexOf(zone) < 0 && phase !== 'seche';
    if (k === 2) return !muscle || proposee === true ? MARCHE_REPLI : MARCHE_SILENCE;
    if (ZONES_FORCE.indexOf(zone) >= 0) return MARCHE_SCHEMA;
    if (phase === 'seche') return MARCHE_SECHE;
    return place === true ? MARCHE_SERIE_DE_PLUS : MARCHE_REPLI;
  }

  // « Et tes autres exercices avancent » : aucun AUTRE exercice n'a eu un
  // compteur à 4 ou plus sur 0 à 7 jours (la fenêtre de la semaine allégée).
  // `jours` : la forme de `blocageGeneralise`.
  function autresAvancent(jours, jour, exercice) {
    var d0 = numeroDuJour(jour);
    if (d0 === null) return false;
    return !Object.keys(jours || {}).some(function (jr) {
      var k = numeroDuJour(jr);
      if (k === null || d0 - k < 0 || d0 - k > FENETRE_BLOCAGE_JOURS) return false;
      return Object.keys(jours[jr] || {}).some(function (x) {
        var c = nombre(jours[jr][x]);
        return x !== exercice && c !== null && c >= PAS_ESCALIER;
      });
    });
  }

  // Le début de la phrase du compteur, sans le « plus long que d'habitude » :
  // « 125 kg × 5 reste ta meilleure charge de travail depuis 4 séances » — les espaces de
  // `phraseCompteur` (insécable avant « kg », espaces ordinaires autour de ×).
  function meilleurDepuis(meilleur, compteur) {
    return Modele().charge(meilleur.palier, undefined, cite(FAIT, { quoi: 'meilleur' })) + ' × ' +
      nombreFr(meilleur.niveau, cite(FAIT, { quoi: 'meilleur', champ: 'reps' })) +
      ' reste ta meilleure charge de travail depuis ' + nombreFr(compteur, regle('compteur')) + ' séances';
  }

  // CHANGER DE SCHÉMA (zones force, n = 1) : la carte sous l'exercice. Rend
  // `null` hors des zones force.
  function carteSchema(zone, meilleur, compteur, avancent) {
    var s = SCHEMAS[zone];
    if (!s || !meilleur || meilleur.niveau === null || meilleur.niveau === undefined) return null;
    return {
      zone: zone, nouvelle_zone: s.vers,
      phrase: meilleurDepuis(meilleur, compteur) + (avancent ? ', et tes autres exercices avancent.' : '.'),
      detail: DETAIL_SCHEMA, oui: s.oui, non: s.non
    };
  }

  // EN SÈCHE, ZONE MUSCLE (n = 1) : la phrase grise de l'en-tête, sans carte.
  function phraseSeche(c) {
    var p = phraseCompteur(c);
    return p ? p + FIN_SECHE : null;
  }

  // LE REPLI (§14.2) : le dernier palier TENU (niveau validé au moins au bas de
  // la zone), strictement sous le meilleur ET à 10 % au plus sous lui — la
  // limite du repli de la reprise longue (`REPLI_MAX_REPRISE`, 49-U5 : un seul
  // coach, une seule limite) —, même zone, dans les 90 jours ; le plus récent.
  // Sinon `null` : le repli est sauté, le coach se tait.
  //
  // `seances` : celles du contrat (`neutre`, `decharge` posés) ; une séance
  // neutre ou d'une semaine allégée n'est pas un palier tenu. `o.zoneAu(liste,
  // i)` (facultatif) : la zone de la i-ème séance antérieure — l'app la donne
  // (la consigne que la séance a reçue) ; sans elle, `se.zone` si posée, sinon
  // la séance est de la zone (les cas du simulateur : un exercice, une zone).
  // Rend `{ palier, niveau, debut, reps: [saisies au palier], ligne: [charge,
  // visée] }` — la visée : le niveau borné à la zone.
  function repliEscalier(seances, avant, meilleur, zone, options) {
    var o = options || {};
    var z = zoneParCle(zone);
    var M = meilleur ? nombre(meilleur.palier) : null;
    var t0 = instant(avant);
    if (!z || M === null || t0 === null) return null;
    var plancher = M * (1 - REPLI_MAX_REPRISE) - 1e-9;
    var liste = anterieures(seances || [], avant);
    for (var i = liste.length - 1; i >= 0; i--) {
      var se = liste[i];
      if (t0 - instant(se.debut) > FENETRE_REPLI_JOURS * JOUR) break;
      if (se.neutre === true || se.decharge === true) continue;
      var v = vueDeSeance(se);
      var P = nombre(v.palier);
      if (P === null || P > M || memeCharge(P, M) || P < plancher) continue;
      var A = seriesAuPalier(v);
      var niv = A.length ? niveauValide(A) : null;
      if (niv === null || niv < z.bas) continue;
      var zSe = typeof o.zoneAu === 'function' ? o.zoneAu(liste, i) : se.zone;
      if (zSe !== undefined && zSe !== null && zSe !== zone) continue;
      return { palier: P, niveau: niv, debut: se.debut,
               reps: A.map(function (s) { return nombre(s.reps); }),
               ligne: [P, Math.min(z.haut, Math.max(z.bas, niv))] };
    }
    return null;
  }

  // LA CONSIGNE DE REPLI : la charge du repli, visée = son niveau borné à la
  // zone, SANS LIGNE HAUTE (I22). `repli` porte de quoi dire la phrase.
  function consigneRepli(consigne, repli) {
    var c = consigne || null;
    if (!c || !repli || c.etat === 'silence') return c;
    return Object.assign({}, c, {
      ligne: { charge: repli.ligne[0], vise: repli.ligne[1] },
      haut: null,
      repli: { palier: repli.palier, niveau: repli.niveau, debut: repli.debut, reps: (repli.reps || []).slice() }
    });
  }

  // « On repart de 120 kg, ta dernière charge tenue : 120 kg × 4, 4, 4, 4 le
  // 3 févr. » — la date par le formateur `quand`, contre `reference` (le début
  // de la séance) : « mardi » à 6 jours ou moins.
  function phraseRepli(repli, reference) {
    if (!repli) return null;
    var cR = cite(FAIT, { quoi: 'repli' });
    var kg = Modele().charge(repli.palier, undefined, cR);
    var date = quand(repli.debut, reference, false, cR);
    // « le 3 févr. » porte déjà son point : on n'en remet pas un second.
    return 'On repart de ' + kg + ', ta dernière charge tenue : ' + kg + ' × ' +
      (repli.reps || []).map(function (r) { return nombreFr(r, cite(FAIT, { quoi: 'repli', champ: 'reps' })); }).join(', ') + ' ' +
      date + (/\.$/.test(date) ? '' : '.');
  }

  // Les marches d'un exercice déjà écrites, lues dans les paris de l'escalier :
  // `{ id, seance, jour, exercice, marche, reponse, compteur, debut }`.
  function marchesDesParis(paris) {
    return (paris || []).filter(function (l) {
      return l && l.module === MODULE_ESCALIER && l.fondement &&
        (l.fondement.marche === MARCHE_SCHEMA || l.fondement.marche === MARCHE_REPLI ||
         l.fondement.marche === MARCHE_SERIE_DE_PLUS);
    }).map(function (l) {
      var f = l.fondement;
      return { id: l.id || null, seance: f.seance || null, jour: f.jour || null,
               exercice: f.exercice || l.exercise_slug || null, marche: f.marche,
               reponse: f.reponse || null, compteur: nombre(f.compteur), debut: f.debut || null,
               n: nombre(f.n_routine) };
    });
  }

  // L'OBSERVATION D'UNE MARCHE, SANS SÉRIE : 1 si l'exercice progresse avant
  // son prochain déclenchement, 0 à ce déclenchement ; refusée, jamais. Le
  // repli garde le compteur (8 → 9…) : un compteur plus bas que celui de la
  // marche est un progrès, comme pour la semaine allégée. LE SCHÉMA ACCEPTÉ
  // CHANGE LA ZONE, et le compteur repart de zéro : la première valeur vue
  // après lui est la remise à zéro, pas un progrès ; ensuite, une valeur plus
  // basse que la précédente est un progrès, et 4 le prochain déclenchement.
  function observationMarche(m, compteurs) {
    if (!m || (m.reponse !== 'acceptee' && m.reponse !== 'appliquee')) return null;
    var c0 = nombre(m.compteur);
    if (c0 === null) return null;
    var apres = (compteurs || []).filter(function (x) {
      return x && x.exercice === m.exercice && x.jour > m.jour && nombre(x.compteur) !== null;
    }).sort(function (a, b) { return avantAlpha(String(a.debut || a.jour), String(b.debut || b.jour)); });
    var schema = m.marche === MARCHE_SCHEMA;
    var prochain = schema ? PAS_ESCALIER : c0 - (c0 % PAS_ESCALIER) + PAS_ESCALIER;
    var precedent = schema ? null : c0;
    for (var i = 0; i < apres.length; i++) {
      var v = nombre(apres[i].compteur);
      var tranche = { jour: apres[i].jour, seance: apres[i].seance || null, debut: apres[i].debut || null };
      if (precedent !== null && v < precedent) return Object.assign({ valeur: 1 }, tranche);
      if (v >= prochain) return Object.assign({ valeur: 0 }, tranche);
      if (schema) precedent = v;
    }
    return null;
  }

  // ══ §14.7 (49-U17) — L'ESCALIER, LA SÉRIE DE PLUS ════════════════════════
  //
  // Un exercice de zone muscle cale seul, hors sèche, et ses muscles primaires
  // ont de la place (§14.6) : une série de plus, jusqu'au prochain progrès.
  // Référence : `coach49.py` (`marche_isolee_2c`, `carte_serie_de_plus`,
  // `niveau_sur_la_routine`) ; cas `cas-49u17-serie-de-plus.json`.
  var DETAIL_SERIE_DE_PLUS = 'Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus.';
  var GRIS_SERIE_DE_PLUS = 'une série de plus, jusqu\'à ton prochain progrès';
  // Les muscles au SINGULIER (« ton grand dorsal reste… ») ; les autres se
  // disent au pluriel (« tes pectoraux restent… »). Tous masculins.
  var MUSCLES_SINGULIERS = ['bas_du_dos', 'haut_du_dos', 'grand_dorsal',
    'deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur'];

  // Les marches de `exercice` écrites DEPUIS SON DERNIER PROGRÈS : la marche
  // (`marche`), une réponse parmi `reponses`, un compteur au plus égal à celui
  // d'aujourd'hui, et aucun compteur plus bas vu sur l'exercice entre elle et
  // `jour` (même lecture que `declenchementsRepondus`).
  function marchesDepuisProgres(exercice, jour, compteur, marches, compteurs, marche, reponses) {
    var c = nombre(compteur);
    if (c === null) return [];
    return (marches || []).filter(function (m) {
      var mc = nombre(m && m.compteur);
      if (!m || m.exercice !== exercice || m.marche !== marche || mc === null || mc > c) return false;
      if (reponses.indexOf(m.reponse) < 0 || !m.jour || m.jour > jour) return false;
      return !(compteurs || []).some(function (x) {
        return x && x.exercice === exercice && x.jour > m.jour && x.jour <= jour &&
          nombre(x.compteur) !== null && nombre(x.compteur) < mc;
      });
    });
  }

  // UNE MARCHE PROPOSÉE NE REVIENT PAS (§14.7, delta 49-35, #348) : la marche
  // `marche` (schéma ou série de plus) a-t-elle été proposée — acceptée ou
  // refusée, son pari existe — depuis le dernier progrès de l'exercice ? Rend
  // le pari le plus récent, ou `null`. UNE seule règle pour toutes les marches :
  // c'est elle qui retient la carte au même déclenchement, et elle qui ouvre le
  // repli au suivant après une série de plus.
  function marcheProposee(exercice, jour, compteur, marches, compteurs, marche) {
    var p = marchesDepuisProgres(exercice, jour, compteur, marches, compteurs, marche, ['acceptee', 'refusee']);
    if (!p.length) return null;
    return p.slice().sort(function (x, y) { return avantAlpha(String(y.jour), String(x.jour)); })[0];
  }

  // Une série de plus a-t-elle été proposée depuis le dernier progrès ?
  function serieDePlusProposee(exercice, jour, compteur, marches, compteurs) {
    return marcheProposee(exercice, jour, compteur, marches, compteurs, MARCHE_SERIE_DE_PLUS) !== null;
  }

  // LA SÉRIE DE PLUS EN COURS : acceptée, et pas de progrès depuis. Rend le
  // pari (la plus récente acceptation), ou `null`.
  function serieDePlusActive(exercice, jour, compteur, marches, compteurs) {
    var a = marchesDepuisProgres(exercice, jour, compteur, marches, compteurs, MARCHE_SERIE_DE_PLUS, ['acceptee']);
    if (!a.length) return null;
    return a.slice().sort(function (x, y) { return avantAlpha(String(y.jour), String(x.jour)); })[0];
  }

  // Les PÉRIODES où une série de plus était active, pour le niveau sur la
  // routine : du début de la séance qui l'a acceptée jusqu'à la séance qui
  // ouvre APRÈS le progrès (exclue) — le premier compteur plus bas que celui
  // de l'acceptation. `marches` : `marchesDesParis` (avec `debut`, `n`).
  // Rend `{ [exercice]: [{ debut, fin, n }] }`.
  function periodesSerieDePlus(marches, compteurs) {
    var sortie = {};
    (marches || []).forEach(function (m) {
      if (!m || m.marche !== MARCHE_SERIE_DE_PLUS || m.reponse !== 'acceptee' || !m.debut || nombre(m.n) === null) return;
      var c0 = nombre(m.compteur);
      var apres = (compteurs || []).filter(function (x) {
        return x && x.exercice === m.exercice && x.jour > m.jour && nombre(x.compteur) !== null &&
          (c0 === null || nombre(x.compteur) < c0);
      }).sort(function (a, b) { return avantAlpha(String(a.debut || a.jour), String(b.debut || b.jour)); });
      (sortie[m.exercice] || (sortie[m.exercice] = [])).push({
        debut: m.debut, fin: apres.length ? (apres[0].debut || apres[0].jour) : null, n: nombre(m.n) });
    });
    return sortie;
  }

  // Les noms des muscles, accordés : « tes pectoraux », « ton grand dorsal »,
  // « tes biceps et ton grand dorsal » (la première lettre en majuscule, le
  // début d'une phrase). `muscles` : `[{ cle, libelle }]` (le libellé du
  // catalogue), dans l'ordre de l'exercice. `pluriel` : le verbe qui suit
  // s'accorde au pluriel ; `plusieurs` : il y a plus d'un muscle.
  function motsDesMuscles(muscles) {
    var l = (muscles || []).map(function (m) {
      var lib = String(m.libelle || m.cle || '');
      var sing = MUSCLES_SINGULIERS.indexOf(m.cle) >= 0;
      return { mots: (sing ? 'ton ' : 'tes ') + lib.charAt(0).toLowerCase() + lib.slice(1), sing: sing };
    });
    if (!l.length) return null;
    var liste = l.length > 1
      ? l.slice(0, -1).map(function (x) { return x.mots; }).join(', ') + ' et ' + l[l.length - 1].mots
      : l[0].mots;
    return { texte: liste.charAt(0).toUpperCase() + liste.slice(1),
             pluriel: l.length > 1 || !l[0].sing, plusieurs: l.length > 1 };
  }

  // « Tes pectoraux restent », « ton grand dorsal reste », « tes biceps et ton
  // grand dorsal restent ».
  function sujetDesMuscles(muscles) {
    var s = motsDesMuscles(muscles);
    if (!s) return null;
    return s.texte + (s.pluriel ? ' restent sous leur volume habituel.' : ' reste sous son volume habituel.');
  }

  // LA PHRASE DE LA PRIORITÉ (MOTEUR §14.7, 60-2b) : quand un muscle n'a de
  // place que parce qu'il est prioritaire — au-dessus de son troisième quartile,
  // sous son plus haut volume. « Tes pectoraux sont ta priorité : je te laisse
  // aller jusqu'à ton plus haut volume. » ; au singulier « Ton grand dorsal est
  // ta priorité » ; plusieurs muscles prioritaires, « sont tes priorités ».
  // `muscles` : ceux dont la place ne vient que de la priorité.
  function sujetDesPriorites(muscles) {
    var s = motsDesMuscles(muscles);
    if (!s) return null;
    return s.texte + (s.plusieurs ? ' sont tes priorités' : (s.pluriel ? ' sont ta priorité' : ' est ta priorité')) +
      ' : je te laisse aller jusqu\'à ton plus haut volume.';
  }

  // LA CARTE DE LA SÉRIE DE PLUS, sous l'exercice : la phrase du meilleur (avec
  // « et tes autres exercices avancent » ou un point), le détail, les deux
  // boutons, et le gris qui suivra l'acceptation. `parPriorite` : les muscles
  // de l'exercice dont la place ne vient QUE de la priorité (60-2b) — s'il y
  // en a, le détail le dit à la place de « restent sous leur volume habituel ».
  function carteSerieDePlus(meilleur, compteur, avancent, muscles, parPriorite) {
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined) return null;
    var sujet = (parPriorite && parPriorite.length ? sujetDesPriorites(parPriorite) : null) ||
      sujetDesMuscles(muscles);
    return {
      type: MARCHE_SERIE_DE_PLUS,
      phrase: meilleurDepuis(meilleur, compteur) + (avancent ? ', et tes autres exercices avancent.' : '.'),
      detail: DETAIL_SERIE_DE_PLUS + (sujet ? ' ' + sujet : ''),
      oui: 'Ajouter une série', non: 'Non merci', gris_apres: GRIS_SERIE_DE_PLUS
    };
  }

  // LA CONSIGNE AVEC LA SÉRIE DE PLUS : la même consigne, qui sait que la
  // routine compte `n` séries — la couverture (`couvertureSeance`) met la
  // ligne en plus APRÈS elles, à la charge et à la visée de la ligne, jamais
  // un test (I24).
  function consigneSerieDePlus(consigne, n) {
    var c = consigne || null;
    var k = nombre(n);
    if (!c || c.etat === 'silence' || k === null || k < 1 || !(c.ligne || c.haut)) return c;
    return Object.assign({}, c, { serieDePlus: { routine: k } });
  }

  // ══ §14.6 (49-U16) — LA PLACE POUR UNE SÉRIE DE PLUS : LA RÈGLE DE VOLUME ══
  //
  // « La moyenne des 3 dernières semaines actives dépasse-t-elle le troisième
  // quart de ses moyennes habituelles ? » Un fait par muscle, sur le volume de
  // chaque semaine (`THSemaine.semainesDeVolume`, le seul fil du volume) ;
  // AUCUN affichage : la série de plus (PR 2c) le lira dans le plan.
  // Référence : `coach49.py` (`fenetres_muscle`, `laisse_de_la_place`) ; cas
  // `cas-49u16-volume.json` ; REGLE-VOLUME-V2 §1, §11.3, §11.4.
  var FENETRE_VOLUME = 3;          // les 3 dernières semaines ACTIVES
  var VIDES_NOUVELLE_EPOQUE = 4;   // 4 semaines vides consécutives : une nouvelle époque
  var FENETRES_DE_BASE = 6;        // au moins 6 fenêtres de référence, sinon pas de base
  var QUARTILE_VOLUME = 0.75;      // le 3e quartile, au rang le plus proche ⌈0,75 n⌉

  // `semaines` : `[{ semaine, active, volume }]`, dans l'ordre, TOUTES les
  // semaines avant celle de la séance, vides comprises. Une fenêtre se calcule
  // à chaque semaine active, sur les 3 dernières semaines actives de la même
  // époque (une semaine vide ne compte pas et ne casse pas la fenêtre) ; la
  // dernière est celle d'aujourd'hui, les précédentes de l'époque sont la
  // référence. Rend `{ place, moyenne, seuil, max, fenetres }` (`fenetres` : le
  // nombre de fenêtres de référence ; `max` : la plus haute d'entre elles, le
  // plafond d'un muscle prioritaire — 60-2b), ou `null` : pas de base — moins de 6
  // fenêtres de référence, ou une époque qui n'a pas encore 3 semaines actives
  // (4 semaines vides juste avant la séance en ouvrent une).
  function placeDeVolume(semaines) {
    var actifs = [], ref = [], derniere = null, vides = 0;
    (semaines || []).forEach(function (s) {
      if (!s || s.active !== true) { vides++; return; }
      if (vides >= VIDES_NOUVELLE_EPOQUE) { actifs = []; ref = []; derniere = null; }
      vides = 0;
      actifs.push(nombre(s.volume) || 0);
      if (actifs.length >= FENETRE_VOLUME) {
        if (derniere !== null) ref.push(derniere);
        var a = actifs.slice(-FENETRE_VOLUME);
        derniere = a.reduce(function (x, y) { return x + y; }, 0) / FENETRE_VOLUME;
      }
    });
    if (vides >= VIDES_NOUVELLE_EPOQUE || derniere === null || ref.length < FENETRES_DE_BASE) return null;
    var tri = ref.slice().sort(function (x, y) { return x - y; });
    var seuil = tri[Math.ceil(QUARTILE_VOLUME * tri.length) - 1];
    return { place: derniere <= seuil + 1e-9, moyenne: derniere, seuil: seuil, max: tri[tri.length - 1],
             fenetres: ref.length };
  }

  // LA PLACE D'UN MUSCLE (§14.6) : `'normale'` (la dernière fenêtre ne dépasse
  // pas le troisième quartile), `'priorite'` (elle le dépasse mais pas le plus
  // haut volume de la même époque, et le muscle est prioritaire — 60-2b : jamais
  // au-delà de ce que la personne a déjà fait), ou `null`. Sans base (`null`) ou
  // sans `max` (le démonstrateur n'en fabrique pas), pas de place par priorité.
  function placeDuMuscle(v, prioritaire) {
    if (!v) return null;
    if (v.place === true) return 'normale';
    var m = nombre(v.moyenne);
    var x = nombre(v.max);
    return prioritaire && m !== null && x !== null && m <= x + 1e-9 ? 'priorite' : null;
  }

  // POUR UN EXERCICE : de la place sur CHACUN de ses muscles primaires. Un seul
  // muscle sans base (`null`, absent) ou sans place, et pas de place — se taire
  // faute de donnée, comme le repli (§14.2). Sans muscle primaire connu : non.
  // `volume` : `{ [muscle]: placeDeVolume(...) | null }` ; `prioritaires` : ceux
  // des muscles primaires qui sont prioritaires (60-2b) — leur place va jusqu'au
  // plus haut volume (`max`), pas au troisième quartile.
  function placeDesMuscles(volume, primaires, prioritaires) {
    var p = primaires || [];
    var pr = prioritaires || [];
    if (!volume || !p.length) return null;
    return p.map(function (m) {
      var v = Object.prototype.hasOwnProperty.call(volume, m) ? volume[m] : null;
      return placeDuMuscle(v, pr.indexOf(m) >= 0);
    });
  }

  function placePourExercice(volume, primaires, prioritaires) {
    var l = placeDesMuscles(volume, primaires, prioritaires);
    return !!l && l.every(function (x) { return x !== null; });
  }

  // Les muscles primaires dont la place ne vient QUE de la priorité — pour la
  // phrase de la carte. Vide quand l'exercice n'a pas de place (la carte n'existe
  // pas) ou quand aucun muscle n'en a besoin.
  function musclesParPriorite(volume, primaires, prioritaires) {
    if (!placePourExercice(volume, primaires, prioritaires)) return [];
    var l = placeDesMuscles(volume, primaires, prioritaires);
    return (primaires || []).filter(function (m, i) { return l[i] === 'priorite'; });
  }

  // ══ §9.17 — LE LEST : SON DÉPART, ET LA CARTE QUI Y MÈNE ═════════════════════
  //
  // « Le poids du corps est une charge qui ne bouge pas : seule différence,
  // quand le coach voudrait monter d'un cran et qu'il n'y en a pas, la carte du
  // lest ou l'étirement. » La carte est UNE donnée : le texte, deux libellés, et
  // rien d'autre — l'écran la dessine avec le composant des propositions
  // d'exercice, il n'en écrit aucun mot. Les deux nombres qu'elle dit (le niveau,
  // le bas de la zone) et le saut de lest passent par le formateur, donc par la
  // garde de cohérence (I26) : `lest.niveau`, `zone.bas`, `lest.saut`.
  //
  // `e` : `{ niveau, bas }` — `niveau`, le niveau validé des deux dernières
  // séances (le plus bas des deux : « sur toutes tes séries, deux séances de
  // suite » doit être vrai des deux) ; `bas`, le bas de la zone, où le lest
  // ramène les reps. Sans « ? » (§20.2 : la voix du coach ne pose pas de
  // question que le choix entre deux charges).
  var OUI_LEST = 'J’ai du lest';
  var NON_LEST = 'Pas de lest';
  //
  // Le titre et le détail s'écrivent chacun par sa fonction : le plan les rédige
  // sous deux captures (§20 bis), pour que chaque phrase porte SES citations.
  function carteLestTitre(e) {
    var x = e || {};
    return nombreFr(x.niveau, regle('lest.niveau')) + ' reps sur toutes tes séries, deux séances de suite.';
  }
  function carteLestDetail(e) {
    var x = e || {};
    return 'Au haut de ta zone, un lest te fait continuer en force. Avec une ceinture ou un gilet, ' +
           'je te propose de commencer à ' + enKg(SAUT_LEST, regle('lest.saut')) +
           ', en revenant à ' + nombreFr(x.bas, regle('zone.bas')) + ' reps.';
  }
  function carteLest(e) {
    return { titre: carteLestTitre(e), detail: carteLestDetail(e), oui: OUI_LEST, non: NON_LEST };
  }

  // §8.4 (exception étroite, 03/10/2026) — LE DÉPART DE LA VERSION LESTÉE : sa
  // première ligne vient de la dernière séance de l'exercice libre — le saut de
  // lest, au BAS de la zone — au lieu de « Première fois ici ». Elle n'en hérite
  // NI le palier, NI le compteur, NI le modèle : `palier` et `niveau` restent
  // nuls, le compteur de la version lestée part de zéro, et dès sa première
  // séance elle a sa propre histoire. `zone` : la clé de la zone de l'exercice
  // libre ; `n` : ses séries de travail (la consigne ne couvre que celles-là).
  function consigneDepartLeste(zone, n, date) {
    var z = zoneParCle(zone);
    if (z === null) return null;
    return {
      etat: 'depart_leste', zone: z.cle, palier: null, niveau: null,
      n: nombre(n) !== null && nombre(n) >= 1 ? nombre(n) : 1,
      ligne: { charge: SAUT_LEST, vise: z.bas }, haut: null,
      fondement: { departLeste: { date: date === undefined ? null : date } }
    };
  }

  // §9.21 (52-1) — LA CHARGE DE DÉPART, LA PREMIÈRE FOIS. Un exercice JAMAIS
  // FAIT (« Première fois ici ») dont la routine porte une charge de départ
  // (`routine_sets.charge_cible_kg`) : la consigne part de cette charge, aux
  // reps de la routine. Ni zone, ni charge de travail, ni compteur : il n'y a
  // pas d'histoire, et ce n'est ni un pari sur un palier ni une règle — c'est
  // la seule donnée disponible. Dès la première série validée, l'historique
  // existe, et la consigne suivante est celle du coach seul.
  //
  // `depart` : `{ charge, reps, n }`, lu par l'app sur la première série de
  // travail de l'exercice (`charge_cible_kg`, `reps_visees`) et ses séries de
  // travail. La charge en kg, sur un exercice en `charge_reps` seulement : le
  // poids du corps a sa propre première fois (le départ lesté, §8.4).
  function consigneDepartRoutine(depart) {
    var charge = nombre(depart && depart.charge);
    if (charge === null || charge <= 0) return null;
    var vise = nombre(depart.reps);
    var n = nombre(depart.n);
    return {
      etat: 'depart_routine', zone: null, palier: null, niveau: null,
      n: n !== null && n >= 1 ? n : 1,
      ligne: { charge: charge, vise: vise !== null && vise >= 1 ? vise : null }, haut: null,
      fondement: { departRoutine: { charge: charge } }
    };
  }

  function departDeRoutine(consigne, o) {
    if (!consigne || consigne.etat !== 'silence' || consigne.raison !== 'premiere_fois') return null;
    if (o.mesure !== 'charge_reps' || !o.depart) return null;
    return consigneDepartRoutine(o.depart);
  }

  // ══ §9.10 (53-1) — LE REPORT DE CHARGE AU CHANGEMENT DE ZONE ══════════════
  //
  // « Quand la zone retenue pour la séance diffère de la zone de la dernière
  // séance non neutre, la charge = la plus basse de (a) la dernière charge
  // tenue dans la zone visée dans les 90 jours et (b) l'estimation depuis le
  // dernier palier, P × (1 + n/30) / (1 + bas/30), arrondie au cran inférieur
  // de l'exercice ; la visée = le bas de la zone. » Pour TOUT changement de
  // zone : la correction à l'étiquette, la reprise « Plus léger », et demain
  // un bloc.
  //
  // UNE FONCTION PURE, la seule qui décide. `o` :
  //   · `seances` : `[{ debut, palier, niveau }]`, les séances NON NEUTRES de
  //     l'exercice, leur palier et leur niveau validé ;
  //   · `avant` : le début de la séance prescrite (rien après, §9.12) ;
  //   · `zoneAvant` : la zone de la dernière séance (une clé) ;
  //   · `zone` : la zone retenue pour la séance (une clé) ;
  //   · `cran(charge, sens)` : la charge voisine que le moteur proposerait,
  //     au-dessus (+1) ou en dessous (−1) — `chargeVoisine`, jamais un pas
  //     recopié ; `null` quand il ne la connaît pas.
  // Rend `null` (même zone, aucune séance, ni charge ni corps à reporter), ou
  // `{ charge, visee, origine, depuis }` : `origine` vaut `tenue` ou
  // `estimee`, `depuis` est la séance citée (`{ debut, palier, niveau }`).
  //
  // ⚠️ L'ESTIMATION NE SORT PAS D'ICI. Seule la charge arrondie sort : c'est
  // un maximum calculé, en coulisse, que le coach ne dit jamais (§9.10).
  // ⚠️ LE CRAN INFÉRIEUR SE LIT EN MARCHANT SUR LES CRANS DU MOTEUR depuis le
  // dernier palier : la charge proposée est une charge que la salle fait
  // (§10.2). Sans cran connu en dessous, la charge reste `null` — « le cran en
  // dessous », comme la reprise longue (§9.9).
  var REPORT_FENETRE_JOURS = 90;
  var REPORT_EPLEY = 30;
  var REPORT_MARCHE_MAX = 200;
  // §9.10 et §9.23 (55-1) — LE 1RM ESTIMÉ, UNE FORMULE (Epley) : l'estimation
  // du report (en coulisse) et le record « 1RM estimé » (dit « ≈ ») la lisent
  // ici, jamais recopiée.
  function unRMEpley(charge, reps) {
    return charge * (1 + reps / REPORT_EPLEY);
  }

  function reportDeZone(o) {
    var p = o || {};
    var z = zoneParCle(p.zone);
    var za = zoneParCle(p.zoneAvant);
    if (z === null || za === null || za.cle === z.cle) return null;
    var t0 = instant(p.avant);
    if (t0 === null) return null;
    var liste = (p.seances || []).filter(function (se) {
      var d = instant(se && se.debut);
      return d !== null && d < t0 && nombre(se.palier) !== null && nombre(se.niveau) !== null;
    }).sort(function (a, b) { return instant(a.debut) - instant(b.debut); });
    if (!liste.length) return null;
    var L = liste[liste.length - 1];
    var P = nombre(L.palier);
    var n = nombre(L.niveau);
    // §9.17 — ni un corps (0), ni une aide (négative) : une estimation sur une
    // charge qui n'est pas la masse levée ne veut rien dire.
    if (P <= 0) return null;
    // La visée : le bas de la zone, d'où l'on remonte.
    var visee = z.bas;
    var estimee = unRMEpley(P, n) / unRMEpley(1, z.bas);
    var charge = auCranInferieur(P, estimee, p.cran);
    // (a) la dernière charge tenue DANS la zone visée — son niveau validé
    // entre le bas et le haut —, dans les 90 jours.
    var tenue = null;
    for (var i = liste.length - 1; i >= 0; i--) {
      var se = liste[i];
      if ((t0 - instant(se.debut)) / JOUR > REPORT_FENETRE_JOURS) break;
      var nv = nombre(se.niveau);
      if (nombre(se.palier) > 0 && nv >= z.bas && nv <= z.haut) { tenue = se; break; }
    }
    var lue = function (se) { return { debut: se.debut, palier: nombre(se.palier), niveau: nombre(se.niveau) }; };
    // La plus basse des deux ; à égalité, la charge déjà tenue (elle est vraie).
    if (tenue !== null && charge !== null &&
        (nombre(tenue.palier) < charge || memeCharge(nombre(tenue.palier), charge))) {
      return { charge: nombre(tenue.palier), visee: visee, origine: 'tenue', depuis: lue(tenue) };
    }
    return { charge: charge, visee: visee, origine: 'estimee', depuis: lue(L) };
  }

  // La plus haute charge du plan de charges qui ne dépasse pas `v`, en
  // partant de `P` et en marchant cran par cran (`cran(charge, sens)`).
  function auCranInferieur(P, v, cran) {
    var pas = typeof cran === 'function' ? cran : function () { return null; };
    var c = P, i;
    if (v > P || memeCharge(v, P)) {
      for (i = 0; i < REPORT_MARCHE_MAX; i++) {
        var u = nombre(pas(c, 1));
        if (u === null || u <= c || (u > v && !memeCharge(u, v))) break;
        c = u;
      }
      return auCentieme(c);
    }
    for (i = 0; i < REPORT_MARCHE_MAX; i++) {
      var d = nombre(pas(c, -1));
      if (d === null || d >= c) return null;
      c = d;
      if (c < v || memeCharge(c, v)) return auCentieme(c);
    }
    return null;
  }

  // LE REPORT SUR LE CONTRAT D'UN EXERCICE : ses séances non neutres (palier et
  // niveau validé, comme la consigne les lit), et le cran du moteur. Le seul
  // chemin vers `reportDeZone` — la consigne (`consigneNouvelleZone`) et la
  // reprise « Plus léger » (`reprisePour`) le prennent tous les deux.
  // ⚠️ PAS DE REPORT SUR UN LEST : la charge saisie n'est pas la masse levée
  // (le corps n'y est pas), et l'estimation n'aurait pas de sens. Le poids du
  // corps et l'aide sont écartés par `reportDeZone` (charge ≤ 0).
  // LES CHARGES DE TRAVAIL D'UN EXERCICE, séance par séance : ses séances NON
  // NEUTRES, leur palier et leur niveau validé, comme la consigne les lit. Le
  // report (§9.10) et le bilan de fin de bloc (§9.22) les lisent ici.
  function chargesDeTravail(vues) {
    return (vues || []).filter(function (v) { return v && !v.neutre; }).map(function (v) {
      var A = seriesAuPalier(v);
      return { debut: v.debut, palier: nombre(v.palier), niveau: A.length ? niveauValide(A) : null };
    });
  }

  // §9.22 (53-2) — les charges de travail d'un exercice sur ses séances brutes
  // (`groupes`, ceux de la consigne), pour le bilan de fin de bloc :
  // `[{ date, palier, niveau }]`, celles qui ont un palier et un niveau.
  function chargesDeTravailDe(groupes, etat, options) {
    var o = options || {};
    var seances = contratDe(groupes, etat, 'charge_reps',
      { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null });
    return chargesDeTravail(seances.map(vueDeSeance)).filter(function (x) {
      return x.palier !== null && x.niveau !== null && instant(x.debut) !== null;
    }).map(function (x) { return { date: x.debut, palier: x.palier, niveau: x.niveau }; });
  }

  function reportSur(seances, avant, zoneAvant, zone, equipement) {
    if (equipement === EQUIPEMENT_LEST) return null;
    var vues = (seances || []).map(vueDeSeance);
    var lues = chargesDeTravail(anterieures(vues, avant));
    return reportDeZone({
      seances: lues, avant: avant, zoneAvant: zoneAvant, zone: zone,
      cran: function (charge, sens) { return chargeVoisine(vues, avant, charge, equipement, sens); }
    });
  }

  // LA ZONE DE LA DERNIÈRE SÉANCE NON NEUTRE : celle de la consigne qu'elle a
  // reçue, lue À SA FIN (§12.2 bis, 54-1) — la même fonction que le compteur
  // et le repli (`zoneDeLaSeance`). Une zone changée à l'étiquette PENDANT la
  // séance est celle de la séance : lue à son début, la séance d'après
  // croirait la zone encore à changer, et reporterait une seconde fois.
  function zoneDeLaDerniere(seances, avant, o) {
    var liste = anterieures(seances || [], avant);
    for (var i = liste.length - 1; i >= 0; i--) {
      if (liste[i].neutre === true) continue;
      return zoneDeLaSeance(liste, i, avant, { reglage: o.reglage, equipement: o.equipement,
        corrections: o.correctionsDeZone || null, correction: o.correction || null });
    }
    return null;
  }

  // LA CONSIGNE D'UNE NOUVELLE ZONE, sur la consigne calculée (une étape de
  // `consigneDExercice`, comme les départs). Pas de report :
  //   · sur un silence, une règle de bord (pas de zone), une REPRISE — elle prime
  //     sur tout le reste (§9.9) ;
  //   · quand la zone de la dernière séance est inconnue (pas de consigne
  //     alors : rien ne change, on commence) ;
  //   · sur un corps, une aide, un lest (`reportSur`).
  // La ligne part de la charge reportée, au bas de la zone, sans ligne haute ;
  // le fondement garde ce que la phrase grise et la feuille diront, rien de
  // l'estimation.
  var SANS_REPORT = { silence: true, bord: true, reprise_courte: true, reprise_longue: true };
  // §9.10 (53-2 bis, D1) — l'origine de la ligne de zone en vigueur, en
  // paramètre de la phrase (`o.ligneDeZone` : la ligne en vigueur QUAND elle
  // commence un bloc, `ligneDeDebutDeBloc` ; `null` sinon) : `bloc` pour une
  // ligne de bloc qui pose une zone, `personne` sinon.
  var LIGNE_BLOC = 'bloc';
  function origineDeLaLigne(ligne) {
    return ligne && ligne.origine === LIGNE_BLOC && ligne.zone ? LIGNE_BLOC : 'personne';
  }
  function consigneNouvelleZone(consigne, seances, avant, o) {
    if (!consigne || SANS_REPORT[consigne.etat] === true || !zoneParCle(consigne.zone)) return null;
    if (o.mesure !== 'charge_reps') return null;
    var zoneAvant = zoneDeLaDerniere(seances, avant, o);
    var r = reportSur(seances, avant, zoneAvant, consigne.zone, o.equipement);
    if (r === null) return null;
    var f = consigne.fondement || {};
    var garde = { date: f.date, reps: f.reps, seance: f.seance, habitude: f.habitude, correction: f.correction };
    var fondement = {};
    Object.keys(garde).forEach(function (cle) { if (garde[cle] !== undefined) fondement[cle] = garde[cle]; });
    fondement.report = { origine: r.origine, zoneAvant: zoneAvant,
                         depuis: { date: r.depuis.debut, palier: r.depuis.palier, niveau: r.depuis.niveau },
                         ligne: origineDeLaLigne(o.ligneDeZone) };
    return {
      etat: 'nouvelle_zone', zone: consigne.zone, palier: consigne.palier, niveau: consigne.niveau,
      n: consigne.n, ligne: { charge: r.charge, vise: r.visee }, haut: null, fondement: fondement
    };
  }

  // `o.libre` : une fonction que l'app fournit pour une version lestée —
  // `{ groupes, etat, options }`, les MÊMES entrées que la consigne de l'exercice
  // libre (comme `o.freres`) — ou `null`. Le départ n'existe que pour la toute
  // première fois (aucune séance à elle) et si l'exercice libre a une zone : un
  // exercice libre muet (première fois, sous 3 reps d'habitude) n'en donne
  // aucune, et la version lestée reste alors « Première fois ici ».
  function departDuLeste(consigne, o, avant) {
    if (!consigne || consigne.etat !== 'silence' || consigne.raison !== 'premiere_fois') return null;
    if (typeof o.libre !== 'function') return null;
    var p = o.libre();
    var po = p && p.options ? p.options : null;
    if (!po || po.mesure !== 'reps') return null;
    var opts = { reglage: po.reglage, equipement: po.equipement, correction: po.correction || null,
                 lestReponse: o.lestReponse };
    var kp = consignePour(contratDe(p.groupes, p.etat, 'reps', opts), avant, opts);
    if (!kp || kp.etat === 'silence' || !zoneParCle(kp.zone)) return null;
    return consigneDepartLeste(kp.zone, kp.n, kp.fondement ? kp.fondement.date : null);
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
  //   · l'intention `entretien` : on ne cherche pas à monter — celle du profil,
  //     ou celle de l'exercice (§9.17, `modes_exercice`) : l'app résout les
  //     deux en UNE valeur, et le moteur ne sait pas d'où elle vient (I13) ;
  //   · une mesure autre que `charge_reps` et `reps`, ou inconnue : la durée et
  //     la distance restent hors du coach (CADRAGE §2 ter). Le poids du corps en
  //     `reps` est coaché : la charge vaut 0 (§9.17).
  // Les silences DU moteur (première fois, pas de palier) sont autre chose :
  // une consigne à l'état `silence`, avec sa seule phrase grise.
  function consigneDExercice(groupes, etat, avant, options) {
    var o = options || {};
    if (o.edition) return null;
    if ((o.intention || 'progresser') === 'entretien') return null;
    if (o.mesure !== 'charge_reps' && o.mesure !== 'reps') return null;
    var seances = contratDe(groupes, etat, o.mesure,
      { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null });
    // §9.1.1 (48b-7) — LE RANG 2 EST BRANCHÉ. Il attendait ici depuis
    // 48b-5b-2, câblé à `null` faute d'un endroit où lire la zone choisie.
    // §9.17 — `lestReponse` : la réponse à la carte du lest, une ENTRÉE du
    // profil. Elle vaut pour toute séance, comme le rythme et l'intention (le
    // rejeu le dit : « celles du profil actuel »).
    var consigne = consignePour(seances, avant,
      { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null,
        lestReponse: o.lestReponse, lestPossible: o.lestPossible });
    // §9.10 (53-1) — LA ZONE A CHANGÉ depuis la dernière séance : la charge se
    // reporte (la plus basse de la charge déjà tenue et de l'estimation, au bas
    // de la zone). Une seule fois, ici : tout ce qui suit lit cette consigne.
    var nouvelle = consigneNouvelleZone(consigne, seances, avant, o);
    if (nouvelle !== null) consigne = nouvelle;
    // §8.4 / §9.17 — LE DÉPART DE LA VERSION LESTÉE : la première fois qu'un
    // exercice lesté se fait, il part de l'exercice libre au lieu de « Première
    // fois ici ».
    var depart = departDuLeste(consigne, o, avant);
    if (depart !== null) consigne = depart;
    // §9.21 (52-1) — la charge de départ de la routine, la toute première fois.
    var departRoutine = departDeRoutine(consigne, o);
    if (departRoutine !== null) consigne = departRoutine;
    var rejeu = rejeuDuCompteur(seances, groupes, avant, o);
    var marquees = rejeu.marquees;
    var compteur = compteurFige(rejeu.complet);
    // §12.2 bis (54-1) — la zone d'une séance pour le repli de l'escalier :
    // lue À SA FIN, par la même fonction que le report et le compteur.
    var zoneAu = function (liste, i) {
      return zoneDeLaSeance(liste, i, avant, { reglage: o.reglage, equipement: o.equipement,
        corrections: o.correctionsDeZone || null, correction: o.correction || null });
    };
    // §20.2 — la référence des dates est `avant`, le début de la séance pour
    // laquelle la consigne est calculée : « mardi » se dit contre elle.
    return { consigne: consigne, libelles: libellesConsigne(consigne, avant),
             etiquette: etiquetteZone(consigne, o.ligneDeZone),
             // La feuille « Pourquoi » n'est PLUS ici (relevé du 01/10, PR 1) :
             // elle décrit la consigne que le plan applique (figée, allégée,
             // repli, série de plus) — le plan la pose (`x.pourquoi`). Celle-ci,
             // sur la consigne brute, n'était lue par personne.
             // §9.14 (49-R2) — le contexte de la réaction, UNE FOIS par séance
             // et par exercice, sur les séances antérieures (§9.12).
             contexte: contexteReaction(seances, avant, consigne, o.equipement, null),
             // §9.15 (49-U10) — le cran des chauffes et des dégressives : le pas
             // exact de la salle, sinon le repli du matériel, sinon rien (le
             // plan prend alors 2,5 kg).
             pas: pasDesChauffes(seances, avant, o.equipement, consigne),
             // §12.9 (49-U13) — le compteur de stagnation, calculé UNE FOIS avec
             // la consigne (figé pour la séance, comme elle), sur les seules
             // séances sous consigne : `o.seancesSousConsigne`, les identifiants
             // des séances qui portent au moins un pari sur l'exercice. Le plan
             // le lit ; aucun écran ne le recalcule.
             compteur: compteur,
             // §14.5 (49-U15) — LE REPLI POSSIBLE, figé avec la consigne : le
             // plan décide s'il s'applique (la marche dépend des cartes). La
             // zone de chaque séance candidate est celle de la consigne qu'elle
             // a reçue (la zone choisie en vigueur ce jour-là).
             repli: compteur.compteur >= PAS_ESCALIER && consigne && consigne.zone
               ? repliEscalier(marquees, avant, compteur.meilleur, consigne.zone, { zoneAu: zoneAu }) : null,
             // §9.20 (51-3) — LA REPRISE APRÈS UNE SÉANCE DOULOUREUSE, figée avec
             // la consigne : le plan pose la carte, aucun écran ne la décide.
             reprise: reprisePour(marquees, avant, consigne, compteur.meilleur, { equipement: o.equipement }),
             // I34 — les séances marquées « douleur » (leurs débuts) : le plan
             // vérifie qu'aucune ne fonde la charge de la consigne.
             douleurs: anterieures(seances, avant).filter(function (se) { return se.douleur === true; })
               .map(function (se) { return se.debut; }),
             // §13.6 (49-U20) — LE FRÈRE QUI PROGRESSE PENDANT LE BLOCAGE, figé
             // avec la consigne. Ses frères ne sont demandés (`o.freres`, une
             // fonction) et rejoués que si le compteur est à 4 ou plus.
             frere: compteur.compteur >= SEUIL_COMPTEUR && typeof o.freres === 'function'
               ? frereDuBlocage(rejeu.complet.verdicts, o.freres, avant, o.mesure) : null };
  }

  // LE REJEU DU COMPTEUR, le même pour l'exercice et pour ses frères : les
  // séances du contrat, marquées sous consigne, puis `compteurDe`. `toutes` :
  // chaque séance jugée, sous consigne ou non (les frères, ci-dessous).
  function rejeuDuCompteur(seances, groupes, avant, o, toutes) {
    var marquees = marquerSousConsigne(seances, groupes, o.seancesSousConsigne, o.periodesAllegees,
      o.periodesSerieDePlus);
    return { marquees: marquees,
             complet: compteurDe(marquees, avant, { reglage: o.reglage, equipement: o.equipement,
               correction: o.correction || null, corrections: o.correctionsDeZone || null, toutes: toutes === true }) };
  }

  // §13.6 (49-U20) — les frères de l'exercice bloqué, rejoués. `fournir()` rend
  // `[{ slug, nom, groupes, etat, options }]` (les mêmes entrées que la
  // consigne de chaque frère).
  //
  // ⚠️ LE FRÈRE SE REJOUE SUR TOUTES SES SÉANCES (`toutes`, le mode du
  // simulateur qui a produit les cas), pas sur ses seules séances sous
  // consigne : la phrase dit ce qu'il a FAIT. Sur ses seules séances pariées, un
  // frère qui a un historique d'avant le coach (importé) n'avait pas d'« avant »
  // : sa première séance pariée, pendant le blocage, valait progrès (une remise
  // à zéro), et « 40 kg × 12, puis 30 kg × 12 » se disait « progresse : 30 kg ×
  // 12 » (relecture du 03/10/2026). Le blocage, lui, reste celui du compteur de
  // l'exercice bloqué (ses séances sous consigne).
  //
  // ⚠️ LE COÛT : un rejeu complet par frère (le coût d'une consigne, quasi
  // quadratique en séances). Il ne se paie qu'à 4 ou plus, une fois par séance
  // (la consigne est figée), et seulement pour un frère mesuré en charge ×
  // reps qui a au moins une séance pendant le blocage — sans elle, aucun
  // verdict ne peut y dire un progrès.
  //
  // §9.17 — PAS DE FRÈRE CITÉ ENTRE UNE CHARGE ET DES REPS : « tes haltères sont
  // montés à 92 kg » ne dit rien à des pompes, et « Poids du corps × 14 » ne dit
  // rien à une barre. Un frère n'est candidat que s'il se mesure comme
  // l'exercice bloqué (`mesure`, charge × reps ou reps seules) — la durée et la
  // distance restent hors du coach.
  function frereDuBlocage(verdicts, fournir, avant, mesure) {
    var depuis = instant(debutDuBlocage(verdicts));
    if (depuis === null) return null;
    var fin = instant(avant);
    var candidats = (fournir() || []).filter(function (f) {
      var o = (f && f.options) || {};
      if (o.mesure !== 'charge_reps' && o.mesure !== 'reps') return false;
      if (o.mesure !== mesure) return false;
      return (f.groupes || []).some(function (g) {
        var t = g && g.seance ? instant(g.seance.debut) : null;
        return t !== null && t > depuis && (fin === null || t < fin);
      });
    });
    return frereQuiProgresse({ verdicts: verdicts }, candidats.map(function (f) {
      var o = f.options;
      var seances = contratDe(f.groupes, f.etat, o.mesure,
        { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null });
      return { id: f.slug, nom: f.nom, verdicts: rejeuDuCompteur(seances, f.groupes, avant, o, true).complet.verdicts };
    }), avant);
  }

  // Ce que la consigne FIGÉE garde du compteur (elle s'écrit sur le disque avec
  // les consignes) : le compte, le meilleur, la dernière séance et les blocages
  // — pas le détail des verdicts, que rien ne relit hors des tests.
  function compteurFige(c) {
    return { compteur: c.compteur, meilleur: c.meilleur, derniere: c.derniere, blocages: c.blocages };
  }

  // §12.9 — « sous consigne », dans l'app : la séance porte au moins un pari
  // sur l'exercice (`predictions`). Le contrat perd l'identifiant de séance ;
  // il garde l'ordre des groupes (`contratDe`), et c'est par lui qu'on marque.
  // Sans liste, aucune séance n'est sous consigne : le compteur reste à zéro.
  // §14.4 (49-U14) — `periodes` : `[{ debut, fin }]` (jours civils), les
  // semaines allégées ACCEPTÉES ; une séance dont le jour y tombe est une
  // décharge déclarée (`decharge`), que le compteur ne compte ni ne juge.
  // §14.7 (49-U17) — `seriesDePlus` : `[{ debut, fin, n }]` (instants ; `fin`
  // exclue, `null` = toujours active), les périodes où une série de plus était
  // active : une séance qui y tombe lit son niveau sur ses `n` séries de
  // routine (`nRoutine`).
  function marquerSousConsigne(seances, groupes, ids, periodes, seriesDePlus) {
    var connus = {};
    (ids || []).forEach(function (id) { connus[id] = true; });
    return (seances || []).map(function (se, i) {
      var g = (groupes || [])[i];
      var id = g && g.seance ? g.seance.id : null;
      var jour = jourCivil(se && se.debut);
      var decharge = !!jour && (periodes || []).some(function (p) {
        return p && p.debut && p.fin && p.debut <= jour && jour <= p.fin;
      });
      var marque = { sousConsigne: id !== null && id !== undefined && connus[id] === true, decharge: decharge };
      var t = instant(se && se.debut);
      (seriesDePlus || []).forEach(function (p) {
        var a = instant(p && p.debut), b = p && p.fin ? instant(p.fin) : null;
        if (t !== null && a !== null && t >= a && (b === null || t < b) && nombre(p.n) !== null) marque.nRoutine = nombre(p.n);
      });
      return Object.assign({}, se, marque);
    });
  }

  // §9.15 (49-U10) — le cran existant de l'exercice, pour arrondir les chauffes
  // et les dégressives hors barre : le pas EXACT déduit de l'historique
  // (§10.2, rang 1), sinon le repli du matériel en descendant, sinon `null`.
  function pasDesChauffes(seances, avant, equipement, consigne) {
    var p = pasDeSalle(seances, avant);
    if (p && p.nature === 'exact') return p.pas;
    var ref = consigne && consigne.ligne ? nombre(consigne.ligne.charge) : nombre(consigne && consigne.palier);
    return repliDe(equipement, ref === null ? 0 : ref, -1);
  }

  // ── §3.9 — LE CONSTAT D'UN EXERCICE ────────────────────────────────────
  // `constatDExercice`, qui recalculait le constat hors du plan sur les
  // séries brutes, n'avait plus d'appelant depuis 49-U4 (le verdict se lit
  // sur le plan, `constatDuJour`) : retirée en 49-U6.

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
    // §9.17 — au poids du corps (palier 0), il n'y a pas de cran suivant.
    var cran = P === null || P === undefined || P === 0 ? null
      : chargeVoisine(contratDe(tous, etat, o.mesure,
          { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null }),
        apres, P, o.equipement, 1);
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
  //
  // ⚠️ K-V11 RETIRÉ (49-U10, 30/09/2026). « Le coach a mené tes charges
  // aujourd'hui » remplaçait « Pas de palier » quand toutes les séries avaient
  // suivi leur ligne ; « Pas de palier » n'existe plus depuis 49-U9 (§20.2), et
  // le verdict n'était plus atteignable depuis 49-U8 : parti, comme les phrases
  // « pas de palier ».
  //
  // La SUITE reste celle de `constatDe` (la consigne d'après) : pas de seconde
  // règle. Rend `{ verdict, suite, montee }`, ou `null`.
  //
  // `reference` : la date de la séance du jour (le plan la tient de sa séance).
  function constatDuJour(consigneAvant, consigneApres, reglage, cranSuivant, jour, reference) {
    var d = constatEnDeux(consigneAvant, consigneApres, reglage, cranSuivant, reference);
    if (!d) return null;
    var base = { verdict: d.verdict.texte, suite: d.suite.texte };
    Modele().reporter(d.suite.citations);
    var j = jour || {};
    var m = j.montee || null;
    var contredit = !!m && (/^Pas de palier/.test(base.verdict || '') || /^Pas encore/.test(base.verdict || ''));
    if (!contredit) Modele().reporter(d.verdict.citations);
    if (m) {
      return { verdict: contredit
                 ? 'La montée du coach a tenu' + DEUX_POINTS + chargeFois(m.charge, m.reps, cite(FAIT, { quoi: 'du_jour' })) +
                   ', dans ta zone. Elle compte comme un test tenu.'
                 : base.verdict,
               suite: base.suite, montee: { charge: m.charge, reps: m.reps } };
    }
    return { verdict: base.verdict, suite: base.suite, montee: null };
  }

  // ══ §9.15 — LES CHAUFFES ET LES DÉGRESSIVES (49-U10, 30/09/2026) ═════════
  //
  // « La routine (ou l'utilisateur) décide combien de chauffes et de
  // dégressives, et leurs reps ; le coach en calcule la charge, à partir de la
  // charge de travail du jour. » Deux fonctions PURES, appelées par le plan
  // seul (`plan.js`, garde d'architecture) ; aucune ne compte pour le coach
  // (ni pari, ni réaction, ni couverture, ni stagnation — §9.15.4).
  //
  // La référence est la charge de la consigne FIGÉE (la ligne, pas le test) :
  // une montée en séance ne change aucune chauffe.
  var BARRE_VIDE = 20;
  var SEUIL_BARRE_LOURDE = 70;
  var SEUIL_DIZAINE = 100;
  var CRAN_PAR_DEFAUT = 2.5;
  var BAISSE_DEGRESSIVE = 0.225;
  var SEUIL_PROPOSITION_BARRE = 60;
  var SEUIL_PROPOSITION_AUTRE = 80;

  // « Soulevé au sol » (§9.15.1) : le conventionnel, le sumo, la barre
  // hexagonale. PAS le roumain ni les jambes tendues (ils partent debout), ni
  // le rack pull. Liste fermée, décidée le 30/09/2026 (49-U10).
  var SOULEVES_AU_SOL = ['souleve_de_terre_barre', 'souleve_de_terre_sumo', 'souleve_de_terre_barre_hex'];

  // §9.15 — LES REPOS DE CHAUFFE : 1 min entre deux chauffes, 2 min après la
  // dernière. Une seule définition : le chronomètre du plan (`reposApres`) et
  // l'estimation de la durée d'une routine (§9.18) les lisent ici. Ils
  // vivaient dans `plan.js` ; l'estimation les aurait recopiés.
  var REPOS_ENTRE_CHAUFFES = 60;
  var REPOS_APRES_CHAUFFES = 120;

  // La table de §9.15.1 : une marche est la barre vide, ou un pourcentage de la
  // référence, avec ses reps.
  var TABLE_CHAUFFES = {
    barre_lourde:  [{ barre: true, reps: 10 }, { p: 0.50, reps: 6 }, { p: 0.70, reps: 3 }, { p: 0.88, reps: 1 }],
    sol:           [{ p: 0.50, reps: 5 }, { p: 0.70, reps: 3 }, { p: 0.88, reps: 1 }],
    barre_legere:  [{ barre: true, reps: 10 }, { p: 0.88, reps: 2 }],
    deja_barre:    [{ p: 0.60, reps: 5 }, { p: 0.88, reps: 2 }],
    premier_autre: [{ p: 0.60, reps: 8 }],
    aucune:        []
  };
  // Moins de lignes dans la routine que dans la table : les marches les plus
  // utiles, la barre vide tombant la première (§9.15.1).
  var MARCHES_REDUITES = { 1: [0.60], 2: [0.60, 0.88], 3: [0.50, 0.70, 0.88] };

  function estBarre(equipement) { return equipement === 'barre'; }

  // `entree` : `{ equipement, reference, deja_sollicite, sol }`.
  function situationChauffe(entree) {
    var e = entree || {};
    var ref = nombre(e.reference);
    if (ref === null || ref <= 0) return 'aucune';
    if (estBarre(e.equipement)) {
      if (e.deja_sollicite) return ref >= SEUIL_BARRE_LOURDE ? 'deja_barre' : 'aucune';
      if (e.sol) return 'sol';
      return ref >= SEUIL_BARRE_LOURDE ? 'barre_lourde' : 'barre_legere';
    }
    return e.deja_sollicite ? 'aucune' : 'premier_autre';
  }

  // Le pas d'arrondi : à la dizaine sur une barre dès 100 kg de référence, à
  // 5 kg en dessous ; au cran du matériel ailleurs.
  function pasDeChauffe(entree) {
    if (estBarre(entree.equipement)) return nombre(entree.reference) >= SEUIL_DIZAINE ? 10 : 5;
    var c = nombre(entree.cran);
    return c !== null && c > 0 ? c : CRAN_PAR_DEFAUT;
  }

  // Au plus proche multiple du pas, l'égalité vers le bas.
  function auPasLePlusProche(v, pas) {
    var bas = Math.floor(v / pas + 1e-9) * pas;
    var haut = bas + pas;
    return auCentieme(v - bas <= haut - v + 1e-9 ? bas : haut);
  }

  function chargeDeMarche(m, entree, pas) {
    var ref = nombre(entree.reference);
    var c = m.barre ? BARRE_VIDE : auPasLePlusProche(ref * m.p, pas);
    // Toujours au moins un cran sous la référence…
    var plafond = Math.floor((ref - pas) / pas + 1e-9) * pas;
    if (c > ref - pas + 1e-9) c = auCentieme(plafond);
    // … et jamais sous la barre vide.
    if (estBarre(entree.equipement) && c < BARRE_VIDE) c = BARRE_VIDE;
    return c;
  }

  // Les marches pour `n` lignes de la routine : la table si elle a autant de
  // lignes ou plus (les lignes en trop restent vides), sinon les marches
  // réduites.
  function marchesPour(table, n) {
    if (n >= table.length) return table.slice();
    return MARCHES_REDUITES[n].map(function (p) { return { p: p }; });
  }

  // `entree` : `{ equipement, reference, deja_sollicite, sol, cran, routine }`,
  // `routine` = les reps des lignes de chauffe de l'exercice, ou `null` s'il
  // n'en a aucune. Rend, avec des lignes : `{ situation, lignes: [{ reps,
  // charge }], non_remplies, phrase }` ; sans ligne : `{ situation,
  // proposition: [[charge, reps]], phrase_proposition }`.
  function chauffesDe(entree) {
    var e = entree || {};
    var situation = situationChauffe(e);
    var table = TABLE_CHAUFFES[situation];
    var pas = pasDeChauffe(e);
    var ref = nombre(e.reference);
    if (e.routine === null || e.routine === undefined) {
      // §9.15.2 (delta 49-24) — LE SEUIL D'UNE PROPOSITION : 60 kg à la barre,
      // 80 kg ailleurs. En dessous, l'échauffement général suffit. Les chauffes
      // de la routine, elles, se remplissent quelle que soit la charge.
      var seuil = estBarre(e.equipement) ? SEUIL_PROPOSITION_BARRE : SEUIL_PROPOSITION_AUTRE;
      var prop = ref !== null && ref >= seuil
        ? table.map(function (m) { return [chargeDeMarche(m, e, pas), m.reps]; }) : [];
      return {
        situation: situation, proposition: prop,
        phrase_proposition: prop.length
          ? 'Chauffe : ' + prop.map(function (x) {
              return Modele().charge(x[0], undefined, regle('chauffe')) + ' × ' + nombreFr(x[1], regle('chauffe.reps'));
            }).join(' · ')
          : null
      };
    }
    var routine = e.routine;
    var n = routine.length;
    var marches = table.length && n ? marchesPour(table, n) : [];
    var lignes = routine.map(function (reps, i) {
      var m = marches[i];
      return { reps: reps, charge: m ? chargeDeMarche(m, e, pas) : null };
    });
    var remplies = lignes.filter(function (l) { return l.charge !== null; }).map(function (l) { return l.charge; });
    var phrase = null;
    if (remplies.length) {
      var avant = remplies.slice(0, -1).map(function (c) { return nombreFr(c, regle('chauffe')); });
      phrase = 'Chauffes calées sur ' + Modele().charge(ref, undefined, regle('reference')) + ' : ' +
        avant.concat([Modele().charge(remplies[remplies.length - 1], undefined, regle('chauffe'))]).join(' · ') + '.';
    }
    return { situation: situation, lignes: lignes,
             non_remplies: lignes.length - remplies.length, phrase: phrase };
  }

  // §9.15.3 — la dégressive. `entree` : `{ equipement, derniere_serie,
  // reps_travail, cran }`. Rend `{ charge, vise, phrase, repos }` ; à la
  // barre, `{ charge: null, phrase }`.
  function degressiveDe(entree) {
    var e = entree || {};
    if (estBarre(e.equipement)) return { charge: null, phrase: 'Pas de dégressive à la barre.' };
    var der = nombre(e.derniere_serie);
    if (der === null || der <= 0) return { charge: null, phrase: null };
    var cran = nombre(e.cran);
    if (cran === null || cran <= 0) cran = CRAN_PAR_DEFAUT;
    // Au cran INFÉRIEUR : jamais au-dessus des −22,5 %.
    var charge = auCentieme(Math.floor(der * (1 - BAISSE_DEGRESSIVE) / cran + 1e-9) * cran);
    var reps = nombre(e.reps_travail);
    var milieu = Math.max(4, Math.floor((reps === null ? 8 : reps) / 2));
    var vise = [milieu - 1, milieu + 1];
    return {
      charge: charge, vise: vise, repos: 0,
      phrase: 'Dégressive : ' + Modele().charge(charge, undefined, regle('degressive')) +
        ', sans repos, jusqu\'à l\'échec. Vise ' +
        nombreFr(vise[0], regle('degressive.vise')) + ' à ' + nombreFr(vise[1], regle('degressive.vise')) + '.'
    };
  }

  var api = {
    BARRE_VIDE: BARRE_VIDE,
    SOULEVES_AU_SOL: SOULEVES_AU_SOL,
    SEUIL_PROPOSITION_BARRE: SEUIL_PROPOSITION_BARRE,
    SEUIL_PROPOSITION_AUTRE: SEUIL_PROPOSITION_AUTRE,
    TABLE_CHAUFFES: TABLE_CHAUFFES,
    REPOS_ENTRE_CHAUFFES: REPOS_ENTRE_CHAUFFES,
    REPOS_APRES_CHAUFFES: REPOS_APRES_CHAUFFES,
    // §9.18 (51-1) — « J'ai peu de temps ».
    DUREE_PAR_DEFAUT: DUREE_PAR_DEFAUT,
    dureeEstimee: dureeEstimee,
    raccourcirRoutine: raccourcirRoutine,
    structureDeRoutine: structureDeRoutine,
    estPolyarticulaire: estPolyarticulaire,
    consigneDepartRoutine: consigneDepartRoutine,
    aDesMuscles: aDesMuscles,
    structureAllegee: structureAllegee,
    appliquerRaccourci: appliquerRaccourci,
    texteDureeEstimee: texteDureeEstimee, texteDureeCourte: texteDureeCourte,
    ciblesDeTemps: ciblesDeTemps, reponseDeTemps: reponseDeTemps, cibleDuProgramme: cibleDuProgramme,
    libelleCibleTemps: libelleCibleTemps,
    CIBLES_TEMPS_PAR_DEFAUT: CIBLES_TEMPS_PAR_DEFAUT,
    texteDureeAllegee: texteDureeAllegee,
    carteRaccourcir: carteRaccourcir,
    chuteDe: chuteDe,
    SEUIL_COMPTEUR: SEUIL_COMPTEUR,
    compteurDe: compteurDe,
    consigneDeLaSeance: consigneDeLaSeance,
    finEffective: finEffective,
    FIN_SANS_HEURE_MAX: FIN_SANS_HEURE_MAX,
    zoneDeLaSeance: zoneDeLaSeance,
    phraseCompteur: phraseCompteur,
    frereQuiProgresse: frereQuiProgresse,
    phraseFrere: phraseFrere,
    PAS_ESCALIER: PAS_ESCALIER,
    MODULE_ESCALIER: MODULE_ESCALIER,
    MARCHE_SEMAINE_ALLEGEE: MARCHE_SEMAINE_ALLEGEE,
    get DETAIL_CARTE() { return detailCarte(); },
    detailCarte: detailCarte,
    PHRASE_REFUS: PHRASE_REFUS,
    estDeclenchement: estDeclenchement,
    jourCivil: jourCivil,
    blocageGeneralise: blocageGeneralise,
    phraseCarte: phraseCarte,
    seriesAllegees: seriesAllegees,
    consigneAllegee: consigneAllegee,
    phraseAllegee: phraseAllegee,
    detailAllegee: detailAllegee,
    grisAllegee: grisAllegee,
    finAllegee: finAllegee,
    bandeauAllegee: bandeauAllegee,
    cartesDesParis: cartesDesParis,
    periodeAllegee: periodeAllegee,
    carteAutorisee: carteAutorisee,
    observationSemaineAllegee: observationSemaineAllegee,
    MARCHE_SCHEMA: MARCHE_SCHEMA,
    MARCHE_REPLI: MARCHE_REPLI,
    MARCHE_SECHE: MARCHE_SECHE,
    MARCHE_SERIE_DE_PLUS: MARCHE_SERIE_DE_PLUS,
    MARCHE_SILENCE: MARCHE_SILENCE,
    FENETRE_REPLI_JOURS: FENETRE_REPLI_JOURS,
    nIsole: nIsole,
    declenchementsRepondus: declenchementsRepondus,
    marcheIsolee: marcheIsolee,
    autresAvancent: autresAvancent,
    carteSchema: carteSchema,
    phraseSeche: phraseSeche,
    repliEscalier: repliEscalier,
    seanceDouloureuse: seanceDouloureuse,
    zonePlusDeReps: zonePlusDeReps,
    carteReprise: carteReprise,
    reprisePour: reprisePour,
    repliDeLaRepriseLongue: repliDeLaRepriseLongue,
    consignePlusLegere: consignePlusLegere,
    repliDeReprise: repliDeReprise,
    feuilleDouleur: feuilleDouleur,
    carteRepriseTextes: carteRepriseTextes,
    texteRepriseAvant: texteRepriseAvant,
    texteRepriseLeger: texteRepriseLeger,
    TEXTES_DOULEUR: TEXTES_DOULEUR,
    consigneRepli: consigneRepli,
    phraseRepli: phraseRepli,
    marchesDesParis: marchesDesParis,
    observationMarche: observationMarche,
    placeDeVolume: placeDeVolume,
    GRIS_SERIE_DE_PLUS: GRIS_SERIE_DE_PLUS,
    marcheProposee: marcheProposee,
    serieDePlusProposee: serieDePlusProposee,
    serieDePlusActive: serieDePlusActive,
    periodesSerieDePlus: periodesSerieDePlus,
    carteSerieDePlus: carteSerieDePlus,
    consigneSerieDePlus: consigneSerieDePlus,
    placePourExercice: placePourExercice,
    musclesParPriorite: musclesParPriorite,
    situationChauffe: situationChauffe,
    chauffesDe: chauffesDe,
    degressiveDe: degressiveDe,
    FENETRE_HABITUDE: FENETRE_HABITUDE,
    FENETRE_COUPLE: FENETRE_COUPLE,
    MAJORITE_COUPLE: MAJORITE_COUPLE,
    FENETRE_PAS_MOIS: FENETRE_PAS_MOIS,
    plancherDuMateriel: plancherDuMateriel,
    unRMEpley: unRMEpley,
    RECURRENCE_PAS: RECURRENCE_PAS,
    FACTEUR_COUPURE: FACTEUR_COUPURE,
    SEUIL_REPRISE_LONGUE: SEUIL_REPRISE_LONGUE,
    AUCUNE_REPRISE: AUCUNE_REPRISE,
    REPRISE_COURTE: REPRISE_COURTE,
    REPRISE_LONGUE: REPRISE_LONGUE,
    REPLI_MATERIEL: REPLI_MATERIEL,
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
    sansPalierRetenues: sansPalierRetenues,
    MODULE_CONSIGNE: MODULE_CONSIGNE,
    VERSION_CONSIGNE: VERSION_CONSIGNE,
    reportDeZone: reportDeZone,
    // §9.22 (53-2) — les programmes à cycles
    chargesDeTravailDe: chargesDeTravailDe,
    semaineDuBloc: semaineDuBloc,
    debutDecharge: debutDecharge,
    finDuBloc: finDuBloc,
    dechargePlanifiee: dechargePlanifiee,
    carteAllegeeAutorisee: carteAllegeeAutorisee,
    dechargeDuJour: dechargeDuJour,
    periodesDecharge: periodesDecharge,
    zonesPosees: zonesPosees,
    zoneDuPremierBloc: zoneDuPremierBloc,
    blocSuivant: blocSuivant,
    exercicesParDefaut: exercicesParDefaut,
    bilanDuBloc: bilanDuBloc,
    progresDuBilan: progresDuBilan,
    blocEnCours: blocEnCours,
    exercicesEnBloc: exercicesEnBloc,
    badgeDuBloc: badgeDuBloc,
    libelleZoneDeBloc: libelleZoneDeBloc,
    blocTermine: blocTermine,
    bandeauDecharge: bandeauDecharge,
    carteFinDeBloc: carteFinDeBloc,
    ligneDeZoneAu: ligneDeZoneAu,
    lignesDeZoneValides: lignesDeZoneValides,
    lignesDArret: lignesDArret,
    ligneDeDebutDeBloc: ligneDeDebutDeBloc,
    blocsDuProgramme: blocsDuProgramme,
    correctionAu: correctionAu,
    ZONES_DE_BLOC: ZONES_DE_BLOC,
    SANS_CUMUL_JOURS: SANS_CUMUL_JOURS,
    SEMAINES_BLOC_MIN: SEMAINES_BLOC_MIN,
    SEMAINES_BLOC_MAX: SEMAINES_BLOC_MAX,
    SEMAINES_BLOC_DEFAUT: SEMAINES_BLOC_DEFAUT,
    MODULE_PROGRAMME: MODULE_PROGRAMME,
    GRANDEUR_PROGRAMME: GRANDEUR_PROGRAMME,
    REPORT_FENETRE_JOURS: REPORT_FENETRE_JOURS,
    idDePrediction: idDePrediction,
    idDEscalier: idDEscalier,
    sha256Pur: sha256Pur,
    utf8: utf8,
    observationDe: observationDe,
    etiquetteZone: etiquetteZone,
    // Le menu des zones les affiche toutes (§3.8) : il lit cette table, il ne
    // recopie ni les libellés ni les bornes.
    ZONES: ZONES,
    zoneEnVigueur: zoneEnVigueur,
    // §9.17 (50-1) — le poids du corps, l'aide et le lest : le mode d'un
    // exercice (`modes_exercice`), son départ lesté, la carte qui y mène, le
    // saut de lest et le matériel effectif d'une charge ajoutée.
    MODES: MODES,
    modeEnVigueur: modeEnVigueur,
    intentionDe: intentionDe,
    coachSeTait: coachSeTait,
    SAUT_LEST: SAUT_LEST,
    EQUIPEMENT_LEST: EQUIPEMENT_LEST,
    equipementEffectif: equipementEffectif,
    carteLest: carteLest,
    carteLestTitre: carteLestTitre,
    carteLestDetail: carteLestDetail,
    OUI_LEST: OUI_LEST,
    NON_LEST: NON_LEST,
    consigneDepartLeste: consigneDepartLeste,
    seanceDuContrat: seanceDuContrat,
    consigneDExercice: consigneDExercice,
    INSECABLE: INSECABLE
  };

  // La table des mois courts vit avec le formateur (`modele.js`, §20.2) ; le
  // moteur la montre toujours, lue tardivement comme le reste du formateur.
  Object.defineProperty(api, 'MOIS_COURTS', {
    enumerable: true, get: function () { return Modele().MOIS_COURTS; }
  });

  racine.THMoteur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
