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

  // Dismiss readiness modal if it appears
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

test.describe('Session Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
  });

  test('start a session, add an exercise, fill weight/reps', async ({ page }) => {
    await startEmptySession(page);
    await addExercise(page, 'bench');

    // The exercise card should be visible
    const exoCard = page.locator('.go-exo-card').first();
    await expect(exoCard).toBeVisible();

    // Find weight and reps inputs in the first set row
    const weightInput = exoCard.locator('input[type="number"]').first();
    const repsInput = exoCard.locator('input[type="number"]').nth(1);

    await weightInput.fill('80');
    await repsInput.fill('8');

    // Verify values
    await expect(weightInput).toHaveValue('80');
    await expect(repsInput).toHaveValue('8');
  });

  test('validating a set triggers the rest timer', async ({ page }) => {
    await startEmptySession(page);
    await addExercise(page, 'bench');

    const exoCard = page.locator('.go-exo-card').first();
    const weightInput = exoCard.locator('input[type="number"]').first();
    const repsInput = exoCard.locator('input[type="number"]').nth(1);

    await weightInput.fill('80');
    await repsInput.fill('8');

    // Click the validate button (checkmark button on the set row)
    const validateBtn = exoCard.locator('button', { hasText: '✓' }).first();
    await validateBtn.click();

    // The rest timer should appear
    const restTimer = page.locator('.go-rest-timer');
    await expect(restTimer).toBeVisible({ timeout: 5000 });
  });

  test('rest timer has +15s, -15s, and skip buttons', async ({ page }) => {
    await startEmptySession(page);
    await addExercise(page, 'bench');

    const exoCard = page.locator('.go-exo-card').first();
    const weightInput = exoCard.locator('input[type="number"]').first();
    const repsInput = exoCard.locator('input[type="number"]').nth(1);

    await weightInput.fill('80');
    await repsInput.fill('8');

    const validateBtn = exoCard.locator('button', { hasText: '✓' }).first();
    await validateBtn.click();

    await page.locator('.go-rest-timer').waitFor({ state: 'visible', timeout: 5000 });

    // Check timer buttons
    const minus15 = page.locator('.go-rest-timer-btns button', { hasText: '-15s' });
    const plus15 = page.locator('.go-rest-timer-btns button', { hasText: '+15s' });
    const skipBtn = page.locator('.go-rest-timer-btns button', { hasText: 'Passer' });

    await expect(minus15).toBeVisible();
    await expect(plus15).toBeVisible();
    await expect(skipBtn).toBeVisible();
  });

  test('rest timer is sticky (position sticky)', async ({ page }) => {
    await startEmptySession(page);
    await addExercise(page, 'bench');

    const exoCard = page.locator('.go-exo-card').first();
    await exoCard.locator('input[type="number"]').first().fill('80');
    await exoCard.locator('input[type="number"]').nth(1).fill('8');
    await exoCard.locator('button', { hasText: '✓' }).first().click();

    const restTimer = page.locator('.go-rest-timer');
    await restTimer.waitFor({ state: 'visible', timeout: 5000 });

    const position = await restTimer.evaluate(el => getComputedStyle(el).position);
    expect(position).toBe('sticky');
  });

  test('exercise notes field exists', async ({ page }) => {
    await startEmptySession(page);
    await addExercise(page, 'bench');

    // Check for notes input
    const notesInput = page.locator('.go-exo-notes input');
    await expect(notesInput.first()).toBeVisible();
    await expect(notesInput.first()).toHaveAttribute('placeholder', /notes/i);
  });

  test('finish session button exists', async ({ page }) => {
    await startEmptySession(page);
    await addExercise(page, 'bench');

    const finishBtn = page.locator('button', { hasText: 'Terminer la séance' });
    await expect(finishBtn).toBeVisible();
  });
});
