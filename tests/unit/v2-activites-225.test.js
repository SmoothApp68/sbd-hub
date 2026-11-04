/** @jest-environment node */
//
// 225 (MOTEUR §9.39) — LES ACTIVITÉS NOTÉES et LA VEILLE DES JAMBES LOURDES : la séance courte (`Seance.activite`), l'étiquette
// (`Semaine.estActivite`, `resumerSeance`), le volume (jamais), le fait (`faits.activiteDeLaVeille`), la décision (`planDeSeance`,
// `Moteur.veilleActivite`) et ses invariants I115, I116.
process.env.TZ = 'Europe/Paris';
global.self = global;
const M0 = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Sem = require('../../v2/js/semaine.js');
const G = require('../../v2/js/generateur.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/parcours.js');
const Faits = require('../../v2/js/faits.js');

const fiche = (equipement, mesure, prim, extra) => Object.assign({ equipement, mesure, muscles_primaires: prim, muscles_secondaires: [], muscles_stabilisateurs: [] }, extra || {});
const CAT = {
  football: fiche('aucun', 'temps', [], { slug: 'football', nom: 'Football', nature: 'cardio', hors_salle: true }),
  course: fiche('aucun', 'distance_temps', [], { slug: 'course', nom: 'Course à pied', nature: 'cardio', hors_salle: true }),
  velo: fiche('aucun', 'distance_temps', [], { slug: 'velo', nom: 'Vélo', nature: 'cardio', hors_salle: true }),
  squat_barre: fiche('barre', 'charge_reps', ['quadriceps', 'fessiers'], { slug: 'squat_barre', nom: 'Squat (Barre)', nature: 'force' }),
  developpe_couche_barre: fiche('barre', 'charge_reps', ['pectoraux'], { slug: 'developpe_couche_barre', nom: 'Développé couché (Barre)', nature: 'force' })
};
let k = 0; const idSerie = () => 'a-' + (++k);
const FIN = new Date('2026-11-04T19:00:00Z');   // mercredi 4 novembre, 20 h à Paris
const activite = (o) => S.activite(Object.assign({ id: 'A', userId: 'u', slug: 'football', titre: 'Football', minutes: 60, intensite: 'intense', fin: FIN, idSerie }, o || {}));
const seriesDe = (a) => [].concat.apply([], a.exercices.map((e) => e.series.map((s) => Object.assign({ exercise_slug: e.exercise_slug, session_id: a.id }, s))));

describe('225 — Seance.activite : une séance courte, une série validée', () => {
  test('football, 60 min, intense : durée en secondes, RPE 9, validée à la fin, séance terminée', () => {
    const a = activite();
    expect(a.statut).toBe('terminee');
    expect(a.titre).toBe('Football');
    expect(new Date(a.fin) - new Date(a.debut)).toBe(3600000);
    expect(a.exercices.length).toBe(1);
    const s = a.exercices[0].series[0];
    expect(s.duree_s).toBe(3600);
    expect(s.rpe).toBe(9);
    expect(s.type_serie).toBe('travail');
    expect(s.validee_a).toBe(FIN.toISOString());
    expect(s.charge_kg).toBeNull();
    expect(s.reps).toBeNull();
  });
  test('les trois intensités sont les RPE du moteur : légère 3, moyenne 6, intense 9', () => {
    expect(M.ACTIVITE_RPE).toEqual({ legere: 3, moyenne: 6, intense: 9 });
    ['legere', 'moyenne', 'intense'].forEach((i) => expect(activite({ intensite: i }).exercices[0].series[0].rpe).toBe(M.ACTIVITE_RPE[i]));
  });
  test('la distance facultative est en km, rangée en mètres ; vide, elle reste vide', () => {
    expect(activite({ slug: 'course', km: 8.2 }).exercices[0].series[0].distance_m).toBe(8200);
    expect(activite({ slug: 'course', km: null }).exercices[0].series[0].distance_m).toBeNull();
  });
  test('sans durée entière en minutes, rien n’est inventé', () => {
    [0, -5, 1.5, 'x', null, 2000].forEach((m) => expect(activite({ minutes: m })).toBeNull());
    expect(activite({ slug: null })).toBeNull();
  });
  test('le RPE ne sort jamais de 1 à 10', () => {
    expect(activite({ intensite: 'intense', rpe: 11 }).exercices[0].series[0].rpe).toBeNull();
  });
});

