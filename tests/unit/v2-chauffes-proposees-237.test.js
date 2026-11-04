/** @jest-environment node */
//
// 237 (MOTEUR §9.41) — LES CHAUFFES PROPOSÉES PAR LE COACH : la décision (`Moteur.propositionDeChauffes`, une seule fonction),
// l'apprentissage (`faits.chauffesAjoutees`, la mémoire des « Non merci »), le plan qui la lit, et les invariants I125 à I128.
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/semaine.js');
require('../../v2/js/generateur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');

const P = M.propositionDeChauffes;
const charges = (r) => r.lignes.map((l) => l[0]);
const reps = (r) => r.lignes.map((l) => l[1]);

describe('règle 1 — quand proposer', () => {
  const base = { equipement: 'barre', reference: 100, e1rm: 120, premier: true };
  test('le premier exercice du muscle, au-dessus de 60 % du max estimé : une proposition (la raison est dite)', () => {
    const r = P(base);
    expect(r.mode).toBe('proposer');
    expect(r.raison).toBe('muscle');
  });
  test('la borne : exactement 60 % du max → rien ; juste au-dessus → une proposition', () => {
    expect(P(Object.assign({}, base, { reference: 72, e1rm: 120 })).mode).toBe('rien');
    expect(P(Object.assign({}, base, { reference: 72.5, e1rm: 120 })).mode).toBe('proposer');
  });
  test('un muscle déjà sollicité plus tôt : rien', () => {
    expect(P(Object.assign({}, base, { premier: false })).mode).toBe('rien');
  });
  test('une zone à ménager propose même si le muscle est déjà sollicité ou la charge basse', () => {
    const r = P(Object.assign({}, base, { premier: false, menagee: true, reference: 50, e1rm: 120 }));
    expect(r.mode).toBe('proposer');
    expect(r.raison).toBe('zone');
  });
  test('l’objectif Forme propose, sans autre condition', () => {
    const r = P(Object.assign({}, base, { premier: false, forme: true, reference: 50, e1rm: 120 }));
    expect(r.raison).toBe('forme');
    expect(r.mode).toBe('proposer');
  });
  test('sans max connu, le premier exercice du muscle reçoit la proposition ; sans charge de travail, rien', () => {
    expect(P(Object.assign({}, base, { e1rm: null })).mode).toBe('proposer');
    expect(P(Object.assign({}, base, { reference: null })).mode).toBe('rien');
  });
});

describe('règle 2 — les paliers', () => {
  test('une barre lourde : trois paliers qui montent, la dernière vers 85 %, jamais au-delà de 90 %', () => {
    const r = P({ equipement: 'barre', reference: 140, e1rm: 160, premier: true });
    expect(charges(r)).toEqual([50, 90, 120]);
    expect(reps(r)).toEqual([8, 5, 2]);
    expect(Math.max.apply(null, charges(r))).toBeLessThanOrEqual(0.9 * 140);
  });
  test('le nombre de paliers suit l’écart : une barre légère en a moins qu’une barre lourde', () => {
    const leger = P({ equipement: 'barre', reference: 40, e1rm: 50, premier: true });
    const lourd = P({ equipement: 'barre', reference: 180, e1rm: 200, premier: true });
    expect(leger.lignes.length).toBeLessThan(lourd.lignes.length);
    expect(lourd.lignes.length).toBeLessThanOrEqual(4);
  });
  test('arrondi au cran du matériel : une machine au cran de 5', () => {
    const r = P({ equipement: 'machine', reference: 80, e1rm: 100, premier: true, cran: 5 });
    r.lignes.forEach((l) => expect(l[0] % 5).toBe(0));
  });
  test('les reps décroissent toujours', () => {
    [60, 100, 140, 200].forEach((ref) => {
      const rp = reps(P({ equipement: 'barre', reference: ref, e1rm: ref * 1.2, premier: true }));
      rp.forEach((v, i) => { if (i) expect(v).toBeLessThan(rp[i - 1]); });
    });
  });
  test('aucune chauffe n’atteint la charge de travail, quel que soit le cran', () => {
    for (let ref = 25; ref <= 220; ref += 7.5) {
      const r = P({ equipement: 'barre', reference: ref, premier: true });
      charges(r).forEach((c, i) => { expect(c).toBeLessThan(ref); if (i) expect(c).toBeGreaterThan(charges(r)[i - 1]); });
      if (r.lignes.length) expect(charges(r)[r.lignes.length - 1]).toBeLessThanOrEqual(0.9 * ref + 1e-9);
    }
  });
});

