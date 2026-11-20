/** @jest-environment node */
//
// 20/11/2026 (MOTEUR §9.15, §9.15.5, §9.17 et §9.41 delta ; I244 à I250 ; décision d'Aurélien sur TT6 corrigé par son contradicteur, TT5
// et son contradicteur pour « peu de temps » et le poids du corps) — UNE SEULE MONTÉE DE CHAUFFE pour toutes les sources.
// Chaque test DISCRIMINANT échoue sur l'état d'avant (fdd3afb3) : il y est noté ce qu'il rendait.
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const F = require('../../v2/js/faits.js');

const sp = (t) => String(t).replace(/[  ]/g, ' ');
const montee = (e) => M.monteeDeChauffe(e).marches.map((q) => (q.charge === null ? null : [q.charge, q.reps]));
const lignes = (r) => r.lignes.map((l) => [l.charge, l.reps]);
const P = M.propositionDeChauffes;

describe('règle 2 — un nombre FIXÉ par la personne : ses montées ne bougent pas', () => {
  const routine = (ref, reps, extra) => M.chauffesDe(Object.assign({ equipement: 'barre', reference: ref, deja_sollicite: false, routine: reps }, extra || {}));
  test('squat 135, couché 140, militaire 57,5 : 20 · 70 · 90 · 120 ; 20 · 70 · 100 · 120 ; 20 × 10 · 50 × 2', () => {
    expect(lignes(routine(135, [10, 6, 3, 1]))).toEqual([[20, 10], [70, 6], [90, 3], [120, 1]]);
    expect(lignes(routine(140, [10, 6, 3, 1]))).toEqual([[20, 10], [70, 6], [100, 3], [120, 1]]);
    expect(lignes(routine(57.5, [10, 2]))).toEqual([[20, 10], [50, 2]]);
  });
  test('la barre vide porte sa MARQUE (jamais reconnue à sa charge) ; jamais au sol', () => {
    expect(routine(135, [10, 6, 3, 1]).lignes[0].barre).toBe(true);
    expect(routine(135, [10, 6, 3, 1]).lignes[1].barre).toBeUndefined();
    expect(routine(180, [5, 3, 1], { sol: true }).lignes.some((l) => l.barre)).toBe(false);
  });
  test('DISCRIMINANT — une marche pour chaque ligne : 4 lignes au sol, 4 lignes sous 70 kg (avant : des lignes vides en silence)', () => {
    // avant : 180 au sol, 4 lignes → 90 · 130 · 160 · vide ; 57,5, 4 lignes → 20 · 50 · vide · vide
    expect(lignes(routine(180, [null, null, null, null], { sol: true })).map((l) => l[0])).toEqual([60, 90, 130, 160]);
    expect(lignes(routine(57.5, [null, null, null, null])).map((l) => l[0])).toEqual([20, 30, 40, 50]);
  });
  test('DISCRIMINANT — la dernière jamais au-dessus de 90 % (soulevé 155 au sol : 140 = 90,3 % → 130 ; avant : 140)', () => {
    expect(lignes(routine(155, [5, 3, 1], { sol: true })).map((l) => l[0])).toEqual([80, 110, 130]);
  });
  test('DISCRIMINANT — préséance : le nombre fixé l’emporte sur « muscle déjà sollicité » (4 lignes restent 4 marches)', () => {
    // avant : deja_barre = 60 % · 88 %, les deux lignes suivantes vides
    const r = routine(140, [6, 3, 2, 1], { deja_sollicite: true });
    expect(r.lignes.every((l) => l.charge !== null)).toBe(true);
    expect(r.lignes.some((l) => l.barre)).toBe(false);
  });
  test('« Trop léger » rangé APRÈS les charges, jamais entre deux', () => {
    const r = routine(40, [null, null, null, null]);
    let vuVide = false;
    r.lignes.forEach((l) => { if (l.charge === null) vuVide = true; else expect(vuVide).toBe(false); });
  });
  test('les reps de la routine sont la structure ; vides, celles de la règle (barre × 10, puis 6 · 3 · 2 · 1 selon la part)', () => {
    expect(lignes(routine(135, [null, null, null, null]))).toEqual([[20, 10], [70, 6], [90, 3], [120, 1]]);
    expect(lignes(routine(135, [12, 8, 4, 2])).map((l) => l[1])).toEqual([12, 8, 4, 2]);
  });
  test('DISCRIMINANT — « peu de temps » réduit un nombre fixé : les premières lignes restent vides, avec la phrase', () => {
    const r = routine(135, [10, 6, 3, 1], { peuDeTemps: true });
    expect(lignes(r)).toEqual([[null, 10], [null, 6], [70, 3], [120, 1]]);
    expect(r.lignes[0].peu_de_temps).toBe(true);
    expect(sp(r.phrase)).toMatch(/Tu as peu de temps : deux chauffes\.$/);
  });
  test('la phrase dit l’unité et les reps de chaque chauffe', () => {
    expect(sp(routine(135, [10, 6, 3, 1]).phrase)).toBe('Chauffes calées sur 135 kg : 20 kg × 10 · 70 kg × 6 · 90 kg × 3 · 120 kg × 1.');
  });
});

