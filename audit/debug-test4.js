const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.addInitScript((args) => {
    const { key, data } = args;
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(data));
  }, {
    key: 'SBD_HUB_V29',
    data: {
      user: {
        name: 'TestBeta', age: 28, bw: 80, height: 178, gender: 'M',
        onboardingProfile: 'intermediaire',
        programParams: { freq: 4, goal: 'force_physique', level: 'intermediate' },
        onboardingPRs: { squat: 100, bench: 80, deadlift: 120 },
        barWeight: 20, units: 'kg', tier: 'premium',
        streak: 0, vocabLevel: 2, lpActive: true, lpStrikes: {},
        activityTemplate: [],
        coachProfile: 'full',
        onboardingDate: new Date(Date.now() - 3 * 86400000).toISOString(),
        onboarded: true, level: 'intermediaire',
        trainingMode: 'powerbuilding'
      },
      logs: [], exercises: {}, bestPR: { squat: 100, bench: 80, deadlift: 120 }, weeklyPlan: {
        week: 1,
        days: [
          { day: 'Lundi', title: '🦵 Squat', rest: false, exercises: [{ name: 'Squat (Barre)', type: 'weight', isPrimary: true, sets: [{ reps: 5, weight: 80, rpe: 7.5, isWarmup: false }], restSeconds: 300 }] },
          { day: 'Mardi', title: '😴 Repos', rest: true, exercises: [] },
          { day: 'Mercredi', title: '💪 Bench', rest: false, exercises: [{ name: 'Développé couché (Barre)', type: 'weight', isPrimary: true, sets: [{ reps: 5, weight: 65, rpe: 7.5, isWarmup: false }], restSeconds: 240 }] },
          { day: 'Jeudi', title: '😴 Repos', rest: true, exercises: [] },
          { day: 'Vendredi', title: '🔙 Deadlift', rest: false, exercises: [{ name: 'Soulevé de terre (Barre)', type: 'weight', isPrimary: true, sets: [{ reps: 5, weight: 95, rpe: 7.5, isWarmup: false }], restSeconds: 300 }] },
          { day: 'Samedi', title: '🦵 Squat Force', rest: false, exercises: [{ name: 'Squat (Barre)', type: 'weight', isPrimary: true, sets: [{ reps: 5, weight: 80, rpe: 7.5, isWarmup: false }], restSeconds: 300 }] },
          { day: 'Dimanche', title: '😴 Repos', rest: true, exercises: [] }
        ]
      },
      activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0,
      _dupMigrated: false, _activityMigrated: true,
      todayWellbeing: { date: new Date().toISOString().split('T')[0], sleep: 4, readiness: 4 },
      gamification: { xp: 0, level: 1, badges: [], lastTab: null },
      reports: [], body: [], keyLifts: [],
      social: { profileId: null, username: '', bio: '', visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' }, onboardingCompleted: false, usernameChangedAt: null }
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('ERROR:', msg.text().substring(0, 200));
  });

  await page.goto('http://localhost:3456/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Navigate to seances-go
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (typeof showSeancesSub === 'function') showSeancesSub('seances-go');
  });
  await page.waitForTimeout(2000);

  const goContent = await page.evaluate(() => {
    var el = document.getElementById('seances-go');
    return el ? el.innerHTML.substring(0, 2000) : 'ELEMENT NOT FOUND';
  });
  console.log('GO tab content (first 2000 chars):', goContent.substring(0, 1000));

  const hasWorkout = await page.evaluate(() => !!window.activeWorkout);
  console.log('Active workout:', hasWorkout);

  // Try to start workout
  await page.evaluate(() => {
    db.todayWellbeing = { date: new Date().toISOString().split('T')[0], sleep: 4, readiness: 4 };
    if (typeof _goDoStartWorkout === 'function') {
      console.log('Starting workout...');
      _goDoStartWorkout(true);
      if (typeof goRequestRender === 'function') goRequestRender();
    }
  });
  await page.waitForTimeout(2000);

  const goContent2 = await page.evaluate(() => {
    var el = document.getElementById('seances-go');
    return el ? el.innerHTML.substring(0, 3000) : 'ELEMENT NOT FOUND';
  });
  console.log('GO tab after start (contains Galettes?):', goContent2.includes('Galettes'));
  console.log('Active workout after:', await page.evaluate(() => !!window.activeWorkout));
  
  if (goContent2.includes('Galettes')) {
    console.log('SUCCESS: Galettes found!');
  } else {
    console.log('GO tab snippet:', goContent2.substring(0, 500));
  }

  await page.screenshot({ path: '/home/user/sbd-hub/audit/screenshots/debug-test4.png' });
  await browser.close();
})();
