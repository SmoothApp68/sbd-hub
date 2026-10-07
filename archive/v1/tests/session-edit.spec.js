const { test, expect } = require('@playwright/test');
const { setupPage } = require('./helpers');

test.describe('Session Edit', () => {
  test.beforeEach(async ({ page }) => {
    // Seed with a session using numeric timestamp (Date.now() format)
    const now = Date.now();
    await setupPage(page, {
      logs: [
        {
          id: 'test-session-001',
          timestamp: now,
          title: 'Test Session',
          duration: 3600,
          volume: 1920,
          totalVolume: 1920,
          day: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][new Date(now).getDay()],
          exercises: [
            {
              name: 'Bench Press',
              maxRM: 80,
              sets: 3,
              totalReps: 24,
              series: [
                { weight: 80, reps: 8, date: now },
              ],
              allSets: [
                { weight: 80, reps: 8, date: now },
              ],
            },
          ],
          notes: '',
        },
      ],
    });
  });

  test('session history shows sessions', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    // Sessions use class "sc" in the week container
    const sessionCards = page.locator('#weekSessionsContainer .sc');
    const count = await sessionCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('session has a "Modifier" (edit) button', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    // Expand the session by clicking the header
    await page.locator('.sc-head').first().click();
    await page.waitForTimeout(500);

    const editBtn = page.locator('button[onclick*="openSessionEditor"]').first();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
  });

  test('clicking edit opens the session editor', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    // Expand the session
    await page.locator('.sc-head').first().click();
    await page.waitForTimeout(500);

    const editBtn = page.locator('button[onclick*="openSessionEditor"]').first();
    await editBtn.click();

    const editorTitle = page.getByText('Modifier la séance');
    await expect(editorTitle).toBeVisible({ timeout: 5000 });
  });

  test('session editor allows modifying the title', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    await page.locator('.sc-head').first().click();
    await page.waitForTimeout(500);
    await page.locator('button[onclick*="openSessionEditor"]').first().click();
    await page.getByText('Modifier la séance').waitFor({ state: 'visible', timeout: 5000 });

    // Should have editable text inputs (title, exercise names)
    const inputs = page.locator('input[type="text"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('session editor has an "Enregistrer" save button', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    await page.locator('.sc-head').first().click();
    await page.waitForTimeout(500);
    await page.locator('button[onclick*="openSessionEditor"]').first().click();
    await page.getByText('Modifier la séance').waitFor({ state: 'visible', timeout: 5000 });

    const saveBtn = page.locator('button[onclick*="saveSessionEdits"]');
    await expect(saveBtn).toBeVisible();
  });
});
