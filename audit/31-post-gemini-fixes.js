// audit/31-post-gemini-fixes.js — Tests v181 — 4 fixes post-audit Gemini
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8787/sbd-hub/index.html';

// Profil intermédiaire de base
const P_BASE = {
  user: {
    name:'TestV181', age:28, bw:80, height:178, gender:'male', fatPct:null,
    trainingMode:'powerbuilding', onboardingProfile:'intermediaire',
    level:'intermediaire', onboarded:true, onboardingVersion:99,
    coachEnabled:true, coachProfile:'full', vocabLevel:2, lpActive:false, lpStrikes:{},
    programParams: { freq:4, duration:60, level:'intermediaire',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi'],
      mat:'salle', injuries:[], cardio:'aucun', goals:['masse'] },
    barWeight:20, units:'kg',
    _activityMigrated:true, _injuryMigrated:true,
    consentHealth:true, medicalConsent:true,
    onboardingPRs: { squat:120, bench:90, deadlift:150 }
  },
  logs:[], exercises:{'Squat (Barre)':{e1rm:130}}, bestPR:{squat:120,bench:90,deadlift:150},
  weeklyPlan:null, routine:null,
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

  // ── FIX 1: iOS Install Prompt ──────────────────────────────────────────────
  console.log('\n── FIX 1: iOS Install Prompt ──');

  // FIX1-01: checkIOSInstallPrompt defined
  await withPage(browser, P_BASE, async (page) => {
    const defined = await page.evaluate(() => typeof checkIOSInstallPrompt === 'function');
    ok('FIX1-01 checkIOSInstallPrompt is defined', defined, 'function exists globally');
  });

  // FIX1-02: iOS detection logic — non-iOS UA should not show banner
  await withPage(browser, P_BASE, async (page) => {
    const bannerAfterNonIOS = await page.evaluate(() => {
      // Default UA is Chrome desktop — not iOS → banner should not appear
      checkIOSInstallPrompt();
      return !!document.getElementById('ios-install-banner');
    });
    ok('FIX1-02 No banner on non-iOS UA', !bannerAfterNonIOS, 'desktop UA → no banner');
  });

  // FIX1-03: iOS detection logic — iOS Safari UA shows banner (simulated)
  await withPage(browser, P_BASE, async (page) => {
    const bannerShown = await page.evaluate(() => {
      // Monkey-patch navigator.userAgent for this test
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', configurable: true });
      Object.defineProperty(navigator, 'standalone', { get: () => false, configurable: true });
      db.user._iosInstallPromptShown = false;
      checkIOSInstallPrompt();
      return !!document.getElementById('ios-install-banner');
    });
    ok('FIX1-03 Banner shown on iOS Safari UA', bannerShown, 'iOS Safari UA → banner visible');
  });

  // FIX1-04: Already shown flag prevents repeat
  await withPage(browser, P_BASE, async (page) => {
    const noRepeat = await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', configurable: true });
      Object.defineProperty(navigator, 'standalone', { get: () => false, configurable: true });
      db.user._iosInstallPromptShown = true; // already shown
      checkIOSInstallPrompt();
      return !document.getElementById('ios-install-banner');
    });
    ok('FIX1-04 No banner when _iosInstallPromptShown=true', noRepeat, 'flag prevents repeat');
  });

  // FIX1-05: standalone:true (already installed) skips banner
  await withPage(browser, P_BASE, async (page) => {
    const noInstalled = await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', configurable: true });
      Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true }); // installed
      db.user._iosInstallPromptShown = false;
      checkIOSInstallPrompt();
      return !document.getElementById('ios-install-banner');
    });
    ok('FIX1-05 No banner when standalone=true (installed)', noInstalled, 'already installed → skip');
  });

  // FIX1-06: Chrome iOS (CriOS) should not get banner
  await withPage(browser, P_BASE, async (page) => {
    const noChromeIOS = await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1', configurable: true });
      Object.defineProperty(navigator, 'standalone', { get: () => false, configurable: true });
      db.user._iosInstallPromptShown = false;
      checkIOSInstallPrompt();
      return !document.getElementById('ios-install-banner');
    });
    ok('FIX1-06 No banner on Chrome iOS (CriOS)', noChromeIOS, 'CriOS UA → no banner');
  });

  // ── FIX 2: iOS FC Widget ───────────────────────────────────────────────────
  console.log('\n── FIX 2: iOS FC Widget ──');

  // FIX2-01: renderFCWidget() defined
  await withPage(browser, P_BASE, async (page) => {
    const defined = await page.evaluate(() => typeof renderFCWidget === 'function');
    ok('FIX2-01 renderFCWidget is defined', defined, 'function exists');
  });

  // FIX2-02: Non-iOS returns "Connecter" button
  await withPage(browser, P_BASE, async (page) => {
    const html = await page.evaluate(() => {
      _currentHR = 0;
      return renderFCWidget();
    });
    ok('FIX2-02 Non-iOS renders Connecter button', html.includes('Connecter'), 'non-iOS → BLE button');
  });

  // FIX2-03: iOS Safari returns manual HR input instead of Connecter
  await withPage(browser, P_BASE, async (page) => {
    const html = await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', configurable: true });
      _currentHR = 0;
      return renderFCWidget();
    });
    ok('FIX2-03 iOS returns number input', html.includes('type="number"'), 'iOS → manual input');
    ok('FIX2-04 iOS no Connecter button', !html.includes('Connecter'), 'iOS → BLE button absent');
  });

  // FIX2-05: Connected state still shows BPM (regardless of iOS)
  await withPage(browser, P_BASE, async (page) => {
    const html = await page.evaluate(() => {
      _currentHR = 65;
      return renderFCWidget();
    });
    ok('FIX2-05 Connected state shows bpm', html.includes('bpm'), 'connected → HR display');
  });

  // ── FIX 3: APRE +5% cap ────────────────────────────────────────────────────
  console.log('\n── FIX 3: APRE +5% weekly cap ──');

  // Build a profile with 5 recent squat sessions at 100kg (so +20% would be attempted → capped to 105)
  const P_APRE = JSON.parse(JSON.stringify(P_BASE));
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    P_APRE.logs.push({
      id: 'log' + i, timestamp: now - i * 86400000 * 2, date: new Date(now - i * 86400000 * 2).toISOString().split('T')[0],
      exercises: [{
        name: 'Squat (Barre)', isCardio: false,
        series: [
          { weight: 100, reps: 5, rpe: 7.5 },
          { weight: 100, reps: 5, rpe: 7.5 }
        ],
        allSets: [
          { weight: 100, reps: 5, rpe: 7.5 },
          { weight: 100, reps: 5, rpe: 7.5 }
        ],
        maxRM: 112
      }],
      trimp: 90, duration: 3600
    });
  }
  P_APRE.exercises = { 'Squat (Barre)': { e1rm: 112 } };
  P_APRE.bestPR = { squat: 110, bench: 90, deadlift: 150 };

  // FIX3-01: wpComputeWorkWeight defined
  await withPage(browser, P_APRE, async (page) => {
    const defined = await page.evaluate(() => typeof wpComputeWorkWeight === 'function');
    ok('FIX3-01 wpComputeWorkWeight is defined', defined, 'function exists');
  });

  // FIX3-02: Cap code present in app.min.js (source check)
  const minSrc = fs.readFileSync(path.join(__dirname, '../js/app.min.js'), 'utf8');
  ok('FIX3-02 +5% cap code in app.min.js', minSrc.includes('1.05'), 'cap multiplier present');

  // FIX3-03: Cap applied — squat at 100kg, APRE baseline capped ≤ 105kg
  await withPage(browser, P_APRE, async (page) => {
    const weight = await page.evaluate(() => {
      // Force APRE mode (not LP, not beginner)
      db.user.lpActive = false;
      isBeginnerMode = false;
      return wpComputeWorkWeight('squat', 'lower');
    });
    ok('FIX3-03 Squat APRE capped ≤ 105% last weight', weight !== null && weight <= 105, 'weight=' + weight);
  });

  // FIX3-04: LP users exempt from cap (LP should still progress linearly)
  await withPage(browser, P_APRE, async (page) => {
    const weight = await page.evaluate(() => {
      db.user.lpActive = true;
      return wpComputeWorkWeight('squat', 'lower');
    });
    ok('FIX3-04 LP users return a weight (not null)', weight !== null && weight > 0, 'LP exempt, weight=' + weight);
  });

  // ── FIX 4: labelFor() adaptive vocabulary ──────────────────────────────────
  console.log('\n── FIX 4: labelFor() adaptive vocabulary ──');

  // FIX4-01: labelFor() defined
  await withPage(browser, P_BASE, async (page) => {
    const defined = await page.evaluate(() => typeof labelFor === 'function');
    ok('FIX4-01 labelFor() is defined', defined, 'function exists globally');
  });

  // FIX4-02: vocabLevel 1/2 → friendly labels
  await withPage(browser, P_BASE, async (page) => {
    const labels = await page.evaluate(() => {
      db.user.vocabLevel = 1;
      return { srs: labelFor('srs'), acwr: labelFor('acwr'), trimp: labelFor('trimp') };
    });
    ok('FIX4-02 vocabLevel 1 SRS → "Forme du jour"', labels.srs === 'Forme du jour', 'got: ' + labels.srs);
    ok('FIX4-03 vocabLevel 1 ACWR → "Charge semaine"', labels.acwr === 'Charge semaine', 'got: ' + labels.acwr);
    ok('FIX4-04 vocabLevel 1 TRIMP → "Fatigue"', labels.trimp === 'Fatigue', 'got: ' + labels.trimp);
  });

  // FIX4-05: vocabLevel 2 → intermediate labels
  await withPage(browser, P_BASE, async (page) => {
    const labels = await page.evaluate(() => {
      db.user.vocabLevel = 2;
      return { srs: labelFor('srs'), acwr: labelFor('acwr'), trimp: labelFor('trimp') };
    });
    ok('FIX4-05 vocabLevel 2 ACWR → "Charge semaine"', labels.acwr === 'Charge semaine', 'got: ' + labels.acwr);
    ok('FIX4-06 vocabLevel 2 TRIMP → "Charge cumul."', labels.trimp === 'Charge cumul.', 'got: ' + labels.trimp);
  });

  // FIX4-07: vocabLevel 3 → expert labels
  await withPage(browser, P_BASE, async (page) => {
    const labels = await page.evaluate(() => {
      db.user.vocabLevel = 3;
      return { srs: labelFor('srs'), acwr: labelFor('acwr'), trimp: labelFor('trimp') };
    });
    ok('FIX4-07 vocabLevel 3 SRS → "SRS (Readiness)"', labels.srs === 'SRS (Readiness)', 'got: ' + labels.srs);
    ok('FIX4-08 vocabLevel 3 ACWR → "ACWR"', labels.acwr === 'ACWR', 'got: ' + labels.acwr);
    ok('FIX4-09 vocabLevel 3 TRIMP → "TRIMP"', labels.trimp === 'TRIMP', 'got: ' + labels.trimp);
  });

  // FIX4-10: Dashboard ACWR cell uses labelFor (vocabLevel 1 → "Charge semaine")
  await withPage(browser, { ...P_BASE, user: { ...P_BASE.user, vocabLevel: 1 } }, async (page) => {
    // batteryHtml is rendered by renderWeekCard() into dashWeekContent
    const dashHtml = await page.evaluate(() => {
      db.user.vocabLevel = 1;
      db.todayWellbeing = { date: new Date().toISOString().split('T')[0], sleep: 3, fatigue: 2, motivation: 3, readiness: 60 };
      if (typeof renderWeekCard === 'function') renderWeekCard();
      var el = document.getElementById('dashWeekContent');
      return el ? el.innerHTML : '';
    });
    ok('FIX4-10 Dashboard shows "Charge semaine" for vocabLevel 1', dashHtml.includes('Charge semaine'), 'vocabLevel 1 → friendly label in dashWeekContent');
  });

  await browser.close();

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════');
  console.log('v181 Post-Gemini: ' + pass + '/' + (pass + fail) + ' tests passed');
  console.log('══════════════════════════════');

  const summary = { date: new Date().toISOString(), version: 'v181', pass, fail, total: pass + fail, results };
  fs.writeFileSync(path.join(__dirname, '31-post-gemini-fixes-results.json'), JSON.stringify(summary, null, 2));
  if (fail > 0) process.exit(1);
})();
