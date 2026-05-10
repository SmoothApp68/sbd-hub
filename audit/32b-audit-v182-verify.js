// audit/32b-audit-v182-verify.js — Audit v182 verification — 10 tests
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8080/sbd-hub/index.html';
const STORAGE_KEY = 'SBD_HUB_V29';

const NOW = Date.now();

// Profil avec bestPR rempli pour tester le DOTS
const P_LB = {
  user: { name:'TestLB', bw:85, height:180, age:28, gender:'M',
    trainingMode:'powerbuilding', onboardingProfile:'intermediaire',
    programParams:{ freq:4, duration:90, level:'intermediaire',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi'],
      mat:'salle', injuries:[], cardio:'aucun', goals:['masse'] },
    barWeight:20, units:'kg', vocabLevel:2, lpActive:false, lpStrikes:{},
    onboarded:true, onboardingVersion:99,
    consentHealth:true, medicalConsent:true,
    _activityMigrated:true, _injuryMigrated:true },
  logs: [
    { id:'l1', timestamp: NOW - 1*86400000, volume:9000, title:'Squat', exercises:[] },
    { id:'l2', timestamp: NOW - 3*86400000, volume:8500, title:'Bench', exercises:[] },
    { id:'l3', timestamp: NOW - 40*86400000, volume:7000, title:'Old', exercises:[] }
  ],
  bestPR: { squat: 148, bench: 116, deadlift: 195 },
  gamification: { xp: 15000, xpHighWaterMark: 15000 },
  weeklyChallenges: {
    weekKey: '2026-W19',
    challenges: [
      { id:'c1', completed: true,  xpReward: 200 },
      { id:'c2', completed: false, xpReward: 300 }
    ]
  },
  weeklyPlan: null, earnedBadges: {}, activityLogs: [],
  social: { onboardingCompleted: true },
  _magicStartDone: true, _activityMigrated: true, _injuryMigrated: true
};

// Profil avec logs corrompus pour tester la résistance des safe wrappers
const P_CORRUPT = {
  user: { name:'TestCorrupt', bw:80, height:175, age:30,
    trainingMode:'powerbuilding', onboardingProfile:'intermediaire',
    programParams:{ freq:4, duration:90, level:'intermediaire',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi'],
      mat:'salle', injuries:[], cardio:'aucun', goals:['masse'] },
    barWeight:20, units:'kg', vocabLevel:2, lpActive:false, lpStrikes:{},
    onboarded:true, onboardingVersion:99,
    consentHealth:true, medicalConsent:true,
    _activityMigrated:true, _injuryMigrated:true },
  logs: [
    { id:'bad1', timestamp: null,      volume: null, exercises: null },
    { id:'bad2', timestamp: 'invalid', volume: 'NaN', exercises: [{ name:'Squat', allSets: null }] }
  ],
  bestPR: {}, exercises: {}, weeklyPlan: null, earnedBadges: {}, activityLogs: [],
  gamification: { xp: 0, xpHighWaterMark: 0 },
  social: { onboardingCompleted: true },
  _magicStartDone: true, _activityMigrated: true, _injuryMigrated: true
};

function isAppError(msg) {
  if (!msg) return false;
  const ignore = ['supabase','Failed to fetch','vibrate','ResizeObserver',
    'favicon','service-worker','net::ERR','AuthRetryableFetch',
    'Cloud sign-in','cloudSignIn','Service Worker'];
  return !ignore.some(s => msg.toLowerCase().includes(s.toLowerCase()));
}

let pass = 0, fail = 0;
const results = [];

function ok(name, value, msg) {
  const p = !!value;
  if (p) pass++; else fail++;
  results.push({ name, pass: p, msg: msg || '' });
  console.log((p ? '✅' : '❌') + ' ' + name + (msg ? ' — ' + msg : ''));
}

