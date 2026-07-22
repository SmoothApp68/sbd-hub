// Chantier 7 (bloc 1, commit 1e — décisions D-D et D-E validées par Aurélien).
// D-D : à la création de compte (signup) et au 1er login sans ligne cloud ('no-row'),
// un blob local REMPLI et NON tatoué (onboarding complété en local, TOFU) est ADOPTÉ
// (tatoué + poussé), plus jamais purgé. Critère d'INTENTION UNIQUE : _isDefaultDB.
// Anti-fuite/anti-résurrection INCHANGÉES : blob vide → purge ; blob tatoué à un
// AUTRE uid → purge, jamais de fusion ni de push (les 7 tours RC4 ne régressent pas —
// les suites rgpd-* tournent dans le même run jest).
// D-E : seuls les uid EMAIL résolvent l'identité (_shouldResolveIdentityFor) — un uid
// anonyme ne tatoue jamais le blob local.
// Fonctions extraites de la VRAIE source (vm), comme rgpd-identity-guard.test.js.
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

function buildClaim(ls, initialDb, opts) {
  opts = opts || {};
  const ctx = { JSON, localStorage: ls, console: { warn() {}, log() {} } };
  vm.createContext(ctx);
  vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", ctx);
  vm.runInContext(extractConstArr(ENGINE, 'SBD_HUB_ALL_KEYS'), ctx);
  vm.runInContext(extractArrowConst(APP, 'defaultDB'), ctx);
  vm.runInContext(extractFn(APP, 'purgeAllLocalDb'), ctx);
  vm.runInContext(extractFn(APP, '_stampOwner'), ctx);
  vm.runInContext(extractFn(APP, '_clearDeviceSyncMarkers'), ctx);
  vm.runInContext('function _invalidateCachedUid() {}', ctx); // vit dans supabase.js — stub
  vm.runInContext(extractFn(APP, '_purgeLocalSession'), ctx);
  vm.runInContext(extractFn(APP, '_resetLocalToOwner'), ctx);
  vm.runInContext(extractFn(APP, '_isDefaultDB'), ctx);
  // fix revue : le flag de session pilote _localBlobClaimable (adoption resserrée)
  vm.runInContext('var _obSeqFreshTunnelSession = ' + (opts.freshTunnel !== false) + ';', ctx);
  vm.runInContext(extractFn(APP, '_localBlobClaimable'), ctx);
  vm.runInContext(extractFn(APP, '_claimLocalOnSignup'), ctx);
  vm.runInContext(extractFn(APP, '_shouldResolveIdentityFor'), ctx);
  ctx.saveDBNow = () => { ls.setItem('SBD_HUB_V29', JSON.stringify(ctx.db)); };
  ctx.db = initialDb;
  return ctx;
}

const filledLocalOnboarding = () => ({
  user: { name: 'Léa', onboarded: true, onboardingVersion: 4, ownerUid: null, bw: 65 },
  bestPR: { squat: 0, bench: 0, deadlift: 0 },
  logs: [],
});

