/** @jest-environment node */
//
// v2/js/seance.js — notes, repos en séance, fin de séance (chantier 26).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
//   UN EXERCICE À AU MOINS TROIS SÉRIES, DONT UNE AJOUTÉE *APRÈS* LA NOTE.
//
// Sur une série unique, « duplique sur toutes » et « écrit sur celle-là »
// donnent exactement la même ligne : le test passerait sur les deux
// implémentations et ne prouverait rien. Il faut au moins deux séries pour
// distinguer la duplication, et une TROISIÈME posée après coup pour distinguer
// « on recopie au moment du geste » de « on projette au moment d'écrire » —
// seule la seconde fait suivre une série ajoutée ensuite.
//
// Le Supabase de papier applique les contraintes RÉELLES relevées au schéma,
// dont les deux qui comptent ici :
//
//   sessions_salle_non_vide   salle IS NULL OR length(salle) BETWEEN 1 AND 60
//   salle_norme               GÉNÉRÉE — l'écrire fait échouer la requête (428C9)
//
// Sans elles, envoyer `salle: ''` ou `salle_norme` passerait sans bruit ici et
// casserait sur l'appareil.

const Seance = require('../../v2/js/seance.js');
const Attente = require('../../v2/js/attente.js');
const { progTravail } = require('./aide-routine-programmee.js');

const USER = 'u-1';
let graine = 0;
const uuid = () => 'id-' + (++graine);

function erreurPG(code, message) {
  const e = new Error(message); e.code = code; e.details = message; return e;
}

// ── La base de papier, côté `sessions` et `sets` ───────────────────────────
function creerBase() {
  const base = { sessions: [], sets: [] };

  function verifierSession(l) {
    // GÉNÉRÉE : Postgres refuse toute valeur, même NULL, même la bonne.
    if ('salle_norme' in l) {
      throw erreurPG('428C9', 'cannot insert a non-DEFAULT value into column "salle_norme"');
    }
    if (l.salle !== null && l.salle !== undefined &&
        !(String(l.salle).length >= 1 && String(l.salle).length <= 60)) {
      throw erreurPG('23514', 'violates check constraint "sessions_salle_non_vide"');
    }
    if (['en_cours', 'terminee'].indexOf(l.statut) < 0) {
      throw erreurPG('23514', 'violates check constraint "sessions_statut_ok"');
    }
    if (!l.user_id) throw erreurPG('23502', 'null value in column "user_id"');
  }

  function verifierSet(l) {
    if (l.source === 'app' && !l.validee_a) {
      throw erreurPG('23514', 'violates check constraint "sets_validee_si_saisie"');
    }
    if (!(l.rang >= 1)) throw erreurPG('23514', 'violates check constraint "sets_rang_positif"');
  }

  return {
    base,
    enregistrerSeance(l) {
      verifierSession(l);
      const i = base.sessions.findIndex((s) => s.id === l.id);
      if (i >= 0) base.sessions[i] = Object.assign({}, l);
      else base.sessions.push(Object.assign({}, l));
    },
    remplacerSeries(sessionId, lignes) {
      (lignes || []).forEach(verifierSet);
      base.sets = base.sets.filter((s) => s.session_id !== sessionId)
        .concat((lignes || []).map((l) => Object.assign({}, l)));
    }
  };
}

// La routine : deux exercices, dont un à TROIS séries — la configuration
// discriminante. `re1`/`re2` sont les `routine_exercises.id`, la seule
// jointure fiable vers la ligne de routine.
const ROUTINE = {
  id: 'r-1', nom: 'Push',
  exercices: [
    { id: 're1', exercise_slug: 'squat', rang: 0, series: progTravail(3, 5), repos_cible_s: 180, note: null },
    { id: 're2', exercise_slug: 'dc', rang: 1, series: progTravail(1, 8), repos_cible_s: null, note: null }
  ]
};

function seanceDeRoutine() {
  return Seance.creer({ id: 'sess-1', userId: USER, titre: ROUTINE.nom, routine: ROUTINE, idSerie: uuid });
}