describe('règle 3 — le COACH choisit le nombre : la barre vide, une marche par 40 kg, la dernière selon la zone', () => {
  const coach = (ref, reps, extra) => montee(Object.assign({ equipement: 'barre', reference: ref, reps }, extra || {}));
  test('DISCRIMINANT — squat 135 : Lourd 88 %, Mix 80 %, Hypertrophie 75 % (avant : la même montée en toute zone)', () => {
    expect(coach(135, 4)).toEqual([[20, 10], [65, 6], [95, 3], [120, 1]]);
    expect(coach(135, 7)).toEqual([[20, 10], [65, 6], [95, 3], [110, 2]]);
    expect(coach(135, 10)).toEqual([[20, 10], [65, 6], [100, 3]]);
  });
  test('arrondi au pas de 5 kg à la barre (jamais 10) ; un pas sous R ; 90 % au plus', () => {
    expect(coach(140, 4).slice(-1)[0][0]).toBe(125);           // 123,2 → 125 (au pas de 10 : 120)
    for (let r = 30; r <= 260; r += 2.5) {
      const m = coach(r, 5).filter(Boolean);
      if (!m.length) continue;
      const d = m[m.length - 1][0];
      expect(d).toBeLessThanOrEqual(0.9 * r + 1e-9);
      m.forEach((q, i) => { if (i) expect(q[0]).toBeGreaterThan(m[i - 1][0]); expect(q[0]).toBeLessThan(r); });
    }
  });
  test('le nombre : ⌈(D − barre) / 40⌉ marches, six lignes au plus', () => {
    expect(coach(57.5, 4)).toEqual([[20, 10], [50, 1]]);
    expect(coach(220, 3).length).toBe(6);
    expect(coach(500, 3).length).toBe(6);
  });
  test('hors barre, une marche seule au-dessus de 70 % en devient deux (I248) ; au sol, pas de barre vide', () => {
    expect(montee({ equipement: 'haltere', reference: 30, cran: 2, reps: 5 })).toEqual([[14, 6], [26, 1]]);
    expect(coach(180, 4, { sol: true })[0][0]).toBe(60);
  });
  test('muscle déjà sollicité : deux marches sur une barre de 70 kg et plus (60 %, D), rien ailleurs', () => {
    expect(coach(140, 4, { deja_sollicite: true })).toEqual([[85, 3], [125, 1]]);
    expect(montee({ equipement: 'machine', reference: 80, cran: 5, reps: 10, deja_sollicite: true })).toEqual([]);
  });
  test('DISCRIMINANT — la barre de la salle (15 kg) : la barre vide pèse 15 kg (avant : 20 en dur)', () => {
    M.brancherBarreDeLaSalle(() => 15);
    try {
      const m = M.monteeDeChauffe({ equipement: 'barre', reference: 60, reps: 5 });
      expect(m.marches[0]).toEqual({ charge: 15, reps: 10, barre: true });
    } finally { M.brancherBarreDeLaSalle(null); }
    expect(M.monteeDeChauffe({ equipement: 'barre', reference: 60, reps: 5 }).marches[0].charge).toBe(20);
  });
});

