// Chantier 7 (bloc 1) — ordonnanceur d'entrée. Une seule autorité d'affichage pour les
// écrans de première visite : la file affiche UN écran à la fois, avance par signal de
// complétion (obSeqDone), 100 % local. Garde D-B (décision Aurélien, non négociable) :
// la file n'OUVRE PAS un écran de collecte tant qu'on ne sait pas si l'utilisateur est
// déjà onboardé — session email persistée → attendre le verdict du pull, JAMAIS de flash.
// Fonctions extraites de la VRAIE source (vm), écrans stubbés (spies).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}
function extractVarBlock(src, name) {
  // var NAME = [ ... ]; multiligne — s'arrête à la première ligne '];' en début de ligne
  const m = src.match(new RegExp('^var ' + name + ' = \\[[\\s\\S]*?^\\];', 'm'));
  if (!m) throw new Error('Could not extract var ' + name);
  return m[0];
}

// Contexte vm : séquenceur réel + écrans stubbés + db pilotable.
// opts.session : session renvoyée par le stub supaClient.auth.getSession()
// opts.noSupa  : supaClient absent (offline pur / SDK non chargé)
function build(initialDb, opts) {
  opts = opts || {};
  const shows = { profile: 0, plan: 0, swipe: 0, classQuiz: 0 };
  const loading = { shown: 0, hidden: 0 };
  const ctx = {
    JSON, console: { warn() {}, log() {} },
    db: initialDb,
    ONBOARDING_VERSION: 4,
    cloudHydrationState: opts.hydration || 'pending',
    document: { getElementById: () => null }, // les fns loading sont défensives (if el)
    logErrorToSupabase: () => {},
  };
  vm.createContext(ctx);
  if (!opts.noSupa) {
    ctx.supaClient = { auth: { getSession: async () => ({ data: { session: opts.session || null } }) } };
  }
  vm.runInContext(extractFn(APP, 'needsOnboarding'), ctx);
  // Vars d'état du séquenceur (déclarées hors fonctions dans la source)
  vm.runInContext('var _obSeqActive=false,_obSeqCurrent=null,_obSeqFreshRun=false,_obSeqWaitingHydration=false,_obSeqBroken={};', ctx);
  vm.runInContext(extractVarBlock(APP, 'OB_SEQ_STEPS'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqFindNext'), ctx);
  vm.runInContext(extractFn(APP, 'obSeqStart'), ctx);
  vm.runInContext(extractFn(APP, 'obSeqAdvance'), ctx);
  vm.runInContext(extractFn(APP, 'obSeqDone'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqShowLoading'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqHideLoading'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqOnHydrationSettled'), ctx);
  vm.runInContext(extractFn(APP, '_obSeqBootStart'), ctx);
  // Écrans stubbés (spies) — la source appelle les vrais noms
  ctx.showOnboarding = () => { shows.profile++; };
  ctx.showMagicStart = () => { shows.plan++; };
  ctx.renderSwipeOnboarding = () => { shows.swipe++; };
  ctx.showClassQuiz = () => { shows.classQuiz++; };
  ctx._obSeqShowLoading = () => { loading.shown++; };
  ctx._obSeqHideLoading = () => { loading.hidden++; };
  return { ctx, shows, loading };
}

const freshDb = () => ({ user: { onboarded: false, onboardingVersion: 0 }, _magicStartDone: false, weeklyPlan: null });
const totalShows = (s) => s.profile + s.plan + s.swipe + s.classQuiz;

describe('ordonnanceur — file nominale (nouvel utilisateur)', () => {
  test('start ouvre le profil, un seul écran', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    expect(shows.profile).toBe(1);
    expect(totalShows(shows)).toBe(1);
    expect(ctx._obSeqActive).toBe(true);
    expect(ctx._obSeqCurrent).toBe('profile');
  });

  test('la complétion de chaque étape ouvre la suivante, sans reload', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    // obFinish : pose les flags puis signale
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.obSeqDone('profile');
    expect(shows.plan).toBe(1); // Magic Start immédiat, plus de timer
    // handleMagicChoice : pose le flag + génère le plan puis signale
    ctx.db._magicStartDone = true;
    ctx.db.weeklyPlan = { days: [{}] };
    ctx.obSeqDone('plan');
    expect(shows.swipe).toBe(1);
    ctx.db.user._swipeCompleted = true;
    ctx.obSeqDone('swipe');
    expect(shows.classQuiz).toBe(1);
    ctx.db.user.quizDone = true;
    ctx.obSeqDone('classQuiz');
    expect(ctx._obSeqActive).toBe(false); // file terminée
    expect(totalShows(shows)).toBe(4);    // jamais deux écrans pour une étape
  });

  test('swipe sauté si pas de plan (choix libre/import) → quiz direct', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.obSeqDone('profile');
    ctx.db._magicStartDone = true; // pas de weeklyPlan
    ctx.obSeqDone('plan');
    expect(shows.swipe).toBe(0);
    expect(shows.classQuiz).toBe(1);
  });

  test('swipe sauté pour un powerlifter (comportement conservé)', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.db.user.trainingMode = 'powerlifting';
    ctx.obSeqDone('profile');
    ctx.db._magicStartDone = true; ctx.db.weeklyPlan = { days: [{}] };
    ctx.obSeqDone('plan');
    expect(shows.swipe).toBe(0);
    expect(shows.classQuiz).toBe(1);
  });

  test('un seul écran à la fois : advance répété ne ré-ouvre pas l\'écran courant', () => {
    const { ctx, shows } = build(freshDb());
    ctx.obSeqStart();
    ctx.obSeqAdvance(); ctx.obSeqAdvance(); ctx.obSeqStart();
    expect(shows.profile).toBe(1);
  });

  test('reprise à froid : flags intermédiaires → reprend au bon écran', () => {
    const dbMid = freshDb();
    dbMid.user.onboarded = true; dbMid.user.onboardingVersion = 3; // version en retard MAIS
    // reprise nouvel utilisateur réel : profil fini, magic start pas fait
    dbMid.user.onboardingVersion = 4;
    dbMid._magicStartDone = false;
    const { ctx, shows } = build(dbMid);
    // profil complet → needsOnboarding false → la file ne s'engage pas seule au boot
    ctx.obSeqStart();
    expect(ctx._obSeqActive).toBe(false);
    expect(totalShows(shows)).toBe(0); // un compte établi ne reçoit JAMAIS les étapes newUserOnly
  });

  test('étape dont show() crashe → skippée, la file continue sans bloquer', () => {
    const { ctx, shows } = build(freshDb());
    ctx.showOnboarding = () => { throw new Error('boom'); };
    ctx.obSeqStart();
    // profile a crashé → marqué broken → la file passe aux étapes suivantes (fresh run)
    expect(ctx._obSeqBroken.profile).toBe(true);
    expect(shows.plan).toBe(1); // Magic Start affiché à la place, pas de blocage
  });
});

