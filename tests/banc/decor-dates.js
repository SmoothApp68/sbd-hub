//
// Les dates du décor du banc d'écran — UN SEUL ENDROIT.
//
// ══ LA RÈGLE (famille #304, #311, #316) ════════════════════════════════════
// 1. Toute date du décor qui dépend de maintenant passe par ce fichier, jamais par un calcul local du banc.
// 2. Elle est dans le passé, et dans la semaine que la section qui la lit ouvre.
// 3. `tests/unit/v2-banc-dates.test.js` la vérifie pour les 7 jours × 4 heures : une date qui n'y passe pas n'est pas contrôlée.
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

// ══ LA SEMAINE ISOLÉE DES SECTIONS 40 À 49 ═════════════════════════════════
//
// Certaines sections veulent une semaine À ELLES SEULES, loin de celle du
// décor : huit semaines avant son premier rang. Le banc l'ouvre par
// `/semaine/<date de l'ancre>`, c'est-à-dire la semaine qui CONTIENT l'ancre.
//
// ⚠️ L'ANCRE N'EST PAS UN LUNDI : c'est le même jour de la semaine
// qu'aujourd'hui. « Ancre + 6 jours » (la séance de la section 47) ne tombait
// donc dans la semaine ouverte QUE le lundi, et la carte cherchée était
// absente six jours sur sept — la même famille que #311, d'une semaine à
// l'autre au lieu d'aujourd'hui à demain.
//
// Même remède : la JOURNÉE DE L'ANCRE, la seule qui appartienne à la semaine
// ouverte quel que soit le jour — elle en est la définition —, et elle est
// huit semaines dans le passé. Rendue telle quelle, sans heure ajoutée : un
// décalage d'heure pourrait la faire passer au lendemain.
var SEMAINES_ISOLEE = 8;

function ancreSemaineIsolee(premierRang) {
  return new Date(new Date(premierRang).getTime() - SEMAINES_ISOLEE * 7 * JOUR);
}

// 145 — « TES ÉCHELLES CETTE SEMAINE » lit la semaine ÉCOULÉE (lundi → dimanche qui précède celle d'aujourd'hui) : le
// mercredi, à midi, de la semaine écoulée moins `n` semaines (`n` = 0 : la semaine écoulée). Toujours dans le passé, tous
// les jours, et toujours dans SA semaine : midi ne change pas de jour avec un fuseau ou un changement d'heure.
function mercrediEcoule(n, maintenant) {
  var t = maintenant === undefined ? Date.now() : Number(maintenant);
  var a = new Date(t);
  var lundi = new Date(a.getFullYear(), a.getMonth(), a.getDate() - ((a.getDay() + 6) % 7) - 7 - 7 * (n || 0));
  return new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + 2, 12);
}

// Section 47 — la séance dont les séries ne sont pas arrivées.
function seanceSansSeries(ancre) {
  return new Date(new Date(ancre).getTime());
}

// Les séances de la semaine isolée (sections 40 à 49) : les AUTRES jours de
// la semaine de l'ancre, à midi. Elles remplacent « ancre + k jours + 10 h »,
// qui sortait de cette semaine dès que l'ancre n'était pas un lundi (« Quads
// tous terrains », k = 2 : le samedi et le dimanche).
//
// ⚠️ JAMAIS LE JOUR DE L'ANCRE : c'est celui de la section 47, et sa carte
// sans séries n'a pas d'enveloppe — elle cherche le « ⋯ » dans le bloc du
// JOUR. Une autre séance le même jour y mettrait le sien, et la vérification
// mesurerait la voisine.
// Toute la semaine de l'ancre est huit semaines derrière nous : n'importe quel
// jour y est passé. Midi, et non l'heure de l'ancre : un changement d'heure
// ne fait jamais changer midi de jour.
// `n` va de 1 à 6 : le n-ième jour de la semaine, l'ancre exclue, dans l'ordre.
function jourIsole(ancre, n) {
  var a = new Date(ancre);
  var lundi = new Date(a.getFullYear(), a.getMonth(), a.getDate() - ((a.getDay() + 6) % 7), 12);
  var autres = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i, 12);
    if (d.getDate() !== a.getDate() || d.getMonth() !== a.getMonth()) autres.push(d);
  }
  return autres[n - 1];
}

// « Il y a `duree` millisecondes » — la séance d'avant, posée juste derrière
// maintenant (et quelques semaines plus tôt pour un historique).
//
// 176 — DES JOURS ENTIERS SE COMPTENT AU CALENDRIER, PAS EN 24 h. Le dimanche 25/10/2026 (fin de l'heure d'été),
// entre 23 h et minuit, « il y a 7 × 24 h » tombait au lundi 00 h 55 de la semaine d'avant, pas au dimanche : les
// séances du décor changeaient de JOUR (et de semaine affichée), et le banc échouait sur [E] et [J58] sans qu'une
// ligne de l'app ait changé. Une durée multiple de 24 h recule donc de N jours civils à la MÊME heure locale ;
// toute autre durée (minutes, heures) reste une soustraction en millisecondes.
function ilYa(duree, maintenant) {
  var t = maintenant === undefined ? Date.now() : Number(maintenant);
  if (duree > 0 && duree % JOUR === 0) {
    var d = new Date(t);
    d.setDate(d.getDate() - duree / JOUR);
    return d;
  }
  return new Date(t - duree);
}

// La FIN d'une séance terminée du décor : une heure après son début, mais
// jamais dans l'avenir. « Début + 1 h » tombait à venir à minuit passé
// (rangs du décor) et TOUJOURS pour une séance posée une seconde avant
// maintenant : une séance terminée ne finit pas plus tard qu'aujourd'hui.
var HEURE = 3600000;
function finDe(debut, maintenant) {
  var t = maintenant === undefined ? Date.now() : Number(maintenant);
  var d = new Date(debut).getTime();
  return new Date(Math.max(d, Math.min(d + HEURE, t - 1)));
}

// 96 — UNE SÉANCE `en_cours` ABANDONNÉE, PAS VIVANTE. Depuis le 84 (12/10/2026),
// une séance ouverte ailleurs dont l'activité date de moins de 45 minutes est
// VIVANTE (`Seance.estVivante`) : l'app ne la referme plus et DEMANDE s'il faut
// la reprendre — une feuille ouverte par-dessus l'écran. Le décor vit dans la
// journée en cours : avant 00 h 45, TOUS ses rangs ont moins de 45 minutes. La
// séance « restée ouverte » du [D7] devenait vivante, la feuille restait
// ouverte, et le clic suivant (`choisirIntention`) bloquait le groupe entier —
// chaque nuit, sans qu'une ligne de l'app ait changé (15/10/2026).
// Le remède : la date voulue si elle est assez ancienne, sinon DEUX HEURES
// avant maintenant (bien au-delà des 45 minutes). L'après-midi, rien ne change.
var ABANDON = 2 * HEURE;
function horsDeVie(date, maintenant) {
  var t = maintenant === undefined ? Date.now() : Number(maintenant);
  return new Date(Math.min(new Date(date).getTime(), t - ABANDON));
}

module.exports = {
  horsDeVie: horsDeVie,
  JOUR: JOUR,
  RANGS: RANGS,
  debutDeJournee: debutDeJournee,
  datesDuDecor: datesDuDecor,
  ancreSemaineIsolee: ancreSemaineIsolee,
  mercrediEcoule: mercrediEcoule,
  seanceSansSeries: seanceSansSeries,
  jourIsole: jourIsole,
  ilYa: ilYa,
  finDe: finDe
};
