// Audit 2/4 — Test des Algorithmes Clés
// Run: node audit/test-algos.js

'use strict';

// ── Constants extraites de js/engine.js (l. 130-161) ──
const VOLUME_LANDMARKS = {
  chest:      { MEV: 8,  MAV: 14, MRV: 20 },
  back:       { MEV: 8,  MAV: 16, MRV: 23 },
  shoulders:  { MEV: 6,  MAV: 12, MRV: 18 },
  quads:      { MEV: 6,  MAV: 14, MRV: 20 },
  hamstrings: { MEV: 4,  MAV: 10, MRV: 16 },
  glutes:     { MEV: 4,  MAV: 10, MRV: 16 },
  biceps:     { MEV: 4,  MAV: 10, MRV: 18 },
  triceps:    { MEV: 4,  MAV: 10, MRV: 16 },
  calves:     { MEV: 6,  MAV: 10, MRV: 16 },
  abs:        { MEV: 0,  MAV: 10, MRV: 18 },
  traps:      { MEV: 0,  MAV: 8,  MRV: 14 },
  forearms:   { MEV: 0,  MAV: 6,  MRV: 12 },
};
const MUSCLE_TO_VL_KEY = {
  'Pecs': 'chest', 'Pecs (haut)': 'chest',
  'Dos': 'back', 'Dorsaux': 'back', 'Lats': 'back',
};

// Mock global db (utilisé par calcMacrosCibles + checkNutritionStagnation)
let db = { user: {}, body: [], logs: [] };

// ── Fonctions copiées depuis js/engine.js ──

// l. 1035-1039
function getMRV(muscle, gender) {
  var key = MUSCLE_TO_VL_KEY[muscle] || muscle;
  var base = (VOLUME_LANDMARKS[key] || {}).MRV || 15;
  return gender === 'female' ? Math.round(base * 1.15) : base;
}

// l. 1143-1166
function calcMacrosCibles(kcalCible, bw) {
  var goal = (db.user && db.user.goal) || '';
  var gender = db.user && db.user.gender;
  var mode = (db.user && db.user.trainingMode) || '';
  if (mode === 'bien_etre') {
    return {
      prot: Math.round(bw * 1.6),
      carb: Math.round((kcalCible * 0.50) / 4),
      fat:  Math.round((kcalCible * 0.30) / 9),
      kcal: kcalCible
    };
  }
  var protPerKg = goal === 'recompo' ? 2.4 : 1.95;
  var prot = Math.round(bw * protPerKg);
  var fatPerKg = gender === 'female' ? Math.max(1.0, 0.73) : 0.73;
  var fat = Math.round(bw * fatPerKg);
  var carb = Math.max(0, Math.round((kcalCible - prot * 4 - fat * 9) / 4));
  return { prot: prot, carb: carb, fat: fat, kcal: kcalCible };
}

// l. 1725-1753
function checkNutritionStagnation() {
  var entries = (db.body || [])
    .filter(function(e) { return Date.now() - e.ts < 14 * 86400000 && e.weight > 0; })
    .sort(function(a, b) { return a.ts - b.ts; });
  if (entries.length < 7) return null;
  var first = entries[0].weight;
  var last = entries[entries.length - 1].weight;
  var changeKg = last - first;
  var changePerWeek = (changeKg / 14) * 7;
  var goals = (db.user && db.user.programParams && db.user.programParams.goals) || [];
  var goal = goals[0] || 'maintien';
  if (goal === 'masse' && Math.abs(changeKg) < 0.2) {
    return { adjust: 150, msg: '...', type: 'increase' };
  }
  if (goal === 'seche' && changePerWeek > -0.1) {
    return { adjust: -150, msg: '...', type: 'decrease' };
  }
  if (goal === 'recompo') {
    var bw = (db.user && db.user.bw) || 80;
    if (changePerWeek < -0.7 / 100 * bw) {
      return { adjust: 200, msg: '...', type: 'warning' };
    }
  }
  return null;
}

