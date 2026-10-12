/** @jest-environment node */
//
// 60-2b — LES PRIORITÉS DU QUESTIONNAIRE ONT LEURS LECTEURS (MOTEUR §9.22, §14.6, §14.7).
//
//   · un EXERCICE prioritaire, présent dans les routines du dossier, est coché
//     d'office dans « Faire de ce dossier un programme » (toujours décochable) ;
//   · un MUSCLE prioritaire (sa zone est dans `profiles.priorites`) a de la place
//     pour la série de plus jusqu'à son PLUS HAUT volume (`max`), pas jusqu'au
//     troisième quartile — jamais au-delà de ce qu'il a déjà fait ;
//   · la carte le dit : « Tes pectoraux sont ta priorité : … » ;
//   · en sèche, rien ne change ; les priorités sont gelées avec la phase.
//
// ⚠️ Les deux cas de l'énoncé (A et B) sont rejoués de bout en bout : des volumes
// hebdomadaires → `placeDeVolume` → le plan → la carte.

process.env.TZ = 'Europe/Paris';

const vm = require('vm');
require('../../v2/js/modele.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Sm = require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const { extraire } = require('./aide-profil-ecran.js');

const sem = (lundi, n) => {
  const d = new Date(lundi + 'T12:00:00Z');
  return new Date(d.getTime() + n * 7 * 86400000).toISOString().slice(0, 10);
};
const suite = (volumes) => volumes.map((v, i) => ({ semaine: sem('2026-01-05', i), active: v !== null, volume: v === null ? 0 : v }));
const proche = (a, b) => Math.abs(a - b) <= 1e-4;

// Les deux historiques de l'énoncé (volume hebdomadaire du muscle).
const CAS_A = [10, 10, 10, 10, 10, 10, 16, 16, 16, 10, 10, 10, 14, 14, 14];
const CAS_B = [10, 10, 10, 10, 10, 10, 10, 10, 10, 18, 18, 18];

// ── 1. `placeDeVolume` rend aussi le plus haut volume ───────────────────────
describe('§14.6 — `max` : le plus haut volume des fenêtres de référence', () => {
  test('cas A : dernière fenêtre 14, troisième quartile 12,667, plus haut volume 16, 12 fenêtres', () => {
    const r = M.placeDeVolume(suite(CAS_A));
    expect(r.fenetres).toBe(12);
    expect(proche(r.moyenne, 14)).toBe(true);
    expect(proche(r.seuil, 12.6667)).toBe(true);
    expect(proche(r.max, 16)).toBe(true);
    expect(r.place).toBe(false);          // au-dessus du troisième quartile
  });

  test('cas B : dernière fenêtre 18, troisième quartile 10, plus haut volume 15,333, 9 fenêtres', () => {
    const r = M.placeDeVolume(suite(CAS_B));
    expect(r.fenetres).toBe(9);
    expect(proche(r.moyenne, 18)).toBe(true);
    expect(proche(r.seuil, 10)).toBe(true);
    expect(proche(r.max, 15.3333)).toBe(true);
    expect(r.place).toBe(false);
  });

  test('`max` est la plus haute fenêtre de RÉFÉRENCE : la dernière n’y compte pas', () => {
    const r = M.placeDeVolume(suite([5, 5, 5, 5, 5, 5, 5, 5, 5, 20, 20, 20]));
    expect(r.max).toBeLessThan(r.moyenne);
    expect(r.max).toBeGreaterThanOrEqual(r.seuil);
  });

  test('le plus haut volume ne baisse jamais sous le troisième quartile', () => {
    [CAS_A, CAS_B, [6, 6, 6, 6, 6, 6, 6, 6, 6, 6]].forEach((v) => {
      const r = M.placeDeVolume(suite(v));
      expect(r.max).toBeGreaterThanOrEqual(r.seuil - 1e-9);
    });
  });

  test('pas de base : toujours `null` (aucune place par priorité sans 6 fenêtres)', () => {
    expect(M.placeDeVolume(suite([10, 10, 10, 10, 10, 10, 10, 10]))).toBeNull();
  });
});

// ── 2. La place d'un exercice, avec des muscles prioritaires ────────────────
describe('§14.6 — la place pour un exercice, muscles prioritaires comprise', () => {
  const normale = { place: true, moyenne: 8, seuil: 10, max: 14, fenetres: 12 };
  const sousMax = { place: false, moyenne: 12, seuil: 10, max: 15, fenetres: 12 };
  const auDessus = { place: false, moyenne: 16, seuil: 10, max: 15, fenetres: 12 };
  const egaleMax = { place: false, moyenne: 15, seuil: 10, max: 15, fenetres: 12 };

  test('⚠️ DISCRIMINANT — un muscle prioritaire a de la place jusqu’à `max` ; un autre non', () => {
    expect(M.placePourExercice({ pectoraux: sousMax }, ['pectoraux'], ['pectoraux'])).toBe(true);
    expect(M.placePourExercice({ pectoraux: sousMax }, ['pectoraux'], [])).toBe(false);
    expect(M.placePourExercice({ pectoraux: sousMax }, ['pectoraux'])).toBe(false);
  });

  test('l’égalité avec le plus haut volume compte comme de la place, un cran au-dessus non', () => {
    expect(M.placePourExercice({ m: egaleMax }, ['m'], ['m'])).toBe(true);
    expect(M.placePourExercice({ m: auDessus }, ['m'], ['m'])).toBe(false);
  });

  test('un muscle qui a déjà de la place l’a aussi quand il est prioritaire', () => {
    expect(M.placePourExercice({ m: normale }, ['m'], ['m'])).toBe(true);
    expect(M.placePourExercice({ m: normale }, ['m'], [])).toBe(true);
  });

  test('sans base (null, absent) : pas de place, prioritaire ou non', () => {
    expect(M.placePourExercice({ m: null }, ['m'], ['m'])).toBe(false);
    expect(M.placePourExercice({}, ['m'], ['m'])).toBe(false);
  });

  test('sans `max` (le démonstrateur n’en fabrique pas) : pas de place par priorité', () => {
    const sansMax = { place: false, moyenne: 12, seuil: 10, fenetres: 12 };
    expect(M.placePourExercice({ m: sansMax }, ['m'], ['m'])).toBe(false);
  });

  test('deux primaires : un prioritaire avec de la place par `max`, l’autre sans place → pas de place', () => {
    const v = { pectoraux: sousMax, triceps: auDessus };
    expect(M.placePourExercice(v, ['pectoraux', 'triceps'], ['pectoraux'])).toBe(false);
    // l’autre sans base non plus
    expect(M.placePourExercice({ pectoraux: sousMax, triceps: null }, ['pectoraux', 'triceps'], ['pectoraux'])).toBe(false);
  });

  test('deux primaires : l’un par priorité, l’autre de place normale → de la place', () => {
    const v = { pectoraux: sousMax, triceps: normale };
    expect(M.placePourExercice(v, ['pectoraux', 'triceps'], ['pectoraux'])).toBe(true);
    expect(M.placePourExercice(v, ['pectoraux', 'triceps'], [])).toBe(false);
  });

  test('⚠️ DISCRIMINANT — la priorité d’un muscle ne vaut PAS pour les autres primaires', () => {
    const v = { pectoraux: sousMax, triceps: sousMax };
    expect(M.placePourExercice(v, ['pectoraux', 'triceps'], ['pectoraux'])).toBe(false);
    expect(M.placePourExercice(v, ['pectoraux', 'triceps'], ['pectoraux', 'triceps'])).toBe(true);
  });

  test('`musclesParPriorite` : seulement ceux dont la place ne vient QUE de la priorité', () => {
    const v = { pectoraux: sousMax, triceps: normale };
    expect(M.musclesParPriorite(v, ['pectoraux', 'triceps'], ['pectoraux'])).toEqual(['pectoraux']);
    expect(M.musclesParPriorite(v, ['pectoraux', 'triceps'], ['triceps'])).toEqual([]);   // le triceps avait déjà sa place… mais pas les pecs
    expect(M.musclesParPriorite({ pectoraux: normale }, ['pectoraux'], ['pectoraux'])).toEqual([]);
    expect(M.musclesParPriorite({ pectoraux: sousMax }, ['pectoraux'], [])).toEqual([]);
  });
});

// ── 3. La phrase de la carte ────────────────────────────────────────────────
const muscles = (cles) => cles.map((c) => ({ cle: c, libelle: Sm.libelleMuscle(c) }));
const MEILLEUR = { palier: 27, niveau: 12 };

describe('§14.7 — la phrase de la priorité', () => {
  const base = 'Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. ';
  test('sans priorité : la phrase d’avant, inchangée', () => {
    expect(M.carteSerieDePlus(MEILLEUR, 4, true, muscles(['pectoraux'])).detail)
      .toBe(base + 'Tes pectoraux restent sous leur volume habituel.');
    expect(M.carteSerieDePlus(MEILLEUR, 4, true, muscles(['pectoraux']), []).detail)
      .toBe(base + 'Tes pectoraux restent sous leur volume habituel.');
  });
  test('un muscle au pluriel : « Tes pectoraux sont ta priorité »', () => {
    expect(M.carteSerieDePlus(MEILLEUR, 4, true, muscles(['pectoraux']), muscles(['pectoraux'])).detail)
      .toBe(base + 'Tes pectoraux sont ta priorité : je te laisse aller jusqu\'à ton plus haut volume.');
  });
  test('un muscle au singulier : « Ton grand dorsal est ta priorité »', () => {
    expect(M.carteSerieDePlus(MEILLEUR, 4, true, muscles(['grand_dorsal']), muscles(['grand_dorsal'])).detail)
      .toBe(base + 'Ton grand dorsal est ta priorité : je te laisse aller jusqu\'à ton plus haut volume.');
  });
  test('plusieurs muscles prioritaires : « sont tes priorités »', () => {
    expect(M.carteSerieDePlus(MEILLEUR, 4, true, muscles(['biceps', 'grand_dorsal']), muscles(['biceps', 'grand_dorsal'])).detail)
      .toBe(base + 'Tes biceps et ton grand dorsal sont tes priorités : je te laisse aller jusqu\'à ton plus haut volume.');
  });
  test('seuls les muscles dont la place vient de la priorité sont nommés', () => {
    expect(M.carteSerieDePlus(MEILLEUR, 4, true, muscles(['biceps', 'grand_dorsal']), muscles(['grand_dorsal'])).detail)
      .toBe(base + 'Ton grand dorsal est ta priorité : je te laisse aller jusqu\'à ton plus haut volume.');
  });
  test('le reste de la carte ne bouge pas (phrase, boutons, gris)', () => {
    const a = M.carteSerieDePlus(MEILLEUR, 4, true, muscles(['pectoraux']));
    const b = M.carteSerieDePlus(MEILLEUR, 4, true, muscles(['pectoraux']), muscles(['pectoraux']));
    expect(Object.assign({}, b, { detail: a.detail })).toEqual(a);
  });
});

// ── 4. Le plan : les cas A et B de bout en bout ─────────────────────────────
const C = { etat: 'progression', zone: 'volume', palier: 27, niveau: 12, n: 3,
  ligne: { charge: 27, vise: 12 }, haut: { charge: 29, vise: 12, k: 1 }, fondement: {} };
const CAT = { pecs: { equipement: 'machine', muscles_primaires: ['pectoraux'] } };
function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'pecs', id, { series: 3 });
  const k = Object.assign({}, C);
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: 4, meilleur: MEILLEUR, blocages: [] }, repli: null };
  const e = { seance: { id: 'S1', debut: '2026-10-01T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: { pecs: c }, reglage: 'normal', paris: [], suites: {}, phase: opt.phase || 'maintien',
    catalogue: opt.catalogue || CAT, volume: opt.volume,
    escalier: { cartes: [], compteurs: [], noms: {}, seriesRoutine: { pecs: 3 }, marches: [] } };
  if (opt.priorites !== undefined) e.priorites = opt.priorites;
  return { e, p: T.planDeSeance(e) };
}
const PRIORITE = 'Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. ' +
  'Tes pectoraux sont ta priorité : je te laisse aller jusqu\'à ton plus haut volume.';
