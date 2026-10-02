//
// v2 — les quatre mesures (chantier 24).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// **UNE SÉANCE CONTENANT LES QUATRE MESURES À LA FOIS.**
//
// Sur une séance qui n'en contient qu'une, « la grille s'adapte » et « la
// grille est fixe » rendent exactement le même écran — c'est précisément
// pourquoi le défaut a survécu à trois chantiers de saisie. Chaque test de
// rendu pose donc les quatre exercices dans la même séance et compare les
// lignes ENTRE ELLES : l'assertion n'est pas « il y a une colonne de durée »,
// c'est « la planche en a une et le développé n'en a pas ».
//
// Le rendu tourne sous jsdom, dans un vrai DOM : `rendu.js` n'exporte rien en
// CommonJS (il pose `window.THRendu`), et c'est cette surface-là qu'on lit.

// PR 6 de la consolidation — la série de travail et son compte vivent dans
// `modele.js` et `semaine.js`, lus à l'appel par les autres modules.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const Palier = require('../../v2/js/palier.js');
const { progTravail } = require('./aide-routine-programmee.js');

const Rendu = () => window.THRendu;

// ── Le catalogue : une entrée par mesure ───────────────────────────────────
const CATALOGUE = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'tr', nom: 'Tractions', mesure: 'reps', charge: 'aucune',
    muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  { slug: 'pl', nom: 'Planche', mesure: 'temps', charge: 'aucune',
    muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
  { slug: 'ma', nom: 'Marche', mesure: 'distance_temps', charge: 'aucune',
    muscles_primaires: [], muscles_secondaires: [] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);

let graine = 0;
const uuid = () => 'set-' + (++graine);

// La séance des quatre mesures, une série par exercice.
function seanceQuatre() {
  return Seance.creer({
    id: 'S', userId: 'u', idSerie: uuid,
    routine: { id: 'r', exercices: [
      { exercise_slug: 'dc', series: progTravail(1, 5), repos_cible_s: 180 },
      { exercise_slug: 'tr', series: progTravail(1, 12), repos_cible_s: null },
      { exercise_slug: 'pl', series: progTravail(1, null), repos_cible_s: null },
      { exercise_slug: 'ma', series: progTravail(1, null), repos_cible_s: null }
    ] }
  });
}

function rendre(seance, options) {
  const o = options || {};
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, seance, {
    blocs: Modele.blocsDeSeance(seance, o.catalogue === null ? [] : CATALOGUE),
    tourAtteint: (g) => Seance.tourAtteint(seance, g),
    exercice: (slug) => (o.catalogue === null ? undefined : INDEX[slug]),
    precedent: o.precedent || (() => null),
    fantome: (i, j) => Seance.fantome(seance, i, j,
      (o.precedent || (() => null))(seance.exercices[i].exercise_slug)),
    surChamp: o.surChamp || (() => {}),
    surValider: () => {}, surNumero: () => {}, surEffort: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {}
  });
  return cible;
}

// Les blocs rendus, décrits : un objet par exercice.
function lire(cible) {
  return Array.from(cible.querySelectorAll('.bloc-seance')).map((bloc) => ({
    nom: bloc.querySelector('.exo-seance').textContent,
    type: bloc.querySelector('.type-mesure') ? bloc.querySelector('.type-mesure').textContent : null,
    entetes: Array.from(bloc.querySelectorAll('.cols-seance span'))
      .map((s) => s.textContent).filter(Boolean),
    grille: Array.from(bloc.querySelector('.serie').classList).filter((c) => c.startsWith('g-'))[0],
    // Les champs de saisie, avec leur unité affichée dans le champ.
    champs: Array.from(bloc.querySelectorAll('.serie .ch-serie, .serie .rp-serie')).map((c) => ({
      valeur: c.querySelector('input').value,
      fantome: c.querySelector('input').placeholder,
      unite: c.querySelector('u') ? c.querySelector('u').textContent : null
    })),
    effort: bloc.querySelectorAll('.serie .eff-serie').length,
    precedent: bloc.querySelector('.prec').textContent
  }));
}

