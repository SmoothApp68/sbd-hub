/** @jest-environment node */
//
// 198 — LA BAISSE ATTENDUE EN SÈCHE (MOTEUR §9.34, I107, I108) : en sèche, sous 5 % de baisse, pas de carte mais une phrase descriptive ;
// au-delà, la carte habituelle. Aucune règle ne baisse le volume d'office.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

// ── LA MATIÈRE : six semaines actives, deux séances par semaine (mardi, vendredi), le lundi 2026-08-31 pour base ──
const BASE = Date.UTC(2026, 7, 31);
const jourN = (n) => new Date(BASE + n * 86400000).toISOString().slice(0, 10);
// Les séances de la semaine w : le mardi (w*7+1) et le vendredi (w*7+4).
const JOURS = [0, 1, 2, 3, 4, 5].reduce((l, w) => l.concat([jourN(w * 7 + 1), jourN(w * 7 + 4)]), []);
const J = jourN(6 * 7 + 1);                       // le mardi de la 7ᵉ semaine : la séance qui s'ouvre
const debuts = (jours) => jours.map((j) => j + 'T10:00:00+02:00');
const serie = (charge, reps, plus) => Object.assign({ charge_kg: charge, reps: reps, type_serie: 'travail' }, plus || {});
// Un exercice : `avant` = la charge de ses séances des 3 premières semaines, `apres` = celle des 3 dernières (6 séances en tout).
function exo(slug, avant, apres, plus) {
  const o = plus || {};
  const seances = JOURS.map((j, i) => ({ jour: j, series: [serie(i < 6 ? avant : apres, o.reps || 5, o.serie)] }));
  return Object.assign({ slug: slug, nom: o.nom || slug, seances: seances, douleurs: [], zones: [], blocs: [] }, o.champs || {});
}
const donnees = (exercices, plus) => Object.assign({ jour: J, seances: debuts(JOURS), periodesAllegees: [], exercices: exercices, pesees: [] }, plus || {});
// n exercices qui baissent de 10 %, m stables.
const lot = (n, m, pas) => {
  const l = [];
  for (let i = 0; i < n; i++) l.push(exo('bas' + i, 100, pas === undefined ? 90 : pas, { nom: ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff', 'Gg', 'Hh', 'Ii'][i % 9] + (i >= 9 ? 'x' : '') }));
  for (let i = 0; i < m; i++) l.push(exo('tient' + i, 100, 100, { nom: 'Tient' + 'abcdefghijklmnopqrstuvwxyz'.charAt(i % 26) }));
  return l;
};

const NOMS = { couche: 'Développé couché', squat: 'Squat', rowing: 'Rowing', curl: 'Curl' };
const C = (zone) => ({ etat: 'test_propose', zone: zone || 'hypertrophie', palier: 100, niveau: 8, n: 4,
  ligne: { charge: 100, vise: 8 }, haut: { charge: 105, vise: 6, k: 1 }, fondement: {} });
function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 'f' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  const series = opt.series || { couche: 4 };
  Object.keys(series).forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: series[slug] }); });
  if (opt.geste) se = opt.geste(se, id);
  const consignes = {};
  Object.keys(series).forEach((slug) => {
    const k = C();
    consignes[slug] = { consigne: k, libelles: M.libellesConsigne(k),
      compteur: { compteur: 1, meilleur: { palier: 100, niveau: 8 }, blocages: [] } };
  });
  const rout = {};
  Object.keys(series).forEach((slug) => { rout[slug] = series[slug]; });
  const e = { seance: { id: 'S1', debut: J + 'T10:00:00+02:00', edition: opt.edition === true, exercices: se.exercices },
    consignes: consignes, reglage: 'normal', paris: [], suites: {}, phase: opt.phase || 'recomposition',
    intention: opt.intention || null, priorites: opt.priorites || [],
    escalier: Object.assign({ cartes: opt.cartes || [], compteurs: [], noms: NOMS, seriesRoutine: rout,
      baisse: opt.baisse === undefined ? donnees(lot(5, 4), { pesees: [{ date: jourN(2), poids: 84.2 }, { date: jourN(30), poids: 82.6 }] }) : opt.baisse,
      serieDeMoins: { active: opt.moins === true }, prioritaires: opt.prioritaires || [] }, opt.escalier || {}) };
  return { e: e, p: T.planDeSeance(e) };
}


