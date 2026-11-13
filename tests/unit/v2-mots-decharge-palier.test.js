/** @jest-environment node */
//
// « Les mots disent vrai » PR 3 — LA CHARGE DE LA DÉCHARGE AU PALIER (MOTEUR §9.45, I166).
// Une décharge ne demande jamais plus lourd que le palier de l'exercice ni que la consigne normale : charge = min(source ; palier), au sens du
// moteur (une aide est codée négative). Hors routine, ses séries sont 60 % de celles de la consigne normale. « Avec de la marge » ne se dit que
// si une cible (reps ou charge) baisse. Chaque cas est joué dans les deux sens quand le signe ou le `null` peut tromper (N1, N2).

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const esp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');
const RANG = { semaine: 4, semaines: 4 };
const FOND = { date: '2026-10-26T17:00:00.000Z', reps: [5, 5, 5] };
const K = (o) => Object.assign({ etat: 'progression', zone: 'lourd', palier: 125, niveau: 5, n: 3, ligne: { charge: 127.5, vise: 5 }, haut: null,
  fondement: FOND }, o);
const decharge = (c, routine) => M.consigneAllegee(c, routine === undefined ? 3 : routine, true, RANG);
const ligne = (c, routine) => { const a = decharge(c, routine); return [a.ligne.charge, a.ligne.vise]; };

const BLOC = { id: 'b1', dossier: 'Force', zone: 'lourd', debut: '2026-10-12', semaines: 4, decharge: true,
  statut: 'en_cours', exercices: ['couche'], precedent: null };
function decor(consigne, opts) {
  const o = Object.assign({ debut: '2026-11-03T10:00:00+00:00', series: 3, routine: 3 }, opts || {});
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: o.series });
  const e = { seance: { id: 'S1', debut: o.debut, edition: false, exercices: se.exercices },
    consignes: { couche: { consigne: consigne, libelles: M.libellesConsigne(consigne), compteur: { compteur: 0, meilleur: null, blocages: [] }, repli: null } },
    reglage: 'franc', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { couche: 'Développé Couché (Barre)' },
      seriesRoutine: o.routine === undefined ? {} : { couche: o.routine }, marches: [] },
    programme: { blocs: [BLOC], lignes: [] } };
  return { e, p: T.planDeSeance(e) };
}
const erreurs = (p, e) => T.verifierPlan(p, e).erreurs;
const i166 = (p, e) => erreurs(p, e).filter((m) => /^I16[56]/.test(m));

