// Bug compteur deload (« 160 semaines → deload permanent ») — caractérisation.
// vm-extraction de la vraie source. Fix 1 : le critère calendaire de
// shouldDeload ne se déclenche plus sans lastDeloadDate (l'ancien fallback
// comptait depuis le PREMIER log).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

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

// shouldDeload avec ses dépendances stubbées (check-in absent → critère 1 muet ;
// computeAdaptiveSRSThreshold neutre ; getEffectiveSRS identité).
function runShouldDeload(db) {
  const ctx = vm.createContext({
    db,
    getTodayCheckin: () => null,
    computeAdaptiveSRSThreshold: () => ({ mode: 'fixed' }),
    getEffectiveSRS: (x) => x
  });
  vm.runInContext(extractFn(APP, 'shouldDeload'), ctx);
  return vm.runInContext('shouldDeload(db.logs, db.user.trainingMode)', ctx);
}

// Historique long : 160 semaines de logs réguliers, volume stable (pas de chute
// → critère 2 muet), SANS lastDeloadDate.
function longHistoryDb(lastDeloadDate) {
  const logs = [];
  for (let w = 160; w >= 1; w--) {
    logs.push({ timestamp: Date.now() - w * 7 * DAY, volume: 12000, exercises: [
      { name: 'Squat (Barre)', sets: 5, allSets: [{ weight: 100, reps: 5, setType: 'normal', rpe: 7 }] }
    ] });
  }
  return {
    logs,
    user: { level: 'intermediaire', trainingMode: 'powerbuilding' },
    weeklyPlan: lastDeloadDate ? { lastDeloadDate } : {}
  };
}

describe('shouldDeload critère 3 — plus de fallback « depuis le 1er log »', () => {
  test('historique 160 semaines SANS lastDeloadDate → needed:false (avant : max_weeks 160)', () => {
    const r = runShouldDeload(longHistoryDb(null));
    expect(r.needed).toBe(false);
  });
  test('lastDeloadDate récente (2 sem) → inchangé, pas de deload calendaire', () => {
    const d = new Date(Date.now() - 14 * DAY).toISOString().split('T')[0];
    const r = runShouldDeload(longHistoryDb(d));
    expect(r.needed).toBe(false);
  });
  test('lastDeloadDate ancienne (10 sem > maxWeeks 8 intermédiaire) → déclenche toujours', () => {
    const d = new Date(Date.now() - 70 * DAY).toISOString().split('T')[0];
    const r = runShouldDeload(longHistoryDb(d));
    expect(r.needed).toBe(true);
    expect(r.trigger).toBe('max_weeks');
  });
  test('critère 1 (check-in effondré) déclenche toujours, même sans lastDeloadDate', () => {
    const db = longHistoryDb(null);
    const ctx = vm.createContext({
      db,
      getTodayCheckin: () => ({ sleep5: 1, motivation5: 1 }),
      computeAdaptiveSRSThreshold: () => ({ mode: 'fixed' }),
      getEffectiveSRS: (x) => x
    });
    vm.runInContext(extractFn(APP, 'shouldDeload'), ctx);
    const r = vm.runInContext('shouldDeload(db.logs, db.user.trainingMode)', ctx);
    expect(r.needed).toBe(true);
    expect(r.trigger).toBe('srs');
  });
});

// ── Fix 2 : detectLastDeload réparée (lit log.volume, plus exo.sets compteur) ──
describe('detectLastDeload — détection réelle des deloads passés', () => {
  function detect(logs, level) {
    const ctx = vm.createContext({ db: { logs, user: { level: level || 'intermediaire' } } });
    vm.runInContext(extractFn(APP, 'detectLastDeload'), ctx);
    return vm.runInContext('detectLastDeload()', ctx);
  }
  // Seed : 12 semaines à ~12000kg, deload à 42% il y a 4 semaines, rebond ensuite.
  function seedWithDeload() {
    const logs = [];
    for (let w = 12; w >= 1; w--) {
      const vol = (w === 4) ? 5000 : 12000;
      logs.push({ timestamp: Date.now() - w * 7 * DAY, volume: vol,
        exercises: [{ name: 'Squat (Barre)', sets: 5 }] }); // sets = NOMBRE (format réel)
    }
    return logs;
  }
  test('seed synthétique avec deload 42% + rebond → CONFIRMED_DELOAD (avant : null)', () => {
    const r = detect(seedWithDeload());
    expect(r).not.toBeNull();
    expect(r.status).toBe('CONFIRMED_DELOAD');
    expect(r.volumeRatio).toBeLessThan(0.6);
  });
  test('seed vacances (chute SANS rebond, dernière semaine) → pas de CONFIRMED', () => {
    const logs = [];
    for (let w = 12; w >= 2; w--) logs.push({ timestamp: Date.now() - w * 7 * DAY, volume: 12000, exercises: [] });
    logs.push({ timestamp: Date.now() - 7 * DAY, volume: 4000, exercises: [] }); // chute, pas de rebond connu
    const r = detect(logs);
    expect(r === null || r.status !== 'CONFIRMED_DELOAD').toBe(true);
  });
  test('fallback allSets quand log.volume absent', () => {
    const logs = [];
    for (let w = 12; w >= 1; w--) {
      const perSet = (w === 4) ? 40 : 100; // 5×5 → 1000kg vs 2500kg (40%)
      logs.push({ timestamp: Date.now() - w * 7 * DAY,
        exercises: [{ name: 'Squat (Barre)', sets: 5,
          allSets: [1,2,3,4,5].map(() => ({ weight: perSet, reps: 5, setType: 'normal' })) }] });
    }
    const r = detect(logs);
    expect(r).not.toBeNull();
    expect(r.status).toBe('CONFIRMED_DELOAD');
  });
});

