/** @jest-environment node */
//
// Chantier « première séance sûre », PR 2 — règle B (MOTEUR §9.42) : une séance dont TOUTES les séries lues sont à 0 rep est neutre pour la
// consigne, et la consigne d'après est plus légère (`zero_rep`) — jamais la charge échouée. Valeurs écrites à la main (rejeu du 12/11/2026) ;
// chaque cas passe par `consigneDExercice`, comme l'app.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const Modele = global.THModele || (global.window && global.window.THModele);

let n = 0;
const brute = (kg, reps, extra) => Object.assign({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' }, extra || {});
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: true };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
// `liste` : `[kg, reps | [reps…], extra?]` par séance (tous les 3 jours), extra : champs de série.
const groupes = (liste) => liste.map(([kg, reps, extra], i) => ({ seance: { id: 'H' + i, debut: jourN(i) },
  series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((x) => brute(kg, x, extra)) }));
const avantApres = (liste, jours) => new Date(Date.parse(jourN(liste.length - 1)) + (jours || 3) * 864e5).toISOString();
const r = (liste, options, jours) => M.consigneDExercice(groupes(liste), undefined, avantApres(liste, jours), Object.assign({}, OPTIONS, options || {}));
const K = (liste, options, jours) => r(liste, options, jours).consigne;
const BONNE = [100, [8, 8, 7]];
const plat = (s) => s.replace(/[  ]/g, ' ');

describe('B — Modele.seanceAZero : la définition unique', () => {
  const S = (...a) => Modele.seanceAZero(a);
  test('aucune série → null ; une rep lisible ≠ 0 → null ; reps vides ou null → null (152)', () => {
    expect(Modele.seanceAZero([])).toBeNull();
    expect(Modele.seanceAZero(null)).toBeNull();
    expect(S({ charge_kg: 50, reps: 3 })).toBeNull();
    expect(S({ charge_kg: 50, reps: null })).toBeNull();
    expect(S({ charge_kg: 50, reps: '' })).toBeNull();
    expect(S({ charge_kg: 50, reps: 0 }, { charge_kg: 50, reps: null })).toBeNull();
    expect(S({ charge_kg: 50, reps: 0 }, { charge_kg: 50, reps: 1 })).toBeNull();
  });
  test('un zéro : { n, charge } ; la plus légère charge ; une charge manquante → charge null', () => {
    expect(S({ charge_kg: 50, reps: 0 })).toEqual({ n: 1, charge: 50 });
    expect(S({ charge_kg: 102.5, reps: 0 }, { charge_kg: 100, reps: 0 })).toEqual({ n: 2, charge: 100 });
    expect(S({ charge_kg: null, reps: 0 })).toEqual({ n: 1, charge: null });
  });
  test('les chauffes, « hors calcul » et les séries de test sont ignorées ; une série echec à 0 compte', () => {
    expect(S({ type_serie: 'echauffement', charge_kg: 60, reps: 5 }, { charge_kg: 100, reps: 0 }, { charge_kg: 100, reps: 0 })).toEqual({ n: 2, charge: 100 });
    expect(S({ charge_kg: 100, reps: 0 }, { charge_kg: 100, reps: 5, hors_calcul: true })).toEqual({ n: 1, charge: 100 });
    expect(S({ type_serie: 'test', charge_kg: 120, reps: 0 })).toBeNull();
    expect(S({ type_serie: 'echec', charge_kg: 100, reps: 0 }, { type_serie: 'echec', charge_kg: 100, reps: 0 })).toEqual({ n: 2, charge: 100 });
  });
});

describe('B — une séance entière à zéro rep : plus léger, jamais la même charge', () => {
  test('b1 — 100 × 8, 8, 7 puis 102,5 × 0 ×3 → zero_rep 97,5 × 9 (main : silence / pas_de_palier)', () => {
    const k = K([BONNE, [102.5, 0]]);
    expect(k.etat).toBe('zero_rep');
    expect(k.zone).toBeNull();
    expect(k.palier).toBe(100);
    expect(k.niveau).toBe(8);
    expect(k.ligne).toMatchObject({ charge: 97.5, vise: 9 });
    expect(k.haut).toBeNull();
    expect(k.fondement.zeroRep).toEqual({ charge: 102.5, series: 3, vers: 97.5, visees: 9, bornee: false });
    expect(k.ligne.approchee).toBe(true);        // 97,5 kg n'a jamais été fait (I51)
    expect(k.fondement.approchee).toBe(true);
  });
  test('b2 — séries typées « echec » (manquées) : identique', () => {
    const k = K([BONNE, [102.5, 0, { type_serie: 'echec' }]]);
    expect(k.etat).toBe('zero_rep');
    expect(k.ligne).toMatchObject({ charge: 97.5, vise: 9 });
  });
  test('b3 — une seule série tentée au-dessus de la charge de travail (105 × 0) : la ligne est celle de base (100 × 9)', () => {
    const k = K([BONNE, [105, [0]]]);
    expect(k.etat).toBe('zero_rep');
    expect(k.ligne).toMatchObject({ charge: 100, vise: 9 });
    expect(k.fondement.zeroRep).toMatchObject({ charge: 105, series: 1, vers: 100, bornee: false });
  });
  test('b4 — deux zéros de suite : chacun neutre, le plus récent descend (100 → 95)', () => {
    const k = K([BONNE, [102.5, 0], [100, 0]]);
    expect(k.etat).toBe('zero_rep');
    expect(k.ligne).toMatchObject({ charge: 95, vise: 9 });
  });
  test('b5 — un zéro puis une bonne séance : le zéro ne pèse plus (progression 100 × 9)', () => {
    const k = K([BONNE, [102.5, 0], [100, [8, 8, 8]]]);
    expect(k.etat).toBe('progression');
    expect(k.ligne).toMatchObject({ charge: 100, vise: 9 });
  });
  test('b6 — première séance toute à zéro : le calage recommence (silence / première fois), travail ou echec', () => {
    [[25, 0], [25, 0, { type_serie: 'echec' }]].forEach((s) => {
      const k = K([s]);
      expect(k.etat).toBe('silence');
      expect(k.raison).toBe('premiere_fois');
      expect(k.fondement.zeroRep).toEqual({ charge: 25, series: 3 });
    });
  });
  test('b6 bis — la charge de départ de la routine n\'est PAS re-prescrite après une première séance à zéro (contradicteur 5)', () => {
    const k = r([[60, 0]], { depart: { charge: 60, reps: 8 } }).consigne;
    expect(k.etat).toBe('silence');
    expect(k.raison).toBe('premiere_fois');
  });
  test('b7 — I035 : 5 × 12, 15 × 12, 20 × 2 puis 25 × 0 ×3 → zero_rep 20 × 2, bornée (22,5 serait au-dessus de la ligne d\'avant)', () => {
    const g = [{ seance: { id: 'H0', debut: jourN(0) }, series: [brute(5, 12), brute(15, 12), brute(20, 2)] },
      { seance: { id: 'H1', debut: jourN(1) }, series: [brute(25, 0), brute(25, 0), brute(25, 0)] }];
    const k = M.consigneDExercice(g, undefined, avantApres([1, 2]), OPTIONS).consigne;
    expect(k.etat).toBe('zero_rep');
    expect(k.ligne).toMatchObject({ charge: 20, vise: 2 });
    expect(k.fondement.zeroRep).toMatchObject({ charge: 25, vers: 20, bornee: true });
    const ge = JSON.parse(JSON.stringify(g)); ge[1].series.forEach((s) => { s.type_serie = 'echec'; });
    const k2 = M.consigneDExercice(ge, undefined, avantApres([1, 2]), OPTIONS).consigne;
    expect(k2.etat).toBe('zero_rep');
    expect(k2.ligne).toMatchObject({ charge: 20, vise: 2 });
  });
  test('b7 bis — une ligne de base qui MONTE (bord) ne se reprend pas après un zéro : bornée au palier (contradicteur 2)', () => {
    // 140 × 1 ×3 puis un saut à 150 × 0 ×3 : sans zéro la règle de bord proposerait 142,5 ; après un zéro, jamais au-dessus de 140.
    const k = K([[140, 1], [140, 1], [150, 0]], { debutant: false });
    expect(k.etat).toBe('zero_rep');
    expect(k.palier).toBe(140);
    expect(k.ligne.charge).toBeLessThanOrEqual(140);
    expect(k.ligne).toMatchObject({ charge: 140, vise: 1 });
    expect(k.fondement.zeroRep.bornee).toBe(true);
  });
  test('b8 — barre vide : 20 × 8 puis 20 × 0 → silence / zero_plancher (rien de plus léger) ; première séance à 20 × 0 → calage', () => {
    const k = K([[20, 8], [20, 0]]);
    expect(k.etat).toBe('silence');
    expect(k.raison).toBe('zero_plancher');
    expect(k.fondement.zeroRep).toEqual({ charge: 20, series: 3 });
    expect(K([[20, 0]]).raison).toBe('premiere_fois');
  });
  test('b9 — machine (cran 5 kg) : 40 × 10 puis 45 × 0 → zero_rep 40 × 11', () => {
    const k = K([[40, 10], [45, 0]], { equipement: 'machine' });
    expect(k.etat).toBe('zero_rep');
    expect(k.ligne).toMatchObject({ charge: 40, vise: 11 });
  });
  test('b10 — un zéro mêlé d\'une rep, ou de reps vides : pas une séance de zéro (152)', () => {
    expect(K([BONNE, [102.5, [0, 1, 0]]]).etat).not.toBe('zero_rep');
    const vides = K([BONNE, [102.5, [null, null, null]]]);
    expect(vides.etat).not.toBe('zero_rep');
    expect(vides.etat).toBe('progression');            // comme main : les reps vides sont ignorées
    expect(K([BONNE, [102.5, [0, null, 0]]]).etat).not.toBe('zero_rep');
  });
  test('b11 — poids du corps (mesure reps) et aide (charge négative) à zéro rep : inchangés (silence / pas_de_palier)', () => {
    expect(K([[0, 8], [0, 0]], { mesure: 'reps', equipement: 'aucun' }).raison).toBe('pas_de_palier');
    const aide = K([[-20, 8], [-20, 0]], { equipement: 'machine' });
    expect(aide.etat).not.toBe('zero_rep');
  });
  test('b12 — la reprise prime : après une longue pause, pas de zero_rep', () => {
    const l = [BONNE, [102.5, 0]];
    expect(K(l, {}, 3).etat).toBe('zero_rep');
    expect(['reprise_courte', 'reprise_longue']).toContain(K(l, {}, 24).etat);
    expect(['reprise_courte', 'reprise_longue']).toContain(K(l, {}, 45).etat);
  });
  test('b13 — une séance « J\'ai eu mal » (douleur) à zéro : neutre, jamais « je baisse »', () => {
    const k = K([BONNE, [102.5, 0, { douleur: true }]]);
    expect(k.etat).toBe('progression');
    expect(k.ligne).toMatchObject({ charge: 100, vise: 9 });
  });
  test('b14 — semaine allégée : la séance de zéro est une décharge, aucune surcouche', () => {
    const periodes = [{ debut: '2026-09-04', fin: '2026-09-04' }];
    const k = K([BONNE, [102.5, 0]], { periodesAllegees: periodes });
    expect(k.etat).not.toBe('zero_rep');
  });
  test('b15 — séries de test seules à zéro : pas de séance de zéro', () => {
    const k = K([BONNE, [120, 0, { type_serie: 'test' }]]);
    expect(k.etat).not.toBe('zero_rep');
  });
  test('b16 — des chauffes avant les zéros sont ignorées', () => {
    const g = groupes([BONNE, [102.5, 0]]);
    g[1].series.unshift(brute(60, 5, { type_serie: 'echauffement' }), brute(80, 5, { type_serie: 'echauffement' }));
    const k = M.consigneDExercice(g, undefined, avantApres([1, 2]), OPTIONS).consigne;
    expect(k.etat).toBe('zero_rep');
    expect(k.ligne).toMatchObject({ charge: 97.5, vise: 9 });
  });
  test('b17 — une série « hors calcul » à reps parmi les zéros est ignorée', () => {
    const g = groupes([BONNE, [102.5, 0]]);
    g[1].series.push(brute(102.5, 5, { hors_calcul: true }));
    expect(M.consigneDExercice(g, undefined, avantApres([1, 2]), OPTIONS).consigne.etat).toBe('zero_rep');
  });
  test('b18 — le compteur : une séance de zéro ne change pas le compteur de stagnation', () => {
    const avec = r([BONNE, BONNE, [102.5, 0]]).compteur;
    const sans = r([BONNE, BONNE]).compteur;
    expect(avec.meilleur).toEqual(sans.meilleur);
  });
  test('b19 — la séance suivante est jugée contre la consigne reçue (zero_rep), la zone reste nulle', () => {
    const k = K([BONNE, [102.5, 0], [97.5, [9, 9, 9]]]);
    expect(k.etat).toBe('progression');
    expect(k.palier).toBe(97.5);
  });
});

describe('B — les phrases (VOIX-DU-COACH : un fait, aucune cause, aucun bravo, aucune durée)', () => {
  test('en-tête, Pourquoi (cran), Pourquoi (bornée), une seule série', () => {
    const r1 = r([BONNE, [102.5, 0]]);
    expect(plat(r1.libelles.gris)).toBe('102,5 kg × 0 : pas encore. Je baisse à 97,5 kg.');
    const p1 = plat(M.pourquoiConsigne(r1.consigne, 'normal', avantApres([1, 2])).etat);
    expect(p1).toBe('Tes séries à 102,5 kg sont restées à 0 rep. Je repars du cran le plus proche de 95 % de cette charge : 97,5 kg × 9. Je remonte dès que les reps passent.');
    const rb = r([[140, 1], [140, 1], [150, 0]], { debutant: false });
    expect(plat(rb.libelles.gris)).toBe('150 kg × 0 : pas encore. Je reviens à 140 kg.');
    expect(plat(M.pourquoiConsigne(rb.consigne, 'normal', avantApres([1, 2, 3])).etat)).toBe(
      'Tes séries à 150 kg sont restées à 0 rep. Je reviens à 140 kg × 1, ta charge de travail. Je remonte dès que les reps passent.');
    const r3 = r([BONNE, [105, [0]]]);
    expect(plat(M.pourquoiConsigne(r3.consigne, 'normal', avantApres([1, 2])).etat)).toMatch(/^Ta série à 105 kg est restée à 0 rep\./);
    [r1, rb, r3].forEach((x) => {
      const t = plat(x.libelles.gris + ' ' + M.pourquoiConsigne(x.consigne, 'normal', avantApres([1, 2])).etat);
      expect(t).not.toMatch(/bravo|trop lourd|un cran|douleur|jours|semaines|undefined/i);
    });
  });
});

describe('B — « Au max » après un zéro (I154) et `Moteur.estApresZero`', () => {
  test('estApresZero : vrai pour zero_rep et silence / zero_plancher, faux ailleurs', () => {
    expect(M.estApresZero({ etat: 'zero_rep' })).toBe(true);
    expect(M.estApresZero({ etat: 'silence', raison: 'zero_plancher' })).toBe(true);
    expect(M.estApresZero({ etat: 'silence', raison: 'premiere_fois' })).toBe(false);
    expect(M.estApresZero({ etat: 'progression' })).toBe(false);
    expect(M.estApresZero(null)).toBe(false);
  });
});
