/** @jest-environment node */
//
// v2/js/routines.js — la bibliothèque de routines (chantier 21).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// Ce banc n'est pas un tableau en mémoire : c'est une base de PAPIER qui
// REJETTE ce que la vraie base rejette. Relevé en base, pas supposé :
//
//   CREATE UNIQUE INDEX routine_exos_rang_uniq
//     ON routine_exercises (routine_id, rang);              -- non différable
//   CREATE UNIQUE INDEX routines_user_nom_actif_uniq
//     ON routines (user_id, lower(btrim(nom))) WHERE archivee_a IS NULL;
//
// Sans ces deux refus, le banc serait plus permissif que Postgres et les tests
// 2, 3 et 4 ne prouveraient rien : n'importe quel ordre d'écritures passerait,
// et « renuméroter proprement » serait indistinguable de « écrire n'importe
// comment ». C'est exactement le piège des trois occurrences du §2 quater.
//
// Pour les tests 4 et 5, la configuration discriminante est en plus une routine
// d'au moins TROIS exercices avec un retrait AU MILIEU : sur deux exercices, ou
// en retirant le dernier, renuméroter et ne rien faire donnent le même résultat.

// PR 6 de la consolidation — la série de travail et son compte vivent dans
// `modele.js` et `semaine.js`, lus à l'appel par les autres modules.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/semaine.js');
const Routines = require('../../v2/js/routines.js');
const { progTravail } = require('./aide-routine-programmee.js');

// ── La base de papier ──────────────────────────────────────────────────────

function erreurPG(code, message) {
  const e = new Error(message);
  e.code = code;
  e.details = message;
  return e;
}

