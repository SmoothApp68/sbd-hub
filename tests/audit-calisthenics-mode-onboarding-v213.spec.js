const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_DB = {
  user: {
    name: 'Test', age: 28, bw: 75, height: 175, gender: 'male',
    level: 'intermediaire', trainingMode: 'musculation',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 60, vocabLevel: 2,
    injuries: [], lpActive: true, lpStrikes: {}, onboardingDate: null,
    cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
    programParams: { freq: 3, goal: 'masse', goals: ['masse'],
      level: 'intermediaire', mat: 'salle', duration: 60,
      selectedDays: ['Lundi', 'Mercredi', 'Vendredi'] }
  },
  bestPR: { squat: 80, bench: 70, deadlift: 100 },
  exercises: {},
  readiness: [], weeklyPlan: null, logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0,
  routine: {}
};

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('CALI-01 selectTrainingMode calisthenics → _obSelectedMode=calisthenics + db.user.trainingMode=calisthenics', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    // Simulate clicking the calisthenics mode button
    selectTrainingMode('calisthenics');
    return {
      obSelectedMode: typeof _obSelectedMode !== 'undefined' ? _obSelectedMode : null,
      dbMode: db.user.trainingMode
    };
  });
  expect(result.obSelectedMode).toBe('calisthenics');
  expect(result.dbMode).toBe('calisthenics');
});

test('CALI-02 obQ3SelectMat salle ne réinitialise pas calisthenics si choix explicite mode grid', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    // User explicitly picks calisthenics in mode grid
    selectTrainingMode('calisthenics');
    // Then picks salle equipment
    obQ3SelectMat('salle', null);
    return {
      trainingMode: db.user.trainingMode
    };
  });
  // Must NOT revert to musculation
  expect(result.trainingMode).toBe('calisthenics');
});
