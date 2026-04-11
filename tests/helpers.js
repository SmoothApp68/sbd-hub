/**
 * Shared test helpers for SBD Hub E2E tests.
 *
 * The app shows an onboarding overlay on first launch (when db.user.onboarded is falsy)
 * and may also show a login screen. This helper seeds localStorage with a minimal valid
 * DB so the app boots straight to the main UI.
 */

const DEFAULT_DB = {
  user: {
    name: 'Test User',
    bw: 80,
    targets: { bench: 100, squat: 140, deadlift: 180 },
    level: 'intermediaire',
    gender: 'male',
    trainingMode: 'powerlifting',
    onboarded: true,
  },
  routine: null,
  logs: [],
  bestPR: { bench: 0, squat: 0, deadlift: 0 },
  reports: [],
  body: [],
  keyLifts: [],
  friends: [],
  social: { profileId: null, username: '', bio: '', visibility: 'public' },
  generatedProgram: null,
};

/**
 * Set up the page so the app boots without onboarding or login blocking the UI.
 * Call this BEFORE any test interactions.
 * @param {import('@playwright/test').Page} page
 * @param {object} dbOverrides - Fields to merge/override in the default DB
 */
async function setupPage(page, dbOverrides = {}) {
  // Navigate to the page first to set the origin for localStorage
  await page.goto('/', { waitUntil: 'commit' });

  // Seed localStorage with a valid DB using the app's actual storage key
  const mergedDB = deepMerge(structuredClone(DEFAULT_DB), dbOverrides);
  await page.evaluate((db) => {
    localStorage.setItem('SBD_HUB_V28', JSON.stringify(db));
  }, mergedDB);

  // Reload so the app picks up the seeded DB
  await page.reload({ waitUntil: 'load' });

  // Force-hide onboarding and login overlays
  await page.evaluate(() => {
    const ob = document.getElementById('onboarding-overlay');
    if (ob) ob.style.display = 'none';
    const login = document.getElementById('loginScreen');
    if (login) login.style.display = 'none';
  });

  // Wait for the main tab bar to be visible and interactive
  await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 15000 });
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function structuredClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = { setupPage, DEFAULT_DB };
