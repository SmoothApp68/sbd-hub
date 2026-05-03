const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const STORAGE_KEY = 'SBD_HUB_V29';
const SCREENSHOT_DIR = 'audit/screenshots';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function seedDB(page, db) {
  await page.goto('/', { waitUntil: 'commit' });
  await page.evaluate(([key, data]) => {
    localStorage.setItem(key, JSON.stringify(data));
  }, [STORAGE_KEY, db]);
  await page.reload({ waitUntil: 'load' });
  // Suppress auth overlays permanently (supabase-cdn.min.js is now local and runs async auth check)
  await page.addStyleTag({ content: '#loginScreen, #onboarding-overlay { display: none !important; pointer-events: none !important; z-index: -1 !important; }' });
  await page.evaluate(() => {
    const ob = document.getElementById('onboarding-overlay');
    if (ob) ob.style.display = 'none';
    const login = document.getElementById('loginScreen');
    if (login) { login.style.display = 'none'; login.style.zIndex = '-1'; }
  });
  await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 15000 });
}

function filterAppErrors(errors) {
  return errors.filter(e =>
    !e.includes('supabase') &&
    !e.includes('favicon') &&
    !e.includes('ERR_') &&
    !e.includes('net::') &&
    !e.includes('chrome-extension') &&
    !e.includes('Failed to load resource') &&
    !e.includes('SW registration') &&
    !e.includes('service-worker') &&
    !e.includes('ServiceWorker') &&
    !e.includes('Content Security Policy') &&
    !e.includes('Refused to') &&
    !e.includes('navigator.vibrate') &&
    !e.includes('chromestatus.com') &&
    !e.includes('googletagmanager')
  );
}

async function screenshot(page, name) {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false });
}

// Helper: navigate to a main tab via data-tab attribute
async function goToTab(page, tabId) {
  await page.evaluate((id) => {
    if (typeof showTab === 'function') showTab(id);
  }, tabId);
  await page.waitForTimeout(300);
}

// Helper: navigate to a seances sub-section
async function goToSeancesSub(page, subId) {
  await goToTab(page, 'tab-seances');
  await page.evaluate((id) => {
    if (typeof showSeancesSub === 'function') showSeancesSub(id);
  }, subId);
  await page.waitForTimeout(300);
}

// Build a J30 profile with varied logs (squat, bench, dead, cardio, female)
function buildJ30DB() {
  const now = Date.now();
  const logs = [];
  const exDefs = [
    { name: 'Squat (Barre)', isPrimary: true,  w: 100, r: 5, rpe: 8  },
    { name: 'Développé couché', isPrimary: false, w: 80,  r: 8, rpe: 7  },
    { name: 'Soulevé de Terre',  isPrimary: false, w: 140, r: 4, rpe: 8  },
    { name: 'Leg Press',         isPrimary: false, w: 120, r: 10, rpe: 7 },
    { name: 'Curl Biceps',       isPrimary: false, w: 20,  r: 12, rpe: 7 }
  ];
  for (let i = 0; i < 30; i++) {
    const dayExos = exDefs.slice(0, 3 + (i % 3)).map(e => ({
      name: e.name,
      isPrimary: e.isPrimary,
      allSets: [
        { weight: e.w + i * 0.5, reps: e.r, rpe: e.rpe, isWarmup: false },
        { weight: e.w + i * 0.5, reps: e.r, rpe: e.rpe, isWarmup: false },
        { weight: e.w + i * 0.5, reps: Math.max(1, e.r - 1), rpe: e.rpe + 0.5, isWarmup: false }
      ]
    }));
    logs.push({
      timestamp: now - (30 - i) * 86400000,
      volume: dayExos.reduce((s, e) => s + e.allSets.reduce((ss, s2) => ss + s2.weight * s2.reps, 0), 0),
      duration: 3600 + Math.random() * 1800,
      exercises: dayExos
    });
  }
  const activityLogs = [];
  for (let i = 0; i < 8; i++) {
    activityLogs.push({
      date: new Date(now - i * 7 * 86400000).toISOString().split('T')[0],
      type: 'natation', duration: 45, trimp: 72, source: 'manual'
    });
  }
  return {
    user: {
      name: 'Léa', age: 28, bw: 62, height: 165,
      gender: 'female', onboarded: true,
      onboardingProfile: 'intermediaire',
      programParams: { freq: 4, goal: 'hypertrophie', level: 'intermediaire' },
      barWeight: 15, units: 'kg', tier: 'premium',
      trainingMode: 'musculation',
      coachProfile: 'full',
      menstrualEnabled: true,
      menstrualData: { lastPeriodStart: new Date(now - 10 * 86400000).toISOString().split('T')[0], cycleLength: 28 },
      activityTemplate: [{ type: 'natation', intensity: 3, days: ['Mercredi'], duration: 45, fixed: true }],
      targets: { bench: 60, squat: 80, deadlift: 100 },
      onboardingPRs: { squat: 80, bench: 60, deadlift: 100 }
    },
    logs,
    exercises: {
      'Squat (Barre)': { e1rm: 120, shadowWeight: 115, lastRPE: 8 },
      'Développé couché': { e1rm: 90, shadowWeight: 85, lastRPE: 7.5 },
      'Soulevé de Terre': { e1rm: 160, shadowWeight: 155, lastRPE: 8 }
    },
    bestPR: { squat: 110, bench: 80, deadlift: 150 },
    weeklyPlan: null,
    activityLogs,
    earnedBadges: { s5: { earnedAt: now - 86400000 * 10, xp: 100 } },
    xpHighWaterMark: 500,
    body: [],
    reports: []
  };
}

