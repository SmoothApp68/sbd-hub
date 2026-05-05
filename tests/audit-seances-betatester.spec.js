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
    !e.includes('supabase') && !e.includes('favicon') &&
    !e.includes('ERR_') && !e.includes('net::') &&
    !e.includes('chrome-extension') && !e.includes('Failed to load resource') &&
    !e.includes('SW registration') && !e.includes('service-worker') &&
    !e.includes('ServiceWorker') && !e.includes('Content Security Policy') &&
    !e.includes('Refused to') && !e.includes('navigator.vibrate') &&
    !e.includes('chromestatus.com') && !e.includes('Push')
  );
}

async function screenshot(page, name) {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false });
}

async function goToTab(page, tabId) {
  await page.evaluate((id) => { if (typeof showTab === 'function') showTab(id); }, tabId);
  await page.waitForTimeout(400);
}

async function goToSeancesSub(page, subId) {
  await goToTab(page, 'tab-seances');
  await page.evaluate((id) => { if (typeof showSeancesSub === 'function') showSeancesSub(id); }, subId);
  await page.waitForTimeout(400);
}

// ─── Build 20 logs for profiles B and C ────────────────────────────────────

function buildLogs(bw) {
  const logs = [];
  for (let i = 0; i < 20; i++) {
    logs.push({
      id: 'log-' + i,
      timestamp: Date.now() - i * 1.5 * 86400000,
      shortDate: new Date(Date.now() - i * 1.5 * 86400000).toISOString().split('T')[0],
      duration: 75,
      volume: 8000 + Math.random() * 2000,
      exercises: [
        {
          name: 'Squat (Barre)', isPrimary: true,
          sets: 3, maxRM: 150,
          allSets: [
            { weight: 120, reps: 5, rpe: 8, isWarmup: false },
            { weight: 120, reps: 5, rpe: 8.5, isWarmup: false },
            { weight: 120, reps: 4, rpe: 9, isWarmup: false }
          ]
        },
        {
          name: 'Développé Couché (Barre)', isPrimary: true,
          sets: 2, maxRM: 100,
          allSets: [
            { weight: 90, reps: 5, rpe: 8, isWarmup: false },
            { weight: 90, reps: 5, rpe: 8.5, isWarmup: false }
          ]
        },
        {
          name: 'Soulevé de Terre', isPrimary: false,
          sets: 3, maxRM: 180,
          allSets: [
            { weight: 160, reps: 3, rpe: 8.5, isWarmup: false },
            { weight: 160, reps: 3, rpe: 9, isWarmup: false }
          ]
        }
      ]
    });
  }
  return logs;
}

// ─── Profile A — J1 Débutant cold start ─────────────────────────────────────

const profileA = {
  user: {
    name: 'TestDebutant', age: 22, bw: 75, height: 175,
    gender: 'M', onboardingProfile: 'debutant',
    trainingMode: 'musculation',
    programParams: { freq: 3, goal: 'masse', level: 'debutant' },
    onboardingPRs: { squat: 60, bench: 50, deadlift: 80 },
    barWeight: 20, units: 'kg', tier: 'free',
    coachProfile: 'full', vocabLevel: 1,
    activityTemplate: [],
    lpActive: true, lpStrikes: {}
  },
  logs: [], exercises: {},
  bestPR: { squat: 60, bench: 50, deadlift: 80 },
  weeklyPlan: null, activityLogs: [], earnedBadges: {},
  xpHighWaterMark: 0, gamification: {},
  todayWellbeing: {
    date: new Date().toISOString().split('T')[0], sleep: 4, readiness: 3
  }
};

// ─── Profile B — J30 Powerbuilder avancé ────────────────────────────────────

