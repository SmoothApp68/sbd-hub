/** @jest-environment node */
//
// Chantier « première séance sûre », PR 1 (MOTEUR §9.30, §9.36) — LA DERNIÈRE SÉRIE « AU MAX » : jamais à l'échec pour un 65 ans et plus
// connu, jamais à l'échec ni « garde 1 » à la première fois d'un exercice. Une décision (`Moteur.auMaxDe`), deux lecteurs (le
// générateur, le plan) ; la marque posée par la personne est respectée au plancher « garde 2 », jamais effacée en silence (D-D1).
// I150 (65+ : aucune réserve d'échec) et I151 (première fois : aucune réserve < 2, aucune proposition).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const G = require('../../v2/js/generateur.js');
const fs = require('fs');
const path = require('path');
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));

const sp = (t) => String(t).replace(/[  ]/g, ' ');
const DC = 'developpe_couche_barre';
const B = require('../../v2/js/modele.js').BARRES;

describe('Moteur.auMaxDe — plus65 et première fois', () => {
  const couche = { objectif: 'muscle', debutant: false, famille: B[1], equipement: 'barre', isolation: false };
  test('65+ connu : jamais l’échec, « en gardant 2 reps » ; inconnu ou faux : rien ne change', () => {
    expect(M.auMaxDe(Object.assign({}, couche, { plus65: true }))).toMatchObject({ pose: 'defaut', reserve: 2, sorte: 'garde', avecPareur: false });
    expect(M.auMaxDe(couche).reserve).toBe(0);
    expect(M.auMaxDe(Object.assign({}, couche, { plus65: false })).reserve).toBe(0);
    expect(M.auMaxDe(Object.assign({}, couche, { plus65: null })).reserve).toBe(0);
    expect(M.auMaxDe(Object.assign({}, couche, { plus65: 'oui' })).reserve).toBe(0);   // jamais deviné : seulement `true`
  });
  test('65+ : même une marque de la personne passe à garde 2', () => {
    expect(M.auMaxDe(Object.assign({}, couche, { plus65: true, objectif: 'force', main: true })).reserve).toBe(2);
    expect(M.auMaxDe(Object.assign({}, couche, { plus65: true, objectif: 'muscle', debutant: false, famille: B[0], main: true })).reserve).toBe(2);
  });
  test('première fois : le coach ne pose rien ; la marque de la personne est respectée, à garde 2', () => {
    expect(M.auMaxDe(Object.assign({}, couche, { premiereFois: true })).pose).toBeNull();
    const m = M.auMaxDe(Object.assign({}, couche, { premiereFois: true, main: true }));
    expect(m).toMatchObject({ pose: 'main', reserve: 2, sorte: 'garde' });
    expect(M.auMaxDe(Object.assign({}, couche, { premiereFois: false })).reserve).toBe(0);
  });
  test('les mots de la carte : 65+ connu seulement', () => {
    expect(M.motsDeLAuMax(true)).toEqual({ titre: 'Dernière série\u00a0: en gardant 2 reps\u00a0?', bouton: 'En gardant 2 reps' });
    expect(M.motsDeLAuMax(false)).toEqual({ titre: 'Dernière série au max\u00a0?', bouton: 'Au max' });
    expect(M.motsDeLAuMax(null)).toEqual({ titre: 'Dernière série au max\u00a0?', bouton: 'Au max' });
  });
  test('une seule notion de « première fois » : la consigne', () => {
    expect(M.estPremiereFois({ etat: 'silence', raison: 'premiere_fois' })).toBe(true);
    expect(M.estPremiereFois({ etat: 'depart_routine', ligne: { charge: 60, vise: 8 } })).toBe(true);
    expect(M.estPremiereFois({ etat: 'progression', ligne: { charge: 60, vise: 8 } })).toBe(false);
    expect(M.estPremiereFois({ etat: 'silence', raison: 'pas_de_palier' })).toBe(false);
    expect(M.estPremiereFois(null)).toBe(false);
  });
});

