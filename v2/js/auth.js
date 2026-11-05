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
  //
  // 247 — `captchaToken` : le jeton Turnstile, quand le captcha est actif ; sans jeton (clé de site vide), AUCUNE
  // option vide n'est envoyée : l'appel est identique à celui d'avant.
  async function inscrire(email, motDePasse, retour, pseudo, captchaToken) {
    var options = {};
    if (retour) options.emailRedirectTo = retour;
    if (typeof pseudo === 'string' && pseudo) options.data = { pseudo: pseudo };
    if (captchaToken) options.captchaToken = captchaToken;
    var r = await client().auth.signUp({ email: email, password: motDePasse,
      options: options.emailRedirectTo || options.data || options.captchaToken ? options : undefined });
    if (r.error) throw r.error;
    return { session: (r.data && r.data.session) || null, user: (r.data && r.data.user) || null };
  }

  // Le lien de réinitialisation ramène sur l'app avec une session de
  // récupération ouverte : c'est le profil, et sa ligne « Mot de passe », qui
  // terminent le geste. Pas d'écran de plus pour une étape qu'un écran existant
  // sait déjà faire.
  async function reinitialiser(email, retour, captchaToken) {
    var options = {};
    if (retour) options.redirectTo = retour;
    if (captchaToken) options.captchaToken = captchaToken;   // 247
    var r = await client().auth.resetPasswordForEmail(email, retour || captchaToken ? options : undefined);
    if (r && r.error) throw r.error;
  }

  // Promis à l'inscription : « Tu le changeras depuis ton profil. »
  async function changerMotDePasse(motDePasse) {
    var r = await client().auth.updateUser({ password: motDePasse });
    if (r.error) throw r.error;
  }

  async function connecter(email, motDePasse, captchaToken) {
    var identifiants = { email: email, password: motDePasse };
    if (captchaToken) identifiants.options = { captchaToken: captchaToken };   // 247
    var r = await client().auth.signInWithPassword(identifiants);
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


  // ── 247 — LE CAPTCHA (Cloudflare Turnstile) : une notion de l'authentification ───────────────────────
  //
  // Dans `auth.js` et pas dans un fichier à lui : un nouveau `js/*.js` entrerait dans `SHELL` du service worker
  // (et la PR exigerait les vérifications de CLAUDE.md §4 bis sur téléphone). Pur de toute logique d'écran :
  // l'écran monte le widget, demande le jeton, le réinitialise ; il ne décide rien.
  //
  // ⚠️ ORDRE DE MISE EN SERVICE. Une fois la protection activée chez Supabase, les TROIS appels (connexion,
  // inscription, réinitialisation) exigent un jeton. La clé de site (`THConfig.TURNSTILE_SITE_KEY`) est VIDE tant
  // que l'app n'est pas prête : `actif()` est faux, aucun script n'est chargé, aucun widget n'est monté, et les
  // appels sont IDENTIQUES à ceux d'avant.
  //
  // Le script de Cloudflare se charge à l'OUVERTURE de l'écran d'entrée seulement (`monter`), jamais au démarrage
  // de l'app (garde-fou de vitesse 231), jamais pour une personne connectée. Il n'est pas dans `SHELL` : le
  // service worker ne traite que sa propre origine (`url.origin !== self.location.origin` → return).
  //
  // Aucun `await` sans issue : le chargement du script et l'attente du jeton ont chacun leur plafond (10 s) et
  // leur phrase.
  var URL_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var DELAI_SCRIPT_MS = 10000;
  var DELAI_JETON_MS = 10000;
  var PHRASE_CAPTCHA_SCRIPT = 'La vérification anti-robot n\'a pas pu se charger. Vérifie ta connexion, puis réessaie.';
  var PHRASE_CAPTCHA_EXPIREE = 'La vérification a expiré. Réessaie.';

  function fabriquerCaptcha() {
    var chargement = null;      // la promesse du chargement du script, tant qu'il est en vol
    var idWidget = null;        // l'identifiant rendu par `turnstile.render`
    var monteDans = null;       // le conteneur du widget monté
    var jetonCourant = null;
    var echec = null;
    var attentes = [];

    function cle() {
      var c = racine.THConfig && racine.THConfig.TURNSTILE_SITE_KEY;
      return typeof c === 'string' ? c.trim() : '';
    }
    function actif() { return cle() !== ''; }
    function erreur(code) {
      var e = new Error(code === 'script' ? PHRASE_CAPTCHA_SCRIPT : PHRASE_CAPTCHA_EXPIREE);
      e.captcha = code;
      return e;
    }
    function moteurPret() { return !!(racine.turnstile && typeof racine.turnstile.render === 'function'); }

    // Charge le script UNE fois (jamais deux balises en vol) ; un échec (hors ligne, bloqué, plafond) retire la
    // balise pour que « Réessayer » puisse recommencer.
    function charger() {
      if (!actif()) return Promise.resolve(false);
      if (moteurPret()) return Promise.resolve(true);
      if (chargement) return chargement;
      chargement = new Promise(function (ok, ko) {
        var doc = racine.document;
        if (!doc || !doc.createElement) { chargement = null; ko(erreur('script')); return; }
        var balise = doc.createElement('script');
        var fini = false;
        var minuteur = racine.setTimeout(function () { fin(false); }, DELAI_SCRIPT_MS);
        function fin(bon) {
          if (fini) return;
          fini = true;
          racine.clearTimeout(minuteur);
          if (bon) { chargement = null; ok(true); return; }
          chargement = null;
          if (balise.parentNode) balise.parentNode.removeChild(balise);
          ko(erreur('script'));
        }
        balise.src = URL_TURNSTILE;
        balise.async = true;
        balise.defer = true;
        balise.onload = function () { fin(moteurPret()); };
        balise.onerror = function () { fin(false); };
        (doc.head || doc.documentElement).appendChild(balise);
      });
      return chargement;
    }

    function servir() {
      var liste = attentes;
      attentes = [];
      liste.forEach(function (a) {
        racine.clearTimeout(a.minuteur);
        if (jetonCourant) a.ok(jetonCourant); else a.ko(echec || erreur('refus'));
      });
    }

    // Monte le widget dès l'ouverture de l'écran : le jeton est en général prêt quand la personne touche le bouton.
    // « interaction-only » : invisible dans le cas courant, ne se montre que s'il faut un geste.
    function monter(conteneur) {
      return charger().then(function (charge) {
        if (!charge || !conteneur) return null;
        if (idWidget !== null && monteDans === conteneur) return idWidget;   // déjà monté : le jeton en cours reste valable
        demonter();
        monteDans = conteneur;
        idWidget = racine.turnstile.render(conteneur, {
          sitekey: cle(),
          appearance: 'interaction-only',
          theme: 'dark',
          language: 'fr',
          callback: function (jeton) { jetonCourant = jeton; echec = null; servir(); },
          'error-callback': function () { jetonCourant = null; echec = erreur('refus'); servir(); },
          'expired-callback': function () { jetonCourant = null; }
        });
        return idWidget;
      });
    }

    // Le jeton, ou une erreur dite : jamais une attente sans fin.
    function jeton() {
      if (!actif()) return Promise.resolve(null);
      if (jetonCourant) return Promise.resolve(jetonCourant);
      if (echec) return Promise.reject(echec);
      if (idWidget === null && !chargement) return Promise.reject(erreur('script'));
      return new Promise(function (ok, ko) {
        var a = { ok: ok, ko: ko };
        a.minuteur = racine.setTimeout(function () {
          attentes = attentes.filter(function (x) { return x !== a; });
          ko(erreur(idWidget === null ? 'script' : 'delai'));
        }, DELAI_JETON_MS);
        attentes.push(a);
      });
    }

    // Un jeton ne sert qu'UNE fois : après CHAQUE tentative, réussie ou non.
    function reinitialiser() {
      jetonCourant = null;
      echec = null;
      if (idWidget !== null && moteurPret() && typeof racine.turnstile.reset === 'function') {
        try { racine.turnstile.reset(idWidget); } catch (e) { /* widget déjà retiré */ }
      }
    }

    function demonter() {
      if (idWidget !== null && moteurPret() && typeof racine.turnstile.remove === 'function') {
        try { racine.turnstile.remove(idWidget); } catch (e) { /* déjà retiré */ }
      }
      idWidget = null;
      monteDans = null;
      jetonCourant = null;
      echec = null;
    }

    // La phrase d'une erreur de captcha, ou null si l'erreur n'en est pas une. Le refus de Supabase
    // (`captcha verification process failed`) vaut « expiré » : un jeton refusé ou trop vieux.
    function phrase(e) {
      if (!e) return null;
      if (e.captcha === 'script') return PHRASE_CAPTCHA_SCRIPT;
      if (e.captcha) return PHRASE_CAPTCHA_EXPIREE;
      if (e.code === 'captcha_failed' || /captcha/i.test(String(e.message || ''))) return PHRASE_CAPTCHA_EXPIREE;
      return null;
    }
    function estScript(e) { return !!e && e.captcha === 'script'; }

    return { actif: actif, charger: charger, monter: monter, jeton: jeton, reinitialiser: reinitialiser,
             demonter: demonter, phrase: phrase, estScript: estScript };
  }
  var captcha = fabriquerCaptcha();

  racine.THAuth = {
    captcha: captcha,
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
