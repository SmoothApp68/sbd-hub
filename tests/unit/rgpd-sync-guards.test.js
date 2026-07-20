// RC4 GARDES DE SYNC (P0 perte de données). Un blob defaultDB (bestPR 0/0/0) a écrasé le
// cloud d'un vrai user (145/140/170) via syncToCloud (push à l'aveugle). Trois gardes en
// défense-en-profondeur :
//   • GARDE 0 : verrou pull-avant-push (debouncedCloudSync / _bootSyncDone).
//   • GARDE 1 : concurrence optimiste sur updated_at (syncToCloud) — ne pousse pas si le cloud
//     a divergé de notre dernier push ; réconcilie (pull+merge) à la place.
//   • GARDE 2 : le merge RICHESSE-conscient de syncFromCloud (garde 2b) + le flux de boot ;
//     isBlobRicher est la définition UNIQUE de richesse (sans logs : le blob n'en porte pas).
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

// ── Comparateur de richesse (utilisé par le merge garde 2b de syncFromCloud) ─────────────────
function ctx() {
  const c = {};
  vm.createContext(c);
  vm.runInContext(extractFn(APP, '_blobRichnessVec'), c);
  vm.runInContext(extractFn(APP, 'isBlobRicher'), c);
  return c;
}
const richer = (a, b) => { const c = ctx(); c._a = a; c._b = b; return vm.runInContext('isBlobRicher(_a, _b)', c); };

const POOR = { bestPR: { squat: 0, bench: 0, deadlift: 0 }, exercises: {} };                       // defaultDB-like
const RICH = { bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { 'Squat (Barre)': {}, 'Développé Couché (Barre)': {} } };

describe('RC4 — isBlobRicher : richesse d\'un blob (sans logs), pilote le merge garde 2b', () => {
  test('un cloud riche (145/140/170) EST plus riche qu\'un defaultDB pauvre → le merge garde le cloud', () => {
    expect(richer(RICH, POOR)).toBe(true);
  });
  test('l\'inverse est faux : un local pauvre n\'est PAS plus riche que le cloud', () => {
    expect(richer(POOR, RICH)).toBe(false);
  });
  test('richesses égales → pas "plus riche"', () => {
    expect(richer(RICH, RICH)).toBe(false);
  });
  test('cloud absent (null) → jamais "plus riche" que le local (1er profil)', () => {
    expect(richer(null, POOR)).toBe(false);
    expect(richer(null, RICH)).toBe(false);
  });
  test('bestPR DOMINE lexicographiquement le registre d\'exercices', () => {
    const A = { bestPR: { squat: 100, bench: 0, deadlift: 0 }, exercises: {} };
    const B = { bestPR: { squat: 0, bench: 0, deadlift: 0 }, exercises: Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['e' + i, {}])) };
    expect(richer(A, B)).toBe(true);
    expect(richer(B, A)).toBe(false);
  });
  test('à PR égaux, plus d\'exercices = plus riche', () => {
    const few = { bestPR: { squat: 100 }, exercises: { a: {} } };
    const many = { bestPR: { squat: 100 }, exercises: { a: {}, b: {}, c: {} } };
    expect(richer(many, few)).toBe(true);
    expect(richer(few, many)).toBe(false);
  });
  test('à PR + exercices égaux, plus de check-ins santé = plus riche', () => {
    const base = { bestPR: { squat: 100 }, exercises: { a: {} } };
    const withRh = { bestPR: { squat: 100 }, exercises: { a: {} }, readinessHistory: [{}, {}] };
    expect(richer(withRh, base)).toBe(true);
  });
  test('à tout égal par ailleurs, XP high-water-mark plus élevé = plus riche (ne descend jamais)', () => {
    const lo = { bestPR: { squat: 100 }, exercises: { a: {} }, gamification: { xpHighWaterMark: 100 } };
    const hi = { bestPR: { squat: 100 }, exercises: { a: {} }, gamification: { xpHighWaterMark: 5000 } };
    expect(richer(hi, lo)).toBe(true);
  });
});

