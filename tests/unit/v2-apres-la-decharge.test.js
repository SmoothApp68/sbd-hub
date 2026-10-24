/** @jest-environment node */
//
// 165 — APRÈS UNE DÉCHARGE, le coach reprend sur la dernière séance NORMALE (MOTEUR §9.22, §14.4, §9.26).
// Décisions d'Aurélien, 24/10/2026. Une séance allégée (décharge planifiée ou semaine allégée acceptée) ne sert
// jamais de référence : consigne, palier, niveau validé, effort visé. Ses séries restent dans l'historique.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

// Lundis : 5, 12, 19 oct. (normales), 26 oct. (décharge), 2 nov. (la reprise).
const jour = (m, d) => new Date(Date.UTC(2026, m - 1, d, 17)).toISOString();
const groupe = (id, debut, reps, extra) => ({
  seance: { id: id, debut: debut },
  series: reps.map((r, j) => Object.assign({ id: id + '-' + j, charge_kg: 80, reps: r, rpe: null, ressenti: null,
    type_serie: 'travail', validee_a: debut }, extra || {}))
});
const NORMALES = [
  groupe('A', jour(10, 5), [8, 8, 8, 8]), groupe('B', jour(10, 12), [8, 8, 8, 8]), groupe('C', jour(10, 19), [8, 8, 8, 8])
];
const DECHARGE = groupe('D', jour(10, 26), [6, 6]);
const AVANT = jour(11, 2);
const BASE = { mesure: 'charge_reps', reglage: 'normal', equipement: 'barre', intention: 'progresser' };
const PERIODE = [{ debut: '2026-10-26', fin: '2026-11-01' }];
const consigne = (groupes, plus) => M.consigneDExercice(groupes, null, AVANT, Object.assign({}, BASE, plus || {})).consigne;

describe('165 — la reprise après la décharge', () => {
  test('DISCRIMINANT — sans la période, la décharge sert de référence (le défaut mesuré)', () => {
    const k = consigne(NORMALES.concat([DECHARGE]));
    expect(k.n).toBe(2);
  });

  test('80 × 8 × 4, puis une décharge 80 × 6 × 2 : le lundi d’après repart de 80 × 8, sur 4 séries', () => {
    const avec = consigne(NORMALES.concat([DECHARGE]), { periodesAllegees: PERIODE });
    const sans = consigne(NORMALES);
    expect(avec).toEqual(sans);
    expect(avec.n).toBe(4);
    expect(avec.ligne.charge).toBe(80);
  });

  test('une semaine allégée acceptée : même reprise', () => {
    const allegee = groupe('E', jour(10, 26), [6, 6]);
    expect(consigne(NORMALES.concat([allegee]), { periodesAllegees: [{ debut: '2026-10-25', fin: '2026-10-31' }] }))
      .toEqual(consigne(NORMALES));
  });

  test('« 3 et + » noté pendant la décharge : jamais compté, aucun test ensuite', () => {
    const facile = groupe('D', jour(10, 26), [6, 6], { rpe: 5, ressenti: null });
    facile.series.forEach((s) => { s.reserve = 3; });
    const k = consigne(NORMALES.concat([facile]), { periodesAllegees: PERIODE, reglage: 'franc' });
    expect(k.fondement && k.fondement.effortVise).toBeFalsy();
    expect(k.etat).not.toBe('test_propose_par_la_reserve');
    expect(k).toEqual(consigne(NORMALES, { reglage: 'franc' }));
  });

  test('les séries de la décharge restent dans les faits : la séance reste une présence', () => {
    const r = M.consigneDExercice(NORMALES.concat([DECHARGE]), null, AVANT, Object.assign({ periodesAllegees: PERIODE }, BASE));
    expect(r.consigne.etat).not.toBe('silence');
  });
});

// ── LE PLAN : pendant la décharge, ni « garde-en » ni question ; la feuille dit « Décharge » ────────────────
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const esp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');
const BLOC = { id: 'b1', dossier: 'Force', zone: 'lourd', debut: '2026-10-12', semaines: 4, decharge: true,
  statut: 'en_cours', exercices: ['couche'], precedent: null };
const K = { etat: 'progression', zone: 'lourd', palier: 125, niveau: 5, n: 4, ligne: { charge: 125, vise: 5 }, haut: null,
  fondement: { date: '2026-10-26T17:00:00.000Z', reps: [5, 5, 5, 5] } };
function decor(debut, extra) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 4 });
  const e = Object.assign({ seance: { id: 'S1', debut: debut, edition: false, exercices: se.exercices },
    consignes: { couche: { consigne: K, libelles: M.libellesConsigne(K), compteur: { compteur: 0, meilleur: null, blocages: [] }, repli: null } },
    reglage: 'franc', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: [], compteurs: [], noms: { couche: 'Développé Couché (Barre)' }, seriesRoutine: { couche: 4 }, marches: [] },
    programme: { blocs: [BLOC], lignes: [] } }, extra || {});
  return { e, p: T.planDeSeance(e) };
}

describe('165 — pendant la décharge, le coach ne demande pas l’effort', () => {
  test('DISCRIMINANT — le même exercice, la semaine d’avant : une réserve visée ; en décharge : aucune', () => {
    const normal = decor('2026-10-28T10:00:00+00:00').p.exercices[0];
    expect(normal.reserveVisee).not.toBeNull();
    const d = decor('2026-11-03T10:00:00+00:00');
    const x = d.p.exercices[0];
    expect(x.consigne.allegee.decharge).toBe(true);
    expect(x.reserveVisee).toBeNull();
    expect(x.effortVise).toBeNull();
    expect(x.questionReserve).toBeNull();
    expect(T.verifierPlan(d.p, d.e).erreurs).toEqual([]);
  });

  test('la feuille « Pourquoi » dit « Décharge », avec sa semaine', () => {
    const x = decor('2026-11-03T10:00:00+00:00').p.exercices[0];
    expect(esp(x.pourquoi.etat)).toBe('Décharge, semaine 4 sur 4 : mêmes charges, moins de séries, loin de l’échec. ' +
      'Rien ne monte. 2 séries au lieu de 4, cette semaine.');
  });

  test('une semaine allégée acceptée garde « Semaine allégée »', () => {
    const a = M.consigneAllegee(K, 4);
    expect(esp(M.pourquoiConsigne(a, 'normal', '2026-11-03T10:00:00+00:00').etat)).toMatch(/^Semaine allégée : /);
  });

  test('I59 forgé — un effort visé sur une consigne allégée', () => {
    const d = decor('2026-11-03T10:00:00+00:00');
    const f = JSON.parse(JSON.stringify(d.p));
    f.exercices[0].effortVise = { visee: 2, serie: 3, reponse: null, demande: true, effet: null, phrase: null };
    f.exercices[0].reserveVisee = 2;
    expect(T.verifierPlan(f, d.e).erreurs.filter((x) => /^I59/.test(x)).length).toBeGreaterThan(0);
  });

  test('I60 forgé — une consigne qui cite une séance de la décharge comme référence', () => {
    const d = decor('2026-11-03T10:00:00+00:00', { periodesAllegees: [{ debut: '2026-10-26', fin: '2026-11-01' }] });
    expect(T.verifierPlan(d.p, d.e).erreurs.filter((x) => /^I60/.test(x)).length).toBe(1);
    const ok = decor('2026-11-03T10:00:00+00:00', { periodesAllegees: [{ debut: '2026-11-02', fin: '2026-11-08' }] });
    expect(T.verifierPlan(ok.p, ok.e).erreurs.filter((x) => /^I60/.test(x))).toEqual([]);
  });
});