// ── Fix 2b : l'écriture SOURCE 0 est au boot, plus dans wpDetectPhase ──
describe('render pur préservé — initDeloadDetection au boot', () => {
  test('initDeloadDetection pose lastDeloadDate si deload confirmé (one-shot)', () => {
    const logs = [];
    for (let w = 12; w >= 1; w--) logs.push({ timestamp: Date.now() - w * 7 * DAY, volume: (w === 4) ? 5000 : 12000, exercises: [] });
    const saved = [];
    const ctx = vm.createContext({ db: { logs, user: { level: 'intermediaire' }, weeklyPlan: {} }, saveDB: () => saved.push(1), console });
    ['detectLastDeload', 'initDeloadDetection'].forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
    vm.runInContext('initDeloadDetection()', ctx);
    expect(vm.runInContext('db.weeklyPlan.lastDeloadDate', ctx)).toBeTruthy();
    expect(vm.runInContext('db.weeklyPlan._deloadDetectedAuto', ctx)).toBe(true);
    expect(saved.length).toBe(1);
    // one-shot : deuxième appel ne réécrit pas
    vm.runInContext('initDeloadDetection()', ctx);
    expect(saved.length).toBe(1);
  });
  test('wpDetectPhase ne contient plus l\'écriture lastDeloadDate', () => {
    const body = extractFn(APP, 'wpDetectPhase');
    expect(body.indexOf('lastDeloadDate = _detected')).toBe(-1);
    expect(body.indexOf('_deloadDetectedAuto = true')).toBe(-1);
  });
});

// ── Fix 3 : le pont — générer un plan deload POSE lastDeloadDate ─────────────
// generateWeeklyPlan est massive et DOM-dépendante → on extrait le fragment
// RÉEL (restauration v228 + pont), auto-contenu : il ne référence que db/plan.
describe('pont plan-deload → lastDeloadDate (generateWeeklyPlan)', () => {
  function extractBridge() {
    const start = APP.indexOf('// v228 — préserver currentBlock');
    if (start === -1) throw new Error('marqueur v228 introuvable');
    const endMark = APP.indexOf('_deloadDetectedAuto = false;', start);
    if (endMark === -1) throw new Error('pont deload introuvable après la restauration v228');
    const end = APP.indexOf('}', endMark);
    return APP.slice(start, end + 1);
  }
  function runBridge(db, plan) {
    const ctx = vm.createContext({ db, plan });
    vm.runInContext(extractBridge(), ctx);
    return db;
  }
  const oldDate = new Date(Date.now() - 70 * DAY).toISOString().split('T')[0]; // 10 sem
  test('plan deload → lastDeloadDate = date de génération (écrase la restauration v228)', () => {
    const db = { weeklyPlan: { lastDeloadDate: oldDate, _deloadDetectedAuto: true } };
    const plan = { isDeload: true, generated_at: new Date().toISOString() };
    runBridge(db, plan);
    expect(db.weeklyPlan.lastDeloadDate).toBe(plan.generated_at.split('T')[0]);
    expect(db.weeklyPlan._deloadDetectedAuto).toBe(false); // deload réel, plus heuristique
  });
  test('plan normal → lastDeloadDate antérieure préservée (restauration v228 intacte)', () => {
    const db = { weeklyPlan: { lastDeloadDate: oldDate } };
    runBridge(db, { isDeload: false, generated_at: new Date().toISOString() });
    expect(db.weeklyPlan.lastDeloadDate).toBe(oldDate);
  });
  test('boucle fermée : max_weeks déclenché à 10 sem → pont posé → compteur reparti, plus de deload', () => {
    const db = longHistoryDb(oldDate);
    expect(runShouldDeload(db).trigger).toBe('max_weeks'); // avant le pont
    runBridge(db, { isDeload: true, generated_at: new Date().toISOString() });
    const after = runShouldDeload(db);
    expect(after.needed).toBe(false); // le compteur repart de la décharge réelle
  });
});
