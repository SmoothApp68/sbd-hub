/** @jest-environment node */
//
// 193-4 (MOTEUR §9.32) — LE PLAN DE LA SEMAINE DE TEST : le vrai chemin (`seance.js`, `planDeSeance`, `verifierPlan` I88 à I93,
// `verifierPhrases` I26).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
require('../../v2/js/generateur.js');

const sp = (t) => String(t).replace(/[  ]/g, ' ');
const [SQ, DC, SDT, DM] = require('../../v2/js/modele.js').BARRES;
const ACC = 'ecartes_poulie';

const FICHES = {
  [SQ]: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['quadriceps'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] },
  [DC]: { nom: 'Développé couché', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] },
  [SDT]: { nom: 'Soulevé de terre', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['ischio_jambiers', 'dos'], muscles_secondaires: ['fessiers'], muscles_stabilisateurs: [] },
  [DM]: { nom: 'Développé militaire', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['deltoides'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] },
  [ACC]: { nom: 'Écartés', equipement: 'poulie', mesure: 'charge_reps', pas: 2.5, muscles_primaires: ['pectoraux'], muscles_secondaires: [], muscles_stabilisateurs: [] }
};

function seance(slugs, n) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: n || 3 }); });
  se.exercices.forEach((ex) => ex.series.forEach((s) => { s.reps_visees = 5; }));
  return se;
}
function entrees(se, test, extra) {
  const consignes = {};
  se.exercices.forEach((ex) => {
    consignes[ex.exercise_slug] = { consigne: { etat: 'progression', zone: 'lourd', palier: 100, n: 3, ligne: { charge: 100, vise: 5 }, haut: null }, contexte: { cran: 102.5, haut: null } };
  });
  const catalogue = {}; se.exercices.forEach((ex) => { catalogue[ex.exercise_slug] = FICHES[ex.exercise_slug]; });
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, routine_id: 'R', exercices: se.exercices },
    consignes, reglage: 'normal', paris: [], objectif: 'les_deux', catalogue,
    semaineDeTest: Object.assign({ debut: '2026-11-02', fin: '2026-11-08', modes: {}, mesures: {}, refus: {}, maxEstimes: { [DC]: 154, [SQ]: 157, [SDT]: 197, [DM]: 73 } }, test || {})
  }, extra || {});
}
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };

