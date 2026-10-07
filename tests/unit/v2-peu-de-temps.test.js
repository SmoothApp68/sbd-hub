/** @jest-environment node */
//
// 51-1 — « J'ai peu de temps » (MOTEUR §9.18, deltas 51-1, 51-1 bis, 51-1 ter).
//
//   · la durée estimée et le raccourci, sur les 25 cas de
//     `cas-51-1-peu-de-temps.json` (les cinq routines d'Aurélien et dix cas
//     limites synthétiques : une méthode, pas ses routines) ;
//   · les constantes : des valeurs par défaut, définies une seule fois ;
//   · la structure d'une routine de l'app, et la routine raccourcie (une
//     COPIE : la routine n'est jamais touchée) ;
//   · la carte, et la cible inatteignable qui ne se promet pas ;
//   · I32 et ses violations forgées ;
//   · la séance raccourcie et le reste du coach (51-1 ter) : la semaine
//     allégée et la série de plus lisent la routine complète, « J'ai peu de
//     temps » se tait pendant une semaine allégée, la question de fin ne
//     propose jamais de retirer un exercice raccourci.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Modele = require('../../v2/js/modele.js');

const CAS = require('./fixtures/cas-51-1-peu-de-temps.json');
const FANTOME = require('./fixtures/cas-49u2-fantome.json');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const MOTEUR = fs.readFileSync(path.join(__dirname, '../../v2/js/moteur.js'), 'utf8');
const extraire = (src, nom) => {
  const m = src.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};
const vue = (r) => r.map((e) => ({ slug: e.slug, ch: e.ch, tr: e.tr, deg: e.deg, duree: e.duree }));

// ══ 1. LES 25 CAS ════════════════════════════════════════════════════════════

describe('51-1 — la durée estimée et le raccourci, sur les 25 cas de la référence', () => {
  test('prémisse : 25 cas, dont 5 estimations, 19 raccourcis qui tiennent et 1 inatteignable', () => {
    expect(CAS.cas).toHaveLength(25);
    expect(CAS.cas.filter((c) => c.cible_min === null)).toHaveLength(5);
    expect(CAS.cas.filter((c) => c.cible_min !== null && c.attendu.tient === true)).toHaveLength(19);
    expect(CAS.cas.filter((c) => c.attendu.tient === false).map((c) => c.id)).toEqual(['L25']);
  });

  CAS.cas.forEach((c) => {
    if (c.cible_min === null) {
      test(c.id + ' — ' + c.titre, () => expect(M.dureeEstimee(c.routine)).toBe(c.attendu.duree_s));
      return;
    }
    test(c.id + ' — ' + c.titre, () => {
      const r = M.raccourcirRoutine(c.routine, c.cible_min);
      expect({ exercices: vue(r.exercices), duree_s: r.duree_s, tient: r.tient })
        .toEqual({ exercices: c.attendu.exercices, duree_s: c.attendu.duree_s, tient: c.attendu.tient });
    });
  });

  test('pure : la structure reçue n’est jamais modifiée', () => {
    const c = CAS.cas.find((x) => x.id === 'C13');
    const avant = JSON.stringify(c.routine);
    M.raccourcirRoutine(c.routine, 45);
    expect(JSON.stringify(c.routine)).toBe(avant);
  });

  test('⚠️ 51-1 ter — un exercice retiré ou un cardio mis à part ne coûte rien, pas même son changement d’exercice', () => {
    expect(M.dureeEstimee([{ slug: 'x', mesure: 'charge_reps', repos: 90, ch: 0, tr: 0, deg: 0, prim: 'a' }])).toBe(0);
    expect(M.dureeEstimee([{ slug: 't', mesure: 'distance_temps', repos: null, ch: 0, tr: 0, deg: 0, duree: 0 }])).toBe(0);
  });

  test('le journal dit les étapes dans l’ordre de §9.18 (cardio de fin, cardio de début, séries, retraits)', () => {
    const r = M.raccourcirRoutine(CAS.cas.find((x) => x.id === 'C07').routine, 45);
    const etapes = r.journal.map((j) => j.quoi).filter((q, i, a) => a.indexOf(q) === i);
    expect(etapes).toEqual(['cardio_fin', 'cardio_debut', 'serie', 'retire']);
    expect(r.journal.filter((j) => j.quoi === 'retire').map((j) => j.slug)).toEqual(['developpe_couche_incline_haltere']);
  });
});

