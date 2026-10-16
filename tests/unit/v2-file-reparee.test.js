//
// Chantier 37 — réparer les files DÉJÀ bloquées.
//
// L'APPAREIL NE SE RÉPARE PAS TOUT SEUL. Le chantier 36 empêche de créer une
// entrée hors bornes ; il ne rouvre pas celles qui sont déjà sur le disque,
// marquées définitives. Et `/__sw-off` — la seule sortie connue — efface la file
// d'écriture avec les données non montées.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : une file portant
// PLUSIEURS entrées, dont UNE SEULE réparable. Avec une entrée unique,
// « réparer ce qui est réparable » et « tout débloquer » donnent le même
// résultat — et c'est le seul cas qu'on teste spontanément. Les deux tests
// existants du chantier 33 portent justement sur une file à une entrée.

require('../../v2/js/modele.js'); // la lecture des nombres (`lireNombre`), chargée avant, comme dans index.html
const Attente = require('../../v2/js/attente.js');
const Seance = require('../../v2/js/seance.js');
const Routines = require('../../v2/js/routines.js');
const { progTravail } = require('./aide-routine-programmee.js');

const entree = (o) => Object.assign({
  seq: 1, version: 1, essais: 1, creation: false, posee_a: null, bloquee: null
}, o);

// Le report d'une déviation qui vidait un exercice — `series: 0`, refusé en
// `23514` par `routine_exos_series_bornees` (chantier 36, D5).
const REPORT = () => entree({
  cle: 'routine_exos:r1', seq: 1, table: Attente.ROUTINE_EXOS, op: Attente.PLAN, id: 'r1',
  donnees: { voulues: [{ id: 'e1', exercise_slug: 'curl', series: progTravail(0) }] },
  bloquee: { code: '23514', message: 'routine_exos_series_bornees' }
});

// Des reps hors `int4` — refusées en `22003` (chantier 36, D6).
const SERIES_HS = () => entree({
  cle: 'sets:s9', seq: 2, table: Attente.SETS, op: Attente.REMPLACER, id: 's9',
  donnees: [{ id: 'l1', session_id: 's9', reps: 99999999999, duree_s: 99999999999 }],
  bloquee: { code: '22003', message: 'reps hors int4' }
});

// Irréparable : aucune borne ne corrige un refus RLS.
const RLS = () => entree({
  cle: 'sets:s7', seq: 3, table: Attente.SETS, op: Attente.REMPLACER, id: 's7',
  donnees: [{ id: 'l2', session_id: 's7', reps: 5 }],
  bloquee: { code: '42501', message: 'row-level security' }
});

// Saine, et SANS AUCUN LIEN avec les précédentes.
const SAINE = () => entree({
  cle: 'sessions:s8', seq: 4, table: Attente.SESSIONS, op: Attente.UPSERT, id: 's8',
  donnees: { id: 's8' }, essais: 0
});

const reparer = (f) => Attente.reparerBornes(f, Seance.bornerLigne);
const par = (f, cle) => f.filter((e) => e.cle === cle)[0];

describe('la file bloquée, avant réparation', () => {
  test('⚠️ elle est VRAIMENT morte — sinon ces tests ne testeraient rien', () => {
    const f = [REPORT(), SERIES_HS(), RLS()];
    expect(f.every((e) => !!e.bloquee)).toBe(true);
    expect(Attente.prochaine(f)).toBeNull();
  });
});

