// tests/unit/v2-modele.test.js — socle v2, module pur de transformation.
//
// Règle centrale vérifiée ici (ECRAN-SAISIE-V1 §2.3) :
//   la LETTRE identifie l'exercice dans le bloc, le CHIFFRE identifie le TOUR.
// Un bloc d'un seul exercice n'a pas de lettre du tout.

const Modele = require('../../v2/js/modele.js');

// Fabrique une ligne `sets` conforme au schéma réel.
function serie(o) {
  return Object.assign({
    id: 's' + (o.rang || 0),
    session_id: 'sess-1',
    exercise_slug: 'dc',
    charge_kg: 100,
    reps: 5,
    duree_s: null,
    distance_m: null,
    type_serie: 'travail',
    validee_a: null,
    rang: 1,
    groupe_superset: null
  }, o);
}
// Une série saisie dans l'app : `validee_a` renseigné → la chronologie existe.
function saisie(o) {
  return serie(Object.assign({ validee_a: '2026-09-08T10:0' + (o.rang % 10) + ':00Z' }, o));
}

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé couché barre', charge: 'absolue', mesure: 'charge_reps' },
  { slug: 'el', nom: 'Élévation latérale haltère', charge: 'absolue', mesure: 'charge_reps' },
  { slug: 'ec', nom: 'Écarté haltère', charge: 'absolue', mesure: 'charge_reps' },
  { slug: 'rando', nom: 'Randonnée', charge: 'aucune', mesure: 'distance_temps' },
  { slug: 'pilates', nom: 'Pilates', charge: 'aucune', mesure: 'temps' },
  { slug: 'planche', nom: 'Planche', charge: 'aucune', mesure: 'temps' }
];

const etiquettes = (bloc) => bloc.series.map(s => s.etiquette);

// ── 1. Bloc simple : pas de lettre ──────────────────────────────────────────
describe('bloc simple — aucune lettre, le chiffre est le tour', () => {
  test('trois séries du même exercice donnent 1, 2, 3', () => {
    const blocs = Modele.construireBlocs(
      [serie({ rang: 1 }), serie({ rang: 2 }), serie({ rang: 3 })], CATALOGUE);

    expect(blocs).toHaveLength(1);
    expect(blocs[0].superset).toBe(false);
    expect(etiquettes(blocs[0])).toEqual(['1', '2', '3']);
    expect(blocs[0].exercices[0].lettre).toBe('');
  });

  test('cinq exercices sans superset : aucun ne porte de lettre', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, exercise_slug: 'dc' }), serie({ rang: 2, exercise_slug: 'dc' }),
      serie({ rang: 3, exercise_slug: 'el' }), serie({ rang: 4, exercise_slug: 'el' }),
      serie({ rang: 5, exercise_slug: 'ec' })
    ], CATALOGUE);

    expect(blocs).toHaveLength(3);
    expect(blocs.map(b => etiquettes(b))).toEqual([['1', '2'], ['1', '2'], ['1']]);
    expect(blocs.every(b => b.exercices.every(x => x.lettre === ''))).toBe(true);
  });
});