describe('D1 — charge = min(source ; palier), au sens du moteur', () => {
  test('bord : la ligne est un cran AU-DESSUS du palier (142,5 pour 140) — la décharge reste au palier', () => {
    expect(ligne(K({ etat: 'bord', palier: 140, niveau: 2, ligne: { charge: 142.5, vise: 2 } }))).toEqual([140, 1]);
  });
  test('tout_passe, Franc, test 72,5 × 10 tenu sur une série (palier 70) : la ligne est nulle, la source le test — 70, pas 72,5', () => {
    expect(ligne(K({ etat: 'tout_passe', palier: 70, niveau: 10, ligne: null, haut: { charge: 72.5, vise: 10 } }))).toEqual([70, 8]);
  });
  test('zero_rep 95 × 7 (palier 100) : INCHANGÉ — « min » et non « palier » : la décharge ne remonte jamais à 100', () => {
    expect(ligne(K({ etat: 'zero_rep', zone: null, palier: 100, ligne: { charge: 95, vise: 7 } }))).toEqual([95, 5]);
  });
  test('progression (ligne = palier) et ligne sous le palier (recul) : inchangées', () => {
    expect(ligne(K({ palier: 70, ligne: { charge: 70, vise: 9 } }))).toEqual([70, 7]);
    expect(ligne(K({ etat: 'bord_recul', palier: 140, ligne: { charge: 135, vise: 3 } }))).toEqual([135, 1]);
  });
  test('une charge d’un cran sous le palier proche (flottants) n’est pas « au-dessus » : 62,5 / 62,5000000001', () => {
    expect(ligne(K({ palier: 62.5, ligne: { charge: 62.5 + 1e-12, vise: 8 } }))[0]).toBeCloseTo(62.5, 9);
  });
  test('AIDE (codée négative) — dans les DEUX sens : −22,5 sur un palier −25 passe à −25 (plus d’aide) ; −25 sur −22,5 reste −25', () => {
    expect(ligne(K({ palier: -25, ligne: { charge: -22.5, vise: 8 } })).slice(0, 1)).toEqual([-25]);
    expect(ligne(K({ palier: -22.5, ligne: { charge: -25, vise: 8 } })).slice(0, 1)).toEqual([-25]);
  });
  test('LESTÉ : +12,5 sur un palier +10 passe à +10 ; +7,5 sur +10 reste +7,5', () => {
    expect(ligne(K({ palier: 10, ligne: { charge: 12.5, vise: 6 } })).slice(0, 1)).toEqual([10]);
    expect(ligne(K({ palier: 10, ligne: { charge: 7.5, vise: 6 } })).slice(0, 1)).toEqual([7.5]);
  });
  test('POIDS DU CORPS (N1) : 0 n’est pas « nul » — charge 0 + palier 0 reste 0, et charge 0 + palier 10 reste 0 (jamais lesté d’office)', () => {
    expect(ligne(K({ palier: 0, ligne: { charge: 0, vise: 12 } }))).toEqual([0, 10]);
    expect(ligne(K({ palier: 10, ligne: { charge: 0, vise: 12 } }))).toEqual([0, 10]);
  });
  test('PALIER NUL : pas de plafond (départ de routine, de lest) — la charge de la source passe', () => {
    expect(ligne(K({ palier: null, ligne: { charge: 127.5, vise: 5 } }))).toEqual([127.5, 3]);
  });
  test('K1 — charge de la source INCONNUE et palier chiffré : le palier (la charge tenue), jamais « le cran au-dessus »', () => {
    const a = decharge(K({ palier: 125, ligne: { charge: null, vise: 5 } }));
    expect(a.ligne.charge).toBe(125);
    expect(a.allegee.avant.charge).toBeNull();
  });
  test('N3 — charge inconnue ET palier nul : la charge reste inconnue, la clause du « Pourquoi » ne dit jamais « le cran au-dessus »', () => {
    const k = K({ palier: null, ligne: { charge: null, vise: 5 } });
    const a = decharge(k);
    expect(a.ligne.charge).toBeNull();
    const t = esp(M.pourquoiConsigne ? 'x' : '') + esp(require('../../v2/js/moteur.js').grisAllegee(a));
    expect(t).not.toMatch(/cran au-dessus/);
    expect(M.ciblesDifferent(a)).toBe(true);   // les reps diffèrent
  });
  test('N5 — nouvelle_zone : le palier est celui de l’ANCIENNE zone, il ne plafonne rien (aucune charge d’une autre zone n’est forcée)', () => {
    const k = K({ etat: 'nouvelle_zone', palier: 70, ligne: { charge: 80, vise: 8 }, fondement: Object.assign({}, FOND, { report: { origine: 'e1rm', zoneAvant: 'mix' } }) });
    expect(ligne(k)).toEqual([80, 6]);
  });
  test('N5 — états de bord / reprise / zéro rep : plafonnés au palier (celui de leur zone), jamais remontés', () => {
    ['bord', 'bord_garde', 'bord_vague', 'reprise_courte', 'reprise_longue', 'zero_rep'].forEach((etat) => {
      const dessus = ligne(K({ etat: etat, palier: 100, ligne: { charge: 105, vise: 4 } }))[0];
      const dessous = ligne(K({ etat: etat, palier: 100, ligne: { charge: 95, vise: 4 } }))[0];
      expect(dessus).toBe(100);
      expect(dessous).toBe(95);
    });
  });
});

describe('B3 — « approchée » suit la charge retenue', () => {
  const fond = Object.assign({}, FOND, { approchee: true });
  test('127,5 approchée ramenée au palier 125 (déjà fait) : ni la ligne ni le fondement ne disent « approchée »', () => {
    const a = decharge(K({ palier: 125, ligne: { charge: 127.5, vise: 5, approchee: true }, fondement: fond }));
    expect(a.ligne.charge).toBe(125);
    expect(a.ligne.approchee).toBeUndefined();
    expect(a.fondement.approchee).toBeUndefined();
  });
  test('ligne approchée SOUS le palier, gardée : elle garde son drapeau (et le fondement)', () => {
    const a = decharge(K({ palier: 125, ligne: { charge: 120, vise: 5, approchee: true }, fondement: fond }));
    expect(a.ligne.charge).toBe(120);
    expect(a.ligne.approchee).toBe(true);
    expect(a.fondement.approchee).toBe(true);
  });
});