// l. 1868-1903
function computeBackOffSets(plannedWeight, topSetRPE, targetRPE, backOffCount, bodyPart) {
  if (!plannedWeight || plannedWeight <= 0) return { sets: [], suggestion: null };
  var count = backOffCount || 3;
  var diff = (topSetRPE || targetRPE) - (targetRPE || 8);
  var backOffWeight, suggestion = null;
  var extraReps = 0;
  if (diff > 0) {
    var reduction = Math.min(0.10 + diff * 0.02, 0.25);
    backOffWeight = Math.floor((plannedWeight * (1 - reduction)) / 2.5) * 2.5;
  } else if (diff <= -1.5) {
    backOffWeight = Math.round(plannedWeight * 1.025 / 2.5) * 2.5;
    suggestion = { type: 'bonus_set', weight: Math.round(plannedWeight * 1.05 / 2.5) * 2.5 };
  } else if (diff <= -1) {
    backOffWeight = plannedWeight;
    extraReps = 1;
    suggestion = { type: 'extra_reps' };
  } else {
    backOffWeight = plannedWeight;
  }
  backOffWeight = Math.max(20, backOffWeight);
  var lower = (bodyPart === 'lower');
  var backOffReps = (lower ? 4 : 5) + extraReps;
  var backOffRpe = Math.max(6, (targetRPE || 8) - 1.5);
  var sets = [];
  for (var i = 0; i < count; i++) {
    sets.push({ weight: backOffWeight, reps: backOffReps, rpe: backOffRpe, isWarmup: false, isBackOff: true });
  }
  return { sets: sets, suggestion: suggestion };
}

// l. 1921-1930
function processGrind(set, e1rmForLift) {
  if (!set.grind) return set;
  if (!set.rpe) {
    var pct = (e1rmForLift > 0 && set.weight > 0) ? set.weight / e1rmForLift : 0;
    set.rpe = pct > 0.80 ? 9 : 9.5;
  } else {
    set.rpe = Math.max(set.rpe, 9);
  }
  return set;
}

// l. 1932-1936
function getSetRPELabel(set) {
  if (!set.rpe && !set.grind) return '—';
  var rpe = set.rpe || '—';
  return rpe + (set.grind ? 'G' : '');
}

// l. 2049-2060
function getPrehabKey(dayKey, srsScore, injuries) {
  injuries = injuries || [];
  var isLow = (typeof srsScore === 'number') && srsScore < 55;
  var hasKnee = injuries.some(function(i) { return i && i.active && i.zone === 'genou'; });
  var hasShoulder = injuries.some(function(i) { return i && i.active && i.zone === 'epaule'; });
  var hasBack = injuries.some(function(i) { return i && i.active && (i.zone === 'dos' || i.zone === 'lombaires'); });
  if (dayKey === 'bench')   return hasShoulder ? 'bench_shoulder_injury' : isLow ? 'bench_low_readiness' : 'bench_standard';
  if (dayKey === 'squat')   return hasKnee     ? 'squat_knee_injury'     : isLow ? 'squat_low_readiness' : 'squat_standard';
  if (dayKey === 'deadlift')return hasBack     ? 'deadlift_back_injury'  : isLow ? 'deadlift_low_readiness' : 'deadlift_standard';
  if (dayKey === 'weakpoints') return 'weakpoints_standard';
  return null;
}

// ── wpCalcE1RM copiée depuis js/app.js l. 13842-13853 ──
function wpCalcE1RM(weight, reps, rpe) {
  weight = parseFloat(weight) || 0;
  reps   = parseInt(reps)    || 1;
  rpe    = parseFloat(rpe)   || null;
  if (weight <= 0) return 0;
  if (reps <= 0)   return weight;
  if (!rpe) { var d0 = 1.0278 - 0.0278 * reps; return d0 <= 0 ? weight * 1.5 : Math.round((weight / d0) * 10) / 10; }
  rpe = Math.max(6, Math.min(10, rpe));
  var divisor = 1.0278 - 0.0278 * (reps + (10 - rpe));
  if (divisor <= 0) return weight * 1.5;
  return Math.round((weight / divisor) * 10) / 10;
}