describe('193-4 — le plan : la barre testée', () => {
  test('hors de la semaine ou sans entrée : rien', () => {
    const se = seance([DC]);
    expect(T.planDeSeance(entrees(se, { debut: '2026-12-01', fin: '2026-12-07' })).semaineDeTest).toBeNull();
    const e = entrees(se); delete e.semaineDeTest;
    const p = T.planDeSeance(e);
    expect(p.semaineDeTest).toBeNull(); expect(p.exercices[0].semaineDeTest).toBeNull();
  });

  test('couché, un an de pratique : la montée, le 1ᵉʳ essai à 92 %, le pari, le « Pourquoi » (I26 propre)', () => {
    const e = entrees(seance([DC]));
    const p = T.planDeSeance(e);
    const t = p.exercices[0].semaineDeTest;
    expect(t).toMatchObject({ testee: true, mode: 'max', max: 154, etat: 'a_faire', surLesSecurites: true });
    expect(t.montee.map((m) => m.charge)).toEqual([77.5, 92.5, 107.5, 122.5, 135]);
    expect(t.prochain).toMatchObject({ rang: 1, charge: 142.5, reserve: 2 });
    expect(sp(t.consigne.texte)).toBe('Essai 1 : 142,5 kg × 1, en gardant 2 reps, sur les sécurités ou avec un pareur.');
    expect(sp(t.pourquoi.texte)).toMatch(/^Ton max estimé est d’environ 154 kg\./);
    expect(sp(t.pourquoi.texte)).toMatch(/Je parie sur 155 kg\./);
    expect(t.pari).toMatchObject({ module: 'test', grandeur: 'charge_kg', valeur_predite: 155, exercise_slug: DC });
    expect(p.exercices[0].auMax).toBeNull();
    propre(p, e);
  });

  test('moins d’un an : la série au max à ≈ 80 % (jamais d’essai)', () => {
    const e = entrees(seance([DC]), {}, { debutant: true });
    const p = T.planDeSeance(e);
    const t = p.exercices[0].semaineDeTest;
    expect(t.mode).toBe('serie');
    expect(t.prochain).toBeNull();
    expect(t.serie).toMatchObject({ charge: 122.5, visee: [6, 8] });
    propre(p, e);
  });

  test('le choix de la carte prime sur le défaut : « Série au max » avec un an de pratique', () => {
    const e = entrees(seance([DC]), { modes: { [DC]: 'serie' } });
    const t = T.planDeSeance(e).exercices[0].semaineDeTest;
    expect(t.mode).toBe('serie'); expect(t.serie.charge).toBe(130);
    propre(T.planDeSeance(e), e);
  });

  test('les essais faits règlent le suivant : 142,5 facile, 150 facile → 155 ; mesure lue', () => {
    let se = seance([DC], 5);
    const faire = (j, c, reserve, type) => {
      se = S.modifierSerie(se, 0, j, { charge_kg: c, reps: 1 });
      se = S.changerType(se, 0, j, type || 'test');
      se = S.definirEffort(se, 0, j, { rpe: 10 - reserve || 10 });
      se = S.valider(se, 0, j, new Date('2026-11-03T10:' + (10 + j) + ':00Z'));
    };
    faire(0, 142.5, 2); faire(1, 150, 1);
    const e = entrees(se);
    const p = T.planDeSeance(e);
    const t = p.exercices[0].semaineDeTest;
    expect(t.essais).toHaveLength(2);
    expect(t.prochain).toMatchObject({ rang: 3, charge: 155 });
    expect(t.etat).toBe('en_cours');
    propre(p, e);
    faire(2, 155, 0);
    const e2 = entrees(se);
    const p2 = T.planDeSeance(e2);
    const t2 = p2.exercices[0].semaineDeTest;
    expect(t2.etat).toBe('fini');
    expect(t2.prochain).toBeNull();
    expect(t2.mesure).toMatchObject({ valeur: 155, vrai: true, source: 'essai' });
    propre(p2, e2);
  });

  test('« J’ai mal » noté sur un essai : arrêt, rien de plus', () => {
    let se = seance([DC], 5);
    se = S.modifierSerie(se, 0, 0, { charge_kg: 142.5, reps: 1 });
    se = S.changerType(se, 0, 0, 'test');
    se = S.valider(se, 0, 0, new Date('2026-11-03T10:10:00Z'));
    se = S.marquerDouleur(se, 0);
    const e = entrees(se);
    const t = T.planDeSeance(e).exercices[0].semaineDeTest;
    expect(t.etat).toBe('arret'); expect(t.arret).toBe('mal'); expect(t.prochain).toBeNull();
    expect(T.verifierPlan(T.planDeSeance(e), e).erreurs).toEqual([]);
  });

  test('un 1ᵉʳ essai sans marge : on ne monte pas', () => {
    let se = seance([DC], 5);
    se = S.modifierSerie(se, 0, 0, { charge_kg: 142.5, reps: 1 });
    se = S.changerType(se, 0, 0, 'test');
    se = S.definirEffort(se, 0, 0, { rpe: 10 });
    se = S.valider(se, 0, 0, new Date('2026-11-03T10:10:00Z'));
    const t = T.planDeSeance(entrees(se)).exercices[0].semaineDeTest;
    expect(t).toMatchObject({ etat: 'arret', arret: 'sans_marge', prochain: null });
  });

  test('« Pas aujourd’hui » : la barre est écartée aujourd’hui, la suivante est testée', () => {
    const e = entrees(seance([DC, DM]), { refus: { [DC]: '2026-11-03' } });
    const p = T.planDeSeance(e);
    expect(p.exercices[0].semaineDeTest.testee).toBe(false);
    expect(p.exercices[1].semaineDeTest.testee).toBe(true);
    propre(p, e);
  });

  test('un seul mouvement par jour ; squat et soulevé jamais ensemble ; l’autre reste normal', () => {
    const e = entrees(seance([SQ, SDT, DC]));
    const p = T.planDeSeance(e);
    const ts = p.exercices.map((x) => x.semaineDeTest);
    expect(ts.filter((t) => t.testee)).toHaveLength(1);
    expect(ts[0].testee).toBe(true);
    expect(ts[1]).toMatchObject({ testee: false, conflit: true });
    expect(ts[2].testee).toBe(false);
    expect(p.semaineDeTest.testee).toBe(SQ);
    propre(p, e);
  });

  test('200-2 — une barre non testée aujourd’hui porte « pas de test », jamais « accessoire »', () => {
    const e = entrees(seance([DC, SQ]));
    const p = T.planDeSeance(e);
    expect(p.exercices[0].semaineDeTest.testee).toBe(true);
    expect(p.exercices[1].semaineDeTest).toMatchObject({ testee: false, pasDeTest: true });
    expect(p.exercices[1].semaineDeTest.accessoire).toBeUndefined();
    const acc = T.planDeSeance(entrees(seance([DC, ACC]))).exercices[1].semaineDeTest;
    expect(acc.accessoire).toBe(true); expect(acc.pasDeTest).toBeUndefined();
    propre(p, e);
  });

  test('une barre déjà mesurée cette semaine n’est plus testée (sauf la séance qui l’a mesurée)', () => {
    const a = T.planDeSeance(entrees(seance([DC, DM]), { mesures: { [DC]: { valeur: 157.5, le: '2026-11-02', seance: 'autre' } } }));
    expect(a.exercices[0].semaineDeTest.testee).toBe(false);
    expect(a.exercices[1].semaineDeTest.testee).toBe(true);
    const b = T.planDeSeance(entrees(seance([DC, DM]), { mesures: { [DC]: { valeur: 157.5, le: '2026-11-03', seance: 'S' } } }));
    expect(b.exercices[0].semaineDeTest.testee).toBe(true);
  });

  test('les accessoires : 1 à 2 gardés, sans « Au max » (la routine l’avait marqué)', () => {
    const se = seance([DC, ACC, ACC + '', 'tractions_pronation']);
    // une marque « Au max » de routine sur l'accessoire
    se.exercices[1].series[2].au_max = true;
    const e = entrees(se);
    e.catalogue.tractions_pronation = FICHES[ACC];
    const p = T.planDeSeance(e);
    expect(p.exercices[1].auMax).toBeNull(); expect(p.exercices[1].propositionAuMax).toBeNull();
    expect(p.exercices.filter((x) => x.semaineDeTest && x.semaineDeTest.accessoire && x.semaineDeTest.garde).length).toBeLessThanOrEqual(M.TEST_ACCESSOIRES_MAX);
    propre(p, e);
  });

  test('sans max estimé : rien à proposer, dit', () => {
    const e = entrees(seance([DC]), { maxEstimes: {} });
    expect(T.planDeSeance(e).exercices[0].semaineDeTest).toMatchObject({ testee: true, etat: 'sans_max', prochain: null, serie: null });
  });

  test('Juste un carnet : le coach se tait', () => {
    const e = entrees(seance([DC]), null, { intention: 'entretien' });
    expect(T.planDeSeance(e).semaineDeTest).toBeNull();
  });

  test('les invariants I88 à I93 voient un plan mal posé', () => {
    const e = entrees(seance([DC]));
    const mal = (f) => { const p = T.planDeSeance(e); f(p.exercices[0].semaineDeTest, p); return T.verifierPlan(p, e).erreurs.join('\n'); };
    expect(mal((t) => { t.prochain.rang = 4; })).toMatch(/I88/);
    expect(mal((t) => { t.prochain.charge = 100; })).toMatch(/I90/);
    expect(mal((t) => { t.montee[2].charge = 60; })).toMatch(/I90/);
    expect(mal((t) => { t.etat = 'arret'; })).toMatch(/I92/);
    expect(mal((t) => { t.pari.valeur_predite = 120; })).toMatch(/I93/);
    expect(mal((t) => { t.pari.module = 'consigne'; })).toMatch(/I93/);
    expect(mal((t, p) => { p.exercices[0].auMax = { reserve: 0 }; })).toMatch(/I91/);
    const e2 = entrees(seance([SQ, SDT]));
    const p2 = T.planDeSeance(e2);
    p2.exercices[1].semaineDeTest = Object.assign({}, p2.exercices[0].semaineDeTest, { slug: SDT, classe: 'souleve' });
    expect(T.verifierPlan(p2, e2).erreurs.join('\n')).toMatch(/I89/);
  });
});

