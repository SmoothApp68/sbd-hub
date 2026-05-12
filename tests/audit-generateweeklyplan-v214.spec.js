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
  exercises: {},
  readiness: [], weeklyPlan: null, logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0,
  routine: {}
};

// Log avec exercises undefined pour tester le guard
const DB_WITH_MALFORMED_LOG = Object.assign({}, BASE_DB, {
  logs: [
    { date: '2026-05-01', exercises: undefined, duration: 60 },
    { date: '2026-05-03', exercises: null, duration: 45 }
  ]
});

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('WP-01 generateWeeklyPlan powerbuilding avancé freq=5 — days populated', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    generateWeeklyPlan();
    var plan = db.weeklyPlan;
    if (!plan || !Array.isArray(plan.days)) return { ok: false, error: 'no days array' };
    var trainingDays = plan.days.filter(function(d) { return !d.rest; });
    var emptyDays = trainingDays.filter(function(d) { return !d.exercises || d.exercises.length === 0; });
    return {
      ok: true,
      totalDays: plan.days.length,
      trainingDayCount: trainingDays.length,
      emptyDayCount: emptyDays.length,
      emptyDayTitles: emptyDays.map(function(d) { return d.title || d.day; })
    };
  });
  expect(result.ok).toBe(true);
  expect(result.trainingDayCount).toBe(5);
  // Aucun jour d'entraînement ne doit avoir exercises:[]
  expect(result.emptyDayCount).toBe(0);
});

test('WP-02 computeStrengthRatios — ne crash pas sur log.exercises undefined', async ({ page }) => {
  await setDB(page, DB_WITH_MALFORMED_LOG);
  const result = await page.evaluate(() => {
    var error = null;
    var ratios = null;
    try {
      ratios = computeStrengthRatios();
    } catch(e) {
      error = String(e);
    }
    return { error: error, ratiosType: typeof ratios };
  });
  // Doit retourner sans erreur
  expect(result.error).toBeNull();
  expect(result.ratiosType).toBe('object');
});
