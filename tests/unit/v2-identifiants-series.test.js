//
// Chantier 33 — l'identifiant manquant, et la file bloquée.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : AU MOINS UNE SÉRIE
// AJOUTÉE À LA MAIN, et un serveur qui applique le `NOT NULL` de `sets.id`.
//
// C'est cette double condition qui a laissé le défaut passer depuis le chantier
// 22. Une séance de ROUTINE fabrique ses séries via `creer({idSerie: uuid})` —
// une FONCTION — donc avec de vrais identifiants : elle ne montre rien. Et un
// serveur permissif écrase les lignes `id: null` les unes sur les autres au
// lieu de les refuser : il perd des séries sans jamais le dire. Il faut les
// deux pour voir quoi que ce soit.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/modele.js` se termine
// par `this`, que Babel remplace par `undefined` sous l'environnement node —
// le fichier lève alors à l'import. Voir l'entête de `v2-palier-sans-charge`.

const Seance = require('../../v2/js/seance.js');
const Attente = require('../../v2/js/attente.js');
const { progTravail } = require('./aide-routine-programmee.js');

let n = 0;
const uuid = () => 'id-' + (++n);
beforeEach(() => { n = 0; });

const routine = (nb) => ({
  id: 'r1', nom: 'R',
  exercices: [{ id: 're1', exercise_slug: 'tractions', series: progTravail(nb, 10),
                repos_cible_s: null, groupe_superset: null, note: null }]
});
const creer = (nb) => Seance.creer({ id: 's1', userId: 'u1', titre: 'T',
  routine: routine(nb), idSerie: uuid });

const idsDe = (s) => s.exercices.reduce((a, e) => a.concat(e.series.map((x) => x.id)), []);
const valider = (s, i, j) => Seance.valider(s, i, j, new Date('2026-09-13T10:00:00Z'));

describe('1. « + Série » — la série porte un identifiant réel', () => {
  // LE DÉFAUT : `serieVide` n'acceptait qu'une FONCTION et rendait `null` pour
  // tout le reste. `app.js` lui passe `uuid()`, donc une CHAÎNE.
  test('une chaîne est un identifiant valide, pas un null', () => {
    const s = Seance.ajouterSerie(creer(1), 0, uuid());
    expect(idsDe(s)).toHaveLength(2);
    expect(idsDe(s)[1]).toBe('id-2');
    expect(idsDe(s).some((x) => !x)).toBe(false);
  });

  test('une fonction marche toujours — on n’a rien cassé en élargissant', () => {
    const s = Seance.ajouterSerie(creer(1), 0, uuid);
    expect(idsDe(s)[1]).toBe('id-2');
  });

  test('rien du tout reste null : c’est au semis de trancher, pas ici', () => {
    const s = Seance.ajouterSerie(creer(1), 0, undefined);
    expect(idsDe(s)[1]).toBe(null);
  });
});

describe('2. ajout d’exercice en séance — identifiants réels sur ses séries', () => {
  test('ajouterExercice reçoit une chaîne et la garde', () => {
    const s = Seance.ajouterExercice(creer(1), 'planche', uuid());
    expect(idsDe(s)).toEqual(['id-1', 'id-2']);
  });

  test('insererExercice reçoit la fonction et la garde aussi', () => {
    const s = Seance.insererExercice(creer(1), 1, 'planche', uuid);
    expect(idsDe(s).some((x) => !x)).toBe(false);
  });
});

