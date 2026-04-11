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

async function goToProgramme(page) {
  await page.waitForSelector('#mainTabBar', { timeout: 15000 });
  await page.locator('button[data-tab="tab-seances"]').click();
  const programmeTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Programme' });
  await programmeTab.click();
  await expect(page.locator('#seances-programme')).toHaveClass(/active/);
}

test.describe('Program Builder', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure a clean state (no existing program)
    await page.goto('/');
    await page.evaluate(() => {
      try {
        const db = JSON.parse(localStorage.getItem('sbdDB') || '{}');
        delete db.generatedProgram;
        delete db.manualProgram;
        delete db.routine;
        localStorage.setItem('sbdDB', JSON.stringify(db));
      } catch {}
    });
    await page.reload();
    await dismissLogin(page);
  });

  test('program choice screen appears when no program exists', async ({ page }) => {
    await goToProgramme(page);

    // Wait for the program builder content to load
    await page.waitForTimeout(1000);

    // Should see the choice screen with both options
    const guideOption = page.getByText("L'appli me guide");
    const manualOption = page.getByText('Je construis moi-même');

    await expect(guideOption).toBeVisible({ timeout: 5000 });
    await expect(manualOption).toBeVisible();
  });

  test('guided flow: each step of the questionnaire displays', async ({ page }) => {
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    // Click "L'appli me guide"
    const guideCard = page.locator('text=L\'appli me guide');
    await guideCard.click();

    // Step 1: days per week
    await expect(page.getByText('Combien de jours par semaine ?')).toBeVisible({ timeout: 5000 });

    // Select 4 days
    await page.locator('.day-btn', { hasText: '4' }).click();

    // Step 2: objective
    await expect(page.getByText('Quel objectif principal ?')).toBeVisible({ timeout: 5000 });

    // Select Hypertrophie
    await page.locator('text=Hypertrophie').click();

    // Step 3: equipment
    await expect(page.getByText('Quel équipement as-tu ?')).toBeVisible({ timeout: 5000 });

    // Continue with default equipment
    await page.locator('button', { hasText: 'Continuer →' }).click();

    // Step 4: session duration
    await expect(page.getByText('Combien de temps par séance ?')).toBeVisible({ timeout: 5000 });

    // Select 60 min
    await page.locator('.day-btn', { hasText: '60min' }).click();

    // Step 5: experience level
    await expect(page.getByText("Niveau d'expérience ?")).toBeVisible({ timeout: 5000 });
  });

  test('guided flow: completing the questionnaire generates a program', async ({ page }) => {
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    // Start guided flow
    await page.locator('text=L\'appli me guide').click();

    // Step 1: 4 days
    await page.locator('.day-btn', { hasText: '4' }).click();

    // Step 2: Hypertrophie
    await page.locator('text=Hypertrophie').click();

    // Step 3: equipment - continue with defaults
    await page.locator('button', { hasText: 'Continuer →' }).click();

    // Step 4: 60min
    await page.locator('.day-btn', { hasText: '60min' }).click();

    // Step 5: Intermédiaire
    await page.locator('text=Intermédiaire').click();

    // Wait for program generation
    await page.waitForTimeout(2000);

    // A program should now be visible (not the choice screen)
    const choiceScreen = page.getByText("L'appli me guide");
    await expect(choiceScreen).toHaveCount(0);

    // The programme view should display days/exercises
    const programContent = page.locator('#seances-programme');
    const text = await programContent.innerText();
    expect(text.length).toBeGreaterThan(10);
  });

  test('CRITICAL: program persists after page reload', async ({ page }) => {
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    // Generate a program via guided flow
    await page.locator('text=L\'appli me guide').click();
    await page.locator('.day-btn', { hasText: '4' }).click();
    await page.locator('text=Hypertrophie').click();
    await page.locator('button', { hasText: 'Continuer →' }).click();
    await page.locator('.day-btn', { hasText: '60min' }).click();
    await page.locator('text=Intermédiaire').click();
    await page.waitForTimeout(2000);

    // Verify program exists
    const choiceScreenBefore = page.getByText("L'appli me guide");
    await expect(choiceScreenBefore).toHaveCount(0);

    // Reload the page
    await page.reload();
    await dismissLogin(page);

    // Navigate back to Programme
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    // The program should still be there (NOT the questionnaire choice screen)
    const choiceScreenAfter = page.getByText("L'appli me guide");
    await expect(choiceScreenAfter).toHaveCount(0);

    // Verify there is program content
    const programContent = page.locator('#seances-programme');
    const text = await programContent.innerText();
    expect(text.length).toBeGreaterThan(10);
  });
});
