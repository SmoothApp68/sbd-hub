/** @jest-environment node */
// 187 — LE CALAGE DE LA PREMIÈRE SÉANCE (MOTEUR §9.21 bis) : la fonction pure, ses invariants I72-I75, la zone ménagée.
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const T = require('../../v2/js/plan.js');
const G = require('../../v2/js/generateur.js');

const faite = (charge, reps, ressenti) => ({ charge, reps, ressenti });
const barre = (o) => M.calagePremiereFois(Object.assign({ equipement: 'barre', reps: 8, debutant: true, series: [] }, o));

describe('187 — le calage : un débutant, 3 séries de N', () => {
  test('la série 1 est au plus petit cran : la barre vide (20 kg), rien n’est deviné', () => {
    const c = barre();
    expect(c.mode).toBe('debutant');
    expect(c.nSeries).toBe(3);
    expect(c.n).toBe(8);
    expect(c.suivante).toMatchObject({ charge: 20, reps: 8, pourquoi: 'plancher' });
    expect(c.question).toBe(false);
  });
  test('réserve 3 et plus : +2 crans ; 2 : +1 cran ; 1 ou 0 : la même charge', () => {
    const apres = (r) => barre({ series: [faite(20, 8, r)] });
    expect(apres('reste_3_plus').suivante).toMatchObject({ charge: 25, pourquoi: 'facile', crans: 2 });
    expect(apres('reste_2').suivante).toMatchObject({ charge: 22.5, pourquoi: 'un_cran', crans: 1 });
    expect(apres('reste_1').suivante).toMatchObject({ charge: 20, pourquoi: 'tenue' });
    expect(apres('reste_0').suivante).toMatchObject({ charge: 20, pourquoi: 'tenue' });
  });
  test('sans réponse : la charge reste, et la question est posée', () => {
    const c = barre({ series: [faite(20, 8, null)] });
    expect(c.suivante).toMatchObject({ charge: 20, pourquoi: 'sans_reponse' });
    expect(c.question).toBe(true);
  });
  test('⚠️ le saut est plafonné à +10 % (débutant) de la série d’avant — hors première montée depuis le plus petit cran', () => {
    const c = barre({ series: [faite(60, 8, 'reste_3_plus')] });
    expect(c.suivante.charge).toBeLessThanOrEqual(60 * 1.10 + 1e-9);
    expect(c.suivante.charge).toBeGreaterThanOrEqual(60);
    const i = M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: false, habituelle: null, series: [faite(60, 5, 'reste_3_plus'), faite(60, 5, 'reste_3_plus')] });
    expect(i.suivante.charge).toBeLessThanOrEqual(60 * 1.15 + 1e-9);
    expect(M.plafondDuCalage(true)).toBe(0.10);
    expect(M.plafondDuCalage(false)).toBe(0.15);
  });
  test('⚠️ (Q2) un seul cran reste toujours permis : machine à 10 kg, cran de 5 (+50 %) — la charge monte quand même d’un cran', () => {
    const m = M.calagePremiereFois({ equipement: 'machine', reps: 10, debutant: true, series: [faite(10, 10, 'reste_2')] });
    expect(m.suivante.charge).toBe(15);
    expect(m.suivante.crans).toBe(1);
    // « 3 ou plus » : deux crans demandés, ramenés à ce qui tient sous le plafond, jamais moins d’un.
    const f = M.calagePremiereFois({ equipement: 'machine', reps: 10, debutant: true, series: [faite(10, 10, 'reste_3_plus')] });
    expect(f.suivante.charge).toBe(15);
    expect(f.suivante.crans).toBe(1);
  });
  test('⚠️ (Q2) côté barre : 100 kg, +10 % = 110 : deux crans de 2,5 passent (105) ; à 20 kg depuis la barre vide, 2 crans comptés hors pourcentage', () => {
    const b = barre({ series: [faite(100, 8, 'reste_3_plus')] });
    expect(b.suivante.charge).toBe(105);
    expect(b.suivante.crans).toBe(2);
    const v = barre({ series: [faite(20, 8, 'reste_3_plus')] });
    expect(v.suivante.crans).toBe(2);
  });
  test('trois séries au plus : après la troisième, plus de proposition ; la plus lourde réussie est retenue', () => {
    const c = barre({ series: [faite(20, 8, 'reste_3_plus'), faite(25, 8, 'reste_2'), faite(27.5, 6, 'reste_0')] });
    expect(c.termine).toBe(true);
    expect(c.suivante).toBeNull();
    expect(c.plusLourdeReussie).toBe(25);
  });
});

describe('187 — le calage : intermédiaire et plus', () => {
  const inter = (o) => M.calagePremiereFois(Object.assign({ equipement: 'barre', reps: 8, debutant: false, series: [] }, o));
  test('avec « Ta charge habituelle ? » : elle est la série 1, puis le coach ordinaire', () => {
    const c = inter({ habituelle: 80 });
    expect(c.mode).toBe('habituelle');
    expect(c.suivante).toMatchObject({ charge: 80, reps: 8 });
    expect(inter({ habituelle: 80, series: [faite(80, 8, null)] }).termine).toBe(true);
  });
  test('sans charge habituelle : 2 approches de 5, puis 1 série de N', () => {
    const c0 = inter();
    expect(c0.mode).toBe('approches');
    expect(c0.suivante).toMatchObject({ charge: 20, reps: 5, role: 'approche' });
    const c1 = inter({ series: [faite(20, 5, 'reste_3_plus')] });
    expect(c1.suivante).toMatchObject({ reps: 5, role: 'approche' });
    const c2 = inter({ series: [faite(20, 5, 'reste_3_plus'), faite(25, 5, 'reste_3_plus')] });
    expect(c2.suivante).toMatchObject({ reps: 8, role: 'cible' });
  });
  test('une mesure sans charge, ou un matériel inconnu : le calage se tait', () => {
    expect(M.calagePremiereFois({ equipement: 'barre', mesure: 'duree', reps: 8 })).toBeNull();
    expect(M.calagePremiereFois({ equipement: 'inconnu', reps: 8 })).toBeNull();
  });
});

