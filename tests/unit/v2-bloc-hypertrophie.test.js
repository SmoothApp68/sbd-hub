// 221 — LE BLOC HYPERTROPHIE (MOTEUR §19.2, amendement 221 ; I37 réécrit ; I114).
process.env.TZ = 'Europe/Paris';
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
require('../../v2/js/seance.js');
require('../../v2/js/routines.js');
require('../../v2/js/generateur.js');
const Plan = require('../../v2/js/plan.js');

const SQUAT = 'squat_barre', COUCHE = 'developpe_couche_barre', SOULEVE = 'souleve_de_terre_barre';
const bloc = (o) => Object.assign({ id: 'b1', dossier: 'Haut', zone: 'hypertrophie', debut: '2026-11-02', semaines: 4, decharge: true,
  exercices: [SQUAT, COUCHE, SOULEVE, 'curl_biceps'], statut: 'en_cours', grosse_serie: false }, o || {});
const FAM = { [SQUAT]: SQUAT, [COUCHE]: COUCHE, [SOULEVE]: SOULEVE, curl_biceps: null };

describe('221 — les zones proposées suivent l’objectif', () => {
  test.each([['force', ['lourd', 'mix']], ['forme', ['lourd', 'mix']], ['calisthenie', ['lourd', 'mix']], [null, ['lourd', 'mix']],
    ['muscle', ['lourd', 'mix', 'hypertrophie']], ['les_deux', ['lourd', 'mix', 'hypertrophie']]])('%s', (o, zones) => {
    expect(M.zonesDeBloc(o)).toEqual(zones);
  });
  test('la zone du premier bloc ne change pas', () => {
    expect(M.zoneDuPremierBloc('force')).toBe('lourd');
    expect(M.zoneDuPremierBloc('muscle')).toBe('mix');
  });
});

describe('221 — la structure d’un bloc Hypertrophie', () => {
  test('une barre en Les deux : grosse série Lourd (garde 1), puis la zone du bloc', () => {
    const s = M.structureDeBloc(bloc({ grosse_serie: true }), SQUAT);
    expect(s).toEqual({ zone: 'hypertrophie', grosse: true, zoneGrosse: 'lourd', garde: 1 });
    expect(M.structureDeBloc(bloc({ grosse_serie: true }), COUCHE).grosse).toBe(true);
  });
  test('sans la case : pas de grosse série', () => {
    expect(M.structureDeBloc(bloc(), SQUAT)).toEqual({ zone: 'hypertrophie', grosse: false, zoneGrosse: null, garde: null });
  });
  test('défaut : activé en Les deux, désactivé en Muscle', () => {
    expect(M.grosseSerieParDefaut('les_deux')).toBe(true);
    expect(M.grosseSerieParDefaut('muscle')).toBe(false);
  });
  test('le soulevé reste en Mix, jamais de grosse série', () => {
    expect(M.structureDeBloc(bloc({ grosse_serie: true }), SOULEVE)).toEqual({ zone: 'mix', grosse: false, zoneGrosse: null, garde: null });
  });
  test('un accessoire ne reçoit rien', () => {
    expect(M.structureDeBloc(bloc(), null).zone).toBeNull();
  });
  test('un bloc Lourd ou Mix : la zone du bloc', () => {
    expect(M.structureDeBloc(bloc({ zone: 'mix' }), SOULEVE).zone).toBe('mix');
    expect(M.structureDeBloc(bloc({ zone: 'lourd' }), SQUAT).zone).toBe('lourd');
  });
  test('les lignes posées : soulevé en Mix, barres en Hypertrophie, accessoire sans ligne', () => {
    const l = M.zonesPosees(bloc(), () => 'x', 'u', FAM);
    expect(l.map((x) => [x.exercise_slug, x.zone])).toEqual([[SQUAT, 'hypertrophie'], [COUCHE, 'hypertrophie'], [SOULEVE, 'mix']]);
  });
});

