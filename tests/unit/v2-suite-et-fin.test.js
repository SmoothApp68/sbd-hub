/** @jest-environment node */
//
// PR 2 de la consolidation « un seul coach, un seul câblage » (relevé du
// 01/10/2026) — LA SUITE DU CONSTAT, ET UN SEUL « EXERCICE FINI ».
//
//   1. « L'exercice est fini » : une définition (`Seance.exerciceFini`), lue
//      par le plan pour ouvrir le constat et par l'app pour calculer la suite.
//      Le bloc (superset) se lit sur elle (`Seance.blocFini`).
//   2. La suite se recalcule quand ses options changent : une zone choisie sur
//      un exercice fini (le couché haltères du 26/09, Volume → Hypertrophie en
//      pleine séance, vu en base), une réponse à l'escalier.
//   3. I27 : la suite du constat porte la zone choisie de la consigne du jour.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const DEBUT = '2026-09-26T10:00:00+00:00';
const APRES = '2026-09-26T12:00:00+00:00';
const fait = (id, kg, reps, type) => ({ id, type_serie: type || 'travail', charge_kg: kg, reps, validee_a: '2026-09-26T10:30:00Z' });
const vide = (id, type) => ({ id, type_serie: type || 'travail', charge_kg: null, reps: null, validee_a: null });

// ── 1. UNE SEULE DÉFINITION ─────────────────────────────────────────────────
describe('PR 2 — « l’exercice est fini » : une définition', () => {
  const se = (exos) => ({ exercices: exos });
  test('toutes les séries de travail en base ; les chauffes et la dégressive n’y comptent pas', () => {
    expect(S.exerciceFini(se([{ exercise_slug: 'x', series: [vide('c', 'echauffement'), fait('a', 100, 5), fait('b', 100, 5),
      vide('d', 'degressive')] }]), 'x')).toBe(true);
    expect(S.exerciceFini(se([{ exercise_slug: 'x', series: [fait('a', 100, 5), vide('b')] }]), 'x')).toBe(false);
  });
  test('sans série de travail, il n’est pas fini ; un exercice absent non plus', () => {
    expect(S.exerciceFini(se([{ exercise_slug: 'x', series: [fait('c', 40, 10, 'echauffement')] }]), 'x')).toBe(false);
    expect(S.exerciceFini(se([]), 'x')).toBe(false);
  });
  test('un exercice présent deux fois compte ses deux occurrences', () => {
    const s = se([{ exercise_slug: 'x', series: [fait('a', 100, 5)] }, { exercise_slug: 'y', series: [fait('y1', 20, 10)] },
      { exercise_slug: 'x', series: [vide('b')] }]);
    expect(S.exerciceFini(s, 'x')).toBe(false);
    expect(S.exerciceFini(s, 'y')).toBe(true);
  });
  test('le bloc : un superset attend ses deux exercices ; `null` ne groupe pas', () => {
    const s = se([{ exercise_slug: 'x', groupe_superset: 'g', series: [fait('a', 100, 5)] },
      { exercise_slug: 'y', groupe_superset: 'g', series: [vide('b')] },
      { exercise_slug: 'z', groupe_superset: null, series: [fait('c', 50, 8)] },
      { exercise_slug: 'w', groupe_superset: null, series: [vide('d')] }]);
    expect(S.exerciceFini(s, 'x')).toBe(true);
    expect(S.blocFini(s, 'x')).toBe(false);
    expect(S.slugsDuBloc(s, 'y')).toEqual(['x', 'y']);
    expect(S.blocFini(s, 'z')).toBe(true);
    expect(S.slugsDuBloc(s, 'z')).toEqual(['z']);
  });

  test('⚠️ DISCRIMINANT — le plan n’ouvre le constat que sur l’exercice fini (une série de travail hors plan reste à faire)', () => {
    // Une semaine allégée : la consigne couvre 60 % des 4 séries de la
    // routine, la dernière série de travail reste HORS PLAN (le seul cas où
    // une série de travail l'est encore, I25). Les lignes couvertes sont
    // faites, la suite est donnée — mais l'exercice n'est pas fini. Avant, le
    // plan ouvrait le constat sur ses seules lignes.
    const base = { etat: 'progression', zone: 'hypertrophie', palier: 50, niveau: 9, n: 4,
      ligne: { charge: 50, vise: 10 }, haut: null, fondement: { reps: [9, 9, 9, 9] } };
    const k = M.consigneAllegee(base, 4);
    const suite = { consigne: Object.assign({}, base, { niveau: 10, ligne: { charge: 50, vise: 11 } }), cranSuivant: 52.5 };
    const plan = (series) => T.planDeSeance({ seance: { id: 'S', debut: DEBUT, edition: false,
      exercices: [{ exercise_slug: 'x', series }] }, consignes: { x: { consigne: k } }, paris: [], suites: { x: suite } });
    const couvre = k.allegee.series;
    const faites = [];
    for (let i = 0; i < couvre; i++) faites.push(fait('t' + i, 50, 8));
    const enCours = plan(faites.concat([vide('z')])).exercices[0];
    expect(enCours.lignes[couvre].role).toBe('hors');
    expect(enCours.lignes.filter((l) => l.role !== 'hors').every((l) => l.validee)).toBe(true);
    expect(enCours.constat).toBeNull();
    const fini = plan(faites.concat([fait('z', 50, 8)])).exercices[0];
    expect(fini.constat).not.toBeNull();
  });
});

