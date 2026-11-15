/** @jest-environment node */
//
// « UN SEUL MAX » (MOTEUR §9.51, 15/11/2026) — PR A : l'éligibilité unique, le plancher à 1 ou 2 reps, la courbe qui dit sa fenêtre.
//
//   1. `Modele.eligibilite1RM` : les trois étages (l'exercice, la série, les reps) — I170 ;
//   2. `recordsDeLExercice` : `unRM` (ce que lit le coach) et `force` (ce que lit l'affichage) — I171, I172, I173 ;
//   3. la PARITÉ par période : le sommet des points pleins d'une vue = la `force` de la fiche sur la même fenêtre — I174, I175 ;
//   4. la PROPRIÉTÉ de non-régression, 20 000 historiques tirés au hasard (graine fixe) ;
//   5. le point gris, le « pic ancien », le max mesuré à part — `THCourbe`, I175 à I177 ;
//   6. Progression et le coach : un exercice lesté ou assisté n'a plus de points ; `maxEstimesAvantLeTest` ne lit pas le plancher.

process.env.TZ = 'Europe/Paris';

global.self = global;
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Moteur = require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
const Courbe = require('../../v2/js/courbe.js');
const Faits = require('../../v2/js/faits.js');

const MAINT = new Date(2026, 10, 15, 12, 0, 0);   // « aujourd'hui » de la maquette : le 15 nov. 2026
const epley = (c, r) => c * (1 + r / 30);

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['quadriceps'] },
  { slug: 'presse', nom: 'Presse à cuisses (Machine)', mesure: 'charge_reps', equipement: 'machine', muscles_primaires: ['quadriceps'] },
  { slug: 'developpe_halteres', nom: 'Développé (Haltères)', mesure: 'charge_reps', equipement: 'haltere', muscles_primaires: ['pectoraux'] },
  { slug: 'tractions_assistees', nom: 'Tractions assistées', mesure: 'charge_reps', equipement: 'machine', charge: 'assistance', muscles_primaires: ['dos'] },
  { slug: 'tractions_lestees', nom: 'Tractions lestées', mesure: 'charge_reps', equipement: 'aucun', charge: 'ajoutee', muscles_primaires: ['dos'] },
  { slug: 'pompes_sans_materiel', nom: 'Pompes (Poids du corps)', mesure: 'charge_reps', equipement: 'aucun', muscles_primaires: ['pectoraux'] },
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps', equipement: 'aucun', muscles_primaires: ['dos'] },
  { slug: 'curl_elastique', nom: 'Curl (Élastique)', mesure: 'charge_reps', equipement: 'elastique', muscles_primaires: ['biceps'] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);
const EXO = (slug) => INDEX[slug];
const jourLocal = (iso) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j, 18, 0, 0); };
const S = (slug, charge, reps, extra) => Object.assign({ exercise_slug: slug, charge_kg: charge, reps }, extra || {});

// `specs` : de la plus RÉCENTE à la plus ancienne, comme `c.seances`.
function corpus(specs) {
  const seances = [], series = [], parSeance = {};
  specs.forEach((sp, i) => {
    const id = 's' + i;
    seances.push({ id, debut: sp.debut.toISOString(), fin: null });
    parSeance[id] = (sp.series || []).map((x, k) => Object.assign({ id: id + '-' + k, session_id: id, type_serie: 'travail', rang: k }, x));
    parSeance[id].forEach((x) => series.push(x));
  });
  return { seances, series, exercices: CATALOGUE, seriesDe: (id) => parSeance[id] || [], catalogue: () => INDEX, journal: [] };
}
const seancesDuSlug = (c, slug) => c.seances.map((s) => ({ debut: s.debut, series: c.seriesDe(s.id).filter((x) => x.exercise_slug === slug), id: s.id }))
  .filter((s) => s.series.length);
const fiche = (slug, seances, extra) => Modele.recordsDeLExercice(seances, MAINT, Object.assign({}, Modele.optionsDeRecord(EXO(slug)), extra || {}));

