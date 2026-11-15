/** @jest-environment node */
//
// 15/11/2026 (MOTEUR §9.41 bis, I184 à I193, PR 1 sur 3) — LES CHAUFFES SE CALENT SUR LA CHARGE QUE TU TAPES.
// La référence des chauffes est la première charge saisie de la première ligne de travail ; à défaut la consigne figée ; à défaut rien.
// « + Chauffe » pose toute la montée par le chemin d'« Ajouter » (`x.surDemande`, le même appel que `x.proposition`, `demande: true`).
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

const P = M.propositionDeChauffes;
const charges = (r) => r.lignes.map((l) => l[0]);
const reps = (r) => r.lignes.map((l) => l[1]);
const nb = (t) => String(t).replace(/\u00a0|\u202f/g, ' ');   // espaces insécables du formateur

describe('I184 — Moteur.referenceDesChauffes : une seule référence', () => {
  const R = M.referenceDesChauffes;
  test('la charge saisie fait foi, le plan est dit', () => {
    expect(R({ saisie: 100, plan: 90 })).toEqual({ charge: 100, source: 'saisie', plan: 90 });
  });
  test('sans saisie : la consigne figée ; sans consigne : rien', () => {
    expect(R({ saisie: null, plan: 90 })).toEqual({ charge: 90, source: 'plan', plan: 90 });
    expect(R({ saisie: null, plan: null })).toEqual({ charge: null, source: null, plan: null });
    expect(R({}).charge).toBeNull();
    expect(R().charge).toBeNull();
  });
  test('une charge nulle, négative ou absurde-non-nombre n’est pas une référence', () => {
    expect(R({ saisie: 0, plan: 90 }).source).toBe('plan');
    expect(R({ saisie: -20, plan: 90 }).source).toBe('plan');
    expect(R({ saisie: 'x', plan: null }).charge).toBeNull();
    expect(R({ saisie: 0, plan: -30 }).charge).toBeNull();
  });
  test('une charge de 500 kg tapée reste une référence (la vraisemblance tombe à la validation, 185)', () => {
    expect(R({ saisie: 500, plan: 90 }).charge).toBe(500);
  });
});

