/** @jest-environment node */
//
// 29/09/2026 — une observation orpheline ne bloque plus la file.
//
// LE CONSTAT (séance d'Aurélien, journaux Supabase) : un pari perdu avant
// d'entrer dans la file (la ré-entrée `SIGNED_IN → entrer()` relit la file du
// disque — corrigée par un second commit), son observation partie seule. Le
// PATCH ne touche aucune ligne : `TH000`, classé temporaire, donc `break` —
// ~30 PATCH vides, cinq observations bloquées derrière, et la séance SUIVANTE
// serait restée sur le téléphone, réseau présent.
//
// La boucle ci-dessous est celle de `vidanger` (`app.js`) : `prochaine`,
// l'envoi, puis `apresEchec` / `apresSucces`, et un arrêt sur `arret` seul.

const A = require('../../v2/js/attente.js');

const S1 = 'seance-1', S2 = 'seance-2';
const PERDU = 'pari-perdu', GARDE = 'pari-garde';
const TH000 = { code: 'TH000', message: 'observation : aucun pari touché' };

const session = (id) => ({ table: A.SESSIONS, op: A.UPSERT, id, donnees: { id } });
const series = (id) => ({ table: A.SETS, op: A.REMPLACER, id, donnees: [{ id: id + '-s1' }] });
const pari = (id, seance) => ({ table: A.PREDICTIONS, op: A.UPSERT, id, depend: seance, donnees: { id } });
const obs = (id, seance) => ({ table: A.OBSERVATIONS, op: A.OBSERVER, id, depend: seance, alaFin: true,
  donnees: { valeur_observee: 5, observee_a: 'x', set_observe: 's1' } });

// Le serveur : les paris en base. Une observation d'un pari absent → TH000.
function vidanger(file, enBase, options) {
  const o = options || {};
  const envoyes = [];
  let f = file;
  for (let garde = 200; garde > 0; garde--) {
    const op = A.prochaine(f);
    if (!op) break;
    envoyes.push(op.cle);
    let echec = null;
    if (o.reseau === false) echec = { code: '', message: 'Failed to fetch' };
    else if (op.table === A.PREDICTIONS) enBase.add(op.id);
    else if (op.table === A.OBSERVATIONS && !enBase.has(op.id)) echec = TH000;
    if (echec) {
      const issue = A.apresEchec(f, op, echec);
      f = issue.file;
      if (issue.suite === 'abandonnee' || issue.suite === 'attend') continue;
      break;
    }
    f = A.apresSucces(f, op);
  }
  return { file: f, envoyes };
}

const poserTout = (ops) => ops.reduce((f, op) => A.poser(f, op), []);
const cles = (f) => A.ordonnee(f).map((e) => e.cle);

describe('TH000 ne bloque plus la file', () => {
  test('⚠️ DISCRIMINANT — attendre, pas arrêter : TH000 est une attente, comme le 23503', () => {
    expect(A.attendSaSerie({ table: A.OBSERVATIONS }, TH000)).toBe(true);
    expect(A.attendSaSerie({ table: A.OBSERVATIONS }, { code: '23503' })).toBe(true);
    // Ailleurs, TH000 n'est pas une raison d'attendre.
    expect(A.attendSaSerie({ table: A.PREDICTIONS }, TH000)).toBe(false);
    expect(A.attendSaSerie({ table: A.SETS }, TH000)).toBe(false);
  });

  test('⚠️ DISCRIMINANT — les entrées qui SUIVENT l’orpheline partent', () => {
    // L'état du téléphone d'Aurélien : la séance est montée ; en file,
    // l'observation du pari perdu, puis cinq observations de paris existants.
    const enBase = new Set(['g1', 'g2', 'g3', 'g4', 'g5']);
    const f = poserTout([obs(PERDU, S1), obs('g1', S1), obs('g2', S1), obs('g3', S1), obs('g4', S1), obs('g5', S1)]);
    const r = vidanger(f, enBase);
    expect(r.file).toEqual([]);
    expect(r.envoyes).toEqual(cles(f));
  });

  test('⚠️ DISCRIMINANT — la séance SUIVANTE monte, réseau présent', () => {
    const enBase = new Set();
    const f = poserTout([obs(PERDU, S1), session(S2), series(S2), pari(GARDE, S2), obs(GARDE, S2)]);
    const r = vidanger(f, enBase);
    expect(r.file).toEqual([]);
    expect(r.envoyes).toEqual(expect.arrayContaining(['sessions:' + S2, 'sets:' + S2,
      'predictions:' + GARDE, 'observations:' + GARDE]));
    expect(enBase.has(GARDE)).toBe(true);
  });

  test('hors réseau, rien ne change : la tête arrête la vidange, rien n’est abandonné', () => {
    const f = poserTout([obs(PERDU, S1), session(S2)]);
    const r = vidanger(f, new Set(), { reseau: false });
    expect(r.envoyes).toEqual(['observations:' + PERDU]);
    expect(cles(r.file)).toEqual(cles(f));
  });
});