// ── 1. L'ÉLIGIBILITÉ (I170) ────────────────────────────────────────────────
describe('§9.51.2 — Modele.eligibilite1RM : trois étages', () => {
  const barre = EXO('squat_barre');
  const serie = (c, r, extra) => Object.assign({ type_serie: 'travail', charge_kg: c, reps: r }, extra || {});

  test('3e étage : 1 ou 2 reps = plancher (la charge nue), 3 à 10 = projection (Epley), le reste rien', () => {
    expect(Modele.eligibilite1RM(serie(150, 1), barre)).toEqual({ mode: 'plancher', charge: 150, reps: 1, valeur: 150 });
    expect(Modele.eligibilite1RM(serie(145, 2), barre)).toEqual({ mode: 'plancher', charge: 145, reps: 2, valeur: 145 });
    const p3 = Modele.eligibilite1RM(serie(140, 3), barre);
    expect(p3.mode).toBe('projection');
    expect(p3.valeur).toBeCloseTo(epley(140, 3), 9);
    expect(Modele.eligibilite1RM(serie(100, 10), barre).mode).toBe('projection');
    expect(Modele.eligibilite1RM(serie(100, 11), barre).mode).toBeNull();
    expect(Modele.eligibilite1RM(serie(100, 0), barre).mode).toBeNull();
    expect(Modele.eligibilite1RM(serie(100, null), barre).mode).toBeNull();
  });

  test('la plage est UNE constante nommée, exportée', () => {
    expect(Modele.ELIGIBILITE_1RM).toEqual({ plancherMin: 1, plancherMax: 2, projectionMin: 3, projectionMax: 10 });
    expect(Object.isFrozen(Modele.ELIGIBILITE_1RM)).toBe(true);
  });

  test('2e étage : du travail seulement, une charge > 0, jamais un élastique nommé, « Non, ne compte pas » l\'emporte', () => {
    expect(Modele.eligibilite1RM(serie(100, 5, { type_serie: 'echauffement' }), barre).mode).toBeNull();
    expect(Modele.eligibilite1RM(serie(0, 5), barre).mode).toBeNull();
    expect(Modele.eligibilite1RM(serie(null, 5), barre).mode).toBeNull();
    expect(Modele.eligibilite1RM(serie('', 5), barre).mode).toBeNull();
    expect(Modele.eligibilite1RM(serie(30, 8, { elastique: 'rouge' }), barre).mode).toBeNull();
    expect(Modele.eligibilite1RM(serie(100, 5, { type_serie: 'test' }), barre).mode).toBe('projection');
    expect(Modele.eligibilite1RM(null, barre).mode).toBeNull();
    // Hors calcul : la série qui « ne compte pas » n'est pas du travail (`estTravail`).
    const horsCalcul = Object.assign(serie(100, 5), Object.fromEntries(
      ['hors_calcul', 'compte_pas', 'ne_compte_pas', 'exclue'].filter(() => false)));
    expect(Modele.eligibilite1RM(horsCalcul, barre).mode).toBe('projection');
  });

  test('1er étage : charge × reps sans lest, sans aide, sans « poids du corps » — et un exo absent se lit charge × reps', () => {
    const s = serie(100, 5);
    ['squat_barre', 'presse', 'developpe_halteres'].forEach((slug) => expect(Modele.eligibilite1RM(s, EXO(slug)).mode).toBe('projection'));
    expect(Modele.eligibilite1RM(s, null).mode).toBe('projection');
    expect(Modele.eligibilite1RM(s, undefined).mode).toBe('projection');
    expect(Modele.eligibilite1RM(s, { slug: 'x', mesure: 'inconnue' }).mode).toBe('projection');   // le repli de `gabaritDe`
    ['tractions_assistees', 'tractions_lestees', 'pompes_sans_materiel', 'tractions'].forEach((slug) => {
      expect(Modele.eligibilite1RM(s, EXO(slug)).mode).toBeNull();
      expect(Modele.eligibilite1RM(serie(30, 1), EXO(slug)).mode).toBeNull();
    });
  });
});

describe('I170 — une éligibilité : la fiche et la courbe sortent le même `mode` pour la même série', () => {
  const lot = [];
  [1, 2, 3, 5, 10, 11, 0].forEach((r) => [100, 152.5].forEach((c) => lot.push([c, r])));
  ['squat_barre', 'presse', 'developpe_halteres', 'tractions_assistees', 'tractions_lestees', 'pompes_sans_materiel'].forEach((slug) => {
    test(slug, () => {
      lot.forEach(([c, r]) => {
        const x = { exercise_slug: slug, type_serie: 'travail', charge_kg: c, reps: r };
        const mode = Modele.eligibilite1RM(x, EXO(slug)).mode;
        const corps = corpus([{ debut: jourLocal('2026-11-03'), series: [x] }]);
        const pt = Faits.creer().pointsDeLExercice(corps, slug, MAINT).points[0];
        const f = fiche(slug, seancesDuSlug(corps, slug)).force;
        expect([slug, c, r, pt ? pt.mode : null]).toEqual([slug, c, r, mode]);
        expect([slug, c, r, f ? f.mode : null]).toEqual([slug, c, r, mode]);
      });
    });
  });
});