// ── 2. Superset, tours complets ─────────────────────────────────────────────
describe('superset — lettre par exercice, chiffre par tour', () => {
  test('deux exercices, tours complets, saisis dans l’app → A1, B1, A2, B2', () => {
    // Données groupées par exercice (comme Hevy les aplatit), mais chronologie
    // présente : l'affichage doit les entrelacer.
    const blocs = Modele.construireBlocs([
      saisie({ rang: 1, exercise_slug: 'el', groupe_superset: 1 }),
      saisie({ rang: 2, exercise_slug: 'el', groupe_superset: 1 }),
      saisie({ rang: 3, exercise_slug: 'ec', groupe_superset: 1 }),
      saisie({ rang: 4, exercise_slug: 'ec', groupe_superset: 1 })
    ], CATALOGUE);

    expect(blocs).toHaveLength(1);
    expect(blocs[0].superset).toBe(true);
    expect(blocs[0].exercices.map(x => x.lettre)).toEqual(['A', 'B']);
    expect(etiquettes(blocs[0])).toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  test('§7.3 — un superset IMPORTÉ (validee_a NULL) garde l’ordre de rang', () => {
    // « Une série importée n'a pas de tours, on l'affiche dans l'ordre de rang. »
    // Les étiquettes restent justes ; seul l'ordre des lignes ne s'entrelace pas.
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, exercise_slug: 'el', groupe_superset: 1 }),
      serie({ rang: 2, exercise_slug: 'el', groupe_superset: 1 }),
      serie({ rang: 3, exercise_slug: 'ec', groupe_superset: 1 }),
      serie({ rang: 4, exercise_slug: 'ec', groupe_superset: 1 })
    ], CATALOGUE);

    expect(blocs[0].chronologie).toBe(false);
    expect(etiquettes(blocs[0])).toEqual(['A1', 'A2', 'B1', 'B2']);
  });
});

// ── 3. Séries inégales, tours incomplets ────────────────────────────────────
describe('tours incomplets — rien de fantôme', () => {
  test('C n’a que deux séries : le tour 3 ne comporte que A3 et B3', () => {
    const s = [];
    ['el', 'ec'].forEach((slug, i) => {
      for (let t = 1; t <= 3; t++) s.push(saisie({ rang: i * 3 + t, exercise_slug: slug, groupe_superset: 1 }));
    });
    s.push(saisie({ rang: 7, exercise_slug: 'dc', groupe_superset: 1 }));
    s.push(saisie({ rang: 8, exercise_slug: 'dc', groupe_superset: 1 }));

    const blocs = Modele.construireBlocs(s, CATALOGUE);
    expect(etiquettes(blocs[0]))
      .toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3']);
    expect(etiquettes(blocs[0])).not.toContain('C3');
    expect(blocs[0].nbTours).toBe(3);
  });
});

