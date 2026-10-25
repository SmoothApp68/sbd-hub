/** @jest-environment node */
//
// 53-2 — LES PROGRAMMES À CYCLES (MOTEUR §19.2, §9.1.2, §9.22 ; delta 53-2).
//
//   1. les fonctions pures, sur les 23 cas du fichier (`cas-53-2-cycles.json`) ;
//   2. ce qu'elles disent (le badge, le bandeau, la carte de fin de bloc) ;
//   3. les invariants I36 à I39, et leurs violations forgées (plus bas).

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/bilan.js');   // 124 : « tenu » du bilan de bloc se lit dans `THBilan.estTenu`
const M = require('../../v2/js/moteur.js');
const F = require('./fixtures/cas-53-2-cycles.json');

const norm = (t) => String(t).replace(/[  ]/g, ' ');

// Les exercices des cas, tels que le catalogue (`exercises`) les porte au
// 06/10/2026 : leur matériel et leurs muscles — ce que la règle des
// exercices par défaut lit.
const CATALOGUE = {
  squat_barre: { equipement: 'barre', charge: 'absolue',
    muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers', 'ischio_jambiers', 'adducteurs', 'bas_du_dos'] },
  hack_squat_machine: { equipement: 'machine', charge: 'machine',
    muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers', 'ischio_jambiers'] },
  curl_biceps_barre: { equipement: 'barre', charge: 'absolue',
    muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'] },
  developpe_couche_barre: { equipement: 'barre', charge: 'absolue',
    muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] },
  rowing_penche_barre: { equipement: 'barre', charge: 'absolue',
    muscles_primaires: ['haut_du_dos', 'grand_dorsal'], muscles_secondaires: ['biceps', 'bas_du_dos'] }
};

describe('53-2 — les 23 cas du fichier', () => {
  const C = F.cas;
  test('le fichier : 23 cas, en sept familles', () => {
    const n = Object.keys(C).reduce((t, k) => t + C[k].length, 0);
    expect(n).toBe(23);
    expect([C.semaine_du_bloc.length, C.decharge_planifiee.length, C.carte_allegee_autorisee.length,
      C.zone_en_vigueur.length, C.bloc_suivant.length, C.exercices_par_defaut.length, C.bilan.length])
      .toEqual([7, 5, 3, 3, 2, 2, 1]);
    expect(F.ecart_sans_cumul_jours).toBe(M.SANS_CUMUL_JOURS);
  });

  C.semaine_du_bloc.forEach((c) => {
    test('semaine du bloc — ' + c.jour + ' → ' + c.attendu, () => {
      expect(M.semaineDuBloc(c.bloc, c.jour)).toBe(c.attendu);
    });
  });

  C.decharge_planifiee.forEach((c) => {
    test('décharge planifiée — ' + c.titre, () => {
      expect(M.debutDecharge(c.bloc)).toBe(c.debut_decharge);
      expect(M.dechargePlanifiee(c.bloc, c.fins_allegees)).toBe(c.attendu);
    });
  });

  C.carte_allegee_autorisee.forEach((c) => {
    test('carte d’une semaine allégée — ' + c.titre, () => {
      expect(M.carteAllegeeAutorisee(c.blocs, c.jour)).toBe(c.attendu);
      // Et par la mémoire de l'escalier : la même règle, à la même porte.
      expect(M.carteAutorisee('x', c.jour, [], [], c.blocs)).toBe(c.attendu);
    });
  });

  // ⚠️ La zone en vigueur n'a pas de fonction à elle : c'est la lecture des
  // corrections (`ligneDeZoneAu`, que `correctionAu` et `zoneEnVigueur`
  // prennent), les lignes de bloc s'y lisant comme les autres.
  C.zone_en_vigueur.forEach((c) => {
    test('zone en vigueur — ' + c.titre, () => {
      expect(M.ligneDeZoneAu(c.lignes, c.slug, c.a, false)).toEqual(c.attendu);
      const siennes = c.lignes.filter((l) => l.exercise_slug === c.slug);
      expect(M.correctionAu(siennes, c.a)).toBe(c.attendu.zone);
      expect(M.zoneEnVigueur(c.lignes, c.slug, c.a)).toBe(c.attendu.zone);
    });
  });

  C.bloc_suivant.forEach((c) => {
    test('bloc suivant — ' + c.bloc.zone + ' → ' + c.attendu.zone, () => {
      expect(M.blocSuivant(c.bloc)).toEqual(c.attendu);
    });
  });

  C.exercices_par_defaut.forEach((c, i) => {
    test('exercices par défaut — ' + (i + 1), () => {
      expect(M.exercicesParDefaut(c.routine, CATALOGUE)).toEqual(c.attendu);
    });
  });

  C.bilan.forEach((c) => {
    test('bilan — ' + c.titre, () => {
      expect(M.bilanDuBloc(c.bloc, c.seances, c.paris)).toEqual(c.attendu);
    });
  });
});

describe('53-2 — les bords des fonctions pures', () => {
  const BLOC = F.cas.semaine_du_bloc[0].bloc;

  test('⚠️ DISCRIMINANT — au calendrier, jamais en séances : une coupure ne prolonge pas le bloc', () => {
    // Aucune séance n'entre dans le calcul : la semaine 3 commence le 26/10.
    expect(M.semaineDuBloc(BLOC, '2026-10-26')).toBe(3);
    expect(M.semaineDuBloc(BLOC, '2026-10-26T18:30:00')).toBe(3);
    expect(M.finDuBloc(BLOC)).toBe('2026-11-08');
  });

  test('une allégée APRÈS la décharge ne la fait pas sauter après coup', () => {
    expect(M.dechargePlanifiee(BLOC, ['2026-11-20'])).toBe(true);
    // Une allégée qui se termine PENDANT la décharge : deux réductions, non.
    expect(M.dechargePlanifiee(BLOC, ['2026-11-04'])).toBe(false);
    // À 14 jours pile : pas « moins de 14 » — la décharge a lieu.
    expect(M.dechargePlanifiee(BLOC, ['2026-10-19'])).toBe(true);
    expect(M.dechargePlanifiee(BLOC, ['2026-10-20'])).toBe(false);
  });

  test('la carte : silencieuse dès 14 jours avant, et jusqu’au dernier jour de la décharge ; un bloc terminé ou sans décharge ne la tait pas', () => {
    expect(M.carteAllegeeAutorisee([BLOC], '2026-10-19')).toBe(false);
    expect(M.carteAllegeeAutorisee([BLOC], '2026-10-18')).toBe(true);
    expect(M.carteAllegeeAutorisee([BLOC], '2026-11-08')).toBe(false);
    expect(M.carteAllegeeAutorisee([BLOC], '2026-11-09')).toBe(true);
    expect(M.carteAllegeeAutorisee([Object.assign({}, BLOC, { statut: 'termine' })], '2026-11-03')).toBe(true);
    expect(M.carteAllegeeAutorisee([Object.assign({}, BLOC, { decharge: false })], '2026-11-03')).toBe(true);
  });

  test('la décharge du jour : la dernière semaine, si elle a lieu', () => {
    expect(M.dechargeDuJour([BLOC], '2026-11-03', [])).toEqual(
      { debut: '2026-11-02', fin: '2026-11-08', semaine: 4, semaines: 4, bloc: null });
    expect(M.dechargeDuJour([BLOC], '2026-11-01', [])).toBe(null);
    expect(M.dechargeDuJour([BLOC], '2026-11-03', ['2026-10-28'])).toBe(null);
    expect(M.periodesDecharge([BLOC], [])).toEqual([{ debut: '2026-11-02', fin: '2026-11-08' }]);
    expect(M.periodesDecharge([Object.assign({}, BLOC, { statut: 'arrete' })], [])).toEqual([]);
  });

  test('les lignes du bloc : une par exercice, datées du début à 00:00, origine « bloc » ; jamais hors Lourd/Mix (I37)', () => {
    let n = 0;
    const l = M.zonesPosees(Object.assign({ id: 'b1' }, BLOC), () => 'z' + (++n), 'u');
    expect(l.map((x) => [x.id, x.exercise_slug, x.zone, x.origine, x.bloc_id, x.user_id]))
      .toEqual([['z1', 'squat_barre', 'mix', 'bloc', 'b1', 'u'], ['z2', 'developpe_couche_barre', 'mix', 'bloc', 'b1', 'u']]);
    const d = new Date(l[0].corrigee_a);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 12, 0, 0]);
    expect(M.zonesPosees(Object.assign({}, BLOC, { zone: 'volume' }), () => 'z')).toEqual([]);
    expect(M.zonesPosees(Object.assign({}, BLOC, { exercices: ['a', 'a', 'b'] }), () => 'z').map((x) => x.exercise_slug))
      .toEqual(['a', 'b']);
  });

  test('⚠️ DISCRIMINANT — une ligne de bloc datée de lundi n’est pas en vigueur avant lundi', () => {
    const lignes = [{ id: '1', exercise_slug: 's', zone: 'lourd', corrigee_a: '2026-09-01T10:00:00Z' },
      { id: '2', exercise_slug: 's', zone: 'mix', corrigee_a: '2026-10-12T00:00:00Z', origine: 'bloc' }];
    expect(M.zoneEnVigueur(lignes, 's', '2026-10-08T10:00:00Z')).toBe('lourd');
    expect(M.zoneEnVigueur(lignes, 's', '2026-10-12T00:00:00Z')).toBe('mix');
    // Sans instant : la lecture d'avant 53-2, inchangée.
    expect(M.zoneEnVigueur(lignes, 's')).toBe('mix');
  });

  test('le bloc suivant ne lit rien du bilan : une règle fixe', () => {
    expect(M.blocSuivant(Object.assign({}, BLOC, { decharge: false, semaines: 6 })))
      .toEqual({ zone: 'lourd', semaines: 6, decharge: true, exercices: ['squat_barre', 'developpe_couche_barre'] });
    expect(M.blocSuivant(Object.assign({}, BLOC, { zone: 'volume' }))).toBe(null);
  });

  test('les exercices par défaut : ni une barre lestée, ni un exercice inconnu', () => {
    const cat = Object.assign({}, CATALOGUE, { dips_lestes: { equipement: 'barre', charge: 'ajoutee',
      muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps', 'deltoide_anterieur'] } });
    expect(M.exercicesParDefaut(['dips_lestes', 'inconnu', 'squat_barre'], cat)).toEqual(['squat_barre']);
  });

  test('le progrès du bilan : plus lourd, ou plus de reps à la même charge', () => {
    const b = M.bilanDuBloc(F.cas.bilan[0].bloc, F.cas.bilan[0].seances, F.cas.bilan[0].paris);
    expect(M.progresDuBilan(b)).toBe(1);
    expect(M.progresDuBilan({ exercices: { a: { premiere: [100, 6], derniere: [100, 7] },
      b: { premiere: [100, 6], derniere: [97.5, 8] } } })).toBe(1);
  });

  test('le bloc en cours d’un dossier, et les exercices d’un bloc en cours au jour', () => {
    const b = Object.assign({ dossier: 'Force' }, BLOC);
    expect(M.blocEnCours([b], 'Force')).toBe(b);
    expect(M.blocEnCours([b], 'Autre')).toBe(null);
    expect(M.exercicesEnBloc([b], '2026-10-20')).toEqual({ squat_barre: true, developpe_couche_barre: true });
    expect(M.exercicesEnBloc([b], '2026-10-05')).toEqual({});
    expect(M.blocTermine(b, '2026-11-08')).toBe(false);
    expect(M.blocTermine(b, '2026-11-09')).toBe(true);
  });
});

describe('53-2 — ce que le programme dit', () => {
  const BLOC = F.cas.semaine_du_bloc[0].bloc;
  test('le badge : la semaine au calendrier, avant et après', () => {
    expect(norm(M.badgeDuBloc(BLOC, '2026-10-19'))).toBe('Bloc Mix · semaine 2 sur 4');
    expect(norm(M.badgeDuBloc(BLOC, '2026-10-08'))).toBe('Bloc Mix · dès le lundi 12 oct.');
    expect(norm(M.badgeDuBloc(BLOC, '2026-11-09'))).toBe('Bloc Mix terminé');
  });
  test('le bandeau de la décharge : sans carte, jamais « requise »', () => {
    const b = norm(M.bandeauDecharge(4, 4));
    expect(b).toBe('Semaine 4 sur 4 : la décharge prévue par ton programme. Mêmes charges, moins de séries, loin de l’échec.');
    expect(/scienti|requis|obligatoire|il faut/i.test(b)).toBe(false);
  });
  test('la carte de fin de bloc : le bilan en faits, les paris, le bloc suivant et ses trois gestes', () => {
    const c = F.cas.bilan[0];
    const k = M.carteFinDeBloc(c.bloc, M.bilanDuBloc(c.bloc, c.seances, c.paris),
      { squat_barre: 'Squat (Barre)', developpe_couche_barre: 'Développé Couché (Barre)' }, null);
    expect(norm(k.titre)).toBe('Ton bloc Mix est terminé.');
    // Deux colonnes (maquette cycles v1) : le nom, puis la première et la dernière charge.
    expect(k.entete).toBe('Pendant ce bloc');
    expect(k.lignes.map((l) => [l.nom, norm(l.valeur)])).toEqual([['Squat (Barre)', '110 kg × 6 → 112,5 kg × 6'],
      ['Développé Couché (Barre)', '112,5 kg × 6, inchangé']]);
    expect(norm(k.paris)).toBe('Le coach avait fait 4 paris sur ce bloc : 2 ont tenu.');
    expect(k.pari).toBe(null);
    // §9.22 (53-2 bis, D3) — la règle, sans jargon.
    expect(norm(k.suivant)).toBe('Le suivant, comme le font les programmes de force : Lourd (3-5) sur tes mouvements ' +
      'à la barre, 4 semaines, décharge la dernière semaine. Les autres exercices gardent leur zone.');
    expect(k.suivantZone).toBe('Lourd (3-5)');
    expect(/accumulation|transmutation|réalisation/i.test(k.suivant)).toBe(false);
    expect([k.commencer, k.ajuster, k.arreter]).toEqual(['Commencer le bloc Lourd', 'Ajuster le bloc', 'Arrêter le programme']);
    const avecPari = M.carteFinDeBloc(c.bloc, M.bilanDuBloc(c.bloc, c.seances, c.paris), {}, { predite: 2, observee: 1 });
    expect(norm(avecPari.pari)).toBe('Le coach avait parié que tes 2 exercices progresseraient : 1 a progressé.');
  });
});

// ══ 3. LE PLAN : LA DÉCHARGE PLANIFIÉE, LA CARTE QUI SE TAIT, LE SCHÉMA ══════
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const NB = String.fromCharCode(160);

const DEBUT_SEANCE = '2026-11-03T10:00:00+00:00';   // semaine 4 sur 4 du bloc
const BLOC_PLAN = { id: 'b1', dossier: 'Force', zone: 'lourd', debut: '2026-10-12', semaines: 4, decharge: true,
  statut: 'en_cours', exercices: ['couche'], precedent: null };
const K_LOURD = { etat: 'test_propose', zone: 'lourd', palier: 125, niveau: 5, n: 4,
  ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} };
function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 4 });
  const k = Object.assign({}, K_LOURD, opt.consigne || {});
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: opt.compteur === undefined ? 0 : opt.compteur, meilleur: { palier: 125, niveau: 5 }, blocages: [] },
    repli: null };
  const e = { seance: { id: 'S1', debut: opt.debut || DEBUT_SEANCE, edition: false, exercices: se.exercices },
    consignes: { couche: c }, reglage: 'normal', paris: [], suites: {}, phase: 'maintien', catalogue: null,
    escalier: { cartes: opt.cartes || [], compteurs: opt.compteurs || [], noms: { couche: 'Développé Couché (Barre)' },
                seriesRoutine: { couche: 4 }, marches: [] },
    programme: { blocs: opt.blocs === undefined ? [BLOC_PLAN] : opt.blocs, lignes: opt.lignes || [] } };
  return { e, p: T.planDeSeance(e) };
}
const accepteeFinie = (fin) => ({ seance: 'A', jour: '2026-10-20', declencheur: 'x', compteur: 4, reponse: 'acceptee',
  debut: M.jourCivil(new Date(Date.parse(fin + 'T12:00:00Z') - 6 * 86400000).toISOString()), fin, cites: ['x'] });