describe('règle 8-9 — la demande est la proposition, sans la raison, sans le silence', () => {
  const base = { equipement: 'barre', reference: 100, e1rm: 120, premier: true };
  test('barre 100 kg : 50 × 8 · 80 × 3', () => {
    const r = P(Object.assign({}, base, { demande: true }));
    expect(r.mode).toBe('demande');
    expect(r.raison).toBe('demande');
    expect(charges(r)).toEqual([50, 80]);
    expect(reps(r)).toEqual([8, 3]);
    expect(r.annulable).toBe(true);
  });
  test('I185 — mêmes charges et mêmes reps que la proposition quand elle existe', () => {
    [60, 80, 90, 100, 110, 140, 160, 180].forEach((ref) => {
      const a = P({ equipement: 'barre', reference: ref, e1rm: ref * 1.2, premier: true });
      const b = P({ equipement: 'barre', reference: ref, e1rm: ref * 1.2, premier: true, demande: true });
      expect(a.mode).toBe('proposer');
      expect(b.lignes).toEqual(a.lignes);
      expect(b.phrase).toBe(a.phrase);
    });
    ['machine', 'haltere', 'poulie', 'machine_smith'].forEach((eq) => {
      const x = { equipement: eq, reference: 60, e1rm: 80, premier: true, cran: 2.5 };
      expect(P(Object.assign({}, x, { demande: true })).lignes).toEqual(P(x).lignes);
    });
  });
  test('la demande ignore la règle 1 : un muscle déjà sollicité, une charge sous 60 % du max', () => {
    expect(P(Object.assign({}, base, { premier: false })).mode).toBe('rien');
    expect(P(Object.assign({}, base, { premier: false, demande: true })).lignes.length).toBeGreaterThan(0);
    expect(P(Object.assign({}, base, { e1rm: 300, demande: true })).lignes.length).toBeGreaterThan(0);
  });
  test('I187 — la demande ignore le silence ; la proposition, elle, se tait', () => {
    expect(P(Object.assign({}, base, { silence: true })).mode).toBe('rien');
    expect(P(Object.assign({}, base, { silence: true, demande: true })).lignes.length).toBe(2);
  });
  test('la demande ignore la règle 7 (isolation déjà échauffée) et l’ajout automatique', () => {
    const iso = { equipement: 'poulie', reference: 30, e1rm: 40, premier: true, premierExercice: false, isolation: true, dejaTravaille: true, cran: 2.5 };
    expect(P(iso).mode).toBe('rien');
    expect(P(Object.assign({}, iso, { demande: true })).lignes.length).toBeGreaterThan(0);
    expect(P(Object.assign({}, base, { ajoutees: 5, demande: true })).mode).toBe('demande');
  });
  test('I127 — « J’ai peu de temps » : une chauffe, même pour la demande', () => {
    [60, 100, 140].forEach((ref) => {
      expect(P({ equipement: 'barre', reference: ref, premier: false, peuDeTemps: true, demande: true }).lignes.length).toBe(1);
    });
  });
  test('sans référence : rien (I188) ; au poids du corps : la série facile', () => {
    expect(P({ equipement: 'barre', reference: null, premier: true, demande: true }).lignes).toEqual([]);
    expect(P({ equipement: 'barre', reference: 0, demande: true }).lignes).toEqual([]);
    expect(P({ equipement: 'aucun', corps: true, premier: false, demande: true }).lignes).toEqual([[null, 8]]);
  });
  test('rejeu des montées : crans du matériel, plancher, plafond 90 %, charge absurde', () => {
    const d = (eq, ref, extra) => P(Object.assign({ equipement: eq, reference: ref, premier: false, demande: true, cran: 2.5 }, extra || {}));
    expect(charges(d('barre', 90))).toEqual([50, 75]);
    expect(charges(d('barre', 110))).toEqual([40, 70, 90]);
    expect(charges(d('barre', 140))).toEqual([50, 90, 120]);
    expect(charges(d('barre', 160)).length).toBe(4);
    expect(charges(d('barre', 60))).toEqual([50]);
    expect(charges(d('haltere', 24, { cran: 2 }))).toEqual([20]);
    expect(charges(d('machine', 80, { cran: 2.5 }))).toEqual([35, 67.5]);
    const gros = d('barre', 500);
    expect(gros.lignes.length).toBeLessThanOrEqual(4);
    charges(gros).forEach((c, i) => { expect(c).toBeLessThanOrEqual(0.9 * 500 + 1e-9); if (i) expect(c).toBeGreaterThan(charges(gros)[i - 1]); });
    ['elastique', 'disque', 'kettlebell'].forEach((eq) => expect(d(eq, 30).lignes.length).toBeGreaterThanOrEqual(0));
  });
});

