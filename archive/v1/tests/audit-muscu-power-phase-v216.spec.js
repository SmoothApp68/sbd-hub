const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_DB = {
  user: {
    name: 'Test', age: 28, bw: 70, height: 170, gender: 'female',
    level: 'intermediaire', trainingMode: 'musculation',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 45, vocabLevel: 2,
    injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
    cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
    programParams: {
      freq: 4, goal: 'masse', goals: ['masse'],
      level: 'intermediaire', mat: 'salle', duration: 45,
      selectedDays: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi']
    }
  },
  bestPR: { squat: 60, bench: 40, deadlift: 80 },
  exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
  earnedBadges: {}, xpHighWaterMark: 0, routine: {}
};

const POWERLIFTER_DB = Object.assign({}, BASE_DB, {
  user: Object.assign({}, BASE_DB.user, {
    name: 'DJo', gender: 'male', bw: 95, level: 'avance',
    trainingMode: 'powerlifting', trainingDuration: 90,
    programParams: {
      freq: 4, goal: 'force', goals: ['force'],
      level: 'avance', mat: 'salle', duration: 90,
      selectedDays: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi']
    }
  }),
  bestPR: { squat: 200, bench: 140, deadlift: 240 }
});

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('MUSCU-01 wpGenerateMuscuDay Léa freq=4 dur=45 → exercices peuplés', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); }
    catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var training = days.filter(function(d){ return !d.rest; });
    var empty = training.filter(function(d){ return !d.exercises || !d.exercises.length; });
    return {
      error: error,
      trainingDayCount: training.length,
      emptyDayCount: empty.length,
      firstDayExoCount: training[0] ? training[0].exercises.length : 0
    };
  });
  expect(result.error).toBeNull();
  expect(result.trainingDayCount).toBe(4);
  expect(result.emptyDayCount).toBe(0);
  expect(result.firstDayExoCount).toBeGreaterThan(0);
});

test('POWER-02 generateWeeklyPlan profil D\'Jo (powerlifting freq=4) → days peuplés', async ({ page }) => {
  await setDB(page, POWERLIFTER_DB);
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); }
    catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var training = days.filter(function(d){ return !d.rest; });
    var empty = training.filter(function(d){ return !d.exercises || !d.exercises.length; });
    return {
      error: error,
      daysLen: days.length,
      trainingDayCount: training.length,
      emptyDayCount: empty.length
    };
  });
  expect(result.error).toBeNull();
  expect(result.daysLen).toBeGreaterThan(0);
  expect(result.trainingDayCount).toBe(4);
  expect(result.emptyDayCount).toBe(0);
});

test('PHASE-03 generateProgram avec currentBlock.phase=null → pbBlocks fallback hypertrophie', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    // simulate prior weeklyPlan with phase=null
    db.weeklyPlan = { currentBlock: { phase: null }, days: [] };
    db.user.trainingMode = 'powerbuilding';
    db.user.level = 'avance';
    db.user.programParams.level = 'avance';
    db.user.programParams.freq = 5;
    db.user.programParams.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi','Samedi'];
    var error = null;
    try { generateWeeklyPlan(); }
    catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var phase = plan.currentBlock && plan.currentBlock.phase;
    var days = Array.isArray(plan.days) ? plan.days : [];
    var training = days.filter(function(d){ return !d.rest; });
    return {
      error: error,
      phaseAfter: phase,
      trainingDayCount: training.length,
      hasExos: training.every(function(d){ return d.exercises && d.exercises.length > 0; })
    };
  });
  expect(result.error).toBeNull();
  // phase ne doit jamais rester null après generateWeeklyPlan
  expect(result.phaseAfter).not.toBeNull();
  expect(result.trainingDayCount).toBe(5);
  expect(result.hasExos).toBe(true);
});
