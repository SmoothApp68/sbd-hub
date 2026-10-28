/** @jest-environment node */
//
// 99 — LA SEMAINE QUI DÉRAILLE (MOTEUR §9.24). Programme Push / Jambes / Pull / Push / Jambes (lundi, mardi,
// mercredi, vendredi, samedi) ; un jour manqué en début, en milieu, en fin de semaine ; deux jours manqués ; un
// débutant ; un bloc (cycle) ; une personne sans programme. Chaque fixture déclenche vraiment le chemin qu'elle
// nomme (le jour, ce qui est fait, ce qui ne l'est pas).

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
require('../../v2/js/moteur.js');
const G = require('../../v2/js/generateur.js');
const D = require('../../v2/js/deraille.js');

const CAT = {
  couche: { nom: 'Développé Couché (Barre)', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'], muscles_stabilisateurs: [] },
  militaire: { nom: 'Développé Militaire', muscles_primaires: ['deltoide_anterieur'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: ['abdominaux'] },
  squat: { nom: 'Squat (Barre)', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['adducteurs'], muscles_stabilisateurs: ['bas_du_dos'] },
  roumain: { nom: 'Soulevé de Terre Roumain (Barre)', muscles_primaires: ['ischio_jambiers', 'fessiers'], muscles_secondaires: [], muscles_stabilisateurs: ['bas_du_dos'] },
  legcurl: { nom: 'Leg Curl Assis', muscles_primaires: ['ischio_jambiers'], muscles_secondaires: [], muscles_stabilisateurs: [] },
  tractions: { nom: 'Tractions', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'], muscles_stabilisateurs: [] },
  rowing: { nom: 'Rowing Penché (Barre)', muscles_primaires: ['grand_dorsal', 'haut_du_dos'], muscles_secondaires: ['biceps'], muscles_stabilisateurs: ['bas_du_dos'] },
  curl: { nom: 'Curl Biceps', muscles_primaires: ['biceps'], muscles_secondaires: [], muscles_stabilisateurs: [] }
};
const ex = (slug, n) => ({ exercise_slug: slug, repos_cible_s: 120,
  series: [{ type_serie: 'echauffement', reps: 8 }].concat(Array.from({ length: n }, () => ({ type_serie: 'travail', reps: 6 }))) });
const PUSH = { id: 'r-push', nom: 'Lundi — Push', exercices: [ex('couche', 4), ex('militaire', 3)] };
const JAMBES = { id: 'r-jambes', nom: 'Mardi — Jambes', exercices: [ex('squat', 4), ex('roumain', 3), ex('legcurl', 3)] };
const PULL = { id: 'r-pull', nom: 'Mercredi — Pull', exercices: [ex('tractions', 4), ex('rowing', 4), ex('curl', 3)] };
const programme = (j) => [Object.assign({}, PUSH, { jours: j.push || [1, 5] }), Object.assign({}, JAMBES, { jours: j.jambes || [2, 6] }),
  Object.assign({}, PULL, { jours: j.pull || [3] })];
const fait = (jour, routine, slugs) => ({ jour, routine_id: routine, slugs });
const entree = (o) => Object.assign({ catalogue: CAT, debutant: false, dureeMax_s: null, volume: {}, etat: null,
  routines: programme({}), seances: [] }, o);

describe('les jours d’une routine', () => {
  test('le préfixe exact « <Jour> — » (la règle de v2_084), sinon rien', () => {
    expect(D.jourDuNom('Lundi — Haut A (Couché)')).toEqual([1]);
    expect(D.jourDuNom('Dimanche — Jambes')).toEqual([7]);
    expect(D.jourDuNom('Haut A')).toBeNull();
    expect(D.jourDuNom('lundi — Haut')).toBeNull();
    expect(D.jourDuNom('Lundi - Haut')).toBeNull();
    expect(D.nomCourt('Mardi — Jambes')).toBe('Jambes');
  });
});

describe('un jour manqué en début de semaine (Jambes mardi, ouverture mercredi)', () => {
  const e = entree({ jour: '2026-10-14', seances: [fait('2026-10-12', 'r-push', ['couche', 'militaire'])] });
  const c = D.semaineQuiDeraille(e);
  test('la carte parle du plan : « Jambes n’a pas eu lieu mardi. », trois choix, le décalage mis en avant', () => {
    expect(c.titre).toBe('Jambes n\'a pas eu lieu mardi.');
    expect(c.sorte).toBe('choix');
    expect(c.choix.map((x) => x.libelle)).toEqual(['Jambes aujourd\'hui · la suite se décale',
      'Répartir ses séries dans la semaine', 'Garder Pull, comme prévu']);
    expect(c.choix[0].avant).toBe(true);
    expect(c.pourquoi).toBe('Mis en avant : il garde les 10 séries de Jambes.');
    expect(JSON.stringify(c)).not.toMatch(/habitude|tu n'as|assidu|moins que/i);
  });
  test('le décalage : Jambes mercredi, Pull jeudi (jour libre), vendredi et samedi inchangés', () => {
    expect(c.choix[0].planning).toEqual([{ routine: 'r-push', jour: 1 }, { routine: 'r-jambes', jour: 3 },
      { routine: 'r-pull', jour: 4 }, { routine: 'r-push', jour: 5 }, { routine: 'r-jambes', jour: 6 }]);
  });
  test('répartir : le leg curl va sur Pull (pas de squat ni de soulevé après le rowing : lombaires) ; rien sur Push vendredi, la veille de Jambes', () => {
    const r = c.choix[1];
    expect(r.ajouts.map((a) => [a.nomRoutine, a.jourNom, a.slug, a.series])).toEqual([['Pull', 'mercredi', 'legcurl', 3]]);
    expect(r.ajouts[0].exercice.series.every((s) => s.type_serie === 'travail')).toBe(true);
    expect(r.ajouts[0].exercice.series.length).toBe(3);
  });
  test('décider « Jambes aujourd’hui » : la question n’est plus posée ; la bande montre la semaine décalée', () => {
    const etat = D.decider(null, c, 'decaler', '2026-10-14');
    expect(D.semaineQuiDeraille(Object.assign({}, e, { etat }))).toBeNull();
    expect(D.bandeDeLaSemaine(e.routines, etat, '2026-10-14').map((j) => j.routine))
      .toEqual(['Push', null, 'Jambes', 'Pull', 'Push', 'Jambes', null]);
    // Jeudi, Pull fait : rien ; vendredi, Pull pas fait : une nouvelle question (une autre séance).
    const jeudi = Object.assign({}, e, { jour: '2026-10-15', etat, seances: e.seances.concat([fait('2026-10-14', 'r-jambes', ['squat'])]) });
    expect(D.semaineQuiDeraille(jeudi)).toBeNull();
    const vendredi = Object.assign({}, jeudi, { jour: '2026-10-16' });
    expect(D.semaineQuiDeraille(vendredi).titre).toBe('Pull n\'a pas eu lieu jeudi.');
  });
  test('décider « Garder Pull » est respecté : plus de question pour mardi', () => {
    const etat = D.decider(null, c, 'garder', '2026-10-14');
    expect(D.semaineQuiDeraille(Object.assign({}, e, { etat }))).toBeNull();
    expect(etat.planning).toBeNull();
    expect(etat.ajouts).toEqual([]);
  });
  test('décider « Répartir » : le leg curl s’ajoute à Pull, aujourd’hui seulement, avec sa mention', () => {
    const etat = D.decider(null, c, 'repartir', '2026-10-14');
    const a = D.ajoutsDuJour(etat, 'r-pull', '2026-10-14');
    expect(a.map((x) => [x.exercice.exercise_slug, x.mention])).toEqual([['legcurl', 'séance manquée de mardi']]);
    expect(D.ajoutsDuJour(etat, 'r-pull', '2026-10-21')).toEqual([]);   // la semaine suivante : rien
    expect(D.ajoutsDuJour(etat, 'r-push', '2026-10-14')).toEqual([]);
  });
});

describe('un jour manqué en milieu de semaine (Pull mercredi, ouverture jeudi, jour sans séance)', () => {
  const e = entree({ jour: '2026-10-15', seances: [fait('2026-10-12', 'r-push', ['couche']), fait('2026-10-13', 'r-jambes', ['squat', 'roumain'])] });
  const c = D.semaineQuiDeraille(e);
  test('Pull aujourd’hui ; vendredi et samedi ne bougent pas ; « Garder la semaine »', () => {
    expect(c.titre).toBe('Pull n\'a pas eu lieu mercredi.');
    expect(c.choix[0].planning.filter((p) => p.jour >= 4)).toEqual([{ routine: 'r-pull', jour: 4 },
      { routine: 'r-push', jour: 5 }, { routine: 'r-jambes', jour: 6 }]);
    expect(c.choix[c.choix.length - 1].libelle).toBe('Garder la semaine, comme prévue');
  });
});

describe('un jour manqué en fin de semaine (Push vendredi, ouverture samedi)', () => {
  const e = entree({ jour: '2026-10-17', volume: { pectoraux: 4, quadriceps: 4 }, seances: [fait('2026-10-12', 'r-push', ['couche', 'militaire']),
    fait('2026-10-13', 'r-jambes', ['squat']), fait('2026-10-14', 'r-pull', ['tractions'])] });
  const c = D.semaineQuiDeraille(e);
  test('plus la place de décaler : « Ajouter … à la fin de Jambes ? » / « Non merci », référence = le programme', () => {
    expect(c.sorte).toBe('fin');
    // Le muscle le plus en retard sur le programme : le deltoïde antérieur (10 prévues, 0 faites).
    expect(c.phrase).toBe('Deltoïde antérieur : 0 série cette semaine ; ton programme en prévoit 10. ' +
      'Ajouter 3 séries de Développé Militaire à la fin de Jambes ?');
    expect(c.choix.map((x) => x.libelle)).toEqual(['Ajouter', 'Non merci']);
    expect(c.phrase).not.toMatch(/habitude/);
  });
  test('« Non merci » : plus rien cette semaine ; « Ajouter » : l’exercice part dans Jambes aujourd’hui', () => {
    expect(D.semaineQuiDeraille(Object.assign({}, e, { etat: D.decider(null, c, 'non', '2026-10-17') }))).toBeNull();
    // Audit du 16/10/2026, 01 #10 — UNE carte de fin, que la vraie fin de semaine et le repli (ni décalage ni
    // répartition) lisent : la phrase aux deux chiffres n'est écrite qu'une fois.
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/deraille.js'), 'utf8');
    expect([src.split(' à la fin de ').length - 1, src.split('ton programme en prévoit').length - 1]).toEqual([1, 1]);
    const etat = D.decider(null, c, 'ajouter', '2026-10-17');
    expect(D.ajoutsDuJour(etat, 'r-jambes', '2026-10-17').map((a) => a.mention)).toEqual(['séance manquée de vendredi']);
  });
});

describe('deux jours manqués (Jambes mardi, Pull mercredi ; ouverture jeudi)', () => {
  const e = entree({ jour: '2026-10-15', seances: [fait('2026-10-12', 'r-push', ['couche'])] });
  const c = D.semaineQuiDeraille(e);
  test('une seule question, sur le muscle le plus en retard sur le programme (Jambes : fessiers 14 prévues, 0 faites)', () => {
    expect(c.titre).toBe('Jambes n\'a pas eu lieu mardi.');
    expect(c.cles.sort()).toEqual(['r-jambes@2', 'r-pull@3']);
    expect(D.semaineQuiDeraille(Object.assign({}, e, { etat: D.decider(null, c, 'garder', '2026-10-15') }))).toBeNull();
  });
});

describe('la récupération : jamais les mêmes muscles principaux le lendemain ; débutant J+3', () => {
  test('un squat libre hier (hors routine) : Jambes aujourd’hui n’est pas proposé', () => {
    const e = entree({ jour: '2026-10-14', seances: [fait('2026-10-12', 'r-push', ['couche']), fait('2026-10-13', null, ['squat'])] });
    const c = D.semaineQuiDeraille(e);
    expect(c.titre).toBe('Jambes n\'a pas eu lieu mardi.');
    expect(c.choix.map((x) => x.cle)).not.toContain('decaler');
  });
  test('Jambes mercredi puis Jambes vendredi (J+2) : proposé ; pour un débutant (J+3) : non', () => {
    const routines = programme({ push: [1, 6], jambes: [2, 5] });
    const e = entree({ jour: '2026-10-14', routines, seances: [fait('2026-10-12', 'r-push', ['couche'])] });
    expect(D.semaineQuiDeraille(e).choix.map((x) => x.cle)).toContain('decaler');
    const deb = D.semaineQuiDeraille(Object.assign({}, e, { debutant: true }));
    // Ni décalage, ni leg curl sur Pull (Jambes vendredi à J+2), ni place en fin : aucune carte.
    expect(deb).toBeNull();
  });
});

describe('rien n’est reporté à la semaine suivante ; le bloc garde son calendrier', () => {
  test('lundi, une séance manquée de la semaine d’avant : rien', () => {
    const e = entree({ jour: '2026-10-19', seances: [fait('2026-10-12', 'r-push', ['couche'])] });
    expect(D.semaineQuiDeraille(e)).toBeNull();
  });
  test('le décalage ne passe jamais dimanche : sinon il n’est pas proposé', () => {
    const routines = programme({ push: [1, 6], jambes: [2, 7], pull: [5] });
    // Jambes mardi manqué, ouverture vendredi : Jambes ven → Pull sam → Push dim → Jambes lundi suivant : refusé.
    const e = entree({ jour: '2026-10-16', routines, seances: [fait('2026-10-12', 'r-push', ['couche'])] });
    const c = D.semaineQuiDeraille(e);
    expect(c.choix.map((x) => x.cle)).not.toContain('decaler');
    (c.choix.filter((x) => x.planning)[0] || { planning: [] }).planning.forEach((p) => expect(p.jour).toBeLessThanOrEqual(7));
  });
  test('un programme à cycles : le décalage ne touche qu’au jour des routines (aucun bloc, aucune date de bloc dans la sortie)', () => {
    const e = entree({ jour: '2026-10-14', seances: [fait('2026-10-12', 'r-push', ['couche'])], bloc: { debut: '2026-10-12', semaines: 4 } });
    const c = D.semaineQuiDeraille(e);
    const etat = D.decider(null, c, 'decaler', '2026-10-14');
    expect(Object.keys(etat).sort()).toEqual(['ajouts', 'lundi', 'planning', 'questions']);
    expect(etat.planning.every((p) => p.jour >= 1 && p.jour <= 7)).toBe(true);
  });
});

describe('sans programme à jours prévus : rien ne s’affiche', () => {
  test('routines sans jour', () => {
    const routines = [PUSH, JAMBES, PULL].map((r) => Object.assign({}, r, { jours: null }));
    expect(D.semaineQuiDeraille(entree({ jour: '2026-10-14', routines }))).toBeNull();
    expect(D.semaineQuiDeraille(entree({ jour: '2026-10-14', routines: [] }))).toBeNull();
  });
});

describe('la durée habituelle', () => {
  test('une durée qui ne laisse pas la place : rien n’est ajouté à Pull', () => {
    const e = entree({ jour: '2026-10-14', dureeMax_s: 20 * 60, seances: [fait('2026-10-12', 'r-push', ['couche'])] });
    const c = D.semaineQuiDeraille(e);
    expect(c.choix.map((x) => x.cle)).not.toContain('repartir');
  });
});

describe('ce qui a été fait cette semaine : `faits.semaineDuProgramme`', () => {
  require('../../v2/js/seance.js');
  require('../../v2/js/bilan.js');
  require('../../v2/js/periode.js');
  const F = require('../../v2/js/faits.js').creer();
  const catalogue = Object.keys(CAT).map((slug) => Object.assign({ slug }, CAT[slug]));
  const seances = [
    { id: 's1', debut: new Date(2026, 9, 12, 18).toISOString(), routine_id: 'r-push' },
    { id: 's2', debut: new Date(2026, 9, 9, 18).toISOString(), routine_id: null },      // la semaine d'avant
    { id: 's3', debut: new Date(2026, 8, 20, 18).toISOString(), routine_id: null }      // plus de 14 jours
  ];
  const series = { s1: [{ exercise_slug: 'couche', type_serie: 'travail' }, { exercise_slug: 'couche', type_serie: 'echauffement' }],
    s2: [{ exercise_slug: 'squat', type_serie: 'travail' }], s3: [{ exercise_slug: 'squat', type_serie: 'travail' }] };
  const c = { seances, series: [].concat(series.s1, series.s2, series.s3), exercices: catalogue,
    seriesDe: (id) => series[id] || [], catalogue: () => CAT, journal: [] };
  test('les séances des 14 derniers jours (jour, routine, exercices de travail) ; le volume de la SEMAINE seulement', () => {
    const r = F.semaineDuProgramme(c, '2026-10-14', null);
    expect(r.seances).toEqual([{ jour: '2026-10-12', routine_id: 'r-push', slugs: ['couche'] },
      { jour: '2026-10-09', routine_id: null, slugs: ['squat'] }]);
    expect(r.volume).toEqual({ pectoraux: 1, triceps: 0.5, deltoide_anterieur: 0.5 });
  });
});

describe('les jours d’une routine s’écrivent à la création, et seulement là', () => {
  const R = require('../../v2/js/routines.js');
  const ecrivain = () => {
    const j = { creees: [], majs: [] };
    return { j, creerRoutine: async (l) => { j.creees.push(l); return Object.assign({ id: 'n1' }, l); },
      majRoutine: async (id, l) => { j.majs.push(l); return Object.assign({ id }, l); },
      insererExercices: async () => [], majExercice: async () => {}, supprimerExercices: async () => {},
      insererSeries: async () => [], supprimerSeries: async () => {}, remplacerSeries: async () => {} };
  };
  test('création avec `jours` : la colonne part ; un renommage ne l’écrit pas (le jour reste attaché à la routine)', async () => {
    const e = ecrivain();
    await R.enregistrer({ id: null, nom: 'Lundi — Push', jours: [1], exercices: [], existantes: [] }, e, { userId: 'u' });
    expect(e.j.creees[0].jours).toEqual([1]);
    const e2 = ecrivain();
    await R.enregistrer({ id: 'r1', nom: 'Push lourd', nomChange: true, exercices: [], existantes: [] }, e2, { userId: 'u' });
    expect(e2.j.majs[0]).toEqual({ nom: 'Push lourd' });
    const e3 = ecrivain();
    await R.enregistrer({ id: null, nom: 'Haut A', exercices: [], existantes: [] }, e3, { userId: 'u' });
    expect('jours' in e3.j.creees[0]).toBe(false);
  });
});

describe('un exercice ajouté pour la semaine n’est jamais proposé à la routine (question de fin)', () => {
  const S = require('../../v2/js/seance.js');
  test('`ecartsRoutine` ignore l’exercice qui porte `ajout`', () => {
    const routine = { id: 'r-pull', exercices: [{ id: 'e1', exercise_slug: 'tractions', rang: 0, series: [{ type_serie: 'travail', reps: 8 }] }] };
    const seance = { routine_id: 'r-pull', exercices: [
      { exercise_slug: 'tractions', routine_exercise_id: 'e1', series: [{ type_serie: 'travail', reps: 8 }] },
      { exercise_slug: 'legcurl', routine_exercise_id: null, ajout: 'séance manquée de mardi', series: [{ type_serie: 'travail' }] }] };
    expect(S.ecartsRoutine(seance, routine).ecarts.filter((x) => x.type === 'ajoute')).toEqual([]);
    const sans = { routine_id: 'r-pull', exercices: [seance.exercices[0], Object.assign({}, seance.exercices[1], { ajout: null })] };
    expect(S.ecartsRoutine(sans, routine).ecarts.filter((x) => x.type === 'ajoute').length).toBe(1);
  });
});

describe('règle corrigée du 15/10/2026 — le programme « Sèche » : Bas A manqué mardi, Bas B vendredi (même groupe)', () => {
  // Reproduit le cas réel d'aurel_br : Bas B reçoit Presse 3 + Extension Jambes 3 + Mollets 1, sous 90 min ; pas de
  // squat ajouté, le squat avec pause y est déjà (même `mouvement`). Les quadriceps restent sous 10 séries (3 + 3 + 3).
  const C2 = {
    squat: { nom: 'Squat (Barre)', mouvement: 'squat', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['adducteurs'], muscles_stabilisateurs: ['bas_du_dos'] },
    squat_pause: { nom: 'Squat avec Pause (Barre)', mouvement: 'squat', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: ['adducteurs'], muscles_stabilisateurs: ['bas_du_dos'] },
    presse: { nom: 'Presse à Cuisses', mouvement: 'presse', muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] },
    extension: { nom: 'Extension Jambes', mouvement: 'extension_jambes', muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [] },
    mollets: { nom: 'Mollets Debout', mouvement: 'mollets', muscles_primaires: ['mollets'], muscles_secondaires: [], muscles_stabilisateurs: [] },
    roumain: { nom: 'Soulevé de Terre Roumain (Barre)', mouvement: 'roumain', muscles_primaires: ['ischio_jambiers', 'fessiers'], muscles_secondaires: [], muscles_stabilisateurs: ['bas_du_dos'] },
    legcurl: { nom: 'Leg Curl Assis', mouvement: 'leg_curl', muscles_primaires: ['ischio_jambiers'], muscles_secondaires: [], muscles_stabilisateurs: [] },
    hip: { nom: 'Hip Thrust (Barre)', mouvement: 'hip_thrust', muscles_primaires: ['fessiers'], muscles_secondaires: ['ischio_jambiers'], muscles_stabilisateurs: [] },
    couche: { nom: 'Développé Couché', mouvement: 'couche', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] },
    tractions: { nom: 'Tractions', mouvement: 'tractions', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'], muscles_stabilisateurs: [] },
    ohp: { nom: 'Développé Militaire', mouvement: 'ohp', muscles_primaires: ['deltoide_anterieur'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: ['abdominaux'] },
    elev: { nom: 'Élévations Latérales', mouvement: 'elevations', muscles_primaires: ['deltoide_lateral'], muscles_secondaires: [], muscles_stabilisateurs: [] },
    rowing: { nom: 'Rowing', mouvement: 'rowing', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'], muscles_stabilisateurs: ['bas_du_dos'] }
  };
  const e2 = (slug, n, ch, repos) => ({ exercise_slug: slug, repos_cible_s: repos,
    series: Array.from({ length: ch }, () => ({ type_serie: 'echauffement' })).concat(Array.from({ length: n }, () => ({ type_serie: 'travail' }))) });
  const SECHE = [
    { id: 'haut-a', nom: 'Lundi — Haut A', jours: [1], exercices: [e2('couche', 4, 2, 150), e2('rowing', 4, 1, 120)] },
    { id: 'bas-a', nom: 'Mardi — Bas A', jours: [2], exercices: [e2('squat', 4, 3, 180), e2('presse', 3, 0, 120), e2('extension', 3, 0, 90), e2('mollets', 3, 0, 180)] },
    { id: 'haut-b', nom: 'Jeudi — Haut B', jours: [4], exercices: [e2('couche', 4, 2, 180), e2('tractions', 4, 1, 150), e2('ohp', 4, 1, 150), e2('rowing', 4, 1, 150), e2('elev', 3, 0, 180)] },
    { id: 'bas-b', nom: 'Vendredi — Bas B', jours: [5], exercices: [e2('squat_pause', 3, 3, 240), e2('roumain', 4, 1, 180), e2('legcurl', 3, 0, 90), e2('hip', 4, 1, 150)] }
  ];
  const c = D.semaineQuiDeraille({ jour: '2026-10-14', catalogue: C2, debutant: false, dureeMax_s: 90 * 60, volume: {}, etat: null,
    routines: SECHE, seances: [{ jour: '2026-10-12', routine_id: 'haut-a', slugs: ['couche', 'rowing'] }] });
  const rep = c.choix.filter((x) => x.cle === 'repartir')[0];
  test('Bas B reçoit Presse 3 + Extension Jambes 3 + Mollets 1, et pas de squat (le squat avec pause y est déjà)', () => {
    expect(rep.ajouts.map((a) => [a.nomRoutine, a.slug, a.series])).toEqual([['Bas B', 'presse', 3], ['Bas B', 'extension', 3], ['Bas B', 'mollets', 1]]);
    expect(rep.ajouts[2].exercice.series.length).toBe(1);
  });
  test('la séance tient sous 90 min, et les quadriceps restent sous 10 séries', () => {
    const M = require('../../v2/js/moteur.js');
    const tr = (e, k) => Object.assign({}, e, { series: e.series.filter((s) => s.type_serie === 'travail').slice(0, k) });
    const bas = SECHE[3].exercices.concat(rep.ajouts.map((a) => a.exercice));
    expect(M.dureeEstimee(M.structureDeRoutine(bas, C2))).toBeLessThanOrEqual(90 * 60);
    const quad = bas.reduce((t, e) => t + (C2[e.exercise_slug].muscles_primaires.indexOf('quadriceps') >= 0 ? e.series.filter((s) => s.type_serie === 'travail').length : 0), 0);
    expect(quad).toBeLessThan(10);
    expect(tr).toBeDefined();
  });
  test('⚠️ DISCRIMINANT — un squat qui tiendrait (volume et durée) n’est pas ajouté : le squat avec pause est son frère', () => {
    const court = [SECHE[0],
      { id: 'bas-a', nom: 'Mardi — Bas A', jours: [2], exercices: [e2('squat', 3, 0, 120), e2('presse', 3, 0, 120)] },
      SECHE[2],
      { id: 'bas-b', nom: 'Vendredi — Bas B', jours: [5], exercices: [e2('squat_pause', 3, 0, 120), e2('legcurl', 3, 0, 90)] }];
    const c2 = D.semaineQuiDeraille({ jour: '2026-10-14', catalogue: C2, debutant: false, dureeMax_s: null, volume: {}, etat: null,
      routines: court, seances: [{ jour: '2026-10-12', routine_id: 'haut-a', slugs: ['couche'] }] });
    const r2 = c2.choix.filter((x) => x.cle === 'repartir')[0];
    expect(r2.ajouts.map((a) => [a.nomRoutine, a.slug, a.series])).toEqual([['Bas B', 'presse', 3]]);
  });
  test('rien ne va dans Haut B (jeudi, la veille de Bas B : les mollets n’y tiennent pas dans la durée)', () => {
    expect(rep.ajouts.some((a) => a.routine === 'haut-b')).toBe(false);
  });
});

describe('le choix en base (`semaine_choix`, v2_085) : écrit puis relu', () => {
  const e = entree({ jour: '2026-10-15', seances: [fait('2026-10-12', 'r-push', ['couche'])] });
  const c = D.semaineQuiDeraille(e);   // deux séances manquées : Jambes mardi (la question), Pull mercredi
  test('une ligne par séance manquée, le lundi de la semaine ; le détail sur la séance de la question', () => {
    expect(c.choix[0].cle).toBe('decaler');
    const l = D.lignesDuChoix(c, 'decaler', '2026-10-15', 'u', '2026-10-15T08:00:00.000Z');
    expect(l.map((x) => [x.semaine, x.routine_id, x.choix, x.detail.jour])).toEqual([['2026-10-12', 'r-jambes', 'decaler', 2], ['2026-10-12', 'r-pull', 'decaler', 3]]);
    expect(Array.isArray(l[0].detail.planning)).toBe(true);
    expect(l[1].detail.planning).toBeUndefined();
    expect(D.etatDepuisLignes(l, '2026-10-15').planning).toEqual(c.choix[0].planning);
  });
  test('relu : la question n’est plus posée ; une autre semaine ne lit rien', () => {
    const l = D.lignesDuChoix(c, 'garder', '2026-10-15', 'u', '2026-10-15T08:00:00.000Z');
    const etat = D.etatDepuisLignes(l, '2026-10-15');
    expect(D.semaineQuiDeraille(Object.assign({}, e, { etat }))).toBeNull();
    expect(D.etatDepuisLignes(l, '2026-10-20')).toBeNull();
  });
});

describe('audit du 16/10/2026, 01 #2 et #4 — répartir compte ce qui est déjà ajouté ; un seul plafond par séance', () => {
  // L'exemple de l'audit : Jambes (Presse 5, Hack 5, Extension 5, toutes en quadriceps principaux) manquée mardi ;
  // on ouvre mercredi, la séance Pull, sans durée déclarée. Avant : les trois passaient dans le Pull (15 séries de
  // quadriceps), la séance d'accueil étant lue sans ses ajouts.
  const C3 = Object.assign({}, CAT, {
    presse: { nom: 'Presse à Cuisses', muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [] },
    hack: { nom: 'Hack Squat', muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [] },
    extension: { nom: 'Extension Jambes', muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [] }
  });
  const tr = (slug, n) => ({ exercise_slug: slug, repos_cible_s: 120, series: Array.from({ length: n }, () => ({ type_serie: 'travail', reps: 8 })) });
  const routines = [
    { id: 'r-push', nom: 'Lundi — Push', jours: [1, 5], exercices: [tr('couche', 4)] },
    { id: 'r-jambes', nom: 'Mardi — Jambes', jours: [2], exercices: [tr('presse', 5), tr('hack', 5), tr('extension', 5)] },
    { id: 'r-pull', nom: 'Mercredi — Pull', jours: [3], exercices: [tr('tractions', 4), tr('rowing', 4), tr('curl', 3)] }];
  const carte = () => D.semaineQuiDeraille({ jour: '2026-10-14', catalogue: C3, debutant: false, dureeMax_s: null, volume: {},
    etat: null, routines, seances: [fait('2026-10-12', 'r-push', ['couche'])] });
  const quadsDansLePull = (c) => c.choix.filter((x) => x.cle === 'repartir')[0].ajouts
    .filter((a) => a.routine === 'r-pull').reduce((t, a) => t + a.series, 0);
  test('⚠️ DISCRIMINANT — le Pull reçoit Presse 5, puis Hack et Extension sous la règle du même groupe : 11, pas 15', () => {
    const rep = carte().choix.filter((x) => x.cle === 'repartir')[0];
    expect(rep.ajouts.map((a) => [a.nomRoutine, a.slug, a.series])).toEqual([['Pull', 'presse', 5], ['Pull', 'hack', 5], ['Pull', 'extension', 1]]);
    expect(quadsDansLePull(carte())).toBe(G.PAR_SEANCE);
  });
  test('le plafond est la constante du générateur, lue à l’appel (aucune copie dans deraille.js)', () => {
    expect(G.PAR_SEANCE).toBe(11);
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../v2/js/deraille.js'), 'utf8');
    expect(/SOUS_SERIES|var PAR_SEANCE/.test(src)).toBe(false);
    const avant = G.PAR_SEANCE;
    try { G.PAR_SEANCE = 9; expect(quadsDansLePull(carte())).toBe(9); } finally { G.PAR_SEANCE = avant; }
  });
});

// 178 — « Répartir » : ce que l'appareil a et que ni le serveur ni la file ne portent repart dans la file.
describe('choixAReposer (178)', () => {
  const L = (semaine, routine, extra) => Object.assign({ user_id: 'u1', semaine, routine_id: routine, choix: 'repartir', cree_le: '2026-10-28T10:00:00Z' }, extra || {});
  const DEPUIS = '2026-10-19';
  test('une ligne locale absente du serveur et de la file repart', () => {
    expect(D.choixAReposer([L('2026-10-26', 'r1')], [], {}, DEPUIS, 'u1').map((l) => l.routine_id)).toEqual(['r1']);
  });
  test('déjà chez le serveur, ou déjà dans la file : rien', () => {
    expect(D.choixAReposer([L('2026-10-26', 'r1')], [L('2026-10-26', 'r1')], {}, DEPUIS, 'u1')).toEqual([]);
    expect(D.choixAReposer([L('2026-10-26', 'r1')], [], { '2026-10-26|r1': true }, DEPUIS, 'u1')).toEqual([]);
  });
  test('hors de la fenêtre lue, ou d’un autre compte : rien', () => {
    expect(D.choixAReposer([L('2026-10-05', 'r1')], [], {}, DEPUIS, 'u1')).toEqual([]);
    expect(D.choixAReposer([L('2026-10-26', 'r1', { user_id: 'u2' })], [], {}, DEPUIS, 'u1')).toEqual([]);
  });
});
