const { test, expect } = require('@playwright/test');

// Helper: dismiss login screen if it appears
async function dismissLogin(page) {
  try {
    const offlineBtn = page.locator('#loginOfflineBtn');
    await offlineBtn.waitFor({ state: 'visible', timeout: 5000 });
    await offlineBtn.click();
    await offlineBtn.waitFor({ state: 'hidden', timeout: 5000 });
  } catch {
    // Login screen not shown — continue
  }
}

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
  });

  test('page loads without JS console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    // Wait for app to fully load
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });
    expect(errors).toEqual([]);
  });

  test('4 tabs exist: Maison, Feed, Training, Profil', async ({ page }) => {
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });

    const maisonTab = page.locator('button[data-tab="tab-dash"]');
    const feedTab = page.locator('button[data-tab="tab-social"]');
    const trainingTab = page.locator('button[data-tab="tab-seances"]');
    const profilTab = page.locator('button[data-tab="tab-profil"]');

    await expect(maisonTab).toBeVisible();
    await expect(feedTab).toBeVisible();
    await expect(trainingTab).toBeVisible();
    await expect(profilTab).toBeVisible();

    await expect(maisonTab).toContainText('Maison');
    await expect(feedTab).toContainText('Feed');
    await expect(trainingTab).toContainText('Training');
    await expect(profilTab).toContainText('Profil');
  });

  test('clicking each tab shows the correct content', async ({ page }) => {
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });

    // Click Feed tab
    await page.locator('button[data-tab="tab-social"]').click();
    await expect(page.locator('#tab-social')).toHaveClass(/active/);

    // Click Training tab
    await page.locator('button[data-tab="tab-seances"]').click();
    await expect(page.locator('#tab-seances')).toHaveClass(/active/);

    // Click Profil tab
    await page.locator('button[data-tab="tab-profil"]').click();
    await expect(page.locator('#tab-profil')).toHaveClass(/active/);

    // Click Maison tab (back to home)
    await page.locator('button[data-tab="tab-dash"]').click();
    await expect(page.locator('#tab-dash')).toHaveClass(/active/);
  });

  test('tab icons (SVGs) and labels are visible', async ({ page }) => {
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });

    const tabs = page.locator('#mainTabBar .tab-btn');
    const count = await tabs.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      await expect(tab).toBeVisible();
      // Each tab should contain an SVG icon
      const svg = tab.locator('svg');
      await expect(svg).toBeVisible();
    }
  });
});
