// Nomenclature Lot 1 (audit 64) — synonymes enrichis + matching unifié.
// vm-extraction de la vraie source : WP_SYNONYMS, wpSynonymGroupOf,
// wpFindBestMatch, matchExoName (pont opt-in), wpGetExoMeta (niveau 1b),
// migrateExerciseNames (protection des noms précis).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');
const IMP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'import.js'), 'utf8');

function extractFn(src, name) {
  const sm = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!sm) throw new Error('NOT FOUND fn: ' + name);
  const start = sm.index;
  const lineEnd = src.indexOf('\n', start);
  const rest = src.slice(lineEnd);
  const em = rest.match(/\n\}/);
  return src.slice(start, em ? lineEnd + em.index + 2 : src.length);
}
function extractVar(src, name) {
  const sm = src.match(new RegExp('^(?:var|const) ' + name + ' = ([\\{\\[])', 'm'));
  if (!sm) throw new Error('NOT FOUND var: ' + name);
  const closeRe = sm[1] === '{' ? /\n\};/ : /\n\];/;
  const rest = src.slice(sm.index);
  const em = rest.match(closeRe);
  return rest.slice(0, em.index + 3);
}

function mkLog(ts, names) {
  return { timestamp: ts, exercises: names.map(n => ({ name: n, series: [{ weight: 100, reps: 5 }] })) };
}

function makeCtx(logs) {
  const ctx = vm.createContext({ console, db: { logs: logs || [] }, _sparkCache: {} });
  vm.runInContext(extractVar(APP, 'WP_SYNONYMS'), ctx);
  vm.runInContext(extractVar(APP, 'WP_EXO_META'), ctx);
  vm.runInContext(extractVar(ENG, 'EXO_SYNONYMS'), ctx); // 4e référentiel (FR↔EN), consommé par _matchExoNameCore
  vm.runInContext('var _matchCache = {}; var _matchCacheSize = 0; var _MATCH_CACHE_MAX = 2000;', ctx);
  ['wpNormalizeName', 'wpSynonymGroupOf', 'wpFindBestMatch', 'wpGetExoMeta', 'getDPIncrement', 'wpRound25']
    .forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
  ['_matchCacheStore', 'matchExoName', '_matchSynonymBridge', '_matchExoNameCore']
    .forEach(fn => vm.runInContext(extractFn(ENG, fn), ctx));
  return ctx;
}

const resolve = (ctx, name) => vm.runInContext(
  'wpFindBestMatch(' + JSON.stringify(name) + ', db.logs)', ctx);

describe('WP_SYNONYMS enrichi — les 6+ clés manquantes résolvent générique → précis', () => {
  const HISTO = ['Squat (Barre)', 'Développé Couché (Barre)', 'Curl Biceps (Barre EZ)',
    'Oiseau (Poulie)', 'Curl Poignets Paumes vers le Haut Assis',
    'Développé Couché Décliné (Barre)', 'Extension Dos (Hyperextension)',
    'Shrug (Haltère)', 'Extension Mollets Debout (Machine)', 'Tirage vers Visage'];
  const logs = [mkLog(1000, HISTO), mkLog(999, HISTO)];

  const CASES = [
    ['High Bar Squat', 'Squat (Barre)'],
    ['Bench Press (Barre)', 'Développé Couché (Barre)'],
    ['Curl Barre EZ', 'Curl Biceps (Barre EZ)'],
    ['Oiseau Poulie', 'Oiseau (Poulie)'],
    ['Curl Poignet', 'Curl Poignets Paumes vers le Haut Assis'],
    ['Développé Décliné (Barre)', 'Développé Couché Décliné (Barre)'],
    ['Hyperextension', 'Extension Dos (Hyperextension)'],
    ['Shrugs Haltères', 'Shrug (Haltère)'],
    ['Mollets (Machine)', 'Extension Mollets Debout (Machine)'],
    ['Face Pull', 'Tirage vers Visage']
  ];
  CASES.forEach(([generic, precise]) => {
    test(generic + ' → ' + precise, () => {
      expect(resolve(makeCtx(logs), generic)).toBe(precise);
    });
  });
});

describe('Anti-fusion C6(2) — les variantes restent des exercices distincts', () => {
  test('Développé Décliné (Barre) ne résout JAMAIS vers le bench plat', () => {
    // historique : décliné en premier dans les logs, plat aussi présent
    const logs = [mkLog(1000, ['Développé Couché Décliné (Barre)', 'Développé Couché (Barre)'])];
    const ctx = makeCtx(logs);
    expect(resolve(ctx, 'Développé Décliné (Barre)')).toBe('Développé Couché Décliné (Barre)');
    // et quand les deux variantes existent, le plat résout le plat
    // (le groupe de synonymes plat est purgé des déclinés — niveau 2 prioritaire).
    // NB : si SEUL le décliné existe, le niveau 3 préexistant de wpFindBestMatch
    // (fallback premier mot) peut encore le rendre — limitation signalée Lot 2.
    expect(resolve(ctx, 'Développé Couché (Barre)')).toBe('Développé Couché (Barre)');
  });

  test('Squat Pause reste distinct du squat plein', () => {
    const logs = [mkLog(1000, ['Squat avec pause (barre)', 'Squat (Barre)'])];
    const ctx = makeCtx(logs);
    expect(resolve(ctx, 'Squat Pause')).toBe('Squat avec pause (barre)');
    // le squat plein ne matche plus la variante pause (retirée du groupe 'Squat')
    const logsPauseOnly = [mkLog(1000, ['Squat avec pause (barre)'])];
    expect(resolve(makeCtx(logsPauseOnly), 'High Bar Squat')).not.toBe('Squat avec pause (barre)');
  });
});

