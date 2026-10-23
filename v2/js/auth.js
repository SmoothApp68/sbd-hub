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

  // ── 70 — LE RETOUR DE LIEN, LU AVANT LE ROUTAGE (ECRAN-PROFIL §5.6) ──────
  //
  // Un lien de récupération ou de confirmation ouvre l'app avec le jeton dans
  // l'adresse (`#access_token=…`, flux implicite) — ou une erreur (`#error=…`,
  // un lien expiré). Le SDK lit ce fragment DE FAÇON ASYNCHRONE, à son
  // initialisation ; or, sans session enregistrée, le démarrage routait aussitôt
  // vers /connexion et `replaceState` EFFAÇAIT le fragment avant que le SDK l'ait
  // lu : session perdue, écran de connexion (constat du 11/10, Mélodie).
  //
  // Sonde SYNCHRONE et pure, sur l'adresse seule : elle ne dit que s'il faut
  // ATTENDRE le SDK avant de choisir un écran. Sans retour de lien, `null`, et le
  // démarrage hors ligne reste immédiat. `?code=` : le flux PKCE, si le client
  // change un jour de flux.
  function retourDeLien(adresse) {
    var frag = String((adresse && adresse.hash) || '').replace(/^#/, '');
    var req = String((adresse && adresse.search) || '').replace(/^\?/, '');
    var f = new URLSearchParams(frag), q = new URLSearchParams(req);
    if (f.has('error')) return { jeton: false, erreur: true };
    // 138 — `recup` : le lien est une RÉCUPÉRATION (`type=recovery`, dans le fragment du flux implicite). Le SDK n'émet
    // `PASSWORD_RECOVERY` que dans ce cas, mais APRÈS le démarrage (voir `app.js`, le retour de lien sur iPhone) : l'adresse,
    // elle, le dit tout de suite. Le flux PKCE (`?code=`) ne porte pas son type : `recup` y est absent, et l'app n'y arrête rien.
    if (f.has('access_token')) return f.get('type') === 'recovery'
      ? { jeton: true, erreur: false, recup: true } : { jeton: true, erreur: false, implicite: true };
    if (q.has('code')) return { jeton: true, erreur: false };
    return null;
  }

  // ── 138 — « IPHONE, HORS DE L'APP » (ECRAN-PROFIL §3.5, audit iPhone I-03 et I-05) ──────────────────────
  //
  // Une seule fonction décide si l'app dit comment l'installer : un appareil Apple tactile, dans un navigateur
  // (Safari, le navigateur interne de Gmail…), pas dans l'app installée. Safari efface les données d'un site non
  // installé qu'on n'ouvre pas pendant 7 jours, et un lien d'e-mail n'ouvre jamais l'app installée.
  //
  // PURE : `nav` (`navigator`) et `matchMedia` sont injectés, rien n'est lu sur `window`.
  //   · Apple tactile : `iPhone|iPad|iPod` dans l'agent, OU `MacIntel` avec plus d'un point de contact (un iPad récent
  //     se présente comme un Mac ; un Mac sans écran tactile n'en a pas).
  //   · installée : `navigator.standalone === true` (Safari) OU `display-mode: standalone` (le manifeste).
  // Android et ordinateur : toujours faux.
  function iphoneHorsApp(nav, matchMedia) {
    if (!nav) return false;
    var agent = String(nav.userAgent || '');
    var apple = /iPhone|iPad|iPod/.test(agent) || (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1);
    if (!apple) return false;
    if (nav.standalone === true) return false;
    try { if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) return false; }
    catch (e) { /* la requête n'existe pas : on ne sait pas, on ne dit pas « installée » */ }
    return true;
  }

  // Les phrases de ECRAN-PROFIL §3.5, au mot près : UN SEUL ENDROIT (les six écrans les lisent ici).
  var PHRASES_IPHONE = {
    connexion: { quoi: 'Sur iPhone, installe TrainHub d’abord.', sujet: 'Puis ouvre-le depuis ton écran d’accueil et connecte-toi là.' },
    feuille: {
      titre: 'Installer TrainHub sur ton iPhone',
      etapes: ['Touche le bouton Partager, en bas de Safari.', 'Fais défiler et touche « Sur l’écran d’accueil ».',
        'Touche « Ajouter », puis ouvre TrainHub depuis son icône et connecte-toi.'],
      sept: 'Dans Safari, l’iPhone efface les données d’un site qu’on n’ouvre pas pendant 7 jours. Installé, TrainHub garde tes séances.'
    },
    saisie: { quoi: 'Tu utilises TrainHub dans Safari.', sujet: 'Installé, il garde tes séances : Safari efface un site qu’on n’ouvre pas pendant 7 jours.' },
    lien: { quoi: 'C’est fait : ton adresse est confirmée.',
      sujet: 'Ouvre TrainHub depuis ton écran d’accueil et connecte-toi là. Pas encore installé ? Fais-le d’abord.' },
    motDePasse: { quoi: 'Ton mot de passe est changé.', sujet: 'Ouvre TrainHub depuis ton écran d’accueil et connecte-toi avec le nouveau.' },
    ligne: 'Installer sur l’écran d’accueil'
  };

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
  //
  // 59-4 — `retour` : l'adresse où ramène le lien de confirmation, s'il y en a
  // un. Construite par l'appelant depuis l'origine de la page, comme pour la
  // réinitialisation — jamais en dur. Sans elle, le lien ramenait à l'« adresse
  // du site » réglée sur le projet, qui peut viser une app qui n'existe plus.
  //
  // 60-3b — `pseudo` : LE PSEUDO VOYAGE AVEC LE COMPTE. La confirmation d'e-mail est activée sur
  // le projet : le lien s'ouvre souvent dans une AUTRE page, où la mémoire de l'inscription
  // (`pseudoAInscrire`, `app.js`) n'existe plus. Le pseudo est donc déposé dans les données du
  // compte (`options.data.pseudo` → `user_metadata.pseudo`), d'où la création de la ligne de
  // profil le reprend (ECRAN-PROFIL §3.1). L'appelant le donne DÉJÀ NORMALISÉ
  // (`Profil.normaliserPseudo`, une seule fonction) ; vide, il n'est pas déposé. `emailRedirectTo`
  // est inchangé.
  async function inscrire(email, motDePasse, retour, pseudo) {
    var options = {};
    if (retour) options.emailRedirectTo = retour;
    if (typeof pseudo === 'string' && pseudo) options.data = { pseudo: pseudo };
    var r = await client().auth.signUp({ email: email, password: motDePasse,
      options: options.emailRedirectTo || options.data ? options : undefined });
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
  // 70 — l'ÉVÉNEMENT passe avec la session : `PASSWORD_RECOVERY` (arrivé par un
  // lien de récupération) ouvre la feuille du mot de passe, et rien d'autre ne
  // le dit.
  function surChangement(rappel) {
    client().auth.onAuthStateChange(function (evenement, session) { rappel(session || null, evenement || null); });
  }

  // 70 — L'INSCRIPTION DIT TOUJOURS LA MÊME CHOSE. Avec la confirmation d'e-mail,
  // `signUp` rend un utilisateur sans session pour une adresse neuve ; pour une
  // adresse DÉJÀ inscrite, Supabase se tait exprès (un utilisateur masqué, ou
  // rien) et n'envoie aucun mail. Les deux réponses ne se distinguent donc
  // jamais ici : sans session, une seule phrase, qui dit quoi faire dans les deux
  // cas sans révéler qui est inscrit. Avec une session, on entre : pas de phrase.
  var PHRASE_INSCRIPTION = 'Compte créé si l\'adresse est nouvelle : confirme ton e-mail, puis connecte-toi. ' +
    'Si tu as déjà un compte avec cette adresse, aucun mail ne part : utilise « Mot de passe oublié ? ».';
  function phraseInscription(r) {
    return r && r.session ? null : PHRASE_INSCRIPTION;
  }

  racine.THAuth = {
    sessionPersistee: sessionPersistee,
    sessionCourante: sessionCourante,
    connecter: connecter,
    inscrire: inscrire,
    reinitialiser: reinitialiser,
    changerMotDePasse: changerMotDePasse,
    deconnecter: deconnecter,
    surChangement: surChangement,
    retourDeLien: retourDeLien,
    iphoneHorsApp: iphoneHorsApp,
    PHRASES_IPHONE: PHRASES_IPHONE,
    phraseInscription: phraseInscription
  };
})(typeof self !== 'undefined' ? self : globalThis);
