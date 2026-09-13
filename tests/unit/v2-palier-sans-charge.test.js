//
// ⚠️ SOUS JSDOM, PAS EN ENVIRONNEMENT `node` : `v2/js/modele.js` se termine par
// `(… : this)` là où les autres modules v2 finissent par `globalThis`. Sous
// Jest en `node`, Babel remplace le `this` de tête de module par `undefined` et
// le fichier plante au chargement. Piège signalé au chantier 29, toujours là.
//
// v2 — le palier sur les exercices sans charge (chantier 31).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
//   UNE SÉANCE-EXERCICE SANS CHARGE ET À PLUSIEURS SÉRIES.
//
// Sur une série unique, « palier reconnu » et « palier absent » donnent le même
// écran : la règle de majorité exige `min(3, ceil(n/2))` séries, donc une seule
// ne fait jamais palier de toute façon. Il faut TROIS séries à la même
// « charge » pour que la majorité soit atteinte — et c'est exactement là que le
// palier sortait à zéro.
//
// Et sur `charge_reps`, la correction est invisible par construction : une
// charge réelle n'est jamais nulle. Le quatrième bloc ci-dessous le vérifie
// pour de vrai, parce que « invisible par construction » est une affirmation,
// pas une mesure.

const P = require('../../v2/js/palier.js');

let n = 0;
const s = (o) => Object.assign({
  id: 'l' + (++n), exercise_slug: 'e', session_id: 'ss', rang: n,
  charge_kg: null, reps: null, duree_s: null, distance_m: null,
  type_serie: 'travail', rpe: null
}, o);

const analyse = (series, mesure) => P.analyser(series, null, { mesure: mesure });

// ══ 1. `reps` — tractions, dips, gainage au poids de corps ═════════════════

describe('`reps` : aucun palier, et la raison le dit', () => {
  // ⚠️ LA FORME RÉELLE EN BASE : 2 297 des 2 300 séries de travail en `reps`
  // portent `charge_kg = NULL`. Les 3 autres sont des tractions lestées, et
  // elles ont une vraie charge.
  test('charge absente : palier null, raison « sans-charge »', () => {
    const r = analyse([s({ reps: 10 }), s({ reps: 10 }), s({ reps: 8 })], 'reps');
    expect(r.palier).toBe(null);
    expect(r.reps).toBe(null);
    expect(r.erreur).toBe(P.SANS_CHARGE);
  });

  // ⚠️ LA FORME D'UN IMPORT : un export Hevy écrit `0` là où la base écrit
  // `NULL`. Aucune ligne de la base n'est dans ce cas aujourd'hui — mais le
  // chemin existe, et c'est LUI qui produisait « palier 0 kg ».
  test('charge à ZÉRO : toujours pas de palier — zéro n’est pas une charge', () => {
    const r = analyse([s({ charge_kg: 0, reps: 10 }), s({ charge_kg: 0, reps: 10 }),
                       s({ charge_kg: 0, reps: 8 })], 'reps');
    expect(r.palier).toBe(null);
    expect(r.erreur).toBe(P.SANS_CHARGE);
  });

  // Le cœur du §2.1 : deux absences, deux raisons. « Par nature » ne doit pas
  // se confondre avec « pas cette fois ».
  test('la raison distingue « par nature » de « pas ce jour-là »', () => {
    const nature = analyse([s({ reps: 10 }), s({ reps: 10 }), s({ reps: 8 })], 'reps');
    // Une séance de développé couché où tout est tagué chauffe : rien retenu
    // CE JOUR-LÀ, mais l'exercice a une charge et aura un palier demain.
    const ceJour = analyse([s({ charge_kg: 40, reps: 10, type_serie: 'echauffement' }),
                            s({ charge_kg: 45, reps: 10, type_serie: 'echauffement' })],
                           'charge_reps');
    expect(nature.erreur).toBe(P.SANS_CHARGE);
    expect(ceJour.erreur).toBe(P.AUCUNE_SERIE);
    expect(nature.erreur).not.toBe(ceJour.erreur);
  });

  // Les 3 séries lestées : elles ONT une charge, elle doit compter.
  test('mais une traction LESTÉE garde son palier', () => {
    const r = analyse([s({ charge_kg: 10, reps: 8 }), s({ charge_kg: 10, reps: 8 }),
                       s({ charge_kg: 10, reps: 6 })], 'charge_reps');
    expect(r.palier).toBe(10);
    expect(r.reps).toBe(8);
    expect(r.erreur).toBe(null);
  });
});

// ══ 2. `temps` — planche, gainage ══════════════════════════════════════════

describe('`temps` : aucun palier, même raison', () => {
  test('durée seule : palier null, raison « sans-charge »', () => {
    const r = analyse([s({ duree_s: 60 }), s({ duree_s: 55 }), s({ duree_s: 50 })], 'temps');
    expect(r.palier).toBe(null);
    expect(r.erreur).toBe(P.SANS_CHARGE);
  });

  test('et la forme « tout à zéro » d’un import ne change rien', () => {
    const r = analyse([s({ charge_kg: 0, reps: 0, duree_s: 60 }),
                       s({ charge_kg: 0, reps: 0, duree_s: 55 }),
                       s({ charge_kg: 0, reps: 0, duree_s: 50 })], 'temps');
    expect(r.palier).toBe(null);
    expect(r.erreur).toBe(P.SANS_CHARGE);
  });
});

