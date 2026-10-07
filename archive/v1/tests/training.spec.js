const { test, expect } = require('@playwright/test');
const { setupPage } = require('./helpers');

async function goToTraining(page) {
  await page.locator('button[data-tab="tab-seances"]').click();
  await expect(page.locator('#tab-seances')).toHaveClass(/active/);
}

async function startEmptySession(page) {
  await goToTraining(page);
  const goTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'GO' });
  await goTab.click();

  const emptyBtn = page.locator('button', { hasText: 'Séance vide' });
  await emptyBtn.click();

  // Dismiss readiness modal if it appears
  try {
    const skipBtn = page.locator('button', { hasText: 'Passer' });
    await skipBtn.waitFor({ state: 'visible', timeout: 3000 });
    await skipBtn.click();
  } catch { /* no readiness modal */ }

  await page.locator('#goActiveView').waitFor({ state: 'visible', timeout: 5000 });
}

test.describe('Training Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
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
    const goContent = page.locator('#goIdleView');
    await expect(goContent).toBeVisible();
  });

  test('session interface allows adding an exercise', async ({ page }) => {
    await startEmptySession(page);

    const addBtn = page.locator('button.go-add-exo');
    await expect(addBtn).toBeVisible();
  });

  test('exercise search works (type "bench" and get results)', async ({ page }) => {
    await startEmptySession(page);

    await page.locator('button.go-add-exo').click();

    const searchInput = page.locator('#goSearchInput');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('bench');
    await page.waitForTimeout(500);

    const results = page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]');
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
  });

  test('search results have circular thumbnail images', async ({ page }) => {
    await startEmptySession(page);

    await page.locator('button.go-add-exo').click();
    const searchInput = page.locator('#goSearchInput');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('bench');
    await page.waitForTimeout(500);

    const thumbs = page.locator('#goSearchOverlay img');
    const thumbCount = await thumbs.count();
    expect(thumbCount).toBeGreaterThan(0);
  });

  test('selecting an exercise adds it to the session', async ({ page }) => {
    await startEmptySession(page);

    await page.locator('button.go-add-exo').click();
    const searchInput = page.locator('#goSearchInput');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('bench');
    await page.waitForTimeout(500);

    const firstResult = page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]').first();
    await firstResult.click();

    const exoCard = page.locator('.go-exo-card');
    await expect(exoCard.first()).toBeVisible({ timeout: 5000 });
  });
});
