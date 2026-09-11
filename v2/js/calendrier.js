// v2/js/calendrier.js — la grille d'un mois, pour choisir une SEMAINE.
//
// Module PUR : aucune dépendance au DOM, au réseau, à History.
//
// LA RÈGLE CENTRALE : ce sont les LIGNES qui se sélectionnent, pas les jours.
// Toucher n'importe quel jour du 24 au 30 choisit la semaine entière. C'est la
// seule façon d'éviter le « j'ai touché mercredi, pourquoi toute la semaine ».
// Chaque ligne porte donc son lundi, et c'est lui qu'on rend — le jour touché
// ne sert qu'à désigner sa ligne.
//
// UN POINT PAR SÉANCE. Deux séances le même jour, deux points. Le rythme du
// mois se lit d'un coup d'œil. Les jours du mois voisin restent visibles mais
// éteints, AVEC leurs points : une semaine à cheval se choisit quand même, et
// depuis l'un ou l'autre des deux mois.
//
// Ce que la grille ne dit PAS : rien sur les jours vides. Pas de couleur
// d'alerte, pas de série de jours rouges, pas de compteur de régularité.
// CADRAGE-V2 §3.1 bis — le système ne commente jamais l'assiduité. Un point,
// ou rien.

(function (racine) {
  'use strict';

  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
              'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  var LIGNES = 6;   // couvre tous les mois, y compris février qui commence un dimanche

  function jourLocal(a, m, j) { return new Date(a, m, j, 0, 0, 0, 0); }

  // Le lundi de la semaine contenant `d`. Même règle que THSemaine, réécrite
  // ici pour que le module reste sans dépendance.
  function lundiDe(d) {
    var recul = (d.getDay() + 6) % 7;      // getDay : 0 = dimanche
    return jourLocal(d.getFullYear(), d.getMonth(), d.getDate() - recul);
  }

  function memeJour(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  // Compte des séances par jour, en heure LOCALE : `debut` est un timestamptz,
  // et le lire en UTC décalerait une séance du soir au lendemain.
  function compterParJour(seances) {
    var compte = {};
    (seances || []).forEach(function (s) {
      if (!s || !s.debut) return;
      var d = new Date(s.debut);
      if (isNaN(d.getTime())) return;
      var cle = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      compte[cle] = (compte[cle] || 0) + 1;
    });
    return compte;
  }

  function grilleMois(annee, mois, seances) {
    var premier = jourLocal(annee, mois, 1);
    if (isNaN(premier.getTime())) return null;
    var depart = lundiDe(premier);
    var compte = compterParJour(seances);

    var lignes = [];
    for (var l = 0; l < LIGNES; l++) {
      var lundi = jourLocal(depart.getFullYear(), depart.getMonth(), depart.getDate() + l * 7);
      var jours = [];
      for (var i = 0; i < 7; i++) {
        var d = jourLocal(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i);
        var cle = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
        jours.push({
          date: d,
          jour: d.getDate(),
          // Visible mais éteint — et il garde ses points.
          horsMois: d.getMonth() !== mois || d.getFullYear() !== annee,
          points: compte[cle] || 0
        });
      }
      lignes.push({ lundi: lundi, jours: jours });
    }
    return { annee: annee, mois: mois, libelle: MOIS[mois] + ' ' + annee, lignes: lignes };
  }

  // Le jour touché ne sert qu'à désigner sa ligne : on rend le lundi.
  function semaineDuJour(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    return lundiDe(d);
  }

  function decalerMois(annee, mois, n) {
    var d = jourLocal(annee, mois + n, 1);
    return { annee: d.getFullYear(), mois: d.getMonth() };
  }

  // La ligne qui contient une semaine donnée, pour la marquer sélectionnée.
  function ligneDeLaSemaine(grille, lundi) {
    if (!grille || !(lundi instanceof Date)) return -1;
    for (var i = 0; i < grille.lignes.length; i++) {
      if (memeJour(grille.lignes[i].lundi, lundi)) return i;
    }
    return -1;
  }

  var api = {
    MOIS: MOIS,
    LIGNES: LIGNES,
    grilleMois: grilleMois,
    semaineDuJour: semaineDuJour,
    decalerMois: decalerMois,
    ligneDeLaSemaine: ligneDeLaSemaine
  };

  racine.THCalendrier = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
