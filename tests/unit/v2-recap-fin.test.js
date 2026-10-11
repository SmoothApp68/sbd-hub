/**
 * 71 (ECRAN-SAISIE §7 septies.4 bis) — le récap de fin de séance.
 *
 * Ce que ce fichier prouve :
 *   · la comparaison rend, règle pour règle, ce que rend `fixtures/comparaison71.py` : ses dix cas, et 1 000 cas
 *     tirés une fois de la référence (`fixtures/cas-71-comparaison.json`) ; la même séance donne le même objet ;
 *   · le compte des paris, extrait de `bilanDuMois`, rend les mêmes vérifiés et tenus que la boucle d'avant ;
 *     le bilan du mois ne change pas d'un chiffre ;
 *   · `phraseParis` : les chiffres tels quels pour le récap, « ramenée à 10 » pour le bilan, inchangé ;
 *   · les faits du récap, sur une séance d'exemple : séries, volume, muscles, records (avec la phrase de la
 *     médaille), paris (« 9, 9, 8, 7 · visé 9 »), lignes par exercice ; un bloc sans matière n'a pas de données.
 */
const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
require('../../v2/js/periode.js');
const Faits = require('../../v2/js/faits.js');
const CAS = require('./fixtures/cas-71-comparaison.json');

const ID = (n) => 'e0b1c2d3-0000-4000-8000-00000000000' + n;

describe('71 — la comparaison (règle pour règle `comparaison71.py`)', () => {
  test('les dix cas de la référence', () => {
    expect(Bilan.comparaison(999, 'a')).toBeNull();
    expect(Bilan.comparaison(1000, 'a')).toBe('une Mini');
    expect(Bilan.comparaison(10148, ID(1))).toBe('un tricératops');
    expect(Bilan.comparaison(10148, ID(2))).toBe('un Rafale à vide');
    expect(Bilan.comparaison(10148, ID(3))).toBe('un tricératops');
    expect(Bilan.comparaison(20660, ID(1))).toBe('la Savoyarde du Sacré-Cœur');
    expect(Bilan.comparaison(27081, ID(1))).toBe('un camion à trois essieux chargé');
    expect(Bilan.comparaison(36000, 'x')).toBe('une toupie à béton chargée');
    expect(Bilan.comparaison(50000, 'x')).toBe('un Airbus A320 à vide');
    expect(Bilan.comparaison(50001, 'x')).toBe("plus qu'un semi-remorque chargé");
  });

  test('⚠️ 1 000 identifiants à 1 000 volumes de 1 à 50 t : le même objet que la référence', () => {
    expect(CAS.cas).toHaveLength(1000);
    const ecarts = CAS.cas.filter((c) => Bilan.comparaison(c.kg, c.id) !== c.objet);
    expect(ecarts).toEqual([]);
    // La fixture est variée : sinon elle ne prouverait rien sur le choix.
    expect(new Set(CAS.cas.map((c) => c.objet)).size).toBeGreaterThan(30);
  });

  test('⚠️ la même séance donne le même objet, à chaque affichage ; deux séances, souvent deux objets', () => {
    const fois = Array.from({ length: 20 }, () => Bilan.comparaison(10148, ID(2)));
    expect(new Set(fois).size).toBe(1);
    const autres = new Set(Array.from({ length: 30 }, (_, i) => Bilan.comparaison(10148, 'seance-' + i)));
    expect(autres.size).toBeGreaterThan(1);
  });

  test('la table : cinquante objets ; de 1 à 50 t, toujours au moins un à ±20 %', () => {
    expect(Bilan.OBJETS).toHaveLength(50);
    for (let t = 10; t <= 500; t++) {
      const n = Bilan.OBJETS.filter((o) => Math.abs(Math.log(t / 10 / o[1])) <= Math.log(1.2) + 1e-12).length;
      expect([t, n >= 1]).toEqual([t, true]);
    }
  });

  test('FNV-1a 32 bits : les valeurs connues', () => {
    expect(Bilan.fnv1a('')).toBe(0x811c9dc5);
    expect(Bilan.fnv1a('a')).toBe(0xe40c292c);
    expect(Bilan.fnv1a('foobar')).toBe(0xbf9cf968);
  });

  test('la phrase : le volume écrit comme la tuile (« 10,1 t »), « à peu près », et au-delà de 50 t', () => {
    expect(Bilan.phraseComparaison(10148, ID(1))).toBe('10,1 t soulevées : à peu près un tricératops.');
    expect(Bilan.phraseComparaison(62300, 'x')).toBe('62,3 t soulevées : plus qu\'un semi-remorque chargé.');
    expect(Bilan.phraseComparaison(999, 'x')).toBeNull();
    expect(Bilan.tonnesDuRecap(10148)).toBe('10,1 t');
  });
});

