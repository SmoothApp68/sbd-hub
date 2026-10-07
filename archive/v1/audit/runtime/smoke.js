/** Fumée : l'app boote-t-elle sous le harnais, et l'onglet Profil se rend-il ? OUTIL D'AUDIT. */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

(async () => {
  const db = profiles.build('aurel_like');
  const app = await H.openApp(db);
  const { page } = app;

  console.log('db.user.name      =', await page.evaluate(() => db.user && db.user.name));
  console.log('db.logs.length    =', await page.evaluate(() => (db.logs || []).length));
  console.log('db.user.onboarded =', await page.evaluate(() => db.user && db.user.onboarded));
  console.log('overlays ouverts  =', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.modal-overlay, .ob-overlay, [id^="ob-"]'))
      .filter((e) => e.offsetParent !== null).map((e) => e.id || e.className).slice(0, 6)));

  await H.gotoProfil(page, 'tab-corps');
  console.log('tab-profil visible=', await page.locator('#tab-profil').isVisible());
  console.log('tab-corps visible =', await page.locator('#tab-corps').isVisible());
  await H.gotoProfil(page, 'tab-settings');
  console.log('tab-settings vis. =', await page.locator('#tab-settings').isVisible());
  console.log('inputName visible =', await page.locator('#inputName').isVisible());

  console.log('\nrequetes externes interceptees :', app.netCalls.length,
    app.netCalls.slice(0, 4).map((c) => c.url.slice(0, 70)));
  console.log('erreurs page :', app.errors.length);
  app.errors.slice(0, 8).forEach((e) => console.log('   ! ' + e.slice(0, 160)));

  await app.close();
})().catch((e) => { console.error('HARNESS ECHEC:', e.message); process.exit(1); });