// ── 4. Échauffement ─────────────────────────────────────────────────────────
describe('échauffement — lettre de son exercice, tour de chauffe avant le travail', () => {
  // ⚠️ TEST RETOURNÉ LE 13/09 — §2.5 CORRIGÉ APRÈS ESSAI SUR DEVICE.
  //
  // « La chauffe de C se pose entre B1 et C1 » avait été écrit en pensant à un
  // exercice isolé. Dans un superset, cette règle DISPERSE les chauffes et fait
  // quitter une machine pour y revenir. Elles forment leurs propres tours.
  test('§2.5 — dans un superset, la chauffe de C ouvre le bloc, pas le tour 1', () => {
    const blocs = Modele.construireBlocs([
      saisie({ rang: 1, exercise_slug: 'el', groupe_superset: 1 }),
      saisie({ rang: 2, exercise_slug: 'el', groupe_superset: 1 }),
      saisie({ rang: 3, exercise_slug: 'ec', groupe_superset: 1 }),
      saisie({ rang: 4, exercise_slug: 'ec', groupe_superset: 1 }),
      saisie({ rang: 5, exercise_slug: 'dc', groupe_superset: 1, type_serie: 'echauffement' }),
      saisie({ rang: 6, exercise_slug: 'dc', groupe_superset: 1 }),
      saisie({ rang: 7, exercise_slug: 'dc', groupe_superset: 1 })
    ], CATALOGUE);

    expect(etiquettes(blocs[0]))
      .toEqual(['C', 'A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  });

  // ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ════════════════════
  //
  //   UN SUPERSET DONT LES EXERCICES ONT UN NOMBRE INÉGAL DE CHAUFFES.
  //
  // Avec une chauffe chacun, « les chauffes forment leurs propres tours » et
  // « chaque chauffe est collée à son exercice » donnent EXACTEMENT le même
  // écran : A B C D A1 B1 C1 D1 dans les deux cas. Il faut que A et B en aient
  // deux et C et D une seule pour que la différence existe — le second tour de
  // chauffe ne doit alors contenir que A et B.
  test('chauffes inégales : le 2e tour de chauffe ne contient que ceux qui en ont deux', () => {
    const lignes = [];
    let rang = 0;
    // A : 2 chauffes + 2 travail · B : 2 chauffes + 2 travail
    // C : 1 chauffe  + 2 travail · D : 1 chauffe  + 2 travail
    [['el', 2], ['ec', 2], ['dc', 1], ['pd', 1]].forEach(([slug, nChauffes]) => {
      for (let i = 0; i < nChauffes; i++) {
        lignes.push(saisie({ rang: ++rang, exercise_slug: slug, groupe_superset: 1,
                             type_serie: 'echauffement' }));
      }
      for (let i = 0; i < 2; i++) {
        lignes.push(saisie({ rang: ++rang, exercise_slug: slug, groupe_superset: 1 }));
      }
    });

    const blocs = Modele.construireBlocs(lignes, CATALOGUE);
    expect(etiquettes(blocs[0])).toEqual([
      'A', 'B', 'C', 'D',              // tour de chauffe 1 — les quatre
      'A', 'B',                        // tour de chauffe 2 — eux seuls
      'A1', 'B1', 'C1', 'D1',          // tour de travail 1
      'A2', 'B2', 'C2', 'D2'           // tour de travail 2
    ]);
    // Les chauffes n'entrent pas dans le compteur : deux tours, pas quatre.
    expect(blocs[0].nbTours).toBe(2);
    expect(blocs[0].nbTravail).toBe(8);
  });

  test('hors superset, rien ne change : la chauffe reste en tête de son exercice', () => {
    const blocs = Modele.construireBlocs([
      saisie({ rang: 1, exercise_slug: 'el', type_serie: 'echauffement' }),
      saisie({ rang: 2, exercise_slug: 'el' }),
      saisie({ rang: 3, exercise_slug: 'el' }),
      saisie({ rang: 4, exercise_slug: 'ec', type_serie: 'echauffement' }),
      saisie({ rang: 5, exercise_slug: 'ec' })
    ], CATALOGUE);
    expect(blocs).toHaveLength(2);
    expect(blocs[0].superset).toBe(false);
    expect(etiquettes(blocs[0])).toEqual(['', '1', '2']);
    expect(etiquettes(blocs[1])).toEqual(['', '1']);
  });

  test('la chauffe ne consomme pas de numéro de tour et n’est pas du travail', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, type_serie: 'echauffement', charge_kg: 60, reps: 10 }),
      serie({ rang: 2, type_serie: 'echauffement', charge_kg: 100, reps: 5 }),
      serie({ rang: 3 }), serie({ rang: 4 })
    ], CATALOGUE);

    // Bloc simple → aucune lettre, donc la chauffe n'a pas d'étiquette du tout.
    expect(etiquettes(blocs[0])).toEqual(['', '', '1', '2']);
    expect(blocs[0].series.map(s => s.estTravail)).toEqual([false, false, true, true]);
    expect(blocs[0].nbTravail).toBe(2);
  });

  test('degressive et echec suivent la même règle que l’échauffement', () => {
    const blocs = Modele.construireBlocs([
      saisie({ rang: 1, exercise_slug: 'el', groupe_superset: 1 }),
      saisie({ rang: 2, exercise_slug: 'el', groupe_superset: 1, type_serie: 'degressive' }),
      saisie({ rang: 3, exercise_slug: 'ec', groupe_superset: 1 }),
      saisie({ rang: 4, exercise_slug: 'ec', groupe_superset: 1, type_serie: 'echec' })
    ], CATALOGUE);
    // Aucune ne porte de libellé de type : la lettre seule, le style fera le reste.
    expect(etiquettes(blocs[0])).toEqual(['A1', 'A', 'B1', 'B']);
    expect(blocs[0].nbTravail).toBe(2);
  });
});

