/** @jest-environment node */
//
// 52-1 — organiser ses routines (ECRAN-SAISIE §7 duodecies.3, §7 quindecies.3
// et .4 ; MOTEUR §9.21).
//
//   · « En faire une routine » sur les 4 cas de `cas-52-1-organiser.json` (la
//     séance réelle « SBDay » d'Aurélien, importée de Hevy, et trois cas
//     synthétiques), le nom libre (2 cas) et Dupliquer (2 cas) ;
//   · jamais une charge, un superset jamais découpé, le repos long jamais
//     donné à une isolation ;
//   · Dupliquer : la copie complète par le chemin de création, l'originale
//     intacte, un autre nom ;
//   · les dossiers : l'étiquette, la bibliothèque regroupée, la liste blanche ;
//   · « Mettre à jour » par `ecartsRoutine` (§6.3), la question de fin inchangée ;
//   · la charge de départ : la cascade, la consigne et sa phrase, la première
//     fois seulement.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const R = require('../../v2/js/routines.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const CHEMIN = path.join(__dirname, 'fixtures/cas-52-1-organiser.json');
const F = require('./fixtures/cas-52-1-organiser.json');

// Le catalogue du fichier, à la forme de `exercises` : les muscles « a/b »
// deviennent des tableaux, le tapis se mesure en distance et durée.
const CATALOGUE = Object.keys(F.catalogue).map((slug) => ({
  slug, nom: slug,
  mesure: slug === 'tapis_roulant' ? 'distance_temps' : 'charge_reps',
  muscles_primaires: F.catalogue[slug].prim.split('/').filter(Boolean),
  muscles_secondaires: F.catalogue[slug].sec.split('/').filter(Boolean)
}));

// Les séries d'une séance du fichier, à la forme de `sets` — AVEC une charge
// sur chaque ligne : une routine qui en recopierait une se verrait.
const seriesDe = (seance, charge) => seance.series.map((x, i) => ({
  id: 'set-' + i, exercise_slug: x.slug, rang: x.rang, type_serie: x.type, reps: x.reps,
  duree_s: x.duree_s, distance_m: x.distance_m, groupe_superset: x.ss, occurrence: x.occurrence,
  charge_kg: charge === undefined ? 100 : charge, source: 'hevy'
}));
const routinesDe = (c) => c.routines.map((r) => ({ nom: r.nom, modifiee_a: r.modifiee_a,
  exercices: r.exercices.map((e) => ({ exercise_slug: e.slug, repos_cible_s: e.repos_s })) }));
const auFormat = (r) => ({ nom: r.nom, exercices: r.exercices.map((e) => ({
  slug: e.exercise_slug, groupe_superset: e.groupe_superset, repos_s: e.repos_cible_s,
  repos_origine: e.repos_origine, series: e.series })) });
const enRoutine = (c, extra) => R.routineDepuisSeance(seriesDe(c.seance), Object.assign({
  titre: c.seance.titre, exercices: CATALOGUE, routines: routinesDe(c), existants: [] }, extra || {}));

// ═══ 0. LE FICHIER DE CAS N'EST PAS RETOUCHÉ ════════════════════════════════
describe('le fichier de cas', () => {
  test('son empreinte est celle du fichier reçu de Claude.ai', () => {
    const h = crypto.createHash('sha256').update(fs.readFileSync(CHEMIN)).digest('hex');
    expect(h).toBe('cc4c1b53ca91ee4e1b956c8213150ebbc72d0e82a685d2dba043af246351cb51');
  });
  test('huit cas : 4 « en faire une routine », 2 noms libres, 2 « dupliquer »', () => {
    expect(F.cas.en_faire_une_routine).toHaveLength(4);
    expect(F.cas.nom_libre).toHaveLength(2);
    expect(F.cas.dupliquer).toHaveLength(2);
    expect(F.repos_defaut).toEqual({ 3: 180, 2: 120, 1: 90 });
  });
});

