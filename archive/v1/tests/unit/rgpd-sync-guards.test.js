// RC4 GARDES DE SYNC (P0 perte de données).
//  • v2 — CRITÈRE D'INTENTION : on ne bloque un push que si le local est un blob vide/non-hydraté
//    (defaultDB), jamais une réduction VOLONTAIRE d'un vrai profil (_isDefaultDB).
//  • durcissement — VERROU D'HYDRATATION à 3 états : un pull ÉCHOUÉ (failed) laisse le push bloqué
//    (retry du pull), il ne débloque JAMAIS sans un pull réussi. « Push bloqué » ≠ « app bloquée » :
//    l'écriture LOCALE (saveDB/_flushDB) n'est jamais gatée.
// Fonctions extraites de la VRAIE source (js/app.js, js/supabase.js) via vm — pas de copie.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}
const lsStore = () => ({ _s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } });
// Charge la machine à 3 états (vraie source) dans un contexte vm.
function loadLock(c) {
  vm.runInContext('var cloudHydrationState = "pending"; var _hydrationRetryArmed = false;', c);
  ['_canPushToCloud', '_markCloudHydrated', '_markCloudHydrationFailed', '_scheduleHydrationRetry', '_retryHydration']
    .forEach((n) => vm.runInContext(extractFn(APP, n), c));
}

const DEFAULT_DB = () => ({ user: { ownerUid: null, onboarded: false, bw: 0 }, bestPR: { squat: 0, bench: 0, deadlift: 0 }, exercises: {}, gamification: {} });
const FILLED = () => ({ user: { ownerUid: 'A', onboarded: true, bw: 98 }, bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { a: {}, b: {} }, gamification: {}, logs: [{ id: 1 }, { id: 2 }] });
const FILLED_REDUCED = () => ({ user: { ownerUid: 'A', onboarded: true, bw: 98 }, bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { a: {} }, gamification: {}, logs: [{ id: 1 }] });

// ── VERROU D'HYDRATATION 3 états (durcissement « pull échoué ») ────────────────────────────────
describe('RC4 — verrou d\'hydratation 3 états (pending/hydrated/failed)', () => {
  function lockCtx() {
    const c = {
      cloudSyncEnabled: true, db: { pendingSync: false }, Promise, console: { warn() {}, error() {} },
      navigator: { onLine: true }, _syncFromCloudCalls: 0, _syncToCloudCalls: 0,
      setTimeout() { return 1; },                 // backoff neutralisé (pas de vrai timer en test)
      async syncFromCloud() { this._syncFromCloudCalls++; }, // par défaut : ne change pas l'état
      syncToCloud() { this._syncToCloudCalls++; },
    };
    vm.createContext(c);
    loadLock(c);
    return c;
  }
  const S = (c) => vm.runInContext('cloudHydrationState', c);
  const canPush = (c) => vm.runInContext('_canPushToCloud()', c);

  test('défaut = pending → push bloqué', () => {
    const c = lockCtx();
    expect(S(c)).toBe('pending');
    expect(canPush(c)).toBe(false);
  });
  test('pull réussi (_markCloudHydrated) → hydrated → push autorisé', () => {
    const c = lockCtx();
    vm.runInContext('_markCloudHydrated()', c);
    expect(S(c)).toBe('hydrated');
    expect(canPush(c)).toBe(true);
  });
  test('(a) pull échoué (_markCloudHydrationFailed) → failed → push TOUJOURS bloqué', () => {
    const c = lockCtx();
    vm.runInContext('_markCloudHydrationFailed()', c);
    expect(S(c)).toBe('failed');
    expect(canPush(c)).toBe(false);
  });
  test('(c) N échecs successifs → JAMAIS hydrated (pas de déblocage sur compteur/timeout)', () => {
    const c = lockCtx();
    for (let i = 0; i < 10; i++) vm.runInContext('_markCloudHydrationFailed()', c);
    expect(S(c)).toBe('failed');
    expect(canPush(c)).toBe(false);
  });
  test('un pull échoué NE rétrograde PAS un état déjà hydraté', () => {
    const c = lockCtx();
    vm.runInContext('_markCloudHydrated()', c);
    vm.runInContext('_markCloudHydrationFailed()', c);
    expect(S(c)).toBe('hydrated');
  });
  test('(b) failed → un PULL RÉUSSI (le seul chemin) → hydrated → push repart', async () => {
    const c = lockCtx();
    // stub : un pull réussi pose 'hydrated' (comme le vrai syncFromCloud)
    vm.runInContext('syncFromCloud = async function(){ _syncFromCloudCalls++; _markCloudHydrated(); };', c);
    vm.runInContext('_markCloudHydrationFailed()', c);
    expect(S(c)).toBe('failed');
    vm.runInContext('_retryHydration()', c);        // retry = re-tenter le PULL
    await Promise.resolve();
    expect(c._syncFromCloudCalls).toBeGreaterThan(0);
    expect(S(c)).toBe('hydrated');
    expect(canPush(c)).toBe(true);
  });
  test('(b) retry quand un pull échoue à nouveau → reste failed (retry re-planifié, jamais débloqué)', async () => {
    const c = lockCtx();
    vm.runInContext('syncFromCloud = async function(){ _syncFromCloudCalls++; _markCloudHydrationFailed(); };', c);
    vm.runInContext('_markCloudHydrationFailed()', c);
    vm.runInContext('_retryHydration()', c);
    await Promise.resolve();
    expect(S(c)).toBe('failed');
    expect(vm.runInContext('_canPushToCloud()', c)).toBe(false);
  });
});

