// Playwright — la ligne de version est présente dans Réglages et affiche un vXXX.
// (Sert de garde anti-régression "leçon cache" : on doit toujours voir une version.)
const { test, expect } = require('@playwright/test');

test('Réglages affiche la ligne de version avec un vXXX', async ({ page }) => {
  await page.goto('/index.html');
  // Boot : attendre que l'API d'onglets soit prête, puis naviguer Profil → Réglages.
  await page.waitForFunction(() => typeof window.showProfilSub === 'function', null, { timeout: 15000 });
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-profil');
    showProfilSub('tab-settings');
  });
  const line = page.locator('#appVersionLine');
  await expect(line).toBeVisible();
  await expect(line).toContainText(/v\d+/);
  await expect(line).toContainText('SBD Hub');
});
