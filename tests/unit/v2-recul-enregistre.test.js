// 234 — UN RECUL DU BLOC S'ENREGISTRE `recul` (limite relevée à la 221 ; MOTEUR §9.28 / §19.2).
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/periode.js');
require('../../v2/js/bilan.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');

const SQUAT = 'squat_barre';
const struct = { grosse: true };
const serie = (type, o) => Object.assign({ type_serie: type, reps_visees: 8, validee_a: null }, o || {});

describe('234 — le plan lit les reculs du bloc, même quand le premier est déjà enregistré recul', () => {
  test('quatre séries de travail : 1 grosse, 3 reculs', () => {
    const r = M.seriesEnGrosseEtReculs([serie('travail'), serie('travail'), serie('travail'), serie('travail')], struct);
    expect(r.map((x) => x.type_serie)).toEqual(['travail', 'recul', 'recul', 'recul']);
  });
  test('le premier recul est déjà enregistré : les suivants restent des reculs (pas de retour à travail)', () => {
    const r = M.seriesEnGrosseEtReculs([serie('travail', { validee_a: 'x' }), serie('recul', { validee_a: 'y' }), serie('travail'), serie('travail')], struct);
    expect(r.map((x) => x.type_serie)).toEqual(['travail', 'recul', 'recul', 'recul']);
  });
  test('tout est déjà recul après la grosse : rien ne change', () => {
    const s = [serie('travail'), serie('recul'), serie('recul')];
    expect(M.seriesEnGrosseEtReculs(s, struct)).toBe(s);
  });
});

describe('234 — Seance.typerSelonLePlan : la série validée que le plan porte comme recul s’enregistre recul', () => {
  const seance = () => {
    let k = 0; const id = () => 'r-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    return S.ajouterExercice(se, SQUAT, id, { series: 3 });
  };
  test('une série de travail non validée que le plan lit comme recul devient recul', () => {
    const se = S.typerSelonLePlan(seance(), 0, 1, 'recul');
    expect(se.exercices[0].series.map((x) => x.type_serie)).toEqual(['travail', 'recul', 'travail']);
  });
  test('la grosse série (le plan dit travail) reste travail', () => {
    const se = S.typerSelonLePlan(seance(), 0, 0, 'travail');
    expect(se.exercices[0].series[0].type_serie).toBe('travail');
  });
  test('une série déjà validée n’est jamais réécrite', () => {
    let se = S.valider(seance(), 0, 1, new Date('2026-11-04T10:00:00Z'));
    se = S.typerSelonLePlan(se, 0, 1, 'recul');
    expect(se.exercices[0].series[1].type_serie).toBe('travail');
  });
  test('une chauffe, une dégressive ou un échec ne deviennent jamais recul', () => {
    let se = seance();
    ['echauffement', 'degressive', 'echec'].forEach((t, i) => { se = S.changerType(se, 0, i, t); });
    se = [0, 1, 2].reduce((a, i) => S.typerSelonLePlan(a, 0, i, 'recul'), se);
    expect(se.exercices[0].series.map((x) => x.type_serie)).toEqual(['echauffement', 'degressive', 'echec']);
  });
  test('un indice inconnu ne casse rien', () => {
    const se = seance();
    expect(S.typerSelonLePlan(se, 0, 9, 'recul')).toBe(se);
    expect(S.typerSelonLePlan(se, 5, 0, 'recul')).toBe(se);
  });
});
