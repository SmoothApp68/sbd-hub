/** @jest-environment node */
//
// 27/11/2026 — LE PREMIER CONTACT RÉPARÉ (avant toute connexion anonyme) :
// l'écran du code survit au rechargement (mémoire locale, adresse seule, durée courte) ; « Email not confirmed » et les autres
// refus de l'authentification ont leur phrase française ; « Valable 1 heure » n'est plus écrit en dur.
const fs = require('fs');
const path = require('path');

let Auth;
beforeAll(() => {
  global.THConfig = { TURNSTILE_SITE_KEY: '' };
  global.THClient = { CLE_AUTH: 'th-v2-auth', obtenir: () => ({ auth: {} }) };
  require('../../v2/js/auth.js');
  Auth = global.THAuth;
});
afterAll(() => { delete global.THClient; delete global.THConfig; delete global.THAuth; });

describe('la mémoire de l’écran du code', () => {
  const T0 = 1_800_000_000_000;
  const etat = { email: 'a@b.fr', genre: 'inscription', envoyeA: T0 - 5000 };

  test('DISCRIMINANT — un aller-retour rend l’adresse, le genre et l’heure d’envoi', () => {
    const texte = Auth.coderAttenteDeCode(etat, T0);
    expect(Auth.lireAttenteDeCode(texte, T0 + 60 * 1000)).toEqual(etat);
  });

  test('aucune donnée sensible : ni mot de passe, ni code, ni jeton dans ce qui est gardé', () => {
    const o = JSON.parse(Auth.coderAttenteDeCode(Object.assign({ mdp: 'secret', code: '123456', jeton: 'x' }, etat), T0));
    expect(Object.keys(o).sort()).toEqual(['a', 'e', 'g', 'le']);
    expect(JSON.stringify(o)).not.toMatch(/secret|123456/);
  });

  test('DISCRIMINANT — passé la durée courte, plus rien ne revient', () => {
    const texte = Auth.coderAttenteDeCode(etat, T0);
    expect(Auth.lireAttenteDeCode(texte, T0 + Auth.DUREE_ATTENTE_CODE_MS)).not.toBeNull();
    expect(Auth.lireAttenteDeCode(texte, T0 + Auth.DUREE_ATTENTE_CODE_MS + 1)).toBeNull();
    expect(Auth.DUREE_ATTENTE_CODE_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  test('une valeur abîmée, vide ou datée du futur ne rouvre rien', () => {
    expect(Auth.lireAttenteDeCode(null, T0)).toBeNull();
    expect(Auth.lireAttenteDeCode('pas du json', T0)).toBeNull();
    expect(Auth.lireAttenteDeCode('{"e":"","le":1}', T0)).toBeNull();
    expect(Auth.lireAttenteDeCode(Auth.coderAttenteDeCode(etat, T0 + 99999), T0)).toBeNull();
  });

  test('la récupération garde son genre, un genre inconnu retombe sur l’inscription', () => {
    const r = Auth.lireAttenteDeCode(Auth.coderAttenteDeCode({ email: 'a@b.fr', genre: 'recuperation', envoyeA: 0 }, T0), T0);
    expect(r.genre).toBe('recuperation');
    expect(Auth.lireAttenteDeCode(Auth.coderAttenteDeCode({ email: 'a@b.fr', genre: 'zzz', envoyeA: 0 }, T0), T0).genre).toBe('inscription');
  });

  test('la clé commence par th-v2 : « Quitter » l’efface avec le reste', () => {
    expect(Auth.CLE_CODE_ATTENTE.indexOf('th-v2')).toBe(0);
  });
});

describe('les refus de l’authentification parlent français', () => {
  test('DISCRIMINANT — « Email not confirmed » (message ou code)', () => {
    expect(Auth.estNonConfirme({ message: 'Email not confirmed' })).toBe(true);
    expect(Auth.estNonConfirme({ code: 'email_not_confirmed', message: 'x' })).toBe(true);
    expect(Auth.estNonConfirme({ message: 'Invalid login credentials' })).toBe(false);
    expect(Auth.phraseDErreur({ message: 'Email not confirmed' })).toBe('Ton adresse n’est pas encore confirmée.');
  });

  test('DISCRIMINANT — le 429 dit d’attendre une minute', () => {
    const p = 'Trop de demandes. Réessaie dans une minute.';
    expect(Auth.phraseDErreur({ status: 429, message: 'x' })).toBe(p);
    expect(Auth.phraseDErreur({ message: 'email rate limit exceeded' })).toBe(p);
    expect(Auth.phraseDErreur({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(p);
    expect(Auth.phraseDErreur({ message: 'For security purposes, you can only request this after 45 seconds.' })).toBe(p);
  });

  test('les autres refus connus', () => {
    expect(Auth.phraseDErreur({ message: 'Password should be at least 6 characters.' })).toMatch(/mot de passe/);
    expect(Auth.phraseDErreur({ message: 'Unable to validate email address: invalid format' })).toMatch(/adresse e-mail/);
    expect(Auth.phraseDErreur({ message: 'Signups not allowed for this instance' })).toMatch(/inscriptions/);
    expect(Auth.phraseDErreur({ message: 'Error sending confirmation email' })).toMatch(/e-mail/);
    expect(Auth.phraseDErreur({ message: 'New password should be different from the old password.' })).toMatch(/différent/);
  });

  test('aucune de ces phrases ne garde un mot d’anglais, ni n’a de ponctuation brute', () => {
    const msgs = ['Email not confirmed', 'email rate limit exceeded', 'Password should be at least 6 characters.',
      'Unable to validate email address: invalid format', 'Signups not allowed', 'Error sending confirmation email'];
    msgs.forEach((m) => expect(Auth.phraseDErreur({ message: m })).not.toMatch(/not|rate|should|Unable|Signups|Error/));
  });

  test('le captcha, le réseau et l’inconnu passent sans traduction ici', () => {
    expect(Auth.phraseDErreur({ code: 'captcha_failed', message: 'captcha rate limit' })).toBeNull();
    expect(Auth.phraseDErreur({ message: 'Failed to fetch' })).toBeNull();
    expect(Auth.phraseDErreur(null)).toBeNull();
  });
});

describe('l’écran (source de app.js et de index.html)', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../v2/index.html'), 'utf8');

  test('DISCRIMINANT — « Valable 1 heure » n’est plus écrit, « spams » l’est', () => {
    expect(app).not.toMatch(/valable 1 heure/i);
    expect(app).toMatch(/Regarde aussi dans tes spams/);
  });

  test('DISCRIMINANT — l’ouverture de l’entrée rouvre le code gardé, et « Changer d’e-mail » l’oublie d’abord', () => {
    const ouverture = app.slice(app.indexOf('function rendreEntree(mode, opts)'), app.indexOf('function etatEntree()'));
    expect(ouverture).toMatch(/opts && opts\.reprendre \? lireCodeEnAttente\(\) : null/);
    expect(app).toMatch(/rendreEntree\(mode, \{ reprendre: true \}\)/);   // le démarrage seul
    expect(app).toMatch(/rendreEntree\('connexion', \{ garderCode: true \}\)/);   // l'annonce « pas de session » du SDK ne le ferme pas
    expect(ouverture).toMatch(/if \(reprise\) ouvrirCode\(reprise\.genre, reprise\.email/);
    expect(app).toMatch(/btn-code-changer'\)\.addEventListener\('click', function \(\) \{ oublierCodeEnAttente\(\); rendreEntree/);
  });

  test('l’adresse en attente se garde à l’ouverture et à chaque renvoi, s’oublie à l’entrée d’une session', () => {
    expect(app).toMatch(/function ouvrirCode[\s\S]{0,200}garderCodeEnAttente\(\)/);
    expect(app).toMatch(/codeEtat\.envoyeA = Date\.now\(\);\s*garderCodeEnAttente\(\)/);
    expect(app).toMatch(/if \(session\) \{ oublierCodeEnAttente\(\); entrer\(session\); return; \}/);
  });

  test('les boutons « Entrer le code » et « Renvoyer le code » existent, cachés d’abord, et le refus les montre', () => {
    expect(html).toMatch(/id="non-confirme"[^>]*hidden/);
    expect(html).toMatch(/id="btn-nc-entrer"[^>]*>Entrer le code</);
    expect(html).toMatch(/id="btn-nc-renvoyer"[^>]*>Renvoyer le code</);
    expect(app).toMatch(/\$\('non-confirme'\)\.hidden = inscription \|\| !Auth\.estNonConfirme\(err\)/);
  });

  test('texteErreur passe par la phrase française avant le texte brut', () => {
    const f = app.slice(app.indexOf('function texteErreur'), app.indexOf('// ── Index des séries par séance'));
    expect(f).toMatch(/Auth\.phraseDErreur\(e\) \|\| m/);
  });
});
