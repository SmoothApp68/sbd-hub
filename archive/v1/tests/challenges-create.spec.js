// Playwright (navigation) — DÉFIS : le picker (5 métriques → durée → createChallenge)
// vit désormais dans Social. Vérifie aussi que la section Défis de l'onglet Jeux a été
// RETIRÉE (plus de #gamChallengesSection ni de renderFriendChallenges).
const { test, expect } = require('@playwright/test');

test('Défis : picker → métrique → durée → createChallenge ; section Jeux retirée', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.selectChallengeMetric === 'function', null, { timeout: 15000 });
  // Le splash écran intercepte les clics ~1s au boot → le retirer avant d'interagir.
  await page.evaluate(() => { var s = document.getElementById('splashScreen'); if (s) s.remove(); });

  // (a) le handler du picker existe (anti-ReferenceError)
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

  // (c) la section Défis de l'onglet Jeux a été RETIRÉE — le picker survit (Social).
  const state = await page.evaluate(() => ({
    noDiv: document.getElementById('gamChallengesSection') === null,
    fnGone: typeof renderFriendChallenges === 'undefined',
    pickerKept: typeof showChallengePicker === 'function',
  }));
  expect(state.noDiv).toBe(true);
  expect(state.fnGone).toBe(true);
  expect(state.pickerKept).toBe(true);
});
