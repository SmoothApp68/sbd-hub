/** @jest-environment node */
//
// 180 — LE COACH NE S'ENFERME PAS (28/10/2026, décision d'Aurélien ; MOTEUR §7.5, §9.1.2, §14.10, §9.26).
//
//   A  A-F-01 : sans charge répétée, une série légère APRÈS la plus lourde n'est pas une chauffe ; la règle de bord
//      (« moins de 3 reps ») ne s'ouvre que sur l'habitude des huit dernières séances, jamais sur une seule ;
//   B  D3 : le débutant (« moins d'un an ») n'est pas arrêté par la garde R < V ; le test R ≥ V + 2 est inchangé ;
//   C  D4 : au poids du corps, le compteur compte l'état `etirement_reps` ; à quatre séances sans progrès, la carte de
//      la marche d'en dessous (I70) ; la première fois, les reps de la routine.

process.env.TZ = 'Europe/Paris';
global.self = global;

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const P = require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const T = require('../../v2/js/plan.js');
const S = require('../../v2/js/seance.js');

const esp = (t) => String(t || '').replace(/[  ]/g, ' ');
const brute = (ch, r, type) => ({ id: 'x' + Math.random(), rang: 1, type_serie: type || 'travail', charge_kg: ch, reps: r, rpe: null,
  ressenti: null, exercise_slug: 'x', validee_a: '2026-10-01T10:00:00Z' });
const sr = (kg, r, role, ressenti) => ({ charge_kg: kg, reps: r, rpe: null, ressenti: ressenti === undefined ? null : ressenti, role: role });
const sea = (d, palier, ...series) => ({ debut: d, palier: palier, series: series });

describe('180 A — A-F-01 : la frontière de la chauffe, la règle de bord', () => {
  test('DISCRIMINANT — 7,5 kg × 1 puis 5 kg × 17 : la série légère n’est pas une chauffe, le palier est 5 kg', () => {
    const a = P.analyser([brute(7.5, 1), brute(5, 17), brute(5, 17)], null, { mesure: 'charge_reps' });
    expect(a.palier).toBe(5);
    expect(a.series.map((d) => d.role)).toEqual(['exploration', 'travail', 'travail']);
  });
  test('DISCRIMINANT — 4 kg × 9, 6 kg × 1, 4 kg × 5 : la charge répétée reste le palier, la tentative est une exploration (P08)', () => {
    const a = P.analyser([brute(4, 9), brute(6, 1), brute(4, 5)], null, { mesure: 'charge_reps' });
    expect(a.palier).toBe(4);
    expect(a.series.map((d) => d.role)).toEqual(['travail', 'exploration', 'travail']);
  });
  test('une vraie descente (100, 100, 90) reste une descente choisie', () => {
    const a = P.analyser([brute(100, 5), brute(100, 5), brute(90, 5)], null, { mesure: 'charge_reps' });
    expect(a.palier).toBe(100);
    expect(a.series[2].role).toBe('descente_choisie');
  });
  test('DISCRIMINANT — sans charge répétée, aucune série n’est une chauffe parce qu’elle suit la plus lourde : pas de palier de 7,5 kg × 1', () => {
    const a = P.analyser([brute(7.5, 1), brute(5, 17), brute(6, 12)], null, { mesure: 'charge_reps' });
    expect(a.series.map((d) => d.role)).toEqual(['travail', 'travail', 'travail']);
    expect(a.palier).toBeNull();
  });
  test('une montée de chauffe (20, 60, 100, 140) reste une chauffe', () => {
    const a = P.analyser([brute(20, 5), brute(60, 5), brute(100, 5), brute(140, 5)], null, { mesure: 'charge_reps' });
    expect(a.series[0].role).toBe('chauffe_probable');
    expect(a.series[1].role).toBe('chauffe_probable');
  });

  const days = Array.from({ length: 8 }, (_, i) => '2026-09-' + String(1 + i * 3).padStart(2, '0') + 'T18:00:00+00:00');
  const AV = '2026-09-25T10:00:00+00:00';
  const OPT = { reglage: 'franc', equipement: 'barre', correction: null, salle: null, mesure: 'charge_reps' };
  const trois = (reps) => (d) => sea(d, 50, sr(50, reps, 'palier'), sr(50, reps, 'palier'), sr(50, reps, 'palier'));
  test('DISCRIMINANT — UNE séance à 1 rep sur huit : pas de règle de bord, la zone reste', () => {
    const h = days.map((d, i) => (i === 7 ? trois(1)(d) : trois(8)(d)));
    const k = M.consignePour(h, AV, OPT);
    expect(k.etat).toBe('progression');
    expect(k.zone).toBe('hypertrophie');
  });
  test('l’habitude des huit dernières sous 3 reps : la règle de bord s’ouvre (le témoin du témoin)', () => {
    const h = days.map((d) => trois(1)(d));
    const k = M.consignePour(h, AV, OPT);
    expect(k.etat).toMatch(/^bord/);
    expect(k.zone).toBeNull();
  });
});

