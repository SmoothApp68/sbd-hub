/** @jest-environment node */
//
// Prérequis d'« adapter la séance » (04/10/2026) — cinq défauts des gestes
// existants, un test (au moins) par correction :
//
//   1. le remplaçant reçoit les lignes que l'ancien n'a pas encore faites,
//      avec leurs types, et rien de plus ;
//   2. un même exercice deux fois dans la séance, sans paris mélangés : le
//      coach suit la première occurrence, les suivantes sont libres, et
//      l'occurrence entre dans l'identifiant du pari ;
//   3. supprimer un exercice nettoie ses observations sur l'appareil ;
//   4. I4 suit les exercices par identifiant d'occurrence, plus par position ;
//   5. répondre à la carte du lest ne recalcule que l'exercice concerné.
//
// ⚠️ CONFIGURATIONS DISCRIMINANTES : 3 séries faites sur 4 (avant : 7 lignes) ;
// une seconde occurrence qui devient la première (l'autre supprimée) — c'est
// là que deux paris partageaient un identifiant ; un exercice déplacé APRÈS un
// autre (par position, I4 comparait deux exercices différents et se taisait) ;
// un exercice dont la consigne est figée à côté de celui qui porte la carte.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const FANTOME = require('./fixtures/cas-49u2-fantome.json');
const F044 = FANTOME.cas.find((x) => x.id === 'F044');
const CONSIGNE = { etat: F044.consigne.etat, zone: F044.consigne.zone === null ? null : F044.consigne.zone.nom,
  palier: F044.consigne.palier, n: F044.consigne.n, ligne: F044.consigne.ligne, haut: F044.consigne.haut };

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

const QUAND = new Date('2026-10-04T10:30:00Z');
function decor(slugs, n) {
  let k = 0;
  const id = () => 'p-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: n || 4 }); });
  return { se, id };
}
const faire = (se, i, j, kg, reps) =>
  S.valider(S.modifierSerie(se, i, j, { charge_kg: kg, reps: reps }), i, j, QUAND);

// Les entrées du plan, comme l'app les donne : la consigne de `x`, figée, et
// les paris de la séance.
const entreesDe = (se, paris) => ({
  seance: { id: 'S', debut: '2026-10-04T10:00:00Z', edition: false, exercices: se.exercices },
  consignes: { x: { consigne: CONSIGNE, contexte: F044.contexte } }, reglage: 'normal', paris: paris.slice()
});
// Valide une série et écrit son pari comme l'app l'écrit (le plan le porte).
function validerEtParier(etat, i, j, kg, reps) {
  etat.se = faire(etat.se, i, j, kg, reps);
  const q = (T.planDeSeance(entreesDe(etat.se, etat.paris)).exercices[i].paris || [])[j];
  if (q) etat.paris.push(Object.assign({}, q, { id: 'pari-' + etat.paris.length, set_observe: etat.se.exercices[i].series[j].id }));
  return q;
}

// ══ 1. LE REMPLAÇANT REÇOIT LES LIGNES RESTANTES ═════════════════════════════

