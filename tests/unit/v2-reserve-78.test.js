/** @jest-environment node */
//
// 78 (12/10/2026) — LA QUESTION DE RÉSERVE (MOTEUR §17.2 bis, I45). « Il t'en restait combien ? », une fois par
// exercice qui a un pari, sur sa dernière série de travail. La référence `fixtures/question78.py` fait foi pour
// chaque décision ; ses cas (`cas-78.json`, régénérés par `gen78.py`) se rejouent ici à 0 écart. Puis : la réserve
// d'une réponse, l'entrée assemblée (`passeDeReserve`), ce que le plan en fait (`questionReserve`, `serieReserve`),
// et I45 sur des plans forgés.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const R = require('../../v2/js/reserve.js');
const T = require('../../v2/js/plan.js');

const CAS = require('./fixtures/cas-78.json');

describe('78 — la concordance : les 11 cas de `cas-78.json`, à 0 écart', () => {
  test('le fichier porte les 11 cas', () => {
    expect(CAS.map((c) => c.nom)).toEqual(['a-premiere', 'b-sans-pari', 'c-fin-calage', 'd-rappel', 'e-silence',
      'f-silence-rappel', 'g-trop-prudent', 'h-trop-optimiste', 'i-rpe', 'j-plafond', 'k-avant-lancement']);
  });
  test.each(CAS.map((c) => [c.nom, c]))('%s', (nom, c) => {
    expect(R.questionsDeReserve(c.entree)).toEqual(c.attendu);
  });
  test('le lancement de la référence est celui du module', () => {
    CAS.forEach((c) => expect(c.entree.lancement).toBe(R.LANCEMENT_RESERVE));
    expect(R.LANCEMENT_RESERVE).toBe('2026-10-20');
  });
});

describe('78 — la réserve d’une réponse', () => {
  test('`reste_N` → N, `reste_3_plus` → 3, rien → null', () => {
    expect(R.reserveDe({ ressenti: 'reste_0', rpe: null })).toBe(0);
    expect(R.reserveDe({ ressenti: 'reste_1', rpe: null })).toBe(1);
    expect(R.reserveDe({ ressenti: 'reste_2', rpe: null })).toBe(2);
    expect(R.reserveDe({ ressenti: 'reste_3_plus', rpe: null })).toBe(3);
    expect(R.reserveDe({ ressenti: null, rpe: null })).toBeNull();
    expect(R.reserveDe(null)).toBeNull();
  });
  test('un RPE → 10 − RPE, borné de 0 à 3', () => {
    expect(R.reserveDe({ ressenti: null, rpe: 10 })).toBe(0);
    expect(R.reserveDe({ ressenti: null, rpe: 9.5 })).toBe(0.5);
    expect(R.reserveDe({ ressenti: null, rpe: 8 })).toBe(2);
    expect(R.reserveDe({ ressenti: null, rpe: 6 })).toBe(3);
  });
});

describe('78 — l’entrée : le passé d’un exercice (`passeDeReserve`)', () => {
  const seances = [
    { id: 'c', debut: '2026-10-25T09:00:00', statut: 'terminee' },
    { id: 'a', debut: '2026-10-21T09:00:00', statut: 'terminee' },
    { id: 'z', debut: '2026-10-22T09:00:00', statut: 'en_cours' },
    { id: 'b', debut: '2026-10-23T09:00:00', statut: 'terminee' },
    { id: 'w', debut: '2026-10-24T09:00:00', statut: 'terminee' }
  ];
  const series = {
    a: [{ exercise_slug: 'squat', rang: 2, type_serie: 'travail', ressenti: 'reste_1', rpe: null },
        { exercise_slug: 'squat', rang: 1, type_serie: 'travail', ressenti: 'reste_0', rpe: null },
        { exercise_slug: 'squat', rang: 3, type_serie: 'degressive', ressenti: 'reste_3_plus', rpe: null }],
    b: [{ exercise_slug: 'squat', rang: 1, type_serie: 'travail', ressenti: null, rpe: '9' },
        { exercise_slug: 'curl', rang: 2, type_serie: 'travail', ressenti: 'reste_2', rpe: null }],
    c: [{ exercise_slug: 'squat', rang: 1, type_serie: 'travail', ressenti: null, rpe: null }],
    z: [{ exercise_slug: 'squat', rang: 1, type_serie: 'travail', ressenti: 'reste_2', rpe: null }],
    w: [{ exercise_slug: 'squat', rang: 1, type_serie: 'echauffement', ressenti: 'reste_3_plus', rpe: null }]
  };
  const seriesDe = (id) => series[id] || [];

  test('la DERNIÈRE série de travail de chaque séance (jamais une dégressive ni une chauffe), triées dans le temps', () => {
    expect(R.passeDeReserve('squat', seances, seriesDe, null)).toEqual([
      { jour: '2026-10-21', effort: { ressenti: 'reste_1', rpe: null } },
      { jour: '2026-10-23', effort: { ressenti: null, rpe: 9 } },
      { jour: '2026-10-25', effort: { ressenti: null, rpe: null } }
    ]);
  });
  test('ni la séance ouverte, ni une séance en cours, ni une séance où l’exercice n’a que des chauffes', () => {
    expect(R.passeDeReserve('squat', seances, seriesDe, 'c').map((p) => p.jour)).toEqual(['2026-10-21', '2026-10-23']);
    expect(R.passeDeReserve('curl', seances, seriesDe, null)).toEqual([
      { jour: '2026-10-23', effort: { ressenti: 'reste_2', rpe: null } }]);
  });
});

