// audit/28-programme-audit.js — Tests PROG-01..PROG-12 — Génération Programme v178
// Playwright headless Chrome 1194

const { chromium } = require('playwright');
const path = require('path');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE   = 'http://localhost:8787/sbd-hub/index.html';

// Profile powerbuilder intermédiaire pour tester génération
const P_PROG = {
  user: {
    name:'TestProg', age:28, bw:80, height:178, gender:'male',
    trainingMode:'powerbuilding', onboardingProfile:'intermediaire',
    level:'intermediaire', onboarded:true,
    programParams: { freq:5, duration:90, level:'intermediaire',
      selectedDays:['Lundi','Mardi','Jeudi','Vendredi','Samedi'],
      mat:'salle' },
    barWeight:20, units:'kg', coachProfile:'full',
    vocabLevel:2, lpActive:false, lpStrikes:{}, _activityMigrated:true,
    consentHealth:true, medicalConsent:true, injuries:[],
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
  await page.waitForTimeout(1200);
  await fn(page, errors, ctx);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  AUDIT 28 — Génération Programme — Tests PROG-01 à PROG-12');
  console.log('══════════════════════════════════════════════════════════\n');

  // ── PROG-01 — Wizard étape 1 = nb de jours ──────────────────────────
  console.log('— PROG-01 : Wizard étape 1 = nombre de jours —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      if (typeof pbStartGuided !== 'function') return { err: 'pbStartGuided not defined' };
      pbStartGuided();
      var s = _pbState;
      // Render to a hidden div
      var div = document.createElement('div'); div.id = '_test_pb_div';
      document.body.appendChild(div);
      if (typeof renderProgramBuilderStep === 'function') {
        renderProgramBuilderStep(div);
      }
      return {
        step: s.step,
        days: s.days,
        hasSelectedDays: Array.isArray(s.selectedDays),
        hasQuestion: div.innerHTML.indexOf('Combien de jours') >= 0
      };
    });
    ok('PROG-01 Wizard step=1 + question "Combien de jours par semaine ?"',
      r && r.step === 1 && r.hasQuestion,
      r ? 'step=' + r.step + ' selectedDays=' + r.hasSelectedDays + ' hasQuestion=' + r.hasQuestion : r.err);
  });

  // ── PROG-02 — Après choix 6 → étape 2 affiche jours ──────────────────
  console.log('\n— PROG-02 : Choix 6 jours → étape 2 affiche le sélecteur de jours —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      pbSetDaysAndAdvance(6);
      var s = _pbState;
      var div = document.createElement('div'); div.id = '_test_pb_div';
      document.body.appendChild(div);
      renderProgramBuilderStep(div);
      return {
        step: s.step,
        days: s.days,
        selectedDaysCount: s.selectedDays ? s.selectedDays.length : 0,
        hasQuelsJours: div.innerHTML.indexOf('Quels jours') >= 0
      };
    });
    ok('PROG-02a step=2 après pbSetDaysAndAdvance(6)',
      r && r.step === 2,
      r ? 'step=' + r.step : 'N/A');
    ok('PROG-02b étape 2 affiche "Quels jours t\'entraînes-tu"',
      r && r.hasQuelsJours,
      r ? 'hasQuelsJours=' + r.hasQuelsJours : 'absent');
    ok('PROG-02c selectedDays pré-rempli avec 6 jours par défaut',
      r && r.selectedDaysCount === 6,
      r ? 'count=' + r.selectedDaysCount : 'N/A');
  });

  // ── PROG-03 — Bouton "Continuer" bloqué si mauvais nombre ────────────
  console.log('\n— PROG-03 : Bouton "Continuer" bloqué si mauvais nombre de jours —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      pbSetDaysAndAdvance(4); // 4 jours
      // Décocher 1 jour pour avoir 3 sélectionnés au lieu de 4
      pbToggleDay(_pbState.selectedDays[0]);
      var div = document.createElement('div'); div.id = '_test_pb_div';
      document.body.appendChild(div);
      renderProgramBuilderStep(div);
      var hasContinue = div.innerHTML.includes('Continuer');
      var selCount = _pbState.selectedDays.length;
      return { selCount, neededCount: _pbState.days, hasContinue };
    });
    ok('PROG-03a 3/4 sélectionnés → bouton Continuer absent',
      r && r.selCount === 3 && !r.hasContinue,
      r ? 'sel=' + r.selCount + '/' + r.neededCount + ' continueBtn=' + r.hasContinue : 'N/A');

    // Maintenant ajouter un jour pour atteindre 4/4
    const r2 = await page.evaluate(() => {
      var allDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
      var notSelected = allDays.find(d => _pbState.selectedDays.indexOf(d) < 0);
      pbToggleDay(notSelected);
      var div = document.getElementById('_test_pb_div');
      renderProgramBuilderStep(div);
      return {
        selCount: _pbState.selectedDays.length,
        hasContinue: div.innerHTML.includes('Continuer')
      };
    });
    ok('PROG-03b 4/4 sélectionnés → bouton Continuer apparaît',
      r2 && r2.selCount === 4 && r2.hasContinue,
      r2 ? 'sel=' + r2.selCount + ' continueBtn=' + r2.hasContinue : 'N/A');
  });

  // ── PROG-04 — Jours choisis → pbGenerateProgram utilise CES jours ────
  console.log('\n— PROG-04 : Jours choisis → pbGenerateProgram utilise ces jours —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      pbSetDaysAndAdvance(3);
      // Sélectionner exactement Mardi/Jeudi/Samedi (override les défauts)
      _pbState.selectedDays = ['Mardi','Jeudi','Samedi'];
      _pbState.step = 6;
      _pbState.goal = 'mixte';
      _pbState.duration = 60;
      _pbState.level = 'intermediaire';
      pbGenerateProgram();
      return {
        savedDays: db.user.programParams.selectedDays,
        savedFreq: db.user.programParams.freq,
        windowDays: window.obSelectedDays,
        hasGenerated: !!db.generatedProgram
      };
    });
    ok('PROG-04a programParams.selectedDays = [Mardi,Jeudi,Samedi]',
      r && r.savedDays && r.savedDays.length === 3 &&
      r.savedDays.indexOf('Mardi') >= 0 && r.savedDays.indexOf('Jeudi') >= 0 && r.savedDays.indexOf('Samedi') >= 0 &&
      r.savedDays.indexOf('Lundi') < 0 && r.savedDays.indexOf('Mercredi') < 0,
      r ? JSON.stringify(r.savedDays) : 'N/A');
    ok('PROG-04b programParams.freq sauvegardé = 3',
      r && r.savedFreq === 3,
      r ? 'freq=' + r.savedFreq : 'N/A');
    ok('PROG-04c window.obSelectedDays alimentée avec ces jours',
      r && r.windowDays && r.windowDays.indexOf('Mardi') >= 0 && r.windowDays.indexOf('Lundi') < 0,
      r ? JSON.stringify(r.windowDays) : 'N/A');
  });

  // ── PROG-05 — Programme généré → routine contient les bons jours ─────
  console.log('\n— PROG-05 : Routine contient les jours sélectionnés —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      pbSetDaysAndAdvance(4);
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi'];
      _pbState.step = 6;
      _pbState.goal = 'force';
      _pbState.duration = 75;
      _pbState.level = 'intermediaire';
      pbGenerateProgram();
      var routine = db.routine || {};
      return {
        lundi: routine['Lundi'] || '',
        mardi: routine['Mardi'] || '',
        mercredi: routine['Mercredi'] || '',
        jeudi: routine['Jeudi'] || '',
        vendredi: routine['Vendredi'] || '',
        samedi: routine['Samedi'] || '',
        dimanche: routine['Dimanche'] || ''
      };
    });
    ok('PROG-05a Lundi entraîné (non Repos)',
      r && r.lundi && !/repos|😴/i.test(r.lundi),
      r ? 'Lundi="' + r.lundi + '"' : 'N/A');
    ok('PROG-05b Mercredi en Repos (non sélectionné)',
      r && (/repos|😴/i.test(r.mercredi) || !r.mercredi),
      r ? 'Mercredi="' + r.mercredi + '"' : 'N/A');
    ok('PROG-05c Dimanche en Repos (non sélectionné)',
      r && (/repos|😴/i.test(r.dimanche) || !r.dimanche),
      r ? 'Dimanche="' + r.dimanche + '"' : 'N/A');
  });

  // ── PROG-06 — Jours non sélectionnés → Repos ────────────────────────
  console.log('\n— PROG-06 : Jours non sélectionnés sont en Repos —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      pbSetDaysAndAdvance(2);
      _pbState.selectedDays = ['Mardi','Jeudi'];
      _pbState.step = 6;
      _pbState.goal = 'force';
      _pbState.duration = 60;
      _pbState.level = 'intermediaire';
      pbGenerateProgram();
      var prog = db.generatedProgram || [];
      var restDays = prog.filter(function(d) { return d.isRest; }).map(function(d) { return d.day; });
      var trainDays = prog.filter(function(d) { return !d.isRest; }).map(function(d) { return d.day; });
      return { restDays, trainDays, total: prog.length };
    });
    ok('PROG-06a generatedProgram a 7 jours',
      r && r.total === 7,
      r ? 'total=' + r.total : 'N/A');
    ok('PROG-06b 5 jours de repos (Lun/Mer/Ven/Sam/Dim)',
      r && r.restDays.length === 5,
      r ? 'rest=' + r.restDays.length + ' (' + r.restDays.join(',') + ')' : 'N/A');
    ok('PROG-06c 2 jours d\'entraînement (Mardi/Jeudi)',
      r && r.trainDays.length === 2 && r.trainDays.indexOf('Mardi') >= 0 && r.trainDays.indexOf('Jeudi') >= 0,
      r ? 'train=' + r.trainDays.join(',') : 'N/A');
  });

  // ── PROG-07 — selectedDays sauvegardé après génération ───────────────
  console.log('\n— PROG-07 : selectedDays sauvegardé dans programParams —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      pbStartGuided();
      pbSetDaysAndAdvance(5);
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi','Samedi'];
      _pbState.step = 6;
      _pbState.goal = 'mixte';
      _pbState.duration = 90;
      _pbState.level = 'avance';
      pbGenerateProgram();
      // Verify localStorage was synchronously updated
      var raw = localStorage.getItem('SBD_HUB_V29');
      var p = JSON.parse(raw);
      return {
        memDays: db.user.programParams.selectedDays,
        lsDays: p.user.programParams.selectedDays,
        memFreq: db.user.programParams.freq,
        memLevel: db.user.level
      };
    });
    ok('PROG-07a selectedDays mémoire = 5 jours',
      r && r.memDays.length === 5,
      r ? JSON.stringify(r.memDays) : 'N/A');
    ok('PROG-07b selectedDays localStorage = mêmes 5 jours',
      r && r.lsDays && r.lsDays.length === 5 &&
      r.lsDays.every(function(d, i) { return r.memDays[i] === d; }),
      r ? JSON.stringify(r.lsDays) : 'N/A');
    ok('PROG-07c db.user.level mis à jour',
      r && r.memLevel === 'avance',
      r ? 'level=' + r.memLevel : 'N/A');
  });

  // ── PROG-08 — generateWeeklyPlan respecte selectedDays ───────────────
  console.log('\n— PROG-08 : generateWeeklyPlan avec selectedDays Lun/Mar/Jeu/Ven/Sam → pas de Mer —');
  await withPage(browser, {
    ...P_PROG,
    user: {
      ...P_PROG.user,
      programParams: {
        ...P_PROG.user.programParams,
        freq: 5,
        selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi']
      }
    },
    routine: {
      Lundi: 'Push',
      Mardi: 'Pull',
      Jeudi: 'Legs',
      Vendredi: 'Push',
      Samedi: 'Pull'
    }
  }, async (page) => {
    const r = await page.evaluate(() => {
      if (typeof generateWeeklyPlan !== 'function') return { err: 'generateWeeklyPlan not defined' };
      try { generateWeeklyPlan(); } catch(e) { return { err: e.message }; }
      var plan = db.weeklyPlan;
      if (!plan || !plan.days) return { err: 'no plan generated' };
      var nameToDay = {};
      plan.days.forEach(function(d) { nameToDay[d.day] = d; });
      return {
        merIsRest: nameToDay['Mercredi'] ? !!nameToDay['Mercredi'].rest : null,
        dimIsRest: nameToDay['Dimanche'] ? !!nameToDay['Dimanche'].rest : null,
        lundiIsRest: nameToDay['Lundi'] ? !!nameToDay['Lundi'].rest : null,
        totalDays: plan.days.length
      };
    });
    if (r && r.err) {
      ok('PROG-08a generateWeeklyPlan() s\'exécute sans erreur', false, r.err);
      ok('PROG-08b Mercredi est en Repos', false, 'N/A');
    } else {
      ok('PROG-08a Mercredi est en Repos (non sélectionné)',
        r && r.merIsRest === true,
        r ? 'Mer.rest=' + r.merIsRest : 'N/A');
      ok('PROG-08b Dimanche est en Repos (non sélectionné)',
        r && r.dimIsRest === true,
        r ? 'Dim.rest=' + r.dimIsRest : 'N/A');
      ok('PROG-08c Lundi entraîné (sélectionné)',
        r && r.lundiIsRest === false,
        r ? 'Lundi.rest=' + r.lundiIsRest : 'N/A');
    }
  });

  // ── PROG-09 — Réglages: changer freq → selectedDays auto-ajusté ──────
  console.log('\n— PROG-09 : Réglages — changer freq auto-ajuste selectedDays —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      // Profile starts with freq=5 + 5 days
      var beforeDays = db.user.programParams.selectedDays.slice();
      // Simuler le clic sur "4j/sem" — le bouton appelle setSettingsFreq(4, btn)
      var fakeBtn = document.createElement('button');
      fakeBtn.classList.add('settings-toggle-btn');
      var container = document.createElement('div');
      container.id = 'settingsFreq';
      container.appendChild(fakeBtn);
      document.body.appendChild(container);
      if (typeof setSettingsFreq !== 'function') return { err: 'setSettingsFreq not defined' };
      setSettingsFreq(4, fakeBtn);
      return {
        beforeFreq: 5,
        beforeCount: beforeDays.length,
        afterFreq: db.user.programParams.freq,
        afterDays: db.user.programParams.selectedDays,
        afterCount: db.user.programParams.selectedDays.length
      };
    });
    ok('PROG-09a freq sauvegardé = 4',
      r && r.afterFreq === 4,
      r ? 'before=' + r.beforeFreq + ' after=' + r.afterFreq : r.err);
    ok('PROG-09b selectedDays trimé à 4 entrées',
      r && r.afterCount === 4,
      r ? 'count: ' + r.beforeCount + '→' + r.afterCount : 'N/A');
  });

  // ── PROG-10 — Régénérer après changement de jours respecte le choix ─
  console.log('\n— PROG-10 : Régénérer après changement → respecte les nouveaux jours —');
  await withPage(browser, P_PROG, async (page) => {
    const r = await page.evaluate(() => {
      // Changer vers Mer/Sam/Dim (jours inhabituels)
      db.user.programParams.selectedDays = ['Mercredi','Samedi','Dimanche'];
      db.user.programParams.freq = 3;
      db.routine = { Mercredi:'Push', Samedi:'Pull', Dimanche:'Legs' };
      db.weeklyPlan = null;
      try { generateWeeklyPlan(); } catch(e) { return { err: e.message }; }
      var plan = db.weeklyPlan;
      if (!plan || !plan.days) return { err: 'no plan' };
      var nameToDay = {};
      plan.days.forEach(function(d) { nameToDay[d.day] = d; });
      return {
        merRest: nameToDay['Mercredi'] ? nameToDay['Mercredi'].rest : null,
        samRest: nameToDay['Samedi'] ? nameToDay['Samedi'].rest : null,
        dimRest: nameToDay['Dimanche'] ? nameToDay['Dimanche'].rest : null,
        lunRest: nameToDay['Lundi'] ? nameToDay['Lundi'].rest : null
      };
    });
    if (r && r.err) {
      ok('PROG-10 generateWeeklyPlan respecte selectedDays inhabituels', false, r.err);
    } else {
      ok('PROG-10a Mercredi entraîné (sélectionné inhabituel)',
        r && r.merRest === false,
        r ? 'Mer.rest=' + r.merRest : 'N/A');
      ok('PROG-10b Samedi entraîné (sélectionné)',
        r && r.samRest === false,
        r ? 'Sam.rest=' + r.samRest : 'N/A');
      ok('PROG-10c Dimanche entraîné (sélectionné)',
        r && r.dimRest === false,
        r ? 'Dim.rest=' + r.dimRest : 'N/A');
      ok('PROG-10d Lundi en Repos (non sélectionné)',
        r && r.lunRest === true,
        r ? 'Lun.rest=' + r.lunRest : 'N/A');
    }
  });

  // ── PROG-11 — Default fallback évite Mercredi/Dimanche ───────────────
  console.log('\n— PROG-11 : Fallback par défaut évite Mercredi/Dimanche —');
  await withPage(browser, {
    ...P_PROG,
    user: {
      ...P_PROG.user,
      programParams: { freq: 4, duration: 60 } // pas de selectedDays
    },
    routine: { Lundi:'Push', Mardi:'Pull', Mercredi:'Legs', Jeudi:'Push' }
  }, async (page) => {
    const r = await page.evaluate(() => {
      delete db.user.programParams.selectedDays;
      try { generateWeeklyPlan(); } catch(e) { return { err: e.message }; }
      var plan = db.weeklyPlan;
      if (!plan) return { err: 'no plan' };
      var nameToDay = {};
      plan.days.forEach(function(d) { nameToDay[d.day] = d; });
      return {
        merRest: nameToDay['Mercredi'] ? nameToDay['Mercredi'].rest : null,
        jeuRest: nameToDay['Jeudi'] ? nameToDay['Jeudi'].rest : null,
        dimRest: nameToDay['Dimanche'] ? nameToDay['Dimanche'].rest : null
      };
    });
    if (r && r.err) {
      ok('PROG-11 fallback default évite Mer/Dim', false, r.err);
    } else {
      ok('PROG-11a fallback default → Mercredi en Repos (4 jours: Lun/Mar/Jeu/Ven)',
        r && r.merRest === true,
        r ? 'Mer.rest=' + r.merRest : 'N/A');
      ok('PROG-11b fallback default → Dimanche en Repos',
        r && r.dimRest === true,
        r ? 'Dim.rest=' + r.dimRest : 'N/A');
      ok('PROG-11c fallback default → Jeudi entraîné',
        r && r.jeuRest === false,
        r ? 'Jeu.rest=' + r.jeuRest : 'N/A');
    }
  });

  // ── PROG-12 — 0 erreur console pendant tout le flux ──────────────────
  console.log('\n— PROG-12 : 0 erreur console pendant tout le flux programme —');
  await withPage(browser, P_PROG, async (page, errors) => {
    await page.evaluate(() => {
      // Run full flow synchronously
      pbStartGuided();
      pbSetDaysAndAdvance(5);
      pbToggleDay('Mercredi'); // de-select default Lundi or other
      _pbState.selectedDays = ['Lundi','Mardi','Jeudi','Vendredi','Samedi'];
      _pbState.step = 3;
      _pbState.goal = 'mixte';
      _pbState.step = 4;
      _pbState.step = 5;
      _pbState.duration = 75;
      _pbState.step = 6;
      _pbState.level = 'intermediaire';
      pbGenerateProgram();
    });
    await page.waitForTimeout(400);
    ok('PROG-12 0 erreur console critique pendant flux complet',
      errors.length === 0,
      errors.length > 0 ? errors[0].substring(0,80) : '0 erreur');
  });

  // ── SUMMARY ───────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RÉSULTAT : ' + pass + '/' + (pass+fail) + ' (' + Math.round(pass/(pass+fail)*100) + '%)');
  console.log('══════════════════════════════════════════════════════════\n');

  await browser.close();

  const fs = require('fs');
  fs.writeFileSync(
    path.join(__dirname, '28-programme-audit-results.json'),
    JSON.stringify({ total: pass+fail, pass, fail, results }, null, 2)
  );
  process.exit(fail > 0 ? 1 : 0);
})();