describe('règle 5 — « peu de temps »', () => {
  test('DISCRIMINANT — dès 100 kg à la barre : 50 % et la dernière ; en dessous et hors barre : une, 70 % au plus × 3 (avant : 80 × 5)', () => {
    expect(montee({ equipement: 'barre', reference: 135, reps: 4, peuDeTemps: true })).toEqual([[65, 6], [120, 1]]);
    expect(montee({ equipement: 'barre', reference: 57.5, reps: 4, peuDeTemps: true })).toEqual([[40, 3]]);
    expect(montee({ equipement: 'machine', reference: 100, cran: 5, reps: 10, peuDeTemps: true })).toEqual([[70, 3]]);
  });
  test('rien en isolation (sauf zone à ménager) ni au poids du corps ; au lesté, le poids du corps seul', () => {
    expect(P({ equipement: 'machine', reference: 40, premier: true, peuDeTemps: true, isolation: true, cran: 5 }).mode).toBe('rien');
    expect(P({ equipement: 'aucun', corps: true, premier: true, peuDeTemps: true, reps: 8 }).mode).toBe('rien');
    expect(P({ lest: true, reference: 30, premier: true, peuDeTemps: true, reps: 6 }).lignes).toEqual([[0, 2]]);
  });
  test('la constante est à part de SEUIL_DIZAINE', () => {
    expect(M.CHAUFFE_PEU_DE_TEMPS_BARRE).toBe(100);
  });
});

describe('règle 6 — le poids du corps et le lest', () => {
  test('DISCRIMINANT — le mouvement au tiers des reps visées, 2 à 5 (avant : « une série facile × 8 »)', () => {
    expect([2, 3, 5, 8, 12, 20].map((v) => M.repsDuMouvement(v))).toEqual([null, 2, 2, 3, 4, 5]);
    const r = P({ equipement: 'aucun', corps: true, premier: true, reps: 8 });
    expect(r.lignes).toEqual([[null, 3]]);
    expect(sp(r.phrase)).toBe('Chauffe : poids du corps × 3.');
    expect(sp(M.pourquoiDesChauffes(r))).toMatch(/Le mouvement lui-même, avec de la marge\.$/);
  });
  test('DISCRIMINANT — lesté : le poids du corps, puis dès 20 kg la moitié du lest × 2, « 15 kg de lest » (avant : rien)', () => {
    expect(P({ lest: true, reference: 10, premier: true, reps: 6 }).lignes).toEqual([[0, 2]]);
    const r = P({ lest: true, reference: 30, premier: true, reps: 5 });
    expect(r.lignes).toEqual([[0, 2], [15, 2]]);
    expect(sp(r.phrase)).toBe('Chauffe : poids du corps × 2 · 15 kg de lest × 2.');
    expect(P({ lest: true, reference: 25, premier: true, reps: 5 }).lignes[1]).toEqual([12.5, 2]);
  });
  test('pas de chauffe à part pour les pompes', () => {
    expect(P({ equipement: 'aucun', corps: true, premier: true, reps: 20, pompes: true }).mode).toBe('rien');
  });
});

