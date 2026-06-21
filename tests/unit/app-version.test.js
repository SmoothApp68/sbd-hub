// UI — affichage de la version de l'app. Fonctions PURES vm-extraites de js/app.js :
// _appVersionLabel (CACHE_NAME → 'vXXX') et _swUpdateState (registration → MAJ dispo ?).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('Could not extract ' + name);
  return m[0];
}

const ctx = { String: String };
vm.createContext(ctx);
vm.runInContext(extractFn(APP, '_appVersionLabel'), ctx);
vm.runInContext(extractFn(APP, '_swUpdateState'), ctx);

const label = (c) => { ctx.__c = c; return vm.runInContext('_appVersionLabel(__c)', ctx); };
const state = (r) => { ctx.__r = r; return vm.runInContext('_swUpdateState(__r)', ctx); };

describe('UI version — _appVersionLabel', () => {
  test("'trainhub-v291' → 'v291' ; 'trainhub-v292' → 'v292'", () => {
    expect(label('trainhub-v291')).toBe('v291');
    expect(label('trainhub-v292')).toBe('v292');
  });
  test('tolère un suffixe (ex v292b) et chiffres multiples', () => {
    expect(label('trainhub-v300')).toBe('v300');
    expect(label('trainhub-v42b')).toBe('v42b');
  });
  test('vide / null / sans version → chaîne vide (pas de crash)', () => {
    expect(label('')).toBe('');
    expect(label(null)).toBe('');
    expect(label(undefined)).toBe('');
    expect(label('trainhub')).toBe('');
  });
});

describe('UI version — _swUpdateState', () => {
  test('registration avec waiting → available true', () => {
    expect(state({ waiting: {} }).available).toBe(true);
  });
  test('registration sans waiting → available false', () => {
    expect(state({ waiting: null }).available).toBe(false);
    expect(state({}).available).toBe(false);
  });
  test('registration null/undefined → available false (pas de crash)', () => {
    expect(state(null).available).toBe(false);
    expect(state(undefined).available).toBe(false);
  });
});
