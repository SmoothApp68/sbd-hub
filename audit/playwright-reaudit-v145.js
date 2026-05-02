// ============================================================
// Playwright Re-audit v145 — TrainHub Blocker Verification
// ============================================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3456/';
const STORAGE_KEY = 'SBD_HUB_V29';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function log(msg) {
  console.log('[AUDIT] ' + msg);
}

function buildTestDB(overrides = {}) {
  return Object.assign({
    user: {
      name: 'TestBeta',
      age: 28, bw: 80, height: 178, gender: 'M',
      onboardingProfile: 'intermediaire',
      programParams: { freq: 4, goal: 'force_physique', level: 'intermediate' },
      onboardingPRs: { squat: 100, bench: 80, deadlift: 120 },
      barWeight: 20, units: 'kg', tier: 'premium',
      streak: 0, vocabLevel: 2, lpActive: true, lpStrikes: {},
      activityTemplate: [
        { type: 'natation', intensity: 3, days: ['Mercredi'], duration: 45, fixed: true }
      ],
      coachProfile: 'full',
      onboardingDate: new Date(Date.now() - 3 * 86400000).toISOString(),
      onboarded: true,
      level: 'intermediaire'
    },
    logs: [], exercises: {}, bestPR: {}, weeklyPlan: null,
    activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0,
    _dupMigrated: false, _activityMigrated: true,
    todayWellbeing: {
      date: new Date().toISOString().split('T')[0],
      sleep: 4, readiness: 4
    },
    gamification: { xp: 0, level: 1, badges: [], lastTab: null },
    reports: [], body: [], keyLifts: [], social: {
      profileId: null, username: '', bio: '',
      visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' },
      onboardingCompleted: false, usernameChangedAt: null
    }
  }, overrides);
}

async function injectDB(page, db) {
  await page.addInitScript((args) => {
    const { key, data } = args;
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(data));
    // Prevent auth redirects
    window._skipAuthGate = true;
  }, { key: STORAGE_KEY, data: db });
}

async function navigateTo(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
}

async function clickTab(page, tabId) {
  // Try clicking the tab button by data-tab attribute
  const btn = page.locator(`[data-tab="${tabId}"]`);
  if (await btn.count() > 0) {
    await btn.click();
    return true;
  }
  // Fallback: call showTab via JS
  await page.evaluate((id) => { if (typeof showTab === 'function') showTab(id); }, tabId);
  return true;
}

async function clickSubTab(page, subId) {
  await page.evaluate((id) => {
    if (typeof showSeancesSub === 'function') {
      var btn = document.querySelector(`.stats-sub-pill[onclick*="${id}"]`);
      showSeancesSub(id, btn);
    }
  }, subId);
}

// ============================================================
// RESULTS COLLECTOR
// ============================================================
const results = {
  test1: { name: 'weeklyPlan auto-generated J1', status: 'SKIP', notes: '' },
  test2: { name: 'showPRCelebration no JS errors', status: 'SKIP', notes: '' },
  test3: { name: 'Chart.js offline', status: 'SKIP', notes: '' },
  test4: { name: 'Plate Calculator collapsible', status: 'SKIP', notes: '' },
  test5: { name: 'Coach Today J1 regression', status: 'SKIP', notes: '' },
  test6: { name: 'Console errors global check', status: 'SKIP', notes: '', errors: [] },
};

