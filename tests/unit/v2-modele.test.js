// tests/unit/v2-modele.test.js — socle v2, module pur de transformation.
//
// Ce que ces tests verrouillent :
//   · l'ordre d'affichage vient de `rang`, jamais de `validee_a` ;
//   · les séries se regroupent en blocs (superset ou exercice simple) ;
//   · `type_serie` distingue le travail du reste.

const Modele = require('../../v2/js/modele.js');

// Fabrique une ligne `sets` conforme au schéma réel.
function serie(o) {
  return Object.assign({
    id: 's' + (o.rang || 0),
    session_id: 'sess-1',
    exercise_slug: 'developpe-couche-barre',
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

const CATALOGUE = [
  { slug: 'developpe-couche-barre', nom: 'Développé couché barre' },
  { slug: 'elevation-laterale-haltere', nom: 'Élévation latérale haltère' },
  { slug: 'ecarte-haltere', nom: 'Écarté haltère' },
  { slug: 'extension-triceps-poulie', nom: 'Extension triceps poulie' }
];

describe('trierParRang', () => {
  test('ordonne par rang croissant même si les lignes arrivent dans le désordre', () => {
    const brut = [serie({ rang: 3 }), serie({ rang: 1 }), serie({ rang: 2 })];
    expect(Modele.trierParRang(brut).map(s => s.rang)).toEqual([1, 2, 3]);
  });

  test('IGNORE validee_a : un ordre chronologique inverse ne change rien', () => {
    // Fixture piégée : validee_a est ordonné à l'envers de rang. Un tri qui
    // retomberait sur la chronologie renverrait [3,2,1] et ferait échouer ce test.
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

  test('une ligne sans rang exploitable part en fin, sans écraser les autres', () => {
    const brut = [serie({ rang: 2 }), serie({ rang: null }), serie({ rang: 1 })];
    expect(Modele.trierParRang(brut).map(s => s.rang)).toEqual([1, 2, null]);
  });
});

describe('construireBlocs — bloc simple', () => {
  test('trois séries du même exercice forment un seul bloc non-superset', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1 }), serie({ rang: 2 }), serie({ rang: 3 })
    ], CATALOGUE);

    expect(blocs).toHaveLength(1);
    expect(blocs[0].superset).toBe(false);
    expect(blocs[0].exercices).toHaveLength(1);
    expect(blocs[0].exercices[0].nom).toBe('Développé couché barre');
    expect(blocs[0].exercices[0].lettre).toBe('A');
    expect(blocs[0].nbTravail).toBe(3);
  });

  test('le même exercice repris plus loin ouvre un second bloc', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, exercise_slug: 'developpe-couche-barre' }),
      serie({ rang: 2, exercise_slug: 'ecarte-haltere' }),
      serie({ rang: 3, exercise_slug: 'developpe-couche-barre' })
    ], CATALOGUE);

    expect(blocs).toHaveLength(3);
    expect(blocs.map(b => b.exercices[0].slug)).toEqual([
      'developpe-couche-barre', 'ecarte-haltere', 'developpe-couche-barre'
    ]);
  });
});

describe('construireBlocs — superset', () => {
  test('un groupe_superset partagé réunit trois exercices en un bloc, lettres A/B/C', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, groupe_superset: 1, exercise_slug: 'elevation-laterale-haltere' }),
      serie({ rang: 2, groupe_superset: 1, exercise_slug: 'ecarte-haltere' }),
      serie({ rang: 3, groupe_superset: 1, exercise_slug: 'extension-triceps-poulie' }),
      serie({ rang: 4, groupe_superset: 1, exercise_slug: 'elevation-laterale-haltere' })
    ], CATALOGUE);

    expect(blocs).toHaveLength(1);
    expect(blocs[0].superset).toBe(true);
    expect(blocs[0].exercices.map(x => x.lettre)).toEqual(['A', 'B', 'C']);
    expect(blocs[0].exercices.map(x => x.nom)).toEqual([
      'Élévation latérale haltère', 'Écarté haltère', 'Extension triceps poulie'
    ]);
    // 4 séries réparties : A en a deux, B et C une chacune.
    expect(blocs[0].exercices.map(x => x.series.length)).toEqual([2, 1, 1]);
    expect(blocs[0].resume).toBe('Superset · 4 séries de travail');
  });

  test('un superset et un bloc simple ne se mélangent pas', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, groupe_superset: null, exercise_slug: 'developpe-couche-barre' }),
      serie({ rang: 2, groupe_superset: 2, exercise_slug: 'ecarte-haltere' }),
      serie({ rang: 3, groupe_superset: 2, exercise_slug: 'extension-triceps-poulie' })
    ], CATALOGUE);

    expect(blocs).toHaveLength(2);
    expect(blocs[0].superset).toBe(false);
    expect(blocs[1].superset).toBe(true);
  });

  test('deux groupes de superset distincts font deux blocs', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, groupe_superset: 1, exercise_slug: 'elevation-laterale-haltere' }),
      serie({ rang: 2, groupe_superset: 1, exercise_slug: 'ecarte-haltere' }),
      serie({ rang: 3, groupe_superset: 2, exercise_slug: 'extension-triceps-poulie' }),
      serie({ rang: 4, groupe_superset: 2, exercise_slug: 'developpe-couche-barre' })
    ], CATALOGUE);
    expect(blocs).toHaveLength(2);
  });
});

