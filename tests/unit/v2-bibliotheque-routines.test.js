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

const exo = (slug, groupe) => ({
  id: 'x-' + slug, exercise_slug: slug, rang: 0, series: 3,
  reps_visees: 8, repos_cible_s: 90,
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
const nommer = (slug) => ({ a: 'Squat (Barre)', b: 'Curl', c: 'Planche' }[slug] || slug);

const rendreListe = (liste, vue) => {
  const cible = document.createElement('div');
  Rendu().rendreExosRoutine(cible, liste, nommer, Object.assign(
    { surMenu: () => {}, surChamp: () => {}, surParametres: () => {} }, vue));
  return cible;
};

describe('⚠️ la carte de l’éditeur : un menu, et ce que la routine prescrit', () => {
  const LISTE = () => [exo('a', 1), exo('b', 1), exo('c')];

  test('aucun bouton permanent sur la carte — un seul menu par exercice', () => {
    const c = rendreListe(LISTE());
    expect(c.querySelectorAll('.exo-routine').length).toBe(3);
    expect(c.querySelectorAll('.exo-routine-haut .menu-pts').length).toBe(3);
    // Les quatre boutons d'avant : monter, descendre, retirer, et le lien
    // « grouper avec le suivant » entre chaque paire.
    expect(c.querySelectorAll('.geste').length).toBe(0);
    expect(c.querySelectorAll('.lien-superset').length).toBe(0);
  });

  test('le menu s’ouvre sur l’exercice qu’on a touché, pas sur un autre', () => {
    const vus = [];
    const c = rendreListe(LISTE(), { surMenu: (i) => vus.push(i) });
    [...c.querySelectorAll('.menu-pts')].forEach((b) => b.click());
    expect(vus).toEqual([0, 1, 2]);
  });

  // §7 quaterdecies.1 — LES DEUX CHAMPS QU'ON REMPLIT TOUJOURS SONT SUR LA CARTE.
  test('la carte porte séries et reps visées, saisissables sans ouvrir la feuille', () => {
    const c = rendreListe([exo('a')]);
    expect([...c.querySelectorAll('.exo-routine-champs .champ-lib')].map((x) => x.textContent))
      .toEqual(['Séries', 'Reps visées']);
    expect([...c.querySelectorAll('.exo-routine-champs input')].map((i) => i.value))
      .toEqual(['3', '8']);
  });

  test('le repos se LIT sur la carte, au même bouton qu’en séance', () => {
    const c = rendreListe([exo('a')]);
    expect(c.querySelector('.repos-cible').textContent).toBe('repos 1:30');
    const sans = rendreListe([Object.assign(exo('a'), { repos_cible_s: null })]);
    expect(sans.querySelector('.repos-cible').textContent).toBe('repos —');
  });

  test('un appui sur le repos ouvre la feuille, sans passer par le menu', () => {
    const vus = [];
    const c = rendreListe([exo('a'), exo('b')], { surParametres: (i) => vus.push(i) });
    [...c.querySelectorAll('.repos-cible')].forEach((b) => b.click());
    expect(vus).toEqual([0, 1]);
  });

  test('ce qui n’est pas renseigné reste vide, avec un tiret en fantôme', () => {
    const c = rendreListe([Object.assign(exo('a'),
      { series: 1, reps_visees: null, repos_cible_s: null })]);
    const champs = [...c.querySelectorAll('.exo-routine-champs input')];
    expect(champs.map((i) => i.value)).toEqual(['1', '']);
    expect(champs[1].getAttribute('placeholder')).toBe('—');
  });

  test('la saisie sur la carte MUTE sans redessiner', () => {
    const vus = [];
    const c = rendreListe([exo('a')], { surChamp: (i, champ, val) => vus.push(i + ':' + champ + '=' + val) });
    const champs = [...c.querySelectorAll('.exo-routine-champs input')];
    champs[1].value = '12';
    champs[1].dispatchEvent(new window.Event('input'));
    expect(vus).toEqual(['0:reps_visees=12']);
    expect([...c.querySelectorAll('.exo-routine-champs input')][1]).toBe(champs[1]);
  });

  test('le superset garde son signe : lettres et liseré, comme en séance', () => {
    const c = rendreListe(LISTE());
    const cartes = [...c.querySelectorAll('.exo-routine')];
    expect(cartes.map((x) => x.classList.contains('groupe')))
      .toEqual([true, true, false]);
    expect([...c.querySelectorAll('.lettre-exo')].map((x) => x.textContent))
      .toEqual(['A', 'B']);
  });

  test('une liste vide dit quoi faire, elle ne rend pas un écran nu', () => {
    const c = rendreListe([]);
    expect(c.querySelector('.vide').textContent).toContain('Ajoute le premier');
  });
});

describe('⚠️ le menu porte les six gestes, et grise ce qui n’a pas de sens', () => {
  const feuille = (vue) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleExoRoutine(cible, Object.assign({
      nom: 'Curl', peutGrouper: true, estGroupe: true,
      peutMonter: true, peutDescendre: true,
      surGrouper: () => {}, surDegrouper: () => {}, surMonter: () => {},
      surDescendre: () => {}, surParametres: () => {}, surSupprimer: () => {}
    }, vue));
    return cible;
  };
  const entrees = (c) => [...c.querySelectorAll('.feuille-menu button')]
    .map((b) => b.textContent + (b.disabled ? ' (inerte)' : ''));

  test('les six gestes du §7 duodecies.2, dans l’ordre, et rien d’autre', () => {
    expect(entrees(feuille())).toEqual([
      'Grouper avec le suivant', 'Dégrouper', 'Monter', 'Descendre',
      'Modifier les paramètres', 'Supprimer l’exercice'
    ]);
  });

  // ⚠️ L'ASYMÉTRIE EST LA MESURE : sur un exercice seul en fin de liste, quatre
  // des six sont grisés. Sans le cas opposé ci-dessus, « grisé » et « actif »
  // rendraient le même menu.
  test('le dernier exercice, seul : ni grouper, ni dégrouper, ni descendre', () => {
    expect(entrees(feuille({ peutGrouper: false, estGroupe: false, peutDescendre: false })))
      .toEqual([
        'Grouper avec le suivant (inerte)', 'Dégrouper (inerte)', 'Monter',
        'Descendre (inerte)', 'Modifier les paramètres', 'Supprimer l’exercice'
      ]);
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
      surMonter: () => vus.push('monter'), surDescendre: () => vus.push('descendre'),
      surParametres: () => vus.push('parametres'), surSupprimer: () => vus.push('supprimer')
    });
    [...c.querySelectorAll('.feuille-menu button')].forEach((b) => b.click());
    expect(vus).toEqual(['grouper', 'degrouper', 'monter', 'descendre',
                         'parametres', 'supprimer']);
  });
});

