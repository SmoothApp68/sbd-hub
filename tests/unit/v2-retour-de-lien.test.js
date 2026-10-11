/** @jest-environment node */
//
// 70 — L'ENTRÉE QUI MARCHE (ECRAN-PROFIL §5.6, précisé le 11/10/2026).
//
// Constat du 11/10 : le lien « mot de passe oublié » de Mélodie ouvrait bien une
// session, mais l'app, sans session enregistrée, routait vers /connexion et
// réécrivait l'adresse AVANT que le SDK ait lu le `#access_token=…` : session
// perdue. Et une inscription avec une adresse déjà inscrite disait « Compte
// créé » — sans qu'aucun mail ne parte.
//
// Ici : la sonde SYNCHRONE du retour de lien, la phrase d'inscription (la même
// quelle que soit l'adresse), et l'événement transmis par `surChangement`. Le
// chemin entier, dans le vrai navigateur : banc `profil-creation.js`, [E70].

function charger(auth) {
  jest.resetModules();
  global.THClient = { CLE_AUTH: 'th-v2-auth', obtenir: () => ({ auth: auth || {} }) };
  require('../../v2/js/auth.js');
  return global.THAuth;
}

afterEach(() => { delete global.THClient; delete global.THAuth; });

const JETON = 'access_token=eyJ.a.b&expires_at=4102444800&expires_in=3600&refresh_token=r&token_type=bearer';

describe('70 — la sonde du retour de lien : lue sur l’adresse seule, avant tout routage', () => {
  test('DISCRIMINANT — le lien de récupération (`#access_token=…&type=recovery`) : il faut attendre le SDK', () => {
    const Auth = charger();
    expect(Auth.retourDeLien({ hash: '#' + JETON + '&type=recovery', search: '' })).toEqual({ jeton: true, erreur: false });
  });

  test('le lien de confirmation d’inscription (`type=signup`) : pareil', () => {
    const Auth = charger();
    expect(Auth.retourDeLien({ hash: '#' + JETON + '&type=signup', search: '' })).toEqual({ jeton: true, erreur: false });
  });

  test('DISCRIMINANT — le lien expiré (`#error=…&error_code=otp_expired`) : une erreur, à dire', () => {
    const Auth = charger();
    expect(Auth.retourDeLien({ hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', search: '' }))
      .toEqual({ jeton: false, erreur: true });
    // Une erreur seule, sans description, se lit aussi.
    expect(Auth.retourDeLien({ hash: '#error=access_denied', search: '' })).toEqual({ jeton: false, erreur: true });
  });

  test('le flux PKCE (`?code=…`), si le client change un jour de flux', () => {
    const Auth = charger();
    expect(Auth.retourDeLien({ hash: '', search: '?code=abc' })).toEqual({ jeton: true, erreur: false });
  });

  test('DISCRIMINANT — SANS retour de lien : `null`, et le démarrage d’aujourd’hui (hors ligne immédiat) ne change pas', () => {
    const Auth = charger();
    expect(Auth.retourDeLien({ hash: '', search: '' })).toBeNull();
    expect(Auth.retourDeLien({ hash: '#', search: '' })).toBeNull();                // ce que le SDK laisse après lecture
    expect(Auth.retourDeLien({ hash: '#ancre', search: '?garde=1' })).toBeNull();
    expect(Auth.retourDeLien({ hash: '#type=recovery', search: '' })).toBeNull();   // pas de jeton, rien à attendre
    expect(Auth.retourDeLien(null)).toBeNull();
  });

  test('elle est SYNCHRONE et ne touche pas au client (aucun réseau)', () => {
    const Auth = charger({ getSession: () => { throw new Error('la sonde ne doit pas demander au SDK'); } });
    const r = Auth.retourDeLien({ hash: '#' + JETON, search: '' });
    expect(r).not.toBeNull();
    expect(typeof r.then).toBe('undefined');
  });
});

describe('70 — l’inscription dit toujours la même chose (ne jamais révéler qui est inscrit)', () => {
  const PHRASE = 'Compte créé si l\'adresse est nouvelle : confirme ton e-mail, puis connecte-toi. ' +
    'Si tu as déjà un compte avec cette adresse, aucun mail ne part : utilise « Mot de passe oublié ? ».';

  // Ce que `signUp` rend, avec la confirmation d'e-mail du projet :
  //   · une adresse NEUVE : l'utilisateur, avec son identité, sans session ;
  //   · une adresse DÉJÀ INSCRITE : un utilisateur masqué (aucune identité), sans session — ou rien.
  const neuf = { data: { user: { id: 'u-neuf', email: 'a@b.fr', identities: [{ provider: 'email' }] }, session: null }, error: null };
  const deja = { data: { user: { id: 'u-masque', email: 'a@b.fr', identities: [] }, session: null }, error: null };
  const rien = { data: { user: null, session: null }, error: null };

  test('DISCRIMINANT — adresse neuve, adresse déjà inscrite, rien : la MÊME phrase, au mot près (§5.6)', async () => {
    const phrases = [];
    for (const reponse of [neuf, deja, rien]) {
      const Auth = charger({ signUp: async () => reponse });
      phrases.push(Auth.phraseInscription(await Auth.inscrire('a@b.fr', 'motdepasse1', 'https://x.fr/', 'a_b')));
    }
    expect(phrases).toEqual([PHRASE, PHRASE, PHRASE]);
  });

  test('avec une session (pas de confirmation exigée), on entre : aucune phrase', async () => {
    const Auth = charger({ signUp: async () => ({ data: { user: { id: 'u' }, session: { access_token: 'a', user: { id: 'u' } } }, error: null }) });
    expect(Auth.phraseInscription(await Auth.inscrire('a@b.fr', 'motdepasse1'))).toBeNull();
  });

  test('la phrase ne dit jamais qu’une adresse a déjà un compte', () => {
    const Auth = charger();
    expect(Auth.phraseInscription({ session: null, user: null })).not.toMatch(/existe déjà|déjà utilisée|déjà inscrite/);
  });
});

describe('70 — `surChangement` transmet l’événement', () => {
  test('DISCRIMINANT — `PASSWORD_RECOVERY` arrive jusqu’à l’app, avec la session', () => {
    let abonne = null;
    const Auth = charger({ onAuthStateChange: (fn) => { abonne = fn; } });
    const recu = [];
    Auth.surChangement((session, evenement) => recu.push([session, evenement]));
    const s = { user: { id: 'u' } };
    abonne('PASSWORD_RECOVERY', s);
    abonne('SIGNED_OUT', null);
    expect(recu).toEqual([[s, 'PASSWORD_RECOVERY'], [null, 'SIGNED_OUT']]);
  });
});
