/** @jest-environment node */
//
// 64A — LE FAIT `faitsDuJeu` (`v2/js/faits.js`, JEU-V1 §8) : l'entrée du jeu,
// assemblée avec ce que le module des faits sait déjà. Il nourrit le jeu, il ne
// le lit pas.
//
// Le corpus est de papier : les quatre barres faites dans un ordre qui n'est pas
// celui de `BARRES_DU_JEU`, une randonnée, des chauffes, et des séries d'une
// séance absente de `c.seances` (une séance en cours, ou orpheline) — elles
// n'entrent pas dans l'entrée du jeu.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');

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

const AUJ = new Date(2026, 9, 9);
const jourDe = (ilYa) => new Date(2026, 9, 9 - ilYa, 18, 0, 0);

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', equipement: 'barre',
    muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe',
    equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
  { slug: 'souleve_de_terre_barre', nom: 'Soulevé de Terre (Barre)', mesure: 'charge_reps', charge: 'externe',
    equipement: 'barre', muscles_primaires: ['fessiers'], muscles_secondaires: [] },
  { slug: 'developpe_militaire_barre', nom: 'Développé Militaire (Barre)', mesure: 'charge_reps', charge: 'externe',
    equipement: 'barre', muscles_primaires: ['deltoide_anterieur'], muscles_secondaires: [] },
  { slug: 'randonnee', nom: 'Randonnée', mesure: 'distance_temps', charge: 'aucune', equipement: 'aucun',
    muscles_primaires: [], muscles_secondaires: [] }
];

// Une séance : `debut`, ses séries. `orphelines` : des séries d'une séance que `c.seances` ne porte pas.
function corpus(specs, orphelines) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(), fin: null, titre: 'Séance ' + i });
    parSeance[id] = sp.series.map((x, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k }, x));
    parSeance[id].forEach((x) => series.push(x));
  });
  (orphelines || []).forEach((x, k) => series.push(Object.assign({ id: 'o-' + k, session_id: 'en-cours', type_serie: 'travail', rang: k }, x)));
  seances.sort((a, b) => String(b.debut).localeCompare(String(a.debut)));
  const index = Modele.indexerExercices(CATALOGUE);
  const journal = [
    { set_id: 's1-0', session_id: 's1', exercise_slug: 'squat_barre', type: 'charge_max', battu_le: jourDe(8).toISOString() },
    { set_id: 's1-0', session_id: 's1', exercise_slug: 'squat_barre', type: 'charge_a_reps', battu_le: jourDe(8).toISOString() }
  ];
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal };
}

const s = (slug, kg, reps, extra) => Object.assign({ exercise_slug: slug, charge_kg: kg, reps }, extra || {});
function historique() {
  return corpus([
    { debut: jourDe(10), series: [s('developpe_militaire_barre', 60, 5)] },
    { debut: jourDe(8), series: [s('squat_barre', 140, 3), s('squat_barre', 60, 5, { type_serie: 'echauffement' })] },
    { debut: jourDe(5), series: [s('souleve_de_terre_barre', 170, 1), s('developpe_couche_barre', 140, 1)] },
    { debut: jourDe(2), series: [s('randonnee', null, null, { duree_s: 7200, distance_m: 12000 })] }
  ], [
    // La séance en cours : un squat plus lourd, que le jeu ne doit pas voir.
    s('squat_barre', 200, 1), s('randonnee', null, null, { duree_s: 3600, distance_m: 25000 })
  ]);
}