describe('⚠️ les paramètres, dans une feuille — trois champs, jamais quatre', () => {
  const feuille = (e) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleParametresExo(cible, {
      nom: 'Curl', exercice: e || exo('b'),
      surChamp: () => {}, surFermer: () => {}
    });
    return cible;
  };

  test('séries, reps visées, repos — et AUCUN champ de charge', () => {
    const c = feuille();
    expect([...c.querySelectorAll('.champ-lib')].map((x) => x.textContent))
      .toEqual(['Séries', 'Reps visées', 'Repos cible']);
    expect(c.textContent).not.toMatch(/charge|kg|poids/i);
  });

  test('les deux champs numériques portent les bornes de la base', () => {
    const inputs = [...feuille().querySelectorAll('input[type="number"]')];
    expect(inputs.map((i) => i.getAttribute('min') + '-' + i.getAttribute('max')))
      .toEqual(['1-20', '1-100']);
  });

  test('une valeur absente reste vide, avec un tiret en fantôme', () => {
    const c = feuille(Object.assign(exo('b'), { reps_visees: null, repos_cible_s: null }));
    const inputs = [...c.querySelectorAll('input')];
    expect(inputs[1].value).toBe('');
    expect(inputs[1].getAttribute('placeholder')).toBe('—');
  });

  test('la saisie MUTE sans redessiner — le focus d’Android ne se perd pas', () => {
    const vus = [];
    const cible = document.createElement('div');
    Rendu().rendreFeuilleParametresExo(cible, {
      nom: 'Curl', exercice: exo('b'),
      surChamp: (champ, val) => vus.push(champ + '=' + val), surFermer: () => {}
    });
    const inputs = [...cible.querySelectorAll('input')];
    inputs[0].value = '5';
    inputs[0].dispatchEvent(new window.Event('input'));
    expect(vus).toEqual(['series=5']);
    // Aucun re-rendu : le champ est toujours le même nœud.
    expect(cible.querySelectorAll('input')[0]).toBe(inputs[0]);
  });

  test('« Terminé » referme, et c’est lui seul qui redessine', () => {
    const vus = [];
    const cible = document.createElement('div');
    Rendu().rendreFeuilleParametresExo(cible, {
      nom: 'Curl', exercice: exo('b'), surChamp: () => {}, surFermer: () => vus.push(1)
    });
    cible.querySelector('.principal').click();
    expect(vus).toEqual([1]);
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

// ⚠️ TROUVÉ PAR LA CAMPAGNE DE MUTATIONS, pas par une relecture.
//
// La carte lisait `seriesValides(…).valeur`, qui rend la valeur LUE — hors
// bornes comprise. Une routine qui porte `series: 0` (le report de fin de
// séance savait en produire, chantier 36) affichait donc « 0 série » alors que
// `serieBornee` en enverra 1. Deux voix pour un seul nombre.
describe('⚠️ la carte affiche ce qui PARTIRA, pas ce qui traîne dans la ligne', () => {
  test.each([[0, '1'], [21, '20'], [3, '3']])(
    'series à %s s’affiche « %s » — le même entonnoir que l’écriture',
    (series, attendu) => {
      const c = rendreListe([Object.assign(exo('a'), { series })]);
      expect(c.querySelectorAll('.exo-routine-champs input')[0].value).toBe(attendu);
      // Et c'est bien la valeur que la ligne enverra.
      expect(Routines.serieBornee(series)).toBe(Number(attendu));
    });
});