const NOMS_ = ['Couché', 'Squat', 'Rowing', 'Curl'];
// n exercices qui baissent d'un pourcentage donné (nommés), m stables.
const lotPct = (n, pct, m) => {
  const l = [];
  for (let i = 0; i < n; i++) l.push(exo('b' + i, 100, 100 - pct, { nom: NOMS_[i % 4] + (i >= 4 ? 'x' + i : '') }));
  for (let i = 0; i < (m || 0); i++) l.push(exo('t' + i, 100, 100, { nom: 'Tient' + i }));
  return l;
};
const seche = (pct, o) => decor(Object.assign({ phase: 'seche', baisse: donnees(lotPct(4, pct, 2)) }, o || {}));

describe('198 — la baisse attendue en sèche', () => {
  test('3 % en sèche : pas de carte, la phrase descriptive, « sèche » une seule fois, I107 tenu', () => {
    const { e, p } = seche(3);
    expect(p.carte).toBeNull();
    expect(p.baisseAttendue.titre).toBe('Tes séries baissent un peu');
    expect(p.baisseAttendue.phrase.replace(/[\u00a0\u202f]/g, ' ')).toBe('Couché, Curl, Rowing et Squat' + ' : −3 % en moyenne depuis 3 semaines. En sèche, une baisse jusqu’à 5 % est attendue : tu manges moins, pas encore de quoi alléger. Garde tes charges.'.replace(' : ', ' : '));
    expect((p.baisseAttendue.phrase.match(/sèche/g) || []).length).toBe(1);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('DISCRIMINANT — 8 % en sèche : la carte habituelle, pas la phrase', () => {
    const { e, p } = seche(8);
    expect(p.carte.source).toBe('baisse');
    expect(p.baisseAttendue).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('hors sèche, 3 % : ni carte ni phrase', () => {
    const { p } = decor({ phase: 'recomposition', baisse: donnees(lotPct(4, 3, 2)) });
    expect(p.carte).toBeNull(); expect(p.baisseAttendue).toBeNull();
  });
  test('1 % (bruit) ou trois exercices seulement : rien', () => {
    expect(seche(1).p.baisseAttendue).toBeNull();
    expect(decor({ phase: 'seche', baisse: donnees(lotPct(3, 3, 0)) }).p.baisseAttendue).toBeNull();
  });
  test('une semaine allégée ou une carte récente : pas de phrase', () => {
    expect(seche(3, { moins: true }).p.baisseAttendue).toBeNull();
    expect(seche(3, { cartes: [{ jour: jourN(6 * 7 - 3), seance: 'x', reponse: 'refusee' }] }).p.baisseAttendue).toBeNull();
  });
  test('aucun volume baissé d\'office : le plan garde toutes les séries en sèche', () => {
    const { p } = seche(3);
    expect(p.exercices[0].lignes.filter((l) => l.type === 'travail').length).toBe(4);
  });
  test('I107 et I108 voient une phrase hors sèche et une carte sous 5 %', () => {
    const { e, p } = seche(3);
    const faux = Object.assign({}, p, { phase: 'recomposition' });
    expect(T.verifierBaisseAttendue ? (() => { const r = []; T.verifierBaisseAttendue(faux, r); return r; })().some((x) => /^I107/.test(x)) : false).toBe(true);
    const r2 = []; T.verifierBaisseAttendue({ phase: 'seche', carte: { source: 'baisse', fait: { moyenne: 3 } } }, r2);
    expect(r2.some((x) => /^I108/.test(x))).toBe(true);
  });
});