describe('1 — le remplaçant prend les lignes que l’ancien n’a pas faites, et rien de plus', () => {
  test('⚠️ DISCRIMINANT — 3 séries faites sur 4 : l’ancien garde ses 3, le remplaçant en reçoit 1 (4 lignes, pas 7)', () => {
    let { se, id } = decor(['x'], 4);
    [0, 1, 2].forEach((j) => { se = faire(se, 0, j, 100, 5); });
    se = S.remplacerExercice(se, 0, 'y', id);
    expect(se.exercices.map((e) => e.exercise_slug)).toEqual(['x', 'y']);
    expect(se.exercices[0].series).toHaveLength(3);
    expect(se.exercices[1].series).toHaveLength(1);
    expect(se.exercices[1].series[0]).toMatchObject({ type_serie: 'travail', charge_kg: null, reps: null, validee_a: null });
    expect(se.exercices.reduce((a, e) => a + e.series.length, 0)).toBe(4);
  });

  test('les types suivent, chauffes NON FAITES comprises ; les faites restent à l’ancien ; des lignes neuves', () => {
    let { se, id } = decor(['x'], 5);
    se = S.changerType(se, 0, 0, 'echauffement');
    se = S.changerType(se, 0, 1, 'echauffement');
    se = S.changerType(se, 0, 4, 'degressive');
    // La première chauffe et la première série de travail sont faites.
    se = faire(se, 0, 0, 40, 10);
    se = faire(se, 0, 2, 100, 5);
    const anciens = se.exercices[0].series.map((s) => s.id);
    se = S.remplacerExercice(se, 0, 'y', id);
    expect(se.exercices[0].series.map((s) => s.type_serie)).toEqual(['echauffement', 'travail']);
    expect(se.exercices[1].series.map((s) => s.type_serie)).toEqual(['echauffement', 'travail', 'degressive']);
    expect(se.exercices[1].series.every((s) => s.validee_a === null && s.charge_kg === null)).toBe(true);
    expect(se.exercices[1].series.some((s) => anciens.indexOf(s.id) >= 0)).toBe(false);
  });

  test('rien de fait : l’ancien disparaît, le remplaçant reprend toutes ses lignes, avec leurs types', () => {
    let { se, id } = decor(['x'], 3);
    se = S.changerType(se, 0, 0, 'echauffement');
    se = S.remplacerExercice(se, 0, 'y', id);
    expect(se.exercices.map((e) => e.exercise_slug)).toEqual(['y']);
    expect(se.exercices[0].series.map((s) => s.type_serie)).toEqual(['echauffement', 'travail', 'travail']);
  });

  test('tout est fait : le remplaçant reçoit une ligne (un exercice sans ligne ne se saisit pas)', () => {
    let { se, id } = decor(['x'], 2);
    se = faire(faire(se, 0, 0, 100, 5), 0, 1, 100, 5);
    se = S.remplacerExercice(se, 0, 'y', id);
    expect(se.exercices[1].series).toHaveLength(1);
  });

  test('« faite » se lit comme partout (`partEnBase`) : une série importée, sans `validee_a`, reste à l’ancien', () => {
    let { se, id } = decor(['x'], 3);
    se.exercices[0].series[0] = Object.assign({}, se.exercices[0].series[0], { source: 'import', charge_kg: 80, reps: 8 });
    se = S.remplacerExercice(se, 0, 'y', id);
    expect(se.exercices[0].series).toHaveLength(1);
    expect(se.exercices[1].series).toHaveLength(2);
  });
});

// ══ 2. UN MÊME EXERCICE DEUX FOIS, SANS PARIS MÉLANGÉS ═══════════════════════

describe('2 — l’occurrence : posée une fois, gardée quoi qu’on fasse', () => {
  test('chaque exercice reçoit son identifiant d’occurrence, distinct même pour un exercice présent deux fois', () => {
    const { se } = decor(['x', 'y', 'x']);
    const occ = se.exercices.map((e) => e.occurrence);
    expect(occ.every((o) => typeof o === 'string' && o.length > 2)).toBe(true);
    expect(new Set(occ).size).toBe(3);
  });

  test('déplacer, retirer la première série, remplacer un voisin : l’identifiant ne bouge pas', () => {
    let { se, id } = decor(['x', 'y', 'x']);
    const [a, b, c] = se.exercices.map((e) => e.occurrence);
    se = S.deplacerVers(se, [2], 0);
    expect(se.exercices.map((e) => e.occurrence)).toEqual([c, a, b]);
    se = S.retirerSerie(se, 0, 0);
    expect(se.exercices[0].occurrence).toBe(c);
    se = S.remplacerExercice(se, 2, 'z', id);
    expect(se.exercices[0].occurrence).toBe(c);
    expect(se.exercices[1].occurrence).toBe(a);
    expect([a, b, c].indexOf(se.exercices[2].occurrence)).toBe(-1);
  });

  test('`occurrenceCoachee` : la première dans l’ordre, tant qu’aucune n’a de pari ; -1 sans l’exercice', () => {
    const { se } = decor(['y', 'x', 'x']);
    expect(S.occurrenceCoachee(se, 'x', [])).toBe(1);
    expect(S.occurrenceCoachee(se, 'w', [])).toBe(-1);
  });
});

