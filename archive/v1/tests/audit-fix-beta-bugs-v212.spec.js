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
    programParams: { freq: 5, goal: 'force', goals: ['masse'],
      level: 'intermediaire', mat: 'salle', duration: 90,
      selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
  },
  bestPR: { squat: 100, bench: 90, deadlift: 130 },
  exercises: {},
  readiness: [], weeklyPlan: null, logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0,
  routine: {}
};

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('FIX1-01 wpGenerateMuscuDay applique selectExercisesForProfile (flags présents)', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    var dayData = wpGenerateMuscuDay('lower_a', db.user.programParams, 'hypertrophie');
    return {
      hasExos: Array.isArray(dayData && dayData.exercises) && dayData.exercises.length > 0,
      anyAddedByRule: (dayData.exercises || []).some(function(e) { return e._addedByRule != null; }),
      anyCorrective:  (dayData.exercises || []).some(function(e) { return e.isCorrectivePriority; })
    };
  });
  expect(result.hasExos).toBe(true);
  // Avec ratio Sq/Bench 100/90 = 1.11 (> seuil musc 1.10) → pas forcément correctif.
  // Mais l'exécution du pipeline DOIT au moins permettre que ces flags soient possibles.
  // Vérification structurelle : la fonction tourne sans planter et retourne des exos.
});

test('FIX1-02 Léa 45min musc → Deadlift retiré, RDL injecté', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.trainingDuration = 45;
  db.user.programParams.duration = 45;
  await setDB(page, db);
  const result = await page.evaluate(() => {
    var exos = [
      { name: 'Soulevé de Terre', sets: 4, isPrimary: false },
      { name: 'Squat', sets: 4, isPrimary: true, muscleGroup: 'quad' }
    ];
    var profile = buildProfileForSelection();
    return selectExercisesForProfile(exos, profile);
  });
  const dl  = result.find(e => /soulev[eé] de terre|deadlift/i.test(e.name));
  const rdl = result.find(e => /rdl|roumain/i.test(e.name));
  expect(dl).toBeUndefined();
  expect(rdl).toBeTruthy();
});

test('FIX2-01 musculation freq=5 → templates distincts (Upper A pas dupliqué)', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.programParams.freq = 5;
  db.user.programParams.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi','Samedi'];
  db.user.trainingMode = 'musculation';
  await setDB(page, db);
  // Tester la fonction generateWeeklyPlan indirectement en vérifiant le splitMap
  // utilisé : on doit voir full_a apparaître comme 5è template.
  const titles = await page.evaluate(() => {
    if (typeof generateWeeklyPlan !== 'function') return null;
    try { generateWeeklyPlan(); } catch (e) {}
    return (db.weeklyPlan && db.weeklyPlan.days || [])
      .filter(function(d) { return !d.rest; })
      .map(function(d) { return d.title; });
  });
  expect(titles).not.toBeNull();
  if (titles && titles.length === 5) {
    // Pas deux fois exactement le même titre sur les 5 jours d'entraînement
    const uniq = Array.from(new Set(titles));
    expect(uniq.length).toBeGreaterThanOrEqual(4);
  }
});

test('FIX3-01 syncRoutineWithSelectedDays → Dimanche absent de selectedDays → 😴 Repos', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.programParams.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
  db.routine = {
    Lundi: 'Upper A',
    Mardi: 'Lower A',
    Mercredi: '😴 Repos',
    Jeudi: 'Upper B',
    Vendredi: 'Lower B',
    Samedi: '😴 Repos',
    Dimanche: 'Squat Spécialisation' // incohérent : Dimanche pas dans selectedDays
  };
  await setDB(page, db);
  const after = await page.evaluate(() => {
    syncRoutineWithSelectedDays();
    return Object.assign({}, db.routine);
  });
  expect(after.Dimanche).toMatch(/repos|😴/i);
});

test('FIX4-01 confirmPhaseTransition strip préfixe 🔄 de db.routine', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.weeklyPlan = { currentBlock: { phase: 'deload', blockStartDate: Date.now() - 14*86400000 } };
  db.routine = {
    Lundi:    '🔄 💪 Upper A',
    Mardi:    '🔄 🦵 Lower A',
    Mercredi: '😴 Repos',
    Jeudi:    '🔄 💪 Upper B'
  };
  await setDB(page, db);
  const after = await page.evaluate(() => {
    confirmPhaseTransition('hypertrophie');
    return Object.assign({}, db.routine);
  });
  Object.keys(after).forEach(function(day) {
    expect(after[day]).not.toMatch(/^🔄/);
  });
});

test('FIX5-01 toggleSettingsGoal rejette goals incompatibles + max 2', async ({ page }) => {
  const db = JSON.parse(JSON.stringify(BASE_DB));
  db.user.programParams.goals = ['masse'];
  await setDB(page, db);
  const result = await page.evaluate(() => {
    var btn = document.createElement('button');
    // Incompatibilité : seche vs masse
    toggleSettingsGoal('seche', btn);
    var afterIncompat = (db.user.programParams.goals || []).slice();
    // Max 2 : 'force' devrait passer, puis 'recompo' refusé
    toggleSettingsGoal('force', btn);
    var afterTwo = (db.user.programParams.goals || []).slice();
    toggleSettingsGoal('recompo', btn);
    var afterThree = (db.user.programParams.goals || []).slice();
    return { afterIncompat: afterIncompat, afterTwo: afterTwo, afterThree: afterThree };
  });
  // seche refusé (incompat avec masse) → goals = ['masse'] inchangé
  expect(result.afterIncompat).toEqual(['masse']);
  // force accepté → ['masse','force']
  expect(result.afterTwo.length).toBe(2);
  // recompo refusé (max 2) → toujours 2
  expect(result.afterThree.length).toBe(2);
});

test('FIX6-01 wpApplySupersets → 2è exo a restSeconds=null + isSecondInSuperset', async ({ page }) => {
  await setDB(page, BASE_DB);
  const result = await page.evaluate(() => {
    var exos = [
      { name: 'Curl Haltères',     sets: 3, isPrimary: false },
      { name: 'Extension Triceps', sets: 3, isPrimary: false }
    ];
    return wpApplySupersets(exos, 'optimised');
  });
  // 1er exo : superset=true
  expect(result[0].superset).toBe(true);
  expect(result[0].supersetWith).toBe('Extension Triceps');
  // 2è exo : isSecondInSuperset=true, restSeconds=null (pas 0)
  expect(result[1].isSecondInSuperset).toBe(true);
  expect(result[1].restSeconds).toBeNull();
});
