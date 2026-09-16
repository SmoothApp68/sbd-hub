//
// Chantier 38 — le fantôme qui propose une charge d'échauffement (D9).
//
// Le fantôme s'alignait par INDICE, chauffes comprises. Séance précédente
// `40(W) · 70(W) · 120 · 120 · 120`, séance d'aujourd'hui sans chauffe : le
// fantôme de la PREMIÈRE SÉRIE DE TRAVAIL valait 40 kg. Et comme le §3 bis.3
// vend « valider sans rien taper quand c'est juste », l'utilisateur faisait
// exactement ce que l'app lui proposait — et écrivait une charge d'échauffement
// comme charge de travail.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : une séance précédente
// AVEC des chauffes et une séance actuelle qui en a MOINS.
//
// ⚠️ Avec le même nombre de chauffes des deux côtés, « aligner par indice » et
// « aligner par type » donnent EXACTEMENT le même fantôme. C'est le seul cas
// qu'on teste spontanément, et c'est ce qui a laissé passer le défaut — d'où le
// test témoin explicite plus bas.
//
// Environnement jsdom (PAS de docblock `node`) : `v2/js/modele.js` se termine
// par `this`, que Babel remplace par `undefined` sous l'environnement node.

const Seance = require('../../v2/js/seance.js');

let n = 0;
const uuid = () => 'id-' + (++n);
beforeEach(() => { n = 0; });

// Une série TELLE QUE `precedent` la rend — elle porte son `type_serie`.
const p = (charge, reps, type) => ({
  charge_kg: charge, reps: reps, duree_s: null, distance_m: null,
  type_serie: type || 'travail'
});
const prec = (series) => ({ seance: { id: 'p1' }, series: series });

// Deux chauffes, puis trois séries de travail.
//
// ⚠️ DES CHARGES DE TRAVAIL DISTINCTES, et c'est délibéré. Avec `120 · 120 ·
// 120` — les valeurs de l'audit — « prendre la Nᵉ série de son type » et
// « prendre toujours la première » rendent exactement la même chose : le RANG
// dans le type ne se mesure pas. Le cas littéral est gardé plus bas.
const AVEC_CHAUFFES = () => prec([
  p(40, 10, 'echauffement'), p(70, 5, 'echauffement'),
  p(120, 5), p(125, 5), p(130, 4)
]);

// Une séance d'aujourd'hui : `types` donne le type de chaque série.
const seanceDe = (types) => {
  let s = Seance.creer({ id: 's1', userId: 'u1', idSerie: uuid });
  s = Seance.ajouterExercice(s, 'squat-barre', uuid);
  for (let k = 1; k < types.length; k++) s = Seance.ajouterSerie(s, 0, uuid);
  types.forEach((t, i) => { s = Seance.changerType(s, 0, i, t); });
  return s;
};
const charges = (s, pr) => s.exercices[0].series
  .map((_, i) => Seance.fantome(s, 0, i, pr).charge_kg);

// ── LE DÉFAUT, ET SA CORRECTION ───────────────────────────────────────────
describe('⚠️ moins de chauffes aujourd’hui qu’à la séance précédente', () => {
  test('la 1ʳᵉ série de travail prend la 1ʳᵉ série de TRAVAIL, jamais la chauffe', () => {
    const s = seanceDe(['travail', 'travail', 'travail']);
    expect(charges(s, AVEC_CHAUFFES())).toEqual([120, 125, 130]);
  });

  test('et les reps suivent la même règle', () => {
    const s = seanceDe(['travail', 'travail', 'travail']);
    expect(Seance.fantome(s, 0, 0, AVEC_CHAUFFES()).reps).toBe(5);
    expect(Seance.fantome(s, 0, 2, AVEC_CHAUFFES()).reps).toBe(4);
  });

  test('UNE chauffe aujourd’hui contre DEUX avant : elle prend la première', () => {
    const s = seanceDe(['echauffement', 'travail', 'travail', 'travail']);
    expect(charges(s, AVEC_CHAUFFES())).toEqual([40, 120, 125, 130]);
  });

  test('PLUS de chauffes aujourd’hui : la troisième n’a pas de correspondant', () => {
    const s = seanceDe(['echauffement', 'echauffement', 'echauffement', 'travail']);
    expect(charges(s, AVEC_CHAUFFES())).toEqual([40, 70, null, 120]);
  });

  // Le cas EXACT de l'audit : `40(W) · 70(W) · 120 · 120 · 120`.
  test('le cas littéral de l’audit : 40 proposé pour la 1ʳᵉ série de travail', () => {
    const audit = prec([p(40, 10, 'echauffement'), p(70, 5, 'echauffement'),
                        p(120, 5), p(120, 5), p(120, 4)]);
    const s = seanceDe(['travail', 'travail', 'travail']);
    expect(charges(s, audit)).toEqual([120, 120, 120]);
  });
});

