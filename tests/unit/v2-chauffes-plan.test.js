/** @jest-environment node */
//
// 49-U10 — les chauffes et la dégressive DANS LE PLAN UNIQUE (MOTEUR §9.15,
// §9.13 bis). La règle pure est éprouvée par les 32 cas (`v2-chauffes.test.js`) ;
// ici, ce que le plan en fait :
//   · les lignes de chauffe remplies d'office (leur fantôme), sur la référence
//     de la CONSIGNE FIGÉE (la ligne, pas le test) ;
//   · « premier sur ses muscles » et « soulevé au sol », lus au catalogue ;
//   · la proposition sans ligne de chauffe, « Ajouter », « Non merci », et les
//     trois refus d'affilée ;
//   · la dégressive (−22,5 %, sans repos), vide à la barre ;
//   · aucune ne compte pour le coach : ni pari, ni réaction ;
//   · I16 et I17, et des violations FORGÉES qu'ils attrapent.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const NB = ' ';
const DEBUT = '2026-09-29T10:00:00+00:00';

// Le catalogue, tel qu'en base (lu le 30/09/2026, `exercises`).
const CATALOGUE = {
  developpe_couche_barre: { equipement: 'barre', muscles_primaires: ['pectoraux'] },
  developpe_militaire_barre: { equipement: 'barre', muscles_primaires: ['epaules'] },
  souleve_de_terre_barre: { equipement: 'barre', muscles_primaires: ['ischio_jambiers', 'fessiers', 'bas_du_dos'] },
  souleve_de_terre_roumain_barre: { equipement: 'barre', muscles_primaires: ['ischio_jambiers', 'fessiers'] },
  squat_barre: { equipement: 'barre', muscles_primaires: ['quadriceps', 'fessiers'] },
  extension_jambes: { equipement: 'machine', muscles_primaires: ['quadriceps'] },
  curl_barre: { equipement: 'barre', muscles_primaires: ['biceps'] },
  ecarte_poulie: { equipement: 'poulie', muscles_primaires: ['pectoraux'] }
};

const consigne = (charge, vise, haut) => ({
  etat: 'progression', zone: 'force', palier: charge, niveau: vise, n: 3,
  ligne: { charge: charge, vise: vise }, haut: haut || null, fondement: {}
});

// Une séance : `exos` = [{ slug, travail, chauffes: [reps…], degressives, consigne }].
function seanceDe(exos) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  exos.forEach((e, i) => {
    se = S.ajouterExercice(se, e.slug, id, { series: e.travail === undefined ? 3 : e.travail });
    if (e.chauffes) se = S.insererChauffes(se, i, e.chauffes.map((r) => [0, r]), id);
    (e.degressives || []).forEach(() => {
      se = S.ajouterSerie(se, i, id);
      // La ligne ajoutée, par son identifiant : « + Série » la place avant
      // une dégressive qui attend (PR 4 de la consolidation).
      const j = se.exercices[i].series.findIndex((x) => x.id === 's' + n);
      se = S.changerType(se, i, j, 'degressive');
    });
  });
  return se;
}

function entreesDe(se, exos, extra) {
  const cs = {};
  exos.forEach((e) => {
    cs[e.slug] = e.consigne ? { consigne: e.consigne, libelles: M.libellesConsigne(e.consigne), pas: e.pas === undefined ? null : e.pas } : null;
  });
  return Object.assign({
    seance: { id: 'S1', debut: DEBUT, edition: false, exercices: se.exercices },
    consignes: cs, catalogue: CATALOGUE, reglage: null, paris: [], suites: {}
  }, extra || {});
}

const valider = (se, i, j, charge, reps) => S.valider(S.modifierSerie(se, i, j, { charge_kg: charge, reps: reps }), i, j, new Date(DEBUT));
const charges = (x) => x.lignes.filter((l) => l.type === 'echauffement').map((l) => (l.fantome ? l.fantome.charge : null));
const ok = (plan, entrees) => expect(T.verifierPlan(plan, entrees).erreurs).toEqual([]);

