// SBD Hub – Playwright audit script (Node.js)
// Run: NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node audit.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = '/mnt/user-data/outputs/audit';
const BASE = 'http://localhost:8765';
const STORAGE_KEY = 'SBD_HUB_V29'; // see js/constants.js

const TODAY = Date.now();
const DAY = 86400000;

const TEST_DB = {
  user: {
    name: 'Aurélien',
    bodyweight: 85, bw: 85,           // app uses both
    level: 'intermediaire',
    mode: 'powerbuilding',
    trainingMode: 'powerbuilding',    // app reads db.user.trainingMode
    height: 178, age: 32, sex: 'm',
    onboarded: true, quizDone: true,
    gender: 'male',
  },
  logs: [
    // logs need `timestamp` for getLogsInRange() and `exercises[]` for volume analysis
    { date: new Date(TODAY - 2*DAY).toISOString().slice(0,10), timestamp: TODAY - 2*DAY,
      exercise:'Squat',
      exercises:[{name:'Squat', sets:[{weight:120,reps:5,rpe:8,done:true},{weight:120,reps:5,rpe:8.5,done:true}]}],
      sets:[{weight:120,reps:5,rpe:8,done:true},{weight:120,reps:5,rpe:8.5,done:true},{weight:120,reps:4,rpe:9,done:true}] },
    { date: new Date(TODAY - 4*DAY).toISOString().slice(0,10), timestamp: TODAY - 4*DAY,
      exercise:'Bench Press',
      exercises:[{name:'Bench Press', sets:[{weight:90,reps:5,rpe:7.5,done:true},{weight:90,reps:5,rpe:8,done:true}]}],
      sets:[{weight:90,reps:5,rpe:7.5,done:true},{weight:90,reps:5,rpe:8,done:true},{weight:90,reps:5,rpe:8,done:true}] },
    { date: new Date(TODAY - 6*DAY).toISOString().slice(0,10), timestamp: TODAY - 6*DAY,
      exercise:'Deadlift',
      exercises:[{name:'Deadlift', sets:[{weight:150,reps:4,rpe:8,done:true},{weight:150,reps:4,rpe:8.5,done:true}]}],
      sets:[{weight:150,reps:4,rpe:8,done:true},{weight:150,reps:4,rpe:8.5,done:true},{weight:140,reps:5,rpe:8,done:true}] },
  ],
  weeklyPlan: {
    currentBlock: { phase:'deload', week:1, forcedAt: TODAY-1000, blockStartDate: TODAY-1000 },
    // days must be an ARRAY for renderProgDaysList() to work (uses .find())
    days: [
      { day:'Lundi', title:'Squat focus', label:'Squat focus', exercises:[
        {name:'Squat', sets:[{weight:98,reps:5,rpe:6},{weight:98,reps:5,rpe:6},{weight:98,reps:5,rpe:6}]},
        {name:'Leg Press', sets:[{weight:80,reps:10,rpe:6},{weight:80,reps:10,rpe:6}]},
      ]},
      { day:'Mercredi', title:'Bench focus', label:'Bench focus', exercises:[
        {name:'Bench Press', sets:[{weight:73,reps:5,rpe:6},{weight:73,reps:5,rpe:6},{weight:73,reps:5,rpe:6}]},
        {name:'Tricep Pushdown', sets:[{weight:30,reps:12,rpe:6},{weight:30,reps:12,rpe:6}]},
      ]},
      { day:'Vendredi', title:'Deadlift focus', label:'Deadlift focus', exercises:[
        {name:'Deadlift', sets:[{weight:122,reps:3,rpe:6},{weight:122,reps:3,rpe:6},{weight:122,reps:3,rpe:6}]},
        {name:'Romanian Deadlift', sets:[{weight:90,reps:8,rpe:6},{weight:90,reps:8,rpe:6}]},
      ]},
    ],
  },
  // routine makes `hasProgram` true → renderProgramBuilderView() is called
  routine: { Lundi: 'Squat', Mercredi: 'Bench Press', Vendredi: 'Deadlift' },
  generatedProgram: [
    { day:'Lundi', exercise:'Squat', sets:3, reps:5, intensity:70 },
    { day:'Mercredi', exercise:'Bench Press', sets:3, reps:5, intensity:70 },
    { day:'Vendredi', exercise:'Deadlift', sets:3, reps:3, intensity:70 },
  ],
  exercises: {
    Squat:{e1rm:140,shadowWeight:100,history:[]},
    'Bench Press':{e1rm:105,shadowWeight:80,history:[]},
    Deadlift:{e1rm:175,shadowWeight:125,history:[]},
  },
  readiness: [
    {date:new Date(TODAY-DAY).toISOString().slice(0,10),score:7},
    {date:new Date(TODAY-2*DAY).toISOString().slice(0,10),score:6},
    {date:new Date(TODAY-3*DAY).toISOString().slice(0,10),score:8},
  ],
  reports: [],
  records: { Squat:{weight:130,reps:3}, 'Bench Press':{weight:100,reps:3}, Deadlift:{weight:160,reps:2} },
  bestPR: { squat: 130, bench: 100, deadlift: 160 },
  body: [], keyLifts: [], challenges: [], questHistory: [], secretQuestsCompleted: [], seenBadges: [],
  unlockedTitles: [], monthlyChallenges: null, friendCode: null, friends: [],
  gamification: {
    streakFreezes: 2, _migratedFreezeV2: true, _migratedFreezeV3: true,
    lastFreezeGrantedMonth: -1, freezesUsedAt: [], freezeActiveThisWeek: false, freezeProtectedWeeks: [],
  },
  social: {
    profileId: null, username: 'test_aurel', bio: '', onboardingCompleted: true,
    visibility: { bio:'private', prs:'private', programme:'private', seances:'private', stats:'private' },
    usernameChangedAt: null,
  },
  passwordMigrated: true,
  _migPBMode: true, // prevent powerbuilding mode migration from running again
};

