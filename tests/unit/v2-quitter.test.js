/** @jest-environment node */
//
// 59-2 — « QUITTER » NE PERD PLUS RIEN EN SILENCE, ET N'OUBLIE RIEN SUR
// L'APPAREIL.
//
//   1. La fenêtre : le texte de la maquette du 07/10/2026, mot pour mot, et le
//      nombre de SÉANCES distinctes de la file.
//   2. L'enchaînement (`THQuitter.quitter`) : envoyer d'abord si le réseau est
//      là ; quitter sans rien demander si la file s'est vidée ; sinon la
//      fenêtre — et seul « Quitter quand même » vide la file.
//   3. Après « Quitter » : plus aucun magasin rempli, aucune clé `th-v2…`,
//      aucun jeton — même hors ligne.

global.self = global;
const Attente = require('../../v2/js/attente.js');
const Quitter = require('../../v2/js/quitter.js');

// ── Une file de papier ──────────────────────────────────────────────────────
const seance = (id) => [
  { table: Attente.SESSIONS, op: Attente.UPSERT, id: id, donnees: {} },
  { table: Attente.SETS, op: Attente.REMPLACER, id: id, donnees: [] },
  { table: Attente.RECORDS, op: Attente.AJOUTER, id: id, depend: id, donnees: [] }
];
const file = (ops) => ops.reduce((f, op) => Attente.poser(f, op), []);

describe('59-2 — la fenêtre : la maquette, mot pour mot', () => {
  test('deux séances (la séance, ses séries et son journal comptent pour une)', () => {
    const f = file(seance('A').concat(seance('B')));
    expect(Quitter.enAttente(f)).toEqual({ seances: 2, autres: 0 });
    expect(Quitter.fenetreDeSortie(f)).toEqual({
      titre: '2 séances pas encore envoyées.',
      aide: 'Si tu quittes maintenant, elles sont perdues.',
      rester: 'Rester', quitter: 'Quitter quand même'
    });
  });

  test('une séance : au singulier', () => {
    const f = file([{ table: Attente.SETS, op: Attente.REMPLACER, id: 'A', donnees: [] }]);
    const v = Quitter.fenetreDeSortie(f);
    expect(v.titre).toBe('1 séance pas encore envoyée.');
    expect(v.aide).toBe('Si tu quittes maintenant, elle est perdue.');
  });

  test('aucune séance, mais un choix fait hors ligne : la fenêtre le dit, sans nombre', () => {
    const f = file([{ table: Attente.ZONES, op: Attente.UPSERT, id: 'z1', donnees: {} }]);
    expect(Quitter.enAttente(f)).toEqual({ seances: 0, autres: 1 });
    expect(Quitter.fenetreDeSortie(f).titre).toBe('Des changements pas encore envoyés.');
  });

  test('une file vide : pas de fenêtre', () => {
    expect(Quitter.fenetreDeSortie([])).toBeNull();
    expect(Quitter.fenetreDeSortie(null)).toBeNull();
  });

  // ── 60-2c — UNE RÉPONSE DE PROFIL PAS ENCORE ENVOYÉE compte comme « un autre changement ».
  // Le profil ne passe pas par la file : son drapeau (`profilAEnvoyer`) est le seul témoin.
  test('⚠️ DISCRIMINANT — le profil en attente, file vide : un changement de plus, et la MÊME phrase', () => {
    expect(Quitter.enAttente([], true)).toEqual({ seances: 0, autres: 1 });
    expect(Quitter.fenetreDeSortie([], true)).toEqual({
      titre: 'Des changements pas encore envoyés.',
      aide: 'Si tu quittes maintenant, ils sont perdus.',
      rester: 'Rester', quitter: 'Quitter quand même'
    });
    // Le même résultat que pour un choix de zone fait hors ligne : une seule phrase.
    const zone = file([{ table: Attente.ZONES, op: Attente.UPSERT, id: 'z1', donnees: {} }]);
    expect(Quitter.fenetreDeSortie([], true)).toEqual(Quitter.fenetreDeSortie(zone));
  });

  test('sans profil en attente, rien ne change : un seul argument, ou `false`, ou `undefined`', () => {
    const f = file(seance('A').concat(seance('B')));
    expect(Quitter.enAttente(f)).toEqual({ seances: 2, autres: 0 });
    expect(Quitter.enAttente(f, false)).toEqual({ seances: 2, autres: 0 });
    expect(Quitter.enAttente(f, undefined)).toEqual({ seances: 2, autres: 0 });
    expect(Quitter.fenetreDeSortie([], false)).toBeNull();
    expect(Quitter.fenetreDeSortie([], undefined)).toBeNull();
  });

  test('le profil s’AJOUTE aux autres changements, et ne change pas le compte des séances', () => {
    const zone = file([{ table: Attente.ZONES, op: Attente.UPSERT, id: 'z1', donnees: {} }]);
    expect(Quitter.enAttente(zone, true)).toEqual({ seances: 0, autres: 2 });
    expect(Quitter.enAttente(file(seance('A')), true)).toEqual({ seances: 1, autres: 1 });
    // Séance + profil : la fenêtre parle des séances (la maquette ne prévoit pas de phrase mixte).
    expect(Quitter.fenetreDeSortie(file(seance('A')), true).titre).toBe('1 séance pas encore envoyée.');
  });

  test('aucun « bravo », aucun commentaire d’assiduité', () => {
    const v = Quitter.fenetreDeSortie(file(seance('A')));
    expect(JSON.stringify(v)).not.toMatch(/bravo|super|bien joué|assidu|!/i);
  });
});