// ── 5. Anomalie connue : superset à un seul exercice ────────────────────────
describe('anomalie des 13 blocs superset à un seul exercice', () => {
  test('§5.9 — traité comme un bloc simple, sans lettre', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, exercise_slug: 'dc', groupe_superset: 7 }),
      serie({ rang: 2, exercise_slug: 'dc', groupe_superset: 7 }),
      serie({ rang: 3, exercise_slug: 'dc', groupe_superset: 7 })
    ], CATALOGUE);

    expect(blocs).toHaveLength(1);
    expect(blocs[0].superset).toBe(false);
    expect(blocs[0].exercices[0].lettre).toBe('');
    expect(etiquettes(blocs[0])).toEqual(['1', '2', '3']);
  });
});

// ── Ordre : rang, jamais validee_a ──────────────────────────────────────────
describe('trierParRang', () => {
  test('IGNORE validee_a : un ordre chronologique inverse ne change rien', () => {
    const brut = [
      serie({ rang: 1, validee_a: '2026-01-01T12:00:00Z' }),
      serie({ rang: 2, validee_a: '2026-01-01T11:00:00Z' }),
      serie({ rang: 3, validee_a: '2026-01-01T10:00:00Z' })
    ];
    expect(Modele.trierParRang(brut).map(s => s.rang)).toEqual([1, 2, 3]);
  });

  test('ne mute pas le tableau reçu', () => {
    const brut = [serie({ rang: 2 }), serie({ rang: 1 })];
    Modele.trierParRang(brut);
    expect(brut.map(s => s.rang)).toEqual([2, 1]);
  });
});

// ── Formatage des unités ────────────────────────────────────────────────────
describe('formatDuree — bornes incluses', () => {
  test.each([
    [null, ''], [0, '0 s'], [45, '45 s'],
    [59, '59 s'],
    [60, '1 min'],                 // borne : 60 s bascule en minutes
    [90, '1 min 30'],
    [750, '12 min 30'],
    [3540, '59 min'],              // borne : 59 min reste en minutes
    [3600, '1 h'],                 // borne : 60 min bascule en heures
    [23715, '6 h 35'],             // le cas réel « Alpes du Liechtenstein »
    [3900, '1 h 05']               // minutes < 10 sur deux chiffres
  ])('%s s → « %s »', (entree, attendu) => {
    expect(Modele.formatDuree(entree)).toBe(attendu);
  });
});

describe('formatDistance — bornes incluses', () => {
  test.each([
    [null, ''], [0, '0 m'], [850, '850 m'],
    [999, '999 m'],                // borne : sous 1 000 m, en mètres
    [1000, '1 km'],                // borne : à 1 000 m, en kilomètres
    [1500, '1,5 km'],
    [22660, '22,7 km'],            // le cas réel « Alpes du Liechtenstein »
    [12930, '12,9 km']
  ])('%s m → « %s »', (entree, attendu) => {
    expect(Modele.formatDistance(entree)).toBe(attendu);
  });

  test('le séparateur décimal est la virgule, jamais le point', () => {
    expect(Modele.formatDistance(22660)).not.toContain('.');
    expect(Modele.formatDistance(22660)).toContain(',');
  });
});

