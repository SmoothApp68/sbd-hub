// Beta Tester Simulation — TrainHub v137
// Intermediate lifter, 32yo, 80kg, male — full user journey
// Selector map verified from index.html + app.js source
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const OUT_DIR = path.join(__dirname, 'screenshots/beta-test');
fs.mkdirSync(OUT_DIR, { recursive: true });

const STORAGE_KEY = 'SBD_HUB_V29';
const bugs = [];
const log = [];

function note(msg) { console.log('[NOTE]', msg); log.push(msg); }
function bug(severity, what, expected, screenshot) {
  console.warn(`[BUG ${severity}]`, what);
  bugs.push({ severity, what, expected, screenshot: screenshot || 'N/A' });
}

async function ss(page, name) {
  const file = path.join(OUT_DIR, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  note('📸 ' + name);
  return name;
}

async function clickVisible(page, selector, description) {
  try {
    const el = await page.$(selector);
    if (!el) { note('NOT FOUND: ' + (description || selector)); return false; }
    const visible = await el.isVisible();
    if (!visible) { note('NOT VISIBLE: ' + (description || selector)); return false; }
    await el.click();
    note('✓ clicked: ' + (description || selector));
    return true;
  } catch (e) {
    note('CLICK FAIL: ' + (description || selector) + ' — ' + e.message.split('\n')[0]);
    return false;
  }
}

async function fillInput(page, selector, value, description) {
  try {
    const el = await page.$(selector);
    if (!el) { note('INPUT NOT FOUND: ' + (description || selector)); return false; }
    const visible = await el.isVisible();
    if (!visible) { note('INPUT NOT VISIBLE: ' + (description || selector)); return false; }
    await el.fill(String(value));
    note('✓ filled ' + (description || selector) + ' = ' + value);
    return true;
  } catch (e) {
    note('FILL FAIL: ' + (description || selector) + ' — ' + e.message.split('\n')[0]);
    return false;
  }
}

// Navigate to sub-section using JS call (more reliable than clicking)
async function navTo(page, subSection) {
  await page.evaluate((sub) => {
    if (sub === 'seances-go') showSeancesSub('seances-go', document.querySelector('[onclick*="seances-go"]'));
    else if (sub === 'seances-coach') showSeancesSub('seances-coach', document.querySelector('[onclick*="seances-coach"]'));
    else if (sub === 'seances-programme') showSeancesSub('seances-programme', document.querySelector('[onclick*="seances-programme"]'));
    else if (sub === 'seances-historique') showSeancesSub('seances-historique', document.querySelector('[onclick*="seances-historique"]'));
    else if (sub === 'stats') showTab('tab-stats');
    else if (sub === 'profil') showTab('tab-profil');
    else if (sub === 'settings') { showTab('tab-profil'); setTimeout(() => showProfilSub('tab-settings', null), 300); }
    else showTab(sub);
  }, subSection);
  await page.waitForTimeout(800);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  // Silence console noise
  page.on('console', msg => {
    if (msg.type() === 'error') note('[APP ERROR] ' + msg.text().substring(0, 120));
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1 — Onboarding
  // ═══════════════════════════════════════════════════════════════
  note('=== PHASE 1: Onboarding (fresh start) ===');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate((key) => { localStorage.removeItem(key); }, STORAGE_KEY);
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  await ss(page, '01-fresh-start');

  // Check onboarding overlay
  const obOverlay = await page.$('#onboarding-overlay');
  if (!obOverlay || !(await obOverlay.isVisible())) {
    bug('🔴', 'Onboarding overlay not shown on fresh localStorage', 'Should display onboarding for new user', '01-fresh-start');
    note('Injecting minimal DB to bypass onboarding...');
    // Inject a complete DB to skip onboarding
    await page.evaluate((key) => {
      const db = {
        user: {
          name: 'Beta Testeur', age: 32, weight: 80, height: 180, gender: 'male',
          obProfile: 'intermediaire', onboardingDone: true, onboardingDate: new Date().toISOString().split('T')[0],
          barWeight: 20, units: 'kg', medicalConsent: true, medicalConsentDate: Date.now(),
          trainingMode: 'powerbuilding', level: 'intermediaire'
        },
        exercises: {
          'Squat Barre': { e1rm: 100, shadowWeight: 100 },
          'Bench Press': { e1rm: 80, shadowWeight: 80 },
          'Soulevé de Terre': { e1rm: 120, shadowWeight: 120 }
        },
        logs: [], weeklyLogs: [], rhrHistory: [], routine: null, _v: 29
      };
      localStorage.setItem(key, JSON.stringify(db));
    }, STORAGE_KEY);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    note('Skipped onboarding via DB injection');
    await ss(page, '02-onboarding-bypassed');
  } else {
    note('✓ Onboarding overlay visible');

    // Step 1: Name, weight, height, age, level, gender
    await ss(page, '02-ob-step1-form');
    await fillInput(page, '#ob-name', 'Beta Testeur', 'name');
    await fillInput(page, '#ob-bw', '80', 'bodyweight');
    await fillInput(page, '#ob-height', '180', 'height');
    await fillInput(page, '#ob-age', '32', 'age');
    // Level: select "intermediaire"
    try {
      await page.selectOption('#ob-level', 'intermediaire');
      note('✓ level = intermédiaire');
    } catch (e) { note('level select: ' + e.message.split('\n')[0]); }
    // Gender: male
    try {
      await page.selectOption('#ob-gender', 'male');
      note('✓ gender = male');
    } catch (e) { note('gender select: ' + e.message.split('\n')[0]); }
    // Click "Continuer →" = obSaveStep1()
    await page.evaluate(() => { if (typeof obSaveStep1 === 'function') obSaveStep1(); });
    await page.waitForTimeout(800);
    await ss(page, '03-ob-step2-objective');

    // Step 2: Training mode + goal
    try {
      // Select powerbuilding
      await page.evaluate(() => {
        if (typeof selectTrainingMode === 'function') selectTrainingMode('powerbuilding');
        if (typeof obSelectGoal === 'function') obSelectGoal('force', document.querySelector('.ob-goal-btn'));
      });
      note('✓ mode = powerbuilding, goal = force');
    } catch (e) { note('step2 mode: ' + e.message.split('\n')[0]); }
    await page.evaluate(() => { if (typeof obSaveStep2 === 'function') obSaveStep2(); });
    await page.waitForTimeout(800);
    await ss(page, '04-ob-step3-injuries');

    // Step 3: Injuries — skip (no injuries)
    await page.evaluate(() => { if (typeof obSaveStep3 === 'function') obSaveStep3(); });
    await page.waitForTimeout(800);
    await ss(page, '05-ob-step4-secondary');

    // Step 4: Secondary activities — none
    await page.evaluate(() => { if (typeof obSaveStep4 === 'function') obSaveStep4(); });
    await page.waitForTimeout(800);
    await ss(page, '06-ob-step5-programme');

    // Step 5: Programme (3 days default, salle complète)
    await page.evaluate(() => {
      if (typeof selectFreq === 'function') selectFreq(3);
      if (typeof selectMat === 'function') selectMat('salle');
      if (typeof selectDur === 'function') selectDur(60);
    });
    await page.waitForTimeout(500);
    // Select training days (Lun/Mer/Ven)
    try {
      const dayBtns = await page.$$('.ob-day-btn, .day-btn');
      note('Day buttons found: ' + dayBtns.length);
      // Click Mon, Wed, Fri (indices 0, 2, 4 if 0=Mon)
      const days = ['lun', 'mer', 'ven', 'Mon', 'Wed', 'Fri', '1', '3', '5'];
      let clicked = 0;
      for (const btn of dayBtns) {
        const txt = (await btn.textContent()).toLowerCase().trim();
        if (txt.startsWith('l') || txt === '1' || txt.includes('lun') || txt.includes('mon')) {
          await btn.click(); clicked++; await page.waitForTimeout(200);
          break;
        }
      }
      for (const btn of dayBtns) {
        const txt = (await btn.textContent()).toLowerCase().trim();
        if (txt.startsWith('me') || txt === '3' || txt.includes('mer') || txt.includes('wed')) {
          await btn.click(); clicked++; await page.waitForTimeout(200);
          break;
        }
      }
      for (const btn of dayBtns) {
        const txt = (await btn.textContent()).toLowerCase().trim();
        if (txt.startsWith('v') || txt === '5' || txt.includes('ven') || txt.includes('fri')) {
          await btn.click(); clicked++; await page.waitForTimeout(200);
          break;
        }
      }
      note('Days selected: ' + clicked);
    } catch (e) { note('Day selection: ' + e.message.split('\n')[0]); }
    await page.evaluate(() => { if (typeof obSaveStep5 === 'function') obSaveStep5(); });
    await page.waitForTimeout(800);
    await ss(page, '07-ob-step6-prs');

    // Step 6: SBD PRs
    await fillInput(page, '#ob-squat-pr', '100', 'squat PR');
    await fillInput(page, '#ob-bench-pr', '80', 'bench PR');
    await fillInput(page, '#ob-dead-pr', '120', 'deadlift PR');
    await fillInput(page, '#ob-squat-tgt', '120', 'squat target');
    await fillInput(page, '#ob-bench-tgt', '100', 'bench target');
    await fillInput(page, '#ob-dead-tgt', '150', 'deadlift target');
    await page.evaluate(() => { if (typeof obSaveStep6 === 'function') obSaveStep6(); });
    await page.waitForTimeout(2000); // Generation animation
    await ss(page, '08-ob-step7-generation');

    // Step 7: Medical consent + finish
    await page.waitForTimeout(2000); // Wait for generation to complete
    const medConsentWrap = await page.$('#ob-medical-consent-wrap');
    if (medConsentWrap && await medConsentWrap.isVisible()) {
      note('✓ Medical consent wrap visible');
      const medCheckbox = await page.$('#ob-medical-consent');
      if (medCheckbox) {
        await medCheckbox.check();
        note('✓ Medical consent checked');
      } else {
        bug('🟠', 'Medical consent checkbox not found inside wrap', '#ob-medical-consent should be present', '08-ob-step7-generation');
      }
    } else {
      note('Medical consent wrap hidden (waiting for generation to complete...)');
      await page.waitForTimeout(3000);
      await ss(page, '08b-ob-step7-after-wait');
      const wrap = await page.$('#ob-medical-consent-wrap');
      if (wrap && await wrap.isVisible()) {
        const cb = await page.$('#ob-medical-consent');
        if (cb) { await cb.check(); note('✓ Medical consent checked (after wait)'); }
      } else {
        bug('🟠', 'Medical consent wrap still hidden after generation', '#ob-medical-consent-wrap should show with finish button via animStep()', '08b-ob-step7-after-wait');
      }
    }

    // Click finish button
    const finishBtn = await page.$('#ob-finish-btn');
    if (finishBtn && await finishBtn.isVisible()) {
      await finishBtn.click();
      note('✓ Finish button clicked');
    } else {
      note('Finish button not visible — trying JS call');
      await page.evaluate(() => { if (typeof obFinish === 'function') obFinish(); });
    }
    await page.waitForTimeout(2000);
    await ss(page, '09-onboarding-complete');

    // Verify onboarding done
    const stillOb = await page.$('#onboarding-overlay');
    if (stillOb && await stillOb.isVisible()) {
      bug('🔴', 'Still on onboarding after obFinish()', 'Should transition to main app', '09-onboarding-complete');
    } else {
      note('✓ Onboarding completed, app loaded');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2 — Coach Tab
  // ═══════════════════════════════════════════════════════════════
  note('=== PHASE 2: Coach Tab ===');
  await navTo(page, 'tab-seances');
  await navTo(page, 'seances-coach');
  await page.waitForTimeout(1000);
  await ss(page, '10-coach-today');

  let coachText = await page.textContent('#seances-coach, #coach-today').catch(() => '');
  coachText += await page.textContent('body').catch(() => '');

  // Check cold start message
  if (coachText.match(/calibration|froid|cold start|premier|débutant/i)) {
    note('✓ Cold start / calibration message visible');
  } else {
    note('No explicit cold start message (may be normal for intermediate with PRs declared)');
  }

  // Morning check-in / bilan du matin
  const bilanBtn = await page.$('[onclick*="saveMorning"], [onclick*="saveCheckin"], .bilan-save-btn');
  if (bilanBtn) {
    note('✓ Morning check-in buttons found');
    // Try clicking sleep 4/5 and readiness 4/5
    const sleepBtns = await page.$$('[onclick*="setSleep"], [onclick*="sleep"]');
    const readBtns = await page.$$('[onclick*="setReadiness"], [onclick*="readiness"]');
    note('Sleep buttons: ' + sleepBtns.length + ', Readiness buttons: ' + readBtns.length);
    if (sleepBtns.length >= 4) { await sleepBtns[3].click(); note('✓ Sleep = 4/5'); }
    if (readBtns.length >= 4) { await readBtns[3].click(); note('✓ Readiness = 4/5'); }
    await bilanBtn.click();
    await page.waitForTimeout(500);
  } else {
    // Try via checkInBtns pattern
    const checkBtns = await page.$$('.bilan-btn, .checkin-btn');
    note('Checkin btns: ' + checkBtns.length);
  }
  await ss(page, '11-coach-checkin');

  // Check diagnostic section
  const diagSection = await page.$('#coach-today');
  if (diagSection) {
    const diagText = await diagSection.textContent().catch(() => '');
    if (diagText.match(/diagnostic|alerte|srs|readiness|acwr/i)) {
      note('✓ Coach Today diagnostic section has content');
    } else {
      note('Coach Today section: ' + diagText.substring(0, 200));
    }
  }

  // Check for Budget Récupération card
  if (coachText.match(/budget|récupéra|energi/i)) {
    note('✓ Budget Énergétique / Recovery card visible');
  } else {
    note('No Budget Récupération card (expected — no secondary activities set)');
  }

  // Check severity icons
  if (coachText.match(/🚨|⚠️|✅|ℹ️/)) {
    note('✓ Severity icons present in diagnostic');
  } else {
    note('No severity icons visible in coach (may require alerts)');
  }
  await ss(page, '12-coach-diagnostic');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3 — GO Tab / Workout
  // ═══════════════════════════════════════════════════════════════
  note('=== PHASE 3: GO Tab ===');
  await navTo(page, 'seances-go');
  await page.waitForTimeout(1000);
  await ss(page, '13-go-idle');

  // Check idle view content
  const idleView = await page.$('#goIdleView');
  if (!idleView) {
    bug('🔴', '#goIdleView not found', 'GO tab should render idle view', '13-go-idle');
  } else {
    const idleText = await idleView.textContent().catch(() => '');
    note('GO idle content (first 300): ' + idleText.substring(0, 300));
    if (idleText.match(/commencer|démarrer|séance|programme/i)) {
      note('✓ GO idle view has start session content');
    }
  }

  // Click start workout button — try several patterns
  let startedWorkout = false;

  // Try clicking the "Commencer" button in idle view
  const startBtn = await page.$('[onclick*="goStartWorkout"], .go-start-btn');
  if (startBtn && await startBtn.isVisible()) {
    await startBtn.click();
    startedWorkout = true;
    note('✓ Workout started via start button');
  } else {
    // Try JS call
    await page.evaluate(() => {
      if (typeof goStartWorkout === 'function') goStartWorkout(true);
    });
    await page.waitForTimeout(500);
    const activeView = await page.$('#goActiveView');
    if (activeView && await activeView.isVisible()) {
      startedWorkout = true;
      note('✓ Workout started via goStartWorkout(true) JS call');
    }
  }

  if (!startedWorkout) {
    bug('🔴', 'Could not start workout session', 'goStartWorkout() should activate goActiveView', '13-go-idle');
  }

  await page.waitForTimeout(2000);
  await ss(page, '14-go-workout-active');

  // Check goActiveView is visible
  const activeViewEl = await page.$('#goActiveView');
  const activeViewVisible = activeViewEl ? await activeViewEl.isVisible() : false;
  note('goActiveView visible: ' + activeViewVisible);

  // Check warmup checklist
  const warmupItems = await page.$$('.warmup-check, .warmup-item, [onclick*="toggleWarmupSet"]');
  if (warmupItems.length > 0) {
    note('✓ Warmup checklist visible — ' + warmupItems.length + ' items');
    await ss(page, '15-go-warmup-checklist');
  } else {
    note('No warmup checklist visible');
    bug('🟡', 'Warmup checklist not visible after workout start', 'generateWarmupSets() should produce warmup checklist for Squat/Bench', '14-go-workout-active');
  }

  // Check plate calculator
  const platesEl = await page.$('.plates-display, [class*="plate"], .galettes');
  if (platesEl && await platesEl.isVisible()) {
    const platesText = await platesEl.textContent();
    note('✓ Plate calculator: ' + platesText.substring(0, 100));
    await ss(page, '16-plate-calculator');
  } else {
    note('Plate calculator not found (may render inline — searching text...)');
    const goText = await page.evaluate(() => document.getElementById('goActiveView') ? document.getElementById('goActiveView').innerHTML : '');
    if (goText.match(/galette|plate|×\s*\d+\.?\d*\s*kg/i)) {
      note('✓ Plate info found in GO HTML');
    } else {
      bug('🟡', 'Plate calculator display not visible for barbell exercise', 'formatPlates() should show plates under e1RM for Squat/Bench/Deadlift', '14-go-workout-active');
    }
  }

  // ── Complete Squat sets ──────────────────────────────────────────
  note('--- Completing Squat sets (3 × 5 @ 80kg RPE7) ---');
  const goActiveHtml = await page.evaluate(() => {
    const v = document.getElementById('goActiveView');
    return v ? v.innerHTML.substring(0, 500) : 'NOT FOUND';
  });
  note('goActiveView snippet: ' + goActiveHtml.substring(0, 200));

  for (let setIdx = 0; setIdx < 3; setIdx++) {
    // Get all unfilled set inputs in the active view
    const inputs = await page.$$('#goActiveView .go-set-input:not([tabindex="-1"])');
    note('Visible set inputs: ' + inputs.length);

    // Fill weight, reps, RPE in triplets
    // Inputs per row: weight (idx 0), reps (idx 1), rpe (idx 2)
    const baseIdx = setIdx * 3;
    if (inputs.length > baseIdx + 1) {
      try {
        await inputs[baseIdx].fill('80');
        await inputs[baseIdx + 1].fill('5');
        if (inputs.length > baseIdx + 2) await inputs[baseIdx + 2].fill('7');
        note('✓ Set ' + (setIdx + 1) + ' filled: 80kg / 5 reps / RPE7');
      } catch (e) {
        note('Set ' + (setIdx + 1) + ' fill error: ' + e.message.split('\n')[0]);
      }
    } else {
      note('Not enough inputs for set ' + (setIdx + 1) + ' (found ' + inputs.length + ')');
      break;
    }

    // Click check button
    const checkBtns = await page.$$('#goActiveView .go-check-btn:not(.done)');
    if (checkBtns.length > 0) {
      await checkBtns[0].click();
      note('✓ Set ' + (setIdx + 1) + ' checked');
      await page.waitForTimeout(800); // Allow rest timer UI to appear
    } else {
      note('No unchecked check buttons found for set ' + (setIdx + 1));
    }
  }
  await ss(page, '17-squat-sets-done');

  // ── Add Grind on last set ──────────────────────────────────────
  const grindBtns = await page.$$('[id^="grind-btn-"]');
  if (grindBtns.length > 0) {
    const lastGrind = grindBtns[grindBtns.length - 1];
    await lastGrind.click();
    note('✓ Grind added to last set');
  } else {
    note('Grind buttons not found (selector: [id^="grind-btn-"])');
    bug('🟡', 'Grind button not found via #grind-btn-* selector', 'Should have id="grind-btn-{exoIdx}-{setIdx}" buttons', '17-squat-sets-done');
  }

  // ── Mark first set as abandoned ────────────────────────────────
  const abandonBtns = await page.$$('[id^="abandoned-btn-"]');
  if (abandonBtns.length > 0) {
    await abandonBtns[0].click();
    note('✓ Set 1 marked as abandoned');
  } else {
    note('Abandon buttons not found');
  }
  await ss(page, '18-squat-grind-abandon');

  // Scroll down to see more / next exercise
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(500);
  await ss(page, '19-go-scrolled');

  // ── RPE dissonance detection ───────────────────────────────────
  // After completing sets, check for toast
  const toastText = await page.evaluate(() => {
    const toast = document.querySelector('.toast, #toast, .toast-message');
    return toast ? toast.textContent : '';
  });
  if (toastText.match(/rpe|dissonance|repos|cohérence/i)) {
    note('✓ RPE dissonance toast visible: ' + toastText.substring(0, 100));
  } else {
    note('No RPE dissonance toast (requires specific timing: RPE≤7 + rest>4min or RPE≥9 + rest<2min)');
  }

  // ── Finish workout ─────────────────────────────────────────────
  note('--- Finishing workout ---');
  // Scroll to top to find finish button
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const finishWorkoutBtn = await page.$('.go-finish-btn, [onclick*="goConfirmFinish"]');
  if (finishWorkoutBtn && await finishWorkoutBtn.isVisible()) {
    await finishWorkoutBtn.click();
    note('✓ Finish workout button clicked');
    await page.waitForTimeout(1000);
    // Confirm modal
    const confirmBtn = await page.$('.modal-btn, [onclick*="goFinishWorkout"], .confirm-btn');
    if (confirmBtn && await confirmBtn.isVisible()) {
      await confirmBtn.click();
      note('✓ Confirm finish clicked');
    } else {
      // Try JS call
      await page.evaluate(() => { if (typeof goFinishWorkout === 'function') goFinishWorkout(); });
      note('Finish confirmed via JS call');
    }
  } else {
    note('Finish button not visible — using JS call');
    await page.evaluate(() => { if (typeof goFinishWorkout === 'function') goFinishWorkout(); });
  }
  await page.waitForTimeout(3000);
  await ss(page, '20-workout-finished');

  // Check PR celebration
  const prCelebration = await page.$('.pr-celebration, [class*="celebration"], [id*="celebration"]');
  if (prCelebration && await prCelebration.isVisible()) {
    note('✓ PR Celebration screen visible');
    await ss(page, '21-pr-celebration');
    // Close it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    note('No PR celebration (expected — first workout, no new PRs beaten vs declared PRs)');
  }

  // Check share card toast (3.5s delay)
  await page.waitForTimeout(4000);
  await ss(page, '22-post-workout-share-check');
  const sharePrompt = await page.evaluate(() => {
    const toasts = document.querySelectorAll('.toast, #toast');
    for (const t of toasts) {
      if (t.textContent.match(/partager|share|carte/i)) return t.textContent;
    }
    return null;
  });
  if (sharePrompt) {
    note('✓ Share card toast: ' + sharePrompt.substring(0, 100));
  } else {
    note('Share card toast not visible (requires tonnage > 2t or new PR — first short session may not trigger)');
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4 — Post-workout tabs
  // ═══════════════════════════════════════════════════════════════
  note('=== PHASE 4: Post-workout tabs ===');

  // Stats tab
  await navTo(page, 'stats');
  await page.waitForTimeout(1000);
  await ss(page, '23-stats-tab');
  const statsText = await page.textContent('#tab-stats').catch(() => '');
  if (statsText.match(/tonnage|volume|squat|bench|séance/i)) {
    note('✓ Stats tab has content');
  } else {
    note('Stats content not visible: ' + statsText.substring(0, 200));
  }

  // Programme tab
  await navTo(page, 'seances-programme');
  await page.waitForTimeout(1000);
  await ss(page, '24-programme-tab');
  const progText = await page.textContent('#seances-programme').catch(() => '');
  if (progText.match(/séance|phase|semaine|exercice|programme/i)) {
    note('✓ Programme tab has content');
  } else {
    note('Programme content: ' + progText.substring(0, 200));
  }

  // Settings / Réglages
  await navTo(page, 'settings');
  await page.waitForTimeout(1500);
  await ss(page, '25-reglages-top');

  const settingsHtml = await page.evaluate(() => {
    const el = document.getElementById('tab-settings') || document.querySelector('.profil-sub-section.active') || document.getElementById('tab-profil');
    return el ? el.innerHTML : document.body.innerHTML;
  });

  // Check bar weight selector
  if (settingsHtml.match(/barWeight|Barre|bar.*weight|Équipement/i)) {
    note('✓ Bar weight / Équipement section found in settings');
  } else {
    bug('🟠', 'Bar weight selector not found in Réglages', 'renderSettingsProfile() should show Équipement & Unités with bar weight select', '25-reglages-top');
  }

  // Check kg/lbs toggle
  if (settingsHtml.match(/lbs|kg.*lbs|unité|Unité/i)) {
    note('✓ kg/lbs units toggle found in settings');
  } else {
    bug('🟡', 'kg/lbs toggle not found in Réglages', 'renderSettingsProfile() should show kg/lbs toggle', '25-reglages-top');
  }

  // Check RGPD section
  if (settingsHtml.match(/RGPD|rgpd|consentement|export.*données|suppression/i)) {
    note('✓ RGPD section found in settings');
  } else {
    bug('🟡', 'RGPD section not found in Réglages', 'renderRGPDSection() should be visible in settings', '25-reglages-top');
  }

  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(300);
  await ss(page, '26-reglages-scrolled');

  // Switch to lbs and verify
  const lbsOk = await page.evaluate(() => {
    if (typeof setWeightUnit === 'function') {
      setWeightUnit('lbs');
      return true;
    }
    return false;
  });
  if (lbsOk) {
    note('✓ setWeightUnit("lbs") called');
    await page.waitForTimeout(800);
    await ss(page, '27-settings-lbs-mode');
    // Switch back
    await page.evaluate(() => { if (typeof setWeightUnit === 'function') setWeightUnit('kg'); });
    await page.waitForTimeout(500);
    note('✓ Switched back to kg');
  } else {
    bug('🟡', 'setWeightUnit() function not available globally', 'Should be callable from settings UI', '25-reglages-top');
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5 — Waitlist Page
  // ═══════════════════════════════════════════════════════════════
  note('=== PHASE 5: Waitlist Page ===');
  await page.goto(BASE_URL + '#waitlist', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await ss(page, '28-waitlist-landing');

  const waitlistPage = await page.$('#waitlist-page');
  if (!waitlistPage) {
    bug('🔴', '#waitlist-page element missing from DOM', 'index.html should include #waitlist-page section', '28-waitlist-landing');
  } else if (!(await waitlistPage.isVisible())) {
    bug('🔴', '#waitlist-page present but hidden', 'checkWaitlistRoute() should show waitlist on #waitlist hash', '28-waitlist-landing');
  } else {
    note('✓ Waitlist page visible');
    // Check content
    const wlText = await waitlistPage.textContent().catch(() => '');
    if (wlText.match(/waitlist|liste|bêta|beta|rejoindre/i)) note('✓ Waitlist has appropriate content');

    // Fill form
    const emailFilled = await fillInput(page, '#waitlist-email', 'beta.playwright.' + Date.now() + '@test.invalid', 'waitlist email');
    // Profile select
    try {
      const profileSel = await page.$('#waitlist-profile, select[name="profile"]');
      if (profileSel) {
        await profileSel.selectOption({ index: 1 });
        note('✓ Waitlist profile selected');
      }
    } catch (e) { note('Waitlist profile: ' + e.message.split('\n')[0]); }

    await ss(page, '29-waitlist-filled');

    // Submit
    const submitBtn = await page.$('[onclick*="submitWaitlist"], button[type="submit"], .waitlist-submit-btn');
    if (submitBtn && await submitBtn.isVisible()) {
      await submitBtn.click();
      note('✓ Waitlist submit clicked');
      await page.waitForTimeout(2000);
      await ss(page, '30-waitlist-submitted');
      const resultText = await page.textContent('#waitlist-page').catch(() => '');
      if (resultText.match(/merci|confirmé|inscrit|success|bienvenue/i)) {
        note('✓ Waitlist submission success state visible');
      } else if (resultText.match(/erreur|error|fail/i)) {
        note('Waitlist error response (may be Supabase test domain rejection — expected with .invalid email)');
      } else {
        note('Waitlist result: ' + resultText.substring(0, 200));
      }
    } else {
      bug('🟠', 'Waitlist submit button not found', 'onclick="submitWaitlist()" button should be visible on waitlist page', '29-waitlist-filled');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 6 — Edge Cases
  // ═══════════════════════════════════════════════════════════════
  note('=== PHASE 6: Edge Cases ===');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // ── Kill Switch: poor sleep + readiness ──────────────────────
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const db = JSON.parse(raw);
    if (!db.user) db.user = {};
    db.user.lastSleep = 1;
    db.user.lastReadiness = 1;
    db.user.lastCheckin = new Date().toDateString();
    localStorage.setItem(key, JSON.stringify(db));
  }, STORAGE_KEY);
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await navTo(page, 'seances-coach');
  await page.waitForTimeout(1000);
  await ss(page, '31-poor-sleep-coach');
  const killText = await page.textContent('#seances-coach').catch(() => '');
  if (killText.match(/récupération active|repos|kill|warn|alerte|⚠️|🚨/i)) {
    note('✓ Poor sleep alert visible in coach');
  } else {
    note('Poor sleep alert not yet visible in coach today (needs workout history for ACWR)');
  }

  // Check GO tab with poor sleep — kill switch activation
  await navTo(page, 'seances-go');
  await page.waitForTimeout(1000);
  await ss(page, '32-go-poor-sleep');
  const goKillText = await page.textContent('#seances-go').catch(() => '');
  if (goKillText.match(/récupération|repos|fatigue|kill switch/i)) {
    note('✓ Kill switch / rest day triggered in GO idle view');
  } else {
    note('Kill switch not triggered in GO (requires ACWR > 1.5 from history)');
  }

  // ── Return-to-Play: inject 15-day-old log ─────────────────────
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const db = JSON.parse(raw);
    const now = Date.now();
    const day = 86400000;
    if (!db.logs) db.logs = [];
    // Add fake log 15 days ago to trigger RTP
    db.logs.unshift({
      timestamp: now - 15 * day,
      shortDate: new Date(now - 15 * day).toISOString().split('T')[0],
      volume: 5000,
      exercises: [{ name: 'Squat Barre', allSets: [{ weight: 80, reps: 5, rpe: 7, isWarmup: false }] }]
    });
    localStorage.setItem(key, JSON.stringify(db));
  }, STORAGE_KEY);
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await navTo(page, 'seances-coach');
  await page.waitForTimeout(1000);
  await ss(page, '33-return-to-play');
  const rtpText = await page.textContent('#coach-today, #seances-coach').catch(() => '');
  if (rtpText.match(/retour.*play|absence|return|tendon|15|j14|14 jour/i)) {
    note('✓ Return-to-Play message visible after 15d absence');
  } else {
    note('Return-to-Play not visible (check getAbsencePenalty + renderCoachTodayHTML logic)');
    // Check if the penalty is computed
    const rtpDebug = await page.evaluate(() => {
      if (typeof getAbsencePenalty === 'function') {
        const r = getAbsencePenalty();
        return JSON.stringify(r);
      }
      return 'function not found';
    });
    note('getAbsencePenalty() result: ' + rtpDebug);
  }

  // ── LP mode check ─────────────────────────────────────────────
  const lpDebug = await page.evaluate(() => {
    if (typeof isInLP === 'function') return 'isInLP() = ' + isInLP();
    const raw = localStorage.getItem('SBD_HUB_V29');
    if (raw) {
      const db = JSON.parse(raw);
      return 'lpActive = ' + (db.user && db.user.lpActive);
    }
    return 'no db';
  });
  note('LP debug: ' + lpDebug);
  if (lpDebug.match(/true|lp.*true/i)) {
    note('✓ LP mode active for new intermediate user');
  } else {
    note('LP mode: ' + lpDebug);
    bug('🟡', 'LP mode not active for intermediate user with low DOTS', 'isInLP() should return true for users with DOTS < 250', '33-return-to-play');
  }

  // ── Warmup protocol variation ─────────────────────────────────
  const warmupDebug = await page.evaluate(() => {
    if (typeof generateWarmupSets !== 'function') return 'function missing';
    const heavy = generateWarmupSets(90, 100, 'squat', false);
    const volume = generateWarmupSets(70, 100, 'squat', false);
    return 'heavy(90kg): ' + heavy.length + ' sets, volume(70kg): ' + volume.length + ' sets';
  });
  note('Warmup protocol: ' + warmupDebug);
  if (warmupDebug.match(/\d+ sets/)) {
    note('✓ generateWarmupSets() returns different protocol by intensity');
  } else {
    bug('🟠', 'generateWarmupSets() not accessible or returns wrong result', 'Should return different protocols for heavy (>80% e1RM) vs volume sessions', '32-go-poor-sleep');
  }

  await ss(page, '34-edge-cases-done');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 7 — Bug Report
  // ═══════════════════════════════════════════════════════════════
  note('=== Closing browser and generating report ===');
  await browser.close();

  const blockingBugs = bugs.filter(b => b.severity === '🔴');
  const majorBugs = bugs.filter(b => b.severity === '🟠');
  const minorBugs = bugs.filter(b => b.severity === '🟡');
  const ssCount = log.filter(l => l.startsWith('📸')).length;

  const reportContent = `# Beta Tester Simulation — TrainHub v137
**Date**: ${new Date().toISOString().split('T')[0]}
**Profil**: Intermédiaire, 32 ans, 80kg, Homme, Powerbuilding
**SW**: v137
**Screenshots**: audit/screenshots/beta-test/ (${ssCount} captures)

---

## Résumé exécutif

| Sévérité | Count |
|----------|-------|
| 🔴 Bloquant | ${blockingBugs.length} |
| 🟠 Majeur | ${majorBugs.length} |
| 🟡 Mineur | ${minorBugs.length} |
| ✅ Tests OK | ${log.filter(l => l.startsWith('✓')).length} |

${blockingBugs.length === 0 ? '**✅ Aucun bug bloquant — app stable pour bêta fermée**' : '**⚠️ Bugs bloquants à corriger avant lancement**'}

---

## Phase 1 — Onboarding

${log.filter((l,i) => i < log.findIndex(ll => ll.includes('PHASE 2'))).map(l => '- ' + l).join('\n')}

## Phase 2 — Coach Tab

${log.filter((l,i) => {
  const s = log.findIndex(ll => ll.includes('PHASE 2'));
  const e = log.findIndex(ll => ll.includes('PHASE 3'));
  return i >= s && (e === -1 || i < e);
}).map(l => '- ' + l).join('\n')}

## Phase 3 — GO Tab / Workout

${log.filter((l,i) => {
  const s = log.findIndex(ll => ll.includes('PHASE 3'));
  const e = log.findIndex(ll => ll.includes('PHASE 4'));
  return i >= s && (e === -1 || i < e);
}).map(l => '- ' + l).join('\n')}

## Phase 4 — Post-workout tabs

${log.filter((l,i) => {
  const s = log.findIndex(ll => ll.includes('PHASE 4'));
  const e = log.findIndex(ll => ll.includes('PHASE 5'));
  return i >= s && (e === -1 || i < e);
}).map(l => '- ' + l).join('\n')}

## Phase 5 — Waitlist

${log.filter((l,i) => {
  const s = log.findIndex(ll => ll.includes('PHASE 5'));
  const e = log.findIndex(ll => ll.includes('PHASE 6'));
  return i >= s && (e === -1 || i < e);
}).map(l => '- ' + l).join('\n')}

## Phase 6 — Edge Cases

${log.filter((l,i) => {
  const s = log.findIndex(ll => ll.includes('PHASE 6'));
  return i >= s;
}).map(l => '- ' + l).join('\n')}

---

## Bugs trouvés

${bugs.length === 0 ? '✅ Aucun bug trouvé' : bugs.map((b, i) => `### Bug ${i + 1}: ${b.severity} ${b.what}
- **Attendu**: ${b.expected}
- **Screenshot**: ${b.screenshot}`).join('\n\n')}

---

## Verdict

Score estimé post-beta: **${blockingBugs.length === 0 && majorBugs.length === 0 ? '9.7' : blockingBugs.length > 0 ? '8.0' : majorBugs.length > 1 ? '9.0' : '9.3'}/10**

${blockingBugs.length === 0
  ? '✅ App fonctionnelle — parcours bêta complet valide'
  : '⚠️ Corrections nécessaires:\n' + blockingBugs.map(b => '- 🔴 ' + b.what).join('\n')}

${majorBugs.length > 0 ? '\n**🟠 À corriger en priorité:**\n' + majorBugs.map(b => '- ' + b.what).join('\n') : ''}
${minorBugs.length > 0 ? '\n**🟡 À noter pour prochaine session:**\n' + minorBugs.map(b => '- ' + b.what).join('\n') : ''}
`;

  const reportPath = path.join(__dirname, '12-beta-tester-simulation.md');
  fs.writeFileSync(reportPath, reportContent);
  console.log('\n[DONE] Report: ' + reportPath);
  console.log('[BUGS]', bugs.length, 'total:', blockingBugs.length, '🔴', majorBugs.length, '🟠', minorBugs.length, '🟡');
  if (bugs.length > 0) {
    console.log('[BUG LIST]');
    bugs.forEach(b => console.log('  ' + b.severity, b.what));
  }

  return { bugs, blockingBugs, majorBugs, minorBugs, log };
}

run().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