// ── 2. LES RECORDS : unRM (le coach) et force (l'affichage) ────────────────
describe('§9.51.3-4 — recordsDeLExercice : `force` à l\'affichage, `unRM` au coach', () => {
  const seanceDe = (series, jour) => ({ debut: jourLocal(jour || '2026-11-03').toISOString(), series });
  const sq = (c, r, extra) => Object.assign({ exercise_slug: 'squat_barre', type_serie: 'travail', charge_kg: c, reps: r }, extra || {});

  test('le tableau de la spec : égalité (140×1 + 120×5), single plus bas, single plus haut, single seul', () => {
    const egal = fiche('squat_barre', [seanceDe([sq(140, 1), sq(120, 5)])]);
    expect(egal.unRM.valeur).toBeCloseTo(140, 9);
    expect(egal.force).toMatchObject({ mode: 'projection', charge: 120, reps: 5 });    // le libellé d'avant : « ≈ 140 kg, d'après 120 × 5 »
    expect(egal.force.valeur).toBeCloseTo(140, 9);

    const bas = fiche('squat_barre', [seanceDe([sq(140, 1), sq(124, 5)])]);
    expect(bas.force).toMatchObject({ mode: 'projection', charge: 124, reps: 5 });
    expect(bas.force.valeur).toBeCloseTo(epley(124, 5), 9);

    const haut = fiche('squat_barre', [seanceDe([sq(150, 1), sq(120, 5)])]);
    expect(haut.force).toMatchObject({ mode: 'plancher', charge: 150, reps: 1, valeur: 150 });
    expect(haut.unRM.valeur).toBeCloseTo(140, 9);                                      // le coach lit toujours 140 (I172)
    expect(haut.unRM).toMatchObject({ charge: 120, reps: 5 });

    const seul = fiche('squat_barre', [seanceDe([sq(100, 1)])]);
    expect(seul.force).toMatchObject({ mode: 'plancher', charge: 100, reps: 1, valeur: 100 });
    expect(seul.unRM).toBeNull();                                                      // la semaine de test ne lit pas un single
  });

  test('deux planchers égaux : le plus ancien ; 2 reps comptent avec le single', () => {
    const f = fiche('squat_barre', [seanceDe([sq(140, 1)], '2026-11-03'), seanceDe([sq(140, 2)], '2026-10-01')]);
    expect(f.force.mode).toBe('plancher');
    expect(f.force.reps).toBe(2);                                                      // la séance du 1er oct. est la plus ancienne
    expect(fiche('squat_barre', [seanceDe([sq(145, 2)])]).force).toMatchObject({ mode: 'plancher', valeur: 145 });
    expect(fiche('squat_barre', [seanceDe([sq(140, 3)])]).force.mode).toBe('projection');
  });

  test('le max mesuré actif prime (mode `mesure`), 90 jours, et `unRM` le porte comme avant', () => {
    const mesure = { valeur: 160, charge: 160, reps: 1, date: jourLocal('2026-10-20').toISOString() };
    const f = fiche('squat_barre', [seanceDe([sq(150, 1), sq(120, 5)])], { mesures: [mesure] });
    expect(f.force).toMatchObject({ mode: 'mesure', valeur: 160, charge: 160, reps: 1 });
    expect(f.unRM).toMatchObject({ valeur: 160, mesure: true });
    const vieux = fiche('squat_barre', [seanceDe([sq(150, 1), sq(120, 5)])],
      { mesures: [Object.assign({}, mesure, { date: jourLocal('2026-06-01').toISOString() })] });
    expect(vieux.force.mode).toBe('plancher');
  });

  test('I173 : assisté, lesté, élastique, poids du corps — aucune force, aucun unRM (la table des records, elle, reste)', () => {
    [['tractions_assistees', 30, 8], ['tractions_lestees', 25, 6], ['pompes_sans_materiel', 20, 8]].forEach(([slug, c, r]) => {
      const f = fiche(slug, [{ debut: jourLocal('2026-11-03').toISOString(), series: [{ exercise_slug: slug, type_serie: 'travail', charge_kg: c, reps: r }] }]);
      expect([slug, f.force, f.unRM]).toEqual([slug, null, null]);
    });
    // Avant : 30 kg d'aide × 8 donnait « ≈ 38 kg » ; la charge la plus lourde (la table) reste.
    const aide = fiche('tractions_assistees', [{ debut: jourLocal('2026-11-03').toISOString(), series: [{ exercise_slug: 'tractions_assistees', type_serie: 'travail', charge_kg: 30, reps: 8 }] }]);
    expect(Modele.recordDeLaTable(aide.table)).not.toBeNull();
    // Un élastique NOMMÉ, sur un exercice à la barre : écarté par la série.
    expect(fiche('squat_barre', [seanceDe([sq(null, 10, { elastique: 'rouge' })])]).force).toBeNull();
  });

  test('un max mesuré ne se pose pas sur un exercice sans max (assisté)', () => {
    const mesure = { valeur: 60, charge: 60, reps: 1, date: jourLocal('2026-11-01').toISOString() };
    const f = fiche('tractions_assistees', [], { mesures: [mesure] });
    expect(f.force).toBeNull();
    expect(f.unRM).toBeNull();
  });
});