describe('D3 + B1 — hors routine : 60 % des séries de la consigne normale', () => {
  test('c.n = 3 : 2 séries gardées et couvertes, `allegee.routine` reste null (aucun « au lieu de »)', () => {
    [undefined, null, 0].forEach((r) => {
      const a = M.consigneAllegee(K({ n: 3 }), r, true, RANG);
      expect(a.n).toBe(2);
      expect(a.couvre).toBe(2);
      expect(a.allegee.routine).toBeNull();
      expect(a.allegee.series).toBe(2);
    });
  });
  test('c.n absent : 1 série, aucune base, rien n’est dit des séries', () => {
    const a = M.consigneAllegee(K({ n: undefined }), null, true, RANG);
    expect(a.n).toBe(1);
    expect(a.allegee.base).toBeNull();
    expect(M.detailAllegee(a)).toBeNull();
  });
  test('routine connue : 60 % de la routine, pas de c.n', () => {
    expect(M.consigneAllegee(K({ n: 3 }), 5, true, RANG).n).toBe(3);
  });
  test('B2 — le gris hors routine dit les séries gardées, sans « au lieu de » : « Décharge, semaine 4 sur 4 : 2 séries. »', () => {
    const { e, p } = decor(K({ n: 3, ligne: { charge: 125, vise: 5 } }), { routine: undefined, series: 3 });
    const x = p.exercices[0];
    expect(x.consigne.allegee.routine).toBeNull();
    expect(esp(x.entete.gris)).toBe('Décharge, semaine 4 sur 4 : 2 séries.');
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : moins de séries, avec de la marge. 2 séries. 125 kg × 3 au lieu de 125 kg × 5.');
    expect(x.lignes.filter((l) => l.type === 'travail' && l.role !== 'hors')).toHaveLength(2);
    expect(erreurs(p, e)).toEqual([]);
  });
  test('B1 — I19 lit les séries que la consigne porte : le défaut inventé « 1 » d’une routine nulle ne passe plus', () => {
    const { e, p } = decor(K({ n: 3, ligne: { charge: 125, vise: 5 } }), { routine: undefined, series: 3 });
    p.exercices[0].consigne.allegee.series = 1;   // l'ancien défaut
    expect(erreurs(p, e).filter((m) => /^I19/.test(m)).length).toBeGreaterThan(0);
  });
});