describe('3. la garde de sortie — refusée AVANT le réseau, et ça se voit', () => {
  test('une série validée sans identifiant fait lever `lignes()`', () => {
    let s = Seance.ajouterSerie(creer(1), 0, undefined);   // id: null
    s = valider(s, 0, 1);
    expect(() => Seance.lignes(s)).toThrow(/sans identifiant/);
  });

  // ⚠️ CE QUI DISTINGUE UNE GARDE VIVANTE D'UN DÉCOR : elle doit nommer ce qui
  // ne va pas. Un message générique ne se retrouve pas dans un rapport de bug.
  test('le message nomme l’exercice et le rang', () => {
    let s = Seance.ajouterSerie(creer(1), 0, undefined);
    s = valider(s, 0, 1);
    expect(() => Seance.lignes(s)).toThrow(/tractions/);
    expect(() => Seance.lignes(s)).toThrow(/rang 2/);
  });

  test('une série NON validée sans identifiant ne lève pas : elle ne part pas', () => {
    const s = Seance.ajouterSerie(creer(1), 0, undefined);
    expect(() => Seance.lignes(s)).not.toThrow();
    expect(Seance.lignes(s)).toHaveLength(0);
  });

  test('après semis, la même séance passe la garde', () => {
    let s = Seance.ajouterSerie(creer(1), 0, undefined);
    s = valider(s, 0, 1);
    s = Seance.semerIdentifiants(s, uuid);
    const lignes = Seance.lignes(s);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].id).toBeTruthy();
  });
});

describe('semerIdentifiants — gratuit et sûr à répéter', () => {
  test('ne recopie RIEN quand rien ne manque : l’identité est conservée', () => {
    const s = creer(3);
    expect(Seance.semerIdentifiants(s, uuid)).toBe(s);
  });

  test('ne touche QUE les séries sans identifiant', () => {
    let s = Seance.ajouterSerie(creer(2), 0, undefined);
    const avant = idsDe(s);
    s = Seance.semerIdentifiants(s, uuid);
    const apres = idsDe(s);
    expect(apres.slice(0, 2)).toEqual(avant.slice(0, 2));
    expect(apres[2]).toBeTruthy();
  });

  test('deux passages ne resèment pas : le second est un no-op', () => {
    let s = Seance.semerIdentifiants(Seance.ajouterSerie(creer(1), 0, undefined), uuid);
    expect(Seance.semerIdentifiants(s, uuid)).toBe(s);
  });

  test('une séance nulle ou sans exercices ne fait pas tomber le semis', () => {
    expect(Seance.semerIdentifiants(null, uuid)).toBe(null);
    expect(Seance.semerIdentifiants({}, uuid)).toEqual({});
  });
});