describe('§9.15.1 — les chauffes de la routine, remplies d\'office', () => {
  const EXOS = [{ slug: 'developpe_couche_barre', chauffes: [10, 6, 3, 1], consigne: consigne(125, 5) }];

  test('couché 125, premier sur les pecs : 20 · 60 · 90 · 110, et la phrase du coach', () => {
    const se = seanceDe(EXOS);
    const e = entreesDe(se, EXOS);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(charges(x)).toEqual([20, 60, 90, 110]);
    expect(x.chauffes.situation).toBe('barre_lourde');
    expect(x.chauffes.phrase).toBe('Chauffes calées sur 125' + NB + 'kg : 20 · 60 · 90 · 110' + NB + 'kg.');
    expect(x.chauffes.iSerie).toBe(0);
    expect(x.proposition).toBeNull();
    ok(p, e);
  });

  test('ni pari, ni réaction : les chauffes restent hors de la couverture', () => {
    const se = seanceDe(EXOS);
    const x = T.planDeSeance(entreesDe(se, EXOS)).exercices[0];
    x.lignes.filter((l) => l.type === 'echauffement').forEach((l) => {
      expect(l.role).toBe('hors');
      expect(x.paris[l.iSerie]).toBeNull();
    });
    expect(x.message === null || x.lignes[x.message.iSerie].type === 'travail').toBe(true);
  });

  test('la référence est la LIGNE, pas le test : un test à 130 ne change rien', () => {
    const exos = [{ slug: 'developpe_couche_barre', chauffes: [10, 6, 3, 1], consigne: consigne(125, 5, { charge: 130, vise: 3, k: 1 }) }];
    const x = T.planDeSeance(entreesDe(seanceDe(exos), exos)).exercices[0];
    expect(x.chauffes.reference).toBe(125);
    expect(charges(x)).toEqual([20, 60, 90, 110]);
  });

  test('une chauffe validée garde ce qui a été fait ; les autres restent sur la consigne figée', () => {
    let se = seanceDe(EXOS);
    se = valider(se, 0, 0, 25, 10);
    const e = entreesDe(se, EXOS);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.lignes[0].fantome).toBeFalsy();
    expect(charges(x).slice(1)).toEqual([60, 90, 110]);
    ok(p, e);
  });

  test('« premier sur ses muscles » : un muscle PRIMAIRE en commun avec un exercice placé avant', () => {
    const exos = [
      { slug: 'souleve_de_terre_barre', chauffes: [5, 3, 1], consigne: consigne(155, 5) },
      { slug: 'squat_barre', chauffes: [5, 2], consigne: consigne(100, 5) }
    ];
    const p = T.planDeSeance(entreesDe(seanceDe(exos), exos));
    // Le soulevé au sol : 80 · 110 · 140 (pas de barre vide).
    expect(p.exercices[0].chauffes.situation).toBe('sol');
    expect(charges(p.exercices[0])).toEqual([80, 110, 140]);
    // Le squat après lui : les fessiers sont déjà sollicités → 60 · 90.
    expect(p.exercices[1].chauffes.situation).toBe('deja_barre');
    expect(charges(p.exercices[1])).toEqual([60, 90]);
  });

  test('le squat AVANT le soulevé reste premier : c\'est l\'ordre de la séance', () => {
    const exos = [
      { slug: 'squat_barre', chauffes: [10, 6, 3, 1], consigne: consigne(125, 5) },
      { slug: 'developpe_couche_barre', chauffes: [10, 6, 3, 1], consigne: consigne(125, 5) }
    ];
    const p = T.planDeSeance(entreesDe(seanceDe(exos), exos));
    expect(p.exercices[0].chauffes.situation).toBe('barre_lourde');
    // Aucun muscle primaire en commun : le couché est premier sur les siens.
    expect(p.exercices[1].chauffes.situation).toBe('barre_lourde');
  });

  test('« soulevé au sol » : pas le roumain, qui part debout (barre vide × 10)', () => {
    const exos = [{ slug: 'souleve_de_terre_roumain_barre', chauffes: [10, 6, 3, 1], consigne: consigne(125, 5) }];
    const x = T.planDeSeance(entreesDe(seanceDe(exos), exos)).exercices[0];
    expect(x.chauffes.situation).toBe('barre_lourde');
    expect(charges(x)).toEqual([20, 60, 90, 110]);
  });

  test('plus de lignes que la table : la dernière reste vide, et la feuille le dit', () => {
    const exos = [{ slug: 'developpe_couche_barre', chauffes: [10, 6, 3, 1, 1], consigne: consigne(125, 5) }];
    const e = entreesDe(seanceDe(exos), exos);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(charges(x)).toEqual([20, 60, 90, 110, null]);
    expect(x.lignes[4].chauffe).toEqual({ charge: null });
    expect(x.pourquoi.chauffes).toBe('Ta routine prévoit 5 chauffes ; le coach en calcule 4 : la dernière reste à remplir.');
    ok(p, e);
  });

  test('hors catalogue : l\'étape se tait (aucun matériel connu)', () => {
    const se = seanceDe(EXOS);
    const x = T.planDeSeance(entreesDe(se, EXOS, { catalogue: {} })).exercices[0];
    expect(x.chauffes).toBeNull();
    expect(charges(x)).toEqual([null, null, null, null]);
  });
});

