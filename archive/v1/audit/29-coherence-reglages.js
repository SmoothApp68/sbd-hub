// audit/29-coherence-reglages.js — Tests SETTINGS-01..10 — Cohérence Réglages v179
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8787/sbd-hub/index.html';

// Powerbuilder intermédiaire avec injuries + goals multi
const P_BASE = {
  user: {
    name:'TestSettings', age:28, bw:80, height:178, gender:'male',
    trainingMode:'powerbuilding', onboardingProfile:'intermediaire',
    level:'intermediaire', onboarded:true, onboardingVersion: 99,
    programParams: { freq:5, duration:90, level:'intermediaire',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      mat:'salle', injuries:[], cardio:'integre', goals:['force','seche'] },
    barWeight:20, units:'kg', coachProfile:'full',
    vocabLevel:2, lpActive:false, lpStrikes:{},
    _activityMigrated:true, _injuryMigrated:false,
    consentHealth:true, medicalConsent:true,
    onboardingPRs: { squat:120, bench:90, deadlift:150 }
  },
  logs:[], exercises:{'Squat (Barre)':{e1rm:130}}, bestPR:{squat:120,bench:90,deadlift:150},
  weeklyPlan:null, routine:null,
  social:{onboardingCompleted:true},
  _magicStartDone:true, activityLogs:[], earnedBadges:{}, xpHighWaterMark:0
};

// Variant : trainingMode null (pour vérifier le fallback)
const P_NO_MODE = JSON.parse(JSON.stringify(P_BASE));
P_NO_MODE.user.trainingMode = null;

// Variant : maison-only (pas de barbell)
const P_MAISON = JSON.parse(JSON.stringify(P_BASE));