const profileB = {
  user: {
    name: 'TestAvance', age: 28, bw: 85, height: 180,
    gender: 'M', onboardingProfile: 'intermediaire',
    trainingMode: 'powerbuilding',
    programParams: { freq: 4, goal: 'force_physique', level: 'intermediate' },
    onboardingPRs: { squat: 140, bench: 110, deadlift: 170 },
    barWeight: 20, units: 'kg', tier: 'premium',
    coachProfile: 'full', vocabLevel: 2,
    lpActive: false,
    activityTemplate: [{ type: 'natation', intensity: 3, days: ['Mercredi'], duration: 45 }]
  },
  logs: buildLogs(85),
  exercises: {
    'Squat (Barre)': { e1rm: 150, shadowWeight: 145, lastRPE: 8.5 },
    'Développé Couché (Barre)': { e1rm: 100, shadowWeight: 95, lastRPE: 8 },
    'Soulevé de Terre': { e1rm: 180, shadowWeight: 175, lastRPE: 8.5 }
  },
  bestPR: { squat: 140, bench: 110, deadlift: 170 },
  weeklyPlan: null, activityLogs: [], earnedBadges: {},
  xpHighWaterMark: 500, gamification: {},
  todayWellbeing: {
    date: new Date().toISOString().split('T')[0], sleep: 3, readiness: 2
  }
};

// ─── Profile C — Femme cycle luteale actif ───────────────────────────────────

const profileC = {
  user: {
    name: 'TestLea', age: 25, bw: 62, height: 165,
    gender: 'female', onboardingProfile: 'intermediaire',
    trainingMode: 'powerbuilding',
    programParams: { freq: 4, goal: 'masse', level: 'intermediate' },
    barWeight: 15, units: 'kg', tier: 'premium',
    coachProfile: 'full', vocabLevel: 2,
    menstrualEnabled: true, menstrualPhase: 'luteale', menstrualDayInPhase: 5,
    lpActive: false, activityTemplate: []
  },
  logs: buildLogs(62),
  exercises: {
    'Squat (Barre)': { e1rm: 90, shadowWeight: 85, lastRPE: 8 },
    'Développé Couché (Barre)': { e1rm: 65, shadowWeight: 60, lastRPE: 7.5 }
  },
  bestPR: { squat: 85, bench: 65, deadlift: 100 },
  weeklyPlan: null, activityLogs: [], earnedBadges: {},
  xpHighWaterMark: 300, gamification: {},
  todayWellbeing: {
    date: new Date().toISOString().split('T')[0], sleep: 2, readiness: 2
  }
};

// ─── TESTS ──────────────────────────────────────────────────────────────────

