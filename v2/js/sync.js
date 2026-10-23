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
  // 4 — la liste des colonnes LUES s'est élargie (chantier 34) : `user_id`,
  //     `source`, `ressenti` et `repos_s` manquaient. Un cache existant porte
  //     des lignes SANS ces colonnes, et le curseur incrémental est déjà au
  //     maximum : sans cet incrément, elles ne redescendraient JAMAIS, et la
  //     première correction de séance les écrirait à null — c'est-à-dire le
  //     défaut qu'on vient de corriger, rejoué depuis le cache. Incrémenter
  //     REPARE les appareils existants sans qu'ils aient rien à faire.
  // 5 — la liste des colonnes LUES s'élargit encore (prompt 131, v2_101) : `denivele_m` et
  //     `etages`. Un cache existant porte des séries SANS ces colonnes ; une passe complète,
  //     une fois, les redescend — un D+ posé depuis un autre appareil avant la mise à jour
  //     ne resterait pas invisible derrière un curseur incrémental déjà au maximum.
  var VERSION_SYNC = 5;

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
  //
  // ⚠️ SAUF CE QUI N'EST PAS ENCORE MONTÉ. C'est la garde qui empêche la perte
  // la plus grave du projet.
  //
  // Une séance saisie hors ligne n'est pas sur le serveur — par définition. Sans
  // cette garde, la PREMIÈRE synchronisation réussie la remplacerait par la
  // liste du serveur, où elle ne figure pas, et la séance disparaîtrait de
  // l'écran alors qu'elle attend sagement dans la file. L'utilisateur verrait
  // son travail s'effacer au moment précis où le réseau revient.
  //
  // `conserver` est l'ensemble des identifiants encore en attente d'envoi. Ils
  // sont réinjectés depuis `existants` quand le serveur ne les connaît pas
  // encore. Un identifiant que le serveur RENVOIE n'est pas réinjecté : sa
  // version serveur fait foi, elle vient d'être écrite par nous.
  function remplacer(nouveautes, options) {
    var o = options || {};
    var liste = (nouveautes || []).slice();
    var conserver = o.conserver;
    if (!conserver) return liste;

    var vus = new Set(liste.map(function (e) { return e && e.id; }));
    (o.existants || []).forEach(function (e) {
      if (!e || !e.id) return;
      if (vus.has(e.id)) return;
      if (!conserver[e.id]) return;
      liste.push(e);
    });
    return liste;
  }

  // ══ UNE SÉANCE `en_cours` N'EST PAS UNE SÉANCE ═══════════════════════════
  //
  // Vérifié sur device au chantier 22 : pendant qu'une séance était en cours,
  // elle apparaissait PARTOUT comme une séance terminée — dans la liste, sur sa
  // carte, dans les totaux de la semaine, dans le relevé par muscle.
  //
  // Ce n'est pas cosmétique. Une séance en cours comptée dans les totaux fausse
  // le relevé par muscle, donc la règle de volume, donc — quand il parlera — le
  // moteur. Et elle le fausse PENDANT qu'on s'entraîne, c'est-à-dire au moment
  // exact où l'on regarde ces chiffres.
  //
  // L'écriture était juste : `statut = 'en_cours'` était bien posé. C'est la
  // LECTURE qui l'ignorait. C'est le piège n° 2 de `SCHEMA-REEL.md` : la valeur
  // est écrite, personne ne s'en sert.
  //
  // ⚠️ Le seul endroit qui veut l'inverse est la REPRISE de séance, et elle ne
  // passe pas par ici : elle lit le brouillon local, et `Donnees.seancesEnCours`
  // si un jour elle interroge le serveur.
  function terminees(seances) {
    return (seances || []).filter(function (s) {
      // Une séance sans statut vient d'un import : elle est terminée par
      // définition — les 1 221 séances importées portent toutes 'terminee'.
      return !s || !s.statut || s.statut === 'terminee';
    });
  }

  // Le corpus de lecture, dans son seul état valide : QUE des séances
  // terminées, de la plus récente à la plus ancienne.
  //
  // L'ordre était déjà une dette silencieuse : la pagination rend les séances
  // triées par `id`, un ordre qui n'a rien à voir avec le temps. Une
  // synchronisation réussie défaisait donc le tri du cache sans que rien ne
  // s'en plaigne.
  //
  // Filtre ET tri au même endroit, exprès : ce sont les deux moitiés d'un seul
  // invariant, et les séparer inviterait à n'en appeler qu'une.
  function ranger(seances) {
    return terminees(seances).sort(function (a, b) {
      return String(b && b.debut).localeCompare(String(a && a.debut));
    });
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
  // avec du surplus — qui se corrige à la synchronisation suivante, par le
  // rapprochement des séries (117, `rapprocherSeries`) — qu'un cache amputé, qui ne se répare jamais : l'incrémental ne revient pas
  // chercher des séries qu'il croit déjà passées.
  // Idem pour les séries : celles d'une séance encore en attente ne sont pas
  // orphelines, elles sont juste inconnues du serveur. La réinjection de la
  // séance ci-dessus suffit à les protéger — `vivantes` la contient alors — et
  // ce commentaire est là pour qu'on ne « simplifie » pas l'un sans l'autre.
  function purgerSeriesOrphelines(series, seances, listeComplete) {
    if (listeComplete !== true) return (series || []).slice();
    var vivantes = new Set((seances || []).map(function (s) { return s && s.id; }));
    return (series || []).filter(function (s) { return s && vivantes.has(s.session_id); });
  }

  // ══ 117 (audit du 16/10, 06 #1) — UNE SÉRIE EFFACÉE AILLEURS QUITTE AUSSI CE CACHE ════════════════════
  //
  // L'incrémental ne voit que les séries créées ou retouchées (`created_at`, `modifie_a`) : une série SUPPRIMÉE
  // sur un autre appareil — une correction de séance, qui retire une série (`remplacerSeries`) — ne redescend
  // jamais, et `purgerSeriesOrphelines` ne retire que les séries d'une séance disparue. Le coach, les records et le
  // volume comptaient donc à vie une série qui n'existe plus. Et le compte de contrôle ne le voyait pas : un cache
  // plus GRAND que le serveur passait pour complet.
  //
  // LE DÉTECTEUR, SANS RIEN RETÉLÉCHARGER : le compte. Hors de ce qui attend dans la file, le cache est le serveur
  // PLUS ce qui a été supprimé ailleurs — l'incrémental ramène tout le reste. Un SURPLUS (séries en cache, des
  // séances que le serveur rend, hors file d'envoi, moins le compte du serveur) est donc exactement le nombre de
  // séries effacées ailleurs. Zéro (le cas de tous les jours) : rien ne part sur le réseau.
  //
  // LE RAPPROCHEMENT, PAR SÉANCE : seulement quand il y a un surplus, on relit les seuls identifiants des séries
  // (`id`, `session_id`) des séances, PAR LOTS, de la plus récente à la plus ancienne — une correction porte presque
  // toujours sur une séance récente —, et on s'arrête dès que le surplus est résorbé. Un lot de 50 séances pèse
  // ~100 Ko ; tout l'historique (≈ 29 000 séries), ~2,6 Mo au pire, une fois, et seulement après une suppression
  // ailleurs. Jamais les 15 Mo d'une passe complète.
  //
  // ⚠️ CE QUI ATTEND DANS LA FILE N'EST JAMAIS RETIRÉ : une série locale pas encore envoyée n'est pas sur le
  // serveur, par définition. `protegees` (les séances qui ont une entrée dans la file) la garde, et ses séances ne
  // comptent pas dans le surplus.
  function seriesComptables(series, seancesServeur, protegees) {
    var connues = {};
    (seancesServeur || []).forEach(function (s) { if (s && s.id) connues[s.id] = true; });
    var p = protegees || {};
    return (series || []).filter(function (s) {
      return s && connues[s.session_id] && !p[s.session_id];
    });
  }

  // Le nombre de séries en trop dans le cache, d'après le compte du serveur. Un compte inconnu ne prouve rien : 0.
  function surplusDeSeries(series, seancesServeur, protegees, compteServeur) {
    if (typeof compteServeur !== 'number' || !isFinite(compteServeur) || compteServeur < 0) return 0;
    return seriesComptables(series, seancesServeur, protegees).length - compteServeur;
  }

  // Les identifiants des séances que le serveur rend, de la plus récente à la plus ancienne, par lots.
  var LOT_RAPPROCHEMENT = 50;
  function lotsDeRapprochement(seancesServeur, taille) {
    var t = taille || LOT_RAPPROCHEMENT;
    var ids = (seancesServeur || []).filter(function (s) { return s && s.id; })
      .slice().sort(function (a, b) { return String(b.debut).localeCompare(String(a.debut)); })
      .map(function (s) { return s.id; });
    var lots = [];
    for (var i = 0; i < ids.length; i += t) lots.push(ids.slice(i, i + t));
    return lots;
  }

  // Rapproche le cache du serveur POUR LES SÉANCES DU LOT : une série d'une de ces séances, absente de ce que le
  // serveur rend (`lignesServeur`, les séries de ces séances), et dont la séance n'attend rien dans la file, quitte
  // le cache. Rend `{ series, retirees }`.
  function rapprocherSeries(series, lignesServeur, lot, protegees) {
    var dansLot = {}, presentes = {};
    (lot || []).forEach(function (id) { dansLot[id] = true; });
    (lignesServeur || []).forEach(function (l) { if (l && l.id) presentes[l.id] = true; });
    var p = protegees || {};
    var retirees = [];
    var gardees = (series || []).filter(function (s) {
      if (!s || !dansLot[s.session_id] || p[s.session_id]) return true;
      if (presentes[s.id]) return true;
      retirees.push(s.id);
      return false;
    });
    return { series: gardees, retirees: retirees };
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

  // ══ LE JOURNAL DES RECORDS SUR L'APPAREIL (58-2, MOTEUR §9.23) ═══════════
  //
  // Le magasin local `records` est À L'IMAGE DE LA BASE, et la base a trois
  // règles : l'app AJOUTE en ignorant les doublons, une ligne ne se modifie
  // jamais, et une ligne disparaît avec sa série (cascade, ou correction). Ces
  // fonctions les rejouent sur la copie locale — rien d'autre.
  //
  // La clé est celle de l'unicité en base : (`set_id`, `type`).
  function cleJournal(l) { return l ? String(l.set_id) + '|' + String(l.type) : ''; }

  // L'AJOUT DE L'APP, comme `ON CONFLICT (set_id, type) DO NOTHING` : une ligne
  // déjà là reste telle quelle — même si celle qu'on ajoute dit autre chose —,
  // seule une ligne neuve entre. Rend `{ journal, ajoutees }`.
  function ajouterAuJournal(journal, lignes) {
    var vus = {};
    (journal || []).forEach(function (l) { if (l) vus[cleJournal(l)] = true; });
    var ajoutees = [];
    (lignes || []).forEach(function (l) {
      var k = cleJournal(l);
      if (!l || vus[k]) return;
      vus[k] = true;
      ajoutees.push(l);
    });
    return { journal: (journal || []).concat(ajoutees), ajoutees: ajoutees };
  }

  // CE QUE LE SERVEUR REND : sa ligne remplace la copie locale de même clé —
  // elle porte l'identifiant et la date d'écriture que la base a tirés.
  function fondreJournal(journal, duServeur) {
    return fusionner((journal || []).map(function (l) { return Object.assign({ _cle: cleJournal(l) }, l); }),
      (duServeur || []).map(function (l) { return Object.assign({ _cle: cleJournal(l) }, l); }), '_cle')
      .map(function (l) { var c = Object.assign({}, l); delete c._cle; return c; });
  }

  // ⚠️ À L'IMAGE DE `sets_efface_records` (v2_061) : une série corrigée sur
  // l'un des champs qui font un record — `type_serie`, `charge_kg`, `reps`,
  // `duree_s`, `distance_m`, comparés comme `IS DISTINCT FROM` — perd ses
  // lignes ; une série supprimée aussi (la cascade). Les autres lignes de la
  // séance RESTENT, même si on les recalculerait autrement aujourd'hui : en
  // base, l'ajout qui suit les ignorera (un record est un record à sa date).
  // `avant` : les séries de la séance telles qu'elles étaient ; `apres` :
  // telles qu'elles partent. Rend les identifiants des séries qui perdent
  // leurs lignes.
  var CHAMPS_DU_RECORD = ['type_serie', 'charge_kg', 'reps', 'duree_s', 'distance_m'];
  function distincts(a, b) {
    var va = (a === undefined || a === null) ? null : a;
    var vb = (b === undefined || b === null) ? null : b;
    if (va === null || vb === null) return va !== vb;
    if (typeof va === 'number' || typeof vb === 'number') return Number(va) !== Number(vb);
    return String(va) !== String(vb);
  }
  function seriesQuiEffacent(avant, apres) {
    var parId = {};
    (apres || []).forEach(function (s) { if (s && s.id) parId[s.id] = s; });
    var out = [];
    (avant || []).forEach(function (s) {
      if (!s || !s.id) return;
      var n = parId[s.id];
      if (!n || CHAMPS_DU_RECORD.some(function (c) { return distincts(s[c], n[c]); })) out.push(s.id);
    });
    return out;
  }

  // Retire du journal les lignes de ces séries.
  function retirerDuJournal(journal, idsSeries) {
    var partent = {};
    (idsSeries || []).forEach(function (id) { partent[id] = true; });
    return (journal || []).filter(function (l) { return l && !partent[l.set_id]; });
  }

  // La CASCADE vue d'ici : une ligne dont la série n'existe plus part avec
  // elle. Seulement quand la liste des séries est COMPLÈTE (la même condition
  // que `purgerSeriesOrphelines`) : sinon « absente » voudrait dire « pas
  // encore reçue ».
  function purgerJournal(journal, series, listeComplete) {
    if (listeComplete !== true) return (journal || []).slice();
    var vivantes = new Set((series || []).map(function (s) { return s && s.id; }));
    return (journal || []).filter(function (l) { return l && vivantes.has(l.set_id); });
  }

  var api = {
    VERSION_SYNC: VERSION_SYNC,
    cleJournal: cleJournal,
    ajouterAuJournal: ajouterAuJournal,
    fondreJournal: fondreJournal,
    CHAMPS_DU_RECORD: CHAMPS_DU_RECORD,
    seriesQuiEffacent: seriesQuiEffacent,
    retirerDuJournal: retirerDuJournal,
    purgerJournal: purgerJournal,
    doitResynchroniser: doitResynchroniser,
    verifierCompletude: verifierCompletude,
    decisionDeCommit: decisionDeCommit,
    cacheEstCourt: cacheEstCourt,
    doitReprendre: doitReprendre,
    cacheAppartientA: cacheAppartientA,
    fusionner: fusionner,
    remplacer: remplacer,
    terminees: terminees,
    ranger: ranger,
    curseurDe: curseurDe,
    purgerSeriesOrphelines: purgerSeriesOrphelines,
    seriesComptables: seriesComptables,
    surplusDeSeries: surplusDeSeries,
    LOT_RAPPROCHEMENT: LOT_RAPPROCHEMENT,
    lotsDeRapprochement: lotsDeRapprochement,
    rapprocherSeries: rapprocherSeries,
    deciderEtat: deciderEtat
  };

  racine.THSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
// `globalThis` plutôt que `this` : en module CommonJS et en mode strict, `this`
// vaut `undefined` au niveau du fichier, et le module ne s'exportait donc pas
// sous Jest en environnement node. Le motif est signalé fragile depuis le
// chantier 8 ; il est corrigé ICI parce que le chantier 22 doit tester la garde
// anti-effacement de `remplacer`. Les autres modules qui portent encore `this`
// sont signalés, pas touchés.
})(typeof self !== 'undefined' ? self : globalThis);