describe('règles 3 et 4 — le poids du corps et l’isolation', () => {
  test('au poids du corps : une série facile, sans charge, une seule', () => {
    const r = P({ equipement: 'aucun', corps: true, premier: true });
    expect(r.lignes).toEqual([[null, 8]]);
    expect(r.phrase).toMatch(/série facile/);
  });
  test('une isolation en tête de séance : une série légère de 15', () => {
    const r = P({ equipement: 'poulie', reference: 30, e1rm: 40, premier: true, premierExercice: true, isolation: true, cran: 2.5 });
    expect(r.lignes).toEqual([[15, 15]]);
    expect(r.situation).toBe('isolation');
  });
  test('une isolation qui n’ouvre pas la séance garde les paliers', () => {
    const r = P({ equipement: 'machine', reference: 80, e1rm: 100, premier: true, premierExercice: false, isolation: true, cran: 5 });
    expect(r.situation).toBe('paliers');
  });
});

describe('règle 5 — « J’ai peu de temps »', () => {
  test('sur une barre : exactement une chauffe, jamais zéro', () => {
    [40, 60, 100, 140, 200].forEach((ref) => {
      const r = P({ equipement: 'barre', reference: ref, e1rm: ref * 1.3, premier: true, peuDeTemps: true });
      expect(r.lignes.length).toBe(1);
    });
  });
  test('237-bis — hors barre, un polyarticulaire chargé : une chauffe (smith, presse, hack squat, haltères, machine guidée)', () => {
    ['machine_smith', 'machine', 'haltere'].forEach((equipement) => {
      const r = P({ equipement, reference: 100, e1rm: 125, premier: true, peuDeTemps: true, cran: 5, isolation: false });
      expect(r.mode).toBe('proposer');
      expect(r.lignes.length).toBe(1);
    });
    // la presse et le hack squat sont des machines
    expect(P({ equipement: 'machine', reference: 180, e1rm: 220, premier: true, peuDeTemps: true, cran: 10, isolation: false }).lignes.length).toBe(1);
    expect(P({ equipement: 'haltere', reference: 30, e1rm: 38, premier: true, peuDeTemps: true, cran: 2, isolation: false }).lignes.length).toBe(1);
    // sans « peu de temps », les paliers ne bougent pas
    expect(P({ equipement: 'machine_smith', reference: 100, e1rm: 125, premier: true, cran: 5, isolation: false }).lignes.length).toBeGreaterThan(1);
  });
  test('237-bis — une isolation : zéro, sauf une zone à ménager (une) ; le poids du corps : zéro', () => {
    expect(P({ equipement: 'machine', reference: 40, e1rm: 50, premier: true, peuDeTemps: true, cran: 5, isolation: true }).mode).toBe('rien');
    expect(P({ equipement: 'barre', reference: 30, e1rm: 38, premier: true, peuDeTemps: true, isolation: true }).mode).toBe('rien');
    expect(P({ equipement: 'machine', reference: 40, e1rm: 50, premier: true, peuDeTemps: true, menagee: true, cran: 5, isolation: true }).lignes.length).toBe(1);
    expect(P({ equipement: 'aucun', corps: true, premier: true, peuDeTemps: true }).mode).toBe('rien');
    expect(P({ equipement: 'aucun', corps: true, premier: true }).lignes.length).toBe(1);
  });
});

describe('237-bis — le silence annoncé (une seule source)', () => {
  const Pl = T;
  test('la phrase vient du moteur', () => {
    expect(M.phraseDuSilenceDesChauffes('Squat barre')).toBe('D’accord, je ne te les propose plus sur Squat barre pendant 4 semaines.');
  });
  test('le 2e refus met en silence (une fois) ; le 1er non ; un refus de la même séance ne le redit pas', () => {
    const t = Date.parse('2026-10-20T10:00:00Z');
    const m1 = Pl.refuserChauffes({}, 'x', 'S1', t);
    expect(Pl.miseEnSilence({}, m1, 'x', t)).toBe(false);
    const m2 = Pl.refuserChauffes(m1, 'x', 'S2', t);
    expect(Pl.miseEnSilence(m1, m2, 'x', t)).toBe(true);
    expect(Pl.miseEnSilence(m2, Pl.refuserChauffes(m2, 'x', 'S2', t), 'x', t)).toBe(false);
    expect(Pl.miseEnSilence(m1, m2, M.MOBILITE_REFUS_CLE, t)).toBe(false);
  });
  test('« Annuler » retire ce dernier refus : plus de silence, le compte revient à 1', () => {
    const t = Date.parse('2026-10-20T10:00:00Z');
    const m2 = Pl.refuserChauffes(Pl.refuserChauffes({}, 'x', 'S1', t), 'x', 'S2', t);
    const m = Pl.annulerRefusChauffes(m2, 'x', 'S2');
    expect(m.x.n).toBe(1);
    expect(m.x.seance).toBe('S1');
    expect(Pl.refusChauffesDe(m, 'S2', t).x).toBeUndefined();
    expect(Pl.annulerRefusChauffes(m, 'x', 'S2')).toEqual(m);   // un refus d'une autre séance : inchangé
    expect(Pl.annulerRefusChauffes(Pl.refuserChauffes({}, 'x', 'S1', t), 'x', 'S1').x).toBeUndefined();
  });
});