describe('formatMesure', () => {
  test('charge et reps : « 52 kg × 12 », virgule pour les décimaux', () => {
    expect(Modele.formatMesure(serie({ charge_kg: 52, reps: 12 }))).toBe('52 kg × 12');
    expect(Modele.formatMesure(serie({ charge_kg: 122.5, reps: 5 }))).toBe('122,5 kg × 5');
  });

  test('une sortie : plus jamais « 23715 s 22660 m »', () => {
    const rendu = Modele.formatMesure(serie({
      charge_kg: null, reps: null, duree_s: 23715, distance_m: 22660 }));
    expect(rendu).toBe('6 h 35 · 22,7 km');
    expect(rendu).not.toMatch(/\d+ s\b/);
    expect(rendu).not.toMatch(/\d+ m\b/);
  });

  test('une série sans rien affiche un tiret, pas du vide', () => {
    expect(Modele.formatMesure(serie({ charge_kg: null, reps: null }))).toBe('—');
  });
});

// ── Sorties ─────────────────────────────────────────────────────────────────
describe('estExerciceSortie — critère établi par lecture du catalogue', () => {
  test.each([
    ['rando', true], ['pilates', true], ['planche', true],
    ['dc', false], ['el', false]
  ])('%s → sortie : %s', (slug, attendu) => {
    const exo = CATALOGUE.filter(e => e.slug === slug)[0];
    expect(Modele.estExerciceSortie(exo)).toBe(attendu);
  });
});

describe('resumerSeance', () => {
  test('une rando se résume en durée et distance, pas en séries', () => {
    const r = Modele.resumerSeance(
      { id: 'x', titre: 'Alpes du Liechtenstein', debut: '2026-07-30T08:00:00Z' },
      [serie({ rang: 1, exercise_slug: 'rando', charge_kg: null, reps: null,
               duree_s: 23715, distance_m: 22660 })],
      CATALOGUE);

    expect(r.estSortie).toBe(true);
    expect(Modele.formatDuree(r.dureeTotale)).toBe('6 h 35');
    expect(Modele.formatDistance(r.distanceTotale)).toBe('22,7 km');
  });

  test('une séance qui mêle rando et muscu n’est PAS une sortie', () => {
    // Cas réel « Rando avec Léa + Pull 💪🏻 » : elle garde une carte pleine.
    const r = Modele.resumerSeance({ id: 'y', titre: 'Rando avec Léa + Pull' }, [
      serie({ rang: 1, exercise_slug: 'rando', charge_kg: null, reps: null, duree_s: 3600, distance_m: 4800 }),
      serie({ rang: 2, exercise_slug: 'dc', charge_kg: 60, reps: 10 })
    ], CATALOGUE);

    expect(r.estSortie).toBe(false);
    expect(r.nbExercices).toBe(2);
  });

  test('une séance de musculation reste comptée en séries de travail', () => {
    const r = Modele.resumerSeance(
      { id: 'z', titre: 'Haut du corps', salle_norme: 'Basic-Fit Guebwiller' },
      [serie({ rang: 1, type_serie: 'echauffement' }), serie({ rang: 2 }), serie({ rang: 3, exercise_slug: 'ec' })],
      CATALOGUE);

    expect(r.estSortie).toBe(false);
    expect(r.nbExercices).toBe(2);
    expect(r.nbSeriesTravail).toBe(2);
    expect(r.salle).toBe('Basic-Fit Guebwiller');
  });

  test('une séance vide n’est pas une sortie', () => {
    expect(Modele.resumerSeance({ id: 'v', titre: null }, [], CATALOGUE).estSortie).toBe(false);
  });
});

// ── Cas limites ─────────────────────────────────────────────────────────────
describe('cas limites', () => {
  test('une séance vide ne produit aucun bloc', () => {
    expect(Modele.construireBlocs([], CATALOGUE)).toEqual([]);
  });

  test('un catalogue absent ne fait pas échouer le rendu', () => {
    const blocs = Modele.construireBlocs([serie({ rang: 1 })], null);
    expect(blocs[0].exercices[0].nom).toBe('dc');
  });

  test('le même exercice repris plus loin ouvre un second bloc', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, exercise_slug: 'dc' }),
      serie({ rang: 2, exercise_slug: 'ec' }),
      serie({ rang: 3, exercise_slug: 'dc' })
    ], CATALOGUE);
    expect(blocs).toHaveLength(3);
  });
});

