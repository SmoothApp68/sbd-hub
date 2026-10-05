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
  { slug: 'pompes', nom: 'Pompes', mesure: 'reps', muscles_primaires: ['pectoraux'] },
  // La planche mesure un TEMPS : c'est elle qui garde le pavé de décalage,
  // éditeur compris (§7 sexdecies.1 — chacun là où il a du sens).
  { slug: 'planche', nom: 'Planche', mesure: 'temps', muscles_primaires: ['abdominaux'] }
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

// La MÊME structure, sans aucune charge programmée — le cas courant : la
// routine dit la structure, et la charge se lit en gris depuis la dernière
// séance (§7 septendecies.2). Avec des charges programmées, le champ est plein
// et le gris ne s'affiche pas : « pas de gris » et « gris masqué par une
// valeur » se confondraient.
const RAMPE_NUE = () => Object.assign(RAMPE(), {
  series: RAMPE().series.map((x) => Object.assign({}, x, { charge_kg: null }))
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

// ⚠️ `precedent` EST DANS LES DEUX VUES depuis le chantier 44 : l'éditeur
// affiche en gris la charge réellement soulevée (§7 septendecies.2), lue par la
// MÊME fonction qu'en séance. Le défaut ici est « aucune séance passée ».
function rendre(exercices, vue) {
  const brouillon = { exercices: exercices };
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, null, Object.assign({
    programme: true,
    blocs: Modele.blocsDeSeance(brouillon, CAT),
    exercice: (slug) => CAT.filter((e) => e.slug === slug)[0],
    precedent: () => null
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

  // 9. ⚠️ LE GRIS DE L'ÉDITEUR EST LA CHARGE RÉELLEMENT SOULEVÉE
  // (§7 septendecies.2). Le chantier 43 n'affichait rien ; arbitré le 15/09 :
  // ce n'est pas une valeur à arbitrer, c'est du contexte.
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE — UNE SÉANCE PASSÉE AVEC DES CHAUFFES.
  // Le même piège qu'au chantier 38, pour la troisième fois : sur une séance
  // passée sans chauffe, « aligner par type et par rang » et « aligner par
  // indice brut » donnent exactement la même colonne. Ici la séance d'avant
  // porte 2 chauffes puis 2 séries de travail, et la routine 3 chauffes puis
  // 2 travail : les indices bruts et les rangs par type ne coïncident nulle
  // part au-delà de la première ligne.
  test('le gris de l’éditeur est la charge réelle, alignée par TYPE et par RANG', () => {
    const passee = { seance: { id: 'v' }, series: [
      { type_serie: 'echauffement', charge_kg: 20, reps: 15, duree_s: null, distance_m: null },
      { type_serie: 'echauffement', charge_kg: 60, reps: 10, duree_s: null, distance_m: null },
      { type_serie: 'travail', charge_kg: 122.5, reps: 5, duree_s: null, distance_m: null },
      { type_serie: 'travail', charge_kg: 122.5, reps: 5, duree_s: null, distance_m: null }
    ] };
    const c = rendre([RAMPE_NUE()], { precedent: () => passee });
    const gris = [...c.querySelectorAll('.ch-serie input')]
      .map((i) => i.getAttribute('placeholder'));
    // Chauffes 1 et 2 → 20 et 60. La 3ᵉ chauffe n'a pas de correspondante :
    // rien, surtout pas la 1ʳᵉ série de travail. Travail 1 et 2 → 122,5. La
    // dégressive n'en a pas non plus.
    expect(gris).toEqual(['20', '60', null, '122,5', '122,5', null]);
    // ⚠️ L'ALIGNEMENT PAR INDICE BRUT DIRAIT CECI — et il est faux partout
    // sauf sur la première ligne. C'est ce que le test doit exclure.
    expect(gris).not.toEqual(['20', '60', '122,5', '122,5', null, null]);
  });

  // 9 bis. ⚠️ ET LES REPS N'ONT PAS DE GRIS : elles SONT la prescription. Un
  // gris dessous rendrait « champ vide » et « 8 reps programmées »
  // indiscernables — c'est la raison qui tenait le chantier 43, et elle vaut
  // toujours pour cette colonne-là.
  test('la charge seulement : les reps restent vides, elles sont la prescription', () => {
    const passee = { seance: { id: 'v' }, series: [
      { type_serie: 'echauffement', charge_kg: 20, reps: 15, duree_s: null, distance_m: null }
    ] };
    const c = rendre([RAMPE_NUE()], { precedent: () => passee });
    expect(c.querySelector('.ch-serie input').getAttribute('placeholder')).toBe('20');
    expect([...c.querySelectorAll('.rp-serie input')]
      .map((i) => i.getAttribute('placeholder'))).toEqual([null, null, null, null, null, null]);
  });

  // 9 ter. Un exercice JAMAIS FAIT : le gris est absent, pas à zéro.
  test('exercice jamais fait → aucun gris, surtout pas un zéro', () => {
    const c = rendre([RAMPE_NUE()], { precedent: () => null });
    [...c.querySelectorAll('.ch-serie input')].forEach((i) => {
      expect(i.value).toBe('');
      expect(i.getAttribute('placeholder')).toBeNull();
    });
    expect(c.querySelectorAll('.ch-serie.fantome').length).toBe(0);
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
// LE REPOS — LA MOLETTE, ET ELLE EST LA MÊME AUX DEUX ÉCRANS (§7 sexdecies)
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ LE PAVÉ DE DÉCALAGE EST PARTI D'ICI (chantier 44), et ce n'est pas une
// régression du chantier 42 : c'est la duplication qu'il avait laissée. Il y
// avait DEUX systèmes pour la même question — un pavé dans l'éditeur, une
// grille de huit valeurs en séance. La molette les remplace tous les deux.
// Le pavé, lui, reste sur les LIGNES de durée (planche, rando), où la valeur
// est arbitraire : c'est le §11 de non-régression.
describe('⚠️ la molette de repos, un seul composant pour les deux écrans', () => {
  const feuille = (repos, vue) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleRepos(cible, Object.assign({
      exercice: 'Développé Couché (Barre)', repos: repos,
      surValider: () => {}, surAnnuler: () => {}, surDesactiver: () => {}
    }, vue || {}));
    return cible;
  };
  const opts = (c) => [...c.querySelectorAll('.molette .opt')];
  const piste = (c) => c.querySelector('.molette .piste');
  const bouton = (c, motif) => [...c.querySelectorAll('.feuille-pied button')]
    .filter((b) => new RegExp(motif).test(b.textContent))[0];
  // Le défilement, tel qu'un pouce le produit : `scroll-snap` arrête toujours
  // la piste sur un multiple de la hauteur d'une entrée.
  const defiler = (c, rang) => {
    const p = piste(c);
    p.scrollTop = rang * 48;
    p.dispatchEvent(new window.Event('scroll'));
  };

  // 1. Les 36 valeurs, dans l'ordre, avec les DEUX pas.
  test('36 valeurs : de 5 en 5 jusqu’à 2:00, puis de 15 en 15 jusqu’à 5:00', () => {
    expect(Rendu().VALEURS_REPOS.length).toBe(36);
    // Les 24 premières : 5, 10, … 120.
    expect(Rendu().VALEURS_REPOS.slice(0, 24))
      .toEqual(Array.from({ length: 24 }, (_, i) => (i + 1) * 5));
    // Les 12 suivantes : 135, 150, … 300.
    expect(Rendu().VALEURS_REPOS.slice(24))
      .toEqual(Array.from({ length: 12 }, (_, i) => 135 + i * 15));
    // ⚠️ L'ORDRE EST STRICTEMENT CROISSANT, ET LE PAS CHANGE UNE SEULE FOIS.
    // Sans cette assertion, une liste mélangée ou à trois pas passerait : les
    // deux tranches ci-dessus ne disent rien de leur jonction.
    const pas = Rendu().VALEURS_REPOS.slice(1)
      .map((v, i) => v - Rendu().VALEURS_REPOS[i]);
    expect(new Set(pas)).toEqual(new Set([5, 15]));
    expect(pas.indexOf(15)).toBe(23);
    expect(pas.lastIndexOf(5)).toBe(22);
  });

  test('et elles s’écrivent en secondes sous la minute, en horloge au-dessus', () => {
    const libelles = opts(feuille(null)).map((o) => o.textContent);
    expect(libelles[0]).toBe('5 s');
    expect(libelles[10]).toBe('55 s');
    expect(libelles[11]).toBe('1:00');
    expect(libelles[35]).toBe('5:00');
    expect(libelles.length).toBe(36);
  });

  // 2. Valider pose la valeur CENTRÉE — celle qu'on lit dans la fenêtre.
  test('Valider pose la valeur centrée, pas celle d’avant', () => {
    const vus = [];
    const c = feuille(90, { surValider: (v) => vus.push(v) });
    // Centrée à l'ouverture : 1:30, la valeur stockée.
    expect(opts(c).filter((o) => o.classList.contains('sel'))[0].textContent).toBe('1:30');
    defiler(c, 35);
    expect(opts(c).filter((o) => o.classList.contains('sel'))[0].textContent).toBe('5:00');
    bouton(c, 'Valider').click();
    expect(vus).toEqual([300]);
  });

  // ⚠️ TROUVÉ PAR LA MUTATION M11, et c'est le genre de défaut qu'une assertion
  // de CLASSE ne voit pas. `marquer(rang)` pose bien `.sel` sur la bonne
  // entrée ; si la PISTE, elle, reste en haut, la molette montre le premier
  // rang sous sa fenêtre pendant que la surbrillance est trente rangs plus
  // bas — et « Valider » écrit une valeur qui n'était sous aucune fenêtre.
  //
  // La position se lit donc pour elle-même, en rangs : c'est la seule chose
  // qui relie la surbrillance à ce qu'on voit.
  test('la PISTE est réellement positionnée sur la valeur, pas seulement marquée', () => {
    expect(piste(feuille(90)).scrollTop).toBe(Rendu().VALEURS_REPOS.indexOf(90) * 48);
    expect(piste(feuille(5)).scrollTop).toBe(0);
    expect(piste(feuille(300)).scrollTop).toBe(35 * 48);
    // Et la surbrillance est au MÊME rang que la position — sans quoi les deux
    // pourraient se contredire sans qu'aucune des deux assertions ne bouge.
    const c = feuille(300);
    expect(opts(c).findIndex((o) => o.classList.contains('sel')))
      .toBe(piste(c).scrollTop / 48);
  });

  test('la valeur stockée se centre à l’ouverture, et une valeur hors liste s’en approche', () => {
    const centre = (r) => opts(feuille(r)).filter((o) => o.classList.contains('sel'))[0].textContent;
    expect(centre(210)).toBe('3:30');
    expect(centre(5)).toBe('5 s');
    expect(centre(300)).toBe('5:00');
    // ⚠️ 3:20 SE CENTRE SUR 3:15, ET « VALIDER » ÉCRIRAIT 3:15. C'est la leçon
    // de la mutation M7 (chantier 41) sur un autre écran : la valeur AFFICHÉE
    // est celle qui sera écrite. Une valeur tapée au pavé avant le chantier 44
    // — ou hors bornes — ne se garde donc pas en douce.
    expect(centre(200)).toBe('3:15');
    expect(centre(1801)).toBe('5:00');
    // Sans repos programmé, on se pose sur 1:30 — visiblement, et rien n'est
    // écrit tant qu'on n'a pas tapé Valider.
    expect(centre(null)).toBe('1:30');
    expect(centre(undefined)).toBe('1:30');
  });

  // ⚠️ TROUVÉS PAR LA CAMPAGNE DE MUTATIONS (M3, M4, M5, M6), pas par une
  // relecture. Les quatre portaient sur l'arithmétique de la molette, et les
  // quatre survivaient parce que les tests ne la sollicitaient qu'aux endroits
  // les plus confortables : des positions exactes, dans les bornes, et des
  // valeurs stockées qui tombaient toujours du même côté.

  // M3 — un pouce ne s'arrête pas sur un multiple exact. Entre deux rangs,
  // c'est le PLUS PROCHE qui se centre (`Math.round`), pas celui du dessus
  // (`Math.floor`) : autrement la fenêtre montrerait une valeur et « Valider »
  // en écrirait une autre.
  test('entre deux rangs, c’est le plus PROCHE qui se centre', () => {
    const vus = [];
    const c = feuille(null, { surValider: (v) => vus.push(v) });
    const p = piste(c);
    // 4,6 rangs : on est plus près du rang 5 (30 s) que du rang 4 (25 s).
    p.scrollTop = 4.6 * 48;
    p.dispatchEvent(new window.Event('scroll'));
    expect(opts(c).filter((o) => o.classList.contains('sel'))[0].textContent).toBe('30 s');
    bouton(c, 'Valider').click();
    // 4,4 rangs : on redescend sur le rang 4. ⚠️ C'est CETTE paire qui
    // discrimine : avec `Math.floor`, les deux positions donneraient 25 s.
    p.scrollTop = 4.4 * 48;
    p.dispatchEvent(new window.Event('scroll'));
    expect(opts(c).filter((o) => o.classList.contains('sel'))[0].textContent).toBe('25 s');
    bouton(c, 'Valider').click();
    expect(vus).toEqual([30, 25]);
  });

  // M4 — le rebond de défilement va AU-DELÀ des bornes, et c'est le cas
  // courant sur Android : un `scrollTop` négatif ou supérieur au maximum
  // donnerait `VALEURS_REPOS[-1]`, c'est-à-dire `undefined`, et « Valider »
  // écrirait `undefined` en base.
  test('le rebond de défilement ne sort jamais de la liste', () => {
    const vus = [];
    const c = feuille(null, { surValider: (v) => vus.push(v) });
    const p = piste(c);
    p.scrollTop = -400;
    p.dispatchEvent(new window.Event('scroll'));
    expect(opts(c).filter((o) => o.classList.contains('sel'))[0].textContent).toBe('5 s');
    bouton(c, 'Valider').click();
    p.scrollTop = 99999;
    p.dispatchEvent(new window.Event('scroll'));
    expect(opts(c).filter((o) => o.classList.contains('sel'))[0].textContent).toBe('5:00');
    bouton(c, 'Valider').click();
    expect(vus).toEqual([5, 300]);
    vus.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });

  // M5 — « la plus proche » va DANS LES DEUX SENS. 3:20 descend sur 3:15, mais
  // 3:25 monte sur 3:30 : avec une seule des deux directions, la règle passe
  // pour bonne sur la moitié des valeurs.
  test('la valeur la plus proche, au-dessus comme en dessous', () => {
    const centre = (r) => opts(feuille(r)).filter((o) => o.classList.contains('sel'))[0].textContent;
    expect(centre(200)).toBe('3:15');   // 195 est à 5, 210 à 10 → on descend
    expect(centre(205)).toBe('3:30');   // 195 est à 10, 210 à 5 → on monte
    expect(centre(58)).toBe('1:00');    // 55 est à 3, 60 à 2 → on monte
  });

  // M6 — un zéro n'est pas une absence. La base le refuse
  // (`routine_exos_repos_borne` commence à 5 s), donc il ne peut venir que
  // d'un défaut ; on le traite comme n'importe quelle valeur hors liste — la
  // plus proche — plutôt que d'en faire un second cas d'absence. Une seule
  // règle : seule l'ABSENCE retombe sur 1:30.
  test('un zéro se centre sur la valeur la plus proche, pas sur le défaut', () => {
    const centre = (r) => opts(feuille(r)).filter((o) => o.classList.contains('sel'))[0].textContent;
    expect(centre(0)).toBe('5 s');
    expect(centre(1)).toBe('5 s');
    // Et c'est bien un cas DIFFÉRENT de l'absence, qui se pose à 1:30.
    expect(centre(null)).toBe('1:30');
  });

  // 3. Annuler ne change rien.
  test('Annuler ne pose AUCUNE valeur, même après avoir fait défiler', () => {
    const vus = [];
    const c = feuille(90, {
      surValider: (v) => vus.push('valider:' + v),
      surAnnuler: () => vus.push('annuler'),
      surDesactiver: () => vus.push('desactiver')
    });
    defiler(c, 0);
    bouton(c, 'Annuler').click();
    expect(vus).toEqual(['annuler']);
  });

  // 4. Désactiver → NULL, jamais zéro.
  test('Désactiver est un geste à part — NULL, jamais zéro', () => {
    const vus = [];
    const c = feuille(90, {
      surValider: (v) => vus.push('valider:' + v),
      surDesactiver: () => vus.push('desactiver')
    });
    bouton(c, 'Désactiver').click();
    expect(vus).toEqual(['desactiver']);
    // ⚠️ ZÉRO N'EST PAS DANS LA LISTE, et ne peut donc pas être validé par
    // accident : `routine_exos_repos_borne` commence à 5 s, et « 0:00 de
    // repos » serait une prescription (« enchaîne sans souffler »), pas une
    // absence. Les deux ne sont pas la même chose.
    expect(Rendu().VALEURS_REPOS).not.toContain(0);
    expect(Routines.reposEcrit(0)).toBeNull();
  });

  // 4 (suite). Et un repos désactivé n'arme aucun chronomètre.
  test('un repos désactivé vaut NULL en séance, et n’arme aucune cible', () => {
    let s = Seance.creer({
      id: 'sess', userId: 'u1', debut: '2026-09-16T10:00:00.000Z',
      routine: { id: 'r1', nom: 'Push', exercices: [RAMPE()] }, idSerie: () => 'x'
    });
    expect(s.exercices[0].repos_cible_s).toBe(210);
    s = Seance.definirReposCible(s, 0, null);
    expect(s.exercices[0].repos_cible_s).toBeNull();
    // ⚠️ ZÉRO EST REFUSÉ EN SILENCE par `definirReposCible` — il sort des
    // bornes, donc la séance ne bouge pas. C'est exactement pourquoi
    // « Désactiver » doit envoyer `null` : un zéro laisserait le repos d'avant
    // en place sans que personne ne le voie.
    const avecZero = Seance.definirReposCible(s, 0, 0);
    expect(avecZero.exercices[0].repos_cible_s).toBeNull();
    const remis = Seance.definirReposCible(s, 0, 120);
    expect(remis.exercices[0].repos_cible_s).toBe(120);
    expect(Seance.definirReposCible(remis, 0, 0).exercices[0].repos_cible_s).toBe(120);
  });

  // 5. Le MÊME composant aux deux écrans — un seul code.
  test('c’est un seul composant : l’éditeur et la séance appellent la même fonction', () => {
    // Il n'en reste qu'un. Les deux surfaces d'avant ont disparu.
    expect(typeof Rendu().rendreFeuilleRepos).toBe('function');
    expect(Rendu().rendreFeuilleReposRoutine).toBeUndefined();
    expect(Rendu().rendreFeuilleParametresExo).toBeUndefined();
    // ⚠️ ET LE MÊME RENDU DES DEUX CÔTÉS. Ce qui diffère est la PHRASE : en
    // séance, le réglage ne touche pas la routine, et il faut le dire. Sans la
    // seconde assertion, « une seule fonction » et « deux rendus qui se
    // ressemblent » ne se distingueraient pas.
    const sansAide = feuille(90);
    const avecAide = feuille(90, { aide: 'Pour cette séance.' });
    expect(opts(sansAide).map((o) => o.textContent))
      .toEqual(opts(avecAide).map((o) => o.textContent));
    expect(sansAide.querySelectorAll('.feuille-aide').length).toBe(0);
    expect(avecAide.querySelector('.feuille-aide').textContent).toBe('Pour cette séance.');
  });

  // 6. La molette vit DANS UNE FEUILLE — rien ne défile derrière.
  test('la molette est dans la feuille, et elle seule défile', () => {
    const c = feuille(90);
    // Un seul conteneur défilant, et c'est la piste.
    expect(c.querySelectorAll('.molette .piste').length).toBe(1);
    // La fenêtre de sélection est un REPÈRE : elle ne prend aucun tap, sinon
    // elle volerait le geste à la piste qui est dessous.
    expect(c.querySelector('.molette .selection')).toBeTruthy();
    // Et la molette n'est pas rendue dans la liste : `rendreBlocsSeance` n'en
    // produit aucune. C'est ce qui la rend sûre (§7 terdecies bis).
    expect(rendre([RAMPE()]).querySelectorAll('.molette').length).toBe(0);
    expect(rendreEnSeance([RAMPE()]).querySelectorAll('.molette').length).toBe(0);
  });

  // 11. Non-régression : le pavé de décalage reste là où il a du sens.
  test('le pavé de décalage reste sur les lignes de DURÉE, éditeur compris', () => {
    const planche = { id: 'e-pl', exercise_slug: 'planche', rang: 0,
      repos_cible_s: null, note: null, groupe_superset: null,
      series: [L({ duree_s: 45 })] };
    const c = rendre([planche]);
    const pad = c.querySelector('.ch-serie.chrono input');
    expect(pad).toBeTruthy();
    expect(pad.type).toBe('text');
    expect(pad.inputMode).toBe('numeric');
    expect(pad.value).toBe('00:45');
    // Et la même ligne en séance porte le même pavé.
    expect(rendreEnSeance([planche]).querySelector('.ch-serie.chrono input').value)
      .toBe('00:45');
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

  // ⚠️ TROUVÉ PAR LA CAMPAGNE DE MUTATIONS (M6), pas par une relecture.
  //
  // Supprimer la dernière ligne d'un exercice est un geste possible : la liste
  // se vide, et `routine_sets` n'impose AUCUN minimum de lignes — la base
  // l'accepterait sans broncher. C'est l'app qui doit refuser, sinon la routine
  // démarre une séance où cet exercice n'a rien à faire, et l'utilisateur ne
  // s'en aperçoit que la barre en main.
  //
  // L'ancien modèle l'interdisait par construction (`series` bornée à 1) ; en
  // perdant la borne, on a failli perdre la règle avec elle. Les trois
  // assertions se tiennent : sans la deuxième, « refuse le vide » et « refuse
  // tout » se ressemblent ; sans la troisième, l'écran n'aurait rien à dire.
  test('un exercice SANS AUCUNE ligne est refusé à l’enregistrement', () => {
    const vide = { nom: 'Push', exercices: [{ exercise_slug: 'dc', series: [] }] };
    const v = Routines.valider(vide, []);
    expect(v.valide).toBe(false);
    expect(v.soucis).toContainEqual({ champ: 'series', rang: 0, raison: 'aucune-serie' });
    // Une seule ligne suffit : on refuse le vide, pas la maigreur.
    expect(Routines.valider(
      { nom: 'Push', exercices: [{ exercise_slug: 'dc', series: [L({})] }] }, []).valide)
      .toBe(true);
    // ⚠️ ET UNE FORME ANCIENNE N'EST PAS UN VIDE : `series: 3` posé en file avant
    // le chantier 43 n'est pas une liste qu'on connaît, c'est une liste qu'on ne
    // lit pas. `seriesEcrites` n'y touche pas ; `valider` ne la juge pas non plus.
    expect(Routines.valider(
      { nom: 'Push', exercices: [{ exercise_slug: 'dc', series: 3 }] }, []).valide)
      .toBe(true);
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

  // ══ LA CASCADE DU FANTÔME, À TROIS NIVEAUX (§7 septendecies.3) ══════════
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE : un exercice JAMAIS FAIT, et une
  // `charge_cible_kg` renseignée. Sur un exercice avec historique, le rang 2
  // gagne toujours — « la cascade a trois niveaux » et « elle en a deux »
  // rendent alors exactement le même écran, et le rang 3 ne se voit jamais.
  //
  // C'est la question laissée ouverte au chantier 43, tranchée : la charge
  // programmée descend, mais EN DERNIER. Elle ne concurrence ni la saisie en
  // cours, ni la dernière séance.
  test('rang 3 — sur un exercice jamais fait, la charge cible remonte', () => {
    const programmee = Object.assign(RAMPE(), {
      series: [L({ type_serie: 'travail', reps: 5, charge_kg: 60 })]
    });
    const s = creer([programmee]);
    // La ligne de séance PORTE la cible, mais sa case est vide : c'est une
    // proposition, pas une saisie.
    expect(s.exercices[0].series[0].charge_cible_kg).toBe(60);
    expect(s.exercices[0].series[0].charge_kg).toBeNull();
    expect(Seance.fantome(s, 0, 0, null).charge_kg).toBe(60);
  });

  test('rang 2 GAGNE sur le rang 3 — la dernière séance prime sur la cible', () => {
    const programmee = Object.assign(RAMPE(), {
      series: [L({ type_serie: 'travail', reps: 5, charge_kg: 60 })]
    });
    const s = creer([programmee]);
    const passee = { seance: { id: 'v' }, series: [
      { type_serie: 'travail', charge_kg: 125, reps: 5, duree_s: null, distance_m: null }
    ] };
    expect(Seance.fantome(s, 0, 0, passee).charge_kg).toBe(125);
  });

  test('rang 1 GAGNE sur les deux — ce qu’on vient de taper prime sur tout', () => {
    const programmee = Object.assign(RAMPE(), {
      series: [L({ type_serie: 'travail', reps: 5, charge_kg: 60 }),
               L({ type_serie: 'travail', reps: 5, charge_kg: 60 })]
    });
    let s = creer([programmee]);
    const passee = { seance: { id: 'v' }, series: [
      { type_serie: 'travail', charge_kg: 125, reps: 5, duree_s: null, distance_m: null },
      { type_serie: 'travail', charge_kg: 125, reps: 5, duree_s: null, distance_m: null }
    ] };
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 130 });
    expect(Seance.fantome(s, 0, 1, passee).charge_kg).toBe(130);
  });

  // ⚠️ ET ELLE NE PART JAMAIS EN BASE. `charge_cible_kg` vit sur la ligne de
  // séance pour être LUE par le fantôme ; `sets` n'a pas cette colonne, et
  // `COLONNES_SET` ne la laisse pas passer. Une intention n'est pas une
  // observation.
  test('la charge cible est lue, jamais écrite dans `sets`', () => {
    const programmee = Object.assign(RAMPE(), {
      series: [L({ type_serie: 'travail', reps: 5, charge_kg: 60 })]
    });
    // Une ligne ne part en base qu'une fois VALIDÉE (`partEnBase`) : on la
    // remplit et on la coche, comme le ferait la séance.
    let s = creer([programmee]);
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 62.5, reps: 5 });
    s = Seance.valider(s, 0, 0, '2026-09-16T10:30:00.000Z');
    const lignes = Seance.lignes(s);
    expect(lignes.length).toBe(1);
    expect(lignes[0].charge_kg).toBe(62.5);
    expect(lignes[0].charge_cible_kg).toBeUndefined();
    expect(Object.keys(lignes[0])).not.toContain('charge_cible_kg');
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
describe('⚠️ la carte dit le volume de travail, et rien d’autre', () => {
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
  test('« N exercices · N séries »', () => {
    expect(carte([{ id: 'r1', nom: 'Push', exercices: [RAMPE()] }]))
      .toBe('1 exercice · 2 séries');
  });

  // ⚠️ LA MENTION DES CHAUFFES EST PARTIE (§7 septendecies.1, chantier 44).
  // Le chantier 43 écrivait « + 3 de chauffe » pour lever une ambiguïté de
  // compte, et l'ambiguïté était réelle — mais le détail est inutile dans un
  // résumé : il se voit en ouvrant la routine. Les deux assertions se tiennent :
  // sans la seconde, « la rampe n'affiche rien » et « aucune routine n'affiche
  // rien » se ressembleraient, alors que la rampe PORTE trois chauffes.
  test('même avec trois chauffes, la carte n’en dit pas un mot', () => {
    const sansChauffe = Object.assign(RAMPE(), {
      series: [L({ type_serie: 'travail', reps: 5 }), L({ type_serie: 'travail', reps: 5 })]
    });
    expect(carte([{ id: 'r1', nom: 'Push', exercices: [sansChauffe] }]))
      .toBe(carte([{ id: 'r2', nom: 'Pull', exercices: [RAMPE()] }]));
    expect(RAMPE().series.filter((x) => x.type_serie === 'echauffement').length).toBe(3);
    expect(carte([{ id: 'r1', nom: 'Push', exercices: [RAMPE()] }])).not.toMatch(/chauffe/i);
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
      .toEqual({ nbExercices: 2, nbSeries: 2 });
  });

  // §9.18 (51-1) — LA DURÉE ESTIMÉE ET « J'AI PEU DE TEMPS ». La carte lit
  // `vue.temps(routine)` (l'app la calcule, une seule fois), jamais un calcul
  // ici ; le geste n'apparaît que si l'app le propose.
  const rangee = (temps) => {
    const cible = document.createElement('div');
    const appels = [];
    Rendu().rendreListeRoutines(cible, [{ id: 'r1', nom: 'Push', exercices: [RAMPE()] }], {
      catalogue: CAT, surChoix: () => {}, surDemarrer: () => {},
      temps: () => temps, surPeuDeTemps: (id) => appels.push(id)
    });
    return { cible, appels };
  };
  test('la durée estimée sous le volume, et « J’ai peu de temps » sous « Démarrer »', () => {
    const { cible, appels } = rangee({ texte: 'Environ 75 min (estimation)', peuDeTemps: true });
    expect(cible.querySelector('.routine-duree').textContent).toBe('Environ 75 min (estimation)');
    const b = cible.querySelector('.routine-actions .peu-de-temps');
    expect(b.textContent).toBe('J’ai peu de temps');
    expect(cible.querySelector('.routine-actions .demarrer').textContent).toBe('Démarrer');
    b.click();
    expect(appels).toEqual(['r1']);
  });
  test('sans geste proposé (semaine allégée, routine courte) : la durée seule, aucun bouton', () => {
    const { cible } = rangee({ texte: 'Semaine allégée : environ 50 min (estimation)', peuDeTemps: false });
    expect(cible.querySelector('.routine-duree').textContent).toBe('Semaine allégée : environ 50 min (estimation)');
    expect(cible.querySelector('.peu-de-temps')).toBe(null);
  });
});
