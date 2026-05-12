const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';

const AURELIEN_DB = {
  user: {
    name: 'Aurélien', age: 38, bw: 98, height: 178, gender: 'male',
    level: 'avance', trainingMode: 'powerbuilding', onboardingProfile: 'powerlifter',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 90,
    programParams: { freq: 5, goal: 'mixte', goals: ['hypertrophie'], level: 'avance',
      mat: 'salle', cardio: 'integre', duration: 90, injuries: [],
      selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] },
    onboardingPRs: { squat: 148, bench: 140, deadlift: 186 },
    lpStrikes: {}
  },
  bestPR: { squat: 148, bench: 140, deadlift: 186 },
  exercises: {
    'Squat (Barre)':            { e1rm: 157, lastRPE: 7.5 },
    'Développé Couché (Barre)': { e1rm: 148, lastRPE: 7.5 },
    'Soulevé de Terre (Barre)': { e1rm: 200, lastRPE: 7.5 }
  },
  logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0, weeklyPlan: null
};

async function seed(page, db) {
  await page.goto('/', { waitUntil: 'commit' });
  await page.evaluate(([key, data]) => {
    localStorage.setItem(key, JSON.stringify(data));
  }, [STORAGE_KEY, db]);
  await page.reload({ waitUntil: 'load' });
  await page.addStyleTag({ content: '#loginScreen, #onboarding-overlay { display: none !important; }' });
  await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 15000 });
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('v202 — Progression, Phases & Validation Gate', () => {

  test('PROG-01 — main lift allSetsComplete → weight +2.5kg', async ({ page }) => {
    const db = JSON.parse(JSON.stringify(AURELIEN_DB));
    db.logs = [{
      timestamp: Date.now() - 86400000, date: '2026-05-11',
      exercises: [{ name: 'Squat (Barre)', allSets: [
        { weight: 140, reps: 5, isWarmup: false },
        { weight: 140, reps: 5, isWarmup: false },
        { weight: 140, reps: 5, isWarmup: false }
      ]}]
    }];
    await seed(page, db);
    const result = await page.evaluate(() => {
      if (typeof wpDoubleProgressionWeight !== 'function') return { error: 'undef' };
      return wpDoubleProgressionWeight('Squat (Barre)', 3, 5, 1);
    });
    expect(result).toBeTruthy();
    expect(result.weight).toBe(142.5);
    expect(result.progressed).toBe(true);
  });

  test('PROG-02 — main lift 1 strike → maintenir charge', async ({ page }) => {
    const db = JSON.parse(JSON.stringify(AURELIEN_DB));
    db.user.lpStrikes = { 'Squat (Barre)': { count: 1 } };
    db.logs = [{
      timestamp: Date.now() - 86400000, date: '2026-05-11',
      exercises: [{ name: 'Squat (Barre)', allSets: [
        { weight: 140, reps: 3, isWarmup: false },
        { weight: 140, reps: 4, isWarmup: false }
      ]}]
    }];
    await seed(page, db);
    const result = await page.evaluate(() => wpDoubleProgressionWeight('Squat (Barre)', 3, 5, 1));
    expect(result).toBeTruthy();
    expect(result.weight).toBe(140);
    expect(result.progressed).toBe(false);
    expect(result.localDeload).toBeFalsy();
  });

  test('PROG-03 — main lift 2 strikes → deload -10%, reset strikes', async ({ page }) => {
    const db = JSON.parse(JSON.stringify(AURELIEN_DB));
    db.user.lpStrikes = { 'Squat (Barre)': { count: 2 } };
    db.logs = [{
      timestamp: Date.now() - 86400000, date: '2026-05-11',
      exercises: [{ name: 'Squat (Barre)', allSets: [
        { weight: 140, reps: 4, isWarmup: false }
      ]}]
    }];
    await seed(page, db);
    const result = await page.evaluate(() => {
      const r = wpDoubleProgressionWeight('Squat (Barre)', 3, 5, 1);
      return { result: r, strikesAfter: db.user.lpStrikes['Squat (Barre)'] };
    });
    expect(result.result.weight).toBe(125); // 140 * 0.90 = 126 → round25 = 125
    expect(result.result.localDeload).toBe(true);
    expect(result.strikesAfter.count).toBe(0);
  });

  test('PROG-04 — accessoire à targetRepMax → +getDPIncrement(), retour targetRepMin', async ({ page }) => {
    const db = JSON.parse(JSON.stringify(AURELIEN_DB));
    db.logs = [{
      timestamp: Date.now() - 86400000, date: '2026-05-11',
      exercises: [{ name: 'Leg Extension', allSets: [
        { weight: 50, reps: 12, isWarmup: false },
        { weight: 50, reps: 12, isWarmup: false },
        { weight: 50, reps: 12, isWarmup: false }
      ]}]
    }];
    await seed(page, db);
    const result = await page.evaluate(() => wpDoubleProgressionWeight('Leg Extension', 8, 12, 1));
    expect(result).toBeTruthy();
    expect(result.progressed).toBe(true);
    expect(result.reps).toBe(8); // retour targetRepMin
    expect(result.weight).toBeGreaterThan(50); // +getDPIncrement
  });

  test('PROG-05 — speed_deadlift → 60% PR Dead (186kg × 0.60 = 111.75 → round25 = 112.5)', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const result = await page.evaluate(() => {
      if (typeof wpDoubleProgressionWeight !== 'function') return null;
      return wpDoubleProgressionWeight('Speed Deadlift', 1, 1, 1);
    });
    expect(result).toBeTruthy();
    expect(result.weight).toBe(112.5); // round25(186 * 0.60 = 111.6) = 112.5
    expect(result.reps).toBe(1);
  });

  test('BLOCK-01 — BLOCK_DURATION powerbuilding avancé hypertrophie = 4 semaines', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const val = await page.evaluate(() => {
      return typeof BLOCK_DURATION !== 'undefined'
        && BLOCK_DURATION.powerbuilding
        && BLOCK_DURATION.powerbuilding.avance
        && BLOCK_DURATION.powerbuilding.avance.hypertrophie;
    });
    expect(val).toBe(4);
  });

  test('GATE-01 — isEndOfPhaseBlock() après maxWeeks → true', async ({ page }) => {
    const db = JSON.parse(JSON.stringify(AURELIEN_DB));
    db.weeklyPlan = {
      currentBlock: {
        phase: 'hypertrophie',
        blockStartDate: Date.now() - 5 * 7 * 86400000 // 5 semaines passées (> 4 pour avancé)
      }
    };
    await seed(page, db);
    const result = await page.evaluate(() => {
      if (typeof isEndOfPhaseBlock !== 'function') return null;
      return isEndOfPhaseBlock();
    });
    expect(result).toBe(true);
  });

  test('GATE-02 — confirmPhaseTransition(force) → currentBlock.phase = force', async ({ page }) => {
    const db = JSON.parse(JSON.stringify(AURELIEN_DB));
    db.weeklyPlan = { currentBlock: { phase: 'hypertrophie', blockStartDate: Date.now() } };
    await seed(page, db);
    const phase = await page.evaluate(() => {
      if (typeof confirmPhaseTransition !== 'function') return null;
      // Stub modal-overlay removal
      document.querySelectorAll = function() { return []; };
      confirmPhaseTransition('force');
      return db.weeklyPlan && db.weeklyPlan.currentBlock && db.weeklyPlan.currentBlock.phase;
    });
    expect(phase).toBe('force');
  });

});
