// v2/js/cache.js — magasin local des données, sur IndexedDB.
//
// Pourquoi IndexedDB et pas localStorage. Mesuré sur le plus gros compte :
// 28 103 séries pèsent 15 Mo, les 1 221 séances 545 Ko. localStorage plafonne
// autour de 5 Mo, ne stocke que des chaînes — il faudrait sérialiser tout le
// corpus en un seul JSON, le reparser à chaque ouverture et le réécrire en
// entier à chaque synchronisation — et le v1 a déjà heurté ce mur (« plafond
// localStorage ~2700 séances », CLAUDE.md). IndexedDB écrit enregistrement par
// enregistrement, s'interroge par index, et son quota se compte en centaines
// de mégaoctets.
//
// Ce n'est pas un cache de requêtes : le service worker n'a rien à voir ici et
// ne met AUCUNE réponse Supabase en cache. Celui-ci est explicite, interrogeable,
// et on sait toujours ce qu'il contient.

(function (racine) {
  'use strict';

  var NOM = 'trainhub-v2';
  var VERSION = 1;
  var MAGASINS = ['seances', 'series', 'exercices', 'meta'];
  var LOT = 500;
  var _db = null;

  function ouvrir() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resoudre, rejeter) {
      if (!racine.indexedDB) return rejeter(new Error('IndexedDB indisponible'));
      var req = racine.indexedDB.open(NOM, VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('seances')) {
          db.createObjectStore('seances', { keyPath: 'id' }).createIndex('debut', 'debut');
        }
        if (!db.objectStoreNames.contains('series')) {
          db.createObjectStore('series', { keyPath: 'id' }).createIndex('session_id', 'session_id');
        }
        if (!db.objectStoreNames.contains('exercices')) db.createObjectStore('exercices', { keyPath: 'slug' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'cle' });
      };
      req.onsuccess = function () { _db = req.result; resoudre(_db); };
      req.onerror = function () { rejeter(req.error); };
    });
  }

  function transaction(magasins, mode) {
    return ouvrir().then(function (db) { return db.transaction(magasins, mode); });
  }

  function finDe(tx) {
    return new Promise(function (resoudre, rejeter) {
      tx.oncomplete = function () { resoudre(); };
      tx.onerror = function () { rejeter(tx.error); };
      tx.onabort = function () { rejeter(tx.error); };
    });
  }

  function lireTout(magasin) {
    return transaction([magasin], 'readonly').then(function (tx) {
      return new Promise(function (resoudre, rejeter) {
        var req = tx.objectStore(magasin).getAll();
        req.onsuccess = function () { resoudre(req.result || []); };
        req.onerror = function () { rejeter(req.error); };
      });
    });
  }

  // Écriture par lots : 28 000 put() dans une transaction unique tiennent la
  // route, mais les découper garde l'interface réactive pendant la première
  // synchronisation, qui est la seule vraiment volumineuse.
  function ecrireLot(magasin, enregistrements) {
    var liste = enregistrements || [];
    if (!liste.length) return Promise.resolve();
    var tranches = [];
    for (var i = 0; i < liste.length; i += LOT) tranches.push(liste.slice(i, i + LOT));
    return tranches.reduce(function (chaine, tranche) {
      return chaine.then(function () {
        return transaction([magasin], 'readwrite').then(function (tx) {
          var st = tx.objectStore(magasin);
          tranche.forEach(function (e) { st.put(e); });
          return finDe(tx);
        });
      });
    }, Promise.resolve());
  }

  function remplacerTout(magasin, enregistrements) {
    return transaction([magasin], 'readwrite').then(function (tx) {
      tx.objectStore(magasin).clear();
      return finDe(tx);
    }).then(function () { return ecrireLot(magasin, enregistrements); });
  }

  function lireMeta(cle) {
    return transaction(['meta'], 'readonly').then(function (tx) {
      return new Promise(function (resoudre, rejeter) {
        var req = tx.objectStore('meta').get(cle);
        req.onsuccess = function () { resoudre(req.result ? req.result.valeur : null); };
        req.onerror = function () { rejeter(req.error); };
      });
    });
  }

  function ecrireMeta(cle, valeur) {
    return transaction(['meta'], 'readwrite').then(function (tx) {
      tx.objectStore('meta').put({ cle: cle, valeur: valeur });
      return finDe(tx);
    });
  }

  // Purge totale. Appelée à la déconnexion et dès qu'un autre compte se
  // présente : le cloisonnement local doit valoir celui du RLS.
  function viderTout() {
    return transaction(MAGASINS, 'readwrite').then(function (tx) {
      MAGASINS.forEach(function (m) { tx.objectStore(m).clear(); });
      return finDe(tx);
    });
  }

  racine.THCache = {
    ouvrir: ouvrir,
    lireTout: lireTout,
    ecrireLot: ecrireLot,
    remplacerTout: remplacerTout,
    lireMeta: lireMeta,
    ecrireMeta: ecrireMeta,
    viderTout: viderTout
  };
})(typeof self !== 'undefined' ? self : this);