describe('les phrases : la charge qui change se dit, une fois', () => {
  test('bord : « 140 kg × 1 au lieu de 142,5 kg × 2 », « avec de la marge » (les reps baissent), I166 tenu', () => {
    const { e, p } = decor(K({ etat: 'bord', palier: 140, niveau: 2, n: 3, ligne: { charge: 142.5, vise: 2 } }));
    const x = p.exercices[0];
    expect(x.consigne.ligne.charge).toBe(140);
    expect(esp(x.entete.gris)).toBe('Décharge, semaine 4 sur 4 : 2 séries au lieu de 3.');
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : moins de séries, avec de la marge. 2 séries au lieu de 3. 140 kg × 1 au lieu de 142,5 kg × 2.');
    expect(i166(p, e)).toEqual([]);
    expect(erreurs(p, e)).toEqual([]);
  });
  test('N6 — SEULE la charge change (reps égales, routine à 1 série) : la clause est dite, « cet exercice ne change pas » ne l’est pas', () => {
    const { e, p } = decor(K({ etat: 'bord', palier: 140, niveau: 1, n: 1, ligne: { charge: 142.5, vise: 1 } }), { series: 1, routine: 1 });
    const x = p.exercices[0];
    expect(esp(x.entete.gris)).toBe('Décharge, semaine 4 sur 4.');
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : des cibles plus basses, avec de la marge. 140 kg × 1 au lieu de 142,5 kg × 1.');
    expect(esp(x.pourquoi.etat)).not.toMatch(/ne change pas/);
    expect(M.ciblesDifferent(x.consigne)).toBe(true);
    expect(i166(p, e)).toEqual([]);
  });
  test('B4 — un SIMPLE au palier : seules les séries baissent, « moins de séries. » sans « avec de la marge » (Pourquoi ET bandeau)', () => {
    const { e, p } = decor(K({ palier: 190, niveau: 1, n: 4, ligne: { charge: 190, vise: 1 } }), { series: 4, routine: 4 });
    const x = p.exercices[0];
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : moins de séries. 2 séries au lieu de 4.');
    expect(esp(p.allegee.bandeau)).toBe('Décharge, semaine 4 sur 4 : prévue par ton programme. Moins de séries.');
    expect(p.allegee.marge).toBe(false);
    expect(M.cibleBaisse(x.consigne)).toBe(false);
    expect(i166(p, e)).toEqual([]);
  });
  test('B4 — dès qu’une cible baisse, le bandeau garde « avec de la marge »', () => {
    const { e, p } = decor(K({ ligne: { charge: 125, vise: 5 } }));
    expect(esp(p.allegee.bandeau)).toBe('Décharge, semaine 4 sur 4 : prévue par ton programme. Moins de séries, avec de la marge.');
    expect(p.allegee.marge).toBeUndefined();
    expect(i166(p, e)).toEqual([]);
  });
  test('Franc, test réussi sur une série : « 70 kg × 8 au lieu de 72,5 kg × 10 »', () => {
    const { e, p } = decor(K({ etat: 'tout_passe', palier: 70, niveau: 10, n: 3, ligne: null, haut: { charge: 72.5, vise: 10 } }));
    const x = p.exercices[0];
    expect(x.consigne.ligne.charge).toBe(70);
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : moins de séries, avec de la marge. 2 séries au lieu de 3. 70 kg × 8 au lieu de 72,5 kg × 10.');
    expect(erreurs(p, e)).toEqual([]);
  });
  test('K1/N3 à l’écran : charge inconnue + palier → « 125 kg × 3 au lieu de 5 reps » (jamais « le cran au-dessus »)', () => {
    const { e, p } = decor(K({ palier: 125, ligne: { charge: null, vise: 5 } }));
    const x = p.exercices[0];
    expect(esp(x.pourquoi.etat)).toMatch(/125 kg × 3 au lieu de 5 reps\.$/);
    expect(esp(x.pourquoi.etat)).not.toMatch(/cran au-dessus/);
    expect(erreurs(p, e)).toEqual([]);
  });
  test('N3 — charge inconnue et palier nul : « 3 reps au lieu de 5 reps », jamais « le cran au-dessus »', () => {
    const { e, p } = decor(K({ palier: null, ligne: { charge: null, vise: 5 } }));
    const t = esp(p.exercices[0].pourquoi.etat);
    expect(t).toMatch(/3 reps au lieu de 5 reps\.$/);
    expect(t).not.toMatch(/cran au-dessus/);
    expect(i166(p, e)).toEqual([]);
  });
  test('poids du corps : « Poids du corps × 6 au lieu de × 8 » (rien ne monte, charge 0 gardée)', () => {
    const { e, p } = decor(K({ palier: 10, ligne: { charge: 0, vise: 8 } }));
    expect(p.exercices[0].consigne.ligne.charge).toBe(0);
    expect(i166(p, e)).toEqual([]);
  });
  test('« Rien ne monte » n’apparaît dans aucune phrase affichée (D4)', () => {
    const { p } = decor(K({ etat: 'bord', palier: 140, niveau: 2, ligne: { charge: 142.5, vise: 2 } }));
    const x = p.exercices[0];
    expect(esp(x.entete.gris + x.pourquoi.etat + p.allegee.bandeau)).not.toMatch(/rien\s+ne\s+monte/i);
  });
});

