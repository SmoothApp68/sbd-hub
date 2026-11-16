/** @jest-environment node */
//
// 16/11/2026 — LE CODE PAR E-MAIL (ECRAN-PROFIL §5.6). Le mail porte un code à usage unique, saisi dans l'app :
// l'aperçu d'un client mail consomme un lien, et un lien n'ouvre jamais l'app installée.
// Ici : `verifierCode` (le bon `type`), le nettoyage du code collé, `renvoyerCode` selon le genre, le décompte, les phrases.
// Le chemin entier, dans le vrai navigateur : banc `profil-creation.js`, [CODE].

let appels;

function charger(cle) {
  jest.resetModules();
  appels = [];
  global.THConfig = { TURNSTILE_SITE_KEY: cle || '' };
  const ok = (data) => Promise.resolve({ data: data || {}, error: null });
  global.THClient = {
    CLE_AUTH: 'th-v2-auth',
    obtenir: () => ({ auth: {
      verifyOtp: (a) => { appels.push(['verifyOtp', a]); return ok({ session: { user: { id: 'u' } }, user: { id: 'u' } }); },
      resend: (a) => { appels.push(['resend', a]); return ok(); },
      resetPasswordForEmail: (...a) => { appels.push(['resetPasswordForEmail', a]); return ok(); }
    } })
  };
  require('../../v2/js/auth.js');
  return global.THAuth;
}

afterEach(() => { delete global.THClient; delete global.THConfig; delete global.THAuth; });

describe('verifierCode', () => {
  test('DISCRIMINANT — la récupération vérifie avec le type `recovery`', async () => {
    const Auth = charger();
    await Auth.verifierCode('a@b.fr', '123456', 'recuperation');
    expect(appels).toEqual([['verifyOtp', { email: 'a@b.fr', token: '123456', type: 'recovery' }]]);
  });

  test('DISCRIMINANT — l’inscription vérifie avec le type `email`', async () => {
    const Auth = charger();
    await Auth.verifierCode('a@b.fr', '123456', 'inscription');
    expect(appels).toEqual([['verifyOtp', { email: 'a@b.fr', token: '123456', type: 'email' }]]);
  });

  test('un code collé avec espaces et tirets part nettoyé', async () => {
    const Auth = charger();
    await Auth.verifierCode('a@b.fr', ' 123 456 ', 'recuperation');
    await Auth.verifierCode('a@b.fr', '123-456', 'recuperation');
    expect(appels.map((a) => a[1].token)).toEqual(['123456', '123456']);
  });

  test('l’erreur du SDK est levée telle quelle', async () => {
    jest.resetModules();
    const err = Object.assign(new Error('Token has expired or is invalid'), { status: 403, code: 'otp_expired' });
    global.THClient = { CLE_AUTH: 'x', obtenir: () => ({ auth: { verifyOtp: async () => ({ data: {}, error: err }) } }) };
    require('../../v2/js/auth.js');
    await expect(global.THAuth.verifierCode('a@b.fr', '123456', 'recuperation')).rejects.toBe(err);
  });
});

describe('le code : nettoyage, longueur', () => {
  test('DISCRIMINANT — le bouton n’est prêt qu’à partir de 6 chiffres, et jusqu’à 10', () => {
    const Auth = charger();
    expect(Auth.codePret('12345')).toBe(false);
    expect(Auth.codePret('123456')).toBe(true);
    expect(Auth.codePret('1234567890')).toBe(true);
    expect(Auth.codePret('')).toBe(false);
    expect(Auth.codePret(null)).toBe(false);
  });
  test('espaces, tirets et lettres collés sont ignorés ; au plus 10 chiffres', () => {
    const Auth = charger();
    expect(Auth.nettoyerCode('123 456')).toBe('123456');
    expect(Auth.nettoyerCode('12-34-56')).toBe('123456');
    expect(Auth.nettoyerCode('abc 12345678901234')).toBe('1234567890');
    expect(Auth.codePret('12 34 5')).toBe(false);
  });
});

