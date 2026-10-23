/** @jest-environment node */
//
// 138 — IPHONE, L'ÉCRAN (ECRAN-PROFIL §3.5). Audit iPhone du 21/10, I-03 et I-05.
//
// Une seule fonction décide « iPhone, hors de l'app » (`Auth.iphoneHorsApp`) : pure, ses entrées injectées. Les
// écrans (encart de la connexion, bandeau de Saisie, retour de lien, ligne du Profil) la lisent ; le chemin entier
// est joué dans le vrai navigateur par le banc `profil-creation.js` ([138]).

function charger() {
  jest.resetModules();
  global.THClient = { CLE_AUTH: 'th-v2-auth', obtenir: () => ({ auth: {} }) };
  require('../../v2/js/auth.js');
  return global.THAuth;
}
afterEach(() => { delete global.THClient; delete global.THAuth; });

const AGENT_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const AGENT_GMAIL = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GSA/310.0 Safari/604.1';
const AGENT_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const AGENT_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const navigateur = (o) => Object.assign({ userAgent: AGENT_IPHONE, platform: 'iPhone', maxTouchPoints: 5 }, o);
const mm = (installee) => (q) => ({ matches: installee && q === '(display-mode: standalone)' });

describe('138 — iphoneHorsApp : un appareil Apple tactile, dans un navigateur, hors de l’app installée', () => {
  test('DISCRIMINANT — iPhone, Safari : vrai', () => {
    expect(charger().iphoneHorsApp(navigateur(), mm(false))).toBe(true);
  });

  test('DISCRIMINANT — iPhone installé : faux, chaque signal SEUL suffit', () => {
    const Auth = charger();
    expect(Auth.iphoneHorsApp(navigateur({ standalone: true }), mm(false))).toBe(false);   // le signal de Safari
    expect(Auth.iphoneHorsApp(navigateur(), mm(true))).toBe(false);                        // le signal du manifeste
    expect(Auth.iphoneHorsApp(navigateur({ standalone: false }), mm(false))).toBe(true);   // `false` n'est pas « installée »
  });

  test('DISCRIMINANT — un iPad récent se présente comme un Mac : l’écran tactile le reconnaît', () => {
    const Auth = charger();
    expect(Auth.iphoneHorsApp({ userAgent: AGENT_MAC, platform: 'MacIntel', maxTouchPoints: 5 }, mm(false))).toBe(true);
    expect(Auth.iphoneHorsApp({ userAgent: AGENT_MAC, platform: 'MacIntel', maxTouchPoints: 5, standalone: true }, mm(false))).toBe(false);
  });

  test('DISCRIMINANT — un Mac sans écran tactile : faux (0 ou 1 point de contact)', () => {
    const Auth = charger();
    expect(Auth.iphoneHorsApp({ userAgent: AGENT_MAC, platform: 'MacIntel', maxTouchPoints: 0 }, mm(false))).toBe(false);
    expect(Auth.iphoneHorsApp({ userAgent: AGENT_MAC, platform: 'MacIntel', maxTouchPoints: 1 }, mm(false))).toBe(false);
    expect(Auth.iphoneHorsApp({ userAgent: AGENT_MAC, platform: 'MacIntel' }, mm(false))).toBe(false);
  });

  test('Android (Chrome) : faux, même installé ou non', () => {
    const Auth = charger();
    const android = { userAgent: AGENT_ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 };
    expect(Auth.iphoneHorsApp(android, mm(false))).toBe(false);
    expect(Auth.iphoneHorsApp(android, mm(true))).toBe(false);
  });

  test('le navigateur interne de Gmail sur iPhone : vrai (il n’est pas l’app, il n’efface pas moins)', () => {
    expect(charger().iphoneHorsApp(navigateur({ userAgent: AGENT_GMAIL }), mm(false))).toBe(true);
  });

  test('iPad et iPod dans l’agent : vrai ; entrées absentes ou cassées : faux, sans lever', () => {
    const Auth = charger();
    expect(Auth.iphoneHorsApp(navigateur({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' }), null)).toBe(true);
    expect(Auth.iphoneHorsApp(navigateur({ userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0)' }), undefined)).toBe(true);
    expect(Auth.iphoneHorsApp(null, mm(false))).toBe(false);
    expect(Auth.iphoneHorsApp({}, mm(false))).toBe(false);
    expect(Auth.iphoneHorsApp(navigateur(), () => { throw new Error('matchMedia cassé'); })).toBe(true);
  });
});

describe('138 — la sonde du retour de lien dit si c’est une récupération, sur l’adresse seule', () => {
  const JETON = 'access_token=eyJ.a.b&expires_at=4102444800&expires_in=3600&refresh_token=r&token_type=bearer';
  test('`type=recovery` → recup ; `type=signup` → implicite, sans recup ; PKCE : ni l’un ni l’autre', () => {
    const Auth = charger();
    expect(Auth.retourDeLien({ hash: '#' + JETON + '&type=recovery', search: '' }).recup).toBe(true);
    const confirmation = Auth.retourDeLien({ hash: '#' + JETON + '&type=signup', search: '' });
    expect(confirmation.recup).toBeUndefined();
    expect(confirmation.implicite).toBe(true);
    const pkce = Auth.retourDeLien({ hash: '', search: '?code=abc' });
    expect(pkce.recup).toBeUndefined();
    expect(pkce.implicite).toBeUndefined();
  });
});

describe('138 — les phrases de ECRAN-PROFIL §3.5, au mot près', () => {
  test('six écrans, un seul endroit', () => {
    const P = charger().PHRASES_IPHONE;
    expect(P.connexion).toEqual({ quoi: 'Sur iPhone, installe TrainHub d’abord.', sujet: 'Puis ouvre-le depuis ton écran d’accueil et connecte-toi là.' });
    expect(P.feuille.titre).toBe('Installer TrainHub sur ton iPhone');
    expect(P.feuille.etapes).toEqual(['Touche le bouton Partager, en bas de Safari.', 'Fais défiler et touche « Sur l’écran d’accueil ».',
      'Touche « Ajouter », puis ouvre TrainHub depuis son icône et connecte-toi.']);
    expect(P.feuille.sept).toBe('Dans Safari, l’iPhone efface les données d’un site qu’on n’ouvre pas pendant 7 jours. Installé, TrainHub garde tes séances.');
    expect(P.saisie).toEqual({ quoi: 'Tu utilises TrainHub dans Safari.', sujet: 'Installé, il garde tes séances : Safari efface un site qu’on n’ouvre pas pendant 7 jours.' });
    expect(P.lien).toEqual({ quoi: 'C’est fait : ton adresse est confirmée.', sujet: 'Ouvre TrainHub depuis ton écran d’accueil et connecte-toi là. Pas encore installé ? Fais-le d’abord.' });
    expect(P.motDePasse).toEqual({ quoi: 'Ton mot de passe est changé.', sujet: 'Ouvre TrainHub depuis ton écran d’accueil et connecte-toi avec le nouveau.' });
    expect(P.ligne).toBe('Installer sur l’écran d’accueil');
  });
});
