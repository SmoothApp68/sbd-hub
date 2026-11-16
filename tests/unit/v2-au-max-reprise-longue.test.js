/** @jest-environment node */
//
// 16/11/2026 — « AU MAX » EN REPRISE LONGUE (MOTEUR §9.30, delta ; I207). La séance de reprise longue d'un exercice (`Moteur.enRepriseLongue`, la
// consigne `reprise_longue`) affiche « garde 2 » au plancher (§9.9, I206) : la dernière série « Au max » ne va donc jamais à l'échec (réserve ≥ 2),
// comme pour les 65 ans et plus connus (I150). La consigne vient du VRAI chemin (`consigneDExercice` : au moins 2 séances anciennes, la dernière à plus de 84 jours).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const B = require('../../v2/js/modele.js').BARRES;
const sp = (t) => String(t).replace(/[  ]/g, ' ');

// ── la consigne réelle ────────────────────────────────────────────────────────
let n = 0;
const DC = 'developpe_couche_barre';
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: DC });
const grp = (d, kg, reps) => ({ seance: { id: 'H' + d, debut: new Date(d).toISOString() }, series: reps.map((r) => brute(kg, r)) });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'franc', edition: false };
const HISTO = [grp('2026-03-23T17:00:00Z', 60, [6, 6, 6]), grp('2026-03-30T17:00:00Z', 65, [6, 6, 6]), grp('2026-04-06T17:00:00Z', 70, [6, 6, 6]), grp('2026-04-13T17:00:00Z', 70, [5, 8, 2])];
const REPRISE = M.consigneDExercice(HISTO, undefined, '2026-11-16T17:00:00Z', Object.assign({}, OPT, { correction: 'hypertrophie' })).consigne;
const RECENT = M.consigneDExercice([grp('2026-11-02T17:00:00Z', 70, [8, 8, 8]), grp('2026-11-09T17:00:00Z', 70, [8, 8, 8])], undefined, '2026-11-16T17:00:00Z', OPT).consigne;

test('la fixture déclenche VRAIMENT la reprise longue (et le témoin non)', () => {
  expect(REPRISE.etat).toBe('reprise_longue');
  expect(M.enRepriseLongue(REPRISE)).toBe(true);
  expect(M.enRepriseLongue(RECENT)).toBe(false);
});

describe('Moteur.auMaxDe — repriseLongue', () => {
  const couche = { objectif: 'muscle', debutant: false, famille: B[1], equipement: 'barre', isolation: false };
  test('jamais l’échec : « en gardant 2 reps » ; absent ou faux : rien ne change', () => {
    expect(M.auMaxDe(Object.assign({}, couche, { repriseLongue: true }))).toMatchObject({ pose: 'defaut', reserve: 2, sorte: 'garde', avecPareur: false });
    expect(M.auMaxDe(couche).reserve).toBe(0);
    expect(M.auMaxDe(Object.assign({}, couche, { repriseLongue: false })).reserve).toBe(0);
  });
  test('une marque de la personne reste respectée, au plancher de 2 ; la réserve de 3 n’est pas abaissée', () => {
    expect(M.auMaxDe(Object.assign({}, couche, { repriseLongue: true, objectif: 'force', main: true }))).toMatchObject({ pose: 'main', reserve: 2, sorte: 'garde' });
    expect(M.auMaxDe(Object.assign({}, couche, { repriseLongue: true, famille: B[2], objectif: 'muscle' })).reserve).toBe(2);
  });
});

// ── le plan ──────────────────────────────────────────────────────────────────
const seance = (n3, marque, routine) => {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, DC, id, { series: n3 });
  se.exercices[0].series.forEach((s, i) => { s.reps_visees = 8; if (marque && i === n3 - 1) s.au_max = true; });
  if (routine) se.routine_id = 'R';
  return se;
};
const entrees = (se, consigne, extra) => Object.assign({
  seance: { id: 'S', debut: '2026-11-16T10:00:00Z', edition: false, routine_id: se.routine_id || null, exercices: se.exercices },
  consignes: { [DC]: { consigne, contexte: { cran: 102.5, haut: null } } },
  reglage: 'franc', paris: [], objectif: 'muscle',
  catalogue: { [DC]: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5,
                       muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'], muscles_stabilisateurs: [] } }
}, extra || {});
const erreurs = (p, e) => T.verifierPlan(p, e).erreurs.join('\n');

describe('le plan — séance de reprise longue (I207)', () => {
  test('la dernière ligne « Au max » est « en gardant 2 reps », aucune réserve d’échec, aucune erreur', () => {
    const e = entrees(seance(3, true), REPRISE);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.consigne.etat).toBe('reprise_longue');
    expect(x.lignes[2].auMax).toMatchObject({ reserve: 2, sorte: 'garde' });
    expect(sp(x.lignes[2].auMax.consigne)).toBe('Autant que tu peux, en gardant 2 reps');
    expect(x.auMaxMots).toEqual(M.motsDeLAuMax(true));
    expect(erreurs(p, e)).toBe('');
  });
  test('une marque posée à 0 reste en base mais le plan la lit à 2 (jamais l’échec)', () => {
    const se = seance(3, true);
    se.exercices[0].series[2].au_max_reserve = 0;
    const p = T.planDeSeance(entrees(se, REPRISE));
    expect(p.exercices[0].lignes[2].auMax.reserve).toBe(2);
  });
  test('la carte proposée dit « en gardant 2 reps »', () => {
    const e = entrees(seance(3, false, true), REPRISE);
    const x = T.planDeSeance(e).exercices[0];
    expect(x.propositionAuMax).toMatchObject({ reserve: 2, sorte: 'garde', titre: 'Dernière série : en gardant 2 reps ?' });
    expect(erreurs(T.planDeSeance(e), e)).toBe('');
  });
  test('le témoin : même exercice sans reprise longue, l’échec reste', () => {
    const p = T.planDeSeance(entrees(seance(3, true), RECENT));
    expect(p.exercices[0].consigne.etat).not.toBe('reprise_longue');
    expect(p.exercices[0].lignes[2].auMax.reserve).toBe(0);
    const b = T.planDeSeance(entrees(seance(3, false, true), RECENT)).exercices[0];
    expect(b.propositionAuMax).toMatchObject({ reserve: 0, titre: 'Dernière série au max ?' });
  });
  test('I207 voit une réserve d’échec à la reprise longue, et une carte qui dit « au max »', () => {
    const e = entrees(seance(3, true), REPRISE);
    const p = T.planDeSeance(e);
    p.exercices[0].auMax.reserve = 0; p.exercices[0].auMax.sorte = 'echec';
    expect(erreurs(p, e)).toMatch(/I207/);
    const e2 = entrees(seance(3, false, true), REPRISE);
    const p2 = T.planDeSeance(e2);
    p2.exercices[0].propositionAuMax.titre = 'Dernière série au max ?';
    expect(erreurs(p2, e2)).toMatch(/I207/);
  });
});
