/** @jest-environment node */
//
// 222 — PROGRESSION, UN SEUL FIL : (1) les tonnes et les séries du bloc « mois » du sommaire sont celles de la story
// (`faits.bilanDePeriode`, plus `Bilan.bilanDuMois`) ; (2) le radar de Volume lit `faits.fenetreDe`, qui rend les mêmes zones
// et le même bilan que l'ancien découpage de `local.*` ; (3) la semaine affichée garde ses chiffres.

process.env.TZ = 'Europe/Paris';
global.self = global;
const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
const Bilan = require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Periode = require('../../v2/js/periode.js');
require('../../v2/js/poids.js');
require('../../v2/js/parcours.js');
const Bilans = require('../../v2/js/bilans.js');
const Faits = require('../../v2/js/faits.js');

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'] },
  { slug: 'developpe_couche_barre', nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
  { slug: 'tirage_vertical', nom: 'Tirage', equipement: 'machine', mesure: 'charge_reps', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'] }
];
const seances = [], series = [];
// 120 jours d'historique synthétique, une séance tous les 2 jours, du 1er juillet au 28 octobre 2026.
for (let i = 0; i < 60; i++) {
  const d = new Date(2026, 6, 1 + i * 2, 18, 0, 0);
  const id = 's' + i;
  seances.push({ id, debut: d.toISOString(), fin: new Date(d.getTime() + 3600000).toISOString() });
  CATALOGUE.forEach((e, k) => {
    for (let r = 0; r < 3; r++) {
      series.push({ id: id + '-' + k + '-' + r, session_id: id, exercise_slug: e.slug, type_serie: 'travail',
        charge_kg: 40 + k * 20 + (i % 7), reps: 5 + (r % 3), rang: k * 3 + r + 1 });
    }
  });
}
seances.sort((a, b) => b.debut.localeCompare(a.debut));
const parSeance = {};
series.forEach((s) => { (parSeance[s.session_id] = parSeance[s.session_id] || []).push(s); });
const index = Modele.indexerExercices(CATALOGUE);
const c = { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => index, journal: [] };
const f = Faits.creer();

describe('222 — le bloc du mois du sommaire lit la story', () => {
  ['2026-08', '2026-09', '2026-10'].forEach((mois) => {
    test('tonnes et séries de ' + mois + ' : sommaire = story', () => {
      const ancien = Bilan.bilanDuMois({ mois, seances: f.seancesAvecSeries(c), exercices: CATALOGUE });
      const story = f.bilanDePeriode(c, Bilans.periodeDuMois(mois), new Date(2026, 10, 2, 12), { pesees: [], paris: [] });
      expect(story.tonnes.kg).toBe(ancien.volume_kg);
      expect(story.reps.series).toBe(ancien.series);
      expect(story.tonnes.kg).toBeGreaterThan(0);
    });
  });
});

describe('222 — le radar de Volume lit le fait', () => {
  [7, 30, 90].forEach((jours) => {
    test('fenêtre de ' + jours + ' jours : mêmes zones et même bilan que l’ancien découpage', () => {
      const fen = Periode.fenetres(jours, new Date(2026, 9, 28, 20));
      ['courante', 'precedente'].forEach((cle) => {
        const d = Periode.decouper(seances, series, fen[cle]);
        const fait = f.fenetreDe(c, fen[cle]);
        expect(fait.zones).toEqual(Semaine.volumeParZone(d.series, CATALOGUE));
        expect(fait.bilan).toEqual(Semaine.bilanSemaine(d.seances, d.series, CATALOGUE));
        expect(fait.seances.length).toBe(d.seances.length);
      });
    });
  });
  test('la semaine affichée garde ses zones', () => {
    const lundi = Semaine.bornesSemaine(new Date(2026, 9, 26)).lundi;
    const sem = f.semaineDe(c, lundi);
    expect(sem.zones).toEqual(Semaine.volumeParZone(sem.series, CATALOGUE));
    expect(sem.seances.length).toBeGreaterThan(0);
  });
});
