/** @jest-environment node */
//
// 58-2 — LE JOURNAL DES RECORDS : la file et la copie locale (MOTEUR §9.23).
//
// La file : une entrée `records` part APRÈS la séance et ses séries, ne
// s'affiche pas tant qu'elle n'a pas échoué, et se repose en fin de file.
// La copie locale : à l'image de la base — l'ajout ignore les doublons, une
// ligne ne se modifie jamais, elle part avec sa série (cascade, ou correction
// sur les champs de `sets_efface_records`).

global.self = global;
const Attente = require('../../v2/js/attente.js');
const Sync = require('../../v2/js/sync.js');

const ligne = (set, type, extra) => Object.assign({ user_id: 'u', set_id: set, session_id: 'S', exercise_slug: 'x',
  type: type, valeur: 100, reps: null, charge: null, unite: null, ancien: null, ancien_le: null,
  sur_douze_mois: false, battu_le: '2026-10-07T10:00:00Z' }, extra || {});

describe('la file : l’entrée du journal', () => {
  const avecSeance = () => {
    let f = Attente.poser([], { table: Attente.SESSIONS, op: Attente.UPSERT, id: 'S', donnees: {} });
    f = Attente.poser(f, { table: Attente.SETS, op: Attente.REMPLACER, id: 'S', donnees: [] });
    return Attente.poser(f, { table: Attente.RECORDS, op: Attente.AJOUTER, id: 'S', depend: 'S',
      donnees: [ligne('a', 'charge_max')], alaFin: true });
  };

  test('elle part APRÈS la séance et ses séries', () => {
    let f = avecSeance();
    const ordre = [];
    for (let k = 0; k < 3; k++) {
      const op = Attente.prochaine(f);
      ordre.push(op.table);
      f = Attente.apresSucces(f, op);
    }
    expect(ordre).toEqual(['sessions', 'sets', 'records']);
    expect(f).toEqual([]);
  });

  test('séries refusées pour de bon : elle reste retenue (sa clé étrangère échouerait)', () => {
    let f = avecSeance();
    f = Attente.apresSucces(f, Attente.prochaine(f));
    const sets = Attente.prochaine(f);
    f = Attente.apresEchec(f, sets, { code: '23514', message: 'x' }).file;
    expect(Attente.prochaine(f)).toBeNull();
  });

  test('reposée (une Édition), elle passe en FIN de file, derrière les séries reposées', () => {
    let f = avecSeance();
    f = Attente.apresSucces(f, Attente.prochaine(f));          // la séance
    f = Attente.apresSucces(f, Attente.prochaine(f));          // ses séries
    // Le journal n'est pas encore parti ; l'Édition repose les séries, puis le journal.
    f = Attente.poser(f, { table: Attente.SETS, op: Attente.REMPLACER, id: 'S', donnees: [] });
    f = Attente.poser(f, { table: Attente.RECORDS, op: Attente.AJOUTER, id: 'S', depend: 'S',
      donnees: [ligne('a', 'charge_max'), ligne('b', 'cap')], alaFin: true });
    expect(Attente.ordonnee(f).map((e) => e.table)).toEqual(['sets', 'records']);
    expect(f.filter((e) => e.table === 'records')).toHaveLength(1);    // compressée, une seule
    expect(f.filter((e) => e.table === 'records')[0].donnees).toHaveLength(2);
  });

  test('⚠️ elle ne se compte pas à l’écran tant qu’elle n’a pas échoué', () => {
    const f = avecSeance();
    expect(Attente.resume(f).enAttente).toBe(2);                     // la séance et ses séries
    expect(Attente.resume(f).libelle).toBe('2 à envoyer');
    const seule = f.filter((e) => e.table === 'records');
    expect(Attente.deciderEtat({ code: 'a-jour', libelle: 'À jour' }, seule).libelle).toBe('À jour');
    // En échec, elle se dit — rien ne reste en attente sans que l'écran le sache.
    const echouee = Attente.marquerEchec(seule, seule[0].cle, { code: 'P0001', message: 'immuable' });
    expect(Attente.resume(echouee).enEchec).toBe(1);
    const refusee = Attente.marquerEchec(seule, seule[0].cle, { code: '23503', message: 'fk' });
    expect(Attente.resume(refusee).bloquees).toBe(1);
  });
});