describe('2 — le coach suit la première occurrence ; les suivantes sont libres', () => {
  test('⚠️ DISCRIMINANT — la seconde occurrence n’a ni consigne, ni ligne du coach, ni pari ; ses séries faites n’en écrivent aucun', () => {
    const etat = decor(['x', 'x']);
    etat.paris = [];
    // La SECONDE d'abord : si elle était coachée, elle écrirait un pari.
    const q2 = validerEtParier(etat, 1, 0, 50, 8);
    expect(q2).toBeFalsy();
    const q1 = validerEtParier(etat, 0, 0, 50, 8);
    expect(q1).toBeTruthy();
    const p = T.planDeSeance(entreesDe(etat.se, etat.paris));
    expect(p.exercices[0].consigne).toBeTruthy();
    expect(p.exercices[1].consigne).toBe(null);
    expect(p.exercices[1].lignes.every((l) => l.role === 'hors')).toBe(true);
    expect((p.exercices[1].paris || []).filter(Boolean)).toEqual([]);
    expect(p.exercices[1].entete).toBeFalsy();
    // Le pari de la première dit SON occurrence.
    expect(q1.fondement.occurrence).toBe(etat.se.exercices[0].occurrence);
    expect(T.verifierPlan(p, entreesDe(etat.se, etat.paris)).erreurs).toEqual([]);
  });

  test('la seconde devient la première quand l’autre part : coachée, avec SES paris, jamais ceux de l’autre', () => {
    const etat = decor(['x', 'x']);
    etat.paris = [];
    validerEtParier(etat, 0, 0, 50, 8);
    validerEtParier(etat, 0, 1, 50, 6);
    const occB = etat.se.exercices[1].occurrence;
    etat.se = S.retirerExercices(etat.se, [0]);
    const e = entreesDe(etat.se, etat.paris);
    const p = T.planDeSeance(e);
    expect(p.exercices[0].consigne).toBeTruthy();
    // Aucune de ses lignes n'est figée par les paris de l'occurrence partie.
    expect(p.exercices[0].lignes.some((l) => l.figee)).toBe(false);
    const q = validerEtParier(etat, 0, 0, 50, 8);
    expect(q.fondement.occurrence).toBe(occB);
    expect(q.fondement.rang).toBe(1);
    expect(T.verifierPlan(T.planDeSeance(entreesDe(etat.se, etat.paris)), entreesDe(etat.se, etat.paris)).erreurs).toEqual([]);
  });
});

describe('2 — l’occurrence coachée ne change pas quand l’autre passe au-dessus', () => {
  test('⚠️ DISCRIMINANT — la seconde, remontée en tête, reste libre : le coach reste sur celle qui porte ses paris, ses lignes figées aussi', () => {
    const etat = decor(['x', 'y', 'x']);
    etat.paris = [];
    validerEtParier(etat, 0, 0, 50, 8);
    validerEtParier(etat, 0, 1, 50, 6);
    const avant = T.planDeSeance(entreesDe(etat.se, etat.paris));
    const occA = etat.se.exercices[0].occurrence;
    etat.se = S.deplacerVers(etat.se, [2], 0);
    expect(S.occurrenceCoachee(etat.se, 'x', etat.paris)).toBe(1);
    const e = entreesDe(etat.se, etat.paris);
    const p = T.planDeSeance(e);
    expect(p.exercices[0].consigne).toBe(null);
    expect(p.exercices[1].occurrence).toBe(occA);
    expect(p.exercices[1].lignes.filter((l) => l.figee)).toHaveLength(2);
    expect(T.verifierPlan(p, e, avant).erreurs).toEqual([]);
  });
});

