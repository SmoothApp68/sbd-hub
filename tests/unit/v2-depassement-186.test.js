/** @jest-environment node */
//
// 186 — LE DÉPASSEMENT (MOTEUR §9.1.2 / §9.8, décision d'Aurélien du 29/10/2026).
//
//   1  les reps au-dessus du haut ne comptent dans l'habitude que jusqu'au haut (séances qui ont reçu une consigne) : la zone ne
//      bascule plus seule ;
//   2  le nombre de crans suit le dépassement : +1..+2 un cran ; Franc +3 deux crans ; Normal +6 reps ou +50 % deux crans ; au double
//      du haut trois crans ; tout saut de plusieurs crans plafonné à +15 % (+10 % pour un débutant) ; Prudent un cran ;
//   3  la carte « Passer en Séries longues » après trois séances, « Garder Volume » la tait six séances ; I71.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' });
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
function groupes(liste) {
  return liste.map(([kg, reps], i) => ({ seance: { id: 'H' + i, debut: jourN(i) },
    series: (Array.isArray(reps) ? reps : [reps, reps, reps]).map((r) => brute(kg, r)) }));
}
const avantDe = (liste) => new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
const toutes = (liste) => liste.map((_, i) => 'H' + i);
function envelope(liste, o) {
  const opt = Object.assign({}, OPTIONS, o || {});
  return M.consigneDExercice(groupes(liste), undefined, avantDe(liste), opt);
}
const VOLUME = [[40, [11, 10, 10]], [40, [11, 10, 10]], [40, [11, 10, 10]], [40, [11, 10, 10]]];
const ligne = (c) => c.consigne.ligne.charge;
const haut = (c) => (c.consigne.haut ? c.consigne.haut.charge : null);

describe('186 — le plafond des reps de l\'habitude', () => {
  const SERIES = VOLUME.concat([[40, 15], [40, 15], [40, 15], [40, 15], [40, 15]]);
  test('DISCRIMINANT — séances qui ont reçu une consigne : la zone reste Volume malgré cinq séances à 15', () => {
    const c = envelope(SERIES, { seancesSousConsigne: toutes(SERIES) });
    expect(c.consigne.zone).toBe('volume');
  });
  test('DISCRIMINANT — une habitude installée SANS consigne glisse toujours (Séries longues)', () => {
    const c = envelope(SERIES);
    expect(c.consigne.zone).toBe('series_longues');
  });
  test('DISCRIMINANT — une habitude pas encore installée (moins de trois séances) ne se plafonne pas : une première séance à 5 reps ne bloque pas la zone en Lourd', () => {
    const l = [[80, [5, 5, 5]], [80, [10, 10, 10]], [80, [10, 10, 10]], [80, [10, 10, 10]], [80, [10, 10, 10]], [80, [10, 10, 10]]];
    const c = envelope(l, { seancesSousConsigne: toutes(l) });
    expect(c.consigne.zone).not.toBe('lourd');
  });
  test('A7 — 40 kg x 17, 16, 15 en Franc : 45 kg, la zone reste Volume', () => {
    const l = VOLUME.concat([[40, [17, 16, 15]]]);
    const c = envelope(l, { reglage: 'franc', seancesSousConsigne: toutes(l) });
    expect(c.consigne.zone).toBe('volume');
    expect(haut(c)).toBe(45);
    expect(c.consigne.fondement.crans).toBe(2);
  });
});