describe('matchExoName — pont synonymes OPT-IN', () => {
  test('avec useSynonyms=true : High Bar Squat ↔ Squat (Barre)', () => {
    const ctx = makeCtx([]);
    expect(vm.runInContext('matchExoName("Squat (Barre)", "High Bar Squat", true)', ctx)).toBe(true);
    expect(vm.runInContext('matchExoName("Développé Couché (Barre)", "Bench Press (Barre)", true)', ctx)).toBe(true);
  });
  test('SANS le flag : comportement strict conservé (editRecord/deleteRecord)', () => {
    const ctx = makeCtx([]);
    expect(vm.runInContext('matchExoName("Squat (Barre)", "High Bar Squat")', ctx)).toBe(false);
    expect(vm.runInContext('matchExoName("Oiseau (Haltere)", "Oiseau (Machine)")', ctx)).toBe(false);
  });
  test('le cache sépare les deux modes (pas de contamination strict/synonymes)', () => {
    const ctx = makeCtx([]);
    vm.runInContext('matchExoName("Squat (Barre)", "High Bar Squat", true)', ctx);
    expect(vm.runInContext('matchExoName("Squat (Barre)", "High Bar Squat")', ctx)).toBe(false);
  });
});

describe('wpGetExoMeta niveau 1b — le pas du bouton « Appliquer »', () => {
  test('High Bar Squat hérite de la méta squat barre → getDPIncrement = 5 kg', () => {
    const ctx = makeCtx([]);
    const meta = vm.runInContext('wpGetExoMeta("High Bar Squat")', ctx);
    expect(meta && meta.muscleGroup).toBe('quad');
    expect(vm.runInContext('getDPIncrement("High Bar Squat", 100)', ctx)).toBe(5);
  });
});

describe('migrateExerciseNames — protection des noms précis (C6-1)', () => {
  function makeMigCtx(logNames) {
    const ctx = vm.createContext({
      console,
      db: { logs: [{ timestamp: 1, exercises: logNames.map(n => ({ name: n })) }], migrationV1: false },
      EXO_DATABASE: {
        squat_barbell: { name: 'Squat Barre', nameAlt: ['Squat (Barre)', 'Squat avec pause (barre)', 'Squat Pause', 'Back Squat'] },
        machine_fly: { name: 'Écarté Machine', nameAlt: ['Écarté (Machine)', 'Pec Deck'] },
        bench: { name: 'Développé Couché (Barre)', nameAlt: ['Bench Press', 'DC barre'] }
      },
      saveDB: function() {}, localStorage: { setItem: function() {} }, STORAGE_KEY: 'x'
    });
    vm.runInContext(extractFn(IMP, 'migrateExerciseNames'), ctx);
    vm.runInContext('migrateExerciseNames()', ctx);
    return vm.runInContext('db.logs[0].exercises.map(function(e){return e.name;})', ctx);
  }

  test('les noms précis ne sont PLUS renommés vers le générique', () => {
    expect(makeMigCtx(['Squat (Barre)', 'Écarté (Machine)', 'Squat avec pause (barre)', 'Squat Pause']))
      .toEqual(['Squat (Barre)', 'Écarté (Machine)', 'Squat avec pause (barre)', 'Squat Pause']);
  });
  test('les vrais alias continuent de migrer (Back Squat, DC barre)', () => {
    expect(makeMigCtx(['Back Squat', 'DC barre', 'Pec Deck']))
      .toEqual(['Squat Barre', 'Développé Couché (Barre)', 'Écarté Machine']);
  });
});

describe('Immutabilité — la résolution n\'écrit rien', () => {
  test('db strictement identique après wpFindBestMatch/matchExoName/wpGetExoMeta', () => {
    const logs = [mkLog(1000, ['Squat (Barre)']), mkLog(999, ['Squat (Barre)'])];
    const ctx = makeCtx(logs);
    const before = vm.runInContext('JSON.stringify(db)', ctx);
    resolve(ctx, 'High Bar Squat');
    vm.runInContext('matchExoName("Squat (Barre)", "High Bar Squat", true)', ctx);
    vm.runInContext('wpGetExoMeta("High Bar Squat")', ctx);
    expect(vm.runInContext('JSON.stringify(db)', ctx)).toBe(before);
  });
});