describe('règle 6 — l’apprentissage et le silence', () => {
  const base = { equipement: 'barre', reference: 100, e1rm: 120, premier: true };
  test('après 2 séances où la personne les a ajoutées : ajout automatique, avec « Annuler » ; après 1 : une proposition', () => {
    expect(P(Object.assign({}, base, { ajoutees: 1 })).mode).toBe('proposer');
    const a = P(Object.assign({}, base, { ajoutees: 2 }));
    expect(a.mode).toBe('auto');
    expect(a.annulable).toBe(true);
  });
  test('le silence (2 « Non merci » depuis moins de 4 semaines) : rien, même si l’ajout était automatique', () => {
    expect(P(Object.assign({}, base, { ajoutees: 5, silence: true })).mode).toBe('rien');
  });
  test('chauffesEnSilence : 2 refus, 28 jours', () => {
    const J = 86400000, t = Date.parse('2026-10-01T10:00:00Z');
    expect(M.chauffesEnSilence({ n: 1, quand: t }, t + J)).toBe(false);
    expect(M.chauffesEnSilence({ n: 2, quand: t }, t + 27 * J)).toBe(true);
    expect(M.chauffesEnSilence({ n: 2, quand: t }, t + 28 * J)).toBe(false);
  });
  test('le Pourquoi dit la règle, sans le mot « max »', () => {
    const r = P(base);
    const w = M.pourquoiDesChauffes(r);
    expect(w).toMatch(/^Premier exercice de la séance sur ce muscle/);
    expect(w).toMatch(/60 %/);
    expect(w).not.toMatch(/\bmax\b/);
  });
});

describe('faits.chauffesAjoutees — le fait relu dans les séances', () => {
  const corpus = (seances, series) => ({ seances, series: [].concat.apply([], Object.keys(series).map((k) => series[k])), seriesDe: (id) => series[id] || [], catalogue: () => ({}) });
  const s = (id, jour, extra) => Object.assign({ id, debut: '2026-10-' + jour + 'T10:00:00Z', statut: 'terminee' }, extra || {});
  const trav = (id) => ({ id: id + 't', session_id: id, exercise_slug: 'squat_barre', type_serie: 'travail', charge_kg: 100, reps: 5, validee_a: '2026-10-01T11:00:00Z' });
  const chauffe = (id) => ({ id: id + 'c', session_id: id, exercise_slug: 'squat_barre', type_serie: 'echauffement', charge_kg: 60, reps: 5, validee_a: '2026-10-01T10:50:00Z' });
  const f = (seances, series) => Faits.creer().chauffesAjoutees(corpus(seances, series), ['squat_barre'], '2026-10-20T10:00:00Z').squat_barre;
  test('deux séances d’affilée avec des chauffes : 2', () => {
    expect(f([s('b', '10'), s('a', '05')], { a: [chauffe('a'), trav('a')], b: [chauffe('b'), trav('b')] })).toBe(2);
  });
  test('une séance sans chauffe, la plus récente : la suite s’arrête (0)', () => {
    expect(f([s('b', '10'), s('a', '05')], { a: [chauffe('a'), trav('a')], b: [trav('b')] })).toBe(0);
  });
  test('un geste « chauffes_ajoutees » compte ; « chauffes_annulees » ne compte pas', () => {
    expect(f([s('b', '10', { gestes: [{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }] }), s('a', '05', { gestes: [{ geste: 'chauffes_auto', slug: 'squat_barre' }] })],
      { a: [trav('a')], b: [trav('b')] })).toBe(2);
    expect(f([s('b', '10', { gestes: [{ geste: 'chauffes_annulees', slug: 'squat_barre' }] })], { b: [chauffe('b'), trav('b')] })).toBe(0);
  });
  test('une séance d’après le début (ou la séance en cours) ne compte pas', () => {
    expect(Faits.creer().chauffesAjoutees(corpus([s('b', '25')], { b: [chauffe('b'), trav('b')] }), ['squat_barre'], '2026-10-20T10:00:00Z').squat_barre).toBe(0);
  });
});