describe('193-4 — « Ajouter ces lignes » : la montée, puis les essais un à un', () => {
  test('au début : la montée (échauffements) et le 1ᵉʳ essai en type test, aux charges du plan', () => {
    const e = entrees(seance([DC]));
    const aj = T.planDeSeance(e).exercices[0].semaineDeTest.ajout;
    expect(aj.suite).toBe(false);
    expect(aj.lignes.map((l) => [l.type, l.charge, l.reps])).toEqual([
      ['echauffement', 77.5, 5], ['echauffement', 92.5, 3], ['echauffement', 107.5, 2], ['echauffement', 122.5, 1], ['echauffement', 135, 1], ['test', 142.5, 1]]);
  });

  test('posées par Seance.insererChauffes : avant le travail, marquées ; rien de plus tant qu’elles sont vides ; Annuler les retire', () => {
    let se = seance([DC], 3);
    const aj = T.planDeSeance(entrees(se)).exercices[0].semaineDeTest.ajout;
    const lignes = aj.lignes.map((q) => Object.assign([q.charge, q.reps], { test: true, type: q.type, reserve: q.reserve }));
    let k = 100; se = S.insererChauffes(se, 0, lignes, () => 'n' + (++k));
    const types = se.exercices[0].series.map((s) => s.type_serie);
    expect(types).toEqual(['echauffement', 'echauffement', 'echauffement', 'echauffement', 'echauffement', 'test', 'travail', 'travail', 'travail']);
    expect(se.exercices[0].series[5].charge_kg).toBe(142.5);
    const p = T.planDeSeance(entrees(se));
    expect(p.exercices[0].semaineDeTest.ajout).toBeNull();
    expect(p.exercices[0].semaineDeTest.videsPosees).toBe(6);
    expect(S.retirerLignesDeTest(se, 0).exercices[0].series).toHaveLength(3);
  });

  test('l’essai suivant s’ajoute quand le précédent est validé, juste après lui', () => {
    let se = seance([DC], 3);
    const aj = T.planDeSeance(entrees(se)).exercices[0].semaineDeTest.ajout;
    let k = 100; se = S.insererChauffes(se, 0, aj.lignes.map((q) => Object.assign([q.charge, q.reps], { test: true, type: q.type })), () => 'n' + (++k));
    for (let j = 0; j < 6; j++) {
      se = S.modifierSerie(se, 0, j, { charge_kg: se.exercices[0].series[j].charge_kg, reps: j === 5 ? 1 : se.exercices[0].series[j].reps_visees });
      if (j === 5) se = S.definirEffort(se, 0, j, { rpe: 8 });
      se = S.valider(se, 0, j, new Date('2026-11-03T10:' + (10 + j) + ':00Z'));
    }
    const e = entrees(se);
    const p = T.planDeSeance(e);
    const t = p.exercices[0].semaineDeTest;
    expect(t.ajout.suite).toBe(true);
    expect(t.ajout.lignes).toEqual([expect.objectContaining({ type: 'test', charge: 150 })]);
    propre(p, e);
    se = S.insererChauffes(se, 0, [Object.assign([150, 1], { test: true, type: 'test' })], () => 'z1', 'test');
    expect(se.exercices[0].series.map((s) => s.type_serie).slice(5, 8)).toEqual(['test', 'test', 'travail']);
  });

  test('série au max : une ligne de travail marquée avec sa réserve demandée', () => {
    const e = entrees(seance([SDT]), { modes: { [SDT]: 'serie' } });
    const aj = T.planDeSeance(e).exercices[0].semaineDeTest.ajout;
    const derniere = aj.lignes[aj.lignes.length - 1];
    expect(derniere).toMatchObject({ type: 'travail', reserve: 1 });
    let se = seance([SDT], 3);
    se = S.insererChauffes(se, 0, aj.lignes.map((q) => Object.assign([q.charge, q.reps], { test: true, type: q.type, reserve: q.reserve })), () => 'q' + Math.random());
    const posee = se.exercices[0].series.filter((s) => s.test_pose && s.type_serie === 'travail')[0];
    expect(posee).toMatchObject({ au_max: true, au_max_reserve: 1 });
  });
});
