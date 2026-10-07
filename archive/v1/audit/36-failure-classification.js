// audit/36-failure-classification.js — v186 : Détection + Classification Fatigue
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8080/sbd-hub/index.html';
const STORAGE_KEY = 'SBD_HUB_V29';

function makeProfile(opts) {
  opts = opts || {};
  return {
    user: { name:'Test', age:28, bw:80, height:175, gender:'male',
      trainingMode:'powerbuilding',
      onboardingProfile: opts.level || 'intermediaire',
      level: opts.level || 'intermediaire',
      onboarded:true, onboardingVersion:99,
      coachEnabled:true, coachProfile:'full', vocabLevel:2,
      lpActive:false, lpStrikes:{},
      programParams:{ freq:4, duration:90, level: opts.level || 'intermediaire',
        selectedDays:['Lundi','Mardi','Jeudi','Vendredi'], mat:'salle',
        injuries:[], cardio:'integre', goals:['masse'] },
      barWeight:20, units:'kg',
      _activityMigrated:true, _injuryMigrated:true,
      consentHealth:true, medicalConsent:true,
      menstrualEnabled:false, menstrualData:null, weightCut:null, activityTemplate:null
    },
    logs:[], exercises:{}, bestPR:{ squat:120, bench:100, deadlift:140 },
    weeklyPlan:null, weeklyChallenges:{ challenges:[] },
    gamification:{ xp:0, xpHighWaterMark:0 },
    social:{ onboardingCompleted:true },
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

  // ─── DROP-01 : baisse charge >10% → isVoluntaryDrop, pas de message ─────
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'normal', reps:'5', weight:'100', rpe:null },
          { completed:true, isWarmup:false, setType:'normal', reps:'10', weight:'80', rpe:null }
        ]
      }];
      var r = goCheckAutoRegulation(0, 1);
      var s = activeWorkout.exercises[0].sets[1];
      return { result: r, isDropSet: s.isDropSet, setType: s.setType };
    });
    const pass = result && result.result === null && result.isDropSet === true && result.setType === 'dropset';
    record('DROP-01', 'baisse charge >10% → isVoluntaryDrop=true, pas de message', pass, JSON.stringify(result));
  });

  // ─── DROP-02 : baisse charge <10% + reps chutent → pas un drop, signaler
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'normal', reps:'5', weight:'100', rpe:null },
          { completed:true, isWarmup:false, setType:'normal', reps:'2', weight:'95', rpe:null }
        ]
      }];
      var r = goCheckAutoRegulation(0, 1);
      var s = activeWorkout.exercises[0].sets[1];
      return { result: r && { type: r.type, isImplicit: r.isImplicitFailure }, isDropSet: !!s.isDropSet };
    });
    const pass = result && !result.isDropSet && result.result && result.result.isImplicit === true;
    record('DROP-02', 'baisse charge <10% + reps chutent → pas un drop, signaler', pass, JSON.stringify(result));
  });

  // ─── DROP-03 : charge stable + -2 reps → Échec implicite warning
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'normal', reps:'5', weight:'100', rpe:null },
          { completed:true, isWarmup:false, setType:'normal', reps:'3', weight:'100', rpe:null }
        ]
      }];
      return goCheckAutoRegulation(0, 1);
    });
    const pass = result && result.isImplicitFailure === true;
    record('DROP-03', 'charge stable + -2 reps → Échec implicite', pass, result ? JSON.stringify({type:result.type, isImpl:result.isImplicitFailure}) : 'null');
  });

  // ─── CLASS-01 : setIndex=0, repDrop=3, SRS=70 → overload, conf=0.90
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof classifyFatigue !== 'function') return null;
      return classifyFatigue(0, 3, 70, 1.0, 'intermediaire');
    });
    const pass = result && result.type === 'overload' && result.confidence === 0.90;
    record('CLASS-01', 'setIndex=0, repDrop=3, SRS=70 → overload, conf=0.90', pass, JSON.stringify(result));
  });

  // ─── CLASS-02 : setIndex=1, repDrop=2, SRS=42, ACWR=1.45 → neural, conf=0.90
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof classifyFatigue !== 'function') return null;
      return classifyFatigue(1, 2, 42, 1.45, 'intermediaire');
    });
    const pass = result && result.type === 'neural' && result.confidence === 0.90;
    record('CLASS-02', 'setIndex=1, repDrop=2, SRS=42, ACWR=1.45 → neural, conf=0.90', pass, JSON.stringify(result));
  });

  // ─── CLASS-03 : setIndex=3, repDrop=1, SRS=65 → muscular, conf=0.70
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof classifyFatigue !== 'function') return null;
      return classifyFatigue(3, 1, 65, 1.0, 'intermediaire');
    });
    const pass = result && result.type === 'muscular' && result.confidence === 0.70;
    record('CLASS-03', 'setIndex=3, repDrop=1, SRS=65 → muscular, conf=0.70', pass, JSON.stringify(result));
  });

  // ─── CLASS-04 : débutant, setIndex=2, repDrop=2, SRS=65 → muscular, conf=0.60
  await withPage(browser, makeProfile({ level:'debutant' }), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof classifyFatigue !== 'function') return null;
      // setIndex=2 (late), repDrop=2 (≥1), SRS=65 (>50, !srsLow)
      // → muscular branch, conf=0.60 for debutant
      return classifyFatigue(2, 2, 65, 1.0, 'debutant');
    });
    const pass = result && result.type === 'muscular' && result.confidence === 0.60;
    record('CLASS-04', 'débutant, setIndex=2, repDrop=2 → muscular, conf=0.60', pass, JSON.stringify(result));
  });

  // ─── CLASS-05 : avancé, ACWR=1.4, repDrop=2, late set → neural conf=0.80
  await withPage(browser, makeProfile({ level:'avance' }), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof classifyFatigue !== 'function') return null;
      // setIndex=3 (late, !isEarly), repDrop=2, SRS=70 (no srsLow), acwr=1.4 (acwrHigh)
      // Standard rules: not early, not srsLow → muscular branch wouldn't fire (needs !srsLow which is true)
      // but the avancé override fires AFTER muscular check? No, BEFORE in spec
      // CLASS-05: avancé + repDrop>=2 + acwrHigh → neural conf=0.80
      return classifyFatigue(3, 2, 70, 1.4, 'avance');
    });
    const pass = result && result.type === 'neural' && result.confidence === 0.80;
    record('CLASS-05', 'avancé, ACWR=1.4, repDrop=2 → neural, conf=0.80', pass, JSON.stringify(result));
  });

  // ─── UX-01 : confidence<0.60 + RPE noté + _isImplicitFail seul → silence
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      // RPE noté → user knows what they're doing, plus low confidence → silence
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'normal', reps:'5', weight:'100', rpe:7.5 },
          { completed:true, isWarmup:false, setType:'normal', reps:'3', weight:'100', rpe:8 }
        ]
      }];
      // No SRS/ACWR mock → classifyFatigue returns conf=0
      // _isImplicitFail=true, but set.rpe provided → no strong signal
      var r = goCheckAutoRegulation(0, 1);
      return { result: r, fatigueType: activeWorkout.exercises[0].sets[1].fatigueType };
    });
    const pass = result && result.result === null;
    record('UX-01', 'confidence<0.60 + RPE noté → return null (silence)', pass, JSON.stringify(result));
  });

  // ─── UX-02 : confidence 0.75, type=neural → msg type='warning'
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      // Force ACWR high to trigger neural (early+repDrop≥2+srsLow|acwrHigh)
      // With SRS not low, only acwrHigh → conf=0.75
      // Need 14d ACWR data to get acwr>1.3
      // Easier approach: check classifyFatigue directly with controlled inputs
      _goDoStartWorkout(false);
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'normal', reps:'5', weight:'100', rpe:null },
          { completed:true, isWarmup:false, setType:'normal', reps:'3', weight:'100', rpe:null }
        ]
      }];
      // Patch computeSRS+computeACWR for deterministic test
      window.computeSRS = function() { return { score: 70 }; };
      window.computeACWR = function() { return 1.4; };
      var r = goCheckAutoRegulation(0, 1);
      return r && { type: r.type, fatigueType: r.fatigueType, confidence: r.fatigueConfidence };
    });
    const pass = result && result.fatigueType === 'neural' && result.type === 'warning';
    record('UX-02', 'confidence 0.75, type=neural → msg type=warning', pass, JSON.stringify(result));
  });

  // ─── UX-03 : confidence 0.90, type=neural → msg danger + blockAPREIncrease
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'normal', reps:'5', weight:'100', rpe:null },
          { completed:true, isWarmup:false, setType:'normal', reps:'3', weight:'100', rpe:null }
        ]
      }];
      window.computeSRS = function() { return { score: 42 }; }; // srsLow
      window.computeACWR = function() { return 1.45 }; // acwrHigh
      var r = goCheckAutoRegulation(0, 1);
      return r && { type: r.type, fatigueType: r.fatigueType,
        confidence: r.fatigueConfidence, blockAPRE: r.blockAPREIncrease };
    });
    const pass = result && result.type === 'danger' && result.fatigueType === 'neural'
      && result.confidence === 0.90 && result.blockAPRE === true;
    record('UX-03', 'confidence 0.90, type=neural → danger + blockAPREIncrease', pass, JSON.stringify(result));
  });

  // ─── UX-04 : type=muscular, phase=hypertrophie → msg positif "c'est ici que tu progresses"
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof goCheckAutoRegulation !== 'function') return null;
      db.user.level = 'intermediaire';
      db.weeklyPlan = { days: [] };
      _goDoStartWorkout(false);
      // Late set + muscular → messages positifs en hypertrophie
      activeWorkout.exercises = [{
        name: 'Squat (Barre)',
        sets: [
          { completed:true, isWarmup:false, setType:'normal', reps:'10', weight:'80', rpe:null },
          { completed:true, isWarmup:false, setType:'normal', reps:'10', weight:'80', rpe:null },
          { completed:true, isWarmup:false, setType:'normal', reps:'10', weight:'80', rpe:null },
          { completed:true, isWarmup:false, setType:'normal', reps:'8', weight:'80', rpe:null }
        ]
      }];
      window.computeSRS = function() { return { score: 65 }; }; // !srsLow
      window.computeACWR = function() { return 1.0; };
      window.wpDetectPhase = function() { return 'hypertrophie'; };
      var r = goCheckAutoRegulation(0, 3);
      return r && { type: r.type, fatigueType: r.fatigueType, msg: r.msg };
    });
    // _repsDrop = 10-8 = 2 → _isImplicitFail=true
    // setIndex=3 (late), repDrop=2, SRS=65 (!srsLow) → muscular conf=0.70
    // confidence ≥ 0.60, type=muscular, phase=hypertrophie → msg positif
    const pass = result && result.fatigueType === 'muscular'
      && result.msg && result.msg.indexOf('c\'est ici que tu progresses') >= 0;
    record('UX-04', 'muscular + hypertrophie → "c\'est ici que tu progresses"', pass, JSON.stringify(result));
  });

  await browser.close();

  const passed = results.filter(r => r.pass).length;
  const total  = results.length;
  console.log('\n' + passed + '/' + total + ' tests passed');

  fs.writeFileSync(
    path.join(__dirname, '36-failure-classification-results.json'),
    JSON.stringify({ passed, total, results }, null, 2)
  );
}

runAll().catch(e => { console.error(e); process.exit(1); });