describe('le plan — + Chauffe, le lesté, le programme du coach', () => {
  const SQ = { nom: 'Squat barre', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'],
    muscles_secondaires: ['ischio_jambiers'], muscles_stabilisateurs: ['bas_du_dos'] };
  const TL = { nom: 'Tractions lestées', equipement: 'aucun', charge: 'ajoutee', mesure: 'charge_reps', muscles_primaires: ['grand_dorsal'],
    muscles_secondaires: ['biceps'], muscles_stabilisateurs: [] };
  const CAT = { squat_barre: SQ, tractions_leste: TL };
  const consigne = (charge, vise) => ({ etat: 'progression', zone: 'force', palier: charge, niveau: vise, n: 3, ligne: { charge, vise }, haut: null, fondement: {} });
  let n0 = 0;
  const id = () => 'z' + (++n0);
  const seanceDe = (slug, chauffes, gestes) => {
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, slug, id, { series: 3 });
    if (chauffes) se = S.insererChauffes(se, 0, chauffes.map((r) => [null, r]), id);
    (gestes || []).forEach((g) => { se = S.noterGeste(se, g); });
    return se;
  };
  const entrees = (se, slug, c, extra) => Object.assign({
    seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: se.gestes || [] },
    consignes: { [slug]: { consigne: c, libelles: M.libellesConsigne(c), pas: null } },
    catalogue: CAT, reglage: null, paris: [], suites: {}, e1rms: { [slug]: c.palier * 1.15 }
  }, extra || {});
  const plan = (se, slug, c, extra) => { const e = entrees(se, slug, c, extra); const p = T.planDeSeance(e); return { e, p, x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs }; };
  const plusUne = (se) => {
    const idPlus = 'plus-' + (++n0);
    se = S.insererChauffes(se, 0, [[null, null]], () => idPlus);
    return S.noterGeste(se, { geste: 'chauffe_plus', slug: se.exercices[0].exercise_slug, serie: idPlus });
  };
  const valider = (se, i, charge, reps) => S.valider(S.modifierSerie(se, 0, i, { charge_kg: charge, reps }), 0, i, new Date('2026-10-20T10:05:00Z'));
  const chauffes = (x) => x.lignes.filter((l) => l.type === 'echauffement').map((l) => (l.validee ? 'fait' : l.fantome ? l.fantome.charge : null));

  test('DISCRIMINANT — « + Chauffe » après ses 4 chauffes faites : 125 × 1 au milieu du dernier saut (avant : « Trop proche »)', () => {
    let se = seanceDe('squat_barre', [10, 6, 3, 1]);
    [[20, 10], [70, 6], [90, 3], [120, 1]].forEach((q, i) => { se = valider(se, i, q[0], q[1]); });
    se = plusUne(se);
    const r = plan(se, 'squat_barre', consigne(135, 4));
    expect(chauffes(r.x)).toEqual(['fait', 'fait', 'fait', 'fait', 125]);
    expect(sp(r.x.chauffes.phrase)).toBe('Chauffe ajoutée : 125 kg × 1, entre 120 et 135 kg.');
    expect(r.erreurs).toEqual([]);
    // Une deuxième : plus de place sous 95 %.
    const r2 = plan(plusUne(se), 'squat_barre', consigne(135, 4));
    expect(chauffes(r2.x)[5]).toBeNull();
    expect(r2.x.chauffes.phrase).toMatch(/Trop proche de ta charge de travail/);
    expect(r2.erreurs).toEqual([]);
  });
  test('DISCRIMINANT — rien de fait : la ligne ajoutée ne bouge aucune autre (avant : une ligne vide, sans phrase)', () => {
    const se = plusUne(seanceDe('squat_barre', [10, 6, 3, 1]));
    const r = plan(se, 'squat_barre', consigne(135, 4));
    expect(chauffes(r.x)).toEqual([20, 70, 90, 120, 125]);
    expect(r.erreurs).toEqual([]);
  });
  test('le plafond : 90 % hors d’une visée de 3 à 5 reps, ou pour une population protégée', () => {
    const se = plusUne(seanceDe('squat_barre', [10, 6, 3, 1]));
    expect(chauffes(plan(se, 'squat_barre', consigne(135, 8)).x)[4]).toBeNull();   // visée 8 : 90 %, 121,5 → 120, pas au-dessus de 120
    expect(chauffes(plan(se, 'squat_barre', consigne(135, 4), { debutant: true }).x)[4]).toBeNull();
    expect(M.plafondDeLaChauffeAjoutee({ reps: 4 })).toBe(0.95);
    expect(M.plafondDeLaChauffeAjoutee({ reps: 2 })).toBe(0.90);
    expect(M.plafondDeLaChauffeAjoutee({ reps: 4, protegee: true })).toBe(0.90);
    expect(M.plafondDeLaChauffeAjoutee({ reps: 4, repriseLongue: true })).toBe(0.90);
  });
  test('DISCRIMINANT — tractions lestées +10 kg × 6 : une proposition, le poids du corps × 2 (avant : rien)', () => {
    const r = plan(seanceDe('tractions_leste'), 'tractions_leste', consigne(10, 6));
    expect(r.x.proposition.lignes).toEqual([[0, 2]]);
    expect(r.erreurs).toEqual([]);
    const r30 = plan(seanceDe('tractions_leste'), 'tractions_leste', consigne(30, 5));
    expect(r30.x.proposition.lignes).toEqual([[0, 2], [15, 2]]);
    expect(r30.erreurs).toEqual([]);
  });
  test('DISCRIMINANT — un programme du coach : ses chauffes posées d’office avec « Annuler », aucune carte (I250)', () => {
    const r = plan(seanceDe('squat_barre'), 'squat_barre', consigne(135, 4), { chauffesDuCoach: { squat_barre: true } });
    expect(r.x.proposition.mode).toBe('auto');
    expect(r.x.proposition.raison).toBe('programme');
    expect(r.x.proposition.annulable).toBe(true);
    expect(r.x.proposition.lignes).toEqual([[20, 10], [65, 6], [95, 3], [120, 1]]);
    expect(r.erreurs).toEqual([]);
    // Deux « Annuler » d'affilée : le silence d'I128.
    const tu = plan(seanceDe('squat_barre'), 'squat_barre', consigne(135, 4), { chauffesDuCoach: { squat_barre: true }, refusChauffes: { squat_barre: true } });
    expect(tu.x.proposition).toBeNull();
    // Sans la marque : la carte d'avant.
    expect(plan(seanceDe('squat_barre'), 'squat_barre', consigne(135, 4)).x.proposition.mode).toBe('proposer');
  });
});