describe('71 — les paris : un compte, deux lecteurs', () => {
  // LA BOUCLE D'AVANT L'EXTRACTION, recopiée de `bilanDuMois` (bilan.js, 69) : la référence.
  function avantExtraction(paris, mois) {
    let verifies = 0, tenus = 0;
    (paris || []).forEach((q) => {
      if (!q || Bilan.cleMois(q.date) !== mois) return;
      if (q.observee === null || q.observee === undefined) return;
      const pr = Number(q.predite), ob = Number(q.observee);
      if (!isFinite(pr) || !isFinite(ob)) return;
      verifies++;
      if (ob >= pr) tenus++;
    });
    return { verifies, tenus };
  }
  // Un mois d'exemple : tenus, manqués, égal (tenu), sans observation, illisible, un autre mois.
  const PARIS = [
    { date: '2026-09-02T17:00:00Z', predite: 10, observee: 10 },
    { date: '2026-09-02T17:00:00Z', predite: 10, observee: 11 },
    { date: '2026-09-02T17:00:00Z', predite: 10, observee: 9 },
    { date: '2026-09-09T17:00:00Z', predite: 8, observee: 8 },
    { date: '2026-09-09T17:00:00Z', predite: 8, observee: null },
    { date: '2026-09-16T17:00:00Z', predite: 'x', observee: 8 },
    { date: '2026-09-23T17:00:00Z', predite: 6, observee: 5 },
    { date: '2026-10-01T17:00:00Z', predite: 6, observee: 6 }
  ];

  test('⚠️ `compterParis` rend les mêmes vérifiés et tenus que la boucle d’avant', () => {
    ['2026-09', '2026-10', '2026-08'].forEach((mois) => {
      expect([mois, Bilan.compterParis(PARIS, (q) => Bilan.cleMois(q.date) === mois)])
        .toEqual([mois, avantExtraction(PARIS, mois)]);
    });
    expect(Bilan.compterParis(PARIS, (q) => Bilan.cleMois(q.date) === '2026-09')).toEqual({ verifies: 5, tenus: 3 });
  });

  test('⚠️ le bilan du mois ne change pas d’un chiffre', () => {
    const b = Bilan.bilanDuMois({ mois: '2026-09', seances: [], paris: PARIS, exercices: [] });
    expect([b.paris_verifies, b.paris_tenus]).toEqual([5, 3]);
    expect([b.paris_verifies, b.paris_tenus]).toEqual(Object.values(avantExtraction(PARIS, '2026-09')));
  });

  test('⚠️ tenu = observé ≥ prédit (égal compte), pas observé > prédit', () => {
    expect(Bilan.compterParis([{ predite: 10, observee: 10 }])).toEqual({ verifies: 1, tenus: 1 });
    expect(Bilan.compterParis([{ predite: 10, observee: 9 }])).toEqual({ verifies: 1, tenus: 0 });
  });

  test('`phraseParis` : tels quels pour le récap ; le bilan, inchangé (ramené à 10)', () => {
    expect(Bilan.phraseParis(16, 14, { telsQuels: true })).toBe('Sur 16 paris vérifiés, le coach en a tenu 14.');
    expect(Bilan.phraseParis(16, 14)).toBe('Sur 10 paris vérifiés, le coach en a tenu 9.');
    expect(Bilan.phraseParis(7, 6)).toBe('Sur 7 paris vérifiés, le coach en a tenu 6.');
    expect(Bilan.phraseParis(1, 1, { telsQuels: true })).toBe('Sur 1 pari vérifié, le coach en a tenu 1.');
    expect(Bilan.phraseParis(0, 0, { telsQuels: true })).toBeNull();
  });
});