// ── _isDefaultDB : critère d'intention (inchangé v2) ──────────────────────────────────────────
describe('RC4 v2 — _isDefaultDB (blob vide/non rempli ?)', () => {
  function isDefault(d) { const c = {}; vm.createContext(c); vm.runInContext(extractFn(APP, '_isDefaultDB'), c); c._d = d; return vm.runInContext('_isDefaultDB(_d)', c); }
  test('defaultDB (0/0/0, !onboarded, pas d\'ownerUid) → true', () => { expect(isDefault(DEFAULT_DB())).toBe(true); });
  test('vrai profil rempli → false', () => { expect(isDefault(FILLED())).toBe(false); });
  test('un PR réel OU onboarded OU ownerUid → PAS un defaultDB', () => {
    expect(isDefault({ user: { onboarded: false, ownerUid: null }, bestPR: { squat: 100 } })).toBe(false);
    expect(isDefault({ user: { onboarded: true, ownerUid: null }, bestPR: {} })).toBe(false);
    expect(isDefault({ user: { onboarded: false, ownerUid: 'A' }, bestPR: {} })).toBe(false);
  });
  test('null / {} → vide (true)', () => { expect(isDefault(null)).toBe(true); expect(isDefault({})).toBe(true); });
});

// ── GARDE 0 : debouncedCloudSync — verrou + écriture locale JAMAIS bloquée ─────────────────────
describe('RC4 — GARDE 0 : debouncedCloudSync (vraie source)', () => {
  function bootCtx(state, cloudSyncEnabled = true) {
    const c = {
      cloudSyncEnabled, db: {}, syncDebounceTimer: null, navigator: { onLine: true }, Promise,
      _flushCalled: false, _scheduled: false, console: { warn() {}, error() {} },
      _flushDB() { c._flushCalled = true; }, syncToCloud() {}, clearTimeout() {},
      setTimeout() { c._scheduled = true; return 1; },
    };
    vm.createContext(c);
    loadLock(c);
    vm.runInContext('cloudHydrationState = "' + state + '";', c);
    vm.runInContext(extractFn(APP, 'debouncedCloudSync'), c);
    return c;
  }
  test('pending → push différé, mais SAUVEGARDE LOCALE effectuée (_flushDB), rien programmé', () => {
    const c = bootCtx('pending');
    vm.runInContext('debouncedCloudSync()', c);
    expect(c.db.pendingSync).toBe(true);
    expect(c._flushCalled).toBe(true);   // Garantie 1 : le local n'est jamais bloqué
    expect(c._scheduled).toBe(false);
  });
  test('(a) failed → push différé, mais _flushDB local effectué', () => {
    const c = bootCtx('failed');
    vm.runInContext('debouncedCloudSync()', c);
    expect(c.db.pendingSync).toBe(true);
    expect(c._flushCalled).toBe(true);
    expect(c._scheduled).toBe(false);
  });
  test('hydrated → push programmé', () => {
    const c = bootCtx('hydrated');
    vm.runInContext('debouncedCloudSync()', c);
    expect(c._scheduled).toBe(true);
  });
  test('(d) mode hors-ligne total (cloudSyncEnabled=false) → return immédiat, aucune sync, aucun blocage', () => {
    const c = bootCtx('pending', false);
    vm.runInContext('debouncedCloudSync()', c);
    expect(c._scheduled).toBe(false);
    expect(c.db.pendingSync).toBeUndefined(); // pas même de mise en attente : rien à synchroniser
  });
});

