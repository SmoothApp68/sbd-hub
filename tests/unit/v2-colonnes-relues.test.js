//
// Chantier 34 — les colonnes écrites mais jamais relues.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : une série IMPORTÉE,
// c'est-à-dire `validee_a` NULL **et** `source <> 'app'`.
//
// C'est la seule forme qui sépare « validée » de « doit exister en base ».
// Avec un `validee_a` renseigné — la fixture qu'utilisaient tous les tests
// d'avant — les deux prédicats rendent la même chose, et rien ne se voit.
// C'est très exactement ce qui a laissé passer la perte du corpus entier :
// 28 103 séries, toutes à `validee_a` NULL, que `lignes()` écartait.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/modele.js` se termine
// par `this`, que Babel remplace par `undefined` sous l'environnement node.

const Seance = require('../../v2/js/seance.js');
const Modele = require('../../v2/js/modele.js');
const { progTravail } = require('./aide-routine-programmee.js');

let n = 0;
const uuid = () => 'id-' + (++n);
beforeEach(() => { n = 0; });

const CATALOGUE = [
  { slug: 'squat', nom: 'Squat', mesure: 'charge_reps', charge: 'absolue', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'dc', nom: 'DC', mesure: 'charge_reps', charge: 'absolue', muscles_primaires: ['pectoraux'], muscles_secondaires: [] }
];

const SESSION = {
  id: 'sess-imp', user_id: 'u-1', titre: 'Séance importée',
  debut: '2026-09-01T17:00:00.000Z', fin: '2026-09-01T18:00:00.000Z',
  statut: 'terminee', salle: null, note: null, routine_id: null, source: 'hevy'
};

// Une ligne TELLE QUE LA BASE LA PORTE : pas de `validee_a`, une `source`
// d'import, un `ressenti` et un `repos_s` renseignés.
const importee = (o) => Object.assign({
  id: 'l' + o.rang, session_id: 'sess-imp', user_id: 'u-1',
  type_serie: 'travail', charge_kg: 100, reps: 5, duree_s: null, distance_m: null,
  rpe: null, ressenti: 'reste_2', note: null, groupe_superset: 1,
  validee_a: null, repos_s: 120, source: 'hevy'
}, o);

// Entrelacée en base : squat@1, dc@2, squat@3, dc@4.
const LIGNES = [
  importee({ rang: 1, exercise_slug: 'squat' }),
  importee({ rang: 2, exercise_slug: 'dc', charge_kg: 60 }),
  importee({ rang: 3, exercise_slug: 'squat', charge_kg: 105 }),
  importee({ rang: 4, exercise_slug: 'dc', charge_kg: 62.5 })
];

const rouvrir = (lignes) =>
  Seance.reprendre(SESSION, Modele.construireBlocs(lignes || LIGNES, CATALOGUE));

describe('1-2. corriger une séance importée n’efface rien', () => {
  // LE DÉFAUT : `lignes()` filtrait sur `validee_a`, donc rendait [] ;
  // `remplacerSeries` lit « absent de la liste » comme « supprimé ».
  test('les quatre séries ressortent — la liste n’est PAS vide', () => {
    const sorties = Seance.lignes(rouvrir());
    expect(sorties).toHaveLength(4);
    expect(sorties.map((l) => l.id).sort()).toEqual(['l1', 'l2', 'l3', 'l4']);
  });

  test('ouvrir puis enregistrer sans rien changer est un NO-OP sur les données', () => {
    const sorties = Seance.lignes(rouvrir());
    LIGNES.forEach((avant) => {
      const apres = sorties.filter((l) => l.id === avant.id)[0];
      ['charge_kg', 'reps', 'rang', 'exercise_slug', 'validee_a',
       'ressenti', 'repos_s', 'source', 'user_id', 'groupe_superset'].forEach((c) => {
        expect([c, apres[c]]).toEqual([c, avant[c]]);
      });
    });
  });

  test('modifier UNE charge ne touche que cette série', () => {
    let s = rouvrir();
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 110 });
    const sorties = Seance.lignes(s);
    expect(sorties).toHaveLength(4);
    expect(sorties.filter((l) => l.id === 'l1')[0].charge_kg).toBe(110);
    expect(sorties.filter((l) => l.id === 'l3')[0].charge_kg).toBe(105);
    expect(sorties.filter((l) => l.id === 'l2')[0].charge_kg).toBe(60);
  });

  // ⚠️ LA PROVENANCE NE SE RÉÉCRIT PAS. La repasser en 'app' exigerait un
  // `validee_a` (`sets_validee_si_saisie`) : 23514, définitif, file bloquée.
  test('`source` reste celle de l’import, même après modification', () => {
    let s = Seance.modifierSerie(rouvrir(), 0, 0, { charge_kg: 110 });
    expect(Seance.lignes(s).every((l) => l.source === 'hevy')).toBe(true);
  });
});