describe('§9.15.2 — sans ligne de chauffe, une proposition', () => {
  const EXOS = [{ slug: 'developpe_couche_barre', consigne: consigne(125, 5) }];

  test('la proposition, jamais des séries insérées d\'office', () => {
    const se = seanceDe(EXOS);
    const e = entreesDe(se, EXOS);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.proposition.phrase).toBe('Chauffe : 20' + NB + 'kg × 10 · 60' + NB + 'kg × 6 · 90' + NB + 'kg × 3 · 110' + NB + 'kg × 1');
    expect(x.proposition.lignes).toEqual([[20, 10], [60, 6], [90, 3], [110, 1]]);
    expect(se.exercices[0].series.every((s) => S.typeDe(s) === 'travail')).toBe(true);
    ok(p, e);
  });

  test('« Ajouter » : des lignes d\'échauffement AU-DESSUS du travail, remplies par le coach', () => {
    let se = seanceDe(EXOS);
    const x0 = T.planDeSeance(entreesDe(se, EXOS)).exercices[0];
    se = S.insererChauffes(se, 0, x0.proposition.lignes, (() => { let k = 0; return () => 'c' + (++k); })());
    expect(se.exercices[0].series.map((s) => S.typeDe(s))).toEqual(['echauffement', 'echauffement', 'echauffement', 'echauffement', 'travail', 'travail', 'travail']);
    expect(se.exercices[0].series.slice(0, 4).map((s) => s.reps_visees)).toEqual([10, 6, 3, 1]);
    const e = entreesDe(se, EXOS);
    const p = T.planDeSeance(e);
    expect(p.exercices[0].proposition).toBeNull();
    expect(charges(p.exercices[0])).toEqual([20, 60, 90, 110]);
    ok(p, e);
  });

  test('« Ajouter » après une chauffe déjà là : au-dessus de la PREMIÈRE série de travail', () => {
    let se = seanceDe([{ slug: 'developpe_couche_barre', travail: 2 }]);
    se = S.changerType(se, 0, 0, 'echauffement');
    se = S.insererChauffes(se, 0, [[20, 10]], () => 'n1');
    expect(se.exercices[0].series.map((s) => S.typeDe(s))).toEqual(['echauffement', 'echauffement', 'travail']);
    expect(se.exercices[0].series[1].id).toBe('n1');
  });

  test('« Non merci » retire la proposition pour la séance', () => {
    const se = seanceDe(EXOS);
    const memoire = T.refuserChauffes({}, 'developpe_couche_barre', 'S1');
    const x = T.planDeSeance(entreesDe(se, EXOS, { refusChauffes: T.refusChauffesDe(memoire, 'S1') })).exercices[0];
    expect(x.proposition).toBeNull();
    // La séance suivante, elle revient (un refus seulement).
    expect(T.refusChauffesDe(memoire, 'S2')).toEqual({});
  });

  test('trois « Non merci » d\'affilée : plus de proposition sur cet exercice', () => {
    let m = {};
    m = T.refuserChauffes(m, 'developpe_couche_barre', 'S1');
    m = T.refuserChauffes(m, 'developpe_couche_barre', 'S1');   // la même séance : un seul
    expect(m.developpe_couche_barre.n).toBe(1);
    m = T.refuserChauffes(m, 'developpe_couche_barre', 'S2');
    expect(T.refusChauffesDe(m, 'S3')).toEqual({});
    m = T.refuserChauffes(m, 'developpe_couche_barre', 'S3');
    expect(m.developpe_couche_barre.n).toBe(3);
    expect(T.refusChauffesDe(m, 'S9')).toEqual({ developpe_couche_barre: true });
    // … et sur lui seul.
    expect(T.refusChauffesDe(m, 'S9').squat_barre).toBeUndefined();
  });

  test('« Ajouter » remet le compte à zéro', () => {
    let m = {};
    ['S1', 'S2'].forEach((s) => { m = T.refuserChauffes(m, 'developpe_couche_barre', s); });
    m = T.accepterChauffes(m, 'developpe_couche_barre');
    m = T.refuserChauffes(m, 'developpe_couche_barre', 'S3');
    expect(m.developpe_couche_barre.n).toBe(1);
  });

  test('une série de travail faite : la proposition n\'a plus d\'objet', () => {
    const se = valider(seanceDe(EXOS), 0, 0, 125, 5);
    expect(T.planDeSeance(entreesDe(se, EXOS)).exercices[0].proposition).toBeNull();
  });

  test('isolation sur des muscles déjà sollicités : aucune proposition', () => {
    const exos = [{ slug: 'developpe_couche_barre', consigne: consigne(125, 5) },
      { slug: 'ecarte_poulie', consigne: consigne(30, 12) }];
    const p = T.planDeSeance(entreesDe(seanceDe(exos), exos));
    expect(p.exercices[1].proposition).toBeNull();
  });
});

