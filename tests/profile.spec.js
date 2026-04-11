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

test.describe('Profile Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });
    await page.locator('button[data-tab="tab-profil"]').click();
    await expect(page.locator('#tab-profil')).toHaveClass(/active/);
  });

  test('profile tab has sub-tabs: Corps, Stats, Badges, Amis, Réglages', async ({ page }) => {
    const subTabs = page.locator('#tab-profil .stats-sub-pill');

    await expect(subTabs.nth(0)).toContainText('Corps');
    await expect(subTabs.nth(1)).toContainText('Stats');
    await expect(subTabs.nth(2)).toContainText('Badges');
    await expect(subTabs.nth(3)).toContainText('Amis');
    await expect(subTabs.nth(4)).toContainText('Réglages');
  });

  test('clicking each sub-tab shows content', async ({ page }) => {
    const subTabSelectors = [
      { text: 'Corps', id: 'tab-corps' },
      { text: 'Stats', id: 'tab-profil-stats' },
      { text: 'Badges', id: 'tab-profil-badges' },
      { text: 'Amis', id: 'tab-profil-friends' },
      { text: 'Réglages', id: 'tab-settings' },
    ];

    for (const sub of subTabSelectors) {
      const pill = page.locator('#tab-profil .stats-sub-pill', { hasText: sub.text });
      await pill.click();
      const section = page.locator(`#${sub.id}`);
      await expect(section).toHaveClass(/active/, { timeout: 3000 });
    }
  });

  test('Réglages > "Statut & Thèmes" accordion exists', async ({ page }) => {
    // Navigate to settings
    const settingsPill = page.locator('#tab-profil .stats-sub-pill', { hasText: 'Réglages' });
    await settingsPill.click();

    // Find the "Statut & Thèmes" accordion
    const tierAccordion = page.getByText('Statut & Thèmes');
    await expect(tierAccordion).toBeVisible();
  });

  test('"Statut & Thèmes" accordion opens when clicked', async ({ page }) => {
    const settingsPill = page.locator('#tab-profil .stats-sub-pill', { hasText: 'Réglages' });
    await settingsPill.click();

    // Click the accordion header
    const accHeader = page.locator('.acc-header', { has: page.getByText('Statut & Thèmes') });
    await accHeader.click();

    // The accordion body should now be visible
    const accBody = page.locator('#acc-tier');
    // Wait for the max-height transition to complete
    await page.waitForTimeout(500);
    const maxHeight = await accBody.evaluate(el => el.style.maxHeight);
    expect(maxHeight).not.toBe('0px');
  });
});
