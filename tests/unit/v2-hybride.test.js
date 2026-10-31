/** @jest-environment node */
//
// 199 (MOTEUR §9.37) — HYBRIDE : le fait des jours de cardio réguliers (`faits.joursDeCardioReguliers`) et le générateur qui place les jambes
// lourdes à deux jours au moins d'un jour de cardio régulier (ou dit qu'il ne peut pas).
const fs = require('fs');
const path = require('path');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-193-2-programmes-force.json'), 'utf8'));
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));
process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/routines.js');
const G = require('../../v2/js/generateur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');

const catalogue = () => {
  const c = {};
  Object.keys(CAS.catalogue).forEach((slug) => {
    const [equipement, primaires, secondaires] = CAS.catalogue[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
  });
  Object.keys(F.catalogue_ajouts).forEach((slug) => {
    const [equipement, primaires, secondaires, mouvement] = F.catalogue_ajouts[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice(), mouvement };
  });
  return c;
};
const cat = catalogue();
const BASE = { objectif: 'force', jours: 3, materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [], ecartes: [], faits: {} };
const entree = (o) => Object.assign({}, BASE, o);
const lourde = (rt) => rt.exercices.some((l) => (l.zone === 'lourd' || l.zone === 'mix') && (l.motif === 'squat' || l.motif === 'charniere'));
const ecart = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 7 - d); };

describe('199 — le générateur place les jambes lourdes loin du cardio régulier', () => {
  test('sans cardio régulier : rien ne change, aucune marque, aucune phrase', () => {
    const sans = G.generer(cat, entree({}));
    expect(JSON.stringify(G.generer(cat, entree({ cardioJours: [] })))).toBe(JSON.stringify(sans));
    sans.forEach((rt) => expect(rt.hybride).toBeUndefined());
    expect(G.phrasesHybrides(sans, entree({}))).toEqual([]);
  });
  [[2], [1, 3], [0], [4], [6, 2], [0, 1, 2, 3, 4, 5, 6]].forEach((cardioJours) => {
    ['force', 'les_deux'].forEach((objectif) => [2, 3, 4, 5, 6].forEach((jours) => {
      test(objectif + ' ' + jours + ' j, cardio le ' + cardioJours.map((j) => G.NOMS_DES_JOURS[j]).join(' et ') + ' : à deux jours au moins, ou il le dit', () => {
        const e = entree({ objectif, jours, cardioJours });
        const rts = G.generer(cat, e);
        const avant = G.generer(cat, entree({ objectif, jours })).map((rt) => rt.nom).sort();
        expect(rts.map((rt) => rt.nom).sort()).toEqual(avant);            // les mêmes séances, seulement l'ordre
        const lourdes = rts.filter(lourde);
        lourdes.forEach((rt) => {
          expect(rt.hybride).toBeDefined();
          if (!rt.hybride.impossible) cardioJours.forEach((c) => expect(ecart(rt.hybride.jour, c)).toBeGreaterThanOrEqual(2));
        });
        const dit = G.phrasesHybrides(rts, e).join(' ');
        if (lourdes.some((rt) => rt.hybride.impossible)) expect(dit).toMatch(/Je n’ai pas pu écarter de ton cardio/);
        if (lourdes.some((rt) => rt.hybride.deplace)) expect(dit).toMatch(/passe au/);
      });
    }));
  });
  test('Les deux, 3 séances, cardio le lundi : la séance de jambes lourdes quitte le lundi, elle est dite avec la science et la convention', () => {
    const e = entree({ objectif: 'les_deux', cardioJours: [0], cardioSemaines: { 0: 4 } });
    const rts = G.generer(cat, e);
    const lourdes = rts.filter(lourde);
    expect(lourdes.filter((rt) => rt.hybride.deplace).length).toBe(1);
    lourdes.forEach((rt) => { expect(rt.hybride.jour).not.toBe(0); expect(rt.hybride.impossible).toBe(false); });
    const phrases = G.phrasesHybrides(rts, e).join(' ');
    expect(phrases).toMatch(/Tu fais du cardio le lundi \(4 des 4 dernières semaines\)/);
    expect(phrases).toMatch(/Schumann 2022/);
    expect(phrases).toMatch(/convention de coachs/);
  });
  test('Force, 3 séances, cardio le mercredi : trois séances de jambes lourdes, une ne peut pas être écartée — le générateur le dit', () => {
    const e = entree({ cardioJours: [2] });
    const rts = G.generer(cat, e);
    expect(rts.filter(lourde).filter((rt) => rt.hybride.impossible).length).toBe(1);
    expect(G.phrasesHybrides(rts, e)[0]).toMatch(/^Tu fais du cardio le mercredi\. Je n’ai pas pu écarter de ton cardio .* : elle reste à moins de deux jours\.$/);
  });
  test('des jours de séances déclarés (`joursSeances`) remplacent les jours types', () => {
    const e = entree({ objectif: 'les_deux', cardioJours: [1], joursSeances: [0, 3, 5] });
    const rts = G.generer(cat, e);
    rts.filter(lourde).forEach((rt) => { expect([0, 3, 5]).toContain(rt.hybride.jour); expect(ecart(rt.hybride.jour, 1)).toBeGreaterThanOrEqual(2); });
  });
  test('une séance de jambes sans zone lourde (Muscle) n’est jamais déplacée', () => {
    const rts = G.generer(cat, entree({ objectif: 'muscle', cardioJours: [2] }));
    rts.forEach((rt) => expect(rt.hybride).toBeUndefined());
  });
  test('pur : l’entrée n’est pas modifiée, deux appels donnent la même sortie', () => {
    const e = entree({ cardioJours: [2] }), avant = JSON.stringify(e);
    const a = JSON.stringify(G.generer(cat, e));
    expect(JSON.stringify(e)).toBe(avant);
    expect(JSON.stringify(G.generer(cat, e))).toBe(a);
  });
  test('les phrases : aucune promesse, la science et la convention sont dites comme telles', () => {
    const e = entree({ cardioJours: [2] });
    const t = G.phrasesHybrides(G.generer(cat, e), e).join(' ');
    expect(t).not.toMatch(/gu[ée]ri|soign|maladie|prévent|perdre de la force\b(?! )/);
    expect(t).toMatch(/pas une règle prouvée/);
  });
});

