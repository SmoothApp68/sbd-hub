/** @jest-environment node */
//
// 60-4 — LE FAIT `historiqueDesExercices` (`v2/js/faits.js`) : par exercice, le nombre de séances avec au moins une
// série de travail, sur les 84 jours qui finissent à la DERNIÈRE séance de la personne (QUESTIONNAIRE-COACH-V2 §5 bis).
// Le générateur en ordonne ses candidats ; la fenêtre est celle du programme déduit (`Routines.fenetreDeLaPersonne`).
//
// Le corpus est de papier, daté à partir d'un jour fixe : chaque règle a son cas.

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
const Routines = require('../../v2/js/routines.js');
const Faits = require('../../v2/js/faits.js');

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['quadriceps'] },
  { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] },
  { slug: 'tapis_roulant', nom: 'Tapis roulant', mesure: 'distance_temps', equipement: 'machine', muscles_primaires: [] }
];

const jour = (a, m, j, h) => new Date(a, m, j, h === undefined ? 18 : h, 0, 0);

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
const S = (slug, extra) => Object.assign({ exercise_slug: slug, charge_kg: 60, reps: 5 }, extra || {});

describe('60-4 — Faits.historiqueDesExercices', () => {
  test('sans séance, rien', () => {
    expect(Faits.creer().historiqueDesExercices(corpus([]))).toEqual({});
  });

  test('compte les SÉANCES, pas les séries : trois séries d’un exercice dans une séance, c’est une séance', () => {
    const c = corpus([
      { debut: jour(2026, 9, 1), series: [S('squat_barre'), S('squat_barre'), S('squat_barre'), S('developpe_couche_barre')] },
      { debut: jour(2026, 9, 3), series: [S('squat_barre')] }
    ]);
    expect(Faits.creer().historiqueDesExercices(c)).toEqual({ squat_barre: 2, developpe_couche_barre: 1 });
  });

  test('⚠️ seules les séries de TRAVAIL comptent : une chauffe ne fait pas un exercice fait', () => {
    const c = corpus([
      { debut: jour(2026, 9, 1), series: [S('squat_barre', { type_serie: 'echauffement' }), S('developpe_couche_barre')] },
      { debut: jour(2026, 9, 3), series: [S('squat_barre', { type_serie: 'echauffement' }), S('squat_barre')] }
    ]);
    expect(Faits.creer().historiqueDesExercices(c)).toEqual({ developpe_couche_barre: 1, squat_barre: 1 });
  });

  test('le cardio compte (une série de travail) : le tapis est un exercice fait', () => {
    const c = corpus([{ debut: jour(2026, 9, 1), series: [S('tapis_roulant', { charge_kg: null, reps: null })] }]);
    expect(Faits.creer().historiqueDesExercices(c)).toEqual({ tapis_roulant: 1 });
  });

  test('⚠️ LA FENÊTRE FINIT À LA DERNIÈRE SÉANCE de la personne, pas aujourd’hui : un historique arrêté en juin se lit', () => {
    // Dernière séance le 15 juin 2026 ; « aujourd’hui » (octobre) n’y change rien. 84 jours : du 24 mars au 15 juin.
    const c = corpus([
      { debut: jour(2026, 5, 15), series: [S('squat_barre')] },
      { debut: jour(2026, 4, 1), series: [S('squat_barre')] },
      { debut: jour(2026, 2, 24, 8), series: [S('developpe_couche_barre')] },     // le premier jour de la fenêtre : dedans
      { debut: jour(2026, 2, 23, 22), series: [S('developpe_couche_barre')] }     // la veille : dehors
    ]);
    expect(Faits.creer().historiqueDesExercices(c)).toEqual({ squat_barre: 2, developpe_couche_barre: 1 });
  });

  test('⚠️ la fenêtre est CELLE du programme déduit : la même fonction, pas une copie', () => {
    const f = Routines.fenetreDeLaPersonne(jour(2026, 5, 15).toISOString());
    expect(f.jours).toBe(84);
    expect(f.fin.getDate()).toBe(15);
    expect(f.debut.getMonth()).toBe(2);
    expect(f.debut.getDate()).toBe(24);
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/faits.js'), 'utf8');
    const debut = src.indexOf('function historiqueDesExercices');
    const corps = src.slice(debut, src.indexOf('// ── Les exercices faits', debut))
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(debut).toBeGreaterThan(0);
    expect(corps).toMatch(/THRoutines\.fenetreDeLaPersonne\(/);
    expect(corps).not.toMatch(/\b84\b|fenetres\(/);
  });

  test('les séances sans série n’y comptent pas, ni pour la fenêtre ni pour l’exercice', () => {
    const c = corpus([
      { debut: jour(2026, 9, 1), series: [S('squat_barre')] },
      { debut: jour(2026, 9, 20), series: [] }
    ]);
    // La séance du 20, sans série, ne recule pas la fin de la fenêtre.
    expect(Faits.creer().historiqueDesExercices(c)).toEqual({ squat_barre: 1 });
  });

  test('une séance sans date lisible est ignorée', () => {
    const c = corpus([{ debut: jour(2026, 9, 1), series: [S('squat_barre')] }]);
    c.seances.push({ id: 'x', debut: 'pas une date', fin: null });
    expect(Faits.creer().historiqueDesExercices(c)).toEqual({ squat_barre: 1 });
  });
});