describe('2 — `parisDeLOccurrence` : à qui est un pari', () => {
  const { se } = decor(['x', 'x', 'y']);
  const [A, B] = se.exercices;
  const pari = (o) => Object.assign({ id: 'p', exercise_slug: 'x', set_observe: null },
    { fondement: Object.assign({ seance: 'S', rang: 1 }, o) }, o.set_observe !== undefined ? { set_observe: o.set_observe } : {});
  const a = (paris, i) => S.parisDeLOccurrence(paris, se, i).length;

  test('une occurrence connue : à elle, et à elle seule', () => {
    const l = [pari({ occurrence: B.occurrence })];
    expect([a(l, 0), a(l, 1)]).toEqual([0, 1]);
  });
  test('inconnue (séance reprise : identifiants neufs) ou absente : la série observée dit à qui il est', () => {
    expect([a([pari({ occurrence: 'o-ailleurs', set_observe: B.series[0].id })], 0),
            a([pari({ occurrence: 'o-ailleurs', set_observe: B.series[0].id })], 1)]).toEqual([0, 1]);
    expect([a([pari({ set_observe: B.series[1].id })], 0), a([pari({ set_observe: B.series[1].id })], 1)]).toEqual([0, 1]);
  });
  test('sans série observée : un pari d’avant la règle est à la première ; celui d’une occurrence partie, à personne', () => {
    expect([a([pari({})], 0), a([pari({})], 1)]).toEqual([1, 0]);
    expect([a([pari({ occurrence: 'o-partie' })], 0), a([pari({ occurrence: 'o-partie' })], 1)]).toEqual([0, 0]);
  });
  test('jamais le pari d’un autre exercice, ni d’une autre séance', () => {
    expect(a([pari({ occurrence: A.occurrence, seance: 'S2' })], 0)).toBe(0);
    expect(S.parisDeLOccurrence([Object.assign(pari({}), { exercise_slug: 'y' })], se, 0)).toEqual([]);
  });
});

describe('2 — l’occurrence entre dans l’identifiant du pari ; aucun pari en base n’en change', () => {
  // La formule, recalculée ici sans le moteur : SHA-256 du nom, 16 octets,
  // version 5 et variante RFC 4122.
  const uuidDuNom = (nom) => {
    const o = crypto.createHash('sha256').update(nom, 'utf8').digest().subarray(0, 16);
    o[6] = (o[6] & 0x0f) | 0x50;
    o[8] = (o[8] & 0x3f) | 0x80;
    const h = o.toString('hex');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };
  const SID = '00000000-0000-4000-8000-000000000049';

  test('⚠️ sans occurrence (tout pari déjà en base) : la valeur figée d’avant, à l’octet', async () => {
    await expect(M.idDePrediction(SID, 'squat_barre', 2)).resolves.toBe('b9b7a693-794e-5b79-86f6-8194e29043ee');
    await expect(M.idDePrediction(SID, 'squat_barre', 2, 0, undefined)).resolves.toBe('b9b7a693-794e-5b79-86f6-8194e29043ee');
    await expect(M.idDePrediction(SID, 'squat_barre', 2, 1, null)).resolves.toBe(uuidDuNom(SID + '|squat_barre|2|1'));
  });

  test('⚠️ DISCRIMINANT — deux occurrences, même séance, même rang, même révision : deux identifiants', async () => {
    const a = await M.idDePrediction(SID, 'squat_barre', 1, 0, 'o-a');
    const b = await M.idDePrediction(SID, 'squat_barre', 1, 0, 'o-b');
    expect(a).not.toBe(b);
    expect(a).toBe(uuidDuNom(SID + '|squat_barre|1|o=o-a'));
    expect(await M.idDePrediction(SID, 'squat_barre', 1, 2, 'o-a')).toBe(uuidDuNom(SID + '|squat_barre|1|2|o=o-a'));
    expect(a).not.toBe(await M.idDePrediction(SID, 'squat_barre', 1));
  });
});

