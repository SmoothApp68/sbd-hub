// v2/js/donnees.js — accès Supabase, LECTURE SEULE.
//
// Ce module n'écrit jamais. En particulier il n'écrit jamais `validee_a` :
// cette colonne est NULL sur les 28 103 séries importées. Elle est en revanche
// LUE, parce qu'elle dit à elle seule si la chronologie existe pour une série
// (ECRAN-SAISIE-V1 §7.3).
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

  var api = {
    toutesLesSeances: toutesLesSeances,
    seriesDepuis: seriesDepuis,
    tousLesExercices: tousLesExercices,
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