// ── GARDE 1 : concurrence optimiste sur updated_at (syncToCloud, VRAIE source) ────────────────
// Le pilier anti-écrasement du P0. Avant de pousser, on lit l'updated_at du cloud : s'il est
// POSTÉRIEUR à notre dernier push (_lastCloudPush), le cloud a divergé → on RÉCONCILIE au lieu de
// pousser. Contrairement à un gate local-seul, l'horodatage n'a pas d'angle mort d'appauvrissement
// PARTIEL (un local à 1 PR + 3 exos vs un cloud à 3 PR + 20 exos : cross-device ⇒ updated_at a
// avancé ⇒ garde déclenchée ; reset local ⇒ _lastCloudPush=0 ⇒ garde déclenchée).
describe('RC4 — GARDE 1 : syncToCloud ne peut pas écraser un cloud divergé (vraie source)', () => {
  function syncCtx({ cloudTs, lastPush, readError }) {
    const store = { _s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
    if (lastPush != null) store.setItem('_lastCloudPush', String(lastPush));
    const calls = { upserted: false, syncFromCloud: false, payload: null };
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      async maybeSingle() {
        if (readError) return { error: { message: 'boom' } };            // panne réseau sur la lecture
        return { data: cloudTs ? { updated_at: new Date(cloudTs).toISOString() } : null };
      },
      upsert(p) { calls.upserted = true; calls.payload = p; return chain; }, // ← le push qu'on veut bloquer
      async single() { return { data: { updated_at: new Date(cloudTs || 9999).toISOString() } }; },
    };
    const c = {
      JSON, console: { warn() {}, error() {}, log() {} }, Date, parseInt, String, Object, Math,
      localStorage: store, STORAGE_KEY: 'SBD_HUB_V29', cloudSyncEnabled: true,
      supaClient: {
        auth: { async getUser() { return { data: { user: { id: 'A', email: 'a@a' } } }; } },
        from() { return chain; },
      },
      // local PAUVRE mais tatoué au bon owner (post-reset re-stamp / device appauvri) : même
      // ainsi il ne doit PAS écraser un cloud divergé.
      db: { user: { ownerUid: 'A' }, bestPR: { squat: 0, bench: 0, deadlift: 0 }, exercises: {}, gamification: {} },
      _computeDataHash: () => 'H',            // ≠ db._lastSyncHash (undefined) → passe le hash-check
      _buildSyncedBlob: () => ({ blob: true }),
      updateSyncStatus() {}, showToast() {}, syncLeaderboard() {},
      async syncLogsToSupabase() {},
      async syncFromCloud() { calls.syncFromCloud = true; },
    };
    vm.createContext(c);
    vm.runInContext(extractFn(APP, '_canPushForOwner'), c);   // vraie garde de propriété
    vm.runInContext(extractFn(SUPA, 'syncToCloud'), c);
    return { c, calls };
  }

  test('(a) P0 NON-RÉGRESSION : local pauvre (0/0/0) NE peut PAS écraser un cloud qui a divergé (updated_at récent) → réconciliation, AUCUN upsert', async () => {
    const { c, calls } = syncCtx({ cloudTs: 5000, lastPush: 1000 });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.syncFromCloud).toBe(true);   // pull+merge (garde 2b) au lieu d'écraser
    expect(calls.upserted).toBe(false);       // le blob pauvre N'est PAS poussé
  });
  test('cloud en phase (updated_at ≤ notre dernier push) → push autorisé (upsert), pas de réconciliation', async () => {
    const { c, calls } = syncCtx({ cloudTs: 5000, lastPush: 5000 });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(true);
    expect(calls.syncFromCloud).toBe(false);
  });
  test('1er profil (aucune ligne cloud) → push autorisé (pas de blocage du premier upload)', async () => {
    const { c, calls } = syncCtx({ cloudTs: 0, lastPush: 0 });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(true);
    expect(calls.syncFromCloud).toBe(false);
  });
  test('lecture updated_at en échec → FAIL-CLOSED : aucun upsert, aucune réconciliation (retry au prochain debounce ; db déjà en localStorage)', async () => {
    const { c, calls } = syncCtx({ cloudTs: 5000, lastPush: 1000, readError: true });
    await vm.runInContext('syncToCloud(true)', c);
    expect(calls.upserted).toBe(false);
    expect(calls.syncFromCloud).toBe(false);
  });
});

