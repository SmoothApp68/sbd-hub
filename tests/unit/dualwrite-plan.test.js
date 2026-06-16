// P3-b — Dual-write FIABLE vers workout_sessions.
// Teste la LOGIQUE DE DIFF pure (sans réseau) : computeWorkoutSessionsSyncPlan +
// _wsLogHash, vm-extraites depuis la VRAIE source js/supabase.js (servie en prod).
// Vérifie : nouveau → upsert ; édité → upsert ; inchangé → rien ; adopté (1er run
// post-backfill) → rien ; supprimé localement → delete ; garde-fous anti-wipe.
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
vm.runInContext(extractFn(SUPA, '_wsLogHash'), ctx);
vm.runInContext(extractFn(SUPA, 'computeWorkoutSessionsSyncPlan'), ctx);

const wsLogHash = (log) => { ctx.__log = log; return vm.runInContext('_wsLogHash(__log)', ctx); };
const plan = (logs, cloudIds, hashes, opts) => {
  ctx.__a = logs; ctx.__b = cloudIds; ctx.__c = hashes; ctx.__d = opts;
  return vm.runInContext('computeWorkoutSessionsSyncPlan(__a, __b, __c, __d)', ctx);
};

function mkLog(id, over) {
  return Object.assign({ id: id, title: 'Séance ' + id, timestamp: 1000, volume: 5000,
    duration: 3600, shortDate: '01/01', exercises: [{ name: 'Squat' }] }, over || {});
}
const ids = (rows) => rows.map((r) => (r && (r.session_id || r.id)) || r);
const SYNCED = { synced: true };

describe('P3-b — _wsLogHash (signature de contenu)', () => {
  test('extraction : la vraie fonction est présente dans la source', () => {
    expect(extractFn(SUPA, '_wsLogHash')).toMatch(/djb2/);
    expect(extractFn(SUPA, 'computeWorkoutSessionsSyncPlan')).toMatch(/anti-wipe|garde-fou|deleteAborted/);
  });
  test('déterministe : même log → même hash', () => {
    const l = mkLog('a');
    expect(wsLogHash(l)).toBe(wsLogHash(mkLog('a')));
  });
  test('sensible au contenu : un volume différent → hash différent', () => {
    expect(wsLogHash(mkLog('a'))).not.toBe(wsLogHash(mkLog('a', { volume: 9999 })));
  });
  test('null/undefined → "0" sans crash', () => {
    expect(wsLogHash(null)).toBe('0');
    expect(() => wsLogHash(undefined)).not.toThrow();
  });
});

describe('P3-b — computeWorkoutSessionsSyncPlan : upserts', () => {
  test('nouveau log (absent du cloud) → dans toUpsert, rien à supprimer', () => {
    const p = plan([mkLog('new1')], [], {}, SYNCED);
    expect(ids(p.toUpsert)).toEqual(['new1']);
    expect(p.toDelete).toEqual([]);
  });

  test('log modifié (id en cloud, hash connu différent) → dans toUpsert', () => {
    const before = mkLog('e1');
    const after = mkLog('e1', { volume: 12345 });           // contenu changé
    const hashes = { e1: wsLogHash(before) };               // dernier hash poussé
    const p = plan([after], ['e1'], hashes, SYNCED);
    expect(ids(p.toUpsert)).toEqual(['e1']);
    expect(p.toDelete).toEqual([]);
  });

  test('log inchangé (id en cloud, hash connu identique) → ni upsert ni delete', () => {
    const l = mkLog('u1');
    const hashes = { u1: wsLogHash(l) };
    const p = plan([l], ['u1'], hashes, SYNCED);
    expect(p.toUpsert).toEqual([]);
    expect(p.toDelete).toEqual([]);
  });

  test('1er run post-backfill (id en cloud mais hash inconnu localement) → adopté '
    + 'SANS réécriture, et tracé dans nextHashes', () => {
    const l = mkLog('old1');
    const p = plan([l], ['old1'], {}, SYNCED);              // hashes vide
    expect(p.toUpsert).toEqual([]);                         // pas de réécriture massive
    expect(p.nextHashes.old1).toBe(wsLogHash(l));           // hash adopté pour la suite
  });

  test('nextHashes couvre tous les logs locaux', () => {
    const p = plan([mkLog('a'), mkLog('b')], ['a'], { a: 'stale' }, SYNCED);
    expect(Object.keys(p.nextHashes).sort()).toEqual(['a', 'b']);
  });
});

