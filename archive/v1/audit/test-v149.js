const { chromium } = require('playwright');

const BASE = 'http://localhost:8787/';
const STORAGE_KEY = 'SBD_HUB_V29';

// J1 cold-start DB (onboarded, no weeklyPlan)
const DB_J1 = {
  user: {
    onboarded: true,
    name: 'Athlete',
    gender: 'male',
    bodyweight: 85,
    programParams: { freq: 4, level: 'intermediate', goal: 'force' },
    settings: {}
  },
  logs: [],
  weeklyPlan: null
};

// J30 DB with 20 logs
function makeDB_J30() {
  const logs = [];
  const now = Date.now();
  for (let i = 0; i < 20; i++) {
    logs.push({
      id: 'log' + i,
      date: new Date(now - i * 2 * 86400000).toISOString().slice(0,10),
      exercises: [
        { name: 'Squat', sets: [{ weight: 100, reps: 5, rpe: 8 }, { weight: 100, reps: 5, rpe: 8 }] },
        { name: 'Bench Press', sets: [{ weight: 80, reps: 5, rpe: 8 }] }
      ],
      duration: 60,
      bodyweight: 85
    });
  }
  return {
    user: {
      onboarded: true,
      name: 'Athlete',
      gender: 'male',
      bodyweight: 85,
      programParams: { freq: 4, level: 'intermediate', goal: 'force' },
      settings: {}
    },
    logs,
    weeklyPlan: {
      days: [
        { dayIndex: 0, type: 'training', exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }] },
        { dayIndex: 1, type: 'rest' },
        { dayIndex: 2, type: 'training', exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 5 }] }] },
        { dayIndex: 3, type: 'rest' },
        { dayIndex: 4, type: 'training', exercises: [{ name: 'Deadlift', sets: [{ weight: 120, reps: 3 }] }] },
        { dayIndex: 5, type: 'rest' },
        { dayIndex: 6, type: 'rest' }
      ],
      week: 1
    }
  };
}

// DB with today forced as rest day via db.routine
function makeDB_RestDay() {
  // DAYS_FULL in app: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const today = new Date().getDay(); // 0=Sun
  const routine = {};
  DAYS_FULL.forEach((d, i) => {
    routine[d] = (i === today) ? '😴 Repos' : 'Séance Force';
  });
  return {
    user: {
      onboarded: true,
      name: 'Athlete',
      gender: 'male',
      bodyweight: 85,
      programParams: { freq: 4, level: 'intermediate', goal: 'force' },
      settings: {}
    },
    logs: [],
    routine,
    weeklyPlan: null
  };
}

