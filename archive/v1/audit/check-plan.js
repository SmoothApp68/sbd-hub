const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

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

  const planInfo = await page.evaluate(() => {
    const raw = localStorage.getItem('SBD_HUB_V29');
    const db = JSON.parse(raw);
    const wp = db.weeklyPlan;
    if (!wp || !wp.days) return { error: 'no plan' };
    const days = wp.days.map((d, i) => ({
      index: i,
      type: d.type,
      label: d.label,
      exercises: d.exercises ? d.exercises.length : 0
    }));
    const today = new Date();
    const todayIdx = today.getDay(); // 0=Sun, 1=Mon...
    return {
      days,
      todayDayOfWeek: todayIdx,
      todayDayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][todayIdx],
      todayDay: wp.days[todayIdx] ? { type: wp.days[todayIdx].type, label: wp.days[todayIdx].label } : null
    };
  });
  console.log('Weekly plan:', JSON.stringify(planInfo, null, 2));

  // Try force-starting a workout on a training day
  // Find first training day
  const firstTrainingDay = planInfo.days ? planInfo.days.find(d => d.type !== 'rest' && d.type !== 'off') : null;
  console.log('First training day:', JSON.stringify(firstTrainingDay));

  // Check if goStartWorkout function exists and try it
  const startInfo = await page.evaluate(() => {
    return {
      hasGoStartWorkout: typeof goStartWorkout === 'function',
      hasGoStartWorkoutWithSession: typeof goStartWorkout === 'function',
      hasGoDoStartWorkout: typeof _goDoStartWorkout === 'function',
      // Check goState
      goStateType: typeof window.goState !== 'undefined' ? window.goState.phase : 'not found',
    };
  });
  console.log('GO functions:', JSON.stringify(startInfo));

  await browser.close();
})();
