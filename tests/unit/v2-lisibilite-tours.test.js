//
// v2 — lisibilité des tours : le badge de chauffe, l'espace, le compteur
// (chantier 30).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
//   UN SUPERSET AVEC DES CHAUFFES.
//
// Sans chauffe, « le compteur compte les tours de travail » et « il compte tous
// les tours » sont indistinguables : il n'y a que des tours de travail. C'est
// exactement ce qui a laissé passer le défaut — les tests du chantier 29
// vérifiaient le compteur sur un bloc sans chauffe.
//
// Le rendu tourne sous jsdom : `rendu.js` n'exporte rien en CommonJS (il pose
// `window.THRendu`), et c'est cette surface-là qu'on lit.

require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');

const Rendu = () => window.THRendu;

let graine = 0;
const uuid = () => 'set-' + (++graine);

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé Couché', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'ec', nom: 'Écarté', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'cu', nom: 'Curl', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'pl', nom: 'Planche', mesure: 'temps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] }
];

// `[slug, nbSéries, groupe]`
function seanceDe(lignes) {
  return Seance.creer({
    id: 'ss', userId: 'u',
    routine: { id: 'r', nom: 'T', exercices: lignes.map(([slug, n, g], i) => ({
      id: 're' + i, exercise_slug: slug, rang: i, series: n,
      reps_visees: null, repos_cible_s: null, groupe_superset: g, note: null })) },
    idSerie: uuid
  });
}

// Valide ET repose les tours depuis l'état APRÈS validation — c'est ce que fait
// `validerSerie` dans l'app.
function val(s, i, j) {
  const apres = Seance.valider(s, i, j, new Date());
  return Seance.avancerTours(apres,
    Modele.toursFaitsParGroupe(Modele.blocsDeSeance(apres, CATALOGUE)));
}

function rendre(seance) {
  const cible = document.createElement('div');
  const blocs = Modele.blocsDeSeance(seance, CATALOGUE);
  const index = Modele.indexerExercices(CATALOGUE);
  Rendu().rendreBlocsSeance(cible, seance, {
    blocs: blocs,
    tourAtteint: (g) => Seance.tourAtteint(seance, g),
    exercice: (slug) => index[slug],
    precedent: () => null,
    fantome: () => ({}),
    surChamp: () => {}, surValider: () => {}, surNumero: () => {},
    surEffort: () => {}, surNote: () => {}, surRepos: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {},
    surGrouper: () => {}, surDeplacerBloc: () => {},
    surMenuBloc: () => {}, surMenuExercice: () => {}
  });
  return cible;
}

const badges = (c, i) => Array.from(c.querySelectorAll('.bloc-seance')[i]
  .querySelectorAll('.no-serie')).map((n) => n.textContent);
const classesBadges = (c, i) => Array.from(c.querySelectorAll('.bloc-seance')[i]
  .querySelectorAll('.no-serie')).map((n) => n.classList.contains('c'));
const debuts = (c, i) => Array.from(c.querySelectorAll('.bloc-seance')[i]
  .querySelectorAll('.ligne-serie')).map((l) => l.classList.contains('debut-tour'));
const compteur = (c) => (c.querySelector('.superset-t') || {}).textContent;

// ══ 1. LE BADGE DE CHAUFFE (§7 undecies.1) ═════════════════════════════════

describe('le badge de chauffe se lit sans être déchiffré', () => {
  test('dans un superset, il porte la LETTRE de son exercice — pas « Ac »', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    s = Seance.changerType(s, 1, 0, 'echauffement');
    const c = rendre(s);
    expect(badges(c, 0)).toEqual(['A', 'B', 'A1', 'B1']);
    expect(classesBadges(c, 0)).toEqual([true, true, false, false]);
  });

  test('hors superset, il porte un « W » : aucune lettre à porter', () => {
    let s = seanceDe([['cu', 3, null]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    const c = rendre(s);
    expect(badges(c, 0)).toEqual(['W', '1', '2']);
    expect(classesBadges(c, 0)).toEqual([true, false, false]);
  });

  test('le badge garde la MÊME forme que les autres : c’est la teinte qui distingue', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    const noeuds = Array.from(rendre(s).querySelectorAll('.no-serie'));
    // Tous portent la classe de base, aucun n'en a une qui change sa boîte.
    expect(noeuds.every((n) => n.classList.contains('no-serie'))).toBe(true);
    expect(noeuds.filter((n) => n.classList.contains('c'))).toHaveLength(1);
  });
});

