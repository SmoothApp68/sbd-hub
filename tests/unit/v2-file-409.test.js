//
// 26/09/2026 — une séance ne reste plus jamais bloquée sur le téléphone.
//
// LE CONSTAT : une séance B lancée pendant qu'une séance A était encore
// `en_cours` en base a été refusée en `23505` sur `sessions_une_seule_en_cours`.
// Le code était classé DÉFINITIF : l'entrée bloquée, ses séries et ses paris
// retenus derrière elle, et plus aucun essai jusqu'à « Terminer » — onze
// minutes pendant lesquelles B n'existait que sur l'appareil.
//
// CONFIGURATION DISCRIMINANTE : le MÊME code `23505`, sur deux contraintes.
// Un test sur le seul code ne distingue pas « on reconnaît le conflit » de
// « on a rendu tout 23505 non définitif » — le second défaut rouvrirait les
// boucles infinies sur `sets_rang_unique` que le chantier 36 a fermées.

const Attente = require('../../v2/js/attente.js');

// La forme exacte de PostgREST : le nom de la contrainte est dans `message`.
const CONFLIT = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "sessions_une_seule_en_cours"',
  details: 'Key (user_id)=(u1) already exists.'
};
const RANG = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "sets_rang_unique"',
  details: 'Key (session_id, rang)=(s1, 2) already exists.'
};

const seance = (id, statut) => ({ table: 'sessions', op: 'upsert', id, donnees: { id, statut } });

describe('le conflit « une seule en cours » n’est plus définitif — et lui seul', () => {
  test('`23505` sur `sessions_une_seule_en_cours` : NON définitif', () => {
    expect(Attente.estConflitEnCours(CONFLIT)).toBe(true);
    expect(Attente.estDefinitive(CONFLIT)).toBe(false);
  });

  test('⚠️ DISCRIMINANT — un autre `23505` reste définitif', () => {
    expect(Attente.estConflitEnCours(RANG)).toBe(false);
    expect(Attente.estDefinitive(RANG)).toBe(true);
    expect(Attente.estDefinitive({ code: '23505', message: 'routines_user_nom_actif_uniq' })).toBe(true);
    expect(Attente.estDefinitive({ code: '23505' })).toBe(true);
  });

  test('le nom se lit aussi dans `details` (le banc de papier l’y met)', () => {
    expect(Attente.estConflitEnCours({ code: '23505', message: 'x', details: 'sessions_une_seule_en_cours' })).toBe(true);
  });

  test('le nom SANS le code n’est pas le conflit', () => {
    expect(Attente.estConflitEnCours({ code: '23514', message: 'sessions_une_seule_en_cours' })).toBe(false);
  });

  test('`marquerEchec` sur le conflit : en échec, à retenter — jamais bloquée', () => {
    let f = Attente.poser([], Object.assign(seance('B', 'en_cours'), { creation: true }));
    f = Attente.marquerEchec(f, 'sessions:B', CONFLIT);
    expect(f[0].bloquee).toBeNull();
    expect(f[0].essais).toBe(1);
  });

  test('l’état ne dit plus « refusé » : il dit un nouvel essai', () => {
    let f = Attente.poser([], seance('B', 'en_cours'));
    f = Attente.marquerEchec(f, 'sessions:B', CONFLIT);
    const e = Attente.deciderEtat({ code: 'ok', libelle: 'À jour' }, f);
    expect(e.code).toBe('echec');
    expect(e.libelle).not.toMatch(/refus/);
    expect(e.libelle).toMatch(/nouvelle tentative/);
  });
});