describe('3-4. les colonnes qui disparaissaient', () => {
  test('`user_id` traverse l’aller-retour', () => {
    expect(Seance.lignes(rouvrir()).every((l) => l.user_id === 'u-1')).toBe(true);
  });

  test('`ressenti` et `repos_s` traversent l’aller-retour', () => {
    const sorties = Seance.lignes(rouvrir());
    expect(sorties.every((l) => l.ressenti === 'reste_2')).toBe(true);
    expect(sorties.every((l) => l.repos_s === 120)).toBe(true);
  });

  // La preuve que le défaut venait de la LECTURE : une ligne à qui il manque
  // ces colonnes (un cache écrit par la version d'avant) les perd.
  test('une ligne relue SANS ces colonnes les rend nulles — le cache périmé', () => {
    const amputees = LIGNES.map((l) => {
      const c = Object.assign({}, l);
      delete c.user_id; delete c.ressenti; delete c.repos_s;
      return c;
    });
    const sorties = Seance.lignes(rouvrir(amputees));
    expect(sorties.every((l) => l.ressenti === null)).toBe(true);
    expect(sorties.every((l) => l.repos_s === null)).toBe(true);
  });
});

describe('les rangs d’origine', () => {
  test('une séance intacte garde ses rangs entrelacés', () => {
    expect(Seance.lignes(rouvrir()).map((l) => l.rang)).toEqual([1, 3, 2, 4]);
  });

  // ⚠️ LA CONFIGURATION QUI SÉPARE « on garde » DE « on renumérote » : des
  // rangs d'origine EN DOUBLE. Sans elle, supprimer le contrôle d'unicité ne
  // fait tomber aucun test — et `sets_rang_unique` rendrait 23505, définitif.
  test('des rangs d’origine EN DOUBLE font renuméroter', () => {
    const doubles = LIGNES.map((l) => Object.assign({}, l, { rang: 2 }));
    const rangs = Seance.lignes(rouvrir(doubles)).map((l) => l.rang);
    expect(new Set(rangs).size).toBe(rangs.length);
    expect(rangs.every((r) => r >= 1)).toBe(true);
  });

  test('les rangs restent uniques et ≥ 1 dans tous les cas', () => {
    [LIGNES, LIGNES.slice(0, 3),
     LIGNES.map((l, i) => Object.assign({}, l, { rang: i * 7 + 1 })),
     LIGNES.map((l) => Object.assign({}, l, { rang: 2 })),
     LIGNES.map((l) => Object.assign({}, l, { rang: 0 }))]
      .forEach((jeu) => {
        const rangs = Seance.lignes(rouvrir(jeu)).map((l) => l.rang);
        expect(new Set(rangs).size).toBe(rangs.length);
        expect(rangs.every((r) => r >= 1)).toBe(true);
      });
  });

  test('une série AJOUTÉE fait renuméroter proprement', () => {
    let s = Seance.ajouterSerie(rouvrir(), 0, uuid());
    s = Seance.valider(s, 0, 2, new Date('2026-09-02T10:00:00Z'));
    const rangs = Seance.lignes(s).map((l) => l.rang);
    expect(new Set(rangs).size).toBe(rangs.length);
    expect(rangs.every((r) => r >= 1)).toBe(true);
  });
});

