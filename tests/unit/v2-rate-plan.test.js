/** @jest-environment node */
//
// 236 (MOTEUR §9.39) — LE COACH EN TEMPS RÉEL APRÈS UN RATÉ, dans le plan : le vrai chemin (`seance.js`, `planDeSeance`, `verifierPlan`,
// `verifierPhrases`). La séance d'Alexis du 03/11 rejouée en synthétique (mêmes chiffres, aucune donnée personnelle) :
//   tractions visé 8 : 7-7-6-6 ; incliné visé 11 : 11-9-9 ; rowing, la charge baissée en cours d'exercice (93 → 86) ; élévations (9 → 7).
// Elle doit déclencher le niveau 1 aux tractions (après la 1re série), le niveau 2 (après la 2e), la carte au rowing.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const sp = (t) => t.replace(/[\u00a0\u202f]/g, ' ');
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };

// Les quatre exercices : slug, nb de séries, reps visées, charge du plan, zone.
const EXOS = [
  { slug: 'tractions', n: 4, vise: 8, charge: 0, zone: 'hypertrophie', equip: 'corps', mesure: 'reps' },
  { slug: 'incline', n: 3, vise: 11, charge: 40, zone: 'volume', equip: 'haltere', mesure: 'charge_reps' },
  { slug: 'rowing', n: 4, vise: 10, charge: 93, zone: 'hypertrophie', equip: 'machine', mesure: 'charge_reps' },
  { slug: 'elevations', n: 3, vise: 12, charge: 9, zone: 'volume', equip: 'haltere', mesure: 'charge_reps' }
];

// `faits` : { slug: [[charge, reps], …] } — les séries validées, dans l'ordre.
function monter(faits, extra) {
  let k = 0;
  const id = () => 'a-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  EXOS.forEach((x, i) => {
    se = S.ajouterExercice(se, x.slug, id, { series: x.n });
    se.exercices[i].series.forEach((s) => { s.reps_visees = x.vise; });
  });
  let minute = 0;
  EXOS.forEach((x, i) => {
    (faits[x.slug] || []).forEach(([ch, reps], j) => {
      se = S.modifierSerie(se, i, j, { charge_kg: ch, reps });
      se = S.valider(se, i, j, new Date(Date.UTC(2026, 10, 3, 10, 0, 0) + (++minute) * 150000));
    });
  });
  if (extra && extra.gestes) extra.gestes.forEach((g) => { se = S.noterGeste(se, g); });
  return se;
}
function entrees(se, extra) {
  const consignes = {}, catalogue = {};
  EXOS.forEach((x) => {
    consignes[x.slug] = { consigne: { etat: 'progression', zone: x.zone, palier: x.charge, n: x.n, ligne: { charge: x.charge, vise: x.vise }, haut: null },
      contexte: { cran: x.charge + 2.5, haut: null }, pas: 2.5 };
    catalogue[x.slug] = { equipement: x.equip, mesure: x.mesure, pas: 2.5, nom: x.slug, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] };
  });
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes },
    consignes, reglage: 'normal', objectif: 'les_deux', paris: [], catalogue
  }, extra || {});
}
const plan = (faits, extra) => { const se = monter(faits, extra); const e = entrees(se, extra && extra.entrees); return { se, e, p: T.planDeSeance(e) }; };

describe('niveau 1 — la 1re série des tractions : 7 au lieu de 8', () => {
  test('une phrase sous la série, la fourchette sur les suivantes, la charge intacte', () => {
    const { e, p } = plan({ tractions: [[0, 7]] });
    const x = p.exercices[0];
    expect(x.rate).toBeTruthy();
    expect(x.rate.niveau).toBe('serie');
    expect(x.rate.iSerie).toBe(0);
    expect(sp(x.rate.phrase)).toBe('7 au lieu de 8. Même charge, garde 1, entre 6 et 7.');
    expect(x.rate.recale).toBe(true);
    // la fourchette est le pari des lignes suivantes (toutes : la 1re série ratée recale d'un coup) ; la charge ne bouge pas
    x.lignes.slice(1).forEach((l) => { expect(l.vise).toBeLessThanOrEqual(7); expect(l.charge).toBe(0); });
    expect(x.paris[1].borne_basse).toBe(6);
    expect(x.paris[1].borne_haute).toBeGreaterThanOrEqual(6);
    propre(p, e);
  });
});

