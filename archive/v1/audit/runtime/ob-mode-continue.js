/**
 * DIAGNOSTIC (read-only) — #ob-mode-continue est-il un bloquant du parcours d'entrée ?
 * OUTIL D'AUDIT. Réseau Supabase intégralement stubbé.
 *
 * Constat statique : selectTrainingMode (app.js:2515) fait
 *     var continueBtn = document.getElementById('ob-mode-continue');
 *     if (continueBtn) continueBtn.disabled = false;
 * or #ob-mode-continue n'existe nulle part. La question n'est donc pas « la ligne
 * est-elle morte » (elle l'est) mais « le bouton Continuer de cet écran est-il
 * atteignable et activable, ou l'utilisateur reste-t-il coincé ? »
 *
 * On tranche par de VRAIS clics (pas page.evaluate) : selectTrainingMode lit le
 * `event` global, que seul un vrai clic renseigne.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const etapeActive = (page) => page.evaluate(() => {
  const el = document.querySelector('.ob-step.active');
  const ov = document.getElementById('onboarding-overlay');
  return { etape: el ? el.id : '(aucune)',
           overlay: ov ? ov.style.display : '(absent)' };
});

async function inspecterEtape2(page, titre) {
  console.log('\n' + titre);
  const st = await page.evaluate(() => {
    const step = document.getElementById('ob-step-2');
    if (!step) return { absent: true };
    const btns = [...step.querySelectorAll('button.btn')];
    return {
      actif: step.classList.contains('active'),
      idAbsent: !document.getElementById('ob-mode-continue'),
      modes: step.querySelectorAll('#ob-mode-grid .ob-mode-btn').length,
      boutons: btns.map((b) => ({
        texte: (b.textContent || '').trim(),
        onclick: b.getAttribute('onclick'),
        id: b.id || '(sans id)',
        disabled: b.disabled,
      })),
    };
  });
  if (st.absent) { console.log('   #ob-step-2 absent du DOM'); return null; }
  console.log('   écran actif                     : ' + st.actif);
  console.log('   #ob-mode-continue absent        : ' + st.idAbsent);
  console.log('   boutons de mode d\'entraînement  : ' + st.modes);
  st.boutons.forEach((b) => console.log('   bouton « ' + b.texte + ' »  id=' + b.id
    + '  disabled=' + b.disabled + '  onclick=' + b.onclick));
  return st;
}

(async () => {
  console.log('══════════════════════════════════════════════════════════════');
  console.log(' #ob-mode-continue — bloquant du parcours d\'entrée ?');
  console.log('══════════════════════════════════════════════════════════════');

  // ── 1. Nouvel utilisateur : l'écran ob-mode est-il seulement sur son chemin ? ──
  console.log('\n1) NOUVEL UTILISATEUR (profil vierge)');
  let app = await H.openApp(profiles.build('vierge'));
  await app.page.evaluate(() => { if (typeof showOnboarding === 'function') showOnboarding(); });
  await app.page.waitForTimeout(600);
  console.log('   showOnboarding() → ' + JSON.stringify(await etapeActive(app.page)));
  await inspecterEtape2(app.page, '   état de #ob-step-2 pour ce profil :');
  await app.close();

  // ── 2. Utilisateur existant : flux long, celui qui passe par l'étape 2 ────────
  console.log('\n2) UTILISATEUR EXISTANT — réouverture du profil (flux long)');
  const db = profiles.build('aurel_like');
  db.user.onboarded = true;
  db.user.onboardingVersion = 4;      // pas de welcome-back : chemin d'édition
  app = await H.openApp(db);
  const { page } = app;
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message).split('\n')[0]));

  await page.evaluate(() => { if (typeof showOnboarding === 'function') showOnboarding(); });
  await page.waitForTimeout(600);
  console.log('   showOnboarding() → ' + JSON.stringify(await etapeActive(page)));

  // Aller à l'étape 2 par le chemin réel : le « Continuer → » de l'étape 1.
  await page.evaluate(() => { if (typeof gotoObStep === 'function') gotoObStep('1'); });
  await page.waitForTimeout(300);
  const btn1 = page.locator('#ob-step-1 button.btn');
  if (await btn1.count()) { await btn1.first().click(); await page.waitForTimeout(500); }
  console.log('   après « Continuer » de l\'étape 1 → ' + JSON.stringify(await etapeActive(page)));

  const st = await inspecterEtape2(page, '   état de #ob-step-2 :');

  // ── 3. Le parcours peut-il avancer ? Vrais clics. ────────────────────────────
  console.log('\n3) PARCOURS RÉEL — clic sur un mode, puis sur « Continuer »');
  if (st && st.actif) {
    const mode = page.locator('#ob-mode-grid .ob-mode-btn').nth(1); // powerbuilding
    console.log('   clic sur un mode : visible=' + await mode.isVisible());
    await mode.click();
    await page.waitForTimeout(300);
    const apresMode = await page.evaluate(() => ({
      trainingMode: db.user.trainingMode,
      selectionnes: document.querySelectorAll('#ob-mode-grid .ob-mode-btn.selected').length,
    }));
    console.log('   → db.user.trainingMode = ' + apresMode.trainingMode
      + ', boutons marqués sélectionnés = ' + apresMode.selectionnes);

    const cont = page.locator('#ob-step-2 button.btn');
    const n = await cont.count();
    console.log('   bouton « Continuer » : ' + n + ' trouvé(s), visible='
      + (n ? await cont.first().isVisible() : 'n/a')
      + ', activable=' + (n ? await cont.first().isEnabled() : 'n/a'));
    if (n) {
      await cont.first().click();
      await page.waitForTimeout(600);
      console.log('   après clic → ' + JSON.stringify(await etapeActive(page)));
    }
  } else {
    console.log('   étape 2 non active — parcours non testable ici');
  }

  console.log('\n   erreurs JS non capturées : ' + erreurs.length);
  erreurs.slice(0, 4).forEach((e) => console.log('      ! ' + e.slice(0, 120)));

  await app.close();
  console.log('\n══════════════════════════════════════════════════════════════\n');
})().catch((e) => { console.error('ECHEC DU BANC:', e.stack); process.exit(1); });