describe('59-2 — l’enchaînement de « Quitter »', () => {
  // `etat.file` est la file de l'app ; `envoyer` la vide si le réseau « passe ».
  function scenario(o) {
    const etat = { file: o.file, envois: 0, fenetres: [], deconnexions: 0 };
    const d = {
      file: () => etat.file,
      enLigne: () => o.enLigne,
      envoyer: async () => { etat.envois++; if (o.envoiPasse) etat.file = []; },
      fenetre: async (vue) => { etat.fenetres.push(vue); return o.choix; },
      deconnecter: async () => { etat.deconnexions++; etat.file = []; }
    };
    return { etat, d };
  }

  test('rien n’attend : on quitte, sans envoi ni fenêtre', async () => {
    const { etat, d } = scenario({ file: [], enLigne: true });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([0, 0, 1]);
  });

  test('en ligne, l’envoi vide la file : on quitte, sans fenêtre', async () => {
    const { etat, d } = scenario({ file: file(seance('A')), enLigne: true, envoiPasse: true });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([1, 0, 1]);
  });

  test('⚠️ hors ligne, deux séances : la fenêtre ; « Rester » ne touche à rien', async () => {
    const f = file(seance('A').concat(seance('B')));
    const { etat, d } = scenario({ file: f, enLigne: false, choix: 'rester' });
    expect(await Quitter.quitter(d)).toBe('reste');
    expect(etat.envois).toBe(0);
    expect(etat.fenetres.map((v) => v.titre)).toEqual(['2 séances pas encore envoyées.']);
    expect(etat.deconnexions).toBe(0);
    expect(etat.file).toBe(f);          // la file intacte, la même
  });

  test('⚠️ en ligne mais l’envoi échoue : la fenêtre quand même', async () => {
    const { etat, d } = scenario({ file: file(seance('A')), enLigne: true, envoiPasse: false, choix: 'rester' });
    d.envoyer = async () => { etat.envois++; throw new Error('réseau'); };
    expect(await Quitter.quitter(d)).toBe('reste');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([1, 1, 0]);
  });

  test('« Quitter quand même » : alors seulement la file est vidée', async () => {
    const { etat, d } = scenario({ file: file(seance('A')), enLigne: false, choix: 'quitter' });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.fenetres.length, etat.deconnexions, etat.file.length]).toEqual([1, 1, 0]);
  });
});

