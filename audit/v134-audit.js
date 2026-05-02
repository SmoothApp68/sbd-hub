// ============================================================
// TrainHub v134 — Complete Audit (Phase A+B+C)
// Run: node audit/v134-audit.js
// ============================================================
'use strict';

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8788';
const OUT_DIR = path.join(__dirname, 'screenshots/v134');
fs.mkdirSync(OUT_DIR, { recursive: true });

const STORAGE_KEY = 'SBD_HUB_V29';

// ── Full test DB — all features enabled ─────────────────────
function buildDemoDB() {
  const now = Date.now();
  const day = 86400000;

  function makeLog(daysAgo, exercises, extra) {
    const ts = now - daysAgo * day;
    return Object.assign({
      timestamp: ts,
      shortDate: new Date(ts).toISOString().split('T')[0],
      duration: 3600,
      volume: exercises.reduce((s, e) => s + (e.allSets || []).reduce((ss, set) => ss + ((set.weight||0) * (set.reps||0)), 0), 0),
      exercises
    }, extra || {});
  }

  function s(weight, reps, rpe, isWarmup) { return { weight, reps, rpe: rpe||8, isWarmup: isWarmup||false }; }

  // Last session had a fail rep (RPE 10) → getMentalRecoveryPenalty should return 0.97
  const logs = [
    makeLog(1, [
      { name: 'Squat', allSets: [s(100,5,7,true), s(120,3,9), s(125,2,10), s(110,5,8)], maxRM: 140, isPR: true },
      { name: 'Développé couché', allSets: [s(70,5,7,true), s(87.5,3,9), s(90,1,10,false)], maxRM: 105, isPR: true },
      { name: 'Soulevé de Terre', allSets: [s(130,3,8), s(140,3,9)], maxRM: 165 }
    ]),
    makeLog(4, [
      { name: 'Squat', allSets: [s(115,5,8), s(117.5,5,8.5)], maxRM: 137 },
      { name: 'Développé couché', allSets: [s(82.5,5,8), s(85,5,8.5)], maxRM: 102 },
      { name: 'Rowing Barre', allSets: [s(80,6,7.5), s(82.5,6,8)], maxRM: null }
    ]),
    makeLog(8, [
      { name: 'Squat', allSets: [s(110,5,7.5), s(112.5,5,8)], maxRM: 133 },
      { name: 'Soulevé de Terre', allSets: [s(135,3,8), s(137.5,3,8.5)], maxRM: 162 }
    ]),
    makeLog(11, [
      { name: 'Développé couché', allSets: [s(80,5,8), s(82.5,5,8)], maxRM: 100 },
      { name: 'Squat', allSets: [s(107.5,5,7.5)], maxRM: 130 }
    ]),
    makeLog(15, [
      { name: 'Squat', allSets: [s(105,5,7.5), s(107.5,5,8)], maxRM: 128 },
      { name: 'Soulevé de Terre', allSets: [s(130,3,7.5)], maxRM: 158 }
    ]),
    makeLog(18, [
      { name: 'Développé couché', allSets: [s(77.5,5,7.5)], maxRM: 97 },
      { name: 'Squat', allSets: [s(102.5,5,7.5)], maxRM: 125 }
    ]),
    // Last week — more volume for spike detection
    makeLog(5, [
      { name: 'Squat', allSets: [s(112,5,8), s(114,5,8)], maxRM: 135 },
      { name: 'Développé couché', allSets: [s(83,5,8), s(85,5,8)], maxRM: 101 },
      { name: 'Rowing Barre', allSets: [s(79,6,7.5)], maxRM: null }
    ]),
    makeLog(6, [
      { name: 'Squat', allSets: [s(113,5,8)], maxRM: 136, isPR: true },
    ]),
  ];

  // Weekly plan
  const weeklyPlan = {
    days: [
      { day: 'Lundi', rest: false, title: 'Squat & Jambes', exercises: [
        { name: 'Squat', type: 'weight', restSeconds: 300, isPrimary: true, sets: [s(120,3,8), s(120,3,8), s(120,3,8)] }
      ]},
      { day: 'Mardi', rest: false, title: 'Bench & Push', exercises: [
        { name: 'Développé couché', type: 'weight', restSeconds: 240, isPrimary: true, sets: [s(87.5,5,8), s(87.5,5,8)] }
      ]},
      { day: 'Mercredi', rest: true, title: 'Récupération', exercises: [] },
      { day: 'Jeudi', rest: false, title: 'Deadlift & Pull', exercises: [
        { name: 'Soulevé de Terre', type: 'weight', restSeconds: 300, isPrimary: true, sets: [s(140,3,8), s(140,3,8)] }
      ]},
      { day: 'Vendredi', rest: false, title: 'Points Faibles', exercises: [
        { name: 'Développé couché', type: 'weight', restSeconds: 240, sets: [s(75,8,7.5), s(75,8,7.5)] }
      ]},
      { day: 'Samedi', rest: true, title: 'Repos', exercises: [] },
      { day: 'Dimanche', rest: true, title: 'Repos', exercises: [] },
    ]
  };

  return {
    user: {
      name: 'Alex',
      bw: 82,
      height: 178,
      age: 28,
      gender: 'M',
      level: 'intermediaire',
      trainingMode: 'powerbuilding',
      goal: 'masse',
      kcalBase: 2800,
      onboarded: true,
      onboardingVersion: 3,
      obProfile: 'intermediaire',
      programMode: 'auto',
      coachProfile: 'full',
      coachEnabled: true,
      vocabLevel: 2,
      skipPRs: false,
      skipRPE: false,
      menstrualEnabled: false,
      menstrualData: null,
      onboardingDate: new Date(Date.now() - 90 * 86400000).toISOString(),
      fatPct: null,
      lpActive: false,
      lpStrikes: {},
      consentHealth: true,
      consentHealthDate: new Date(Date.now() - 30 * 86400000).toISOString(),
      programParams: {
        goals: ['force', 'masse'],
        freq: 4,
        selectedDays: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi'],
        mat: 'salle',
        duration: 75,
        injuries: [],
        cardio: 'integre'
      },
      weightCut: {
        active: true,
        startWeight: 85,
        targetWeight: 82,
        currentWeight: 82,
        competitionDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0]  // J-10 → tapering week 2
      },
      prehabEnabled: true,
      supersetPreference: 'auto',
      injuries: [],
      secondaryActivities: [],
      tdeeAdjustment: 0,
      targetBW: 82,
      targets: { bench: 100, squat: 135, deadlift: 165 }
    },
    routine: {
      Lundi: '🦵 Squat & Jambes',
      Mardi: '💪 Bench & Push',
      Mercredi: '😴 Repos',
      Jeudi: '🔙 Deadlift & Pull',
      Vendredi: '🎯 Points Faibles',
      Samedi: '😴 Repos',
      Dimanche: '😴 Repos'
    },
    weeklyPlan,
    logs,
    exercises: {
      'Squat': { e1rm: 140, shadowWeight: 120, dupZones: { force: 140, hypertrophie: 135 } },
      'Développé couché': { e1rm: 105, shadowWeight: 87.5, dupZones: { force: 105, hypertrophie: 100 } },
      'Soulevé de Terre': { e1rm: 165, shadowWeight: 140, dupZones: { force: 165, hypertrophie: 158 } }
    },
    bestPR: { squat: 140, bench: 105, deadlift: 165 },
    reports: [],
    body: [
      { ts: Date.now() - 1 * 86400000, weight: 82.0, fatPct: null },
      { ts: Date.now() - 7 * 86400000, weight: 82.3 },
      { ts: Date.now() - 14 * 86400000, weight: 82.8 },
      { ts: Date.now() - 21 * 86400000, weight: 83.2 }
    ],
    rhrHistory: [
      { date: new Date().toISOString().split('T')[0], value: 58, hrv: 72 },
      { date: new Date(Date.now() - 86400000).toISOString().split('T')[0], value: 56, hrv: 68 },
      { date: new Date(Date.now() - 2*86400000).toISOString().split('T')[0], value: 57, hrv: 65 },
      { date: new Date(Date.now() - 3*86400000).toISOString().split('T')[0], value: 59, hrv: 70 },
      { date: new Date(Date.now() - 4*86400000).toISOString().split('T')[0], value: 55, hrv: 74 },
      { date: new Date(Date.now() - 5*86400000).toISOString().split('T')[0], value: 57, hrv: 69 },
      { date: new Date(Date.now() - 6*86400000).toISOString().split('T')[0], value: 58, hrv: 71 },
      { date: new Date(Date.now() - 7*86400000).toISOString().split('T')[0], value: 60, hrv: 66 },
    ],
    weeklyLogs: [
      { week: '2026-W18', weight: 82.0, calories: 2850, sleep: 7.5, hrv: 71 },
      { week: '2026-W17', weight: 82.3, calories: 2780, sleep: 7.2, hrv: 68 }
    ],
    garminConnected: true,
    garminLastSync: Date.now() - 3600000,
    todayWellbeing: {
      date: new Date().toISOString().split('T')[0],
      sleep: 4,
      fatigue: 3,
      motivation: 4,
      stress: 2,
      rhrAlert: null
    },
    social: { onboardingCompleted: true, pseudo: 'Alex', avatar: null, badges: ['first_session', 'streak_7'] },
    gamification: { totalPoints: 1250, streakWeeks: 8, streakFreezes: 1, badges: ['first_session', 'streak_7', 'first_pr'] },
    smartStreak: 8,
    smartStreakRecord: 8,
    notificationsSent: [],
    customProgramTemplate: null,
    customProgramBackups: [],
    lastSync: Date.now() - 300000,
    updatedAt: Date.now(),
    _cloudUpdatedAt: Date.now() - 300000
  };
}