describe('le générateur — plus65 et première fois', () => {
  const cat = {};
  Object.keys(CAS.catalogue).forEach((slug) => {
    const [equipement, primaires, secondaires] = CAS.catalogue[slug];
    cat[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
  });
  const faitsDe = () => { const f = {}; Object.keys(cat).forEach((s) => { f[s] = 5; }); return f; };
  const BASE = { materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [], ecartes: [], objectif: 'muscle', jours: 4 };
  const lignes = (rs) => [].concat.apply([], rs.map((rt) => rt.exercices));
  const marquees = (e) => lignes(G.generer(cat, Object.assign({}, BASE, e))).filter((x) => x.au_max === true);

  test('première fois : aucun exercice sans historique ne reçoit « Au max »', () => {
    expect(lignes(G.generer(cat, Object.assign({}, BASE, { faits: {} }))).length).toBeGreaterThan(0);
    expect(marquees({ faits: {} })).toEqual([]);
    expect(marquees({ faits: faitsDe() }).length).toBeGreaterThan(0);        // avec historique : comme avant
  });
  test('un seul exercice fait : seul lui porte la marque', () => {
    const tous = lignes(G.generer(cat, Object.assign({}, BASE, { faits: faitsDe() })));
    const cible = tous.filter((x) => x.au_max === true)[0].exercise_slug;
    const un = {}; un[cible] = 3;
    marquees({ faits: un }).forEach((x) => expect(x.exercise_slug).toBe(cible));
    expect(marquees({ faits: un }).length).toBeGreaterThan(0);
  });
  test('70 ans en Muscle : la marque posée est « en gardant 2 », jamais l’échec (la décision lit plus65)', () => {
    const ls = marquees({ faits: faitsDe(), plus65: true });
    expect(ls.length).toBeGreaterThan(0);
    ls.forEach((x) => {
      const f = cat[x.exercise_slug];
      const a = M.auMaxDe({ objectif: 'muscle', debutant: false, famille: G.familleDeBarre(x.exercise_slug, cat), equipement: f.equipement,
        isolation: M.estIsolation({ prim: f.muscles_primaires, sec: f.muscles_secondaires, stab: [] }), plus65: true, zoneDePlan: x.zone || null });
      expect(a.reserve).toBeGreaterThanOrEqual(2);
    });
  });
});

const seance = (slug, n, marque, routine) => {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: n });
  se.exercices[0].series.forEach((s, i) => { s.reps_visees = 8; if (marque && i === n - 1) s.au_max = true; });
  if (routine) se.routine_id = 'R';
  return se;
};
const PROGRESSION = { etat: 'progression', zone: 'mix', palier: 100, n: 3, ligne: { charge: 100, vise: 8 }, haut: null };
const DEPART = { etat: 'depart_routine', zone: null, palier: null, niveau: null, n: 3, ligne: { charge: 60, vise: 8 }, haut: null, fondement: { departRoutine: { charge: 60 } } };
const SILENCE = { etat: 'silence', raison: 'premiere_fois', fondement: {} };
const entrees = (se, consigne, extra) => Object.assign({
  seance: { id: 'S', debut: '2026-10-31T10:00:00Z', edition: false, routine_id: se.routine_id || null, exercices: se.exercices },
  consignes: { [DC]: { consigne, contexte: { cran: 102.5, haut: null } } },
  reglage: 'normal', paris: [], objectif: 'muscle',
  catalogue: { [DC]: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5,
                       muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'], muscles_stabilisateurs: [] } }
}, extra || {});
const erreurs = (p, e) => T.verifierPlan(p, e).erreurs.join('\n');

describe('le plan — 65 ans et plus (I150)', () => {
  test('70 ans en Muscle : la dernière ligne marquée est « en gardant 2 reps », aucune réserve d’échec', () => {
    const e = entrees(seance(DC, 3, true), PROGRESSION, { plus65: true });
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.lignes[2].auMax).toMatchObject({ reserve: 2, sorte: 'garde' });
    expect(sp(x.lignes[2].auMax.consigne)).toBe('Autant que tu peux, en gardant 2 reps');
    expect(erreurs(p, e)).toBe('');
    expect(x.auMaxMots).toEqual({ titre: 'Dernière série\u00a0: en gardant 2 reps\u00a0?', bouton: 'En gardant 2 reps' });
  });
  test('la carte proposée dit « en gardant 2 reps » (titre) pour un 65+, « au max » sinon', () => {
    const a = T.planDeSeance(entrees(seance(DC, 3, false, true), PROGRESSION, { plus65: true })).exercices[0];
    expect(a.propositionAuMax).toMatchObject({ reserve: 2, titre: 'Dernière série\u00a0: en gardant 2 reps\u00a0?' });
    const b = T.planDeSeance(entrees(seance(DC, 3, false, true), PROGRESSION, { plus65: false })).exercices[0];
    expect(b.propositionAuMax).toMatchObject({ reserve: 0, titre: 'Dernière série au max\u00a0?' });
    expect(b.auMaxMots.bouton).toBe('Au max');
  });
  test('âge inconnu (plus65 null ou absent) : rien de deviné, l’échec reste', () => {
    [undefined, null].forEach((v) => {
      const e = entrees(seance(DC, 3, true), PROGRESSION, v === undefined ? {} : { plus65: v });
      const p = T.planDeSeance(e);
      expect(p.exercices[0].lignes[2].auMax.reserve).toBe(0);
      expect(erreurs(p, e)).toBe('');
    });
  });
  test('I150 voit une réserve d’échec chez un 65+', () => {
    const e = entrees(seance(DC, 3, true), PROGRESSION, { plus65: true });
    const p = T.planDeSeance(e);
    p.exercices[0].auMax.reserve = 0;
    expect(erreurs(p, e)).toMatch(/I150/);
  });
});

