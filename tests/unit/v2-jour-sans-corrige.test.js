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
const zero = (c) => [g(c || 140, 0, 'echec'), g(125, 0, 'recul'), g(125, 0, 'recul')];
const legere = () => [g(132.5, 4), g(117.5, 6, 'recul'), g(117.5, 6, 'recul')];
const rate = (c) => [g(c || 140, 2, 'travail', 10), g(125, 6, 'recul'), g(125, 6, 'recul')];   // une seule grosse série, sous la zone, sans marge, reculs tenus
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
  test('193-1 intacte APRÈS un zéro (règle B, `zone: null`) : essai 145 × 0 puis 147,5 × 2 sans marge, une seule grosse série : la séance est neutre, « Une rep de plus : 140 kg × 4 »', () => {
    const k = K([...h, zero(145), rate(147.5)]);
    expect(k.palier).toBe(140);
    expect([k.ligne.charge, k.ligne.vise]).toEqual([140, 4]);
    expect(gris(k)).toBe('Le 12 nov. : 140 kg × 3. Une rep de plus : 140 kg × 4.');
    expect(gris(K([...h, rate(147.5)]))).toBe(gris(k));   // le témoin sans zéro
  });
  test('193-1 intacte sans zéro : 152,5 × 2 après 150 × 4 reste neutre', () => {
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

describe('Défaut 2 bis — le zéro ne remet pas à zéro le compte long de la règle de bord (`_bord`, `_lues` suivent `base`)', () => {
  const b3 = (c, r) => [g(c, r, 'travail', 9), g(c, r, 'travail', 9), g(c, r, 'travail', 9)];
  const z3 = (c) => [g(c, 0, 'echec'), g(c, 0, 'echec'), g(c, 0, 'echec')];
  test('140 × 2 trois fois, 0 à 145, 137,5 × 2 : bord_vague, record 140 depuis le 8 nov. (comme avant le jour sans)', () => {
    const k = K([b3(140, 2), b3(140, 2), b3(140, 2), z3(145), b3(137.5, 2)]);
    expect(k.etat).toBe('bord_vague');
    expect(k._bord).toMatchObject({ record: 140, total: 3, depuisRecord: jour(0) });
  });
  test('la consigne `zero_rep` porte `_bord` et `_lues`, non énumérables (ni le fondement ni les cas de fichier ne les voient)', () => {
    const k = K([b3(140, 2), b3(140, 2), b3(140, 2), z3(145)]);
    expect(k.etat).toBe('zero_rep');
    expect(k._bord).toBeDefined();
    expect(Object.keys(k)).not.toContain('_bord');
    expect(Object.keys(k)).not.toContain('_lues');
  });
});

describe('Défaut 3 bis — une séance n\'est LA séance légère que si sa charge est strictement sous la charge de travail', () => {
  const plus = () => [g(145, 4, 'travail', 8), g(130, 6, 'recul'), g(130, 6, 'recul')];
  test('0 à 140, puis 145 × 4 (au-dessus de la charge de travail), puis 145 × 2 sans marge : une séance ordinaire, « Tu restes à 145 kg × 2 » (avant : 140 × 4)', () => {
    const k = K([...h, zero(), plus(), rate(145)]);
    expect(gris(k)).toBe('Le 24 nov. : 145 kg × 2, la dernière sans marge. Tu restes à 145 kg × 2.');
    expect(K([...h, zero(), plus()]).etat).not.toBe('retour_jour_sans');
  });
  test('0, 140 × 3 réussi, 140 × 2, 0 : 140 × 3 est une séance ordinaire qui lève le jeton ; le nouveau zéro ouvre un nouveau jour sans (pas la règle B)', () => {
    const k = K([...h, zero(), bonne(), rate(), zero()]);
    expect(k.etat).toBe('zero_rep');
    expect(k.fondement.zeroRep.jourSans).toBeDefined();
    expect(gris(k)).toMatch(/pour cette séance\.$/);
  });
  test('entre la ligne (132,5) et la charge de travail (140) : 0, 137,5 × 4, 135 × 4 restent LA légère, le retour est « 140 kg × 3 » (pas un palier à 137,5)', () => {
    [137.5, 135].forEach((c) => {
      const k = K([...h, zero(), [g(c, 4), g(Math.round(c * 0.89 / 2.5) * 2.5, 6, 'recul'), g(Math.round(c * 0.89 / 2.5) * 2.5, 6, 'recul')]]);
      expect(k.etat).toBe('retour_jour_sans');
      expect([k.palier, k.ligne.charge, k.ligne.vise]).toEqual([140, 140, 3]);
      expect(gris(k)).toBe('Je reviens à ta charge de travail : 140 kg × 3.');
    });
  });
  test('faite à la charge de travail (140 × 3) ou au-dessus (145 × 4) : une séance ordinaire, jamais « retour_jour_sans »', () => {
    expect(K([...h, zero(), bonne()]).etat).not.toBe('retour_jour_sans');
    expect(K([...h, zero(), plus()]).etat).not.toBe('retour_jour_sans');
  });
  test('une séance à la ligne du jour sans (132,5 × 4) reste LA légère, neutre', () => {
    expect(K([...h, zero(), legere()]).etat).toBe('retour_jour_sans');
  });
});
