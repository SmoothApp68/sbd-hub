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

  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
    setTimeout(() => { if (typeof showSeancesSub === 'function') showSeancesSub('seances-go'); }, 300);
  });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    if (typeof _goDoStartWorkout === 'function') _goDoStartWorkout(true);
    if (typeof goRequestRender === 'function') goRequestRender();
  });
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const go = document.getElementById('seances-go');
    const goHTML = go ? go.innerHTML : '';
    const workout = document.getElementById('goWorkoutView');
    const idle = document.getElementById('goIdleView');
    return {
      goSectionLen: goHTML.length,
      goSnippet: goHTML.substring(0, 1200),
      workoutViewDisplay: workout ? workout.style.display : 'not found',
      idleViewDisplay: idle ? idle.style.display : 'not found',
      hasGalettes: goHTML.includes('Galette') || goHTML.includes('galette'),
      hasPlate: goHTML.includes('plate') || goHTML.includes('Plate'),
      hasKg: goHTML.includes('kg') || goHTML.includes('Kg'),
      bodyGalettes: document.body.innerHTML.includes('Galette') || document.body.innerHTML.includes('galette'),
    };
  });
  console.log('GO info:', JSON.stringify(info, null, 2));

  await page.screenshot({ path: '/home/user/sbd-hub/audit/screenshots/03-go-v148-detail.png' });
  await browser.close();
})();
