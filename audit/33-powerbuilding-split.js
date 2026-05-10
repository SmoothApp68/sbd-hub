// audit/33-powerbuilding-split.js — Tests v183 — Powerbuilding split
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8080/sbd-hub/index.html';
const STORAGE_KEY = 'SBD_HUB_V29';

// Profil de base
function makeProfile(opts) {
  opts = opts || {};
  return {
    user: { name:'TestPB', age:28, bw:98, height:178, gender:'male', fatPct:null,
      trainingMode: opts.trainingMode || 'powerbuilding',
      onboardingProfile: 'intermediaire',
      level: opts.level || 'avance',
      onboarded:true, onboardingVersion:99,
      coachEnabled:true, coachProfile:'full', vocabLevel:2, lpActive:false, lpStrikes:{},
      programParams: { freq: opts.freq || 5, duration:90, level: opts.level || 'avance',
        selectedDays: opts.selectedDays || ['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
        mat:'salle', injuries:[], cardio:'integre', goals: opts.goals || ['masse'] },
      barWeight:20, units:'kg',
      _activityMigrated:true, _injuryMigrated:true,
      consentHealth:true, medicalConsent:true,
      onboardingPRs: opts.bestPR || { squat:148, bench:140, deadlift:186 }
    },
    logs:[], exercises:{},
    bestPR: opts.bestPR || { squat:148, bench:140, deadlift:186 },
    weeklyPlan:null, weeklyChallenges:{ challenges:[] },
    gamification:{ xp: 0, xpHighWaterMark: 0 },
    social:{onboardingCompleted:true},
    _magicStartDone:true, activityLogs:[], earnedBadges:{}, xpHighWaterMark:0
  };
}

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
  await page.evaluate(({ p, key }) => {
    localStorage.setItem(key, JSON.stringify(p));
  }, { p: profile, key: STORAGE_KEY });
  await page.reload();
  await page.waitForTimeout(1200);
  const result = await fn(page, errors);
  await ctx.close();
  return result;
}