// ══ 2. LES CONSTANTES : DES VALEURS PAR DÉFAUT, UNE SEULE FOIS ══════════════

describe('51-1 bis — les constantes de l’estimation sont des valeurs par défaut, définies une fois', () => {
  test('nommées et figées : 60, 30, 15, 45, 180 (et le repos le plus courant sans réglage)', () => {
    expect(M.DUREE_PAR_DEFAUT).toEqual({ serie: 60, changement: 30, reposSuperset: 15, degressive: 45,
      cardioDebut: 180, reposSansReglage: 90 });
    expect(Object.isFrozen(M.DUREE_PAR_DEFAUT)).toBe(true);
    // Les repos de chauffe (§9.15) : une seule définition, que le plan lit.
    expect([M.REPOS_ENTRE_CHAUFFES, M.REPOS_APRES_CHAUFFES]).toEqual([60, 120]);
    expect([T.REPOS_ENTRE_CHAUFFES, T.REPOS_APRES_CHAUFFES]).toEqual([60, 120]);
  });

  // ⚠️ (h) — UNE CONSTANTE RECOPIÉE SE VOIT. Le corps de chaque fonction de
  // §9.18 est lu (commentaires et chaînes retirés) : aucun nombre autre que 0
  // et 1 n'y est toléré ; tout le reste passe par `DUREE_PAR_DEFAUT` ou une
  // règle nommée.
  test('⚠️ DISCRIMINANT — aucune fonction de §9.18 n’écrit un nombre en dur (hors 0 et 1)', () => {
    const nettoyer = (t) => t.replace(/\/\/.*$/gm, '').replace(/'(?:\\.|[^'\\])*'/g, "''");
    const fautes = [];
    ['dureeExercice', 'dureeEstimee', 'copieStructure', 'raccourcirRoutine', 'structureDeRoutine',
      'structureAllegee', 'appliquerRaccourci', 'minutesDe', 'minutesFr', 'texteDureeEstimee',
      'texteDureeAllegee', 'carteRaccourcir'].forEach((nom) => {
      const corps = nettoyer(extraire(MOTEUR, nom));
      (corps.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) || [])
        .filter((n) => n !== '0' && n !== '1').forEach((n) => fautes.push(nom + ' : ' + n));
    });
    expect(fautes).toEqual([]);
  });
});

// ══ 3. LA STRUCTURE D'UNE ROUTINE DE L'APP, LA ROUTINE RACCOURCIE ══════════