// ═══ 1. EN FAIRE UNE ROUTINE ═════════════════════════════════════════════════
describe('52-1 — « En faire une routine » (ECRAN-SAISIE §7 quindecies.4)', () => {
  F.cas.en_faire_une_routine.forEach((c) => {
    test(c.titre, () => {
      expect(auFormat(enRoutine(c))).toEqual(c.attendu);
    });
  });

  test('les repos par défaut sont ceux du fichier, définis une fois', () => {
    expect(R.REPOS_PAR_DEFAUT).toEqual({ premier: F.repos_defaut[3], poly: F.repos_defaut[2],
      isolation: F.repos_defaut[1] });
  });

  test('⚠️ DISCRIMINANT (a) — JAMAIS UNE CHARGE : aucune ligne ne porte de charge, quelle que soit la séance', () => {
    F.cas.en_faire_une_routine.forEach((c) => {
      const r = R.routineDepuisSeance(seriesDe(c.seance, 142.5), { titre: c.seance.titre, exercices: CATALOGUE,
        routines: routinesDe(c) });
      const lignes = [].concat.apply([], r.exercices.map((e) => e.series));
      expect(lignes.length).toBeGreaterThan(0);
      lignes.forEach((l) => {
        expect(l.charge_cible_kg === undefined || l.charge_cible_kg === null).toBe(true);
        expect(JSON.stringify(l)).not.toMatch(/142\.5/);
      });
      // Et au vocabulaire de la saisie (le brouillon) : aucune charge non plus.
      lignes.map(R.enSaisie).forEach((l) => expect(l.charge_kg).toBeNull());
    });
  });

  test('⚠️ DISCRIMINANT (b) — UN SUPERSET N’EST JAMAIS DÉCOUPÉ : un bloc, chaque exercice une fois, au moins deux', () => {
    const r = enRoutine(F.cas.en_faire_une_routine[1]);
    expect(r.exercices.map((e) => e.exercise_slug)).toEqual(['curl_biceps_haltere', 'extension_triceps_corde']);
    expect(r.exercices.every((e) => e.groupe_superset === 1)).toBe(true);
    expect(r.exercices[0].series).toHaveLength(2);
    // Un superset entrelacé (A, B, A, B), pas en paquets : toujours deux exercices.
    const groupes = {};
    r.exercices.forEach((e) => { if (e.groupe_superset !== null) groupes[e.groupe_superset] = (groupes[e.groupe_superset] || 0) + 1; });
    Object.keys(groupes).forEach((g) => expect(groupes[g]).toBeGreaterThanOrEqual(2));
  });

  test('⚠️ DISCRIMINANT (c) — LE REPOS LONG N’EST JAMAIS DONNÉ À UNE ISOLATION, même en premier exercice', () => {
    // Un curl en premier, seul : une isolation, 90 s — pas le repos du premier gros mouvement.
    const series = [
      { exercise_slug: 'curl_biceps_haltere', rang: 1, type_serie: 'travail', reps: 10, groupe_superset: null, occurrence: null },
      { exercise_slug: 'squat_barre', rang: 2, type_serie: 'travail', reps: 5, groupe_superset: null, occurrence: null },
      { exercise_slug: 'developpe_couche_barre', rang: 3, type_serie: 'travail', reps: 5, groupe_superset: null, occurrence: null }];
    const r = R.routineDepuisSeance(series, { titre: 'X', exercices: CATALOGUE, routines: [] });
    expect(r.exercices.map((e) => [e.exercise_slug, e.repos_cible_s, e.repos_origine])).toEqual([
      ['curl_biceps_haltere', 90, 'par défaut'], ['squat_barre', 180, 'par défaut'],
      ['developpe_couche_barre', 120, 'par défaut']]);
  });

  test('l’échec devient une série de travail ; les chauffes et les dégressives gardent leur type', () => {
    const series = [
      { exercise_slug: 'squat_barre', rang: 1, type_serie: 'echauffement', reps: 8 },
      { exercise_slug: 'squat_barre', rang: 2, type_serie: 'travail', reps: 5 },
      { exercise_slug: 'squat_barre', rang: 3, type_serie: 'echec', reps: 3 },
      { exercise_slug: 'squat_barre', rang: 4, type_serie: 'degressive', reps: 8 }];
    const r = R.routineDepuisSeance(series, { titre: 'X', exercices: CATALOGUE });
    expect(r.exercices[0].series.map((l) => l.type_serie)).toEqual(['echauffement', 'travail', 'travail', 'degressive']);
  });

  test('le repos d’une routine : la plus récemment modifiée qui contient l’exercice, et son nom dit l’origine', () => {
    const c = F.cas.en_faire_une_routine[0];
    const r = enRoutine(c);
    expect(r.exercices[1]).toEqual(expect.objectContaining({ repos_cible_s: 180, repos_origine: 'Vendredi — Bas B (Soulevé)' }));
    // Les dates inversées : c'est l'autre routine qui parle.
    const inverse = routinesDe(c).map((x, i) => Object.assign({}, x, { modifiee_a: i === 0 ? '2026-01-01' : '2026-10-04' }));
    const r2 = R.routineDepuisSeance(seriesDe(c.seance), { titre: 'X', exercices: CATALOGUE, routines: inverse });
    expect(r2.exercices[1]).toEqual(expect.objectContaining({ repos_cible_s: 150, repos_origine: 'Lundi — Haut A (Couché)' }));
  });

  test('le nom est le titre de la séance, rendu unique (« (2) ») contre les noms réservés', () => {
    const c = F.cas.en_faire_une_routine[0];
    expect(enRoutine(c, { existants: ['sbday 💀 - deload '] }).nom).toBe('SBDay 💀 - deload (2)');
  });
});

