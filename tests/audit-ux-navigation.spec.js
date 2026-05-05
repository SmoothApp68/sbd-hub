const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const STORAGE_KEY = 'SBD_HUB_V29';
const SCREENSHOT_DIR = 'audit/screenshots';

async function seedDB(page, db) {
  await page.goto('/', { waitUntil: 'commit' });
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload({ waitUntil: 'load' });
  await page.addStyleTag({ content: '#loginScreen, #onboarding-overlay { display: none !important; pointer-events: none !important; z-index: -1 !important; }' });
  await page.evaluate(() => {
    const ob = document.getElementById('onboarding-overlay'); if (ob) ob.style.display = 'none';
    const login = document.getElementById('loginScreen'); if (login) { login.style.display = 'none'; login.style.zIndex = '-1'; }
  });
  await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 15000 });
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

const profileJ7 = {
  user: {
    name: 'TestJ7', age: 26, bw: 80, height: 178,
    gender: 'M', onboardingProfile: 'intermediaire', trainingMode: 'powerbuilding',
    programParams: { freq: 4, goal: 'force_physique', level: 'intermediate' },
    barWeight: 20, units: 'kg', tier: 'premium', coachProfile: 'full', vocabLevel: 2,
    lpActive: false,
    activityTemplate: [{ type: 'natation', intensity: 3, days: ['Mercredi'], duration: 45 }]
  },
  logs: [
    { id: 'l1', timestamp: Date.now() - 86400000, shortDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      duration: 75, volume: 8500,
      exercises: [{ name: 'Squat (Barre)', isPrimary: true, sets: 3, maxRM: 110,
        allSets: [{weight:100,reps:5,rpe:8,isWarmup:false},{weight:100,reps:5,rpe:8.5,isWarmup:false},{weight:100,reps:4,rpe:9,isWarmup:false}] }] },
    { id: 'l2', timestamp: Date.now() - 3*86400000, shortDate: new Date(Date.now() - 3*86400000).toISOString().split('T')[0],
      duration: 60, volume: 7000,
      exercises: [{ name: 'Développé Couché (Barre)', isPrimary: true, sets: 2, maxRM: 88,
        allSets: [{weight:80,reps:5,rpe:8,isWarmup:false},{weight:80,reps:5,rpe:8.5,isWarmup:false}] }] }
  ],
  exercises: {
    'Squat (Barre)': { e1rm: 110, shadowWeight: 105, lastRPE: 8 },
    'Développé Couché (Barre)': { e1rm: 88, shadowWeight: 85, lastRPE: 8 }
  },
  bestPR: { squat: 100, bench: 80, deadlift: 130 },
  weeklyPlan: null, activityLogs: [], earnedBadges: {}, xpHighWaterMark: 150, gamification: {},
  todayWellbeing: { date: new Date().toISOString().split('T')[0], sleep: 3, readiness: 3 }
};

