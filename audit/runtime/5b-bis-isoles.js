/**
 * PHASE 5b bis — champs re-testés EN ISOLATION + champs injectés au runtime. OUTIL D'AUDIT.
 *
 * Deux échecs de la passe 5b sont suspects d'être des artefacts de MON test :
 *   - inputBW (#63) : inputBodyWeight (#19) écrit le MÊME chemin `user.bw` plus tard dans la passe
 *   - settingsDays (#88) : setSettingsFreq(5) exécuté juste avant réajuste selectedDays (app.js:18800-18808)
 * Ici chaque champ est testé dans une page NEUVE, sans voisin.
 * On couvre aussi les champs qui n'existent qu'après injection (barre, hybrid, cycle, weight cut).
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

async function isole(nom, mutProfil, sub, action, path, attendu) {
  const db = mutProfil ? mutProfil(profiles.build('aurel_like')) : profiles.build('aurel_like');
  const app = await H.openApp(db);
  const { page } = app;
  await H.gotoProfil(page, sub || 'tab-settings');
  await H.openAllAccordions(page);
  await page.waitForTimeout(400);
  const avant = H.get(await H.readPersisted(page), path);
  let err = null;
  try { await action(page); } catch (e) { err = e.message.split('\n')[0]; }
  await page.waitForTimeout(2800);
  const apres = H.get(await H.readPersisted(page), path);

  let reaffiche = '(non testé)';
  if (!err) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction('typeof db !== "undefined" && db !== null', null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    await H.gotoProfil(page, sub || 'tab-settings');
    await H.openAllAccordions(page);
    await page.waitForTimeout(400);
    reaffiche = JSON.stringify(H.get(await H.readPersisted(page), path));
  }
  const ok = !err && JSON.stringify(apres) === JSON.stringify(attendu) && reaffiche === JSON.stringify(attendu);
  const j = (v) => String(JSON.stringify(v));   // JSON.stringify(undefined) rend undefined, pas ''
  console.log((ok ? '  ✔ ' : '  ✘ ') + nom.padEnd(34)
    + 'avant=' + j(avant).slice(0, 22).padEnd(24)
    + 'après=' + j(apres).slice(0, 22).padEnd(24)
    + 'reload=' + String(reaffiche).slice(0, 22) + (err ? '  ERREUR: ' + err : ''));
  await app.close();
  return ok;
}

(async () => {
  console.log('# PHASE 5b bis — isolation + champs injectés\n');

  console.log('## Les 2 échecs de la passe 5b, re-testés seuls');
  await isole('#63 inputBW (seul)', null, 'tab-settings', async (p) => {
    await p.fill('#inputBW', '91.5'); await p.dispatchEvent('#inputBW', 'change');
  }, 'user.bw', 91.5);

  // settingsDays : assertion explicite « un jour ABSENT est ajouté et survit au reload »
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    const cur = await page.evaluate(() => ((db.user.programParams || {}).selectedDays || []).slice());
    const cible = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].find((d) => !cur.includes(d));
    await page.locator('#settingsDays button[onclick*="toggleSettingsDay(\'' + cible + '\'"]').first().click();
    await page.waitForTimeout(2800);
    const apres = H.get(await H.readPersisted(page), 'user.programParams.selectedDays');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction('typeof db !== "undefined" && db !== null', null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    const rel = H.get(await H.readPersisted(page), 'user.programParams.selectedDays');
    const ok = (apres || []).includes(cible) && (rel || []).includes(cible);
    console.log((ok ? '  ✔ ' : '  ✘ ') + ('#88 ajout du jour « ' + cible + ' »').padEnd(34)
      + 'avant=' + JSON.stringify(cur).slice(0, 30) + '  après=' + JSON.stringify(apres).slice(0, 30)
      + '  reload=' + JSON.stringify(rel).slice(0, 30));
    await app.close();
  }

  console.log('\n## Champs injectés au runtime');
  // settings-bar-weight est un <select> (app.js:18296), pas un <input>
  await isole('#172 settings-bar-weight', null, 'tab-settings', async (p) => {
    await p.selectOption('#settings-bar-weight', '15');
  }, 'user.barWeight', 15);

  await isole('#174 toggle-hybrid', null, 'tab-settings', async (p) => {
    await p.evaluate(() => { const el = document.getElementById('toggle-hybrid');
      el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
  }, 'user.hybridAthlete', true);

  console.log('\n## Profil FEMME — les deux UI cycle');
  const femme = (db) => { db.user.gender = 'female'; return db; };
  await isole('#77 settingsCycleEnabled (UI n°1)', femme, 'tab-settings', async (p) => {
    await p.evaluate(() => { const el = document.getElementById('settingsCycleEnabled');
      el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
  }, 'user.cycleTracking.enabled', true);

  await isole('#161 toggleMenstrualTracking (UI n°2)', femme, 'tab-settings', async (p) => {
    const b = p.locator('#settingsMenstrualSection button[onclick*="toggleMenstrualTracking"]').first();
    await b.scrollIntoViewIfNeeded();
    await b.click({ timeout: 8000 });
  }, 'user.menstrualEnabled', true);

  // Le point décisif de F6 : activer l'UI n°1 pose-t-il menstrualEnabled ?
  console.log('\n## F6 — activer « 🌙 Optimisation hormonale » (UI n°1) pose-t-il menstrualEnabled ?');
  {
    const app = await H.openApp(femme(profiles.build('aurel_like')));
    const { page } = app;
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    await page.waitForTimeout(300);
    await page.evaluate(() => { const el = document.getElementById('settingsCycleEnabled');
      el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(500);   // toggleCycleTracking dévoile settingsCycleDetails
    await page.fill('#settingsCycleLastDate', '2026-07-10');
    await page.dispatchEvent('#settingsCycleLastDate', 'change');
    await page.waitForTimeout(2800);
    const st = await page.evaluate(() => ({
      cycleTrackingEnabled: db.user.cycleTracking && db.user.cycleTracking.enabled,
      lastPeriodDate: db.user.cycleTracking && db.user.cycleTracking.lastPeriodDate,
      menstrualEnabled: db.user.menstrualEnabled,
      menstrualData: db.user.menstrualData,
      getCycleCoeff: typeof getCycleCoeff === 'function' ? getCycleCoeff() : '(absent)',
      phase: typeof getCurrentMenstrualPhase === 'function' ? getCurrentMenstrualPhase() : '(absent)',
      modifSRS: typeof getCyclePhaseModifier === 'function' ? getCyclePhaseModifier() : '(absent)',
      mrv: typeof getMRVWithCycleAdjust === 'function' ? getMRVWithCycleAdjust(20) : '(absent)',
    }));
    console.log('   ' + JSON.stringify(st, null, 0));
    console.log('   → getCycleCoeff = ' + st.getCycleCoeff + (st.getCycleCoeff === 1 ? '  (aucun ajustement de volume)' : ''));
    console.log('   → getMRVWithCycleAdjust(20) = ' + st.mrv + (st.mrv === 20 ? '  (MRV inchangé)' : ''));
    console.log('   → modificateur SRS = ' + st.modifSRS + (st.modifSRS !== 0 ? '  (celui-ci RÉAGIT)' : ''));
    await app.close();
  }

  console.log('\n## Profil WEIGHT CUT actif — la section devient-elle éditable ?');
  const wc = (db) => { db.user.weightCut = { active: true, startWeight: 100, targetWeight: 93,
    currentWeight: 98, competitionDate: '2026-09-15' }; return db; };
  await isole('#168 wc-current-weight', wc, 'tab-settings', async (p) => {
    await p.fill('#wc-current-weight', '96.2'); await p.dispatchEvent('#wc-current-weight', 'change');
    await p.locator('button[onclick*="saveWeightCutData"]').first().click();
  }, 'user.weightCut.currentWeight', 96.2);
  await isole('#170 toggle-creatine', wc, 'tab-settings', async (p) => {
    await p.evaluate(() => { const el = document.getElementById('toggle-creatine');
      el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
  }, 'user.takesCreatine', true);

  console.log('\n## #81 settingsInjuriesList (l\'AUTRE UI blessures) et son étanchéité avec #96');
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    await page.waitForTimeout(300);
    await page.selectOption('#settingsInjuriesList select', { index: 2 }); // Niveau 2 sur la 1re zone (genou)
    await page.waitForTimeout(2800);
    const st = await page.evaluate(() => ({
      userInjuries: db.user.injuries,
      paramsInjuries: (db.user.programParams || {}).injuries || [],
      boutonGenouxActif: !!document.querySelector('#settingsInjuries button[onclick*="Genoux"]')
        && document.querySelector('#settingsInjuries button[onclick*="Genoux"]').classList.contains('active'),
    }));
    console.log('   db.user.injuries            = ' + JSON.stringify(st.userInjuries));
    console.log('   db.user.programParams.injuries = ' + JSON.stringify(st.paramsInjuries));
    console.log('   bouton « Genoux » de l\'UI n°2 allumé ? ' + st.boutonGenouxActif);
    await app.close();
  }
})().catch((e) => { console.error('ECHEC 5b-bis:', e.stack); process.exit(1); });
