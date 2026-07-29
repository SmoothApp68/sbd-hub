// Crash « lancer la séance du jour » — divergence de type dans db.routineExos.
//
// db.routineExos est un registre de NOMS d'exercices : tout consommateur finit dans
// matchExoName → norm → s.toLowerCase(). Deux écrivains (wpApplyDay / wpApplyAll,
// boutons « Appliquer au programme » du plan hebdo) y recopiaient les objets
// exercice de db.weeklyPlan tels quels ({name, sets, ...}) → TypeError au clic sur
// « Lancer la séance du jour » (app.js, _goDoStartWorkout → matchExoName(e.name, exoRef)).
//
// Ces tests EXÉCUTENT la vraie source (vm-extraction) des deux côtés du fix :
//   - côté écrivain  : wpApplyDay / wpApplyAll n'écrivent plus que des chaînes ;
//   - côté lecteur   : getProgExosForDay normalise ce qu'il trouve, ce qui répare
//                      aussi les blobs DÉJÀ pollués (le fix écrivain ne nettoie pas
//                      le passé — un profil cassé le reste sans ça).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

const { getProgExosForDay, normalizeExoName, matchExoName } = require('../../js/engine.js');

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

// Un weeklyPlan réaliste : les exercices y sont des OBJETS (c'est le format du plan,
// pas un accident) — c'est bien la recopie brute vers routineExos qui était le bug.
function planWithObjects() {
  return {
    days: [
      { day: 'Lundi', exercises: [
        { name: 'Squat (Barre)', sets: [{ weight: 100, reps: 5 }], isPrimary: true },
        { name: 'Presse à Cuisses', sets: [{ weight: 200, reps: 10 }] }
      ] },
      { day: 'Mardi', rest: true },
      { day: 'Mercredi', exercises: [
        { name: 'Développé Couché (Barre)', sets: [{ weight: 80, reps: 5 }], isPrimary: true }
      ] }
    ]
  };
}

function makeCtx(db) {
  const toasts = [];
  const ctx = vm.createContext({
    db,
    normalizeExoName,
    saveDB: () => {},
    refreshUI: () => {},
    showToast: (t) => toasts.push(t),
    // wpApplyAll passe par une confirmation : on déclenche le callback.
    showModal: (_title, _label, _color, cb) => cb()
  });
  ctx.__toasts = toasts;
  return ctx;
}

// ── Côté ÉCRIVAIN ────────────────────────────────────────────────────────────

describe('wpApplyDay / wpApplyAll écrivent des NOMS, pas des objets', () => {
  test('wpApplyDay : routineExos[jour] ne contient que des chaînes', () => {
    const db = { weeklyPlan: planWithObjects(), routineExos: null };
    const ctx = makeCtx(db);
    vm.runInContext(extractFn(APP, 'wpApplyDay'), ctx);
    vm.runInContext("wpApplyDay('Lundi')", ctx);

    expect(db.routineExos.Lundi).toEqual(['Squat (Barre)', 'Presse à Cuisses']);
    db.routineExos.Lundi.forEach((e) => expect(typeof e).toBe('string'));
    expect(ctx.__toasts.length).toBe(1);
  });

  test('wpApplyAll : tous les jours non-repos, chaînes uniquement', () => {
    const db = { weeklyPlan: planWithObjects(), routineExos: null };
    const ctx = makeCtx(db);
    vm.runInContext(extractFn(APP, 'wpApplyAll'), ctx);
    vm.runInContext('wpApplyAll()', ctx);

    expect(db.routineExos.Lundi).toEqual(['Squat (Barre)', 'Presse à Cuisses']);
    expect(db.routineExos.Mercredi).toEqual(['Développé Couché (Barre)']);
    expect(db.routineExos.Mardi).toBeUndefined(); // jour de repos : rien écrit
    Object.values(db.routineExos).forEach((arr) =>
      arr.forEach((e) => expect(typeof e).toBe('string')));
  });

  test('un exercice sans nom exploitable est écarté, pas écrit tel quel', () => {
    const db = { weeklyPlan: { days: [
      { day: 'Lundi', exercises: [{ name: 'Squat (Barre)' }, { sets: [] }, {}] }
    ] }, routineExos: null };
    const ctx = makeCtx(db);
    vm.runInContext(extractFn(APP, 'wpApplyDay'), ctx);
    vm.runInContext("wpApplyDay('Lundi')", ctx);
    expect(db.routineExos.Lundi).toEqual(['Squat (Barre)']);
  });
});

// ── Le CRASH lui-même ────────────────────────────────────────────────────────

describe('la chaîne écrivain → lecteur → matchExoName ne crashe plus', () => {
  // Garde-fou : ce test échoue si quelqu'un « simplifie » la normalisation.
  // C'est bien un objet nu qui fait tomber matchExoName (norm → s.toLowerCase).
  test('matchExoName sur un objet nu lève TypeError (la cause du crash)', () => {
    expect(() => matchExoName('Squat (Barre)', { name: 'Squat (Barre)', sets: [] }))
      .toThrow(TypeError);
  });

  test('après wpApplyDay, ce que lit getProgExosForDay traverse matchExoName', () => {
    const db = { weeklyPlan: planWithObjects(), routineExos: null };
    const ctx = makeCtx(db);
    vm.runInContext(extractFn(APP, 'wpApplyDay'), ctx);
    vm.runInContext("wpApplyDay('Lundi')", ctx);

    global.db = db;
    const exos = getProgExosForDay('Lundi');
    expect(exos.length).toBe(2);
    // _goDoStartWorkout balaye EXO_DATABASE avec chaque exoRef : c'est là que ça cassait.
    exos.forEach((exoRef) => {
      expect(() => matchExoName('Squat (Barre)', exoRef)).not.toThrow();
    });
    expect(matchExoName('Squat (Barre)', exos[0])).toBe(true);
    delete global.db;
  });

  test('un blob DÉJÀ pollué (profil existant) est réparé à la lecture', () => {
    // Le fix écrivain ne nettoie pas rétroactivement : sans normalisation à la
    // lecture, un utilisateur ayant cliqué « Appliquer » avant le fix reste bloqué.
    global.db = { routineExos: { Lundi: [
      { name: 'Squat (Barre)', sets: [{ weight: 100 }] },
      'Presse à Cuisses',
      { sets: [] }
    ] } };
    const exos = getProgExosForDay('Lundi');
    expect(exos).toEqual(['Squat (Barre)', 'Presse à Cuisses']);
    exos.forEach((e) => expect(() => matchExoName('Squat (Barre)', e)).not.toThrow());
    delete global.db;
  });
});