// ── 2. LA SUITE SE RECALCULE QUAND SES OPTIONS CHANGENT ─────────────────────
//
// `suiteDe` (app.js), rejouée dans un bac : on compte les appels au moteur.
describe('PR 2 — la suite du constat suit la zone en vigueur', () => {
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const extraire = (nom) => {
    const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
    if (!m) throw new Error('introuvable : ' + nom);
    return m[0];
  };
  function bac() {
    const appels = [];
    const etat = { zone: 'volume', periodes: [] };
    const ctx = {
      seance: { id: 'S', debut: '2026-09-26T17:07:00Z' }, profil: { intention: 'progresser' },
      local: { exercices: [{ slug: 'couche', equipement: 'haltere' }], zones: [] },
      constats: null, etatsExercices: {}, rejeuEnCours: null,
      Modele: { gabaritDe: () => ({ mesure: 'charge_reps' }), lesteDe: () => null, parentDe: () => null },
      Profil: { rythmeDe: () => 'normal', salleDeLExercice: () => null },   // 108 — la salle (aucune ici)
      Seance: { partEnBase: () => true },
      Moteur: { suiteDExercice: (g, j, e, a, o) => { appels.push(o.correction); return { apres: { consigne: { zone: o.correction } }, cranSuivant: null }; },
                equipementEffectif: (e) => (e ? e.equipement || null : null) },
      // 50-1 : les deux lectures du profil et des modes que `optionsDeConsigne` appelle.
      intentionDeLExercice: () => 'progresser', lestReponseDe: () => null,
      catalogueIndexe: () => ({ couche: { slug: 'couche', equipement: 'haltere' } }),
      cleConsignes: () => 'k', empreinteValidations: () => 'e', exerciceFini: () => true,
      seriesDeTravailDe: () => [],
      // 58-1 : les séances d'un exercice viennent du module des faits.
      faits: { seancesDeLExercice: () => [] }, corpus: () => ({}),
      zoneDe: () => etat.zone, seancesSousConsigne: () => [],
      periodesAllegees: () => etat.periodes, periodesSerieDePlusDe: () => [], enEdition: () => false,
      // 52-1 : la charge de départ de la routine (MOTEUR §9.21), lue par `optionsDeConsigne`.
      chargeDeDepartDe: () => null,
      // 127 : la marche à proposer (MOTEUR §9.17 bis), lue par `optionsDeConsigne` — aucune ici.
      marcheAProposer: () => null,
      // 53-2 bis : la ligne de zone en vigueur (son origine, « Nouveau bloc »).
      ligneDeZoneDe: () => null,
      // 53-2 bis : les zones lues (`local.zones` sans les lignes rendues sans objet par un arrêt).
      zonesLues: () => []
    };
    vm.createContext(ctx);
    // 132 : l'historique et l'état que le moteur lit (`groupesDuMoteur`, `etatDuMoteur` : tels quels sans élastiques).
    ['estSalleElastique', 'groupesDuMoteur', 'etatDuMoteur', 'optionsDeConsigne', 'suiteDe'].forEach((n) => vm.runInContext(extraire(n), ctx));
    return { ctx, appels, etat, suite: () => vm.runInContext('suiteDe("couche")', ctx), constats: () => vm.runInContext('constats', ctx) };
  }

  test('mêmes options : la suite reste en cache (un seul calcul)', () => {
    const b = bac();
    b.suite(); b.suite();
    expect(b.appels).toEqual(['volume']);
  });

  test('⚠️ DISCRIMINANT — le couché du 26/09 : une zone choisie sur l’exercice fini recalcule la suite, et le mémo du plan le voit', () => {
    const b = bac();
    expect(b.suite().consigne.zone).toBe('volume');
    const avant = b.constats();
    b.etat.zone = 'hypertrophie';
    expect(b.suite().consigne.zone).toBe('hypertrophie');
    expect(b.appels).toEqual(['volume', 'hypertrophie']);
    // L'objet est remplacé : le mémo du plan (`planMemo.constats === constats`)
    // se recalcule.
    expect(b.constats()).not.toBe(avant);
  });

  test('une réponse à l’escalier (une période allégée de plus) recalcule aussi la suite', () => {
    const b = bac();
    b.suite();
    b.etat.periodes = [{ debut: '2026-09-26', fin: '2026-10-02' }];
    b.suite();
    expect(b.appels).toHaveLength(2);
  });
});

