/** @jest-environment node */
//
// 66A — LE FAIT DES BARRES DU BILAN (`v2/js/faits.js` `barresDuBilan`,
// QUESTIONNAIRE-COACH-V2 §5 ter.2). Ce que « Le coach relit ta semaine » reçoit
// de chacune des quatre barres : le record, la série récente, les semaines, les
// séries lourdes, les variantes à la barre.
//
// Chaque test est DISCRIMINANT : il échoue si la règle qu'il nomme est fausse
// — la borne des 28 jours décalée d'un jour, celle des 182 jours, 7 reps
// comptées lourdes, une variante à la machine comptée, le record daté de sa
// dernière fois, une chauffe comptée.
//
// Environnement node, fuseau Europe/Paris : le jour local d'une séance décide
// de sa fenêtre et de sa semaine.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');

// Samedi 10 octobre 2026, 20 h : les séances du jour sont avant lui.
const AUJ = new Date(2026, 9, 10, 20, 0, 0);
// Le jour d'il y a `n` jours, à `h` heures (heure locale).
const ilYa = (n, h) => new Date(2026, 9, 10 - n, h === undefined ? 18 : h, 0, 0);

const fiche = (slug, equipement, mouvement, prim) => ({ slug, nom: slug, mesure: 'charge_reps', charge: 'externe',
  equipement, mouvement, muscles_primaires: prim, muscles_secondaires: [], muscles_stabilisateurs: [] });
const CATALOGUE = [
  fiche('squat_barre', 'barre', 'squat', ['quadriceps']),
  fiche('squat_pause_barre', 'barre', 'squat', ['quadriceps']),
  fiche('hack_squat_machine', 'machine', 'squat', ['quadriceps']),
  fiche('developpe_couche_barre', 'barre', 'couche', ['pectoraux']),
  fiche('developpe_couche_haltere', 'halteres', 'couche', ['pectoraux']),
  fiche('souleve_de_terre_barre', 'barre', 'souleve', ['fessiers']),
  fiche('developpe_militaire_barre', 'barre', 'militaire', ['deltoide_anterieur'])
];

// Une séance : `debut` (Date), ses séries `[slug, kg, reps, type]`.
function corpus(specs) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(), fin: null });
    parSeance[id] = sp.series.map(([slug, kg, reps, type], k) => ({ id: id + '-' + k, session_id: id, rang: k,
      exercise_slug: slug, charge_kg: kg, reps, type_serie: type || 'travail' }));
    parSeance[id].forEach((x) => series.push(x));
  });
  seances.sort((a, b) => String(b.debut).localeCompare(String(a.debut)));
  const index = Modele.indexerExercices(CATALOGUE);
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
}
const bilan = (specs) => Faits.creer().barresDuBilan(corpus(specs), AUJ);

