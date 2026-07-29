/**
 * PHASE 5a quater — CLIPPING par max-height. OUTIL D'AUDIT.
 *
 * getBoundingClientRect() rend la boîte de mise en page MÊME si un ancêtre la rogne
 * (overflow:hidden). Le test de visibilité 5a a donc un angle mort que l'actionnabilité
 * Playwright, elle, révèle : plusieurs éléments « visibles » selon 5a sont introuvables
 * au clic. Ce script mesure le rognage réel.
 *
 * CSS en cause (index.html:562-563) :
 *   .acc-body      { max-height: 0;    overflow: hidden; }
 *   .acc-body.open { max-height: 5000px; }
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

(async () => {
  const db = profiles.build('aurel_like');
  db.user.gender = 'female';
  db.user.weightCut = { active: true, startWeight: 100, targetWeight: 93, currentWeight: 98, competitionDate: '2026-09-15' };
  const app = await H.openApp(db);
  const { page } = app;
  await H.gotoProfil(page, 'tab-settings');
  await H.openAllAccordions(page);
  await page.waitForTimeout(700);

  const r = await page.evaluate(() => {
    const acc = document.getElementById('acc-profil');
    const cs = getComputedStyle(acc);
    const out = {
      accProfil: {
        maxHeight: cs.maxHeight, overflow: cs.overflow,
        clientHeight: acc.clientHeight, scrollHeight: acc.scrollHeight,
        rectHeight: Math.round(acc.getBoundingClientRect().height),
      },
      elements: {},
    };
    const accTop = acc.getBoundingClientRect().top;
    const limite = acc.getBoundingClientRect().top + acc.clientHeight;
    ['settingsProgramMode', 'settingsMenstrualSection', 'menstrualStartDate', 'settingsHealthConnect',
     'settingsWeightCut', 'wc-current-weight', 'toggle-creatine', 'settingsBarWeightSection',
     'settings-bar-weight', 'settingsHybridSection', 'toggle-hybrid', 'settingsRGPDSection',
     'settingsMorphoSection', 'settingsInjuriesList', 'settingsCycleBlock', 'inputKcalBase']
      .forEach((id) => {
        const el = document.getElementById(id);
        if (!el) { out.elements[id] = { present: false }; return; }
        const rect = el.getBoundingClientRect();
        out.elements[id] = {
          present: true,
          offsetDansAcc: Math.round(rect.top - accTop),
          hauteur: Math.round(rect.height),
          rogne: rect.top >= limite,          // commence après la limite de rognage
          rognePartiel: rect.top < limite && rect.bottom > limite,
        };
      });
    return out;
  });

  console.log('# PHASE 5a quater — rognage par max-height\n');
  console.log('#acc-profil (accordéon « Profil Athlète », ouvert) :');
  console.log('   max-height CSS = ' + r.accProfil.maxHeight + '   overflow = ' + r.accProfil.overflow);
  console.log('   clientHeight   = ' + r.accProfil.clientHeight + ' px   (ce que l\'utilisateur peut voir)');
  console.log('   scrollHeight   = ' + r.accProfil.scrollHeight + ' px   (le contenu réel)');
  const perdu = r.accProfil.scrollHeight - r.accProfil.clientHeight;
  console.log('   → contenu au-delà de la limite : ' + perdu + ' px'
    + (perdu > 0 ? '  ⚠️ ROGNÉ (overflow:hidden, aucun défilement interne)' : '  (rien de rogné)'));

  console.log('\nPosition de chaque section dans l\'accordéon :');
  Object.entries(r.elements).forEach(([id, e]) => {
    if (!e.present) { console.log('   ' + id.padEnd(28) + 'absent du DOM'); return; }
    const etat = e.rogne ? '✘ ENTIÈREMENT ROGNÉ' : e.rognePartiel ? '⚠ partiellement rogné' : '✔ dans la zone visible';
    console.log('   ' + id.padEnd(28) + ('offset ' + e.offsetDansAcc + 'px').padEnd(16)
      + ('h=' + e.hauteur + 'px').padEnd(12) + etat);
  });

  // Preuve d'actionnabilité : Playwright refuse-t-il d'agir sur les éléments rognés ?
  console.log('\nActionnabilité réelle (Playwright, 3 s de patience) :');
  for (const id of ['inputKcalBase', 'settings-bar-weight', 'menstrualStartDate', 'wc-current-weight', 'toggle-hybrid']) {
    const loc = page.locator('#' + id);
    if (!(await loc.count())) { console.log('   ' + id.padEnd(24) + 'absent du DOM'); continue; }
    let verdict;
    try { await loc.scrollIntoViewIfNeeded({ timeout: 3000 }); verdict = '✔ actionnable'; }
    catch (e) { verdict = '✘ NON actionnable (' + e.message.split('\n')[0].slice(0, 48) + ')'; }
    console.log('   ' + id.padEnd(24) + verdict + '   isVisible()=' + await loc.isVisible());
  }

  await app.close();
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
