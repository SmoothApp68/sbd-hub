// Stats Cardio — computeCardioStatsData (LECTURE SEULE, audit 63).
// vm-extraction de la vraie source : fusion db.logs (exos isCardio) +
// db.activityLogs, durées normalisées en secondes, catégorisation.
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

function extractVar(src, name) {
  const sm = src.match(new RegExp('^var ' + name + ' = ([\\{\\[])', 'm'));
  if (!sm) throw new Error('NOT FOUND var in source: ' + name);
  const closeRe = sm[1] === '{' ? /\n\};/ : /\n\];/;
  const rest = src.slice(sm.index);
  const em = rest.match(closeRe);
  return rest.slice(0, em.index + 3);
}

// _ACTIVITY_CARDIO_CAT est un one-liner var — extraction dédiée
function extractLine(src, name) {
  const m = src.match(new RegExp('^var ' + name + ' = .*;$', 'm'));
  if (!m) throw new Error('NOT FOUND line: ' + name);
  return m[0];
}

function makeCtx(logs, activityLogs) {
  const ctx = vm.createContext({ console, db: { logs: logs || [], activityLogs: activityLogs || [] } });
  vm.runInContext(extractLine(APP, '_ACTIVITY_CARDIO_CAT'), ctx);
  vm.runInContext(extractVar(APP, 'ACTIVITY_SESSION_LABELS'), ctx);
  ['_cardioCat', '_cardioDurationSec', 'computeCardioStatsData']
    .forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
  return ctx;
}

const run = ctx => vm.runInContext('computeCardioStatsData()', ctx);

describe('computeCardioStatsData — fusion et normalisation', () => {
  test('exo cardio importé (maxTime en secondes) → durationSec tel quel + distance', () => {
    const logs = [{ timestamp: 1000, shortDate: '01/07', exercises: [
      { name: 'Course sur tapis', isCardio: true, maxTime: 1800, distance: 5.2, series: [] }
    ] }];
    const e = run(makeCtx(logs))[0];
    expect(e.durationSec).toBe(1800);
    expect(e.distance).toBe(5.2);
    expect(e.cat).toBe('run');
    expect(e.source).toBe('log');
  });

  test('forme GO (maxTime=0, durée en minutes dans series.reps) → minutes × 60', () => {
    const logs = [{ timestamp: 1000, shortDate: '01/07', exercises: [
      { name: 'Vélo Stationnaire', isCardio: true, maxTime: 0, distance: 0,
        series: [{ weight: 0, reps: 40 }] }
    ] }];
    const e = run(makeCtx(logs))[0];
    expect(e.durationSec).toBe(2400); // 40 min
    expect(e.cat).toBe('bike'); // P5 : accent « Vélo » désormais matché
  });

  test('sets pondérés (weight>0) jamais interprétés comme durée', () => {
    const logs = [{ timestamp: 1000, exercises: [
      { name: 'Course sur tapis', isCardio: true, maxTime: 0, series: [{ weight: 100, reps: 5 }] }
    ] }];
    expect(run(makeCtx(logs))[0].durationSec).toBe(0);
  });

  test('valeur > 600 dans series.reps → déjà des secondes (pas de re-multiplication)', () => {
    const logs = [{ timestamp: 1000, exercises: [
      { name: 'Rameur', isCardio: true, maxTime: 0, series: [{ weight: 0, reps: 1800 }] }
    ] }];
    expect(run(makeCtx(logs))[0].durationSec).toBe(1800);
  });

  test('activityLogs : minutes → secondes, TRIMP conservé, label/emoji, catégorie par type', () => {
    const acts = [{ date: '2026-07-01', type: 'natation', duration: 45, intensity: 3, trimp: 108, source: 'manual' }];
    const e = run(makeCtx([], acts))[0];
    expect(e.durationSec).toBe(2700);
    expect(e.trimp).toBe(108);
    expect(e.cat).toBe('swim');
    expect(e.name).toContain('Natation');
    expect(e.date).toBe('01/07');
    expect(e.source).toBe('activity');
  });

  test('catégories activités : trail→run, velo→bike, yoga→other', () => {
    const acts = ['trail', 'velo', 'yoga'].map((t, i) =>
      ({ date: '2026-07-0' + (i + 1), type: t, duration: 30, trimp: 50, source: 'manual' }));
    const cats = {};
    run(makeCtx([], acts)).forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + 1; });
    expect(cats).toEqual({ run: 1, bike: 1, other: 1 });
  });

  test('exos non-cardio ignorés ; fusion triée par ts décroissant', () => {
    const logs = [
      { timestamp: 500, shortDate: 'a', exercises: [
        { name: 'Squat (Barre)', isCardio: false, series: [{ weight: 100, reps: 5 }] },
        { name: 'Natation', isCardio: true, maxTime: 1200, series: [] }
      ] }
    ];
    const acts = [{ date: '2026-07-01', type: 'course', duration: 30, trimp: 60, source: 'manual' }];
    const entries = run(makeCtx(logs, acts));
    expect(entries).toHaveLength(2); // le squat est exclu
    expect(entries[0].source).toBe('activity'); // 2026 >> ts 500
    expect(entries[1].cat).toBe('swim');
  });

  test('ASSERTION CLÉ — lecture seule : db strictement identique avant/après', () => {
    const logs = [{ timestamp: 1000, shortDate: '01/07', exercises: [
      { name: 'Course', isCardio: true, maxTime: 1800, distance: 5, series: [{ weight: 0, reps: 30 }] }
    ] }];
    const acts = [{ date: '2026-07-01', type: 'natation', duration: 45, trimp: 108, source: 'manual' }];
    const ctx = makeCtx(logs, acts);
    const before = vm.runInContext('JSON.stringify(db)', ctx);
    run(ctx); run(ctx);
    expect(vm.runInContext('JSON.stringify(db)', ctx)).toBe(before);
  });
});
