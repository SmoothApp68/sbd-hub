/** @jest-environment node */
// « Une seule garde » (19/11/2026, MOTEUR §9.39, I232 et I216 étendu) — la garde que le coach compare à ce que la personne a noté est la garde
// des LIGNES de travail (`Plan.gardeDeLigne`, rôle `ligne`, exposée sur `x.gardeDeLigne`), jamais celle de la visée (`x.reserveAffichee`, parfois
// un test). À garde 0, une série à fond à au moins le bas de la zone est SUR la cible (`Moteur.aFondSurLaCible`, un prédicat partagé avec #716) :
// ni échec (cas L, porte du cran fermée), ni cas M, ni « garde N » dans la phrase.
process.env.TZ = 'Europe/Paris';
global.window = global;
require('../../v2/js/palier.js');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
const Plan = require('../../v2/js/plan.js');

const sp = (t) => String(t).replace(/[  ]/g, ' ');

describe('le prédicat unique, à fond sur la cible', () => {
  test('garde 0, réserve 0, reps ≥ bas : vrai ; sinon faux', () => {
    expect(M.aFondSurLaCible({ gardeAffichee: 0, reserve: 0, reps: 9, bas: 8 })).toBe(true);
    expect(M.aFondSurLaCible({ gardeAffichee: 0, reserve: 0, reps: 8, bas: 8 })).toBe(true);
    expect(M.aFondSurLaCible({ gardeAffichee: 0, reserve: 0, reps: 7, bas: 8 })).toBe(false);
    expect(M.aFondSurLaCible({ gardeAffichee: 1, reserve: 0, reps: 9, bas: 8 })).toBe(false);
    expect(M.aFondSurLaCible({ gardeAffichee: null, reserve: 0, reps: 9, bas: 8 })).toBe(false);
    expect(M.aFondSurLaCible({ gardeAffichee: 0, reserve: 1, reps: 9, bas: 8 })).toBe(false);
  });
  test('`rateSousLaZone` : à garde 0 dans la zone, pas d’échec ; sous la zone, l’échec reste', () => {
    expect(M.rateSousLaZone({ reps: 9, bas: 8, reserve: 0, charge: 70, gardeAffichee: 0 }).echec).toBe(false);
    expect(M.rateSousLaZone({ reps: 7, bas: 8, reserve: 0, charge: 70, gardeAffichee: 0 }).echec).toBe(true);
    expect(M.rateSousLaZone({ reps: 9, bas: 8, reserve: 0, charge: 70 }).echec).toBe(true);
  });
});

describe('la réaction au raté (niveau 1) à garde 0', () => {
  const base = { niveau: 'serie', role: 'travail', reglage: 'franc', objectif: 'muscle', charge: 70, bas: 8, haut: 10, rang: 1, derniere: false,
    chauffeValidee: true };
  test('9 au lieu de 10, à fond : cas B, même charge, « garde 0 » jamais écrit', () => {
    const d = M.reactionAuRate(Object.assign({}, base, { reps: 9, vise: 10, reserve: 0, gardeAffichee: 0 }));
    expect(d.cas).toBe('B');
    expect(d.charge.action).toBe('garde');
    expect(d.garde).toBe(0);
    const t = sp(M.phraseDeRate(d));
    expect(t).toBe('9 au lieu de 10. Même charge, entre 8 et 10.');
  });
  test('sans garde 0 (avant), la même série était un échec franc : cas L, baisse, « garde 1 »', () => {
    const d = M.reactionAuRate(Object.assign({}, base, { reps: 9, vise: 10, reserve: 0 }));
    expect(d.cas).toBe('L');
    expect(d.garde).toBe(1);
    expect(sp(M.phraseDeRate(d))).toMatch(/1 en réserve/);
  });
  test('pile sur la cible, à fond : silence (pas de cas M)', () => {
    const d = M.reactionAuRate(Object.assign({}, base, { reps: 10, vise: 10, reserve: 0, gardeAffichee: 0 }));
    expect(d.silence).toBe(true);
    expect(d.raison).toBe('tenue');
    expect(M.reactionAuRate(Object.assign({}, base, { reps: 10, vise: 10, reserve: 0 })).cas).toBe('M');
  });
  test('sous le bas de la zone, à fond : l’échec garde son sens (cas L)', () => {
    const d = M.reactionAuRate(Object.assign({}, base, { reps: 7, vise: 10, reserve: 0, gardeAffichee: 0 }));
    expect(d.cas).toBe('L');
    expect(d.garde).toBe(0);
    expect(sp(M.phraseDeRate(d))).not.toMatch(/garde/);
  });
  test('la porte du cran reste ouverte sur une série à fond dans la zone', () => {
    const c = { zone: { bas: 8, haut: 10 }, cran: { charge: 72.5, vise: 8 }, travail: 70, series: [{ iSerie: 0, charge: 70, reps: 9, vise: 10, reserve: 0 }] };
    expect(M.decisionDeLaPorte(c).raison).toBe('echec');
    expect(M.decisionDeLaPorte(Object.assign({}, c, { gardeAffichee: 0 })).fermee).toBe(false);
  });
});