describe('niveau 2 — après 2 séries sous la cible', () => {
  test('la suivante vise ce qui vient d’être fait ; la phrase remplace celle du niveau 1', () => {
    const { e, p } = plan({ tractions: [[0, 7], [0, 7]] });
    const x = p.exercices[0];
    expect(x.rate.niveau).toBe('exercice');
    expect(sp(x.rate.phrase)).toBe('7 puis 7, sous la cible. La suite vise 7, garde 1, entre 6 et 8.');
    expect(x.lignes[2].vise).toBe(7);
    expect(x.lignes[3].vise).toBe(7);
    expect(x.phrases.filter((q) => q.ou === 'rate')).toHaveLength(1);
    propre(p, e);
  });
  test('la dernière série : rien (J)', () => {
    const { p } = plan({ tractions: [[0, 7], [0, 7], [0, 6], [0, 6]] });
    expect(p.exercices[0].rate).toBeNull();
  });
});

describe('niveau 3 — la forme du jour : la carte au rowing', () => {
  const fait = { tractions: [[0, 7], [0, 7], [0, 6], [0, 6]], incline: [[40, 11], [40, 9], [40, 9]] };
  test('tractions et incliné sous la cible : la carte, UNE, en tête du rowing', () => {
    const { e, p } = plan(fait);
    expect(p.formeDuJour.carte).toBe(true);
    expect(p.formeDuJour.iExo).toBe(2);
    expect(p.exercices[2].carteForme).toBeTruthy();
    expect(sp(p.exercices[2].carteForme.phrase)).toBe('Tes séries sont sous la cible sur les 2 derniers exercices. Pour la fin de séance ?');
    expect(p.exercices.filter((x) => x.carteForme)).toHaveLength(1);
    propre(p, e);
  });
  test('avec la charge baissée au rowing (93 → 86), la carte se pose sur les élévations et le dit', () => {
    const f = Object.assign({}, fait, { rowing: [[86, 10], [86, 10], [86, 10], [86, 10]] });
    const { e, p } = plan(f);
    expect(p.formeDuJour.iExo).toBe(3);
    expect(sp(p.exercices[3].carteForme.phrase)).toBe('Tes séries sont sous la cible sur 2 des 3 derniers exercices, et tu as baissé la charge sur rowing. Pour la fin de séance ?');
    propre(p, e);
  });
  test('« Garder le plan » : la carte ne revient jamais', () => {
    const { e, p } = plan(fait, { gestes: [{ geste: 'forme_gardee', slug: 'rowing' }] });
    expect(p.formeDuJour).toMatchObject({ reponse: 'garde', carte: null });
    expect(p.exercices.some((x) => x.carteForme)).toBe(false);
    propre(p, e);
  });
  test('« Ajuster la fin » : cibles au bas de la zone, une série de moins par exercice restant, pas d’« Au max »', () => {
    const { e, p } = plan(fait, { gestes: [{ geste: 'forme_ajustee', slug: 'rowing' }] });
    expect(p.formeDuJour.reponse).toBe('ajuste');
    const retire = T.lignesAAjuster(p);
    expect(retire.map((r) => r.iExo)).toEqual([2, 3]);
    expect(retire[0].iSerie).toBe(3);
    const row = p.exercices[2];
    row.lignes.filter((l) => l.iSerie !== 3).forEach((l) => expect(l.vise).toBeLessThanOrEqual(8));
    expect(row.auMax).toBeNull();
    propre(p, e);
  });
  test('un seul exercice qui flanche : pas de carte', () => {
    const { p } = plan({ tractions: [[0, 7], [0, 7], [0, 6], [0, 6]], incline: [[40, 11], [40, 11], [40, 11]] });
    expect(p.formeDuJour.carte).toBeNull();
  });
});

