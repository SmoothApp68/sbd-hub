// v2/js/attente.js — la file d'attente d'écriture. Module PUR.
//
// ══ LE PROBLÈME ════════════════════════════════════════════════════════════
//
// Une séance se fait en salle. Le réseau y est mauvais ou absent. L'app doit
// fonctionner entièrement sans lui — et ne RIEN perdre. Perdre une séance en
// cours est le pire défaut possible : pire qu'un écran cassé, pire qu'un calcul
// faux, parce que le travail est irrécupérable.
//
// ══ CE QUI REND ÇA FAISABLE ════════════════════════════════════════════════
//
// `sessions.id` et `sets.id` ont `gen_random_uuid()` EN DÉFAUT — relevé au
// schéma. L'app fabrique donc les identifiants elle-même, et l'envoi devient
// une réécriture IDEMPOTENTE : la même ligne envoyée deux fois écrase la même
// ligne. Pas de conflit à résoudre, pas d'identité provisoire à réconcilier.
//
// ══ LA FILE ════════════════════════════════════════════════════════════════
//
// Une liste d'INTENTIONS, pas de requêtes. Chaque entrée dit « cette entité
// doit finir dans cet état », jamais « fais cet appel ». C'est ce qui permet de
// la rejouer sans compter les tentatives, et de la COMPRESSER : dix
// modifications de la même série ne font qu'une entrée.
//
// L'ordre de pose est conservé (`seq`) et il porte les dépendances : la séance
// est posée avant ses séries, donc elle monte avant. La vidange s'arrête à la
// première erreur, ce qui préserve cet ordre plutôt que de le contourner.
//
// ══ DEUX OPÉRATIONS, ET C'EST TOUT ═════════════════════════════════════════
//
//   { table: 'sessions',          op: 'upsert' | 'supprimer', id }
//   { table: 'sets',              op: 'remplacer',            id: <id de séance> }
//   { table: 'routine_exercises', op: 'plan',                 id: <id de routine> }
//
// La troisième est arrivée au chantier 26, et pour une raison précise : la
// question de fin « met-on à jour la routine ? » (§6) se pose EN SALLE, là où
// le réseau n'est pas. Répondre « oui » et perdre la réponse parce que la
// requête directe a échoué serait la perte silencieuse qu'on interdit.
//
// ⚠️ ELLE PORTE LA LISTE VOULUE, PAS DES CHAMPS À MODIFIER (chantier 28). Une
// déviation de structure ajoute, retire et réordonne des lignes : ce n'est plus
// une mise à jour, c'est un ÉTAT CIBLE. Le plan d'écritures se recalcule à la
// VIDANGE, contre la routine telle qu'elle est alors — et c'est ce qui rend
// l'opération idempotente : rejouée, elle ne trouve plus rien à faire.
//
// `sets` porte TOUTES les séries validées de la séance, pas une série. Ce n'est
// pas un raccourci : `sets_rang_unique` est UNIQUE (session_id, rang)
// **DEFERRABLE INITIALLY DEFERRED**. Différée, elle tolère les collisions
// transitoires À L'INTÉRIEUR d'une transaction — donc un envoi en bloc permute
// des rangs sans heurt, là où N requêtes séparées, chacune sa transaction,
// échoueraient sur la première. Le lot est aussi idempotent par construction.

