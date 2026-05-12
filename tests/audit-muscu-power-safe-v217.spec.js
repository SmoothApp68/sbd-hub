const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

function baseDb(overrides) {
  var u = {
    name: 'Test', age: 28, bw: 75, height: 175, gender: 'male',
    level: 'intermediaire', trainingMode: 'musculation',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 60, vocabLevel: 2,
    injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
    cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
    programParams: { freq: 4, goal: 'masse', goals: ['masse'], level: 'intermediaire',
      mat: 'salle', duration: 60, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi'] }
  };
  Object.assign(u, overrides.user || {});
  return {
    user: u,
    bestPR: overrides.bestPR || { squat: 80, bench: 60, deadlift: 100 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
}

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('MUSCU-04 Léa (musculation freq=4 dur=45) → days peuplés', async ({ page }) => {
  await setDB(page, baseDb({
    user: {
      name: 'Léa', gender: 'female', bw: 60, height: 165, trainingDuration: 45,
      trainingMode: 'musculation',
      programParams: { freq: 4, goal: 'masse', goals: ['masse'], level: 'intermediaire',
        mat: 'salle', duration: 45, selectedDays: ['Mardi','Mercredi','Jeudi','Vendredi'] }
    },
    bestPR: { squat: 50, bench: 30, deadlift: 70 }
  }));
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); } catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var training = days.filter(function(d){ return !d.rest; });
    var empty = training.filter(function(d){ return !d.exercises || !d.exercises.length; });
    return { error: error, daysLen: days.length, trainingDayCount: training.length, emptyDayCount: empty.length };
  });
  expect(result.error).toBeNull();
  expect(result.daysLen).toBeGreaterThan(0);
  expect(result.trainingDayCount).toBe(4);
  expect(result.emptyDayCount).toBe(0);
});

test('MUSCU-05 Alexis (musculation freq=5) → days peuplés', async ({ page }) => {
  await setDB(page, baseDb({
    user: {
      name: 'Alexis', gender: 'male', bw: 80, trainingMode: 'musculation', trainingDuration: 60,
      programParams: { freq: 5, goal: 'masse', goals: ['masse'], level: 'intermediaire',
        mat: 'salle', duration: 60, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
    },
    bestPR: { squat: 100, bench: 80, deadlift: 120 }
  }));
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); } catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var training = days.filter(function(d){ return !d.rest; });
    var empty = training.filter(function(d){ return !d.exercises || !d.exercises.length; });
    return { error: error, daysLen: days.length, trainingDayCount: training.length, emptyDayCount: empty.length };
  });
  expect(result.error).toBeNull();
  expect(result.daysLen).toBeGreaterThan(0);
  expect(result.trainingDayCount).toBe(5);
  expect(result.emptyDayCount).toBe(0);
});

test('POWER-06 D\'Jo (powerlifting freq=6) → days peuplés', async ({ page }) => {
  await setDB(page, baseDb({
    user: {
      name: 'DJo', gender: 'male', bw: 95, level: 'avance',
      trainingMode: 'powerlifting', trainingDuration: 90,
      programParams: { freq: 6, goal: 'force', goals: ['force'], level: 'avance',
        mat: 'salle', duration: 90, selectedDays: ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'] }
    },
    bestPR: { squat: 220, bench: 150, deadlift: 260 }
  }));
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); } catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var training = days.filter(function(d){ return !d.rest; });
    var empty = training.filter(function(d){ return !d.exercises || !d.exercises.length; });
    return { error: error, daysLen: days.length, trainingDayCount: training.length, emptyDayCount: empty.length };
  });
  expect(result.error).toBeNull();
  expect(result.daysLen).toBeGreaterThan(0);
  expect(result.trainingDayCount).toBe(6);
  expect(result.emptyDayCount).toBe(0);
});

test('SAFE-07 wpGenerateMuscuDaySafe ne throw jamais — wrapper équivalent à wpGeneratePowerbuildingDaySafe', async ({ page }) => {
  await setDB(page, baseDb({ user: {} }));
  const result = await page.evaluate(() => {
    var exists = typeof wpGenerateMuscuDaySafe === 'function';
    var result1 = null, result2 = null;
    if (exists) {
      result1 = wpGenerateMuscuDaySafe('upper_a', db.user.programParams, 'hypertrophie');
      result2 = wpGenerateMuscuDaySafe('nonexistent_key', db.user.programParams, 'hypertrophie');
    }
    return {
      exists: exists,
      result1HasExos: result1 && Array.isArray(result1.exercises),
      result2HasExos: result2 && Array.isArray(result2.exercises)
    };
  });
  expect(result.exists).toBe(true);
  expect(result.result1HasExos).toBe(true);
  expect(result.result2HasExos).toBe(true);
});