// Valide toutes les séries d'un exercice, à une seconde d'intervalle.
function toutValider(s, iExo) {
  let t = Date.parse('2026-09-12T10:00:00Z');
  s.exercices[iExo].series.forEach((_, j) => {
    s = Seance.valider(s, iExo, j, new Date(t));
    t += 90000;
  });
  return s;
}

const notesDe = (lignes, slug) =>
  lignes.filter((l) => l.exercise_slug === slug).map((l) => l.note);

// ══ 1. LA NOTE D'EXERCICE S'ÉCRIT SUR TOUTES LES SÉRIES ════════════════════

describe('la note d’exercice (§7 septies.1)', () => {
  test('elle s’écrit sur TOUTES les séries de cet exercice, dans cette séance', () => {
    let s = seanceDeRoutine();
    s = Seance.definirNoteExercice(s, 0, 'Barre basse, ceinture');
    s = toutValider(s, 0);
    const lignes = Seance.lignes(s);
    expect(lignes).toHaveLength(3);
    expect(notesDe(lignes, 'squat')).toEqual([
      'Barre basse, ceinture', 'Barre basse, ceinture', 'Barre basse, ceinture'
    ]);
  });

  test('et sur celui-là SEULEMENT — l’autre exercice reste vierge', () => {
    let s = seanceDeRoutine();
    s = Seance.definirNoteExercice(s, 0, 'Barre basse');
    s = toutValider(s, 0);
    s = toutValider(s, 1);
    const lignes = Seance.lignes(s);
    expect(notesDe(lignes, 'squat')).toEqual(['Barre basse', 'Barre basse', 'Barre basse']);
    expect(notesDe(lignes, 'dc')).toEqual([null]);
  });

  // ⚠️ TEST 2 — la configuration discriminante : trois séries déjà validées,
  // puis la note CHANGE. Sur une série unique, « toutes suivent » et « seule la
  // première suit » seraient indistinguables.
  test('modifiée, toutes les séries suivent — aucune ne reste en arrière', () => {
    let s = seanceDeRoutine();
    s = Seance.definirNoteExercice(s, 0, 'Première version');
    s = toutValider(s, 0);
    expect(notesDe(Seance.lignes(s), 'squat')).toEqual(
      ['Première version', 'Première version', 'Première version']);

    s = Seance.definirNoteExercice(s, 0, 'Seconde version');
    expect(notesDe(Seance.lignes(s), 'squat')).toEqual(
      ['Seconde version', 'Seconde version', 'Seconde version']);
  });

  test('effacée, elle repart à null partout plutôt que de laisser un vide', () => {
    let s = seanceDeRoutine();
    s = Seance.definirNoteExercice(s, 0, 'À retirer');
    s = toutValider(s, 0);
    s = Seance.definirNoteExercice(s, 0, '   ');
    expect(notesDe(Seance.lignes(s), 'squat')).toEqual([null, null, null]);
  });

  // ⚠️ TEST 4 — une série AJOUTÉE APRÈS la note. C'est ce cas qui sépare
  // « on recopie au moment du geste » de « on projette au moment d'écrire ».
  test('une série ajoutée APRÈS la note la reçoit quand même', () => {
    let s = seanceDeRoutine();
    s = Seance.definirNoteExercice(s, 0, 'Ceinture');
    s = toutValider(s, 0);
    s = Seance.ajouterSerie(s, 0, uuid);
    s = Seance.valider(s, 0, 3, new Date('2026-09-12T10:20:00Z'));
    const lignes = Seance.lignes(s);
    expect(lignes).toHaveLength(4);
    expect(notesDe(lignes, 'squat')).toEqual(['Ceinture', 'Ceinture', 'Ceinture', 'Ceinture']);
  });

  // ⚠️ TEST 3 — les 11 couples sur 196 qui portent des notes RÉELLEMENT
  // différentes d'une série à l'autre. Le cas existe en base, il ne se
  // supprime pas.
  test('une note de série reste possible, et distincte de celle de l’exercice', () => {
    let s = seanceDeRoutine();
    s = Seance.definirNoteExercice(s, 0, 'Barre basse');
    s = Seance.definirNoteSerie(s, 0, 1, 'Celle-ci sur bloc');
    s = toutValider(s, 0);
    expect(notesDe(Seance.lignes(s), 'squat')).toEqual(
      ['Barre basse', 'Celle-ci sur bloc', 'Barre basse']);
  });

  test('la note de série GAGNE, même quand l’exercice n’en porte aucune', () => {
    let s = seanceDeRoutine();
    s = Seance.definirNoteSerie(s, 0, 2, 'Raté le verrouillage');
    s = toutValider(s, 0);
    expect(notesDe(Seance.lignes(s), 'squat')).toEqual([null, null, 'Raté le verrouillage']);
  });

  test('la note SUIT l’exercice depuis la routine — `routine_exercises.note`', () => {
    const avecNote = Object.assign({}, ROUTINE, {
      exercices: [Object.assign({}, ROUTINE.exercices[0], { note: 'Toujours en ceinture' }),
                  ROUTINE.exercices[1]]
    });
    let s = Seance.creer({ id: 'sess-2', userId: USER, routine: avecNote, idSerie: uuid });
    s = toutValider(s, 0);
    expect(notesDe(Seance.lignes(s), 'squat')).toEqual(
      ['Toujours en ceinture', 'Toujours en ceinture', 'Toujours en ceinture']);
  });

  test('`note` part TOUJOURS, y compris à null — sinon une note effacée resterait en base', () => {
    let s = seanceDeRoutine();
    s = toutValider(s, 0);
    Seance.lignes(s).forEach((l) => expect('note' in l).toBe(true));
  });
});