describe('5. l’écart entre les deux listes est détecté, pas silencieux', () => {
  test('`verifierColonnes` passe sur le code en place', () => {
    expect(Seance.verifierColonnes()).toBe(true);
  });

  // ⚠️ CE TEST EST LA GARDE DE LA GARDE. Sans lui, `verifierColonnes` pourrait
  // rendre `true` sans rien comparer — une garantie apparente de plus.
  test('la déclaration couvre EXACTEMENT ce que `lignes()` émet', () => {
    const emises = Object.keys(Seance.lignes(rouvrir())[0]);
    expect(emises.slice().sort()).toEqual(Seance.COLONNES_SET.slice().sort());
  });

  test('la déclaration couvre EXACTEMENT ce que `ligneSession()` émet', () => {
    const emises = Object.keys(Seance.ligneSession(rouvrir()));
    expect(emises.slice().sort()).toEqual(Seance.COLONNES_SESSION.slice().sort());
  });

  // ⚠️ ÉPROUVER LA VÉRIFICATION SUR UN VRAI ÉCART. Un contrôle qu'on ne teste
  // que sur du code juste ne prouve pas qu'il sait refuser.
  test('le comparateur voit une colonne ÉCRITE et non déclarée', () => {
    const e = Seance.ecartDeColonnes('sets', ['id', 'surprise'], ['id']);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/surprise.*ÉCRITE et non déclarée/);
  });

  test('le comparateur voit une colonne DÉCLARÉE et jamais écrite', () => {
    const e = Seance.ecartDeColonnes('sets', ['id'], ['id', 'repos_s']);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/repos_s.*déclarée et jamais écrite/);
  });

  test('il ne dit rien quand les deux listes concordent', () => {
    expect(Seance.ecartDeColonnes('sets', ['a', 'b'], ['b', 'a'])).toEqual([]);
  });

  test('les colonnes lues en plus ne recoupent jamais les colonnes écrites', () => {
    Seance.COLONNES_SET_EN_PLUS.forEach((c) => expect(Seance.COLONNES_SET).not.toContain(c));
    Seance.COLONNES_SESSION_EN_PLUS.forEach((c) => expect(Seance.COLONNES_SESSION).not.toContain(c));
  });

  // Les deux colonnes GÉNÉRÉES ne doivent JAMAIS être écrites : Postgres
  // refuse toute valeur, même la bonne, même NULL.
  test('aucune colonne GÉNÉRÉE n’est déclarée en écriture', () => {
    expect(Seance.COLONNES_SET).not.toContain('elastique_norme');
    expect(Seance.COLONNES_SESSION).not.toContain('salle_norme');
  });
});

describe('6. trois séries créées avec une chaîne', () => {
  const routine = { id: 'r', nom: 'R', exercices: [
    { id: 're', exercise_slug: 'squat', series: progTravail(3, 5),
      repos_cible_s: null, groupe_superset: null, note: null }] };
  const idsDe = (s) => s.exercices.reduce((a, e) => a.concat(e.series.map((x) => x.id)), []);

  // LE DÉFAUT D4 : `serieVide` rend la chaîne telle quelle, donc N séries
  // créées en boucle avec la MÊME chaîne portent le MÊME identifiant.
  test('la garde de sortie refuse deux séries de même identifiant', () => {
    let s = Seance.creer({ id: 's', userId: 'u', titre: 'T', routine, idSerie: uuid() });
    s = Seance.valider(s, 0, 0, new Date());
    s = Seance.valider(s, 0, 1, new Date());
    expect(idsDe(s)[0]).toBe(idsDe(s)[1]);          // la fixture déclenche bien le chemin
    expect(() => Seance.lignes(s)).toThrow(/même identifiant/);
  });

  test('le message nomme l’identifiant fautif', () => {
    let s = Seance.creer({ id: 's', userId: 'u', titre: 'T', routine, idSerie: 'fixe' });
    s = Seance.valider(s, 0, 0, new Date());
    s = Seance.valider(s, 0, 1, new Date());
    expect(() => Seance.lignes(s)).toThrow(/fixe/);
  });

  test('avec une FONCTION, trois identifiants distincts et la garde se tait', () => {
    let s = Seance.creer({ id: 's', userId: 'u', titre: 'T', routine, idSerie: uuid });
    s = Seance.valider(s, 0, 0, new Date());
    s = Seance.valider(s, 0, 1, new Date());
    s = Seance.valider(s, 0, 2, new Date());
    expect(new Set(idsDe(s)).size).toBe(3);
    expect(() => Seance.lignes(s)).not.toThrow();
  });
});