function creerBase(options) {
  const o = options || {};
  const base = {
    routines: [],
    exos: [],
    series: [],
    journal: [],
    pannes: o.pannes || {},   // { majExercice: 2 } = tombe au 2e appel de majExercice
    appels: {},
    graine: 0
  };

  const id = (prefixe) => prefixe + (++base.graine);
  const replie = (n) => String(n || '').trim().toLowerCase();

  // `pannes.majExercice = 2` veut dire « tombe au DEUXIÈME appel », pas « tombe
  // deux fois ». C'est ce qui permet de distinguer une coupure avant toute
  // écriture d'une coupure au milieu — et ces deux cas ne se racontent pas
  // pareil à l'utilisateur.
  function peutTomber(operation) {
    const n = base.pannes[operation];
    if (!n) return;
    base.appels[operation] = (base.appels[operation] || 0) + 1;
    if (base.appels[operation] !== n) return;
    throw erreurPG(base.pannes[operation + '_code'] || undefined, 'Failed to fetch');
  }

  function verifierRangs() {
    const vus = new Set();
    for (const e of base.exos) {
      const cle = e.routine_id + '#' + e.rang;
      if (vus.has(cle)) {
        throw erreurPG('23505',
          'duplicate key value violates unique constraint "routine_exos_rang_uniq"');
      }
      vus.add(cle);
    }
  }

  function verifierNoms() {
    const vus = new Set();
    for (const r of base.routines) {
      if (r.archivee_a) continue;         // l'index est PARTIEL : les archivées ne comptent pas
      const cle = r.user_id + '#' + replie(r.nom);
      if (vus.has(cle)) {
        throw erreurPG('23505',
          'duplicate key value violates unique constraint "routines_user_nom_actif_uniq"');
      }
      vus.add(cle);
    }
  }

  const ecrivain = {
    async creerRoutine(champs) {
      base.journal.push({ op: 'creerRoutine', champs: champs });
      peutTomber('creerRoutine');
      const ligne = Object.assign({ id: id('r'), archivee_a: null }, champs);
      base.routines.push(ligne);
      try { verifierNoms(); } catch (e) { base.routines.pop(); throw e; }
      return ligne;
    },
    async majRoutine(idRoutine, champs) {
      base.journal.push({ op: 'majRoutine', id: idRoutine, champs: champs });
      peutTomber('majRoutine');
      const ligne = base.routines.find((r) => r.id === idRoutine);
      const avant = Object.assign({}, ligne);
      Object.assign(ligne, champs);
      try { verifierNoms(); } catch (e) { Object.assign(ligne, avant); throw e; }
      return ligne;
    },
    async supprimerRoutine(idRoutine) {
      base.journal.push({ op: 'supprimerRoutine', id: idRoutine });
      peutTomber('supprimerRoutine');
      base.routines = base.routines.filter((r) => r.id !== idRoutine);
      base.exos = base.exos.filter((e) => e.routine_id !== idRoutine);
    },
    async insererExercices(lignes) {
      base.journal.push({ op: 'insererExercices', lignes: lignes });
      peutTomber('insererExercices');
      const ajoutees = lignes.map((l) => Object.assign({ id: id('e') }, l));
      base.exos = base.exos.concat(ajoutees);
      try { verifierRangs(); } catch (e) { base.exos = base.exos.slice(0, -ajoutees.length); throw e; }
      return ajoutees;
    },
    async majExercice(idExo, champs) {
      base.journal.push({ op: 'majExercice', id: idExo, champs: champs });
      peutTomber('majExercice');
      const ligne = base.exos.find((e) => e.id === idExo);
      const avant = Object.assign({}, ligne);
      Object.assign(ligne, champs);
      try { verifierRangs(); } catch (e) { Object.assign(ligne, avant); throw e; }
    },
    async supprimerExercices(ids) {
      base.journal.push({ op: 'supprimerExercices', ids: ids });
      peutTomber('supprimerExercices');
      base.exos = base.exos.filter((e) => ids.indexOf(e.id) < 0);
      // CASCADE : `routine_sets_routine_exercise_id_fkey`.
      base.series = base.series.filter((s) => ids.indexOf(s.routine_exercise_id) < 0);
    },
    // ⚠️ `routine_sets_rang_unique` est DIFFÉRABLE, contrairement à celui des
    // exercices : remplacer les lignes d'un exercice en bloc ne passe donc
    // jamais par une collision. La base de papier le reflète — elle refuserait
    // un doublon APRÈS l'opération, pas pendant.
    async remplacerSeriesRoutine(idExo, lignes) {
      base.journal.push({ op: 'remplacerSeriesRoutine', id: idExo, lignes: lignes });
      peutTomber('remplacerSeriesRoutine');
      base.series = base.series.filter((s) => s.routine_exercise_id !== idExo);
      const ajoutees = (lignes || []).map((l) => Object.assign({ id: id('rs') }, l));
      base.series = base.series.concat(ajoutees);
      const vus = new Set();
      for (const s of base.series) {
        const cle = s.routine_exercise_id + '#' + s.rang;
        if (vus.has(cle)) {
          throw erreurPG('23505',
            'duplicate key value violates unique constraint "routine_sets_rang_unique"');
        }
        vus.add(cle);
      }
      return ajoutees;
    }
  };

  base.ecrivain = ecrivain;
  base.exosDe = (idRoutine) => base.exos
    .filter((e) => e.routine_id === idRoutine)
    .sort((a, b) => a.rang - b.rang);
  base.seriesDe = (idExo) => base.series
    .filter((s) => s.routine_exercise_id === idExo)
    .sort((a, b) => a.rang - b.rang);
  return base;
}

const USER = 'u-1';
// ⚠️ `uuid` EST UNE DÉPENDANCE DE L'ÉCRITURE depuis le chantier 43 : un exercice
// neuf porte son identifiant AVANT d'être écrit, parce que ses séries
// programmées le visent par clé étrangère. Sans fabricant, `enregistrer` lève.
let graineId = 0;
const uuid = () => 'ex-' + (++graineId);
const CTX = { userId: USER, uuid: uuid };
const exo = (slug, extra) => Object.assign(
  { id: null, exercise_slug: slug, series: progTravail(3, null), repos_cible_s: null }, extra);