describe('221 — après un bloc Hypertrophie', () => {
  test('la carte propose Lourd d’abord, jamais Hypertrophie', () => {
    expect(M.blocSuivant(bloc()).zone).toBe('lourd');
    expect(M.blocSuivant(bloc({ zone: 'mix' })).zone).toBe('lourd');
    expect(M.blocSuivant(bloc({ zone: 'lourd' })).zone).toBe('mix');
    const c = M.carteFinDeBloc(bloc({ grosse_serie: true }), { exercices: {}, paris: 0, tenus: 0 }, {}, null);
    expect(c.commencer).toBe('Commencer le bloc Lourd');
    expect(c.pourquoi).toBe(M.phraseBlocHypertrophie(true));
    expect(c.pourquoi).toContain('Hypertrophie (8-10)');
    expect(c.pourquoi).toContain('ta première série reste lourde pour garder ta force');
    expect(c.sources.map((s) => s.type)).toEqual(['etude', 'coachs', 'coachs', 'etude']);
  });
  test('la carte ne compare pas les paris tenus d’un bloc à l’autre', () => {
    const c = M.carteFinDeBloc(bloc(), { exercices: {}, paris: 4, tenus: 3 }, {}, null);
    expect(c.paris).toMatch(/4 paris/);
    expect(JSON.stringify(c)).not.toMatch(/précédent|que le bloc/);
  });
});

describe('221 — Mix → Hypertrophie en cours de bloc', () => {
  test('la semaine, la décharge et le début restent', () => {
    const b = bloc({ zone: 'mix' });
    const a = M.ajusterBlocEnCours(b, 'hypertrophie', true, 'les_deux', '2026-11-10T10:00:00Z');
    expect(a.zone).toBe('hypertrophie');
    expect(a.grosse_serie).toBe(true);
    ['id', 'debut', 'semaines', 'decharge', 'exercices', 'statut'].forEach((k) => expect(a[k]).toEqual(b[k]));
    expect(M.semaineDuBloc(a, '2026-11-10')).toBe(M.semaineDuBloc(b, '2026-11-10'));
    expect(M.dechargePlanifiee(a, [])).toBe(true);
  });
  test('refusé en objectif force', () => {
    expect(M.ajusterBlocEnCours(bloc({ zone: 'mix' }), 'hypertrophie', false, 'force', 't')).toBeNull();
  });
  test('la grosse série ne reste pas hors Hypertrophie', () => {
    expect(M.ajusterBlocEnCours(bloc({ zone: 'hypertrophie', grosse_serie: true }), 'mix', true, 'les_deux', 't').grosse_serie).toBe(false);
  });
});

describe('221 — I37 et I114', () => {
  const verif = (programme) => { const r = Plan.verifierPlan({ exercices: [], lignes: [] }, { programme }); return (Array.isArray(r) ? r : (r && r.erreurs) || []).filter((x) => /I3[67]|I114/.test(x)); };
  test('I37 : Hypertrophie refusée en objectif force', () => {
    expect(verif({ blocs: [bloc()], lignes: [], objectif: 'force', familles: FAM }).join()).toMatch(/I37/);
    expect(verif({ blocs: [bloc()], lignes: [], objectif: 'les_deux', familles: FAM })).toEqual([]);
  });
  test('I114 : une grosse série hors Hypertrophie', () => {
    expect(verif({ blocs: [bloc({ zone: 'mix', grosse_serie: true })], lignes: [], objectif: 'les_deux', familles: FAM }).join()).toMatch(/I114/);
  });
  test('I114 : le soulevé à 8-10 est refusé, en Mix accepté', () => {
    const b = bloc();
    const ligne = (zone) => ({ id: 'l', exercise_slug: SOULEVE, zone, origine: 'bloc', bloc_id: 'b1', corrigee_a: new Date(2026, 10, 2).toISOString() });
    expect(verif({ blocs: [b], lignes: [ligne('hypertrophie')], objectif: 'les_deux', familles: FAM }).join()).toMatch(/I114/);
    expect(verif({ blocs: [b], lignes: [ligne('mix')], objectif: 'les_deux', familles: FAM })).toEqual([]);
  });
});
