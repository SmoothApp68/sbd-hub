//
// v2 — les supersets à l'écran de saisie (chantier 27).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
//   UN SUPERSET À SÉRIES INÉGALES, VALIDÉ DANS LE DÉSORDRE.
//
// Sur un superset parfaitement régulier validé de haut en bas — le seul cas
// qu'on teste spontanément —, « l'éclairage porte sur le tour » et
// « l'éclairage porte sur la ligne » donnent exactement le même écran : chaque
// validation complète son tour dans la foulée. Il faut deux choses pour les
// séparer : un exercice plus court que les autres (le tour 3 ne doit pas
// attendre un `C3` qui n'existe pas) et des validations dans le désordre
// (valider A2 seul ne doit rien allumer, B2 ensuite doit tout allumer).
//
// Le rendu tourne sous jsdom : `rendu.js` n'exporte rien en CommonJS (il pose
// `window.THRendu`), et c'est cette surface-là qu'on lit.

require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const Rendu = () => window.THRendu;

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'ec', nom: 'Écarté Poulie', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'pd', nom: 'Pompes Diamant', mesure: 'reps', charge: 'aucune',
    muscles_primaires: ['triceps'], muscles_secondaires: [] },
  { slug: 'pl', nom: 'Planche', mesure: 'temps', charge: 'aucune',
    muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
  { slug: 'cu', nom: 'Curl Haltères', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['biceps'], muscles_secondaires: [] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);

let graine = 0;
const uuid = () => 'set-' + (++graine);

// Une routine : `[slug, nbSéries, groupe]`. `groupe` à null = exercice seul.
function seanceDe(lignes) {
  return Seance.creer({
    id: 'S', userId: 'u', idSerie: uuid,
    routine: {
      id: 'r',
      exercices: lignes.map(([slug, series, groupe], i) => ({
        id: 're' + i, exercise_slug: slug, series: series,
        reps_visees: null, repos_cible_s: null,
        groupe_superset: groupe === undefined ? null : groupe
      }))
    }
  });
}

const blocs = (s) => Modele.blocsDeSeance(s, CATALOGUE);

// Valide la j-ième série du i-ième exercice, une minute après la précédente.
let horloge = Date.parse('2026-09-13T10:00:00Z');
function valider(s, i, j) {
  horloge += 60000;
  s = Seance.valider(s, i, j, new Date(horloge));
  return Seance.avancerTours(s, Modele.toursFaitsParGroupe(blocs(s)));
}
function devalider(s, i, j) {
  s = Seance.devalider(s, i, j);
  return Seance.avancerTours(s, Modele.toursFaitsParGroupe(blocs(s)));
}

function rendre(seance) {
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, seance, {
    blocs: blocs(seance),
    tourAtteint: (g) => Seance.tourAtteint(seance, g),
    exercice: (slug) => INDEX[slug],
    precedent: () => null,
    fantome: (i, j) => Seance.fantome(seance, i, j, null),
    surChamp: () => {}, surValider: () => {}, surNumero: () => {},
    surEffort: () => {}, surAjoutSerie: () => {}, surSupprimerSerie: () => {}
  });
  return cible;
}

// Ce que l'écran montre, bloc par bloc : les étiquettes dans l'ordre AFFICHÉ.
const etiquettes = (cible, iBloc) =>
  Array.from(cible.querySelectorAll('.bloc-seance')[iBloc].querySelectorAll('.no-serie'))
    .map((n) => n.textContent);

const allumees = (cible, iBloc) =>
  Array.from(cible.querySelectorAll('.bloc-seance')[iBloc].querySelectorAll('.serie'))
    .map((r) => r.classList.contains('faite'));

// ══ 1 ET 2. L'ENTRELACEMENT ════════════════════════════════════════════════

