//
// Chantier 43 — l'éditeur de routine EST l'écran de séance
// (ECRAN-SAISIE-V1 §7 quindecies).
//
// LA RÈGLE, EN UNE PHRASE : l'éditeur de routine est l'écran de séance, moins
// deux colonnes — `PRÉC.` et la coche. Rien d'autre ne change. Il n'y a donc
// ici AUCUN test d'un second rendu : tout passe par `rendreBlocsSeance`, la
// fonction de la séance, et ce qui diffère est nommé, un drapeau à la fois.
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// **Une routine qui porte des ÉCHAUFFEMENTS, une DÉGRESSIVE, et des reps
// DISTINCTES d'une ligne à l'autre.**
//
//   · Sans chauffe ni dégressive, « chaque ligne porte son type » et « toutes
//     les lignes sont du travail » rendent exactement le même écran — et c'est
//     la seule forme que l'ancien modèle savait produire (un entier = N séries
//     de travail identiques). La programmer était impossible ; ne pas la tester
//     laisserait croire qu'elle marche.
//   · Et des reps DISTINCTES : trois lignes à 8 reps rendent « lire chaque
//     ligne » et « répéter la première » indistinguables. La rampe 15-10-5 les
//     sépare.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js`, `modele.js` et
// `routines.js` se terminent par `this`, que Babel remplace par `undefined`
// sous l'environnement node.

const Routines = require('../../v2/js/routines.js');
require('../../v2/js/semaine.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const CAT = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps',
    muscles_primaires: ['pectoraux'] },
  { slug: 'tract', nom: 'Tractions', mesure: 'reps', muscles_primaires: ['dos'] },
  { slug: 'pompes', nom: 'Pompes', mesure: 'reps', muscles_primaires: ['pectoraux'] }
];

// Une ligne programmée au vocabulaire de la SAISIE — celui que `app.js`
// fabrique au chargement (`normaliserRoutine` → `Routines.enSaisie`).
const L = (o) => Object.assign(Routines.enSaisie(null), o);

// ⚠️ LA CONFIGURATION DISCRIMINANTE, ÉCRITE À LA MAIN. Trois chauffes en
// rampe (20×15, 60×10, 100×5), deux séries de travail à 125×5, et une
// dégressive à 3 reps sans charge.
const RAMPE = () => ({
  id: 'e-dc', exercise_slug: 'dc', rang: 0, repos_cible_s: 210,
  note: 'Pieds sous les fesses, pause 1 s en bas', groupe_superset: null,
  series: [
    L({ id: 's1', type_serie: 'echauffement', charge_kg: 20, reps: 15 }),
    L({ id: 's2', type_serie: 'echauffement', charge_kg: 60, reps: 10 }),
    L({ id: 's3', type_serie: 'echauffement', charge_kg: 100, reps: 5 }),
    L({ id: 's4', type_serie: 'travail', charge_kg: 125, reps: 5 }),
    L({ id: 's5', type_serie: 'travail', charge_kg: 125, reps: 5 }),
    L({ id: 's6', type_serie: 'degressive', charge_kg: null, reps: 3 })
  ]
});

// Le superset du bas de la maquette : A trois tours, B deux.
const SUPERSET = () => [
  { id: 'e-a', exercise_slug: 'tract', rang: 0, repos_cible_s: 150,
    note: null, groupe_superset: 0,
    series: [L({ type_serie: 'echauffement', reps: 3 }),
             L({ type_serie: 'travail', reps: 6 }),
             L({ type_serie: 'travail', reps: 6 })] },
  { id: 'e-b', exercise_slug: 'pompes', rang: 1, repos_cible_s: null,
    note: null, groupe_superset: 0,
    series: [L({ type_serie: 'echauffement', reps: 10 }),
             L({ type_serie: 'travail', reps: 20 }),
             L({ type_serie: 'travail', reps: 20 })] }
];

// ── Le rendu, exactement comme `app.js` l'appelle ──────────────────────────
const gestes = () => ({
  surChamp: () => {}, surNumero: () => {}, surNote: () => {}, surRepos: () => {},
  surAjoutSerie: () => {}, surSupprimerSerie: () => {},
  surMenuBloc: () => {}, surMenuExercice: () => {}
});