describe('60-2c — l’enchaînement de « Quitter » compte la réponse de profil pas encore envoyée', () => {
  // `profil` : le drapeau de l'app (`profilAEnvoyer`). `envoyer` le baisse si le réseau « passe ».
  function scenario(o) {
    const etat = { file: o.file || [], profil: !!o.profil, envois: 0, fenetres: [], deconnexions: 0, lectures: [] };
    const d = {
      file: () => etat.file,
      enLigne: () => o.enLigne,
      envoyer: async () => {
        etat.envois++;
        if (o.lance) throw new Error('réseau');
        if (o.envoiPasse) { etat.file = []; etat.profil = false; }
      },
      fenetre: async (vue) => { etat.fenetres.push(vue); return o.choix; },
      deconnecter: async () => { etat.deconnexions++; etat.file = []; etat.profil = false; }
    };
    if (o.sansProfil !== true) d.profil = () => { etat.lectures.push(etat.envois); return etat.profil; };
    return { etat, d };
  }
  const TITRE = 'Des changements pas encore envoyés.';

  test('⚠️ DISCRIMINANT — profil seul, file vide, en ligne : l’envoi PART, il baisse le drapeau, on quitte sans fenêtre', async () => {
    const { etat, d } = scenario({ profil: true, enLigne: true, envoiPasse: true });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([1, 0, 1]);
  });

  test('⚠️ DISCRIMINANT — profil seul, hors ligne : aucun envoi, la fenêtre ; « Rester » ne perd rien', async () => {
    const { etat, d } = scenario({ profil: true, enLigne: false, choix: 'rester' });
    expect(await Quitter.quitter(d)).toBe('reste');
    expect(etat.envois).toBe(0);
    expect(etat.fenetres.map((v) => v.titre)).toEqual([TITRE]);
    expect([etat.deconnexions, etat.profil]).toEqual([0, true]);        // rien n'est touché, le drapeau reste levé
  });

  test('profil seul, hors ligne : « Quitter quand même » quitte (la réponse part avec l’appareil, voulu)', async () => {
    const { etat, d } = scenario({ profil: true, enLigne: false, choix: 'quitter' });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.fenetres.length, etat.deconnexions]).toEqual([1, 1]);
  });

  test('⚠️ en ligne mais l’envoi ne baisse pas le drapeau (l’envoi du profil avale ses échecs) : la fenêtre', async () => {
    const { etat, d } = scenario({ profil: true, enLigne: true, envoiPasse: false, choix: 'rester' });
    expect(await Quitter.quitter(d)).toBe('reste');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([1, 1, 0]);
    expect(etat.fenetres[0].titre).toBe(TITRE);
  });

  test('en ligne et l’envoi LÈVE : la fenêtre quand même', async () => {
    const { etat, d } = scenario({ profil: true, enLigne: true, lance: true, choix: 'rester' });
    expect(await Quitter.quitter(d)).toBe('reste');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([1, 1, 0]);
  });

  test('le drapeau est relu APRÈS l’envoi (jamais avant) — et jamais après la déconnexion', async () => {
    const { etat, d } = scenario({ profil: true, enLigne: true, envoiPasse: true });
    await Quitter.quitter(d);
    // 1re lecture : avant l'envoi (0 envoi), 2e : après (1 envoi) ; aucune après la déconnexion.
    expect(etat.lectures).toEqual([0, 1]);
  });

  test('séance ET profil en attente, en ligne : un seul envoi pour les deux', async () => {
    const { etat, d } = scenario({ file: file(seance('A')), profil: true, enLigne: true, envoiPasse: true });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([1, 0, 1]);
  });

  test('séance ET profil, hors ligne : la fenêtre parle des séances', async () => {
    const { etat, d } = scenario({ file: file(seance('A')), profil: true, enLigne: false, choix: 'rester' });
    expect(await Quitter.quitter(d)).toBe('reste');
    expect(etat.fenetres.map((v) => v.titre)).toEqual(['1 séance pas encore envoyée.']);
  });

  test('rien en attente (ni file ni profil) : on quitte sans envoi ni fenêtre, comme avant', async () => {
    const { etat, d } = scenario({ profil: false, enLigne: true });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([0, 0, 1]);
  });

  test('COMPATIBILITÉ — un appelant sans `profil` se comporte comme avant 60-2c', async () => {
    const { etat, d } = scenario({ profil: true, enLigne: true, envoiPasse: true, sansProfil: true });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([0, 0, 1]);
  });
});

// 118 (audit 06 #3, suite de 117) — les messages du groupe écrits hors ligne (`grp.file`) ont leur propre file :
// « Quitter » les effaçait sans la fenêtre. `autres()` les compte avec les autres changements.
describe('118 — « Quitter » compte ce qui attend hors de la file et du profil', () => {
  const TITRE = 'Des changements pas encore envoyés.';
  function scenario(o) {
    const etat = { autres: o.autres, envois: 0, fenetres: [], deconnexions: 0 };
    const d = {
      file: () => [], profil: () => false, autres: () => etat.autres, enLigne: () => o.enLigne,
      envoyer: async () => { etat.envois++; if (o.envoiPasse) etat.autres = 0; },
      fenetre: async (vue) => { etat.fenetres.push(vue); return o.choix; },
      deconnecter: async () => { etat.deconnexions++; }
    };
    return { etat, d };
  }
  test('⚠️ DISCRIMINANT — un message gardé, hors ligne : la fenêtre ; « Rester » ne perd rien', async () => {
    const { etat, d } = scenario({ autres: 1, enLigne: false, choix: 'rester' });
    expect(await Quitter.quitter(d)).toBe('reste');
    expect(etat.fenetres.map((v) => v.titre)).toEqual([TITRE]);
    expect([etat.envois, etat.deconnexions]).toEqual([0, 0]);
  });
  test('en ligne : l’envoi part d’abord ; tout parti, on quitte sans fenêtre', async () => {
    const { etat, d } = scenario({ autres: 2, enLigne: true, envoiPasse: true });
    expect(await Quitter.quitter(d)).toBe('quitte');
    expect([etat.envois, etat.fenetres.length, etat.deconnexions]).toEqual([1, 0, 1]);
  });
  test('la fenêtre pure : un nombre d’autres changements suffit ; rien, aucune fenêtre', () => {
    expect(Quitter.fenetreDeSortie([], false, 3).titre).toBe(TITRE);
    expect(Quitter.fenetreDeSortie([], false, 0)).toBeNull();
    expect(Quitter.fenetreDeSortie([], false)).toBeNull();
  });
});

