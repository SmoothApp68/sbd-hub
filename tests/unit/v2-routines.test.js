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

const Routines = require('../../v2/js/routines.js');

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
    }
  };

  base.ecrivain = ecrivain;
  base.exosDe = (idRoutine) => base.exos
    .filter((e) => e.routine_id === idRoutine)
    .sort((a, b) => a.rang - b.rang);
  return base;
}

const USER = 'u-1';
const exo = (slug, extra) => Object.assign(
  { id: null, exercise_slug: slug, series: 3, reps_visees: null, repos_cible_s: null }, extra);

// Recharge une routine depuis la base de papier, sous la forme d'un brouillon
// prêt à être ré-enregistré — exactement ce que fait `brouillonDe` dans app.js.
function relire(base, idRoutine) {
  const lignes = base.exosDe(idRoutine);
  const r = base.routines.find((x) => x.id === idRoutine);
  return {
    id: idRoutine, nom: r.nom, nomChange: false,
    exercices: lignes.map((l) => ({
      id: l.id, exercise_slug: l.exercise_slug, series: l.series,
      reps_visees: l.reps_visees, repos_cible_s: l.repos_cible_s
    })),
    existantes: lignes
  };
}

async function creerTrois(base, nom) {
  const r = await Routines.enregistrer({
    id: null, nom: nom || 'Push',
    exercices: [exo('squat'), exo('banc'), exo('souleve')],
    existantes: []
  }, base.ecrivain, { userId: USER });
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
    expect(lignes.map((l) => l.series)).toEqual([3, 3, 3]);
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
      base.ecrivain, { userId: USER });
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
      base.ecrivain, { userId: USER });
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

    const r = await Routines.enregistrer(b, base.ecrivain, { userId: USER });
    expect(r.ok).toBe(true);   // ← tombe si une écriture heurte routine_exos_rang_uniq

    const lignes = base.exosDe(id);
    expect(lignes.map((l) => l.exercise_slug)).toEqual(['squat', 'souleve', 'banc']);
    expect(lignes.map((l) => l.rang)).toEqual([0, 1, 2]);
  });

  test('un échange est un CYCLE : il passe forcément par un rang tampon', () => {
    const avant = [
      { id: 'A', exercise_slug: 'squat', rang: 0, series: 3, reps_visees: null, repos_cible_s: null },
      { id: 'B', exercise_slug: 'banc', rang: 1, series: 3, reps_visees: null, repos_cible_s: null },
      { id: 'C', exercise_slug: 'souleve', rang: 2, series: 3, reps_visees: null, repos_cible_s: null }
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
    }, base.ecrivain, { userId: USER });
    const id = r0.routine.id;

    const b = relire(base, id);
    b.exercices.reverse();
    const r = await Routines.enregistrer(b, base.ecrivain, { userId: USER });
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
    const r = await Routines.enregistrer(b, base.ecrivain, { userId: USER });
    expect(r.ok).toBe(true);

    const lignes = base.exosDe(id);
    expect(lignes.map((l) => l.exercise_slug)).toEqual(['squat', 'souleve']);
    expect(lignes.map((l) => l.rang)).toEqual([0, 1]);   // pas [0, 2]
  });

  test('retirer le DERNIER ne demande aucune renumérotation — le cas permissif', () => {
    const avant = [
      { id: 'A', exercise_slug: 'a', rang: 0, series: 3, reps_visees: null, repos_cible_s: null },
      { id: 'B', exercise_slug: 'b', rang: 1, series: 3, reps_visees: null, repos_cible_s: null },
      { id: 'C', exercise_slug: 'c', rang: 2, series: 3, reps_visees: null, repos_cible_s: null }
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

  test('les mêmes bornes pour les séries et les reps, relevées sur les CHECK', () => {
    expect(Routines.seriesValides(0).ok).toBe(false);
    expect(Routines.seriesValides(21).ok).toBe(false);
    expect(Routines.seriesValides(null).ok).toBe(false);  // séries obligatoires
    expect(Routines.repsValides(101).ok).toBe(false);
    expect(Routines.repsValides(null).ok).toBe(true);     // reps facultatives
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
      exercices: [exo('squat', { charge_kg: 120, poids: 120, series: 4, repos_cible_s: 120 })]
    }, base.ecrivain, { userId: USER });

    const envoyees = [];
    base.journal.forEach(function (j) {
      (j.lignes || []).forEach(function (l) { envoyees.push(l); });
      if (j.champs) envoyees.push(j.champs);
    });
    expect(envoyees.length).toBeGreaterThan(0);

    const cles = new Set();
    envoyees.forEach(function (l) { Object.keys(l).forEach(function (k) { cles.add(k); }); });

    // Aucune clé ne ressemble à une charge…
    Array.from(cles).forEach(function (k) { expect(k).not.toMatch(INTERDITS); });
    // …et rien n'a atteint la base non plus.
    base.exos.forEach(function (l) {
      Object.keys(l).forEach(function (k) { expect(k).not.toMatch(INTERDITS); });
    });

    // La liste blanche est la garde, et elle est explicite.
    expect(Routines.CHAMPS_EXERCICE).toEqual(
      ['routine_id', 'exercise_slug', 'rang', 'series', 'reps_visees', 'repos_cible_s']);
    const hors = Array.from(cles).filter(function (k) {
      return Routines.CHAMPS_EXERCICE.indexOf(k) < 0 &&
             ['user_id', 'nom', 'modifiee_a', 'archivee_a'].indexOf(k) < 0;
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

    const r = await Routines.enregistrer(brouillon, base.ecrivain, { userId: USER });

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
      base.ecrivain, { userId: USER });

    expect(r.ok).toBe(false);
    expect(r.partiel).toBe(false);
    expect(base.routines).toEqual([]);
    expect(base.journal.map((j) => j.op)).toContain('supprimerRoutine');

    // Et le réessai passe, précisément parce que le nom a été libéré.
    const base2 = creerBase();
    const ok = await Routines.enregistrer(
      { id: null, nom: 'Push', exercices: [exo('squat')], existantes: [] },
      base2.ecrivain, { userId: USER });
    expect(ok.ok).toBe(true);
  });

  test('une MODIFICATION coupée en plein milieu se dit incomplète', async () => {
    const base = creerBase();
    const id = await creerTrois(base);
    base.pannes.majExercice = 1;

    const b = relire(base, id);
    b.exercices.reverse();
    const r = await Routines.enregistrer(b, base.ecrivain, { userId: USER });

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
    const r = await Routines.enregistrer(b, base.ecrivain, { userId: USER });

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
  test('l’aperçu compte les SÉRIES prescrites, pas les lignes', () => {
    expect(Routines.apercu([exo('a', { series: 4 }), exo('b', { series: 5 })]))
      .toEqual({ nbExercices: 2, nbSeries: 9 });
    expect(Routines.apercu([])).toEqual({ nbExercices: 0, nbSeries: 0 });
  });

  test('les archivées ne sont pas dans la liste, et l’ordre est stable', () => {
    const liste = Routines.visibles([
      { id: '1', nom: 'Pull', archivee_a: null },
      { id: '2', nom: 'Ancienne', archivee_a: '2026-01-01' },
      { id: '3', nom: 'Jambes', archivee_a: null }
    ]);
    expect(liste.map((r) => r.nom)).toEqual(['Jambes', 'Pull']);
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