describe('199 — `faits.joursDeCardioReguliers`', () => {
  const CATS = { course: { nature: 'cardio', mesure: 'distance_temps', equipement: 'aucun', muscles_primaires: [] },
                 squat: { nature: 'force', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['quadriceps'] } };
  const J = '2026-10-31T12:00:00Z';   // samedi 31/10 ; semaine courante = lundi 26/10 ; les 4 semaines pleines : 28/09 -> 25/10
  function corpus(defs) {   // defs : [[jourISO, [séries]]]
    const seances = defs.map(([d], i) => ({ id: 's' + i, debut: d + 'T07:00:00Z' }));
    const par = {}; defs.forEach(([, series], i) => { par['s' + i] = series; });
    return { seances, series: [], seriesDe: (id) => par[id] || [], catalogue: () => CATS };
  }
  const courir = (s, extra) => Object.assign({ exercise_slug: 'course', type_serie: 'travail', duree_s: s }, extra);
  const mercredis = ['2026-09-30', '2026-10-07', '2026-10-14', '2026-10-21'];

  test('4 mercredis de 45 min : le mercredi (2) est régulier, 4 des 4', () => {
    const r = Faits.creer().joursDeCardioReguliers(corpus(mercredis.map((d) => [d, [courir(2700)]])), J);
    expect(r).toEqual({ jours: [2], semaines: { 2: 4 } });
  });
  test('3 des 4 suffit, 2 ne suffit pas', () => {
    const f = Faits.creer();
    expect(f.joursDeCardioReguliers(corpus(mercredis.slice(0, 3).map((d) => [d, [courir(2700)]])), J).jours).toEqual([2]);
    expect(f.joursDeCardioReguliers(corpus(mercredis.slice(0, 2).map((d) => [d, [courir(2700)]])), J).jours).toEqual([]);
  });
  test('30 min pile ne compte pas (plus de 30), sauf si une série est intense (RPE 8)', () => {
    const f = Faits.creer();
    expect(f.joursDeCardioReguliers(corpus(mercredis.map((d) => [d, [courir(1800)]])), J).jours).toEqual([]);
    expect(f.joursDeCardioReguliers(corpus(mercredis.map((d) => [d, [courir(1200, { rpe: 8 })]])), J).jours).toEqual([2]);
  });
  test('deux séries le même jour s’additionnent ; la musculation ne compte pas ; la semaine en cours est écartée', () => {
    const f = Faits.creer();
    expect(f.joursDeCardioReguliers(corpus(mercredis.map((d) => [d, [courir(1000), courir(1000)]])), J).jours).toEqual([2]);
    expect(f.joursDeCardioReguliers(corpus(mercredis.map((d) => [d, [{ exercise_slug: 'squat', type_serie: 'travail', duree_s: 3600 }]])), J).jours).toEqual([]);
    expect(f.joursDeCardioReguliers(corpus(['2026-10-28', '2026-10-27', '2026-10-26'].map((d) => [d, [courir(3600)]])), J).jours).toEqual([]);
  });
  test('sans séance ou sans jour : vide', () => {
    expect(Faits.creer().joursDeCardioReguliers(corpus([]), J)).toEqual({ jours: [], semaines: {} });
    expect(Faits.creer().joursDeCardioReguliers(corpus([]), null)).toEqual({ jours: [], semaines: {} });
  });
});
