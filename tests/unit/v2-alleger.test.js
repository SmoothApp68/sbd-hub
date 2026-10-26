/** @jest-environment node */
//
// 174 — LA 4e MARCHE : ALLÉGER AU LIEU DE SE TAIRE (MOTEUR §14.5, §14.7, décision d'Aurélien du 26/10/2026).
//
// Là où l'escalier se taisait (3e déclenchement isolé et au-delà, repli sauté compris), le coach propose d'alléger, une fois
// par blocage. Zone muscle, 3 séries ou plus : une série de moins, même charge. Zone muscle, 2 séries : le cran en dessous, au
// bas de la zone. Zone force (haut <= 5) : P x 0,95 arrondi au cran. Poids du corps, aide : une série de moins, sinon le silence.
// Dégressive retirée dans tous les cas. Refusée : une ligne de rappel à chaque séance. Acceptée : active jusqu'au prochain progrès.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const NB = ' ';
const C = { etat: 'progression', zone: 'volume', palier: 107, niveau: 10, n: 3,
  ligne: { charge: 107, vise: 10 }, haut: { charge: 110, vise: 10, k: 1 }, fondement: {} };
const MEILLEUR = { palier: 107, niveau: 10 };
const CAT = { curl: { equipement: 'poulie', muscles_primaires: ['biceps'] } };
const PLACE = { biceps: { place: true, moyenne: 8, seuil: 10, fenetres: 12 } };
const CRANS = { cran: 105, cinq: 102 };

function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: opt.seance || 'S1', userId: 'u', idSerie: id });
  const nb = opt.series === undefined ? 3 : opt.series;
  se = S.ajouterExercice(se, 'curl', id, { series: nb });
  if (opt.geste) se = opt.geste(se, id);
  const k = Object.assign({}, C, opt.consigne || {});
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: opt.compteur === undefined ? 12 : opt.compteur, meilleur: MEILLEUR, blocages: [] },
    repli: null, alleger: opt.crans === undefined ? CRANS : opt.crans };
  const esc = { cartes: [], compteurs: opt.compteurs || [], noms: {}, seriesRoutine: { curl: nb }, marches: opt.marches || [] };
  const e = { seance: { id: opt.seance || 'S1', debut: opt.debut || '2026-10-29T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: { curl: c }, reglage: 'normal', paris: [], suites: {}, phase: opt.phase || 'maintien',
    catalogue: CAT, volume: PLACE, escalier: esc, debutant: false, intention: null, modes: {} };
  return { e, p: T.planDeSeance(e) };
}
const marche = (quoi, reponse, jour, compteur, seance) => ({ seance: seance || 'S0', jour, exercice: 'curl',
  marche: quoi, reponse, compteur, debut: jour + 'T10:00:00+00:00', n: 3 });
const PLUS = marche('serie_de_plus', 'refusee', '2026-10-01', 4);
const DEG = marche('degressive', 'refusee', '2026-10-15', 8);
const sansErreur = (d) => expect(T.verifierPlan(d.p, d.e).erreurs).toEqual([]);
const plat = (s) => String(s).replace(/[  ]/g, ' ');

