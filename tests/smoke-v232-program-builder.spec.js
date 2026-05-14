const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8080';

var DAYS_FULL_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
function aurelienDb() {
  var todayName = DAYS_FULL_FR[new Date().getDay()];
  var allDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  var days = allDays.map(function(d) {
    if (d === todayName) {
      return { day:d, title:'Squat — Force & Volume', exercises:[
        { name:'High Bar Squat', sets:[
          {weight:105,reps:7,isWarmup:false},
          {weight:105,reps:7,isWarmup:false},
          {weight:105,reps:7,isWarmup:false},
          {weight:105,reps:7,isWarmup:false}
        ]},
        { name:'Presse à Cuisses', sets:[
          {weight:240,reps:8,isWarmup:false},
          {weight:240,reps:8,isWarmup:false},
          {weight:240,reps:8,isWarmup:false}
        ]},
        { name:'Leg Extension', sets:[{reps:12,isWarmup:false},{reps:12,isWarmup:false},{reps:12,isWarmup:false}] }
      ]};
    }
    if (d === 'Mercredi' || d === 'Dimanche') {
      return { day:d, title:'Repos', rest:true, exercises:[] };
    }
    return { day:d, title:d + ' — Volume', exercises:[
      { name:'Bench Press', sets:[{weight:100,reps:5,isWarmup:false},{weight:100,reps:5,isWarmup:false}] }
    ]};
  });
  return {
    user: {
      name: 'Aurélien', age: 35, bw: 98, height: 178, gender: 'male',
      level: 'avance', trainingMode: 'powerbuilding',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'premium', trainingDuration: 90,
      programMode: 'auto', injuries: [], lpActive: false, lpStrikes: {},
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 5, goal: 'masse', goals: ['masse'], level: 'avance',
        mat: 'salle', duration: 90, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
    },
    bestPR: { squat: 148, bench: 140, deadlift: 186 },
    exercises: {}, readiness: [], logs: [{ timestamp: Date.now() - 86400000, exercises: [{ name:'High Bar Squat', maxRM:130 }] }],
    activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0, routine: {},
    weeklyPlan: {
      lastDeloadDate: '2026-04-27T00:00:00.000Z',
      currentBlock: { phase: 'hypertrophie', week: 2, blockStartDate: new Date('2026-05-04T00:00:00Z').getTime() },
      days: days
    }
  };
}

test('v232 — renderProgramBuilder delegates to renderProgrammeV2', async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(data));
  }, aurelienDb());

  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  var info = await page.evaluate(() => {
    // Naviguer vers Plan
    if (typeof showTab === 'function') showTab('tab-seances');
    if (typeof showSeancesSub === 'function') showSeancesSub('s-plan');
    var v2 = document.getElementById('programmeV2Content');
    var pb = document.getElementById('programBuilderContent');
    return {
      v2HtmlLen: v2 ? v2.innerHTML.length : 0,
      pbHtmlLen: pb ? pb.innerHTML.length : 0,
      v2HasPhase: v2 ? /Hypertrophie/.test(v2.innerHTML) : false,
      v2HasWeekList: v2 ? /Cette semaine/.test(v2.innerHTML) : false,
      v2HasWeightInList: v2 ? /105kg|240kg|100kg/.test(v2.innerHTML) : false,
      v2HasVioletWeight: v2 ? /color:#a78bfa/.test(v2.innerHTML) : false
    };
  });
  console.log('PLAN TAB CHECK:', JSON.stringify(info, null, 2));

  expect(info.v2HtmlLen).toBeGreaterThan(0);
  expect(info.v2HasPhase).toBe(true);
  expect(info.v2HasWeekList).toBe(true);
  expect(info.v2HasWeightInList).toBe(true);
  expect(info.v2HasVioletWeight).toBe(true);

  await page.screenshot({ path: 'audit/v232-plan-with-weights.png', fullPage: false });
});

test('v232 — projectNextWeekWeights exists and applies increment', async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(data));
  }, aurelienDb());

  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  var result = await page.evaluate(() => {
    var exists = typeof projectNextWeekWeights === 'function';
    if (!exists) return { exists: false };
    var input = [{ name:'High Bar Squat', sets:[{weight:105,reps:7,isWarmup:false}] }];
    var output = projectNextWeekWeights(input);
    return {
      exists: true,
      inputWeight: input[0].sets[0].weight,
      outputWeight: output[0].sets[0].weight,
      projectedFlag: output[0].sets[0]._projected,
      projectedWeight: output[0]._projectedWeight
    };
  });
  console.log('PROJECT N+1 CHECK:', JSON.stringify(result, null, 2));

  expect(result.exists).toBe(true);
  expect(result.outputWeight).toBeGreaterThan(result.inputWeight);
  expect(result.projectedFlag).toBe(true);
});

test('v232 — Home swipe to next week shows Projection badge', async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(data));
  }, aurelienDb());

  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  var result = await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-dash');
    // Avancer de 7 jours pour atteindre la semaine prochaine
    for (var i = 0; i < 7; i++) {
      if (typeof homeNavDay === 'function') homeNavDay(1);
    }
    var el = document.getElementById('dashWeekContent');
    var html = el ? el.innerHTML : '';
    return {
      htmlLen: html.length,
      hasProjection: /Projection/.test(html),
      hasSemProchaine: /sem\.\s*prochaine|sem. prochaine/.test(html)
    };
  });
  console.log('HOME NEXT WEEK CHECK:', JSON.stringify(result, null, 2));

  expect(result.htmlLen).toBeGreaterThan(0);
});
