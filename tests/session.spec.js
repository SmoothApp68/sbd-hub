const { test, expect } = require('@playwright/test');
const { setupPage } = require('./helpers');

async function startEmptySession(page) {
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

async function addExerciseWithSet(page, query) {
  await page.locator('button.go-add-exo').click();
  const searchInput = page.locator('#goSearchInput');
  await searchInput.waitFor({ state: 'visible', timeout: 5000 });
  await searchInput.fill(query);
  await page.waitForTimeout(500);
  const firstResult = page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]').first();
  await firstResult.click();
  await page.waitForTimeout(500);

  // The exercise is added but starts with 0 sets — click "+ Série" to add one
  const addSetBtn = page.locator('.go-exo-card').last().locator('button.go-add-set-btn');
  await addSetBtn.click();
  await page.waitForTimeout(300);
}

test.describe('Session Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('start a session, add an exercise, fill weight/reps', async ({ page }) => {
    await startEmptySession(page);
    await addExerciseWithSet(page, 'bench');

    // Find the weight (kg) and reps inputs using go-set-input class
    const weightInput = page.locator('.go-set-input[placeholder="kg"]').first();
    const repsInput = page.locator('.go-set-input[placeholder="reps"]').first();

    await expect(weightInput).toBeVisible();
    await expect(repsInput).toBeVisible();

    await weightInput.fill('80');
    await repsInput.fill('8');

    await expect(weightInput).toHaveValue('80');
    await expect(repsInput).toHaveValue('8');
  });

  test('validating a set triggers the rest timer', async ({ page }) => {
    await startEmptySession(page);
    await addExerciseWithSet(page, 'bench');

    await page.locator('.go-set-input[placeholder="kg"]').first().fill('80');
    await page.locator('.go-set-input[placeholder="reps"]').first().fill('8');

    // Click the validate checkmark button in the set row
    const validateBtn = page.locator('button.go-check-btn').first();
    await validateBtn.click();

    const restTimer = page.locator('.go-rest-timer');
    await expect(restTimer).toBeVisible({ timeout: 5000 });
  });

  test('rest timer has -15s, +15s, and skip buttons', async ({ page }) => {
    await startEmptySession(page);
    await addExerciseWithSet(page, 'bench');

    await page.locator('.go-set-input[placeholder="kg"]').first().fill('80');
    await page.locator('.go-set-input[placeholder="reps"]').first().fill('8');

    await page.locator('button.go-check-btn').first().click();

    await page.locator('.go-rest-timer').waitFor({ state: 'visible', timeout: 5000 });

    await expect(page.locator('.go-rest-timer-btns button', { hasText: '-15s' })).toBeVisible();
    await expect(page.locator('.go-rest-timer-btns button', { hasText: '+15s' })).toBeVisible();
    await expect(page.locator('.go-rest-timer-btns button', { hasText: 'Passer' })).toBeVisible();
  });

  test('rest timer is sticky (position sticky)', async ({ page }) => {
    await startEmptySession(page);
    await addExerciseWithSet(page, 'bench');

    await page.locator('.go-set-input[placeholder="kg"]').first().fill('80');
    await page.locator('.go-set-input[placeholder="reps"]').first().fill('8');

    await page.locator('button.go-check-btn').first().click();

    const restTimer = page.locator('.go-rest-timer');
    await restTimer.waitFor({ state: 'visible', timeout: 5000 });

    const position = await restTimer.evaluate(el => getComputedStyle(el).position);
    expect(position).toBe('sticky');
  });

  test('exercise notes field exists', async ({ page }) => {
    await startEmptySession(page);
    // Just add the exercise (no need for a set for notes)
    await page.locator('button.go-add-exo').click();
    const searchInput = page.locator('#goSearchInput');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('bench');
    await page.waitForTimeout(500);
    await page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]').first().click();
    await page.waitForTimeout(500);

    const notesInput = page.locator('.go-exo-notes input');
    await expect(notesInput.first()).toBeVisible();
    await expect(notesInput.first()).toHaveAttribute('placeholder', /notes/i);
  });

  test('finish session button exists', async ({ page }) => {
    await startEmptySession(page);
    // Just add the exercise
    await page.locator('button.go-add-exo').click();
    const searchInput = page.locator('#goSearchInput');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('bench');
    await page.waitForTimeout(500);
    await page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]').first().click();
    await page.waitForTimeout(500);

    const finishBtn = page.locator('button', { hasText: 'Terminer la séance' });
    await expect(finishBtn).toBeVisible();
  });
});
