//
// 247 — LE CAPTCHA TURNSTILE (`Auth.captcha`, dans `auth.js`).
//
// Clé de site vide : rien ne change (aucun script, aucun widget, appels Supabase identiques à ceux d'avant).
// Clé posée : le jeton part dans les trois appels, se réinitialise après chaque tentative, a un plafond de 10 s.
// Environnement jsdom (pas de docblock `node`) : il faut un `document`.

const fs = require('fs');
const path = require('path');

const V2 = path.join(__dirname, '../../v2');
const SRC_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let appels, Auth, widgets;

function charger(cle) {
  jest.resetModules();
  appels = [];
  widgets = { rendus: [], resets: [], retraits: [] };
  const ok = (data) => Promise.resolve({ data: data || {}, error: null });
  global.THConfig = { TURNSTILE_SITE_KEY: cle };
  global.THClient = {
    CLE_AUTH: 'th-v2-auth',
    obtenir: () => ({ auth: {
      signUp: (a) => { appels.push(['signUp', a]); return ok({ session: null, user: { id: 'u' } }); },
      signInWithPassword: (a) => { appels.push(['signInWithPassword', a]); return ok({ session: { user: { id: 'u' } } }); },
      resetPasswordForEmail: (...a) => { appels.push(['resetPasswordForEmail', a]); return ok(); }
    } })
  };
  delete global.turnstile;
  document.head.innerHTML = '';
  require('../../v2/js/auth.js');
  Auth = global.THAuth;
}

// Le script de Cloudflare ne se charge pas dans jsdom : on l'« arrive » à la main.
function balises() { return Array.from(document.head.querySelectorAll('script')); }
function livrerLeScript() {
  global.turnstile = {
    render: (c, o) => { widgets.rendus.push({ c, o }); return 'w' + widgets.rendus.length; },
    reset: (id) => widgets.resets.push(id),
    remove: (id) => widgets.retraits.push(id)
  };
  balises().forEach((b) => b.onload && b.onload());
}

afterEach(() => { jest.useRealTimers(); delete global.turnstile; delete global.THConfig; });

describe('247 — clé de site VIDE : strictement comme avant', () => {
  beforeEach(() => charger(''));

  test('actif() est faux, charger() ne pose aucun script, monter() et jeton() ne font rien', async () => {
    expect(Auth.captcha.actif()).toBe(false);
    expect(await Auth.captcha.charger()).toBe(false);
    expect(await Auth.captcha.monter(document.createElement('div'))).toBeNull();
    expect(await Auth.captcha.jeton()).toBeNull();
    expect(balises()).toHaveLength(0);
  });

  test('connecter / inscrire / reinitialiser appellent Supabase SANS aucune option de captcha', async () => {
    await Auth.connecter('a@b.c', 'mdp');
    await Auth.inscrire('a@b.c', 'mdp', 'https://x/', 'pseudo');
    await Auth.inscrire('a@b.c', 'mdp');
    await Auth.reinitialiser('a@b.c', 'https://x/profil');
    await Auth.reinitialiser('a@b.c');
    expect(appels).toEqual([
      ['signInWithPassword', { email: 'a@b.c', password: 'mdp' }],
      ['signUp', { email: 'a@b.c', password: 'mdp', options: { emailRedirectTo: 'https://x/', data: { pseudo: 'pseudo' } } }],
      ['signUp', { email: 'a@b.c', password: 'mdp', options: undefined }],
      ['resetPasswordForEmail', ['a@b.c', { redirectTo: 'https://x/profil' }]],
      ['resetPasswordForEmail', ['a@b.c', undefined]]
    ]);
    expect(JSON.stringify(appels)).not.toMatch(/captcha/i);
  });
});