// ══ 5. LE REPOS SE MODIFIE EN SÉANCE, SANS RIEN ÉCRIRE DANS LA ROUTINE ═════

describe('le repos cible, en séance (§7 septies.2)', () => {
  test('il change sur la séance, et la routine n’est PAS touchée', () => {
    let s = seanceDeRoutine();
    s = Seance.definirReposCible(s, 0, 120);
    expect(s.exercices[0].repos_cible_s).toBe(120);
    // L'objet routine, lui, n'a pas bougé d'un cheveu.
    expect(ROUTINE.exercices[0].repos_cible_s).toBe(180);
  });

  test('il ne produit AUCUNE ligne de `sets` : ce n’est pas une colonne de série', () => {
    let s = seanceDeRoutine();
    s = toutValider(s, 0);
    const avant = JSON.stringify(Seance.lignes(s));
    s = Seance.definirReposCible(s, 0, 90);
    expect(JSON.stringify(Seance.lignes(s))).toBe(avant);
  });

  test('les bornes de la routine s’appliquent ici : 5 à 1800, ou rien', () => {
    let s = seanceDeRoutine();
    expect(Seance.definirReposCible(s, 0, 4).exercices[0].repos_cible_s).toBe(180);
    expect(Seance.definirReposCible(s, 0, 1801).exercices[0].repos_cible_s).toBe(180);
    expect(Seance.definirReposCible(s, 0, 5).exercices[0].repos_cible_s).toBe(5);
    expect(Seance.definirReposCible(s, 0, 1800).exercices[0].repos_cible_s).toBe(1800);
    expect(Seance.definirReposCible(s, 0, null).exercices[0].repos_cible_s).toBe(null);
  });
});

// ══ 6. LE CHRONOMÈTRE S'ARRÊTE À L'ÉCHÉANCE ════════════════════════════════