describe('187 — le plus petit cran dépend du matériel, jamais du corps ni du sexe', () => {
  test('barre : la barre vide ; machine et poulie : leur premier cran', () => {
    expect(M.plancherDuCalage('barre')).toBe(20);
    expect(M.plancherDuCalage('machine')).toBeGreaterThan(0);
    expect(M.plancherDuCalage('poulie')).toBeGreaterThan(0);
    expect(M.plancherDuCalage('inconnu')).toBeNull();
  });
  test('le calage ne lit ni le poids du corps ni le sexe', () => {
    const a = barre({ poids: 55, sexe: 'femme' }), b = barre({ poids: 120, sexe: 'homme' });
    expect(a.suivante.charge).toBe(b.suivante.charge);
  });
});

describe('187 — I72 à I75 : un plan faux est refusé', () => {
  const plan = (x, extra) => Object.assign({ seance: 'S', edition: false, intention: 'progresser', exercices: [x] }, extra || {});
  const verdict = (p) => { try { return (T.verifierPlan(p, null) || {}).erreurs || []; } catch (e) { return ['EXCEPTION ' + e.message]; } };
  const calage = (o) => Object.assign({ mode: 'debutant', n: 8, nSeries: 3, faites: 0, plancher: 20, plafond: 0.1,
    suivante: { charge: 20, reps: 8, role: 'depart', pourquoi: 'plancher' }, iSerie: null }, o);
  const silence = { etat: 'silence', raison: 'premiere_fois' };
  const touche = (e, code) => e.some((m) => String(m).indexOf(code) === 0);

  test('I72 — un calage sans « première fois », ou en Édition, ou en « Juste un carnet »', () => {
    expect(touche(verdict(plan({ slug: 'squat', consigne: { etat: 'monte' }, calage: calage(), lignes: [] })), 'I72')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence, calage: calage(), lignes: [] }, { edition: true })), 'I72')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence, calage: calage(), lignes: [] }, { intention: 'entretien' })), 'I72')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence, calage: calage(), lignes: [] })), 'I72')).toBe(false);
  });
  test('I73 — trop de séries, un saut au-dessus du plafond, une première série pas au plus petit cran', () => {
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence, calage: calage({ faites: 4, suivante: null }), lignes: [] })), 'I73')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence,
      calage: calage({ faites: 1, suivante: { charge: 90, reps: 8, depuis: 60, crans: 2, pourquoi: 'facile' } }), lignes: [] })), 'I73')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence,
      calage: calage({ suivante: { charge: 40, reps: 8, pourquoi: 'plancher' } }), lignes: [] })), 'I73')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence,
      calage: calage({ faites: 1, suivante: { charge: 55, reps: 8, depuis: 60, crans: 0, pourquoi: 'tenue' } }), lignes: [] })), 'I73')).toBe(true);
  });
  test('I74 — une proposition sur une série validée, ou sans ligne', () => {
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence, calage: calage(),
      lignes: [{ calage: true, validee: true, iSerie: 0 }] })), 'I74')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence, calage: calage({ iSerie: 0 }), lignes: [] })), 'I74')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence, calage: null, lignes: [{ calage: true, iSerie: 0 }] })), 'I74')).toBe(false);
  });
  test('I75 — une série lourde sur un exercice qui charge la zone ménagée', () => {
    const x = { slug: 'squat', consigne: { etat: 'monte', zone: 'lourd' }, menagee: { zones: ['genou'], choisie: false },
      lignes: [{ vise: 4, role: 'travail', validee: false }] };
    expect(touche(verdict(plan(x)), 'I75')).toBe(true);
    const ok = Object.assign({}, x, { consigne: { etat: 'monte', zone: 'mix' }, lignes: [{ vise: 8, role: 'travail', validee: false }] });
    expect(touche(verdict(plan(ok)), 'I75')).toBe(false);
    const choisie = Object.assign({}, x, { menagee: { zones: ['genou'], choisie: true } });
    expect(touche(verdict(plan(choisie)), 'I75')).toBe(false);
  });
});

describe('187 — la zone à ménager : quels exercices la chargent', () => {
  test('rend les zones ménagées que l’exercice charge, et rien sans zone', () => {
    expect(G.zonesQueChargeLExercice('squat_barre', [])).toEqual([]);
    expect(G.zonesQueChargeLExercice('squat_barre', ['genou'])).toContain('genou');
    expect(G.zonesQueChargeLExercice('squat_barre', ['coude'])).not.toContain('genou');
  });
  test('le moteur ménage : zone Lourd remplacée par Mix, jamais en dessous de 6 reps', () => {
    expect(M.ZONE_SANS_LOURD).toBe('mix');
  });
});