describe('renvoyerCode', () => {
  test('DISCRIMINANT — récupération : le même envoi que « Mot de passe oublié ? » (adresse de retour et jeton compris)', async () => {
    const Auth = charger();
    await Auth.renvoyerCode('a@b.fr', 'recuperation', 'jeton-1', 'https://x.fr/profil');
    expect(appels).toEqual([['resetPasswordForEmail', ['a@b.fr', { redirectTo: 'https://x.fr/profil', captchaToken: 'jeton-1' }]]]);
  });
  test('DISCRIMINANT — inscription : `resend` de type `signup`, avec le jeton', async () => {
    const Auth = charger();
    await Auth.renvoyerCode('a@b.fr', 'inscription', 'jeton-2');
    expect(appels).toEqual([['resend', { type: 'signup', email: 'a@b.fr', options: { captchaToken: 'jeton-2' } }]]);
  });
  test('inscription sans captcha : aucune option vide', async () => {
    const Auth = charger();
    await Auth.renvoyerCode('a@b.fr', 'inscription', null);
    expect(appels).toEqual([['resend', { type: 'signup', email: 'a@b.fr', options: undefined }]]);
  });
});

describe('le décompte du renvoi et les phrases', () => {
  test('DISCRIMINANT — 60 s d’attente, décomptées à la seconde', () => {
    const Auth = charger();
    expect(Auth.DELAI_RENVOI_S).toBe(60);
    expect(Auth.secondesAvantRenvoi(1000, 1000)).toBe(60);
    expect(Auth.secondesAvantRenvoi(1000, 1000 + 18000)).toBe(42);
    expect(Auth.secondesAvantRenvoi(1000, 1000 + 59001)).toBe(1);
    expect(Auth.secondesAvantRenvoi(1000, 1000 + 60000)).toBe(0);
    expect(Auth.secondesAvantRenvoi(1000, 1000 + 90000)).toBe(0);
    expect(Auth.libelleRenvoi(42)).toBe('Renvoyer le code (dans 42 s)');
    expect(Auth.libelleRenvoi(0)).toBe('Renvoyer le code');
  });
  test('les phrases, au mot près', () => {
    const Auth = charger();
    expect(Auth.PHRASE_CODE_ENVOYE).toBe('Si un compte existe pour cette adresse, un code vient de partir.');
    expect(Auth.PHRASE_CODE_FAUX).toBe('Ce code ne marche pas ou a expiré. Vérifie-le, ou demande-en un autre.');
    expect(Auth.PHRASE_CODE_TROP).toBe('Attends une minute avant de redemander un code.');
    expect(Auth.phraseInscription({ session: null })).toBe('Si l\'adresse est nouvelle, un code vient de partir : entre-le ici. ' +
      'Si tu as déjà un compte avec cette adresse, aucun mail ne part : utilise « Mot de passe oublié ? ».');
  });
  test('DISCRIMINANT — code faux ou expiré → la phrase du code ; trop de demandes → l’attente ; réseau → null (l’app dit « Pas de réseau. »)', () => {
    const Auth = charger();
    expect(Auth.phraseDeCode(Object.assign(new Error('Token has expired or is invalid'), { status: 403, code: 'otp_expired' }))).toBe(Auth.PHRASE_CODE_FAUX);
    expect(Auth.phraseDeCode(Object.assign(new Error('Email OTP invalid'), { status: 400 }))).toBe(Auth.PHRASE_CODE_FAUX);
    expect(Auth.phraseDeCode(Object.assign(new Error('email rate limit exceeded'), { status: 429, code: 'over_email_send_rate_limit' }))).toBe(Auth.PHRASE_CODE_TROP);
    expect(Auth.phraseDeCode(Object.assign(new Error('For security purposes, you can only request this after 42 seconds.'), { status: 429 }))).toBe(Auth.PHRASE_CODE_TROP);
    expect(Auth.phraseDeCode(new TypeError('Failed to fetch'))).toBeNull();
    expect(Auth.phraseDeCode(Object.assign(new Error('x'), { name: 'AuthRetryableFetchError', status: 0 }))).toBeNull();
    expect(Auth.phraseDeCode(null)).toBeNull();
  });
});