describe('le chronomètre s’arrête à l’échéance (§7 septies.3)', () => {
  // ⚠️ ASSERTIONS RETOURNÉES AU CHANTIER 50 : c'est un COMPTE À REBOURS. Le
  // grand nombre ne monte plus vers la cible, il descend vers zéro. La règle
  // du §7 septies.3 ne bouge pas — il ne va pas AU-DELÀ — seule sa direction
  // change : « figé sur la cible » devient « arrêté à 0:00 », et JAMAIS un
  // négatif qui grossit.
  test('il descend jusqu’à zéro, et pas en dessous', () => {
    expect(Seance.secondesRestantes(180, 0)).toBe(180);     // à l'armement : la cible entière
    expect(Seance.secondesRestantes(180, 100)).toBe(80);
    expect(Seance.secondesRestantes(180, 179)).toBe(1);
    expect(Seance.secondesRestantes(180, 180)).toBe(0);
    expect(Seance.secondesRestantes(180, 400)).toBe(0);     // pas de « −3:40 »
    expect(Seance.reposTermine(180, 179)).toBe(false);
    expect(Seance.reposTermine(180, 180)).toBe(true);
  });

  // L'accord des deux, épinglé : le minuteur s'arrête EXACTEMENT quand le
  // décompte atteint zéro. `reposFige` décide de l'arrêt, `secondesRestantes` de
  // l'affichage — deux fonctions séparées (§7 tervicies.1), et un écart entre
  // elles donnerait soit un 0:00 qui continue de battre, soit un décompte
  // arrêté sur un nombre non nul.
  // ⚠️ LES DEUX NE PEUVENT PLUS DIVERGER : depuis le chantier 51, `reposTermine`
  // EST « le restant vaut zéro », une seule expression pour une seule règle. Ce
  // test vérifie qu'elle vaut sur TOUTE la plage, cible par cible et seconde par
  // seconde — y compris une seconde après, où l'ancien `reposFige` et l'ancien
  // `reposEcoule` répondaient chacun pour un seul des deux chemins.
  test('« fini » et « il ne reste rien » sont la même chose, partout', () => {
    [0, 5, 15, 50, 90, 180, 1800].forEach((cible) => {
      for (let s = 0; s <= cible + 3; s++) {
        expect(Seance.reposTermine(cible, s)).toBe(Seance.secondesRestantes(cible, s) === 0);
      }
    });
  });

  // Le cas signalé : on est à 100 s, la cible est à 105, deux −15 la font
  // passer à 75 — DERRIÈRE le temps écoulé. Le chronomètre doit s'arrêter là,
  // alors qu'il n'a jamais franchi d'échéance en montant.
  test('un −15 qui FRANCHIT la cible fige aussi', () => {
    let cible = 105;
    const ecoule = 100;
    // À 100 s sous une cible de 105, ça tourne encore : il reste 5 secondes.
    expect(Seance.reposTermine(cible, ecoule)).toBe(false);
    expect(Seance.secondesRestantes(cible, ecoule)).toBe(5);
    // Le −15 fait passer la cible DERRIÈRE le temps écoulé : figé, sans avoir
    // jamais franchi d'échéance en descendant. Le décompte tombe à zéro d'un
    // coup — il ne passe pas par −10.
    cible = Seance.ajusterCible(cible, -15);
    expect(cible).toBe(90);
    expect(Seance.reposTermine(cible, ecoule)).toBe(true);
    expect(Seance.secondesRestantes(cible, ecoule)).toBe(0);
  });

  test('un +15 qui repousse la cible au-delà de l’écoulé remet en marche', () => {
    const ecoule = 100;
    expect(Seance.reposTermine(90, ecoule)).toBe(true);
    const repoussee = Seance.ajusterCible(90, 15);          // 105
    expect(Seance.reposTermine(repoussee, ecoule)).toBe(false);
    // Et le décompte REPART d'un zéro vers les 5 secondes rendues.
    expect(Seance.secondesRestantes(repoussee, ecoule)).toBe(5);
  });

  // Sans cible, `reposFige` garde sa réponse — c'est elle qui décide de l'arrêt
  // du minuteur — mais il n'y a RIEN à décompter : zéro, jamais le temps écoulé.
  // Le cas ne s'arme plus depuis le chantier 45 ; la fonction reste totale.
  // ⚠️ INVERSÉ AU CHANTIER 51. L'ancien `reposFige` répondait FAUX sans cible —
  // « rien ne fige » — et c'était la moitié du défaut : une cible tombée à zéro
  // laissait une barre que rien n'arrêtait. « Fini » répond VRAI : il n'y a rien
  // à décompter, donc il n'y a rien à montrer.
  test('sans cible, il ne reste rien à décompter — et c’est donc FINI', () => {
    expect(Seance.reposTermine(null, 5000)).toBe(true);
    expect(Seance.reposTermine(0, 5000)).toBe(true);
    expect(Seance.secondesRestantes(null, 5000)).toBe(0);
    expect(Seance.secondesRestantes(0, 5000)).toBe(0);
    expect(Seance.secondesRestantes(undefined, 5000)).toBe(0);
  });
});

// ══ 7. L'ÉCRAN DE FIN — TITRE, NOTE, SALLE ═════════════════════════════════

