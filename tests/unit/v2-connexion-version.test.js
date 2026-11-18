//
// 16/11/2026 — la connexion face à une ancienne version : la phrase d'un refus de captcha (jamais le texte brut anglais)
// et le rechargement automatique SUR L'ÉCRAN D'ENTRÉE seulement (`Auth.rechargerSurEntree`, câblé par `rechargerSiEntree`).
const fs = require('fs');
const path = require('path');
const V2 = path.join(__dirname, '../../v2');

let Auth;
beforeAll(() => {
  global.THConfig = { TURNSTILE_SITE_KEY: '' };
  global.THClient = { CLE_AUTH: 'th-v2-auth', obtenir: () => ({ auth: {} }) };
  require('../../v2/js/auth.js');
  Auth = global.THAuth;
});

const base = { entreeVisible: true, connecte: false, saisie: false, focus: false, maintenant: 1000000, dernier: 0 };

describe('phrase du refus de captcha', () => {
  test('captcha_failed sans jeton : phrase claire, pas le texte brut', () => {
    const e = { status: 400, code: 'captcha_failed', message: 'captcha protection: request disallowed (no captcha_token found)' };
    const p = Auth.captcha.phrase(e);
    expect(p).toBe('La vérification anti-robot a échoué. Recharge l\'app, puis réessaie.');
    expect(p).not.toMatch(/captcha_token|disallowed/);
  });
  test('app.js : texteErreur passe par la même source et le bouton Recharger recharge', () => {
    const src = fs.readFileSync(path.join(V2, 'js/app.js'), 'utf8');
    expect(src).toMatch(/function texteErreur[\s\S]{0,300}Auth\.captcha\.phrase\(e\);[^\n]*\n\s*if \(captcha\) return captcha;/);
    expect(src).toMatch(/this\.dataset\.recharger\) \{ racine\.location\.reload\(\)/);
  });
});

describe('rechargement automatique sur l\'entrée', () => {
  test('entrée visible, déconnecté, rien saisi : recharge', () => {
    expect(Auth.rechargerSurEntree(base)).toBe(true);
  });
  test('connecté : jamais', () => {
    expect(Auth.rechargerSurEntree({ ...base, connecte: true })).toBe(false);
  });
  test('hors écran d\'entrée : jamais', () => {
    expect(Auth.rechargerSurEntree({ ...base, entreeVisible: false })).toBe(false);
  });
  test('saisie en cours ou focus : jamais', () => {
    expect(Auth.rechargerSurEntree({ ...base, saisie: true })).toBe(false);
    expect(Auth.rechargerSurEntree({ ...base, focus: true })).toBe(false);
  });
  test('garde anti-boucle : pas deux fois en 60 s, de nouveau possible après', () => {
    expect(Auth.rechargerSurEntree({ ...base, dernier: base.maintenant - 59000 })).toBe(false);
    expect(Auth.rechargerSurEntree({ ...base, dernier: base.maintenant - 60000 })).toBe(true);
  });
  test('app.js : le contrôleur appelle la garde et note l\'horodatage avant de recharger', () => {
    const src = fs.readFileSync(path.join(V2, 'js/app.js'), 'utf8');
    expect(src).toMatch(/montrerBandeauMaj\(\);\s*rechargerSiEntree\(\);/);
    expect(src).toMatch(/setItem\(CLE_MAJ_AUTO[\s\S]{0,200}location\.reload\(\)/);
  });
  test('app.js : sans stockage de session, aucun rechargement (la garde d\'une minute ne peut pas être posée)', () => {
    const src = fs.readFileSync(path.join(V2, 'js/app.js'), 'utf8');
    const m = src.match(/function rechargerSiEntree\(\) \{[\s\S]*?\n  \}\n/);
    expect(m).not.toBeNull();
    const lancer = (st) => {
      let rechargements = 0;
      const el = (v) => ({ hidden: false, value: v || '' });
      const f = new Function('$', 'stockageSur', 'doc', 'sessionActive', 'Auth', 'racine', 'CLE_MAJ_AUTO',
        m[0] + '; return rechargerSiEntree;')(
        () => el(''), () => st, { activeElement: null }, false,
        { rechargerSurEntree: () => true }, { location: { reload: () => { rechargements++; } } }, 'th-v2-maj-auto');
      f();
      return rechargements;
    };
    expect(lancer(null)).toBe(0);
    expect(lancer({ getItem: () => null, setItem: () => { throw new Error('plein'); } })).toBe(0);
    expect(lancer({ getItem: () => null, setItem: () => {} })).toBe(1);
  });
});
