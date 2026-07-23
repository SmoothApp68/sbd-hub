// Chantier 7 (bloc 1) — ordonnanceur d'entrée. Une seule autorité d'affichage pour les
// écrans de première visite : la file affiche UN écran à la fois, avance par signal de
// complétion (obSeqDone), 100 % local. Garde D-B (décision Aurélien, non négociable) :
// la file n'OUVRE PAS un écran de collecte tant qu'on ne sait pas si l'utilisateur est
// déjà onboardé — session email persistée → attendre le verdict du pull, JAMAIS de flash.
// Fonctions extraites de la VRAIE source (vm), écrans stubbés (spies).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}
function extractVarBlock(src, name) {
  // var NAME = [ ... ]; multiligne — s'arrête à la première ligne '];' en début de ligne
  const m = src.match(new RegExp('^var ' + name + ' = \\[[\\s\\S]*?^\\];', 'm'));
  if (!m) throw new Error('Could not extract var ' + name);
  return m[0];
}

// Contexte vm : séquenceur réel + écrans stubbés + db pilotable.
// opts.session : session PERSISTÉE — matérialisée en clé sb-…-auth-token dans le stub
//                localStorage (c'est ELLE qui décide depuis le fix fail-closed du 22/07 ;
//                le stub getSession est rendu HOSTILE par défaut pour prouver que plus
//                rien n'en dépend).
// opts.noSupa  : supaClient absent (offline pur / SDK non chargé)
// opts.rawSbToken : contenu BRUT de la clé sb- (tests opaque/chunké)
// opts.getSession : comportement du stub réseau ('throw' | 'null' | fonction)
function makeLS(seed) {
  const store = Object.assign({}, seed || {});
  return {
    _store: store,
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] || null,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}
function build(initialDb, opts) {
  opts = opts || {};
  const shows = { profile: 0, plan: 0, swipe: 0, classQuiz: 0 };
  const loading = { shown: 0, hidden: 0 };
  const back = { style: { display: 'none' } };
  const loginCalls = { show: 0, showForce: 0, hide: 0 };
  const seed = {};
  if (opts.session) seed['sb-testref-auth-token'] = JSON.stringify({ user: { id: opts.session.user.id, email: opts.session.user.email } });
  if (opts.rawSbToken !== undefined) seed[opts.rawSbKey || 'sb-testref-auth-token'] = opts.rawSbToken;
  const ls = opts.localStorage || makeLS(seed);
  const ctx = {
    JSON, console: { warn() {}, log() {} },
    db: initialDb,
    ONBOARDING_VERSION: 4,
    cloudHydrationState: opts.hydration || 'pending',
    document: { getElementById: (id) => (id === 'loginBackToOb' ? back : null) },
    logErrorToSupabase: () => {},
    saveDB: () => {},
    localStorage: ls,
    hideOnboarding: () => {},
    showLoginScreen: (force) => { loginCalls.show++; if (force) loginCalls.showForce++; },
    hideLoginScreen: () => { loginCalls.hide++; },
    setTimeout: (fn, ms) => {}, // watchdog non exécuté dans les tests synchrones
  };
  vm.createContext(ctx);
  if (!opts.noSupa) {
    // Stub réseau HOSTILE par défaut : getSession jette. Le boot ne doit plus jamais en dépendre.
    const gs = opts.getSession === 'null' ? (async () => ({ data: { session: null } }))
      : (typeof opts.getSession === 'function' ? opts.getSession
        : (async () => { throw new Error('LockManager contention (stub hostile)'); }));
    ctx.supaClient = { auth: { getSession: gs } };
  }
  ctx._loginCalls = loginCalls;
  vm.runInContext(extractFn(APP, 'needsOnboarding'), ctx);
  // Vars d'état du séquenceur (déclarées hors fonctions dans la source)
  vm.runInContext('var _obSeqActive=false,_obSeqCurrent=null,_obSeqFreshRun=false,_obSeqWaitingHydration=false,_obSeqLoginPause=false,_obSeqFreshTunnelSession=false,_obSeqBroken={};', ctx);
  vm.runInContext(extractFn(APP, '_obSeqPaused'), ctx);
  vm.runInContext(extractVarBlock(APP, 'OB_SEQ_STEPS'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqFindNext'), ctx);
  vm.runInContext(extractFn(APP, 'obSeqStart'), ctx);
  vm.runInContext(extractFn(APP, 'obSeqAdvance'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqReconcileAuthAtClose'), ctx);
  vm.runInContext(extractFn(APP, 'obSeqDone'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqShowLoading'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqHideLoading'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqOnHydrationSettled'), ctx);
  vm.runInContext(extractFn(APP, '_sbPersistedSessionKind'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqBootStart'), ctx);
  vm.runInContext(extractFn(APP, 'obSeqGotoLogin'), ctx);
  vm.runInContext(extractFn(APP, 'loginBackFromOb'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqOnLoginResolved'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqResumeLocal'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqResumeAfterSignup'), ctx);
  // Écrans stubbés (spies) — la source appelle les vrais noms
  ctx.showOnboarding = () => { shows.profile++; };
  ctx.showMagicStart = () => { shows.plan++; };
  ctx.renderSwipeOnboarding = () => { shows.swipe++; };
  ctx.showClassQuiz = () => { shows.classQuiz++; };
  ctx._obSeqShowLoading = () => { loading.shown++; };
  ctx._obSeqHideLoading = () => { loading.hidden++; };
  return { ctx, shows, loading, loginCalls };
}

const freshDb = () => ({ user: { onboarded: false, onboardingVersion: 0 }, _magicStartDone: false, weeklyPlan: null });
const totalShows = (s) => s.profile + s.plan + s.swipe + s.classQuiz;

describe('ordonnanceur — file nominale (nouvel utilisateur)', () => {
  test('start ouvre le profil, un seul écran', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    expect(shows.profile).toBe(1);
    expect(totalShows(shows)).toBe(1);
    expect(ctx._obSeqActive).toBe(true);
    expect(ctx._obSeqCurrent).toBe('profile');
  });

  test('la complétion de chaque étape ouvre la suivante, sans reload', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    // obFinish : pose les flags puis signale
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.obSeqDone('profile');
    expect(shows.plan).toBe(1); // Magic Start immédiat, plus de timer
    // handleMagicChoice : pose le flag + génère le plan puis signale
    ctx.db._magicStartDone = true;
    ctx.db.weeklyPlan = { days: [{}] };
    ctx.obSeqDone('plan');
    expect(shows.swipe).toBe(1);
    ctx.db.user._swipeCompleted = true;
    ctx.obSeqDone('swipe');
    expect(shows.classQuiz).toBe(1);
    ctx.db.user.quizDone = true;
    ctx.obSeqDone('classQuiz');
    expect(ctx._obSeqActive).toBe(false); // file terminée
    expect(totalShows(shows)).toBe(4);    // jamais deux écrans pour une étape
  });

  test('swipe sauté si pas de plan (choix libre/import) → quiz direct', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.obSeqDone('profile');
    ctx.db._magicStartDone = true; // pas de weeklyPlan
    ctx.obSeqDone('plan');
    expect(shows.swipe).toBe(0);
    expect(shows.classQuiz).toBe(1);
  });

  test('swipe sauté pour un powerlifter (comportement conservé)', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.db.user.trainingMode = 'powerlifting';
    ctx.obSeqDone('profile');
    ctx.db._magicStartDone = true; ctx.db.weeklyPlan = { days: [{}] };
    ctx.obSeqDone('plan');
    expect(shows.swipe).toBe(0);
    expect(shows.classQuiz).toBe(1);
  });

  test('un seul écran à la fois : advance répété ne ré-ouvre pas l\'écran courant', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.obSeqAdvance(); ctx.obSeqAdvance(); ctx.obSeqStart();
    expect(shows.profile).toBe(1);
  });

  test('compte établi SANS marqueur tunnel : la file ne s\'engage jamais seule', () => {
    const dbMid = freshDb();
    dbMid.user.onboarded = true; dbMid.user.onboardingVersion = 4;
    dbMid._magicStartDone = false; // même avec des étapes « en retard »…
    const { ctx, shows } = build(dbMid);
    ctx.obSeqStart();
    expect(ctx._obSeqActive).toBe(false);
    expect(totalShows(shows)).toBe(0); // …un compte établi ne reçoit JAMAIS les étapes newUserOnly
  });

  test('le run frais pose db._obSeqTunnel ; la complétion l\'efface', () => {
    const { ctx } = build(freshDb());
    ctx.obSeqStart();
    expect(ctx.db._obSeqTunnel).toBe(true); // posé dès l'engagement (persisté au prochain saveDB)
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.obSeqDone('profile');
    ctx.db._magicStartDone = true; ctx.obSeqDone('plan');
    ctx.db.user.quizDone = true; ctx.obSeqDone('classQuiz');
    expect(ctx._obSeqActive).toBe(false);
    expect(ctx.db._obSeqTunnel).toBeUndefined(); // tunnel fini → marqueur effacé
  });

  test('reload APRÈS obFinish (tunnel inachevé) → la file reprend à Magic Start, rien n\'est perdu', async () => {
    const dbReloaded = freshDb();
    dbReloaded.user.onboarded = true; dbReloaded.user.onboardingVersion = 4; // obFinish passé
    dbReloaded._obSeqTunnel = true;                                          // marqueur persisté
    dbReloaded._magicStartDone = false;
    const { ctx, shows } = build(dbReloaded, { session: null });
    await ctx._obSeqBootStart();
    expect(shows.plan).toBe(1); // Magic Start s'ouvre au boot suivant — quiz/swipe pas perdus (D-A)
    expect(shows.profile).toBe(0);
  });

  test('welcome-back ne pose PAS le marqueur tunnel', () => {
    const dbWb = { user: { onboarded: true, onboardingVersion: 3 } };
    const { ctx } = build(dbWb);
    ctx.obSeqStart();
    expect(ctx.db._obSeqTunnel).toBeUndefined();
  });

  test('étape dont show() crashe → skippée, la file continue sans bloquer', () => {
    const { ctx, shows } = build(freshDb());
    ctx.showOnboarding = () => { throw new Error('boom'); };
    ctx.obSeqStart();
    // profile a crashé → marqué broken → la file passe aux étapes suivantes (fresh run)
    expect(ctx._obSeqBroken.profile).toBe(true);
    expect(shows.plan).toBe(1); // Magic Start affiché à la place, pas de blocage
  });
});

describe('ordonnanceur — welcome-back (compte onboardé, version en retard)', () => {
  test('seule l\'étape profile tourne ; jamais plan/swipe/quiz (newUserOnly)', () => {
    const dbWb = { user: { onboarded: true, onboardingVersion: 3 }, _magicStartDone: false, weeklyPlan: { days: [{}] } };
    const { ctx, shows } = build(dbWb);
    ctx.obSeqStart();
    expect(shows.profile).toBe(1); // welcome-back (showOnboarding route en interne)
    ctx.db.user.onboardingVersion = 4; // obFinishWelcomeBack
    ctx.obSeqDone('profile');
    expect(ctx._obSeqActive).toBe(false);
    expect(shows.plan + shows.swipe + shows.classQuiz).toBe(0);
  });

  test('boot welcome-back : affichage immédiat, sans attendre le cloud (v338 conservé)', async () => {
    const dbWb = { user: { onboarded: true, onboardingVersion: 3 } };
    const { ctx, shows, loading } = build(dbWb, { session: { user: { id: 'U1', email: 'a@b.c' } } });
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1); // pas d'attente d'hydratation : le db local SAIT (onboardé)
    expect(loading.shown).toBe(0);
  });
});

describe('garde D-B — jamais de flash d\'écran de collecte (scénario device du 21/07)', () => {
  test('OBLIGATOIRE : session persistée + cache vidé + onboarded=true au cloud → AUCUN écran, jamais', async () => {
    const { ctx, shows, loading } = build(freshDb(), { session: { user: { id: 'U1', email: 'aurel@x.fr' } } });
    await ctx._obSeqBootStart();
    // La file N'A PAS ouvert d'écran : elle attend le verdict du pull
    expect(totalShows(shows)).toBe(0);
    expect(ctx._obSeqWaitingHydration).toBe(true);
    expect(loading.shown).toBe(1);
    // Le pull hydrate le blob cloud (compte existant, 553 séances…) : onboardé
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.db.user.quizDone = false; // même si le quiz cloud n'est pas fait…
    ctx.cloudHydrationState = 'hydrated';
    ctx._obSeqOnHydrationSettled('hydrated');
    // …AUCUN écran de collecte n'a été affiché à AUCUN moment (même pas un flash)
    expect(totalShows(shows)).toBe(0);
    expect(ctx._obSeqActive).toBe(false);
    expect(loading.hidden).toBeGreaterThan(0); // l'app s'ouvre directement
  });

  test('vrai nouveau confirmé : pull hydraté mais db toujours vierge → la file démarre', async () => {
    const { ctx, shows } = build(freshDb(), { session: { user: { id: 'U2', email: 'new@x.fr' } } });
    await ctx._obSeqBootStart();
    expect(totalShows(shows)).toBe(0);
    ctx.cloudHydrationState = 'hydrated'; // resolveIdentity 'reset-new' (aucune ligne cloud)
    ctx._obSeqOnHydrationSettled('hydrated');
    expect(shows.profile).toBe(1); // l'onboarding s'ouvre dès qu'on SAIT
  });

  test('pull échoué (offline) : aucun écran de collecte ; le succès ultérieur décide', async () => {
    const { ctx, shows, loading } = build(freshDb(), { session: { user: { id: 'U3', email: 'off@x.fr' } } });
    await ctx._obSeqBootStart();
    ctx._obSeqOnHydrationSettled('failed');
    expect(totalShows(shows)).toBe(0);           // on ne sait toujours pas → rien
    expect(loading.hidden).toBeGreaterThan(0);   // mais l'app locale redevient utilisable
    expect(ctx._obSeqWaitingHydration).toBe(true); // l'attente reste armée pour le retry
    // retry réussi plus tard → compte existant hydraté
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx._obSeqOnHydrationSettled('hydrated');
    expect(totalShows(shows)).toBe(0);
  });

  test('session anonyme (sans email) → pas d\'attente : onboarding immédiat', async () => {
    const { ctx, shows } = build(freshDb(), { session: { user: { id: 'anon-1', email: null } } });
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);
    expect(ctx._obSeqWaitingHydration).toBe(false);
  });

  test('appareil vierge sans session → onboarding immédiat, aucune attente', async () => {
    const { ctx, shows, loading } = build(freshDb(), { session: null });
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);
    expect(loading.shown).toBe(0);
  });

  test('offline pur (supaClient absent) → onboarding immédiat', async () => {
    const { ctx, shows } = build(freshDb(), { noSupa: true });
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);
  });

  test('verrou déjà hydraté au moment du boot (boot re-entrant) → décision immédiate, pas d\'attente morte', async () => {
    // Le pull a DÉJÀ tout réglé (blob adopté onboardé, verrou hydraté) quand bootStart tourne.
    const dbAdopted = { user: { onboarded: true, onboardingVersion: 4, ownerUid: 'U4' } };
    const { ctx, shows } = build(dbAdopted, { session: { user: { id: 'U4', email: 'race@x.fr' } }, hydration: 'hydrated' });
    await ctx._obSeqBootStart();
    expect(totalShows(shows)).toBe(0); // rien à faire, et surtout pas d'attente jamais résolue
    expect(ctx._obSeqActive).toBe(false);
  });

  test('verrou passé à « failed » avant le boot → re-check immédiat, attente conservée sans spinner mort', async () => {
    const { ctx, shows, loading } = build(freshDb(), { session: { user: { id: 'U5', email: 'f@x.fr' } }, hydration: 'failed' });
    await ctx._obSeqBootStart();
    expect(totalShows(shows)).toBe(0);
    expect(ctx._obSeqWaitingHydration).toBe(true); // l'attente reste armée (le retry décidera)
    expect(loading.shown).toBe(0);                  // pas de spinner permanent sur un état déjà tranché
  });

  test('pendant l\'attente, obSeqStart/obSeqAdvance sont inertes (aucune ouverture possible)', async () => {
    const { ctx, shows } = build(freshDb(), { session: { user: { id: 'U5', email: 'wait@x.fr' } } });
    await ctx._obSeqBootStart();
    ctx.obSeqStart(); ctx.obSeqAdvance();
    expect(totalShows(shows)).toBe(0);
  });
});

describe('P1-B — pause « J\'ai déjà un compte » distincte de l\'attente D-B (fix revue)', () => {
  test('obSeqGotoLogin met _obSeqLoginPause (pas _obSeqWaitingHydration) + login force', () => {
    const { ctx, loginCalls } = build(freshDb());
    ctx.obSeqStart();          // file active, q1 affiché
    ctx.obSeqGotoLogin();
    expect(ctx._obSeqLoginPause).toBe(true);
    expect(ctx._obSeqWaitingHydration).toBe(false);
    expect(loginCalls.showForce).toBe(1);
  });

  test('un settle d\'hydratation ANONYME ne consomme PAS la pause login (pas de réouverture de q1)', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    const showsAfterQ1 = totalShows(shows); // 1 (profil)
    ctx.obSeqGotoLogin();                    // pause login
    // pull anonyme aboutit → _markCloudHydrated → hook
    ctx._obSeqOnHydrationSettled('hydrated');
    // La pause login n'est pas touchée : aucune réouverture d'écran de collecte
    expect(ctx._obSeqLoginPause).toBe(true);
    expect(totalShows(shows)).toBe(showsAfterQ1); // toujours 1, pas de q1 rouvert
  });

  test('loginBackFromOb lève la pause et reprend la file', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.obSeqGotoLogin();
    ctx.loginBackFromOb();
    expect(ctx._obSeqLoginPause).toBe(false);
    expect(ctx._obSeqCurrent).toBe('profile'); // la file a repris sur q1 (showOnboarding idempotent en prod)
    expect(ctx._obSeqActive).toBe(true);
  });

  test('_obSeqOnLoginResolved (login réussi) lève la pause ; compte onboardé → pas d\'onboarding', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.obSeqGotoLogin();
    // resolveIdentity a adopté le blob cloud d'un compte onboardé (remplace db, sans marqueur ;
    // ici on garde le marqueur du tunnel abandonné pour vérifier son effacement défensif).
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx._obSeqOnLoginResolved();
    expect(ctx._obSeqLoginPause).toBe(false);
    expect(ctx.db._obSeqTunnel).toBeUndefined(); // marqueur du tunnel abandonné effacé
    expect(ctx._obSeqActive).toBe(false);         // file fermée : compte établi
    expect(totalShows(shows)).toBe(1);            // seulement le q1 initial, pas de Magic Start
  });

  test('pendant la pause login, obSeqStart/obSeqAdvance sont inertes', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    const n = totalShows(shows);
    ctx.obSeqGotoLogin();
    ctx.obSeqStart(); ctx.obSeqAdvance();
    expect(totalShows(shows)).toBe(n);
  });
});

