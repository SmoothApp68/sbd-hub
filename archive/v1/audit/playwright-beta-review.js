// playwright-beta-review.js — TrainHub v143 Beta Tester Simulation
// Profiles: J1 (no history) and J30 (20 logs)

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:35373';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots/review-v143');

// Ensure screenshots dir exists
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// ── J1 localStorage (cold start, no history) ──
const J1_DB = {
  user: {
    name: 'TestBeta', age: 28, bw: 80, height: 178, gender: 'M',
    onboardingProfile: 'intermediaire',
    programParams: { freq: 4, goal: 'force_physique', level: 'intermediate', intensity: 'modere' },
    onboardingPRs: { squat: 100, bench: 80, deadlift: 120 },
    barWeight: 20, units: 'kg', tier: 'premium', streak: 0, vocabLevel: 2,
    lpActive: true, lpStrikes: {}, coachProfile: 'full',
    activityTemplate: [{ type: 'natation', intensity: 3, days: ['Mercredi'], duration: 45, fixed: true }],
    onboardingDate: new Date(Date.now() - 3 * 86400000).toISOString(),
    secondaryActivities: [], activities: [], targets: { bench: 80, squat: 100, deadlift: 120 },
    goal: 'masse', level: 'intermediaire', onboarded: true, onboardingVersion: 2
  },
  logs: [], exercises: {}, bestPR: { bench: 0, squat: 0, deadlift: 0 },
  weeklyPlan: null, activityLogs: [], earnedBadges: {}, gamification: { xpHighWaterMark: 0 },
  _dupMigrated: false, _activityMigrated: true, _badgesMigrated: false,
  weeklyActivities: [], notificationsSent: [], rhrHistory: [],
  todayWellbeing: { date: new Date().toISOString().split('T')[0], sleep: 4, readiness: 4 }
};

// Build J30 logs
const j30Logs = [];
for (let i = 0; i < 20; i++) {
  j30Logs.push({
    id: 'log_' + i,
    timestamp: Date.now() - (i * 2 * 86400000),
    duration: 90,
    volume: 8000 + i * 200,
    exercises: [{
      name: 'Squat (Barre)', isPrimary: true,
      allSets: [
        { weight: 80 + i*2, reps: 5, rpe: String(7 + (i % 3)), isWarmup: false },
        { weight: 80 + i*2, reps: 5, rpe: String(7 + (i % 3)), isWarmup: false },
        { weight: 80 + i*2, reps: 5, rpe: String(7 + (i % 3)), isWarmup: false }
      ],
      maxRM: 95 + i, sets: 3
    }]
  });
}

const J30_DB = {
  ...JSON.parse(JSON.stringify(J1_DB)),
  logs: j30Logs,
  exercises: { 'Squat (Barre)': { e1rm: 120, shadowWeight: 118, lastRPE: 7.5 } },
  bestPR: { squat: 115, bench: 85, deadlift: 125 }
};

const errors = [];
const warnings = [];

async function injectAndLoad(page, dbObj) {
  const dbStr = JSON.stringify(dbObj);
  await page.addInitScript((data) => {
    localStorage.setItem('SBD_HUB_V29', data);
  }, dbStr);
}

async function captureConsoleErrors(page) {
  const pageErrors = [];
  const pageWarnings = [];
  page.on('console', msg => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
    if (msg.type() === 'warning') pageWarnings.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push('[pageerror] ' + err.message));
  return { pageErrors, pageWarnings };
}

async function waitForApp(page) {
  // Wait for app to initialize — look for nav bar or content
  try {
    await page.waitForSelector('.tab-btn, #tab-dash, .content-section', { timeout: 8000 });
  } catch(e) {
    // may not appear if login screen shown
  }
  await page.waitForTimeout(1500);
}

async function checkForUndefinedNaN(page) {
  const text = await page.textContent('body');
  const hasUndefined = /\bundefined\b/.test(text);
  const hasNaN = /\bNaN\b/.test(text);
  return { hasUndefined, hasNaN };
}

async function screenshot(page, filename, label) {
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`[SCREENSHOT] ${label} → ${filename}`);
  return filepath;
}

