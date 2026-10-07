// Diagnostic — dumps visible text from each tab after DB injection
const { chromium } = require('playwright');

const TODAY = Date.now();
const DAY = 86400000;

const TEST_DB = {
  user: { name: 'Aurélien', bodyweight: 85, level: 'intermediaire', mode: 'powerbuilding', height: 178, age: 32, sex: 'm' },
  logs: [
    { date: new Date(TODAY - 2*DAY).toISOString().slice(0,10), exercise:'Squat', sets:[{weight:120,reps:5,rpe:8,done:true}] },
    { date: new Date(TODAY - 4*DAY).toISOString().slice(0,10), exercise:'Bench Press', sets:[{weight:90,reps:5,rpe:7.5,done:true}] },
    { date: new Date(TODAY - 6*DAY).toISOString().slice(0,10), exercise:'Deadlift', sets:[{weight:150,reps:4,rpe:8,done:true}] },
  ],
  weeklyPlan: {
    currentBlock: { phase:'deload', week:1, forcedAt: TODAY-1000, blockStartDate: TODAY-1000 },
    days: {
      lundi: { label:'Squat focus', exercises:[{name:'Squat',sets:3,reps:5,intensite:70,mechanic:'compound'},{name:'Leg Press',sets:2,reps:10,intensite:60,mechanic:'isolation'}] },
      mercredi: { label:'Bench focus', exercises:[{name:'Bench Press',sets:3,reps:5,intensite:70,mechanic:'compound'}] },
      vendredi: { label:'Deadlift focus', exercises:[{name:'Deadlift',sets:3,reps:3,intensite:70,mechanic:'compound'}] },
    },
  },
  exercises: { Squat:{e1rm:140,shadowWeight:100}, 'Bench Press':{e1rm:105,shadowWeight:80}, Deadlift:{e1rm:175,shadowWeight:125} },
  readiness: [
    { date: new Date(TODAY-DAY).toISOString().slice(0,10), score:7 },
    { date: new Date(TODAY-2*DAY).toISOString().slice(0,10), score:6 },
  ],
  reports: [],
  records: { Squat:{weight:130,reps:3}, 'Bench Press':{weight:100,reps:3}, Deadlift:{weight:160,reps:2} },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport:{width:390,height:844} });
  const page = await ctx.newPage();

  // Capture JS errors
  page.on('pageerror', e => console.error('JS ERROR:', e.message));
  page.on('console', m => { if (m.type()==='error') console.error('CONSOLE ERR:', m.text()); });

  await page.goto('http://localhost:8765', { waitUntil:'networkidle' });
  await page.evaluate(db => localStorage.setItem('SBD_HUB_V28', JSON.stringify(db)), TEST_DB);
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForTimeout(800);

  // Check what functions are globally available
  const globals = await page.evaluate(() => {
    return {
      showTab: typeof showTab,
      showLiveCoachBanner: typeof showLiveCoachBanner,
      computeSRS: typeof computeSRS,
      wpForcePhase: typeof wpForcePhase,
      renderProgramBuilderView: typeof renderProgramBuilderView,
      fillSettingsFields: typeof fillSettingsFields,
    };
  });
  console.log('\n=== GLOBAL FUNCTIONS ===');
  console.log(JSON.stringify(globals, null, 2));

  // Check localStorage after reload
  const storedDB = await page.evaluate(() => {
    const raw = localStorage.getItem('SBD_HUB_V28');
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { userHeight: d.user?.height, userAge: d.user?.age, phase: d.weeklyPlan?.currentBlock?.phase };
  });
  console.log('\n=== STORED DB (post-reload) ===');
  console.log(JSON.stringify(storedDB, null, 2));

  // Tab navigator helper
  const gotoTab = async (tabId) => {
    try {
      // Try data-tab attribute first
      const btn = page.locator(`[data-tab="${tabId}"], #nav-${tabId}`).first();
      if (await btn.count() > 0) { await btn.click(); }
      else { await page.evaluate(id => { if(typeof showTab==='function') showTab(id); }, tabId); }
    } catch(e) {
      await page.evaluate(id => { if(typeof showTab==='function') showTab(id); }, tabId);
    }
    await page.waitForTimeout(600);
  };

  // Programme tab
  await gotoTab('programme');
  const progContent = await page.locator('#tab-programme, #programme-tab, [data-content="programme"], .tab-content').first().innerText().catch(() => '');
  const progBodyText = await page.evaluate(() => {
    const el = document.querySelector('.tab-content.active, .tab-pane.active, #tab-programme');
    return el ? el.innerText : document.body.innerText;
  });
  console.log('\n=== PROGRAMME TAB (first 800 chars) ===');
  console.log(progBodyText.slice(0, 800));

  // Check what tab is active
  const activeTab = await page.evaluate(() => {
    const active = document.querySelector('.tab-content.active, .tab-pane.active, [class*="active"]');
    return active ? active.id || active.className : 'not found';
  });
  console.log('\n=== ACTIVE TAB ELEMENT ===', activeTab);

  // All nav buttons
  const navButtons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button, [data-tab], .nav-btn'));
    return btns.map(b => ({ text: b.textContent?.trim().slice(0,20), id: b.id, dataTab: b.dataset.tab }));
  });
  console.log('\n=== NAV BUTTONS ===');
  console.log(JSON.stringify(navButtons.slice(0,10), null, 2));

  // Coach tab
  await gotoTab('coach');
  const coachText = await page.evaluate(() => {
    const el = document.querySelector('.tab-content.active, .tab-pane.active');
    return el ? el.innerText : document.body.innerText;
  });
  console.log('\n=== COACH TAB (first 800 chars) ===');
  console.log(coachText.slice(0, 800));

  // Profil tab
  await gotoTab('profil');
  const profilText = await page.evaluate(() => {
    const el = document.querySelector('.tab-content.active, .tab-pane.active');
    return el ? el.innerText : document.body.innerText;
  });
  const settingsInputs = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.map(i => ({ id: i.id, name: i.name, value: i.value, type: i.type, placeholder: i.placeholder }));
  });
  console.log('\n=== PROFIL TAB (first 600 chars) ===');
  console.log(profilText.slice(0, 600));
  console.log('\n=== SETTINGS INPUTS ===');
  console.log(JSON.stringify(settingsInputs, null, 2));

  await browser.close();
})();
