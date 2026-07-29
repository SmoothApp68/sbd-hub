/**
 * VAGUE 1 v3 — LA CHAÎNE RGPD DE SUPPRESSION DE COMPTE. OUTIL D'AUDIT.
 *
 * Cette chaîne n'a été rendue sur AUCUN des passages précédents (v2 vagues 1 et 5).
 * C'est la seule surface de l'app qui touche un droit légal (RGPD art. 17, droit à l'effacement).
 * Ce script tente de la faire apparaître, réseau stubbé, sans jamais rien supprimer.
 *
 * ⚠️ Aucune suppression n'est déclenchée : on s'arrête à l'affichage du dialogue et on
 * inspecte ses options. Le bouton de confirmation n'est jamais cliqué.
 */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

const vis = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  if (!el) return 'ABSENT';
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  if (cs.display === 'none') return 'display:none';
  if (r.width === 0 && r.height === 0) return 'boîte 0×0';
  return 'VISIBLE ' + Math.round(r.width) + '×' + Math.round(r.height);
}, id);

(async () => {
  console.log('# VAGUE 1 v3 — chaîne RGPD de suppression de compte\n');
  const app = await H.openApp(profiles.build('aurel_like'));
  const { page } = app;
  const err = [];
  page.on('pageerror', (e) => err.push(String(e.message).split('\n')[0]));

  await page.evaluate(() => { showTab('tab-profil'); showProfilSub('tab-settings'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const e = document.getElementById('acc-danger');
    if (e && !e.classList.contains('open') && typeof toggleAcc === 'function') toggleAcc('acc-danger'); });
  await page.waitForTimeout(400);

  console.log('## Point d\'entrée — Réglages → Zone de Danger');
  const bouton = await page.evaluate(() => {
    const b = document.querySelector('#acc-danger button[onclick*="requestAccountDeletion"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { texte: b.textContent.trim(), visible: r.height > 0, h: Math.round(r.height) };
  });
  console.log('   bouton : ' + JSON.stringify(bouton));

  console.log('\n## Ouverture du dialogue (aucune suppression déclenchée)');
  const ouverture = await page.evaluate(async () => {
    try {
      if (typeof requestAccountDeletion !== 'function') return 'fonction ABSENTE';
      await requestAccountDeletion();
      return 'appel effectué';
    } catch (e) { return 'ERREUR : ' + String(e.message).split('\n')[0]; }
  });
  await page.waitForTimeout(1500);
  console.log('   requestAccountDeletion() → ' + ouverture);

  for (const id of ['del-erase', 'del-anon', 'del-confirm']) {
    console.log('   ' + id.padEnd(14) + await vis(page, id));
  }

  const etat = await page.evaluate(() => {
    const ov = Array.from(document.querySelectorAll('.modal-overlay, [id*="delet"], [id*="Delet"]'))
      .filter((e) => e.offsetParent !== null);
    return {
      overlaysVisibles: ov.map((e) => (e.id || e.className).slice(0, 40)),
      texte: ov.length ? (ov[0].innerText || '').slice(0, 260).replace(/\n/g, ' | ') : '(aucun)',
    };
  });
  console.log('\n   overlays visibles : ' + JSON.stringify(etat.overlaysVisibles));
  console.log('   contenu : ' + etat.texte);

  // Deuxième voie : la fonction du dialogue, appelée directement
  console.log('\n## Voie directe — showAccountDeletionDialog()');
  const direct = await page.evaluate(() => {
    try {
      if (typeof showAccountDeletionDialog !== 'function') return 'fonction ABSENTE';
      showAccountDeletionDialog();
      return 'appel effectué';
    } catch (e) { return 'ERREUR : ' + String(e.message).split('\n')[0]; }
  });
  await page.waitForTimeout(900);
  console.log('   showAccountDeletionDialog() → ' + direct);
  for (const id of ['del-erase', 'del-anon', 'del-confirm']) {
    console.log('   ' + id.padEnd(14) + await vis(page, id));
  }
  const contenu = await page.evaluate(() => {
    const el = document.getElementById('del-erase');
    const box = el && el.closest('div[style],.modal-box,.modal-overlay');
    return box ? (box.innerText || '').slice(0, 400).replace(/\n/g, ' | ') : '(introuvable)';
  });
  console.log('   contenu du dialogue : ' + contenu);

  // Qui consomme les 3 options ?
  console.log('\n## Ce que font les trois options (lecture du code, aucun clic)');
  const opts = await page.evaluate(() => {
    const out = {};
    ['del-erase', 'del-anon', 'del-confirm'].forEach((id) => {
      const el = document.getElementById(id);
      out[id] = el ? { tag: el.tagName.toLowerCase(), type: el.type || '',
        onclick: (el.getAttribute('onclick') || '').slice(0, 90),
        name: el.name || '', checked: el.checked } : 'absent';
    });
    return out;
  });
  Object.entries(opts).forEach(([k, v]) => console.log('   ' + k.padEnd(12) + JSON.stringify(v)));

  console.log('\n   erreurs JS : ' + err.length);
  err.slice(0, 4).forEach((e) => console.log('      ! ' + e.slice(0, 150)));
  await app.close();
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });
