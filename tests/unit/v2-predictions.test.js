//
// 48c — ce que le moteur a proposé s'écrit dans `predictions`.
//
// Trois surfaces, trois fichiers, un seul chantier :
//   · `moteur.js` — la fonction PURE qui rend les lignes (§9.11) ;
//   · `seance.js` — la couverture, qui dit quelle ligne porte quel rang et
//     sert donc à l'appariement de l'observation ;
//   · `attente.js` — la dépendance déclarée, sans laquelle une prédiction
//     observée peut monter avant les séries de sa séance.
//
// Ce que ce fichier ne teste PAS : l'écriture elle-même, qui vit dans
// `app.js` et n'est atteignable que par le banc d'écran.
//
// Environnement jsdom (pas de docblock `node`) : `modele.js` se termine par
// `this`, que Babel remplace par `undefined` sous l'environnement node.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const Moteur = window.THMoteur;
const Seance = require('../../v2/js/seance.js');
const Attente = require('../../v2/js/attente.js');

// ── LA VERSION DU MOTEUR ────────────────────────────────────────────────────
//
// `lignesDePrediction` (48c), qui écrivait les paris à l'ouverture, est partie
// en 49-U6 : plus d'appelant depuis 49-C. La forme d'un pari est figée par la
// référence des paris du plan (`v2-paris-plan`, plus de 300 paris).
describe('§9.13 bis — la version des règles du moteur (49-U6)', () => {
  test('le module et sa version vivent à côté de la règle', () => {
    expect(Moteur.MODULE_CONSIGNE).toBe('moteur.consigne');
    // 1 jusqu'à 49-U5 exclu ; 2 depuis 49-U5 (reprise mesurée, une seule
    // montée par bloc) ; 3 depuis 49-U8 (une séance sans charge répétée prend
    // sa plus lourde charge tenue dans la zone, MOTEUR §7.6). Écrite dans la
    // colonne `predictions.module_version`.
    // 4 depuis 49-U12 (la chute de fin de séance ne tire plus le niveau et
    // bloque le test suivant, MOTEUR §9.2 bis).
    // 5 depuis 49-U18 (delta 49-36 : l'écart habituel sur les 8 derniers
    // écarts, les reprises bornées à la zone, la charge plus lourde sur 12
    // mois hors barre).
    // 6 depuis 50-1 (MOTEUR §9.17 : le poids du corps suit la consigne des
    // charges, la charge valant 0 ; la carte du lest, l'étirement, l'aide).
    // 7 depuis 51-3 (MOTEUR §9.20 : une séance marquée « douleur » est neutre).
    // 8 depuis 53-1 (MOTEUR §9.10 : la charge se reporte au changement de zone) ;
    // 9 depuis 54-1 (MOTEUR §12.2 bis : la zone d’une séance se lit à sa fin).
    expect(Moteur.VERSION_CONSIGNE).toBe(9);
  });
});

