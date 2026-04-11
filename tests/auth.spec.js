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

test.describe('Auth (Settings Cloud Sync)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });
    // Navigate to Profil > Réglages
    await page.locator('button[data-tab="tab-profil"]').click();
    await page.locator('#tab-profil .stats-sub-pill', { hasText: 'Réglages' }).click();
  });

  test('Synchronisation Cloud accordion exists', async ({ page }) => {
    const cloudAcc = page.getByText('Synchronisation Cloud');
    await expect(cloudAcc).toBeVisible();
  });

  test('auth form has email and password fields', async ({ page }) => {
    // Open the cloud sync accordion
    const accHeader = page.locator('.acc-header', { has: page.getByText('Synchronisation Cloud') });
    await accHeader.click();
    await page.waitForTimeout(500);

    // Check for email and password inputs
    const emailInput = page.locator('#inputEmail');
    const passwordInput = page.locator('#inputPassword');

    await expect(emailInput).toBeVisible({ timeout: 3000 });
    await expect(passwordInput).toBeVisible();
  });

  test('"Se connecter" button exists', async ({ page }) => {
    const accHeader = page.locator('.acc-header', { has: page.getByText('Synchronisation Cloud') });
    await accHeader.click();
    await page.waitForTimeout(500);

    const submitBtn = page.locator('#authSubmitBtn');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText('Se connecter');
  });

  test('"Se connecter avec un lien magique" option exists', async ({ page }) => {
    const accHeader = page.locator('.acc-header', { has: page.getByText('Synchronisation Cloud') });
    await accHeader.click();
    await page.waitForTimeout(500);

    const magicLinkBtn = page.getByText('Se connecter avec un lien magique');
    await expect(magicLinkBtn).toBeVisible();
  });

  test('"Mot de passe oublié ?" link exists', async ({ page }) => {
    const accHeader = page.locator('.acc-header', { has: page.getByText('Synchronisation Cloud') });
    await accHeader.click();
    await page.waitForTimeout(500);

    const forgotBtn = page.locator('#forgotPasswordBtn');
    await expect(forgotBtn).toBeVisible();
    await expect(forgotBtn).toContainText('Mot de passe oublié ?');
  });

  test('invalid email/password does not crash the app', async ({ page }) => {
    const accHeader = page.locator('.acc-header', { has: page.getByText('Synchronisation Cloud') });
    await accHeader.click();
    await page.waitForTimeout(500);

    // Fill in invalid credentials
    await page.locator('#inputEmail').fill('invalid@test.com');
    await page.locator('#inputPassword').fill('wrongpass');

    // Click submit
    await page.locator('#authSubmitBtn').click();

    // Wait for the response — should not crash
    await page.waitForTimeout(3000);

    // The page should still be functional (tab bar visible)
    await expect(page.locator('#mainTabBar')).toBeVisible();
  });
});
