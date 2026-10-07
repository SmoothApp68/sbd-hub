const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8080';

var DAYS_FULL_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
function aurelienDb() {
  var todayName = DAYS_FULL_FR[new Date().getDay()];
  var allDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  var days = allDays.map(function(d) {
    if (d === todayName) {
      return { day:d, title:'Squat — Force & Volume', exercises:[
        { name:'High Bar Squat', sets:[{weight:125,reps:6,isWarmup:false},{weight:125,reps:6,isWarmup:false},{weight:125,reps:6,isWarmup:false},{weight:125,reps:6,isWarmup:false}] },
        { name:'Presse à Cuisses', sets:[{weight:200,reps:10,isWarmup:false},{weight:200,reps:10,isWarmup:false},{weight:200,reps:10,isWarmup:false}] },
        { name:'Leg Extension', sets:[{reps:12,isWarmup:false},{reps:12,isWarmup:false},{reps:12,isWarmup:false}] },
        { name:'Hip Thrust', sets:[{weight:80,reps:10,isWarmup:false}] },
        { name:'Mollets', sets:[{reps:15,isWarmup:false}] }
      ]};
    }
    if (d === 'Mercredi' || d === 'Dimanche') {
      return { day:d, title:'Repos', rest:true, exercises:[] };
    }
    return { day:d, title:d + ' — Volume', exercises:[{name:'Bench Press',sets:[{weight:100,reps:5,isWarmup:false}]}] };
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
    exercises: {}, readiness: [], logs: [{ timestamp: Date.now() - 86400000, exercises: [] }],
    activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0, routine: {},
    weeklyPlan: {
      lastDeloadDate: '2026-04-27T00:00:00.000Z',
      currentBlock: { phase: 'hypertrophie', week: 2, blockStartDate: new Date('2026-05-04T00:00:00Z').getTime() },
      days: days
    }
  };
}

test('v231 — renderProgrammeV2 redesign snapshot', async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(data));
  }, aurelienDb());

  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // Inject the container at the top, hide all other body children for clean screenshot
  var info = await page.evaluate(() => {
    Array.from(document.body.children).forEach(function(c) { c.style.display = 'none'; });
    var c = document.getElementById('programmeV2Content');
    if (!c) {
      c = document.createElement('div');
      c.id = 'programmeV2Content';
    }
    c.style.cssText = 'position:fixed;inset:0;background:#0c0c1a;padding:12px 0;z-index:99999;display:block;overflow:auto;';
    document.body.appendChild(c);
    if (typeof renderProgrammeV2 === 'function') renderProgrammeV2();
    var html = c.innerHTML;
    return {
      hasPhase: /Hypertrophie/.test(html),
      hasWeek: /S2\s*\/\s*4/.test(html),
      hasToday: /Aujourd'hui/.test(html),
      hasGo: />\s*▶?\s*GO/i.test(html),
      hasWeekList: /Cette semaine/.test(html),
      hasSquat: /Squat/.test(html),
      hasRepos: /Repos/.test(html),
      hasNouveau: /Nouveau programme/.test(html),
      hasGenerationCount: html.indexOf('Semaine 1') !== -1 || html.indexOf('Semaine 2') !== -1,
      htmlLen: html.length
    };
  });
  console.log('RENDER CHECK:', JSON.stringify(info, null, 2));

  await page.screenshot({ path: 'audit/v231-plan-redesign.png', fullPage: false });

  expect(info.hasPhase).toBe(true);
  expect(info.hasWeek).toBe(true);
  expect(info.hasToday).toBe(true);
  expect(info.hasGo).toBe(true);
  expect(info.hasWeekList).toBe(true);
  expect(info.hasSquat).toBe(true);
});
