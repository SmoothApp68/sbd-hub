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
  function purgerSeriesOrphelines(series, seances) {
    var vivantes = new Set((seances || []).map(function (s) { return s && s.id; }));
    return (series || []).filter(function (s) { return s && vivantes.has(s.session_id); });
  }

  // État affiché à l'utilisateur. Jamais bloquant : dès qu'il y a quelque chose
  // à montrer, on le montre, et l'état dit seulement d'où ça vient.
  function deciderEtat(situation) {
    var s = situation || {};
    if (s.syncOk) return { code: 'a-jour', libelle: 'À jour', local: false };
    if (s.aDesDonnees) return { code: 'local', libelle: 'Données locales', local: true };
    return { code: 'vide', libelle: 'Pas de réseau', local: false };
  }

  var api = {
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