describe('la charge ne baisse que par un geste', () => {
  test('sous la zone (60 kg × 6 au lieu de 10) : la phrase propose, les lignes gardent la charge ; « Prendre » la baisse', () => {
    const avant = plan({ rowing: [[93, 5]] });
    const x = avant.p.exercices[2];
    expect(x.rate.charge.action).toBe('baisse');
    expect(x.rate.boutons.map((b) => b.cle)).toContain('prendre');
    x.lignes.slice(1).forEach((l) => expect(l.charge).toBe(93));
    const apres = plan({ rowing: [[93, 5]] }, { gestes: [{ geste: 'rate_prise', slug: 'rowing', rang: 0, bouton: 'prendre', kg: x.rate.charge.kg }] });
    const y = apres.p.exercices[2];
    y.lignes.slice(1).forEach((l) => expect(l.charge).toBe(x.rate.charge.kg));
    expect(y.paris[1].fondement.charge).toBe(x.rate.charge.kg);
    propre(apres.p, apres.e);
  });
});

describe('les contextes qui se taisent', () => {
  test('Entretenir, décharge, semaine de test : aucune réaction', () => {
    const se = monter({ tractions: [[0, 7]] });
    const e = entrees(se);
    expect(T.planDeSeance(Object.assign({}, e, { intention: 'entretien' })).exercices[0].rate).toBeNull();
    expect(T.planDeSeance(e).exercices[0].rate).toBeTruthy();
  });
  test('deux propositions ignorées sur un exercice : silence jusqu’à la fin', () => {
    const { p } = plan({ incline: [[40, 6], [40, 6], [40, 6]], rowing: [] });
    // 3 séries sous la zone, 2 propositions sans geste : la 3e (dernière) est de toute façon muette (J)
    expect(p.exercices[1].rate).toBeNull();
  });
});

describe('paris ratés à la suite', () => {
  test('2 séances de suite : « un cran dessous » ou « je retente », une fois', () => {
    const se = monter({});
    const e = entrees(se, { parisRates: { rowing: { n: 2, charge: 93, reps: 10 } } });
    const p = T.planDeSeance(e);
    const c = p.exercices[2].parisRates.carte;
    expect(sp(c.phrase)).toBe('Ton pari n’a pas tenu 2 séances de suite. Un cran dessous : 92,5 kg × 10, ou tu retentes ?');
    expect(c.boutons.map((b) => b.cle)).toEqual(['cran', 'retente']);
    p.exercices[2].lignes.forEach((l) => expect(l.charge).toBe(93));
    propre(p, e);
    const q = T.planDeSeance(entrees(monter({}, { gestes: [{ geste: 'paris_cran', slug: 'rowing' }] }), { parisRates: { rowing: { n: 2, charge: 93, reps: 10 } } }));
    expect(q.exercices[2].parisRates.reponse).toBe('cran');
    q.exercices[2].lignes.forEach((l) => expect(l.charge).toBe(92.5));
  });
});

// ── L'exemption : une séance « ajustée à la forme du jour » ne compte pas comme stagnation pour la suite ──
describe('236 — séance ajustée à la forme du jour : neutre pour la suite', () => {
  const Faits = require('../../v2/js/faits.js').creer();
  const fs = require('fs');
  const paris = (seance, date) => [
    { exercice: 'rowing', seance, date, predite: 10, observee: 8, charge: 93 },
    { exercice: 'rowing', seance, date, predite: 10, observee: 8, charge: 93 }
  ];
  const tous = paris('A', '2026-11-01T10:00:00Z').concat(paris('B', '2026-11-03T10:00:00Z'));

  test('deux séances ratées de suite : le compte est 2 ; la 2e ajustée à la forme, il retombe à 1', () => {
    expect(Faits.parisRatesALaSuite(tous, 'S').rowing.n).toBe(2);
    expect(Faits.parisRatesALaSuite(tous, 'S', ['B']).rowing.n).toBe(1);
  });
  test('les deux ajustées : plus aucun pari raté à la suite', () => {
    expect(Faits.parisRatesALaSuite(tous, 'S', ['A', 'B'])).toEqual({});
  });
  test('⚠️ DISCRIMINANT — l\'app lit le geste `forme_ajustee` dans les périodes allégées (le fil de la stagnation et des compteurs)', () => {
    const app = fs.readFileSync(require('path').join(__dirname, '../../v2/js/app.js'), 'utf8');
    const corps = app.slice(app.indexOf('function periodesAllegees()'), app.indexOf('function seancesAjusteesALaForme()'));
    expect(corps).toMatch(/seancesAjusteesALaForme\(\)/);
    expect(app).toMatch(/g\.geste === 'forme_ajustee'/);
  });
});
