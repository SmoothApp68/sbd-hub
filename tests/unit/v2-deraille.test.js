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