describe('l’entrelacement (§2.3)', () => {
  test('superset à 2 exercices, tours complets → A1, B1, A2, B2, A3, B3', () => {
    const c = rendre(seanceDe([['dc', 3, 1], ['ec', 3, 1]]));
    expect(c.querySelectorAll('.bloc-seance')).toHaveLength(1);
    expect(etiquettes(c, 0)).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  });

  test('superset à 3 exercices → A1, B1, C1, A2, B2, C2', () => {
    const c = rendre(seanceDe([['dc', 2, 1], ['ec', 2, 1], ['pd', 2, 1]]));
    expect(etiquettes(c, 0)).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  });

  test('le nom de chaque exercice n’apparaît QU’UNE FOIS, dans la légende', () => {
    const c = rendre(seanceDe([['dc', 3, 1], ['ec', 3, 1]]));
    const bloc = c.querySelectorAll('.bloc-seance')[0];
    const noms = Array.from(bloc.querySelectorAll('.exo-seance')).map((n) => n.textContent);
    expect(noms).toEqual(['ADéveloppé Couché (Barre)', 'BÉcarté Poulie']);
    expect(bloc.classList.contains('superset')).toBe(true);
  });

  // ⚠️ TEST 3 — LA MOITIÉ DE LA CONFIGURATION DISCRIMINANTE.
  test('séries inégales : le tour 3 est A3, B3 — aucun C3 fantôme', () => {
    const c = rendre(seanceDe([['dc', 3, 1], ['ec', 3, 1], ['pd', 2, 1]]));
    expect(etiquettes(c, 0)).toEqual(
      ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3']);
  });

  test('deux supersets distincts font deux blocs, chacun reparti à A', () => {
    const c = rendre(seanceDe([['dc', 2, 1], ['ec', 2, 1], ['pd', 2, 2], ['pl', 2, 2]]));
    expect(c.querySelectorAll('.bloc-seance')).toHaveLength(2);
    expect(etiquettes(c, 0)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(etiquettes(c, 1)).toEqual(['A1', 'B1', 'A2', 'B2']);
  });
});

// ══ 5. UN BLOC D'UN SEUL EXERCICE N'EST PAS UN SUPERSET ════════════════════

describe('le bloc d’un seul exercice (§2.1)', () => {
  test('il numérote 1, 2, 3 — aucune lettre', () => {
    const c = rendre(seanceDe([['cu', 3, null]]));
    expect(etiquettes(c, 0)).toEqual(['1', '2', '3']);
    expect(c.querySelectorAll('.bloc-seance')[0].classList.contains('superset')).toBe(false);
    expect(c.querySelectorAll('.lettre-exo')).toHaveLength(0);
  });

  test('et il cohabite avec un superset sans lui emprunter ses lettres', () => {
    const c = rendre(seanceDe([['dc', 2, 1], ['ec', 2, 1], ['cu', 2, null]]));
    expect(etiquettes(c, 0)).toEqual(['A1', 'B1', 'A2', 'B2']);
    expect(etiquettes(c, 1)).toEqual(['1', '2']);
  });

  test('le même exercice deux fois dans la routine fait deux blocs', () => {
    const c = rendre(seanceDe([['cu', 2, null], ['dc', 1, null], ['cu', 2, null]]));
    expect(c.querySelectorAll('.bloc-seance')).toHaveLength(3);
    expect(etiquettes(c, 0)).toEqual(['1', '2']);
    expect(etiquettes(c, 2)).toEqual(['1', '2']);
  });
});

// ══ 4. LA CHAUFFE ══════════════════════════════════════════════════════════

describe('l’échauffement (§2.5)', () => {
  // ⚠️ TEST RETOURNÉ AU CHANTIER 29 — §2.5 CORRIGÉ APRÈS ESSAI SUR DEVICE.
  //
  // « Juste avant la première série de travail de son exercice » dispersait les
  // chauffes dans un superset : A A A1 B B B1 C C1 D1, constaté sur device. Il
  // fallait quitter une machine pour y revenir. Les chauffes forment leurs
  // propres tours, tous avant le travail.
  test('dans un superset, les chauffes forment leurs propres tours, en tête', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1], ['pd', 3, 1]]);
    // La première série de C devient un échauffement.
    s = Seance.changerType(s, 2, 0, 'echauffement');
    const c = rendre(s);
    expect(etiquettes(c, 0)).toEqual(
      ['C', 'A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  });

  // ⚠️ TEST RETOURNÉ AU CHANTIER 28, APRÈS ESSAI SUR DEVICE (§2.5 précisé).
  //
  // Le chantier 27 lisait « jamais surlignés » comme « jamais verts ». C'est
  // l'ÉCLAIRAGE DU TOUR que la règle vise : une chauffe faite doit se voir
  // comme faite. Ce qui reste vrai — et que ce test garde — c'est qu'elle
  // n'entre pas dans le tour : elle s'allume seule, sans rien allumer d'autre.
  test('validé, il passe au vert — mais pour lui seul, sans ouvrir le tour', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    s = valider(s, 0, 0);                       // la chauffe de A, validée
    const c = rendre(s);
    expect(etiquettes(c, 0)).toEqual(['A', 'A1', 'B1', 'B2']);
    // La chauffe est verte ; A1 et B1, eux, attendent leur tour complet.
    expect(allumees(c, 0)).toEqual([true, false, false, false]);
    const coches = Array.from(c.querySelectorAll('.bloc-seance')[0]
      .querySelectorAll('.ok-serie')).map((b) => b.classList.contains('cochee'));
    expect(coches).toEqual([true, false, false, false]);
  });

  test('hors superset aussi : la chauffe validée est verte, comme une série normale', () => {
    let s = seanceDe([['cu', 2, null]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    s = valider(s, 0, 0);
    const c = rendre(s);
    // §7 undecies.1 — hors superset le badge porte `W` : il n'y a pas de lettre
    // d'exercice à porter, et la chauffe doit rester lisible sans déchiffrage.
    expect(etiquettes(c, 0)).toEqual(['W', '1']);
    expect(allumees(c, 0)).toEqual([true, false]);
  });

  // Et l'inverse tient toujours : une chauffe NON validée reste éteinte même
  // quand le tour autour d'elle est complet. Elle n'appartient à aucun tour.
  test('non validé, il reste éteint même si le tour est fait', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    s = valider(s, 0, 1); s = valider(s, 1, 0);   // le tour 1 : A1 et B1
    const c = rendre(s);
    expect(etiquettes(c, 0)).toEqual(['A', 'A1', 'B1', 'B2']);
    expect(allumees(c, 0)).toEqual([false, true, true, false]);
  });
});

// ══ 6, 7 ET 8. L'ÉCLAIRAGE ET LE TOUR ══════════════════════════════════════

describe('l’éclairage porte sur le tour (§2.6 et §2.7)', () => {
  const SUPERSET = [['dc', 3, 1], ['ec', 3, 1], ['pd', 2, 1]];

  // ⚠️ TEST 6 — L'AUTRE MOITIÉ DE LA CONFIGURATION DISCRIMINANTE.
  test('valider A1 seul n’allume RIEN et n’avance pas le tour', () => {
    let s = valider(seanceDe(SUPERSET), 0, 0);
    const c = rendre(s);
    expect(allumees(c, 0)).toEqual([false, false, false, false, false, false, false, false]);
    expect(Seance.tourAtteint(s, 1)).toBe(0);
  });

  test('le tour complet allume TOUTES ses lignes d’un coup', () => {
    let s = seanceDe(SUPERSET);
    s = valider(s, 0, 0); s = valider(s, 1, 0); s = valider(s, 2, 0);
    const c = rendre(s);
    // A1, B1, C1 allumées ; le reste éteint.
    expect(allumees(c, 0)).toEqual([true, true, true, false, false, false, false, false]);
    expect(Seance.tourAtteint(s, 1)).toBe(1);
  });

  // ⚠️ TEST 7 — DANS LE DÉSORDRE.
  test('B2 puis A2 fait avancer le tour, l’ordre n’a pas d’importance', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = valider(s, 1, 0); s = valider(s, 0, 0);        // tour 1 dans le désordre
    expect(Seance.tourAtteint(s, 1)).toBe(1);
    s = valider(s, 1, 1);
    expect(Seance.tourAtteint(s, 1)).toBe(1);          // B2 seul : rien
    s = valider(s, 0, 1);
    expect(Seance.tourAtteint(s, 1)).toBe(2);          // A2 ferme le tour
  });

  // ⚠️ TEST 3 (suite) — un tour incomplet n'attend pas un C3 qui n'existe pas.
  test('le tour 3 se ferme sans C3 : C n’a que deux séries', () => {
    let s = seanceDe(SUPERSET);
    [0, 1, 2].forEach((j) => {
      s = valider(s, 0, j); s = valider(s, 1, j);
      if (j < 2) s = valider(s, 2, j);
    });
    expect(Seance.tourAtteint(s, 1)).toBe(3);
    const c = rendre(s);
    expect(allumees(c, 0)).toEqual([true, true, true, true, true, true, true, true]);
  });

  // ⚠️ TEST 8 — L'ASYMÉTRIE ASSUMÉE.
  test('dévalider ne fait pas reculer le tour', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = valider(s, 0, 0); s = valider(s, 1, 0);
    expect(Seance.tourAtteint(s, 1)).toBe(1);
    s = devalider(s, 0, 0);
    expect(Seance.tourAtteint(s, 1)).toBe(1);
    // L'ÉCLAIRAGE, lui, dit la vérité du moment : le tour n'est plus complet.
    expect(allumees(rendre(s), 0)).toEqual([false, false, false, false]);
  });

  test('un trou ne fait pas sauter deux crans : le tour 2 fermé sans le 1 ne compte pas', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = valider(s, 0, 1); s = valider(s, 1, 1);        // le tour 2, sans le 1
    expect(Seance.tourAtteint(s, 1)).toBe(0);
    expect(allumees(rendre(s), 0)).toEqual([false, false, true, true]);
  });

  test('hors superset, l’éclairage dégénère en éclairage de ligne', () => {
    let s = valider(seanceDe([['cu', 3, null]]), 0, 1);
    expect(allumees(rendre(s), 0)).toEqual([false, true, false]);
  });

  // ⚠️ TEST RETOURNÉ AU CHANTIER 30 (§7 undecies.3). Il affirmait « tour 1/2 »
  // AVANT d'avoir rien fait : le compteur affichait le tour EN COURS, pas les
  // tours FAITS. Sur l'appareil, ce décalage d'un cran se lisait comme « une
  // chauffe fait avancer le compteur » — elle ne l'a jamais fait.
  test('le compteur affiche les tours FAITS, et il est plafonné', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    expect(rendre(s).querySelector('.superset-t').textContent).toBe('Superset · tour 0/2');
    s = valider(s, 0, 0); s = valider(s, 1, 0);
    expect(rendre(s).querySelector('.superset-t').textContent).toBe('Superset · tour 1/2');
    s = valider(s, 0, 1); s = valider(s, 1, 1);
    expect(rendre(s).querySelector('.superset-t').textContent).toBe('Superset · tour 2/2');
  });
});

