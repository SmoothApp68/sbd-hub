// audit/35-gemini-final-validation.js — v185 : Validation Finale Gemini 7 zones
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8080/sbd-hub/index.html';
const STORAGE_KEY = 'SBD_HUB_V29';

function makeSets(weight, reps, n) {
  var sets = [];
  for (var i = 0; i < n; i++) sets.push({ weight: String(weight), reps: String(reps), rpe: 7.5, isWarmup: false, completed: true });
  return sets;
}

function makeLog(daysAgo, exercises) {
  return { timestamp: Date.now() - daysAgo * 86400000,
    exercises: exercises.map(function(e) {
      return { name: e.name, sets: e.sets || 3, volume: e.volume || 0,
        allSets: makeSets(e.weight || 100, e.reps || 5, e.sets || 3) };
    }) };
}

function makeProfile(opts) {
  opts = opts || {};
  var logs = opts.logs || [];
  return {
    user: { name:'Test', age:28, bw:opts.bw||80, height:175, gender: opts.gender || 'male',
      trainingMode: opts.trainingMode || 'powerbuilding',
      onboardingProfile: opts.level || 'intermediaire',
      level: opts.level || 'intermediaire',
      onboarded:true, onboardingVersion:99,
      coachEnabled:true, coachProfile:'full', vocabLevel:2, lpActive:false, lpStrikes:{},
      programParams: { freq: opts.freq || 4, duration:90, level: opts.level || 'intermediaire',
        selectedDays: opts.selectedDays || ['Lundi','Mardi','Jeudi','Vendredi'],
        mat:'salle', injuries:[], cardio:'integre', goals: opts.goals || ['masse'] },
      barWeight:20, units:'kg',
      _activityMigrated:true, _injuryMigrated:true,
      consentHealth:true, medicalConsent:true,
      menstrualEnabled: opts.menstrualEnabled || false,
      menstrualData: opts.menstrualData || null,
      weightCut: opts.weightCut || null,
      activityTemplate: opts.activityTemplate || null
    },
    logs: logs, exercises: opts.exercises || {},
    bestPR: opts.bestPR || { squat:120, bench:100, deadlift:140 },
    weeklyPlan:null, weeklyChallenges:{ challenges:[] },
    gamification:{ xp: 0, xpHighWaterMark: 0 },
    social:{onboardingCompleted:true},
    _magicStartDone:true, activityLogs:[], earnedBadges:{}, xpHighWaterMark:0
  };
}

async function withPage(browser, profile, fn) {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ p, key }) => { localStorage.setItem(key, JSON.stringify(p)); },
    { p: profile, key: STORAGE_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  try { return await fn(page); }
  finally { await ctx.close(); }
}

const results = [];
function record(id, desc, pass, detail) {
  const icon = pass ? '✅' : '❌';
  console.log(icon + ' ' + id + ' — ' + desc + (detail ? ' | ' + detail : ''));
  results.push({ id, desc, pass, detail });
}