describe('P3-b — computeWorkoutSessionsSyncPlan : suppressions', () => {
  test('log supprimé localement (id en cloud, absent du local) → dans toDelete', () => {
    const keep = mkLog('k1');
    const hashes = { k1: wsLogHash(keep) };
    const p = plan([keep], ['k1', 'gone1'], hashes, SYNCED);
    expect(p.toDelete).toEqual(['gone1']);
    expect(p.toUpsert).toEqual([]);
  });

  test('combiné : un nouveau, un édité, un inchangé, un supprimé', () => {
    const unchanged = mkLog('u');
    const edited = mkLog('e', { volume: 1 });
    const hashes = { u: wsLogHash(unchanged), e: wsLogHash(mkLog('e')) /* ancien */ };
    const local = [mkLog('n'), edited, unchanged];          // 'n' nouveau, pas 'd'
    const cloud = ['e', 'u', 'd'];                          // 'd' supprimé localement
    const p = plan(local, cloud, hashes, SYNCED);
    expect(ids(p.toUpsert).sort()).toEqual(['e', 'n']);
    expect(p.toDelete).toEqual(['d']);
  });
});

describe('P3-b — garde-fou anti-wipe', () => {
  test('pas_de_wipe_si_local_non_hydrate : _workoutSessionsSynced faux → '
    + 'toDelete VIDE même si des id cloud manquent en local', () => {
    const l = mkLog('k1');
    const p = plan([l], ['k1', 'x', 'y'], { k1: wsLogHash(l) }, { synced: false });
    expect(p.toDelete).toEqual([]);
    expect(p.deleteAborted).toBe(true);
    expect(p.deleteAbortReason).toBe('not_hydrated');
  });

  test('pas_de_wipe_si_local_vide : db.logs vide → toDelete VIDE', () => {
    const p = plan([], ['x', 'y', 'z'], {}, SYNCED);
    expect(p.toDelete).toEqual([]);
    expect(p.deleteAborted).toBe(true);
    expect(p.deleteAbortReason).toBe('not_hydrated');
  });

  test('seuil : > 20 % des lignes cloud à supprimer (et > 5) → abstention + raison', () => {
    // cloud = 10 lignes, local n'en garde que 2 → 8 suppressions (80 % > 20 %, > 5)
    const local = [mkLog('a'), mkLog('b')];
    const cloud = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const hashes = { a: wsLogHash(local[0]), b: wsLogHash(local[1]) };
    const p = plan(local, cloud, hashes, SYNCED);
    expect(p.toDelete).toEqual([]);
    expect(p.deleteAborted).toBe(true);
    expect(p.deleteAbortReason).toBe('threshold_exceeded');
    expect(p.deleteCandidateCount).toBe(8);                 // compte réel conservé pour le log
  });

  test('suppression normale (1 ligne sur 10, sous le seuil) → autorisée', () => {
    const local = [];
    const cloud = [];
    for (let i = 0; i < 9; i++) { local.push(mkLog('s' + i)); cloud.push('s' + i); }
    cloud.push('sgone');
    const hashes = {};
    local.forEach((l) => { hashes[l.id] = wsLogHash(l); });
    const p = plan(local, cloud, hashes, SYNCED);
    expect(p.toDelete).toEqual(['sgone']);
    expect(p.deleteAborted).toBe(false);
  });
});
