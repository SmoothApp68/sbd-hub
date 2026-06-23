// Fix dual-write workout_sessions (Phase 3) — câblage t=0 + filet de fermeture.
// Vérifie côté navigateur (sans réseau Supabase) :
//  A. goFinishWorkout CÂBLE pushWorkoutSessionsNow (déclenchement t=0, plus le seul
//     debounce fire-and-forget) — garde anti-régression sur la source.
//  B. le handler 'pagehide' tente un flush quand _wsPendingFlush est vrai, et NE fait
//     RIEN quand il n'y a aucune écriture en attente (pas de travail inutile).
//  C. aucune ReferenceError ; pushWorkoutSessionsNow + feed (publishSessionActivity)
//     restent définis.
// NB : la LOGIQUE de pushWorkoutSessionsNow (résolution uid + appel syncLogsToSupabase)
// est testée en unitaire déterministe dans tests/unit/dualwrite-trigger.test.js
// (supaClient/cloudSyncEnabled sont des `let` non réassignables depuis window).
const { test, expect } = require('@playwright/test');

test('Dual-write : câblage t=0, filet pagehide, pas de régression feed', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.pushWorkoutSessionsNow === 'function', null, { timeout: 15000 });

  // (A) goFinishWorkout appelle bien pushWorkoutSessionsNow (t=0), au-delà du debounce.
  expect(await page.evaluate(() => goFinishWorkout.toString().indexOf('pushWorkoutSessionsNow') >= 0)).toBe(true);

  // (B) filet de fermeture : pushWorkoutSessionsNow et _wsPendingFlush sont des globals
  // classiques (function/var) → réassignables sur window ; le handler les résout par
  // identifiant nu. On espionne pushWorkoutSessionsNow et on pilote _wsPendingFlush.
  const flushed = await page.evaluate(() => {
    window.__flush = 0;
    window.pushWorkoutSessionsNow = function() { window.__flush++; };
    // écriture en attente → pagehide DOIT déclencher un flush
    window._wsPendingFlush = true;
    window.dispatchEvent(new Event('pagehide'));
    const after1 = window.__flush;
    // rien en attente → pagehide NE DOIT PAS déclencher de flush
    window._wsPendingFlush = false;
    window.dispatchEvent(new Event('pagehide'));
    const after2 = window.__flush;
    return { after1: after1, after2: after2 };
  });
  expect(flushed.after1).toBe(1);
  expect(flushed.after2).toBe(1); // inchangé : aucun flush quand rien n'est en attente

  // (C) garde-fous : symboles toujours définis, pas de ReferenceError.
  const state = await page.evaluate(() => ({
    pushDefined: typeof pushWorkoutSessionsNow === 'function',
    feedDefined: typeof publishSessionActivity === 'function',
    syncDefined: typeof syncLogsToSupabase === 'function',
  }));
  expect(state.pushDefined).toBe(true);
  expect(state.feedDefined).toBe(true);
  expect(state.syncDefined).toBe(true);
});
