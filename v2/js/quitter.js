// v2/js/quitter.js — « Quitter » ne perd plus rien en silence (59-2).
//
// « Quitter » vide l'appareil : le cache, la file d'envoi, la session. Une
// séance saisie hors ligne et pas encore montée était donc PERDUE, sans un mot,
// alors que la feuille disait « Tes données restent en ligne ».
//
// L'enchaînement, désormais :
//   1. la file n'est pas vide, ou une réponse de profil n'est pas partie, et le
//      réseau est là → on l'envoie d'abord, par le même envoi que d'habitude
//      (la vidange, et le profil avec elle) ;
//   2. tout est parti → on quitte, sans rien demander ;
//   3. il reste quelque chose → une fenêtre dit combien de séances, et que les
//      quitter maintenant les perd. « Rester » ne touche à rien ; seul
//      « Quitter quand même » vide la file.
//
// Le PROFIL ne passe pas par la file (60-2c) : ses écritures sont locales d'abord,
// puis un envoi qui garde un drapeau levé tant qu'il n'est pas confirmé. « Quitter »
// ne voyait pas ce drapeau et perdait en silence une réponse de profil hors ligne.
// Il le compte maintenant avec « les autres changements » — la même phrase.
//
// Et ce que « Quitter » efface sur l'appareil : `effacerStockages` retire
// toutes les clés `th-v2…` (le stockage local et celui de la session).
//
// Pur, hors `quitter` qui reçoit ses gestes en argument : aucun accès au DOM,
// au réseau ni au cache ici — c'est ce qui le rend testable.

(function (racine) {
  'use strict';

  var PREFIXE = 'th-v2';

  function A() { return racine.THAttente; }

  // Ce qui attend encore : les SÉANCES distinctes (une séance, ses séries, le
  // journal de ses records), et tout le reste (un choix de zone, un mode, un
  // bloc, une routine, un pari, un lot du remplissage du journal — et une réponse
  // de profil pas encore envoyée, `profilEnAttente`, qui compte pour UN autre
  // changement). Le retour garde sa forme : `{ seances, autres }`.
  function enAttente(file, profilEnAttente) {
    var seances = {}, autres = 0;
    (file || []).forEach(function (e) {
      if (!e) return;
      if (e.table === A().SESSIONS || e.table === A().SETS) { seances[e.id] = true; return; }
      if (e.table === A().RECORDS && e.depend) { seances[e.depend] = true; return; }
      autres++;
    });
    if (profilEnAttente) autres++;
    return { seances: Object.keys(seances).length, autres: autres };
  }

  // Le texte de la fenêtre (la maquette du 07/10/2026, mot pour mot), ou `null`
  // quand rien n'attend : on quitte alors sans rien demander.
  function fenetreDeSortie(file, profilEnAttente) {
    var n = enAttente(file, profilEnAttente);
    if (n.seances === 1) {
      return { titre: '1 séance pas encore envoyée.', aide: 'Si tu quittes maintenant, elle est perdue.',
               rester: 'Rester', quitter: 'Quitter quand même' };
    }
    if (n.seances > 1) {
      return { titre: n.seances + ' séances pas encore envoyées.', aide: 'Si tu quittes maintenant, elles sont perdues.',
               rester: 'Rester', quitter: 'Quitter quand même' };
    }
    // Aucune séance, mais autre chose : un choix fait hors ligne (une zone, un
    // mode, une routine…). La maquette ne le prévoit pas ; on le dit sans
    // inventer de nombre.
    if (n.autres > 0) {
      return { titre: 'Des changements pas encore envoyés.', aide: 'Si tu quittes maintenant, ils sont perdus.',
               rester: 'Rester', quitter: 'Quitter quand même' };
    }
    return null;
  }

  // L'ENCHAÎNEMENT. `d` porte les gestes de l'app :
  //   file()       → la file telle qu'elle est maintenant ;
  //   profil()     → (facultatif) une réponse de profil n'est-elle pas encore partie ? ;
  //   enLigne()    → le réseau est-il là ? ;
  //   envoyer()    → la vidange habituelle (et l'envoi du profil), attendue jusqu'au bout ;
  //   fenetre(vue) → montre la fenêtre, rend 'rester' ou 'quitter' ;
  //   deconnecter()→ vide l'appareil et ferme la session.
  // Rend 'quitte' ou 'reste'.
  async function quitter(d) {
    // Le profil se relit APRÈS l'envoi : `envoyer` ne lève pas quand l'envoi du profil échoue
    // (il garde son drapeau levé) — c'est le drapeau qui dit ce qui est vraiment parti.
    var profil = function () { return typeof d.profil === 'function' && !!d.profil(); };
    if (((d.file() || []).length || profil()) && d.enLigne()) {
      try { await d.envoyer(); } catch (e) { /* ce qui n'est pas parti reste en attente : la fenêtre le dira */ }
    }
    var vue = fenetreDeSortie(d.file(), profil());
    if (!vue) { await d.deconnecter(); return 'quitte'; }
    var choix = await d.fenetre(vue);
    if (choix !== 'quitter') return 'reste';
    await d.deconnecter();
    return 'quitte';
  }

  // Retire toutes les clés `th-v2…` de chaque stockage donné. Rend la liste
  // des clés retirées. Un stockage illisible (mode privé, bloqué) est sauté.
  function effacerStockages(stockages) {
    var retirees = [];
    (stockages || []).forEach(function (st) {
      if (!st) return;
      try {
        var cles = [];
        for (var i = 0; i < st.length; i++) {
          var k = st.key(i);
          if (k && k.indexOf(PREFIXE) === 0) cles.push(k);
        }
        cles.forEach(function (k) { st.removeItem(k); retirees.push(k); });
      } catch (e) { /* stockage fermé : rien à retirer */ }
    });
    return retirees;
  }

  var api = {
    PREFIXE: PREFIXE,
    enAttente: enAttente,
    fenetreDeSortie: fenetreDeSortie,
    quitter: quitter,
    effacerStockages: effacerStockages
  };
  racine.THQuitter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
