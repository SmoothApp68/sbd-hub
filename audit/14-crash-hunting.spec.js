/* Audit 14 — Dynamic offensive crash hunting.
 * Test artifact only — does NOT modify js/*.js source.
 * Routes engine.min.js -> engine.js content so the REAL sprint code runs
 * (production loads a stale engine.min.js — see Finding #1).
 * Run: node audit/14-crash-hunting.spec.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_JS = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
const SHOTS = path.join(ROOT, 'audit', 'shots-14');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon' };

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/' || u === '') u = '/index.html';
      const fp = path.join(ROOT, u);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('404'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// ---- Pathological DB states ------------------------------------------------
const baseUser = {
  onboarded: true, onboardingVersion: 3, level: 'avance',
  trainingMode: 'powerbuilding', bw: 98, gender: 'male', age: 32, morpho: null,
  coachProfile: 'full', units: 'kg', barWeight: 20, lpActive: true, lpStrikes: {},
  programParams: { freq: 4, mat: 'salle', duration: 90,
    selectedDays: ['Lundi','Mardi','Jeudi','Vendredi'],
    goals: ['force'], injuries: [], cardio: 'integre' }
};
const baseDB = (over = {}) => JSON.parse(JSON.stringify(Object.assign({
  user: baseUser,
  bestPR: { bench: 140, squat: 148, deadlift: 186 },
  exercises: {
    'Squat (Barre)': { e1rm: 135 },
    'Développé Couché (Barre)': { e1rm: 125 },
    'Soulevé de Terre (Barre)': { e1rm: 175 }
  },
  logs: [], gamification: {}, weeklyPlan: null,
  body: [], activityLogs: [], earnedBadges: {}
}, over)));

function heavyWeek() {
  const w = [];
  for (let i = 0; i < 5; i++) w.push({
    timestamp: Date.now() - i * 86400000, durationSource: 'go',
    exercises: [
      { name: 'Squat (Barre)', isPrimary: true, maxRM: 150,
        allSets: Array(4).fill({ weight: 150, reps: 5, rpe: 9.5, isWarmup: false }) },
      { name: 'Soulevé de Terre (Barre)', isPrimary: true, maxRM: 200,
        allSets: Array(4).fill({ weight: 200, reps: 5, rpe: 9.5, isWarmup: false }) }
    ]
  });
  return w;
}

const SCENARIOS = [
  { id: 1, name: 'Cold Start absolu',
    db: { user: { onboarded:false, onboardingVersion:0, level:'intermediaire',
            trainingMode:'powerbuilding', bw:0, morpho:null,
            programParams:{ freq:3, goals:['masse'] } },
          logs:[], bestPR:{bench:0,squat:0,deadlift:0}, exercises:{},
          gamification:{}, weeklyPlan:null } },
  { id: 2, name: 'Aurélien-like (avancé, 0 log, morpho=null)', db: baseDB() },
  { id: 3, name: 'NaN injecté dans e1RM', db: baseDB({
      exercises: {
        'Squat (Barre)': { e1rm: null, ewmaE1rm: null },
        'Développé Couché (Barre)': { e1rm: null, ewmaE1rm: null },
        'Soulevé de Terre (Barre)': { e1rm: 0, ewmaE1rm: 0 }
      } }) },
  { id: 4, name: 'Morpho tous flags true (contradictoire)', db: baseDB({
      user: Object.assign({}, baseUser, { morpho: {
        long_femurs:true, long_arms:true, short_arms_long_torso:true, short_torso:true } }) }) },
  { id: 5, name: 'Insolvency critique (semaine lourde)', db: baseDB({ logs: heavyWeek() }) },
  { id: 6, name: 'Stress articulaire zone rouge (lombaires)', db: baseDB({
      logs: [{ timestamp: Date.now()-86400000, durationSource:'go', exercises: [
        { name:'Squat (Barre)', maxRM:150, allSets: Array(6).fill({weight:140,reps:5,rpe:8.5,isWarmup:false}) },
        { name:'Soulevé de Terre (Barre)', maxRM:200, allSets: Array(6).fill({weight:180,reps:5,rpe:8.5,isWarmup:false}) },
        { name:'Good Morning', allSets: Array(4).fill({weight:80,reps:8,rpe:8,isWarmup:false}) },
        { name:'Rowing Barre', allSets: Array(5).fill({weight:100,reps:8,rpe:8,isWarmup:false}) }
      ]}] }) },
  { id: 7, name: 'Alexis-like (débutant, seuils sous LP)', db: {
      user: { onboarded:true, onboardingVersion:3, level:'debutant',
        trainingMode:'musculation', bw:70, gender:'male', morpho:null,
        lpActive:true, lpStrikes:{},
        programParams:{ freq:3, mat:'salle', duration:60, goals:['masse'],
          selectedDays:['Lundi','Mercredi','Vendredi'] } },
      bestPR:{ bench:45, squat:60, deadlift:80 }, exercises:{}, logs:[],
      gamification:{}, weeklyPlan:null } }
];

const PROBES = `(() => {
  const r = {};
  try { r.engineLoaded = typeof checkMultiLiftLPExit === 'function'
      && typeof updateEWMAForExo === 'function'
      && typeof applyMorphoAdaptations === 'function'; } catch(e){ r.engineLoaded='ERR:'+e.message; }
  try { r.insolvency = typeof calcInsolvencyIndex === 'function'
      ? calcInsolvencyIndex(db.logs||[]) : 'fn-absent'; } catch(e){ r.insolvency='THROW:'+e.message; }
  try { r.jointAlerts = typeof getJointStressAlerts === 'function'
      ? getJointStressAlerts(db.logs||[]) : 'fn-absent'; } catch(e){ r.jointAlerts='THROW:'+e.message; }
  try { r.smoothSquat = typeof getSmoothedE1RM === 'function'
      ? getSmoothedE1RM('squat') : 'fn-absent'; } catch(e){ r.smoothSquat='THROW:'+e.message; }
  try { r.lpExit = typeof checkMultiLiftLPExit === 'function'
      ? checkMultiLiftLPExit() : 'fn-absent'; } catch(e){ r.lpExit='THROW:'+e.message; }
  try { r.ratios = typeof computeStrengthRatiosDetailed === 'function'
      ? computeStrengthRatiosDetailed() : 'fn-absent'; } catch(e){ r.ratios='THROW:'+e.message; }
  try { r.morphoApplied = (typeof applyMorphoAdaptations==='function')
      ? (function(){ var ex=[{name:'Squat (Barre)',isPrimary:true,sets:[{weight:100,reps:5}]}];
          var o=applyMorphoAdaptations(ex,'squat'); return o&&o[0]?o[0].name:'no-out'; })()
      : 'fn-absent'; } catch(e){ r.morphoApplied='THROW:'+e.message; }
  try { r.diagnostic = typeof analyzeAthleteProfileWithInsolvency === 'function'
      ? 'ok(sections='+(analyzeAthleteProfileWithInsolvency().length||0)+')'
      : 'fn-absent'; } catch(e){ r.diagnostic='THROW:'+e.message; }
  try { r.bodyText = (document.body.innerText||'').slice(0,400); } catch(e){}
  try { r.hasNaNVisible = /\\bNaN\\b/.test(document.body.innerText||''); } catch(e){}
  return r;
})()`;

async function runScenario(server, scn, swapEngine) {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();
  const consoleErrs = [], pageErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => pageErrs.push(e.message));

  // Block ONLY the Supabase SDK CDN lib -> supabase.createClient throws ->
  // supaClient stays null -> checkAuthGate returns early (no login screen).
  // supabase.min.js still loads so cloudSyncEnabled/helpers stay defined
  // (avoids harness-induced ReferenceErrors).
  await page.route('**/supabase-cdn.min.js', r => r.abort());
  if (swapEngine) {
    await page.route('**/js/engine.min.js', r =>
      r.fulfill({ status: 200, contentType: 'text/javascript', body: ENGINE_JS }));
  }
  await page.addInitScript(db => {
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(db));
  }, scn.db);

  let nav = 'ok';
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500); // let init() + deferred generateWeeklyPlan run
  } catch (e) { nav = 'NAVFAIL:' + e.message; }

  const tag = swapEngine ? '' : '-PROD';
  const r = { scn: scn.id, name: scn.name, swapEngine, nav, consoleErrs, pageErrs };
  try { await page.screenshot({ path: path.join(SHOTS, `s${scn.id}${tag}-boot.png`) }); } catch(e){}

  // Probe critical functions in page context
  try { r.probe = await page.evaluate(PROBES); } catch (e) { r.probe = { evalThrow: e.message }; }

  // Navigate: skip onboarding if present, then go to Coach diagnostic
  try {
    const obVisible = await page.evaluate(() =>
      { const o=document.getElementById('onboarding-overlay'); return o && o.style.display!=='none'; });
    r.onboardingShown = obVisible;
    if (!obVisible) {
      await page.evaluate(() => { try { showTab('tab-seances'); showSeancesSub('s-coach'); } catch(e){} });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, `s${scn.id}${tag}-coach.png`) });
      await page.evaluate(() => { try { showTab('tab-dash'); } catch(e){} });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SHOTS, `s${scn.id}${tag}-dash.png`) });
      // Try plan generation
      try {
        r.genPlan = await page.evaluate(() => {
          try { if (typeof generateWeeklyPlan==='function') { generateWeeklyPlan();
            return 'called; days=' + ((db.weeklyPlan&&db.weeklyPlan.days&&db.weeklyPlan.days.length)||0); }
            return 'no-fn'; } catch(e){ return 'THROW:'+e.message; }
        });
      } catch(e){ r.genPlan = 'evalfail:'+e.message; }
      await page.waitForTimeout(800);
      await page.evaluate(() => { try { showTab('tab-seances'); showSeancesSub('s-plan'); } catch(e){} });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SHOTS, `s${scn.id}${tag}-plan.png`) });
    } else {
      await page.screenshot({ path: path.join(SHOTS, `s${scn.id}${tag}-onboarding.png`) });
    }
  } catch (e) { r.navErr = e.message; }

  await browser.close();
  return r;
}

