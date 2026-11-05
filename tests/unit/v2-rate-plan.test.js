/** @jest-environment node */
//
// 236 (MOTEUR §9.39) — LE COACH EN TEMPS RÉEL APRÈS UN RATÉ, dans le plan : le vrai chemin (`seance.js`, `planDeSeance`, `verifierPlan`,
// `verifierPhrases`). La séance d'Alexis du 03/11 rejouée en synthétique (mêmes chiffres, aucune donnée personnelle) :
//   tractions visé 8 : 7-7-6-6 ; incliné visé 11 : 11-9-9 ; rowing, la charge baissée en cours d'exercice (93 → 86) ; élévations (9 → 7).
// Elle doit déclencher le niveau 1 aux tractions (après la 1re série), le niveau 2 (après la 2e), la carte au rowing.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const sp = (t) => t.replace(/[\u00a0\u202f]/g, ' ');
const propre = (p, e) => { expect(T.verifierPlan(p, e).erreurs).toEqual([]); expect(T.verifierPhrases(p)).toEqual([]); };

// Les quatre exercices : slug, nb de séries, reps visées, charge du plan, zone.
const EXOS = [
  { slug: 'tractions', n: 4, vise: 8, charge: 0, zone: 'hypertrophie', equip: 'corps', mesure: 'reps' },
  { slug: 'incline', n: 3, vise: 11, charge: 40, zone: 'volume', equip: 'haltere', mesure: 'charge_reps' },
  { slug: 'rowing', n: 4, vise: 10, charge: 93, zone: 'hypertrophie', equip: 'machine', mesure: 'charge_reps' },
  { slug: 'elevations', n: 3, vise: 12, charge: 9, zone: 'volume', equip: 'haltere', mesure: 'charge_reps' }
];

// `faits` : { slug: [[charge, reps], …] } — les séries validées, dans l'ordre.
function monter(faits, extra) {
  let k = 0;
  const id = () => 'a-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  EXOS.forEach((x, i) => {
    se = S.ajouterExercice(se, x.slug, id, { series: x.n });
    se.exercices[i].series.forEach((s) => { s.reps_visees = x.vise; });
  });
  let minute = 0;
  EXOS.forEach((x, i) => {
    (faits[x.slug] || []).forEach(([ch, reps], j) => {
      se = S.modifierSerie(se, i, j, { charge_kg: ch, reps });
      se = S.valider(se, i, j, new Date(Date.UTC(2026, 10, 3, 10, 0, 0) + (++minute) * 150000));
    });
  });
  if (extra && extra.gestes) extra.gestes.forEach((g) => { se = S.noterGeste(se, g); });
  return se;
}
function entrees(se, extra) {
  const consignes = {}, catalogue = {};
  EXOS.forEach((x) => {
    consignes[x.slug] = { consigne: { etat: 'progression', zone: x.zone, palier: x.charge, n: x.n, ligne: { charge: x.charge, vise: x.vise }, haut: null },
      contexte: { cran: x.charge + 2.5, haut: null }, pas: 2.5 };
    catalogue[x.slug] = { equipement: x.equip, mesure: x.mesure, pas: 2.5, nom: x.slug, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] };
  });
  return Object.assign({
    seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes },
    consignes, reglage: 'normal', objectif: 'les_deux', paris: [], catalogue
  }, extra || {});
}
const plan = (faits, extra) => { const se = monter(faits, extra); const e = entrees(se, extra && extra.entrees); return { se, e, p: T.planDeSeance(e) }; };

describe('niveau 1 — la 1re série des tractions : 7 au lieu de 8', () => {
  test('une phrase sous la série, la fourchette sur les suivantes, la charge intacte', () => {
    const { e, p } = plan({ tractions: [[0, 7]] });
    const x = p.exercices[0];
    expect(x.rate).toBeTruthy();
    expect(x.rate.niveau).toBe('serie');
    expect(x.rate.iSerie).toBe(0);
    expect(sp(x.rate.phrase)).toBe('7 au lieu de 8. Même charge, garde 1, entre 6 et 7.');
    expect(x.rate.recale).toBe(true);
    // la fourchette est le pari des lignes suivantes (toutes : la 1re série ratée recale d'un coup) ; la charge ne bouge pas
    x.lignes.slice(1).forEach((l) => { expect(l.vise).toBeLessThanOrEqual(7); expect(l.charge).toBe(0); });
    expect(x.paris[1].borne_basse).toBe(6);
    expect(x.paris[1].borne_haute).toBeGreaterThanOrEqual(6);
    propre(p, e);
  });
});

