/** @jest-environment node */
//
// 193-6b (MOTEUR §9.30 bis, I99) — L'ÉCHEC SUR UNE BARRE, UNE FOIS PAR SEMAINE : la décision (`auMaxDe`), le fait (`faits.echecsDeBarre`),
// le plan (le Pourquoi, I99) et le générateur (jour Lourd → échec, jour Hypertrophie de la même barre → garde 1).

process.env.TZ = 'Europe/Paris';
global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const G = require('../../v2/js/generateur.js');
require('../../v2/js/bilan.js');
require('../../v2/js/semaine.js');
const F = require('../../v2/js/faits.js').creer();

const B = Modele.BARRES;
const SQ = B[0], DC = B[1], SDT = B[2], DM = B[3];
const d = (o) => M.auMaxDe(Object.assign({ objectif: 'muscle' }, o));
const sp = (t) => String(t).replace(/[  ]/g, ' ');

describe('auMaxDe — l’échec sur une barre', () => {
  test('sans zone de plan : l’échec tient si la barre n’est pas allée à l’échec récemment, sinon garde 1', () => {
    expect(d({ famille: SQ })).toMatchObject({ reserve: 0, sorte: 'echec', avecPareur: true });
    expect(d({ famille: SQ, echecRecent: false })).toMatchObject({ reserve: 0 });
    expect(d({ famille: SQ, echecRecent: true })).toMatchObject({ reserve: 1, sorte: 'garde', avecPareur: false });
    expect(d({ famille: DC, echecRecent: true })).toMatchObject({ reserve: 1 });
  });
  test('avec une zone de plan : Lourd → échec (même après un échec récent), une autre zone → garde 1', () => {
    expect(d({ famille: DC, zoneDePlan: 'lourd', echecRecent: true })).toMatchObject({ reserve: 0 });
    expect(d({ famille: DC, zoneDePlan: 'lourd' })).toMatchObject({ reserve: 0 });
    ['hypertrophie', 'mix'].forEach((z) => expect(d({ famille: DC, zoneDePlan: z })).toMatchObject({ reserve: 1, sorte: 'garde' }));
  });
  test('accessoires, machines, isolations : inchangés ; soulevé et militaire : inchangés', () => {
    expect(d({ famille: null, equipement: 'haltere', zoneDePlan: 'hypertrophie', echecRecent: true })).toMatchObject({ reserve: 0 });
    expect(d({ famille: null, equipement: 'machine', echecRecent: true })).toMatchObject({ reserve: 0 });
    expect(d({ famille: SDT, echecRecent: true })).toMatchObject({ reserve: 2 });
    expect(d({ famille: DM, echecRecent: true, zoneDePlan: 'lourd' })).toMatchObject({ reserve: 1 });
  });
  test('echecRecentDeBarre : les 6 jours civils précédents, le jour même exclu ; rend le jour le plus récent', () => {
    expect(M.echecRecentDeBarre(['2026-10-27'], '2026-10-31')).toBe('2026-10-27');
    expect(M.echecRecentDeBarre(['2026-10-25'], '2026-10-31')).toBe('2026-10-25');
    expect(M.echecRecentDeBarre(['2026-10-24'], '2026-10-31')).toBeNull();
    expect(M.echecRecentDeBarre(['2026-10-31'], '2026-10-31')).toBeNull();
    expect(M.echecRecentDeBarre(['2026-10-25', '2026-10-29'], '2026-10-31')).toBe('2026-10-29');
    expect(M.echecRecentDeBarre([], '2026-10-31')).toBeNull();
  });
  test('le Pourquoi', () => {
    expect(sp(M.pourquoiAuMaxEchecRecent('squat', '2026-10-27', 1))).toBe('Ton squat est déjà allé à l’échec mardi : aujourd’hui, garde 1 rep.');
  });
});