const CATALOGUE = {
  tapis: { slug: 'tapis', mesure: 'distance_temps', muscles_primaires: [], muscles_secondaires: [] },
  couche: { slug: 'couche', mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
  incline: { slug: 'incline', mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
  elev: { slug: 'elev', mesure: 'charge_reps', muscles_primaires: ['deltoide_lateral'], muscles_secondaires: ['trapezes'] },
  oiseau: { slug: 'oiseau', mesure: 'charge_reps', muscles_primaires: ['deltoide_posterieur'], muscles_secondaires: ['trapezes', 'haut_du_dos'] }
};
const lignes = (types, extra) => types.map((t, k) => Object.assign({ id: 'rs' + k, type_serie: t, reps: 8, charge_kg: null, duree_s: null }, extra || {}));
const ROUTINE = {
  id: 'r-1', nom: 'Haut',
  exercices: [
    { id: 're-tapis', exercise_slug: 'tapis', rang: 0, series: lignes(['travail'], { duree_s: 420, reps: null }), repos_cible_s: 60, groupe_superset: null, note: null },
    { id: 're-couche', exercise_slug: 'couche', rang: 1, series: lignes(['echauffement', 'echauffement', 'travail', 'travail', 'travail', 'travail']), repos_cible_s: 180, groupe_superset: null, note: 'Barre basse' },
    { id: 're-incline', exercise_slug: 'incline', rang: 2, series: lignes(['travail', 'travail', 'travail', 'degressive']), repos_cible_s: 150, groupe_superset: null, note: null },
    { id: 're-elev', exercise_slug: 'elev', rang: 3, series: lignes(['travail', 'travail', 'travail']), repos_cible_s: null, groupe_superset: 1, note: null },
    { id: 're-oiseau', exercise_slug: 'oiseau', rang: 4, series: lignes(['travail', 'travail', 'travail']), repos_cible_s: 60, groupe_superset: 1, note: null },
    { id: 're-tapis2', exercise_slug: 'tapis', rang: 5, series: lignes(['travail'], { duree_s: 1200, reps: null }), repos_cible_s: null, groupe_superset: null, note: null }
  ]
};

describe('51-1 — la structure d’une routine de l’app', () => {
  const st = M.structureDeRoutine(ROUTINE.exercices, CATALOGUE);
  test('les lignes se comptent par type, la durée du cardio vient de la routine, les muscles du catalogue', () => {
    expect(st.map((e) => [e.slug, e.ch, e.tr, e.deg, e.duree])).toEqual([
      ['tapis', 0, 1, 0, 420], ['couche', 2, 4, 0, null], ['incline', 0, 3, 1, null],
      ['elev', 0, 3, 0, null], ['oiseau', 0, 3, 0, null], ['tapis', 0, 1, 0, 1200]]);
    expect(st[1].prim).toEqual(['pectoraux']);
    expect(st[1].sec).toEqual(['triceps', 'deltoide_anterieur']);
  });
  test('le repos : celui programmé ; sans lui, porté par le suivant du superset (null), sinon le repos le plus courant', () => {
    expect(st.map((e) => e.repos)).toEqual([60, 180, 150, null, 60, 90]);
  });
});

describe('51-1 — la routine raccourcie est une COPIE ; la routine ne change pas', () => {
  const avant = JSON.stringify(ROUTINE);
  const complet = M.structureDeRoutine(ROUTINE.exercices, CATALOGUE);
  const resultat = M.raccourcirRoutine(complet, 20);
  const a = M.appliquerRaccourci(ROUTINE, resultat);
  test('prémisse : à 20 min, l’incliné tombe (ses pectoraux restent au couché), le cardio de fin est mis à part ; l’oiseau (3 muscles, polyarticulaire) garde 2 séries', () => {
    expect(vue(resultat.exercices).map((e) => [e.slug, e.ch, e.tr, e.deg])).toEqual([
      ['tapis', 0, 1, 0], ['couche', 2, 2, 0], ['incline', 0, 0, 0], ['elev', 0, 1, 0], ['oiseau', 0, 2, 0], ['tapis', 0, 0, 0]]);
  });
  test('⚠️ DISCRIMINANT — la routine n’est jamais modifiée (ECRAN-SAISIE §6.3)', () => {
    expect(JSON.stringify(ROUTINE)).toBe(avant);
  });
  test('les DERNIÈRES séries de travail tombent, toutes les chauffes restent ; les exercices retirés sortent, et se disent', () => {
    expect(a.routine.exercices.map((e) => e.exercise_slug)).toEqual(['tapis', 'couche', 'elev', 'oiseau']);
    expect(a.routine.exercices[1].series.map((s) => s.id + ':' + s.type_serie))
      .toEqual(['rs0:echauffement', 'rs1:echauffement', 'rs2:travail', 'rs3:travail']);
    expect(a.retires).toEqual(['re-incline', 're-tapis2']);
    // Le reste de la ligne de routine est intact : la note, le repos, l'identifiant.
    expect(a.routine.exercices[1]).toMatchObject({ id: 're-couche', note: 'Barre basse', repos_cible_s: 180 });
  });
  test('la séance démarrée sur la copie a la structure raccourcie, superset compris', () => {
    let k = 0;
    const se = S.creer({ id: 'S', userId: 'u', routine: a.routine, idSerie: () => 'p' + (++k) });
    expect(se.exercices.map((e) => [e.exercise_slug, e.series.length])).toEqual([['tapis', 1], ['couche', 4], ['elev', 1], ['oiseau', 2]]);
    expect(se.exercices.map((e) => e.routine_exercise_id)).toEqual(['re-tapis', 're-couche', 're-elev', 're-oiseau']);
  });
});

// ══ 4. LA CARTE ══════════════════════════════════════════════════════════════

describe('51-1 — la carte, et la cible inatteignable qui ne se promet pas', () => {
  const noms = { tapis_roulant: 'Tapis', developpe_couche_barre: 'Développé couché', tractions: 'Tractions',
    developpe_couche_incline_haltere: 'Incliné', rowing_poulie_assis: 'Rowing', elevation_laterale_poulie: 'Élévations',
    tirage_vers_visage: 'Face pull' };
  const nommer = (s) => noms[s] || s;
  const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
  test('elle tient : « Pour tenir en 45 min (estimation) », ce qui change, la phrase, Raccourcir / Garder la séance', () => {
    const c = CAS.cas.find((x) => x.id === 'C07');
    const carte = M.carteRaccourcir(c.routine, M.raccourcirRoutine(c.routine, 45), 45, nommer);
    expect(sp(carte.titre)).toBe('Pour tenir en 45 min (estimation)');
    expect(carte.lignes.map(sp)).toEqual([
      'Tapis 7 → 3 min', 'Développé couché 4 → 2 séries', 'Tractions 4 → 2 séries',
      'Incliné : retiré, ses muscles sont déjà travaillés', 'Rowing 3 → 2 séries', 'Élévations 4 → 1 série',
      'Face pull 3 → 2 séries', 'Tapis : mis à part pour aujourd’hui']);
    expect(carte.phrase).toBe('Tous tes muscles du jour gardent leurs premières séries : ce sont celles qui comptent le plus. ' +
      'Les charges ne changent pas.');
    expect([carte.oui, carte.non, carte.tient]).toEqual(['Raccourcir', 'Garder la séance', true]);
  });
  test('⚠️ DISCRIMINANT (g) — inatteignable : « Au plus court : 34 min (estimation) », « Raccourcir à 34 min », jamais la cible', () => {
    const c = CAS.cas.find((x) => x.id === 'L25');
    const r = M.raccourcirRoutine(c.routine, 20);
    const carte = M.carteRaccourcir(c.routine, r, 20, nommer);
    expect(r.tient).toBe(false);
    expect(sp(carte.titre)).toBe('Au plus court : 34 min (estimation)');
    expect(sp(carte.oui)).toBe('Raccourcir à 34 min');
    expect(carte.titre + carte.oui).not.toMatch(/20/);
  });
  test('le cardio de début dit ses vraies minutes (L21 : 10 → 3 min), et une dégressive retirée se dit', () => {
    const c = CAS.cas.find((x) => x.id === 'L21');
    expect(M.carteRaccourcir(c.routine, M.raccourcirRoutine(c.routine, 30), 30).lignes.map(sp)[0]).toBe('tapis_roulant 10 → 3 min');
    const e = CAS.cas.find((x) => x.id === 'C08');
    expect(M.carteRaccourcir(e.routine, M.raccourcirRoutine(e.routine, 60), 60).lignes.map(sp))
      .toContain('extension_jambes : sans dégressive');
  });
  test('la durée : « Environ 109 min (estimation) » ; pendant une semaine allégée, la durée allégée', () => {
    const e01 = CAS.cas.find((x) => x.id === 'E01').routine;
    expect(sp(M.texteDureeEstimee(M.dureeEstimee(e01)))).toBe('Environ 109 min (estimation)');
    const allegee = M.structureAllegee(e01);
    // 60 % des séries de travail des exercices coachés ; le cardio ne change pas.
    expect(allegee.map((e) => e.tr)).toEqual([1, 2, 2, 2, 2, 2, 2, 1]);
    expect(sp(M.texteDureeAllegee(M.dureeEstimee(allegee)))).toMatch(/^Semaine allégée : environ \d+ min \(estimation\)$/);
  });
});

// ══ 5. I32 ════════════════════════════════════════════════════════════════════

describe('51-1 — I32 : une séance raccourcie garde chaque muscle, son premier exercice et ses charges', () => {
  const F044 = FANTOME.cas.find((x) => x.id === 'F044');
  const consigne = { etat: F044.consigne.etat, zone: F044.consigne.zone === null ? null : F044.consigne.zone.nom,
    palier: F044.consigne.palier, n: F044.consigne.n, ligne: F044.consigne.ligne, haut: F044.consigne.haut };
  const CAT = { x: { mesure: 'charge_reps', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'] },
                y: { mesure: 'charge_reps', muscles_primaires: ['dos'], muscles_secondaires: [] } };
  const routine = { id: 'r', nom: 'R', exercices: [
    { id: 'rx', exercise_slug: 'x', rang: 0, series: lignes(['echauffement', 'travail', 'travail', 'travail', 'travail']), repos_cible_s: 180, groupe_superset: null },
    { id: 'ry', exercise_slug: 'y', rang: 1, series: lignes(['travail', 'travail', 'travail']), repos_cible_s: 120, groupe_superset: null }] };
  const complet = M.structureDeRoutine(routine.exercices, CAT);
  const resultat = M.raccourcirRoutine(complet, 12);
  const a = M.appliquerRaccourci(routine, resultat);
  let k = 0;
  const se = S.creer({ id: 'S', userId: 'u', routine: a.routine, idSerie: () => 'q' + (++k) });
  const entrees = (rc, cs) => ({
    seance: { id: 'S', debut: '2026-10-04T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: cs || { x: { consigne, contexte: F044.contexte, seriesRoutine: 4 } }, reglage: 'normal', paris: [],
    raccourci: rc === undefined ? { complet, raccourcie: resultat.exercices, retires: a.retires } : rc
  });
  const i32 = (v) => v.erreurs.filter((x) => x.indexOf('I32 —') === 0);
  const copie = (x) => JSON.parse(JSON.stringify(x));

  test('prémisse : le raccourci coupe des séries, et le plan juste passe I32', () => {
    expect(vue(resultat.exercices).map((e) => [e.slug, e.ch, e.tr])).toEqual([['x', 1, 2], ['y', 0, 1]]);
    const e = entrees();
    expect(i32(T.verifierPlan(T.planDeSeance(e), e))).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — un muscle principal sans plus aucune série de travail', () => {
    const rc = { complet, raccourcie: copie(resultat.exercices), retires: [] };
    rc.raccourcie[1].tr = 0;
    const e = entrees(rc);
    expect(i32(T.verifierPlan(T.planDeSeance(e), e)).join(' ')).toMatch(/le muscle dos n'a plus aucune série de travail/);
  });

  test('⚠️ DISCRIMINANT — le premier exercice sous 2 séries, ou privé d’une chauffe', () => {
    const rc = { complet, raccourcie: copie(resultat.exercices), retires: [] };
    rc.raccourcie[0].tr = 1;
    let e = entrees(rc);
    expect(i32(T.verifierPlan(T.planDeSeance(e), e)).join(' ')).toMatch(/premier exercice \(x\) garde 1 série\(s\) de travail, pour au moins 2/);
    const rc2 = { complet, raccourcie: copie(resultat.exercices), retires: [] };
    rc2.raccourcie[0].ch = 0;
    e = entrees(rc2);
    expect(i32(T.verifierPlan(T.planDeSeance(e), e)).join(' ')).toMatch(/garde 0 chauffe\(s\) sur 1/);
  });

  test('⚠️ DISCRIMINANT (51-1 ter) — la consigne qui lit les séries de la séance raccourcie, pas de la routine', () => {
    const e = entrees(undefined, { x: { consigne, contexte: F044.contexte, seriesRoutine: 2 } });
    expect(i32(T.verifierPlan(T.planDeSeance(e), e)).join(' ')).toMatch(/lit 2 séries de routine, la routine complète en a 4/);
  });

  test('⚠️ DISCRIMINANT — une charge qui diffère de la consigne de la séance complète', () => {
    const e = entrees();
    const p = copie(T.planDeSeance(e));
    const x = p.exercices[0];
    (x.consigne.ligne || x.consigne.haut).charge += 5;
    expect(i32(T.verifierPlan(p, e)).join(' ')).toMatch(/diffère de la consigne de la séance complète/);
  });

  test('sans raccourci, I32 ne dit rien', () => {
    const e = entrees(null);
    expect(i32(T.verifierPlan(T.planDeSeance(e), e))).toEqual([]);
  });
});

// ══ 6. LA SÉANCE RACCOURCIE ET LE RESTE DU COACH (51-1 ter) ═════════════════

describe('51-1 ter — la question de fin ne propose jamais de retirer un exercice raccourci', () => {
  const complet = M.structureDeRoutine(ROUTINE.exercices, CATALOGUE);
  const resultat = M.raccourcirRoutine(complet, 20);
  const a = M.appliquerRaccourci(ROUTINE, resultat);
  let k = 0;
  const base = S.creer({ id: 'S', userId: 'u', routine: a.routine, idSerie: () => 'f' + (++k) });
  base.routine_id = ROUTINE.id;
  const raccourcie = Object.assign({}, base, { raccourcie: { cible: 20, complet, raccourcie: resultat.exercices, retires: a.retires } });

  test('témoin : sans le souvenir du raccourci, la question dirait « retiré » (et l’écriture effacerait la ligne)', () => {
    const v = S.ecartsRoutine(base, ROUTINE);
    expect(v.ecarts.filter((e) => e.type === 'retire').map((e) => e.exercise_slug)).toEqual(['incline', 'tapis']);
  });

  test('⚠️ DISCRIMINANT (k) — avec lui, aucun écart : rien à demander, et la routine écrite garde chaque exercice', () => {
    const v = S.ecartsRoutine(raccourcie, ROUTINE);
    expect(v.ecarts).toEqual([]);
    expect(v.voulues.map((x) => x.id)).toEqual(ROUTINE.exercices.map((e) => e.id));
    // Les lignes viennent de la routine : le nombre de séries d'une séance
    // écourtée n'y est jamais reporté (§6.3).
    expect(v.voulues.map((x) => x.series.length)).toEqual(ROUTINE.exercices.map((e) => e.series.length));
  });

  test('un superset coupé en deux par le raccourci se refait dans ce qui serait écrit', () => {
    const r2 = { id: 'r-2', nom: 'SS', exercices: [
      { id: 'a', exercise_slug: 'couche', rang: 0, series: lignes(['travail', 'travail', 'travail']), repos_cible_s: 180, groupe_superset: null },
      { id: 'b', exercise_slug: 'elev', rang: 1, series: lignes(['travail', 'travail']), repos_cible_s: null, groupe_superset: 1 },
      { id: 'c', exercise_slug: 'incline', rang: 2, series: lignes(['travail', 'travail']), repos_cible_s: 60, groupe_superset: 1 }] };
    let n = 0;
    const se = Object.assign(S.creer({ id: 'S2', userId: 'u', routine: { id: 'r-2', exercices: [r2.exercices[0], r2.exercices[1]] }, idSerie: () => 'g' + (++n) }),
      { routine_id: 'r-2', raccourcie: { retires: ['c'] } });
    // La séance a dissous le superset devenu seul.
    expect(se.exercices.map((e) => e.groupe_superset)).toEqual([null, null]);
    const v = S.ecartsRoutine(se, r2);
    expect(v.ecarts).toEqual([]);
    expect(v.voulues.map((x) => x.id + ':' + x.groupe_superset)).toEqual(['a:null', 'b:1', 'c:1']);
  });
});

describe('51-1 ter — « J’ai peu de temps » se tait pendant une semaine allégée (app.js)', () => {
  function bac(allegee, profil) {
    const ctx = {
      Moteur: Object.assign({}, M, { periodeAllegee: () => (allegee ? { debut: '2026-10-01', fin: '2026-10-07' } : null) }),
      // 60-1 — le profil que lit `semaineAllegeeEnCours` (Entretenir) et les cibles de temps.
      profil: profil || null,
      parisEscalierConnus: () => [], catalogueIndexe: () => CATALOGUE,
      // 53-2 (§9.22) — la décharge planifiée est une semaine allégée : sans bloc, aucune.
      local: { blocs: [] }, finsAllegeesConnues: () => []
    };
    vm.createContext(ctx);
    ['semaineAllegeeEnCours', 'ciblesPlusCourtes', 'tempsDeLaRoutine'].forEach((n) => vm.runInContext(extraire(APP, n), ctx));
    return ctx;
  }
  const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');

  // 60-1 — « JUSTE UN CARNET » : le plan n'applique ni la fenêtre allégée ni la
  // décharge planifiée (I13) ; la routine ne dit donc pas « Semaine allégée »
  // pour une séance qui ne l'est pas, et le geste reste offert.
  test('⚠️ 60-1 — en Entretenir, une fenêtre allégée n’est pas dite : durée normale, et le geste', () => {
    const attendu = sp(M.texteDureeEstimee(M.dureeEstimee(M.structureDeRoutine(ROUTINE.exercices, CATALOGUE))));
    // Le témoin : le même bac, en Progresser, dit bien la durée allégée.
    const parle = vm.runInContext('tempsDeLaRoutine(r)', Object.assign(bac(true, { intention: 'progresser' }), { r: ROUTINE }));
    expect(sp(parle.texte)).toMatch(/^Semaine allégée/);
    const c = bac(true, { intention: 'entretien' });
    const t = vm.runInContext('tempsDeLaRoutine(r)', Object.assign(c, { r: ROUTINE }));
    expect(sp(t.texte)).toBe(attendu);
    expect(t.peuDeTemps).toBe(true);
  });

  test('hors semaine allégée : la durée estimée, et le geste', () => {
    const c = bac(false);
    const t = vm.runInContext('tempsDeLaRoutine(r)', Object.assign(c, { r: ROUTINE }));
    expect(t.peuDeTemps).toBe(true);
    expect(sp(t.texte)).toBe(sp(M.texteDureeEstimee(M.dureeEstimee(M.structureDeRoutine(ROUTINE.exercices, CATALOGUE)))));
  });

  test('⚠️ DISCRIMINANT (j) — pendant une semaine allégée : pas de geste, et la durée allégée', () => {
    const c = bac(true);
    const t = vm.runInContext('tempsDeLaRoutine(r)', Object.assign(c, { r: ROUTINE }));
    expect(t.peuDeTemps).toBe(false);
    expect(sp(t.texte)).toMatch(/^Semaine allégée : environ \d+ min \(estimation\)$/);
  });

  test('une routine qui tient déjà en 45 min n’a pas de geste (aucune durée plus courte à proposer)', () => {
    const c = bac(false);
    const courte = { id: 'c', exercices: [ROUTINE.exercices[3]] };
    expect(vm.runInContext('tempsDeLaRoutine(r).peuDeTemps', Object.assign(c, { r: courte }))).toBe(false);
    expect(vm.runInContext('ciblesPlusCourtes(3000)', c)).toEqual([{ min: 45, declaree: false }]);
  });
});

describe('51-1 ter — la séance raccourcie : la semaine allégée et la série de plus lisent la routine complète (app.js)', () => {
  test('⚠️ DISCRIMINANT (i) — au démarrage, la consigne figera les séries de la routine COMPLÈTE, pas celles de la séance', async () => {
    let n = 0;
    const ctx = {
      Seance: S, Moteur: M, routinesHeritees: {}, seance: null, chrono: null,
      uuid: () => 'id-' + (++n), sessionActive: null,
      sauverSeance: async () => {}, poserSeance: async () => {}, allerA: () => {}, rendreSeance: () => {},
      appliquerAllegee: async () => {}, ecrireReplis: async () => {}, appliquerSerieDePlus: async () => {},
      Routeur: { SAISIE: 'saisie' }
    };
    vm.createContext(ctx);
    ['demarrerSeance', 'nombreDeSeriesDeTravail', 'routineAFiger'].forEach((nom) => vm.runInContext(extraire(APP, nom), ctx));
    vm.runInContext('var Modele = THModele;', Object.assign(ctx, { THModele: Modele }));
    const complet = M.structureDeRoutine(ROUTINE.exercices, CATALOGUE);
    const resultat = M.raccourcirRoutine(complet, 20);
    ctx.raccourci = { cible: 20, complet, resultat };
    ctx.routine = ROUTINE;
    await vm.runInContext('demarrerSeance(routine, raccourci)', ctx);
    // La séance a 2 séries de travail au couché ; la routine en a 4.
    expect(vm.runInContext('nombreDeSeriesDeTravail("couche")', ctx)).toBe(2);
    expect(vm.runInContext('routineAFiger("couche")', ctx)).toBe(4);
    expect(ctx.seance.raccourcie).toMatchObject({ cible: 20, retires: ['re-incline', 're-tapis2'] });
  });
});