// ═══ 2. LE NOM LIBRE, DUPLIQUER ═════════════════════════════════════════════
describe('52-1 — le nom libre (une seule fonction)', () => {
  F.cas.nom_libre.forEach((c) => {
    test('« ' + c.nom + ' » contre ' + JSON.stringify(c.existants) + ' → « ' + c.attendu + ' »', () => {
      expect(R.nomLibre(c.nom, c.existants)).toBe(c.attendu);
    });
  });
  F.cas.dupliquer.forEach((c) => {
    test('Dupliquer « ' + c.nom + ' » contre ' + JSON.stringify(c.existants) + ' → « ' + c.attendu + ' »', () => {
      expect(R.nomLibre(c.nom, c.existants, 'copie')).toBe(c.attendu);
    });
  });
  test('un nom long reste sous 60 caractères : la base se raccourcit, jamais le suffixe ; un emoji n’est pas coupé', () => {
    const long = 'A'.repeat(57) + '💀';
    const n = R.nomLibre(long, [long], 'copie');
    expect(n.endsWith(' (copie)')).toBe(true);
    expect(R.nomValide(n)).toBe(true);
    expect(Array.from(n).every((ch) => ch !== '\ud83d')).toBe(true);
  });
});

describe('52-1 — Dupliquer (une copie complète, par le chemin de création)', () => {
  const ORIGINALE = Object.freeze({
    id: 'r1', nom: 'Vendredi — Bas B', dossier: 'Semaine actuelle', rang: 3,
    exercices: [
      { id: 'e1', exercise_slug: 'squat_barre', repos_cible_s: 180, groupe_superset: null, note: 'Talons',
        series: [{ id: 's1', type_serie: 'echauffement', reps: 8, charge_kg: null, duree_s: null, distance_m: null },
                 { id: 's2', type_serie: 'travail', reps: 5, charge_kg: 120, duree_s: null, distance_m: null }] },
      { id: 'e2', exercise_slug: 'curl_biceps_haltere', repos_cible_s: null, groupe_superset: 1, note: null,
        series: [{ id: 's3', type_serie: 'travail', reps: 12, charge_kg: 14, duree_s: null, distance_m: null }] },
      { id: 'e3', exercise_slug: 'extension_triceps_corde', repos_cible_s: 90, groupe_superset: 1, note: null,
        series: [{ id: 's4', type_serie: 'travail', reps: 12, charge_kg: null, duree_s: null, distance_m: null }] }]
  });

  test('⚠️ DISCRIMINANT (d) — la copie : tout passe, sans un identifiant de l’originale, sous un autre nom', () => {
    const avant = JSON.stringify(ORIGINALE);
    const c = R.copieDeRoutine(ORIGINALE, R.nomLibre(ORIGINALE.nom, [ORIGINALE.nom], 'copie'));
    expect(JSON.stringify(ORIGINALE)).toBe(avant);
    expect(c.id).toBeNull();
    expect(c.nom).toBe('Vendredi — Bas B (copie)');
    expect(R.normaliserNom(c.nom)).not.toBe(R.normaliserNom(ORIGINALE.nom));
    expect(c.dossier).toBe('Semaine actuelle');
    expect(c.existantes).toEqual([]);
    expect(c.exercices.map((e) => [e.id, e.exercise_slug, e.repos_cible_s, e.groupe_superset, e.note])).toEqual([
      [null, 'squat_barre', 180, null, 'Talons'], [null, 'curl_biceps_haltere', null, 1, null],
      [null, 'extension_triceps_corde', 90, 1, null]]);
    // Les charges de départ passent ; aucune série ne garde son identifiant.
    expect(c.exercices[0].series.map((l) => [l.id, l.type_serie, l.reps, l.charge_kg])).toEqual([
      [null, 'echauffement', 8, null], [null, 'travail', 5, 120]]);
    // Rien n'est partagé : modifier la copie ne touche pas l'originale.
    c.exercices[0].series[1].reps = 99;
    expect(ORIGINALE.exercices[0].series[1].reps).toBe(5);
  });

  test('⚠️ DISCRIMINANT (d) — `enregistrer` CRÉE une routine, au rang suivant ; l’originale n’est jamais écrite', async () => {
    const appels = [];
    let n = 0;
    const ecrivain = {
      creerRoutine: async (champs) => { appels.push(['creer', champs]); return Object.assign({ id: 'neuve' }, champs); },
      majRoutine: async (id, champs) => { appels.push(['maj', id, champs]); return { id }; },
      insererExercices: async (l) => { appels.push(['inserer', l.map((x) => x.routine_id)]); return l; },
      majExercice: async (id) => { appels.push(['majExo', id]); },
      supprimerExercices: async (ids) => { appels.push(['suppr', ids]); },
      remplacerSeriesRoutine: async (id, l) => { appels.push(['series', id, l.map((x) => x.charge_cible_kg)]); return l; },
      supprimerRoutine: async (id) => { appels.push(['supprRoutine', id]); }
    };
    const c = R.copieDeRoutine(ORIGINALE, 'Vendredi — Bas B (copie)');
    const r = await R.enregistrer(c, ecrivain, { userId: 'u', uuid: () => 'x' + (++n), rangSuivant: 7 });
    expect(r.ok).toBe(true);
    expect(appels[0]).toEqual(['creer', { user_id: 'u', nom: 'Vendredi — Bas B (copie)', rang: 7, dossier: 'Semaine actuelle' }]);
    expect(appels.filter((a) => a[0] === 'maj' || a[0] === 'majExo' || a[0] === 'suppr' || a[0] === 'supprRoutine')).toEqual([]);
    expect(JSON.stringify(appels)).not.toMatch(/"r1"|"e1"|"e2"|"e3"/);
    expect(appels.filter((a) => a[0] === 'series').map((a) => a[2])).toEqual([[null, 120], [14], [null]]);
  });
});

