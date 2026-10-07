/**
 * PHASE 5a ter — le sous-onglet inexistant survit-il au rechargement ? OUTIL D'AUDIT.
 * L'audit statique supposait « l'état vide se re-produit à chaque ouverture ».
 * Ce script tranche : instrumente showProfilSub pour tracer l'ordre réel des appels au boot.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

(async () => {
  const app = await H.openApp(profiles.build('aurel_like'));
  const { page } = app;

  // 1) Reproduire le parcours : une tuile Jeux → showTab + showProfilSub('tab-profil-stats')
  await page.evaluate(() => { showTab('tab-profil'); showProfilSub('tab-profil-stats'); });
  await page.waitForTimeout(300);
  console.log('AVANT RELOAD  sous-sections actives =',
    await page.evaluate(() => document.querySelectorAll('.profil-sub-section.active').length));
  console.log('              sbd_lastTab.profil    =',
    await page.evaluate(() => JSON.parse(localStorage.getItem('sbd_lastTab') || '{}').profil));

  // 2) Recharger en traçant chaque appel de showProfilSub dès qu'il est défini
  await page.addInitScript(() => {
    window.__trace = [];
    const iv = setInterval(() => {
      if (typeof showProfilSub === 'function' && !showProfilSub.__wrapped) {
        const orig = showProfilSub;
        window.showProfilSub = function (id, btn) {
          window.__trace.push({ id, t: Date.now(), stack: (new Error()).stack.split('\n')[2] || '' });
          return orig.apply(this, arguments);
        };
        window.showProfilSub.__wrapped = true;
        clearInterval(iv);
      }
    }, 5);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('typeof db !== "undefined" && db !== null', null, { timeout: 20000 });
  await page.waitForTimeout(2500);

  const r = await page.evaluate(() => ({
    trace: (window.__trace || []).map((x) => x.id),
    actives: Array.from(document.querySelectorAll('.profil-sub-section.active')).map((e) => e.id),
    tab: document.querySelector('.content-section.active') && document.querySelector('.content-section.active').id,
    activeProfilSub: typeof activeProfilSub !== 'undefined' ? activeProfilSub : '(indéfini)',
    lastTabProfil: JSON.parse(localStorage.getItem('sbd_lastTab') || '{}').profil,
  }));
  console.log('\nAPRÈS RELOAD');
  console.log('  onglet principal actif      =', r.tab);
  console.log('  appels showProfilSub tracés =', JSON.stringify(r.trace));
  console.log('  sous-sections .active       =', JSON.stringify(r.actives));
  console.log('  variable activeProfilSub    =', r.activeProfilSub);
  console.log('  sbd_lastTab.profil persisté =', r.lastTabProfil);

  // 3) Et si l'utilisateur revient sur l'onglet depuis un autre onglet, sans recharger ?
  await page.evaluate(() => { showTab('tab-dash'); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { showTab('tab-profil'); showProfilSub('tab-profil-stats'); });
  await page.waitForTimeout(300);
  console.log('\n  après re-navigation vers la tuile : sous-sections actives =',
    await page.evaluate(() => document.querySelectorAll('.profil-sub-section.active').length));
  await page.evaluate(() => { showTab('tab-dash'); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { showTab('tab-profil'); });   // retour SANS re-cliquer la tuile
  await page.waitForTimeout(300);
  console.log('  puis retour simple sur l\'onglet Profil    : sous-sections actives =',
    await page.evaluate(() => document.querySelectorAll('.profil-sub-section.active').length),
    '| activeProfilSub =', await page.evaluate(() => activeProfilSub));

  await app.close();
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
