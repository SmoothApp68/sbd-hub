// Playwright Audit v128 — TrainHub Ultra-Complet
'use strict';
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8765';
const STORAGE_KEY = 'SBD_HUB_V29';
const OUT_DIR = path.join(__dirname, 'screenshots', 'v128');
fs.mkdirSync(OUT_DIR, { recursive: true });

const consoleErrors = [];
const undefinedNaN = [];

function buildFullDB() {
  const now = Date.now();
  const day = 86400000;

  function sqSet(weight, reps, rpe, isWarmup) {
    return { weight, reps, rpe: rpe || 7, isWarmup: !!isWarmup, isBackOff: false };
  }
  function makeLog(daysAgo, exercises) {
    const ts = now - daysAgo * day;
    return {
      timestamp: ts,
      shortDate: new Date(ts).toISOString().split('T')[0],
      volume: exercises.reduce((s, e) => s + (e.allSets || []).reduce((ss, set) => ss + (set.weight * set.reps), 0), 0),
      exercises
    };
  }

  const logs = [
    makeLog(1, [
      { name: 'Squat', isPrimary: true, slot: 'primary', allSets: [sqSet(80,3,6,true), sqSet(100,5,7), sqSet(105,5,8), sqSet(107.5,5,8.5), sqSet(95,8,7)], maxRM: 130 },
      { name: 'Développé couché', isPrimary: true, slot: 'primary', allSets: [sqSet(60,3,6,true), sqSet(70,5,7), sqSet(75,5,8), sqSet(77.5,5,8.5)], maxRM: 100 },
      { name: 'Soulevé de Terre', isPrimary: false, slot: 'secondary', allSets: [sqSet(100,3,6,true), sqSet(130,3,8), sqSet(132.5,3,8.5)], maxRM: 160 }
    ]),
    makeLog(4, [
      { name: 'Squat', isPrimary: true, slot: 'primary', allSets: [sqSet(97.5,5,7.5), sqSet(102.5,5,8)], maxRM: 128 },
      { name: 'Développé couché', isPrimary: true, slot: 'primary', allSets: [sqSet(72.5,5,8)], maxRM: 98 }
    ]),
    makeLog(8, [
      { name: 'Squat', isPrimary: true, slot: 'primary', allSets: [sqSet(95,5,7), sqSet(100,5,8)], maxRM: 125 },
      { name: 'Soulevé de Terre', isPrimary: false, slot: 'secondary', allSets: [sqSet(127.5,3,8)], maxRM: 157 }
    ]),
    makeLog(11, [
      { name: 'Développé couché', isPrimary: true, slot: 'primary', allSets: [sqSet(70,5,7.5)], maxRM: 95 },
      { name: 'Squat', isPrimary: true, slot: 'primary', allSets: [sqSet(92.5,5,7)], maxRM: 122 }
    ]),
    makeLog(15, [
      { name: 'Squat', isPrimary: true, slot: 'primary', allSets: [sqSet(90,5,7)], maxRM: 118 },
      { name: 'Soulevé de Terre', isPrimary: false, slot: 'secondary', allSets: [sqSet(125,3,7.5)], maxRM: 153 }
    ]),
    makeLog(18, [
      { name: 'Développé couché', isPrimary: true, slot: 'primary', allSets: [sqSet(67.5,5,7.5)], maxRM: 92 },
      { name: 'Squat', isPrimary: true, slot: 'primary', allSets: [sqSet(87.5,5,7)], maxRM: 115 }
    ]),
    makeLog(25, [
      { name: 'Squat', isPrimary: true, slot: 'primary', allSets: [sqSet(85,5,7)], maxRM: 113 },
      { name: 'Soulevé de Terre', isPrimary: false, slot: 'secondary', allSets: [sqSet(120,3,7.5)], maxRM: 150 }
    ])
  ];

  const rhrHistory = [];
  for (let d = 0; d < 14; d++) {
    rhrHistory.push({ date: new Date(now - d * day).toISOString().split('T')[0], rhr: 52 + Math.round(Math.random() * 4), hrv: 60 + Math.round(Math.random() * 10) });
  }

  return {
    user: {
      name: 'Alex',
      bw: 82,
      height: 178,
      age: 27,
      level: 'intermediaire',
      gender: 'male',
      onboarded: true,
      onboardingVersion: 3,
      trainingMode: 'powerbuilding',
      goal: 'force',
      coachProfile: 'full',
      coachEnabled: true,
      targets: { bench: 120, squat: 150, deadlift: 180 },
      onboardingPRs: { bench: 80, squat: 110, deadlift: 140 },
      onboardingDate: new Date(now - 60 * day).toISOString(),
      injuries: [],
      secondaryActivities: [
        { id: Date.now(), type: 'natation', duration: 45, intensity: 3, date: new Date(now - 2 * day).toISOString().split('T')[0] }
      ],
      programMode: 'auto',
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      _realLevel: null,
      tdeeAdjustment: 0,
      kcalBase: 2800,
      bwBase: 82,
      targetBW: null,
      vocabLevel: 2,
      obProfile: 'intermediaire',
      skipPRs: false,
      skipRPE: false,
      menstrualEnabled: false,
      menstrualData: null,
      weightCut: null,
      fatPct: null
    },
    logs,
    bestPR: { bench: 82.5, squat: 115, deadlift: 155 },
    exercises: {
      'Squat': { shadowWeight: 107.5, e1rmHistory: [{ ts: now - 2*day, e1rm: 128 }, { ts: now - 5*day, e1rm: 125 }] },
      'Développé couché': { shadowWeight: 77.5, e1rmHistory: [{ ts: now - 2*day, e1rm: 97 }] },
      'Soulevé de Terre': { shadowWeight: 132.5, e1rmHistory: [{ ts: now - 2*day, e1rm: 157 }] }
    },
    body: [
      { date: new Date(now - 30*day).toISOString().split('T')[0], weight: 82.5, ts: now - 30*day },
      { date: new Date(now - 20*day).toISOString().split('T')[0], weight: 82.2, ts: now - 20*day },
      { date: new Date(now - 10*day).toISOString().split('T')[0], weight: 82.0, ts: now - 10*day },
      { date: new Date(now - 2*day).toISOString().split('T')[0], weight: 82.1, ts: now - 2*day }
    ],
    rhrHistory,
    reports: [],
    routine: null,
    keyLifts: ['Squat', 'Développé couché', 'Soulevé de Terre'],
    wellbeingHistory: [
      { date: new Date(now - day).toISOString().split('T')[0], sleep: 7, readiness: 75, mood: 'good', ts: now - day }
    ],
    todayWellbeing: null,
    weeklyActivities: [],
    readiness: [
      { ts: now - day, score: 75, sleep: 7.5 }
    ],
    gamification: {
      xp: 1250, level: 5, streak: 7, badges: ['pr_hunter'], streakFreezes: 2,
      freezesUsedAt: [], freezeProtectedWeeks: [], lastTab: 'tab-seances'
    },
    weeklyPlan: null,
    updatedAt: now
  };
}

