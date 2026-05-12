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

test('DEBRIEF-01 vocabLevel=3 → tonnage line with vs séance précédente', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.vocabLevel = 3;
  db.logs = [{ id: 'old', title: 'Squat', timestamp: Date.now() - 7 * 86400000, volume: 5000, exercises: [] }];
  await setDB(page, db);
  const lines = await page.evaluate(() => {
    var session = { id: 'new', title: 'Squat', volume: 5500, exercises: [] };
    saveAlgoDebrief(session);
    return session.debrief.lines;
  });
  expect(lines.some(l => /vs séance précédente/.test(l))).toBe(true);
});

test('DEBRIEF-02 vocabLevel=1 → record line or completion message', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.vocabLevel = 1;
  await setDB(page, db);
  const lines = await page.evaluate(() => {
    var session = { id: 'new', title: 'Squat', volume: 4000, exercises: [] };
    saveAlgoDebrief(session);
    return session.debrief.lines;
  });
  expect(lines.some(l => /Séance complétée|Nouveau record/.test(l))).toBe(true);
});

test('DEBRIEF-03 SNC alert when neural fatigue ≥ 0.75 confidence', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.vocabLevel = 3;
  await setDB(page, db);
  const lines = await page.evaluate(() => {
    var session = { id: 'new', title: 'Squat', volume: 5000, exercises: [
      { name: 'Squat', allSets: [{ fatigueType: 'neural', fatigueConfidence: 0.85, weight: 100, reps: 5 }] }
    ]};
    saveAlgoDebrief(session);
    return session.debrief.lines;
  });
  expect(lines.some(l => /SNC : Récupération requise/.test(l))).toBe(true);
});

test('DEBRIEF-04 bottom sheet auto-closes after 15s', async ({ page }) => {
  await setDB(page, BASE_DB);
  await page.evaluate(() => {
    _showDebriefSheet(['ligne 1', 'ligne 2']);
  });
  expect(await page.locator('.modal-overlay').count()).toBe(1);
  await page.waitForTimeout(15500);
  expect(await page.locator('.modal-overlay').count()).toBe(0);
});

test('ONBOARD-01 showOnboardingComplete renders modal with Voir programme button', async ({ page }) => {
  await setDB(page, BASE_DB);
  await page.evaluate(() => showOnboardingComplete());
  const modalText = await page.locator('.modal-overlay').textContent();
  expect(modalText).toContain('Voir mon programme');
  expect(modalText).toContain('Lancer maintenant');
});

test('ONBOARD-02 powerlifting + no compDate + 30 days → nudge in alerts', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.trainingMode = 'powerlifting';
  db.user.programParams.compDate = null;
  db._lastCompDateNudge = Date.now() - 31 * 86400000;
  await setDB(page, db);
  const html = await page.evaluate(() => renderCoachTodayHTML());
  expect(html).toContain('Compétition prévue');
});

test('COMP-01 generateCompPeakingPlan → 5-phase schedule', async ({ page }) => {
  await setDB(page, BASE_DB);
  const r = await page.evaluate(() => {
    var d = new Date();
    d.setDate(d.getDate() + 60);
    return generateCompPeakingPlan(d.toISOString().split('T')[0]);
  });
  expect(r).not.toBeNull();
  expect(r.schedule.length).toBe(5);
  expect(r.schedule[0].label).toBe('Accumulation');
});

test('COMP-02 daysToComp=2 → readinessAlert contains ZÉRO Bench', async ({ page }) => {
  await setDB(page, BASE_DB);
  const r = await page.evaluate(() => {
    var d = new Date();
    d.setDate(d.getDate() + 2);
    return generateCompPeakingPlan(d.toISOString().split('T')[0]);
  });
  expect(r.readinessAlert).toContain('ZÉRO Bench');
});
