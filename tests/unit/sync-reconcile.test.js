// SYNC-X — fusion cross-device des logs. Fonctions PURES vm-extraites de la vraie
// source js/supabase.js : _reconcileLogs (union par id + tie-break editedAt) + _logEditClock.
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

const ctx = { Object: Object };
vm.createContext(ctx);
vm.runInContext(extractFn(SUPA, '_logEditClock'), ctx);
vm.runInContext(extractFn(SUPA, '_reconcileLogs'), ctx);

const merge = (local, remote) => { ctx.__l = local; ctx.__r = remote; return vm.runInContext('_reconcileLogs(__l, __r)', ctx); };
const ids = (arr) => arr.map((l) => l.id).sort();
const byId = (arr, id) => arr.find((l) => l.id === id);

describe('SYNC-X — _reconcileLogs (additif, non destructif)', () => {
  test('séance distante absente en local → AJOUTÉE', () => {
    const out = merge([], [{ id: 'r1', timestamp: 100, editedAt: 100 }]);
    expect(ids(out)).toEqual(['r1']);
  });

  test('séance locale absente du distant → CONSERVÉE (additif)', () => {
    const out = merge([{ id: 'l1', timestamp: 100, editedAt: 100 }], []);
    expect(ids(out)).toEqual(['l1']);
  });

  test('même id, editedAt distant plus récent → version DISTANTE gardée', () => {
    const out = merge(
      [{ id: 's', timestamp: 50, editedAt: 50, title: 'old' }],
      [{ id: 's', timestamp: 50, editedAt: 99, title: 'new' }]
    );
    expect(byId(out, 's').title).toBe('new');
  });

  test('même id, editedAt local plus récent → version LOCALE gardée (édition non écrasée)', () => {
    const out = merge(
      [{ id: 's', timestamp: 50, editedAt: 99, title: 'localnew' }],
      [{ id: 's', timestamp: 50, editedAt: 60, title: 'remoteold' }]
    );
    expect(byId(out, 's').title).toBe('localnew');
  });

  test('cas combiné : a local seul, b édité côté distant, c distant seul → union sans doublon', () => {
    const local = [{ id: 'a', timestamp: 10, editedAt: 10 }, { id: 'b', timestamp: 20, editedAt: 20, title: 'bLocal' }];
    const remote = [{ id: 'b', timestamp: 20, editedAt: 99, title: 'bRemote' }, { id: 'c', timestamp: 30, editedAt: 30 }];
    const out = merge(local, remote);
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    expect(byId(out, 'b').title).toBe('bRemote');       // édité plus récemment côté distant
    expect(out.map((l) => l.id)).toEqual(['c', 'b', 'a']); // trié timestamp desc
  });

  test('idempotence : 2 passes → état identique, 0 doublon', () => {
    const local = [{ id: 'a', timestamp: 10, editedAt: 10 }];
    const remote = [{ id: 'b', timestamp: 20, editedAt: 99, title: 'bR' }, { id: 'a', timestamp: 10, editedAt: 10 }];
    const once = merge(local, remote);
    const twice = merge(once, remote);
    expect(ids(twice)).toEqual(ids(once));
    expect(twice.length).toBe(once.length);
    expect(byId(twice, 'b').title).toBe('bR');
  });

  test('fallback : editedAt absent des deux côtés → départage par timestamp, pas d\'exception', () => {
    const out = merge(
      [{ id: 's', timestamp: 80, title: 'localPlusRecent' }],
      [{ id: 's', timestamp: 50, title: 'remoteAncien' }]
    );
    expect(byId(out, 's').title).toBe('localPlusRecent');
  });

  test('logs sans id conservés ; entrées nulles ignorées', () => {
    const out = merge([{ timestamp: 5 }, null], [{ timestamp: 7 }]);
    expect(out.length).toBe(2);
  });
});

describe('SYNC-X — _logEditClock', () => {
  test('editedAt prioritaire, sinon timestamp, sinon 0', () => {
    expect(vmClock({ editedAt: 9, timestamp: 1 })).toBe(9);
    expect(vmClock({ timestamp: 7 })).toBe(7);
    expect(vmClock(null)).toBe(0);
    expect(vmClock({})).toBe(0);
  });
});

function vmClock(log) { ctx.__c = log; return vm.runInContext('_logEditClock(__c)', ctx); }
