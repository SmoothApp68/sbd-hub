// FIX D-B fail-closed (repro device 22/07/2026, validé Aurélien) — la garde D-B était
// FAIL-OPEN : sonde asynchrone (await getSession) dans un try/catch muet, mustWait=false
// par défaut → token expiré en cours de refresh ou contention LockManager → null/throw
// avalés → écran de collecte (q1) ouvert sur un VRAI compte (cache vidé + session
// persistée), avant le pull. Le fix : la présence du token supabase en localStorage
// (sonde SYNCHRONE _sbPersistedSessionKind) DÉCIDE ; aucun échec réseau ne peut dé-armer
// l'attente. En cas de doute (clé illisible) → FAIL-CLOSED (attendre).
// Vraie source via vm ; stubs getSession HOSTILES pour prouver l'indépendance au réseau.
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
  const m = src.match(new RegExp('^var ' + name + ' = \\[[\\s\\S]*?^\\];', 'm'));
  if (!m) throw new Error('Could not extract var ' + name);
  return m[0];
}

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

// getSessionMode : 'throw' (contention LockManager) | 'null' (refresh en échec → session null)
function build(initialDb, lsSeed, getSessionMode) {
  const shows = { profile: 0, plan: 0, swipe: 0, classQuiz: 0 };
  const loading = { shown: 0, hidden: 0 };
  const ctx = {
    JSON, console: { warn() {}, log() {} },
    db: initialDb,
    ONBOARDING_VERSION: 4,
    cloudHydrationState: 'pending',
    document: { getElementById: () => null },
    logErrorToSupabase: () => {},
    saveDB: () => {},
    localStorage: makeLS(lsSeed),
    hideOnboarding: () => {}, hideLoginScreen: () => {},
    showLoginScreen: () => {},
    setTimeout: () => {}, // watchdog non exécuté ici
    supaClient: { auth: { getSession: getSessionMode === 'null'
      ? (async () => ({ data: { session: null } }))                          // variante « null »
      : (async () => { throw new Error('NavigatorLockAcquireTimeout'); }) } }, // variante « throw »
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn(APP, 'needsOnboarding'), ctx);
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
  ctx.showOnboarding = () => { shows.profile++; };
  ctx.showMagicStart = () => { shows.plan++; };
  ctx.renderSwipeOnboarding = () => { shows.swipe++; };
  ctx.showClassQuiz = () => { shows.classQuiz++; };
  ctx._obSeqShowLoading = () => { loading.shown++; };
  ctx._obSeqHideLoading = () => { loading.hidden++; };
  return { ctx, shows, loading };
}

const freshDb = () => ({ user: { onboarded: false, onboardingVersion: 0, ownerUid: null }, _magicStartDone: false, weeklyPlan: null });
const totalShows = (s) => s.profile + s.plan + s.swipe + s.classQuiz;
const EMAIL_KEY = { 'sb-swwygywahfdenyzotrce-auth-token': JSON.stringify({ user: { id: 'U-AUREL', email: 'aurel@x.fr' } }) };

describe('REPRO DEVICE 22/07 — cache vidé + session persistée : AUCUN écran de collecte', () => {
  test.each([['throw'], ['null']])('variante getSession %s → attente armée, zéro écran ; pull adopté → app directe', async (mode) => {
    const { ctx, shows, loading } = build(freshDb(), EMAIL_KEY, mode);
    await ctx._obSeqBootStart();
    // Le réseau a été hostile — la clé localStorage a décidé quand même :
    expect(totalShows(shows)).toBe(0);              // aucun écran de collecte, pas même un flash
    expect(ctx._obSeqWaitingHydration).toBe(true);  // attente D-B armée
    expect(loading.shown).toBe(1);                  // écran neutre
    // Le pull RC4 adopte le blob cloud (compte établi, 553 séances) :
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4; ctx.db.user.ownerUid = 'U-AUREL';
    ctx.cloudHydrationState = 'hydrated';
    ctx._obSeqOnHydrationSettled('hydrated');
    expect(totalShows(shows)).toBe(0);              // l'app s'ouvre, jamais d'onboarding
    expect(ctx._obSeqActive).toBe(false);
  });
});

describe('_sbPersistedSessionKind — la sonde synchrone', () => {
  const kindOf = (seed) => {
    const { ctx } = build(freshDb(), seed, 'throw');
    return vm.runInContext('_sbPersistedSessionKind()', ctx);
  };
  test('session email → email', () => {
    expect(kindOf(EMAIL_KEY)).toBe('email');
  });
  test('session anonyme (email null) → anon', () => {
    expect(kindOf({ 'sb-x-auth-token': JSON.stringify({ user: { id: 'anon-1', email: null } }) })).toBe('anon');
  });
  test('format legacy currentSession → email', () => {
    expect(kindOf({ 'sb-x-auth-token': JSON.stringify({ currentSession: { user: { id: 'U1', email: 'a@b.c' } } }) })).toBe('email');
  });
  test('aucune clé → none', () => {
    expect(kindOf({})).toBe('none');
  });
  test('clé illisible (JSON corrompu) → opaque (fail-closed)', () => {
    expect(kindOf({ 'sb-x-auth-token': '{corrompu' })).toBe('opaque');
  });
  test('token CHUNKÉ (sb-…-auth-token.0, JSON partiel) → opaque (fail-closed)', () => {
    expect(kindOf({ 'sb-x-auth-token.0': '{"user":{"id":"U1","em' })).toBe('opaque');
  });
  test('JSON valide mais sans user → opaque (fail-closed)', () => {
    expect(kindOf({ 'sb-x-auth-token': JSON.stringify({ whatever: 1 }) })).toBe('opaque');
  });
});

describe('fail-closed — clé illisible = attendre (jamais collecter dans le doute)', () => {
  test('clé opaque + db vierge → attente armée, zéro écran', async () => {
    const { ctx, shows } = build(freshDb(), { 'sb-x-auth-token': '{corrompu' }, 'throw');
    await ctx._obSeqBootStart();
    expect(totalShows(shows)).toBe(0);
    expect(ctx._obSeqWaitingHydration).toBe(true);
  });
});

describe('non-régressions D-B (confirmées par test, pas par raisonnement)', () => {
  test('vrai appareil vierge (aucune clé sb-) → onboarding-first IMMÉDIAT', async () => {
    const { ctx, shows, loading } = build(freshDb(), {}, 'throw');
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);   // q1 tout de suite, sans attente
    expect(loading.shown).toBe(0);
    expect(ctx._obSeqWaitingHydration).toBe(false);
  });

  test('session ANONYME persistée (nouvel utilisateur mi-tunnel) → pas d\'attente, reprise immédiate', async () => {
    const { ctx, shows } = build(freshDb(), { 'sb-x-auth-token': JSON.stringify({ user: { id: 'anon-1', email: null } }) }, 'throw');
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);   // le tunnel reprend — l'anonyme n'est jamais un compte
    expect(ctx._obSeqWaitingHydration).toBe(false);
  });

  test('db local onboardé (welcome-back version en retard) + session email → affichage immédiat (v338)', async () => {
    const dbWb = { user: { onboarded: true, onboardingVersion: 3 } };
    const { ctx, shows, loading } = build(dbWb, EMAIL_KEY, 'throw');
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);   // on SAIT (onboardé local) → pas d'attente, offline compris
    expect(loading.shown).toBe(0);
  });
});
