// Playwright — DÉFIS Lot B : les fonctions de scoring sont chargées (pas de
// ReferenceError), le scoring manuel a été retiré, et le ratio %PDC est bien
// formaté (« 1.78× PDC », pas « 2 »).
const { test, expect } = require('@playwright/test');

test('Lot B : scoring auto chargé, manuel retiré, ratio formaté', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.formatChallengeValue === 'function', null, { timeout: 15000 });

  const r = await page.evaluate(() => ({
    compute: typeof computeMyChallengeScore === 'function',
    refresh: typeof refreshMyChallengeScores === 'function',
    format: typeof formatChallengeValue === 'function',
    manualGone: typeof showUpdateChallengeProgress === 'undefined' && typeof updateSocialChallengeProgress === 'undefined',
    ratio: formatChallengeValue(1.78, 'weight'),
    vol: formatChallengeValue(12000, 'volume'),
    freq: formatChallengeValue(5, 'frequency'),
  }));

  expect(r.compute).toBe(true);
  expect(r.refresh).toBe(true);
  expect(r.format).toBe(true);
  expect(r.manualGone).toBe(true);       // plus de bouton/fn « Mettre à jour »
  expect(r.ratio).toBe('1.78× PDC');     // pas « 2 »
  expect(r.vol).toBe('12000 kg');
  expect(r.freq).toBe('5');
});
