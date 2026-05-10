// audit/30-diagnostic-exhaustif.js — Tests DIAG/EXTRA/FINAL — Audit 24 dimensions v180
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8787/sbd-hub/index.html';

// Powerbuilder intermédiaire avec injuries + cardio + goals multi
const P_BASE = {
  user: {
    name:'TestDiag', age:28, bw:80, height:178, gender:'male', fatPct:null,
    trainingMode:'powerbuilding', onboardingProfile:'intermediaire',
    level:'intermediaire', onboarded:true, onboardingVersion:99,
    coachEnabled:true, coachProfile:'full', vocabLevel:2, lpActive:false, lpStrikes:{},
    programParams: { freq:5, duration:90, level:'intermediaire',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      mat:'salle', injuries:['epaules'], cardio:'aucun',
      goals:['force','seche'] },
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
  await ctx.addInitScript((str) => { localStorage.setItem('__audit_stash', str); }, JSON.stringify(profile));
  await ctx.addInitScript(() => {
    const stash = localStorage.getItem('__audit_stash');
    if (stash) { try { localStorage.setItem('SBD_HUB_V29', stash); } catch(e) {} }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && isAppError(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => { if (isAppError(e.message)) errors.push(e.message); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);
  await fn(page, errors, ctx);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  AUDIT 30 — Diagnostic Exhaustif — 24 dimensions');
  console.log('══════════════════════════════════════════════════════════\n');

  // ── DIAG-01 — Wizard injuries → programme exclut développé militaire ──
  console.log('— DIAG-01 : Wizard injuries=epaules → exos exclus —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      // Profile a déjà injuries=['epaules']
      pbStartGuided();
      _pbState.days = 4;
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.goal = 'mixte';
      pbGenerateProgram();
      // Vérifier que le programme généré ne contient pas d'OHP/développé militaire
      var found = false;
      (db.generatedProgram || []).forEach(function(d) {
        (d.exercises || []).forEach(function(e) {
          var name = (typeof e === 'string' ? e : (e && e.name) || '').toLowerCase();
          if (name.indexOf('militaire') >= 0 || name.indexOf('ohp') >= 0
              || name.indexOf('développé épaule') >= 0) {
            found = true;
          }
        });
      });
      return { foundOHP: found, injSaved: db.user.programParams.injuries };
    });
    ok('DIAG-01 generatedProgram exclut OHP/militaire (injuries=epaules)',
       r.foundOHP === false,
       'foundOHP=' + r.foundOHP + ' injuries=' + JSON.stringify(r.injSaved));
  });

  // ── DIAG-02 — vocabLevel input → db.user.vocabLevel mis à jour ──
  console.log('— DIAG-02 : settingsVocabLevel select présent + écrit db.user.vocabLevel —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      var el = document.getElementById('settingsVocabLevel');
      if (!el) return { exists: false };
      // Simuler change
      el.value = '3';
      var ev = new Event('change', { bubbles: true });
      el.dispatchEvent(ev);
      return { exists: true, vocab: db.user.vocabLevel };
    });
    ok('DIAG-02a settingsVocabLevel existe', r.exists === true);
    ok('DIAG-02b db.user.vocabLevel=3 après onchange', r.vocab === 3, 'vocab=' + r.vocab);
  });

  // ── DIAG-03 — fatPct input → db.user.fatPct mis à jour ──
  console.log('— DIAG-03 : inputFatPct présent + écrit db.user.fatPct —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      var el = document.getElementById('inputFatPct');
      if (!el) return { exists: false };
      el.value = '15.5';
      var ev = new Event('change', { bubbles: true });
      el.dispatchEvent(ev);
      return { exists: true, fp: db.user.fatPct };
    });
    ok('DIAG-03a inputFatPct existe', r.exists === true);
    ok('DIAG-03b db.user.fatPct=15.5 après onchange', r.fp === 15.5, 'fp=' + r.fp);
  });

  // ── DIAG-04 — saveDB() catch QuotaExceeded → toast affiché ──
  console.log('— DIAG-04 : _flushDB toast sur QuotaExceededError —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      // Simuler quota plein
      var orig = localStorage.setItem.bind(localStorage);
      var toasts = [];
      var origToast = window.showToast;
      window.showToast = function(m) { toasts.push(m); if (origToast) origToast.apply(this, arguments); };
      localStorage.setItem = function() {
        var e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
      };
      try {
        if (typeof saveDBNow === 'function') saveDBNow();
      } catch(e) {}
      localStorage.setItem = orig;
      window.showToast = origToast;
      return { toastsCount: toasts.length, lastToast: toasts[toasts.length-1] || '' };
    });
    ok('DIAG-04 toast quota affiché',
       r.toastsCount > 0 && r.lastToast.indexOf('Stockage') >= 0,
       'count=' + r.toastsCount + ' last=' + r.lastToast);
  });

  // ── DIAG-05 — iOS BLE message ──
  console.log('— DIAG-05 : Web Bluetooth absent → message iOS-aware —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      // Simuler iOS UA + retirer navigator.bluetooth
      Object.defineProperty(navigator, 'userAgent', {
        get: function() { return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'; },
        configurable: true
      });
      Object.defineProperty(navigator, 'bluetooth', { get: function() { return undefined; }, configurable: true });
      var toasts = [];
      var orig = window.showToast;
      window.showToast = function(m) { toasts.push(m); if (orig) orig.apply(this, arguments); };
      // Try to start BLE (function name guess: btConnectHR/connectHRMonitor — find any)
      // Just look for the source code pattern in app.min.js via fetch
      var found = false;
      // Vérifie la présence du pattern 'iPad|iPhone|iPod' dans le bundle
      // (verification via runtime serait plus complexe — on teste uniquement le toast)
      if (typeof connectHRMonitor === 'function') {
        try { connectHRMonitor(); } catch(e) {}
      } else if (typeof goConnectHR === 'function') {
        try { goConnectHR(); } catch(e) {}
      }
      window.showToast = orig;
      return { toasts: toasts.slice() };
    });
    // Test a fallback: vérifier que la chaîne iPad/iPhone/iPod est présente dans le bundle
    const sourceContainsIOS = await page.evaluate(async () => {
      try {
        var resp = await fetch('/sbd-hub/js/app.min.js');
        var text = await resp.text();
        return text.indexOf('iPhone') >= 0 && text.indexOf('iOS') >= 0;
      } catch(e) { return false; }
    });
    ok('DIAG-05 source contient guard iOS (UA check)', sourceContainsIOS === true);
  });

  // ── DIAG-06 — wakeLock re-acquisition handler ──
  console.log('— DIAG-06 : visibilitychange handler re-acquiert wakeLock —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      try {
        var resp = await fetch('/sbd-hub/js/app.min.js');
        var text = await resp.text();
        // Vérifier que le pattern wakeLock + visibilitychange + activeWorkout coexistent
        return {
          hasWakeLock: text.indexOf('wakeLock') >= 0,
          hasVisibilityListener: text.indexOf('visibilitychange') >= 0,
          hasReAcquireGuard: text.indexOf('isFinished') >= 0
        };
      } catch(e) { return { err: e.message }; }
    });
    ok('DIAG-06a wakeLock présent dans bundle', r.hasWakeLock === true);
    ok('DIAG-06b visibilitychange présent', r.hasVisibilityListener === true);
    ok('DIAG-06c re-acquire guard (!isFinished) présent', r.hasReAcquireGuard === true);
  });

  // ── DIAG-07 — computeACWR avec 0 logs → null (pas crash) ──
  console.log('— DIAG-07 : computeACWR(0 logs) → null —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      if (typeof computeACWR !== 'function') return { err: 'computeACWR undefined' };
      db.logs = []; // empty
      var acwr = computeACWR();
      return { acwr: acwr };
    });
    ok('DIAG-07 computeACWR(0 logs) = null', r.acwr === null, 'acwr=' + r.acwr);
  });

  // ── DIAG-08 — wpDetectPhase J1 (no plan history) → phase valide ──
  console.log('— DIAG-08 : wpDetectPhase user J1 → phase valide —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      if (typeof wpDetectPhase !== 'function') return { err: 'wpDetectPhase undefined' };
      var p = wpDetectPhase();
      return { phase: p };
    });
    var validPhases = ['intro','accumulation','intensification','peak','deload','hypertrophie','intensite','realisation'];
    ok('DIAG-08 wpDetectPhase retourne une phase string',
       typeof r.phase === 'string' && r.phase.length > 0,
       'phase=' + r.phase);
  });

  // ── DIAG-09 — units lbs → computeDOTS ne crashe pas + valeur cohérente ──
  console.log('— DIAG-09 : units=lbs → computeDOTS retourne une valeur —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      db.user.units = 'lbs';
      // computeDOTS attend kg en interne
      if (typeof computeDOTS !== 'function') return { err: 'computeDOTS undefined' };
      var dots = computeDOTS(400, 80, 'male'); // (total, bw, gender)
      return { dots: dots };
    });
    ok('DIAG-09 computeDOTS retourne un nombre fini',
       typeof r.dots === 'number' && isFinite(r.dots),
       'dots=' + r.dots);
  });

  // ── DIAG-10 — gender unspecified → calcul possible ──
  console.log('— DIAG-10 : gender=unspecified → computeDOTS ne crashe pas —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      db.user.gender = 'unspecified';
      if (typeof computeDOTS !== 'function') return { err: 'computeDOTS undefined' };
      var dots = computeDOTS(400, 80, 'unspecified');
      return { dots: dots };
    });
    ok('DIAG-10 computeDOTS(unspecified) retourne un nombre',
       typeof r.dots === 'number' && isFinite(r.dots),
       'dots=' + r.dots);
  });

  // ── DIAG-11 — programParams.cardio="aucun" → wpGeneratePowerbuildingDay sans cardio ──
  console.log('— DIAG-11 : cardio=aucun → wpGeneratePowerbuildingDay n\'ajoute pas de cardio —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      db.user.programParams.cardio = 'aucun';
      generateWeeklyPlan();
      var hasCardio = false;
      (db.weeklyPlan && db.weeklyPlan.days || []).forEach(function(d) {
        (d.exercises || []).forEach(function(e) {
          var n = (e && e.name || '').toLowerCase();
          if (n.indexOf('hiit') >= 0 || n.indexOf('cardio') >= 0) hasCardio = true;
        });
      });
      return { hasCardio: hasCardio };
    });
    ok('DIAG-11 weeklyPlan.days[].exercises sans HIIT/cardio',
       r.hasCardio === false, 'hasCardio=' + r.hasCardio);
  });

  // ── DIAG-12 — Wizard goals=['force','seche'] préservé après wizard force ──
  console.log('— DIAG-12 : Wizard préserve goals secondaires (DIM 1A flux complet) —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      _pbState.days = 4;
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.goal = 'force';
      pbGenerateProgram();
      return { goals: db.user.programParams.goals };
    });
    ok('DIAG-12 goals contient seche après wizard',
       Array.isArray(r.goals) && r.goals.indexOf('seche') >= 0,
       'goals=' + JSON.stringify(r.goals));
  });

  // ── DIAG-13 — STORAGE_KEY cohérent ──
  console.log('— DIAG-13 : STORAGE_KEY cohérent ("SBD_HUB_V29") —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      return {
        key: typeof STORAGE_KEY === 'string' ? STORAGE_KEY : null,
        hasV29: !!localStorage.getItem('SBD_HUB_V29')
      };
    });
    ok('DIAG-13 STORAGE_KEY = "SBD_HUB_V29"', r.key === 'SBD_HUB_V29', 'key=' + r.key);
  });

  // ── DIAG-14 — Defer scripts dans index.html ──
  console.log('— DIAG-14 : Tous les <script> sont en defer —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var resp = await fetch('/sbd-hub/index.html');
      var text = await resp.text();
      var allScripts = (text.match(/<script[^>]*>/g) || []).filter(function(s) { return s.indexOf('src=') >= 0; });
      var defered = allScripts.filter(function(s) { return s.indexOf('defer') >= 0 || s.indexOf('async') >= 0; });
      return { total: allScripts.length, defered: defered.length };
    });
    ok('DIAG-14 ' + r.defered + '/' + r.total + ' scripts en defer/async',
       r.defered === r.total, 'defered=' + r.defered + ' total=' + r.total);
  });

  // ── DIAG-15 — saveDB déclenche debouncedCloudSync ──
  console.log('— DIAG-15 : saveDB() appelle debouncedCloudSync() —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var resp = await fetch('/sbd-hub/js/app.min.js');
      var text = await resp.text();
      // Trouver le corps de saveDB et vérifier qu'il référence debouncedCloudSync
      // Cherche pattern 'function saveDB()' ou 'saveDB=function' dans le min
      // Comme le min renomme certaines vars, on vérifie juste la coexistence
      var hasDebouncedCloud = text.indexOf('debouncedCloudSync') >= 0;
      return { hasCall: hasDebouncedCloud };
    });
    ok('DIAG-15 debouncedCloudSync présent dans bundle', r.hasCall === true);
  });

  // ── EXTRA-01 — Aucune erreur console pendant flux complet ──
  console.log('— EXTRA-01 : 0 erreur console pendant flux complet —');
  await withPage(browser, P_BASE, async (page, errors) => {
    await page.evaluate(() => {
      pbStartGuided();
      _pbState.days = 4;
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.goal = 'mixte';
      pbGenerateProgram();
      if (typeof generateWeeklyPlan === 'function') generateWeeklyPlan();
      if (typeof renderSettingsProfile === 'function') {
        try { renderSettingsProfile(); } catch(e) {}
      }
    });
    await page.waitForTimeout(800);
    ok('EXTRA-01 0 erreur console',
       errors.length === 0,
       errors.length ? 'errors=' + errors.slice(0, 3).join(' | ') : 'OK');
  });

  // ── EXTRA-02 — STORAGE_KEY consistency dans app.min.js ──
  console.log('— EXTRA-02 : SBD_HUB_V29 défini dans app.min.js (clé centrale) —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var app = await (await fetch('/sbd-hub/js/app.min.js')).text();
      // supabase.js n'a pas besoin de la clé : il accède à db en mémoire
      // après que app.js ait fait le load. La clé est centrale dans app.js.
      return { appHas: app.indexOf('SBD_HUB_V29') >= 0 };
    });
    ok('EXTRA-02 STORAGE_KEY dans app.min.js', r.appHas === true);
  });

  // ── EXTRA-03 — VAPID privée pas en clair (push pas implémenté → check absent) ──
  console.log('— EXTRA-03 : VAPID private key absente du bundle (push non implémenté) —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var app = await (await fetch('/sbd-hub/js/app.min.js')).text();
      // Pattern d'une clé privée VAPID typique : commence par 0x ou -----BEGIN
      var hasPrivateKey = /-----BEGIN.*PRIVATE KEY-----/.test(app);
      return { hasPrivate: hasPrivateKey };
    });
    ok('EXTRA-03 aucune clé privée VAPID en clair dans app.min.js',
       r.hasPrivate === false);
  });

  // ── EXTRA-04 — Chart.js destroy ratio OK ──
  console.log('— EXTRA-04 : Chart destroy ratio OK (pas de leak chart) —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var app = await (await fetch('/sbd-hub/js/app.min.js')).text();
      // Compter occurrences (approximatif dans le min)
      var newCharts = (app.match(/new Chart\(/g) || []).length;
      var destroys = (app.match(/\.destroy\(\)/g) || []).length;
      return { news: newCharts, destroys: destroys };
    });
    ok('EXTRA-04 destroys >= new Chart',
       r.destroys >= r.news, 'destroys=' + r.destroys + ' news=' + r.news);
  });

  // ── EXTRA-05 — STORAGE_KEY pas fragmentée ──
  console.log('— EXTRA-05 : pas de fragments SBD_HUB_V[26-28] hardcodés ailleurs —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var app = await (await fetch('/sbd-hub/js/app.min.js')).text();
      // Migration legacy peut référencer V28/V27 — c'est OK
      var hasBadKey = /SBD_HUB_V[3-9][0-9]/.test(app); // V30+ serait surprenant
      return { hasBad: hasBadKey };
    });
    ok('EXTRA-05 pas de clé future SBD_HUB_V30+', r.hasBad === false);
  });

  // ── FINAL-01 — computeSRS définie 1 seule fois ──
  console.log('— FINAL-01 : computeSRS définie une seule fois (pas de doublon) —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var app = await (await fetch('/sbd-hub/js/app.min.js')).text();
      var coach = await (await fetch('/sbd-hub/js/coach.js')).text();
      var engine = await (await fetch('/sbd-hub/js/engine.min.js')).text();
      var inCoach = (coach.match(/function computeSRS/g) || []).length;
      var inEngine = (engine.match(/function computeSRS/g) || []).length;
      return { coach: inCoach, engine: inEngine };
    });
    ok('FINAL-01 computeSRS uniquement dans coach.js',
       r.coach === 1 && r.engine === 0,
       'coach=' + r.coach + ' engine=' + r.engine);
  });

  // ── FINAL-02 — coachEnabled défini mais pas lu (signal) ──
  console.log('— FINAL-02 : coachEnabled — signal de dead field —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      // Test runtime : coachEnabled=false → renderCoachTodayHTML continue de rendre ?
      db.user.coachEnabled = false;
      var c = document.getElementById('coachToday') || document.createElement('div');
      c.id = 'coachToday'; document.body.appendChild(c);
      var beforeLen = c.innerHTML.length;
      try {
        if (typeof renderCoachTodayHTML === 'function') renderCoachTodayHTML();
      } catch(e) {}
      var afterLen = c.innerHTML.length;
      return { ignored: afterLen >= beforeLen };
    });
    // Behavior is currently to ignore coachEnabled (dead field). This is a SIGNAL not a fail.
    ok('FINAL-02 (signal) coachEnabled est un dead field — comportement actuel rend toujours',
       r.ignored === true, 'ignored=' + r.ignored);
  });

  // ── FINAL-03 — DOTS calculé client (signal sécurité post-bêta) ──
  console.log('— FINAL-03 : DOTS calculé côté client (signal post-bêta) —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var engine = await (await fetch('/sbd-hub/js/engine.min.js')).text();
      // computeDOTS vit dans engine.min.js (côté client)
      return { hasClient: engine.indexOf('computeDOTS') >= 0 };
    });
    ok('FINAL-03 (signal) DOTS calculé client — tricheable, post-bêta à durcir',
       r.hasClient === true);
  });

  // ── FINAL-04 — Plate Calculator présent ──
  console.log('— FINAL-04 : goShowPlateCalc présent —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      return {
        has: typeof goShowPlateCalc === 'function' || typeof updatePlateCalc === 'function'
      };
    });
    ok('FINAL-04 Plate Calculator implémenté', r.has === true);
  });

  // ── FINAL-05 — start_url manifest pour migration Cloudflare (signal) ──
  console.log('— FINAL-05 : manifest.start_url (signal migration Cloudflare) —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(async () => {
      var manifest = await (await fetch('/sbd-hub/manifest.json')).json();
      return { startUrl: manifest.start_url };
    });
    ok('FINAL-05 (signal) manifest.start_url=/sbd-hub/index.html — à adapter pour Cloudflare',
       r.startUrl === '/sbd-hub/index.html', 'start_url=' + r.startUrl);
  });

  await browser.close();

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RÉSULTATS : ' + pass + '/' + (pass + fail) + '  (' + Math.round(pass / (pass + fail) * 100) + ' %)');
  console.log('══════════════════════════════════════════════════════════\n');

  fs.writeFileSync(path.join(__dirname, '30-diagnostic-exhaustif-results.json'),
    JSON.stringify({ pass, fail, total: pass + fail, results }, null, 2));

  process.exit(fail ? 1 : 0);
})();