describe('construireBlocs — type_serie', () => {
  test("l'échauffement est marqué, compté à part, et n'entre pas dans la numérotation", () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, type_serie: 'echauffement', charge_kg: 60, reps: 10 }),
      serie({ rang: 2, type_serie: 'echauffement', charge_kg: 100, reps: 5 }),
      serie({ rang: 3, type_serie: 'travail' }),
      serie({ rang: 4, type_serie: 'travail' })
    ], CATALOGUE);

    expect(blocs).toHaveLength(1);
    expect(blocs[0].series.map(s => s.estTravail)).toEqual([false, false, true, true]);
    // Les deux séries de travail sont A1 et A2 : la chauffe ne consomme pas de numéro.
    expect(blocs[0].series.map(s => s.etiquette))
      .toEqual(['Échauffement', 'Échauffement', 'A1', 'A2']);
    expect(blocs[0].nbTravail).toBe(2);
    expect(blocs[0].resume).toBe('2 séries de travail');
  });

  test('les quatre valeurs réelles de type_serie sont reconnues', () => {
    const blocs = Modele.construireBlocs([
      serie({ rang: 1, type_serie: 'travail' }),
      serie({ rang: 2, type_serie: 'echauffement' }),
      serie({ rang: 3, type_serie: 'degressive' }),
      serie({ rang: 4, type_serie: 'echec' })
    ], CATALOGUE);
    expect(blocs[0].series.map(s => s.libelleType))
      .toEqual(['Travail', 'Échauffement', 'Dégressive', 'Échec']);
    expect(blocs[0].nbTravail).toBe(1);
  });
});

describe('nommage des exercices', () => {
  test('le nom lisible vient de exercises.nom via exercise_slug', () => {
    const blocs = Modele.construireBlocs(
      [serie({ rang: 1, exercise_slug: 'ecarte-haltere' })], CATALOGUE);
    expect(blocs[0].exercices[0].nom).toBe('Écarté haltère');
  });

  test('un slug absent du catalogue retombe sur le slug, jamais sur du vide', () => {
    const blocs = Modele.construireBlocs(
      [serie({ rang: 1, exercise_slug: 'exo-inconnu' })], CATALOGUE);
    expect(blocs[0].exercices[0].nom).toBe('exo-inconnu');
  });
});

describe('resumerSeance', () => {
  test('compte les exercices distincts et les seules séries de travail', () => {
    const r = Modele.resumerSeance(
      { id: 'sess-1', titre: 'Haut du corps', debut: '2026-07-30T18:00:00Z', salle_norme: 'Basic-Fit Guebwiller' },
      [
        serie({ rang: 1, type_serie: 'echauffement' }),
        serie({ rang: 2, type_serie: 'travail' }),
        serie({ rang: 3, type_serie: 'travail', exercise_slug: 'ecarte-haltere' })
      ]);
    expect(r.nbExercices).toBe(2);
    expect(r.nbSeriesTravail).toBe(2);
    expect(r.titre).toBe('Haut du corps');
    expect(r.salle).toBe('Basic-Fit Guebwiller');
  });

  test('une séance sans titre reçoit un libellé de repli', () => {
    const r = Modele.resumerSeance({ id: 'x', titre: null, debut: '2026-07-30T18:00:00Z' }, []);
    expect(r.titre).toBe('Séance');
    expect(r.nbExercices).toBe(0);
  });
});

describe('cas limites', () => {
  test('une séance vide ne produit aucun bloc', () => {
    expect(Modele.construireBlocs([], CATALOGUE)).toEqual([]);
  });

  test('un catalogue absent ne fait pas échouer le rendu', () => {
    const blocs = Modele.construireBlocs([serie({ rang: 1 })], null);
    expect(blocs[0].exercices[0].nom).toBe('developpe-couche-barre');
  });
});