describe('174 — la proposition, selon la zone et les séries', () => {
  const k = (zone, palier) => Object.assign({}, C, { zone, palier, ligne: { charge: palier, vise: 8 } });
  test('zone muscle, 3 séries : une série de moins, même charge', () => {
    expect(M.propositionAlleger(k('volume', 107), CRANS, 3)).toEqual({ mode: 'serie', routine: 3, series: 2, charge: null, vise: 8 });
    expect(M.propositionAlleger(k('volume', 107), CRANS, 4).series).toBe(3);
  });
  test('DISCRIMINANT — zone muscle, 3 séries : la charge ne baisse PAS', () => {
    expect(M.propositionAlleger(k('mix', 80), CRANS, 3).charge).toBeNull();
  });
  test('zone muscle, 2 séries : le cran en dessous, au bas de la zone', () => {
    expect(M.propositionAlleger(k('volume', 107), CRANS, 2)).toEqual({ mode: 'cran', routine: 2, series: 2, charge: 105, vise: 10 });
  });
  test('zone force (haut <= 5) : P x 0,95 au cran, séries gardées', () => {
    expect(M.propositionAlleger(k('lourd', 140), { cran: 137.5, cinq: 132.5 }, 4))
      .toEqual({ mode: 'force', routine: 4, series: 4, charge: 132.5, vise: 8 });
  });
  test('poids du corps et aide : une série de moins à 3 séries ou plus, sinon le silence', () => {
    expect(M.propositionAlleger(k('volume', 0), null, 3).mode).toBe('serie');
    expect(M.propositionAlleger(k('volume', -20), null, 4).series).toBe(3);
    expect(M.propositionAlleger(k('volume', 0), null, 2)).toBeNull();
    expect(M.propositionAlleger(k('volume', -20), null, 1)).toBeNull();
  });
  test('rien de plus léger (la salle) : le silence', () => {
    expect(M.propositionAlleger(k('volume', 107), { cran: null, cinq: null }, 2)).toBeNull();
    expect(M.propositionAlleger(k('lourd', 140), { cran: null, cinq: null }, 3)).toBeNull();
  });
  test('les crans se lisent sur l\'historique : le cran en dessous et P x 0,95 arrondi', () => {
    const h = [{ debut: '2026-09-01T10:00:00+00:00', palier: 140, series: [] }, { debut: '2026-09-04T10:00:00+00:00', palier: 137.5, series: [] }];
    const c = M.cransDAlleger(h, '2026-10-01T10:00:00+00:00', 140, 'barre', null);
    expect(c.cran).toBe(137.5);
    expect(c.cinq).toBe(132.5);
  });
});