// Variant : injuries déjà accentuées (pour tester la migration)
const P_LEGACY_INJ = JSON.parse(JSON.stringify(P_BASE));
P_LEGACY_INJ.user.programParams.injuries = ['Épaules','Genoux'];
P_LEGACY_INJ.user._injuryMigrated = false;

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
  console.log('  AUDIT 29 — Cohérence Réglages → Algo — Tests SETTINGS-01..10');
  console.log('══════════════════════════════════════════════════════════\n');

  // ── SETTINGS-01 ──────────────────────────────────────────
  // Blessure "Épaules" → normalisée en "epaules" dans programParams
  console.log('— SETTINGS-01 : toggleSettingsInjury normalise vers "epaules" —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      if (typeof toggleSettingsInjury !== 'function') return { err: 'toggleSettingsInjury not defined' };
      // Faux bouton DOM
      var btn = document.createElement('button');
      btn.classList = { toggle: function() {} };
      btn.style = {};
      // Stub minimum
      btn.classList = { toggle: () => {} };
      // Stub plus solide
      var fakeBtn = { classList: { toggle: () => {} }, style: {} };
      toggleSettingsInjury('Épaules', fakeBtn);
      return {
        injuries: (db.user.programParams.injuries || []).slice(),
        normalized: typeof _normalizeInjuryZone === 'function' ? _normalizeInjuryZone('Épaules') : null
      };
    });
    ok('SETTINGS-01 injuries=["epaules"] (lowercase ASCII)',
       Array.isArray(r.injuries) && r.injuries.length === 1 && r.injuries[0] === 'epaules',
       'injuries=' + JSON.stringify(r.injuries));
    ok('SETTINGS-01b _normalizeInjuryZone("Épaules") = "epaules"',
       r.normalized === 'epaules', 'got=' + r.normalized);
  });

  // ── SETTINGS-02 ──────────────────────────────────────────
  // WP_INJURY_EXCLUSIONS["epaules"] retourne des exercices exclus
  console.log('— SETTINGS-02 : WP_INJURY_EXCLUSIONS["epaules"] non vide —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      if (typeof WP_INJURY_EXCLUSIONS === 'undefined') return { err: 'WP_INJURY_EXCLUSIONS undefined' };
      var fakeBtn = { classList: { toggle: () => {} }, style: {} };
      toggleSettingsInjury('Épaules', fakeBtn);
      // Récupérer les exos exclus pour cette zone (après normalisation)
      var excludedExos = WP_INJURY_EXCLUSIONS['epaules'] || [];
      return {
        excluded: excludedExos,
        injuriesNormalized: db.user.programParams.injuries
      };
    });
    ok('SETTINGS-02 WP_INJURY_EXCLUSIONS["epaules"] retourne ≥3 exos',
       Array.isArray(r.excluded) && r.excluded.length >= 3,
       'count=' + (r.excluded || []).length);
  });

  // ── SETTINGS-03 ──────────────────────────────────────────
  // filtMat avec mat="salle" → exos barre inclus
  console.log('— SETTINGS-03 : filtMat("salle") inclut les exos barre —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      if (typeof filtMat !== 'function') return { err: 'filtMat undefined' };
      var ids = ['squat','bench','deadlift'];
      var out = filtMat(ids, 'salle');
      // Tous les ids de barbell devraient passer
      return { input: ids, output: out };
    });
    ok('SETTINGS-03 filtMat("salle") garde les 3 exos barre',
       Array.isArray(r.output) && r.output.length === 3
       && r.output.indexOf('squat') >= 0 && r.output.indexOf('bench') >= 0,
       'output=' + JSON.stringify(r.output));
  });

  // ── SETTINGS-04 ──────────────────────────────────────────
  // Wizard equipment barbell → mat="salle" dans programParams après pbGenerateProgram
  console.log('— SETTINGS-04 : Wizard equipment → mat="salle" persisté —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      _pbState.days = 4;
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.equipment = ['barbell','dumbbell','machine','cable'];
      _pbState.goal = 'mixte';
      _pbState.duration = 60;
      _pbState.level = 'intermediaire';
      pbGenerateProgram();
      return {
        mat: db.user.programParams.mat,
        trainingMode: db.user.trainingMode
      };
    });
    ok('SETTINGS-04 programParams.mat = "salle"',
       r.mat === 'salle', 'mat=' + r.mat);
  });

  // ── SETTINGS-05 ──────────────────────────────────────────
  // trainingMode null → renderSettingsProfile affiche "powerbuilding"
  console.log('— SETTINGS-05 : trainingMode null → fallback "powerbuilding" —');
  await withPage(browser, P_NO_MODE, async (page) => {
    const r = await page.evaluate(() => {
      // Simule renderSettingsProfile() : crée un select factice dans le DOM
      var el = document.getElementById('settingsTrainingMode');
      if (!el) {
        el = document.createElement('select');
        el.id = 'settingsTrainingMode';
        ['musculation','powerbuilding','powerlifting','bien_etre'].forEach(function(v) {
          var o = document.createElement('option'); o.value = v; el.appendChild(o);
        });
        document.body.appendChild(el);
      }
      if (typeof renderSettingsProfile === 'function') {
        try { renderSettingsProfile(); } catch(e) {}
      }
      return { value: el.value, dbMode: db.user.trainingMode };
    });
    ok('SETTINGS-05 settingsTrainingMode.value = "powerbuilding"',
       r.value === 'powerbuilding', 'value=' + r.value + ' dbMode=' + r.dbMode);
  });

  // ── SETTINGS-06 ──────────────────────────────────────────
  // Wizard mixte → trainingMode devient "powerbuilding"
  console.log('— SETTINGS-06 : Wizard mixte → trainingMode powerbuilding —');
  await withPage(browser, P_NO_MODE, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      _pbState.days = 4;
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.goal = 'mixte';
      pbGenerateProgram();
      return {
        mode: db.user.trainingMode,
        primaryGoal: (db.user.programParams.goals || [])[0]
      };
    });
    ok('SETTINGS-06 trainingMode="powerbuilding"',
       r.mode === 'powerbuilding', 'mode=' + r.mode);
    ok('SETTINGS-06b primary goal = "masse" (powerbuilding=force+volume)',
       r.primaryGoal === 'masse', 'goal=' + r.primaryGoal);
  });

  // ── SETTINGS-07 ──────────────────────────────────────────
  // Wizard force → trainingMode devient "powerlifting"
  console.log('— SETTINGS-07 : Wizard force → trainingMode powerlifting —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      _pbState.days = 4;
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.goal = 'force';
      pbGenerateProgram();
      return {
        mode: db.user.trainingMode,
        primaryGoal: (db.user.programParams.goals || [])[0]
      };
    });
    ok('SETTINGS-07 trainingMode="powerlifting"',
       r.mode === 'powerlifting', 'mode=' + r.mode);
    ok('SETTINGS-07b primary goal = "force"',
       r.primaryGoal === 'force', 'goal=' + r.primaryGoal);
  });

  // ── SETTINGS-08 ──────────────────────────────────────────
  // pbStartGuided pré-sélectionne le goal selon le trainingMode actuel
  console.log('— SETTINGS-08 : pbStartGuided pré-sélectionne le goal selon trainingMode —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      // P_BASE.trainingMode = 'powerbuilding' → goal devrait être 'mixte'
      pbStartGuided();
      var goalAfterPb = _pbState.goal;
      // Maintenant changer trainingMode et relancer
      db.user.trainingMode = 'powerlifting';
      pbStartGuided();
      var goalAfterPl = _pbState.goal;
      // Et bien_etre
      db.user.trainingMode = 'bien_etre';
      pbStartGuided();
      var goalAfterBe = _pbState.goal;
      return { pb: goalAfterPb, pl: goalAfterPl, be: goalAfterBe };
    });
    ok('SETTINGS-08a powerbuilding → goal=mixte',
       r.pb === 'mixte', 'goal=' + r.pb);
    ok('SETTINGS-08b powerlifting → goal=force',
       r.pl === 'force', 'goal=' + r.pl);
    ok('SETTINGS-08c bien_etre → goal=remise_en_forme',
       r.be === 'remise_en_forme', 'goal=' + r.be);
  });

  // ── SETTINGS-09 ──────────────────────────────────────────
  // goals existants ["force","seche"] → après wizard force → ["force","seche"] (seche conservé)
  console.log('— SETTINGS-09 : Goals secondaires (seche) préservés —');
  await withPage(browser, P_BASE, async (page) => {
    const r = await page.evaluate(() => {
      // P_BASE a goals=['force','seche']
      pbStartGuided();
      _pbState.days = 4;
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.goal = 'force';
      pbGenerateProgram();
      return {
        goals: (db.user.programParams.goals || []).slice()
      };
    });
    ok('SETTINGS-09 goals après wizard contient "seche"',
       Array.isArray(r.goals) && r.goals.indexOf('seche') >= 0,
       'goals=' + JSON.stringify(r.goals));
    ok('SETTINGS-09b goal principal "force" présent',
       Array.isArray(r.goals) && r.goals.indexOf('force') >= 0 && r.goals[0] === 'force',
       'goals=' + JSON.stringify(r.goals));
  });

  // ── SETTINGS-10 ──────────────────────────────────────────
  // 0 erreur console critique pendant le flux complet
  console.log('— SETTINGS-10 : 0 erreur console critique —');
  await withPage(browser, P_BASE, async (page, errors) => {
    await page.evaluate(() => {
      // Migration injuries
      if (typeof migrateInjuryNames === 'function') migrateInjuryNames();
      // Toggle injury
      var fakeBtn = { classList: { toggle: () => {} }, style: {} };
      if (typeof toggleSettingsInjury === 'function') toggleSettingsInjury('Épaules', fakeBtn);
      // Wizard
      pbStartGuided();
      _pbState.days = 4;
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.goal = 'mixte';
      pbGenerateProgram();
      // Plan
      if (typeof generateWeeklyPlan === 'function') generateWeeklyPlan();
    });
    await page.waitForTimeout(800);
    ok('SETTINGS-10 0 erreur console pendant flux complet',
       errors.length === 0, errors.length ? 'errors=' + errors.slice(0, 3).join(' | ') : 'OK');
  });

  // ── SETTINGS-11 (bonus) ──────────────────────────────────
  // Migration : injuries=["Épaules","Genoux"] → ["epaules","genoux"]
  console.log('— SETTINGS-11 : migrateInjuryNames normalise les injuries legacy —');
  await withPage(browser, P_LEGACY_INJ, async (page) => {
    const r = await page.evaluate(() => {
      if (typeof migrateInjuryNames === 'function') migrateInjuryNames();
      return {
        injuries: (db.user.programParams.injuries || []).slice(),
        migrated: !!db.user._injuryMigrated
      };
    });
    ok('SETTINGS-11 injuries normalisées en lowercase ASCII',
       Array.isArray(r.injuries) && r.injuries.indexOf('epaules') >= 0
       && r.injuries.indexOf('genoux') >= 0
       && r.injuries.indexOf('Épaules') < 0,
       'injuries=' + JSON.stringify(r.injuries));
    ok('SETTINGS-11b _injuryMigrated=true',
       r.migrated === true, 'flag=' + r.migrated);
  });

  await browser.close();

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RÉSULTATS : ' + pass + '/' + (pass + fail) + '  (' + Math.round(pass / (pass + fail) * 100) + ' %)');
  console.log('══════════════════════════════════════════════════════════\n');

  fs.writeFileSync(path.join(__dirname, '29-coherence-reglages-results.json'),
    JSON.stringify({ pass, fail, total: pass + fail, results }, null, 2));

  process.exit(fail ? 1 : 0);
})();
