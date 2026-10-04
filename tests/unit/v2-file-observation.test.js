/** @jest-environment node */
//
// §9.11 (27/09/2026) — une observation ne se perd plus dans la file.
//
// LE CONSTAT (séance d'Aurélien, journaux Supabase, heures UTC) :
//   20:00:36  POST sets                     la série 1 du couché entre en base
//   20:00:44  DELETE sets (…, série 1)      dévalidée pendant les suppressions
//   20:00:50  PATCH predictions   204       l'observation AVANT son pari : 0 ligne, « fait »
//   20:00:53  POST predictions    201       le pari, sans observation
//   20:00:53  PATCH predictions   409       la série n'est plus en base : 23503, définitif
//   20:02:47  POST sets                     la série revient — aucune observation renvoyée
//
// Trois défauts de la file, et le filet :
//   1. l'ordre : l'observation part derrière son pari ET derrière les séries ;
//   2. le faux succès : un PATCH qui ne touche aucune ligne n'est pas fait ;
//   3. le refus : un 23503 sur l'observation n'est pas définitif — elle attend
//      que sa série existe, sans arrêter la file ;
//   4. le rattrapage à « Terminer ».

require('../../v2/js/modele.js'); // la lecture des nombres (`lireNombre`), chargée avant, comme dans index.html
const A = require('../../v2/js/attente.js');
const S = require('../../v2/js/seance.js');

const SEANCE = 'sess-1';
const PARI = 'pari-rang-1';
const pariEntree = { table: A.PREDICTIONS, op: A.UPSERT, id: PARI, depend: SEANCE, donnees: { id: PARI } };
const obsEntree = (d) => ({ table: A.OBSERVATIONS, op: A.OBSERVER, id: PARI, depend: SEANCE, alaFin: true,
  donnees: Object.assign({ valeur_observee: 14, observee_a: '2026-09-27T20:00:40Z', set_observe: 's1' }, d || {}) });
const setsEntree = (lignes) => ({ table: A.SETS, op: A.REMPLACER, id: SEANCE, donnees: lignes });

// ── 1. L'ORDRE ──────────────────────────────────────────────────────────────
describe('1 — l’observation part derrière son pari et derrière les séries', () => {
  test('séparées : le pari puis l’observation, deux entrées, dans cet ordre', () => {
    let f = A.poser([], setsEntree([{ id: 's1' }]));
    f = A.poser(f, pariEntree);
    f = A.poser(f, obsEntree());
    expect(A.ordonnee(f).map((e) => e.cle)).toEqual(['sets:' + SEANCE, 'predictions:' + PARI, 'observations:' + PARI]);
    expect(A.prochaine(f).cle).toBe('sets:' + SEANCE);
  });

  test('⚠️ DISCRIMINANT — un pari bloqué retient son observation (même identifiant)', () => {
    let f = A.poser([], pariEntree);
    f = A.poser(f, obsEntree());
    f = A.marquerEchec(f, 'predictions:' + PARI, { code: '42501', message: 'rls' });
    expect(A.prochaine(f)).toBeNull();
  });

  test('⚠️ DISCRIMINANT — reposée, l’observation passe DERRIÈRE une entrée de séries plus récente', () => {
    // La séquence des journaux : l'observation est en file (en vol, ou en
    // attente), l'entrée des séries est partie et retirée ; la revalidation
    // pose une NOUVELLE entrée de séries (seq plus haut), puis l'observation.
    let f = A.poser([], pariEntree);
    f = A.poser(f, obsEntree({ set_observe: null, valeur_observee: null, observee_a: null }));
    f = A.poser(f, setsEntree([{ id: 's1' }]));
    f = A.poser(f, obsEntree());
    const ordre = A.ordonnee(f).map((e) => e.cle);
    expect(ordre.indexOf('sets:' + SEANCE)).toBeLessThan(ordre.indexOf('observations:' + PARI));
    // Et une requête partie avec l'ancienne version ne peut pas la retirer.
    const obs = f.filter((e) => e.cle === 'observations:' + PARI)[0];
    expect(A.retirer(f, obs.cle, 1).some((e) => e.cle === obs.cle)).toBe(true);
  });

  test('témoin — les autres entrées gardent la position de leur première pose', () => {
    let f = A.poser([], setsEntree([{ id: 's1' }]));
    f = A.poser(f, pariEntree);
    f = A.poser(f, setsEntree([{ id: 's1' }, { id: 's2' }]));
    expect(A.ordonnee(f).map((e) => e.cle)).toEqual(['sets:' + SEANCE, 'predictions:' + PARI]);
  });
});