// ── Helpers de test ──
const results = [];
function check(label, input, expected, actual, ok) {
  results.push({ label, input, expected, actual, ok: ok ? 'OK' : 'KO' });
  console.log(`[${ok ? 'OK' : 'KO'}] ${label}\n   input=${input}\n   expected=${expected}\n   got=${JSON.stringify(actual)}`);
}
function approx(a, b, tol) { return Math.abs(a - b) <= (tol || 0.5); }

// ── TEST 1 : wpCalcE1RM (Brzycki + RPE) ──
console.log('\n=== TEST 1 : wpCalcE1RM ===');
const e1rm_140_3_8 = wpCalcE1RM(140, 3, 8);
// Avec RPE 8 et reps 3 : reps_to_failure = 3 + (10-8) = 5
// divisor = 1.0278 - 0.0278*5 = 0.8888 ; 140/0.8888 = 157.5
check('wpCalcE1RM(140,3,8) — Brzycki+RPE',
  'w=140, r=3, rpe=8',
  '~157.5 (RPE-adj) ou ~148 (Brzycki pur)',
  e1rm_140_3_8,
  approx(e1rm_140_3_8, 157.5, 0.6));
const e1rm_brzycki = wpCalcE1RM(140, 3, null);
// Brzycki pur : 140 / (1.0278 - 0.0278*3) = 140/0.9444 = 148.2
check('wpCalcE1RM(140,3,null) — Brzycki pur',
  'w=140, r=3, rpe=null',
  '~148.2',
  e1rm_brzycki,
  approx(e1rm_brzycki, 148.2, 0.6));

// ── TEST 2 : computeBackOffSets ──
console.log('\n=== TEST 2 : computeBackOffSets ===');
const bo_overshoot = computeBackOffSets(140, 9, 8, 3);
// diff=1, reduction=0.12, weight = floor(140*0.88/2.5)*2.5 = floor(49.28)*2.5 = 49*2.5 = 122.5
check('computeBackOffSets(140,9,8,3) — overshoot RPE 9 vs 8',
  'planned=140, top=9, target=8, count=3',
  '~123 (12% reduction) → arrondi 2.5kg = 122.5',
  bo_overshoot.sets[0],
  bo_overshoot.sets.length === 3 && bo_overshoot.sets[0].weight === 122.5);

const bo_undershoot = computeBackOffSets(140, 6, 8, 3);
// diff=-2 ≤ -1.5, weight = round(140*1.025/2.5)*2.5 = round(57.4)*2.5 = 57*2.5 = 142.5
check('computeBackOffSets(140,6,8,3) — big undershoot RPE 6 vs 8',
  'planned=140, top=6, target=8',
  '+2.5% → 143.5 → arrondi 2.5kg = 142.5 + suggestion bonus_set',
  bo_undershoot.sets[0],
  bo_undershoot.sets[0].weight === 142.5 && bo_undershoot.suggestion && bo_undershoot.suggestion.type === 'bonus_set');

// ── TEST 3 : processGrind + getSetRPELabel ──
console.log('\n=== TEST 3 : processGrind + getSetRPELabel ===');
const s1 = processGrind({ weight: 140, rpe: 7, grind: true }, 0);
check('processGrind({rpe:7, grind:true})',
  '{rpe:7, grind:true}',
  'rpe ramené à 9 (max(rpe,9))',
  s1.rpe,
  s1.rpe === 9);

const s2 = processGrind({ weight: 140, rpe: 9.5, grind: true }, 0);
check('processGrind({rpe:9.5, grind:true})',
  '{rpe:9.5, grind:true}',
  'rpe reste 9.5',
  s2.rpe,
  s2.rpe === 9.5);