describe('6. la file déjà bloquée — réparée, et le renvoi reste un REMPLACEMENT', () => {
  const fileBloquee = () => {
    let f = Attente.poser([], { table: Attente.SETS, op: Attente.REMPLACER, id: 's1',
      donnees: [{ id: 'a', rang: 1 }, { id: null, rang: 2 }, { id: null, rang: 3 }] });
    return Attente.marquerEchec(f, Attente.cleDe(Attente.SETS, 's1'),
      { code: '23502', message: 'null value in column "id"' });
  };

  test('la file EST bloquée avant réparation — sinon ce test ne teste rien', () => {
    const f = fileBloquee();
    expect(f[0].bloquee).toBeTruthy();
    expect(Attente.prochaine(f)).toBe(null);          // la tête bloquée arrête TOUT
  });

  test('le semis remplit les identifiants manquants et lève le blocage', () => {
    const r = Attente.reparerIdentifiants(fileBloquee(), uuid);
    expect(r.entrees).toBe(1);
    expect(r.lignes).toBe(2);
    expect(r.file[0].donnees.map((l) => l.id)).toEqual(['a', 'id-1', 'id-2']);
    expect(r.file[0].bloquee).toBe(null);
    expect(Attente.prochaine(r.file)).toBeTruthy();    // la file repart
  });

  // ⚠️ CE QUI EMPÊCHE LES SÉRIES ORPHELINES. L'intention reste `remplacer` et
  // porte la liste ENTIÈRE : rejouée, `remplacerSeries` supprime en base ce qui
  // n'y est plus. Un upsert seul ajouterait au lieu de remplacer, et un
  // identifiant semé ici laisserait une ligne morte derrière lui.
  test('l’intention reste un remplacement complet, jamais un ajout', () => {
    const r = Attente.reparerIdentifiants(fileBloquee(), uuid);
    expect(r.file[0].op).toBe(Attente.REMPLACER);
    expect(r.file[0].donnees).toHaveLength(3);
  });

  test('la version monte : une requête partie avant ne peut plus retirer l’entrée', () => {
    const f = fileBloquee();
    const r = Attente.reparerIdentifiants(f, uuid);
    expect(r.file[0].version).toBe(f[0].version + 1);
    expect(Attente.retirer(r.file, r.file[0].cle, f[0].version)).toHaveLength(1);
  });

  test('une entrée bloquée pour une AUTRE raison le reste', () => {
    let f = Attente.poser([], { table: Attente.SETS, op: Attente.REMPLACER, id: 's2',
      donnees: [{ id: 'a', rang: 1 }] });
    f = Attente.marquerEchec(f, Attente.cleDe(Attente.SETS, 's2'),
      { code: '42501', message: 'row-level security' });
    const r = Attente.reparerIdentifiants(f, uuid);
    expect(r.entrees).toBe(0);
    expect(r.file[0].bloquee).toBeTruthy();
  });

  test('une file saine n’est pas touchée', () => {
    const f = Attente.poser([], { table: Attente.SETS, op: Attente.REMPLACER, id: 's1',
      donnees: [{ id: 'a', rang: 1 }] });
    const r = Attente.reparerIdentifiants(f, uuid);
    expect(r.entrees).toBe(0);
    expect(r.file[0]).toBe(f[0]);
  });

  test('les entrées `sessions` ne sont pas concernées', () => {
    const f = Attente.poser([], { table: Attente.SESSIONS, op: Attente.UPSERT, id: 's1',
      donnees: { id: 's1', titre: null } });
    expect(Attente.reparerIdentifiants(f, uuid).entrees).toBe(0);
  });

  // ⚠️ CE TEST PORTE SUR UNE FORME QUI N'EXISTE PAS ENCORE, ET C'EST VOULU.
  //
  // Cette réparation ne sait réparer QUE des lignes de `sets`. Aujourd'hui le
  // plan de routine porte `{ voulues: [...] }` — un objet — donc le test
  // `Array.isArray` l'écarte déjà, et la garde de table ne sert à rien. Mais
  // « l'intention porte la LISTE voulue » : le jour où ce payload devient un
  // tableau, la réparation se mettrait à semer des identifiants dans des lignes
  // de routine, dont un `id` absent veut dire « à créer » et non « cassée ».
  // La garde de table dit la PORTÉE ; sans ce test elle disparaîtrait au
  // premier nettoyage, et le défaut qu'elle empêche n'existerait que plus tard.
  test('une entrée `routine_exercises` en forme de tableau reste intacte', () => {
    const f = [{ cle: 'routine_exercises:r1', seq: 1, table: Attente.ROUTINE_EXOS,
      op: Attente.PLAN, id: 'r1', donnees: [{ id: null, exercise_slug: 'squat', rang: 0 }],
      version: 1, essais: 0, bloquee: null }];
    const r = Attente.reparerIdentifiants(f, uuid);
    expect(r.entrees).toBe(0);
    expect(r.file[0].donnees[0].id).toBe(null);
  });
});

describe('9. l’état de synchronisation ne dit jamais « À jour » quand ça bloque', () => {
  const AJOUR = { code: 'ok', libelle: 'À jour', local: false };

  test('file bloquée → état `bloque`, pas l’état de lecture', () => {
    let f = Attente.poser([], { table: Attente.SETS, op: Attente.REMPLACER, id: 's1',
      donnees: [{ id: null, rang: 1 }] });
    f = Attente.marquerEchec(f, Attente.cleDe(Attente.SETS, 's1'), { code: '23502' });
    expect(Attente.deciderEtat(AJOUR, f).code).toBe('bloque');
  });

  test('après réparation, l’état redevient « à envoyer » — pas « à jour »', () => {
    let f = Attente.poser([], { table: Attente.SETS, op: Attente.REMPLACER, id: 's1',
      donnees: [{ id: null, rang: 1 }] });
    f = Attente.marquerEchec(f, Attente.cleDe(Attente.SETS, 's1'), { code: '23502' });
    const r = Attente.reparerIdentifiants(f, uuid);
    expect(Attente.deciderEtat(AJOUR, r.file).code).toBe('a-envoyer');
  });

  test('file vide → l’état de lecture passe, lui', () => {
    expect(Attente.deciderEtat(AJOUR, []).code).toBe('ok');
  });
});
