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
    expect(sp(t.consigne.texte)).toBe('Essai 1 : 142,5 kg × 1, avec 2 en réserve, sur les sécurités ou avec un pareur.');
    expect(sp(t.pourquoi.texte)).toMatch(/^Ton max estimé est d’environ 154 kg\./);
    expect(sp(t.pourquoi.texte)).toMatch(/Je parie sur 155 kg\./);
    expect(t.pari).toMatchObject({ module: 'test', grandeur: 'charge_kg', valeur_predite: 155, exercise_slug: DC });
    expect(p.exercices[0].auMax).toBeUndefined();
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

  test('202 — 65 ans et plus : le défaut est « Série au max » ; un âge inconnu ou plus jeune : « Viser mon max »', () => {
    const e = entrees(seance([DC]), {}, { plus65: true });
    const p = T.planDeSeance(e);
    expect(p.exercices[0].semaineDeTest.mode).toBe('serie');
    propre(p, e);
    expect(T.planDeSeance(entrees(seance([DC]), {}, { plus65: null })).exercices[0].semaineDeTest.mode).toBe('max');
    expect(T.planDeSeance(entrees(seance([DC]), {}, { plus65: false })).exercices[0].semaineDeTest.mode).toBe('max');
  });

  test('27/11/2026 — objectif Forme : la série de mesure par défaut, I90 vérifie ; « Viser mon max » choisi est gardé ; les autres buts : « Viser mon max »', () => {
    const e = entrees(seance([DC]), {}, { objectif: 'forme' });
    const p = T.planDeSeance(e);
    expect(p.exercices[0].semaineDeTest.mode).toBe('serie');
    propre(p, e);
    const c = entrees(seance([DC]), { modes: { [DC]: 'max' } }, { objectif: 'forme' });
    expect(T.planDeSeance(c).exercices[0].semaineDeTest.mode).toBe('max');
    propre(T.planDeSeance(c), c);
    ['force', 'muscle', 'les_deux', 'calisthenie'].forEach((o) => expect(T.planDeSeance(entrees(seance([DC]), {}, { objectif: o })).exercices[0].semaineDeTest.mode).toBe('max'));
  });

  test('202 — un max tiré de plus de 5 reps : « Série au max » ; de 5 reps ou sans reps connues : « Viser mon max »', () => {
    const avec = (reps) => entrees(seance([DC]), { seriesDuMax: { [DC]: reps === null ? null : { charge: 130, reps } } });
    const mode = (e) => T.planDeSeance(e).exercices[0].semaineDeTest.mode;
    expect([mode(avec(8)), mode(avec(6)), mode(avec(5)), mode(avec(3)), mode(avec(null))]).toEqual(['serie', 'serie', 'max', 'max', 'max']);
    propre(T.planDeSeance(avec(8)), avec(8));
  });

  test('202 — le choix de la carte prime sur le défaut prudent, et I90 voit une façon qui n’est ni choisie ni celle du défaut', () => {
    const e = entrees(seance([DC]), { modes: { [DC]: 'max' }, seriesDuMax: { [DC]: { charge: 130, reps: 8 } } }, { plus65: true });
    const p = T.planDeSeance(e);
    expect(p.exercices[0].semaineDeTest.mode).toBe('max');
    propre(p, e);
    const e2 = entrees(seance([DC]), { seriesDuMax: { [DC]: { charge: 130, reps: 8 } } });
    const p2 = T.planDeSeance(e2);
    p2.exercices[0].semaineDeTest.mode = 'max';
    expect(T.verifierPlan(p2, e2).erreurs.join(' ')).toMatch(/I90.*n’est pas celle du défaut/);
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
    expect(p.exercices[1].auMax).toBeUndefined(); expect(p.exercices[1].propositionAuMax).toBeUndefined();
    expect(p.exercices.filter((x) => x.semaineDeTest && x.semaineDeTest.accessoire && x.semaineDeTest.garde).length).toBeLessThanOrEqual(M.TEST_ACCESSOIRES_MAX);
    propre(p, e);
  });

  test('sans max estimé : pas d’essai, dit (19/11/2026 : la barre ne prend plus le créneau)', () => {
    const e = entrees(seance([DC]), { maxEstimes: {} });
    const p = T.planDeSeance(e);
    expect(p.exercices[0].semaineDeTest).toMatchObject({ testee: false, etat: 'pas_d_essai' });
    expect(sp(p.exercices[0].semaineDeTest.pasDEssai.phrase)).toBe('Développé couché : pas d’essai cette semaine.');
    propre(p, e);
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
    expect(mal((t, p) => { p.exercices[0].auMax = { reserve: 0 }; })).toMatch(/I251/);   // I91 : sa clause « Au max » est retirée, I251 la couvre
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

  test('21/11/2026 (I253) — la série de mesure : une ligne de travail marquée `serie_de_mesure`, sans réserve ni `au_max_reserve`', () => {
    const e = entrees(seance([SDT]), { modes: { [SDT]: 'serie' } });
    const aj = T.planDeSeance(e).exercices[0].semaineDeTest.ajout;
    const derniere = aj.lignes[aj.lignes.length - 1];
    expect(derniere).toMatchObject({ type: 'travail', mesure: true });
    expect(derniere.reserve).toBeUndefined();
    let se = seance([SDT], 3);
    se = S.insererChauffes(se, 0, aj.lignes.map((q) => Object.assign([q.charge, q.reps], { test: true, type: q.type, mesure: q.mesure })), () => 'q' + Math.random());
    const marquees = se.exercices[0].series.filter((s) => s.serie_de_mesure === true);
    expect(marquees).toHaveLength(1);
    expect(marquees[0]).toMatchObject({ type_serie: 'travail', test_pose: true });
    expect(marquees[0].au_max_reserve).toBeUndefined();
    expect(se.exercices[0].series.filter((s) => s.type_serie === 'echauffement').every((s) => s.serie_de_mesure !== true)).toBe(true);
  });
});