// Recharge une routine depuis la base de papier, sous la forme d'un brouillon
// prêt à être ré-enregistré — exactement ce que fait `brouillonDe` dans app.js.
function relire(base, idRoutine) {
  const lignes = base.exosDe(idRoutine);
  const r = base.routines.find((x) => x.id === idRoutine);
  return {
    id: idRoutine, nom: r.nom, nomChange: false,
    // ⚠️ AU VOCABULAIRE DE LA SAISIE, COMME `app.js`. `normaliserRoutine` fait
    // passer chaque `routine_sets` par `Routines.enSaisie` avant que quiconque
    // la voie ; relire ici les noms de la CIBLE donnerait un brouillon que
    // l'app ne produit jamais, et le test mesurerait un chemin qui n'existe pas.
    exercices: lignes.map((l) => ({
      id: l.id, exercise_slug: l.exercise_slug, repos_cible_s: l.repos_cible_s,
      // La structure se relit depuis `routine_sets`, plus depuis deux entiers.
      series: base.seriesDe(l.id).map(Routines.enSaisie)
    })),
    // Les existantes aussi : `planEcritures` compare les séries d'avant à
    // celles d'après pour n'écrire que ce qui change.
    existantes: lignes.map((l) => Object.assign({}, l,
      { series: base.seriesDe(l.id).map(Routines.enSaisie) }))
  };
}

async function creerTrois(base, nom) {
  const r = await Routines.enregistrer({
    id: null, nom: nom || 'Push',
    exercices: [exo('squat'), exo('banc'), exo('souleve')],
    existantes: []
  }, base.ecrivain, CTX);
  expect(r.ok).toBe(true);
  return r.routine.id;
}

// ── 1. Création ────────────────────────────────────────────────────────────

describe('1. création', () => {
  test('trois exercices → rangs 0, 1, 2 et la structure attendue', async () => {
    const base = creerBase();
    const id = await creerTrois(base);

    const lignes = base.exosDe(id);
    expect(lignes.map((l) => l.rang)).toEqual([0, 1, 2]);
    expect(lignes.map((l) => l.exercise_slug)).toEqual(['squat', 'banc', 'souleve']);
    expect(lignes.every((l) => l.routine_id === id)).toBe(true);
    // ⚠️ `series` N'EST PLUS UNE COLONNE (chantier 43) : la structure est une
    // ligne par série dans `routine_sets`. L'entier n'est plus ni lu ni écrit.
    expect(lignes.every((l) => l.series === undefined)).toBe(true);
    lignes.forEach((l) => {
      const prog = base.seriesDe(l.id);
      expect(prog.map((x) => x.rang)).toEqual([1, 2, 3]);          // rang >= 1
      expect(prog.every((x) => x.type_serie === 'travail')).toBe(true);
      expect(prog.every((x) => x.user_id === USER)).toBe(true);    // NOT NULL
    });
    expect(base.routines[0].user_id).toBe(USER);   // sans lui, le WITH CHECK refuse
  });
});

// ── 2 et 3. Le nom ─────────────────────────────────────────────────────────

describe('2-3. l’unicité du nom', () => {
  test('doublon parmi les NON ARCHIVÉES → refusé, avec un message qui le dit', async () => {
    const base = creerBase();
    await creerTrois(base, 'Push');

    // La détection locale, d'abord : elle évite l'aller-retour.
    const liste = base.routines.map((r) => ({ id: r.id, nom: r.nom, archivee_a: r.archivee_a }));
    const verdict = Routines.valider({ id: null, nom: 'push  ', exercices: [] }, liste);
    expect(verdict.valide).toBe(false);
    expect(verdict.soucis[0]).toEqual({ champ: 'nom', raison: 'doublon' });

    // Et le filet, ensuite : deux appareils peuvent créer le même nom en même
    // temps, aucune vérification locale ne couvre ça.
    const r = await Routines.enregistrer(
      { id: null, nom: 'PUSH', exercices: [exo('curl')], existantes: [] },
      base.ecrivain, CTX);
    expect(r.ok).toBe(false);
    expect(r.erreur).toBe('doublon');
    expect(Routines.messageErreur(r)).toMatch(/déjà une routine de ce nom/);
  });

  test('le même nom redevient libre après ARCHIVAGE de la première', async () => {
    const base = creerBase();
    const id = await creerTrois(base, 'Push');
    await base.ecrivain.majRoutine(id, { archivee_a: new Date().toISOString() });

    const liste = base.routines.map((r) => ({ id: r.id, nom: r.nom, archivee_a: r.archivee_a }));
    expect(Routines.nomEnConflit('Push', liste, null)).toBe(false);

    const r = await Routines.enregistrer(
      { id: null, nom: 'Push', exercices: [exo('curl')], existantes: [] },
      base.ecrivain, CTX);
    expect(r.ok).toBe(true);

    // L'archivée est toujours là : les séances qui la référencent gardent leur lien.
    expect(base.routines.length).toBe(2);
    expect(base.routines.filter((x) => x.archivee_a).length).toBe(1);
  });

  test('renommer une routine ne la heurte pas elle-même', () => {
    const liste = [{ id: 'r1', nom: 'Push', archivee_a: null }];
    expect(Routines.nomEnConflit('Push', liste, 'r1')).toBe(false);
    expect(Routines.nomEnConflit('Push', liste, 'r2')).toBe(true);
  });
});