describe('la copie locale, à l’image de la base', () => {
  test('l’ajout ignore les doublons (set_id, type) : la ligne déjà là reste telle quelle', () => {
    const j = [ligne('a', 'charge_max', { valeur: 100 })];
    const r = Sync.ajouterAuJournal(j, [ligne('a', 'charge_max', { valeur: 999 }), ligne('a', 'cap'), ligne('b', 'charge_max')]);
    expect(r.ajoutees.map((l) => l.set_id + l.type)).toEqual(['acap', 'bcharge_max']);
    expect(r.journal.filter((l) => l.set_id === 'a' && l.type === 'charge_max')[0].valeur).toBe(100);
    expect(r.journal).toHaveLength(3);
    // Deux fois la même ligne dans un lot : une seule entre.
    expect(Sync.ajouterAuJournal([], [ligne('c', 'cap'), ligne('c', 'cap')]).journal).toHaveLength(1);
  });

  test('ce que le serveur rend remplace la copie locale (identifiant et date tirés par la base)', () => {
    const j = [ligne('a', 'charge_max'), ligne('b', 'cap')];
    const f = Sync.fondreJournal(j, [ligne('a', 'charge_max', { id: 'r1', created_at: '2026-10-07T10:01:00Z' })]);
    expect(f).toHaveLength(2);
    expect(f.filter((l) => l.set_id === 'a')[0].id).toBe('r1');
    expect(f.some((l) => '_cle' in l)).toBe(false);
  });

  test('⚠️ une série corrigée sur un champ du déclencheur perd ses lignes — une note, non', () => {
    const avant = [
      { id: 'a', type_serie: 'travail', charge_kg: 100, reps: 5, duree_s: null, distance_m: null, note: null },
      { id: 'b', type_serie: 'travail', charge_kg: 80, reps: 8, duree_s: null, distance_m: null, note: null },
      { id: 'c', type_serie: 'travail', charge_kg: 60, reps: 10, duree_s: null, distance_m: null, note: null },
      { id: 'd', type_serie: 'travail', charge_kg: 40, reps: 12, duree_s: null, distance_m: null, note: null },
      { id: 'e', type_serie: 'travail', charge_kg: 20, reps: 12, duree_s: 30, distance_m: null, note: null }
    ];
    const apres = [
      Object.assign({}, avant[0], { charge_kg: 102.5 }),        // charge : efface
      Object.assign({}, avant[1], { note: 'dur' }),             // note : n'efface rien
      Object.assign({}, avant[2], { type_serie: 'echec' }),     // type : efface
      // d : supprimée (la cascade)
      Object.assign({}, avant[4], { duree_s: 31 })              // durée : efface
    ];
    expect(Sync.seriesQuiEffacent(avant, apres).sort()).toEqual(['a', 'c', 'd', 'e']);
    // `IS DISTINCT FROM` : null et undefined sont la même absence, 100 et '100' le même nombre.
    expect(Sync.seriesQuiEffacent([{ id: 'x', charge_kg: 100, reps: null }],
      [{ id: 'x', charge_kg: '100', reps: undefined, duree_s: null }])).toEqual([]);
    expect(Sync.CHAMPS_DU_RECORD).toEqual(['type_serie', 'charge_kg', 'reps', 'duree_s', 'distance_m']);
    const j = [ligne('a', 'charge_max'), ligne('b', 'cap'), ligne('d', 'volume_seance')];
    expect(Sync.retirerDuJournal(j, ['a', 'd']).map((l) => l.set_id)).toEqual(['b']);
  });

  test('la cascade : une ligne dont la série n’existe plus part — si la liste est complète', () => {
    const j = [ligne('a', 'charge_max'), ligne('z', 'cap')];
    expect(Sync.purgerJournal(j, [{ id: 'a' }], true).map((l) => l.set_id)).toEqual(['a']);
    expect(Sync.purgerJournal(j, [{ id: 'a' }], false)).toHaveLength(2);
  });
});
