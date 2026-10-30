/** @jest-environment node */
//
// 189 — La fatigue sur plusieurs semaines (MOTEUR §14.11, décision d'Aurélien du 30/10/2026, maquette « ok v2 »).
//
//   · un second déclencheur de la MÊME carte : tes séries baissent depuis 3 semaines (valeur du milieu, jamais le maximum ;
//     la réserve quand elle est notée ; 2 séances par fenêtre ; plus de 5 % ; au moins 4 exercices et 40 % des suivis) ;
//   · une fois par épisode : aucune carte de fatigue dans les 4 semaines d'une autre ;
//   · en sèche, une 3ᵉ réponse : « une série de moins jusqu'à la fin de ta sèche » (jamais sous 2, jamais une priorité,
//     aucune série de plus tant qu'elle dure) ;
//   · « Juste un carnet » : aucune carte, un constat ;
//   · le pari de la carte : « tes séries reviennent au niveau d'avant dans les 3 semaines ».

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

// ── LA MATIÈRE : six semaines actives, deux séances par semaine (mardi, vendredi), le lundi 2026-08-31 pour base ──
const BASE = Date.UTC(2026, 7, 31);
const jourN = (n) => new Date(BASE + n * 86400000).toISOString().slice(0, 10);
// Les séances de la semaine w : le mardi (w*7+1) et le vendredi (w*7+4).
const JOURS = [0, 1, 2, 3, 4, 5].reduce((l, w) => l.concat([jourN(w * 7 + 1), jourN(w * 7 + 4)]), []);
const J = jourN(6 * 7 + 1);                       // le mardi de la 7ᵉ semaine : la séance qui s'ouvre
const debuts = (jours) => jours.map((j) => j + 'T10:00:00+02:00');
const serie = (charge, reps, plus) => Object.assign({ charge_kg: charge, reps: reps, type_serie: 'travail' }, plus || {});
// Un exercice : `avant` = la charge de ses séances des 3 premières semaines, `apres` = celle des 3 dernières (6 séances en tout).
function exo(slug, avant, apres, plus) {
  const o = plus || {};
  const seances = JOURS.map((j, i) => ({ jour: j, series: [serie(i < 6 ? avant : apres, o.reps || 5, o.serie)] }));
  return Object.assign({ slug: slug, nom: o.nom || slug, seances: seances, douleurs: [], zones: [], blocs: [] }, o.champs || {});
}
const donnees = (exercices, plus) => Object.assign({ jour: J, seances: debuts(JOURS), periodesAllegees: [], exercices: exercices, pesees: [] }, plus || {});
// n exercices qui baissent de 10 %, m stables.
const lot = (n, m, pas) => {
  const l = [];
  for (let i = 0; i < n; i++) l.push(exo('bas' + i, 100, pas === undefined ? 90 : pas, { nom: ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff', 'Gg', 'Hh', 'Ii'][i % 9] + (i >= 9 ? 'x' : '') }));
  for (let i = 0; i < m; i++) l.push(exo('tient' + i, 100, 100, { nom: 'Tient' + 'abcdefghijklmnopqrstuvwxyz'.charAt(i % 26) }));
  return l;
};

describe('§14.11 — la baisse générale', () => {
  test('5 exercices qui baissent sur 9 suivis : la carte se pose, avec sa matière', () => {
    const b = M.baisseGenerale(donnees(lot(5, 4)));
    expect(b.declenche).toBe(true);
    expect(b.suivis).toBe(9);
    expect(b.baissent).toHaveLength(5);
    expect(b.stables).toBe(4);
    expect(b.moyenne).toBe(10);
    expect(b.ancien.debut).toBe(jourN(0));
    expect(b.recent.fin).toBe(jourN(5 * 7 + 6));
  });

  test('3 exercices ne suffisent pas, 4 oui (même à 100 % des suivis)', () => {
    expect(M.baisseGenerale(donnees(lot(3, 0))).declenche).toBe(false);
    expect(M.baisseGenerale(donnees(lot(4, 0))).declenche).toBe(true);
  });

  test('40 % des exercices suivis : 4 sur 10 passe, 4 sur 11 non ; 39 % (7 sur 18) non, 41 % (9 sur 22) oui', () => {
    expect(M.baisseGenerale(donnees(lot(4, 6))).declenche).toBe(true);
    expect(M.baisseGenerale(donnees(lot(4, 7))).declenche).toBe(false);
    expect(M.baisseGenerale(donnees(lot(7, 11))).declenche).toBe(false);
    expect(M.baisseGenerale(donnees(lot(9, 13))).declenche).toBe(true);
  });

  test('plus de 5 % : 4,9 % ne baisse pas, 5,1 % baisse, 5 % pile non', () => {
    const avec = (apres) => M.baisseGenerale(donnees(lot(4, 0, apres)));
    expect(avec(95.1).declenche).toBe(false);      // −4,9 %
    expect(avec(94.9).declenche).toBe(true);       // −5,1 %
    expect(avec(95).declenche).toBe(false);        // −5 % pile : « plus de 5 % »
  });

  test('la valeur du milieu, jamais le maximum : une séance haute d\'avant ne fait pas baisser un exercice stable', () => {
    // Avant : 100, 100, 100, 100, 100, 140 (un pic) ; après : 100 × 6. Le maximum dirait −28 %, le milieu 0.
    const seances = JOURS.map((j, i) => ({ jour: j, series: [serie(i === 5 ? 140 : 100, 5)] }));
    const x = { slug: 'pic', nom: 'Pic', seances: seances, douleurs: [], zones: [], blocs: [] };
    const b = M.baisseGenerale(donnees([x].concat(lot(3, 0, 100))));
    expect(b.baissent).toEqual([]);
    expect(b.lignes.filter((l) => l.slug === 'pic')[0].baisse).toBeCloseTo(0, 5);
  });

  test('moins de séances ne fait pas baisser le chiffre : 3 séances d\'un côté, 2 de l\'autre, au même niveau', () => {
    const seances = JOURS.filter((j, i) => i !== 9 && i !== 11).map((j) => ({ jour: j, series: [serie(100, 5)] }));
    const x = { slug: 'moins', nom: 'Moins', seances: seances, douleurs: [], zones: [], blocs: [] };
    const b = M.baisseGenerale(donnees([x]));
    expect(b.lignes[0].baisse).toBeCloseTo(0, 5);
  });

  test('au moins 2 séances dans chaque fenêtre : une seule séance récente, l\'exercice n\'est pas compté', () => {
    const seances = JOURS.filter((j, i) => i < 6 || i === 11).map((j, i) => ({ jour: j, series: [serie(i < 6 ? 100 : 50, 5)] }));
    const x = { slug: 'seul', nom: 'Seul', seances: seances, douleurs: [], zones: [], blocs: [] };
    const b = M.baisseGenerale(donnees([x].concat(lot(4, 0))));
    expect(b.suivis).toBe(4);
    expect(b.lignes.map((l) => l.slug)).not.toContain('seul');
    expect(b.nonComptes).toEqual([]);
  });

  test('la réserve notée compte : 100 kg × 7 avec 3 en réserve vaut 10 reps', () => {
    const v = M.valeurDeFatigue(serie(100, 7, { ressenti: 'reste_3_plus' }));
    expect(v.reserve).toBe(true);
    expect(v.valeur).toBeCloseTo(M.unRMEpley(100, 10), 8);
    expect(M.valeurDeFatigue(serie(100, 7, { rpe: 7 })).valeur).toBeCloseTo(M.unRMEpley(100, 10), 8);
    expect(M.valeurDeFatigue(serie(100, 7)).reserve).toBe(false);
    expect(M.valeurDeFatigue(serie(100, 7)).valeur).toBeCloseTo(M.unRMEpley(100, 7), 8);
  });

  test('à réserve égale : lever le pied volontairement n\'est pas de la fatigue', () => {
    // Avant : 100 × 10 à fond ; après : 100 × 7 avec 3 en réserve (même effort) — brut, c'est −23 %, avec la réserve, 0.
    const x = (slug) => exo(slug, 100, 100, { champs: {
      seances: JOURS.map((j, i) => ({ jour: j, series: [i < 6 ? serie(100, 10, { ressenti: 'reste_0' }) : serie(100, 7, { ressenti: 'reste_3_plus' })] })) } });
    const quatre = ['a', 'b', 'c', 'd'].map(x);
    expect(M.baisseGenerale(donnees(quatre)).declenche).toBe(false);
    const brut = ['a', 'b', 'c', 'd'].map((s) => exo(s, 100, 100, { champs: {
      seances: JOURS.map((j, i) => ({ jour: j, series: [serie(100, i < 6 ? 10 : 7)] })) } }));
    expect(M.baisseGenerale(donnees(brut)).declenche).toBe(true);
    // « à réserve égale » ne se dit que si une réserve a compté.
    expect(M.baisseGenerale(donnees(quatre)).reserve).toBe(true);
    expect(M.baisseGenerale(donnees(brut)).reserve).toBe(false);
  });

  test('exclus : chauffes, séries de test, séries hors calcul, hors de 1 à 12 reps', () => {
    expect(M.valeurDeFatigue(serie(60, 8, { type_serie: 'echauffement' }))).toBeNull();
    expect(M.valeurDeFatigue(serie(120, 1, { type_serie: 'test' }))).toBeNull();
    expect(M.valeurDeFatigue(serie(100, 5, { hors_calcul: true }))).toBeNull();
    expect(M.valeurDeFatigue(serie(100, 13))).toBeNull();
    expect(M.valeurDeFatigue(serie(100, 12))).not.toBeNull();
    expect(M.valeurDeFatigue(serie(100, 0))).toBeNull();
    expect(M.valeurDeFatigue(serie(null, 8))).toBeNull();
    // Le test d'un jour ne change pas la meilleure série retenue.
    const seances = JOURS.map((j, i) => ({ jour: j, series: [serie(100, 5), serie(200, 1, { type_serie: 'test' })] }));
    const b = M.baisseGenerale(donnees([{ slug: 't', nom: 'T', seances: seances, douleurs: [], zones: [], blocs: [] }]));
    expect(b.lignes[0].avant).toBeCloseTo(M.unRMEpley(100, 5), 8);
  });

  test('« J\'ai mal » dans les 6 semaines : l\'exercice n\'est pas compté, et la table le dit', () => {
    const l = lot(4, 0);
    l.push(exo('mal', 100, 80, { nom: 'Leg curl', champs: { douleurs: [jourN(10)] } }));
    const b = M.baisseGenerale(donnees(l));
    expect(b.suivis).toBe(4);
    expect(b.nonComptes).toEqual([{ slug: 'mal', nom: 'Leg curl', raison: 'douleur' }]);
    // Hors des 6 semaines, la douleur ne compte pas.
    const l2 = lot(4, 0);
    l2.push(exo('mal', 100, 100, { champs: { douleurs: [jourN(-30)] } }));
    expect(M.baisseGenerale(donnees(l2)).nonComptes).toEqual([]);
  });

  test('une zone changée, un bloc changé : l\'exercice n\'est pas compté', () => {
    const l = lot(4, 0);
    l.push(exo('curl', 100, 80, { nom: 'Curl', champs: { zones: [jourN(20)] } }));
    l.push(exo('rdl', 100, 80, { nom: 'Soulevé roumain', champs: { blocs: [jourN(22)] } }));
    const b = M.baisseGenerale(donnees(l));
    expect(b.suivis).toBe(4);
    expect(b.nonComptes.map((x) => x.raison).sort()).toEqual(['bloc', 'zone']);
  });

  test('les séances allégées (une semaine allégée, une décharge) ne comptent pas', () => {
    // Les 6 séances récentes tombent dans une période allégée : plus aucune fenêtre récente n'a ses 2 séances.
    const b = M.baisseGenerale(donnees(lot(4, 0), { periodesAllegees: [{ debut: jourN(21), fin: jourN(41) }] }));
    expect(b.declenche).toBe(false);
  });

  // Les jours de séance « réguliers » : tous les `pas` jours de a à b (numéros de jour depuis BASE).
  const reguliers = (a, b, pas) => { const l = []; for (let n = a; n <= b; n += pas) l.push(jourN(n)); return l; };
  test('une coupure dans les 6 semaines : pas de carte', () => {
    // Un rythme de tous les 2 jours, sauf un trou de 9 jours au milieu de la fenêtre d'avant (> 3 × l'écart habituel).
    const jours = reguliers(0, 16, 2).concat(reguliers(26, 40, 2));
    const b = M.baisseGenerale(donnees(lot(4, 0), { seances: debuts(jours.concat(reguliers(41, 41, 1))) }));
    expect(b.raison).toBe('coupure');
    expect(b.declenche).toBe(false);
    // Sans le trou, la carte se pose.
    expect(M.baisseGenerale(donnees(lot(4, 0), { seances: debuts(reguliers(0, 41, 2)) })).declenche).toBe(true);
  });
  test('ou dans les 3 semaines qui précèdent les six : pas de carte ; plus loin, la carte se pose', () => {
    // Une reprise le jour 4 de la fenêtre-avant (après un trou), 10 jours avant son début : dans les 21 jours qui la précèdent.
    const tot = reguliers(-30, -22, 2).concat(reguliers(-9, 41, 2));
    expect(M.baisseGenerale(donnees(lot(4, 0), { seances: debuts(tot) })).raison).toBe('coupure');
    // Une reprise 28 jours avant le début de la fenêtre : au-delà des 3 semaines, elle ne compte plus.
    const loin = reguliers(-60, -52, 2).concat(reguliers(-28, 41, 2));
    expect(M.baisseGenerale(donnees(lot(4, 0), { seances: debuts(loin) })).declenche).toBe(true);
  });

  test('moins de six semaines actives : rien', () => {
    const jours = JOURS.slice(4);
    const b = M.baisseGenerale(donnees(lot(4, 0), { seances: debuts(jours) }));
    expect(b.declenche).toBe(false);
    expect(b.raison).toBe('semaines');
  });

  test('une semaine sans séance ne compte pas : les six semaines actives sautent le trou', () => {
    // Les séances de la 3ᵉ semaine (w = 2) disparaissent : les six semaines actives remontent d'une semaine.
    const jours = JOURS.filter((j, i) => i < 4 || i > 5);
    const l = lot(4, 0).map((x) => Object.assign({}, x, { seances: x.seances.filter((s) => jours.indexOf(s.jour) >= 0) }));
    const b = M.baisseGenerale(donnees(l, { seances: debuts(jours) }));
    expect(b.raison).toBe('semaines');   // 5 semaines actives seulement
  });

  test('le poids se dit seulement avec une pesée dans chaque fenêtre', () => {
    const l = lot(4, 0);
    expect(M.baisseGenerale(donnees(l, { pesees: [{ date: jourN(2), poids: 84.2 }, { date: jourN(30), poids: 82.6 }] })).poids)
      .toEqual({ avant: 84.2, apres: 82.6 });
    expect(M.baisseGenerale(donnees(l, { pesees: [{ date: jourN(2), poids: 84.2 }] })).poids).toBeNull();
    expect(M.baisseGenerale(donnees(l)).poids).toBeNull();
  });
});

describe('§14.11 — une fois par épisode', () => {
  const carte = (jour) => ({ jour: jour, seance: 'X', declencheur: 'a', compteur: null, reponse: 'refusee', cites: [] });
  test('27 jours après une carte : aucune ; 28 jours : oui', () => {
    expect(M.fatigueAutorisee([carte(jourN(0))], jourN(27))).toBe(false);
    expect(M.fatigueAutorisee([carte(jourN(0))], jourN(28))).toBe(true);
    expect(M.fatigueAutorisee([], jourN(0))).toBe(true);
  });
  test('une carte du blocage généralisé compte aussi (quel que soit le déclencheur)', () => {
    expect(M.fatigueAutorisee([Object.assign(carte(jourN(3)), { source: 'blocage' })], jourN(10))).toBe(false);
  });
});

// ── LE PLAN ─────────────────────────────────────────────────────────────────
const NOMS = { couche: 'Développé couché', squat: 'Squat', rowing: 'Rowing', curl: 'Curl' };
const C = (zone) => ({ etat: 'test_propose', zone: zone || 'hypertrophie', palier: 100, niveau: 8, n: 4,
  ligne: { charge: 100, vise: 8 }, haut: { charge: 105, vise: 6, k: 1 }, fondement: {} });
function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 'f' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  const series = opt.series || { couche: 4 };
  Object.keys(series).forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: series[slug] }); });
  if (opt.geste) se = opt.geste(se, id);
  const consignes = {};
  Object.keys(series).forEach((slug) => {
    const k = C();
    consignes[slug] = { consigne: k, libelles: M.libellesConsigne(k),
      compteur: { compteur: 1, meilleur: { palier: 100, niveau: 8 }, blocages: [] } };
  });
  const rout = {};
  Object.keys(series).forEach((slug) => { rout[slug] = series[slug]; });
  const e = { seance: { id: 'S1', debut: J + 'T10:00:00+02:00', edition: opt.edition === true, exercices: se.exercices },
    consignes: consignes, reglage: 'normal', paris: [], suites: {}, phase: opt.phase || 'recomposition',
    intention: opt.intention || null, priorites: opt.priorites || [],
    escalier: Object.assign({ cartes: opt.cartes || [], compteurs: [], noms: NOMS, seriesRoutine: rout,
      baisse: opt.baisse === undefined ? donnees(lot(5, 4), { pesees: [{ date: jourN(2), poids: 84.2 }, { date: jourN(30), poids: 82.6 }] }) : opt.baisse,
      serieDeMoins: { active: opt.moins === true }, prioritaires: opt.prioritaires || [] }, opt.escalier || {}) };
  return { e: e, p: T.planDeSeance(e) };
}

