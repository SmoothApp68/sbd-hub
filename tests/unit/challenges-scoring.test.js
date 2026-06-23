// DÉFIS Lot B — scoring auto. Fonctions PURES vm-extraites de la VRAIE source
// (supabase.js) + le vrai calcE1RM (app.js). getSBDType est une dépendance stubée.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('Could not extract ' + name);
  return m[0];
}

const ctx = { Math: Math, parseFloat: parseFloat, Infinity: Infinity, isNaN: isNaN, String: String, Date: Date };
ctx.BW_FALLBACK_KG = 80;
// Dépendance stubée (le vrai getSBDType dépend d'un cache interne, hors test) :
ctx.getSBDType = function (n) {
  n = (n || '').toLowerCase();
  if (/squat/.test(n)) return 'squat';
  if (/bench|couch/.test(n)) return 'bench';
  if (/dead|soulev/.test(n)) return 'deadlift';
  return null;
};
vm.createContext(ctx);
// vrai calcE1RM (one-liner) : extraction dédiée (le closing } est en fin de ligne)
const calcSrc = APP.match(/function calcE1RM\([^)]*\)\s*\{.*?\}/s);
if (!calcSrc) throw new Error('calcE1RM not found');
vm.runInContext(calcSrc[0], ctx);
vm.runInContext(extractFn(SUPA, '_normalizeWeightScore'), ctx);
vm.runInContext(extractFn(SUPA, '_computeChallengeScoreFromLogs'), ctx);
vm.runInContext(extractFn(SUPA, 'formatChallengeValue'), ctx);

const score = (ch, logs, bw) => { ctx.__c = ch; ctx.__l = logs; ctx.__b = bw; return vm.runInContext('_computeChallengeScoreFromLogs(__c, __l, __b)', ctx); };
const norm = (e, bw) => { ctx.__e = e; ctx.__b = bw; return vm.runInContext('_normalizeWeightScore(__e, __b)', ctx); };
const fmt = (v, t) => { ctx.__v = v; ctx.__t = t; return vm.runInContext('formatChallengeValue(__v, __t)', ctx); };

const S = Date.parse('2026-06-01T00:00:00Z');
const E = Date.parse('2026-06-30T23:59:59Z');
const DAY = 86400000;
const ch = (type, over) => Object.assign({ type: type, start_date: '2026-06-01T00:00:00Z', end_date: '2026-06-30T23:59:59Z' }, over || {});

describe('Lot B — _computeChallengeScoreFromLogs : frequency / volume', () => {
  const logs = [
    { timestamp: S + 2 * DAY, volume: 5000, exercises: [] },
    { timestamp: S + 5 * DAY, volume: 3000, exercises: [] },
    { timestamp: S - 10 * DAY, volume: 9999, exercises: [] }, // HORS fenêtre (avant start)
  ];
  test('frequency = nb de séances DANS la fenêtre (la séance hors fenêtre exclue)', () => {
    expect(score(ch('frequency'), logs, 90)).toBe(2);
  });
  test('volume = tonnage brut (kg), PAS divisé par le PDC', () => {
    expect(score(ch('volume'), logs, 90)).toBe(8000);
  });
  test('fenêtre vide → 0', () => {
    expect(score(ch('frequency'), [{ timestamp: S - DAY, volume: 1, exercises: [] }], 90)).toBe(0);
    expect(score(ch('volume'), [], 90)).toBe(0);
  });
});

describe('Lot B — weight : e1RM (calcE1RM) %PDC', () => {
  const wlogs = [
    { timestamp: S + 1 * DAY, exercises: [{ name: 'Squat (Barre)', allSets: [
      { weight: 160, reps: 5, setType: 'normal' }, { weight: 60, reps: 8, setType: 'warmup' } ] }] },
    { timestamp: S - 20 * DAY, exercises: [{ name: 'Squat', allSets: [{ weight: 200, reps: 3, setType: 'normal' }] }] }, // HORS fenêtre
  ];
  test('meilleur e1RM du lift cible dans la fenêtre, normalisé / PDC', () => {
    // calcE1RM(160,5)=180 ; / 90 = 2.0 ; la grosse séance hors fenêtre (200kg) est exclue
    expect(score(ch('weight', { target_exercise: 'Squat' }), wlogs, 90)).toBeCloseTo(2.0, 5);
  });
  test('warmup ignoré (pas de e1RM sur la série d\'échauffement)', () => {
    const onlyWarmup = [{ timestamp: S + DAY, exercises: [{ name: 'Squat', allSets: [{ weight: 60, reps: 8, setType: 'warmup' }] }] }];
    expect(score(ch('weight', { target_exercise: 'Squat' }), onlyWarmup, 90)).toBe(0);
  });
  test('target_exercise absent des logs → 0', () => {
    expect(score(ch('weight', { target_exercise: 'Soulevé de terre' }), wlogs, 90)).toBe(0);
  });
});

describe('Lot B — _normalizeWeightScore', () => {
  test('e1RM / PDC ; fallback BW_FALLBACK_KG=80 si pdc invalide ; 0 si e1RM nul', () => {
    expect(norm(180, 90)).toBeCloseTo(2.0, 5);
    expect(norm(160, 0)).toBeCloseTo(160 / 80, 5);
    expect(norm(0, 90)).toBe(0);
  });
});

describe('Lot B — formatChallengeValue (fix Math.round)', () => {
  test('weight → ratio 2 décimales « 1.78× PDC » (pas « 2 »)', () => {
    expect(fmt(1.78, 'weight')).toBe('1.78× PDC');
    expect(fmt(2, 'weight')).toBe('2.00× PDC');
  });
  test('volume → entier + kg ; frequency → entier', () => {
    expect(fmt(12000, 'volume')).toBe('12000 kg');
    expect(fmt(5, 'frequency')).toBe('5');
    expect(fmt(0, 'frequency')).toBe('0');
  });
});