describe('les invariants I244 à I250 attrapent une montée forgée', () => {
  const SQ = { nom: 'Squat barre', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'],
    muscles_secondaires: ['ischio_jambiers'], muscles_stabilisateurs: ['bas_du_dos'] };
  const c = { etat: 'progression', zone: 'force', palier: 135, niveau: 4, n: 3, ligne: { charge: 135, vise: 4 }, haut: null, fondement: {} };
  let n0 = 0;
  const id = () => 'w' + (++n0);
  const base = (extra, chauffes) => {
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
    if (chauffes) se = S.insererChauffes(se, 0, chauffes.map((r) => [null, r]), id);
    const e = Object.assign({ seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: [] },
      consignes: { squat_barre: { consigne: c, libelles: M.libellesConsigne(c), pas: null } }, catalogue: { squat_barre: SQ }, reglage: null, paris: [], suites: {} }, extra || {});
    return { e, p: T.planDeSeance(e) };
  };
  const err = (e, p) => T.verifierPlan(p, e).erreurs.join('\n');
  test('I244 — une proposition qui redescend ; une barre vide marquée hors de la 1re ligne', () => {
    const { e, p } = base();
    expect(err(e, p)).toBe('');
    p.exercices[0].proposition.lignes[2][0] = 60;
    expect(err(e, p)).toMatch(/^I244 — .*ne monte pas/m);
    const b = base(null, [10, 6, 3, 1]);
    b.p.exercices[0].lignes[1].chauffe.barre = true;
    expect(err(b.e, b.p)).toMatch(/^I244 — .*barre vide hors de la 1re ligne/m);
  });
  test('I245 — une dernière loin de la part de la zone', () => {
    const { e, p } = base();
    p.exercices[0].proposition.lignes[3][0] = 100;
    p.exercices[0].surDemande = null;
    expect(err(e, p)).toMatch(/^I245 — .*loin de 88 %/m);
  });
  test('I246 — une marche de moins que la règle', () => {
    const { e, p } = base();
    p.exercices[0].proposition.lignes.splice(1, 1);
    p.exercices[0].surDemande = null;
    expect(err(e, p)).toMatch(/^I246 — .*compte 3 chauffes, la règle en donne 4/m);
  });
  test('I247 — une chauffe ajoutée au-dessus de 95 %', () => {
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
    se = S.insererChauffes(se, 0, [[null, 10], [null, 6], [null, 3], [null, 1], [null, null]], id);
    const idPlus = se.exercices[0].series[4].id;
    se = S.noterGeste(se, { geste: 'chauffe_plus', slug: 'squat_barre', serie: idPlus });
    const e = { seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: se.gestes },
      consignes: { squat_barre: { consigne: c, libelles: M.libellesConsigne(c), pas: null } }, catalogue: { squat_barre: SQ }, reglage: null, paris: [], suites: {} };
    const p = T.planDeSeance(e);
    expect(err(e, p)).toBe('');
    p.exercices[0].lignes[4].chauffe.charge = 130;
    p.exercices[0].lignes[4].fantome.charge = 130;
    expect(err(e, p)).toMatch(/^I247 — .*dépasse 95 %/m);
  });
  test('I248 — une seule chauffe à froid au-dessus de 70 %', () => {
    const { e, p } = base();
    p.exercices[0].proposition.lignes = [[110, 1]];
    p.exercices[0].surDemande = null;
    expect(err(e, p)).toMatch(/^I248 — /m);
  });
  test('I249 — au poids du corps, des reps qui ne sont pas le tiers de la visée', () => {
    const TR = { nom: 'Tractions', equipement: 'aucun', charge: 'aucune', mesure: 'reps', muscles_primaires: ['grand_dorsal'], muscles_secondaires: [], muscles_stabilisateurs: [] };
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'tractions', id, { series: 3 });
    const k = { etat: 'progression', zone: 'hypertrophie', palier: 0, niveau: 8, n: 3, ligne: { charge: 0, vise: 8 }, haut: null, fondement: {} };
    const e = { seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: [] },
      consignes: { tractions: { consigne: k, libelles: M.libellesConsigne(k), pas: null } }, catalogue: { tractions: TR }, reglage: null, paris: [], suites: {} };
    const p = T.planDeSeance(e);
    expect(p.exercices[0].proposition.lignes).toEqual([[null, 3]]);
    expect(err(e, p)).toBe('');
    p.exercices[0].proposition.lignes = [[null, 8]];
    p.exercices[0].surDemande = null;
    expect(err(e, p)).toMatch(/^I249 — .*8 reps \(attendu 3\)/m);
  });
  test('I250 — un programme du coach en carte à accepter', () => {
    const { e, p } = base({ chauffesDuCoach: { squat_barre: true } });
    expect(err(e, p)).toBe('');
    p.exercices[0].proposition.mode = 'proposer';
    expect(err(e, p)).toMatch(/^I250 — /m);
  });
});