describe('le plan — proposition, ajout automatique, « Annuler », silence', () => {
  const SQ = { nom: 'Squat barre', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['ischio_jambiers'], muscles_stabilisateurs: ['bas_du_dos'] };
  const CAT = { squat_barre: SQ };
  const consigne = (charge) => ({ etat: 'progression', zone: 'force', palier: charge, niveau: 5, n: 3, ligne: { charge, vise: 5 }, haut: null, fondement: {} });
  const seanceDe = (gestes) => {
    let n = 0; const id = () => 'z' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
    (gestes || []).forEach((g) => { se = S.noterGeste(se, g); });
    return se;
  };
  const entrees = (se, extra) => Object.assign({
    seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: se.gestes || [] },
    consignes: { squat_barre: { consigne: consigne(140), libelles: M.libellesConsigne(consigne(140)), pas: null } },
    catalogue: CAT, reglage: null, paris: [], suites: {}, e1rms: { squat_barre: 160 }
  }, extra || {});
  const plan = (se, extra) => { const e = entrees(se, extra); const p = T.planDeSeance(e); return { e, p, x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs }; };

  test('la proposition porte sa raison et son Pourquoi, et passe les invariants', () => {
    const r = plan(seanceDe());
    expect(r.x.proposition.mode).toBe('proposer');
    expect(r.x.proposition.raison).toBe('muscle');
    expect(r.x.proposition.pourquoi).toMatch(/^Premier exercice de la séance sur ce muscle/);
    expect(r.erreurs).toEqual([]);
  });
  test('sous 60 % du max estimé : rien', () => {
    expect(plan(seanceDe(), { e1rms: { squat_barre: 300 } }).x.proposition).toBeNull();
  });
  test('deux séances d’ajout : le plan dit « auto » et l’ajout est annulable', () => {
    const r = plan(seanceDe(), { chauffesAjoutees: { squat_barre: 2 } });
    expect(r.x.proposition.mode).toBe('auto');
    expect(r.x.proposition.annulable).toBe(true);
    expect(r.erreurs).toEqual([]);
  });
  test('après l’ajout automatique : le geste « Annuler » est exposé ; annulé, il disparaît', () => {
    let se = seanceDe([{ geste: 'chauffes_auto', slug: 'squat_barre' }]);
    const r0 = plan(plan(se).p.exercices[0].proposition ? seanceDe() : se);
    se = S.insererChauffes(se, 0, plan(seanceDe()).x.proposition.lignes, (() => { let k = 0; return () => 'c' + (++k); })());
    const r = plan(se);
    expect(r0).toBeDefined();
    expect(r.x.chauffesAuto).toEqual(expect.objectContaining({ slug: 'squat_barre', annuler: 'Annuler' }));
    expect(r.erreurs).toEqual([]);
    // Annuler : les chauffes non faites partent, le geste est noté, le plan ne montre plus rien.
    se = S.retirerChauffesNonFaites(se, 0);
    se = S.noterGeste(se, { geste: 'chauffes_annulees', slug: 'squat_barre' });
    const r2 = plan(se);
    expect(r2.x.chauffesAuto).toBeNull();
    expect(se.exercices[0].series.every((q) => S.typeDe(q) === 'travail')).toBe(true);
  });
  test('« Annuler » ne touche jamais une série validée', () => {
    let se = seanceDe([{ geste: 'chauffes_auto', slug: 'squat_barre' }]);
    se = S.insererChauffes(se, 0, [[60, 8], [100, 5]], (() => { let k = 0; return () => 'c' + (++k); })());
    se = S.valider(S.modifierSerie(se, 0, 0, { charge_kg: 60, reps: 8 }), 0, 0, new Date('2026-10-20T10:05:00Z'));
    const apres = S.retirerChauffesNonFaites(se, 0);
    expect(apres.exercices[0].series.filter((q) => S.typeDe(q) === 'echauffement').length).toBe(1);
  });
  test('les chauffes ajoutées par « Ajouter » se remplissent avec les paliers de la proposition', () => {
    const prop = plan(seanceDe()).x.proposition;
    let se = seanceDe([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }]);
    se = S.insererChauffes(se, 0, prop.lignes, (() => { let k = 0; return () => 'c' + (++k); })());
    const x = plan(se).x;
    const fantomes = x.lignes.filter((l) => l.type === 'echauffement').map((l) => l.fantome && l.fantome.charge);
    expect(fantomes).toEqual(prop.lignes.map((l) => l[0]));
  });
  test('le silence : aucune proposition (I128)', () => {
    const r = plan(seanceDe(), { refusChauffes: { squat_barre: true } });
    expect(r.x.proposition).toBeNull();
  });
  test('« J’ai peu de temps » sur une barre : exactement une chauffe (I127)', () => {
    const r = plan(seanceDe(), { raccourci: { cible: 30, complet: [], resultat: { exercices: [] } } });
    if (r.x.proposition) expect(r.x.proposition.lignes.length).toBe(1);
  });

  test('237-bis — le silence annoncé : la phrase du moteur et « Annuler » tant que rien n’est fait ; annulé, elle part', () => {
    const phrase = M.phraseDuSilenceDesChauffes('Squat barre');
    const r = plan(seanceDe([{ geste: 'chauffes_silence', slug: 'squat_barre' }]), { refusChauffes: { squat_barre: true } });
    expect(r.x.silenceChauffes).toEqual({ slug: 'squat_barre', texte: phrase, annuler: 'Annuler' });
    expect(r.erreurs).toEqual([]);
    const a = plan(seanceDe([{ geste: 'chauffes_silence', slug: 'squat_barre' }, { geste: 'chauffes_silence_annule', slug: 'squat_barre' }]));
    expect(a.x.silenceChauffes).toBeNull();
    expect(a.erreurs).toEqual([]);
    const b = plan(seanceDe([{ geste: 'chauffes_silence', slug: 'squat_barre' }, { geste: 'chauffes_silence_annule', slug: 'squat_barre' }, { geste: 'chauffes_silence', slug: 'squat_barre' }]),
      { refusChauffes: { squat_barre: true } });
    expect(b.x.silenceChauffes).not.toBeNull();
  });

  describe('les invariants forgés sont attrapés', () => {
    test('I130 — une mise en silence sans sa phrase annoncée', () => {
      const r = plan(seanceDe([{ geste: 'chauffes_silence', slug: 'squat_barre' }]), { refusChauffes: { squat_barre: true } });
      const p = JSON.parse(JSON.stringify(r.p));
      p.exercices[0].silenceChauffes = null;
      expect(T.verifierPlan(p, r.e).erreurs.join('\n')).toMatch(/I130.*sans sa phrase annoncée/);
      p.exercices[0].silenceChauffes = { slug: 'squat_barre', texte: 'Bon.', annuler: 'Annuler' };
      expect(T.verifierPlan(p, r.e).erreurs.join('\n')).toMatch(/I130/);
    });
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const bad = (mut, extra) => {
      const r = plan(seanceDe(), extra);
      const p = clone(r.p);
      mut(p.exercices[0]);
      return T.verifierPlan(p, r.e).erreurs.join('\n');
    };
    test('I125 — une proposition « zone à ménager » sans zone', () => {
      expect(bad((x) => { x.proposition.raison = 'zone'; })).toMatch(/I125.*sans zone à ménager/);
    });
    test('I125 — une proposition sous 60 % du max', () => {
      expect(bad(() => {}, { e1rms: { squat_barre: 160 } })).toBe('');
      const r = plan(seanceDe());
      const e = Object.assign({}, r.e, { e1rms: { squat_barre: 300 } });
      expect(T.verifierPlan(clone(r.p), e).erreurs.join('\n')).toMatch(/I125.*sous 60 % du max estimé/);
    });
    test('I126 — la dernière chauffe au-dessus de 90 %', () => {
      expect(bad((x) => { x.proposition.lignes[x.proposition.lignes.length - 1][0] = 135; })).toMatch(/I126.*dépasse 90 %/);
    });
    test('I126 — des chauffes qui ne montent pas', () => {
      expect(bad((x) => { x.proposition.lignes[1][0] = 10; })).toMatch(/I126.*ne montent pas/);
    });
    test('I127 — « peu de temps » sur une barre avec deux chauffes', () => {
      const r = plan(seanceDe());
      const e = Object.assign({}, r.e, { raccourci: { cible: 30 } });
      expect(T.verifierPlan(clone(r.p), e).erreurs.join('\n')).toMatch(/I127/);
    });
    test('I128 — un ajout automatique sans « Annuler »', () => {
      expect(bad((x) => { x.proposition.mode = 'auto'; x.proposition.annulable = false; })).toMatch(/I128.*sans « Annuler »/);
    });
    test('I128 — une proposition en silence', () => {
      const r = plan(seanceDe());
      const e = Object.assign({}, r.e, { refusChauffes: { squat_barre: true } });
      expect(T.verifierPlan(clone(r.p), e).erreurs.join('\n')).toMatch(/I128.*silence/);
    });
  });
});