// ══ 9. LES MESURES MÉLANGÉES DANS UN MÊME BLOC ═════════════════════════════

describe('un superset peut mélanger les mesures (§3 ter)', () => {
  test('chaque ligne garde le gabarit de SON exercice', () => {
    const c = rendre(seanceDe([['dc', 2, 1], ['pl', 2, 1]]));
    const grilles = Array.from(c.querySelectorAll('.bloc-seance')[0].querySelectorAll('.serie'))
      .map((r) => Array.from(r.classList).filter((x) => x.startsWith('g-'))[0]);
    expect(grilles).toEqual(['g-charge_reps', 'g-temps', 'g-charge_reps', 'g-temps']);
  });

  test('et l’en-tête de colonnes se TAIT plutôt que de mentir sur la moitié des lignes', () => {
    const mixte = rendre(seanceDe([['dc', 2, 1], ['pl', 2, 1]]));
    expect(mixte.querySelectorAll('.cols-seance')).toHaveLength(0);
    // Homogène, il reste : il dit vrai pour toutes les lignes.
    const homogene = rendre(seanceDe([['dc', 2, 1], ['ec', 2, 1]]));
    expect(homogene.querySelectorAll('.cols-seance')).toHaveLength(1);
  });

  test('le type de mesure est rappelé sous CHAQUE nom de la légende', () => {
    const c = rendre(seanceDe([['dc', 2, 1], ['pl', 2, 1]]));
    const types = Array.from(c.querySelectorAll('.bloc-seance')[0]
      .querySelectorAll('.type-mesure')).map((n) => n.textContent);
    expect(types).toEqual(['CHARGE × REPS', 'DURÉE']);
  });

  test('chaque branche porte son propre « + Série », son repos et sa note', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = Seance.definirNoteExercice(s, 1, 'Poulie haute');
    s = Seance.definirReposCible(s, 0, 120);
    const bloc = rendre(s).querySelectorAll('.bloc-seance')[0];
    expect(Array.from(bloc.querySelectorAll('.ajout-serie button')).map((b) => b.textContent))
      .toEqual(['+ Série A', '+ Série B']);
    expect(Array.from(bloc.querySelectorAll('.repos-cible')).map((b) => b.textContent))
      .toEqual(['repos 2:00', 'repos —']);
    expect(Array.from(bloc.querySelectorAll('.note-exo')).map((b) => b.textContent))
      .toEqual(['+ Note', 'Poulie haute']);
  });
});