// ── L'IDENTIFIANT (48c-2) ───────────────────────────────────────────────────
//
// Le 21/09, la première séance réelle a écrit le squat DEUX FOIS : six lignes,
// même `emise_a` à la milliseconde. Deux réalités JavaScript dont les lectures
// du magasin local ont précédé les écritures — une course qu'aucune garde en
// mémoire ne ferme. Ce qui la ferme est à destination : le même triplet donne
// le même identifiant, et l'insertion qui ignore les doublons fait du second
// envoi un non-événement.
describe('§9.11 — l’identifiant d’une prédiction est calculé, pas tiré', () => {
  const UUID5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  // ⚠️ jsdom NE FOURNIT NI `crypto.subtle` NI `TextEncoder` sur `window` ; un
  // navigateur, si — et le banc tourne sur `localhost`, contexte sécurisé. On
  // les pose donc ici, et ce sont les MÊMES API (la WebCrypto de Node), pas
  // une imitation. Sans elles, ce bloc ne mesurerait que le repli, c'est-à-dire
  // rien de ce que le correctif apporte.
  const vraiCrypto = window.crypto;
  beforeAll(() => {
    if (!window.crypto || !window.crypto.subtle) {
      Object.defineProperty(window, 'crypto',
        { value: require('crypto').webcrypto, configurable: true });
    }
    if (typeof window.TextEncoder !== 'function') {
      window.TextEncoder = require('util').TextEncoder;
    }
  });
  afterAll(() => {
    Object.defineProperty(window, 'crypto', { value: vraiCrypto, configurable: true });
  });

  test('DISCRIMINANT — même séance, même exercice, même rang : MÊME identifiant', () => {
    return Promise.all([
      Moteur.idDePrediction('s-1', 'squat-barre', 1),
      Moteur.idDePrediction('s-1', 'squat-barre', 1)
    ]).then(([a, b]) => { expect(a).toBe(b); expect(a).toMatch(UUID5); });
  });

  test('DISCRIMINANT — un rang différent donne un AUTRE identifiant', () => {
    return Promise.all([1, 2, 3].map((r) => Moteur.idDePrediction('s-1', 'squat-barre', r)))
      .then((l) => { expect(new Set(l).size).toBe(3); l.forEach((x) => expect(x).toMatch(UUID5)); });
  });

  test('et un autre exercice, ou une autre séance, aussi', () => {
    return Promise.all([
      Moteur.idDePrediction('s-1', 'squat-barre', 1),
      Moteur.idDePrediction('s-1', 'presse-cuisses', 1),
      Moteur.idDePrediction('s-2', 'squat-barre', 1)
    ]).then((l) => expect(new Set(l).size).toBe(3));
  });

  test('DISCRIMINANT — les trois faits ne se confondent pas entre eux', () => {
    // Un séparateur oublié ferait de ('ab', 'c') et ('a', 'bc') le même nom,
    // donc le même identifiant — et deux prédictions s'écraseraient.
    return Promise.all([
      Moteur.idDePrediction('ab', 'c', 1),
      Moteur.idDePrediction('a', 'bc', 1)
    ]).then(([a, b]) => expect(a).not.toBe(b));
  });

  // ⚠️ LA VALEUR, PAS SEULEMENT DES ÉGALITÉS (49-R1). Les tests ci-dessus
  // passeraient encore si la formule changeait — ils ne comparent que des
  // identifiants entre eux. Celui-ci fige le NOMBRE, calculé sur le code
  // d'avant les révisions : c'est lui qui garde « la révision 0 ne change
  // pas » (MOTEUR §9.11). Un identifiant déjà en base qui changerait ferait
  // noter deux fois le même pari.
  test('DISCRIMINANT — la valeur de la révision 0 est figée', () => {
    return Moteur.idDePrediction('00000000-0000-4000-8000-000000000049', 'squat_barre', 2)
      .then((x) => expect(x).toBe('b9b7a693-794e-5b79-86f6-8194e29043ee'));
  });

  test('la révision 0 — passée, nulle ou absente — garde la formule à trois faits', () => {
    const args = ['00000000-0000-4000-8000-000000000049', 'squat_barre', 2];
    return Promise.all([undefined, null, 0].map((r) => Moteur.idDePrediction(...args, r)))
      .then((l) => l.forEach((x) => expect(x).toBe('b9b7a693-794e-5b79-86f6-8194e29043ee')));
  });

  test('DISCRIMINANT — une révision 1 : un AUTRE identifiant, stable, au format UUID', () => {
    const args = ['00000000-0000-4000-8000-000000000049', 'squat_barre', 2];
    return Promise.all([
      Moteur.idDePrediction(...args, 1),
      Moteur.idDePrediction(...args, 1),
      Moteur.idDePrediction(...args, 2)
    ]).then(([a, b, c]) => {
      expect(a).toMatch(UUID5);
      expect(a).toBe(b);
      expect(a).not.toBe('b9b7a693-794e-5b79-86f6-8194e29043ee');
      expect(c).not.toBe(a);
    });
  });

  test('sans `crypto.subtle`, il rend null — et l’appelant retombe sur l’aléatoire', () => {
    const pose = window.crypto;
    Object.defineProperty(window, 'crypto', { value: {}, configurable: true });
    return Moteur.idDePrediction('s-1', 'squat-barre', 1)
      .then((x) => expect(x).toBeNull())
      .finally(() => Object.defineProperty(window, 'crypto',
        { value: pose, configurable: true }));
  });
});

// ── L'OBSERVATION (48c-2) ───────────────────────────────────────────────────
describe('§9.11 — l’observation relie toujours, ne compte que si c’est suivi', () => {
  const PROPOSE = { rang: 3, charge: 130, palier: 125 };
  // « Le cran au-dessus », sans chiffre : le cran de la machine est inconnu.
  const INCONNUE = { rang: 3, charge: null, palier: 125 };
  const fait = (charge, reps, id) => ({ enBase: true, id: id || 'set-1', charge: charge, reps: reps });

  test('consigne SUIVIE : la série est reliée, ses reps comptent', () => {
    expect(Moteur.observationDe(PROPOSE, fait(130, 4)))
      .toEqual({ set_observe: 'set-1', valeur_observee: 4 });
  });

  test('DISCRIMINANT — AUTRE CHOSE TENTÉ : la série est reliée, ses reps NE comptent PAS', () => {
    // C'est la remarque qui a ouvert 48c-2 : une exploration dit quelque chose,
    // elle ne doit pas disparaître de la table. Mais comparer « vise 4 à 130 »
    // à « 3 à 135 » ne dirait rien de la visée du moteur.
    expect(Moteur.observationDe(PROPOSE, fait(135, 3)))
      .toEqual({ set_observe: 'set-1', valeur_observee: null });
    expect(Moteur.observationDe(PROPOSE, fait(125, 6)))
      .toEqual({ set_observe: 'set-1', valeur_observee: null });
  });

  test('RIEN FAIT à ce rang : ni série, ni reps', () => {
    expect(Moteur.observationDe(PROPOSE, { enBase: false, id: 'set-1', charge: 130, reps: 4 }))
      .toEqual({ set_observe: null, valeur_observee: null });
  });

  test('DISCRIMINANT — charge proposée INCONNUE : au-dessus du palier, ça compte', () => {
    // Le cas de l'adduction, le 21/09 : sans cette branche, la ligne ne
    // pouvait JAMAIS être observée, quoi qu'on fasse.
    expect(Moteur.observationDe(INCONNUE, fait(130, 8)))
      .toEqual({ set_observe: 'set-1', valeur_observee: 8 });
  });

  test('DISCRIMINANT — et STRICTEMENT au-dessus : au palier, ça ne compte pas', () => {
    // Au palier, on n'a pas monté d'un cran : la consigne n'est pas suivie.
    expect(Moteur.observationDe(INCONNUE, fait(125, 8)))
      .toEqual({ set_observe: 'set-1', valeur_observee: null });
    expect(Moteur.observationDe(INCONNUE, fait(120, 8)))
      .toEqual({ set_observe: 'set-1', valeur_observee: null });
  });

  test('sans palier connu non plus, on relie sans compter', () => {
    expect(Moteur.observationDe({ rang: 1, charge: null, palier: null }, fait(130, 5)))
      .toEqual({ set_observe: 'set-1', valeur_observee: null });
  });

  test('une série sans reps comptables est reliée, sans valeur', () => {
    expect(Moteur.observationDe(PROPOSE, fait(130, null)))
      .toEqual({ set_observe: 'set-1', valeur_observee: null });
  });
});

// ── LA COUVERTURE, ET SES RANGS ─────────────────────────────────────────────
describe('§9.13 — la couverture dit quelle ligne porte quel rang', () => {
  const s = (type) => ({ id: 'x', type_serie: type || 'travail', charge_kg: null, reps: null });
  const series = (n, type) => Array.from({ length: n }, () => s(type));
  const L = { charge: 125, vise: 5 }, H = { charge: 130, vise: 4, k: 1 };
  const consigne = (n, ligne, haut) => ({ etat: 'x', n: n, ligne: ligne, haut: haut });
  const rangs = (c) => c.map((x) => (x ? x.rang : null));

  test('trois séries, consigne sur trois : les rangs 1, 2, 3', () => {
    expect(rangs(Seance.couvertureDe(series(3), consigne(3, L, H)))).toEqual([1, 2, 3]);
  });

  test('DISCRIMINANT — moins de séries que n : les rangs 1 et 2, le test reste le dernier (49-C)', () => {
    // Deux séries pour une consigne sur trois (§9.13 et §9.11, révisés le
    // 26/09/2026). Les paris s'écrivent à la validation de chaque série, avec
    // le rang qu'elle porte : il n'y a plus de pari pour une série qui
    // n'existe pas, donc plus rien à aligner par la fin. Avant 49-C : les rangs
    // 2 et 3, et le pari du rang 1 restait orphelin.
    expect(rangs(Seance.couvertureDe(series(2), consigne(3, L, H)))).toEqual([1, 2]);
    expect(Seance.couvertureDe(series(2), consigne(3, L, H))[1].charge_kg).toBe(130);
  });

  test('les chauffes ne portent aucun rang, et ne décalent pas les autres', () => {
    const c = Seance.couvertureDe(series(2, 'echauffement').concat(series(3)), consigne(3, L, H));
    expect(rangs(c)).toEqual([null, null, 1, 2, 3]);
  });

  test('plus de séries que n : toutes portent un rang (49-C)', () => {
    // §9.13 (26/09/2026) — la séance en cours fait foi. Avant 49-C :
    // [null, 1, 2, 3], la première série hors consigne.
    expect(rangs(Seance.couvertureDe(series(4), consigne(3, L, H)))).toEqual([1, 2, 3, 4]);
  });

  test('le plan garde sa forme : la couverture ne la lui impose pas', () => {
    // `planDe` se lit encore comme avant — c'est le fantôme qui le consomme.
    expect(Seance.planDe(series(3), consigne(3, L, H))).toEqual([
      { charge_kg: 125, reps: 5 }, { charge_kg: 125, reps: 5 }, { charge_kg: 130, reps: 4 }]);
  });
});