(async () => {
  const server = await startServer();
  const results = [];
  for (const scn of SCENARIOS) {
    process.stdout.write(`Scenario ${scn.id} (${scn.name})... `);
    const res = await runScenario(server, scn, true);
    results.push(res);
    process.stdout.write(`done [console:${res.consoleErrs.length} pageerr:${res.pageErrs.length}]\n`);
  }
  // Production-reality pass: scenario 2 WITHOUT engine.js swap (stale min)
  process.stdout.write(`Scenario 2-PROD (stale engine.min.js)... `);
  const prod = await runScenario(server, SCENARIOS[1], false);
  results.push(prod);
  process.stdout.write(`done [console:${prod.consoleErrs.length} pageerr:${prod.pageErrs.length}]\n`);

  fs.writeFileSync(path.join(ROOT, 'audit', '14-crash-hunting-results.json'),
    JSON.stringify(results, null, 2));
  server.close();
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results.map(r => ({
    scn: r.scn + (r.swapEngine ? '' : '-PROD'), nav: r.nav,
    onboarding: r.onboardingShown, console: r.consoleErrs.length, pageerr: r.pageErrs.length,
    engineLoaded: r.probe && r.probe.engineLoaded,
    insolvency: r.probe && r.probe.insolvency,
    jointAlerts: r.probe && r.probe.jointAlerts,
    smoothSquat: r.probe && r.probe.smoothSquat,
    lpExit: r.probe && r.probe.lpExit,
    morphoApplied: r.probe && r.probe.morphoApplied,
    diagnostic: r.probe && r.probe.diagnostic,
    NaNvisible: r.probe && r.probe.hasNaNVisible,
    genPlan: r.genPlan
  })), null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
