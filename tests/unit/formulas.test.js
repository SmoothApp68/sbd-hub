// Level-1 unit suite for pure algo formulas (A8 — closes the "0 unit tests" gap).
// engine.js exposes pure functions via a conditional module.exports.
const fs = require('fs');
const path = require('path');

const { getDUPZone, computeACWR, calcActivityTRIMP } = require('../../js/engine.js');

// calcE1RM lives in app.js, which references the DOM at top level and can't be
// require()'d in Node. We extract and evaluate its REAL source (Option C) so the
// test exercises the production implementation without duplicating the logic.
function loadCalcE1RM() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  const m = src.match(/function calcE1RM\s*\([^)]*\)\s*\{[^}]*\}/);
  if (!m) throw new Error('calcE1RM not found in js/app.js');
  // eslint-disable-next-line no-eval
  return eval('(' + m[0] + ')');
}
const calcE1RM = loadCalcE1RM();

describe('calcE1RM (Brzycki)', () => {
  test('1 rep returns the weight', () => expect(calcE1RM(100, 1)).toBe(100));
  test('5 reps ≈ 113 (Brzycki)', () => expect(calcE1RM(100, 5)).toBe(113));
  test('0 reps is handled (<=1 branch)', () => expect(calcE1RM(100, 0)).toBe(100));

  // FAILING ON PURPOSE — captures A1-F1: the divisor (1.0278 - 0.0278*r) is not
  // guarded, so e1RM goes negative beyond ~36 reps. The fix is scheduled for P1;
  // test.failing documents the bug while keeping CI green until then.
  test.failing('high reps must not produce a negative e1RM (A1-F1)', () => {
    expect(calcE1RM(100, 37)).toBeGreaterThan(0);
  });
});

describe('getDUPZone', () => {
  test('5 reps → force', () => expect(getDUPZone(5)).toBe('force'));
  test('6 reps → hypertrophie', () => expect(getDUPZone(6)).toBe('hypertrophie'));
  test('12 reps → hypertrophie', () => expect(getDUPZone(12)).toBe('hypertrophie'));
  test('13 reps → vitesse', () => expect(getDUPZone(13)).toBe('vitesse'));
});

describe('computeACWR (clamped to [0.3, 2.5])', () => {
  afterEach(() => { delete global.db; });

  test('extreme acute load clamps to 2.5', () => {
    global.db = { logs: [{ timestamp: Date.now(), volume: 1000 }] };
    expect(computeACWR()).toBe(2.5);
  });

  test('no recent load clamps to 0.3', () => {
    global.db = { logs: [{ timestamp: Date.now() - 14 * 86400000, volume: 1000 }] };
    expect(computeACWR()).toBe(0.3);
  });

  test('no logs returns null', () => {
    global.db = { logs: [] };
    expect(computeACWR()).toBeNull();
  });
});

describe('calcActivityTRIMP', () => {
  test('vigorous activity returns positive TRIMP', () => {
    // duration 60 * rpe (4*1.6=6.4) * cSpec(course=1.1) = 422.4 → 422
    expect(calcActivityTRIMP({ type: 'course', duration: 60, intensity: 4 })).toBe(422);
  });

  test('recovery activity (yoga) returns 0', () => {
    expect(calcActivityTRIMP({ type: 'yoga', duration: 60, intensity: 5 })).toBe(0);
  });

  test('intensity below RPE threshold returns 0', () => {
    // rpe = 1*1.6 = 1.6 < RECOVERY_RPE_THRESHOLD (3)
    expect(calcActivityTRIMP({ type: 'course', duration: 60, intensity: 1 })).toBe(0);
  });
});
