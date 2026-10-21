// DÉFIS Lot B — scoring auto + matching d'exercice ROBUSTE. Fonctions pures
// vm-extraites de la VRAIE source : supabase.js (scoring) + le vrai calcE1RM ET le
// vrai getSBDType (via _getSBDTypeRaw + VARIANT_KEYWORDS d'engine.js) → le test
// reflète le matching réel et attrape la divergence de noms (libellé court du
// picker vs nom matériel des logs).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('Could not extract ' + name);
  return m[0];
}

const ctx = { Math: Math, parseFloat: parseFloat, Infinity: Infinity, isNaN: isNaN, String: String, Date: Date };
ctx.BW_FALLBACK_KG = 80;
vm.createContext(ctx);

// vrai VARIANT_KEYWORDS + _getSBDTypeRaw d'engine.js, puis getSBDType = wrapper réel
const variantSrc = ENG.match(/const VARIANT_KEYWORDS\s*=\s*\[[^\]]*\];/);
if (!variantSrc) throw new Error('VARIANT_KEYWORDS not found');
vm.runInContext(variantSrc[0], ctx);
vm.runInContext(extractFn(ENG, '_getSBDTypeRaw'), ctx);
vm.runInContext('function getSBDType(n){ return _getSBDTypeRaw(n); }', ctx);
// vrai calcE1RM (one-liner)
const calcSrc = APP.match(/function calcE1RM\([^)]*\)\s*\{.*?\}/s);
if (!calcSrc) throw new Error('calcE1RM not found');
vm.runInContext(calcSrc[0], ctx);
// scoring (vraie source)
vm.runInContext(extractFn(SUPA, '_normalizeWeightScore'), ctx);
vm.runInContext(extractFn(SUPA, '_normalizeExoName'), ctx);
vm.runInContext(extractFn(SUPA, '_computeChallengeScoreFromLogs'), ctx);
vm.runInContext(extractFn(SUPA, 'formatChallengeValue'), ctx);

const sbd = (n) => { ctx.__n = n; return vm.runInContext('getSBDType(__n)', ctx); };
const score = (ch, logs, bw) => { ctx.__c = ch; ctx.__l = logs; ctx.__b = bw; return vm.runInContext('_computeChallengeScoreFromLogs(__c, __l, __b)', ctx); };
const norm = (e, bw) => { ctx.__e = e; ctx.__b = bw; return vm.runInContext('_normalizeWeightScore(__e, __b)', ctx); };
const fmt = (v, t) => { ctx.__v = v; ctx.__t = t; return vm.runInContext('formatChallengeValue(__v, __t)', ctx); };
const normName = (n) => { ctx.__nn = n; return vm.runInContext('_normalizeExoName(__nn)', ctx); };

const S = Date.parse('2026-06-01T00:00:00Z');
const E = Date.parse('2026-06-30T23:59:59Z');
const DAY = 86400000;
const ch = (type, over) => Object.assign({ type: type, start_date: '2026-06-01T00:00:00Z', end_date: '2026-06-30T23:59:59Z' }, over || {});

describe('Lot B — getSBDType réel reconnaît libellés courts ET noms matériel', () => {
  test('« Développé couché » et « Développé Couché (Barre) » → bench', () => {
    expect(sbd('Développé couché')).toBe('bench');
    expect(sbd('Développé Couché (Barre)')).toBe('bench');
  });
});

describe('Lot B — frequency / volume', () => {
  const logs = [
    { timestamp: S + 2 * DAY, volume: 5000, exercises: [] },
    { timestamp: S + 5 * DAY, volume: 3000, exercises: [] },
    { timestamp: S - 10 * DAY, volume: 9999, exercises: [] }, // HORS fenêtre
  ];
  test('frequency = nb séances dans la fenêtre absolue', () => {
    expect(score(ch('frequency'), logs, 90)).toBe(2);
  });
  test('volume = tonnage brut (kg), pas ÷ PDC', () => {
    expect(score(ch('volume'), logs, 90)).toBe(8000);
  });
  test('fenêtre vide → 0', () => {
    expect(score(ch('volume'), [], 90)).toBe(0);
  });
});