// ── 4. Réordonnancement ────────────────────────────────────────────────────

describe('4. réordonnancement', () => {
  test('échanger deux voisins : renuméroté sans collision, ordre conservé', async () => {
    const base = creerBase();
    const id = await creerTrois(base);

    // On descend « banc » : squat, souleve, banc.
    const b = relire(base, id);
    const tmp = b.exercices[1]; b.exercices[1] = b.exercices[2]; b.exercices[2] = tmp;

    const r = await Routines.enregistrer(b, base.ecrivain, CTX);
    expect(r.ok).toBe(true);   // ← tombe si une écriture heurte routine_exos_rang_uniq

    const lignes = base.exosDe(id);
    expect(lignes.map((l) => l.exercise_slug)).toEqual(['squat', 'souleve', 'banc']);
    expect(lignes.map((l) => l.rang)).toEqual([0, 1, 2]);
  });

  test('un échange est un CYCLE : il passe forcément par un rang tampon', () => {
    const avant = [
      { id: 'A', exercise_slug: 'squat', rang: 0, series: progTravail(3, null), repos_cible_s: null },
      { id: 'B', exercise_slug: 'banc', rang: 1, series: progTravail(3, null), repos_cible_s: null },
      { id: 'C', exercise_slug: 'souleve', rang: 2, series: progTravail(3, null), repos_cible_s: null }
    ];
    const plan = Routines.planEcritures(avant, [avant[0], avant[2], avant[1]], 'R');
    // Écrire « B prend 2 » alors que C l'occupe encore échouerait : la première
    // écriture sort donc une ligne du chemin.
    expect(plan.majs[0].champs.rang).toBeGreaterThan(2);
    expect(plan.majs.length).toBe(3);
  });

  test('renverser QUATRE exercices tient aussi — deux cycles imbriqués', async () => {
    const base = creerBase();
    const r0 = await Routines.enregistrer({
      id: null, nom: 'Full', existantes: [],
      exercices: [exo('a'), exo('b'), exo('c'), exo('d')]
    }, base.ecrivain, CTX);
    const id = r0.routine.id;

    const b = relire(base, id);
    b.exercices.reverse();
    const r = await Routines.enregistrer(b, base.ecrivain, CTX);
    expect(r.ok).toBe(true);

    expect(base.exosDe(id).map((l) => l.exercise_slug)).toEqual(['d', 'c', 'b', 'a']);
    expect(base.exosDe(id).map((l) => l.rang)).toEqual([0, 1, 2, 3]);
  });
});

// ── 5. Suppression au milieu ───────────────────────────────────────────────

