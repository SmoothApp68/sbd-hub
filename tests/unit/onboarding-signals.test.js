// Chantier 7 (bloc 1, commit 1b) — les écrans d'entrée ne s'auto-déclenchent plus :
// obFinish n'arme AUCUN timer (magic +400 / social +500 / swipe +800 supprimés) et
// signale sa complétion à la file (obSeqDone). handleMagicChoice signale 'plan'.
// checkRequiredConsents ne passe jamais par-dessus la file. Vraie source via vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}

function buildObFinish(initialDb) {
  const timers = [];
  const signals = [];
  const ctx = {
    JSON, console: { warn() {}, log() {} },
    Date, Array,
    db: initialDb,
    ONBOARDING_VERSION: 4,
    obSelectedDays: ['Lundi', 'Mercredi', 'Vendredi'],
    document: { getElementById: () => null }, // pas de checkbox médicale dans ce harnais
    setTimeout: (fn, ms) => { timers.push(ms); },
    validateUserLevel: () => {}, autoPopulateKeyLifts: () => {},
    saveDB: () => {}, saveDBNow: () => {}, hideOnboarding: () => {},
    refreshUI: () => {}, renderProgramViewer: () => {}, showToast: () => {},
    obSeqDone: (id) => { signals.push(id); },
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn(APP, 'obFinish'), ctx);
  vm.runInContext(extractFn(APP, 'obFinishWelcomeBack'), ctx);
  return { ctx, timers, signals };
}

describe('obFinish — plus aucun timer d\'entrée, signal à la file', () => {
  test('n\'arme AUCUN setTimeout (magic/social/swipe supprimés) et signale profile', () => {
    const { ctx, timers, signals } = buildObFinish({ user: {}, weeklyPlan: null });
    ctx.obFinish();
    expect(timers).toEqual([]); // zéro auto-déclenchement — la file décide
    expect(signals).toEqual(['profile']);
    expect(ctx.db.user.onboarded).toBe(true);
    expect(ctx.db.user.onboardingVersion).toBe(4);
  });

  test('bypass conservé : un plan déjà généré pose _magicStartDone (l\'étape plan se saute)', () => {
    const { ctx, signals } = buildObFinish({ user: {}, weeklyPlan: { days: [{}] } });
    ctx.obFinish();
    expect(ctx.db._magicStartDone).toBe(true);
    expect(signals).toEqual(['profile']);
  });

  test('obFinishWelcomeBack signale aussi profile (fin de run welcome-back)', () => {
    const { ctx, signals } = buildObFinish({ user: { onboarded: true, onboardingVersion: 3 } });
    ctx.obFinishWelcomeBack();
    expect(ctx.db.user.onboardingVersion).toBe(4);
    expect(signals).toEqual(['profile']);
  });
});

describe('handleMagicChoice — signale plan à la file', () => {
  function buildMagic(initialDb) {
    const signals = [];
    const ctx = {
      JSON, console: { warn() {}, log() {} },
      db: initialDb,
      document: { getElementById: () => null, querySelector: () => null },
      setTimeout: (fn) => {}, // timer de navigation interne (150 ms) toléré, jamais exécuté ici
      saveDB: () => {}, saveDBNow: () => {},
      generateWeeklyPlan: () => { initialDb.weeklyPlan = { days: [{}] }; },
      showTab: () => {}, showSeancesSub: () => {}, importCSV: () => {},
      obSeqDone: (id) => { signals.push(id); },
    };
    vm.createContext(ctx);
    vm.runInContext(extractFn(APP, 'handleMagicChoice'), ctx);
    return { ctx, signals };
  }

  test.each(['programme', 'libre', 'import', 'skip'])('choix %s → _magicStartDone + signal plan', (choice) => {
    const { ctx, signals } = buildMagic({ user: {}, weeklyPlan: null });
    ctx.handleMagicChoice(choice);
    expect(ctx.db._magicStartDone).toBe(true);
    expect(signals).toEqual(['plan']);
  });
});

describe('checkRequiredConsents — jamais par-dessus la file', () => {
  function buildConsents(vars) {
    const timers = [];
    const ctx = {
      JSON, console: { warn() {}, log() {} },
      db: { user: { consentHealth: false } },
      setTimeout: (fn, ms) => { timers.push(ms); },
      showConsentModal: () => {},
    };
    vm.createContext(ctx);
    vm.runInContext('var _obSeqActive=' + !!vars.active + ', _obSeqWaitingHydration=' + !!vars.waiting + ';', ctx);
    vm.runInContext(extractFn(APP, 'checkRequiredConsents'), ctx);
    return { ctx, timers };
  }

  test('file active → aucun modal de consentement armé', () => {
    const { ctx, timers } = buildConsents({ active: true });
    ctx.checkRequiredConsents();
    expect(timers).toEqual([]);
  });

  test('attente D-B → aucun modal', () => {
    const { ctx, timers } = buildConsents({ waiting: true });
    ctx.checkRequiredConsents();
    expect(timers).toEqual([]);
  });

  test('hors file, consentement manquant → filet conservé (+600 ms)', () => {
    const { ctx, timers } = buildConsents({});
    ctx.checkRequiredConsents();
    expect(timers).toEqual([600]);
  });

  test('hors file, consentement déjà donné → rien', () => {
    const { ctx, timers } = buildConsents({});
    ctx.db.user.consentHealth = true;
    ctx.checkRequiredConsents();
    expect(timers).toEqual([]);
  });
});