async function runJ1Tests(browser) {
  console.log('\n===== J1 PROFILE (COLD START) =====\n');
  const results = {};

  // ── Scenario 1: Coach Today tab ──
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const { pageErrors, pageWarnings } = await captureConsoleErrors(page);
    await injectAndLoad(page, J1_DB);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await waitForApp(page);

    // Navigate to Séances tab → Coach sub-tab
    try {
      await page.click('[data-tab="tab-seances"]', { timeout: 3000 });
      await page.waitForTimeout(500);
      const coachBtn = page.locator('button:has-text("Coach"), .stats-sub-pill:has-text("Coach")').first();
      await coachBtn.click({ timeout: 3000 });
      await page.waitForTimeout(800);
    } catch(e) {
      console.log('[WARN] Could not navigate to Coach tab:', e.message);
    }

    const { hasUndefined, hasNaN } = await checkForUndefinedNaN(page);
    await screenshot(page, '01-coach-j1.png', 'Coach Today J1');
    results.coach_j1 = {
      errors: pageErrors.length,
      warnings: pageWarnings.length,
      hasUndefined,
      hasNaN,
      errSamples: pageErrors.slice(0, 3),
      warnSamples: pageWarnings.slice(0, 3)
    };
    console.log('[S1] Coach J1 —', JSON.stringify(results.coach_j1, null, 2));
    await page.close();
  }

  // ── Scenario 2: GO tab idle ──
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const { pageErrors, pageWarnings } = await captureConsoleErrors(page);
    await injectAndLoad(page, J1_DB);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await waitForApp(page);

    try {
      await page.click('[data-tab="tab-seances"]', { timeout: 3000 });
      await page.waitForTimeout(500);
      const goBtn = page.locator('.stats-sub-pill:has-text("GO")').first();
      await goBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1000);
    } catch(e) {
      console.log('[WARN] Could not navigate to GO tab:', e.message);
    }

    const bodyText = await page.textContent('body').catch(() => '');
    const hasSessionExpress = /session express|express|démarrer|commencer/i.test(bodyText);
    const hasProgInfo = /programme|séance|exercice/i.test(bodyText);
    const { hasUndefined, hasNaN } = await checkForUndefinedNaN(page);
    await screenshot(page, '02-go-idle.png', 'GO tab idle J1');
    results.go_idle = {
      errors: pageErrors.length,
      hasUndefined,
      hasNaN,
      hasSessionExpress,
      hasProgInfo
    };
    console.log('[S2] GO Idle —', JSON.stringify(results.go_idle));
    await page.close();
  }

  // ── Scenario 3: GO tab active — start workout ──
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const { pageErrors, pageWarnings } = await captureConsoleErrors(page);
    await injectAndLoad(page, J1_DB);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await waitForApp(page);

    try {
      await page.click('[data-tab="tab-seances"]', { timeout: 3000 });
      await page.waitForTimeout(500);
      const goBtn = page.locator('.stats-sub-pill:has-text("GO")').first();
      await goBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1000);

      // Try to start a workout
      const startBtn = page.locator('button:has-text("Démarrer"), button:has-text("GO"), button:has-text("Commencer"), .go-start-btn, [onclick*="goStart"]').first();
      if (await startBtn.isVisible({ timeout: 2000 })) {
        await startBtn.click();
        await page.waitForTimeout(1500);
      }
    } catch(e) {
      console.log('[WARN] Could not start workout:', e.message);
    }

    const { hasUndefined, hasNaN } = await checkForUndefinedNaN(page);
    const bodyText = await page.textContent('body').catch(() => '');
    const hasWarmup = /échauffement|warmup|warm.up/i.test(bodyText);
    const hasPlateCalc = /calculateur|disques|assiette|plate/i.test(bodyText);
    await screenshot(page, '03-go-active.png', 'GO tab active J1');
    results.go_active = {
      errors: pageErrors.length,
      hasUndefined,
      hasNaN,
      hasWarmup,
      hasPlateCalc,
      errSamples: pageErrors.slice(0, 3)
    };
    console.log('[S3] GO Active —', JSON.stringify(results.go_active));
    await page.close();
  }

  // ── Scenario 4: Programme tab ──
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const { pageErrors, pageWarnings } = await captureConsoleErrors(page);
    await injectAndLoad(page, J1_DB);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await waitForApp(page);

    try {
      await page.click('[data-tab="tab-seances"]', { timeout: 3000 });
      await page.waitForTimeout(500);
      const progBtn = page.locator('.stats-sub-pill:has-text("Programme")').first();
      await progBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1200);
    } catch(e) {
      console.log('[WARN] Could not navigate to Programme tab:', e.message);
    }

    const { hasUndefined, hasNaN } = await checkForUndefinedNaN(page);
    const bodyText = await page.textContent('body').catch(() => '');
    const hasPlan = /lundi|mardi|mercredi|jeudi|vendredi|semaine|squat|bench|deadlift|soulevé/i.test(bodyText);
    await screenshot(page, '04-programme.png', 'Programme tab J1');
    results.programme = {
      errors: pageErrors.length,
      hasUndefined,
      hasNaN,
      hasPlan,
      errSamples: pageErrors.slice(0, 3)
    };
    console.log('[S4] Programme —', JSON.stringify(results.programme));
    await page.close();
  }

  // ── Scenario 5: Settings / Réglages ──
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const { pageErrors, pageWarnings } = await captureConsoleErrors(page);
    await injectAndLoad(page, J1_DB);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await waitForApp(page);

    try {
      await page.click('[data-tab="tab-profil"]', { timeout: 3000 });
      await page.waitForTimeout(500);
      const settingsBtn = page.locator('.stats-sub-pill:has-text("Réglages"), button:has-text("Réglages"), [onclick*="settings"]').first();
      if (await settingsBtn.isVisible({ timeout: 2000 })) {
        await settingsBtn.click();
        await page.waitForTimeout(800);
      }
    } catch(e) {
      console.log('[WARN] Could not navigate to Settings:', e.message);
    }

    const { hasUndefined, hasNaN } = await checkForUndefinedNaN(page);
    const bodyText = await page.textContent('body').catch(() => '');
    const hasKgLbs = /kg|lbs|livres/i.test(bodyText);
    const hasRGPD = /rgpd|données|confidentialité|supprimer/i.test(bodyText);
    const hasBarWeight = /barre|bar|20|olympique/i.test(bodyText);
    await screenshot(page, '05-reglages.png', 'Settings J1');
    results.settings = {
      errors: pageErrors.length,
      hasUndefined,
      hasNaN,
      hasKgLbs,
      hasRGPD,
      hasBarWeight,
      errSamples: pageErrors.slice(0, 3)
    };
    console.log('[S5] Settings —', JSON.stringify(results.settings));
    await page.close();
  }

  // ── Scenario 6: Waitlist page ──
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const { pageErrors, pageWarnings } = await captureConsoleErrors(page);
    await injectAndLoad(page, J1_DB);
    await page.goto(BASE_URL + '#waitlist', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const waitlistEl = await page.$('#waitlist-page');
    let waitlistVisible = false;
    if (waitlistEl) {
      const style = await waitlistEl.getAttribute('style');
      waitlistVisible = !style || !style.includes('display:none') && !style.includes('display: none');
    }

    const bodyText = await page.textContent('body').catch(() => '');
    const hasLoginOverlay = /connexion|login|sign in|se connecter/i.test(bodyText) && !waitlistVisible;
    const { hasUndefined, hasNaN } = await checkForUndefinedNaN(page);
    await screenshot(page, '06-waitlist.png', 'Waitlist page');
    results.waitlist = {
      errors: pageErrors.length,
      hasUndefined,
      hasNaN,
      waitlistVisible,
      hasLoginOverlay,
      errSamples: pageErrors.slice(0, 3)
    };
    console.log('[S6] Waitlist —', JSON.stringify(results.waitlist));
    await page.close();
  }

  return results;
}