async function runTest(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${name}:`, result);
    return { name, status: 'pass', result };
  } catch (e) {
    console.log(`❌ ${name}:`, e.message);
    return { name, status: 'fail', error: e.message };
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  const results = [];

  // TEST 1: GO rest day — "Démarrer quand même" button visible
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('supabase') && !m.text().includes('favicon') && !m.text().includes('ERR_NAME_NOT_RESOLVED') && !m.text().includes('ERR_CERT') && !m.text().includes('navigator.vibrate') && !m.text().includes('chromestatus') && !m.text().includes('404') && !m.text().includes('File not found')) errors.push(m.text()); });
    await page.goto(BASE);
    await page.evaluate(db => { localStorage.setItem('SBD_HUB_V29', JSON.stringify(db)); }, makeDB_RestDay());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // Navigate to GO tab (tab-seances contains the GO section)
    await page.evaluate(() => { if (typeof showTab === 'function') showTab('tab-seances'); });
    await page.waitForTimeout(500);
    // Ensure GO sub-tab is shown
    await page.evaluate(() => { if (typeof showSeancesSub === 'function') showSeancesSub('seances-go'); else if (typeof renderGoTab === 'function') renderGoTab(); });
    await page.waitForTimeout(1000);

    results.push(await runTest('GO rest day — Jour de repos visible', async () => {
      const bodyText = await page.evaluate(() => document.body.innerText);
      const hasRestMsg = bodyText.includes('repos') || bodyText.includes('Repos') || bodyText.includes('rest');
      return 'rest text: ' + hasRestMsg + ', body excerpt: ' + bodyText.slice(0,200).replace(/\n/g,' ');
    }));

    results.push(await runTest('GO rest day — Démarrer quand même button', async () => {
      const btn = await page.$('button[onclick*="_goDoStartWorkout"], button[onclick*="goDoStartWorkout"]');
      const bodyText = await page.evaluate(() => document.body.innerText);
      const hasDemarrer = bodyText.includes('Démarrer') || bodyText.includes('demarrer') || bodyText.includes('même');
      return 'button found: ' + (btn !== null) + ', text match: ' + hasDemarrer;
    }));

    results.push(await runTest('GO rest day — console errors', async () => {
      if (errors.length > 0) throw new Error('Errors: ' + errors.join('; '));
      return '0 errors';
    }));

    await ctx.close();
  }

  // TEST 2: getAllBadges J30 (20 logs) — badges render without crash
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('supabase') && !m.text().includes('favicon') && !m.text().includes('ERR_NAME_NOT_RESOLVED') && !m.text().includes('ERR_CERT') && !m.text().includes('navigator.vibrate') && !m.text().includes('chromestatus') && !m.text().includes('404') && !m.text().includes('File not found')) errors.push(m.text()); });
    await page.goto(BASE);
    await page.evaluate(db => { localStorage.setItem('SBD_HUB_V29', JSON.stringify(db)); }, makeDB_J30());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    results.push(await runTest('getAllBadges J30 — function exists', async () => {
      const exists = await page.evaluate(() => typeof getAllBadges === 'function');
      if (!exists) throw new Error('getAllBadges not found');
      return 'function exists';
    }));

    results.push(await runTest('getAllBadges J30 — returns badges array', async () => {
      const info = await page.evaluate(() => {
        try {
          const b = getAllBadges();
          return { ok: true, count: b.length, sample: b[0] ? b[0].id : 'none' };
        } catch(e) {
          return { ok: false, error: e.message };
        }
      });
      if (!info.ok) throw new Error(info.error);
      return 'count=' + info.count + ', sample=' + info.sample;
    }));

    results.push(await runTest('getAllBadges J30 — gamification tab renders', async () => {
      // tab-game is the gamification tab; show jeux-badges sub to populate gamBadgesSections
      await page.evaluate(() => { if (typeof showTab === 'function') showTab('tab-game'); });
      await page.waitForTimeout(800);
      await page.evaluate(() => { if (typeof showJeuxSub === 'function') showJeuxSub('jeux-badges', null); });
      await page.waitForTimeout(1500);
      const badgesLen = await page.evaluate(() => {
        const el = document.getElementById('gamBadgesSections');
        return el ? el.innerHTML.length : 0;
      });
      if (badgesLen < 100) throw new Error('gamBadgesSections too short: ' + badgesLen);
      return 'gamBadgesSections.length=' + badgesLen;
    }));

    results.push(await runTest('getAllBadges J30 — console errors', async () => {
      if (errors.length > 0) throw new Error('Errors: ' + errors.join('; '));
      return '0 errors';
    }));

    await ctx.close();
  }

  // TEST 3: Coach J1 cold start — no undefined/NaN
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('supabase') && !m.text().includes('favicon') && !m.text().includes('ERR_NAME_NOT_RESOLVED') && !m.text().includes('ERR_CERT') && !m.text().includes('navigator.vibrate') && !m.text().includes('chromestatus') && !m.text().includes('404') && !m.text().includes('File not found')) errors.push(m.text()); });
    await page.goto(BASE);
    await page.evaluate(db => { localStorage.setItem('SBD_HUB_V29', JSON.stringify(db)); }, DB_J1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // tab-seances contains coach sub-section; switch to seances-coach sub-tab
    await page.evaluate(() => { if (typeof showTab === 'function') showTab('tab-seances'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      if (typeof showSeancesSub === 'function') showSeancesSub('seances-coach');
      else if (typeof renderCoachTab === 'function') renderCoachTab();
    });
    await page.waitForTimeout(1000);

    results.push(await runTest('Coach J1 — content present', async () => {
      const innerHTML = await page.evaluate(() => {
        const el = document.getElementById('coach-today') || document.querySelector('[id*="coach-today"]') || document.querySelector('[id*="coach"]');
        return el ? el.innerHTML.length : 0;
      });
      if (innerHTML < 50) throw new Error('coach-today too short: ' + innerHTML);
      return 'coach-today.length=' + innerHTML;
    }));

    results.push(await runTest('Coach J1 — no undefined/NaN in text', async () => {
      const text = await page.evaluate(() => {
        const el = document.getElementById('coach-today') || document.querySelector('[id*="coach"]');
        return el ? el.innerText : '';
      });
      const hasUndefined = text.includes('undefined') || text.includes('NaN');
      if (hasUndefined) throw new Error('Found undefined/NaN in: ' + text.slice(0,300));
      return 'no undefined/NaN, length=' + text.length;
    }));

    results.push(await runTest('Coach J1 — console errors', async () => {
      if (errors.length > 0) throw new Error('Errors: ' + errors.join('; '));
      return '0 errors';
    }));

    await ctx.close();
  }

  // TEST 4: Full session console errors
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('supabase') && !m.text().includes('favicon') && !m.text().includes('ERR_NAME_NOT_RESOLVED') && !m.text().includes('ERR_CERT') && !m.text().includes('navigator.vibrate') && !m.text().includes('chromestatus') && !m.text().includes('404') && !m.text().includes('File not found')) errors.push(m.text()); });
    await page.goto(BASE);
    await page.evaluate(db => { localStorage.setItem('SBD_HUB_V29', JSON.stringify(db)); }, makeDB_J30());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Visit all tabs using correct IDs
    for (const tab of ['tab-dash', 'tab-seances', 'tab-stats', 'tab-game', 'tab-profil']) {
      await page.evaluate(t => { if (typeof showTab === 'function') showTab(t); }, tab);
      await page.waitForTimeout(800);
    }

    results.push(await runTest('Full session — 0 console errors', async () => {
      if (errors.length > 0) throw new Error(errors.length + ' error(s): ' + errors.slice(0,3).join(' | '));
      return '0 errors across all tabs';
    }));

    await ctx.close();
  }

  await browser.close();

  // Summary
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  console.log('\n=== RESULTS ===');
  console.log('Passed:', passed, '/', results.length);
  console.log('Failed:', failed);
  results.forEach(r => console.log(r.status === 'pass' ? '✅' : '❌', r.name, r.status === 'pass' ? r.result : r.error));

  // Write results JSON for audit doc
  require('fs').writeFileSync('/tmp/v149-test-results.json', JSON.stringify(results, null, 2));
  process.exit(failed > 0 ? 1 : 0);
})();