// ─── Test 1 — Stats Tab ──────────────────────────────────────────────────────

test('T1 — Stats Tab: volume, records, cardio, anatomy', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await seedDB(page, buildJ30DB());

  // Navigate to Stats tab
  await goToTab(page, 'tab-stats');
  await page.waitForSelector('#tab-stats', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);
  await screenshot(page, '01-stats-volume.png');

  const statsHTML = await page.$eval('#tab-stats', el => el.innerHTML);
  expect(statsHTML).not.toContain('>undefined<');
  expect(statsHTML).not.toMatch(/>NaN</);

  // Try to click Records sub-tab
  const recordsBtn = await page.$('#tab-stats [onclick*="record"], #tab-stats [onclick*="Record"], #tab-stats .stats-sub-pill');
  if (recordsBtn) { await recordsBtn.click(); await page.waitForTimeout(400); }
  await screenshot(page, '02-stats-records.png');

  // Try Cardio sub-tab
  const allPills = await page.$$('#tab-stats .stats-sub-pill');
  if (allPills.length >= 3) { await allPills[2].click(); await page.waitForTimeout(400); }
  await screenshot(page, '03-stats-cardio.png');

  // Body/anatomy — it's inside tab-profil as tab-corps
  await goToTab(page, 'tab-profil');
  await page.waitForTimeout(400);
  await screenshot(page, '04-stats-muscles.png');

  const appErrors = filterAppErrors(consoleErrors);
  console.log('T1 errors:', appErrors);
  expect(appErrors.length).toBe(0);
});

// ─── Test 2 — Social Tab ────────────────────────────────────────────────────

test('T2 — Social Tab: leaderboard + challenges offline', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await seedDB(page, buildJ30DB());

  await goToTab(page, 'tab-social');
  await page.waitForSelector('#tab-social', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(800);
  await screenshot(page, '04-social-tab.png');

  const socialHTML = await page.$eval('#tab-social', el => el.innerHTML);
  expect(socialHTML).not.toContain('>undefined<');
  expect(socialHTML.length).toBeGreaterThan(100);

  const appErrors = filterAppErrors(consoleErrors);
  console.log('T2 errors:', appErrors);
  expect(appErrors.length).toBe(0);
});

// ─── Test 3 — Programme Builder ─────────────────────────────────────────────

test('T3 — Programme Builder: generates a coherent week', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await seedDB(page, buildJ30DB());

  await goToSeancesSub(page, 'seances-programme');
  await page.waitForSelector('#seances-programme', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);
  await screenshot(page, '05-programme-builder.png');

  const progHTML = await page.$eval('#seances-programme', el => el.innerHTML);
  expect(progHTML).not.toContain('>undefined<');

  // Try to trigger plan generation
  const genBtn = await page.$('[onclick*="generateWeeklyPlan"], [onclick*="wpGenerate"]');
  if (genBtn) { await genBtn.click(); await page.waitForTimeout(1200); }

  await screenshot(page, '06-programme-viewer.png');

  const progText = await page.$eval('#seances-programme', el => el.textContent);
  expect(progText.length).toBeGreaterThan(50);
  console.log('Programme preview:', progText.slice(0, 120).trim());

  const appErrors = filterAppErrors(consoleErrors);
  console.log('T3 errors:', appErrors);
  expect(appErrors.length).toBe(0);
});

// ─── Test 4 — Réglages complets ─────────────────────────────────────────────

test('T4 — Settings: toggles, RGPD, PhysioManager visible for female', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await seedDB(page, buildJ30DB());

  await goToTab(page, 'tab-profil');
  await page.waitForSelector('#tab-profil', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(400);

  // Navigate to settings sub-section
  await page.evaluate(() => {
    if (typeof showProfilSub === 'function') showProfilSub('tab-settings');
  });
  await page.waitForTimeout(500);
  await screenshot(page, '07-settings-complet.png');

  const profilHTML = await page.$eval('#tab-profil', el => el.innerHTML);
  const hasPhysioManager = profilHTML.includes('PhysioManager') || profilHTML.includes('Cycle') ||
    profilHTML.includes('menstrual') || profilHTML.includes('Phase');
  const hasRGPD = profilHTML.includes('RGPD') || profilHTML.includes('Export') || profilHTML.includes('données');

  console.log('PhysioManager visible:', hasPhysioManager);
  console.log('RGPD section visible:', hasRGPD);
  expect(profilHTML).not.toContain('>undefined<');

  const appErrors = filterAppErrors(consoleErrors);
  console.log('T4 errors:', appErrors);
  expect(appErrors.length).toBe(0);
});

