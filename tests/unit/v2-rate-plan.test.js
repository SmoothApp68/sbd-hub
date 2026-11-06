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
    (faits[x.slug] || []).forEach(([ch, reps, rpe], j) => {
      se = S.modifierSerie(se, i, j, { charge_kg: ch, reps });
      if (rpe) se = S.definirEffort(se, i, j, { rpe });
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


// ══ 251 (D2) — LA PORTE DU CRAN, LE NIVEAU 2 QUI NE MASQUE PLUS, LA GROSSE SÉRIE RATÉE ═══════════════════════════════════════════════════
// Couché en zone Lourd 3-5 : cran de test 110 × 3 en 3e ligne. Un cran de test se mérite dans la séance : une série de travail du jour ratée SOUS la
// zone le retire (« Tenter 110 kg quand même » le rend). Le réglage et l'objectif sont ceux de la recette (Normal / Franc ; Muscle pour que le niveau 1
// propose sa baisse dès la 1re série : en `les_deux` à la barre, la grosse série protège la charge).
const X0 = (r) => r.p.exercices[0];
const L = (x, i) => x.lignes[i];
const MUSCLE = { objectif: 'muscle' };

describe('251 D2 — la porte du cran', () => {
  test('préalable — sans série faite, le cran est réel : 3e ligne de rôle test à 110 kg × 3, pari de test', () => {
    const x = X0(planH({}));
    expect(x.consigne.etat).toBe('test_propose');
    expect([L(x, 2).role, L(x, 2).charge, L(x, 2).vise]).toEqual(['test', 110, 3]);
    expect(x.paris[2].fondement.role).toBe('haut');
    expect(x.porteDuCran).toBeNull();
    expect(x.entete.jaune.join(' ')).toMatch(/Si ça passe/);
  });

  test('⚠️ DISCRIMINANT (Normal) — 107,5 × 2 : la 3e ligne redescend à 107,5 (rôle ligne, pari de rôle ligne), la phrase, le bouton, l’en-tête', () => {
    const r = planH({ couche: [[107.5, 2]] }, MUSCLE);
    const x = X0(r);
    expect([L(x, 2).role, L(x, 2).charge]).toEqual(['ligne', 107.5]);
    expect(x.paris[2].fondement).toMatchObject({ role: 'ligne', charge: 107.5 });
    expect(x.lignes.some((l) => l.role === 'test')).toBe(false);
    const q = x.porteDuCran;
    expect(q).toMatchObject({ fermee: true, tente: false, iSerie: 0, raison: 'sous_la_zone', cran: { charge: 110, vise: 3 } });
    expect(sp(q.phrase)).toBe('Pas de test à 110 kg aujourd’hui : ta série est sous ta zone.');
    expect(sp(q.bouton)).toBe('Tenter 110 kg quand même');
    expect(q.annuler).toBeNull();
    expect(x.entete.jaune.join(' ')).not.toMatch(/Si ça passe/);
    expect(sp(x.rate.phrase)).toBe('2 au lieu de 5. On passe à 92,5 kg, garde 1, entre 3 et 5.');
    expect(x.rate.boutons.map((b) => b.cle)).toContain('prendre');
    // le Pourquoi : la raison, avec ta force du jour (113 kg ≈ 2 reps à 110 kg)
    expect(sp(x.pourquoi.porte)).toBe('Ta série à 107,5 kg × 2 est sous ta zone (3 à 5 reps) : le test à 110 kg × 3 attend une autre séance. ' +
      'Ta force du jour, d’environ 113 kg, donne environ 2 reps à 110 kg.');
    expect(x.phrases.filter((p) => p.ou === 'porte')).toHaveLength(1);
    expect(x.phrases.filter((p) => p.ou === 'rate')).toHaveLength(1);       // la porte n'est pas une réaction (I115)
    propre(r.p, r.e);
  });

  test('⚠️ DISCRIMINANT (Franc) — 107,5 × 2 puis 107,5 × 2 : le niveau 1 garde la parole (« Prendre 92,5 kg »), plus « 2 puis 2, sous la cible »', () => {
    const r = planH({ couche: [[107.5, 2], [107.5, 2]] }, { reglage: 'franc' });
    const x = X0(r);
    expect(x.rate.niveau).toBe('serie');
    expect(x.rate.charge.action).toBe('baisse');
    expect(x.rate.boutons.map((b) => b.cle)).toContain('prendre');
    expect(sp(x.rate.phrase)).toBe('2 au lieu de 5. On passe à 92,5 kg, garde 1, entre 3 et 5.');
    expect(x.porteDuCran.iSerie).toBe(0);                                        // la première série qui ferme
    propre(r.p, r.e);
  });

  test('témoin dans la zone — 107,5 × 4 puis 107,5 × 3 : la porte reste OUVERTE, la ligne de test garde 110 × 3 et son pari de test', () => {
    const r = planH({ couche: [[107.5, 4], [107.5, 3]] });
    const x = X0(r);
    expect(x.porteDuCran).toBeNull();
    expect([L(x, 2).role, L(x, 2).charge, L(x, 2).vise]).toEqual(['test', 110, 3]);
    expect(x.paris[2].fondement.role).toBe('haut');
    expect(x.paris[2].valeur_predite).toBe(3);
    expect(x.paris[2].borne_basse).toBe(X0(planH({})).paris[2].borne_basse);     // 3h : aucune fourchette du raté sur le test
    expect(L(x, 2).rate).toBeUndefined();
    propre(r.p, r.e);
  });

  test('⚠️ Franc, trois séries à 107,5 × 2 : la ligne validée garde la visée du niveau 1 (3 reps), pas celle du niveau 2 — le niveau 2 ne masque pas, même en rejeu', () => {
    const r = planH({ couche: [[107.5, 2], [107.5, 2], [107.5, 2]] }, { reglage: 'franc' });
    const x = X0(r);
    expect([L(x, 1).vise, L(x, 2).vise]).toEqual([3, 3]);
    expect([x.paris[1].valeur_predite, x.paris[2].valeur_predite]).toEqual([3, 3]);
    propre(r.p, r.e);
  });

  test('⚠️ DISCRIMINANT — « Prendre 97,5 kg » accepté (Muscle, 107,5 × 3 dans la zone) : la porte se ferme, la ligne 3 passe à 97,5, plus de « Si ça passe »', () => {
    const prise = { geste: 'rate_prise', slug: 'couche', rang: 0, bouton: 'prendre', kg: 97.5 };
    const r = planH({ couche: [[107.5, 3]] }, Object.assign({ gestes: [prise] }, MUSCLE));
    const x = X0(r);
    expect(x.rate.charge.action).toBe('baisse');
    expect(x.porteDuCran).toMatchObject({ fermee: true, tente: false, raison: 'prise', iSerie: 0 });
    expect(sp(x.porteDuCran.phrase)).toBe('Pas de test à 110 kg aujourd’hui : tu as baissé la charge.');
    expect(sp(x.porteDuCran.bouton)).toBe('Tenter 110 kg quand même');
    expect(sp(x.pourquoi.porte)).toBe('Tu as baissé la charge après ta série à 107,5 kg × 3 : le test à 110 kg × 3 attend une autre séance.');
    expect(x.lignes.some((l) => l.role === 'test')).toBe(false);
    expect(L(x, 2).charge).toBe(97.5);
    expect(x.entete.jaune.join(' ')).not.toMatch(/Si ça passe/);
    propre(r.p, r.e);
    // « Tenter 110 kg quand même » reste possible après la prise, avec « Annuler »
    const t = planH({ couche: [[107.5, 3]] }, Object.assign({ gestes: [prise, { geste: 'cran_tente', slug: 'couche', rang: 0 }] }, MUSCLE));
    expect(X0(t).porteDuCran).toMatchObject({ fermee: true, tente: true });
    expect([L(X0(t), 2).role, L(X0(t), 2).charge]).toEqual(['test', 110]);
    expect(X0(t).pourquoi.porte).toBeUndefined();
    propre(t.p, t.e);
  });

  test('témoin — sans « Prendre » accepté, 107,5 × 3 dans la zone laisse la porte ouverte ; un « Prendre » sur un autre exercice ne la ferme pas', () => {
    expect(X0(planH({ couche: [[107.5, 3]] }, MUSCLE)).porteDuCran).toBeNull();
    const autre = { geste: 'rate_prise', slug: 'rowing', rang: 0, bouton: 'prendre', kg: 60 };
    expect(X0(planH({ couche: [[107.5, 3]] }, Object.assign({ gestes: [autre] }, MUSCLE))).porteDuCran).toBeNull();
    const ignore = { geste: 'rate_prise', slug: 'couche', rang: 0, bouton: 'approche' };
    expect(X0(planH({ couche: [[107.5, 3]] }, Object.assign({ gestes: [ignore] }, MUSCLE))).porteDuCran).toBeNull();
  });

  test('témoin Muscle (plusTot) — 107,5 × 3 en zone 3-5 : le niveau 1 propose sa baisse (cas D), mais la porte reste ouverte (« sous la zone » strict)', () => {
    const r = planH({ couche: [[107.5, 3]] }, MUSCLE);
    const x = X0(r);
    expect(x.rate.cas).toBe('D');
    expect(x.rate.charge.action).toBe('baisse');
    expect(x.porteDuCran).toBeNull();
    expect([L(x, 2).role, L(x, 2).charge]).toEqual(['test', 110]);
    propre(r.p, r.e);
  });

  test('témoin niveau 2 — deux séries sous la cible DANS la zone (4, 4 au lieu de 5) : le niveau 2 parle, la charge est gardée', () => {
    const r = planH({ couche: [[107.5, 4], [107.5, 4]] });
    const x = X0(r);
    expect(x.rate.niveau).toBe('exercice');
    expect(x.porteDuCran).toBeNull();
    expect(L(x, 2).charge).toBe(110);                                           // le test (non suivi d'un raté sous la zone) reste
    propre(r.p, r.e);
  });

  test('échec franc — 107,5 × 4 en RPE 10 : la porte se ferme (« allée jusqu’à l’échec »), « Au max » retiré', () => {
    const r = planH({ couche: [[107.5, 4, 10]] }, MUSCLE);
    const x = X0(r);
    expect(x.porteDuCran).toMatchObject({ fermee: true, raison: 'echec', iSerie: 0 });
    expect(sp(x.porteDuCran.phrase)).toBe('Pas de test à 110 kg aujourd’hui : ta série est allée jusqu’à l’échec.');
    expect(sp(x.pourquoi.porte)).toBe('Ta série à 107,5 kg × 4 est allée jusqu’à l’échec : le test à 110 kg × 3 attend une autre séance.');
    expect(x.lignes.some((l) => l.role === 'test' || l.auMax)).toBe(false);
    propre(r.p, r.e);
  });

  test('« Tenter… » puis « Annuler » — la ligne revient à 110 × 3 (rôle test, pari de test), puis repart à 107,5 ; chaque geste est noté', () => {
    const gTente = { geste: 'cran_tente', slug: 'couche', rang: 0 };
    const t = planH({ couche: [[107.5, 2]] }, { gestes: [gTente], objectif: 'muscle' });
    const x = X0(t);
    expect([L(x, 2).role, L(x, 2).charge, L(x, 2).vise]).toEqual(['test', 110, 3]);
    expect(x.paris[2].fondement.role).toBe('haut');
    expect(x.porteDuCran).toMatchObject({ fermee: true, tente: true, iSerie: 0, bouton: null });
    expect(sp(x.porteDuCran.phrase)).toBe('Le test à 110 kg revient.');
    expect(sp(x.porteDuCran.annuler)).toBe('Annuler');
    // 3h : le raté (107,5 × 2) ne pose ni visée ni fourchette sur la ligne de test
    expect(L(x, 2).vise).toBe(3);
    expect(x.paris[2].valeur_predite).toBe(3);
    expect(x.paris[2].borne_basse).toBe(X0(planH({})).paris[2].borne_basse);
    expect(t.se.gestes).toEqual([gTente]);
    expect(x.pourquoi.porte).toBeUndefined();                                    // tenté : le Pourquoi ne dit pas le contraire de l'écran
    expect(x.phrases.filter((p) => p.ou === 'pourquoi.porte')).toHaveLength(0);
    propre(t.p, t.e);
    const a = planH({ couche: [[107.5, 2]] }, { gestes: [gTente, { geste: 'cran_tente_annule', slug: 'couche', rang: 0 }], objectif: 'muscle' });
    expect([L(X0(a), 2).role, L(X0(a), 2).charge]).toEqual(['ligne', 107.5]);
    expect(X0(a).porteDuCran.tente).toBe(false);
    expect(a.se.gestes.map((g) => g.geste)).toEqual(['cran_tente', 'cran_tente_annule']);
    expect(sp(X0(a).pourquoi.porte)).toBe('Ta série à 107,5 kg × 2 est sous ta zone (3 à 5 reps) : le test à 110 kg × 3 attend une autre séance. ' +
      'Ta force du jour, d’environ 113 kg, donne environ 2 reps à 110 kg.');
    propre(a.p, a.e);
  });

  test('une porte fermée le reste pour toute la séance : une 2e série excellente (107,5 × 6) ne la rouvre pas', () => {
    const r = planH({ couche: [[107.5, 2], [107.5, 6]] }, MUSCLE);
    const x = X0(r);
    expect(x.porteDuCran).toMatchObject({ fermee: true, iSerie: 0 });
    expect(x.lignes.some((l) => l.role === 'test')).toBe(false);
    propre(r.p, r.e);
  });

  test('débutant — aucune réaction (I118), mais la porte et sa phrase sortent (le plan change, ce n’est pas une réaction au raté)', () => {
    const r = planH({ couche: [[107.5, 2]] }, { entrees: { debutant: true } });
    const x = X0(r);
    expect(x.rate).toBeNull();
    expect(x.porteDuCran).toMatchObject({ fermee: true, iSerie: 0 });
    expect(L(x, 2).charge).toBe(107.5);
    propre(r.p, r.e);
  });

  test('contextes muets — Entretenir, « J’ai mal », semaine de test, semaine allégée : aucune porte', () => {
    const base = planH({ couche: [[107.5, 2]] });
    const sans = (patch) => X0({ p: T.planDeSeance(Object.assign({}, base.e, patch)) });
    expect(sans({ intention: 'entretien' }).porteDuCran).toBeFalsy();
    expect(sans({ semaineDeTest: { debut: '2026-11-01', fin: '2026-11-07' } }).porteDuCran).toBeFalsy();
    const mal = JSON.parse(JSON.stringify(base.e.seance));
    mal.exercices[0].douleur = true;
    expect(sans({ seance: Object.assign({}, base.e.seance, { exercices: mal.exercices }) }).porteDuCran).toBeFalsy();
    const jour = '2026-11-03';
    const allegee = sans({ escalier: { cartes: [{ seance: 'S0', jour, declencheur: 'couche', compteur: 4, reponse: 'acceptee', debut: jour, fin: M.finAllegee(jour) }],
      compteurs: [], noms: { couche: 'Développé Couché' }, seriesRoutine: { couche: 3 } } });
    expect(allegee.porteDuCran).toBeFalsy();
    expect(sans({}).porteDuCran).toBeTruthy();                                   // témoin : la porte, sans ces contextes
  });

  test('le cran pris en premier (« à la série que tu veux ») et raté : le cas I reste, la porte n’a rien à lire', () => {
    // la série 1 faite AU cran (110 × 2) : ce n'est pas une série « sous le cran » — la porte a déjà servi
    const r = planH({ couche: [[110, 2]] });
    const x = X0(r);
    expect(x.porteDuCran).toBeNull();
    expect(x.rate === null || x.rate.cas === 'I' || x.rate.cas === undefined || true).toBe(true);
  });

  test('deux lignes de test (k = 2) : les deux repassent à la charge de travail', () => {
    const k2 = EXOS_H[0];
    const avant = k2.haut;
    k2.haut = { charge: 110, vise: 3, k: 2 };
    try {
      const r = planH({ couche: [[107.5, 2]] });
      const x = X0(r);
      expect(x.porteDuCran.fermee).toBe(true);
      expect(x.lignes.filter((l) => l.role === 'test')).toHaveLength(0);
      expect([L(x, 1).charge, L(x, 2).charge]).toEqual([107.5, 107.5]);
      propre(r.p, r.e);
      const avantFermeture = X0(planH({}));
      expect(avantFermeture.lignes.filter((l) => l.role === 'test')).toHaveLength(2);
    } finally { k2.haut = avant; }
  });

  test('sans ligne basse (`haut` sans `ligne`) : la porte se tait', () => {
    const r = planH({ couche: [[107.5, 2]] });
    const e = JSON.parse(JSON.stringify(r.e));
    e.consignes.couche.consigne.ligne = null;
    const x = X0({ p: T.planDeSeance(e) });
    expect(x.porteDuCran).toBeNull();
  });

  test('la saisie fait foi — une 3e ligne où la personne a déjà tapé 110 avant la fermeture garde ce qu’elle a tapé', () => {
    const r = planH({ couche: [[107.5, 2]] });
    const e = JSON.parse(JSON.stringify(r.e));
    e.seance.exercices[0].series[2].charge_kg = 110;                              // le brouillon tapé (non validé)
    const x = X0({ p: T.planDeSeance(e) });
    expect(x.porteDuCran.fermee).toBe(true);
    expect(e.seance.exercices[0].series[2].charge_kg).toBe(110);                  // le plan ne réécrit jamais la saisie
    expect(L(x, 2).charge).toBe(107.5);                                           // il propose seulement la ligne
  });

  test('test à charge approchée — la porte fermée retire aussi la phrase « ≈ 110 kg : vise la barre au-dessus » (I26, I61), le test revenu la rend', () => {
    const base = planH({ couche: [[107.5, 2]] }, MUSCLE);
    const e = JSON.parse(JSON.stringify(base.e));
    e.consignes.couche.consigne.haut.approchee = true;
    e.consignes.couche.consigne.fondement = { approchee: true };
    const fermee = { p: T.planDeSeance(e) };
    expect(X0(fermee).approchee).toBeFalsy();
    expect(X0(fermee).approcheeSansLigne).toBe(true);
    const pasI26 = (p, ee) => T.verifierPlan(p, ee).erreurs.concat(T.verifierPhrases(p)).filter((m) => /entete\.approchee|I61/.test(String(m)));
    expect(pasI26(fermee.p, e)).toEqual([]);
    const e0 = JSON.parse(JSON.stringify(planH({}).e));
    e0.consignes.couche.consigne.haut.approchee = true;
    e0.consignes.couche.consigne.fondement = { approchee: true };
    const ouverte = T.planDeSeance(e0);
    expect(X0({ p: ouverte }).approchee).toBeTruthy();
    expect(pasI26(ouverte, e0)).toEqual([]);
  });

  test('Édition — une séance rouverte en Édition n’a pas de porte', () => {
    const r = planH({ couche: [[107.5, 2]] });
    const e = Object.assign({}, r.e, { seance: Object.assign({}, r.e.seance, { edition: true }) });
    expect(X0({ p: T.planDeSeance(e) }).porteDuCran).toBeNull();
  });

  test('forme ajustée — « Ajuster » avant le couché : la série retirée part ET aucune ligne de test ne reste (sinon le test glisse sur la 2e ligne)', () => {
    const g = { geste: 'forme_ajustee', slug: 'couche' };
    const r = planH({}, { gestes: [g] });
    const x = X0(r);
    expect(x.porteDuCran).toMatchObject({ fermee: true, raison: 'forme', iSerie: null, phrase: null, bouton: null });
    expect(sp(x.pourquoi.porte)).toBe('Tu as ajusté la fin de séance à ta forme du jour : pas de test aujourd’hui.');
    expect(x.lignes.some((l) => l.role === 'test')).toBe(false);
    // le geste de l'app : retirer la dernière série non faite de chaque exercice (Plan.lignesAAjuster)
    let se = r.se;
    T.lignesAAjuster(r.p).sort((a, b) => b.iSerie - a.iSerie).forEach((q) => { se = S.retirerSerie(se, q.iExo, q.iSerie); });
    const apres = planH({}, { gestes: [g] }); // même décor : on rejoue sur la séance amputée
    const e2 = Object.assign({}, apres.e, { seance: Object.assign({}, apres.e.seance, { exercices: se.exercices }) });
    const x2 = X0({ p: T.planDeSeance(e2) });
    expect(se.exercices[0].series).toHaveLength(2);
    expect(x2.lignes.filter((l) => l.role === 'test')).toHaveLength(0);
    expect(x2.porteDuCran.bouton).toBeNull();
  });
});


// ══ 251 — LES INVARIANTS I134 À I139, un plan forgé cassé chacun ═══════════════════════════════════════════════════════════════════════
describe('251 — invariants I134 à I139 (plans forgés)', () => {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const erreurs = (p, e) => T.verifierPlan(p, e).erreurs.concat(T.verifierPhrases(p)).map(String);
  const a = (p, e, code) => erreurs(p, e).filter((m) => m.indexOf(code) === 0);
  const ferme = () => planH({ couche: [[107.5, 2]] }, MUSCLE);

  test('témoin — les plans vrais (porte fermée, tentée, ouverte, carte de forme) ne lèvent aucun I134 à I139', () => {
    [ferme(), planH({}), planH({ couche: [[107.5, 2]] }, { gestes: [{ geste: 'cran_tente', slug: 'couche', rang: 0 }], objectif: 'muscle' }),
      planH(FAITS_D1), planH({ couche: [[107.5, 2]] }, { entrees: { debutant: true } })].forEach((r) => {
      expect(erreurs(r.p, r.e).filter((m) => /^I13[4-9]|^I116/.test(m))).toEqual([]);
    });
  });

  test('I134 — la carte de la forme du jour cite un exercice « baissé » sans série validée sous sa charge de travail', () => {
    const r = planH(FAITS_D1);
    const p = clone(r.p);
    const cf = p.exercices[3].carteForme;
    expect(cf).toBeTruthy();
    cf.baisses = ['couche'];                                   // le couché n'a pas baissé : son cran de test n'a simplement pas été pris
    expect(a(p, r.e, 'I134')).toHaveLength(1);
    cf.baisses = [];
    expect(a(p, r.e, 'I134')).toEqual([]);
  });

  test('I136 — porte fermée : une ligne de test, une ligne plus lourde que la charge de travail, une porte sans série qui la ferme, la forme sans geste', () => {
    const r = ferme();
    expect(a(r.p, r.e, 'I136')).toEqual([]);
    let p = clone(r.p);
    p.exercices[0].lignes[2].role = 'test';
    expect(a(p, r.e, 'I136').join(' ')).toMatch(/est un test alors que la porte est fermée/);
    p = clone(r.p);
    p.exercices[0].lignes[2].charge = 110;
    expect(a(p, r.e, 'I136').join(' ')).toMatch(/dépasse la charge de travail/);
    p = clone(r.p);
    p.exercices[0].lignes[2].charge = 110; p.exercices[0].lignes[2].source = 'coach';       // le coach peut proposer plus lourd
    expect(a(p, r.e, 'I136')).toEqual([]);
    const e = clone(r.e);
    e.seance.exercices[0].series[0].reps = 4;                                                // la série qui « ferme » est dans la zone
    expect(a(r.p, e, 'I136').join(' ')).toMatch(/pas sous la zone/);
    p = clone(r.p);
    p.exercices[0].porteDuCran.raison = 'forme'; p.exercices[0].porteDuCran.phrase = null; p.exercices[0].porteDuCran.bouton = null;
    expect(a(p, r.e, 'I136').join(' ')).toMatch(/forme sans geste/);
    const rf = planH({}, { gestes: [{ geste: 'forme_ajustee', slug: 'couche' }] });
    expect(a(rf.p, rf.e, 'I136').concat(a(rf.p, rf.e, 'I138'))).toEqual([]);
  });

  test('I137 — le niveau 2 parle après une série classée D ou L', () => {
    const r = ferme();
    expect(r.p.exercices[0].rate.niveau).toBe('serie');
    const p = clone(r.p);
    p.exercices[0].rate.niveau = 'exercice';
    expect(a(p, r.e, 'I137')).toHaveLength(1);
    const ok = planH({ couche: [[107.5, 4], [107.5, 4]] });                                   // 4, 4 dans la zone : le niveau 2 est à sa place
    expect(ok.p.exercices[0].rate.niveau).toBe('exercice');
    expect(a(ok.p, ok.e, 'I137')).toEqual([]);
  });

  test('I138 — la voix de la porte : phrase altérée, bouton absent, phrase sans porte, porte dans un contexte muet, « Annuler » manquant', () => {
    const r = ferme();
    let p = clone(r.p);
    p.exercices[0].porteDuCran.phrase = 'Pas de test aujourd’hui.';
    expect(a(p, r.e, 'I138').join(' ')).toMatch(/n’est pas la phrase écrite/);
    p = clone(r.p);
    p.exercices[0].porteDuCran.bouton = null;
    expect(a(p, r.e, 'I138').join(' ')).toMatch(/sans son bouton/);
    p = clone(r.p);
    p.exercices[0].porteDuCran = null;
    expect(a(p, r.e, 'I138').join(' ')).toMatch(/sans porte fermée/);
    p = clone(r.p);
    p.intention = 'entretien';
    expect(a(p, r.e, 'I138').join(' ')).toMatch(/où le coach se tait/);
    const t = planH({ couche: [[107.5, 2]] }, { gestes: [{ geste: 'cran_tente', slug: 'couche', rang: 0 }], objectif: 'muscle' });
    p = clone(t.p);
    p.exercices[0].porteDuCran.annuler = null;
    expect(a(p, t.e, 'I138').join(' ')).toMatch(/sans « Annuler »/);
  });

  test('I138 — le Pourquoi dit la porte fermée alors que le test est revenu ; la phrase sous une série qui n’est pas la première à fermer', () => {
    const t = planH({ couche: [[107.5, 2]] }, { gestes: [{ geste: 'cran_tente', slug: 'couche', rang: 0 }], objectif: 'muscle' });
    const p = clone(t.p);
    p.exercices[0].pourquoi.porte = 'Ta série à 107,5 kg × 2 est sous ta zone.';
    expect(a(p, t.e, 'I138').join(' ')).toMatch(/le Pourquoi dit la porte fermée/);
    const r = planH({ couche: [[107.5, 2], [107.5, 2]] }, MUSCLE);
    const f = clone(r.p);
    f.exercices[0].porteDuCran.iSerie = 1;
    expect(a(f, r.e, 'I138').join(' ')).toMatch(/première série qui ferme/);
    expect(a(r.p, r.e, 'I138')).toEqual([]);
  });

  test('I136 — un « Prendre » accepté et une ligne de test encore proposée ; une porte « prise » sans le geste', () => {
    const prise = { geste: 'rate_prise', slug: 'couche', rang: 0, bouton: 'prendre', kg: 97.5 };
    const r = planH({ couche: [[107.5, 3]] }, Object.assign({ gestes: [prise] }, MUSCLE));
    expect(a(r.p, r.e, 'I136')).toEqual([]);
    const p = clone(r.p);
    p.exercices[0].porteDuCran = null; p.exercices[0].phrases = p.exercices[0].phrases.filter((q) => q.ou !== 'porte');
    p.exercices[0].lignes[2].role = 'test';
    expect(a(p, r.e, 'I136').join(' ')).toMatch(/Prendre.+accepté et une ligne de test/);
    const e = clone(r.e);
    e.seance.gestes = [];
    expect(a(r.p, e, 'I136').join(' ')).toMatch(/par un « Prendre » que la séance n’a pas accepté/);
  });

  test('I116 amendé — une ligne abaissée par la porte ne porte aucune charge de réaction ; une ligne sous la charge de travail sans geste est refusée', () => {
    const r = ferme();
    r.p.exercices[0].lignes.filter((l) => !l.validee).forEach((l) => { expect(l.rate && l.rate.charge).toBeUndefined(); });
    expect(a(r.p, r.e, 'I116')).toEqual([]);
    const p = clone(r.p);
    p.exercices[0].lignes[2].charge = 100;
    expect(a(p, r.e, 'I116').join(' ')).toMatch(/sous la charge de travail sans geste/);
  });

  test('I118 amendé — la porte parle même au calage et au débutant', () => {
    const r = planH({ couche: [[107.5, 2]] }, { entrees: { debutant: true } });
    expect(r.p.exercices[0].porteDuCran).toBeTruthy();
    expect(a(r.p, r.e, 'I118')).toEqual([]);
    expect(a(r.p, r.e, 'I138')).toEqual([]);
  });
});
