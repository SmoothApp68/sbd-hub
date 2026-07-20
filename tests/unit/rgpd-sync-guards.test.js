// RC4 GARDES DE SYNC (P0 perte de données) — CORRECTION v2 : CRITÈRE D'INTENTION.
// Le bug : un push à l'aveugle a laissé un defaultDB (0/0/0) écraser le blob sbd_profiles d'un
// vrai user (145/140/170). Correction v1 bloquait sur la « richesse » → faux positif : une
// suppression VOLONTAIRE de séance (profil légitimement réduit) se faisait annuler par un pull.
// Correction v2 (décision Aurélien) : on ne bloque QUE si le local est un blob vide/non-hydraté
// (defaultDB), jamais une réduction volontaire d'un vrai profil. `_isDefaultDB` est le critère
// UNIQUE (bestPR + onboarded + ownerUid ; PAS db.logs — toujours vide dans le blob).
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

// Fixtures — un defaultDB (jamais rempli) vs un vrai profil (Aurel).
const DEFAULT_DB = () => ({ user: { ownerUid: null, onboarded: false, bw: 0 }, bestPR: { squat: 0, bench: 0, deadlift: 0 }, exercises: {}, gamification: {} });
const FILLED = () => ({ user: { ownerUid: 'A', onboarded: true, bw: 98 }, bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { a: {}, b: {} }, gamification: {}, logs: [{ id: 1 }, { id: 2 }] });
const FILLED_REDUCED = () => ({ user: { ownerUid: 'A', onboarded: true, bw: 98 }, bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { a: {} }, gamification: {}, logs: [{ id: 1 }] }); // une séance en MOINS (suppression volontaire)

// ── Critère UNIQUE : _isDefaultDB (blob vide/non-hydraté ?) ───────────────────────────────────
describe('RC4 v2 — _isDefaultDB : le local est-il un defaultDB (vide) et non un vrai profil réduit ?', () => {
  function isDefault(d) { const c = {}; vm.createContext(c); vm.runInContext(extractFn(APP, '_isDefaultDB'), c); c._d = d; return vm.runInContext('_isDefaultDB(_d)', c); }
  test('defaultDB (0/0/0, onboarded false, pas d\'ownerUid) → true (blob vide)', () => {
    expect(isDefault(DEFAULT_DB())).toBe(true);
  });
  test('vrai profil rempli (onboarded, ownerUid, PR) → false', () => {
    expect(isDefault(FILLED())).toBe(false);
  });
  test('NE se fie PAS à db.logs : un profil sans logs mais avec un PR n\'est PAS un defaultDB', () => {
    expect(isDefault({ user: { onboarded: false, ownerUid: null }, bestPR: { squat: 100, bench: 0, deadlift: 0 }, logs: [] })).toBe(false);
  });
  test('onboarded === true seul suffit à ne PAS être un defaultDB (même 0/0/0)', () => {
    expect(isDefault({ user: { onboarded: true, ownerUid: null }, bestPR: { squat: 0, bench: 0, deadlift: 0 } })).toBe(false);
  });
  test('présence d\'ownerUid seule suffit à ne PAS être un defaultDB', () => {
    expect(isDefault({ user: { onboarded: false, ownerUid: 'A' }, bestPR: {} })).toBe(false);
  });
  test('null / {} → traité comme vide (true, pas de crash)', () => {
    expect(isDefault(null)).toBe(true);
    expect(isDefault({})).toBe(true);
  });
});

// ── GARDE 1 : syncToCloud ne bloque QUE le defaultDB, respecte les réductions volontaires ─────
describe('RC4 v2 — GARDE 1 : syncToCloud (vraie source)', () => {
  function syncCtx({ db, bootDone = true, cloudSyncEnabled = true }) {
    const calls = { upserted: false, syncFromCloud: false };
    const chain = {
      select() { return chain; }, eq() { return chain; },
      upsert() { calls.upserted = true; return chain; },
      async single() { return { data: { updated_at: new Date(1000).toISOString() } }; },
      async maybeSingle() { return { data: null }; },
    };
    const c = {
      JSON, console: { warn() {}, error() {}, log() {} }, Date, parseInt, String, Object, Math,
      localStorage: lsStore(), STORAGE_KEY: 'SBD_HUB_V29',
      cloudSyncEnabled, _bootSyncDone: bootDone,
      supaClient: { auth: { async getUser() { return { data: { user: { id: 'A', email: 'a@a' } } }; } }, from() { return chain; } },
      db,
      _computeDataHash: () => 'H', _buildSyncedBlob: () => ({ blob: true }),
      updateSyncStatus() {}, showToast() {}, syncLeaderboard() {},
      async syncLogsToSupabase() {},
      async syncFromCloud() { calls.syncFromCloud = true; },
    };
    vm.createContext(c);
    vm.runInContext(extractFn(APP, '_isDefaultDB'), c);
    vm.runInContext(extractFn(APP, '_canPushForOwner'), c);
    vm.runInContext(extractFn(SUPA, 'syncToCloud'), c);
    return { c, calls };
  }

  test('(a) BUG DU JOUR : local defaultDB + cloud → push REFUSÉ (aucun upsert), pull de réalignement', async () => {
    const { c, calls } = syncCtx({ db: DEFAULT_DB() });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(false);       // le defaultDB N'écrase PAS le cloud
    expect(calls.syncFromCloud).toBe(true);   // on pull pour réaligner (adopte le vrai profil)
  });
  test('(b) cloud pas encore hydraté (_bootSyncDone=false) → push DIFFÉRÉ (pendingSync), rien poussé/pullé', async () => {
    const { c, calls } = syncCtx({ db: FILLED(), bootDone: false });
    await vm.runInContext('syncToCloud(true)', c);
    expect(c.db.pendingSync).toBe(true);
    expect(calls.upserted).toBe(false);
    expect(calls.syncFromCloud).toBe(false);
  });
  test('(d) FAUX POSITIF CORRIGÉ : vrai profil avec une séance EN MOINS (suppression volontaire) → push AUTORISÉ, PAS de pull qui annulerait', async () => {
    const { c, calls } = syncCtx({ db: FILLED_REDUCED() });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(true);        // la suppression est poussée…
    expect(calls.syncFromCloud).toBe(false);  // …et AUCUN pull ne la ressuscite
  });
  test('(e) vrai profil + séance loggée hors-ligne (plus riche) → push autorisé', async () => {
    const { c, calls } = syncCtx({ db: FILLED() });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(true);
    expect(calls.syncFromCloud).toBe(false);
  });
  test('(f) suppression de compte (cloudSyncEnabled=false) → syncToCloud no-op : ni push, ni pull, ni blocage du vidage', async () => {
    const { c, calls } = syncCtx({ db: DEFAULT_DB(), cloudSyncEnabled: false });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(false);
    expect(calls.syncFromCloud).toBe(false);
    expect(c.db.pendingSync).toBeUndefined(); // return tout en haut — la garde defaultDB n'est pas atteinte
  });
});