// ═══ 3. LES DOSSIERS ════════════════════════════════════════════════════════
describe('52-1 — les dossiers (ECRAN-SAISIE §7 duodecies.3)', () => {
  const lib = [
    { id: 'a', nom: 'Lundi', rang: 0, dossier: 'Semaine actuelle' },
    { id: 'b', nom: 'Mobilité', rang: 1, dossier: null },
    { id: 'c', nom: 'SBD', rang: 2, dossier: 'Force SBD' },
    { id: 'd', nom: 'Mardi', rang: 3, dossier: 'Semaine actuelle' }];

  test('une étiquette : le texte tel que tapé, aux espaces près ; 40 caractères au plus', () => {
    expect(R.dossierPropre('  Force SBD ')).toBe('Force SBD');
    expect(R.dossierPropre('   ')).toBeNull();
    expect(R.dossierPropre(null)).toBeNull();
    expect(R.dossierValide('x'.repeat(40))).toBe(true);
    expect(R.dossierValide('x'.repeat(41))).toBe(false);
    expect(R.valider({ nom: 'A', dossier: 'x'.repeat(41), exercices: [] }, []).soucis)
      .toEqual([{ champ: 'dossier', raison: 'trop-long' }]);
  });

  test('la bibliothèque regroupée : l’ordre global dans chaque dossier, « Sans dossier » en dernier', () => {
    expect(R.parDossier(lib).map((g) => [g.dossier, g.routines.map((r) => r.id)])).toEqual([
      ['Semaine actuelle', ['a', 'd']], ['Force SBD', ['c']], [null, ['b']]]);
    expect(R.dossiersDe(lib)).toEqual(['Semaine actuelle', 'Force SBD']);
  });

  test('sans aucun dossier, la bibliothèque reste une liste plate (pas de « Sans dossier » seul)', () => {
    expect(R.parDossier(lib.map((r) => Object.assign({}, r, { dossier: null })))).toBeNull();
  });

  test('la liste blanche de `routines` : nom, rang, dossier, user_id, jours (99, v2_084) — rien d’autre', () => {
    expect(R.CHAMPS_ROUTINE).toEqual(['user_id', 'nom', 'rang', 'dossier', 'jours']);
    expect(R.ligneRoutine({ nom: 'A', dossier: 'B', note: 'x', archivee_a: 'y', id: 'z' })).toEqual({ nom: 'A', dossier: 'B' });
  });

  test('l’enregistrement : le dossier change seul → une écriture, le dossier seulement', async () => {
    const appels = [];
    const ecrivain = { majRoutine: async (id, champs) => { appels.push([id, champs]); return { id }; },
      supprimerExercices: async () => {}, majExercice: async () => {}, insererExercices: async () => [],
      remplacerSeriesRoutine: async () => [] };
    await R.enregistrer({ id: 'r1', nom: 'Lundi', dossierChange: true, dossier: ' Force SBD ', exercices: [], existantes: [] },
      ecrivain, { userId: 'u' });
    expect(appels).toEqual([['r1', { dossier: 'Force SBD' }]]);
    appels.length = 0;
    await R.enregistrer({ id: 'r1', nom: 'Lundi', dossierChange: true, dossier: null, exercices: [], existantes: [] },
      ecrivain, { userId: 'u' });
    expect(appels).toEqual([['r1', { dossier: null }]]);
    appels.length = 0;
    await R.enregistrer({ id: 'r1', nom: 'Lundi', exercices: [], existantes: [] }, ecrivain, { userId: 'u' });
    expect(appels).toEqual([]);
  });
});