// ── Phase C — Algo assertions (run in browser context) ─────────
async function runAlgoTests(page) {
  const results = await page.evaluate(() => {
    const tests = [];
    function assert(label, condition) {
      tests.push({ label, pass: !!condition });
    }

    // FIX 1 — Rest times
    assert('getOptimalRestTime is function', typeof getOptimalRestTime === 'function');
    if (typeof getOptimalRestTime === 'function') {
      assert('getOptimalRestTime >90% → 300s', getOptimalRestTime(143, 157, 'composé') === 300);
      assert('getOptimalRestTime >80% → 240s', getOptimalRestTime(130, 157, 'composé') === 240);
      assert('getOptimalRestTime >70% → 180s', getOptimalRestTime(115, 157, 'composé') === 180);
      assert('getOptimalRestTime <70% → 90s',  getOptimalRestTime(100, 157, 'composé') === 90);
      assert('getOptimalRestTime isolation → 90s', getOptimalRestTime(140, 157, 'isolation') === 90);
    }

    // FIX 2 — Volume spike
    assert('detectVolumeSpike is function', typeof detectVolumeSpike === 'function');

    // FIX 3 — Tapering
    assert('getTaperingWeek is function',       typeof getTaperingWeek === 'function');
    assert('getTaperingFlatAdjustment is function', typeof getTaperingFlatAdjustment === 'function');
    if (typeof getTaperingWeek === 'function') {
      // competitionDate = J-10, so taperingWeek should be 2
      assert('getTaperingWeek returns 2 (J-10)', getTaperingWeek() === 2);
    }

    // FIX 4 — Momentum + Mental recovery
    assert('detectMomentum is function',          typeof detectMomentum === 'function');
    assert('getMentalRecoveryPenalty is function', typeof getMentalRecoveryPenalty === 'function');
    if (typeof detectMomentum === 'function') {
      const m = detectMomentum();
      assert('detectMomentum returns object',    m && typeof m === 'object');
      assert('detectMomentum active (2 PRs)',    m && m.active === true);
    }
    if (typeof getMentalRecoveryPenalty === 'function') {
      // Last session has RPE 10 → should return 0.97
      assert('getMentalRecoveryPenalty returns 0.97', getMentalRecoveryPenalty() === 0.97);
    }

    // DUP zones
    assert('getDUPZone is function', typeof getDUPZone === 'function');
    if (typeof getDUPZone === 'function') {
      assert('getDUPZone(3) → force',        getDUPZone(3) === 'force');
      assert('getDUPZone(8) → hypertrophie', getDUPZone(8) === 'hypertrophie');
      assert('getDUPZone(15) → vitesse',     getDUPZone(15) === 'vitesse');
    }

    // Stagnation
    assert('classifyStagnation is function', typeof classifyStagnation === 'function');

    // LP system
    assert('isInLP is function',        typeof isInLP === 'function');
    assert('recordLPFailure is function', typeof recordLPFailure === 'function');
    if (typeof isInLP === 'function') {
      assert('isInLP returns false (lpActive=false)', isInLP() === false);
    }

    // Activity TRIMP
    assert('calcActivityTRIMP is function', typeof calcActivityTRIMP === 'function');
    if (typeof calcActivityTRIMP === 'function') {
      const yogaTrimp = calcActivityTRIMP({ type: 'yoga', duration: 45, intensity: 2 });
      const swimTrimp = calcActivityTRIMP({ type: 'natation', duration: 45, intensity: 3 });
      assert('yoga at intensity 2 → 0 TRIMP (recovery)', yogaTrimp === 0);
      assert('natation intensity 3 → >0 TRIMP', swimTrimp > 0);
    }

    // RGPD functions
    assert('grantHealthConsent is function',    typeof grantHealthConsent === 'function');
    assert('revokeHealthConsent is function',   typeof revokeHealthConsent === 'function');
    assert('exportUserData is function',        typeof exportUserData === 'function');
    assert('requestAccountDeletion is function', typeof requestAccountDeletion === 'function');
    assert('checkWorkoutBackup is function',    typeof checkWorkoutBackup === 'function');
    assert('initWorkoutIDB is function',        typeof initWorkoutIDB === 'function');

    // LP cold start
    assert('calcStartWeightFromRPE5Test is function', typeof calcStartWeightFromRPE5Test === 'function');
    assert('getLPIncrement is function',        typeof getLPIncrement === 'function');

    return tests;
  });

  return results;
}