describe('186 — les crans d\'un dépassement (barre, 40 kg, zone Volume 10-12)', () => {
  const apres = (reps, o) => envelope(VOLUME.concat([[40, reps]]), o);
  test('Franc : +2 reps, un cran ; +3 reps, deux crans', () => {
    expect(haut(apres(14, { reglage: 'franc' }))).toBe(42.5);
    expect(haut(apres(15, { reglage: 'franc' }))).toBe(45);
  });
  test('Normal : +5 reps, un cran ; +6 reps, deux crans', () => {
    expect(haut(apres(17, { reglage: 'normal' }))).toBe(42.5);
    expect(haut(apres(18, { reglage: 'normal' }))).toBe(45);
  });
  test('Normal : +50 % au-dessus du haut sur une zone basse (Lourd 3-5 : 8 reps = +60 %) = deux crans', () => {
    const l = [[100, 5], [100, 5], [100, 5], [100, 8]];
    expect(haut(envelope(l, { reglage: 'normal' }))).toBe(105);
  });
  test('Prudent : toujours un cran', () => {
    const l = VOLUME.concat([[40, 20], [40, 20]]);
    const c = envelope(l, { reglage: 'prudent' });
    const crans = c.consigne.fondement.crans;
    expect(crans === undefined || crans === 1).toBe(true);
  });
  test('au double du haut : trois crans au plus, et jamais plus de +15 %', () => {
    const c = apres(24, { reglage: 'normal' });
    const h = haut(c);
    expect(h).toBeLessThanOrEqual(40 * 1.15 + 1e-9);
    expect(h).toBeGreaterThan(42.5);
  });
  test('à 100 kg le troisième cran passe (7,5 % < 15 %) : trois crans', () => {
    const l = [[100, [11, 10, 10]], [100, [11, 10, 10]], [100, [11, 10, 10]], [100, [11, 10, 10]], [100, [24, 24, 24]]];
    const c = envelope(l, { reglage: 'normal' });
    expect(haut(c)).toBe(107.5);
    expect(c.consigne.fondement.crans).toBe(3);
  });
  test('un débutant : 45 kg (12,5 %) dépasse 10 %, un seul cran', () => {
    expect(haut(apres(15, { reglage: 'franc', debutant: true }))).toBe(42.5);
    expect(haut(apres(15, { reglage: 'franc', debutant: false }))).toBe(45);
  });
  test('B5 — Normal, 50 kg x 30 : le saut ne dépasse pas +15 %', () => {
    const l = [[50, [11, 10, 10]], [50, [11, 10, 10]], [50, [11, 10, 10]], [50, [30, 30, 30]]];
    const c = envelope(l, { reglage: 'normal' });
    expect(haut(c)).toBeLessThanOrEqual(57.5 + 1e-9);
    expect(haut(c)).toBeGreaterThan(52.5);
  });
});

// ── La carte ─────────────────────────────────────────────────────────────
function decor(liste, opt) {
  const o = opt || {};
  let i = 0;
  const id = () => 's' + (++i);
  let se = S.creer({ id: o.seance || 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'dc', id, { series: 3 });
  const c = envelope(liste, { seancesSousConsigne: toutes(liste) });
  const e = { seance: { id: o.seance || 'S1', debut: avantDe(liste), edition: false, exercices: se.exercices },
    consignes: { dc: c }, reglage: 'normal', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { dc: 'Développé Couché (Barre)' }, seriesRoutine: { dc: 3 }, marches: o.marches || [] },
    programme: o.blocs ? { blocs: o.blocs, lignes: [] } : undefined };
  return { e, p: T.planDeSeance(e), c };
}
const TROIS = VOLUME.concat([[40, 15], [40, 15], [40, 15]]);
const DEUX = VOLUME.concat([[40, 15], [40, 15]]);