// ── Aperçu de séance (ECRAN-SAISIE §7 bis.5) ───────────────────────────────
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : une séance à UN ou DEUX
// exercices. Sur une séance à six, « prend les trois premiers » et « annonce le
// reste » sont vrais quoi qu'il arrive — il reste toujours un reste à annoncer.
// C'est en dessous de trois que « et 0 autres » et la ligne vide apparaissent.
describe('apercuExercices — les trois premiers, dans l’ordre de la séance', () => {
  const CATALOGUE = [
    { slug: 'dc', nom: 'Développé Couché (Barre)' },
    { slug: 'row', nom: 'Rowing Assis (Machine)' },
    { slug: 'ec', nom: 'Écarté (Machine)' },
    { slug: 'sq', nom: 'Squat (Barre)' },
    { slug: 'curl', nom: 'Curl Poignets Paumes vers le Haut Assis' }
  ];
  // Les séries sont volontairement dans le désordre : c'est `rang` qui décide.
  const seance = (slugs) => slugs.map((s, i) => ({
    exercise_slug: s, rang: i + 1, type_serie: 'travail'
  })).reverse();

  test('six exercices : trois nommés, « et 3 autres »', () => {
    const a = Modele.apercuExercices(seance(['dc', 'row', 'ec', 'sq', 'curl', 'dc']), CATALOGUE);
    expect(a.tete.map((e) => e.nom)).toEqual([
      'Développé Couché (Barre)', 'Rowing Assis (Machine)', 'Écarté (Machine)'
    ]);
    expect(a.autres).toBe(2);   // 5 exercices distincts - 3
  });

  test('l’ordre vient de `rang`, pas de l’ordre d’arrivée des séries', () => {
    const a = Modele.apercuExercices(seance(['sq', 'dc', 'row']), CATALOGUE);
    expect(a.tete.map((e) => e.slug)).toEqual(['sq', 'dc', 'row']);
  });

  test('un exercice répété ne compte qu’une fois, à sa première position', () => {
    const a = Modele.apercuExercices(seance(['dc', 'dc', 'row', 'dc', 'ec']), CATALOGUE);
    expect(a.tete.map((e) => e.slug)).toEqual(['dc', 'row', 'ec']);
    expect(a.autres).toBe(0);
  });

  // ↓ la configuration discriminante
  test.each([[1], [2], [3]])('séance à %i exercice(s) : autres vaut 0, jamais négatif', (n) => {
    const a = Modele.apercuExercices(seance(['dc', 'row', 'ec'].slice(0, n)), CATALOGUE);
    expect(a.tete).toHaveLength(n);
    expect(a.autres).toBe(0);
  });

  test('une séance sans série ne produit ni tête ni reste', () => {
    expect(Modele.apercuExercices([], CATALOGUE)).toEqual({ tete: [], autres: 0 });
    expect(Modele.apercuExercices(null, null)).toEqual({ tete: [], autres: 0 });
  });

  test('un slug absent du catalogue ne casse rien', () => {
    const a = Modele.apercuExercices(seance(['inconnu']), CATALOGUE);
    expect(a.tete).toHaveLength(1);
    expect(typeof a.tete[0].nom).toBe('string');
  });
});

describe('resumerSeance — l’aperçu suit la carte', () => {
  const CAT = [
    { slug: 'dc', nom: 'Développé Couché (Barre)' },
    { slug: 'rando', nom: 'Randonnée', charge: 'aucune', mesure: 'distance_temps' }
  ];
  test('une séance de musculation porte son aperçu', () => {
    const r = Modele.resumerSeance({ id: 'x', titre: 'Pecs' },
      [{ exercise_slug: 'dc', rang: 1, type_serie: 'travail' }], CAT);
    expect(r.estSortie).toBe(false);
    expect(r.apercu.tete.map((e) => e.nom)).toEqual(['Développé Couché (Barre)']);
  });

  test('une randonnée n’a AUCUN aperçu d’exercices — carte évidée', () => {
    const r = Modele.resumerSeance({ id: 'y', titre: 'Rando' },
      [{ exercise_slug: 'rando', rang: 1, duree_s: 6480, distance_m: 8400 }], CAT);
    expect(r.estSortie).toBe(true);
    expect(r.apercu).toBeNull();
    expect(r.dureeTotale).toBe(6480);
  });
});