describe('le prédicat `partEnBase`, cas par cas', () => {
  const cas = [
    ['validée, saisie dans l’app', { validee_a: 'v', source: 'app' }, true],
    ['validée, sans source connue', { validee_a: 'v' }, true],
    ['importée, jamais validée', { validee_a: null, source: 'hevy' }, true],
    ['importée d’un autre canal', { validee_a: null, source: 'import' }, true],
    ['collée', { validee_a: null, source: 'collage' }, true],
    ['case vide jamais validée', { validee_a: null }, false],
    ['case vide, source app (ajoutée à la main)', { validee_a: null, source: 'app' }, false],
    ['source vide', { validee_a: null, source: '' }, false],
    ['rien du tout', null, false]
  ];
  cas.forEach(([nom, serie, attendu]) => {
    test(nom + ' → ' + (attendu ? 'part en base' : 'reste dehors'), () => {
      expect(Seance.partEnBase(serie)).toBe(attendu);
    });
  });

  // ⚠️ LA CONTRAINTE QUE LE PRÉDICAT NE DOIT JAMAIS VIOLER :
  // `sets_validee_si_saisie` — source <> 'app' OR validee_a IS NOT NULL.
  test('aucune ligne émise ne viole `sets_validee_si_saisie`', () => {
    const melange = LIGNES.concat([
      importee({ rang: 5, exercise_slug: 'squat', source: 'app', validee_a: '2026-09-01T17:40:00.000Z' })
    ]);
    Seance.lignes(rouvrir(melange)).forEach((l) => {
      expect(l.source !== 'app' || l.validee_a !== null).toBe(true);
    });
  });
});

describe('la garde du cache périmé', () => {
  const avecSource = [{ id: 'a', source: 'hevy' }, { id: 'b', source: 'app' }];
  test('un cache complet ne bloque rien', () => {
    expect(Seance.provenanceIncomplete(avecSource)).toBe(false);
  });
  test('UNE seule ligne sans provenance suffit à bloquer', () => {
    expect(Seance.provenanceIncomplete(avecSource.concat([{ id: 'c' }]))).toBe(true);
  });
  // `source: null` est une provenance CONNUE (une ligne saisie dans l'app en
  // porte une) ; c'est `undefined` — la colonne jamais relue — qui alerte.
  test('`source: null` n’est pas une provenance manquante', () => {
    expect(Seance.provenanceIncomplete([{ id: 'a', source: null }])).toBe(false);
  });
  test('une séance sans aucune série ne bloque pas', () => {
    expect(Seance.provenanceIncomplete([])).toBe(false);
    expect(Seance.provenanceIncomplete(null)).toBe(false);
  });
});

describe('13. le cache d’un appareil déjà à jour doit redescendre', () => {
  const Sync = require('../../v2/js/sync.js');
  // ⚠️ La liste des colonnes LUES s'est élargie : un appareil marqué à
  // l'ancienne version porte un cache SANS `source`, et son curseur
  // incrémental est au maximum. Sans incrément de `VERSION_SYNC`, ces lignes
  // ne redescendraient jamais — et la première correction les perdrait.
  test('une marque à l’ancienne version déclenche une passe complète', () => {
    expect(Sync.doitResynchroniser({ version: 3 })).toBe(true);
  });
  test('une marque à la version courante ne la déclenche pas', () => {
    expect(Sync.doitResynchroniser({ version: Sync.VERSION_SYNC })).toBe(false);
  });
  test('aucune marque du tout déclenche aussi', () => {
    expect(Sync.doitResynchroniser(null)).toBe(true);
  });
});

