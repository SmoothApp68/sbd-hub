// v2/js/donnees.js — accès Supabase.
//
// LECTURE pour tout le corpus importé, et ÉCRITURE pour les routines seulement
// (section en bas de fichier). Le corpus reste intouchable : ce module n'écrit
// jamais dans `sessions` ni dans `sets`. En particulier il n'écrit jamais
// `validee_a` : cette colonne est NULL sur les 28 103 séries importées. Elle est
// en revanche LUE, parce qu'elle dit à elle seule si la chronologie existe pour
// une série (ECRAN-SAISIE-V1 §7.3).
//
// Aucune requête ne filtre sur `user_id`. C'est délibéré : le cloisonnement est
// le travail du RLS, et filtrer côté client masquerait un RLS défaillant au lieu
// de le révéler.
//
// PAGINATION PAR CURSEUR DE CLÉ — PostgREST plafonne une réponse à 1 000
// lignes, et `.range()` s'appuie sur OFFSET. Or OFFSET ne veut RIEN DIRE sans
// ordre total : mesuré en base, les 28 103 séries ne portent que 6 valeurs
// distinctes de `created_at`, dont un groupe de 16 704 ex æquo. Trier là-dessus
// n'ordonne rien, chaque tranche tire 1 000 lignes arbitraires — 3 tranches
// rendaient 1 721 lignes distinctes sur 3 000 demandées, et une pagination
// complète 20 100 séries sur 28 103. 8 003 séries jamais reçues, sur 310
// séances, et le curseur avançait quand même : « Rafraîchir » ne les ramenait
// jamais.
//
// On pagine donc sur une CLÉ UNIQUE — `id` pour sessions et sets, `slug` pour
// exercises, toutes clés primaires — avec `clé > dernière vue`. L'ordre devient
// total, donc la pagination déterministe ; et on évite au passage un OFFSET
// 28 000 qui fait retrier la table à chaque tranche.

