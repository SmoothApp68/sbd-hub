// Playwright visual audit for TrainHub
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8788';
const OUT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const STORAGE_KEY = 'SBD_HUB_V29';

// ── Minimal demo DB that bypasses onboarding + has realistic data ─────────
function buildDemoDB() {
  const now = Date.now();
  const day = 86400000;

  function makeLog(daysAgo, exercises) {
    const ts = now - daysAgo * day;
    return {
      timestamp: ts,
      shortDate: new Date(ts).toISOString().split('T')[0],
      volume: exercises.reduce((s, e) => s + (e.allSets || []).reduce((ss, set) => ss + (set.weight * set.reps), 0), 0),
      exercises
    };
  }

  function sqSet(weight, reps, rpe) { return { weight, reps, rpe, isWarmup: false }; }

  const logs = [
    makeLog(1, [
      { name: 'Squat', allSets: [sqSet(100,5,7), sqSet(105,5,8), sqSet(107.5,5,8.5), sqSet(95,8,7)], maxRM: 130 },
      { name: 'Développé couché', allSets: [sqSet(70,5,7), sqSet(75,5,8), sqSet(77.5,5,8.5)], maxRM: 100 },
      { name: 'Soulevé de Terre', allSets: [sqSet(130,3,8), sqSet(132.5,3,8.5)], maxRM: 160 }
    ]),
    makeLog(4, [
      { name: 'Squat', allSets: [sqSet(97.5,5,7.5), sqSet(102.5,5,8)], maxRM: 128 },
      { name: 'Développé couché', allSets: [sqSet(72.5,5,8)], maxRM: 98 }
    ]),
    makeLog(8, [
      { name: 'Squat', allSets: [sqSet(95,5,7), sqSet(100,5,8)], maxRM: 125 },
      { name: 'Soulevé de Terre', allSets: [sqSet(127.5,3,8)], maxRM: 157 }
    ]),
    makeLog(11, [
      { name: 'Développé couché', allSets: [sqSet(70,5,7.5)], maxRM: 95 },
      { name: 'Squat', allSets: [sqSet(92.5,5,7)], maxRM: 122 }
    ]),
    makeLog(15, [
      { name: 'Squat', allSets: [sqSet(90,5,7)], maxRM: 118 },
      { name: 'Soulevé de Terre', allSets: [sqSet(125,3,7.5)], maxRM: 153 }
    ]),
    makeLog(18, [
      { name: 'Développé couché', allSets: [sqSet(67.5,5,7.5)], maxRM: 92 },
      { name: 'Squat', allSets: [sqSet(87.5,5,7)], maxRM: 115 }
    ])
  ];

  return {
    user: {
      name: 'Alex',
      bw: 82,
      height: 178,
      age: 27,
      level: 'intermediaire',
      gender: 'male',
      onboarded: true,
      onboardingVersion: 2,
      trainingMode: 'powerlifting',
      goal: 'force',
      coachProfile: 'full',
      coachEnabled: true,
      targets: { bench: 120, squat: 150, deadlift: 180 },
      onboardingPRs: { bench: 80, squat: 110, deadlift: 140 },
      onboardingDate: new Date(now - 60 * day).toISOString(),
      injuries: [],
      secondaryActivities: [],
      programMode: 'auto',
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      _realLevel: null,
      tdeeAdjustment: 0
    },
    logs,
    bestPR: { bench: 82.5, squat: 115, deadlift: 155 },
    exercises: {
      'Squat': { shadowWeight: 107.5 },
      'Développé couché': { shadowWeight: 77.5 },
      'Soulevé de Terre': { shadowWeight: 132.5 }
    },
    body: [
      { date: new Date(now - 30*day).toISOString().split('T')[0], weight: 82.5 },
      { date: new Date(now - 15*day).toISOString().split('T')[0], weight: 82.0 },
      { date: new Date(now - 2*day).toISOString().split('T')[0], weight: 82.2 }
    ],
    reports: [],
    routine: null,
    keyLifts: ['Squat', 'Développé couché', 'Soulevé de Terre'],
    wellbeingHistory: [],
    todayWellbeing: null,
    weeklyActivities: [],
    readiness: [],
    gamification: {
      xp: 1250, level: 5, streak: 7, badges: [], streakFreezes: 2,
      freezesUsedAt: [], freezeProtectedWeeks: [], lastTab: 'tab-seances'
    },
    weeklyPlan: null,
    updatedAt: now
  };
}

