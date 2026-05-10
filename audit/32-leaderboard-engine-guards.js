// audit/32-leaderboard-engine-guards.js — Tests v182 — Leaderboard metrics + Safe wrappers
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8787/sbd-hub/index.html';

// Profil avec PRs réels pour tester DOTS
const P_BASE = {
  user: {
    name:'TestV182', age:28, bw:80, height:178, gender:'male', fatPct:null,
    trainingMode:'powerbuilding', onboardingProfile:'intermediaire',
    level:'intermediaire', onboarded:true, onboardingVersion:99,
    coachEnabled:true, coachProfile:'full', vocabLevel:2, lpActive:false, lpStrikes:{},
    programParams: { freq:4, duration:60, level:'intermediaire',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi'],
      mat:'salle', injuries:[], cardio:'aucun', goals:['masse'] },
    barWeight:20, units:'kg',
    _activityMigrated:true, _injuryMigrated:true,
    consentHealth:true, medicalConsent:true,
    onboardingPRs: { squat:148, bench:140, deadlift:186 }
  },
  logs:[],
  exercises:{'Squat (Barre)':{e1rm:157}},
  bestPR:{ squat:148, bench:140, deadlift:186 }, // total = 474, DOTS calculable
  weeklyPlan:null,
  weeklyChallenges: { challenges: [
    { completed: true,  xpReward: 100 },
    { completed: false, xpReward: 50 },
    { completed: true,  xpReward: 75 }
  ] },
  gamification: { xp: 5000, xpHighWaterMark: 5000 },
  social:{onboardingCompleted:true},
  _magicStartDone:true, activityLogs:[], earnedBadges:{}, xpHighWaterMark:0
};