describe('§9.15.3 — la dégressive', () => {
  const MACHINE = [{ slug: 'extension_jambes', travail: 2, degressives: [1], consigne: consigne(60, 15), pas: 5 }];

  test('machine, 60 × 15 : 45 kg, vise 6 à 8, sans repos', () => {
    const se = seanceDe(MACHINE);
    const e = entreesDe(se, MACHINE);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    const d = x.lignes[2];
    expect(d.type).toBe('degressive');
    expect(d.role).toBe('hors');
    expect(d.fantome.charge).toBe(45);
    expect(x.degressive).toEqual({ iSerie: 2, apres: 1, reference: 60, charge: 45, repos: 0,
      phrase: 'Dégressive : 45' + NB + 'kg, sans repos, jusqu\'à l\'échec. Vise 6 à 8.' });
    expect(x.paris[2]).toBeNull();
    ok(p, e);
  });

  test('la référence est la DERNIÈRE série de travail FAITE', () => {
    let se = seanceDe(MACHINE);
    se = valider(se, 0, 0, 60, 15);
    se = valider(se, 0, 1, 70, 12);
    const x = T.planDeSeance(entreesDe(se, MACHINE)).exercices[0];
    // 70 × 0,775 = 54,25 → 50 au cran de 5 ; 12 reps → vise 5 à 7.
    expect(x.degressive.charge).toBe(50);
    expect(x.degressive.phrase).toBe('Dégressive : 50' + NB + 'kg, sans repos, jusqu\'à l\'échec. Vise 5 à 7.');
  });

  test('sans consigne : la dégressive se cale sur la série de travail faite (cran de 2,5)', () => {
    const exos = [{ slug: 'extension_jambes', travail: 1, degressives: [1] }];
    let se = seanceDe(exos);
    se = valider(se, 0, 0, 50, 12);
    const x = T.planDeSeance(entreesDe(se, exos)).exercices[0];
    expect(x.consigne).toBeNull();
    expect(x.degressive.charge).toBe(37.5);
  });

  test('à la barre : la ligne reste vide, et le coach le dit', () => {
    const exos = [{ slug: 'curl_barre', travail: 2, degressives: [1], consigne: consigne(40, 12) }];
    const e = entreesDe(seanceDe(exos), exos);
    const p = T.planDeSeance(e);
    const x = p.exercices[0];
    expect(x.degressive.charge).toBeNull();
    expect(x.degressive.phrase).toBe('Pas de dégressive à la barre.');
    expect(x.lignes[2].fantome).toEqual({ charge: null, reps: null, source: 'degressive' });
    ok(p, e);
  });

  test('une seule baisse : seule la première dégressive après la dernière série de travail', () => {
    const exos = [{ slug: 'extension_jambes', travail: 2, degressives: [1, 1], consigne: consigne(60, 15), pas: 5 }];
    const x = T.planDeSeance(entreesDe(seanceDe(exos), exos)).exercices[0];
    expect(x.lignes[2].degressive.charge).toBe(45);
    expect(x.lignes[3].degressive).toBeUndefined();
    expect(x.lignes[3].fantome).toBeFalsy();
  });
});