// ══ LE SUPERSET SURVIT À L'ENREGISTREMENT, ET LES DEUX ÉCRANS S'ACCORDENT ══

describe('la saisie et le détail de séance disent la même chose', () => {
  test('`groupe_superset` part en base — sinon le superset disparaît au détail', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1], ['cu', 1, null]]);
    s = valider(s, 0, 0); s = valider(s, 1, 0); s = valider(s, 2, 0);
    const lignes = Seance.lignes(s);
    expect(lignes.map((l) => l.groupe_superset)).toEqual([1, 1, null]);
  });

  // ⚠️ LA VÉRIFICATION QUI COMPTE : le détail de séance rend déjà
  // l'entrelacement (chantier 12). Les deux écrans passent par la MÊME
  // fonction ; ce test l'exige à l'arrivée, pas seulement à l'intention.
  test('les étiquettes de la saisie sont CELLES du détail, à l’identique', () => {
    let s = seanceDe([['dc', 3, 1], ['ec', 3, 1], ['pd', 2, 1], ['cu', 2, null]]);
    [0, 1, 2].forEach((j) => {
      s = valider(s, 0, j); s = valider(s, 1, j);
      if (j < 2) s = valider(s, 2, j);
      if (j < 2) s = valider(s, 3, j);
    });

    const saisie = blocs(s).map((b) => b.series.map((x) => x.etiquette));
    // Le détail relit les LIGNES DE BASE, comme après une synchronisation.
    const detail = Modele.construireBlocs(Seance.lignes(s), CATALOGUE)
      .map((b) => b.series.map((x) => x.etiquette));

    expect(saisie).toEqual([['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3'], ['1', '2']]);
    expect(detail).toEqual(saisie);
  });

  test('une séance NON validée s’entrelace quand même à la saisie, pas au détail', () => {
    const s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    // La saisie force l'entrelacement : la routine prescrit l'enchaînement.
    expect(blocs(s)[0].series.map((x) => x.etiquette)).toEqual(['A1', 'B1', 'A2', 'B2']);
    // Le détail, lui, ne l'invente pas sur des lignes sans chronologie — c'est
    // la garde du corpus importé, que Hevy a aplati.
    const plates = [
      { exercise_slug: 'dc', groupe_superset: 1, rang: 1, type_serie: 'travail', validee_a: null },
      { exercise_slug: 'dc', groupe_superset: 1, rang: 2, type_serie: 'travail', validee_a: null },
      { exercise_slug: 'ec', groupe_superset: 1, rang: 3, type_serie: 'travail', validee_a: null },
      { exercise_slug: 'ec', groupe_superset: 1, rang: 4, type_serie: 'travail', validee_a: null }
    ];
    expect(Modele.construireBlocs(plates, CATALOGUE)[0].series.map((x) => x.etiquette))
      .toEqual(['A1', 'A2', 'B1', 'B2']);
  });
});