describe('faits.echecsDeBarre', () => {
  const seances = [{ id: 'a', debut: '2026-10-27T10:00:00Z' }, { id: 'b', debut: '2026-10-20T10:00:00Z' }, { id: 'c', debut: '2026-10-30T10:00:00Z' },
                   { id: 'z', debut: '2026-10-31T08:00:00Z' }];
  const sets = {
    a: [{ exercise_slug: 'squat_barre', reps: 6, type_serie: 'travail', au_max_reserve: 0 }, { exercise_slug: 'squat_barre', reps: 6, type_serie: 'travail' }],
    b: [{ exercise_slug: 'squat_barre', reps: 6, type_serie: 'echec' }],                    // trop ancien
    c: [{ exercise_slug: 'developpe_couche_barre', reps: 6, type_serie: 'echec' }, { exercise_slug: 'developpe_couche_barre', reps: 6, type_serie: 'travail', rpe: 10 },
        { exercise_slug: 'squat_barre', reps: 6, type_serie: 'echec', hors_calcul: true }, { exercise_slug: 'cu', reps: 6, type_serie: 'echec' }],
    z: [{ exercise_slug: 'developpe_couche_barre', reps: 6, type_serie: 'echec' }]                      // le jour même : exclu
  };
  const cat = { squat_barre: { equipement: 'barre', muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'] },
                developpe_couche_barre: { equipement: 'barre', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
                cu: { equipement: 'haltere', muscles_primaires: ['biceps'], muscles_secondaires: [] } };
  require('../../v2/js/generateur.js');
  const corpus = { seances, seriesDe: (i) => sets[i] || [], catalogue: () => cat };
  test('une série à l’échec (réserve 0, type echec, réserve notée 0) par barre, dans les 6 jours précédents', () => {
    const r = F.echecsDeBarre(corpus, '2026-10-31T10:00:00Z');
    expect(r[SQ]).toEqual(['2026-10-27']);
    expect(r[DC]).toEqual(['2026-10-30']);
    expect(Object.keys(r)).toHaveLength(2);
    expect(F.echecsDeBarre(corpus, '2026-12-31T10:00:00Z')).toEqual({});
  });
});

describe('le plan', () => {
  const slug = 'developpe_couche_barre';
  function seance(n) {
    let k = 0;
    const id = () => 'x-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, slug, id, { series: n });
    se.exercices[0].series.forEach((s, i) => { s.reps_visees = 8; if (i === n - 1) s.au_max = true; });
    se.routine_id = 'R';
    return se;
  }
  function entrees(plan, echecs) {
    const se = seance(3);
    const consigne = { etat: 'progression', zone: 'mix', palier: 100, n: 3, ligne: { charge: 100, vise: 8 }, haut: null };
    if (plan) consigne.plan = plan;
    return {
      seance: { id: 'S', debut: '2026-10-31T10:00:00Z', edition: false, routine_id: 'R', exercices: se.exercices },
      consignes: { [slug]: { consigne, contexte: { cran: 102.5, haut: null } } },
      reglage: 'normal', paris: [], objectif: 'les_deux', echecsDeBarre: echecs || {},
      catalogue: { [slug]: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5,
                             muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'], muscles_stabilisateurs: [] } }
    };
  }
  const i99 = (p, e) => T.verifierPlan(p, e).erreurs.filter((x) => /^I99/.test(x));
  test('échec il y a 4 jours, sans zone de plan : garde 1, le Pourquoi le dit', () => {
    const e = entrees(null, { [DC]: ['2026-10-27'] });
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.lignes[2].auMax).toMatchObject({ reserve: 1, sorte: 'garde' });
    expect(sp(x.lignes[2].auMax.consigne)).toBe('Autant que tu peux, en gardant 1 rep');
    expect(sp(x.auMax.pourquoi)).toBe('Ton développé couché est déjà allé à l’échec mardi : aujourd’hui, garde 1 rep.');
    expect(i99(p, e)).toEqual([]);
  });
  test('aucun échec récent : l’échec tient ; I99 voit un échec mal posé', () => {
    const e = entrees(null, {});
    const p = T.planDeSeance(e);
    expect(p.exercices[0].lignes[2].auMax.reserve).toBe(0);
    expect(i99(p, e)).toEqual([]);
    p.exercices[0].auMax.echecRecent = true;
    expect(i99(p, e)).toHaveLength(1);
  });
  test('jour Lourd : l’échec, même après un échec récent ; jour Hypertrophie : garde 1', () => {
    const lourd = entrees({ zone: 'lourd', mode: 'zone', n: 3, perimee: false }, { [DC]: ['2026-10-27'] });
    const pl = T.planDeSeance(lourd);
    expect(pl.exercices[0].lignes[2].auMax.reserve).toBe(0);
    expect(i99(pl, lourd)).toEqual([]);
    const hyp = entrees({ zone: 'hypertrophie', mode: 'zone', n: 3, perimee: false }, {});
    const ph = T.planDeSeance(hyp);
    expect(ph.exercices[0].lignes[2].auMax.reserve).toBe(1);
    expect(i99(ph, hyp)).toEqual([]);
    ph.exercices[0].auMax.reserve = 0;
    expect(i99(ph, hyp)).toHaveLength(1);
  });
});

describe('le générateur (193-2) : la même fonction, une entrée de plus', () => {
  const fs = require('fs');
  const path = require('path');
  const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));
  const F2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-193-2-programmes-force.json'), 'utf8'));
  const cat = {};
  Object.keys(CAS.catalogue).forEach((sl) => { const [e, p, s2] = CAS.catalogue[sl]; cat[sl] = { equipement: e, muscles_primaires: p.slice(), muscles_secondaires: s2.slice() }; });
  Object.keys(F2.catalogue_ajouts).forEach((sl) => { const [e, p, s2, m] = F2.catalogue_ajouts[sl]; cat[sl] = { equipement: e, muscles_primaires: p.slice(), muscles_secondaires: s2.slice(), mouvement: m }; });
  test('chaque ligne passe sa zone à `auMaxDe` ; une barre en Lourd garde l’échec, la même barre en Hypertrophie garde 1', () => {
    const vus = [];
    const orig = M.auMaxDe;
    M.auMaxDe = (e) => { const r = orig(e); vus.push({ e, r }); return r; };
    try {
      const rs = G.generer(cat, { materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [],
        ecartes: [], faits: {}, objectif: 'les_deux', jours: 4 });
      const barres = vus.filter((v) => v.e.famille === SQ || v.e.famille === DC);
      expect(barres.length).toBeGreaterThan(0);
      const zones = {};
      barres.forEach((v) => { zones[v.e.zoneDePlan] = v.r.reserve; });
      expect(zones.lourd).toBe(0);
      expect(Object.keys(zones).filter((z) => z !== 'lourd' && z !== 'null').every((z) => zones[z] === 1)).toBe(true);
      expect(rs.length).toBeGreaterThan(0);
    } finally { M.auMaxDe = orig; }
  });
});