describe('53-2 — la décharge planifiée, dans le plan', () => {
  test('⚠️ DISCRIMINANT — semaine 4 sur 4 : la semaine allégée, SANS carte, avec son bandeau ; 60 % des séries', () => {
    const { e, p } = decor();
    expect(p.carte).toBe(null);
    expect([p.allegee.source, p.allegee.debut, p.allegee.fin, p.allegee.semaine, p.allegee.semaines])
      .toEqual(['decharge_planifiee', '2026-11-02', '2026-11-08', 4, 4]);
    expect(norm(p.allegee.bandeau)).toBe('Semaine 4 sur 4 : la décharge prévue par ton programme. ' +
      'Mêmes charges, moins de séries, loin de l’échec.');
    const x = p.exercices[0];
    expect(x.consigne.allegee).toEqual({ series: 2, routine: 4, decharge: true, semaine: 4, semaines: 4 });
    // La décharge du programme se nomme (maquette cycles v1, « Semaine de décharge »).
    expect(norm(x.entete.gris)).toBe(
      'Semaine de décharge : mêmes charges, moins de séries. 2 séries au lieu de 4, cette semaine.');
    expect(x.lignes.filter((l) => l.role !== 'hors').length).toBe(2);
    expect([x.consigne.ligne.charge, x.consigne.ligne.vise, x.consigne.haut]).toEqual([125, 3, null]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('la semaine 3 : rien', () => {
    expect(decor({ debut: '2026-10-28T10:00:00+00:00' }).p.allegee).toBe(null);
  });
  test('⚠️ DISCRIMINANT — une semaine allégée finie 5 jours avant : la décharge saute (pas de cumul)', () => {
    const { e, p } = decor({ cartes: [accepteeFinie('2026-10-28')] });
    expect(p.allegee).toBe(null);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('sans programme, ou bloc sans décharge : la séance normale', () => {
    expect(decor({ blocs: [] }).p.allegee).toBe(null);
    expect(decor({ blocs: [Object.assign({}, BLOC_PLAN, { decharge: false })] }).p.allegee).toBe(null);
  });
});

describe('53-2 — « Changer de schéma » se tait dans un bloc (I39)', () => {
  test('⚠️ DISCRIMINANT — zone force, 1er déclenchement : le schéma sans bloc, le silence dans un bloc', () => {
    const hors = decor({ compteur: 4, debut: '2026-10-20T10:00:00+00:00', blocs: [] });
    expect(hors.p.exercices[0].escalier.marche).toBe('schema');
    const dans = decor({ compteur: 4, debut: '2026-10-20T10:00:00+00:00' });
    expect(dans.p.exercices[0].escalier.marche).toBe('silence');
    expect(dans.p.programme.enBloc).toEqual({ couche: true });
    expect(T.verifierPlan(dans.p, dans.e).erreurs).toEqual([]);
  });
  test('violation forgée : « Changer de schéma » dans un bloc en cours → I39', () => {
    const { e, p } = decor({ compteur: 4, debut: '2026-10-20T10:00:00+00:00' });
    const f = JSON.parse(JSON.stringify(p));
    f.exercices[0].escalier = { marche: 'schema', n: 1, compteur: 4, declenchement: true, zone: 'lourd' };
    expect(T.verifierPlan(f, e).erreurs.filter((x) => /^I39/.test(x)).length).toBe(1);
  });
});

describe('53-2 — I36 à I38 : violations forgées', () => {
  const minuit = (j) => { const [y, m, d] = j.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };
  const LIGNE = { id: 'z1', exercise_slug: 'couche', zone: 'lourd', corrigee_a: minuit('2026-10-12'), origine: 'bloc', bloc_id: 'b1' };
  const erreurs = (o) => { const d = decor(Object.assign({ debut: '2026-10-20T10:00:00+00:00' }, o)); return T.verifierPlan(d.p, d.e).erreurs; };
  test('les lignes justes du bloc : aucune erreur', () => {
    expect(erreurs({ lignes: [LIGNE, { id: 'z2', exercise_slug: 'couche', zone: 'mix', corrigee_a: '2026-10-21T19:00:00Z' }] })).toEqual([]);
  });
  test('I36 — un exercice hors du bloc, une autre zone, une autre date, un bloc inconnu', () => {
    expect(erreurs({ lignes: [Object.assign({}, LIGNE, { exercise_slug: 'squat' })] }).filter((x) => /^I36/.test(x)).length).toBe(1);
    expect(erreurs({ lignes: [Object.assign({}, LIGNE, { zone: 'mix' })] }).filter((x) => /^I36/.test(x)).length).toBe(1);
    expect(erreurs({ lignes: [Object.assign({}, LIGNE, { corrigee_a: minuit('2026-10-13') })] }).filter((x) => /^I36/.test(x)).length).toBe(1);
    expect(erreurs({ lignes: [Object.assign({}, LIGNE, { bloc_id: 'b9' })] }).filter((x) => /^I36/.test(x)).length).toBe(1);
  });
  test('I37 — une zone de bloc hors Lourd/Mix', () => {
    expect(erreurs({ blocs: [Object.assign({}, BLOC_PLAN, { zone: 'volume' })] }).filter((x) => /^I37/.test(x)).length).toBe(1);
    expect(erreurs({ lignes: [Object.assign({}, LIGNE, { zone: 'volume' })] }).filter((x) => /^I37/.test(x)).length).toBe(1);
  });
  test('I38 — une décharge qui suit de 5 jours une allégée, une carte autour de la décharge', () => {
    const { e, p } = decor({ cartes: [accepteeFinie('2026-10-28')] });
    const f = JSON.parse(JSON.stringify(p));
    f.allegee = { source: 'decharge_planifiee', debut: '2026-11-02', fin: '2026-11-08', semaine: 4, semaines: 4, bandeau: 'x' };
    expect(T.verifierPlan(f, e).erreurs.filter((x) => /^I38/.test(x)).length).toBe(1);
    const g = decor({ debut: '2026-10-23T10:00:00+00:00' });
    const h = JSON.parse(JSON.stringify(g.p));
    h.carte = { jour: '2026-10-23', declencheur: 'couche', compteur: 4, cites: ['couche'], phrase: 'x', detail: 'y' };
    expect(T.verifierPlan(h, g.e).erreurs.filter((x) => /^I38/.test(x)).length).toBe(1);
  });
});

// ══ 53-2 bis (D3) — LE DÉBUT, LA FIN, L'ARRÊT ET LE PARI (§9.22, 06/10/2026) ══

describe('53-2 bis — le début différé : avant son début, un bloc ne change rien', () => {
  const BLOC = Object.assign({ id: 'b1', dossier: 'Force' }, F.cas.semaine_du_bloc[0].bloc);   // lundi 12 oct.
  const AVANT = { id: 'p', exercise_slug: 'squat_barre', zone: 'lourd', corrigee_a: '2026-09-01T10:00:00', origine: 'personne' };
  test('⚠️ DISCRIMINANT — le jeudi 8 : le badge « dès le lundi 12 oct. », la zone d’avant, aucun exercice en bloc', () => {
    expect(norm(M.badgeDuBloc(BLOC, '2026-10-08'))).toBe('Bloc Mix · dès le lundi 12 oct.');
    const lignes = [AVANT].concat(M.zonesPosees(BLOC, (() => { let n = 0; return () => 'z' + (++n); })(), 'u'));
    expect(M.zoneEnVigueur(lignes, 'squat_barre', '2026-10-08T18:00:00')).toBe('lourd');
    expect(M.zoneEnVigueur(lignes, 'squat_barre', '2026-10-12T08:00:00')).toBe('mix');
    expect(M.exercicesEnBloc([BLOC], '2026-10-11')).toEqual({});
    expect(M.exercicesEnBloc([BLOC], '2026-10-12')).toEqual({ squat_barre: true, developpe_couche_barre: true });
    expect(M.dechargeDuJour([BLOC], '2026-10-08', [])).toBe(null);
  });
  test('dans le plan : avant le début, « Changer de schéma » reste proposé', () => {
    const b = Object.assign({}, BLOC_PLAN, { debut: '2026-10-26' });
    const { e, p } = decor({ compteur: 4, debut: '2026-10-20T10:00:00+00:00', blocs: [b] });
    expect(p.programme.enBloc).toEqual({});
    expect(p.exercices[0].escalier.marche).toBe('schema');
    expect(p.allegee).toBe(null);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

describe('53-2 bis — entre la fin et le choix : rien ne change sans la personne', () => {
  const BLOC = Object.assign({ id: 'b1', dossier: 'Force' }, F.cas.semaine_du_bloc[0].bloc);   // fini le 8 nov.
  const lignes = M.zonesPosees(BLOC, (() => { let n = 0; return () => 'z' + (++n); })(), 'u');
  test('⚠️ DISCRIMINANT — le 12 nov. : les zones du bloc tiennent, aucune décharge de plus, « Bloc Mix terminé »', () => {
    expect(M.blocTermine(BLOC, '2026-11-12')).toBe(true);
    expect(M.zoneEnVigueur(lignes, 'squat_barre', '2026-11-12T18:00:00')).toBe('mix');
    expect(M.zoneEnVigueur(lignes, 'squat_barre', '2026-12-20T18:00:00')).toBe('mix');
    expect(M.dechargeDuJour([BLOC], '2026-11-12', [])).toBe(null);
    expect(M.dechargeDuJour([BLOC], '2026-11-30', [])).toBe(null);
    expect(norm(M.badgeDuBloc(BLOC, '2026-11-12'))).toBe('Bloc Mix terminé');
    // Le bloc compte jusqu'au choix : « Changer de schéma » se tait encore.
    expect(M.exercicesEnBloc([BLOC], '2026-11-12')).toEqual({ squat_barre: true, developpe_couche_barre: true });
    // Le choix fait (terminé, arrêté) : il ne compte plus.
    expect(M.exercicesEnBloc([Object.assign({}, BLOC, { statut: 'termine' })], '2026-11-12')).toEqual({});
    expect(M.exercicesEnBloc([Object.assign({}, BLOC, { statut: 'arrete' })], '2026-11-12')).toEqual({});
  });
  test('dans le plan, la semaine d’après la fin : ni décharge, ni « Changer de schéma »', () => {
    const { e, p } = decor({ compteur: 4, debut: '2026-11-12T10:00:00+00:00' });
    expect(p.allegee).toBe(null);
    expect(p.carte).toBe(null);
    expect(p.programme.enBloc).toEqual({ couche: true });
    expect(p.exercices[0].escalier.marche).toBe('silence');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

// Les gestes de l'app (Commencer, Ajuster, Arrêter), rejoués dans un bac : les
// vraies fonctions de `app.js`, le vrai moteur, la file remplacée par un relevé.
describe('53-2 bis — les gestes : le pari, l’arrêt', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const extraire = (nom) => {
    const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
    if (!m) throw new Error('introuvable : ' + nom);
    return m[0];
  };
  const minuit = (j) => { const [y, m, d] = j.split('-').map(Number); return new Date(y, m - 1, d).toISOString(); };
  function bac(o) {
    let n = 0;
    const releve = { paris: [], blocs: [], lignes: [], observes: [] };
    const ctx = {
      Moteur: M, Date, Object, JSON,
      local: { blocs: (o.blocs || []).slice(), zones: (o.zones || []).slice() },
      programmeEnCours: o.programme || null,
      uuid: () => 'id' + (++n), idUtilisateur: () => 'u',
      instantDuJour: () => o.instant, jourDuJour: () => M.jourCivil(o.instant),
      lundiQuiSuit: () => '2026-10-26',
      poserBloc: async (b) => {
        releve.blocs.push(b);
        ctx.local.blocs = ctx.local.blocs.filter((x) => x.id !== b.id).concat([b]);
      },
      poserLignesDeZone: async (l, dep) => { releve.lignes.push.apply(releve.lignes, l.map((x) => Object.assign({ dep }, x))); ctx.local.zones = ctx.local.zones.concat(l); },
      poserPariDeProgramme: async (b, p) => { releve.paris.push({ bloc: b.id, precedent: p.id }); },
      observerPariDeProgramme: async (b) => { releve.observes.push(b.id); },
      rendreSaisie: () => {}, fermerVoile: () => {}, rendreFeuilleProgramme: () => {}
    };
    vm.createContext(ctx);
    ['creerBloc', 'terminerBloc', 'commencerBlocSuivant', 'validerProgramme', 'arreterProgramme', 'zonesLues']
      .forEach((f) => vm.runInContext(extraire(f), ctx));
    return { ctx, releve, run: (code) => vm.runInContext(code, ctx) };
  }
  const MIX = { id: 'b1', user_id: 'u', dossier: 'Force', zone: 'mix', debut: '2026-10-12', semaines: 4, decharge: true,
    exercices: ['squat', 'couche'], statut: 'en_cours', precedent: null };
  const lignesMix = [
    { id: 'l1', exercise_slug: 'squat', zone: 'mix', corrigee_a: minuit('2026-10-12'), origine: 'bloc', bloc_id: 'b1' },
    { id: 'l2', exercise_slug: 'couche', zone: 'mix', corrigee_a: minuit('2026-10-12'), origine: 'bloc', bloc_id: 'b1' }];

  test('⚠️ DISCRIMINANT — « Commencer le bloc Lourd » : le bloc proposé, tel quel, porte un pari', async () => {
    const b = bac({ blocs: [MIX], zones: lignesMix, instant: '2026-11-10T18:00:00.000Z' });
    await b.run('commencerBlocSuivant("Force")');
    expect(b.releve.paris).toEqual([{ bloc: 'id1', precedent: 'b1' }]);
    expect(b.ctx.local.blocs.find((x) => x.id === 'id1').zone).toBe('lourd');
    expect(b.ctx.local.blocs.find((x) => x.id === 'b1').statut).toBe('termine');
  });
  test('⚠️ DISCRIMINANT — « Ajuster le bloc » : un bloc ajusté ne porte pas de pari', async () => {
    const programme = { dossier: 'Force', precedent: MIX, zone: 'lourd', semaines: 4, decharge: true, debut: 'aujourdhui',
      slugs: ['squat', 'couche'], coches: { squat: true, couche: true }, erreur: '' };
    const b = bac({ blocs: [MIX], zones: lignesMix, instant: '2026-11-10T18:00:00.000Z', programme });
    await b.run('validerProgramme()');
    expect(b.releve.paris).toEqual([]);
    expect(b.ctx.local.blocs.filter((x) => x.statut === 'en_cours').map((x) => x.zone)).toEqual(['lourd']);
    // Même ajusté sans rien changer : le geste est « Ajuster », pas « Commencer ».
  });
  test('le premier bloc : aucun pari', async () => {
    const programme = { dossier: 'Force', precedent: null, zone: 'mix', semaines: 4, decharge: true, debut: 'lundi',
      slugs: ['squat'], coches: { squat: true }, erreur: '' };
    const b = bac({ instant: '2026-10-20T18:00:00.000Z', programme });
    await b.run('validerProgramme()');
    expect(b.releve.paris).toEqual([]);
    expect(b.releve.blocs[0].debut).toBe('2026-10-26');
  });

  test('⚠️ DISCRIMINANT — l’arrêt en plein bloc : une ligne sans zone, origine « bloc », datée de l’arrêt ; la correction de la personne reste', async () => {
    const correction = { id: 'p1', exercise_slug: 'couche', zone: 'lourd', corrigee_a: '2026-10-21T19:00:00.000Z', origine: 'personne' };
    const b = bac({ blocs: [MIX], zones: lignesMix.concat([correction]), instant: '2026-10-27T18:00:00.000Z' });
    await b.run('arreterProgramme("Force")');
    expect(b.releve.lignes).toEqual([{ dep: 'b1', id: 'id1', user_id: 'u', exercise_slug: 'squat', zone: null,
      corrigee_a: '2026-10-27T18:00:00.000Z', origine: 'bloc', bloc_id: 'b1' }]);
    expect(b.ctx.local.blocs[0].statut).toBe('arrete');
    expect(b.releve.observes).toEqual([]);
    const z = b.ctx.local.zones;
    expect(M.zoneEnVigueur(z, 'squat', '2026-10-28T10:00:00Z')).toBe(null);     // la zone d'après ses séances
    expect(M.zoneEnVigueur(z, 'couche', '2026-10-28T10:00:00Z')).toBe('lourd'); // sa correction reste
  });
  test('sans correction de la personne : chaque exercice du bloc retrouve la zone d’après ses séances', async () => {
    const b = bac({ blocs: [MIX], zones: lignesMix, instant: '2026-10-27T18:00:00.000Z' });
    await b.run('arreterProgramme("Force")');
    expect(b.releve.lignes.map((l) => [l.exercise_slug, l.zone, l.origine, l.bloc_id])).toEqual([
      ['squat', null, 'bloc', 'b1'], ['couche', null, 'bloc', 'b1']]);
    expect(['squat', 'couche'].map((s) => M.zoneEnVigueur(b.ctx.local.zones, s, '2026-10-28T10:00:00Z'))).toEqual([null, null]);
  });
  test('l’arrêt à la fin du bloc : le bloc se termine (son pari s’observe), les zones reviennent', async () => {
    const b = bac({ blocs: [MIX], zones: lignesMix, instant: '2026-11-12T18:00:00.000Z' });
    await b.run('arreterProgramme("Force")');
    expect(b.ctx.local.blocs[0].statut).toBe('termine');
    expect(b.releve.observes).toEqual(['b1']);
    expect(b.releve.lignes.length).toBe(2);
  });
  test('⚠️ DISCRIMINANT — l’arrêt AVANT le début : rien ne s’écrit, et les lignes du bloc ne prennent jamais effet', async () => {
    const avant = { id: 'p0', exercise_slug: 'squat', zone: 'lourd', corrigee_a: '2026-09-01T10:00:00.000Z', origine: 'personne' };
    const b = bac({ blocs: [MIX], zones: lignesMix.concat([avant]), instant: '2026-10-08T18:00:00.000Z' });
    await b.run('arreterProgramme("Force")');
    expect(b.releve.lignes).toEqual([]);
    expect(b.ctx.local.blocs[0].statut).toBe('arrete');
    const lues = b.run('zonesLues()');
    expect(M.zoneEnVigueur(lues, 'squat', '2026-10-13T10:00:00Z')).toBe('lourd');   // la zone d'avant, toujours
    expect(M.zoneEnVigueur(lues, 'couche', '2026-10-13T10:00:00Z')).toBe(null);
    // Sans la lecture des lignes valides, le bloc arrêté aurait pris effet le lundi.
    expect(M.zoneEnVigueur(b.ctx.local.zones, 'squat', '2026-10-13T10:00:00Z')).toBe('mix');
  });
  test('les lignes valides : un bloc arrêté en cours garde ses lignes d’avant l’arrêt ; terminé, toutes', () => {
    const arrete = Object.assign({}, MIX, { statut: 'arrete', modifie_a: '2026-10-20T18:00:00.000Z' });
    expect(M.lignesDeZoneValides(lignesMix, [arrete]).map((l) => l.id)).toEqual(['l1', 'l2']);
    const avantDebut = Object.assign({}, arrete, { modifie_a: '2026-10-08T18:00:00.000Z' });
    expect(M.lignesDeZoneValides(lignesMix, [avantDebut])).toEqual([]);
    const termine = Object.assign({}, avantDebut, { statut: 'termine' });
    expect(M.lignesDeZoneValides(lignesMix, [termine]).length).toBe(2);
    // Une ligne d'arrêt (sans zone) et une ligne de la personne ne sont jamais écartées.
    const vide = { id: 'v', exercise_slug: 'squat', zone: null, corrigee_a: '2026-10-21T10:00:00Z', origine: 'bloc', bloc_id: 'b1' };
    expect(M.lignesDeZoneValides([vide], [avantDebut])).toEqual([vide]);
  });
  test('après un arrêt avant le début, un nouveau bloc « aujourd’hui » prend effet normalement', async () => {
    const b = bac({ blocs: [MIX], zones: lignesMix, instant: '2026-10-08T18:00:00.000Z' });
    await b.run('arreterProgramme("Force")');
    b.ctx.programmeEnCours = { dossier: 'Force', precedent: null, zone: 'lourd', semaines: 4, decharge: true, debut: 'aujourdhui',
      slugs: ['squat', 'couche'], coches: { squat: true, couche: true }, erreur: '' };
    await b.run('validerProgramme()');
    const lues = b.run('zonesLues()');
    expect(['2026-10-09T10:00:00Z', '2026-10-13T10:00:00Z', '2026-11-20T10:00:00Z'].map((t) => M.zoneEnVigueur(lues, 'squat', t)))
      .toEqual(['lourd', 'lourd', 'lourd']);
  });

  test('I36 — les lignes d’arrêt sont justes ; forgées : l’arrêt d’un bloc encore en cours, ou daté avant son début', () => {
    const arret = { id: 'a1', exercise_slug: 'couche', zone: null, corrigee_a: '2026-10-27T18:00:00Z', origine: 'bloc', bloc_id: 'b1' };
    const LIGNE = { id: 'z1', exercise_slug: 'couche', zone: 'lourd', corrigee_a: minuit('2026-10-12'), origine: 'bloc', bloc_id: 'b1' };
    const arrete = Object.assign({}, BLOC_PLAN, { statut: 'arrete' });
    const err = (o) => { const d = decor(Object.assign({ debut: '2026-10-28T10:00:00+00:00' }, o)); return T.verifierPlan(d.p, d.e).erreurs; };
    expect(err({ blocs: [arrete], lignes: [LIGNE, arret] })).toEqual([]);
    expect(err({ blocs: [BLOC_PLAN], lignes: [LIGNE, arret] }).filter((x) => /^I36/.test(x)).length).toBe(1);
    expect(err({ blocs: [arrete], lignes: [LIGNE, Object.assign({}, arret, { corrigee_a: minuit('2026-10-11') })] })
      .filter((x) => /^I36/.test(x)).length).toBe(1);
    expect(err({ blocs: [arrete], lignes: [LIGNE, Object.assign({}, arret, { exercise_slug: 'squat' })] })
      .filter((x) => /^I36/.test(x)).length).toBe(1);
  });
});