async function runJ30Tests(browser) {
  console.log('\n===== J30 PROFILE (WITH HISTORY) =====\n');
  const results = {};

  // ── Scenario 7: Coach Today with history ──
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const { pageErrors, pageWarnings } = await captureConsoleErrors(page);
    await injectAndLoad(page, J30_DB);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await waitForApp(page);

    try {
      await page.click('[data-tab="tab-seances"]', { timeout: 3000 });
      await page.waitForTimeout(500);
      const coachBtn = page.locator('.stats-sub-pill:has-text("Coach")').first();
      await coachBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1000);
    } catch(e) {
      console.log('[WARN] Could not navigate to Coach tab J30:', e.message);
    }

    const bodyText = await page.textContent('body').catch(() => '');
    const hasProgress = /squat|progression|charge|kg|séance|historique/i.test(bodyText);
    const { hasUndefined, hasNaN } = await checkForUndefinedNaN(page);
    await screenshot(page, '07-coach-j30.png', 'Coach Today J30');
    results.coach_j30 = {
      errors: pageErrors.length,
      hasUndefined,
      hasNaN,
      hasProgress,
      errSamples: pageErrors.slice(0, 3)
    };
    console.log('[S7] Coach J30 —', JSON.stringify(results.coach_j30));
    await page.close();
  }

  // ── Scenario 8: Stats tab ──
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const { pageErrors, pageWarnings } = await captureConsoleErrors(page);
    await injectAndLoad(page, J30_DB);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await waitForApp(page);

    try {
      await page.click('[data-tab="tab-stats"]', { timeout: 3000 });
      await page.waitForTimeout(1000);
    } catch(e) {
      console.log('[WARN] Could not navigate to Stats tab:', e.message);
    }

    const bodyText = await page.textContent('body').catch(() => '');
    const hasCharts = /graphique|chart|courbe|évolution|progression|volume/i.test(bodyText);
    const hasPRs = /pr|record|squat|bench|deadlift|soulevé/i.test(bodyText);
    const { hasUndefined, hasNaN } = await checkForUndefinedNaN(page);
    await screenshot(page, '08-stats-j30.png', 'Stats tab J30');
    results.stats_j30 = {
      errors: pageErrors.length,
      hasUndefined,
      hasNaN,
      hasCharts,
      hasPRs,
      errSamples: pageErrors.slice(0, 3)
    };
    console.log('[S8] Stats J30 —', JSON.stringify(results.stats_j30));
    await page.close();
  }

  return results;
}

async function main() {
  console.log('TrainHub v143 — Playwright Beta Review');
  console.log('Server:', BASE_URL);
  console.log('Screenshots:', SCREENSHOTS_DIR);

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  let j1Results = {};
  let j30Results = {};

  try {
    j1Results = await runJ1Tests(browser);
  } catch(e) {
    console.error('J1 tests failed:', e.message);
  }

  try {
    j30Results = await runJ30Tests(browser);
  } catch(e) {
    console.error('J30 tests failed:', e.message);
  }

  await browser.close();

  const report = { j1Results, j30Results, timestamp: new Date().toISOString() };
  const reportPath = path.join(__dirname, 'playwright-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\n[DONE] Results saved to:', reportPath);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
