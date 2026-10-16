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
//   { table: 'records',           op: 'ajouter',              id: <séance ou lot> }  (58-2)
//   { table: 'body_weight_log',  op: 'upsert',               id: <pesée du jour> }    (60-2a)
//   { table: 'social',           op: 'geste',                id: <l'état visé, ou un par geste> }  (107)
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
  // §9.1.1 (48b-7) — la quatrième. Une correction de zone se choisit EN SALLE,
  // là où le réseau n'est pas : la perdre parce que la requête directe a échoué
  // serait la perte silencieuse que cette file existe pour empêcher.
  //
  // ⚠️ UN IDENTIFIANT NEUF PAR CHOIX, DONC AUCUNE COMPRESSION ENTRE DEUX
  // CHOIX. La compression de `poser` se fait sur `table:id` : deux corrections
  // du même exercice portent deux identifiants, donc deux entrées, donc deux
  // lignes. C'est l'historique voulu — compresser par exercice n'enverrait que
  // le dernier choix et perdrait l'ordre de ceux faits hors ligne.
  var ZONES = 'zones_exercice';
  // §9.17 (50-1) — la sixième, sur le MÊME patron : le mode de l'exercice
  // (« Progresser » / « Entretenir ») se choisit en salle, et un identifiant
  // neuf par choix garde l'ordre des gestes faits hors ligne.
  var MODES = 'modes_exercice';
  // §9.22 (53-2) — la septième : les blocs d'un programme. Un bloc se crée,
  // ou change de statut, par un `upsert` sur son identifiant (idempotent). Ses
  // lignes de zone en DÉPENDENT (`depend`) : `bloc_id` référence `blocs`, une
  // ligne montée avant son bloc échouerait en 23503 — un code définitif.
  var BLOCS = 'blocs';
  // §9.11 (48c) — la cinquième. Ce que le moteur a proposé se note EN SALLE,
  // comme le reste.
  //
  // ⚠️ ET ELLE PORTE UNE DÉPENDANCE DÉCLARÉE. `set_observe` référence `sets` :
  // une prédiction observée ne peut pas monter avant les séries de sa séance,
  // ou sa clé étrangère échoue en 23503 — un code DÉFINITIF, donc une ligne
  // bloquée pour toujours. `seq` donne le bon ordre en marche normale ; il ne
  // donne rien quand l'entrée des séries est bloquée, car `prochaine` ne
  // retenait que par identité. D'où `depend`.
  var PREDICTIONS = 'predictions';
  var UPSERT = 'upsert', SUPPRIMER = 'supprimer', REMPLACER = 'remplacer';
  // §9.11 (48c) — « cette ligne porte une observation », et c'est l'OPÉRATION
  // qui le dit, pas son contenu. Retirer une observation remet les trois
  // colonnes à vide : à lire les seules données, ce serait indiscernable d'une
  // ligne jamais observée, et la mise à jour ne partirait pas. L'entrée porte
  // toujours la ligne ENTIÈRE, pour que la compression n'emporte jamais
  // l'insertion qui n'a pas encore eu lieu.
  var OBSERVER = 'observer';
  var PLAN = 'plan';
  // §9.11 (27/09/2026) — L'OBSERVATION A SA PROPRE ENTRÉE, séparée de son pari.
  //
  // Elle partageait la clé `predictions:<id>` : l'insertion du pari et
  // l'observation partaient ensemble, dans une entrée COMPRESSÉE — donc à la
  // position de la PREMIÈRE pose. Une observation reposée à la revalidation
  // d'une série partait alors AVANT la réinsertion de cette série : `set_observe`
  // échouait en 23503, classé définitif, et l'observation était perdue alors
  // que la copie locale la croyait posée (séance du 27/09, journaux Supabase).
  //
  // Trois règles, tenues ici :
  //   · elle porte l'identifiant de SON pari : un pari retenu la retient
  //     (`prochaine` retient par identifiant), et elle est toujours posée
  //     après lui ;
  //   · reposée, elle passe EN FIN DE FILE (`alaFin`) : derrière les séries
  //     qu'elle désigne ;
  //   · un 23503 (la série n'est pas, ou plus, en base) n'est pas un refus :
  //     elle ATTEND (`attend`), sans arrêter la file, et repart dès que les
  //     séries de sa séance sont montées (`libererObservations`).
  var OBSERVATIONS = 'observations';
  // 58-2 (MOTEUR §9.23) — LE JOURNAL DES RECORDS. Une entrée par séance
  // (`id` : la séance, `depend` : la séance) à « Terminer » et à
  // l'enregistrement d'une Édition, ou par lot pour le remplissage de
  // l'historique (`id` : le lot, sans dépendance — ses séances sont déjà en
  // base). `donnees` : les lignes, toutes celles de la séance.
  //
  // ⚠️ UNE OPÉRATION À PART, `ajouter`, ET JAMAIS UN UPSERT QUI MODIFIE. Le
  // déclencheur `records_immuable` refuse toute modification de ligne : un
  // envoi rejoué doit IGNORER la ligne déjà là (unicité `set_id, type`), pas
  // la réécrire — sinon une erreur, et une entrée qui ne passe jamais.
  //
  // ⚠️ ELLE PART APRÈS SES SÉRIES. `set_id` référence `sets` : posée après la
  // séance et ses séries, et reposée EN FIN DE FILE (`alaFin`) à chaque
  // Édition, elle monte derrière les séries qu'elle désigne ; une série
  // corrigée après elle effacerait la ligne qu'elle vient d'écrire
  // (`sets_efface_records`).
  var RECORDS = 'records';
  var AJOUTER = 'ajouter';
  // 60-2a — LA PESÉE du questionnaire (`body_weight_log`). Un `upsert` sur
  // (`user_id`, `date`) qui FUSIONNE : l'identifiant d'entrée est celui de la
  // pesée locale (un par jour), donc deux pesées le même jour se compressent en
  // une, la dernière gagne. Rien n'en dépend et elle ne dépend de rien.
  var PESEES = 'body_weight_log';
  // 69 (ECRAN-PROFIL §2.4 quater) — LE RATTACHEMENT D'UN NOM IMPORTÉ
  // (`alias_exercice`). Un `upsert` sur (`user_id`, `alias_norme`) qui
  // FUSIONNE : l'identifiant d'entrée est le nom normalisé, donc deux choix
  // pour le même nom se compressent en un, le dernier gagne. Rien n'en dépend
  // et il ne dépend de rien.
  var ALIAS = 'alias_exercice';
  // 99 (MOTEUR §9.24, v2_085) — LE CHOIX FAIT POUR UNE SÉANCE MANQUÉE (`semaine_choix`). Un `upsert` sur
  // (`user_id`, `semaine`, `routine_id`) : l'identifiant d'entrée est « semaine|routine », donc deux choix pour la
  // même séance manquée se compressent, le dernier gagne. Rien n'en dépend et il ne dépend de rien.
  var SEMAINE_CHOIX = 'semaine_choix';
  // 107 (SOCIAL-V1 §8, décision du 15/10/2026) — UN GESTE SOCIAL : s'abonner, accepter, refuser, se désabonner,
  // bloquer, débloquer, réagir, et les gestes de la guilde. Un geste fait hors ligne part au retour du réseau, comme
  // les séances. L'ordre de pose est l'ordre d'envoi. ⚠️ UN GESTE QUI ANNULE LE PRÉCÉDENT N'ENVOIE QUE L'ÉTAT FINAL :
  // un geste sur un ÉTAT (mon abonnement à lea, ma réaction à une séance…) porte un identifiant STABLE
  // (`Social.cleDuGeste`) et se pose `alaFin` — il remplace le précédent, derrière ce qui a été fait entre-temps, avec
  // une version neuve (un envoi en vol de l'ancien ne le retire pas). S'abonner puis se désabonner : un seul envoi, le
  // retrait. Les autres gestes ont un identifiant neuf. Rien n'en dépend, il ne dépend de rien.
  //
  // ⚠️ UN REFUS DE LA BASE NE BLOQUE JAMAIS LA FILE : l'entrée en sort (l'écran le dit en une phrase et relit l'état
  // réel), au lieu de rester « refusée » en tête — un geste social ne retient pas une séance. Ce qui est un refus, ce
  // qui est « déjà fait » et ce qui se réessaie se décide dans `social.js` (`issueDuGeste`), passé à `apresEchec`.
  var SOCIAL = 'social', GESTE = 'geste';

  // 109 (MOTEUR §9.25, v2_089) — L'OBJECTIF D'UN EXERCICE (`objectifs`). Un `upsert` sur (`user_id`,
  // `exercise_slug`) qui FUSIONNE, ou une suppression (le retirer) : l'identifiant d'entrée est l'exercice, donc
  // poser puis retirer hors ligne se compressent, le dernier geste gagne. Son pari part par `predictions`, à part :
  // un objectif retiré n'emporte jamais son ancien pari. Rien n'en dépend et il ne dépend de rien.
  var OBJECTIFS = 'objectifs';

  function cleDe(table, id) { return String(table) + ':' + String(id); }

  // Les codes Postgres qui ne passeront jamais, quel que soit le nombre de
  // tentatives : contrainte violée, RLS, colonne inconnue. Les réessayer en
  // boucle userait la batterie sans rien changer — et surtout, cacherait à
  // l'utilisateur que quelque chose ne montera pas.
  var CODES_DEFINITIFS = ['23502', '23503', '23505', '23514', '22P02', '42501', '42703'];

  // ⚠️ 117 (audit du 16/10, 06 #4 et #17) — CE QUE LA BASE N'A PAS ENCORE.
  //
  // Une colonne ou une table absente (une PR fusionnée avant sa migration) : PostgREST répond `PGRST204` (colonne
  // inconnue à l'écriture), `PGRST205` ou `42P01` (table inconnue), `PGRST202` ou `42883` (fonction inconnue) —
  // pas `42703`, que Postgres seul renvoie. Ces codes passaient pour « temporaires » : l'entrée n'était pas
  // bloquée, `prochaine` la rendait en tête à chaque tour, la vidange s'arrêtait (`break`), et TOUTES les entrées
  // suivantes — séances comprises — restaient sur le téléphone jusqu'à la migration. Le social, lui, les classait
  // déjà en refus (`Social.issueDuGeste`).
  //
  // Ils sont désormais REFUSÉS (l'entrée est marquée, elle se voit, et elle ne retient que ce qui dépend d'elle :
  // son identifiant, et les entrées dont `depend` la désigne, de proche en proche — jamais une autre séance). Et
  // ils sont RETENTÉS À CHAQUE OUVERTURE (`reparerSchema`) : la migration lancée, l'entrée monte sans un geste.
  // `TH001` : une table que CETTE version de l'app ne sait pas écrire (une entrée posée par une version plus
  // récente) — même règle : refusée, visible, retentée à l'ouverture par une version qui la connaîtra.
  var CODES_SCHEMA = ['42703', 'PGRST204', 'PGRST205', '42P01', 'PGRST202', '42883', 'TH001'];
  CODES_SCHEMA.forEach(function (c) { if (CODES_DEFINITIFS.indexOf(c) < 0) CODES_DEFINITIFS.push(c); });

  // ⚠️ SAUF UN `23505`, ET UN SEUL (26/09/2026) : `sessions_une_seule_en_cours`.
  //
  // Index unique sur `user_id` WHERE `statut = 'en_cours'`. Il refuse la
  // séance du téléphone parce qu'une AUTRE est encore ouverte en base — un état
  // qui se LÈVE : la vidange referme l'autre et renvoie (`app.js`, `vidanger`).
  // Le classer définitif laissait la séance, ses séries et ses paris sur le
  // seul appareil jusqu'à « Terminer » (constat du 26/09, onze minutes).
  //
  // On reconnaît la contrainte à son NOM, pas au seul code : tout autre
  // `23505` — une clé primaire, `sets_rang_unique`, les index des routines —
  // reste définitif, parce que le renvoyer échouerait à l'identique.
  var CONTRAINTE_EN_COURS = 'sessions_une_seule_en_cours';

  function estConflitEnCours(erreur) {
    if (!erreur || String(erreur.code || '') !== '23505') return false;
    var texte = String(erreur.message || '') + ' ' + String(erreur.details || '');
    return texte.indexOf(CONTRAINTE_EN_COURS) >= 0;
  }

  // Un envoi, et sa résolution si la base répond « une seule en cours » :
  // refermer les autres séances ouvertes, puis renvoyer AUSSITÔT. Rend l'erreur
  // qui reste (null si l'entrée est passée) ; ne lève jamais. `executer` et
  // `refermerSauf` sont fournis par l'appelant — ce module ne touche pas au
  // réseau, et c'est ce qui rend la règle testable sans navigateur.
  async function envoyer(op, executer, refermerSauf) {
    try { await executer(op); return null; }
    catch (e) {
      if (!op || op.table !== SESSIONS || !estConflitEnCours(e)) return e;
      try {
        await refermerSauf(op.id);
        await executer(op);
        return null;
      } catch (e2) { return e2; }
    }
  }

  function estDefinitive(erreur) {
    if (!erreur) return false;
    if (estConflitEnCours(erreur)) return false;
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

    if (i >= 0 && op.alaFin) {
      // En fin de file, avec une version NEUVE plus haute : une requête partie
      // avec l'ancienne ne doit pas pouvoir retirer celle-ci (`retirer`).
      var ancienne = liste[i];
      liste.splice(i, 1);
      var neuve = Object.assign(entree(cle, op, prochainSeq(liste.concat([ancienne]))), {
        version: (ancienne.version || 1) + 1
      });
      var cumul = cumulerConnues(ancienne.connues, op.connues);
      if (cumul === undefined) delete neuve.connues; else neuve.connues = cumul;
      return liste.concat([neuve]);
    }
    if (i >= 0) {
      // Compression : la dernière intention gagne, la POSITION reste celle de
      // la première. Sans ça, modifier la séance après avoir validé des séries
      // ferait passer la séance APRÈS ses séries, et la clé étrangère casserait.
      //
      // ⚠️ `version` MONTE À CHAQUE POSE. C'est ce qui distingue « l'entrée que
      // je viens d'envoyer » de « l'entrée telle qu'elle est maintenant » —
      // voir `retirer`.
      var connues = cumulerConnues(liste[i].connues, op.connues);
      liste[i] = Object.assign({}, liste[i], {
        op: op.op, donnees: op.donnees,
        depend: op.depend === undefined ? (liste[i].depend || null) : op.depend,
        creation: liste[i].creation || !!op.creation,
        version: (liste[i].version || 1) + 1,
        bloquee: null, essais: 0, attend: null, parti: false
      });
      if (connues === undefined) delete liste[i].connues;
      else liste[i].connues = connues;
      return liste;
    }
    return liste.concat([entree(cle, op, prochainSeq(liste))]);
  }

  function entree(cle, op, seq) {
    var e = {
      cle: cle, seq: seq, table: op.table, op: op.op, id: op.id,
      depend: op.depend === undefined ? null : op.depend,
      donnees: op.donnees === undefined ? null : op.donnees,
      creation: !!op.creation, posee_a: op.posee_a || null,
      version: 1, essais: 0, bloquee: null, attend: null
    };
    if (Array.isArray(op.connues)) e.connues = op.connues.slice();
    return e;
  }

  // 83 (12/10/2026) — LES SÉRIES QUE L'APPAREIL CONNAÎT, portées par une entrée
  // `remplacer` des séries (`remplacerSeries` ne supprime qu'elles). Une entrée
  // qui en remplace une autre les CUMULE : la précédente a pu en connaître que
  // la nouvelle ne liste plus (une série retirée entre-temps). Une entrée
  // ANCIENNE, posée avant ce correctif, n'en porte pas (`undefined`) : elle
  // garde l'ancienne règle — et la remplacer garde l'ancienne règle aussi, le
  // temps qu'elle parte. L'entrée suivante, neuve, porte ses connues.
  function cumulerConnues(avant, nouvelles) {
    if (!Array.isArray(avant) || !Array.isArray(nouvelles)) return undefined;
    var vus = {}, sortie = [];
    avant.concat(nouvelles).forEach(function (id) {
      if (id && !vus[id]) { vus[id] = true; sortie.push(id); }
    });
    return sortie;
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

  // ⚠️ UNE ENTRÉE BLOQUÉE N'ARRÊTE QUE CE QUI DÉPEND D'ELLE (chantier 37).
  //
  // Elle arrêtait TOUT : `prochaine` rendait null dès que la tête était bloquée,
  // au motif — juste — que sauter casserait l'ordre des dépendances. Mais la
  // dépendance est PAR ENTITÉ, pas globale : `sets:X` a besoin de `sessions:X`
  // par sa clé étrangère, et ne doit rien à `sessions:Y`.
  //
  // Conséquence mesurée : une entrée irréparable — RLS, colonne inconnue —
  // condamnait toutes les séances suivantes, POUR TOUJOURS. Et la seule sortie
  // connue, `/__sw-off`, efface la file : elle emportait avec elle les entrées
  // parfaitement saines coincées derrière.
  //
  // Elle est donc DÉPASSÉE, jamais jetée : elle reste en file, elle reste
  // marquée, et `deciderEtat` continue de dire « refusé ». Ce qui partage son
  // `id` reste retenu avec elle — à l'intérieur d'une entité, l'ordre compte.
  function prochaine(file) {
    var liste = ordonnee(file);
    var retenues = {};
    for (var i = 0; i < liste.length; i++) {
      var e = liste[i];
      if (e.bloquee) { retenues[e.id] = true; continue; }
      // Une observation qui attend sa série ne part pas, et n'arrête rien.
      if (e.attend) continue;
      // ⚠️ RETENUE PAR DÉPENDANCE DÉCLARÉE (48c), et elle se propage : une
      // entrée retenue retient à son tour ce qui dépend d'elle, sinon la
      // chaîne se romprait au deuxième maillon.
      if (retenues[e.id] || (e.depend && retenues[e.depend])) {
        retenues[e.id] = true;
        continue;
      }
      return e;
    }
    return null;
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

  // ⚠️ 121 (audit du 16/10/2026, 05 #3) — « PEUT-ÊTRE PARTI » SE MARQUE SUR LE DISQUE AVANT L'ENVOI.
  //
  // Un geste social qui a pu passer sans que la réponse revienne (l'app tuée, rechargée, le réseau coupé au retour)
  // est REJOUÉ au démarrage suivant. Sa seconde réponse dit alors « déjà fait » (`guilde_deja_membre`,
  // `guilde_deja_dans_une`…) — c'est un succès, pas un refus (SOCIAL-V1 §8.1). Mais `essais` n'augmente qu'après un
  // ÉCHEC constaté : une entrée relue après un rechargement repartait à 0, donc « jamais envoyée », et le « déjà fait »
  // devenait un faux refus à l'écran (« « Inviter jordan » n'a pas pu se faire. » alors que jordan est membre).
  // `parti` est posé (et écrit) AVANT l'appel ; `dejaParti` dit, au moment de lire la réponse, si un envoi PRÉCÉDENT a
  // pu passer — jamais l'envoi en cours, dont le premier « déjà dans une guilde » reste un vrai refus.
  function marquerParti(file, cle) {
    return (file || []).map(function (e) { return e.cle === cle && !e.parti ? Object.assign({}, e, { parti: true }) : e; });
  }
  function dejaParti(op) { return !!op && (!!op.parti || (op.essais || 0) > 0); }

  // §9.11 (27/09/2026) — UNE OBSERVATION REFUSÉE PARCE QUE SA SÉRIE N'EST PAS
  // EN BASE (23503 sur `set_observe`) N'EST PAS UN REFUS DÉFINITIF : la série
  // peut revenir (revalidée), et l'observation doit la suivre. Elle attend.
  // Toute autre erreur suit la règle commune.
  //
  // ⚠️ ET UNE OBSERVATION QUI NE TOUCHE AUCUNE LIGNE (`TH000`, `donnees.js`)
  // ATTEND AUSSI (29/09/2026). Classée temporaire, elle arrêtait la vidange
  // (`break`) : la tête de file ne passait jamais, et TOUT ce qui la suivait —
  // les observations de la séance, puis la séance suivante entière — restait
  // sur le téléphone, réseau présent. Séance du 29/09 : un pari perdu avant
  // d'entrer dans la file (la ré-entrée `SIGNED_IN → entrer()` relit la file
  // du disque), son observation partie seule, ~30 PATCH à zéro ligne, cinq
  // observations bloquées derrière.
  var AUCUNE_LIGNE = 'TH000';

  function attendSaSerie(op, erreur) {
    if (!op || op.table !== OBSERVATIONS || !erreur) return false;
    var code = String(erreur.code || '');
    return code === '23503' || code === AUCUNE_LIGNE;
  }

  // ⚠️ L'OBSERVATION ORPHELINE EST ABANDONNÉE — et seulement elle (29/09/2026).
  //
  // `TH000` : son pari n'est pas en base. Tant que sa séance a encore une
  // entrée dans la file — la séance, ses séries, un pari (le sien peut-être) —
  // le pari peut encore monter : elle attend. Quand il n'en reste plus aucune,
  // tout ce que la séance devait écrire est parti, et le pari n'y était pas :
  // il ne sera JAMAIS en base, car un pari ne s'écrit jamais après coup
  // (§9.11). Son observation n'a plus d'objet ; la garder ne ferait que
  // renvoyer le même PATCH vide pour toujours.
  //
  // Les autres OBSERVATIONS de la séance ne comptent pas : deux orphelines se
  // retiendraient l'une l'autre, pour toujours.
  function orpheline(file, op, erreur) {
    if (!op || op.table !== OBSERVATIONS || !erreur) return false;
    if (String(erreur.code || '') !== AUCUNE_LIGNE) return false;
    var seance = op.depend;
    return !(file || []).some(function (e) {
      if (!e || e.cle === op.cle || e.table === OBSERVATIONS) return false;
      if (e.id === op.id) return true;   // son pari, quelle que soit sa dépendance
      if (!seance) return false;
      return e.id === seance || e.depend === seance;
    });
  }

  // ⚠️ 117 (audit du 16/10, 06 #2) — UNE SÉANCE QUI PART EMPORTE CE QUI DÉPEND D'ELLE.
  //
  // Abandonner (ou supprimer) une séance retirait ses séries de la file, et posait la suppression de la séance —
  // qui, jamais montée, ne voyage pas. Ses PARIS et leurs OBSERVATIONS restaient : au retour du réseau, la base
  // refusait le pari (23503, `predictions_session_fk` : sa séance n'existe pas), code définitif, et « 1 envoi refusé
  // — rien n'est perdu » ne partait plus jamais. Désormais tout ce qui dépend de la séance sort avec elle : ses
  // séries, ses paris, son journal des records, les observations de ses paris et celles qui désignent une de ses
  // séries (`idsSeries`). L'entrée de la séance elle-même reste à `poser(SUPPRIMER)`, qui décide si elle voyage.
  function retirerSeance(file, seanceId, idsSeries) {
    var liste = (file || []).slice();
    if (!seanceId) return liste;
    var series = {}, paris = {};
    (idsSeries || []).forEach(function (id) { if (id) series[id] = true; });
    liste.forEach(function (e) { if (e && e.table === PREDICTIONS && e.depend === seanceId) paris[e.id] = true; });
    return liste.filter(function (e) {
      if (!e) return false;
      if (e.table === SESSIONS) return true;
      if (e.table === SETS) return e.id !== seanceId;
      if (e.depend === seanceId) return false;
      if (e.table === OBSERVATIONS) {
        if (paris[e.id]) return false;
        var d = e.donnees || {};
        if (d.set_observe && series[d.set_observe]) return false;
      }
      return true;
    });
  }

  // ⚠️ 117 (audit du 16/10, 06 #2) — ET UN REFUS PARCE QUE LA SÉANCE N'EXISTE PLUS N'EST PAS UN BLOCAGE.
  //
  // Un pari, ou le journal des records d'une séance, refusé en 23503 sur la clé vers `sessions` alors que la file
  // n'a plus rien à monter pour cette séance : elle a été abandonnée ou supprimée (ici ou sur un autre appareil),
  // ou un envoi est parti avant l'abandon. Il ne passera jamais — un pari ne s'écrit jamais après coup (§9.11) — et
  // le garder bloqué affichait « 1 envoi refusé » pour toujours. Il sort de la file, avec l'observation de ce pari.
  // Une autre clé (l'exercice, la série) reste un refus ; un lot du remplissage (sans `depend`) aussi : il porte les
  // lignes de plusieurs séances. Les SÉRIES ne sont jamais concernées : ce sont des saisies, pas des déductions.
  function seanceDeLEntree(op) {
    if (!op) return null;
    if (op.table === PREDICTIONS) {
      var f = op.donnees && op.donnees.fondement;
      return (f && f.seance) || op.depend || null;
    }
    if (op.table === RECORDS) return op.depend || null;
    return null;
  }

  function seanceDisparue(file, op, erreur) {
    if (!op || !erreur || String(erreur.code || '') !== '23503') return false;
    if (op.table !== PREDICTIONS && op.table !== RECORDS) return false;
    var texte = String(erreur.message || '') + ' ' + String(erreur.details || '');
    if (!/session/i.test(texte)) return false;
    var seance = seanceDeLEntree(op);
    if (!seance) return false;
    return !(file || []).some(function (e) {
      return e && e.table === SESSIONS && e.id === seance && e.op !== SUPPRIMER;
    });
  }

  function marquerAttente(file, cle, raison) {
    return (file || []).map(function (e) {
      if (e.cle !== cle) return e;
      return Object.assign({}, e, { attend: raison || 'serie', essais: (e.essais || 0) + 1, bloquee: null });
    });
  }

  // Les séries d'une séance viennent de monter : les observations qui les
  // attendaient repartent. Une observation dépend de sa séance (`depend`).
  // `raison` restreint aux observations qui attendent pour cette raison-là.
  function libererObservations(file, seanceId, raison) {
    return (file || []).map(function (e) {
      if (!e.attend || e.table !== OBSERVATIONS || e.depend !== seanceId) return e;
      if (raison && e.attend !== raison) return e;
      return Object.assign({}, e, { attend: null });
    });
  }

  // La séance d'une entrée : son identifiant pour la séance et ses séries, sa
  // dépendance pour le reste.
  function seanceDe(op) {
    if (!op) return null;
    if (op.table === SESSIONS || op.table === SETS) return op.id;
    return op.depend || null;
  }

  // ── Ce que la vidange fait d'un envoi (`app.js`, `vidanger`) ─────────────
  //
  // Ici plutôt que dans la boucle : c'est ce qui se teste. `suite` dit à la
  // boucle quoi faire — `arret` est le seul cas qui arrête la vidange.
  //
  // 107 — un geste social : `issueSociale(op, erreur)` rend `fait`, `refus` ou `reessayer` (`Social.issueDuGeste`).
  // Sans elle, la règle commune décide (définitif → refus, sinon on réessaie). `fait` : l'entrée sort comme un
  // succès (`suite: 'faite'`) ; `refus` : elle sort, sans arrêter la vidange (`suite: 'refusee'`).
  function apresEchec(file, op, erreur, issueSociale) {
    if (op && op.table === SOCIAL) {
      var issue = issueSociale ? issueSociale(op, erreur) : (estDefinitive(erreur) ? 'refus' : 'reessayer');
      if (issue === 'fait') return { file: apresSucces(file, op), suite: 'faite' };
      if (issue === 'refus') return { file: retirer(file, op.cle, op.version || 1), suite: 'refusee' };
      return { file: marquerEchec(file, op.cle, erreur), suite: 'arret' };
    }
    if (seanceDisparue(file, op, erreur)) {
      var sans = retirer(file, op.cle, op.version || 1);
      if (op.table === PREDICTIONS) {
        sans = sans.filter(function (e) { return !(e && e.table === OBSERVATIONS && e.id === op.id); });
      }
      return { file: sans, suite: 'caduque' };
    }
    if (orpheline(file, op, erreur)) {
      return { file: retirer(file, op.cle, op.version || 1), suite: 'abandonnee' };
    }
    if (attendSaSerie(op, erreur)) {
      var raison = String(erreur.code || '') === AUCUNE_LIGNE ? 'pari' : 'serie';
      return { file: marquerAttente(file, op.cle, raison), suite: 'attend' };
    }
    // 117 (audit du 16/10, 06 #4) — UN REFUS N'ARRÊTE PLUS LA VIDANGE. L'entrée est marquée (`bloquee`), et
    // `prochaine` la dépasse avec ce qui dépend d'elle : la vidange continue aussitôt avec les entrées suivantes
    // (`suite: 'bloquee'`), au lieu d'attendre le geste suivant. Seul ce qui se réessaie (le réseau) l'arrête.
    return { file: marquerEchec(file, op.cle, erreur), suite: estDefinitive(erreur) ? 'bloquee' : 'arret' };
  }

  // Retirée APRÈS confirmation, et seulement si elle est restée celle qu'on a
  // envoyée (`retirer`). Les séries montées libèrent les observations de leur
  // séance ; TOUT envoi réussi de la séance libère celles qui attendent leur
  // pari — c'est peut-être lui qui vient de monter, ou la dernière entrée de
  // la séance, qui fait d'elle une orpheline à abandonner.
  function apresSucces(file, op) {
    var f = retirer(file, op.cle, op.version || 1);
    if (op.table === SETS) f = libererObservations(f, op.id);
    var seance = seanceDe(op);
    if (seance) f = libererObservations(f, seance, 'pari');
    return f;
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

  // ⚠️ RÉPARER LES FILES QUE LE CHANTIER 36 NE PEUT PLUS CRÉER (chantier 37).
  //
  // Même raison qu'au chantier 33, et la même règle : L'APPAREIL NE SE RÉPARE
  // PAS TOUT SEUL. Borner à la saisie empêche de NOUVELLES entrées hors bornes ;
  // ça ne rouvre pas celles qui sont déjà sur le disque, marquées définitives.
  //
  // ── LES DEUX TABLES NE SE RÉPARENT PAS PAREIL, ET C'EST LE POINT ────────
  //
  // `routine_exos` porte une INTENTION (`{voulues}`) : le plan d'écritures se
  // calcule à la vidange, et `Routines.normaliserExercice` borne alors les
  // colonnes contraintes — `repos_cible_s`, `groupe_superset`, `rang` —
  // pendant que `normaliserSerie` borne celles des lignes programmées.
  // Rejouée telle quelle, l'entrée passe. Lever le blocage SUFFIT, et c'est sûr
  // quelle que soit la contrainte qui l'avait refusée.
  //
  // ⚠️ `series` ET `reps_visees` N'EN SONT PLUS (chantier 43) : ces deux
  // colonnes de `routine_exercises` ne sont plus écrites du tout, et la
  // structure vit dans `routine_sets`. Une entrée POSÉE AVANT ce chantier porte
  // encore l'ancien entier — `seriesEcrites` rend alors `null` et ne touche pas
  // aux lignes programmées, ce qui reste sûr à rejouer.
  //
  // `sets` porte des LIGNES DÉJÀ CALCULÉES, figées au moment du geste, donc
  // d'avant le correctif. Les rejouer échouerait à l'identique : il faut borner
  // la charge utile stockée, et ne lever le blocage QUE si ça a changé quelque
  // chose. Sinon le `23514` venait d'ailleurs, et débloquer masquerait le vrai
  // défaut derrière une tentative qui échouerait pareil (règle du chantier 33).
  //
  // Tout le reste — RLS, colonne inconnue, clé étrangère, un `22003` sur une
  // table qu'on ne sait pas borner — reste bloqué. `prochaine` le dépasse
  // désormais, donc il ne condamne plus la file.
  var CODES_BORNES = ['23514', '22003', '22P02'];

  function reparerBornes(file, bornerLigne) {
    var entrees = 0, lignesReparees = 0;
    var neuve = (file || []).map(function (e) {
      if (!e || !e.bloquee) return e;
      if (CODES_BORNES.indexOf(String(e.bloquee.code || '')) < 0) return e;

      if (e.table === ROUTINE_EXOS && e.op === PLAN) {
        entrees++;
        return Object.assign({}, e, {
          version: (e.version || 1) + 1, bloquee: null, essais: 0
        });
      }

      if (e.table !== SETS || !Array.isArray(e.donnees)) return e;
      var change = false;
      var donnees = e.donnees.map(function (l) {
        var r = bornerLigne(l);
        if (r && r.change) { change = true; lignesReparees++; return r.ligne; }
        return l;
      });
      if (!change) return e;        // rien à réparer → rien à débloquer
      entrees++;
      return Object.assign({}, e, {
        donnees: donnees, version: (e.version || 1) + 1, bloquee: null, essais: 0
      });
    });
    return { file: neuve, entrees: entrees, lignes: lignesReparees };
  }

  // ⚠️ ET LES FILES DÉJÀ BLOQUÉES SUR CE CONFLIT (26/09/2026).
  //
  // Même règle qu'au-dessus : L'APPAREIL NE SE RÉPARE PAS TOUT SEUL. Une file
  // écrite avant ce correctif porte peut-être une séance marquée définitive sur
  // `sessions_une_seule_en_cours` ; `estConflitEnCours` ne la rouvre pas, elle
  // est déjà sur le disque. On lève le blocage — seulement celui-là, reconnu à
  // son nom : la vidange saura désormais le résoudre.
  function reparerConflitsEnCours(file) {
    var entrees = 0;
    var neuve = (file || []).map(function (e) {
      if (!e || !e.bloquee || e.table !== SESSIONS) return e;
      if (!estConflitEnCours(e.bloquee)) return e;
      entrees++;
      return Object.assign({}, e, {
        version: (e.version || 1) + 1, bloquee: null, essais: 0
      });
    });
    return { file: neuve, entrees: entrees };
  }

  // 117 (audit du 16/10, 06 #4) — À L'OUVERTURE, LES REFUS « LA BASE N'A PAS ENCORE » SONT RETENTÉS UNE FOIS.
  // Seulement eux (`CODES_SCHEMA`) : un refus de contrainte, de RLS ou de clé étrangère échouerait à l'identique.
  function reparerSchema(file) {
    var entrees = 0;
    var neuve = (file || []).map(function (e) {
      if (!e || !e.bloquee || CODES_SCHEMA.indexOf(String(e.bloquee.code || '')) < 0) return e;
      entrees++;
      return Object.assign({}, e, { version: (e.version || 1) + 1, bloquee: null, essais: 0 });
    });
    return { file: neuve, entrees: entrees };
  }

  // ⚠️ 117 (audit du 16/10, 06 #6) — LA FILE APPARTIENT À SON COMPTE, ET ELLE LUI EST RENDUE.
  //
  // Une session qui EXPIRE ne vide rien (les données restent pour la prochaine ouverture). Mais si un AUTRE compte
  // entrait ensuite sur l'appareil, le changement de propriétaire vidait tout — la file du premier comprise : ses
  // séances pas encore montées, ses pesées, ses paris, sans la fenêtre de « Quitter ». Désormais la file du compte
  // qui part est GARDÉE à part, sous son identifiant, et RENDUE quand il revient ; seul « Quitter » explicite la
  // vide, après sa fenêtre (qui la compte). Pur : `gardees` est `{ uid: file }`, rien n'est muté.
  function changerDeCompte(gardees, ancienUid, fileAncienne, nouveauUid) {
    var g = {};
    Object.keys(gardees || {}).forEach(function (k) { if ((gardees[k] || []).length) g[k] = gardees[k].slice(); });
    if (ancienUid && (fileAncienne || []).length) {
      var vues = {};
      (fileAncienne || []).forEach(function (e) { if (e) vues[e.cle] = true; });
      g[ancienUid] = (g[ancienUid] || []).filter(function (e) { return e && !vues[e.cle]; })
        .concat((fileAncienne || []).filter(Boolean));
    }
    var rendue = (nouveauUid && g[nouveauUid]) || [];
    if (nouveauUid) delete g[nouveauUid];
    return { gardees: g, rendue: rendue };
  }

  // Toutes les entrées gardées pour d'autres comptes, à plat (la fenêtre de « Quitter » les compte).
  function entreesGardees(gardees) {
    return Object.keys(gardees || {}).reduce(function (t, k) { return t.concat(gardees[k] || []); }, []);
  }

  // ⚠️ 118 (suite de 117) — LA MÊME RÈGLE POUR CE QUI ATTEND HORS DE LA FILE : la réponse de profil pas encore
  // envoyée et les messages du groupe écrits hors ligne. Un autre compte qui entrait les effaçait encore, sans la
  // fenêtre de « Quitter ». Ils sont gardés sous l'identifiant du compte qui part, rendus quand il revient.
  //   `gardes` : `{ uid: { 'magasin:cle': valeur } }` ; `valeurs` : celles du compte qui part (une valeur vide —
  //   null, faux, liste vide — n'est pas gardée). Rend `{ gardes, rendues }` ; rien n'est muté.
  function valeurAGarder(v) {
    return v !== null && v !== undefined && v !== false && !(Array.isArray(v) && !v.length);
  }
  function changerDeCompteAutres(gardes, ancienUid, valeurs, nouveauUid) {
    var g = {};
    Object.keys(gardes || {}).forEach(function (u) {
      var x = gardes[u] || {}, propre = {};
      Object.keys(x).forEach(function (c) { if (valeurAGarder(x[c])) propre[c] = x[c]; });
      if (Object.keys(propre).length) g[u] = propre;
    });
    if (ancienUid) {
      var pleines = {};
      Object.keys(valeurs || {}).forEach(function (c) { if (valeurAGarder(valeurs[c])) pleines[c] = valeurs[c]; });
      if (Object.keys(pleines).length) g[ancienUid] = Object.assign({}, g[ancienUid] || {}, pleines);
    }
    var rendues = (nouveauUid && g[nouveauUid]) || {};
    if (nouveauUid) delete g[nouveauUid];
    return { gardes: g, rendues: rendues };
  }
  // Combien de choses attendent, gardées pour d'autres comptes (une liste compte ses éléments, une réponse de profil
  // compte pour une) : la fenêtre de « Quitter » les compte.
  function compterGardesAutres(gardes) {
    return Object.keys(gardes || {}).reduce(function (n, u) {
      var x = gardes[u] || {};
      return n + Object.keys(x).reduce(function (k, c) {
        return k + (Array.isArray(x[c]) ? x[c].length : valeurAGarder(x[c]) ? 1 : 0);
      }, 0);
    }, 0);
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
  // ⚠️ LE JOURNAL DES RECORDS NE SE COMPTE PAS TANT QU'IL N'A PAS ÉCHOUÉ (58-2).
  // Il part derrière sa séance, dans la même vidange : le compter ferait dire
  // « 3 à envoyer » là où l'écran disait « 2 » — et le remplissage de
  // l'historique, en tâche de fond, afficherait des dizaines d'envois que
  // personne n'a faits. Un envoi du journal qui ÉCHOUE, lui, se compte et se
  // dit, comme les autres : rien ne reste en attente sans que l'écran le sache.
  function compteALEcran(e) {
    if (!e) return false;
    if (e.table !== RECORDS) return true;
    return !!e.bloquee || (e.essais || 0) > 0;
  }

  function resume(file) {
    var liste = (file || []).filter(compteALEcran);
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
    SESSIONS: SESSIONS, SETS: SETS, ROUTINE_EXOS: ROUTINE_EXOS, ZONES: ZONES, MODES: MODES, BLOCS: BLOCS,
    PREDICTIONS: PREDICTIONS,
    OBSERVATIONS: OBSERVATIONS,
    RECORDS: RECORDS, AJOUTER: AJOUTER,
    PESEES: PESEES,
    ALIAS: ALIAS,
    SEMAINE_CHOIX: SEMAINE_CHOIX,
    SOCIAL: SOCIAL, GESTE: GESTE,

    OBJECTIFS: OBJECTIFS,
    OBSERVER: OBSERVER,
    attendSaSerie: attendSaSerie,
    AUCUNE_LIGNE: AUCUNE_LIGNE,
    orpheline: orpheline,
    retirerSeance: retirerSeance,
    seanceDisparue: seanceDisparue,
    apresEchec: apresEchec,
    apresSucces: apresSucces,
    seanceDe: seanceDe,
    marquerAttente: marquerAttente,
    libererObservations: libererObservations,
    UPSERT: UPSERT, SUPPRIMER: SUPPRIMER, REMPLACER: REMPLACER, PLAN: PLAN,
    cumulerConnues: cumulerConnues,
    CODES_DEFINITIFS: CODES_DEFINITIFS,
    CODES_SCHEMA: CODES_SCHEMA,
    reparerSchema: reparerSchema,
    changerDeCompte: changerDeCompte,
    entreesGardees: entreesGardees,
    changerDeCompteAutres: changerDeCompteAutres,
    compterGardesAutres: compterGardesAutres,
    cleDe: cleDe,
    estDefinitive: estDefinitive,
    estConflitEnCours: estConflitEnCours,
    envoyer: envoyer,
    CONTRAINTE_EN_COURS: CONTRAINTE_EN_COURS,
    reparerConflitsEnCours: reparerConflitsEnCours,
    poser: poser,
    ordonnee: ordonnee,
    prochaine: prochaine,
    retirer: retirer,
    marquerEchec: marquerEchec,
    marquerParti: marquerParti,
    dejaParti: dejaParti,
    reparerIdentifiants: reparerIdentifiants,
    reparerBornes: reparerBornes,
    CODES_BORNES: CODES_BORNES,
    protegees: protegees,
    seancesEnAttente: seancesEnAttente,
    resume: resume,
    deciderEtat: deciderEtat
  };

  racine.THAttente = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
