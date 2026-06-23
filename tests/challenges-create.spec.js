// Playwright (navigation) — DÉFIS Lot A : le picker → choix métrique → choix durée
// → createChallenge (système ouvert). Vérifie que selectChallengeMetric est défini
// (anti-ReferenceError, le bug du diagnostic) et construit le bon objet ; et que la
// section ne mentionne plus « Adversaire » (1v1 abandonné).
const { test, expect } = require('@playwright/test');

test('Défis : picker → métrique → durée → createChallenge, sans 1v1', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.selectChallengeMetric === 'function', null, { timeout: 15000 });
  // Le splash écran intercepte les clics ~1s au boot → le retirer avant d'interagir.
  await page.evaluate(() => { var s = document.getElementById('splashScreen'); if (s) s.remove(); });

  // (a) le handler manquant existe désormais
  expect(await page.evaluate(() => typeof selectChallengeMetric === 'function')).toBe(true);

  // Stub createChallenge pour capturer l'objet sans dépendre du réseau Supabase.
  await page.evaluate(() => {
    window.__chal = null;
    window.createChallenge = (t) => { window.__chal = t; return Promise.resolve(); };
    showChallengePicker();
  });

  // (b) choisir une métrique (e1RM Squat) puis une durée (2 semaines).
  // dispatchEvent('click') déclenche le onclick directement (le bottom-sheet a une
  // animation slide-in + overlay qui gênent le hit-testing du clic réel).
  const sheet = page.locator('#challengePickerSheet');
  await sheet.getByRole('button', { name: /e1RM Squat/ }).dispatchEvent('click');
  await page.waitForFunction(() => {
    var s = document.getElementById('challengePickerSheet');
    return !!(s && s.innerHTML.indexOf('2 semaines') >= 0);
  }, null, { timeout: 5000 });
  await sheet.getByRole('button', { name: '2 semaines' }).dispatchEvent('click');

  const captured = await page.evaluate(() => window.__chal);
  expect(captured).toMatchObject({ type: 'weight', exercise: 'Squat', target: null, duration: 14 });

  // (c) la section gamification ne rend plus le 1v1 « Adversaire »
  await page.evaluate(() => { if (typeof renderFriendChallenges === 'function') return renderFriendChallenges(); });
  const sectionHtml = await page.locator('#gamChallengesSection').innerHTML();
  expect(sectionHtml).not.toContain('Adversaire');
});
