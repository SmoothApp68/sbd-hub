// Chantier 7 (bloc 1, commit 1d) — le social sort du tunnel d'entrée :
// postLoginSync n'arme plus le timer +800 vers showSocialOnboarding (il ne reste
// que le déclencheur naturel : premier accès à l'onglet Social). Vraie source (vm).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}

function buildPostLoginSync(initialDb) {
  const timers = [];
  const calls = { social: 0, consents: 0 };
  const ctx = {
    JSON, console: { warn() {}, log() {}, error() {} },
    db: initialDb,
    navigator: { onLine: true },
    setTimeout: (fn, ms) => { timers.push(ms); fn(); },
    syncFromCloud: async () => {},
    wpDetectPhase: () => {}, saveDB: () => {},
    renderProgrammeV2: () => {},
    syncToCloud: () => {},
    ensureProfile: async () => {},
    showSocialOnboarding: () => { calls.social++; },
    checkScheduledNotifications: () => {},
    checkRequiredConsents: () => { calls.consents++; },
    checkWorkoutBackup: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn(APP, 'postLoginSync'), ctx);
  return { ctx, timers, calls };
}

describe('postLoginSync — plus de social onboarding poussé après login', () => {
  test('flag social absent → showSocialOnboarding N\'est PAS appelé (même en exécutant tout timer)', async () => {
    const { ctx, calls } = buildPostLoginSync({ user: {}, social: { onboardingCompleted: false }, pendingSync: false });
    await ctx.postLoginSync();
    expect(calls.social).toBe(0);
  });

  test('le filet consentement santé reste appelé (comptes existants)', async () => {
    const { ctx, calls } = buildPostLoginSync({ user: {}, social: { onboardingCompleted: true }, pendingSync: false });
    await ctx.postLoginSync();
    expect(calls.consents).toBe(1);
  });
});

describe('initSocialTab — garde « jamais pendant la file » (source)', () => {
  // initSocialTab est trop couplée (DOM + réseau) pour une extraction vm complète ;
  // on vérifie que la branche social-onboarding est bien gardée par l'état de la file,
  // AVANT l'appel — même pattern que les autres gardes testées en exécution.
  const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');
  test('la branche !onboardingCompleted teste _obSeqActive/_obSeqWaitingHydration avant showSocialOnboarding', () => {
    const m = SUPA.match(/if \(!db\.social\.onboardingCompleted\) \{[\s\S]{0,400}?showSocialOnboarding\(\);/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/_obSeqActive/);
    expect(m[0]).toMatch(/_obSeqWaitingHydration/);
  });
});