async function withPage(browser, profile, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && isAppError(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE);
  await page.evaluate(({ p, key }) => {
    localStorage.setItem(key, JSON.stringify(p));
  }, { p: profile, key: STORAGE_KEY });
  await page.reload();
  await page.waitForTimeout(1200);
  const result = await fn(page, errors);
  await ctx.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // ── LB : Leaderboard Metrics ────────────────────────────────────────────────
  console.log('\n── LB : Leaderboard Metrics ──');

  // LB-01 : calcLeaderboardMetrics() est définie
  await withPage(browser, P_LB, async (page) => {
    const defined = await page.evaluate(() => typeof calcLeaderboardMetrics === 'function');
    ok('LB-01 calcLeaderboardMetrics() définie', defined, 'fonction globale présente');
  });

  // LB-02 : dots > 0 avec bestPR(148+116+195=459, bw=85)
  await withPage(browser, P_LB, async (page) => {
    const m = await page.evaluate(() => {
      db.bestPR = { squat: 148, bench: 116, deadlift: 195 };
      db.user.bw = 85;
      db.user.gender = 'M';
      return calcLeaderboardMetrics();
    });
    ok('LB-02 dots > 0 (459kg total / 85kg bw)', typeof m.dots === 'number' && m.dots > 0, 'dots=' + m.dots);
  });

  // LB-03 : xp_week = 200 (1 challenge complété, xpReward=200)
  await withPage(browser, P_LB, async (page) => {
    const m = await page.evaluate(() => {
      db.bestPR = { squat: 148, bench: 116, deadlift: 195 };
      db.gamification = { xp: 15000, xpHighWaterMark: 15000 };
      db.weeklyChallenges = { challenges: [
        { id:'c1', completed: true,  xpReward: 200 },
        { id:'c2', completed: false, xpReward: 300 }
      ]};
      return calcLeaderboardMetrics();
    });
    ok('LB-03 xp_week = 200 (1 challenge complété)', m.xp_week === 200, 'xp_week=' + m.xp_week);
  });

  // LB-04 : xp_week ≠ xp (200 ≠ 15000)
  await withPage(browser, P_LB, async (page) => {
    const m = await page.evaluate(() => {
      db.gamification = { xp: 15000 };
      db.weeklyChallenges = { challenges: [{ completed: true, xpReward: 200 }]};
      return calcLeaderboardMetrics();
    });
    ok('LB-04 xp_week ≠ xp (200 ≠ 15000)', m.xp_week !== m.xp, 'xp_week=' + m.xp_week + ', xp=' + m.xp);
  });

  // LB-05 : sessions_week = 2 (logs J-1 et J-3, pas J-40)
  await withPage(browser, P_LB, async (page) => {
    const m = await page.evaluate(() => {
      var now = Date.now();
      db.logs = [
        { id:'l1', timestamp: now - 1*86400000, volume: 9000, exercises:[] },
        { id:'l2', timestamp: now - 3*86400000, volume: 8500, exercises:[] },
        { id:'l3', timestamp: now - 40*86400000, volume: 7000, exercises:[] }
      ];
      return calcLeaderboardMetrics();
    });
    ok('LB-05 sessions_week = 2 (J-40 exclu)', m.sessions_week === 2, 'sessions_week=' + m.sessions_week);
  });

  // LB-06 : getLeaderboardPeriodKey('weekly') match /\d{4}-W\d{2}/
  await withPage(browser, P_LB, async (page) => {
    const k = await page.evaluate(() => getLeaderboardPeriodKey('weekly'));
    ok('LB-06 weekly key format YYYY-WNN', /^\d{4}-W\d{2}$/.test(k), 'got: ' + k);
  });

  // LB-07 : getLeaderboardPeriodKey('monthly') match /\d{4}-\d{2}/
  await withPage(browser, P_LB, async (page) => {
    const k = await page.evaluate(() => getLeaderboardPeriodKey('monthly'));
    ok('LB-07 monthly key format YYYY-MM', /^\d{4}-\d{2}$/.test(k), 'got: ' + k);
  });

  // ── ENG : Safe wrappers ─────────────────────────────────────────────────────
  console.log('\n── ENG : Safe Wrappers ──');

  // ENG-01 : wpComputeWorkWeightSafe avec P_CORRUPT → retourne nombre > 0
  await withPage(browser, P_CORRUPT, async (page) => {
    const r = await page.evaluate(() => {
      try {
        return wpComputeWorkWeightSafe('squat', 'lower');
      } catch(e) {
        return 'CRASH:' + e.message;
      }
    });
    ok('ENG-01 wpComputeWorkWeightSafe avec logs corrompus → nombre', typeof r === 'number' && r > 0, 'val=' + r);
  });

  // ENG-02 : wpGeneratePowerbuildingDaySafe avec params=null → retourne objet avec exercises[]
  await withPage(browser, P_CORRUPT, async (page) => {
    const r = await page.evaluate(() => {
      try {
        return wpGeneratePowerbuildingDaySafe('squat', null, 'accumulation', null, 'Lundi');
      } catch(e) {
        return 'CRASH:' + e.message;
      }
    });
    const isObj = r && typeof r === 'object' && Array.isArray(r.exercises);
    ok('ENG-02 wpGeneratePowerbuildingDaySafe params=null → objet', isObj, 'got: ' + JSON.stringify(r).substring(0,80));
  });

  // ENG-03 : 0 erreur console avec P_CORRUPT pendant chargement GO
  await withPage(browser, P_CORRUPT, async (page, errors) => {
    await page.waitForTimeout(800);
    // Navigate to GO tab if possible
    try {
      await page.click('[data-tab="go"], [onclick*="showTab(\'go\')"], .tab-go', { timeout: 2000 });
      await page.waitForTimeout(500);
    } catch(e) { /* tab click optional */ }
    ok('ENG-03 0 erreurs console avec logs corrompus', errors.length === 0, 'errors=' + errors.length + (errors.length ? ': ' + errors[0].substring(0,100) : ''));
  });

  await browser.close();

  // ── Résumé ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════');
  console.log('Audit v182 Verify: ' + pass + '/' + (pass + fail) + ' tests passés');
  console.log('══════════════════════════════');

  const summary = { date: new Date().toISOString(), version: 'v182-verify', pass, fail, total: pass + fail, results };
  fs.writeFileSync(path.join(__dirname, '32b-audit-v182-verify-results.json'), JSON.stringify(summary, null, 2));
  if (fail > 0) process.exit(1);
})();