describe('D-D resserrée — _claimLocalOnSignup (signup : adopter ou purger)', () => {
  test('blob rempli, tunnel de CETTE session → ADOPTÉ : tatoué, données conservées', () => {
    const ls = makeLS();
    ls.setItem('SBD_HUB_V29', JSON.stringify(filledLocalOnboarding()));
    const ctx = buildClaim(ls, filledLocalOnboarding(), { freshTunnel: true });
    const res = vm.runInContext("_claimLocalOnSignup('NEW-UID')", ctx);
    expect(res).toBe('adopted');
    expect(ctx.db.user.ownerUid).toBe('NEW-UID');
    expect(ctx.db.user.name).toBe('Léa');          // rien n'est purgé
    expect(ctx.db.user.onboarded).toBe(true);       // l'onboarding local survit au signup
    expect(ls.getItem('SBD_HUB_V29')).toContain('NEW-UID'); // persisté
  });

  test('ANTI-FUITE : blob rempli d\'un utilisateur ÉTABLI hors-ligne (aucun tunnel cette session) → PURGE', () => {
    // Le scénario device de la revue : appareil d'un utilisateur existant offline (onboarded,
    // ownerUid null) ; une AUTRE personne fait un signup → le blob santé ne doit PAS fuir.
    const ls = makeLS();
    ls.setItem('SBD_HUB_V29', JSON.stringify(filledLocalOnboarding()));
    const ctx = buildClaim(ls, filledLocalOnboarding(), { freshTunnel: false });
    const res = vm.runInContext("_claimLocalOnSignup('NEW-UID')", ctx);
    expect(res).toBe('reset');
    expect(ctx.db.user.name || '').not.toBe('Léa'); // les données de l'établi ne fuient pas
    expect(ctx.db.user.ownerUid).toBe('NEW-UID');
    expect(ctx.db.user.onboarded).toBe(false);       // defaultDB tatoué
  });

  test('blob defaultDB (vide), tunnel cette session → purge d\'origine : defaultDB tatoué', () => {
    const ls = makeLS();
    const ctx = buildClaim(ls, { user: { onboarded: false, ownerUid: null }, bestPR: { squat: 0, bench: 0, deadlift: 0 }, logs: [] }, { freshTunnel: true });
    const res = vm.runInContext("_claimLocalOnSignup('NEW-UID')", ctx);
    expect(res).toBe('reset');
    expect(ctx.db.user.ownerUid).toBe('NEW-UID');
    expect(ctx.db.user.onboarded).toBe(false);      // repart vierge → onboarding déclenché
  });

  test('blob tatoué à un AUTRE uid → purge (anti-fuite inchangée), même rempli + tunnel', () => {
    const ls = makeLS();
    const other = filledLocalOnboarding();
    other.user.ownerUid = 'PREVIOUS-USER';
    ls.setItem('SBD_HUB_V29', JSON.stringify(other));
    const ctx = buildClaim(ls, other, { freshTunnel: true });
    const res = vm.runInContext("_claimLocalOnSignup('NEW-UID')", ctx);
    expect(res).toBe('reset');
    expect(ctx.db.user.name || '').not.toBe('Léa'); // les données d'autrui ne fuient pas
    expect(ctx.db.user.ownerUid).toBe('NEW-UID');
  });

  test('blob non onboardé mais VRAI PR (séances offline), tunnel cette session → adopté', () => {
    const ls = makeLS();
    const d = { user: { onboarded: false, ownerUid: null }, bestPR: { squat: 100, bench: 0, deadlift: 0 }, logs: [{ id: 'w1' }] };
    const ctx = buildClaim(ls, d, { freshTunnel: true });
    const res = vm.runInContext("_claimLocalOnSignup('NEW-UID')", ctx);
    expect(res).toBe('adopted');
    expect(ctx.db.logs.length).toBe(1);
  });

  test('uid absent → ignored (aucun effet)', () => {
    const ctx = buildClaim(makeLS(), filledLocalOnboarding(), { freshTunnel: true });
    const res = vm.runInContext('_claimLocalOnSignup(null)', ctx);
    expect(res).toBe('ignored');
    expect(ctx.db.user.ownerUid).toBe(null);
  });
});

describe('D-E — _shouldResolveIdentityFor (une seule règle boot + handler)', () => {
  const build = () => buildClaim(makeLS(), filledLocalOnboarding());
  test('identité email → true', () => {
    expect(vm.runInContext("_shouldResolveIdentityFor({ id: 'U1', email: 'a@b.c' })", build())).toBe(true);
  });
  test('uid anonyme (email null) → false — ne tatoue jamais le blob local', () => {
    expect(vm.runInContext("_shouldResolveIdentityFor({ id: 'anon-1', email: null })", build())).toBe(false);
  });
  test('user null ou sans id → false', () => {
    const ctx = build();
    expect(vm.runInContext('_shouldResolveIdentityFor(null)', ctx)).toBe(false);
    expect(vm.runInContext("_shouldResolveIdentityFor({ email: 'a@b.c' })", ctx)).toBe(false);
  });
});

