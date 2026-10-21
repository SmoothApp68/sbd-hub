// Fix dual-write workout_sessions (Phase 3) — pushWorkoutSessionsNow.
// Teste la LOGIQUE de déclenchement t=0 (vm-extraite de la VRAIE source js/supabase.js) :
//  - garde (pas de client / sync off / pas de logs) → aucun appel réseau ;
//  - chemin nominal → syncLogsToSupabase(uid) appelé avec l'uid résolu (cache), pas de
//    getUser concurrent ; succès → _wsPendingFlush retombe à false ;
//  - uid indisponible → _wsPendingFlush reste vrai (sera retenté sur pagehide), aucun appel ;
//  - échec de sync → _wsPendingFlush reste vrai (filet de fermeture rejouera).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');

function extractAsync(src, name) {
  const re = new RegExp('^async function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('Could not extract ' + name);
  return m[0];
}
const SRC = extractAsync(SUPA, 'pushWorkoutSessionsNow');

// Construit un contexte vm avec tous les globals référencés par la fonction, stubés.
function run(over) {
  over = over || {};
  const calls = [];
  const ctx = {
    console: { warn: function() {} },
    Promise: Promise,
    supaClient: {},
    cloudSyncEnabled: true,
    db: { logs: [{ id: 's1' }] },
    _wsPendingFlush: false,
    __ok: true,
    getMyUserIdAsync: function() { return Promise.resolve('uid-xyz'); },
    syncLogsToSupabase: function(uid) { calls.push(uid); return Promise.resolve(ctx.__ok !== false); },
  };
  Object.keys(over).forEach(function(k) { ctx[k] = over[k]; });
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx: ctx, calls: calls };
}

describe('Phase 3 — pushWorkoutSessionsNow (déclenchement t=0)', () => {
  test('extraction : la vraie fonction est présente et ne pousse QUE workout_sessions', () => {
    expect(SRC).toMatch(/syncLogsToSupabase\(uid\)/);
    expect(SRC).not.toMatch(/syncToCloud\(/);     // jamais le blob (anti-lock gotrue)
    expect(SRC).toMatch(/getMyUserIdAsync\(\)/);  // uid via le cache, pas getUser direct
  });

  test('chemin nominal : appelle syncLogsToSupabase avec l\'uid résolu ; succès → flush levé', async () => {
    const r = run();
    await r.ctx.pushWorkoutSessionsNow();
    expect(r.calls).toEqual(['uid-xyz']);
    expect(r.ctx._wsPendingFlush).toBe(false);
  });

  test('garde : cloudSyncEnabled faux → aucun appel', async () => {
    const r = run({ cloudSyncEnabled: false });
    await r.ctx.pushWorkoutSessionsNow();
    expect(r.calls).toEqual([]);
    expect(r.ctx._wsPendingFlush).toBe(false);
  });

  test('garde : pas de supaClient → aucun appel', async () => {
    const r = run({ supaClient: null });
    await r.ctx.pushWorkoutSessionsNow();
    expect(r.calls).toEqual([]);
  });

  test('garde : aucun log local → aucun appel', async () => {
    const r = run({ db: { logs: [] } });
    await r.ctx.pushWorkoutSessionsNow();
    expect(r.calls).toEqual([]);
  });

  test('uid indisponible : aucun appel, _wsPendingFlush reste vrai (retenté plus tard)', async () => {
    const r = run({ getMyUserIdAsync: function() { return Promise.resolve(null); } });
    await r.ctx.pushWorkoutSessionsNow();
    expect(r.calls).toEqual([]);
    expect(r.ctx._wsPendingFlush).toBe(true);
  });

  test('échec de sync : _wsPendingFlush reste vrai (filet pagehide rejouera)', async () => {
    const r = run({ __ok: false });
    await r.ctx.pushWorkoutSessionsNow();
    expect(r.calls).toEqual(['uid-xyz']);
    expect(r.ctx._wsPendingFlush).toBe(true);
  });
});
