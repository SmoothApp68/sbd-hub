// Lot 2 — Bouton « Appliquer la charge suggérée » (auto-régulation GO).
// vm-extraction de la VRAIE source app.js (même infrastructure que les autres
// harnais unit) : goCheckAutoRegulation enrichi de newWeight/exoIdx,
// _autoRegStep/_autoRegSnap (pas par exercice via getDPIncrement),
// goApplyAutoReg (cible !completed && type==='normal').
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const sm = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!sm) throw new Error('NOT FOUND in source: ' + name);
  const start = sm.index;
  const lineEnd = src.indexOf('\n', start);
  const firstLine = src.slice(start, lineEnd);
  if (firstLine.includes('{') && firstLine.trimEnd().endsWith('}')) return firstLine;
  const rest = src.slice(lineEnd);
  const em = rest.match(/\n\}/);
  return src.slice(start, em ? lineEnd + em.index + 2 : src.length);
}

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const TODAY = DAYS[new Date().getDay()];

// Méta minimaliste : squat = compound bas (pas 5kg), curl = isolation bras (pas 1kg)
const META = {
  'squat (barre)': { muscleGroup: 'quad', mechanic: 'compound', bodyPart: 'lower', equipment: 'barbell' },
  'curl biceps': { muscleGroup: 'biceps', mechanic: 'isolation', bodyPart: 'upper', equipment: 'dumbbell' },
  'planche': { muscleGroup: 'core', mechanic: 'isolation', bodyPart: 'core', equipment: 'bodyweight' }
};

function makeCtx(opts) {
  opts = opts || {};
  const ctx = vm.createContext({
    console,
    DAYS_FULL: DAYS,
    db: {
      user: { level: 'intermediaire', lpStrikes: {} },
      weeklyPlan: {
        days: [{
          day: TODAY,
          exercises: [{ name: opts.exoName || 'Squat (Barre)', sets: opts.planSets || [{ weight: 100, reps: 5, rpe: 8 }] }]
        }]
      }
    },
    activeWorkout: { exercises: [{ name: opts.exoName || 'Squat (Barre)', sets: opts.sets || [] }] },
    computeSRS: function() { return { score: opts.srs || 70 }; },
    wpDetectPhase: function() { return opts.phase || 'accumulation'; },
    wpNormalizeName: function(n) { return String(n || '').toLowerCase().trim(); },
    wpGetExoMeta: function(n) { return META[String(n || '').toLowerCase().trim()] || null; },
    countGrindThisSession: function() { return { grindCount: 0 }; },
    _toasts: [],
    _renders: 0,
    _saves: 0,
    _liveCoachBannerTimer: null,
    document: { getElementById: function() { return null; } },
    showToast: null, goAutoSave: null, goRequestRender: null
  });
  ctx.showToast = new vm.Script('(function(m){ _toasts.push(m); })').runInContext(ctx);
  ctx.goAutoSave = new vm.Script('(function(){ _saves++; })').runInContext(ctx);
  ctx.goRequestRender = new vm.Script('(function(){ _renders++; })').runInContext(ctx);
  ['wpRound25', 'getDPIncrement', '_autoRegStep', '_autoRegSnap',
    'classifyFatigue', 'goCheckAutoRegulation', 'goApplyAutoReg'].forEach(function(fn) {
    vm.runInContext(extractFn(APP, fn), ctx);
  });
  return ctx;
}

function check(ctx, exoIdx, setIdx) {
  return vm.runInContext('goCheckAutoRegulation(' + exoIdx + ',' + setIdx + ')', ctx);
}

describe('_autoRegStep / _autoRegSnap — pas par exercice', () => {
  const ctx = makeCtx();
  test('compound bas du corps → pas 5 kg', () => {
    expect(vm.runInContext('_autoRegStep("Squat (Barre)", 100)', ctx)).toBe(5);
  });
  test('isolation bras → pas 1 kg', () => {
    expect(vm.runInContext('_autoRegStep("Curl Biceps", 20)', ctx)).toBe(1);
  });
  test('core (getDPIncrement → 0) → fallback 2.5', () => {
    expect(vm.runInContext('_autoRegStep("Planche", 0)', ctx)).toBe(2.5);
  });
  test('snap au multiple du pas', () => {
    expect(vm.runInContext('_autoRegSnap(95, 5)', ctx)).toBe(95);
    expect(vm.runInContext('_autoRegSnap(101.25, 1)', ctx)).toBe(101);
    expect(vm.runInContext('_autoRegSnap(93.7, 2.5)', ctx)).toBe(92.5);
  });
});

