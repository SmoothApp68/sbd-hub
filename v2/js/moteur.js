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
// UNE seule dépendance, `THPalier`, pour `repsComptees` et `repsPrudentes` —
// la règle du §17.4 (une série à fond compte ses reps ; le calcul prudent lui
// en retire une) est écrite là-bas et ne se réécrit pas ici.
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

  // §17.4, révisé le 11/10/2026 (74) — LES REPS D'UNE SÉRIE, telles que le
  // moteur les compte : les reps faites, partout. Une seule exception, le
  // CALCUL PRUDENT (68B : une série à fond compte une rep de moins), que
  // `consigneDExercice` rejoue à côté pour ses plafonds (`enPrudent`) — le
  // compte vient alors de `repsPrudentes`, jamais réécrit ici.
  //
  // ⚠️ UN DRAPEAU DU MODULE, ET PAS UN PARAMÈTRE : le compte est lu à neuf
  // endroits, sur des chemins que la consigne traverse en profondeur (le
  // niveau, la chute, l'échelle, les séances sans palier). Le passer de main en
  // main en oublierait un, en silence. `enPrudent` le pose et le rend toujours
  // (`finally`) : rien ne peut le laisser levé derrière lui.
  var prudent = false;
  function compter(serie) {
    return prudent ? Palier().repsPrudentes(serie) : Palier().repsComptees(serie);
  }
  function enPrudent(calcul) {
    var avant = prudent;
    prudent = true;
    try { return calcul(); } finally { prudent = avant; }
  }

  // 180 (C-F5, 28/10/2026, décision d'Aurélien D3) — LE DÉBUTANT (`profiles.anciennete = moins_1_an`), un drapeau du module comme
  // `prudent`, pour la même raison : la garde par réserve (R < V) est lue sur des chemins que la consigne traverse en profondeur
  // (le rejeu du compteur, la consigne de chaque séance passée). L'app le donne une fois (`options.debutant`) à
  // `consigneDExercice`, `suiteDExercice` et `compteurDe` ; une option absente laisse le drapeau tel qu'il est. Un débutant
  // sous-estime sa réserve (son « 0 » vaut souvent 3-4, Steele 2017) : sa réserve HAUTE reste un signal sûr (le test), sa
  // réserve BASSE n'arrête pas la montée.
  var debutantEnCours = false;
  // 191 — LA PRUDENCE DE MONTÉE, donnée avec le débutant (`options.prudence`, cf. `prudenceDeMontee`), même drapeau de module, même raison.
  var prudenceEnCours = null;
  function avecDebutant(options, calcul) {
    var aDeb = !!options && typeof options.debutant === 'boolean';
    var aPru = !!options && !!options.prudence && typeof options.prudence === 'object';
    if (!aDeb && !aPru) return calcul();
    var avant = debutantEnCours, avantPru = prudenceEnCours;
    if (aDeb) debutantEnCours = options.debutant;
    if (aPru) prudenceEnCours = options.prudence;
    try { return calcul(); } finally { debutantEnCours = avant; prudenceEnCours = avantPru; }
  }

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
  // 174 — la règle de bord qui recule : combien de séances d'historique elle remonte, combien de séances sans monter font
  // repartir plus bas, et de combien (× 0,95, arrondi au cran).
  var BORD_PROFONDEUR = 10;
  var BORD_SEANCES_SANS_MONTER = 3;
  var BORD_VAGUE = 0.95;
  // 174 — le cran sous P le plus proche de `cible` (x 0,95 : une vague de bord, une marche « alléger » en force), au plus bas
  // le cran en dessous. `voisineFn(charge, sens)` : le cran de l'exercice, salle comprise. `null` : rien de plus léger.
  function cranSousProcheDe(voisineFn, P, cible) {
    var cur = voisineFn(P, -1);
    if (cur === null) return null;
    for (var t = 0; t < 12; t++) {
      var nxt = voisineFn(cur, -1);
      if (nxt !== null && nxt < cur && Math.abs(nxt - cible) < Math.abs(cur - cible)) cur = nxt; else break;
    }
    return cur;
  }
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
  // 124 (audit du 16/10/2026, 06 #16, 01 #14) — LA ZONE FORCE (Lourd, Mix), UNE FOIS : l'escalier (pas de série de plus ni
  // de dégressive), les zones d'un bloc (§19.2 amendé : la force seulement), les invariants et la démonstration la
  // lisent par `estZoneForce`.
  var ZONES_FORCE = ['lourd', 'mix'];
  function estZoneForce(zone) { return ZONES_FORCE.indexOf(zone) >= 0; }

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
  // 179 (B-B8) — `modeExercice` (facultatif) : le mode d'UN exercice. Le même prédicat dit alors si le coach se tait sur CET exercice
  // (profil en Entretenir, ou exercice en Entretenir) : l'app ne recompose plus ce test de son côté.
  function coachSeTait(intentionProfil, modeExercice) {
    return intentionDe(intentionProfil, modeExercice === undefined ? null : modeExercice) === 'entretien';
  }

  // 193-3 — LE RANG 1 EST BRANCHÉ : `plan`, la zone que la routine fixe pour CE jour (`routine_exercises.zone`, un choix
  // explicite, jamais déduit des reps visées). Elle passe avant la correction de l'exercice : une correction
  // (`zones_exercice`, un bloc) ne l'efface pas en silence — elle vaut pour les jours sans zone de plan.
  function zoneRetenue(correction, habitude, plan) {
    // `zoneParCle` ne lit que les cinq clés de la table : une valeur inventée,
    // ou `constructor` venu d'une ligne de base, n'y trouve rien et retombe sur
    // la déduction plutôt que de rendre un objet qui n'est pas une zone.
    var duPlan = zoneParCle(plan);
    if (duPlan) return duPlan;
    var choisie = zoneParCle(correction);
    return choisie || zoneDe(habitude);
  }

  // ── 193-3 (MOTEUR §9.29) — L'ONDULATION : UNE ZONE PAR JOUR, UNE SOUS-HISTOIRE PAR ZONE ──────────────────
  //
  // La même barre deux fois dans la semaine à deux zones (lundi Lourd, jeudi Mix) : lue en un seul morceau, la dernière
  // séance est toujours celle de l'autre zone, le coach propose l'inverse du plan (`nouvelle_zone`, 11 fois sur 11) et la
  // stagnation reste à 0. Quand la routine pose une zone pour le jour (`zonePlan`), le coach ne relit que les séances de
  // l'exercice faites dans cette zone : palier, habitude, test, report, compteur et escalier deviennent ceux de ce jour.
  //
  // UNE SEULE FONCTION DE FILTRE (`sousHistoireDeZone`), appelée par `consigneDExerciceCalcul` et par personne d'autre.
  // L'APPARTENANCE d'une séance passée (`zonesDeLaSeanceDePlan`), dans cet ordre :
  //   1. la séance vient d'une routine (`sessions.routine_id`) dont la ligne de cet exercice porte une zone : cette zone ;
  //   2. sinon la zone FAITE : la médiane des reps des séries de travail est dans les bornes d'une zone, OU rangée par
  //      `RANGEMENT` (le OU garde un jeudi Mix à 8 reps, que `RANGEMENT` seul range en Hypertrophie) ;
  //   3. une médiane sous 3 reps (des maximaux) n'est dans aucune zone.
  // Jamais la zone « reçue » : rejouée sans le plan, elle décale les zones d'un cran (mesuré au diagnostic).
  var ZONE_PERIMEE_JOURS = 56;   // 8 semaines : au-delà, la force a assez bougé (décision d'Aurélien, 31/10/2026)

  function zonesDeLaSeanceDePlan(vue, groupe, zonesDeRoutine) {
    var rid = groupe && groupe.seance ? groupe.seance.routine_id : null;
    var dePlan = rid !== null && rid !== undefined && zonesDeRoutine ? zonesDeRoutine[rid] : null;
    if (zoneParCle(dePlan)) return [dePlan];
    var reps = ((vue && vue.retenues) || []).map(function (s) { return nombre(s && s.reps); })
      .filter(function (r) { return r !== null && r > 0; });
    if (!reps.length) return [];
    var m = Math.ceil(mediane(reps));
    var cles = {};
    var rangee = zoneDe(m);
    if (rangee) cles[rangee.cle] = true;
    ZONES.forEach(function (z) { if (m >= z.bas && m <= z.haut) cles[z.cle] = true; });
    return Object.keys(cles);
  }

  // `seances` : le contrat (construit SANS la zone du plan, comme aujourd'hui), `groupes` : les mêmes séances brutes, dans
  // le même ordre. Rend `{ mode, groupes, seances, n }` : `zone` (la sous-histoire), ou `premiere` (rien de récent dans la
  // zone : l'historique complet, que le report §9.10 existant lit une seule fois). `null` sans zone de plan valide.
  function sousHistoireDeZone(groupes, seances, avant, zonePlan, zonesDeRoutine) {
    if (!zoneParCle(zonePlan)) return null;
    var t = instant(avant);
    var membres = [], tDerniere = null, autreDepuis = false;
    var infos = (seances || []).map(function (se, i) {
      var vue = vueDeSeance(se);
      var d = instant(se && se.debut);
      var zs = zonesDeLaSeanceDePlan(vue, (groupes || [])[i], zonesDeRoutine);
      return { i: i, d: d, zs: zs, membre: zs.indexOf(zonePlan) >= 0, compte: se.neutre !== true && vue.retenues.length > 0 };
    }).filter(function (x) { return x.d !== null && (t === null || x.d < t); });
    infos.forEach(function (x) {
      if (x.membre) { membres.push(x.i); if (x.compte && (tDerniere === null || x.d > tDerniere)) tDerniere = x.d; }
    });
    if (tDerniere !== null) {
      infos.forEach(function (x) { if (!x.membre && x.compte && x.d > tDerniere) autreDepuis = true; });
    }
    var perimee = tDerniere !== null && t !== null && autreDepuis && (t - tDerniere) / JOUR > ZONE_PERIMEE_JOURS;
    if (!membres.length || perimee) {
      // La zone d'AVANT, pour le report : celle de la dernière séance de l'exercice, lue sur ce qui a été fait (ou sur sa routine),
      // jamais rejouée — une habitude mêlée d'anciennes séances Mix y lirait « Mix » et le report ne partirait pas.
      var derniere = null;
      infos.forEach(function (x) { if (x.compte && (derniere === null || x.d >= derniere.d)) derniere = x; });
      var zoneAvant = null;
      if (derniere !== null) {
        zoneAvant = derniere.zs.filter(function (c) { return c !== zonePlan; })[0] || null;
      }
      return { mode: 'premiere', groupes: groupes, seances: seances, n: 0, perimee: perimee, zoneAvant: zoneAvant };
    }
    // Les séances de la zone, et les AUTRES séances à venir ne comptent pas : seules celles d'avant `avant` filtrent.
    var gardes = {};
    membres.forEach(function (i) { gardes[i] = true; });
    var gs = [], ss = [];
    (seances || []).forEach(function (se, i) {
      if (gardes[i]) { gs.push(groupes[i]); ss.push(se); }
    });
    return { mode: 'zone', groupes: gs, seances: ss, n: membres.length, perimee: false };
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
  // Tout en REPS COMPTÉES (§17.4) : les reps faites depuis 74 (une rep de moins
  // à fond dans le calcul prudent seulement, `compter`). `10-10-6` → chute ; `10-4-4` → non (c'est la première qui sort
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
      var r = compter(liste[i]);
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

  // MOTEUR §17.4 révisé (68B) — LE NIVEAU SUR LES REPS FAITES : le même
  // calcul, sans la rep en moins d'une série à fond. Il ne décide rien : il
  // sert à DIRE (« sans marge »), jamais à monter. Depuis 74, c'est aussi le
  // niveau validé hors calcul prudent ; il reste pour la note, lue contre le
  // calcul prudent.
  function niveauFait(seriesAuPalier) {
    return niveauValide((seriesAuPalier || []).map(function (s) {
      return { reps: s ? s.reps : null, charge_kg: s ? s.charge_kg : null };
    }));
  }

  // La cause d'un « à fond » dans des séries : `rpe` (un RPE de 10) ou
  // `ressenti` (« reste 0 ») — la première série à fond la dit.
  function causeAFond(series) {
    var l = (series || []).filter(function (s) { return Palier().cranDeSerie(s) === 'max'; })[0];
    return l && Palier().cranEffort(l.rpe) !== null ? 'rpe' : 'ressenti';
  }

  function niveauValide(seriesAuPalier) {
    var liste = seriesAuPalier || [];
    if (!liste.length) return null;
    // §9.2 bis — la chute ne tire pas le niveau : il se calcule sans elle.
    if (chuteDe(liste) !== null) liste = liste.slice(0, -1);

    // 185 (A1, A6, décision d'Aurélien du 29/10/2026) — UN 0 REP NE FAIT JAMAIS UN NIVEAU VALIDÉ 0. Une série de travail à 0 rep est
    // une tentative manquée, pas une mesure : elle sort du niveau (sans elle `25 × 8, 0, 6` donnait « niveau 0 », donc « 25 kg × 1 », puis
    // la boucle de singles A1 : 27,5, 30, 32,5… kg × 1 sans issue). Lue sur les reps brutes : une rep faite à fond (le calcul prudent
    // la compte 0) reste une mesure. Le tag `echec` à 0 rep n'arrive jamais ici (le palier l'écarte, `palier.js` §4).
    liste = liste.filter(function (s) { return nombre(s && s.reps) !== 0; });
    if (!liste.length) return null;

    var comptees = [];
    for (var i = 0; i < liste.length; i++) {
      var r = compter(liste[i]);
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
    poserPlafonds(lus);

    // ⚠️ LE COUPLE SE DÉSIGNE SUR TROIS SÉANCES, PAS SUR LA DERNIÈRE (corrigé
    // le 19/09/2026, 48b-5a). La dernière séance seule était trop nerveuse :
    // une décharge isolée faisait basculer la zone d'un bloc entier.
    var couple = coupleDe(lus.slice(-FENETRE_COUPLE).map(function (x) { return x.format; }));

    return {
      couple: couple,
      duCouple: lus.filter(function (x) { return x.format === couple; }),
      // 180 — toutes les séances lues, tous formats : la fenêtre de repli de `habitudeBordee` (une séance seule ne ferme pas la zone).
      toutes: lus
    };
  }

  // 180 (A-F-01 b, 28/10/2026, décision d'Aurélien, MOTEUR §9.1.2) — LA RÈGLE DE BORD NE S'OUVRE PAS SUR UNE SEULE SÉANCE.
  // « Sous 3 reps d'habitude » est une habitude : quand le couple ne compte qu'UNE séance (trois formats différents, la
  // plus récente l'emporte) et qu'elle est sous 3 reps, l'habitude se lit sur la fenêtre entière des 8 dernières séances,
  // tous formats. Deux séances ou plus au même format sous 3 reps, ou une histoire qui n'a que cette séance : inchangé.
  function habitudeBordee(lecture, fondantes, habitude) {
    if (habitude === null || habitude >= 3 || !lecture || fondantes.length >= 2) return habitude;
    if (!lecture.toutes || lecture.toutes.length < 2) return habitude;
    var large = habitudeSur(lecture.toutes);
    return large === null ? habitude : large;
  }

  // La médiane des reps au palier sur les 8 dernières séances DÉJÀ RÉDUITES au
  // couple, arrondie au-dessus. Prise à part parce que le gel de la zone
  // pendant un étirement (§9.7) la rejoue sur un PRÉFIXE de ces séances.
  // 186 (décision d'Aurélien du 29/10/2026, MOTEUR §9.1.2) — LES REPS AU-DESSUS DU HAUT DE LA ZONE NE COMPTENT DANS L'HABITUDE
  // QUE JUSQU'AU HAUT. La zone en vigueur à chaque séance est celle que l'habitude des séances d'avant range, TOUS FORMATS CONFONDUS
  // (la première séance, sans passé, ne se plafonne pas) : 17-16-15 en Volume (10-12) comptent 12-12-12. Seules les séances qui ont
  // REÇU une consigne (`sousConsigne`) sont plafonnées : une habitude installée sans consigne se compte entière. La zone ne bascule
  // plus seule sur un dépassement ; elle change par un choix de la personne (la carte « Passer en… », `poserZone`).
  function reposPlafonne(x, plafond) {
    var recue = !!x.seance && x.seance.sousConsigne === true;
    var hors = (x.auPalier || []).filter(function (t) { return !Modele().estAuMax(t); });   // 193-6 : une série « Au max » mesure une capacité, pas une habitude
    return repsDe(hors.length ? hors : x.auPalier).map(function (r) { return recue && plafond !== null && plafond !== undefined && r > plafond ? plafond : r; });
  }
  // Le haut de la zone en vigueur AVANT chaque séance lue (`plafond`), posé une fois par `lectureDuCouple`.
  function poserPlafonds(lus) {
    var parSeance = [];
    var habitude = null;
    lus.forEach(function (x) {
      var z = habitude === null ? null : zoneDe(habitude);
      x.plafond = z === null || parSeance.length < FENETRE_COUPLE ? null : nombre(z.haut);
      parSeance.push(reposPlafonne(x, x.plafond));
      var tout = [];
      parSeance.slice(-FENETRE_HABITUDE).forEach(function (l) { tout = tout.concat(l); });
      var m = mediane(tout);
      habitude = m === null ? null : Math.ceil(m);
    });
  }
  function habitudeSur(duCouple) {
    var reps = [];
    (duCouple || []).slice(-FENETRE_HABITUDE).forEach(function (x) {
      reps = reps.concat(reposPlafonne(x, x.plafond));
    });
    var m = mediane(reps);
    return m === null ? null : Math.ceil(m);
  }

  function habitudeDe(seances, avant) {
    var lecture = lectureDuCouple(seances, avant);
    return lecture === null ? null : habitudeBordee(lecture, lecture.duCouple, habitudeSur(lecture.duCouple));
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

  // 184 (B4) — LE MOT DU MATÉRIEL dans « ... ne permet pas un plus petit cran » : la barre, les haltères, sinon la
  // machine (machine, poulie, Smith, kettlebell, disque...). Il se lit sur le matériel de l'exercice, que le moteur
  // connaît déjà (`opt.equipement`, porté par le fondement de l'étirement) : la condition de la phrase ne change pas.
  function motDuMateriel(equipement, majuscule) {
    var m = equipement === 'barre' ? 'ta barre' : equipement === 'haltere' ? 'tes haltères' : 'ta machine';
    return majuscule ? m.charAt(0).toUpperCase() + m.slice(1) : m;
  }
  // « Ta barre ne permet pas un plus petit cran » — « Tes haltères ne permettent pas… » (le verbe suit le mot).
  // 186 — « deux crans », « trois crans » : le nombre de crans d'un saut, en mots.
  function motCrans(n) { return n >= 3 ? 'trois crans' : n === 2 ? 'deux crans' : 'un cran'; }
  function ditPasDePlusPetitCran(equipement, majuscule) {
    return motDuMateriel(equipement, majuscule) + (equipement === 'haltere' ? ' ne permettent' : ' ne permet') +
           ' pas un plus petit cran';
  }

  // 163 (24/10/2026, décision d'Aurélien) — LE PAS PAR MATÉRIEL EST COMPLET : plus jamais une charge « sans chiffre » pour
  // un exercice en kg. Machine 5, poulie 2,5, kettlebell 4 (la série 8 · 12 · 16 · 20 · 24), en plus de la barre et du
  // Smith 2,5 et des haltères (la PAIRE : +2 jusqu'à 20 kg, +4 au-delà, soit 1 kg par haltère jusqu'à 10 kg, puis 2).
  // Une charge qui sort de ce repli n'a JAMAIS été faite : elle se dit approchée (`estApprochee`, « ≈ »).
  // Sans pas : disque, élastique, aucun (rien qui se monte en kg). Les « sacs à poignées » n'existent pas au catalogue.
  var REPLI_MATERIEL = {
    barre:         { pas: 2.5 },
    machine_smith: { pas: 2.5 },
    haltere:       { pas: 2, pasLourd: 4, bascule: 20 },
    machine:       { pas: 5 },
    poulie:        { pas: 2.5 },
    kettlebell:    { pas: 4 }
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

  // 186 (MOTEUR §10.2) — LE MATÉRIEL AU PAS CONNU : la barre (disques de 1,25 kg, donc 2,5 kg) et les haltères (la paire : +2 kg sous
  // 20 kg, +4 au-delà). Leur cran est celui de `REPLI_MATERIEL`, jamais une charge déjà notée (`chargeVoisine`) ; l'étirement
  // « faute de cran » ne s'ouvre que si le test EST ce cran-là (`episodeEtirement`). Les machines et poulies, aux crans irréguliers,
  // gardent le rang 2. Le Smith, le kettlebell et le lest gardent aussi la règle d'avant : la décision nomme la barre et les haltères.
  var MATERIEL_AU_PAS_CONNU = { barre: true, haltere: true };
  // 186 — le plus grand pas du matériel (haltères : la bande lourde), ou `null` : le garde-fou du single hors palier (`palier.js`).
  function pasMaxDuMateriel(equipement) {
    if (!Object.prototype.hasOwnProperty.call(REPLI_MATERIEL, equipement)) return null;
    if (equipement === 'barre') return pasDeLaBarre(plusPetitDisqueConnu());   // 190 — le même pas
    var r = REPLI_MATERIEL[equipement];
    return r.pasLourd !== undefined ? r.pasLourd : r.pas;
  }

  // 190 (MOTEUR §10.2, décision d'Aurélien du 30/10/2026) — LE PLUS PETIT DISQUE DE LA SALLE : `profiles.ma_salle.plus_petit_disque`,
  // en kg PAR CÔTÉ. Une barre se charge de deux disques égaux : son plus petit cran est 2 × ce disque (1,25 kg → 2,5 kg ; 2,5 kg →
  // 5 kg ; 0,5 kg → 1 kg). Inconnu (ou illisible) : le repli de `REPLI_MATERIEL` (2,5 kg), inchangé. UNE SEULE FONCTION, le pas de
  // la barre (`pasDeLaBarre`) : le cran de la consigne, du test, de la réaction, de la reprise, du calage de la première séance,
  // du dépassement (qui compte en crans), l'arrondi des chauffes, le garde-fou du single hors palier et la dégressive à la barre
  // (les disques qu'on retire) la lisent ; l'écran du questionnaire l'appelle pour la charge de départ. Le moteur ne lit pas le
  // profil : l'app lui BRANCHE la lecture (`brancherPlusPetitDisque`, une fois, au démarrage) ; sans branchement, le repli.
  // Le Smith garde son pas : son poids n'est pas celui de la barre de la salle (voir le rapport du 190).
  function pasDeLaBarre(plusPetitDisque) {
    var d = nombre(plusPetitDisque);
    return d !== null && d > 0 ? auCentieme(2 * d) : REPLI_MATERIEL.barre.pas;
  }
  var sourceDuDisque = null;
  function brancherPlusPetitDisque(lecture) {
    sourceDuDisque = typeof lecture === 'function' ? lecture : null;
  }
  function plusPetitDisqueConnu() {
    if (!sourceDuDisque) return null;
    var d = nombre(sourceDuDisque());
    return d !== null && d > 0 ? d : null;
  }

  // ⚠️ LA BASCULE APPARTIENT À LA BANDE LÉGÈRE, et l'asymétrie est voulue : on
  // SORT de la bande en montant depuis 20 (20 -> 24), on y RESTE en descendant
  // depuis 20 (20 -> 18). Les deux sens décrivent le même plan de charges.
  function repliDe(equipement, palier, sens) {
    if (!Object.prototype.hasOwnProperty.call(REPLI_MATERIEL, equipement)) return null;
    if (equipement === 'barre') return pasDeLaBarre(plusPetitDisqueConnu());
    var r = REPLI_MATERIEL[equipement];
    if (r.pasLourd === undefined) return r.pas;
    return (sens > 0 ? palier >= r.bascule : palier > r.bascule) ? r.pasLourd : r.pas;
  }

  // ── MOTEUR §10 bis — LE MATÉRIEL DE LA SALLE (108, décidé le 15/10/2026) ──
  //
  // « Le coach ne propose jamais une charge que la salle n'a pas », pour les
  // exercices à barre fixe (EZ, droite légère) et aux haltères — et seulement
  // pour qui l'a déclaré : sans déclaration, `salle` est `null` et RIEN ne
  // change (on suppose qu'on peut ajouter des disques, comme avant).
  //
  // `salle` : `{ materiel, charges }`, résolue UNE fois par l'app pour un
  // exercice (`THProfil.salleDeLExercice`) — `materiel` vaut `barre_ez`,
  // `barre_droite` ou `halteres` ; `charges` les charges que la salle fait,
  // croissantes, dans l'unité des séries (une barre : son poids ; des haltères :
  // la PAIRE, §10.1). Le moteur ne lit pas le profil : il reçoit la liste.
  var SALLE_BARRES = ['barre_ez', 'barre_droite'];
  // 132 (MOTEUR §10 ter) — UNE LISTE D'ÉLASTIQUES EST UNE SALLE dont les crans sont des noms : ses charges sont
  // VIRTUELLES (`THProfil.salleDeLExercice` : aide −3, −2, −1 ; résistance 3, 2, 1), ordonnées dans le sens où monter
  // est plus dur. Tout le §10 bis s'applique tel quel ; seules les gardes « une charge positive » (le poids du corps
  // vaut 0, une aide est négative) s'ouvrent aux charges virtuelles d'une aide, qui sont négatives par construction.
  // Ce qui lirait un CHIFFRE sur ces charges en est tenu à l'écart, exercice noté par nom hors de la règle : la
  // seconde charge de la réaction (10 %, le saut habituel en proportion), le repli de la reprise longue (10 %), le
  // report d'une nouvelle zone (une estimation du 1RM). Le double saut de Franc, borné à 10 %, n'y passe jamais.
  function salleDElastiques(salle) { return !!salle && salle.materiel === 'elastique'; }
  function chargesDeLaSalle(salle) {
    var el = salleDElastiques(salle);
    var l = salle && Array.isArray(salle.charges) ? salle.charges.map(nombre)
      .filter(function (v) { return v !== null && (v > 0 || (el && v < 0)); }) : [];
    l.sort(function (a, b) { return a - b; });
    return l.filter(function (v, i) { return i === 0 || !memeCharge(v, l[i - 1]); });
  }
  function maxDeLaSalle(salle) {
    var l = chargesDeLaSalle(salle);
    return l.length ? l[l.length - 1] : null;
  }
  // LA SALLE EN VIGUEUR pour une charge de référence, ou `null`. ⚠️ UNE BARRE
  // CHARGÉE DE DISQUES N'EST PAS CONCERNÉE : à la barre, une charge au-dessus de
  // la plus lourde barre fixe déclarée ne peut venir que d'une barre qu'on
  // charge — la salle ne dit alors rien de ses crans (un rowing à 80 kg ne se
  // plafonne pas à la barre droite de 30). Aux haltères, la salle vaut toujours :
  // une charge au-delà de la plus lourde paire s'arrondit à elle.
  function salleEnVigueur(salle, reference) {
    var l = chargesDeLaSalle(salle);
    if (!l.length) return null;
    var r = nombre(reference);
    if (SALLE_BARRES.indexOf(salle.materiel) >= 0 && r !== null && r > l[l.length - 1] &&
        !memeCharge(r, l[l.length - 1])) return null;
    var s = { materiel: salle.materiel, charges: l };
    // L'isolation (non polyarticulaire) : la fourchette à la plus lourde s'étend à 15 reps (`plafondALaSalle`).
    if (salle.isolation === true) s.isolation = true;
    // 175 — la visée acceptée (le levier « reps ») rallonge le plafond de CETTE plus lourde (`avecRallonge`).
    if (nombre(salle.visee) !== null) s.visee = nombre(salle.visee);
    // 132 — les noms des crans d'une liste d'élastiques suivent la salle en vigueur : l'affichage les lit.
    if (salleDElastiques(salle) && salle.noms) s.noms = salle.noms;
    return s;
  }
  // La charge de la salle juste au-delà (`sens` > 0) ou en deçà (< 0), ou
  // `null` : la salle n'a rien de plus lourd (de plus léger).
  function voisineDeLaSalle(salle, charge, sens) {
    var l = chargesDeLaSalle(salle), c = nombre(charge);
    if (!l.length || c === null) return null;
    if (nombre(sens) < 0) {
      for (var i = l.length - 1; i >= 0; i--) if (l[i] < c && !memeCharge(l[i], c)) return l[i];
      return null;
    }
    for (var j = 0; j < l.length; j++) if (l[j] > c && !memeCharge(l[j], c)) return l[j];
    return null;
  }
  function dansLaSalle(salle, charge) {
    var c = nombre(charge);
    return c !== null && chargesDeLaSalle(salle).some(function (v) { return memeCharge(v, c); });
  }
  // ARRONDIE À LA SALLE, vers le bas (« même logique que le repli sur les
  // machines », §10.2 : une charge que la salle fait) ; sous la plus légère, la
  // plus légère. Une charge déjà dans la salle reste telle quelle.
  function arrondieALaSalle(salle, charge) {
    var c = nombre(charge), l = chargesDeLaSalle(salle);
    if (c === null || !l.length) return charge;
    if (dansLaSalle(salle, c)) return c;
    var bas = voisineDeLaSalle(salle, c, -1);
    return bas === null ? l[0] : bas;
  }
  // LE CRAN, SALLE COMPRISE : déclarée, la salle décide seule (`null` = rien
  // au-delà) ; sinon le §10.2 tel quel. Un seul câblage : la consigne, l'épisode
  // d'étirement, la réaction, la suite et la reprise longue passent par ici.
  function voisineSalleComprise(seances, avant, palier, equipement, sens, salle) {
    if (salle) return instant(avant) === null ? null : voisineDeLaSalle(salle, palier, sens);
    return chargeVoisine(seances, avant, palier, equipement, sens);
  }

  // ── §10 bis (décidé le 16/10/2026) — À LA PLUS LOURDE DE LA SALLE ─────────
  //
  // « Quand la charge demandée dépasse la plus lourde de la salle, le coach garde la plus lourde et progresse en
  // reps, jusqu'au haut de la fourchette de la zone ; sur un exercice d'isolation (non polyarticulaire), la
  // fourchette s'étend jusqu'à 15 reps. La zone est gelée au moment où l'exercice atteint la plus lourde de la salle
  // […]. Au plafond, le coach maintient […]. » Au plafond, l'escalier propose ses trois marches (113, 16/10/2026 :
  // `marcheAuPlafond`, plus bas) ; la phrase « l'escalier ne propose rien » est remplacée.
  //
  // UNE définition de « à la plus lourde » (la consigne, le gel de la zone, l'escalier du plan et I47 la lisent) : une
  // charge au moins égale à la plus lourde que la salle fait. Aux haltères, une paire au-delà (une autre salle) l'est
  // aussi ; à la barre, une charge au-delà n'a pas de salle en vigueur (`salleEnVigueur`).
  var REPS_ISOLATION_SALLE = 15;
  function estALaPlusLourde(salle, charge) {
    var m = maxDeLaSalle(salle), c = nombre(charge);
    return m !== null && c !== null && (c > m || memeCharge(c, m));
  }
  // Le plafond des reps à la plus lourde : le haut de la zone, 15 sur une isolation dont la zone s'arrête plus bas.
  // Sans zone (la règle de bord) : 15 sur une isolation, sinon `null` (une rep de plus, comme avant).
  function plafondALaSalle(zone, salle) {
    var iso = !!(salle && salle.isolation === true);
    var base = !zone ? (iso ? REPS_ISOLATION_SALLE : null) : (iso ? Math.max(zone.haut, REPS_ISOLATION_SALLE) : zone.haut);
    // 175 — LA ZONE S'ALLONGE (le levier « Viser N reps », accepté) : la visée acceptée, à cette charge (`rallonge`), est le
    // plafond. L'allongement passe ICI, par la seule définition du plafond.
    var v = salle ? nombre(salle.visee) : null;
    return v !== null && (base === null || v > base) ? v : base;
  }
  // 175 — le plafond de la salle rallongé de la visée acceptée (`rallonge` : `{ charge, visee }`), seulement tant que
  // l'exercice est à CETTE plus lourde ; sinon la salle telle qu'elle est.
  function avecRallonge(salle, rallonge) {
    if (!salle || !rallonge) return salle;
    var v = nombre(rallonge.visee), c = nombre(rallonge.charge), m = maxDeLaSalle(salle);
    if (v === null || c === null || m === null || !memeCharge(m, c)) return salle;
    return Object.assign({}, salle, { visee: v });
  }
  // 175 — LA VISÉE du levier « reps » : le plafond d'aujourd'hui + 3 reps, au plus 30 ; au plus 8 quand le plafond est de 5
  // reps ou moins (la force). `null` : rien à viser de plus.
  function viseeDuLevier(plafond) {
    var p = nombre(plafond);
    if (p === null) return null;
    var v = Math.min(p + RALLONGE_REPS, p <= HAUT_FORCE ? RALLONGE_MAX_FORCE : RALLONGE_MAX_REPS);
    return v > p ? v : null;
  }
  // LE GEL DE LA ZONE (« comme pendant un étirement », §9.7) : les dernières séances (non neutres, `ant`) à la plus
  // lourde de la salle, sans interruption ; la zone d'alors est celle de l'habitude lue juste après la PREMIÈRE
  // d'entre elles — son couple et ses 8 séances d'alors, jamais les reps prescrites au-delà depuis. `null` : la
  // dernière séance n'est pas à la plus lourde.
  function gelALaSalle(ant, vues, salle) {
    var i0 = null;
    for (var i = ant.length - 1; i >= 0; i--) {
      if (!estALaPlusLourde(salle, ant[i].palier)) break;
      i0 = i;
    }
    if (i0 === null) return null;
    var t = instant(ant[i0].debut);
    if (t === null) return null;
    var lecture = lectureDuCouple(vues, new Date(t + 1).toISOString());
    var h = lecture === null ? null : habitudeSur(lecture.duCouple);
    return h === null ? null : { debut: ant[i0].debut, habitude: h };
  }

  // La salle en vigueur d'une consigne : lue sur son palier (`salleEnVigueur`),
  // `null` sans consigne chiffrée, au poids du corps ou sur une aide.
  function salleDeLaConsigne(consigne, salle) {
    if (!salle || !consigne || consigne.etat === 'silence') return null;
    var P = nombre(consigne.palier);
    if (P === null || P === 0 || (P < 0 && !salleDElastiques(salle))) return null;
    return salleEnVigueur(salle, P);
  }
  // Les charges d'une consigne arrondies à la salle (`consignePour` l'a déjà
  // fait pour les siennes ; le report d'une nouvelle zone ou un départ, non).
  // Une ligne haute qui ne reste pas au-dessus de la ligne disparaît.
  function consigneDansLaSalle(consigne, salle) {
    if (!salle || !consigne || consigne.etat === 'silence') return consigne;
    var ligne = consigne.ligne, haut = consigne.haut, change = false;
    if (ligne && nombre(ligne.charge) !== null && !dansLaSalle(salle, ligne.charge)) {
      ligne = Object.assign({}, ligne, { charge: arrondieALaSalle(salle, ligne.charge) });
      change = true;
    }
    if (haut && nombre(haut.charge) !== null && !dansLaSalle(salle, haut.charge)) {
      var h = arrondieALaSalle(salle, haut.charge), l = ligne ? nombre(ligne.charge) : null;
      haut = l !== null && !(h > l && !memeCharge(h, l)) ? null : Object.assign({}, haut, { charge: h });
      change = true;
    }
    return change ? Object.assign({}, consigne, { ligne: ligne, haut: haut }) : consigne;
  }
  // L'EXERCICE EST-IL À LA PLUS LOURDE DE SA SALLE ? La salle en vigueur de la consigne, son palier à la plus lourde,
  // et la charge demandée aussi : « si la charge demandée redescend sous la plus lourde, tout reprend normalement ».
  // `auPlafondDeLaSalle` (113) le lit ; aucun écran ne le recalcule.
  function aLaPlusLourdeDeLaSalle(consigne, salle) {
    var s = salleDeLaConsigne(consigne, salle);
    if (!s || !estALaPlusLourde(s, consigne.palier)) return false;
    var l = consigne.ligne ? nombre(consigne.ligne.charge) : null;
    return l === null || estALaPlusLourde(s, l);
  }
  // Un repli (§14.2) que la salle ne fait pas est sauté : le coach n'invente
  // pas une charge plus basse que la donnée ne soutient (se taire, §14.2).
  function repliDansLaSalle(repli, salle) {
    if (!repli || !salle) return repli;
    return dansLaSalle(salle, repli.palier) ? repli : null;
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
    //
    // 186 (MOTEUR §10.2, décision d'Aurélien du 29/10/2026) — UNE BARRE ET DES HALTÈRES ONT UN PAS CONNU : le cran est le pas réel
    // du matériel (le rang 3, ci-dessous), JAMAIS une charge déjà notée. Le rang 2 ne vaut plus que pour les machines aux crans
    // irréguliers. Sur une barre, la charge « déjà utilisée juste au-dessus » prenait un single de test (150 × 5, puis 190 × 1) ou
    // une faute de frappe pour un cran : 190 kg, +27 % — et l'étirement concluait « ta machine ne permet pas un plus petit
    // cran », six séances de suite (A4 de la contre-vérification).
    var voisine = null;
    if (!MATERIEL_AU_PAS_CONNU[equipement]) {
      var plancher = dir > 0 ? plancherDuMateriel(equipement, avant) : null;
      anterieures(seances, avant).forEach(function (se) {
        if (plancher !== null && instant(se.debut) < plancher) return;
        chargesDe(se).forEach(function (c) {
          if (dir > 0 ? c <= p : c >= p) return;
          if (voisine === null || (dir > 0 ? c < voisine : c > voisine)) voisine = c;
        });
      });
    }
    if (voisine !== null) return voisine;

    var repli = repliDe(equipement, p, dir);
    if (repli !== null) return auCentieme(p + dir * repli);

    return null;
  }

  // 163 (MOTEUR §10.2 bis) — UNE CHARGE APPROCHÉE est une charge que le coach propose sans qu'elle ait jamais été faite
  // sur cet exercice, et sans qu'un pas EXACT de l'historique la porte : elle sort du repli du matériel. L'écran la dit
  // « ≈ 35 kg » et demande de viser la charge la plus proche que la salle permet ; ce qui est noté devient une charge
  // CONNUE (l'historique suffit, rien à écrire) et le « ≈ » disparaît à la séance suivante. Faux sans matériel au repli
  // (disque, élastique, aucun), pour le poids du corps et pour une charge nulle ou négative.
  function estApprochee(seances, avant, charge, equipement) {
    var c = nombre(charge);
    if (c === null || c <= 0 || instant(avant) === null) return false;
    if (!Object.prototype.hasOwnProperty.call(REPLI_MATERIEL, equipement)) return false;
    var ant = anterieures(seances, avant);
    for (var i = 0; i < ant.length; i++) {
      var cs = chargesDe(ant[i]);
      for (var j = 0; j < cs.length; j++) if (memeCharge(cs[j], c)) return false;
    }
    var pas = pasDeSalle(seances, avant);
    return !(pas && pas.nature === 'exact');
  }
  // La phrase sous la ligne, par matériel (maquette `maquette-cran-suivant-v3`, validée le 24/10/2026).
  var PHRASES_APPROCHEE = {
    defaut: 'vise la charge la plus proche que ta machine permet — la plaque au-dessus, ou un petit poids ajouté si elle en a. Note ce que tu as mis.',
    barre: 'vise la barre au-dessus, ou des petits disques si ta barre se charge. Note ce que tu as mis.',
    machine_smith: 'vise la barre au-dessus, ou des petits disques si ta barre se charge. Note ce que tu as mis.',
    haltere: 'vise l’haltère au-dessus. Note ce que tu as mis.',
    poulie: 'vise la plaque au-dessus, ou un petit disque si ta poulie en a. Note ce que tu as mis.',
    kettlebell: 'vise le kettlebell au-dessus. Note ce que tu as mis.'
  };
  var PHRASE_APPROCHEE_BARRE_CONNUE = 'vise la barre au-dessus, avec ton plus petit disque de chaque côté. Note ce que tu as mis.';
  // La phrase, avec la charge approchée en tête (« ≈ 35 kg : vise la charge la plus proche… ») quand la consigne est
  // donnée : les charges passent par le formateur de la voix (citations I26, mêmes rôles que l'en-tête).
  function phraseApprochee(equipement, consigne) {
    var base = Object.prototype.hasOwnProperty.call(PHRASES_APPROCHEE, equipement) && equipement !== 'defaut'
      ? PHRASES_APPROCHEE[equipement] : PHRASES_APPROCHEE.defaut;
    // 190 — le plus petit disque est connu : « des petits disques si ta barre se charge » promettrait un cran que ta salle n'a pas.
    if (equipement === 'barre' && plusPetitDisqueConnu() !== null) base = PHRASE_APPROCHEE_BARRE_CONNUE;
    var morceaux = [];
    ['ligne', 'haut'].forEach(function (r) {
      var l = consigne && consigne[r];
      if (l && l.approchee === true && nombre(l.charge) !== null) {
        var t = '\u2248' + INSECABLE + enKg(l.charge, cite(CIBLE, { role: r }));
        if (morceaux.indexOf(t) < 0) morceaux.push(t);
      }
    });
    return morceaux.length ? morceaux.join(' et ') + DEUX_POINTS + base : base;
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
  // 186 — les crans d'un dépassement : Normal, deux crans dès 6 reps ou 50 % au-dessus du haut ; le plafond d'un saut de plusieurs crans.
  var DEPASSEMENT_NORMAL_REPS = 6;
  var DEPASSEMENT_NORMAL_PART = 0.5;
  var PLAFOND_SAUT = 0.15;
  var PLAFOND_SAUT_DEBUTANT = 0.10;

  // ══ 191 (MOTEUR §9.1.2 bis, décision d'Aurélien du 30/10/2026) — LA PRUDENCE DE MONTÉE, SELON L'ÂGE ET L'EXPÉRIENCE ═══════════
  //
  // UN SEUL PRÉDICAT, lu par le plafond d'un saut (186), le calage de la première séance (187), le dépassement et les invariants
  // (I71, I73) : rien ne se recopie.
  //   · PLAFOND À +10 % (au lieu de +15 %) pour les sauts de plusieurs crans : le débutant (`anciennete = moins_1_an`) OU
  //     65 ans et plus, quelle que soit l'expérience ;
  //   · UN CRAN À LA FOIS (calage : réserve 3 ou plus → +1 cran ; dépassement : jamais deux ni trois crans) pour le débutant de
  //     50 ans et plus.
  //   · Un cran seul reste TOUJOURS permis : la prudence ne bloque jamais la montée, elle la ralentit.
  //   · L'âge est celui du profil (`date_naissance`). ABSENT (`null`) : aucune de ces règles, jamais un âge deviné. Rien ne change
  //     sur la charge de départ : ce n'est pas une estimation de force par population.
  // Raison : les tendons s'adaptent plus lentement que les muscles, et plus encore avec l'âge (Magnusson et Kjaer) ; l'ACSM
  // recommande une progression prudente chez les plus âgés (position stand 2009).
  var AGE_PLAFOND_BAS = 65, AGE_UN_CRAN = 50;
  var RAISON_PRUDENCE = { debutant: 'debutant', age: 'age', debutantAge: 'debutant_age' };
  // `o` : `{ debutant: booléen, age: années révolues ou null }`. Rend `{ plafond, unCran, raison }` ; `raison` est `null` sans prudence.
  function prudenceDeMontee(o) {
    var debutant = !!o && o.debutant === true;
    var a = o ? nombre(o.age) : null;
    var age = a !== null && a >= 0 && a < 130 ? a : null;
    var senior = age !== null && age >= AGE_PLAFOND_BAS;
    var unCran = debutant && age !== null && age >= AGE_UN_CRAN;
    return { plafond: debutant || senior ? PLAFOND_SAUT_DEBUTANT : PLAFOND_SAUT, unCran: unCran,
             raison: unCran ? RAISON_PRUDENCE.debutantAge : senior ? RAISON_PRUDENCE.age : debutant ? RAISON_PRUDENCE.debutant : null };
  }
  // La prudence EN VIGUEUR : celle qu'on donne (une prudence valide), sinon celle du seul débutant (sans âge : rien de deviné).
  function prudenceEffective(debutant, prudence) {
    if (prudence && typeof prudence === 'object' && nombre(prudence.plafond) !== null) {
      return { plafond: nombre(prudence.plafond), unCran: prudence.unCran === true, raison: prudence.raison || null };
    }
    return prudenceDeMontee({ debutant: debutant === true, age: null });
  }
  // Une phrase du « Pourquoi » quand la prudence a changé ce que le coach propose. Un fait, pas de nombre.
  var PHRASE_UN_CRAN = 'Un cran à la fois : les tendons s’adaptent plus lentement que les muscles.';
  var PHRASE_PLAFOND = 'Le saut reste limité : les tendons s’adaptent plus lentement que les muscles.';
  function phrasePrudence(quoi) { return quoi === 'un_cran' ? PHRASE_UN_CRAN : quoi === 'plafond' ? PHRASE_PLAFOND : null; }

  // ── §9.26 (154) — L'EFFORT VISÉ : « garde-en N » ─────────────────────────────────────────────────────────────────
  //
  // La réserve que le coach vise sur la dernière série de travail d'un exercice, en reps. Une table, un seul endroit :
  // Normal — Lourd 2, Mix 2, Hypertrophie 1, Volume 1, Séries longues 1 ; Prudent +1, Franc −1 ; une ligne de test : celle de
  // sa zone moins 1 ; bornée à [0, 3]. `null` : pas de réserve visée (sans zone, sans coach, une chauffe, une durée, une
  // distance, une dégressive). Décision d'Aurélien, 24/10/2026.
  var RESERVE_NORMALE = { lourd: 2, mix: 2, hypertrophie: 1, volume: 1, series_longues: 1 };
  var ROLES_A_RESERVE = { ligne: true, coach: true, retour: true, elan: true, test: true, haut: true };
  // 169 — L'ÉLIGIBILITÉ DE L'EFFORT VISÉ, une seule fonction pour le moteur et pour le plan : la règle ne joue pas au poids du
  // corps (palier 0) ni avec une aide (palier < 0). `palier` : le palier de la consigne (`consigne.palier`).
  function effortViseEligible(palier) {
    var p = nombre(palier);
    return p !== null && p > 0;
  }
  var RESERVE_ECART = 2;   // la réserve notée ≥ visée + 2 : un vrai signal (l'erreur moyenne d'estimation est d'environ 1 rep)
  function reserveVisee(o) {
    var x = o || {};
    var z = typeof x.zone === 'string' ? x.zone : (x.zone && x.zone.cle) || null;
    if (z === null || !Object.prototype.hasOwnProperty.call(RESERVE_NORMALE, z)) return null;
    var role = x.role === undefined || x.role === null ? 'ligne' : x.role;
    if (!Object.prototype.hasOwnProperty.call(ROLES_A_RESERVE, role)) return null;
    var v = RESERVE_NORMALE[z];
    // 169 (25/10/2026, décision d'Aurélien) — le Prudent vise 2 en Lourd et en Mix, comme le Normal : à 3, le plafond de la
    // réserve notée, la réserve bloquait la montée sans issue. Sa prudence reste dans son déclencheur (deux séances de suite).
    if (x.reglage === 'prudent' && z !== 'lourd' && z !== 'mix') v += 1;
    else if (x.reglage === 'franc') v -= 1;
    if (role === 'test' || role === 'haut') v -= 1;
    return Math.min(3, Math.max(0, v));
  }

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
    // 186 — la séance a reçu une consigne (un pari) : ses reps au-dessus du haut ne comptent que jusqu au haut (`reposPlafonne`).
    if (se && se.sousConsigne === true) vue.sousConsigne = true;
    return vue;
  }

  // Le test d'une séance : la plus lourde exploration, ses séries, leur niveau.
  // `niveauValide` et non les reps brutes — compté comme au palier (§17.4 : les
  // reps faites depuis 74 ; une de moins à fond dans le calcul prudent).
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
    var t = { charge: T, k: aT.length, reps: nombre(aT[0].reps), niveau: niveauValide(aT) };
    // §17.4 révisé (68B) — quand la rep en moins d'une série à fond change le
    // niveau, de quoi le DIRE : le niveau sur les reps faites, et sa cause.
    var nf = niveauFait(aT);
    if (nf !== null && t.niveau !== null && nf > t.niveau) {
      t.niveauFait = nf;
      t.cause = causeAFond(aT);
    }
    return t;
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
  // ══ 175 (MOTEUR §9.7 / §10.2, décision d'Aurélien du 26/10/2026) — LE GROS CRAN ══
  //
  // Un cran de charge est GROS quand l'écart (T − P) / P dépasse ce que la zone absorbe : (haut − bas) × 2,5 % (Epley : une
  // rep ≈ 2,5 % de charge autour de 8-12 reps). Sur une machine dont le plus petit cran est gros (9 → 11,5 kg : +28 %, ~11
  // reps d'écart), exiger le BAS de la zone au premier essai le condamne : le test se valide dès `plancher` reps —
  // max(bas − 2, 8 sur une isolation, 4 sinon), jamais au-dessus du bas. Raté même au plancher : retour à P, la cible
  // d'étirement monte de 2 reps par essai raté (au plus haut + 6, jamais plus de 30) ; au plafond ou après deux essais
  // ratés, la carte des leviers (sans « Viser plus de reps »). Un cran qui n'est pas gros ne change rien.
  var GROS_CRAN_PAR_REP = 2.5;          // % de charge par rep d'écart
  var GROS_PLANCHER_ISOLATION = 8;      // reps : le test d'une isolation ne se valide jamais sous 8
  var GROS_PLANCHER = 4;                // reps : ni sous 4 ailleurs
  var GROS_RECUL_REPS = 2;              // reps de cible d'étirement en plus par essai raté
  var GROS_CIBLE_MAX = 6;               // reps au-dessus du haut de la zone, au plus (et jamais plus de PLAFOND_CIBLE)
  var GROS_ESSAIS_AVANT_LEVIERS = 2;    // essais ratés après lesquels la carte des leviers vient
  function plancherDuGros(zone, isolation) {
    var lo = nombre(zone && zone.bas);
    if (lo === null) return null;
    return Math.min(lo, Math.max(lo - 2, isolation === true ? GROS_PLANCHER_ISOLATION : GROS_PLANCHER));
  }
  // `{ de, vers, pct, reps, plancher }` quand le cran P → T est gros pour cette zone, sinon `null`. Le pourcentage et les reps
  // d'écart sont ARRONDIS (la phrase les dit tels quels, le test les relit).
  function grosCran(P, T, zone, isolation) {
    if (isolation === null) return null;   // une liste d'élastiques n'a pas de pourcentage de charge
    var p = nombre(P), t = nombre(T);
    if (!zone || p === null || t === null || !(p > 0) || !(t > p)) return null;
    var delta = (t - p) / p * 100;
    if (!(delta > (nombre(zone.haut) - nombre(zone.bas)) * GROS_CRAN_PAR_REP + 1e-9)) return null;
    return { de: p, vers: t, pct: Math.round(delta), reps: Math.round(delta / GROS_CRAN_PAR_REP),
             plancher: plancherDuGros(zone, isolation), isolation: isolation === true };
  }
  // « De 9 à 11,5 kg, c'est +28 % : environ 11 reps d'écart. À 11,5 kg, 10 reps suffisent pour t'y installer. » — le test d'un
  // gros cran, avant. Le pourcentage arrondi, les reps d'écart (écart ÷ 2,5 %) et le plancher sont des règles du moteur ;
  // les charges sont celles des lignes de la consigne (la ligne, la ligne haute).
  function phraseGrosCran(g) {
    // Les deux charges et les reps sont des FAITS DE LA RÈGLE (le fondement `cranGros`), pas des lignes de la consigne : la
    // ligne haute peut ne pas être posée (séries allégées), et la phrase dit l'écart quand même.
    var cV = regle('cran.vers');
    return 'De ' + nombreFr(g.de, regle('cran.de')) + ' à ' + enKg(g.vers, cV) +
      ', c\'est +' + nombreFr(g.pct, regle('cran.pct')) + INSECABLE + '%' + DEUX_POINTS + 'environ ' +
      nombreFr(g.reps, regle('cran.reps')) + ' reps d\'écart. À ' + enKg(g.vers, cV) + ', ' +
      nombreFr(g.plancher, regle('cran.plancher')) + ' reps suffisent pour t\'y installer.';
  }
    // Le plafond de la cible d'étirement d'un gros cran : le haut de la zone + 6, au plus 30.
  function cibleMaxDuGros(zone) { return Math.min(PLAFOND_CIBLE, nombre(zone.haut) + GROS_CIBLE_MAX); }
  // La cible d'étirement après `ratees` essais ratés : le haut + 2 par essai, plafonnée.
  function cibleDuGros(zone, ratees) {
    return Math.min(cibleMaxDuGros(zone), nombre(zone.haut) + GROS_RECUL_REPS * Math.max(1, ratees));
  }

  function episodeEtirement(duCouple, P, vues, avant, equipement, correction, salle, isolation) {
    var rates = [];
    for (var i = duCouple.length - 1; i >= 0; i--) {
      var x = duCouple[i];
      if (nombre(x.seance.palier) !== P) break;
      var t = testDe(x.seance);
      if (t === null) continue;
      // « sa zone d'alors » : l'habitude arrêtée à cette séance-là, jamais la
      // zone d'aujourd'hui — elle est justement ce qu'on cherche à figer.
      var z = zoneRetenue(correction, habitudeSur(duCouple.slice(0, i + 1)));
      if (z === null || t.niveau === null) break;
      // 175 — un gros cran se valide au plancher : un test à `plancher` reps ou plus a passé.
      var gg = grosCran(P, t.charge, z, isolation);
      if (t.niveau >= (gg ? gg.plancher : z.bas)) break;
      // 186 — « faute de cran » : sur une barre ou des haltères au pas connu, `c1` est le pas réel du matériel (jamais une charge
      // déjà notée) : le test d'un single à +27 % n'est plus « sans cran plus petit » (c1 < 190), et l'étirement ne s'ouvre que
      // si le test EST le plus petit cran (le curl marteau à 32 kg × 8 : la paire de 28 → 32, le pas des haltères au-delà de 20).
      var c1 = voisineSalleComprise(vues, avant, P, equipement, 1, salle || null);
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

  // §17.4 révisé (68B) — `niveauFait` et `cause` n'y figurent QUE s'ils
  // changent ce qui se dit : un test compté sous le bas de la zone `z`, que
  // ses reps faites atteignent (« … à RPE 10, sans marge »). L'absence est le
  // signal, comme pour toute clé du fondement.
  function faitDuTest(t, debut, z) {
    var f = { charge: t.charge, reps: t.reps, niveau: t.niveau, date: debut };
    if (testSansMarge(t, z || null)) { f.niveauFait = t.niveauFait; f.cause = t.cause; }
    return f;
  }

  // ⚠️ LA DERNIÈRE SÉANCE, SÉRIE PAR SÉRIE (48b-6a, MOTEUR §9.13). La feuille
  // « Pourquoi » la relit en entier — chauffes comprises, elles qui ne votent
  // nulle part ailleurs. On PROJETTE les six colonnes plutôt que de rendre les
  // objets d'entrée : le fondement est un contrat, pas une fenêtre ouverte sur
  // ce que l'appelant a bien voulu mettre dans ses séries.
  // 186 (MOTEUR §9.2, décision d'Aurélien du 29/10/2026) — LA SÉRIE HORS PALIER DE LA DERNIÈRE SÉANCE (un single à +15 % ou une série
  // de test), la plus lourde : de quoi dire « Ton single à 190 kg est un record ; il ne compte pas dans ta charge de travail. ».
  // `record` : plus lourde que toute charge notée sur l'exercice avant cette séance (un fait, pas une estimation). `null` sans elle.
  function horsPalierDeLaDerniere(L, ant) {
    var plus = null;
    ((L && L.series) || []).forEach(function (s) {
      if (!s || s.origine !== 'hors_palier') return;
      var kg = nombre(s.charge_kg);
      if (kg !== null && (plus === null || kg > nombre(plus.charge_kg))) plus = s;
    });
    if (plus === null) return null;
    var kgP = nombre(plus.charge_kg);
    var record = kgP > 0 && (ant || []).every(function (se) {
      return se === L || ((se && se.series) || []).every(function (s) {
        var c = nombre(s && s.charge_kg);
        return c === null || (c < kgP && !memeCharge(c, kgP));
      });
    });
    return { charge: kgP, reps: nombre(plus.reps), record: record };
  }
  // La phrase du « Pourquoi » : le nom (single, double, sinon série de test), puis le fait, jamais un jugement.
  function phraseHorsPalier(h) {
    var nom = h.reps === 1 ? 'Ton single' : h.reps === 2 ? 'Ton double' : 'Ta série de test';
    return nom + ' à ' + enKg(h.charge, cite(FAIT, { quoi: 'hors_palier' })) +
      (h.record ? ' est un record' + ' ; il ne compte pas dans ta charge de travail.' : ' ne compte pas dans ta charge de travail.');
  }

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
  // `cause` dit d'où vient le cran (un RPE de 10 ou un « reste 0 ») ; la phrase
  // est la même pour les deux depuis 79 (« 125 kg × 5, sans marge »). Le RPE
  // l'emporte, comme dans `cranDeSerie`.
  function serieAFondDe(series) {
    for (var i = 0; i < (series || []).length; i++) {
      var s = series[i];
      var brut = nombre(s && s.reps);
      var comptees = Palier().repsPrudentes(s);
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
    var debutant = debutantEnCours || opt.debutant === true;
    var prudence = prudenceEffective(debutant, prudenceEnCours || opt.prudence);
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
    // §10 bis (108) — la salle déclarée pour cet exercice, ou `null` (rien ne
    // change). Elle se décide sur le palier, plus bas, une fois.
    // 175 — le plafond rallongé par le levier « Viser N reps » (`opt.rallonge`), à la plus lourde où il a été accepté.
    var salleDeclaree = opt.salle ? avecRallonge(opt.salle, opt.rallonge) : null;
    // 175 — l'exercice est-il une ISOLATION ? (la définition du moteur, `estIsolation`, que l'app lit sur le catalogue ; une salle
    // d'élastiques le porte aussi) : le plancher d'un gros cran ne descend pas sous 8 reps.
    // Une liste d'élastiques (132) n'a pas de pourcentage de charge : `null`, jamais de gros cran.
    var isolation = opt.salle && opt.salle.materiel === 'elastique' ? null
      : opt.isolation === true || !!(opt.salle && opt.salle.isolation === true);
    // §9.17 bis (127) — l'exercice est sur une ÉCHELLE (l'app le dit, le moteur ne lit pas le catalogue) : le
    // fondement porte alors les deux dernières séances, niveau et charge (`deuxSeances`), que la carte « marche
    // suivante » du plan lit sans rien recalculer. Absent ailleurs : une clé n'y figure que si elle a un sens.
    var surEchelle = opt.echelle === true;

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
    // §10 bis (108) — LA SALLE EN VIGUEUR, lue sur le palier : à la barre, un
    // palier au-delà de la plus lourde barre fixe déclarée vient d'une barre
    // chargée de disques — la salle n'en dit rien (`salleEnVigueur`).
    var salle = P !== null && (P > 0 || (P < 0 && salleDElastiques(salleDeclaree))) ? salleEnVigueur(salleDeclaree, P) : null;
    // 132 (MOTEUR §10 ter) — un exercice noté par nom : aucun chiffre lu sur ses charges virtuelles.
    var elastique = salleDElastiques(salleDeclaree);
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
    var rates = episodeEtirement(duCouple, P, vues, avant, equipement, correction, salle, isolation);
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
    var habitude = habitudeBordee(lecture, fondantes, habitudeSur(fondantes));
    var habitudeVraie = habitudeBordee(lecture, duCouple, habitudeSur(duCouple));
    // Le PREMIER test raté de l'épisode — `rates` va du plus récent au plus
    // ancien, donc c'est le dernier. C'est sa zone qui reste figée (§9.7).
    var figee = rates.length ? rates[rates.length - 1] : null;
    // §10 bis (16/10/2026) — À LA PLUS LOURDE DE LA SALLE, LA ZONE EST GELÉE, comme pendant un étirement : les reps
    // prescrites au-delà de la zone ne la font pas glisser (le curl EZ à 30 kg passait de Volume en Séries longues à
    // la cinquième séance). Le gel le plus ancien l'emporte quand les deux courent ; la correction, toujours.
    var gelSalle = salle ? gelALaSalle(ant, vues, salle) : null;
    if (gelSalle !== null && (figee === null || instant(gelSalle.debut) <= instant(figee.debut))) {
      habitude = gelSalle.habitude;
    }
    var zone = zoneRetenue(correction, habitude, opt.zonePlan);

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
    // §17.4 révisé (68B) — le niveau sur les reps faites. La note de la série
    // à fond ne se pose QUE si la rep en moins a réellement abaissé le niveau
    // validé ; sinon, la phrase habituelle.
    // 74 — le niveau validé compte désormais les reps faites : la note se
    // pose au même signal qu'en 68B, le niveau du CALCUL PRUDENT sous celui des
    // reps faites (« sans marge : on ne rajoute pas de rep » — le plafond 3).
    var nivFait = niveauFait(A);
    var nivPrudent = enPrudent(function () { return niveauValide(A); });
    var sansMarge = nivFait !== null && nivPrudent !== null && nivFait > nivPrudent;
    if (aFond !== null && !sansMarge) aFond = null;
    if (aFond !== null) aFond.niveauFait = nivFait;
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
      //   §9.17 (précisé le 21/10/2026, 127) — le seuil est le haut de la zone ET 8 reps (`seuilDeMarche`) : en
      //   zone Lourd, à 5 tractions, le coach gratte des reps jusqu'à 8 avant la carte (l'étirement).
      if (poidsDuCorps && ETATS_DE_TEST[etat] === true && haut && haut.charge === null && zone !== null) {
        var niveaux = niveauxDesDeuxDernieres();
        var seuilLest = seuilDeMarche(zone.haut);
        if (lestReponse === null && lestPossible && niveaux !== null &&
            niveaux[0] >= seuilLest && niveaux[1] >= seuilLest) {
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
      // §10 bis (108) — LA SALLE N'A PAS PLUS LOURD. Le coach voudrait tester
      // le cran au-dessus (ou monter la charge, sous 3 reps) et la salle déclarée
      // n'a rien au-delà : `voisine` rend `null`. Pas de charge introuvable, pas
      // de « cran au-dessus » sans chiffre : on monte en reps à la charge la plus
      // lourde, une de plus que la dernière fois (la règle des coachs quand on ne
      // peut pas ajouter de poids, celle du §9.17), sans ligne haute. Après la
      // chute : un « tenir » reste un « tenir ».
      //
      // §10 bis (16/10/2026) — JUSQU'AU HAUT DE LA FOURCHETTE DE LA ZONE (15 reps sur une isolation), puis le coach
      // MAINTIENT : la ligne à la plus lourde, au plafond (`versLaSalleMax`).
      if (salle && ((ETATS_DE_TEST[etat] === true && haut && haut.charge === null) ||
                    (etat === 'bord' && ligne && ligne.charge === null))) {
        etat = 'salle_max';
        ligne = versLaSalleMax(P);
        haut = null;
        plus = null;
      }
      // §10 bis (108) — ET AUCUNE AUTRE CHARGE QUE LA SALLE N'A. Une ligne que la
      // salle ne fait pas (une charge d'une autre salle, une estimation) s'arrondit
      // à la charge déclarée juste en dessous ; une ligne haute aussi, et si elle
      // n'est plus au-dessus de la ligne, il n'y a plus rien à tester : on monte
      // en reps, comme ci-dessus.
      if (salle) {
        if (ligne && nombre(ligne.charge) !== null && !dansLaSalle(salle, ligne.charge)) {
          ligne = ligneDe(arrondieALaSalle(salle, ligne.charge), ligne.vise);
        }
        if (haut && nombre(haut.charge) !== null && !dansLaSalle(salle, haut.charge)) {
          var h = arrondieALaSalle(salle, haut.charge);
          var sous = ligne ? nombre(ligne.charge) : null;
          if (sous !== null && !(h > sous && !memeCharge(h, sous))) {
            etat = 'salle_max';
            ligne = versLaSalleMax(sous);
            haut = null;
            plus = null;
          } else {
            haut = hautDe(h, haut.vise, haut.k);
          }
        }
      }
      var f = { date: L.debut, reps: repsSaisies(A) };
      // §10 bis (108) — la salle en vigueur : sa charge la plus lourde et son
      // matériel, que la phrase (« la plus lourde de ta salle ») et la feuille
      // « Pourquoi » lisent sans rien recalculer. Absente sans déclaration.
      if (salle) f.salle = { materiel: salle.materiel, max: maxDeLaSalle(salle) };
      // 132 (MOTEUR §10 ter, décision du 22/10/2026) — au bout d'une liste d'élastiques, le sens dit la phrase : sur une
      // aide, le plus léger ; en résistance, le plus fort.
      if (salle && elastique) f.salle.sens = salleDeclaree.aide === true ? 'aide' : 'resistance';
      // §10 bis (16/10/2026) — à la plus lourde : le plafond des reps, et `maintien` quand la dernière séance l'a
      // atteint (la phrase le dit comme un fait : « 30 kg × 15, la plus lourde de ta salle. »).
      if (salle && etat === 'salle_max') {
        var pl = plafondALaSalle(zone, salle);
        if (pl !== null) {
          f.salle.plafond = pl;
          if (niv >= pl) f.salle.maintien = true;
        }
      }
      // 184 (B4) — le matériel, seulement pour la phrase de l'étirement (« Ta barre ne permet pas... »).
      if (etat === 'etirement') f.equipement = equipement === undefined ? null : equipement;
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
      // §9.17 bis (127) — sur une échelle, les deux dernières séances (niveau et charge), pour la carte « marche
      // suivante » du plan.
      if (surEchelle) {
        var deux = deuxDernieresSeances();
        if (deux !== null) f.deuxSeances = deux;
      }
      // ⚠️ `testUnCran` NE SE POSE QUE SUR LE TEST DE LA DERNIÈRE SÉANCE. Le
      // test d'un épisode d'étirement (§9.7) arrive par `plus`, sans lui : on
      // ne juge plus la taille d'un cran qu'on a déjà renoncé à réduire.
      if (testDeL !== null) {
        f.test = faitDuTest(testDeL, L.debut, zone);
        f.testUnCran = voisine(P, 1) === testDeL.charge;
      }
      // L'ancien palier n'intéresse que les états où l'échelle BOUGE.
      if (apresBascule && ETATS_ECHELLE[etat] === true) f.palierPrecedent = Pv;
      if (plus) {
        for (var k in plus) {
          if (Object.prototype.hasOwnProperty.call(plus, k)) f[k] = plus[k];
        }
      }
      // 175 (MOTEUR §9.17 bis, décision du 26/10/2026) — LE PLAFOND SANS LEST : au poids du corps, les reps montent jusqu'à
      // 30 (`PLAFOND_CIBLE`). La ligne à 30 : `vise` (pas encore 30 partout), `atteint` (30 sur toutes les séries) — la
      // phrase ne dit plus « une rep de plus », elle dit le plafond.
      if (etat === 'etirement_reps' && poidsDuCorps && ligne && nombre(ligne.vise) !== null && ligne.vise >= PLAFOND_CIBLE) {
        f.plafondReps = nombre(niv) !== null && niv >= PLAFOND_CIBLE ? 'atteint' : 'vise';
      }
      // 186 — la série hors palier de la dernière séance (single à +15 %, série de test) : le « Pourquoi » la dit. Une clé qui n'est là
      // que si elle a un sens.
      var hp = horsPalierDeLaDerniere(L, ant);
      if (hp !== null) f.horsPalier = hp;
      // 163 — UNE CHARGE JAMAIS FAITE SE DIT APPROCHÉE : la ligne ou le test dont la charge sort du repli du matériel
      // porte `approchee: true`, et le fondement aussi (I51 les lit ensemble). Jamais avec une salle (les élastiques).
      if (!salle && !poidsDuCorps) {
        var marque = false;
        if (ligne && estApprochee(vues, avant, ligne.charge, equipement)) {
          ligne = Object.assign({}, ligne, { approchee: true });
          marque = true;
        }
        if (haut && estApprochee(vues, avant, haut.charge, equipement)) {
          haut = Object.assign({}, haut, { approchee: true });
          marque = true;
        }
        if (marque) f.approchee = true;
      }
      return {
        etat: etat, zone: zone === null ? null : zone.cle, palier: P, niveau: niv,
        n: n, ligne: ligne, haut: haut, fondement: f
      };
    }
    function ligneDe(charge, vise) { return { charge: charge, vise: vise }; }
    function hautDe(charge, vise, k) { return { charge: charge, vise: vise, k: k }; }
    // §10 bis (16/10/2026) — la ligne à la plus lourde de la salle : une rep de plus que la dernière fois, jusqu'au
    // plafond (`plafondALaSalle`) ; au plafond, le plafond.
    function versLaSalleMax(charge) {
      var pl = plafondALaSalle(zone, salle);
      return ligneDe(charge, cible(pl === null ? niv + 1 : Math.min(niv + 1, pl)));
    }
    function voisine(depuis, sens) {
      // §9.17 — AU POIDS DU CORPS, IL N'Y A PAS DE CRAN : ni au-dessus, ni en
      // dessous, quel que soit le matériel du catalogue (l'hyperextension y est
      // une « machine », dont le pas de pile n'a rien à dire d'un corps).
      if (poidsDuCorps) return null;
      return voisineSalleComprise(vues, avant, depuis, equipement, sens, salle);
    }
    // §10 bis (108) — le cran en dessous ; avec une salle déclarée qui n'a rien
    // de plus léger, la charge de travail elle-même (« le cran en dessous » sans
    // chiffre serait une charge que la salle n'a pas).
    function cranDessousOuPalier() {
      var c = voisine(P, -1);
      return c === null && salle ? P : c;
    }
    // §9.17 — le niveau validé des DEUX dernières séances (non neutres), de la
    // plus ancienne à la plus récente ; `null` s'il n'y en a qu'une, ou si l'une
    // n'a pas de niveau. Le niveau se calcule sans la chute (§9.2 bis).
    //
    // 149 (23/10/2026, décision d'Aurélien, 13 h 10) — EN FRANC, UNE SÉANCE SUFFIT (la carte du lest comme la carte
    // « marche suivante ») : « deux séances de suite » devient « la dernière séance ». Les deux entrées valent alors
    // la dernière séance (`[b, b]`) : la carte, ses invariants (I29, I49, I50) et les deux ronds lisent une forme
    // inchangée. `prudent` et `normal` : inchangés.
    function niveauxDesDeuxDernieres() {
      if (ant.length < (reglage === 'franc' ? 1 : 2)) return null;
      var b = niveauValide(seriesAuPalier(ant[ant.length - 1]));
      if (reglage === 'franc') return b === null ? null : [b, b];
      var a = niveauValide(seriesAuPalier(ant[ant.length - 2]));
      return a === null || b === null ? null : [a, b];
    }
    // §9.17 bis (127) — les MÊMES deux séances, avec leur charge (le palier : 0 au poids du corps, négatif pour une
    // aide) : « deux séances à la même aide » se lit dessus. `null` comme `niveauxDesDeuxDernieres`.
    function deuxDernieresSeances() {
      var niveaux = niveauxDesDeuxDernieres();
      if (niveaux === null) return null;
      var deux = reglage === 'franc' ? [ant[ant.length - 1], ant[ant.length - 1]] : [ant[ant.length - 2], ant[ant.length - 1]];
      return deux.map(function (se, i) {
        return { niveau: niveaux[i], charge: nombre(se.palier) };
      });
    }
    function comptees(s) {
      var r = compter(s);
      return r === null ? null : r;
    }
    // 169 — la séance d'AVANT (du même couple, hors séances allégées : elles sont neutres) finissait-elle déjà au haut de la
    // zone, à la même charge, avec une réserve notée sous la visée ? C'est la « première fois » de la garde.
    function precedenteAuHautSansMarge(prec, charge, haut, visee) {
      if (prec === null || nombre(prec.seance.palier) !== charge) return false;
      var rs = prec.seance.retenues || [];
      var d = rs.length ? rs[rs.length - 1] : null;
      if (d === null || nombre(d.charge_kg) !== charge) return false;
      var r = Palier().reserveDeSerie(d), n = comptees(d);
      return r !== null && n !== null && n >= haut && r < visee;
    }
    // 174 — LA RÈGLE DE BORD AVEC CHARGE (MOTEUR §9.1.2). Rend la consigne ; son état (`bord`, `bord_garde`, `bord_recul`,
    // `bord_vague`) et ce qu'elle porte pour la suite (`_bord`, non énumérable : ni le fondement ni les cas de fichier ne le
    // voient) : le meilleur palier de la série de séances sous 3 reps, le nombre de séances sans monter, un recul en cours.
    function consigneDeBord() {
      var prof = nombre(opt.bordProf) || 0;
      // La consigne que L a REÇUE (sa visée, son état). Au-delà de BORD_PROFONDEUR séances d'historique, on cesse de
      // remonter : la ratée ne se juge plus, la série repart de L (le coût reste borné).
      var rk = null;
      if (prof < BORD_PROFONDEUR) {
        var brute = anterieures(seances, avant), iL = -1;
        for (var q = brute.length - 1; q >= 0; q--) {
          if (instant(brute[q].debut) === instant(L.debut)) { iL = q; break; }
        }
        if (iL >= 0) {
          rk = consigneDeLaSeance(brute, iL, avant, { reglage: reglage, equipement: equipement, correction: correction,
            salle: salleDeclaree, bordProf: prof + 1 });
        }
      }
      var visees = rk && rk.ligne ? nombre(rk.ligne.vise) : null;
      var faites = A.map(function (s) { return nombre(s.reps); }).filter(function (r) { return r !== null; });
      var plusBas = faites.length ? Math.min.apply(null, faites) : null;
      // ⚠️ SUR LES REPS SAISIES, pas les comptées : « à fond » compte une rep de moins (§17.4), et ce n'est pas une barre ratée.
      var ratee = visees !== null && plusBas !== null && plusBas < visees;
      var prec = rk && rk._bord ? rk._bord : null;
      var meilleur, sans, recul;
      if (prec === null || rk.etat === 'bord_vague') {
        meilleur = ratee ? null : P; sans = 0; recul = ratee;
      } else if (!ratee && (prec.meilleur === null || (P > prec.meilleur && !memeCharge(P, prec.meilleur)))) {
        meilleur = P; sans = 0; recul = false;
      } else if (!ratee && prec.recul && (memeCharge(P, prec.meilleur) || P > prec.meilleur)) {
        // Retrouver son meilleur après un recul n'est pas une séance qui stagne.
        meilleur = prec.meilleur; sans = 0; recul = false;
      } else {
        meilleur = prec.meilleur; sans = prec.sans + 1; recul = prec.recul || ratee;
      }
      // Le COMPTE LONG (commit 3 de 174) : les séances de la série sans dépasser son record, que la « vague » ne remet pas à
      // zéro (`sans` repart à chaque vague). `record` : la charge la plus haute de la série ; `aRecule` : un recul ou une
      // vague a eu lieu depuis le dernier record. Retrouver son record après un recul ne compte pas, comme pour `sans`.
      var record, total, aRecule, repsRecord, depuisRecord;
      if (prec === null) {
        record = P; total = 0; aRecule = ratee; repsRecord = niv; depuisRecord = L.debut;
      } else if (!ratee && P > prec.record && !memeCharge(P, prec.record)) {
        record = P; total = 0; aRecule = false; repsRecord = niv; depuisRecord = L.debut;
      } else if (!ratee && prec.recul && memeCharge(P, prec.record)) {
        record = prec.record; total = prec.total; aRecule = prec.aRecule;
        repsRecord = prec.repsRecord; depuisRecord = prec.depuisRecord;
      } else {
        record = prec.record; total = prec.total + 1; repsRecord = prec.repsRecord; depuisRecord = prec.depuisRecord;
        aRecule = prec.aRecule || ratee || rk.etat === 'bord_vague' || rk.etat === 'bord_recul';
      }
      var etatSuite = { meilleur: meilleur, sans: sans, recul: recul, record: record, total: total, aRecule: aRecule,
                        repsRecord: repsRecord, depuisRecord: depuisRecord };
      function fin(etat, ligne, plus) {
        var r = rendre(etat, ligne, null, plus);
        if (r && typeof r === 'object') Object.defineProperty(r, '_bord', { value: etatSuite, enumerable: false });
        return r;
      }
      var vise = ratee ? visees : niv;
      // Trois séances de suite sans monter au-dessus du meilleur : on repart du cran le plus proche de P × 0,95, au plus
      // bas le cran en dessous.
      if (sans >= BORD_SEANCES_SANS_MONTER) {
        var cur = cranSousProcheDe(voisine, P, P * BORD_VAGUE);
        if (cur === null) cur = P;
        return fin('bord_vague', ligneDe(cur, vise), { bord: { charge: P, reps: niv, depuis: sans, vers: cur } });
      }
      if (ratee) {
        var bas = voisine(P, -1);
        if (bas === null) bas = P;
        return fin('bord_recul', ligneDe(bas, visees), { bord: { charge: P, faites: plusBas, visees: visees } });
      }
      // Toutes les reps visées avec une réserve notée sous la visée : on garde la charge, UNE séance (la 169, même sortie).
      var derniere = L.retenues && L.retenues.length ? L.retenues[L.retenues.length - 1] : null;
      if (derniere !== null && A.length && A[A.length - 1] === derniere && effortViseEligible(P)) {
        var Rb = Palier().reserveDeSerie(derniere);
        var Vb = reserveVisee({ zone: 'lourd', role: 'ligne', reglage: reglage });
        if (Rb !== null && Vb !== null && Rb < Vb && !debutant && !precedenteAuHautSansMarge(precedente, P, vise, Vb)) {
          return fin('bord_garde', ligneDe(P, vise), { bord: { charge: P, reps: nombre(derniere.reps), reserve: Rb } });
        }
      }
      return fin('bord', ligneDe(voisine(P, 1), niv), null);
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
        ligneDe(poidsDuCorps || aide || elastique ? P : repliDeReprise(P, cranDessousOuPalier()), viseReprise), null, borne);
    }

    // 4. La règle de bord : sous 3 reps d'habitude, il n'y a plus de zone. On
    // monte la charge AUX MÊMES REPS — la variabilité journalière des maximaux
    // dépasse l'écart entre une rep et deux (§9.1.2).
    //
    // §9.17 — Au poids du corps il n'y a pas de charge à monter : les reps
    // continuent, comme l'étirement (une de plus, sans zone ni ligne haute).
    if (zone === null) {
      if (poidsDuCorps) return rendre('etirement_reps', ligneDe(P, cible(niv + 1)), null);
      // 174 (26/10/2026, décision d'Aurélien, MOTEUR §9.1.2) — LE COACH SAIT RECULER : une barre ratée (des reps faites sous
      // les reps visées par la consigne reçue) fait reculer d'un cran, aux reps visées ; trois séances sans monter font
      // repartir plus bas ; une réserve notée sous la visée garde la charge une séance. Le 0 en réserve seul ne fait jamais
      // reculer : la ratée se lit sur les reps SAISIES, jamais sur les reps comptées. Une aide garde la règle d'avant.
      if (!aide) return consigneDeBord();
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
      // 175 — LE GROS CRAN : le test du cran irréductible (T est le plus petit cran au-dessus de P) se valide au plancher.
      var c1Gros = voisine(P, 1);
      var gros = c1Gros !== null && !memeCharge(c1Gros, T) && c1Gros < T ? null : grosCran(P, T, zone, isolation);
      var seuilTest = gros ? gros.plancher : lo;

      if (lvl >= seuilTest) {
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
          return rendre('garde', ligneDe(P, vise), hautDe(T, cible(Math.min(lvl + 1, hi)), k),
            lvl < lo ? { cranGros: Object.assign({ valide: true, niveau: lvl }, gros) } : null);
        }
        // Normal et Franc : au BAS de la zone le test est gardé — il a passé,
        // mais tout juste ; au-dessus du bas, il gagne une série de plus.
        // 175 — validé au plancher d'un gros cran (sous le bas de la zone) : la charge reste T, la double progression reprend à T.
        if (lvl < lo) {
          return rendre('garde', ligneDe(P, vise), hautDe(T, cible(lvl + 1), k),
            { cranGros: Object.assign({ valide: true, niveau: lvl }, gros) });
        }
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
        //
        // 175 — UN GROS CRAN : la cible monte de 2 reps par essai raté (au plus haut + 6, jamais plus de 30), au lieu de
        // compter les reps perdues ; au plafond ou après deux essais ratés, le plan pose la carte des leviers.
        var cibleEtirement = cible(hi + niv - lvl);
        var plusEtirement = null;
        if (gros) {
          var rateesG = Math.max(1, rates.length);
          cibleEtirement = cibleDuGros(zone, rateesG);
          plusEtirement = { cranGros: Object.assign({ ratees: rateesG, plafond: cibleMaxDuGros(zone),
            carte: rateesG >= GROS_ESSAIS_AVANT_LEVIERS || cibleEtirement >= cibleMaxDuGros(zone) }, gros) };
        }
        if (niv >= cibleEtirement) {
          return rendre('retest', ligneDe(P, niv), hautDe(T, gros ? gros.plancher : lo, 1),
            Object.assign({ cible: cibleEtirement }, plusEtirement || {}));
        }
        return rendre('etirement', ligneDe(P, cible(Math.min(niv + 1, cibleEtirement))), null,
          Object.assign({ cible: cibleEtirement }, plusEtirement || {}));
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
        var faitEpisode = { test: faitDuTest(episode.test, episode.debut, zone), cible: cibleEnCours };
        // 175 — un gros cran : la cible suit le nombre d'essais ratés, pas les reps perdues.
        var grosEnCours = grosCran(P, episode.test.charge, zone, isolation);
        if (grosEnCours) {
          var rateesEnCours = Math.max(1, rates.length);
          cibleEnCours = cibleDuGros(zone, rateesEnCours);
          faitEpisode.cible = cibleEnCours;
          faitEpisode.cranGros = Object.assign({ ratees: rateesEnCours, plafond: cibleMaxDuGros(zone),
            carte: rateesEnCours >= GROS_ESSAIS_AVANT_LEVIERS || cibleEnCours >= cibleMaxDuGros(zone) }, grosEnCours);
        }
        if (niv >= cibleEnCours) {
          return rendre('retest', ligneDe(P, niv), hautDe(episode.test.charge, grosEnCours ? grosEnCours.plancher : lo, 1), faitEpisode);
        }
        return rendre('etirement', ligneDe(P, cible(Math.min(niv + 1, cibleEnCours))), null,
          faitEpisode);
      }
    }

    // 9. LE DÉCLENCHEUR DU RÉGLAGE (§9.8) — les trois vitesses.
    var declenche;
    // 154 (§9.26) — L'EFFORT VISÉ, lu sur la DERNIÈRE série de travail de la dernière séance, faite au moins au bas de
    // la zone (la visée d'une ligne n'est pas gardée sur la série : le bas de la zone en tient lieu). Réserve notée
    // R, visée V : R ≥ V + 2 → le test, même sous le haut de la zone ; R < V → pas de montée sur sa foi ; sinon rien.
    var effortVise = null;
    var derniereRetenue = L.retenues && L.retenues.length ? L.retenues[L.retenues.length - 1] : null;
    if (derniereRetenue !== null && A.length && A[A.length - 1] === derniereRetenue && effortViseEligible(P)) {
      var Rn = Palier().reserveDeSerie(derniereRetenue);
      var Vn = reserveVisee({ zone: zone.cle, role: 'ligne', reglage: reglage });
      var repsN = comptees(derniereRetenue);
      if (Rn !== null && Vn !== null && repsN !== null && repsN >= lo) {
        if (Rn >= Vn + RESERVE_ECART) {
          effortVise = { effet: 'test', charge: P, reps: nombre(derniereRetenue.reps), reserve: Rn, visee: Vn };
        } else if (Rn < Vn && !debutant) {
          // 169 — LA SORTIE : la garde ne dure qu'une séance au haut de la zone. Si la séance d'avant, à la même charge,
          // finissait déjà au haut avec R < V, la garde a déjà eu lieu : le coach pose le test, quelle que soit la réserve.
          var deja = repsN >= hi && precedenteAuHautSansMarge(precedente, P, hi, Vn);
          effortVise = { effet: deja ? 'test' : 'garde', charge: P, reps: nombre(derniereRetenue.reps), reserve: Rn, visee: Vn,
                         auHaut: repsN >= hi, deja: deja };
          if (deja) effortVise.sortie = true;
        }
      }
    }
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
    // R < V ne change rien quand la montée n'avait pas lieu : le fait n'est écrit que s'il a RETENU quelque chose.
    if (effortVise !== null) {
      if (effortVise.effet === 'garde') {
        if (declenche) declenche = false;
        else effortVise = null;
      } else if (effortVise.sortie === true) {
        // 169 — la sortie ne force rien qu'une montée déjà due : sans le déclencheur du réglage, rien à poser.
        if (!declenche) effortVise = null;
      } else {
        declenche = true;
      }
    }
    if (!declenche) {
      return rendre('progression', ligneDe(P, vise), null,
        effortVise !== null && effortVise.effet === 'garde' ? { effortVise: effortVise } : null);
    }

    var c1 = voisine(P, 1);
    var saut = c1;
    // ⚠️ `preuve` NE SE NOTE QUE SI LE DOUBLE SAUT A ÉTÉ PRIS. Une preuve
    // trouvée puis refusée par la borne des 10 % (F3) ne se dit pas : la
    // phrase annoncerait « on teste deux crans » sur une consigne d'un cran.
    var preuveRetenue = null;
    // §9.17 — ET PAS DE DOUBLE SAUT SUR UNE AIDE : deux crans d'aide en moins
    // d'un coup ne sont pas « 10 % de la charge » (une aide n'est pas une
    // charge qu'on pèse en pourcentage, I30).
    // 132 (§10 ter) — sur un élastique noté par nom, la borne des 10 % ne laisse jamais passer deux crans : au plus 10
    // élastiques, des charges virtuelles de 1 à 10, et deux crans font toujours plus de 10 % (rapporté, prompt 132 —
    // aucune garde à ajouter : elle ne pourrait rien changer).
    // 186 (décision d'Aurélien du 29/10/2026, MOTEUR §9.1.2 / §9.8) — LE DÉPASSEMENT : de combien le niveau tenu passe le haut de
    // la zone décide du nombre de crans. +1 à +2 reps : un cran. Franc : deux crans dès +3 (ou l'effort « facile » / une réserve
    // plus grande que visée, la preuve d'avant). Normal : deux crans dès +6 reps ou +50 % au-dessus du haut. Au double du haut,
    // trois crans au plus (Franc et Normal). Prudent : un cran. TOUT saut de plusieurs crans est plafonné à +15 % de la
    // charge de travail (+10 % pour un débutant, `moins_1_an` ; le profil ne dit pas « sénior » : aucun plafond à part pour lui).
    // Remplace la borne des 10 % de Franc (« deux crans seulement s'ils restent sous 10 % », 19/09/2026).
    var depasse = niv !== null && niv > hi ? niv - hi : 0;
    var cransVoulus = 1, preuveDe = null;
    if (c1 !== null && !aide && reglage !== 'prudent') {
      if (reglage === 'franc') {
        var haut3 = depasse >= PREUVE_DEPASSEMENT || auMoins(A, hi + PREUVE_DEPASSEMENT);
        var facile = A.some(function (s) { return Palier().cranDeSerie(s) === 'facile'; }) ||
          (effortVise !== null && effortVise.effet === 'test' && effortVise.sortie !== true);
        if (haut3 || facile) { cransVoulus = 2; preuveDe = haut3 ? 'haut' : 'facile'; }
      } else if (depasse >= DEPASSEMENT_NORMAL_REPS || (niv !== null && niv >= hi * (1 + DEPASSEMENT_NORMAL_PART))) {
        cransVoulus = 2; preuveDe = 'haut';
      }
      if (niv !== null && niv >= 2 * hi) { cransVoulus = 3; preuveDe = 'haut'; }
    }
    // 191 — LA PRUDENCE DE MONTÉE : le plafond (10 % au lieu de 15 %) et, pour le débutant de 50 ans et plus, UN CRAN À LA FOIS.
    var plafondSaut = prudence.plafond;
    var cransPris = 1;
    var prudenceDit = null;
    // Le saut que la prudence a empêché : ce que le plafond ordinaire (15 %) et deux ou trois crans auraient permis.
    var sautSansPrudence = function (voulus) {
      var ch = [c1];
      for (var k0 = 2; k0 <= voulus; k0++) {
        var sv = ch[ch.length - 1] === null ? null : voisine(ch[ch.length - 1], 1);
        if (sv === null) break;
        ch.push(sv);
      }
      for (var k1 = ch.length; k1 >= 2; k1--) if (auCentieme(ch[k1 - 1] - P) <= auCentieme(P * PLAFOND_SAUT)) return k1;
      return 1;
    };
    if (cransVoulus > 1 && prudence.unCran) {
      // Un cran seul reste permis : la prudence ralentit la montée, elle ne la bloque pas.
      if (sautSansPrudence(cransVoulus) > 1) prudenceDit = 'un_cran';
      cransVoulus = 1; preuveDe = null;
    }
    if (cransVoulus > 1) {
      var chaine = [c1];
      for (var kc = 2; kc <= cransVoulus; kc++) {
        var suiv = chaine[chaine.length - 1] === null ? null : voisine(chaine[chaine.length - 1], 1);
        if (suiv === null) break;
        chaine.push(suiv);
      }
      for (var kp = chaine.length; kp >= 2; kp--) {
        if (auCentieme(chaine[kp - 1] - P) <= auCentieme(P * plafondSaut)) { saut = chaine[kp - 1]; cransPris = kp; preuveRetenue = preuveDe; break; }
      }
      if (plafondSaut < PLAFOND_SAUT && cransPris < sautSansPrudence(cransVoulus)) prudenceDit = 'plafond';
    }
    var plusTest = preuveRetenue === null ? {} : { preuve: preuveRetenue, crans: cransPris, depasse: depasse, plafond: plafondSaut, materiel: equipement };
    if (prudenceDit !== null) plusTest.prudence = { quoi: prudenceDit, raison: prudence.raison };
    if (effortVise !== null && effortVise.effet === 'test') plusTest.effortVise = effortVise;
    // 175 — LE GROS CRAN : le test du plus petit cran (une seule marche, jamais un double saut) se joue au plancher.
    var grosPropose = saut !== null && saut === c1 && preuveRetenue === null ? grosCran(P, saut, zone, isolation) : null;
    if (grosPropose) {
      plusTest.cranGros = grosPropose;
      return rendre('test_propose', ligneDe(P, vise), hautDe(saut, grosPropose.plancher, 1), plusTest);
    }
    return rendre('test_propose', ligneDe(P, vise), hautDe(saut, lo, 1), plusTest.preuve || plusTest.effortVise || plusTest.prudence ? plusTest : null);
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
    silence: true, bord: true, bord_garde: true, bord_recul: true, bord_vague: true
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
        var l0 = {
          charge: f.charge === undefined ? null : nombre(f.charge),
          vise: f.vise === undefined ? null : nombre(f.vise),
          zone: Array.isArray(f.zone) ? f.zone.slice() : null,
          source: f.source || 'consigne',
          charges: Array.isArray(f.charges) ? f.charges.slice() : null,
          sourceHaut: f.sourceHaut === undefined ? null : f.sourceHaut,
          role: x.role || null,
          figee: true
        };
        // §9.14 ter (68B) — une ligne « à fond » figée garde ce qu'elle remplaçait.
        if (f.sourceAvant) l0.sourceAvant = f.sourceAvant;
        return l0;
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

  // Deux charges CONNUES égales, au centième ; une charge qui manque n'est égale à rien. La seule arithmétique de
  // « même charge » (124, audit du 16/10/2026, 01 #14) : le plan la lit (`memeChargeOuVides`, deux vides y sont égaux).
  function memeCharge(a, b) {
    return a !== null && b !== null && auCentieme(a) === auCentieme(b);
  }

  // §9.14 bis (68A) — « la suite » d'un message : la ligne suivante telle que
  // la grille la montre (une ligne du coach ou d'élan : sa charge et la
  // fourchette de la zone).
  function suiteDe(p) {
    if (!p) return null;
    return { charge: p.charge === undefined ? null : p.charge, vise: p.vise === undefined ? null : p.vise,
             fourchette: p.source === 'coach' || p.source === 'elan' };
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
    // §9.14 bis (68A) — UNE LIGNE DE TEST se lit sur la ligne elle-même quand
    // elle porte son rôle (le plan de la séance, une ligne figée), sinon sur
    // la disposition de la consigne seule.
    var estTest = function (l, idx) {
      // §9.14 ter (68B) — une ligne « à fond » garde son rôle : un test reste un test.
      var deConsigne = !!l && (l.source === 'consigne' || (l.source === 'a_fond' && l.sourceAvant !== 'retour'));
      if (!deConsigne) return false;
      return l.role !== undefined && l.role !== null ? l.role === 'haut' : roleInitial[idx] === 'haut';
    };
    // §9.14 bis (68A) — LA LIGNE DU PLAN QU'UNE LIGNE D'ÉLAN REMPLACE : celle
    // du plan initial à ce rang. Une ligne d'élan FIGÉE (la série a été faite
    // sous l'élan) ne garde pas la sienne : on la relit comme la couverture
    // l'a posée à sa validation — un test si tous les rangs restants, ce
    // rang compris, étaient des tests (les tests figés avant elle déduits).
    var initial = plan.map(function (p) { return p ? Object.assign({}, p) : p; });
    var kTests = c.haut ? (nombre(c.haut.k) || 0) : 0;
    var lignePlanDe = function (idx) {
      var p0 = initial[idx];
      if (!p0 || !p0.figee || p0.source !== 'elan') return p0 ? Object.assign({}, p0) : p0;
      var testsAvant = 0;
      for (var t0 = 0; t0 < idx; t0++) {
        if (initial[t0] && initial[t0].figee && roleInitial[t0] === 'haut') testsAvant++;
      }
      var test = !!c.haut && kTests - testsAvant >= n - idx;
      var src0 = test ? c.haut : c.ligne;
      var l0 = ligneDePlan(nombre(src0.charge), nombre(src0.vise), null, 'consigne');
      l0.role = test ? 'haut' : 'ligne';
      return l0;
    };
    var clos = false;        // une montée, ou un refus : plus de proposition dans ce bloc
    // §9.14 bis (68A, N14) — UN REFUS : plus rien du tout jusqu'au bout du bloc,
    // ni élan ni « plus léger ». Une montée, elle, ne ferme que les propositions.
    var refus = false;
    // « Une fois par exercice » (N18) : retenu même quand rien n'est dit.
    var legerDit = false, pasEncoreDit = false, effortDit = false;
    var attente = null;
    var revision = 0;
    var message = null;
    var liste = (faites || []).slice(0, n);

    for (var i = 0; i < liste.length; i++) {
      var s = liste[i] || {};
      var charge = nombre(s.charge_kg);
      var reps = nombre(s.reps);
      var comptees = compter(s);
      // §9.14 ter (68B) — « À FOND » (RPE 10 ou « reste 0 », un seul endroit :
      // `cranDeSerie`) : tenue, mais sans marge. Ni élan, ni proposition, ni
      // « ton test arrive » ; une proposition prise à fond ne garde pas sa charge.
      var aFond = Palier().cranDeSerie(s) === 'max';
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
        if (!prise) { refus = true; continue; }   // refus : le coach se tait jusqu'au bout du bloc

        if (comptees !== null && comptees >= z.bas && !aFond) {
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
          // §9.14 ter (68B) — PRISE À FOND : le même retour, mais la phrase dit
          // le fait (« … à fond : la suite revient à 79 kg × 12 ») quand les
          // reps faites sont dans la zone. `a_fond` n'existe que vrai.
          for (var r = i + 1; r < n; r++) {
            if (plan[r].figee) continue;
            plan[r] = ligneDePlan(P, nombre(c.ligne.vise), null, 'retour');
          }
          if (!derniere) {
            message = { type: 'pas_encore', rang: i + 1, charge: charge, reps: reps, palier: P };
            if (aFond && reps !== null && reps >= z.bas) {
              message.a_fond = true;
              message.suite = suiteDe(plan[i + 1]);
            }
          }
        }
        continue;
      }
      if (refus) continue;
      // Une autre ligne du coach (la montée tenue l'a posée) ne se commente
      // pas : §9.14 la régit, et elle ferme les propositions.
      if (plan[i].source === 'coach') { clos = true; continue; }

      // ── §9.14 bis (68A) — QUAND LA SÉRIE S'ÉCARTE DE SA LIGNE ──────────────
      // La série se compare à la charge de SA ligne dans le plan courant.
      var lig = plan[i];
      // L'élan dure tant que tu suis (N15) : une série plus légère qu'une ligne
      // d'élan le termine. Les lignes d'élan suivantes non figées reviennent à
      // la ligne du plan qu'elles remplaçaient (un test redevient un test), et
      // la série se compare à celle qu'elle remplaçait.
      if (lig.source === 'elan' && charge !== null && nombre(lig.charge) !== null &&
          charge < nombre(lig.charge) && !memeCharge(charge, lig.charge)) {
        for (var e = i + 1; e < n; e++) {
          if (plan[e].figee || plan[e].source !== 'elan') continue;
          plan[e] = lignePlanDe(e);
        }
        lig = lignePlanDe(i);
      }
      var prevue = lig.charge === undefined ? null : nombre(lig.charge);
      if (charge !== null && prevue !== null && charge > prevue && !memeCharge(charge, prevue)) {
        // PLUS LOURDE QUE SA LIGNE, de son propre chef : une montée.
        clos = true;
        if (comptees !== null && comptees >= z.bas && !aFond) {
          // ÇA TIENT : l'élan (68B : jamais à fond — sans marge, la suite
          // reste au plan, et « pas encore » le dit, « à fond »). Les lignes suivantes non figées plus légères
          // passent à cette charge (tests compris, jamais une ligne du coach),
          // fourchette de la zone, pari au bas. Lourd : une ligne d'élan dans
          // tout l'exercice, au plus (le garde-fou du §9.7).
          var nbElan = plan.filter(function (q) { return !!q && q.source === 'elan'; }).length;
          var changees = 0, retour = null;
          for (var j2 = i + 1; j2 < n; j2++) {
            var q2 = plan[j2];
            if (q2.figee || q2.source === 'coach') continue;
            var c2 = nombre(q2.charge);
            if (c2 !== null && (c2 > charge || memeCharge(c2, charge))) continue;
            if (z.cle === 'lourd' && nbElan >= 1) break;
            // La charge qu'avait la ligne JUSTE AVANT cette série (N17).
            if (retour === null) retour = c2;
            plan[j2] = ligneDePlan(charge, z.bas, bornes.slice(), 'elan');
            nbElan++;
            changees++;
          }
          // Aucune ligne changée (la suite est déjà plus lourde) : silence
          // (N13) — un libellé ne contredit jamais son chiffre.
          if (changees > 0) {
            revision += 1;
            if (!derniere) {
              var effortNote = (s.rpe !== null && s.rpe !== undefined) ||
                (s.ressenti !== null && s.ressenti !== undefined);
              if (reps === z.bas && !effortNote && !effortDit) {
                message = { type: 'effort_suggere', rang: i + 1, charge: charge, reps: reps,
                            palier: P, retour: retour };
                effortDit = true;
              } else {
                var toutes = true;
                for (var t4 = i + 1; t4 < n; t4++) {
                  if (!memeCharge(nombre(plan[t4].charge), charge)) { toutes = false; break; }
                }
                message = { type: 'elan', rang: i + 1, charge: charge, reps: reps,
                            series: changees, toutes: toutes };
              }
            }
          }
        } else {
          // ÇA NE TIENT PAS : le plan ne change pas. « Pas encore », une fois.
          if (!derniere && !pasEncoreDit) {
            message = { type: 'pas_encore_soi', rang: i + 1, charge: charge, reps: reps, palier: P,
                        a_fond: reps !== null && reps >= z.bas, suite: suiteDe(plan[i + 1]) };
          }
          pasEncoreDit = true;
        }
        continue;
      }
      // PLUS LÉGÈRE QUE SA LIGNE : le plan ne change pas ; une phrase, une
      // fois. SAUF une série à la charge de travail sur une ligne de test :
      // c'est le test remis à plus tard, qui suit la règle d'aujourd'hui
      // (§9.14 : le test qui suit, la proposition, ou rien — N16).
      var testRemis = estTest(lig, i) && memeCharge(charge, P);
      if (charge !== null && prevue !== null && charge < prevue && !memeCharge(charge, prevue) && !testRemis) {
        if (!legerDit && !derniere) {
          message = { type: 'plus_leger', rang: i + 1, charge: charge, reps: reps, prevue: prevue,
                      suite: suiteDe(plan[i + 1]) };
        }
        legerDit = true;
        continue;
      }

      // Toute montée clôt les propositions (P1). Un test prévu suit la
      // consigne.
      if (charge !== null && charge > P && !memeCharge(charge, P)) { clos = true; continue; }
      if (clos) continue;
      // §9.14 ter (68B) — la charge ne monte jamais sur la foi d'une série à
      // fond : ni proposition, ni « ton test arrive avec de la marge ».
      if (aFond) continue;

      // Une série au palier, sur une ligne encore celle de la consigne, qui
      // n'est pas la dernière : 3 reps comptées de plus que visé, on propose.
      if (derniere || !memeCharge(charge, P) || plan[i].source !== 'consigne') continue;
      var vise = plan[i].vise;
      if (comptees === null || vise === null) continue;
      var marge = comptees - vise;
      if (marge < SEUIL_REACTION) continue;
      // §10 bis (108) — LA SALLE N'A RIEN DE PLUS LOURD : pas de proposition.
      // Jamais une charge introuvable, ni « le cran au-dessus » sans chiffre.
      if (ctx.salleMax === true) continue;
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

    // §9.14 ter (68B) — LA SUIVANTE, UNE REP DE MOINS : après la dernière
    // série validée, à fond (charge C, r reps), la ligne suivante non figée, ni
    // du coach ni d'élan, à la charge C, qui vise plus que r − 1 ≥ 1, vise r − 1
    // (source `a_fond`, son rôle gardé). Après TOUT le reste de l'étape de
    // cette série (la référence l'applique en dernier, B09). Les séries
    // d'avant gardent la leur par leurs lignes figées (relues dans les paris).
    // Le message seulement si aucun autre ne l'est.
    var k = liste.length - 1;
    if (k >= 0 && k + 1 < n && Palier().cranDeSerie(liste[k] || {}) === 'max') {
      var sk = liste[k];
      var ck = nombre(sk.charge_kg), rk = nombre(sk.reps);
      var x = plan[k + 1];
      var vk = rk === null ? null : rk - 1;
      if (x && !x.figee && x.source !== 'coach' && x.source !== 'elan' && ck !== null &&
          memeCharge(nombre(x.charge), ck) && vk !== null && vk >= 1 &&
          nombre(x.vise) !== null && nombre(x.vise) > vk) {
        plan[k + 1] = Object.assign({}, x, { vise: vk, source: 'a_fond',
          sourceAvant: x.source === 'a_fond' ? x.sourceAvant : x.source });
        revision += 1;
        if (message === null) {
          message = { type: 'a_fond_suite', rang: k + 1, charge: ck, reps: rk, vise: vk };
        }
      }
    }
    // « La suite » d'un message se lit sur les lignes APRÈS cette règle (B09).
    if (message !== null && message.suite !== undefined) message.suite = suiteDe(plan[message.rang]);

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
  // §10 bis (108) — `salle` : la salle déclarée pour l'exercice, ou `null`. En
  // vigueur, le cran et la seconde charge sont des charges qu'elle fait ; sans
  // rien au-delà de la charge proposée, `salleMax` : la réaction se tait (aucune
  // charge introuvable, aucun « cran au-dessus » sans chiffre).
  function contexteReaction(seances, avant, consigne, equipement, programme, salleDeclaree) {
    var vide = { cran: null, haut: null };
    if (!consigne || !consigne.ligne) return vide;
    var base = nombre(consigne.ligne.charge);
    if (base === null) base = nombre(consigne.palier);
    if (base === null) return vide;
    // §9.17 — PAS DE CRAN AU POIDS DU CORPS : la réaction se tait (`reactionPour`),
    // et le contexte ne cherche pas une charge à lui proposer.
    if (base === 0) return vide;
    var el = salleDElastiques(salleDeclaree);
    var salle = base > 0 || (base < 0 && el) ? salleEnVigueur(salleDeclaree || null, base) : null;
    var vues = (seances || []).map(vueDeSeance);
    var cran = voisineSalleComprise(vues, avant, base, equipement, 1, salle);
    if (salle && cran === null) return { cran: null, haut: null, salleMax: true };
    var cranSuivant = cran === null ? null : voisineSalleComprise(vues, avant, cran, equipement, 1, salle);
    var ant = anterieures(vues, avant);
    var charges = [];
    ant.forEach(function (se) {
      chargesDe(se).forEach(function (c) {
        // §10 bis — le saut habituel se ramène à une charge que la salle fait.
        if (charges.indexOf(c) < 0 && (!salle || dansLaSalle(salle, c))) charges.push(c);
      });
    });
    return {
      cran: cran,
      // §9.17 — ET PAS DE SECONDE CHARGE SUR UNE AIDE : « ou 130 kg, si tu te
      // sens bien ? » compare à 10 % de la charge, et une aide n'en est pas une
      // (I30). Le cran seul reste proposé : moins d'aide, c'est monter.
      // 132 — ni sur un élastique noté par nom (§10 ter) : la seconde charge se lit en proportion de la charge.
      haut: base < 0 || el ? null : secondeCharge({ palier: base, cran: cran, cranSuivant: cranSuivant,
        sauts: sautsDeMontee(ant), charges: charges,
        programme: programme === undefined ? null : programme })
    };
  }

  // §9.11 (49-R2, delta 49-4) — LA RÉVISION DE CHAQUE LIGNE, lue sur le plan
  // seul : la première ligne du coach porte la révision 1 (la série
  // proposée), les suivantes la révision 2 (passées à la charge montée). La
  // consigne et le retour au palier gardent la révision 0 : leur pari est
  // celui de l'ouverture.
  //
  // §9.14 bis (68A) — UNE LIGNE D'ÉLAN EST UNE RÉVISION : la révision 2, comme
  // les lignes passées à une charge montée. Elle ne compte pas pour la
  // première ligne du coach.
  function revisionsDuPlan(plan) {
    var vu = false;
    return (plan || []).map(function (p) {
      if (p && (p.source === 'elan' || p.source === 'a_fond')) return 2;
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
    if (p.source === 'elan') return [pariDElan(r, liste, j, p, z, fondement, rev, o)];
    if (p.source === 'a_fond') return [pariAFond(r, liste, j, p, z, fondement, rev, o)];
    var iDecl = rev === 1 ? j - 1 : revs.indexOf(1);
    var d = liste[iDecl] || {};
    var comptees = compter(d);
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

  // §9.14 bis (68A) — LE PARI D'UNE LIGNE D'ÉLAN : celui d'une ligne du coach
  // (au bas de la zone, les bornes de la zone), son rôle et sa source `elan`.
  // Son déclencheur est la série plus lourde qui l'a posée : la dernière série
  // faite à sa charge qui n'était pas déjà sur une ligne d'élan à cette charge
  // (une série qui SUIT l'élan ne le déclenche pas).
  function pariDElan(r, liste, j, p, z, fondement, rev, o) {
    var iDecl = -1;
    for (var d = Math.min(liste.length, j) - 1; d >= 0; d--) {
      if (!memeCharge(nombre((liste[d] || {}).charge_kg), nombre(p.charge))) continue;
      if (iDecl < 0) iDecl = d;
      var l = r.plan[d];
      if (!(l && l.source === 'elan' && memeCharge(nombre(l.charge), nombre(p.charge)))) { iDecl = d; break; }
    }
    var dc = liste[iDecl] || {};
    var comptees = compter(dc);
    var viseDecl = r.plan[iDecl] ? nombre(r.plan[iDecl].vise) : null;
    fondement.revision = rev;
    fondement.declencheur = {
      rang: iDecl < 0 ? null
        : (Array.isArray(o.rangs) && o.rangs[iDecl] !== undefined ? o.rangs[iDecl] : iDecl + 1),
      charge: nombre(dc.charge_kg), reps: nombre(dc.reps),
      comptees: comptees,
      marge: comptees === null || viseDecl === null ? null : comptees - viseDecl
    };
    fondement.charges = [p.charge];
    fondement.source = 'elan';
    fondement.role = 'elan';
    return {
      module: MODULE_CONSIGNE,
      exercise_slug: o.slug === undefined ? null : o.slug,
      grandeur: 'reps',
      valeur_predite: z.bas,
      borne_basse: z.bas,
      borne_haute: z.haut,
      fondement: fondement
    };
  }

  // §9.14 ter (68B) — LE PARI D'UNE LIGNE « À FOND » : une révision, qui
  // parie sa visée (les reps de la série à fond moins une), son rôle gardé
  // (`ligne`, `haut` pour un test, `retour`), sa source `a_fond`, et son
  // déclencheur : la série à fond juste avant elle.
  function pariAFond(r, liste, j, p, z, fondement, rev, o) {
    var iDecl = j - 1;
    var dc = liste[iDecl] || {};
    var comptees = compter(dc);
    var viseDecl = r.plan[iDecl] ? nombre(r.plan[iDecl].vise) : null;
    fondement.revision = rev;
    fondement.declencheur = {
      rang: Array.isArray(o.rangs) && o.rangs[iDecl] !== undefined ? o.rangs[iDecl] : iDecl + 1,
      charge: nombre(dc.charge_kg), reps: nombre(dc.reps),
      comptees: comptees,
      marge: comptees === null || viseDecl === null ? null : comptees - viseDecl
    };
    fondement.source = 'a_fond';
    fondement.role = p.sourceAvant === 'retour' ? 'retour' : (o.role === 'haut' ? 'haut' : 'ligne');
    return {
      module: MODULE_CONSIGNE,
      exercise_slug: o.slug === undefined ? null : o.slug,
      grandeur: 'reps',
      valeur_predite: p.vise,
      borne_basse: z.bas,
      borne_haute: z.haut,
      fondement: fondement
    };
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
    // 175 — une charge jamais faite (« ≈ », 163) : la réaction l'écrit comme la consigne (`message.approchee`, posé par le plan
    // quand la charge de la série est la ligne ou le test marqués approchés).
    var fait = chargeFois(m.charge, m.reps, cite(FAIT, { quoi: 'du_jour' }), m.approchee === true);
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
        // §9.14 ter (68B) — prise à fond, dans la zone : le fait, sans « pas encore ».
        if (m.a_fond) return fait + ' à fond' + DEUX_POINTS + 'la suite revient ' + laSuite(m.suite, z) + '.';
        return fait + DEUX_POINTS + 'pas encore. On revient à ' + enKg(m.palier, cite(CIBLE, { role: 'retour' })) + '.';
      // §9.14 ter (68B) — la suivante, une rep de moins.
      case 'a_fond_suite':
        return fait + ' à fond' + DEUX_POINTS + 'la suivante vise ' +
          nombreFr(m.vise, cite(CIBLE, { role: 'suite', champ: 'reps' })) + '.';
      // §9.14 bis (68A) — QUAND LA SÉRIE S'ÉCARTE DE SA LIGNE.
      case 'elan': {
        var a = fait + ', au-dessus de ta charge de travail' + DEUX_POINTS;
        var cE = cite(CIBLE, { role: 'elan' });
        if (m.toutes) return a + 'la suite reste à ' + enKg(m.charge, cE) + '.';
        if (m.series === 1) return a + 'une série de plus à ' + enKg(m.charge, cE) + '.';
        return a + nombreFr(m.series, regle('reaction.series')) + ' séries de plus à ' + enKg(m.charge, cE) + '.';
      }
      case 'effort_suggere':
        return fait + ', pile au bas de ta fourchette. Si c\'était à fond, note-le' + DEUX_POINTS +
          (m.retour === null || m.retour === undefined
            ? 'on revient au cran au-dessus' : 'on revient à ' + enKg(m.retour, regle('reaction.retour'))) +
          ' pour la série suivante. Sinon, on garde ' + enKg(m.charge, cite(CIBLE, { role: 'elan' })) + '.';
      case 'pas_encore_soi':
        return m.a_fond
          ? fait + ' à fond' + DEUX_POINTS + 'la suite reste ' + laSuite(m.suite, z) + '.'
          : fait + DEUX_POINTS + 'pas encore. La suite reste ' + laSuite(m.suite, z) + '.';
      case 'plus_leger': {
        var cF = cite(FAIT, { quoi: 'du_jour' });
        return fait + ', plus léger que prévu. La suite reste ' + laSuite(m.suite, z) + INSECABLE + '; tape ' +
          enKg(m.charge, cF) + ' si tu restes à ' + enKg(m.charge, cF) + ' aujourd\'hui.';
      }
      default:
        return null;
    }
  }

  // « à 79 kg × 12 » pour une ligne, « à 84 kg, vise 10 à 12 » pour une ligne
  // du coach ou d'élan — la ligne suivante comme la grille la montre.
  function laSuite(s, z) {
    var l = s || {};
    var cS = cite(CIBLE, { role: 'suite' });
    var pre = l.charge === null || l.charge === undefined ? 'au ' : 'à ';
    if (l.fourchette && z) {
      return pre + Modele().charge(l.charge, 'cran au-dessus', cS) + ', vise ' +
        nombreFr(z.bas, regle('zone.bas')) + ' à ' + nombreFr(z.haut, regle('zone.haut'));
    }
    // Sans chiffre (68A, décision 7) : « au cran au-dessus, vise 11 ».
    if (l.charge === null || l.charge === undefined) {
      return pre + Modele().charge(null, 'cran au-dessus', cS) + ', vise ' +
        nombreFr(l.vise, cite(CIBLE, { role: 'suite', champ: 'reps' }));
    }
    return pre + Modele().chargeFois(l.charge, l.vise, 'cran au-dessus', cS);
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
  // compte plus pour la précédente). 11 depuis 68A (l'élan : une série plus
  // lourde que sa ligne, qui tient, porte la suite à sa charge — MOTEUR §9.14
  // bis : un pari d'élan, au bas de la zone, sur une ligne qui en avait un autre).
  // 12 depuis 68B (« à fond » en séance — MOTEUR §9.14 ter : la suivante à la
  // même charge vise une rep de moins, un pari `a_fond` ; ni élan ni proposition
  // sur la foi d'une série à fond ; l'observation compte les reps faites).
  // 13 depuis 74 (une série à fond compte ses reps — MOTEUR §17.4, révisé le
  // 11/10/2026 : le niveau validé, le test, l'échelle sur les reps faites ;
  // après elle, quatre plafonds contre le calcul prudent).
  var MODULE_CONSIGNE = 'moteur.consigne';
  var VERSION_CONSIGNE = 13;

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
  function chargeFois(kg, reps, c, approchee) { return Modele().chargeFois(kg, reps, undefined, c, approchee === true); }
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
  // d'autre : `[{ slug, mesure, repos, ch, tr, deg, duree, prim, sec, stab }]` — les
  // chauffes, séries de travail et dégressives comptées, le repos prévu
  // (`null` : porté par l'autre exercice du superset), la durée d'une série de
  // cardio ou de durée, et les muscles principaux, secondaires et stabilisateurs
  // (un tableau, ou « a/b » comme les cas ; `stab` absent vaut vide, 65). `structureDeRoutine` la tire d'une routine de l'app.
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
  // Au moins 3 muscles, dans les TROIS listes — principaux, secondaires et stabilisateurs (65, v2_069). v2_069 a
  // déplacé 176 secondaires vers les stabilisateurs sans changer le total d'aucun exercice : en les comptant,
  // aucun exercice ne change de classe ; sans eux, 26 passeraient de polyarticulaire à isolation.
  var MUSCLES_POLYARTICULAIRE = 3;
  // 188-2 (Iversen 2021) — JAMAIS SOUS 2 SÉRIES : une isolation ne descend plus à 1 (le raccourci d'avant l'y réduisait).
  var PLANCHER_ISOLATION = 2, PLANCHER_COMPOSE = 2;
  // 188-2 — LES REPOS DES ISOLATIONS, étape 2 de l'ordre de compression : d'abord à 90 s, puis à 60 s.
  var REPOS_ISOLATION_HAUT = 90, REPOS_ISOLATION_BAS = 60;
  var EQUIPEMENTS_DES_GRANDS = ['barre'];

  function musclesDe(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return String(v || '').split('/').filter(Boolean);
  }
  function compteDe(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }
  function enDuree(e) { return !!e && (e.mesure === 'temps' || e.mesure === 'distance_temps'); }
  function nombreDeMuscles(e) { return musclesDe(e.prim).length + musclesDe(e.sec).length + musclesDe(e.stab).length; }
  function aDesMuscles(e) { return nombreDeMuscles(e) > 0; }
  // UN POLYARTICULAIRE : au moins 3 muscles principaux, secondaires et
  // stabilisateurs. Une définition, lue par la priorité du raccourci (§9.18) et
  // par les repos par défaut d'« En faire une routine » (ECRAN-SAISIE §7
  // quindecies.4, 52-1) — `e` porte `prim`, `sec` et `stab` (tableaux, ou
  // chaînes « a/b » ; `stab` absent vaut vide).
  function estPolyarticulaire(e) {
    return !!e && nombreDeMuscles(e) >= MUSCLES_POLYARTICULAIRE;
  }
  // UNE ISOLATION (124, audit du 16/10/2026, 01 #15) : un exercice qui a des muscles au catalogue, moins de trois. Un
  // exercice SANS muscle connu (un trou du catalogue) n'est ni l'un ni l'autre : ni la dégressive proposée (§14), ni
  // la fourchette étendue à 15 reps à la plus lourde de la salle (§10 bis) — la même définition aux deux endroits
  // (la salle l'excluait déjà, le plan le traitait en isolation).
  function estIsolation(e) {
    return !!e && aDesMuscles(e) && !estPolyarticulaire(e);
  }
  // 196 (MOTEUR §9.33) — LE REST-PAUSE est permis sur une isolation ou une machine (poulie comprise), jamais à la barre, jamais à un
  // soulevé, jamais sur une mesure en durée. UNE définition, lue par le menu ⋯ d'une série (`app.js`) et par « J'ai peu de temps »
  // en objectif Muscle (`raccourcirRoutine`). `e` : `{ prim, sec, stab, equipement, mesure, slug }`.
  var MINI_SERIES_REST_PAUSE = 2;       // deux mini-séries après la série de travail
  var SERIES_POUR_REST_PAUSE = 3;       // il faut 3 séries de travail pour que 2 deviennent une (3 → 2, la dernière en rest-pause)
  var EQUIPEMENTS_REST_PAUSE = ['machine', 'machine_smith', 'poulie'];
  function peutRestPause(e) {
    if (!e || enDuree(e) || e.equipement === 'barre') return false;
    if (/(^|_)souleve(_|$)/.test(String(e.slug || ''))) return false;
    return EQUIPEMENTS_REST_PAUSE.indexOf(e.equipement) >= 0 || estIsolation(e);
  }
  // 191 (décision d'Aurélien du 30/10/2026) — LES MOUVEMENTS AU POIDS DU CORPS qui comptent comme de grands mouvements : les
  // tractions, les dips, les pompes et le rowing inversé, avec toutes leurs variantes (lestées, assistées, à l'élastique,
  // en supination, déclinées…). Le catalogue n'a pas de colonne qui le dise : le slug, lu par ses mots, comme
  // `THProfil.demandeUneBarreDeTraction`. Raison : la compression retire d'abord les isolations (Iversen 2021), et couper les
  // tractions creuse le tirage, l'équilibre le plus souvent en défaut (188-1).
  var MOTS_DU_POIDS_DU_CORPS = ['traction', 'tractions', 'dip', 'dips', 'pompe', 'pompes'];
  function estUnMouvementAuPoidsDuCorps(slug) {
    var t = String(slug || '').split('_');
    if (t.some(function (m) { return MOTS_DU_POIDS_DU_CORPS.indexOf(m) >= 0; })) return true;
    for (var i = 0; i + 1 < t.length; i++) if (t[i] === 'rowing' && t[i + 1] === 'inverse') return true;
    return false;
  }
  // UN GRAND MOUVEMENT (squat, soulevé, poussée, tirage) — UNE SEULE DÉFINITION (188-2, élargie en 191) : un polyarticulaire
  // à la barre OU au poids du corps (tractions, dips, pompes, rowing inversé et leurs variantes lestées ou assistées). La
  // compression ne lui retire jamais une série ni son repos ; la carte de l'ordre le place en premier ; la ligne du repos long
  // le nomme. Un polyarticulaire à la machine ou aux haltères reste un exercice secondaire : compressible, après toutes les
  // isolations. `e` : `{ prim, sec, stab, equipement, slug }`.
  function estGrandMouvement(e) {
    return !!e && estPolyarticulaire(e) && (EQUIPEMENTS_DES_GRANDS.indexOf(e.equipement) >= 0 || estUnMouvementAuPoidsDuCorps(e.slug));
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
    var ch = compteDe(e.ch), tr = compteDe(e.tr), deg = compteDe(e.deg), rec = compteDe(e.rec);
    if (ch + tr + deg + rec === 0) return 0;
    var repos = e.repos === null || e.repos === undefined ? null : Number(e.repos);
    var t = D.changement;
    if (enDuree(e)) return t + (Number(e.duree) || 0) * tr + (repos || 0) * Math.max(0, tr - 1);
    if (ch > 0) t += ch * D.serie + (ch - 1) * REPOS_ENTRE_CHAUFFES + REPOS_APRES_CHAUFFES;
    t += tr * (D.serie + (repos === null ? D.reposSuperset : repos));
    // 193-1 — une série de recul se fait et se repose comme une série de travail (le repos de l'exercice).
    t += rec * (D.serie + (repos === null ? D.reposSuperset : repos));
    t += deg * D.degressive;
    // 196 — une série rest-pause : deux mini-séries de plus, comme deux dégressives.
    t += compteDe(e.rp) * MINI_SERIES_REST_PAUSE * D.degressive;
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
               ch: compteDe(e.ch), tr: compteDe(e.tr), deg: compteDe(e.deg), rec: compteDe(e.rec), rp: compteDe(e.rp),
               duree: e.duree === undefined ? null : e.duree,
               prim: musclesDe(e.prim), sec: musclesDe(e.sec), stab: musclesDe(e.stab),
               equipement: e.equipement === undefined ? null : e.equipement,
               groupe: e.groupe === undefined ? null : e.groupe };
    });
  }

  // RACCOURCIR JUSQU'À LA CIBLE (§9.18), dans l'ordre, en recalculant à chaque
  // pas et en s'arrêtant dès que l'estimation tient. Rend `{ exercices,
  // journal, duree_s, tient }` : la structure (un exercice retiré ou mis à part
  // y reste, à zéro, à sa place), ce qui a changé et pourquoi, l'estimation, et
  // si la cible tient — une cible inatteignable rend la version la plus courte
  // avec `tient = false` (51-1 bis, T4). Pure ; la structure reçue n'est jamais
  // modifiée.
  //
  // `exemptes` (60-5, R6) : des slugs d'exercices que le raccourci ne touche JAMAIS — ni une série, ni la ligne
  // (le programme construit y met les exercices d'une zone à ménager : « toutes leurs séries gardées », le temps
  // se prend ailleurs). Sans lui (le défaut), rien n'est exempté : le comportement est celui de toujours. Quand
  // il ne reste que des exemptés à couper, la cible n'est pas atteinte : `tient = false`, la durée rendue est la
  // durée RÉELLE.
  // 196 : `options.objectif === 'muscle'` ajoute la première coupe (le rest-pause), avant toutes les autres.
  function raccourcirRoutine(structure, cibleMin, exemptes, options) {
    var r = copieStructure(structure);
    var max = Number(cibleMin) * SECONDES_PAR_MINUTE;
    var journal = [];
    var libres = Array.isArray(exemptes) ? exemptes : [];
    var intouchable = function (e) { return libres.indexOf(e.slug) >= 0; };
    var tient = function () { return dureeEstimee(r) <= max; };
    var fin = function () { return { exercices: r, journal: journal, duree_s: dureeEstimee(r), tient: tient() }; };
    var premier = -1;
    r.forEach(function (e, i) { if (premier < 0 && aDesMuscles(e)) premier = i; });
    var priorite = function (e, i) {
      if (i === premier) return PRIORITE_PREMIER;
      return estPolyarticulaire(e) ? PRIORITE_POLY : PRIORITE_ISOLATION;
    };
    if (tient()) return fin();

    // 0. 196 (MOTEUR §9.33) — en objectif MUSCLE, les 2 dernières séries d'UNE isolation (ou machine) deviennent UNE série rest-pause
    // (jusqu'à l'échec, 15 s, encore, 15 s, encore) : le muscle progresse autant en moins de temps (Enes 2021, Sodal 2023). Avant toute
    // autre coupe ; le bloc de mobilité est déjà retiré (l'appelant). Jamais un exercice sans 3 séries de travail, jamais un
    // exempté ou un grand mouvement ; l'exercice qui y gagne le plus de temps passe d'abord, un seul.
    if (options && options.objectif === 'muscle') {
      var choisi = -1, gainMax = 0;
      r.forEach(function (e, i) {
        if (intouchable(e) || estGrandMouvement(e) || !peutRestPause(e) || e.tr < SERIES_POUR_REST_PAUSE || e.rp > 0 || e.deg > 0 || e.rec > 0) return;
        var avantD = dureeExercice(e);
        var essai = Object.assign({}, e, { tr: e.tr - 1, rp: 1 });
        var g = avantD - dureeExercice(essai);
        if (g > gainMax) { choisi = i; gainMax = g; }
      });
      if (choisi >= 0) {
        r[choisi].tr--; r[choisi].rp = 1;
        journal.push({ quoi: 'rest_pause', i: choisi, slug: r[choisi].slug });
      }
      if (tient()) return fin();
    }

    // 1. le cardio de fin (sans muscle, après le premier rang) : mis à part.
    r.forEach(function (e, i) {
      if (i === 0 || aDesMuscles(e) || e.ch + e.tr + e.deg + e.rec === 0 || intouchable(e)) return;
      journal.push({ quoi: 'cardio_fin', i: i, slug: e.slug });
      e.ch = 0; e.tr = 0; e.deg = 0; e.rec = 0; e.duree = 0;
    });
    if (tient()) return fin();

    // 2. le cardio de début (sans muscle, au premier rang) : 3 minutes.
    var e0 = r[0];
    if (e0 && !intouchable(e0) && !aDesMuscles(e0) && enDuree(e0) && e0.tr > 0 && Number(e0.duree) > DUREE_PAR_DEFAUT.cardioDebut) {
      journal.push({ quoi: 'cardio_debut', i: 0, slug: e0.slug, avant: Number(e0.duree), apres: DUREE_PAR_DEFAUT.cardioDebut });
      e0.duree = DUREE_PAR_DEFAUT.cardioDebut;
    }
    if (tient()) return fin();

    // 3. les dégressives, dans l'ordre de la séance.
    for (var k = 0; k < r.length; k++) {
      if (intouchable(r[k])) continue;
      while (r[k].deg > 0 && !tient()) {
        r[k].deg--;
        journal.push({ quoi: 'degressive', i: k, slug: r[k].slug });
      }
      if (tient()) return fin();
    }

    // 3 bis. 193-1 — les séries de recul, juste après les dégressives et AVANT toute grosse série : une de moins par exercice, dans
    // l'ordre de la séance, jamais la dernière (le recul le plus léger de la séance reste ; on ne les retire pas tous d'office).
    for (var kr = 0; kr < r.length; kr++) {
      if (intouchable(r[kr])) continue;
      while (r[kr].rec > 1 && !tient()) {
        r[kr].rec--;
        journal.push({ quoi: 'recul', i: kr, slug: r[kr].slug });
      }
      if (tient()) return fin();
    }

    // 188-2 — L'ORDRE DE COMPRESSION (Iversen 2021), aux étapes 4 à 7 :
    //   4. grouper des exercices en supersets (deux isolations voisines, sans muscle en commun) ;
    //   5. raccourcir les repos des isolations : à 90 s, puis à 60 s ;
    //   6. une série de moins aux exercices secondaires, JAMAIS sous 2 ;
    //   7. seulement ensuite, retirer une isolation redondante.
    // Jamais un grand mouvement (squat, soulevé, poussée, tirage), jamais un exempté (une priorité, une zone à ménager).
    var libre = function (e) { return !intouchable(e) && !estGrandMouvement(e); };
    var isolationLibre = function (e) { return libre(e) && estIsolation(e) && !enDuree(e) && e.tr > 0; };

    // 4. les supersets : la paire de voisins qui économise le plus (le premier membre perd son repos).
    for (;;) {
      if (tient()) return fin();
      var paire = -1, gain = 0;
      for (var a = 0; a + 1 < r.length; a++) {
        var x = r[a], y = r[a + 1];
        if (!isolationLibre(x) || !isolationLibre(y)) continue;
        if (x.groupe !== null || y.groupe !== null || x.repos === null || x.repos === undefined) continue;
        if (x.prim.some(function (m) { return y.prim.indexOf(m) >= 0; })) continue;
        var g = x.tr * (x.repos - DUREE_PAR_DEFAUT.reposSuperset);
        if (g > gain) { paire = a; gain = g; }
      }
      if (paire < 0) break;
      var numeros = r.map(function (e) { return Number(e.groupe) || 0; });
      var groupe = Math.max.apply(null, numeros.concat([0])) + 1;
      r[paire].groupe = groupe; r[paire + 1].groupe = groupe;
      journal.push({ quoi: 'superset', i: paire, j: paire + 1, slug: r[paire].slug, avec: r[paire + 1].slug, groupe: groupe,
                     avant: r[paire].repos });
      r[paire].repos = null;
    }

    // 5. les repos des isolations : 90 s, puis 60 s (un repos porté par un superset ou sans réglage ne bouge pas).
    [REPOS_ISOLATION_HAUT, REPOS_ISOLATION_BAS].forEach(function (plafond) {
      for (var k2 = 0; k2 < r.length; k2++) {
        if (tient()) return;
        var ex = r[k2];
        if (!isolationLibre(ex) || ex.repos === null || ex.repos === undefined || !(Number(ex.repos) > plafond)) continue;
        journal.push({ quoi: 'repos', i: k2, slug: ex.slug, avant: Number(ex.repos), apres: plafond });
        ex.repos = plafond;
      }
    });
    if (tient()) return fin();

    // 6. une série de travail en moins, à chaque tour : la plus basse priorité, puis le plus de séries, puis le plus loin.
    // Plancher : 2 séries. Un exercice sans muscle n'est jamais coupé, ni un grand mouvement.
    for (;;) {
      if (tient()) return fin();
      var choix = -1, cle = null;
      r.forEach(function (e, i) {
        if (!aDesMuscles(e) || !libre(e)) return;
        var p = priorite(e, i);
        if (e.tr <= (p === PRIORITE_ISOLATION ? PLANCHER_ISOLATION : PLANCHER_COMPOSE)) return;
        var c = [p, -e.tr, -i];
        if (avantDans(c, cle)) { choix = i; cle = c; }
      });
      if (choix < 0) break;
      r[choix].tr--;
      journal.push({ quoi: 'serie', i: choix, slug: r[choix].slug });
    }

    // 7. une ISOLATION redondante (avec ses chauffes), seulement si chacun de ses muscles principaux est muscle principal d'un
    // autre exercice gardé ; jamais le premier, jamais un exercice sans muscle principal, jamais un polyarticulaire.
    for (;;) {
      if (tient()) return fin();
      var retire = -1, cleR = null;
      r.forEach(function (e, i) {
        if (i === premier || !e.prim.length || e.ch + e.tr + e.deg + e.rec === 0 || !libre(e) || estPolyarticulaire(e)) return;
        var couvert = e.prim.every(function (m) {
          return r.some(function (f, j) { return j !== i && f.tr > 0 && f.prim.indexOf(m) >= 0; });
        });
        if (!couvert) return;
        var c = [priorite(e, i), -i];
        if (avantDans(c, cleR)) { retire = i; cleR = c; }
      });
      if (retire < 0) break;
      r[retire].ch = 0; r[retire].tr = 0; r[retire].deg = 0; r[retire].rec = 0;
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
               ch: nb('echauffement'), tr: nb('travail') + nb('echec'), deg: nb('degressive'), rec: nb('recul'),
               duree: d, prim: cat.muscles_primaires || [], sec: cat.muscles_secondaires || [],
               stab: cat.muscles_stabilisateurs || [], equipement: cat.equipement || null,
               groupe: g === undefined ? null : g };
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
      if (x.ch + x.tr + x.deg + compteDe(x.rec) === 0) { if (e.id !== undefined && e.id !== null) retires.push(e.id); return; }
      var garde = { echauffement: x.ch, travail: x.tr, echec: 0, degressive: x.deg, recul: compteDe(x.rec) };
      var vus = { echauffement: 0, travail: 0, echec: 0, degressive: 0, recul: 0 };
      var typeLigne = function (s) { var t = Modele().typeDe(s); return t === 'echec' ? 'travail' : t; };
      var toutes = e.series || [];
      // 193-6 — la ligne « Au max » (la dernière) se garde : quand une série de ce type doit partir, c'est une série du MILIEU
      // (la dernière gardée cède sa place), jamais celle-là.
      var gardees = [];
      toutes.forEach(function (s, i) {
        var t = typeLigne(s);
        vus[t] = (vus[t] || 0) + 1;
        if (vus[t] <= (garde[t] || 0)) gardees.push(i);
      });
      toutes.forEach(function (s, i) {
        if (s && s.au_max === true && gardees.indexOf(i) < 0) {
          var t = typeLigne(s), dernier = -1;
          gardees.forEach(function (g) { if (typeLigne(toutes[g]) === t) dernier = g; });
          if (dernier >= 0) gardees[gardees.indexOf(dernier)] = i;
        }
      });
      var series = toutes.filter(function (s, i) { return gardees.indexOf(i) >= 0; });
      // 188-2 — les deux premiers pas de la compression s'écrivent sur la ligne : un superset (les deux membres prennent le même
      // groupe, le premier perd son repos) et un repos d'isolation raccourci.
      var plus = {};
      ((resultat && resultat.journal) || []).forEach(function (t) {
        if (t.quoi === 'superset' && (t.i === i || t.j === i)) {
          plus.groupe_superset = t.groupe;
          if (t.i === i) plus.repos_cible_s = null;
        }
        if (t.quoi === 'repos' && t.i === i) plus.repos_cible_s = t.apres;
      });
      // 196 — le rest-pause : deux lignes de mini-série (des dégressives marquées, la charge se cale sur la dernière série de travail
      // au plan), juste après la dernière série de travail gardée.
      if (((resultat && resultat.journal) || []).some(function (t) { return t.quoi === 'rest_pause' && t.i === i; })) {
        var dernierTravail = -1;
        series.forEach(function (q, j) { var t = typeLigne(q); if (t === 'travail' || t === 'recul') dernierTravail = j; });
        var minis = new Array(MINI_SERIES_REST_PAUSE).fill(0).map(function () { return { id: null, type_serie: 'degressive', rest_pause: true, au_max: false }; });
        series = series.slice(0, dernierTravail + 1).concat(minis, series.slice(dernierTravail + 1));
      }
      exercices.push(Object.assign({}, e, { series: series }, plus));
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
  function carteRaccourcir(avant, resultat, cibleMin, nommer, avecMobilite) {
    var nom = function (slug) { return nommer ? nommer(slug) : slug; };
    var apres = (resultat && resultat.exercices) || [];
    var lignes = [];
    // 194-1 — le bloc de mobilité part en PREMIER, avant toute série (MOTEUR §9.31) : la première ligne le dit.
    if (avecMobilite) lignes.push('Bloc de mobilité : retiré en premier, avant toute série');
    (avant || []).forEach(function (a, i) {
      var b = apres[i];
      if (!b) return;
      var ta = compteDe(a.tr), ca = compteDe(a.ch), da = compteDe(a.deg), ra = compteDe(a.rec);
      if (ta + ca + da + ra > 0 && b.ch + b.tr + b.deg + compteDe(b.rec) === 0) {
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
      // 196 — la dernière série devient un rest-pause : dit sur la carte, comme le reste.
      if (compteDe(b.rp) > compteDe(a.rp)) lignes.push(nom(a.slug) + ' : la dernière série en rest-pause (jusqu’à l’échec, 15 s, encore)');
      // 188-2 — un repos d'isolation raccourci, un superset : dits, comme le reste.
      if (b.repos !== a.repos && b.repos !== null && b.repos !== undefined && a.repos !== null && a.repos !== undefined && b.tr > 0) {
        lignes.push(nom(a.slug) + ' : repos ' + nombreFr(a.repos, regle('repos.avant')) + ' s → ' + nombreFr(b.repos, regle('repos.apres')) + ' s');
      }
      if (b.groupe !== null && b.groupe !== undefined && (a.groupe === null || a.groupe === undefined) && b.repos === null) {
        var suivant = apres[i + 1];
        lignes.push(nom(a.slug) + ' : en superset avec ' + nom(suivant ? suivant.slug : a.slug));
      }
      if (da > 0 && b.deg < da) lignes.push(nom(a.slug) + ' : sans dégressive');
      // 193-1 — « Squat : 3 → 2 reculs » : un recul de moins, dit.
      if (ra > compteDe(b.rec) && compteDe(b.rec) > 0) {
        lignes.push(nom(a.slug) + ' : ' + nombreFr(ra, regle('series.avant')) + ' → ' + nombreFr(compteDe(b.rec), regle('series.apres')) +
          (compteDe(b.rec) > 1 ? ' reculs' : ' recul'));
      }
    });
    var tient = !!(resultat && resultat.tient);
    var court = resultat ? resultat.duree_s : 0;
    return {
      tient: tient,
      titre: tient ? 'Pour tenir en ' + nombreFr(cibleMin, regle('cible')) + ' min (estimation)'
                   : 'Au plus court : ' + minutesFr(court) + ' min (estimation)',
      lignes: lignes,
      phrase: 'Tous tes muscles du jour gardent leurs premières séries : ce sont celles qui comptent le plus. ' +
              'Les charges ne changent pas.' +
              // 196 — le « Pourquoi » du rest-pause (maquette muscle-et-phase v1) : un fait sourcé, sans promesse.
              (((resultat && resultat.journal) || []).some(function (t) { return t.quoi === 'rest_pause'; })
                ? ' Une série en rest-pause fait le travail de deux séries en moins de temps : le muscle progresse autant (Enes 2021, Sodal 2023), la séance raccourcit.'
                : ''),
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
    var salle = (options || {}).salle || null;
    if (!repli && meilleur) repli = repliDansLaSalle(repliEscalier(seances, avant, meilleur, zone, { actuel: consigne.palier }), salle);
    if (!repli) repli = repliDeLaRepriseLongue(seances, avant, consigne, zone, equipement, salle);
    // §10 bis (108) — le report est une estimation : il s'arrondit à la salle.
    if (salle && repli && repli.ligne && nombre(repli.ligne[0]) !== null && !dansLaSalle(salle, repli.ligne[0])) {
      repli = Object.assign({}, repli, { ligne: [arrondieALaSalle(salle, repli.ligne[0]), repli.ligne[1]] });
    }
    return { douleur: true, zone: zone, derniere: anterieuresSe[anterieuresSe.length - 1].debut, repli: repli };
  }

  // §9.9 réutilisé (51-3 bis) : la charge de la reprise longue depuis le palier
  // de la consigne — le cran en dessous, 10 % au plus (au-delà, le palier ;
  // sans cran connu, `null` : « le cran en dessous ») — et la visée bornée à la
  // zone suivante, comme celle du repli de §14.5. Marquée `source`, pour que
  // le plan l'applique comme telle (ce n'est pas un repli d'escalier : I22 ne
  // le juge pas contre le meilleur du compteur, I35 contre lui-même).
  function repliDeLaRepriseLongue(seances, avant, consigne, zone, equipement, salle) {
    var z = zoneParCle(zone);
    var P = nombre(consigne.palier);
    var vues = (seances || []).map(vueDeSeance);
    var dessous = voisineSalleComprise(vues, avant, P, equipement, -1, salle || null);
    // §10 bis (108) — la salle n'a rien de plus léger : la charge de travail.
    if (dessous === null && salle) dessous = P;
    var charge = repliDeReprise(P, dessous);
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
  // 202 (MOTEUR §9.20) — LA DOULEUR RÉPÉTÉE : à 2 séances avec douleur ou plus sur le même exercice en 42 jours (la fenêtre de
  // `douleurRecente`), la carte de reprise met « Plus léger, plus de reps » en premier, ajoute « Un frère » s'il en existe un et dit,
  // une fois, qu'un kiné peut chercher pourquoi. Jamais un diagnostic, jamais une zone déduite ; « Comme avant » reste proposé.
  var DOULEUR_REPETEE_DES = 2;
  function douleurRepetee(compte) {
    var n = nombre(compte);
    return n !== null && n >= DOULEUR_REPETEE_DES;
  }
  // « 2ᵉ séance avec douleur sur cet exercice en 6 semaines. Si ça revient, un kiné peut chercher pourquoi. » (« 3ᵉ », etc. selon le compte)
  function phraseDouleurRepetee(compte) {
    var n = nombre(compte);
    if (n === null) return null;
    return n + 'ᵉ séance avec douleur sur cet exercice en ' + (AU_MAX_JOURS_DE_DOULEUR / 7) + ' semaines. ' + PHRASE_KINE;
  }
  var PHRASE_KINE = 'Si ça revient, un kiné peut chercher pourquoi.';
  // `o` : `{ compte, frere }` — le nombre de séances avec douleur, et le nom du premier frère proposé (ou rien).
  function carteRepriseTextes(nom, consigne, reprise, o) {
    var choix = [{ cle: 'avant', texte: texteRepriseAvant(consigne) }];
    var leger = texteRepriseLeger(reprise && reprise.repli, consigne);
    var repetee = douleurRepetee(o && o.compte);
    if (leger) choix.push({ cle: 'leger', texte: leger });
    if (repetee && o.frere) choix.push({ cle: 'frere', texte: TEXTES_DOULEUR.frere + ' : ' + o.frere });
    // La 2ᵉ fois ou plus : la proposition prudente passe devant, « Comme avant » reste là.
    if (repetee) choix.sort(function (a, b) { return RANG_REPETEE[a.cle] - RANG_REPETEE[b.cle]; });
    choix.push({ cle: 'sans', texte: TEXTES_DOULEUR.sansCoach });
    return {
      titre: 'Ta dernière séance de ' + nom + ' était douloureuse.',
      phrase: repetee ? phraseDouleurRepetee(o.compte) : TEXTES_DOULEUR.reprisePhrase,
      choix: choix
    };
  }
  var RANG_REPETEE = { leger: 0, frere: 1, avant: 2 };

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
  // 163 — `approchee` : la charge n'a jamais été faite, le formateur la précède de « ≈ ».
  function ligneFois(charge, vise, tete, dessous, c, approchee) {
    return Modele().chargeFois(charge, vise, motDuCran(tete, dessous), c, approchee === true);
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
    var aL = !!ligne && ligne.approchee === true, aH = !!haut && haut.approchee === true;
    if (!haut) return [ligneFois(ligne.charge, ligne.vise, true, dessous, cL, aL)];
    if (!ligne) return [ligneFois(haut.charge, haut.vise, true, false, cH, aH)];
    if (haut.k === 1) {
      return [
        ligneFois(ligne.charge, ligne.vise, true, dessous, cL, aL),
        'puis ' + ligneFois(haut.charge, haut.vise, false, false, cH, aH) + ' sur la dernière série'
      ];
    }
    var restantes = c.n - haut.k;
    return [
      ligneFois(haut.charge, haut.vise, true, false, cH, aH) + ' sur les ' + nombreFr(haut.k, regle('series')) + ' dernières séries',
      ligneFois(ligne.charge, ligne.vise, false, dessous, cL, aL) +
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
  // `pourLaFeuille` (68A) : la forme du « Donc » de la feuille « Pourquoi »,
  // qui garde les phrases de `lignesJaunes` — l'objectif du jour
  // (« Aujourd'hui… Si ça passe… ») est la phrase de l'en-tête seul.
  function enteteDeDisposition(c, roles, pourLaFeuille) {
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
      segments.push({ role: r, charge: src ? src.charge : null, vise: src ? src.vise : null, nombre: 1,
        approchee: !!src && src.approchee === true });
    });
    if (!segments.length) return { jaune: [], segments: [] };
    // Et quand TOUS les segments disent les mêmes chiffres (la ligne à la
    // charge du haut), la ligne jaune les dit une fois : « 92 kg × 11 ». Les
    // segments, eux, gardent leurs rôles (I6).
    var unSeul = segments.every(function (x) {
      return memeCharge(nombre(x.charge), nombre(segments[0].charge)) && x.vise === segments[0].vise &&
        x.approchee === segments[0].approchee;
    });
    if (segments.length > 1 && unSeul && segments[0].vise !== null && segments[0].vise !== undefined) {
      return { jaune: [ligneFois(segments[0].charge, segments[0].vise, true, false,
        cite(CIBLE, { role: segments[0].role }), segments[0].approchee)], segments: segments };
    }
    var a = segments[0].role === 'ligne' ? segments[0].nombre : 0;
    var b = segments[segments.length - 1].role === 'haut' ? segments[segments.length - 1].nombre : 0;
    var habituelle = segments.length === 1 || (segments.length === 2 && a > 0 && b > 0);
    if (habituelle && (a === 0 || c.ligne) && (b === 0 || c.haut)) {
      // ECRAN-SAISIE §3.12 (68A, delta G6) — L'OBJECTIF DU JOUR : des lignes
      // à la charge de travail puis des tests se disent en deux phrases.
      // « Aujourd'hui : 79 kg × 12. Si ça passe, 81,3 kg × 11, à la série que
      // tu veux. » Jamais « une fois » : l'élan (MOTEUR §9.14 bis) garde la
      // suite à la charge du test dès qu'il passe. Les segments ne changent
      // pas (I6), ni `lignesJaunes` (la feuille « Pourquoi », la suite).
      if (!pourLaFeuille && a > 0 && b > 0 && c.etat !== 'reprise_longue' && c.etat !== 'nouvelle_zone') {
        return { jaune: [
          'Aujourd\'hui' + DEUX_POINTS + ligneFois(c.ligne.charge, c.ligne.vise, false, false,
            cite(CIBLE, { role: 'ligne' }), c.ligne.approchee === true) + '.',
          'Si ça passe, ' + ligneFois(c.haut.charge, c.haut.vise, false, false, cite(CIBLE, { role: 'haut' }), c.haut.approchee === true) +
            (b === 1 ? ', à la série que tu veux' : ' sur ' + nombreFr(b, regle('series')) + ' séries, celles que tu veux') + '.'
        ], segments: segments };
      }
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
        cite(CIBLE, { role: s.role }), s.approchee) +
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

  // §17.4 révisé (68B) — un test fait à fond dont la rep en moins change le
  // verdict : compté sous le bas de la zone, mais ses reps faites l'atteignent.
  function testSansMarge(t, z) {
    return !!t && z !== null && t.niveauFait !== undefined && t.niveauFait !== null &&
      t.niveau !== null && t.niveau < z.bas && t.niveauFait >= z.bas;
  }
  // 174 (MOTEUR §9.1.2) — LES TROIS PHRASES DE LA RÈGLE DE BORD QUI RECULE. Le fait : `f.bord`.
  //   recul  : « 140 kg × 1 sur 2 visées. On repart d'un cran plus bas, aux mêmes reps ; on remonte dès que les deux passent. »
  //   garde  : « 140 kg × 2, sans marge. On garde 140 kg ; la prochaine fois, on retente au-dessus. »
  //   vague  : « 140 kg × 2 depuis 3 séances. On repart de 132,5 kg pour reprendre de l'élan. »
  function phraseDeBord(etat, b) {
    var cF = cite(FAIT, { quoi: 'bord' });
    if (etat === 'bord_recul') {
      var v = b.visees;
      // 179 (A-F-05) — « aux mêmes reps » : les reps de la ligne. Bornée par une charge faite à fond (`bord.vise`), la phrase dit
      // les reps de la ligne, pas celles de la barre ratée.
      var borne = b.vise !== undefined && b.vise !== null && b.vise !== v;
      var L = borne ? b.vise : v;
      var cL = cite(FAIT, { quoi: borne ? 'bord.vise' : 'bord.visees' });
      return chargeFois(b.charge, b.faites, cF) + ' sur ' + nombreFr(v, cite(FAIT, { quoi: 'bord.visees' })) +
        ' visées. On repart d\'un cran plus bas, ' + (borne ? 'à ' + nombreFr(L, cL) + (L === 1 ? ' rep' : ' reps') : 'aux mêmes reps') + ' ; on remonte dès ' +
        (L === 1 ? 'que la rep passe.' : L === 2 ? 'que les deux passent.' : 'que les ' + nombreFr(L, cL) + ' passent.');
    }
    if (etat === 'bord_garde') {
      return chargeFois(b.charge, b.reps, cF) +
        (b.reserve === 0 ? ', sans marge' : ', avec ' + nombreFr(b.reserve, cite(FAIT, { quoi: 'bord.reserve' })) + ' en réserve') +
        '. On garde ' + enKg(b.charge, cite(FAIT, { quoi: 'bord.charge' })) + ' ; la prochaine fois, on retente au-dessus.';
    }
    return chargeFois(b.charge, b.reps, cF) + ' depuis ' + nombreFr(b.depuis, cite(FAIT, { quoi: 'bord.depuis' })) +
      ' séances. On repart de ' + enKg(b.vers, cite(FAIT, { quoi: 'bord.vers' })) + ' pour reprendre de l\'élan.';
  }
  // 154 — « 130 kg × 5, sans marge. On garde 130 kg la prochaine fois. » (R < V, la montée n'a pas lieu).
  function phraseDeLaGarde(e) {
    var cF = cite(FAIT, { quoi: 'effort_vise' });
    var cR = cite(FAIT, { quoi: 'effort_vise.reserve' });
    var cC = cite(FAIT, { quoi: 'effort_vise.charge' });
    var debut = chargeFois(e.charge, e.reps, cF) +
      (e.reserve === 0 ? ', sans marge' : ', avec ' + nombreFr(e.reserve, cR) + ' en réserve') + '. On garde ' +
      enKg(e.charge, cC);
    // 169 — au haut de la zone, la garde ne dure qu'une fois, et la phrase le dit ; sous le haut, la rep de plus reste la voie.
    return e.auHaut === false ? debut + ' la prochaine fois.'
      : debut + ' : encore une fois au haut de ta zone et je teste plus lourd.';
  }
  // 169 — LA SORTIE DITE : « Deux fois 30 kg × 10 au haut de ta zone. Prochaine fois : on teste 32,5 kg × 8. » `haut` : la
  // ligne haute de la consigne (`{ charge, vise, approchee }`), ou une charge seule.
  function phraseDeLaSortie(ev, haut, aujourdhui) {
    var h = haut !== null && typeof haut === 'object' ? haut : { charge: haut, vise: null };
    var cH = cite(FAIT, { quoi: 'effort_vise.haut' });
    var test = h.vise === null || h.vise === undefined ? enKg(h.charge, cH) : ligneFois(h.charge, h.vise, false, false, cH, h.approchee === true);
    // Dite à la fin de la séance : « Prochaine fois ». Dite en tête de la séance suivante, le test est pour aujourd'hui.
    return 'Deux fois ' + chargeFois(ev.charge, ev.reps, cite(FAIT, { quoi: 'effort_vise' })) + ' au haut de ta zone' +
      (aujourdhui === true ? DEUX_POINTS + 'aujourd’hui, on teste ' : '. Prochaine fois' + DEUX_POINTS + 'on teste ') + test + '.';
  }
  // 154 — LA PHRASE APRÈS LA RÉPONSE (VOIX-DU-COACH) : « 34 kg × 9, il t'en restait 3. Au-dessus de ce que je visais : la
  // prochaine fois, on essaie 36 kg. » / « 130 kg × 5, sans marge. On garde 130 kg : encore une fois au haut de ta zone et
  // je teste plus lourd. » `ev` : le fait `effortVise` de la consigne suivante ; `haut` : la ligne haute du test qu'elle
  // pose (ou sa charge). `null` : rien à dire.
  function phraseEffortVise(ev, haut) {
    if (!ev) return null;
    if (ev.effet === 'garde') return phraseDeLaGarde(ev);
    var charge = haut !== null && typeof haut === 'object' ? haut.charge : haut;
    if (ev.effet !== 'test' || charge === null || charge === undefined) return null;
    if (ev.sortie === true) return phraseDeLaSortie(ev, haut);
    return chargeFois(ev.charge, ev.reps, cite(FAIT, { quoi: 'effort_vise' })) + ', il t’en restait ' +
      nombreFr(ev.reserve, cite(FAIT, { quoi: 'effort_vise.reserve' })) +
      '. Au-dessus de ce que je visais' + DEUX_POINTS + 'la prochaine fois, on essaie ' +
      enKg(charge, cite(FAIT, { quoi: 'effort_vise.haut' })) + '.';
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
      if (t === null) return '';
      // §17.4 révisé (68B) — le test fait à fond, que la rep en moins fait
      // « rater » : le verdict des reps faites, « sans marge ».
      if (testSansMarge(t, z)) {
        // Sans « à RPE 10 » (retouche 74) : « sans marge » le dit.
        return quand(t.date, reference, true, cT) + DEUX_POINTS + chargeFois(t.charge, t.reps, cT) + ', sans marge.';
      }
      return quand(t.date, reference, true, cT) + DEUX_POINTS + chargeFois(t.charge, t.reps, cT) +
        ', pas encore dans ta zone.';
    };

    switch (c.etat) {
      case 'silence':
        if (c.raison === 'premiere_fois') {
          return 'Première fois ici' + DEUX_POINTS + 'ce que tu notes aujourd\'hui servira de départ.';
        }
        // 132 (ECRAN-SAISIE §3 ter.6, écran 4).
        if (c.raison === 'elastique_retire') {
          return 'Ton élastique ' + f.elastique + ' n\'est plus dans Ma salle' + DEUX_POINTS + 'je note sans proposer.';
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
        // §17.4 révisé (68B) — « sans marge », plus « compte pour 4 » : on ne
        // montre jamais des reps comptées pour des reps faites.
        // 79 (12/10/2026) — les chiffres d'abord et pas de jargon : « 125 kg × 5, sans marge : … », la même
        // phrase pour un RPE et pour un ressenti (« reste 0 »).
        // 154 (§9.26) — la montée retenue par la réserve : « 130 kg × 5, sans marge. On garde 130 kg la prochaine fois. »
        if (f.effortVise && f.effortVise.effet === 'garde') return phraseDeLaGarde(f.effortVise);
        if (f.serieAFond) {
          var a = f.serieAFond;
          return chargeFois(a.charge, a.reps, cite(FAIT, { quoi: 'a_fond' })) +
                 ', sans marge' + DEUX_POINTS + 'on ne rajoute pas de rep.';
        }
        // 200b — la cible (dernière fois + 1) est encore sous le bas de la zone : on rejoint la zone une rep à la fois, et
        // le coach le dit (VOIX, I26), pour que la puce « 6-8 reps » et la cible « × 5 » ne se contredisent pas.
        if (z !== null && c.ligne && typeof c.ligne.vise === 'number' && c.ligne.vise < z.bas) {
          return jour() + DEUX_POINTS + auPalier() + '. Une rep de plus, vers tes ' + nombreFr(z.bas, regle('zone.bas')) + '-' + nombreFr(z.haut, regle('zone.haut')) + '.';
        }
        return jour() + DEUX_POINTS + auPalier() + '. Une rep de plus.';

      case 'test_propose':
        // 154 (§9.26) — le test posé « par la réserve » dit la réserve notée, pas le haut de la zone.
        if (f.effortVise && f.effortVise.sortie === true && c.haut && c.haut.charge !== null && c.haut.charge !== undefined) {
          return phraseDeLaSortie(f.effortVise, c.haut, true);
        }
        if (f.effortVise && f.effortVise.effet === 'test' && c.haut && c.haut.charge !== null && c.haut.charge !== undefined) {
          return 'On essaie ' + enKg(c.haut.charge, cite(FAIT, { quoi: 'effort_vise.haut' })) + DEUX_POINTS + 'la dernière fois, ' +
            chargeFois(f.effortVise.charge, f.effortVise.reps, cite(FAIT, { quoi: 'effort_vise' })) + ' avec ' +
            nombreFr(f.effortVise.reserve, cite(FAIT, { quoi: 'effort_vise.reserve' })) + ' en réserve.';
        }
        // 175 — un gros cran : l'écart dit, et ce qui suffit pour s'y installer.
        if (f.cranGros && c.haut && c.haut.charge !== null && c.haut.charge !== undefined) return phraseGrosCran(f.cranGros);
        return jour() + DEUX_POINTS + auPalier() + ', ' +
               (f.preuve === 'haut' ? (f.depasse >= 1 ? nombreFr(f.depasse, cite(FAIT, { quoi: 'depasse' })) : nombreFr(PREUVE_DEPASSEMENT, regle('constante'))) +
                   ' reps au-dessus du haut'
                : f.preuve === 'facile' ? 'avec de la marge'
                : 'le haut de ta zone') + '. ' +
               (f.preuve ? 'On teste ' + motCrans(f.crans) + ' au-dessus' : 'On teste le cran au-dessus') + '.';

      case 'garde':
        // 175 — validé au plancher d'un gros cran : « ça suffit pour t'y installer », la rep de plus par séance jusqu'au bas.
        if (f.cranGros && f.cranGros.valide === true && t !== null) {
          return duTest() + 'a fait ' + nombreFr(t.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps' + DEUX_POINTS +
                 'ça suffit pour t\'y installer. On le garde sur la dernière série, une rep de plus à chaque séance jusqu\'à ' +
                 nombreFr(z.bas, regle('zone.bas')) + '.';
        }
        if (niveauDitDuTest(t) === z.bas) {
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
        // 74 — sans chute sur les reps faites (l'état vient du calcul prudent,
        // la ligne des reps faites) : la phrase de la rep de plus, qui est vraie.
        if (!f.chute) return jour() + DEUX_POINTS + auPalier() + '. Une rep de plus.';
        return jour() + DEUX_POINTS + auPalier() + '. Je ne compte pas la dernière série' + DEUX_POINTS +
               'on tient ' + chargeFois(c.ligne.charge, c.ligne.vise, cite(CIBLE, { role: 'ligne' })) + '.';

      case 'etirement':
        return ditPasDePlusPetitCran(f.equipement, true) + DEUX_POINTS + 'ta zone s\'étire. ' +
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

      case 'bord_recul':
      case 'bord_garde':
      case 'bord_vague':
        return f.bord ? phraseDeBord(c.etat, f.bord) : '';

      // §9.17 — AU POIDS DU CORPS, au haut de la zone, deux séances de suite :
      // la ligne tient, et la carte du lest parle (une fois). Le coach ne dit
      // pas « palier » : « le haut de ta zone », comme partout.
      case 'carte_lest':
        return jour() + DEUX_POINTS + auPalier() + ', le haut de ta zone.';

      // §9.17 — sans cran à monter, les reps continuent : une de plus que la
      // dernière fois, au-delà de la zone. La même phrase que la progression,
      // parce que c'est la même chose dite à un corps.
      case 'etirement_reps':
        // 175 — au plafond sans lest (30 reps), plus jamais « une rep de plus ».
        if (f.plafondReps === 'atteint') return jour() + DEUX_POINTS + auPalier() + '. Ton plafond sans lest.';
        if (f.plafondReps === 'vise') return jour() + DEUX_POINTS + auPalier() + '. Vise ' + nombreFr(PLAFOND_CIBLE, regle('constante')) + ' sur toutes tes séries.';
        return jour() + DEUX_POINTS + auPalier() + '. Une rep de plus.';

      // §10 bis (108, décidé le 15/10/2026) — « 30 kg, la plus lourde de ta
      // salle : on monte en reps. » La charge citée est celle de la ligne : la
      // plus lourde que la salle déclarée fait.
      // Au plafond (16/10/2026), le coach maintient, et le dit comme un fait : « 30 kg × 15, la plus lourde de ta
      // salle. »
      case 'salle_max':
        // 132 (décision du 22/10/2026) — au bout d'une liste d'élastiques : « Vert, ton élastique le plus léger : on monte
        // en reps. » (une aide), « Noir, ton élastique le plus fort : on monte en reps. » (en résistance). Le nom vient
        // de la liste, par le formateur (`avecNoms`).
        var bout = f.salle && f.salle.sens === 'aide' ? ', ton élastique le plus léger'
          : f.salle && f.salle.sens === 'resistance' ? ', ton élastique le plus fort' : ', la plus lourde de ta salle';
        if (f.salle && f.salle.maintien === true) {
          return chargeFois(c.ligne.charge, c.ligne.vise, cite(CIBLE, { role: 'ligne' })) + bout + '.';
        }
        return enKg(c.ligne.charge, cite(CIBLE, { role: 'ligne' })) + bout + DEUX_POINTS + 'on monte en reps.';

      // §8.4 / §9.17 — la version lestée démarre de l'exercice libre : le saut
      // de lest, au bas de la zone. Aucune séance à raconter : elle n'existe pas.
      case 'depart_leste':
        return 'Première fois avec du lest' + DEUX_POINTS + 'on commence à ' +
               enKg(c.ligne.charge, cite(CIBLE, { role: 'ligne' })) + ', au bas de ta zone.';

      // §9.21 (52-1) — la charge de départ de la routine, la première fois.
      case 'depart_routine':
        // 180 (A-F-09) — au poids du corps, les reps de la routine : « Première fois ici : on part des reps de ta routine, 12. »
        if (f.departRoutine && nombre(f.departRoutine.reps) !== null) {
          return 'Première fois ici' + DEUX_POINTS + chargeFois(c.ligne.charge, c.ligne.vise, cite(CIBLE, { role: 'ligne' })) +
                 ', les reps de ta routine.';
        }
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
    echec: 'série arrêtée, ne compte pas',
    // 186 — le single ou la série de test : faite, un record possible, hors de la charge de travail.
    hors_palier: 'hors de ta charge de travail',
    // 193-1 — la série de recul : faite, elle compte au volume et aux records ; sa charge suit la grosse série.
    recul: 'recul, suit ta grosse série'
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
      // 179 (B-B1) — « muet » est une donnée du plan (la ligne ne compte pas), plus une recherche de « ne compte » dans le texte.
      var muet = false;
      if (ROLES_LIGNE[s.origine]) { role = ROLES_LIGNE[s.origine]; muet = true; }
      else if (s.role === 'exploration') {
        var n = t !== null && nombre(s.charge_kg) === t.charge ? t.niveau : null;
        var dit = niveauDuTest(n, z);
        role = dit === null ? '' : 'test, ' + dit;
      } else if (Pv !== null && nombre(s.charge_kg) === Pv &&
                 (s.role === 'rampe' || s.role === 'travail')) {
        role = 'restée à ' + enKg(s.charge_kg, cite(FAIT, { quoi: 'reste' }));
      } else if (s.role === 'rampe') { role = 'série d\'approche, ne compte pas'; muet = true; }
      else if (s.role === 'palier') role = 'ta charge de travail';
      var lg = { texte: chargeFois(s.charge_kg, s.reps, cite(FAIT, { quoi: 'seance' })), role: role };
      if (muet) lg.muet = true;
      lignes.push(lg);
    });
    if (chauffes.length) {
      lignes.unshift({
        texte: chauffes.join(', '),
        role: chauffes.length > 1 ? 'chauffes, ne comptent pas' : 'chauffe, ne compte pas',
        muet: true
      });
    }
    return { date: quand(f.date, reference, false, cite(FAIT, { quoi: 'palier' })), lignes: lignes };
  }

  // 74 (retouche) — le test fait À FOND : la cause de son cran (« rpe » ou
  // « ressenti »), lue sur ses séries à sa charge, ou `null`. La première à
  // fond la dit, comme `causeAFond`.
  function aFondDuTest(c) {
    var f = c.fondement || {};
    var t = f.test || null;
    if (t === null || !f.seance) return null;
    for (var i = 0; i < f.seance.length; i++) {
      var s = f.seance[i];
      if (s.role === 'exploration' && nombre(s.charge_kg) === t.charge && Palier().cranDeSerie(s) === 'max') {
        return Palier().cranEffort(s.rpe) !== null ? 'rpe' : 'ressenti';
      }
    }
    return null;
  }

  // Le niveau du test que la feuille DIT : celui des reps faites (74). Le
  // fondement du calcul prudent le porte dans `niveauFait` quand la rep en
  // moins l'a abaissé ; sinon, c'est `niveau`.
  function niveauDitDuTest(t) {
    return t.niveauFait !== undefined && t.niveauFait !== null ? t.niveauFait : t.niveau;
  }

  // Le test, puis ce qu'on en tire (`suite`, en minuscule) : « Ton test à
  // 130 kg a fait 5 reps, dans ta zone : … ». Fait À FOND, le fait est sa
  // propre phrase et la suite en est une autre (retouche 74) : « Ton test :
  // 285,7 kg × 12, sans marge. Dans ta zone : il gagne une série. » — sans
  // « à RPE 10 », et jamais un compte de reps comptées (« compté 11 »).
  function testPuis(c, suite) {
    var t = c.fondement.test;
    if (aFondDuTest(c) !== null) {
      return 'Ton test' + DEUX_POINTS + chargeFois(t.charge, t.reps, cite(FAIT, { quoi: 'test' })) + ', sans marge. ' +
             suite.charAt(0).toUpperCase() + suite.slice(1);
    }
    return 'Ton test à ' + enKg(t.charge, cite(FAIT, { quoi: 'test' })) + ' a fait ' +
           nombreFr(t.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps, ' + suite;
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
      // 165 — la décharge planifiée se nomme « Décharge » (et sa semaine) ; la semaine allégée acceptée, « Semaine allégée ».
      if (c.allegee.decharge === true) {
        var k = c.allegee.semaine !== null && c.allegee.semaine !== undefined && c.allegee.semaines !== null && c.allegee.semaines !== undefined
          ? ', semaine ' + nombreFr(c.allegee.semaine, regle('bloc.semaine')) + ' sur ' + nombreFr(c.allegee.semaines, regle('bloc.semaines')) : '';
        return 'Décharge' + k + DEUX_POINTS + FIN_ALLEGEE + (d ? ' ' + d.charAt(0).toUpperCase() + d.slice(1) + '.' : '');
      }
      return 'Semaine allégée' + DEUX_POINTS + FIN_ALLEGEE +
             (d ? ' ' + d.charAt(0).toUpperCase() + d.slice(1) + '.' : '');
    }
    if (c.repli) return phraseRepli(c.repli, reference);
    // 174 — la marche « alléger » en cours : la feuille dit ce que la ligne fait, pas « une rep de plus ».
    if (c.alleger) {
      var ga = grisAlleger(c.alleger);
      return ga.charAt(0).toUpperCase() + ga.slice(1) + '. La fatigue redescend, la charge remontera.';
    }
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
    // §17.4 révisé (68B) — fait à fond, la rep en moins le fait « rater » :
    // « Ton test : 130 kg × 3, sans marge. » (retouche 74 : la forme du test à
    // fond, sans « à RPE 10 »).
    var tSansMarge = testSansMarge(t, z);
    // Rédigé à la demande (§20 bis) : un fragment non écrit ne déclare rien.
    var testSansMargeDit = function () { return 'Ton test' + DEUX_POINTS + chargeFois(t.charge, t.reps, cT) + ', sans marge.'; };
    // 175 — rédigé à la demande aussi : un état qui ne dit pas le test raté ne déclare pas ses reps (la citation « 7 » d'un test
    // raté ne se cachait que dans le « 28 » d'une charge).
    var rateDit = function () {
      return t === null ? '' : tSansMarge ? testSansMargeDit() :
        'Ton test à ' + enKg(t.charge, cT) + ' a fait ' +
        nombreFr(t.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps' + DEUX_POINTS + 'pas encore dans ta zone.';
    };
    var cH = cite(CIBLE, { role: 'haut' }), cL = cite(CIBLE, { role: 'ligne' });

    switch (c.etat) {
      // ⚠️ Le silence « pas de palier » n'a plus de paragraphe (§20.2, 49-U9) :
      // la chaîne complète ne le rend plus depuis le §7.6.
      case 'silence':
        return c.raison === 'premiere_fois'
          ? 'Rien avant aujourd\'hui' + DEUX_POINTS + 'ce que tu notes servira de départ.'
          : null;

      case 'progression':
        if (f.effortVise && f.effortVise.effet === 'garde') return phraseDeLaGarde(f.effortVise);
        return (t !== null ? rateDit() + ' ' : '') +
          'Ta charge de travail n\'est pas encore au haut de ta zone' + DEUX_POINTS +
          'une rep de plus sur chaque série.';

      case 'test_propose':
        var tete = reglage === 'prudent'
          ? 'Toutes tes séries ont touché le haut, deux séances de suite'
          : (c.niveau !== null && z !== null && c.niveau >= z.haut
              ? 'Ta charge de travail a touché le haut de ta zone'
              : 'Une de tes séries a touché le haut de ta zone');
        var dit = tete + DEUX_POINTS + 'on teste le cran au-dessus sur la dernière série.';
        if (f.effortVise && f.effortVise.sortie === true) {
          dit = 'Deux séances de suite, ' + chargeFois(f.effortVise.charge, f.effortVise.reps, cite(FAIT, { quoi: 'effort_vise' })) +
            ' au haut de ta zone, sans la marge visée : on teste le cran au-dessus sur la dernière série.';
        } else if (f.effortVise && f.effortVise.effet === 'test') {
          dit = 'Ta dernière série, ' + chargeFois(f.effortVise.charge, f.effortVise.reps, cite(FAIT, { quoi: 'effort_vise' })) +
            ', laissait ' + nombreFr(f.effortVise.reserve, cite(FAIT, { quoi: 'effort_vise.reserve' })) +
            ' en réserve, plus que les ' + nombreFr(f.effortVise.visee, cite(FAIT, { quoi: 'effort_vise.visee' })) +
            ' visées : on teste le cran au-dessus sur la dernière série.';
        }
        if (f.preuve) {
          var ecart = c.haut.charge === null ? null : c.haut.charge - c.ligne.charge;
          var pourcent = ecart === null ? null : Math.round(ecart / c.ligne.charge * 1000) / 10;
          // « dans la limite de 15 % » (10 % pour un débutant) : l'égalité est permise (§9.8), « sous » disait le contraire.
          // 186 — « ta barre / tes haltères / ta machine » : le mot du matériel, pas « un cran » dans l'abstrait.
          dit += ' ' + (f.preuve === 'haut'
              ? 'Tu as dépassé le haut de ' + (f.depasse >= 1 ? nombreFr(f.depasse, cite(FAIT, { quoi: 'depasse' }))
                                                              : nombreFr(PREUVE_DEPASSEMENT, regle('constante'))) + ' reps'
              : 'Tu avais de la marge') +
            DEUX_POINTS + motCrans(f.crans) + ' sur ' + motDuMateriel(f.materiel) + ', ' + enKg(ecart, regle('ecart')) + ', soit ' +
            nombreFr(pourcent, regle('ecart.pourcent')) + INSECABLE + '% de plus, ' +
            'dans la limite de ' + nombreFr(Math.round((f.plafond || MARGE_DOUBLE_SAUT) * 100), regle('constante')) + INSECABLE + '%.';
        }
        // 191 — la prudence de montée a ralenti ce saut : une phrase, un fait.
        if (f.prudence && phrasePrudence(f.prudence.quoi)) dit += ' ' + phrasePrudence(f.prudence.quoi);
        // 175 — un gros cran : l'écart dit, et ce qui suffit pour s'y installer.
        if (f.cranGros && c.haut && c.haut.charge !== null && c.haut.charge !== undefined) dit += ' ' + phraseGrosCran(f.cranGros);
        return dit;

      case 'garde':
        if (f.cranGros && f.cranGros.valide === true && t !== null) {
          return testPuis(c, 'assez pour t\'y installer' + DEUX_POINTS + 'sur ce cran, ' +
                 nombreFr(f.cranGros.plancher, regle('cran.plancher')) + ' reps suffisent. On le garde sur la dernière série ; ' +
                 'une rep de plus à chaque séance jusqu\'à ' + nombreFr(z.bas, regle('zone.bas')) + '.');
        }
        if (niveauDitDuTest(t) === z.bas) {
          return testPuis(c, 'le bas de ta zone' + DEUX_POINTS + 'il tient. ' +
                 'On le garde sur la dernière série ; à ' + nombreFr(z.bas + 1, regle('zone.bas+1')) + ' reps, il gagnera une série.');
        }
        return testPuis(c, 'dans ta zone. Avec Me ménager, il reste sur la dernière ' +
               'série jusqu\'à ' + nombreFr(z.haut, regle('zone.haut')) + ' reps ; alors la série d\'avant le rejoindra.');

      case 'etend':
        return testPuis(c, niveauDansPhrase(niveauDitDuTest(t), z) + DEUX_POINTS +
               'il gagne une série. La nouvelle charge gagne tes séries une par séance, ' +
               'de la dernière à la première.');

      case 'tout_passe':
        var fin = DEUX_POINTS + 'avec Me pousser, toutes tes séries passent à ' +
                  enKg(c.haut.charge, cH) + '.';
        if (t !== null) {
          return testPuis(c, niveauDansPhrase(niveauDitDuTest(t), z) + fin);
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
        // 74 — sans chute sur les reps faites : le paragraphe de la rep de plus.
        if (!f.chute) {
          return 'Ta charge de travail n\'est pas encore au haut de ta zone' + DEUX_POINTS +
            'une rep de plus sur chaque série.';
        }
        return 'Ta dernière série a chuté après des séries stables' + DEUX_POINTS +
               'c\'est la fatigue, pas ton niveau. Je ne la compte pas, et on tient ' +
               chargeFois(c.ligne.charge, c.ligne.vise, cL) + ' avant de tester plus lourd.';

      case 'retest_un_cran':
        return rateDit() + ' Ta charge de travail est au haut' + DEUX_POINTS +
               'on reteste d\'un seul cran, à ' + enKg(c.haut.charge, cH) + '.';

      case 'etirement':
        return (tSansMarge ? testSansMargeDit() + ' ' + ditPasDePlusPetitCran(f.equipement, true) + '. '
                 : 'Ton test à ' + enKg(t.charge, cT) + ' a fait ' +
                   nombreFr(t.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps' + DEUX_POINTS +
                   'pas encore dans ta zone, et ' + ditPasDePlusPetitCran(f.equipement, false) + '. ') +
               'Ta zone s\'étire' + DEUX_POINTS + 'à ' + enKg(c.ligne.charge, cL) + ', tu vises une rep ' +
               'de plus au-delà du haut, jusqu\'à ' + nombreFr(f.cible, regle('cible')) + '. Alors on retestera ' +
               enKg(t.charge, cT) + '.';

      case 'retest':
        return 'Tu as regagné les reps perdues au test, ' + nombreFr(f.cible, regle('cible')) + ' reps à ' +
               enKg(c.ligne.charge, cL) + DEUX_POINTS + 'on retente ' + enKg(t.charge, cH) + '.';

      // §9.17 — au poids du corps, sans cran : la carte du lest, ou les reps.
      case 'carte_lest':
        return 'Ta charge de travail est au haut de ta zone ' + (reglage === 'franc' ? 'à ta dernière séance' : 'depuis deux séances') + '. ' +
               'Un lest te ferait continuer en force : je te le propose, et on tient la ligne en attendant.';

      case 'etirement_reps':
        // 175 — au plafond sans lest (30 reps), la feuille dit le plafond.
        if (f.plafondReps === 'atteint') {
          return 'Au poids du corps, il n\'y a pas de cran à monter, et ' + nombreFr(PLAFOND_CIBLE, regle('constante')) +
                 ' reps est le plafond sans lest.';
        }
        return 'Au poids du corps, il n\'y a pas de cran à monter' + DEUX_POINTS +
               'tu gagnes des reps, une de plus que la dernière fois.';

      // §10 bis (108) — la salle déclarée n'a rien de plus lourd.
      case 'salle_max':
        return 'Ta salle n\'a pas plus lourd que ' + enKg(c.ligne.charge, cL) + DEUX_POINTS +
               'je ne te propose jamais une charge qu\'elle n\'a pas. ' +
               (f.salle && f.salle.maintien === true
                 ? 'Tu es au haut de ta fourchette' + DEUX_POINTS + 'on garde la charge.'
                 : 'Tu gagnes des reps, une de plus que la dernière fois.');

      case 'depart_leste':
        return 'Première séance avec du lest' + DEUX_POINTS + 'on part de ' + enKg(c.ligne.charge, cL) +
               ', au bas de ta zone.';

      case 'depart_routine':
        if (f.departRoutine && nombre(f.departRoutine.reps) !== null) {
          return 'Rien avant aujourd\'hui' + DEUX_POINTS + 'on part des reps de ta routine, ' +
                 chargeFois(c.ligne.charge, c.ligne.vise, cL) + '. Ensuite, je décide d\'après tes séances.';
        }
        return 'Rien avant aujourd\'hui' + DEUX_POINTS + 'on part de la charge de départ de ta routine, ' +
               enKg(c.ligne.charge, cL) + '. Ensuite, je décide d\'après tes séances.';

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

      // 174 — la même phrase que l'en-tête, puis la règle qui la porte.
      case 'bord_recul':
        return !f.bord ? '' : phraseDeBord(c.etat, f.bord) + ' Sous ' + nombreFr(RANGEMENT[0].jusqua + 1, regle('constante')) +
          ' reps, je ne demande jamais une rep de plus : une barre ratée fait reculer d\'un cran.';
      case 'bord_garde':
        return !f.bord ? '' : phraseDeBord(c.etat, f.bord) + ' Sous ' + nombreFr(RANGEMENT[0].jusqua + 1, regle('constante')) +
          ' reps, une réserve sous ma visée garde la charge une séance.';
      case 'bord_vague':
        return !f.bord ? '' : phraseDeBord(c.etat, f.bord) + ' Trois séances sans passer au-dessus de ton meilleur : je baisse d\'environ ' +
          nombreFr(Math.round((1 - BORD_VAGUE) * 100), regle('constante')) + INSECABLE + '%.';
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
    var etat = etatDuPourquoi(consigne, reglage || 'normal', reference);
    // 186 — la série hors palier ne compte pas dans la charge de travail, et le « Pourquoi » le dit.
    if (!muet && etat && consigne.fondement && consigne.fondement.horsPalier) etat += ' ' + phraseHorsPalier(consigne.fondement.horsPalier);
    return {
      seance: seanceDuPourquoi(consigne, reference),
      zone: muet ? null : zoneDuPourquoi(consigne, reference),
      palier: muet ? null : palierDuPourquoi(consigne),
      etat: etat,
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
  function constatDe(consigneAvant, consigneApres, reglage, cranSuivant, reference, cranApproche) {
    var d = constatEnDeux(consigneAvant, consigneApres, reglage, cranSuivant, reference, cranApproche);
    if (!d) return null;
    Modele().reporter(d.verdict.citations);
    Modele().reporter(d.suite.citations);
    return { verdict: d.verdict.texte, suite: d.suite.texte };
  }

  // §20 bis (49-U19) — le verdict et la suite, chacun RÉDIGÉ DANS SA CAPTURE
  // (`{ texte, citations }`) : un verdict remplacé (la montée tenue) ne laisse
  // pas ses citations derrière lui.
  function constatEnDeux(consigneAvant, consigneApres, reglage, cranSuivant, reference, cranApproche, seriesDuJour) {
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
                                    testDuJour, faitAujourdHui, av, ap, reference, seriesDuJour);
             }),
             suite: V.capturer(function () {
               return suiteDuJour(consigneAvant, consigneApres, z, reglage,
                                  faitAujourdHui, cranSuivant, cranApproche === true);
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

  // 193-1 (MOTEUR §9.28) — L'IDENTIFIANT DU PARI D'UNE SÉRIE DE RECUL, dans un espace de noms à part, sur le modèle de l'escalier :
  // `recul|séance|exercice|rang|occurrence` (le rang est un texte, « r1 »…). Un nom de consigne commence par l'identifiant de la
  // séance : les deux ne peuvent jamais se rencontrer.
  async function idDeRecul(seance, exercice, rang, occurrence) {
    return uuidDuNom('recul|' + String(seance) + '|' + String(exercice) + '|' + String(rang) + (occurrence ? '|o=' + String(occurrence) : ''));
  }

  // 109 (MOTEUR §9.25) — L'IDENTIFIANT DU PARI D'UN OBJECTIF, dans un espace de noms à part :
  // `objectif|exercice|instant de la pose` (l'instant ISO tel que posé, pas le jour : deux objectifs posés le même
  // jour sur un exercice sont deux paris). Un nom de consigne commence par une séance, un nom d'escalier par
  // `escalier|`, un import par `import|` : aucun ne peut le croiser.
  var MODULE_OBJECTIF = 'objectif';
  async function idDObjectif(exercice, poseLe) {
    return uuidDuNom('objectif|' + String(exercice) + '|' + String(poseLe));
  }

  // 69 (ECRAN-PROFIL §2.4 quater) — L'IDENTIFIANT D'UNE SÉANCE IMPORTÉE, et de
  // ses séries, dans un espace de noms à part : `import|personne|référence`
  // pour la séance, `…|rang` pour une série (`rang` absent : la séance). Un
  // envoi rejoué, un import recommencé ou fait depuis un autre téléphone
  // écrivent LA MÊME LIGNE — jamais un 23505 sur `sessions_source_ref_uniq`,
  // donc jamais une file bloquée. Un nom de pari commence par l'identifiant
  // d'une séance, un nom d'escalier par `escalier|` : aucun ne peut le croiser.
  async function idDImport(personne, sourceRef, rang) {
    var nom = 'import|' + String(personne) + '|' + String(sourceRef);
    if (rang !== undefined && rang !== null) nom += '|' + String(rang);
    return uuidDuNom(nom);
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
    var dit = niveauDuTest(e.niveau, z);
    if (z !== null && e.niveau !== null && e.niveau < z.bas) {
      return tete + dit + '.';
    }
    if (e.toutes) return tete + 'ta nouvelle charge tient sur toutes tes séries.';
    // 183 (I26) — rédigé à la demande (§20 bis) : le compte « 2 » n'est déclaré que par la branche qui l'écrit. Avant, il se
    // calculait en tête et restait déclaré sans être écrit (sous le bas de la zone, ou sur toutes les séries).
    var combien = nombreFr(e.k, regle('series')) + ' séries';
    return tete + 'ta nouvelle charge tient sur ' + combien + (dit ? ', ' + dit : '') + '.';
  }

  function verdictDuJour(cAvant, cApres, z, repsDuJour, t, fait, av, ap, reference, seriesDuJour) {
    // ⚠️ Plus de « pas de palier » (§20.2, 49-U9) : depuis le §7.6, la chaîne
    // complète ne rend plus de consigne d'après en silence. Un contrat brut
    // qui y tombe encore n'a pas de verdict.
    if (cApres.etat === 'silence') return null;
    // Rédigé à la demande : seule la branche qui l'écrit le déclare (§20 bis).
    // 179 (A-F-06, « le coach ne dit jamais rien de faux ») — le fait du jour ne cite que des séries RÉELLEMENT faites : la charge
    // de la consigne d'après et les reps saisies au palier quand elles se recoupent ; sinon les séries faites à cette charge ;
    // sinon chaque charge du jour. Jamais « le cran au-dessus × . » (palier absent) ni le 5 d'une autre charge (« 26 kg × 5 »).
    var faitDuJour = function (toutLeJour) {
      var citeJour = function () { return cite(FAIT, { quoi: 'du_jour' }); };
      var p = nombre(cApres.palier);
      // Les séries du jour viennent du PLAN (`jour.series`, les lignes de travail faites) ; à défaut, de la séance du fondement.
      var jour = Array.isArray(seriesDuJour) && seriesDuJour.length ? seriesDuJour : parRole((ap || {}).seance, ROLES_VOTANTS);
      var auPalier = p === null ? [] : jour.filter(function (q) { return memeCharge(nombre(q.charge_kg), p); });
      var reelles = auPalier.map(function (q) { return nombre(q.reps); });
      var fidele = p !== null && repsDuJour.length > 0 && reelles.length === repsDuJour.length &&
        reelles.every(function (r, k) { return r === nombre(repsDuJour[k]); });
      if (toutLeJour !== true) {
        if (fidele || !jour.length) return serieFr(cApres.palier, repsDuJour, citeJour());
        if (auPalier.length) return serieFr(p, reelles, citeJour());
      }
      var groupes = [];
      jour.forEach(function (q) {
        var c = nombre(q.charge_kg);
        var g = groupes.filter(function (x) { return x.charge === c || (c !== null && x.charge !== null && memeCharge(x.charge, c)); })[0];
        if (!g) groupes.push(g = { charge: c, reps: [] });
        g.reps.push(nombre(q.reps));
      });
      return groupes.map(function (g) {
        return g.charge === null ? g.reps.map(function (r) { return Modele().serieFaite(null, r, citeJour()); }).join(', ')
                                 : serieFr(g.charge, g.reps, citeJour());
      }).join(', ');
    };
    // 179 (A-F-06) — UNE SÉANCE NEUTRE NE PARLE PAS D'UNE AUTRE : quand la consigne d'après est encore celle d'une séance d'avant
    // (aucune charge répétée aujourd'hui, §7.6), « 8 reps aujourd'hui » racontait la séance précédente. Le verdict dit alors ce
    // que la personne a fait, série par série.
    if (reference && ap && ap.date && jourCivil(ap.date) !== jourCivil(reference) && Array.isArray(seriesDuJour) && seriesDuJour.length) {
      return 'Aujourd\'hui' + DEUX_POINTS + faitDuJour(true) + '.';
    }
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
        // §17.4 révisé (68B) — fait à fond : la position des reps faites, « sans marge ».
        if (testSansMarge(t, z)) dit = niveauDuTest(t.niveauFait, z) + ', sans marge';
        return chargeFois(t.charge, t.reps, cite(FAIT, { quoi: 'du_jour' })) + DEUX_POINTS + dit + '.';
      }
      // La fois d'avant n'avait de test que si c'était LA MÊME CHARGE : sinon
      // « 3 reps mardi » parlerait d'autre chose.
      var avant = av.test && av.test.charge === t.charge ? av.test : null;
      return enKg(t.charge, cite(FAIT, { quoi: 'du_jour' })) + DEUX_POINTS +
        (avant ? nombreFr(avant.reps, cite(FAIT, { quoi: 'test', champ: 'reps' })) + ' reps ' +
                 quand(avant.date, reference, false, cite(FAIT, { quoi: 'test' })) + ', ' : '') +
        nombreFr(t.reps, cite(FAIT, { quoi: 'du_jour', champ: 'reps' })) + ' aujourd\'hui' +
        // 179 (A-F-06) — sans zone (règle de bord), il n'y a pas de position à dire : la clause tombe, « null » ne s'écrit jamais.
        (dit ? ', ' + dit : '') + '.';
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
    // §17.4 révisé (68B) — la rep en moins d'une série à fond fait manquer la
    // rep de plus, mais les reps faites l'ont : « tenu, sans marge », jamais
    // « pas encore » pour des reps faites.
    var nivFaitJour = ap.serieAFond ? nombre(ap.serieAFond.niveauFait) : null;
    // (En Franc, le fait du jour est déjà la meilleure série en reps faites :
    // arrivé ici, ses reps faites n'ont pas dépassé non plus.)
    if (nivAvant !== null && nivFaitJour !== null && nivFaitJour > nivAvant) {
      return faitDuJour() + DEUX_POINTS + 'tenu, sans marge.';
    }
    return 'Pas encore' + DEUX_POINTS + faitDuJour() + '.';
  }

  // Ce qui vient. La consigne d'après le dit déjà en jaune : on la reprend
  // telle quelle plutôt que de la réécrire.
  function suiteDuJour(cAvant, cApres, z, reglage, fait, cranSuivant, cranApproche) {
    if (cApres.etat === 'silence') return null;
    // Rédigée à la demande : seule la branche qui l'écrit la déclare (§20 bis).
    var prochaine = function () { return 'Prochaine séance' + DEUX_POINTS + lignesJaunes(cApres, SUIVANTE).join(', ') + '.'; };

    if (cApres.etat === 'etirement') {
      return ditPasDePlusPetitCran(cApres.fondement.equipement, true) + DEUX_POINTS + 'ta zone s\'étire. ' +
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
               ' pour tester ' + (cranApproche === true ? '\u2248' + INSECABLE : '') + enKg(cranSuivant, regle('cran_suivant')) + '.';
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
  function etiquetteZone(consigne, ligne, plan) {
    if (!consigne) return null;
    var z = zoneParCle(consigne.zone);
    if (z === null) return null;
    // 193-3 — la zone vient de la routine : « Mix · ta routine » (la maquette de l'ondulation).
    if (plan && plan.suspendue === true) return z.libelle + ' \u00b7 zone \u00e0 m\u00e9nager';
    if (plan && plan.zone === consigne.zone) return z.libelle + (plan.origine === 'aujourdhui' ? ' \u00b7 aujourd\u2019hui' : ' \u00b7 ta routine');
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
      // 193-6 : `au_max_reserve` suit la série dans le contrat — sans lui l'habitude (`reposPlafonne`) et le dépassement
      // (`depassementLong`) ne reconnaîtraient jamais une série « Au max » (le test du dépassement l'a montré).
      var vue = { charge_kg: s.charge_kg, reps: s.reps, rpe: s.rpe, ressenti: s.ressenti,
                  role: role, origine: d && d.role === undefined ? null : d.role };
      if (s.au_max_reserve !== undefined && s.au_max_reserve !== null) vue.au_max_reserve = s.au_max_reserve;   // seulement quand elle existe
      return vue;
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
      // 185 (v2_116) — UNE SÉRIE « NON, NE COMPTE PAS » N'ENTRE PAS DANS LE CONTRAT : ni le palier, ni le niveau, ni les crans voisins
      // (`chargesDe`), ni le fondement d'une consigne, ni le compteur ne la voient. La séance qui la porte garde sa date (une
      // présence pour le rythme). Elle reste au journal et au détail : seul le calcul l'ignore.
      var series = ((g && g.series) || []).filter(function (x) { return !(x && x.hors_calcul === true); });
      var r = mesure === 'reps'
        ? Palier().analyserPoidsDuCorps(series)
        : Palier().analyser(series, etat, { mesure: mesure, cran: pasMaxDuMateriel(options && options.equipement) });
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
    var opts = { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null, salle: o.salle || null };
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
      // 180 (A-F-01, 28/10/2026, décision d'Aurélien, MOTEUR §7.5) — UNE EXPLORATION RATÉE N'EST JAMAIS LE PALIER. Une
      // séance dont la SEULE série à la charge du palier reste sous le bas de la zone, alors qu'une série plus légère
      // l'a tenu, n'a pas de palier : elle suit le §7.6 (la plus lourde charge tenue dans la zone) et la série plus
      // lourde devient l'exploration, c'est-à-dire le test (7,5 kg × 1 après 5 kg × 17 : le palier reste 5 kg).
      var exploRatee = false;
      if (nombre(se.palier) !== null) {
        var auPalier = parRole(se.series, { palier: true });
        if (auPalier.length === 1 && parRole(se.series, { travail: true }).length > 0) {
          var zEssai = zoneParCle((consignePour(faites, se.debut, opts) || {}).zone);
          var rPalier = compter(auPalier[0]);
          if (zEssai !== null && rPalier !== null && rPalier < zEssai.bas) {
            // Tentée PUIS ABANDONNÉE : la plus légère tenue vient APRÈS la tentative. Une pyramide qui finit à sa plus
            // lourde (24, 24, 28 × 8) est une montée, pas une exploration ratée.
            var iPalier = se.series.indexOf(auPalier[0]);
            exploRatee = se.series.some(function (s, q) {
              var r = compter(s);
              return q > iPalier && estRole(s, { travail: true }) && nombre(s.charge_kg) < nombre(se.palier) &&
                r !== null && r >= zEssai.bas;
            });
          }
        }
      }
      // 193-1 (MOTEUR §9.28, décision du 31/10/2026) — UN TEST RATÉ À UNE SEULE GROSSE SÉRIE. Avec des reculs, la grosse série est seule à
      // sa charge : plus lourde que le palier d'avant et sous le bas de la zone (152,5 × 2 après 150 × 4, zone Lourd 3-5), elle n'est pas
      // un nouveau palier. La séance est NEUTRE : palier inchangé, même test reproposé la fois suivante. Pas de retest d'un cran ni
      // d'étirement ici (option B, à décider). Sans recul, une série unique garde son comportement d'avant.
      if (!exploRatee && nombre(se.palier) !== null && parRole(se.series, { palier: true }).length === 1 &&
          parRole(se.series, { travail: true }).length === 0 && (se.series || []).some(function (x) { return x && x.origine === 'recul'; })) {
        var cAvant = consignePour(faites, se.debut, opts) || {};
        var zUne = zoneParCle(cAvant.zone), pAvant = nombre(cAvant.palier);
        var rUne = compter(parRole(se.series, { palier: true })[0]);
        if (zUne !== null && pAvant !== null && rUne !== null && rUne < zUne.bas && nombre(se.palier) > pAvant) {
          se = { debut: se.debut, palier: null, neutre: true, series: se.series || [] };
          sortie[i] = se;
          faites.push(se);
          return;
        }
      }
      if (nombre(se.palier) === null || exploRatee) {
        var avant = consignePour(faites, se.debut, opts);
        var z = zoneParCle(avant && avant.zone);
        var C = null;
        if (z !== null) {
          parRole(se.series, { travail: true }).forEach(function (s) {
            var kg = nombre(s.charge_kg);
            var r = compter(s);
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
            var devient = null;
            if (estRole(s, { travail: true }) && nombre(s.charge_kg) === C) devient = 'palier';
            else if (exploRatee && estRole(s, { palier: true })) devient = 'exploration';
            if (devient === null) return s;
            var copie = {};
            for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) copie[k] = s[k];
            copie.role = devient;
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
    // §10 bis (16/10/2026) — la salle déclarée aussi : la zone d'une séance passée à la plus lourde est la zone gelée,
    // la même que celle d'aujourd'hui (sinon le report verrait une « nouvelle zone » que le gel a empêchée).
    return consignePour(liste.slice(0, i), se.debut,
      { reglage: o.reglage, equipement: o.equipement, correction: correction, salle: o.salle || null,
        bordProf: o.bordProf });
  }
  function zoneDeLaSeance(liste, i, avant, o) {
    var k = consigneDeLaSeance(liste, i, avant, o);
    return k && k.zone ? k.zone : null;
  }

  function compteurDe(seances, avant, options) {
    return avecDebutant(options, function () { return compteurDeCalcul(seances, avant, options); });
  }
  function compteurDeCalcul(seances, avant, options) {
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
      // 180 (A-F-02, D4, 28/10/2026) — LE POIDS DU CORPS SANS ZONE COMPTE : `etirement_reps` (les reps continuent, une de plus que la
      // dernière fois) n'a pas de zone, et le compteur ne le comptait jamais — une personne qui rate sa cible en reps à chaque
      // séance n'avait aucune sortie (30 séances sur 30, compteur 0). Un progrès en reps (le niveau monte) le remet à zéro.
      var sansZoneMaisCompte = !!k && k.etat === 'etirement_reps' && nombre(k.palier) === 0;
      if (se.neutre === true || se.decharge === true || !k || k.etat === 'silence' ||
          ((k.zone === null || k.zone === undefined) && !sansZoneMaisCompte) || P === null) {
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
      // 185 (décision d'Aurélien du 29/10/2026, MOTEUR §9.2) — UNE TENTATIVE MANQUÉE COMPTE DANS LA STAGNATION si sa charge est au
      // plus la charge de travail : on a échoué une série à la charge qu'on tient, la séance ne peut pas se lire comme un gain de
      // niveau ni de test. Au-dessus de la charge de travail (une exploration ratée), le palier l'ignore, comme avant.
      var manqueAuTravail = P !== null && (v.series || []).some(function (x) {
        var kg = x && x.origine === 'echec' && nombre(x.reps) === 0 ? nombre(x.charge_kg) : null;
        return kg !== null && (kg < P || memeCharge(kg, P));
      });
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
            (!manqueAuTravail && memeCharge(P, meilleur.palier) && n !== null && (meilleur.niveau === null || n > meilleur.niveau)))) {
          progres = true;
          meilleur = { palier: P, niveau: n };
        } else if (testMieux && !manqueAuTravail) {
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
      var kOuverture = consignePour(liste, avant, { reglage: o.reglage, equipement: o.equipement, salle: o.salle || null,
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

  // ══ 188-2 (MOTEUR §9.27 bis) — LE REPOS D'UN GROS MOUVEMENT QUI STAGNE ══════════════════════════════════════
  //
  // Aucune carte : l'écart entre deux validations ne mesure pas le vrai repos (une série validée après coup, un oubli). Une seule
  // ligne, dans le « Pourquoi » d'un gros mouvement qui stagne : les reps chutent d'au moins 30 % de la série 1 à la série 3 sur
  // 3 séances de suite, et le repos RÉGLÉ (`repos_cible_s`) est de 90 s ou moins.
  var CHUTE_DE_REPS = 0.30, SEANCES_DE_CHUTE = 3, REPOS_COURT_S = 90;
  function reposAConseiller(o) {
    var x = o || {};
    if (x.grand !== true || x.stagne !== true) return false;
    var r = Number(x.reposS);
    if (!(r > 0) || r > REPOS_COURT_S) return false;       // pas de repos réglé : rien à dire, on ne devine pas
    var ch = Array.isArray(x.chutes) ? x.chutes : [];
    if (ch.length < SEANCES_DE_CHUTE) return false;
    return ch.slice(0, SEANCES_DE_CHUTE).every(function (v) { return typeof v === 'number' && v >= CHUTE_DE_REPS; });
  }
  function phraseReposLong() {
    var c = function (v) { return nombreFr(v, regle('constante')); };
    return 'Sur un gros mouvement, ' + c(2) + ' min ' + c(30) + ' à ' + c(3) + ' min de repos aident.';
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
  // Un déclenchement : 4, 8, 12… — le seuil de la phrase du compteur (§12.9), une valeur pour deux usages (124, audit
  // du 16/10/2026, 01 #14 : `SEUIL_COMPTEUR` et `PAS_ESCALIER` étaient deux « 4 » couplés par la spec).
  var PAS_ESCALIER = SEUIL_COMPTEUR;
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
    return 'Quand tout cale en même temps, c\'est souvent de la fatigue. ' + detailAllegeeProposee();
  }
  // 189 — la proposition de la semaine allégée, dite UNE fois : le blocage généralisé et la baisse générale la lisent.
  function detailAllegeeProposee() {
    return 'Je te propose une ' +
      'semaine allégée : mêmes exercices, mêmes charges, ' +
      nombreFr(Math.round(PART_ALLEGEE * 100), regle('constante')) + ' % des séries, ' +
      nombreFr(REPS_EN_MOINS, regle('constante')) + ' reps de moins, pendant ' +
      nombreFr(DUREE_ALLEGEE_JOURS, regle('constante')) + ' jours. Rien ne monte.';
  }
  // 179 (B-B4) — le bouton de la carte dit la durée que la règle porte (`DUREE_ALLEGEE_JOURS`) : le plan le donne avec la carte.
  function libelleAlleger() { return 'Alléger ' + DUREE_ALLEGEE_JOURS + ' jours'; }
  var PHRASE_REFUS = 'Séance normale. Au prochain blocage, je regarderai exercice par exercice.';

  function estDeclenchement(c) {
    var n = nombre(c);
    return n !== null && n >= PAS_ESCALIER && n % PAS_ESCALIER === 0;
  }

  // ── LES JOURS CIVILS, UNE FOIS (124, audit du 16/10/2026, 01 #14 : l'arithmétique était écrite trois fois — ici,
  // dans `objectif.js` et dans `deraille.js` ; les deux autres la lisent) ──
  // Le JOUR CIVIL local d'un instant (une date, un horodatage, un nombre de millisecondes), « AAAA-MM-JJ » ; une
  // date déjà au jour passe telle quelle.
  function jourCivil(v) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var t = typeof v === 'number' ? (isFinite(v) ? v : null) : instant(v);
    if (t === null) return null;
    var d = new Date(t);
    var deux = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate());
  }
  // Le NUMÉRO d'un jour civil « AAAA-MM-JJ » : la différence de deux numéros compte les jours du calendrier.
  function numeroDuJour(jour) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour || ''));
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / JOUR) : null;
  }
  // Le jour civil d'un numéro (l'inverse de `numeroDuJour`).
  function jourDuNumero(k) {
    if (typeof k !== 'number' || !isFinite(k)) return null;
    var d = new Date(k * JOUR);
    var deux = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate());
  }
  function ajouterJours(jour, n) {
    var k = numeroDuJour(jour);
    return k === null ? null : jourDuNumero(k + n);
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
  // 163 — le fondement d'une consigne RECONSTRUITE (allégée, repli) dit « approchée » exactement quand sa ligne la porte
  // (I61) : l'allégée garde la charge de sa source, le repli repart d'une charge tenue (connue).
  function fondementApproche(c, approchee) {
    if (!c.fondement || typeof c.fondement !== 'object') return c.fondement;
    var f = Object.assign({}, c.fondement);
    if (approchee === true) f.approchee = true; else delete f.approchee;
    return f;
  }

  function consigneAllegee(consigne, seriesRoutine, decharge, rang) {
    var c = consigne || null;
    if (!c || c.etat === 'silence') return c;
    var src = c.ligne || c.haut;
    if (!src) return c;
    var routine = Math.max(1, nombre(seriesRoutine) || 1);
    var series = seriesAllegees(routine);
    var vise = nombre(src.vise);
    return Object.assign({}, c, {
      ligne: Object.assign({ charge: src.charge, vise: vise === null ? null : Math.max(1, vise - REPS_EN_MOINS) },
        src.approchee === true ? { approchee: true } : {}),
      haut: null,
      fondement: fondementApproche(c, src.approchee === true),
      n: series,
      couvre: series,
      allegee: decharge === true
        ? { series: series, routine: routine, decharge: true,
            semaine: rang && nombre(rang.semaine) !== null ? nombre(rang.semaine) : null,
            semaines: rang && nombre(rang.semaines) !== null ? nombre(rang.semaines) : null }
        : { series: series, routine: routine }
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
               cites: Array.isArray(f.cites) ? f.cites.slice() : [],
               // 189 — d'où vient la carte (`baisse` : la baisse générale) et, pour elle, la valeur d'avant la baisse
               // de chaque exercice cité, figée dans le pari (le pari se juge dessus).
               source: f.source === SOURCE_BAISSE ? SOURCE_BAISSE : 'blocage',
               avant: f.avant && typeof f.avant === 'object' && !Array.isArray(f.avant) ? Object.assign({}, f.avant) : null };
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
    if (!carte || carte.reponse !== 'acceptee' || carte.source === SOURCE_BAISSE) return null;
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

  // ══ §14.11 (189) — LA FATIGUE SUR PLUSIEURS SEMAINES ═══════════════════════
  //
  // « Tes séries baissent depuis 3 semaines. » Un second déclencheur de la MÊME carte que le blocage généralisé (§14.4) :
  // jamais deux cartes. Tout est pur : l'entrée est un fait assemblé par `faits.js` (`entreeFatigue`), la date de la séance
  // qui s'ouvre vient de l'appelant. Décidé par Aurélien le 30/10/2026 (maquette `maquette-fatigue-v2`), lecture de Gemini S6.
  //
  //   · fenêtre récente = les 3 dernières semaines ACTIVES (au moins une séance), fenêtre d'avant = les 3 précédentes ;
  //   · par exercice suivi : la meilleure série de chaque séance, estimée (Epley, `unRMEpley`), séries de travail de 1 à 12
  //     reps, puis la VALEUR DU MILIEU (médiane) de chaque fenêtre — jamais le maximum (il baisse tout seul quand il y a
  //     moins de séances) ; la réserve notée s'ajoute aux reps (`Palier().reserveDeSerie`, la même lecture que partout) ;
  //   · compté seulement avec au moins 2 séances dans chaque fenêtre ;
  //   · exclus : chauffes, séries `test` et `hors_calcul` (la définition de la série de travail), séances allégées, un exercice
  //     dont la zone ou le bloc a changé, un exercice marqué « J'ai mal » (`sets.douleur`) dans les 6 semaines, et toute
  //     évaluation dont les 6 semaines contiennent une coupure (§9.9) ou les 3 semaines qui la suivent ;
  //   · déclenche si au moins 4 exercices suivis baissent de plus de 5 % ET forment au moins 40 % des exercices suivis.
  var FATIGUE_SEMAINES = 3;
  var FATIGUE_BAISSE_MIN = 5;          // en pourcent, strictement au-dessus
  var FATIGUE_BAISSE_ATTENDUE_MIN = 2; // 198 : en sèche, sous ce seuil la baisse est du bruit de mesure (médiane d'estimations), pas un constat
  var FATIGUE_EXERCICES_MIN = 4;
  var FATIGUE_PART_MIN = 40;           // en pourcent, au moins
  var FATIGUE_SEANCES_MIN = 2;         // par fenêtre
  var FATIGUE_REPS_MAX = 12;
  var FATIGUE_APRES_COUPURE_JOURS = 21;
  var FATIGUE_REFRACTAIRE_JOURS = 28;  // « une fois par épisode » : aucune carte de fatigue pendant 4 semaines
  var FATIGUE_RETOUR_JOURS = 21;       // le pari : « tes séries reviennent au niveau d'avant dans les 3 semaines »
  var FATIGUE_RETOUR_PART = 98;        // en pourcent de la valeur d'avant la baisse
  var FATIGUE_NOMS_MAX = 4;            // au-delà, les 3 premiers puis « et N autres exercices »
  var FATIGUE_SERIES_MIN = 2;          // « une série de moins » ne descend jamais sous 2
  var SOURCE_BAISSE = 'baisse';
  var REPONSE_SERIE_DE_MOINS = 'serie_de_moins';
  var CLE_SERIE_DE_MOINS = 'fatigue_seche';

  // Le lundi (numéro de jour) de la semaine d'un jour, et un numéro de semaine : deux jours de la même semaine ont le même.
  function numeroDeSemaine(jour) {
    var n = numeroDuJour(jourCivil(jour));
    return n === null ? null : Math.floor((n + 3) / 7);
  }
  function lundiDeSemaine(numero) { return jourDuNumero(numero * 7 - 3); }
  function dimancheDeSemaine(numero) { return jourDuNumero(numero * 7 + 3); }
  function dansPeriodes(periodes, jour) {
    var k = numeroDuJour(jourCivil(jour));
    return k !== null && (periodes || []).some(function (p) {
      var a = p ? numeroDuJour(p.debut) : null, b = p ? numeroDuJour(p.fin) : null;
      return a !== null && b !== null && a <= k && k <= b;
    });
  }

  // La valeur d'UNE série : son maximum estimé, avec la réserve quand elle est notée. `null` : pas une série de la mesure
  // (échauffement, dégressive, test, hors calcul, hors de 1 à 12 reps, sans charge).
  function valeurDeFatigue(serie) {
    var M = Modele();
    // 193-1 — ni une série de recul : la baisse générale ne lit que les grosses séries (un recul plus léger n'est jamais une baisse).
    if (!serie || !M.estTravail(serie) || M.estTest(serie) || M.estRecul(serie)) return null;
    var charge = nombre(serie.charge_kg), reps = nombre(serie.reps);
    if (charge === null || charge <= 0 || reps === null || reps < 1 || reps > FATIGUE_REPS_MAX) return null;
    var reserve = Palier().reserveDeSerie(serie);
    return { valeur: unRMEpley(charge, reps + (reserve === null ? 0 : reserve)), reserve: reserve !== null };
  }

  // La meilleure série de CHAQUE séance d'un exercice, dans une liste de jours : `[{ jour, valeur, reserve }]`.
  function meilleuresDeFatigue(exercice, retenue) {
    var sortie = [];
    ((exercice && exercice.seances) || []).forEach(function (s) {
      if (!s || !retenue(s.jour)) return;
      var best = null;
      (s.series || []).forEach(function (x) {
        var v = valeurDeFatigue(x);
        if (v !== null && (best === null || v.valeur > best.valeur)) best = v;
      });
      if (best !== null) sortie.push({ jour: s.jour, valeur: best.valeur, reserve: best.reserve });
    });
    return sortie;
  }

  // LES SIX SEMAINES ACTIVES : les 3 dernières et les 3 d'avant (les semaines sans séance ne comptent pas). `jours` : les jours
  // de toutes les séances, hors séances allégées ; `avant` : strictement avant ce jour. `null` : moins de six semaines.
  function fenetresDeFatigue(jours, avant) {
    var k = numeroDuJour(avant), vues = {};
    (jours || []).forEach(function (j) {
      var n = numeroDuJour(j);
      if (n === null || k === null || n >= k) return;
      vues[numeroDeSemaine(j)] = true;
    });
    var semaines = Object.keys(vues).map(Number).sort(function (a, b) { return a - b; });
    var n = FATIGUE_SEMAINES;
    if (semaines.length < 2 * n) return null;
    var recent = semaines.slice(-n), ancien = semaines.slice(-2 * n, -n);
    return {
      recent: { semaines: recent, debut: lundiDeSemaine(recent[0]), fin: dimancheDeSemaine(recent[n - 1]) },
      ancien: { semaines: ancien, debut: lundiDeSemaine(ancien[0]), fin: dimancheDeSemaine(ancien[n - 1]) }
    };
  }

  // UNE COUPURE (§9.9) dans l'évaluation : une séance qui reprend après plus de 3 fois l'écart habituel, dans les 6 semaines
  // ou les 3 semaines qui les précèdent. `debuts` : le début de TOUTES les séances (une séance allégée est une présence).
  function coupureDansLaFatigue(debuts, depuisLe, jusquAu) {
    var liste = (debuts || []).map(function (d) { return { debut: d }; })
      .filter(function (s) { return instant(s.debut) !== null; })
      .sort(function (a, b) { return instant(a.debut) - instant(b.debut); });
    var borne = numeroDuJour(depuisLe) - FATIGUE_APRES_COUPURE_JOURS, fin = numeroDuJour(jusquAu);
    for (var i = 1; i < liste.length; i++) {
      var k = numeroDuJour(jourCivil(liste[i].debut));
      if (k === null || k < borne || k > fin) continue;
      if (repriseDe(liste.slice(0, i), liste[i].debut) !== AUCUNE_REPRISE) return true;
    }
    return false;
  }

  function medianeDeFatigue(valeurs) { return mediane(valeurs.map(function (v) { return v.valeur; })); }

  // LE POIDS, dit seulement s'il y a au moins une pesée dans chaque fenêtre (la valeur du milieu de chacune).
  function poidsDeFatigue(pesees, f) {
    var lire = function (p) {
      var a = numeroDuJour(p.debut), b = numeroDuJour(p.fin);
      return (pesees || []).filter(function (x) {
        var k = x ? numeroDuJour(jourCivil(x.date)) : null, kg = x ? nombre(x.poids) : null;
        return k !== null && kg !== null && kg > 0 && k >= a && k <= b;
      }).map(function (x) { return nombre(x.poids); });
    };
    var av = lire(f.ancien), ap = lire(f.recent);
    return av.length && ap.length ? { avant: mediane(av), apres: mediane(ap) } : null;
  }

  // LA DÉTECTION. `d` : `{ jour, seances: [début ISO de toutes les séances], periodesAllegees: [{ debut, fin }],
  // exercices: [{ slug, nom, seances: [{ jour, series }], douleurs: [jour], zones: [jour], blocs: [jour] }], pesees }`.
  // Rend toujours un objet : `declenche` dit si la carte se pose ; le reste est la matière du « Pourquoi ».
  function baisseGenerale(d) {
    var e = d || {};
    var J = jourCivil(e.jour);
    var sortie = { declenche: false, raison: null, jour: J, ancien: null, recent: null, suivis: 0, lignes: [], baissent: [],
                   stables: 0, nonComptes: [], moyenne: null, reserve: false, poids: null };
    if (!J) { sortie.raison = 'jour'; return sortie; }
    var allegees = e.periodesAllegees || [];
    var jours = (e.seances || []).map(function (s) { return jourCivil(s); })
      .filter(function (j) { return j && !dansPeriodes(allegees, j); });
    var f = fenetresDeFatigue(jours, J);
    if (!f) { sortie.raison = 'semaines'; return sortie; }
    sortie.ancien = { debut: f.ancien.debut, fin: f.ancien.fin };
    sortie.recent = { debut: f.recent.debut, fin: f.recent.fin };
    if (coupureDansLaFatigue(e.seances, f.ancien.debut, J)) { sortie.raison = 'coupure'; return sortie; }
    var dans = function (fenetre) {
      return function (jr) { return !dansPeriodes(allegees, jr) && fenetre.semaines.indexOf(numeroDeSemaine(jr)) >= 0; };
    };
    var aD = numeroDuJour(f.ancien.debut), aJ = numeroDuJour(J);
    var dedans = function (liste) {
      return (liste || []).some(function (j) { var k = numeroDuJour(jourCivil(j)); return k !== null && k >= aD && k < aJ; });
    };
    var baisses = [];
    (e.exercices || []).forEach(function (x) {
      if (!x || !x.slug) return;
      var avant = meilleuresDeFatigue(x, dans(f.ancien)), apres = meilleuresDeFatigue(x, dans(f.recent));
      if (avant.length < FATIGUE_SEANCES_MIN || apres.length < FATIGUE_SEANCES_MIN) return;
      var nom = x.nom || x.slug;
      var raison = dedans(x.douleurs) ? 'douleur' : (dedans(x.zones) ? 'zone' : (dedans(x.blocs) ? 'bloc' : null));
      if (raison) { sortie.nonComptes.push({ slug: x.slug, nom: nom, raison: raison }); return; }
      var a = medianeDeFatigue(avant), b = medianeDeFatigue(apres);
      var baisse = a > 0 ? (a - b) / a * 100 : 0;
      sortie.suivis++;
      if (avant.concat(apres).some(function (v) { return v.reserve; })) sortie.reserve = true;
      var ligne = { slug: x.slug, nom: nom, avant: a, apres: b, baisse: baisse };
      sortie.lignes.push(ligne);
      if (baisse > FATIGUE_BAISSE_MIN + 1e-9) baisses.push(ligne); else sortie.stables++;
    });
    var parBaisse = function (a, b) { return b.baisse - a.baisse || avantAlpha(a.nom, b.nom); };
    baisses.sort(parBaisse);
    sortie.lignes.sort(parBaisse);
    sortie.baissent = baisses.map(function (l) { return l.slug; });
    sortie.moyenne = baisses.length
      ? Math.round(baisses.reduce(function (t, l) { return t + l.baisse; }, 0) / baisses.length) : null;
    sortie.poids = poidsDeFatigue(e.pesees, f);
    // Au moins 4 exercices ET au moins 40 % des exercices suivis (produit croisé : 39 % ne passe pas, 40 % passe).
    sortie.declenche = baisses.length >= FATIGUE_EXERCICES_MIN && baisses.length * 100 >= sortie.suivis * FATIGUE_PART_MIN;
    sortie.raison = sortie.declenche ? null : 'seuil';
    return sortie;
  }

  // 198 (MOTEUR §9.34, décidé le 31/10/2026) — EN SÈCHE, UNE BAISSE JUSQU'À 5 % EST ATTENDUE : tu manges moins. La carte de fatigue ne
  // se pose pas (elle exige plus de 5 % par exercice) ; à la place, une phrase descriptive, sans geste. Même ampleur que la carte
  // (au moins 4 exercices ET 40 % des exercices suivis) mais des baisses de 2 à 5 % : on n'invente pas un constat sur du bruit. Au-delà de
  // 5 %, la carte habituelle revient (`baisseGenerale`). Le coach ne baisse jamais le volume d'office en sèche. `b` : une sortie de
  // `baisseGenerale` ; rend `{ noms, moyenne, reserve }` ou `null`.
  function baisseAttendue(b) {
    if (!b || b.declenche || b.raison !== 'seuil') return null;
    var petites = (b.lignes || []).filter(function (l) { return l.baisse >= FATIGUE_BAISSE_ATTENDUE_MIN - 1e-9; });
    if (petites.length < FATIGUE_EXERCICES_MIN || petites.length * 100 < b.suivis * FATIGUE_PART_MIN) return null;
    var moyenne = Math.round(petites.reduce(function (t, l) { return t + l.baisse; }, 0) / petites.length);
    if (moyenne > FATIGUE_BAISSE_MIN) return null;
    return { noms: petites.map(function (l) { return l.nom; }), moyenne: moyenne, reserve: !!b.reserve };
  }
  function titreBaisseAttendue() { return 'Tes séries baissent un peu'; }
  // « Couché, squat, rowing : −3 % en moyenne depuis 3 semaines. En sèche, une baisse jusqu'à 5 % est attendue : tu manges moins, pas
  // encore de quoi alléger. Garde tes charges. » — « en sèche » une seule fois.
  function phraseBaisseAttendue(noms, moyenne, reserve) {
    var l = (noms || []).map(String), liste;
    if (l.length > FATIGUE_NOMS_MAX) {
      liste = l.slice(0, 3).join(', ') + ' et ' + nombreFr(l.length - 3, regle('carte.autres')) + ' autres exercices';
    } else if (l.length > 1) {
      liste = l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1];
    } else {
      liste = l.join('');
    }
    return liste + DEUX_POINTS + MOINS + nombreFr(moyenne, regle('fatigue.moyenne')) + ' % en moyenne depuis ' +
      nombreFr(FATIGUE_SEMAINES, regle('constante')) + ' semaines' + (reserve ? ', à réserve égale' : '') + '. En sèche, une baisse jusqu’à ' +
      nombreFr(FATIGUE_BAISSE_MIN, regle('constante')) + ' % est attendue' + DEUX_POINTS + 'tu manges moins, pas encore de quoi alléger. Garde tes charges.';
  }

  // LE CONSTAT SANS CARTE (« Juste un carnet ») : la même mesure, dite en une ligne dans le Parcours. `null` : rien à dire.
  function constatDeBaisse(d) {
    var b = baisseGenerale(d);
    if (!b || !b.declenche) return null;
    var noms = b.lignes.filter(function (l) { return b.baissent.indexOf(l.slug) >= 0; }).map(function (l) { return l.nom; });
    return { titre: titreBaisse(), texte: phraseBaisse(noms, b.moyenne, b.reserve, null) };
  }

  // « UNE FOIS PAR ÉPISODE » : après une carte de fatigue (acceptée ou refusée, quel que soit son déclencheur), aucune carte
  // de fatigue pendant 4 semaines. Ajouté à la mémoire du déclencheur (§14.3), sans la remplacer.
  function fatigueAutorisee(cartes, jour) {
    var k = numeroDuJour(jourCivil(jour));
    if (k === null) return false;
    return !(cartes || []).some(function (c) {
      var j = c ? numeroDuJour(jourCivil(c.jour)) : null;
      return j !== null && j <= k && k - j < FATIGUE_REFRACTAIRE_JOURS;
    });
  }

  // LA CARTE DE BAISSE : la mémoire des 4 semaines, et le « pas de cumul » avec la décharge planifiée (§9.22, 53-2) — une seule
  // règle, la même que celle du blocage généralisé pour la décharge.
  function baisseAutorisee(cartes, jour, blocs) {
    return fatigueAutorisee(cartes, jour) && carteAllegeeAutorisee(blocs, jour);
  }

  // L'OBSERVATION DU PARI D'UNE CARTE DE BAISSE : « tes séries reviennent au niveau d'avant dans les 3 semaines » — la valeur du
  // milieu de la fenêtre suivante (3 semaines après la référence : la fin de la semaine allégée, ou le jour de la réponse « une
  // série de moins ») est au moins à 98 % de celle d'avant la baisse (figée dans le pari), sur les exercices cités ; le milieu
  // des rapports tranche. 1 ou 0 ; `null` tant qu'aucune séance n'a refermé la fenêtre, ou qu'aucun exercice cité n'a ses 2 séances.
  // Une carte refusée n'est jamais observée.
  function observationBaisse(carte, d) {
    var c = carte || {}, e = d || {};
    if (c.source !== SOURCE_BAISSE || (c.reponse !== 'acceptee' && c.reponse !== REPONSE_SERIE_DE_MOINS) || !c.avant) return null;
    var ref = numeroDuJour(jourCivil(c.reponse === 'acceptee' && c.fin ? c.fin : c.jour));
    if (ref === null) return null;
    var fermee = null;
    (e.seances || []).forEach(function (s) {
      var k = numeroDuJour(jourCivil(s));
      if (k !== null && k >= ref + FATIGUE_RETOUR_JOURS && (fermee === null || instant(s) < instant(fermee))) fermee = s;
    });
    if (fermee === null) return null;
    var dedans = function (jr) {
      var k = numeroDuJour(jourCivil(jr));
      return k !== null && k > ref && k <= ref + FATIGUE_RETOUR_JOURS && !dansPeriodes(e.periodesAllegees, jr);
    };
    var rapports = [];
    (e.exercices || []).forEach(function (x) {
      var a = x && Object.prototype.hasOwnProperty.call(c.avant, x.slug) ? nombre(c.avant[x.slug]) : null;
      if (a === null || a <= 0) return;
      var apres = meilleuresDeFatigue(x, dedans);
      if (apres.length >= FATIGUE_SEANCES_MIN) rapports.push(medianeDeFatigue(apres) / a * 100);
    });
    if (!rapports.length) return null;
    return { valeur: mediane(rapports) >= FATIGUE_RETOUR_PART - 1e-9 ? 1 : 0, jour: jourCivil(fermee), seance: null, debut: fermee };
  }

  // ── « UNE SÉRIE DE MOINS JUSQU'À LA FIN DE TA SÈCHE » (la 3ᵉ réponse, en sèche) ──
  // Chaque exercice : les séries de travail de la séance moins une, JAMAIS sous 2 (un exercice à 2 séries ou moins ne bouge
  // pas) ; une priorité n'est jamais touchée (le plan ne la donne pas) ; les charges suivent leur cours.
  function seriesDeMoins(n) {
    var k = nombre(n);
    if (k === null || k < 1) return 1;
    return k <= FATIGUE_SERIES_MIN ? k : k - 1;
  }
  function consigneSerieDeMoins(consigne, n) {
    var c = consigne || null;
    var k = nombre(n);
    if (!c || c.etat === 'silence' || k === null || k < 1 || !(c.ligne || c.haut)) return c;
    return Object.assign({}, c, { serieDeMoins: { routine: k, series: seriesDeMoins(k) } });
  }
  // « 3 séries au lieu de 4, pendant ta sèche » ; « 2 séries, comme ta routine ».
  function grisSerieDeMoins(m) {
    if (!m) return null;
    if (m.series >= m.routine) return nombreFr(m.series, regle('series')) + (m.series > 1 ? ' séries' : ' série') + ', comme ta routine';
    return nombreFr(m.series, regle('series')) + (m.series > 1 ? ' séries' : ' série') + ' au lieu de ' +
      nombreFr(m.routine, regle('series')) + ', pendant ta sèche';
  }
  function bandeauSerieDeMoins() {
    return 'Pendant ta sèche' + DEUX_POINTS + 'une série de moins par exercice (jamais sous ' + nombreFr(FATIGUE_SERIES_MIN, regle('constante')) +
      '). Les charges suivent leur cours.';
  }
  function libelleRevenirAuxSeries() { return 'Revenir à mes séries'; }
  var PHRASE_SERIES_REVENUES = 'Tes séries reviennent à ta routine.';
  // La réponse du profil (`cartes_semaine.fatigue_seche`) est valable tant que la sèche où elle a été donnée dure : une autre
  // sèche (un autre « depuis ») ne la rallume jamais en silence.
  function serieDeMoinsValable(reponse, phase, phaseDepuis) {
    var r = reponse && typeof reponse === 'object' ? reponse : null;
    if (!r || r.r !== 'oui' || phase !== 'seche') return false;
    return (r.depuis || null) === (phaseDepuis || null);
  }

  // ── Les mots de la carte (maquette `maquette-fatigue-v2`, ses textes font foi) ──
  var MOINS = '−';
  function titreBaisse() {
    return 'Tes séries baissent depuis ' + nombreFr(FATIGUE_SEMAINES, regle('constante')) + ' semaines';
  }
  // « Squat, couché, rowing et 2 autres exercices sont plus bas que les 3 semaines d'avant : −6 % en moyenne, à réserve égale. »
  function phraseBaisse(noms, moyenne, reserve, poids) {
    var l = (noms || []).map(String), liste;
    if (l.length > FATIGUE_NOMS_MAX) {
      liste = l.slice(0, 3).join(', ') + ' et ' + nombreFr(l.length - 3, regle('carte.autres')) + ' autres exercices';
    } else if (l.length > 1) {
      liste = l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1];
    } else {
      liste = l.join('');
    }
    var t = liste + ' sont plus bas que les ' + nombreFr(FATIGUE_SEMAINES, regle('constante')) + ' semaines d’avant' + DEUX_POINTS +
      MOINS + nombreFr(moyenne, regle('fatigue.moyenne')) + ' % en moyenne' + (reserve ? ', à réserve égale' : '') + '.';
    if (poids) {
      t += ' Pendant ce temps, ton poids est passé de ' + nombreFr(poids.avant, regle('fatigue.poids')) + ' à ' +
        nombreFr(poids.apres, regle('fatigue.poids')) + ' kg.';
    }
    return t;
  }
  // Le détail : hors sèche, la proposition de la semaine allégée ; en sèche, « deux façons d'y répondre ».
  function detailBaisse(seche) {
    var debut = 'Quand plusieurs exercices baissent ensemble, c’est souvent de la fatigue';
    if (seche) return debut + ', et une sèche en ajoute. Deux façons d’y répondre' + INSECABLE + ':';
    return debut + '. ' + detailAllegeeProposee();
  }
  function libelleSerieDeMoins() { return 'Une série de moins jusqu’à la fin de ta sèche'; }
  // La table du « Pourquoi », au toucher : chaque chiffre a son origine.
  var RAISONS_NON_COMPTE = { douleur: 'J’ai mal', zone: 'zone changée', bloc: 'bloc changé' };
  function pourquoiBaisse(b) {
    var cles = RAISONS_NON_COMPTE;
    var lignes = (b.lignes || []).filter(function (l) { return b.baissent.indexOf(l.slug) >= 0; }).map(function (l) {
      return { nom: l.nom, avant: enKg(Math.round(l.avant), regle('fatigue.charge')), apres: enKg(Math.round(l.apres), regle('fatigue.charge')) };
    });
    var stables = (b.stables || 0) > 0
      ? nombreFr(b.stables, regle('fatigue.stables')) + ' ' + (b.stables > 1 ? 'exercices' : 'exercice') + ' sur ' + nombreFr(b.suivis, regle('fatigue.suivis')) : null;
    var pas = (b.nonComptes || []).map(function (x) { return x.nom + ' (' + (x.raison === 'douleur' ? '« J’ai mal »' : cles[x.raison]) + ')'; });
    var n = nombreFr(FATIGUE_SEMAINES, regle('constante'));
    var methode = 'Pour chaque exercice, je prends la meilleure série de chaque séance (de ' + nombreFr(1, regle('constante')) + ' à ' +
      nombreFr(FATIGUE_REPS_MAX, regle('constante')) + ' reps), puis la valeur du milieu sur ' + n + ' semaines : une séance de moins ne fait pas baisser le chiffre. ' +
      'Ta réserve compte quand tu l’as notée : ' + chargeFois(100, 7, regle('fatigue.exemple')) + ' avec ' + nombreFr(3, regle('fatigue.exemple')) +
      ' en réserve vaut ' + nombreFr(10, regle('fatigue.exemple')) + ' reps. Il faut au moins ' + nombreFr(FATIGUE_SEANCES_MIN, regle('constante')) +
      ' séances de l’exercice de chaque côté. Une semaine sans séance ne compte pas. Je ne repropose pas avant ' +
      nombreFr(Math.round(FATIGUE_REFRACTAIRE_JOURS / 7), regle('constante')) + ' semaines.';
    return { titre: 'Pourquoi cette carte', entete: ['Ta série type, estimée', n + ' sem. d’avant', n + ' dernières'],
             lignes: lignes, stables: stables, pasComptes: pas.length ? pas.join(', ') : null, methode: methode };
  }

  // ══ §9.22 (53-2) — LES PROGRAMMES À CYCLES ════════════════════════════════
  //
  // « Un programme fixe la zone de tes barres, la durée du bloc et sa
  // décharge. Il ne choisit jamais un exercice, ne touche pas à leur ordre, et
  // ne décide pas des charges : le coach continue de le faire. » Tout est pur
  // ici ; une fonction par notion. Référence : `cycles53.py` ; cas
  // `cas-53-2-cycles.json`. Un bloc : `{ id, dossier, zone, debut, semaines,
  // decharge, exercices, statut, precedent }` (la table `blocs`, v2_058).
  var ZONES_DE_BLOC = ZONES_FORCE;      // §19.2 amendé : la force seulement (124 : la même liste)
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
  function blocSuivant(bloc, phases) {
    if (!bloc || ZONES_DE_BLOC.indexOf(bloc.zone) < 0) return null;
    // 193-2 — une PHASE (voir `blocAPhases`) recommence la même : mêmes semaines, mêmes barres, la dernière allégée — et aucune zone
    // posée, jamais d'alternance Mix ↔ Lourd : les zones sont celles des routines.
    if (phases) return { zone: bloc.zone, semaines: nombre(bloc.semaines) || SEMAINES_PHASE, decharge: true,
                         exercices: (bloc.exercices || []).slice(), sansZones: true };
    return { zone: bloc.zone === 'mix' ? 'lourd' : 'mix', semaines: nombre(bloc.semaines),
             decharge: true, exercices: (bloc.exercices || []).slice() };
  }

  // LES EXERCICES PAR DÉFAUT : les barres polyarticulaires (au moins 3 muscles
  // principaux et secondaires, `estPolyarticulaire`) des routines du dossier,
  // dans l'ordre, sans doublon — PLUS les exercices prioritaires du
  // questionnaire (MOTEUR §9.22, 60-2b) qui sont dans ces routines, même hors
  // barre : la force se travaille lourde sur l'exercice qu'on veut améliorer.
  // `catalogue` : `{ [slug]: { equipement, muscles_primaires,
  // muscles_secondaires, muscles_stabilisateurs } }` ; `priorites` : `profiles.priorites` tel que la
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
      if (!estPolyarticulaire({ prim: e.muscles_primaires, sec: e.muscles_secondaires,
                               stab: e.muscles_stabilisateurs })) return false;
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
      // « Tenu » : la règle du bilan (`THBilan.estTenu`, observé ≥ prédit), écrite une fois (124, audit du 16/10/2026, 04 #12).
      if (racine.THBilan.estTenu({ predite: pr, observee: ob })) sortie.tenus++;
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
  // 193-2 — UNE PHASE : le programme construit pour Force et Les deux (5 semaines, la dernière allégée, MOTEUR §9.22 pour la décharge)
  // sans zone de bloc. Aucune colonne : un bloc est une phase quand CHAQUE exercice qu'il nomme a, dans une routine de son dossier, une
  // ligne à zone du jour (`routine_exercises.zone`, 193-3). La zone du bloc n'est alors qu'un placeholder exigé par la base. Si la
  // personne repasse une de ces lignes en Automatique, le bloc redevient un bloc classique : c'est cohérent. Pure.
  // `routines` : `[{ dossier, exercices: [{ exercise_slug, zone }] }]`.
  var SEMAINES_PHASE = 5;
  function blocAPhases(bloc, routines) {
    if (!bloc || !Array.isArray(bloc.exercices) || !bloc.exercices.length) return false;
    var rs = (Array.isArray(routines) ? routines : []).filter(function (r) { return r && r.dossier === bloc.dossier; });
    return bloc.exercices.every(function (slug) {
      return rs.some(function (r) {
        return (Array.isArray(r.exercices) ? r.exercices : []).some(function (x) { return !!x && x.exercise_slug === slug && !!zoneParCle(x.zone); });
      });
    });
  }

  function libelleZoneDeBloc(zone, bornes) {
    var z = zoneParCle(zone);
    if (!z) return '';
    return bornes ? z.libelle + ' (' + nombreFr(z.bas, regle('zone.bas')) + '-' + nombreFr(z.haut, regle('zone.haut')) + ')'
                  : z.libelle;
  }
  // « Bloc Mix · semaine 2 sur 4 » ; avant le début, « Bloc Mix · dès le lundi
  // 12 oct. » ; après la fin, « Bloc Mix terminé » — jusqu'au choix (§9.22).
  function badgeDuBloc(bloc, jour, phases) {
    if (!bloc) return null;
    var tete = phases ? 'Phase' : 'Bloc ' + libelleZoneDeBloc(bloc.zone);
    var k = semaineDuBloc(bloc, jour);
    if (k !== null) {
      return tete + ' · semaine ' + nombreFr(k, regle('bloc.semaine')) + ' sur ' +
        nombreFr(nombre(bloc.semaines), regle('bloc.semaines'));
    }
    var j = numeroDuJour(jourCivil(jour)), d = numeroDuJour(jourCivil(bloc.debut));
    if (j !== null && d !== null && j < d) return tete + ' · dès le ' + Modele().jourNomme(jourCivil(bloc.debut), regle('bloc.debut'));
    return phases ? 'Phase terminée' : tete + ' terminé';
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
  function carteFinDeBloc(bloc, bilan, noms, pari, phases) {
    if (!bloc || !bilan) return null;
    var nom = function (s) { return noms && noms[s] ? noms[s] : s; };
    var cP = cite(FAIT, { quoi: 'bilan' });
    var lignes = (bloc.exercices || []).filter(function (s) { return bilan.exercices[s]; }).map(function (s) {
      var x = bilan.exercices[s];
      return { nom: nom(s), valeur: chargeFois(x.premiere[0], x.premiere[1], cP) +
        (x.change ? ' → ' + chargeFois(x.derniere[0], x.derniere[1], cP) : ', inchangé') };
    });
    var p = bilan.paris, t = bilan.tenus;
    var ce = phases ? 'cette phase' : 'ce bloc';
    var phraseParis = p === 0 ? 'Le coach n’avait fait aucun pari sur ' + ce + '.'
      : 'Le coach avait fait ' + nombreFr(p, regle('bilan.paris')) + (p > 1 ? ' paris' : ' pari') + ' sur ' + ce +
        DEUX_POINTS + nombreFr(t, regle('bilan.tenus')) + (t > 1 ? ' ont tenu.' : ' a tenu.');
    var phrasePari = null;
    if (pari && nombre(pari.predite) !== null && nombre(pari.observee) !== null) {
      var pp = nombre(pari.predite), po = nombre(pari.observee);
      phrasePari = 'Le coach avait parié que tes ' + nombreFr(pp, regle('programme.predite')) + ' exercices progresseraient' +
        DEUX_POINTS + nombreFr(po, regle('programme.observee')) + (po > 1 ? ' ont progressé.' : ' a progressé.');
    }
    var suivant = blocSuivant(bloc, phases);
    if (phases) {
      var nS = suivant ? nombreFr(suivant.semaines, regle('bloc.semaines')) : null;
      return {
        titre: 'Ta phase est terminée.',
        entete: 'Pendant cette phase',
        lignes: lignes, paris: phraseParis, pari: phrasePari,
        suivant: suivant ? 'La suivante' + DEUX_POINTS + nS + ' semaines, la dernière allégée. Tes zones restent celles de tes routines.' : null,
        suivantZone: null,
        commencer: suivant ? 'Commencer une phase de ' + nS + ' semaines' : null,
        ajuster: null,
        arreter: 'Arrêter le programme'
      };
    }
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
  var MARCHE_SCHEMA = 'schema';
  var MARCHE_REPLI = 'repli';
  var MARCHE_SECHE = 'seche_rien';
  var MARCHE_SERIE_DE_PLUS = 'serie_de_plus';
  // §14 (111, 16/10/2026) — la dégressive proposée : la marche qui suit la série de plus.
  var MARCHE_DEGRESSIVE = 'degressive';
  // §10 bis (113, 16/10/2026) — au plafond de la salle, la troisième marche : un frère plus chargeable.
  var MARCHE_REMPLACEMENT = 'remplacement';
  var ORIGINE_SALLE_MAX = 'salle_max';
  var MARCHE_SILENCE = 'silence';
  // 174 (MOTEUR §14.5, §14.7) — LA 4e MARCHE : ALLÉGER au lieu de se taire. Là où l'escalier n'avait plus rien à dire (la
  // série de plus et la dégressive ont eu leur tour), le coach propose une fois d'alléger l'exercice, jusqu'au prochain progrès.
  var MARCHE_ALLEGER = 'alleger';
  // 180 (A-F-02, D4, 28/10/2026) — LA MARCHE D'EN DESSOUS, au poids du corps : 4 séances sans progrès en reps, la carte propose la marche
  // du rang juste en dessous de l'échelle de l'exercice (négatives, assistance). Elle s'ajoute avant, comme toute marche d'échelle.
  var MARCHE_DESSOUS = 'dessous';
  // 175 (MOTEUR §10 bis, décision du 26/10/2026) — LES LEVIERS DU PLAFOND : à la plus lourde de la salle, UNE carte qui
  // propose tout ce qui permet de continuer à monter (un frère plus chargeable, le tempo lent, plus de reps, une charge de
  // plus dans Ma salle) — la première marche de l'escalier du plafond. Le pari d'une réponse porte `levier`.
  var MARCHE_LEVIERS = 'leviers';
  var LEVIER_REMPLACEMENT = 'remplacement';
  var LEVIER_TEMPO = 'tempo';
  var LEVIER_REPS = 'reps';
  var LEVIER_SALLE = 'salle';
  var TEMPO_DESCENTE_S = 3;        // « Tempo lent : 3 s en descente »
  var RALLONGE_REPS = 3;           // « Viser [haut + 3] reps »
  var RALLONGE_MAX_REPS = 30;      // au plus (le plafond des reps au poids du corps, `PLAFOND_CIBLE`)
  var RALLONGE_MAX_FORCE = 8;      // au plus, quand le haut de la zone est ≤ 5 (la force)
  var HAUT_FORCE = 5;
  // Lourd → Mix, Mix → Lourd : le schéma voisin, et les deux libellés.
  var SCHEMAS = {
    lourd: { vers: 'mix', oui: 'Passer à 6-8 reps', non: 'Garder 3-5' },
    mix: { vers: 'lourd', oui: 'Passer à 3-5 reps', non: 'Garder 6-8' }
  };
  var DETAIL_SCHEMA = 'En force, une série de plus aide peu. Changer de schéma quelques semaines ' +
    'peut relancer la barre, avant d\'y revenir.';
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
  //
  // §14 (111, « La dégressive proposée », 16/10/2026) — `degressive`
  // (facultatif) : `{ possible, proposee, ici }`. Quand ses conditions sont
  // réunies (`possible`, `degressivePossible`), la marche qui suit la série de
  // plus (acceptée ou refusée) est la dégressive, et le repli recule d'une
  // marche : n = 2 → la dégressive, n = 3 → le repli si elle a été proposée
  // depuis le dernier progrès (`proposee`), sinon le silence. Sans elles,
  // l'escalier est inchangé. Une dégressive répondue DANS CETTE SÉANCE (`ici`)
  // le reste : la ligne qu'elle a ajoutée ne la retire pas en pleine séance.
  // Pas de dégressive au poids du corps ni sur une aide (§9.17, I30) : le
  // silence, comme le repli.
  function marcheIsolee(n, zone, phase, place, proposee, palier, degressive) {
    var m = marcheIsoleeBrute(n, zone, phase, place, proposee, degressive);
    var p = nombre(palier);
    if (p !== null && p <= 0 && m === MARCHE_DEGRESSIVE) return MARCHE_SILENCE;
    if (p === 0 && (m === MARCHE_SCHEMA || m === MARCHE_REPLI)) return MARCHE_SILENCE;
    if (p !== null && p < 0 && m === MARCHE_REPLI) return MARCHE_SILENCE;
    return m;
  }

  function marcheIsoleeBrute(n, zone, phase, place, proposee, degressive) {
    var d = degressive || {};
    var k = nombre(n);
    if (k === null || k < 1) return null;
    if (k >= 4) return MARCHE_SILENCE;
    if (k === 3) return d.proposee === true ? MARCHE_REPLI : MARCHE_SILENCE;
    var muscle = !estZoneForce(zone) && phase !== 'seche';
    if (k === 2) {
      // Les conditions (zone, phase comprises) ne se lisent QUE dans
      // `degressivePossible` : une seule source.
      if (proposee === true && (d.possible === true || d.ici === true)) return MARCHE_DEGRESSIVE;
      return !muscle || proposee === true ? MARCHE_REPLI : MARCHE_SILENCE;
    }
    if (estZoneForce(zone)) return MARCHE_SCHEMA;
    if (phase === 'seche') return MARCHE_SECHE;
    // Audit du 16/10/2026, 01 #6 — LA SÉRIE DE PLUS DEMANDE UNE ZONE MUSCLE : une consigne sans zone (règle de
    // bord) recevait la carte, et son acceptation n'ajoutait rien (`seriesDePlusActives` exige une zone). Sans
    // zone, comme sans place : le repli, s'il y en a un (sans zone, il n'y en a pas : le silence).
    return place === true && zone !== null && zone !== undefined ? MARCHE_SERIE_DE_PLUS : MARCHE_REPLI;
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
  //
  // Audit du 16/10/2026, 01 #5 — CONDITION (1), « STRICTEMENT INFÉRIEUR AU
  // PALIER ACTUEL » : `o.actuel`, le palier de la consigne. Le meilleur du
  // compteur peut être au-dessus (une séance suivie à une charge plus basse,
  // après une chute, compte sans progrès) : borné par le seul meilleur, un
  // repli entre les deux faisait MONTER la charge. Le plafond est le plus bas
  // des deux ; la limite de 10 % reste lue sous le meilleur (condition 5).
  function repliEscalier(seances, avant, meilleur, zone, options) {
    var o = options || {};
    var z = zoneParCle(zone);
    var M = meilleur ? nombre(meilleur.palier) : null;
    var t0 = instant(avant);
    if (!z || M === null || t0 === null) return null;
    var plancher = M * (1 - REPLI_MAX_REPRISE) - 1e-9;
    var actuel = nombre(o.actuel);
    var haut = actuel !== null && actuel < M ? actuel : M;
    var liste = anterieures(seances || [], avant);
    for (var i = liste.length - 1; i >= 0; i--) {
      var se = liste[i];
      if (t0 - instant(se.debut) > FENETRE_REPLI_JOURS * JOUR) break;
      if (se.neutre === true || se.decharge === true) continue;
      var v = vueDeSeance(se);
      var P = nombre(v.palier);
      if (P === null || P > haut || memeCharge(P, haut) || P < plancher) continue;
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
      fondement: fondementApproche(c, false),
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
         l.fondement.marche === MARCHE_SERIE_DE_PLUS || l.fondement.marche === MARCHE_DEGRESSIVE ||
         l.fondement.marche === MARCHE_REMPLACEMENT || l.fondement.marche === MARCHE_ALLEGER ||
         l.fondement.marche === MARCHE_LEVIERS || l.fondement.marche === MARCHE_DESSOUS);
    }).map(function (l) {
      var f = l.fondement;
      var m = { id: l.id || null, seance: f.seance || null, jour: f.jour || null,
                exercice: f.exercice || l.exercise_slug || null, marche: f.marche,
                reponse: f.reponse || null, compteur: nombre(f.compteur), debut: f.debut || null,
                n: nombre(f.n_routine) };
      // §10 bis (113) — une marche AU PLAFOND DE LA SALLE : son origine et le plafond qu'elle parie de tenir.
      if (f.origine === ORIGINE_SALLE_MAX) {
        m.origine = ORIGINE_SALLE_MAX;
        m.plafond = f.plafond && typeof f.plafond === 'object'
          ? { charge: nombre(f.plafond.charge), reps: nombre(f.plafond.reps) } : null;
      }
      // 175 — le levier choisi sur la carte des leviers (`remplacement`, `tempo`, `reps`, `salle`), et la visée de « reps ».
      if (f.marche === MARCHE_LEVIERS) {
        m.levier = typeof f.levier === 'string' ? f.levier : null;
        m.visee = nombre(f.visee);
        // Le plafond au moment du choix (la plus lourde et ses reps) : la visée « reps » ne vaut que pour CETTE charge. Un
        // pari de leviers n'a pas d'`origine` : il s'observe comme toute marche (le progrès avant le prochain déclenchement).
        m.plafond = f.plafond && typeof f.plafond === 'object'
          ? { charge: nombre(f.plafond.charge), reps: nombre(f.plafond.reps) } : null;
      }
      return m;
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
  // 179 (C-F8) — LE POURCENTAGE SE CALCULE : une série de plus sur `n` séries de la routine ajoute 1/n du travail (3 séries : 33 %,
  // 4 : 25 %, 5 : 20 %). Le nombre de séries de la routine absent, la phrase ne chiffre rien.
  function detailSerieDePlus(nRoutine) {
    var n = nombre(nRoutine);
    var base = 'Sur cet exercice, une série de plus aide souvent';
    return n !== null && n >= 1
      ? base + ' : environ ' + Math.round(100 / n) + ' % de travail en plus.'
      : base + ' : du travail en plus.';
  }
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
  function carteSerieDePlus(meilleur, compteur, avancent, muscles, parPriorite, nRoutine) {
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined) return null;
    var sujet = (parPriorite && parPriorite.length ? sujetDesPriorites(parPriorite) : null) ||
      sujetDesMuscles(muscles);
    return {
      type: MARCHE_SERIE_DE_PLUS,
      phrase: meilleurDepuis(meilleur, compteur) + (avancent ? ', et tes autres exercices avancent.' : '.'),
      detail: detailSerieDePlus(nRoutine) + (sujet ? ' ' + sujet : ''),
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

  // ══ §14 (111, 16/10/2026) — L'ESCALIER, LA DÉGRESSIVE PROPOSÉE ═══════════
  //
  // « Le coach peut proposer une dégressive comme une marche de l'escalier,
  // après la série de plus. » Une seule baisse, sur la dernière série de
  // travail, remplie par §9.15.3 ; la carte et le geste de la série de plus ;
  // le pari de l'escalier (marche « degressive »). La ligne dégressive, elle,
  // ne porte toujours aucun pari (§9.15.4).
  // Le signe moins (U+2212) est celui de la phrase décidée, écrit tel quel :
  // une phrase fixe, aucun nombre formaté ici.
  var DETAIL_DEGRESSIVE = '−20 à 25 %, sans repos, jusqu\'à l\'échec. ' +
    'La même croissance en moins de temps (Sødal et al. 2023).';
  var QUESTION_DEGRESSIVE = ' Une dégressive après ta dernière série ?';

  // LES CONDITIONS, toutes requises : une isolation (`polyarticulaire` faux —
  // `estPolyarticulaire`, la définition de la salle) ; la routine (ou la
  // saisie) n'a pas déjà de ligne dégressive sur l'exercice ; ni en sèche, ni
  // en zone force (Lourd, Mix), ni en décharge (semaine allégée ou décharge
  // planifiée), ni en Entretenir (I13), ni pour un débutant.
  function degressivePossible(o) {
    var c = o || {};
    return c.polyarticulaire === false && !estZoneForce(c.zone) && c.phase !== 'seche' &&
      !c.allegee && !c.entretien && !c.debutant && !c.aUneDegressive;
  }

  // Une dégressive a-t-elle été proposée (acceptée ou refusée) depuis le
  // dernier progrès ? La règle de toutes les marches (`marcheProposee`).
  function degressiveProposee(exercice, jour, compteur, marches, compteurs) {
    return marcheProposee(exercice, jour, compteur, marches, compteurs, MARCHE_DEGRESSIVE) !== null;
  }

  // LA DÉGRESSIVE EN COURS : acceptée, et pas de progrès depuis — comme la
  // série de plus, elle revient à chaque séance de l'exercice jusqu'à son
  // prochain progrès. Rend le pari (la plus récente acceptation), ou `null`.
  function degressiveActive(exercice, jour, compteur, marches, compteurs) {
    var a = marchesDepuisProgres(exercice, jour, compteur, marches, compteurs, MARCHE_DEGRESSIVE, ['acceptee']);
    if (!a.length) return null;
    return a.slice().sort(function (x, y) { return avantAlpha(String(y.jour), String(x.jour)); })[0];
  }

  // LA CARTE, sous l'exercice : « 27 kg × 12 reste ta meilleure charge de
  // travail depuis 8 séances. Une dégressive après ta dernière série ? » ; le
  // détail ; « Ajouter une dégressive » / « Non merci ».
  function carteDegressive(meilleur, compteur) {
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined) return null;
    return {
      type: MARCHE_DEGRESSIVE,
      phrase: meilleurDepuis(meilleur, compteur) + '.' + QUESTION_DEGRESSIVE,
      detail: DETAIL_DEGRESSIVE,
      oui: 'Ajouter une dégressive', non: 'Non merci'
    };
  }

  // ══ §14.5, §14.7 (174, 26/10/2026) — L'ESCALIER, LA 4e MARCHE : ALLÉGER ═════════
  //
  // « Après la série de plus et la dégressive, un exercice bloqué n'entend plus rien » : désormais, là où la marche serait
  // le SILENCE (à partir du 3e déclenchement isolé), le coach propose d'alléger, une fois par blocage (« une marche proposée
  // ne revient pas »). Aller à l'échec n'est jamais un motif : la marche ne lit que le compteur et la routine.
  //
  //   zone muscle (haut > 5), 3 séries ou plus  une série de moins, dégressive retirée, même charge, mêmes reps ;
  //   zone muscle, 2 séries ou moins            séries gardées, dégressive retirée, le cran en dessous, au bas de la zone ;
  //   zone force (haut <= 5)                    séries gardées, dégressive retirée, l'arrondi au cran de P x 0,95 ;
  //   poids du corps, aide (palier <= 0)        une série de moins si la routine en compte 3 ou plus, sinon le silence.
  //
  // Les crans (`cran`, `cinq`) se lisent sur l'historique : `consigneDExercice` les fige avec la consigne, comme le repli.
  var ALLEGER_DES = 3 * PAS_ESCALIER;      // le 3e déclenchement : compteur 12
  var ALLEGER_PART = 0.95;
  function crans(seances, avant, palier, equipement, salle) {
    var P = nombre(palier);
    if (P === null || P <= 0) return null;
    var voisineFn = function (charge, sens) { return voisineSalleComprise(seances, avant, charge, equipement, sens, salle || null); };
    return { cran: voisineFn(P, -1), cinq: cranSousProcheDe(voisineFn, P, P * ALLEGER_PART) };
  }
  function allegerForce(zone) { var z = zoneParCle(zone); return z !== null && z.haut <= 5; }
  // La proposition : `{ mode, routine, series, charge, vise }` ou `null` (le silence). `env` : `{ cran, cinq }` figés avec
  // la consigne ; `nRoutine` : les séries de travail de la routine.
  function propositionAlleger(consigne, env, nRoutine) {
    var c = consigne || null;
    var z = c ? zoneParCle(c.zone) : null;
    var N = nombre(nRoutine), P = c ? nombre(c.palier) : null;
    if (!c || c.etat === 'silence' || !c.ligne || z === null || P === null || N === null || N < 1) return null;
    var e = env || {};
    if (P <= 0) return N >= 3 ? { mode: 'serie', routine: N, series: N - 1, charge: null, vise: nombre(c.ligne.vise) } : null;
    if (allegerForce(c.zone)) {
      var cinq = nombre(e.cinq);
      return cinq === null || cinq >= P - 1e-9 ? null
        : { mode: 'force', routine: N, series: N, charge: cinq, vise: nombre(c.ligne.vise) };
    }
    if (N >= 3) return { mode: 'serie', routine: N, series: N - 1, charge: null, vise: nombre(c.ligne.vise) };
    var cran = nombre(e.cran);
    return cran === null || cran >= P - 1e-9 ? null : { mode: 'cran', routine: N, series: N, charge: cran, vise: z.bas };
  }
  // LA CONSIGNE ALLÉGÉE D'UN EXERCICE (pas la semaine allégée, §14.4) : sans ligne haute, la charge de la proposition, le
  // nombre de séries qu'elle couvre (`couvre`, seulement quand une série part). `alleger` dit de quoi écrire l'en-tête et I66.
  function consigneAlleger(consigne, prop) {
    var c = consigne || null;
    if (!c || !prop || c.etat === 'silence' || !c.ligne) return c;
    var ligne = prop.charge === null ? c.ligne : { charge: prop.charge, vise: prop.vise };
    var sortie = Object.assign({}, c, {
      ligne: ligne, haut: null,
      // I61 : « approchée » ne reste au fondement que si la ligne gardée l'est (la ligne haute, souvent la seule approchée, part).
      fondement: fondementApproche(c, !!ligne && ligne.approchee === true),
      alleger: { mode: prop.mode, routine: prop.routine, series: prop.series, charge: prop.charge, palier: nombre(c.palier) }
    });
    if (prop.mode === 'serie') { sortie.n = prop.series; sortie.couvre = prop.series; }
    return sortie;
  }
  var ALLEGER_QUI = { serie: 'une série de moins', cran: 'un cran plus bas', force: 'moins lourd' };
  function grisAlleger(a) {
    var m = a && ALLEGER_QUI[a.mode];
    return m ? m + ', sans dégressive, jusqu\'à ton prochain progrès' : null;
  }
  // « 107 kg × 10 depuis 13 séances. Une série de moins reste la sortie. » — le rappel d'une marche refusée.
  function phraseRappelAlleger(meilleur, compteur, mode) {
    var q = ALLEGER_QUI[mode];
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined || !q) return null;
    return Modele().charge(meilleur.palier, undefined, cite(FAIT, { quoi: 'meilleur' })) + ' × ' +
      nombreFr(meilleur.niveau, cite(FAIT, { quoi: 'meilleur', champ: 'reps' })) +
      ' depuis ' + nombreFr(compteur, regle('compteur')) + ' séances. ' + q.charAt(0).toUpperCase() + q.slice(1) +
      ' reste la sortie.';
  }
  // LA CARTE : le titre (le meilleur et le compteur) ; le détail se rédige à part, hors capture (`detailAlleger`).
  function carteAlleger(meilleur, compteur, prop) {
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined || !prop) return null;
    return {
      type: MARCHE_ALLEGER, mode: prop.mode,
      phrase: Modele().charge(meilleur.palier, undefined, cite(FAIT, { quoi: 'meilleur' })) + ' × ' +
        nombreFr(meilleur.niveau, cite(FAIT, { quoi: 'meilleur', champ: 'reps' })) +
        ' depuis ' + nombreFr(compteur, regle('compteur')) + ' séances',
      oui: 'Alléger',
      non: prop.mode === 'serie' ? 'Garder ' + prop.routine + ' séries' : prop.mode === 'force' ? 'Garder la charge' : 'Non merci',
      gris_apres: grisAlleger(prop)
    };
  }
  // « Une série de plus, puis la dégressive, n'ont rien changé. On allège : 2 séries au lieu de 3, sans dégressive, même
  // charge. La fatigue redescend, la charge remontera. » `avant` : `{ serie, degressive }`, les marches déjà proposées.
  function detailAlleger(prop, avant, palier) {
    if (!prop) return null;
    var a = avant || {};
    var debut = a.serie && a.degressive ? 'Une série de plus, puis la dégressive, n\'ont rien changé.'
      : a.serie ? 'Une série de plus n\'a rien changé.' : a.degressive ? 'La dégressive n\'a rien changé.'
      : 'Rien n\'a changé depuis le début de ce blocage.';
    var fin = ' La fatigue redescend, la charge remontera.';
    if (prop.mode === 'serie') {
      return debut + ' On allège : ' + Modele().nombre(prop.series) + ' séries au lieu de ' + Modele().nombre(prop.routine) +
        ', sans dégressive, même charge.' + fin;
    }
    if (prop.mode === 'cran') {
      return debut + ' On allège : un cran plus bas, ' + Modele().chargeFois(prop.charge, prop.vise) +
        ' (le bas de ta zone), sans dégressive.' + fin;
    }
    return debut + ' On allège : ' + Modele().charge(prop.charge) + ' au lieu de ' + Modele().charge(palier) +
      ', environ 5 % de moins, mêmes séries, sans dégressive.' + fin;
  }
  // ══ 174 (3/3, décidé le 26/10/2026) — SOUS 3 REPS, SIX SÉANCES SANS MONTER : LA ZONE 3-5 EST PROPOSÉE ══════════
  //
  // « Quand le compte des séances de bord sans monter atteint 6, le coach PROPOSE de passer l'exercice en zone 3-5 quelques
  // semaines. Il ne change rien sans accord. » Le compte est le COMPTE LONG de la règle de bord (`_bord.total`, que la vague
  // ne remet pas à zéro) ; la marche est celle du schéma (`MARCHE_SCHEMA`) : la même carte, la même réponse, la même zone
  // posée (`poserZone`) à l'acceptation, le même silence dans un bloc de programme en cours (I39). Elle part d'une
  // consigne SANS ZONE : `bord` est figé avec la consigne (`consigneDExercice`) et dit ce que la carte écrit. Aller à
  // l'échec n'est jamais un motif : seul le compte parle.
  var BORD_PROPOSE_DES = 6;
  var DETAIL_BORD_SCHEMA = 'Quelques semaines en 3-5 reps peuvent relancer la barre, avant d\'y revenir.';
  // `{ total, charge, reps, aRecule, depuis }` à partir de la sixième séance sans dépasser le record ; sinon `null`.
  function bordSansMonter(consigne) {
    var b = consigne && consigne._bord;
    if (!b || (consigne.zone !== null && consigne.zone !== undefined)) return null;
    if (nombre(b.total) === null || b.total < BORD_PROPOSE_DES) return null;
    return { total: b.total, charge: b.record, reps: b.repsRecord, aRecule: b.aRecule === true, depuis: b.depuisRecord || null };
  }
  // « 140 kg × 2 depuis 6 séances, malgré le recul. » — le détail se lit à part (hors capture : il écrit « 3-5 »).
  function carteBordSchema(bord) {
    if (!bord || nombre(bord.charge) === null || nombre(bord.reps) === null) return null;
    var cB = cite(FAIT, { quoi: 'bord.record' });
    var r = nombre(bord.reps);
    return {
      zone: null, nouvelle_zone: 'lourd',
      phrase: Modele().charge(bord.charge, undefined, cB) + ' × ' + nombreFr(r, cite(FAIT, { quoi: 'bord.record', champ: 'reps' })) +
        ' depuis ' + nombreFr(bord.total, cite(FAIT, { quoi: 'bord.long' })) + ' séances' +
        (bord.aRecule ? ', malgré le recul.' : '.'),
      detail: DETAIL_BORD_SCHEMA, oui: 'Passer à 3-5 reps',
      non: r === 1 ? 'Garder les simples' : r === 2 ? 'Garder les doubles' : 'Garder ' + Modele().nombre(r) + ' reps'
    };
  }

  // ══ 186 (décision d'Aurélien du 29/10/2026, MOTEUR §9.1.2) — « PASSER EN <ZONE SUIVANTE> » APRÈS TROIS SÉANCES AU-DESSUS DU HAUT ══
  //
  // La zone ne bascule plus seule sur un dépassement (`repsPlafonnees`). Quand la personne, trois séances de suite, reste à la même
  // charge de travail (sous ce que la consigne proposait) alors que son niveau passe le haut de sa zone, le coach PROPOSE la zone
  // suivante (Volume -> Séries longues). Même carte et même réponse que le schéma (`MARCHE_SCHEMA`, `poserZone` à l'acceptation) ;
  // « Garder <zone> » est écrit (un pari refusé) et se tait six séances.
  var DEPASSEMENT_PROPOSE_DES = 3;
  var DEPASSEMENT_SILENCE = 6;
  // `{ n, charge, niveau, zone, vers, jours }` ou `null`. `jours` : les jours civils des six dernières séances lues (le plan compte
  // celles qui suivent un refus).
  function depassementLong(seances, avant, consigne) {
    var z = consigne && consigne.zone ? zoneParCle(consigne.zone.cle || consigne.zone) : null;
    if (z === null) return null;
    var i = -1;
    for (var k = 0; k < ZONES.length; k++) if (ZONES[k].cle === z.cle) i = k;
    var suivante = i >= 0 && i + 1 < ZONES.length ? ZONES[i + 1] : null;
    if (suivante === null || estZoneForce(z.cle)) return null;
    var lecture = lectureDuCouple((seances || []).map(vueDeSeance), avant);
    if (lecture === null || lecture.duCouple.length < DEPASSEMENT_PROPOSE_DES) return null;
    var dernieres = lecture.duCouple.slice(-DEPASSEMENT_PROPOSE_DES);
    var P = nombre(dernieres[dernieres.length - 1].seance.palier);
    if (P === null) return null;
    var niveaux = [];
    var ok = dernieres.every(function (x) {
      var p = nombre(x.seance.palier);
      var n = niveauHorsAuMax(x.auPalier);   // 193-6 : une série « Au max » ne propose jamais de changer de zone
      if (p === null || !memeCharge(p, P) || n === null || !(n > z.haut)) return false;
      niveaux.push(n);
      return true;
    });
    if (!ok) return null;
    return { n: DEPASSEMENT_PROPOSE_DES, charge: P, niveau: Math.min.apply(null, niveaux), zone: z.cle, vers: suivante.cle,
             jours: lecture.duCouple.slice(-DEPASSEMENT_SILENCE).map(function (x) { return jourCivil(x.seance.debut); }) };
  }
  function carteDepassement(d) {
    if (!d || nombre(d.charge) === null || nombre(d.niveau) === null) return null;
    var de = zoneParCle(d.zone), vers = zoneParCle(d.vers);
    if (de === null || vers === null) return null;
    var cD = cite(FAIT, { quoi: 'depassement' });
    return {
      zone: d.zone, nouvelle_zone: d.vers,
      phrase: Modele().charge(d.charge, undefined, cD) + ' × ' + nombreFr(d.niveau, cite(FAIT, { quoi: 'depassement', champ: 'reps' })) +
        ' depuis ' + nombreFr(d.n, cite(FAIT, { quoi: 'depassement.n' })) + ' séances, au-dessus du haut de ta zone.',
      detail: 'Tu fais plus de reps que ta zone n\'en vise. ' + vers.libelle + ' te les compte : tu restes à ' +
        'la même charge, ta zone suit tes reps.',
      oui: 'Passer en ' + vers.libelle, non: 'Garder ' + de.libelle
    };
  }

  // 180 (A-F-02, D4) — LA CARTE DE LA MARCHE D'EN DESSOUS : un fait (« Poids du corps × 1 depuis 4 séances »), la marche du rang
  // juste en dessous de l'échelle, « Ajouter <nom> » / « Pas maintenant ». Elle s'ajoute avant l'exercice comme la carte « marche
  // suivante » (2 séries, autant de reps que possible) ; l'exercice reste. Descriptive, jamais un verdict.
  function carteDessous(meilleur, compteur, nom) {
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined || !nom) return null;
    return {
      type: MARCHE_DESSOUS, nom: nom,
      phrase: Modele().charge(meilleur.palier, undefined, cite(FAIT, { quoi: 'meilleur' })) + ' × ' +
        nombreFr(meilleur.niveau, cite(FAIT, { quoi: 'meilleur', champ: 'reps' })) +
        ' depuis ' + nombreFr(compteur, regle('compteur')) + ' séances.',
      oui: ouiMarche(nom), non: NON_MARCHE
    };
  }
  // Le détail s'écrit hors de la capture de la phrase (comme `detailAlleger`) : il n'est pas une phrase vérifiée par I26.
  function detailDessous(nom) {
    return 'La marche d\'en dessous : ' + nom + '. Je te propose d\'en faire ' + nombreFr(SERIES_MARCHE, regle('constante')) +
      ' séries avant, autant de reps que tu peux. Ton exercice reste.';
  }

  // La marche proposée (acceptée ou refusée) depuis le dernier progrès, ou l'acceptée en cours.
  function allegerProposee(exercice, jour, compteur, marches, compteurs) {
    return marcheProposee(exercice, jour, compteur, marches, compteurs, MARCHE_ALLEGER);
  }
  function allegerActive(exercice, jour, compteur, marches, compteurs) {
    var a = marchesDepuisProgres(exercice, jour, compteur, marches, compteurs, MARCHE_ALLEGER, ['acceptee']);
    if (!a.length) return null;
    return a.slice().sort(function (x, y) { return avantAlpha(String(y.jour), String(x.jour)); })[0];
  }

  // ══ §10 bis (113, décidé le 16/10/2026) — AU PLAFOND DE LA SALLE, LE COACH PROPOSE ══
  //
  // « Au plafond de la salle (la plus lourde de la salle, au haut de la fourchette), l'escalier propose, une marche
  // par déclenchement, dans cet ordre : 1. la série de plus (§14.7), dans la limite de la règle de volume du §14.6 ;
  // 2. la dégressive (§14.8), aux conditions du §14.8 ; 3. un autre exercice de la même famille, qui permet de
  // charger plus dans la salle déclarée ; 4. au-delà, le coach maintient, et la phrase reste un fait. Le changement
  // de schéma et le repli ne sont jamais proposés au plafond : c'est la salle qui bloque, pas la personne. Une marche
  // sans objet est sautée. »
  //
  // « Au plafond » : à la plus lourde de la salle (`aLaPlusLourdeDeLaSalle`) ET le niveau validé de la dernière
  // séance au plafond des reps (`salle.maintien`, posé par la consigne) — UNE définition, que le plan, I47 et
  // l'observation lisent. À la plus lourde SOUS le plafond, la personne peut encore gagner des reps : l'escalier
  // ordinaire (§14.5) — c'est elle qui bloque, pas la salle.
  var MARCHES_PLAFOND = [MARCHE_LEVIERS, MARCHE_SERIE_DE_PLUS, MARCHE_DEGRESSIVE];
  var QUESTION_SERIE_PLAFOND = ' Une série de plus ?';
  function auPlafondDeLaSalle(consigne, salle) {
    if (!aLaPlusLourdeDeLaSalle(consigne, salle)) return false;
    var f = consigne.fondement;
    return !!(f && f.salle && f.salle.maintien === true);
  }
  // Le plafond d'une consigne au plafond : `{ charge, reps }` — la plus lourde de la salle, et le plafond des reps
  // (`plafondALaSalle`, figé dans le fondement). `null` hors plafond.
  function plafondDeLaConsigne(consigne, salle) {
    if (!auPlafondDeLaSalle(consigne, salle)) return null;
    var s = salleDeLaConsigne(consigne, salle);
    return { charge: maxDeLaSalle(s), reps: nombre(consigne.fondement.salle.plafond) };
  }

  // LA MARCHE DU DÉCLENCHEMENT, au plafond. `compteur` : le compteur à l'ouverture (un déclenchement : 4, 8, 12…) ;
  // `proposees` : `{ [marche]: pari | null }`, la marche proposée (acceptée ou refusée) depuis le dernier progrès —
  // `marcheProposee` ; `objets` : `{ [marche]: bool }`, la marche a-t-elle un objet (la place du §14.6 pour la série
  // de plus, les conditions du §14.8 pour la dégressive, un frère plus chargeable pour le remplacement).
  // Hors d'un déclenchement : `null` (124, audit du 16/10/2026, 01 #15 — la marche ne se demande qu'à un
  // déclenchement, `marcheDuPlafond` ; la branche qui rendait `deja` entre deux déclenchements n'était jamais lue).
  // Une marche déjà proposée AU MÊME DÉCLENCHEMENT (cette séance, ou une autre du même compteur) le reste : rendue
  // avec son pari (`deja`), sans carte. Sinon, la première marche APRÈS la dernière proposée, qui a un objet ; les
  // marches sautées ne reviennent pas (une marche par déclenchement, dans cet ordre). Aucune : `null`, le coach
  // maintient. Rend `{ marche, deja }`.
  function marcheAuPlafond(compteur, proposees, objets) {
    var k = nombre(compteur);
    if (k === null) return null;
    var p = proposees || {}, o = objets || {};
    // 175 (MOTEUR §10 bis) — LES LEVIERS D'ABORD, et sans attendre un déclenchement : la première séance où le plafond est
    // atteint, la carte des leviers (une réponse, gardée) ; elle ne revient pas depuis le dernier progrès. Ensuite
    // seulement, aux déclenchements, la série de plus et la dégressive.
    if (!p[MARCHE_LEVIERS] && o[MARCHE_LEVIERS] === true) return { marche: MARCHE_LEVIERS, deja: null };
    if (!estDeclenchement(k)) return null;
    var iDerniere = -1;
    MARCHES_PLAFOND.forEach(function (mk, i) { if (p[mk]) iDerniere = i; });
    if (iDerniere >= 0) {
      var d = p[MARCHES_PLAFOND[iDerniere]];
      var dc = nombre(d.compteur);
      if (dc !== null && Math.floor(dc / PAS_ESCALIER) === Math.floor(k / PAS_ESCALIER)) {
        return { marche: MARCHES_PLAFOND[iDerniere], deja: d };
      }
    }
    for (var j = iDerniere + 1; j < MARCHES_PLAFOND.length; j++) {
      if (o[MARCHES_PLAFOND[j]] === true) return { marche: MARCHES_PLAFOND[j], deja: null };
    }
    return null;
  }

  // « Plus chargeable dans la salle déclarée » : un frère qui se charge (mesure charge et reps) et que la salle ne
  // plafonne pas sous la charge d'aujourd'hui. Sa salle (`THProfil.salleDeLExercice`, comme pour l'exercice) : `null`
  // — une machine, une poulie, une barre qu'on charge, un matériel non déclaré — il n'est pas plafonné ; déclarée,
  // sa plus lourde (la paire pour des haltères, dans l'unité des séries, §10.1) dépasse `chargeMax`.
  function plusChargeableALaSalle(frere, chargeMax) {
    if (!frere || frere.mesure !== 'charge_reps') return false;
    if (!frere.salle) return true;
    var m = maxDeLaSalle(frere.salle), c = nombre(chargeMax);
    return m !== null && c !== null && m > c && !memeCharge(m, c);
  }
  // LE REMPLAÇANT : le premier des frères, dans l'ordre de « Remplacer » (`Seance.freresProposes`, l'app le donne),
  // qui n'est ni écarté, ni hors du matériel du profil, ni déjà dans la séance, et qui est plus chargeable. `null` :
  // aucun — la marche est sans objet.
  function remplacantAuPlafond(freres, chargeMax) {
    return (freres || []).filter(function (f) {
      return f && f.slug && !f.ecarte && !f.hors && !f.deja && plusChargeableALaSalle(f, chargeMax);
    })[0] || null;
  }

  // « 30 kg × 15 depuis 4 séances, et ta salle n'a pas plus lourd. » — le meilleur et le compteur, aux espaces de
  // `meilleurDepuis` (insécable avant « kg », espaces ordinaires autour de ×).
  function phrasePlafond(meilleur, compteur) {
    return Modele().charge(meilleur.palier, undefined, cite(FAIT, { quoi: 'meilleur' })) + ' × ' +
      nombreFr(meilleur.niveau, cite(FAIT, { quoi: 'meilleur', champ: 'reps' })) +
      ' depuis ' + nombreFr(compteur, regle('compteur')) + ' séances, et ta salle n\'a pas plus lourd.';
  }
  // LA CARTE AU PLAFOND : la carte de la marche (§14.7, §14.8), sa première phrase remplacée par celle du plafond,
  // suivie de la question de la marche. Le remplacement : « Passer à {nom} ? », son détail (calculé hors capture par
  // `detailRemplacement`), « Changer d'exercice » / « Non merci ».
  function cartePlafond(marche, meilleur, compteur, o) {
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined) return null;
    var x = o || {};
    // 175 — la carte des leviers a sa propre phrase (`carteLeviers`) et ne cite pas le compteur : le début se rédige sous la
    // série de plus et la dégressive seulement (une citation non écrite fait échouer I26).
    if (marche === MARCHE_LEVIERS) return carteLeviers(meilleur, x.sens);
    var debut = phrasePlafond(meilleur, compteur);
    if (marche === MARCHE_SERIE_DE_PLUS) {
      var sp = carteSerieDePlus(meilleur, compteur, false, x.muscles, x.parPriorite, x.nRoutine);
      return Object.assign({}, sp, { phrase: debut + QUESTION_SERIE_PLAFOND, plafond: true });
    }
    if (marche === MARCHE_DEGRESSIVE) {
      return { type: MARCHE_DEGRESSIVE, phrase: debut + QUESTION_DEGRESSIVE, detail: DETAIL_DEGRESSIVE,
               oui: 'Ajouter une dégressive', non: 'Non merci', plafond: true };
    }
    return null;
  }
  // ══ 175 (MOTEUR §10 bis, décision d'Aurélien du 26/10/2026) — À LA PLUS LOURDE DE LA SALLE : TOUS LES LEVIERS D'UN COUP ══
  //
  // « 30 kg × 15, la plus lourde de ta salle. Pour continuer à monter : » — UNE carte, la première séance où le plafond est
  // atteint (`marcheAuPlafond`), avec les leviers qui ont un objet, dans cet ordre : un frère plus chargeable (le remplaçant
  // d'avant, même fonction), le tempo lent (3 s en descente, même charge, même zone), plus de reps (la zone s'allonge de 3,
  // au plus 30 — 8 si le haut est ≤ 5), une charge de plus dans Ma salle. « Garder » est un refus, gardé et relu. Une réponse
  // par carte. Le moteur propose, la personne décide. Aller à l'échec n'est jamais un motif.
  var NON_LEVIERS = 'Garder';
  // La phrase de la carte (rédigée sous capture, §20 bis) : le meilleur au plafond, comme la phrase de maintien.
  // `sens` : au bout d'une liste d'élastiques (132), « ton élastique le plus fort » (résistance) ou « le plus léger » (aide), comme
  // la phrase de maintien de la consigne ; le nom de l'élastique vient du formateur (`avecNoms`).
  function carteLeviers(meilleur, sens) {
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined) return null;
    var bout = sens === 'aide' ? ', ton élastique le plus léger' : sens === 'resistance' ? ', ton élastique le plus fort'
      : ', la plus lourde de ta salle';
    return {
      type: MARCHE_LEVIERS, non: NON_LEVIERS, plafond: true,
      phrase: Modele().charge(meilleur.palier, undefined, cite(FAIT, { quoi: 'meilleur' })) + ' × ' +
        nombreFr(meilleur.niveau, cite(FAIT, { quoi: 'meilleur', champ: 'reps' })) +
        bout + '. Pour continuer à monter' + INSECABLE + ':'
    };
  }
  // Les LEVIERS d'une exercice au plafond, dans l'ordre, ceux qui ont un objet. `o` : `{ remplacant, detail, charge, reps,
  // tempoActif }` — le remplaçant (`remplacantAuPlafond`) et son détail (`detailRemplacement`), la plus lourde et le plafond
  // des reps (`plafondDeLaConsigne`), le tempo déjà en cours depuis le dernier progrès. Une donnée : l'écran la dessine, la
  // page de l'exercice la relit, rien n'y est recalculé. `[{ cle, texte, vers?, detail?, visee? }]`.
  function leviersDuPlafond(o) {
    var x = o || {};
    var liste = [];
    if (x.remplacant && x.remplacant.slug) {
      liste.push({ cle: LEVIER_REMPLACEMENT, texte: x.remplacant.nom || x.remplacant.slug, vers: x.remplacant.slug,
                   detail: x.detail || null });
    }
    if (x.tempoActif !== true) {
      liste.push({ cle: LEVIER_TEMPO, texte: 'Tempo lent' + DEUX_POINTS + Modele().secondes(TEMPO_DESCENTE_S) + ' en descente' });
    }
    var v = viseeDuLevier(x.reps);
    var c = nombre(x.charge);
    if (v !== null && c !== null) {
      liste.push({ cle: LEVIER_REPS, texte: 'Viser ' + Modele().nombre(v) + ' reps à ' + Modele().charge(c), visee: v });
    }
    liste.push({ cle: LEVIER_SALLE, texte: 'Ajouter une charge dans Ma salle' });
    return liste;
  }
  // 175 (MOTEUR §9.7 / §10.2) — LA CARTE DU GROS CRAN, quand les essais ne suffisent pas (deux tests ratés au plancher, ou la
  // cible d'étirement au plafond haut + 6) : les leviers SANS « Viser plus de reps » (monter en reps ne rapproche pas du cran),
  // ouverts par les poids d'appoint de la machine dans Ma salle. `g` : le gros cran (`grosCran`) ; `o.nom` : le nom de la machine.
  function carteLeviersGros(meilleur, g) {
    if (!meilleur || meilleur.niveau === null || meilleur.niveau === undefined || !g) return null;
    return {
      type: MARCHE_LEVIERS, non: NON_LEVIERS, plafond: false, gros: true,
      phrase: Modele().charge(meilleur.palier, undefined, cite(FAIT, { quoi: 'meilleur' })) + ' × ' +
        nombreFr(meilleur.niveau, cite(FAIT, { quoi: 'meilleur', champ: 'reps' })) +
        ', et le cran suivant est de +' + nombreFr(g.pct, regle('cran.pct')) + INSECABLE + '%. Pour continuer à monter' + INSECABLE + ':'
    };
  }
  // Les leviers du gros cran, dans l'ordre : les poids d'appoint de la machine (Ma salle), un frère plus chargeable, le tempo
  // lent. Jamais « Viser N reps ». `o` : `{ nom, remplacant, detail, tempoActif }`.
  function leviersDuGros(o) {
    var x = o || {};
    var liste = [{ cle: LEVIER_SALLE, texte: 'Les poids d\'appoint de ta ' + (x.nom || 'machine') + ' dans Ma salle' }];
    if (x.remplacant && x.remplacant.slug) {
      liste.push({ cle: LEVIER_REMPLACEMENT, texte: x.remplacant.nom || x.remplacant.slug, vers: x.remplacant.slug,
                   detail: x.detail || null });
    }
    if (x.tempoActif !== true) {
      liste.push({ cle: LEVIER_TEMPO, texte: 'Tempo lent' + DEUX_POINTS + Modele().secondes(TEMPO_DESCENTE_S) + ' en descente' });
    }
    return liste;
  }
  // « 3 s en descente, jusqu'à ton prochain progrès » — la mention de la consigne quand le tempo lent est en cours. Rédigée
  // sous capture : le « 3 » est une constante du moteur (§20 bis).
  function grisTempo() {
    return Modele().secondes(TEMPO_DESCENTE_S, regle('constante')) + ' en descente, jusqu\'à ton prochain progrès';
  }
  // Le levier `levier` accepté depuis le dernier progrès de l'exercice (la même lecture que la série de plus) : le pari le
  // plus récent, ou `null`.
  function levierActif(exercice, jour, compteur, marches, compteurs, levier) {
    var a = marchesDepuisProgres(exercice, jour, compteur, marches, compteurs, MARCHE_LEVIERS, ['acceptee'])
      .filter(function (m) { return m.levier === levier; });
    if (!a.length) return null;
    return a.slice().sort(function (x, y) { return avantAlpha(String(y.jour), String(x.jour)); })[0];
  }
  // La visée acceptée d'un exercice (le levier « reps ») : `{ charge, visee }` du pari le plus récent, ou `null`. Elle
  // rallonge le plafond de CETTE plus lourde (`avecRallonge`) ; un nouveau plafond atteint peut en proposer une autre.
  function rallongeAcceptee(exercice, marches) {
    var a = (marches || []).filter(function (m) {
      return m && m.exercice === exercice && m.marche === MARCHE_LEVIERS && m.levier === LEVIER_REPS &&
        m.reponse === 'acceptee' && nombre(m.visee) !== null && m.plafond && nombre(m.plafond.charge) !== null;
    });
    if (!a.length) return null;
    var d = a.slice().sort(function (x, y) { return avantAlpha(String(y.debut || y.jour), String(x.debut || x.jour)); })[0];
    return { charge: nombre(d.plafond.charge), visee: nombre(d.visee) };
  }
  // 175 — la visée acceptée allonge-t-elle le plafond d'une consigne FIGÉE au maintien (`fondement.salle` : `max`, `plafond`) ?
  // Oui quand elle vaut pour cette plus lourde et dépasse son plafond : l'app recalcule alors la consigne, une fois.
  function rallongeChangeLePlafond(rallonge, salleFondement) {
    if (!rallonge || !salleFondement) return false;
    return memeCharge(rallonge.charge, salleFondement.max) && nombre(rallonge.visee) > nombre(salleFondement.plafond);
  }
  // « Curl Biceps (Haltère) : ta salle va jusqu'à 2 × 40 kg. » ; sans salle déclarée pour lui, « … : aucune limite
  // déclarée dans ta salle. » Rédigée HORS de la capture de la carte : le détail ne cite rien du plan.
  function detailRemplacement(remplacant) {
    if (!remplacant) return null;
    var nom = remplacant.nom || remplacant.slug;
    var s = remplacant.salle;
    var m = s ? maxDeLaSalle(s) : null;
    if (m === null) return nom + DEUX_POINTS + 'aucune limite déclarée dans ta salle.';
    var t = s.materiel === 'halteres'
      ? '2' + INSECABLE + '×' + INSECABLE + Modele().charge(m / 2) : Modele().charge(m);
    return nom + DEUX_POINTS + 'ta salle va jusqu\'à ' + t + '.';
  }

  // L'OBSERVATION DU PARI AU PLAFOND, SANS PARI DE SÉRIE : « tu tiens le plafond (la plus lourde × le haut de la
  // fourchette) sur toutes les séries de travail, la nouvelle comprise, avant le prochain déclenchement ». Lue dans
  // les faits (`groupes` : les séances de l'exercice, `faits.seancesDeLExercice`) et les compteurs figés des paris.
  // À partir de la séance du pari, dans l'ordre : une séance dont le compteur à l'ouverture atteint le prochain
  // déclenchement tranche 0 ; une séance qui TIENT le plafond tranche 1 — toutes ses séries de travail à la plus
  // lourde (ou au-delà) et au plafond des reps (ou au-delà), et au moins autant que la routine en compte : n + 1 pour
  // la série de plus (la nouvelle comprise), n pour la dégressive (elle n'est pas une série de travail). Refusée :
  // jamais. Rend `{ valeur, seance, debut, jour }` ou `null` (pas encore tranché).
  function observationPlafond(m, groupes, compteurs) {
    if (!m || m.reponse !== 'acceptee' || m.origine !== ORIGINE_SALLE_MAX || !m.plafond) return null;
    var c0 = nombre(m.compteur), P = nombre(m.plafond.charge), R = nombre(m.plafond.reps), n = nombre(m.n);
    if (c0 === null || P === null || R === null || n === null || n < 1) return null;
    var attendues = m.marche === MARCHE_SERIE_DE_PLUS ? n + 1 : n;
    var prochain = c0 - (c0 % PAS_ESCALIER) + PAS_ESCALIER;
    var t0 = instant(m.debut);
    var parSeance = {};
    (compteurs || []).forEach(function (x) {
      if (x && x.exercice === m.exercice && x.seance && nombre(x.compteur) !== null) parSeance[x.seance] = nombre(x.compteur);
    });
    var liste = (groupes || []).filter(function (g) {
      if (!g || !g.seance) return false;
      if (g.seance.id === m.seance) return true;
      var t = instant(g.seance.debut);
      return t !== null && t0 !== null && t > t0;
    }).sort(function (a, b) { return avantAlpha(String(a.seance.debut), String(b.seance.debut)); });
    for (var i = 0; i < liste.length; i++) {
      var g = liste[i];
      var tranche = { seance: g.seance.id || null, debut: g.seance.debut || null, jour: jourCivil(g.seance.debut) };
      if (g.seance.id !== m.seance && Object.prototype.hasOwnProperty.call(parSeance, g.seance.id) &&
          parSeance[g.seance.id] >= prochain) return Object.assign({ valeur: 0 }, tranche);
      var travail = (g.series || []).filter(function (s) { return Modele().estTravail(s); });
      var tient = travail.length >= attendues && travail.every(function (s) {
        var ch = nombre(s.charge_kg), r = nombre(s.reps);
        return ch !== null && r !== null && (ch > P || memeCharge(ch, P)) && r >= R;
      });
      if (tient) return Object.assign({ valeur: 1 }, tranche);
    }
    return null;
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
    // 149 — en Franc, une séance suffit : la phrase dit la règle (§20 bis).
    return nombreFr(x.niveau, regle('lest.niveau')) + ' reps sur toutes tes séries' +
      (x.reglage === 'franc' ? ' aujourd\'hui.' : ', deux séances de suite.');
  }
  // 175 (MOTEUR §9.17 bis, décision du 26/10/2026) — quand le rang au-dessus a aussi une variante SANS MATÉRIEL (`variante`,
  // son nom), la carte propose les deux : trois gestes, « Ajouter du lest » / la variante / « Rester aux … ».
  var OUI_LEST_VARIANTE = 'Ajouter du lest';
  function nonLestVariante(nomExercice) { return 'Rester aux ' + nomExercice; }
  function carteLestDetail(e) {
    var x = e || {};
    if (typeof x.variante === 'string' && x.variante) {
      return 'Le haut de ta zone tient. La marche au-dessus : du lest (' + enKg(SAUT_LEST, regle('lest.saut')) +
             ', en revenant à ' + nombreFr(x.bas, regle('zone.bas')) + ' reps), ou ' + x.variante + ', sans matériel.';
    }
    return 'Au haut de ta zone, un lest te fait continuer en force. Avec une ceinture ou un gilet, ' +
           'je te propose de commencer à ' + enKg(SAUT_LEST, regle('lest.saut')) +
           ', en revenant à ' + nombreFr(x.bas, regle('zone.bas')) + ' reps.';
  }
  function carteLest(e) {
    return { titre: carteLestTitre(e), detail: carteLestDetail(e), oui: OUI_LEST, non: NON_LEST };
  }

  // ══ §9.17 bis (127) — L'ÉCHELLE DES VARIANTES : LE SEUIL, LA CARTE « MARCHE SUIVANTE », LA PHRASE DE LA PAGE ════
  //
  // ⚠️ LE SEUIL DE 8 REPS N'EST ÉCRIT QU'ICI (21/10/2026, maquette du 17/10, écran 5 ; vérifié auprès des coachs :
  // 3 × 8 à l'élastique léger avant les strictes, 8 à 10 strictes avant le lest). Au poids du corps, la marche
  // au-dessus — le lest ou une autre — n'arrive qu'à partir de 8 reps : le niveau à tenir deux séances de suite est
  // le haut de la zone ET 8 (`seuilDeMarche`). La carte du lest (`consignePour`), la carte « marche suivante »
  // (`carteMarche`), la phrase de la page (`phraseDeLaSuivante`) et les invariants (I49, I50) le lisent ici.
  var SEUIL_MARCHE = 8;
  function seuilDeMarche(haut) {
    var h = nombre(haut);
    return Math.max(h === null ? 0 : h, SEUIL_MARCHE);
  }
  // « Je te propose d'en faire 2 séries avant » : les séries de travail de la marche ajoutée (maquette du 17/10).
  var SERIES_MARCHE = 2;
  // La marche proposée déjà pratiquée dans les 28 derniers jours : pas de carte (Léa faisait déjà ses strictes).
  var JOURS_MARCHE_FAITE = 28;
  var NON_MARCHE = 'Pas maintenant';
  function ouiMarche(nom) { return 'Ajouter ' + nom; }

  // LA CARTE « MARCHE SUIVANTE » (§9.17 bis ; hors lest, qui garde sa carte) : `{ titre, detail, oui, non, cible }`,
  // ou `null`. Une donnée, comme la carte du lest : l'écran la dessine avec le même composant. Pure — `e` :
  //   · `marche` : la marche suivante (`THModele.marcheSuivante`), `nomCible` : le nom de sa première cible ;
  //   · `aide` : l'exercice est une aide (`charge = assistance`) ;
  //   · `haut` : le haut de la zone ; `seances` : les deux dernières séances non neutres, la plus récente en
  //     dernier, `{ niveau, charge }` (le fondement de la consigne, `deuxSeances`) ;
  //   · `reponse` : `profiles.marche_reponses[slug]` (`{ r, le, aide }`), ou `null` ;
  //   · `cibleFaiteLe` : la date de la dernière séance de la marche proposée (un fait), ou `null` ;
  //   · `aujourdHui` : le jour de la séance (jamais l'horloge) ; `coachActif` : ni carnet, ni Entretenir.
  // Mêmes refus que `carte_marche` de la référence, dans le même ordre.
  function carteMarcheDecidee(e) {
    var x = e || {};
    var m = x.marche;
    if (x.coachActif === false || !m || !m.proposable || !Array.isArray(m.cible) || !m.cible.length) return null;
    var sc = Array.isArray(x.seances) ? x.seances : [];
    // 149 — EN FRANC, UNE SÉANCE SUFFIT : la dernière. La garde « à la même aide » n'a plus d'objet (une seule séance).
    var franc = x.reglage === 'franc';
    if (sc.length < (franc ? 1 : 2)) return null;
    var b = sc[sc.length - 1], a = franc ? b : sc[sc.length - 2];
    var seuil = seuilDeMarche(x.haut);
    if (!a || !b || !(nombre(a.niveau) >= seuil) || !(nombre(b.niveau) >= seuil)) return null;
    var aide = x.aide === true;
    if (aide && !franc && !(Math.abs(nombre(a.charge) - nombre(b.charge)) <= 1e-9)) return null;   // deux séances à la même aide
    var r = x.reponse;
    if (r) {
      if (r.r === 'oui') return null;
      if (!aide) return null;                                        // « Pas maintenant » : une fois, hors aide
      if (!(nombre(b.charge) > nombre(r.aide) + 1e-9)) return null;  // reposée à une aide plus légère (21/10)
    }
    if (x.cibleFaiteLe) {
      var j = numeroDuJour(jourCivil(x.aujourdHui)), f = numeroDuJour(jourCivil(x.cibleFaiteLe));
      if (j !== null && f !== null && j - f <= JOURS_MARCHE_FAITE) return null;
    }
    return { cible: m.cible[0], nom: x.nomCible || m.cible[0], aide: aide, niveau: nombre(b.niveau), charge: nombre(b.charge),
             reglage: franc ? 'franc' : null };
  }
  // Le titre et le détail s'écrivent chacun par sa fonction : le plan les rédige sous deux captures (§20 bis).
  // `d` : la décision (`carteMarcheDecidee`).
  function carteMarcheTitre(d) {
    var x = d || {};
    // 149 — EN SECONDES (une échelle de figures) : « 22 s tenues, deux séances de suite. » · Franc : « … aujourd'hui. »
    if (x.secondes === true) {
      return Modele().secondes(x.niveau, regle('marche.niveau')) + ' tenues' +
        (x.reglage === 'franc' ? ' aujourd\'hui.' : ', deux séances de suite.');
    }
    var tenue = x.aide
      ? enKg(x.charge, regle('marche.aide')) + ' \u00d7 ' + nombreFr(x.niveau, regle('marche.niveau'))
      : nombreFr(x.niveau, regle('marche.niveau')) + ' reps';
    return tenue + ' sur toutes tes séries' + (x.reglage === 'franc' ? ' aujourd\'hui.' : ', deux séances de suite.');
  }
  function carteMarcheDetail(d) {
    var x = d || {};
    if (x.secondes === true) {
      return 'La marche au-dessus : ' + x.nom + '. Je te propose d\'en faire ' + nombreFr(SERIES_MARCHE, regle('constante')) +
             ' tenues avant, autant de secondes que tu peux.';
    }
    return 'La marche au-dessus : ' + x.nom + '. Je te propose d\'en faire ' + nombreFr(SERIES_MARCHE, regle('constante')) +
           ' séries avant, autant de reps que tu peux.';
  }
  function carteMarche(e) {
    var d = carteMarcheDecidee(e);
    if (d === null) return null;
    return { titre: carteMarcheTitre(d), detail: carteMarcheDetail(d), oui: ouiMarche(d.nom), non: NON_MARCHE,
             cible: d.cible };
  }

  // LA PHRASE DE « LA SUIVANTE » sur la page d'exercice (ECRAN-SAISIE §7 quater.6) : la condition de la carte, sans
  // calcul nouveau. `e` : `{ type, nomCible, nomDepart, haut, meilleur }` (`THModele.vueEchelle` la compose).
  //
  // 145 (ECRAN-SAISIE §7 quater.7) — `e.court` : la MÊME condition, dite pour la carte « Tes échelles cette semaine » —
  // sans « Je te la propose » ni « Ton meilleur », et sans « Elle s'ajoute » : « La suivante : Tractions Lestées, quand tu
  // tiens 8 reps sur toutes tes séries, deux séances de suite. » Une option, jamais une seconde règle : le seuil
  // (`seuilDeMarche`) et la condition sont ceux de la phrase longue.
  function phraseDeLaSuivante(e) {
    var x = e || {};
    var court = x.court === true;
    // 175 — depuis la stricte, le lest ET la variante sans matériel : « Pompes Lestées ou Pompes Déclinées ».
    var tete = 'La suivante : ' + x.nomCible + (x.type === 'lest' && x.nomVariante ? ' ou ' + x.nomVariante : '') + (court ? ', ' : '. ');
    if (x.type === 'habilete') {
      if (court) {
        return 'Au-dessus : ' + x.nomCible + ', une habileté. Je ne te la propose pas : c\'est toi qui choisis quand l\'essayer.';
      }
      return tete + 'Une habileté : je ne te la propose pas, c\'est toi qui choisis quand l\'essayer. ' +
             'Tu peux l\'ajouter à une séance comme n\'importe quel exercice.';
    }
    // 149 — en Franc, une séance suffit : la phrase dit la règle (§20 bis).
    var deux = x.reglage === 'franc' ? ' sur toutes tes séries, sur une séance.' : ' sur toutes tes séries, deux séances de suite.';
    // 149 (MOTEUR §9.17 ter) — UNE FIGURE se tient en secondes : le seuil est celui du catalogue (`echelle_seuil_s`),
    // sans « sur toutes tes séries » (une tenue max par séance) et sans « Elle s'ajoute ».
    if (nombre(x.seuil) !== null) {
      var regleS = x.reglage === 'franc' ? ', sur une séance.' : ', deux séances de suite.';
      var secs = Modele().secondes(x.seuil, regle('marche.seuil'));
      if (court) return tete + 'à ' + secs + regleS;
      return tete + 'Je te la propose quand tu tiens ' + secs + regleS + (x.meilleur ? ' Ton meilleur : ' + x.meilleur + '.' : '');
    }
    if (x.type === 'lest') {
      if (court) return tete + 'quand tu tiens ' + nombreFr(seuilDeMarche(x.haut)) + ' reps' + deux;
      return tete + 'Je te la propose quand tu tiens ' + nombreFr(seuilDeMarche(x.haut)) + ' reps' + deux +
             (x.meilleur ? ' Ton meilleur : ' + x.meilleur + '.' : '');
    }
    var quand = typeof x.haut === 'number' && x.haut
      ? nombreFr(seuilDeMarche(x.haut)) + ' reps'
      : 'le haut de ta zone, et au moins ' + nombreFr(SEUIL_MARCHE) + ' reps,';
    if (court) return tete + 'quand tu tiens ' + quand + deux;
    return tete + 'Je te la propose quand tu tiens ' + quand + deux + ' Elle s\'ajoute : tu gardes ' + x.nomDepart + '.';
  }

  // 145 (ECRAN-SAISIE §7 quater.7) — LES DEUX RONDS des « deux séances de suite » : pour chacune des deux dernières séances
  // de l'exercice de départ (la plus ancienne d'abord), plein quand elle a tenu la condition de la carte « marche
  // suivante » (`carteMarcheDecidee`) : le niveau au moins égal à `seuilDeMarche(haut)` ; depuis une aide, la seconde
  // compte à la MÊME aide que la première. Aucune règle nouvelle : les faits sont ceux du fondement de la consigne
  // (`deuxSeances`). `e` : `{ haut, aide, seances }`, `seances` = `[{ niveau, charge }]`. `null` sans séance connue.
  function rondsDeLaSuivante(e) {
    var x = e || {};
    var sc = Array.isArray(x.seances) ? x.seances.filter(Boolean) : [];
    if (!sc.length) return null;
    // 149 — en secondes (une figure), le seuil est celui du catalogue ; sinon le haut de la zone ET 8 reps.
    var seuil = nombre(x.seuil) !== null ? nombre(x.seuil) : seuilDeMarche(x.haut);
    var tenu = function (s) { return nombre(s.niveau) !== null && nombre(s.niveau) >= seuil; };
    // 149 — en Franc, UN SEUL ROND : la dernière séance.
    if (x.reglage === 'franc') return [tenu(sc[sc.length - 1])];
    var out = sc.slice(-2).map(tenu);
    if (x.aide === true && sc.length >= 2 && out[1] &&
        !(Math.abs(nombre(sc[sc.length - 2].charge) - nombre(sc[sc.length - 1].charge)) <= 1e-9)) out[1] = false;
    while (out.length < 2) out.push(false);
    return out;
  }

  // ══ §9.17 ter (149) — LES FIGURES EN SECONDES : LA TENUE MAX, LES TENUES, LA CARTE ═══════════════════════════════
  //
  // Décisions d'Aurélien du 23/10/2026 (13 h 03 – 13 h 24 ; maquettes `maquette-figures-c-v1.html` et `-v2.html`).
  // UNE ÉCHELLE DE FIGURES (front lever, back lever, planche, L-sit, équilibre, drapeau : toutes ses marches en
  // secondes, `THModele.estEchelleDeFigures`) se coache en SECONDES, jamais en charge : la première tenue de travail de
  // l'exercice est la TENUE MAX (« fais mieux que la dernière fois »), les suivantes visent une part du max du jour.
  // Du temps, pas une charge : aucune zone, aucun cran, aucun palier, aucun pari, ni chauffe ni dégressive.
  //
  //   · la part : Prudent 50 %, Normal 60 %, Franc 70 % de la tenue max du jour (les coachs : 50 à 80 %), arrondie à la
  //     seconde la plus proche, au moins 2 s ;
  //   · une tenue suivante plus longue que sa cible NE CHANGE PAS la cible (une seule tenue max par séance) ;
  //   · sous 5 s de tenue max, un fait sourcé (Sommer) : les coachs travaillent la marche d'en dessous ;
  //   · la carte « marche suivante » lit la tenue max de chaque séance (Franc : la dernière) contre le seuil du catalogue.
  var PARTS_DE_TENUE = { prudent: 50, normal: 60, franc: 70 };   // % de la tenue max du jour
  var TENUE_MIN_S = 2;
  var TENUE_SOUS_S = 5;
  function partDeLaTenue(reglage) {
    return Object.prototype.hasOwnProperty.call(PARTS_DE_TENUE, reglage) ? PARTS_DE_TENUE[reglage] : PARTS_DE_TENUE.normal;
  }
  // La durée visée d'une tenue suivante : `max(2, arrondi(part × max du jour))`, à la seconde. `null` sans max valide.
  function dureeVisee(max, reglage) {
    var m = nombre(max);
    if (m === null || !(m > 0)) return null;
    return Math.max(TENUE_MIN_S, Math.floor(m * partDeLaTenue(reglage) / 100 + 0.5));
  }
  // « Ton max la dernière fois : 20 s. Essaie de faire mieux, proprement. » · sans séance avant : « Première fois ici… ».
  function phraseDeLaTenueMax(e) {
    var d = nombre(e && e.dernier);
    if (d === null) return 'Première fois ici : autant que tu peux, proprement.';
    return 'Ton max la dernière fois : ' + Modele().secondes(d, cite(FAIT, { quoi: 'max_dernier' })) +
           '. Essaie de faire mieux, proprement.';
  }
  // Après la tenue max validée. `e` : `{ max, dernier, vise, dessous }` — `dessous` : le nom de la marche d'en dessous
  // (`null` au rang 1 : pas de seconde phrase).
  //   battu     « 22 s : 2 s de plus que la dernière fois. Tes tenues : 13 s. »
  //   pas battu « 18 s aujourd'hui. Tes tenues : 11 s. »
  //   sous 5 s  + « Sous 5 s, les coachs travaillent la marche d'en dessous : Front Lever Groupé. »
  function phraseDesTenues(e) {
    var x = e || {};
    var S = Modele().secondes;
    var max = nombre(x.max), dernier = nombre(x.dernier);
    var t = dernier !== null && max > dernier
      ? S(max, cite(FAIT, { quoi: 'max_du_jour' })) + ' : ' + S(max - dernier, cite(FAIT, { quoi: 'ecart_max' })) +
        ' de plus que la dernière fois.'
      : S(max, cite(FAIT, { quoi: 'max_du_jour' })) + ' aujourd\'hui.';
    t += ' Tes tenues : ' + S(nombre(x.vise), cite(CIBLE, { role: 'tenue' })) + '.';
    if (max < TENUE_SOUS_S && x.dessous) {
      t += ' Sous ' + S(TENUE_SOUS_S, regle('tenue.sous')) + ', les coachs travaillent la marche d\'en dessous : ' + x.dessous + '.';
    }
    return t;
  }
  // LA CARTE « MARCHE SUIVANTE » EN SECONDES : la décision `{ cible, nom, secondes: true, niveau, seuil, reglage }`, ou
  // `null`. Mêmes refus que `carteMarcheDecidee`, la condition lue en secondes. `e` : `{ marche, nomCible, seuil, tenues,
  // duJour, reponse, cibleFaiteLe, aujourdHui, coachActif, reglage }` — `tenues` : la tenue max de chaque séance faite,
  // la plus récente en dernier, et celle du jour en dernier si elle est validée (`duJour`) ; `seuil` : `echelle_seuil_s`
  // de l'exercice de départ. La carte lit la tenue max du JOUR : sans elle, pas de carte.
  function carteMarcheEnSecondes(e) {
    var x = e || {};
    var m = x.marche;
    if (x.coachActif === false || !m || !m.proposable || !Array.isArray(m.cible) || !m.cible.length) return null;
    var seuil = nombre(x.seuil);
    if (seuil === null || !(seuil > 0) || x.duJour !== true) return null;
    var franc = x.reglage === 'franc';
    var t = (Array.isArray(x.tenues) ? x.tenues : []).map(nombre);
    if (t.length < (franc ? 1 : 2)) return null;
    var dernieres = t.slice(franc ? -1 : -2);
    if (!dernieres.every(function (v) { return v !== null && v >= seuil; })) return null;
    var r = x.reponse;
    if (r && (r.r === 'oui' || r.r === 'non')) return null;      // « Ajouter » : jamais deux fois ; « Pas maintenant » : une fois
    if (x.cibleFaiteLe) {
      var j = numeroDuJour(jourCivil(x.aujourdHui)), f = numeroDuJour(jourCivil(x.cibleFaiteLe));
      if (j !== null && f !== null && j - f <= JOURS_MARCHE_FAITE) return null;
    }
    return { cible: m.cible[0], nom: x.nomCible || m.cible[0], secondes: true, aide: false, niveau: t[t.length - 1],
             seuil: seuil, charge: null, reglage: franc ? 'franc' : null };
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

  // 180 (A-F-09, 28/10/2026, décision d'Aurélien D4) — LA PREMIÈRE FOIS AU POIDS DU CORPS PART DES REPS DE LA ROUTINE : « 12 reps ».
  // Un exercice en `reps` n'a pas de charge de départ, mais sa routine porte les reps visées ; le §10.4 (163) veut toujours un chiffre.
  // La ligne est celle d'un corps (charge 0) ; la phrase le dit (« Première fois ici : on part des reps de ta routine, 12. »).
  function consigneDepartReps(depart) {
    var vise = nombre(depart && depart.reps);
    if (vise === null || vise < 1) return null;
    var cDepart = nombre(depart.charge);
    if (cDepart !== null && cDepart > 0) return null;   // une charge posée n'est pas du poids du corps
    var n = nombre(depart.n);
    return {
      etat: 'depart_routine', zone: null, palier: null, niveau: null,
      n: n !== null && n >= 1 ? n : 1,
      ligne: { charge: 0, vise: vise }, haut: null,
      fondement: { departRoutine: { charge: 0, reps: vise } }
    };
  }

  function departDeRoutine(consigne, o) {
    if (!consigne || consigne.etat !== 'silence' || consigne.raison !== 'premiere_fois') return null;
    if (!o.depart) return null;
    if (o.mesure === 'reps') return consigneDepartReps(o.depart);
    if (o.mesure !== 'charge_reps') return null;
    return consigneDepartRoutine(o.depart);
  }

  // ══ 187 — LE CALAGE DE LA PREMIÈRE SÉANCE (MOTEUR §9.21 bis, 29/10/2026, décision d'Aurélien) ══
  //
  // « Un exercice sans historique ni charge de départ ne reçoit pas une charge DEVINÉE : on la trouve ensemble. »
  // Aucune charge n'est tirée du poids du corps, du sexe ou du type de machine. UNE fonction pure, lue par le plan
  // (`planDeSeance`, qui pose le résultat sur l'exercice : `x.calage`, I72 à I74) ; l'écran ne décide rien.
  //
  //   · LE NOMBRE DE SÉRIES NE VIENT JAMAIS DU CALAGE : il vient de la séance vivante (routine, personne, coach), en plus ou en
  //     moins. Le calage est de l'AUTORÉGULATION série par série : sur la première séance d'un exercice sans historique ni charge
  //     de départ, chaque série de travail validée et sa réponse de réserve décident de la charge proposée (en gris) sur la
  //     SUIVANTE : 3 ou plus → +2 crans, 2 → +1 cran, 1 ou 0 → la même, sans réponse → la même. Aucun compte de séries de calage.
  //   · DÉBUTANT (`anciennete = moins_1_an`) : la première série de travail au plus petit cran du matériel (la barre vide).
  //   · INTERMÉDIAIRE ET PLUS : d'abord « Ta charge habituelle ? » (facultatif, pour ~N reps) : donnée, elle est la charge de la
  //     première série de travail. Sinon, 2 approches de 5 en montant, qui sont des CHAUFFES (mécanisme du chantier 49, aucune
  //     série de travail prise), puis la première série de travail.
  //   · LES SÉRIES SUIVANTES SONT PROPOSÉES (en gris), jamais écrites. La séance d'après repart de la série de travail la plus
  //     lourde réussie (`plusLourdeReussie`), lue par le coach ordinaire dès que l'historique existe.
  //   · LE SAUT est plafonné comme au §9.1.2 (186) : +15 % (+10 % pour un débutant) de la charge de la série qu'on vient de
  //     faire. SEULE la première montée depuis le plus petit cran (la barre vide n'est pas une charge de travail) n'est pas
  //     comptée en pourcentage : deux crans au plus. Le plafond ne vise que les sauts de PLUSIEURS crans : un seul cran (le plus petit pas du matériel) reste toujours permis, la montée à deux crans est ramenée à ce qui tient sous le plafond, jamais sous un cran.
  var CALAGE_REPS_DEFAUT = 10, CALAGE_REPS_APPROCHE = 5;
  var CALAGE_RESERVE = { reste_0: 0, reste_1: 1, reste_2: 2, reste_3_plus: 3 };
  var CALAGE_ROLE_CIBLE = 'cible', CALAGE_ROLE_APPROCHE = 'approche', CALAGE_ROLE_DEPART = 'depart',
      CALAGE_ROLE_MONTEE = 'montee', CALAGE_ROLE_HABITUELLE = 'habituelle';

  function cranDuCalage(equipement, salle, charge) {
    var l = chargesDeLaSalle(salle);
    if (l.length) {
      for (var i = 0; i < l.length; i++) if (l[i] > charge + 1e-9) return l[i];
      return null;                                           // la salle n'a rien de plus lourd
    }
    var pas = repliDe(equipement, charge, 1);
    return pas === null || pas === undefined ? null : Math.round((charge + pas) * 100) / 100;
  }
  // Le plus petit cran du matériel : la barre vide à la barre ; la plus légère charge de la salle déclarée ; sinon le
  // premier cran du repli (une machine : 5 kg, une poulie : 2,5 kg…). Matériel inconnu : `null`, le calage se tait.
  function plancherDuCalage(equipement, salle) {
    var l = chargesDeLaSalle(salle);
    if (l.length) return l[0];
    if (equipement === 'barre') return BARRE_VIDE;
    var pas = repliDe(equipement, 0, 1);
    return pas === null || pas === undefined ? null : pas;
  }
  // 191 — le plafond du calage est celui de la prudence de montée (le débutant, ou 65 ans et plus : +10 % ; sinon +15 %).
  // (`debutant` booléen accepté : le plafond du seul débutant, comme avant 191.)
  function plafondDuCalage(prudence) {
    return prudenceEffective(prudence === true, prudence && typeof prudence === 'object' ? prudence : undefined).plafond;
  }

  // La charge d'après : `crans` crans au-dessus de `charge`, sans dépasser le plafond (sauf la première montée depuis le
  // plancher), sans jamais descendre.
  function monteeDuCalage(o, charge, crans) {
    var plafond = charge * (1 + plafondDuCalage(o.prudence)) + 1e-9;
    var depuisLePlancher = charge <= o.plancher + 1e-9;
    var c = charge, pris = 0;
    for (var k = 0; k < crans; k++) {
      var n = cranDuCalage(o.equipement, o.salle, c);
      // Le plafond protège des SAUTS de plusieurs crans : un seul cran, le plus petit pas du matériel, reste toujours permis.
      if (n === null || (!depuisLePlancher && k > 0 && n > plafond)) break;
      c = n; pris++;
    }
    return { charge: c, crans: pris };
  }

  // `entree` : { equipement, salle, mesure, reps (celles de la routine), debutant, habituelle, prochain: 'travail' | 'chauffe',
  //   series: [{ charge, reps, ressenti, chauffe }] } — les séries DÉJÀ VALIDÉES de l'exercice, dans l'ordre. Le nombre de séries
  // vient de la séance vivante (routine, personne, coach) : le calage n'en crée, n'en ajoute ni n'en retire jamais ; il propose
  // la charge de la SUIVANTE. Autorégulation série par série (Helms 2016 ; Zourdos 2016) : la réserve de la série faite décide.
  function calagePremiereFois(entree) {
    var o = Object.assign({}, entree || {});
    var mesure = o.mesure === undefined || o.mesure === null ? 'charge_reps' : o.mesure;
    o.plancher = plancherDuCalage(o.equipement, o.salle);
    if (mesure !== 'charge_reps' || o.plancher === null) return null;
    var n = nombre(o.reps);
    n = n !== null && n >= 1 ? Math.round(n) : CALAGE_REPS_DEFAUT;
    var hab = nombre(o.habituelle);
    hab = hab !== null && hab > 0 ? hab : null;
    var faites = (o.series || []).filter(function (s) { return s && nombre(s.charge) !== null; });
    var k = faites.length;
    var debutant = o.debutant === true;
    var prudence = prudenceEffective(debutant, o.prudence);
    o.prudence = prudence;
    var mode = debutant ? 'debutant' : hab !== null ? 'habituelle' : 'approches';
    var chauffeProchaine = o.prochain === 'chauffe';
    var r = { mode: mode, n: n, faites: k, plancher: o.plancher, equipement: o.equipement || null, plafond: plafondDuCalage(prudence), unCran: prudence.unCran, prudence: null,
              habituelle: hab, suivante: null, question: false, plusLourdeReussie: null };
    var travaillees = faites.filter(function (s) { return !s.chauffe; });
    var reussies = travaillees.filter(function (s) { return nombre(s.reps) !== null && nombre(s.reps) >= n; });
    var lourde = reussies.reduce(function (m, s) { return Math.max(m, nombre(s.charge)); }, 0);
    r.plusLourdeReussie = lourde > 0 ? lourde : null;
    var role = chauffeProchaine ? CALAGE_ROLE_APPROCHE : (k === 0 ? CALAGE_ROLE_DEPART : CALAGE_ROLE_MONTEE);
    var reps = chauffeProchaine ? CALAGE_REPS_APPROCHE : n;
    if (k === 0) {
      // La première série : la charge habituelle donnée (série de travail), sinon le plus petit cran du matériel.
      if (hab !== null && !chauffeProchaine) r.suivante = { charge: hab, reps: reps, role: CALAGE_ROLE_HABITUELLE, pourquoi: 'habituelle' };
      else r.suivante = { charge: o.plancher, reps: reps, role: role, pourquoi: 'plancher' };
      return r;
    }
    var derniere = faites[k - 1];
    var charge = nombre(derniere.charge);
    var reserve = derniere.ressenti && Object.prototype.hasOwnProperty.call(CALAGE_RESERVE, derniere.ressenti)
      ? CALAGE_RESERVE[derniere.ressenti] : null;
    r.question = !derniere.chauffe && reserve === null;
    var crans, pourquoi;
    if (derniere.chauffe) { crans = 2; pourquoi = 'en_montant'; }          // les approches montent ; leur réserve n'est pas demandée
    else {
      crans = reserve === null ? 0 : reserve >= 3 ? 2 : reserve === 2 ? 1 : 0;
      // 191 — UN CRAN À LA FOIS (le débutant de 50 ans et plus) : « 3 ou plus » monte d'un cran, pas de deux.
      var cranVoulu = crans;
      if (prudence.unCran && crans > 1) crans = 1;
      pourquoi = reserve === null ? 'sans_reponse' : crans === 2 ? 'facile' : crans === 1 ? 'un_cran' : 'tenue';
      if (cranVoulu > crans) { pourquoi = 'facile_un_cran'; r.prudence = { quoi: 'un_cran', raison: prudence.raison }; }
    }
    var mont = monteeDuCalage(o, charge, crans);
    // 191 — le plafond de la prudence (10 %) a ramené la montée à moins de crans que le plafond ordinaire (15 %) n'en aurait permis.
    if (prudence.plafond < PLAFOND_SAUT && !r.prudence && crans > 1 && !derniere.chauffe) {
      var ord = monteeDuCalage(Object.assign({}, o, { prudence: { plafond: PLAFOND_SAUT, unCran: false } }), charge, crans);
      if (ord.crans > mont.crans) { pourquoi = 'plafonne'; r.prudence = { quoi: 'plafond', raison: prudence.raison }; }
    }
    r.suivante = { charge: mont.charge, reps: reps, role: role, pourquoi: pourquoi, crans: mont.crans, depuis: charge };
    return r;
  }

  // Les mots du calage (VOIX-DU-COACH : un fait, « tu », jamais un bravo). Aucun nombre de séries : la proposition suit ta réserve.
  function libellesCalage(c) {
    if (!c) return null;
    var n = c.n;
    if (c.mode === 'habituelle' && c.faites === 0) {
      return { titre: 'Ta charge habituelle', consigne: 'Je pars de là, et je m’ajuste à ce que tu fais.',
               question: 'Ta charge habituelle ?', pour: 'Pour ' + n + ' reps environ', passer: 'Je ne sais pas : on la trouve ensemble',
               pourquoi: null };
    }
    var consigne = c.mode === 'approches'
      ? 'Deux séries de chauffe de ' + CALAGE_REPS_APPROCHE + ', en montant ; puis, après chaque série, dis-moi ce qu’il te restait : je te propose la suivante.'
      : 'Après chaque série, dis-moi ce qu’il te restait : je te propose la suivante.';
    var s = c.suivante, pourquoi = null;
    if (s) {
      if (s.pourquoi === 'plancher') pourquoi = c.equipement === 'barre' ? 'Commence à la barre vide.' : 'Commence au plus petit cran.';
      else if (s.pourquoi === 'en_montant') pourquoi = 'Je monte de deux crans.';
      else if (s.pourquoi === 'facile') pourquoi = 'Facile : je monte de deux crans.';
      else if (s.pourquoi === 'facile_un_cran') pourquoi = 'Facile : je monte d’un cran. ' + PHRASE_UN_CRAN;
      else if (s.pourquoi === 'plafonne') pourquoi = 'Facile : je monte aussi haut que le plafond le permet. ' + PHRASE_PLAFOND;
      else if (s.pourquoi === 'un_cran') pourquoi = 'Il t’en restait 2 : je monte d’un cran.';
      else if (s.pourquoi === 'tenue') pourquoi = 'Il t’en restait peu : je garde cette charge.';
      else if (s.pourquoi === 'sans_reponse') pourquoi = 'Sans ta réponse, je garde cette charge.';
    }
    return { titre: 'On trouve ta charge', consigne: consigne, question: 'Il t’en restait combien ?', pour: null, passer: null, pourquoi: pourquoi };
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
      { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null, salle: o.salle || null });
    return chargesDeTravail(seances.map(vueDeSeance)).filter(function (x) {
      return x.palier !== null && x.niveau !== null && instant(x.debut) !== null;
    }).map(function (x) { return { date: x.debut, palier: x.palier, niveau: x.niveau }; });
  }

  function reportSur(seances, avant, zoneAvant, zone, equipement) {
    if (equipement === EQUIPEMENT_LEST) return null;
    // 132 (MOTEUR §10 ter) — PAS DE REPORT À L'ÉLASTIQUE : une estimation du 1RM sur une charge virtuelle (ou sur une
    // aide) ne veut rien dire. L'aide était déjà écartée (charge ≤ 0, `reportDeZone`) ; la résistance notée par nom
    // l'est ici. La nouvelle zone part alors de la charge de travail, comme un corps.
    if (equipement === 'elastique') return null;
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
        corrections: o.correctionsDeZone || null, correction: o.correction || null, salle: o.salle || null });
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
  var SANS_REPORT = { silence: true, bord: true, bord_garde: true, bord_recul: true, bord_vague: true, reprise_courte: true, reprise_longue: true };
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
    // 193-3 — en « première fois » dans la zone du plan, la zone d'avant est celle que la dernière séance a FAITE (`zoneAvantDuPlan`).
    var zoneAvant = o.zoneAvantDuPlan !== undefined ? o.zoneAvantDuPlan : zoneDeLaDerniere(seances, avant, o);
    var r = reportSur(seances, avant, zoneAvant, consigne.zone, o.equipement);
    if (r === null) return null;
    var f = consigne.fondement || {};
    var garde = { date: f.date, reps: f.reps, seance: f.seance, habitude: f.habitude, correction: f.correction,
                  deuxSeances: f.deuxSeances };
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

  // §17.4 (74) — LA DERNIÈRE SÉANCE, SI ELLE A UNE SÉRIE À FOND : ses séries de
  // travail (les votantes — palier, travail, exploration : celles qui font la
  // consigne), ou `null` si aucune n'est à fond (RPE 10 ou « reste 0 », lu par
  // `cranDeSerie`, le seul endroit). La dernière séance est celle d'où la
  // consigne repart : la dernière antérieure qui n'est pas neutre.
  function seriesAFondDeLaDerniere(seances, avant) {
    var ant = anterieures((seances || []).map(vueDeSeance), avant)
      .filter(function (se) { return !se.neutre; });
    if (!ant.length) return null;
    var V = ant[ant.length - 1].votantes;
    var aFond = V.some(function (s) { return Palier().cranDeSerie(s) === 'max'; });
    return aFond ? V : null;
  }

  // §17.4 (74) — LES QUATRE PLAFONDS, dans l'ordre du MOTEUR §17.4. `faite` :
  // la consigne sur les reps faites ; `prudente` : celle du calcul prudent ;
  // `V` : les séries de travail de la dernière séance (au moins une à fond).
  // Le NIVEAU et le PALIER restent ceux des reps faites, toujours. Quand l'état
  // revient au calcul prudent, son fondement vient avec : c'est lui qui porte
  // de quoi dire « sans marge » (68B), et la phrase suit l'état.
  function plafonnerAFond(faite, prudente, V) {
    if (!faite || !prudente || faite.etat === 'silence') return faite;
    var r = {};
    Object.keys(faite).forEach(function (k) { r[k] = faite[k]; });
    // Le fondement du calcul prudent, sauf la CHUTE, qui est un fait des
    // reps faites : 20, 20, 15 n'est pas une chute (−5, 25 %), même quand la
    // rep en moins en fait une (19, 19, 14). Sans elle, « je ne compte pas la
    // dernière série » serait dit d'une ligne qui la compte (retouche 74).
    function fondementPrudent() {
      var f = {};
      Object.keys(prudente.fondement || {}).forEach(function (k) { f[k] = prudente.fondement[k]; });
      if (!(faite.fondement && faite.fondement.chute)) delete f.chute;
      return f;
    }
    function etatPrudent(avecLigne) {
      r.etat = prudente.etat;
      r.haut = prudente.haut;
      if (avecLigne) r.ligne = prudente.ligne;
      r.fondement = fondementPrudent();
    }
    // Les charges faites À FOND, et pour chacune le plus de reps et le nombre
    // de séries faites à cette charge dans la séance.
    var lourde = null;
    V.forEach(function (s) {
      var c = nombre(s.charge_kg);
      if (c !== null && (lourde === null || c > lourde)) lourde = c;
    });
    function aFondA(charge) {
      return charge !== null && V.some(function (s) {
        return Palier().cranDeSerie(s) === 'max' && memeCharge(nombre(s.charge_kg), charge);
      });
    }
    function aCetteCharge(charge) {
      return V.filter(function (s) { return memeCharge(nombre(s.charge_kg), charge); });
    }
    function plusDeReps(charge) {
      var m = null;
      aCetteCharge(charge).forEach(function (s) {
        var x = nombre(s.reps);
        if (x !== null && (m === null || x > m)) m = x;
      });
      return m;
    }
    // 1. Pas de « tout passe » que le calcul prudent ne donne pas.
    if (r.etat === 'tout_passe' && prudente.etat !== 'tout_passe') etatPrudent(true);
    // 2. Pas de test plus lourd que la charge la plus lourde de la séance. Un
    // test sans charge chiffrée est « le cran au-dessus » : il compte comme plus
    // lourd que tout ce qui a été fait (§17.4, corrigé le 12/10/2026).
    // 169 — SAUF LA SORTIE de la garde (MOTEUR §9.26) : deux séances de suite au haut de la zone à la même charge, la
    // seconde à fond comprise, le test est posé — sinon une dernière série toujours à l'échec ne monterait jamais.
    var sortie = !!(faite.fondement && faite.fondement.effortVise && faite.fondement.effortVise.sortie === true);
    if (r.haut && lourde !== null && !sortie) {
      var ch = nombre(r.haut.charge);
      if (ch === null || (ch > lourde && !memeCharge(ch, lourde))) etatPrudent(false);
    }
    // 3. Pas de rep de plus à une charge faite à fond (ligne et test). Au
    // POIDS DU CORPS (palier 0, §9.17), aucune : sans cran, les reps sont la
    // seule façon de monter (`etirement_reps`), et le cas réel le garde.
    var poidsDuCorps = nombre(faite.palier) === 0;
    function borner(l) {
      if (!l) return l;
      var c = nombre(l.charge);
      if (poidsDuCorps || !aFondA(c)) return l;
      var m = plusDeReps(c);
      if (m === null || nombre(l.vise) === null || nombre(l.vise) <= m) return l;
      var b = {};
      Object.keys(l).forEach(function (k) { b[k] = l[k]; });
      b.vise = m;
      return b;
    }
    r.ligne = borner(r.ligne);
    r.haut = borner(r.haut);
    // 179 (A-F-05) — un recul de la règle de bord vise les reps visées de la barre ratée ; quand une charge faite à fond en borne la
    // rep de plus (ci-dessus), la ligne affiche la borne et le fondement la dit (`bord.vise`) : la phrase ne promet jamais plus
    // de reps que la ligne.
    if (r.etat === 'bord_recul' && r.ligne && r.fondement && r.fondement.bord && nombre(r.ligne.vise) !== null &&
        nombre(r.ligne.vise) !== nombre(r.fondement.bord.visees)) {
      r.fondement = Object.assign({}, r.fondement, { bord: Object.assign({}, r.fondement.bord, { vise: nombre(r.ligne.vise) }) });
    }
    // 4. Pas de série de test en plus à une charge faite à fond.
    if (r.haut && aFondA(nombre(r.haut.charge))) {
      var kMax = Math.max(aCetteCharge(nombre(r.haut.charge)).length,
                          prudente.haut && nombre(prudente.haut.k) !== null ? nombre(prudente.haut.k) : 0);
      if (nombre(r.haut.k) !== null && r.haut.k > kMax) {
        var h = {};
        Object.keys(r.haut).forEach(function (k) { h[k] = r.haut[k]; });
        h.k = kMax;
        r.haut = h;
        r.etat = prudente.etat;
        r.fondement = fondementPrudent();
      }
    }
    // 180 (A-F-07, 28/10/2026, décision d'Aurélien, MOTEUR §9.7 bis) — UN SEUL PLANCHER, CELUI DE LA ZONE EN VIGUEUR : celle que la
    // consigne affiche (`r.zone`, la zone des reps faites). Quand le calcul prudent fournit l'état (`etatPrudent`), son fondement
    // a pu être calculé dans une autre zone (Volume au lieu d'Hypertrophie : une rep de moins change l'habitude) ; le plancher
    // du gros cran se relit alors sur `r.zone`. Et la borne « pas de rep de plus à fond » (3.) ne descend jamais un test de gros
    // cran sous son plancher : 64 kg × 3 à fond, plancher 4, le test vise 4 — un test visé sous le plancher ne se valide jamais.
    var gc = r.fondement && r.fondement.cranGros;
    var zr = gc ? zoneParCle(r.zone) : null;
    if (gc && zr) {
      var plancherZ = plancherDuGros(zr, gc.isolation === true);
      if (plancherZ !== null && plancherZ !== gc.plancher) {
        var vieux = gc.plancher;
        r.fondement = Object.assign({}, r.fondement, { cranGros: Object.assign({}, gc, { plancher: plancherZ }) });
        if (r.haut && nombre(r.haut.vise) === vieux) r.haut = Object.assign({}, r.haut, { vise: plancherZ });
      }
      var plancherF = r.fondement.cranGros.plancher;
      if (r.haut && r.etat === 'test_propose' && nombre(r.haut.vise) !== null && nombre(plancherF) !== null &&
          r.haut.vise < plancherF) {
        r.haut = Object.assign({}, r.haut, { vise: plancherF });
      }
    }
    // 180 — UN FONDEMENT QUI DIT « APPROCHÉE » ne la dit que si une ligne marquée la porte (I61) : le test plafonné à la charge faite
    // (2.) vient du calcul prudent, dont le fondement parlait d'un cran au-dessus qui n'est plus proposé.
    if (r.fondement && r.fondement.approchee === true && !(r.ligne && r.ligne.approchee === true) && !(r.haut && r.haut.approchee === true)) {
      var sansApprochee = {};
      Object.keys(r.fondement).forEach(function (k) { if (k !== 'approchee') sansApprochee[k] = r.fondement[k]; });
      r.fondement = sansApprochee;
    }
    r.niveau = faite.niveau;
    r.palier = faite.palier;
    return r;
  }

  // §17.4 (74) — APRÈS UNE SÉRIE À FOND, LE COACH NE MONTE PAS. La consigne
  // part des reps faites (`consignePour`) ; si la dernière séance a une série
  // de travail à fond, le calcul prudent (68B) se rejoue à côté et les quatre
  // plafonds les comparent. Mêmes entrées que `consignePour` (le contrat).
  function consigneApresAFond(seances, avant, options) {
    var consigne = consignePour(seances, avant, options);
    var V = seriesAFondDeLaDerniere(seances, avant);
    if (V === null) return consigne;
    var prudente = enPrudent(function () { return consignePour(seances, avant, options); });
    var plafonnee = plafonnerAFond(consigne, prudente, V);
    // 174 (3/3) — le compte long de la règle de bord (`_bord`, non énumérable) suit la consigne plafonnée : une série à fond
    // (0 en réserve) ne le fait ni naître ni disparaître.
    if (plafonnee && plafonnee !== consigne && consigne && consigne._bord && !plafonnee._bord) {
      Object.defineProperty(plafonnee, '_bord', { value: consigne._bord, enumerable: false });
    }
    return plafonnee;
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
    // 193-3 (MOTEUR §9.29) — UNE ZONE À MÉNAGER PRIME SUR LA ZONE DE LA ROUTINE, comme sur une correction ou une déduction : un
    // exercice qui charge une zone à ménager dont la ligne de routine dit Lourd garde la règle de ménagement (aucune série lourde).
    // La zone de plan est suspendue (rien n'est écrit : la ligne de routine reste Lourd) ; le plan le dit (`suspendue`).
    var planSuspendu = null;
    if (options && options.menagee === true && options.zonePlan === 'lourd') {
      planSuspendu = { zone: 'lourd', mode: 'suspendue', n: 0, perimee: false, suspendue: true,
        origine: options.zonePlanOrigine === 'aujourdhui' ? 'aujourdhui' : 'routine' };
      options = Object.assign({}, options, { zonePlan: null });
    }
    var r = consigneDExerciceMenagee(groupes, etat, avant, options);
    if (planSuspendu !== null && r && r.consigne) {
      r = Object.assign({}, r, { plan: planSuspendu, etiquette: etiquetteZone(r.consigne, options.ligneDeZone, planSuspendu) });
    }
    return r;
  }
  function consigneDExerciceMenagee(groupes, etat, avant, options) {
    var r = avecDebutant(options, function () { return consigneDExerciceCalcul(groupes, etat, avant, options); });
    // 187 (A4) — UNE ZONE À MÉNAGER : l'exercice qui la charge (`options.menagee`, lue par l'app dans le profil et la table du
    // générateur) ne reçoit AUCUNE série lourde. Quand la zone qu'il aurait est Lourd (3-5 reps) et que la personne n'en a
    // pas choisi une autre (`options.correction`), il prend Mix (6-8) — par le chemin d'une zone choisie (le report de
    // charge, §9.10), et le fondement le dit (`menagee`). Une zone choisie par la personne reste la sienne : le moteur
    // propose, elle décide.
    if (options && options.menagee === true && !options.correction && !options.zonePlan && r && r.consigne && r.consigne.zone === 'lourd') {
      var o2 = Object.assign({}, options, { correction: ZONE_SANS_LOURD, menagee: false });
      var r2 = avecDebutant(o2, function () { return consigneDExerciceCalcul(groupes, etat, avant, o2); });
      if (r2 && r2.consigne && r2.consigne.zone && r2.consigne.zone !== 'lourd') {
        r2.consigne = Object.assign({}, r2.consigne, { fondement: Object.assign({}, r2.consigne.fondement, { menagee: true }) });
        return r2;
      }
    }
    return r;
  }
  var ZONE_SANS_LOURD = 'mix';
  function consigneDExerciceCalcul(groupes, etat, avant, options) {
    var o = options || {};
    if (o.edition) return null;
    if ((o.intention || 'progresser') === 'entretien') return null;
    if (o.mesure !== 'charge_reps' && o.mesure !== 'reps') return null;
    // 193-3 (MOTEUR §9.29) — UNE ZONE DE PLAN POSÉE : le coach ne relit que les séances de cette zone (ou, la première fois
    // dans la zone ou si la dernière date de plus de 8 semaines alors que l'exercice a été fait ailleurs depuis,
    // l'historique complet, que le report §9.10 existant lit une seule fois). Sans zone de plan : aucune ligne ne s'exécute.
    var plan = null;
    var zp = zoneParCle(o.zonePlan) ? o.zonePlan : null;
    if (zp !== null && o.mesure === 'charge_reps') {
      var base = sansLesAllegees(contratDe(groupes, etat, o.mesure,
        { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null, salle: o.salle || null }),
        o.periodesAllegees);
      var sh = sousHistoireDeZone(groupes, base, avant, zp, o.zonesDeRoutine || null);
      groupes = sh.groupes;
      // Sous-histoire : chaque séance se rejoue DANS la zone du plan (aucune correction datée ne la déplace). Première fois :
      // le passé garde sa vraie zone (`correctionsDeZone` vide), sinon le report ne verrait aucun changement de zone.
      o = Object.assign({}, o, { correction: zp, correctionsDeZone: sh.mode === 'zone' ? null : [] });
      if (sh.mode === 'premiere') o.zoneAvantDuPlan = sh.zoneAvant;
      plan = { zone: zp, mode: sh.mode, n: sh.n, perimee: sh.perimee === true, origine: o.zonePlanOrigine === 'aujourdhui' ? 'aujourdhui' : 'routine' };
      if (sh.mode === 'premiere') plan.zoneAvant = sh.zoneAvant;
    }
    var seances = sansLesAllegees(contratDe(groupes, etat, o.mesure,
      { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null, salle: o.salle || null }),
      o.periodesAllegees);
    // 186 — les séances qui ont REÇU une consigne (un pari) portent la marque : le plafond des reps de l'habitude (`repsPlafonnees`)
    // ne vaut que pour elles. Sans liste (les historiques qui n'en ont jamais reçu), rien n'est plafonné.
    if (o.seancesSousConsigne && o.seancesSousConsigne.length) {
      var recues = {};
      o.seancesSousConsigne.forEach(function (id) { recues[id] = true; });
      seances = seances.map(function (se, i) {
        var g = groupes[i];
        var id = g && g.seance ? g.seance.id : null;
        return id !== null && id !== undefined && recues[id] === true ? Object.assign({}, se, { sousConsigne: true }) : se;
      });
    }
    // §9.1.1 (48b-7) — LE RANG 2 EST BRANCHÉ. Il attendait ici depuis
    // 48b-5b-2, câblé à `null` faute d'un endroit où lire la zone choisie.
    // §9.17 — `lestReponse` : la réponse à la carte du lest, une ENTRÉE du
    // profil. Elle vaut pour toute séance, comme le rythme et l'intention (le
    // rejeu le dit : « celles du profil actuel »).
    // §17.4 (74) — les plafonds d'après une série à fond passent AVANT tout le
    // reste : ce qui suit lit la consigne plafonnée.
    var consigne = consigneApresAFond(seances, avant,
      { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null,
        lestReponse: o.lestReponse, lestPossible: o.lestPossible, salle: o.salle || null, rallonge: o.rallonge || null, echelle: o.echelle === true });
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
    // 132 (ECRAN-SAISIE §3 ter.6, écran 4) — UN ÉLASTIQUE RETIRÉ OU RENOMMÉ, et rien d'autre pour proposer : la
    // consigne se tait et le dit (« Ton élastique Gris n'est plus dans Ma salle : je note sans proposer. »), au lieu de
    // « Première fois ici » (`o.elastiqueRetire`, le nom lu par l'app dans la dernière séance ; on ne devine pas).
    if (consigne && consigne.etat === 'silence' && consigne.raison === 'premiere_fois' &&
        typeof o.elastiqueRetire === 'string' && o.elastiqueRetire) {
      consigne = { etat: 'silence', raison: 'elastique_retire', fondement: { elastique: o.elastiqueRetire } };
    }
    // §10 bis (108) — LA SALLE, EN DERNIER : ce qui a pu poser une charge après
    // la consigne (le report d'une nouvelle zone, un départ) ne pose qu'une
    // charge que la salle fait. La salle en vigueur se fige avec la consigne.
    var salle = salleDeLaConsigne(consigne, o.salle);
    consigne = consigneDansLaSalle(consigne, salle);
    var rejeu = rejeuDuCompteur(seances, groupes, avant, o);
    var marquees = rejeu.marquees;
    var compteur = compteurFige(rejeu.complet);
    // §12.2 bis (54-1) — la zone d'une séance pour le repli de l'escalier :
    // lue À SA FIN, par la même fonction que le report et le compteur.
    var zoneAu = function (liste, i) {
      return zoneDeLaSeance(liste, i, avant, { reglage: o.reglage, equipement: o.equipement,
        corrections: o.correctionsDeZone || null, correction: o.correction || null, salle: o.salle || null });
    };
    // §20.2 — la référence des dates est `avant`, le début de la séance pour
    // laquelle la consigne est calculée : « mardi » se dit contre elle.
    // 132 (MOTEUR §10 ter) — les libellés d'un exercice noté par nom disent ses élastiques par leur nom : le formateur
    // traduit la charge virtuelle (`THModele.avecNoms`), au seul endroit de l'affichage.
    var nomsDesCrans = salleDElastiques(o.salle) ? o.salle.noms || null : null;
    var resultat = { consigne: consigne,
             libelles: Modele().avecNoms(nomsDesCrans, function () { return libellesConsigne(consigne, avant); }),
             etiquette: etiquetteZone(consigne, o.ligneDeZone, plan),
             // La feuille « Pourquoi » n'est PLUS ici (relevé du 01/10, PR 1) :
             // elle décrit la consigne que le plan applique (figée, allégée,
             // repli, série de plus) — le plan la pose (`x.pourquoi`). Celle-ci,
             // sur la consigne brute, n'était lue par personne.
             // §9.14 (49-R2) — le contexte de la réaction, UNE FOIS par séance
             // et par exercice, sur les séances antérieures (§9.12).
             contexte: contexteReaction(seances, avant, consigne, o.equipement, null, salle),
             // §10 bis (108) — la salle en vigueur pour cet exercice, figée avec la
             // consigne : le plan vérifie qu'aucune charge proposée n'en sort (I46).
             salle: salle,
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
             // 174 — LES CRANS DE LA MARCHE « ALLÉGER », figés avec la consigne : le cran en dessous et l'arrondi de P x 0,95.
             // 174 (3/3) — SIX SÉANCES DE BORD SANS MONTER : de quoi proposer la zone 3-5, figé avec la consigne.
             bord: bordSansMonter(consigne),
             // 186 — TROIS SÉANCES AU-DESSUS DU HAUT : de quoi proposer la zone suivante, figé avec la consigne.
             depassement: depassementLong(seances, avant, consigne),
             alleger: compteur.compteur >= ALLEGER_DES && consigne && consigne.zone
               ? crans(seances, avant, consigne.palier, o.equipement, salle) : null,
             repli: compteur.compteur >= PAS_ESCALIER && consigne && consigne.zone
               ? repliDansLaSalle(repliEscalier(marquees, avant, compteur.meilleur, consigne.zone,
                                                { zoneAu: zoneAu, actuel: consigne.palier }), salle)
               : null,
             // §9.20 (51-3) — LA REPRISE APRÈS UNE SÉANCE DOULOUREUSE, figée avec
             // la consigne : le plan pose la carte, aucun écran ne la décide.
             reprise: reprisePour(marquees, avant, consigne, compteur.meilleur, { equipement: o.equipement, salle: salle }),
             // I34 — les séances marquées « douleur » (leurs débuts) : le plan
             // vérifie qu'aucune ne fonde la charge de la consigne.
             douleurs: anterieures(seances, avant).filter(function (se) { return se.douleur === true; })
               .map(function (se) { return se.debut; }),
             // §13.6 (49-U20) — LE FRÈRE QUI PROGRESSE PENDANT LE BLOCAGE, figé
             // avec la consigne. Ses frères ne sont demandés (`o.freres`, une
             // fonction) et rejoués que si le compteur est à 4 ou plus.
             frere: compteur.compteur >= SEUIL_COMPTEUR && typeof o.freres === 'function'
               ? frereDuBlocage(rejeu.complet.verdicts, o.freres, avant, o.mesure) : null };
    // 193-3 — la clé n'existe que pour une zone de plan : sans elle, la sortie est celle d'avant, octet pour octet.
    if (plan !== null) resultat.plan = plan;
    return resultat;
  }

  // LE REJEU DU COMPTEUR, le même pour l'exercice et pour ses frères : les
  // séances du contrat, marquées sous consigne, puis `compteurDe`. `toutes` :
  // chaque séance jugée, sous consigne ou non (les frères, ci-dessous).
  function rejeuDuCompteur(seances, groupes, avant, o, toutes) {
    var marquees = marquerSousConsigne(seances, groupes, o.seancesSousConsigne, o.periodesAllegees,
      o.periodesSerieDePlus);
    return { marquees: marquees,
             complet: compteurDe(marquees, avant, { reglage: o.reglage, equipement: o.equipement,
               correction: o.correction || null, corrections: o.correctionsDeZone || null, toutes: toutes === true,
               salle: o.salle || null }) };
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
        { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null, salle: o.salle || null });
      return { id: f.slug, nom: f.nom, verdicts: rejeuDuCompteur(seances, f.groupes, avant, o, true).complet.verdicts };
    }), avant);
  }

  // Ce que la consigne FIGÉE garde du compteur (elle s'écrit sur le disque avec
  // les consignes) : le compte, le meilleur, la dernière séance et les blocages
  // — pas le détail des verdicts, que rien ne relit hors des tests.
  function compteurFige(c) {
    return { compteur: c.compteur, meilleur: c.meilleur, derniere: c.derniere, blocages: c.blocages };
  }

  // 165 (MOTEUR §9.22, §14.4, décision d'Aurélien du 24/10/2026) — UNE SÉANCE ALLÉGÉE NE SERT JAMAIS DE RÉFÉRENCE.
  // Une séance dont le jour tombe dans une décharge planifiée ou une semaine allégée acceptée (`periodes`, jours
  // civils `[{ debut, fin }]`) devient NEUTRE pour la consigne : palier, niveau validé, zone, habitude, effort visé,
  // compteur et « pourquoi » lisent la dernière séance normale. Elle reste dans le contrat — une présence pour le
  // rythme (§9.9), ses séries dans les faits, records et volume (qui ne passent pas par ici). `decharge` : la
  // marque que le compteur lit déjà (§14.4). Sans période, la liste est rendue telle quelle.
  function sansLesAllegees(seances, periodes) {
    if (!periodes || !periodes.length) return seances;
    return (seances || []).map(function (se) {
      var jour = jourCivil(se && se.debut);
      var allegee = !!jour && periodes.some(function (p) {
        return p && p.debut && p.fin && p.debut <= jour && jour <= p.fin;
      });
      return allegee ? Object.assign({}, se, { neutre: true, decharge: true }) : se;
    });
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
    return avecDebutant(options, function () { return suiteDExerciceCalcul(groupes, groupeDuJour, etat, apres, options); });
  }
  function suiteDExerciceCalcul(groupes, groupeDuJour, etat, apres, options) {
    var o = options || {};
    var tous = (groupes || []).concat([groupeDuJour]);
    var cApres = consigneDExercice(tous, etat, apres, o);
    if (!cApres) return null;
    var P = cApres.consigne.palier;
    // §9.17 — au poids du corps (palier 0), il n'y a pas de cran suivant.
    // §10 bis (108) — la salle : le cran suivant est une charge qu'elle fait,
    // ou rien (« il te manque une rep pour tester… » ne se dit pas au-delà).
    var contrat = P === null || P === undefined || P === 0 ? null
      : contratDe(tous, etat, o.mesure,
          { reglage: o.reglage, equipement: o.equipement, correction: o.correction || null, salle: o.salle || null });
    var salleDuCran = P > 0 ? salleEnVigueur(o.salle || null, P) : null;
    var cran = contrat === null ? null : voisineSalleComprise(contrat, apres, P, o.equipement, 1, salleDuCran);
    // 163 — le cran suivant jamais fait se dit « ≈ » (« Il te manque une rep pour tester ≈ 45 kg »).
    var approche = cran !== null && !salleDuCran && estApprochee(contrat, apres, cran, o.equipement);
    return { apres: cApres, cranSuivant: cran, cranSuivantApprochee: approche };
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
  function constatDuJour(consigneAvant, consigneApres, reglage, cranSuivant, jour, reference, cranApproche) {
    var j = jour || {};
    var d = constatEnDeux(consigneAvant, consigneApres, reglage, cranSuivant, reference, cranApproche, j.series || null);
    if (!d) return null;
    var base = { verdict: d.verdict.texte, suite: d.suite.texte };
    Modele().reporter(d.suite.citations);
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
  // 151 (23/10/2026, décision d'Aurélien) — LA SECONDE BAISSE : −20 % de la charge de la première, posée par la
  // routine ou l'utilisateur ; le coach la remplit, il n'en ajoute jamais.
  var BAISSE_SECONDE = 0.20;
  var VISEE_SECONDE = [4, 6];
  var REPS_MIN_CHAINE = 4;
  var PHRASE_BARRE_LOURDE = 'À la barre lourde, une seule baisse.';
  var PHRASE_TROISIEME = 'Deux baisses au plus : une troisième fatigue sans rien ajouter.';
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
  // §9.15.5 (94, 14/10/2026) — LA CHAUFFE AJOUTÉE PAR L'UTILISATEUR, là où la
  // table n'en prévoit pas (situation « aucune » : isolation, muscles déjà
  // sollicités, barre légère déjà sollicitée). « La routine ou l'utilisateur
  // décide combien de chauffes ; le coach en calcule toujours la charge. »
  // 1 → ~60 % × 8 ; 2 → ~50 % × 8 puis ~75 % × 4 ; 3 et plus → la rampe de la
  // barre lourde, ses dernières marches s'il y en a moins de 4. Hors barre, la
  // marche « barre vide » n'existe pas : elle devient ~30 % × 10 (choix 94).
  var CHAUFFES_AJOUTEES = {
    1: [{ p: 0.60, reps: 8 }],
    2: [{ p: 0.50, reps: 8 }, { p: 0.75, reps: 4 }]
  };
  var MARCHE_BASSE_HORS_BARRE = { p: 0.30, reps: 10 };
  var TROP_LEGER = 'Trop léger pour une chauffe de plus.';
  function marchesAjoutees(n, equipement) {
    if (CHAUFFES_AJOUTEES[n]) return CHAUFFES_AJOUTEES[n];
    var rampe = TABLE_CHAUFFES.barre_lourde.map(function (m) {
      return m.barre && !estBarre(equipement) ? MARCHE_BASSE_HORS_BARRE : m;
    });
    return n < rampe.length ? rampe.slice(rampe.length - n) : rampe;
  }

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
    // 190 — jamais sous le pas de la barre : avec des disques de 5 kg (pas de 10 kg), une chauffe à 5 kg près n'existe pas.
    if (estBarre(entree.equipement)) {
      return Math.max(nombre(entree.reference) >= SEUIL_DIZAINE ? 10 : 5, pasDeLaBarre(plusPetitDisqueConnu()));
    }
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
    // §10 bis (108) — LA SALLE DÉCLARÉE : la charge qu'elle fait la plus proche
    // de la marche (l'égalité vers le bas), toujours sous la référence ; la
    // « barre vide » est sa barre la plus légère. Rien sous la référence : `null`.
    var salle = entree.salle ? salleEnVigueur(entree.salle, ref) : null;
    if (salle) {
      var sous = chargesDeLaSalle(salle).filter(function (v) { return v < ref && !memeCharge(v, ref); });
      if (!sous.length) return null;
      if (m.barre) return sous[0];
      var vise = ref * m.p, meilleure = sous[0];
      sous.forEach(function (v) {
        if (Math.abs(v - vise) < Math.abs(meilleure - vise) - 1e-9) meilleure = v;
      });
      return meilleure;
    }
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
        ? table.map(function (m) { return [chargeDeMarche(m, e, pas), m.reps]; })
            .filter(function (x) { return x[0] !== null; }) : [];
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
    var ajoutees = situation === 'aucune' && n > 0;
    var marches = ajoutees ? marchesAjoutees(n, e.equipement)
      : (table.length && n ? marchesPour(table, n) : []);
    var precedente = null, tropLegeres = 0;
    var lignes = routine.map(function (reps, i) {
      var m = marches[i];
      if (!m) return { reps: reps, charge: null };
      var c = chargeDeMarche(m, e, pas);
      // §10 bis (108) — la salle n'a aucune charge sous la référence : la ligne
      // reste vide, et la phrase le dit (jamais vide en silence, I16).
      if (c === null) { tropLegeres++; return { reps: reps, charge: null, trop_leger: true }; }
      if (!ajoutees) return { reps: reps, charge: c };
      // §9.15.5 — les reps de la routine, sinon celles de la règle ; une
      // marche qui ne se distingue pas (pas au-dessus de la précédente, pas un
      // cran sous la référence, rien au-dessus de zéro) reste vide.
      var r = reps === null || reps === undefined ? m.reps : reps;
      if (!(c > 0) || c > ref - pas + 1e-9 || (precedente !== null && c <= precedente + 1e-9)) {
        tropLegeres++;
        return { reps: reps, charge: null, trop_leger: true };
      }
      precedente = c;
      return { reps: r, charge: c, reps_coach: reps === null || reps === undefined };
    });
    var remplies = lignes.filter(function (l) { return l.charge !== null; }).map(function (l) { return l.charge; });
    var phrase = null;
    if (remplies.length) {
      var avant = remplies.slice(0, -1).map(function (c) { return nombreFr(c, regle('chauffe')); });
      phrase = 'Chauffes calées sur ' + Modele().charge(ref, undefined, regle('reference')) + ' : ' +
        avant.concat([Modele().charge(remplies[remplies.length - 1], undefined, regle('chauffe'))]).join(' · ') + '.';
    }
    if (tropLegeres) phrase = (phrase ? phrase + ' ' : '') + TROP_LEGER;
    return { situation: situation, lignes: lignes, prevues: ajoutees ? marches.length : table.length,
             trop_legeres: tropLegeres,
             non_remplies: lignes.length - remplies.length - tropLegeres, phrase: phrase };
  }

  // §9.15.3 — la dégressive. `entree` : `{ equipement, derniere_serie,
  // reps_travail, cran }`. Rend `{ charge, vise, phrase, repos }`. Depuis 94
  // (14/10/2026, §9.15.3 révisé), À LA BARRE AUSSI : le coach ne la propose
  // jamais sur une barre lourde, mais celle que la routine ou l'utilisateur a
  // posée se remplit comme hors barre, au cran de la barre (les disques), et la
  // phrase dit quoi enlever (`enleve` : de chaque côté). Une ligne qu'il ne peut
  // pas remplir rend `{ charge: null, phrase, gestes }` : la phrase dit
  // pourquoi, les gestes proposent d'en faire une série normale ou de la retirer.
  var GESTES_DEGRESSIVE_VIDE = ['serie_normale', 'retirer'];
  function degressiveVide(phrase) {
    return { charge: null, vise: null, repos: null, phrase: phrase, gestes: GESTES_DEGRESSIVE_VIDE.slice() };
  }
  var DISQUES = [25, 20, 15, 10, 5, 2.5, 1.25];
  var BAISSE_MIN_BARRE = 0.15, BAISSE_MAX_BARRE = 0.30;
  // Ce qu'on enlève de CHAQUE côté (kg), ou `null` si rien ne tombe dans la fenêtre.
  function disquesAEnlever(der, baisse) {
    var bas = der * BAISSE_MIN_BARRE / 2 - 1e-9, haut = der * BAISSE_MAX_BARRE / 2 + 1e-9;
    var cible = der * (baisse || BAISSE_DEGRESSIVE) / 2;
    var dans = function (v) { return v >= bas && v <= haut; };
    // 190 — jamais un disque plus petit que le plus petit de la salle.
    var plusPetit = plusPetitDisqueConnu();
    var disques = DISQUES.filter(function (d) { return plusPetit === null || d >= plusPetit - 1e-9; });
    var seul = disques.filter(dans).sort(function (a, b) {
      var da = Math.abs(a - cible), db = Math.abs(b - cible);
      return da !== db ? da - db : a - b;
    });
    if (seul.length) return seul[0];
    var paires = [];
    disques.forEach(function (a, i) { disques.slice(i).forEach(function (b) { if (dans(a + b)) paires.push(auCentieme(a + b)); }); });
    paires.sort(function (a, b) { return a - b; });
    return paires.length ? paires[0] : null;
  }
  // 151 — `rang` : 1 (défaut) la première baisse ; 2 la seconde (−20 % de la charge de la première, passée en
  // `derniere_serie`, « Vise 4 à 6 ») ; 3 et plus jamais remplie. `lourde` : une barre lourde (une seule baisse) ;
  // `reps_premiere` : les reps de la première baisse si elle est faite (sous 4, la chaîne s'arrête).
  function degressiveDe(entree) {
    var e = entree || {};
    var rang = nombre(e.rang) || 1;
    if (rang >= 2 && e.lourde) return degressiveVide(PHRASE_BARRE_LOURDE);
    if (rang >= 3) return degressiveVide(PHRASE_TROISIEME);
    var rp = nombre(e.reps_premiere);
    if (rang === 2 && rp !== null && rp < REPS_MIN_CHAINE) {
      return degressiveVide(nombreFr(rp, regle('degressive.arret')) + (rp > 1 ? ' reps' : ' rep') + ' à la première baisse : on s\'arrête là.');
    }
    var seconde = rang === 2;
    var baisse = seconde ? BAISSE_SECONDE : BAISSE_DEGRESSIVE;
    var der = nombre(e.derniere_serie);
    if (der === null || der <= 0) return degressiveVide('Pas de charge de travail pour caler la dégressive.');
    var cran = nombre(e.cran);
    if (cran === null || cran <= 0) cran = CRAN_PAR_DEFAUT;
    // §10 bis (108) — LA SALLE DÉCLARÉE : la même baisse (−22,5 %), au cran
    // inférieur que la salle fait — une barre fixe, une paire d'haltères. À la
    // barre fixe, on change de barre : « Prends la barre de 20 kg. »
    var salle = e.salle ? salleEnVigueur(e.salle, der) : null;
    if (salle) return degressiveDeLaSalle(salle, der, nombre(e.reps_travail), seconde);
    // Au cran INFÉRIEUR : jamais au-dessus des −22,5 %.
    var charge = auCentieme(Math.floor(der * (1 - baisse) / cran + 1e-9) * cran);
    var barre = estBarre(e.equipement);
    // 94 (Claude.ai, 15/10/2026) — À LA BARRE, ON ENLÈVE DES DISQUES : un seul
    // disque standard de chaque côté, le plus proche de −22,5 %, entre −15 % et
    // −30 % ; sinon la plus petite combinaison de deux disques dans la fenêtre.
    var enleveBarre = null;
    if (barre) {
      enleveBarre = disquesAEnlever(der, baisse);
      if (enleveBarre === null) return degressiveVide('Trop léger pour une dégressive.');
      charge = auCentieme(der - 2 * enleveBarre);
    }
    // Pas de plancher « barre vide » ici : une barre EZ pèse moins de 20 kg, et
    // le curl EZ d'aurel_br descend à 15 kg (relevé du 14/10). Seul le zéro.
    if (!(charge > 0)) return degressiveVide('Trop léger pour une dégressive.');
    var reps = nombre(e.reps_travail);
    var vise = seconde ? VISEE_SECONDE.slice() : viseeDegressive(reps);
    var visee = phraseViseeDegressive(vise);
    var debutPhrase = seconde ? 'Deuxième baisse' : 'Dégressive';
    if (barre) {
      var enleve = enleveBarre;
      return {
        charge: charge, vise: vise, repos: 0, enleve: enleve,
        phrase: 'Enlève ' + Modele().charge(enleve, undefined, regle('degressive.enleve')) + ' de chaque côté : ' +
          Modele().charge(charge, undefined, regle('degressive')) + '. Sans repos, jusqu\'à l\'échec. ' + visee
      };
    }
    return {
      charge: charge, vise: vise, repos: 0,
      phrase: debutPhrase + ' : ' + Modele().charge(charge, undefined, regle('degressive')) +
        ', sans repos, jusqu\'à l\'échec. ' + visee
    };
  }

  // La fourchette d'une dégressive : environ la moitié des reps de la série de
  // travail (§9.15.3), et sa phrase. Une seule définition, pour la barre, les
  // disques et la salle.
  function viseeDegressive(reps) {
    var milieu = Math.max(4, Math.floor((reps === null || reps === undefined ? 8 : reps) / 2));
    return [milieu - 1, milieu + 1];
  }
  function phraseViseeDegressive(vise) {
    return 'Vise ' + nombreFr(vise[0], regle('degressive.vise')) + ' à ' + nombreFr(vise[1], regle('degressive.vise')) + '.';
  }
  // §10 bis (108) — la dégressive dans la salle déclarée : la charge qu'elle
  // fait juste sous −22,5 %, toujours sous la dernière série de travail.
  function degressiveDeLaSalle(salle, der, reps, seconde) {
    var cible = auCentieme(der * (1 - (seconde ? BAISSE_SECONDE : BAISSE_DEGRESSIVE)));
    var sous = chargesDeLaSalle(salle).filter(function (v) {
      return (v < cible || memeCharge(v, cible)) && v < der && !memeCharge(v, der);
    });
    if (!sous.length) return degressiveVide('Trop léger pour une dégressive.');
    var charge = sous[sous.length - 1];
    var vise = seconde ? VISEE_SECONDE.slice() : viseeDegressive(reps);
    var suite = 'Sans repos, jusqu\'à l\'échec. ' + phraseViseeDegressive(vise);
    if (SALLE_BARRES.indexOf(salle.materiel) >= 0) {
      return { charge: charge, vise: vise, repos: 0, barreFixe: true,
               phrase: 'Prends la barre de ' + Modele().charge(charge, undefined, regle('degressive')) + '. ' + suite };
    }
    return { charge: charge, vise: vise, repos: 0,
             phrase: (seconde ? 'Deuxième baisse' : 'Dégressive') + ' : ' + Modele().charge(charge, undefined, regle('degressive')) +
               ', sans repos, jusqu\'à l\'échec. ' + phraseViseeDegressive(vise) };
  }

  // ══ 193-1 (MOTEUR §9.28) — LA SÉRIE DE RECUL : SA CHARGE, SON ÉCART ═══════════════════════════════════════════════════════
  //
  // Une grosse série lourde (150 kg × 4), puis des séries plus légères (135 kg × 6-6-6) au repos de l'exercice. La grosse série décide
  // de la charge (le palier, le test, le cran : rien ne change pour elle) ; les reculs la SUIVENT, sans règle de charge à eux.
  //   charge d'un recul = la charge de la grosse série DU JOUR − un écart, arrondie au cran le PLUS PROCHE du matériel, vers le BAS
  //   en cas d'égalité (150 × 0,925 = 138,75 → 137,5, pas 140), jamais au niveau de la grosse (le cran de départ est celui d'en dessous).
  //   écart : 10 % au départ (convention des coachs : RTS, powerbuilding, 10 à 15 % ; en powerlifting, les séries qui suivent un single
  //   se font vers 80 % de ce single — Androulakis-Korakakis 2021). Il se LIT sur la dernière séance de l'exercice qui avait des
  //   reculs : l'écart réel (1 − charge des reculs ÷ charge de la grosse), borné 5 % à 20 %, puis ± 2,5 points selon les reps —
  //   TOUS les reculs à la cible + 2 ou plus : il baisse ; UN recul sous la cible : il monte. Les chiffres 2,5 et 5-20 % sont une
  //   convention, dite comme telle. Une fonction pure, sous la garde, appelée par `planDeSeance`.
  var RECUL_ECART_DEPART = 0.10;
  var RECUL_ECART_PAS = 0.025;
  var RECUL_ECART_MIN = 0.05;
  var RECUL_ECART_MAX = 0.20;
  var RECUL_MARGE_REPS = 2;
  function bornerEcartDeRecul(v) {
    return Math.min(RECUL_ECART_MAX, Math.max(RECUL_ECART_MIN, Math.round(v * 1e6) / 1e6));
  }
  // Le cran sous P le plus proche de `cible`, VERS LE BAS à égalité (contrairement à `cranSousProcheDe`, qui garde le plus lourd :
  // il sert aux vagues de bord). Départ : le cran en dessous de P, donc jamais P ni plus lourd. `null` : rien de plus léger.
  function cranLePlusProche(voisineFn, P, cible) {
    var cur = voisineFn(P, -1);
    if (cur === null) return null;
    for (var t = 0; t < 40; t++) {
      var nxt = voisineFn(cur, -1);
      if (nxt !== null && nxt < cur && Math.abs(nxt - cible) <= Math.abs(cur - cible) + 1e-9) cur = nxt; else break;
    }
    return cur;
  }
  // L'ÉCART d'UNE séance : `precedent` = `{ series: [{ charge_kg, reps, type_serie }] }`, la dernière séance de l'exercice qui avait des
  // reculs (`THSeance.precedentAReculs`), ou `null`. `cible` : les reps visées d'un recul — celles de la routine de CETTE séance
  // (`routine_id`) quand l'app les a, sinon celles d'aujourd'hui : une APPROXIMATION (la routine a pu changer entre-temps), dite
  // telle. Sans cible, l'écart réel est gardé tel quel. L'écart réel est arrondi au demi-point (135 ÷ 150 et 137,5 ÷ 152,5 sont « 10 % »).
  // Rend `{ ecart, depart, reel, sens, reps, cible }` ; `sens` : 'rapproche' | 'eloigne' | null.
  function ecartDeRecul(precedent, cible) {
    var serie = (precedent && precedent.series) || [];
    var M = Modele();
    var grosse = null, reculs = [];
    serie.forEach(function (x) {
      var kg = nombre(x && x.charge_kg), r = nombre(x && x.reps);
      if (kg === null || kg <= 0 || r === null) return;
      if (M.estRecul(x)) reculs.push({ charge: kg, reps: r });
      else if (M.estTravail(x) && (grosse === null || kg > grosse)) grosse = kg;
    });
    if (grosse === null || !reculs.length) {
      return { ecart: RECUL_ECART_DEPART, depart: true, reel: null, sens: null, reps: [], cible: null };
    }
    var reel = bornerEcartDeRecul(Math.round((1 - reculs[0].charge / grosse) * 200) / 200);
    var c = nombre(cible);
    var reps = reculs.map(function (x) { return x.reps; });
    var ecart = reel, sens = null;
    if (c !== null && c >= 1) {
      if (reps.some(function (r) { return r < c; })) { ecart = bornerEcartDeRecul(reel + RECUL_ECART_PAS); sens = 'eloigne'; }
      else if (reps.every(function (r) { return r >= c + RECUL_MARGE_REPS; })) { ecart = bornerEcartDeRecul(reel - RECUL_ECART_PAS); sens = 'rapproche'; }
    }
    return { ecart: ecart, depart: false, reel: reel, sens: sens, reps: reps, cible: c !== null && c >= 1 ? c : null };
  }
  // La charge d'un recul. `entree` : `{ grosse, ecart, cran, salle, reps }` — `grosse` : la plus lourde série de travail de l'exercice
  // dans la séance (validée ou proposée), `cran` : le pas du matériel de la consigne, `salle` : la salle déclarée (§10 bis). Rend
  // `{ charge, ecart, vise, phrase }` ; une ligne qu'il ne peut pas remplir rend `{ charge: null, phrase }` (jamais une charge devinée).
  var PHRASE_RECUL_SANS_GROSSE = 'Pas de grosse série pour caler tes reculs.';
  var PHRASE_RECUL_TROP_LEGER = 'Rien de plus léger que ta grosse série pour un recul.';
  function reculDe(entree) {
    var e = entree || {};
    var g = nombre(e.grosse);
    var vide = function (phrase) { return { charge: null, ecart: null, vise: nombre(e.reps), phrase: phrase }; };
    if (g === null || g <= 0) return vide(PHRASE_RECUL_SANS_GROSSE);
    var ecart = nombre(e.ecart);
    if (ecart === null) ecart = RECUL_ECART_DEPART;
    ecart = bornerEcartDeRecul(ecart);
    var voisine = voisineDuRecul(e.salle, g, e.cran);
    var cible = auCentieme(g * (1 - ecart));
    var charge = cranLePlusProche(voisine, g, cible);
    if (charge === null || !(charge > 0) || charge >= g) return vide(PHRASE_RECUL_TROP_LEGER);
    return { charge: charge, ecart: ecart, vise: nombre(e.reps), phrase: null };
  }
  // Le cran voisin d'une charge : la salle déclarée (§10 bis) ou le pas du matériel. Une seule fonction pour les deux manières de
  // caler un recul (l'écart de la 193-1, le max du jour de la 193-5).
  function voisineDuRecul(salleBrute, g, pas) {
    var salle = salleBrute ? salleEnVigueur(salleBrute, g) : null;
    var cran = nombre(pas);
    if (cran === null || cran <= 0) cran = CRAN_PAR_DEFAUT;
    return salle
      ? function (c, sens) { return voisineDeLaSalle(salle, c, sens); }
      : function (c, sens) {
          // Le plus grand multiple du cran STRICTEMENT sous c (sens −1).
          var k = Math.ceil(c / cran - 1e-9) - 1;
          var v = auCentieme(k * cran);
          return sens < 0 && v > 0 && v < c ? v : null;
        };
  }

  // ══ 193-5 (MOTEUR §9.28, delta du 31/10/2026) — LES RECULS À PLUS DE REPS SE CALENT SUR LE MAX DU JOUR ══════════════════════
  //
  // Seulement quand les reps visées des reculs DÉPASSENT celles de la grosse série (« 1 × 4 puis 2 reculs × 8 ») : l'écart de 10 %
  // y est trop lourd. La grosse série dit un max du jour (sa charge ÷ le pourcentage que la table donne à ses reps, marge comprise) ;
  // le recul en est le pourcentage de ses propres reps, marge 2, corrigé de ce que la personne a montré. Reculs aux mêmes reps (ou
  // moins) : la 193-1, inchangée. La table est celle de Tuchscherer (RPE 10 = marge 0), une CONVENTION dite comme telle ; elle
  // COEXISTE avec Epley (`unRMEpley`, records et bilans) : deux usages, deux lectures, aucune ne remplace l'autre.
  var PCT_MAX_PAR_REPS = [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0];
  var RECUL_MARGE_VISEE = 2;            // la marge d'un recul : on en garde 2

  // ══ 193-6 (MOTEUR §9.30, v2_123) — LA DERNIÈRE SÉRIE « AU MAX » ══
  //
  // UNE SEULE FONCTION DE DÉCISION : `auMaxDe`. Pure, sans séance : la lisent le plan et (plus tard) le générateur. Rend la réserve
  // DEMANDÉE (0 = jusqu'à l'échec, 1 à 3 = en gardant N reps), jamais un type de série : l'échec se lit dans `au_max_reserve`.
  var AU_MAX_JOURS_DE_DOULEUR = 42;     // « J'ai mal » récent : six semaines civiles (même durée que la 189, sans la toucher)
  var AU_MAX_RESERVE_PAR_DEFAUT = 2;    // ce que la personne obtient quand elle pose « Au max » là où la table n'en met pas
  var OBJECTIFS_AU_MAX = ['force', 'muscle', 'les_deux', 'forme', 'calisthenie'];
  // 193-6b — L'ÉCHEC SUR UNE BARRE, UNE FOIS PAR SEMAINE (MOTEUR §9.30 bis) : 6 jours civils avant `jour`.
  var AU_MAX_JOURS_D_ECHEC = 6;
  // Une série à l'échec sur cette barre dans les 6 jours civils PRÉCÉDENTS (le jour même n'en fait pas partie). `jours` : les jours (ou
  // instants) des séries à l'échec de la barre, un fait de `faits.echecsDeBarre`. Rend le jour le plus récent, ou `null`.
  function echecRecentDeBarre(jours, jour) {
    var k = numeroDuJour(jourCivil(jour)), meilleur = null;
    if (k === null) return null;
    (jours || []).forEach(function (j) {
      var jc = jourCivil(j), n = numeroDuJour(jc);
      if (n !== null && k - n >= 1 && k - n <= AU_MAX_JOURS_D_ECHEC && (meilleur === null || n > numeroDuJour(meilleur))) meilleur = jc;
    });
    return meilleur;
  }
  // Un exercice « J'ai mal » dans les 42 jours avant `jour`. `jours` : les jours (ou instants) des séries marquées.
  function douleurRecente(jours, jour) {
    var k = numeroDuJour(jourCivil(jour));
    if (k === null) return false;
    return (jours || []).some(function (j) {
      var n = numeroDuJour(jourCivil(j));
      return n !== null && n <= k && k - n < AU_MAX_JOURS_DE_DOULEUR;
    });
  }
  function classeAuMax(famille) {
    var B = Modele().BARRES;
    if (famille === B[0]) return 'squat';
    if (famille === B[1]) return 'couche';
    if (famille === B[2]) return 'souleve';
    if (famille === B[3]) return 'militaire';
    return 'accessoire';
  }
  // `e` : { objectif, debutant, famille (la barre, `familleDeBarre`), equipement, isolation, allegee, menagee, douleurRecente,
  //         barreDeJambesApres, main, zoneDePlan (193-6b : la zone que la ligne porte, ou null), echecRecent (193-6b : une série à
  //         l'échec sur cette barre dans les 6 jours précédents) }. `pose` : 'defaut' (le coach la pose), 'main' (la personne l'a posée), ou null (rien).
  function auMaxDe(e) {
    var x = e || {};
    var rien = { pose: null, reserve: null, sorte: null, avecPareur: false, classe: null };
    if (x.allegee) return rien;                                   // semaine allégée, décharge : aucun « Au max »
    if (x.figure === true) return rien;                           // 195 : une figure (une tenue en secondes) ne va jamais à l'échec
    var objectif = OBJECTIFS_AU_MAX.indexOf(x.objectif) >= 0 ? x.objectif : null;
    var main = x.main === true;
    if (objectif === null && !main) return rien;                  // on ne devine pas un objectif
    var classe = classeAuMax(x.famille);
    var gros = objectif === 'muscle' || objectif === 'les_deux';
    var reserve = null;                                           // `null` : la table ne met rien
    if (classe === 'accessoire') {
      if (gros) {
        // le débutant : l'échec seulement aux machines et aux isolations
        reserve = x.debutant === true && !(x.equipement === 'machine' || x.isolation === true) ? 1 : 0;
      } else if (objectif === 'force' || objectif === 'calisthenie') reserve = 1;   // 195 : « Au max, en gardant 1 » (la Recommended Routine évite l'échec)
    } else if (classe === 'squat' || classe === 'couche') {
      if (gros) reserve = x.debutant === true ? 1 : 0;
    } else if (classe === 'militaire') {
      if (gros) reserve = 1;
    } else if (classe === 'souleve') {
      if (gros) reserve = 2;
    }
    var pose = 'defaut';
    if (reserve === null) {
      if (!main) return rien;
      reserve = AU_MAX_RESERVE_PAR_DEFAUT; pose = 'main';
    } else if (main) pose = 'main';
    // le squat ne va pas à l'échec si une autre barre lourde de jambes suit
    if (reserve === 0 && classe === 'squat' && x.barreDeJambesApres === true) reserve = 1;
    // 193-6b — sur une barre, l'échec n'est donné que le jour Lourd (zone de plan) ou, sans zone de plan, si la barre n'est pas
    // déjà allée à l'échec dans les 6 jours précédents. Accessoires, machines, isolations : inchangés.
    if (reserve === 0 && (classe === 'squat' || classe === 'couche' || classe === 'militaire')) {
      var zdp = x.zoneDePlan || null;
      if (zdp ? zdp !== 'lourd' : x.echecRecent === true) reserve = 1;
    }
    // une zone à ménager, un « J'ai mal » récent : jamais d'échec, au plus « en gardant 2 reps »
    if ((x.menagee || x.douleurRecente === true) && reserve < AU_MAX_RESERVE_PAR_DEFAUT) reserve = AU_MAX_RESERVE_PAR_DEFAUT;
    return { pose: pose, reserve: reserve, sorte: reserve === 0 ? 'echec' : 'garde',
             avecPareur: reserve === 0 && (classe === 'squat' || classe === 'couche'), classe: classe };
  }
  // La consigne sous la ligne. Le nombre de reps gardées est cité (I26 : `regle|au_max.reserve`).
  function consigneAuMax(a) {
    if (!a || a.reserve === null || a.reserve === undefined) return null;
    if (a.reserve === 0) return a.avecPareur ? 'Jusqu’à l’échec, sur les sécurités ou avec un pareur' : 'Jusqu’à l’échec';
    return 'Autant que tu peux, en gardant ' + nombreFr(a.reserve, regle('au_max.reserve')) + ' rep' + (a.reserve > 1 ? 's' : '');
  }
  // 193-6b — « Ton squat est déjà allé à l'échec mardi : aujourd'hui, garde 1 rep. » `classe` : celle de `auMaxDe`.
  var NOMS_DE_BARRE_AU_MAX = { squat: 'squat', couche: 'développé couché', militaire: 'développé militaire' };
  function pourquoiAuMaxEchecRecent(classe, jourDeLEchec, reserve) {
    var nom = NOMS_DE_BARRE_AU_MAX[classe] || 'exercice';
    var k = numeroDuJour(jourCivil(jourDeLEchec));
    var quand = k === null ? '' : ' ' + Modele().JOURS[new Date(k * JOUR).getUTCDay()];
    return 'Ton ' + nom + ' est déjà allé à l’échec' + quand + DEUX_POINTS + 'aujourd’hui, garde ' +
      nombreFr(reserve, regle('au_max.reserve')) + ' rep' + (reserve > 1 ? 's' : '') + '.';
  }
  function pourquoiAuMaxSouleve() {
    return 'Au soulevé, l’échec veut dire des reps arrachées dos rond. Ta dernière série s’arrête quand il t’en reste ' +
      nombreFr(AU_MAX_RESERVE_PAR_DEFAUT, regle('au_max.reserve')) + '.';
  }
  // Les reps que la table donne à `charge` pour un max du jour `max`, en gardant `reserve`. `null` hors de la table.
  function prevoirRepsAuMax(charge, max, reserve) {
    var c = nombre(charge), m = nombre(max), r = nombre(reserve);
    if (c === null || m === null || r === null || c <= 0 || m <= 0) return null;
    var rt = repsDeLaTable(c / m * 100);
    return rt === null ? null : Math.max(1, Math.round(rt - r));
  }
  // Le constat, un fait : « Ta dernière série me dit où tu en es : 12 reps à 112,5 kg, 2 de plus que prévu. »
  function constatAuMax(charge, reps, prevu) {
    var base = 'Ta dernière série me dit où tu en es' + DEUX_POINTS + nombreFr(reps, regle('au_max.reps')) + ' reps à ' + enKg(charge, regle('au_max.charge'));
    var p = nombre(prevu);
    if (p === null) return base + '.';
    var d = nombre(reps) - p;
    if (d === 0) return base + ', comme prévu.';
    return base + ', ' + nombreFr(Math.abs(d), regle('au_max.ecart')) + ' de ' + (d > 0 ? 'plus' : 'moins') + ' que prévu.';
  }
  // Le niveau SANS les séries « Au max » (le seul `depassementLong` : une série au max au-delà du haut ne propose jamais de changer
  // de zone). `null` quand il n'en reste aucune.
  function niveauHorsAuMax(series) {
    var M = Modele();
    var reste = (series || []).filter(function (s) { return !M.estAuMax(s); });
    return reste.length ? niveauValide(reste) : null;
  }

  var RECUL_CORRECTION_PAS = 0.025;
  var RECUL_CORRECTION_MAX = 0.10;
  var RECUL_CORRECTION_SEANCES = 4;
  var RECUL_CORRECTION_ECART = 2;       // reps faites ≥ prévision + 2 : un vrai signal
  // Le pourcentage du max pour `reps` reps en en gardant `marge` : décaler de `marge` reps (pct(r, m) = pct(r + m, 0)). Une marge
  // fractionnaire (RPE 8,5) s'interpole. `null` au-delà de 12 : pas de règle, la 193-1 reste.
  function pctDuMax(reps, marge) {
    var r = nombre(reps), m = nombre(marge);
    if (r === null || m === null || r < 1 || m < 0) return null;
    var t = r + m;
    if (t > PCT_MAX_PAR_REPS.length + 1e-9) return null;
    var lo = Math.floor(t + 1e-9);
    if (lo >= PCT_MAX_PAR_REPS.length) return PCT_MAX_PAR_REPS[PCT_MAX_PAR_REPS.length - 1];
    return PCT_MAX_PAR_REPS[lo - 1] + (t - lo) * (PCT_MAX_PAR_REPS[lo] - PCT_MAX_PAR_REPS[lo - 1]);
  }
  // L'inverse : combien de reps (marge comprise) la table donne à ce pourcentage. `null` hors de la table.
  function repsDeLaTable(pct) {
    var p = nombre(pct);
    var T = PCT_MAX_PAR_REPS;
    if (p === null || p > T[0] + 1e-9 || p < T[T.length - 1] - 1e-9) return null;
    for (var i = 0; i < T.length - 1; i++) {
      if (p <= T[i] + 1e-9 && p >= T[i + 1] - 1e-9) return (i + 1) + (T[i] - p) / (T[i] - T[i + 1]);
    }
    return T.length;
  }
  function maxDuJour(charge, reps, marge) {
    var c = nombre(charge), p = pctDuMax(reps, marge === null || marge === undefined ? 0 : marge);
    return c === null || c <= 0 || p === null ? null : c / (p / 100);
  }
  // Une séance passée à reculs, lue : sa grosse série (la plus lourde série de travail), ses reculs dans l'ordre, la cible de ses reculs.
  function lectureDeReculs(precedent) {
    var M = Modele();
    var grosse = null, reculs = [];
    ((precedent && precedent.series) || []).forEach(function (x) {
      var kg = nombre(x && x.charge_kg), r = nombre(x && x.reps);
      if (kg === null || kg <= 0 || r === null) return;
      if (M.estRecul(x)) reculs.push({ charge: kg, reps: r, serie: x, auMax: M.estAuMax(x) });
      else if (M.estTravail(x) && (grosse === null || kg > grosse.charge)) grosse = { charge: kg, reps: r, serie: x };
    });
    var c = nombre(precedent && precedent.cible);
    return { grosse: grosse, reculs: reculs, cible: c !== null && c >= 1 ? c : null };
  }
  // Cette séance avait-elle des reculs à PLUS de reps que sa grosse série ? La cible de sa routine quand on l'a, sinon les reps faites.
  function reculDePlusDeReps(precedent) {
    var l = lectureDeReculs(precedent);
    if (l.grosse === null || !l.reculs.length) return false;
    return (l.cible !== null ? l.cible : l.reculs[0].reps) > l.grosse.reps;
  }
  // La CORRECTION PERSONNELLE, rejouée (rien n'est écrit en base) sur les 4 dernières séances de l'exercice dont les reculs étaient à
  // plus de reps, du plus ancien au plus récent, un pas par séance, cumulée et bornée à ± 10 %. `pool` : les séances à reculs, la plus
  // récente d'abord (`{ series, cible }`). La prévision d'une séance : les reps que la table donne à la charge de son dernier recul, à
  // partir de son max du jour d'alors (même fonction), pour la marge de CE recul tel qu'il a été fait (`reserveDeSerie`, échec = 0 ;
  // sans note : la marge visée). Fait ≥ prévision + 2 : +2,5 % ; fait sous la cible : −2,5 % ; sinon 0.
  function correctionDeRecul(pool) {
    var P = Palier();
    var retenues = (pool || []).filter(reculDePlusDeReps).slice(0, RECUL_CORRECTION_SEANCES).reverse();
    var total = 0, pas = [];
    retenues.forEach(function (p) {
      var l = lectureDeReculs(p);
      var mg = P.reserveDeSerie(l.grosse.serie);
      var max = maxDuJour(l.grosse.charge, l.grosse.reps, mg === null ? 0 : mg);
      if (max === null) return;
      // 193-6 : la dernière série AU MAX remplace « le dernier recul tel que fait » ; sa marge, à défaut d'effort noté, est la réserve demandée.
      var d = l.reculs[l.reculs.length - 1];
      l.reculs.forEach(function (rr) { if (rr.auMax) d = rr; });
      var mr = P.reserveDeSerie(d.serie);
      if (mr === null && d.auMax) mr = Modele().reserveDemandee(d.serie);
      if (mr === null) mr = RECUL_MARGE_VISEE;
      var rt = repsDeLaTable(d.charge / max * 100);
      if (rt === null) return;
      var prevision = Math.max(1, Math.round(rt - mr));
      var delta = 0;
      if (d.reps >= prevision + RECUL_CORRECTION_ECART) delta = RECUL_CORRECTION_PAS;
      else if (l.cible !== null && d.reps < l.cible) delta = -RECUL_CORRECTION_PAS;
      total = Math.round(Math.min(RECUL_CORRECTION_MAX, Math.max(-RECUL_CORRECTION_MAX, total + delta)) * 1e6) / 1e6;
      pas.push({ charge: d.charge, faites: d.reps, prevision: prevision, cible: l.cible, delta: delta });
    });
    return { valeur: total, pas: pas };
  }
  // La charge d'un recul à plus de reps. `entree` : `{ grosse, grosseReps, marge, reps, correction, cran, salle }` — `marge` : celle de
  // la grosse série (notée, sinon la visée de la consigne, sinon 0). Rend `{ charge, max, pct, marge, correction, ecart, vise }`, ou
  // `null` quand la règle ne s'applique pas (reps du recul pas plus hautes, reps inconnues, au-delà de 12, rien de plus léger) : la
  // 193-1 reste alors, inchangée.
  function reculAuMax(entree) {
    var e = entree || {};
    var g = nombre(e.grosse), gr = nombre(e.grosseReps), rr = nombre(e.reps);
    if (g === null || g <= 0 || gr === null || gr < 1 || rr === null || !(rr > gr)) return null;
    var marge = nombre(e.marge);
    if (marge === null) marge = 0;
    var corr = nombre(e.correction);
    if (corr === null) corr = 0;
    var pG = pctDuMax(gr, marge), pR = pctDuMax(rr, RECUL_MARGE_VISEE);
    if (pG === null || pR === null) return null;
    var max = g / (pG / 100);
    var cible = auCentieme(max * (pR / 100) * (1 + corr));
    var charge = cranLePlusProche(voisineDuRecul(e.salle, g, e.cran), g, cible);
    if (charge === null || !(charge > 0) || charge >= g) return null;
    return { charge: charge, max: max, pct: pR, marge: marge, correction: corr, ecart: Math.round((1 - charge / g) * 1e6) / 1e6, vise: rr };
  }

  // Les PHRASES du recul (VOIX-DU-COACH : un fait, « tu », jamais un « bravo »). Chaque chiffre est cité (I26) : la charge, l'écart
  // en % et les reps ont chacun leur source dans le plan (`regle|recul`, `recul.ecart`, `recul.reps`).
  function pctDeRecul(ecart) { return Math.round(ecart * 1000) / 10; }
  function phraseRecul(charge, ecart) {
    return 'Recul' + DEUX_POINTS + enKg(charge, regle('recul')) + ', ' + nombreFr(pctDeRecul(ecart), regle('recul.ecart')) +
      INSECABLE + '% sous ta grosse série.';
  }
  // « puis 135 kg × 6 » : la suite de la consigne du jour, à côté de la grosse série.
  function puisRecul(charge, vise) {
    return 'puis ' + (nombre(vise) === null ? enKg(charge, regle('recul')) : chargeFois(charge, vise, regle('recul')));
  }
  function repsDeRecul(reps) {
    return reps.map(function (r) { return nombreFr(r, regle('recul.reps')); });
  }
  function listeDeRecul(reps) {
    var t = repsDeRecul(reps);
    return t.length < 2 ? t.join('') : t.slice(0, -1).join(', ') + ' et ' + t[t.length - 1];
  }
  // Le paragraphe du « Pourquoi ». `f` : `{ grosse, charge, ecart, depart, sens, reel, reps, cible }`.
  function pourquoiRecul(f) {
    var t = 'Tes séries de recul suivent ta grosse série' + DEUX_POINTS + nombreFr(pctDeRecul(f.ecart), regle('recul.ecart')) + INSECABLE +
      '% en dessous de ' + enKg(f.grosse, regle('recul.grosse')) + ', arrondi au cran le plus proche de ton matériel, ' +
      enKg(f.charge, regle('recul')) + '. Elles comptent dans ton volume et tes records, jamais comme un test.';
    if (f.sens && f.reps && f.reps.length) {
      t += ' La dernière fois, tes séries de recul ont fait ' + listeDeRecul(f.reps) + ' pour une cible de ' + nombreFr(f.cible, regle('recul.reps')) + '. ' +
        (f.sens === 'rapproche'
          ? 'Je les rapproche' + DEUX_POINTS + nombreFr(pctDeRecul(f.ecart), regle('recul.ecart')) + INSECABLE + '% sous ta grosse série au lieu de ' +
            nombreFr(pctDeRecul(f.reel), regle('recul.ecart')) + INSECABLE + '%.'
          : 'Je les éloigne' + DEUX_POINTS + nombreFr(pctDeRecul(f.ecart), regle('recul.ecart')) + INSECABLE + '% sous ta grosse série au lieu de ' +
            nombreFr(pctDeRecul(f.reel), regle('recul.ecart')) + INSECABLE + '%.');
    }
    return t;
  }
  // 193-5 — les phrases du recul calé sur le max du jour. Chaque chiffre est cité (I26) : `recul`, `recul.grosse`, `recul.max`,
  // `recul.pct`, `recul.marge`, `recul.reps`, `recul.correction`, `recul.derniere`.
  function phraseReculAuMax(charge, pct) {
    return 'Recul' + DEUX_POINTS + enKg(charge, regle('recul')) + ', ' + nombreFr(Math.round(pct), regle('recul.pct')) + INSECABLE +
      '% de ton max aujourd’hui.';
  }
  function gardantMarge(m) {
    return nombre(m) === 0 ? 'sans marge' : 'en gardant ' + nombreFr(m, regle('recul.marge')) + ' rep' + (m > 1 ? 's' : '');
  }
  // `f` : `{ grosse, grosseReps, marge, max, reps, pct, charge, correction, pas }` — `max` arrondi à l'entier, `pas` : les pas de la correction.
  function pourquoiReculAuMax(f) {
    var t = 'Ta grosse série, ' + enKg(f.grosse, regle('recul.grosse')) + ' × ' + nombreFr(f.grosseReps, regle('recul.reps')) + ' ' +
      gardantMarge(f.marge) + ', dit que ton max aujourd’hui est d’environ ' + enKg(f.max, regle('recul.max')) + '. Pour ' +
      nombreFr(f.reps, regle('recul.reps')) + ' reps en en gardant ' + nombreFr(RECUL_MARGE_VISEE, regle('recul.marge')) + ', c’est ' +
      nombreFr(Math.round(f.pct), regle('recul.pct')) + INSECABLE + '% : ' + enKg(f.charge, regle('recul')) + '.';
    var corr = nombre(f.correction);
    if (corr !== null && corr !== 0) {
      var pas = (f.pas || []).length ? f.pas[f.pas.length - 1] : null;
      var ampleur = nombreFr(Math.round(Math.abs(corr) * 1000) / 10, regle('recul.correction')) + INSECABLE + '% ' + (corr > 0 ? 'de plus' : 'de moins');
      if (pas && pas.delta > 0) {
        t += ' Ta dernière série à ' + enKg(pas.charge, regle('recul.derniere')) + ' a fait ' + nombreFr(pas.faites, regle('recul.reps')) +
          ' reps, ' + nombreFr(pas.faites - pas.prevision, regle('recul.reps')) + ' de plus que la table ne le prévoyait pour toi' +
          DEUX_POINTS + 'je te compte ' + ampleur + '.';
      } else if (pas && pas.delta < 0) {
        t += ' Ta dernière série à ' + enKg(pas.charge, regle('recul.derniere')) + ' a fait ' + nombreFr(pas.faites, regle('recul.reps')) +
          ' reps pour une cible de ' + nombreFr(pas.cible, regle('recul.reps')) + DEUX_POINTS + 'je te compte ' + ampleur + '.';
      } else {
        t += ' Tes dernières séances à reculs me font te compter ' + ampleur + '.';
      }
    }
    return t;
  }
  // 193-3 (MOTEUR §9.29) — LA LIGNE « TA ROUTINE FIXE… » du « Pourquoi » : la zone vient de la routine, et le coach ne lit que
  // les séances de cette zone. Aucun chiffre (la garde I26 en exige l'origine) : les bornes sont celles de l'étiquette : un fait,
  // jamais un « bravo ». `plan` : `{ zone, mode, n, perimee }` (le fondement de la consigne, `consigneDExercice`).
  function pourquoiPlan(plan) {
    var z = plan ? zoneParCle(plan.zone) : null;
    if (z === null) return null;
    if (plan.suspendue === true) {
      return (plan.origine === 'aujourdhui' ? 'Tu as choisi ' + z.libelle + ' pour aujourd\u2019hui\u00a0; ' : 'Ta routine fixe cet exercice en ' + z.libelle + '\u00a0; ') +
        'il charge une zone que tu m\u2019as demandé de ménager, alors je la mets en pause\u00a0: pas de série lourde. Rien n\u2019est changé dans ta routine.';
    }
    var tete = plan.origine === 'aujourdhui'
      ? 'Tu as choisi ' + z.libelle + ' pour aujourd\u2019hui seulement\u00a0; ta routine ne change pas.'
      : 'Ta routine fixe cet exercice en ' + z.libelle + '.';
    if (plan.mode === 'zone') {
      return tete + ' Je ne lis que tes séances en ' + z.libelle + ' : ton palier d\u2019ici est le sien, tes autres jours avancent de leur côté.';
    }
    if (plan.perimee === true) {
      return tete + ' Ta dernière séance en ' + z.libelle + ' est ancienne et tu as travaillé cet exercice depuis : je pars de ta séance la plus récente, ' +
        'avec le report de zone que tu connais, une seule fois. Ensuite, ton historique ' + z.libelle + '.';
    }
    return tete + ' Pas encore de séance en ' + z.libelle + ' : je pars de ta dernière séance, avec le report de zone que tu connais, une seule fois. ' +
      'Ensuite, ton historique ' + z.libelle + '.';
  }
  // Le constat : un fait. `cible` peut manquer (pas de routine, pas de dernière fois).
  function phraseConstatReculs(reps, cible) {
    var c = nombre(cible);
    var tiennent = c !== null && reps.every(function (r) { return r >= c; });
    if (tiennent) return 'Tes reculs tiennent ' + repsDeRecul(reps).join('-') + '.';
    return 'Tes reculs' + DEUX_POINTS + listeDeRecul(reps) + (c !== null ? ' pour une cible de ' + nombreFr(c, regle('recul.reps')) : '') + '.';
  }

  // ── 194-1 — LA MOBILITÉ EN FIN DE SÉANCE (MOTEUR §9.31) ───────────────────────────────────────────────────────────────
  // UNE table, ici : zone raide -> étirements tenus (fin de séance), mobilité en mouvement (avant), muscles que la séance
  // doit avoir travaillés pour que la zone passe en premier, exercices du jour qu'elle sert, zone à ménager qui lui répond.
  // Les clés sont celles du CHECK de `profiles.zones_raides` (v2_124). Aucun étirement tenu AVANT la charge (invariant I94).
  var ZONES_RAIDES = Object.freeze(['chevilles', 'hanches', 'ischios', 'quadriceps', 'epaules', 'haut_du_dos']);
  var MOBILITE_CIBLE_MIN = 10;          // les minutes de la semaine où le gain plafonne (Ingram 2024)
  var MOBILITE_ZONE_MIN = 3;            // un bloc donne ~3-4 minutes à une zone
  var MOBILITE_ZONES_MAX = 2;           // deux zones au plus par séance
  var MOBILITE_TENUE_S = 45;            // tenues de 30 à 60 s
  var MOBILITE_TENUE_MIN_S = 30, MOBILITE_TENUE_MAX_S = 60;
  var MOBILITE_SERIES_MAX = 3;
  var MOBILITE_AVANT_MIN = 2;           // la préparation d'avant : 2 minutes, en mouvement
  var MOBILITE_AVANT_S = 30;
  var MOBILITE_CONSIGNE = 'Sans douleur : une tension nette, pas plus.';
  var MOBILITE_REFUS_CLE = '__mobilite';   // la clé de la mémoire des « Non merci » (celle des chauffes, `Plan.refuserChauffes`)
  var MOBILITE_ZONES = {
    chevilles: { libelle: 'Chevilles', accord: 'Ta cheville', menagee: null, muscles: ['mollets'],
      tenus: ['etirement_mollet_mur', 'etirement_soleaire'], enMouvement: ['flexion_cheville_genou_mur', 'mobilite_cheville_elastique'],
      sert: [{ re: /^squat/, nom: 'squat' }] },
    hanches: { libelle: 'Hanches', accord: 'Ta hanche', menagee: 'hanche', muscles: ['fessiers', 'adducteurs', 'abducteurs'],
      tenus: ['pigeon', 'hanches_90_90', 'etirement_fessier_4', 'etirement_flechisseurs_hanche', 'papillon'],
      enMouvement: ['rotations_controlees_hanche', 'cercles_hanches', 'accroupi_profond'], sert: [{ re: /^squat/, nom: 'squat' }, { re: /^souleve_de_terre/, nom: 'soulevé' }] },
    ischios: { libelle: 'Ischios', accord: 'Tes ischios', menagee: null, muscles: ['ischio_jambiers'],
      tenus: ['etirement_ischios', 'etirement_ischios_allonge_elastique'], enMouvement: ['balances_jambe'], sert: [] },
    quadriceps: { libelle: 'Quadriceps', accord: 'Tes quadriceps', menagee: 'genou', muscles: ['quadriceps'],
      tenus: ['etirement_quadriceps_debout', 'etirement_quadriceps_mur'], enMouvement: ['fente_rotation_worlds_greatest'], sert: [] },
    epaules: { libelle: 'Épaules', accord: 'Tes épaules', menagee: 'epaule', muscles: ['deltoide_anterieur', 'deltoide_lateral', 'deltoide_posterieur', 'pectoraux'],
      tenus: ['etirement_epaule_bras_croise', 'etirement_dormeur', 'etirement_pectoraux_porte', 'etirement_triceps'],
      enMouvement: ['rotations_controlees_epaule', 'passage_epaules_baton', 'passage_epaules_elastique'], sert: [{ re: /^developpe_militaire/, nom: 'militaire' }, { re: /^traction/, nom: 'tractions' }] },
    haut_du_dos: { libelle: 'Haut du dos', accord: 'Ton haut du dos', menagee: 'dos', muscles: ['haut_du_dos', 'trapezes', 'grand_dorsal'],
      tenus: ['etirement_grand_dorsal', 'etirement_grand_dorsal_banc', 'sphinx'],
      enMouvement: ['rotation_thoracique_livre_ouvert', 'rotation_thoracique_quatre_pattes', 'chat_vache'], sert: [{ re: /^squat/, nom: 'squat' }, { re: /^developpe_militaire/, nom: 'militaire' }] }
  };
  // Les articulations qu'un exercice charge (les clés des zones à ménager) : le choix passe au suivant de la liste de la zone.
  var MOBILITE_CHARGE = {
    pigeon: ['genou', 'hanche'], etirement_ischios: ['dos'], papillon: ['genou'], etirement_flechisseurs_hanche: ['genou'], etirement_quadriceps_mur: ['genou'],
    etirement_quadriceps_debout: ['genou'], accroupi_profond: ['genou'], fente_rotation_worlds_greatest: ['genou'],
    etirement_dormeur: ['epaule'], etirement_pectoraux_porte: ['epaule'], etirement_epaule_bras_croise: ['epaule'],
    etirement_triceps: ['epaule', 'coude'], passage_epaules_baton: ['epaule'], passage_epaules_elastique: ['epaule'],
    rotations_controlees_epaule: ['epaule'], sphinx: ['dos']
  };
  var MOBILITE_UNILATERAL = ['pigeon', 'etirement_flechisseurs_hanche', 'etirement_quadriceps_debout', 'etirement_quadriceps_mur',
    'etirement_mollet_mur', 'etirement_soleaire', 'etirement_ischios', 'etirement_fessier_4', 'etirement_dormeur',
    'etirement_epaule_bras_croise', 'etirement_triceps', 'etirement_pectoraux_porte', 'flexion_cheville_genou_mur'];

  function zonesRaidesConnues(l) {
    if (!Array.isArray(l)) return null;
    return ZONES_RAIDES.filter(function (z) { return l.indexOf(z) >= 0; });
  }
  function exerciceDeMobilite(slug) {
    return ZONES_RAIDES.some(function (z) {
      var t = MOBILITE_ZONES[z];
      return t.tenus.indexOf(slug) >= 0 || t.enMouvement.indexOf(slug) >= 0;
    });
  }
  // La zone d'un exercice de mobilité (la première qui le porte), ou `null`.
  function zoneDeMobilite(slug) {
    for (var i = 0; i < ZONES_RAIDES.length; i++) {
      var t = MOBILITE_ZONES[ZONES_RAIDES[i]];
      if (t.tenus.indexOf(slug) >= 0 || t.enMouvement.indexOf(slug) >= 0) return ZONES_RAIDES[i];
    }
    return null;
  }
  function dureeDeMobilite(slug) {
    var z = zoneDeMobilite(slug);
    if (!z) return null;
    return MOBILITE_ZONES[z].tenus.indexOf(slug) >= 0 ? MOBILITE_TENUE_S : MOBILITE_AVANT_S;
  }
  function coteDeMobilite(slug) { return MOBILITE_UNILATERAL.indexOf(slug) >= 0 ? 2 : 1; }
  function minutesUneSerie(slug) { return dureeDeMobilite(slug) * (MOBILITE_UNILATERAL.indexOf(slug) >= 0 ? 2 : 1) / 60; }
  function arrondiMin(x) { return Math.round(x * 10) / 10; }

  // Le choix d'un exercice pour une zone : le premier de la liste qui ne charge aucune articulation à ménager.
  function exercicesDeLaZone(zone, liste, evite, deja) {
    var t = MOBILITE_ZONES[zone];
    return (liste === 'enMouvement' ? t.enMouvement : t.tenus).filter(function (s) {
      return (deja || []).indexOf(s) < 0 && !(MOBILITE_CHARGE[s] || []).some(function (a) { return (evite || []).indexOf(a) >= 0; });
    });
  }
  // 200-1 — le nom français de chaque exercice de mobilité : le repli quand le catalogue local ne le porte pas (jamais un identifiant à l'écran).
  var MOBILITE_NOMS = {
    etirement_mollet_mur: 'Étirement du mollet au mur', etirement_soleaire: 'Étirement du soléaire', flexion_cheville_genou_mur: 'Flexion de cheville, genou au mur',
    mobilite_cheville_elastique: 'Mobilité de cheville à l\u2019élastique', pigeon: 'Pigeon', hanches_90_90: 'Hanches 90/90', etirement_fessier_4: 'Étirement du fessier en 4',
    etirement_flechisseurs_hanche: 'Étirement des fléchisseurs de hanche', papillon: 'Papillon', rotations_controlees_hanche: 'Rotations contrôlées de hanche',
    cercles_hanches: 'Cercles de hanches', accroupi_profond: 'Accroupi profond', etirement_ischios: 'Étirement des ischios',
    etirement_ischios_allonge_elastique: 'Étirement des ischios allongé, élastique', balances_jambe: 'Balancés de jambe',
    etirement_quadriceps_debout: 'Étirement du quadriceps debout', etirement_quadriceps_mur: 'Étirement du quadriceps au mur',
    fente_rotation_worlds_greatest: 'Fente avec rotation', etirement_epaule_bras_croise: 'Étirement de l\u2019épaule, bras croisé', etirement_dormeur: 'Étirement du dormeur',
    etirement_pectoraux_porte: 'Étirement des pectoraux à la porte', etirement_triceps: 'Étirement du triceps', rotations_controlees_epaule: 'Rotations contrôlées d\u2019épaule',
    passage_epaules_baton: 'Passage d\u2019épaules au bâton', passage_epaules_elastique: 'Passage d\u2019épaules à l\u2019élastique',
    etirement_grand_dorsal: 'Étirement du grand dorsal', etirement_grand_dorsal_banc: 'Étirement du grand dorsal au banc', sphinx: 'Sphinx',
    rotation_thoracique_livre_ouvert: 'Rotation thoracique, livre ouvert', rotation_thoracique_quatre_pattes: 'Rotation thoracique à quatre pattes', chat_vache: 'Chat-vache'
  };
  function ligneDeMobilite(slug, series) {
    return { slug: slug, nom: MOBILITE_NOMS[slug] || null, series: series, duree_s: dureeDeMobilite(slug), cote: MOBILITE_UNILATERAL.indexOf(slug) >= 0,
             minutes: arrondiMin(series * minutesUneSerie(slug)) };
  }

  // Le bloc de mobilité d'une séance (§9.31). Pur ; appelé par `planDeSeance` seulement.
  //   entree : { zones (profiles.zones_raides : `null` = pas répondu, `[]` = aucune), faites ({ zone: minutes de la semaine }),
  //              muscles (les primaires de la séance), slugs (ceux de la séance), menager (zones à ménager du profil),
  //              douleurs (zones à ménager touchées par un « J'ai mal » récent), debutee (une série est déjà faite) }
  //   sortie : { fin: { zones, minutes, consigne, kine } | null, avant: { zones, minutes, consigne } | null }
  function blocDeMobilite(entree) {
    var e = entree || {};
    var zones = zonesRaidesConnues(e.zones);
    var vide = { fin: null, avant: null };
    if (!zones || !zones.length) return vide;
    var menager = (e.menager || []).concat(e.douleurs || []);
    var faites = e.faites || {};
    var muscles = e.muscles || [], slugs = e.slugs || [];
    var kine = [], retenues = [];
    zones.forEach(function (z) {
      var t = MOBILITE_ZONES[z];
      if (t.menagee && menager.indexOf(t.menagee) >= 0) { kine.push(t.accord + (/^Tes /.test(t.accord) ? ' sont' : ' est') + ' à ménager : pour l’étirer, demande l’avis d’un kiné.'); return; }
      var fait = Number(faites[z]) > 0 ? Number(faites[z]) : 0;
      if (fait >= MOBILITE_CIBLE_MIN) return;
      var servie = t.muscles.some(function (m) { return muscles.indexOf(m) >= 0; });
      retenues.push({ zone: z, fait: fait, servie: servie, rang: ZONES_RAIDES.indexOf(z) });
    });
    // celles que la séance a travaillées d'abord, puis celles qui ont reçu le moins cette semaine
    retenues.sort(function (a, b) { return (a.servie === b.servie ? 0 : a.servie ? -1 : 1) || a.fait - b.fait || a.rang - b.rang; });
    var fin = [];
    retenues.slice(0, MOBILITE_ZONES_MAX).forEach(function (r) {
      var reste = MOBILITE_CIBLE_MIN - r.fait;
      var cible = Math.min(MOBILITE_ZONE_MIN, reste);
      var lignes = [], total = 0, pris = [];
      var choix = exercicesDeLaZone(r.zone, 'tenus', menager, pris);
      for (var k = 0; k < choix.length && total < cible - 0.05 && lignes.length < 2; k++) {
        var un = minutesUneSerie(choix[k]);
        var n = Math.max(1, Math.min(MOBILITE_SERIES_MAX, Math.ceil((cible - total) / un - 1e-9)));
        if (lignes.length === 0 && n < 2 && 2 * un <= cible + 0.05) n = 2;
        var l = ligneDeMobilite(choix[k], n);
        lignes.push(l); total += l.minutes;
      }
      if (!lignes.length) return;
      fin.push({ zone: r.zone, libelle: MOBILITE_ZONES[r.zone].libelle, exercices: lignes, minutes: arrondiMin(total),
                 fait: r.fait, apres: arrondiMin(r.fait + total), cible: MOBILITE_CIBLE_MIN });
    });
    var sortie = { fin: null, avant: null };
    if (fin.length || kine.length) {
      sortie.fin = { zones: fin, minutes: arrondiMin(fin.reduce(function (a, z) { return a + z.minutes; }, 0)), consigne: MOBILITE_CONSIGNE, kine: kine };
    }
    // Avant la séance : du mouvement seulement, pour une zone raide qui sert un exercice du jour (jamais une zone à ménager).
    if (!e.debutee) {
      for (var i = 0; i < zones.length && !sortie.avant; i++) {
        var t2 = MOBILITE_ZONES[zones[i]];
        if (t2.menagee && menager.indexOf(t2.menagee) >= 0) continue;
        var sert = null;
        slugs.forEach(function (s) { t2.sert.forEach(function (x) { if (!sert && x.re.test(s)) sert = x.nom; }); });
        if (!sert) continue;
        var ch = exercicesDeLaZone(zones[i], 'enMouvement', menager, [])[0];
        if (!ch) continue;
        var nSeries = Math.max(1, Math.round(MOBILITE_AVANT_MIN * 60 / (MOBILITE_AVANT_S * (MOBILITE_UNILATERAL.indexOf(ch) >= 0 ? 2 : 1))));
        var ligne = ligneDeMobilite(ch, Math.min(nSeries, 2));
        sortie.avant = { zone: zones[i], libelle: t2.libelle, accord: t2.accord, sert: sert, exercices: [ligne], minutes: ligne.minutes, consigne: MOBILITE_CONSIGNE };
      }
    }
    return sortie;
  }

  // Les phrases du bloc (la voix : « amplitude », « souplesse » ; jamais « récupération », « courbatures », « prévention »).
  function mobiliteTitre(minutes) { return 'Mobilité · ' + String(Math.round(minutes)) + ' min'; }
  function mobiliteSousTitre(zones) { return zones.map(function (z) { return z.libelle; }).join(' et ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }) + ' · facultatif'; }
  function mobilitePourquoi(z) {
    return z.libelle + ' : ' + String(Math.round(z.minutes)) + ' min aujourd’hui, ' + String(Math.round(z.apres)) +
      ' cette semaine sur ' + MOBILITE_CIBLE_MIN + '. Tenir longtemps ou très fort n’apporte rien de plus ; le total de la semaine compte.';
  }
  var MOBILITE_POURQUOI_AVANT = 'Tenu longtemps juste avant de soulever, un étirement baisse ta force. Avant la séance, seulement du mouvement.';

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // 193-4 (MOTEUR §9.32) — LA SEMAINE DE TEST. Une seule fois, ici : la montée, les essais, la série au max, le max mesuré, l'arrêt,
  // le jour de chaque barre, le calendrier de la proposition. Pures, sans séance ni horloge : le plan les LIT (`plan.js`), l'app ne
  // calcule rien. Deux façons, au choix barre par barre :
  //   · « Viser mon max (1 rep) » : la montée, puis trois essais — 1ᵉʳ ≈ 92 % du max estimé (« en gardant 2 »), 2ᵉ ≈ 97 %, 3ᵉ réglé sur le
  //     2ᵉ (facile : ≈ 101 % ; sans marge : un cran de plus ; raté ou technique qui lâche : on s'arrête). Jamais de 4ᵉ.
  //   · « Série au max » : la montée, puis une série à ≈ 85 % (visée 5) autant que possible — arrêt technique ou 10 reps ; au soulevé
  //     « en gardant 1 », 6 reps au plus ; au débutant ≈ 80 % (visée 6 à 8). Le max se lit sur les reps (table 193-5).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  var MODULE_TEST = 'test';          // `predictions.module` : un pari par barre, « ton max tombera vers X kg »
  var GRANDEUR_TEST = 'charge_kg';
  var TEST_MODE_MAX = 'max';
  var TEST_MODE_SERIE = 'serie';
  var TEST_MONTEE = Object.freeze([[50, 5], [60, 3], [70, 2], [80, 1], [87, 1]]);   // [% du max estimé, reps]
  var TEST_ESSAI_1 = 92, TEST_ESSAI_2 = 97, TEST_ESSAI_3_FACILE = 101;              // % du max estimé
  var TEST_ESSAIS_MAX = 3;
  var TEST_SERIE_PCT = 85, TEST_SERIE_PCT_DEBUTANT = 80;
  var TEST_SERIE_VISEE = 5, TEST_SERIE_VISEE_DEBUTANT = Object.freeze([6, 8]);
  var TEST_SERIE_PLAFOND = 10, TEST_SERIE_PLAFOND_SOULEVE = 6;
  var TEST_REPOS_ESSAI_S = Object.freeze([240, 300, 300]);                          // 4 à 5 min
  var TEST_SEMAINES_MIN = 4;                                                         // d'entraînement, avant « Faire une semaine de test »
  var TEST_ACCESSOIRES_MAX = 2;
  var TEST_ECART_MAX_PCT = 5;
  var TEST_VALIDITE_JOURS = 90;                                                      // un max mesuré prime sur l'estimation, 90 jours
  var TEST_PHASES_AVANT = 2;                                                         // la proposition, à la fin de la 2ᵉ phase
  var TEST_SANS_DECHARGE_JOURS = 14;                                                 // hors programme : pas de proposition juste avant une décharge

  function testClasse(famille) { return classeAuMax(famille); }                      // squat · couche · souleve · militaire · accessoire
  function testArrondi(cible, o) {
    var c = nombre(cible);
    if (c === null || c <= 0) return null;
    var salle = o && o.salle ? salleEnVigueur(o.salle, c) : null;
    if (salle) {
      var l = chargesDeLaSalle(salle), meilleur = null;
      l.forEach(function (v) { if (meilleur === null || Math.abs(v - c) < Math.abs(meilleur - c) - 1e-9) meilleur = v; });
      if (meilleur !== null) return meilleur;
    }
    var cran = nombre(o && o.cran);
    if (cran === null || cran <= 0) cran = CRAN_PAR_DEFAUT;
    return auCentieme(Math.round(c / cran) * cran);
  }
  // Un cran au-dessus de `charge` (la salle, sinon le cran du matériel). `null` quand la salle n'a rien de plus lourd.
  function testCranAuDessus(charge, o) {
    var c = nombre(charge);
    if (c === null) return null;
    var salle = o && o.salle ? salleEnVigueur(o.salle, c) : null;
    if (salle) return voisineDeLaSalle(salle, c, 1);
    var cran = nombre(o && o.cran);
    if (cran === null || cran <= 0) cran = CRAN_PAR_DEFAUT;
    return auCentieme(c + cran);
  }
  // 202 (MOTEUR §9.32) — LE DÉFAUT PRUDENT : « Série au max » quand le ressenti d'un essai est le moins fiable ou que le max est mal connu —
  // un débutant (moins d'un an), 65 ans ou plus (`plus65`, le fait existant, pas un seuil de plus), ou un max estimé tiré d'une série de
  // plus de 5 reps (au-delà, le calcul est moins fiable : Reynolds 2006). Sinon « Viser mon max ». `f` : `{ debutant, plus65, repsDuMax }` ;
  // un fait inconnu (`null`, un max sans reps connues) ne compte pas. La façon choisie prime toujours (`testModeValide`).
  var TEST_REPS_FIABLES_MAX = 5;
  function testRaisonDuDefaut(f) {
    var o = f && typeof f === 'object' ? f : {};
    if (o.debutant === true) return 'debutant';
    if (o.plus65 === true) return 'plus65';
    var r = nombre(o.repsDuMax);
    if (r !== null && r > TEST_REPS_FIABLES_MAX) return 'reps';
    return null;
  }
  function testModeParDefaut(f) {
    return testRaisonDuDefaut(f) === null ? TEST_MODE_MAX : TEST_MODE_SERIE;
  }
  // La raison du défaut, dite par le coach (la feuille « Semaine de test » du Profil), avec sa source. `null` : le défaut « Viser mon max »
  // n'a rien à justifier. `f` : les faits de `testModeParDefaut`, plus `max` et `chargeDuMax` (la série d'où vient le max) pour la phrase.
  function testPhraseDuDefaut(f) {
    var raison = testRaisonDuDefaut(f);
    if (raison === null) return null;
    var o = f || {}, c = regle('test.defaut'), texte, cle;
    if (raison === 'debutant') {
      cle = null;
      texte = 'Moins d’un an de pratique : le coach propose une série au max plutôt qu’une tentative. Tu peux viser ton max si tu le connais.';
    } else if (raison === 'plus65') {
      cle = 'test.defaut.age';
      texte = 'À partir de ' + nombreFr(AGE_PLAFOND_BAS, c) + ' ans, le coach propose une série au max. Tu peux viser ton max si tu le connais.';
    } else {
      cle = 'test.defaut.reps';
      var k = nombre(o.chargeDuMax), m = nombre(o.max), r = nombre(o.repsDuMax);
      texte = (m !== null && k !== null
        ? 'Ton max estimé, ' + enKg(m, c) + ', vient de ' + chargeFois(k, r, c) + '. '
        : 'Ton max estimé vient d’une série de ' + nombreFr(r, c) + ' reps. ') +
        'Au-delà de ' + nombreFr(TEST_REPS_FIABLES_MAX, c) + ' reps, ce calcul est moins fiable : le coach propose une série au max plutôt qu’une tentative.';
    }
    return { raison: raison, texte: texte, sources: cle ? sourcesDeRegles([cle]) : [] };
  }
  function testModeValide(m) { return m === TEST_MODE_MAX || m === TEST_MODE_SERIE ? m : null; }

  // LA MONTÉE : 50 % × 5, 60 % × 3, 70 % × 2, 80 % × 1, 87 % × 1 du max estimé, au cran de la salle. `[{ rang, pct, charge, reps }]`.
  function testMontee(max, o) {
    var m = nombre(max);
    if (m === null || m <= 0) return [];
    var sortie = [];
    TEST_MONTEE.forEach(function (p, i) {
      var c = testArrondi(m * p[0] / 100, o);
      if (c !== null) sortie.push({ rang: i + 1, pct: p[0], charge: c, reps: p[1] });
    });
    return sortie;
  }

  // L'ESSAI SUIVANT. `essais` : les essais déjà faits, dans l'ordre — `{ charge, reps, reserve, douleur }` (`reserve` : notée, sinon `null`).
  // Rend `{ etat: 'propose' | 'arret' | 'fini', rang, charge, reps: 1, pct, reserve, repos, surLesSecurites, raison }`.
  //   · raison d'arrêt : 'mal' (« J'ai mal »), 'rate' (0 rep), 'sans_marge' (le 1ᵉʳ essai, prévu en gardant 2, n'a rien laissé), 'technique'
  //     (l'utilisateur arrête : le dos s'arrondit, la technique lâche), 'jamais_quatre'.
  function testEssai(max, essais, o) {
    var m = nombre(max), o2 = o || {};
    var classe = testClasse(o2.famille);
    var surLesSecurites = classe === 'squat' || classe === 'couche';
    var fait = (essais || []).filter(Boolean);
    var arret = function (raison) { return { etat: 'arret', rang: fait.length + 1, charge: null, reps: null, pct: null, reserve: null, repos: null, surLesSecurites: surLesSecurites, raison: raison }; };
    if (m === null || m <= 0) return arret('sans_max');
    if (o2.arret === true) return arret('technique');
    if (fait.some(function (e) { return e.douleur === true; })) return arret('mal');
    if (fait.length >= TEST_ESSAIS_MAX) return { etat: 'fini', rang: fait.length, charge: null, reps: null, pct: null, reserve: null, repos: null, surLesSecurites: surLesSecurites, raison: null };
    var dernier = fait.length ? fait[fait.length - 1] : null;
    if (dernier && !(nombre(dernier.reps) >= 1)) return arret('rate');
    var rang = fait.length + 1, pct, reserve = 0, charge;
    if (rang === 1) { pct = TEST_ESSAI_1; reserve = 2; charge = testArrondi(m * pct / 100, o2); }
    else if (rang === 2) {
      // le 1ᵉʳ essai prévu en gardant 2 qui n'a rien laissé : le max estimé était haut, on ne monte pas
      if (nombre(fait[0].reserve) === 0) return arret('sans_marge');
      pct = TEST_ESSAI_2; charge = testArrondi(m * pct / 100, o2);
    } else {
      var r2 = nombre(dernier.reserve);
      if (r2 !== null && r2 >= 1) { pct = TEST_ESSAI_3_FACILE; charge = testArrondi(m * pct / 100, o2); }
      else charge = testCranAuDessus(dernier.charge, o2);
      if (charge !== null && nombre(dernier.charge) !== null && !(charge > nombre(dernier.charge) + 1e-9)) charge = testCranAuDessus(dernier.charge, o2);
      if (charge === null) return arret('sans_cran');
      pct = Math.round(charge / m * 1000) / 10;
    }
    if (charge === null) return arret('sans_cran');
    return { etat: 'propose', rang: rang, charge: charge, reps: 1, pct: pct, reserve: reserve, repos: TEST_REPOS_ESSAI_S[rang - 1],
             surLesSecurites: surLesSecurites, raison: null };
  }

  // LA SÉRIE AU MAX. `o` : { famille, debutant, salle, cran }. `{ charge, pct, vise, visee: [bas, haut], reserve, plafond, surLesSecurites }`.
  function testSerieAuMax(max, o) {
    var m = nombre(max), o2 = o || {};
    if (m === null || m <= 0) return null;
    var classe = testClasse(o2.famille);
    var debutant = o2.debutant === true;
    var pct = debutant ? TEST_SERIE_PCT_DEBUTANT : TEST_SERIE_PCT;
    var charge = testArrondi(m * pct / 100, o2);
    if (charge === null) return null;
    var souleve = classe === 'souleve';
    return { charge: charge, pct: pct, vise: debutant ? TEST_SERIE_VISEE_DEBUTANT[0] : TEST_SERIE_VISEE,
             visee: debutant ? TEST_SERIE_VISEE_DEBUTANT.slice() : [TEST_SERIE_VISEE, TEST_SERIE_VISEE],
             reserve: souleve ? 1 : 0, plafond: souleve ? TEST_SERIE_PLAFOND_SOULEVE : TEST_SERIE_PLAFOND,
             surLesSecurites: classe === 'squat' || classe === 'couche' };
  }

  // LE MAX MESURÉ. `entree` : { mode, essais: [{ charge, reps, reserve }], serie: { charge, reps, reserve } | null }.
  // Max : un essai réussi à RPE 10 (réserve 0 ou non notée) EST le max ; sinon l'essai lu à sa réserve (table 193-5). Série au max : ses
  // reps, lues à la réserve notée (0 sinon). `null` : rien de mesuré. Jamais plus haut que la charge d'un essai raté.
  function testMesure(entree) {
    var e = entree || {}, meilleur = null;
    var lire = function (x, source, rang) {
      var c = nombre(x && x.charge), r = nombre(x && x.reps);
      if (c === null || c <= 0 || r === null || r < 1) return;
      var res = nombre(x.reserve);
      var v = maxDuJour(c, r, res === null ? 0 : res);
      if (v === null) return;
      if (meilleur === null || v > meilleur.valeur + 1e-9) {
        meilleur = { valeur: auCentieme(v), charge: c, reps: r, reserve: res === null ? 0 : res, source: source, rang: rang,
                     vrai: source === 'essai' && r === 1 && (res === null || res === 0) };
      }
    };
    if (e.mode === TEST_MODE_SERIE) { if (e.serie) lire(e.serie, 'serie', null); }
    else (e.essais || []).forEach(function (x, i) { lire(x, 'essai', i + 1); });
    // un essai réussi à RPE 10 EST le max : il l'emporte sur toute lecture d'un essai plus léger (« lu à sa réserve »)
    if (e.mode !== TEST_MODE_SERIE) {
      var vrai = null;
      (e.essais || []).forEach(function (x, i) {
        var c = nombre(x && x.charge), r = nombre(x && x.reps), res = nombre(x && x.reserve);
        if (c === null || c <= 0 || r === null || r < 1 || !(res === null || res === 0)) return;
        if (vrai === null || c > vrai.charge) vrai = { valeur: auCentieme(maxDuJour(c, r, 0)), charge: c, reps: r, reserve: 0, source: 'essai', rang: i + 1, vrai: r === 1 };
      });
      if (vrai !== null) meilleur = vrai;
    }
    if (meilleur === null) return null;
    meilleur.valeur = Math.round(meilleur.valeur * 10) / 10;
    return meilleur;
  }

  // QUELLE BARRE SE TESTE AUJOURD'HUI. `barres` : les barres de la séance, dans l'ordre — `{ slug, classe }`. Un seul mouvement par jour ;
  // la barre déjà mesurée (`faites`) ou refusée aujourd'hui (`refusees`) est écartée ; le squat et le soulevé ne se partagent jamais un
  // jour (le premier gagne, l'autre reste en séance normale). `null` : rien à tester aujourd'hui.
  function testBarreDuJour(barres, faites, refusees) {
    var f = faites || {}, r = refusees || {};
    var liste = (barres || []).filter(function (b) { return b && b.slug && !f[b.slug] && !r[b.slug]; });
    return liste.length ? liste[0].slug : null;
  }
  // Squat et soulevé dans la même séance : le second reste normal. Rend la liste des slugs qui restent en séance normale à côté du testé.
  function testBarresEnConflit(barres, testee) {
    var t = (barres || []).filter(function (b) { return b && b.slug === testee; })[0];
    if (!t) return [];
    var jambes = function (c) { return c === 'squat' || c === 'souleve'; };
    return jambes(t.classe) ? (barres || []).filter(function (b) { return b && b.slug !== testee && jambes(b.classe); }).map(function (b) { return b.slug; }) : [];
  }

  // LA PROPOSITION. `e` : { programme: bool, phasesFaites, allegeeTerminee (la semaine allégée qui suit la 2ᵉ phase est finie), maillonManquant,
  // semainesEntrainement, semainePrecedenteAllegee, dechargeDansJours, deja (une semaine de test est posée ou refusée cette semaine) }.
  // `{ propose, voie: 'programme' | 'bibliotheque' | 'alleger' | null, raison }`.
  //   · programme : 2 phases faites et la semaine allégée qui les suit terminée : allégée → test → phase suivante (le test SUIT l'allégée) ;
  //     un maillon manquant dans la chaîne des phases : rien ;
  //   · hors programme : 4 semaines d'entraînement au moins ; la semaine précédente allégée, sinon on propose d'alléger d'abord ; pas dans
  //     les 14 jours qui précèdent une décharge planifiée.
  function testProposable(e) {
    var x = e || {};
    var non = function (raison) { return { propose: false, voie: null, raison: raison }; };
    if (x.deja === true) return non('deja');
    if (x.programme === true) {
      if (x.maillonManquant === true) return non('maillon');
      if (nombre(x.phasesFaites) !== TEST_PHASES_AVANT) return non('phases');
      if (x.allegeeTerminee !== true) return non('allegee_a_venir');
      return { propose: true, voie: 'programme', raison: null };
    }
    if (!(nombre(x.semainesEntrainement) >= TEST_SEMAINES_MIN)) return non('semaines');
    var d = nombre(x.dechargeDansJours);
    if (d !== null && d >= 0 && d < TEST_SANS_DECHARGE_JOURS) return non('decharge');
    if (x.semainePrecedenteAllegee !== true) return { propose: true, voie: 'alleger', raison: 'sans_allegee' };
    return { propose: true, voie: 'bibliotheque', raison: null };
  }

  // Les PHRASES. Chaque chiffre est cité (I26) : `test` (charges), `test.pct`, `test.max`, `test.reps`, `test.reserve`.
  function testGardant(n) { return 'en gardant ' + nombreFr(n, regle('test.reserve')) + ' rep' + (n > 1 ? 's' : ''); }
  function testConsigneEssai(a) {
    if (!a || a.etat !== 'propose') return null;
    var t = 'Essai ' + nombreFr(a.rang, regle('test.rang')) + DEUX_POINTS + enKg(a.charge, regle('test')) + ' × ' + nombreFr(a.reps, regle('test.reps'));
    if (a.rang === 1) t += ', ' + testGardant(a.reserve);
    return t + (a.surLesSecurites ? ', sur les sécurités ou avec un pareur' : '') + '.';
  }
  function testConsigneSerie(s) {
    if (!s) return null;
    var visee = s.visee[0] === s.visee[1] ? nombreFr(s.visee[0], regle('test.visee_bas'))
      : nombreFr(s.visee[0], regle('test.visee_bas')) + ' à ' + nombreFr(s.visee[1], regle('test.visee_haut'));
    var t = 'Série au max' + DEUX_POINTS + enKg(s.charge, regle('test')) + ', visée ' + visee + ' reps, ' +
      (s.reserve > 0 ? testGardant(s.reserve) + ', ' : 'autant que tu peux, ') + nombreFr(s.plafond, regle('test.plafond')) + ' reps au plus.';
    return t + ' Tu t’arrêtes quand la technique lâche.';
  }
  // Le « Pourquoi ». `f` : { mode, max, pariCharge, serie }. Aucun chiffre écrit à la main (I26) : les rangs se disent en mots.
  function pourquoiTest(f) {
    var t = 'Ton max estimé est d’environ ' + enKg(f.max, regle('test.max')) + '. ';
    if (f.mode === TEST_MODE_MAX) {
      t += 'Le premier essai à ' + nombreFr(TEST_ESSAI_1, regle('test.pct1')) + INSECABLE + '% te met en confiance, le deuxième à ' +
        nombreFr(TEST_ESSAI_2, regle('test.pct2')) + INSECABLE + '% confirme, le troisième va chercher le record.';
      if (nombre(f.pariCharge) !== null) t += ' Je parie sur ' + enKg(f.pariCharge, regle('test.pari')) + '.';
      t += ' Le troisième essai se règle sur le deuxième : facile, un peu plus ; sans marge, un cran de plus ; raté, on s’arrête.';
    } else {
      t += 'Après la montée, une série à ' + nombreFr(f.serie ? f.serie.pct : TEST_SERIE_PCT, regle('test.pct_serie')) + INSECABLE +
        '% : ses reps me disent ton max, lues à la réserve que tu notes.';
      if (nombre(f.pariCharge) !== null) t += ' Je parie sur ' + enKg(f.pariCharge, regle('test.pari')) + '.';
    }
    return t;
  }
  // La phrase de la proposition (la carte).
  function phraseProposeTest(e) {
    if (!e) return null;
    if (e.voie === 'alleger') return 'Pour tester, allège d’abord une semaine : après des semaines dures, la fatigue masque ta force. Tu peux quand même la faire.';
    if (e.voie === 'bibliotheque') return 'Tes quatre barres, un mouvement par jour, sur une semaine. Tu choisis, barre par barre, de viser ton max ou de faire une série au max.';
    return 'Deux phases sont faites, la semaine allégée aussi. Je te propose de tester tes quatre barres, un mouvement par jour ; ta prochaine phase commence une semaine plus tard.';
  }
  // La feuille du Profil : pourquoi pas encore, ou la proposition.
  function phraseTestPropose(prop) {
    if (!prop) return null;
    if (prop.propose) return phraseProposeTest(prop);
    if (prop.raison === 'semaines') return 'Pas encore : il faut quatre semaines d’entraînement avant de tester.';
    if (prop.raison === 'decharge') return 'Pas maintenant : ta décharge arrive dans moins de deux semaines.';
    if (prop.raison === 'deja') return 'Une semaine de test est déjà posée.';
    return 'Pas maintenant.';
  }
  function phraseTestEnCours() {
    return 'Ta semaine de test est en cours : un mouvement par jour, sur tes barres. Ta charge de travail ne change pas.';
  }
  // Le bilan de fin de semaine : « Couché 154 kg → 157,5 kg ». `avant`, `mesure` : des charges (kg) ou `null`.
  function phraseBilanTest(nom, avant, mesure) {
    var a = nombre(avant), m = nombre(mesure);
    if (m === null) return nom + DEUX_POINTS + 'pas testé.';
    return nom + DEUX_POINTS + (a === null ? '' : enKg(a, regle('test.avant')) + ' → ') + enKg(m, regle('test.mesure')) + '.';
  }
  function phraseObjectifTest(mesure, cible) {
    var m = nombre(mesure), c = nombre(cible);
    if (m === null || c === null) return null;
    return m >= c ? 'Ton objectif de ' + enKg(c, regle('test.objectif')) + ' est atteint.'
      : 'Ton objectif : ' + enKg(c, regle('test.objectif')) + '. Mesuré ' + enKg(m, regle('test.mesure')) + '. Pas encore.';
  }
  // Le pari par barre : la charge du max attendu (le max estimé, au cran), module `test`.
  function testPari(max, o) {
    return testArrondi(max, o);
  }
  // Le max mesuré remplace l'estimation 90 jours : `mesures` `[{ valeur, date, charge, reps }]`, `aDate` : Date ou ISO. `null` hors fenêtre.
  function testMesureValable(mesures, aDate) {
    var fin = new Date(aDate).getTime();
    if (!isFinite(fin)) return null;
    var meilleure = null;
    (mesures || []).forEach(function (m) {
      var t = m ? new Date(m.date).getTime() : NaN;
      if (!isFinite(t) || t > fin || (fin - t) / 86400000 > TEST_VALIDITE_JOURS) return;
      if (nombre(m.valeur) === null) return;
      if (meilleure === null || t > meilleure.t) meilleure = { t: t, m: m };
    });
    return meilleure ? meilleure.m : null;
  }


  // ── 197 (MOTEUR §9.36) — FORME ET SANTÉ : la semaine (renforcement, cardio) et la puissance des 65 ans et plus ──────────────────────
  // Repères généraux de l'OMS (2020) et de l'ANSES pour l'adulte, dits comme des repères, jamais une prescription ni une promesse médicale.
  var FORME_RENFORCEMENT_CIBLE = 2, FORME_CARDIO_CIBLE_MIN = 150, FORME_INTENSE_FACTEUR = 2;
  // Une série de cardio est INTENSE à partir de ce RPE (convention de l'app : aucune donnée publiée ne la fixe) — lue par la semaine (197) et par le cardio régulier (199).
  var CARDIO_RPE_INTENSE = 8;
  // 65 ans et plus : la MÊME borne que la prudence de montée (`AGE_PLAFOND_BAS`). `null` : l'âge est inconnu, rien n'est deviné.
  function plusDe65Ans(age) {
    var a = nombre(age);
    if (a === null || a < 0 || a >= 130) return null;
    return a >= AGE_PLAFOND_BAS;
  }
  var FORME_PUISSANCE_PHRASE = 'Monte vite, descends en contrôlant.';
  var FORME_PUISSANCE_POURQUOI = 'À partir de 65 ans, la puissance protège des chutes (ACSM 2026) : une charge légère, montée vite, descendue en contrôlant.';
  var FORME_DOULEUR_PHRASE = 'Si une douleur dure, demande l’avis d’un médecin ou d’un kiné.';
  var FORME_REPERES_PHRASE = 'Les repères de l’OMS et de l’ANSES pour l’adulte : du renforcement au moins 2 fois par semaine, 150 min de cardio modéré (ou 75 min intense). Ce sont des repères généraux, pas une prescription.';
  // UN exercice de puissance par séance : le premier, dans l'ordre de la séance, qui est polyarticulaire, léger (jamais une barre), mesuré en
  // reps, et qui ne charge ni une zone à ménager ni une douleur récente. `exercices` : [{ slug, prim, sec, stab, equipement, mesure,
  // aMenager }]. Rend le slug ou `null`.
  function exerciceDePuissance(exercices) {
    var r = null;
    (exercices || []).some(function (x) {
      if (!x || !x.slug || x.aMenager === true || x.equipement === 'barre') return false;
      if (x.mesure !== 'charge_reps' && x.mesure !== 'reps') return false;
      if (!estPolyarticulaire({ prim: x.prim || [], sec: x.sec || [], stab: x.stab || [] })) return false;
      r = x.slug;
      return true;
    });
    return r;
  }

  // ── 201 — D'OÙ ÇA VIENT, ET LES MOTS DU COACH ────────────────────────────
  //
  // UN SEUL REGISTRE DES SOURCES (`SOURCES`), une entrée par clé de règle (les clés que la garde I26 cite déjà, `regle('…')`,
  // plus quelques clés de règle qui n'ont pas de chiffre à citer). Une entrée : `{ texte, type, auteur?, annee?, effectif? }`,
  // ou une liste d'entrées. Trois types, dits tels à l'écran : une ÉTUDE (qui, quand, sur combien de personnes), une PRATIQUE DE
  // COACHS (qui), une CONVENTION (un choix de l'app, dit comme tel). Une règle sans entrée n'a pas de ligne « D'où ça vient » :
  // jamais de source devinée (un test liste les règles sans source). Les textes viennent des recherches du 31/10/2026 et de ce
  // que MOTEUR §9.28 à §9.37 cite déjà. HONNÊTETÉ : une étude dit ce qu'elle a trouvé, avec son effectif — jamais « prouvé ».
  var TYPES_DE_SOURCE = { etude: 'Étude', coachs: 'Pratique de coachs', convention: 'Convention' };
  var SOURCES = {
    // L'effort visé : « garde N ».
    reserve: [
      { type: 'etude', auteur: 'Refalo', annee: 2024, effectif: '26 pratiquants entraînés',
        texte: 'Refalo 2024 (26 pratiquants entraînés, quadriceps) : à 1-2 reps de l’échec, le muscle progresse presque autant qu’à l’échec.' },
      { type: 'etude', auteur: 'Robinson', annee: 2024, effectif: '55 études',
        texte: 'Robinson 2024 (55 études réunies) : plus près de l’échec, un peu plus de croissance musculaire, un effet qui s’aplatit au-delà de 2 reps en réserve ; pour la force, rien de plus.' }
    ],
    // Le recul calé sur le max du jour : la table reps × réserve, le max lu sur une série.
    'recul.max': [
      { type: 'coachs', auteur: 'Mike Tuchscherer (RTS) et Barbell Medicine',
        texte: 'La table de Mike Tuchscherer (RTS) et la méthode de Barbell Medicine : monter au ressenti, puis reculer en pourcentage du max du jour.' },
      { type: 'etude', auteur: 'Reynolds', annee: 2006, effectif: '70 personnes',
        texte: 'Reynolds 2006 (70 personnes, couché et presse) : le max se calcule le mieux depuis une série de 5 reps (environ 3 kg d’écart au couché) ; au-delà de 10 reps, on ne le calcule plus.' }
    ],
    'recul.correction': { type: 'convention',
      texte: 'Le pas de 2,5 % (corrigé par tes séries) : un choix de l’app.' },
    // La dernière série « Au max ».
    au_max: { type: 'coachs', auteur: '5/3/1, GZCLP, nSuns, SBS',
      texte: 'La dernière série « au max » (le « 5+ ») vient de 5/3/1, GZCLP, nSuns et SBS.' },
    'au_max.reserve': { type: 'etude', auteur: 'Morán-Navarro', annee: 2017, effectif: '10 personnes',
      texte: 'Morán-Navarro 2017 (10 personnes) : l’échec au squat et au couché allonge la récupération de 24 à 48 h.' },
    // La dégressive.
    degressive: { type: 'etude', auteur: 'Sodal', annee: 2023, effectif: '6 études',
      texte: 'Sodal 2023 (6 études) : les séries dégressives donnent le même résultat en 54 à 70 % de temps en moins.' },
    // Le rest-pause.
    rest_pause: { type: 'coachs', auteur: 'Jeff Nippard, Renaissance Periodization',
      texte: 'Le rest-pause et les myo-reps : la pratique de Jeff Nippard et de Renaissance Periodization (Israetel).' },
    // La semaine de test.
    test: { type: 'coachs', auteur: 'Juggernaut, 5/3/1, SBS, Candito',
      texte: 'Juggernaut, 5/3/1, SBS et Candito recalent sur une série lourde ou une série au max plutôt que sur un vrai max.' },
    // Le défaut de la semaine de test : « Série au max » quand le max vient d'une série de plus de 5 reps, ou à partir de 65 ans.
    'test.defaut.reps': { type: 'etude', auteur: 'Reynolds', annee: 2006, effectif: '70 pratiquants',
      texte: 'Reynolds 2006 (70 pratiquants) : le max se calcule le mieux à partir d’une série de 5 reps ou moins.' },
    'test.defaut.age': { type: 'convention',
      texte: 'Le défaut « série au max » à partir de 65 ans : un choix de l’app, aucune étude ne fixe d’âge.' },
    // La baisse de force attendue en sèche (198).
    'seche.baisse': { type: 'etude', auteur: 'Garthe', annee: 2011, effectif: '24 athlètes',
      texte: 'Garthe 2011 (24 athlètes en sèche) : perdre 0,7 % du poids par semaine a mieux gardé la force que perdre 1,4 %.' },
    // La semaine allégée, la phase.
    allegee: { type: 'coachs', auteur: 'Calgary Barbell, Candito',
      texte: 'La semaine allégée planifiée : la pratique de Calgary Barbell et de Candito.' },
    'bloc.semaines': { type: 'convention',
      texte: 'La phase de 5 semaines (4 de travail, 1 allégée) : un choix de l’app.' },
    // La zone : ses fourchettes de reps.
    'zone.bas': { type: 'convention',
      texte: 'Les fourchettes de reps des zones (Lourd 3-5, Mix 6-8…) : un choix de l’app.' },
    // Le repos long d'un gros mouvement.
    repos_long: { type: 'etude', auteur: 'Schoenfeld', annee: 2016, effectif: '21 pratiquants',
      texte: 'Schoenfeld 2016 (21 pratiquants) : 2 à 3 min de repos sur les mouvements composés.' },
    // La marche de l'échelle, au poids du corps.
    'marche.seuil': { type: 'etude', auteur: 'Kotarsky', annee: 2018, effectif: '23 personnes',
      texte: 'Kotarsky 2018 (23 personnes) : au poids du corps, une rep de plus, puis une variante plus dure après 2 séances à 3 × 8.' }
  };

  // Les entrées d'une clé, copiées, chacune avec son étiquette (« Étude », « Pratique de coachs », « Convention »).
  function sourcesDe(cle) {
    var v = Object.prototype.hasOwnProperty.call(SOURCES, cle) ? SOURCES[cle] : null;
    if (!v) return [];
    return (Array.isArray(v) ? v : [v]).map(function (s) {
      var o = { texte: s.texte, type: s.type, etiquette: TYPES_DE_SOURCE[s.type] };
      if (s.auteur !== undefined) o.auteur = s.auteur;
      if (s.annee !== undefined) o.annee = s.annee;
      if (s.effectif !== undefined) o.effectif = s.effectif;
      return o;
    });
  }
  // Les sources d'une liste de clés de règle, sans doublon, dans l'ordre des clés. Une clé sans entrée n'ajoute rien.
  function sourcesDeRegles(cles) {
    var vu = {}, sortie = [];
    (cles || []).forEach(function (cle) {
      sourcesDe(cle).forEach(function (s) {
        if (vu[s.texte]) return;
        vu[s.texte] = true;
        sortie.push(s);
      });
    });
    return sortie;
  }

  // LE LEXIQUE : une liste fixe de mots, une phrase chacun (la voix du coach). Il se LIT : aucun calcul, aucun chiffre qui ne soit
  // celui de la règle (les zones sont lues sur ZONES). `source` : la clé de SOURCES du mot, s'il en a une.
  var LEXIQUE = [
    { cle: 'zone', mot: 'Zone', source: 'zone.bas',
      phrase: 'La fourchette de reps du jour : ' + ZONES.map(function (z) { return z.libelle + ' ' + z.bas + '-' + z.haut; }).join(', ') + '.' },
    { cle: 'palier', mot: 'Palier',
      phrase: 'La charge et les reps que tu tiens : le coach monte quand tu les dépasses.' },
    { cle: 'recul', mot: 'Recul', source: 'recul.max',
      phrase: 'Les séries plus légères qui suivent ta grosse série.' },
    { cle: 'max_du_jour', mot: 'Ton max aujourd’hui', source: 'recul.max',
      phrase: 'Ce que ta grosse série dit de ta force du jour.' },
    { cle: 'au_max', mot: 'Au max', source: 'au_max',
      phrase: 'La dernière série, poussée jusqu’à l’échec, ou en gardant les reps que le coach te donne.' },
    { cle: 'cinq_plus', mot: '5+', source: 'au_max',
      phrase: '5 reps ou plus : tu t’arrêtes quand la série te le dit.' },
    { cle: 'garde', mot: 'Garde N', source: 'reserve',
      phrase: 'Arrête la série quand il te reste N reps possibles. C’est la marge que vise ta zone aujourd’hui.' },
    { cle: 'allegee', mot: 'Semaine allégée', source: 'allegee',
      phrase: 'Mêmes charges, moins de séries, pour récupérer.' },
    { cle: 'phase', mot: 'Phase', source: 'bloc.semaines',
      phrase: '5 semaines : 4 de travail, 1 allégée.' },
    { cle: 'semaine_de_test', mot: 'Semaine de test', source: 'test',
      phrase: 'Une semaine où tu testes tes barres sur une série lourde, pour recaler tes charges. Ta charge de travail ne change pas.' },
    { cle: 'marche', mot: 'Marche', source: 'marche.seuil',
      phrase: 'En poids du corps, l’exercice suivant de l’échelle, plus dur.' },
    { cle: 'figure', mot: 'Figure',
      phrase: 'Un exercice qui se tient en secondes (planche, front lever) : on compte la durée, pas les reps.' },
    { cle: 'rest_pause', mot: 'Rest-pause', source: 'rest_pause',
      phrase: 'Une série jusqu’à l’échec, 15 s de pause, encore, deux fois.' },
    { cle: 'zone_a_menager', mot: 'Zone à ménager',
      phrase: 'Une articulation que tu m’as demandé de ménager : pas de série lourde sur les exercices qui la chargent.' }
  ];
  // Le lexique, chaque mot avec ses sources résolues.
  function lexique() {
    return LEXIQUE.map(function (m) {
      return { cle: m.cle, mot: m.mot, phrase: m.phrase, sources: m.source ? sourcesDe(m.source) : [] };
    });
  }
  // `n` (facultatif) : le N de « Garde N », quand une puce le dit (« garde 1 »).
  function motDuLexique(cle, n) {
    var tous = lexique();
    for (var i = 0; i < tous.length; i++) {
      if (tous[i].cle !== cle) continue;
      var m = tous[i];
      if (cle === 'garde' && typeof n === 'number' && n >= 0 && Math.floor(n) === n) {
        m.mot = 'Garde' + INSECABLE + n;
        m.phrase = 'Arrête la série quand il te reste ' + n + ' rep' + (n > 1 ? 's' : '') + ' possible' + (n > 1 ? 's' : '') +
          '. C\u2019est la marge que vise ta zone aujourd\u2019hui.';
      }
      return m;
    }
    return null;
  }

  var api = {
    // 197 (§9.36) — forme et santé.
    FORME_RENFORCEMENT_CIBLE: FORME_RENFORCEMENT_CIBLE, FORME_CARDIO_CIBLE_MIN: FORME_CARDIO_CIBLE_MIN, FORME_INTENSE_FACTEUR: FORME_INTENSE_FACTEUR, CARDIO_RPE_INTENSE: CARDIO_RPE_INTENSE,
    FORME_PUISSANCE_PHRASE: FORME_PUISSANCE_PHRASE, FORME_PUISSANCE_POURQUOI: FORME_PUISSANCE_POURQUOI, FORME_DOULEUR_PHRASE: FORME_DOULEUR_PHRASE,
    FORME_REPERES_PHRASE: FORME_REPERES_PHRASE, plusDe65Ans: plusDe65Ans, exerciceDePuissance: exerciceDePuissance,
    // 194-1 (§9.31) — la mobilité en fin de séance : une table, un bloc, des phrases.
    ZONES_RAIDES: ZONES_RAIDES, MOBILITE_ZONES: MOBILITE_ZONES, MOBILITE_CIBLE_MIN: MOBILITE_CIBLE_MIN, MOBILITE_CONSIGNE: MOBILITE_CONSIGNE,
    MOBILITE_REFUS_CLE: MOBILITE_REFUS_CLE, MOBILITE_POURQUOI_AVANT: MOBILITE_POURQUOI_AVANT, MOBILITE_CHARGE: MOBILITE_CHARGE, MOBILITE_NOMS: MOBILITE_NOMS,
    MOBILITE_TENUE_MIN_S: MOBILITE_TENUE_MIN_S, MOBILITE_TENUE_MAX_S: MOBILITE_TENUE_MAX_S,
    zonesRaidesConnues: zonesRaidesConnues, exerciceDeMobilite: exerciceDeMobilite, zoneDeMobilite: zoneDeMobilite,
    dureeDeMobilite: dureeDeMobilite, coteDeMobilite: coteDeMobilite, blocDeMobilite: blocDeMobilite, mobiliteTitre: mobiliteTitre,
    mobiliteSousTitre: mobiliteSousTitre, mobilitePourquoi: mobilitePourquoi,
    // 193-4 (MOTEUR §9.32) — la semaine de test.
    MODULE_TEST: MODULE_TEST, GRANDEUR_TEST: GRANDEUR_TEST,
    TEST_MODE_MAX: TEST_MODE_MAX, TEST_MODE_SERIE: TEST_MODE_SERIE, TEST_MONTEE: TEST_MONTEE, TEST_ESSAIS_MAX: TEST_ESSAIS_MAX,
    TEST_ACCESSOIRES_MAX: TEST_ACCESSOIRES_MAX, TEST_SEMAINES_MIN: TEST_SEMAINES_MIN, TEST_VALIDITE_JOURS: TEST_VALIDITE_JOURS,
    TEST_PHASES_AVANT: TEST_PHASES_AVANT, TEST_SERIE_PLAFOND: TEST_SERIE_PLAFOND, TEST_SERIE_PLAFOND_SOULEVE: TEST_SERIE_PLAFOND_SOULEVE,
    TEST_ESSAI_1: TEST_ESSAI_1, TEST_ESSAI_2: TEST_ESSAI_2, TEST_SERIE_PCT: TEST_SERIE_PCT, TEST_SERIE_PCT_DEBUTANT: TEST_SERIE_PCT_DEBUTANT,
    testModeParDefaut: testModeParDefaut, testRaisonDuDefaut: testRaisonDuDefaut, testPhraseDuDefaut: testPhraseDuDefaut, TEST_REPS_FIABLES_MAX: TEST_REPS_FIABLES_MAX, testModeValide: testModeValide, testMontee: testMontee, testEssai: testEssai,
    testSerieAuMax: testSerieAuMax, testMesure: testMesure, testBarreDuJour: testBarreDuJour, testBarresEnConflit: testBarresEnConflit,
    testProposable: testProposable, testConsigneEssai: testConsigneEssai, testConsigneSerie: testConsigneSerie, pourquoiTest: pourquoiTest,
    phraseProposeTest: phraseProposeTest, phraseTestPropose: phraseTestPropose, phraseTestEnCours: phraseTestEnCours, phraseBilanTest: phraseBilanTest, phraseObjectifTest: phraseObjectifTest,
    testPari: testPari, testMesureValable: testMesureValable, testClasse: testClasse,
    // §10 bis (108) — le matériel de la salle.
    SALLE_BARRES: SALLE_BARRES,
    salleEnVigueur: salleEnVigueur,
    chargesDeLaSalle: chargesDeLaSalle,
    maxDeLaSalle: maxDeLaSalle,
    voisineDeLaSalle: voisineDeLaSalle,
    dansLaSalle: dansLaSalle,
    arrondieALaSalle: arrondieALaSalle,
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
    peutRestPause: peutRestPause,
    structureDeRoutine: structureDeRoutine,
    estPolyarticulaire: estPolyarticulaire,
    prudenceDeMontee: prudenceDeMontee,
    prudenceEffective: prudenceEffective,
    phrasePrudence: phrasePrudence,
    estGrandMouvement: estGrandMouvement,
    estUnMouvementAuPoidsDuCorps: estUnMouvementAuPoidsDuCorps,
    reposAConseiller: reposAConseiller, phraseReposLong: phraseReposLong,
    CHUTE_DE_REPS: CHUTE_DE_REPS, SEANCES_DE_CHUTE: SEANCES_DE_CHUTE, REPOS_COURT_S: REPOS_COURT_S,
    consigneDepartRoutine: consigneDepartRoutine,
    ZONE_SANS_LOURD: ZONE_SANS_LOURD, calagePremiereFois: calagePremiereFois, libellesCalage: libellesCalage, plancherDuCalage: plancherDuCalage,
    plafondDuCalage: plafondDuCalage, CALAGE_REPS_DEFAUT: CALAGE_REPS_DEFAUT,
    CALAGE_REPS_APPROCHE: CALAGE_REPS_APPROCHE,
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
    libelleAlleger: libelleAlleger,
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
    // 189 — la fatigue sur plusieurs semaines (§14.11).
    SOURCE_BAISSE: SOURCE_BAISSE,
    REPONSE_SERIE_DE_MOINS: REPONSE_SERIE_DE_MOINS,
    CLE_SERIE_DE_MOINS: CLE_SERIE_DE_MOINS,
    FATIGUE_SERIES_MIN: FATIGUE_SERIES_MIN,
    FATIGUE_REFRACTAIRE_JOURS: FATIGUE_REFRACTAIRE_JOURS,
    baisseGenerale: baisseGenerale,
    constatDeBaisse: constatDeBaisse,
    fatigueAutorisee: fatigueAutorisee,
    baisseAutorisee: baisseAutorisee,
    observationBaisse: observationBaisse,
    valeurDeFatigue: valeurDeFatigue,
    titreBaisse: titreBaisse,
    baisseAttendue: baisseAttendue,
    titreBaisseAttendue: titreBaisseAttendue,
    phraseBaisseAttendue: phraseBaisseAttendue,
    FATIGUE_BAISSE_MIN: FATIGUE_BAISSE_MIN,
    phraseBaisse: phraseBaisse,
    detailBaisse: detailBaisse,
    libelleSerieDeMoins: libelleSerieDeMoins,
    pourquoiBaisse: pourquoiBaisse,
    seriesDeMoins: seriesDeMoins,
    consigneSerieDeMoins: consigneSerieDeMoins,
    grisSerieDeMoins: grisSerieDeMoins,
    bandeauSerieDeMoins: bandeauSerieDeMoins,
    libelleRevenirAuxSeries: libelleRevenirAuxSeries,
    PHRASE_SERIES_REVENUES: PHRASE_SERIES_REVENUES,
    serieDeMoinsValable: serieDeMoinsValable,
    MARCHE_SCHEMA: MARCHE_SCHEMA,
    MARCHE_REPLI: MARCHE_REPLI,
    MARCHE_SECHE: MARCHE_SECHE,
    MARCHE_SERIE_DE_PLUS: MARCHE_SERIE_DE_PLUS,
    MARCHE_DEGRESSIVE: MARCHE_DEGRESSIVE,
    MARCHE_ALLEGER: MARCHE_ALLEGER,
    propositionAlleger: propositionAlleger,
    consigneAlleger: consigneAlleger,
    carteAlleger: carteAlleger,
    carteBordSchema: carteBordSchema,
    carteDepassement: carteDepassement,
    DEPASSEMENT_SILENCE: DEPASSEMENT_SILENCE,
    BORD_PROPOSE_DES: BORD_PROPOSE_DES,
    detailAlleger: detailAlleger,
    grisAlleger: grisAlleger,
    phraseRappelAlleger: phraseRappelAlleger,
    allegerProposee: allegerProposee,
    allegerActive: allegerActive,
    cransDAlleger: crans,
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
    reprisePour: reprisePour, douleurRepetee: douleurRepetee, phraseDouleurRepetee: phraseDouleurRepetee,
    DOULEUR_REPETEE_DES: DOULEUR_REPETEE_DES, PHRASE_KINE: PHRASE_KINE,
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
    motsDesMuscles: motsDesMuscles,
    GRIS_SERIE_DE_PLUS: GRIS_SERIE_DE_PLUS,
    marcheProposee: marcheProposee,
    aLaPlusLourdeDeLaSalle: aLaPlusLourdeDeLaSalle,
    plafondALaSalle: plafondALaSalle,
    serieDePlusProposee: serieDePlusProposee,
    serieDePlusActive: serieDePlusActive,
    periodesSerieDePlus: periodesSerieDePlus,
    carteSerieDePlus: carteSerieDePlus,
    degressivePossible: degressivePossible,
    degressiveProposee: degressiveProposee,
    degressiveActive: degressiveActive,
    carteDegressive: carteDegressive,
    // §10 bis (113) — au plafond de la salle, le coach propose.
    MARCHE_REMPLACEMENT: MARCHE_REMPLACEMENT,
    // 175 — les leviers du plafond.
    MARCHE_LEVIERS: MARCHE_LEVIERS,
    MARCHE_DESSOUS: MARCHE_DESSOUS,
    carteDessous: carteDessous,
    detailDessous: detailDessous,
    LEVIER_REMPLACEMENT: LEVIER_REMPLACEMENT,
    LEVIER_TEMPO: LEVIER_TEMPO,
    LEVIER_REPS: LEVIER_REPS,
    LEVIER_SALLE: LEVIER_SALLE,
    TEMPO_DESCENTE_S: TEMPO_DESCENTE_S,
    NON_LEVIERS: NON_LEVIERS,
    carteLeviers: carteLeviers,
    leviersDuPlafond: leviersDuPlafond,
    viseeDuLevier: viseeDuLevier,
    avecRallonge: avecRallonge,
    grisTempo: grisTempo,
    levierActif: levierActif,
    rallongeAcceptee: rallongeAcceptee,
    rallongeChangeLePlafond: rallongeChangeLePlafond,
    // 175 — le gros cran.
    GROS_CRAN_PAR_REP: GROS_CRAN_PAR_REP,
    GROS_PLANCHER_ISOLATION: GROS_PLANCHER_ISOLATION,
    GROS_PLANCHER: GROS_PLANCHER,
    GROS_RECUL_REPS: GROS_RECUL_REPS,
    GROS_CIBLE_MAX: GROS_CIBLE_MAX,
    GROS_ESSAIS_AVANT_LEVIERS: GROS_ESSAIS_AVANT_LEVIERS,
    grosCran: grosCran,
    carteLeviersGros: carteLeviersGros,
    leviersDuGros: leviersDuGros,
    plancherDuGros: plancherDuGros,
    cibleMaxDuGros: cibleMaxDuGros,
    cibleDuGros: cibleDuGros,
    ORIGINE_SALLE_MAX: ORIGINE_SALLE_MAX,
    MARCHES_PLAFOND: MARCHES_PLAFOND,
    auPlafondDeLaSalle: auPlafondDeLaSalle,
    plafondDeLaConsigne: plafondDeLaConsigne,
    marcheAuPlafond: marcheAuPlafond,
    plusChargeableALaSalle: plusChargeableALaSalle,
    remplacantAuPlafond: remplacantAuPlafond,
    cartePlafond: cartePlafond,
    detailRemplacement: detailRemplacement,
    observationPlafond: observationPlafond,
    consigneSerieDePlus: consigneSerieDePlus,
    placePourExercice: placePourExercice,
    musclesParPriorite: musclesParPriorite,
    situationChauffe: situationChauffe,
    chauffesDe: chauffesDe,
    degressiveDe: degressiveDe,
    // 193-1 (§9.28) — la série de recul.
    reculDe: reculDe,
    // 193-5 — les reculs à plus de reps, calés sur le max du jour (§9.28)
    PCT_MAX_PAR_REPS: PCT_MAX_PAR_REPS,
    RECUL_MARGE_VISEE: RECUL_MARGE_VISEE,
    pctDuMax: pctDuMax,
    repsDeLaTable: repsDeLaTable,
    maxDuJour: maxDuJour,
    reculAuMax: reculAuMax,
    auMaxDe: auMaxDe,
    echecRecentDeBarre: echecRecentDeBarre,
    pourquoiAuMaxEchecRecent: pourquoiAuMaxEchecRecent,
    AU_MAX_RESERVE_PAR_DEFAUT: AU_MAX_RESERVE_PAR_DEFAUT,
    niveauHorsAuMax: niveauHorsAuMax,
    consigneAuMax: consigneAuMax,
    pourquoiAuMaxSouleve: pourquoiAuMaxSouleve,
    prevoirRepsAuMax: prevoirRepsAuMax,
    constatAuMax: constatAuMax,
    douleurRecente: douleurRecente,
    reculDePlusDeReps: reculDePlusDeReps,
    correctionDeRecul: correctionDeRecul,
    phraseReculAuMax: phraseReculAuMax,
    pourquoiReculAuMax: pourquoiReculAuMax,
    ecartDeRecul: ecartDeRecul,
    cranLePlusProche: cranLePlusProche,
    phraseRecul: phraseRecul,
    puisRecul: puisRecul,
    pourquoiRecul: pourquoiRecul,
    phraseConstatReculs: phraseConstatReculs,
    RECUL_ECART_DEPART: RECUL_ECART_DEPART,
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
    pasDeLaBarre: pasDeLaBarre,
    brancherPlusPetitDisque: brancherPlusPetitDisque,
    RANGEMENT: RANGEMENT,
    mediane: mediane,
    zoneParCle: zoneParCle,
    zoneDe: zoneDe,
    zoneRetenue: zoneRetenue,
    sousHistoireDeZone: sousHistoireDeZone,
    pourquoiPlan: pourquoiPlan,
    zonesDeLaSeanceDePlan: zonesDeLaSeanceDePlan,
    ZONE_PERIMEE_JOURS: ZONE_PERIMEE_JOURS,
    niveauValide: niveauValide,
    reserveVisee: reserveVisee,
    phraseEffortVise: phraseEffortVise,
    effortViseEligible: effortViseEligible,
    RESERVE_ECART: RESERVE_ECART,
    formatDe: formatDe,
    coupleDe: coupleDe,
    // Le pont entre `THPalier.analyser` et `niveauValide` : l'un rend une
    // séance décrite, l'autre attend les seules séries au palier.
    seriesAuPalier: seriesAuPalier,
    habitudeDe: habitudeDe,
    anterieures: anterieures,
    pasDeSalle: pasDeSalle,
    chargeVoisine: chargeVoisine,
    estApprochee: estApprochee,
    phraseApprochee: phraseApprochee,
    ecartHabituel: ecartHabituel,
    repriseDe: repriseDe,
    consignePour: consignePour,
    consigneApresAFond: consigneApresAFond,
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
    blocAPhases: blocAPhases,
    SEMAINES_PHASE: SEMAINES_PHASE,
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
    estZoneForce: estZoneForce,
    memeCharge: memeCharge,
    estIsolation: estIsolation,
    numeroDuJour: numeroDuJour,
    jourDuNumero: jourDuNumero,
    SANS_CUMUL_JOURS: SANS_CUMUL_JOURS,
    SEMAINES_BLOC_MIN: SEMAINES_BLOC_MIN,
    SEMAINES_BLOC_MAX: SEMAINES_BLOC_MAX,
    SEMAINES_BLOC_DEFAUT: SEMAINES_BLOC_DEFAUT,
    MODULE_PROGRAMME: MODULE_PROGRAMME,
    GRANDEUR_PROGRAMME: GRANDEUR_PROGRAMME,
    REPORT_FENETRE_JOURS: REPORT_FENETRE_JOURS,
    idDePrediction: idDePrediction,
    idDEscalier: idDEscalier,
    idDeRecul: idDeRecul,
    idDObjectif: idDObjectif,
    MODULE_OBJECTIF: MODULE_OBJECTIF,
    idDImport: idDImport,
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
    OUI_LEST_VARIANTE: OUI_LEST_VARIANTE,
    nonLestVariante: nonLestVariante,
    NON_LEST: NON_LEST,
    // §9.17 bis (127) — l'échelle des variantes : le seuil de 8 reps, la carte « marche suivante », la phrase de la page.
    SEUIL_MARCHE: SEUIL_MARCHE,
    SERIES_MARCHE: SERIES_MARCHE,
    seuilDeMarche: seuilDeMarche,
    carteMarche: carteMarche,
    carteMarcheDecidee: carteMarcheDecidee,
    carteMarcheTitre: carteMarcheTitre,
    carteMarcheDetail: carteMarcheDetail,
    ouiMarche: ouiMarche,
    NON_MARCHE: NON_MARCHE,
    phraseDeLaSuivante: phraseDeLaSuivante,
    rondsDeLaSuivante: rondsDeLaSuivante,
    PARTS_DE_TENUE: PARTS_DE_TENUE,
    TENUE_MIN_S: TENUE_MIN_S,
    TENUE_SOUS_S: TENUE_SOUS_S,
    partDeLaTenue: partDeLaTenue,
    dureeVisee: dureeVisee,
    phraseDeLaTenueMax: phraseDeLaTenueMax,
    phraseDesTenues: phraseDesTenues,
    carteMarcheEnSecondes: carteMarcheEnSecondes,
    consigneDepartLeste: consigneDepartLeste,
    seanceDuContrat: seanceDuContrat,
    consigneDExercice: consigneDExercice,
    INSECABLE: INSECABLE,
    // 201 — D'où ça vient, et les mots du coach.
    TYPES_DE_SOURCE: TYPES_DE_SOURCE,
    SOURCES: SOURCES,
    sourcesDe: sourcesDe,
    sourcesDeRegles: sourcesDeRegles,
    LEXIQUE: LEXIQUE,
    lexique: lexique,
    motDuLexique: motDuLexique
  };

  // La table des mois courts vit avec le formateur (`modele.js`, §20.2) ; le
  // moteur la montre toujours, lue tardivement comme le reste du formateur.
  Object.defineProperty(api, 'MOIS_COURTS', {
    enumerable: true, get: function () { return Modele().MOIS_COURTS; }
  });

  racine.THMoteur = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
