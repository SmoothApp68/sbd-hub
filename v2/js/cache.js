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
  // VERSION 2 : ajout du magasin `pesees`.
  // VERSION 3 : ajout de `brouillon` (la séance en cours) et `attente` (la file
  //   d'écriture). La montée de version est la seule façon de créer un magasin —
  //   et elle est sans perte, les magasins existants ne sont pas touchés.
  // VERSION 4 : ajout de `zones` (les corrections de zone, §9.1.1).
  // VERSION 5 : ajout de `predictions` (§9.11).
  // VERSION 6 : ajout de `modes` (le mode de chaque exercice, §9.17 — Progresser
  //   ou Entretenir ; `modes_exercice` en base). Sans perte, comme les autres.
  // VERSION 7 : ajout de `records` (le journal des records, 58-2 ; MOTEUR
  //   §9.23, `v2_061`). Sans perte, comme les autres.
  // VERSION 8 : ajout de `alias` (les noms alternatifs communs, `exercise_alias`,
  //   126 — la recherche d'exercice les cherche hors ligne). Sans perte : un
  //   cache d'avant s'ouvre, le magasin naît vide et se remplit à la
  //   synchronisation suivante.
  var VERSION = 8;
  // ⚠️ C'EST CETTE LISTE QUE « QUITTER » VIDE (`viderTout`) : un magasin qui
  // n'y est pas survit à la déconnexion et se relit sous le compte suivant.
  // `records` (58-2) y est ; `predictions` y manquait (relevé de sécurité 59-0)
  // et y est depuis 59-2. Tout magasin créé plus bas doit y figurer — le test
  // `v2-cache-integrite` le vérifie, magasin par magasin.
  var MAGASINS = ['seances', 'series', 'exercices', 'pesees', 'meta', 'zones', 'modes',
                  'brouillon', 'attente', 'records', 'predictions', 'alias'];
  var LOT = 500;
  var _db = null;
  // ⚠️ 117 (audit du 16/10, 06 #7) — UNE AUTRE PAGE QUI GARDE L'ANCIENNE VERSION OUVERTE.
  //
  // Le jour où `VERSION` monte, une page restée ouverte avec l'ancienne (un second onglet, une page en arrière-plan)
  // garde sa connexion : l'ouverture de la nouvelle passe en `blocked` et ATTEND sans fin — `entrerVraiment`
  // attendait avec elle, et l'app ne posait aucun écran. Deux gestionnaires :
  //   · `onversionchange` sur CHAQUE connexion ouverte ici : une autre page demande une version plus haute (ou la
  //     trappe `/__sw-off` efface la base) → on ferme la nôtre, tout de suite. Une page à jour ne bloque donc plus
  //     personne ; la suivante rouvrira si elle en a besoin.
  //   · `onblocked` : passé `DELAI_BLOQUE_MS`, l'ouverture est REJETÉE (les `try/catch` de l'app prennent le
  //     relais : elle démarre sur le réseau et le DIT, `estBloquee`), et la base locale reste HORS SERVICE pour
  //     cette page — une connexion qui arriverait après coup est refermée : une page qui a démarré sans son cache
  //     n'y écrit pas plus tard sans que son propriétaire ait été vérifié.
  var DELAI_BLOQUE_MS = 3000;
  var _ouverture = null;
  var _horsService = null;

  function ouvrir() {
    if (_db) return Promise.resolve(_db);
    if (_horsService) return Promise.reject(_horsService);
    if (_ouverture) return _ouverture;
    _ouverture = new Promise(function (resoudre, rejeter) {
      if (!racine.indexedDB) { _ouverture = null; return rejeter(new Error('IndexedDB indisponible')); }
      var req = racine.indexedDB.open(NOM, VERSION);
      var minuteur = null, abandonnee = false;
      req.onblocked = function () {
        if (minuteur || abandonnee) return;
        minuteur = setTimeout(function () {
          abandonnee = true;
          _horsService = new Error('Base locale bloquée par une autre page de l’app restée ouverte');
          _horsService.code = 'IDB_BLOQUEE';
          _ouverture = null;
          rejeter(_horsService);
        }, DELAI_BLOQUE_MS);
      };
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('seances')) {
          db.createObjectStore('seances', { keyPath: 'id' }).createIndex('debut', 'debut');
        }
        if (!db.objectStoreNames.contains('series')) {
          db.createObjectStore('series', { keyPath: 'id' }).createIndex('session_id', 'session_id');
        }
        if (!db.objectStoreNames.contains('exercices')) db.createObjectStore('exercices', { keyPath: 'slug' });
        if (!db.objectStoreNames.contains('pesees')) db.createObjectStore('pesees', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'cle' });
        // La séance en cours. UN seul enregistrement, réécrit en entier à chaque
        // geste : une séance pèse quelques kilo-octets, et une écriture complète
        // dans une transaction unique ne peut pas laisser un état à moitié écrit.
        // C'est ce qui la fait survivre à une app tuée en pleine saisie.
        if (!db.objectStoreNames.contains('brouillon')) db.createObjectStore('brouillon', { keyPath: 'cle' });
        // La file d'écriture. Elle vit ICI et pas en mémoire : une séance saisie
        // hors ligne doit retrouver sa file au redémarrage, sinon elle ne
        // monterait jamais.
        if (!db.objectStoreNames.contains('attente')) db.createObjectStore('attente', { keyPath: 'cle' });
        // §9.1.1 — les corrections de zone. UN HISTORIQUE EN AJOUT SEUL : une
        // ligne par choix, la plus récente fait foi. Il grandit, il vient de
        // DEUX sources — l'appareil et le serveur — et les deux se fondent par
        // `id`, donc `ecrireLot` (un `put` par ligne) et jamais
        // `remplacerTout`, qui vide avant d'écrire.
        //
        // ⚠️ AUCUN CODE DE MIGRATION ICI, ET C'EST VOULU. Chaque magasin se
        // crée s'il manque : une montée depuis la version 1, 2 ou 3 passe par
        // ce même bloc et ne touche à aucun magasin existant. Les séances, les
        // séries, le profil et la file traversent la montée intacts — c'est ce
        // que `tests/unit/v2-cache-montee.test.js` prouve.
        if (!db.objectStoreNames.contains('zones')) {
          db.createObjectStore('zones', { keyPath: 'id' }).createIndex('exercise_slug', 'exercise_slug');
        }
        // §9.17 (50-1) — le mode de chaque exercice : le MÊME patron que les
        // zones, pour la même raison — un historique en ajout seul, de deux
        // sources (l'appareil et le serveur), fondu par `id`. Le choix se fait
        // en salle, sans réseau : il vit ici d'abord.
        if (!db.objectStoreNames.contains('modes')) {
          db.createObjectStore('modes', { keyPath: 'id' }).createIndex('exercise_slug', 'exercise_slug');
        }
        // §9.11 (48c) — LES PRÉDICTIONS, sur l'appareil aussi. Elles y sont
        // pour deux raisons, et la seconde n'est pas du confort : elles disent
        // ce qui a DÉJÀ été noté — fermer l'app au milieu d'une séance et la
        // rouvrir ne doit pas réécrire la consigne qu'on a lue —, et c'est en
        // elles que l'observation retrouve la ligne à compléter.
        if (!db.objectStoreNames.contains('predictions')) {
          // La ligne stockée est CELLE QUI PART EN BASE, sans un champ de
          // plus : un champ local voyagerait et la base le refuserait (42703,
          // code définitif). L'index lit donc dans le fondement.
          db.createObjectStore('predictions', { keyPath: 'id' })
            .createIndex('seance', 'fondement.seance');
        }
        // 58-2 — LE JOURNAL DES RECORDS. La clé est celle de l'unicité en base,
        // (`set_id`, `type`) — pas `id` : une ligne écrite ici à « Terminer »
        // n'a pas encore d'identifiant (la base le tire), et la même ligne
        // revenue du serveur doit tomber sur elle, pas à côté.
        if (!db.objectStoreNames.contains('records')) {
          db.createObjectStore('records', { keyPath: ['set_id', 'type'] })
            .createIndex('session_id', 'session_id');
        }
        // 126 — LES NOMS ALTERNATIFS COMMUNS (`exercise_alias`), la clé de la base (`alias`, le nom tel quel). Partagés
        // comme le catalogue, rafraîchis en entier comme lui (`remplacerTout`).
        if (!db.objectStoreNames.contains('alias')) db.createObjectStore('alias', { keyPath: 'alias' });
      };
      req.onsuccess = function () {
        if (minuteur) clearTimeout(minuteur);
        var db = req.result;
        if (abandonnee) { try { db.close(); } catch (e) { /* déjà fermée */ } return; }
        db.onversionchange = function () {
          try { db.close(); } catch (e) { /* déjà fermée */ }
          if (_db === db) _db = null;
        };
        _db = db;
        _ouverture = null;
        resoudre(db);
      };
      req.onerror = function () {
        if (minuteur) clearTimeout(minuteur);
        _ouverture = null;
        rejeter(req.error);
      };
    });
    return _ouverture;
  }

  function estBloquee() { return !!_horsService; }

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

  // Vider PUIS écrire, dans UNE SEULE transaction. IndexedDB est atomique par
  // transaction : tout passe, ou rien ne passe. L'ancienne version vidait dans
  // une transaction et réécrivait dans 57 autres — une fermeture pendant ces
  // quelques secondes laissait le magasin à moitié plein, définitivement.
  // Réservé aux magasins PETITS et rafraîchis en entier : 1 221 séances,
  // 237 exercices. Les 28 103 séries ne passent pas par ici.
  function remplacerTout(magasin, enregistrements) {
    var liste = enregistrements || [];
    return transaction([magasin], 'readwrite').then(function (tx) {
      var st = tx.objectStore(magasin);
      st.clear();
      liste.forEach(function (e) { st.put(e); });
      return finDe(tx);
    });
  }

  // Supprime des enregistrements par clé, par lots. C'est ce qui remplace le
  // `clear()` sur les séries : on retire ce qui doit l'être, on ne fait pas
  // table rase en espérant réécrire à temps.
  function supprimer(magasin, cles) {
    var liste = cles || [];
    if (!liste.length) return Promise.resolve();
    var tranches = [];
    for (var i = 0; i < liste.length; i += LOT) tranches.push(liste.slice(i, i + LOT));
    return tranches.reduce(function (chaine, tranche) {
      return chaine.then(function () {
        return transaction([magasin], 'readwrite').then(function (tx) {
          var st = tx.objectStore(magasin);
          tranche.forEach(function (c) { st.delete(c); });
          return finDe(tx);
        });
      });
    }, Promise.resolve());
  }

  // Le compte RÉELLEMENT persisté. Une variable en mémoire ne prouve rien sur
  // ce qui a atteint le disque — et c'est exactement la différence entre
  // constater et autoriser.
  function compterMagasin(magasin) {
    return transaction([magasin], 'readonly').then(function (tx) {
      return new Promise(function (resoudre, rejeter) {
        var req = tx.objectStore(magasin).count();
        req.onsuccess = function () { resoudre(req.result || 0); };
        req.onerror = function () { rejeter(req.error); };
      });
    });
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

  // ⚠️ 117 (audit du 16/10, 06 #6) — UN AUTRE COMPTE ENTRE : tout est vidé, SAUF la file du compte qui part, gardée
  // sous son identifiant (`THAttente.changerDeCompte`) ; et la file gardée pour le compte qui entre lui est rendue.
  // UNE transaction : lire les files gardées et la file en cours, vider, réécrire — une fermeture au milieu ne
  // peut pas perdre la file (tout passe, ou rien). Rend `{ rendue, gardees }`. « Quitter » (`viderTout`) vide tout,
  // les files gardées comprises, après sa fenêtre qui les compte.
  //
  // ⚠️ 118 — ET CE QUI ATTEND HORS DE LA FILE (`autres` : `[{ magasin, cle }]`, dans `meta` ou `brouillon` — la
  // réponse de profil, les messages du groupe), par la même transaction : lu, gardé sous l'identifiant du compte qui
  // part (`THAttente.changerDeCompteAutres`), rendu à sa place quand il revient. `preparer(valeurs)` (facultatif)
  // choisit ce qui se garde, `{ 'magasin:cle': valeur }`. Rend aussi `rendues`.
  var CLE_FILES_GARDEES = 'files-gardees';
  var CLE_GARDES_AUTRES = 'gardes-du-compte';
  function changerDeCompte(ancienUid, nouveauUid, autres, preparer) {
    var liste = (autres || []).filter(function (x) { return x && MAGASINS.indexOf(x.magasin) >= 0 && x.cle; });
    return transaction(MAGASINS, 'readwrite').then(function (tx) {
      var issue = { rendue: [], gardees: {}, rendues: {} };
      var b = tx.objectStore('brouillon'), a = tx.objectStore('attente');
      var lu = b.get(CLE_FILES_GARDEES);
      lu.onsuccess = function () {
        var gardees = lu.result ? lu.result.valeur : null;
        var luAutres = b.get(CLE_GARDES_AUTRES);
        luAutres.onsuccess = function () {
          var gardesAutres = luAutres.result ? luAutres.result.valeur : null;
          var valeurs = {}, reste = liste.length;
          var suite = function () {
            var file = a.getAll();
            file.onsuccess = function () {
              var calc = racine.THAttente.changerDeCompte(gardees, ancienUid, file.result || [], nouveauUid);
              var aGarder = typeof preparer === 'function' ? preparer(valeurs) : valeurs;
              var calcAutres = racine.THAttente.changerDeCompteAutres(gardesAutres, ancienUid, aGarder, nouveauUid);
              MAGASINS.forEach(function (m) { tx.objectStore(m).clear(); });
              if (Object.keys(calc.gardees).length) b.put({ cle: CLE_FILES_GARDEES, valeur: calc.gardees });
              if (Object.keys(calcAutres.gardes).length) b.put({ cle: CLE_GARDES_AUTRES, valeur: calcAutres.gardes });
              calc.rendue.forEach(function (e) { a.put(e); });
              Object.keys(calcAutres.rendues).forEach(function (k) {
                var i = k.indexOf(':'), m = k.slice(0, i);
                if (MAGASINS.indexOf(m) >= 0) tx.objectStore(m).put({ cle: k.slice(i + 1), valeur: calcAutres.rendues[k] });
              });
              issue = { rendue: calc.rendue, gardees: calc.gardees, rendues: calcAutres.rendues };
            };
          };
          if (!reste) return suite();
          liste.forEach(function (x) {
            var r = tx.objectStore(x.magasin).get(x.cle);
            r.onsuccess = function () {
              valeurs[x.magasin + ':' + x.cle] = r.result ? r.result.valeur : null;
              if (--reste === 0) suite();
            };
          });
        };
      };
      return finDe(tx).then(function () { return issue; });
    });
  }

  function lireFilesGardees() {
    return lireBrouillon(CLE_FILES_GARDEES).then(function (v) { return v || {}; });
  }
  // 118 — ce qui attend hors de la file, gardé pour d'autres comptes (`{ uid: { 'magasin:cle': valeur } }`).
  function lireGardesAutres() {
    return lireBrouillon(CLE_GARDES_AUTRES).then(function (v) { return v || {}; });
  }

  // ── Le brouillon et la file ─────────────────────────────────────────────
  //
  // Deux raccourcis sur les primitives ci-dessus, pour que l'appelant n'ait pas
  // à connaître la forme des enregistrements. `null` efface.
  function lireBrouillon(cle) {
    return transaction(['brouillon'], 'readonly').then(function (tx) {
      return new Promise(function (resoudre, rejeter) {
        var req = tx.objectStore('brouillon').get(cle);
        req.onsuccess = function () { resoudre(req.result ? req.result.valeur : null); };
        req.onerror = function () { rejeter(req.error); };
      });
    });
  }

  function ecrireBrouillon(cle, valeur) {
    return transaction(['brouillon'], 'readwrite').then(function (tx) {
      var st = tx.objectStore('brouillon');
      if (valeur === null || valeur === undefined) st.delete(cle);
      else st.put({ cle: cle, valeur: valeur });
      return finDe(tx);
    });
  }

  // La file entière, remplacée dans UNE transaction. Elle est minuscule
  // (quelques entrées), et l'atomicité vaut mieux qu'un diff : une file à
  // moitié écrite enverrait deux fois ou pas du tout.
  function lireAttente() { return lireTout('attente'); }
  function ecrireAttente(file) { return remplacerTout('attente', file || []); }

  racine.THCache = {
    ouvrir: ouvrir,
    lireBrouillon: lireBrouillon,
    ecrireBrouillon: ecrireBrouillon,
    lireAttente: lireAttente,
    ecrireAttente: ecrireAttente,
    lireTout: lireTout,
    ecrireLot: ecrireLot,
    remplacerTout: remplacerTout,
    supprimer: supprimer,
    compterMagasin: compterMagasin,
    lireMeta: lireMeta,
    ecrireMeta: ecrireMeta,
    viderTout: viderTout,
    changerDeCompte: changerDeCompte,
    lireFilesGardees: lireFilesGardees,
    lireGardesAutres: lireGardesAutres,
    estBloquee: estBloquee,
    DELAI_BLOQUE_MS: DELAI_BLOQUE_MS
  };
})(typeof self !== 'undefined' ? self : globalThis);
