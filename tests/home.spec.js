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

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });
    // Ensure we are on the Maison tab
    await page.locator('button[data-tab="tab-dash"]').click();
  });

  test('home page contains the 4 main cards', async ({ page }) => {
    await expect(page.locator('#todayProgramCard')).toBeVisible();
    await expect(page.locator('#sbdTotalCard')).toBeVisible();
    await expect(page.locator('#weeklySummaryCard')).toBeVisible();
    await expect(page.locator('#recentPRsCard')).toBeVisible();
  });

  test('no "Muscles travaillés cette semaine" section exists', async ({ page }) => {
    const muscleSection = page.getByText('Muscles travaillés cette semaine');
    await expect(muscleSection).toHaveCount(0);
  });

  test('cards have content (no empty, undefined, or NaN values)', async ({ page }) => {
    const cards = ['#todayProgramCard', '#sbdTotalCard', '#weeklySummaryCard', '#recentPRsCard'];

    for (const cardId of cards) {
      const card = page.locator(cardId);
      const text = await card.innerText();
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('NaN');
    }
  });

  test('"Lancer la séance" button exists and is clickable', async ({ page }) => {
    const btn = page.locator('#startTodayWorkoutBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Lancer la séance');
    await expect(btn).toBeEnabled();
  });
});