describe('5. suppression d’un exercice au milieu', () => {
  test('les rangs suivants se resserrent, sans trou', async () => {
    const base = creerBase();
    const id = await creerTrois(base);

    const b = relire(base, id);
    b.exercices.splice(1, 1);                    // AU MILIEU : c'est ce qui discrimine
    const r = await Routines.enregistrer(b, base.ecrivain, CTX);
    expect(r.ok).toBe(true);

    const lignes = base.exosDe(id);
    expect(lignes.map((l) => l.exercise_slug)).toEqual(['squat', 'souleve']);
    expect(lignes.map((l) => l.rang)).toEqual([0, 1]);   // pas [0, 2]
  });

  test('retirer le DERNIER ne demande aucune renumérotation — le cas permissif', () => {
    const avant = [
      { id: 'A', exercise_slug: 'a', rang: 0, series: progTravail(3, null), repos_cible_s: null },
      { id: 'B', exercise_slug: 'b', rang: 1, series: progTravail(3, null), repos_cible_s: null },
      { id: 'C', exercise_slug: 'c', rang: 2, series: progTravail(3, null), repos_cible_s: null }
    ];
    // C'est l'ASYMÉTRIE du §2 quater : ici « renuméroter » et « ne rien faire »
    // donnent le même résultat. Un banc qui ne testerait que ça ne prouverait rien.
    expect(Routines.planEcritures(avant, [avant[0], avant[1]], 'R').majs).toEqual([]);
    // Au milieu, en revanche, il FAUT écrire.
    expect(Routines.planEcritures(avant, [avant[0], avant[2]], 'R').majs)
      .toEqual([{ id: 'C', champs: { rang: 1 } }]);
  });
});

// ── 6. Le repos cible ──────────────────────────────────────────────────────

describe('6. repos cible', () => {
  test('absent : accepté, et envoyé comme NULL — pas comme une valeur inventée', async () => {
    const base = creerBase();
    const id = await creerTrois(base);
    expect(base.exosDe(id).every((l) => l.repos_cible_s === null)).toBe(true);
  });

  test('hors bornes : 4 s et 2000 s sont refusés, 5 s et 1800 s passent', () => {
    expect(Routines.reposValide(4).ok).toBe(false);
    expect(Routines.reposValide(2000).ok).toBe(false);
    expect(Routines.reposValide(5).ok).toBe(true);
    expect(Routines.reposValide(1800).ok).toBe(true);
    expect(Routines.reposValide('').ok).toBe(true);       // vide = non prescrit
    expect(Routines.reposValide(null).ok).toBe(true);
    expect(Routines.reposValide('90,5').ok).toBe(false);  // pas un entier

    const v = Routines.valider(
      { id: null, nom: 'Push', exercices: [exo('squat', { repos_cible_s: 4 })] }, []);
    expect(v.valide).toBe(false);
    expect(v.soucis[0].champ).toBe('repos_cible_s');
  });

  // ⚠️ `seriesValides` ET `serieBornee` SONT PARTIES AVEC LEUR COLONNE (ch. 43).
  // `routine_exercises.series` n'est plus écrite ; une structure est une liste
  // de lignes, et `routine_sets` n'impose aucun minimum. Garder les bornes
  // « au cas où » aurait laissé un entonnoir que plus rien ne traverse — la
  // leçon de `palier.js` au chantier 17.
  test('les reps se bornent, et elles restent facultatives', () => {
    expect(Routines.repsValides(0).ok).toBe(false);
    expect(Routines.repsValides(101).ok).toBe(false);
    expect(Routines.repsValides(100).ok).toBe(true);
    expect(Routines.repsValides(null).ok).toBe(true);     // reps facultatives
    expect(Routines.seriesValides).toBeUndefined();
    expect(Routines.serieBornee).toBeUndefined();
    expect(Routines.SERIES_MAX).toBeUndefined();
  });
});

// ── 7. Aucun champ de charge ───────────────────────────────────────────────

