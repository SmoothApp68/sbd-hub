const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';

// Liste des noms anglais à proscrire (sauf proper nouns : Spoto, Larsen).
// Tractions = français OK. Dips = universel français. Rack Pull = universel.
// Bulgarian Split Squat → traduit. Romanian Deadlift → traduit.
const ENGLISH_RX = /^(Romanian Deadlift|Face pull|Leg curl|Lat Pull|Bulgarian Split Squat|Paused Squat|Hip Thrust(?!\s*\(M)|Tirage poitrine poulie|Tirage visage|Curl marteau|Curl barre|Curl haltères|Rowing barre|Rowing haltères|Rowing poulie assis|Oiseau machine|Écarté machine|Presse à cuisses|Leg Curl allongé|Gainage planche|Mollets lourds|Tirage Visage|Ab Wheel|Glute Bridge|Hip Thrust Machine)$/;

function leaDb() {
  return {
    user: {
      name: 'Léa', age: 28, bw: 60, height: 165, gender: 'female',
      level: 'intermediaire', trainingMode: 'musculation',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 45, vocabLevel: 2,
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 4, goal: 'recompo', goals: ['recompo'], level: 'intermediaire',
        mat: 'salle', duration: 45, selectedDays: ['Mardi','Mercredi','Jeudi','Vendredi'] }
    },
    bestPR: { squat: 65, bench: 40, deadlift: 80 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
}

function aurelienDb() {
  return {
    user: {
      name: 'Aurélien', age: 35, bw: 98, height: 178, gender: 'male',
      level: 'avance', trainingMode: 'powerbuilding',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'premium', trainingDuration: 90, vocabLevel: 2,
      injuries: [], lpActive: false, lpStrikes: {}, onboardingDate: null,
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: { freq: 5, goal: 'masse', goals: ['masse'], level: 'avance',
        mat: 'salle', duration: 90, selectedDays: ['Lundi','Mardi','Jeudi','Vendredi','Samedi'] }
    },
    bestPR: { squat: 148, bench: 140, deadlift: 186 },
    exercises: {}, readiness: [], weeklyPlan: null, logs: [], activityLogs: [],
    earnedBadges: {}, xpHighWaterMark: 0, routine: {}
  };
}

async function setDB(page, db) {
  await page.goto(BASE + '/sbd-hub/');
  await page.evaluate(([key, data]) => { localStorage.setItem(key, JSON.stringify(data)); }, [STORAGE_KEY, db]);
  await page.reload();
}

test('LANG-01 WP_PPL_TEMPLATES — aucun nom anglais ou minuscule incohérente', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    var keys = Object.keys(WP_PPL_TEMPLATES);
    var bad = [];
    keys.forEach(function(k) {
      var tpl = WP_PPL_TEMPLATES[k];
      (tpl.exercises || []).forEach(function(name) {
        // Bannis : Romanian Deadlift, Face pull (lowercase p), Hip Thrust seul (sans (Machine)),
        // Leg Curl allongé (a minuscule), Tirage poitrine poulie, Ab Wheel
        var isBad =
          /^Romanian Deadlift\b/.test(name) ||
          name === 'Face pull' ||
          name === 'Hip Thrust' ||
          /^Leg Curl allongé/.test(name) ||
          name === 'Tirage poitrine poulie' ||
          name === 'Ab Wheel' ||
          name === 'Gainage planche' ||
          name === 'Adduction' ||
          /^Presse à cuisses$/.test(name) ||
          /^Rowing barre$/.test(name) ||
          /^Rowing haltères$/.test(name) ||
          /^Curl barre$/.test(name) ||
          /^Curl marteau$/.test(name);
        if (isBad) bad.push(k + ': ' + name);
      });
    });
    return { bad: bad };
  });
  expect(result.bad).toEqual([]);
});

test('LANG-02 Léa generateWeeklyPlan : tous les noms d\'exercices en français', async ({ page }) => {
  await setDB(page, leaDb());
  const result = await page.evaluate(() => {
    generateWeeklyPlan();
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var bad = [];
    days.forEach(function(d) {
      if (d.rest) return;
      (d.exercises || []).forEach(function(e) {
        var n = e && e.name;
        if (!n) return;
        // Liste noire des anglicismes non corrigés
        var isBad =
          /^Romanian Deadlift\b/.test(n) ||
          n === 'Face pull' ||
          n === 'Hip Thrust' ||
          /^Leg Curl allongé/.test(n) ||
          n === 'Tirage poitrine poulie' ||
          n === 'Ab Wheel' ||
          n === 'Gainage planche' ||
          n === 'Glute Bridge' ||
          /^Hip Thrust Machine$/.test(n);
        if (isBad) bad.push(d.day + ': ' + n);
      });
    });
    return { bad: bad };
  });
  expect(result.bad).toEqual([]);
});

test('LANG-03 Aurélien generateWeeklyPlan : tous les noms d\'exercices en français', async ({ page }) => {
  await setDB(page, aurelienDb());
  const result = await page.evaluate(() => {
    generateWeeklyPlan();
    var plan = db.weeklyPlan || {};
    var days = Array.isArray(plan.days) ? plan.days : [];
    var bad = [];
    days.forEach(function(d) {
      if (d.rest) return;
      (d.exercises || []).forEach(function(e) {
        var n = e && e.name;
        if (!n) return;
        var isBad =
          /^Romanian Deadlift\b/.test(n) ||
          n === 'Face pull' ||
          n === 'Hip Thrust' ||
          /^Leg Curl allongé/.test(n) ||
          n === 'Tirage poitrine poulie' ||
          n === 'Ab Wheel' ||
          n === 'Gainage planche' ||
          n === 'Glute Bridge' ||
          /^Hip Thrust Machine$/.test(n);
        if (isBad) bad.push(d.day + ': ' + n);
      });
    });
    return { bad: bad };
  });
  expect(result.bad).toEqual([]);
});