// ── CE QUI EST RÉPARABLE, ET COMMENT — LES DEUX TABLES DIFFÈRENT ───────────
describe('réparer', () => {
  test('`routine_exos` : lever le blocage SUFFIT — les bornes s’appliquent à la vidange', () => {
    const r = reparer([REPORT()]);
    expect(r.entrees).toBe(1);
    expect(r.lignes).toBe(0);                       // aucune donnée n'a bougé
    expect(par(r.file, 'routine_exos:r1').bloquee).toBeNull();
    expect(par(r.file, 'routine_exos:r1').donnees)
      .toEqual({ voulues: [{ id: 'e1', exercise_slug: 'curl', series: progTravail(0) }] });
  });

  // ⚠️ LA PREUVE QUE LEVER SUFFIT — ET ELLE A CHANGÉ DE NATURE AU CHANTIER 43.
  //
  // Le refus d'origine était `routine_exos_series_bornees` sur `series: 0`, et
  // la preuve était que `normaliserExercice` ramenait le 0 dans la plage. Cette
  // colonne n'est plus écrite : la structure vit dans `routine_sets`, une ligne
  // par série, et AUCUNE contrainte n'y impose un minimum de lignes. Un
  // exercice vidé s'écrit donc pour ce qu'il est — zéro ligne — au lieu d'un
  // entier que la base refuse.
  //
  // Le défaut du chantier 36 a disparu PAR CONSTRUCTION. Ce test le VÉRIFIE
  // plutôt que de le supposer : rejouée telle quelle, l'entrée ne produit plus
  // rien qui ressemble à la valeur refusée, et ce qu'elle produit est légal.
  test('et rejouée telle quelle, elle produit une valeur que la base accepte', () => {
    const voulues = par(reparer([REPORT()]).file, 'routine_exos:r1').donnees.voulues;
    const plan = Routines.planEcritures([], voulues, 'r1', 'u1');
    expect(Object.keys(plan.insertions[0])).not.toContain('series');
    // L'exercice vidé : zéro ligne programmée, ce que `routine_sets` accepte.
    expect(plan.series).toEqual([{ id: 'e1', lignes: [] }]);
  });

  test('`sets` : la charge utile stockée est BORNÉE, puis débloquée', () => {
    const r = reparer([SERIES_HS()]);
    expect(r.entrees).toBe(1);
    expect(r.lignes).toBe(1);
    const e = par(r.file, 'sets:s9');
    expect(e.bloquee).toBeNull();
    expect(e.donnees[0].reps).toBe(Seance.REPS_MAX_SERIE);
    expect(e.donnees[0].duree_s).toBe(35999);   // 9:59:59, LA borne (`THModele.MAX_DUREE_S`, 119/E18)
    expect(e.donnees[0].id).toBe('l1');             // le reste est intact
  });

  // ⚠️ UNE COLONNE À LA FOIS, ET C'EST LA CAMPAGNE DE MUTATIONS QUI L'A EXIGÉ.
  // La fixture `SERIES_HS` porte `reps` ET `duree_s` hors bornes : chacune
  // masquait l'autre, et retirer la détection de changement sur l'une des deux
  // ne cassait rien. Une seule colonne fautive est la seule forme qui sépare
  // « je détecte ce changement-là » de « j'en détecte un autre ».
  const seule = (champs) => entree({
    cle: 'sets:u', seq: 1, table: Attente.SETS, op: Attente.REMPLACER, id: 'u',
    donnees: [Object.assign({ id: 'l', session_id: 'u' }, champs)],
    bloquee: { code: '22003', message: 'hors int4' }
  });

  test('`reps` SEULE hors bornes : détectée, bornée, débloquée', () => {
    const r = reparer([seule({ reps: 99999999999, duree_s: 60 })]);
    expect(r.entrees).toBe(1);
    expect(r.file[0].bloquee).toBeNull();
    expect(r.file[0].donnees[0].reps).toBe(Seance.REPS_MAX_SERIE);
    expect(r.file[0].donnees[0].duree_s).toBe(60);
  });

  test('`duree_s` SEULE hors bornes : détectée, bornée, débloquée', () => {
    const r = reparer([seule({ reps: 5, duree_s: 99999999999 })]);
    expect(r.entrees).toBe(1);
    expect(r.file[0].bloquee).toBeNull();
    expect(r.file[0].donnees[0].duree_s).toBe(35999);   // 9:59:59, LA borne (`THModele.MAX_DUREE_S`, 119/E18)
    expect(r.file[0].donnees[0].reps).toBe(5);
  });

  test('les deux dans les bornes : rien n’est détecté, rien n’est débloqué', () => {
    const r = reparer([seule({ reps: 5, duree_s: 60 })]);
    expect(r.entrees).toBe(0);
    expect(r.file[0].bloquee).toBeTruthy();
  });

  test('la version MONTE — une requête partie avant ne retire pas l’entrée réparée', () => {
    expect(par(reparer([SERIES_HS()]).file, 'sets:s9').version).toBe(2);
    expect(par(reparer([REPORT()]).file, 'routine_exos:r1').version).toBe(2);
    expect(par(reparer([SERIES_HS()]).file, 'sets:s9').essais).toBe(0);
  });
});

