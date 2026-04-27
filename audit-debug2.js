// Quick debug: check db state inside app after injection
const { chromium } = require('playwright');

const TODAY = Date.now();
const DAY = 86400000;

const TEST_DB = {
  user: {
    name: 'Aurélien', bodyweight: 85, bw: 85, level: 'intermediaire',
    mode: 'powerbuilding', trainingMode: 'powerbuilding',
    height: 178, age: 32, sex: 'm', onboarded: true, quizDone: true,
  },
  logs: [
    { date: new Date(TODAY - 2*DAY).toISOString().slice(0,10),
      timestamp: TODAY - 2*DAY, exercise:'Squat',
      exercises:[{name:'Squat',sets:[{weight:120,reps:5,rpe:8,done:true}]}],
      sets:[{weight:120,reps:5,rpe:8,done:true},{weight:120,reps:5,rpe:8.5,done:true}] },
    { date: new Date(TODAY - 4*DAY).toISOString().slice(0,10),
      timestamp: TODAY - 4*DAY, exercise:'Bench Press',
      exercises:[{name:'Bench Press',sets:[{weight:90,reps:5,rpe:7.5,done:true}]}],
      sets:[{weight:90,reps:5,rpe:7.5,done:true},{weight:90,reps:5,rpe:8,done:true}] },
    { date: new Date(TODAY - 6*DAY).toISOString().slice(0,10),
      timestamp: TODAY - 6*DAY, exercise:'Deadlift',
      exercises:[{name:'Deadlift',sets:[{weight:150,reps:4,rpe:8,done:true}]}],
      sets:[{weight:150,reps:4,rpe:8,done:true},{weight:150,reps:4,rpe:8.5,done:true}] },
  ],
  weeklyPlan: {
    currentBlock: { phase:'deload', week:1, forcedAt: TODAY-1000, blockStartDate: TODAY-1000 },
    days: {
      lundi: { label:'Squat focus', exercises:[{name:'Squat',sets:3,reps:5,intensite:70,mechanic:'compound'}] },
      mercredi: { label:'Bench focus', exercises:[{name:'Bench Press',sets:3,reps:5,intensite:70,mechanic:'compound'}] },
    },
  },
  routine: { Lundi: 'Squat', Mercredi: 'Bench Press', Vendredi: 'Deadlift' },
  generatedProgram: [
    { day:'Lundi', exercise:'Squat', sets:3, reps:5, intensity:70 },
    { day:'Mercredi', exercise:'Bench Press', sets:3, reps:5, intensity:70 },
    { day:'Vendredi', exercise:'Deadlift', sets:3, reps:3, intensity:70 },
  ],
  exercises: {
    Squat:{e1rm:140,shadowWeight:100,history:[]},
    'Bench Press':{e1rm:105,shadowWeight:80,history:[]},
    Deadlift:{e1rm:175,shadowWeight:125,history:[]},
  },
  readiness: [
    {date:new Date(TODAY-DAY).toISOString().slice(0,10),score:7},
    {date:new Date(TODAY-2*DAY).toISOString().slice(0,10),score:6},
  ],
  reports: [],
  records: { Squat:{weight:130,reps:3}, 'Bench Press':{weight:100,reps:3}, Deadlift:{weight:160,reps:2} },
  bestPR: { squat: 130, bench: 100, deadlift: 160 },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport:{width:390,height:844} });
  const page = await ctx.newPage();

  await page.route('**://cdn.jsdelivr.net/**supabase**', route => route.fulfill({ status:200, contentType:'application/javascript', body:'// blocked' }));
  await page.route('**://*.supabase.co/**', route => route.abort());

  page.on('pageerror', e => console.error('JS ERR:', e.message));

  await page.goto('http://localhost:8765', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.evaluate(db => localStorage.setItem('SBD_HUB_V28', JSON.stringify(db)), TEST_DB);
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForTimeout(1200);

  // Force hide login
  await page.evaluate(() => {
    ['loginScreen','onboardingModal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  });

  // Check db state inside app
  const dbState = await page.evaluate(() => {
    return {
      logsLen: window.db && window.db.logs ? window.db.logs.length : 'N/A',
      firstLog: window.db && window.db.logs && window.db.logs[0] ? JSON.stringify(window.db.logs[0]).slice(0,100) : 'none',
      userMode: window.db && window.db.user ? (window.db.user.mode + ' / ' + window.db.user.trainingMode) : 'N/A',
      hasRoutine: !!(window.db && window.db.routine && Object.keys(window.db.routine).length > 0),
      hasGenPgm: !!(window.db && window.db.generatedProgram && window.db.generatedProgram.length > 0),
      height: window.db && window.db.user ? window.db.user.height : 'N/A',
      age: window.db && window.db.user ? window.db.user.age : 'N/A',
    };
  });
  console.log('DB state:', JSON.stringify(dbState, null, 2));

  // Navigate to coach and check output
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-seances');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (typeof showSeancesSub === 'function') showSeancesSub('seances-coach');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (typeof showCoachSub === 'function') showCoachSub('coach-today');
  });
  await page.waitForTimeout(1000);

  const coachHtml = await page.evaluate(() => {
    const el = document.getElementById('coach-today');
    return el ? el.innerHTML.slice(0,500) : 'not found';
  });
  console.log('\nCoach today HTML:', coachHtml);

  // Navigate to Programme
  await page.evaluate(() => {
    if (typeof showSeancesSub === 'function') showSeancesSub('seances-programme');
  });
  await page.waitForTimeout(800);
  const progText = await page.evaluate(() => {
    const el = document.getElementById('seances-programme');
    return el ? el.innerText.slice(0,400) : 'not found';
  });
  console.log('\nProgramme text:', progText.replace(/\n+/g,' '));

  // Check settingsHeight and settingsAge
  await page.evaluate(() => {
    if (typeof showTab === 'function') showTab('tab-profil');
  });
  await page.waitForTimeout(600);
  const profilCheck = await page.evaluate(() => {
    const h = document.getElementById('settingsHeight');
    const a = document.getElementById('settingsAge');
    return {
      heightVal: h ? h.value : 'not found',
      ageVal: a ? a.value : 'not found',
      heightVisible: h ? h.offsetParent !== null : false,
    };
  });
  console.log('\nProfil check:', JSON.stringify(profilCheck));

  await browser.close();
})();