describe('2 — « déjà noté » se demande aux paris de l’occurrence (app.js)', () => {
  function bac(se, predictions) {
    const ctx = { seance: se, local: { predictions }, notesEnCours: {}, Seance: S };
    vm.createContext(ctx);
    ['revisionDe', 'cleNote', 'dejaNote'].forEach((n) => vm.runInContext(extraire(n), ctx));
    return ctx;
  }

  test('⚠️ DISCRIMINANT — la première occurrence supprimée, la seconde (devenue première) n’est pas « déjà notée »', () => {
    const etat = decor(['x', 'x']);
    etat.paris = [];
    validerEtParier(etat, 0, 0, 50, 8);
    const avec = bac(etat.se, etat.paris);
    expect(vm.runInContext('dejaNote(0, "x", 0, 1)', avec)).toBe(true);
    const apres = bac(S.retirerExercices(etat.se, [0]), etat.paris);
    expect(vm.runInContext('dejaNote(0, "x", 0, 1)', apres)).toBe(false);
  });

  test('la clé d’une note en cours porte l’occurrence', () => {
    const { se } = decor(['x', 'x']);
    const c = bac(se, []);
    expect(vm.runInContext('cleNote(0, "x", 0, 1)', c)).not.toBe(vm.runInContext('cleNote(1, "x", 0, 1)', c));
  });
});

// ══ 3. SUPPRIMER UN EXERCICE NETTOIE SES OBSERVATIONS ════════════════════════

describe('3 — supprimer un exercice nettoie ses observations sur l’appareil ; les paris restent', () => {
  test('⚠️ DISCRIMINANT — les observations des séries de l’exercice supprimé se vident ; celles du voisin non', async () => {
    const etat = decor(['x', 'y']);
    const sx = etat.se.exercices[0].series, sy = etat.se.exercices[1].series;
    const obs = (id, serie) => ({ id, exercise_slug: serie === sx ? 'x' : 'y', fondement: { seance: 'S', rang: 1 },
      set_observe: serie[0].id, valeur_observee: 8, observee_a: '2026-10-04T10:31:00Z' });
    const predictions = [obs('px', sx), obs('py', sy),
      { id: 'libre', exercise_slug: 'x', fondement: { seance: 'S', rang: 2 }, set_observe: null }];
    const ecrits = [], poses = [];
    const ctx = { seance: etat.se, local: { predictions },
      Cache: { ecrireLot: async (t, l) => { ecrits.push([t, l.map((x) => x.id)]); } },
      poserObservation: async (l) => { poses.push(l.id); } };
    vm.createContext(ctx);
    ['oublierObservationDe', 'oublierObservationsDesExercices', 'oublierObservationsDesSeries',
      'viderObservationsEnMemoire', 'ecrireObservationsVidees']
      .forEach((n) => vm.runInContext(extraire(n), ctx));
    const vidage = vm.runInContext('oublierObservationsDesExercices([0])', ctx);
    // La copie locale est vidée DÈS l'appel, avant le redessin.
    const px = ctx.local.predictions.find((l) => l.id === 'px');
    expect([px.set_observe, px.valeur_observee, px.observee_a]).toEqual([null, null, null]);
    await vidage;
    expect(ctx.local.predictions).toHaveLength(3);
    expect(ctx.local.predictions.find((l) => l.id === 'py').set_observe).toBe(sy[0].id);
    expect(ecrits).toEqual([['predictions', ['px']]]);
    expect(poses).toEqual(['px']);
  });

  test('la suppression d’une série passe par le même nettoyage', async () => {
    const etat = decor(['x']);
    const s0 = etat.se.exercices[0].series[0];
    const ctx = { seance: etat.se, local: { predictions: [{ id: 'p', set_observe: s0.id, valeur_observee: 8 }] },
      Cache: { ecrireLot: async () => {} }, poserObservation: async () => {} };
    vm.createContext(ctx);
    ['oublierObservationDe', 'oublierObservationsDesSeries', 'viderObservationsEnMemoire', 'ecrireObservationsVidees'].forEach((n) => vm.runInContext(extraire(n), ctx));
    await vm.runInContext('oublierObservationDe(0, 0)', ctx);
    expect(ctx.local.predictions[0].set_observe).toBe(null);
  });
});

