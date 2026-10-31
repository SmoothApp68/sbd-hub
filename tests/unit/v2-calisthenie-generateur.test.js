/** @jest-environment node */
// 195-3 — LE GÉNÉRATEUR « CALISTHÉNIE », SES INVARIANTS (I100 à I104) ET « AU MAX, EN GARDANT 1 ».
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
const G = require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const T = require('../../v2/js/plan.js');

const f = (slug, echelle, rang, o) => Object.assign({ slug, nom: slug, echelle, echelle_rang: rang, mesure: 'reps', charge: 'aucune', nature: 'force',
  equipement: 'aucun', muscles_primaires: [], muscles_secondaires: [], muscles_stabilisateurs: [] }, o || {});
const CAT = {};
[
  f('traction_negative', 'tractions', 2), f('tractions', 'tractions', 3), f('tractions_leste', 'tractions', 4, { charge: 'ajoutee' }),
  f('dips_negatif', 'dips_torse', 2), f('dips_torse', 'dips_torse', 3), f('dips_torse_lestes', 'dips_torse', 4, { charge: 'ajoutee' }),
  f('pompes_inclinees', 'pompes', 1), f('pompes_genoux', 'pompes', 1), f('pompes', 'pompes', 3), f('pompes_declinees', 'pompes', 4),
  f('squat_poids_du_corps', 'squat_poids_du_corps', 1), f('split_squat_bulgare_poids_du_corps', 'squat_poids_du_corps', 2),
  f('pistol_squat', 'squat_poids_du_corps', 3, { nature: 'habilete' }),
  f('pont_fessier', 'pont_fessier', 1), f('pont_fessier_une_jambe', 'pont_fessier', 2),
  f('rowing_inverse', 'rowing_inverse', 1), f('rowing_inverse_pieds_sureleves', 'rowing_inverse', 2),
  f('front_lever_groupe', 'front_lever', 1, { mesure: 'temps', echelle_seuil_s: 15 }), f('front_lever', 'front_lever', 5, { mesure: 'temps' })
].forEach((x) => { CAT[x.slug] = x; });

const entree = (o) => Object.assign({ jours: 3, objectif: 'calisthenie', phase: 'maintien', materiel: 'poids_du_corps', barre_traction: true,
  anciennete: '1_a_3_ans', priorites: [], menager: [], ecartes: [], faits: {}, depart_calisthenie: null }, o || {});
const slugs = (rt) => rt.exercices.map((l) => l.exercise_slug);

describe('195-3 — corps entier, supersets, figure en premier', () => {
  const rts = G.generer(CAT, entree({ depart_calisthenie: { tractions: 3, pompes: 18, dips: 0, pistol: false } }));
  test('trois séances, trois supersets chacune (tirage+jambes, poussée+charnière, tirage+poussée)', () => {
    expect(rts).toHaveLength(3);
    rts.forEach((rt) => {
      const groupes = {};
      rt.exercices.forEach((l) => { if (l.groupe_superset) (groupes[l.groupe_superset] = groupes[l.groupe_superset] || []).push(l); });
      expect(Object.keys(groupes)).toHaveLength(3);
      Object.keys(groupes).forEach((g) => expect(groupes[g]).toHaveLength(2));
    });
  });
  test('la figure est la première ligne de chaque séance (au plus 3 séances)', () => {
    rts.forEach((rt) => expect(rt.exercices[0].exercise_slug).toBe('front_lever_groupe'));
    expect(G.generer(CAT, entree({ jours: 4 })).filter((rt) => slugs(rt).indexOf('front_lever_groupe') >= 0)).toHaveLength(3);
  });
  test('les marches de départ viennent des quatre chiffres', () => {
    const s = slugs(rts[0]);
    ['tractions', 'pompes', 'dips_negatif', 'split_squat_bulgare_poids_du_corps', 'pont_fessier', 'rowing_inverse'].forEach((x) => expect(s).toContain(x));
    expect(s).toContain('traction_negative');   // « tractions 3 × 3-5 plus des négatives »
  });
  test('la marche faite l\'emporte sur le départ', () => {
    const r = G.generer(CAT, entree({ faits: { pistol_squat: 4, pont_fessier_une_jambe: 2 } }));
    expect(slugs(r[0])).toEqual(expect.arrayContaining(['pistol_squat', 'pont_fessier_une_jambe']));
  });
  test('2 à 4 séances, jamais plus', () => {
    expect(G.generer(CAT, entree({ jours: 2 }))).toHaveLength(2);
    expect(G.generer(CAT, entree({ jours: 6 }))).toHaveLength(4);
  });
});