// ── resolveIdentity 'no-row' — adoption du local (harnais type rgpd-identity-guard) ──
function buildResolve(ls, initialDb, supaResponse, opts) {
  opts = opts || {};
  const calls = { pushBlob: 0, pushLogs: 0, hydrated: 0, reconciled: 0 };
  const ctx = { JSON, Date, localStorage: ls, console: { warn() {}, log() {} } };
  vm.createContext(ctx);
  vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", ctx);
  vm.runInContext(extractConstArr(ENGINE, 'SBD_HUB_ALL_KEYS'), ctx);
  vm.runInContext(extractArrowConst(APP, 'defaultDB'), ctx);
  vm.runInContext(extractFn(APP, 'purgeAllLocalDb'), ctx);
  vm.runInContext(extractFn(APP, '_identityVerdict'), ctx);
  vm.runInContext(extractFn(APP, '_canPushForOwner'), ctx);
  vm.runInContext(extractFn(APP, '_stampOwner'), ctx);
  vm.runInContext(extractFn(APP, '_clearDeviceSyncMarkers'), ctx);
  vm.runInContext(extractFn(APP, '_clearLegacyDbKeys'), ctx);
  vm.runInContext(extractFn(APP, '_purgeLocalSession'), ctx);
  vm.runInContext(extractFn(APP, '_resetLocalToOwner'), ctx);
  vm.runInContext(extractFn(APP, '_isDefaultDB'), ctx);
  vm.runInContext('var _obSeqFreshTunnelSession = ' + (opts.freshTunnel !== false) + ';', ctx);
  vm.runInContext(extractFn(APP, '_localBlobClaimable'), ctx);
  vm.runInContext('var _cachedUid = "STALE";', ctx);
  vm.runInContext('function _invalidateCachedUid() { _cachedUid = null; }', ctx);
  const chain = {
    select: () => chain, eq: () => chain,
    maybeSingle: async () => { if (supaResponse && supaResponse._throw) throw new Error('network'); return supaResponse; },
  };
  ctx.supaClient = { from: () => chain };
  ctx.refreshUI = () => {};
  ctx.saveDBNow = () => { ls.setItem('SBD_HUB_V29', JSON.stringify(ctx.db)); };
  ctx.syncToCloud = async () => { calls.pushBlob++; };
  ctx.syncLogsToSupabase = async () => { calls.pushLogs++; };
  ctx._markCloudHydrated = () => { calls.hydrated++; };
  ctx._markCloudHydrationFailed = () => {};
  ctx._reconcileAdoptedSessions = async () => { calls.reconciled++; };
  vm.runInContext(extractFn(SUPA, '_applyCloudBlob'), ctx);
  vm.runInContext(extractFn(SUPA, '_adoptCloudForUid'), ctx);
  vm.runInContext(extractFn(SUPA, 'resolveIdentity'), ctx);
  ctx.db = initialDb;
  return { ctx, calls };
}

