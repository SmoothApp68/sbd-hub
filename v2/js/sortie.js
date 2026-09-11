// v2/js/sortie.js — le bouton retour, et la sortie de l'application.
//
// AUCUNE PAGE WEB NE PEUT SE FERMER PAR SCRIPT — ni PWA, ni onglet.
// `window.close()` n'agit que sur une fenêtre ouverte par script. Une app qui
// « quitte sur confirmation » n'existe pas ; la seule réalisation possible est
// l'inverse de ce que la formule suggère :
//
//     On ne ferme pas l'app. On cesse d'empêcher le système de la fermer.
//
// EMPÊCHER, c'est avoir une entrée d'historique à consommer. Sur la vue racine,
// quand l'app n'a rien empilé en dessous, elle maintient une ANCRE : une entrée
// de même URL, invisible, qui absorbe l'appui sur retour et laisse le temps de
// poser la question. Elle est réinstallée après chaque appui intercepté.
//
// CESSER D'EMPÊCHER, c'est lever l'interception et rendre l'ancre au système —
// un seul `back`, sur notre propre entrée. Le retour SUIVANT n'a plus rien à
// consommer : Android ferme la PWA, l'onglet revient à sa page précédente (ou
// ne fait rien s'il n'y en a pas). C'est le « appuyez à nouveau pour quitter »
// d'Android, avec une question explicite à la place du double appui.
//
// CE QUI A DISPARU : `history.go(-(profondeur + 2))`. Il reculait AU-DELÀ des
// entrées de l'app, jusqu'au document qui l'avait lancée — d'où le redémarrage
// à froid observé sur device, en PWA comme en onglet. Ici aucun recul ne
// dépasse une entrée, et jamais une autre que la nôtre.
//
// History est INJECTÉ, pas capté : c'est ce qui rend le mécanisme testable
// sans navigateur, et ce qui permet d'affirmer par un test qu'on ne recule
// jamais au-delà de nos propres entrées.

(function (racine) {
  'use strict';

  function creer(deps) {
    var d = deps || {};
    var hist = d.history;                  // History, ou son double de test
    var routeur = d.routeur;               // THRouteur : l'arbitre des décisions
    var chemin = d.chemin;                 // () -> chemin courant
    var etatHistorique = d.etatHistorique; // () -> history.state courant
    var gardes = d.gardes || function () { return []; };
    var demander = d.demander;             // (garde, surOui, surNon) -> void
    var rendre = d.rendre;                 // (route) -> void

    // Nos propres entrées de navigation empilées au-dessus de l'entrée de
    // lancement. L'ancre n'en fait pas partie : elle n'est pas une vue.
    var pile = 0;

    // Levée par une confirmation, ré-armée par toute navigation explicite :
    // quelqu'un qui continue à se servir de l'app a cessé de vouloir sortir.
    var intercepte = true;

    function estAncre(e) { return !!(e && e.ancre === true); }
    function ancreEnPlace() { return estAncre(etatHistorique()); }

    function poserAncre() {
      if (ancreEnPlace()) return false;
      hist.pushState({ ancre: true }, '', chemin());
      return true;
    }

    // L'arbitre reste le routeur : l'ancre existe exactement là où une
    // confirmation serait demandée, jamais ailleurs. Sans gardes ici — une
    // garde se prononce au moment du retour, pas à l'installation.
    function demandeConfirmation(route) {
      return routeur.decisionRetour(route, {}).action === 'confirmer';
    }

    // L'ancre n'a de sens que tout en bas : si l'app a empilé des vues, le
    // retour a déjà où revenir et n'a rien à absorber.
    function maintenir(route) {
      if (!intercepte) return;
      if (pile !== 0) return;
      if (!demandeConfirmation(route)) return;
      poserAncre();
    }

    function apresNavigation(route, empilee) {
      if (empilee) pile += 1;
      intercepte = true;
      maintenir(route);
    }

    function confirmer() {
      intercepte = false;
      hist.back();   // notre propre ancre, une entrée, jamais plus
    }

    // Refuser ne défait rien : l'ancre a été réinstallée avant la question.
    function refuser() {}

    function surRetour() {
      var route = routeur.analyser(chemin());

      // On atterrit SUR l'ancre : le retour venait d'une vue empilée au-dessus
      // d'elle. Rien à demander, l'ancre est déjà en place sous nos pieds.
      if (ancreEnPlace()) { pile = 0; rendre(route); return; }

      pile = Math.max(0, pile - 1);

      // Interception levée : le système a la main. On rend ce qu'on a sous les
      // yeux, et rien d'autre — ni ancre, ni question.
      if (!intercepte) { rendre(route); return; }

      var verdict = routeur.decisionRetour(route, { gardes: gardes() });
      if (verdict.action === 'garde' || (verdict.action === 'confirmer' && pile === 0)) {
        poserAncre();
        demander(verdict.garde, confirmer, refuser);
        return;
      }
      rendre(route);
    }

    return {
      surRetour: surRetour,
      apresNavigation: apresNavigation,
      // Lecture seule, pour l'inspection et les tests. Les tests jugent malgré
      // tout sur les effets observables, pas sur ce drapeau.
      etat: function () {
        return { pile: pile, intercepte: intercepte, ancree: ancreEnPlace() };
      }
    };
  }

  var api = { creer: creer };

  racine.THSortie = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