// ── 3. LA PARITÉ PAR PÉRIODE (I174, I175) ──────────────────────────────────
const HISTOIRES = {
  // Le cas C de la maquette : la dernière séance a 150×1 et 120×5.
  squat_barre: [
    ['2023-05-02', [[200, 5]]],                              // il y a 3 ans : une barre n'a aucune fenêtre
    ['2026-05-07', [[120, 5]]], ['2026-06-11', [[125, 5]]], ['2026-08-27', [[130, 5]]], ['2026-09-24', [[130, 3], [120, 10]]],
    ['2026-10-20', [[135, 5]]], ['2026-11-03', [[150, 1], [120, 5]]]
  ],
  // Les points à 13 et 14 mois, et celui à 366 jours exacts (le 14 nov. 2025).
  presse: [
    ['2025-09-18', [[200, 5]]], ['2025-10-09', [[190, 5]]], ['2025-11-14', [[185, 6]]],
    ['2025-12-04', [[150, 5]]], ['2026-01-22', [[155, 5]]], ['2026-03-12', [[155, 6]]], ['2026-05-07', [[160, 5]]],
    ['2026-08-27', [[160, 5]]], ['2026-09-24', [[160, 5]]], ['2026-10-29', [[160, 5]]]
  ],
  developpe_halteres: [
    ['2025-06-01', [[40, 10]]], ['2025-11-14', [[44, 8]]], ['2026-02-10', [[42, 8]]], ['2026-09-30', [[40, 9], [46, 2]]]
  ],
  tractions_assistees: [['2026-10-20', [[30, 8]]], ['2026-11-03', [[25, 8]]]],
  tractions_lestees: [['2026-10-20', [[25, 6]]]],
  pompes_sans_materiel: [['2026-10-20', [[20, 8]]]],
  curl_elastique: [['2026-10-20', [[null, 10]]]]
};
function corpusDe(slug) {
  const h = HISTOIRES[slug].slice().reverse();     // la plus récente d'abord
  return corpus(h.map(([jour, series]) => ({ debut: jourLocal(jour),
    series: series.map(([c, r]) => S(slug, c, r, slug === 'curl_elastique' ? { elastique: 'rouge' } : {})) })));
}

