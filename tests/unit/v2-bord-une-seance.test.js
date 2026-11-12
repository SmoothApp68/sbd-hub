/** @jest-environment node */
//
// Chantier « première séance sûre », PR 2 — règle A (MOTEUR §9.1.2, delta 12/11/2026) : la règle de bord ne MONTE jamais sur une
// histoire d'UNE SEULE séance lue. Sous 3 reps, une séance seule ne fait pas une habitude : le coach garde la charge (`bord_garde`,
// `bord.unique`). Dès la deuxième séance lue, la décision 180 s'applique telle quelle. Valeurs écrites à la main (rejeu du 12/11/2026).

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

let n = 0;
const brute = (kg, reps, extra) => Object.assign({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' }, extra || {});
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
// `seances` : chronologique ; une séance = liste de [kg, reps, extra?].
const groupes = (seances) => seances.map((s, i) => ({ seance: { id: 'H' + i, debut: jourN(i) }, series: s.map(([kg, r, ex]) => brute(kg, r, ex)) }));
const r = (seances, options) => M.consigneDExercice(groupes(seances), undefined,
  new Date(Date.parse(jourN(seances.length - 1)) + 3 * 864e5).toISOString(), Object.assign({}, OPTIONS, options || {}));
const trois = (kg, rep) => [[kg, rep], [kg, rep], [kg, rep]];
const DEB = { debutant: true };

describe('A — une seule séance lue sous 3 reps : le coach garde la charge', () => {
  test('a1 — I038 : 20 × 7 puis 25 × 2, 25 × 1 → bord_garde 25 × 1 (main : bord 27,5 × 1)', () => {
    const k = r([[[20, 7], [25, 2], [25, 1]]], DEB).consigne;
    expect(k.etat).toBe('bord_garde');
    expect(k.palier).toBe(25);
    expect(k.niveau).toBe(1);
    expect(k.zone).toBeNull();
    expect(k.ligne).toEqual({ charge: 25, vise: 1 });
    expect(k.haut).toBeNull();
    expect(k.fondement.bord).toEqual({ charge: 25, reps: 1, unique: true });
    expect(k._lues).toBe(1);
    expect(k.fondement.habitude).toEqual({ valeur: 2, seances: 1 });
  });
  test('a2 — avec la marque « Au max » sur la dernière série : même résultat', () => {
    const k = r([[[20, 7], [25, 2], [25, 1, { au_max_reserve: 0 }]]], DEB).consigne;
    expect(k.etat).toBe('bord_garde');
    expect(k.ligne).toEqual({ charge: 25, vise: 1 });
  });
  test('a3 — un single de powerlifter en première séance : 140 × 1 gardé (main : bord 142,5)', () => {
    const k = r([trois(140, 1)]).consigne;
    expect(k.etat).toBe('bord_garde');
    expect(k.ligne).toEqual({ charge: 140, vise: 1 });
  });
  test('a4 — deux séances identiques sous 3 reps : la règle de 180, inchangée (bord 142,5 × 1)', () => {
    const k = r([trois(140, 1), trois(140, 1)]).consigne;
    expect(k.etat).toBe('bord');
    expect(k.ligne).toMatchObject({ charge: 142.5, vise: 1 });
    expect(k._lues).toBe(2);
  });
  test('a5 — I040 : le calage puis 27,5 × 1, 0, 0 → bord_recul 25 × 1 (inchangé)', () => {
    const k = r([[[20, 7], [25, 2], [25, 1]], [[27.5, 1], [27.5, 0], [27.5, 0]]], DEB).consigne;
    expect(k.etat).toBe('bord_recul');
    expect(k.ligne).toEqual({ charge: 25, vise: 1 });
  });
  test('a6 — B1 : 40 × 8 puis 50 × 2 → nouvelle_zone Lourd 45 × 3 (le calage reste témoin, inchangé)', () => {
    const k = r([trois(40, 8), trois(50, 2)], DEB).consigne;
    expect(k.etat).toBe('nouvelle_zone');
    expect(k.zone).toBe('lourd');
    expect(k.ligne).toEqual({ charge: 45, vise: 3 });
  });
  test('a7 — habitude exactement 3 : pas sous 3, Lourd inchangé', () => {
    const k = r([[[20, 8], [25, 3], [25, 3]]], DEB).consigne;
    expect(k.etat).toBe('progression');
    expect(k.zone).toBe('lourd');
    expect(k.ligne).toEqual({ charge: 25, vise: 4 });
  });
  test('a8 — 25 × 8 puis 27,5 × 2 : garde 27,5 × 2', () => {
    const k = r([[[20, 8], [25, 8], [27.5, 2]]], DEB).consigne;
    expect(k.etat).toBe('bord_garde');
    expect(k.ligne).toEqual({ charge: 27.5, vise: 2 });
  });
  test('a9 — poids du corps (mesure reps) : etirement_reps, inchangé', () => {
    const k = r([trois(0, 2)], { mesure: 'reps', equipement: 'aucun' }).consigne;
    expect(k.etat).toBe('etirement_reps');
    expect(k.ligne).toEqual({ charge: 0, vise: 3 });
  });
  test('a10 — une séance neutre (douleur) ne compte pas comme séance lue : 1 séance lue + 1 douleur = garde', () => {
    const k = r([trois(140, 1), trois(142.5, 1).map(([kg, rep]) => [kg, rep, { douleur: true }])]).consigne;
    expect(k.etat).toBe('bord_garde');
    expect(k.fondement.bord.unique).toBe(true);
    expect(k.ligne).toEqual({ charge: 140, vise: 1 });
  });
  test('a11 — deux séances lues de formats différents (8 reps puis 2) : la zone se déduit, ni bord ni garde « unique »', () => {
    const k = r([trois(100, 8), trois(105, 2)]).consigne;
    expect(k.etat).toBe('nouvelle_zone');
    expect(k.zone).toBe('lourd');
    expect(k.fondement.bord).toBeUndefined();
  });
  test('a12 — une barre ratée sur une histoire courte recule toujours (jamais une montée) : recul avant l\'unique', () => {
    const k = r([[[20, 7], [25, 2], [25, 1]], [[25, 1], [25, 0], [25, 0]]], DEB).consigne;
    expect(['bord_recul', 'bord_garde']).toContain(k.etat);
    expect(k.etat).not.toBe('bord');
  });
});

describe('A — les phrases (VOIX-DU-COACH : un fait, « je », jamais de réserve supposée)', () => {
  const plat = (s) => s.replace(/[  ]/g, ' ');
  test('en-tête et Pourquoi de la garde « unique »', () => {
    const res = r([[[20, 7], [25, 2], [25, 1]]], DEB);
    expect(plat(res.libelles.gris)).toBe('25 kg × 1 : une seule séance sous 3 reps. Je garde 25 kg.');
    const p = plat(M.pourquoiConsigne(res.consigne, 'normal', jourN(1)).etat);
    expect(p).toContain('Sous 3 reps, je ne te demande jamais une rep de plus. Une seule séance ne fait pas une habitude : je garde 25 kg, la prochaine séance dira si c\'est ta zone.');
    expect(p).not.toMatch(/réserve|undefined/);
  });
});