// ── 1. Les quatre gabarits ─────────────────────────────────────────────────
describe('1 — chaque mesure rend ses colonnes, et SEULEMENT les siennes', () => {
  const blocs = () => lire(rendre(seanceQuatre()));

  test('les quatre lignes n’ont pas la même grille', () => {
    expect(blocs().map((b) => b.grille)).toEqual([
      'g-charge_reps', 'g-reps', 'g-temps', 'g-distance_temps'
    ]);
  });

  test('les en-têtes de colonnes diffèrent d’un exercice à l’autre', () => {
    expect(blocs().map((b) => b.entetes)).toEqual([
      ['PRÉC.', 'KG', 'REPS', 'EFFORT'],
      ['PRÉC.', 'REPS', 'EFFORT'],
      ['PRÉC.', 'DURÉE'],
      ['PRÉC.', 'DURÉE', 'DISTANCE']
    ]);
  });

  test('le nombre de champs de saisie suit la mesure', () => {
    expect(blocs().map((b) => b.champs.length)).toEqual([2, 1, 1, 2]);
  });

  // ⚠️ Depuis le chantier 25, la DURÉE ne porte plus d’unité : elle se saisit
  // par décalage, en `HH:MM:SS`, et c’est la forme qui dit l’unité. Seuls les
  // kilos et les kilomètres en gardent une.
  test('chaque champ porte son unité, écrite dans le champ', () => {
    expect(blocs().map((b) => b.champs.map((c) => c.unite))).toEqual([
      ['kg', null],        // la colonne reps n’a pas d’unité à écrire
      [null],
      [null],              // une durée se lit 00:50, pas « 50 s »
      [null, 'km']
    ]);
  });

  test('le type de mesure est rappelé sous le nom de l’exercice', () => {
    expect(blocs().map((b) => b.type)).toEqual([
      'CHARGE × REPS', 'REPS SEULES', 'DURÉE', 'DISTANCE ET DURÉE'
    ]);
  });
});

// ── 2. `reps` — aucune charge, nulle part ─────────────────────────────────
describe('2 — `reps` n’a pas de colonne de charge, et n’en envoie aucune', () => {
  test('aucun champ de charge n’est rendu', () => {
    const tr = lire(rendre(seanceQuatre()))[1];
    expect(tr.champs.length).toBe(1);
    expect(tr.entetes).not.toContain('KG');
  });

  test('valider n’écrit AUCUNE charge en base', () => {
    let s = seanceQuatre();
    s = Seance.modifierSerie(s, 1, 0, { reps: '12' });
    s = Seance.valider(s, 1, 0, new Date('2026-09-12T10:00:00Z'));
    const l = Seance.lignes(s);
    expect(l.length).toBe(1);
    expect(l[0].exercise_slug).toBe('tr');
    expect(l[0].reps).toBe(12);
    expect(l[0].charge_kg).toBeNull();
    expect(l[0].duree_s).toBeNull();
    expect(l[0].distance_m).toBeNull();
  });
});