test.describe('Audit Bêta-Testeur — Onglet Séances v162', () => {

  // ── TEST 1 : Coach ─────────────────────────────────────────────────────────

  test('T1-A — Coach tab: Débutant J1 (cold start)', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileA);
    await goToSeancesSub(page, 'seances-coach');
    await page.waitForTimeout(600);

    const html = await page.evaluate(() => {
      const el = document.querySelector('#seances-coach') || document.querySelector('[data-sub="seances-coach"]');
      return el ? el.innerHTML.length : 0;
    });
    console.log('Coach A html length:', html);

    // Vérifier qu'il n'y a pas de "undefined" ou "NaN" visible
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasUndefined = bodyText.includes('undefined') || bodyText.includes('NaN');
    console.log('Coach A — undefined/NaN visible:', hasUndefined);

    await screenshot(page, 'coach-A.png');
    const filtered = filterAppErrors(errors);
    console.log('T1-A errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(html).toBeGreaterThan(100);
  });

  test('T1-B — Coach tab: Powerbuilder J30 (sommeil bas)', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileB);
    await goToSeancesSub(page, 'seances-coach');
    await page.waitForTimeout(600);

    const coachData = await page.evaluate(() => {
      const sections = {};
      // Batterie Nerveuse
      const srsEl = document.querySelector('.srs-card, [id*="srs"], [class*="srs"]');
      sections.srsVisible = !!srsEl || document.body.innerHTML.includes('Batterie') || document.body.innerHTML.includes('SRS');
      // Budget Énergétique
      sections.budgetVisible = document.body.innerHTML.includes('Budget') || document.body.innerHTML.includes('TRIMP') || document.body.innerHTML.includes('Charge');
      // Pas de NaN/undefined
      sections.hasNaN = document.body.innerText.includes('NaN') || document.body.innerText.includes('undefined');
      return sections;
    });
    console.log('Coach B — srs:', coachData.srsVisible, 'budget:', coachData.budgetVisible, 'NaN:', coachData.hasNaN);

    await screenshot(page, 'coach-B.png');
    const filtered = filterAppErrors(errors);
    console.log('T1-B errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(coachData.hasNaN).toBe(false);
  });

  test('T1-C — Coach tab: Femme cycle luteale (message cycle)', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileC);
    await goToSeancesSub(page, 'seances-coach');
    await page.waitForTimeout(600);

    const cycleInfo = await page.evaluate(() => {
      const html = document.body.innerHTML;
      return {
        hasCycleMsg: html.includes('cycle') || html.includes('lutéale') || html.includes('luteale') || html.includes('récupère'),
        hasNaN: document.body.innerText.includes('NaN') || document.body.innerText.includes('undefined'),
        htmlLen: html.length
      };
    });
    console.log('Coach C — cycle msg:', cycleInfo.hasCycleMsg, 'NaN:', cycleInfo.hasNaN);

    await screenshot(page, 'coach-C.png');
    const filtered = filterAppErrors(errors);
    console.log('T1-C errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(cycleInfo.hasNaN).toBe(false);
  });

  // ── TEST 2 : Programme ─────────────────────────────────────────────────────

  test('T2-A — Programme tab: Débutant génère un programme', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileA);
    await goToSeancesSub(page, 'seances-programme');
    await page.waitForTimeout(800);

    const progInfo = await page.evaluate(() => {
      const container = document.getElementById('programBuilderContent');
      if (!container) return { exists: false };
      const html = container.innerHTML;
      // Compter les boutons "Modifier les exercices" (bug doublon)
      const editBtns = container.querySelectorAll('.pb-edit-btn, button');
      const modifierBtns = Array.from(editBtns).filter(b => b.textContent.includes('Modifier les exercices'));
      return {
        exists: true,
        htmlLen: html.length,
        modifierBtnCount: modifierBtns.length,
        hasReset: html.includes('Réinitialiser') || html.includes('reset'),
        hasDays: html.includes('Lundi') || html.includes('Mardi') || html.includes('programme'),
        hasNaN: container.innerText.includes('NaN') || container.innerText.includes('undefined')
      };
    });
    console.log('Programme A:', progInfo);

    await screenshot(page, 'programme-A.png');
    const filtered = filterAppErrors(errors);
    console.log('T2-A errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(progInfo.exists).toBe(true);
    // Bug fix v162: max 1 bouton "Modifier les exercices"
    expect(progInfo.modifierBtnCount).toBeLessThanOrEqual(1);
    expect(progInfo.hasNaN).toBe(false);
  });

  test('T2-B — Programme tab: Powerbuilder (pas de doublon bouton)', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileB);
    await goToSeancesSub(page, 'seances-programme');
    await page.waitForTimeout(800);

    // Naviguer plusieurs fois pour tester les doublons (bug principal)
    await goToTab(page, 'tab-dash');
    await page.waitForTimeout(200);
    await goToSeancesSub(page, 'seances-programme');
    await page.waitForTimeout(600);
    await goToTab(page, 'tab-stats');
    await page.waitForTimeout(200);
    await goToSeancesSub(page, 'seances-programme');
    await page.waitForTimeout(600);

    const progInfo = await page.evaluate(() => {
      const container = document.getElementById('programBuilderContent');
      if (!container) return { exists: false };
      const allBtns = Array.from(container.querySelectorAll('button'));
      const modifierBtns = allBtns.filter(b => b.textContent.includes('Modifier les exercices'));
      return {
        exists: true,
        htmlLen: container.innerHTML.length,
        modifierBtnCount: modifierBtns.length,
        hasDays: container.innerHTML.includes('Lundi') || container.innerHTML.includes('Mardi'),
        hasNaN: container.innerText.includes('NaN') || container.innerText.includes('undefined'),
        preview: container.innerText.substring(0, 100)
      };
    });
    console.log('Programme B (after 3 navigations):', progInfo);

    await screenshot(page, 'programme-B.png');
    const filtered = filterAppErrors(errors);
    console.log('T2-B errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(progInfo.modifierBtnCount).toBeLessThanOrEqual(1);
    expect(progInfo.hasNaN).toBe(false);
  });

  test('T2-C — Programme tab: Femme cycle (programme adapté)', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileC);
    await goToSeancesSub(page, 'seances-programme');
    await page.waitForTimeout(800);

    const progInfo = await page.evaluate(() => {
      const container = document.getElementById('programBuilderContent');
      if (!container) return { exists: false };
      const allBtns = Array.from(container.querySelectorAll('button'));
      const modifierBtns = allBtns.filter(b => b.textContent.includes('Modifier les exercices'));
      return {
        exists: true,
        htmlLen: container.innerHTML.length,
        modifierBtnCount: modifierBtns.length,
        hasNaN: container.innerText.includes('NaN') || container.innerText.includes('undefined')
      };
    });
    console.log('Programme C:', progInfo);

    await screenshot(page, 'programme-C.png');
    const filtered = filterAppErrors(errors);
    console.log('T2-C errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(progInfo.modifierBtnCount).toBeLessThanOrEqual(1);
    expect(progInfo.hasNaN).toBe(false);
  });

  // ── TEST 3 : GO (profil B) ─────────────────────────────────────────────────

  test('T3-B — GO tab: idle screen + plan du jour', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileB);
    await goToSeancesSub(page, 'seances-go');
    await page.waitForTimeout(700);

    // Fermer éventuel quiz overlay
    await page.evaluate(() => {
      const overlay = document.getElementById('quiz-overlay');
      if (overlay) overlay.classList.remove('open');
    });
    await page.waitForTimeout(200);

    const goInfo = await page.evaluate(() => {
      const goEl = document.getElementById('seances-go') || document.querySelector('[data-sub="seances-go"]');
      const html = goEl ? goEl.innerHTML : document.body.innerHTML;
      return {
        htmlLen: html.length,
        hasStartBtn: html.includes('Démarrer') || html.includes('démarrer') || html.includes('GO'),
        hasNaN: document.body.innerText.includes('NaN') || document.body.innerText.includes('undefined'),
        hasPlanDuJour: html.includes('Lundi') || html.includes('Mardi') || html.includes('programme') || html.includes('jour')
      };
    });
    console.log('GO B idle:', goInfo);

    await screenshot(page, 'go-idle-B.png');

    // Tenter de démarrer la séance
    const started = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const startBtn = btns.find(b => b.textContent.includes('Démarrer') || b.textContent.includes('GO'));
      if (startBtn) { startBtn.click(); return true; }
      if (typeof goStart === 'function') { goStart(); return true; }
      return false;
    });
    await page.waitForTimeout(700);
    console.log('GO B started:', started);
    await screenshot(page, 'go-active-B.png');

    // Vérifier la charge (pas de NaN)
    const activeInfo = await page.evaluate(() => {
      const html = document.body.innerHTML;
      return {
        hasNaNInCharge: html.includes('NaN') || html.includes('undefined kg') || html.includes('NaN kg'),
        hasWarmup: html.includes('Warm') || html.includes('échauffement') || html.includes('Échauffement'),
        htmlLen: html.length
      };
    });
    console.log('GO B active:', activeInfo);
    await screenshot(page, 'go-warmup-B.png');

    const filtered = filterAppErrors(errors);
    console.log('T3-B errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(goInfo.hasNaN).toBe(false);
    expect(activeInfo.hasNaNInCharge).toBe(false);
  });

  // ── TEST 4 : Stats (profil B) ──────────────────────────────────────────────

  test('T4-B — Stats tab: graphiques, records, anatomie', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileB);
    await goToTab(page, 'tab-stats');
    await page.waitForTimeout(800);

    const statsInfo = await page.evaluate(() => {
      const html = document.body.innerHTML;
      const text = document.body.innerText;
      return {
        hasCanvas: document.querySelectorAll('canvas').length,
        hasRecords: html.includes('PR') || html.includes('Record') || html.includes('record'),
        hasSVG: document.querySelectorAll('svg').length > 0,
        hasStrengthStandards: html.includes('Standard') || html.includes('standard') || html.includes('niveau'),
        hasNaN: text.includes('NaN') || text.includes('undefined'),
        htmlLen: html.length
      };
    });
    console.log('Stats B:', statsInfo);

    await screenshot(page, 'stats-B.png');

    // Chercher une section volume
    const volSection = await page.evaluate(() => {
      return document.body.innerHTML.includes('Volume') || document.body.innerHTML.includes('Tonnage');
    });
    console.log('Stats B — volume section:', volSection);

    // Naviguer vers sous-section records si possible
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, .stats-sub-pill'));
      const recordBtn = btns.find(b => b.textContent.includes('Record') || b.textContent.includes('PR'));
      if (recordBtn) recordBtn.click();
    });
    await page.waitForTimeout(400);
    await screenshot(page, 'stats-records-B.png');

    const filtered = filterAppErrors(errors);
    console.log('T4-B errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(statsInfo.hasNaN).toBe(false);
    expect(statsInfo.hasCanvas).toBeGreaterThan(0);
  });

  // ── TEST 5 : Stats profil C (Femme) ───────────────────────────────────────

  test('T5-C — Stats tab: femme cycle actif, pas de NaN', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileC);
    await goToTab(page, 'tab-stats');
    await page.waitForTimeout(800);

    const statsInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasNaN: text.includes('NaN') || text.includes('undefined'),
        canvasCount: document.querySelectorAll('canvas').length,
        htmlLen: document.body.innerHTML.length
      };
    });
    console.log('Stats C:', statsInfo);

    await screenshot(page, 'stats-C.png');
    const filtered = filterAppErrors(errors);
    console.log('T5-C errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(statsInfo.hasNaN).toBe(false);
  });

  // ── TEST 6 : Robustesse navigation (multi-onglets rapide) ──────────────────

  test('T6 — Navigation rapide 4 sous-onglets: pas de crash', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    await seedDB(page, profileB);

    // Naviguer rapidement entre les 4 sous-onglets 2 fois
    const subs = ['seances-go', 'seances-coach', 'seances-programme', 'seances-historique'];
    for (let round = 0; round < 2; round++) {
      for (const sub of subs) {
        await goToSeancesSub(page, sub);
        await page.waitForTimeout(150);
      }
    }
    await page.waitForTimeout(500);

    // Vérifier qu'on est toujours fonctionnel
    await goToSeancesSub(page, 'seances-programme');
    await page.waitForTimeout(400);
    const progInfo = await page.evaluate(() => {
      const container = document.getElementById('programBuilderContent');
      if (!container) return { ok: false, btnCount: 0 };
      const allBtns = Array.from(container.querySelectorAll('button'));
      const modifierBtns = allBtns.filter(b => b.textContent.includes('Modifier les exercices'));
      return { ok: true, btnCount: modifierBtns.length, htmlLen: container.innerHTML.length };
    });
    console.log('T6 — après navigation rapide, programme:', progInfo);

    await screenshot(page, 'navigation-rapide.png');
    const filtered = filterAppErrors(errors);
    console.log('T6 errors:', filtered);
    expect(filtered.length).toBe(0);
    expect(progInfo.btnCount).toBeLessThanOrEqual(1);
  });

});