// ── CE QU'ON NE DÉBLOQUE PAS — LA RÈGLE DU CHANTIER 33 ────────────────────
describe('ce qui reste bloqué', () => {
  test('⚠️ un refus RLS reste bloqué : pas de déblocage en masse', () => {
    const r = reparer([RLS()]);
    expect(r.entrees).toBe(0);
    expect(par(r.file, 'sets:s7').bloquee).toBeTruthy();
  });

  test('un code hors liste reste bloqué, même sur une table qu’on sait borner', () => {
    const e = entree({ cle: 'sets:z', seq: 1, table: Attente.SETS, op: Attente.REMPLACER,
      id: 'z', donnees: [{ id: 'l', reps: 99999999999 }],
      bloquee: { code: '42703', message: 'colonne inconnue' } });
    expect(reparer([e]).entrees).toBe(0);
    expect(reparer([e]).file[0].bloquee).toBeTruthy();
  });

  // ⚠️ LE CAS QUI PIÈGE. Un `23514` sur `sets` dont AUCUNE borne ne touche la
  // cause — un `type_serie` inconnu, un `rpe` hors plage. Débloquer masquerait
  // le vrai défaut derrière une tentative qui échouerait à l'identique.
  test('un `23514` sur `sets` que les bornes ne changent PAS reste bloqué', () => {
    const e = entree({ cle: 'sets:y', seq: 1, table: Attente.SETS, op: Attente.REMPLACER,
      id: 'y', donnees: [{ id: 'l', reps: 5, duree_s: 60, type_serie: 'inconnu' }],
      bloquee: { code: '23514', message: 'sets_type_serie_ok' } });
    const r = reparer([e]);
    expect(r.entrees).toBe(0);
    expect(r.file[0].bloquee).toBeTruthy();
  });

  // ⚠️ LA FILE VIENT DU DISQUE, écrite par une version qu'on ne contrôle plus :
  // on ne suppose pas la forme de sa charge utile. Seules les entrées `sets`
  // portent des LIGNES de série ; appliquer les bornes de `sets` au tableau
  // d'une autre table écrirait des colonnes qui n'y existent pas.
  test('un tableau sur une AUTRE table n’est pas borné comme des séries', () => {
    const e = entree({ cle: 'routine_exos:w', seq: 1, table: Attente.ROUTINE_EXOS,
      op: Attente.UPSERT, id: 'w',
      donnees: [{ id: 'x', reps: 99999999999, duree_s: 99999999999 }],
      bloquee: { code: '22003', message: 'hors int4' } });
    const r = reparer([e]);
    expect(r.entrees).toBe(0);
    expect(r.file[0].bloquee).toBeTruthy();
    expect(r.file[0].donnees[0].reps).toBe(99999999999);   // pas touché
  });

  test('une entrée `routine_exos` HÉRITÉE (hors `plan`) n’est pas débloquée', () => {
    const e = entree({ cle: 'routine_exos:v', seq: 1, table: Attente.ROUTINE_EXOS,
      op: Attente.UPSERT, id: 'v', donnees: { series: 0 },
      bloquee: { code: '23514', message: 'routine_exos_series_bornees' } });
    expect(reparer([e]).entrees).toBe(0);
    expect(reparer([e]).file[0].bloquee).toBeTruthy();
  });
});

