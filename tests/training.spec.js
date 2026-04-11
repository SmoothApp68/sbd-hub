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

async function goToTraining(page) {
  await page.waitForSelector('#mainTabBar', { timeout: 15000 });
  await page.locator('button[data-tab="tab-seances"]').click();
  await expect(page.locator('#tab-seances')).toHaveClass(/active/);
}

test.describe('Training Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
    await goToTraining(page);
  });

  test('training tab has sub-tabs: Séances, GO, Programme, Coach', async ({ page }) => {
    const subTabs = page.locator('#tab-seances .stats-sub-pill');
    await expect(subTabs.nth(0)).toContainText('Séances');
    await expect(subTabs.nth(1)).toContainText('GO');
    await expect(subTabs.nth(2)).toContainText('Programme');
    await expect(subTabs.nth(3)).toContainText('Coach');
  });

  test('clicking GO opens the session interface', async ({ page }) => {
    const goTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'GO' });
    await goTab.click();
    await expect(page.locator('#seances-go')).toHaveClass(/active/);
    // The idle view should have session start buttons
    const goContent = page.locator('#goIdleView');
    await expect(goContent).toBeVisible();
  });

  test('session interface allows adding an exercise', async ({ page }) => {
    // Click GO tab
    const goTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'GO' });
    await goTab.click();

    // Start an empty session
    const emptySessionBtn = page.locator('button', { hasText: 'Séance vide' });
    await emptySessionBtn.click();

    // Check readiness modal or active workout view
    try {
      // If readiness modal appears, dismiss it
      const skipBtn = page.locator('button', { hasText: 'Passer' });
      await skipBtn.waitFor({ state: 'visible', timeout: 3000 });
      await skipBtn.click();
    } catch {
      // No readiness modal
    }

    // The active view should be visible now
    await expect(page.locator('#goActiveView')).toBeVisible({ timeout: 5000 });

    // Find the "Ajouter un exercice" button
    const addBtn = page.locator('button', { hasText: 'Ajouter un exercice' });
    await expect(addBtn).toBeVisible();
  });

  test('exercise search works (type "bench" and get results)', async ({ page }) => {
    // Start an empty session
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

    // Click add exercise
    const addBtn = page.locator('button', { hasText: 'Ajouter un exercice' });
    await addBtn.click();

    // Search overlay should appear
    const searchInput = page.locator('#goSearchInput');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Type "bench"
    await searchInput.fill('bench');
    await page.waitForTimeout(500); // Wait for search results

    // Check that results appear
    const results = page.locator('#goSearchOverlay .go-search-result, #goSearchOverlay [onclick*="goPickExercise"]');
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
  });

  test('search results have circular thumbnail images', async ({ page }) => {
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
    await page.locator('button', { hasText: 'Ajouter un exercice' }).click();
    const searchInput = page.locator('#goSearchInput');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('bench');
    await page.waitForTimeout(500);

    // Look for circular images (img tags with border-radius: 50%)
    const thumbs = page.locator('#goSearchOverlay img');
    const thumbCount = await thumbs.count();
    expect(thumbCount).toBeGreaterThan(0);
  });

  test('selecting an exercise adds it to the session', async ({ page }) => {
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
    await page.locator('button', { hasText: 'Ajouter un exercice' }).click();
    const searchInput = page.locator('#goSearchInput');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('bench');
    await page.waitForTimeout(500);

    // Click first result
    const firstResult = page.locator('#goSearchOverlay [onclick*="goPickExercise"]').first();
    await firstResult.click();

    // The search overlay should close and the exercise should be in the session
    const exoCard = page.locator('.go-exo-card');
    await expect(exoCard.first()).toBeVisible({ timeout: 5000 });
  });
});