describe('P2-E — login ré-affiché à la clôture pour un établi déconnecté (fix revue)', () => {
  test('welcome-back sans session email → login (force) à la fin de la file', async () => {
    const dbWb = { user: { onboarded: true, onboardingVersion: 3 } };
    // getSession 'null' : la réconciliation de clôture (P2-E) interroge légitimement la
    // session — ici il n'y en a pas (c'est le seul usage réseau restant, non-critique).
    const { ctx, loginCalls } = build(dbWb, { session: null, getSession: 'null' });
    ctx.obSeqStart();
    ctx.db.user.onboardingVersion = 4; // obFinishWelcomeBack
    ctx.obSeqDone('profile');           // file terminée → _obSeqReconcileAuthAtClose (async)
    await new Promise((r) => setTimeout(r, 0)); // laisser la promesse getSession se résoudre
    expect(loginCalls.showForce).toBeGreaterThanOrEqual(1);
  });

  test('nouveau tunnel terminé sans compte (D-C) → PAS de login forcé', async () => {
    const { ctx, loginCalls } = build(freshDb(), { session: null });
    ctx.obSeqStart();
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.obSeqDone('profile');
    ctx.db._magicStartDone = true; ctx.obSeqDone('plan');
    ctx.db.user.quizDone = true; ctx.obSeqDone('classQuiz'); // file terminée (fresh run)
    await new Promise((r) => setTimeout(r, 0));
    expect(loginCalls.showForce).toBe(0); // D-C : pas de compte forcé
  });
});

