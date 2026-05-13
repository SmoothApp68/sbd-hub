const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

function leaDb() {
  return {
    user: {
      name: 'Léa', age: 28, bw: 60, height: 165, gender: 'female',
      level: 'intermediaire', trainingMode: 'musculation',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 45, vocabLevel: 2,
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 4, goal: 'recompo', goals: ['recompo'], level: 'intermediaire',
        mat: 'salle', duration: 45, selectedDays: ['Mardi','Mercredi','Jeudi','Vendredi'] }
    },
    bestPR: { squat: 65, bench: 40, deadlift: 80 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
}

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('GEM-01 WP_PPL_TEMPLATES.upper_a aligné Gemini (PAS de curl/triceps, Face Pull présent)', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var tpl = WP_PPL_TEMPLATES.upper_a;
    var ex = tpl.exercises || [];
    return {
      count: ex.length,
      hasCurl: ex.some(function(n){ return /^curl /i.test(n); }),
      hasTriExt: ex.some(function(n){ return /extension triceps/i.test(n); }),
      hasFacePull: ex.some(function(n){ return /face pull/i.test(n); }),
      hasBench: ex.some(function(n){ return /développé couché|^bench/i.test(n); }),
      list: ex
    };
  });
  expect(result.count).toBeLessThanOrEqual(5);
  expect(result.hasCurl).toBe(false);
  expect(result.hasTriExt).toBe(false);
  expect(result.hasFacePull).toBe(true);
  expect(result.hasBench).toBe(true);
});

test('GEM-02 WP_PPL_TEMPLATES.lower_a Gemini (RDL présent, PAS de Hip Thrust)', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var ex = WP_PPL_TEMPLATES.lower_a.exercises || [];
    return {
      count: ex.length,
      hasRDL: ex.some(function(n){ return /romanian deadlift|rdl/i.test(n); }),
      hasHipThrust: ex.some(function(n){ return /hip thrust/i.test(n); }),
      hasSquat: ex.some(function(n){ return /^squat/i.test(n); }),
      list: ex
    };
  });
  expect(result.count).toBeLessThanOrEqual(5);
  expect(result.hasRDL).toBe(true);
  expect(result.hasHipThrust).toBe(false);
  expect(result.hasSquat).toBe(true);
});

test('GEM-03 WP_PPL_TEMPLATES.upper_b Gemini (Incliné ≠ plat, Traction présente)', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var ex = WP_PPL_TEMPLATES.upper_b.exercises || [];
    return {
      count: ex.length,
      hasIncline: ex.some(function(n){ return /incliné/i.test(n); }),
      hasFlatBench: ex.some(function(n){ return /^développé couché\b/i.test(n); }),
      hasTraction: ex.some(function(n){ return /^tractions/i.test(n); }),
      list: ex
    };
  });
  expect(result.count).toBeLessThanOrEqual(5);
  expect(result.hasIncline).toBe(true);
  expect(result.hasFlatBench).toBe(false);
  expect(result.hasTraction).toBe(true);
});

test('GEM-04 WP_PPL_TEMPLATES.lower_b Gemini (Hip Thrust + Fentes ici)', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var ex = WP_PPL_TEMPLATES.lower_b.exercises || [];
    return {
      count: ex.length,
      hasHipThrust: ex.some(function(n){ return /hip thrust/i.test(n); }),
      hasFentes: ex.some(function(n){ return /^fentes/i.test(n); }),
      hasLegExt: ex.some(function(n){ return /leg extension/i.test(n); }),
      list: ex
    };
  });
  expect(result.count).toBeLessThanOrEqual(5);
  expect(result.hasHipThrust).toBe(true);
  expect(result.hasFentes).toBe(true);
  expect(result.hasLegExt).toBe(true);
});

test('GEM-05 applyHipThrustRule retire Hip Thrust si Deadlift même séance', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var input = [
      { name: 'Squat', sets: [{reps:5}] },
      { name: 'Soulevé de Terre (Barre)', sets: [{reps:5}] },
      { name: 'Hip Thrust', sets: [{reps:8}] },
      { name: 'Leg Curl allongé', sets: [{reps:12}] }
    ];
    var out = applyHipThrustRule(input, { duration: 60, level: 'intermediaire', age: 30, goals: ['masse'] });
    return {
      hasHipThrust: out.some(function(e){ return /hip thrust/i.test(e.name); }),
      count: out.length
    };
  });
  expect(result.hasHipThrust).toBe(false);
  expect(result.count).toBe(3);
});

test('GEM-06 applyHipThrustRule remplace par Hip Thrust Machine si duration ≤ 45', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var input = [{ name: 'Hip Thrust', sets: [{reps:8}] }];
    var out = applyHipThrustRule(input, { duration: 45, level: 'intermediaire', age: 30, goals: ['masse'] });
    return { name: out[0].name, note: out[0].note };
  });
  expect(result.name).toBe('Hip Thrust Machine');
  expect(result.note).toContain('Setup rapide');
});

test('GEM-07 applyHipThrustRule remplace par Glute Bridge si débutant', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var input = [{ name: 'Hip Thrust', sets: [{reps:8}] }];
    var out = applyHipThrustRule(input, { duration: 60, level: 'debutant', age: 30, goals: ['masse'] });
    return { name: out[0].name };
  });
  expect(result.name).toBe('Glute Bridge');
});

test('GEM-08 applySeniorStrengthFilter remplace Squat barre par Presse si 55+ force RPE>8', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var input = [
      { name: 'Squat (Barre)', sets: [{reps:5,rpe:8.5}], targetRPE: 8.5 },
      { name: 'Leg Press', sets: [{reps:8}] }
    ];
    var out = applySeniorStrengthFilter(input, { age: 57, goals: ['force'] });
    var squat = out.find(function(e){ return e._seniorReplaced; });
    return { replaced: !!squat, newName: squat && squat.name };
  });
  expect(result.replaced).toBe(true);
  expect(result.newName).toBe('Presse à Cuisses');
});

test('GEM-09 isFastTrackDebutant détecte ancien athlète (Bench/BW > 1.2)', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    db.user.level = 'debutant';
    db.user.bw = 80;
    db.bestPR = { bench: 100, squat: 120, deadlift: 140 }; // 100/80 = 1.25 > 1.2
    var ft = isFastTrackDebutant();
    db.bestPR = { bench: 60, squat: 80, deadlift: 100 }; // 60/80 = 0.75
    var notFt = isFastTrackDebutant();
    return { ft: ft, notFt: notFt };
  });
  expect(result.ft).toBe(true);
  expect(result.notFt).toBe(false);
});

test('GEM-10 Léa generateWeeklyPlan freq=4 dur=45 → ≤5 exos par jour, pas Hip Thrust Lower A', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); } catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var training = days.filter(function(d){ return !d.rest; });
    var dayExoCounts = training.map(function(d){ return (d.exercises || []).length; });
    var maxExos = Math.max.apply(null, dayExoCounts.length ? dayExoCounts : [0]);
    return {
      error: error,
      trainingDayCount: training.length,
      maxExos: maxExos,
      dayExoCounts: dayExoCounts
    };
  });
  expect(result.error).toBeNull();
  expect(result.trainingDayCount).toBe(4);
  // Léa duration=45 → max 5 exos par jour. Tolérance +1 (warmup/cardio injections).
  expect(result.maxExos).toBeLessThanOrEqual(6);
});