// ⚠️ LE POINT DE JONCTION : `donnees.js` CONSTRUIT son `select` depuis les
// déclarations de `seance.js`. C'est ce qui rend l'écart impossible plutôt que
// corrigé — et c'est donc ce qu'il faut épingler, sinon une liste recopiée à
// la main pourrait revenir sans qu'aucun test ne bronche. C'était exactement
// l'état d'avant ce chantier.
describe('12. la liste de lecture est DÉRIVÉE, jamais recopiée', () => {
  let requetes;
  const clientFactice = () => ({
    from(table) {
      const q = { table, colonnes: null };
      requetes.push(q);
      const c = {
        select(colonnes, options) {
          q.colonnes = colonnes;
          if (options && options.head) q.tete = true;
          return c;
        },
        eq() { return c; }, gt() { return c; }, or() { return c; },
        order() { return c; }, limit() { return c; },
        // `monProfil` termine par là : sans elle, la lecture du profil ne
        // pouvait pas être exercée du tout.
        maybeSingle() { return c; },
        then(res, rej) { return Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej); }
      };
      return c;
    }
  });

  beforeEach(() => { requetes = []; });
  afterEach(() => { delete globalThis.THClient; });

  function charger() {
    globalThis.THSeance = Seance;
    globalThis.THClient = { obtenir: clientFactice };
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
    return require('../../v2/js/donnees.js');
  }

  test('le `select` des séries demande TOUTES les colonnes écrites', async () => {
    const Donnees = charger();
    await Donnees.seriesDepuis(null);
    const demandees = requetes[0].colonnes.split(',').map((c) => c.trim());
    Seance.COLONNES_SET.forEach((c) => expect(demandees).toContain(c));
    Seance.COLONNES_SET_EN_PLUS.forEach((c) => expect(demandees).toContain(c));
  });

  test('le `select` des séances demande TOUTES les colonnes écrites', async () => {
    const Donnees = charger();
    await Donnees.toutesLesSeances();
    const demandees = requetes[0].colonnes.split(',').map((c) => c.trim());
    Seance.COLONNES_SESSION.forEach((c) => expect(demandees).toContain(c));
    Seance.COLONNES_SESSION_EN_PLUS.forEach((c) => expect(demandees).toContain(c));
  });

  // Les trois colonnes que la liste recopiée oubliait, nommément.
  test('`user_id`, `ressenti` et `repos_s` y sont — les trois oubliées', async () => {
    const Donnees = charger();
    await Donnees.seriesDepuis(null);
    ['user_id', 'ressenti', 'repos_s', 'source'].forEach((c) =>
      expect(requetes[0].colonnes).toContain(c));
  });

  // ⚠️ `equipement` — LA COLONNE QUE LE MOTEUR ALLAIT LIRE SANS L'AVOIR DEMANDÉE
  // (48b-3). Elle existe en base et elle est renseignée pour les 237 exercices,
  // mais PostgREST ne renvoie QUE ce qu'on nomme : sans elle dans ce `select`,
  // le repli du §10.2 lisait `undefined` sur chaque exercice et se taisait
  // partout, en silence, sans une erreur. Même piège que `routines.rang` au
  // chantier 46 — d'où ce test, écrit AVANT la colonne.
  // ⚠️ `rythme_progression` — MÊME PIÈGE QUE `equipement` (48b-4). La colonne
  // existe depuis `v2_046` avec un défaut `normal`, mais PostgREST ne renvoie
  // que ce qu'on nomme : omise ici, le réglage de rythme serait toujours lu
  // `undefined`, donc toujours affiché « Normal », et le choix de l'utilisateur
  // disparaîtrait à chaque rechargement sans qu'une seule erreur le dise.
  // 49-U11 — même piège pour la phase (`v2_051`) : omise, elle serait lue
  // vide, donc « maintien », et « Depuis le … » ne s'afficherait jamais.
  test('le `select` du profil demande `phase` et `phase_depuis`', async () => {
    const Donnees = charger();
    await Donnees.monProfil('u-1');
    const demandees = requetes[0].colonnes.split(',').map((c) => c.trim());
    expect(demandees).toEqual(expect.arrayContaining(['phase', 'phase_depuis']));
  });

  test('le `select` du profil demande `rythme_progression` — le réglage en dépend', async () => {
    const Donnees = charger();
    await Donnees.monProfil('u-1');
    const demandees = requetes[0].colonnes.split(',').map((c) => c.trim());
    expect(demandees).toContain('rythme_progression');
    // Et les colonnes déjà lues n'ont pas bougé au passage.
    ['id', 'username', 'intention', 'seances_par_semaine', 'onboarding_completed']
      .forEach((c) => expect(demandees).toContain(c));
  });

  test('le `select` du catalogue demande `equipement` — le repli du §10.2 en dépend', async () => {
    const Donnees = charger();
    await Donnees.tousLesExercices();
    const demandees = requetes[0].colonnes.split(',').map((c) => c.trim());
    expect(demandees).toContain('equipement');
    // Et les colonnes déjà lues n'ont pas bougé au passage.
    ['slug', 'nom', 'mesure', 'charge', 'muscles_primaires', 'muscles_secondaires']
      .forEach((c) => expect(demandees).toContain(c));
  });
});