describe('l’envoi referme l’autre séance, puis renvoie', () => {
  // Une base de papier : l'index unique, et rien d'autre.
  const base = () => {
    const b = { sessions: [{ id: 'A', statut: 'en_cours' }], journal: [] };
    b.executer = async (op) => {
      b.journal.push('envoi ' + op.id);
      const l = op.donnees;
      if (l.statut === 'en_cours' && b.sessions.some((x) => x.id !== l.id && x.statut === 'en_cours')) throw CONFLIT;
      const i = b.sessions.findIndex((x) => x.id === l.id);
      if (i >= 0) b.sessions[i] = Object.assign({}, l); else b.sessions.push(Object.assign({}, l));
    };
    b.refermerSauf = async (id) => {
      b.journal.push('refermer sauf ' + id);
      b.sessions.forEach((x) => { if (x.id !== id && x.statut === 'en_cours') x.statut = 'terminee'; });
    };
    return b;
  };

  test('⚠️ LE CAS DU 26/09 — A ouverte en base, B envoyée : A refermée, B montée, dans le même envoi', async () => {
    const b = base();
    const erreur = await Attente.envoyer(seance('B', 'en_cours'), b.executer, b.refermerSauf);
    expect(erreur).toBeNull();
    expect(b.journal).toEqual(['envoi B', 'refermer sauf B', 'envoi B']);
    expect(b.sessions).toEqual([{ id: 'A', statut: 'terminee' }, { id: 'B', statut: 'en_cours' }]);
  });

  test('sans conflit : un envoi, rien de refermé', async () => {
    const b = base();
    b.sessions = [];
    expect(await Attente.envoyer(seance('B', 'en_cours'), b.executer, b.refermerSauf)).toBeNull();
    expect(b.journal).toEqual(['envoi B']);
  });

  test('un autre `23505` n’est PAS résolu : rien de refermé, l’erreur remonte', async () => {
    const b = base();
    const exec = async () => { throw RANG; };
    expect(await Attente.envoyer(seance('B', 'en_cours'), exec, b.refermerSauf)).toBe(RANG);
    expect(b.journal).toEqual([]);
    expect(b.sessions[0].statut).toBe('en_cours');
  });

  test('le conflit sur une autre table que `sessions` n’est pas résolu', async () => {
    const b = base();
    const exec = async () => { throw CONFLIT; };
    const op = { table: 'sets', op: 'remplacer', id: 'B', donnees: [] };
    expect(await Attente.envoyer(op, exec, b.refermerSauf)).toBe(CONFLIT);
    expect(b.journal).toEqual([]);
  });

  test('le renvoi échoue encore : l’erreur remonte, et elle est à RETENTER', async () => {
    const b = base();
    const refermerRate = async () => { throw { message: 'Failed to fetch' }; };
    const erreur = await Attente.envoyer(seance('B', 'en_cours'), b.executer, refermerRate);
    expect(erreur).toEqual({ message: 'Failed to fetch' });
    expect(Attente.estDefinitive(erreur)).toBe(false);
    // Et si c'est encore le conflit (l'autre séance rouverte entre-temps) :
    const toujours = async () => { throw CONFLIT; };
    const e2 = await Attente.envoyer(seance('B', 'en_cours'), toujours, async () => {});
    expect(e2).toBe(CONFLIT);
    expect(Attente.estDefinitive(e2)).toBe(false);
  });

  test('derrière la séance, ses séries et ses paris repartent : plus rien ne les retient', () => {
    let f = Attente.poser([], Object.assign(seance('B', 'en_cours'), { creation: true }));
    f = Attente.poser(f, { table: 'sets', op: 'remplacer', id: 'B', donnees: [] });
    f = Attente.poser(f, { table: 'predictions', op: 'upsert', id: 'p1', depend: 'B', donnees: {} });
    f = Attente.marquerEchec(f, 'sessions:B', CONFLIT);
    // En échec mais PAS bloquée : `prochaine` rend la séance elle-même, en tête.
    expect(Attente.prochaine(f).cle).toBe('sessions:B');
    f = Attente.retirer(f, 'sessions:B', Attente.prochaine(f).version);
    expect(Attente.prochaine(f).cle).toBe('sets:B');
    f = Attente.retirer(f, 'sets:B', 1);
    expect(Attente.prochaine(f).cle).toBe('predictions:p1');
  });
});

describe('les files DÉJÀ bloquées sur le téléphone se débloquent au démarrage', () => {
  // Une file écrite AVANT ce correctif : la séance marquée définitive, ses
  // séries et ses paris retenus derrière elle — l'état exact du 26/09.
  const fileDu2609 = () => {
    let f = Attente.poser([], Object.assign(seance('B', 'en_cours'), { creation: true }));
    f = Attente.poser(f, { table: 'sets', op: 'remplacer', id: 'B', donnees: [] });
    f = Attente.poser(f, { table: 'predictions', op: 'upsert', id: 'p1', depend: 'B', donnees: {} });
    return f.map((e) => (e.cle === 'sessions:B'
      ? Object.assign({}, e, { essais: 1, bloquee: { code: CONFLIT.code, message: CONFLIT.message } })
      : e));
  };

  test('prémisse : bloquée, rien ne passe', () => {
    expect(Attente.prochaine(fileDu2609())).toBeNull();
  });

  test('débloquée : la séance repart en tête, version montée, essais remis à zéro', () => {
    const avant = fileDu2609();
    const r = Attente.reparerConflitsEnCours(avant);
    expect(r.entrees).toBe(1);
    const b = r.file.find((e) => e.cle === 'sessions:B');
    expect(b.bloquee).toBeNull();
    expect(b.essais).toBe(0);
    expect(b.version).toBe(avant.find((e) => e.cle === 'sessions:B').version + 1);
    expect(Attente.prochaine(r.file).cle).toBe('sessions:B');
  });

  test('⚠️ DISCRIMINANT — un autre `23505` bloqué le reste', () => {
    let f = Attente.poser([], { table: 'sets', op: 'remplacer', id: 'X', donnees: [] });
    f = Attente.marquerEchec(f, 'sets:X', RANG);
    let g = Attente.poser([], seance('Y', 'terminee'));
    g = g.map((e) => Object.assign({}, e, { bloquee: { code: '23505', message: 'sessions_pkey' } }));
    const r = Attente.reparerConflitsEnCours(f.concat(g.map((e) => Object.assign({}, e, { seq: 9 }))));
    expect(r.entrees).toBe(0);
    expect(r.file.every((e) => !!e.bloquee)).toBe(true);
  });

  test('le nom de la contrainte sur une autre table ne débloque rien', () => {
    const f = [{ cle: 'sets:B', seq: 1, table: 'sets', op: 'remplacer', id: 'B', version: 1,
      bloquee: { code: CONFLIT.code, message: CONFLIT.message } }];
    expect(Attente.reparerConflitsEnCours(f).entrees).toBe(0);
  });

  test('rien à réparer : la file rendue est équivalente, zéro entrée', () => {
    const f = Attente.poser([], seance('B', 'en_cours'));
    const r = Attente.reparerConflitsEnCours(f);
    expect(r.entrees).toBe(0);
    expect(r.file).toEqual(f);
  });
});
