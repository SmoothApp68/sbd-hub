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

  var COLONNES_SEANCE = 'id, titre, debut, fin, statut, salle, salle_norme, created_at';
  var COLONNES_SERIE =
    'id, session_id, exercise_slug, charge_kg, reps, duree_s, distance_m, ' +
    'type_serie, rang, groupe_superset, validee_a, rpe, note, created_at, modifie_a';

  // Rafraîchissement COMPLET : 545 Ko, et `sessions` n'a aucune colonne de
  // modification. C'est le seul moyen de voir un titre changé ou une séance
  // supprimée.
  function toutesLesSeances() {
    return paginerParCle(trancheur(function () {
      return client().from('sessions').select(COLONNES_SEANCE);
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
      var q = client().from('sets').select(COLONNES_SERIE);
      // Le filtre incrémental et le curseur de clé se combinent : PostgREST
      // conjugue les filtres de premier niveau — (neuve OU retouchée) ET id > x.
      if (curseur) q = q.or('created_at.gt.' + curseur + ',modifie_a.gt.' + curseur);
      return q;
    }, 'id'), 'id');
  }

  // Catalogue partagé, 237 lignes. `mesure` et `charge` reconnaissent une sortie
  // (THModele.estExerciceSortie) ; les deux tableaux de muscles portent le
  // volume hebdomadaire, pondéré 1 en primaire et 0,5 en secondaire.
  function tousLesExercices() {
    return paginerParCle(trancheur(function () {
      return client().from('exercises')
        .select('slug, nom, mesure, charge, muscles_primaires, muscles_secondaires');
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

  var COLONNES_ROUTINE = 'id, nom, note, archivee_a, created_at, modifiee_a';
  var COLONNES_ROUTINE_EXO =
    'id, routine_id, exercise_slug, rang, series, reps_visees, repos_cible_s, groupe_superset';

  // Les routines AVEC leurs exercices, en une requête. L'imbrication PostgREST
  // suit la clé étrangère `routine_exercises.routine_id`.
  async function mesRoutines() {
    var r = await client().from('routines')
      .select(COLONNES_ROUTINE + ', routine_exercises(' + COLONNES_ROUTINE_EXO + ')')
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

  // Archiver, pas supprimer : les séances qui référencent la routine
  // (`sessions.routine_id`) gardent leur lien.
  function archiverRoutine(id) {
    return majRoutine(id, { archivee_a: new Date().toISOString() });
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

  // Supprimer une routine entière. Utilisé UNIQUEMENT pour défaire une création
  // dont les exercices ont échoué : sans ça, un réseau qui lâche au mauvais
  // moment laisserait une routine vide et un nom pris pour rien.
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
      .select(COLONNES_SEANCE + ', routine_id').eq('statut', 'en_cours');
    if (r.error) throw r.error;
    return r.data || [];
  }

  // Les séries d'une séance, pour reprendre une séance ouverte sur un autre
  // appareil — ou après une réinstallation.
  async function seriesDeSeance(sessionId) {
    var r = await client().from('sets').select(COLONNES_SERIE + ', ressenti, repos_s, source')
      .eq('session_id', sessionId).order('rang', { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }

  var api = {
    toutesLesSeances: toutesLesSeances,
    seriesDepuis: seriesDepuis,
    tousLesExercices: tousLesExercices,
    toutesLesPesees: toutesLesPesees,
    mesRoutines: mesRoutines,
    creerRoutine: creerRoutine,
    majRoutine: majRoutine,
    archiverRoutine: archiverRoutine,
    supprimerRoutine: supprimerRoutine,
    insererExercices: insererExercices,
    majExercice: majExercice,
    supprimerExercices: supprimerExercices,
    enregistrerSeance: enregistrerSeance,
    supprimerSeance: supprimerSeance,
    remplacerSeries: remplacerSeries,
    seancesEnCours: seancesEnCours,
    seriesDeSeance: seriesDeSeance,
    compterSeances: compterSeances,
    compterSeries: compterSeries,
    // Exposée pour les tests : c'est la logique de pagination qu'il faut
    // pouvoir exercer sans réseau, pas les requêtes qui l'utilisent.
    paginerParCle: paginerParCle,
    trancheur: trancheur,
    PAGE: PAGE
  };

  racine.THDonnees = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