// ── LE TÉMOIN — CE QUI NE DOIT RIEN CHANGER ───────────────────────────────
describe('le témoin : même nombre de chauffes des deux côtés', () => {
  test('⚠️ les deux implémentations donnent le MÊME fantôme — d’où le défaut', () => {
    const s = seanceDe(['echauffement', 'echauffement', 'travail', 'travail', 'travail']);
    expect(charges(s, AVEC_CHAUFFES())).toEqual([40, 70, 120, 125, 130]);
  });
});

// ── LES TROIS CAS TRANCHÉS — UNE SEULE RÈGLE ──────────────────────────────
//
// Pas de correspondant du même type au même rang → PAS de fantôme. Reporter la
// dernière valeur connue serait une PRÉDICTION, et c'est exactement ce qui a
// créé ce défaut. Rien n'est prédit ici (§ « le moteur parlera au chantier 5 »).
describe('sans correspondant, pas de fantôme', () => {
  test('plus de séries de travail qu’avant : la 4ᵉ est vide', () => {
    const s = seanceDe(['travail', 'travail', 'travail', 'travail']);
    expect(charges(s, AVEC_CHAUFFES())).toEqual([120, 125, 130, null]);
  });

  test('aucune série de travail la fois précédente : rien à proposer', () => {
    const rienQueDesChauffes = prec([p(40, 10, 'echauffement'), p(50, 8, 'echauffement')]);
    const s = seanceDe(['travail', 'travail']);
    expect(charges(s, rienQueDesChauffes)).toEqual([null, null]);
  });

  test('aucune chauffe la fois précédente : la chauffe d’aujourd’hui est vide', () => {
    const rienQueDuTravail = prec([p(100, 5), p(100, 5)]);
    const s = seanceDe(['echauffement', 'travail']);
    expect(charges(s, rienQueDuTravail)).toEqual([null, 100]);
  });

  test('première fois sur l’exercice : non-régression, rien ne change', () => {
    const s = seanceDe(['echauffement', 'travail', 'travail']);
    expect(charges(s, null)).toEqual([null, null, null]);
    expect(charges(s, { seance: {}, series: [] })).toEqual([null, null, null]);
  });
});

// ── LES QUATRE TYPES, PAS DEUX ────────────────────────────────────────────
describe('la règle vaut pour les quatre types', () => {
  const QUATRE = () => prec([
    p(40, 10, 'echauffement'), p(120, 5, 'travail'),
    p(90, 8, 'degressive'), p(120, 2, 'echec')
  ]);

  test('une dégressive ne propose pas une charge de travail', () => {
    const s = seanceDe(['degressive']);
    expect(charges(s, QUATRE())).toEqual([90]);
  });

  test('une série d’échec s’aligne sur une série d’échec', () => {
    const s = seanceDe(['echec']);
    expect(charges(s, QUATRE())).toEqual([120]);
  });

  test('et chaque type trouve le sien, quel que soit l’ordre d’aujourd’hui', () => {
    const s = seanceDe(['echec', 'degressive', 'travail', 'echauffement']);
    expect(charges(s, QUATRE())).toEqual([120, 90, 120, 40]);
  });

  test('un type absent de la fois précédente ne retombe pas sur un autre', () => {
    const sansDegressive = prec([p(40, 10, 'echauffement'), p(120, 5, 'travail')]);
    const s = seanceDe(['degressive']);
    expect(charges(s, sansDegressive)).toEqual([null]);
  });
});

