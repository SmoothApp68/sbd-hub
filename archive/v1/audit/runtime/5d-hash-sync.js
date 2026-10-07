/**
 * PHASE 5d — PERSISTANCE CLOUD (sans réseau réel). OUTIL D'AUDIT.
 *
 * `syncToCloud` court-circuite sur signature inchangée (supabase.js:499-501) :
 *     var _hash = _computeDataHash(db);
 *     if (db._lastSyncHash === _hash) { updateSyncStatus('sync'); return; }
 * Un champ non signé ne déclenche donc AUCUN push. Ce script mesure, pour chaque
 * écriture de l'onglet Profil : (a) la signature bouge-t-elle ? (b) une requête
 * d'écriture part-elle vers sbd_profiles ? Le réseau est stubbé : on compte les
 * tentatives interceptées, rien ne sort.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const hash = (page) => page.evaluate(() =>
  (typeof _computeDataHash === 'function' ? _computeDataHash(db) : '(absent)'));

async function mesure(nom, action, opts) {
  opts = opts || {};
  const app = await H.openApp(profiles.build('aurel_like'));
  const { page } = app;
  await H.gotoProfil(page, opts.sub || 'tab-settings');
  await H.openAllAccordions(page);
  await page.waitForTimeout(500);

  const h0 = await hash(page);
  const n0 = app.netCalls.filter((c) => /sbd_profiles/.test(c.url) && c.method !== 'GET').length;
  await action(page);
  await page.waitForTimeout(3200);   // debounce saveDB (2 s) + debounce sync
  const h1 = await hash(page);
  const n1 = app.netCalls.filter((c) => /sbd_profiles/.test(c.url) && c.method !== 'GET').length;

  const change = h0 !== h1;
  console.log('  ' + (change ? '✔' : '✘') + ' ' + nom.padEnd(46)
    + 'signature ' + (change ? 'CHANGE  ' : 'INCHANGÉE')
    + '   écritures sbd_profiles : ' + (n1 - n0));
  if (!change && opts.detail) {
    const d = await page.evaluate(opts.detail);
    console.log('        ' + JSON.stringify(d));
  }
  await app.close();
  return change;
}

(async () => {
  console.log('# PHASE 5d — la modification déclenche-t-elle un push ?\n');
  console.log('## Écritures de l\'onglet Profil');

  await mesure('TÉMOIN — champ de db.user (nom)', async (p) => {
    await p.fill('#inputName', 'HashTemoin'); await p.dispatchEvent('#inputName', 'change');
  });

  await mesure('Corps — poids du jour (saveBodyEntry)', async (p) => {
    await p.fill('#inputBodyWeight', '95.7');
    await p.locator('button[onclick*="saveBodyEntry"]').first().click();
  }, { sub: 'tab-corps' });

  await mesure('Corps — macros SEULES (saveMacroEntry)', async (p) => {
    await p.fill('#inputProt', '210'); await p.dispatchEvent('#inputProt', 'input');
    await p.fill('#inputCarb', '250'); await p.dispatchEvent('#inputCarb', 'input');
    await p.fill('#inputFat', '85');   await p.dispatchEvent('#inputFat', 'input');
    await p.locator('button[onclick*="saveMacroEntry"]').first().click();
  }, { sub: 'tab-corps', detail: () => ({ derniereEntreeBody: (db.body || [])[0] }) });

  await mesure('Réglages — Exercices Clés (saveKeyLifts)', async (p) => {
    await p.locator('button[onclick*="addKeyLift"]').first().click();
    await p.waitForTimeout(300);
    const inp = p.locator('#keyLiftsEditor input[type="text"]').last();
    if (await inp.count()) { await inp.fill('Rowing Barre Audit'); }
    await p.locator('button[onclick*="saveKeyLifts"]').first().click();
  }, { detail: () => ({ keyLifts: db.keyLifts }) });

  await mesure('Réglages — Mon Programme (saveRoutine)', async (p) => {
    const inp = p.locator('#routineEditor input').first();
    if (await inp.count()) { await inp.fill('Jour Audit Runtime'); await inp.dispatchEvent('change'); }
    await p.locator('button[onclick*="saveRoutine"]').first().click();
  }, { detail: () => ({ routine: db.routine }) });

  await mesure('Navigation — sous-onglet mémorisé (_updateLastTab)', async (p) => {
    await p.evaluate(() => { if (typeof showProfilSub === 'function') showProfilSub('tab-corps'); });
  }, { detail: () => ({ lastTab: db.gamification && db.gamification.lastTab }) });

  await mesure('Réglages — Correction des Records (db.bestPR)', async (p) => {
    await p.evaluate(() => { db.bestPR.squat = 999; if (typeof saveDB === 'function') saveDB(); });
  });

  // ── F10 : db.lastModified, terme de la signature, est-il jamais écrit ? ────
  console.log('\n## F10 — db.lastModified (14e terme de la signature)');
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    const av = await page.evaluate(() => ({ lastModified: db.lastModified, updatedAt: db.updatedAt }));
    await page.fill('#inputName', 'X'); await page.dispatchEvent('#inputName', 'change');
    await page.waitForTimeout(3200);
    const ap = await page.evaluate(() => ({ lastModified: db.lastModified, updatedAt: db.updatedAt }));
    console.log('   avant : lastModified=' + av.lastModified + '  updatedAt=' + av.updatedAt);
    console.log('   après : lastModified=' + ap.lastModified + '  updatedAt=' + ap.updatedAt);
    console.log('   → lastModified ' + (av.lastModified === ap.lastModified ? 'INCHANGÉ' : 'a changé')
      + (ap.lastModified === undefined ? ' et vaut undefined → contribue « 0 » constant à la signature' : ''));
    await app.close();
  }

  // ── Le blob poussé contient-il bien db.body / keyLifts / routine ? ─────────
  console.log('\n## Le blob de sync transporte-t-il ces clés (même non signées) ?');
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    const k = await page.evaluate(() => {
      if (typeof _buildSyncedBlob !== 'function') return '(absent)';
      const b = _buildSyncedBlob(db, db.weeklyPlan);
      return { aBody: 'body' in b, aKeyLifts: 'keyLifts' in b, aRoutine: 'routine' in b,
               aLogs: 'logs' in b, nbClés: Object.keys(b).length };
    });
    console.log('   _buildSyncedBlob → ' + JSON.stringify(k));
    console.log('   (transporté ≠ signé : une clé transportée mais non signée ne part que si');
    console.log('    une AUTRE modification, elle signée, fait basculer la signature)');
    await app.close();
  }
})().catch((e) => { console.error('ECHEC 5d:', e.stack); process.exit(1); });