// ══ CE QUE LA MARQUE DE TOUR N'EST PAS ═════════════════════════════════════

describe('la marque de tour reste locale (§2.4)', () => {
  test('elle ne part ni dans `sets` ni dans `sessions`', () => {
    let s = seanceDe([['dc', 1, 1], ['ec', 1, 1]]);
    s = valider(s, 0, 0); s = valider(s, 1, 0);
    expect(s.tours).toEqual({ 1: 1 });
    Seance.lignes(s).forEach((l) => expect('tours' in l).toBe(false));
    expect('tours' in Seance.ligneSession(s)).toBe(false);
    // Et aucune étiquette n'est stockée : elles se recalculent à l'affichage.
    Seance.lignes(s).forEach((l) => expect('etiquette' in l).toBe(false));
  });

  test('un bloc d’un seul exercice n’a pas de marque : il n’a rien à annoncer', () => {
    let s = valider(seanceDe([['cu', 2, null]]), 0, 0);
    expect(s.tours).toBeUndefined();
  });
});

// ══ L'EXERCICE VIDÉ DE SES SÉRIES NE DISPARAÎT PAS ═════════════════════════
//
// `construireBlocs` travaille sur des LIGNES : sans elles, l'exercice n'existe
// pas pour lui. Supprimer la dernière série d'un exercice l'aurait donc effacé
// de l'écran — avec sa note, son repos et son « + Série », et sans aucun chemin
// pour y revenir.

