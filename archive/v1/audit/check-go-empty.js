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

  // Start an empty/libre session (not a planned session - this should always work)
  const startResult = await page.evaluate(() => {
    try {
      if (typeof goStartWorkout === 'function') {
        goStartWorkout(false); // false = libre/empty session
        return 'goStartWorkout(false) called';
      }
      return '_goDoStartWorkout not available';
    } catch (e) {
      return 'error: ' + e.message;
    }
  });
  console.log('Start result:', startResult);
  await page.waitForTimeout(2000);

  const goInfo = await page.evaluate(() => {
    const go = document.getElementById('seances-go');
    const goHTML = go ? go.innerHTML : '';
    return {
      hasGalettes: goHTML.includes('Galette') || goHTML.includes('galette'),
      hasPlate: goHTML.includes('plate-') || goHTML.toLowerCase().includes('plateau'),
      hasExercise: goHTML.includes('exo') || goHTML.includes('exercice'),
      goContentLen: goHTML.length,
      goSnippet: goHTML.substring(0, 600),
    };
  });
  console.log('GO after empty start:', JSON.stringify(goInfo, null, 2));
  console.log('Errors:', errors);

  await page.screenshot({ path: '/home/user/sbd-hub/audit/screenshots/03-go-empty-session.png' });
  await browser.close();
})();
