// audit/37-deload-dp.js — v187 : shouldDeload() + Double Progression
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

// Helper pour créer logs de N semaines avec volume/RPE constants
function makeWeekLogs(weeks, volPerLog, rpe) {
  var logs = [];
  var now = Date.now();
  var DAY = 86400000;
  for (var w = 0; w < weeks; w++) {
    for (var d = 0; d < 4; d++) {
      logs.push({
        timestamp: now - (w * 7 + d) * DAY,
        volume: volPerLog,
        exercises: [{
          name: 'Squat (Barre)',
          allSets: [
            { weight:'100', reps:'5', rpe: rpe, isWarmup:false, completed:true }
          ]
        }]
      });
    }
  }
  return logs;
}

async function runAll() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // ─── DELOAD-01 : SRS<45 → needed:true, trigger:'srs'
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof shouldDeload !== 'function') return null;
      db.user.level = 'intermediaire';
      db.logs = [
        { timestamp: Date.now() - 86400000 * 2, volume: 5000, exercises:[] },
        { timestamp: Date.now() - 86400000 * 5, volume: 5000, exercises:[] },
        { timestamp: Date.now() - 86400000 * 8, volume: 5000, exercises:[] }
      ];
      window.computeSRS = function() { return { score: 40 }; }; // < 45
      return shouldDeload(db.logs, 'powerbuilding');
    });
    const pass = result && result.needed === true && result.trigger === 'srs';
    record('DELOAD-01', 'SRS<45 → needed:true, trigger=srs', pass, JSON.stringify(result));
  });

  // ─── DELOAD-02 : SRS=70 + volume drop + RPE 8.8 → needed:true, trigger:'volume_rpe'
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof shouldDeload !== 'function') return null;
      db.user.level = 'intermediaire';
      window.computeSRS = function() { return { score: 70 }; };
      var now = Date.now();
      var DAY = 86400000;
      var WEEK = 7 * DAY;
      // Semaine 1 (récente) : volume bas, RPE haut
      // Semaine 3 (ancienne) : volume haut
      db.logs = [];
      for (var d = 0; d < 4; d++) {
        db.logs.push({
          timestamp: now - d * DAY, volume: 4000,
          exercises: [{ name:'Squat (Barre)', allSets:[
            { weight:'100', reps:'5', rpe:8.8, isWarmup:false }
          ]}]
        });
      }
      for (var d = 0; d < 4; d++) {
        db.logs.push({
          timestamp: now - (2*7 + d) * DAY, volume: 6000,
          exercises:[{ name:'Squat (Barre)', allSets:[
            { weight:'100', reps:'5', rpe:7.5, isWarmup:false }
          ]}]
        });
      }
      return shouldDeload(db.logs, 'powerbuilding');
    });
    const pass = result && result.needed === true && result.trigger === 'volume_rpe';
    record('DELOAD-02', 'SRS=70 + volume drop + RPE 8.8 → trigger=volume_rpe', pass, JSON.stringify(result));
  });

  // ─── DELOAD-03 : Tout OK mais 7 semaines (avancé) → needed:true, trigger:'max_weeks'
  await withPage(browser, makeProfile({ level:'avance' }), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof shouldDeload !== 'function') return null;
      db.user.level = 'avance';
      window.computeSRS = function() { return { score: 70 }; };
      var now = Date.now();
      var DAY = 86400000;
      // Premier log à 7 semaines, derniers récents → weeksSinceDeload = 7
      db.logs = [
        { timestamp: now - 7 * 7 * DAY, volume: 5000, exercises:[] },
        { timestamp: now - 5 * 7 * DAY, volume: 5000, exercises:[] },
        { timestamp: now - 3 * 7 * DAY, volume: 5000, exercises:[] }
      ];
      db.weeklyPlan = null; // pas de lastDeloadDate
      return shouldDeload(db.logs, 'powerbuilding');
    });
    // For avance, maxWeeks=6, so 7 weeks → needed
    const pass = result && result.needed === true && result.trigger === 'max_weeks';
    record('DELOAD-03', 'avancé 7 semaines (maxWeeks=6) → trigger=max_weeks', pass, JSON.stringify(result));
  });

  // ─── DELOAD-04 : Tout OK, 4 semaines → needed:false
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof shouldDeload !== 'function') return null;
      db.user.level = 'intermediaire';
      window.computeSRS = function() { return { score: 70 }; };
      var now = Date.now();
      var DAY = 86400000;
      db.logs = [
        { timestamp: now - 4 * 7 * DAY, volume: 5000, exercises:[] },
        { timestamp: now - 2 * 7 * DAY, volume: 5000, exercises:[] },
        { timestamp: now - 1 * 7 * DAY, volume: 5000, exercises:[] }
      ];
      db.weeklyPlan = null;
      return shouldDeload(db.logs, 'powerbuilding');
    });
    const pass = result && result.needed === false;
    record('DELOAD-04', 'Tout OK, 4 semaines → needed:false', pass, JSON.stringify(result));
  });

  // ─── DELOAD-05 : Débutant seuils différents (maxWeeks:12, rpe:9.0)
  await withPage(browser, makeProfile({ level:'debutant' }), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof shouldDeload !== 'function') return null;
      db.user.level = 'debutant';
      window.computeSRS = function() { return { score: 70 }; };
      var now = Date.now();
      var DAY = 86400000;
      // 8 semaines : déclenche pour intermédiaire (maxWeeks=8) mais PAS pour débutant (maxWeeks=12)
      db.logs = [
        { timestamp: now - 8 * 7 * DAY, volume: 5000, exercises:[] },
        { timestamp: now - 6 * 7 * DAY, volume: 5000, exercises:[] },
        { timestamp: now - 4 * 7 * DAY, volume: 5000, exercises:[] }
      ];
      db.weeklyPlan = null;
      return shouldDeload(db.logs, 'powerbuilding');
    });
    // Débutant maxWeeks=12, so 8 weeks → needed:false
    const pass = result && result.needed === false;
    record('DELOAD-05', 'débutant 8 semaines (maxWeeks=12) → needed:false', pass, JSON.stringify(result));
  });

  // ─── DP-01 : RPE null + allSetsComplete → progression déclenchée
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof wpDoubleProgressionWeight !== 'function') return null;
      var now = Date.now();
      db.logs = [{
        timestamp: now - 86400000,
        exercises: [{
          name: 'Leg Press',
          allSets: [
            { weight:'100', reps:'12', rpe: null, isWarmup:false, completed:true },
            { weight:'100', reps:'12', rpe: null, isWarmup:false, completed:true },
            { weight:'100', reps:'12', rpe: null, isWarmup:false, completed:true }
          ]
        }]
      }];
      return wpDoubleProgressionWeight('Leg Press', 8, 12);
    });
    const pass = result && result.progressed === true;
    record('DP-01', 'RPE null + allSetsComplete → progressed:true', pass, JSON.stringify(result));
  });

  // ─── DP-02 : Leg Press → incrément +5kg (lower compound)
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof getDPIncrement !== 'function') return { err: 'no fn' };
      return { inc: getDPIncrement('Leg Press') };
    });
    // Leg Press is lower compound → +5
    const pass = result && result.inc === 5.0;
    record('DP-02', 'Leg Press → getDPIncrement=+5kg', pass, JSON.stringify(result));
  });

  // ─── DP-03 : Curl haltères → +1kg (upper isolation)
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof getDPIncrement !== 'function') return { err: 'no fn' };
      return { inc: getDPIncrement('Curl Haltères') };
    });
    const pass = result && result.inc === 1.0;
    record('DP-03', 'Curl Haltères → getDPIncrement=+1kg', pass, JSON.stringify(result));
  });

  // ─── DP-04 : 3×11 au lieu de 3×12 → pas de progression, almostComplete:true
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof wpDoubleProgressionWeight !== 'function') return null;
      var now = Date.now();
      db.logs = [{
        timestamp: now - 86400000,
        exercises: [{
          name: 'Leg Press',
          allSets: [
            { weight:'100', reps:'11', rpe: 7, isWarmup:false, completed:true },
            { weight:'100', reps:'11', rpe: 7, isWarmup:false, completed:true },
            { weight:'100', reps:'11', rpe: 7, isWarmup:false, completed:true }
          ]
        }]
      }];
      return wpDoubleProgressionWeight('Leg Press', 8, 12);
    });
    const pass = result && result.progressed === false && result.almostComplete === true;
    record('DP-04', '3×11 au lieu de 3×12 → almostComplete:true', pass, JSON.stringify(result));
  });

  // ─── DP-05 : coachNote présente si almostComplete
  await withPage(browser, makeProfile(), async (page) => {
    const result = await page.evaluate(() => {
      if (typeof wpDoubleProgressionWeight !== 'function') return null;
      var now = Date.now();
      db.logs = [{
        timestamp: now - 86400000,
        exercises: [{
          name: 'Leg Press',
          allSets: [
            { weight:'100', reps:'11', rpe: 7, isWarmup:false, completed:true },
            { weight:'100', reps:'11', rpe: 7, isWarmup:false, completed:true },
            { weight:'100', reps:'11', rpe: 7, isWarmup:false, completed:true }
          ]
        }]
      }];
      return wpDoubleProgressionWeight('Leg Press', 8, 12);
    });
    const pass = result && typeof result.coachNote === 'string' && result.coachNote.indexOf('Encore une séance') >= 0;
    record('DP-05', 'almostComplete → coachNote présente', pass, JSON.stringify(result));
  });

  await browser.close();

  const passed = results.filter(r => r.pass).length;
  const total  = results.length;
  console.log('\n' + passed + '/' + total + ' tests passed');

  fs.writeFileSync(
    path.join(__dirname, '37-deload-dp-results.json'),
    JSON.stringify({ passed, total, results }, null, 2)
  );
}

runAll().catch(e => { console.error(e); process.exit(1); });
