const { test, expect } = require('@playwright/test');
const { setupPage } = require('./helpers');

// Errors caused by CDN resources being blocked in test environments are not app bugs
const IGNORED_ERROR_PATTERNS = [
  /Chart is not defined/,
  /supabase/i,
  /Supabase/,
  /Failed to fetch/,
  /NetworkError/,
  /net::ERR_/,
  /navigator\.vibrate/,
];

function isIgnoredError(message) {
  return IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

test.describe('No Console Errors', () => {
  test('navigating through all tabs produces no JS console errors', async ({ page }) => {
    const errors = [];

    page.on('pageerror', (err) => {
      if (!isIgnoredError(err.message)) {
        errors.push({
          message: err.message,
          stack: err.stack,
        });
      }
    });

    await setupPage(page);

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

    // Navigate to profile sub-tabs (Amis redirects to Social, so re-navigate after)
    await page.locator('button[data-tab="tab-profil"]').click();
    const profileSubTabs = ['Corps', 'Stats', 'Badges', 'Réglages'];
    for (const subTab of profileSubTabs) {
      const pill = page.locator('#tab-profil .stats-sub-pill', { hasText: subTab });
      await pill.click();
      await page.waitForTimeout(500);
    }
    // Test Amis separately (it redirects to Social tab)
    await page.locator('button[data-tab="tab-profil"]').click();
    await page.locator('#tab-profil .stats-sub-pill', { hasText: 'Amis' }).click();
    await page.waitForTimeout(500);

    if (errors.length > 0) {
      const errorReport = errors.map((e, i) => `Error ${i + 1}: ${e.message}`).join('\n');
      expect(errors, `Console errors detected:\n${errorReport}`).toEqual([]);
    }
  });
});