describe('l’écran de fin de séance (§7 septies.4)', () => {
  test('titre, note et salle partent en base', async () => {
    const db = creerBase();
    let s = seanceDeRoutine();
    s = Seance.decrire(s, { titre: 'Jambes du jeudi', note: 'Dos fatigué', salle: 'Basic-Fit Mulhouse' });
    s = Seance.terminer(s, new Date('2026-09-12T11:30:00Z'));
    db.enregistrerSeance(Seance.ligneSession(s));
    expect(db.base.sessions[0]).toMatchObject({
      titre: 'Jambes du jeudi', note: 'Dos fatigué', salle: 'Basic-Fit Mulhouse', statut: 'terminee'
    });
  });

  test('`salle_norme` n’est JAMAIS envoyée — elle est générée', () => {
    const db = creerBase();
    let s = Seance.decrire(seanceDeRoutine(), { salle: 'Chez moi' });
    const ligne = Seance.ligneSession(s);
    expect('salle_norme' in ligne).toBe(false);
    expect(() => db.enregistrerSeance(ligne)).not.toThrow();
  });

  // La chaîne vide violerait `sessions_salle_non_vide` : 23514, que la file
  // classe DÉFINITIVE — la séance ne monterait plus jamais.
  test('une salle vide part à NULL, pas en chaîne vide', () => {
    const db = creerBase();
    let s = Seance.decrire(seanceDeRoutine(), { salle: '   ' });
    const ligne = Seance.ligneSession(s);
    expect(ligne.salle).toBe(null);
    expect(() => db.enregistrerSeance(ligne)).not.toThrow();
  });

  test('une salle trop longue est tronquée à 60, pas refusée par la base', () => {
    const db = creerBase();
    let s = Seance.decrire(seanceDeRoutine(), { salle: 'x'.repeat(90) });
    const ligne = Seance.ligneSession(s);
    expect(ligne.salle).toHaveLength(60);
    expect(() => db.enregistrerSeance(ligne)).not.toThrow();
  });

  test('les trois champs se modifient un par un sans s’effacer', () => {
    let s = seanceDeRoutine();
    s = Seance.decrire(s, { salle: 'Iron Temple' });
    s = Seance.decrire(s, { note: 'PR au squat' });
    expect(s.salle).toBe('Iron Temple');
    expect(s.note).toBe('PR au squat');
    expect(s.titre).toBe('Push');
  });
});

// ══ 8. LA QUESTION SUR LA ROUTINE — SEULEMENT S'IL Y A UN ÉCART ════════════