describe('180 B — D3 : la garde R < V ne retient pas le débutant', () => {
  const jours = ['2026-09-10', '2026-09-14', '2026-09-18', '2026-09-22'].map((d) => d + 'T18:00:00+00:00');
  const AV = '2026-09-25T10:00:00+00:00';
  const OPT = { reglage: 'normal', equipement: 'barre', correction: null, salle: null, mesure: 'charge_reps' };
  const histoire = (ressenti) => jours.map((d, i) => sea(d, 40, ...[0, 1, 2].map(() => sr(40, 12, 'palier', i === 3 ? ressenti : null))));
  test('DISCRIMINANT — « 0 en réserve » au haut de Volume : le non-débutant garde, le débutant a son test', () => {
    const sans = M.consignePour(histoire('reste_0'), AV, Object.assign({}, OPT, { debutant: false }));
    expect(sans.fondement.effortVise).toMatchObject({ effet: 'garde' });
    expect(sans.etat).toBe('progression');
    const deb = M.consignePour(histoire('reste_0'), AV, Object.assign({}, OPT, { debutant: true }));
    expect(deb.etat).toBe('test_propose');
    expect(deb.fondement.effortVise).toBeUndefined();
  });
  test('le test R ≥ V + 2 est inchangé pour le débutant', () => {
    [false, true].forEach((debutant) => {
      const k = M.consignePour(histoire('reste_3_plus'), AV, Object.assign({}, OPT, { debutant }));
      expect(k.etat).toBe('test_propose');
      expect(k.fondement.effortVise).toMatchObject({ effet: 'test', reserve: 3 });
    });
  });
  test('sans l’option, rien ne change (le défaut est le non-débutant)', () => {
    expect(M.consignePour(histoire('reste_0'), AV, OPT).fondement.effortVise).toMatchObject({ effet: 'garde' });
  });
});