// ═══ 4. METTRE À JOUR UNE ROUTINE, PAR LE CHEMIN DE §6.3 ════════════════════
describe('52-1 — « Mettre à jour une routine » passe par `ecartsRoutine` (§6.3)', () => {
  const ligne = (id, slug, series, extra) => Object.assign({ id, exercise_slug: slug, rang: 0,
    repos_cible_s: 150, note: 'Ma note', groupe_superset: null, series }, extra || {});
  const t = (type, reps) => ({ type_serie: type, reps: reps === undefined ? 8 : reps, charge_kg: null, duree_s: null, distance_m: null });
  const ROUTINE = { id: 'R', nom: 'Vendredi', exercices: [
    Object.assign(ligne('l1', 'squat_barre', [t('echauffement'), t('travail', 5), t('travail', 5)]), { rang: 0 }),
    Object.assign(ligne('l2', 'developpe_couche_barre', [t('travail'), t('travail')]), { rang: 1 }),
    Object.assign(ligne('l3', 'curl_biceps_haltere', [t('travail', 12)]), { rang: 2 })] };
  // La séance : le squat pareil (reps différentes), le couché avec une
  // dégressive en plus, le curl retiré, une extension ajoutée.
  const series = [
    ['squat_barre', 'echauffement', 8], ['squat_barre', 'travail', 3], ['squat_barre', 'travail', 3],
    ['developpe_couche_barre', 'travail', 8], ['developpe_couche_barre', 'travail', 8], ['developpe_couche_barre', 'degressive', 10],
    ['extension_triceps_corde', 'travail', 12]
  ].map((x, i) => ({ exercise_slug: x[0], type_serie: x[1], reps: x[2], rang: i + 1, charge_kg: 80 }));
  const structure = R.routineDepuisSeance(series, { titre: 'S', exercices: CATALOGUE });

  test('la séance se rattache à la routine par l’exercice : la ligne retrouvée garde SES repos et SA note', () => {
    const vue = R.seanceSurRoutine(structure, ROUTINE);
    expect(vue.routine_id).toBe('R');
    expect(vue.exercices.map((e) => [e.exercise_slug, e.routine_exercise_id, e.repos_cible_s, e.note])).toEqual([
      ['squat_barre', 'l1', 150, 'Ma note'], ['developpe_couche_barre', 'l2', 150, 'Ma note'],
      ['extension_triceps_corde', null, 90, null]]);
    vue.exercices.forEach((e) => e.series.forEach((l) => expect(l.charge_kg).toBeNull()));
  });

  test('⚠️ DISCRIMINANT (f) — les écarts sont ceux de `ecartsRoutine` : ajout, retrait, séries ; aucun écart de repos ni de note', () => {
    const v = S.ecartsRoutine(R.seanceSurRoutine(structure, ROUTINE), ROUTINE, { series: true });
    expect(v.ecarts).toEqual([
      { type: 'retire', exercise_slug: 'curl_biceps_haltere' },
      { type: 'ajoute', exercise_slug: 'extension_triceps_corde', i: 2 },
      { type: 'series', exercise_slug: 'developpe_couche_barre', i: 1,
        avant: { series: 2, chauffes: 0, degressives: 0 }, apres: { series: 3, chauffes: 0, degressives: 1 } }]);
    // Le squat garde SES lignes (même structure : les reps sont des repères) ;
    // le couché prend celles de la séance, sans charge.
    expect(v.voulues[0].series).toBe(ROUTINE.exercices[0].series);
    expect(v.voulues[1].series.map((l) => [l.type_serie, l.reps, l.charge_kg])).toEqual([
      ['travail', 8, null], ['travail', 8, null], ['degressive', 10, null]]);
    expect(v.voulues[2]).toEqual(expect.objectContaining({ id: null, exercise_slug: 'extension_triceps_corde', repos_cible_s: 90 }));
    // Ce qui partira par la file passe par `planEcritures`, comme la fin de séance.
    const plan = R.planEcritures(ROUTINE.exercices, v.voulues.map((x) => Object.assign({}, x, { id: x.id || 'neuf' })), 'R', 'u');
    expect(plan.suppressions).toEqual(['l3']);
    expect(plan.series.map((x) => x.id)).toEqual(['l2', 'neuf']);
    plan.series.forEach((x) => x.lignes.forEach((l) => expect(l.charge_cible_kg).toBeNull()));
  });

  test('la question de fin de séance est INCHANGÉE : sans l’option, ni écart de séries, ni indice', () => {
    const vue = R.seanceSurRoutine(structure, ROUTINE);
    const v = S.ecartsRoutine(vue, ROUTINE);
    expect(v.ecarts).toEqual([
      { type: 'retire', exercise_slug: 'curl_biceps_haltere' },
      { type: 'ajoute', exercise_slug: 'extension_triceps_corde' }]);
    // Les lignes gardées gardent les séries de la routine (§6.3 : le nombre ne se reporte pas).
    expect(v.voulues[1].series).toBe(ROUTINE.exercices[1].series);
  });
});