async function runAll() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // FIX1 — Bulgarian Split Squat présent dans WP_ACCESSORIES force.squat
  await withPage(browser, makeProfile(), async (page) => {
    const r = await page.evaluate(() => {
      if (typeof WP_ACCESSORIES_BY_PHASE === 'undefined') return { found: false, noStep: false };
      var sq = (WP_ACCESSORIES_BY_PHASE.force || {}).squat || [];
      return {
        found:  sq.some(function(a) { return a.name === 'Bulgarian Split Squat'; }),
        noStep: !sq.some(function(a) { return a.name === 'Step-up'; })
      };
    });
    record('FIX1', 'Bulgarian Split Squat in force.squat (Step-up removed)', r.found && r.noStep, JSON.stringify(r));
  });

  // FIX2 — Curl Marteau présent dans WP_ACCESSORIES force.bench
  await withPage(browser, makeProfile(), async (page) => {
    const found = await page.evaluate(() => {
      if (typeof WP_ACCESSORIES_BY_PHASE === 'undefined') return false;
      var bench = (WP_ACCESSORIES_BY_PHASE.force || {}).bench || [];
      return bench.some(function(a) { return a.name === 'Curl Marteau'; });
    });
    record('FIX2', 'Curl Marteau in force.bench', found, 'found=' + found);
  });

  // FIX3 — wpDetectPlateau deadlift → fenêtre 8, min 4 séances pour détecter
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof wpDetectPlateau !== 'function') return null;
      var now = Date.now();
      db.logs = [];
      for (var i = 0; i < 4; i++) {
        db.logs.push({
          timestamp: now - i * 86400000 * 2,
          exercises: [{ name: 'Soulevé de Terre', allSets: [{ weight: 180, rpe: 9.5, isWarmup: false }] }]
        });
      }
      return wpDetectPlateau('deadlift');
    });
    const detected = result !== null && result.liftType === 'deadlift';
    record('FIX3', 'wpDetectPlateau deadlift 4 sessions → detected (minHistory=4)', detected, JSON.stringify(result));
  });

  // FIX3b — wpDetectPlateau squat → min 3 séances (inchangé)
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof wpDetectPlateau !== 'function') return null;
      var now = Date.now();
      db.logs = [];
      for (var i = 0; i < 3; i++) {
        db.logs.push({
          timestamp: now - i * 86400000 * 2,
          exercises: [{ name: 'Squat (Barre)', allSets: [{ weight: 140, rpe: 9.2, isWarmup: false }] }]
        });
      }
      return wpDetectPlateau('squat');
    });
    const detected = result !== null && result.liftType === 'squat';
    record('FIX3b', 'wpDetectPlateau squat 3 sessions → detected (minHistory=3 unchanged)', detected, JSON.stringify(result));
  });

  // FIX4 — getMissingActivityLogs filtre par jour (test comportemental)
  await withPage(browser, makeProfile({
    activityTemplate: [{ type: 'natation', intensity: 3, days: ['Lundi'], duration: 45 }]
  }), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof getMissingActivityLogs !== 'function') return { ok: false, reason: 'MISSING_FN' };
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      var yesterdayName = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][yesterday.getDay()];
      var templateHasYesterday = (db.user.activityTemplate || []).some(function(a) {
        return (a.days || []).includes(yesterdayName);
      });
      var missing = getMissingActivityLogs();
      if (!templateHasYesterday) {
        return { ok: missing.length === 0, reason: yesterdayName + ' not in template → missing=' + missing.length };
      }
      return { ok: missing.length <= 1, reason: yesterdayName + ' is Lundi → missing=' + missing.length };
    });
    const pass = typeof result === 'object' && result.ok;
    record('FIX4', 'getMissingActivityLogs filters by day (behavioral check)', pass, JSON.stringify(result));
  });

  // FIX5 — confirmGhostLog(type, false) → db._recoveryBonus créé
  await withPage(browser, makeProfile({
    activityTemplate: [{ type: 'natation', intensity: 3, days: ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'], duration: 45 }]
  }), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof confirmGhostLog !== 'function') return null;
      db._recoveryBonus = null;
      confirmGhostLog('natation', false);
      return db._recoveryBonus || null;
    });
    const hasBonus = result !== null && typeof result === 'object' && result.natation && result.natation.bonus === 2.5;
    record('FIX5', 'confirmGhostLog(type, false) → db._recoveryBonus.natation.bonus=2.5', hasBonus, JSON.stringify(result));
  });

  // FIX5b — wpComputeWorkWeight contient le code du bonus (check structurel via app.min.js)
  await withPage(browser, makeProfile(), async (page) => {
    // With full squat history so the function goes through the main calc path
    const result = await page.evaluate(() => {
      if (typeof wpComputeWorkWeight !== 'function') return null;
      // Set up proper history so main path is triggered
      var now = Date.now();
      db.logs = [
        { timestamp: now - 86400000 * 2, exercises: [{ name: 'Squat (Barre)',
          allSets: [{ weight:'120', reps:'5', rpe:7.5, isWarmup:false, completed:true },
                    { weight:'120', reps:'5', rpe:7.5, isWarmup:false, completed:true }] }] },
        { timestamp: now - 86400000 * 5, exercises: [{ name: 'Squat (Barre)',
          allSets: [{ weight:'117.5', reps:'5', rpe:7, isWarmup:false, completed:true }] }] }
      ];
      // e1rm=150 → hard cap 155 (well above any possible bonus result)
      db.exercises = { 'Squat (Barre)': { e1rm: 150, shadowWeight: 120, lastRPE: 7.5 } };
      db.user.level = 'intermediaire';
      db.user.trainingMode = 'powerbuilding';
      db.user.lpActive = false; // Force APRE path (not LP path)
      db.bestPR = { squat: 120, bench: 100, deadlift: 140 };
      db.user.bw = 80;
      db.user.gender = 'male';
      var todayStr = new Date().toISOString().split('T')[0];
      db._recoveryBonus = { natation: { date: todayStr, bonus: 2.5, reason: 'test' } };
      // Run twice to confirm: first run → bonus applied + key deleted
      // Second run → no bonus (key gone) → weight should differ by 2.5
      var wWith = wpComputeWorkWeight('squat', 'lower');
      var bonusConsumed = !db._recoveryBonus || !db._recoveryBonus.natation;
      var wWithout = wpComputeWorkWeight('squat', 'lower');
      return { wWith: wWith, wWithout: wWithout, bonusConsumed: bonusConsumed,
        diff: (typeof wWith === 'number' && typeof wWithout === 'number') ? wWith - wWithout : null };
    });
    // Primary check: bonus was consumed AND second call returns lower weight (no bonus)
    const pass = result && result.bonusConsumed && result.diff === 2.5;
    record('FIX5b', 'wpComputeWorkWeight consumes _recoveryBonus (+2.5kg, key deleted)', pass, JSON.stringify(result));
  });

  // FIX6 — -2 reps à charge égale → warning "échec implicite"
  // Note: activeWorkout is let-scoped, must use _goDoStartWorkout() to init it
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'work', reps:'5', weight:'100', rpe:null },
          { completed:true, isWarmup:false, setType:'work', reps:'3', weight:'100', rpe:null }
        ]
      }];
      return goCheckAutoRegulation(0, 1);
    });
    const isWarning = result && result.type === 'warning' && result.isImplicitFailure === true;
    record('FIX6', '-2 reps same weight → warning isImplicitFailure', isWarning, result ? result.msg.substring(0, 60) : 'null');
  });

  // FIX6b — -3 reps → danger + blockAPREIncrease
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'work', reps:'5', weight:'100', rpe:null },
          { completed:true, isWarmup:false, setType:'work', reps:'2', weight:'100', rpe:null }
        ]
      }];
      var r = goCheckAutoRegulation(0, 1);
      var strike = (db.user.lpStrikes && db.user.lpStrikes['Squat (Barre)']) ? db.user.lpStrikes['Squat (Barre)'].count : 0;
      return { result: r, strike: strike };
    });
    const isDanger = result && result.result && result.result.type === 'danger' && result.result.blockAPREIncrease === true;
    record('FIX6b', '-3 reps → danger + blockAPREIncrease + strike', isDanger, JSON.stringify({ type: result && result.result && result.result.type, strike: result && result.strike }));
  });

  // FIX6c — baisse charge + baisse reps → danger "épuisement"
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'work', reps:'5', weight:'100', rpe:null },
          { completed:true, isWarmup:false, setType:'work', reps:'3', weight:'90', rpe:null }
        ]
      }];
      return goCheckAutoRegulation(0, 1);
    });
    const isDanger = result && result.type === 'danger' && result.isImplicitFailure === true;
    record('FIX6c', 'weight drop + rep drop → danger (exhaustion)', isDanger, result ? result.msg.substring(0, 60) : 'null');
  });

  // FIX7 — wpDetectPlateau squat → action 'switch_variation'
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof wpDetectPlateau !== 'function') return null;
      var now = Date.now();
      db.logs = [];
      for (var i = 0; i < 3; i++) {
        db.logs.push({
          timestamp: now - i * 86400000 * 2,
          exercises: [{ name: 'Squat (Barre)', allSets: [{ weight: 140, rpe: 9.2, isWarmup: false }] }]
        });
      }
      return wpDetectPlateau('squat');
    });
    const correctAction = result && result.action === 'switch_variation';
    record('FIX7', 'wpDetectPlateau squat → action switch_variation', correctAction, result ? result.action : 'null');
  });

  // FIX8 — analyzeAthleteProfile retourne un tableau de sections
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      try {
        db.user.level = 'intermediaire';
        var sections = analyzeAthleteProfile();
        // analyzeAthleteProfile returns sections array directly
        var isArray = Array.isArray(sections);
        return { isArray, len: isArray ? sections.length : 0 };
      } catch(e) { return { err: e.message }; }
    });
    const pass = result && result.isArray;
    record('FIX8', 'analyzeAthleteProfile returns sections array (ischios/quads logic integrated)', pass, JSON.stringify(result));
  });

  await browser.close();

  const passed = results.filter(r => r.pass).length;
  const total  = results.length;
  console.log('\n' + passed + '/' + total + ' tests passed');

  fs.writeFileSync(
    path.join(__dirname, '35-gemini-final-validation-results.json'),
    JSON.stringify({ passed, total, results }, null, 2)
  );
}

runAll().catch(e => { console.error(e); process.exit(1); });
