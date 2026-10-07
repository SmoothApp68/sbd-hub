const { test, expect } = require('@playwright/test');
const { setupPage } = require('./helpers');

test.describe('Auth (Settings Cloud Sync)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    // Navigate to Profil > Réglages
    await page.locator('button[data-tab="tab-profil"]').click();
    await page.locator('#tab-profil .stats-sub-pill', { hasText: 'Réglages' }).click();
  });

  test('Synchronisation Cloud accordion exists', async ({ page }) => {
    const cloudAcc = page.getByText('Synchronisation Cloud');
    await expect(cloudAcc).toBeVisible();
  });

  test('auth form has email and password fields', async ({ page }) => {
    const accHeader = page.locator('.acc-header', { has: page.getByText('Synchronisation Cloud') });
    await accHeader.click();
    await page.waitForTimeout(500);

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

    await page.locator('#inputEmail').fill('invalid@test.com');
    await page.locator('#inputPassword').fill('wrongpass');
    await page.locator('#authSubmitBtn').click();

    // Wait and verify no crash
    await page.waitForTimeout(3000);
    await expect(page.locator('#mainTabBar')).toBeVisible();
  });
});