// ── GARDE 1 : syncToCloud — verrou hydratation + intention ────────────────────────────────────
describe('RC4 — GARDE 1 : syncToCloud (vraie source)', () => {
  function syncCtx({ db, hydrated = true, cloudSyncEnabled = true }) {
    const calls = { upserted: false, syncFromCloud: false };
    const chain = {
      select() { return chain; }, eq() { return chain; },
      upsert() { calls.upserted = true; return chain; },
      async single() { return { data: { updated_at: new Date(1000).toISOString() } }; },
      async maybeSingle() { return { data: null }; },
    };
    const c = {
      JSON, console: { warn() {}, error() {}, log() {} }, Date, parseInt, String, Object, Math, Promise,
      localStorage: lsStore(), STORAGE_KEY: 'SBD_HUB_V29', navigator: { onLine: true }, setTimeout() { return 1; },
      cloudSyncEnabled,
      supaClient: { auth: { async getUser() { return { data: { user: { id: 'A', email: 'a@a' } } }; } }, from() { return chain; } },
      db,
      _computeDataHash: () => 'H', _buildSyncedBlob: () => ({ blob: true }),
      updateSyncStatus() {}, showToast() {}, syncLeaderboard() {},
      async syncLogsToSupabase() {},
      async syncFromCloud() { calls.syncFromCloud = true; },
    };
    vm.createContext(c);
    loadLock(c);
    vm.runInContext('cloudHydrationState = "' + (hydrated ? 'hydrated' : 'pending') + '";', c);
    vm.runInContext(extractFn(APP, '_isDefaultDB'), c);
    vm.runInContext(extractFn(APP, '_canPushForOwner'), c);
    vm.runInContext(extractFn(SUPA, 'syncToCloud'), c);
    return { c, calls };
  }

  test('(a) NON-RÉGRESSION P0 : defaultDB (hydraté) → push refusé, pull de réalignement', async () => {
    const { c, calls } = syncCtx({ db: DEFAULT_DB() });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(false);
    expect(calls.syncFromCloud).toBe(true);
  });
  test('(a) verrou non-hydraté (pending/failed) → push différé AVANT tout (aucun upsert, aucun pull)', async () => {
    const { c, calls } = syncCtx({ db: FILLED(), hydrated: false });
    await vm.runInContext('syncToCloud(true)', c);
    expect(c.db.pendingSync).toBe(true);
    expect(calls.upserted).toBe(false);
    expect(calls.syncFromCloud).toBe(false); // le verrou coupe avant la garde defaultDB
  });
  test('(d) vrai profil réduit (suppression volontaire) + hydraté → push AUTORISÉ, pas de pull', async () => {
    const { c, calls } = syncCtx({ db: FILLED_REDUCED() });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(true);
    expect(calls.syncFromCloud).toBe(false);
  });
  test('(e) vrai profil + séance offline + hydraté → push autorisé', async () => {
    const { c, calls } = syncCtx({ db: FILLED() });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(true);
  });
  test('(f) suppression de compte (cloudSyncEnabled=false) → no-op total', async () => {
    const { c, calls } = syncCtx({ db: DEFAULT_DB(), cloudSyncEnabled: false });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(false);
    expect(calls.syncFromCloud).toBe(false);
    expect(c.db.pendingSync).toBeUndefined();
  });
});