describe('247 — clé posée : le jeton part dans les trois appels', () => {
  beforeEach(() => charger('cle-de-banc'));

  test('connexion, inscription, réinitialisation transmettent captchaToken', async () => {
    await Auth.connecter('a@b.c', 'mdp', 'JETON');
    await Auth.inscrire('a@b.c', 'mdp', 'https://x/', 'pseudo', 'JETON');
    await Auth.inscrire('a@b.c', 'mdp', null, null, 'JETON');
    await Auth.reinitialiser('a@b.c', 'https://x/profil', 'JETON');
    await Auth.reinitialiser('a@b.c', null, 'JETON');
    expect(appels).toEqual([
      ['signInWithPassword', { email: 'a@b.c', password: 'mdp', options: { captchaToken: 'JETON' } }],
      ['signUp', { email: 'a@b.c', password: 'mdp', options: { emailRedirectTo: 'https://x/', data: { pseudo: 'pseudo' }, captchaToken: 'JETON' } }],
      ['signUp', { email: 'a@b.c', password: 'mdp', options: { captchaToken: 'JETON' } }],
      ['resetPasswordForEmail', ['a@b.c', { redirectTo: 'https://x/profil', captchaToken: 'JETON' }]],
      ['resetPasswordForEmail', ['a@b.c', { captchaToken: 'JETON' }]]
    ]);
  });
});

