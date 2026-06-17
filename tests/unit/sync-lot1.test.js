// SYNC-LOT1 « bleed-stop ». Teste les fonctions vm-extraites de la VRAIE source :
// - _computeDataHash (P4) doit basculer quand un log est édité (editedAt).
// - _migrateLogEditedAt (P1) backfill rétrocompat editedAt = timestamp.
// - compressOldLogs ne doit PAS toucher editedAt (compression lossy ≠ édition).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('Could not extract ' + name);
  return m[0];
}

// ── _computeDataHash (P4) ──
const hctx = { JSON: JSON, Object: Object };
vm.createContext(hctx);
vm.runInContext(extractFn(SUPA, '_computeDataHash'), hctx);
const hash = (d) => { hctx.__d = d; return vm.runInContext('_computeDataHash(__d)', hctx); };

function baseDb(over) {
  return Object.assign({
    logs: [{ id: 'a', timestamp: 2000, editedAt: 2000 }, { id: 'b', timestamp: 1000, editedAt: 1000 }],
    exercises: {}, xpHighWaterMark: 0, earnedBadges: {}, activityLogs: [], readiness: [],
    readinessHistory: [{ ts: 100 }], user: {}, weeklyPlan: {}, bestPR: {}, lastModified: 0,
  }, over || {});
}

// ── _migrateLogEditedAt (P1) ──
const mctx = {};
vm.createContext(mctx);
vm.runInContext(extractFn(APP, '_migrateLogEditedAt'), mctx);
const migrate = (logs) => { mctx.__l = logs; return vm.runInContext('_migrateLogEditedAt(__l)', mctx); };

// ── compressOldLogs (invariant : ne bumpe pas editedAt) ──
const cctx = { Date: Date, saveDBNow: function () {}, db: null };
vm.createContext(cctx);
vm.runInContext(extractFn(SUPA, 'compressOldLogs'), cctx);
const compress = (db) => { cctx.db = db; return vm.runInContext('compressOldLogs()', cctx); };

describe('SYNC-LOT1 P4 — _computeDataHash sensible aux éditions', () => {
  test('extraction : la vraie fonction signe désormais editedAt', () => {
    expect(extractFn(SUPA, '_computeDataHash')).toMatch(/editedAt|maxLogEdited/i);
  });

  test('hash_sensible_a_edition : éditer un log NON-récent (logs[1]) change le hash', () => {
    const a = baseDb();
    // même longueur, même logs[0].timestamp — seul editedAt du log ancien bouge
    const b = baseDb({ logs: [{ id: 'a', timestamp: 2000, editedAt: 2000 }, { id: 'b', timestamp: 1000, editedAt: 5000 }] });
    expect(hash(a)).not.toBe(hash(b));
  });

  test('éditer le log le plus récent (logs[0]) change aussi le hash', () => {
    const a = baseDb();
    const b = baseDb({ logs: [{ id: 'a', timestamp: 2000, editedAt: 6000 }, { id: 'b', timestamp: 1000, editedAt: 1000 }] });
    expect(hash(a)).not.toBe(hash(b));
  });

  test('idempotence : deux db identiques → même hash', () => {
    expect(hash(baseDb())).toBe(hash(baseDb()));
  });

  test('régression : reste sensible à logs.length', () => {
    const more = baseDb({ logs: baseDb().logs.concat([{ id: 'c', timestamp: 3000, editedAt: 3000 }]) });
    expect(hash(baseDb())).not.toBe(hash(more));
  });

  test('robustesse : log sans editedAt → fallback timestamp, pas de crash', () => {
    expect(() => hash(baseDb({ logs: [{ id: 'a', timestamp: 2000 }] }))).not.toThrow();
  });
});

describe('SYNC-LOT1 P1 — _migrateLogEditedAt (rétrocompat)', () => {
  test('log sans editedAt → reçoit son timestamp ; renvoie le compte', () => {
    const logs = [{ id: 'x', timestamp: 1234 }];
    const n = migrate(logs);
    expect(logs[0].editedAt).toBe(1234);
    expect(n).toBe(1);
  });

  test('log avec editedAt → inchangé (n=0)', () => {
    const logs = [{ id: 'y', timestamp: 1, editedAt: 999 }];
    const n = migrate(logs);
    expect(logs[0].editedAt).toBe(999);
    expect(n).toBe(0);
  });

  test('editedAt null traité comme absent → reçoit timestamp', () => {
    const logs = [{ id: 'z', timestamp: 42, editedAt: null }];
    migrate(logs);
    expect(logs[0].editedAt).toBe(42);
  });

  test('tableau vide / absent → 0, pas de crash', () => {
    expect(migrate([])).toBe(0);
    expect(migrate(undefined)).toBe(0);
  });
});

describe('SYNC-LOT1 — compression_ne_touche_pas_editedAt', () => {
  test('compressOldLogs compresse les vieux logs mais préserve editedAt', () => {
    const oldTs = Date.now() - 200 * 86400000; // > 6 mois
    const oldLog = {
      id: 'old', timestamp: oldTs, editedAt: oldTs,
      exercises: [{ name: 'Squat', allSets: [
        { weight: 100, reps: 5, setType: 'normal' },
        { weight: 100, reps: 5, setType: 'normal' },
        { weight: 90, reps: 8, setType: 'normal' },
      ] }],
    };
    compress({ logs: [oldLog] });
    expect(oldLog._compressed).toBe(true);                 // bien compressé
    expect(oldLog.exercises[0].allSets.length).toBe(1);    // sets réduits
    expect(oldLog.editedAt).toBe(oldTs);                   // horloge INCHANGÉE
  });

  test('un log récent n\'est pas compressé et garde editedAt', () => {
    const recent = { id: 'r', timestamp: Date.now(), editedAt: Date.now(),
      exercises: [{ name: 'Bench', allSets: [{ weight: 80, reps: 5, setType: 'normal' }, { weight: 80, reps: 5, setType: 'normal' }] }] };
    const before = recent.editedAt;
    compress({ logs: [recent] });
    expect(recent._compressed).toBeUndefined();
    expect(recent.editedAt).toBe(before);
  });
});
