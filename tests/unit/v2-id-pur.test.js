//
// 59-5 — L'IDENTIFIANT D'UN PARI NE DEVIENT JAMAIS ALÉATOIRE.
//
// Relevé du 25/09 (#313) : sans `crypto.subtle` (contexte non sécurisé),
// `idDePrediction` rendait `null` et l'app tirait un identifiant AU HASARD, en
// silence. Un même pari envoyé deux fois devenait deux lignes ; la clé
// `escalier|…` ne se retrouvait plus. Le repli est désormais un SHA-256 en
// JavaScript pur (`moteur.js`, `sha256Pur`), qui doit rendre EXACTEMENT les
// mêmes octets que `crypto.subtle` — sinon un pari changerait d'identifiant
// selon l'appareil.

const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { TextEncoder } = require('util');

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const Moteur = window.THMoteur;

const FIGE = 'b9b7a693-794e-5b79-86f6-8194e29043ee';
const ARGS_FIGES = ['00000000-0000-4000-8000-000000000049', 'squat_barre', 2];

// ── Les entrées : tirées des fichiers de cas ─────────────────────────────────
const CAS = path.join(__dirname, 'fixtures');
// Chaque chaîne avec sa clé : les identifiants de cas (`id`, `seance`…) servent
// de séances, les slugs d'exercices de slugs.
const chaines = [];
const ids = [];
function cueillir(x, cle) {
  if (typeof x === 'string') { chaines.push(x); if (/^(id|seance|session_id|seance_id)$/.test(cle || '')) ids.push(x); }
  else if (Array.isArray(x)) x.forEach((v) => cueillir(v, cle));
  else if (x && typeof x === 'object') Object.keys(x).forEach((k) => cueillir(x[k], k));
}
fs.readdirSync(CAS).filter((f) => /\.json$/.test(f)).sort()
  .forEach((f) => cueillir(JSON.parse(fs.readFileSync(path.join(CAS, f), 'utf8'))));
const uniques = (l) => Array.from(new Set(l));
const SEANCES = uniques(ids);
const SLUGS = uniques(chaines.filter((s) => /^[a-z][a-z0-9_]{3,}$/.test(s) && s.indexOf('_') > 0));
const TEXTES = uniques(chaines.filter((s) => /[^\x00-\x7f]/.test(s))).slice(0, 20);   // accents, symboles

const ENTREES = [];
for (let i = 0; i < 60; i++) {
  ENTREES.push([SEANCES[i % SEANCES.length], SLUGS[(i * 7) % SLUGS.length], 1 + (i % 6),
    [undefined, 0, 1, 2][i % 4], i % 3 === 0 ? SEANCES[(i + 1) % SEANCES.length] : undefined]);
}

// Deux mondes : `crypto.subtle` (celui de Node, le même algorithme que le
// navigateur) et aucun `crypto` du tout. jsdom ne fournit ni l'un ni
// `TextEncoder` : on les pose, comme v2-predictions.test.js.
if (typeof window.TextEncoder !== 'function') window.TextEncoder = TextEncoder;
const pose = window.crypto;
const avec = () => Object.defineProperty(window, 'crypto', { value: nodeCrypto.webcrypto, configurable: true });
const sans = () => Object.defineProperty(window, 'crypto', { value: {}, configurable: true });
afterEach(() => Object.defineProperty(window, 'crypto', { value: pose, configurable: true }));

describe('59-5 — le SHA-256 pur', () => {
  test('les fichiers de cas fournissent assez d’entrées', () => {
    expect(SEANCES.length).toBeGreaterThan(5);
    expect(SLUGS.length).toBeGreaterThan(20);
    expect(TEXTES.length).toBeGreaterThan(5);
    expect(ENTREES.length).toBeGreaterThanOrEqual(50);
  });

  test('⚠️ il rend les mêmes octets que la référence — toutes les longueurs de bourrage, accents compris', () => {
    const noms = [];
    for (let n = 0; n <= 130; n++) noms.push('x'.repeat(n));   // 55, 56, 63, 64, 119, 120… : les bords
    TEXTES.concat(['é', '€', 'Développé Couché', '🏋️ squat', 'a\uD800b']).forEach((t) => noms.push(t));
    noms.forEach((n) => {
      const pur = Buffer.from(Moteur.sha256Pur(Moteur.utf8(n))).toString('hex');
      const ref = nodeCrypto.createHash('sha256').update(Buffer.from(new TextEncoder().encode(n))).digest('hex');
      expect([n, pur]).toEqual([n, ref]);
    });
  });

  test('l’UTF-8 pur est celui de TextEncoder', () => {
    TEXTES.concat(['', 'abc', 'Œuvre', '𝄞', 'a\uDC00b', '\uD83D']).forEach((t) =>
      expect(Moteur.utf8(t)).toEqual(Array.from(new TextEncoder().encode(t))));
  });
});

describe('59-5 — un pari a le même identifiant avec ou sans crypto.subtle', () => {
  test('⚠️ la valeur figée (révision 0) : la même, sans crypto.subtle', async () => {
    avec();
    expect(await Moteur.idDePrediction(...ARGS_FIGES)).toBe(FIGE);
    sans();
    expect(await Moteur.idDePrediction(...ARGS_FIGES)).toBe(FIGE);
    expect(await Moteur.idDePrediction(...ARGS_FIGES, 0)).toBe(FIGE);
  });

  test('⚠️ 60 entrées tirées des fichiers de cas : idDePrediction et idDEscalier, identiques dans les deux mondes', async () => {
    avec();
    // Le monde « avec » passe VRAIMENT par crypto.subtle — sinon on comparerait
    // le repli pur à lui-même.
    const digest = jest.spyOn(nodeCrypto.webcrypto.subtle, 'digest');
    const ref = [];
    for (const e of ENTREES) {
      ref.push(await Moteur.idDePrediction(...e));
      ref.push(await Moteur.idDEscalier(e[0], e[2] % 2 ? e[1] : null, e[2]));
    }
    expect(digest).toHaveBeenCalledTimes(ENTREES.length * 2);
    digest.mockRestore();
    sans();
    const pur = [];
    for (const e of ENTREES) {
      pur.push(await Moteur.idDePrediction(...e));
      pur.push(await Moteur.idDEscalier(e[0], e[2] % 2 ? e[1] : null, e[2]));
    }
    expect(pur).toEqual(ref);
    expect(ref.every((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x))).toBe(true);
    expect(new Set(ref).size).toBe(ref.length);
  });

  test('un crypto.subtle qui échoue : le repli pur, le même identifiant', async () => {
    Object.defineProperty(window, 'crypto', { value: { subtle: { digest: () => Promise.reject(new Error('non sécurisé')) } },
      configurable: true });
    expect(await Moteur.idDePrediction(...ARGS_FIGES)).toBe(FIGE);
  });

  test('aucun hasard : sans crypto, Math.random n’est jamais appelé, et deux appels rendent le même identifiant', async () => {
    sans();
    const r = jest.spyOn(Math, 'random');
    const a = await Moteur.idDePrediction('s-1', 'squat_barre', 1);
    const b = await Moteur.idDePrediction('s-1', 'squat_barre', 1);
    expect(a).toBe(b);
    expect(a).not.toBeNull();
    expect(r).not.toHaveBeenCalled();
    r.mockRestore();
  });
});
