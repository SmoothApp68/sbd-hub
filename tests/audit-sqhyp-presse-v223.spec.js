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
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 5, goal: 'masse', goals: ['masse'], level: 'avance',
        mat: 'salle', duration: 90, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
    },
    // Aurélien : ratio Squat/Bench = 148/140 = 1.057 < 1.20 → trigger Rule 2 imbalance
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

test('SQHYP-01 WP_ACCESSORIES_BY_PHASE.hypertrophie.squat → Presse à Cuisses (pas Hack Squat, pas Fentes)', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var pool = WP_ACCESSORIES_BY_PHASE.hypertrophie.squat || [];
    var names = pool.map(function(a){ return a.name; });
    return {
      hasPresse: names.some(function(n){ return /presse à cuisses/i.test(n); }),
      hasHackSquat: names.some(function(n){ return /hack squat/i.test(n); }),
      hasFentes: names.some(function(n){ return /^fentes/i.test(n); }),
      hasAdduction: names.some(function(n){ return /^adduction/i.test(n); }),
      names: names
    };
  });
  expect(result.hasPresse).toBe(true);
  expect(result.hasHackSquat).toBe(false);
  expect(result.hasFentes).toBe(false);
  expect(result.hasAdduction).toBe(false);
});

test('SQHYP-02 wpApplyImbalanceCorrections Rule 2 → Presse à Cuisses (pas Hack Squat)', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var input = [
      { name: 'Squat', isPrimary: true, sets: [{reps:5,rpe:8,isWarmup:false}] },
      { name: 'Leg Extension', sets: [{reps:12,isWarmup:false}] },
      { name: 'Mollets (Machine)', sets: [{reps:15,isWarmup:false}] }
    ];
    var ratios = { bench_squat: { value: 0.95 } }; // bench/squat > 0.83 → trigger
    var out = wpApplyImbalanceCorrections(input, 'squat', ratios);
    var names = out.map(function(e){ return e.name; });
    return {
      hasHackSquat: names.some(function(n){ return /hack squat/i.test(n); }),
      hasPresse: names.some(function(n){ return /presse à cuisses/i.test(n); }),
      names: names
    };
  });
  expect(result.hasHackSquat).toBe(false);
  expect(result.hasPresse).toBe(true);
});

test('SQHYP-03 Aurélien generateWeeklyPlan → Lundi contient Presse à Cuisses, PAS Hack Squat ni Fentes', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); } catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var lundi = days.find(function(d){ return d.day === 'Lundi' && !d.rest; });
    var names = lundi ? (lundi.exercises || []).map(function(e){ return e.name || ''; }) : [];
    return {
      error: error,
      hasPresse: names.some(function(n){ return /presse à cuisses/i.test(n); }),
      hasHackSquat: names.some(function(n){ return /hack squat/i.test(n); }),
      hasFentes: names.some(function(n){ return /^fentes\b/i.test(n); }),
      names: names
    };
  });
  expect(result.error).toBeNull();
  expect(result.hasPresse).toBe(true);
  expect(result.hasHackSquat).toBe(false);
  expect(result.hasFentes).toBe(false);
});
