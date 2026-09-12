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
//   { table: 'sessions', op: 'upsert' | 'supprimer', id }
//   { table: 'sets',     op: 'remplacer',            id: <id de séance> }
//
// `sets` porte TOUTES les séries validées de la séance, pas une série. Ce n'est
// pas un raccourci : `sets_rang_unique` est UNIQUE (session_id, rang)
// **DEFERRABLE INITIALLY DEFERRED**. Différée, elle tolère les collisions
// transitoires À L'INTÉRIEUR d'une transaction — donc un envoi en bloc permute
// des rangs sans heurt, là où N requêtes séparées, chacune sa transaction,
// échoueraient sur la première. Le lot est aussi idempotent par construction.

(function (racine) {
  'use strict';

  var SESSIONS = 'sessions', SETS = 'sets';
  var UPSERT = 'upsert', SUPPRIMER = 'supprimer', REMPLACER = 'remplacer';

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
  function resume(file) {
    var liste = file || [];
    if (!liste.length) return { enAttente: 0, bloquees: 0, libelle: '' };
    var bloquees = liste.filter(function (e) { return !!e.bloquee; }).length;
    var n = liste.length;
    if (bloquees) {
      return {
        enAttente: n, bloquees: bloquees,
        libelle: bloquees + ' envoi' + (bloquees > 1 ? 's' : '') + ' refusé' +
                 (bloquees > 1 ? 's' : '') + ' — rien n’est perdu'
      };
    }
    return {
      enAttente: n, bloquees: 0,
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
    return { code: 'a-envoyer', libelle: r.libelle, local: true };
  }

  var api = {
    SESSIONS: SESSIONS, SETS: SETS,
    UPSERT: UPSERT, SUPPRIMER: SUPPRIMER, REMPLACER: REMPLACER,
    CODES_DEFINITIFS: CODES_DEFINITIFS,
    cleDe: cleDe,
    estDefinitive: estDefinitive,
    poser: poser,
    ordonnee: ordonnee,
    prochaine: prochaine,
    retirer: retirer,
    marquerEchec: marquerEchec,
    protegees: protegees,
    seancesEnAttente: seancesEnAttente,
    resume: resume,
    deciderEtat: deciderEtat
  };

  racine.THAttente = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