// ── Côté LECTEUR : contrat de getProgExosForDay ──────────────────────────────

describe('getProgExosForDay — contrat : toujours un tableau de chaînes', () => {
  afterEach(() => { delete global.db; });

  test('jour absent → tableau vide', () => {
    global.db = { routineExos: {} };
    expect(getProgExosForDay('Lundi')).toEqual([]);
  });

  test('routineExos absent → tableau vide', () => {
    global.db = {};
    expect(getProgExosForDay('Lundi')).toEqual([]);
  });

  test('format legacy chaîne → split conservé (non-régression)', () => {
    global.db = { routineExos: { Lundi: 'Squat (Barre); Presse à Cuisses\nRowing' } };
    expect(getProgExosForDay('Lundi')).toEqual(['Squat (Barre)', 'Presse à Cuisses', 'Rowing']);
  });

  test('tableau de chaînes → inchangé (non-régression)', () => {
    global.db = { routineExos: { Lundi: ['Squat (Barre)', 'Rowing'] } };
    expect(getProgExosForDay('Lundi')).toEqual(['Squat (Barre)', 'Rowing']);
  });

  test('objet nu (ni tableau ni chaîne) → tableau vide, pas de crash', () => {
    // Avant le fix : saved.split n'existe pas sur un objet → TypeError.
    global.db = { routineExos: { Lundi: { name: 'Squat' } } };
    expect(() => getProgExosForDay('Lundi')).not.toThrow();
    expect(getProgExosForDay('Lundi')).toEqual([]);
  });

  test('ne renvoie jamais une référence sur le tableau stocké', () => {
    const stored = ['Squat (Barre)'];
    global.db = { routineExos: { Lundi: stored } };
    getProgExosForDay('Lundi').push('Intrus');
    expect(stored).toEqual(['Squat (Barre)']);
  });
});

describe('normalizeExoName', () => {
  test('chaîne → trim', () => expect(normalizeExoName('  Squat  ')).toBe('Squat'));
  test('objet exercice → son nom', () =>
    expect(normalizeExoName({ name: 'Squat (Barre)', sets: [] })).toBe('Squat (Barre)'));
  test('objet sans nom → chaîne vide (filtrée en aval)', () =>
    expect(normalizeExoName({ sets: [] })).toBe(''));
  test('null / undefined / nombre → chaîne vide', () => {
    expect(normalizeExoName(null)).toBe('');
    expect(normalizeExoName(undefined)).toBe('');
    expect(normalizeExoName(42)).toBe('');
  });
});

// ── Les lecteurs qui contournaient le lecteur défensif ───────────────────────

describe('les écrans de programme passent par le lecteur défensif', () => {
  test('renderSettingsRoutineEditor : editingExos ne contient que des chaînes', () => {
    const db = { routineExos: { Lundi: [{ name: 'Squat (Barre)', sets: [] }, 'Rowing'] } };
    const ctx = vm.createContext({
      db,
      DAYS_FULL: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
      getRoutine: () => ({}),
      getProgExosForDay: (day) => { global.db = db; const r = getProgExosForDay(day); delete global.db; return r; },
      renderExoEditor: () => {},
      editingRoutine: null,
      editingExos: null,
      JSON
    });
    vm.runInContext(extractFn(APP, 'renderSettingsRoutineEditor'), ctx);
    vm.runInContext('renderSettingsRoutineEditor()', ctx);
    const editingExos = vm.runInContext('editingExos', ctx);
    expect(editingExos.Lundi).toEqual(['Squat (Barre)', 'Rowing']);
    Object.values(editingExos).forEach((arr) =>
      arr.forEach((e) => expect(typeof e).toBe('string')));
  });

  test('pbEditExisting : dayExercises ne contient que des chaînes', () => {
    const db = {
      user: { programMode: 'auto' },
      routineExos: { Lundi: [{ name: 'Squat (Barre)', sets: [] }] }
    };
    const ctx = vm.createContext({
      db,
      getRoutine: () => ({ Lundi: 'Jambes', Mardi: '😴 Repos' }),
      getProgExosForDay: (day) => { global.db = db; const r = getProgExosForDay(day); delete global.db; return r; },
      renderProgramBuilder: () => {},
      pbStartCustomBuilder: () => {},
      _pbState: null
    });
    vm.runInContext(extractFn(APP, 'pbEditExisting'), ctx);
    vm.runInContext('pbEditExisting()', ctx);
    const state = vm.runInContext('_pbState', ctx);
    expect(state.dayExercises.Jambes).toEqual(['Squat (Barre)']);
    // Le jour de repos n'entre pas dans le builder.
    expect(state.dayNames).toEqual(['Jambes']);
  });
});