describe('niveau 2 — après 2 séries sous la cible', () => {
  test('la suivante vise ce qui vient d’être fait ; la phrase remplace celle du niveau 1', () => {
    const { e, p } = plan({ tractions: [[0, 7], [0, 7]] });
    const x = p.exercices[0];
    expect(x.rate.niveau).toBe('exercice');
    expect(sp(x.rate.phrase)).toBe('7 puis 7, sous la cible. La suite vise 7, garde 1, entre 6 et 8.');
    expect(x.lignes[2].vise).toBe(7);
    expect(x.lignes[3].vise).toBe(7);
    expect(x.phrases.filter((q) => q.ou === 'rate')).toHaveLength(1);
    propre(p, e);
  });
  test('la dernière série : rien (J)', () => {
    const { p } = plan({ tractions: [[0, 7], [0, 7], [0, 6], [0, 6]] });
    expect(p.exercices[0].rate).toBeNull();
  });
});

describe('niveau 3 — la forme du jour : la carte au rowing', () => {
  const fait = { tractions: [[0, 7], [0, 7], [0, 6], [0, 6]], incline: [[40, 11], [40, 9], [40, 9]] };
  test('tractions et incliné sous la cible : la carte, UNE, en tête du rowing', () => {
    const { e, p } = plan(fait);
    expect(p.formeDuJour.carte).toBe(true);
    expect(p.formeDuJour.iExo).toBe(2);
    expect(p.exercices[2].carteForme).toBeTruthy();
    expect(sp(p.exercices[2].carteForme.phrase)).toBe('Tes séries sont sous la cible sur les 2 derniers exercices. Pour la fin de séance ?');
    expect(p.exercices.filter((x) => x.carteForme)).toHaveLength(1);
    propre(p, e);
  });
  test('avec la charge baissée au rowing (93 → 86), la carte se pose sur les élévations et le dit', () => {
    const f = Object.assign({}, fait, { rowing: [[86, 10], [86, 10], [86, 10], [86, 10]] });
    const { e, p } = plan(f);
    expect(p.formeDuJour.iExo).toBe(3);
    expect(sp(p.exercices[3].carteForme.phrase)).toBe('Tes séries sont sous la cible sur 2 des 3 derniers exercices, et tu as baissé la charge sur rowing. Pour la fin de séance ?');
    propre(p, e);
  });
  test('« Garder le plan » : la carte ne revient jamais', () => {
    const { e, p } = plan(fait, { gestes: [{ geste: 'forme_gardee', slug: 'rowing' }] });
    expect(p.formeDuJour).toMatchObject({ reponse: 'garde', carte: null });
    expect(p.exercices.some((x) => x.carteForme)).toBe(false);
    propre(p, e);
  });
  test('« Ajuster la fin » : cibles au bas de la zone, une série de moins par exercice restant, pas d’« Au max »', () => {
    const { e, p } = plan(fait, { gestes: [{ geste: 'forme_ajustee', slug: 'rowing' }] });
    expect(p.formeDuJour.reponse).toBe('ajuste');
    const retire = T.lignesAAjuster(p);
    expect(retire.map((r) => r.iExo)).toEqual([2, 3]);
    expect(retire[0].iSerie).toBe(3);
    const row = p.exercices[2];
    row.lignes.filter((l) => l.iSerie !== 3).forEach((l) => expect(l.vise).toBeLessThanOrEqual(8));
    expect(row.auMax).toBeNull();
    propre(p, e);
  });
  test('un seul exercice qui flanche : pas de carte', () => {
    const { p } = plan({ tractions: [[0, 7], [0, 7], [0, 6], [0, 6]], incline: [[40, 11], [40, 11], [40, 11]] });
    expect(p.formeDuJour.carte).toBeNull();
  });
});

