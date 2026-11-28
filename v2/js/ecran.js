// v2/js/ecran.js — « L'écran reste allumé en séance » (décision du 26/11/2026). MODULE PUR : il ne lit ni le stockage ni l'état de l'app ;
// l'appelant lui dit si une séance est en cours (`synchroniser(enSeance)`) et si le réglage est allumé (`actif()`).
// On empêche seulement la mise en veille automatique (`navigator.wakeLock.request('screen')`) : le bouton de verrouillage verrouille toujours.
// Le navigateur relâche le verrou quand la page devient invisible : on le reprend à `visibilitychange`, si la séance dure encore.
// API absente ou demande refusée : on ne dit rien (aucune écriture, aucun message).
(function (racine) {
  'use strict';

  function creer(options) {
    var nav = options && options.navigateur;
    var doc = options && options.document;
    var actif = (options && options.actif) || function () { return true; };
    var enSeance = false;
    var verrou = null;      // le « sentinel » tenu, s'il y en a un
    var enCours = false;    // une demande est en vol

    function voulu() {
      var oui = false;
      try { oui = enSeance && !!actif(); } catch (e) { oui = false; }
      return oui;
    }
    function relacher() {
      var v = verrou;
      verrou = null;
      if (!v) return;
      try { var p = v.release(); if (p && typeof p.catch === 'function') p.catch(function () {}); } catch (e) { /* rien à dire */ }
    }
    function demander() {
      if (verrou || enCours) return;
      if (!nav || !nav.wakeLock || typeof nav.wakeLock.request !== 'function') return;
      if (doc && doc.visibilityState && doc.visibilityState !== 'visible') return;
      enCours = true;
      var p;
      try { p = nav.wakeLock.request('screen'); } catch (e) { enCours = false; return; }
      Promise.resolve(p).then(function (v) {
        enCours = false;
        if (!v) return;
        if (!voulu()) { try { var r = v.release(); if (r && typeof r.catch === 'function') r.catch(function () {}); } catch (e) { /* rien */ } return; }
        verrou = v;
        try { if (v.addEventListener) v.addEventListener('release', function () { if (verrou === v) verrou = null; }); } catch (e) { /* rien */ }
      }, function () { enCours = false; });
    }
    function synchroniser(dedans) {
      enSeance = !!dedans;
      if (voulu()) demander(); else relacher();
    }
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', function () {
        if (doc.visibilityState === 'visible' && voulu()) demander();
      });
    }
    return { synchroniser: synchroniser, tenu: function () { return !!verrou; } };
  }

  var api = { creer: creer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  racine.THEcran = api;
})(typeof self !== 'undefined' ? self : globalThis);
