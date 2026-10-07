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

  const dbData = {
    "user": {
      "name": "TestBeta", "age": 28, "bw": 80, "height": 178, "gender": "M",
      "onboardingProfile": "intermediaire",
      "programParams": { "freq": 4, "goal": "force_physique", "level": "intermediate" },
      "onboardingPRs": { "squat": 100, "bench": 80, "deadlift": 120 },
      "barWeight": 20, "units": "kg", "tier": "premium",
      "streak": 0, "vocabLevel": 2, "lpActive": true, "lpStrikes": {},
      "activityTemplate": [
        { "type": "natation", "intensity": 3, "days": ["Mercredi"], "duration": 45, "fixed": true }
      ],
      "coachProfile": "full",
      "onboardingDate": onboardingDate,
      "trainingMode": "powerbuilding",
      "onboarded": true,
      "level": "intermediaire"
    },
    "logs": [], "exercises": {}, "bestPR": { "squat": 100, "bench": 80, "deadlift": 120 },
    "weeklyPlan": null,
    "activityLogs": [], "earnedBadges": {}, "xpHighWaterMark": 0,
    "_dupMigrated": false, "_activityMigrated": true,
    "todayWellbeing": { "date": todayStr, "sleep": 4, "readiness": 4 },
    "gamification": { "xp": 0, "level": 1, "badges": [], "xpHighWaterMark": 0 }
  };

  await page.addInitScript((data) => {
    localStorage.clear();
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(data));
  }, dbData);

  const results = {};

  // ── TEST 1 — weeklyPlan J1 (critical) ──────────────────────────────────────
  console.log('\n=== TEST 1: weeklyPlan J1 auto-génération ===');
  await page.goto('http://localhost:3456/');
  await page.waitForTimeout(3000);

  const test1 = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('SBD_HUB_V29');
      if (!raw) return { weeklyPlanExists: false, daysLength: 0, error: 'no DB in localStorage' };
      const db = JSON.parse(raw);
      const wp = db.weeklyPlan;
      return {
        weeklyPlanExists: !!wp,
        daysLength: wp && wp.days ? wp.days.length : 0,
        weeklyPlanKeys: wp ? Object.keys(wp) : [],
        hasDays: wp && wp.days && wp.days.length > 0
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log('weeklyPlan result:', JSON.stringify(test1));

  // Navigate to Séances > Programme sub-tab via showTab function
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
    if (typeof showSeancesSub === 'function') setTimeout(() => showSeancesSub('seances-programme'), 200);
  });
  await page.waitForTimeout(1000);

  const programmeContent = await page.evaluate(() => {
    const el = document.getElementById('seances-programme');
    return el ? el.innerHTML.substring(0, 500) : 'not found';
  });
  const programmeEmpty = programmeContent.includes('Comment tu veux créer ton programme') ||
                         programmeContent === 'not found' ||
                         programmeContent.trim().length < 50;
  console.log('Programme sub-section empty:', programmeEmpty);
  console.log('Programme content (first 200):', programmeContent.substring(0, 200));

  await page.screenshot({ path: '/home/user/sbd-hub/audit/screenshots/01-programme-j1-v148.png', fullPage: false });
  results.test1 = { ...test1, programmeEmpty, pass: test1.hasDays && !programmeEmpty };

  // ── TEST 2 — Gamification tab ──────────────────────────────────────────────
  console.log('\n=== TEST 2: Gamification tab (tab-game) ===');
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-game');
  });
  await page.waitForTimeout(1500);

  // Check gamLevelCard (active by default in jeux-profil-joueur)
  const levelCardLen = await page.evaluate(() => {
    const el = document.getElementById('gamLevelCard');
    return el ? el.innerHTML.length : -1;
  });
  console.log('gamLevelCard innerHTML length:', levelCardLen);

  // Now navigate to jeux-badges sub-tab to reveal gamLeaderboard and gamChallengesSection
  await page.evaluate(() => {
    if (typeof showJeuxSub === 'function') showJeuxSub('jeux-badges');
  });
  await page.waitForTimeout(1500);

  const test2 = await page.evaluate(() => {
    const leaderboard = document.getElementById('gamLeaderboard');
    const challenges = document.getElementById('gamChallengesSection');
    const badges = document.getElementById('gamBadgesSections');
    const levelCard = document.getElementById('gamLevelCard');
    return {
      gamLeaderboardExists: !!leaderboard,
      gamChallengesSectionExists: !!challenges,
      gamLeaderboardLength: leaderboard ? leaderboard.innerHTML.length : -1,
      gamChallengesSectionLength: challenges ? challenges.innerHTML.length : -1,
      gamBadgesSectionsLength: badges ? badges.innerHTML.length : -1,
      gamLevelCardLength: levelCard ? levelCard.innerHTML.length : -1,
    };
  });
  console.log('Gamification tab result:', JSON.stringify(test2));

  await page.screenshot({ path: '/home/user/sbd-hub/audit/screenshots/02-gamification-v148.png', fullPage: false });
  results.test2 = {
    ...test2,
    badgesOk: test2.gamBadgesSectionsLength > 100,
    levelCardOk: test2.gamLevelCardLength > 100,
    leaderboardOk: test2.gamLeaderboardExists,
    challengesOk: test2.gamChallengesSectionExists,
    pass: test2.gamLeaderboardExists && test2.gamChallengesSectionExists && test2.gamLevelCardLength > 100
  };

  // ── TEST 3 — GO tab ────────────────────────────────────────────────────────
  console.log('\n=== TEST 3: GO tab (workout start) ===');
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
    setTimeout(() => {
      if (typeof showSeancesSub === 'function') showSeancesSub('seances-go');
    }, 300);
  });
  await page.waitForTimeout(1500);

  const goBeforeStart = await page.evaluate(() => {
    const el = document.getElementById('seances-go');
    return el ? el.innerHTML.substring(0, 400) : 'not found';
  });
  console.log('GO tab before start:', goBeforeStart.substring(0, 200));

  // Try starting workout
  const startResult = await page.evaluate(() => {
    try {
      if (typeof _goDoStartWorkout === 'function') {
        _goDoStartWorkout(true);
        if (typeof goRequestRender === 'function') goRequestRender();
        return 'started';
      } else {
        return '_goDoStartWorkout not found';
      }
    } catch (e) {
      return 'error: ' + e.message;
    }
  });
  console.log('GO start result:', startResult);
  await page.waitForTimeout(2000);

  const test3 = await page.evaluate((sr) => {
    const body = document.body.innerHTML;
    const goSection = document.getElementById('seances-go');
    const goContent = goSection ? goSection.innerHTML : '';
    return {
      hasGalettes: body.includes('Galettes') || body.includes('galettes') || body.includes('galette'),
      hasWarmup: goContent.includes('échauffement') || goContent.includes('warmup') || goContent.includes('Warmup') || goContent.includes('Échauffement') || goContent.includes('chauffe'),
      goContentLength: goContent.length,
      goContentSnippet: goContent.substring(0, 300),
      startResult: sr
    };
  }, startResult);
  console.log('GO tab result:', JSON.stringify({ hasGalettes: test3.hasGalettes, hasWarmup: test3.hasWarmup, goContentLength: test3.goContentLength }));

  await page.screenshot({ path: '/home/user/sbd-hub/audit/screenshots/03-go-v148.png', fullPage: false });
  results.test3 = { ...test3, pass: test3.hasGalettes };

  // ── TEST 4 — Coach tab ─────────────────────────────────────────────────────
  console.log('\n=== TEST 4: Coach tab ===');
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
    setTimeout(() => {
      if (typeof showSeancesSub === 'function') showSeancesSub('seances-coach');
    }, 300);
  });
  await page.waitForTimeout(1500);

  const test4 = await page.evaluate(() => {
    const coachSection = document.getElementById('seances-coach');
    const coachToday = document.getElementById('coach-today');
    const content = coachToday ? coachToday.innerHTML : (coachSection ? coachSection.innerHTML : '');
    const text = document.body.innerText || '';
    const hasUndefined = text.includes('undefined');
    const hasNaN = text.includes('NaN');
    return {
      contentLength: content.length,
      hasUndefined,
      hasNaN,
      contentSnippet: content.substring(0, 300)
    };
  });
  console.log('Coach tab result:', JSON.stringify({ contentLength: test4.contentLength, hasUndefined: test4.hasUndefined, hasNaN: test4.hasNaN }));

  await page.screenshot({ path: '/home/user/sbd-hub/audit/screenshots/04-coach-v148.png', fullPage: false });
  results.test4 = { ...test4, pass: test4.contentLength > 500 && !test4.hasUndefined && !test4.hasNaN };

  // ── FINAL REPORT ───────────────────────────────────────────────────────────
  console.log('\n=== FINAL RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('\nERRORS:', errors.length, JSON.stringify(errors, null, 2));

  await browser.close();
})();