// ── GARDE 0 : verrou pull-avant-push dans debouncedCloudSync (vraie source) ────────────────────
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
  test('(b) verrou FERMÉ (boot pas fini) → push différé (pendingSync), rien de programmé', () => {
    const c = bootCtx(false);
    vm.runInContext('debouncedCloudSync()', c);
    expect(c.db.pendingSync).toBe(true);
    expect(c._flushCalled).toBe(true);   // sauvé localement
    expect(c._scheduled).toBe(false);    // AUCUN push programmé
  });
  test('(b) verrou OUVERT (boot fini) → push programmé', () => {
    const c = bootCtx(true);
    vm.runInContext('debouncedCloudSync()', c);
    expect(c._scheduled).toBe(true);     // syncToCloud programmé
  });
});

// ── GARDE 2 : resolveIdentity keep = garder le local (le pull cloud est ailleurs) ─────────────
// Décision d'archi (revue adversariale) : au keep (même owner) on NE fetch NI n'adopte le cloud.
// Adopter via _applyCloudBlob écraserait des logs locaux non poussés (le blob cloud n'en porte
// pas). La priorité au pull au login est assurée par le flux de boot (resolveIdentity →
// syncFromCloud si local vide/périmé) + le merge richesse-conscient (garde 2b) ; l'anti-écrasement
// du push est assuré par la garde 1. → keep doit être un no-op sûr : 'kept', aucun fetch.
describe('RC4 — GARDE 2 : resolveIdentity keep ne fetch ni n\'adopte (vraie source)', () => {
  function keepCtx(localDb) {
    let fetched = false;
    const c = { JSON, console: { warn() {}, log() {} }, _cachedUid: 'x' };
    vm.createContext(c);
    ['_identityVerdict', '_stampOwner'].forEach((n) => vm.runInContext(extractFn(APP, n), c));
    vm.runInContext('async function _adoptCloudForUid() { return "error"; }', c); // non atteint sur keep
    vm.runInContext(extractFn(SUPA, 'resolveIdentity'), c);
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => { fetched = true; return { data: null }; } };
    c.supaClient = { from: () => chain };
    c.db = localDb;
    return { c, getFetched: () => fetched };
  }

  test('(c) keep même owner, LOCAL riche (PR loggé hors-ligne) → "kept", AUCUN fetch, local conservé', async () => {
    const { c, getFetched } = keepCtx({ user: { ownerUid: 'A', name: 'Aurel' }, bestPR: { squat: 150, bench: 140, deadlift: 175 }, exercises: { a: {}, b: {} }, logs: [{ id: 1 }] });
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('kept');
    expect(getFetched()).toBe(false);        // pas de lecture cloud au keep (le PR hors-ligne survit intact)
    expect(c.db.bestPR.squat).toBe(150);     // local conservé
    expect(c.db.logs).toHaveLength(1);
    expect(c.db.user.ownerUid).toBe('A');    // tatoué
  });

  test('(d) keep même owner mais LOCAL pauvre → toujours "kept", AUCUN fetch (le pull cloud est géré par le boot / la garde 1, pas ici — évite d\'écraser des logs locaux)', async () => {
    const { c, getFetched } = keepCtx({ user: { ownerUid: 'A' }, bestPR: { squat: 0, bench: 0, deadlift: 0 }, exercises: {}, logs: [] });
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('kept');
    expect(getFetched()).toBe(false);
  });
});