describe('P2-D — logout ramène au login, pas à l\'onboarding (fix revue)', () => {
  test('marqueur _obSeqPostLogout au boot → login (force), file non démarrée', async () => {
    let removed = false;
    const ls = { getItem: (k) => (k === '_obSeqPostLogout' && !removed ? '1' : null), setItem: () => {}, removeItem: () => { removed = true; } };
    const { ctx, shows, loginCalls } = build(freshDb(), { localStorage: ls });
    await ctx._obSeqBootStart();
    expect(loginCalls.showForce).toBe(1);
    expect(totalShows(shows)).toBe(0); // onboarding NON démarré
    expect(removed).toBe(true);         // marqueur consommé (one-shot)
  });
});

describe('FIX B1 — signup post-logout : l\'onboarding démarre SANS reload (device 22/07)', () => {
  test('aucune pause armée (chemin logout → login screen → Inscription) → la file démarre quand même', () => {
    // Reproduit le constat device : _claimLocalOnSignup vient de poser un defaultDB tatoué,
    // AUCUNE pause n'a jamais été armée (ni lien q1, ni attente D-B).
    const dbPostSignup = { user: { onboarded: false, onboardingVersion: 0, ownerUid: 'NEW-UID' }, _magicStartDone: false, weeklyPlan: null };
    const { ctx, shows } = build(dbPostSignup);
    expect(ctx._obSeqWaitingHydration).toBe(false);
    expect(ctx._obSeqLoginPause).toBe(false);
    ctx._obSeqResumeAfterSignup();
    expect(shows.profile).toBe(1);        // q1 s'ouvre immédiatement — plus de reload nécessaire
    expect(ctx._obSeqActive).toBe(true);
  });

  test('signup depuis une pause « J\'ai déjà un compte » → lève la pause et démarre (comportement conservé)', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.obSeqGotoLogin();                  // pause login armée
    // _claimLocalOnSignup a purgé (blob mid-onboarding = defaultDB) puis :
    ctx._obSeqResumeAfterSignup();
    expect(ctx._obSeqLoginPause).toBe(false);
    expect(ctx._obSeqActive).toBe(true);   // la file repart sur q1
  });

  test('compte qui n\'a pas besoin de la file (onboardé, pas de tunnel) → no-op sûr', () => {
    const done = { user: { onboarded: true, onboardingVersion: 4, ownerUid: 'U1' } };
    const { ctx, shows } = build(done);
    ctx._obSeqResumeAfterSignup();
    expect(totalShows(shows)).toBe(0);     // obSeqStart gardé par needsOnboarding
    expect(ctx._obSeqActive).toBe(false);
  });
});

describe('ordonnanceur — signaux hors file', () => {
  test('obSeqDone hors file active : no-op (quiz refait depuis Réglages, etc.)', () => {
    const done = { user: { onboarded: true, onboardingVersion: 4, quizDone: true } };
    const { ctx, shows } = build(done);
    ctx.obSeqDone('classQuiz');
    expect(totalShows(shows)).toBe(0);
    expect(ctx._obSeqActive).toBe(false);
  });
});