// ═══ 5. LA CHARGE DE DÉPART ══════════════════════════════════════════════════
describe('52-1 — la charge de départ (ECRAN-SAISIE §7 quindecies.3, MOTEUR §9.21)', () => {
  const seanceAvec = (charge) => ({ exercices: [{ exercise_slug: 'x', series: [
    Object.assign({}, { id: 'a', type_serie: 'travail', charge_kg: null, reps: null, duree_s: null, distance_m: null,
      reps_visees: 10, charge_cible_kg: charge })] }] });
  const prec = { seance: { id: 'P' }, series: [{ type_serie: 'echauffement', charge_kg: 40, reps: 8 }] };

  test('⚠️ DISCRIMINANT (e) — la cascade : la charge de départ sur un exercice JAMAIS FAIT, rien sinon', () => {
    expect(S.fantome(seanceAvec(60), 0, 0, null, null).charge_kg).toBe(60);
    // Déjà fait — même sans série de travail au même rang : la charge de départ se tait.
    expect(S.fantome(seanceAvec(60), 0, 0, prec, null).charge_kg).toBeNull();
  });

  const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal' };
  test('la consigne d’un exercice jamais fait part de la charge de départ, aux reps de la routine, et le dit', () => {
    const r = M.consigneDExercice([], undefined, '2026-10-05T10:00:00Z',
      Object.assign({}, OPTIONS, { depart: { charge: 60, reps: 10, n: 3 } }));
    expect(r.consigne).toEqual(expect.objectContaining({ etat: 'depart_routine', zone: null, palier: null,
      n: 3, ligne: { charge: 60, vise: 10 }, haut: null }));
    const nb = (x) => x.replace(/[  ]/g, ' ');
    expect(r.libelles.jaune.map(nb)).toEqual(['60 kg × 10']);
    expect(nb(r.libelles.gris)).toBe('Première fois ici : on part de ta charge de départ, 60 kg.');
    expect(r.etiquette).toBeNull();
  });

  test('⚠️ DISCRIMINANT (e) — un exercice DÉJÀ FAIT : la charge de départ ne change rien, le coach décide seul', () => {
    const groupes = [{ seance: { id: 'P', debut: '2026-09-28T10:00:00Z' }, series: [1, 2, 3].map((k) => ({
      id: 'p' + k, rang: k, charge_kg: 80, reps: 8, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'x' })) }];
    const sans = M.consigneDExercice(groupes, undefined, '2026-10-05T10:00:00Z', OPTIONS);
    const avec = M.consigneDExercice(groupes, undefined, '2026-10-05T10:00:00Z',
      Object.assign({}, OPTIONS, { depart: { charge: 60, reps: 10, n: 3 } }));
    expect(avec.consigne.etat).not.toBe('depart_routine');
    expect(JSON.stringify(avec.consigne)).toBe(JSON.stringify(sans.consigne));
  });

  test('sans charge de départ, ou hors charge × reps : « Première fois ici » comme avant', () => {
    const sans = M.consigneDExercice([], undefined, '2026-10-05T10:00:00Z', OPTIONS);
    expect(sans.consigne).toEqual(expect.objectContaining({ etat: 'silence', raison: 'premiere_fois' }));
    const enReps = M.consigneDExercice([], undefined, '2026-10-05T10:00:00Z',
      Object.assign({}, OPTIONS, { mesure: 'reps', depart: { charge: 10, reps: 8, n: 3 } }));
    expect(enReps.consigne.etat).toBe('silence');
    expect(M.consigneDepartRoutine({ charge: 0, reps: 8 })).toBeNull();
    expect(M.consigneDepartRoutine({ charge: null, reps: 8 })).toBeNull();
  });

  test('le plan applique la charge de départ à toutes les séries de travail, et passe ses invariants', () => {
    const r = M.consigneDExercice([], undefined, '2026-10-05T10:00:00Z',
      Object.assign({}, OPTIONS, { depart: { charge: 60, reps: 10, n: 3 } }));
    let n = 0;
    const id = () => 's' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'rowing', id, { series: 3 });
    se = S.insererChauffes(se, 0, [[0, 8]], id);
    const e = { seance: { id: 'S1', debut: '2026-10-05T10:00:00Z', edition: false, exercices: se.exercices },
      consignes: { rowing: r }, catalogue: { rowing: { equipement: 'barre', muscles_primaires: ['dos'],
        muscles_secondaires: ['biceps', 'lombaires'], mesure: 'charge_reps' } },
      reglage: null, paris: [], suites: {}, intention: 'progresser', modes: {}, lestReponse: null };
    const plan = T.planDeSeance(e);
    const x = plan.exercices[0];
    expect(x.lignes.filter((l) => l.role !== 'hors').map((l) => [l.charge, l.vise, l.prerempli.charge_kg, l.prerempli.reps]))
      .toEqual([[60, 10, 60, 10], [60, 10, 60, 10], [60, 10, 60, 10]]);
    expect(T.verifierPlan(plan, e).erreurs).toEqual([]);
  });

  test('la phrase passe par le formateur : une charge décimale garde sa virgule', () => {
    const r = M.consigneDExercice([], undefined, '2026-10-05T10:00:00Z',
      Object.assign({}, OPTIONS, { depart: { charge: 22.5, reps: 8, n: 2 } }));
    expect(r.libelles.gris.replace(/[  ]/g, ' ')).toBe('Première fois ici : on part de ta charge de départ, 22,5 kg.');
  });
});

// ═══ 6. LES SURFACES DISENT CE QUE FAIT LE CODE ════════════════════════════
describe('52-1 — les surfaces et les commentaires disent ce que fait le code', () => {
  const lire = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');
  test('la note de l’éditeur ne promet plus « que ce que tu as déjà fait », et parle de la charge de départ', () => {
    const note = /<p id="note-routine"[^>]*>([\s\S]*?)<\/p>/.exec(lire('v2/index.html'))[1];
    expect(note).not.toMatch(/que ce que tu as déjà fait/);
    expect(note).not.toMatch(/cible facultative/);
    expect(note).toMatch(/charge de départ/);
  });
  test('les commentaires ne disent plus « aucune charge, nulle part » ni « ne descend pas ici »', () => {
    expect(lire('v2/js/routines.js')).not.toMatch(/AUCUNE CHARGE\. Pas de kg, pas de poids, nulle part\./);
    expect(lire('v2/js/seance.js')).not.toMatch(/existe en base mais ne descend pas ici/);
    expect(lire('v2/js/seance.js')).not.toMatch(/ne porte que `reps_visees`, jamais une durée visée/);
    expect(lire('v2/index.html')).not.toMatch(/AUCUN champ de charge nulle part/);
  });
});
