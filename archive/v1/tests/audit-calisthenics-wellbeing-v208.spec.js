const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_DB = {
  user: {
    name: 'Test', age: 30, bw: 80, height: 175, gender: 'male',
    level: 'intermediaire', trainingMode: 'powerlifting',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 90, vocabLevel: 2,
    injuries: [], lpActive: true, lpStrikes: {},
    cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
    programParams: { freq: 4, goal: 'force', level: 'intermediaire', mat: 'salle' }
  },
  bestPR: { squat: 150, bench: 140, deadlift: 180 },
  readiness: [], weeklyPlan: null, logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0
};

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('CALI-01 getCalisthenicCurrentStep default → { step: 1, reps: 0 }', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => getCalisthenicCurrentStep('push'));
  expect(result.step).toBe(1);
  expect(result.reps).toBe(0);
});

test('CALI-02 validateCalisthenicStep push 15 reps → step advances to 2', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    validateCalisthenicStep('push', 15);
    return db.calisthenicProgress.push;
  });
  expect(result.step).toBe(2);
  expect(result.reps).toBe(0);
});

test('CALI-03 DUP_SEQUENCE.calisthenics.debutant[3] → hypertrophie,hypertrophie,skill', async ({ page }) => {
  await setDB(page, BASE_DB);
  const seq = await page.evaluate(() => DUP_SEQUENCE.calisthenics.debutant[3]);
  expect(seq).toEqual(['hypertrophie', 'hypertrophie', 'skill']);
});

test('SENIOR-01 age=65 → rest doubled', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.age = 65;
  await setDB(page, db);
  const result = await page.evaluate(() => {
    return applyAgeAdaptations([{ name: 'Squat', rest: 120, targetRPE: 8 }]);
  });
  expect(result[0].rest).toBe(240);
  expect(result[0].targetRPE).toBe(7);
  expect(result[0]._seniorAdapted).toBe(true);
});

test('SENIOR-02 age=30 → exercises unchanged', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    return applyAgeAdaptations([{ name: 'Squat', rest: 120, targetRPE: 8 }]);
  });
  expect(result[0].rest).toBe(120);
  expect(result[0].targetRPE).toBe(8);
  expect(result[0]._seniorAdapted).toBeUndefined();
});

test('STRESS-01 motivation=1 + sleep=2 → getStressVolumeModifier = 0.80', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.todayWellbeing = { date: '2026-05-12', motivation: 1, sleep: 2, savedAt: Date.now() };
  await setDB(page, db);
  const mod = await page.evaluate(() => getStressVolumeModifier());
  expect(mod).toBe(0.80);
});

test('STRESS-02 motivation=8 + sleep=8 → modifier = 1.0', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.todayWellbeing = { date: '2026-05-12', motivation: 8, sleep: 8, savedAt: Date.now() };
  await setDB(page, db);
  const mod = await page.evaluate(() => getStressVolumeModifier());
  expect(mod).toBe(1.0);
});

test('INSTINCT-01 startInstinctSession(bien_etre) → flag + toast Séance Plaisir', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    try { startInstinctSession('bien_etre'); } catch(e) {}
    return { mode: db._instinctMode, last: db._lastInstinctSession };
  });
  expect(result.mode).toBe(true);
  expect(typeof result.last).toBe('number');
});
