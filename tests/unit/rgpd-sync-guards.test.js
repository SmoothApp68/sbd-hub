// RC4 GARDES DE SYNC (P0 perte de données). Un blob defaultDB (bestPR 0/0/0) a écrasé le
// cloud d'un vrai user (145/140/170) via syncToCloud (push à l'aveugle). isBlobRicher est la
// définition UNIQUE de richesse (pas de logs : le blob n'en contient pas) réutilisée par les
// 3 gardes. Fonctions extraites de la VRAIE source (app.js) via vm — pas de copie.
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

function ctx() {
  const c = {};
  vm.createContext(c);
  vm.runInContext(extractFn(APP, '_blobRichnessVec'), c);
  vm.runInContext(extractFn(APP, 'isBlobRicher'), c);
  vm.runInContext(extractFn(APP, '_localMightImpoverish'), c);
  return c;
}
const richer = (a, b) => { const c = ctx(); c._a = a; c._b = b; return vm.runInContext('isBlobRicher(_a, _b)', c); };
const mightImpoverish = (d) => { const c = ctx(); c._d = d; return vm.runInContext('_localMightImpoverish(_d)', c); };

const POOR = { bestPR: { squat: 0, bench: 0, deadlift: 0 }, exercises: {} };                       // defaultDB-like
const RICH = { bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { 'Squat (Barre)': {}, 'Développé Couché (Barre)': {} } };

describe('RC4 — isBlobRicher : richesse d\'un blob (sans logs)', () => {
  test('(a) NON-RÉGRESSION du P0 : cloud riche (145/140/170) EST plus riche qu\'un defaultDB pauvre', () => {
    expect(richer(RICH, POOR)).toBe(true);   // → syncToCloud garde 1 refuserait le push
  });
  test('l\'inverse est faux : un local pauvre n\'est PAS plus riche que le cloud', () => {
    expect(richer(POOR, RICH)).toBe(false);
  });
  test('richesses égales → pas "plus riche" (push autorisé, pas d\'écrasement)', () => {
    expect(richer(RICH, RICH)).toBe(false);
  });
  test('cloud absent (null) → jamais "plus riche" que le local (1er profil → push OK)', () => {
    expect(richer(null, POOR)).toBe(false);
    expect(richer(null, RICH)).toBe(false);
  });
  test('bestPR DOMINE lexicographiquement le registre d\'exercices', () => {
    // A a des PR mais 0 exercice ; B a 0 PR mais 50 exercices → A plus riche (PR prioritaire)
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

describe('RC4 — _localMightImpoverish : ne payer la lecture cloud (garde 1) que si nécessaire', () => {
  test('local pauvre (0 PR OU 0 exercice) → on vérifie le cloud avant de pousser', () => {
    expect(mightImpoverish(POOR)).toBe(true);
    expect(mightImpoverish({ bestPR: { squat: 100 }, exercises: {} })).toBe(true);      // a PR mais 0 exo
    expect(mightImpoverish({ bestPR: { squat: 0 }, exercises: { a: {} } })).toBe(true);  // a exo mais 0 PR
  });
  test('local riche (PR ET exercices) → push direct, aucune lecture cloud (coût nul nominal)', () => {
    expect(mightImpoverish(RICH)).toBe(false);
  });
});

describe('RC4 — GARDE 2 : pull prioritaire au login (resolveIdentity keep, vraie source)', () => {
  const ls = () => ({ _s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } });
  function keepCtx(localDb, cloudRow) {
    const store = ls();
    const c = { JSON, localStorage: store, console: { warn() {}, log() {} }, refreshUI() {}, _cachedUid: 'x' };
    vm.createContext(c);
    vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", c);
    ['_blobRichnessVec', 'isBlobRicher', '_localMightImpoverish', '_identityVerdict', '_stampOwner'].forEach((n) => vm.runInContext(extractFn(APP, n), c));
    vm.runInContext(extractFn(SUPA, '_applyCloudBlob'), c);
    vm.runInContext('async function _adoptCloudForUid() { return "error"; }', c); // non atteint sur keep
    vm.runInContext(extractFn(SUPA, 'resolveIdentity'), c);
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: cloudRow }) };
    c.supaClient = { from: () => chain };
    c.db = localDb;
    return c;
  }
  const CLOUD_RICH = { data: { user: { name: 'Aurel' }, bestPR: { squat: 145, bench: 140, deadlift: 170 }, exercises: { a: {}, b: {} } }, updated_at: '2026-07-20T00:00:00Z' };

  test('(c) login même user, LOCAL pauvre + cloud riche → adopte le cloud (affichage riche)', async () => {
    const c = keepCtx({ user: { ownerUid: 'A', name: 'Aurel' }, bestPR: { squat: 0, bench: 0, deadlift: 0 }, exercises: {}, logs: [] }, CLOUD_RICH);
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('adopted-richer');
    expect(c.db.bestPR).toEqual({ squat: 145, bench: 140, deadlift: 170 }); // cloud adopté
    expect(c.db.user.ownerUid).toBe('A');
  });

  test('(d) login même user, LOCAL riche (PR loggé hors-ligne) → conservé, aucun fetch cloud', async () => {
    let fetched = false;
    const store = ls();
    const c = { JSON, localStorage: store, console: { warn() {}, log() {} }, refreshUI() {}, _cachedUid: 'x' };
    vm.createContext(c);
    vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", c);
    ['_blobRichnessVec', 'isBlobRicher', '_localMightImpoverish', '_identityVerdict', '_stampOwner'].forEach((n) => vm.runInContext(extractFn(APP, n), c));
    vm.runInContext(extractFn(SUPA, '_applyCloudBlob'), c);
    vm.runInContext('async function _adoptCloudForUid() { return "error"; }', c);
    vm.runInContext(extractFn(SUPA, 'resolveIdentity'), c);
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => { fetched = true; return { data: CLOUD_RICH }; } };
    c.supaClient = { from: () => chain };
    c.db = { user: { ownerUid: 'A', name: 'Aurel' }, bestPR: { squat: 150, bench: 140, deadlift: 175 }, exercises: { a: {}, b: {}, c: {} }, logs: [{ id: 1 }] };
    const r = await vm.runInContext("resolveIdentity('A')", c);
    expect(r).toBe('kept');
    expect(fetched).toBe(false);              // local riche → pas de lecture cloud (coût nul)
    expect(c.db.bestPR.squat).toBe(150);      // local conservé (le PR hors-ligne survit)
    expect(c.db.logs).toHaveLength(1);
  });
});