// ── « et N autres exercices » — les deux mots s'accordent ──────────────────
describe('libelleAutres — le compte et le pluriel', () => {
  test.each([
    [0, ''], [-1, ''], [null, ''], [undefined, ''],
    [1, 'et 1 autre exercice'],
    [2, 'et 2 autres exercices'],
    [5, 'et 5 autres exercices']
  ])('%p -> %p', (n, attendu) => {
    expect(Modele.libelleAutres(n)).toBe(attendu);
  });

  test('« et 0 autres » n’apparaît jamais — la phrase est vide, pas nulle', () => {
    expect(Modele.libelleAutres(0)).toBe('');
  });

  // Configuration discriminante : à 1, « autre exercice » et « autres
  // exercices » diffèrent. À 3, seul le premier mot départage — un accord
  // fautif sur le second passerait inaperçu.
  test('à UN autre, le second mot est au singulier lui aussi', () => {
    expect(Modele.libelleAutres(1)).not.toMatch(/exercices/);
    expect(Modele.libelleAutres(1).endsWith('exercice')).toBe(true);
  });

  test('le compte suit le nombre réel d’exercices de la séance', () => {
    const CAT = [1, 2, 3, 4, 5].map((i) => ({ slug: 'e' + i, nom: 'Exercice ' + i }));
    const seance = (n) => CAT.slice(0, n).map((e, i) => ({
      exercise_slug: e.slug, rang: i + 1, type_serie: 'travail'
    }));
    [[1, ''], [2, ''], [3, ''], [4, 'et 1 autre exercice'], [5, 'et 2 autres exercices']]
      .forEach(([n, attendu]) => {
        const a = Modele.apercuExercices(seance(n), CAT);
        expect(a.tete.length).toBe(Math.min(n, 3));
        expect(Modele.libelleAutres(a.autres)).toBe(attendu);
      });
  });
});

// ── Une séance sans série en cache est incomplète, pas vide ────────────────
describe('resumerSeance — le manque se dit, il ne se déguise pas', () => {
  const CAT = [
    { slug: 'dc', nom: 'Développé Couché' },
    { slug: 'rando', nom: 'Randonnée', charge: 'aucune', mesure: 'distance_temps' }
  ];

  test('aucune série en cache → incomplète, et PAS une sortie', () => {
    const r = Modele.resumerSeance({ id: 'x', titre: 'Pecs' }, [], CAT);
    expect(r.incomplet).toBe(true);
    // Sans ça, elle passerait pour une séance vide légitime — ou pire, pour
    // une sortie, puisque « aucun exercice » satisfait vacuement le critère.
    expect(r.estSortie).toBe(false);
    expect(r.nbExercices).toBe(0);
  });

  test('une séance avec ses séries n’est pas incomplète', () => {
    const r = Modele.resumerSeance({ id: 'y', titre: 'Pecs' },
      [{ exercise_slug: 'dc', rang: 1, type_serie: 'travail' }], CAT);
    expect(r.incomplet).toBe(false);
  });

  test('une randonnée complète reste une sortie', () => {
    const r = Modele.resumerSeance({ id: 'z', titre: 'Rando' },
      [{ exercise_slug: 'rando', rang: 1, duree_s: 6480, distance_m: 8400 }], CAT);
    expect(r.incomplet).toBe(false);
    expect(r.estSortie).toBe(true);
  });
});