describe('71 — les faits du récap, sur une séance d’exemple', () => {
  const CATALOGUE = [
    { slug: 'tractions', nom: 'Tractions', mesure: 'reps', charge: 'aucune', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'] },
    { slug: 'shrug', nom: 'Shrug (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['trapezes'], muscles_secondaires: [] },
    { slug: 'curl-marteau', nom: 'Curl marteau (Haltère)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'] },
    { slug: 'tapis', nom: 'Tapis roulant', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] }
  ];
  const ID_SEANCE = 's-recap-71';
  const DEBUT = '2026-10-10T12:27:00Z', FIN = '2026-10-10T13:30:00Z';
  const serie = (id, charge, reps, autre) => Object.assign({ id, type_serie: 'travail', charge_kg: charge, reps,
    duree_s: null, distance_m: null, rpe: null, ressenti: null, note: null, validee_a: DEBUT, repos_s: null, source: 'app' }, autre || {});
  // L'historique : un shrug à 80 × 10 en juin (le 90 × 10 du jour le bat).
  const AVANT = { id: 'avant', user_id: 'u', debut: '2026-06-28T10:00:00Z', fin: '2026-06-28T11:00:00Z', statut: 'terminee', source: 'app' };
  const SERIES_AVANT = [{ id: 'a1', session_id: 'avant', exercise_slug: 'shrug', type_serie: 'travail', charge_kg: 80, reps: 10, rang: 1,
    validee_a: AVANT.debut, source: 'app' }];
  const SEANCE = { id: ID_SEANCE, user_id: 'u', debut: DEBUT, fin: FIN, titre: 'Samedi — Dos et Épaules', note: 'Épaule un peu raide.',
    statut: 'terminee', salle: null, routine_id: null,
    exercices: [
      { exercise_slug: 'tapis', series: [serie('t1', null, null, { type_serie: 'echauffement', duree_s: 300, distance_m: 800 })] },
      { exercise_slug: 'tractions', series: [serie('p1', null, 9), serie('p2', null, 9), serie('p3', null, 8), serie('p4', null, 7)] },
      { exercise_slug: 'shrug', series: [serie('h0', 60, 10, { type_serie: 'echauffement' }), serie('h1', 90, 10), serie('h2', 90, 10), serie('h3', 90, 10)] },
      { exercise_slug: 'curl-marteau', series: [serie('c1', 32, 12), serie('c2', 36, 10), serie('c3', null, null, { validee_a: null })] }
    ] };
  const local = { seances: [SEANCE, AVANT], series: SERIES_AVANT, exercices: CATALOGUE };
  // La séance terminée est dans le cache (adoptée) : ses lignes y sont aussi.
  local.series = SERIES_AVANT.concat(Seance.lignes(SEANCE).map((l) => Object.assign({}, l)));
  const corpus = () => ({ seances: local.seances, series: local.series, exercices: CATALOGUE,
    seriesDe: (id) => local.series.filter((x) => x.session_id === id),
    catalogue: () => { const i = {}; CATALOGUE.forEach((e) => { i[e.slug] = e; }); return i; }, journal: [] });
  const PARIS = [
    // Tractions : visé 9 sur les quatre séries ; 9, 9 tenus, 8 et 7 non.
    { seance: ID_SEANCE, exercice: 'tractions', predite: 9, observee: 9 },
    { seance: ID_SEANCE, exercice: 'tractions', predite: 9, observee: 9 },
    { seance: ID_SEANCE, exercice: 'tractions', predite: 9, observee: 8 },
    { seance: ID_SEANCE, exercice: 'tractions', predite: 9, observee: 7 },
    { seance: ID_SEANCE, exercice: 'shrug', predite: 10, observee: 10 },
    { seance: ID_SEANCE, exercice: 'shrug', predite: 10, observee: 10 },
    // Sans observation : pas vérifié. D'une autre séance : pas d'ici.
    { seance: ID_SEANCE, exercice: 'curl-marteau', predite: 12, observee: null },
    { seance: 'autre', exercice: 'shrug', predite: 10, observee: 2 }
  ];
  const faits = Faits.creer();
  const r = () => faits.recapDeLaSeance(corpus(), SEANCE, PARIS);

  test('l’en-tête et les quatre chiffres : durée, séries de travail, volume, exercices faits', () => {
    const x = r();
    expect(x.titre).toBe('Samedi — Dos et Épaules');
    expect(x.duree_min).toBe(63);
    expect(Modele.formatDuree(x.duree_min * 60)).toBe('1 h 03');
    expect(x.series).toBe(Seance.compter(SEANCE, CATALOGUE).travail);
    expect(x.series).toBe(9);
    // 90 × 10 × 3 + 32 × 12 + 36 × 10 = 2 700 + 384 + 360 (l'échauffement et les tractions ne comptent pas).
    expect(x.volume_kg).toBe(3444);
    expect(x.volume_texte).toBe('3,4 t');
    expect(x.exercices).toBe(3);
    expect(x.phraseVolume).toBe(Bilan.phraseComparaison(3444, ID_SEANCE));
    expect(x.note).toBe('Épaule un peu raide.');
  });

  test('les séries par muscle : la fonction du bloc Volume, les cinq premiers puis « N autres »', () => {
    const x = r();
    const tous = Semaine.volumeParMuscle(Seance.toutesLesSeries(SEANCE).filter((p) => Seance.partEnBase(p.serie))
      .map((p) => Object.assign({}, p.serie, { exercise_slug: p.exo.exercise_slug })), CATALOGUE);
    expect(x.muscles.premiers).toEqual(tous.slice(0, 5).map((m) => ({ libelle: m.libelle, series: m.series })));
    expect(x.muscles.autres).toBeNull();
    // Biceps 4 (curl 2 + la moitié des 4 tractions) et grand dorsal 4, à égalité : par libellé ; trapèzes 3 ;
    // avant-bras 1 (la moitié des 2 curls).
    expect(x.muscles.premiers.map((m) => [m.libelle, m.series])).toEqual([
      [Semaine.libelleMuscle('biceps'), 4], [Semaine.libelleMuscle('grand_dorsal'), 4],
      [Semaine.libelleMuscle('trapezes'), 3], [Semaine.libelleMuscle('avant_bras'), 1]]);
  });

  test('les records du jour, avec la phrase de la médaille et l’ancien record', () => {
    const x = r();
    const shrug = x.records.filter((l) => /^Shrug/.test(l.nom));
    expect(shrug.length).toBeGreaterThan(0);
    expect(shrug[0].mesure).toBe('90 kg × 10');
    expect(shrug[0].phrase[1]).toMatch(/^Avant : 80 kg/);
    // La forme sans l'option ne change pas : la feuille d'avant et le registre le veulent.
    expect(Object.keys(faits.recordsDuJour(corpus(), SEANCE)[0])).toEqual(['nom', 'mesure']);
  });

  test('⚠️ les paris de LA séance : la phrase aux chiffres tels quels, une ligne par exercice vérifié', () => {
    const p = r().paris;
    expect([p.verifies, p.tenus]).toEqual([6, 4]);
    expect(p.phrase).toBe('Sur 6 paris vérifiés, le coach en a tenu 4.');
    expect(p.lignes.map((l) => [l.nom, l.fait, l.vise])).toEqual([
      ['Tractions', '9, 9, 8, 7', '9'],
      ['Shrug', '90 kg × 10, 10, 10', null]
    ]);
  });

  test('⚠️ seize paris : le récap dit « Sur 16 paris vérifiés, le coach en a tenu 14. » — pas ramené à 10', () => {
    const seize = Array.from({ length: 16 }, (_, k) => ({ seance: ID_SEANCE, exercice: k < 8 ? 'shrug' : 'tractions',
      predite: 9, observee: k < 14 ? 9 : 8 }));
    const p = faits.recapDeLaSeance(corpus(), SEANCE, seize).paris;
    expect(p.phrase).toBe('Sur 16 paris vérifiés, le coach en a tenu 14.');
    // Le bilan du mois, lui, ramène à 10 (inchangé).
    expect(Bilan.phraseParis(16, 14)).toBe('Sur 10 paris vérifiés, le coach en a tenu 9.');
  });

  test('ce qui a été fait : une charge qui change, des reps seules, une mesure', () => {
    expect(faits.faitDeLExercice([serie('a', 32, 12), serie('b', 36, 10)])).toBe('32 kg × 12 · 36 kg × 10');
    expect(faits.faitDeLExercice([serie('a', 90, 10), serie('b', 90, 10), serie('c', 90, 10)])).toBe('90 kg × 10, 10, 10');
    expect(faits.faitDeLExercice([serie('a', 31.5, 16), serie('b', 31.5, 16)])).toBe('31,5 kg × 16, 16');
    expect(faits.faitDeLExercice([serie('a', null, 9), serie('b', null, 8)])).toBe('9, 8');
    expect(faits.faitDeLExercice([serie('a', 60, 10, { type_serie: 'echauffement' }), serie('b', 80, 5)])).toBe('80 kg × 5');
  });

  test('⚠️ un bloc sans matière n’a pas de données : sans pari vérifié, pas de paris ; sous 1 t, pas de comparaison', () => {
    const petite = Object.assign({}, SEANCE, { id: 's-petite', exercices: [{ exercise_slug: 'tractions', series: [serie('q1', null, 8)] }] });
    const x = faits.recapDeLaSeance(corpus(), petite, PARIS);
    expect(x.paris).toBeNull();
    expect(x.phraseVolume).toBeNull();
    expect(x.volume_kg).toBe(0);
  });

  test('le récap ne modifie rien : la séance et le corpus sont identiques après deux calculs', () => {
    const avant = JSON.stringify([SEANCE, local.seances, local.series, PARIS]);
    r(); r();
    expect(JSON.stringify([SEANCE, local.seances, local.series, PARIS])).toBe(avant);
  });

  test('l’en-tête : « samedi 10 oct. · 14 h 27 → 15 h 30 » (à l’heure du téléphone)', () => {
    const d = new Date(DEBUT), f = new Date(FIN);
    const hm = (x) => x.getHours() + ' h ' + String(x.getMinutes()).padStart(2, '0');
    expect(Modele.plageDeSeance(DEBUT, FIN)).toBe(Modele.JOURS[d.getDay()] + ' ' + d.getDate() + ' ' +
      Modele.MOIS_COURTS[d.getMonth()] + ' · ' + hm(d) + ' → ' + hm(f));
  });
});
