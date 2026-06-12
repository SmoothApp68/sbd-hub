/**
 * ALGO-E2E — Validation d'intégration de l'extraction ALGO-A1
 * (_wpComputeWorkWeightPenalties + _wpApplyWorkWeightBounds, v281).
 *
 * Le harnais unitaire (60 tests) valide wpComputeWorkWeight en isolation vm.
 * Ce spec valide l'APP ENTIÈRE avec le code extrait : ordre de chargement,
 * génération de plan (wpGeneratePowerbuildingDay → wpComputeWorkWeightSafe →
 * wpComputeWorkWeight → les 2 nouvelles fonctions), rendu GO, validation de
 * série — en simulant un utilisateur réaliste (8 semaines d'historique).
 *
 * Test 2 (comparaison avant/après) : nécessite le worktree pré-A1 —
 *   git worktree add /tmp/before-a1 92a5afc
 * Sans lui, le test est skippé (CI). L'extraction A1 étant un refactor pur,
 * les poids générés doivent être STRICTEMENT identiques avant/après.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { spawn } = require('child_process');

const STORAGE_KEY = 'SBD_HUB_V29';
const BASE = 'http://localhost:8080';
const BEFORE_DIR = '/tmp/before-a1';
const BEFORE_PORT = 8081;

// Mêmes patterns que no-console-errors.spec.js : CDN/réseau bloqués en sandbox ≠ bugs app
const IGNORED_ERROR_PATTERNS = [
  /Chart is not defined/, /supabase/i, /Failed to fetch/,
  /NetworkError/, /net::ERR_/, /navigator\.vibrate/,
];
function isIgnoredError(message) {
  return IGNORED_ERROR_PATTERNS.some((p) => p.test(message || ''));
}

const DAYS_FULL_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const TODAY_FR = DAYS_FULL_FR[new Date().getDay()];

function pick4DaysIncludingToday() {
  const all = ['Lundi', 'Mardi', 'Jeudi', 'Vendredi', 'Samedi', 'Mercredi', 'Dimanche'];
  const days = [TODAY_FR];
  for (const d of all) {
    if (days.length >= 4) break;
    if (!days.includes(d)) days.push(d);
  }
  return days;
}

// 8 semaines × 4 séances/sem — noms canoniques FR (ceux que wpFindBestMatch
// résout vers les targets Squat / Développé couché / Soulevé de Terre),
// progression croissante, RPE 7→9, un grind 9.5 en semaine 7.
function generateRealisticLogs() {
  const logs = [];
  const set = (w, r, p) => ({ weight: w, reps: r, rpe: p, isWarmup: false });
  const RPE_BY_WEEK = [7, 7.5, 8, 8.5, 7.5, 8, 9, 8];
  for (let week = 0; week < 8; week++) {
    const sq = 120 + week * 2;      // 120 → 134
    const be = 100 + week * 1.25;   // 100 → 108.75
    const dl = 150 + week * 2;      // 150 → 164
    const rpe = RPE_BY_WEEK[week];
    const topRpe = week === 6 ? 9.5 : Math.min(9, rpe + 0.5); // grind unique S7
    const base = (8 - week) * 7;    // semaine 0 = il y a 56j … semaine 7 = il y a 7j
    const mk = (off, exos) => ({
      timestamp: Date.now() - (base - off) * 86400000,
      volume: 5000,
      exercises: exos,
    });
    logs.push(mk(0, [
      { name: 'Squat', allSets: [set(sq, 5, rpe), set(sq, 5, rpe), set(sq, 5, topRpe)] },
      { name: 'Développé couché', allSets: [set(be - 10, 8, rpe)] },
    ]));
    logs.push(mk(2, [
      { name: 'Développé couché', allSets: [set(be, 5, rpe), set(be, 5, rpe)] },
      { name: 'Rowing Barre', allSets: [set(80 + week, 8, 7.5)] },
    ]));
    logs.push(mk(4, [
      { name: 'Soulevé de Terre', allSets: [set(dl, 5, rpe), set(dl, 3, rpe)] },
      { name: 'Squat', allSets: [set(sq - 15, 8, 7)] },
    ]));
    logs.push(mk(5, [
      { name: 'Développé Militaire', allSets: [set(50 + week, 8, 8)] },
      { name: 'Développé couché', allSets: [set(be - 15, 10, 7.5)] },
    ]));
  }
  return logs;
}

function buildSeedDb() {
  return {
    user: {
      name: 'E2E Algo', age: 35, bw: 98, height: 178, gender: 'male',
      level: 'intermediaire', trainingMode: 'powerbuilding',
      onboarded: true, onboardingVersion: 5, consentHealth: true, medicalConsent: true,
      units: 'kg', barWeight: 20, tier: 'free', trainingDuration: 60, vocabLevel: 2,
      injuries: [], lpActive: false, lpStrikes: {},
      _readinessSkipDate: Date.now(), // évite la modal readiness au lancement GO
      cycleTracking: { enabled: false, lastPeriodDate: null, cycleLength: 28 },
      programParams: {
        freq: 4, goal: 'masse', goals: ['masse'], level: 'intermediaire',
        mat: 'salle', duration: 60, selectedDays: pick4DaysIncludingToday(),
      },
    },
    bestPR: { squat: 148, bench: 140, deadlift: 186 }, // PRs réalistes (Aurélien)
    exercises: {}, readiness: [],
    logs: generateRealisticLogs(),
    activityLogs: [], earnedBadges: {}, xpHighWaterMark: 0, routine: {},
    weeklyPlan: null, // forcer la régénération au boot
  };
}
// Construit UNE fois au chargement du module → mêmes timestamps pour les deux
// versions dans le test de comparaison (déterminisme).
const SEED = buildSeedDb();

async function bootWithSeed(page, baseUrl) {
  await page.addInitScript(([key, data]) => {
    localStorage.setItem(key, JSON.stringify(data));
    // PRNG déterministe : si la génération de plan tire des accessoires au
    // hasard, avant/après doivent tirer la MÊME séquence (mulberry32, seed 42).
    let s = 42;
    Math.random = function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, [STORAGE_KEY, SEED]);
  await page.goto(baseUrl + '/', { waitUntil: 'load' });
  await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1500); // migrations + rendus async du boot
  // Même convention que helpers.setupPage : masquer les overlays login/onboarding
  // (pas de session Supabase en sandbox) pour libérer les interactions UI.
  await page.evaluate(() => {
    const ob = document.getElementById('onboarding-overlay');
    if (ob) ob.style.display = 'none';
    const login = document.getElementById('loginScreen');
    if (login) login.style.display = 'none';
  });
}

// Extraction sérialisable du plan : jours d'entraînement → exercices → séries.
// Exécutée DANS la page (db global).
const EXTRACT_PLAN = `(function () {
  var plan = db.weeklyPlan;
  if (!plan || !Array.isArray(plan.days)) return null;
  return plan.days.filter(function (d) { return !d.rest; }).map(function (d) {
    return {
      day: d.day,
      exercises: (d.exercises || []).map(function (e) {
        return {
          name: e.name,
          sets: (e.sets || []).map(function (s) {
            return { w: (s.weight === undefined ? null : s.weight),
                     r: (s.reps === undefined ? null : s.reps),
                     warmup: s.isWarmup === true || s.type === 'warmup' };
          })
        };
      })
    };
  });
})()`;

// S'assure qu'un plan existe : attend l'auto-génération du boot, sinon
// l'app la déclenche en entrant dans GO ; dernier recours, appel explicite.
async function ensurePlan(page) {
  let auto = true;
  try {
    await page.waitForFunction('!!(db && db.weeklyPlan && db.weeklyPlan.days)', null, { timeout: 5000 });
  } catch (e) {
    auto = false;
    await page.evaluate('generateWeeklyPlan()');
  }
  const plan = await page.evaluate(EXTRACT_PLAN);
  return { plan, auto };
}

function classifyMainLift(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('squat')) return 'squat';
  if (n.includes('couché') || n.includes('couche') || n.includes('bench')) return 'bench';
  if (n.includes('terre') || n.includes('deadlift')) return 'deadlift';
  return null;
}

test.describe('ALGO-E2E — extraction A1 en conditions réelles', () => {
  test('parcours réel : boot → plan généré → séance GO → poids cohérents', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => {
      if (!isIgnoredError(err.message)) errors.push(err.message + '\n' + (err.stack || ''));
    });

    // 1. Seed + boot
    await bootWithSeed(page, BASE);

    // 2. Les 2 fonctions extraites sont chargées (ordre de chargement OK,
    //    pas de ReferenceError possible dans wpComputeWorkWeight)
    const fns = await page.evaluate(
      '({ pen: typeof _wpComputeWorkWeightPenalties, bounds: typeof _wpApplyWorkWeightBounds, core: typeof wpComputeWorkWeight })'
    );
    expect(fns.pen).toBe('function');
    expect(fns.bounds).toBe('function');
    expect(fns.core).toBe('function');

    // 3. Plan hebdo généré (seed weeklyPlan:null → régénération)
    const { plan, auto } = await ensurePlan(page);
    console.log('Plan auto-généré au boot :', auto);
    expect(plan).not.toBeNull();
    expect(plan.length).toBeGreaterThan(0);
    const todayDay = plan.find((d) => d.day === TODAY_FR);
    expect(todayDay, 'aujourd\'hui (' + TODAY_FR + ') doit être un jour d\'entraînement').toBeTruthy();
    expect(todayDay.exercises.length).toBeGreaterThan(0);

    // 4-5. Cohérence algo sur TOUS les poids du plan
    const E1RM_EST = { squat: 148 * 1.06, bench: 140 * 1.06, deadlift: 186 * 1.06 };
    const mainsSeen = new Set();
    const weightTable = [];
    for (const day of plan) {
      for (const exo of day.exercises) {
        for (const s of exo.sets) {
          if (s.w === null || s.w === 0) continue; // poids du corps / non chargé
          expect(Number.isFinite(s.w), exo.name + ' : poids NaN/undefined').toBe(true);
          expect(s.w, exo.name + ' : poids négatif').toBeGreaterThan(0);
          const main = classifyMainLift(exo.name);
          const isDumbbell = /halt[èe]re/i.test(exo.name);
          // Arrondi wpRound25/wpRound125 (grille 1.25) : c'est le périmètre de
          // wpComputeWorkWeight → lifts principaux BARRE uniquement. QUIRK
          // observé (hors périmètre A1, prouvé identique avant/après par le
          // test 2) : les accessoires haltères (wpDumbbellAdjust, ex: 57kg) et
          // poulies/machines (ex: 87kg) ont leurs propres ajustements de charge.
          if (main && !isDumbbell) {
            expect(Math.abs(s.w / 1.25 - Math.round(s.w / 1.25)),
              exo.name + ' : ' + s.w + ' n\'est pas un multiple de 1.25').toBeLessThan(1e-9);
          }
          if (main && !s.warmup) {
            mainsSeen.add(main);
            // Hard Cap 102.5% du e1RM estimé (e1RM ≈ PR × 1.06)
            expect(s.w, day.day + ' / ' + exo.name + ' : dépasse le hard cap').toBeLessThanOrEqual(E1RM_EST[main] * 1.025 + 0.01);
            // Plancher plausibilité : ≥ 20% du e1RM estimé
            expect(s.w, day.day + ' / ' + exo.name + ' : sous 20% e1RM').toBeGreaterThanOrEqual(E1RM_EST[main] * 0.20);
          }
          weightTable.push(day.day + ' | ' + exo.name + ' | ' + s.w + 'kg' + (s.warmup ? ' (warmup)' : ''));
        }
      }
    }
    expect(mainsSeen.size, 'au moins un lift principal SBD chargé dans le plan').toBeGreaterThan(0);
    console.log('Poids du plan (' + weightTable.length + ' séries chargées) :\n' + weightTable.join('\n'));

    // 6. Onglet GO (UI) puis démarrage de la séance du jour.
    //    NB : _goDoStartWorkout(true) appelé directement — goStartWorkout passe
    //    par les modals readiness/DOMS (interactions hors scope algo).
    await page.locator('button[data-tab="tab-seances"]').click();
    // La nav Séances n'a plus de pill « GO » (redesign v231) — la vue s-go est
    // atteinte par les boutons GO de l'app via showSeancesSub('s-go') (même appel).
    await page.evaluate("showSeancesSub('s-go')");
    await page.waitForTimeout(500);
    // db.routineExos n'est peuplé que par l'onboarding/program builder
    // (pbGenerateProgram, app.js:13164) — notre seed le saute. On reproduit la
    // MÊME écriture (noms des exos du plan par jour) pour que la séance GO se
    // construise comme chez un utilisateur réel onboardé.
    await page.evaluate(`(function () {
      if (!db.routineExos) db.routineExos = {};
      (db.weeklyPlan.days || []).forEach(function (d) {
        if (!d.rest && d.exercises) {
          db.routineExos[d.day] = d.exercises.map(function (e) { return e.name; });
        }
      });
    })()`);
    await page.evaluate('_goDoStartWorkout(true)');
    await page.waitForSelector('.go-exo-card', { state: 'visible', timeout: 10000 });

    // Chaque carte affiche un poids numérique — ni NaN ni undefined dans le DOM
    const goCheck = await page.evaluate(`(function () {
      var exos = (activeWorkout && activeWorkout.exercises) || [];
      return {
        count: exos.length,
        badWeights: exos.map(function (e) {
          var bad = (e.sets || []).filter(function (s) {
            return s.weight !== undefined && s.weight !== null && s.weight !== '' && isNaN(parseFloat(s.weight));
          });
          return bad.length ? e.name : null;
        }).filter(Boolean),
        domNaN: /NaN|undefined/.test(document.getElementById('goActiveView').textContent)
      };
    })()`);
    expect(goCheck.count).toBeGreaterThan(0);
    expect(goCheck.badWeights).toEqual([]);
    expect(goCheck.domNaN, 'le DOM GO contient NaN/undefined').toBe(false);

    // 7. Bouton coach "Pourquoi ?" présent sur les cards (renderWhyButton)
    expect(await page.locator('[id^="why-btn-"]').count()).toBeGreaterThan(0);

    // 6bis. Valider une série via l'UI → set.completed = true, sans erreur
    await page.locator('[onclick^="goToggleSetComplete("]').first().click();
    const setDone = await page.evaluate('activeWorkout.exercises[0].sets[0].completed === true');
    expect(setDone).toBe(true);

    // 8. Bilan : ZÉRO pageerror (filtré réseau/CDN) sur tout le parcours
    expect(errors).toEqual([]);
  });

  test('comparaison avant/après A1 : poids du plan strictement identiques', async ({ browser }) => {
    test.skip(!fs.existsSync(BEFORE_DIR + '/index.html'),
      'worktree pré-A1 absent — créer avec : git worktree add /tmp/before-a1 92a5afc');
    test.setTimeout(90000);

    const srv = spawn('http-server', [BEFORE_DIR, '-p', String(BEFORE_PORT), '-s'], { stdio: 'ignore' });
    try {
      // attendre que le serveur "before" réponde
      await expect.poll(async () => {
        try { return (await fetch('http://localhost:' + BEFORE_PORT + '/index.html')).status; }
        catch (e) { return 0; }
      }, { timeout: 15000 }).toBe(200);

      // Même seed (module-level, mêmes timestamps), même PRNG, même parcours :
      // boot → régénération forcée → extraction du plan.
      const extractFrom = async (url) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await bootWithSeed(page, url);
        const plan = await page.evaluate('(function(){ db.weeklyPlan = null; generateWeeklyPlan(); return ' + EXTRACT_PLAN + '; })()');
        const version = await page.evaluate('typeof SW_VERSION !== "undefined" ? SW_VERSION : "?"');
        await ctx.close();
        return { plan, version };
      };

      const before = await extractFrom('http://localhost:' + BEFORE_PORT);
      const after = await extractFrom(BASE);

      // Sanity : on compare bien v280 (pré-A1) à v281 (post-A1)
      console.log('before =', before.version, '| after =', after.version);
      expect(before.version).toBe('trainhub-v280');
      expect(after.version).toBe('trainhub-v281');
      expect(before.plan).not.toBeNull();

      // Extraction = zéro changement de poids, exercice par exercice
      expect(after.plan).toEqual(before.plan);
    } finally {
      srv.kill();
    }
  });
});