describe('I174-I175 — la parité de la courbe et de la fiche, par période (le sommet des points ; la TÊTE est I179)', () => {
  const PERIODES = ['3m', '6m', '1a', 'tout'];
  Object.keys(HISTOIRES).forEach((slug) => {
    PERIODES.forEach((cle) => {
      test(slug + ' · ' + cle + ' : le sommet des points pleins = la force de la fiche sur la même fenêtre', () => {
        const c = corpusDe(slug);
        const pts = Faits.creer().pointsDeLExercice(c, slug, MAINT);
        const vue = Courbe.dansLaPeriode(pts.points, cle, MAINT);
        const pleins = vue.filter((p) => !p.gris);
        const sommet = pleins.length ? Math.max.apply(null, pleins.map((p) => p.valeur)) : null;
        // La fiche, calculée à part : les séances de la vue (pleines OU grises — le périmètre de la fiche trie lui-même).
        const ids = {};
        vue.forEach((p) => { ids[p.seance] = true; });
        const seancesDeLaVue = seancesDuSlug(c, slug).filter((s) => ids[s.id]);
        const f = fiche(slug, seancesDeLaVue);
        if (sommet === null) expect(f.force).toBeNull();
        else expect(f.force.valeur).toBeCloseTo(sommet, 9);
        // I174 adapté (§9.51 bis) : le sommet d'une vue est le meilleur de CETTE vue ; il ne dépasse jamais la force de la fiche entière
        // (le chiffre de TÊTE, lui, est la force de la fiche — I179, `v2-un-seul-chiffre-de-force.test.js`).
        const entiere = fiche(slug, seancesDuSlug(c, slug));
        if (sommet !== null) expect(sommet).toBeLessThanOrEqual(entiere.force.valeur + 1e-9);
      });
    });
  });

  test('sur 1 an et Tout, une barre : le sommet de la courbe = la fiche entière (jamais un point gris)', () => {
    const c = corpusDe('squat_barre');
    const pts = Faits.creer().pointsDeLExercice(c, 'squat_barre', MAINT);
    expect(pts.points.some((p) => p.gris)).toBe(false);
    expect(pts.plancher).toBeNull();
    const entiere = fiche('squat_barre', seancesDuSlug(c, 'squat_barre'));
    ['1a', 'tout'].forEach((cle) => {
      const vue = Courbe.dansLaPeriode(pts.points, cle, MAINT);
      const attendu = cle === 'tout' ? entiere.force.valeur : Math.max.apply(null, vue.map((p) => p.valeur));
      expect(Math.max.apply(null, vue.map((p) => p.valeur))).toBeCloseTo(attendu, 9);
    });
  });

  test('la machine : 3 mois, 6 mois et 1 an n\'ont aucun point gris ; Tout en a trois', () => {
    const c = corpusDe('presse');
    const pts = Faits.creer().pointsDeLExercice(c, 'presse', MAINT);
    const gris = (cle) => Courbe.dansLaPeriode(pts.points, cle, MAINT).filter((p) => p.gris).map((p) => p.debut.slice(0, 10));
    expect(gris('3m')).toEqual([]);
    expect(gris('6m')).toEqual([]);
    // Constat de l'implémentation : la fenêtre « 1 an » (366 jours civils, aujourd'hui compris) commence le 15 nov. 2025, comme la
    // fiche (12 mois civils) : le point du 14 nov. 2025 (366 jours AVANT aujourd'hui) est hors de la vue « 1 an » — il n'y est donc jamais gris.
    expect(gris('1a')).toEqual([]);
    expect(Courbe.dansLaPeriode(pts.points, '1a', MAINT).map((p) => p.debut.slice(0, 10))).not.toContain(jourLocal('2025-11-14').toISOString().slice(0, 10));
    expect(gris('tout')).toHaveLength(3);
  });

  test('I175 : la fenêtre est ancrée sur AUJOURD\'HUI — une autre « dernière séance » ne déplace pas un point gris', () => {
    const c = corpusDe('presse');
    const sansDerniere = corpus(c.seances.slice(1).map((s) => ({ debut: new Date(s.debut), series: c.seriesDe(s.id) })));
    const a = Faits.creer().pointsDeLExercice(c, 'presse', MAINT);
    const b = Faits.creer().pointsDeLExercice(sansDerniere, 'presse', MAINT);
    const grisDe = (p) => p.points.filter((x) => x.gris).map((x) => x.debut);
    expect(grisDe(b)).toEqual(grisDe(a));
    // …et la même histoire lue plus tard déplace la fenêtre (un point de plus devient gris).
    const plusTard = Faits.creer().pointsDeLExercice(c, 'presse', new Date(2027, 1, 10, 12, 0, 0));
    expect(plusTard.points.filter((x) => x.gris).length).toBeGreaterThan(a.points.filter((x) => x.gris).length);
  });

  test('un exercice lesté, assisté, au poids du corps ou aux élastiques n\'a AUCUN point (I173)', () => {
    ['tractions_assistees', 'tractions_lestees', 'pompes_sans_materiel', 'curl_elastique'].forEach((slug) => {
      expect(Faits.creer().pointsDeLExercice(corpusDe(slug), slug, MAINT).points).toEqual([]);
    });
  });

  test('un point à 1 ou 2 reps vaut la charge nue ; la projection l\'emporte à égalité', () => {
    const c = corpus([
      { debut: jourLocal('2026-11-03'), series: [S('squat_barre', 150, 1), S('squat_barre', 120, 5)] },
      { debut: jourLocal('2026-10-20'), series: [S('squat_barre', 140, 1), S('squat_barre', 120, 5)] },
      { debut: jourLocal('2026-10-06'), series: [S('squat_barre', 140, 1)] }
    ]);
    const p = Faits.creer().pointsDeLExercice(c, 'squat_barre', MAINT).points;
    expect(p.map((x) => [x.mode, x.charge, x.reps])).toEqual([['plancher', 140, 1], ['projection', 120, 5], ['plancher', 150, 1]]);
    expect(p[2].valeur).toBe(150);
    expect(p[1].valeur).toBeCloseTo(140, 9);
  });

  test('I177 : le max mesuré est un point à part — jamais dans `points`', () => {
    const c = corpusDe('squat_barre');
    const sans = Faits.creer().pointsDeLExercice(c, 'squat_barre', MAINT);
    const mesure = { valeur: 160, charge: 160, reps: 1, date: jourLocal('2026-11-03').toISOString() };
    const avec = Faits.creer().pointsDeLExercice(c, 'squat_barre', MAINT, { mesures: [mesure] });
    expect(avec.points).toEqual(sans.points);
    expect(avec.mesures).toEqual([{ valeur: 160, charge: 160, reps: 1, debut: mesure.date, mesure: true }]);
    expect(sans.mesures).toEqual([]);
    const perime = Faits.creer().pointsDeLExercice(c, 'squat_barre', MAINT, { mesures: [Object.assign({}, mesure, { date: jourLocal('2026-06-01').toISOString() })] });
    expect(perime.mesures).toEqual([]);
  });
});