check('getSetRPELabel({rpe:9, grind:true})',
  '{rpe:9, grind:true}',
  '"9G"',
  getSetRPELabel({ rpe: 9, grind: true }),
  getSetRPELabel({ rpe: 9, grind: true }) === '9G');

check('getSetRPELabel({rpe:9.5, grind:true})',
  '{rpe:9.5, grind:true}',
  '"9.5G"',
  getSetRPELabel({ rpe: 9.5, grind: true }),
  getSetRPELabel({ rpe: 9.5, grind: true }) === '9.5G');

// Test du minimum 9 pour grind via getSetRPELabel SEUL (sans processGrind)
const labelRaw = getSetRPELabel({ rpe: 7, grind: true });
check('getSetRPELabel({rpe:7, grind:true}) [SANS processGrind]',
  '{rpe:7, grind:true}',
  '"9G" (selon spec) — le label devrait clamp à 9 ?',
  labelRaw,
  labelRaw === '9G');

// ── TEST 4 : calcMacrosCibles ──
console.log('\n=== TEST 4 : calcMacrosCibles ===');
db.user = { goal: 'recompo', trainingMode: 'powerlifting', gender: 'unspecified' };
const macros_recompo = calcMacrosCibles(2500, 98);
// prot = 98*2.4 = 235.2 → 235
// fat = 98*0.73 = 71.54 → 72
// carb = (2500 - 235*4 - 72*9)/4 = (2500-940-648)/4 = 912/4 = 228
check('calcMacrosCibles(2500,98) goal=recompo',
  'kcal=2500, bw=98',
  'prot≈235, carb≈228, fat≈72, kcal=2500',
  macros_recompo,
  macros_recompo.prot === 235 && macros_recompo.fat === 72 && macros_recompo.carb === 228 && macros_recompo.kcal === 2500);

db.user = { goal: 'maintien', trainingMode: 'bien_etre', gender: 'unspecified' };
const macros_be = calcMacrosCibles(2200, 80);
// prot = 80*1.6 = 128 ; carb = (2200*0.5)/4 = 275 ; fat = (2200*0.3)/9 = 73.33 → 73
check('calcMacrosCibles(2200,80) mode=bien_etre',
  'kcal=2200, bw=80, mode=bien_etre',
  'prot=128, carb=275, fat=73, kcal=2200',
  macros_be,
  macros_be.prot === 128 && macros_be.carb === 275 && macros_be.fat === 73);

db.user = { goal: 'masse', trainingMode: 'powerlifting', gender: 'unspecified' };
const macros_masse = calcMacrosCibles(2800, 80);
// prot = 80*1.95 = 156 ; fat = 80*0.73 = 58.4 → 58
// carb = (2800 - 156*4 - 58*9)/4 = (2800-624-522)/4 = 1654/4 = 413.5 → round → 414
check('calcMacrosCibles(2800,80) goal=masse',
  'kcal=2800, bw=80',
  'prot=156, carb≈414, fat=58, kcal=2800',
  macros_masse,
  macros_masse.prot === 156 && macros_masse.fat === 58 && Math.abs(macros_masse.carb - 414) <= 1);

// ── TEST 5 : getMRV ──
console.log('\n=== TEST 5 : getMRV ===');
check('getMRV("chest","M")',
  'muscle=chest, gender=M',
  '20 (homme)',
  getMRV('chest', 'M'),
  getMRV('chest', 'M') === 20);

check('getMRV("chest","F")',
  'muscle=chest, gender=F',
  '23 (selon test) — la fonction attend "female" pas "F"',
  getMRV('chest', 'F'),
  getMRV('chest', 'F') === 23);

check('getMRV("chest","female")',
  'muscle=chest, gender=female',
  '23 (round(20*1.15))',
  getMRV('chest', 'female'),
  getMRV('chest', 'female') === 23);

