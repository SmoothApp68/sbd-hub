/** @jest-environment node */
//
// Chantier « première séance sûre », PR 3 (B5-03, MOTEUR §9.42.4) — LE CALAGE CONNAÎT LA CHARGE RESTÉE À 0 REP : la « suivante » ne la reprend
// ni ne la dépasse (I153) ; au cran du matériel juste sous elle, ou le calage se tait ; la phrase est vraie par rapport au chiffre ;
// I73 admet une proposition plus légère que la série d'avant quand elle est bornée (et en garde la raison).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const sp = (t) => String(t).replace(/[  ]/g, ' ');
const ch = (charge, reps) => ({ charge, reps: reps === undefined ? 5 : reps, ressenti: null, chauffe: true });
const tr = (charge, reps, ressenti) => ({ charge, reps, ressenti: ressenti || null, chauffe: false });
const cal = (o) => M.calagePremiereFois(Object.assign({ equipement: 'barre', reps: 8, debutant: false, habituelle: null, prochain: 'travail', series: [] }, o));

describe('calagePremiereFois — la borne (module pur)', () => {
  test('B5-03 : chauffes 20 et 25, borne 27,5 → la suivante est 25 (jamais 27,5), bornée, la phrase dit le fait', () => {
    const r = cal({ series: [ch(20), ch(25)], borne: 27.5 });
    expect(r.suivante).toMatchObject({ charge: 25, pourquoi: 'borne', bornee: true, borne: 27.5, reps: 8 });
    expect(sp(M.libellesCalage(r).pourquoi)).toBe('27,5 kg est resté à 0 rep : je propose 25 kg.');
  });
  test('borne 25 → 22,5 ; borne 22,5 → 20 (la barre vide, le plus petit cran) ; borne 20 → le calage se tait', () => {
    expect(cal({ series: [ch(20), ch(25)], borne: 25 }).suivante).toMatchObject({ charge: 22.5, bornee: true });
    expect(cal({ series: [ch(20), ch(25)], borne: 22.5 }).suivante).toMatchObject({ charge: 20, bornee: true });
    const nul = cal({ series: [ch(20), ch(25)], borne: 20 });
    expect(nul.suivante).toBeNull();
    expect(M.libellesCalage(nul).pourquoi).toBeNull();
  });
  test('la première série (aucune faite) : borne au plancher ou sous lui → rien ; borne au-dessus → le plancher, intact', () => {
    expect(cal({ borne: 20 }).suivante).toBeNull();
    expect(cal({ borne: 27.5 }).suivante).toMatchObject({ charge: 20, pourquoi: 'plancher' });
    expect(cal({ borne: 27.5 }).suivante.bornee).toBeUndefined();
  });
  test('une approche (chauffe) sous la borne n\'est pas touchée', () => {
    const r = cal({ series: [ch(20)], prochain: 'chauffe', borne: 27.5 });
    expect(r.suivante).toMatchObject({ charge: 25, role: 'approche', pourquoi: 'en_montant' });
    expect(r.suivante.bornee).toBeUndefined();
  });
  test('SANS borne, la sortie est identique octet pour octet', () => {
    [[], [ch(20)], [ch(20), ch(25)], [tr(20, 8, 'reste_3_plus')], [tr(30, 8, 'reste_2')], [tr(30, 8, 'reste_0')], [tr(30, 8)]].forEach((series) => {
      const a = cal({ series }), b = cal({ series, borne: null }), c = cal({ series, borne: undefined });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(JSON.stringify(c)).toBe(JSON.stringify(a));
      expect(JSON.stringify(M.libellesCalage(b))).toBe(JSON.stringify(M.libellesCalage(a)));
    });
  });
  test('une borne plus haute que la suivante ne change rien (la progression normale)', () => {
    const a = cal({ series: [ch(20), ch(25)] });
    expect(JSON.stringify(cal({ series: [ch(20), ch(25)], borne: 40 }))).toBe(JSON.stringify(a));
  });
  test('BLOQUANT 2 — une série de travail de CETTE séance à 0 rep : jamais « je garde cette charge », jamais la même charge', () => {
    ['reste_0', null, 'reste_1', 'reste_3_plus'].forEach((ressenti) => {
      const r = cal({ series: [ch(20), ch(25), tr(30, 0, ressenti)] });
      expect(r.suivante.charge).toBeLessThan(30);
      expect(r.suivante).toMatchObject({ pourquoi: 'borne', bornee: true, borne: 30 });
      const dit = sp(M.libellesCalage(r).pourquoi);
      expect(dit).toBe('30 kg est resté à 0 rep : je propose 27,5 kg.');
      expect(dit).not.toMatch(/je garde cette charge/);
    });
  });
  test('un zéro de la séance et une borne de la séance d\'avant : la plus légère gagne', () => {
    const r = cal({ series: [ch(20), tr(30, 0)], borne: 25 });
    expect(r.suivante).toMatchObject({ charge: 22.5, borne: 25 });
  });
  test('un 0 rep sur une chauffe n\'est pas une borne ; une série de travail à reps vides non plus', () => {
    expect(cal({ series: [ch(20, 0), ch(25, 5)] }).suivante.pourquoi).toBe('en_montant');
    expect(cal({ series: [tr(30, null)] }).suivante.bornee).toBeUndefined();
  });
  test('la salle déclarée : le cran est celui de la salle (jamais un pas recopié)', () => {
    const salle = { materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] };
    expect(cal({ equipement: 'barre', salle, series: [ch(15), ch(20)], borne: 25 }).suivante).toMatchObject({ charge: 20, bornee: true });
    expect(cal({ equipement: 'barre', salle, series: [ch(15)], borne: 10 }).suivante).toBeNull();
  });
  test('un matériel au pas de 5 (machine) : 25 → 20 ; au plus petit cran → rien', () => {
    const r = M.calagePremiereFois({ equipement: 'machine', reps: 10, debutant: false, series: [tr(25, 0)] });
    expect(r.suivante.charge).toBeLessThan(25);
    expect(M.calagePremiereFois({ equipement: 'machine', reps: 10, debutant: false, series: [], borne: 5 }).suivante).toBeNull();
  });
});

