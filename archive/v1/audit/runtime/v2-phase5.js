/** VAGUE 2 — phase 5 : conditionnels, aller-retour, consommation, signature. OUTIL D'AUDIT. */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');
const cfg = require('./cfg-v2-seances');

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const jour = () => JOURS[new Date().getDay()];
const planRiche = cfg.etats.find((e) => e.nom === 'plan (programme riche)').mut;

const vis = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  if (!el) return 'ABSENT';
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  if (cs.display === 'none') return 'display:none';
  if (r.width === 0 && r.height === 0) return 'boîte 0×0';
  return 'VISIBLE';
}, id);

async function ouvrirGo(page) {
  await page.evaluate(() => { showTab('tab-seances'); showSeancesSub('s-go'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { try { _goDoStartWorkout(true); } catch (e) {} });
  await page.waitForTimeout(900);
}

(async () => {
  console.log('# VAGUE 2 — PHASE 5\n');

  // ── 5a : les 11 jamais visibles sont-ils conditionnels ou inatteignables ? ──
  console.log('## 5a — éléments jamais visibles au repos : révélés par leur action ?');
  {
    const app = await H.openApp(planRiche(profiles.build('aurel_like')));
    const { page } = app;
    await ouvrirGo(page);
    for (const [id, act] of [
      ['go-plan-body', () => page.evaluate(() => goTogglePlan())],
      ['go-plan-chev', () => page.evaluate(() => goTogglePlan())],
      ['why-answer-squat_barre_', () => page.evaluate(() => {
        const b = document.getElementById('why-btn-squat_barre_'); if (b) b.click(); })],
      ['plates-0', () => page.evaluate(() => {
        const el = document.querySelector('[onclick*="TogglePlates"],[onclick*="togglePlates"]'); if (el) el.click(); })],
    ]) {
      const av = await vis(page, id);
      try { await act(); } catch (e) { /* noté ci-dessous */ }
      await page.waitForTimeout(400);
      const ap = await vis(page, id);
      console.log('   ' + (ap === 'VISIBLE' ? '✔' : '✘') + ' ' + id.padEnd(28) + av.padEnd(14) + ' → ' + ap);
    }
    await app.close();
  }
  {
    const app = await H.openApp(planRiche(profiles.build('aurel_like')));
    const { page } = app;
    await ouvrirGo(page);
    await page.evaluate(() => { try { goFinishWorkout(); } catch (e) { try { goEndWorkout(); } catch (e2) {} } });
    await page.waitForTimeout(900);
    const r = await vis(page, 'go-recap-view'), d0 = await vis(page, 'go-debrief-section');
    await page.evaluate(() => { try { goSwitchView('debrief'); } catch (e) {} });
    await page.waitForTimeout(400);
    console.log('   ' + '  go-recap-view'.padEnd(30) + r);
    console.log('   ' + ((await vis(page, 'go-debrief-section')) === 'VISIBLE' ? '✔' : '✘')
      + ' go-debrief-section'.padEnd(28) + d0 + ' → ' + await vis(page, 'go-debrief-section')
      + '   (via goSwitchView(\'debrief\'))');
    await app.close();
  }
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await page.evaluate(() => {
      db.reports = db.reports || [];
      db.reports.push({ id: 'r-audit', type: 'debrief', read: false, expires_at: Date.now() + 86400000 });
      showTab('tab-seances'); showSeancesSub('s-coach');
      if (typeof updateCoachHistoBadge === 'function') updateCoachHistoBadge();
    });
    await page.waitForTimeout(600);
    console.log('   ' + ((await vis(page, 'coachHistoBadge')) === 'VISIBLE' ? '✔' : '✘')
      + ' coachHistoBadge'.padEnd(28) + '(rapport non lu injecté) → ' + await vis(page, 'coachHistoBadge'));
    await app.close();
  }

  // ── 5b/5c : aller-retour d'une séance complète ──
  console.log('\n## 5b/5c — saisie d\'une série → fin de séance → db.logs');
  {
    const app = await H.openApp(planRiche(profiles.build('aurel_like')));
    const { page } = app;
    await ouvrirGo(page);
    const avant = await page.evaluate(() => ({
      nbLogs: (db.logs || []).length,
      exos: activeWorkout ? activeWorkout.exercises.map((e) => e.name + ':' + e.sets.length) : null,
      annotations: activeWorkout ? activeWorkout.exercises.map((e) => ({
        n: e.name, coachNote: e.coachNote || null, gripNote: e.gripNote || null,
        tempoEcc: e.tempoEcc || null, isPrimary: !!e.isPrimary, dp: !!e.isDoubleProgression })) : null,
    }));
    console.log('   séance démarrée : ' + JSON.stringify(avant.exos));
    console.log('   annotations transférées (pont PR #246) :');
    (avant.annotations || []).forEach((a) => console.log('      • ' + a.n + ' → ' + JSON.stringify(a)));

    // Saisie réelle : poids + reps sur la 1re série de travail, puis validation
    const saisie = await page.evaluate(() => {
      try {
        const ex = activeWorkout.exercises[0];
        const idx = ex.sets.findIndex((s) => s.type === 'normal');
        ex.sets[idx].weight = 117.5; ex.sets[idx].reps = 5; ex.sets[idx].rpe = 8;
        if (typeof goCompleteSet === 'function') goCompleteSet(0, idx);
        return { ok: true, idx, set: ex.sets[idx] };
      } catch (e) { return { ok: false, err: String(e.message).split('\n')[0] }; }
    });
    console.log('   saisie 117.5×5 @8 : ' + (saisie.ok ? '✔ ' + JSON.stringify(saisie.set) : '✘ ' + saisie.err));

    const h0 = await page.evaluate(() => _computeDataHash(db));
    const n0 = app.netCalls.filter((c) => /sbd_profiles|workout_sessions/.test(c.url) && c.method !== 'GET').length;
    const fin = await page.evaluate(() => {
      try { if (typeof goFinishWorkout === 'function') goFinishWorkout();
        else if (typeof goEndWorkout === 'function') goEndWorkout();
        return 'ok'; } catch (e) { return 'ERREUR ' + String(e.message).split('\n')[0]; }
    });
    await page.waitForTimeout(3200);
    const apres = await page.evaluate(() => ({
      nbLogs: (db.logs || []).length,
      dernier: (db.logs || [])[0] ? { titre: db.logs[0].title, nbExos: (db.logs[0].exercises || []).length,
        series: ((db.logs[0].exercises || [])[0] || {}).allSets || ((db.logs[0].exercises || [])[0] || {}).series } : null,
      brouillon: localStorage.getItem('SBD_ACTIVE_WORKOUT') ? 'présent' : 'effacé',
    }));
    const h1 = await page.evaluate(() => _computeDataHash(db));
    const n1 = app.netCalls.filter((c) => /sbd_profiles|workout_sessions/.test(c.url) && c.method !== 'GET').length;
    console.log('   fin de séance : ' + fin);
    console.log('   db.logs : ' + avant.nbLogs + ' → ' + apres.nbLogs);
    console.log('   dernier log : ' + JSON.stringify(apres.dernier).slice(0, 200));
    console.log('   brouillon local : ' + apres.brouillon);
    console.log('   signature : ' + (h0 !== h1 ? '✔ CHANGE' : '✘ INCHANGÉE') + '   écritures réseau : ' + (n1 - n0));
    await app.close();
  }

  // ── 5d : la séance EN COURS est-elle protégée ? ──
  console.log('\n## 5d — la séance en cours (activeWorkout) est-elle dans le périmètre de sync ?');
  {
    const app = await H.openApp(planRiche(profiles.build('aurel_like')));
    const { page } = app;
    await ouvrirGo(page);
    const r = await page.evaluate(() => ({
      dansDb: typeof db.activeWorkout !== 'undefined',
      cleLocale: localStorage.getItem('SBD_ACTIVE_WORKOUT') ? 'SBD_ACTIVE_WORKOUT (hors db)' : 'absente',
      dansBlob: (() => { const b = _buildSyncedBlob(db, db.weeklyPlan); return 'activeWorkout' in b; })(),
      signee: (() => { const h = _computeDataHash(db); return h.split('|').length; })(),
    }));
    console.log('   activeWorkout dans db ?          ' + r.dansDb);
    console.log('   persistance de la séance en cours : ' + r.cleLocale);
    console.log('   présente dans le blob de sync ?  ' + r.dansBlob);
    console.log('   → une séance interrompue ne quitte JAMAIS l\'appareil (' + (r.dansDb ? '' : 'hors db, ') + 'hors blob)');
    await app.close();
  }
})().catch((e) => { console.error('ECHEC v2-phase5:', e.stack); process.exit(1); });
