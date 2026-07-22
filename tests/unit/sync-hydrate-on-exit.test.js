// FIX A (P0 préexistant, prouvé device 22/07/2026) — les 2 sorties précoces de syncFromCloud
// (« local autoritaire » cloudTs <= lastPush, et « pas de timestamp serveur ») court-circuitaient
// la SEULE hydratation complète des séances (logs hors blob). Preuve structurelle : syncToCloud
// stocke dans _lastCloudPush le updated_at RETOURNÉ par le serveur → cloudTs === lastPush après
// CHAQUE push → un appareil frais restait à 0 séance pour toujours (553 séances invisibles,
// carte « Importe depuis Hevy »), chaque boot ré-entretenant le blocage.
// Le fix hydrate AVANT de sortir, gardé par _shouldHydrateLogs (local vide uniquement) —
// la priorité local/cloud des 7 tours RC4 est inchangée. Vraie source via vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}

const CLOUD_TS = '2026-07-22T19:23:03.361Z';
const CLOUD_MS = new Date(CLOUD_TS).getTime();

// Harnais : syncFromCloud réel + _shouldHydrateLogs réel + _isDefaultDB réel ;
// hydrateLogsFromCloud/syncToCloud espionnés ; supaClient stubbé.
function build(opts) {
  const calls = { hydrate: 0, push: 0, hydrated: 0, failed: 0 };
  const store = { _lastCloudPush: String(opts.lastPush) };
  const ctx = {
    JSON, Date, parseInt, console: { warn() {}, error() {}, log() {} },
    cloudSyncEnabled: true,
    db: opts.db,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    supaClient: {
      auth: { getUser: async () => ({ data: { user: { id: 'U1', email: 'a@b.c' } } }) },
      from: () => ({ select: function() { return this; }, eq: function() { return this; },
        maybeSingle: async () => ({ data: { data: opts.cloudBlob, updated_at: opts.cloudUpdatedAt }, error: null } ) }),
    },
    _markCloudHydrated: () => { calls.hydrated++; },
    _markCloudHydrationFailed: () => { calls.failed++; },
    syncToCloud: async () => { calls.push++; },
    hydrateLogsFromCloud: async (uid) => {
      calls.hydrate++;
      // simule l'hydratation réelle : remplit db.logs depuis workout_sessions
      ctx.db.logs = [{ id: 'w1' }, { id: 'w2' }];
      return true;
    },
    reconcileLogsFromCloud: async () => {},
    showToast: () => {},
    refreshUI: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", ctx);
  vm.runInContext(extractFn(SUPA, '_shouldHydrateLogs'), ctx);
  vm.runInContext(extractFn(APP, '_isDefaultDB'), ctx);
  vm.runInContext(extractFn(SUPA, 'syncFromCloud'), ctx);
  return { ctx, calls };
}

// Le blob d'un compte établi (ce que porte sbd_profiles — jamais de logs dans le blob)
const establishedDb = () => ({
  user: { onboarded: true, onboardingVersion: 4, ownerUid: 'U1' },
  bestPR: { squat: 145, bench: 140, deadlift: 170 },
  logs: [], // ← les séances vivent dans workout_sessions, pas dans le blob
});

describe('FIX A — sortie « local autoritaire » (cloudTs === lastPush, le cas structurel)', () => {
  test('local vide → hydrateLogsFromCloud AVANT de sortir : les 553 séances reviennent', async () => {
    const { ctx, calls } = build({
      db: establishedDb(),
      cloudBlob: { user: { onboarded: true } },
      cloudUpdatedAt: CLOUD_TS,
      lastPush: CLOUD_MS, // égalité stricte — reproduit la mesure device (1784748183361)
    });
    const res = await ctx.syncFromCloud();
    expect(res).toBe(true);
    expect(calls.hydrate).toBe(1);        // ← le fix : hydratation avant la sortie
    expect(ctx.db.logs.length).toBe(2);   // les séances sont là
    expect(calls.push).toBe(1);           // la priorité « local autoritaire » est conservée
  });

  test('non-régression : local PEUPLÉ → aucune hydratation (le local fait foi), push conservé', async () => {
    const d = establishedDb();
    d.logs = [{ id: 'local-1' }]; // séance locale existante
    const { ctx, calls } = build({ db: d, cloudBlob: { user: { onboarded: true } }, cloudUpdatedAt: CLOUD_TS, lastPush: CLOUD_MS });
    const res = await ctx.syncFromCloud();
    expect(res).toBe(true);
    expect(calls.hydrate).toBe(0);        // garde _shouldHydrateLogs : jamais écraser un local peuplé
    expect(ctx.db.logs[0].id).toBe('local-1');
    expect(calls.push).toBe(1);
  });

  test('auto-entretien cassé : deux boots successifs → hydraté au premier, plus rien à faire au second', async () => {
    const d = establishedDb();
    const { ctx, calls } = build({ db: d, cloudBlob: { user: { onboarded: true } }, cloudUpdatedAt: CLOUD_TS, lastPush: CLOUD_MS });
    await ctx.syncFromCloud();            // boot 1 : hydrate
    await ctx.syncFromCloud();            // boot 2 : local peuplé → garde
    expect(calls.hydrate).toBe(1);        // une seule hydratation, pas de boucle
  });
});

describe('FIX A — sortie « pas de timestamp serveur » (2e court-circuit)', () => {
  test('local vide + cloud sans updated_at → hydrate avant le push-fallback', async () => {
    const { ctx, calls } = build({
      db: establishedDb(),
      cloudBlob: { user: { onboarded: true } },
      cloudUpdatedAt: null, // pas de timestamp serveur
      lastPush: 0,
    });
    const res = await ctx.syncFromCloud();
    expect(res).toBe(true);
    expect(calls.hydrate).toBe(1);
    expect(calls.hydrated).toBe(1);       // verrou posé comme avant
  });
});

describe('FIX A — la logique RC4 v2 (defaultDB → merge) est intacte', () => {
  test('defaultDB + cloudTs === lastPush → PAS la sortie autoritaire : chemin merge (adoption cloud)', async () => {
    // Un defaultDB ne pousse jamais (critère d'INTENTION) : il tombe dans le merge, qui
    // adopte le cloud puis hydrate par son propre chemin (988-991) — comportement inchangé.
    const { ctx, calls } = build({
      db: { user: { onboarded: false, ownerUid: null }, bestPR: { squat: 0, bench: 0, deadlift: 0 }, logs: [] },
      cloudBlob: { user: { name: 'CloudUser', onboarded: true }, bestPR: { squat: 145, bench: 0, deadlift: 0 } },
      cloudUpdatedAt: CLOUD_TS,
      lastPush: CLOUD_MS,
    });
    // le chemin merge a besoin de plus de dépendances — on les stubbe au vol
    ctx._reconcileLogs = (a, b) => (a || []).concat(b || []);
    ctx._stampOwner = () => {};
    ctx._shouldHydrateLogsReal = ctx._shouldHydrateLogs;
    const res = await ctx.syncFromCloud();
    expect(res).toBe(true);
    expect(ctx.db.user.name).toBe('CloudUser'); // merge : le cloud a été adopté
    expect(calls.hydrate).toBe(1);              // hydraté par le chemin merge (comme avant)
  });
});