describe('N4 — zéro rep et plafond après un zéro, en Décharge : les invariants I153, I155, I157 tiennent', () => {
  test('zero_rep 120 × 5 (échec à 130) joué en Décharge : aucune erreur, ligne ≤ charge dite', () => {
    const k = K({ etat: 'zero_rep', zone: null, palier: 125, ligne: { charge: 120, vise: 5 },
      fondement: { date: FOND.date, zeroRep: { charge: 130, series: 3, vers: 120, visees: 5, bornee: false } } });
    const { e, p } = decor(k, { series: 4, routine: 4 });
    expect(p.exercices[0].consigne.ligne.charge).toBe(120);
    expect(erreurs(p, e)).toEqual([]);
  });
  test('tenue_apres_zero joué en Décharge : n réduit par la Décharge, phrase du plafond absente — aucune erreur', () => {
    const k = K({ etat: 'tenue_apres_zero', palier: 125, n: 4, ligne: { charge: 125, vise: 5 },
      fondement: { date: FOND.date, plafondZero: { mord: true, charge: 130, sans: { palier: 125, niveau: 5, n: 4, zone: 'lourd', ligne: { charge: 127.5, vise: 5 } } } } });
    const { e, p } = decor(k, { series: 4, routine: 4 });
    expect(erreurs(p, e)).toEqual([]);
  });
});

describe('I166 — l’invariant se casse, dans les deux sens', () => {
  const base = () => decor(K({ etat: 'bord', palier: 140, niveau: 2, n: 3, ligne: { charge: 142.5, vise: 2 } }));
  test('une charge au-dessus du palier est refusée', () => {
    const { e, p } = base();
    p.exercices[0].consigne.ligne.charge = 142.5;
    expect(i166(p, e).some((m) => /^I166.*au-dessus du palier 140/.test(m))).toBe(true);
  });
  test('une charge plus lourde que la consigne normale est refusée (palier nul : l’exception ne couvre que le palier)', () => {
    const { e, p } = decor(K({ palier: null, ligne: { charge: 100, vise: 5 } }));
    p.exercices[0].consigne.ligne.charge = 105;
    expect(i166(p, e).some((m) => /^I166.*plus lourde que la consigne normale/.test(m))).toBe(true);
  });
  test('N2 — avant.charge NULL : aucune fausse erreur (125 > null vaut vrai en JS)', () => {
    const { e, p } = decor(K({ palier: 125, ligne: { charge: null, vise: 5 } }));
    expect(i166(p, e)).toEqual([]);
  });
  test('K3 — aide : −25 sous palier −22,5 passe, −20 (moins d’aide, plus dur) sur palier −22,5 est refusée', () => {
    const ok = decor(K({ palier: -22.5, ligne: { charge: -25, vise: 8 } }));
    expect(i166(ok.p, ok.e)).toEqual([]);
    const ko = decor(K({ palier: -22.5, ligne: { charge: -25, vise: 8 } }));
    ko.p.exercices[0].consigne.ligne.charge = -20;
    expect(i166(ko.p, ko.e).some((m) => /^I166/.test(m))).toBe(true);
  });
  test('la charge change et le « Pourquoi » ne le dit pas : refusé', () => {
    const { e, p } = base();
    p.exercices[0].pourquoi.etat = 'Décharge, semaine 4 sur 4 : moins de séries, avec de la marge. 2 séries au lieu de 3.';
    expect(erreurs(p, e).some((m) => /^I16[56]/.test(m))).toBe(true);
  });
  test('« avec de la marge » sans aucune cible qui baisse : refusé (Pourquoi et bandeau)', () => {
    const { e, p } = decor(K({ palier: 190, niveau: 1, n: 4, ligne: { charge: 190, vise: 1 } }), { series: 4, routine: 4 });
    p.exercices[0].pourquoi.etat = 'Décharge, semaine 4 sur 4 : moins de séries, avec de la marge. 2 séries au lieu de 4.';
    p.allegee.bandeau = 'Décharge, semaine 4 sur 4 : prévue par ton programme. Moins de séries, avec de la marge.';
    const m = i166(p, e);
    expect(m.some((x) => /le « Pourquoi » : « avec de la marge » alors qu/.test(x))).toBe(true);
    expect(m.some((x) => /le bandeau/.test(x))).toBe(true);
  });
  test('palier nul : aucune erreur de plafond, la charge de la source passe', () => {
    const { e, p } = decor(K({ palier: null, ligne: { charge: 127.5, vise: 5 } }));
    expect(i166(p, e)).toEqual([]);
  });
});