// ── 3. LE REFUS N'EST PAS DÉFINITIF : L'OBSERVATION ATTEND SA SÉRIE ────────
describe('3 — un 23503 sur l’observation : elle attend, sans arrêter la file', () => {
  const fk = { code: '23503', message: 'predictions_set_observe_fkey' };

  test('⚠️ DISCRIMINANT — attendre, pas refuser', () => {
    expect(A.attendSaSerie({ table: A.OBSERVATIONS }, fk)).toBe(true);
    // Le même code ailleurs reste la règle commune : définitif.
    expect(A.attendSaSerie({ table: A.PREDICTIONS }, fk)).toBe(false);
    expect(A.attendSaSerie({ table: A.SETS }, fk)).toBe(false);
    expect(A.attendSaSerie({ table: A.OBSERVATIONS }, { code: '42501' })).toBe(false);
  });

  test('en attente, elle est dépassée — la suite de la file part', () => {
    let f = A.poser([], obsEntree());
    f = A.poser(f, { table: A.SESSIONS, op: A.UPSERT, id: 'autre', donnees: {} });
    f = A.marquerAttente(f, 'observations:' + PARI);
    expect(A.prochaine(f).cle).toBe('sessions:autre');
    // Elle n'est ni « refusée », ni perdue : toujours là, à envoyer.
    expect(A.resume(f).bloquees).toBe(0);
    expect(f.some((e) => e.cle === 'observations:' + PARI)).toBe(true);
  });

  test('les séries de SA séance montent : elle repart ; celles d’une autre séance, non', () => {
    let f = A.marquerAttente(A.poser([], obsEntree()), 'observations:' + PARI);
    expect(A.prochaine(A.libererObservations(f, 'autre-seance'))).toBeNull();
    expect(A.prochaine(A.libererObservations(f, SEANCE)).cle).toBe('observations:' + PARI);
  });

  test('reposée, elle n’attend plus : la nouvelle intention part', () => {
    let f = A.marquerAttente(A.poser([], obsEntree()), 'observations:' + PARI);
    f = A.poser(f, obsEntree({ set_observe: null, valeur_observee: null, observee_a: null }));
    expect(A.prochaine(f).cle).toBe('observations:' + PARI);
  });
});

// ── 2. LE FAUX SUCCÈS ; ET LE PARI SANS SON OBSERVATION ─────────────────────
describe('2 — un PATCH qui ne touche aucune ligne n’est pas fait', () => {
  function charger(reponse) {
    jest.resetModules();
    const appels = [];
    const requete = (table) => {
      const q = { table, ops: [] };
      appels.push(q);
      const chaine = {
        update: (v) => { q.ops.push(['update', v]); return chaine; },
        upsert: (v, o) => { q.ops.push(['upsert', v, o]); return Promise.resolve({ data: null, error: null }); },
        eq: (c, v) => { q.ops.push(['eq', c, v]); return chaine; },
        select: (c) => { q.ops.push(['select', c]); return Promise.resolve(reponse); }
      };
      return chaine;
    };
    global.THClient = { obtenir: () => ({ from: requete }) };
    return { D: require('../../v2/js/donnees.js'), appels };
  }
  afterEach(() => { delete global.THClient; });

  test('⚠️ DISCRIMINANT — zéro ligne touchée : une erreur, et elle est à retenter', async () => {
    const { D } = charger({ data: [], error: null });
    const e = await D.observerPrediction(PARI, { valeur_observee: 14, observee_a: 'x', set_observe: 's1' })
      .then(() => null, (x) => x);
    expect(e).not.toBeNull();
    expect(A.estDefinitive(e)).toBe(false);
  });

  test('le pari touché : fait', async () => {
    const { D, appels } = charger({ data: [{ id: PARI }], error: null });
    await expect(D.observerPrediction(PARI, { valeur_observee: 14, observee_a: 'x', set_observe: 's1' })).resolves.toBe(true);
    expect(appels[0].ops.map((o) => o[0])).toEqual(['update', 'eq', 'select']);
  });

  test('le pari s’insère SANS son observation (la série a pu partir entre-temps)', async () => {
    const { D, appels } = charger({ data: [], error: null });
    await D.enregistrerPrediction({ id: PARI, valeur_predite: 11, set_observe: 's1', valeur_observee: 14, observee_a: 'x' });
    const envoye = appels[0].ops[0][1];
    expect([envoye.set_observe, envoye.valeur_observee, envoye.observee_a]).toEqual([null, null, null]);
    expect(envoye.valeur_predite).toBe(11);
  });
});

// ── 4. LE RATTRAPAGE À « TERMINER » ─────────────────────────────────────────
describe('4 — les observations à renvoyer à « Terminer »', () => {
  const serie = (id, validee) => ({ id, type_serie: 'travail', charge_kg: 80, reps: 14,
    validee_a: validee ? '2026-09-27T20:00:40Z' : null, source: 'app' });
  const seance = { id: SEANCE, exercices: [
    { exercise_slug: 'dc', series: [serie('s1', true), serie('s2', false)] },
    { exercise_slug: 'ro', series: [serie('r1', true)] }] };
  const pari = (id, set, seanceId) => ({ id, set_observe: set, valeur_observee: set ? 14 : null,
    fondement: { seance: seanceId || SEANCE, rang: 1 } });

  test('⚠️ DISCRIMINANT — les paris observés sur une série encore validée, et eux seuls', () => {
    const paris = [
      pari('p1', 's1'),                // série validée → renvoyé
      pari('p2', 's2'),                // série NON validée → non
      pari('p3', 'disparue'),          // série supprimée → non
      pari('p4', null),                // jamais observé → non
      pari('p5', 'r1'),                // autre exercice, série validée → renvoyé
      pari('p6', 's1', 'autre-seance') // autre séance → non
    ];
    expect(S.observationsARenvoyer(paris, seance).map((l) => l.id)).toEqual(['p1', 'p5']);
  });

  test('sans séance, rien', () => {
    expect(S.observationsARenvoyer([pari('p1', 's1')], null)).toEqual([]);
  });
});