(function (racine) {
  'use strict';

  var SESSIONS = 'sessions', SETS = 'sets', ROUTINE_EXOS = 'routine_exercises';
  var UPSERT = 'upsert', SUPPRIMER = 'supprimer', REMPLACER = 'remplacer';
  var PLAN = 'plan';

  function cleDe(table, id) { return String(table) + ':' + String(id); }

  // Les codes Postgres qui ne passeront jamais, quel que soit le nombre de
  // tentatives : contrainte violée, RLS, colonne inconnue. Les réessayer en
  // boucle userait la batterie sans rien changer — et surtout, cacherait à
  // l'utilisateur que quelque chose ne montera pas.
  var CODES_DEFINITIFS = ['23502', '23503', '23505', '23514', '22P02', '42501', '42703'];

  function estDefinitive(erreur) {
    if (!erreur) return false;
    var code = String(erreur.code || '');
    if (CODES_DEFINITIFS.indexOf(code) >= 0) return true;
    var texte = String(erreur.message || '') + ' ' + String(erreur.details || '');
    if (/row-level security/i.test(texte)) return true;
    // Le réseau, lui, revient. Tout ce qui n'est pas nommé ci-dessus est
    // considéré comme temporaire : on préfère réessayer pour rien que
    // d'abandonner une séance.
    return false;
  }

  // ── Poser une intention ─────────────────────────────────────────────────
  //
  // Rend une NOUVELLE file — la file est une valeur, jamais mutée sur place.
  // C'est ce qui permet de la comparer, de la tester, et de n'écrire dans
  // IndexedDB que ce qui a changé.
  function poser(file, operation) {
    var liste = (file || []).slice();
    var op = operation || {};
    var cle = cleDe(op.table, op.id);
    var i = indexDe(liste, cle);

    if (op.op === SUPPRIMER) {
      // Supprimer ce qui n'est JAMAIS monté n'a pas à voyager : on retire
      // l'intention et le serveur n'en saura rien. C'est `creation` qui le dit —
      // une entité montée puis modifiée porte une intention sans ce drapeau, et
      // il faut alors bel et bien envoyer la suppression.
      if (i >= 0 && liste[i].creation) {
        liste.splice(i, 1);
        return liste;
      }
      if (i >= 0) {
        // ⚠️ `version` MONTE ICI AUSSI. Une suppression posée pendant qu'un
        // upsert de la même clé est en vol est exactement le cas de la perte
        // silencieuse décrite plus bas : sans l'incrément, le succès de
        // l'upsert emporterait l'intention de suppression, et la séance
        // resterait en base pour toujours. Une garde qui ne couvre qu'une
        // branche sur deux ne garde rien.
        liste[i] = Object.assign({}, liste[i], {
          op: SUPPRIMER, donnees: null,
          version: (liste[i].version || 1) + 1,
          bloquee: null, essais: 0
        });
        return liste;
      }
      return liste.concat([entree(cle, op, prochainSeq(liste))]);
    }

    if (i >= 0) {
      // Compression : la dernière intention gagne, la POSITION reste celle de
      // la première. Sans ça, modifier la séance après avoir validé des séries
      // ferait passer la séance APRÈS ses séries, et la clé étrangère casserait.
      //
      // ⚠️ `version` MONTE À CHAQUE POSE. C'est ce qui distingue « l'entrée que
      // je viens d'envoyer » de « l'entrée telle qu'elle est maintenant » —
      // voir `retirer`.
      liste[i] = Object.assign({}, liste[i], {
        op: op.op, donnees: op.donnees,
        creation: liste[i].creation || !!op.creation,
        version: (liste[i].version || 1) + 1,
        bloquee: null, essais: 0
      });
      return liste;
    }
    return liste.concat([entree(cle, op, prochainSeq(liste))]);
  }

  function entree(cle, op, seq) {
    return {
      cle: cle, seq: seq, table: op.table, op: op.op, id: op.id,
      donnees: op.donnees === undefined ? null : op.donnees,
      creation: !!op.creation, posee_a: op.posee_a || null,
      version: 1, essais: 0, bloquee: null
    };
  }

  function indexDe(liste, cle) {
    for (var i = 0; i < liste.length; i++) if (liste[i].cle === cle) return i;
    return -1;
  }

  function prochainSeq(liste) {
    var max = 0;
    liste.forEach(function (e) { if (e.seq > max) max = e.seq; });
    return max + 1;
  }

  function ordonnee(file) {
    return (file || []).slice().sort(function (a, b) { return a.seq - b.seq; });
  }

  // La prochaine à envoyer. Une entrée BLOQUÉE arrête la file : la sauter
  // casserait l'ordre des dépendances, et la masquer serait une perte
  // silencieuse. On s'arrête, et `deciderEtat` le dit.
  function prochaine(file) {
    var liste = ordonnee(file);
    return liste.length ? (liste[0].bloquee ? null : liste[0]) : null;
  }

  // ⚠️ ON NE RETIRE QUE CE QU'ON A VRAIMENT ENVOYÉ — PERTE SILENCIEUSE.
  //
  // Défaut trouvé au chantier 25, au banc d'écran, en tapant une durée chiffre
  // par chiffre. Le scénario, en quatre temps :
  //
  //   1. la vidange prend une COPIE de l'entrée (trois séries) et part sur le
  //      réseau ;
  //   2. pendant l'aller-retour, un geste pose la MÊME clé avec une intention
  //      plus récente (quatre séries) — la compression remplace le contenu ;
  //   3. la requête revient, réussie ;
  //   4. `retirer(cle)` jetait l'entrée ENTIÈRE, donc la quatrième série avec.
  //
  // Elle n'était pas perdue sur l'appareil — le brouillon la garde — mais elle
  // ne montait plus JAMAIS, et `#etat-sync` affichait « À jour ». Une perte
  // silencieuse, c'est-à-dire exactement ce que la file existe pour empêcher.
  //
  // Le défaut est antérieur à ce chantier : chaque frappe d'un champ pose une
  // intention, donc « 122,5 » ouvrait déjà la fenêtre cinq fois. Le banc ne le
  // voyait pas parce qu'il saisissait par `fill()`, qui pose la valeur d'un
  // bloc et n'émet qu'UN événement — personne ne tape comme ça.
  //
  // La garde : on ne retire que si l'entrée est restée CELLE QU'ON A ENVOYÉE.
  // Sinon on la laisse, et le tour suivant de la boucle l'envoie à son tour.
  function retirer(file, cle, version) {
    return (file || []).filter(function (e) {
      if (e.cle !== cle) return true;
      return version !== undefined && version !== null && (e.version || 1) !== version;
    });
  }

  // Marque l'échec SUR l'entrée, sans la retirer. Rien ne quitte la file sans
  // confirmation du serveur — c'est la règle du chantier 15 appliquée à
  // l'écriture : le compte autorise, il ne constate pas.
  function marquerEchec(file, cle, erreur) {
    return (file || []).map(function (e) {
      if (e.cle !== cle) return e;
      return Object.assign({}, e, {
        essais: (e.essais || 0) + 1,
        bloquee: estDefinitive(erreur)
          ? { code: (erreur && erreur.code) || '', message: (erreur && erreur.message) || '' }
          : null
      });
    });
  }

  // ⚠️ RÉPARER UNE FILE ÉCRITE PAR UNE VERSION FAUTIVE (chantier 33).
  //
  // L'APPAREIL NE SE RÉPARE PAS TOUT SEUL. Une file posée avant le correctif
  // porte des lignes sans identifiant ; le serveur les a refusées en 23502 —
  // code DÉFINITIF — donc l'entrée est `bloquee`, et `prochaine` s'arrêtant sur
  // une tête bloquée, TOUT ce qui attend derrière est arrêté avec elle : les
  // séries, et l'upsert `terminee` de la séance. Corriger le modèle n'y change
  // rien, ces entrées sont déjà sur le disque et rien ne les reposerait.
  //
  // On sème l'identifiant manquant et on lève le blocage — mais SEULEMENT sur
  // les entrées qu'on a vraiment réparées. Une entrée bloquée pour une autre
  // raison (RLS, colonne inconnue) le reste : la débloquer en masse masquerait
  // un défaut réel derrière une tentative qui échouerait à l'identique.
  //
  // L'intention reste un REMPLACEMENT COMPLET, et c'est ce qui la rend sûre :
  // rejouée, elle supprime en base ce qui n'est plus dans la liste. Un
  // identifiant semé ici ne peut donc pas laisser une ligne orpheline si la
  // même série était déjà montée sous un autre identifiant. Un upsert seul
  // n'aurait pas cette propriété — il ajouterait au lieu de remplacer.
  //
  // `version` MONTE, comme à chaque pose : une requête partie avec l'ancienne
  // ne doit pas pouvoir retirer l'entrée réparée (voir `retirer`).
  function reparerIdentifiants(file, fabriquer) {
    var entrees = 0, lignesReparees = 0;
    var neuve = (file || []).map(function (e) {
      if (!e || e.table !== SETS || !Array.isArray(e.donnees)) return e;
      if (!e.donnees.some(function (l) { return !l || !l.id; })) return e;
      entrees++;
      var donnees = e.donnees.map(function (l) {
        if (l && l.id) return l;
        lignesReparees++;
        return Object.assign({}, l, { id: fabriquer() });
      });
      return Object.assign({}, e, {
        donnees: donnees,
        version: (e.version || 1) + 1,
        bloquee: null, essais: 0
      });
    });
    return { file: neuve, entrees: entrees, lignes: lignesReparees };
  }

  // Tout ce qui attend encore, par table. La synchronisation s'en sert pour
  // NE PAS EFFACER ce qu'elle ne connaît pas encore : `Sync.remplacer` remplace
  // la liste des séances par celle du serveur, et une séance saisie hors ligne
  // n'y est pas. Sans cette protection, la première synchronisation réussie
  // effacerait la séance — exactement la perte silencieuse qu'on interdit.
  function protegees(file, table) {
    var ids = {};
    (file || []).forEach(function (e) {
      if (e.table === table && e.op !== SUPPRIMER) ids[e.id] = true;
    });
    return ids;
  }

  // Les séances qui attendent, quelle que soit la table : une séance dont seules
  // les séries attendent est protégée elle aussi.
  function seancesEnAttente(file) {
    var ids = {};
    (file || []).forEach(function (e) {
      if (e.op === SUPPRIMER) return;
      if (e.table === SESSIONS || e.table === SETS) ids[e.id] = true;
    });
    return ids;
  }

  // Ce que l'utilisateur voit. Un fait, un chiffre, aucune alarme — la même
  // règle que l'état de synchronisation en lecture.
  // ⚠️ « N À ENVOYER » QUAND RIEN NE PEUT MONTER EST UNE PERTE SILENCIEUSE
  // (chantier 36, D6, second symptôme).
  //
  // `marquerEchec` ne pose `bloquee` que sur un code DÉFINITIF. Une erreur
  // temporaire — `22003`, un 500, une coupure — laisse `bloquee` à null et
  // incrémente `essais` ; mais `vidanger` s'arrête quand même sur cette entrée,
  // parce que sauter la tête casserait l'ordre des dépendances. L'état affichait
  // alors « 3 à envoyer », c'est-à-dire exactement ce qu'il affiche quand tout
  // va bien et que le réseau manque — alors que la file ne peut plus avancer.
  //
  // TROIS ÉTATS, PAS DEUX : en attente (rien n'a encore été tenté), en échec
  // (tenté, refusé, on réessaiera), refusé définitivement (on ne réessaiera
  // pas). Le deuxième était invisible, et c'est celui qui trompe.
  function resume(file) {
    var liste = file || [];
    if (!liste.length) return { enAttente: 0, bloquees: 0, enEchec: 0, libelle: '' };
    var bloquees = liste.filter(function (e) { return !!e.bloquee; }).length;
    var enEchec = liste.filter(function (e) { return !e.bloquee && (e.essais || 0) > 0; }).length;
    var n = liste.length;
    if (bloquees) {
      return {
        enAttente: n, bloquees: bloquees, enEchec: enEchec,
        libelle: bloquees + ' envoi' + (bloquees > 1 ? 's' : '') + ' refusé' +
                 (bloquees > 1 ? 's' : '') + ' — rien n’est perdu'
      };
    }
    if (enEchec) {
      return {
        enAttente: n, bloquees: 0, enEchec: enEchec,
        libelle: 'Envoi en échec — ' + n + ' en attente, nouvelle tentative'
      };
    }
    return {
      enAttente: n, bloquees: 0, enEchec: 0,
      libelle: n + ' à envoyer'
    };
  }

  // L'état affiché combine la lecture et l'écriture. L'écriture PRIME quand il
  // reste quelque chose à envoyer : « à jour » serait faux tant qu'une séance
  // n'est pas montée, et c'est précisément ce que l'utilisateur doit pouvoir
  // vérifier avant d'effacer les données de son téléphone.
  function deciderEtat(etatLecture, file) {
    var r = resume(file);
    if (!r.enAttente) return etatLecture;
    if (r.bloquees) return { code: 'bloque', libelle: r.libelle, local: true };
    if (r.enEchec) return { code: 'echec', libelle: r.libelle, local: true };
    return { code: 'a-envoyer', libelle: r.libelle, local: true };
  }

  var api = {
    SESSIONS: SESSIONS, SETS: SETS, ROUTINE_EXOS: ROUTINE_EXOS,
    UPSERT: UPSERT, SUPPRIMER: SUPPRIMER, REMPLACER: REMPLACER, PLAN: PLAN,
    CODES_DEFINITIFS: CODES_DEFINITIFS,
    cleDe: cleDe,
    estDefinitive: estDefinitive,
    poser: poser,
    ordonnee: ordonnee,
    prochaine: prochaine,
    retirer: retirer,
    marquerEchec: marquerEchec,
    reparerIdentifiants: reparerIdentifiants,
    protegees: protegees,
    seancesEnAttente: seancesEnAttente,
    resume: resume,
    deciderEtat: deciderEtat
  };

  racine.THAttente = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