describe('goCheckAutoRegulation — newWeight par règle', () => {
  test('R1 overshoot (RPE 9.5 vs 8) → -5% snappé au pas 5 kg du squat', () => {
    const ctx = makeCtx({
      sets: [{ type: 'normal', completed: true, weight: 100, reps: 5, rpe: 9.5 }]
    });
    const r = check(ctx, 0, 0);
    expect(r.type).toBe('warning');
    expect(r.newWeight).toBe(95); // 100×0.95=95, multiple de 5
    expect(r.exoIdx).toBe(0);
  });

  test('R2 undershoot bas du corps → +2.5 snappé pas 5 → +5, message cohérent', () => {
    const ctx = makeCtx({
      sets: [{ type: 'normal', completed: true, weight: 100, reps: 5, rpe: 6 }]
    });
    const r = check(ctx, 0, 0);
    expect(r.type).toBe('success');
    expect(r.newWeight).toBe(105); // snap(102.5, 5) = 105
    expect(r.msg).toContain('Ajoute 5kg');
  });

  test('R2 undershoot isolation bras → +1.25 snappé pas 1 → 21 kg', () => {
    const ctx = makeCtx({
      exoName: 'Curl Biceps',
      planSets: [{ weight: 20, reps: 12, rpe: 8 }],
      sets: [{ type: 'normal', completed: true, weight: 20, reps: 12, rpe: 6 }]
    });
    const r = check(ctx, 0, 0);
    expect(r.newWeight).toBe(21); // snap(21.25, 1) = 21
    expect(r.msg).toContain('Ajoute 1kg');
  });

  test('garde warmup : set type=warmup complété → null (bug latent corrigé)', () => {
    const ctx = makeCtx({
      sets: [{ type: 'warmup', completed: true, weight: 60, reps: 5, rpe: 9.9 }]
    });
    expect(check(ctx, 0, 0)).toBeNull();
  });

  test('R4 peak protection → newWeight = targetWeight tel quel (non re-snappé)', () => {
    const ctx = makeCtx({
      phase: 'peak',
      planSets: [{ weight: 147.5, reps: 2, rpe: 9 }],
      sets: [{ type: 'normal', completed: true, weight: 160, reps: 2 }]
    });
    const r = check(ctx, 0, 0);
    expect(r.type).toBe('danger');
    expect(r.newWeight).toBe(147.5); // pas remonté à 150 par le pas 5 kg
  });

  test('R3 fatigue drop (stop) → PAS de newWeight', () => {
    const mk = () => ({ type: 'normal', completed: true, weight: 100, reps: 5, rpe: 9 });
    const ctx = makeCtx({ sets: [mk(), mk(), mk()] });
    const r = check(ctx, 0, 2);
    expect(r.type).toBe('danger');
    expect(r.msg).toContain('Fatigue nerveuse');
    expect(r.newWeight).toBeUndefined();
  });

  test('R7 échec implicite en phase volume → back-off -10% snappé', () => {
    const ctx = makeCtx({
      phase: 'volume',
      sets: [
        { type: 'normal', completed: true, weight: 100, reps: 8 },
        { type: 'normal', completed: true, weight: 100, reps: 6 } // -2 reps, charge stable
      ]
    });
    const r = check(ctx, 0, 1);
    expect(r.isImplicitFailure).toBe(true);
    expect(r.newWeight).toBe(90); // snap(100×0.90, 5) = 90
    expect(r.exoIdx).toBe(0);
  });

  // NB : en phase peak, la règle 6 (grind, seuil 0) intercepte avant R7 —
  // comportement préexistant. Le STOP sans newWeight de R7 se teste en force.
  test('R7 échec critique en phase force (stop) → PAS de newWeight', () => {
    const ctx = makeCtx({
      phase: 'force',
      planSets: [{ weight: 100, reps: 5, rpe: 9 }],
      sets: [
        { type: 'normal', completed: true, weight: 100, reps: 8 },
        { type: 'normal', completed: true, weight: 100, reps: 4 } // -4 reps → critical
      ]
    });
    const r = check(ctx, 0, 1);
    expect(r.msg).toContain('Arrête');
    expect(r.newWeight).toBeUndefined();
  });
});

describe('goApplyAutoReg — ciblage type=normal non complété', () => {
  test('warmup/backoff/complétés intacts, normal non complété ajusté, toast + save + render', () => {
    const ctx = makeCtx({
      sets: [
        { type: 'warmup', completed: true, weight: 40 },
        { type: 'warmup', completed: false, weight: 60 },
        { type: 'normal', completed: true, weight: 100 },
        { type: 'normal', completed: false, weight: 100 },
        { type: 'normal', completed: false, weight: 100 },
        { type: 'backoff', completed: false, weight: 90 }
      ]
    });
    vm.runInContext('goApplyAutoReg(0, 95)', ctx);
    const sets = vm.runInContext('activeWorkout.exercises[0].sets', ctx);
    expect(sets.map(s => s.weight)).toEqual([40, 60, 100, 95, 95, 90]);
    expect(vm.runInContext('_toasts', ctx).join(' ')).toContain('95');
    expect(vm.runInContext('_saves', ctx)).toBe(1);
    expect(vm.runInContext('_renders', ctx)).toBe(1);
  });

  test('exoIdx invalide → no-op sans crash', () => {
    const ctx = makeCtx({ sets: [] });
    expect(() => vm.runInContext('goApplyAutoReg(99, 95)', ctx)).not.toThrow();
    expect(vm.runInContext('_saves', ctx)).toBe(0);
  });
});