describe('7. la routine ne porte AUCUNE charge', () => {
  const INTERDITS = /charge|poids|kg|weight|masse|rm\b|e1rm/i;

  test('rien de ce qui part en base ne ressemble à une charge', async () => {
    const base = creerBase();
    // Un brouillon SALE : on y glisse exprès ce qui ne doit jamais passer.
    await Routines.enregistrer({
      id: null, nom: 'Push', existantes: [],
      exercices: [exo('squat', { charge_kg: 120, poids: 120, repos_cible_s: 120 })]
    }, base.ecrivain, CTX);

    const envoyees = [];
    base.journal.forEach(function (j) {
      (j.lignes || []).forEach(function (l) { envoyees.push(l); });
      if (j.champs) envoyees.push(j.champs);
    });
    expect(envoyees.length).toBeGreaterThan(0);

    const cles = new Set();
    envoyees.forEach(function (l) { Object.keys(l).forEach(function (k) { cles.add(k); }); });

    // ⚠️ L'INVARIANT S'EST PRÉCISÉ AU CHANTIER 43, IL NE S'EST PAS RELÂCHÉ.
    //
    // `routine_sets.charge_cible_kg` existe désormais — la spec l'autorise
    // explicitement (§7 quindecies.3) : une CIBLE, facultative, qui ne prime
    // jamais sur le moteur. Ce qui reste interdit, c'est une charge OBSERVÉE :
    // `charge_kg`, un poids, un RM. La routine dit la structure, le moteur dit
    // les charges.
    const CIBLE = 'charge_cible_kg';
    Array.from(cles).filter((k) => k !== CIBLE)
      .forEach(function (k) { expect(k).not.toMatch(INTERDITS); });
    base.exos.forEach(function (l) {
      Object.keys(l).forEach(function (k) { expect(k).not.toMatch(INTERDITS); });
    });
    // Et la cible n'est JAMAIS inventée : le brouillon sale portait `charge_kg`,
    // pas de cible — elle part donc à NULL.
    expect(base.series.length).toBeGreaterThan(0);
    base.series.forEach(function (l) {
      expect(l.charge_cible_kg).toBeNull();
      Object.keys(l).filter((k) => k !== CIBLE)
        .forEach(function (k) { expect(k).not.toMatch(INTERDITS); });
    });

    // La liste blanche est la garde, et elle est explicite.
    // `groupe_superset` et `note` entrés au chantier 28 : la routine porte
    // désormais son groupement et sa note, toujours AUCUNE charge.
    expect(Routines.CHAMPS_EXERCICE).toEqual(
      ['routine_id', 'exercise_slug', 'rang',
       'repos_cible_s', 'groupe_superset', 'note']);
    // Et celle des séries programmées, tout aussi explicite.
    expect(Routines.CHAMPS_SERIE).toEqual(
      ['routine_exercise_id', 'user_id', 'rang', 'type_serie', 'reps_visees',
       'charge_cible_kg', 'duree_cible_s', 'distance_cible_m']);
    // Deux listes blanches, parce qu'il y a deux tables. Aucune clé envoyée
    // n'est hors de leur union — et l'union reste énumérée, pas devinée.
    const hors = Array.from(cles).filter(function (k) {
      return Routines.CHAMPS_EXERCICE.indexOf(k) < 0 &&
             Routines.CHAMPS_SERIE.indexOf(k) < 0 &&
             // `id` est fabriqué par l'app depuis le chantier 43 : les séries
             // programmées visent leur exercice par clé étrangère, donc un
             // exercice neuf le porte AVANT d'être écrit.
             ['id', 'user_id', 'nom', 'modifiee_a', 'archivee_a'].indexOf(k) < 0;
    });
    expect(hors).toEqual([]);
  });

  test('`repos_cible_s` n’est PAS une charge — la garde ne rejette pas tout', () => {
    expect(Routines.CHAMPS_EXERCICE).toContain('repos_cible_s');
    expect('repos_cible_s').not.toMatch(INTERDITS);
  });
});

// ── 8. Échec d'écriture ────────────────────────────────────────────────────

