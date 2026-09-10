// v2/js/auth.js — connexion e-mail / mot de passe sur les comptes existants.
// Hors périmètre : inscription, mot de passe oublié, comptes anonymes.

(function (racine) {
  'use strict';

  function client() { return racine.THClient.obtenir(); }

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
    sessionCourante: sessionCourante,
    connecter: connecter,
    deconnecter: deconnecter,
    surChangement: surChangement
  };
})(typeof self !== 'undefined' ? self : this);