describe('un exercice sans série reste à l’écran', () => {
  test('hors superset : son bloc reste, à sa place, avec son « + Série »', () => {
    let s = seanceDe([['dc', 1, null], ['cu', 2, null]]);
    s = Seance.definirNoteExercice(s, 0, 'À reprendre');
    s = Seance.retirerSerie(s, 0, 0);
    expect(s.exercices[0].series).toHaveLength(0);

    const c = rendre(s);
    const blocsRendus = c.querySelectorAll('.bloc-seance');
    expect(blocsRendus).toHaveLength(2);
    // Toujours EN PREMIER : l'ordre de la séance ne bouge pas sous les pieds.
    expect(blocsRendus[0].querySelector('.exo-seance').textContent)
      .toBe('Développé Couché (Barre)');
    expect(blocsRendus[0].querySelectorAll('.ligne-serie')).toHaveLength(0);
    expect(blocsRendus[0].querySelector('.note-exo').textContent).toBe('À reprendre');
    expect(blocsRendus[0].querySelectorAll('.ajout-serie button')).toHaveLength(1);
  });

  test('dans un superset : la branche vidée garde sa place dans la légende', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 1, 1]]);
    s = Seance.retirerSerie(s, 1, 0);
    const c = rendre(s);
    // Le bloc n'a plus qu'un exercice à lignes : ce n'est plus un superset, et
    // la branche vidée revient en bloc d'un seul, à sa place.
    expect(c.querySelectorAll('.bloc-seance')).toHaveLength(2);
    expect(etiquettes(c, 0)).toEqual(['1', '2']);
    expect(etiquettes(c, 1)).toEqual([]);
    expect(Array.from(c.querySelectorAll('.exo-seance')).map((n) => n.textContent))
      .toEqual(['Développé Couché (Barre)', 'Écarté Poulie']);
  });

  test('le « + Série » d’un bloc vidé vise bien SON exercice', () => {
    let s = seanceDe([['dc', 1, null], ['cu', 1, null]]);
    s = Seance.retirerSerie(s, 0, 0);
    const vus = [];
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, {
      blocs: blocs(s), tourAtteint: () => 0, exercice: (slug) => INDEX[slug],
      precedent: () => null, fantome: () => ({}),
      surChamp: () => {}, surValider: () => {}, surNumero: () => {},
      surEffort: () => {}, surSupprimerSerie: () => {},
      surAjoutSerie: (i) => vus.push(i)
    });
    cible.querySelectorAll('.bloc-seance')[0]
      .querySelector('.ajout-serie button').click();
    expect(vus).toEqual([0]);
  });
});
