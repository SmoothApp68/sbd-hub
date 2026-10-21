// Sparklines GO — computeExoSparklineData (LECTURE SEULE).
// vm-extraction de la vraie source app.js : computeExoSparklineData, calcE1RM,
// wpNormalizeName, wpFindBestMatch (+ WP_SYNONYMS réel). Assertion clé :
// la fonction n'écrit RIEN (db identique avant/après).
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

function extractVar(src, name) {
  const sm = src.match(new RegExp('^var ' + name + ' = ([\\{\\[])', 'm'));
  if (!sm) throw new Error('NOT FOUND var in source: ' + name);
  const closeRe = sm[1] === '{' ? /\n\};/ : /\n\];/;
  const rest = src.slice(sm.index);
  const em = rest.match(closeRe);
  return rest.slice(0, em.index + 3);
}

// Une séance de log au format réel : exercises[].series = work sets uniquement
function mkLog(ts, exoName, series, allSets) {
  const exo = { name: exoName };
  if (series) exo.series = series;
  if (allSets) exo.allSets = allSets;
  return { timestamp: ts, exercises: [exo] };
}

function makeCtx(logs) {
  const ctx = vm.createContext({ console, db: { logs: logs }, _sparkCache: {} });
  vm.runInContext(extractVar(APP, 'WP_SYNONYMS'), ctx);
  ['calcE1RM', 'wpNormalizeName', 'wpFindBestMatch', 'computeExoSparklineData']
    .forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
  return ctx;
}

const call = (ctx, name) => vm.runInContext(
  'computeExoSparklineData(' + JSON.stringify(name) + ')', ctx);

describe('computeExoSparklineData — points e1RM par séance', () => {
  test('10 séances → 10 points chronologiques, meilleur e1RM par séance', () => {
    // logs plus récent en premier (index 0), poids croissant dans le temps
    const logs = [];
    for (let i = 0; i < 10; i++) {
      const w = 100 - i * 2.5; // plus ancien = plus léger
      logs.push(mkLog(1000 - i, 'Squat (Barre)', [
        { weight: w, reps: 5 },
        { weight: w - 20, reps: 10 } // set secondaire moins fort
      ]));
    }
    const ctx = makeCtx(logs);
    const pts = call(ctx, 'Squat (Barre)');
    expect(pts).toHaveLength(10);
    // chronologique : premier point = plus ancien (t=991), dernier = plus récent (t=1000)
    expect(pts[0].t).toBe(991);
    expect(pts[9].t).toBe(1000);
    // meilleur e1RM de la séance la plus récente : calcE1RM(100,5)
    const e100x5 = vm.runInContext('calcE1RM(100,5)', ctx);
    expect(pts[9].e1rm).toBe(e100x5);
    // croissance monotone (poids croissant dans le temps)
    for (let i = 1; i < 10; i++) expect(pts[i].e1rm).toBeGreaterThan(pts[i - 1].e1rm);
  });

  test('15 séances → seulement les 10 plus récentes', () => {
    const logs = [];
    for (let i = 0; i < 15; i++) logs.push(mkLog(1000 - i, 'Squat (Barre)', [{ weight: 100, reps: 5 }]));
    const pts = call(makeCtx(logs), 'Squat (Barre)');
    expect(pts).toHaveLength(10);
    expect(pts[0].t).toBe(991); // la 10e plus récente, pas la 15e
  });

  test('forme legacy sans series → fallback allSets, warmups exclus', () => {
    const logs = [
      mkLog(1000, 'Squat (Barre)', null, [
        { weight: 140, reps: 5, setType: 'warmup' },  // warmup lourd → exclu
        { weight: 100, reps: 5, setType: 'normal' },
        { weight: 90, reps: 5, setType: 'dropset' }   // dropset → exclu
      ]),
      mkLog(999, 'Squat (Barre)', null, [{ weight: 95, reps: 5, setType: 'normal' }])
    ];
    const ctx = makeCtx(logs);
    const pts = call(ctx, 'Squat (Barre)');
    expect(pts).toHaveLength(2);
    expect(pts[1].e1rm).toBe(vm.runInContext('calcE1RM(100,5)', ctx)); // pas 140
  });

  test('< 2 séances d\'historique → null (pas de courbe à 1 point)', () => {
    expect(call(makeCtx([mkLog(1000, 'Squat (Barre)', [{ weight: 100, reps: 5 }])]), 'Squat (Barre)')).toBeNull();
    expect(call(makeCtx([]), 'Squat (Barre)')).toBeNull();
  });

  test('exercice absent des logs → null', () => {
    const logs = [mkLog(1000, 'Curl Biceps', [{ weight: 20, reps: 10 }]),
      mkLog(999, 'Curl Biceps', [{ weight: 20, reps: 10 }])];
    expect(call(makeCtx(logs), 'Squat (Barre)')).toBeNull();
  });

  test('nom qui varie : « Développé couché » matche « Développé Couché (Barre) »', () => {
    const logs = [
      mkLog(1000, 'Développé Couché (Barre)', [{ weight: 100, reps: 5 }]),
      mkLog(999, 'Développé Couché (Barre)', [{ weight: 97.5, reps: 5 }])
    ];
    const pts = call(makeCtx(logs), 'Développé couché');
    expect(pts).toHaveLength(2);
  });

  test('sets invalides (poids/reps 0) ignorés — séance sans set valide sautée', () => {
    const logs = [
      mkLog(1000, 'Squat (Barre)', [{ weight: 0, reps: 5 }, { weight: 100, reps: 0 }]),
      mkLog(999, 'Squat (Barre)', [{ weight: 100, reps: 5 }]),
      mkLog(998, 'Squat (Barre)', [{ weight: 95, reps: 5 }])
    ];
    const pts = call(makeCtx(logs), 'Squat (Barre)');
    expect(pts).toHaveLength(2); // la séance t=1000 n'a aucun set valide
    expect(pts.map(p => p.t)).toEqual([998, 999]);
  });

  test('ASSERTION CLÉ — aucune écriture : db strictement identique avant/après', () => {
    const logs = [];
    for (let i = 0; i < 5; i++) logs.push(mkLog(1000 - i, 'Squat (Barre)', [{ weight: 100 - i, reps: 5 }]));
    const ctx = makeCtx(logs);
    const before = vm.runInContext('JSON.stringify(db)', ctx);
    call(ctx, 'Squat (Barre)');
    call(ctx, 'Squat (Barre)'); // 2e appel (chemin cache)
    call(ctx, 'Développé couché');
    const after = vm.runInContext('JSON.stringify(db)', ctx);
    expect(after).toBe(before);
  });

  test('cache : 2e appel renvoie le même tableau sans recalcul, invalidé si logs changent', () => {
    const logs = [mkLog(1000, 'Squat (Barre)', [{ weight: 100, reps: 5 }]),
      mkLog(999, 'Squat (Barre)', [{ weight: 95, reps: 5 }])];
    const ctx = makeCtx(logs);
    const a = call(ctx, 'Squat (Barre)');
    const b = call(ctx, 'Squat (Barre)');
    expect(vm.runInContext(
      '(function(){ var x = computeExoSparklineData("Squat (Barre)"); return x === computeExoSparklineData("Squat (Barre)"); })()', ctx)).toBe(true);
    // nouvelle séance → cache invalidé → 3 points
    vm.runInContext('db.logs.unshift({ timestamp: 1001, exercises: [{ name: "Squat (Barre)", series: [{ weight: 102.5, reps: 5 }] }] })', ctx);
    expect(call(ctx, 'Squat (Barre)')).toHaveLength(3);
  });
});