// ── GARDE 2 : resolveIdentity pose l'état d'hydratation ────────────────────────────────────────
describe('RC4 — resolveIdentity pose le verrou d\'hydratation (vraie source)', () => {
  function resolveCtx(db, cloudRow, opts) {
    opts = opts || {};
    let fetched = false;
    const c = {
      JSON, console: { warn() {}, log() {}, error() {} }, localStorage: lsStore(), refreshUI() {}, Date,
      _cachedUid: 'x', cloudSyncEnabled: true, navigator: { onLine: true }, Promise, setTimeout() { return 1; },
      db, syncToCloud() {}, async syncFromCloud() {},
    };
    vm.createContext(c);
    loadLock(c);
    vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", c);
    vm.runInContext('function _invalidateCachedUid(){ _cachedUid = null; }', c);
    ['_identityVerdict', '_stampOwner'].forEach((n) => vm.runInContext(extractFn(APP, n), c));
    vm.runInContext('function _clearDeviceSyncMarkers(){}', c);
    vm.runInContext('function _clearLegacyDbKeys(){}', c);
    vm.runInContext('function _resetLocalToOwner(){}', c);
    vm.runInContext(extractFn(SUPA, '_applyCloudBlob'), c);
    vm.runInContext(extractFn(SUPA, '_adoptCloudForUid'), c);
    vm.runInContext(extractFn(SUPA, 'resolveIdentity'), c);
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => { fetched = true; if (opts.error) return { error: { message: 'net' } }; return { data: cloudRow }; } };
    c.supaClient = { from: () => chain };
    c.db = db;
    return { c, getFetched: () => fetched };
  }
  const RICH_ROW = { data: { user: { name: 'Aurel', onboarded: true }, bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { a: {}, b: {} } }, updated_at: '2026-07-20T00:00:00Z' };
  const S = (c) => vm.runInContext('cloudHydrationState', c);

  test('(c) login defaultDB + cloud riche → adopte le cloud ET pose hydrated', async () => {
    const { c } = resolveCtx(DEFAULT_DB(), RICH_ROW);
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('adopted');
    expect(S(c)).toBe('hydrated');
    expect(c.db.bestPR).toEqual({ squat: 145, bench: 140, deadlift: 170 });
  });
  test('(a) login, pull d\'identité ÉCHOUE (réseau) → deferred ET pose failed (push restera bloqué)', async () => {
    const { c } = resolveCtx(DEFAULT_DB(), null, { error: true });
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('deferred');
    expect(S(c)).toBe('failed');
    expect(vm.runInContext('_canPushToCloud()', c)).toBe(false);
  });
  test('keep même owner (établi) → kept, hydrated, aucun fetch', async () => {
    const { c, getFetched } = resolveCtx(FILLED(), RICH_ROW);
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('kept');
    expect(S(c)).toBe('hydrated');
    expect(getFetched()).toBe(false);
    expect(c.db.logs).toHaveLength(2);
  });
});