describe('§14.11 — la carte, dans le plan', () => {
  test('la carte de baisse : titre, fait avec la réserve absente, détail, « Pourquoi », aucune violation', () => {
    const { e, p } = decor();
    expect(p.carte.source).toBe('baisse');
    expect(p.carte.titre).toBe('Tes séries baissent depuis 3 semaines');
    expect(p.carte.phrase).toBe('Aa, Bb, Cc et 2 autres exercices sont plus bas que les 3 semaines d’avant : −10 % en moyenne.');
    expect(p.carte.detail).toMatch(/^Quand plusieurs exercices baissent ensemble, c’est souvent de la fatigue\. Je te propose une semaine allégée/);
    expect(p.carte.oui).toBe('Alléger 7 jours');
    expect(p.carte.serieDeMoins).toBeNull();
    expect(p.carte.pourquoi.lignes).toHaveLength(5);
    expect(p.carte.pourquoi.stables).toBe('4 exercices sur 9');
    expect(p.carte.pourquoi.methode).toMatch(/Je ne repropose pas avant 4 semaines\.$/);
    expect(p.carte.avant.bas0).toBeCloseTo(M.unRMEpley(100, 5), 8);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('plus de 4 exercices : les 3 premiers, puis « et N autres exercices »', () => {
    const t = M.phraseBaisse(['A', 'B', 'C', 'D', 'E'], 6, true, null);
    expect(t).toBe('A, B, C et 2 autres exercices sont plus bas que les 3 semaines d’avant : −6 % en moyenne, à réserve égale.');
    expect(M.phraseBaisse(['A', 'B', 'C', 'D'], 6, false, null)).toMatch(/^A, B, C et D sont plus bas/);
  });

  test('hors sèche : pas de poids, pas de 3ᵉ réponse ; en sèche : le poids (avec une pesée de chaque côté) et la 3ᵉ réponse', () => {
    const horsSeche = decor().p.carte;
    expect(horsSeche.phrase).not.toMatch(/poids/);
    const seche = decor({ phase: 'seche' });
    expect(seche.p.carte.phrase).toMatch(/Pendant ce temps, ton poids est passé de 84,2 à 82,6 kg\.$/);
    expect(seche.p.carte.serieDeMoins).toBe('Une série de moins jusqu’à la fin de ta sèche');
    expect(seche.p.carte.detail).toBe('Quand plusieurs exercices baissent ensemble, c’est souvent de la fatigue, et une sèche en ajoute. Deux façons d’y répondre :');
    expect(T.verifierPlan(seche.p, seche.e).erreurs).toEqual([]);
    // Sans pesée dans chaque fenêtre : le poids ne se dit pas, aucune excuse.
    const sans = decor({ phase: 'seche', baisse: donnees(lot(5, 4)) });
    expect(sans.p.carte.phrase).not.toMatch(/poids/);
    expect(sans.p.carte.serieDeMoins).not.toBeNull();
  });

  test('le réglage ne change rien ici', () => {
    ['prudent', 'normal', 'franc'].forEach((r) => {
      const { e } = decor();
      const p = T.planDeSeance(Object.assign({}, e, { reglage: r }));
      expect(p.carte && p.carte.source).toBe('baisse');
    });
  });

  test('« Juste un carnet » : aucune carte ; le constat se lit', () => {
    const { p } = decor({ intention: 'entretien' });
    expect(p.carte).toBeNull();
    const c = M.constatDeBaisse(donnees(lot(5, 4)));
    expect(c.titre).toBe('Tes séries baissent depuis 3 semaines');
    expect(c.texte).toMatch(/plus bas que les 3 semaines d’avant/);
    expect(M.constatDeBaisse(donnees(lot(2, 4)))).toBeNull();
  });

  test('jamais deux cartes : les deux déclencheurs la même séance, une seule carte, le texte de la baisse', () => {
    // Le blocage généralisé : un exercice à 4 (le jour même) et deux autres à 4+ dans les 7 jours.
    const compteurs = [{ exercice: 'squat', jour: jourN(6 * 7 - 2), compteur: 4, seance: 'X1' },
      { exercice: 'rowing', jour: jourN(6 * 7 - 1), compteur: 5, seance: 'X2' }];
    const un = decor({ baisse: null, escalier: { compteurs: compteurs } });
    // le déclencheur du jour : le compteur de `couche` à 4 (consigne figée)
    const e1 = un.e;
    e1.consignes.couche.compteur.compteur = 4;
    const seul = T.planDeSeance(e1);
    expect(seul.carte.source).toBe('blocage');
    const deux = decor({ escalier: { compteurs: compteurs } });
    deux.e.consignes.couche.compteur.compteur = 4;
    const p = T.planDeSeance(deux.e);
    expect(p.carte.source).toBe('baisse');
    expect(p.carte.declencheur).toBe('couche');
    expect(p.carte.compteur).toBe(4);
    expect(p.carte.cites).toEqual(expect.arrayContaining(['bas0', 'couche', 'squat', 'rowing']));
    expect(T.verifierPlan(p, deux.e).erreurs).toEqual([]);
  });

  test('aucune carte dans les 4 semaines d\'une autre (refusée, acceptée, ou du blocage généralisé)', () => {
    const refus = { seance: 'S0', jour: jourN(6 * 7 + 1 - 27), declencheur: 'couche', compteur: 4, reponse: 'refusee' };
    expect(decor({ cartes: [refus] }).p.carte).toBeNull();
    const ok = { seance: 'S0', jour: jourN(6 * 7 + 1 - 28), declencheur: 'couche', compteur: 4, reponse: 'refusee' };
    expect(decor({ cartes: [ok] }).p.carte).not.toBeNull();
  });

  test('aucune carte pendant une semaine allégée, ni pendant la série de moins', () => {
    const allegee = { seance: 'S0', jour: jourN(6 * 7 - 1), declencheur: 'couche', compteur: 4, reponse: 'acceptee',
      debut: jourN(6 * 7 - 1), fin: M.finAllegee(jourN(6 * 7 - 1)) };
    expect(decor({ cartes: [allegee] }).p.carte).toBeNull();
    expect(decor({ phase: 'seche', moins: true }).p.carte).toBeNull();
  });

  test('la séance qui a répondu ne revoit pas la carte', () => {
    const r = { seance: 'S1', jour: J, declencheur: 'bas0', compteur: null, reponse: 'refusee', source: 'baisse', cites: ['bas0'] };
    expect(decor({ cartes: [r] }).p.carte).toBeNull();
  });
});

describe('§14.11 — le pari de la carte de baisse', () => {
  const carte = (plus) => Object.assign({ jour: jourN(0), seance: 'S1', declencheur: 'a', compteur: null, reponse: 'acceptee',
    debut: jourN(0), fin: jourN(6), source: 'baisse', avant: { a: 100, b: 100 }, cites: ['a', 'b'] }, plus || {});
  const mat = (apres) => {
    const exos = ['a', 'b'].map((s) => ({ slug: s, nom: s, seances: [jourN(8), jourN(12), jourN(15), jourN(19), jourN(22)]
      .map((j) => ({ jour: j, series: [serie(apres, 1)] })), douleurs: [], zones: [], blocs: [] }));
    return { jour: jourN(30), seances: debuts([jourN(8), jourN(12), jourN(15), jourN(19), jourN(22), jourN(28)]), periodesAllegees: [], exercices: exos };
  };
  // 100 kg × 1 se lit unRMEpley(100, 1) : la valeur d'avant est celle de la carte.
  const avant = M.unRMEpley(100, 1);
  test('cartesDesParis lit la source et la valeur d\'avant', () => {
    const l = { id: 'p', module: 'escalier', fondement: { marche: 'semaine_allegee', reponse: 'acceptee', source: 'baisse', jour: jourN(0),
      debut: jourN(0), fin: jourN(6), declencheur: 'a', compteur: null, cites: ['a'], avant: { a: 100 } } };
    const c = M.cartesDesParis([l])[0];
    expect(c.source).toBe('baisse');
    expect(c.avant).toEqual({ a: 100 });
    // Un pari du blocage généralisé n'a pas de source de baisse, et son observation ne change pas.
    const b = M.cartesDesParis([{ id: 'q', module: 'escalier', fondement: { marche: 'semaine_allegee', reponse: 'acceptee', jour: jourN(0), declencheur: 'a', compteur: 4 } }])[0];
    expect(b.source).toBe('blocage');
  });
  test('la baisse ne s\'observe pas sur le compteur du déclencheur', () => {
    expect(M.observationSemaineAllegee(carte({ compteur: 4 }), [{ exercice: 'a', jour: jourN(10), compteur: 0 }])).toBeNull();
  });
  test('revenu à 98 % : 1 ; resté sous 98 % : 0 ; fenêtre pas refermée : rien', () => {
    const c = carte({ avant: { a: avant, b: avant } });
    expect(M.observationBaisse(c, mat(100)).valeur).toBe(1);
    expect(M.observationBaisse(c, mat(98.5)).valeur).toBe(1);
    expect(M.observationBaisse(c, mat(97)).valeur).toBe(0);
    const ouverte = mat(100);
    ouverte.seances = debuts([jourN(8), jourN(12), jourN(15), jourN(19)]);
    expect(M.observationBaisse(c, ouverte)).toBeNull();
  });
  test('refusée : jamais observée ; la série de moins s\'observe depuis le jour de la réponse', () => {
    const c = carte({ avant: { a: avant, b: avant } });
    expect(M.observationBaisse(Object.assign({}, c, { reponse: 'refusee' }), mat(100))).toBeNull();
    const m = Object.assign({}, c, { reponse: M.REPONSE_SERIE_DE_MOINS, debut: null, fin: null });
    expect(M.observationBaisse(m, mat(100)).valeur).toBe(1);
  });
});

describe('§14.11 — une série de moins jusqu\'à la fin de ta sèche', () => {
  const sec = (o) => decor(Object.assign({ phase: 'seche', moins: true, baisse: null }, o || {}));
  test('la décision vaut pour la sèche où elle a été donnée', () => {
    const r = { r: 'oui', le: J, depuis: '2026-09-01' };
    expect(M.serieDeMoinsValable(r, 'seche', '2026-09-01')).toBe(true);
    expect(M.serieDeMoinsValable(r, 'recomposition', '2026-09-01')).toBe(false);   // la sèche est finie
    expect(M.serieDeMoinsValable(r, 'seche', '2026-12-01')).toBe(false);           // une autre sèche : jamais en silence
    expect(M.serieDeMoinsValable(null, 'seche', null)).toBe(false);
    expect(M.serieDeMoinsValable({ r: 'oui', le: J, depuis: null }, 'seche', null)).toBe(true);
  });
  test('4 séries → 3, 3 → 2, 2 → 2, 1 → 1 (jamais sous 2)', () => {
    expect([1, 2, 3, 4, 5, 6].map(M.seriesDeMoins)).toEqual([1, 2, 2, 3, 4, 5]);
    const { p } = sec({ series: { couche: 4, squat: 3, rowing: 2 } });
    const m = (s) => p.exercices.filter((x) => x.slug === s)[0].consigne.serieDeMoins;
    expect(m('couche')).toEqual({ routine: 4, series: 3 });
    expect(m('squat')).toEqual({ routine: 3, series: 2 });
    expect(m('rowing')).toEqual({ routine: 2, series: 2 });
  });
  test('le gris et le bandeau', () => {
    const { p } = sec({ series: { couche: 4, rowing: 2 } });
    const g = (s) => p.exercices.filter((x) => x.slug === s)[0].entete.moins;
    expect(g('couche')).toBe('3 séries au lieu de 4, pendant ta sèche');
    expect(g('rowing')).toBe('2 séries, comme ta routine');
    expect(p.serieDeMoins.bandeau).toBe('Pendant ta sèche : une série de moins par exercice (jamais sous 2). Les charges suivent leur cours.');
    expect(p.serieDeMoins.libelle).toBe('Revenir à mes séries');
  });
  test('une priorité n\'est jamais touchée', () => {
    const { e, p } = sec({ series: { couche: 4, squat: 4 }, prioritaires: ['squat'] });
    expect(p.exercices.filter((x) => x.slug === 'squat')[0].consigne.serieDeMoins).toBeUndefined();
    expect(p.exercices.filter((x) => x.slug === 'couche')[0].consigne.serieDeMoins).toEqual({ routine: 4, series: 3 });
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('la ligne en moins : la dernière non validée, une seule fois, jamais sous 2, la structure vivante fait foi', () => {
    const { p } = sec({ series: { couche: 4, rowing: 2 } });
    const enlever = T.lignesAEnlever(p);
    expect(enlever).toEqual([{ iExo: 0, iSerie: 3 }]);
    // Une série déjà validée n'est jamais retirée : la dernière libre est celle d'avant.
    const valide = sec({ series: { couche: 4 }, geste: (se, id) => {
      const s = se.exercices[0].series;
      return S.validerSerie ? se : se;
    } });
    expect(valide.p).toBeTruthy();
    // La structure a bougé (la personne a ajouté une série : 5 lignes pour 4 en routine) : rien n'est retiré.
    const bouge = sec({ series: { couche: 5 }, escalier: { seriesRoutine: { couche: 4 } } });
    expect(T.lignesAEnlever(bouge.p)).toEqual([]);
    // Déjà réduite (3 lignes pour 4 en routine) : rien de plus.
    const reduit = sec({ series: { couche: 3 }, escalier: { seriesRoutine: { couche: 4 } } });
    expect(T.lignesAEnlever(reduit.p)).toEqual([]);
  });
  test('l\'arrêt : « Revenir à mes séries » (décision absente) rend la routine', () => {
    const { p } = decor({ phase: 'seche', moins: false, baisse: null, series: { couche: 4 } });
    expect(p.serieDeMoins).toBeNull();
    expect(T.lignesAEnlever(p)).toEqual([]);
    expect(p.exercices[0].consigne.serieDeMoins).toBeUndefined();
  });
  test('la fin de la sèche : la phase quitte la sèche, plus de ligne en moins', () => {
    const r = { r: 'oui', le: J, depuis: '2026-09-01' };
    const active = M.serieDeMoinsValable(r, 'recomposition', '2026-09-01');
    const { p } = decor({ phase: 'recomposition', moins: active, baisse: null });
    expect(p.serieDeMoins).toBeNull();
    expect(M.PHRASE_SERIES_REVENUES).toBe('Tes séries reviennent à ta routine.');
  });
  test('les charges suivent leur cours : la consigne garde sa ligne et sa ligne haute', () => {
    const { p } = sec({ series: { couche: 4 } });
    const k = p.exercices[0].consigne;
    expect(k.ligne).toEqual({ charge: 100, vise: 8 });
    expect(k.haut).toEqual({ charge: 105, vise: 6, k: 1 });
  });
  test('aucune série de plus tant qu\'elle dure', () => {
    // Phase gelée de la séance : récomposition (la série de plus serait permise) ; la décision du profil est en cours.
    const e = decor({ moins: true, baisse: null, series: { couche: 4 } }).e;
    e.escalier.compteurs = [{ exercice: 'couche', jour: jourN(6 * 7 - 3), compteur: 4, seance: 'X1' }];
    e.consignes.couche.compteur.compteur = 4;
    e.volume = null;
    const p = T.planDeSeance(e);
    expect(p.exercices[0].consigne.serieDePlus).toBeUndefined();
    expect(p.exercices[0].escalier && p.exercices[0].escalier.marche).not.toBe('serie_de_plus');
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('pas pendant une semaine allégée', () => {
    const allegee = { seance: 'S0', jour: jourN(6 * 7 - 1), declencheur: 'couche', compteur: 4, reponse: 'acceptee',
      debut: jourN(6 * 7 - 1), fin: M.finAllegee(jourN(6 * 7 - 1)) };
    const { p } = sec({ cartes: [allegee] });
    expect(p.serieDeMoins).toBeNull();
    expect(p.exercices[0].consigne.serieDeMoins).toBeUndefined();
    expect(p.exercices[0].consigne.allegee).toBeTruthy();
  });
  test('pas en Édition ni en « Juste un carnet »', () => {
    expect(sec({ edition: true }).p.serieDeMoins).toBeNull();
    expect(sec({ intention: 'entretien' }).p.serieDeMoins).toBeNull();
  });
});

describe('I77 — les violations se voient', () => {
  const erreurs = (p, e) => T.verifierPlan(p, e).erreurs.filter((x) => /^I77/.test(x));
  test('une série de moins sous 2', () => {
    const { e, p } = decor({ phase: 'seche', moins: true, baisse: null, series: { couche: 4 } });
    p.exercices[0].consigne.serieDeMoins = { routine: 4, series: 1 };
    expect(erreurs(p, e).join(' ')).toMatch(/sous 2 séries/);
    p.exercices[0].consigne.serieDeMoins = { routine: 4, series: 2 };
    expect(erreurs(p, e).join(' ')).toMatch(/plus d.une série de moins/);
  });
  test('une série de moins sur une priorité', () => {
    const { e, p } = decor({ phase: 'seche', moins: true, baisse: null, series: { couche: 4 } });
    e.escalier.prioritaires = ['couche'];
    expect(erreurs(p, e).join(' ')).toMatch(/sur une priorité/);
  });
  test('une série de plus pendant la série de moins', () => {
    const { e, p } = decor({ phase: 'seche', moins: true, baisse: null, series: { couche: 4 } });
    p.exercices[0].consigne.serieDePlus = { routine: 4 };
    expect(erreurs(p, e).join(' ')).toMatch(/série de plus pendant la série de moins/);
  });
  test('une carte de fatigue dans les 4 semaines d\'une autre', () => {
    const { e, p } = decor();
    expect(erreurs(p, e)).toEqual([]);
    e.escalier.cartes = [{ seance: 'S0', jour: jourN(6 * 7 - 10), reponse: 'refusee', declencheur: 'x' }];
    expect(erreurs(p, e).join(' ')).toMatch(/dans les 28 jours d.une autre/);
  });
  test('une carte de baisse qui cite moins de 4 exercices', () => {
    const { e, p } = decor();
    p.carte.cites = ['bas0'];
    expect(erreurs(p, e).join(' ')).toMatch(/moins de 4 exercices/);
  });
  test('la 3ᵉ réponse hors sèche', () => {
    const { e, p } = decor();
    p.carte.serieDeMoins = 'Une série de moins jusqu’à la fin de ta sèche';
    expect(erreurs(p, e).join(' ')).toMatch(/hors sèche/);
  });
});
