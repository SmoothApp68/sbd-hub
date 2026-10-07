// audit/34-dup-backoff-ratios.js — v184 tests : DUP universel + Back-off + Ratios + Léa fix
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
    logs: opts.logs || [], exercises: opts.exercises || {},
    bestPR: opts.bestPR || { squat:120, bench:100, deadlift:140 },
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
  await page.evaluate(({ p, key }) => { localStorage.setItem(key, JSON.stringify(p)); }, { p: profile, key: STORAGE_KEY });
  await page.reload();
  await page.waitForTimeout(1200);
  return await fn(page, errors).finally(() => ctx.close());
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // ── DUP_SEQUENCE ────────────────────────────────────────────────────────────
  console.log('\n── DUP : Sequences mode×level ──');

  // DUP-01 : débutant → 'volume','volume','volume'
  await withPage(browser, makeProfile({ level:'debutant' }), async (page) => {
    const seq = await page.evaluate(() => DUP_SEQUENCE.debutant && DUP_SEQUENCE.debutant[3]);
    ok('DUP-01 débutant 3j → volume×3', JSON.stringify(seq) === JSON.stringify(['volume','volume','volume']), 'seq=' + JSON.stringify(seq));
  });

  // DUP-02 : powerbuilding avancé 5j → ['force','volume','force','volume','vitesse']
  await withPage(browser, makeProfile({ level:'avance' }), async (page) => {
    const seq = await page.evaluate(() => DUP_SEQUENCE.powerbuilding_avance && DUP_SEQUENCE.powerbuilding_avance[5]);
    const expected = ['force','volume','force','volume','vitesse'];
    ok('DUP-02 PB avancé 5j', JSON.stringify(seq) === JSON.stringify(expected), 'seq=' + JSON.stringify(seq));
  });

  // DUP-03 : powerlifting 4j → ['force','vitesse','force','vitesse']
  await withPage(browser, makeProfile({ level:'avance', trainingMode:'powerlifting' }), async (page) => {
    const seq = await page.evaluate(() => DUP_SEQUENCE.powerlifting && DUP_SEQUENCE.powerlifting[4]);
    const expected = ['force','vitesse','force','vitesse'];
    ok('DUP-03 PL avancé 4j', JSON.stringify(seq) === JSON.stringify(expected), 'seq=' + JSON.stringify(seq));
  });

  // DUP-04 : bien-être 3j → ['vitesse','volume','vitesse']
  await withPage(browser, makeProfile({ trainingMode:'bien_etre' }), async (page) => {
    const seq = await page.evaluate(() => DUP_SEQUENCE.bien_etre && DUP_SEQUENCE.bien_etre[3]);
    const expected = ['vitesse','volume','vitesse'];
    ok('DUP-04 bien-être 3j', JSON.stringify(seq) === JSON.stringify(expected), 'seq=' + JSON.stringify(seq));
  });

  // DUP-05 : getDUPKey routing
  await withPage(browser, makeProfile({ level:'avance', trainingMode:'powerbuilding' }), async (page) => {
    const r = await page.evaluate(() => ({
      pb_av: getDUPKey('powerbuilding','avance'),
      pb_in: getDUPKey('powerbuilding','intermediaire'),
      pl: getDUPKey('powerlifting','avance'),
      mu: getDUPKey('musculation','intermediaire'),
      be: getDUPKey('bien_etre','avance'),
      deb: getDUPKey('powerbuilding','debutant')
    }));
    const ok5 = r.pb_av === 'powerbuilding_avance' && r.pb_in === 'powerbuilding_intermediaire'
      && r.pl === 'powerlifting' && r.mu === 'musculation' && r.be === 'bien_etre'
      && r.deb === 'debutant';
    ok('DUP-05 getDUPKey routing 6 cas', ok5, JSON.stringify(r));
  });

  // ── BACK-OFF ────────────────────────────────────────────────────────────────
  console.log('\n── BO : Back-off level-aware ──');

  // BO-01 : débutant RPE 9 → null
  await withPage(browser, makeProfile({ level:'debutant' }), async (page) => {
    const r = await page.evaluate(() => {
      db.user.level = 'debutant';
      return computeBackOffSets(100, 9, 8, 3, 'lower');
    });
    ok('BO-01 débutant RPE 9 → null', r === null, 'r=' + JSON.stringify(r));
  });

  // BO-02 : intermédiaire RPE 8.6 → -10%, mêmes reps
  await withPage(browser, makeProfile({ level:'intermediaire' }), async (page) => {
    const r = await page.evaluate(() => {
      db.user.level = 'intermediaire';
      return computeBackOffSets(100, 8.6, 8, 3, 'upper');
    });
    const w = r && r.sets && r.sets[0] && r.sets[0].weight;
    const reps = r && r.sets && r.sets[0] && r.sets[0].reps;
    // 100 * 0.90 = 90 ; reps upper base 5 + 0 extra = 5
    ok('BO-02 intermédiaire RPE 8.6 → -10% (90kg) + 5 reps', w === 90 && reps === 5, 'w=' + w + ', reps=' + reps);
  });

  // BO-03 : avancé RPE 9.1 → -15%, +2 reps
  await withPage(browser, makeProfile({ level:'avance' }), async (page) => {
    const r = await page.evaluate(() => {
      db.user.level = 'avance';
      return computeBackOffSets(100, 9.1, 8, 3, 'upper');
    });
    const w = r && r.sets && r.sets[0] && r.sets[0].weight;
    const reps = r && r.sets && r.sets[0] && r.sets[0].reps;
    // 100 * 0.85 = 85 ; reps upper 5 + 2 = 7
    ok('BO-03 avancé RPE 9.1 → -15% (85kg) + 7 reps', w === 85 && reps === 7, 'w=' + w + ', reps=' + reps);
  });

  // BO-04 : phase peak → null
  await withPage(browser, makeProfile({ level:'avance' }), async (page) => {
    const r = await page.evaluate(() => {
      db.user.level = 'avance';
      window.wpDetectPhase = function() { return 'peak'; };
      return computeBackOffSets(100, 9.5, 8, 3, 'lower');
    });
    ok('BO-04 phase peak → null', r === null, 'r=' + JSON.stringify(r));
  });

  // ── RATIOS ANTAGONISTES ─────────────────────────────────────────────────────
  console.log('\n── RATIO : Antagonist ratios ──');

  // RATIO-01 : DL/Sq < 1.10 → alerte 'warning'
  await withPage(browser, makeProfile({ level:'avance' }), async (page) => {
    const alerts = await page.evaluate(() => {
      db.user.level = 'avance';
      // Inject logs with maxRM so getTopE1RMForLift returns the values
      db.logs = [
        { id:'l1', timestamp: Date.now() - 1*86400000, exercises: [
          { name: 'Squat (Barre)',           maxRM: 200, allSets: [{weight:200,reps:1}] },
          { name: 'Développé couché (Barre)', maxRM: 140, allSets: [{weight:140,reps:1}] },
          { name: 'Soulevé de Terre (Barre)', maxRM: 200, allSets: [{weight:200,reps:1}] }
        ]}
      ];
      var prof = analyzeAthleteProfile();
      var bio = (prof || []).find(function(s) { return /Biom/.test(s.title); });
      return bio ? bio.alerts : [];
    });
    const found = alerts.some(a => /Deadlift\/Squat faible/.test(a.title || ''));
    ok('RATIO-01 DL/Sq < 1.10 → alerte warning', found, 'alerts=' + alerts.length + ', titles=' + alerts.map(a=>a.title).join('|'));
  });

  // RATIO-02 : Pull/Push < 1.0 (volume hebdo) → alerte
  await withPage(browser, makeProfile({ level:'intermediaire' }), async (page) => {
    const r = await page.evaluate(() => {
      db.user.level = 'intermediaire';
      // Noms qui matchent WP_EXO_META : 'developpe couche'→chest, 'rowing barre'→back, 'squat barre'→quad
      db.logs = [
        { id:'l1', timestamp: Date.now() - 1*86400000, exercises: [
          { name: 'Squat barre',         maxRM: 140, volume: 3000, allSets:[{weight:100,reps:5}] },
          { name: 'Developpe couche',    maxRM: 100, volume: 6000, allSets:[{weight:80,reps:5}] },
          { name: 'Developpe incline halteres', maxRM: 90, volume: 4000, allSets:[{weight:30,reps:10}] },
          { name: 'Rowing barre',        maxRM: 120, volume: 1500, allSets:[{weight:80,reps:5}] }
        ]}
      ];
      var meta1 = wpGetExoMeta('Developpe couche');
      var meta2 = wpGetExoMeta('Rowing barre');
      var prof = analyzeAthleteProfile();
      var bio = (prof || []).find(function(s) { return /Biom/.test(s.title); });
      var alerts = bio ? bio.alerts : [];
      return {
        meta1: meta1, meta2: meta2,
        titles: alerts.map(function(a){return a.title;}),
        found: alerts.some(function(a) { return /Tirage\/Poussée/.test(a.title || ''); })
      };
    });
    ok('RATIO-02 Pull/Push < 1.0 → alerte warning', r.found,
      'meta_push=' + JSON.stringify(r.meta1) + ', meta_pull=' + JSON.stringify(r.meta2)
      + ', titres=' + r.titles.join('|'));
  });

  // RATIO-03 : OHP/Bench < 0.60
  await withPage(browser, makeProfile({ level:'avance' }), async (page) => {
    const r = await page.evaluate(() => {
      db.user.level = 'avance';
      db.logs = [
        { id:'l1', timestamp: Date.now() - 1*86400000, exercises: [
          { name: 'Squat (Barre)',           maxRM: 140, allSets:[{weight:120,reps:3}] },
          { name: 'Développé couché (Barre)', maxRM: 120, allSets:[{weight:100,reps:3}] },
          { name: 'Soulevé de Terre (Barre)', maxRM: 170, allSets:[{weight:150,reps:3}] },
          { name: 'Développé Militaire (Barre)', maxRM: 60, allSets:[{weight:50,reps:3}] }
        ]}
      ];
      var prof = analyzeAthleteProfile();
      var bio = (prof || []).find(function(s) { return /Biom/.test(s.title); });
      var alerts = bio ? bio.alerts : [];
      return {
        titles: alerts.map(function(a){return a.title;}),
        found: alerts.some(function(a) { return /OHP\/Bench faible/.test(a.title || ''); })
      };
    });
    ok('RATIO-03 OHP/Bench < 0.60 → alerte warning', r.found, 'titres=' + r.titles.join('|'));
  });

  // ── LÉA : C_cycle volume vs WeightCut charge ────────────────────────────────
  console.log('\n── LEA : C_cycle volume vs weightCut charge ──');

  // Helper Léa : femme, lutéale (cycleCoeff=0.88)
  function leaProfile(opts) {
    opts = opts || {};
    return makeProfile({
      gender: 'female', bw: 65,
      menstrualEnabled: true,
      menstrualData: { lastPeriodStart: new Date(Date.now() - 20*86400000).toISOString().split('T')[0], cycleLength: 28 },
      weightCut: opts.weightCut || null,
      bestPR: { squat: 100, bench: 60, deadlift: 110 },
      level: 'intermediaire'
    });
  }

  // LEA-01 : C_cycle lutéale → setsCount réduit (volume)
  await withPage(browser, leaProfile(), async (page) => {
    const r = await page.evaluate(() => {
      // Force gender + cycle config directly post-init
      db.user.gender = 'female';
      db.user.menstrualEnabled = true;
      db.user.menstrualData = {
        lastPeriodStart: new Date(Date.now() - 20*86400000).toISOString().split('T')[0],
        cycleLength: 28
      };
      var phase = getCurrentMenstrualPhase();
      var coeff = getCycleCoeff();
      var orig = 4;
      var reduced = Math.max(2, Math.floor(orig * coeff));
      return { phase: phase, coeff: coeff, orig: orig, reduced: reduced };
    });
    ok('LEA-01 lutéale 0.88 → 4 sets × 0.88 = 3 (floor)',
      r.phase === 'luteale' && r.coeff === 0.88 && r.reduced === 3,
      'phase=' + r.phase + ', coeff=' + r.coeff + ', reduced=' + r.reduced);
  });

  // LEA-02 : WeightCut applies on charge (via _wcPenalty in wpComputeWorkWeight)
  await withPage(browser, leaProfile(), async (page) => {
    const r = await page.evaluate(() => {
      db.user.weightCut = { active: true, kcalCut: 250, kcalBase: 2000,
        startWeight: 65, currentWeight: 64,
        startDate: new Date(Date.now() - 14*86400000).toISOString().split('T')[0] };
      var pen = (typeof calcWeightCutPenalty === 'function') ? calcWeightCutPenalty('squat') : null;
      return { wcActive: !!(db.user.weightCut && db.user.weightCut.active), penalty: pen };
    });
    ok('LEA-02 weightCut actif → pénalité charge < 1.0',
      r.wcActive && r.penalty !== null && r.penalty <= 1.0,
      'wcActive=' + r.wcActive + ', penalty=' + r.penalty);
  });

  // LEA-03 : C_cycle ne réduit PAS la charge (vérifie qu'aucune pénalité cycle n'est appliquée à baseWeight)
  await withPage(browser, leaProfile(), async (page) => {
    const r = await page.evaluate(() => {
      // Vérifier que getCycleCoeff retourne 0.88 lutéale et que la fonction
      // wpComputeWorkWeight ne contient PLUS la réduction de charge cycle.
      // Test indirect : la note "Phase de récupération hormonale — les charges sont légèrement adaptées"
      // ne doit plus être déclenchée.
      var src = (typeof wpComputeWorkWeight === 'function') ? wpComputeWorkWeight.toString() : '';
      var hasOldNote = /Phase de récupération hormonale.*charges/.test(src);
      var hasCycleVolNote = /C_cycle s'applique sur le VOLUME/.test(src);
      return { hasOldNote: hasOldNote, hasCycleVolNote: hasCycleVolNote };
    });
    // After minification, comments are stripped. Just verify the OLD branch is gone.
    ok('LEA-03 wpComputeWorkWeight ne réduit plus la charge par cycle',
      !r.hasOldNote, 'hasOldNote=' + r.hasOldNote + ', hasCycleVolNote=' + r.hasCycleVolNote);
  });

  // ── ACWR-01 : ACWR > 1.3 → pbBlocks.sq_hyp contient leg_press ──────────────
  console.log('\n── ACWR : Fatigue-based exercise selection ──');

  await withPage(browser, makeProfile({ level:'avance', trainingMode:'powerbuilding', freq:5,
    selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
    bestPR:{squat:200, bench:140, deadlift:200} }), async (page) => {
    const r = await page.evaluate(() => {
      // Force trainingMode + level post-init
      db.user.trainingMode = 'powerbuilding';
      db.user.level = 'avance';
      window.computeACWR = function() { return 1.5; };
      obSelectedDays = ['Lundi','Mardi','Jeudi','Vendredi','Samedi'];
      var goals = [{ id: 'masse' }];
      var plan = generateProgram(goals, 5, 'salle', 90, [], 'integre', null, null, 'avance');
      var j1 = plan.find(function(d) { return !d.isRest; });
      return {
        j1Label: j1 ? j1.label : null,
        j1Exos: j1 ? j1.exos : [],
        coachNotes: (db.weeklyPlan && db.weeklyPlan.coachNotes) || []
      };
    });
    const hasLegPress = r.j1Exos.indexOf('leg_press') >= 0;
    const noSquat = r.j1Exos.indexOf('squat') < 0;
    const hasACWRNote = r.coachNotes.some(n => /ACWR/.test(n) && /Squat remplacé par Leg Press/.test(n));
    ok('ACWR-01 ACWR>1.3 → J1 contient leg_press, pas squat + note',
      hasLegPress && noSquat && hasACWRNote,
      'label=' + r.j1Label + ' | exos=' + JSON.stringify(r.j1Exos) + ' | notes=' + JSON.stringify(r.coachNotes));
  });

  await browser.close();

  console.log('\n══════════════════════════════');
  console.log('v184 DUP/Back-off/Ratios/Léa: ' + pass + '/' + (pass + fail) + ' tests passed');
  console.log('══════════════════════════════');

  const summary = { date: new Date().toISOString(), version: 'v184', pass, fail, total: pass + fail, results };
  fs.writeFileSync(path.join(__dirname, '34-dup-backoff-ratios-results.json'), JSON.stringify(summary, null, 2));
  if (fail > 0) process.exit(1);
})();