// ── TEST 6 : getPrehabKey ──
console.log('\n=== TEST 6 : getPrehabKey ===');
check('getPrehabKey("bench",40,[])',
  'bench, srs=40, no injury',
  '"bench_low_readiness"',
  getPrehabKey('bench', 40, []),
  getPrehabKey('bench', 40, []) === 'bench_low_readiness');

check('getPrehabKey("squat",70,[knee])',
  'squat, srs=70, injury=genou active',
  '"squat_knee_injury"',
  getPrehabKey('squat', 70, [{ zone: 'genou', active: true }]),
  getPrehabKey('squat', 70, [{ zone: 'genou', active: true }]) === 'squat_knee_injury');

check('getPrehabKey("deadlift",70,[])',
  'deadlift, srs=70, no injury',
  '"deadlift_standard"',
  getPrehabKey('deadlift', 70, []),
  getPrehabKey('deadlift', 70, []) === 'deadlift_standard');

// ── TEST 7 : checkNutritionStagnation ──
console.log('\n=== TEST 7 : checkNutritionStagnation ===');
const NOW = Date.now();
// 14 jours stable, goal=masse via programParams.goals
db.user = { bw: 80, programParams: { goals: ['masse'] } };
db.body = [];
for (let d = 13; d >= 0; d--) {
  db.body.push({ ts: NOW - d * 86400000, weight: 80.0 });
}
const stableMasse = checkNutritionStagnation();
check('checkNutritionStagnation() poids stable goal=masse',
  '14 jours @ 80kg, goal=masse',
  '{adjust: 150, type:"increase"}',
  stableMasse,
  stableMasse && stableMasse.adjust === 150);

// 14 jours descendant (-1kg), goal=masse → null (pas de match masse car changeKg=-1)
db.body = [];
for (let d = 13; d >= 0; d--) {
  db.body.push({ ts: NOW - d * 86400000, weight: 80.0 - (13 - d) * (1 / 13) });
}
const descendingMasse = checkNutritionStagnation();
check('checkNutritionStagnation() poids descendant goal=masse',
  '14 jours -1kg, goal=masse',
  'null (pas dans la branche masse car changeKg≥0.2)',
  descendingMasse,
  descendingMasse === null);

// Bonus : si on test avec db.user.goal directement (au cas où programParams non rempli)
db.user = { bw: 80, goal: 'masse' };  // pas de programParams
db.body = [];
for (let d = 13; d >= 0; d--) {
  db.body.push({ ts: NOW - d * 86400000, weight: 80.0 });
}
const noProgramParams = checkNutritionStagnation();
check('checkNutritionStagnation() user.goal seul (sans programParams)',
  '14 jours @ 80kg, db.user.goal=masse, programParams absent',
  'fallback "maintien" → null (BUG potentiel : ignore db.user.goal)',
  noProgramParams,
  noProgramParams === null);

// ── TEST 8 : getSetRPELabel cas additionnels ──
console.log('\n=== TEST 8 : getSetRPELabel cas additionnels ===');
check('getSetRPELabel({}) (vide)',
  '{}',
  '"—"',
  getSetRPELabel({}),
  getSetRPELabel({}) === '—');

check('getSetRPELabel({rpe:8})',
  '{rpe:8}',
  '"8"',
  getSetRPELabel({ rpe: 8 }),
  getSetRPELabel({ rpe: 8 }) === '8');

check('getSetRPELabel({grind:true}) sans rpe',
  '{grind:true}',
  '"—G" ou autre — comportement à vérifier',
  getSetRPELabel({ grind: true }),
  true /* informational */);

// ── Récap ──
const okCount = results.filter(r => r.ok === 'OK').length;
const total = results.length;
console.log(`\n=== RÉCAP : ${okCount}/${total} tests OK ===`);
console.log(JSON.stringify(results, null, 2));
