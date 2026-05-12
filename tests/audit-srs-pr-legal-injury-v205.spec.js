const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_DB = {
  user: {
    name: 'Test', age: 30, bw: 80, height: 175, gender: 'male',
    level: 'intermediaire', trainingMode: 'powerbuilding',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 90, vocabLevel: 2,
    injuries: [], lpActive: true, lpStrikes: {},
    cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
    programParams: { freq: 4, goal: 'masse', level: 'intermediaire', mat: 'salle' }
  },
  bestPR: { squat: 100, bench: 80, deadlift: 120 },
  readiness: [], weeklyPlan: null, logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0
};

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('SRS-01 computeAdaptiveSRSThreshold < 10 sessions → mode=fixed threshold=45', async ({ page }) => {
  await setDB(page, BASE_DB);
  const r = await page.evaluate(() => computeAdaptiveSRSThreshold());
  expect(r.mode).toBe('fixed');
  expect(r.threshold).toBe(45);
});

test('SRS-02 computeAdaptiveSRSThreshold 30 sessions → mode=stable, threshold < 70', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  for (var i = 0; i < 30; i++) {
    db.readiness.push({ date: '2026-04-' + String(i + 1).padStart(2, '0'), score: 60 + (i % 10) });
  }
  await setDB(page, db);
  const r = await page.evaluate(() => computeAdaptiveSRSThreshold());
  expect(r.mode).toBe('stable');
  expect(r.threshold).toBeLessThan(70);
});

test('SRS-03 getCyclePhaseModifier day 26 → +10', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  const d = new Date();
  d.setDate(d.getDate() - 25);
  db.user.cycleTracking = { enabled: true, lastPeriodDate: d.toISOString().split('T')[0], cycleLength: 28 };
  await setDB(page, db);
  const r = await page.evaluate(() => getCyclePhaseModifier());
  expect(r).toBe(10);
});

test('SRS-04 getCyclePhaseModifier disabled → 0', async ({ page }) => {
  await setDB(page, BASE_DB);
  const r = await page.evaluate(() => getCyclePhaseModifier());
  expect(r).toBe(0);
});

test('PR-01 calcBrzycki(100, 5) → ~111.5kg', async ({ page }) => {
  await setDB(page, BASE_DB);
  const r = await page.evaluate(() => calcBrzycki(100, 5));
  expect(r).toBeGreaterThan(110);
  expect(r).toBeLessThan(114);
});

test('PR-02 calcBrzycki(100, 10) → null (reps > 8)', async ({ page }) => {
  await setDB(page, BASE_DB);
  const r = await page.evaluate(() => calcBrzycki(100, 10));
  expect(r).toBeNull();
});

test('INJURY-01 checkInjuryPersistence level=2 since=15 days → alert', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  const sinceDate = new Date(Date.now() - 15 * 86400000).toISOString();
  db.user.injuries = [{ zone: 'epaule', level: 2, active: true, since: sinceDate }];
  await setDB(page, db);
  const r = await page.evaluate(() => checkInjuryPersistence());
  expect(r).not.toBeNull();
  expect(r.length).toBe(1);
});

test('INJURY-02 checkInjuryPersistence level=1 → no alert', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  const sinceDate = new Date(Date.now() - 20 * 86400000).toISOString();
  db.user.injuries = [{ zone: 'epaule', level: 1, active: true, since: sinceDate }];
  await setDB(page, db);
  const r = await page.evaluate(() => checkInjuryPersistence());
  expect(r).toBeNull();
});

test('CONSENT-01 validateConsent without checkboxes → toast error (no save)', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.consentHealth = false;
  db.user.medicalConsent = false;
  await setDB(page, db);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend',
      '<input type="checkbox" id="consent-effort"><input type="checkbox" id="consent-data">');
    validateConsent();
  });
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
  expect(saved.user.consentHealth).toBe(false);
});

test('E1RM-01 getE1RMDisplay(100, 5) → reliable=true', async ({ page }) => {
  await setDB(page, BASE_DB);
  const r = await page.evaluate(() => getE1RMDisplay(100, 5));
  expect(r.reliable).toBe(true);
  expect(r.label).toBe('e1RM estimé');
});

test('E1RM-02 getE1RMDisplay(100, 12) → reliable=false indicative', async ({ page }) => {
  await setDB(page, BASE_DB);
  const r = await page.evaluate(() => getE1RMDisplay(100, 12));
  expect(r.reliable).toBe(false);
  expect(r.label).toBe('Estimation indicative');
});
