const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_DB = {
  user: {
    name: 'Test', age: 30, bw: 98, height: 180, gender: 'male',
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

test('BADGE-01 getLiftBadgeTier bench=70 bw=98 → tier 1 (Argent ≈ 75kg)', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  await setDB(page, db);
  const result = await page.evaluate(() => getLiftBadgeTier('bench', 70));
  expect(result.tier).toBe(1);
  expect(result.label).toBe('Argent');
});

test('BADGE-02 bw=0 → fallback to absolute BADGE_THRESHOLDS', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.bw = 0;
  await setDB(page, db);
  const result = await page.evaluate(() => getLiftBadgeTier('bench', 65));
  expect(result.thresholds[0]).toBe(60);
  expect(result.tier).toBe(0);
});

test('WISDOM-01 _deloadAcceptedCount=1 → badge ecoute_corps + 300 wisdomXP', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db._deloadAcceptedCount = 1;
  await setDB(page, db);
  const result = await page.evaluate(() => {
    checkWisdomBadge_Deload();
    return { badge: db.badges && db.badges['ecoute_corps'], xp: db.gamification && db.gamification.wisdomXP };
  });
  expect(result.badge).toBeTruthy();
  expect(result.xp).toBe(300);
});

test('WISDOM-02 readiness scores > 80 × 3 → badge super_recovery', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.readiness = [
    { date: '2026-05-10', score: 85 },
    { date: '2026-05-11', score: 82 },
    { date: '2026-05-12', score: 90 }
  ];
  await setDB(page, db);
  const result = await page.evaluate(() => {
    checkWisdomBadge_Recovery();
    return db.badges && db.badges['super_recovery'];
  });
  expect(result).toBeTruthy();
});

test('PROG-01 getProgressionScore returns signed percent', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  const now = Date.now();
  db.logs = [
    { id: 'old1', timestamp: now - 60 * 86400000, volume: 4000 },
    { id: 'old2', timestamp: now - 50 * 86400000, volume: 4000 },
    { id: 'new1', timestamp: now - 5 * 86400000, volume: 5000 },
    { id: 'new2', timestamp: now - 1 * 86400000, volume: 5000 }
  ];
  await setDB(page, db);
  const score = await page.evaluate(() => getProgressionScore());
  expect(score).toBe(25);
});

test('PROG-02 no logs → getProgressionScore = 0', async ({ page }) => {
  await setDB(page, BASE_DB);
  const score = await page.evaluate(() => getProgressionScore());
  expect(score).toBe(0);
});

test('GHOST-01 setGhostMode(true) → visibility private', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    setGhostMode(true);
    return { ghost: db.user.social.ghostMode, vis: db.user.social.visibility };
  });
  expect(result.ghost).toBe(true);
  expect(result.vis.prs).toBe('private');
  expect(result.vis.feed).toBe('private');
});

test('CHALLENGE-01 level=avance + ratio < 1.20 → ratio_correction challenge', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.level = 'avance';
  db.bestPR = { squat: 140, bench: 130, deadlift: 180 };
  await setDB(page, db);
  const challenges = await page.evaluate(() => generateWisdomChallenges());
  const ratioChallenge = challenges.find(c => c.id === 'ratio_correction');
  expect(ratioChallenge).toBeTruthy();
  expect(ratioChallenge.xpReward).toBe(500);
});
