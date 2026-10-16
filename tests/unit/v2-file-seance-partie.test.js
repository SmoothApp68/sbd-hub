/** @jest-environment node */
//
// 117 (audit du 16/10/2026, 06 #2) — UNE SÉANCE QUI PART EMPORTE CE QUI DÉPEND D'ELLE.
//
// LE CONSTAT (simulation de l'audit, sur `attente.js`) : en salle sans réseau, une série validée pose son pari ;
// l'abandon retire les séries et la séance (jamais montée, elle ne voyage pas), mais le pari et son observation
// restent. Au retour du réseau, la base refuse le pari (23503, `predictions_session_fk`) : code définitif, entrée
// bloquée, « 1 envoi refusé — rien n'est perdu » pour toujours.
//
// La boucle ci-dessous est celle de `vidanger` (`app.js`) : `prochaine`, l'envoi, puis `apresEchec` /
// `apresSucces`, et un arrêt sur `arret` seul.

const A = require('../../v2/js/attente.js');

const S1 = 'seance-1';
const FK_SEANCE = { code: '23503', message: 'insert or update on table "predictions" violates foreign key constraint "predictions_session_fk"',
  details: 'Key (session_id)=(seance-1) is not present in table "sessions".' };
const FK_EXERCICE = { code: '23503', message: 'insert or update on table "predictions" violates foreign key constraint "predictions_exercise_slug_fkey"',
  details: 'Key (exercise_slug)=(x) is not present in table "exercises".' };

const session = (id) => ({ table: A.SESSIONS, op: A.UPSERT, id, creation: true, donnees: { id } });
const series = (id, ids) => ({ table: A.SETS, op: A.REMPLACER, id, donnees: ids.map((x) => ({ id: x, session_id: id })) });
const pari = (id, seance) => ({ table: A.PREDICTIONS, op: A.UPSERT, id, depend: seance,
  donnees: { id, fondement: { seance } } });
const obs = (id, seance, serie) => ({ table: A.OBSERVATIONS, op: A.OBSERVER, id, depend: seance, alaFin: true,
  donnees: { valeur_observee: 5, observee_a: 'x', set_observe: serie } });
const journal = (seance) => ({ table: A.RECORDS, op: A.AJOUTER, id: seance, depend: seance, donnees: [{ set_id: 's1', type: 'charge', session_id: seance }] });

const poserTout = (ops) => ops.reduce((f, op) => A.poser(f, op), []);
const cles = (f) => A.ordonnee(f).map((e) => e.cle);

// La base : les séances qui existent. Un pari ou un journal dont la séance n'existe pas → 23503 sur `sessions`.
function vidanger(file, seancesEnBase) {
  const envoyes = [];
  let f = file;
  for (let garde = 200; garde > 0; garde--) {
    const op = A.prochaine(f);
    if (!op) break;
    envoyes.push(op.cle);
    let echec = null;
    if (op.table === A.SESSIONS && op.op !== A.SUPPRIMER) seancesEnBase.add(op.id);
    else if ((op.table === A.PREDICTIONS || op.table === A.RECORDS) && !seancesEnBase.has(A.seanceDeLEntree ? A.seanceDeLEntree(op) : op.depend)) echec = FK_SEANCE;
    if (echec) {
      const issue = A.apresEchec(f, op, echec);
      f = issue.file;
      if (issue.suite === 'arret') break;
      continue;
    }
    f = A.apresSucces(f, op);
  }
  return { file: f, envoyes };
}

// Le geste de l'app (`abandonnerSeance`) : retirer ce qui dépend de la séance, puis poser sa suppression.
function abandonner(file, id, idsSeries) {
  const f = A.retirerSeance(file, id, idsSeries);
  return A.poser(f, { table: A.SESSIONS, op: A.SUPPRIMER, id });
}

