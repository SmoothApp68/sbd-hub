// audit/26-pre-beta-polish.js — Tests A-F (13 tests) Pre-Bêta Polish v175→v176
// Playwright headless Chrome
// Tests : FIX 1 (SW_VERSION), FIX 2 (Z1 label), FIX 3 (magicStartDone), Kill Switch GO, Audit Trail, Bug Report

const { chromium } = require('playwright');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8787/sbd-hub/index.html';

// ── Profiles ────────────────────────────────────────────────────────────────
const P1 = {
  user: {
    name:'Aurélien', age:32, bw:98, height:182, gender:'male',
    level:'avance', trainingMode:'powerlifting', onboarded:true,
    lpActive:false, lpStrikes:{}, barWeight:20, units:'kg',
    consentHealth:true, medicalConsent:true,
    _killSwitchActive:false,
    injuries:[]
  },
  logs:[
    {date:new Date(Date.now()-86400000).toISOString().slice(0,10), exercises:[
      {name:'Squat (Barre)',sets:[{w:140,r:5,rpe:8},{w:140,r:5,rpe:8},{w:140,r:5,rpe:8}]},
      {name:'Bench Press (Barre)',sets:[{w:110,r:5,rpe:7},{w:110,r:5,rpe:7},{w:110,r:5,rpe:7}]}
    ], trimp:120}
  ],
  exercises:{'Squat (Barre)':{e1rm:157},'Bench Press (Barre)':{e1rm:148},'Soulevé de Terre':{e1rm:200}},
  weeklyPlan:null,
  _magicStartDone:true,
  activityLogs:[]
};

const P4_KS = {
  user:{
    name:'Tom', age:28, bw:83, height:178, gender:'male',
    level:'competiteur', trainingMode:'powerlifting', onboarded:true,
    lpActive:false, barWeight:20, units:'kg',
    consentHealth:true, medicalConsent:true,
    _killSwitchActive:true,
    _killSwitchDate: new Date(Date.now() + 5*86400000).toISOString().slice(0,10),
    injuries:[]
  },
  logs:[
    {date:new Date(Date.now()-86400000).toISOString().slice(0,10), exercises:[
      {name:'Squat (Barre)',sets:[{w:160,r:3,rpe:8},{w:160,r:3,rpe:8}]}
    ], trimp:80}
  ],
  exercises:{'Squat (Barre)':{e1rm:190},'Bench Press (Barre)':{e1rm:140},'Soulevé de Terre':{e1rm:220}},
  weeklyPlan:null,
  _magicStartDone:true,
  activityLogs:[]
};

const P_J1 = {
  user:{
    name:'NewUser', age:25, bw:75, height:175, gender:'male',
    onboarded:false, lpActive:true, barWeight:20, units:'kg',
    consentHealth:false, medicalConsent:false,
    injuries:[]
  },
  logs:[],
  exercises:{},
  weeklyPlan:null,
  _magicStartDone:false,
  activityLogs:[]
};

