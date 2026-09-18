//
// Chantier 41 — la bibliothèque de routines (§7 duodecies).
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater), et il en faut trois :
//
//   · dégrouper — un superset de TROIS, et on sort celui du MILIEU. Sur un
//     superset de deux, « couper les deux liens » et « couper un seul lien »
//     donnent le même écran ; sur trois, seul le premier laisse A et C séparés.
//   · dissolution — un superset de DEUX, et on en sort un : le groupe doit
//     disparaître ENTIÈREMENT (§7 decies, pas de groupe à un). Sur trois, le
//     reste formerait encore un groupe et la dissolution ne se verrait pas.
//   · menu — un exercice au MILIEU d'une liste de trois, et non pas le premier :
//     sur le premier, « Monter » grisé et « Monter » absent se ressemblent, et
//     « peut grouper » est vrai des deux côtés.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/rendu.js` se termine
// par `this`, que Babel remplace par `undefined` sous l'environnement node.

const Routines = require('../../v2/js/routines.js');
require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

// Ni `series` ni `reps_visees` ici : ce qui reste dans ce fichier ne lit que
// le GROUPEMENT et le menu. Y laisser un entier de l'ancien modèle aurait été
// un piège pour le prochain qui reprend la fixture.
const exo = (slug, groupe) => ({
  id: 'x-' + slug, exercise_slug: slug, rang: 0, repos_cible_s: 90,
  groupe_superset: groupe === undefined ? null : groupe, note: null
});

// ════════════════════════════════════════════════════════════════════════════
// 3. DÉGROUPER — et la dissolution d'un superset à deux
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ dégrouper s’écrit avec les liens, et un groupe à un n’existe pas', () => {
  // CONFIGURATION DISCRIMINANTE : A-B-C groupés, on sort B, celui du MILIEU.
  const TRIO = () => [exo('a', 1), exo('b', 1), exo('c', 1), exo('d')];

  test('sortir celui du milieu coupe les DEUX liens : A seul, B seul, C seul', () => {
    const r = Routines.degrouper(TRIO(), 1);
    expect(r.map((e) => e.groupe_superset)).toEqual([null, null, null, null]);
  });

  test('sortir le premier laisse B et C groupés ensemble', () => {
    const r = Routines.degrouper(TRIO(), 0);
    expect(r.map((e) => e.groupe_superset)).toEqual([null, 1, 1, null]);
  });

  // §7 decies — IL N'EXISTE PAS DE SUPERSET À UN.
  test('un superset à DEUX se dissout entièrement quand on en sort un', () => {
    const duo = [exo('a', 1), exo('b', 1), exo('c')];
    expect(Routines.degrouper(duo, 0).map((e) => e.groupe_superset))
      .toEqual([null, null, null]);
    expect(Routines.degrouper(duo, 1).map((e) => e.groupe_superset))
      .toEqual([null, null, null]);
  });

  test('dégrouper un exercice qui n’est dans aucun groupe ne change rien', () => {
    const liste = [exo('a'), exo('b'), exo('c')];
    expect(Routines.degrouper(liste, 1).map((e) => e.groupe_superset))
      .toEqual([null, null, null]);
  });

  test('les numéros se renumérotent : le groupe restant repart à 1', () => {
    // A-B groupés, C-D groupés : on dissout le premier, le second devient n° 1.
    const deux = [exo('a', 1), exo('b', 1), exo('c', 2), exo('d', 2)];
    expect(Routines.degrouper(deux, 0).map((e) => e.groupe_superset))
      .toEqual([null, null, 1, 1]);
  });
});

