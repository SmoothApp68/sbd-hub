const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('ERR_CERT') && !text.includes('vibrate') && !text.includes('404')) {
        errors.push(text.substring(0, 300));
      }
    }
  });

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(today.getDate() - 3);
  const onboardingDate = threeDaysAgo.toISOString();
  const dbData = {"user":{"name":"TestBeta","age":28,"bw":80,"height":178,"gender":"M","onboardingProfile":"intermediaire","programParams":{"freq":4,"goal":"force_physique","level":"intermediate"},"onboardingPRs":{"squat":100,"bench":80,"deadlift":120},"barWeight":20,"units":"kg","tier":"premium","streak":0,"vocabLevel":2,"lpActive":true,"lpStrikes":{},"activityTemplate":[{"type":"natation","intensity":3,"days":["Mercredi"],"duration":45,"fixed":true}],"coachProfile":"full","onboardingDate":onboardingDate,"trainingMode":"powerbuilding","onboarded":true,"level":"intermediaire"},"logs":[],"exercises":{},"bestPR":{"squat":100,"bench":80,"deadlift":120},"weeklyPlan":null,"activityLogs":[],"earnedBadges":{},"xpHighWaterMark":0,"_dupMigrated":false,"_activityMigrated":true,"todayWellbeing":{"date":todayStr,"sleep":4,"readiness":4},"gamification":{"xp":0,"level":1,"badges":[],"xpHighWaterMark":0}};

  await page.addInitScript((data) => {
    localStorage.clear();
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(data));
  }, dbData);

  await page.goto('http://localhost:3456/');
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
    setTimeout(() => { if (typeof showSeancesSub === 'function') showSeancesSub('seances-go'); }, 300);
  });
  await page.waitForTimeout(1500);

  // Start empty session then add a squat exercise
  const startResult = await page.evaluate(() => {
    try {
      // Start libre session
      _goDoStartWorkout(false);
      goRequestRender();
      return 'started';
    } catch (e) {
      return 'error: ' + e.message;
    }
  });
  console.log('Start result:', startResult);
  await page.waitForTimeout(1000);

  // Add an exercise (Squat)
  const addExoResult = await page.evaluate(() => {
    try {
      if (typeof goAddExercise === 'function') {
        goAddExercise('squat');
        goRequestRender();
        return 'goAddExercise(squat) called';
      } else if (typeof addExoToWorkout === 'function') {
        addExoToWorkout('squat');
        return 'addExoToWorkout called';
      } else {
        // Manually add to activeWorkout
        if (window.activeWorkout) {
          window.activeWorkout.exercises.push({
            id: 'squat',
            name: 'Squat',
            sets: [{ kg: 80, reps: 5, done: false }],
            isPrimary: true
          });
          if (typeof goRequestRender === 'function') goRequestRender();
          return 'manually added';
        }
        return 'no method available';
      }
    } catch (e) {
      return 'error: ' + e.message;
    }
  });
  console.log('Add exo result:', addExoResult);
  await page.waitForTimeout(1000);

  const activeInfo = await page.evaluate(() => {
    const activeView = document.getElementById('goActiveView');
    const goSection = document.getElementById('seances-go');
    const activeHTML = activeView ? activeView.innerHTML : '';
    const goHTML = goSection ? goSection.innerHTML : '';
    return {
      activeViewDisplay: activeView ? activeView.style.display : 'not found',
      idleViewDisplay: document.getElementById('goIdleView') ? document.getElementById('goIdleView').style.display : 'not found',
      activeViewLen: activeHTML.length,
      activeViewSnippet: activeHTML.substring(0, 800),
      hasGalettes: goHTML.includes('Galette') || goHTML.includes('galette'),
      hasWarmup: goHTML.includes('chauff') || goHTML.includes('warmup') || goHTML.includes('Warmup'),
      activeWorkoutExists: typeof activeWorkout !== 'undefined' && activeWorkout !== null,
      activeWorkoutExos: typeof activeWorkout !== 'undefined' && activeWorkout ? activeWorkout.exercises.length : 0,
    };
  });
  console.log('Active view info:', JSON.stringify(activeInfo, null, 2));
  console.log('Errors:', errors);

  await page.screenshot({ path: '/home/user/sbd-hub/audit/screenshots/03-go-v148-active.png' });
  await browser.close();
})();