describe('le plan — la référence suit la saisie', () => {
  const SQ = { nom: 'Squat barre', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'],
    muscles_secondaires: ['ischio_jambiers'], muscles_stabilisateurs: ['bas_du_dos'] };
  const CAT = { squat_barre: SQ };
  const consigne = (charge) => ({ etat: 'progression', zone: 'force', palier: charge, niveau: 5, n: 3, ligne: { charge, vise: 5 }, haut: null, fondement: {} });
  const SILENCE = { etat: 'silence', raison: 'premiere_fois', palier: null, niveau: null, n: 3, ligne: null, haut: null, fondement: {} };
  let n0 = 0;
  const id = () => 'z' + (++n0);
  const seanceDe = (gestes, nSeries) => {
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'squat_barre', id, { series: nSeries || 3 });
    (gestes || []).forEach((g) => { se = S.noterGeste(se, g); });
    return se;
  };
  const tape = (se, iSerie, charge) => S.modifierSerie(se, 0, iSerie, { charge_kg: charge });
  const entrees = (se, extra) => Object.assign({
    seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: se.gestes || [] },
    consignes: { squat_barre: { consigne: consigne(90), libelles: M.libellesConsigne(consigne(90)), pas: null } },
    catalogue: CAT, reglage: null, paris: [], suites: {}, e1rms: { squat_barre: 140 }
  }, extra || {});
  const plan = (se, extra) => { const e = entrees(se, extra); const p = T.planDeSeance(e); return { e, p, x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs }; };
  const fantomesDeChauffe = (x) => x.lignes.filter((l) => l.type === 'echauffement').map((l) => l.fantome && l.fantome.charge);

  test('sans charge tapée : la référence est la consigne (90), source « plan »', () => {
    const r = plan(seanceDe());
    expect(r.x.chauffesReference).toEqual({ charge: 90, source: 'plan', plan: 90 });
    expect(r.x.proposition.reference).toBe(90);
    expect(r.x.surDemande.reference).toBe(90);
    expect(r.erreurs).toEqual([]);
  });

  test('I184 — la 1re charge tapée (100) devient la référence de la proposition, de la demande et du plan ; la ligne du coach ne bouge pas', () => {
    const r = plan(tape(seanceDe(), 0, 100));
    expect(r.x.chauffesReference).toEqual({ charge: 100, source: 'saisie', plan: 90 });
    expect(r.x.proposition.reference).toBe(100);
    expect(r.x.surDemande.reference).toBe(100);
    expect(r.x.surDemande.lignes).toEqual([[50, 8], [80, 3]]);
    expect(r.x.surDemande.lignes).toEqual(r.x.proposition.lignes);
    expect(r.x.consigne.ligne.charge).toBe(90);
    expect(r.erreurs).toEqual([]);
  });

  test('le Pourquoi de la carte dit d’où vient la charge, seulement quand elle diffère du plan', () => {
    expect(nb(plan(tape(seanceDe(), 0, 100)).x.proposition.pourquoi)).toMatch(/Calée sur ta 1re série, 100 kg\. Le plan disait 90 kg\./);
    expect(nb(plan(tape(seanceDe(), 0, 90)).x.proposition.pourquoi)).not.toMatch(/Calée sur/);
    expect(plan(seanceDe()).x.proposition.pourquoi).not.toMatch(/Calée sur/);
  });

  test('première ligne vide, deuxième tapée : on ne devine pas, la référence est celle du plan', () => {
    const r = plan(tape(seanceDe(), 1, 120));
    expect(r.x.chauffesReference).toEqual({ charge: 90, source: 'plan', plan: 90 });
  });

  test('une charge tapée sur la ligne de chauffe n’est pas la référence (c’est la 1re ligne de TRAVAIL)', () => {
    let se = S.insererChauffes(seanceDe(), 0, [[60, 8]], id);
    se = tape(se, 0, 60);
    const r = plan(se);
    expect(r.x.chauffesReference.charge).toBe(90);
  });

  test('exercice sans historique (consigne « silence ») : la saisie donne une référence, sans saisie rien (I188)', () => {
    const sansSaisie = plan(seanceDe(), { consignes: { squat_barre: { consigne: SILENCE, libelles: M.libellesConsigne(SILENCE), pas: null } }, e1rms: {} });
    expect(sansSaisie.x.chauffesReference).toBeNull();
    expect(sansSaisie.x.surDemande).toBeNull();
    expect(fantomesDeChauffe(sansSaisie.x)).toEqual([]);
    const avecSaisie = plan(tape(seanceDe(), 0, 100), { consignes: { squat_barre: { consigne: SILENCE, libelles: M.libellesConsigne(SILENCE), pas: null } }, e1rms: {} });
    expect(avecSaisie.x.chauffesReference).toEqual({ charge: 100, source: 'saisie', plan: null });
    expect(avecSaisie.x.surDemande.lignes).toEqual([[50, 8], [80, 3]]);
    expect(avecSaisie.erreurs).toEqual([]);
  });

  test('I189 — une occurrence que le coach ne suit pas (aucune consigne) : jamais de carte ; la demande calcule sur la saisie', () => {
    const sans = { consignes: {}, e1rms: {} };
    const rien = plan(seanceDe(), sans);
    expect(rien.x.proposition).toBeNull();
    expect(rien.x.surDemande).toBeNull();
    const r = plan(tape(seanceDe(), 0, 100), sans);
    expect(r.x.proposition).toBeNull();
    expect(r.x.surDemande.reference).toBe(100);
    expect(r.x.surDemande.lignes).toEqual([[50, 8], [80, 3]]);
    expect(r.erreurs).toEqual([]);
  });

  test('« J’ai mal » : pas de carte non plus ; la demande calcule', () => {
    const se = S.marquerDouleur(tape(seanceDe(), 0, 100), 0);
    expect(S.occurrenceDouloureuse(se.exercices[0])).toBe(true);
    const r = plan(se);
    expect(r.x.proposition).toBeNull();
    expect(r.x.surDemande.reference).toBe(100);
    expect(r.erreurs).toEqual([]);
  });

  test('I187 — le silence tait la carte, pas la demande', () => {
    const r = plan(tape(seanceDe(), 0, 100), { refusChauffes: { squat_barre: true } });
    expect(r.x.proposition).toBeNull();
    expect(r.x.surDemande.lignes).toEqual([[50, 8], [80, 3]]);
    expect(r.erreurs).toEqual([]);
  });

  test('aucune demande une fois une ligne de chauffe posée ou une série faite', () => {
    const avecLignes = plan(S.insererChauffes(tape(seanceDe(), 0, 100), 0, [[50, 8], [80, 3]], id));
    expect(avecLignes.x.surDemande).toBeNull();
    expect(avecLignes.x.proposition).toBeNull();
    let se = tape(seanceDe(), 0, 100);
    se = S.valider(S.modifierSerie(se, 0, 0, { charge_kg: 100, reps: 5 }), 0, 0, new Date('2026-10-20T10:05:00Z'));
    expect(plan(se).x.surDemande).toBeNull();
  });

  test('I185 — posée, la montée se remplit en fantôme sur la charge tapée ; rien n’est écrit dans une série', () => {
    const d = plan(tape(seanceDe(), 0, 100)).x.surDemande;
    let se = seanceDe([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }]);
    se = tape(se, 0, 100);
    se = S.insererChauffes(se, 0, d.lignes, id);
    const r = plan(se);
    expect(fantomesDeChauffe(r.x)).toEqual([50, 80]);
    const chauffes = se.exercices[0].series.filter((q) => S.typeDe(q) === 'echauffement');
    expect(chauffes.length).toBe(2);
    chauffes.forEach((q) => expect(q.charge_kg).toBeNull());
    expect(chauffes.map((q) => q.reps_visees)).toEqual([8, 3]);
    expect(r.x.chauffesReference.charge).toBe(100);
    expect(r.erreurs).toEqual([]);
  });

  test('la montée posée suit la charge quand on la change (aucune chauffe faite)', () => {
    let se = seanceDe([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }]);
    se = S.insererChauffes(tape(se, 0, 100), 0, [[50, 8], [80, 3]], id);
    expect(fantomesDeChauffe(plan(se).x)).toEqual([50, 80]);
    // la 1re ligne de travail est maintenant la ligne 2 (après les deux chauffes) : sa charge est la référence
    expect(plan(se).x.chauffesReference.charge).toBe(100);
    const lourd = plan(S.modifierSerie(se, 0, 2, { charge_kg: 140 }));
    expect(lourd.x.chauffesReference.charge).toBe(140);
    expect(fantomesDeChauffe(lourd.x).length).toBe(2);
    expect(fantomesDeChauffe(lourd.x)[1]).toBeGreaterThan(80);
    expect(lourd.erreurs).toEqual([]);
  });

  test('I186 — une chauffe faite reste figée ; les suivantes se recalent (au-dessus de la plus lourde faite, 90 % au plus)', () => {
    let se = seanceDe([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }]);
    se = S.insererChauffes(se, 0, [[50, 8], [80, 3], [null, null]], id);   // la 3e : « + Chauffe » après
    se = S.modifierSerie(se, 0, 3, { charge_kg: 100 });                     // 1re ligne de travail = la ligne 3
    se = S.valider(S.modifierSerie(se, 0, 0, { charge_kg: 50, reps: 8 }), 0, 0, new Date('2026-10-20T10:05:00Z'));
    se = S.valider(S.modifierSerie(se, 0, 1, { charge_kg: 80, reps: 3 }), 0, 1, new Date('2026-10-20T10:08:00Z'));
    const r = plan(se);
    const [a, b, c] = r.x.lignes.filter((l) => l.type === 'echauffement');
    expect(a.validee && b.validee).toBe(true);
    expect(c.fantome && c.fantome.charge).toBe(90);
    const r110 = plan(S.modifierSerie(se, 0, 3, { charge_kg: 110 }));
    const c110 = r110.x.lignes.filter((l) => l.type === 'echauffement')[2];
    expect(c110.fantome.charge).toBeGreaterThan(80);
    expect(c110.fantome.charge).toBeLessThanOrEqual(0.9 * 110 + 1e-9);
    // 85 : trop proche
    const r85 = plan(S.modifierSerie(se, 0, 3, { charge_kg: 85 }));
    const c85 = r85.x.lignes.filter((l) => l.type === 'echauffement')[2];
    expect(c85.fantome).toBeFalsy();
    expect(c85.chauffe.trop_proche).toBe(true);
    expect(r85.erreurs).toEqual([]);
    expect(r110.erreurs).toEqual([]);
  });

  test('I193 — en Entretenir (profil), le coach se tait tout entier : aucune demande, aucune montée', () => {
    // En Entretenir le coach ne calcule aucune consigne : le plan n'en reçoit pas, et le matériel de chauffe est nul.
    const r = plan(tape(seanceDe(), 0, 100), { intention: 'entretien', consignes: {}, e1rms: {} });
    expect(r.x.surDemande).toBeNull();
    expect(r.x.chauffesReference).toBeNull();
    expect(r.x.proposition).toBeNull();
    expect(fantomesDeChauffe(r.x).every((v) => v === null || v === undefined)).toBe(true);
    expect(r.erreurs).toEqual([]);
  });

  test('élastique, lest, poids du corps : pas de montée calculée sur la saisie', () => {
    const catEl = { squat_barre: Object.assign({}, SQ, { equipement: 'elastique' }) };
    expect(plan(tape(seanceDe(), 0, 100), { catalogue: catEl }).x.surDemande).toBeNull();
  });
});