(function (racine) {
  'use strict';

  var PAGE = 1000;

  // Borne dure du nombre de tranches. 200 tranches = 200 000 lignes, sept fois
  // le volume actuel. Un serveur qui ignorerait le filtre de curseur ferait
  // tourner la boucle sans fin : une app figée est pire qu'une app incomplète,
  // et le compte de contrôle dira ce qui manque.
  var MAX_TRANCHES = 200;

  function client() { return racine.THClient.obtenir(); }

  // Enchaîne les tranches jusqu'à ce que le serveur en rende moins qu'une page.
  // `tranche(derniereCle, taille)` rend une promesse { data, error }.
  async function paginerParCle(tranche, cle) {
    var tout = [];
    var dernier = null;
    for (var tours = 0; tours < MAX_TRANCHES; tours++) {
      var r = await tranche(dernier, PAGE);
      if (r.error) throw r.error;
      var lot = r.data || [];
      tout = tout.concat(lot);
      if (lot.length < PAGE) return tout;

      var suivant = lot[lot.length - 1][cle];
      // Le curseur n'avance pas : la clé n'est pas celle qu'on croit. On rend ce
      // qu'on a plutôt que de boucler sans fin — le compte de contrôle dira que
      // c'est incomplet, ce qui vaut mieux qu'une app figée ou muette.
      if (suivant === null || suivant === undefined || suivant === dernier) return tout;
      dernier = suivant;
    }
    return tout;
  }

  // Fabrique une tranche à partir d'un constructeur de requête et d'une clé.
  function trancheur(construire, cle) {
    return function (dernier, taille) {
      var q = construire();
      if (dernier !== null && dernier !== undefined) q = q.gt(cle, dernier);
      return q.order(cle, { ascending: true }).limit(taille);
    };
  }

  // Ce que le serveur ANNONCE, sans rapatrier une seule ligne. C'est l'autre
  // moitié du compte de contrôle : sans lui, on ne sait pas ce qui manque.
  // 73 — la table est NOMMÉE à l'appel (`compterSeances`…), jamais passée en variable : la carte des écritures
  // (v2-architecture) exige un nom de table littéral à chaque `.from(`.
  async function compter(requete) {
    var r = await requete().select('*', { count: 'exact', head: true });
    if (r.error) throw r.error;
    return typeof r.count === 'number' ? r.count : null;
  }

  // ⚠️ LES LISTES NE SONT PLUS RECOPIÉES ICI (chantier 34).
  //
  // Elles l'étaient, et elles étaient plus COURTES que ce que `seance.js`
  // écrit : `user_id`, `ressenti` et `repos_s` partaient en base et n'en
  // revenaient jamais. Une correction de séance les réécrivait alors à null —
  // et `user_id` étant NOT NULL, la requête partait en 23502, code que la file
  // classe DÉFINITIF : toute la file se bloquait derrière.
  //
  // Elles se CONSTRUISENT donc depuis `THSeance`, seul endroit qui sait ce qui
  // s'écrit. La liste lue est un sur-ensemble de la liste écrite par
  // construction ; l'écart n'est plus une chose à surveiller, c'en est une
  // qu'on ne peut plus créer.
  //
  // ⚠️ ACCÈS PARESSEUX, PAS AU CHARGEMENT. `donnees.js` est chargé AVANT
  // `seance.js` (index.html, lignes 229 et 236) : `THSeance` n'existe pas
  // encore quand ce fichier s'évalue. Toutes les fonctions ci-dessous, elles,
  // s'appellent bien après le démarrage.
  function S() { return racine.THSeance; }
  function colonnesSeance() {
    return S().COLONNES_SESSION.concat(S().COLONNES_SESSION_EN_PLUS).join(', ');
  }
  function colonnesSerie() {
    return S().COLONNES_SET.concat(S().COLONNES_SET_EN_PLUS).join(', ');
  }

  // Rafraîchissement COMPLET : 545 Ko, et `sessions` n'a aucune colonne de
  // modification. C'est le seul moyen de voir un titre changé ou une séance
  // supprimée.
  //
  // ⚠️ PAS DE FILTRE SUR `statut` ICI, ET C'EST DÉLIBÉRÉ.
  //
  // Le premier jet du chantier 23 filtrait `statut = 'terminee'` au serveur,
  // pour « ne pas transporter ce qui sera jeté ». C'était faux, et de peu :
  // cette liste ne sert pas qu'à l'affichage. Elle sert AUSSI à répondre à
  // « quelles séances EXISTENT ? » — c'est elle qui autorise
  // `purgerSeriesOrphelines` à effacer les séries d'une séance supprimée, et
  // c'est `compterSeances` qui atteste qu'elle est complète.
  //
  // Filtrée, elle répondait « quelles séances sont TERMINÉES ? » à une question
  // qui n'était pas celle-là. Conséquence, pendant toute la durée d'une séance :
  // ses séries montées étaient purgées du cache alors que `compterSeries` les
  // comptait encore côté serveur, donc `decisionDeCommit` refusait d'avancer le
  // curseur, donc « N séries manquantes » s'affichait et 15 Mo se
  // retéléchargeaient à chaque synchronisation. Pendant qu'on s'entraîne.
  //
  // Le filtre d'affichage vit donc à UN seul endroit — `rangerSeances`
  // (app.js), là où la liste du serveur devient le corpus qu'on lit et ce qu'on
  // écrit au cache. Une ligne de plus transportée par séance ouverte est un
  // prix nul ; la cohérence entre la purge et son compte ne l'est pas.
  function toutesLesSeances() {
    return paginerParCle(trancheur(function () {
      return client().from('sessions').select(colonnesSeance());
    }, 'id'), 'id');
  }

  function compterSeances() { return compter(function () { return client().from('sessions'); }); }
  function compterSeries() { return compter(function () { return client().from('sets'); }); }

  // Pesées : 116 lignes en tout, une page, aucun incrémental à inventer. On
  // rafraîchit en entier comme le catalogue — et comme `sessions`, c'est le
  // seul moyen de voir une pesée corrigée ou supprimée.
  //
  // Colonnes relevées AU SCHÉMA (information_schema.columns), pas supposées :
  // id uuid · user_id uuid · date date · poids_kg numeric · source text ·
  // created_at timestamptz · masse_grasse_pct numeric. On n'en lit que quatre —
  // `masse_grasse_pct` existe et n'a pas encore d'écran, `user_id` ne se filtre
  // pas côté client (c'est le travail du RLS).
  function toutesLesPesees() {
    return paginerParCle(trancheur(function () {
      return client().from('body_weight_log').select('id, date, poids_kg, source');
    }, 'id'), 'id');
  }

  // INCRÉMENTAL : 15 Mo, qu'on ne retélécharge pas. Une ligne neuve porte
  // `created_at`, une ligne retouchée porte `modifie_a` — il faut les deux.
  function seriesDepuis(curseur) {
    return paginerParCle(trancheur(function () {
      var q = client().from('sets').select(colonnesSerie());
      // Le filtre incrémental et le curseur de clé se combinent : PostgREST
      // conjugue les filtres de premier niveau — (neuve OU retouchée) ET id > x.
      if (curseur) q = q.or('created_at.gt.' + curseur + ',modifie_a.gt.' + curseur);
      return q;
    }, 'id'), 'id');
  }

  // Catalogue partagé, 237 lignes. `mesure` et `charge` reconnaissent une sortie
  // (THModele.estExerciceSortie) ; les deux tableaux de muscles portent le
  // volume hebdomadaire, pondéré 1 en primaire et 0,5 en secondaire.
  //
  // ⚠️ `equipement` DEPUIS 48b-3, et sans elle le moteur se tait. Elle porte le
  // matériel de l'exercice — barre, haltere, poulie, machine, machine_smith,
  // elastique, kettlebell, disque, aucun — et c'est d'elle que vient le repli
  // du MOTEUR §10.2, quand l'historique ne donne pas le pas de la salle.
  // PostgREST ne renvoie QUE ce qu'on nomme : omise, elle vaudrait `undefined`
  // sur les 237 exercices et le repli ne parlerait jamais, sans une erreur.
  //
  // ⚠️ `mouvement` DEPUIS 49-U20 (MOTEUR §13.6, migration `v2_053`) : les
  // frères d'un exercice. Omise, aucun frère, en silence — le même piège. Un
  // catalogue déjà en cache sans elle est réécrit en entier à la prochaine
  // synchronisation (`remplacerTout`) : rien à migrer.
  //
  // ⚠️ `parent` DEPUIS 50-1 (MOTEUR §9.17) : la version lestée d'un exercice
  // libre est l'exercice dont `parent` EST lui (`THModele.lesteDe`, la seule
  // lecture de la colonne). Omise, `parent` vaudrait `undefined` sur les 237
  // exercices et la carte du lest ne trouverait jamais sa version lestée — sans
  // une erreur : le même piège que `equipement` et `mouvement`.
  //
  // ⚠️ `muscles_stabilisateurs` DEPUIS 65 (v2_069, REGLE-VOLUME §1 bis) : les
  // muscles qui tiennent la position, comptés ¼ (`THSemaine.musclesPonderes`).
  // Omise, les 176 stabilisateurs disparaîtraient du volume, du jeu et du compte
  // des polyarticulaires — sans une erreur. Une ligne sans la colonne (cache
  // d'avant v2_069, faux serveur du banc) se lit vide ; le catalogue en cache
  // est réécrit en entier à la synchronisation suivante (`remplacerTout`).
  // ⚠️ `habilete` DEPUIS 66C (v2_071, QUESTIONNAIRE §5 quater.3) — MÊME PIÈGE : omise, elle vaudrait `undefined`, et
  // le générateur ne saurait plus qu'un muscle-up ne s'ajoute jamais. Une ligne sans la colonne (cache d'avant v2_071,
  // faux serveur) se lit `false` : le générateur lit `!fiche.habilete`.
  // ⚠️ `schema_mouvement` DEPUIS 67A (v2_074, MOTEUR §13.6 bis) — MÊME PIÈGE : omise, elle vaudrait `undefined`, et
  // « Même famille » disparaîtrait de « Remplacer » sans une erreur. Une ligne sans la colonne (cache d'avant v2_074,
  // faux serveur) se lit sans famille : `Modele.cousinsDe` rend `[]`.
  function tousLesExercices() {
    return paginerParCle(trancheur(function () {
      return client().from('exercises')
        .select('slug, nom, mesure, charge, parent, equipement, muscles_primaires, muscles_secondaires, ' +
                'muscles_stabilisateurs, mouvement, habilete, schema_mouvement');
    }, 'slug'), 'slug');
  }

  // ══ ROUTINES — la première écriture du projet v2 ═════════════════════════
  //
  // Lecture ET écriture. Le corpus importé, lui, reste en lecture seule.
  //
  // Aucun `.eq('user_id', …)` ici non plus, pas même sur une table qu'on écrit :
  // le cloisonnement est le travail du RLS. `routines.user_id` est en revanche
  // RENSEIGNÉ à l'insertion — sans lui, le WITH CHECK de la policy refuse la
  // ligne, ce qui est exactement ce qu'on veut d'une valeur obligatoire.
  //
  // `routine_exercises` n'a pas de `user_id` : sa propriété est héritée de
  // `routines` par un EXISTS. Une insertion sur la routine d'autrui est refusée
  // côté serveur, et l'erreur remonte — elle n'est jamais avalée.
  //
  // Pas de pagination ici, contrairement à tout le reste du fichier. Le volume
  // est d'un autre ordre : une bibliothèque de routines se compte en dizaines,
  // pas en dizaines de milliers. La pagination par curseur existe pour les
  // 28 103 séries, pas par principe.

  // ⚠️ `rang` DEPUIS v2_043 (ch. 46). Sans elle dans cette liste, PostgREST ne
  // renvoie jamais la colonne — la bibliothèque trierait sur un champ absent et
  // retomberait silencieusement sur le nom.
  // ⚠️ ET `dossier` DEPUIS v2_057 (ch. 52, §7 duodecies.3) : une étiquette,
  // NULL pour « Sans dossier ». Même raison que `rang` : absente d'ici, la
  // bibliothèque ne saurait jamais regrouper.
  // ⚠️ ET `jours` DEPUIS v2_084 (99, MOTEUR §9.24) : les jours prévus (1 = lundi … 7 = dimanche, NULL = sans
  // jour). Le même piège : absente d'ici, elle serait écrite et jamais relue.
  var COLONNES_ROUTINE = 'id, nom, note, archivee_a, rang, dossier, jours, created_at, modifiee_a';
  // `note` est LUE et jamais écrite par l'éditeur de routine — c'est la fin de
  // séance qui la pose (§7 septies.1, « la note suit l'exercice quand on le
  // réutilise »). La tenir hors de `CHAMPS_EXERCICE` (routines.js) est ce qui
  // garantit qu'un réordonnancement ne l'efface pas.
  // ⚠️ `series` ET `reps_visees` NE SONT PLUS LUES (chantier 43). Depuis
  // `v2_042_routine_sets`, la structure d'un exercice de routine est une LIGNE
  // PAR SÉRIE, comme en séance. Garder les deux entiers à côté, c'était deux
  // sources pour la même information — ce que `CADRAGE-V2` §2 undecies
  // interdit. Les colonnes restent en base le temps de la conversion ; ce code
  // ne les lit plus et ne les écrit plus.
  var COLONNES_ROUTINE_EXO =
    'id, routine_id, exercise_slug, rang, repos_cible_s, note, groupe_superset';

  // Le miroir de `sets` pour les routines. Même forme, donc même rendu.
  var COLONNES_ROUTINE_SET =
    'id, routine_exercise_id, rang, type_serie, reps_visees, charge_cible_kg, ' +
    'duree_cible_s, distance_cible_m';

  // Les routines AVEC leurs exercices, en une requête. L'imbrication PostgREST
  // suit la clé étrangère `routine_exercises.routine_id`.
  async function mesRoutines() {
    var r = await client().from('routines')
      .select(COLONNES_ROUTINE + ', routine_exercises(' + COLONNES_ROUTINE_EXO +
              ', routine_sets(' + COLONNES_ROUTINE_SET + '))')
      .order('rang', { ascending: true, nullsFirst: false })
      .order('nom', { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }

  // `select().single()` après l'insertion : on a besoin de l'`id` généré pour
  // écrire les exercices dans la foulée.
  async function creerRoutine(champs) {
    var r = await client().from('routines').insert(champs).select(COLONNES_ROUTINE).single();
    if (r.error) throw r.error;
    return r.data;
  }

  // ⚠️ `modifiee_a` est écrite À LA MAIN. Relevé en base : la colonne a
  // `DEFAULT now()` mais AUCUN trigger ne la met à jour. Sans cette ligne, elle
  // dirait la date de création et mentirait à la première modification.
  async function majRoutine(id, champs) {
    var avec = Object.assign({}, champs, { modifiee_a: new Date().toISOString() });
    var r = await client().from('routines').update(avec).eq('id', id).select(COLONNES_ROUTINE).single();
    if (r.error) throw r.error;
    return r.data;
  }

  async function insererExercices(lignes) {
    if (!lignes || !lignes.length) return [];
    var r = await client().from('routine_exercises').insert(lignes).select(COLONNES_ROUTINE_EXO);
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function majExercice(id, champs) {
    var r = await client().from('routine_exercises').update(champs).eq('id', id);
    if (r.error) throw r.error;
  }

  async function supprimerExercices(ids) {
    if (!ids || !ids.length) return;
    var r = await client().from('routine_exercises').delete().in('id', ids);
    if (r.error) throw r.error;
  }

  // ══ LES SÉRIES PROGRAMMÉES (`v2_042_routine_sets`) ══════════════════
  //
  // ⚠️ ON REMPLACE LES LIGNES D'UN EXERCICE, ON NE LES PERMUTE PAS.
  // `routine_exos_rang_uniq` est NON différable : c'est pour ça que
  // `planEcritures` danse. `routine_sets_rang_unique` est DIFFÉRABLE, et rien
  // ne référence l'identifiant d'une série programmée — une séance en copie la
  // structure, jamais les identifiants. Supprimer puis réinsérer est donc
  // exact, idempotent, et ne demande aucun plan.
  //
  // `user_id` est OBLIGATOIRE sur `routine_sets`, contrairement à
  // `routine_exercises` dont la propriété s'hérite par un EXISTS. Sans lui, le
  // WITH CHECK de la policy refuse la ligne.
  async function remplacerSeriesRoutine(routineExerciceId, lignes) {
    var r = await client().from('routine_sets').delete().eq('routine_exercise_id', routineExerciceId);
    if (r.error) throw r.error;
    if (!lignes || !lignes.length) return [];
    var i = await client().from('routine_sets').insert(lignes).select(COLONNES_ROUTINE_SET);
    if (i.error) throw i.error;
    return i.data || [];
  }

  // Supprimer une routine entière. Deux appelants : défaire une création dont
  // les exercices ont échoué — sans ça, un réseau qui lâche au mauvais moment
  // laisserait une routine vide et un nom pris pour rien — et le geste
  // « Supprimer » de l'éditeur (§7 duodecies.1), qui remplace l'archivage.
  //
  // ⚠️ CE QUI PART, ET CE QUI RESTE — relevé sur les contraintes, pas supposé :
  //   `routine_exercises_routine_id_fkey`  ON DELETE CASCADE  → les exercices
  //      de la routine partent avec elle ;
  //   `sessions_routine_fk`                ON DELETE SET NULL → les séances
  //      DÉJÀ FAITES restent intactes, avec toutes leurs séries.
  // Rien de ce qui a été fait ne dépend de la routine dont c'est issu.
  async function supprimerRoutine(id) {
    var r = await client().from('routines').delete().eq('id', id);
    if (r.error) throw r.error;
  }

  // ══ SÉANCES ET SÉRIES — l'écriture de l'écran de saisie ══════════════════
  //
  // Tout passe par des `upsert` sur l'`id` fabriqué côté client. C'est ce qui
  // rend l'envoi IDEMPOTENT : rejouer la file après une coupure ne crée pas de
  // doublon, elle écrase la même ligne. Aucune de ces fonctions n'est appelée
  // depuis la saisie — seule la VIDANGE de la file les appelle, et seulement
  // quand le réseau répond.
  //
  // `user_id` est écrit sur les deux tables : leur policy RLS est
  // `user_id = auth.uid()` en USING **et** en WITH CHECK. Sans lui, la ligne
  // est refusée — ce qui est exactement ce qu'on veut d'une valeur obligatoire.

  async function enregistrerSeance(ligne) {
    var r = await client().from('sessions').upsert(ligne, { onConflict: 'id' });
    if (r.error) throw r.error;
  }

  // La séance part avec ses séries : `sets_session_id_fkey` est ON DELETE
  // CASCADE. Un abandon ne laisse donc aucune orpheline.
  async function supprimerSeance(id) {
    var r = await client().from('sessions').delete().eq('id', id);
    if (r.error) throw r.error;
  }

  // 83 (12/10/2026) — CE QUE L'ENVOI SUPPRIME : les séries en base de la séance
  // que CET APPAREIL CONNAÎT (`connues` : celles qu'il a envoyées ou chargées
  // depuis la base pour elle) et qui ne sont plus dans sa liste. Une série
  // jamais vue par l'appareil — validée sur un autre, pendant ce temps — n'est
  // jamais supprimée par lui (ECRAN-SAISIE §7 duovicies.1 bis). `connues` absent
  // (une entrée de file posée avant ce correctif) : l'ancienne règle, tout ce qui
  // n'est pas dans la liste. Pure : `existantes` et `liste` sont des ids.
  function aRetirerDe(existantes, liste, connues) {
    var gardes = {}, connu = null;
    (liste || []).forEach(function (id) { gardes[id] = true; });
    if (Array.isArray(connues)) {
      connu = {};
      connues.forEach(function (id) { connu[id] = true; });
    }
    return (existantes || []).filter(function (id) {
      return !gardes[id] && (connu === null || connu[id] === true);
    });
  }

  // Met la base À L'IMAGE de ce que l'app a en local pour cette séance — pour
  // les séries que cet appareil CONNAÎT (83) : celles d'un autre appareil
  // restent, l'upsert ne touche que les siennes.
  //
  // ⚠️ L'UPSERT EST EN UN SEUL LOT, et ce n'est pas une optimisation :
  // `sets_rang_unique` est UNIQUE (session_id, rang) **DEFERRABLE INITIALLY
  // DEFERRED**. Différée, elle n'est vérifiée qu'à la fin de la transaction —
  // donc un lot peut permuter des rangs sans heurt. Envoyées une par une,
  // chacune dans sa transaction, les mêmes lignes échoueraient sur la première.
  //
  // On lit ce qui existe AVANT d'écrire, plutôt que de deviner : c'est ce qui
  // permet de supprimer ce qui a été dévalidé. Mais on ne supprime que ce qu'on
  // connaît (`aRetirerDe`, 83) : deux appareils sur la même séance
  // s'effaçaient l'un l'autre (prouvé au banc, 82).
  async function remplacerSeries(sessionId, lignes, connues) {
    var liste = lignes || [];

    var existantes = await client().from('sets').select('id').eq('session_id', sessionId);
    if (existantes.error) throw existantes.error;

    var aRetirer = aRetirerDe((existantes.data || []).map(function (e) { return e.id; }),
      liste.map(function (l) { return l.id; }), connues);

    // ⚠️ SUPPRIMER D'ABORD, UPSERTER ENSUITE. L'ordre inverse est cassé, et il
    // l'était : retirer une série du MILIEU décale les suivantes vers le bas,
    // donc l'upsert écrirait le rang 2 sur une ligne alors que l'ancienne
    // ligne de rang 2 est encore là. `sets_rang_unique` n'est différée qu'À
    // L'INTÉRIEUR d'une transaction — et la suppression, faite après, est une
    // transaction séparée. Collision garantie.
    //
    // Défaut trouvé au banc d'écran, en retirant une série du milieu d'une
    // séance déjà montée. Retirer la dernière ne l'aurait jamais montré : aucun
    // rang ne bouge.
    //
    // Si l'upsert échoue après la suppression, rien n'est perdu : tout est en
    // local, l'intention reste dans la file, et le prochain passage rejoue.
    if (aRetirer.length) {
      var d = await client().from('sets').delete().in('id', aRetirer);
      if (d.error) throw d.error;
    }

    if (liste.length) {
      var r = await client().from('sets').upsert(liste, { onConflict: 'id' });
      if (r.error) throw r.error;
    }
    return { envoyees: liste.length, retirees: aRetirer.length };
  }

  // Les séances encore ouvertes. Sert au démarrage : une seule séance en cours
  // à la fois, et si une existe on la reprend au lieu d'en créer une seconde.
  // Pas de filtre sur `user_id` — c'est le travail du RLS.
  async function seancesEnCours() {
    var r = await client().from('sessions')
      .select(colonnesSeance()).eq('statut', 'en_cours');
    if (r.error) throw r.error;
    return r.data || [];
  }

  // Referme une séance restée `en_cours` en base (chantier 36, D7).
  //
  // UPDATE CIBLÉ, jamais un upsert de la ligne entière : `sessions` porte des
  // colonnes GÉNÉRÉES (`salle_norme`) que Postgres refuse en écriture, et on
  // n'a aucune raison de réécrire des colonnes qu'on n'a pas lues.
  //
  // `fin` n'est PAS renseignée, et c'est délibéré : on sait que la séance est
  // terminée, on ne sait pas QUAND. Inventer une fin — maintenant, ou l'heure
  // du début — écrirait un fait faux dans la colonne qui dit précisément
  // combien de temps elle a duré. `sessions.fin` accepte NULL.
  async function refermerSeance(id) {
    var r = await client().from('sessions').update({ statut: 'terminee' }).eq('id', id);
    if (r.error) throw r.error;
  }

  // Les séries d'une séance, pour reprendre une séance ouverte sur un autre
  // appareil — ou après une réinstallation.
  async function seriesDeSeance(sessionId) {
    var r = await client().from('sets').select(colonnesSerie())
      .eq('session_id', sessionId).order('rang', { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }

  // ══ LES CORRECTIONS DE ZONE (§9.1.1, chantier 48b-7) ═════════════════════
  //
  // `zones_exercice` est un HISTORIQUE EN AJOUT SEUL : chaque choix ajoute une
  // ligne, la plus récente par `corrigee_a` fait foi, une zone vide ramène à la
  // déduction. La politique du propriétaire est `(select auth.uid())` : la
  // lecture ne ramène que les siennes, on ne filtre donc pas par `user_id`.
  // §9.22 (53-2, v2_058) — `origine` (`personne` | `bloc`) et `bloc_id` : un bloc
  // pose ses zones comme des lignes datées, lues comme les autres (§9.1.2
  // amendé). Absentes, `origine` vaut `personne` en base (défaut).
  var COLONNES_ZONE = 'id, user_id, exercise_slug, zone, corrigee_a, created_at, origine, bloc_id';

  function mesZones() {
    return paginerParCle(trancheur(function () {
      return client().from('zones_exercice').select(COLONNES_ZONE);
    }, 'id'), 'id');
  }

  // ⚠️ `upsert` SUR `id`, ET L'IDENTIFIANT VIENT DE L'APPAREIL. C'est ce qui
  // rend l'envoi idempotent : la file peut rejouer la même intention sans
  // jamais doubler la ligne. `user_id` et `corrigee_a` sont posés par l'app,
  // jamais laissés au défaut du serveur — l'ordre des choix faits hors ligne
  // est celui des gestes, pas celui du retour du réseau.
  async function enregistrerZone(ligne) {
    var r = await client().from('zones_exercice').upsert(ligne, { onConflict: 'id' })
      .select(COLONNES_ZONE).single();
    if (r.error) throw r.error;
    return r.data;
  }

  // ══ LE MODE DE CHAQUE EXERCICE (§9.17, 50-1) ═════════════════════════════
  //
  // `modes_exercice` — `progresser` ou `entretien` — suit EXACTEMENT le patron
  // de `zones_exercice` : un historique en ajout seul, la ligne la plus récente
  // par `choisi_a` fait foi, la politique du propriétaire est
  // `(select auth.uid())` (la lecture ne ramène que les siennes), l'identifiant
  // vient de l'appareil (l'envoi est idempotent), `user_id` et `choisi_a` sont
  // posés par l'app au geste. Un réglage EXPLICITE : le coach ne le propose
  // jamais (CADRAGE, 15/09 : l'intention ne se déduit pas des données).
  var COLONNES_MODE = 'id, user_id, exercise_slug, mode, choisi_a, created_at';

  function mesModes() {
    return paginerParCle(trancheur(function () {
      return client().from('modes_exercice').select(COLONNES_MODE);
    }, 'id'), 'id');
  }

  async function enregistrerMode(ligne) {
    var r = await client().from('modes_exercice').upsert(ligne, { onConflict: 'id' })
      .select(COLONNES_MODE).single();
    if (r.error) throw r.error;
    return r.data;
  }

  // ══ LES PRÉDICTIONS (§9.11, 48c) ═════════════════════════════════════════
  //
  // ⚠️ UN INSERT QUI IGNORE LES DOUBLONS, JAMAIS UN UPSERT. Le trigger
  // `predictions_immuable` (`v2_046`) compare `to_jsonb(new)` moins les trois
  // colonnes d'observation à `to_jsonb(old)` moins ces mêmes colonnes, et lève
  // une exception si ça diffère : un upsert rejoué par la file ferait un
  // UPDATE qui touche les autres colonnes, donc une erreur DÉFINITIVE et une
  // entrée bloquée pour toujours. `ignoreDuplicates` rend l'envoi idempotent
  // par la porte que le trigger laisse ouverte : ne rien faire.
  var COLONNES_PREDICTION = 'id, user_id, module, module_version, emise_a, exercise_slug, ' +
    'grandeur, horizon_jours, valeur_predite, borne_basse, borne_haute, fondement, ' +
    'valeur_observee, observee_a, set_observe';

  // §12.9 (49-U13) — les séances qui portent au moins un pari, par exercice :
  // trois colonnes, pas quinze. `session_id` est une colonne GÉNÉRÉE en base
  // (`fondement->>'seance'`) : on n'a pas à rapatrier le fondement pour la lire.
  // MOTEUR §14.4 (49-U14) : plus `compteur`, le compteur de l'exercice à
  // l'ouverture que chaque pari de consigne fige dans son fondement — le seul
  // champ du fondement qui descend (`fondement->compteur`).
  function seancesAvecPari() {
    return paginerParCle(trancheur(function () {
      // §9.22 (53-2) — plus `module`, et la valeur prédite et observée : le
      // bilan de fin de bloc compte les paris de consigne tenus.
      return client().from('predictions').select('id, exercise_slug, session_id, compteur:fondement->compteur, ' +
        'module, valeur_predite, valeur_observee');
    }, 'id'), 'id');
  }

  // MOTEUR §14.4 (49-U14) — les paris de l'ESCALIER, en entier (une ligne par
  // carte : peu). `module = 'escalier'` les distingue des paris de consigne.
  function parisEscalier() {
    return paginerParCle(trancheur(function () {
      return client().from('predictions').select(COLONNES_PREDICTION).eq('module', 'escalier');
    }, 'id'), 'id');
  }

  // §9.22 (53-2) — les paris de PROGRAMME, en entier (un par bloc : peu).
  function parisProgramme() {
    return paginerParCle(trancheur(function () {
      return client().from('predictions').select(COLONNES_PREDICTION).eq('module', 'programme');
    }, 'id'), 'id');
  }

  // ══ LES BLOCS D'UN PROGRAMME (MOTEUR §9.22, 53-2, v2_058) ══════════════════
  //
  // Un bloc : un dossier, une zone (Lourd ou Mix), un début, une durée, une
  // décharge, ses exercices, un statut. La politique du propriétaire : la
  // lecture ne ramène que les siens. L'identifiant vient de l'appareil et
  // l'écriture est un `upsert` sur `id` : la file peut la rejouer sans doubler
  // (le statut change par la même porte).
  var COLONNES_BLOC = 'id, user_id, dossier, zone, debut, semaines, decharge, exercices, statut, precedent, ' +
    'created_at, modifie_a';

  function mesBlocs() {
    return paginerParCle(trancheur(function () {
      return client().from('blocs').select(COLONNES_BLOC);
    }, 'id'), 'id');
  }

  async function enregistrerBloc(ligne) {
    var r = await client().from('blocs').upsert(ligne, { onConflict: 'id' }).select(COLONNES_BLOC).single();
    if (r.error) throw r.error;
    return r.data;
  }

  // L'outil de rejeu (développement seulement, `rejeu.js`) — les paris d'UNE
  // séance, en LECTURE : `session_id` est la colonne générée depuis le
  // fondement. Rien d'autre ne l'appelle.
  function parisDeSeance(sessionId) {
    return paginerParCle(trancheur(function () {
      return client().from('predictions').select(COLONNES_PREDICTION).eq('session_id', sessionId);
    }, 'id'), 'id');
  }

  function mesPredictions() {
    return paginerParCle(trancheur(function () {
      return client().from('predictions').select(COLONNES_PREDICTION);
    }, 'id'), 'id');
  }

  // ⚠️ LE PARI S'INSÈRE SANS SON OBSERVATION (§9.11, 27/09/2026). L'observation
  // part par sa propre entrée, derrière les séries qu'elle désigne : insérée
  // avec le pari, `set_observe` pouvait viser une série dévalidée entre-temps,
  // et l'insertion entière échouait en 23503.
  async function enregistrerPrediction(ligne) {
    var sansObservation = Object.assign({}, ligne,
      { valeur_observee: null, observee_a: null, set_observe: null });
    var r = await client().from('predictions')
      .upsert(sansObservation, { onConflict: 'id', ignoreDuplicates: true });
    if (r.error) throw r.error;
    return ligne;
  }

  // L'observation part par une mise à jour ÉTROITE : trois colonnes, pas la
  // ligne. C'est la seule forme que le trigger accepte sur une ligne déjà là —
  // et celle qui rejoue sans risque quand l'insert, lui, n'a rien fait.
  //
  // ⚠️ ELLE DOIT PROUVER QU'ELLE A TOUCHÉ LE PARI (27/09/2026). Un UPDATE qui ne
  // trouve aucune ligne répond 204 sans erreur : partie avant son pari, elle
  // comptait comme faite et quittait la file. On relit l'identifiant touché
  // (`return=representation`) : zéro ligne, ce n'est pas fait — une erreur
  // temporaire, que la vidange retente.
  var AUCUNE_LIGNE = 'TH000';

  async function observerPrediction(id, champs) {
    var r = await client().from('predictions').update({
      valeur_observee: champs.valeur_observee,
      observee_a: champs.observee_a,
      set_observe: champs.set_observe === undefined ? null : champs.set_observe
    }).eq('id', id).select('id');
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) {
      throw { code: AUCUNE_LIGNE, message: 'observation : aucun pari touché (' + id + ')' };
    }
    return true;
  }

  // ══ LE JOURNAL DES RECORDS (MOTEUR §9.23, 58-2 ; v2_061, v2_062) ══════════
  //
  // Chaque record battu, une fois : une ligne par série et par type. La
  // politique du propriétaire ne permet que de LIRE et d'AJOUTER ses lignes ;
  // `records_immuable` refuse toute modification, et une ligne ne disparaît
  // qu'avec sa série (cascade, ou `sets_efface_records` quand la série est
  // corrigée). Aucune suppression par l'app.
  var COLONNES_RECORD = 'id, user_id, set_id, session_id, exercise_slug, type, valeur, reps, charge, ' +
    'unite, ancien, ancien_le, sur_douze_mois, battu_le, created_at';

  // INCRÉMENTAL sur `created_at` : une ligne ne se modifie jamais, une neuve
  // est la seule nouveauté possible. Ce qui DISPARAÎT ne revient pas par ici —
  // c'est le compte (`compterRecords`) qui le révèle (`app.js`, `synchroniserJournal`).
  function recordsDepuis(curseur) {
    return paginerParCle(trancheur(function () {
      var q = client().from('records').select(COLONNES_RECORD);
      if (curseur) q = q.gt('created_at', curseur);
      return q;
    }, 'id'), 'id');
  }

  function compterRecords() { return compter(function () { return client().from('records'); }); }

  // ⚠️ LE SEUL ÉCRIVAIN DU JOURNAL, et il n'est appelé que par la vidange de la
  // file (`app.js`, `executer`). UN AJOUT QUI IGNORE LES DOUBLONS, JAMAIS UN
  // UPSERT QUI MODIFIE : `ON CONFLICT (set_id, type) DO NOTHING`. Un envoi
  // rejoué — la file après une coupure, le remplissage repris, une Édition qui
  // réécrit toute la séance — ne touche pas aux lignes déjà là ; un upsert qui
  // fusionne les réécrirait, et `records_immuable` le refuserait.
  // L'identifiant n'est pas envoyé : la base le tire (`gen_random_uuid()`).
  async function ajouterRecords(lignes) {
    if (!lignes || !lignes.length) return;
    var r = await client().from('records')
      .upsert(lignes, { onConflict: 'set_id,type', ignoreDuplicates: true });
    if (r.error) throw r.error;
  }

  // ══ LA PESÉE (60-2a, QUESTIONNAIRE-COACH-V2 §3, écran « Toi ») ═══════════
  //
  // L'ÉCRIVAIN UNIQUE de `body_weight_log` (le garde d'architecture le dit :
  // la table ne s'écrit que dans cette fonction, et elle ne s'appelle que depuis
  // `executer`, `app.js`). Jusqu'ici la table n'était que lue.
  //
  // UN UPSERT SUR (`user_id`, `date`), QUI FUSIONNE : deux pesées le même jour
  // ne font qu'une, la DERNIÈRE l'emporte. À l'inverse du journal des records,
  // une pesée se corrige — le contraire d'`ignoreDuplicates`. Le SDK pose
  // `on_conflict=user_id,date` et `Prefer: resolution=merge-duplicates` ; la
  // règle d'accès est `FOR ALL` propriétaire, donc `ligne.user_id` est celui de
  // la session. L'identifiant n'est pas envoyé : la base le tire.
  // ══ 99 (MOTEUR §9.24, v2_085) — LES CHOIX DE LA SEMAINE QUI DÉRAILLE ══════
  // Colonnes de la migration : `user_id`, `semaine` (le lundi), `routine_id`, `choix`, `detail`, `cree_le`.
  // Lus au démarrage (les semaines récentes suffisent : un choix ne vaut que pour sa semaine) ; écrits par la file,
  // un `upsert` sur la clé (user_id, semaine, routine_id).
  var COLONNES_SEMAINE_CHOIX = 'user_id, semaine, routine_id, choix, detail, cree_le';
  async function mesChoixDeSemaine(depuis) {
    var r = await client().from('semaine_choix').select(COLONNES_SEMAINE_CHOIX).gte('semaine', depuis);
    if (r.error) throw r.error;
    return r.data || [];
  }
  async function enregistrerChoixDeSemaine(ligne) {
    var r = await client().from('semaine_choix').upsert(ligne, { onConflict: 'user_id,semaine,routine_id' });
    if (r.error) throw r.error;
  }

  async function enregistrerPesee(ligne) {
    var r = await client().from('body_weight_log').upsert(ligne, { onConflict: 'user_id,date' });
    if (r.error) throw r.error;
  }

  // ══ LES NOMS D'EXERCICES IMPORTÉS (69, ECRAN-PROFIL §2.4 quater) ══════════
  //
  // Colonnes RELEVÉES AU SCHÉMA (information_schema.columns, 11/10/2026), pas
  // supposées :
  //   `exercise_alias` — alias text (clé primaire, le nom TEL QUEL, pas
  //     normalisé) · slug text · source text · created_at ; lecture seule pour
  //     tous (`exercise_alias_read_all`). ⚠️ La colonne s'appelle `slug`, pas
  //     `exercise_slug`.
  //   `alias_exercice` (`v2_076`) — id uuid · user_id uuid (défaut
  //     `auth.uid()`) · alias text · alias_norme text GÉNÉRÉE (lue, jamais
  //     envoyée) · exercise_slug text · created_at ; les siennes seulement
  //     (`alias_exercice_owner`), unicité (`user_id`, `alias_norme`).
  // L'import demande une connexion : ces deux lectures sont faites à l'aperçu,
  // jamais mises en cache.
  function aliasCommuns() {
    return paginerParCle(trancheur(function () {
      return client().from('exercise_alias').select('alias, slug, source');
    }, 'alias'), 'alias');
  }

  function mesAlias() {
    return paginerParCle(trancheur(function () {
      return client().from('alias_exercice').select('id, user_id, alias, alias_norme, exercise_slug, created_at');
    }, 'id'), 'id');
  }

  // L'ÉCRIVAIN UNIQUE d'`alias_exercice` (la garde d'architecture le dit :
  // la table ne s'écrit que dans cette fonction, et elle ne s'appelle que
  // depuis `executer`, `app.js`). UN UPSERT SUR (`user_id`, `alias_norme`) QUI
  // FUSIONNE : rattacher de nouveau le même nom remplace le choix d'avant.
  // `alias_norme` est générée et n'est JAMAIS envoyée ; l'identifiant non plus
  // (la base le tire). `ligne` : `{ user_id, alias, exercise_slug }`.
  async function enregistrerAlias(ligne) {
    var r = await client().from('alias_exercice').upsert(ligne, { onConflict: 'user_id,alias_norme' });
    if (r.error) throw r.error;
  }

  // ══ LE PROFIL (chantier 46 §2) ═══════════════════════════════════════════
  //
  // Une ligne, la sienne. `profiles_select_own` est `auth.uid() = id` : ce
  // `.eq('id', …)` ne cloisonne rien — le RLS s'en charge — il désigne
  // simplement la ligne qu'on veut, parce que `maybeSingle` sur une table qui
  // en rendrait deux serait une erreur qu'on ne veut pas courir.
  //
  // `maybeSingle` et pas `single` : AUCUN TRIGGER NE CRÉE LA LIGNE. Relevé sur
  // `pg_trigger` — il n'y a rien sur `auth.users`. Un compte tout neuf n'a donc
  // pas de profil, et `single` ferait remonter une erreur là où la bonne réponse
  // est « pas encore ».
  // ⚠️ `rythme_progression` DEPUIS 48b-4. Elle existe en base depuis `v2_046`
  // avec un défaut `normal`, et PostgREST ne renvoie QUE ce qu'on nomme :
  // omise, elle vaudrait `undefined` à chaque lecture, l'écran afficherait
  // toujours « Normal », et le choix de l'utilisateur disparaîtrait à chaque
  // rechargement — sans une erreur, sans une trace. Même piège pour `phase` et
  // `phase_depuis` (49-U11, `v2_051`) : omises, la phase serait toujours lue
  // « maintien ».
  //
  // 60-1 — `mode_entrainement`, `unites`, `niveau_declare` et `jours_vises` ne
  // sont plus lues : aucune règle ne les lit, l'écran ne les montre plus et
  // `THProfil.CHAMPS_ECRITS` ne les écrit plus (leurs valeurs restent en base).
  var COLONNES_PROFIL =
    'id, username, bio, sexe, taille_cm, date_naissance, ' +
    'anciennete, intention, rythme_progression, phase, phase_depuis, materiel, ' +
    'lest_reponse, lest_reponse_le, ' +
    'seances_par_semaine, duree_seance_min, ' +
    // 60-2a (`v2_065`) — le questionnaire du coach. Omises ici, elles seraient
    // écrites mais jamais relues, et `profil = rendu` les effacerait de l'état
    // local après le premier envoi : le piège de `rythme_progression` et de
    // `phase`. `programme_choix` depuis 60-3 (l'écran 8) ; `zone_force_reponse*` n'y est PAS.
    'objectif, objectif_depuis, priorites, temps_reponse, historique_declare, ' +
    'phase_confirmee_le, questionnaire_fait_le, programme_choix, ' +
    // 60-4 (`v2_066`) — le programme construit : écrites, donc relues (le même piège).
    'zones_a_menager, exercices_ecartes, programme_construit_dossier, programme_construit_le, carte_cycles_le, ' +
    // 64B (`v2_068`, NOT NULL DEFAULT true) — l'interrupteur du jeu : écrit, donc relu (le même piège).
    'jeu_actif, ' +
    // 87 (`v2_078`) — le social : le compte privé (NOT NULL DEFAULT true), et le niveau et le titre du jeu
    // que l'app publie (`jeu_niveau`, `jeu_titre`). Écrits, donc relus (le même piège).
    'compte_prive, jeu_niveau, jeu_titre, ' +
    // 104 (`v2_086`) — les bilans déjà annoncés. Écrite, donc relue (le même piège). FACULTATIVE : ci-dessous.
    'bilans_annonces, ' +
    'onboarding_completed';

  // ⚠️ 104 — UNE COLONNE FACULTATIVE NE CASSE JAMAIS LE PROFIL (le défaut de #418). Nommer une colonne que la base
  // n'a pas encore (migration pas lancée) fait échouer la lecture ENTIÈRE (`42703`, « column … does not exist ») et
  // l'écriture ENTIÈRE (`PGRST204`, « Could not find the '…' column ») : plus de profil, et un envoi retenté sans fin.
  // Une colonne de cette liste n'est qu'un confort (l'appareil garde sa propre mémoire) : si la base dit qu'elle
  // n'existe pas, elle quitte la lecture et l'écriture POUR LA SESSION, et la même requête repart une fois sans elle.
  // La migration lancée, le prochain démarrage la reprend. Une colonne obligatoire n'entre JAMAIS ici.
  var COLONNES_FACULTATIVES = ['bilans_annonces'];
  var facultativesAbsentes = {};
  function colonnesProfil() {
    return COLONNES_PROFIL.split(', ').filter(function (c) { return !facultativesAbsentes[c]; }).join(', ');
  }
  // La colonne facultative que l'erreur dit absente, ou `null` (toute autre erreur reste une erreur).
  function facultativeAbsente(err) {
    if (!err || (err.code !== '42703' && err.code !== 'PGRST204')) return null;
    var txt = String(err.message || '') + ' ' + String(err.details || '');
    for (var i = 0; i < COLONNES_FACULTATIVES.length; i++) {
      var c = COLONNES_FACULTATIVES[i];
      if (!facultativesAbsentes[c] && txt.indexOf(c) >= 0) return c;
    }
    return null;
  }
  function sansAbsentes(champs) {
    var out = {};
    Object.keys(champs || {}).forEach(function (c) { if (!facultativesAbsentes[c]) out[c] = champs[c]; });
    return out;
  }

  async function monProfil(id) {
    for (;;) {
      var r = await client().from('profiles').select(colonnesProfil()).eq('id', id).maybeSingle();
      var absente = facultativeAbsente(r.error);
      if (absente) { facultativesAbsentes[absente] = true; continue; }   // une fois par colonne : la boucle finit
      if (r.error) throw r.error;
      return r.data || null;
    }
  }

  // `upsert` plutôt qu'`insert` puis `update` : c'est la même écriture dans les
  // deux cas, et le profil d'un compte neuf n'existe pas encore. `id` est la
  // clé primaire, donc le conflit est exactement celui qu'on veut écraser.
  //
  // ⚠️ `champs` EST DÉJÀ FILTRÉ PAR `THProfil.champsEcrits` chez l'appelant —
  // `is_admin`, `tier` et les visibilités ne traversent pas cette fonction.
  async function enregistrerProfil(id, champs) {
    for (;;) {
      var ligne = Object.assign({ id: id }, sansAbsentes(champs), { updated_at: new Date().toISOString() });
      var r = await client().from('profiles').upsert(ligne, { onConflict: 'id' })
        .select(colonnesProfil()).single();
      var absente = facultativeAbsente(r.error);
      if (absente) { facultativesAbsentes[absente] = true; continue; }   // la même ligne, sans elle (rien n'a été écrit)
      if (r.error) throw r.error;
      return r.data;
    }
  }

  // ── « Ce pseudo est-il pris ? » ──────────────────────────────────────────
  //
  // ⚠️ CETTE QUESTION NE PEUT PAS SE POSER EN SELECT, ET C'EST VÉRIFIÉ.
  //   · `profiles_select_own` restreint le SELECT à `auth.uid() = id` — la ligne
  //     de quelqu'un d'autre ne remonte JAMAIS ;
  //   · la vue `public_profiles` est en `security_invoker=on`, donc soumise au
  //     même RLS, et `anon` n'a aucun GRANT dessus ;
  //   · à l'inscription il n'y a pas encore de session du tout.
  // Un `select … where username = …` rendrait donc « zéro ligne » pour un pseudo
  // PRIS. Répondre « libre » là-dessus serait affirmer le contraire de la
  // vérité : on ne le fait pas.
  //
  // La seule réponse juste vient du serveur, par une fonction SECURITY DEFINER.
  // Tant qu'elle n'existe pas, PostgREST répond PGRST202 et on rend `null` —
  // « on ne sait pas » — ce que `THProfil.verdictPseudo` traduit par un silence.
  // Le disjoncteur évite de reposer la question à chaque frappe une fois la
  // réponse connue comme indisponible.
  var pseudoSansReponse = false;

  async function pseudoPris(nom) {
    if (pseudoSansReponse || !nom) return null;
    var r = await client().rpc('pseudo_libre', { nom: nom });
    if (r.error) {
      // 404 de fonction, ou refus de droit : la question n'a pas de réponse, et
      // elle n'en aura pas de la session. Tout autre échec (réseau) reste
      // ponctuel et sera reposé à la frappe suivante.
      if (r.error.code === 'PGRST202' || r.error.code === '42883' ||
          r.error.code === '42501') pseudoSansReponse = true;
      return null;
    }
    if (typeof r.data !== 'boolean') return null;
    return !r.data;
  }

  // Droit à l'oubli. La fonction existe en base depuis la v1
  // (`delete_user_complete_data(target_user_id uuid)`), et c'est ELLE qui sait
  // ce qui part — pas ce fichier. On ne réécrit pas une suppression en
  // plusieurs DELETE côté client : c'est exactement ainsi qu'on en oublie un.
  async function supprimerCompte(id) {
    var r = await client().rpc('delete_user_complete_data', { target_user_id: id });
    if (r.error) throw r.error;
  }

  // ══ LE SOCIAL (87, SOCIAL-V1, migration `v2_078`) ═════════════════════════
  //
  // ⚠️ LES AUTRES NE SE LISENT QUE PAR LES FONCTIONS DE LA BASE : elles ne
  // rendent que les colonnes autorisées (jamais poids de corps, note, RPE,
  // ressenti, douleur) et appliquent les cercles et les blocages côté serveur.
  // Aucune lecture directe de `sessions`, `sets` ou `profiles` d'autrui.
  // Les écritures sont directes, en ligne (pas de file) : un geste social
  // refusé hors réseau se dit à l'écran, il ne se rejoue pas plus tard.
  async function rpc(nom, args) {
    var r = await client().rpc(nom, args || {});
    if (r.error) throw r.error;
    return r.data;
  }
  async function socialProfil(pseudo) {
    var d = await rpc('social_profil', { p_pseudo: pseudo });
    return (Array.isArray(d) ? d[0] : d) || null;
  }
  async function socialRechercher(debut) { return (await rpc('social_rechercher', { p_debut: debut })) || []; }
  async function socialFil() { return (await rpc('social_fil')) || []; }
  async function socialLiens() { return (await rpc('social_liens')) || []; }
  async function socialRecordsSeance(id) { return (await rpc('social_records_seance', { p_session: id })) || []; }
  async function socialCalendrier(userIdCible, de, a) {
    return (await rpc('social_calendrier', { p_user: userIdCible, p_de: de, p_a: a })) || [];
  }
  async function socialDetailSeance(id) { return (await rpc('social_detail_seance', { p_session: id })) || []; }
  async function socialMesReactions(id) {
    var d = await rpc('social_mes_reactions', { p_session: id });
    var n = Number(Array.isArray(d) ? d[0] : d);
    return isFinite(n) ? n : 0;
  }
  // 89 (SOCIAL-V1 « Étage 2 », v2_079) — réservé aux mutuels, gardé par la base (`social_mutuel`).
  async function socialExercicesAmi(userIdCible) { return (await rpc('social_exercices_ami', { p_user: userIdCible })) || []; }
  async function socialSeriesExercice(userIdCible, slug) {
    return (await rpc('social_series_exercice', { p_user: userIdCible, p_slug: slug })) || [];
  }
  async function socialPeriode(userIdCible, de, a) {
    return (await rpc('social_periode', { p_user: userIdCible, p_de: de, p_a: a })) || [];
  }
  async function socialScoresForce(slug) { return (await rpc('social_scores_force', { p_slug: slug })) || []; }
  // 90 (SOCIAL-V1 « Guilde », v2_080) — tout passe par les fonctions de la base, qui gardent les règles (30 membres,
  // une guilde par personne, inviter un mutuel seulement, l'administration transmise au plus ancien).
  async function guildeMoi() { var d = await rpc('guilde_moi'); return (Array.isArray(d) ? d[0] : d) || null; }
  async function guildeMembres() { return (await rpc('guilde_liste_membres')) || []; }
  async function guildeInvitationsRecues() { return (await rpc('guilde_invitations_recues')) || []; }
  async function guildeSemaine() { var d = await rpc('guilde_semaine'); return (Array.isArray(d) ? d[0] : d) || null; }
  async function guildeProgression() { return (await rpc('guilde_progression')) || []; }
  async function guildeFil() { return (await rpc('guilde_fil')) || []; }
  async function guildeRecordsSeance(id) { return (await rpc('guilde_records_seance', { p_session: id })) || []; }
  function guildeGeste(nom, args) { return rpc(nom, args).then(function () { return true; }); }
  function guildeCreer(nom, couleur) { return guildeGeste('guilde_creer', { p_nom: nom, p_couleur: couleur }); }
  function guildeModifier(nom, couleur) { return guildeGeste('guilde_modifier', { p_nom: nom, p_couleur: couleur }); }
  function guildeInviter(user) { return guildeGeste('guilde_inviter', { p_user: user }); }
  function guildeRepondre(guilde, rejoindre) { return guildeGeste('guilde_repondre', { p_guilde: guilde, p_rejoindre: !!rejoindre }); }
  function guildeQuitter() { return guildeGeste('guilde_quitter', {}); }
  function guildeRetirerMembre(user) { return guildeGeste('guilde_retirer_membre', { p_user: user }); }
  function guildeTransmettre(user) { return guildeGeste('guilde_transmettre', { p_user: user }); }
  function guildeChoisirDefi(type, n) { return guildeGeste('guilde_choisir_defi', { p_type: type, p_n: n === undefined ? null : n }); }
  function guildeChoisirRang(rang) { return guildeGeste('guilde_choisir_rang', { p_rang: rang }); }
  // 91 (SOCIAL-V1 « Groupe », v2_082) — le groupe de séance : tout passe par les fonctions de la base, qui gardent les
  // règles (6 membres, mutuels seulement, un groupe à la fois, aucun blocage entre membres, messages ≤ 140 caractères
  // réservés aux membres). Le groupe ne porte que l'identifiant de ma séance, ma liste d'exercices et mon XP.
  async function groupeMoi() { var d = await rpc('groupe_moi'); return (Array.isArray(d) ? d[0] : d) || null; }
  async function groupeEtat() { return (await rpc('groupe_etat')) || []; }
  async function groupeDirect() { return (await rpc('groupe_direct')) || []; }
  async function groupeMessages() { return (await rpc('groupe_messages_lire')) || []; }
  async function groupeInvitationsRecues() { return (await rpc('groupe_invitations_recues')) || []; }
  async function groupeInvitationsEnvoyees() { return (await rpc('groupe_invitations_envoyees')) || []; }
  async function groupeRecap() { return (await rpc('groupe_recap')) || []; }
  async function groupeRecapSeance(session) {
    var d = await rpc('groupe_recap_seance', { p_session: session });
    return (Array.isArray(d) ? d[0] : d) || null;
  }
  function groupeGeste(nom, args) { return rpc(nom, args).then(function () { return true; }); }
  function groupeCreer(session, exercices) { return rpc('groupe_creer', { p_session: session, p_exercices: exercices || [] }); }
  function groupeInviter(user) { return groupeGeste('groupe_inviter', { p_user: user }); }
  function groupeAnnulerInvitation(user) { return groupeGeste('groupe_annuler_invitation', { p_user: user }); }
  function groupeRejoindre(groupe, session, exercices) {
    return groupeGeste('groupe_repondre', { p_groupe: groupe, p_rejoindre: true, p_session: session, p_exercices: exercices || [] });
  }
  function groupePublier(exercices, xp) {
    return groupeGeste('groupe_publier', { p_exercices: exercices || null, p_xp: xp === undefined ? null : xp });
  }
  function groupeEnvoyer(texte) { return groupeGeste('groupe_envoyer', { p_texte: texte }); }
  function groupeFermer() { return groupeGeste('groupe_fermer', {}); }
  function groupeQuitter() { return groupeGeste('groupe_quitter', {}); }
  async function ecrire(promesse) { var r = await promesse; if (r.error) throw r.error; return true; }
  // `statut` est posé par la base (`demande`, ou `accepte` d'office vers un compte public).
  function sAbonner(moi, suivi) { return ecrire(client().from('abonnements').insert({ suiveur: moi, suivi: suivi })); }
  function retirerAbonnement(suiveur, suivi) {
    return ecrire(client().from('abonnements').delete().eq('suiveur', suiveur).eq('suivi', suivi));
  }
  function accepterDemande(suiveur, moi) {
    return ecrire(client().from('abonnements').update({ statut: 'accepte' }).eq('suiveur', suiveur).eq('suivi', moi));
  }
  // 89 — MES SCORES DE FORCE (`scores_force`, v2_079) : le score DOTS et la charge, par exercice. ⚠️ LE POIDS DE CORPS
  // N'EST JAMAIS DANS CE CORPS : les lignes de `Social.scoresAPublier` (exercice, score, charge), et rien d'autre — la
  // table n'a pas de colonne de poids (v2_079), le serveur refuserait ; le banc le vérifie (faux-social, « fuites »).
  function publierScores(moi, scores) {
    if (!scores || !scores.length) return Promise.resolve(true);
    return ecrire(client().from('scores_force').upsert(scores.map(function (s) {
      return Object.assign({ user_id: moi }, s);
    }), { onConflict: 'user_id,exercise_slug' }));
  }
  function retirerScores(moi) { return ecrire(client().from('scores_force').delete().eq('user_id', moi)); }
  // 90 — MES NOMBRES DE GUILDE (`guilde_scores`, v2_080), déjà calculés sur l'appareil (`faits.scoresDeGuilde`) :
  // les colonnes de la table, et rien d'autre.
  function publierScoresGuilde(moi, s) {
    var l = { user_id: moi };
    ['semaine', 'seances', 'prevues', 'records_semaine', 'mois', 'exercices', 'exercices_record'].forEach(function (k) { l[k] = s[k]; });
    return ecrire(client().from('guilde_scores').upsert(l, { onConflict: 'user_id' }));
  }
  function bloquer(moi, autre) { return ecrire(client().from('blocages').insert({ bloqueur: moi, bloque: autre })); }
  function debloquer(moi, autre) {
    return ecrire(client().from('blocages').delete().eq('bloqueur', moi).eq('bloque', autre));
  }
  function reagir(sessionId, moi) {
    return ecrire(client().from('reactions_seance').insert({ session_id: sessionId, user_id: moi }));
  }
  function retirerReaction(sessionId, moi) {
    return ecrire(client().from('reactions_seance').delete().eq('session_id', sessionId).eq('user_id', moi));
  }

  var api = {
    toutesLesSeances: toutesLesSeances,
    seriesDepuis: seriesDepuis,
    tousLesExercices: tousLesExercices,
    toutesLesPesees: toutesLesPesees,
    enregistrerPesee: enregistrerPesee,
    mesChoixDeSemaine: mesChoixDeSemaine,
    enregistrerChoixDeSemaine: enregistrerChoixDeSemaine,
    aliasCommuns: aliasCommuns,
    mesAlias: mesAlias,
    enregistrerAlias: enregistrerAlias,
    mesZones: mesZones,
    enregistrerZone: enregistrerZone,
    mesModes: mesModes,
    enregistrerMode: enregistrerMode,
    mesPredictions: mesPredictions,
    parisDeSeance: parisDeSeance,
    seancesAvecPari: seancesAvecPari,
    parisEscalier: parisEscalier,
    parisProgramme: parisProgramme,
    mesBlocs: mesBlocs,
    enregistrerBloc: enregistrerBloc,
    enregistrerPrediction: enregistrerPrediction,
    recordsDepuis: recordsDepuis,
    compterRecords: compterRecords,
    ajouterRecords: ajouterRecords,
    observerPrediction: observerPrediction,
    mesRoutines: mesRoutines,
    creerRoutine: creerRoutine,
    majRoutine: majRoutine,
    supprimerRoutine: supprimerRoutine,
    insererExercices: insererExercices,
    majExercice: majExercice,
    supprimerExercices: supprimerExercices,
    remplacerSeriesRoutine: remplacerSeriesRoutine,
    enregistrerSeance: enregistrerSeance,
    supprimerSeance: supprimerSeance,
    remplacerSeries: remplacerSeries,
    seancesEnCours: seancesEnCours,
    refermerSeance: refermerSeance,
    aRetirerDe: aRetirerDe,
    seriesDeSeance: seriesDeSeance,
    compterSeances: compterSeances,
    compterSeries: compterSeries,
    monProfil: monProfil,
    enregistrerProfil: enregistrerProfil,
    pseudoPris: pseudoPris,
    supprimerCompte: supprimerCompte,
    socialProfil: socialProfil, socialRechercher: socialRechercher, socialFil: socialFil,
    socialLiens: socialLiens, socialRecordsSeance: socialRecordsSeance, socialCalendrier: socialCalendrier,
    socialDetailSeance: socialDetailSeance, socialMesReactions: socialMesReactions,
    sAbonner: sAbonner, retirerAbonnement: retirerAbonnement, accepterDemande: accepterDemande,
    bloquer: bloquer, debloquer: debloquer, reagir: reagir, retirerReaction: retirerReaction,
    socialExercicesAmi: socialExercicesAmi, socialSeriesExercice: socialSeriesExercice, socialPeriode: socialPeriode,
    socialScoresForce: socialScoresForce, publierScores: publierScores, retirerScores: retirerScores,
    guildeMoi: guildeMoi, guildeMembres: guildeMembres, guildeInvitationsRecues: guildeInvitationsRecues,
    guildeSemaine: guildeSemaine, guildeProgression: guildeProgression, guildeFil: guildeFil,
    guildeRecordsSeance: guildeRecordsSeance, guildeCreer: guildeCreer, guildeModifier: guildeModifier,
    guildeInviter: guildeInviter, guildeRepondre: guildeRepondre, guildeQuitter: guildeQuitter,
    guildeRetirerMembre: guildeRetirerMembre, guildeTransmettre: guildeTransmettre, guildeChoisirDefi: guildeChoisirDefi,
    guildeChoisirRang: guildeChoisirRang, publierScoresGuilde: publierScoresGuilde,
    groupeMoi: groupeMoi, groupeEtat: groupeEtat, groupeDirect: groupeDirect, groupeMessages: groupeMessages,
    groupeInvitationsRecues: groupeInvitationsRecues, groupeInvitationsEnvoyees: groupeInvitationsEnvoyees,
    groupeRecap: groupeRecap, groupeRecapSeance: groupeRecapSeance, groupeCreer: groupeCreer, groupeInviter: groupeInviter,
    groupeAnnulerInvitation: groupeAnnulerInvitation, groupeRejoindre: groupeRejoindre, groupePublier: groupePublier,
    groupeEnvoyer: groupeEnvoyer, groupeFermer: groupeFermer, groupeQuitter: groupeQuitter,
    // Exposée pour les tests : c'est la logique de pagination qu'il faut
    // pouvoir exercer sans réseau, pas les requêtes qui l'utilisent.
    paginerParCle: paginerParCle,
    trancheur: trancheur,
    PAGE: PAGE
  };

  racine.THDonnees = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
