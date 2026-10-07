const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_USER = {
  user: {
    name: 'Test', age: 30, bw: 80, height: 175, gender: 'male',
    level: 'intermediaire', trainingMode: 'powerbuilding',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 90, vocabLevel: 2,
    injuries: [], lpActive: true, lpStrikes: {},
    programParams: { freq: 4, goal: 'masse', goals: ['masse'], level: 'intermediaire',
      mat: 'salle', cardio: 'integre', duration: 90, injuries: [], selectedDays: ['Lundi','Mardi','Jeudi','Vendredi'] }
  },
  bestPR: { squat: 100, bench: 80, deadlift: 120 },
  weeklyPlan: null, logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0
};

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => {
    localStorage.setItem(key, JSON.stringify(data));
  }, [STORAGE_KEY, db]);
  await page.reload();
}

test('SHOULDER-01 hasShoulderInjury returns true with active epaule injury', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_USER));
  db.user.injuries = [{ zone: 'epaule', level: 1, active: true, since: null }];
  await setDB(page, db);
  const result = await page.evaluate(() => hasShoulderInjury());
  expect(result).toBe(true);
});

test('SHOULDER-02 applyShoulderFilter replaces Bench Press with Floor Press', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_USER));
  db.user.injuries = [{ zone: 'epaule', active: true }];
  await setDB(page, db);
  const out = await page.evaluate(() => applyShoulderFilter([{ name: 'Bench Press (Barre)' }]));
  expect(out[0].name).toBe('Floor Press');
  expect(out[0]._injuryAdapted).toBe(true);
  expect(out[0]._originalName).toBe('Bench Press (Barre)');
});

test('SHOULDER-03 no injury → exercises unchanged', async ({ page }) => {
  await setDB(page, BASE_USER);
  const out = await page.evaluate(() => applyShoulderFilter([{ name: 'Bench Press (Barre)' }]));
  expect(out[0].name).toBe('Bench Press (Barre)');
  expect(out[0]._injuryAdapted).toBeUndefined();
});

test('INCR-01 getDPIncrement compound upper ~2% with 2.5kg floor', async ({ page }) => {
  await setDB(page, BASE_USER);
  const inc = await page.evaluate(() => getDPIncrement('Rowing Barre', 105));
  expect(inc).toBeGreaterThanOrEqual(2.5);
});

test('INCR-02 getDPIncrement isolation upper min 1kg micro-loading', async ({ page }) => {
  await setDB(page, BASE_USER);
  const inc = await page.evaluate(() => getDPIncrement('Curl Biceps', 15));
  expect(inc).toBeGreaterThanOrEqual(1.0);
});

test('LP-01 beginner + allSetsComplete → +2.5kg simple', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_USER));
  db.user.level = 'debutant';
  db.user.lpActive = true;
  db.logs = [{ timestamp: Date.now(), exercises: [{ name: 'Squat (Barre)',
    allSets: [{ weight: 60, reps: 5, isWarmup: false }, { weight: 60, reps: 5, isWarmup: false }] }] }];
  await setDB(page, db);
  const r = await page.evaluate(() => wpDoubleProgressionWeight('Squat (Barre)', 5, 5));
  expect(r.weight).toBe(62.5);
  expect(r.coachNote).toContain('continue comme ça');
});

test('LP-02 beginner + échec → maintenir', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_USER));
  db.user.level = 'debutant';
  db.user.lpActive = true;
  db.logs = [{ timestamp: Date.now(), exercises: [{ name: 'Squat (Barre)',
    allSets: [{ weight: 60, reps: 5, isWarmup: false }, { weight: 60, reps: 3, isWarmup: false }] }] }];
  await setDB(page, db);
  const r = await page.evaluate(() => wpDoubleProgressionWeight('Squat (Barre)', 5, 5));
  expect(r.weight).toBe(60);
  expect(r.progressed).toBe(false);
  expect(r.coachNote).toContain('Valide toutes les séries');
});

test('CHURN-01 3 identical volume sessions → plateau detected', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_USER));
  const now = Date.now();
  db.logs = [
    { timestamp: now, volume: 5000 },
    { timestamp: now - 86400000, volume: 5050 },
    { timestamp: now - 2*86400000, volume: 4970 }
  ];
  await setDB(page, db);
  const r = await page.evaluate(() => detectSaisiePlateau());
  expect(r).toBe(true);
});