describe('64A — faitsDuJeu, l’entrée du jeu (JEU-V1 §8)', () => {
  test('les barres du jeu : les quatre, dans leur ordre, nommées une fois dans faits.js', () => {
    const f = Faits.creer();
    expect(f.BARRES_DU_JEU).toEqual(['developpe_couche_barre', 'squat_barre', 'souleve_de_terre_barre',
      'developpe_militaire_barre']);
  });

  test('il rend les sept champs, et seulement eux', () => {
    const e = Faits.creer().faitsDuJeu(historique(), AUJ);
    expect(Object.keys(e).sort()).toEqual(['aujourdhui', 'catalogue', 'exercicesFaits', 'journal', 'maximums',
      'seances', 'series'].sort());
    expect(e.aujourdhui).toBe(AUJ);
  });

  test('les séances : `{ id, debut }`, toutes celles du cache', () => {
    const c = historique();
    const e = Faits.creer().faitsDuJeu(c, AUJ);
    expect(e.seances).toEqual(c.seances.map((x) => ({ id: x.id, debut: x.debut })));
  });

  test('⚠️ une série dont la séance n’est pas dans `c.seances` n’y entre pas', () => {
    const c = historique();
    const e = Faits.creer().faitsDuJeu(c, AUJ);
    // La fixture porte bien des orphelines : sinon ce test ne prouverait rien.
    expect(c.series.filter((x) => x.session_id === 'en-cours').length).toBe(2);
    expect(e.series.filter((x) => x.session_id === 'en-cours')).toEqual([]);
    expect(e.series.length).toBe(c.series.length - 2);
    const ids = new Set(e.seances.map((x) => x.id));
    expect(e.series.every((x) => ids.has(x.session_id))).toBe(true);
    // Les chauffes restent : c'est le jeu qui ne compte que le travail (`Modele.estTravail`).
    expect(e.series.some((x) => x.type_serie === 'echauffement')).toBe(true);
  });

  test('les maximums suivent l’ordre de BARRES_DU_JEU (pas l’ordre des séances), ceux de `ceQueJeSais`', () => {
    const c = historique();
    const f = Faits.creer();
    const e = f.faitsDuJeu(c, AUJ);
    expect(e.maximums.map((x) => x.slug)).toEqual(f.BARRES_DU_JEU);
    expect(e.maximums).toEqual(Faits.creer().ceQueJeSais(c, AUJ, f.BARRES_DU_JEU).maximums);
    expect(e.maximums.filter((x) => x.slug === 'squat_barre')[0].charge).toBe(140);
  });

  test('le catalogue, le journal et les exercices faits : ceux du module', () => {
    const c = historique();
    const e = Faits.creer().faitsDuJeu(c, AUJ);
    expect(e.catalogue).toBe(c.catalogue());
    expect(e.journal).toEqual(Faits.creer().recordsDuJournal(c));
    expect(e.journal.length).toBe(2);
    expect(e.exercicesFaits).toBe(Faits.creer().compterExercices(c).faits);
    expect(e.exercicesFaits).toBe(5);
  });

  test('⚠️ il ne lit ni n’appelle le jeu (les faits nourrissent le jeu, ils ne le lisent pas)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/faits.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/\bTHJeu\b|\betatDuJeu\b/.test(src)).toBe(false);
    // Et à l'exécution : un jeu piégé, que toute lecture ferait tomber.
    const avant = global.THJeu;
    global.THJeu = new Proxy({}, { get: () => { throw new Error('faitsDuJeu a lu THJeu'); } });
    try {
      expect(() => Faits.creer().faitsDuJeu(historique(), AUJ)).not.toThrow();
    } finally {
      if (avant === undefined) delete global.THJeu; else global.THJeu = avant;
    }
  });

  test('le jeu lit l’entrée telle quelle : la séance en cours n’y compte pas', () => {
    const Jeu = require('../../v2/js/jeu.js');
    const etat = Jeu.etatDuJeu(Faits.creer().faitsDuJeu(historique(), AUJ));
    expect(etat.semaines.actives).toBe(2);
    expect(etat.muscles.jambes.points).toBe(2);              // le squat de 140 (1) et le soulevé (1) ; pas la chauffe
    expect(etat.succes.ids).not.toContain('rando-sortie-20');  // les 25 km sont dans la séance en cours
    expect(etat.succes.ids).toContain('cap-squat_barre-140');
    expect(etat.succes.ids).not.toContain('cap-squat_barre-160');
  });
});