// Helper : exécute generateProgram avec un profil donné et retourne la sequence générée
async function genProgram(page, opts) {
  return await page.evaluate((o) => {
    db.user.trainingMode = o.trainingMode;
    db.user.programParams = db.user.programParams || {};
    db.user.programParams.freq = o.freq;
    db.user.programParams.level = o.level;
    db.user.programParams.selectedDays = o.selectedDays;
    db.bestPR = o.bestPR;
    obSelectedDays = o.selectedDays;
    var goals = (o.goals || ['masse']).map(function(id){ return { id: id }; });
    var plan = generateProgram(goals, o.freq, 'salle', 90, [], 'integre', null, null, o.level);
    return {
      labels: plan.filter(function(d){ return !d.isRest; }).map(function(d){ return d.label; }),
      ratioNote: plan._ratioNote || null,
      coachNotes: (db.weeklyPlan && db.weeklyPlan.coachNotes) || [],
      firstExos: plan.filter(function(d){ return !d.isRest; }).map(function(d){ return (d.exos && d.exos[0]) || null; })
    };
  }, opts);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  console.log('\n── PB : Powerbuilding Split ──');

  // PB-01 : trainingMode='powerbuilding' → isPB=true (via routage powerbuilding_5)
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:200, bench:140, deadlift:200} // ratio 1.43, pas spec
    });
    // Si isPB=true, les labels doivent commencer par "Squat — Force & Volume"
    const isPB = r.labels[0] === 'Squat — Force & Volume';
    ok('PB-01 trainingMode=powerbuilding → routage powerbuilding', isPB, 'J1=' + r.labels[0]);
  });

  // PB-02 : 5j powerbuilding → splitType='powerbuilding_5'
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:200, bench:140, deadlift:200}
    });
    const expected = ['Squat — Force & Volume','Bench — Force & Volume','Deadlift — Force & Volume','Bench 2 — Volume & Accessoires','Squat 2 — Volume Jambes'];
    const match = JSON.stringify(r.labels) === JSON.stringify(expected);
    ok('PB-02 5j powerbuilding → powerbuilding_5 séquence', match, 'labels=' + JSON.stringify(r.labels));
  });

  // PB-03 : 5j powerlifting (force) → splitType='powerlifting_5' (inchangé)
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerlifting', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['force'], bestPR:{squat:200, bench:140, deadlift:200}
    });
    // powerlifting_5 = squat_acc, bench_acc, dead_acc, squat2, bench2
    const expected = ['Squat + Accessoires','Bench + Accessoires','Deadlift + Accessoires','Squat 2','Bench 2'];
    const match = JSON.stringify(r.labels) === JSON.stringify(expected);
    ok('PB-03 5j powerlifting → powerlifting_5 (inchangé)', match, 'labels=' + JSON.stringify(r.labels));
  });

  // PB-04 : 5j bodybuilding (mode=musculation, goal=masse) → splitType='ppl_ul' (inchangé)
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'musculation', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:200, bench:140, deadlift:200}
    });
    // ppl_ul = Push, Pull, Legs, Upper, Lower
    const expected = ['Push — Volume','Pull — Volume','Jambes — Volume','Upper Body','Lower Body'];
    const match = JSON.stringify(r.labels) === JSON.stringify(expected);
    ok('PB-04 5j bodybuilding → ppl_ul (inchangé)', match, 'labels=' + JSON.stringify(r.labels));
  });

  // PB-05 : powerbuilding_5 → J1=Squat barre (pas bench_halt)
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:200, bench:140, deadlift:200}
    });
    ok('PB-05 J1 commence par squat (barre)', r.firstExos[0] === 'squat', 'J1 exo[0]=' + r.firstExos[0]);
  });

  // PB-06 : powerbuilding_5 → J2=Bench barre (pas bench_halt)
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:200, bench:140, deadlift:200}
    });
    ok('PB-06 J2 commence par bench (barre)', r.firstExos[1] === 'bench', 'J2 exo[0]=' + r.firstExos[1]);
  });

  // PB-07 : ratio 1.06 (148/140) < 1.20 + level=avance → J5=sq2_spec
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:148, bench:140, deadlift:186}
    });
    const isSpec = r.labels[4] === 'Spécialisation Quad — Rattrapage';
    ok('PB-07 ratio 1.06 < 1.20 → J5 spécialisation quad', isSpec, 'J5=' + r.labels[4]);
  });

  // PB-08 : ratio 1.43 (200/140) > 1.20 → J5=sq2_hyp (pas spec)
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:200, bench:140, deadlift:200}
    });
    const noSpec = r.labels[4] === 'Squat 2 — Volume Jambes';
    ok('PB-08 ratio 1.43 > 1.20 → J5 standard (pas spec)', noSpec, 'J5=' + r.labels[4]);
  });

  // PB-09 : ratio check n'affecte pas powerlifting_5 (isPL=true)
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerlifting', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['force'], bestPR:{squat:148, bench:140, deadlift:186}
    });
    // En powerlifting_5, J5 = bench2 (pas sq2_spec)
    const stillPL = r.labels[4] === 'Bench 2';
    ok('PB-09 ratio < 1.20 + powerlifting → pas de spec (PL inchangé)', stillPL, 'J5=' + r.labels[4]);
  });

  // PB-10 : 4j powerbuilding → powerbuilding_4
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:4, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi'],
      goals:['masse'], bestPR:{squat:200, bench:140, deadlift:200}
    });
    const expected = ['Squat — Force & Volume','Bench — Force & Volume','Deadlift — Force & Volume','Bench 2 — Volume & Accessoires'];
    const match = JSON.stringify(r.labels) === JSON.stringify(expected);
    ok('PB-10 4j powerbuilding → powerbuilding_4', match, 'labels=' + JSON.stringify(r.labels));
  });

  // PB-11 : 6j powerbuilding → powerbuilding_6
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:6, level:'avance',
      selectedDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:200, bench:140, deadlift:200}
    });
    const expectedJ6 = 'Pull — Volume';
    ok('PB-11 6j powerbuilding → J6=Pull volume', r.labels[5] === expectedJ6, 'J6=' + r.labels[5] + ' (total ' + r.labels.length + ' jours)');
  });

  // PB-12 : auditTrail → coachNotes contient mention du ratio
  await withPage(browser, makeProfile(), async (page) => {
    const r = await genProgram(page, {
      trainingMode:'powerbuilding', freq:5, level:'avance',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      goals:['masse'], bestPR:{squat:148, bench:140, deadlift:186}
    });
    const hasNote = r.ratioNote && r.ratioNote.indexOf('Spécialisation Squat') >= 0
      && r.ratioNote.indexOf('1.06') >= 0;
    ok('PB-12 audit trail → ratio mentionné dans note', hasNote, 'note=' + (r.ratioNote || 'null'));
  });

  await browser.close();

  console.log('\n══════════════════════════════');
  console.log('v183 Powerbuilding Split: ' + pass + '/' + (pass + fail) + ' tests passed');
  console.log('══════════════════════════════');

  const summary = { date: new Date().toISOString(), version: 'v183', pass, fail, total: pass + fail, results };
  fs.writeFileSync(path.join(__dirname, '33-powerbuilding-split-results.json'), JSON.stringify(summary, null, 2));
  if (fail > 0) process.exit(1);
})();