describe('faits — des chauffes posées par un programme du coach ne disent pas que la personne les ajoute', () => {
  test('DISCRIMINANT — une séance « programme » est neutre : ni comptée, ni rupture', () => {
    const trav = (id) => ({ id: id + 't', session_id: id, exercise_slug: 'sq', type_serie: 'travail', charge_kg: 100, reps: 5, validee_a: '2026-10-01T11:00:00Z' });
    const ch = (id) => ({ id: id + 'c', session_id: id, exercise_slug: 'sq', type_serie: 'echauffement', charge_kg: 20, reps: 10, validee_a: '2026-10-01T10:50:00Z' });
    const series = { a: [ch('a'), trav('a')], b: [ch('b'), trav('b')], c: [ch('c'), trav('c')] };
    const seances = [
      { id: 'c', debut: '2026-10-15T10:00:00Z', statut: 'terminee', gestes: [{ geste: 'chauffes_auto', slug: 'sq', programme: true }] },
      { id: 'b', debut: '2026-10-12T10:00:00Z', statut: 'terminee', gestes: [{ geste: 'chauffes_auto', slug: 'sq', programme: true }] },
      { id: 'a', debut: '2026-10-10T10:00:00Z', statut: 'terminee', gestes: [{ geste: 'chauffes_ajoutees', slug: 'sq' }] }
    ];
    const corpus = { seances, series: [].concat(series.a, series.b, series.c), seriesDe: (id) => series[id] || [], catalogue: () => ({}) };
    // avant : 3 (les lignes du programme comptaient comme « ajoutées » et lançaient l'ajout automatique)
    expect(F.creer().chauffesAjoutees(corpus, ['sq'], '2026-10-20T10:00:00Z')).toEqual({ sq: 1 });
  });
  test('le geste `chauffe_plus` garde sa série, `chauffes_auto` sa marque « programme »', () => {
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: () => 'x' });
    se = S.noterGeste(se, { geste: 'chauffe_plus', slug: 'sq', serie: 'id-1' });
    se = S.noterGeste(se, { geste: 'chauffe_plus', slug: 'sq' });
    se = S.noterGeste(se, { geste: 'chauffes_auto', slug: 'sq', programme: true });
    expect(se.gestes).toEqual([{ geste: 'chauffe_plus', slug: 'sq', serie: 'id-1' }, { geste: 'chauffes_auto', slug: 'sq', programme: true }]);
  });
});