async function shot(page, name, desc) {
  const file = path.join(OUT_DIR, name + '.png');
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${name}.png — ${desc}`);
}

async function clickAndShot(page, selector, filename, desc, delay = 900) {
  try {
    // Try normal click first, fall back to force click via JS
    const el = await page.$(selector);
    if (!el) { console.log(`  ⚠ Not found: ${selector}`); return false; }
    await el.evaluate(node => node.click());
    await page.waitForTimeout(delay);
    await shot(page, filename, desc);
    return true;
  } catch (e) {
    console.log(`  ⚠ Could not click [${selector}]: ${e.message.split('\n')[0]}`);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--disable-web-security']
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await ctx.newPage();

  // ── 1. Inject DB via initScript (runs before any page JS) ────
  const demoDb = buildDemoDB();
  await page.addInitScript(({ key, db }) => {
    try { localStorage.setItem(key, JSON.stringify(db)); } catch(e) {}
  }, { key: STORAGE_KEY, db: demoDb });

  console.log('Loading app with demo DB…');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  await shot(page, '00-landing', 'Initial load (should show main tabs, not onboarding)');

  // ── 2. Tab: Séances → each sub-tab ──────────────────────────
  console.log('\n── Séances tab ──');
  await clickAndShot(page, '[data-tab="tab-seances"]', '01-seances-historique', 'Séances — Historique (default)');
  await clickAndShot(page, 'button[onclick*="seances-programme"]', '01-seances-programme', 'Séances → Programme sub-tab');
  await clickAndShot(page, 'button[onclick*="seances-coach"]',     '01-seances-coach',     'Séances → Coach sub-tab');
  await clickAndShot(page, 'button[onclick*="seances-go"]',        '01-seances-go',        'Séances → GO sub-tab');

  // ── 3. Coach sub-tab: Today + scrolled ──────────────────────
  console.log('\n── Coach sub-tab ──');
  await clickAndShot(page, '[data-tab="tab-seances"]', '__tmp', 'nav back to seances');
  await clickAndShot(page, 'button[onclick*="seances-coach"]', '__tmp2', 'open coach');
  await clickAndShot(page, 'button[onclick*="coach-today"]', '03-coach-today', 'Coach → Aujourd\'hui');
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(400);
  await shot(page, '03-coach-today-scrolled', 'Coach → Aujourd\'hui (scrolled)');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ── 4. Stats tab + sub-tabs ──────────────────────────────────
  console.log('\n── Stats tab ──');
  await clickAndShot(page, '[data-tab="tab-stats"]', '04-stats-volume',  'Stats → Volume (default)');
  await clickAndShot(page, 'button[onclick*="stats-muscles"]', '04-stats-muscles', 'Stats → Muscles');
  await clickAndShot(page, 'button[onclick*="stats-records"]', '04-stats-records', 'Stats → Records');
  await clickAndShot(page, 'button[onclick*="stats-cardio"]',  '04-stats-cardio',  'Stats → Cardio');

  // ── 5. Social tab ────────────────────────────────────────────
  console.log('\n── Social tab ──');
  await clickAndShot(page, '[data-tab="tab-social"]', '05-social', 'Social tab');

  // ── 6. Profil tab + sub-tabs ─────────────────────────────────
  console.log('\n── Profil tab ──');
  await clickAndShot(page, '[data-tab="tab-profil"]', '06-profil-corps', 'Profil → Corps (default)');
  await clickAndShot(page, 'button[onclick*="tab-settings"]', '06-profil-reglages', 'Profil → Réglages');

  // ── 7. GO sub-tab (detailed) ─────────────────────────────────
  console.log('\n── GO sub-tab ──');
  await clickAndShot(page, '[data-tab="tab-seances"]', '__tmp3', 'back to seances');
  await clickAndShot(page, 'button[onclick*="seances-go"]', '07-go', 'GO sub-tab');
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(400);
  await shot(page, '07-go-scrolled', 'GO sub-tab scrolled');

  await browser.close();

  // ── 8. Cold-start scenario (separate context — no initScript) ──
  console.log('\n── Cold start scenario (fresh context) ──');
  const browser2 = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
  const ctx2 = await browser2.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();

  const coldDB = buildDemoDB();
  coldDB.logs = [];
  coldDB.exercises = {};
  coldDB.bestPR = {};
  await page2.addInitScript(({ key, db }) => {
    try { localStorage.setItem(key, JSON.stringify(db)); } catch(e) {}
  }, { key: STORAGE_KEY, db: coldDB });

  await page2.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page2.waitForTimeout(2500);
  await clickAndShot(page2, '[data-tab="tab-seances"]', '__cs1', 'cold start nav seances');
  await clickAndShot(page2, 'button[onclick*="seances-coach"]', '__cs2', 'cold start nav coach');
  await page2.waitForTimeout(500);
  await shot(page2, '08-cold-start-coach', 'Cold start — Coach tab (should show welcome card)');
  await browser2.close();

  // Cleanup temp screenshots
  ['__tmp','__tmp2','__tmp3','__cs1','__cs2'].forEach(name => {
    const f = path.join(OUT_DIR, name + '.png');
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });

  console.log('\nDone — screenshots in', OUT_DIR);
})();