describe('§9.15.1 — le repos des chauffes (60 s, puis 120 s avant le travail)', () => {
  const EXOS = [{ slug: 'developpe_couche_barre', chauffes: [10, 6, 3, 1], consigne: consigne(125, 5) }];
  const MACHINE = [{ slug: 'extension_jambes', travail: 2, degressives: [1], consigne: consigne(60, 15), pas: 5 }];

  test('60 s entre deux chauffes, 120 s après la dernière, le repos de l\'exercice pour le travail', () => {
    const x = T.planDeSeance(entreesDe(seanceDe(EXOS), EXOS)).exercices[0];
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => T.reposApres(x, i, 180))).toEqual([60, 60, 60, 120, 180, 180, 180]);
    expect(T.REPOS_ENTRE_CHAUFFES).toBe(60);
    expect(T.REPOS_APRES_CHAUFFES).toBe(120);
  });

  test('le repos de la routine ne prime pas pour les chauffes, même désactivé', () => {
    const x = T.planDeSeance(entreesDe(seanceDe(EXOS), EXOS)).exercices[0];
    expect(T.reposApres(x, 2, null)).toBe(60);
    expect(T.reposApres(x, 3, 90)).toBe(120);
    expect(T.reposApres(x, 4, null)).toBeNull();
  });

  test('une chauffe unique est aussi la dernière : 120 s', () => {
    const exos = [{ slug: 'extension_jambes', chauffes: [8], consigne: consigne(100, 10) }];
    const x = T.planDeSeance(entreesDe(seanceDe(exos), exos)).exercices[0];
    expect(T.reposApres(x, 0, 90)).toBe(120);
  });

  test('aucun repos avant la dégressive remplie ; après elle, le repos de l\'exercice', () => {
    const x = T.planDeSeance(entreesDe(seanceDe(MACHINE), MACHINE)).exercices[0];
    expect(T.reposApres(x, 0, 90)).toBe(90);
    expect(T.reposApres(x, 1, 90)).toBeNull();
    expect(T.reposApres(x, 2, 90)).toBe(90);
  });

  test('à la barre, la dégressive vide ne supprime pas le repos', () => {
    const exos = [{ slug: 'curl_barre', travail: 2, degressives: [1], consigne: consigne(40, 12) }];
    const x = T.planDeSeance(entreesDe(seanceDe(exos), exos)).exercices[0];
    expect(T.reposApres(x, 1, 90)).toBe(90);
  });
});

describe('§9.15.2 (delta 49-24) — le seuil des propositions, dans le plan', () => {
  test('barre à 55 kg : pas de proposition ; à 60 kg : une proposition', () => {
    const bas = [{ slug: 'developpe_militaire_barre', consigne: consigne(55, 5) }];
    const pile = [{ slug: 'developpe_militaire_barre', consigne: consigne(60, 5) }];
    expect(T.planDeSeance(entreesDe(seanceDe(bas), bas)).exercices[0].proposition).toBeNull();
    expect(T.planDeSeance(entreesDe(seanceDe(pile), pile)).exercices[0].proposition.lignes).toEqual([[20, 10], [55, 2]]);
  });

  test('machine à 75 kg : pas de proposition ; à 80 kg : une', () => {
    const bas = [{ slug: 'extension_jambes', consigne: consigne(75, 10), pas: 5 }];
    const pile = [{ slug: 'extension_jambes', consigne: consigne(80, 10), pas: 5 }];
    expect(T.planDeSeance(entreesDe(seanceDe(bas), bas)).exercices[0].proposition).toBeNull();
    expect(T.planDeSeance(entreesDe(seanceDe(pile), pile)).exercices[0].proposition.lignes).toEqual([[50, 8]]);
  });

  test('le seuil ne touche pas les chauffes de la routine : une barre à 40 kg les remplit', () => {
    const exos = [{ slug: 'curl_barre', chauffes: [10, 2], consigne: consigne(40, 10) }];
    const e = entreesDe(seanceDe(exos), exos);
    const p = T.planDeSeance(e);
    expect(charges(p.exercices[0])).toEqual([20, 35]);
    ok(p, e);
  });
});