describe('247 — le script : une seule balise, seulement quand on le demande', () => {
  beforeEach(() => charger('cle-de-banc'));

  test('rien n’est posé tant que personne n’appelle charger() (jamais au démarrage)', () => {
    expect(Auth.captcha.actif()).toBe(true);
    expect(balises()).toHaveLength(0);
  });

  test('charger() pose UNE balise vers l’URL de Cloudflare, même appelée deux fois', async () => {
    const a = Auth.captcha.charger(), b = Auth.captcha.charger();
    expect(balises()).toHaveLength(1);
    expect(balises()[0].src).toBe(SRC_SCRIPT);
    livrerLeScript();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(balises()).toHaveLength(1);
  });

  test('un échec de chargement rend l’erreur « script » et retire la balise ; « Réessayer » en repose une', async () => {
    const p = Auth.captcha.monter(document.createElement('div'));
    balises()[0].onerror();
    await expect(p).rejects.toMatchObject({ captcha: 'script' });
    expect(balises()).toHaveLength(0);
    const q = Auth.captcha.monter(document.createElement('div'));
    expect(balises()).toHaveLength(1);
    livrerLeScript();
    await q;
    expect(widgets.rendus).toHaveLength(1);
  });

  test('plafond de 10 s sur le chargement : le script qui pend donne l’erreur « script »', async () => {
    jest.useFakeTimers();
    const p = Auth.captcha.charger();
    const attendu = expect(p).rejects.toMatchObject({ captcha: 'script' });
    jest.advanceTimersByTime(10000);
    await attendu;
    expect(Auth.captcha.phrase({ captcha: 'script' })).toMatch(/n'a pas pu se charger.*réessaie/);
  });
});

describe('247 — le widget et le jeton', () => {
  const monter = async () => {
    const c = document.createElement('div');
    const p = Auth.captcha.monter(c);
    livrerLeScript();
    await p;
    return c;
  };
  beforeEach(() => charger('cle-de-banc'));

  test('monter() rend le widget invisible dans le cas courant, en français, thème sombre', async () => {
    const c = await monter();
    expect(widgets.rendus).toHaveLength(1);
    expect(widgets.rendus[0].c).toBe(c);
    expect(widgets.rendus[0].o).toMatchObject({ sitekey: 'cle-de-banc', appearance: 'interaction-only', theme: 'dark', language: 'fr' });
  });

  test('monter() deux fois sur le même conteneur ne monte qu’un widget', async () => {
    const c = await monter();
    await Auth.captcha.monter(c);
    expect(widgets.rendus).toHaveLength(1);
  });

  test('jeton() attend le callback, puis rend le jeton ; un jeton déjà prêt est rendu tout de suite', async () => {
    await monter();
    const p = Auth.captcha.jeton();
    widgets.rendus[0].o.callback('J1');
    expect(await p).toBe('J1');
    expect(await Auth.captcha.jeton()).toBe('J1');
  });

  test('⚠️ reinitialiser() : le jeton ne resservira pas et le widget est remis à zéro', async () => {
    await monter();
    widgets.rendus[0].o.callback('J1');
    Auth.captcha.reinitialiser();
    expect(widgets.resets).toEqual(['w1']);
    jest.useFakeTimers();
    const p = Auth.captcha.jeton();
    const attendu = expect(p).rejects.toMatchObject({ captcha: 'delai' });   // plus de jeton J1
    jest.advanceTimersByTime(10000);
    await attendu;
  });

  test('plafond de 10 s sur le jeton : « La vérification a expiré. Réessaie. »', async () => {
    await monter();
    jest.useFakeTimers();
    const p = Auth.captcha.jeton();
    const attendu = expect(p).rejects.toMatchObject({ captcha: 'delai', message: 'La vérification a expiré. Réessaie.' });
    jest.advanceTimersByTime(9999);
    jest.advanceTimersByTime(1);
    await attendu;
  });

  test('un jeton expiré (expired-callback) n’est plus rendu', async () => {
    await monter();
    widgets.rendus[0].o.callback('J1');
    widgets.rendus[0].o['expired-callback']();
    jest.useFakeTimers();
    const p = Auth.captcha.jeton();
    const attendu = expect(p).rejects.toMatchObject({ captcha: 'delai' });
    jest.advanceTimersByTime(10000);
    await attendu;
  });

  test('error-callback : l’attente en cours échoue tout de suite, avec la phrase de l’expiration', async () => {
    await monter();
    const p = Auth.captcha.jeton();
    widgets.rendus[0].o['error-callback']();
    await expect(p).rejects.toMatchObject({ captcha: 'refus' });
  });

  test('jeton() sans widget monté ni chargement en cours : l’erreur « script », sans attendre', async () => {
    await expect(Auth.captcha.jeton()).rejects.toMatchObject({ captcha: 'script' });
  });

  test('demonter() retire le widget', async () => {
    await monter();
    Auth.captcha.demonter();
    expect(widgets.retraits).toEqual(['w1']);
  });

  test('phrase() : le refus de Supabase vaut « expiré » ; une autre erreur n’est pas une erreur de captcha', () => {
    const exp = 'La vérification a expiré. Réessaie.';
    expect(Auth.captcha.phrase({ message: 'captcha verification process failed' })).toBe(exp);
    expect(Auth.captcha.phrase({ code: 'captcha_failed', message: 'x' })).toBe(exp);
    expect(Auth.captcha.phrase({ message: 'Invalid login credentials' })).toBeNull();
    expect(Auth.captcha.phrase(null)).toBeNull();
    expect(Auth.captcha.estScript({ captcha: 'script' })).toBe(true);
    expect(Auth.captcha.estScript({ captcha: 'delai' })).toBe(false);
  });
});

describe('247 — structure : une seule clé, la CSP, le service worker intact', () => {
  const lire = (f) => fs.readFileSync(path.join(V2, f), 'utf8');
  const fichiers = fs.readdirSync(path.join(V2, 'js')).filter((f) => /\.js$/.test(f)).map((f) => 'js/' + f)
    .concat(['index.html', 'service-worker.js']);

  test('⚠️ la clé de site se lit à UN endroit (auth.js), se déclare à UN endroit (config.js), jamais en dur ailleurs', () => {
    const lecteurs = fichiers.filter((f) => /TURNSTILE_SITE_KEY/.test(lire(f)));
    expect(lecteurs.sort()).toEqual(['js/auth.js', 'js/config.js']);
    // Une clé de site Turnstile commence par « 0x4 » ; aucune valeur de ce genre dans v2/.
    expect(fichiers.filter((f) => /\b0x4[A-Za-z0-9_-]{15,}/.test(lire(f)))).toEqual([]);
    // Et `sitekey:` n'apparaît que dans auth.js.
    expect(fichiers.filter((f) => /\bsitekey\s*:/.test(lire(f)))).toEqual(['js/auth.js']);
  });

  test('la CSP autorise Cloudflare pour le script et le cadre, sans unsafe-inline', () => {
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(lire('index.html'))[1];
    expect(csp).toMatch(/script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
    expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com;/);
    expect(csp).not.toMatch(/unsafe-inline/);
    expect(csp).toMatch(/default-src 'self'/);
  });

  test('⚠️ le service worker ne sait rien de Cloudflare : le script tiers n’est pas dans SHELL, et sa requête passe', () => {
    const sw = lire('service-worker.js');
    expect(sw).not.toMatch(/challenges\.cloudflare|turnstile/i);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return;/);
  });

  test('le script n’est chargé que par auth.js, depuis charger() (jamais au démarrage de l’app)', () => {
    expect(fichiers.filter((f) => /challenges\.cloudflare\.com/.test(lire(f)) && f !== 'index.html')).toEqual(['js/auth.js']);
    const app = lire('js/app.js');
    expect(app).not.toMatch(/Auth\.captcha\.charger\s*\(/);
  });
});
