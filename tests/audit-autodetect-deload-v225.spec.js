const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

function baseDb(overrides) {
  var db = {
    user: {
      name: 'Aurélien', age: 35, bw: 98, height: 178, gender: 'male',
      level: 'avance', trainingMode: 'powerbuilding',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'premium', trainingDuration: 90, vocabLevel: 2,
      programMode: 'auto',
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 5, goal: 'masse', goals: ['masse'], level: 'avance',
        mat: 'salle', duration: 90, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
    },
    bestPR: { squat: 148, bench: 140, deadlift: 186 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
  if (overrides) Object.assign(db, overrides);
  return db;
}

function makeLog(mondayDate, volumeKg, index) {
  var ts = new Date(mondayDate).getTime() + index * 3600000;
  return {
    timestamp: ts,
    exercises: [{
      name: 'Squat (Barre)',
      sets: [
        { weight: volumeKg / 5, reps: 5, isWarmup: false },
        { weight: volumeKg / 5, reps: 5, isWarmup: false },
        { weight: volumeKg / 5, reps: 5, isWarmup: false },
        { weight: volumeKg / 5, reps: 5, isWarmup: false },
        { weight: volumeKg / 5, reps: 5, isWarmup: false }
      ]
    }]
  };
}

function buildDeloadLogs() {
  var logs = [];
  var now = Date.now();
  for (var w = 0; w < 7; w++) {
    var monday = now - (6 - w) * 7 * 86400000;
    var vol = (w === 5) ? 900 : 3000;
    logs.push(makeLog(monday, vol, 0));
  }
  return logs;
}

function buildInjuryLogs() {
  var logs = [];
  var now = Date.now();
  for (var w = 0; w < 6; w++) {
    var monday = now - (5 - w) * 7 * 86400000;
    var vol = (w === 4) ? 500 : 3000;
    logs.push(makeLog(monday, vol, 0));
  }
  return logs;
}

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('DELOAD-01 detectLastDeload CONFIRMED_DELOAD', async ({ page }) => {
  var db = baseDb({ logs: buildDeloadLogs() });
  await setDB(page, db);
  const result = await page.evaluate(() => detectLastDeload());
  expect(result).not.toBeNull();
  expect(result.status).toBe('CONFIRMED_DELOAD');
  expect(result.volumeRatio).toBeLessThan(0.60);
  expect(result.reboundRatio).toBeGreaterThanOrEqual(0.95);
});

test('DELOAD-02 detectLastDeload INJURY_OR_PAUSE', async ({ page }) => {
  var db = baseDb({ logs: buildInjuryLogs() });
  await setDB(page, db);
  const result = await page.evaluate(() => detectLastDeload());
  expect(result).not.toBeNull();
  expect(result.status).toBe('INJURY_OR_PAUSE');
});

test('DELOAD-03 debutant CV>20 returns null', async ({ page }) => {
  var now = Date.now();
  var logs = [];
  var vols = [800, 3200, 500, 2800, 300, 3500, 200];
  for (var w = 0; w < vols.length; w++) {
    logs.push(makeLog(now - (vols.length - 1 - w) * 7 * 86400000, vols[w], 0));
  }
  var db = baseDb({ logs: logs });
  db.user.level = 'debutant';
  await setDB(page, db);
  expect(await page.evaluate(() => detectLastDeload())).toBeNull();
});

test('DELOAD-04 less than 6 logs returns null', async ({ page }) => {
  var now = Date.now();
  var logs = [];
  for (var w = 0; w < 4; w++) logs.push(makeLog(now - (3 - w) * 7 * 86400000, 3000, 0));
  var db = baseDb({ logs: logs });
  await setDB(page, db);
  expect(await page.evaluate(() => detectLastDeload())).toBeNull();
});

test('PROACTIVE-01 renderCoachTodayHTML deload warning banner', async ({ page }) => {
  var db = baseDb();
  db.weeklyPlan = {
    lastDeloadDate: new Date(Date.now() - 10 * 7 * 86400000).toISOString(),
    currentBlock: { phase: 'hypertrophie', week: 2 }
  };
  await setDB(page, db);
  const result = await page.evaluate(() => {
    var html = renderCoachTodayHTML();
    return {
      hasWarning: html.includes('coach-alert--warning'),
      hasDeloadText: /deload recommand/i.test(html),
      hasWeeks: /10.*semaine/i.test(html)
    };
  });
  expect(result.hasWarning).toBe(true);
  expect(result.hasDeloadText).toBe(true);
  expect(result.hasWeeks).toBe(true);
});
