// v2/js/sortie.js — ce que fait le bouton retour, et ce qu'il ne fait plus.
//
// DÉCISION PRODUIT : au fond de la pile, le retour ne fait RIEN. Pas de
// question, pas de fermeture, pas de double appui. L'app se ferme par le geste
// système — balayage, sélecteur d'applications — comme beaucoup d'apps Android.
//
// Pourquoi la question a disparu : aucune page web ne peut se fermer par
// script. « Quitter » promettait une fermeture immédiate et ne pouvait livrer
// qu'un « appuyez à nouveau » — correct techniquement, déroutant à l'usage : on
// a répondu, et il ne se passe rien. Un seul comportement vaut mieux qu'un
// enchaînement à deux temps ; et l'app ne se ferme jamais par accident, ce qui
// devient critique le jour où il y aura une séance en cours à perdre.
//
// L'ANCRE est conservée — c'est elle qui absorbe le retour. Une entrée
// d'historique de même URL, invisible, posée dès que l'app n'a plus rien
// empilé en dessous, QUELLE QUE SOIT la vue et quelle que soit la façon dont
// on y est arrivé : ouverture directe sur /semaine/… comprise. Elle est
// réinstallée après chaque retour absorbé.
//
// CE QUI A DISPARU : la boîte de confirmation, la levée d'interception, et le
// `back` qui rendait l'ancre au système. Et, du chantier précédent, le
// `history.go(-(profondeur + 2))` qui reculait AU-DELÀ des entrées de l'app —
// c'est lui qui provoquait le redémarrage à froid observé sur device.
//
// History est INJECTÉ, pas capté : c'est ce qui rend le mécanisme testable
// sans navigateur, et ce qui permet d'affirmer par un test qu'aucun recul ne
// dépasse jamais nos propres entrées.

(function (racine) {
  'use strict';

  function creer(deps) {
    var d = deps || {};
    var hist = d.history;                  // History, ou son double de test
    var routeur = d.routeur;               // THRouteur
    var chemin = d.chemin;                 // () -> chemin courant
    var etatHistorique = d.etatHistorique; // () -> history.state courant
    var gardes = d.gardes || function () { return []; };
    var rendre = d.rendre;                 // (route) -> void

    // Nos propres entrées de navigation empilées au-dessus de l'entrée de
    // lancement. L'ancre n'en fait pas partie : elle n'est pas une vue.
    var pile = 0;

    // Le chemin de la dernière navigation de l'app. Quand une garde refuse un
    // retour, l'entrée qu'on rend doit porter CE chemin, pas celui où le
    // système vient de nous déposer : sinon la fenêtre se ferme bien, mais
    // l'URL a glissé d'un cran et l'écran affiché ne correspond plus à
    // l'adresse. Dérive signalée au chantier 10 ; la garde a maintenant son
    // premier consommateur réel, donc elle se corrige ici.
    var cheminApp = null;

    function estAncre(e) { return !!(e && e.ancre === true); }
    function ancreEnPlace() { return estAncre(etatHistorique()); }

    function poserAncre() {
      if (ancreEnPlace()) return false;
      hist.pushState({ ancre: true }, '', chemin());
      return true;
    }

    // Le système vient de consommer une entrée et on refuse ce départ : on la
    // remplace. Inconditionnel, à la différence de poserAncre — ici il s'agit
    // de rendre la profondeur perdue, pas de garantir qu'une ancre existe.
    function remplacerEntreeConsommee(vers) {
      hist.pushState({ ancre: true }, '', vers || chemin());
    }

    // L'ancre n'a de sens qu'au fond de la pile. Au-dessus, le retour a où
    // revenir, et c'est exactement ce qu'on veut qu'il fasse.
    function maintenir() { if (pile === 0) poserAncre(); }

    function apresNavigation(empilee) {
      if (empilee) pile += 1;
      cheminApp = chemin();
      maintenir();
    }

    function surRetour() {
      // Une garde l'emporte sur tout le reste : elle absorbe le retour et
      // présente sa propre confirmation. Rien ne s'en sert encore.
      var garde = routeur.premiereGardeBloquante(gardes());
      if (garde) {
        remplacerEntreeConsommee(cheminApp);
        if (typeof garde.afficher === 'function') garde.afficher();
        return;
      }

      // On atterrit SUR l'ancre : un retour depuis une vue empilée au-dessus
      // d'elle. Elle est déjà en place sous nos pieds, il n'y a qu'à rendre.
      if (ancreEnPlace()) { pile = 0; rendre(routeur.analyser(chemin())); return; }

      // Au-dessus du fond : le retour navigue, normalement.
      if (pile > 0) { pile -= 1; rendre(routeur.analyser(chemin())); return; }

      // Fond de pile : absorbé. L'ancre est réinstallée et rien ne change à
      // l'écran — aucun rendu, l'URL n'a pas bougé, aucune boîte ne s'affiche.
      poserAncre();
    }

    return {
      surRetour: surRetour,
      apresNavigation: apresNavigation,
      etat: function () { return { pile: pile, ancree: ancreEnPlace() }; }
    };
  }

  var api = { creer: creer };

  racine.THSortie = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
