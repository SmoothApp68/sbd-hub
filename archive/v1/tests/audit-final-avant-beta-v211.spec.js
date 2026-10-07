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

test('PRIO-01 isPrimary → priority 100 (top niveau)', async ({ page }) => {
  await setDB(page, BASE_DB);
  const score = await page.evaluate(() => {
    return _getExercisePriority({ name: 'Squat', isPrimary: true });
  });
  expect(score).toBe(100);
});

test('PRIO-02 _addedByRule=2 → priority 60 (structure)', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    return {
      structure: _getExercisePriority({ name: 'Face Pull', _addedByRule: 2 }),
      correctif: _getExercisePriority({ name: 'Leg Extension', _addedByRule: 5 }),
      injury:    _getExercisePriority({ name: 'Floor Press', _injuryAdapted: true }),
      iso:       _getExercisePriority({ name: 'Curl Biceps' })
    };
  });
  expect(result.structure).toBe(60);
  expect(result.correctif).toBe(40);
  expect(result.injury).toBe(80);
  expect(result.iso).toBe(20);
});

test('KNEE-01 injury=genou → Sissy Squat remplacé', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.injuries = [{ zone: 'genou', active: true, level: 2 }];
  await setDB(page, db);
  const result = await page.evaluate(() => {
    return applyKneeFilter([
      { name: 'Sissy Squat', sets: 3, reps: '10' },
      { name: 'Squat', sets: 4, reps: '6', isPrimary: true }
    ]);
  });
  const sissy = result.find(e => /Sissy/i.test(e.name));
  expect(sissy).toBeUndefined();
  const substitute = result.find(e => e._injurySubstitute);
  expect(substitute).toBeTruthy();
  expect(substitute.name).toContain('Leg Extension');
});

test('KNEE-02 injury=genou → Box Jump remplacé par Box Squat', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.injuries = [{ zone: 'genou', active: true, level: 1 }];
  await setDB(page, db);
  const result = await page.evaluate(() => {
    return applyKneeFilter([
      { name: 'Box Jump', sets: 4, reps: '5' }
    ]);
  });
  expect(result.length).toBe(1);
  expect(result[0].name).toContain('Box Squat');
  expect(result[0]._injurySubstitute).toBe(true);
});

test('KNEE-03 pas de blessure genou → exercices inchangés', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    return applyKneeFilter([
      { name: 'Sissy Squat', sets: 3, reps: '10' },
      { name: 'Box Jump',    sets: 4, reps: '5' }
    ]);
  });
  expect(result.length).toBe(2);
  expect(result[0].name).toBe('Sissy Squat');
  expect(result[1].name).toBe('Box Jump');
});

test('TALK-01 hasPRData()=false → getTalkTestInstruction() non vide', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.bestPR = {};
  await setDB(page, db);
  const result = await page.evaluate(() => {
    return { has: hasPRData(), text: getTalkTestInstruction('Squat (Barre)') };
  });
  expect(result.has).toBe(false);
  expect(result.text).toContain('10 reps');
  expect(result.text.length).toBeGreaterThan(50);
});

test('PIVOT-01 currentBlock.week=12 → isPivotWeek() true', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.weeklyPlan = { currentBlock: { phase: 'hypertrophie', week: 12 } };
  await setDB(page, db);
  const result = await page.evaluate(() => isPivotWeek());
  expect(result).toBe(true);
});

test('PIVOT-02 currentBlock.week=8 → isPivotWeek() false', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.weeklyPlan = { currentBlock: { phase: 'force', week: 8 } };
  await setDB(page, db);
  const result = await page.evaluate(() => isPivotWeek());
  expect(result).toBe(false);
});

test('PIVOT-03 applyPivotWeekSwaps() → High Bar Squat remplacé', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.weeklyPlan = { currentBlock: { phase: 'hypertrophie', week: 24 } };
  await setDB(page, db);
  const result = await page.evaluate(() => {
    return applyPivotWeekSwaps([
      { name: 'High Bar Squat', sets: 4, reps: '7', isPrimary: true }
    ]);
  });
  expect(result.length).toBe(1);
  expect(result[0]._pivotWeekSwap).toBe(true);
  expect(result[0]._originalName).toBe('High Bar Squat');
  expect(['Goblet Squat', 'Bulgarian Split Squat']).toContain(result[0].name);
});

test('OVERREACH-01 _completedMacrocycles=2 + ratio≤1.10 → trigger true', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.weeklyPlan = { _completedMacrocycles: 2, currentBlock: { phase: 'hypertrophie' } };
  db.bestPR = { squat: 148, bench: 140, deadlift: 170 };
  await setDB(page, db);
  const result = await page.evaluate(() => {
    return {
      trigger: shouldTriggerLegOverreach(),
      mods: getLegOverreachModifiers()
    };
  });
  expect(result.trigger).toBe(true);
  expect(result.mods).toBeTruthy();
  expect(result.mods.legsVolumeMultiplier).toBe(1.30);
  expect(result.mods.benchVolumeMultiplier).toBe(0.60);
});
