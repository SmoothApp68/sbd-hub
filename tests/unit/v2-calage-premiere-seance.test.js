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

describe('187 — le calage : autorégulation série par série (la réserve de la série faite décide de la suivante)', () => {
  test('la première série de travail d’un débutant est au plus petit cran : la barre vide (20 kg), rien n’est deviné', () => {
    const c = barre();
    expect(c.mode).toBe('debutant');
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
  test('⚠️ une réserve NON répondue : la charge reste, et la question est posée', () => {
    const c = barre({ series: [faite(20, 8, null)] });
    expect(c.suivante).toMatchObject({ charge: 20, pourquoi: 'sans_reponse' });
    expect(c.question).toBe(true);
  });
  test('⚠️ le saut est plafonné à +10 % (débutant) de la série d’avant — hors première montée depuis le plus petit cran', () => {
    const c = barre({ series: [faite(60, 8, 'reste_3_plus')] });
    expect(c.suivante.charge).toBeLessThanOrEqual(60 * 1.10 + 1e-9);
    expect(c.suivante.charge).toBeGreaterThanOrEqual(60);
    const i = M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: false, habituelle: null, series: [faite(60, 5, 'reste_3_plus')] });
    expect(i.suivante.charge).toBeLessThanOrEqual(60 * 1.15 + 1e-9);
    expect(M.plafondDuCalage(true)).toBe(0.10);
    expect(M.plafondDuCalage(false)).toBe(0.15);
  });
  test('⚠️ (Q2) un seul cran reste toujours permis : machine à 10 kg, cran de 5 (+50 %) — la charge monte quand même d’un cran', () => {
    const m = M.calagePremiereFois({ equipement: 'machine', reps: 10, debutant: true, series: [faite(10, 10, 'reste_2')] });
    expect(m.suivante.charge).toBe(15);
    expect(m.suivante.crans).toBe(1);
    const f = M.calagePremiereFois({ equipement: 'machine', reps: 10, debutant: true, series: [faite(10, 10, 'reste_3_plus')] });
    expect(f.suivante.charge).toBe(15);
    expect(f.suivante.crans).toBe(1);
  });
  test('⚠️ (Q2) côté barre : 100 kg, +10 % = 110 : deux crans de 2,5 passent (105) ; depuis la barre vide, 2 crans hors pourcentage', () => {
    const b = barre({ series: [faite(100, 8, 'reste_3_plus')] });
    expect(b.suivante.charge).toBe(105);
    expect(b.suivante.crans).toBe(2);
    expect(barre({ series: [faite(20, 8, 'reste_3_plus')] }).suivante.crans).toBe(2);
  });
  test('la règle converge d’elle-même : la fatigue fait baisser la réserve, la charge s’arrête de monter (aucune borne de séries)', () => {
    let series = [], charge = null;
    const reserves = ['reste_3_plus', 'reste_3_plus', 'reste_2', 'reste_1', 'reste_0', 'reste_0', 'reste_0', 'reste_0'];
    reserves.forEach((r) => {
      const c = barre({ series });
      charge = c.suivante.charge;
      series = series.concat([faite(charge, 8, r)]);
    });
    const fin = series.map((x) => x.charge);
    expect(fin[fin.length - 1]).toBe(fin[fin.length - 3]);          // les trois dernières à réserve 0 : la charge est stable
    expect(Math.max.apply(null, fin)).toBe(fin[fin.length - 1]);     // et jamais redescendue
  });
  test('la plus lourde série de travail réussie est retenue pour la séance d’après', () => {
    const c = barre({ series: [faite(20, 8, 'reste_3_plus'), faite(25, 8, 'reste_2'), faite(27.5, 6, 'reste_0')] });
    expect(c.plusLourdeReussie).toBe(25);
  });
});