// ── 3. `temps` — la durée se saisit et se formate ─────────────────────────
describe('3 — `temps` saisit une durée, et rien d’autre', () => {
  test('`duree_s` est renseigné, `charge_kg` et `reps` restent nuls', () => {
    let s = seanceQuatre();
    s = Seance.modifierSerie(s, 2, 0, { duree: 50 });
    s = Seance.valider(s, 2, 0, new Date('2026-09-12T10:00:00Z'));
    const l = Seance.lignes(s)[0];
    expect(l.exercise_slug).toBe('pl');
    expect(l.duree_s).toBe(50);
    expect(l.charge_kg).toBeNull();
    expect(l.reps).toBeNull();
    expect(l.distance_m).toBeNull();
  });

  // ⚠️ EN HORLOGE depuis le chantier 25, comme le champ qu'elle jouxte. Dire
  // « 45 s » à trois millimètres d'un champ qui dit « 00:45 » serait deux
  // écritures du même chiffre sur la même ligne.
  test('la colonne « précédent » parle la même langue que le champ', () => {
    const prec = () => ({ seance: {}, series: [{ charge_kg: null, reps: null,
                                                 duree_s: 45, distance_m: null }] });
    const blocs = lire(rendre(seanceQuatre(), { precedent: prec }));
    expect(blocs[2].precedent).toBe('00:45');
  });

  // La durée arrive DÉJÀ en secondes depuis le pavé ; la distance garde son
  // facteur. Une seule unité de durée, plus de `duree_min`.
  test('une sortie enregistre des secondes et des mètres', () => {
    let s = seanceQuatre();
    s = Seance.modifierSerie(s, 3, 0, { duree: 7800, distance_km: '8,4' });
    s = Seance.valider(s, 3, 0, new Date('2026-09-12T10:00:00Z'));
    const l = Seance.lignes(s)[0];
    expect(l.duree_s).toBe(7800);
    expect(l.distance_m).toBe(8400);
  });

  test('et l’écran remonte la durée en horloge, la distance en kilomètres', () => {
    let s = seanceQuatre();
    s = Seance.modifierSerie(s, 3, 0, { duree: 7800, distance_km: '8,4' });
    const ma = lire(rendre(s))[3];
    expect(ma.champs.map((c) => c.valeur)).toEqual(['02:10:00', '8,4']);
  });

  test('la colonne « précédent » d’une sortie donne la durée, pas la distance', () => {
    const prec = () => ({ seance: {}, series: [{ charge_kg: null, reps: null,
                                                 duree_s: 23700, distance_m: 22660 }] });
    const blocs = lire(rendre(seanceQuatre(), { precedent: prec }));
    expect(blocs[3].precedent).toBe('06:35:00');
  });

  test('ni durée ni distance négative — on rejette plutôt que de stocker', () => {
    let s = seanceQuatre();
    s = Seance.modifierSerie(s, 2, 0, { duree: '-30' });
    expect(s.exercices[2].series[0].duree_s).toBeNull();
    s = Seance.modifierSerie(s, 3, 0, { distance_km: '-1' });
    expect(s.exercices[3].series[0].distance_m).toBeNull();
  });
});

// ── 4. L'effort suit la mesure ────────────────────────────────────────────
describe('4 — pas de colonne d’effort là où il n’y a pas de répétitions', () => {
  test('`charge_reps` et `reps` en ont une, `temps` et `distance_temps` non', () => {
    expect(lire(rendre(seanceQuatre())).map((b) => b.effort)).toEqual([1, 1, 0, 0]);
  });

  test('le gabarit le dit, et c’est une seule table qui le dit', () => {
    expect(Modele.GABARITS.charge_reps.effort).toBe(true);
    expect(Modele.GABARITS.reps.effort).toBe(true);
    expect(Modele.GABARITS.temps.effort).toBe(false);
    expect(Modele.GABARITS.distance_temps.effort).toBe(false);
  });

  test('et rien n’est écrit dans `rpe` ni dans `ressenti`', () => {
    let s = seanceQuatre();
    s = Seance.modifierSerie(s, 2, 0, { duree: 50 });
    s = Seance.modifierSerie(s, 3, 0, { duree: 7800, distance_km: '8,4' });
    s = Seance.valider(s, 2, 0, new Date('2026-09-12T10:00:00Z'));
    s = Seance.valider(s, 3, 0, new Date('2026-09-12T10:10:00Z'));
    Seance.lignes(s).forEach((l) => {
      expect(l.rpe).toBeNull();
      expect(l.ressenti).toBeNull();
    });
  });
});