// ══ 3. `distance_temps` — HORS MOTEUR (CADRAGE §2 ter) ═════════════════════

describe('`distance_temps` est hors moteur, et se dit autrement', () => {
  test('sa raison lui est propre : ni palier, ni cible, ni suggestion, jamais', () => {
    const r = analyse([s({ distance_m: 5000, duree_s: 1800 }),
                       s({ distance_m: 4000, duree_s: 1500 })], 'distance_temps');
    expect(r.palier).toBe(null);
    expect(r.erreur).toBe(P.HORS_MOTEUR);
    expect(r.erreur).not.toBe(P.SANS_CHARGE);
  });

  // ⚠️ Même une sortie enregistrée AVEC une charge reste hors moteur : c'est la
  // MESURE qui l'exclut, pas l'absence de kilos.
  test('même chargée, elle reste hors moteur', () => {
    const r = analyse([s({ charge_kg: 20, reps: 1, distance_m: 5000, duree_s: 1800 }),
                       s({ charge_kg: 20, reps: 1, distance_m: 5000, duree_s: 1800 }),
                       s({ charge_kg: 20, reps: 1, distance_m: 5000, duree_s: 1800 })],
                      'distance_temps');
    expect(r.palier).toBe(null);
    expect(r.erreur).toBe(P.HORS_MOTEUR);
    expect(r.meilleure).toBe(null);
  });
});

// ══ 4. `charge_reps` — STRICTEMENT INCHANGÉ ════════════════════════════════

describe('`charge_reps` ne bouge pas d’un gramme', () => {
  test('le palier simple reste le palier simple', () => {
    const r = analyse([s({ charge_kg: 100, reps: 5 }), s({ charge_kg: 100, reps: 5 }),
                       s({ charge_kg: 100, reps: 4 })], 'charge_reps');
    expect(r.palier).toBe(100);
    expect(r.reps).toBe(5);
  });

  test('et il ne dépend pas de la mesure quand elle n’est pas donnée', () => {
    const series = [s({ charge_kg: 100, reps: 5 }), s({ charge_kg: 100, reps: 5 }),
                    s({ charge_kg: 100, reps: 4 })];
    expect(P.analyser(series, null).palier)
      .toBe(P.analyser(series, null, { mesure: 'charge_reps' }).palier);
  });

  // ⚠️ LA CHARGE NÉGATIVE VOTE — 124 séries en base, toutes en `charge_reps`.
  // Une assistance de −20 kg EST une charge, et elle est plus lourde qu'une
  // assistance de −10 : on aide moins, donc on travaille plus. Comportement
  // d'aujourd'hui, conservé volontairement et vérifié ici pour qu'il ne parte
  // pas par accident avec le garde du zéro.
  test('une charge NÉGATIVE fait palier, comme avant', () => {
    const r = analyse([s({ charge_kg: -20, reps: 10 }), s({ charge_kg: -20, reps: 10 }),
                       s({ charge_kg: -20, reps: 8 })], 'charge_reps');
    expect(r.palier).toBe(-20);
    expect(r.reps).toBe(10);
    expect(r.erreur).toBe(null);
  });

  test('et −10 est bien « plus lourd » que −20', () => {
    const r = analyse([s({ charge_kg: -20, reps: 10 }), s({ charge_kg: -20, reps: 10 }),
                       s({ charge_kg: -10, reps: 8 }), s({ charge_kg: -10, reps: 8 }),
                       s({ charge_kg: -10, reps: 8 })], 'charge_reps');
    expect(r.palier).toBe(-10);
  });

  // Le zéro ne vote pas, mais il n'efface pas le palier des AUTRES séries.
  test('un zéro au milieu n’empêche pas les vraies charges de faire palier', () => {
    const r = analyse([s({ charge_kg: 0, reps: 12 }), s({ charge_kg: 60, reps: 8 }),
                       s({ charge_kg: 60, reps: 8 }), s({ charge_kg: 60, reps: 7 })],
                      'charge_reps');
    expect(r.palier).toBe(60);
  });
});

// ══ 5. `calculerPalier` — la règle nue ═════════════════════════════════════

describe('calculerPalier : zéro ne vote jamais', () => {
  const kg = (...v) => v.map((x) => s({ charge_kg: x, reps: 5 }));

  test('trois zéros ne font pas un palier', () => {
    expect(P.calculerPalier(kg(0, 0, 0))).toBe(null);
  });

  test('la majorité se compte SANS les zéros', () => {
    // 5 séries, requis = 3. Deux 50 et trois 0 : personne n'atteint 3.
    expect(P.calculerPalier(kg(0, 0, 0, 50, 50))).toBe(null);
    // Trois 50 : le palier est 50, les zéros ne changent rien.
    expect(P.calculerPalier(kg(0, 0, 50, 50, 50))).toBe(50);
  });

  test('les négatives, elles, votent', () => {
    expect(P.calculerPalier(kg(-20, -20, -20))).toBe(-20);
  });
});