// ── LA FILE : LA DÉPENDANCE DÉCLARÉE ────────────────────────────────────────
describe('48c — `depend` : une prédiction ne double jamais ses séries', () => {
  // ⚠️ CONFIGURATION DISCRIMINANTE : la prédiction est posée APRÈS les séries,
  // donc son `seq` est déjà plus grand. `seq` suffit tant que rien n'est
  // bloqué — et ne suffit plus dès que quelque chose l'est, parce que
  // `prochaine` sautait l'entrée bloquée et rendait la suivante. C'est le
  // blocage, et lui seul, qui sépare les deux lectures.
  const file = () => {
    let f = Attente.poser([], { table: Attente.SETS, op: Attente.REMPLACER, id: 's1', donnees: [] });
    f = Attente.poser(f, { table: Attente.PREDICTIONS, op: Attente.OBSERVER,
                           id: 'p1', depend: 's1', donnees: { id: 'p1' } });
    return f;
  };

  test('sans blocage, l’ordre est celui de la pose : les séries d’abord', () => {
    expect(Attente.prochaine(file()).cle).toBe('sets:s1');
  });

  test('DISCRIMINANT — les séries bloquées RETIENNENT la prédiction', () => {
    // Sans `depend`, `prochaine` rendrait `predictions:p1` : elle monterait,
    // et `set_observe` échouerait en 23503 — définitif, donc bloqué à jamais.
    const f = Attente.marquerEchec(file(), 'sets:s1', { code: '23505' });
    expect(Attente.prochaine(f)).toBeNull();
  });

  test('les séries réparées, la prédiction part — et APRÈS elles', () => {
    let f = Attente.marquerEchec(file(), 'sets:s1', { code: '23505' });
    expect(Attente.prochaine(f)).toBeNull();
    // Réparer = reposer l'intention : `poser` remet `bloquee` à null.
    f = Attente.poser(f, { table: Attente.SETS, op: Attente.REMPLACER, id: 's1', donnees: [] });
    expect(Attente.prochaine(f).cle).toBe('sets:s1');
    f = Attente.retirer(f, 'sets:s1', 2);
    expect(Attente.prochaine(f).cle).toBe('predictions:p1');
  });

  test('DISCRIMINANT — la retenue se PROPAGE d’un maillon au suivant', () => {
    // Une prédiction retenue doit retenir à son tour ce qui dépend d'elle :
    // sans ça, la chaîne se romprait au deuxième maillon.
    let f = Attente.marquerEchec(file(), 'sets:s1', { code: '23505' });
    f = Attente.poser(f, { table: Attente.PREDICTIONS, op: Attente.UPSERT,
                           id: 'p2', depend: 'p1', donnees: { id: 'p2' } });
    expect(Attente.prochaine(f)).toBeNull();
  });

  test('une entrée d’une AUTRE séance ne se laisse pas retenir', () => {
    let f = Attente.marquerEchec(file(), 'sets:s1', { code: '23505' });
    f = Attente.poser(f, { table: Attente.PREDICTIONS, op: Attente.UPSERT,
                           id: 'p9', depend: 's2', donnees: { id: 'p9' } });
    expect(Attente.prochaine(f).cle).toBe('predictions:p9');
  });

  test('la compression garde la dépendance, et la position', () => {
    let f = file();
    f = Attente.poser(f, { table: Attente.PREDICTIONS, op: Attente.OBSERVER,
                           id: 'p1', depend: 's1', donnees: { id: 'p1', valeur_observee: 4 } });
    expect(f).toHaveLength(2);
    const p = f.filter((e) => e.cle === 'predictions:p1')[0];
    expect([p.depend, p.donnees.valeur_observee, p.seq]).toEqual(['s1', 4, 2]);
  });
});