// ── 5. L'effort s'affiche dans la forme saisie ────────────────────────────
describe('5 — l’affichage rend la forme saisie, sans traduction', () => {
  function effortRendu(champs) {
    let s = seanceQuatre();
    s = Seance.definirEffort(s, 0, 0, champs);
    const bloc = rendre(s).querySelectorAll('.bloc-seance')[0];
    return bloc.querySelector('.eff-serie').textContent;
  }

  test('un RPE saisi s’affiche en chiffre', () => {
    expect(effortRendu({ rpe: 9 })).toBe('9');
    expect(effortRendu({ rpe: 8.5 })).toBe('8,5');
  });

  test('un ressenti saisi s’affiche en répétitions restantes', () => {
    expect(effortRendu({ ressenti: 'reste_1' })).toBe('−1');
    expect(effortRendu({ ressenti: 'reste_0' })).toBe('−0');
    expect(effortRendu({ ressenti: 'reste_3_plus' })).toBe('−3+');
  });

  // La preuve qu'il n'y a PAS de traduction : un RPE ne devient jamais un
  // ressenti, et réciproquement. Les deux restent exclusifs (chantier 22).
  test('aucune traduction de l’un vers l’autre', () => {
    let s = Seance.definirEffort(seanceQuatre(), 0, 0, { rpe: 9 });
    expect(s.exercices[0].series[0].ressenti).toBeNull();
    s = Seance.definirEffort(s, 0, 0, { ressenti: 'reste_1' });
    expect(s.exercices[0].series[0].rpe).toBeNull();
    expect(effortRendu({ ressenti: 'reste_2' })).not.toMatch(/^\d/);
  });
});

// ── 6. Mesure inconnue ────────────────────────────────────────────────────
describe('6 — une mesure inconnue ne plante pas et ne rend pas une grille vide', () => {
  test('le repli est `charge_reps`, la mesure la plus courante', () => {
    ['zzz', '', null, undefined].forEach((m) => {
      const g = Modele.gabaritDe(m === undefined ? undefined : { mesure: m });
      expect(g.mesure).toBe('charge_reps');
      expect(g.champs).toEqual(['charge_kg', 'reps']);
      expect(g.inconnue).toBe(true);
    });
    expect(Modele.gabaritDe(null).inconnue).toBe(true);
    expect(Modele.gabaritDe(undefined).inconnue).toBe(true);
  });

  // On ne nomme pas ce qu'on ne connaît pas : afficher « CHARGE × REPS » sur un
  // exercice dont le catalogue n'est pas arrivé serait mentir avec aplomb.
  test('le libellé de type est TU, pas inventé', () => {
    expect(Modele.gabaritDe({ mesure: 'zzz' }).libelle).toBeNull();
    const blocs = lire(rendre(seanceQuatre(), { catalogue: null }));
    expect(blocs.map((b) => b.type)).toEqual([null, null, null, null]);
    expect(blocs.map((b) => b.grille))
      .toEqual(['g-charge_reps', 'g-charge_reps', 'g-charge_reps', 'g-charge_reps']);
  });

  test('et la grille reste saisissable — jamais vide', () => {
    const blocs = lire(rendre(seanceQuatre(), { catalogue: null }));
    blocs.forEach((b) => {
      expect(b.champs.length).toBe(2);
      expect(b.effort).toBe(1);
    });
  });
});

// ── 7. Le palier sur un exercice sans charge ──────────────────────────────
//
// Établi AVANT d'écrire l'affichage, comme le demandait le §4 du chantier :
// `palier.analyser` rend une ABSENCE PROPRE. Pas un zéro traité comme une
// valeur, pas un plantage. Ce test la verrouille — si le moteur se met un jour
// à rendre 0, on le saura ici et pas sur un écran.
describe('7 — le palier d’un exercice sans charge est une absence, pas un zéro', () => {
  const s = (o) => Object.assign({ id: 'x', rang: 1, type_serie: 'travail',
    charge_kg: null, reps: null, duree_s: null, distance_m: null }, o);

  test('`reps`, `temps` et `distance_temps` n’ont aucun palier', () => {
    [
      [s({ id: 'a', reps: 12 }), s({ id: 'b', rang: 2, reps: 11 })],
      [s({ id: 'a', duree_s: 50 }), s({ id: 'b', rang: 2, duree_s: 45 })],
      [s({ id: 'a', duree_s: 7800, distance_m: 8400 })]
    ].forEach((series) => {
      const r = Palier.analyser(series, null);
      expect(r.palier).toBeNull();
      expect(r.reps).toBeNull();
      expect(r.meilleure).toBeNull();
      expect(r.erreur).toBe('aucune-serie-de-travail');
    });
  });

  test('le témoin `charge_reps`, lui, en a un', () => {
    const r = Palier.analyser([s({ id: 'a', charge_kg: 100, reps: 5 }),
                               s({ id: 'b', rang: 2, charge_kg: 100, reps: 5 }),
                               s({ id: 'c', rang: 3, charge_kg: 100, reps: 4 })], null);
    expect(r.palier).toBe(100);
    expect(r.meilleure).toEqual({ charge: 100, reps: 5 });
  });
});