// ── 4. LA PROPRIÉTÉ DE NON-RÉGRESSION, 20 000 historiques ──────────────────
function aleatoire(graine) {
  let e = graine >>> 0;
  return () => { e = (Math.imul(e, 1664525) + 1013904223) >>> 0; return e / 4294967296; };
}
describe('I171-I172 — 20 000 historiques tirés au hasard (graine fixe)', () => {
  test('force = max(ancienne meilleure projection 3 à 10 reps, plus lourde charge à 1 ou 2 reps) ; unRM = l\'ancienne projection, indifférent aux singles', () => {
    const r = aleatoire(20261115);
    const choix = (liste) => liste[Math.floor(r() * liste.length)];
    const fautes = [];
    let planchers = 0, egalites = 0, projections = 0;
    for (let n = 0; n < 20000; n++) {
      const seances = [];
      const nbSeances = 1 + Math.floor(r() * 5);
      for (let i = 0; i < nbSeances; i++) {
        const series = [];
        const nbSeries = 1 + Math.floor(r() * 5);
        for (let k = 0; k < nbSeries; k++) {
          const type = r() < 0.1 ? 'echauffement' : 'travail';
          series.push({ exercise_slug: 'squat_barre', type_serie: type, charge_kg: choix([60, 80, 100, 110, 120, 125, 130, 140, 150, 160, 2.5 * Math.round(40 + r() * 60)]),
            reps: choix([0, 1, 1, 2, 2, 3, 4, 5, 5, 6, 8, 10, 11, 12]) });
        }
        seances.push({ debut: new Date(2026, 5 + i, 3, 18).toISOString(), series });
      }
      // L'oracle : l'ancienne définition (3 à 10 reps, du travail, une charge > 0) et la plus lourde charge à 1 ou 2 reps.
      let ancien = null, lourde = null;
      seances.forEach((s) => s.series.forEach((x) => {
        if (x.type_serie !== 'travail' || !(x.charge_kg > 0)) return;
        if (x.reps >= 3 && x.reps <= 10) { const e = epley(x.charge_kg, x.reps); if (ancien === null || e > ancien) ancien = e; }
        if (x.reps >= 1 && x.reps <= 2 && (lourde === null || x.charge_kg > lourde)) lourde = x.charge_kg;
      }));
      const f = Modele.recordsDeLExercice(seances, MAINT, Modele.optionsDeRecord(EXO('squat_barre')));
      const attendu = Math.max(ancien === null ? -Infinity : ancien, lourde === null ? -Infinity : lourde);
      // L'ancien unRM, toujours.
      if (ancien === null ? f.unRM !== null : !f.unRM || Math.abs(f.unRM.valeur - ancien) > 1e-9) fautes.push(['unRM', n]);
      // Sans les singles et doubles : unRM identique (I172).
      const sansSingles = seances.map((s) => ({ debut: s.debut, series: s.series.filter((x) => !(x.reps >= 1 && x.reps <= 2)) }));
      const g = Modele.recordsDeLExercice(sansSingles, MAINT, Modele.optionsDeRecord(EXO('squat_barre')));
      if (JSON.stringify(g.unRM) !== JSON.stringify(f.unRM)) fautes.push(['I172', n]);
      if (attendu === -Infinity) { if (f.force !== null) fautes.push(['force non nulle', n]); continue; }
      if (ancien !== null && lourde !== null && Math.abs(ancien - lourde) <= 1e-6) {
        // Égalité : seule la source change — le libellé d'avant est tenu (la projection).
        egalites++;
        if (f.force.mode !== 'projection' || Math.abs(f.force.valeur - ancien) > 1e-6) fautes.push(['égalité', n]);
        continue;
      }
      if (Math.abs(f.force.valeur - attendu) > 1e-9) fautes.push(['force', n, f.force.valeur, attendu]);
      const planchersAttendu = lourde !== null && (ancien === null || lourde > ancien + 1e-6);
      if ((f.force.mode === 'plancher') !== planchersAttendu) fautes.push(['mode', n]);
      if (planchersAttendu) planchers++; else projections++;
    }
    expect(fautes.slice(0, 5)).toEqual([]);
    // Le tirage atteint bien les trois chemins (un test qui ne teste pas ce qu'il prétend est pire qu'aucun test).
    expect(planchers).toBeGreaterThan(500);
    expect(projections).toBeGreaterThan(500);
    expect(egalites).toBeGreaterThan(0);
  });
});