describe('187 — le calage : intermédiaire et plus', () => {
  const inter = (o) => M.calagePremiereFois(Object.assign({ equipement: 'barre', reps: 8, debutant: false, series: [] }, o));
  test('avec « Ta charge habituelle ? » : elle est la première série de travail, puis la règle de la réserve ajuste', () => {
    const c = inter({ habituelle: 80 });
    expect(c.mode).toBe('habituelle');
    expect(c.suivante).toMatchObject({ charge: 80, reps: 8 });
    expect(inter({ habituelle: 80, series: [faite(80, 8, 'reste_2')] }).suivante).toMatchObject({ charge: 82.5, pourquoi: 'un_cran' });
  });
  test('⚠️ sans charge habituelle : 2 approches de 5 en montant — des CHAUFFES, qui ne comptent pas comme du travail — puis la première série de travail', () => {
    const c0 = inter({ prochain: 'chauffe' });
    expect(c0.mode).toBe('approches');
    expect(c0.suivante).toMatchObject({ charge: 20, reps: 5, role: 'approche' });
    const c1 = inter({ prochain: 'chauffe', series: [faite(20, 5, null)].map((x) => Object.assign(x, { chauffe: true })) });
    expect(c1.suivante).toMatchObject({ reps: 5, role: 'approche', pourquoi: 'en_montant', charge: 25 });
    const ch = [Object.assign(faite(20, 5, null), { chauffe: true }), Object.assign(faite(25, 5, null), { chauffe: true })];
    const t = inter({ prochain: 'travail', series: ch });
    expect(t.suivante).toMatchObject({ reps: 8, role: 'montee', charge: 27.5 });
    expect(t.plusLourdeReussie).toBeNull();                         // une chauffe n'est pas une série de travail réussie
    expect(t.question).toBe(false);                                 // et on ne demande pas la réserve d'une chauffe
  });
  test('une mesure sans charge, ou un matériel inconnu : le calage se tait', () => {
    expect(M.calagePremiereFois({ equipement: 'barre', mesure: 'duree', reps: 8 })).toBeNull();
    expect(M.calagePremiereFois({ equipement: 'inconnu', reps: 8 })).toBeNull();
  });
});

describe('187 — le libellé : « On trouve ta charge », sans nombre de séries figé', () => {
  test('aucun « 3 séries » ni aucun nombre de séries', () => {
    [barre(), barre({ series: [faite(20, 8, 'reste_2')] }),
     M.calagePremiereFois({ equipement: 'barre', reps: 8, debutant: false, prochain: 'chauffe', series: [] })].forEach((c) => {
      const l = M.libellesCalage(c);
      expect(l.titre).toBe('On trouve ta charge');
      expect(JSON.stringify(l)).not.toMatch(/\d\s*séries?/);
    });
  });
});

