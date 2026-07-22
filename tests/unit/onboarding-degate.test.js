// Chantier 7 (bloc 1, commit 1c) — dé-gating de l'entrée (décision D-B) :
// un appareil vierge non onboardé passe par la file (onboarding-first) — le login
// screen ne se met JAMAIS par-dessus la file ; il reste l'écran d'entrée des comptes
// établis déconnectés, et s'ouvre depuis la file uniquement via « J'ai déjà un
// compte » (force=true). Vraie source via vm.
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

function build(opts) {
  opts = opts || {};
  const calls = { showLogin: 0, hideLogin: 0, signOut: 0 };
  const loginEl = { style: { display: 'none' } };
  const ctx = {
    JSON, console: { warn() {}, log() {} },
    window: { location: { hash: '', search: '' } },
    document: { getElementById: (id) => (id === 'loginScreen' ? loginEl : null) },
    db: opts.db,
    ONBOARDING_VERSION: 4,
    cloudSyncEnabled: true,
    updateCloudUI: () => {},
    saveDB: () => {},
    setTimeout: (fn) => {},
  };
  vm.createContext(ctx);
  vm.runInContext('var _obSeqActive=' + !!opts.fileActive + ', _obSeqWaitingHydration=' + !!opts.waiting + ', _obSeqLoginPause=' + !!opts.loginPause + ';', ctx);
  vm.runInContext(extractFn(APP, 'needsOnboarding'), ctx);
  vm.runInContext(extractFn(SUPA, 'showLoginScreen'), ctx);
  vm.runInContext(extractFn(SUPA, 'hideLoginScreen'), ctx);
  ctx.supaClient = {
    auth: {
      getSession: async () => ({ data: { session: opts.session || null } }),
      signOut: async () => { calls.signOut++; },
    },
  };
  vm.runInContext(extractFn(SUPA, 'checkAuthGate'), ctx);
  vm.runInContext(extractFn(SUPA, 'checkPasswordMigration'), ctx);
  return { ctx, calls, loginEl };
}

describe('checkAuthGate — onboarding-first pour un appareil vierge (D-B)', () => {
  test('pas de session + db vierge non onboardé → PAS de login screen (la file prend l\'entrée)', async () => {
    const { ctx, loginEl } = build({ db: { user: { onboarded: false, onboardingVersion: 0 } } });
    await ctx.checkAuthGate();
    expect(loginEl.style.display).toBe('none');
  });

  test('pas de session + compte onboardé à jour → login screen (comportement actuel conservé)', async () => {
    const { ctx, loginEl } = build({ db: { user: { onboarded: true, onboardingVersion: 4 } } });
    await ctx.checkAuthGate();
    expect(loginEl.style.display).toBe('flex');
  });

  test('pas de session + welcome-back (onboardé, version en retard) : la garde maîtresse bloque pendant la file', async () => {
    // checkAuthGate laisse passer (compte onboardé) mais showLoginScreen est inerte si la file tourne
    const { ctx, loginEl } = build({ db: { user: { onboarded: true, onboardingVersion: 3 } }, fileActive: true });
    await ctx.checkAuthGate();
    expect(loginEl.style.display).toBe('none');
  });

  test('session existante → login caché, jamais affiché', async () => {
    const { ctx, loginEl } = build({
      db: { user: { onboarded: false, onboardingVersion: 0 } },
      session: { user: { id: 'U1', email: 'a@b.c' } },
    });
    loginEl.style.display = 'flex'; // écran resté d'un état précédent
    await ctx.checkAuthGate();
    expect(loginEl.style.opacity).toBe('0'); // hideLoginScreen (fade)
  });
});

describe('showLoginScreen — garde maîtresse pendant la file', () => {
  test('file active → no-op sans force', () => {
    const { ctx, loginEl } = build({ db: { user: {} }, fileActive: true });
    ctx.showLoginScreen();
    expect(loginEl.style.display).toBe('none');
  });

  test('attente D-B → no-op sans force', () => {
    const { ctx, loginEl } = build({ db: { user: {} }, waiting: true });
    ctx.showLoginScreen();
    expect(loginEl.style.display).toBe('none');
  });

  test('pause login manuelle → no-op sans force', () => {
    const { ctx, loginEl } = build({ db: { user: {} }, loginPause: true });
    ctx.showLoginScreen();
    expect(loginEl.style.display).toBe('none');
  });

  test('force=true (lien « J\'ai déjà un compte ») → s\'affiche même pendant la file/pause', () => {
    const { ctx, loginEl } = build({ db: { user: {} }, fileActive: true, waiting: true, loginPause: true });
    ctx.showLoginScreen(true);
    expect(loginEl.style.display).toBe('flex');
  });

  test('hors file → comportement normal', () => {
    const { ctx, loginEl } = build({ db: { user: {} } });
    ctx.showLoginScreen();
    expect(loginEl.style.display).toBe('flex');
  });
});

describe('loginOffline — reprise locale d\'une file en pause', () => {
  test('« Continuer hors-ligne » depuis le login ouvert via q1 → la file reprend (pas d\'app vide)', () => {
    const { ctx } = build({ db: { user: { onboarded: false, onboardingVersion: 0 } } });
    let resumed = 0;
    ctx._obSeqResumeLocal = () => { resumed++; };
    vm.runInContext(extractFn(SUPA, 'loginOffline'), ctx);
    ctx.loginOffline();
    expect(resumed).toBe(1);
  });
});

describe('checkPasswordMigration — session anonyme pendant la file', () => {
  test('file active → la session anonyme n\'est NI coupée NI remplacée par le login', async () => {
    const { ctx, calls, loginEl } = build({ db: { user: { onboarded: false } }, fileActive: true });
    await ctx.checkPasswordMigration({ id: 'anon-1', email: null });
    expect(calls.signOut).toBe(0);
    expect(loginEl.style.display).toBe('none');
  });

  test('hors file → comportement actuel (signOut silencieux + login screen)', async () => {
    const { ctx, calls, loginEl } = build({ db: { user: { onboarded: true, onboardingVersion: 4 } } });
    await ctx.checkPasswordMigration({ id: 'anon-1', email: null });
    expect(calls.signOut).toBe(1);
    expect(loginEl.style.display).toBe('flex');
  });

  test('utilisateur email déjà migré → aucun effet de bord', async () => {
    const { ctx, calls, loginEl } = build({ db: { user: {}, passwordMigrated: true } });
    ctx.db.passwordMigrated = true;
    await ctx.checkPasswordMigration({ id: 'U1', email: 'a@b.c' });
    expect(calls.signOut).toBe(0);
    expect(loginEl.style.display).toBe('none');
  });
});
