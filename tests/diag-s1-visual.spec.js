const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

// Scénario A : Aurélien avec lastDeloadDate dans localStorage (Supabase sync OK)
function aurelienOK() {
  return {
    user: {
      name: 'Aurélien', age: 35, bw: 98, height: 178, gender: 'male',
      level: 'avance', trainingMode: 'powerbuilding',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'premium', trainingDuration: 90,
      programMode: 'auto', injuries: [], lpActive: false, lpStrikes: {},
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 5, goal: 'masse', goals: ['masse'], level: 'avance',
        mat: 'salle', duration: 90, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
    },
    bestPR: { squat: 148, bench: 140, deadlift: 186 },
    exercises: {}, readiness: [], logs: [{ timestamp: Date.now() - 86400000, exercises: [] }],
    activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0, routine: {},
    weeklyPlan: {
      lastDeloadDate: '2026-04-27T00:00:00.000Z',
      currentBlock: { phase: 'hypertrophie', week: 2, blockStartDate: new Date('2026-05-04T00:00:00Z').getTime() }
    }
  };
}

// Scénario B : localStorage SANS lastDeloadDate (état pré-v225)
function aurelienStale() {
  var db = aurelienOK();
  delete db.weeklyPlan.lastDeloadDate;
  return db;
}

function exposeDbScript() {
  return 'window.__diag_db = (typeof db !== "undefined") ? db : null;';
}

async function snapshot(page) {
  return await page.evaluate((injectScript) => {
    var s = document.createElement('script');
    s.textContent = injectScript;
    document.body.appendChild(s); s.remove();
    var d = window.__diag_db;
    var cb = d && d.weeklyPlan && d.weeklyPlan.currentBlock;
    var html = (typeof renderProgramIdentityCard === 'function') ? renderProgramIdentityCard() : '';
    var weekMatch = html.match(/S(\d+|\?)/);
    return {
      lastDeloadDate: d && d.weeklyPlan ? d.weeklyPlan.lastDeloadDate : null,
      cbWeek: cb && cb.week,
      cbPhase: cb && cb.phase,
      headerWeek: weekMatch ? weekMatch[0] : null
    };
  }, exposeDbScript());
}

test('SCÉNARIO A — localStorage AVEC lastDeloadDate (cas idéal)', async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(data));
  }, aurelienOK());
  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  var snap = await snapshot(page);
  console.log('SCÉNARIO A — POST-LOAD :', JSON.stringify(snap, null, 2));
  expect(snap.cbWeek).toBe(2);
  expect(snap.headerWeek).toBe('S2');

  // Click ⚡
  await page.evaluate(() => { try { generateWeeklyPlan(); } catch(e) {} });
  var snapGen = await snapshot(page);
  console.log('SCÉNARIO A — APRÈS ⚡ :', JSON.stringify(snapGen, null, 2));

  await page.screenshot({ path: 'audit/diag-s1-scenarioA.png', fullPage: false });
});

test('SCÉNARIO B — localStorage SANS lastDeloadDate (état legacy)', async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('SBD_HUB_V29', JSON.stringify(data));
  }, aurelienStale());
  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  var snap = await snapshot(page);
  console.log('SCÉNARIO B — POST-LOAD (sans lastDeloadDate) :', JSON.stringify(snap, null, 2));
  // Avec lastDeloadDate absent, weeksSince calculé depuis blockStartDate (4 mai → 1.3w → 1)
  // ⇒ S1 attendu, c'est le bug en production

  await page.evaluate(() => { try { generateWeeklyPlan(); } catch(e) {} });
  var snapGen = await snapshot(page);
  console.log('SCÉNARIO B — APRÈS ⚡ :', JSON.stringify(snapGen, null, 2));

  // Capture visuelle
  await page.evaluate(() => {
    if (typeof renderProgramIdentityCard !== 'function') return;
    var html = renderProgramIdentityCard();
    var div = document.createElement('div');
    div.id = '__diag_header__';
    div.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;background:white;z-index:99999;padding:15px;border:3px solid red;font-size:13px;color:black;font-family:Arial;';
    div.innerHTML = '<div style="font-weight:bold;color:red;">📋 SCÉNARIO B (sans lastDeloadDate)</div>' + html;
    document.body.appendChild(div);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'audit/diag-s1-scenarioB.png', fullPage: false });
});
