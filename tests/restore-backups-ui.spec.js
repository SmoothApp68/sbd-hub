// Playwright (navigation) — LOT1 : la section « 📦 Versions sauvegardées » est
// rebranchée dans la vue Programme live (renderProgrammeV2) et ses boutons pointent
// vers des fonctions DÉFINIES (pas de ReferenceError). C'est le test qui aurait
// attrapé le bug v237 (les tests unitaires appellent les fns directement).
const { test, expect } = require('@playwright/test');

test('Programme : section Versions sauvegardées rebranchée + handlers définis', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.renderProgrammeV2 === 'function', null, { timeout: 15000 });

  // Naviguer réellement vers la vue Programme (onglet Séances → sous-vue « Plan »),
  // injecter un backup factice, puis rendre.
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
    if (typeof showSeancesSub === 'function') showSeancesSub('s-plan');
    db.customProgramBackups = [{
      savedAt: Date.now(), firstUsedAt: Date.now(), lastUsedAt: Date.now(), sessionCount: 2,
      programMode: 'custom',
      customProgramTemplate: { name: 'Prog Test LOT1', blocks: [{ sessions: [{ dayIndex: 0, label: 'Squat', exercises: [{ name: 'Squat' }] }] }] }
    }];
    renderProgrammeV2();
  });

  // (a) le bloc repliable est présent ET visible dans la vue Programme
  const block = page.locator('#programmeV2Content', { hasText: 'Versions sauvegardées' });
  await expect(block).toBeVisible();

  // déplier
  await page.evaluate(() => toggleBackupsList());

  // (b) la liste contient le backup + les 3 boutons
  const list = page.locator('#v2BackupsList');
  await expect(list).toContainText('Prog Test LOT1');
  await expect(list.getByRole('button', { name: 'Restaurer' })).toBeVisible();
  await expect(list.locator('button[onclick^="previewBackup"]')).toHaveCount(1);
  await expect(list.locator('button[onclick^="deleteCustomProgramBackup"]')).toHaveCount(1);

  // (c) les onclick pointent vers des fonctions RÉELLEMENT définies (anti-ReferenceError)
  const handlersDefined = await page.evaluate(() =>
    typeof restoreCustomProgramBackup === 'function' &&
    typeof previewBackup === 'function' &&
    typeof deleteCustomProgramBackup === 'function'
  );
  expect(handlersDefined).toBe(true);
});
