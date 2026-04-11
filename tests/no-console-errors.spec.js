const { test, expect } = require('@playwright/test');

async function dismissLogin(page) {
  try {
    const offlineBtn = page.locator('#loginOfflineBtn');
    await offlineBtn.waitFor({ state: 'visible', timeout: 5000 });
    await offlineBtn.click();
    await offlineBtn.waitFor({ state: 'hidden', timeout: 5000 });
  } catch {
    // Login screen not shown
  }
}

test.describe('No Console Errors', () => {
  test('navigating through all tabs produces no JS console errors', async ({ page }) => {
    const errors = [];

    // Collect all page errors
    page.on('pageerror', (err) => {
      errors.push({
        message: err.message,
        stack: err.stack,
      });
    });

    await page.goto('/');
    await dismissLogin(page);
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });

    // Navigate to each main tab
    const tabs = ['tab-dash', 'tab-social', 'tab-seances', 'tab-profil'];
    for (const tab of tabs) {
      await page.locator(`button[data-tab="${tab}"]`).click();
      await page.waitForTimeout(500);
    }

    // Navigate to training sub-tabs
    await page.locator('button[data-tab="tab-seances"]').click();
    const trainingSubTabs = ['Séances', 'GO', 'Programme', 'Coach'];
    for (const subTab of trainingSubTabs) {
      const pill = page.locator('#tab-seances .stats-sub-pill', { hasText: subTab });
      await pill.click();
      await page.waitForTimeout(500);
    }

    // Navigate to profile sub-tabs
    await page.locator('button[data-tab="tab-profil"]').click();
    const profileSubTabs = ['Corps', 'Stats', 'Badges', 'Amis', 'Réglages'];
    for (const subTab of profileSubTabs) {
      const pill = page.locator('#tab-profil .stats-sub-pill', { hasText: subTab });
      await pill.click();
      await page.waitForTimeout(500);
    }

    // Report any errors found
    if (errors.length > 0) {
      const errorReport = errors.map((e, i) => `Error ${i + 1}: ${e.message}`).join('\n');
      expect(errors, `Console errors detected:\n${errorReport}`).toEqual([]);
    }
  });
});