describe('8. l’écriture échoue', () => {
  test('réseau muet à la création : rien en base, rien de perdu à l’écran', async () => {
    const base = creerBase({ pannes: { creerRoutine: 1 } });
    const brouillon = {
      id: null, nom: 'Push', existantes: [],
      exercices: [exo('squat'), exo('banc'), exo('souleve')]
    };
    const copie = JSON.parse(JSON.stringify(brouillon));

    const r = await Routines.enregistrer(brouillon, base.ecrivain, CTX);

    expect(r.ok).toBe(false);
    expect(r.erreur).toBe('reseau');
    expect(r.partiel).toBe(false);
    expect(Routines.messageErreur(r)).toMatch(/rien n’a été enregistré/);
    expect(base.routines).toEqual([]);
    expect(brouillon).toEqual(copie);   // le brouillon n'est pas touché
  });

  test('les exercices échouent APRÈS la routine : la routine vide est défaite', async () => {
    // Sans ce rattrapage, le nom resterait pris par une routine vide — et
    // l'unicité porte sur les non archivées, donc le réessai échouerait.
    const base = creerBase({ pannes: { insererExercices: 1 } });
    const r = await Routines.enregistrer(
      { id: null, nom: 'Push', exercices: [exo('squat')], existantes: [] },
      base.ecrivain, CTX);

    expect(r.ok).toBe(false);
    expect(r.partiel).toBe(false);
    expect(base.routines).toEqual([]);
    expect(base.journal.map((j) => j.op)).toContain('supprimerRoutine');

    // Et le réessai passe, précisément parce que le nom a été libéré.
    const base2 = creerBase();
    const ok = await Routines.enregistrer(
      { id: null, nom: 'Push', exercices: [exo('squat')], existantes: [] },
      base2.ecrivain, CTX);
    expect(ok.ok).toBe(true);
  });

  test('une MODIFICATION coupée en plein milieu se dit incomplète', async () => {
    const base = creerBase();
    const id = await creerTrois(base);
    base.pannes.majExercice = 1;

    const b = relire(base, id);
    b.exercices.reverse();
    const r = await Routines.enregistrer(b, base.ecrivain, CTX);

    expect(r.ok).toBe(false);
    expect(r.partiel).toBe(false);   // rien n'avait encore été écrit
    expect(Routines.messageErreur(r)).toMatch(/rien n’a été enregistré/);

    // La base n'a bougé sur rien : l'ordre d'origine est intact.
    expect(base.exosDe(id).map((l) => l.rang)).toEqual([0, 1, 2]);
  });

  test('une coupure APRÈS la première écriture est annoncée comme incomplète', async () => {
    const base = creerBase();
    const id = await creerTrois(base);
    base.pannes.majExercice = 2;    // la 1re passe, la 2e tombe

    const b = relire(base, id);
    b.exercices.reverse();
    const r = await Routines.enregistrer(b, base.ecrivain, CTX);

    expect(r.ok).toBe(false);
    expect(r.partiel).toBe(true);
    expect(Routines.messageErreur(r)).toMatch(/incomplet/);
    // Et même à moitié écrite, la base reste COHÉRENTE : aucun rang en double.
    const rangs = base.exosDe(id).map((l) => l.rang);
    expect(new Set(rangs).size).toBe(rangs.length);
  });

  test('un refus du RLS est nommé pour ce qu’il est, jamais avalé', () => {
    const e = new Error('new row violates row-level security policy for table "routines"');
    expect(Routines.classerErreur(e)).toBe('refuse');
    expect(Routines.messageErreur({ erreur: 'refuse' })).toMatch(/refusée par le serveur/);
  });

  test('un 23505 sur le RANG n’est pas un doublon de nom — sinon un défaut du plan se cacherait', () => {
    const rang = new Error('duplicate key value violates unique constraint "routine_exos_rang_uniq"');
    rang.code = '23505';
    const nom = new Error('duplicate key value violates unique constraint "routines_user_nom_actif_uniq"');
    nom.code = '23505';
    expect(Routines.classerErreur(rang)).toBe('collision-rang');
    expect(Routines.classerErreur(nom)).toBe('doublon');
  });
});

// ── L'aperçu et la recherche ───────────────────────────────────────────────