function isAppError(msg) {
  if (!msg) return false;
  const ignore = ['supabase','Failed to fetch','vibrate','ResizeObserver','favicon','service-worker','net::ERR','AuthRetryableFetch','Cloud sign-in','cloudSignIn'];
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
  await page.evaluate((p) => {
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(p));
  }, profile);
  await page.reload();
  await page.waitForTimeout(1200);
  const result = await fn(page, errors);
  await ctx.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // ── BUG 1: Leaderboard Metrics ─────────────────────────────────────────────
  console.log('\n── BUG 1: Leaderboard Metrics ──');

  // LB-01: calcLeaderboardMetrics() defined
  await withPage(browser, P_BASE, async (page) => {
    const defined = await page.evaluate(() => typeof calcLeaderboardMetrics === 'function');
    ok('LB-01 calcLeaderboardMetrics() is defined', defined, 'function exists globally');
  });

  // LB-02: DOTS > 0 quand bestPR rempli
  await withPage(browser, P_BASE, async (page) => {
    const m = await page.evaluate(() => {
      // bestPR est reset par recalcBestPR() en init — on le force après load
      db.bestPR = { squat: 148, bench: 140, deadlift: 186 };
      db.user.bw = 80; db.user.gender = 'male';
      return calcLeaderboardMetrics();
    });
    ok('LB-02 metrics.dots > 0 with valid bestPR', typeof m.dots === 'number' && m.dots > 0, 'dots=' + m.dots);
  });

  // LB-03/04/05: xp_week ≠ xp quand challenges complétés
  await withPage(browser, P_BASE, async (page) => {
    const m = await page.evaluate(() => {
      db.gamification = db.gamification || {};
      db.gamification.xp = 5000;
      db.weeklyChallenges = { challenges: [
        { completed: true,  xpReward: 100 },
        { completed: false, xpReward: 50 },
        { completed: true,  xpReward: 75 }
      ]};
      return calcLeaderboardMetrics();
    });
    ok('LB-03 xp_week (175) computed from completed challenges', m.xp_week === 175, 'xp_week=' + m.xp_week);
    ok('LB-04 xp (alltime) reads from gamification.xp', m.xp === 5000, 'xp=' + m.xp);
    ok('LB-05 xp_week !== xp', m.xp_week !== m.xp, 'distinct values');
  });

  // LB-06: getLeaderboardPeriodKey('weekly') format YYYY-WNN
  await withPage(browser, P_BASE, async (page) => {
    const k = await page.evaluate(() => getLeaderboardPeriodKey('weekly'));
    ok('LB-06 weekly key format YYYY-WNN', /^\d{4}-W\d{2}$/.test(k), 'got: ' + k);
  });

  // LB-07: getLeaderboardPeriodKey('monthly') format YYYY-MM
  await withPage(browser, P_BASE, async (page) => {
    const k = await page.evaluate(() => getLeaderboardPeriodKey('monthly'));
    ok('LB-07 monthly key format YYYY-MM', /^\d{4}-\d{2}$/.test(k), 'got: ' + k);
  });

  // LB-08: getLeaderboardPeriodKey('alltime') returns 'alltime'
  await withPage(browser, P_BASE, async (page) => {
    const k = await page.evaluate(() => getLeaderboardPeriodKey('alltime'));
    ok('LB-08 alltime key === "alltime"', k === 'alltime', 'got: ' + k);
  });

  // LB-09: sessions_week count from logs in last 7 days
  await withPage(browser, P_BASE, async (page) => {
    const m = await page.evaluate(() => {
      var now = Date.now();
      db.logs = [
        { id:'l1', timestamp: now - 1*86400000, volume: 5000, exercises:[] },
        { id:'l2', timestamp: now - 4*86400000, volume: 3000, exercises:[] },
        { id:'l3', timestamp: now - 10*86400000, volume: 2000, exercises:[] }
      ];
      return calcLeaderboardMetrics();
    });
    ok('LB-09 sessions_week counts last 7 days only', m.sessions_week === 2, 'sessions_week=' + m.sessions_week);
    ok('LB-10 volume_week sums last 7 days', m.volume_week === 8000, 'volume_week=' + m.volume_week);
    ok('LB-11 sessions_month counts last 30 days', m.sessions_month === 3, 'sessions_month=' + m.sessions_month);
  });

  // LB-12: app.min.js contient xp_week (Fix 1C)
  const minSrc = fs.readFileSync(path.join(__dirname, '../js/app.min.js'), 'utf8');
  const supaSrc = fs.readFileSync(path.join(__dirname, '../js/supabase.js'), 'utf8');
  ok('LB-12 supabase.js uses metrics.xp_week for weekly entry',
    /xp_week/.test(supaSrc) && /metric:'xp',\s*value:metrics\.xp_week/.test(supaSrc.replace(/\s+/g, ' ')),
    'xp_week distinct in syncLeaderboard');

  // ── BUG 2: Safe Wrappers ──────────────────────────────────────────────────
  console.log('\n── BUG 2: Safe Wrappers ──');

  // ENG-01: wpComputeWorkWeightSafe defined
  await withPage(browser, P_BASE, async (page) => {
    const defined = await page.evaluate(() => typeof wpComputeWorkWeightSafe === 'function');
    ok('ENG-01 wpComputeWorkWeightSafe defined', defined, 'function exists');
  });

  // ENG-02: wpGeneratePowerbuildingDaySafe defined
  await withPage(browser, P_BASE, async (page) => {
    const defined = await page.evaluate(() => typeof wpGeneratePowerbuildingDaySafe === 'function');
    ok('ENG-02 wpGeneratePowerbuildingDaySafe defined', defined, 'function exists');
  });

  // ENG-03: wpBuildWarmupsSafe defined
  await withPage(browser, P_BASE, async (page) => {
    const defined = await page.evaluate(() => typeof wpBuildWarmupsSafe === 'function');
    ok('ENG-03 wpBuildWarmupsSafe defined', defined, 'function exists');
  });

  // ENG-04: wpComputeWorkWeightSafe avec liftType inconnu retourne un nombre > 0 (fallback)
  await withPage(browser, P_BASE, async (page) => {
    const w = await page.evaluate(() => {
      try { return wpComputeWorkWeightSafe('completely_unknown_lift_xyz', 'primary'); }
      catch(e) { return 'CRASH:' + e.message; }
    });
    ok('ENG-04 Safe wrapper returns number on unknown lift', typeof w === 'number' && w > 0, 'w=' + w);
  });

  // ENG-05: wpGeneratePowerbuildingDaySafe avec params null retourne un objet
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      try { return wpGeneratePowerbuildingDaySafe('squat', null, 'accumulation', null, 'Lundi'); }
      catch(e) { return 'CRASH:' + e.message; }
    });
    const isObj = r && typeof r === 'object' && Array.isArray(r.exercises);
    ok('ENG-05 Safe wrapper returns object with exercises[] on null params', isObj, 'got: ' + JSON.stringify(r).substring(0, 80));
  });

  // ENG-06: wpBuildWarmupsSafe avec weight=0 retourne un tableau non-vide
  await withPage(browser, P_BASE, async (page) => {
    const w = await page.evaluate(() => {
      try { return wpBuildWarmupsSafe(0, 5, 'X', 1, []); }
      catch(e) { return 'CRASH:' + e.message; }
    });
    ok('ENG-06 Safe wrapper returns array on weight=0', Array.isArray(w), 'len=' + (Array.isArray(w) ? w.length : 'N/A'));
  });

  // ENG-07: wpBuildWarmupsSafe avec args complètement invalides retourne un tableau (pas crash)
  await withPage(browser, P_BASE, async (page) => {
    const w = await page.evaluate(() => {
      try { return wpBuildWarmupsSafe(undefined, undefined, undefined, undefined, undefined); }
      catch(e) { return 'CRASH:' + e.message; }
    });
    ok('ENG-07 Safe wrapper resilient to undefined args', Array.isArray(w), 'len=' + (Array.isArray(w) ? w.length : 'N/A'));
  });

  // ENG-08: 0 erreur console pendant flux GO normal
  const P_GO = JSON.parse(JSON.stringify(P_BASE));
  P_GO.logs = [{ id:'l1', timestamp: Date.now() - 86400000, volume: 5000,
    exercises:[{ name: 'Squat (Barre)', isCardio: false,
      series: [{ weight: 100, reps: 5, rpe: 7.5 }],
      allSets: [{ weight: 100, reps: 5, rpe: 7.5 }], maxRM: 112 }] }];

  await withPage(browser, P_GO, async (page, errors) => {
    await page.waitForTimeout(800);
    ok('ENG-08 No console errors during normal load', errors.length === 0, 'errors=' + errors.length);
  });

  // ENG-09: Safe wrappers présents dans app.min.js
  ok('ENG-09 wpComputeWorkWeightSafe in app.min.js', minSrc.includes('wpComputeWorkWeightSafe'), 'minified');
  ok('ENG-10 wpGeneratePowerbuildingDaySafe in app.min.js', minSrc.includes('wpGeneratePowerbuildingDaySafe'), 'minified');
  ok('ENG-11 wpBuildWarmupsSafe in app.min.js', minSrc.includes('wpBuildWarmupsSafe'), 'minified');

  await browser.close();

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════');
  console.log('v182 Leaderboard + Engine Guards: ' + pass + '/' + (pass + fail) + ' tests passed');
  console.log('══════════════════════════════');

  const summary = { date: new Date().toISOString(), version: 'v182', pass, fail, total: pass + fail, results };
  fs.writeFileSync(path.join(__dirname, '32-leaderboard-engine-guards-results.json'), JSON.stringify(summary, null, 2));
  if (fail > 0) process.exit(1);
})();
