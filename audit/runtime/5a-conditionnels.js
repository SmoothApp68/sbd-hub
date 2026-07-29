/**
 * PHASE 5a quinquies — ÉLÉMENTS MASQUÉS PAR CONCEPTION. OUTIL D'AUDIT.
 *
 * 5a liste des éléments jamais visibles au repos. La plupart sont des états transitoires
 * (aperçu d'import, barre de progression, confirmation de mot de passe…) que le JS
 * dévoile sur action. Ce script exécute l'action réelle et vérifie la révélation.
 * Objectif : ne pas classer « inatteignable » ce qui est simplement « conditionnel ».
 * Ce qui RESTE invisible après son action déclenchante est, lui, vraiment inatteignable.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');
const fs = require('fs');
const os = require('os');
const path = require('path');

const vis = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  if (!el) return 'ABSENT';
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  if (cs.display === 'none') return 'display:none';
  if (r.width === 0 && r.height === 0) return 'boîte 0×0';
  return 'VISIBLE';
}, id);

async function cas(nom, ids, prep, action, opts) {
  const app = await H.openApp(profiles.build('aurel_like'), opts || {});
  const { page } = app;
  await H.gotoProfil(page, (opts && opts.sub) || 'tab-settings');
  await H.openAllAccordions(page);
  await page.waitForTimeout(400);
  if (prep) await prep(page);
  const avant = {}; for (const i of ids) avant[i] = await vis(page, i);
  let err = null;
  try { await action(page); } catch (e) { err = e.message.split('\n')[0]; }
  await page.waitForTimeout(1200);
  const apres = {}; for (const i of ids) apres[i] = await vis(page, i);
  console.log('  ' + nom);
  for (const i of ids) {
    const ok = apres[i] === 'VISIBLE';
    console.log('     ' + (ok ? '✔' : '✘') + ' ' + i.padEnd(24) + avant[i].padEnd(14) + ' → ' + apres[i]);
  }
  if (err) console.log('     (erreur d\'interaction : ' + err + ')');
  await app.close();
}

(async () => {
  console.log('# PHASE 5a quinquies — masqué par conception, ou inatteignable ?\n');

  await cas('Corps · infobulle du Score de Forme (clic sur ⓘ)', ['formeScoreTooltip'], null,
    async (p) => { await p.locator('#tab-corps span[onclick*="formeScoreTooltip"]').first().click(); },
    { sub: 'tab-corps' });

  await cas('Import · aperçu Hevy (coller du texte puis « Traiter »)',
    ['importSummary', 'importDetails'], null, async (p) => {
      await p.fill('#hevyPaste', 'Squat (Barre)\n100 kg x 5 @8\n100 kg x 5 @8');
      await p.locator('button[onclick*="processHevy"]').first().click();
    });

  // Fichier CSV réel écrit dans un dossier temporaire (jamais dans le dépôt)
  const csv = path.join(os.tmpdir(), 'audit-runtime.csv');
  fs.writeFileSync(csv, 'Date,Exercise Name,Weight,Reps,RPE\n2026-07-01,Squat (Barbell),100,5,8\n');
  await cas('Import · aperçu CSV (choisir un fichier)',
    ['csvPreview', 'csvImportBtn'], null,
    async (p) => { await p.setInputFiles('#csvFileInput', csv); });

  const bak = path.join(os.tmpdir(), 'audit-restore.json');
  fs.writeFileSync(bak, JSON.stringify({ user: { name: 'X' }, logs: [] }));
  await cas('Sauvegarde · aperçu de restauration (choisir un fichier)',
    ['restorePreview', 'restoreBtn'], null,
    async (p) => { await p.setInputFiles('#restoreFileInput', bak); });

  console.log('\n## Session ANONYME (déconnecté) — le bloc de connexion doit apparaître');
  await cas('Cloud · formulaire email + onglet Inscription',
    ['emailLoginSection', 'inputEmail', 'inputPassword', 'authSubmitBtn', 'forgotPasswordBtn',
     'authModeLogin', 'authModeSignup', 'inputPasswordConfirm'], null,
    async (p) => { await p.locator('#authModeSignup').click(); }, { anonymous: true });

  console.log('\n## Session AVEC email — le bloc « changer de mot de passe » doit apparaître');
  await cas('Cloud · changement de mot de passe',
    ['changePasswordSection', 'newPassword', 'newPasswordConfirm'], null,
    async (p) => { await p.waitForTimeout(1500); });

  console.log('\n## Barre de progression CSV (état transitoire pendant l\'import)');
  await cas('Import · csvProgress / bar / text',
    ['csvProgress', 'csvProgressBar', 'csvProgressText'], null,
    async (p) => {
      await p.setInputFiles('#csvFileInput', csv);
      await p.waitForTimeout(400);
      await p.locator('#csvImportBtn').click();
      await p.waitForTimeout(120);   // fenêtre étroite : la barre disparaît à la fin
    });

  console.log('\n## Les cases à cocher « 0×0 » (masquées derrière un interrupteur dessiné)');
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await H.gotoProfil(page, 'tab-settings'); await H.openAllAccordions(page);
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ['settingsPrehabToggle', 'toggle-hybrid', 'settingsCycleEnabled']
      .map((id) => { const el = document.getElementById(id); if (!el) return id + ' : ABSENT';
        const cs = getComputedStyle(el);
        return id + ' : opacity=' + cs.opacity + ' w=' + cs.width + ' h=' + cs.height
          + '  interrupteur visible ? ' + (!!document.getElementById(id.replace('Toggle', 'Slider'))
            || !!(el.closest('label') && el.closest('label').getBoundingClientRect().height > 0)); }));
    r.forEach((l) => console.log('     ' + l));
    console.log('     → cases masquées VOLONTAIREMENT (motif « switch iOS ») : la surface cliquable est le label/slider.');
    await app.close();
  }

  console.log('\n## Ce qui reste invisible APRÈS son action déclenchante');
  await cas('Notifications Push · ouvrir l\'accordéon puis cliquer le bouton',
    ['acc-notif', 'push-status-label'], null,
    async (p) => { await p.evaluate(() => { if (typeof toggleAcc === 'function') toggleAcc('acc-notif'); }); });

  await cas('Badges · appeler showProfilSub(\'tab-profil-badges\') à la main',
    ['tab-profil-badges', 'profil-badges-content'], null,
    async (p) => { await p.evaluate(() => { if (typeof showProfilSub === 'function') showProfilSub('tab-profil-badges'); }); });
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