// ── 3. I27 ──────────────────────────────────────────────────────────────────
describe('PR 2 — I27 : la suite du constat a la zone choisie de la consigne', () => {
  // C1 (consigne-48b7) : une zone CHOISIE (Hypertrophie, la déduite est Volume).
  const C1 = require('./fixtures/consigne-48b7.json').filter((c) => c.id === 'C1')[0];
  const opts = (correction) => ({ reglage: C1.reglage, equipement: C1.equipement, correction });
  const k = M.consignePour(C1.seances, C1.avant, opts(C1.correction));
  function plan(correctionDeLaSuite) {
    const series = [fait('a', k.ligne.charge, k.ligne.vise), fait('b', k.ligne.charge, k.ligne.vise),
      fait('c', k.ligne.charge, k.ligne.vise)].slice(0, k.n);
    const tous = C1.seances.concat(M.contratDe([{ seance: { debut: DEBUT }, series }], null, 'charge_reps'));
    const apres = M.consignePour(tous, APRES, opts(correctionDeLaSuite));
    const e = { seance: { id: 'S', debut: DEBUT, edition: false, exercices: [{ exercise_slug: 'x', series }] },
      consignes: { x: { consigne: k } }, paris: [], suites: { x: { consigne: apres, cranSuivant: null } } };
    return T.planDeSeance(e);
  }
  const I27 = (p) => T.verifierPlan(p).erreurs.filter((e) => e.indexOf('I27') === 0);

  test('prémisse : C1 est en zone choisie (Hypertrophie)', () => {
    expect(C1.correction).toBe('hypertrophie');
    expect(k.zone).toBe('hypertrophie');
    expect(k.fondement.correction).toBeTruthy();
  });

  test('la suite calculée avec la même zone choisie : I27 ne dit rien', () => {
    const p = plan(C1.correction);
    expect(p.exercices[0].constat).not.toBeNull();
    expect(I27(p)).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — une suite restée sur la zone d’avant (sans la correction) : I27 la voit', () => {
    const p = plan(null);
    expect(p.exercices[0].constat).not.toBeNull();
    expect(I27(p)).toHaveLength(1);
    expect(I27(p)[0]).toMatch(/zone choisie aucune, la consigne du jour hypertrophie/);
  });

  test('une autre zone choisie pour la suite : I27 la voit aussi', () => {
    expect(I27(plan('lourd'))).toHaveLength(1);
  });
});