describe('225 — l’étiquette, jamais le volume', () => {
  const index = M0.indexerExercices ? M0.indexerExercices(Object.keys(CAT).map((s) => CAT[s])) : CAT;
  test('Semaine.estActivite : un sport seul oui ; une série de squat avec, non ; rien, non', () => {
    const a = seriesDe(activite());
    expect(Sem.estActivite(a, index)).toBe(true);
    const mix = a.concat([{ exercise_slug: 'squat_barre', type_serie: 'travail', reps: 5, charge_kg: 100, validee_a: 'x' }]);
    expect(Sem.estActivite(mix, index)).toBe(false);
    expect(Sem.estActivite([], index)).toBe(false);
    expect(Sem.estActivite(a, {})).toBe(false);
  });
  test('une activité ne porte aucun volume : ni série de travail, ni muscle', () => {
    const a = seriesDe(activite());
    expect(Sem.porteDuVolume(CAT.football)).toBe(false);
    expect(Sem.compteSeriesTravail(a, Object.keys(CAT).map((s) => CAT[s]))).toBe(0);
  });
  test('resumerSeance : « Activité intense · 1 h » dans l’historique', () => {
    const a = activite();
    const r = M0.resumerSeance({ id: 'A', titre: 'Football', debut: a.debut }, seriesDe(a), Object.keys(CAT).map((s) => CAT[s]), null, {}, null);
    expect(r.activite).toEqual({ intensite: 'intense' });
    expect(r.estSortie).toBe(true);
    expect(r.nbSeriesTravail).toBe(0);
  });
  test('une séance de musculation n’a pas d’étiquette d’activité', () => {
    const series = [{ exercise_slug: 'squat_barre', type_serie: 'travail', reps: 5, charge_kg: 100, validee_a: 'x', session_id: 'B' }];
    const r = M0.resumerSeance({ id: 'B', titre: 'Jambes', debut: FIN.toISOString() }, series, Object.keys(CAT).map((s) => CAT[s]), null, {}, null);
    expect(r.activite).toBeNull();
  });
});

describe('225 — Moteur.intensiteDActivite et la table des sports qui chargent les jambes', () => {
  test('le plus haut RPE décide : 8 et plus intense, 5 à 7 moyenne, moins légère, sans RPE rien', () => {
    expect(M.intensiteDActivite([{ rpe: 9 }])).toBe('intense');
    expect(M.intensiteDActivite([{ rpe: 8 }])).toBe('intense');
    expect(M.intensiteDActivite([{ rpe: 6 }, { rpe: 3 }])).toBe('moyenne');
    expect(M.intensiteDActivite([{ rpe: 3 }])).toBe('legere');
    expect(M.intensiteDActivite([{ rpe: null }, {}])).toBeNull();
    expect(M.intensiteDActivite([])).toBeNull();
  });
  test('la table : la course est sourcée (Wilson 2012), les sports d’impact sont un jugement de coachs, le vélo n’y est pas', () => {
    expect(M.activiteChargeLesJambes('course')).toBe('wilson');
    expect(M.activiteChargeLesJambes('football')).toBe('coachs');
    ['velo', 'natation', 'escalade', 'boxe', 'randonnee', 'marche'].forEach((s) => expect(M.activiteChargeLesJambes(s)).toBeNull());
    expect(M.activiteChargeLesJambes('constructor')).toBeNull();
  });
});