describe('la liste et le catalogue', () => {
  // ⚠️ L'APERÇU COMPTE LES SÉRIES DE TRAVAIL, ET ELLES SEULES (ch. 43 puis 44).
  // « 3 séries × 8 reps » n'a plus de sens : les lignes ne sont plus
  // identiques. Et c'est le MÊME compte que la barre de semaine et la carte de
  // séance — `THSemaine.compteSeriesTravail`, la règle du volume comprise.
  test('l’aperçu compte les séries de TRAVAIL, et rien d’autre', () => {
    const CAT = [{ slug: 'a', muscles_primaires: ['pectoraux'] },
                 { slug: 'b', muscles_primaires: ['dos'] }];
    const avecChauffes = exo('a', { series: [
      { rang: 1, type_serie: 'echauffement', reps_visees: 15 },
      { rang: 2, type_serie: 'echauffement', reps_visees: 10 },
      { rang: 3, type_serie: 'travail', reps_visees: 5 },
      { rang: 4, type_serie: 'travail', reps_visees: 5 }
    ] });
    // ⚠️ LES CHAUFFES NE SONT PLUS COMPTÉES À PART (§7 septendecies.1, ch. 44).
    // Le chantier 43 rendait `nbChauffes` pour la carte ; le détail est inutile
    // dans un résumé, et le champ est parti avec son seul lecteur plutôt que de
    // rester un calcul que personne ne lit (leçon de C1, chantier 39).
    // Elles restent EXCLUES du compte : deux chauffes ici, et sept séries.
    expect(Routines.apercu([avecChauffes, exo('b', { series: progTravail(5) })], CAT))
      .toEqual({ nbExercices: 2, nbSeries: 7 });
    expect(Routines.apercu([], CAT)).toEqual({ nbExercices: 0, nbSeries: 0 });
  });

  // ⚠️ ET LA RÈGLE DU VOLUME S'APPLIQUE AUSSI À UNE ROUTINE. Un tapis programmé
  // ne compte pas plus qu'un tapis fait : `porteDuVolume` l'écarte des deux.
  test('un exercice qui ne porte pas de volume ne compte pas non plus ici', () => {
    const CAT = [{ slug: 'a', muscles_primaires: ['pectoraux'] },
                 { slug: 'tapis', muscles_primaires: [] }];
    expect(Routines.apercu([exo('a', { series: progTravail(3) }),
                            exo('tapis', { series: progTravail(2) })], CAT).nbSeries).toBe(3);
  });

  // ⚠️ INVERSÉ AU CHANTIER 41 (§7 duodecies.1). `archivee_a` cachait une routine
  // pour toujours : l'archivage était irréversible DEPUIS L'APP, et il a fallu
  // une écriture en base le 13/09 pour récupérer une routine archivée par
  // erreur. L'archivage est supprimé, plus rien n'écrit la colonne, et les
  // routines qui la portent encore reviennent — où elles peuvent être
  // supprimées.
  test('une archivée est dans la liste comme les autres, et l’ordre est stable', () => {
    const liste = Routines.visibles([
      { id: '1', nom: 'Pull', archivee_a: null },
      { id: '2', nom: 'Ancienne', archivee_a: '2026-01-01' },
      { id: '3', nom: 'Jambes', archivee_a: null }
    ]);
    expect(liste.map((r) => r.nom)).toEqual(['Ancienne', 'Jambes', 'Pull']);
  });

  // ⚠️ MAIS LE NOM, LUI, RESTE LIBRE. `routines_user_nom_actif_uniq` est un
  // index PARTIEL (`WHERE archivee_a IS NULL`) : la base ACCEPTE une seconde
  // « Push » tant que la première est archivée. Refuser localement ce que la
  // base accepte bloquerait un enregistrement pour rien. Deux questions
  // différentes sur la même colonne, ce n'est pas la même règle écrite deux
  // fois.
  test('une archivée est visible mais ne réserve toujours pas son nom', () => {
    const liste = [
      { id: '1', nom: 'Push', archivee_a: '2026-01-01' },
      { id: '2', nom: 'Pull', archivee_a: null }
    ];
    expect(Routines.visibles(liste).map((r) => r.nom)).toEqual(['Pull', 'Push']);
    expect(Routines.nomEnConflit('Push', liste, null)).toBe(false);
    expect(Routines.nomEnConflit('Pull', liste, null)).toBe(true);
  });

  test('la recherche replie les accents — « developpe » trouve « Développé »', () => {
    const cat = [
      { slug: 'dc', nom: 'Développé Couché (Barre)' },
      { slug: 'dm', nom: 'Développé Militaire' },
      { slug: 'cb', nom: 'Curl Biceps' }
    ];
    expect(Routines.chercher(cat, 'developpe').map((e) => e.slug)).toEqual(['dc', 'dm']);
    // Tous les mots doivent apparaître : on ne ramène pas tous les développés.
    expect(Routines.chercher(cat, 'couche barre').map((e) => e.slug)).toEqual(['dc']);
    expect(Routines.chercher(cat, '').length).toBe(3);
    expect(Routines.chercher(cat, 'zzz')).toEqual([]);
  });
});