// ── 8. La carte de séance dit la bonne grandeur ───────────────────────────
describe('8 — le résumé de séance affiche la grandeur de chaque mesure', () => {
  const s = (o) => Object.assign({ id: 'x', session_id: 'S', rang: 1, type_serie: 'travail',
    charge_kg: null, reps: null, duree_s: null, distance_m: null }, o);

  const MELEE = [
    s({ id: '1', rang: 1, exercise_slug: 'dc', charge_kg: 100, reps: 5 }),
    s({ id: '2', rang: 2, exercise_slug: 'dc', charge_kg: 100, reps: 5 }),
    s({ id: '3', rang: 3, exercise_slug: 'dc', charge_kg: 100, reps: 4 }),
    s({ id: '4', rang: 4, exercise_slug: 'tr', reps: 12 }),
    s({ id: '5', rang: 5, exercise_slug: 'tr', reps: 10 }),
    s({ id: '6', rang: 6, exercise_slug: 'pl', duree_s: 50 })
  ];

  test('charge pour `charge_reps`, reps pour `reps`, durée pour `temps`', () => {
    const a = Modele.apercuExercices(MELEE, CATALOGUE, Palier, {});
    expect(a.tete.map((e) => [e.nom, e.charge, e.valeur || null])).toEqual([
      ['Développé Couché (Barre)', 100, null],
      ['Tractions', null, '12'],
      ['Planche', null, '50 s']
    ]);
  });

  test('durée ET distance pour une sortie', () => {
    const a = Modele.apercuExercices(
      [s({ id: '1', rang: 1, exercise_slug: 'ma', duree_s: 7800, distance_m: 8400 })],
      CATALOGUE, Palier, {});
    expect(a.tete[0].valeur).toBe('2 h 10');
    expect(a.tete[0].complement).toBe('· 8,4 km');
  });

  // Sans cette garde, une séance dont les séries ne sont pas encore en cache
  // afficherait « 0 » — un chiffre faux là où il n'y a rien à dire.
  test('rien à dire reste rien — jamais un zéro par défaut', () => {
    const a = Modele.apercuExercices(
      [s({ id: '1', rang: 1, exercise_slug: 'tr' })], CATALOGUE, Palier, {});
    expect(a.tete[0].valeur).toBeUndefined();
  });

  test('une chauffe ne fait pas la meilleure série d’un exercice en `reps`', () => {
    const a = Modele.apercuExercices([
      s({ id: '1', rang: 1, exercise_slug: 'tr', reps: 20, type_serie: 'echauffement' }),
      s({ id: '2', rang: 2, exercise_slug: 'tr', reps: 12 })
    ], CATALOGUE, Palier, {});
    expect(a.tete[0].valeur).toBe('12');
  });
});