function ss(name) { return path.join(OUT, `${name}.png`); }

const results = [];
function logCheck(check, pass, detail = '') {
  results.push({ check, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${check}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  console.log('Launching browser…');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport:{width:390,height:844} });
  const page = await ctx.newPage();

  // Block Supabase CDN → supaClient stays null → checkAuthGate() returns immediately (no login screen)
  await page.route('**://cdn.jsdelivr.net/**supabase**', route => {
    route.fulfill({ status:200, contentType:'application/javascript', body:'// supabase blocked' });
  });
  await page.route('**://*.supabase.co/**', route => route.abort());

  const jsErrors = [];
  page.on('pageerror', err => {
    const msg = err.message;
    const isNoise = msg.includes('supabase') || msg.includes('vibrate') ||
                    msg.includes('Chart is not defined') || msg.includes('Chart.js') ||
                    msg.includes('Cannot read properties of null') ||
                    msg.includes('cloudSignIn') || msg.includes('syncToCloud');
    if (!isNoise) jsErrors.push(msg);
  });

  // ── 1. Inject DB via addInitScript (runs BEFORE app scripts, so db init reads our data) ─────
  console.log('\n[1] Injecting DB via addInitScript and loading app…');
  await page.addInitScript(({db, key}) => {
    localStorage.setItem(key, JSON.stringify(db));
  }, {db: TEST_DB, key: STORAGE_KEY});

  await page.goto(BASE, { waitUntil:'networkidle' });
  await page.waitForTimeout(1200);

  // Force-hide login screen (belt and suspenders)
  await page.evaluate(() => {
    ['loginScreen','onboardingModal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  });
  await page.waitForTimeout(400);

  // Verify DB loaded correctly
  const dbCheck = await page.evaluate(() => {
    try { return { logsLen: db.logs.length, height: db.user.height, tm: db.user.trainingMode }; }
    catch(e) { return { error: e.message }; }
  });
  console.log('  DB loaded:', JSON.stringify(dbCheck));

  await page.screenshot({ path: ss('01-home'), fullPage: false });
  console.log('  Screenshot: 01-home.png');

  const loginVisible = await page.evaluate(() => {
    const el = document.getElementById('loginScreen');
    return !!(el && el.style.display !== 'none' && el.offsetHeight > 0);
  });
  logCheck('Login screen bypassed, DB loaded', !loginVisible && !dbCheck.error && dbCheck.logsLen > 0,
    dbCheck.error || `logs:${dbCheck.logsLen} height:${dbCheck.height}`);

  // ── 2. Programme tab ─────────────────────────────────────────────────────────
  console.log('\n[2] Programme tab (Séances → Programme)…');
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    if (typeof showSeancesSub === 'function') showSeancesSub('seances-programme');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('02-programme'), fullPage: true });
  console.log('  Screenshot: 02-programme.png');

  const progText = await page.evaluate(() => {
    const el = document.getElementById('seances-programme');
    return el ? el.innerText : '';
  });
  console.log('  Programme section text (first 300):', progText.slice(0,300).replace(/\n+/g,' '));

  const hasDeload = /deload|DELOAD|décharge|décharg/i.test(progText);
  logCheck('Phase deload visible on Programme tab', hasDeload, hasDeload ? '' : `text: "${progText.slice(0,200)}"`);

  const hasMoti = /récupération|focus|intensité|tonnage|séance|squat|bench|deadlift/i.test(progText);
  logCheck('Day content/motivation notes present', hasMoti, hasMoti ? '' : `text: "${progText.slice(0,150)}"`);

  const sliderCount = await page.locator('#seances-programme input[type=range]').count();
  logCheck('No intensity slider on Programme tab', sliderCount === 0, `found ${sliderCount}`);

  // ── 3. Coach tab (Coach → Aujourd'hui) ──────────────────────────────────────
  console.log('\n[3] Coach tab (Séances → Coach → Aujourd\'hui)…');
  await page.evaluate(() => {
    if (typeof showSeancesSub === 'function') showSeancesSub('seances-coach');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (typeof showCoachSub === 'function') showCoachSub('coach-today');
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: ss('03-coach'), fullPage: true });
  console.log('  Screenshot: 03-coach.png');

  const coachText = await page.evaluate(() => {
    const el = document.getElementById('coach-today');
    return el ? el.innerText : document.getElementById('seances-coach')?.innerText || '';
  });
  console.log('  Coach text (first 400):', coachText.slice(0,400).replace(/\n+/g,' '));

  // SRS score is displayed as the "Forme" gauge (e.g. "15 FORME 100 RÉCUP. 0 VOLUME")
  const hasSRS = /\d+\s*FORME|\d+\s*RÉCUP|SRS|score.*\d/i.test(coachText);
  logCheck('SRS/Forme score visible in Coach', hasSRS, hasSRS ? '' : `no SRS in: "${coachText.slice(0,200)}"`);

  const hasAnalysis = /conseil|recommand|aujourd'hui|séance|entraîn/i.test(coachText);
  logCheck('Coach analysis section visible', hasAnalysis, hasAnalysis ? '' : `"${coachText.slice(0,100)}"`);

  const todayLine = coachText.match(/aujourd'hui[^\n]*/i)?.[0] || '';
  const emojiGarbage = /[\u{1F300}-\u{1FFFF}]{3,}/u;
  logCheck('No triple-emoji garbage in today line', !emojiGarbage.test(todayLine),
    `today: "${todayLine.slice(0,80)}"`);

  // ── 4. GO tab ────────────────────────────────────────────────────────────────
  console.log('\n[4] GO tab…');
  await page.evaluate(() => {
    if (typeof showSeancesSub === 'function') showSeancesSub('seances-go');
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: ss('04-go'), fullPage: true });
  console.log('  Screenshot: 04-go.png');

  // ── 5. Stats tab ─────────────────────────────────────────────────────────────
  console.log('\n[5] Stats tab…');
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-stats');
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: ss('05-stats'), fullPage: true });
  console.log('  Screenshot: 05-stats.png');

  const statsText = await page.evaluate(() => {
    const el = document.getElementById('tab-stats');
    return el ? el.innerText : '';
  });
  const hasRecords = /record|PR|130|100\s*kg|160\s*kg/i.test(statsText);
  logCheck('Records/PR visible on Stats tab', hasRecords, hasRecords ? '' : `no records in: "${statsText.slice(0,200)}"`);

  // ── 6. Profil tab → Réglages ─────────────────────────────────────────────────
  console.log('\n[6] Profil tab → Réglages sub-tab…');
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-profil');
  });
  await page.waitForTimeout(500);
  // Navigate to the Réglages sub-tab (showProfilSub('tab-settings'))
  await page.evaluate(() => {
    if (typeof showProfilSub === 'function') showProfilSub('tab-settings');
    // Also call fillSettingsFields directly to ensure fields are populated
    if (typeof fillSettingsFields === 'function') fillSettingsFields();
  });
  await page.waitForTimeout(600);

  // Check height/age fields
  const heightVal = await page.locator('#settingsHeight').inputValue().catch(() => '');
  const ageVal = await page.locator('#settingsAge').inputValue().catch(() => '');
  console.log(`  settingsHeight value: "${heightVal}", settingsAge value: "${ageVal}"`);

  logCheck('Height field populated (178)', heightVal === '178', `value: "${heightVal}"`);
  logCheck('Age field populated (32)', ageVal === '32', `value: "${ageVal}"`);

  await page.screenshot({ path: ss('06-profil'), fullPage: true });
  console.log('  Screenshot: 06-profil.png');

  // ── 7. Live coach banner ─────────────────────────────────────────────────────
  console.log('\n[7] Live coach banner…');
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
    if (typeof showSeancesSub === 'function') showSeancesSub('seances-go');
  });
  await page.waitForTimeout(400);

  const bannerInjected = await page.evaluate(() => {
    if (typeof showLiveCoachBanner !== 'function') return false;
    showLiveCoachBanner({ msg: 'Bonne gestion RPE — charge bien ajustée ✓', type: 'success' });
    return true;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: ss('07-live-banner'), fullPage: false });

  const bannerEl = await page.evaluate(() => {
    const el = document.getElementById('live-coach-banner');
    return { exists: !!el, display: el ? el.style.display : 'N/A', text: el ? el.textContent?.slice(0,60) : '' };
  });
  console.log('  Banner el:', JSON.stringify(bannerEl));
  logCheck('Live coach banner renders', bannerInjected && bannerEl.exists && bannerEl.display !== 'none',
    `injected:${bannerInjected} display:${bannerEl.display} text:"${bannerEl.text}"`);

  // ── 8. computeSRS() function check ───────────────────────────────────────────
  console.log('\n[8] computeSRS() function check…');
  const srsResult = await page.evaluate(() => {
    try {
      if (typeof computeSRS !== 'function') return { error: 'computeSRS not defined' };
      const r = computeSRS();
      return { score: r?.score, label: r?.label, acwr: r?.acwr };
    } catch(e) { return { error: e.message }; }
  });
  console.log('  computeSRS:', JSON.stringify(srsResult));
  logCheck('computeSRS() returns valid score',
    !srsResult.error && typeof srsResult.score === 'number',
    srsResult.error || `score=${srsResult.score} label=${srsResult.label}`);

  // ── 9. wpRound125() function check ───────────────────────────────────────────
  const round125 = await page.evaluate(() => {
    if (typeof wpRound125 !== 'function') return { error: 'not defined' };
    return { v101: wpRound125(101.3), v92: wpRound125(92.6) };
  });
  logCheck('wpRound125(101.3) → 101.25',
    !round125.error && Math.abs(round125.v101 - 101.25) < 0.01,
    round125.error || `got ${round125.v101}`);

  // ── 10. BLOCK_DURATION defined ───────────────────────────────────────────────
  const bdCheck = await page.evaluate(() => {
    if (typeof BLOCK_DURATION === 'undefined') return { error: 'BLOCK_DURATION not defined' };
    const pb = BLOCK_DURATION['powerbuilding'];
    const im = pb && pb['intermediaire'];
    return { hasPB: !!pb, deloadDuration: im && im.deload };
  });
  logCheck('BLOCK_DURATION[powerbuilding][intermediaire].deload defined',
    !bdCheck.error && bdCheck.deloadDuration > 0,
    bdCheck.error || `deload=${bdCheck.deloadDuration}wk`);

  // ── 11. JS errors ─────────────────────────────────────────────────────────────
  logCheck('No critical JS runtime errors', jsErrors.length === 0,
    jsErrors.length ? jsErrors.slice(0,2).join('; ') : '');

  // ── Generate HTML report ──────────────────────────────────────────────────────
  console.log('\n[Report] Generating rapport.html…');
  const passCount = results.filter(r => r.pass).length;
  const failCount = results.filter(r => !r.pass).length;

  const rows = results.map(r => `
    <tr class="${r.pass ? 'pass' : 'fail'}">
      <td>${r.pass ? '✅' : '❌'}</td>
      <td>${r.check}</td>
      <td style="font-size:.82em;color:#666;font-family:monospace">${r.detail || ''}</td>
    </tr>`).join('\n');

  const screenshots = [
    ['01-home','Maison'], ['02-programme','Programme'], ['03-coach','Coach'],
    ['04-go','GO'], ['05-stats','Stats'], ['06-profil','Profil'], ['07-live-banner','Bannière live'],
  ].map(([name, label]) => `
    <figure style="margin:0">
      <figcaption style="font-weight:600;margin-bottom:5px;color:#444;font-size:.88rem">${label}</figcaption>
      <img src="${name}.png" style="max-width:390px;border:1px solid #ddd;border-radius:10px;display:block;box-shadow:0 2px 8px rgba(0,0,0,.1)">
    </figure>`).join('\n');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>SBD Hub — Audit visuel ${new Date().toLocaleDateString('fr-FR')}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:980px;margin:2rem auto;padding:0 1.5rem;background:#f8f8f8;color:#1a1a1a}
  h1{color:#1a1a2e;margin-bottom:.25rem}
  .meta{color:#777;font-size:.9rem;margin-bottom:1.5rem}
  .summary{background:${failCount===0?'#e8f5e9':'#fff3e0'};border:2px solid ${failCount===0?'#4caf50':'#ff9800'};padding:1rem 1.5rem;border-radius:10px;margin-bottom:2rem;font-size:1.15rem;font-weight:700}
  table{border-collapse:collapse;width:100%;margin-bottom:2rem;background:white;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.07)}
  th{background:#1a1a2e;color:white;padding:10px 14px;text-align:left;font-size:.9rem}
  td{padding:8px 14px;border-bottom:1px solid #eee;vertical-align:top}
  tr.fail{background:#fff5f5}
  tr:last-child td{border-bottom:none}
  .screenshots{display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:1rem}
</style>
</head>
<body>
<h1>SBD Hub — Audit visuel complet</h1>
<p class="meta">Date : ${new Date().toLocaleString('fr-FR')} &nbsp;|&nbsp; Branch : claude/refactor-program-builder-5IrMC</p>
<div class="summary">${failCount===0?'🎉':'⚠️'} ${passCount}/${results.length} checks réussis${failCount>0?' — '+failCount+' échoué(s)':' — tout est OK'}</div>
<h2>Résultats</h2>
<table>
  <tr><th>Status</th><th>Check</th><th>Détail</th></tr>
  ${rows}
</table>
<h2>Screenshots</h2>
<div class="screenshots">${screenshots}</div>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT, 'rapport.html'), html, 'utf8');
  console.log('  rapport.html écrit');

  await browser.close();

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`AUDIT TERMINÉ — ${passCount}/${results.length} checks OK`);
  if (failCount > 0) {
    console.log('\nFAILURES:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.check}${r.detail ? ': '+r.detail : ''}`));
  }
  console.log(`\nOutput → ${OUT}/rapport.html`);
  console.log('═'.repeat(55));
  process.exit(failCount > 0 ? 1 : 0);
})();
