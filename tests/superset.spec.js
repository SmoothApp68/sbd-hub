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

async function startEmptySession(page) {
  await page.waitForSelector('#mainTabBar', { timeout: 15000 });
  await page.locator('button[data-tab="tab-seances"]').click();
  const goTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'GO' });
  await goTab.click();

  const emptyBtn = page.locator('button', { hasText: 'Séance vide' });
  await emptyBtn.click();

  try {
    const skipBtn = page.locator('button', { hasText: 'Passer' });
    await skipBtn.waitFor({ state: 'visible', timeout: 3000 });
    await skipBtn.click();
  } catch { /* no readiness modal */ }

  await page.locator('#goActiveView').waitFor({ state: 'visible', timeout: 5000 });
}

async function addExercise(page, query) {
  await page.locator('button', { hasText: 'Ajouter un exercice' }).click();
  const searchInput = page.locator('#goSearchInput');
  await searchInput.waitFor({ state: 'visible', timeout: 5000 });
  await searchInput.fill(query);
  await page.waitForTimeout(500);
  const firstResult = page.locator('#goSearchOverlay [onclick*="goPickExercise"]').first();
  await firstResult.click();
  await page.waitForTimeout(500);
}

test.describe('Superset', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
  });

  test('add 2 exercises and superset link button exists', async ({ page }) => {
    await startEmptySession(page);

    // Add two exercises
    await addExercise(page, 'bench');
    await addExercise(page, 'curl');

    // The superset link button should exist on the first exercise card
    // (it links exercise 0 to exercise 1)
    const supersetBtn = page.locator('button', { hasText: '🔗' }).first();
    await expect(supersetBtn).toBeVisible({ timeout: 5000 });
  });

  test('linking 2 exercises shows superset visual indicator', async ({ page }) => {
    await startEmptySession(page);

    await addExercise(page, 'bench');
    await addExercise(page, 'curl');

    // Click the superset link button on the first exercise
    const supersetBtn = page.locator('button', { hasText: '🔗' }).first();
    await supersetBtn.click();

    await page.waitForTimeout(500);

    // After linking, the button should show "Superset" text
    const linkedBtn = page.locator('button', { hasText: 'Superset' });
    await expect(linkedBtn).toBeVisible({ timeout: 5000 });

    // And there should be a visual indicator (border-left on the card)
    const exoCards = page.locator('.go-exo-card');
    const firstCard = exoCards.first();
    const borderLeft = await firstCard.evaluate(el => el.style.borderLeft);
    expect(borderLeft).toBeTruthy();
  });
});