describe('180 C — D4 : le poids du corps, le compteur et la marche d’en dessous', () => {
  const SLUG = 'tractions';
  const FIN = '2026-10-21T10:00:00+00:00';
  let n = 0;
  const bw = (reps) => ({ id: 'b' + (++n), rang: n, charge_kg: null, reps: reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: SLUG });
  const jours = ['09-16', '09-23', '09-30', '10-07', '10-14', '10-17'];
  const groupes = (k) => jours.slice(0, k).map((j, i) => ({ seance: { id: 'G' + i, debut: '2026-' + j + 'T18:00:00+00:00' }, series: [bw(2), bw(2), bw(2)] }));
  const OPTG = { mesure: 'reps', equipement: 'poids_du_corps', intention: 'progresser', reglage: 'franc', edition: false, salle: null };

  test('la première fois : les reps de la routine, « Poids du corps × 12 »', () => {
    const c = M.consigneDExercice([], undefined, FIN, Object.assign({}, OPTG, { depart: { charge: null, reps: 12, n: 3 } }));
    expect(c.consigne.etat).toBe('depart_routine');
    expect(c.consigne.ligne).toEqual({ charge: 0, vise: 12 });
  });
  test('une charge posée n’est pas du poids du corps : « Première fois ici » comme avant', () => {
    const c = M.consigneDExercice([], undefined, FIN, Object.assign({}, OPTG, { depart: { charge: 10, reps: 8, n: 3 } }));
    expect(c.consigne.etat).toBe('silence');
  });
  test('DISCRIMINANT — le compteur compte l’état `etirement_reps` (palier 0)', () => {
    const g = groupes(5);
    const k = M.consigneDExercice(g, undefined, FIN, OPTG);
    expect(k.consigne.etat).toBe('etirement_reps');
    expect(Number(k.consigne.palier)).toBe(0);
    const seances = jours.slice(0, 6).map((j) => sea('2026-' + j + 'T18:00:00+00:00', 0, sr(0, 2, 'palier'), sr(0, 2, 'palier'), sr(0, 2, 'palier')));
    const cpt = (k) => M.compteurDe(seances.slice(0, k), FIN, { reglage: 'franc', equipement: 'poids_du_corps', correction: null, toutes: true, mesure: 'reps' }).compteur;
    expect([cpt(1), cpt(2), cpt(3), cpt(5)]).toEqual([0, 0, 1, 3]);
  });

  function planDe(k, marches) {
    const g = groupes(5);
    const c = M.consigneDExercice(g, undefined, FIN, OPTG);
    c.compteur = { compteur: k, meilleur: { palier: 0, niveau: 2 }, blocages: [] };
    let q = 0;
    const id = () => 's' + (++q);
    const se = S.ajouterExercice(S.creer({ id: 'S1', userId: 'u', idSerie: id }), SLUG, id, { series: 3 });
    const e = {
      seance: { id: 'S1', debut: FIN, edition: false, exercices: se.exercices },
      consignes: { [SLUG]: c },
      catalogue: { [SLUG]: { equipement: 'poids_du_corps', nom: 'Tractions', muscles_primaires: ['dos'], muscles_secondaires: [],
        muscles_stabilisateurs: [], mesure: 'reps' } },
      reglage: 'franc', paris: [], suites: {}, phase: 'maintien', debutant: false,
      volume: { dos: { place: true, moyenne: 8, seuil: 10, fenetres: 12 } },
      escalier: { cartes: [], compteurs: [], noms: {}, seriesRoutine: { [SLUG]: 3 }, marches: marches || [], remplacants: {},
        dessous: { [SLUG]: { slug: 'tractions_assistees', nom: 'Tractions assistées' } } }
    };
    const p = T.planDeSeance(e);
    return { p, e, x: p.exercices[0] };
  }

  test('à 4 séances sans progrès : la carte de l’exercice du dessous, les invariants (I26, I70) tiennent', () => {
    const { p, e, x } = planDe(4);
    expect(x.escalier).toMatchObject({ marche: M.MARCHE_DESSOUS, compteur: 4, declenchement: true,
      dessous: { slug: 'tractions_assistees', nom: 'Tractions assistées' } });
    expect(x.escalier.carte.cible).toBe('tractions_assistees');
    expect(esp(x.escalier.carte.phrase)).toMatch(/^Poids du corps × 2 depuis 4 séances\.$/);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('à 0 et à 3 séances : pas de carte (le pas est 4)', () => {
    expect(planDe(3).x.escalier).toBeFalsy();
    expect(planDe(0).x.escalier).toBeFalsy();
  });
  test('I70 DISCRIMINANT — hors du poids du corps, avant le pas, sans exercice du dessous, une carte qui cible ailleurs', () => {
    const { p, e } = planDe(4);
    const forge = (f) => { const q = JSON.parse(JSON.stringify(p)); f(q.exercices[0]); return T.verifierPlan(q, e).erreurs.join('|'); };
    expect(forge((x) => { x.consigne.palier = 60; })).toMatch(/I70.*poids du corps/);
    expect(forge((x) => { x.escalier.compteur = 2; })).toMatch(/I70.*avant 4/);
    expect(forge((x) => { x.escalier.dessous = null; })).toMatch(/I70.*sans exercice du dessous/);
    expect(forge((x) => { x.escalier.carte.cible = 'autre'; })).toMatch(/I70.*cible/);
  });
});
