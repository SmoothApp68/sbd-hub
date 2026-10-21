// Chantier 7 (bloc 1) — fixes issus de la revue adverse. Vérifient des CHEMINS SOURCE
// (regex sur la vraie source, comme les autres tests coach/rgpd du dépôt) là où l'exécution
// vm complète serait trop couplée (handlers DOM/réseau), et l'exécution là où c'est possible.
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

describe('P2-C — signup d\'un email déjà enregistré (user obfusqué GoTrue) ne tatoue rien', () => {
  test('authSubmit : garde identities.length===0 → showMagicLinkMigrationPrompt AVANT _claimLocalOnSignup', () => {
    const fn = extractFn(SUPA, 'authSubmit');
    // La garde obfusqué doit précéder l'appel d'adoption
    const guardIdx = fn.indexOf('identities.length === 0');
    const claimIdx = fn.indexOf('_claimLocalOnSignup');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(claimIdx);
    // et elle propose la connexion (pas « Compte créé »)
    expect(fn).toMatch(/identities\.length === 0[\s\S]{0,120}showMagicLinkMigrationPrompt/);
  });

  test('loginSubmit : même garde obfusqué avant l\'adoption', () => {
    const fn = extractFn(SUPA, 'loginSubmit');
    const guardIdx = fn.indexOf('identities.length === 0');
    const claimIdx = fn.indexOf('_claimLocalOnSignup');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(claimIdx);
  });
});

describe('P2-A — syncFromCloud marque l\'échec sur getUser null (retry ré-armé)', () => {
  test('exécution : session morte pendant l\'hydratation → _markCloudHydrationFailed appelé', async () => {
    var failed = 0;
    const ctx = {
      JSON, console: { warn() {}, error() {}, log() {} },
      cloudSyncEnabled: true,
      supaClient: { auth: { getUser: async () => ({ data: { user: null } }) } },
      _markCloudHydrationFailed: () => { failed++; },
      _markCloudHydrated: () => {},
    };
    vm.createContext(ctx);
    vm.runInContext(extractFn(SUPA, 'syncFromCloud'), ctx);
    const res = await ctx.syncFromCloud();
    expect(res).toBe(false);
    expect(failed).toBe(1); // le verrou passe 'failed' → retry ré-armé (plus de deadlock silencieux)
  });

  test('exécution : offline (cloudSyncEnabled false) → pas de faux échec marqué', async () => {
    var failed = 0;
    const ctx = {
      JSON, console: { warn() {}, error() {}, log() {} },
      cloudSyncEnabled: false,
      supaClient: { auth: { getUser: async () => ({ data: { user: null } }) } },
      _markCloudHydrationFailed: () => { failed++; },
      _markCloudHydrated: () => {},
    };
    vm.createContext(ctx);
    vm.runInContext(extractFn(SUPA, 'syncFromCloud'), ctx);
    await ctx.syncFromCloud();
    expect(failed).toBe(0);
  });
});

describe('P3-B — SIGNED_OUT pendant une attente D-B lève le verrou (pas de deadlock)', () => {
  test('le handler onAuthStateChange clear _obSeqWaitingHydration sur SIGNED_OUT', () => {
    // Zone source : la branche SIGNED_OUT du listener. On vérifie le câblage (regex source),
    // l'extraction du listener complet étant trop couplée (closure d'init).
    const m = SUPA.match(/if \(event === 'SIGNED_OUT'[\s\S]{0,700}?_obSeqWaitingHydration = false;/);
    expect(m).not.toBeNull();
  });
});

describe('P2-D — appSignOut pose le marqueur de re-login', () => {
  test('appSignOut écrit _obSeqPostLogout avant le reload', () => {
    const fn = extractFn(APP, 'appSignOut');
    expect(fn).toMatch(/_obSeqPostLogout/);
    const markIdx = fn.indexOf('_obSeqPostLogout');
    const reloadIdx = fn.indexOf('location.reload');
    expect(markIdx).toBeLessThan(reloadIdx); // marqueur posé AVANT le reload
  });
});