describe('la charge ne baisse que par un geste', () => {
  test('sous la zone (60 kg × 6 au lieu de 10) : la phrase propose, les lignes gardent la charge ; « Prendre » la baisse', () => {
    const avant = plan({ rowing: [[93, 5]] });
    const x = avant.p.exercices[2];
    expect(x.rate.charge.action).toBe('baisse');
    expect(x.rate.boutons.map((b) => b.cle)).toContain('prendre');
    x.lignes.slice(1).forEach((l) => expect(l.charge).toBe(93));
    const apres = plan({ rowing: [[93, 5]] }, { gestes: [{ geste: 'rate_prise', slug: 'rowing', rang: 0, bouton: 'prendre', kg: x.rate.charge.kg }] });
    const y = apres.p.exercices[2];
    y.lignes.slice(1).forEach((l) => expect(l.charge).toBe(x.rate.charge.kg));
    expect(y.paris[1].fondement.charge).toBe(x.rate.charge.kg);
    propre(apres.p, apres.e);
  });
});

describe('les contextes qui se taisent', () => {
  test('Entretenir, décharge, semaine de test : aucune réaction', () => {
    const se = monter({ tractions: [[0, 7]] });
    const e = entrees(se);
    expect(T.planDeSeance(Object.assign({}, e, { intention: 'entretien' })).exercices[0].rate).toBeNull();
    expect(T.planDeSeance(e).exercices[0].rate).toBeTruthy();
  });
  test('deux propositions ignorées sur un exercice : silence jusqu’à la fin', () => {
    const { p } = plan({ incline: [[40, 6], [40, 6], [40, 6]], rowing: [] });
    // 3 séries sous la zone, 2 propositions sans geste : la 3e (dernière) est de toute façon muette (J)
    expect(p.exercices[1].rate).toBeNull();
  });
});

describe('paris ratés à la suite', () => {
  test('2 séances de suite : « un cran dessous » ou « je retente », une fois', () => {
    const se = monter({});
    const e = entrees(se, { parisRates: { rowing: { n: 2, charge: 93, reps: 10 } } });
    const p = T.planDeSeance(e);
    const c = p.exercices[2].parisRates.carte;
    expect(sp(c.phrase)).toBe('Ton pari n’a pas tenu 2 séances de suite. Un cran dessous : 92,5 kg × 10, ou tu retentes ?');
    expect(c.boutons.map((b) => b.cle)).toEqual(['cran', 'retente']);
    p.exercices[2].lignes.forEach((l) => expect(l.charge).toBe(93));
    propre(p, e);
    const q = T.planDeSeance(entrees(monter({}, { gestes: [{ geste: 'paris_cran', slug: 'rowing' }] }), { parisRates: { rowing: { n: 2, charge: 93, reps: 10 } } }));
    expect(q.exercices[2].parisRates.reponse).toBe('cran');
    q.exercices[2].lignes.forEach((l) => expect(l.charge).toBe(92.5));
  });
});

// ── L'exemption : une séance « ajustée à la forme du jour » ne compte pas comme stagnation pour la suite ──
describe('236 — séance ajustée à la forme du jour : neutre pour la suite', () => {
  const Faits = require('../../v2/js/faits.js').creer();
  const fs = require('fs');
  const paris = (seance, date) => [
    { exercice: 'rowing', seance, date, predite: 10, observee: 8, charge: 93 },
    { exercice: 'rowing', seance, date, predite: 10, observee: 8, charge: 93 }
  ];
  const tous = paris('A', '2026-11-01T10:00:00Z').concat(paris('B', '2026-11-03T10:00:00Z'));

  test('deux séances ratées de suite : le compte est 2 ; la 2e ajustée à la forme, il retombe à 1', () => {
    expect(Faits.parisRatesALaSuite(tous, 'S').rowing.n).toBe(2);
    expect(Faits.parisRatesALaSuite(tous, 'S', ['B']).rowing.n).toBe(1);
  });
  test('les deux ajustées : plus aucun pari raté à la suite', () => {
    expect(Faits.parisRatesALaSuite(tous, 'S', ['A', 'B'])).toEqual({});
  });
  test('⚠️ DISCRIMINANT — l\'app lit le geste `forme_ajustee` dans les périodes allégées (le fil de la stagnation et des compteurs)', () => {
    const app = fs.readFileSync(require('path').join(__dirname, '../../v2/js/app.js'), 'utf8');
    const corps = app.slice(app.indexOf('function periodesAllegees()'), app.indexOf('function seancesAjusteesALaForme()'));
    expect(corps).toMatch(/seancesAjusteesALaForme\(\)/);
    expect(app).toMatch(/g\.geste === 'forme_ajustee'/);
  });
});

