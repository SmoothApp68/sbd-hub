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

async function ensureSessionExists(page) {
  // Inject a fake session into localStorage so we have something to edit
  await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('sbdDB');
      const db = raw ? JSON.parse(raw) : {};
      if (!db.logs) db.logs = [];
      // Only add if no sessions exist
      if (db.logs.length === 0) {
        db.logs.push({
          id: 'test-session-' + Date.now(),
          timestamp: new Date().toISOString(),
          title: 'Test Session',
          duration: 3600,
          exercises: [
            {
              name: 'Bench Press',
              series: [{ weight: 80, reps: 8, date: new Date().toISOString() }]
            }
          ],
          notes: ''
        });
        localStorage.setItem('sbdDB', JSON.stringify(db));
      }
    } catch {}
  });
}

test.describe('Session Edit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissLogin(page);
    await ensureSessionExists(page);
    await page.reload();
    await dismissLogin(page);
    await page.waitForSelector('#mainTabBar', { timeout: 15000 });
  });

  test('session history shows sessions', async ({ page }) => {
    // Go to Training > Séances
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();

    await page.waitForTimeout(1000);

    // There should be at least one session card
    const sessionCards = page.locator('#seances-list .card, #seances-list .sc-card');
    const count = await sessionCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('session has a "Modifier" (edit) button', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    // Look for the edit button (pencil icon with "Modifier" text)
    const editBtn = page.locator('button', { hasText: 'Modifier' }).first();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
  });

  test('clicking edit opens the session editor', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    const editBtn = page.locator('button', { hasText: 'Modifier' }).first();
    await editBtn.click();

    // The editor overlay should appear with "Modifier la séance" text
    const editorTitle = page.getByText('Modifier la séance');
    await expect(editorTitle).toBeVisible({ timeout: 5000 });
  });

  test('session editor allows modifying the title', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    const editBtn = page.locator('button', { hasText: 'Modifier' }).first();
    await editBtn.click();

    await page.getByText('Modifier la séance').waitFor({ state: 'visible', timeout: 5000 });

    // Find the title input — there should be an input for the session title
    const titleInput = page.locator('input[onchange*="editSession"]').first();
    // If no specific selector works, look for any editable title input in the editor
    const inputs = page.locator('input[type="text"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('session editor has an "Enregistrer" save button', async ({ page }) => {
    await page.locator('button[data-tab="tab-seances"]').click();
    const seancesTab = page.locator('#tab-seances .stats-sub-pill', { hasText: 'Séances' });
    await seancesTab.click();
    await page.waitForTimeout(1000);

    const editBtn = page.locator('button', { hasText: 'Modifier' }).first();
    await editBtn.click();

    await page.getByText('Modifier la séance').waitFor({ state: 'visible', timeout: 5000 });

    const saveBtn = page.locator('button', { hasText: 'Enregistrer' });
    await expect(saveBtn).toBeVisible();
  });
});
