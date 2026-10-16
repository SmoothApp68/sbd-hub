/** @jest-environment node */
//
// 95 — LE MOTEUR DES BILANS DE PÉRIODE (`v2/js/bilans.js`, BILANS-V1) et son entrée (`faits.js`, `entreeDuBilan`,
// `bilanDePeriode`, `faitsDuJeuDeLaPeriode`). Des fixtures SYNTHÉTIQUES : l'année pleine, l'année incomplète, moins de
// 2 mois, une pesée encadrante, la pesée proche avec « ≈ », l'absence de pesée, les haltères en total.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/periode.js');
require('../../v2/js/poids.js');
const Parcours = require('../../v2/js/parcours.js');
const Bilans = require('../../v2/js/bilans.js');
const Faits = require('../../v2/js/faits.js');
const Jeu = require('../../v2/js/jeu.js');

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', equipement: 'barre', mesure: 'charge_reps',
    muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', equipement: 'barre', mesure: 'charge_reps',
    muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
  { slug: 'souleve_de_terre_barre', nom: 'Soulevé de Terre (Barre)', equipement: 'barre', mesure: 'charge_reps',
    muscles_primaires: ['ischio_jambiers'], muscles_secondaires: ['fessiers'] },
  { slug: 'developpe_militaire_barre', nom: 'Développé Militaire (Barre)', equipement: 'barre', mesure: 'charge_reps',
    muscles_primaires: ['deltoide_anterieur'], muscles_secondaires: [] },
  { slug: 'developpe_couche_halteres', nom: 'Développé Couché (Haltère)', equipement: 'haltere', mesure: 'charge_reps',
    muscles_primaires: ['pectoraux'], muscles_secondaires: [] }
];

