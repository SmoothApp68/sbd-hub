/** @jest-environment node */
//
// 27/11/2026 (MOTEUR §9.39 (6), §9.42 bis, I255) — le jour sans reste NEUTRE sous 3 reps (singles, doubles : la règle de bord, aucune zone). Avant ce correctif,
// `legerePasse` rendait false faute de zone : la séance légère votait comme une séance ordinaire et le coach repartait plus bas (bord_vague) au lieu du retour à la
// charge de travail. Diagnostic : DIAGNOSTIC-JOUR-SANS-SOUS-3.md. Témoin : 3 reps (une zone existe), inchangé.

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
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const sp = (t) => String(t == null ? '' : t).replace(/[\u00a0\u202f]/g, ' ');

const g = (kg, reps, t) => ({ charge_kg: kg, reps, type_serie: t || 'travail' });
const jour = (i) => new Date(Date.UTC(2026, 9, 1 + i * 4, 18)).toISOString();
const seance = (i, series) => ({ seance: { id: 'H' + i, debut: jour(i) }, series: series.map((s, j) => Object.assign({ id: 'h' + i + '_' + j, rang: j, rpe: null, ressenti: null, exercise_slug: 'squat' }, s)) });
const OPT = (reglage) => ({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage, edition: false, debutant: false });
const trois = (kg, reps, t) => [g(kg, reps, t), g(kg, reps, t), g(kg, reps, t)];
const R = (h, reglage) => {
  const avant = new Date(Date.parse(jour(h.length - 1)) + 4 * 864e5).toISOString();
  return M.consigneDExercice(h.map((s, i) => seance(i, s)), undefined, avant, OPT(reglage || 'normal'));
};
const K = (h, reglage) => R(h, reglage).consigne;
const ligne = (k) => (k.ligne ? [k.ligne.charge, k.ligne.vise] : null);
// P tenu 3 séances (P-5, P, P), zéro à P (la grosse série « manquée »).
const histoire = (P, reps) => [trois(P - 5, reps), trois(P, reps), trois(P, reps), trois(P, 0, 'echec')];

describe.each([['singles', 1, 180], ['doubles', 2, 180]])('%s', (_nom, reps, P) => {
  describe.each(['normal', 'franc', 'prudent'])('réglage %s', (reglage) => {
    const Z = () => histoire(P, reps);
    test('le zéro à P ouvre le jour sans : zero_rep sous P', () => {
      const k = K(Z(), reglage);
      expect(k.etat).toBe('zero_rep');
      expect(k.ligne.charge).toBeLessThan(P);
      expect(k.fondement.zeroRep.jourSans).toBeTruthy();
    });
    test('la légère réussie est neutre : retour_jour_sans à P et au niveau, sans ligne haute', () => {
      const h = Z(); const z = K(h, reglage);
      h.push(trois(z.ligne.charge, z.ligne.vise));
      const k = K(h, reglage);
      expect(k.etat).toBe('retour_jour_sans');
      expect(ligne(k)).toEqual([P, reps]);
      expect(k.haut).toBeNull();
    });
    test('puis le retour réussi : bord ordinaire, jamais bord_vague', () => {
      const h = Z(); const z = K(h, reglage);
      h.push(trois(z.ligne.charge, z.ligne.vise));
      const r = K(h, reglage); h.push(trois(r.ligne.charge, r.ligne.vise));
      const k = K(h, reglage);
      expect(k.etat).not.toBe('bord_vague');
      expect(k.ligne.charge).toBeGreaterThanOrEqual(P);
    });
  });

  test('la légère ignorée : refaire P réussi est une séance ordinaire, pas une vague', () => {
    const h = histoire(P, reps); h.push(trois(P, reps));
    expect(K(h).etat).not.toBe('bord_vague');
    expect(K(h).ligne.charge).toBeGreaterThanOrEqual(P);
  });
  test('le retour raté : bord_recul (un cran sous P), la vague ne passe pas avant', () => {
    const h = histoire(P, reps); const z = K(h);
    h.push(trois(z.ligne.charge, z.ligne.vise));
    h.push([g(P, 0, 'echec'), g(P, 0, 'echec'), g(P, 0, 'echec')].map((s) => Object.assign(s, { reps: Math.max(0, reps - 1) })));
    const k = K(h);
    expect(k.etat).not.toBe('bord_vague');
    expect(k.ligne.charge).toBeLessThan(P);
  });
});

describe('doubles — légère sous le niveau et légère à zéro', () => {
  test('légère à 1 rep (sous le niveau 2) : séance ordinaire, pas de retour_jour_sans', () => {
    const h = histoire(180, 2); const z = K(h);
    h.push(trois(z.ligne.charge, 1));
    expect(K(h).etat).not.toBe('retour_jour_sans');
  });
  test('légère à 0 : règle B (zero_rep, pas de retour)', () => {
    const h = histoire(180, 2); const z = K(h);
    h.push(trois(z.ligne.charge, 0, 'echec'));
    expect(K(h).etat).not.toBe('retour_jour_sans');
  });
});

describe('témoin — 3 reps (une zone existe), inchangé', () => {
  test('triples : retour_jour_sans 150 × 3', () => {
    const h = histoire(150, 3); const z = K(h);
    h.push(trois(z.ligne.charge, z.ligne.vise));
    const k = K(h);
    expect(k.etat).toBe('retour_jour_sans');
    expect(ligne(k)).toEqual([150, 3]);
  });
});

describe('le plan d\'un retour de bord : I255, I152, I162 (« je »), la phrase', () => {
  const planDe = (h) => {
    const c = R(h);
    let k = 0; const id = () => 'q' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'squat', id, { series: 3 });
    se.exercices[0].series.forEach((s) => { s.reps_visees = 2; });
    const avant = new Date(Date.parse(jour(h.length - 1)) + 4 * 864e5).toISOString();
    const e = { seance: { id: 'S', debut: avant, edition: false, exercices: se.exercices }, consignes: { squat: c }, paris: [], suites: {}, reglage: 'normal', objectif: 'force', debutant: false,
      catalogue: { squat: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] } } };
    const p = T.planDeSeance(e);
    return { p, e, x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs, phrases: T.verifierPhrases(p) };
  };
  test('doubles : retour_jour_sans, aucune erreur d\'invariant, phrase à la première personne', () => {
    const h = histoire(180, 2); const z = K(h);
    h.push(trois(z.ligne.charge, z.ligne.vise));
    const t = planDe(h);
    expect(t.x.consigne.etat).toBe('retour_jour_sans');
    expect(t.erreurs).toEqual([]);
    expect(t.phrases).toEqual([]);
    expect(sp(t.x.entete.gris)).toMatch(/^Je reviens à ta charge de travail : 180 kg × 2\.$/);
    expect(sp(t.x.pourquoi && t.x.pourquoi.etat)).toMatch(/je reviens à 180 kg × 2/);
  });
});