describe('I190 — « Annuler » pour les trois sources ; I130 complété', () => {
  const SQ = { nom: 'Squat barre', equipement: 'barre', mesure: 'charge_reps', muscles_primaires: ['quadriceps', 'fessiers'],
    muscles_secondaires: ['ischio_jambiers'], muscles_stabilisateurs: ['bas_du_dos'] };
  const consigne = (charge) => ({ etat: 'progression', zone: 'force', palier: charge, niveau: 5, n: 3, ligne: { charge, vise: 5 }, haut: null, fondement: {} });
  let n0 = 0;
  const id = () => 'y' + (++n0);
  const seanceDe = (gestes) => {
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'squat_barre', id, { series: 3 });
    (gestes || []).forEach((g) => { se = S.noterGeste(se, g); });
    return se;
  };
  const entrees = (se, extra) => Object.assign({
    seance: { id: 'S1', debut: '2026-10-20T10:00:00+00:00', edition: false, exercices: se.exercices, gestes: se.gestes || [] },
    consignes: { squat_barre: { consigne: consigne(90), libelles: M.libellesConsigne(consigne(90)), pas: null } },
    catalogue: { squat_barre: SQ }, reglage: null, paris: [], suites: {}, e1rms: { squat_barre: 140 }
  }, extra || {});
  const plan = (se, extra) => { const e = entrees(se, extra); const p = T.planDeSeance(e); return { e, p, x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs }; };
  const pose = (g, saisie) => {
    let se = seanceDe(g);
    if (saisie) se = S.modifierSerie(se, 0, 0, { charge_kg: saisie });
    return S.insererChauffes(se, 0, [[50, 8], [80, 3]], id);
  };

  test('après « Ajouter » ou « + Chauffe » : « Montée posée sur ta 1re série : 100 kg. » et « Annuler »', () => {
    const r = plan(pose([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }], 100));
    expect(r.x.chauffesPosees).toEqual(expect.objectContaining({ slug: 'squat_barre', annuler: 'Annuler', origine: 'posee' }));
    expect(nb(r.x.chauffesPosees.texte)).toBe('Montée posée sur ta 1re série : 100 kg.');
    expect(r.erreurs).toEqual([]);
  });
  test('référence du plan : « Montée posée sur ta charge de travail : 90 kg. »', () => {
    const r = plan(pose([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }], null));
    expect(nb(r.x.chauffesPosees.texte)).toBe('Montée posée sur ta charge de travail : 90 kg.');
  });
  test('l’ajout automatique garde sa phrase, avec l’origine « auto »', () => {
    const r = plan(pose([{ geste: 'chauffes_auto', slug: 'squat_barre' }], null));
    expect(r.x.chauffesPosees).toEqual(expect.objectContaining({ origine: 'auto', texte: 'Chauffe ajoutée, comme d’habitude.', annuler: 'Annuler' }));
  });
  test('annulé : plus rien ; reposé après l’annulation : « Annuler » revient (le dernier geste fait foi)', () => {
    const annule = plan(pose([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }, { geste: 'chauffes_annulees', slug: 'squat_barre' }], 100));
    expect(annule.x.chauffesPosees).toBeNull();
    const repose = plan(pose([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }, { geste: 'chauffes_annulees', slug: 'squat_barre' },
      { geste: 'chauffes_ajoutees', slug: 'squat_barre' }], 100));
    expect(repose.x.chauffesPosees).not.toBeNull();
    expect(repose.erreurs).toEqual([]);
  });
  test('plus aucune chauffe à faire : plus d’« Annuler »', () => {
    let se = pose([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }], 100);
    se = S.valider(S.modifierSerie(se, 0, 0, { charge_kg: 50, reps: 8 }), 0, 0, new Date('2026-10-20T10:05:00Z'));
    se = S.valider(S.modifierSerie(se, 0, 1, { charge_kg: 80, reps: 3 }), 0, 1, new Date('2026-10-20T10:08:00Z'));
    expect(plan(se).x.chauffesPosees).toBeNull();
  });
  test('I190 forgé — des chauffes posées sans « Annuler » sont attrapées', () => {
    const r = plan(pose([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }], 100));
    const p = JSON.parse(JSON.stringify(r.p));
    p.exercices[0].chauffesPosees = null;
    expect(T.verifierPlan(p, r.e).erreurs.join('\n')).toMatch(/I190/);
  });
  test('I130 complété — la phrase du silence se retire dès qu’une ligne de chauffe est posée', () => {
    const gs = [{ geste: 'chauffes_silence', slug: 'squat_barre' }];
    const seul = plan(seanceDe(gs), { refusChauffes: { squat_barre: true } });
    expect(seul.x.silenceChauffes).not.toBeNull();
    const posee = plan(pose(gs.concat([{ geste: 'chauffes_ajoutees', slug: 'squat_barre' }]), 100), { refusChauffes: { squat_barre: true } });
    expect(posee.x.silenceChauffes).toBeNull();
    expect(posee.erreurs).toEqual([]);
    expect(seul.erreurs).toEqual([]);
  });
});

describe('I184 — aucune copie de la référence', () => {
  const fs = require('fs'), path = require('path');
  const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2/js', f), 'utf8');
  test('plan.js ne lit plus la consigne seule pour les chauffes ; ni app.js ni rendu.js ne calculent une charge de chauffe', () => {
    expect(lire('plan.js')).not.toMatch(/var\s+reference\s*=\s*consigne\s*&&\s*consigne\.etat/);
    ['app.js', 'rendu.js'].forEach((f) => expect(lire(f)).not.toMatch(/referenceDesChauffes|paliersDeChauffe|CHAUFFE_VISEE/));
  });
});