// ── CE QUI NE CHANGE PAS ──────────────────────────────────────────────────
describe('la saisie de la séance en cours prime toujours', () => {
  test('ce qu’on vient de taper l’emporte sur la fois précédente', () => {
    let s = seanceDe(['travail', 'travail', 'travail']);
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 125 });
    // La 1ʳᵉ garde son fantôme d'historique ; les suivantes reprennent 125.
    expect(charges(s, AVEC_CHAUFFES())).toEqual([120, 125, 125]);
  });

  // ⚠️ ET C'EST CE QUI REND « FANTÔME VIDE » SUPPORTABLE. Une 4ᵉ série sans
  // correspondant reprend ce qu'on a tapé dans la séance, pas rien.
  test('la 4ᵉ série sans correspondant reprend la saisie du jour', () => {
    let s = seanceDe(['travail', 'travail', 'travail', 'travail']);
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 125 });
    expect(charges(s, AVEC_CHAUFFES())).toEqual([120, 125, 125, 125]);
  });

  // ⚠️ L'INTENTION EST SUR LA LIGNE depuis le chantier 43 : `ajouterExercice`
  // la pose sur la série qu'il crée, pas sur l'exercice. Le fantôme lit celle
  // de SA ligne — une rampe programmée a une intention par ligne.
  test('les reps visées de la routine priment sur l’historique', () => {
    let s = Seance.creer({ id: 's1', userId: 'u1', idSerie: uuid });
    s = Seance.ajouterExercice(s, 'squat-barre', uuid, { reps_visees: 8 });
    expect(Seance.fantome(s, 0, 0, AVEC_CHAUFFES()).reps).toBe(8);
    expect(Seance.fantome(s, 0, 0, AVEC_CHAUFFES()).charge_kg).toBe(120);
  });

  test('durée et distance suivent la même règle que la charge', () => {
    const cardio = prec([
      { charge_kg: null, reps: null, duree_s: 300, distance_m: 1000, type_serie: 'echauffement' },
      { charge_kg: null, reps: null, duree_s: 1800, distance_m: 5000, type_serie: 'travail' }
    ]);
    const s = seanceDe(['travail']);
    const f = Seance.fantome(s, 0, 0, cardio);
    expect(f.duree_s).toBe(1800);
    expect(f.distance_m).toBe(5000);
  });
});

// ── `correspondant`, pris isolément ───────────────────────────────────────
describe('`correspondant`', () => {
  const exoDe = (types) => seanceDe(types).exercices[0];

  test('rend la ligne, pas une copie appauvrie', () => {
    const pr = AVEC_CHAUFFES();
    expect(Seance.correspondant(exoDe(['travail']), 0, pr)).toBe(pr.series[2]);
  });

  test('sans précédent, rend null sans lever', () => {
    expect(Seance.correspondant(exoDe(['travail']), 0, null)).toBeNull();
    expect(Seance.correspondant(exoDe(['travail']), 0, {})).toBeNull();
  });

  // ⚠️ `sets.type_serie` est NULLABLE en base : le CHECK rejette une valeur
  // invalide, pas l'absence. Une ligne sans type est traitée comme du travail,
  // des DEUX côtés — c'est le défaut de `serieVide` et celui d'`estTravail`.
  test('une ligne sans `type_serie` compte comme du travail, des deux côtés', () => {
    const sansType = prec([
      { charge_kg: 40, reps: 10, type_serie: 'echauffement' },
      { charge_kg: 110, reps: 5 }
    ]);
    const s = seanceDe(['travail']);
    expect(charges(s, sansType)).toEqual([110]);
  });
});
