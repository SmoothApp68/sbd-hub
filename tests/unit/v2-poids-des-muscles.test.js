//
// 65 — LE POIDS DES MUSCLES (REGLE-VOLUME §1 bis, v2_069) : principal 1, secondaire ½, STABILISATEUR ¼.
//
// Une table (`THSemaine.POIDS_DES_MUSCLES`), une lecture (`THSemaine.musclesPonderes`), lues par le volume du coach,
// la fenêtre « d'où vient ce chiffre » et le jeu ; et le polyarticulaire compte ses muscles dans les TROIS listes.
// Chaque test ci-dessous échoue sur `main` d'avant 65 : la troisième liste n'y était lue nulle part.
//
// La colonne n'existe pas encore partout : une liste ABSENTE vaut vide — un catalogue sans elle donne exactement
// les résultats d'avant (non-régression).

global.self = global;
const Modele = require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const Moteur = require('../../v2/js/moteur.js');
const Routines = require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;

// Un rowing à la manière de v2_069 : le dos principal, le biceps secondaire, l'avant-bras et les abdominaux stabilisateurs.
const ROWING = { slug: 'rowing_u65', nom: 'Rowing U65', mesure: 'charge_reps', charge: 'externe',
  muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'], muscles_stabilisateurs: ['avant_bras', 'abdominaux'] };
// Un exercice d'un seul principal et de deux stabilisateurs : trois muscles — un polyarticulaire.
const GAINE = { slug: 'gaine_u65', nom: 'Gainé U65', mesure: 'charge_reps', charge: 'externe',
  muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: ['abdominaux', 'bas_du_dos'] };
const CURL = { slug: 'curl_u65', nom: 'Curl U65', mesure: 'charge_reps', charge: 'externe',
  muscles_primaires: ['biceps'], muscles_secondaires: [] };
const SQUAT = { slug: 'squat_u65', nom: 'Squat U65', mesure: 'charge_reps', charge: 'externe',
  muscles_primaires: ['quadriceps', 'fessiers', 'adducteurs'], muscles_secondaires: [] };

const serie = (slug, i, extra) => Object.assign({ id: slug + '-' + i, session_id: 's1', exercise_slug: slug,
  type_serie: 'travail', charge_kg: 60, reps: 8, rang: i + 1 }, extra || {});
const series = (slug, n) => Array.from({ length: n }, (_, i) => serie(slug, i));

describe('musclesPonderes — la seule table des poids', () => {
  test('la table : 1, ½, ¼', () => {
    expect(Semaine.POIDS_DES_MUSCLES).toEqual({ primaire: 1, secondaire: 0.5, stabilisateur: 0.25 });
  });

  test('l’ordre : principaux, secondaires, stabilisateurs — chacun avec son rôle et son poids', () => {
    expect(Semaine.musclesPonderes(ROWING)).toEqual([
      { muscle: 'grand_dorsal', role: 'primaire', poids: 1 },
      { muscle: 'biceps', role: 'secondaire', poids: 0.5 },
      { muscle: 'avant_bras', role: 'stabilisateur', poids: 0.25 },
      { muscle: 'abdominaux', role: 'stabilisateur', poids: 0.25 }]);
  });

  test('une liste absente vaut vide (un cache, un faux serveur, une ligne sans la colonne)', () => {
    expect(Semaine.musclesPonderes(CURL)).toEqual([{ muscle: 'biceps', role: 'primaire', poids: 1 }]);
    expect(Semaine.musclesPonderes({ muscles_stabilisateurs: ['abdominaux'] }))
      .toEqual([{ muscle: 'abdominaux', role: 'stabilisateur', poids: 0.25 }]);
    expect(Semaine.musclesPonderes({})).toEqual([]);
    expect(Semaine.musclesPonderes(null)).toEqual([]);
  });

  test('un muscle déjà vu garde sa PREMIÈRE classe (la base l’interdit, la fonction s’en protège)', () => {
    expect(Semaine.musclesPonderes({ muscles_primaires: ['biceps'], muscles_secondaires: ['biceps', 'triceps'],
      muscles_stabilisateurs: ['triceps', 'avant_bras'] })).toEqual([
      { muscle: 'biceps', role: 'primaire', poids: 1 }, { muscle: 'triceps', role: 'secondaire', poids: 0.5 },
      { muscle: 'avant_bras', role: 'stabilisateur', poids: 0.25 }]);
  });
});

describe('volumeParMuscle — un stabilisateur compte ¼', () => {
  const de = (v, m) => (v.filter((x) => x.muscle === m)[0] || {}).series;

  test('⚠️ un muscle seulement stabilisateur reçoit 0,25 par série ; quatre séries font 1', () => {
    expect(de(Semaine.volumeParMuscle(series('rowing_u65', 1), [ROWING]), 'avant_bras')).toBe(0.25);
    expect(de(Semaine.volumeParMuscle(series('rowing_u65', 3), [ROWING]), 'avant_bras')).toBe(0.75);
    const v = Semaine.volumeParMuscle(series('rowing_u65', 4), [ROWING]);
    expect([de(v, 'grand_dorsal'), de(v, 'biceps'), de(v, 'avant_bras'), de(v, 'abdominaux')]).toEqual([4, 2, 1, 1]);
  });

  test('⚠️ l’arrondi est au CENTIÈME : 7 séries de stabilisateur font 1,75 (pas 1,8)', () => {
    expect(de(Semaine.volumeParMuscle(series('rowing_u65', 7), [ROWING]), 'avant_bras')).toBe(1.75);
    const z = Semaine.volumeParZone(series('rowing_u65', 7), [ROWING]);
    expect(z.filter((x) => x.zone === 'tronc')[0].series).toBe(1.75);
  });

  test('non-régression : un catalogue SANS la colonne donne exactement les résultats d’avant (1 et ½)', () => {
    const sans = Object.assign({}, ROWING);
    delete sans.muscles_stabilisateurs;
    const s = series('rowing_u65', 5).concat([serie('rowing_u65', 9, { type_serie: 'echauffement' })]);
    const avant = {};
    s.filter((x) => x.type_serie === 'travail').forEach(() => {
      (sans.muscles_primaires).forEach((m) => { avant[m] = (avant[m] || 0) + 1; });
      (sans.muscles_secondaires).forEach((m) => { avant[m] = (avant[m] || 0) + 0.5; });
    });
    const v = Semaine.volumeParMuscle(s, [sans]);
    expect(Object.fromEntries(v.map((x) => [x.muscle, x.series]))).toEqual(avant);
  });
});

describe('apportsParMuscle — la fenêtre « d’où vient ce chiffre »', () => {
  test('⚠️ le stabilisateur : `role`, un apport de 0,25 par série, `stabilisateur` vrai, `secondaire` faux', () => {
    const a = Semaine.apportsParMuscle('avant_bras', series('rowing_u65', 3), [ROWING], [{ id: 's1', debut: '2026-10-06T16:00:00Z' }]);
    expect(a).toHaveLength(1);
    expect(a[0]).toEqual(expect.objectContaining({ role: 'stabilisateur', seriesReelles: 3, apport: 0.75,
      stabilisateur: true, secondaire: false }));
  });

  test('le secondaire et le principal gardent leur forme (`secondaire` vrai pour le seul rôle secondaire)', () => {
    const b = Semaine.apportsParMuscle('biceps', series('rowing_u65', 3), [ROWING], []);
    expect(b[0]).toEqual(expect.objectContaining({ role: 'secondaire', apport: 1.5, secondaire: true, stabilisateur: false }));
    const p = Semaine.apportsParMuscle('grand_dorsal', series('rowing_u65', 3), [ROWING], []);
    expect(p[0]).toEqual(expect.objectContaining({ role: 'primaire', apport: 3, secondaire: false, stabilisateur: false }));
  });
});

describe('le polyarticulaire compte ses muscles dans les trois listes', () => {
  test('⚠️ 1 principal + 2 stabilisateurs : polyarticulaire ; sans la troisième liste, une isolation', () => {
    expect(Moteur.estPolyarticulaire({ prim: ['quadriceps'], sec: [], stab: ['abdominaux', 'bas_du_dos'] })).toBe(true);
    expect(Moteur.estPolyarticulaire({ prim: ['quadriceps'], sec: [] })).toBe(false);
    expect(Moteur.aDesMuscles({ prim: [], sec: [], stab: ['abdominaux'] })).toBe(true);
  });

  test('⚠️ « En faire une routine » : un tel exercice reçoit le repos d’un polyarticulaire (180 s en premier, 120 s ensuite), pas 90 s', () => {
    const s = (slug, rang) => ({ exercise_slug: slug, rang, type_serie: 'travail', reps: 8, groupe_superset: null, occurrence: null });
    const cat = [GAINE, CURL, SQUAT];
    const premier = Routines.routineDepuisSeance([s('curl_u65', 1), s('gaine_u65', 2), s('squat_u65', 3)],
      { titre: 'X', exercices: cat, routines: [] });
    expect(premier.exercices.map((e) => [e.exercise_slug, e.repos_cible_s]))
      .toEqual([['curl_u65', 90], ['gaine_u65', 180], ['squat_u65', 120]]);
    const ensuite = Routines.routineDepuisSeance([s('squat_u65', 1), s('gaine_u65', 2)], { titre: 'X', exercices: cat, routines: [] });
    expect(ensuite.exercices.map((e) => [e.exercise_slug, e.repos_cible_s])).toEqual([['squat_u65', 180], ['gaine_u65', 120]]);
  });

  test('⚠️ le raccourci (§9.18) : priorité 2, plancher 2 — pas le plancher 1 d’une isolation', () => {
    const structure = (stab) => [
      { slug: 'squat_u65', mesure: 'charge_reps', repos: 120, ch: 0, tr: 3, deg: 0, duree: null, prim: ['quadriceps', 'fessiers', 'adducteurs'], sec: [] },
      // Un principal que rien d'autre ne couvre : l'étape 5 (retirer un exercice entier) ne peut pas le prendre,
      // seul le plancher de l'étape 4 décide.
      { slug: 'gaine_u65', mesure: 'charge_reps', repos: 120, ch: 0, tr: 4, deg: 0, duree: null, prim: ['pectoraux'], sec: [], stab }];
    const r = Moteur.raccourcirRoutine(structure(['abdominaux', 'bas_du_dos']), 1);
    expect(r.exercices[1].tr).toBe(2);
    expect(r.exercices[1].stab).toEqual(['abdominaux', 'bas_du_dos']);       // la copie garde `stab`
    // Le témoin : sans stabilisateurs, le même exercice est une isolation et descend à 1.
    expect(Moteur.raccourcirRoutine(structure(undefined), 1).exercices[1].tr).toBe(1);
  });

  test('la structure d’une routine de l’app porte `stab` (le catalogue, absent = vide)', () => {
    const index = Modele.indexerExercices([GAINE, CURL]);
    const st = Moteur.structureDeRoutine([{ exercise_slug: 'gaine_u65', series: [{ type_serie: 'travail' }] },
      { exercise_slug: 'curl_u65', series: [{ type_serie: 'travail' }] }], index);
    expect(st.map((e) => e.stab)).toEqual([['abdominaux', 'bas_du_dos'], []]);
  });
});

describe('les textes (rendu)', () => {
  const fenetre = (apports) => {
    const c = document.createElement('div');
    Rendu.rendreFenetreMuscle(c, { libelle: 'Avant-bras', series: 1.75 }, 'Bras', apports,
      { lundi: new Date(2026, 9, 5), dimanche: new Date(2026, 9, 11) });
    return c;
  };
  const apport = (o) => Object.assign({ nom: 'Rowing', jour: null, seriesReelles: 3, apport: 3, secondaire: false, stabilisateur: false }, o);
  const note = (c) => (c.querySelector('.fen-note') || {}).textContent || null;

  test('⚠️ la ligne dit « muscle stabilisateur » ; la note ne nomme que les classes présentes', () => {
    const stab = fenetre([apport({ apport: 0.75, stabilisateur: true, role: 'stabilisateur' })]);
    expect(stab.querySelector('.fen-nom em').textContent).toBe('3 séries, muscle stabilisateur');
    expect(stab.querySelector('.fen-valeur').textContent).toBe('0,75');
    expect(note(stab)).toBe('Un muscle stabilisateur compte pour un quart de point par série.');
    expect(note(fenetre([apport({ apport: 1.5, secondaire: true })])))
      .toBe('Un muscle secondaire compte pour un demi-point par série.');
    expect(note(fenetre([apport({ apport: 1.5, secondaire: true }), apport({ apport: 0.75, stabilisateur: true })])))
      .toBe('Un muscle secondaire compte pour un demi-point par série, un stabilisateur pour un quart.');
    expect(note(fenetre([apport({})]))).toBeNull();
    expect(fenetre([apport({})]).querySelector('.fen-nom em').textContent).toBe('3 séries');
  });

  test('Jeu > Muscles : « ½ à celui qui aide, ¼ à celui qui stabilise »', () => {
    const c = document.createElement('div');
    const muscles = {};
    ['poitrine', 'dos', 'epaules', 'bras', 'jambes', 'tronc', 'cardio'].forEach((m) => { muscles[m] = { points: 0, niveau: 0, prochain: 3 }; });
    Rendu.rendreJeuMuscles(c, { etat: { muscles }, ordre: Object.keys(muscles), jauges: { muscles: {} } });
    expect(c.querySelector('.j-note').textContent).toBe('Une série de travail donne 1 point au muscle qu’elle travaille, ' +
      '½ à celui qui aide, ¼ à celui qui stabilise. Cardio : 1 point par minute.');
  });
});
