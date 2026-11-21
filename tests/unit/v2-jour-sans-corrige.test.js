/** @jest-environment node */
//
// Le jour sans, trois défauts d'interaction prouvés par une relecture à froid (21/11/2026, MOTEUR §9.42 bis delta 21/11/2026), avec la même histoire que
// `v2-jour-sans.test.js` : squat, Normal, zone Lourd 3-5 ; 8 et 12 nov. 140 × 3 + reculs 125 × 6 ; 16 nov. le zéro ; 20 nov. la séance légère 132,5 × 4 ; 24 nov. le retour.
//   1. une séance légère d'un jour sans ne sert jamais de palier de comparaison (`sansPalierRetenues`, 193-1) ;
//   2. les rejeux de la consigne REÇUE (capacité tenue I252, règle de bord) lisent l'histoire avec ses drapeaux de zéro (`opt.brutes`) ;
//   3. le jeton du jour sans ne se lève que sur une séance RÉUSSIE à la charge (jamais un retour raté).

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
require('../../v2/js/seance.js');
require('../../v2/js/plan.js');
const sp = (t) => String(t == null ? '' : t).replace(/[\u00a0\u202f]/g, ' ');

const g = (kg, reps, t, rpe) => ({ charge_kg: kg, reps, type_serie: t || 'travail', rpe: rpe === undefined ? null : rpe });
const jour = (i) => new Date(Date.UTC(2026, 10, 8 + i * 4, 18)).toISOString();
const seance = (i, series) => ({ seance: { id: 'H' + i, debut: jour(i) }, series: series.map((s, j) => Object.assign({ id: 'h' + i + '_' + j, rang: j, ressenti: null, exercise_slug: 'squat' }, s)) });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
const avantDe = (liste) => new Date(Date.parse(jour(liste.length - 1)) + 4 * 864e5).toISOString();
const K = (liste) => M.consigneDExercice(liste.map((s, i) => seance(i, s)), undefined, avantDe(liste), OPT).consigne;
const gris = (k) => sp(M.libellesConsigne(k).gris);

const bonne = () => [g(140, 3), g(125, 6, 'recul'), g(125, 6, 'recul')];
const zero = () => [g(140, 0, 'echec'), g(125, 0, 'recul'), g(125, 0, 'recul')];
const legere = () => [g(132.5, 4), g(117.5, 6, 'recul'), g(117.5, 6, 'recul')];
const rate = () => [g(140, 2, 'travail', 10), g(125, 6, 'recul'), g(125, 6, 'recul')];   // une seule grosse série, sous la zone, sans marge, reculs tenus
const h = [bonne(), bonne()];

describe('Défaut 1 — la séance légère d\'un jour sans n\'est jamais le palier de comparaison (193-1)', () => {
  test('le retour raté à 140 × 2 sans marge, reculs tenus : « Tu restes à 140 kg × 2 » (avant : 140 × 4, « Une rep de plus »)', () => {
    const k = K([...h, zero(), legere(), rate()]);
    expect(k.etat).toBe('progression');
    expect([k.ligne.charge, k.ligne.vise]).toEqual([140, 2]);
    expect(gris(k)).toBe('Le 24 nov. : 140 kg × 2, la dernière sans marge. Tu restes à 140 kg × 2.');
  });
  test('la même séance sans jour sans (témoin) dit la même chose : la règle ne dépend pas de la séance légère', () => {
    const k = K([...h, rate()]);
    expect([k.ligne.charge, k.ligne.vise]).toEqual([140, 2]);
    expect(gris(k)).toMatch(/Tu restes à 140 kg × 2\.$/);
  });
  test('193-1 intacte : un test raté à une seule grosse série PLUS LOURDE que le palier tenu (152,5 × 2 après 150 × 4) reste neutre', () => {
    const t = () => [g(150, 4), g(135, 6, 'recul'), g(135, 6, 'recul')];
    const k = K([t(), t(), [g(152.5, 2, 'travail', 10), g(135, 6, 'recul'), g(135, 6, 'recul')]]);
    expect(k.palier).toBe(150);
  });
});

describe('Défaut 2 — la consigne reçue rejouée connaît le jour sans (capacité tenue, I252 / I254)', () => {
  const retourFait = () => [g(140, 5, 'travail', 10), g(125, 6, 'recul'), g(125, 6, 'recul')];
  test('le retour affiché est « 140 kg × 3 » ; 140 × 5 sans marge tient la capacité (5 + 0 ≥ 3 + 2), aucune garde', () => {
    const affiche = K([...h, zero(), legere()]);
    expect(affiche.etat).toBe('retour_jour_sans');
    expect([affiche.ligne.charge, affiche.ligne.vise]).toEqual([140, 3]);
    const k = K([...h, zero(), legere(), retourFait()]);
    expect(k.fondement.capacite).toMatchObject({ charge: 140, reps: 5, vise: 3, reserve: 0, visee: 2 });
    expect((k.fondement.effortVise || {}).effet).not.toBe('garde');
    expect(sp(M.annonceDe('effort', { ev: null, capacite: k.fondement.capacite, moment: 'apres' }))).toBe('140 kg × 5, sans marge : 2 de plus que prévu.');
  });
});

describe('Défaut 3 — le jeton du jour sans ne se lève que sur une séance réussie', () => {
  const b3 = () => [g(140, 3), g(140, 3), g(140, 3)];
  const z3 = () => [g(140, 0, 'echec'), g(140, 0, 'echec'), g(140, 0, 'echec')];
  const l3 = () => [g(132.5, 4), g(132.5, 4), g(132.5, 4)];
  const r3 = (n) => [g(140, n, 'travail', 10), g(140, n, 'travail', 10), g(140, n, 'travail', 10)];
  const jourSans = (k) => !!(k.fondement && k.fondement.zeroRep && k.fondement.zeroRep.jourSans);
  test('0, légère, retour RATÉ (140 × 2), 0 : la règle B (la vraie baisse), jamais un 2e jour sans', () => {
    const k = K([b3(), b3(), z3(), l3(), r3(2), z3()]);
    expect(k.etat).toBe('zero_rep');
    expect(jourSans(k)).toBe(false);
    expect(gris(k)).toBe('140 kg × 0 : pas encore. Je baisse à 132,5 kg.');
  });
  test('0, légère, retour 140 × 2 / 1 / 1, 0 : la règle B aussi', () => {
    const r = [g(140, 2, 'travail', 10), g(140, 1, 'travail', 10), g(140, 1, 'travail', 10)];
    expect(jourSans(K([b3(), b3(), z3(), l3(), r, z3()]))).toBe(false);
  });
  test('0, légère, retour RÉUSSI (140 × 3), 0 : le jeton est levé, un nouveau jour sans', () => {
    const k = K([b3(), b3(), z3(), l3(), r3(3), z3()]);
    expect(jourSans(k)).toBe(true);
  });
  test('0, légère, 0 : toujours la règle B (inchangé)', () => {
    expect(jourSans(K([b3(), b3(), z3(), l3(), z3()]))).toBe(false);
  });
});