describe('174 — le plan : la carte, le refus, l\'acceptation', () => {
  test('3e déclenchement (12), 3 séries : la carte « Alléger » / « Garder 3 séries »', () => {
    const d = decor({ marches: [PLUS, DEG] });
    const x = d.p.exercices[0];
    expect(x.escalier.marche).toBe('alleger');
    expect(x.escalier.carte.type).toBe('alleger');
    expect(plat(x.escalier.carte.phrase)).toBe('107 kg × 10 depuis 12 séances');
    expect(plat(x.escalier.carte.detail)).toBe('Une série de plus, puis la dégressive, n\'ont rien changé. On allège : 2 séries au lieu de 3, sans dégressive, même charge. La fatigue redescend, la charge remontera.');
    expect([x.escalier.carte.oui, x.escalier.carte.non]).toEqual(['Alléger', 'Garder 3 séries']);
    expect(x.entete.compteur).toBeNull();
    sansErreur(d);
  });
  test('rien n\'a été proposé avant : le détail le dit sans inventer', () => {
    const d = decor({});
    expect(d.p.exercices[0].escalier.carte.detail).toMatch(/^Rien n'a changé depuis le début de ce blocage\./);
  });
  test('2 séries, zone muscle : un cran plus bas, au bas de la zone ; la zone force : « Garder la charge »', () => {
    const d = decor({ series: 2 });
    expect(d.p.exercices[0].escalier.carte.mode).toBe('cran');
    expect(plat(d.p.exercices[0].escalier.carte.detail)).toMatch(/un cran plus bas, 105 kg × 10 \(le bas de ta zone\), sans dégressive/);
    sansErreur(d);
    const f = decor({ consigne: { zone: 'lourd', palier: 140, ligne: { charge: 140, vise: 4 }, haut: null }, crans: { cran: 137.5, cinq: 132.5 } });
    expect(f.p.exercices[0].escalier.carte.mode).toBe('force');
    expect(f.p.exercices[0].escalier.carte.non).toBe('Garder la charge');
    expect(plat(f.p.exercices[0].escalier.carte.detail)).toMatch(/132,5 kg au lieu de 140 kg/);
    sansErreur(f);
  });
  test('au poids du corps avec 2 séries : le silence ; avec 3 : une série de moins', () => {
    const pdc = { consigne: { palier: 0, ligne: { charge: 0, vise: 10 }, haut: null }, crans: null };
    expect(decor(Object.assign({ series: 2 }, pdc)).p.exercices[0].escalier.marche).toBe('silence');
    expect(decor(Object.assign({ series: 3 }, pdc)).p.exercices[0].escalier.marche).toBe('alleger');
  });
  test('en sèche, aucune carte (« rien de plus ») ; avant le 3e déclenchement, la marche d\'avant', () => {
    expect(decor({ phase: 'seche' }).p.exercices[0].escalier.marche).not.toBe('alleger');
    expect(decor({ compteur: 8 }).p.exercices[0].escalier.marche).not.toBe('alleger');
  });
  test('4e déclenchement (16), repli accepté avant : la carte vient quand même', () => {
    const d = decor({ compteur: 16, marches: [PLUS, DEG, marche('repli', 'appliquee', '2026-10-22', 12)] });
    expect(d.p.exercices[0].escalier.marche).toBe('alleger');
  });
  test('refusée : à la séance suivante, une ligne sous l\'exercice (au lieu de rien), la dégressive revient à elle-même', () => {
    const non = marche('alleger', 'refusee', '2026-10-29', 12, 'S1');
    const d = decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13, marches: [PLUS, DEG, non] });
    const x = d.p.exercices[0];
    expect(x.escalier.carte).toBeUndefined();
    expect(x.escalier.reponse).toBe('refusee');
    expect(plat(x.entete.alleger)).toBe('107 kg × 10 depuis 13 séances. Une série de moins reste la sortie.');
    expect(x.consigne.alleger).toBeUndefined();
    expect(x.lignes.filter((l) => l.role !== 'hors')).toHaveLength(3);
    sansErreur(d);
    // Et au déclenchement suivant (16), toujours le rappel, jamais une seconde carte.
    const d16 = decor({ seance: 'S5', debut: '2026-11-12T10:00:00+00:00', compteur: 16, marches: [PLUS, DEG, non] });
    expect(d16.p.exercices[0].escalier.carte).toBeUndefined();
    expect(plat(d16.p.exercices[0].entete.alleger)).toMatch(/depuis 16 séances/);
  });
  test('acceptée : active jusqu\'au prochain progrès — 2 séries, même charge, sans ligne haute, la 3e ligne à retirer', () => {
    const oui = marche('alleger', 'acceptee', '2026-10-29', 12, 'S1');
    const d = decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13, marches: [PLUS, DEG, oui] });
    const x = d.p.exercices[0];
    expect(x.consigne.alleger).toEqual({ mode: 'serie', routine: 3, series: 2, charge: null, palier: 107 });
    expect(x.consigne.ligne).toEqual({ charge: 107, vise: 10 });
    expect(x.consigne.haut).toBeNull();
    expect(x.entete.alleger).toBe('une série de moins, sans dégressive, jusqu\'à ton prochain progrès');
    expect(x.lignes.filter((l) => l.role !== 'hors')).toHaveLength(2);
    expect(T.lignesARetirer(d.p)).toEqual([{ iExo: 0, iSerie: 2 }]);
    sansErreur(d);
  });
  test('DISCRIMINANT — la ligne haute (souvent la seule « approchée ») part : le fondement ne dit plus « approchée » (I61)', () => {
    const oui = marche('alleger', 'acceptee', '2026-10-29', 12, 'S1');
    const d = decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13, marches: [PLUS, DEG, oui],
      consigne: { haut: { charge: 110, vise: 10, k: 1, approchee: true }, fondement: { approchee: true } } });
    expect(d.p.exercices[0].consigne.haut).toBeNull();
    expect(d.p.exercices[0].consigne.fondement.approchee).toBeUndefined();
    sansErreur(d);
  });
  test('DISCRIMINANT — une série VALIDÉE n\'est jamais retirée', () => {
    const oui = marche('alleger', 'acceptee', '2026-10-29', 12, 'S1');
    const d = decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13, marches: [PLUS, DEG, oui],
      geste: (se) => [0, 1, 2].reduce((s, i) => S.valider(S.modifierSerie(s, 0, i, { charge_kg: 107, reps: 10 }), 0, i, new Date('2026-11-01T10:30:00Z')), se) });
    expect(T.lignesARetirer(d.p)).toEqual([]);
  });
  test('progrès depuis (compteur plus bas) : la marche s\'éteint', () => {
    const oui = marche('alleger', 'acceptee', '2026-10-29', 12, 'S1');
    const d = decor({ seance: 'S3', debut: '2026-11-05T10:00:00+00:00', compteur: 1, marches: [PLUS, DEG, oui],
      compteurs: [{ exercice: 'curl', jour: '2026-11-02', compteur: 0, seance: 'S2', debut: '2026-11-02T10:00:00+00:00' }] });
    expect(d.p.exercices[0].consigne.alleger).toBeUndefined();
  });
  test('acceptée en zone force : la charge baisse, les séries restent, le gris remplace la phrase de l\'état', () => {
    const oui = marche('alleger', 'acceptee', '2026-10-29', 12, 'S1');
    const d = decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13, marches: [oui],
      consigne: { zone: 'lourd', palier: 140, ligne: { charge: 140, vise: 4 }, haut: null }, crans: { cran: 137.5, cinq: 132.5 } });
    const x = d.p.exercices[0];
    expect(x.consigne.ligne.charge).toBe(132.5);
    expect(x.consigne.alleger.mode).toBe('force');
    expect(x.lignes.filter((l) => l.role !== 'hors')).toHaveLength(3);
    expect(x.entete.gris).toBe('Moins lourd, sans dégressive, jusqu\'à ton prochain progrès.');
    sansErreur(d);
  });
  test('DISCRIMINANT — la ligne dégressive pas encore faite part avec la marche ; une dégressive validée reste', () => {
    const lignes = (valideeDeg) => [
      { type: 'travail', role: 'ligne', iSerie: 0, validee: true }, { type: 'travail', role: 'ligne', iSerie: 1, validee: false },
      { type: 'degressive', role: 'ligne', iSerie: 2, validee: valideeDeg }];
    const plan = (valideeDeg, alleger) => ({ allegee: null, exercices: [{ iExo: 0, consigne: alleger ? { alleger: { mode: 'serie' } } : {},
      lignes: lignes(valideeDeg) }] });
    expect(T.lignesARetirer(plan(false, true))).toEqual([{ iExo: 0, iSerie: 2 }]);
    expect(T.lignesARetirer(plan(true, true))).toEqual([]);
    expect(T.lignesARetirer(plan(false, false))).toEqual([]);
  });
  test('la dégressive en cours est retirée tant que la marche dure', () => {
    const oui = marche('alleger', 'acceptee', '2026-10-29', 12, 'S1');
    const d = decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13,
      marches: [PLUS, marche('degressive', 'acceptee', '2026-10-15', 8), oui] });
    expect(d.p.exercices[0].degressiveEnCours).toBe(false);
    expect(T.degressivesAAjouter(d.p)).toEqual([]);
  });
  test('la feuille « Pourquoi » dit ce que la ligne fait', () => {
    const oui = marche('alleger', 'acceptee', '2026-10-29', 12, 'S1');
    const d = decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13, marches: [oui] });
    expect(JSON.stringify(d.p.exercices[0].pourquoi)).toMatch(/Une série de moins, sans dégressive/);
  });
});