// ── Un pari est toujours la ligne affichée (RJ du banc) : la ligne validée garde la visée et le pari qu'elle affichait avant sa validation ──
describe('236 — la ligne validée garde la visée et le pari affichés juste avant', () => {
  const ligne = (p, n) => p.exercices[0].lignes[n];
  test('⚠️ DISCRIMINANT — tractions 7, 7 : la 3e ligne vise moins que 8 avant comme après sa validation, et son pari la dit', () => {
    const avant = plan({ tractions: [[0, 7], [0, 7]] });
    const apres = plan({ tractions: [[0, 7], [0, 7], [0, 6]] });
    const lA = ligne(avant.p, 2), lB = ligne(apres.p, 2);
    expect(lA.validee).toBeFalsy();
    expect(lB.validee).toBe(true);
    expect(lB.vise).toBe(lA.vise);
    expect(lA.vise).toBeLessThan(8);
    expect(apres.p.exercices[0].paris[2].valeur_predite).toBe(avant.p.exercices[0].paris[2].valeur_predite);
    propre(avant.p, avant.e); propre(apres.p, apres.e);
  });
});


// 236 × 233 — LE REPOS RÉEL DU RATÉ vient de la fonction unique de 233 (`Moteur.reposReel` : l'écart entre deux séries validées de
// l'exercice), pas d'un calcul local ni du `repos_s` écrit à la validation.
describe('236 × 233 — le repos réel court du cas A se lit par Moteur.reposReel', () => {
  const run = (ecartS, reposS) => {
    let k = 0;
    const id = () => 'r-s' + (++k);
    let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'incline', id, { series: 3 });
    se = S.insererChauffes(se, 0, [[20, 8]], id);
    se.exercices[0].series.forEach((s) => { s.reps_visees = 10; });
    se = S.modifierSerie(se, 0, 0, { charge_kg: 20, reps: 8 });
    se = S.valider(se, 0, 0, new Date(Date.UTC(2026, 10, 3, 9, 50, 0)));
    se = S.modifierSerie(se, 0, 1, { charge_kg: 40, reps: 10 });
    se = S.valider(se, 0, 1, new Date(Date.UTC(2026, 10, 3, 10, 0, 0)));
    se = S.modifierSerie(se, 0, 2, { charge_kg: 40, reps: 9 });
    se = S.valider(se, 0, 2, new Date(Date.UTC(2026, 10, 3, 10, 0, 0) + ecartS * 1000));
    if (reposS !== undefined) se.exercices[0].series[2].repos_s = reposS;
    const e = { seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, exercices: se.exercices, gestes: [] },
      consignes: { incline: { consigne: { etat: 'progression', zone: 'hypertrophie', palier: 40, n: 3, ligne: { charge: 40, vise: 10 }, haut: null },
        contexte: { cran: 42.5, haut: null }, pas: 2.5 } },
      reglage: 'normal', objectif: 'les_deux', paris: [],
      catalogue: { incline: { equipement: 'barre', mesure: 'charge_reps', pas: 2.5, nom: 'incline', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] } } };
    const p = T.planDeSeance(e);
    return { rate: p.exercices[0].rate, e, p };
  };
  test('60 s entre les deux séries : cas A (repos court), même si `repos_s` dit 300', () => {
    expect(run(60).rate.cas).toBe('A');
    const r = run(60, 300);
    expect(r.rate.cas).toBe('A');
    expect(r.rate.boutons.map((b) => b.cle)).toContain('repos');
  });
  test('300 s entre les deux séries : cas B, même si `repos_s` dit 30', () => {
    expect(run(300).rate.cas).toBe('B');
    expect(run(300, 30).rate.cas).toBe('B');
  });
  test('la première série n’a pas de repos à mesurer : jamais « repos court »', () => {
    expect(M.reposReel([{ validee_a: '2026-11-03T10:00:00Z', type_serie: 'travail' }])).toBeNull();
  });
});

