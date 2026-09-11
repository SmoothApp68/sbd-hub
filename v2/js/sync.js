// v2/js/sync.js — logique de synchronisation incrémentale.
//
// Module PUR : aucune dépendance au DOM, au réseau, à IndexedDB. C'est ici que
// vivent les décisions — quoi fusionner, jusqu'où retélécharger, à qui
// appartient le cache, quel état afficher — et c'est ce qui les rend testables.
//
// Stratégie, établie par lecture du schéma et mesure du volume réel :
//
//   sessions →  545 Ko pour 1 221 lignes, et AUCUNE colonne de modification.
//               Rafraîchissement COMPLET à chaque synchronisation. C'est peu
//               coûteux, ça capte les modifications de titre, note et salle —
//               qu'aucun horodatage ne signalerait — et ça capte les
//               suppressions, qu'un incrémental ne verrait jamais.
//
//   sets     →  15 Mo pour 28 103 lignes, soit 28 fois le poids des séances.
//               INCRÉMENTAL sur created_at et modifie_a. C'est le volume qu'on
//               ne veut retélécharger sous aucun prétexte.
//
// L'asymétrie n'est pas une commodité : elle vient du rapport 1:28 entre les
// deux tables et de l'absence de `sessions.modifie_a`.

(function (racine) {
  'use strict';

  // Version de la FORME de synchronisation — distincte de la version du store
  // IndexedDB, qui décrit la structure, alors que celle-ci décrit la confiance
  // qu'on accorde au contenu. On l'incrémente quand un défaut a pu laisser un
  // cache incomplet : les caches d'une version antérieure effacent leur curseur
  // et se resynchronisent UNE FOIS.
  //
  // 2 — pagination par curseur de clé. La version 1 paginait sur `created_at`,
  //     non unique, et perdait 8 003 séries sur 28 103.
  // 3 — le cache ne peut plus se figer amputé. La version 2 laissait une
  //     écriture interrompue définitive : curseur et marque déjà posés, la
  //     synchro suivante passait en incrémental et réécrivait le partiel.
  //     Incrémenter REPARE les appareils existants sans qu'ils aient rien à
  //     faire : leur marque vaut 2, ils reprennent une passe complète.
  var VERSION_SYNC = 3;

  // Un marqueur de version plutôt qu'un drapeau à usage unique : il est
  // idempotent, il survit aux rechargements, et le prochain défaut de ce genre
  // se traitera en incrémentant un chiffre au lieu d'inventer un mécanisme.
  function doitResynchroniser(meta, version) {
    var cible = typeof version === 'number' ? version : VERSION_SYNC;
    var v = meta && meta.version;
    return !(typeof v === 'number' && v >= cible);
  }

  // Ce qu'on a contre ce que le serveur annonce. Un compte injoignable ne
  // permet PAS de conclure à l'incomplétude : on ne crie pas dans le noir.
  // Le compte AUTORISE, il ne constate plus. Le curseur et la marque de forme
  // ne s'écrivent que si le magasin contient ce que le serveur annonce ; sinon
  // le curseur reste vide et la synchronisation suivante recommence au lieu de
  // se croire finie.
  //
  // Un compte serveur injoignable n'autorise ni n'interdit : on ne bloque pas
  // un appareil hors ligne sur 15 Mo à retélécharger à chaque ouverture, mais
  // on n'inscrit pas non plus d'attendu qu'on ne saurait pas justifier.
  function decisionDeCommit(enMagasin, compteServeur) {
    var c = verifierCompletude(enMagasin, compteServeur);
    return {
      autorise: !c.verifiable || c.complet,
      verifiable: c.verifiable,
      complet: c.complet,
      manquantes: c.manquantes,
      // On n'enregistre un attendu que sur une preuve.
      attendu: (c.verifiable && c.complet) ? compteServeur : null
    };
  }

  // Le filet : un magasin plus court que ce qu'on y a mis doit reprendre. Sans
  // attendu enregistré — un cache d'avant ce commit — on ne conclut rien, et
  // c'est l'incrément de VERSION_SYNC qui prend le relais.
  function cacheEstCourt(enMagasin, attendu) {
    var cible = attendu && attendu.series;
    if (typeof cible !== 'number' || !isFinite(cible) || cible < 0) return false;
    return (Number(enMagasin) || 0) < cible;
  }

  // La décision d'ouverture : faut-il repartir d'une passe complète ?
  function doitReprendre(marque, enMagasin, attendu) {
    return doitResynchroniser(marque) || cacheEstCourt(enMagasin, attendu);
  }

  function verifierCompletude(nLocal, nServeur) {
    if (typeof nServeur !== 'number' || !isFinite(nServeur) || nServeur < 0) {
      return { verifiable: false, complet: true, manquantes: 0 };
    }
    var manquantes = Math.max(0, nServeur - (Number(nLocal) || 0));
    return { verifiable: true, complet: manquantes === 0, manquantes: manquantes };
  }

  // Le cache appartient à un compte et à un seul. Un cache qui survivrait à un
  // changement de compte montrerait les séances de quelqu'un d'autre — la porte
  // même que le RLS ferme côté serveur.
  function cacheAppartientA(meta, userId) {
    if (!userId) return false;
    return !!meta && meta.userId === userId;
  }

  // Fusionne un lot de nouveautés dans un cache existant.
  // Même identifiant → la nouveauté remplace, elle ne s'ajoute pas.
  function fusionner(existants, nouveautes, cle) {
    var k = cle || 'id';
    var index = new Map();
    (existants || []).forEach(function (e) { if (e && e[k] != null) index.set(e[k], e); });
    (nouveautes || []).forEach(function (n) { if (n && n[k] != null) index.set(n[k], n); });
    return Array.from(index.values());
  }

  // Remplace intégralement une collection : ce qui n'est plus dans le lot a été
  // supprimé côté serveur. Réservé aux tables tirées en entier (sessions).
  function remplacer(nouveautes) {
    return (nouveautes || []).slice();
  }

  // Curseur de synchronisation : l'instant le plus récent qu'on ait vu passer.
  // On regarde plusieurs champs parce qu'une ligne modifiée porte `modifie_a`
  // alors qu'une ligne neuve ne porte que `created_at`.
  function curseurDe(enregistrements, champs) {
    var cols = champs || ['created_at', 'modifie_a'];
    var max = null;
    (enregistrements || []).forEach(function (e) {
      if (!e) return;
      cols.forEach(function (c) {
        var v = e[c];
        if (!v) return;
        if (max === null || String(v) > max) max = String(v);
      });
    });
    return max;
  }

  // Les séries d'une séance retirée du serveur n'ont plus de raison d'être.
  // C'est ce qui rattrape les suppressions côté `sets`, que l'incrémental ne
  // voit pas : quand la séance disparaît, ses séries partent avec elle.
  // `listeComplete` n'est pas une commodité : une liste de séances incertaine
  // ne prouve pas une absence. Si une tranche a échoué, ou si le compte annoncé
  // par le serveur ne correspond pas, on ne purge rien. Mieux vaut un cache
  // avec du surplus — qui se corrige à la synchronisation suivante — qu'un
  // cache amputé, qui ne se répare jamais : l'incrémental ne revient pas
  // chercher des séries qu'il croit déjà passées.
  function purgerSeriesOrphelines(series, seances, listeComplete) {
    if (listeComplete !== true) return (series || []).slice();
    var vivantes = new Set((seances || []).map(function (s) { return s && s.id; }));
    return (series || []).filter(function (s) { return s && vivantes.has(s.session_id); });
  }

  // État affiché à l'utilisateur. Jamais bloquant : dès qu'il y a quelque chose
  // à montrer, on le montre, et l'état dit seulement d'où ça vient.
  function deciderEtat(situation) {
    var s = situation || {};
    if (s.syncOk) {
      // Un écart se dit, il ne s'alarme pas : un fait, un chiffre, rien de plus.
      if (s.manquantes > 0) {
        return {
          code: 'partiel', local: false,
          libelle: s.manquantes + ' série' + (s.manquantes > 1 ? 's' : '') + ' manquante' +
                   (s.manquantes > 1 ? 's' : '')
        };
      }
      return { code: 'a-jour', libelle: 'À jour', local: false };
    }
    if (s.aDesDonnees) return { code: 'local', libelle: 'Données locales', local: true };
    return { code: 'vide', libelle: 'Pas de réseau', local: false };
  }

  var api = {
    VERSION_SYNC: VERSION_SYNC,
    doitResynchroniser: doitResynchroniser,
    verifierCompletude: verifierCompletude,
    decisionDeCommit: decisionDeCommit,
    cacheEstCourt: cacheEstCourt,
    doitReprendre: doitReprendre,
    cacheAppartientA: cacheAppartientA,
    fusionner: fusionner,
    remplacer: remplacer,
    curseurDe: curseurDe,
    purgerSeriesOrphelines: purgerSeriesOrphelines,
    deciderEtat: deciderEtat
  };

  racine.THSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
