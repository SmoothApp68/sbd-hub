const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

function baseDb() {
  return {
    user: {
      name: 'Léa', age: 28, bw: 60, height: 165, gender: 'female',
      level: 'intermediaire', trainingMode: 'musculation',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 45, vocabLevel: 2,
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: {
        freq: 4, goal: 'recompo', goals: ['recompo'],
        level: 'intermediaire', mat: 'salle', duration: 45,
        selectedDays: ['Mardi','Mercredi','Jeudi','Vendredi']
      }
    },
    bestPR: { squat: 127, bench: 72, deadlift: 112.5 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
}

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('NORM-01 selectExercisesForProfile normalise sets:number → Array', async ({ page }) => {
  await setDB(page, baseDb());
  const result = await page.evaluate(() => {
    // Force a profile that triggers ratio correction injections (sets: 3)
    var profile = {
      duration: 45, mode: 'musculation', injury: null, age: 28,
      stats: { squatBenchRatio: 1.0, deadliftSquatRatio: 0.8, rowBenchRatio: 0.8, ohpBenchRatio: 0.5 }
    };
    var input = [
      { name: 'Squat', isPrimary: true, sets: [{ reps: 8, rpe: 8, weight: 80, isWarmup: false }] },
      { name: 'Bench', isPrimary: true, sets: [{ reps: 8, rpe: 8, weight: 60, isWarmup: false }] }
    ];
    var out = selectExercisesForProfile(input, profile);
    var nonArraySets = out.filter(function(e) { return e && !Array.isArray(e.sets); });
    return {
      total: out.length,
      nonArraySetsCount: nonArraySets.length,
      nonArrayNames: nonArraySets.map(function(e){return e.name + '(' + typeof e.sets + ')';})
    };
  });
  expect(result.nonArraySetsCount).toBe(0);
});

test('NORM-02 renderWpExercise ne crash plus avec exo.sets:number', async ({ page }) => {
  await setDB(page, baseDb());
  const result = await page.evaluate(() => {
    var exo = { name: 'Face Pull', sets: 3, reps: '15-20', rpe: 7, evictionCategory: 'secondary' };
    var error = null;
    var html = '';
    try { html = renderWpExercise(exo); } catch(e) { error = String(e); }
    return { error: error, hasHtml: html.length > 0 };
  });
  expect(result.error).toBeNull();
  expect(result.hasHtml).toBe(true);
});

test('LEA-03 Léa (musculation freq=4 dur=45 recompo) → generateWeeklyPlan complet', async ({ page }) => {
  await setDB(page, baseDb());
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); } catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var training = days.filter(function(d){ return !d.rest; });
    var empty = training.filter(function(d){ return !d.exercises || !d.exercises.length; });
    var numberSets = 0;
    training.forEach(function(d) {
      (d.exercises || []).forEach(function(e) {
        if (typeof e.sets === 'number') numberSets++;
      });
    });
    return {
      error: error,
      daysLen: days.length,
      trainingDayCount: training.length,
      emptyDayCount: empty.length,
      numberSetsCount: numberSets
    };
  });
  expect(result.error).toBeNull();
  expect(result.daysLen).toBeGreaterThan(0);
  expect(result.trainingDayCount).toBe(4);
  expect(result.emptyDayCount).toBe(0);
  expect(result.numberSetsCount).toBe(0);
});
