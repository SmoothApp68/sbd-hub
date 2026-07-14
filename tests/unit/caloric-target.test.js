// Audit justesse calorique — un seul comptage de l'activité.
// calcTDEE lit désormais db.user.goal (recompo −500…), PHASE_KCAL retiré,
// facteur d'activité cappé 1.6/1.7. getDailyCaloricTarget retire le bonus
// jour-séance. vm-extraction de la vraie source.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const ENG = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!m) throw new Error('NOT FOUND: ' + name);
  let depth = 0, i = src.indexOf('{', m.index), started = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}

const DAY = 86400000;
// Profil aurel : 98 kg, 182 cm, 28 ans, homme. `sessions` = séances/sem moyennes
// sur 28j (le facteur lit désormais la fréquence 28j lissée, pas 7j).
function tdee(goal, sessionsPerWeek) {
  const logs = [];
  const total = Math.round(sessionsPerWeek * 4); // sur 28 jours pleins
  for (let i = 0; i < total; i++) logs.push({ timestamp: Date.now() - (i * 28 / total) * DAY });
  const ctx = vm.createContext({
    db: { user: { bw: 98, height: 182, age: 28, gender: 'male', goal, trainingMode: 'powerbuilding', tdeeAdjustment: 0 }, logs },
    getLogsInRange: (n) => logs.filter(l => l.timestamp > Date.now() - n * DAY),
    wpDetectPhase: () => 'hypertrophie', Date
  });
  vm.runInContext(extractFn(ENG, 'calcTDEE'), ctx);
  return vm.runInContext('calcTDEE(98, 0)', ctx);
}

// Variante : logs arbitraires (pour piloter la position des séances ET l'ancienneté
// de l'historique complet — le diviseur se mesure sur db.logs, pas sur la fenêtre).
function tdeeFromLogs(logs, goal) {
  const ctx = vm.createContext({
    db: { user: { bw: 98, height: 182, age: 28, gender: 'male', goal, trainingMode: 'powerbuilding', tdeeAdjustment: 0 }, logs },
    getLogsInRange: (n) => logs.filter(l => l.timestamp > Date.now() - n * DAY),
    wpDetectPhase: () => 'hypertrophie', Date
  });
  vm.runInContext(extractFn(ENG, 'calcTDEE'), ctx);
  return vm.runInContext('calcTDEE(98, 0)', ctx);
}

describe('calcTDEE — diviseur sur l\'ancienneté de l\'HISTORIQUE, pas de la fenêtre (fix v345)', () => {
  // 20 séances dans la fenêtre 28j dont la 1ʳᵉ à J-`oldestInWindow` (trou en début
  // de fenêtre), + éventuel historique ancien HORS fenêtre.
  function deviceLogs(oldestInWindow, olderHistoryDays) {
    const logs = [];
    for (let i = 0; i < 20; i++) logs.push({ timestamp: Date.now() - (i * oldestInWindow / 19) * DAY });
    (olderHistoryDays || []).forEach(d => logs.push({ timestamp: Date.now() - d * DAY }));
    return logs;
  }
  test('scénario device aurel : 20 séances, 1ʳᵉ à J-22, historique long → 2672 (PAS 2870)', () => {
    // Avant fix : semaines = 22/7 = 3.14 → 20/3.14 = 6.36/sem → 1.7 → 2870.
    // Après : historique ≥ 28j → ÷4 → 5.0/sem → 1.6 → 2672.
    expect(tdeeFromLogs(deviceLogs(22, [45, 60]), 'recompo')).toBe(2672);
  });
  test('stable : le trou en début de fenêtre ne fait plus osciller le TDEE', () => {
    // Même historique long, mêmes 20 séances — étalées sur 27j OU tassées sur 18j.
    const spread = tdeeFromLogs(deviceLogs(27, [45, 60]), 'recompo');
    const packed = tdeeFromLogs(deviceLogs(18, [45, 60]), 'recompo');
    expect(spread).toBe(2672);
    expect(packed).toBe(spread);
  });
  test('nouvel utilisateur (compte 13j, 10 séances) : protection anti-sous-estimation intacte', () => {
    // Historique complet = 13j → ÷1.86 → 5.38/sem → 1.6 → 2672 (÷4 strict aurait
    // donné 2.5/sem → 1.3 → 2077 : sous-estimé).
    const logs = [];
    for (let i = 0; i < 10; i++) logs.push({ timestamp: Date.now() - (i * 13 / 9) * DAY });
    expect(tdeeFromLogs(logs, 'recompo')).toBe(2672);
  });
  test('le diviseur lit db.logs (historique complet), pas la fenêtre', () => {
    const src = extractFn(ENG, 'calcTDEE');
    expect(src).toContain('(db.logs || []).reduce');
    expect(src).not.toContain('_logs28.reduce');
  });
});