describe('186 — « Passer en Séries longues »', () => {
  test('trois séances au-dessus du haut, à la même charge : le compte est là', () => {
    const d = envelope(TROIS, { seancesSousConsigne: toutes(TROIS) }).depassement;
    expect(d).toMatchObject({ n: 3, charge: 40, zone: 'volume', vers: 'series_longues' });
  });
  test('DISCRIMINANT — deux séances : rien', () => {
    expect(envelope(DEUX, { seancesSousConsigne: toutes(DEUX) }).depassement).toBeNull();
  });
  test('une seule des trois à la charge plus lourde : rien', () => {
    const l = VOLUME.concat([[40, 15], [40, 15], [42.5, 15]]);
    expect(envelope(l, { seancesSousConsigne: toutes(l) }).depassement).toBeNull();
  });
  test('la carte : la phrase, les boutons ; I26 et I71 tiennent dans le plan', () => {
    const d = decor(TROIS);
    const m = d.p.exercices[0].escalier;
    expect(m).toBeTruthy();
    expect(m.carte.nouvelle_zone).toBe('series_longues');
    expect(m.carte.oui).toBe('Passer en Séries longues');
    expect(m.carte.non).toBe('Garder Volume');
    expect(String(m.carte.phrase).replace(/[  ]/g, ' ')).toBe('40 kg × 15 depuis 3 séances, au-dessus du haut de ta zone.');
    expect(T.verifierPlan(d.p, d.e).erreurs).toEqual([]);
  });
  test('un refus se tait six séances, la septième la rend', () => {
    const refus = { seance: 'S0', jour: M.jourCivil(jourN(TROIS.length - 1)), exercice: 'dc', marche: M.MARCHE_SCHEMA, reponse: 'refusee', compteur: 3 };
    // Le refus est écrit à la séance de la dernière ligne : il ne reste aucune séance après lui -> silence.
    expect(decor(TROIS, { marches: [refus] }).p.exercices[0].escalier || null).toBeNull();
    // Six séances plus tard (toujours au-dessus du haut, même charge), la carte revient.
    const six = TROIS.concat([[40, 15], [40, 15], [40, 15], [40, 15], [40, 15], [40, 15]]);
    const r6 = Object.assign({}, refus, { jour: M.jourCivil(jourN(TROIS.length - 1)) });
    expect(decor(six, { marches: [r6] }).p.exercices[0].escalier).toBeTruthy();
    const cinq = TROIS.concat([[40, 15], [40, 15], [40, 15], [40, 15], [40, 15]]);
    expect(decor(cinq, { marches: [r6] }).p.exercices[0].escalier || null).toBeNull();
  });
  test('un exercice d\'un bloc de programme en cours : le silence', () => {
    const debut = M.jourCivil(avantDe(TROIS));
    const bloc = { id: 'b1', dossier: 'Force', zone: 'lourd', debut, semaines: 4, decharge: false,
                   statut: 'en_cours', exercices: ['dc'], precedent: null };
    const d = decor(TROIS, { blocs: [bloc] });
    expect(d.p.exercices[0].escalier || null).toBeNull();
  });
  test('I71 — violations forgées : un saut à +30 %, une zone qui saute', () => {
    const d = decor(TROIS);
    const f = JSON.parse(JSON.stringify(d.p));
    f.exercices[0].escalier.depassement.vers = 'volume';
    expect(T.verifierPlan(f, d.e).erreurs.filter((x) => /^I71/.test(x)).length).toBeGreaterThanOrEqual(1);
    const g = JSON.parse(JSON.stringify(d.p));
    g.exercices[0].consigne.fondement.crans = 2;
    g.exercices[0].consigne.fondement.plafond = 0.15;
    g.exercices[0].consigne.ligne.charge = 40;
    g.exercices[0].consigne.haut = { charge: 52, vise: 8, n: 1 };
    expect(T.verifierPlan(g, d.e).erreurs.filter((x) => /^I71/.test(x)).length).toBe(1);
  });
});

describe('193-6 — une série « Au max » ne propose jamais de changer de zone', () => {
  const avecAuMax = () => VOLUME.concat([0, 1, 2].map(() => [40, [16]]));
  const groupesAu = (marque) => groupes(avecAuMax(marque)).map((g, i) => {
    if (i >= VOLUME.length && marque) g.series[g.series.length - 1].au_max_reserve = 0;
    return g;
  });
  const lire = (marque) => {
    const l = avecAuMax(marque);
    return M.consigneDExercice(groupesAu(marque), undefined, avantDe(l), Object.assign({}, OPTIONS, { seancesSousConsigne: toutes(l) })).depassement;
  };
  test('DISCRIMINANT — la même dernière série, sans marque, déclenche la carte', () => {
    expect(lire(false)).toMatchObject({ n: 3, zone: 'volume', vers: 'series_longues' });
  });
  test('DISCRIMINANT — marquée « Au max » : aucune carte', () => {
    expect(lire(true)).toBeNull();
  });
});