describe('le plan — première fois (I151, D-D1)', () => {
  test('charge de départ de la routine : aucune carte « au max » proposée', () => {
    const e = entrees(seance(DC, 3, false, true), DEPART);
    expect(T.planDeSeance(e).exercices[0].propositionAuMax).toBeNull();
    expect(T.planDeSeance(entrees(seance(DC, 3, false, true), SILENCE)).exercices[0].propositionAuMax).toBeNull();
  });
  test('une marque posée par la personne sur une première fois est respectée, à « garde 2 » (jamais l’échec)', () => {
    const e = entrees(seance(DC, 3, true), DEPART);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.lignes[2].auMax).toMatchObject({ reserve: 2, sorte: 'garde' });
    expect(x.auMax.pose).toBe('main');
    expect(erreurs(p, e)).toBe('');
    // la série garde sa marque : rien n'est effacé en silence
    expect(e.seance.exercices[0].series[2].au_max).toBe(true);
  });
  test('même exercice avec une consigne ordinaire : l’échec reste (le témoin)', () => {
    expect(T.planDeSeance(entrees(seance(DC, 3, true), PROGRESSION)).exercices[0].lignes[2].auMax.reserve).toBe(0);
  });
  test('I151 voit une réserve < 2 ou une proposition à une première fois', () => {
    const e = entrees(seance(DC, 3, true), DEPART);
    const p = T.planDeSeance(e);
    p.exercices[0].auMax.reserve = 1;
    expect(erreurs(p, e)).toMatch(/I151/);
    const e2 = entrees(seance(DC, 3, false, true), DEPART);
    const p2 = T.planDeSeance(e2);
    p2.exercices[0].propositionAuMax = { iSerie: 2, reserve: 2, sorte: 'garde', avecPareur: false, titre: 'x', phrase: 'x', boutons: [] };
    expect(erreurs(p2, e2)).toMatch(/I151/);
  });
});
