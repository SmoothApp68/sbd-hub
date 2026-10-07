/** @jest-environment node */
//
// 59-4 — L'INSCRIPTION PASSE SON ADRESSE DE RETOUR.
//
// Si le projet exige la confirmation d'e-mail, le lien ramène à l'adresse que
// `signUp` reçoit en `emailRedirectTo` — sinon à l'« adresse du site » réglée
// sur le projet, qui peut viser une app qui n'existe plus. L'adresse vient de
// l'appelant (l'origine de la page, `app.js`), jamais d'une valeur en dur ici.

function charger() {
  jest.resetModules();
  const appels = [];
  global.THClient = { CLE_AUTH: 'th-v2-auth', obtenir: () => ({ auth: {
    signUp: async (o) => { appels.push(o); return { data: { user: { id: 'u' }, session: null }, error: null }; }
  } }) };
  require('../../v2/js/auth.js');
  return { Auth: global.THAuth, appels };
}

afterEach(() => { delete global.THClient; delete global.THAuth; });

describe('59-4 — l’inscription et son adresse de retour', () => {
  test('⚠️ `signUp` reçoit `emailRedirectTo` : l’adresse donnée par l’appelant', async () => {
    const { Auth, appels } = charger();
    const r = await Auth.inscrire('melodie@exemple.fr', 'motdepasse1', 'https://sbd-hub.pages.dev/');
    expect(appels).toEqual([{ email: 'melodie@exemple.fr', password: 'motdepasse1',
      options: { emailRedirectTo: 'https://sbd-hub.pages.dev/' } }]);
    expect(r).toEqual({ session: null, user: { id: 'u' } });
  });

  test('aucune adresse en dur dans auth.js : sans adresse donnée, aucune n’est inventée', async () => {
    const { Auth, appels } = charger();
    await Auth.inscrire('a@b.fr', 'motdepasse1');
    expect(appels[0].options).toBeUndefined();
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/auth.js'), 'utf8');
    expect(src).not.toMatch(/emailRedirectTo\s*:\s*['"`]/);
  });
});