// ── LA CONFIGURATION DISCRIMINANTE ────────────────────────────────────────
describe('⚠️ une file MÊLÉE — réparables et irréparables ensemble', () => {
  const MELEE = () => [REPORT(), SERIES_HS(), RLS(), SAINE()];

  test('seules les deux réparables sont débloquées', () => {
    const r = reparer(MELEE());
    expect(r.entrees).toBe(2);
    expect(par(r.file, 'routine_exos:r1').bloquee).toBeNull();
    expect(par(r.file, 'sets:s9').bloquee).toBeNull();
    expect(par(r.file, 'sets:s7').bloquee).toBeTruthy();   // RLS, intacte
    expect(r.file).toHaveLength(4);                        // rien n'est jeté
  });

  test('et la file repart par la PREMIÈRE réparée, dans l’ordre', () => {
    expect(Attente.prochaine(reparer(MELEE()).file).cle).toBe('routine_exos:r1');
  });
});

// ── L'ENTRÉE IRRÉPARABLE — CE QUI A ÉTÉ TRANCHÉ ───────────────────────────
//
// Elle est DÉPASSÉE, jamais jetée. La dépendance est par ENTITÉ, pas globale :
// `sets:X` a besoin de `sessions:X`, et ne doit rien à `sessions:Y`.
describe('l’entrée irréparable ne condamne plus la file', () => {
  test('⚠️ une entrée saine SANS LIEN passe devant une entrée bloquée', () => {
    const f = [RLS(), SAINE()];
    expect(Attente.prochaine(f).cle).toBe('sessions:s8');
  });

  test('mais elle n’est pas jetée : elle reste en file, et marquée', () => {
    const f = [RLS(), SAINE()];
    expect(f).toHaveLength(2);
    expect(par(f, 'sets:s7').bloquee).toBeTruthy();
  });

  test('⚠️ ce qui PARTAGE son identifiant reste retenu — l’ordre compte dans l’entité', () => {
    const f = [
      entree({ cle: 'sessions:s7', seq: 1, table: Attente.SESSIONS, op: Attente.UPSERT,
               id: 's7', donnees: { id: 's7' }, bloquee: { code: '42501' } }),
      entree({ cle: 'sets:s7', seq: 2, table: Attente.SETS, op: Attente.REMPLACER,
               id: 's7', donnees: [], essais: 0 }),
      SAINE()
    ];
    // `sets:s7` dépend de `sessions:s7` par sa clé étrangère : il attend.
    expect(Attente.prochaine(f).cle).toBe('sessions:s8');
  });

  test('tout bloqué : plus rien à servir, et on le dit', () => {
    const f = [RLS(), entree({ cle: 'sets:q', seq: 2, table: Attente.SETS, id: 'q',
      donnees: [], bloquee: { code: '42501' } })];
    expect(Attente.prochaine(f)).toBeNull();
    expect(Attente.deciderEtat({ code: 'a-jour' }, f).code).toBe('bloque');
  });

  // Non-régression du chantier 33 : sur une file d'UNE entrée, rien ne change.
  test('non-régression : une file d’une seule entrée bloquée ne sert rien', () => {
    expect(Attente.prochaine([RLS()])).toBeNull();
  });
});

// ── LA FILE SAINE — LE DÉMARRAGE NE TOUCHE À RIEN ─────────────────────────
describe('une file saine', () => {
  test('n’est pas réparée, et pas recopiée', () => {
    const f = [SAINE()];
    const r = reparer(f);
    expect(r.entrees).toBe(0);
    expect(r.lignes).toBe(0);
    expect(r.file[0]).toBe(f[0]);          // la MÊME entrée, pas une copie
  });

  test('une file vide ne lève pas', () => {
    expect(reparer([]).entrees).toBe(0);
    expect(reparer(null).file).toEqual([]);
  });
});