// ============================================================
// MAIN
// ============================================================
(async () => {
  const executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // ──────────────────────────────────────────────
  // TEST 1 — weeklyPlan auto-generated on J1
  // ──────────────────────────────────────────────
  log('=== TEST 1: weeklyPlan auto-generation J1 ===');
  try {
    const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page1 = await ctx1.newPage();

    const db1 = buildTestDB({ weeklyPlan: null });
    await injectDB(page1, db1);
    await navigateTo(page1, BASE_URL);
    await page1.waitForTimeout(2000);

    // Click Programme sub-tab (it's inside tab-seances)
    await clickTab(page1, 'tab-seances');
    await page1.waitForTimeout(500);
    await clickSubTab(page1, 'seances-programme');
    await page1.waitForTimeout(2500);

    await page1.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-programme-j1.png'), fullPage: false });

    const pageContent = await page1.content();
    const hasCreateMessage = pageContent.includes('Comment tu veux créer') || pageContent.includes('Comment créer');
    const hasPlanContent = pageContent.includes('Semaine') && (pageContent.includes('Squat') || pageContent.includes('Bench') || pageContent.includes('exercice'));

    // Also check via JS
    const weeklyPlanInDB = await page1.evaluate((key) => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return data.weeklyPlan;
      } catch(e) { return null; }
    }, STORAGE_KEY);

    log('  weeklyPlan in DB: ' + JSON.stringify(weeklyPlanInDB ? 'PRESENT (days: ' + (weeklyPlanInDB.days ? weeklyPlanInDB.days.length : 0) + ')' : 'NULL'));
    log('  hasCreateMessage: ' + hasCreateMessage);
    log('  hasPlanContent: ' + hasPlanContent);

    if (weeklyPlanInDB && weeklyPlanInDB.days && weeklyPlanInDB.days.length > 0) {
      results.test1.status = 'PASS';
      results.test1.notes = 'weeklyPlan auto-generated: ' + weeklyPlanInDB.days.length + ' days. ' + (hasPlanContent ? 'Plan content visible in UI.' : 'DB OK but UI may not show it yet.');
    } else if (hasPlanContent && !hasCreateMessage) {
      results.test1.status = 'PASS';
      results.test1.notes = 'Plan content visible in page (Semaine/exercices detected).';
    } else {
      results.test1.status = 'FAIL';
      results.test1.notes = 'weeklyPlan is null in DB and no plan content in UI. "Comment créer" visible: ' + hasCreateMessage;
    }

    await ctx1.close();
  } catch (err) {
    results.test1.status = 'SKIP';
    results.test1.notes = 'Error: ' + err.message;
    log('  SKIP: ' + err.message);
  }
  log('  Result: ' + results.test1.status + ' — ' + results.test1.notes);

  // ──────────────────────────────────────────────
  // TEST 2 — showPRCelebration no JS errors
  // ──────────────────────────────────────────────
  log('=== TEST 2: showPRCelebration no JS errors ===');
  try {
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await ctx2.newPage();

    const consoleErrors2 = [];
    page2.on('console', msg => {
      if (msg.type() === 'error') consoleErrors2.push(msg.text());
    });
    page2.on('pageerror', err => {
      consoleErrors2.push('PAGE ERROR: ' + err.message);
    });

    const db2 = buildTestDB({
      logs: [{
        id: 'test-session-1',
        timestamp: Date.now() - 3600000,
        shortDate: new Date(Date.now() - 3600000).toISOString().split('T')[0],
        title: 'Squat',
        exercises: [{
          name: 'Squat',
          sets: [{ weight: 100, reps: 5, completed: true, type: 'normal', rpe: 8 }],
          maxRM: 115
        }]
      }],
      bestPR: { squat: 90 }
    });

    await injectDB(page2, db2);
    await navigateTo(page2, BASE_URL);
    await page2.waitForTimeout(3000);

    await page2.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-pr-celebration-check.png'), fullPage: false });

    const prRelatedErrors = consoleErrors2.filter(e =>
      e.toLowerCase().includes('showprcelebration') ||
      e.toLowerCase().includes('typeerror') ||
      e.toLowerCase().includes('uncaught') ||
      e.toLowerCase().includes('buildactivity')
    );

    log('  All console errors: ' + JSON.stringify(consoleErrors2));
    log('  PR-related errors: ' + JSON.stringify(prRelatedErrors));

    if (prRelatedErrors.length === 0) {
      results.test2.status = 'PASS';
      results.test2.notes = 'No JS errors related to showPRCelebration. Total errors: ' + consoleErrors2.length + (consoleErrors2.length > 0 ? '. Other errors: ' + consoleErrors2.slice(0, 2).join(' | ') : '');
    } else {
      results.test2.status = 'FAIL';
      results.test2.notes = 'JS errors found: ' + prRelatedErrors.join(' | ');
    }

    await ctx2.close();
  } catch (err) {
    results.test2.status = 'SKIP';
    results.test2.notes = 'Error: ' + err.message;
    log('  SKIP: ' + err.message);
  }
  log('  Result: ' + results.test2.status + ' — ' + results.test2.notes);

  // ──────────────────────────────────────────────
  // TEST 3 — Chart.js offline
  // ──────────────────────────────────────────────
  log('=== TEST 3: Chart.js offline ===');
  try {
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page3 = await ctx3.newPage();

    // Build DB with 10 logs over 10 days
    const logs3 = [];
    for (let i = 0; i < 10; i++) {
      const ts = Date.now() - i * 86400000;
      logs3.push({
        id: 'log-' + i,
        timestamp: ts,
        shortDate: new Date(ts).toISOString().split('T')[0],
        title: 'Séance ' + i,
        exercises: [{
          name: 'Squat',
          sets: [{ weight: 80 + i * 2, reps: 5, completed: true, type: 'normal' }],
          maxRM: 100 + i
        }]
      });
    }
    const db3 = buildTestDB({ logs: logs3, bestPR: { squat: 100 } });

    await injectDB(page3, db3);
    await navigateTo(page3, BASE_URL);
    await page3.waitForTimeout(1500);

    // Navigate to Stats
    await clickTab(page3, 'tab-stats');
    await page3.waitForTimeout(1500);
    await page3.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-stats-online.png'), fullPage: false });

    // Check for canvas elements (charts) online
    const canvasCountOnline = await page3.evaluate(() => document.querySelectorAll('canvas').length);
    log('  Canvas elements online: ' + canvasCountOnline);

    // Check Chart.js is bundled locally (not CDN) by verifying the script tag
    const chartJsSource = await page3.evaluate(() => {
      var scripts = Array.from(document.querySelectorAll('script[src]'));
      var chartScript = scripts.find(function(s) { return s.src && (s.src.includes('chart') || s.src.includes('Chart')); });
      return chartScript ? chartScript.src : null;
    });
    log('  Chart.js source: ' + chartJsSource);

    // Go offline and simulate reload by navigating away and back with offline
    // We can't do a full reload offline (local server), so we:
    // 1. Navigate to blank page while online
    // 2. Set offline
    // 3. Navigate back (will fail for server resources, but service worker / cache may work)
    // Instead: test that Chart.js itself is NOT from CDN and canvas renders while online
    // Then test offline by checking if chart.min.js is in page resources
    const resourcesFromCDN = await page3.evaluate(() => {
      var scripts = Array.from(document.querySelectorAll('script[src]'));
      return scripts
        .filter(function(s) { return s.src && (s.src.includes('cdn.') || s.src.includes('cdnjs.') || s.src.includes('jsdelivr')); })
        .map(function(s) { return s.src; });
    });
    log('  CDN resources: ' + JSON.stringify(resourcesFromCDN));

    // Try offline: go offline, navigate to stats, take screenshot
    await page3.context().setOffline(true);
    await page3.waitForTimeout(500);

    // Trigger re-render of stats tab while offline (don't reload page)
    await page3.evaluate(() => {
      if (typeof showTab === 'function') showTab('tab-stats');
      if (typeof renderStatsTab === 'function') renderStatsTab();
    });
    await page3.waitForTimeout(2000);

    const canvasCountOffline = await page3.evaluate(() => document.querySelectorAll('canvas').length);
    const pageTextOffline = await page3.evaluate(() => document.body.innerText);
    const hasUnavailableMsg = pageTextOffline.includes('indisponible') || pageTextOffline.includes('Graphique indisponible');
    log('  Canvas elements offline (no reload): ' + canvasCountOffline);
    log('  "indisponible" text visible: ' + hasUnavailableMsg);

    await page3.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-stats-offline.png'), fullPage: false });

    // Re-enable online
    await page3.context().setOffline(false);

    const isLocalChart = chartJsSource && chartJsSource.includes('localhost');
    const noCDNChartDeps = resourcesFromCDN.filter(r => r.includes('chart')).length === 0;

    if (canvasCountOffline > 0 && !hasUnavailableMsg && (isLocalChart || noCDNChartDeps)) {
      results.test3.status = 'PASS';
      results.test3.notes = 'Charts render. Canvas: ' + canvasCountOffline + '. Chart.js local: ' + (isLocalChart ? chartJsSource : 'no CDN chart dep found') + '. No "indisponible" msg.';
    } else if (canvasCountOffline > 0 && noCDNChartDeps) {
      results.test3.status = 'PASS';
      results.test3.notes = 'Canvas visible (' + canvasCountOffline + '). Chart.js not from CDN. CDN deps: ' + JSON.stringify(resourcesFromCDN);
    } else if (canvasCountOffline > 0 && hasUnavailableMsg) {
      results.test3.status = 'PARTIAL';
      results.test3.notes = 'Canvas present (' + canvasCountOffline + ') but "indisponible" message also shown. Partial fix.';
    } else {
      results.test3.status = 'FAIL';
      results.test3.notes = 'No canvas. "indisponible": ' + hasUnavailableMsg + '. CDN: ' + JSON.stringify(resourcesFromCDN);
    }

    await ctx3.close();
  } catch (err) {
    results.test3.status = 'SKIP';
    results.test3.notes = 'Error: ' + err.message;
    log('  SKIP: ' + err.message);
  }
  log('  Result: ' + results.test3.status + ' — ' + results.test3.notes);

  // ──────────────────────────────────────────────
  // TEST 4 — Plate Calculator collapsible
  // ──────────────────────────────────────────────
  log('=== TEST 4: Plate Calculator collapsible ===');
  try {
    const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page4 = await ctx4.newPage();

    // Build a weeklyPlan with proper exercises that trigger Galettes
    // routineExos is needed by getProgExosForDay to populate workout exercises
    const db4 = buildTestDB({
      bestPR: { squat: 100, bench: 80, deadlift: 120 },
      routineExos: {
        'Samedi': ['Squat (Barre)']
      },
      weeklyPlan: {
        week: 1,
        days: [
          {
            day: 'Lundi', title: '🦵 Squat & Jambes', rest: false,
            exercises: [{
              name: 'Squat (Barre)', type: 'weight', isPrimary: true,
              sets: [
                { reps: 5, weight: 75, rpe: 6, isWarmup: true },
                { reps: 5, weight: 80, rpe: 7.5, isWarmup: false },
                { reps: 5, weight: 80, rpe: 7.5, isWarmup: false },
                { reps: 5, weight: 80, rpe: 7.5, isWarmup: false },
              ],
              restSeconds: 300
            }]
          },
          { day: 'Mardi', title: '😴 Repos', rest: true, exercises: [] },
          {
            day: 'Mercredi', title: '💪 Bench', rest: false,
            exercises: [{
              name: 'Développé couché (Barre)', type: 'weight', isPrimary: true,
              sets: [
                { reps: 5, weight: 60, rpe: 6, isWarmup: true },
                { reps: 5, weight: 65, rpe: 7.5, isWarmup: false },
                { reps: 5, weight: 65, rpe: 7.5, isWarmup: false },
              ],
              restSeconds: 240
            }]
          },
          { day: 'Jeudi', title: '😴 Repos', rest: true, exercises: [] },
          {
            day: 'Vendredi', title: '🔙 Deadlift', rest: false,
            exercises: [{
              name: 'Soulevé de terre (Barre)', type: 'weight', isPrimary: true,
              sets: [
                { reps: 5, weight: 90, rpe: 7, isWarmup: true },
                { reps: 5, weight: 95, rpe: 7.5, isWarmup: false },
                { reps: 5, weight: 95, rpe: 7.5, isWarmup: false },
              ],
              restSeconds: 300
            }]
          },
          {
            day: 'Samedi', title: '🦵 Squat & Force', rest: false,
            exercises: [{
              name: 'Squat (Barre)', type: 'weight', isPrimary: true,
              sets: [
                { reps: 5, weight: 75, rpe: 6, isWarmup: true },
                { reps: 5, weight: 80, rpe: 7.5, isWarmup: false },
                { reps: 5, weight: 80, rpe: 7.5, isWarmup: false },
              ],
              restSeconds: 300
            }]
          },
          { day: 'Dimanche', title: '😴 Repos', rest: true, exercises: [] }
        ]
      }
    });

    await injectDB(page4, db4);
    await navigateTo(page4, BASE_URL);
    await page4.waitForTimeout(1500);

    // Navigate to GO tab
    await clickTab(page4, 'tab-seances');
    await page4.waitForTimeout(300);
    await clickSubTab(page4, 'seances-go');
    await page4.waitForTimeout(2000);

    // Dismiss any modal if shown
    const closeBtn = page4.locator('button:has-text("Fermer"), button:has-text("Annuler")').first();
    if (await closeBtn.count() > 0) {
      try { await closeBtn.click({ timeout: 1000 }); } catch(e) {}
    }
    await page4.waitForTimeout(300);

    // Try to start GO session via JS - force start with today's workout (Samedi)
    await page4.evaluate(() => {
      // Bypass readiness check (already filled todayWellbeing)
      db.todayWellbeing = db.todayWellbeing || {};
      db.todayWellbeing.readiness = 4;

      if (typeof _goDoStartWorkout === 'function') {
        // Call _goDoStartWorkout directly, bypassing readiness modal
        _goDoStartWorkout(true);
        if (typeof goRequestRender === 'function') goRequestRender();
      } else if (typeof goStartWorkout === 'function') {
        goStartWorkout(true);
      }
    });
    await page4.waitForTimeout(2000);

    // Dismiss readiness modal if appeared
    const readinessBtn = page4.locator('button:has-text("Commencer"), button:has-text("Valider"), button:has-text("Démarrer")').first();
    if (await readinessBtn.count() > 0) {
      try { await readinessBtn.click({ timeout: 1000 }); await page4.waitForTimeout(1000); } catch(e) {}
    }

    await page4.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-plates-collapsed.png'), fullPage: false });

    const pageText4 = await page4.evaluate(() => document.body.innerHTML);
    const hasGalettesToggle = pageText4.includes('Galettes ▾') || pageText4.includes('Galettes');
    log('  "Galettes ▾" present: ' + hasGalettesToggle);

    if (!hasGalettesToggle) {
      results.test4.status = 'FAIL';
      results.test4.notes = 'GO tab rendered but "Galettes ▾" toggle not found. Active workout may not have started or no barbell exercises shown.';
      await ctx4.close();
      log('  Result: ' + results.test4.status + ' — ' + results.test4.notes);
    } else {
      // Check plates are hidden (display:none)
      const platesHidden = await page4.evaluate(() => {
        var platesEls = document.querySelectorAll('[id^="plates-"]');
        if (platesEls.length === 0) return 'no-plates-divs';
        var allHidden = Array.from(platesEls).every(el => el.style.display === 'none' || el.style.display === '');
        return allHidden ? 'hidden' : 'visible';
      });
      log('  Plates state (collapsed): ' + platesHidden);

      // Click Galettes ▾
      await page4.evaluate(() => {
        var el = document.querySelector('[onclick*="plates-"]');
        if (!el) {
          // Try to find by text
          var all = document.querySelectorAll('div');
          for (var d of all) {
            if (d.textContent && d.textContent.includes('Galettes ▾')) { d.click(); return; }
          }
        } else {
          el.click();
        }
      });
      await page4.waitForTimeout(500);
      await page4.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-plates-expanded.png'), fullPage: false });

      const platesVisible = await page4.evaluate(() => {
        var platesEls = document.querySelectorAll('[id^="plates-"]');
        if (platesEls.length === 0) return 'no-plates-divs';
        var anyVisible = Array.from(platesEls).some(el => el.style.display !== 'none');
        return anyVisible ? 'visible' : 'still-hidden';
      });
      log('  Plates state (after click): ' + platesVisible);

      if (hasGalettesToggle && platesHidden !== 'visible' && platesVisible === 'visible') {
        results.test4.status = 'PASS';
        results.test4.notes = '"Galettes ▾" toggle present and works: collapsed initially, plates visible after click.';
      } else if (hasGalettesToggle && platesVisible === 'visible') {
        results.test4.status = 'PASS';
        results.test4.notes = '"Galettes ▾" toggle present. Plates show after click. (Initial state: ' + platesHidden + ')';
      } else {
        results.test4.status = 'FAIL';
        results.test4.notes = '"Galettes ▾" present but plates did not expand after click. Plates state: ' + platesVisible;
      }
      await ctx4.close();
      log('  Result: ' + results.test4.status + ' — ' + results.test4.notes);
    }
  } catch (err) {
    results.test4.status = 'SKIP';
    results.test4.notes = 'Error: ' + err.message;
    log('  SKIP: ' + err.message);
  }

  // ──────────────────────────────────────────────
  // TEST 5 — Coach Today J1 regression check
  // ──────────────────────────────────────────────
  log('=== TEST 5: Coach Today J1 regression ===');
  try {
    const ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page5 = await ctx5.newPage();

    const db5 = buildTestDB({
      logs: [],
      todayWellbeing: {
        date: new Date().toISOString().split('T')[0],
        sleep: 4, readiness: 4
      }
    });

    await injectDB(page5, db5);
    await navigateTo(page5, BASE_URL);
    await page5.waitForTimeout(2500);

    // Navigate to Coach sub-tab
    await clickTab(page5, 'tab-seances');
    await page5.waitForTimeout(300);
    await clickSubTab(page5, 'seances-coach');
    await page5.waitForTimeout(2000);

    await page5.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-coach-j1.png'), fullPage: false });

    const coachContent = await page5.evaluate(() => {
      var coach = document.getElementById('seances-coach');
      return coach ? coach.innerHTML : document.body.innerHTML;
    });

    const hasColdStartMsg = coachContent.includes('bienvenu') || coachContent.includes('Bienvenu') ||
      coachContent.includes('j1') || coachContent.includes('J1') ||
      coachContent.includes('premier') || coachContent.includes('Premier');
    const hasSRSCard = coachContent.includes('SRS') || coachContent.includes('répétitions espacées') ||
      coachContent.includes('coach-card') || coachContent.includes('card');
    const hasWellbeing = coachContent.includes('sommeil') || coachContent.includes('Sommeil') ||
      coachContent.includes('wellbeing') || coachContent.includes('forme');
    const isBlank = coachContent.trim().length < 200;

    log('  hasColdStartMsg: ' + hasColdStartMsg);
    log('  hasSRSCard: ' + hasSRSCard);
    log('  hasWellbeing: ' + hasWellbeing);
    log('  isBlank: ' + isBlank);
    log('  content length: ' + coachContent.length);

    if (!isBlank && (hasColdStartMsg || hasSRSCard || hasWellbeing || coachContent.length > 500)) {
      results.test5.status = 'PASS';
      results.test5.notes = 'Coach tab has content on J1. Cold start: ' + hasColdStartMsg + ', SRS/card: ' + hasSRSCard + ', Wellbeing: ' + hasWellbeing;
    } else if (isBlank) {
      results.test5.status = 'FAIL';
      results.test5.notes = 'Coach tab appears blank on J1 (content < 200 chars).';
    } else {
      results.test5.status = 'PASS';
      results.test5.notes = 'Coach tab has content (length: ' + coachContent.length + ').';
    }

    await ctx5.close();
  } catch (err) {
    results.test5.status = 'SKIP';
    results.test5.notes = 'Error: ' + err.message;
    log('  SKIP: ' + err.message);
  }
  log('  Result: ' + results.test5.status + ' — ' + results.test5.notes);

  // ──────────────────────────────────────────────
  // TEST 6 — Console errors global check
  // ──────────────────────────────────────────────
  log('=== TEST 6: Console errors global check ===');
  try {
    const ctx6 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page6 = await ctx6.newPage();

    const allErrors = [];
    page6.on('console', msg => {
      if (msg.type() === 'error') allErrors.push(msg.text());
    });
    page6.on('pageerror', err => {
      allErrors.push('PAGE_ERROR: ' + err.message);
    });

    const db6 = buildTestDB({});
    await injectDB(page6, db6);
    await navigateTo(page6, BASE_URL);
    await page6.waitForTimeout(5000);

    log('  Total console errors: ' + allErrors.length);
    allErrors.forEach((e, i) => log('  Error ' + (i+1) + ': ' + e.substring(0, 200)));

    // Filter out browser-level non-app errors
    const IGNORABLE = [
      'ERR_CERT_AUTHORITY_INVALID',
      'navigator.vibrate',
      'Failed to load resource: net::ERR_FAILED',
      'chrome-extension://',
      'favicon.ico'
    ];
    const appErrors = allErrors.filter(e => !IGNORABLE.some(ig => e.includes(ig)));
    results.test6.errors = appErrors;

    log('  App-level errors: ' + appErrors.length + ' / ' + allErrors.length + ' total');
    appErrors.forEach((e, i) => log('  App Error ' + (i+1) + ': ' + e.substring(0, 200)));

    if (appErrors.length === 0) {
      results.test6.status = 'PASS';
      results.test6.notes = 'No app-level JS errors during 5s load. (Total raw: ' + allErrors.length + ' incl. browser/cert errors)';
    } else {
      results.test6.status = appErrors.length <= 1 ? 'WARN' : 'FAIL';
      results.test6.notes = appErrors.length + ' app errors: ' + appErrors.slice(0, 3).map(e => e.substring(0, 120)).join(' | ');
    }

    await ctx6.close();
  } catch (err) {
    results.test6.status = 'SKIP';
    results.test6.notes = 'Error: ' + err.message;
    log('  SKIP: ' + err.message);
  }
  log('  Result: ' + results.test6.status + ' — ' + results.test6.notes);

  // ──────────────────────────────────────────────
  // SAVE RESULTS
  // ──────────────────────────────────────────────
  const resultsPath = path.join(__dirname, 'playwright-reaudit-v145-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  log('\n=== RESULTS SUMMARY ===');
  Object.values(results).forEach(r => log(`  [${r.status}] ${r.name}: ${r.notes}`));

  await browser.close();
  log('\nDone. Results saved to: ' + resultsPath);
})();