describe('174 — I66 voit chacune de ses violations', () => {
  const sain = () => decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13,
    marches: [marche('alleger', 'acceptee', '2026-10-29', 12, 'S1')] });
  const verifier = (mut, source) => {
    const d = (source || sain)();
    const pl = JSON.parse(JSON.stringify(d.p));
    mut(pl.exercices[0]);
    return T.verifierPlan(pl, d.e).erreurs.join('\n');
  };
  test('le plan sain n\'en lève aucun', () => { expect(verifier(() => {})).toBe(''); });
  test('plus de séries que la routine', () => { expect(verifier((x) => { x.consigne.alleger.series = 4; })).toMatch(/I66/); });
  test('une série de moins qui n\'en retire aucune', () => { expect(verifier((x) => { x.consigne.alleger.series = 3; })).toMatch(/I66/); });
  test('une charge au-dessus du palier', () => { expect(verifier((x) => { x.consigne.ligne.charge = 110; })).toMatch(/I66/); });
  test('une ligne haute', () => { expect(verifier((x) => { x.consigne.haut = { charge: 110, vise: 10, k: 1 }; })).toMatch(/I66/); });
  test('une charge allégée pas sous le palier', () => {
    const force = () => decor({ seance: 'S2', debut: '2026-11-01T10:00:00+00:00', compteur: 13,
      marches: [marche('alleger', 'acceptee', '2026-10-29', 12, 'S1')],
      consigne: { zone: 'lourd', palier: 140, ligne: { charge: 140, vise: 4 }, haut: null }, crans: { cran: 137.5, cinq: 132.5 } });
    expect(verifier((x) => { x.consigne.alleger.charge = 140; }, force)).toMatch(/I66/);
  });
  test('la carte : une proposition de plus de séries', () => {
    const carte = () => decor({});
    expect(verifier((x) => { x.escalier.alleger.series = 5; }, carte)).toMatch(/I66/);
  });
});
