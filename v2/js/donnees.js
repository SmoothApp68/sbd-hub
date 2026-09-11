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
// PAGINATION — PostgREST plafonne une réponse à 1 000 lignes. Avec 28 103
// séries, une requête non paginée ramènerait 3,5 % des données sans rien dire.
// Toute lecture de volume passe donc par `paginer`.

(function (racine) {
  'use strict';

  var PAGE = 1000;

  function client() { return racine.THClient.obtenir(); }

  // Enchaîne les tranches jusqu'à ce que le serveur en rende moins qu'une page.
  async function paginer(construire) {
    var tout = [];
    var debut = 0;
    for (;;) {
      var r = await construire().range(debut, debut + PAGE - 1);
      if (r.error) throw r.error;
      var lot = r.data || [];
      tout = tout.concat(lot);
      if (lot.length < PAGE) return tout;
      debut += PAGE;
    }
  }

  var COLONNES_SEANCE = 'id, titre, debut, fin, statut, salle, salle_norme, created_at';
  var COLONNES_SERIE =
    'id, session_id, exercise_slug, charge_kg, reps, duree_s, distance_m, ' +
    'type_serie, rang, groupe_superset, validee_a, rpe, note, created_at, modifie_a';

  // Rafraîchissement COMPLET : 545 Ko, et `sessions` n'a aucune colonne de
  // modification. C'est le seul moyen de voir un titre changé ou une séance
  // supprimée.
  function toutesLesSeances() {
    return paginer(function () {
      return client().from('sessions').select(COLONNES_SEANCE).order('debut', { ascending: false });
    });
  }

  // INCRÉMENTAL : 15 Mo, qu'on ne retélécharge pas. Une ligne neuve porte
  // `created_at`, une ligne retouchée porte `modifie_a` — il faut les deux.
  function seriesDepuis(curseur) {
    return paginer(function () {
      var q = client().from('sets').select(COLONNES_SERIE);
      if (curseur) q = q.or('created_at.gt.' + curseur + ',modifie_a.gt.' + curseur);
      return q.order('created_at', { ascending: true });
    });
  }

  // Catalogue partagé, 237 lignes. `mesure` et `charge` reconnaissent une sortie
  // (THModele.estExerciceSortie) ; les deux tableaux de muscles portent le
  // volume hebdomadaire, pondéré 1 en primaire et 0,5 en secondaire.
  function tousLesExercices() {
    return paginer(function () {
      return client().from('exercises')
        .select('slug, nom, mesure, charge, muscles_primaires, muscles_secondaires');
    });
  }

  racine.THDonnees = {
    toutesLesSeances: toutesLesSeances,
    seriesDepuis: seriesDepuis,
    tousLesExercices: tousLesExercices
  };
})(typeof self !== 'undefined' ? self : this);