const NORMALE = 'Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. ' +
  'Tes pectoraux restent sous leur volume habituel.';

describe('§14.6, §14.7 — le plan, cas A (entre le troisième quartile et le plus haut volume)', () => {
  const volume = () => ({ pectoraux: M.placeDeVolume(suite(CAS_A)) });

  test('⚠️ DISCRIMINANT — pectoraux NON prioritaires : pas de place, pas de carte', () => {
    const { e, p } = decor({ volume: volume() });
    const x = p.exercices[0];
    expect(x.placeSerieDePlus).toBe(false);
    expect(x.escalier.marche).not.toBe('serie_de_plus');
    expect(x.escalier.carte).toBeUndefined();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — pectoraux prioritaires (zone « poitrine ») : de la place, et la phrase de la priorité', () => {
    const { e, p } = decor({ volume: volume(), priorites: ['poitrine'] });
    const x = p.exercices[0];
    expect(x.placeSerieDePlus).toBe(true);
    expect(x.escalier.marche).toBe('serie_de_plus');
    expect(x.escalier.carte.detail).toBe(PRIORITE);
    expect([x.escalier.carte.oui, x.escalier.carte.non]).toEqual(['Ajouter une série', 'Non merci']);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('une priorité sur une AUTRE zone ne donne rien aux pectoraux', () => {
    const { p } = decor({ volume: volume(), priorites: ['dos', 'jambes'] });
    expect(p.exercices[0].placeSerieDePlus).toBe(false);
    expect(p.exercices[0].escalier.carte).toBeUndefined();
  });

  test('un exercice prioritaire (un slug) ne rend pas son muscle prioritaire', () => {
    const { p } = decor({ volume: volume(), priorites: ['developpe_couche_barre'] });
    expect(p.exercices[0].placeSerieDePlus).toBe(false);
  });

  test('la carte garde sa forme de toujours quand la place est normale, même prioritaire', () => {
    const normal = { pectoraux: { place: true, moyenne: 8, seuil: 10, max: 14, fenetres: 12 } };
    [[], ['poitrine']].forEach((priorites) => {
      const { e, p } = decor({ volume: normal, priorites });
      expect(p.exercices[0].escalier.carte.detail).toBe(NORMALE);
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });
});

describe('§14.6, §14.7 — le plan, cas B (au-dessus du plus haut volume)', () => {
  const volume = () => ({ pectoraux: M.placeDeVolume(suite(CAS_B)) });
  test('⚠️ DISCRIMINANT — ni prioritaire ni non : pas de place, pas de carte', () => {
    [undefined, [], ['poitrine']].forEach((priorites) => {
      const { e, p } = decor({ volume: volume(), priorites });
      const x = p.exercices[0];
      expect([priorites, x.placeSerieDePlus]).toEqual([priorites, false]);
      expect(x.escalier.carte).toBeUndefined();
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });
});

describe('§14.6 — un exercice à deux muscles primaires', () => {
  const CAT2 = { pecs: { equipement: 'machine', muscles_primaires: ['pectoraux', 'biceps'] } };
  const sousMax = { place: false, moyenne: 12, seuil: 10, max: 15, fenetres: 12 };
  const sansPlace = { place: false, moyenne: 18, seuil: 10, max: 15, fenetres: 12 };
  const normale = { place: true, moyenne: 8, seuil: 10, max: 14, fenetres: 12 };

  test('⚠️ DISCRIMINANT — pectoraux prioritaires avec de la place par `max`, biceps non prioritaires sans place → pas de place', () => {
    const { e, p } = decor({ catalogue: CAT2, volume: { pectoraux: sousMax, biceps: sansPlace }, priorites: ['poitrine'] });
    expect(p.exercices[0].placeSerieDePlus).toBe(false);
    expect(p.exercices[0].escalier.carte).toBeUndefined();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('biceps de place normale : la carte ne nomme que le muscle qui n’a de place que par sa priorité', () => {
    const { e, p } = decor({ catalogue: CAT2, volume: { pectoraux: sousMax, biceps: normale }, priorites: ['poitrine'] });
    const x = p.exercices[0];
    expect(x.placeSerieDePlus).toBe(true);
    expect(x.escalier.carte.detail).toBe(
      'Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. ' +
      'Tes pectoraux sont ta priorité : je te laisse aller jusqu\'à ton plus haut volume.');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('les deux muscles prioritaires par `max` : « sont tes priorités »', () => {
    const { p } = decor({ catalogue: CAT2, volume: { pectoraux: sousMax, biceps: sousMax }, priorites: ['poitrine', 'bras'] });
    expect(p.exercices[0].escalier.carte.detail).toBe(
      'Sur cet exercice, une série de plus aide souvent : environ 20 % de travail en plus. ' +
      'Tes pectoraux et tes biceps sont tes priorités : je te laisse aller jusqu\'à ton plus haut volume.');
  });
});

describe('§14.6, §9.16 — EN SÈCHE, rien ne change', () => {
  test('⚠️ DISCRIMINANT — cas A en sèche, pectoraux prioritaires : aucune carte, et le fait de place est celui d’avant', () => {
    const volume = { pectoraux: M.placeDeVolume(suite(CAS_A)) };
    const seche = decor({ phase: 'seche', volume, priorites: ['poitrine'] });
    const sans = decor({ phase: 'seche', volume });
    const x = seche.p.exercices[0];
    expect(x.escalier.marche).toBe('seche_rien');
    expect(x.escalier.carte).toBeUndefined();
    expect(x.placeSerieDePlus).toBe(false);
    expect(x.placeSerieDePlus).toBe(sans.p.exercices[0].placeSerieDePlus);
    expect(T.verifierPlan(seche.p, seche.e).erreurs).toEqual([]);
  });

  test('le plan de sèche est identique avec ou sans priorités (à la clé `priorites` près)', () => {
    const volume = { pectoraux: M.placeDeVolume(suite(CAS_A)) };
    const norm = (p) => JSON.stringify(p, (k, v) => (k === 'priorites' ? undefined : v));
    expect(norm(decor({ phase: 'seche', volume, priorites: ['poitrine'] }).p))
      .toBe(norm(decor({ phase: 'seche', volume }).p));
  });
});

describe('§14.6 — les priorités sont une entrée du plan, lues comme elles viennent de la base', () => {
  const volume = () => ({ pectoraux: M.placeDeVolume(suite(CAS_A)) });
  test('`null`, `[]`, un nombre, un objet, des valeurs étrangères : aucune priorité, sans erreur', () => {
    [null, [], 3, {}, 'poitrine', [3, null, {}], ['inconnue']].forEach((v) => {
      const { e, p } = decor({ volume: volume(), priorites: v });
      expect([v, p.exercices[0].placeSerieDePlus]).toEqual([v, false]);
      expect(p.priorites.every((x) => typeof x === 'string')).toBe(true);
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });
  test('le plan porte les priorités qu’il a reçues (des chaînes seulement)', () => {
    expect(decor({ volume: volume(), priorites: ['poitrine', 'squat_barre', 7] }).p.priorites)
      .toEqual(['poitrine', 'squat_barre']);
    expect(decor({ volume: volume() }).p.priorites).toEqual([]);
  });
  test('même entrée, même plan (I12)', () => {
    const a = decor({ volume: volume(), priorites: ['poitrine'] });
    expect(JSON.stringify(T.planDeSeance(a.e))).toBe(JSON.stringify(a.p));
  });
  test('GARDE — I23 voit la carte de priorité comme une carte AVEC place (pas de fausse alerte)', () => {
    const { e, p } = decor({ volume: volume(), priorites: ['poitrine'] });
    expect(T.verifierPlan(p, e).erreurs.filter((x) => /I23/.test(x))).toEqual([]);
    const forge = JSON.parse(JSON.stringify(p));
    forge.exercices[0].placeSerieDePlus = false;
    expect(T.verifierPlan(forge).erreurs.some((x) => /^I23 .*sans place/.test(x))).toBe(true);
  });
});

// ── 5. Les exercices prioritaires cochés d'office ───────────────────────────
describe('§9.22 — « Faire de ce dossier un programme » : l’exercice prioritaire est coché d’office', () => {
  const CATALOGUE = {
    squat_barre: { equipement: 'barre', charge: 'absolue', muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers', 'ischio_jambiers'] },
    developpe_couche_barre: { equipement: 'barre', charge: 'absolue', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
    tractions: { equipement: 'poids_du_corps', charge: 'absolue', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps', 'haut_du_dos', 'avant_bras'] },
    curl: { equipement: 'barre', charge: 'absolue', muscles_primaires: ['biceps'], muscles_secondaires: [] },
    souleve_de_terre_barre: { equipement: 'barre', charge: 'absolue', muscles_primaires: ['ischio_jambiers'], muscles_secondaires: ['fessiers', 'bas_du_dos'] }
  };
  const DOSSIER = ['squat_barre', 'developpe_couche_barre', 'tractions', 'curl'];

  test('sans priorité : le comportement d’avant (les barres polyarticulaires, rien d’autre)', () => {
    expect(M.exercicesParDefaut(DOSSIER, CATALOGUE)).toEqual(['squat_barre', 'developpe_couche_barre']);
    [undefined, null, [], 'tractions', 3, {}].forEach((v) => {
      expect([v, M.exercicesParDefaut(DOSSIER, CATALOGUE, v)]).toEqual([v, ['squat_barre', 'developpe_couche_barre']]);
    });
  });

  test('⚠️ DISCRIMINANT — un exercice prioritaire hors barre (tractions) est coché, à sa place dans l’ordre des routines', () => {
    expect(M.exercicesParDefaut(DOSSIER, CATALOGUE, ['tractions']))
      .toEqual(['squat_barre', 'developpe_couche_barre', 'tractions']);
    expect(M.exercicesParDefaut(['tractions', 'squat_barre', 'developpe_couche_barre'], CATALOGUE, ['tractions']))
      .toEqual(['tractions', 'squat_barre', 'developpe_couche_barre']);
  });

  test('un prioritaire qui n’est pas polyarticulaire (curl, 1 muscle) est tout de même coché', () => {
    expect(M.exercicesParDefaut(DOSSIER, CATALOGUE, ['curl']))
      .toEqual(['squat_barre', 'developpe_couche_barre', 'curl']);
  });

  test('un prioritaire déjà coché par défaut n’est pas doublé', () => {
    expect(M.exercicesParDefaut(DOSSIER, CATALOGUE, ['squat_barre', 'developpe_couche_barre']))
      .toEqual(['squat_barre', 'developpe_couche_barre']);
  });

  test('un prioritaire ABSENT des routines du dossier ne fait rien', () => {
    expect(M.exercicesParDefaut(DOSSIER, CATALOGUE, ['souleve_de_terre_barre']))
      .toEqual(['squat_barre', 'developpe_couche_barre']);
    expect(M.exercicesParDefaut([], CATALOGUE, ['tractions'])).toEqual([]);
  });

  test('les clés de zone (muscles) ne cochent rien : seuls les exercices comptent', () => {
    expect(M.exercicesParDefaut(DOSSIER, CATALOGUE, ['bras', 'dos', 'poitrine']))
      .toEqual(['squat_barre', 'developpe_couche_barre']);
  });

  test('un exercice prioritaire sans entrée au catalogue mais dans les routines est coché ; deux fois dans les routines, une seule', () => {
    expect(M.exercicesParDefaut(['inconnu', 'tractions', 'tractions'], {}, ['inconnu', 'tractions'])).toEqual(['inconnu', 'tractions']);
  });

  test('une valeur qui ressemble à une propriété de l’objet ne coche rien', () => {
    expect(M.exercicesParDefaut(['constructor', '__proto__', 'toString'], {}, [])).toEqual([]);
  });

  describe('`ouvrirProgramme` (app.js, rejoué)', () => {
    function bac(profil) {
      const ctx = {
        Moteur: M, Profil, profil,
        exercicesDuDossier: () => DOSSIER.slice(),
        catalogueIndexe: () => CATALOGUE,
        rendreFeuilleProgramme: () => {}, ouvrirVoile: () => {}, $: () => ({}),
        programmeEnCours: null
      };
      vm.createContext(ctx);
      vm.runInContext(extraire('ouvrirProgramme'), ctx);
      return (depuis) => { vm.runInContext('ouvrirProgramme("Force", depuis)', Object.assign(ctx, { depuis: depuis || null })); return ctx.programmeEnCours; };
    }
    const cochees = (p) => Object.keys(p.coches).filter((s) => p.coches[s]);

    test('⚠️ DISCRIMINANT — le profil ayant `tractions` en priorité, la feuille la coche', () => {
      expect(cochees(bac({ priorites: ['tractions', 'poitrine'] })())).toEqual(['squat_barre', 'developpe_couche_barre', 'tractions']);
      expect(cochees(bac({ priorites: null })())).toEqual(['squat_barre', 'developpe_couche_barre']);
      expect(cochees(bac(null)())).toEqual(['squat_barre', 'developpe_couche_barre']);
    });

    test('toujours décochable : la coche est un brouillon', () => {
      const ouvrir = bac({ priorites: ['tractions'] });
      const p = ouvrir();
      expect(p.coches.tractions).toBe(true);
      p.coches.tractions = false;
      expect(p.slugs).toContain('tractions');          // toujours listée, à cocher
    });

    test('un bloc AJUSTÉ garde les exercices du bloc fini, les priorités ne s’y ajoutent pas', () => {
      const fini = { id: 'b', zone: 'mix', semaines: 4, exercices: ['squat_barre'] };
      expect(cochees(bac({ priorites: ['tractions'] })(fini))).toEqual(['squat_barre']);
    });

    test('I37 reste vrai : la zone proposée est une zone de bloc, quelles que soient les priorités', () => {
      expect(M.ZONES_DE_BLOC).toContain(bac({ priorites: ['tractions'], objectif: 'force' })().zone);
    });
  });
});

// ── 6. Le gel : lues une fois, gelées pour la séance ────────────────────────
describe('§14.6 — les priorités, gelées avec la phase', () => {
  test('`prioritesDe` : la liste de chaînes du profil, sinon aucune — elle se lit sans se valider', () => {
    expect(Profil.prioritesDe({ priorites: ['poitrine', 'squat_barre'] })).toEqual(['poitrine', 'squat_barre']);
    [null, undefined, 'poitrine', 3, {}].forEach((v) => expect(Profil.prioritesDe({ priorites: v })).toEqual([]));
    expect(Profil.prioritesDe(null)).toEqual([]);
    // Une valeur inconnue ne correspond à aucune routine ni zone : inoffensive, sans filtre.
    expect(Profil.prioritesDe({ priorites: ['zzz', 3, 'poitrine', null] })).toEqual(['zzz', 'poitrine']);
  });

  test('`prioritesGelees` : même séance, le gel reste quoi que dise le profil', () => {
    const gel = { seanceId: 'S1', priorites: ['poitrine'] };
    expect(Profil.prioritesGelees(gel, 'S1', undefined, { priorites: ['dos'] })).toBe(gel);
  });

  test('une autre séance : la liste sauvée, sinon celle du profil maintenant', () => {
    expect(Profil.prioritesGelees(null, 'S2', ['bras'], { priorites: ['dos'] })).toEqual({ seanceId: 'S2', priorites: ['bras'] });
    expect(Profil.prioritesGelees({ seanceId: 'S1', priorites: ['poitrine'] }, 'S2', undefined, { priorites: ['dos'] }))
      .toEqual({ seanceId: 'S2', priorites: ['dos'] });
  });

  test('⚠️ DISCRIMINANT — `[]` sauvé est une liste (« aucune ») : elle n’est PAS remplacée par celle du profil', () => {
    expect(Profil.prioritesGelees(null, 'S2', [], { priorites: ['dos'] })).toEqual({ seanceId: 'S2', priorites: [] });
    expect(Profil.prioritesGelees(null, 'S2', undefined, { priorites: ['dos'] })).toEqual({ seanceId: 'S2', priorites: ['dos'] });
  });

  test('GARDE — `prioritesDeLaSeance` gèle les priorités pour la séance, le profil peut changer', () => {
    const ctx = { Profil, seance: { id: 'S1' }, consignesSauvees: null, prioritesGelees: null, profil: { priorites: ['poitrine'] } };
    vm.createContext(ctx);
    vm.runInContext(extraire('prioritesDeLaSeance'), ctx);
    expect(vm.runInContext('prioritesDeLaSeance()', ctx)).toEqual(['poitrine']);
    ctx.profil = { priorites: ['dos'] };
    expect(vm.runInContext('prioritesDeLaSeance()', ctx)).toEqual(['poitrine']);          // gelées
    ctx.seance = { id: 'S2' };
    expect(vm.runInContext('prioritesDeLaSeance()', ctx)).toEqual(['dos']);               // la séance suivante
    ctx.seance = null;
    expect(vm.runInContext('prioritesDeLaSeance()', ctx)).toEqual([]);                    // hors séance
  });

  test('au rechargement, la liste gelée relue du disque l’emporte sur le profil — `[]` compris', () => {
    const rel = (sauvees) => {
      const ctx = { Profil, seance: { id: 'S1' }, consignesSauvees: sauvees, prioritesGelees: null, profil: { priorites: ['dos'] } };
      vm.createContext(ctx);
      vm.runInContext(extraire('prioritesDeLaSeance'), ctx);
      return vm.runInContext('prioritesDeLaSeance()', ctx);
    };
    expect(rel({ seanceId: 'S1', priorites: ['poitrine'] })).toEqual(['poitrine']);
    expect(rel({ seanceId: 'S1', priorites: [] })).toEqual([]);
    expect(rel({ seanceId: 'S1' })).toEqual(['dos']);                      // séance gelée avant 60-2b
    expect(rel({ seanceId: 'AUTRE', priorites: ['poitrine'] })).toEqual(['dos']);
  });

  test('`sauverConsignes` écrit les priorités gelées avec la phase ; `oublierConsignes` les lâche avec elle', () => {
    expect(extraire('sauverConsignes')).toMatch(/priorites: prioritesDeLaSeance\(\)/);
    expect(extraire('oublierConsignes')).toMatch(/phaseGelee = null;\s*objectifGele = null;\s*prioritesGelees = null;/);
  });

  test('`entreesDuPlan` donne les priorités gelées au plan, à côté de la phase et de l’objectif', () => {
    expect(extraire('entreesDuPlan')).toMatch(/objectif: objectifDeLaSeance\(\),[\s\S]*priorites: prioritesDeLaSeance\(\)/);
  });

  test('le rejeu sauve et restaure le gel des priorités avec celui de la phase', () => {
    const avec = extraire('avecEtatDeRejeu');
    expect(avec).toMatch(/prioritesGelees: prioritesGelees/);
    expect(avec).toMatch(/prioritesGelees = e\.memo\.prioritesGelees/);
    expect(avec).toMatch(/e\.memo\.prioritesGelees = prioritesGelees/);
    expect(avec).toMatch(/prioritesGelees = avant\.prioritesGelees/);
  });

  // 68A l'a montée à 11 (l'élan, MOTEUR §9.14 bis), 68B à 12 (« à fond », §9.14 ter) :
  // ce chantier-ci ne la touchait pas.
  test('`VERSION_CONSIGNE` ne bouge pas avec ce chantier (13 depuis 74)', () => {
    expect(M.VERSION_CONSIGNE).toBe(13);
  });
});
