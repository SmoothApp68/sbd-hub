// READY-C2-hotfix-2 — _computeDataHash doit être sensible à readinessHistory.
// Bug prod : depuis C2-b un check-in écrit dans db.readinessHistory et plus dans
// db.readiness ; le hash de dédup de syncToCloud n'incluait que d.readiness.length
// → hash inchangé → la sync court-circuitait → check-in jamais poussé au cloud.
// Source vm-extraite depuis js/supabase.js (la VRAIE fonction servie en prod —
// index.html charge js/supabase.js, pas le .min orphelin).
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
vm.runInContext(extractFn(SUPA, '_computeDataHash'), ctx);
const hash = (d) => { ctx.__d = d; return vm.runInContext('_computeDataHash(__d)', ctx); };

function baseDb(over) {
  return Object.assign({
    logs: [{ timestamp: 1000 }], exercises: {}, xpHighWaterMark: 0,
    earnedBadges: {}, activityLogs: [], readiness: [],
    readinessHistory: [{ ts: 100, date: '2026-05-30', score: 70 }],
    user: {}, weeklyPlan: {}, bestPR: {}, lastModified: 0,
  }, over || {});
}

describe('READY-C2-hotfix-2 — _computeDataHash sensible au check-in', () => {
  test('extraction : la vraie fonction inclut désormais readinessHistory', () => {
    expect(extractFn(SUPA, '_computeDataHash')).toMatch(/readinessHistory/);
  });

  test('hash_sensible_au_checkin : une entrée readinessHistory en plus → hash différent', () => {
    const a = baseDb();
    const b = baseDb({ readinessHistory: [
      { ts: 100, date: '2026-05-30', score: 70 },
      { ts: 200, date: '2026-06-16', score: 85 },
    ] });
    expect(hash(a)).not.toBe(hash(b));
  });

  test('même longueur mais ts de la dernière entrée différent (check-in du même jour '
    + 'qui remplace) → hash différent', () => {
    const a = baseDb({ readinessHistory: [{ ts: 100, date: '2026-06-16', score: 60 }] });
    const b = baseDb({ readinessHistory: [{ ts: 999, date: '2026-06-16', score: 85 }] });
    expect(hash(a)).not.toBe(hash(b));
  });

  test('db sans readinessHistory → pas de crash, hash stable et déterministe', () => {
    const a = baseDb({ readinessHistory: undefined });
    const b = baseDb({ readinessHistory: undefined });
    expect(() => hash(a)).not.toThrow();
    expect(hash(a)).toBe(hash(b));
  });

  test('régression : reste sensible aux autres champs (logs) — fix non destructif', () => {
    expect(hash(baseDb())).not.toBe(hash(baseDb({ logs: [{ timestamp: 1000 }, { timestamp: 2000 }] })));
  });

  test('idempotence : deux db identiques → même hash', () => {
    expect(hash(baseDb())).toBe(hash(baseDb()));
  });
});
