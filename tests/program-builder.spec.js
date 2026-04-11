const { test, expect } = require('@playwright/test');
const { setupPage } = require('./helpers');

async function goToProgramme(page) {
  await page.locator('button[data-tab="tab-seances"]').click();
  const programmeTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Programme' });
  await programmeTab.click();
  await expect(page.locator('#seances-programme')).toHaveClass(/active/);
}

async function runGuidedFlow(page) {
  await page.locator('text=L\'appli me guide').click();

  // Step 1: 4 days — use exact text match
  await page.getByText('Combien de jours par semaine ?').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.day-btn', { hasText: /^4$/ }).click();

  // Step 2: Hypertrophie
  await page.getByText('Quel objectif principal ?').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.card', { hasText: 'Hypertrophie' }).click();

  // Step 3: equipment — continue with defaults
  await page.getByText('Quel équipement as-tu ?').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#programBuilderContent button.btn', { hasText: 'Continuer →' }).click();

  // Step 4: 60min
  await page.getByText('Combien de temps par séance ?').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#programBuilderContent .day-btn', { hasText: '60min' }).click();

  // Step 5: Intermédiaire
  await page.getByText("Niveau d'expérience ?").waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#programBuilderContent .card', { hasText: 'Intermédiaire' }).click();

  // Wait for program generation
  await page.waitForTimeout(2000);
}

test.describe('Program Builder', () => {
  test.beforeEach(async ({ page }) => {
    // Setup with no existing program so the choice screen appears
    await setupPage(page, { generatedProgram: null, manualProgram: null, routine: null });
  });

  test('program choice screen appears when no program exists', async ({ page }) => {
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    const guideOption = page.getByText("L'appli me guide");
    const manualOption = page.getByText('Je construis moi-même');

    await expect(guideOption).toBeVisible({ timeout: 5000 });
    await expect(manualOption).toBeVisible();
  });

  test('guided flow: each step of the questionnaire displays', async ({ page }) => {
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    await page.locator('text=L\'appli me guide').click();

    // Step 1: days per week
    await expect(page.getByText('Combien de jours par semaine ?')).toBeVisible({ timeout: 5000 });
    await page.locator('.day-btn', { hasText: /^4$/ }).click();

    // Step 2: objective
    await expect(page.getByText('Quel objectif principal ?')).toBeVisible({ timeout: 5000 });
    await page.locator('.card', { hasText: 'Hypertrophie' }).click();

    // Step 3: equipment
    await expect(page.getByText('Quel équipement as-tu ?')).toBeVisible({ timeout: 5000 });
    await page.locator('#programBuilderContent button.btn', { hasText: 'Continuer →' }).click();

    // Step 4: session duration
    await expect(page.getByText('Combien de temps par séance ?')).toBeVisible({ timeout: 5000 });
    await page.locator('#programBuilderContent .day-btn', { hasText: '60min' }).click();

    // Step 5: experience level
    await expect(page.getByText("Niveau d'expérience ?")).toBeVisible({ timeout: 5000 });
  });

  test('guided flow: completing the questionnaire generates a program', async ({ page }) => {
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    await runGuidedFlow(page);

    // Choice screen should be gone
    await expect(page.getByText("L'appli me guide")).toHaveCount(0);

    // Programme content should exist
    const programContent = page.locator('#seances-programme');
    const text = await programContent.innerText();
    expect(text.length).toBeGreaterThan(10);
  });

  test('CRITICAL: program persists after page reload', async ({ page }) => {
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    await runGuidedFlow(page);

    // Verify program exists
    await expect(page.getByText("L'appli me guide")).toHaveCount(0);

    // Reload the page
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => {
      const ob = document.getElementById('onboarding-overlay');
      if (ob) ob.style.display = 'none';
      const login = document.getElementById('loginScreen');
      if (login) login.style.display = 'none';
    });
    await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 15000 });

    // Navigate back to Programme
    await goToProgramme(page);
    await page.waitForTimeout(1000);

    // The program should still be there
    await expect(page.getByText("L'appli me guide")).toHaveCount(0);

    const programContent = page.locator('#seances-programme');
    const text = await programContent.innerText();
    expect(text.length).toBeGreaterThan(10);
  });
});