function rendre(exercices, vue) {
  const brouillon = { exercices: exercices };
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, null, Object.assign({
    programme: true,
    blocs: Modele.blocsDeSeance(brouillon, CAT),
    exercice: (slug) => CAT.filter((e) => e.slug === slug)[0]
  }, gestes(), vue || {}));
  return cible;
}

// LA MÊME STRUCTURE, RENDUE EN SÉANCE. C'est l'autre moitié de chaque
// assertion : sans elle, « la colonne est absente » et « la colonne n'existe
// nulle part » se ressemblent.
function rendreEnSeance(exercices, vue) {
  const s = { exercices: exercices };
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, s, Object.assign({
    blocs: Modele.blocsDeSeance(s, CAT),
    exercice: (slug) => CAT.filter((e) => e.slug === slug)[0],
    precedent: () => null, fantome: () => ({}), tourAtteint: () => 0,
    surValider: () => {}, surEffort: () => {}
  }, gestes(), vue || {}));
  return cible;
}

const txt = (n) => [...n].map((x) => x.textContent);
const val = (n) => [...n].map((x) => x.value);

// ════════════════════════════════════════════════════════════════════════════
// 1 à 4 — C'EST LE MÊME ÉCRAN, MOINS DEUX COLONNES
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ l’éditeur rend les rangées de la séance, moins `PRÉC.` et la coche', () => {
  // 1.
  test('les deux colonnes tombent — et l’effort avec, faute de colonne en base', () => {
    const c = rendre([RAMPE()]);
    expect(c.querySelectorAll('.bloc-seance').length).toBe(1);
    expect(txt(c.querySelectorAll('.cols-seance span')))
      .toEqual(['', 'KG', 'REPS', '']);
    expect(c.querySelectorAll('.prec').length).toBe(0);
    expect(c.querySelectorAll('.ok-serie').length).toBe(0);
    expect(c.querySelectorAll('.eff-serie').length).toBe(0);
  });

  // 2. ⚠️ L'ASYMÉTRIE EST LA MESURE. La MÊME structure rendue en séance porte
  // les trois : sans ce second rendu, « supprimé en mode programme » et
  // « supprimé partout » donneraient le même verdict, et une régression qui
  // casse la séance passerait pour un succès.
  test('la MÊME structure, rendue en séance, les porte toutes les trois', () => {
    const c = rendreEnSeance([RAMPE()]);
    expect(txt(c.querySelectorAll('.cols-seance span')))
      .toEqual(['', 'PRÉC.', 'KG', 'REPS', 'EFFORT', '']);
    expect(c.querySelectorAll('.prec').length).toBe(6);
    expect(c.querySelectorAll('.ok-serie').length).toBe(6);
    expect(c.querySelectorAll('.eff-serie').length).toBe(6);
  });

  // 3. Le gabarit de grille est le même, marqué `programme` — c'est lui qui
  // rend les 142 px libérés aux champs qu'on remplit.
  test('le gabarit de grille est celui de la séance, marqué `programme`', () => {
    const r = rendre([RAMPE()]).querySelector('.serie');
    expect(r.className).toBe('serie grille g-charge_reps programme');
    expect(rendreEnSeance([RAMPE()]).querySelector('.serie').className)
      .toBe('serie grille g-charge_reps');
  });

  // 4. ⚠️ CHAQUE LIGNE PORTE SA VALEUR — la configuration discriminante.
  test('chaque ligne porte SES valeurs, pas celles de la première', () => {
    const c = rendre([RAMPE()]);
    expect(val(c.querySelectorAll('.ch-serie input')))
      .toEqual(['20', '60', '100', '125', '125', '']);
    expect(val(c.querySelectorAll('.rp-serie input')))
      .toEqual(['15', '10', '5', '5', '5', '3']);
  });

  // 5. Le badge de chauffe est CELUI DE LA SÉANCE : même fonction
  // (`etiquetteSerie`), même classe, même numérotation — les chauffes ne
  // consomment pas de numéro de série de travail.
  test('le badge de chauffe et la dégressive sont ceux de la séance', () => {
    const badges = (n) => [...n.querySelectorAll('.no-serie')]
      .map((b) => b.textContent + ':' + b.className.replace('no-serie', '').trim());
    expect(badges(rendre([RAMPE()])))
      .toEqual(['W:c', 'W:c', 'W:c', '1:', '2:', 'D:d']);
    // Et le même écran en séance donne exactement les mêmes badges.
    expect(badges(rendreEnSeance([RAMPE()]))).toEqual(badges(rendre([RAMPE()])));
  });

  // 6. §2.3 — l'entrelacement d'un superset vient de `construireBlocs`, pas
  // d'un second entrelaceur. A1/B1/A2/B2, chauffes comprises.
  test('le superset s’entrelace comme en séance, chauffes comprises', () => {
    const c = rendre(SUPERSET());
    expect(c.querySelectorAll('.bloc-seance.superset').length).toBe(1);
    // ⚠️ `A` ET `B` SANS `W` : dans un superset, le badge porte la lettre et le
    // TOUR (§2.3), et une chauffe n'a pas de tour. Le type reste dans la
    // couleur, exactement comme au détail de séance — c'est la règle du
    // chantier 29, et l'éditeur n'en invente pas une autre.
    expect(txt(c.querySelectorAll('.no-serie')))
      .toEqual(['A', 'B', 'A1', 'B1', 'A2', 'B2']);
    expect(txt(c.querySelectorAll('.lettre-exo'))).toEqual(['A', 'B']);
    // Le nombre de tours se DIT — mais pas le tour atteint : une routine ne
    // s'exécute pas, et « tour 0/2 » y annoncerait un retard imaginaire.
    expect(c.querySelector('.superset-t').textContent).toBe('Superset · 2 tours');
    expect(rendreEnSeance(SUPERSET()).querySelector('.superset-t').textContent)
      .toBe('Superset · tour 0/2');
  });

  // 7. ⚠️ ÉCART ASSUMÉ (§7 quindecies.2) : le nom n'est PAS tapable dans l'éditeur.
  // En séance, un tap ouvre la page de l'exercice et la séance survit — elle est
  // persistée. Le brouillon d'une routine ne l'est pas : quitter et revenir le
  // refabrique depuis la routine chargée, donc le tap coûterait une routine en
  // cours d'édition, sans un mot. Le test tient les DEUX côtés — sans le second,
  // « pas de lien ici » et « plus de lien nulle part » se ressemblent.
  test('le nom reste du texte ici, et reste un lien en séance', () => {
    const c = rendre([RAMPE()]);
    expect(c.querySelectorAll('.nom-exo.lien').length).toBe(0);
    expect(c.querySelector('.nom-exo').tagName).toBe('SPAN');
    const enSeance = rendreEnSeance([RAMPE()], { surExercice: () => {} });
    expect(enSeance.querySelectorAll('.nom-exo.lien').length).toBe(1);
  });

  // 8. §7 septies.1 et .2 — la note et le repos sont au même bouton qu'en
  // séance, par la même fonction (`reglagesExo`).
  test('la note et le repos sont au même bouton, au même endroit qu’en séance', () => {
    const c = rendre([RAMPE()]);
    expect(c.querySelector('.repos-cible').textContent).toBe('repos 3:30');
    expect(c.querySelector('.note-exo').textContent)
      .toBe('Pieds sous les fesses, pause 1 s en bas');
    expect(c.querySelector('.note-exo').classList.contains('pleine')).toBe(true);
    // Un repos désactivé se lit au tiret, exactement comme en séance.
    const sans = rendre(SUPERSET());
    expect(txt(sans.querySelectorAll('.repos-cible'))).toEqual(['repos 2:30', 'repos —']);
  });

  // 9. ⚠️ AUCUN FANTÔME. En séance, un champ vide propose la valeur de la fois
  // d'avant, en gris. Ici, ce qu'on tape EST la prescription : une valeur grise
  // s'y lirait comme une valeur déjà programmée.
  test('aucun fantôme : un champ vide est vide, il ne propose rien', () => {
    const vide = rendre([RAMPE()]).querySelectorAll('.ch-serie')[5];
    expect(vide.querySelector('input').value).toBe('');
    expect(vide.querySelector('input').getAttribute('placeholder')).toBeNull();
    expect(vide.classList.contains('fantome')).toBe(false);
    // En séance, le même champ vide porte le fantôme qu'on lui donne.
    const enSeance = rendreEnSeance([RAMPE()], { fantome: () => ({ charge_kg: 110 }) })
      .querySelectorAll('.ch-serie')[5];
    expect(enSeance.querySelector('input').getAttribute('placeholder')).toBe('110');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9 et 10 — UN SEUL MENU PAR EXERCICE, JAMAIS DEUX, JAMAIS ZÉRO
// ════════════════════════════════════════════════════════════════════════════
//
// Les cinq gestes de l'éditeur portent tous sur un EXERCICE. Sur un bloc d'un
// seul, bloc et exercice sont le même objet : le menu du bloc suffit. Sur un
// superset, un menu de bloc serait un menu sans objet — et il y en aurait deux
// pour la branche A. La règle est donc complémentaire de celle de la séance,
// qui ne donne un menu d'exercice QUE dans un bloc à plusieurs.
describe('⚠️ un seul menu ⋮ par exercice, sur les deux formes de bloc', () => {
  test('bloc d’un seul : le menu du bloc, et lui seul', () => {
    const vus = [];
    const c = rendre([RAMPE()], { surMenuBloc: (i) => vus.push('bloc:' + i) });
    expect(c.querySelectorAll('.menu-pts').length).toBe(1);
    c.querySelector('.menu-pts').click();
    expect(vus).toEqual(['bloc:0']);
  });

  test('superset : un menu PAR BRANCHE, et aucun de bloc', () => {
    const vus = [];
    const c = rendre(SUPERSET(), {
      surMenuBloc: (i) => vus.push('bloc:' + i),
      surMenuExercice: (i, iExo) => vus.push('exo:' + iExo)
    });
    expect(c.querySelectorAll('.tete-haut .menu-pts').length).toBe(0);
    const menus = [...c.querySelectorAll('.legende-haut .menu-pts')];
    expect(menus.length).toBe(2);
    menus.forEach((b) => b.click());
    expect(vus).toEqual(['exo:0', 'exo:1']);
  });

  // ⚠️ ET EN SÉANCE LES DEUX COEXISTENT — ils y portent des objets différents.
  // Sans ce test, « pas de menu de bloc sur un superset » passerait pour une
  // règle générale, et la séance perdrait le sien à la première régression.
  test('en séance, le superset garde SON menu de bloc EN PLUS des deux', () => {
    const c = rendreEnSeance(SUPERSET());
    expect(c.querySelectorAll('.tete-haut .menu-pts').length).toBe(1);
    expect(c.querySelectorAll('.legende-haut .menu-pts').length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11 et 12 — « + SÉRIE », ET LE TYPE D'UNE LIGNE
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ ajouter et typer une ligne, avec les gestes de la séance', () => {
  test('« + Série » est celui de la séance, un par branche du superset', () => {
    expect(txt(rendre([RAMPE()]).querySelectorAll('.ajout-serie button')))
      .toEqual(['+ Série']);
    expect(txt(rendre(SUPERSET()).querySelectorAll('.ajout-serie button')))
      .toEqual(['+ Série A', '+ Série B']);
  });

  test('le numéro de série ouvre la feuille de type, sur SA ligne', () => {
    const vus = [];
    const c = rendre([RAMPE()], { surNumero: (i, j) => vus.push(i + ':' + j) });
    [...c.querySelectorAll('.no-serie')].forEach((b) => b.click());
    expect(vus).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4', '0:5']);
  });

  // ⚠️ LA FEUILLE DE TYPE EST CELLE DE LA SÉANCE, moins la note de série :
  // `routine_sets` n'a aucune colonne où la mettre, et un champ qu'on remplit
  // et que l'enregistrement jette est pire qu'un champ absent.
  test('la feuille de type est celle de la séance, sans la note de série', () => {
    const feuille = (programme) => {
      const cible = document.createElement('div');
      Rendu().rendreFeuilleSerie(cible, {
        quoi: 'type', programme: programme, numero: 1, exercice: 'DC',
        serie: { type_serie: 'echauffement', note: null },
        surType: () => {}, surNoteSerie: () => {}, surSupprimer: () => {}
      });
      return cible;
    };
    expect(txt(feuille(true).querySelectorAll('.feuille-menu button')).slice(0, 4))
      .toEqual(txt(feuille(false).querySelectorAll('.feuille-menu button')).slice(0, 4));
    expect(feuille(true).querySelectorAll('.champ-texte').length).toBe(0);
    expect(feuille(false).querySelectorAll('.champ-texte').length).toBe(1);
  });

  test('la saisie MUTE sans redessiner — le clavier d’Android ne se perd pas', () => {
    const vus = [];
    const c = rendre([RAMPE()], { surChamp: (i, j, ch, v) => vus.push([i, j, ch, v].join(':')) });
    const champ = c.querySelectorAll('.rp-serie input')[3];
    champ.value = '12';
    champ.dispatchEvent(new window.Event('input'));
    expect(vus).toEqual(['0:3:reps:12']);
    expect(c.querySelectorAll('.rp-serie input')[3]).toBe(champ);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 13 et 14 — LE REPOS : LE PAVÉ DE LA SÉANCE, ET LA DÉSACTIVATION
// ════════════════════════════════════════════════════════════════════════════
//
// CONFIGURATION DISCRIMINANTE (héritée du chantier 42) : **un repos qui dépasse
// la minute.** Sous 60 secondes, « décalage sur deux groupes » et « champ
// numérique simple » rendent la même valeur.
describe('⚠️ le repos se programme au pavé, et se DÉSACTIVE (§7 quindecies.4)', () => {
  const feuille = (repos, vue) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleReposRoutine(cible, Object.assign({
      nom: 'Développé Couché (Barre)', repos: repos,
      surRepos: () => {}, surDesactiver: () => {}, surFermer: () => {}
    }, vue || {}));
    return cible;
  };
  const pad = (c) => c.querySelector('.chrono input');
  const taper = (input, suite) => String(suite).split('').forEach((ch) => {
    input.dispatchEvent(new window.InputEvent('beforeinput',
      { inputType: 'insertText', data: ch, cancelable: true }));
  });

  test('c’est le pavé de décalage du chantier 25, pas un champ de secondes', () => {
    expect(pad(feuille(null)).type).toBe('text');
    expect(pad(feuille(null)).inputMode).toBe('numeric');
    expect(feuille(null).querySelectorAll('input[type="number"]').length).toBe(0);
  });

  test('210 s se rouvrent en « 03:30 », et « 1 3 0 » donne 1:30', () => {
    expect(pad(feuille(210)).value).toBe('03:30');
    const vus = [];
    const p = pad(feuille(null, { surRepos: (v) => vus.push(v) }));
    taper(p, '130');
    expect(p.value).toBe('01:30');
    expect(vus[vus.length - 1]).toBe(90);
  });

  test('la borne de la base tient : 30:01 est inatteignable', () => {
    const p = pad(feuille(null));
    taper(p, '3001');
    expect(p.value).toBe('03:00');
  });

  // ⚠️ LA LEÇON DE LA MUTATION M7 (chantier 41), SUR SA NOUVELLE COLONNE : la
  // valeur AFFICHÉE est celle qui sera ÉCRITE. Une valeur hors bornes venue
  // d'ailleurs s'affiche VIDE — pas au plafond, qui serait un nombre que
  // personne n'a saisi et que la base ne verra jamais.
  test('une valeur hors bornes s’affiche VIDE, jamais ramenée au plafond', () => {
    expect(pad(feuille(1801)).value).toBe('');
    expect(pad(feuille(4)).value).toBe('');
    expect(Routines.reposEcrit(1801)).toBeNull();
    expect(Routines.reposEcrit(4)).toBeNull();
    expect(pad(feuille(1800)).value).toBe('30:00');
    expect(pad(feuille(5)).value).toBe('00:05');
  });

  // §7 quindecies.4 — DÉSACTIVER, C'EST NULL, PAS ZÉRO. `routine_exos_repos_borne`
  // refuse 0 ; et « 0:00 de repos » voudrait dire « enchaîne sans souffler »,
  // ce qui est une prescription. NULL dit « je n'en programme pas ».
  // ⚠️ ET C'EST UN GESTE, PAS UNE VALEUR — défaut trouvé AU BANC, pas ici.
  // Le bouton appelait `surRepos(null)` et l'appelant refermait sur `null` :
  // vider le pavé pour retaper fermait donc la feuille au premier effacement.
  // « Je n'en veux pas » et « j'efface pour retaper » rendent le MÊME `null` ;
  // seul le geste les sépare. Les deux assertions ci-dessous sont l'une pour
  // l'autre : sans la seconde, « le bouton désactive » et « tout `null`
  // désactive » se ressemblent, et c'est exactement ce qui est passé.
  test('« Désactiver » est un geste à part, et il envoie NULL — jamais zéro', () => {
    const vus = [];
    const c = feuille(210, {
      surRepos: (v) => vus.push('repos:' + v),
      surDesactiver: () => vus.push('desactiver')
    });
    const bouton = [...c.querySelectorAll('.feuille-menu button')]
      .filter((b) => /Désactiver/.test(b.textContent))[0];
    expect(bouton).toBeTruthy();
    bouton.click();
    expect(vus).toEqual(['desactiver']);
    // `reposEcrit` est l'entonnoir de la colonne, et zéro n'y passe pas :
    // `routine_exos_repos_borne` refuse 0, et « 0:00 de repos » serait une
    // prescription (« enchaîne sans souffler »), pas une absence.
    expect(Routines.reposEcrit(0)).toBeNull();
  });

  test('vider le pavé MUTE, sans jamais désactiver', () => {
    const vus = [];
    const c = feuille(210, {
      surRepos: (v) => vus.push('repos:' + v),
      surDesactiver: () => vus.push('desactiver')
    });
    const p = pad(c);
    for (let k = 0; k < 8; k++) {
      p.dispatchEvent(new window.InputEvent('beforeinput',
        { inputType: 'deleteContentBackward', cancelable: true }));
    }
    expect(p.value).toBe('');
    expect(vus).toContain('repos:null');
    expect(vus).not.toContain('desactiver');
  });

  test('il n’y a plus de feuille des paramètres, ni de champ « Séries »', () => {
    expect(Rendu().rendreFeuilleParametresExo).toBeUndefined();
    expect(Rendu().rendreExosRoutine).toBeUndefined();
    expect(feuille(null).textContent).not.toMatch(/Séries|Reps visées/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 15 — LES DEUX COLONNES NE SONT PLUS NI LUES NI ÉCRITES (§3)
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ `routine_exercises.series` et `reps_visees` sont hors circuit', () => {
  test('aucune des deux ne part en base', () => {
    expect(Routines.CHAMPS_EXERCICE).not.toContain('series');
    expect(Routines.CHAMPS_EXERCICE).not.toContain('reps_visees');
    const champs = Routines.normaliserExercice(
      { exercise_slug: 'dc', series: 3, reps_visees: 8 }, 'r1', 0);
    expect(Object.keys(champs).sort())
      .toEqual(['exercise_slug', 'groupe_superset', 'note', 'rang',
                'repos_cible_s', 'routine_id']);
  });

  // ⚠️ ET LE PLAN NE LES INVENTE PAS NON PLUS : ce qu'il envoie pour un
  // exercice est exactement la liste blanche, plus les lignes programmées.
  test('le plan d’écritures n’en porte aucune trace', () => {
    const plan = Routines.planEcritures([], [{ id: 'e1', exercise_slug: 'dc',
      series: [L({ type_serie: 'travail', reps: 5 })] }], 'r1', 'u1');
    expect(plan.insertions[0].series).toBeUndefined();
    expect(plan.insertions[0].reps_visees).toBeUndefined();
    expect(plan.series).toEqual([{ id: 'e1', lignes: [{
      routine_exercise_id: 'e1', user_id: 'u1', rang: 1, type_serie: 'travail',
      reps_visees: 5, charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null
    }] }]);
  });

  // ⚠️ UNE DÉPENDANCE MANQUANTE CASSE BRUYAMMENT (même doctrine qu'au ch. 40).
  //
  // Les séries programmées visent leur exercice par clé étrangère : un exercice
  // NEUF doit donc porter son identifiant avant d'être écrit. Sans fabricant,
  // `enregistrer` lève plutôt que d'écrire un exercice sans sa structure — une
  // routine à moitié enregistrée est pire qu'un enregistrement refusé. Et la
  // levée est CIBLÉE : une routine dont tous les exercices ont déjà un id n'en
  // a pas besoin, et ne doit pas être bloquée pour rien.
  test('sans fabricant d’identifiant, un exercice NEUF fait lever — pas écrire', async () => {
    const ecrivain = {
      creerRoutine: async () => ({ id: 'r1' }),
      insererExercices: async () => { throw new Error('ne devrait pas être appelé'); }
    };
    await expect(Routines.enregistrer(
      { id: null, nom: 'Push', existantes: [], exercices: [{ exercise_slug: 'dc', series: [] }] },
      ecrivain, { userId: 'u1' })).rejects.toThrow(/uuid/);
    // Et un exercice qui porte DÉJÀ son identifiant passe sans fabricant.
    const r = await Routines.enregistrer(
      { id: 'r1', nom: 'Push', nomChange: false, existantes: [],
        exercices: [{ id: 'e1', exercise_slug: 'dc', series: [L({ reps: 5 })] }] },
      Object.assign({}, ecrivain, {
        insererExercices: async (l) => l,
        remplacerSeriesRoutine: async () => []
      }), { userId: 'u1' });
    expect(r.ok).toBe(true);
  });

  // Les deux traversées de `CIBLES`, dos à dos. Une colonne ajoutée d'un côté
  // et pas de l'autre se verrait ici, et nulle part ailleurs.
  test('l’aller-retour saisie ↔ base est fidèle, et borné', () => {
    const base = { id: 's1', type_serie: 'degressive', reps_visees: 12,
      charge_cible_kg: 82.5, duree_cible_s: 90, distance_cible_m: 400 };
    const saisie = Routines.enSaisie(base);
    expect(saisie).toEqual({ id: 's1', type_serie: 'degressive',
      note: null, rpe: null, ressenti: null, validee_a: null,
      reps: 12, charge_kg: 82.5, duree_s: 90, distance_m: 400 });
    const retour = Routines.normaliserSerie(saisie, 'e1', 1, 'u1');
    ['reps_visees', 'charge_cible_kg', 'duree_cible_s', 'distance_cible_m']
      .forEach((k) => expect(retour[k]).toBe(base[k]));
    // Hors bornes → NULL, sur chaque colonne facultative.
    const hs = Routines.normaliserSerie(
      { reps: 101, charge_kg: 1001, duree_s: 0, distance_m: -1 }, 'e1', 1, 'u1');
    expect([hs.reps_visees, hs.charge_cible_kg, hs.duree_cible_s, hs.distance_cible_m])
      .toEqual([null, null, null, null]);
    // Un type inconnu retombe sur `travail`, jamais sur une valeur refusée.
    expect(Routines.normaliserSerie({ type_serie: 'n’importe quoi' }, 'e1', 1, 'u1')
      .type_serie).toBe('travail');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 16 — DÉMARRER : LA SÉANCE ARRIVE AVEC LA STRUCTURE PROGRAMMÉE (§4)
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ `Seance.creer` lit les lignes programmées, types compris', () => {
  let n = 0;
  const idSerie = () => 'ls-' + (++n);
  const creer = (exercices) => Seance.creer({
    id: 'sess', userId: 'u1', debut: '2026-09-16T10:00:00.000Z',
    routine: { id: 'r1', nom: 'Push', exercices: exercices }, idSerie: idSerie
  });

  test('chaque ligne est reproduite, avec son type et dans son ordre', () => {
    const s = creer([RAMPE()]);
    expect(s.exercices[0].series.map((x) => x.type_serie))
      .toEqual(['echauffement', 'echauffement', 'echauffement',
                'travail', 'travail', 'degressive']);
    // La charge ne descend JAMAIS : la routine dit la structure, le moteur dit
    // les charges. Les reps visées, elles, sont une intention déclarée.
    expect(s.exercices[0].series.map((x) => x.charge_kg))
      .toEqual([null, null, null, null, null, null]);
    expect(s.exercices[0].series.map((x) => x.reps))
      .toEqual([null, null, null, null, null, null]);
    expect(s.exercices[0].series.map((x) => x.reps_visees))
      .toEqual([15, 10, 5, 5, 5, 3]);
  });

  // §4 — le fantôme (chantier 38) s'aligne par TYPE et par RANG. La 1ʳᵉ chauffe
  // propose 15, pas 5 ; la 1ʳᵉ série de travail propose 5, pas 15.
  test('le fantôme s’aligne par type et par rang, pas par indice brut', () => {
    const s = creer([RAMPE()]);
    const f = (j) => Seance.fantome(s, 0, j, null);
    expect([0, 1, 2, 3, 4, 5].map((j) => f(j).reps)).toEqual([15, 10, 5, 5, 5, 3]);
  });

  // §4 — les tours de chauffe en superset (chantier 29) : les chauffes
  // s'entrelacent comme le reste, et n'ouvrent PAS de tour de travail.
  test('en superset, les chauffes s’entrelacent sans ouvrir de tour', () => {
    const s = creer(SUPERSET());
    const blocs = Modele.blocsDeSeance(s, CAT);
    expect(blocs[0].superset).toBe(true);
    expect(blocs[0].series.map((x) => x.etiquette))
      .toEqual(['A', 'B', 'A1', 'B1', 'A2', 'B2']);
    expect(blocs[0].nbTours).toBe(2);
  });

  // §4 — ET LE COMPTEUR DE TOURS NE BOUGE PAS SUR LES CHAUFFES PROGRAMMÉES.
  // C'est le défaut que le chantier 29 a corrigé, et la seule chose qui a
  // changé ici est que les chauffes existent AVANT la séance. Valider les deux
  // chauffes ne doit rien avancer ; valider A1 et B1 avance d'un tour.
  test('valider les deux chauffes n’avance aucun tour', () => {
    let s = creer(SUPERSET());
    // La clé est le groupe TEL QUE LA SÉANCE le porte : `normaliserGroupes`
    // renumérote à la création, et supposer `0` testerait la numérotation
    // plutôt que le compteur de tours.
    const groupe = () => Modele.blocsDeSeance(s, CAT)[0].groupe;
    const faits = () => Modele.toursFaitsParGroupe(Modele.blocsDeSeance(s, CAT));
    s = Seance.valider(s, 0, 0, '2026-09-16T10:05:00.000Z');
    s = Seance.valider(s, 1, 0, '2026-09-16T10:06:00.000Z');
    expect(faits()[groupe()] || 0).toBe(0);
    s = Seance.valider(s, 0, 1, '2026-09-16T10:10:00.000Z');
    s = Seance.valider(s, 1, 1, '2026-09-16T10:11:00.000Z');
    expect(faits()[groupe()]).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 17 — LA CARTE DE LA BIBLIOTHÈQUE (§7 quindecies.5)
// ════════════════════════════════════════════════════════════════════════════
describe('⚠️ la carte dit le volume de travail, et les chauffes à part', () => {
  const carte = (routines) => {
    const cible = document.createElement('div');
    Rendu().rendreListeRoutines(cible, routines, {
      catalogue: CAT, surChoix: () => {}, surDemarrer: () => {}
    });
    return cible.querySelector('.routine-meta').textContent;
  };

  // ⚠️ 2, PAS 6 ET PAS 3. La rampe porte six lignes : trois chauffes, DEUX
  // séries de travail, et une dégressive. `compteSeriesTravail` ne compte que
  // le travail — une dégressive prolonge une série, elle n'en ouvre pas une
  // nouvelle (c'est déjà la règle du badge, `nbTravail`). La carte dit donc le
  // volume, pas le nombre de lignes.
  test('« N exercices · N séries + N de chauffe »', () => {
    expect(carte([{ id: 'r1', nom: 'Push', exercices: [RAMPE()] }]))
      .toBe('1 exercice · 2 séries + 3 de chauffe');
  });

  // ⚠️ « + », PAS « DONT » : le nombre annoncé est celui des séries de TRAVAIL,
  // et les chauffes n'y sont pas. « 6 séries dont 3 de chauffe » serait faux.
  test('sans chauffe, la mention disparaît — on ne dit pas « + 0 »', () => {
    const sansChauffe = Object.assign(RAMPE(), {
      series: [L({ type_serie: 'travail', reps: 5 }), L({ type_serie: 'travail', reps: 5 })]
    });
    expect(carte([{ id: 'r1', nom: 'Push', exercices: [sansChauffe] }]))
      .toBe('1 exercice · 2 séries');
  });

  // ⚠️ ET C'EST LE COMPTE DU VOLUME, PAS UN SECOND COMPTEUR.
  // `THSemaine.compteSeriesTravail` porte la règle du volume : un exercice sans
  // muscle primaire ne compte pas. En écrire un second pour les routines aurait
  // été la maladie du §2 undecies.
  test('le compte est celui de `compteSeriesTravail`, règle du volume comprise', () => {
    const tapis = { id: 'e-t', exercise_slug: 'tapis', rang: 1, repos_cible_s: null,
      note: null, groupe_superset: null,
      series: [L({ type_serie: 'travail', duree_s: 600 })] };
    const cat = CAT.concat([{ slug: 'tapis', nom: 'Tapis', mesure: 'distance_temps',
                              muscles_primaires: [] }]);
    const plat = [{ type_serie: 'travail', exercise_slug: 'tapis' }];
    expect(window.THSemaine.compteSeriesTravail(plat, cat)).toBe(0);
    expect(Routines.apercu([RAMPE(), tapis], cat))
      .toEqual({ nbExercices: 2, nbSeries: 2, nbChauffes: 3 });
  });
});