describe('66A — barresDuBilan, le fait des barres (§5 ter.2)', () => {
  test('les quatre barres, dans l’ordre de la spec ; seule une barre avec une série de travail est présente', () => {
    expect(Faits.creer().BARRES_DU_BILAN).toEqual(['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre',
      'developpe_militaire_barre']);
    const b = bilan([
      { debut: ilYa(3), series: [['developpe_militaire_barre', 50, 5], ['developpe_couche_barre', 100, 5],
        ['squat_barre', 120, 5]] },
      // Le soulevé : rien que des chauffes — absent.
      { debut: ilYa(2), series: [['souleve_de_terre_barre', 100, 5, 'echauffement'], ['souleve_de_terre_barre', 140, 3, 'echauffement']] }
    ]);
    expect(Object.keys(b)).toEqual(['squat_barre', 'developpe_couche_barre', 'developpe_militaire_barre']);
    expect(b.squat_barre).toEqual({ record: { charge: 120, date: '2026-10-07' },
      recent: { charge: 120, reps: 5, date: '2026-10-07' }, semaines: 1, lourdes: 1, variantes: 0 });
  });

  test('une série récente : les 28 derniers jours, aujourd’hui compris — le 27ᵉ jour en arrière compte, le 28ᵉ non', () => {
    const b = bilan([
      // Il y a 28 jours, tard le soir : hors fenêtre, même plus lourde.
      { debut: ilYa(28, 23), series: [['squat_barre', 150, 3]] },
      // Il y a 27 jours, tôt le matin : dans la fenêtre.
      { debut: ilYa(27, 0), series: [['squat_barre', 130, 3]] }
    ]);
    expect(b.squat_barre.recent).toEqual({ charge: 130, reps: 3, date: '2026-09-13' });
    // Sans la séance d'il y a 27 jours : plus de série récente, la barre reste (son record).
    const seul = bilan([{ debut: ilYa(28, 23), series: [['squat_barre', 150, 3]] }]);
    expect(seul.squat_barre.recent).toBeNull();
    expect(seul.squat_barre.record).toEqual({ charge: 150, date: '2026-09-12' });
  });

  test('une série récente : la plus lourde, puis le plus de reps, puis la plus récente ; jamais 0 rep', () => {
    expect(bilan([
      { debut: ilYa(10), series: [['squat_barre', 130, 4]] },
      { debut: ilYa(5), series: [['squat_barre', 130, 3], ['squat_barre', 125, 8], ['squat_barre', 160, 0]] }
    ]).squat_barre.recent).toEqual({ charge: 130, reps: 4, date: '2026-09-30' });
    expect(bilan([
      { debut: ilYa(10), series: [['squat_barre', 130, 4]] },
      { debut: ilYa(5), series: [['squat_barre', 130, 4]] }
    ]).squat_barre.recent).toEqual({ charge: 130, reps: 4, date: '2026-10-05' });
  });

  test('les semaines et les séries lourdes : les 182 derniers jours — le 181ᵉ jour en arrière compte, le 182ᵉ non', () => {
    const b = bilan([
      { debut: ilYa(182, 23), series: [['squat_barre', 100, 3], ['squat_pause_barre', 90, 3]] },
      { debut: ilYa(181, 0), series: [['squat_barre', 100, 3], ['squat_pause_barre', 90, 3]] }
    ]);
    expect(b.squat_barre.semaines).toBe(1);
    expect(b.squat_barre.lourdes).toBe(1);
    expect(b.squat_barre.variantes).toBe(1);
    // Hors des 182 jours : la barre reste (son record), sans semaine, sans série lourde.
    const vieux = bilan([{ debut: ilYa(182, 23), series: [['squat_barre', 100, 3]] }]);
    expect(vieux.squat_barre).toEqual({ record: { charge: 100, date: '2026-04-11' }, recent: null, semaines: 0,
      lourdes: 0, variantes: 0 });
  });

  test('les semaines : lundi → dimanche, heure locale ; deux séances d’une même semaine font une semaine', () => {
    const b = bilan([
      // Lundi 28 sept. et dimanche 4 oct. : une semaine. Lundi 5 oct. : la suivante.
      { debut: new Date(2026, 8, 28, 7), series: [['developpe_couche_barre', 100, 8]] },
      { debut: new Date(2026, 9, 4, 22), series: [['developpe_couche_barre', 100, 8]] },
      { debut: new Date(2026, 9, 5, 0, 30), series: [['developpe_couche_barre', 100, 8]] }
    ]);
    expect(b.developpe_couche_barre.semaines).toBe(2);
    const lundis = [new Date(2026, 8, 28, 7), new Date(2026, 9, 4, 22), new Date(2026, 9, 5, 0, 30)]
      .map((d) => Semaine.bornesSemaine(d).lundi.getTime());
    expect(new Set(lundis).size).toBe(2);
  });

  test('une série lourde : de 1 à 6 reps — 6 compte, 7 non', () => {
    const b = bilan([{ debut: ilYa(4), series: [['developpe_couche_barre', 100, 6], ['developpe_couche_barre', 95, 7],
      ['developpe_couche_barre', 110, 1], ['developpe_couche_barre', 90, 12]] }]);
    expect(b.developpe_couche_barre.lourdes).toBe(2);
  });

  test('une variante à la barre compte (même mouvement, barre, autre exercice) ; à la machine ou aux haltères, non', () => {
    const b = bilan([{ debut: ilYa(6), series: [['squat_barre', 120, 5], ['squat_pause_barre', 100, 3],
      ['squat_pause_barre', 100, 3], ['hack_squat_machine', 150, 8], ['hack_squat_machine', 150, 8],
      ['developpe_couche_barre', 100, 5], ['developpe_couche_haltere', 40, 10]] }]);
    expect(b.squat_barre.variantes).toBe(2);
    expect(b.developpe_couche_barre.variantes).toBe(0);
    // Une variante seule ne fait pas apparaître la barre.
    expect(Object.keys(bilan([{ debut: ilYa(6), series: [['squat_pause_barre', 100, 3]] }]))).toEqual([]);
  });

  test('le record : la charge la plus lourde, datée de la PREMIÈRE fois qu’elle a été soulevée', () => {
    const b = bilan([
      { debut: ilYa(300), series: [['souleve_de_terre_barre', 170, 1]] },
      { debut: ilYa(120), series: [['souleve_de_terre_barre', 160, 5]] },
      { debut: ilYa(40), series: [['souleve_de_terre_barre', 170, 1]] }
    ]);
    expect(b.souleve_de_terre_barre.record).toEqual({ charge: 170, date: '2025-12-14' });
    // La fonction des records de la page d'exercice, pas un recalcul : même charge, même date.
    const c = corpus([
      { debut: ilYa(300), series: [['souleve_de_terre_barre', 170, 1]] },
      { debut: ilYa(40), series: [['souleve_de_terre_barre', 170, 1]] }
    ]);
    const f = Faits.creer();
    const lourde = Modele.recordsDeLExercice(f.seancesDuSlug(c, 'souleve_de_terre_barre'), AUJ,
      Modele.optionsDeRecord(c.catalogue().souleve_de_terre_barre)).lourde;
    expect(f.barresDuBilan(c, AUJ).souleve_de_terre_barre.record.charge).toBe(lourde.charge);
  });

  test('une chauffe ne compte jamais : ni record, ni série récente, ni semaine, ni série lourde, ni variante', () => {
    const b = bilan([
      { debut: ilYa(3), series: [['squat_barre', 200, 1, 'echauffement'], ['squat_barre', 120, 5],
        ['squat_pause_barre', 100, 3, 'echauffement']] },
      { debut: ilYa(20), series: [['squat_barre', 60, 3, 'echauffement']] }
    ]);
    expect(b.squat_barre).toEqual({ record: { charge: 120, date: '2026-10-07' },
      recent: { charge: 120, reps: 5, date: '2026-10-07' }, semaines: 1, lourdes: 1, variantes: 0 });
  });

  test('pur : le corpus n’est pas modifié, et deux appels rendent la même chose', () => {
    const c = corpus([{ debut: ilYa(3), series: [['squat_barre', 120, 5], ['squat_pause_barre', 100, 3]] }]);
    const avant = JSON.stringify({ s: c.seances, x: c.series });
    const f = Faits.creer();
    const a = f.barresDuBilan(c, AUJ);
    expect(f.barresDuBilan(c, AUJ)).toEqual(a);
    expect(JSON.stringify({ s: c.seances, x: c.series })).toBe(avant);
  });
});
