// Fixtures de v2-equilibres : un catalogue, des semaines, des séances (188-1).
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
require('../../v2/js/moteur.js');
require('../../v2/js/routines.js');
require('../../v2/js/generateur.js');
const Eq = require('../../v2/js/equilibres.js');

const fiche = (nom, prim, sec, schema, mouvement, equipement) => ({
  nom, muscles_primaires: prim, muscles_secondaires: sec || [], muscles_stabilisateurs: [],
  schema_mouvement: schema || null, mouvement: mouvement || null, equipement: equipement || 'machine'
});
const CAT = {
  developpe_couche_barre: fiche('Développé Couché (Barre)', ['pectoraux'], ['triceps'], 'pousser_horizontal', 'couche', 'barre'),
  developpe_incline_halteres: fiche('Développé Incliné (Haltères)', ['pectoraux'], ['triceps'], 'pousser_horizontal', null, 'haltere'),
  developpe_militaire_barre: fiche('Développé Militaire (Barre)', ['deltoide_anterieur'], ['triceps'], 'pousser_vertical', 'militaire', 'barre'),
  tractions: fiche('Tractions', ['grand_dorsal'], ['biceps'], 'tirer_vertical', 'tractions', 'poids_du_corps'),
  rowing_barre: fiche('Rowing Penché (Barre)', ['grand_dorsal', 'haut_du_dos'], ['biceps'], 'tirer_horizontal', 'rowing', 'barre'),
  rowing_poulie: fiche('Rowing Poulie', ['grand_dorsal', 'haut_du_dos'], ['biceps'], 'tirer_horizontal', 'rowing', 'poulie'),
  tirage_poitrine: fiche('Tirage Poitrine', ['grand_dorsal'], ['biceps'], 'tirer_vertical', null, 'poulie'),
  squat_barre: fiche('Squat (Barre)', ['quadriceps', 'fessiers'], ['adducteurs'], 'accroupir', 'squat', 'barre'),
  souleve_de_terre_roumain: fiche('Soulevé de Terre Roumain', ['ischio_jambiers', 'fessiers'], [], 'pencher', null, 'barre'),
  leg_curl: fiche('Leg Curl Assis', ['ischio_jambiers'], [], 'ischios', null, 'machine'),
  leg_curl_allonge: fiche('Leg Curl Allongé', ['ischio_jambiers'], [], 'ischios', null, 'machine'),
  hip_thrust: fiche('Hip Thrust', ['fessiers'], [], 'fessiers', null, 'barre'),
  leg_extension: fiche('Leg Extension', ['quadriceps'], [], 'quadriceps', null, 'machine'),
  curl: fiche('Curl Biceps', ['biceps'], [], 'biceps', null, 'haltere'),
  extension_triceps: fiche('Extension Triceps', ['triceps'], [], 'triceps', null, 'poulie'),
  elevations_laterales: fiche('Élévations Latérales', ['deltoide_lateral'], [], 'epaules_cote', null, 'haltere'),
  oiseau: fiche('Oiseau', ['deltoide_posterieur'], [], 'epaules_arriere', null, 'haltere'),
  rowing_inverse: fiche('Rowing Inversé (Épaules)', ['deltoide_posterieur'], [], 'epaules_arriere', 'rowing', 'poulie'),
  tapis: { nom: 'Tapis', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] }
};

const lundiDe = (i, ref) => { // le lundi de la semaine -i avant la semaine du 26/10/2026
  const d = new Date(2026, 9, 26 - 7 * i);
  return d;
};
const iso = (d, h) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 18, 0, 0); return x.toISOString(); };

// Une base : des semaines (0 = la semaine du 26/10), des séances par semaine, chacune { routine, exos, gestes }.
// `exos` : { slug: nSeries } ou { slug: { n, douleur } }.
function construire(semaines, options) {
  const o = options || {};
  const seances = [], series = [];
  let c = 0;
  Object.keys(semaines).forEach((k) => {
    semaines[k].forEach((s, j) => {
      const id = 's' + (++c);
      seances.push({ id, debut: iso(lundiDe(Number(k)), 10 + j), routine_id: s.routine || null, gestes: s.gestes || [] });
      Object.keys(s.exos).forEach((slug) => {
        const x = s.exos[slug], n = typeof x === 'number' ? x : x.n;
        for (let i = 0; i < n; i++) {
          series.push({ id: id + slug + i, session_id: id, exercise_slug: slug, type_serie: 'travail', reps: 8, charge_kg: 50,
            douleur: typeof x === 'object' && x.douleur ? true : false });
        }
      });
    });
  });
  return { seances, series };
}

const HAUT_A = { couche: 4, rowing: 4, tractions: 3, militaire: 3 };
// Une routine de haut (A) et de bas (B), équilibrées.
const EXOS_A = { developpe_couche_barre: 4, rowing_barre: 4, tractions: 3, developpe_militaire_barre: 3, curl: 3,
  extension_triceps: 3, elevations_laterales: 3, oiseau: 3 };
const EXOS_B = { squat_barre: 4, souleve_de_terre_roumain: 3, leg_curl: 3, leg_extension: 3, hip_thrust: 3 };

function routine(id, nom, exos) {
  return { id, nom, exercices: Object.keys(exos).map((slug, i) => ({ exercise_slug: slug, rang: i,
    series: Array.from({ length: exos[slug] }, () => ({ type_serie: 'travail', reps_visees: 8 })) })) };
}
const R_A = routine('r-a', 'Haut A', EXOS_A), R_B = routine('r-b', 'Bas B', EXOS_B);

// n semaines équilibrées (A + B), de 0 à n-1.
function equilibrees(n, modif) {
  const sem = {};
  for (let i = 0; i < n; i++) {
    sem[i] = [{ routine: 'r-a', exos: Object.assign({}, EXOS_A, modif && modif.a ? modif.a(i) : {}) },
              { routine: 'r-b', exos: Object.assign({}, EXOS_B, modif && modif.b ? modif.b(i) : {}) }];
  }
  return sem;
}

function entree(base, extra) {
  return Object.assign({ jour: '2026-10-28', reglage: 'normal', intention: 'progresser', catalogue: CAT,
    seances: base.seances, series: base.series, routines: [R_A, R_B], priorites: [], programmeDuCoach: false,
    volume: null, ecartes: [], cartes: {} }, extra || {});
}

module.exports = { Eq, CAT, construire, equilibrees, entree, routine, R_A, R_B, EXOS_A, EXOS_B, lundiDe, iso };