describe('225 — faits.activiteDeLaVeille : un fait lu dans les séances', () => {
  const corpus = (seances, series) => ({ seances, seriesDe: (id) => series[id] || [], catalogue: () => CAT });
  const trav = (slug, extra) => Object.assign({ exercise_slug: slug, type_serie: 'travail', validee_a: '2026-11-03T20:00:00Z', duree_s: 3600 }, extra);
  const J = '2026-11-04T09:00:00Z';
  const f = (seances, series) => Faits.creer().activiteDeLaVeille(corpus(seances, series), J);

  test('football intense hier : la veille est trouvée, avec son nom', () => {
    const r = f([{ id: 'a', debut: '2026-11-03T18:00:00Z' }], { a: [trav('football', { rpe: 9 })] });
    expect(r).toEqual({ seanceId: 'a', slug: 'football', nom: 'Football', jour: '2026-11-03' });
  });
  test('moyenne ou légère : rien ; avant-hier : rien ; aujourd’hui : rien', () => {
    expect(f([{ id: 'a', debut: '2026-11-03T18:00:00Z' }], { a: [trav('football', { rpe: 6 })] })).toBeNull();
    expect(f([{ id: 'a', debut: '2026-11-02T18:00:00Z' }], { a: [trav('football', { rpe: 9 })] })).toBeNull();
    expect(f([{ id: 'a', debut: '2026-11-04T07:00:00Z' }], { a: [trav('football', { rpe: 9 })] })).toBeNull();
  });
  test('un sport qui ne charge pas les jambes (vélo intense) : rien', () => {
    expect(f([{ id: 'a', debut: '2026-11-03T18:00:00Z' }], { a: [trav('velo', { rpe: 9 })] })).toBeNull();
  });
  test('une séance de musculation hier, même intense : rien (ce n’est pas une activité)', () => {
    expect(f([{ id: 'a', debut: '2026-11-03T18:00:00Z' }], { a: [trav('squat_barre', { rpe: 9, reps: 5, charge_kg: 100, duree_s: null })] })).toBeNull();
  });
  test('une séance en cours n’en est pas une', () => {
    expect(f([{ id: 'a', debut: '2026-11-03T18:00:00Z', statut: 'en_cours' }], { a: [trav('football', { rpe: 9 })] })).toBeNull();
  });
});