describe('le plan — la première séance toute à zéro : I153 tient pendant le calage (novice et 68 ans)', () => {
  const DEBUT = '2026-11-12T10:00:00+01:00';
  const CAT = { dc: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: [], muscles_stabilisateurs: [] } };
  let n = 0;
  const id = () => 'q' + (++n);
  const brute = (kg, reps) => ({ id: 'h' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'dc' });
  const histoire = (kg) => [{ seance: { id: 'H0', debut: '2026-11-09T18:00:00.000Z' }, series: [brute(kg, 0), brute(kg, 0), brute(kg, 0)] }];
  const consigne = (kg, debutant) => M.consigneDExercice(histoire(kg), undefined, DEBUT, { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant });
  const fait = (se, j, charge, reps, ressenti) => {
    se = S.modifierSerie(se, 0, j, { charge_kg: charge, reps });
    if (ressenti) se = S.definirEffort(se, 0, j, { ressenti });
    return S.valider(se, 0, j, new Date('2026-11-12T10:' + String(10 + j).padStart(2, '0') + ':00+01:00'));
  };
  const entrees = (se, c, extra) => Object.assign({ seance: { id: 'S', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: { dc: c }, catalogue: CAT, paris: [], suites: {}, reglage: 'normal', objectif: 'muscle', habituelles: { dc: 0 } }, extra || {});
  const seanceApresChauffes = (travail) => {
    let se = S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: id }), 'dc', id, { series: travail, reps_visees: 8 });
    se = S.insererChauffes(se, 0, [[null, 5], [null, 5]], id);
    se = fait(se, 0, 20, 5, null);
    return fait(se, 1, 25, 5, null);
  };
  const SILENCE = { consigne: { etat: 'silence', raison: 'premiere_fois', fondement: {} }, pas: 5 };
  const porteuse = (x) => x.lignes.filter((l) => l.calage)[0];

  [['novice', true, undefined], ['68 ans', false, { plus65: true }]].forEach(([nom, debutant, extra]) => {
    test(nom + ' — chauffes 20 et 25 après 27,5 × 0, 0, 0 : la ligne proposée est 25, jamais 27,5 ; I153 et I72-I75 muets', () => {
      const c = consigne(27.5, debutant);
      expect(c.consigne.etat).toBe('silence'); expect(c.consigne.raison).toBe('premiere_fois');
      expect(c.consigne.fondement.zeroRep.charge).toBe(27.5);
      const se = seanceApresChauffes(3);
      const e = entrees(se, c, Object.assign({ debutant }, extra || {}));
      const p = T.planDeSeance(e);
      const x = p.exercices[0];
      expect(x.calage.suivante).toMatchObject({ charge: 25, pourquoi: 'borne', bornee: true });
      expect(porteuse(x).prerempli.charge_kg).toBe(25);
      x.lignes.filter((l) => !l.validee && l.type !== 'chauffe').forEach((l) => expect(!l.prerempli || l.prerempli.charge_kg === null || l.prerempli.charge_kg < 27.5).toBe(true));
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
      expect(T.verifierPhrases(p)).toEqual([]);
      expect(sp(x.calage.libelles.pourquoi)).toBe('27,5 kg est resté à 0 rep : je propose 25 kg.');
    });
  });
  test('borne au plus petit cran (20 × 0) : le calage se tait, aucune ligne grisée, aucune erreur', () => {
    const c = consigne(20, true);
    const e = entrees(seanceApresChauffes(2), c, { debutant: true });
    const p = T.planDeSeance(e);
    expect(p.exercices[0].calage.suivante).toBeNull();
    expect(p.exercices[0].lignes.some((l) => l.calage)).toBe(false);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('un zéro DANS la séance : la série suivante n\'est jamais la même charge, la phrase ne dit pas « je garde »', () => {
    const c = SILENCE;
    let se = S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: id }), 'dc', id, { series: 3, reps_visees: 8 });
    se = fait(se, 0, 30, 0, 'reste_0');
    const e = entrees(se, c, { debutant: true });
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(porteuse(x).prerempli.charge_kg).toBeLessThan(30);
    expect(sp(x.calage.libelles.pourquoi)).toBe('30 kg est resté à 0 rep : je propose 27,5 kg.');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('sans zéro, rien ne change : la progression normale (27,5 proposé après 20 et 25)', () => {
    const e = entrees(seanceApresChauffes(3), SILENCE, { debutant: false });
    const x = T.planDeSeance(e).exercices[0];
    expect(x.calage.suivante).toMatchObject({ charge: 27.5, pourquoi: 'en_montant' });
    expect(x.calage.suivante.bornee).toBeUndefined();
  });
  test('I73 : une proposition plus légère que la série d\'avant, NON bornée, reste refusée ; une bornée dont la charge n\'est pas sous sa borne aussi', () => {
    const e = entrees(seanceApresChauffes(3), SILENCE, { debutant: false });
    const p = T.planDeSeance(e);
    p.exercices[0].calage.suivante = Object.assign({}, p.exercices[0].calage.suivante, { charge: 22.5 });
    expect(T.verifierPlan(p, e).erreurs.join('\n')).toMatch(/I73.*plus légère/);
    const q = T.planDeSeance(entrees(seanceApresChauffes(3), consigne(27.5, false), { debutant: false }));
    q.exercices[0].calage.suivante = Object.assign({}, q.exercices[0].calage.suivante, { borne: 25 });
    expect(T.verifierPlan(q, entrees(seanceApresChauffes(3), consigne(27.5, false), { debutant: false })).erreurs.join('\n')).toMatch(/I73.*sous sa borne/);
  });
  test('I153 voit le calage qui regrise la charge échouée (le garde-fou reste vivant)', () => {
    const c = consigne(27.5, true);
    const e = entrees(seanceApresChauffes(3), c, { debutant: true });
    const p = T.planDeSeance(e);
    const l = porteuse(p.exercices[0]);
    l.prerempli = Object.assign({}, l.prerempli, { charge_kg: 27.5 });
    expect(T.verifierPlan(p, e).erreurs.join('\n')).toMatch(/I153.*calage/);
  });
});
