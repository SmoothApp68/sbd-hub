/** @jest-environment node */
//
// Lot b2 (28/11/2026, SYNTHESE-VAGUE-1 §6) — les défauts sûrs du moteur, chacun avec son test (qui échoue sans son correctif).
// (1) jour sans : « ta grosse série » et « tes reculs » sont deux lectures distinctes.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
require('../../v2/js/bilan.js');
const M = require('../../v2/js/moteur.js');

const g = (kg, reps, t) => ({ charge_kg: kg, reps, type_serie: t || 'travail' });
const jour = (i) => new Date(Date.UTC(2026, 10, 8 + i * 4, 18)).toISOString();
const seance = (i, series, slug) => ({ seance: { id: 'H' + i, debut: jour(i) }, series: series.map((s, j) => Object.assign({ id: 'h' + i + '_' + j, rang: j, rpe: null, ressenti: null, exercise_slug: slug || 'squat' }, s)) });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
const bonne = () => [g(140, 3), g(125, 6, 'recul'), g(125, 6, 'recul')];

describe('b2 (1) — jour sans : la grosse série et les reculs ne sont pas la même expression', () => {
  const js = (zero) => {
    const liste = [bonne(), bonne(), zero];
    const avant = new Date(Date.parse(jour(2)) + 4 * 864e5).toISOString();
    return M.consigneDExercice(liste.map((s, i) => seance(i, s)), undefined, avant, OPT).consigne.fondement.zeroRep.jourSans;
  };
  test('une séance de reculs seuls, tous à 0 : il n\'y a pas de grosse série à dire, les reculs oui', () => {
    expect(js([g(125, 0, 'recul'), g(125, 0, 'recul')])).toMatchObject({ grosse: false, reculs: true });
  });
  test('la grosse série et ses reculs à 0 : les deux', () => {
    expect(js([g(140, 0, 'echec'), g(125, 0, 'recul')])).toMatchObject({ grosse: true, reculs: true });
  });
  test('la grosse série seule à 0 (bloc sans reculs) : ni l\'un ni l\'autre', () => {
    expect(js([g(140, 0, 'echec')])).toMatchObject({ grosse: false, reculs: false });
  });
});
