//
// v2/js/auth.js — la sonde SYNCHRONE de session.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : un jeton PÉRIMÉ. Avec un
// jeton frais, « lire le stockage » et « demander au SDK » rendent la même
// chose, et rien ne les sépare. C'est le jeton périmé qui fait partir le SDK en
// rafraîchissement réseau — et c'est ce départ qui laissait l'écran noir au
// rechargement hors ligne.
//
// Environnement jsdom (pas de docblock `node`) : il faut un `localStorage`.

const CLE = 'th-v2-auth';

// `auth.js` n'exporte pas via module.exports : il pose `THAuth` sur le global.
// On lui fournit le `THClient` dont il lit la clé de stockage, puis on charge.
global.THClient = { CLE_AUTH: CLE, obtenir: () => { throw new Error('pas de réseau au banc'); } };
require('../../v2/js/auth.js');
const Auth = global.THAuth;

const jeton = (o) => localStorage.setItem(CLE, JSON.stringify(o));
const session = (extra) => Object.assign({
  access_token: 'a', refresh_token: 'r',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'u-1', email: 'a@b.c' }
}, extra || {});

beforeEach(() => localStorage.clear());

describe('sessionPersistee — ce que le jeton dit, sans aucun réseau', () => {
  test('DISCRIMINANT : un jeton PÉRIMÉ rend quand même la session', () => {
    // Le SDK, lui, partirait en rafraîchissement réseau ici. La sonde ne part
    // nulle part : elle lit, et elle répond. C'est tout le correctif.
    jeton(session({ expires_at: Math.floor(Date.now() / 1000) - 86400 }));
    expect(Auth.sessionPersistee()).toEqual({ user: { id: 'u-1', email: 'a@b.c' }, persistee: true });
  });

  test('un jeton frais aussi — les deux cas rendent la même chose', () => {
    jeton(session());
    expect(Auth.sessionPersistee().user.id).toBe('u-1');
  });

  test('elle est SYNCHRONE : elle ne rend pas une promesse', () => {
    jeton(session());
    const r = Auth.sessionPersistee();
    expect(r).not.toBeNull();
    expect(typeof r.then).toBe('undefined');
  });

  test('aucun jeton -> null, et rien n’est inventé', () => {
    expect(Auth.sessionPersistee()).toBeNull();
  });

  test('la forme `currentSession` est acceptée autant que la forme à plat', () => {
    jeton({ currentSession: session() });
    expect(Auth.sessionPersistee().user.id).toBe('u-1');
  });

  test('SANS IDENTIFIANT, PAS DE SESSION — sinon le cache serait vidé', () => {
    // `garantirProprietaire` vide le cache quand le userId ne correspond pas,
    // et un userId indéfini ne correspond à rien. Rendre une session sans id
    // effacerait précisément les données qu'on cherche à afficher hors ligne.
    jeton({ access_token: 'a', user: { email: 'a@b.c' } });
    expect(Auth.sessionPersistee()).toBeNull();
    jeton({ access_token: 'a' });
    expect(Auth.sessionPersistee()).toBeNull();
    jeton({ access_token: 'a', user: null });
    expect(Auth.sessionPersistee()).toBeNull();
  });

  test('un stockage illisible ne fait pas tomber le démarrage', () => {
    localStorage.setItem(CLE, 'ceci n’est pas du JSON');
    expect(Auth.sessionPersistee()).toBeNull();
  });

  test('elle ne rend QUE l’identité — jamais le jeton lui-même', () => {
    jeton(session());
    const r = Auth.sessionPersistee();
    expect(Object.keys(r).sort()).toEqual(['persistee', 'user']);
    expect(JSON.stringify(r)).not.toMatch(/access_token|refresh_token/);
  });

  test('un e-mail absent ne bloque rien : l’identifiant suffit', () => {
    jeton({ user: { id: 'u-2' } });
    expect(Auth.sessionPersistee()).toEqual({ user: { id: 'u-2', email: null }, persistee: true });
  });
});
