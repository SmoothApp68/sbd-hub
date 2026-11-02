/** @jest-environment node */
//
// 206 — LES FAITS `pointsDeLExercice` et `exercicesLesPlusFaits` (`v2/js/faits.js`) : la matière des courbes de Progression
// et de la page d'exercice. Un point par séance, du plus ancien au plus récent ; max estimé (Epley) de la meilleure série
// de 10 reps ou moins ; meilleures reps au poids du corps ; meilleures secondes sur un maintien.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['quadriceps'] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] },
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps', equipement: 'poids_du_corps', muscles_primaires: ['dos'] },
  { slug: 'planche', nom: 'Planche', mesure: 'temps', equipement: 'poids_du_corps', muscles_primaires: [] }
];
const jour = (a, m, j) => new Date(a, m, j, 18, 0, 0);

// `specs` : de la plus RÉCENTE à la plus ancienne, comme `c.seances`.
function corpus(specs) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(), fin: null });
    parSeance[id] = (sp.series || []).map((x, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k }, x));
    parSeance[id].forEach((x) => series.push(x));
  });
  const index = Modele.indexerExercices(CATALOGUE);
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
}
const S = (slug, charge, reps, extra) => Object.assign({ exercise_slug: slug, charge_kg: charge, reps }, extra || {});

describe('206 — Faits.pointsDeLExercice', () => {
  test('un point par séance, du plus ancien au plus récent, le max estimé Epley de la meilleure série', () => {
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('squat_barre', 130, 5), S('squat_barre', 120, 5)] },
      { debut: jour(2026, 9, 21), series: [S('squat_barre', 100, 8)] }
    ]);
    const p = Faits.creer().pointsDeLExercice(c, 'squat_barre');
    expect(p.mesure).toBe('charge');
    expect(p.points.map((x) => x.seance)).toEqual(['s1', 's0']);
    expect(p.points[1].valeur).toBeCloseTo(130 * (1 + 5 / 30), 6);
    expect(p.points[1].charge).toBe(130);
    expect(p.points[1].reps).toBe(5);
    expect(p.points[0].valeur).toBeCloseTo(100 * (1 + 8 / 30), 6);
  });

  test('⚠️ une série de plus de 10 reps, une chauffe, une série sans charge ne comptent pas', () => {
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('squat_barre', 60, 15), S('squat_barre', 200, 1, { type_serie: 'echauffement' }), S('squat_barre', null, 5)] },
      { debut: jour(2026, 9, 21), series: [S('squat_barre', 100, 10), S('squat_barre', 60, 11)] }
    ]);
    const p = Faits.creer().pointsDeLExercice(c, 'squat_barre');
    expect(p.points).toHaveLength(1);
    expect(p.points[0].seance).toBe('s1');
    expect(p.points[0].reps).toBe(10);
  });

  test('poids du corps : les meilleures reps ; maintien : les meilleures secondes', () => {
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('tractions', null, 14), S('tractions', null, 9), S('planche', null, null, { duree_s: 75 }), S('planche', null, null, { duree_s: 60 })] },
      { debut: jour(2026, 9, 21), series: [S('tractions', null, 12)] }
    ]);
    const f = Faits.creer();
    const t = f.pointsDeLExercice(c, 'tractions');
    expect(t.mesure).toBe('reps');
    expect(t.points.map((x) => x.valeur)).toEqual([12, 14]);
    const pl = f.pointsDeLExercice(c, 'planche');
    expect(pl.mesure).toBe('temps');
    expect(pl.points.map((x) => x.valeur)).toEqual([75]);
  });

  test('le drapeau record suit la médaille de la séance, pas le seul max estimé', () => {
    const c = corpus([
      { debut: jour(2026, 9, 28), series: [S('squat_barre', 100, 5)] },
      { debut: jour(2026, 9, 21), series: [S('squat_barre', 120, 5)] },
      { debut: jour(2026, 9, 14), series: [S('squat_barre', 110, 5)] }
    ]);
    const p = Faits.creer().pointsDeLExercice(c, 'squat_barre');
    expect(p.points.map((x) => x.record)).toEqual([false, true, false]);  // 110 (la première fois : rien à battre), 120 (record), 100 (non)
  });

  test('exercice inconnu ou jamais fait : rien', () => {
    const c = corpus([{ debut: jour(2026, 9, 28), series: [S('squat_barre', 100, 5)] }]);
    expect(Faits.creer().pointsDeLExercice(c, 'inconnu')).toEqual({ mesure: null, points: [] });
    expect(Faits.creer().pointsDeLExercice(c, 'tractions').points).toEqual([]);
  });
});

