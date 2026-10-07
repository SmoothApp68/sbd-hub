// v2/js/auth.js — connexion, inscription, mot de passe.
//
// Trois champs à l'inscription — pseudo, e-mail, mot de passe — et rien d'autre
// (ECRAN-PROFIL-V1 §3.1). Le profil se remplit APRÈS, à son rythme : « chaque
// question posée avant la première séance est un obstacle ».
//
// Hors périmètre, et écarté avec ses raisons (§3.3) : Google, Apple, magic link
// — cinq utilisateurs connus, tous avec un mot de passe, donc une dépendance
// pour zéro besoin. Comptes anonymes : toujours hors périmètre.

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

  // ── L'inscription ────────────────────────────────────────────────────────
  //
  // ⚠️ CE QUI REVIENT DÉPEND D'UN RÉGLAGE DE PROJET, PAS DU CODE. Si la
  // confirmation d'e-mail est exigée, `signUp` rend un `user` SANS session et
  // il faut passer par la boîte mail ; sinon il rend les deux et on entre tout
  // de suite. On rend donc les deux et l'appelant décide — plutôt que de parier
  // sur un réglage qu'on ne contrôle pas d'ici.
  //
  // La spec tranche par ailleurs que la confirmation NE DOIT PAS BLOQUER la
  // première séance (§3.3) : si ce réglage est un jour activé, c'est là qu'il
  // faudra revenir, pas dans l'écran.
  async function inscrire(email, motDePasse) {
    var r = await client().auth.signUp({ email: email, password: motDePasse });
    if (r.error) throw r.error;
    return { session: (r.data && r.data.session) || null, user: (r.data && r.data.user) || null };
  }

  // Le lien de réinitialisation ramène sur l'app avec une session de
  // récupération ouverte : c'est le profil, et sa ligne « Mot de passe », qui
  // terminent le geste. Pas d'écran de plus pour une étape qu'un écran existant
  // sait déjà faire.
  async function reinitialiser(email, retour) {
    var r = await client().auth.resetPasswordForEmail(email, retour ? { redirectTo: retour } : undefined);
    if (r && r.error) throw r.error;
  }

  // Promis à l'inscription : « Tu le changeras depuis ton profil. »
  async function changerMotDePasse(motDePasse) {
    var r = await client().auth.updateUser({ password: motDePasse });
    if (r.error) throw r.error;
  }

  async function connecter(email, motDePasse) {
    var r = await client().auth.signInWithPassword({ email: email, password: motDePasse });
    if (r.error) throw r.error;
    return r.data.session;
  }

  // ⚠️ LE JETON PART MÊME HORS LIGNE (59-2). `signOut()` révoque la session
  // côté serveur PUIS l'efface localement — mais si le serveur ne répond pas
  // (hors ligne, coupure), le SDK rend l'erreur SANS rien effacer, et cela
  // vaut aussi pour `signOut({ scope: 'local' })` (supabase-js 2.105.1 :
  // `_signOut` rend l'erreur réseau avant `_removeSession`). Le jeton restait
  // alors dans le stockage, et l'app se rouvrait connectée.
  //
  // On efface donc la session LOCALE nous-mêmes quand le serveur n'a pas pu :
  // le rafraîchissement automatique s'arrête (sinon il réécrirait le jeton),
  // puis les clés du jeton partent. Le SDK relit la session dans le stockage à
  // chaque appel (`__loadSession`) : sans la clé, il n'y a plus de session.
  // L'erreur est rendue (`{ local: true, erreur }`), jamais levée : quitter
  // n'échoue pas.
  async function oublierSessionLocale() {
    try { await client().auth.stopAutoRefresh(); } catch (e) { /* déjà arrêté */ }
    try {
      var cle = racine.THClient.CLE_AUTH;
      [cle, cle + '-code-verifier', cle + '-user'].forEach(function (k) { racine.localStorage.removeItem(k); });
    } catch (e) { /* stockage fermé : rien à retirer */ }
  }

  async function deconnecter() {
    var r;
    try { r = await client().auth.signOut(); }
    catch (e) { r = { error: e }; }
    if (r && r.error) {
      await oublierSessionLocale();
      return { local: true, erreur: r.error };
    }
    return { local: false, erreur: null };
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
    inscrire: inscrire,
    reinitialiser: reinitialiser,
    changerMotDePasse: changerMotDePasse,
    deconnecter: deconnecter,
    surChangement: surChangement
  };
})(typeof self !== 'undefined' ? self : globalThis);
