// P3-c — logs hors blob + réhydratation depuis workout_sessions.
// Fonctions PURES vm-extraites de la vraie source js/supabase.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('Could not extract ' + name);
  return m[0];
}

const ctx = { JSON: JSON, Object: Object };
vm.createContext(ctx);
vm.runInContext(extractFn(SUPA, '_buildSyncedBlob'), ctx);
vm.runInContext(extractFn(SUPA, '_logsFromSessionRows'), ctx);
vm.runInContext(extractFn(SUPA, '_shouldHydrateLogs'), ctx);
vm.runInContext(extractFn(SUPA, '_computeDataHash'), ctx);

const buildBlob = (d, wp) => { ctx.__d = d; ctx.__wp = wp; return vm.runInContext('_buildSyncedBlob(__d, __wp)', ctx); };
const fromRows = (rows) => { ctx.__r = rows; return vm.runInContext('_logsFromSessionRows(__r)', ctx); };
const shouldHydrate = (logs) => { ctx.__l = logs; return vm.runInContext('_shouldHydrateLogs(__l)', ctx); };
const hash = (d) => { ctx.__h = d; return vm.runInContext('_computeDataHash(__h)', ctx); };

function sampleDb(over) {
  return Object.assign({
    logs: [{ id: 'a', timestamp: 2000, editedAt: 2000 }, { id: 'b', timestamp: 1000, editedAt: 1000 }],
    user: { name: 'Test' }, exercises: { Squat: { e1rm: 150 } }, bestPR: { squat: 148 },
    gamification: { xp: 10 }, weeklyPlan: { days: [] }, xpHighWaterMark: 0, earnedBadges: {},
    activityLogs: [], readiness: [], readinessHistory: [{ ts: 1 }], lastModified: 0,
  }, over || {});
}

describe('P3-c — _buildSyncedBlob : payload sans logs', () => {
  test('payload_sans_logs : le blob synchronisé ne contient pas la clé logs', () => {
    const out = buildBlob(sampleDb(), { days: [] });
    expect('logs' in out).toBe(false);
  });

  test('le reste de db est préservé (user, exercises, bestPR) et gamification/weeklyPlan posés', () => {
    const wp = { days: [{ id: 'd1' }] };
    const out = buildBlob(sampleDb(), wp);
    expect(out.user).toEqual({ name: 'Test' });
    expect(out.exercises).toEqual({ Squat: { e1rm: 150 } });
    expect(out.bestPR).toEqual({ squat: 148 });
    expect(out.weeklyPlan).toBe(wp);
    expect(out.gamification).toEqual({ xp: 10 });
  });

  test('NE mute PAS le db source (db.logs reste intact)', () => {
    const d = sampleDb();
    buildBlob(d, d.weeklyPlan);
    expect(Array.isArray(d.logs)).toBe(true);
    expect(d.logs.length).toBe(2);
  });

  test('gamification par défaut si absent', () => {
    const out = buildBlob(sampleDb({ gamification: undefined }), {});
    expect(out.gamification).toEqual({});
  });
});

describe('P3-c — _computeDataHash reste sensible aux éditions (logs hors blob)', () => {
  // Le hash opère sur db (pas sur le payload) → une édition change toujours le hash,
  // ce qui déclenche le push + le dual-write, même si le blob n'embarque plus logs.
  test('éditer un log (editedAt) change toujours le hash', () => {
    const a = sampleDb();
    const b = sampleDb({ logs: [{ id: 'a', timestamp: 2000, editedAt: 2000 }, { id: 'b', timestamp: 1000, editedAt: 9000 }] });
    expect(hash(a)).not.toBe(hash(b));
  });
});

describe('P3-c — _logsFromSessionRows : reconstruction db.logs', () => {
  test('mappe data + trie par timestamp desc', () => {
    const rows = [
      { data: { id: 'old', timestamp: 1000 } },
      { data: { id: 'new', timestamp: 3000 } },
      { data: { id: 'mid', timestamp: 2000 } },
    ];
    const logs = fromRows(rows);
    expect(logs.map((l) => l.id)).toEqual(['new', 'mid', 'old']);
  });

  test('ignore les lignes sans data ; tableau vide/undefined → []', () => {
    expect(fromRows([{ data: { id: 'x', timestamp: 1 } }, {}, { data: null }]).map((l) => l.id)).toEqual(['x']);
    expect(fromRows([])).toEqual([]);
    expect(fromRows(undefined)).toEqual([]);
  });

  test('complétude : toutes les lignes valides sont reconstruites', () => {
    const rows = [];
    for (let i = 0; i < 532; i++) rows.push({ data: { id: 's' + i, timestamp: i } });
    expect(fromRows(rows).length).toBe(532);
  });
});

describe('P3-c — _shouldHydrateLogs : garde anti-écrasement', () => {
  test('pas_hydratation_si_local_peuple : local non vide → false', () => {
    expect(shouldHydrate([{ id: 'a' }])).toBe(false);
  });

  test('local vide / absent → true (nouvel appareil)', () => {
    expect(shouldHydrate([])).toBe(true);
    expect(shouldHydrate(undefined)).toBe(true);
    expect(shouldHydrate(null)).toBe(true);
  });
});
