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
  async function compter(table) {
    var r = await client().from(table).select('*', { count: 'exact', head: true });
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

  function compterSeances() { return compter('sessions'); }
  function compterSeries() { return compter('sets'); }

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
  function tousLesExercices() {
    return paginerParCle(trancheur(function () {
      return client().from('exercises')
        .select('slug, nom, mesure, charge, equipement, muscles_primaires, muscles_secondaires, mouvement');
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
  var COLONNES_ROUTINE = 'id, nom, note, archivee_a, rang, created_at, modifiee_a';
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

  // Met la base À L'IMAGE de ce que l'app a en local pour cette séance.
  //
  // ⚠️ L'UPSERT EST EN UN SEUL LOT, et ce n'est pas une optimisation :
  // `sets_rang_unique` est UNIQUE (session_id, rang) **DEFERRABLE INITIALLY
  // DEFERRED**. Différée, elle n'est vérifiée qu'à la fin de la transaction —
  // donc un lot peut permuter des rangs sans heurt. Envoyées une par une,
  // chacune dans sa transaction, les mêmes lignes échoueraient sur la première.
  //
  // On lit ce qui existe AVANT d'écrire, plutôt que de deviner : c'est ce qui
  // permet de supprimer ce qui a été dévalidé sans se fier à une mémoire locale
  // qui pourrait avoir tort.
  async function remplacerSeries(sessionId, lignes) {
    var liste = lignes || [];

    var existantes = await client().from('sets').select('id').eq('session_id', sessionId);
    if (existantes.error) throw existantes.error;

    var gardes = {};
    liste.forEach(function (l) { gardes[l.id] = true; });
    var aRetirer = (existantes.data || [])
      .map(function (e) { return e.id; })
      .filter(function (id) { return !gardes[id]; });

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
  var COLONNES_ZONE = 'id, user_id, exercise_slug, zone, corrigee_a, created_at';

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
      return client().from('predictions').select('id, exercise_slug, session_id, compteur:fondement->compteur');
    }, 'id'), 'id');
  }

  // MOTEUR §14.4 (49-U14) — les paris de l'ESCALIER, en entier (une ligne par
  // carte : peu). `module = 'escalier'` les distingue des paris de consigne.
  function parisEscalier() {
    return paginerParCle(trancheur(function () {
      return client().from('predictions').select(COLONNES_PREDICTION).eq('module', 'escalier');
    }, 'id'), 'id');
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
  var COLONNES_PROFIL =
    'id, username, bio, sexe, taille_cm, date_naissance, mode_entrainement, ' +
    'unites, anciennete, intention, rythme_progression, phase, phase_depuis, materiel, ' +
    'niveau_declare, seances_par_semaine, jours_vises, duree_seance_min, ' +
    'onboarding_completed';

  async function monProfil(id) {
    var r = await client().from('profiles').select(COLONNES_PROFIL).eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    return r.data || null;
  }

  // `upsert` plutôt qu'`insert` puis `update` : c'est la même écriture dans les
  // deux cas, et le profil d'un compte neuf n'existe pas encore. `id` est la
  // clé primaire, donc le conflit est exactement celui qu'on veut écraser.
  //
  // ⚠️ `champs` EST DÉJÀ FILTRÉ PAR `THProfil.champsEcrits` chez l'appelant —
  // `is_admin`, `tier` et les visibilités ne traversent pas cette fonction.
  async function enregistrerProfil(id, champs) {
    var ligne = Object.assign({ id: id }, champs, { updated_at: new Date().toISOString() });
    var r = await client().from('profiles').upsert(ligne, { onConflict: 'id' })
      .select(COLONNES_PROFIL).single();
    if (r.error) throw r.error;
    return r.data;
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

  var api = {
    toutesLesSeances: toutesLesSeances,
    seriesDepuis: seriesDepuis,
    tousLesExercices: tousLesExercices,
    toutesLesPesees: toutesLesPesees,
    mesZones: mesZones,
    enregistrerZone: enregistrerZone,
    mesPredictions: mesPredictions,
    parisDeSeance: parisDeSeance,
    seancesAvecPari: seancesAvecPari,
    parisEscalier: parisEscalier,
    enregistrerPrediction: enregistrerPrediction,
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
    seriesDeSeance: seriesDeSeance,
    compterSeances: compterSeances,
    compterSeries: compterSeries,
    monProfil: monProfil,
    enregistrerProfil: enregistrerProfil,
    pseudoPris: pseudoPris,
    supprimerCompte: supprimerCompte,
    // Exposée pour les tests : c'est la logique de pagination qu'il faut
    // pouvoir exercer sans réseau, pas les requêtes qui l'utilisent.
    paginerParCle: paginerParCle,
    trancheur: trancheur,
    PAGE: PAGE
  };

  racine.THDonnees = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
