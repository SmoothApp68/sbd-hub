// Level-2 unit suite (A8) — functions that read the global `db`.
// Loaded via a vm sandbox: we extract the REAL source from app.js and run it
// against a controlled `db` + minimal stubs (no logic duplication).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(name) {
  // From `function name(` to the first `}` at column 0 (the function's own close;
  // every inner brace in app.js is indented).
  const re = new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = APP_SRC.match(re);
  if (!m) throw new Error('Could not extract ' + name + ' from app.js');
  return m[0];
}

const DAY = 86400000;

// One synthetic session `daysAgo` in the past with a given volume and work-set RPE.
function makeLog(daysAgo, volume, rpe) {
  return {
    id: 'l' + daysAgo + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now() - daysAgo * DAY,
    volume: volume,
    exercises: [{ allSets: [{ weight: 100, reps: 5, rpe: rpe, isWarmup: false }] }]
  };
}

function runShouldDeload(logs, dbOverride) {
  const db = Object.assign({
    user: { level: 'intermediaire', trainingMode: 'powerbuilding' },
    // recent deload so criterion 3 (max weeks) never fires in these scenarios
    weeklyPlan: { lastDeloadDate: new Date(Date.now() - 5 * DAY).toISOString() },
    todayWellbeing: null
  }, dbOverride || {});
  const ctx = vm.createContext({
    db: db, logs: logs,
    Date: Date, Math: Math, parseFloat: parseFloat, parseInt: parseInt,
    isNaN: isNaN, JSON: JSON, console: console,
    // Stubs for the only external functions shouldDeload references:
    computeAdaptiveSRSThreshold: function () { return { mode: 'fixed' }; },
    getEffectiveSRS: function (x) { return x; },
    computeSRS: function () { return { score: 100 }; }
  });
  vm.runInContext(extractFn('shouldDeload'), ctx);
  return vm.runInContext('shouldDeload(logs, db.user.trainingMode)', ctx);
}

describe('shouldDeload (Level-2, db mock)', () => {
  test('stable training — no deload', () => {
    const logs = [];
    [1, 3, 5, 8, 10, 12, 15, 17, 19].forEach(function (d) { logs.push(makeLog(d, 10000, 7)); });
    const r = runShouldDeload(logs);
    expect(r.needed).toBe(false);
  });

  test('volume drop >15% + high RPE — deload recommended (criterion 2)', () => {
    const logs = [];
    [15, 17, 19].forEach(function (d) { logs.push(makeLog(d, 10000, 8)); }); // week 3: normal
    [8, 10].forEach(function (d) { logs.push(makeLog(d, 9000, 8)); });        // week 2
    [1, 3].forEach(function (d) { logs.push(makeLog(d, 3000, 9.5)); });       // week 1: low vol, high RPE
    const r = runShouldDeload(logs);
    expect(r.needed).toBe(true);
    expect(r.trigger).toBe('volume_rpe');
  });

  test('vacation week (no sessions in last 7 days) — no false positive (A1-F6)', () => {
    const logs = [];
    [15, 17, 19].forEach(function (d) { logs.push(makeLog(d, 10000, 7)); }); // week 3
    [8, 10, 12].forEach(function (d) { logs.push(makeLog(d, 10000, 7)); });  // week 2
    // week 1 empty — volume "dropped" but no high-RPE sessions, so criterion 2 must not fire
    const r = runShouldDeload(logs);
    expect(r.needed).toBe(false);
  });

  test('bien_etre mode — never deloads', () => {
    const logs = [];
    [1, 3, 15, 17, 19].forEach(function (d) { logs.push(makeLog(d, 3000, 10)); });
    const r = runShouldDeload(logs, { user: { level: 'intermediaire', trainingMode: 'bien_etre' } });
    expect(r.needed).toBe(false);
  });
});

// wpComputeWorkWeight is intentionally NOT unit-tested here. It reads the global
// `db` and calls 63 distinct helpers (21 of them via typeof-guards), so extracting
// it in isolation would require stubbing the entire app surface — the test would
// then assert the stubs, not the function. Its bounds (hard cap 102.5 %, 60 %
// floor, NaN guard, polymorphic return) are better covered by a full-app
// integration test (the existing Playwright E2E loads every helper) or after a
// dependency-injection refactor. Reported per the P1-8 Phase 2 rule.