// 236 × 225 — LA FORME DU JOUR ET LA VEILLE : après « Mix aujourd'hui », pas de second allègement par-dessus ; si le plan est gardé, la carte
// nomme le FAIT noté (« Tu as noté football hier. »), sans deviner de cause (I129).
describe('236 × 225 — la forme du jour et la veille d’une activité dure (I129)', () => {
  const fait = { tractions: [[0, 7], [0, 7], [0, 6], [0, 6]], incline: [[40, 11], [40, 9], [40, 9]] };
  const veille = { seanceId: 'a', slug: 'football', nom: 'Football', jour: '2026-11-02' };
  const avec = (choix, activite) => {
    const r = plan(fait);
    const e = Object.assign({}, r.e, { activiteVeille: activite === undefined ? veille : activite, veilleChoix: choix });
    return { e, p: T.planDeSeance(e) };
  };
  test('sans veille proposée : la carte est celle de 236, inchangée', () => {
    const { e, p } = avec(null, null);
    expect(sp(p.exercices[2].carteForme.phrase)).toBe('Tes séries sont sous la cible sur les 2 derniers exercices. Pour la fin de séance ?');
    expect(p.exercices[2].carteForme.veille).toBeNull();
    propre(p, e);
  });
  test('« Mix aujourd’hui » pris : AUCUNE carte de forme du jour (la séance est déjà allégée)', () => {
    const { e, p } = avec('mix');
    expect(p.formeDuJour.carte).toBeNull();
    expect(p.exercices.some((x) => x.carteForme)).toBe(false);
    propre(p, e);
  });
  test('« Garder le plan » : la carte nomme le fait noté, sans cause', () => {
    const { e, p } = avec('garder');
    const c = p.exercices[2].carteForme;
    expect(c.veille).toBe('football');
    expect(sp(c.phrase)).toBe('Tes séries sont sous la cible sur les 2 derniers exercices. Tu as noté football hier. Pour la fin de séance ?');
    expect(c.phrase).not.toMatch(/parce que|à cause|fatigu|donc/i);
    propre(p, e);
  });
  test('le moteur : la décision de forme se tait après Mix, et nomme le fait après « garder »', () => {
    const ex = [{ slug: 'a', nom: 'A', sousCible: true, fini: true }, { slug: 'b', nom: 'B', sousCible: true, fini: true }];
    expect(M.reactionAuRate({ niveau: 'seance', exercices: ex, restants: 2, veille: { choix: 'mix', nom: 'Football' } })).toMatchObject({ silence: true, raison: 'veille_mix' });
    expect(M.reactionAuRate({ niveau: 'seance', exercices: ex, restants: 2, veille: { choix: 'garder', nom: 'Football' } }).veille).toBe('football');
    expect(M.reactionAuRate({ niveau: 'seance', exercices: ex, restants: 2, veille: { choix: 'garder', nom: null } }).veille).toBeNull();
  });
  test('I129 forgé : une carte après Mix, un fait nommé sans plan gardé', () => {
    const r = avec('garder');
    const q = JSON.parse(JSON.stringify(r.p));
    expect(T.verifierPlan(q, Object.assign({}, r.e, { veilleChoix: 'mix' })).erreurs.join('\n')).toMatch(/I129.*Mix/);
    expect(T.verifierPlan(q, Object.assign({}, r.e, { veilleChoix: 'garder', activiteVeille: null })).erreurs.join('\n')).toMatch(/I129.*sans activité notée/);
  });
});

