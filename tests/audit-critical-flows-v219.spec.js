const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

function baseDb() {
  return {
    user: {
      name: 'Test', age: 30, bw: 80, height: 180, gender: 'male',
      level: 'intermediaire', trainingMode: 'powerbuilding',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 60, vocabLevel: 2,
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 4, goal: 'masse', goals: ['masse'], level: 'intermediaire',
        mat: 'salle', duration: 60, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi'] }
    },
    bestPR: { squat: 120, bench: 90, deadlift: 150 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
}

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('FLOW-01 migrateWeeklyPlanSets normalise les sets:number legacy', async ({ page }) => {
  var db = baseDb();
  // Inject a legacy weeklyPlan with sets:number (pre-v218 corrective)
  db.weeklyPlan = {
    days: [
      { day: 'Lundi', rest: false, title: 'Squat',
        exercises: [
          { name: 'Squat', sets: [{reps:5,rpe:8,weight:100,isWarmup:false}] },
          { name: 'Face Pull', sets: 3, reps: '15', rpe: 7 } // legacy number
        ]
      }
    ],
    generated_at: new Date().toISOString()
  };
  await setDB(page, db);
  const result = await page.evaluate(() => {
    if (typeof migrateWeeklyPlanSets === 'function') migrateWeeklyPlanSets();
    var plan = db.weeklyPlan;
    var lundi = plan.days[0];
    var facePull = lundi.exercises.find(function(e){ return e.name === 'Face Pull'; });
    return {
      migrated: db._weeklyPlanSetsMigrated === true,
      facePullIsArray: Array.isArray(facePull && facePull.sets),
      facePullLen: facePull && Array.isArray(facePull.sets) ? facePull.sets.length : -1
    };
  });
  expect(result.migrated).toBe(true);
  expect(result.facePullIsArray).toBe(true);
  expect(result.facePullLen).toBe(3);
});

test('FLOW-02 progShowDayDetail ne crash plus avec sets:number', async ({ page }) => {
  await setDB(page, baseDb());
  const result = await page.evaluate(() => {
    db.weeklyPlan = {
      days: [{ day: 'Lundi', rest: false, title: 'Test',
        exercises: [{ name: 'Face Pull', sets: 3, reps: '15', rpe: 7 }]
      }],
      generated_at: new Date().toISOString()
    };
    var error = null;
    try { if (typeof progShowDayDetail === 'function') progShowDayDetail('Lundi'); }
    catch(e) { error = String(e); }
    return { error: error };
  });
  expect(result.error).toBeNull();
});

test('FLOW-03 renderGoTab exo card ne crash plus avec sets:number', async ({ page }) => {
  await setDB(page, baseDb());
  const result = await page.evaluate(() => {
    db.weeklyPlan = {
      days: [{ day: 'Lundi', rest: false, title: 'Test',
        exercises: [{ name: 'Face Pull', sets: 3, reps: '15', rpe: 7 }]
      }],
      generated_at: new Date().toISOString()
    };
    var error = null;
    try { if (typeof renderGoTab === 'function') renderGoTab(); }
    catch(e) { error = String(e); }
    return { error: error };
  });
  expect(result.error).toBeNull();
});

test('FLOW-04 _computeDataHash est stable et change si logs changent', async ({ page }) => {
  await setDB(page, baseDb());
  // Note: _computeDataHash lives in supabase.js — exposed globally via top-level function declaration
  const result = await page.evaluate(() => {
    if (typeof _computeDataHash !== 'function') return { exists: false };
    var h1 = _computeDataHash(db);
    var h2 = _computeDataHash(db);
    db.logs = [{ timestamp: Date.now(), exercises: [] }];
    var h3 = _computeDataHash(db);
    return { exists: true, stable: h1 === h2, changesOnLogs: h1 !== h3 };
  });
  expect(result.exists).toBe(true);
  expect(result.stable).toBe(true);
  expect(result.changesOnLogs).toBe(true);
});
