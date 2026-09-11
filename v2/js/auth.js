// v2/js/auth.js — connexion e-mail / mot de passe sur les comptes existants.
// Hors périmètre : inscription, mot de passe oublié, comptes anonymes.

(function (racine) {
  'use strict';

  function client() { return racine.THClient.obtenir(); }

  // ── SONDE SYNCHRONE — ce que le jeton persisté dit, SANS aucun réseau ─────
  //
  // `getSession()` du SDK lit bien le stockage, mais si l'access token est
  // périmé il tente un RAFRAÎCHISSEMENT réseau avant de répondre. Hors réseau,
  // ce rafraîchissement ne répond pas : `demarrer()` l'attendait, et l'écran
  // restait NOIR alors que toutes les données étaient sur l'appareil.
  //
  // Reproduit au banc, serveur arrêté pour de bon : la coquille est servie par
  // le service worker — scripts chargés, CSS appliqué — et AUCUNE section n'est
  // affichée. Le service worker n'était pas en cause.
  //
  // C'est exactement la leçon du v1 (CLAUDE.md §9, garde D-B) : la décision
  // d'afficher vient d'une sonde SYNCHRONE sur le jeton en localStorage, jamais
  // d'un appel réseau. Un `getSession` qui ne répond pas ne doit rien décider.
  function sessionPersistee() {
    try {
      var brut = racine.localStorage.getItem(racine.THClient.CLE_AUTH);
      if (!brut) return null;
      var j = JSON.parse(brut);
      // Selon les versions, supabase-js écrit la session à plat ou sous
      // `currentSession`. On accepte les deux plutôt que de parier sur une.
      var sess = (j && j.currentSession) || j;
      var u = sess && sess.user;
      // SANS IDENTIFIANT, PAS DE SESSION. `garantirProprietaire` vide le cache
      // quand le `userId` ne correspond pas — et un `userId` indéfini ne
      // correspond à rien. Rendre une session sans id effacerait les données
      // qu'on cherche justement à afficher.
      if (!u || !u.id) return null;
      return { user: { id: u.id, email: u.email || null }, persistee: true };
    } catch (e) {
      // localStorage indisponible (mode privé, stockage bloqué) : on ne sait
      // pas, donc on n'affirme pas.
      return null;
    }
  }

  async function sessionCourante() {
    var r = await client().auth.getSession();
    return (r && r.data && r.data.session) || null;
  }

  async function connecter(email, motDePasse) {
    var r = await client().auth.signInWithPassword({ email: email, password: motDePasse });
    if (r.error) throw r.error;
    return r.data.session;
  }

  async function deconnecter() {
    var r = await client().auth.signOut();
    if (r && r.error) throw r.error;
  }

  // Rejoue l'état d'authentification à chaque changement (connexion, refresh,
  // déconnexion), y compris au retour d'arrière-plan sur Android.
  function surChangement(rappel) {
    client().auth.onAuthStateChange(function (_evenement, session) { rappel(session || null); });
  }

  racine.THAuth = {
    sessionPersistee: sessionPersistee,
    sessionCourante: sessionCourante,
    connecter: connecter,
    deconnecter: deconnecter,
    surChangement: surChangement
  };
})(typeof self !== 'undefined' ? self : this);
