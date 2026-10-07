const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

function aurelienDb() {
  return {
    user: {
      name: 'Aurélien', age: 35, bw: 98, height: 178, gender: 'male',
      level: 'avance', trainingMode: 'powerbuilding',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'premium', trainingDuration: 90, vocabLevel: 2,
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 5, goal: 'masse', goals: ['masse'], level: 'avance',
        mat: 'salle', duration: 90, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
    },
    bestPR: { squat: 148, bench: 140, deadlift: 186 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
}

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('V200-01 WP_SESSION_TEMPLATES.squat aligné pbBlocks.sq_hyp (Presse cuisses, leg ext, mollet, planche)', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var tpl = WP_SESSION_TEMPLATES.squat;
    var names = (tpl.accessories || []).map(function(a){ return a.name; });
    return {
      mainLift: tpl.mainLift,
      names: names,
      hasPresse: names.some(function(n){ return /presse à cuisses/i.test(n); }),
      hasLegExt: names.some(function(n){ return /leg extension/i.test(n); }),
      hasMollets: names.some(function(n){ return /mollets/i.test(n); }),
      hasPlanche: names.some(function(n){ return /planche/i.test(n); }),
      hasAdduction: names.some(function(n){ return /adduction/i.test(n); }),
      hasAbduction: names.some(function(n){ return /abduction/i.test(n); })
    };
  });
  expect(result.mainLift).toBe('squat');
  expect(result.hasPresse).toBe(true);
  expect(result.hasLegExt).toBe(true);
  expect(result.hasMollets).toBe(true);
  expect(result.hasPlanche).toBe(true);
  // v200 supprime Adduction/Abduction
  expect(result.hasAdduction).toBe(false);
  expect(result.hasAbduction).toBe(false);
});

test('V200-02 WP_SESSION_TEMPLATES.bench aligné pbBlocks.bench_hyp (rowing, dips, face pull, tri cable)', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var tpl = WP_SESSION_TEMPLATES.bench;
    var names = (tpl.accessories || []).map(function(a){ return a.name; });
    return {
      mainLift: tpl.mainLift,
      names: names,
      hasRowingPoulie: names.some(function(n){ return /rowing poulie/i.test(n); }),
      hasDips: names.some(function(n){ return /^dips/i.test(n); }),
      hasFacePull: names.some(function(n){ return /face pull/i.test(n); }),
      hasTriCable: names.some(function(n){ return /extension triceps|tri.*cable/i.test(n); }),
      hasEcarteMachine: names.some(function(n){ return /écarté machine/i.test(n); }),
      hasOiseauMachine: names.some(function(n){ return /oiseau machine/i.test(n); }),
      hasInclineHaltere: names.some(function(n){ return /incliné haltères/i.test(n); }),
      hasTractions: names.some(function(n){ return /^tractions/i.test(n); })
    };
  });
  expect(result.mainLift).toBe('bench');
  expect(result.hasRowingPoulie).toBe(true);
  expect(result.hasDips).toBe(true);
  expect(result.hasFacePull).toBe(true);
  expect(result.hasTriCable).toBe(true);
  // v200 supprime Écarté/Oiseau machine, Incliné haltères et Tractions du bench day
  expect(result.hasEcarteMachine).toBe(false);
  expect(result.hasOiseauMachine).toBe(false);
  expect(result.hasInclineHaltere).toBe(false);
  expect(result.hasTractions).toBe(false);
});

test('V200-03 WP_SESSION_TEMPLATES.deadlift aligné pbBlocks.dead_hyp (squat pause, lat pull, leg curl, relevé jambes — PAS Hip Thrust)', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var tpl = WP_SESSION_TEMPLATES.deadlift;
    var names = (tpl.accessories || []).map(function(a){ return a.name; });
    return {
      mainLift: tpl.mainLift,
      names: names,
      hasSquatPause: names.some(function(n){ return /squat pause/i.test(n); }),
      hasLatPull: names.some(function(n){ return /tirage poitrine/i.test(n); }),
      hasLegCurl: names.some(function(n){ return /leg curl/i.test(n); }),
      hasReleveJambes: names.some(function(n){ return /relevé de jambes/i.test(n); }),
      hasHipThrust: names.some(function(n){ return /hip thrust/i.test(n); }),
      hasElevLat: names.some(function(n){ return /élévations latérales/i.test(n); }),
      hasMolletsOnDead: names.some(function(n){ return /mollets/i.test(n); })
    };
  });
  expect(result.mainLift).toBe('deadlift');
  expect(result.hasSquatPause).toBe(true);
  expect(result.hasLatPull).toBe(true);
  expect(result.hasLegCurl).toBe(true);
  expect(result.hasReleveJambes).toBe(true);
  // v200 supprime Hip Thrust du dead day (déplacé vers leg accessoires)
  expect(result.hasHipThrust).toBe(false);
  // Élévations latérales et Mollets ne sont pas dans pbBlocks.dead_hyp
  expect(result.hasElevLat).toBe(false);
  expect(result.hasMolletsOnDead).toBe(false);
});

test('V200-04 generateWeeklyPlan Aurélien freq=5 : exos respectent v200 (pas Hip Thrust J3, Presse cuisses J1)', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    var error = null;
    try { generateWeeklyPlan(); } catch(e) { error = String(e); }
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    function findDay(dayName) {
      return days.find(function(d){ return d.day === dayName && !d.rest; });
    }
    function names(d) {
      if (!d || !d.exercises) return [];
      return d.exercises.map(function(e){ return e.name || ''; });
    }
    var lundi = findDay('Lundi');
    var jeudi = findDay('Jeudi');
    var lundiNames = names(lundi);
    var jeudiNames = names(jeudi);
    return {
      error: error,
      lundiHasPresse: lundiNames.some(function(n){ return /presse à cuisses/i.test(n); }),
      jeudiHasHipThrust: jeudiNames.some(function(n){ return /hip thrust/i.test(n); }),
      jeudiHasLegCurl: jeudiNames.some(function(n){ return /leg curl/i.test(n); }),
      jeudiHasLatPull: jeudiNames.some(function(n){ return /tirage poitrine/i.test(n); }),
      lundiNames: lundiNames,
      jeudiNames: jeudiNames
    };
  });
  expect(result.error).toBeNull();
  // Jeudi ne doit plus contenir Hip Thrust (v200)
  expect(result.jeudiHasHipThrust).toBe(false);
  // Jeudi doit contenir Leg Curl + Tirage poitrine (lat_pull)
  expect(result.jeudiHasLegCurl).toBe(true);
  expect(result.jeudiHasLatPull).toBe(true);
});
