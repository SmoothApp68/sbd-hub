const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

function aurelienDb() {
  return {
    user: {
      name: 'Aurélien', age: 35, bw: 98, height: 178, gender: 'male',
      level: 'avance', trainingMode: 'powerbuilding',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'premium', trainingDuration: 90, vocabLevel: 2,
      programMode: 'auto',
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 5, goal: 'masse', goals: ['masse'], level: 'avance',
        mat: 'salle', duration: 90, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
    },
    bestPR: { squat: 148, bench: 140, deadlift: 186 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
}

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('PHASE-01 lastDeloadDate = 2 sem → phase=hypertrophie, week=2', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var twoWeeksAgo = Date.now() - 2 * 7 * 86400000;
    db.weeklyPlan = {
      lastDeloadDate: new Date(twoWeeksAgo).toISOString(),
      currentBlock: { phase: null, blockStartDate: twoWeeksAgo }
    };
    var phase = wpDetectPhase();
    return {
      phase: phase,
      blockPhase: db.weeklyPlan.currentBlock.phase,
      week: db.weeklyPlan.currentBlock.week
    };
  });
  expect(result.phase).toBe('hypertrophie');
  expect(result.blockPhase).toBe('hypertrophie');
  expect(result.week).toBeGreaterThanOrEqual(1);
  expect(result.week).toBeLessThanOrEqual(4);
});

test('PHASE-02 lastDeloadDate = 5 sem avancé → phase=force', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    // Aurélien avancé powerbuilding : intro=0(absent), hypertrophie=4, force=4, peak=1
    // À 5 semaines on entre dans 'force' (semaine 1 de force).
    var fiveWeeksAgo = Date.now() - 5 * 7 * 86400000;
    db.weeklyPlan = {
      lastDeloadDate: new Date(fiveWeeksAgo).toISOString(),
      currentBlock: { phase: null }
    };
    db.user.level = 'avance';
    db.user.trainingMode = 'powerbuilding';
    var phase = wpDetectPhase();
    return { phase: phase, week: db.weeklyPlan.currentBlock.week };
  });
  expect(result.phase).toBe('force');
  expect(result.week).toBeGreaterThanOrEqual(1);
});

test('PHASE-03 pas de lastDeloadDate → pas de crash, phase fallback', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    db.weeklyPlan = { currentBlock: { phase: null } };
    db.weeklyPlanHistory = [];
    db.logs = [];
    var error = null;
    var phase = null;
    try { phase = wpDetectPhase(); } catch(e) { error = String(e); }
    return { error: error, phase: phase };
  });
  expect(result.error).toBeNull();
  expect(typeof result.phase).toBe('string');
  expect(result.phase.length).toBeGreaterThan(0);
});

test('DEAD-01 WP_ACCESSORIES_BY_PHASE.hypertrophie.deadlift → Hip Thrust absent', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var pool = WP_ACCESSORIES_BY_PHASE.hypertrophie.deadlift || [];
    var names = pool.map(function(a){ return a.name; });
    return {
      hasHipThrust: names.some(function(n){ return /hip thrust/i.test(n); }),
      names: names
    };
  });
  expect(result.hasHipThrust).toBe(false);
});

test('DEAD-02 WP_ACCESSORIES_BY_PHASE.hypertrophie.deadlift → Leg Curl + Relevé de Jambes + Face Pull présents', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var pool = WP_ACCESSORIES_BY_PHASE.hypertrophie.deadlift || [];
    var names = pool.map(function(a){ return a.name; });
    return {
      hasLegCurl: names.some(function(n){ return /leg curl/i.test(n); }),
      hasReleveJambes: names.some(function(n){ return /relevé de jambes/i.test(n); }),
      hasFacePull: names.some(function(n){ return /face pull/i.test(n); }),
      hasTirageVertical: names.some(function(n){ return /tirage vertical/i.test(n); })
    };
  });
  expect(result.hasLegCurl).toBe(true);
  expect(result.hasReleveJambes).toBe(true);
  expect(result.hasFacePull).toBe(true);
  expect(result.hasTirageVertical).toBe(true);
});

test('MODE-01 setPhaseDuration(\'hypertrophie\', 6) → customBlockDuration.hypertrophie=6', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    db.user.programMode = 'custom';
    setPhaseDuration('hypertrophie', 6);
    return {
      stored: db.user.customBlockDuration && db.user.customBlockDuration.hypertrophie,
      hasRender: typeof renderPhaseDurationSettings === 'function'
    };
  });
  expect(result.stored).toBe(6);
  expect(result.hasRender).toBe(true);
});

test('MODE-02 wpDetectPhase respecte customBlockDuration en mode Avancé', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    db.user.programMode = 'custom';
    db.user.customBlockDuration = { hypertrophie: 8 };
    // 6 semaines après deload, default avancé serait force (4+2). Avec custom=8, devrait être hypertrophie.
    var sixWeeksAgo = Date.now() - 6 * 7 * 86400000;
    db.weeklyPlan = {
      lastDeloadDate: new Date(sixWeeksAgo).toISOString(),
      currentBlock: { phase: null }
    };
    var phase = wpDetectPhase();
    return { phase: phase, week: db.weeklyPlan.currentBlock.week };
  });
  expect(result.phase).toBe('hypertrophie');
});