// ── 8 bis. Le « précédent » remonte la grandeur de la mesure ──────────────
//
// `Seance.precedent` relit les séries d'une séance passée et n'en garde que ce
// qui sert la colonne. Si elle laisse `duree_s` et `distance_m` derrière, la
// colonne est vide sur trois mesures sur quatre — et vide se lit « je n'ai
// jamais fait ça », pas « je ne transporte pas cette colonne ».
describe('8 bis — `precedent` recopie ce que la mesure demande', () => {
  const s = (o) => Object.assign({ id: 'x', session_id: 'V', rang: 1,
    type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null }, o);

  const VEILLE = { id: 'V', debut: '2026-09-11T18:00:00Z', statut: 'terminee' };
  const SERIES = [
    s({ id: 'a', rang: 1, exercise_slug: 'dc', charge_kg: 122.5, reps: 5 }),
    s({ id: 'b', rang: 2, exercise_slug: 'tr', reps: 11 }),
    s({ id: 'c', rang: 3, exercise_slug: 'pl', duree_s: 45 }),
    s({ id: 'd', rang: 4, exercise_slug: 'ma', duree_s: 23700, distance_m: 22660 })
  ];
  const seriesDe = (id) => (id === 'V' ? SERIES : []);
  const prec = (slug) => Seance.precedent(slug, [VEILLE], seriesDe, 'S');

  test('les quatre grandeurs traversent, aucune n’est laissée derrière', () => {
    expect(prec('dc').series[0]).toMatchObject({ charge_kg: 122.5, reps: 5 });
    expect(prec('tr').series[0]).toMatchObject({ reps: 11 });
    expect(prec('pl').series[0]).toMatchObject({ duree_s: 45 });
    expect(prec('ma').series[0]).toMatchObject({ duree_s: 23700, distance_m: 22660 });
  });

  test('et la colonne les affiche, formatées, chacune dans sa mesure', () => {
    const blocs = lire(rendre(seanceQuatre(), { precedent: prec }));
    expect(blocs.map((b) => b.precedent)).toEqual(['122,5×5', '11', '00:45', '06:35:00']);
  });

  // Un exercice jamais fait n'a pas de précédent : un tiret, pas un zéro.
  test('jamais fait → un tiret', () => {
    const vide = () => null;
    expect(lire(rendre(seanceQuatre(), { precedent: vide })).map((b) => b.precedent))
      .toEqual(['—', '—', '—', '—']);
  });

  // Le fantôme suit la même route : la dernière durée devient la valeur grise.
  test('le fantôme d’une planche est la durée précédente, en horloge', () => {
    const blocs = lire(rendre(seanceQuatre(), { precedent: prec }));
    expect(blocs[2].champs[0].fantome).toBe('00:45');
    expect(blocs[3].champs.map((c) => c.fantome)).toEqual(['06:35:00', '22,66']);
  });
});

// ── 9. Non-régression `charge_reps` ───────────────────────────────────────
describe('9 — `charge_reps` est inchangé', () => {
  test('six colonnes, kg et reps, effort, et le fantôme de la routine', () => {
    const bloc = lire(rendre(seanceQuatre()))[0];
    expect(bloc.grille).toBe('g-charge_reps');
    expect(bloc.entetes).toEqual(['PRÉC.', 'KG', 'REPS', 'EFFORT']);
    expect(bloc.champs.length).toBe(2);
    expect(bloc.effort).toBe(1);
    // `reps_visees` de la routine sert de fantôme de reps (§3 bis.3).
    expect(bloc.champs[1].fantome).toBe('5');
  });

  test('la colonne « précédent » garde sa forme compacte', () => {
    const prec = () => ({ seance: {}, series: [{ charge_kg: 122.5, reps: 5,
                                                 duree_s: null, distance_m: null }] });
    expect(lire(rendre(seanceQuatre(), { precedent: prec }))[0].precedent).toBe('122,5×5');
  });

  test('valider écrit charge et reps, et laisse durée et distance nulles', () => {
    let s = seanceQuatre();
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: '122,5', reps: '6' });
    s = Seance.valider(s, 0, 0, new Date('2026-09-12T10:00:00Z'));
    const l = Seance.lignes(s)[0];
    expect(l.charge_kg).toBe(122.5);
    expect(l.reps).toBe(6);
    expect(l.duree_s).toBeNull();
    expect(l.distance_m).toBeNull();
  });
});