describe('la question de fin sur la routine (§6)', () => {
  test('aucune déviation → aucun écart, donc aucune question', () => {
    let s = seanceDeRoutine();
    s = toutValider(s, 0);
    expect(Seance.ecartsRoutine(s, ROUTINE).ecarts).toEqual([]);
  });

  test('un repos changé en séance fait UN écart, sur la bonne ligne de routine', () => {
    let s = seanceDeRoutine();
    s = Seance.definirReposCible(s, 0, 120);
    const { ecarts, voulues } = Seance.ecartsRoutine(s, ROUTINE);
    expect(ecarts).toEqual([
      { type: 'repos', exercise_slug: 'squat', avant: 180, apres: 120 }]);
    // Ce qui partirait dans la routine : la ligne visée, et elle seule.
    expect(voulues[0]).toMatchObject({ id: 're1', repos_cible_s: 120 });
    expect(voulues[1]).toMatchObject({ id: 're2', repos_cible_s: null });
  });

  test('une note posée en séance fait un écart, et ne reporte QUE la note', () => {
    let s = seanceDeRoutine();
    s = Seance.definirNoteExercice(s, 1, 'Prise large');
    const { ecarts, voulues } = Seance.ecartsRoutine(s, ROUTINE);
    expect(ecarts).toEqual([
      { type: 'note', exercise_slug: 'dc', apres: 'Prise large' }]);
    expect(voulues[1]).toMatchObject({ id: 're2', note: 'Prise large' });
  });

  test('les deux à la fois se reportent ensemble, sur la même ligne', () => {
    let s = seanceDeRoutine();
    s = Seance.definirReposCible(s, 0, 90);
    s = Seance.definirNoteExercice(s, 0, 'Ceinture');
    const { ecarts, voulues } = Seance.ecartsRoutine(s, ROUTINE);
    expect(ecarts.map((e) => e.type)).toEqual(['repos', 'note']);
    expect(voulues[0]).toMatchObject({ id: 're1', repos_cible_s: 90, note: 'Ceinture' });
  });

  // ⚠️ RETOURNÉ AU CHANTIER 28. Jusque-là, un exercice ajouté n'ouvrait AUCUN
  // écart : la déviation de structure était hors périmètre. Elle est désormais
  // dedans (§6.2), et l'ajout se rapporte comme tel — sans ligne de routine à
  // écraser pour autant, `id` restant nul jusqu'à l'écriture.
  test('un exercice ajouté en séance ouvre un écart de STRUCTURE', () => {
    let s = seanceDeRoutine();
    s = Seance.ajouterExercice(s, 'curl', uuid, { repos_cible_s: 60 });
    s = Seance.definirNoteExercice(s, 2, 'Ajouté à la volée');
    const { ecarts, voulues } = Seance.ecartsRoutine(s, ROUTINE);
    expect(ecarts).toEqual([{ type: 'ajoute', exercise_slug: 'curl' }]);
    expect(voulues).toHaveLength(3);
    expect(voulues[2]).toMatchObject({ id: null, exercise_slug: 'curl', repos_cible_s: 60 });
  });

  test('une séance vide — sans routine — n’ouvre aucune question', () => {
    let s = Seance.creer({ id: 'sess-3', userId: USER, idSerie: uuid });
    s = Seance.ajouterExercice(s, 'squat', uuid);
    s = Seance.definirNoteExercice(s, 0, 'Note libre');
    expect(Seance.ecartsRoutine(s, ROUTINE).ecarts).toEqual([]);
    expect(Seance.ecartsRoutine(s, null).ecarts).toEqual([]);
  });

  // ⚠️ CONFIGURATION DISCRIMINANTE DE LA JOINTURE — LE MÊME EXERCICE DEUX FOIS.
  //
  // Rien n'interdit à une routine de porter deux fois le même mouvement : lourd
  // en début de séance, léger en fin, avec des repos différents. Sur une
  // routine où chaque slug est unique, « je joins par `routine_exercise_id` »
  // et « je joins par slug » donnent EXACTEMENT le même résultat — le test
  // passerait sur les deux. Il faut le doublon pour les séparer, et il sépare
  // durement : par slug, le repos du second s'écrirait sur la ligne du premier.
  test('l’écart vise la ligne de routine, pas le slug — le doublon le prouve', () => {
    const doublon = {
      id: 'r-d', nom: 'Doublon',
      exercices: [
        { id: 'rd1', exercise_slug: 'squat', rang: 0, series: progTravail(1, 5), repos_cible_s: 180, note: null },
        { id: 'rd2', exercise_slug: 'dc', rang: 1, series: progTravail(1, 8), repos_cible_s: 90, note: null },
        { id: 'rd3', exercise_slug: 'squat', rang: 2, series: progTravail(1, 12), repos_cible_s: 60, note: null }
      ]
    };
    let s = Seance.creer({ id: 'sess-d', userId: USER, routine: doublon, idSerie: uuid });
    // On change le repos du SECOND squat — celui de fin de séance.
    s = Seance.definirReposCible(s, 2, 45);
    const { ecarts, voulues } = Seance.ecartsRoutine(s, doublon);
    expect(ecarts).toEqual([
      { type: 'repos', exercise_slug: 'squat', avant: 60, apres: 45 }]);
    // Par slug, c'est `rd1` qui aurait changé. C'est `rd3`, et lui seul.
    expect(voulues.map((v) => [v.id, v.repos_cible_s]))
      .toEqual([['rd1', 180], ['rd2', 90], ['rd3', 45]]);
  });

  test('et la note du second squat ne déteint pas sur le premier', () => {
    const doublon = {
      id: 'r-d', nom: 'Doublon',
      exercices: [
        { id: 'rd1', exercise_slug: 'squat', rang: 0, series: progTravail(2, 5), repos_cible_s: 180, note: 'Lourd' },
        { id: 'rd3', exercise_slug: 'squat', rang: 1, series: progTravail(2, 12), repos_cible_s: 60, note: 'Léger' }
      ]
    };
    let s = Seance.creer({ id: 'sess-d2', userId: USER, routine: doublon, idSerie: uuid });
    expect(s.exercices.map((e) => e.note)).toEqual(['Lourd', 'Léger']);
    s = Seance.definirNoteExercice(s, 1, 'Léger, en série longue');
    const { ecarts, voulues } = Seance.ecartsRoutine(s, doublon);
    expect(ecarts).toEqual([
      { type: 'note', exercise_slug: 'squat', apres: 'Léger, en série longue' }]);
    expect(voulues.map((v) => [v.id, v.note]))
      .toEqual([['rd1', 'Lourd'], ['rd3', 'Léger, en série longue']]);

    // Et à l'écriture, chaque bloc porte SA note : le doublon ne les mélange pas.
    s = Seance.valider(s, 0, 0, new Date('2026-09-12T10:00:00Z'));
    s = Seance.valider(s, 1, 0, new Date('2026-09-12T10:05:00Z'));
    expect(Seance.lignes(s).map((l) => l.note)).toEqual(['Lourd', 'Léger, en série longue']);
  });

  test('une séance issue d’une AUTRE routine ne se compare pas à celle-ci', () => {
    let s = seanceDeRoutine();
    s = Seance.definirReposCible(s, 0, 60);
    const autre = Object.assign({}, ROUTINE, { id: 'r-2' });
    expect(Seance.ecartsRoutine(s, autre)).toEqual({ ecarts: [], voulues: [] });
  });
});

