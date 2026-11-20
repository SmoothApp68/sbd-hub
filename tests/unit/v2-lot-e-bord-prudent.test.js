/** @jest-environment node */
//
// Lot E « revue des règles », A2 (20/11/2026, MOTEUR §9.1.2 et §9.8, I240) — LA RÈGLE DE BORD EN PRUDENT : sous 3 reps, deux séances de suite au
// même palier avant de monter (comme les zones, §9.8). La garde de confirmation dit « Je garde 140 kg une séance de plus avant de monter. » (« je »,
// jamais « on ») ; elle est NEUTRE pour les cinq champs du compteur (comme la tenue après un zéro) ; la garde « une seule séance » (`lues === 1`)
// vaut confirmation. Normal et Franc : inchangés.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');

let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' });
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'prudent', edition: false };
const jourN = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const groupes = (seances) => seances.map((s, i) => ({ seance: { id: 'H' + i, debut: jourN(i) }, series: s.map(([kg, r]) => brute(kg, r)) }));
const r = (seances, options) => M.consigneDExercice(groupes(seances), undefined,
  new Date(Date.parse(jourN(seances.length - 1)) + 3 * 864e5).toISOString(), Object.assign({}, OPTIONS, options || {})).consigne;
const trois = (kg, rep) => [[kg, rep], [kg, rep], [kg, rep]];
const sp = (t) => String(t).replace(/[  ]/g, ' ');

describe('A2 — Prudent : deux séances au même palier', () => {
  test('témoin Normal — 137,5 × 2 puis 140 × 2 : la montée tout de suite (142,5)', () => {
    const k = r([trois(137.5, 2), trois(140, 2)], { reglage: 'normal' });
    expect(k.etat).toBe('bord');
    expect(k.ligne).toMatchObject({ charge: 142.5, vise: 2 });
  });
  test('témoin Franc — inchangé', () => {
    expect(r([trois(137.5, 2), trois(140, 2)], { reglage: 'franc' }).etat).toBe('bord');
  });
  test('⚠️ DISCRIMINANT — Prudent, 137,5 × 2 puis 140 × 2 : je garde 140 kg une séance de plus', () => {
    const k = r([trois(137.5, 2), trois(140, 2)]);
    expect(k.etat).toBe('bord_garde');
    expect(k.ligne).toEqual({ charge: 140, vise: 2 });
    expect(k.fondement.bord).toEqual({ charge: 140, reps: 2, confirmation: true });
    expect(sp(M.libellesConsigne(k).gris)).toBe('140 kg × 2, toutes les reps. Je garde 140 kg une séance de plus avant de monter.');
    const pq = sp(M.pourquoiConsigne(k, 'prudent').etat);
    expect(pq).toMatch(/Réglage « Me ménager » : sous 3 reps, je monte après deux séances de suite à la même charge\.$/);
    expect(pq).not.toMatch(/\bon\b/);
  });
  test('Prudent, la séance de confirmation faite : la montée (142,5)', () => {
    const k = r([trois(137.5, 2), trois(140, 2), trois(140, 2)]);
    expect(k.etat).toBe('bord');
    expect(k.ligne).toMatchObject({ charge: 142.5, vise: 2 });
  });
  test('la garde « une seule séance » vaut confirmation : garde (unique) puis la montée, jamais trois séances au premier palier', () => {
    expect(r([trois(140, 1)]).fondement.bord.unique).toBe(true);
    const k = r([trois(140, 1), trois(140, 1)]);
    expect(k.etat).toBe('bord');
    expect(k.ligne).toMatchObject({ charge: 142.5 });
  });
  test('⚠️ DISCRIMINANT — la confirmation est neutre pour les CINQ champs du compteur', () => {
    const avant = r([trois(137.5, 2), trois(140, 2)])._bord;
    const apres = r([trois(137.5, 2), trois(140, 2), trois(140, 2)])._bord;
    ['sans', 'total', 'aRecule', 'record', 'depuisRecord'].forEach((c) => expect(apres[c]).toEqual(avant[c]));
  });
  test('un rythme Prudent régulier (monter une séance sur deux) n’atteint jamais la vague', () => {
    const s = [trois(130, 2)];
    let kg = 130;
    for (let i = 0; i < 8; i++) {
      const k = r(s);
      expect(k.etat).not.toBe('bord_vague');
      if (k.etat === 'bord') kg = k.ligne.charge;
      s.push(trois(kg, 2));
    }
    expect(kg).toBeGreaterThan(130);
  });
  test('une barre ratée fait toujours reculer, en Prudent aussi', () => {
    const k = r([trois(137.5, 2), trois(140, 2), [[140, 2], [140, 1], [140, 1]]]);
    expect(k.etat).toBe('bord_recul');
  });
});

describe('I240 — le plan relit la règle', () => {
  const S = require('../../v2/js/seance.js');
  const T = require('../../v2/js/plan.js');
  function plan(liste, reglage) {
    let k = 0;
    const id = () => 'q-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'dc', id, { series: 3 });
    se.exercices[0].series.forEach((s) => { s.reps_visees = 2; });
    const avant = new Date(Date.parse(jourN(liste.length - 1)) + 3 * 864e5).toISOString();
    const c = M.consigneDExercice(groupes(liste), undefined, avant, Object.assign({}, OPTIONS, { reglage }));
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices }, consignes: { dc: c }, paris: [], suites: {}, reglage,
      objectif: 'force', catalogue: { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5,
        muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } } };
    const p = T.planDeSeance(e);
    return { p, e, x: p.exercices[0] };
  }
  const i239 = (p, e) => T.verifierPlan(p, e).erreurs.filter((m) => /^I240/.test(m));
  test('les plans vrais (garde de confirmation, montée confirmée) sont propres', () => {
    const a = plan([trois(137.5, 2), trois(140, 2)], 'prudent');
    expect(a.x.consigne.etat).toBe('bord_garde');
    expect(T.verifierPlan(a.p, a.e).erreurs).toEqual([]);
    const b = plan([trois(137.5, 2), trois(140, 2), trois(140, 2)], 'prudent');
    expect(b.x.consigne.etat).toBe('bord');
    expect(T.verifierPlan(b.p, b.e).erreurs).toEqual([]);
  });
  test('forgé — une montée sans séance d’avant au même palier, une garde de confirmation en Normal', () => {
    const b = plan([trois(137.5, 2), trois(140, 2), trois(140, 2)], 'prudent');
    const k = Object.assign({}, b.x.consigne);
    Object.defineProperty(k, '_lues', { value: 3, enumerable: false });
    Object.defineProperty(k, '_confirmee', { value: { palier: 137.5, etat: 'bord' }, enumerable: false });
    b.p.exercices[0].consigne = k;
    expect(i239(b.p, b.e).length).toBe(1);
    const a = plan([trois(137.5, 2), trois(140, 2)], 'prudent');
    a.p.reglage = 'normal';
    expect(i239(a.p, a.e).length).toBe(1);
  });
});
