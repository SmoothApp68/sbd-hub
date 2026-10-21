// RGPD Art.17 — la suppression de compte doit purger TOUTES les clés du profil, sinon la
// migration au boot (loadDB) ressuscite le profil « supprimé » depuis une clé de fallback.
// Fonctions/constantes extraites de la VRAIE source (engine.js / app.js) via vm — pas de copie.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractConst(src, name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*\\[[^\\]]*\\];'));
  if (!m) throw new Error('Could not extract const ' + name);
  return m[0];
}
function extractFn(src, name) {
  const m = src.match(new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}

function makeLS() {
  const store = {};
  return {
    _store: store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function buildCtx(ls) {
  const ctx = { JSON: JSON, localStorage: ls };
  vm.createContext(ctx);
  vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", ctx); // référencé par SBD_HUB_ALL_KEYS
  vm.runInContext(extractConst(ENGINE, 'SBD_HUB_ALL_KEYS'), ctx);
  vm.runInContext(extractFn(APP, 'purgeAllLocalDb'), ctx);
  return ctx;
}

const PROFILE = JSON.stringify({ user: { name: 'Aurel' }, logs: [{ id: 1 }] });

describe('RGPD Art.17 — la suppression purge toutes les clés du profil', () => {
  test('SBD_HUB_ALL_KEYS couvre la clé courante ET les 4 fallbacks', () => {
    const ctx = buildCtx(makeLS());
    const keys = vm.runInContext('SBD_HUB_ALL_KEYS', ctx);
    ['SBD_HUB_V29', 'SBD_HUB_V28', 'SBD_HUB_V27', 'SBD_HUB_V26', 'SBD_HUB'].forEach((k) => {
      expect(keys).toContain(k);
    });
  });

  test('purgeAllLocalDb efface la clé courante ET tous les fallbacks, sans toucher le reste', () => {
    const ls = makeLS();
    ['SBD_HUB_V29', 'SBD_HUB', 'SBD_HUB_V28', 'SBD_HUB_V27', 'SBD_HUB_V26'].forEach((k) => ls.setItem(k, PROFILE));
    ls.setItem('autre_cle', 'garde-moi');
    const ctx = buildCtx(ls);
    vm.runInContext('purgeAllLocalDb()', ctx);
    const survivants = Object.keys(ls._store).filter((k) => k.indexOf('SBD_HUB') === 0);
    expect(survivants).toEqual([]);
    expect(ls.getItem('autre_cle')).toBe('garde-moi');
  });

  test('après purge, la migration loadDB ne peut plus ressusciter le profil', () => {
    const ls = makeLS();
    ls.setItem('SBD_HUB', PROFILE); // vecteur écrit par le hot-path XP ; V29 déjà supprimé
    const ctx = buildCtx(ls);
    // reproduit la vraie boucle de loadDB : chercher un fallback contenant {logs, user}
    const fallbackFinds = () => {
      const fbKeys = vm.runInContext('SBD_HUB_ALL_KEYS.slice(1)', ctx); // = FALLBACK_KEYS de loadDB
      for (const k of fbKeys) {
        const old = ls.getItem(k);
        if (old) { const p = JSON.parse(old); if (p.logs && p.user) return k; }
      }
      return null;
    };
    expect(fallbackFinds()).toBe('SBD_HUB'); // AVANT purge : résurrection possible (le bug)
    vm.runInContext('purgeAllLocalDb()', ctx);
    expect(fallbackFinds()).toBeNull();        // APRÈS purge : résurrection impossible (le fix)
  });
});