describe('195-3 — sans barre de traction, kiné', () => {
  test('sans barre : ni tractions ni rowing inversé ni figure suspendue, et la phrase du coach', () => {
    const catalogue = Object.assign({}, CAT, { front_lever_groupe: f('front_lever_groupe', 'front_lever', 1, { mesure: 'temps' }) });
    const r = G.generer(catalogue, entree({ barre_traction: false }));
    const s = r.reduce((a, rt) => a.concat(slugs(rt)), []);
    ['tractions', 'traction_negative', 'rowing_inverse', 'front_lever_groupe'].forEach((x) => expect(s).not.toContain(x));
    expect(r[0].avertissements[0].texte).toBe('Pour progresser en tirage, il te faut une barre ou des anneaux.');
    expect(G.verifierCalisthenie({ catalogue, barre_traction: false }, r)).toEqual([]);
  });
  test('zone coude ou épaule : aucune figure', () => {
    ['coude', 'epaule'].forEach((z) => {
      const r = G.generer(CAT, entree({ menager: [z] }));
      r.forEach((rt) => expect(slugs(rt)).not.toContain('front_lever_groupe'));
      expect(G.verifierCalisthenie({ catalogue: CAT, menager: [z] }, r)).toEqual([]);
    });
    expect(G.generer(CAT, entree({ menager: ['genou'] }))[0].exercices[0].exercise_slug).toBe('front_lever_groupe');
  });
  test('le contrôle voit une figure avec une zone à ménager, quatre figures, une barre absente', () => {
    const r = G.generer(CAT, entree());
    expect(G.verifierCalisthenie({ catalogue: CAT, menager: ['coude'] }, r).join()).toMatch(/I102/);
    const quatre = r.concat(G.generer(CAT, entree({ jours: 2 })));
    expect(G.verifierCalisthenie({ catalogue: CAT }, quatre).join()).toMatch(/I101/);
    expect(G.verifierCalisthenie({ catalogue: CAT, barre_traction: false }, r).join()).toMatch(/I103/);
  });
  test('un exercice écarté descend d\'un rang, jamais ne revient', () => {
    const r = G.generer(CAT, entree({ ecartes: ['pompes_genoux'], depart_calisthenie: { pompes: 10 } }));
    expect(slugs(r[0])).not.toContain('pompes_genoux');
  });
});

describe('195-3 — « Au max, en gardant 1 » ; une figure jamais', () => {
  test('auMaxDe : calisthénie = réserve 1 sur un exercice de poids du corps, rien sur une figure', () => {
    const a = M.auMaxDe({ objectif: 'calisthenie', famille: null, equipement: 'aucun', isolation: false });
    expect(a).toMatchObject({ pose: 'defaut', reserve: 1, sorte: 'garde' });
    expect(M.auMaxDe({ objectif: 'calisthenie', famille: null, figure: true }).pose).toBeNull();
  });
  test('le programme marque la dernière série des exercices, pas la figure', () => {
    const r = G.generer(CAT, entree());
    expect(r[0].exercices.filter((l) => l.au_max).length).toBeGreaterThan(0);
    expect(r[0].exercices[0].au_max).toBeUndefined();
  });
  test('les autres objectifs ne changent pas', () => {
    expect(M.auMaxDe({ objectif: 'forme', famille: null, equipement: 'aucun' }).pose).toBeNull();
  });
});

describe('195-3 — I100 et I104 sur le plan', () => {
  const plan = (o, x) => Object.assign({ objectif: 'calisthenie', exercices: [Object.assign({ slug: 'pistol_squat', lignes: [] }, x)] }, o);
  const carte = { cible: 'pistol_squat', cibleHabilete: true, proposable: true };
  test('I100 : une marche d\'habileté proposée hors calisthénie est refusée', () => {
    const e = [];
    T.verifierCalisthenie(plan({ objectif: 'force' }, { carteMarche: carte }), e);
    expect(e.join()).toMatch(/I100/);
    const ok = [];
    T.verifierCalisthenie(plan({}, { carteMarche: carte }), ok);
    expect(ok).toEqual([]);
  });
  test('I104 : « Au max » sur une figure est refusé', () => {
    ['auMax', 'propositionAuMax'].forEach((cle) => {
      const e = [];
      T.verifierCalisthenie(plan({}, { figure: { tenues: [] }, [cle]: { reserve: 1 } }), e);
      expect(e.join()).toMatch(/I104/);
    });
    const e = [];
    T.verifierCalisthenie(plan({}, { figure: { tenues: [] }, lignes: [{ auMax: true }] }), e);
    expect(e.join()).toMatch(/I104/);
    const ok = [];
    T.verifierCalisthenie(plan({}, { figure: { tenues: [] } }), ok);
    expect(ok).toEqual([]);
  });
});
