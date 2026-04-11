const { test, expect } = require('@playwright/test');
const { setupPage } = require('./helpers');

async function startEmptySession(page) {
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
  await page.locator('button.go-add-exo').click();
  const searchInput = page.locator('#goSearchInput');
  await searchInput.waitFor({ state: 'visible', timeout: 5000 });
  await searchInput.fill(query);
  await page.waitForTimeout(500);
  const firstResult = page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]').first();
  await firstResult.click();
  await page.waitForTimeout(500);
}

test.describe('Superset', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('add 2 exercises and superset link button exists', async ({ page }) => {
    await startEmptySession(page);
    await addExercise(page, 'bench');
    await addExercise(page, 'curl');

    const supersetBtn = page.locator('button[onclick*="goToggleSuperset"]').first();
    await expect(supersetBtn).toBeVisible({ timeout: 5000 });
  });

  test('linking 2 exercises shows superset visual indicator', async ({ page }) => {
    await startEmptySession(page);
    await addExercise(page, 'bench');
    await addExercise(page, 'curl');

    // Click the superset link button on the first exercise
    const supersetBtn = page.locator('button[onclick*="goToggleSuperset"]').first();
    await supersetBtn.click();
    await page.waitForTimeout(500);

    // After linking, button should show "Superset" text
    const linkedBtn = page.locator('button', { hasText: 'Superset' });
    await expect(linkedBtn).toBeVisible({ timeout: 5000 });
  });
});
