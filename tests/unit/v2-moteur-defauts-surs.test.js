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

describe('b2 (2) — une seule table de crans de repli (REPLI_MATERIEL) : la réaction au raté la lit', () => {
  const serie = (materiel, charge, reps) => M.reactionAuRate({ niveau: 'serie', role: 'travail', materiel: materiel, reps: reps, vise: 10, bas: 8, charge: charge, rang: 1, reserve: 0 });
  const paris = (materiel, charge) => M.reactionAuRate({ niveau: 'paris', materiel: materiel, n: 2, charge: charge, reps: 8 });
  test('une machine sans cran connu baisse d\'un cran de machine (5 kg), pas de 2,5 kg', () => {
    const r = serie('machine', 100, 6);                  // 82,5 kg avec l'ancien pas de 2,5
    expect(r.charge && r.charge.action).toBe('baisse');
    expect(r.charge.kg).toBe(80);
    expect(serie('machine', 120, 5).charge.kg).toBe(95);   // 97,5 avant
  });
  test('un kettlebell baisse de 4 kg (la série 8 · 12 · 16 · 20 · 24)', () => {
    expect(serie('kettlebell', 24, 5).charge.kg).toBe(16);   // 17,5 avant
  });
  test('le « un cran dessous » des paris lit la même table : machine 100 kg → 95 kg', () => {
    expect(paris('machine', 100).cran.charge).toBe(95);
  });
  test('la table propre à la réaction a disparu : chaque matériel connu a le pas de REPLI_MATERIEL', () => {
    expect(M.pasDeRepliDe('machine')).toBe(5);
    expect(M.pasDeRepliDe('kettlebell')).toBe(4);
    expect(M.pasDeRepliDe('poulie')).toBe(2.5);
    expect(M.pasDeRepliDe('haltere')).toBe(2);
    expect(M.pasDeRepliDe('haltere_seul')).toBe(1);
    expect(M.pasDeRepliDe('inconnu')).toBe(2.5);
  });
});