describe('l’orpheline est abandonnée quand sa séance n’a plus rien en file', () => {
  test('⚠️ DISCRIMINANT — plus aucune entrée de sa séance : retirée, pas mise en attente', () => {
    const f = poserTout([obs(PERDU, S1), session(S2)]);
    const op = A.prochaine(f);
    expect(A.orpheline(f, op, TH000)).toBe(true);
    const issue = A.apresEchec(f, op, TH000);
    expect(issue.suite).toBe('abandonnee');
    expect(cles(issue.file)).toEqual(['sessions:' + S2]);
  });

  test('⚠️ DISCRIMINANT — la séance encore en file (séance, séries, un autre pari) : elle attend', () => {
    for (const reste of [session(S1), series(S1), pari('autre', S1)]) {
      const f = poserTout([obs(PERDU, S1), reste]);
      const op = A.prochaine(f);
      expect(A.orpheline(f, op, TH000)).toBe(false);
      const issue = A.apresEchec(f, op, TH000);
      expect(issue.suite).toBe('attend');
      expect(issue.file.filter((e) => e.cle === op.cle)[0].attend).toBe('pari');
    }
  });

  test('les autres observations de la séance ne la retiennent pas (deux orphelines ne se gardent pas)', () => {
    const f = poserTout([obs(PERDU, S1), obs('autre-perdu', S1)]);
    const r = vidanger(f, new Set());
    expect(r.file).toEqual([]);
  });

  test('elle attend, puis repart après un envoi réussi de sa séance — et part vraiment si son pari est monté', () => {
    // Séance encore en file derrière elle : elle attend ; les séries montent,
    // elle est libérée ; cette fois sa séance n'a plus rien : abandonnée.
    const f = poserTout([obs(PERDU, S1), series(S1)]);
    const r = vidanger(f, new Set());
    expect(r.envoyes).toEqual(['observations:' + PERDU, 'sets:' + S1, 'observations:' + PERDU]);
    expect(r.file).toEqual([]);
  });

  test('un 23503 n’est jamais abandonné : il attend sa série, comme avant', () => {
    const f = poserTout([obs(PERDU, S1)]);
    const op = A.prochaine(f);
    const issue = A.apresEchec(f, op, { code: '23503', message: 'predictions_set_observe_fkey' });
    expect(issue.suite).toBe('attend');
    expect(issue.file[0].attend).toBe('serie');
  });

  test('une entrée reposée pendant l’envoi n’est pas retirée (la version compte)', () => {
    let f = poserTout([obs(PERDU, S1)]);
    const op = A.prochaine(f);
    f = A.poser(f, obs(PERDU, S1));   // reposée : version 2
    const issue = A.apresEchec(f, op, TH000);
    expect(issue.suite).toBe('abandonnee');
    expect(issue.file.map((e) => e.cle)).toEqual(['observations:' + PERDU]);
  });
});

describe('le cas normal (#329) reste intact', () => {
  test('⚠️ DISCRIMINANT — son pari encore en file : jamais abandonnée', () => {
    // Le pari, en file, n'a pas de dépendance posée (une entrée d'un build
    // antérieur) : c'est son identifiant qui le lie à l'observation.
    const f = poserTout([Object.assign(pari(PERDU, S1), { depend: null }), obs(PERDU, S1)]);
    const op = f.filter((e) => e.table === A.OBSERVATIONS)[0];
    expect(A.orpheline(f, op, TH000)).toBe(false);
    expect(A.apresEchec(f, op, TH000).suite).toBe('attend');
  });

  test('le pari part d’abord, puis son observation, et la file se vide', () => {
    const enBase = new Set();
    const f = poserTout([session(S1), series(S1), pari(PERDU, S1), obs(PERDU, S1)]);
    const r = vidanger(f, enBase);
    expect(r.envoyes).toEqual(['sessions:' + S1, 'sets:' + S1, 'predictions:' + PERDU, 'observations:' + PERDU]);
    expect(r.file).toEqual([]);
  });

  test('un pari bloqué retient toujours son observation', () => {
    let f = poserTout([pari(PERDU, S1), obs(PERDU, S1)]);
    f = A.marquerEchec(f, 'predictions:' + PERDU, { code: '42501', message: 'rls' });
    expect(A.prochaine(f)).toBeNull();
  });

  test('une autre erreur sur l’observation arrête la vidange, comme avant', () => {
    const f = poserTout([obs(PERDU, S1)]);
    const issue = A.apresEchec(f, A.prochaine(f), { code: '', message: 'Failed to fetch' });
    expect(issue.suite).toBe('arret');
    expect(issue.file[0].essais).toBe(1);
  });
});