// 21/11/2026 (MOTEUR §9.32, I253) — LA SÉRIE DE MESURE EST UNE MARQUE EN BASE, PAS UNE POSITION. `Modele.estSerieDeMesure` (la marque ET le type
// travail ET une série qui compte) est la seule lecture ; `faitsDeTest` prend la première marquée (par `validee_a`, puis sa place).
describe('I253 — la série de mesure : la marque, jamais la position', () => {
  require('../../v2/js/semaine.js');
  const Mo = require('../../v2/js/modele.js');
  // La séance du soulevé en mode « série », lignes posées par « Ajouter ces lignes », la série de mesure validée à 150 × 6 (reste 1).
  function seanceMesuree() {
    const e0 = entrees(seance([SDT]), { modes: { [SDT]: 'serie' } });
    const aj = T.planDeSeance(e0).exercices[0].semaineDeTest.ajout;
    let k = 0;
    let se = seance([SDT], 3);
    se = S.insererChauffes(se, 0, aj.lignes.map((q) => Object.assign([q.charge, q.reps], { test: true, type: q.type, mesure: q.mesure })), () => 'm' + (++k));
    const j = se.exercices[0].series.findIndex((s) => s.serie_de_mesure === true);
    se = S.modifierSerie(se, 0, j, { charge_kg: 150, reps: 6 });
    se = S.definirEffort(se, 0, j, { ressenti: 'reste_1' });
    se = S.valider(se, 0, j, new Date('2026-11-03T10:20:00Z'));
    return { se, j };
  }
  const plan = (se) => { const e = entrees(se, { modes: { [SDT]: 'serie' } }); return { e, p: T.planDeSeance(e) }; };
  const valider = (se, j, charge, reps, quand) => S.valider(S.modifierSerie(se, 0, j, { charge_kg: charge, reps }), 0, j, new Date(quand));

  test('le prédicat : la marque ET le type travail ET une série qui compte', () => {
    expect(Mo.estSerieDeMesure({ serie_de_mesure: true })).toBe(true);
    expect(Mo.estSerieDeMesure({ serie_de_mesure: true, type_serie: 'travail' })).toBe(true);
    expect(Mo.estSerieDeMesure({ serie_de_mesure: true, type_serie: 'echauffement' })).toBe(false);
    expect(Mo.estSerieDeMesure({ serie_de_mesure: true, type_serie: 'test' })).toBe(false);
    expect(Mo.estSerieDeMesure({ serie_de_mesure: true, hors_calcul: true })).toBe(false);
    expect(Mo.estSerieDeMesure({ serie_de_mesure: false })).toBe(false);
    // une marque d'« Au max » d'avant n'est pas une série de mesure (I251)
    expect(Mo.estSerieDeMesure({ au_max_reserve: 1, au_max: true })).toBe(false);
    expect(Mo.estSerieDuTestEnSerie).toBeUndefined();
    expect(Mo.reserveDeLaSerieDuTest).toBeUndefined();
  });

  test('DISCRIMINANT — la série marquée est mesurée : `mesureSerieId` est son id, la mesure vient d’elle (I253 propre)', () => {
    const { se, j } = seanceMesuree();
    const { e, p } = plan(se);
    const t = p.exercices[0].semaineDeTest;
    expect(t.etat).toBe('fini');
    expect(t.mesureSerieId).toBe(se.exercices[0].series[j].id);
    expect([t.mesure.charge, t.mesure.reps]).toEqual([150, 6]);
    propre(p, e);
  });

  test('DISCRIMINANT (C5) — une série ordinaire posée APRÈS la série de mesure, à une autre valeur, ne change ni la mesure ni son id', () => {
    let { se, j } = seanceMesuree();
    const avant = plan(se).p.exercices[0].semaineDeTest;
    const jt = se.exercices[0].series.length - 1;          // une série de travail de la routine, après la série de mesure
    expect(jt).toBeGreaterThan(j);
    se = valider(se, jt, 165, 3, '2026-11-03T10:30:00Z');
    const { e, p } = plan(se);
    const t = p.exercices[0].semaineDeTest;
    expect(t.mesureSerieId).toBe(avant.mesureSerieId);
    expect(t.mesure).toEqual(avant.mesure);
    propre(p, e);
  });

  test('DISCRIMINANT — relue depuis la base (sans `test_pose`, sans `au_max_reserve`), la série marquée reste la série de mesure', () => {
    const { se, j } = seanceMesuree();
    const relue = JSON.parse(JSON.stringify(se));
    relue.exercices[0].series.forEach((s) => { delete s.test_pose; });
    const { e, p } = plan(relue);
    expect(p.exercices[0].semaineDeTest.mesureSerieId).toBe(se.exercices[0].series[j].id);
    propre(p, e);
  });

  test('DISCRIMINANT — une série d’une version d’avant (`au_max_reserve` seule, aucune marque) ne mesure rien : pas de mesure, jamais une mesure fausse', () => {
    let { se, j } = seanceMesuree();
    se = JSON.parse(JSON.stringify(se));
    Object.assign(se.exercices[0].series[j], { serie_de_mesure: false, au_max_reserve: 1, au_max: true });
    const { e, p } = plan(se);
    const t = p.exercices[0].semaineDeTest;
    expect(t.mesure).toBeNull();
    expect(t.mesureSerieId).toBeNull();
    propre(p, e);
  });

  test('DISCRIMINANT — changée en chauffe par « Modifier », la série marquée ne mesure plus (le type est lu)', () => {
    let { se, j } = seanceMesuree();
    se = JSON.parse(JSON.stringify(se));
    se.exercices[0].series[j].type_serie = 'echauffement';
    const { e, p } = plan(se);
    expect(p.exercices[0].semaineDeTest.mesure).toBeNull();
    expect(p.exercices[0].semaineDeTest.mesureSerieId).toBeNull();
    propre(p, e);
  });

  test('DISCRIMINANT — deux séries marquées (deux appareils) : la PREMIÈRE par `validee_a`, sans erreur', () => {
    let { se, j } = seanceMesuree();
    const jt = se.exercices[0].series.length - 1;
    se = valider(se, jt, 140, 9, '2026-11-03T10:05:00Z');   // validée AVANT la série posée sur cet appareil
    se = JSON.parse(JSON.stringify(se));
    se.exercices[0].series[jt].serie_de_mesure = true;
    const { e, p } = plan(se);
    const t = p.exercices[0].semaineDeTest;
    expect(t.mesureSerieId).toBe(se.exercices[0].series[jt].id);
    expect([t.mesure.charge, t.mesure.reps]).toEqual([140, 9]);
    propre(p, e);
    // la même heure : la place dans l'exercice départage
    se.exercices[0].series[jt].validee_a = se.exercices[0].series[j].validee_a;
    const r = plan(se);
    expect(r.p.exercices[0].semaineDeTest.mesureSerieId).toBe(se.exercices[0].series[j].id);
    propre(r.p, r.e);
  });

  test('I253 sait dire non : un plan qui lit une autre série que la marquée est refusé', () => {
    const { se } = seanceMesuree();
    const { e, p } = plan(se);
    p.exercices[0].semaineDeTest.mesureSerieId = 'autre';
    expect(T.verifierPlan(p, e).erreurs.join('\n')).toMatch(/I253/);
    const q = plan(se).p;
    q.exercices[0].semaineDeTest.mesure = Object.assign({}, q.exercices[0].semaineDeTest.mesure, { charge: 165 });
    expect(T.verifierPlan(q, e).erreurs.join('\n')).toMatch(/I253/);
  });

  test('la marque part en base (`lignes`, `false` compris), se relit (`reprendre`), et `refaire` ne la recopie jamais', () => {
    const { se, j } = seanceMesuree();
    expect(S.COLONNES_SET).toContain('serie_de_mesure');
    expect(S.COLONNES_SET).not.toContain('au_max_reserve');
    const ls = S.lignes(se);
    const marque = ls.filter((l) => l.serie_de_mesure === true);
    expect(marque.map((l) => l.id)).toEqual([se.exercices[0].series[j].id]);
    expect(ls.every((l) => l.serie_de_mesure === true || l.serie_de_mesure === false)).toBe(true);
    expect(ls.some((l) => 'au_max_reserve' in l)).toBe(false);
    expect(S.verifierColonnes()).toBe(true);
    // relue depuis la base puis rouverte : la marque reste ; refaite : une séance neuve ne la porte pas
    const lignesValidees = ls.filter((l) => l.validee_a).map((l) => Object.assign({}, l));
    const session = { id: 'S', user_id: 'u', debut: '2026-11-03T10:00:00Z', fin: '2026-11-03T11:00:00Z', statut: 'terminee', routine_id: 'R', gestes: [] };
    const blocs = Mo.construireBlocs(lignesValidees);
    const rouverte = S.reprendre(session, blocs);
    expect(rouverte.exercices[0].series.filter((s) => s.serie_de_mesure === true)).toHaveLength(1);
    const refaite = S.refaire({ session, blocs, userId: 'u', idSerie: (() => { let n = 0; return () => 'r' + (++n); })() });
    expect(refaite.exercices[0].series.some((s) => s.serie_de_mesure === true)).toBe(false);
  });
});