describe('⚠️ ce que le menu a le droit de proposer se lit sur les liens', () => {
  const LISTE = () => [exo('a', 1), exo('b', 1), exo('c')];

  test('« dégrouper » n’a de sens que sur un exercice groupé', () => {
    expect(Routines.estGroupe(LISTE(), 0)).toBe(true);
    expect(Routines.estGroupe(LISTE(), 1)).toBe(true);
    expect(Routines.estGroupe(LISTE(), 2)).toBe(false);
  });

  test('« grouper avec le suivant » n’a de sens que s’il y a un suivant non lié', () => {
    expect(Routines.peutGrouper(LISTE(), 0)).toBe(false);   // déjà lié à B
    expect(Routines.peutGrouper(LISTE(), 1)).toBe(true);    // B n’est pas lié à C
    expect(Routines.peutGrouper(LISTE(), 2)).toBe(false);   // pas de suivant
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 1. LE MENU DE LA CARTE — et plus aucun bouton permanent
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ LA CARTE DE L'ÉDITEUR N'EXISTE PLUS (chantier 43). `rendreExosRoutine`
// est supprimée : l'éditeur rend les blocs de la séance, par la même fonction
// qu'elle (§7 quindecies). Ce que ce bloc vérifiait — un seul menu par
// exercice, le signe du superset, les champs sur la ligne, le repos au même
// bouton qu'en séance — est vérifié sur l'écran RÉEL dans
// `v2-editeur-est-la-seance.test.js`. Le répéter ici sur un rendu disparu
// aurait été le pire des deux mondes : des tests verts sur du code mort.

// ⚠️ CINQ GESTES DEPUIS LE CHANTIER 43, ET C'EST UNE SUPPRESSION VOULUE.
// « Modifier les paramètres » ouvrait une feuille de trois champs. Séries et
// reps se tapent maintenant SUR LA LIGNE, et le repos a son propre bouton sous
// le nom — le même qu'en séance. L'entrée aurait été un second chemin vers le
// même réglage, plus long que le premier.
//
// ⚠️ ET QUATRE DEPUIS LE CHANTIER 46 : « Monter » et « Descendre » ont fusionné
// en « Réorganiser… » (§7 vicies.1). Deux entrées qui bougeaient d'un cran
// chacune, quand réordonner n'est presque jamais un geste isolé. Les flèches
// ↑/↓ ne disparaissent pas pour autant : elles vivent sur le bloc REPLIÉ, où
// elles restent le chemin accessible au clavier.
describe('⚠️ le menu porte ses gestes, et grise ce qui n’a pas de sens', () => {
  const feuille = (vue) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleExoRoutine(cible, Object.assign({
      nom: 'Curl', peutGrouper: true, estGroupe: true,
      surGrouper: () => {}, surDegrouper: () => {},
      surReorganiser: () => {}, surSupprimer: () => {}
    }, vue));
    return cible;
  };
  const entrees = (c) => [...c.querySelectorAll('.feuille-menu button')]
    .map((b) => b.textContent + (b.disabled ? ' (inerte)' : ''));

  test('[46] quatre gestes, et « Réorganiser… » à la place des deux flèches', () => {
    expect(entrees(feuille())).toEqual([
      'Grouper avec le suivant', 'Dégrouper', 'Réorganiser…',
      'Supprimer l’exercice'
    ]);
    expect(feuille().textContent).not.toContain('paramètres');
    expect(feuille().textContent).not.toContain('Monter');
    expect(feuille().textContent).not.toContain('Descendre');
  });

  // ⚠️ L'ASYMÉTRIE EST LA MESURE : sur un exercice seul, deux des quatre sont
  // grisés. Sans le cas opposé ci-dessus, « grisé » et « actif » rendraient le
  // même menu.
  test('l’exercice seul : ni grouper, ni dégrouper', () => {
    expect(entrees(feuille({ peutGrouper: false, estGroupe: false })))
      .toEqual([
        'Grouper avec le suivant (inerte)', 'Dégrouper (inerte)',
        'Réorganiser…', 'Supprimer l’exercice'
      ]);
  });

  // ⚠️ ET SUR UNE ROUTINE D'UN SEUL EXERCICE, « Réorganiser » N'A PAS DE SENS.
  // L'appelant ne fournit alors pas le geste, et l'entrée se grise — grisée
  // plutôt qu'absente, pour que les entrées ne bougent pas d'une carte à l'autre.
  test('[46] un seul exercice : « Réorganiser » est inerte', () => {
    expect(entrees(feuille({ surReorganiser: null })))
      .toContain('Réorganiser… (inerte)');
  });

  test('« Supprimer » est à part, et porte le rouge', () => {
    const c = feuille();
    const menus = c.querySelectorAll('.feuille-menu');
    expect(menus.length).toBe(2);
    expect(menus[1].querySelector('button').classList.contains('danger')).toBe(true);
  });

  test('chaque entrée active appelle SON geste, et lui seul', () => {
    const vus = [];
    const c = feuille({
      surGrouper: () => vus.push('grouper'), surDegrouper: () => vus.push('degrouper'),
      surReorganiser: () => vus.push('reorganiser'),
      surSupprimer: () => vus.push('supprimer')
    });
    [...c.querySelectorAll('.feuille-menu button')].forEach((b) => b.click());
    expect(vus).toEqual(['grouper', 'degrouper', 'reorganiser', 'supprimer']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 et 4. LA SUPPRESSION — ce qu'on dit, et ce qu'on ne dit pas
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ la confirmation de suppression lève la crainte, sans parler de « lien »', () => {
  const AIDE = 'Les séances que tu as déjà faites avec elle restent intactes, ' +
    'avec toutes leurs séries. Seule la routine part, et rien ne la remet en place.';

  test('elle dit que les séances passées survivent', () => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleConfirmer(cible, {
      titre: 'Supprimer cette routine ?', sujet: 'Push', danger: true,
      libelle: 'Supprimer', aide: AIDE,
      surConfirmer: () => {}, surAnnuler: () => {}
    });
    expect(cible.querySelector('.feuille-aide').textContent).toBe(AIDE);
    // ⚠️ « LIEN » EST LE MOT À NE PAS DIRE : une séance passée n'est pas liée à
    // sa routine, elle en est ISSUE. Le mot ferait croire qu'il y a quelque
    // chose à perdre.
    expect(cible.textContent).not.toMatch(/lien|liée/i);
    expect(cible.querySelector('.feuille-menu button').classList.contains('danger'))
      .toBe(true);
  });

  test('annuler et confirmer sont deux boutons distincts', () => {
    const vus = [];
    const cible = document.createElement('div');
    Rendu().rendreFeuilleConfirmer(cible, {
      titre: 'Supprimer cette routine ?', sujet: 'Push', danger: true,
      libelle: 'Supprimer', aide: AIDE,
      surConfirmer: () => vus.push('oui'), surAnnuler: () => vus.push('non')
    });
    const b = [...cible.querySelectorAll('.feuille-menu button')];
    expect(b.map((x) => x.textContent)).toEqual(['Supprimer', 'Annuler']);
    b[1].click();
    expect(vus).toEqual(['non']);
  });
});

// ⚠️ CE QUE LE CHANTIER 41 A FAILLI EMPORTER, ET QUE SEUL LE BANC A VU.
//
// Les boutons ↑↓✕ de l'éditeur passaient par un helper `geste()` — partagé, sans
// que rien ne le dise, avec le MODE MODIFIER de la séance (§5.3). Le retirer
// avec l'éditeur a cassé un écran qui n'était pas dans le périmètre : `node -c`
// ne voit pas un appel à une fonction disparue, et aucun test unitaire ne
// rendait un bloc replié. Celui-ci le fait.
describe('⚠️ le mode Modifier de la séance garde ses deux flèches', () => {
  const Seance = require('../../v2/js/seance.js');
  const Modele = require('../../v2/js/modele.js');
  const EXOS = [
    { slug: 'a', nom: 'Squat (Barre)', mesure: 'charge_reps', muscles_primaires: ['quadriceps'] },
    { slug: 'b', nom: 'Curl', mesure: 'charge_reps', muscles_primaires: ['biceps'] }
  ];
  let k = 0;
  const idSerie = () => 'm-' + (++k);

  test('replié, chaque bloc porte « Monter » et « Descendre », bornes grisées', () => {
    let s = Seance.creer({ id: 'S', userId: 'u', idSerie: idSerie });
    s = Seance.ajouterExercice(s, 'a', idSerie);
    s = Seance.ajouterExercice(s, 'b', idSerie);
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, {
      blocs: Modele.blocsDeSeance(s, EXOS),
      modifier: true, selection: null,
      surGrouper: () => {}, surDeplacerBloc: () => {},
      surMenuBloc: () => {}, surMenuExercice: () => {},
      tourAtteint: () => 0,
      exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
      precedent: () => null, fantome: () => ({}),
      surChamp: () => {}, surValider: () => {}, surNumero: () => {},
      surEffort: () => {}, surNote: () => {}, surRepos: () => {},
      surSupprimerSerie: () => {}, surAjoutSerie: () => {}
    });
    expect(cible.querySelectorAll('.bloc-seance.replie').length).toBe(2);
    expect(cible.querySelectorAll('.ligne-serie').length).toBe(0);
    const fleches = [...cible.querySelectorAll('.replie-gestes .geste')];
    expect(fleches.length).toBe(4);
    expect(fleches.map((b) => b.getAttribute('aria-label')))
      .toEqual(['Monter le bloc', 'Descendre le bloc', 'Monter le bloc', 'Descendre le bloc']);
    // Les bornes : le premier ne monte pas, le dernier ne descend pas.
    expect(fleches.map((b) => b.disabled)).toEqual([true, false, false, true]);
  });
});

// ⚠️ LA LEÇON DE LA MUTATION M7 A SURVÉCU À SA COLONNE (chantier 43).
//
// Elle portait sur `series` : la carte lisait la valeur BRUTE quand l'écriture
// en envoyait une autre — deux voix pour un seul nombre. `series` n'est plus
// écrite, et `serieBornee` est partie avec elle. La règle, elle, vaut toujours,
// et elle est vérifiée là où le nombre se saisit maintenant : sur la ligne et
// dans la feuille du repos (`v2-editeur-est-la-seance.test.js`).