// ══ 4. I4 PAR IDENTIFIANT ════════════════════════════════════════════════════

describe('4 — I4 suit l’exercice par son identifiant, plus par sa position', () => {
  const copie = (x) => JSON.parse(JSON.stringify(x));
  const erreursI4 = (v) => v.erreurs.filter((x) => x.indexOf('I4 —') === 0);
  const etat = decor(['x', 'y']);
  etat.paris = [];
  validerEtParier(etat, 0, 0, 50, 8);
  validerEtParier(etat, 0, 1, 50, 6);
  const avant = T.planDeSeance(entreesDe(etat.se, etat.paris));
  const deplacee = S.deplacerVers(etat.se, [0], 2);
  const apres = T.planDeSeance(entreesDe(deplacee, etat.paris));

  test('prémisse : x est descendu sous y, ses deux lignes faites restent figées', () => {
    expect(apres.exercices.map((x) => x.slug)).toEqual(['y', 'x']);
    expect(apres.exercices[1].lignes.slice(0, 2).every((l) => l.figee)).toBe(true);
  });

  test('déplacer ne suspend plus I4 : le plan juste passe', () => {
    expect(erreursI4(T.verifierPlan(apres, undefined, avant))).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — une ligne figée modifiée APRÈS le déplacement est attrapée', () => {
    const f = copie(apres);
    f.exercices[1].lignes[1].charge = 45;
    expect(erreursI4(T.verifierPlan(f, undefined, avant)).join(' ')).toMatch(/charge \d+(\.\d+)? → 45/);
    const g = copie(apres);
    g.exercices[1].lignes[0].figee = false;
    expect(erreursI4(T.verifierPlan(g, undefined, avant)).join(' ')).toMatch(/figée avant, plus maintenant/);
  });

  test('et entre deux plans de la même séance (garde de l’app, `verifierPlan(plan, entrées, avant)`)', () => {
    const f = copie(apres);
    f.exercices[1].lignes[1].charge = 45;
    expect(erreursI4(T.verifierPlan(f, entreesDe(deplacee, etat.paris), avant)).length).toBeGreaterThan(0);
  });
});

// ══ 5. LA RÉPONSE AU LEST NE RECALCULE QUE SON EXERCICE ═══════════════════════