describe('calcTDEE — facteur sur fréquence 28j (stable, pas 7j volatile)', () => {
  test('20 séances/28j (5/sem) → 1.6 → 2672 recompo', () => {
    expect(tdee('recompo', 5)).toBe(2672);
  });
  test('stable : une semaine dense ne change pas le TDEE (moyenne 28j)', () => {
    // même total 28j → même facteur, que la dernière semaine soit dense ou calme
    const denseWeek = (() => {
      const logs = [];
      for (let d = 0; d < 7; d++) logs.push({ timestamp: Date.now() - d * DAY });      // 7 récentes
      for (let d = 8; d < 28; d += 1.6) logs.push({ timestamp: Date.now() - d * DAY }); // reste
      const l = logs.slice(0, 20);
      const ctx = vm.createContext({
        db: { user: { bw: 98, height: 182, age: 28, gender: 'male', goal: 'recompo', trainingMode: 'powerbuilding', tdeeAdjustment: 0 }, logs: l },
        getLogsInRange: (n) => l.filter(x => x.timestamp > Date.now() - n * DAY),
        wpDetectPhase: () => 'hypertrophie', Date
      });
      vm.runInContext(extractFn(ENG, 'calcTDEE'), ctx);
      return vm.runInContext('calcTDEE(98, 0)', ctx);
    })();
    expect(denseWeek).toBe(tdee('recompo', 5)); // 7 séances récentes → toujours 2672
  });
  test('lit bien la fenêtre 28j (getLogsInRange(28))', () => {
    expect(extractFn(ENG, 'calcTDEE')).toContain('getLogsInRange(28)');
  });
});

describe('calcTDEE — objectif branché, un seul comptage', () => {
  test('aurel recompo 5 séances → ~2600-2700 (avant : ~3671 avec PHASE_KCAL+bonus)', () => {
    const v = tdee('recompo', 5);
    expect(v).toBeGreaterThan(2500);
    expect(v).toBeLessThan(2800);
  });
  test('recompo applique bien −500 vs maintien (même facteur)', () => {
    expect(tdee('maintien', 5) - tdee('recompo', 5)).toBe(500);
  });
  test('masse = surplus (+300 vs maintien)', () => {
    expect(tdee('masse', 5) - tdee('maintien', 5)).toBe(300);
  });
  test('sèche = déficit plus marqué (−600)', () => {
    expect(tdee('maintien', 5) - tdee('seche', 5)).toBe(600);
  });
  test('facteur cappé : 6+ séances → 1.7 (plus de 1.85)', () => {
    // BMR aurel = 10*98+6.25*182-5*28+5 = 1982.5 ; round(×1.7) = 3370 (observé)
    expect(tdee('maintien', 6)).toBe(3370);
    // 5 séances → 1.6 → round(1982.5*1.6) = 3172
    expect(tdee('maintien', 5)).toBe(3172);
  });
  test('PHASE_KCAL retiré : la phase n\'influe plus (goal seul pilote)', () => {
    const src = extractFn(ENG, 'calcTDEE');
    expect(src).not.toContain('var PHASE_KCAL'); // table de phase supprimée (le commentaire mentionne l'ex-nom)
    expect(src).toContain('GOAL_KCAL');
  });
});

describe('getDailyCaloricTarget — un seul comptage, macros P2.2/L0.9', () => {
  const src = extractFn(APP, 'getDailyCaloricTarget');
  test('bonus jour-séance ×1.10/×0.90 retiré du calcul kcal', () => {
    expect(src).not.toContain('tdee * multiplier');
    expect(src).not.toContain('isSBDDay ? 1.10');
    expect(src).toContain('Math.round(tdee)');
  });
  test('macros : P 2.2 g/kg, L 0.9 g/kg, glucides = reste', () => {
    expect(src).toContain('bw * 2.2'); // protéines
    expect(src).toContain('bw * 0.9'); // lipides
    // aurel 98 kg → P 216, L 88
    expect(Math.round(98 * 2.2)).toBe(216);
    expect(Math.round(98 * 0.9)).toBe(88);
  });
});