// ── Screenshot helper ─────────────────────────────────────────
async function shot(page, name, waitMs) {
  if (waitMs) await page.waitForTimeout(waitMs);
  const p = path.join(OUT_DIR, name + '.png');
  await page.screenshot({ path: p, fullPage: true });
  console.log('  📸', name);
  return p;
}

async function clickTab(page, selector) {
  try {
    const el = await page.$(selector);
    if (!el) { console.log('  ⚠ Not found:', selector); return; }
    await el.evaluate(n => n.click());
    await page.waitForTimeout(700);
  } catch(e) { console.log('  ⚠ Click failed:', selector, e.message.split('\n')[0]); }
}

// ── Main ──────────────────────────────────────────────────────
(async () => {
  const errors = [];
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--disable-web-security']
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await ctx.newPage();

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));

  // Inject DB via addInitScript so it's in localStorage BEFORE app JS runs
  const db = buildDemoDB();
  await page.addInitScript(({ key, db: dbObj }) => {
    try { localStorage.setItem(key, JSON.stringify(dbObj)); } catch(e) {}
  }, { key: STORAGE_KEY, db });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  // ── Phase C — Algo tests ─────────────────────────────────
  console.log('\n🧪 Phase C — Algo Tests\n');
  const algoResults = await runAlgoTests(page);
  let passed = 0, failed = 0;
  algoResults.forEach(r => {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.label}`);
    if (r.pass) passed++; else failed++;
  });
  console.log(`\n  Result: ${passed}/${algoResults.length} passed, ${failed} failed\n`);

  // ── Phase B — Visual screenshots ─────────────────────────
  console.log('\n📸 Phase B — Visual Audit\n');

  // Landing
  await shot(page, '00-landing');

  // 1. Séances → Coach sub-tab → Today
  await clickTab(page, '[data-tab="tab-seances"]');
  await shot(page, '01-seances');
  await clickTab(page, 'button[onclick*="seances-coach"]');
  await shot(page, '01-coach-top');
  // Try coach-today sub-tab
  await clickTab(page, 'button[onclick*="coach-today"]');
  await page.waitForTimeout(500);
  await shot(page, '01-coach-today');

  // 2. Programme sub-tab
  await clickTab(page, '[data-tab="tab-seances"]');
  await clickTab(page, 'button[onclick*="seances-programme"]');
  await shot(page, '02-programme');

  // 3. GO sub-tab
  await clickTab(page, '[data-tab="tab-seances"]');
  await clickTab(page, 'button[onclick*="seances-go"]');
  await shot(page, '03-go-idle');

  // 4. Stats tab
  await clickTab(page, '[data-tab="tab-stats"]');
  await shot(page, '04-stats-volume');
  await clickTab(page, 'button[onclick*="stats-records"]');
  await shot(page, '04-stats-records');
  await clickTab(page, 'button[onclick*="stats-cardio"]');
  await shot(page, '04-stats-cardio');

  // 5. Social tab
  await clickTab(page, '[data-tab="tab-social"]');
  await shot(page, '05-social');

  // 6. Profil → Réglages
  await clickTab(page, '[data-tab="tab-profil"]');
  await shot(page, '06-profil');
  await clickTab(page, 'button[onclick*="tab-settings"]');
  await shot(page, '06-settings-top');
  // Scroll to RGPD section
  await page.evaluate(() => window.scrollTo(0, 99999));
  await page.waitForTimeout(600);
  await shot(page, '06-settings-rgpd');

  // 7. Coach today detail (scrolled through diagnostic)
  await clickTab(page, '[data-tab="tab-seances"]');
  await clickTab(page, 'button[onclick*="seances-coach"]');
  await clickTab(page, 'button[onclick*="coach-today"]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await shot(page, '07-coach-momentum');
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  await shot(page, '07-coach-diagnostic');

  // ── Check for visible NaN / undefined ─────────────────────
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasNaN = /\bNaN\b/.test(bodyText);
  const hasUndefined = /\bundefined\b/.test(bodyText);

  // Filter real errors (exclude known env non-issues)
  const realErrors = errors.filter(e => !e.includes('vibrate') && !e.includes('403') && !e.includes('CERT'));

  console.log('\n🔍 Content checks:');
  console.log('  ' + (hasNaN ? '❌' : '✅') + ' NaN visible: ' + hasNaN);
  console.log('  ' + (hasUndefined ? '❌' : '✅') + ' undefined visible: ' + hasUndefined);
  console.log('  JS errors (env): ' + (errors.length - realErrors.length) + ' (ignored)');
  console.log('  JS errors (real): ' + (realErrors.length === 0 ? '✅ 0' : '❌ ' + realErrors.length));
  if (realErrors.length) realErrors.slice(0, 5).forEach(e => console.log('    ❌', e));

  // ── Check new features visible ─────────────────────────────
  console.log('\n🔍 Feature visibility checks:');
  await clickTab(page, '[data-tab="tab-seances"]');
  await clickTab(page, 'button[onclick*="seances-coach"]');
  await page.waitForTimeout(500);
  const coachHtml = await page.evaluate(() => {
    const el = document.querySelector('#seances-coach');
    return el ? el.innerText : '';
  });
  const allHtml = await page.evaluate(() => document.body.innerText);
  const features = [
    ['RGPD: export button present', /Exporter mes données/i.test(allHtml)],
    ['RGPD: delete account present', /Supprimer mon compte/i.test(allHtml)],
    ['Tapering detected (J-10)', /Tapering|tapering/i.test(coachHtml) || /Tapering/i.test(allHtml)],
    ['No stack overflow', realErrors.filter(e => /stack/i.test(e)).length === 0],
  ];
  features.forEach(([label, ok]) => console.log('  ' + (ok ? '✅' : '⚠️ ') + ' ' + label));

  await browser.close();

  // ── Summary ───────────────────────────────────────────────
  const totalFailed = failed + (hasNaN ? 1 : 0) + (hasUndefined ? 1 : 0) + errors.length;
  console.log('\n' + '═'.repeat(50));
  console.log('v134 AUDIT SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Algo tests:   ${passed}/${algoResults.length} passed`);
  console.log(`NaN visible:  ${hasNaN ? 'YES ❌' : 'no ✅'}`);
  console.log(`undefined:    ${hasUndefined ? 'YES ❌' : 'no ✅'}`);
  console.log(`JS errors:    ${errors.length}`);
  console.log(`Screenshots:  ${fs.readdirSync(OUT_DIR).length} files in audit/screenshots/v134/`);
  console.log('═'.repeat(50));

  // Write results JSON for the report
  fs.writeFileSync(
    path.join(__dirname, 'v134-audit-results.json'),
    JSON.stringify({ algoResults, hasNaN, hasUndefined, jsErrors: errors, passed, failed, total: algoResults.length }, null, 2)
  );

  process.exit(totalFailed > 0 ? 1 : 0);
})();
