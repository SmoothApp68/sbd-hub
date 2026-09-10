// v2/js/donnees.js — accès aux données, LECTURE SEULE.
//
// Ce module n'écrit jamais. En particulier il n'écrit jamais `validee_a` :
// cette colonne est NULL sur les 28 103 séries importées et rien dans ce socle
// ne doit la supposer renseignée ni la remplir.
//
// Aucune requête ne filtre sur `user_id`. C'est délibéré : le cloisonnement
// est le travail du RLS, et le vérifier sur device avec un vrai token est
// précisément l'objet de ce socle. Ajouter un `.eq('user_id', …)` ici
// masquerait un RLS défaillant au lieu de le révéler.

(function (racine) {
  'use strict';

  function client() { return racine.THClient.obtenir(); }

  async function listerSeances(limite) {
    var r = await client()
      .from('sessions')
      .select('id, titre, debut, fin, statut, salle, salle_norme')
      .order('debut', { ascending: false })
      .limit(limite || 20);
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function seriesDe(sessionId) {
    var r = await client()
      .from('sets')
      .select('id, session_id, exercise_slug, charge_kg, reps, duree_s, distance_m, ' +
              'type_serie, rang, groupe_superset, rpe, note')
      .eq('session_id', sessionId)
      .order('rang', { ascending: true });   // ordre d'affichage — jamais validee_a
    if (r.error) throw r.error;
    return r.data || [];
  }

  // Catalogue partagé : on ne tire que les slugs réellement présents.
  async function exercicesDe(slugs) {
    var uniques = Object.keys((slugs || []).reduce(function (acc, s) {
      if (s) acc[s] = true;
      return acc;
    }, {}));
    if (!uniques.length) return [];
    var r = await client().from('exercises').select('slug, nom').in('slug', uniques);
    if (r.error) throw r.error;
    return r.data || [];
  }

  // Une séance complète, prête pour le modèle d'affichage.
  async function chargerSeance(sessionId) {
    var series = await seriesDe(sessionId);
    var exercices = await exercicesDe(series.map(function (s) { return s.exercise_slug; }));
    return { series: series, exercices: exercices };
  }

  racine.THDonnees = {
    listerSeances: listerSeances,
    seriesDe: seriesDe,
    exercicesDe: exercicesDe,
    chargerSeance: chargerSeance
  };
})(typeof self !== 'undefined' ? self : this);