describe('59-2 — après « Quitter », rien ne reste sur l’appareil', () => {
  function stockage(init) {
    const m = new Map(Object.entries(init || {}));
    return {
      get length() { return m.size; },
      key: (i) => Array.from(m.keys())[i] || null,
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      cles: () => Array.from(m.keys()).sort()
    };
  }

  test('toutes les clés th-v2… partent, et seulement elles', () => {
    const ls = stockage({ 'th-v2-auth': '{}', 'th-v2-sourdine': '1', 'th-v2-effort': 'rpe',
      'th-v2-refus-chauffes': '{}', 'th-v2-dossiers-replies': '{}', 'th-v2-garde': '1',
      'th-v2-questionnaire-vu-u1': '1', 'autre-site': 'x' });
    const ss = stockage({ 'th-v2-escalier-demo': 'demo' });
    const retirees = Quitter.effacerStockages([ls, ss, null]);
    expect(retirees.sort()).toEqual(['th-v2-auth', 'th-v2-dossiers-replies', 'th-v2-effort', 'th-v2-escalier-demo',
      'th-v2-garde', 'th-v2-questionnaire-vu-u1', 'th-v2-refus-chauffes', 'th-v2-sourdine']);
    expect(ls.cles()).toEqual(['autre-site']);
    expect(ss.cles()).toEqual([]);
  });

  test('un stockage fermé (mode privé) ne fait pas échouer la sortie', () => {
    const ferme = { get length() { throw new Error('SecurityError'); } };
    expect(() => Quitter.effacerStockages([ferme])).not.toThrow();
  });

  describe('le jeton', () => {
    let Auth, ls, appels;
    function charger(signOut) {
      jest.resetModules();
      appels = [];
      ls = stockage({ 'th-v2-auth': '{"user":{"id":"u"}}', 'th-v2-auth-code-verifier': 'v', 'th-v2-auth-user': '{}' });
      global.localStorage = ls;
      global.THClient = { CLE_AUTH: 'th-v2-auth', obtenir: () => ({ auth: {
        signOut: async (o) => { appels.push(['signOut', o]); return signOut(); },
        stopAutoRefresh: async () => { appels.push(['stopAutoRefresh']); }
      } }) };
      require('../../v2/js/auth.js');
      Auth = global.THAuth;
    }
    afterEach(() => { delete global.THClient; delete global.localStorage; });

    test('⚠️ hors ligne (le serveur ne répond pas) : le jeton est effacé quand même, et rien ne le réécrit', async () => {
      charger(() => ({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } }));
      const r = await Auth.deconnecter();
      expect(r.local).toBe(true);
      expect(ls.cles()).toEqual([]);
      expect(appels.map((a) => a[0])).toEqual(['signOut', 'stopAutoRefresh']);
    });

    test('une exception du SDK : même chose, et « Quitter » n’échoue pas', async () => {
      charger(() => { throw new Error('réseau'); });
      await expect(Auth.deconnecter()).resolves.toEqual(expect.objectContaining({ local: true }));
      expect(ls.cles()).toEqual([]);
    });

    test('en ligne : le SDK révoque et efface lui-même ; on ne touche à rien', async () => {
      charger(() => ({ error: null }));
      const r = await Auth.deconnecter();
      expect(r.local).toBe(false);
      expect(appels.map((a) => a[0])).toEqual(['signOut']);
    });
  });

  test('⚠️ chaque magasin que l’app CRÉE est vidé par « Quitter » — predictions et records compris', async () => {
    jest.resetModules();
    const journal = [];
    const magasin = (nom) => ({
      clear() { journal.push({ op: 'clear', magasin: nom }); },
      put() {}, createIndex() { return {}; }
    });
    const db = {
      objectStoreNames: { contains: () => false },
      createObjectStore(nom) { journal.push({ op: 'creer', magasin: nom }); return magasin(nom); },
      transaction() { const t = { objectStore: (nom) => magasin(nom) }; setTimeout(() => t.oncomplete && t.oncomplete(), 0); return t; }
    };
    global.indexedDB = { open() {
      const req = {};
      setTimeout(() => { req.result = db; req.onupgradeneeded && req.onupgradeneeded({ target: { result: db } });
        req.onsuccess && req.onsuccess({ target: { result: db } }); }, 0);
      return req;
    } };
    require('../../v2/js/cache.js');
    await global.THCache.viderTout();
    const crees = journal.filter((j) => j.op === 'creer').map((j) => j.magasin).sort();
    const vides = journal.filter((j) => j.op === 'clear').map((j) => j.magasin).sort();
    expect(crees).toContain('predictions');
    expect(crees).toContain('records');
    expect(vides).toEqual(crees);
    delete global.indexedDB;
  });
});