// ══ LE REPORT PASSE PAR LA FILE — IL SE FAIT EN SALLE, SANS RÉSEAU ═════════

describe('le report sur la routine passe par la file d’attente', () => {
  test('une intention `maj` se pose, se compresse, et ne touche que les champs déviés', () => {
    let f = [];
    f = Attente.poser(f, {
      table: Attente.ROUTINE_EXOS, op: Attente.PLAN, id: 're1', donnees: { voulues: [{ id: 're1', repos_cible_s: 120 }] }
    });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ table: 'routine_exercises', op: 'plan', id: 're1', version: 1 });

    f = Attente.poser(f, {
      table: Attente.ROUTINE_EXOS, op: Attente.PLAN, id: 're1', donnees: { voulues: [{ id: 're1', repos_cible_s: 90 }] }
    });
    expect(f).toHaveLength(1);
    expect(f[0].donnees).toEqual({ voulues: [{ id: 're1', repos_cible_s: 90 }] });
    // La garde du chantier 25 vaut ici aussi : la version monte, donc un retrait
    // qui porte l'ancienne ne jette pas l'intention plus récente.
    expect(f[0].version).toBe(2);
    expect(Attente.retirer(f, 'routine_exercises:re1', 1)).toHaveLength(1);
    expect(Attente.retirer(f, 'routine_exercises:re1', 2)).toHaveLength(0);
  });

  // ⚠️ Une ligne de routine n'est PAS une séance. Si elle entrait dans
  // `seancesEnAttente`, la synchronisation protégerait une séance qui n'existe
  // pas — et `Sync.remplacer` garderait un fantôme indéfiniment.
  test('elle n’est comptée ni comme une séance en attente ni comme une séance protégée', () => {
    let f = Attente.poser([], {
      table: Attente.ROUTINE_EXOS, op: Attente.PLAN, id: 'r-1', donnees: { voulues: [] }
    });
    expect(Attente.seancesEnAttente(f)).toEqual({});
    expect(Attente.protegees(f, Attente.SESSIONS)).toEqual({});
    expect(Attente.protegees(f, Attente.SETS)).toEqual({});
  });

  test('mais elle compte dans ce qui reste à envoyer : « à jour » serait faux', () => {
    const f = Attente.poser([], {
      table: Attente.ROUTINE_EXOS, op: Attente.PLAN, id: 'r-1', donnees: { voulues: [] }
    });
    expect(Attente.resume(f).enAttente).toBe(1);
    expect(Attente.deciderEtat({ code: 'ok', libelle: 'À jour' }, f).code).toBe('a-envoyer');
  });
});