// ── GARDE 0 : verrou pull-avant-push dans debouncedCloudSync (inchangée) ───────────────────────
describe('RC4 — GARDE 0 : verrou pull-avant-push dans debouncedCloudSync (vraie source)', () => {
  function bootCtx(bootDone) {
    const c = {
      cloudSyncEnabled: true, _bootSyncDone: bootDone, db: {}, syncDebounceTimer: null,
      navigator: { onLine: true }, _flushCalled: false, _scheduled: false,
      _flushDB() { c._flushCalled = true; },
      syncToCloud() {}, clearTimeout() {}, setTimeout() { c._scheduled = true; return 1; },
    };
    vm.createContext(c);
    vm.runInContext(extractFn(APP, 'debouncedCloudSync'), c);
    return c;
  }
  test('verrou FERMÉ (boot pas fini) → push différé (pendingSync), rien de programmé', () => {
    const c = bootCtx(false);
    vm.runInContext('debouncedCloudSync()', c);
    expect(c.db.pendingSync).toBe(true);
    expect(c._flushCalled).toBe(true);
    expect(c._scheduled).toBe(false);
  });
  test('verrou OUVERT (boot fini) → push programmé', () => {
    const c = bootCtx(true);
    vm.runInContext('debouncedCloudSync()', c);
    expect(c._scheduled).toBe(true);
  });
});

// ── GARDE 2 : resolveIdentity (login) ─────────────────────────────────────────────────────────
describe('RC4 — GARDE 2 : resolveIdentity (vraie source)', () => {
  function resolveCtx(db, cloudRow) {
    let fetched = false;
    const c = { JSON, console: { warn() {}, log() {} }, localStorage: lsStore(), refreshUI() {}, Date, _cachedUid: 'x' };
    vm.createContext(c);
    vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", c);
    vm.runInContext('function _invalidateCachedUid(){ _cachedUid = null; }', c);
    ['_identityVerdict', '_stampOwner'].forEach((n) => vm.runInContext(extractFn(APP, n), c));
    vm.runInContext('function _clearDeviceSyncMarkers(){}', c);
    vm.runInContext('function _clearLegacyDbKeys(){}', c);
    vm.runInContext('function _resetLocalToOwner(){}', c);
    vm.runInContext(extractFn(SUPA, '_applyCloudBlob'), c);
    vm.runInContext(extractFn(SUPA, '_adoptCloudForUid'), c);
    vm.runInContext(extractFn(SUPA, 'resolveIdentity'), c);
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => { fetched = true; return { data: cloudRow }; } };
    c.supaClient = { from: () => chain };
    c.db = db;
    return { c, getFetched: () => fetched };
  }
  const RICH_ROW = { data: { user: { name: 'Aurel', onboarded: true }, bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { a: {}, b: {} } }, updated_at: '2026-07-20T00:00:00Z' };

  test('(c) login, LOCAL defaultDB + cloud riche → adopte le cloud (affichage riche)', async () => {
    const { c } = resolveCtx(DEFAULT_DB(), RICH_ROW);   // ownerUid null → verdict 'reset' → adoption cloud
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('adopted');
    expect(c.db.bestPR).toEqual({ squat: 145, bench: 140, deadlift: 170 });
    expect(c.db.user.ownerUid).toBe('A');
  });
  test('keep même owner (vrai profil) → "kept", AUCUN fetch, local conservé (le PR hors-ligne survit)', async () => {
    const { c, getFetched } = resolveCtx(FILLED(), RICH_ROW);   // ownerUid 'A' == incoming → keep
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('kept');
    expect(getFetched()).toBe(false);
    expect(c.db.bestPR.squat).toBe(145);
    expect(c.db.logs).toHaveLength(2);
  });
});