// ── LE PLAN ─────────────────────────────────────────────────────────────────
const DEBUT = '2026-10-21T10:00:00';
const CATALOGUE = { a: { equipement: null, muscles_primaires: ['pectoraux'] },
                    b: { equipement: null, muscles_primaires: ['dorsaux'] },
                    c: { equipement: null, muscles_primaires: ['biceps'] } };
const consigne = (charge, vise) => ({ etat: 'progression', zone: 'force', palier: charge, niveau: vise, n: 3,
  ligne: { charge: charge, vise: vise }, haut: null, fondement: {} });

function seanceDe(exos) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  exos.forEach((e, i) => {
    se = S.ajouterExercice(se, e.slug, id, { series: e.travail === undefined ? 3 : e.travail });
    if (e.chauffes) se = S.insererChauffes(se, i, e.chauffes.map((r) => [0, r]), id);
    if (e.degressive) {
      se = S.ajouterSerie(se, i, id);
      se = S.changerType(se, i, se.exercices[i].series.length - 1, 'degressive');
    }
  });
  return se;
}
function entreesDe(se, exos, extra) {
  const cs = {};
  exos.forEach((e) => {
    cs[e.slug] = e.consigne ? { consigne: e.consigne, libelles: M.libellesConsigne(e.consigne), pas: null } : null;
  });
  return Object.assign({
    seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: cs, catalogue: CATALOGUE, reglage: null, paris: [], suites: {},
    reserve: { lancement: R.LANCEMENT_RESERVE, passes: {} }
  }, extra || {});
}
const ok = (plan, entrees) => expect(T.verifierPlan(plan, entrees).erreurs).toEqual([]);

