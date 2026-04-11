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

test.describe('God Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });
  });

  test('dashboard title element exists for 7-tap activation', async ({ page }) => {
    // The title is the h2 inside the header-card in tab-dash
    const title = page.locator('#tab-dash .header-card h2');
    await expect(title).toBeVisible();
  });

  test('tapping title 7 times triggers god mode detection', async ({ page }) => {
    const title = page.locator('#tab-dash .header-card h2');

    // Tap 7 times quickly (within 2.5s window)
    for (let i = 0; i < 7; i++) {
      await title.click({ delay: 50 });
    }

    // Since we're not logged in as admin, god mode won't activate
    // But _tryActivateGodMode should have been called
    // Verify no crash occurred
    await page.waitForTimeout(1000);
    await expect(page.locator('#mainTabBar')).toBeVisible();
  });

  test('navigating to #admin loads admin panel attempt', async ({ page }) => {
    // Navigate to admin hash
    await page.goto('/#admin');
    await dismissLogin(page);

    // Since we're not admin, the panel shouldn't show (but no crash)
    await page.waitForTimeout(2000);

    // godModePanel exists in DOM but should be hidden (display:none)
    const panel = page.locator('#godModePanel');
    await expect(panel).toBeHidden();

    // Tab bar should still be visible
    await expect(page.locator('#mainTabBar')).toBeVisible();
  });

  test('god mode panel element exists in DOM', async ({ page }) => {
    // The panel should exist in the DOM but be hidden
    const panel = page.locator('#godModePanel');
    await expect(panel).toBeAttached();
    await expect(panel).toBeHidden();
  });
});