describe('Lot B — weight : matching SBD robuste (le test qui manquait)', () => {
  test('cible « Développé couché » matche un log « Développé Couché (Barre) » → e1RM 135 / PDC', () => {
    const logs = [{ timestamp: S + 3 * DAY, exercises: [{ name: 'Développé Couché (Barre)', allSets: [
      { weight: 105, reps: 7, setType: 'normal' },
      { weight: 107.5, reps: 7, setType: 'normal' },
      { weight: 110, reps: 7, setType: 'normal' },
      { weight: 112.5, reps: 7, setType: 'normal' },
    ] }] }];
    // Oracle Supabase : meilleur e1RM = 112.5 × 36/30 = 135.00 ; ratio = 135/90 = 1.50
    expect(score(ch('weight', { target_exercise: 'Développé couché' }), logs, 90)).toBeCloseTo(1.5, 5);
    expect(fmt(score(ch('weight', { target_exercise: 'Développé couché' }), logs, 90), 'weight')).toBe('1.50× PDC');
  });
  test('grosse séance HORS fenêtre exclue, warmup ignoré', () => {
    const logs = [
      { timestamp: S + 1 * DAY, exercises: [{ name: 'Squat (Barre)', allSets: [
        { weight: 160, reps: 5, setType: 'normal' }, { weight: 60, reps: 8, setType: 'warmup' } ] }] },
      { timestamp: S - 20 * DAY, exercises: [{ name: 'Squat', allSets: [{ weight: 220, reps: 3, setType: 'normal' }] }] },
    ];
    expect(score(ch('weight', { target_exercise: 'Squat' }), logs, 90)).toBeCloseTo(180 / 90, 5); // calcE1RM(160,5)=180
  });
  test('target_exercise SBD absent des logs → 0', () => {
    const logs = [{ timestamp: S + DAY, exercises: [{ name: 'Squat (Barre)', allSets: [{ weight: 160, reps: 5, setType: 'normal' }] }] }];
    expect(score(ch('weight', { target_exercise: 'Soulevé de terre' }), logs, 90)).toBe(0);
  });
});

describe('Lot B — weight : fallback non-SBD par nom normalisé', () => {
  const logs = [
    { timestamp: S + DAY, exercises: [{ name: 'Tirage vers Visage (Poulie)', allSets: [{ weight: 40, reps: 12, setType: 'normal' }] }] },
    { timestamp: S + 2 * DAY, exercises: [{ name: 'Curl Biceps (Haltères)', allSets: [{ weight: 200, reps: 5, setType: 'normal' }] }] },
  ];
  test('cible accessoire « Tirage vers Visage » matche « Tirage vers Visage (Poulie) » et IGNORE le curl', () => {
    // seul le tirage compte : calcE1RM(40,12) / 80 ; le curl (200kg) ne doit PAS gonfler le score
    const s = score(ch('weight', { target_exercise: 'Tirage vers Visage' }), logs, 80);
    ctx.__w = 40; ctx.__r = 12;
    const e1 = vm.runInContext('calcE1RM(__w, __r)', ctx);
    expect(s).toBeCloseTo(e1 / 80, 5);
    expect(s).toBeLessThan(1); // pas le curl à 200kg
  });
});

describe('Lot B — _normalizeExoName / _normalizeWeightScore / formatChallengeValue', () => {
  test('_normalizeExoName retire le suffixe matériel + casse', () => {
    expect(normName('Développé Couché (Barre)')).toBe('développé couché');
    expect(normName('Tirage vers Visage (Poulie)')).toBe('tirage vers visage');
  });
  test('_normalizeWeightScore : / PDC, fallback 80, 0 si nul', () => {
    expect(norm(180, 90)).toBeCloseTo(2.0, 5);
    expect(norm(160, 0)).toBeCloseTo(160 / 80, 5);
    expect(norm(0, 90)).toBe(0);
  });
  test('formatChallengeValue : weight 2 décimales (1.78× PDC), volume kg, frequency entier', () => {
    expect(fmt(1.78, 'weight')).toBe('1.78× PDC');
    expect(fmt(12000, 'volume')).toBe('12000 kg');
    expect(fmt(5, 'frequency')).toBe('5');
  });
});