// Une séance : `[jour, [[slug, charge, reps, type?]…], titre?]` → l'entrée du moteur.
let n = 0;
function seance(jour, series, titre) {
  const id = 's' + (++n);
  return { id, jour, titre: titre || null, series: series.map((x, i) => ({ id: id + '-' + i, session_id: id,
    exercise_slug: x[0], charge_kg: x[1], reps: x[2], type_serie: x[3] || 'travail', rang: i + 1 })) };
}
// Une séance par semaine (le jeudi) de `de` à `a`, avec `fn(semaine)` → ses séries.
function chaqueSemaine(de, a, fn) {
  const out = [];
  let k = 0;
  for (let d = new Date(de + 'T12:00:00Z'); d <= new Date(a + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(seance(d.toISOString().slice(0, 10), fn(k++)));
  }
  return out;
}
const ANNEE = Bilans.periodeDeLAnnee(2026);
const bilan = (seances, autres) => Bilans.bilanDeLaPeriode(Object.assign({ periode: ANNEE, aujourdhui: '2026-12-31',
  seances, exercices: CATALOGUE, pesees: [], paris: [] }, autres || {}));

// ── L'année pleine : 2025 et 2026, chaque semaine ───────────────────────────
const PLEINE = chaqueSemaine('2025-01-02', '2025-12-25', (k) => [
  ['squat_barre', 120, 5], ['squat_barre', 120, 3], ['developpe_couche_barre', 100, 5], ['developpe_couche_barre', 90, 8],
  ['souleve_de_terre_barre', 160, 3], ['developpe_militaire_barre', 60, 5],
  ['developpe_couche_halteres', 40, 6], ['developpe_couche_halteres', 35, 10], ['squat_barre', 60, 5, 'echauffement']
]).concat(chaqueSemaine('2026-01-01', '2026-12-24', (k) => [
  ['squat_barre', k > 40 ? 140 : 130, 5], ['squat_barre', 140, 3], ['developpe_couche_barre', 100, 5],
  ['developpe_couche_barre', 92.5, 8], ['souleve_de_terre_barre', k === 20 ? 170 : 165, 3],
  ['developpe_militaire_barre', 60, 5], ['developpe_couche_halteres', 50, 6], ['developpe_couche_halteres', 36, 10]
]));

describe('95 — l’année pleine (2026 contre 2025)', () => {
  const b = bilan(PLEINE);
  test('la comparaison se fait contre 2025', () => {
    expect(b.versus.mode).toBe('precedente');
    expect(b.versus.libelle).toBe('2025');
    expect(b.versus.moisDeDonnees).toBe(24);
  });
  test('les tonnes, les éléphants, mois par mois', () => {
    const ici = PLEINE.filter((s) => s.jour >= '2026-01-01');
    const kg = Bilan.volumeKg([].concat(...ici.map((s) => s.series)));
    expect(b.tonnes.kg).toBe(kg);
    expect(b.tonnes.elephants).toBe(Math.round(kg / 6000));
    expect(b.mois.liste).toHaveLength(12);
    expect(b.mois.plusLourd.kg).toBe(Math.max(...b.mois.liste.map((m) => m.kg)));
    expect(b.mois.enCours).toBe('2026-12');
  });
  test('reps et séries de travail (jamais une chauffe)', () => {
    expect(b.reps.series).toBe(52 * 8);
    expect(b.reps.reps).toBe(52 * (5 + 3 + 5 + 8 + 3 + 5 + 6 + 10));
  });
  test('le profil : force ≤ 5, mix 6 à 8, muscle ≥ 9 — des parts qui font 100', () => {
    expect([b.profil.force, b.profil.mix, b.profil.muscle]).toEqual([63, 25, 12]);
    expect(b.profil.premier).toBe('force');
    expect(b.profil.second).toBe('mix');
  });
  test('le muscle et l’exercice de l’année', () => {
    expect(b.muscles[0].muscle).toBe('pectoraux');
    // À séances égales, le plus de reps.
    expect(b.exercices[0]).toEqual({ slug: 'developpe_couche_halteres', nom: 'Développé Couché (Haltère)', seances: 52, reps: 52 * 16 });
    expect(b.exercices[1]).toEqual({ slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', seances: 52, reps: 52 * 13 });
    expect(b.exercices).toHaveLength(3);
  });
  test('les barres : la plus lourde, de ta vie, le total et son écart à 2025', () => {
    expect(b.barres.tete).toMatchObject({ slug: 'souleve_de_terre_barre', charge: 170, vie: true, avant: 160 });
    const couche = b.barres.lignes.find((l) => l.slug === 'developpe_couche_barre');
    expect(couche).toMatchObject({ charge: 100, avant: 100, vie: false });
    expect(b.barres.total).toEqual({ charge: 140 + 100 + 170, avant: 120 + 100 + 160, ecart: 30 });
  });
  test('ce qui a le plus avancé : les haltères en poids total des deux', () => {
    expect(b.avance.tete).toMatchObject({ slug: 'developpe_couche_halteres', reps: 6, de: 80, a: 100 });
    expect(b.avance.suivants[0]).toMatchObject({ slug: 'squat_barre', reps: 3, de: 120, a: 140 });
    // Le soulevé et le militaire n'ont qu'un nombre de reps : pas comparables à reps égales.
    expect(b.avance.compares).toBe(3);
    expect(b.avance.progressent).toBe(3);
  });
  test('sans pesée : aucun % du poids de corps', () => {
    b.barres.lignes.forEach((l) => expect(l.pdc).toBeNull());
  });
  test('⚠️ jamais le nombre de séances de l’année, ni la durée', () => {
    expect(JSON.stringify(Object.keys(b))).not.toMatch(/seances|temps|duree|assiduite/);
  });
});

describe('95 — l’année incomplète : début contre fin', () => {
  const s = chaqueSemaine('2026-03-05', '2026-10-29', (k) => [['squat_barre', 100 + (k > 17 ? 10 : 0), 5],
    ['squat_barre', 90 + (k > 17 ? 10 : 0), 8], ['developpe_couche_barre', 80, 5]]);
  const b = bilan(s, { aujourdhui: '2026-11-15' });
  test('moins de 12 mois de données : le début de l’année contre sa fin', () => {
    expect(b.versus.mode).toBe('debut_fin');
    expect(b.versus.qu).toBe('qu’en début d’année');
    expect(b.mois.liste).toHaveLength(11);
    expect(b.mois.enCours).toBe('2026-11');
  });
  test('le squat avance, le couché ne bouge pas', () => {
    expect(b.avance.tete).toMatchObject({ slug: 'squat_barre', de: 90, a: 100, reps: 8 });
    expect(b.avance.compares).toBe(1);   // le couché, à une seule fourchette, ne se compare pas
    expect(b.barres.lignes.find((l) => l.slug === 'squat_barre')).toMatchObject({ charge: 110, avant: 100, vie: false });
  });
});

describe('95 — moins de 2 mois de données : les faits seulement', () => {
  const s = chaqueSemaine('2026-10-01', '2026-10-29', () => [['squat_barre', 100, 5], ['developpe_couche_barre', 80, 5],
    ['souleve_de_terre_barre', 120, 5]]);
  const b = bilan(s, { aujourdhui: '2026-10-30' });
  test('aucune comparaison, nulle part', () => {
    expect(b.versus.mode).toBe('aucune');
    expect(b.avance).toBeNull();
    b.barres.lignes.forEach((l) => expect(l.avant).toBeNull());
    expect(b.barres.total).toEqual({ charge: 300, avant: null, ecart: null });
    expect(b.tonnes.kg).toBe(5 * 5 * 300);
  });
});

describe('95 — le poids du jour', () => {
  test('deux pesées qui encadrent la perf (60 j au plus de chaque côté) : interpolées, sans « ≈ »', () => {
    expect(Bilans.poidsDuJour([{ jour: '2026-05-01', poids: 100 }, { jour: '2026-06-30', poids: 94 }], '2026-05-31'))
      .toEqual({ poids: 97, approx: false });
  });
  test('la pesée du jour même', () => {
    expect(Bilans.poidsDuJour([{ jour: '2026-05-31', poids: 98 }], '2026-05-31')).toEqual({ poids: 98, approx: false });
  });
  test('⚠️ une pesée à plus de 60 j n’encadre pas : la plus proche à 45 j au plus, avec « ≈ »', () => {
    expect(Bilans.poidsDuJour([{ jour: '2026-03-01', poids: 90 }, { jour: '2026-06-20', poids: 96 }], '2026-06-01'))
      .toEqual({ poids: 96, approx: true });
  });
  test('rien à 45 j ni de pesées encadrantes : pas de %', () => {
    expect(Bilans.poidsDuJour([{ jour: '2026-03-01', poids: 90 }, { jour: '2026-09-20', poids: 96 }], '2026-06-01')).toBeNull();
    expect(Bilans.poidsDuJour([], '2026-06-01')).toBeNull();
  });
  test('dans le bilan : le % du jour de la perf', () => {
    const b = bilan(PLEINE, { pesees: [{ jour: '2026-05-01', poids: 100 }, { jour: '2026-06-01', poids: 100 }] });
    const sdt = b.barres.lignes.find((l) => l.slug === 'souleve_de_terre_barre');
    expect(sdt.jour).toBe('2026-05-21');
    expect(sdt.pdc).toEqual({ pct: 170, approx: false });
    const mil = b.barres.lignes.find((l) => l.slug === 'developpe_militaire_barre');
    expect(mil.jour).toBe('2026-01-01');
    expect(mil.pdc).toBeNull();
  });
});

describe('95 — le coach : les paris tenus sur les paris vérifiés', () => {
  test('« depuis » le premier pari quand il est venu en cours d’année', () => {
    const b = bilan(PLEINE, { paris: [{ jour: '2026-09-26', predite: 5, observee: 5 }, { jour: '2026-10-01', predite: 5, observee: 4 },
      { jour: '2026-10-02', predite: 5, observee: null }, { jour: '2025-10-02', predite: 5, observee: 6 }] });
    expect(b.coach).toEqual({ tenus: 1, faits: 2, depuis: '2026-09-26' });
  });
  test('sans pari vérifié : pas d’écran du coach', () => {
    expect(bilan(PLEINE).coach).toBeNull();
  });
});

describe('95 — la règle « moins pratiqué » et les reps égales sont celles de « Ton parcours »', () => {
  test('pratique()', () => {
    expect(Parcours.pratique(10, 4)).toBe('moins');
    expect(Parcours.pratique(2, 6)).toBe('nouveau');
    expect(Parcours.pratique(6, 4)).toBe('peu');
    expect(Parcours.pratique(6, 6)).toBeNull();
  });
  test('un exercice délaissé ne compte pas dans ce qui a le plus avancé', () => {
    const rowing = { slug: 'rowing_barre', nom: 'Rowing (Barre)', equipement: 'barre', mesure: 'charge_reps',
                     muscles_primaires: ['grand_dorsal'], muscles_secondaires: [] };
    const s = PLEINE.concat(chaqueSemaine('2025-01-03', '2025-12-26', () => [['rowing_barre', 60, 10], ['rowing_barre', 70, 6]]))
      .concat(chaqueSemaine('2026-01-03', '2026-02-26', () => [['rowing_barre', 80, 10], ['rowing_barre', 90, 6]]));
    const b = Bilans.bilanDeLaPeriode({ periode: ANNEE, aujourdhui: '2026-12-31', seances: s,
      exercices: CATALOGUE.concat([rowing]), pesees: [], paris: [] });
    expect(b.avance.compares).toBe(3);
    expect(b.avance.tete.slug).toBe('developpe_couche_halteres');
  });
});

describe('95 — l’entrée assemblée par les faits', () => {
  const seances = [], series = [];
  PLEINE.forEach((s) => {
    seances.push({ id: s.id, debut: s.jour + 'T17:00:00Z', fin: s.jour + 'T18:00:00Z', titre: 'Séance ' + s.id });
    s.series.forEach((x) => series.push(x));
  });
  seances.push({ id: 'en-cours', debut: '2026-12-30T17:00:00Z', statut: 'en_cours' });
  const index = Modele.indexerExercices(CATALOGUE);
  const c = { seances, series, exercices: CATALOGUE, seriesDe: (id) => series.filter((x) => x.session_id === id),
              catalogue: () => index, journal: [] };
  const f = Faits.creer();
  test('mêmes chiffres que le moteur appelé directement ; la séance en cours n’entre pas', () => {
    const e = f.entreeDuBilan(c, ANNEE, new Date(2026, 11, 31, 12), { pesees: [{ date: '2026-05-21', poids_kg: 100 }] });
    expect(e.seances.find((s) => s.id === 'en-cours')).toBeUndefined();
    expect(e.pesees).toEqual([{ jour: '2026-05-21', poids: 100 }]);
    const b = f.bilanDePeriode(c, ANNEE, new Date(2026, 11, 31, 12), { pesees: [{ date: '2026-05-21', poids_kg: 100 }] });
    expect(b.tonnes).toEqual(bilan(PLEINE).tonnes);
    expect(b.seance.titre).toMatch(/^Séance s/);
    expect(f.bilanDePeriode(c, ANNEE, new Date(2026, 11, 31, 12), { pesees: [{ date: '2026-05-21', poids_kg: 100 }] })).toBe(b);
  });
  test('les faits du jeu au début et à la fin de la période', () => {
    const j = f.faitsDuJeuDeLaPeriode(c, ANNEE, new Date(2026, 11, 31, 12));
    expect(j.debut.seances.every((s) => s.debut < '2026-01-01')).toBe(true);
    // Comme `faitsDuJeu` sur tout le corpus : la séance en cours y entre (le jeu la lit ainsi).
    expect(j.fin.seances.length).toBe(105);
    const a = Jeu.etatDuJeu(j.debut), b = Jeu.etatDuJeu(j.fin);
    expect(b.niveau.niveau).toBeGreaterThanOrEqual(a.niveau.niveau);
  });
  test('le record de charge d’une barre est celui de la table (`recordsDeLExercice(...).lourde`)', () => {
    const b = f.bilanDePeriode(c, ANNEE, new Date(2026, 11, 31, 12), {});
    const sdt = f.seancesDuSlug(c, 'souleve_de_terre_barre');
    const lourde = Modele.recordsDeLExercice(sdt, new Date(2026, 11, 31), Modele.optionsDeRecord(index.souleve_de_terre_barre)).lourde;
    expect(b.barres.tete.charge).toBe(lourde.charge);
  });
});

describe('97 — les heures et les jours à la salle (BILANS-V1, 15/10/2026)', () => {
  // Heure de Paris : 23:30 UTC le 14 octobre est le 15 octobre à Paris.
  const seances = [
    { id: 'a', debut: '2026-03-02T17:00:00Z', fin: '2026-03-02T18:30:00Z', statut: 'terminee' },   // 1 h 30
    { id: 'b', debut: '2026-03-02T19:00:00Z', fin: '2026-03-02T20:00:00Z', statut: 'terminee' },   // même jour, 1 h
    { id: 'c', debut: '2026-03-05T17:00:00Z', fin: null, statut: 'terminee' },                     // sans fin
    { id: 'd', debut: '2026-03-07T08:00:00Z', fin: '2026-03-07T14:00:00Z', statut: 'terminee' },   // 6 h : pas d'heures
    { id: 'e', debut: '2026-03-09T08:00:00Z', fin: '2026-03-09T13:00:00Z', statut: 'terminee' },   // 5 h pile : compte
    { id: 'f', debut: '2026-10-14T23:30:00Z', fin: '2026-10-15T00:30:00Z', statut: 'terminee' },   // le 15 à Paris
    { id: 'g', debut: '2026-03-10T17:00:00Z', statut: 'en_cours' },                                // en cours : rien
    { id: 'h', debut: '2025-12-31T17:00:00Z', fin: '2025-12-31T18:00:00Z', statut: 'terminee' }    // l'année d'avant
  ];
  const f = Faits.creer();
  // 119 — chaque séance porte une série de musculation (la règle « à la salle » depuis le 16/10/2026).
  const indexS = Modele.indexerExercices(CATALOGUE);
  const seriesDe = (id) => [{ id: id + '-1', session_id: id, exercise_slug: 'squat_barre', charge_kg: 100, reps: 5,
                              type_serie: 'travail', rang: 1 }];
  const c = { seances, seriesDe, catalogue: () => indexS };
  test('deux séances le même jour : UN jour ; sans fin : le jour, pas d’heures ; 6 h : le jour, pas d’heures', () => {
    expect(f.tempsALaSalle(c, '2026-01-01', '2026-12-31')).toEqual({ jours: 5, minutes: 90 + 60 + 300 + 60 });
  });
  test('le jour civil de Paris, et la fenêtre de la période', () => {
    expect(f.tempsALaSalle(c, '2026-10-15', '2026-10-15')).toEqual({ jours: 1, minutes: 60 });
    expect(f.tempsALaSalle(c, '2026-10-14', '2026-10-14')).toEqual({ jours: 0, minutes: 0 });
    expect(f.tempsALaSalle(c, '2025-01-01', '2025-12-31')).toEqual({ jours: 1, minutes: 60 });
  });
  test('l’entrée du bilan le porte, borné à aujourd’hui ; le moteur le rend, sans comparaison', () => {
    const e = f.entreeDuBilan({ seances, series: [], seriesDe, catalogue: () => indexS }, ANNEE,
      new Date(2026, 2, 8, 12), {});
    expect(e.salle).toEqual({ jours: 3, minutes: 150 });
    const b = Bilans.bilanDeLaPeriode(Object.assign({}, e, { salle: { jours: 180, minutes: 260 * 60 } }));
    expect(b.salle).toEqual({ jours: 180, heures: 260, joursEntiers: 11 });
  });
});

// ── 119 (audit du 16/10/2026) — les mesures en durée et en distance ─────────
// Aurélien, 16/10 : « Pour l'exercice du mois, le tapis ne devrait pas apparaître. »
const CAT_119 = CATALOGUE.concat([
  { slug: 'tapis_roulant', nom: 'Tapis de Course', equipement: 'machine', charge: 'aucune', mesure: 'distance_temps',
    muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'randonnee', nom: 'Randonnée', equipement: null, charge: 'aucune', mesure: 'distance_temps',
    muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'planche', nom: 'Planche', equipement: null, charge: 'aucune', mesure: 'temps',
    muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
  { slug: 'tractions', nom: 'Tractions', equipement: null, charge: 'corps', mesure: 'reps',
    muscles_primaires: ['grand_dorsal'], muscles_secondaires: [] }
]);
// Une série en durée ou en distance : `[slug, null, null]`, puis ses colonnes.
function seance119(jour, series) {
  const s = seance(jour, series.map((x) => [x[0], x[1], x[2]]));
  s.series.forEach((x, i) => { if (series[i][3]) Object.assign(x, series[i][3]); });
  return s;
}
const OCTOBRE = Bilans.periodeDuMois('2026-10');
const bilan119 = (seances, periode) => Bilans.bilanDeLaPeriode({ periode: periode || OCTOBRE, aujourdhui: '2026-12-31',
  seances, exercices: CAT_119, pesees: [], paris: [] });

describe('119 — F1/F3 : l’exercice du mois, de la saison, de l’année se mesure en reps, classé par le chiffre affiché', () => {
  // 8 séances : le tapis (10 min, 1 km) et la planche à CHACUNE ; le squat 3 fois (30 reps), le couché 5 fois (10).
  const jours = ['2026-10-01', '2026-10-03', '2026-10-06', '2026-10-08', '2026-10-10', '2026-10-13', '2026-10-15', '2026-10-17'];
  const oct = jours.map((j, k) => seance119(j, [
    ['tapis_roulant', null, null, { duree_s: 600, distance_m: 1000 }],
    ['planche', null, null, { duree_s: 60 }],
    k < 3 ? ['squat_barre', 100, 10] : ['developpe_couche_barre', 80, 2],
    k < 3 ? ['squat_barre', 100, 10] : ['developpe_couche_barre', 80, 2],
    k < 3 ? ['squat_barre', 100, 10] : ['tractions', null, 1]
  ]));
  test('ni le tapis ni la planche : seulement charge × reps et reps seules', () => {
    const slugs = bilan119(oct).exercices.map((x) => x.slug);
    expect(slugs).not.toContain('tapis_roulant');
    expect(slugs).not.toContain('planche');
  });
  test('le mois se classe par ses reps (le chiffre qu’il montre), pas par ses séances', () => {
    expect(bilan119(oct).exercices).toEqual([
      { slug: 'squat_barre', nom: 'Squat (Barre)', seances: 3, reps: 90 },
      { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', seances: 5, reps: 20 },
      { slug: 'tractions', nom: 'Tractions', seances: 5, reps: 5 }
    ]);
  });
  // DISCRIMINANT (le banc de mutation l'a exigé : sans lui, « au moins une rep » suffisait à écarter le tapis, et le
  // filtre de la mesure ne se voyait pas) — une planche dont la série porte des REPS (saisie quand le catalogue
  // manquait, la « pureté des mesures » de l'audit 02) et un exercice inconnu du catalogue : ni l'une ni l'autre.
  test('une durée saisie avec des reps, ou un exercice inconnu : jamais l’exercice du mois', () => {
    const impur = jours.map((j) => seance119(j, [['planche', null, 60], ['inconnu_x', 50, 40], ['squat_barre', 100, 5]]));
    expect(bilan119(impur).exercices.map((x) => x.slug)).toEqual(['squat_barre']);
  });
  test('la saison aussi ; l’année montre les séances puis les reps, elle se classe ainsi', () => {
    expect(bilan119(oct, Bilans.periodeDeLaSaison('2026-automne')).exercices[0].slug).toBe('squat_barre');
    expect(bilan119(oct, ANNEE).exercices.map((x) => x.slug)).toEqual(['developpe_couche_barre', 'tractions', 'squat_barre']);
  });
});

// Aurélien, 16/10 : « 22 h sur 22 jours ça paraît peu » — et une randonnée de 5 h comptait « à la salle ».
describe('119 — F2 : « à la salle », seulement les séances de musculation', () => {
  const idx = Modele.indexerExercices(CAT_119);
  const S = (id, debut, heures, series) => ({ seance: { id, debut, fin: new Date(Date.parse(debut) + heures * 3600000).toISOString(),
    statut: 'terminee' }, series: series.map((x, i) => Object.assign({ id: id + i, session_id: id, exercise_slug: x[0],
    type_serie: 'travail', rang: i + 1, charge_kg: null, reps: null }, x[1])) });
  const lot = [
    S('muscu', '2026-10-01T17:00:00Z', 1.5, [['squat_barre', { charge_kg: 100, reps: 5 }]]),
    S('rando', '2026-10-04T08:00:00Z', 4.5, [['randonnee', { duree_s: 16200, distance_m: 14000 }]]),     // une sortie
    S('tapis', '2026-10-05T17:00:00Z', 0.5, [['tapis_roulant', { duree_s: 1800, distance_m: 4000 }]]),   // cardio seul
    S('mixte', '2026-10-11T08:00:00Z', 3, [['randonnee', { duree_s: 7200 }], ['tractions', { reps: 8 }]]), // mixte
    S('gainage', '2026-10-12T17:00:00Z', 0.5, [['planche', { duree_s: 60 }]]),                         // muscu sans charge
    S('chauffes', '2026-10-13T17:00:00Z', 0.5, [['squat_barre', { charge_kg: 60, reps: 5, type_serie: 'echauffement' }]]),
    S('vide', '2026-10-14T17:00:00Z', 1, [])                                                           // rien en cache
  ];
  const c = { seances: lot.map((x) => x.seance), seriesDe: (id) => (lot.find((x) => x.seance.id === id) || { series: [] }).series,
              catalogue: () => idx };
  test('ni la randonnée, ni le tapis seul, ni une séance de chauffes ou sans série ; la séance mixte et le gainage, oui', () => {
    expect(Faits.creer().tempsALaSalle(c, '2026-10-01', '2026-10-31')).toEqual({ jours: 3, minutes: 90 + 180 + 30 });
  });
  test('la règle est nommée : une série de travail d’un exercice qui porte du volume (inconnu : compté)', () => {
    const Se = global.THSemaine;
    expect(Se.estSeanceDeMusculation(lot[1].series, idx)).toBe(false);
    expect(Se.estSeanceDeMusculation(lot[3].series, idx)).toBe(true);
    expect(Se.estSerieDeMusculation({ exercise_slug: 'inconnu', type_serie: 'travail' }, undefined)).toBe(true);
    expect(Se.compteSeriesTravail(lot[3].series, CAT_119)).toBe(1);
  });
});

describe('119 — F4 : un mois de seules sorties est vide', () => {
  const rando = (j) => seance119(j, [['randonnee', null, null, { duree_s: 14400, distance_m: 12000 }]]);
  test('août en randonnées : vide (pas de story « 0 t »), et ses semaines n’ouvrent aucune comparaison', () => {
    const aout = Bilans.periodeDuMois('2026-08');
    const b = bilan119([seance('2026-07-02', [['squat_barre', 100, 5]]), rando('2026-08-02'), rando('2026-08-09'),
      rando('2026-08-16'), rando('2026-08-23')], aout);
    expect(b.vide).toBe(true);
    expect(b.versus.mode).toBe('aucune');
  });
  test('une séance de gainage suffit : le mois n’est pas vide', () => {
    expect(bilan119([seance119('2026-08-05', [['planche', null, null, { duree_s: 60 }]])], Bilans.periodeDuMois('2026-08')).vide)
      .toBe(false);
  });
});