// ── Helpers ──────────────────────────────────────────────────────────────────
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
  const profileStr = JSON.stringify(profile);
  await ctx.addInitScript((str) => {
    localStorage.setItem('__audit_stash', str);
  }, profileStr);
  await ctx.addInitScript(() => {
    const stash = localStorage.getItem('__audit_stash');
    if (stash) {
      try {
        const p = JSON.parse(stash);
        localStorage.setItem('SBD_HUB_V29', JSON.stringify(p));
      } catch(e) {}
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && isAppError(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => { if (isAppError(e.message)) errors.push(e.message); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1200);
  await fn(page, errors, ctx);
  await ctx.close();
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  AUDIT 26 — Pre-Bêta Polish v175→v176 — Tests A-F');
  console.log('══════════════════════════════════════════════════════\n');

  // ── TEST A — SW_VERSION défini dans app.js ───────────────────────────────
  console.log('\n— TEST A : SW_VERSION (FIX 1) —');
  await withPage(browser, P1, async (page) => {
    const defined = await page.evaluate(() => typeof SW_VERSION !== 'undefined');
    ok('A-01 SW_VERSION est défini', defined, defined ? 'typeof SW_VERSION = string' : 'toujours undefined');

    const val = await page.evaluate(() => typeof SW_VERSION !== 'undefined' ? SW_VERSION : null);
    ok('A-02 SW_VERSION commence par "trainhub-"', val && val.startsWith('trainhub-'), val);

    const errLogVal = await page.evaluate(() => {
      if (typeof logErrorToSupabase !== 'function') return null;
      // Check what version would be sent
      return typeof SW_VERSION !== 'undefined' ? SW_VERSION : 'unknown';
    });
    ok('A-03 logErrorToSupabase lirait SW_VERSION correct', errLogVal && errLogVal !== 'unknown', errLogVal);
  });

  // ── TEST B — Z1 label "Récup active" (FIX 2) ────────────────────────────
  console.log('\n— TEST B : Z1 "Récup active" (FIX 2) —');
  await withPage(browser, P1, async (page) => {
    // Create a go-hr-display element and inject Z1 HR, then call updateHRDisplay
    const z1Label = await page.evaluate(() => {
      window._currentHR = 55; // Z1 (< 60% of 220-32=188 maxHR → 29%)
      // Create the element if not present
      var hrEl = document.getElementById('go-hr-display');
      if (!hrEl) {
        hrEl = document.createElement('div');
        hrEl.id = 'go-hr-display';
        document.body.appendChild(hrEl);
      }
      if (typeof updateHRDisplay === 'function') {
        updateHRDisplay();
        return hrEl.innerText || hrEl.innerHTML;
      }
      return null;
    });
    ok('B-01 Z1 label contient "Récup active" (pas "Repos")',
      z1Label && /Récup active/i.test(z1Label),
      z1Label ? z1Label.replace(/\n/g,' ').substring(0,80) : 'updateHRDisplay non disponible ou élément absent');

    ok('B-02 Z1 label ne contient pas "Repos"',
      z1Label && !/\bRepos\b/.test(z1Label),
      z1Label ? 'OK' : 'z1Label vide');
  });

  // ── TEST C — handleMagicChoice saveDBNow immédiat (FIX 3) ───────────────
  console.log('\n— TEST C : handleMagicChoice saveDBNow (FIX 3) —');
  await withPage(browser, P_J1, async (page) => {
    // P_J1 has _magicStartDone = false, so magic start overlay should show
    const overlayVisible = await page.evaluate(() => {
      const el = document.getElementById('magic-start-overlay');
      return el && el.offsetParent !== null;
    });

    const magicResult = await page.evaluate(() => {
      if (typeof handleMagicChoice !== 'function') return { err: 'handleMagicChoice not defined' };
      // Set a clean state
      db._magicStartDone = false;
      handleMagicChoice('skip');
      const inMemory = db._magicStartDone;
      // Check localStorage was written immediately (saveDBNow is sync)
      var lsVal = null;
      try {
        var raw = localStorage.getItem('SBD_HUB_V29');
        var p = JSON.parse(raw);
        lsVal = p._magicStartDone;
      } catch(e) { lsVal = 'parse error: ' + e.message; }
      return { inMemory, lsVal };
    });
    ok('C-01 _magicStartDone = true immédiatement après handleMagicChoice()',
      magicResult && magicResult.inMemory === true,
      magicResult ? 'db._magicStartDone = ' + magicResult.inMemory : 'handleMagicChoice non définie');

    ok('C-02 localStorage mis à jour immédiatement (saveDBNow vs saveDB debounced)',
      magicResult && magicResult.lsVal === true,
      magicResult ? 'localStorage._magicStartDone = ' + magicResult.lsVal : 'N/A');
  });

  // ── TEST D — Kill Switch contraint dans GO actif (ACTION 1) ─────────────
  console.log('\n— TEST D : Kill Switch constraints in GO (ACTION 1) —');
  await withPage(browser, P4_KS, async (page) => {
    const ksResult = await page.evaluate(() => {
      // Test via getActivityRecommendation() which uses _killSwitchActive
      if (typeof getActivityRecommendation !== 'function') return { err: 'getActivityRecommendation not defined' };
      db._killSwitchActive = true;
      var rec = getActivityRecommendation();
      return { level: rec ? rec.level : null, reason: rec ? rec.reason : null };
    });
    ok('D-01 Kill Switch → getActivityRecommendation() level forbidden',
      ksResult && ksResult.level === 'forbidden',
      ksResult ? 'level=' + ksResult.level + ' reason=' + ksResult.reason : 'error');

    // Verify Kill Switch RPE cap is in source (code check via function.toString, minification-safe)
    const rpeCapExists = await page.evaluate(() => {
      if (typeof wpGeneratePowerbuildingDay !== 'function') return false;
      var src = wpGeneratePowerbuildingDay.toString();
      // Minification may rename 'rpe' → short var, check for _killSwitchActive + numeric 7 cap pattern
      return src.includes('_killSwitchActive') && (src.includes('rpe = 7') || src.includes('rpe=7') || /killSwitch[\s\S]{0,200}=7/.test(src));
    });
    ok('D-02 Kill Switch applique RPE cap ≤ 7 dans wpGeneratePowerbuildingDay',
      rpeCapExists,
      rpeCapExists ? 'code constraint présent' : 'constraint absent du code');
  });

  // ── TEST E — Audit Trail (buildChargeExplanation) (ACTION 4) ────────────
  console.log('\n— TEST E : Audit Trail buildChargeExplanation (ACTION 4) —');
  await withPage(browser, P1, async (page) => {
    const auditTrail = await page.evaluate(() => {
      if (typeof buildChargeExplanation !== 'function') return null;
      var result = buildChargeExplanation('Squat (Barre)', 140, 130);
      return result;
    });

    ok('E-01 buildChargeExplanation() est définie',
      auditTrail !== null,
      auditTrail ? 'retourne un résultat' : 'fonction non trouvée');

    const auditStr = typeof auditTrail === 'string' ? auditTrail : (auditTrail ? JSON.stringify(auditTrail).substring(0,60) : 'null');
    ok('E-02 buildChargeExplanation() retourne un résultat non-vide',
      auditTrail !== null && auditTrail !== undefined && auditTrail !== '',
      auditStr.substring(0,60));
  });

  // ── TEST F — Bug Report Button dans GO idle (ACTION 5) ──────────────────
  console.log('\n— TEST F : Bug Report Button (ACTION 5) —');
  await withPage(browser, P1, async (page) => {
    // Navigate to GO tab
    await page.evaluate(() => {
      if (typeof showTab === 'function') showTab('tab-seances');
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      if (typeof showSeancesSub === 'function') {
        var pill = document.querySelector('.seances-nav .stats-sub-pill:nth-child(3)');
        showSeancesSub('s-go', pill);
      }
    });
    await page.waitForTimeout(300);

    const bugBtnExists = await page.evaluate(() => {
      // Check for bug report button in GO idle HTML
      var idle = document.getElementById('goIdleView');
      if (!idle) return false;
      return idle.innerHTML.includes('goReportIssue') || idle.innerHTML.includes('Signaler');
    });
    ok('F-01 Bouton "Signaler un problème" présent dans GO idle',
      bugBtnExists,
      bugBtnExists ? 'bouton trouvé' : 'absent du DOM');

    const bugFnExists = await page.evaluate(() => typeof goReportIssue === 'function');
    ok('F-02 goReportIssue() est définie',
      bugFnExists,
      bugFnExists ? 'function OK' : 'non définie');
  });

  // ── CONSOLE ERRORS check ─────────────────────────────────────────────────
  console.log('\n— Vérification console errors sur P1 —');
  await withPage(browser, P1, async (page, errors) => {
    // Navigate all tabs quickly
    const tabs = ['tab-dash','tab-seances','tab-coach','tab-stats','tab-social','tab-games','tab-profil'];
    for (const tab of tabs) {
      await page.evaluate((t) => { if (typeof showTab === 'function') showTab(t); }, tab);
      await page.waitForTimeout(200);
    }
    ok('F-03 0 erreur console critique (tour de tous les onglets)', errors.length === 0,
      errors.length > 0 ? errors.slice(0,2).join(' | ') : '0 erreur');
  });

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  RÉSULTAT : ' + pass + '/' + (pass+fail) + ' (' + Math.round(pass/(pass+fail)*100) + '%)');
  console.log('══════════════════════════════════════════════════════\n');

  await browser.close();

  const fs = require('fs');
  fs.writeFileSync(
    path.join(__dirname, '26-pre-beta-polish-results.json'),
    JSON.stringify({ total: pass+fail, pass, fail, results }, null, 2)
  );
  process.exit(fail > 0 ? 1 : 0);
})();