describe('225 — la veille dans planDeSeance (I115, I116)', () => {
  function seanceDe(slugs) {
    let n = 0; const id = () => 'f-' + (++n);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    slugs.forEach((s) => { se = S.ajouterExercice(se, s, id, { series: 3 }); });
    return se;
  }
  const consigne = (zone) => ({ consigne: { zone: { cle: zone } } });
  const entrees = (se, extra) => Object.assign({
    seance: { id: 'S', debut: '2026-11-04T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { squat_barre: consigne('lourd') }, reglage: 'normal', paris: [], objectif: 'force', catalogue: CAT,
    activiteVeille: { seanceId: 'a', slug: 'football', nom: 'Football', jour: '2026-11-03' }, veilleChoix: null, menagerProfil: []
  }, extra || {});
  const erreurs = (p, e) => T.verifierPlan(p, e).erreurs.filter((x) => /I11[56]/.test(x));
  const se = seanceDe(['squat_barre', 'developpe_couche_barre']);

  test('le lendemain d’un football intense, le squat en Lourd propose UNE fois Mix ou Garder le plan', () => {
    const p = T.planDeSeance(entrees(se));
    expect(p.veilleActivite.slug).toBe('squat_barre');
    expect(p.veilleActivite.boutons).toEqual({ mix: 'Squat (Barre) en Mix aujourd’hui', garder: 'Garder le plan' });
    expect(p.veilleActivite.phrase).toBe('Hier : football, intense. Squat (Barre) est prévu en Lourd.');
    expect(p.veilleActivite.pourquoi).toMatch(/convention de coachs, pas une règle prouvée/);
    expect(erreurs(p, entrees(se))).toEqual([]);
  });
  test('la course cite Wilson 2012 en plus ; le football ne cite que la convention', () => {
    const c = T.planDeSeance(entrees(se, { activiteVeille: { slug: 'course', nom: 'Course à pied' } }));
    expect(c.veilleActivite.pourquoi).toMatch(/Wilson 2012/);
    expect(T.planDeSeance(entrees(se)).veilleActivite.pourquoi).not.toMatch(/Wilson/);
  });
  test('« Garder le plan » est respecté : la réponse fait taire la carte, et la zone ne bouge pas', () => {
    ['garder', 'mix'].forEach((c) => expect(T.planDeSeance(entrees(se, { veilleChoix: c })).veilleActivite).toBeNull());
    expect(erreurs(T.planDeSeance(entrees(se)), entrees(se, { veilleChoix: 'garder' })).join('|')).toMatch(/I116 — la proposition revient/);
  });
  test('rien sans activité notée (une habitude déclarée n’est pas un fait)', () => {
    [null, undefined, {}].forEach((a) => expect(T.planDeSeance(entrees(se, { activiteVeille: a })).veilleActivite).toBeNull());
    const p = T.planDeSeance(entrees(se));
    expect(erreurs(p, entrees(se, { activiteVeille: null })).join('|')).toMatch(/I116 — une proposition de veille sans activité notée/);
  });
  test('rien si la barre n’est pas en Lourd (Mix, ou déjà passée en Mix aujourd’hui)', () => {
    expect(T.planDeSeance(entrees(se, { consignes: { squat_barre: consigne('mix') } })).veilleActivite).toBeNull();
    expect(T.planDeSeance(entrees(se, { consignes: {} })).veilleActivite).toBeNull();
  });
  test('rien sans barre de jambes : un haut du corps le lendemain du football', () => {
    expect(T.planDeSeance(entrees(seanceDe(['developpe_couche_barre']), { consignes: { developpe_couche_barre: consigne('lourd') } })).veilleActivite).toBeNull();
  });
  test('rien en Édition, rien en « Juste un carnet »', () => {
    const ed = entrees(se); ed.seance.edition = true;
    expect(T.planDeSeance(ed).veilleActivite).toBeNull();
    expect(T.planDeSeance(entrees(se, { intention: 'entretien' })).veilleActivite).toBeNull();
  });
  test('I115 : un sport qui ne charge pas les jambes est refusé', () => {
    const p = T.planDeSeance(entrees(se));
    expect(erreurs(p, entrees(se, { activiteVeille: { slug: 'velo' } })).join('|')).toMatch(/I115 — un sport qui ne charge pas les jambes/);
  });
  test('I115 : l’exercice proposé doit être la première barre de jambes en Lourd', () => {
    const p = T.planDeSeance(entrees(se));
    p.veilleActivite = Object.assign({}, p.veilleActivite, { slug: 'developpe_couche_barre' });
    expect(erreurs(p, entrees(se)).join('|')).toMatch(/I115 — l’exercice proposé/);
  });
  test('I115 : la convention doit être dite comme telle, les gestes ceux du moteur', () => {
    const p = T.planDeSeance(entrees(se));
    p.veilleActivite = Object.assign({}, p.veilleActivite, { pourquoi: 'C’est prouvé.' });
    expect(erreurs(p, entrees(se)).join('|')).toMatch(/I115 — la convention/);
    const q = T.planDeSeance(entrees(se));
    q.veilleActivite = Object.assign({}, q.veilleActivite, { boutons: { mix: 'Mix', garder: 'Non' } });
    expect(erreurs(q, entrees(se)).join('|')).toMatch(/I115 — les deux gestes/);
  });
  test('le plan ne modifie jamais les entrées ni la séance (render pur)', () => {
    const e = entrees(se), avant = JSON.stringify(e);
    T.planDeSeance(e);
    expect(JSON.stringify(e)).toBe(avant);
  });
  test('« Mix aujourd’hui » : la zone de CET exercice pour la séance, la routine n’est pas touchée', () => {
    const apres = S.poserZoneDePlan(se, 0, 'mix');
    expect(apres.exercices[0].zone_plan).toBe('mix');
    expect(apres.exercices[1].zone_plan).toBeUndefined();
    expect(se.exercices[0].zone_plan).toBeUndefined();
  });
});