// ══ 251 (D1) — UN CRAN PAS PRIS N'EST PAS UNE BAISSE ══════════════════════════════════════════════════════════════════════════════
// La recette du 05/11 : « tu as baissé la charge sur Développé Couché et Rowing et Curl » alors que rien n'avait baissé — les trois cran de
// test n'avaient pas été pris. Une fixture avec un VRAI cran de test (`etat: 'test_propose'`, `haut` non nul, une ligne de rôle `test`) :
// celles de 236 posaient `haut: null`. ⚠️ Les reps restent DANS la zone : sinon la porte du cran (D2) fermerait le cran, la 3e ligne
// repasserait à la charge de travail, et le test passerait pour une autre raison que D1.
const EXOS_H = [
  { slug: 'couche', n: 3, vise: 5, charge: 107.5, haut: { charge: 110, vise: 3, k: 1 }, zone: 'lourd', equip: 'barre', mesure: 'charge_reps' },
  { slug: 'rowing', n: 3, vise: 10, charge: 70, haut: { charge: 72.5, vise: 8, k: 1 }, zone: 'hypertrophie', equip: 'barre', mesure: 'charge_reps' },
  { slug: 'curl', n: 3, vise: 12, charge: 16, haut: { charge: 18, vise: 10, k: 1 }, zone: 'volume', equip: 'haltere', mesure: 'charge_reps' },
  { slug: 'dips', n: 3, vise: 10, charge: 20, haut: null, zone: 'hypertrophie', equip: 'corps', mesure: 'charge_reps' }
];
function planH(faits, extra) {
  let k = 0;
  const id = () => 'h-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  EXOS_H.forEach((x, i) => {
    se = S.ajouterExercice(se, x.slug, id, { series: x.n });
    se.exercices[i].series.forEach((s) => { s.reps_visees = x.vise; });
  });
  let minute = 0;
  EXOS_H.forEach((x, i) => {
    (faits[x.slug] || []).forEach(([ch, reps], j) => {
      se = S.modifierSerie(se, i, j, { charge_kg: ch, reps });
      se = S.valider(se, i, j, new Date(Date.UTC(2026, 10, 3, 10, 0, 0) + (++minute) * 150000));
    });
  });
  ((extra && extra.gestes) || []).forEach((g) => { se = S.noterGeste(se, g); });
  const consignes = {}, catalogue = {};
  EXOS_H.forEach((x) => {
    consignes[x.slug] = { consigne: { etat: x.haut ? 'test_propose' : 'progression', zone: x.zone, palier: x.charge, n: x.n,
      ligne: { charge: x.charge, vise: x.vise }, haut: x.haut },
      contexte: { cran: x.haut ? x.haut.charge : x.charge + 2.5, haut: x.haut }, pas: 2.5 };
    catalogue[x.slug] = { equipement: x.equip, mesure: x.mesure, pas: 2.5, nom: x.slug, muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] };
  });
  const e = Object.assign({
    seance: { id: 'S', debut: '2026-11-03T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes },
    consignes, reglage: (extra && extra.reglage) || 'normal', objectif: (extra && extra.objectif) || 'les_deux', paris: [], catalogue
  }, (extra && extra.entrees) || {});
  return { se, e, p: T.planDeSeance(e) };
}
const FAITS_D1 = { couche: [[107.5, 4], [107.5, 4], [107.5, 4]], rowing: [[70, 9], [70, 9], [70, 9]], curl: [[16, 12], [16, 12], [16, 12]] };

describe('251 D1 — la baisse se lit contre la charge de travail', () => {
  test('⚠️ DISCRIMINANT — trois cran de test non pris, reps dans la zone : la carte sort, aucune baisse citée', () => {
    const { e, p } = planH(FAITS_D1);
    // préalable : le cran est bien réel (sinon le test ne prouve rien)
    EXOS_H.slice(0, 3).forEach((x, i) => {
      expect(p.exercices[i].consigne.etat).toBe('test_propose');
      expect(p.exercices[i].lignes.filter((l) => l.role === 'test')).toHaveLength(1);
    });
    expect(p.formeDuJour.carte).toBe(true);
    const c = p.exercices[3].carteForme;
    expect(c).toBeTruthy();
    expect(sp(c.phrase)).toBe('Tes séries sont sous la cible sur 2 des 3 derniers exercices. Pour la fin de séance ?');
    expect(c.phrase).not.toMatch(/baissé/);
    expect(p.formeDuJour.decision ? p.formeDuJour.decision.baisses : []).toEqual([]);
    propre(p, e);
  });
  test('témoin — la 3e série du couché faite à 105 (sous la charge de travail) : le couché est une baisse', () => {
    const f = Object.assign({}, FAITS_D1, { couche: [[107.5, 4], [107.5, 4], [105, 4]] });
    const { e, p } = planH(f);
    expect(sp(p.exercices[3].carteForme.phrase)).toMatch(/tu as baissé la charge sur couche/);
    propre(p, e);
  });
  test('témoin — une ligne du coach ou d’élan plus lourde, faite à la charge de travail, n’est pas une baisse', () => {
    // couché 107,5 × 8 (très au-dessus de la zone) : le coach propose plus lourd ; la suite faite à 107,5 n’est pas une baisse
    const f = Object.assign({}, FAITS_D1, { couche: [[107.5, 9], [107.5, 4], [107.5, 4]] });
    const { e, p } = planH(f);
    // un seul exercice flanche (le couché, 9 puis 4, 4), aucune baisse : pas de carte (avant 251, trois « baisses » en faisaient une)
    expect(p.formeDuJour.carte).toBeNull();
    expect(p.exercices.some((x) => x.carteForme)).toBe(false);
    propre(p, e);
  });
});
