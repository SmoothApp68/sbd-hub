//
// Les dates du décor du banc d'écran — UN SEUL ENDROIT.
//
// ══ POURQUOI CE FICHIER EXISTE ═════════════════════════════════════════════
//
// Le décor se datait depuis « le lundi de cette semaine ». Deux contraintes
// pèsent sur lui, et ce point d'ancrage n'en tenait qu'une :
//
//   · les séances du décor doivent être DANS LA SEMAINE AFFICHÉE — c'est la
//     moitié de la configuration discriminante du chantier 23, les totaux de
//     la semaine ;
//   · elles doivent être DANS LE PASSÉ — le moteur ne lit jamais l'avenir
//     (MOTEUR §9.12), et une séance à venir n'est pas « la fois d'avant ».
//
// « Lundi + 6 jours » est dans l'avenir du lundi au samedi. La famille a coûté
// quatre vérifications un dimanche (48b-5b-2), quatre autres (48b-5b-4), et
// trois de plus le lundi 21/09 — chaque fois sans qu'une ligne de code de
// l'app ait changé. Deux correctifs locaux ont déplacé deux séances ; l'ancre,
// elle, est restée.
//
// ══ CE QUI LA REND IMPOSSIBLE ══════════════════════════════════════════════
//
// LA JOURNÉE EN COURS tient les deux contraintes, tous les jours : elle
// appartient à la semaine affichée par définition, et son début est toujours
// derrière nous. Les rangs du décor s'y répartissent, du plus ancien au plus
// récent — ils gardent leur ORDRE quelle que soit l'heure, même à 00 h 03.
//
// Et ils vivent ICI, en un seul endroit, parcouru pour les sept jours de la
// semaine par `tests/unit/v2-banc-dates.test.js`. Une date de décor nouvelle
// passe par `datesDuDecor` : le contrôle la couvre d'office.
'use strict';

var JOUR = 86400000;
// Sept rangs : le décor en utilise six, le septième est la marge de celui qui
// en ajoutera un sans relire ce fichier.
var RANGS = 7;

function debutDeJournee(t) {
  var d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Les `RANGS` dates du décor, de la plus ancienne à la plus récente, toutes
// strictement dans le passé et toutes dans la journée en cours.
//
// ⚠️ LA LARGEUR A UN PLANCHER, et c'est le seul cas de bord qui subsiste : à
// l'instant EXACT de minuit, la journée en cours n'a pas encore de passé. Le
// plancher recule alors de quelques millisecondes — donc, un lundi à
// 00:00:00.000 pile, dans la semaine précédente. Huit millisecondes par
// semaine : on les nomme plutôt que de prétendre les avoir fermées.
function datesDuDecor(maintenant) {
  var t = maintenant === undefined ? Date.now() : Number(maintenant);
  var largeur = Math.max(t - debutDeJournee(t), RANGS + 1);
  var debut = t - largeur;
  var sortie = [];
  for (var n = 0; n < RANGS; n++) {
    sortie.push(new Date(Math.round(debut + largeur * (n + 1) / (RANGS + 1))));
  }
  return sortie;
}

module.exports = {
  JOUR: JOUR,
  RANGS: RANGS,
  debutDeJournee: debutDeJournee,
  datesDuDecor: datesDuDecor
};