describe('ordonnanceur — welcome-back (compte onboardé, version en retard)', () => {
  test('seule l\'étape profile tourne ; jamais plan/swipe/quiz (newUserOnly)', () => {
    const dbWb = { user: { onboarded: true, onboardingVersion: 3 }, _magicStartDone: false, weeklyPlan: { days: [{}] } };
    const { ctx, shows } = build(dbWb);
    ctx.obSeqStart();
    expect(shows.profile).toBe(1); // welcome-back (showOnboarding route en interne)
    ctx.db.user.onboardingVersion = 4; // obFinishWelcomeBack
    ctx.obSeqDone('profile');
    expect(ctx._obSeqActive).toBe(false);
    expect(shows.plan + shows.swipe + shows.classQuiz).toBe(0);
  });

  test('boot welcome-back : affichage immédiat, sans attendre le cloud (v338 conservé)', async () => {
    const dbWb = { user: { onboarded: true, onboardingVersion: 3 } };
    const { ctx, shows, loading } = build(dbWb, { session: { user: { id: 'U1', email: 'a@b.c' } } });
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1); // pas d'attente d'hydratation : le db local SAIT (onboardé)
    expect(loading.shown).toBe(0);
  });
});

describe('garde D-B — jamais de flash d\'écran de collecte (scénario device du 21/07)', () => {
  test('OBLIGATOIRE : session persistée + cache vidé + onboarded=true au cloud → AUCUN écran, jamais', async () => {
    const { ctx, shows, loading } = build(freshDb(), { session: { user: { id: 'U1', email: 'aurel@x.fr' } } });
    await ctx._obSeqBootStart();
    // La file N'A PAS ouvert d'écran : elle attend le verdict du pull
    expect(totalShows(shows)).toBe(0);
    expect(ctx._obSeqWaitingHydration).toBe(true);
    expect(loading.shown).toBe(1);
    // Le pull hydrate le blob cloud (compte existant, 553 séances…) : onboardé
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx.db.user.quizDone = false; // même si le quiz cloud n'est pas fait…
    ctx.cloudHydrationState = 'hydrated';
    ctx._obSeqOnHydrationSettled('hydrated');
    // …AUCUN écran de collecte n'a été affiché à AUCUN moment (même pas un flash)
    expect(totalShows(shows)).toBe(0);
    expect(ctx._obSeqActive).toBe(false);
    expect(loading.hidden).toBeGreaterThan(0); // l'app s'ouvre directement
  });

  test('vrai nouveau confirmé : pull hydraté mais db toujours vierge → la file démarre', async () => {
    const { ctx, shows } = build(freshDb(), { session: { user: { id: 'U2', email: 'new@x.fr' } } });
    await ctx._obSeqBootStart();
    expect(totalShows(shows)).toBe(0);
    ctx.cloudHydrationState = 'hydrated'; // resolveIdentity 'reset-new' (aucune ligne cloud)
    ctx._obSeqOnHydrationSettled('hydrated');
    expect(shows.profile).toBe(1); // l'onboarding s'ouvre dès qu'on SAIT
  });

  test('pull échoué (offline) : aucun écran de collecte ; le succès ultérieur décide', async () => {
    const { ctx, shows, loading } = build(freshDb(), { session: { user: { id: 'U3', email: 'off@x.fr' } } });
    await ctx._obSeqBootStart();
    ctx._obSeqOnHydrationSettled('failed');
    expect(totalShows(shows)).toBe(0);           // on ne sait toujours pas → rien
    expect(loading.hidden).toBeGreaterThan(0);   // mais l'app locale redevient utilisable
    expect(ctx._obSeqWaitingHydration).toBe(true); // l'attente reste armée pour le retry
    // retry réussi plus tard → compte existant hydraté
    ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
    ctx._obSeqOnHydrationSettled('hydrated');
    expect(totalShows(shows)).toBe(0);
  });

  test('session anonyme (sans email) → pas d\'attente : onboarding immédiat', async () => {
    const { ctx, shows } = build(freshDb(), { session: { user: { id: 'anon-1', email: null } } });
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);
    expect(ctx._obSeqWaitingHydration).toBe(false);
  });

  test('appareil vierge sans session → onboarding immédiat, aucune attente', async () => {
    const { ctx, shows, loading } = build(freshDb(), { session: null });
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);
    expect(loading.shown).toBe(0);
  });

  test('offline pur (supaClient absent) → onboarding immédiat', async () => {
    const { ctx, shows } = build(freshDb(), { noSupa: true });
    await ctx._obSeqBootStart();
    expect(shows.profile).toBe(1);
  });

  test('course getSession vs pull : verrou déjà hydraté au retour → décision immédiate, pas d\'attente morte', async () => {
    const { ctx, shows } = build(freshDb(), { session: { user: { id: 'U4', email: 'race@x.fr' } } });
    // le pull se termine PENDANT le getSession du bootStart : le blob adopté est onboardé
    ctx.supaClient = { auth: { getSession: async () => {
      ctx.db.user.onboarded = true; ctx.db.user.onboardingVersion = 4;
      ctx.cloudHydrationState = 'hydrated';
      return { data: { session: { user: { id: 'U4', email: 'race@x.fr' } } } };
    } } };
    await ctx._obSeqBootStart();
    expect(totalShows(shows)).toBe(0); // rien à faire, et surtout pas d'attente jamais résolue
    expect(ctx._obSeqActive).toBe(false);
  });

  test('pendant l\'attente, obSeqStart/obSeqAdvance sont inertes (aucune ouverture possible)', async () => {
    const { ctx, shows } = build(freshDb(), { session: { user: { id: 'U5', email: 'wait@x.fr' } } });
    await ctx._obSeqBootStart();
    ctx.obSeqStart(); ctx.obSeqAdvance();
    expect(totalShows(shows)).toBe(0);
  });
});

describe('ordonnanceur — signaux hors file', () => {
  test('obSeqDone hors file active : no-op (quiz refait depuis Réglages, etc.)', () => {
    const done = { user: { onboarded: true, onboardingVersion: 4, quizDone: true } };
    const { ctx, shows } = build(done);
    ctx.obSeqDone('classQuiz');
    expect(totalShows(shows)).toBe(0);
    expect(ctx._obSeqActive).toBe(false);
  });
});