describe('I16, I17 — des violations forgées sont attrapées', () => {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const erreurs = (p) => T.verifierPlan(p).erreurs;

  const CHAUFFES = [{ slug: 'developpe_couche_barre', chauffes: [10, 6, 3, 1], consigne: consigne(125, 5) }];
  const PROPOSE = [{ slug: 'developpe_couche_barre', consigne: consigne(125, 5) }];
  const MACHINE = [{ slug: 'extension_jambes', travail: 2, degressives: [1], consigne: consigne(60, 15), pas: 5 }];
  const BARRE = [{ slug: 'curl_barre', travail: 2, degressives: [1], consigne: consigne(40, 12) }];
  const plan = (exos) => T.planDeSeance(entreesDe(seanceDe(exos), exos));

  test('les plans d\'origine sont propres', () => {
    [CHAUFFES, PROPOSE, MACHINE, BARRE].forEach((x) => expect(erreurs(plan(x))).toEqual([]));
  });

  test('I16 — une chauffe au niveau de la référence', () => {
    const p = clone(plan(CHAUFFES));
    p.exercices[0].lignes[3].chauffe.charge = 125;
    p.exercices[0].lignes[3].fantome.charge = 125;
    expect(erreurs(p).join('\n')).toMatch(/^I16 — .*pas sous la référence 125/m);
  });

  test('I16 — une montée qui redescend', () => {
    const p = clone(plan(CHAUFFES));
    p.exercices[0].lignes[2].chauffe.charge = 50;
    p.exercices[0].lignes[2].fantome.charge = 50;
    expect(erreurs(p).join('\n')).toMatch(/^I16 — .*la montée redescend/m);
  });

  test('I16 — une chauffe absente de son fantôme', () => {
    const p = clone(plan(CHAUFFES));
    p.exercices[0].lignes[1].fantome = null;
    expect(erreurs(p).join('\n')).toMatch(/^I16 — .*n’est pas dans son fantôme/m);
  });

  test('I16 — une proposition dont les reps montent', () => {
    const p = clone(plan(PROPOSE));
    p.exercices[0].proposition.lignes[2][1] = 8;
    expect(erreurs(p).join('\n')).toMatch(/^I16 — .*reps proposées 8 après 6/m);
  });

  test('I17 — une dégressive remplie à la barre', () => {
    const p = clone(plan(BARRE));
    p.exercices[0].degressive.charge = 30;
    p.exercices[0].lignes[2].fantome.charge = 30;
    const e = erreurs(p).join('\n');
    expect(e).toMatch(/^I17 — .*une dégressive remplie à la barre \(30\)/m);
    expect(e).toMatch(/^I17 — .*la dégressive à la barre a un fantôme de charge/m);
  });

  test('I17 — une dégressive qui ne baisse pas', () => {
    const p = clone(plan(MACHINE));
    p.exercices[0].degressive.charge = 60;
    p.exercices[0].lignes[2].fantome.charge = 60;
    expect(erreurs(p).join('\n')).toMatch(/^I17 — .*dégressive 60 pas sous la dernière série de travail 60/m);
  });

  test('I1 — une chauffe qui reçoit un pari', () => {
    const p = clone(plan(CHAUFFES));
    p.exercices[0].paris[0] = { exercise_slug: 'developpe_couche_barre', fondement: { rang: 0 } };
    expect(erreurs(p).join('\n')).toMatch(/^I1 — .*série 0 hors couverture, avec un pari/m);
  });
});