// ══ 2. L'ESPACE ENTRE LES TOURS (§7 undecies.2) ════════════════════════════

describe('les tours se séparent par un espace, sans texte ajouté', () => {
  test('chaque tour ouvre sur une ligne marquée — jamais la première du bloc', () => {
    // A : 2 chauffes + 2 travail · B : 1 chauffe + 2 travail
    // → chauffe 1 (A,B) · chauffe 2 (A) · travail 1 (A,B) · travail 2 (A,B)
    let s = seanceDe([['dc', 4, 1], ['ec', 3, 1]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    s = Seance.changerType(s, 0, 1, 'echauffement');
    s = Seance.changerType(s, 1, 0, 'echauffement');
    const c = rendre(s);
    expect(badges(c, 0)).toEqual(['A', 'B', 'A', 'A1', 'B1', 'A2', 'B2']);
    expect(debuts(c, 0)).toEqual([false, false, true, true, false, true, false]);
  });

  // ⚠️ ON LIT LES RANGÉES, PAS LE BLOC ENTIER : la tête annonce « tour 0/3 »,
  // et c'est le compteur, pas un titre de section. Ce qui est écarté, c'est un
  // LIBELLÉ INTERCALÉ entre les lignes — « Tour 1 », « Échauffement ».
  test('aucun texte n’est intercalé : ni « Tour 1 », ni « Échauffement »', () => {
    let s = seanceDe([['dc', 3, 1], ['ec', 3, 1]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    const bloc = rendre(s).querySelectorAll('.bloc-seance')[0];
    const rangees = bloc.querySelectorAll('.ligne-serie');
    // Une rangée par série, et rien entre elles.
    expect(rangees).toHaveLength(6);
    const texte = Array.from(rangees).map((r) => r.textContent).join(' ');
    expect(/Tour\s*\d/i.test(texte)).toBe(false);
    expect(/Échauffement|Echauffement/i.test(texte)).toBe(false);
  });

  // ⚠️ HORS SUPERSET, RIEN NE CHANGE : les lignes ne s'entrelacent pas, il n'y a
  // rien à séparer. C'est la moitié discriminante du test — une marque posée
  // partout passerait le test précédent et casserait celui-ci.
  test('dans un exercice seul, aucune ligne n’est marquée', () => {
    let s = seanceDe([['cu', 3, null]]);
    s = Seance.changerType(s, 0, 0, 'echauffement');
    expect(debuts(rendre(s), 0)).toEqual([false, false, false]);
  });
});

// ══ 3. LE COMPTEUR (§7 undecies.3) ═════════════════════════════════════════

describe('le compteur affiche les tours FAITS, et ignore les chauffes', () => {
  // La configuration discriminante : un superset AVEC des chauffes.
  const avecChauffes = () => {
    let s = seanceDe([['dc', 4, 1], ['ec', 4, 1]]);   // 1 chauffe + 3 travail chacun
    s = Seance.changerType(s, 0, 0, 'echauffement');
    s = Seance.changerType(s, 1, 0, 'echauffement');
    return s;
  };

  test('avant de commencer : 0/3, pas 1/3', () => {
    expect(compteur(rendre(avecChauffes()))).toBe('Superset · tour 0/3');
  });

  test('valider UNE chauffe ne le fait pas bouger', () => {
    let s = val(avecChauffes(), 0, 0);
    expect(compteur(rendre(s))).toBe('Superset · tour 0/3');
    s = val(s, 1, 0);                       // l'autre chauffe aussi
    expect(compteur(rendre(s))).toBe('Superset · tour 0/3');
  });

  test('un tour de travail complet le fait passer à 1/3', () => {
    let s = avecChauffes();
    s = val(s, 0, 0); s = val(s, 1, 0);     // les chauffes
    s = val(s, 0, 1);                       // A1 seul : pas encore
    expect(compteur(rendre(s))).toBe('Superset · tour 0/3');
    s = val(s, 1, 1);                       // B1 : le tour 1 est bouclé
    expect(compteur(rendre(s))).toBe('Superset · tour 1/3');
  });

  // §2.4 — un tour dont un exercice n'a pas de série à ce rang compte quand même.
  test('un tour INCOMPLET compte dès que ses lignes sont validées', () => {
    let s = seanceDe([['dc', 3, 1], ['ec', 1, 1]]);   // B n'a qu'une série
    s = val(s, 0, 0); s = val(s, 1, 0);
    expect(compteur(rendre(s))).toBe('Superset · tour 1/3');
    s = val(s, 0, 1);                       // le tour 2 n'a que A2 — il suffit
    expect(compteur(rendre(s))).toBe('Superset · tour 2/3');
  });

  test('il est plafonné au nombre de tours et ne recule pas (§2.7)', () => {
    let s = seanceDe([['dc', 2, 1], ['ec', 2, 1]]);
    s = val(s, 0, 0); s = val(s, 1, 0); s = val(s, 0, 1); s = val(s, 1, 1);
    expect(compteur(rendre(s))).toBe('Superset · tour 2/2');
    s = Seance.devalider(s, 0, 0);
    expect(compteur(rendre(s))).toBe('Superset · tour 2/2');
  });

  test('un exercice seul n’annonce aucun tour', () => {
    expect(compteur(rendre(seanceDe([['cu', 3, null]])))).toBe('');
  });

  // ⚠️ LE PLAFOND SERT QUAND LE BLOC RÉTRÉCIT. `tourAtteint` est MONOTONE
  // (§2.7) ; le nombre de tours, lui, peut baisser — on retire une série, ou on
  // la passe en chauffe. Sans plafond, on lirait « tour 3/2 ».
  test('si le bloc rétrécit, le compteur se plafonne au lieu de dépasser', () => {
    let s = seanceDe([['dc', 3, 1], ['ec', 3, 1]]);
    for (let t = 0; t < 3; t++) { s = val(s, 0, t); s = val(s, 1, t); }
    expect(compteur(rendre(s))).toBe('Superset · tour 3/3');
    // La dernière série de chaque branche s'en va : deux tours, pas trois.
    s = Seance.retirerSerie(s, 0, 2);
    s = Seance.retirerSerie(s, 1, 2);
    expect(compteur(rendre(s))).toBe('Superset · tour 2/2');
  });
});

// ══ 3 bis. LE MÊME SIGNE AU DÉTAIL DE SÉANCE ═══════════════════════════════

describe('le détail de séance reconnaît la chauffe au même signe', () => {
  const detail = (lignes) => {
    const cible = document.createElement('div');
    Rendu().rendreDetail(cible, { id: 's', titre: 'T', debut: '2026-09-10T10:00:00Z' },
      Modele.construireBlocs(lignes, CATALOGUE));
    return cible;
  };
  const ligne = (o) => Object.assign({
    id: 'l' + o.rang, session_id: 's', type_serie: 'travail', charge_kg: 50, reps: 5,
    duree_s: null, distance_m: null, rpe: null, ressenti: null, note: null,
    validee_a: '2026-09-10T10:10:00Z', repos_s: null, groupe_superset: null
  }, o);

  test('hors superset, une chauffe porte « W » et non un badge vide', () => {
    const c = detail([
      ligne({ rang: 1, exercise_slug: 'cu', type_serie: 'echauffement' }),
      ligne({ rang: 2, exercise_slug: 'cu' })
    ]);
    const tags = Array.from(c.querySelectorAll('.serie .tag')).map((t) => t.textContent);
    expect(tags).toEqual(['W', '1']);
    expect(c.querySelectorAll('.serie .tag.c')).toHaveLength(1);
  });

  test('en superset, elle porte la lettre — et le tour se sépare comme à la saisie', () => {
    const c = detail([
      ligne({ rang: 1, exercise_slug: 'dc', groupe_superset: 1, type_serie: 'echauffement' }),
      ligne({ rang: 2, exercise_slug: 'dc', groupe_superset: 1 }),
      ligne({ rang: 3, exercise_slug: 'dc', groupe_superset: 1 }),
      ligne({ rang: 4, exercise_slug: 'ec', groupe_superset: 1 }),
      ligne({ rang: 5, exercise_slug: 'ec', groupe_superset: 1 })
    ]);
    const tags = Array.from(c.querySelectorAll('.serie .tag')).map((t) => t.textContent);
    expect(tags).toEqual(['A', 'A1', 'B1', 'A2', 'B2']);
    const marques = Array.from(c.querySelectorAll('.serie'))
      .map((r) => r.classList.contains('debut-tour'));
    expect(marques).toEqual([false, true, false, true, false]);
  });
});

// ══ 3 ter. LA CARTE DE SÉANCE DANS LA LISTE ════════════════════════════════

describe('le « ⋯ » de la carte de séance (§7 octies)', () => {
  const JOUR = { nom: 'Jeu', date: new Date('2026-09-10T10:00:00Z'),
                 seances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const RESUMES = {
    a: { id: 'a', titre: 'Normale', nbExercices: 2, nbSeriesTravail: 6, apercu: { tete: [] } },
    b: { id: 'b', titre: 'Sortie', estSortie: true, duree_s: 3600, apercu: { tete: [] } },
    c: { id: 'c', titre: 'Pas reçue', incomplet: true, apercu: { tete: [] } }
  };
  const rendreJours = (surMenu) => {
    const cible = document.createElement('div');
    Rendu().rendreJours(cible, [JOUR], (s) => RESUMES[s.id], () => {}, surMenu);
    return cible;
  };

  // ⚠️ UNE SORTIE NE SE REFAIT PAS ET NE SE MODIFIE PAS ICI, et une séance dont
  // les séries ne sont pas encore arrivées n'a rien à modifier : le menu n'a
  // aucun geste à leur proposer.
  test('seule une séance complète porte le menu', () => {
    const c = rendreJours(() => {});
    expect(c.querySelectorAll('.seance')).toHaveLength(3);
    expect(c.querySelectorAll('.seance-enveloppe .menu-pts')).toHaveLength(1);
    expect(c.querySelector('.seance-enveloppe .seance').textContent).toContain('Normale');
  });

  test('sans gestionnaire, aucune carte ne change', () => {
    const c = rendreJours(null);
    expect(c.querySelectorAll('.seance')).toHaveLength(3);
    expect(c.querySelectorAll('.menu-pts')).toHaveLength(0);
    expect(c.querySelectorAll('.seance-enveloppe')).toHaveLength(0);
  });

  // La carte EST un bouton : le menu doit vivre À CÔTÉ, sinon le balisage est
  // invalide et le tap ouvre la séance en même temps que le menu.
  test('le « ⋯ » n’est jamais DANS la carte', () => {
    const c = rendreJours(() => {});
    expect(c.querySelectorAll('.seance .menu-pts')).toHaveLength(0);
    expect(c.querySelectorAll('button button')).toHaveLength(0);
  });

  test('il appelle le menu de SA séance, sans ouvrir la séance', () => {
    const vus = [];
    const ouvertes = [];
    const cible = document.createElement('div');
    Rendu().rendreJours(cible, [JOUR], (s) => RESUMES[s.id],
      (id) => ouvertes.push(id), (id) => vus.push(id));
    cible.querySelector('.menu-pts').click();
    expect(vus).toEqual(['a']);
    expect(ouvertes).toEqual([]);
  });
});

// ══ 4. LE MENU DE LA CARTE DE SÉANCE (§7 octies) ═══════════════════════════

describe('le menu de la carte de séance', () => {
  const feuille = () => {
    const cible = document.createElement('div');
    const appels = [];
    Rendu().rendreFeuilleSeance(cible, {
      titre: 'Jambes du jeudi',
      surRefaire: () => appels.push('refaire'),
      surModifier: () => appels.push('modifier'),
      surSupprimer: () => appels.push('supprimer')
    });
    return { cible, appels };
  };

  test('trois gestes, dans l’ordre du détail — et pas « Partager »', () => {
    const { cible } = feuille();
    const libelles = Array.from(cible.querySelectorAll('.feuille-menu button'))
      .map((b) => b.textContent);
    expect(libelles).toEqual(['Refaire cette séance', 'Modifier', 'Supprimer']);
    expect(libelles.some((t) => /Partager/i.test(t))).toBe(false);
  });

  test('« Supprimer » se signale comme le geste qui ne se rattrape pas', () => {
    const { cible } = feuille();
    const sup = Array.from(cible.querySelectorAll('.feuille-menu button'))
      .filter((b) => b.textContent === 'Supprimer')[0];
    expect(sup.classList.contains('danger')).toBe(true);
  });

  test('chaque entrée appelle SON geste, et lui seul', () => {
    const { cible, appels } = feuille();
    Array.from(cible.querySelectorAll('.feuille-menu button')).forEach((b) => b.click());
    expect(appels).toEqual(['refaire', 'modifier', 'supprimer']);
  });
});
