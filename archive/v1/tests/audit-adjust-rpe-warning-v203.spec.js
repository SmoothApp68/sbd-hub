const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';

const AURELIEN_DB = {
  user: {
    name: 'Aurélien', age: 38, bw: 98, height: 178, gender: 'male',
    level: 'avance', trainingMode: 'powerbuilding', onboardingProfile: 'powerlifter',
    onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
    units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 90, vocabLevel: 2,
    programParams: { freq: 5, goal: 'mixte', goals: ['hypertrophie'], level: 'avance',
      mat: 'salle', cardio: 'integre', duration: 90, injuries: [],
      selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] },
    onboardingPRs: { squat: 148, bench: 140, deadlift: 186 }
  },
  bestPR: { squat: 148, bench: 140, deadlift: 186 },
  weeklyPlan: {
    days: [
      { day: 'Lundi', title: 'Squat', rest: false, exercises: [
        { name: 'Squat (Barre)', isPrimary: true,  sets: [{weight:140,reps:5,isWarmup:false}] },
        { name: 'Presse à Cuisses', isPrimary: false, sets: [{weight:200,reps:8,isWarmup:false}] },
        { name: 'Leg Extension', isCorrectivePriority: true, sets: [{weight:60,reps:12,isWarmup:false}] }
      ]},
      { day: 'Mardi', title: 'Bench', rest: false, exercises: [
        { name: 'Développé Couché (Barre)', isPrimary: true, sets: [{weight:120,reps:5,isWarmup:false}] }
      ]}
    ]
  },
  logs: [], activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0
};

async function seed(page, db) {
  await page.goto('/', { waitUntil: 'commit' });
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload({ waitUntil: 'load' });
  await page.addStyleTag({ content: '#loginScreen, #onboarding-overlay { display: none !important; }' });
  await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 15000 });
}

test.describe('v203 — Ajuster ma séance + RPE Slider + Warning charge', () => {

  test('ADJUST-01 — openAdjustSession() → overlay avec tabs des jours', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const hasOverlay = await page.evaluate(() => {
      if (typeof openAdjustSession !== 'function') return null;
      openAdjustSession();
      return !!document.getElementById('adjustSessionOverlay');
    });
    expect(hasOverlay).toBe(true);
  });

  test('ADJUST-02 — isPrimary → bouton 🔒 (pas ✏️)', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const html = await page.evaluate(() => {
      openAdjustSession();
      return document.getElementById('adjustSessionOverlay').innerHTML;
    });
    expect(html).toContain('Squat (Barre)');
    expect(html).toContain('🔒');
  });

  test('ADJUST-03 — isCorrectivePriority → bouton 🔒', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const html = await page.evaluate(() => {
      openAdjustSession();
      return document.getElementById('adjustSessionOverlay').innerHTML;
    });
    expect(html).toContain('Leg Extension');
    expect(html).toMatch(/Leg Extension[\s\S]*🔒/);
  });

  test('ADJUST-04 — Presse à Cuisses → 3 alternatives dont Hack Squat', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const alts = await page.evaluate(() => {
      return EXERCISE_ALTERNATIVES['Presse à Cuisses'];
    });
    expect(alts).toBeTruthy();
    expect(alts.length).toBe(3);
    expect(alts).toContain('Hack Squat');
  });

  test('ADJUST-05 — _adjustConfirm permanent=true → db.exercisePreferences mis à jour', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const pref = await page.evaluate(() => {
      document.querySelectorAll = () => [];  // stub
      _adjustConfirm('Presse à Cuisses', 'Hack Squat', 'Lundi', true);
      return db.exercisePreferences && db.exercisePreferences['Presse à Cuisses'];
    });
    expect(pref).toBeTruthy();
    expect(pref.replacement).toBe('Hack Squat');
    expect(pref.count).toBe(1);
  });

  test('ADJUST-06 — _adjustConfirm permanent=false → seul le jour concerné', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const result = await page.evaluate(() => {
      document.querySelectorAll = () => [];
      _adjustConfirm('Squat (Barre)', 'Front Squat', 'Lundi', false);
      var lundi = db.weeklyPlan.days.find(d => d.day === 'Lundi');
      var mardi = db.weeklyPlan.days.find(d => d.day === 'Mardi');
      return {
        lundiHas: lundi.exercises.some(e => e.name === 'Front Squat'),
        prefsExist: !!db.exercisePreferences
      };
    });
    expect(result.lundiHas).toBe(true);
    expect(result.prefsExist).toBe(false);
  });

  test('RPE-01 — slider RPE → légende dynamique', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const result = await page.evaluate(() => {
      var hasFn = typeof _goRpeSliderHTML === 'function' && typeof goUpdateRpe === 'function';
      var hasLegends = typeof _RPE_LEGENDS !== 'undefined' && _RPE_LEGENDS[7] && _RPE_LEGENDS[10];
      var html = hasFn ? _goRpeSliderHTML(0, 0, 7) : '';
      return {
        functions: hasFn, legends: !!hasLegends,
        sliderInHtml: html.includes('type="range"'),
        legendInHtml: html.includes('Difficile, 3 reps en réserve')
      };
    });
    expect(result.functions).toBe(true);
    expect(result.legends).toBe(true);
    expect(result.sliderInHtml).toBe(true);
    expect(result.legendInHtml).toBe(true);
  });

  test('CHARGE-01 — charge > 15% plan → toast + flag high_variance', async ({ page }) => {
    await seed(page, AURELIEN_DB);
    const result = await page.evaluate(() => {
      activeWorkout = {
        id: 'test',
        exercises: [{
          name: 'Squat (Barre)',
          sets: [{
            weight: 170,        // 21% > 140 plan
            plannedWeight: 140,
            reps: 5,
            type: 'normal',
            completed: false,
            rpe: null
          }],
          restSeconds: 180
        }]
      };
      goToggleSetComplete(0, 0);
      var set = activeWorkout.exercises[0].sets[0];
      return { flags: set.flags || [], completed: set.completed };
    });
    expect(result.completed).toBe(true);
    expect(result.flags).toContain('high_variance');
  });
});