describe('5 — répondre à la carte du lest ne recalcule que l’exercice qui l’attendait (app.js)', () => {
  function bac(o) {
    const calculs = [];
    const routines = {};
    const ctx = {
      seance: { id: 'S', debut: '2026-10-04T10:00:00Z' },
      profil: { intention: 'progresser', lest_reponse: null },
      Profil: { rythmeDe: () => 'normal', salleDeLExercice: () => null },   // 108 — la salle (aucune ici)
      consignes: null, consignesSauvees: (o && o.sauvees) || null, versionConsignes: 0,
      local: { exercices: [{ slug: 'squat' }, { slug: 'tractions' }] },
      Modele: { indexerExercices: (l) => { const r = {}; (l || []).forEach((e) => { r[e.slug] = e; }); return r; } },
      etatsExercices: {},
      // 58-1 : les séances d'un exercice viennent du module des faits.
      faits: { seancesDeLExercice: (c, slug) => ({ slug }) }, corpus: () => ({}),
      routineAFiger: (slug) => { routines[slug] = (routines[slug] || 0) + 1; return routines[slug] === 1 ? 3 : 99; },
      sauverConsignes: () => {},
      // 111 — la ligne dégressive de la routine, figée avec la consigne : aucune ici.
      aUneLigneDegressive: () => false,
      freresPourLeMoteur: () => [],
      Moteur: { consigneDExercice: (g, e, d, opt) => {
        calculs.push(g.slug);
        const etat = g.slug === 'tractions' ? (opt.lestReponse === null ? 'carte_lest' : 'etirement_reps') : 'palier';
        return { consigne: { etat, calcul: calculs.length } };
      } },
      calculs
    };
    vm.createContext(ctx);
    // 132 : l'historique et l'état que le moteur lit (`groupesDuMoteur`, `etatDuMoteur` : tels quels sans élastiques).
    ['estSalleElastique', 'groupesDuMoteur', 'etatDuMoteur', 'lestReponseDe', 'cleConsignes', 'cleSauveeValable', 'consigneDe']
      .forEach((n) => vm.runInContext(extraire(n), ctx));
    // 175 : la réponse au lest d'un exercice (`lestReponseDeLExercice`) est celle du profil tant qu'aucune variante n'a été répondue.
    vm.runInContext('function lestReponseDeLExercice(slug) { return lestReponseDe(); }', ctx);
    vm.runInContext('function optionsDeConsigne(slug) { return { lestReponse: lestReponseDe() }; }', ctx);
    vm.runInContext('function instantDuCalcul() { return "2026-10-28T10:00:00.000Z"; }', ctx);   // 179 (B-B7)
    return ctx;
  }

  test('⚠️ DISCRIMINANT — la réponse recalcule la consigne en carte du lest, et elle seule ; l’autre reste figée', () => {
    const c = bac();
    const squat1 = vm.runInContext('consigneDe("squat")', c);
    const tr1 = vm.runInContext('consigneDe("tractions")', c);
    expect(tr1.consigne.etat).toBe('carte_lest');
    expect(tr1.seriesRoutine).toBe(3);
    c.profil.lest_reponse = 'non';
    const squat2 = vm.runInContext('consigneDe("squat")', c);
    const tr2 = vm.runInContext('consigneDe("tractions")', c);
    expect(squat2).toBe(squat1);
    expect(tr2.consigne.etat).toBe('etirement_reps');
    // Les séries de sa routine restent celles figées à l'ouverture.
    expect(tr2.seriesRoutine).toBe(3);
    expect(c.calculs).toEqual(['squat', 'tractions', 'tractions']);
    // Et ensuite, plus rien ne bouge.
    vm.runInContext('consigneDe("tractions"); consigneDe("squat")', c);
    expect(c.calculs).toHaveLength(3);
  });

  test('sans réponse, rien ne se recalcule (la carte tient sa ligne)', () => {
    const c = bac();
    vm.runInContext('consigneDe("tractions"); consigneDe("tractions")', c);
    expect(c.calculs).toEqual(['tractions']);
  });

  test('une consigne sauvée sous l’ancienne clé (réponse au lest en dernier) vaut encore : une mise à jour ne défige rien', () => {
    const figee = { consigne: { etat: 'palier', calcul: 0 } };
    const c = bac({ sauvees: { seanceId: 'S', cle: 'S|progresser|normal|null', parSlug: { squat: figee } } });
    expect(vm.runInContext('consigneDe("squat")', c)).toBe(figee);
    expect(c.calculs).toEqual([]);
    const d = bac({ sauvees: { seanceId: 'S', cle: 'S|entretien|normal|null', parSlug: { squat: figee } } });
    expect(vm.runInContext('consigneDe("squat")', d)).not.toBe(figee);
  });
});
