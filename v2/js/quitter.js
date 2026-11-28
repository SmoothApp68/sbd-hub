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
  // 118 — `autresEnAttente` (un nombre) : ce qui attend hors de la file et hors du profil (les messages du groupe
  // écrits hors ligne, ce qui est gardé pour un autre compte) ; il compte avec les autres changements.
  function enAttente(file, profilEnAttente, autresEnAttente) {
    var seances = {}, autres = 0;
    (file || []).forEach(function (e) {
      if (!e) return;
      if (e.table === A().SESSIONS || e.table === A().SETS) { seances[e.id] = true; return; }
      if (e.table === A().RECORDS && e.depend) { seances[e.depend] = true; return; }
      autres++;
    });
    if (profilEnAttente) autres++;
    if (typeof autresEnAttente === 'number' && autresEnAttente > 0) autres += autresEnAttente;
    return { seances: Object.keys(seances).length, autres: autres };
  }

  // Le texte de la fenêtre (la maquette du 07/10/2026, mot pour mot), ou `null`
  // quand rien n'attend : on quitte alors sans rien demander.
  function fenetreDeSortie(file, profilEnAttente, autresEnAttente) {
    var n = enAttente(file, profilEnAttente, autresEnAttente);
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
    // 118 — `autres()` (facultatif) : un nombre, ce qui attend hors de la file et du profil.
    var autres = function () { var n = typeof d.autres === 'function' ? Number(d.autres()) : 0; return n > 0 ? n : 0; };
    if (((d.file() || []).length || profil() || autres()) && d.enLigne()) {
      try { await d.envoyer(); } catch (e) { /* ce qui n'est pas parti reste en attente : la fenêtre le dira */ }
    }
    var vue = fenetreDeSortie(d.file(), profil(), autres());
    if (!vue) { await d.deconnecter(); return 'quitte'; }
    var choix = await d.fenetre(vue);
    if (choix !== 'quitter') return 'reste';
    await d.deconnecter();
    return 'quitte';
  }

  // Retire toutes les clés `th-v2…` de chaque stockage donné. Rend la liste
  // des clés retirées. Un stockage illisible (mode privé, bloqué) est sauté.
  // P0 (28/11/2026) — et le sexe du dessin des muscles (`CLES_DU_COMPTE_HORS_PREFIXE`), qui est au compte.
  function effacerStockages(stockages) {
    return retirer(stockages, function (k) {
      return !!k && (k.indexOf(PREFIXE) === 0 || CLES_DU_COMPTE_HORS_PREFIXE.indexOf(k) >= 0);
    });
  }

  // ⚠️ P0 (28/11/2026, comptes étanches) — CE QUI, SUR L'APPAREIL, APPARTIENT AU COMPTE.
  //
  // Un autre compte qui entre sur le même téléphone (la session du premier s'est terminée sans « Quitter ») ne doit
  // hériter d'aucun réglage du premier : ses « Non merci » des chauffes (4 semaines sans chauffe), son « plus léger »
  // du jour, le son, la bascule effort, le jeu coupé, ses dossiers repliés, le texte des cartes vues… Le défaut est
  // donc l'EFFACEMENT : toute clé `th-v2…` part, sauf
  //   · celles de l'APPAREIL (`CLES_DE_L_APPAREIL`, par préfixe) : la session qui vient d'entrer (`th-v2-auth…`),
  //     le code de connexion en attente, la garde anti-boucle des mises à jour, « Plus tard » de l'installation sur
  //     iPhone, la garde de développement et le mode de démonstration de l'escalier ;
  //   · celles qui portent l'identifiant du compte dans leur nom (`PREFIXES_PAR_COMPTE`) : elles ne se lisent que
  //     pour leur compte, n'en pilotent jamais un autre, et les effacer ferait repartir de zéro celui qui revient
  //     (son décalage secret de poids retiré au sort, le questionnaire déjà vu).
  // Une clé ajoutée demain sans y penser est donc effacée au changement de compte : la fuite ne peut pas revenir par
  // oubli, seulement par une inscription consciente ici.
  // Et hors du préfixe : le sexe du dessin des muscles (`th-silhouette`) dit le corps de la personne, il est au compte ;
  // la version choisie d'une animation de mouvement (`th-mouvement-version-…`) est un affichage, elle reste.
  var CLES_DE_L_APPAREIL = ['th-v2-auth', 'th-v2-code-attente', 'th-v2-maj-auto', 'th-v2-installer-plus-tard',
                            'th-v2-garde', 'th-v2-escalier-demo'];
  var PREFIXES_PAR_COMPTE = ['th-v2-decalage-poids-', 'th-v2-niveau-annonce-', 'th-v2-questionnaire-vu-',
                             'th-v2-peu-de-temps-vu-', 'th-v2-pseudo-pris-', 'th-v2-origine-routine-',
                             'th-v2-annonce-bilan:', 'th-v2-annonce-annee:'];
  var CLES_DU_COMPTE_HORS_PREFIXE = ['th-silhouette'];

  function commencePar(k, prefixes) {
    return prefixes.some(function (p) { return k.indexOf(p) === 0; });
  }
  // La clé appartient-elle au compte (à effacer quand un autre entre) ?
  function cleDuCompte(k) {
    if (!k) return false;
    if (CLES_DU_COMPTE_HORS_PREFIXE.indexOf(k) >= 0) return true;
    if (k.indexOf(PREFIXE) !== 0) return false;
    return !commencePar(k, CLES_DE_L_APPAREIL) && !commencePar(k, PREFIXES_PAR_COMPTE);
  }

  // Retire, de chaque stockage donné, les clés du compte (`cleDuCompte`). Rend la liste des clés retirées.
  function effacerReglagesDuCompte(stockages) {
    return retirer(stockages, cleDuCompte);
  }

  function retirer(stockages, aRetirer) {
    var retirees = [];
    (stockages || []).forEach(function (st) {
      if (!st) return;
      try {
        var cles = [];
        for (var i = 0; i < st.length; i++) {
          var k = st.key(i);
          if (aRetirer(k)) cles.push(k);
        }
        cles.forEach(function (k) { st.removeItem(k); retirees.push(k); });
      } catch (e) { /* stockage fermé : rien à retirer */ }
    });
    return retirees;
  }

  var api = {
    PREFIXE: PREFIXE,
    CLES_DE_L_APPAREIL: CLES_DE_L_APPAREIL,
    PREFIXES_PAR_COMPTE: PREFIXES_PAR_COMPTE,
    CLES_DU_COMPTE_HORS_PREFIXE: CLES_DU_COMPTE_HORS_PREFIXE,
    cleDuCompte: cleDuCompte,
    effacerReglagesDuCompte: effacerReglagesDuCompte,
    enAttente: enAttente,
    fenetreDeSortie: fenetreDeSortie,
    quitter: quitter,
    effacerStockages: effacerStockages
  };
  racine.THQuitter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