describe('220 — Faits.exercicesDeProgression (« Tes exercices »)', () => {
  const now = jour(2026, 10, 1);
  const CAT = [
    { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['quadriceps'] },
    { slug: 'developpe_couche_barre', nom: 'Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] },
    { slug: 'souleve_de_terre_barre', nom: 'Soulevé (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['dos'] },
    { slug: 'rowing_barre', nom: 'Rowing (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['dos'] },
    { slug: 'presse', nom: 'Presse', mesure: 'charge_reps', equipement: 'machine', muscles_primaires: ['quadriceps'] },
    { slug: 'elevations', nom: 'Élévations', mesure: 'charge_reps', equipement: 'haltere', muscles_primaires: ['deltoides'] },
    { slug: 'tapis', nom: 'Tapis', mesure: 'distance_temps', equipement: 'machine', muscles_primaires: [] },
    { slug: 'planche', nom: 'Planche', mesure: 'temps', equipement: 'poids_du_corps', muscles_primaires: [] },
    { slug: 'tractions', nom: 'Tractions', mesure: 'reps', equipement: 'poids_du_corps', muscles_primaires: ['dos'] }
  ];
  function corpus2(specs) {
    const seances = [], series = [], parSeance = {};
    specs.forEach((sp, i) => {
      const id = 's' + i;
      seances.push({ id, debut: sp.debut.toISOString(), fin: null });
      parSeance[id] = sp.series.map((x, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k }, x));
      parSeance[id].forEach((x) => series.push(x));
    });
    const index = Modele.indexerExercices(CAT);
    return { seances, series, exercices: CAT, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
  }
  const T = (slug, ch, reps) => ({ exercise_slug: slug, charge_kg: ch, reps });
  const TEMPS = (slug, d) => ({ exercise_slug: slug, duree_s: d, reps: null, charge_kg: null });
  // 12 séances (de la plus récente à la plus ancienne, une tous les 7 jours) : le tapis à chaque séance, les élévations aussi,
  // les barres une fois par semaine, la presse une fois sur deux.
  function historique() {
    const specs = [];
    for (let i = 0; i < 12; i++) {
      const series = [TEMPS('tapis', 900 + i), T('elevations', 8 + (i % 3), 10), TEMPS('planche', 60)];
      const barre = ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre'][i % 3];
      series.push(T(barre, 100 + (12 - i) * 2, 5), T('tractions', null, 8));
      if (i % 2 === 0) series.push(T('presse', 160, 10));
      if (i < 6) series.push(T('rowing_barre', 60 + (6 - i), 8));
      specs.push({ debut: new Date(now.getTime() - (i + 0.5) * 7 * 86400000), series });
    }
    return specs;
  }
  const fenetre = (pts) => pts.filter((p) => new Date(p.debut).getTime() >= now.getTime() - 183 * 86400000);
  const choisir = (o, specs) => Faits.creer().exercicesDeProgression(corpus2(specs || historique()), now, Object.assign({ fenetre }, o || {}));

  test('(a) jamais le cardio, le temps ni le poids du corps seul — même fait à chaque séance', () => {
    const l = choisir({ combien: 9 });
    ['tapis', 'planche', 'tractions'].forEach((s) => expect(l).not.toContain(s));
    expect(l.length).toBeGreaterThan(0);
  });
  test('(b) les mouvements prioritaires du profil passent d’abord, même peu faits', () => {
    const l = choisir({ priorites: ['souleve_de_terre_barre', 'pectoraux'] });
    expect(l[0]).toBe('souleve_de_terre_barre');
    expect(l.length).toBe(4);
  });
  test('(b) puis les exercices à la barre les plus faits, avant la machine et les haltères pourtant plus faits', () => {
    const l = choisir({});
    // les élévations (12 séances) et la presse (6) sont plus faites que les barres hebdomadaires, mais à la barre d’abord
    expect(l.slice(0, 3).every((s) => ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre', 'rowing_barre'].includes(s))).toBe(true);
    expect(l).not.toContain('elevations');   // fait à chaque séance, mais ni à la barre ni prioritaire
    expect(l).not.toContain('presse');
  });
  test('(c) la 4e ligne est « ce qui a le plus progressé », sans doublon avec les trois', () => {
    const l = choisir({ avance: ['elevations'] });
    expect(l.length).toBe(4);
    expect(l[3]).toBe('elevations');
    expect(new Set(l).size).toBe(4);
    // déjà dans les trois : on prend la suivante de la liste, puis le suivant des plus faits
    const l2 = choisir({ avance: ['squat_barre', 'presse'] });
    expect(new Set(l2).size).toBe(l2.length);
    expect(l2).toContain('presse');
  });
  test('(d) un exercice à un seul point sur la fenêtre n’est pas choisi : la liste se remplit avec les suivants (avant la coupe à 4)', () => {
    const specs = historique().map((sp, i) => ({ debut: sp.debut,
      series: sp.series.filter((x) => x.exercise_slug !== 'developpe_couche_barre' || i === 1) }));   // le couché : UNE séance, un point
    const l = choisir({ priorites: ['developpe_couche_barre'] });
    expect(l).toContain('developpe_couche_barre');           // témoin : avec 4 séances de couché il passe
    const l2 = choisir({ priorites: ['developpe_couche_barre'] }, specs);
    expect(l2).not.toContain('developpe_couche_barre');
    expect(l2.length).toBe(4);
  });
  test('toujours 4 lignes si l’historique le permet ; moins s’il ne le permet pas', () => {
    expect(choisir({}).length).toBe(4);
    const peu = historique().map((sp) => ({ debut: sp.debut, series: sp.series.filter((x) => x.exercise_slug === 'squat_barre' || x.exercise_slug === 'tapis') }));
    expect(choisir({}, peu)).toEqual(['squat_barre']);
  });
});

describe('220 — Faits.ceQuiAProgresse (la notion de « Ton année », sur 6 mois glissants)', () => {
  require('../../v2/js/parcours.js'); require('../../v2/js/poids.js'); require('../../v2/js/bilans.js');
  test('lit THBilans…avance : l’exercice qui a monté à reps égales sort en premier', () => {
    const now = jour(2026, 10, 1);
    const specs = [];
    for (let i = 0; i < 20; i++) {
      const d = new Date(now.getTime() - (i + 0.5) * 7 * 86400000);
      const recent = i < 10;
      specs.push({ debut: d, series: [S('squat_barre', recent ? 140 : 100, 5), S('squat_barre', recent ? 150 : 110, 3), S('developpe_couche_barre', 80, 5), S('developpe_couche_barre', 85, 3)] });
    }
    const c = corpus(specs);
    const l = Faits.creer().ceQuiAProgresse(c, now, 6, {});
    expect(l[0]).toBe('squat_barre');
  });
  test('la MÊME notion que « Ton année » : la tête de `bilanDePeriode(…).avance` est la 1re ligne', () => {
    const now = jour(2026, 10, 1);
    const specs = [];
    for (let i = 0; i < 20; i++) {
      const recent = i < 10, d = new Date(now.getTime() - (i + 0.5) * 7 * 86400000);
      specs.push({ debut: d, series: [S('squat_barre', recent ? 140 : 100, 5), S('squat_barre', recent ? 150 : 110, 3), S('developpe_couche_barre', recent ? 90 : 80, 5), S('developpe_couche_barre', recent ? 95 : 85, 3)] });
    }
    const c = corpus(specs), F = Faits.creer();
    const bilan = F.bilanDePeriode(c, global.THBilans.periodeDesDerniersMois(6, '2026-11-01'), now, {});
    const l = F.ceQuiAProgresse(c, now, 6, {});
    expect(l[0]).toBe(bilan.avance.tete.slug);
    expect(l.slice(1, 3)).toEqual(bilan.avance.suivants.map((x) => x.slug));
  });
  test('sans historique : liste vide', () => {
    expect(Faits.creer().ceQuiAProgresse(corpus([]), jour(2026, 10, 1), 6, {})).toEqual([]);
  });
});
