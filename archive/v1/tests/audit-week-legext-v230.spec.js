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

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

// ── WEEK-01 : lastDeloadDate 27 avr → postLoginSync → currentBlock.week = 2 ──
// lastDeloadDate=27 avr + blockStartDate=4 mai, aujourd'hui = ~13 mai
// weeksSince depuis lastDeloadDate = round(16j/7) = 2 → S2 (Force)
// weeksSince depuis blockStartDate = round(9j/7) = 1 → S1 ❌
test('WEEK-01 wpDetectPhase lit lastDeloadDate (2.3w) et non blockStartDate (1.3w)', async ({ page }) => {
  var now = Date.now();
  // lastDeloadDate = 16 jours avant aujourd'hui (≈ 2.28 semaines → round = 2)
  var lastDeloadDate = new Date(now - 16 * 86400000).toISOString();
  // blockStartDate = 9 jours avant aujourd'hui (≈ 1.29 semaines → round = 1)
  var blockStartDate = now - 9 * 86400000;

  var db = baseDb({
    weeklyPlan: {
      lastDeloadDate: lastDeloadDate,
      currentBlock: {
        phase: 'hypertrophie',
        week: 1,
        blockStartDate: blockStartDate
      }
    }
  });
  await setDB(page, db);

  var result = await page.evaluate(() => {
    if (typeof wpDetectPhase !== 'function') return null;
    wpDetectPhase();
    var cb = db && db.weeklyPlan && db.weeklyPlan.currentBlock;
    return cb ? { phase: cb.phase, week: cb.week } : null;
  });

  expect(result).not.toBeNull();
  // Semaine 2 (depuis lastDeloadDate = 2.28w → round = 2)
  // La phase peut être 'hypertrophie' ou 'force' selon les durées
  expect(result.week).toBe(2);
});

// ── WEEK-02 : pas de lastDeloadDate → fallback blockStartDate → pas de crash ──
test('WEEK-02 wpDetectPhase sans lastDeloadDate → blockStartDate fallback, pas de crash', async ({ page }) => {
  var now = Date.now();
  // Pas de lastDeloadDate, blockStartDate = 3 semaines
  var blockStartDate = now - 21 * 86400000; // 3 semaines → weeksSince = 3

  var db = baseDb({
    weeklyPlan: {
      currentBlock: {
        phase: 'hypertrophie',
        week: 1,
        blockStartDate: blockStartDate
      }
    }
  });
  await setDB(page, db);

  var result = await page.evaluate(() => {
    if (typeof wpDetectPhase !== 'function') return { error: 'wpDetectPhase missing' };
    try {
      var phase = wpDetectPhase();
      var cb = db && db.weeklyPlan && db.weeklyPlan.currentBlock;
      return { phase: phase, week: cb ? cb.week : null, ok: true };
    } catch(e) {
      return { error: e.message };
    }
  });

  expect(result.ok).toBe(true);
  expect(result.week).toBeGreaterThanOrEqual(1);
  expect(result.phase).toBeTruthy();
});

// ── LEGEXT-01 : dayType='bench_hyp' → Leg Extension NON injecté ──
// squatBenchRatio = 148/140 = 1.057 < seuil powerbuilding 1.25
// Sans filtre : Leg Extension injecté partout. Avec filtre : uniquement sur squat/lower.
test('LEGEXT-01 selectExercisesForProfile ne pas injecter Leg Extension sur bench_hyp', async ({ page }) => {
  var db = baseDb();
  // bestPR : squatBenchRatio = 148/140 = 1.057 < 1.25 → correction déclenchée sans filtre
  await setDB(page, db);

  var result = await page.evaluate(() => {
    if (typeof selectExercisesForProfile !== 'function') return null;
    if (typeof buildProfileForSelection !== 'function') return null;
    // Profil avec dayType = bench press day
    var profile = buildProfileForSelection();
    profile.dayType = 'bench_hyp';
    var exercises = [
      { name: 'Développé Couché (Barre)', isPrimary: true, sets: 4, reps: '5', rpe: 8, isWarmup: false }
    ];
    var result = selectExercisesForProfile(exercises, profile);
    var hasLegExt = result.some(function(e) {
      return (e.name || '').toLowerCase().includes('leg extension');
    });
    return { hasLegExt: hasLegExt, count: result.length };
  });

  expect(result).not.toBeNull();
  expect(result.hasLegExt).toBe(false);
});

// ── LEGEXT-02 : dayType='sq_hyp' → Leg Extension injecté avec isCorrectivePriority ──
test('LEGEXT-02 selectExercisesForProfile injecte Leg Extension sur sq_hyp', async ({ page }) => {
  var db = baseDb();
  await setDB(page, db);

  var result = await page.evaluate(() => {
    if (typeof selectExercisesForProfile !== 'function') return null;
    if (typeof buildProfileForSelection !== 'function') return null;
    var profile = buildProfileForSelection();
    profile.dayType = 'sq_hyp';
    var exercises = [
      { name: 'Squat (Barre)', isPrimary: true, sets: 4, reps: '5', rpe: 8, isWarmup: false }
    ];
    var result = selectExercisesForProfile(exercises, profile);
    var legExt = result.find(function(e) {
      return (e.name || '').toLowerCase().includes('leg extension');
    });
    return { found: !!legExt, isCorrectivePriority: legExt ? legExt.isCorrectivePriority : false };
  });

  expect(result).not.toBeNull();
  expect(result.found).toBe(true);
  expect(result.isCorrectivePriority).toBe(true);
});