describe('D-D resserrée — resolveIdentity, branche no-row (confirmation email / 1er login, compte neuf)', () => {
  test('blob TOFU rempli (tunnel cette session + séance offline) → adopted-local : tatoué, poussé, rien de perdu', async () => {
    const ls = makeLS();
    const d = filledLocalOnboarding();
    d.logs = [{ id: 'w-offline-1' }];
    const { ctx, calls } = buildResolve(ls, d, { data: null }, { freshTunnel: true }); // aucune ligne cloud
    const res = await vm.runInContext("resolveIdentity('NEW-UID')", ctx);
    expect(res).toBe('adopted-local');
    expect(ctx.db.user.ownerUid).toBe('NEW-UID');
    expect(ctx.db.user.name).toBe('Léa');            // le profil d'onboarding local SURVIT
    expect(ctx.db.logs.length).toBe(1);               // la séance offline aussi (trou préexistant refermé)
    expect(calls.hydrated).toBe(1);                   // verrou ouvert (no-row confirmé en ligne)
    expect(calls.pushBlob).toBe(1);                   // profil poussé vers sbd_profiles
    expect(calls.pushLogs).toBe(1);                   // séances poussées vers workout_sessions
  });

  test('ANTI-FUITE : blob rempli d\'un établi (aucun tunnel cette session) → reset-new, AUCUN push', async () => {
    // Login d'un compte B sans ligne cloud sur un appareil portant le blob de A (établi offline).
    const ls = makeLS();
    const d = filledLocalOnboarding();
    d.logs = [{ id: 'w-A-1' }];
    const { ctx, calls } = buildResolve(ls, d, { data: null }, { freshTunnel: false });
    const res = await vm.runInContext("resolveIdentity('NEW-UID')", ctx);
    expect(res).toBe('reset-new');
    expect(ctx.db.user.name || '').not.toBe('Léa');   // les données de A ne fuient pas vers B
    expect(calls.pushBlob).toBe(0);
    expect(calls.pushLogs).toBe(0);
  });

  test('blob defaultDB → reset-new (comportement RC4 d\'origine conservé)', async () => {
    const { ctx, calls } = buildResolve(makeLS(), { user: { onboarded: false, ownerUid: null }, bestPR: { squat: 0, bench: 0, deadlift: 0 }, logs: [] }, { data: null }, { freshTunnel: true });
    const res = await vm.runInContext("resolveIdentity('NEW-UID')", ctx);
    expect(res).toBe('reset-new');
    expect(ctx.db.user.ownerUid).toBe('NEW-UID');
    expect(calls.pushBlob).toBe(0);                   // rien à pousser
  });

  test('blob tatoué à un AUTRE uid → reset-new, AUCUN push ni fusion (anti-fuite inchangée)', async () => {
    const other = filledLocalOnboarding();
    other.user.ownerUid = 'PREVIOUS-USER';
    const { ctx, calls } = buildResolve(makeLS(), other, { data: null });
    const res = await vm.runInContext("resolveIdentity('NEW-UID')", ctx);
    expect(res).toBe('reset-new');
    expect(ctx.db.user.name || '').not.toBe('Léa');
    expect(calls.pushBlob).toBe(0);
    expect(calls.pushLogs).toBe(0);
    expect(calls.reconciled).toBe(0);
  });

  test('non-régression : ligne cloud existante → adoption cloud OVERWRITE + union (adopted)', async () => {
    const cloudBlob = { user: { name: 'CloudUser', onboarded: true, onboardingVersion: 4, ownerUid: 'NEW-UID' }, bestPR: { squat: 145, bench: 140, deadlift: 170 } };
    const { ctx, calls } = buildResolve(makeLS(), filledLocalOnboarding(), { data: { data: cloudBlob, updated_at: '2026-07-21T10:00:00Z' } }, { freshTunnel: true });
    const res = await vm.runInContext("resolveIdentity('NEW-UID')", ctx);
    expect(res).toBe('adopted');
    expect(ctx.db.user.name).toBe('CloudUser');       // le cloud fait foi quand il existe
    expect(calls.reconciled).toBe(1);                 // union des séances pré-adoption lancée
  });

  test('non-régression : réseau KO → deferred, rien touché', async () => {
    const d = filledLocalOnboarding();
    const { ctx } = buildResolve(makeLS(), d, { _throw: true }, { freshTunnel: true });
    const res = await vm.runInContext("resolveIdentity('NEW-UID')", ctx);
    expect(res).toBe('deferred');
    expect(ctx.db.user.ownerUid).toBe(null);          // non tatoué → non poussable (défense terminale)
    expect(ctx.db.user.name).toBe('Léa');
  });
});
