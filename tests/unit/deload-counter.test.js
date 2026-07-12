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
