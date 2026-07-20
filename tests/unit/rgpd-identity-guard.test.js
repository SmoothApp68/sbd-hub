// RC4 — garde d'identité (P0 RGPD), architecture ADOPT-FIRST. L'app était aveugle à
// l'identité : un blob local résiduel était adopté et poussé vers le cloud du compte entrant
// (fuite de données de santé + résurrection). Piliers : (1) on ne pousse un blob QUE tatoué
// au nom EXACT de la session (_canPushForOwner) → un résiduel ne fuit jamais, sans purge ;
// (2) resolveIdentity ADOPTE le cloud avant de toucher au local → jamais de destruction à
// l'aveugle (hors-ligne = on ne touche à rien). Fonctions extraites de la VRAIE source (vm).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}
function extractConstArr(src, name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*\\[[^\\]]*\\];'));
  if (!m) throw new Error('Could not extract const ' + name);
  return m[0];
}
function extractArrowConst(src, name) {
  const m = src.match(new RegExp('const ' + name + ' = \\(\\) => \\(\\{[\\s\\S]*?\\n\\}\\);'));
  if (!m) throw new Error('Could not extract arrow const ' + name);
  return m[0];
}

function makeLS() {
  const store = {};
  return {
    _store: store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}
const sbdKeys = (ls) => Object.keys(ls._store).filter((k) => k.indexOf('SBD_HUB') === 0);

// Contexte pour les fonctions pures + le reset synchrone (defaultDB réel par défaut).
function buildSync(ls, initialDb, opts) {
  opts = opts || {};
  const ctx = { JSON: JSON, localStorage: ls, console: { warn() {}, log() {} } };
  vm.createContext(ctx);
  vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", ctx);
  vm.runInContext(extractConstArr(ENGINE, 'SBD_HUB_ALL_KEYS'), ctx);
  if (opts.realDefault) vm.runInContext(extractArrowConst(APP, 'defaultDB'), ctx);
  else vm.runInContext('var defaultDB = () => ({ user: {}, logs: [] });', ctx);
  vm.runInContext(extractFn(APP, 'purgeAllLocalDb'), ctx);
  vm.runInContext(extractFn(APP, '_identityVerdict'), ctx);
  vm.runInContext(extractFn(APP, '_canPushForOwner'), ctx);
  vm.runInContext(extractFn(APP, '_stampOwner'), ctx);
  vm.runInContext(extractFn(APP, '_clearDeviceSyncMarkers'), ctx);
  vm.runInContext(extractFn(APP, '_clearLegacyDbKeys'), ctx);
  vm.runInContext(extractFn(APP, '_purgeLocalSession'), ctx);
  vm.runInContext(extractFn(APP, '_resetLocalToOwner'), ctx);
  ctx.db = initialDb;
  return ctx;
}

// Contexte pour resolveIdentity + _adoptCloudForUid, avec un supaClient stubbé.
function buildResolve(ls, initialDb, supaResponse) {
  const ctx = buildSync(ls, initialDb, { realDefault: true });
  ctx._cachedUid = 'STALE';
  // supaClient.from(...).select(...).eq(...).maybeSingle() → supaResponse (ou throw si _throw)
  const chain = {
    select: () => chain, eq: () => chain,
    maybeSingle: async () => { if (supaResponse && supaResponse._throw) throw new Error('network'); return supaResponse; },
  };
  ctx.supaClient = { from: () => chain };
  vm.runInContext('var _cachedUid = "STALE";', ctx);
  vm.runInContext('function _invalidateCachedUid() { _cachedUid = null; }', ctx);
  ctx.refreshUI = function () {};
  vm.runInContext(extractFn(SUPA, '_applyCloudBlob'), ctx); // _adoptCloudForUid s'en sert (RC4 garde 2)
  vm.runInContext(extractFn(SUPA, '_adoptCloudForUid'), ctx);
  vm.runInContext(extractFn(SUPA, 'resolveIdentity'), ctx);
  return ctx;
}

describe('RC4 — _identityVerdict (pur)', () => {
  const verdict = (o, i) => { const c = buildSync(makeLS(), null); c._o = o; c._i = i; return vm.runInContext('_identityVerdict(_o, _i)', c); };
  test('propriétaire différent → reset', () => expect(verdict('A', 'B')).toBe('reset'));
  test('même propriétaire → keep', () => expect(verdict('A', 'A')).toBe('keep'));
  test('propriétaire inconnu + uid → reset', () => expect(verdict(null, 'B')).toBe('reset'));
  test('pas d\'identité → ignore', () => expect(verdict('A', null)).toBe('ignore'));
});

describe('RC4 — _canPushForOwner : on ne pousse QUE tatoué == session (pilier anti-fuite)', () => {
  const can = (o, s) => { const c = buildSync(makeLS(), null); c._o = o; c._s = s; return vm.runInContext('_canPushForOwner(_o, _s)', c); };
  test('tatoué A, session B → REFUSÉ', () => expect(can('A', 'B')).toBe(false));
  test('même propriétaire → autorisé', () => expect(can('A', 'A')).toBe(true));
  test('blob NON tatoué (résiduel/anonyme) → REFUSÉ (ne fuit jamais)', () => expect(can(null, 'B')).toBe(false));
  test('session absente → REFUSÉ', () => expect(can('A', null)).toBe(false));
});

describe('RC4 — _resetLocalToOwner : reset SÛR (compte neuf confirmé en ligne)', () => {
  test('purge toutes les clés SBD_HUB*, marqueurs device, repart d\'un defaultDB tatoué', () => {
    const ls = makeLS();
    ['SBD_HUB_V29', 'SBD_HUB'].forEach((k) => ls.setItem(k, '{"user":{"name":"AlexGuerrier"},"logs":[{}]}'));
    ls.setItem('_lastCloudPush', '1720000000000');
    ls.setItem('_wsSyncedHashes', '{"1":"h"}');
    ls.setItem('autre', 'garde-moi');
    const ctx = buildSync(ls, { user: { ownerUid: 'A', name: 'AlexGuerrier' }, logs: [{ id: 1 }] }, { realDefault: true });
    vm.runInContext("_resetLocalToOwner('B')", ctx);
    expect(sbdKeys(ls)).toEqual([]);
    expect(ls.getItem('_lastCloudPush')).toBeNull();
    expect(ls.getItem('_wsSyncedHashes')).toBeNull();
    expect(ls.getItem('autre')).toBe('garde-moi');
    expect(ctx.db.user.name).toBe('');          // vrai defaultDB
    expect(ctx.db.user.ownerUid).toBe('B');
    expect(ctx.db.logs).toEqual([]);
  });

  test('efface les champs porteurs de santé (VRAI defaultDB, pas un double)', () => {
    const ls = makeLS();
    const residual = {
      user: { ownerUid: 'A', name: 'AlexGuerrier', consentHealth: true, medicalConsent: true, bw: 82 },
      logs: [{ id: 1 }], bestPR: { squat: 110, bench: 80, deadlift: 140 },
      garminHealth: { hrv: [55, 60], rhr: 48 }, readinessHistory: [{ sleep: 3 }],
    };
    ls.setItem('SBD_HUB_V29', JSON.stringify(residual));
    const ctx = buildSync(ls, JSON.parse(JSON.stringify(residual)), { realDefault: true });
    vm.runInContext("_resetLocalToOwner('B')", ctx);
    expect(ctx.db.garminHealth).toBeUndefined();
    expect(ctx.db.readinessHistory).toBeUndefined();
    expect(ctx.db.user.consentHealth).toBe(false);
    expect(ctx.db.user.medicalConsent).toBe(false);
    expect(ctx.db.bestPR).toEqual({ bench: 0, squat: 0, deadlift: 0 });
    expect(ctx.db.user.ownerUid).toBe('B');
  });
});

describe('RC4 — _purgeLocalSession : voix unique de déconnexion (appSignOut + cloudLogout)', () => {
  test('purge TOUTES les clés SBD_HUB* (dont legacy) + marqueurs device, db remis à zéro', () => {
    const ls = makeLS();
    ['SBD_HUB_V29', 'SBD_HUB', 'SBD_HUB_V28'].forEach((k) => ls.setItem(k, '{"user":{"name":"Aurélien"},"logs":[{}]}'));
    ls.setItem('_lastCloudPush', '1720000000000');
    ls.setItem('_lastCloudSync', '5');
    ls.setItem('_wsSyncedHashes', '{"1":"h"}');
    ls.setItem('sbd_lastTab', 'garde');
    const ctx = buildSync(ls, { user: { ownerUid: 'A', name: 'Aurélien' }, logs: [{ id: 1 }] }, { realDefault: true });
    vm.runInContext('_purgeLocalSession()', ctx);
    // Reproduit le scénario device : après « Se déconnecter », plus AUCUNE clé SBD_HUB*.
    expect(sbdKeys(ls)).toEqual([]);
    expect(ls.getItem('_lastCloudPush')).toBeNull();
    expect(ls.getItem('_lastCloudSync')).toBeNull();
    expect(ls.getItem('_wsSyncedHashes')).toBeNull();
    expect(ls.getItem('sbd_lastTab')).toBe('garde'); // ne touche pas au reste
    // db mémoire remis à zéro (le blob « Aurélien » ne survit pas pour l'inscrit suivant)
    expect(ctx.db.user.name).toBe('');
    expect(ctx.db.user.ownerUid).toBeNull();
    expect(ctx.db.logs).toEqual([]);
  });
});

describe('RC4 — resolveIdentity : adopt-first, jamais de destruction à l\'aveugle', () => {
  const ALEX = () => ({ user: { ownerUid: 'A', name: 'AlexGuerrier' }, logs: [{ id: 1 }], bestPR: { squat: 110 } });

  test('même propriétaire → kept : aucun appel cloud, blob conservé', async () => {
    const ls = makeLS();
    const ctx = buildResolve(ls, { user: { ownerUid: 'A', name: 'Aurel' }, logs: [{ id: 1 }, { id: 2 }] }, { _throw: true });
    const r = await vm.runInContext("resolveIdentity('A')", ctx);
    expect(r).toBe('kept');
    expect(ctx.db.user.name).toBe('Aurel');
    expect(ctx.db.logs).toHaveLength(2); // pas touché même si le cloud jetterait une erreur
  });

  test('identité B, cloud a des données → adopted : overwrite, tatoué B, legacy purgée', async () => {
    const ls = makeLS();
    ls.setItem('SBD_HUB', JSON.stringify(ALEX())); // clé legacy résiduelle
    const cloudBlob = { user: { name: 'Bob' }, bestPR: { squat: 200, bench: 150, deadlift: 250 } }; // pas de logs (delete out.logs)
    const ctx = buildResolve(ls, ALEX(), { data: { data: cloudBlob, updated_at: '2026-07-19T00:00:00Z' } });
    const r = await vm.runInContext("resolveIdentity('B')", ctx);
    expect(r).toBe('adopted');
    expect(ctx.db.user.name).toBe('Bob');       // données de B, pas d'AlexGuerrier
    expect(ctx.db.user.ownerUid).toBe('B');
    expect(Array.isArray(ctx.db.logs)).toBe(true); // backfill logs (le blob cloud n'en a pas)
    expect(ls.getItem('SBD_HUB')).toBeNull();   // legacy purgée (STORAGE_KEY conservée)
    expect(ls.getItem('SBD_HUB_V29')).not.toBeNull();
  });

  test('identité B, aucune ligne cloud (compte neuf EN LIGNE) → reset-new : defaultDB tatoué', async () => {
    const ls = makeLS();
    ls.setItem('SBD_HUB_V29', JSON.stringify(ALEX()));
    const ctx = buildResolve(ls, ALEX(), { data: null });
    const r = await vm.runInContext("resolveIdentity('B')", ctx);
    expect(r).toBe('reset-new');
    expect(ctx.db.user.name).toBe('');          // AlexGuerrier effacé
    expect(ctx.db.user.ownerUid).toBe('B');
    expect(sbdKeys(ls)).toEqual([]);            // résiduel purgé
  });

  test('🔴 identité B, RÉSEAU KO → deferred : le local N\'EST PAS détruit (anti perte de données)', async () => {
    const ls = makeLS();
    ls.setItem('SBD_HUB_V29', JSON.stringify(ALEX()));
    const ctx = buildResolve(ls, ALEX(), { _throw: true });
    const r = await vm.runInContext("resolveIdentity('B')", ctx);
    expect(r).toBe('deferred');
    // hors-ligne : on ne détruit rien (les données synchronisées survivent) et le blob reste
    // non-tatoué au nom de B → _canPushForOwner bloquera tout push (ni fuite ni écrasement).
    expect(ctx.db.user.name).toBe('AlexGuerrier');
    expect(ctx.db.logs).toHaveLength(1);
    expect(ctx.db.user.ownerUid).toBe('A');     // pas re-tatoué B → non poussable
    expect(ls.getItem('SBD_HUB_V29')).not.toBeNull();
    expect(vm.runInContext("_canPushForOwner(db.user.ownerUid, 'B')", ctx)).toBe(false);
  });
});
