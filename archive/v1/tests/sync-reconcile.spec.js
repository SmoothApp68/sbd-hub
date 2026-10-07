// Playwright — SYNC-X : les fonctions de fusion cross-device sont chargées (pas de
// ReferenceError) et _reconcileLogs fusionne correctement dans le bundle réel
// (séance distante ajoutée, édition la plus récente gardée, pas de doublon, idempotent).
const { test, expect } = require('@playwright/test');

test('SYNC-X : merge cross-device chargé et correct (local peuplé + séance distante)', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window._reconcileLogs === 'function', null, { timeout: 15000 });

  const r = await page.evaluate(() => {
    const defined = typeof reconcileLogsFromCloud === 'function'
      && typeof hydrateLogsFromCloud === 'function'
      && typeof _logEditClock === 'function';
    // local peuplé (s1 inchangé, s2 ancienne) + distant (s2 éditée récemment, s3 nouvelle)
    const local = [
      { id: 's1', timestamp: 10, editedAt: 10 },
      { id: 's2', timestamp: 20, editedAt: 20, title: 'old' },
    ];
    const remote = [
      { id: 's2', timestamp: 20, editedAt: 999, title: 'edited' },
      { id: 's3', timestamp: 30, editedAt: 30 },
    ];
    const merged = _reconcileLogs(local, remote);
    const again = _reconcileLogs(merged, remote); // idempotence
    const idsOf = (a) => a.map((x) => x.id).sort().join(',');
    return {
      defined,
      ids: idsOf(merged),
      s2title: (merged.find((x) => x.id === 's2') || {}).title,
      noDup: merged.length === 3,
      idempotent: idsOf(again) === idsOf(merged) && again.length === merged.length,
    };
  });

  expect(r.defined).toBe(true);            // pas de ReferenceError
  expect(r.ids).toBe('s1,s2,s3');          // s3 distante ajoutée, s1/s2 conservées
  expect(r.s2title).toBe('edited');        // édition la plus récente gardée
  expect(r.noDup).toBe(true);              // pas de doublon
  expect(r.idempotent).toBe(true);         // 2e passe identique
});