// ── L'ÉTAT DE SYNCHRONISATION — LA PROPRIÉTÉ DU CHANTIER 33 TIENT-ELLE ? ──
//
// Trois chantiers ont touché ce chemin depuis (34, 35, 36). On le revérifie.
describe('l’état de synchronisation', () => {
  const aJour = { code: 'a-jour', libelle: 'À jour', local: false };

  test('⚠️ ne dit JAMAIS « À jour » tant qu’une entrée est bloquée', () => {
    const e = Attente.deciderEtat(aJour, [RLS(), SAINE()]);
    expect(e.code).toBe('bloque');
    expect(e.libelle).not.toMatch(/À jour/);
    expect(e.libelle).toMatch(/refusé/);
  });

  test('ni quand la file est simplement en attente', () => {
    expect(Attente.deciderEtat(aJour, [SAINE()]).code).toBe('a-envoyer');
  });

  test('ni quand un envoi a échoué sans être définitif (chantier 36)', () => {
    expect(Attente.deciderEtat(aJour, [entree({ cle: 'a', essais: 2 })]).code).toBe('echec');
  });

  test('« bloqué » prime sur « en échec », et les deux sur « à envoyer »', () => {
    const f = [SAINE(), entree({ cle: 'b', seq: 5, essais: 3 }), RLS()];
    expect(Attente.deciderEtat(aJour, f).code).toBe('bloque');
  });

  // ⚠️ ET APRÈS RÉPARATION, l'état redevient honnête : plus rien n'est refusé.
  test('après réparation, l’état ne dit plus « refusé » s’il ne reste rien de bloqué', () => {
    const r = reparer([REPORT(), SERIES_HS(), SAINE()]);
    const e = Attente.deciderEtat(aJour, r.file);
    expect(e.code).toBe('a-envoyer');
    expect(e.libelle).not.toMatch(/refusé/);
  });

  test('file vide : l’état de LECTURE passe tel quel', () => {
    expect(Attente.deciderEtat(aJour, [])).toBe(aJour);
  });
});

// ── DEUX ENTONNOIRS, PAS TROIS ────────────────────────────────────────────
describe('la réparation borne comme la saisie', () => {
  test('⚠️ `bornerLigne` et `modifierSerie` donnent la MÊME valeur, cas par cas', () => {
    let n = 0;
    const uuid = () => 'id-' + (++n);
    const seanceAvec = (champs) => {
      const s = Seance.ajouterExercice(
        Seance.creer({ id: 's', userId: 'u', idSerie: uuid }), 'squat', uuid);
      return Seance.modifierSerie(s, 0, 0, champs).exercices[0].series[0];
    };
    ['99999999999', '1e21', '2147483648', '104', '0', ''].forEach((v) => {
      const saisie = seanceAvec({ reps: v, duree_s: v });
      const reparee = Seance.bornerLigne({ reps: v, duree_s: v }).ligne;
      expect([v, reparee.reps]).toEqual([v, saisie.reps]);
      expect([v, reparee.duree_s]).toEqual([v, saisie.duree_s]);
    });
  });

  test('une ligne déjà dans les bornes n’est pas recopiée', () => {
    const l = { id: 'a', reps: 5, duree_s: 60 };
    const r = Seance.bornerLigne(l);
    expect(r.change).toBe(false);
    expect(r.ligne).toBe(l);
  });

  test('une ligne sans ces colonnes n’est pas touchée', () => {
    const l = { id: 'a', charge_kg: 100 };
    expect(Seance.bornerLigne(l).change).toBe(false);
    expect(Seance.bornerLigne(null).change).toBe(false);
  });
});