describe('78 — le plan porte la question (`questionReserve`, `serieReserve`)', () => {
  const EXOS = [{ slug: 'a', consigne: consigne(100, 5), travail: 3, degressive: true },
                { slug: 'c', consigne: null, travail: 2 },
                { slug: 'b', consigne: consigne(60, 10), travail: 2, chauffes: [10] }];

  test('un exercice avec un pari : au calage, la question sur sa DERNIÈRE série de travail (pas la dégressive) ; sans pari : rien', () => {
    const se = seanceDe(EXOS);
    const e = entreesDe(se, EXOS);
    const p = T.planDeSeance(e);
    expect(p.exercices.map((x) => [x.slug, x.questionReserve, x.serieReserve])).toEqual([
      ['a', 'calage', 2], ['c', null, null], ['b', 'calage', 2]]);
    expect(se.exercices[0].series[3].type_serie).toBe('degressive');
    expect(se.exercices[2].series[0].type_serie).toBe('echauffement');
    ok(p, e);
  });

  test('sans entrée `reserve` (le simulateur, les autres tests), ou en Édition : aucune question', () => {
    const se = seanceDe(EXOS);
    const sans = entreesDe(se, EXOS);
    delete sans.reserve;
    expect(T.planDeSeance(sans).exercices.map((x) => x.questionReserve)).toEqual([null, null, null]);
    const edition = entreesDe(se, EXOS);
    edition.seance = Object.assign({}, edition.seance, { edition: true });
    expect(T.planDeSeance(edition).exercices.map((x) => x.questionReserve)).toEqual([null, null, null]);
  });

  test('une consigne qui se tait (`silence`) n’a pas de pari : pas de question', () => {
    const exos = [{ slug: 'a', consigne: Object.assign(consigne(100, 5), { etat: 'silence' }), travail: 2 }];
    const p = T.planDeSeance(entreesDe(seanceDe(exos), exos));
    expect(p.exercices[0].questionReserve).toBeNull();
  });

  test('le passé figé pilote la décision : 5 séances sans réponse depuis le lancement, rang 5 → pas de question', () => {
    const exos = [{ slug: 'a', consigne: consigne(100, 5), travail: 2 }];
    const passe = ['2026-10-20', '2026-10-22', '2026-10-24', '2026-10-26', '2026-10-28']
      .map((j) => ({ jour: j, effort: { ressenti: null, rpe: null } }));
    const e = entreesDe(seanceDe(exos), exos, { seance: { id: 'S1', debut: '2026-10-30T10:00:00', edition: false,
      exercices: seanceDe(exos).exercices }, reserve: { lancement: R.LANCEMENT_RESERVE, passes: { a: passe } } });
    expect(T.planDeSeance(e).exercices[0].questionReserve).toBeNull();
    // Une réponse dans les cinq : le calage reprend.
    passe[4] = { jour: '2026-10-28', effort: { ressenti: 'reste_1', rpe: null } };
    expect(T.planDeSeance(e).exercices[0].questionReserve).toBe('calage');
  });

  test('au plus quatre : six exercices au calage, quatre questions, dans l’ordre du plan', () => {
    const exos = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => ({ slug: s, consigne: consigne(50, 8), travail: 1 }));
    const cat = {};
    exos.forEach((x) => { cat[x.slug] = { equipement: null, muscles_primaires: ['biceps'] }; });
    const e = entreesDe(seanceDe(exos), exos, { catalogue: cat });
    const p = T.planDeSeance(e);
    expect(p.exercices.map((x) => x.questionReserve)).toEqual(['calage', 'calage', 'calage', 'calage', null, null]);
    ok(p, e);
  });

  test('même entrée, mêmes questions ; le calcul ne touche pas ses entrées (I12)', () => {
    const se = seanceDe(EXOS);
    const e = entreesDe(se, EXOS);
    const avant = JSON.stringify(e);
    expect(JSON.stringify(T.planDeSeance(e))).toBe(JSON.stringify(T.planDeSeance(e)));
    expect(JSON.stringify(e)).toBe(avant);
  });
});

describe('78 — I45, sur des plans forgés', () => {
  const EXOS = [{ slug: 'a', consigne: consigne(100, 5), travail: 3 }, { slug: 'c', consigne: null, travail: 2 }];
  const forge = (f) => {
    const se = seanceDe(EXOS);
    const e = entreesDe(se, EXOS);
    const p = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    f(p);
    return T.verifierPlan(p, e).erreurs.filter((x) => /^I45/.test(x));
  };
  test('le plan juste passe', () => { expect(forge(() => {})).toEqual([]); });
  test('une question sur la première série', () => {
    expect(forge((p) => { p.exercices[0].serieReserve = 0; })).toEqual([
      'I45 — exercice 0 (a) : la question sur la série 0, pas sur la dernière série de travail (2)']);
  });
  test('une question sur un exercice sans pari', () => {
    expect(forge((p) => { p.exercices[1].questionReserve = 'calage'; p.exercices[1].serieReserve = 1; }))
      .toEqual(['I45 — exercice 1 (c) : une question sans pari']);
  });
  test('un motif inconnu ; une série visée sans question', () => {
    expect(forge((p) => { p.exercices[0].questionReserve = 'toujours'; })).toEqual([
      'I45 — exercice 0 (a) : motif inconnu « toujours »']);
    expect(forge((p) => { p.exercices[1].serieReserve = 1; })).toEqual([
      'I45 — exercice 1 (c) : une série visée sans question']);
  });
  test('cinq questions dans un plan', () => {
    const exos = ['a', 'b', 'c', 'd', 'e'].map((s) => ({ slug: s, consigne: consigne(50, 8), travail: 1 }));
    const cat = {};
    exos.forEach((x) => { cat[x.slug] = { equipement: null, muscles_primaires: ['biceps'] }; });
    const e = entreesDe(seanceDe(exos), exos, { catalogue: cat });
    const p = JSON.parse(JSON.stringify(T.planDeSeance(e)));
    p.exercices[4].questionReserve = 'calage';
    p.exercices[4].serieReserve = 0;
    expect(T.verifierPlan(p, e).erreurs.filter((x) => /^I45/.test(x))).toEqual([
      'I45 — 5 questions de réserve dans le plan (au plus 4)']);
  });
});