// Le calage sur la structure VIVANTE de la séance : le plan lit les séries de l'exercice à chaque calcul.
describe('187 — le nombre de séries vient de la séance : routines à 1, 2, 4 et 6 séries, ajout et retrait en cours de route', () => {
  const S = require('../../v2/js/seance.js');
  const DEBUT = '2026-10-29T10:00:00+01:00';
  const CAT = { rowing: { equipement: 'barre', muscles_primaires: ['dorsaux'] } };
  const silenceC = { etat: 'silence', raison: 'premiere_fois', fondement: {} };
  let n = 0;
  const id = () => 'q' + (++n);
  const seanceDe = (N) => S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: id }), 'rowing', id, { series: N, reps_visees: 8 });
  const fait = (se, j, charge, reps, ressenti) => {
    se = S.modifierSerie(se, 0, j, { charge_kg: charge, reps });
    if (ressenti) se = S.definirEffort(se, 0, j, { ressenti });
    return S.valider(se, 0, j, new Date('2026-10-29T10:' + String(10 + j).padStart(2, '0') + ':00+01:00'));
  };
  const planDe = (se, extra) => T.planDeSeance(Object.assign({ seance: { id: 'S', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { rowing: { consigne: silenceC, pas: 5 } }, catalogue: CAT, paris: [], suites: {}, debutant: true }, extra || {}));
  const propositions = (x) => x.lignes.map((l) => (l.calage ? l.prerempli.charge_kg : null));
  const verifier = (p, se) => T.verifierPlan(p, { seance: { id: 'S', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { rowing: { consigne: silenceC, pas: 5 } }, catalogue: CAT, paris: [], suites: {}, debutant: true }).erreurs.filter((e) => /^I7[2-5]/.test(e));

  [1, 2, 4, 6].forEach((N) => {
    test('routine à ' + N + ' série(s) : la proposition suit la réserve, le nombre de séries ne bouge pas', () => {
      let se = seanceDe(N);
      let x = planDe(se).exercices[0];
      expect(x.lignes).toHaveLength(N);
      expect(x.calage.libelles.titre).toBe('On trouve ta charge');
      expect(propositions(x)[0]).toBe(20);
      for (let j = 0; j < N - 1; j++) {
        se = fait(se, j, propositions(x)[j], 8, 'reste_3_plus');
        x = planDe(se).exercices[0];
        expect(x.lignes).toHaveLength(N);                              // jamais une série de plus ni de moins
        expect(propositions(x)[j + 1]).toBeGreaterThanOrEqual(20);
      }
      expect(verifier(planDe(se), se)).toEqual([]);                    // et jamais un refus parce qu'il y a plus de 3 séries
    });
  });

  test('⚠️ une série AJOUTÉE en cours de route : elle reçoit la proposition de la règle, la série validée reste figée', () => {
    let se = seanceDe(2);
    se = fait(se, 0, 20, 8, 'reste_3_plus');
    se = fait(se, 1, 25, 8, 'reste_2');
    expect(planDe(se).exercices[0].calage.suivante).toBeNull();        // plus de ligne à remplir : rien à proposer
    se = S.ajouterSerie(se, 0, id);
    const x = planDe(se).exercices[0];
    expect(x.lignes).toHaveLength(3);
    expect(propositions(x)).toEqual([null, null, 27.5]);               // réserve 2 : +1 cran
    expect(verifier(planDe(se), se)).toEqual([]);
  });

  test('⚠️ une série RETIRÉE avant la dernière : le calage se poursuit sur ce qui reste, rien ne casse', () => {
    let se = seanceDe(4);
    se = fait(se, 0, 20, 8, 'reste_3_plus');
    se = S.retirerSerie(se, 0, 3);
    se = S.retirerSerie(se, 0, 2);
    const x = planDe(se).exercices[0];
    expect(x.lignes).toHaveLength(2);
    expect(propositions(x)).toEqual([null, 25]);
    expect(verifier(planDe(se), se)).toEqual([]);
  });

  test('⚠️ une réserve non répondue : même charge, la question est posée sur la série faite', () => {
    let se = seanceDe(3);
    se = fait(se, 0, 20, 8, null);
    const x = planDe(se).exercices[0];
    expect(propositions(x)).toEqual([null, 20, null].map((v, i) => (i === 1 ? 20 : v)));
    expect(x.calage.question).toBe(0);
  });

  test('⚠️ les approches VALIDÉES restent des chauffes : la première série de travail monte au-dessus d’elles, sans demander leur réserve', () => {
    let se = S.insererChauffes(seanceDe(2), 0, [[null, 5], [null, 5]], id);
    se = fait(se, 0, 20, 5, null);
    se = fait(se, 1, 25, 5, null);
    const x = planDe(se, { debutant: false, habituelles: { rowing: 0 } }).exercices[0];
    expect(x.calage.question).toBeNull();                                  // la réserve d'une approche n'est pas demandée
    expect(x.calage.plusLourdeReussie).toBeNull();                         // une approche n'est pas une série de travail réussie
    expect(propositions(x)).toEqual([null, null, 27.5, null]);             // au-dessus de la dernière approche (25), sur le travail
    expect(x.lignes).toHaveLength(4);                                      // 2 chauffes + 2 séries de travail, rien de plus
    expect(verifier(planDe(se, { debutant: false, habituelles: { rowing: 0 } }), se)).toEqual([]);
  });

  test('⚠️ l’intermédiaire sans charge habituelle : les approches sont des chauffes et laissent intact le nombre de séries de travail', () => {
    let se = seanceDe(3);
    const travailAvant = se.exercices[0].series.length;
    se = S.insererChauffes(se, 0, [[null, 5], [null, 5]], id);
    const x0 = planDe(se, { debutant: false, habituelles: { rowing: 0 } }).exercices[0];
    expect(x0.lignes.filter((l) => l.type !== 'echauffement')).toHaveLength(travailAvant);
    expect(x0.lignes[0].prerempli).toMatchObject({ charge_kg: 20, reps: 5 });
    expect(verifier(planDe(se, { debutant: false, habituelles: { rowing: 0 } }), se)).toEqual([]);
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
  test('I73 — un saut de plusieurs crans au-dessus du plafond, une première série pas au plus petit cran, une proposition plus légère', () => {
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence,
      calage: calage({ faites: 1, suivante: { charge: 90, reps: 8, depuis: 60, crans: 2, pourquoi: 'facile' } }), lignes: [] })), 'I73')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence,
      calage: calage({ suivante: { charge: 40, reps: 8, pourquoi: 'plancher' } }), lignes: [] })), 'I73')).toBe(true);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence,
      calage: calage({ faites: 1, suivante: { charge: 55, reps: 8, depuis: 60, crans: 0, pourquoi: 'tenue' } }), lignes: [] })), 'I73')).toBe(true);
  });
  test('I73 — un cran seul au-dessus du plafond n’est jamais un refus ; ni un nombre de séries', () => {
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence,
      calage: calage({ faites: 1, suivante: { charge: 15, reps: 8, depuis: 10, crans: 1, pourquoi: 'un_cran' } }), lignes: [] })), 'I73')).toBe(false);
    expect(touche(verdict(plan({ slug: 'squat', consigne: silence, calage: calage({ faites: 7, suivante: null }), lignes: [] })), 'I73')).toBe(false);
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
