// Fix filtre warmup des métadonnées de set (goToggleSetComplete).
// Avant : le filtre _workIdx testait isWarmup/setType (inexistants sur les sets
// d'activeWorkout) → setIndex comptait les warmups, isTopSet toujours faux sur
// le vrai top set. Après : filtre sur s.type === 'warmup' (le vrai champ).
// vm-extraction de la vraie source (même infrastructure que les autres harnais).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const sm = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!sm) throw new Error('NOT FOUND in source: ' + name);
  const start = sm.index;
  const lineEnd = src.indexOf('\n', start);
  const rest = src.slice(lineEnd);
  const em = rest.match(/\n\}/);
  return src.slice(start, em ? lineEnd + em.index + 2 : src.length);
}

function makeCtx(sets) {
  const ctx = vm.createContext({
    console,
    activeWorkout: { exercises: [{ name: 'Squat (Barre)', sets: sets, restSeconds: 180 }] },
    db: { user: { coachProfile: 'silent', lpStrikes: {} } },
    navigator: {},
    setTimeout: function() {},
    Date: Date,
    document: { querySelectorAll: function() { return []; }, getElementById: function() { return null; } },
    // Globals HR lus par goToggleSetComplete
    _currentHR: null, _hrSeriesPeak: null, _hrRecov30s: null, _hrRecov60s: null, _hrSeriesStart: null,
    // Stubs du pipeline (l'auto-reg elle-même est couverte par autoreg-apply.test.js)
    goIsPartOfSuperset: function() { return false; },
    getAdaptiveRestTime: function(rpe, rest) { return { seconds: rest, message: null }; },
    goStartRestTimer: function() {},
    goCheckAutoRegulation: function() { return null; },
    showLiveCoachBanner: function() {},
    showToast: function() {},
    goAutoSave: function() {},
    goUpdateCounters: function() {},
    goRequestRender: function() {}
  });
  vm.runInContext(extractFn(APP, 'goToggleSetComplete'), ctx);
  return ctx;
}

function mkSet(type, weight) {
  return { type: type, completed: false, weight: weight, reps: 5, rpe: null, flags: [] };
}

describe('goToggleSetComplete — métadonnées setIndex/isTopSet (filtre warmup corrigé)', () => {
  test('4 warmups + 4 work sets : 1er work set coché → setIndex=0, isTopSet=true', () => {
    const sets = [
      mkSet('warmup', 25), mkSet('warmup', 32.5), mkSet('warmup', 42.5), mkSet('warmup', 47.5),
      mkSet('normal', 60), mkSet('normal', 60), mkSet('normal', 60), mkSet('normal', 60)
    ];
    const ctx = makeCtx(sets);
    vm.runInContext('goToggleSetComplete(0, 4)', ctx);
    const s = vm.runInContext('activeWorkout.exercises[0].sets[4]', ctx);
    expect(s.completed).toBe(true);
    expect(s.setIndex).toBe(0);   // avant le fix : 4 (les warmups étaient comptés)
    expect(s.isTopSet).toBe(true); // avant le fix : false
  });

  test('2e work set coché → setIndex=1, isTopSet=false', () => {
    const sets = [
      mkSet('warmup', 25), mkSet('warmup', 42.5),
      mkSet('normal', 60), mkSet('normal', 60)
    ];
    const ctx = makeCtx(sets);
    vm.runInContext('goToggleSetComplete(0, 2)', ctx);
    vm.runInContext('goToggleSetComplete(0, 3)', ctx);
    const s = vm.runInContext('activeWorkout.exercises[0].sets[3]', ctx);
    expect(s.setIndex).toBe(1);
    expect(s.isTopSet).toBe(false);
  });

  test('séance sans warmup : indices inchangés (non-régression)', () => {
    const sets = [mkSet('normal', 100), mkSet('normal', 100)];
    const ctx = makeCtx(sets);
    vm.runInContext('goToggleSetComplete(0, 0)', ctx);
    const s = vm.runInContext('activeWorkout.exercises[0].sets[0]', ctx);
    expect(s.setIndex).toBe(0);
    expect(s.isTopSet).toBe(true);
  });
});