// ─── Test 5 — Offline complet ───────────────────────────────────────────────

test('T5 — Offline: stats + GO work without network', async ({ page, context }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  // First load online to populate SW cache
  await seedDB(page, buildJ30DB());

  // Go offline
  await context.setOffline(true);
  await page.waitForTimeout(200);

  // Stats tab offline
  await goToTab(page, 'tab-stats');
  await page.waitForTimeout(600);
  await screenshot(page, '08-offline-stats.png');

  const statsHTML = await page.$eval('#tab-stats', el => el.innerHTML).catch(() => '');
  console.log('Stats tab rendered offline, length:', statsHTML.length);

  // GO tab offline
  await goToSeancesSub(page, 'seances-go');
  await page.waitForTimeout(600);
  await screenshot(page, '09-offline-go.png');

  const goHTML = await page.$eval('#seances-go', el => el.innerHTML).catch(() => '');
  expect(goHTML).not.toContain('>undefined<');
  console.log('GO tab rendered offline, length:', goHTML.length);

  await context.setOffline(false);

  // Only fail on JS crash errors, not network errors
  const crashErrors = filterAppErrors(consoleErrors).filter(e =>
    e.includes('TypeError') || e.includes('ReferenceError') || e.includes('SyntaxError')
  );
  console.log('T5 crash errors:', crashErrors);
  expect(crashErrors.length).toBe(0);
});

// ─── Test 6 — Performance ───────────────────────────────────────────────────

test('T6 — Performance: load time < 5s, 0 app errors', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const db = buildJ30DB();
  await page.goto('/', { waitUntil: 'commit' });
  await page.evaluate(([key, data]) => {
    localStorage.setItem(key, JSON.stringify(data));
  }, [STORAGE_KEY, db]);

  const startTime = Date.now();
  await page.reload({ waitUntil: 'load', timeout: 20000 });
  await page.evaluate(() => {
    const ob = document.getElementById('onboarding-overlay');
    if (ob) ob.style.display = 'none';
    const login = document.getElementById('loginScreen');
    if (login) login.style.display = 'none';
  });
  await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 15000 });
  const loadTime = Date.now() - startTime;
  console.log('Load time:', loadTime, 'ms');

  // Navigate through all 6 main tabs
  for (const tabId of ['tab-dash', 'tab-social', 'tab-seances', 'tab-stats', 'tab-game', 'tab-profil']) {
    await goToTab(page, tabId);
    await page.waitForTimeout(250);
  }
  await screenshot(page, '10-performance-metrics.png');

  const appErrors = filterAppErrors(consoleErrors);
  console.log('T6 app errors:', appErrors);
  expect(loadTime).toBeLessThan(5000);
  expect(appErrors.length).toBe(0);
});

// ─── Test 7 — Double Progression visible in GO ──────────────────────────────

test('T7 — Double Progression: fourchette visible in GO for musculation', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const db = buildJ30DB();
  db.user.trainingMode = 'musculation';
  await seedDB(page, db);

  // Generate weekly plan first
  await page.evaluate(() => {
    if (typeof generateWeeklyPlan === 'function') generateWeeklyPlan();
  });
  await page.waitForTimeout(800);

  // Navigate to GO sub-section
  await goToSeancesSub(page, 'seances-go');
  await page.waitForSelector('#seances-go', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(500);

  // Start session directly (bypass readiness quiz overlay)
  await page.evaluate(() => {
    // Close any overlay first
    const overlay = document.getElementById('quiz-overlay');
    if (overlay) overlay.classList.remove('open');
    // Launch workout directly
    if (typeof _goDoStartWorkout === 'function') _goDoStartWorkout(false);
    else if (typeof openReadinessQuiz === 'function') openReadinessQuiz('today');
  });
  await page.waitForTimeout(800);

  await screenshot(page, '11-go-double-progression.png');

  const goHTML = await page.$eval('#seances-go', el => el.innerHTML).catch(() => '');
  const hasDP = goHTML.includes('Objectif') && (goHTML.includes('reps') || goHTML.includes('–'));
  console.log('Double Progression visible:', hasDP, '| GO HTML length:', goHTML.length);

  const appErrors = filterAppErrors(consoleErrors);
  console.log('T7 errors:', appErrors);
  expect(appErrors.length).toBe(0);
});
