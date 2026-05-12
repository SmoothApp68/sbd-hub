const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_DB = {
  user: {
    name: 'Test', age: 30, bw: 80, height: 175, gender: 'male',
    level: 'intermediaire', trainingMode: 'musculation',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 90, vocabLevel: 2,
    injuries: [], lpActive: true, lpStrikes: {}, onboardingDate: null,
    cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
    programParams: { freq: 4, goal: 'force', level: 'intermediaire', mat: 'salle' }
  },
  bestPR: { squat: 150, bench: 120, deadlift: 180 },
  exercises: {},
  readiness: [], weeklyPlan: null, logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0
};

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('RULE8-01 legCurl/legExt < 0.75 → Leg Curl Assis correctif', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    const exos = [
      { name: 'Squat', sets: 4, isPrimary: true, muscleGroup: 'quad' },
      { name: 'Bench Press', sets: 4, muscleGroup: 'chest' }
    ];
    return selectExercisesForProfile(exos, {
      duration: 90, mode: 'musculation', age: 30,
      stats: { legCurlE1RM: 50, legExtE1RM: 100 }
    });
  });
  const nordic = result.find(e => /Leg Curl|Nordic/i.test(e.name));
  expect(nordic).toBeTruthy();
  expect(nordic.isCorrectivePriority).toBe(true);
  expect(nordic._addedByRule).toBe(8);
});

test('RULE8-02 legCurl/legExt ≥ 0.75 → no Nordic Curl added', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    const exos = [
      { name: 'Squat', sets: 4, isPrimary: true, muscleGroup: 'quad' }
    ];
    return selectExercisesForProfile(exos, {
      duration: 90, mode: 'musculation', age: 30,
      stats: { legCurlE1RM: 80, legExtE1RM: 100 }
    });
  });
  const added = result.find(e => e._addedByRule === 8);
  expect(added).toBeUndefined();
});

test('RULE9-01 isPrimary Bench 4 sets → Face Pull added (1 set per 3)', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    const exos = [
      { name: 'Bench Press', sets: 5, isPrimary: true, muscleGroup: 'chest' },
      { name: 'Rowing Barre', sets: 4, muscleGroup: 'back' }
    ];
    return selectExercisesForProfile(exos, { duration: 90, mode: 'musculation', age: 30 });
  });
  const facePull = result.find(e => /Face Pull/i.test(e.name));
  expect(facePull).toBeTruthy();
  expect(facePull.sets).toBeGreaterThanOrEqual(1);
});

test('RULE9-02 no Bench primary → no Face Pull added by rule 9', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    const exos = [
      { name: 'Squat', sets: 4, isPrimary: true, muscleGroup: 'quad' },
      { name: 'Rowing Barre', sets: 4, muscleGroup: 'back' }
    ];
    return selectExercisesForProfile(exos, { duration: 90, mode: 'musculation', age: 30 });
  });
  const facePullByRule9 = result.find(e => /Face Pull/i.test(e.name) && e._addedByRule === 9);
  expect(facePullByRule9).toBeUndefined();
});

test('BANNER-01 onboardingDate < 7d → banner rendered', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.onboardingDate = new Date(Date.now() - 3 * 86400000).toISOString();
  await setDB(page, db);
  const html = await page.evaluate(() => showDataGapBanner());
  expect(html).toContain('Semaine 1');
  expect(html).toContain('apprentissage');
});

test('BANNER-02 onboardingDate > 7d → empty string', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.onboardingDate = new Date(Date.now() - 30 * 86400000).toISOString();
  await setDB(page, db);
  const html = await page.evaluate(() => showDataGapBanner());
  expect(html).toBe('');
});

test('RAMP-01 sessionCount=1 → double increment', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    const base = getDPIncrement('Squat (Barre)', 0);
    const ramp = getBeginnerRampIncrement('Squat (Barre)', 1);
    return { base, ramp };
  });
  expect(result.ramp).toBe(result.base * 2);
});

test('RAMP-02 sessionCount=3 → null (back to LP)', async ({ page }) => {
  await setDB(page, BASE_DB);
  const ramp = await page.evaluate(() => getBeginnerRampIncrement('Squat (Barre)', 3));
  expect(ramp).toBeNull();
});