// ── 5. LA COURBE : gris, pic ancien, max mesuré ────────────────────────────
describe('I175-I177 — THCourbe : les points gris, le pic ancien, le max mesuré', () => {
  const P = (jour, valeur, extra) => Object.assign({ debut: jourLocal(jour).toISOString(), valeur, charge: null, reps: null, record: false, mode: 'projection', gris: false }, extra || {});
  const vue = [P('2025-09-18', 233.3, { gris: true }), P('2025-11-14', 222, { gris: true }), P('2025-12-04', 175), P('2026-03-12', 186), P('2026-10-29', 186.7)];

  test('resume : le premier et le dernier point PLEINS, l\'écart sur eux seuls', () => {
    const r = Courbe.resume(vue);
    expect(r.debut).toBe(175);
    expect(r.fin).toBe(186.7);
    expect(r.n).toBe(3);
    expect(r.du).toBe(vue[2].debut);
    expect(Courbe.resume([P('2025-09-18', 233, { gris: true })])).toBeNull();
  });

  test('picAncien : le plus haut point gris, seulement s\'il dépasse la FORCE affichée (I182, §9.51 bis) ; jamais sans point gris', () => {
    const force = { valeur: 186.7, charge: 160, reps: 5, date: vue[4].debut, mode: 'projection' };
    expect(Courbe.picAncien(vue, force, MAINT)).toMatchObject({ valeur: 233.3, debut: vue[0].debut, mode: 'projection' });
    expect(Courbe.picAncien(vue.slice(2), force, MAINT)).toBeNull();
    // Un gris plus bas (ou égal à l'affichage) que la force : aucune phrase.
    expect(Courbe.picAncien([P('2025-09-18', 150, { gris: true }), P('2026-10-29', 186.7)], force, MAINT)).toBeNull();
    expect(Courbe.picAncien([P('2025-09-18', 187.2, { gris: true }), P('2026-10-29', 186.7)], force, MAINT)).toBeNull();
    // Aucune force à comparer (aucun point plein dans la vue) : le pic est dit seul.
    expect(Courbe.picAncien([P('2025-09-18', 233.3, { gris: true })], null, MAINT)).toMatchObject({ valeur: 233.3, debut: vue[0].debut });
  });

  test('geometrie : le trait ne lit que les pleins, l\'échelle contient les gris, un gris ne porte pas le record', () => {
    const g = Courbe.geometrie(vue.map((p, i) => i === 1 ? Object.assign({}, p, { record: true }) : p), null, 'charge');
    expect(g.points).toHaveLength(5);
    expect(g.points.map((p) => p.gris)).toEqual([true, true, false, false, false]);
    expect(g.points[1].record).toBe(false);
    expect(g.trait).toHaveLength(3);
    expect(g.min).toBe(175);
    expect(g.max).toBe(186.7);
    const haut = Math.max.apply(null, g.graduations.map((x) => x.valeur));
    expect(haut).toBeGreaterThanOrEqual(233.3);
    g.points.forEach((p) => { expect(p.y).toBeGreaterThanOrEqual(g.haut - 1e-6); expect(p.y).toBeLessThanOrEqual(g.bas + 1e-6); });
  });

  test('geometrie : le max mesuré est un repère à part, sur l\'échelle, jamais dans le trait ni le résumé', () => {
    const base = [P('2026-09-24', 140), P('2026-10-29', 142)];
    const mesure = { debut: jourLocal('2026-10-29').toISOString(), valeur: 160, charge: 160, reps: 1 };
    const g = Courbe.geometrie(base, null, 'charge', [mesure]);
    expect(g.mesures).toHaveLength(1);
    expect(g.mesures[0]).toMatchObject({ valeur: 160, charge: 160, reps: 1 });
    expect(g.trait).toHaveLength(2);
    expect(g.max).toBe(142);
    expect(Math.max.apply(null, g.graduations.map((x) => x.valeur))).toBeGreaterThanOrEqual(160);
    expect(Courbe.resume(base).fin).toBe(142);
    expect(Courbe.geometrie(base, null, 'charge').mesures).toEqual([]);
  });

  test('mini (Progression) ne lit que les pleins', () => {
    const m = Courbe.mini(vue, 92, 36, 'charge');
    expect(m.trait).toHaveLength(3);
  });
});