describe('abandonner une séance jamais montée', () => {
  test('⚠️ DISCRIMINANT — le scénario de l’audit : après l’abandon, la file est vide et rien n’est refusé', () => {
    const file = poserTout([session(S1), series(S1, ['s1']), pari('pari-1', S1), obs('pari-1', S1, 's1')]);
    const apres = abandonner(file, S1, ['s1']);
    expect(cles(apres)).toEqual([]);
    const r = vidanger(apres, new Set());
    expect(r.envoyes).toEqual([]);
    expect(A.deciderEtat({ code: 'a-jour', libelle: 'À jour' }, r.file).code).toBe('a-jour');
  });

  test('le journal des records de la séance part aussi, et l’observation qui désigne une de ses séries', () => {
    const autre = 'seance-ancienne';
    const file = poserTout([session(S1), series(S1, ['s1', 's2']), journal(S1),
      // L'observation d'un pari d'une AUTRE séance (l'escalier), qui désigne une série de celle-ci : sans objet.
      obs('pari-escalier', autre, 's2'),
      // Celle qui ne la concerne pas reste.
      obs('pari-autre', autre, 'serie-d-ailleurs')]);
    const apres = abandonner(file, S1, ['s1', 's2']);
    expect(cles(apres)).toEqual(['observations:pari-autre']);
  });

  test('une autre séance, ses paris et ses séries ne bougent pas', () => {
    const file = poserTout([session('S2'), series('S2', ['t1']), pari('pari-2', 'S2'),
      session(S1), series(S1, ['s1']), pari('pari-1', S1)]);
    const apres = abandonner(file, S1, ['s1']);
    expect(cles(apres)).toEqual(['sessions:S2', 'sets:S2', 'predictions:pari-2']);
  });

  test('une séance DÉJÀ montée : sa suppression voyage, ses paris en attente ne partent plus', () => {
    // La séance est en base (son entrée de création est partie) ; un pari attend encore.
    const file = poserTout([pari('pari-1', S1)]);
    const apres = abandonner(file, S1, []);
    expect(cles(apres)).toEqual(['sessions:' + S1]);
    expect(A.ordonnee(apres)[0].op).toBe(A.SUPPRIMER);
  });
});

describe('un refus parce que la séance n’existe plus sort de la file sans bloquer', () => {
  test('⚠️ DISCRIMINANT — un pari refusé en 23503 sur `sessions` quand la file n’a plus sa séance : il sort, avec son observation', () => {
    // Le cas d'avant ce correctif, déjà sur le disque : un pari et son observation restés seuls.
    const file = poserTout([pari('pari-1', S1), obs('pari-1', S1, 's1'), session('S2')]);
    const r = vidanger(file, new Set());
    expect(cles(r.file)).toEqual([]);
    expect(r.envoyes).toEqual(['predictions:pari-1', 'sessions:S2']);
    expect(A.resume(r.file).bloquees).toBe(0);
  });

  test('l’issue se nomme `caduque`, pas `arret`', () => {
    const file = poserTout([pari('pari-1', S1)]);
    const op = A.prochaine(file);
    const issue = A.apresEchec(file, op, FK_SEANCE);
    expect(issue.suite).toBe('caduque');
    expect(issue.file).toEqual([]);
  });

  test('la séance encore à monter dans la file : ce n’est pas un refus caduc (la règle commune)', () => {
    const file = poserTout([session(S1), pari('pari-1', S1)]);
    const op = A.ordonnee(file)[1];
    expect(A.seanceDisparue(file, op, FK_SEANCE)).toBe(false);
  });

  test('une autre clé étrangère (l’exercice) reste un refus définitif', () => {
    const file = poserTout([pari('pari-1', S1)]);
    const op = A.prochaine(file);
    expect(A.seanceDisparue(file, op, FK_EXERCICE)).toBe(false);
    expect(A.apresEchec(file, op, FK_EXERCICE).suite).toBe('arret');
  });

  test('le journal d’une séance disparue sort ; un lot du remplissage (sans séance) reste refusé', () => {
    const j = poserTout([journal(S1)]);
    const fk = { code: '23503', message: 'records_session_id_fkey', details: 'records_session_id_fkey' };
    expect(A.apresEchec(j, A.prochaine(j), fk).suite).toBe('caduque');
    const lot = poserTout([{ table: A.RECORDS, op: A.AJOUTER, id: 'lot-1', depend: null, donnees: [{ session_id: S1 }] }]);
    expect(A.apresEchec(lot, A.prochaine(lot), fk).suite).toBe('arret');
  });

  test('les séries ne sont jamais concernées : une saisie n’est pas jetée sur un 23503', () => {
    const file = poserTout([series(S1, ['s1'])]);
    const fk = { code: '23503', message: 'sets_session_id_fkey', details: 'sets_session_id_fkey' };
    expect(A.seanceDisparue(file, A.prochaine(file), fk)).toBe(false);
  });
});