// Le vrai chemin du plan (planDeSeance + verifierPlan), comme les témoins du contradicteur (revue/cb/head-porte.js, head-i216-trou.js).
function jouer(cons, faites, reglage, extra) {
  let k = 0; const id = () => 'x-s' + (++k);
  let se = Seance.creer({ id: 'S', userId: 'u', idSerie: id }); se = Seance.ajouterExercice(se, 'x', id, { series: cons.n });
  faites.forEach((f, t) => {
    se = Seance.modifierSerie(se, 0, t, { charge_kg: f[0], reps: f[1] });
    se = Seance.definirEffort(se, 0, t, { rpe: f[2], ressenti: null });
    se = Seance.valider(se, 0, t, new Date('2026-10-11T10:' + (30 + 3 * t) + ':00Z'));
  });
  const e = Object.assign({ seance: { id: 'S', debut: '2026-10-11T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { x: { consigne: cons, contexte: { cran: 2.5, haut: null } } }, reglage, paris: [], objectif: 'muscle',
    catalogue: { x: { nom: 'Presse', equipement: 'machine', polyarticulaire: true, muscles_primaires: ['quadriceps'] } } }, extra || {});
  const p = Plan.planDeSeance(e);
  return { p, e, x: p.exercices[0], erreurs: Plan.verifierPlan(p, e, null).erreurs };
}
const avecTest = { etat: 'progression', zone: 'hypertrophie', palier: 70, niveau: 9, n: 4, ligne: { charge: 70, vise: 10 }, haut: { charge: 72.5, vise: 8, k: 1 } };
const sansTest = Object.assign({}, avecTest, { haut: null });

describe('le plan : la garde des lignes, une valeur, lue partout', () => {
  test('Franc, Hypertrophie, 70 × 9 à RPE 10 : le test à 72,5 kg reste (avant : porte fermée « allée jusqu’à l’échec »)', () => {
    const r = jouer(avecTest, [[70, 9, 10]], 'franc');
    expect(r.x.gardeDeLigne).toBe(0);
    expect(r.x.porteDuCran).toBeNull();
    expect(r.x.lignes.some((l) => l.role === 'test' && l.charge === 72.5)).toBe(true);
    expect(r.erreurs).toEqual([]);
  });
  test('Normal, la même série : la porte se ferme toujours (garde 1, l’échec n’était pas demandé)', () => {
    const r = jouer(avecTest, [[70, 9, 10]], 'normal');
    expect(r.x.porteDuCran && r.x.porteDuCran.raison).toBe('echec');
    expect(r.erreurs).toEqual([]);
  });
  test('Franc, 70 × 9 à RPE 9 : « Même charge », sans « garde 1 »', () => {
    const r = jouer(avecTest, [[70, 9, 9]], 'franc');
    expect(r.x.rate.cas).toBe('B');
    expect(r.x.rate.garde).toBe(0);
    expect(sp(r.x.rate.phrase)).toBe('9 au lieu de 10. Même charge, entre 8 et 10.');
    expect(r.erreurs).toEqual([]);
  });
  test('Franc, 70 × 10 à RPE 10 devant le test : silence (avant : « Pile sur la cible, sans marge. Même charge, garde 1 »)', () => {
    const r = jouer(avecTest, [[70, 10, 9], [70, 10, 9], [70, 10, 10]], 'franc');
    expect(r.x.rate).toBeNull();
    expect(r.erreurs).toEqual([]);
  });
  test('65 ans et plus, test en dernière ligne, 70 × 9 à RPE 9 : « garde 2 » (avant : « garde 1 », le trou de I216)', () => {
    const r = jouer(avecTest, [[70, 9, 9]], 'normal', { plus65: true });
    expect(r.x.reserveAffichee).toBeNull();
    expect(r.x.gardeDeLigne).toBe(2);
    expect(r.x.rate.garde).toBe(2);
    expect(r.erreurs).toEqual([]);
  });
  test('Franc Lourd, test en dernière ligne : la puce dit garde 0 (visée), les lignes sont en garde 1, la réaction dit « garde 1 »', () => {
    const lourd = { etat: 'progression', zone: 'lourd', palier: 100, niveau: 4, n: 4, ligne: { charge: 100, vise: 5 }, haut: { charge: 102.5, vise: 3, k: 1 } };
    const r = jouer(lourd, [[100, 4, 9]], 'franc', { objectif: 'force' });
    expect(r.x.reserveAffichee).toBe(0);
    expect(r.x.gardeDeLigne).toBe(1);
    expect(r.x.rate.garde).toBe(1);
    expect(r.erreurs).toEqual([]);
  });
});

describe('les vérificateurs recalculent la garde depuis les entrées', () => {
  test('I232 : une réaction qui dit « garde 1 » sur des lignes en garde 0 est refusée', () => {
    const r = jouer(sansTest, [[70, 9, 9]], 'franc');
    expect(r.erreurs).toEqual([]);
    const p = JSON.parse(JSON.stringify(r.p));
    p.exercices[0].rate.garde = 1;
    p.exercices[0].gardeDeLigne = 1;     // le champ du plan n'est pas lu : la garde se recalcule
    expect(Plan.verifierPlan(p, r.e, null).erreurs.some((m) => /^I232/.test(m))).toBe(true);
  });
  test('I232 : une porte fermée pour « échec » sur une série dans la zone, à garde 0, est refusée', () => {
    const r = jouer(avecTest, [[70, 9, 10]], 'normal');
    const p = JSON.parse(JSON.stringify(r.p));
    const e = Object.assign({}, r.e, { reglage: 'franc' });
    p.reglage = 'franc';
    expect(Plan.verifierPlan(p, e, null).erreurs.some((m) => /^I232/.test(m))).toBe(true);
  });
  test('I216 étendu : avec un test en dernière ligne, « garde 1 » chez un 65 ans et plus est refusé', () => {
    const r = jouer(avecTest, [[70, 9, 9]], 'normal', { plus65: true });
    const p = JSON.parse(JSON.stringify(r.p));
    p.exercices[0].rate.garde = 1;
    expect(Plan.verifierPlan(p, r.e, null).erreurs.some((m) => /^I216/.test(m))).toBe(true);
  });
});

// ── C-1 (I233) est RETIRÉ (« Au max » disparaît, 20/11/2026, MOTEUR §9.30, I251) : il n'y a plus de réserve demandée. Les mêmes cas, rejoués avec
// l'EFFORT NOTÉ SEUL : la capacité tenue (I252) décide — reps saisies + réserve notée ≥ reps visées + visée affichée. Aucun ne régresse : celui qui va au
// bout et fait plus que prévu ne garde pas ; celui qui fait juste la cible sans marge garde, comme sans la marque d'avant.
describe('C-1 rejoué avec l’effort noté seul (la capacité tenue remplace « Au max » fait comme demandé)', () => {
  let n = 0;
  const brute = (kg, reps, res, extra) => Object.assign({ id: 'x' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: res === undefined ? null : res,
    type_serie: 'travail', exercise_slug: 'dc' }, extra || {});
  const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
  const hist = (kg, h, der, extra) => ['09-13', '09-06', '08-30', '08-23', '08-16'].map((x, i) => ({ seance: { id: 'H' + i, debut: jour(x) },
    series: [brute(kg, h), brute(kg, h), i === 0 ? brute(kg, der.reps, der.res, extra) : brute(kg, h)] }));
  const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', edition: false };
  const consigne = (reglage, res, extra, reps) => M.consigneDExercice(hist(100, 12, { reps: reps === undefined ? 12 : reps, res }, extra), undefined, jour('09-20'),
    Object.assign({}, OPT, { reglage })).consigne;

  test('Normal : à fond une rep au-dessus de la cible (13 « reste 0 » pour 12 en gardant 1) ne fait pas garder : la capacité est tenue', () => {
    const k = consigne('normal', 'reste_0', {}, 13);
    expect(k.etat).toBe('test_propose');
    expect(k.fondement && k.fondement.effortVise && k.fondement.effortVise.effet === 'garde').toBeFalsy();
    expect(k.fondement.capacite).toBeTruthy();
  });
  test('Prudent : à fond deux reps au-dessus (14 « reste 0 » pour 12 en gardant 2) ne fait pas garder ; une seule au-dessus garde', () => {
    expect(consigne('prudent', 'reste_0', {}, 14).etat).toBe('test_propose');
    expect(consigne('prudent', 'reste_0', {}, 13).fondement.effortVise.effet).toBe('garde');
  });
  test('Normal, le témoin : la cible juste, « reste 0 », garde toujours', () => {
    const k = consigne('normal', 'reste_0', {});
    expect(k.etat).toBe('progression');
    expect(k.fondement.effortVise.effet).toBe('garde');
    expect(k.fondement.effortVise.demandee).toBeUndefined();
  });
  test('une marque `au_max_reserve` laissée par une version d’avant ne change plus rien (I251) : 12 « reste 0 » avec `au_max_reserve: 0` garde comme sans', () => {
    const avec = consigne('normal', 'reste_0', { au_max_reserve: 0 });
    const sans = consigne('normal', 'reste_0', {});
    expect(avec.etat).toBe(sans.etat);
    expect(avec.fondement.effortVise.effet).toBe('garde');
    expect(avec.fondement.effortVise.demandee).toBeUndefined();
  });
  test('Franc : « reste 2 » noté (sans demande) vaut la preuve facile (deux crans), avec ou sans une marque d’avant', () => {
    [{}, { au_max_reserve: 2 }].forEach((extra) => {
      const k = consigne('franc', 'reste_2', extra);
      expect(k.haut.charge).toBe(105);
      expect(k.fondement.preuve).toBe('facile');
      expect(k.fondement.effortVise.preuveFacile).toBe(true);
      expect(k.fondement.effortVise.demandee).toBeUndefined();
    });
  });
  test('la sortie (169) : une séance d’avant finie à la cible sans marge est la première garde, marque d’avant ou non', () => {
    const h = hist(100, 12, { reps: 12, res: 'reste_0' }, {});
    h[1].series[2] = brute(100, 12, 'reste_0', { au_max_reserve: 0 });
    const k = M.consigneDExercice(h, undefined, jour('09-20'), Object.assign({}, OPT, { reglage: 'normal' })).consigne;
    expect(k.etat).toBe('test_propose');
    expect(k.fondement.effortVise.sortie).toBe(true);
  });
  // La garde de bord (Lourd, visée 2 en Normal, 1 en Franc) : la capacité tenue seule — la rep de plus à fond compte comme une marge.
  const histB = (reps, res, extra) => [0, 1, 2].map((i) => ({ seance: { id: 'B' + i, debut: jour(['09-13', '09-06', '08-30'][i]) },
    series: [brute(150, 2), brute(150, 2), i === 0 ? brute(150, reps, res, extra) : brute(150, 2)] }));
  const optB = (reglage) => Object.assign({}, OPT, { reglage });
  test.each([['normal'], ['franc']])('%s, garde de bord : 2 reps à fond pour 2 visées gardent 150 kg (aucune marge), marque d’avant ou non', (reglage) => {
    const sans = M.consigneDExercice(histB(2, 'reste_0', {}), undefined, jour('09-20'), optB(reglage)).consigne;
    const avec = M.consigneDExercice(histB(2, 'reste_0', { au_max_reserve: 0 }), undefined, jour('09-20'), optB(reglage)).consigne;
    expect(sans.etat).toBe('bord_garde');
    expect(avec.etat).toBe('bord_garde');
    expect(avec.ligne).toEqual({ charge: 150, vise: 2 });
  });
  test('Franc, garde de bord : 3 reps à fond, ou « reste 1 » à 2 reps, tiennent la capacité (visée 1) : la règle monte', () => {
    const trois = M.consigneDExercice(histB(3, 'reste_0', {}), undefined, jour('09-20'), optB('franc')).consigne;
    const un = M.consigneDExercice(histB(2, 'reste_1', {}), undefined, jour('09-20'), optB('franc')).consigne;
    expect(trois.etat).toBe('bord');
    expect(trois.ligne.charge).toBe(152.5);
    expect(un.etat).toBe('bord');
    expect(un.ligne.charge).toBe(152.5);
  });
  test('Normal, garde de bord : 4 reps à fond tiennent la capacité (2 + 2) et montent ; 3 à fond gardent', () => {
    expect(M.consigneDExercice(histB(4, 'reste_0', {}), undefined, jour('09-20'), optB('normal')).consigne.etat).toBe('bord');
    expect(M.consigneDExercice(histB(3, 'reste_0', {}), undefined, jour('09-20'), optB('normal')).consigne.etat).toBe('bord_garde');
  });
});

describe('I233 est retiré : un fondement d’avant portant `demandee` n’est plus comparé', () => {
  const ev = (o) => Object.assign({ effet: 'garde', charge: 70, reps: 10, reserve: 0, visee: 1, auHaut: true, deja: false }, o);
  const cons = (e) => Object.assign({}, sansTest, { etat: 'progression', fondement: { effortVise: e } });
  test('aucune erreur I233, avec ou sans `demandee`', () => {
    expect(jouer(cons(ev({ demandee: 0 })), [], 'normal').erreurs.some((m) => /^I233/.test(m))).toBe(false);
    expect(jouer(cons(ev({})), [], 'normal').erreurs.some((m) => /^I233/.test(m))).toBe(false);
  });
});

// ── C-2 (I234) — « facile » par la réserve se mesure contre la visée AFFICHÉE (le plancher des populations protégées), pas la table. ──
describe('C-2 : « facile » contre la visée affichée', () => {
  let n = 0;
  const brute = (kg, reps, res) => ({ id: 'y' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: res === undefined ? null : res,
    type_serie: 'travail', exercise_slug: 'dc' });
  const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
  const hist = (kg, res) => ['09-13', '09-06', '08-30', '08-23', '08-16'].map((x, i) => ({ seance: { id: 'H' + i, debut: jour(x) },
    series: [brute(kg, 9), brute(kg, 9), i === 0 ? brute(kg, 9, res) : brute(kg, 9)] }));
  const consigne = (res, o) => M.consigneDExercice(hist(100, res), undefined, jour('09-20'),
    Object.assign({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', edition: false, reglage: 'franc' }, o)).consigne;

  test('Franc, objectif Forme (visée affichée 2) : « reste 2 » pose le test d’un cran (avant : deux crans, 105 kg)', () => {
    const k = consigne('reste_2', { protegee: true, objectif: 'forme' });
    expect(k.etat).toBe('test_propose');
    expect(k.haut.charge).toBe(102.5);
    expect(k.fondement.preuve).toBeUndefined();
    expect(k.fondement.effortVise.visee).toBe(2);
    expect(k.fondement.effortVise.preuveFacile).toBeUndefined();
  });
  test('Franc, hors population protégée : « reste 2 » vaut toujours la preuve facile (rien ne change)', () => {
    const k = consigne('reste_2', {});
    expect(k.haut.charge).toBe(105);
    expect(k.fondement.preuve).toBe('facile');
  });
  test('I234 : une preuve facile tirée d’une réponse égale à la visée affichée est refusée', () => {
    const e = { effet: 'test', charge: 70, reps: 10, reserve: 2, visee: 2, viseeTable: 0, protegee: true, preuveFacile: true };
    const k = Object.assign({}, avecTest, { etat: 'test_propose', fondement: { effortVise: e, preuve: 'facile' } });
    expect(jouer(k, [], 'franc', { objectif: 'forme' }).erreurs.some((m) => /^I234/.test(m))).toBe(true);
  });
});

// ── C-3 (I235, I143) — le report de zone : la réserve AFFICHÉE (plancher des protégés), le domaine 3-10 reps, la réserve écrite au fondement. ──
describe('C-3 : le report de zone lit la réserve affichée', () => {
  const cran = (c, sens) => c + 2.5 * sens;
  const report = (o) => M.reportDeZone(Object.assign({ avant: '2026-10-20T10:00:00Z', zoneAvant: 'lourd', zone: 'hypertrophie', reglage: 'franc', cran,
    seances: [{ debut: '2026-10-13T10:00:00Z', palier: 100, niveau: 5, reserve: null }] }, o));

  test('Franc, hors population protégée : la table (0), 90 kg × 8 — rien ne change', () => {
    const r = report({});
    expect(r.origine).toBe('estimee');
    expect(r.charge).toBe(90);
    expect(r.reserve).toBe(0);
  });
  test('Franc, population protégée : la réserve affichée (2), 87,5 kg × 8 (avant : 90 kg, sur la table)', () => {
    const r = report({ protegee: true });
    expect(r.charge).toBe(87.5);
    expect(r.reserve).toBe(2);
  });
  const nouvelle = (ligne, reserve) => ({ etat: 'nouvelle_zone', zone: 'hypertrophie', palier: 100, niveau: 5, n: 3, ligne, haut: null,
    fondement: { report: Object.assign({ origine: 'estimee', zoneAvant: 'lourd', depuis: { date: '2026-10-13', palier: 100, niveau: 5 }, ligne: 'personne' },
      reserve === undefined ? {} : { reserve }) } });
  test('I143 relit la réserve écrite : 90 kg × 8 sur une réserve de 2 dépasse le max de la source', () => {
    const ok = jouer(nouvelle({ charge: 87.5, vise: 8 }, 2), [], 'franc', { plus65: true });
    expect(ok.erreurs.filter((m) => /^I143|^I235/.test(m))).toEqual([]);
    const ko = jouer(nouvelle({ charge: 90, vise: 8 }, 2), [], 'franc', { plus65: true });
    expect(ko.erreurs.some((m) => /^I143/.test(m))).toBe(true);
  });
  test('I143, une consigne d’avant (sans réserve écrite) : la table', () => {
    expect(jouer(nouvelle({ charge: 90, vise: 8 }), [], 'franc', { plus65: true }).erreurs.filter((m) => /^I143|^I235/.test(m))).toEqual([]);
  });
  test('I235 : une réserve écrite qui n’est l’affichée d’aucune population est refusée', () => {
    const r = jouer(nouvelle({ charge: 87.5, vise: 8 }, 1), [], 'franc', { plus65: true });
    expect(r.erreurs.some((m) => /^I235/.test(m))).toBe(true);
    expect(jouer(nouvelle({ charge: 87.5, vise: 8 }, 1), [], 'franc').erreurs.some((m) => /^I235/.test(m))).toBe(true);
  });
  // Contradicteur final (R1) : la clé du gel ne porte pas la population ; une consigne figée avant que la population change garde sa réserve.
  test('I235 (R1) : la population protégée change pendant une séance à consigne figée, aucune fausse erreur', () => {
    expect(jouer(nouvelle({ charge: 90, vise: 8 }, 0), [], 'franc', { plus65: true }).erreurs.filter((m) => /^I235/.test(m))).toEqual([]);
    expect(jouer(nouvelle({ charge: 87.5, vise: 8 }, 2), [], 'franc').erreurs.filter((m) => /^I235/.test(m))).toEqual([]);
  });
});

// ── Contradicteur final (C1, C3, C4). ──
describe('C1 : à garde 0, pas de cas M, même sous le bas de la zone', () => {
  const t = { etat: 'test_propose', zone: 'hypertrophie', palier: 70, niveau: 6, n: 4, ligne: { charge: 70, vise: 7 }, haut: { charge: 72.5, vise: 8, k: 1 } };
  test('Franc, ligne 70 × 7 (sous le bas 8) + test, 7 à RPE 9, 7 à RPE 9, 7 à RPE 10, « Tenter » pris : silence, aucune erreur', () => {
    const r = jouer(t, [[70, 7, 9], [70, 7, 9], [70, 7, 10]], 'franc');
    const e = Object.assign({}, r.e, { seance: Object.assign({}, r.e.seance, { gestes: [{ geste: 'cran_tente', slug: 'x' }] }) });
    const p = Plan.planDeSeance(e);
    expect(p.exercices[0].gardeDeLigne).toBe(0);
    expect(p.exercices[0].lignes.some((l) => l.role === 'test')).toBe(true);
    expect(p.exercices[0].rate).toBeNull();
    expect(Plan.verifierPlan(p, e, null).erreurs).toEqual([]);
  });
  test('le moteur direct : 7 pour 7 à fond, sous le bas, garde 0 : silence `tenue` ; garde 1 : cas M', () => {
    const b = { niveau: 'serie', role: 'travail', reglage: 'franc', objectif: 'muscle', charge: 70, bas: 8, haut: 10, rang: 1, derniere: false,
      chauffeValidee: true, reps: 7, vise: 7, reserve: 0 };
    const d = M.reactionAuRate(Object.assign({ gardeAffichee: 0 }, b));
    expect(d.silence).toBe(true);
    expect(d.raison).toBe('tenue');
    expect(M.reactionAuRate(Object.assign({ gardeAffichee: 1 }, b)).cas).toBe('M');
  });
});

describe('C3 : après un zéro rep, aucune garde de ligne', () => {
  let nb = 0;
  const brute = (kg, reps) => ({ id: 'z' + (++nb), rang: nb, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'x' });
  const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
  test('Franc, Volume, tenue après un zéro, 70 × 11 à RPE 10 : `gardeDeLigne` nulle, la baisse proposée (avant : « Même charge »)', () => {
    const gr = [0, 1, 2, 3].map((i) => ({ seance: { id: 'H' + i, debut: jourN(i) }, series: [brute(70, 12), brute(70, 12), brute(70, 12)] }));
    gr[3].series.push(brute(72.5, 0));
    const avant = new Date(Date.parse(jourN(3)) + 3 * 864e5).toISOString();
    const c = M.consigneDExercice(gr, undefined, avant, { mesure: 'charge_reps', equipement: 'machine', intention: 'progresser', reglage: 'franc', edition: false, debutant: false }).consigne;
    expect(c.etat).toBe('tenue_apres_zero');
    expect(M.estApresZero(c)).toBe(true);
    expect(Plan.gardeDeLigne(c, { mesure: 'charge_reps', reglage: 'franc' })).toBeNull();
    let k = 0; const id = () => 'x-s' + (++k);
    let se = Seance.creer({ id: 'S', userId: 'u', idSerie: id }); se = Seance.ajouterExercice(se, 'x', id, { series: c.n || 3 });
    se = Seance.modifierSerie(se, 0, 0, { charge_kg: 70, reps: 11 }); se = Seance.definirEffort(se, 0, 0, { rpe: 10, ressenti: null });
    se = Seance.valider(se, 0, 0, new Date(Date.parse(avant) + 30 * 60000));
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices, gestes: [] }, consignes: { x: { consigne: c, pas: 2.5, contexte: { cran: 2.5, haut: null } } },   // le pas de la machine est celui que la fixture donne (sans lui, le repli de la machine : 5 kg, lot b2 n° 2)
      reglage: 'franc', paris: [], objectif: 'muscle', catalogue: { x: { nom: 'Presse', equipement: 'machine', polyarticulaire: true, muscles_primaires: ['quadriceps'] } } };
    const x = Plan.planDeSeance(e).exercices[0];
    expect(x.gardeDeLigne).toBeNull();
    expect(x.reserveAffichee).toBeNull();
    expect(x.rate.cas).toBe('L');
    expect(x.rate.charge).toEqual({ action: 'baisse', kg: 62.5 });
    expect(sp(x.rate.phrase)).toMatch(/^11 au lieu de 12\. On passe à 62,5\skg/);
  });
});

describe('C4 : le niveau 2 à garde 0 et le câblage de C-3 sur le vrai chemin', () => {
  const hypT = { etat: 'test_propose', zone: 'hypertrophie', palier: 70, niveau: 10, n: 3, ligne: { charge: 70, vise: 10 }, haut: { charge: 72.5, vise: 8, k: 1 } };
  test('(b) Franc, test en dernière ligne, 9 à RPE 9 puis 9 à RPE 10 : cas X, garde 0, « La suite vise 9 » sans « garde »', () => {
    const r = jouer(hypT, [[70, 9, 9], [70, 9, 10]], 'franc');
    expect(r.x.gardeDeLigne).toBe(0);
    expect(r.x.porteDuCran).toBeNull();
    expect(r.x.rate.cas).toBe('X');
    expect(r.x.rate.garde).toBe(0);
    expect(sp(r.x.rate.phrase)).toBe('9 puis 9, sous la cible. La suite vise 9, entre 8 et 10.');
    expect(r.erreurs).toEqual([]);
  });
  test('(c) Franc, test en dernière ligne, 9 à RPE 10 puis 7 à RPE 10 : porte fermée « sous la zone », aucune erreur', () => {
    const r = jouer(Object.assign({}, hypT, { n: 4 }), [[70, 9, 10], [70, 7, 10]], 'franc');
    expect(r.x.porteDuCran && r.x.porteDuCran.raison).toBe('sous_la_zone');
    expect(r.x.lignes.some((l) => l.role === 'test')).toBe(false);
    expect(r.erreurs).toEqual([]);
  });
  let rang = 0;
  const g = (debut, charge, reps, douleur) => ({ seance: { id: 'S-' + debut, debut, fin: debut.replace('T10', 'T11') },
    series: reps.map((n, i) => ({ id: 'w' + (++rang), rang, charge_kg: charge, reps: n, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'x',
      douleur: douleur === true && i === reps.length - 1 })) });
  const hist = (douleur) => [g('2026-09-01T10:00:00Z', 100, [5, 5, 5]), g('2026-09-04T10:00:00Z', 100, [5, 5, 5]), g('2026-09-08T10:00:00Z', 100, [5, 5, 5], douleur)];
  const O = (o) => Object.assign({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'franc' }, o);
  const choix = { correction: 'hypertrophie', correctionsDeZone: [{ id: '1', exercise_slug: 'x', zone: 'hypertrophie', corrigee_a: '2026-09-10T20:00:00Z' }] };
  test('(a) `consigneDExercice`, Lourd → Hypertrophie, Franc, population protégée : 87,5 kg × 8, `report.reserve` 2 (hors protégés : 90 kg, 0)', () => {
    const p = M.consigneDExercice(hist(false), null, '2026-09-11T10:00:00Z', O(Object.assign({ protegee: true }, choix))).consigne;
    expect(p.etat).toBe('nouvelle_zone');
    expect(p.ligne).toEqual({ charge: 87.5, vise: 8 });
    expect(p.fondement.report.reserve).toBe(2);
    const n = M.consigneDExercice(hist(false), null, '2026-09-11T10:00:00Z', O(choix)).consigne;
    expect(n.ligne).toEqual({ charge: 90, vise: 8 });
    expect(n.fondement.report.reserve).toBe(0);
  });
  test('(a bis) « Plus léger » après une douleur (`reprisePour`), Lourd → Mix, Franc : 90 kg × 6 pour une population protégée (hors protégés : 92,5 kg)', () => {
    const p = M.consigneDExercice(hist(true), null, '2026-09-11T10:00:00Z', O({ protegee: true }));
    expect(p.reprise.zone).toBe('mix');
    expect(p.reprise.repli).toEqual({ source: 'report', palier: 100, ligne: [90, 6] });
    const n = M.consigneDExercice(hist(true), null, '2026-09-11T10:00:00Z', O({}));
    expect(n.reprise.repli.ligne).toEqual([92.5, 6]);
  });
});