// 21/11/2026 (I253) — l'ordre de validation lit des INSTANTS ; une série validée sans `validee_a` passe après les autres.
describe('I253 — la première série marquée : des instants, pas du texte', () => {
  require('../../v2/js/semaine.js');
  function seanceMesuree() {
    const e0 = entrees(seance([SDT]), { modes: { [SDT]: 'serie' } });
    const aj = T.planDeSeance(e0).exercices[0].semaineDeTest.ajout;
    let k = 0;
    let se = seance([SDT], 3);
    se = S.insererChauffes(se, 0, aj.lignes.map((q) => Object.assign([q.charge, q.reps], { test: true, type: q.type, mesure: q.mesure })), () => 'i' + (++k));
    const j = se.exercices[0].series.findIndex((s) => s.serie_de_mesure === true);
    se = S.valider(S.modifierSerie(se, 0, j, { charge_kg: 150, reps: 6 }), 0, j, new Date('2026-11-03T10:20:00Z'));
    return { se, j };
  }
  const plan = (se) => { const e = entrees(se, { modes: { [SDT]: 'serie' } }); return { e, p: T.planDeSeance(e) }; };

  test('DISCRIMINANT — deux écritures d’instant : « 11:10+01:00 » (10:10 UTC) est AVANT « 10:20Z », même si le texte dit l’inverse', () => {
    let { se } = seanceMesuree();
    se = JSON.parse(JSON.stringify(se));
    const jt = se.exercices[0].series.length - 1;
    Object.assign(se.exercices[0].series[jt], { charge_kg: 140, reps: 9, validee_a: '2026-11-03T11:10:00+01:00', serie_de_mesure: true });
    const { e, p } = plan(se);
    expect(p.exercices[0].semaineDeTest.mesureSerieId).toBe(se.exercices[0].series[jt].id);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('DISCRIMINANT — une série marquée validée sans `validee_a` (relue de la base) passe après une série datée, des deux côtés (plan et I253)', () => {
    let { se, j } = seanceMesuree();
    se = JSON.parse(JSON.stringify(se));
    const jt = 0;   // en tête de l'exercice : avant la série datée par sa place
    Object.assign(se.exercices[0].series[jt], { type_serie: 'travail', charge_kg: 140, reps: 9, validee_a: null, source: 'hevy', serie_de_mesure: true });
    const { e, p } = plan(se);
    expect(p.exercices[0].semaineDeTest.mesureSerieId).toBe(se.exercices[0].series[j].id);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

// 21/11/2026 (I253) — LA PASSERELLE D'UN BROUILLON D'AVANT : posé par une version d'avant la marque (`test_pose` + `au_max_reserve`), le
// brouillon relu reçoit la marque sur sa série validée ; le plan ne repropose pas la série et la mesure déjà rangée ne s'écrase pas.
describe('I253 — la passerelle d’un brouillon d’avant', () => {
  require('../../v2/js/semaine.js');
  // Le brouillon tel qu'une version d'avant le laissait : la série posée par le test, validée, avec `au_max_reserve` et `au_max`, sans marque.
  function brouillonDAvant() {
    const e0 = entrees(seance([SDT]), { modes: { [SDT]: 'serie' } });
    const aj = T.planDeSeance(e0).exercices[0].semaineDeTest.ajout;
    let k = 0;
    let se = seance([SDT], 3);
    se = S.insererChauffes(se, 0, aj.lignes.map((q) => Object.assign([q.charge, q.reps], { test: true, type: q.type, mesure: q.mesure })), () => 'b' + (++k));
    const j = se.exercices[0].series.findIndex((s) => s.serie_de_mesure === true);
    // la montée faite (toutes les lignes posées par le test sont validées) : il ne reste rien de vide
    for (let m = 0; m < j; m++) {
      const q = se.exercices[0].series[m];
      se = S.valider(S.modifierSerie(se, 0, m, { charge_kg: q.charge_kg, reps: q.reps_visees }), 0, m, new Date('2026-11-03T10:0' + m + ':00Z'));
    }
    se = S.valider(S.modifierSerie(se, 0, j, { charge_kg: 150, reps: 6 }), 0, j, new Date('2026-11-03T10:20:00Z'));
    se = JSON.parse(JSON.stringify(se));
    const s = se.exercices[0].series[j];
    delete s.serie_de_mesure; s.au_max_reserve = 1; s.au_max = true;
    return { se, j };
  }

  test('DISCRIMINANT — relu sans passerelle, le plan repropose « Ajouter ces lignes » ; avec, la série est mesurée et rien n’est reproposé', () => {
    const { se, j } = brouillonDAvant();
    const sans = T.planDeSeance(entrees(se, { modes: { [SDT]: 'serie' } })).exercices[0].semaineDeTest;
    expect(sans.mesure).toBeNull();
    expect(sans.ajout).not.toBeNull();                                         // le défaut que la passerelle ferme
    const relu = S.marquerLeBrouillonDAvant(se);
    expect(relu.exercices[0].series[j].serie_de_mesure).toBe(true);
    const e = entrees(relu, { modes: { [SDT]: 'serie' } });
    const p = T.planDeSeance(e);
    const t = p.exercices[0].semaineDeTest;
    expect(t.ajout).toBeNull();
    expect(t.etat).toBe('fini');
    expect(t.mesureSerieId).toBe(se.exercices[0].series[j].id);
    propre(p, e);
  });

  test('jamais une série non validée, une série sans réserve de test, ni une série que le test n’a pas posée ; un brouillon à jour ne change pas', () => {
    const { se, j } = brouillonDAvant();
    const nonValidee = JSON.parse(JSON.stringify(se)); nonValidee.exercices[0].series[j].validee_a = null;
    expect(S.marquerLeBrouillonDAvant(nonValidee).exercices[0].series[j].serie_de_mesure).toBeUndefined();
    const sansReserve = JSON.parse(JSON.stringify(se)); sansReserve.exercices[0].series[j].au_max_reserve = null;
    expect(S.marquerLeBrouillonDAvant(sansReserve).exercices[0].series[j].serie_de_mesure).toBeUndefined();
    const routine = JSON.parse(JSON.stringify(se)); delete routine.exercices[0].series[j].test_pose;   // un « Au max » de routine d'avant
    expect(S.marquerLeBrouillonDAvant(routine).exercices[0].series[j].serie_de_mesure).toBeUndefined();
    const aJour = S.marquerLeBrouillonDAvant(se);
    expect(S.marquerLeBrouillonDAvant(aJour)).toBe(aJour);
  });

  test('`rangerLesMesuresDeTest` n’écrase pas la mesure déjà rangée par la version d’avant', async () => {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');
    const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    const m = APP.match(/^  async function rangerLesMesuresDeTest\b[\s\S]*?^  }/m);
    const { se } = brouillonDAvant();
    const relu = S.marquerLeBrouillonDAvant(se);
    const e = entrees(relu, { modes: { [SDT]: 'serie' } });
    const p = T.planDeSeance(e);
    const t = p.exercices[0].semaineDeTest;
    // la mesure rangée par la version d'avant, sur la même série (même séance, même valeur)
    const rangee = { valeur: t.mesure.valeur, charge: t.mesure.charge, reps: t.mesure.reps, source: 'serie', vrai: false, avant: t.max, arret: null,
                     le: '2026-11-03', date: '2026-11-03T10:21:00.000Z', seance: 'S' };
    const T0 = Object.assign({}, e.semaineDeTest, { mesures: { [SDT]: rangee } });
    const ecrits = [];
    const ctx = { Object, seance: relu, testDesCartes: () => T0, enEdition: () => false, planActuel: () => p,
                  ecrireTest: async (x) => { ecrits.push(x); }, observerLePariDeTest: async () => { ecrits.push('pari'); },
                  jourDuJour: () => '2026-11-03', instantDuJour: () => '2026-11-03T12:00:00.000Z' };
    vm.createContext(ctx);
    vm.runInContext(m[0], ctx);
    await vm.runInContext('rangerLesMesuresDeTest()', ctx);
    expect(ecrits).toEqual([]);
    expect(T0.mesures[SDT]).toBe(rangee);
  });
});