// ── FIX perte de séance à l'adoption : UNION par session_id (= log.id) ─────────────────────────
// Le trou : à l'adoption TOFU, _applyCloudBlob remplace db par le blob cloud (db.logs vidé) → une
// séance loggée hors-ligne (local pré-adoption, jamais poussée) était perdue. _reconcileAdoptedSessions
// la réunit (union par log.id/session_id) avec l'historique cloud puis la pousse. Vraie source, vm.
describe('RC4 — union des séances à l\'adoption (anti-perte offline)', () => {
  function makeSupa(cloudBlob, cloudSessions) {
    const calls = { upserts: [], deletes: [] };
    function resolveQuery(q) {
      if (q.table === 'sbd_profiles') {
        if (q.op === 'select') return { data: cloudBlob ? { data: cloudBlob, updated_at: '2026-07-20T00:00:00Z' } : null, error: null };
        if (q.op === 'upsert') return { data: { updated_at: '2026-07-20T00:00:00Z' }, error: null };
      }
      if (q.table === 'workout_sessions') {
        if (q.op === 'select' && q.cols === 'session_id') return { data: (cloudSessions || []).map(function (s) { return { session_id: s.session_id }; }), error: null };
        if (q.op === 'select' && q.cols === 'data') {
          var list = q.inList ? (cloudSessions || []).filter(function (s) { return q.inList.indexOf(s.session_id) !== -1; }) : (cloudSessions || []);
          return { data: list.map(function (s) { return { data: s.data }; }), error: null };
        }
        if (q.op === 'upsert') { (q.payload || []).forEach(function (r) { calls.upserts.push(r); }); return { data: null, error: null }; }
        if (q.op === 'delete') { calls.deletes.push(q.inList || 'all'); return { data: null, error: null }; }
      }
      return { data: null, error: null };
    }
    function builder(table) {
      var q = { table: table, op: 'select', cols: null, inList: null, payload: null };
      var b = {
        select: function (cols) { q.op = 'select'; q.cols = cols; return b; },
        eq: function () { return b; }, in: function (col, list) { q.inList = list; return b; },
        order: function () { return b; }, range: function () { return b; },
        upsert: function (rows) { q.op = 'upsert'; q.payload = rows; return b; },
        delete: function () { q.op = 'delete'; return b; },
        maybeSingle: function () { return Promise.resolve(resolveQuery(q)); },
        single: function () { return Promise.resolve(resolveQuery(q)); },
        then: function (res, rej) { return Promise.resolve(resolveQuery(q)).then(res, rej); },
      };
      return b;
    }
    return { _calls: calls, auth: { getUser: async function () { return { data: { user: { id: 'A' } } }; } }, from: function (t) { return builder(t); } };
  }
  function ctx({ db, cloudBlob, cloudSessions }) {
    const supa = makeSupa(cloudBlob, cloudSessions);
    const c = {
      JSON, Date, parseInt, String, Object, Array, Math, Promise, console: { warn() {}, error() {}, log() {} },
      localStorage: lsStore(), STORAGE_KEY: 'SBD_HUB_V29', cloudSyncEnabled: true, navigator: { onLine: true },
      setTimeout() { return 1; }, refreshUI() {}, showToast() {}, updateSyncStatus() {},
      _clearDeviceSyncMarkers() {}, _clearLegacyDbKeys() {}, _invalidateCachedUid() {}, sentryCaptureSilent() {},
      saveDB() {}, saveDBNow() {}, __recalcCalled: false, recalcBestPR() { c.__recalcCalled = true; },
      supaClient: supa, __supa: supa, db,
    };
    vm.createContext(c);
    vm.runInContext('var _cachedUid;', c);
    vm.runInContext('var cloudHydrationState="pending"; var _hydrationRetryArmed=false;', c);
    ['_identityVerdict', '_stampOwner', '_canPushForOwner', '_markCloudHydrated', '_markCloudHydrationFailed', '_scheduleHydrationRetry', '_retryHydration']
      .forEach(function (n) { vm.runInContext(extractFn(APP, n), c); });
    ['_applyCloudBlob', '_adoptCloudForUid', '_reconcileAdoptedSessions', 'resolveIdentity', 'reconcileLogsFromCloud', '_reconcileLogs', '_logEditClock', 'syncLogsToSupabase', 'computeWorkoutSessionsSyncPlan', '_wsLogHash']
      .forEach(function (n) { vm.runInContext(extractFn(SUPA, n), c); });
    return c;
  }
  const upsertedIds = (c) => c.__supa._calls.upserts.map(function (u) { return u.session_id; });
  const logIds = (c) => vm.runInContext('db.logs.map(function(l){return l.id;})', c);

  test('(a) 🔴 offline (session_id absent du cloud) → survit dans db.logs, poussée, + historique cloud réuni ; (e) bestPR recalculé', async () => {
    const c = ctx({
      db: { user: { ownerUid: 'A' }, logs: [], bestPR: {}, gamification: {} },
      cloudSessions: [{ session_id: 'H1', data: { id: 'H1', timestamp: 3000 } }, { session_id: 'H2', data: { id: 'H2', timestamp: 2000 } }],
    });
    c._pre = [{ id: 'X', timestamp: 5000, volume: 100, exercises: [{}] }]; // séance hors-ligne
    await vm.runInContext('_reconcileAdoptedSessions("A", _pre)', c);
    expect(logIds(c)).toEqual(['X', 'H1', 'H2']);   // union par log.id/session_id (tri desc)
    expect(upsertedIds(c)).toEqual(['X']);          // seule l'offline est poussée (keyée session_id)
    expect(c.__recalcCalled).toBe(true);            // (e) bestPR depuis l'union
  });
  test('(b) collision session_id local↔cloud → une seule occurrence (la plus récente editedAt)', () => {
    const c = ctx({ db: { user: { ownerUid: 'A' }, logs: [] }, cloudSessions: [] });
    c._local = [{ id: 'X', timestamp: 200, editedAt: 200 }];
    c._cloud = [{ id: 'X', timestamp: 200, editedAt: 100 }];
    const merged = vm.runInContext('_reconcileLogs(_local, _cloud)', c);
    expect(merged.length).toBe(1);
    expect(merged[0].editedAt).toBe(200);
  });
  test('preAdoptLogs vide (nouvel appareil vierge OU local d\'un autre owner) → no-op : aucune fusion, aucun upsert', async () => {
    const c = ctx({ db: { user: { ownerUid: 'A' }, logs: [], bestPR: {}, gamification: {} }, cloudSessions: [] });
    c._pre = [];
    await vm.runInContext('_reconcileAdoptedSessions("A", _pre)', c);
    expect(upsertedIds(c).length).toBe(0);
  });
  test('(a bis) resolveIdentity TOFU (local NON tatoué + offline) → adopte, séance offline conservée ET poussée, historique cloud là', async () => {
    const c = ctx({
      db: { user: { ownerUid: null, onboarded: false }, logs: [{ id: 'X', timestamp: 5000, exercises: [{}] }], bestPR: {}, gamification: {} },
      cloudBlob: { user: { name: 'Aurel', onboarded: true }, bestPR: { squat: 145 }, exercises: { a: {} } },
      cloudSessions: [{ session_id: 'H1', data: { id: 'H1', timestamp: 3000 } }],
    });
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('adopted');
    expect(logIds(c)).toContain('X');   // séance offline conservée
    expect(logIds(c)).toContain('H1');  // historique cloud réuni
    expect(upsertedIds(c)).toContain('X'); // offline poussée au cloud
  });
  test('(d) resolveIdentity local tatoué à un AUTRE uid → adopte le cloud SANS fusionner ses séances (pas de fuite)', async () => {
    const c = ctx({
      db: { user: { ownerUid: 'B', onboarded: true }, logs: [{ id: 'BSESSION', timestamp: 9000 }], bestPR: { squat: 200 }, gamification: {} },
      cloudBlob: { user: { name: 'Aurel', onboarded: true }, bestPR: { squat: 145 }, exercises: {} },
      cloudSessions: [{ session_id: 'H1', data: { id: 'H1', timestamp: 3000 } }],
    });
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('adopted');
    expect(logIds(c)).not.toContain('BSESSION'); // la séance de B n'est PAS fusionnée
    expect(upsertedIds(c)).not.toContain('BSESSION'); // ni poussée
  });
  test('(c) resolveIdentity keep (même owner) → local conservé, séance offline intacte (non-régression)', async () => {
    const c = ctx({
      db: { user: { ownerUid: 'A', onboarded: true }, logs: [{ id: 'X', timestamp: 5000 }], bestPR: { squat: 145 }, gamification: {} },
      cloudBlob: { user: { name: 'Aurel' }, bestPR: { squat: 145 } },
      cloudSessions: [],
    });
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('kept');
    expect(logIds(c)).toEqual(['X']);
  });
});
