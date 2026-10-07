const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_DB = {
  user: {
    name: 'Test', age: 28, bw: 90, height: 182, gender: 'male',
    level: 'avance', trainingMode: 'powerbuilding',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 60, vocabLevel: 2,
    injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
    cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
    programParams: {
      freq: 5, goal: 'masse', goals: ['masse'],
      level: 'avance', mat: 'salle', duration: 60,
      selectedDays: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi', 'Samedi']
    }
  },
  bestPR: { squat: 130, bench: 110, deadlift: 170 },
  exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
  earnedBadges: {}, xpHighWaterMark: 0, routine: {}
};

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('SETS-01 adaptSessionForDuration ne crash pas avec sets:number (cas pbBlocks)', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    var exos = [
      { name: 'Leg Extension', sets: 4, reps: '12-15', restSeconds: 60 },
      { name: 'Leg Curl', sets: 4, reps: '12-15', restSeconds: 60 },
      { name: 'Mollet Debout', sets: 4, reps: '15-20', restSeconds: 60 },
      { name: 'High Bar Squat', sets: 4, reps: '6-8', isPrimary: true, restSeconds: 180 }
    ];
    var error = null;
    var res = null;
    try { res = adaptSessionForDuration(exos, 60, 'masse'); }
    catch(e) { error = String(e); }
    return {
      error: error,
      hasResult: !!res,
      isoSets: res ? (res.exercises.find(function(e){return e.name==='Leg Extension';}) || {}).sets : null
    };
  });
  expect(result.error).toBeNull();
  expect(result.hasResult).toBe(true);
  expect(typeof result.isoSets).toBe('number');
});

test('SETS-02 adaptSessionForDuration gère sets:Array (cas GO logs)', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    var exos = [
      {
        name: 'Leg Extension',
        sets: [
          { isWarmup: true, weight: 20, reps: 15 },
          { isWarmup: false, weight: 35, reps: 12 },
          { isWarmup: false, weight: 35, reps: 12 },
          { isWarmup: false, weight: 35, reps: 11 }
        ],
        restSeconds: 60
      },
      { name: 'High Bar Squat', sets: 4, reps: '6-8', isPrimary: true, restSeconds: 180 }
    ];
    var error = null;
    var res = null;
    try { res = adaptSessionForDuration(exos, 60, 'masse'); }
    catch(e) { error = String(e); }
    var iso = res ? res.exercises.find(function(e){return e.name==='Leg Extension';}) : null;
    return {
      error: error,
      isoSetsType: iso ? (Array.isArray(iso.sets) ? 'array' : typeof iso.sets) : null,
      workSetsCount: (iso && Array.isArray(iso.sets)) ? iso.sets.filter(function(s){return !s.isWarmup;}).length : null
    };
  });
  expect(result.error).toBeNull();
  expect(result.isoSetsType).toBe('array');
});

test('SETS-03 estimateSessionDuration gère sets:number sans crash', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    var exos = [
      { name: 'High Bar Squat', sets: 4, reps: '6-8', isPrimary: true, restSeconds: 180 },
      { name: 'Presse à Cuisses', sets: 3, reps: '10-12', restSeconds: 120 },
      { name: 'Leg Extension', sets: 4, reps: '15-20', restSeconds: 90 }
    ];
    var error = null;
    var dur = null;
    try { dur = estimateSessionDuration(exos); }
    catch(e) { error = String(e); }
    return { error: error, duration: dur };
  });
  expect(result.error).toBeNull();
  expect(result.duration).toBeGreaterThan(0);
  expect(result.duration).toBeLessThan(200 * 60);
});

test('SETS-04 generateWeeklyPlan complet powerbuilding avancé freq=5 — exercices peuplés', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); }
    catch(e) { error = String(e); }
    var plan = db.weeklyPlan;
    if (!plan || !Array.isArray(plan.days)) return { error: error || 'no days' };
    var trainingDays = plan.days.filter(function(d){ return !d.rest; });
    var emptyDays = trainingDays.filter(function(d){ return !d.exercises || !d.exercises.length; });
    return {
      error: error,
      trainingDayCount: trainingDays.length,
      emptyDayCount: emptyDays.length,
      firstDayExoCount: trainingDays[0] ? trainingDays[0].exercises.length : 0
    };
  });
  expect(result.error).toBeNull();
  expect(result.trainingDayCount).toBe(5);
  expect(result.emptyDayCount).toBe(0);
  expect(result.firstDayExoCount).toBeGreaterThan(0);
});

test('SETS-05 renderProgDaysList setsCount ne crash pas avec sets:number', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    // simulate weeklyPlan.days with sets:number exercises
    db.weeklyPlan = {
      days: [{
        day: 'Lundi', rest: false, title: 'Squat — Force',
        exercises: [
          { name: 'High Bar Squat', sets: 4, reps: '6-8' },
          { name: 'Leg Press', sets: 3, reps: '10-12' }
        ]
      }],
      generated_at: new Date().toISOString()
    };
    db.routine = { Lundi: 'Squat — Force' };
    var error = null;
    try {
      var el = document.createElement('div');
      el.id = '_testProgDays';
      document.body.appendChild(el);
      if (typeof renderProgDaysList === 'function') renderProgDaysList(el);
    } catch(e) { error = String(e); }
    return { error: error };
  });
  expect(result.error).toBeNull();
});