// ══ 6. LES CONSOMMATEURS ═══════════════════════════════════════════════════
//
// Trouvés par grep sur `.analyser(`, `.palier`, `.meilleure`, `.erreur` :
//   · `THModele.apercuExercices` — le journal, la carte de séance ;
//   · `app.js sommaireExercices` — Progression, bloc « Par exercice » ;
//   · `THPalier.etatsExercices`  — ne lit PAS le palier, il compte les montées.
// Le premier est testable ici ; le second est du DOM d'`app.js` (banc) ; le
// troisième ne consomme pas de palier.
//
// Ce qu'on exige : ni plantage, ni valeur inventée. Aucun « 0 kg » nulle part.

const Modele = require('../../v2/js/modele.js');

describe('les consommateurs traitent l’absence sans rien inventer', () => {
  const CATALOGUE = [
    { slug: 'dc', nom: 'Développé Couché', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [], muscles_secondaires: [] },
    { slug: 'tr', nom: 'Tractions', mesure: 'reps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] },
    { slug: 'pl', nom: 'Planche', mesure: 'temps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] }
  ];

  // ⚠️ LES TROIS MESURES DANS LA MÊME SÉANCE, chacune à PLUSIEURS séries :
  // c'est la configuration discriminante, appliquée au consommateur.
  const SERIES = [
    s({ exercise_slug: 'dc', rang: 1, charge_kg: 80, reps: 8 }),
    s({ exercise_slug: 'dc', rang: 2, charge_kg: 80, reps: 8 }),
    s({ exercise_slug: 'dc', rang: 3, charge_kg: 80, reps: 7 }),
    s({ exercise_slug: 'tr', rang: 4, reps: 12 }),
    s({ exercise_slug: 'tr', rang: 5, reps: 10 }),
    s({ exercise_slug: 'tr', rang: 6, reps: 9 }),
    s({ exercise_slug: 'pl', rang: 7, duree_s: 60 }),
    s({ exercise_slug: 'pl', rang: 8, duree_s: 55 }),
    s({ exercise_slug: 'pl', rang: 9, duree_s: 50 })
  ].map((x) => Object.assign(x, { validee_a: '2026-09-10T10:00:00Z' }));

  test('l’aperçu rend la charge sur `charge_reps`, la grandeur propre ailleurs', () => {
    const a = Modele.apercuExercices(SERIES, CATALOGUE, P, {});
    const parNom = {};
    a.tete.forEach((e) => { parNom[e.nom] = e; });

    expect(parNom['Développé Couché'].charge).toBe(80);
    expect(parNom['Développé Couché'].reps).toBe(8);

    // Aucune charge inventée — et surtout aucun zéro.
    expect(parNom['Tractions'].charge == null).toBe(true);
    expect(parNom['Planche'].charge == null).toBe(true);
    // Mais la ligne n'est pas muette : elle dit ce qu'il y a à dire — le
    // MAXIMUM de ce qui a été fait, pas la dernière série. 60 s, pas 50.
    expect(parNom['Tractions'].valeur).toBe('12');
    expect(parNom['Planche'].valeur).toBe('1 min');
  });

  test('aucun « 0 » ne traverse le résumé de séance', () => {
    const r = Modele.resumerSeance(
      { id: 'ss', titre: 'T', debut: '2026-09-10T10:00:00Z', statut: 'terminee' },
      SERIES, CATALOGUE, P, {});
    const charges = r.apercu.tete.map((e) => e.charge);
    expect(charges.filter((c) => c === 0)).toHaveLength(0);
    expect(charges).toEqual([80, null, null]);
  });

  test('une séance SANS aucune charge ne plante pas et n’invente rien', () => {
    const sansCharge = SERIES.filter((x) => x.exercise_slug !== 'dc');
    const r = Modele.resumerSeance(
      { id: 'ss', titre: 'T', debut: '2026-09-10T10:00:00Z', statut: 'terminee' },
      sansCharge, CATALOGUE, P, {});
    expect(r.apercu.tete.every((e) => e.charge == null)).toBe(true);
    expect(r.apercu.tete.map((e) => e.valeur)).toEqual(['12', '1 min']);
  });

  // `etatsExercices` ne lit pas le palier : il compte les montées en charge.
  // Sur un exercice sans charge il ne peut rien conclure — et il ne conclut
  // rien d'utilisable, ce qui est le comportement voulu.
  test('la table des états ne fabrique pas de montée sur un exercice sans charge', () => {
    const se = P.seanceExercices(SERIES);
    const etats = P.etatsExercices(se);
    // Moins de 8 séances : aucune hypothèse, quel que soit l'exercice.
    Object.keys(etats).forEach((slug) => {
      expect(etats[slug].etat).toBe(P.ETAT_INDETERMINE);
    });
  });
});