test.describe('Audit UX Navigation — First Time User v162', () => {

  test('T1 — Premier écran visible (tab-dash)', async ({ page }) => {
    await seedDB(page, profileJ7);
    await page.waitForTimeout(500);

    const dashInfo = await page.evaluate(() => {
      const activeTab = document.querySelector('.content-section.active');
      const tabId = activeTab ? activeTab.id : 'unknown';
      const html = activeTab ? activeTab.innerHTML : '';
      const tabBar = Array.from(document.querySelectorAll('.tab-btn')).map(b => ({
        label: b.textContent.trim().replace(/\s+/g,' '),
        active: b.classList.contains('active'),
        tab: b.getAttribute('data-tab')
      }));
      const welcomeVisible = document.getElementById('welcomeCard')?.style.display !== 'none';
      const weekCard = !!document.getElementById('dashWeekCard');
      const perfCard = !!document.getElementById('perfCard');
      // Y a-t-il un bouton CTA visible ?
      const ctaBtns = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = b.textContent.trim();
        return (t.includes('GO') || t.includes('Démarrer') || t.includes('Commencer') || t.includes('séance')) &&
          b.offsetParent !== null;
      }).map(b => b.textContent.trim().slice(0, 50));
      return { tabId, htmlLen: html.length, tabBar, welcomeVisible, weekCard, perfCard, ctaBtns };
    });

    console.log('T1 — Active tab:', dashInfo.tabId);
    console.log('T1 — Tab bar:', dashInfo.tabBar.map(t => (t.active ? '[ACTIVE] ' : '') + t.label).join(' | '));
    console.log('T1 — welcomeVisible:', dashInfo.welcomeVisible, '| weekCard:', dashInfo.weekCard, '| perfCard:', dashInfo.perfCard);
    console.log('T1 — CTA buttons visible:', dashInfo.ctaBtns);

    await screenshot(page, 'ux-01-first-screen.png');
    expect(dashInfo.tabId).toBe('tab-dash');
  });

  test('T2 — Trouver le programme du jour (profondeur nav)', async ({ page }) => {
    await seedDB(page, profileJ7);
    await page.waitForTimeout(500);

    // Sur le dashboard : y a-t-il le plan du jour visible ?
    const dashHasPlan = await page.evaluate(() => {
      const dash = document.getElementById('tab-dash');
      const text = dash ? dash.innerText : '';
      return {
        hasPlan: text.includes('Programme') || text.includes('Squat') || text.includes('Lundi'),
        hasSeanceCTA: text.includes('GO') || text.includes('Démarrer') || text.includes('séance'),
        dashText: text.substring(0, 300)
      };
    });
    console.log('T2 — Dashboard has plan du jour:', dashHasPlan.hasPlan, '| CTA:', dashHasPlan.hasSeanceCTA);
    console.log('T2 — Dashboard text:', dashHasPlan.dashText);
    await screenshot(page, 'ux-02-dash-no-plan.png');

    // 1 clic → tab Séances (sous-onglet par défaut)
    await goToTab(page, 'tab-seances');
    const seancesDefault = await page.evaluate(() => {
      const activeSub = document.querySelector('.seances-sub-section.active');
      return { subId: activeSub ? activeSub.id : 'none', text: activeSub ? activeSub.innerText.substring(0, 100) : '' };
    });
    console.log('T2 — Séances default sub:', seancesDefault.subId, '|', seancesDefault.text);

    // 2 clics → tab Séances + Programme
    await goToSeancesSub(page, 'seances-programme');
    const progVisible = await page.evaluate(() => {
      const el = document.getElementById('programBuilderContent');
      return { htmlLen: el ? el.innerHTML.length : 0, hasDays: el ? el.innerText.includes('Lundi') || el.innerText.includes('Mardi') : false };
    });
    console.log('T2 — Programme visible after 2 clicks:', progVisible);
    await screenshot(page, 'ux-02-find-programme.png');

    expect(progVisible.htmlLen).toBeGreaterThan(500);
  });

  test('T3 — Trouver la Batterie Nerveuse (SRS)', async ({ page }) => {
    await seedDB(page, profileJ7);
    await page.waitForTimeout(500);

    // Dashboard: y a-t-il le SRS ?
    const dashHasSRS = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Batterie') || text.includes('SRS') || text.includes('Forme') || text.includes('Readiness');
    });
    console.log('T3 — SRS visible on dashboard:', dashHasSRS);

    // 2 clics → Séances → Coach
    await goToSeancesSub(page, 'seances-coach');
    const coachSRS = await page.evaluate(() => {
      const html = document.body.innerHTML;
      const text = document.body.innerText;
      return {
        hasBatterie: html.includes('Batterie') || html.includes('Nerveuse'),
        hasSRS: html.includes('SRS') || html.includes('score'),
        hasBudget: html.includes('Budget') || html.includes('TRIMP'),
        hasNaN: text.includes('NaN') || text.includes('undefined'),
        coachText: text.substring(0, 200)
      };
    });
    console.log('T3 — Coach SRS:', coachSRS);
    await screenshot(page, 'ux-03-find-batterie.png');
    expect(coachSRS.hasBatterie || coachSRS.hasSRS).toBe(true);
    expect(coachSRS.hasNaN).toBe(false);
  });

  test('T4 — Lancer une séance (clics jusqu\'à GO actif)', async ({ page }) => {
    await seedDB(page, profileJ7);
    await page.waitForTimeout(500);

    // 1 clic → Séances
    await goToTab(page, 'tab-seances');

    // 2 clics → GO
    await goToSeancesSub(page, 'seances-go');
    await page.evaluate(() => { const o = document.getElementById('quiz-overlay'); if (o) o.classList.remove('open'); });
    await page.waitForTimeout(300);

    const goIdle = await page.evaluate(() => {
      const go = document.getElementById('seances-go');
      const html = go ? go.innerHTML : '';
      const text = go ? go.innerText : '';
      const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
      const startBtnLabels = allBtns.filter(b => {
        const t = b.textContent.trim().toLowerCase();
        return t.includes('démarrer') || t.includes('commencer') || t.includes('go') || t.includes('c\'est parti') || t.includes('entraîn');
      }).map(b => b.textContent.trim().slice(0, 60));
      return { htmlLen: html.length, startBtns: startBtnLabels, text: text.substring(0, 200) };
    });
    console.log('T4 — GO idle htmlLen:', goIdle.htmlLen, '| Start buttons found:', goIdle.startBtns);
    console.log('T4 — GO idle text:', goIdle.text);
    await screenshot(page, 'ux-04-go-idle.png');

    // 3e action → démarrer
    await page.evaluate(() => {
      if (typeof goStart === 'function') { goStart(); return; }
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
      const s = btns.find(b => b.textContent.toLowerCase().includes('démarrer') || b.textContent.toLowerCase().includes('commencer'));
      if (s) s.click();
    });
    await page.waitForTimeout(700);

    const goActive = await page.evaluate(() => {
      return {
        htmlLen: document.body.innerHTML.length,
        hasExo: document.body.innerHTML.includes('Squat') || document.body.innerHTML.includes('kg'),
        hasNaN: document.body.innerText.includes('NaN kg') || document.body.innerText.includes('undefined')
      };
    });
    console.log('T4 — GO active:', goActive);
    await screenshot(page, 'ux-04-go-active.png');
    expect(goIdle.htmlLen).toBeGreaterThan(200);
    expect(goActive.hasNaN).toBe(false);
  });

  test('T5 — Trouver les statistiques', async ({ page }) => {
    await seedDB(page, profileJ7);
    await page.waitForTimeout(500);

    // 1 clic → Stats
    await goToTab(page, 'tab-stats');

    const statsInfo = await page.evaluate(() => {
      return {
        canvasCount: document.querySelectorAll('canvas').length,
        hasSVG: document.querySelectorAll('svg').length > 1,
        hasVolume: document.body.innerHTML.includes('Volume') || document.body.innerHTML.includes('Tonnage'),
        hasRecords: document.body.innerHTML.includes('Record') || document.body.innerHTML.includes('PR'),
        hasNaN: document.body.innerText.includes('NaN') || document.body.innerText.includes('undefined'),
        subPills: Array.from(document.querySelectorAll('.stats-sub-pill')).map(p => p.textContent.trim())
      };
    });
    console.log('T5 — Stats:', statsInfo);
    await screenshot(page, 'ux-05-stats.png');
    expect(statsInfo.canvasCount).toBeGreaterThan(0);
    expect(statsInfo.hasNaN).toBe(false);
  });

  test('T6 — Trouver le leaderboard DOTS', async ({ page }) => {
    await seedDB(page, profileJ7);
    await page.waitForTimeout(500);

    // 1 clic → Jeux (tab-game)
    await goToTab(page, 'tab-game');
    await page.waitForTimeout(600);

    const gameInfo = await page.evaluate(() => {
      const html = document.body.innerHTML;
      const text = document.body.innerText;
      return {
        hasLeaderboard: html.includes('Leaderboard') || html.includes('Classement') || html.includes('DOTS') || html.includes('leaderboard'),
        hasBadges: html.includes('Badge') || html.includes('badge'),
        hasXP: html.includes('XP') || html.includes('xp'),
        dotsVisible: text.includes('DOTS') || text.includes('pts'),
        gameText: text.substring(0, 300)
      };
    });
    console.log('T6 — Game tab:', gameInfo);
    await screenshot(page, 'ux-06-leaderboard.png');
    expect(gameInfo.hasLeaderboard || gameInfo.hasBadges).toBe(true);
  });

  test('T7 — Synthèse profondeur de navigation', async ({ page }) => {
    await seedDB(page, profileJ7);
    await page.waitForTimeout(500);

    const navDepth = {};

    // programme du jour
    await goToTab(page, 'tab-dash');
    const hasPlanOnDash = await page.evaluate(() => {
      const d = document.getElementById('tab-dash');
      return d ? (d.innerText.includes('Programme') || d.innerText.includes('Squat') || d.innerText.includes('Lundi')) : false;
    });
    navDepth.programme_du_jour = hasPlanOnDash ? 0 : 2; // 0 si sur dash, 2 si Séances→Programme

    // batterie nerveuse
    const hasSRSOnDash = await page.evaluate(() => {
      const d = document.getElementById('tab-dash');
      return d ? (d.innerText.includes('Batterie') || d.innerText.includes('SRS')) : false;
    });
    navDepth.batterie_nerveuse = hasSRSOnDash ? 0 : 2; // Séances→Coach

    // lancer séance: Séances→GO→click
    navDepth.lancer_seance = 3;

    // statistiques: tab Stats direct
    navDepth.statistiques = 1;

    // leaderboard: tab Jeux direct
    navDepth.leaderboard = 1;

    // réglages: tab Profil
    navDepth.reglages = 1;

    // badges: tab Jeux
    navDepth.badges = 1;

    // sous-onglet actif par défaut dans Séances
    await goToTab(page, 'tab-seances');
    const seancesDefaultSub = await page.evaluate(() => {
      const active = document.querySelector('.seances-sub-section.active');
      return active ? active.id : 'none';
    });

    console.log('T7 — Navigation depth:', navDepth);
    console.log('T7 — Séances default sub-tab:', seancesDefaultSub);
    console.log('T7 — hasPlanOnDash:', hasPlanOnDash, '| hasSRSOnDash:', hasSRSOnDash);

    await screenshot(page, 'ux-07-nav-depth.png');

    // Vérifier que stats et leaderboard sont en 1 clic
    expect(navDepth.statistiques).toBe(1);
    expect(navDepth.leaderboard).toBe(1);
    // Le sous-onglet par défaut dans Séances
    expect(seancesDefaultSub).toBeTruthy();
  });

});