function buildColdDB() {
  const now = Date.now();
  const db = buildFullDB();
  db.logs = [];
  db.exercises = {};
  db.bestPR = {};
  db.body = [];
  db.rhrHistory = [];
  db.readiness = [];
  db.wellbeingHistory = [];
  db.user.onboarded = true;
  db.user.onboardingVersion = 3;
  db.user.skipPRs = true;
  db.user.obProfile = 'debutant';
  db.user.vocabLevel = 1;
  return db;
}

async function shot(page, name, desc) {
  const file = path.join(OUT_DIR, name + '.png');
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${name}.png — ${desc}`);
  return file;
}

async function clickTab(page, selector, delay = 600) {
  try {
    const el = await page.$(selector);
    if (!el) { console.log(`  ⚠ Tab not found: ${selector}`); return false; }
    await el.evaluate(n => n.click());
    await page.waitForTimeout(delay);
    return true;
  } catch(e) {
    console.log(`  ⚠ Click error [${selector}]: ${e.message.split('\n')[0]}`);
    return false;
  }
}

async function checkUndefined(page, context) {
  const result = await page.evaluate(() => {
    const body = document.body.innerText || '';
    const undefs = [];
    if (body.includes('undefined')) {
      // Get visible text nodes with 'undefined'
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes('undefined') && node.parentElement && node.parentElement.offsetParent !== null) {
          undefs.push(node.textContent.trim().substring(0, 80));
        }
      }
    }
    const nans = [];
    if (body.includes('NaN')) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes('NaN') && node.parentElement && node.parentElement.offsetParent !== null) {
          nans.push(node.textContent.trim().substring(0, 80));
        }
      }
    }
    return { undefs, nans };
  });
  if (result.undefs.length > 0) {
    console.log(`  🔴 UNDEFINED in [${context}]:`, result.undefs);
    undefinedNaN.push({ context, type: 'undefined', values: result.undefs });
  }
  if (result.nans.length > 0) {
    console.log(`  🔴 NaN in [${context}]:`, result.nans);
    undefinedNaN.push({ context, type: 'NaN', values: result.nans });
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--disable-web-security', '--no-sandbox']
  });

  // ── SCENARIO 1 : DB complète (utilisateur intermédiaire) ──────────────────
  console.log('\n════════════════════════════════════════');
  console.log('  SCENARIO 1 — DB complète (intermédiaire)');
  console.log('════════════════════════════════════════');

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await ctx.newPage();

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ context: 'full-db', msg: msg.text() });
      console.log(`  🔴 JS ERROR: ${msg.text().substring(0, 120)}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ context: 'full-db', msg: err.message });
    console.log(`  🔴 PAGE ERROR: ${err.message.substring(0, 120)}`);
  });

  const fullDB = buildFullDB();
  await page.addInitScript(({ key, db }) => {
    try { localStorage.setItem(key, JSON.stringify(db)); } catch(e) {}
  }, { key: STORAGE_KEY, db: fullDB });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  await shot(page, '00-landing', 'Landing — DB complète');
  await checkUndefined(page, 'landing');

  // ── Séances → Historique (default) ────────────────────────────
  console.log('\n── Séances ──');
  await clickTab(page, '[data-tab="tab-seances"]');
  await shot(page, '01-seances-historique', 'Séances — Historique');
  await checkUndefined(page, 'seances-historique');

  // ── Séances → Programme ───────────────────────────────────────
  await clickTab(page, 'button[onclick*="seances-programme"]');
  await shot(page, '02-seances-programme', 'Séances → Programme (vue semaine)');
  await checkUndefined(page, 'seances-programme');

  // Scroll pour voir plus
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  await shot(page, '02-seances-programme-scrolled', 'Séances → Programme (scrolled)');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ── Séances → Coach ────────────────────────────────────────────
  console.log('\n── Coach ──');
  await clickTab(page, 'button[onclick*="seances-coach"]');
  await shot(page, '03-coach-today', 'Coach → Aujourd\'hui');
  await checkUndefined(page, 'coach-today');

  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  await shot(page, '03-coach-today-scrolled', 'Coach → Aujourd\'hui (scrolled)');
  await page.evaluate(() => window.scrollTo(0, 0));

  // Coach sub-tabs
  await clickTab(page, 'button[onclick*="coach-diagnostic"]');
  await shot(page, '03-coach-diagnostic', 'Coach → Diagnostic');
  await checkUndefined(page, 'coach-diagnostic');

  await clickTab(page, 'button[onclick*="coach-budget"]');
  await shot(page, '03-coach-budget', 'Coach → Budget Récupération');
  await checkUndefined(page, 'coach-budget');

  // ── Séances → GO ───────────────────────────────────────────────
  console.log('\n── GO ──');
  await clickTab(page, 'button[onclick*="seances-go"]');
  await page.waitForTimeout(800);
  await shot(page, '04-go-idle', 'GO — idle view');
  await checkUndefined(page, 'go-idle');

  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  await shot(page, '04-go-idle-scrolled', 'GO — idle scrolled');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ── Stats ──────────────────────────────────────────────────────
  console.log('\n── Stats ──');
  await clickTab(page, '[data-tab="tab-stats"]');
  await shot(page, '05-stats-volume', 'Stats → Volume');
  await checkUndefined(page, 'stats-volume');

  await clickTab(page, 'button[onclick*="stats-muscles"]');
  await shot(page, '05-stats-muscles', 'Stats → Muscles');
  await checkUndefined(page, 'stats-muscles');

  await clickTab(page, 'button[onclick*="stats-records"]');
  await shot(page, '05-stats-records', 'Stats → Records');
  await checkUndefined(page, 'stats-records');

  await clickTab(page, 'button[onclick*="stats-cardio"]');
  await shot(page, '05-stats-cardio', 'Stats → Cardio');
  await checkUndefined(page, 'stats-cardio');

  // ── Social ─────────────────────────────────────────────────────
  console.log('\n── Social ──');
  await clickTab(page, '[data-tab="tab-social"]');
  await shot(page, '06-social', 'Social — feed');
  await checkUndefined(page, 'social');

  // ── Profil → Corps ─────────────────────────────────────────────
  console.log('\n── Profil ──');
  await clickTab(page, '[data-tab="tab-profil"]');
  await shot(page, '07-profil-corps', 'Profil → Corps');
  await checkUndefined(page, 'profil-corps');

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(300);
  await shot(page, '07-profil-corps-scrolled', 'Profil → Corps (scrolled)');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ── Réglages ───────────────────────────────────────────────────
  await clickTab(page, 'button[onclick*="tab-settings"]', 800);
  await shot(page, '08-reglages', 'Réglages — profil athlète');
  await checkUndefined(page, 'reglages');

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  await shot(page, '08-reglages-scrolled', 'Réglages (scrolled — weight cut, health connect, bluetooth)');
  await checkUndefined(page, 'reglages-scrolled');
  await page.evaluate(() => window.scrollTo(0, 0));

  await browser.close();

  // ── SCENARIO 2 : Cold Start (débutant, DB vide) ───────────────
  console.log('\n════════════════════════════════════════');
  console.log('  SCENARIO 2 — Cold Start (débutant, DB vide)');
  console.log('════════════════════════════════════════');

  const browser2 = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--disable-web-security', '--no-sandbox']
  });
  const ctx2 = await browser2.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();

  page2.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ context: 'cold-start', msg: msg.text() });
      console.log(`  🔴 JS ERROR (cold): ${msg.text().substring(0, 120)}`);
    }
  });

  const coldDB = buildColdDB();
  await page2.addInitScript(({ key, db }) => {
    try { localStorage.setItem(key, JSON.stringify(db)); } catch(e) {}
  }, { key: STORAGE_KEY, db: coldDB });

  await page2.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page2.waitForTimeout(3000);
  await shot(page2, '09-cold-landing', 'Cold Start — landing');
  await checkUndefined(page2, 'cold-landing');

  await clickTab(page2, '[data-tab="tab-seances"]');
  await clickTab(page2, 'button[onclick*="seances-coach"]');
  await shot(page2, '09-cold-coach', 'Cold Start — Coach (welcome card)');
  await checkUndefined(page2, 'cold-coach');

  await clickTab(page2, 'button[onclick*="seances-go"]', 800);
  await shot(page2, '09-cold-go', 'Cold Start — GO (idle / 5-rep test card)');
  await checkUndefined(page2, 'cold-go');

  await clickTab(page2, 'button[onclick*="seances-programme"]');
  await shot(page2, '09-cold-programme', 'Cold Start — Programme');
  await checkUndefined(page2, 'cold-programme');

  await browser2.close();

  // ── Rapport ────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('  RAPPORT AUDIT v128');
  console.log('════════════════════════════════════════');

  const errCount = consoleErrors.length;
  const undefCount = undefinedNaN.filter(x => x.type === 'undefined').length;
  const nanCount = undefinedNaN.filter(x => x.type === 'NaN').length;

  console.log(`\n  JS Errors     : ${errCount}`);
  console.log(`  Undefined     : ${undefCount} pages`);
  console.log(`  NaN           : ${nanCount} pages`);

  if (consoleErrors.length > 0) {
    console.log('\n  🔴 Console Errors :');
    consoleErrors.forEach(e => console.log(`    [${e.context}] ${e.msg.substring(0, 150)}`));
  }
  if (undefinedNaN.length > 0) {
    console.log('\n  🔴 Undefined/NaN Details :');
    undefinedNaN.forEach(u => console.log(`    [${u.context}] ${u.type}: ${u.values.slice(0,3).join(' | ')}`));
  }

  // Write JSON report
  const report = { timestamp: new Date().toISOString(), consoleErrors, undefinedNaN };
  fs.writeFileSync(path.join(__dirname, 'v128-audit-report.json'), JSON.stringify(report, null, 2));

  console.log(`\n  Screenshots: ${OUT_DIR}`);
  console.log('  Report: audit/v128-audit-report.json');
  console.log('\n  Status:', (errCount === 0 && undefCount === 0 && nanCount === 0) ? '✅ CLEAN' : '⚠️  ISSUES FOUND');
})();
