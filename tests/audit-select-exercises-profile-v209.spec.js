const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

const BASE_DB = {
  user: {
    name: 'Test', age: 30, bw: 80, height: 175, gender: 'male',
    level: 'intermediaire', trainingMode: 'musculation',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 90, vocabLevel: 2,
    injuries: [], lpActive: true, lpStrikes: {},
    cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
    programParams: { freq: 4, goal: 'force', level: 'intermediaire', mat: 'salle' }
  },
  bestPR: { squat: 150, bench: 120, deadlift: 180 },
  readiness: [], weeklyPlan: null, logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0
};

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('RULE1-01 duration=45, mode=musculation → max 4 exos', async ({ page }) => {
  await setDB(page, BASE_DB);
  const len = await page.evaluate(() => {
    const exos = [
      { name: 'Squat', sets: 4, isPrimary: true, muscleGroup: 'quad' },
      { name: 'Bench Press', sets: 4, muscleGroup: 'chest' },
      { name: 'Rowing Barre', sets: 4, muscleGroup: 'back' },
      { name: 'Curl Marteau', sets: 3, muscleGroup: 'biceps' },
      { name: 'Extension Triceps', sets: 3, muscleGroup: 'triceps' },
      { name: 'Élévations Latérales', sets: 3, muscleGroup: 'shoulder' }
    ];
    return selectExercisesForProfile(exos, { duration: 45, mode: 'musculation', age: 30 }).length;
  });
  expect(len).toBeLessThanOrEqual(4);
});

test('RULE1-02 duration=120, mode=powerlifting → max 6 exos', async ({ page }) => {
  await setDB(page, BASE_DB);
  const len = await page.evaluate(() => {
    const exos = Array.from({ length: 10 }, (_, i) => ({ name: 'Exo' + i, sets: 3, muscleGroup: 'back' }));
    exos[0].name = 'Squat'; exos[0].isPrimary = true; exos[0].muscleGroup = 'quad';
    return selectExercisesForProfile(exos, { duration: 120, mode: 'powerlifting', age: 30 }).length;
  });
  expect(len).toBeLessThanOrEqual(6);
});

test('RULE2-01 injury=shoulder → pull ratio 1.5 → Face Pull added', async ({ page }) => {
  await setDB(page, BASE_DB);
  const names = await page.evaluate(() => {
    const exos = [
      { name: 'Bench Press', sets: 4, muscleGroup: 'chest' },
      { name: 'OHP', sets: 4, muscleGroup: 'shoulder' },
      { name: 'Rowing Barre', sets: 3, muscleGroup: 'back' }
    ];
    return selectExercisesForProfile(exos, { duration: 90, mode: 'musculation', injury: 'shoulder', age: 30 })
      .map(e => e.name);
  });
  expect(names.some(n => /Face Pull/i.test(n))).toBe(true);
});

test('RULE2-02 push-heavy ratio < 1.2 → Rowing added', async ({ page }) => {
  await setDB(page, BASE_DB);
  const names = await page.evaluate(() => {
    const exos = [
      { name: 'Bench Press', sets: 4, muscleGroup: 'chest' },
      { name: 'OHP', sets: 4, muscleGroup: 'shoulder' },
      { name: 'Dips', sets: 3, muscleGroup: 'chest' }
    ];
    return selectExercisesForProfile(exos, { duration: 90, mode: 'musculation', age: 30 })
      .map(e => e.name);
  });
  expect(names.some(n => /Rowing/i.test(n))).toBe(true);
});

test('RULE3-01 mode=powerlifting → Écarté Machine retiré', async ({ page }) => {
  await setDB(page, BASE_DB);
  const names = await page.evaluate(() => {
    const exos = [
      { name: 'Squat', sets: 5, isPrimary: true, muscleGroup: 'quad' },
      { name: 'Bench Press', sets: 5, muscleGroup: 'chest' },
      { name: 'Écarté Machine', sets: 3, muscleGroup: 'chest' }
    ];
    return selectExercisesForProfile(exos, { duration: 90, mode: 'powerlifting', age: 30 })
      .map(e => e.name);
  });
  expect(names.some(n => /Écarté Machine/i.test(n))).toBe(false);
});

test('RULE3-02 powerlifting + isCorrectivePriority → Leg Extension conservé', async ({ page }) => {
  await setDB(page, BASE_DB);
  const names = await page.evaluate(() => {
    const exos = [
      { name: 'Squat', sets: 5, isPrimary: true, muscleGroup: 'quad' },
      { name: 'Leg Extension', sets: 3, isCorrectivePriority: true, muscleGroup: 'quad' }
    ];
    return selectExercisesForProfile(exos, { duration: 90, mode: 'powerlifting', age: 30 })
      .map(e => e.name);
  });
  expect(names.some(n => /Leg Extension/i.test(n))).toBe(true);
});

test('RULE4-01 duration=45 → Deadlift retiré, RDL ajouté', async ({ page }) => {
  await setDB(page, BASE_DB);
  const names = await page.evaluate(() => {
    const exos = [
      { name: 'Squat', sets: 4, muscleGroup: 'quad' },
      { name: 'Soulevé de Terre', sets: 3, muscleGroup: 'back' },
      { name: 'Bench Press', sets: 4, muscleGroup: 'chest' }
    ];
    return selectExercisesForProfile(exos, { duration: 45, mode: 'musculation', age: 30 })
      .map(e => e.name);
  });
  expect(names.some(n => /^Soulevé de Terre$/i.test(n))).toBe(false);
  expect(names.some(n => /RDL|Roumain/i.test(n))).toBe(true);
});

test('RULE5-01 squatBenchRatio=1.06 → Leg Extension isCorrectivePriority', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    const exos = [
      { name: 'Squat', sets: 4, isPrimary: true, muscleGroup: 'quad' },
      { name: 'Bench Press', sets: 4, muscleGroup: 'chest' }
    ];
    return selectExercisesForProfile(exos, {
      duration: 90, mode: 'musculation', age: 30,
      stats: { squatBenchRatio: 1.06 }
    });
  });
  const legExt = result.find(e => /Leg Extension/i.test(e.name));
  expect(legExt).toBeTruthy();
  expect(legExt.isCorrectivePriority).toBe(true);
});

test('RULE5-02 rowBenchRatio=0.85 → Rowing Barre isCorrectivePriority', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    const exos = [
      { name: 'Bench Press', sets: 4, muscleGroup: 'chest' }
    ];
    return selectExercisesForProfile(exos, {
      duration: 90, mode: 'musculation', age: 30,
      stats: { rowBenchRatio: 0.85 }
    });
  });
  const row = result.find(e => /Rowing Barre/i.test(e.name));
  expect(row).toBeTruthy();
  expect(row.isCorrectivePriority).toBe(true);
});

test('RULE6-01 injury=shoulder + Bench → maxRPE=7 applied', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    const exos = [
      { name: 'Bench Press', sets: 4, muscleGroup: 'chest' },
      { name: 'Rowing Barre', sets: 3, muscleGroup: 'back' }
    ];
    return selectExercisesForProfile(exos, {
      duration: 90, mode: 'musculation', injury: 'shoulder', age: 30
    });
  });
  const bench = result.find(e => /Bench/i.test(e.name));
  expect(bench).toBeTruthy();
  expect(bench.maxRPE).toBe(7);
  expect(bench._injuryCapApplied).toBe(true);
});