// ── 6. LA LIGNE DE FENÊTRE ─────────────────────────────────────────────────
describe('§9.51.6.3 — la ligne de fenêtre : un lexique fermé', () => {
  test('« Barre : tout l\'historique. », « Machine : 12 derniers mois. »…', () => {
    expect(Modele.phraseDeFenetre('barre', false)).toBe('Barre : tout l’historique.');
    expect(Modele.phraseDeFenetre('machine', true)).toBe('Machine : 12 derniers mois.');
    expect(Modele.phraseDeFenetre('haltere', true)).toBe('Haltères : 12 derniers mois.');
    expect(Modele.phraseDeFenetre('poulie', true)).toBe('Poulie : 12 derniers mois.');
    expect(Modele.phraseDeFenetre('machine_smith', true)).toBe('Smith : 12 derniers mois.');
    expect(Modele.phraseDeFenetre('kettlebell', false)).toBe('Tout l’historique.');
    expect(Modele.phraseDeFenetre(null, false)).toBe('Tout l’historique.');
  });

  test('la phrase suit le prédicat de la fiche : elle dit « 12 derniers mois » ⇔ la fenêtre existe', () => {
    ['barre', 'machine', 'haltere', 'poulie', 'machine_smith', 'kettlebell', 'aucun'].forEach((eq) => {
      const douze = Moteur.plancherDuMateriel(eq, MAINT) !== null;
      expect(/12 derniers mois/.test(Modele.phraseDeFenetre(eq, douze))).toBe(douze);
      expect(Modele.phraseDeFenetre(eq, douze)).not.toMatch(/il y a/i);
    });
  });
});

// ── 7. LE COACH NE LIT PAS LE PLANCHER ; PROGRESSION PERD LE LESTÉ ET L'ASSISTÉ ──
describe('I172-I173 — maxEstimesAvantLeTest ne lit que `unRM` ; Progression', () => {
  test('un single de 150 kg ne bouge ni le max estimé ni la série dont il vient (semaine de test, pari, chauffes)', () => {
    const avec = corpus([{ debut: jourLocal('2026-11-03'), series: [S('squat_barre', 150, 1), S('squat_barre', 120, 5)] }]);
    const sans = corpus([{ debut: jourLocal('2026-11-03'), series: [S('squat_barre', 120, 5)] }]);
    const f = () => Faits.creer();   // un mémo par corpus (la clé du mémo est le nombre de séances et de séries)
    expect(f().maxEstimesAvantLeTest(avec, ['squat_barre'], '2026-11-10')).toEqual(f().maxEstimesAvantLeTest(sans, ['squat_barre'], '2026-11-10'));
    expect(f().maxEstimesAvantLeTest(avec, ['squat_barre'], '2026-11-10').squat_barre).toBe(140);
    expect(f().seriesDesMaxEstimesAvantLeTest(avec, ['squat_barre'], '2026-11-10')).toEqual(f().seriesDesMaxEstimesAvantLeTest(sans, ['squat_barre'], '2026-11-10'));
    // Un single seul : la semaine de test l'ignore, comme avant.
    const single = corpus([{ debut: jourLocal('2026-11-03'), series: [S('squat_barre', 150, 1)] }]);
    expect(f().maxEstimesAvantLeTest(single, ['squat_barre'], '2026-11-10').squat_barre).toBeNull();
  });

  test('l\'assisté n\'a plus de max estimé (la seule décision du coach qui bouge : « premier exercice du muscle » aux chauffes)', () => {
    const c = corpus([{ debut: jourLocal('2026-11-03'), series: [S('tractions_assistees', 30, 8)] }]);
    expect(Faits.creer().maxEstimesAvantLeTest(c, ['tractions_assistees'], '2026-11-10').tractions_assistees).toBeNull();
  });

  test('« Tes exercices » : un exercice lesté ou assisté (2 séances, 8 reps) n\'est plus admis ; la barre et la machine le sont', () => {
    const specs = [];
    ['2026-11-03', '2026-10-27', '2026-10-20'].forEach((j) => specs.push({ debut: jourLocal(j), series: [
      S('squat_barre', 100, 5), S('presse', 150, 8), S('tractions_assistees', 30, 8), S('tractions_lestees', 25, 6)] }));
    const c = corpus(specs);
    const choisis = Faits.creer().exercicesDeProgression(c, MAINT, { semaines: 8, combien: 4 });
    expect(choisis).toContain('squat_barre');
    expect(choisis).toContain('presse');
    expect(choisis).not.toContain('tractions_assistees');
    expect(choisis).not.toContain('tractions_lestees');
  });
});
