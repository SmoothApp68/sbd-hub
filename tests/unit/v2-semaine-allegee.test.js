/** @jest-environment node */
//
// 49-U14 — l'escalier, première marche : la semaine allégée (MOTEUR §14.4,
// delta 49-31). Quand plusieurs exercices calent ensemble, une carte en tête de
// la séance ; acceptée, 7 jours allégés (même charge, 60 % des séries, 2 reps
// de moins, rien ne monte) ; le compteur ignore les séances de la période.
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u14-semaine-allegee.json` sort de
// `coach49.py` (Claude.ai, 01/10/2026) : 16 détections, 14 consignes allégées,
// 3 séquences de mémoire, 3 bandeaux, 2 compteurs. Les noms d'exercices y
// servent d'identifiants. Un cas qui semble faux se rapporte ; il ne se
// corrige pas ici.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const F = require('./fixtures/cas-49u14-semaine-allegee.json');
// Le × du formateur (chargeFois) est entouré d'insécables.
const surFormateur = (s) => s.replace(/ × /g, '\u00a0×\u00a0');
const octets = (s) => (s === null || s === undefined ? s : Buffer.from(s, 'utf8').toString('hex'));
const consigneDuCas = (k) => ({ etat: k.etat, zone: k.zone[0], ligne: { charge: k.ligne[0], vise: k.ligne[1] },
  haut: k.haut ? { charge: k.haut[0], vise: k.haut[1], k: k.haut[2] } : null });

describe('§14.4 — les cas du simulateur', () => {
  test('le fichier : 16 détections, 14 consignes, 3 mémoires, 3 bandeaux, 2 compteurs', () => {
    expect(F.detection).toHaveLength(16);
    expect(F.consigne_allegee).toHaveLength(14);
    expect(F.memoire).toHaveLength(3);
    expect(F.bandeau).toHaveLength(3);
    expect(F.compteur_decharge).toHaveLength(2);
  });

  F.detection.forEach((c) => {
    test('détection ' + c.id + ' — ' + c.titre, () => {
      const b = M.blocageGeneralise(c.jours, c.date);
      if (c.attendu === null) { expect(b).toBeNull(); return; }
      expect(b.declencheur).toBe(c.attendu.declencheur);
      expect(b.cites).toEqual(c.attendu.cites);
      expect(octets(M.phraseCarte(b.cites))).toBe(octets(c.attendu.phrase));
      expect(octets(M.DETAIL_CARTE)).toBe(octets(c.attendu.detail));
    });
  });

  F.consigne_allegee.forEach((c) => {
    test('consigne allégée ' + c.id + ' (' + c.series_routine + ' série(s) de routine)', () => {
      const a = M.consigneAllegee(consigneDuCas(c.consigne), c.series_routine);
      expect([a.ligne.charge, a.ligne.vise]).toEqual(c.attendu.ligne);
      expect(a.haut).toBe(c.attendu.haut);
      expect(a.allegee.series).toBe(c.attendu.series);
      // Décision d'Aurélien (01/10/2026, #345) : la phrase passe par le
      // formateur unique (chargeFois), insécables autour du ×. Le cas écrit
      // « 125 kg × 3 » avec des espaces simples : l'attendu suit le formateur.
      expect(octets(M.phraseAllegee(a))).toBe(octets(surFormateur(c.attendu.phrase)));
      expect(octets(M.detailAllegee(a))).toBe(octets(c.attendu.detail));
    });
  });

  F.bandeau.forEach((b) => {
    test('bandeau — acceptée le ' + b.acceptee_le, () => {
      const fin = M.finAllegee(b.acceptee_le);
      expect(fin).toBe(b.derniere_date);
      expect(octets(M.bandeauAllegee(fin))).toBe(octets(b.bandeau));
    });
  });

  // Une séquence : une carte montrée et sa réponse, puis des jours où le
  // blocage généralisé est (ou non) là. La carte n'a pas de compteur dans le
  // cas : elle déclenche, donc 4 (le premier déclenchement) — c'est le seuil
  // que la mémoire compare.
  F.memoire.forEach((m) => {
    test('mémoire ' + m.id + ' — ' + m.titre, () => {
      const cartes = [], compteurs = [], vu = [];
      m.sequence.forEach((e) => {
        if (e.carte) {
          vu.push(true);
          cartes.push({ jour: e.date, declencheur: e.declencheur, compteur: null, reponse: e.reponse,
                        debut: e.date, fin: M.finAllegee(e.date) });
          return;
        }
        Object.keys(e.compteurs).forEach((x) => compteurs.push({ exercice: x, jour: e.date, compteur: e.compteurs[x] }));
        const d = Object.keys(e.compteurs)[0];
        vu.push(e.blocage_generalise && M.carteAutorisee(d, e.date, cartes, compteurs));
      });
      expect(vu).toEqual(m.attendu);
    });
  });

  F.compteur_decharge.forEach((c) => {
    test('compteur ' + c.id + ' — ' + c.titre, () => {
      const o = { reglage: 'normal', equipement: 'haltere', correction: null, toutes: true };
      const r = M.compteurDe(c.seances, c.avant, o);
      const sans = M.compteurDe(c.seances.map((s) => Object.assign({}, s, { decharge: false })), c.avant, o);
      expect(r.compteur).toBe(c.attendu.compteur);
      expect(sans.compteur).toBe(c.attendu.sans_decharge);
      expect(r.verdicts.map((v) => ({ debut: v.debut, progres: v.progres, suivie: v.suivie, compteur: v.compteur })))
        .toEqual(c.attendu.verdicts);
    });
  });
});

describe('§14.4 — la détection, aux bords', () => {
  const J = (jours) => jours;
  test('DISCRIMINANT — la fenêtre : 7 jours avant comptent, 8 non', () => {
    const base = { '2026-07-27': { presse: 4 } };
    const a7 = M.blocageGeneralise(Object.assign({ '2026-07-20': { couche: 4, tirage: 4 } }, base), '2026-07-27');
    const a8 = M.blocageGeneralise(Object.assign({ '2026-07-19': { couche: 4, tirage: 4 } }, base), '2026-07-27');
    expect(a7 && a7.declencheur).toBe('presse');
    expect(a8).toBeNull();
  });
  test('DISCRIMINANT — deux AUTRES exercices sont nécessaires : un seul ne suffit pas', () => {
    expect(M.blocageGeneralise(J({ '2026-07-27': { presse: 4 }, '2026-07-25': { couche: 6 } }), '2026-07-27')).toBeNull();
    expect(M.blocageGeneralise(J({ '2026-07-27': { presse: 4 }, '2026-07-25': { couche: 6, tirage: 4 } }), '2026-07-27'))
      .not.toBeNull();
  });
  test('un déclenchement : 4, 8, 12 — pas 5, 6, 7', () => {
    expect([3, 4, 5, 7, 8, 11, 12, 16].map(M.estDeclenchement)).toEqual([false, true, false, false, true, false, true, true]);
  });
  test('le déclencheur est un exercice de la séance qui s’ouvre (les candidats)', () => {
    const jours = { '2026-07-27': { presse: 4, autre: 8 }, '2026-07-25': { couche: 4, tirage: 4 } };
    expect(M.blocageGeneralise(jours, '2026-07-27').declencheur).toBe('autre');
    expect(M.blocageGeneralise(jours, '2026-07-27', null, ['presse']).declencheur).toBe('presse');
  });
  test('60 % des séries, au plus proche, au moins une : 1→1 · 2→1 · 3→2 · 4→2 · 5→3 · 6→4', () => {
    expect([1, 2, 3, 4, 5, 6].map(M.seriesAllegees)).toEqual([1, 1, 2, 2, 3, 4]);
  });
});

describe('§14 — l’observation du pari accepté, sans série', () => {
  const carte = { jour: '2026-10-01', declencheur: 'couche', compteur: 4, reponse: 'acceptee',
                  debut: '2026-10-01', fin: '2026-10-07', seance: 'S1' };
  const k = (jour, c) => ({ exercice: 'couche', jour, compteur: c, debut: jour + 'T17:00:00Z', seance: 'X' + jour });
  test('1 si le déclencheur progresse avant son prochain déclenchement', () => {
    const o = M.observationSemaineAllegee(carte, [k('2026-10-03', 4), k('2026-10-10', 0)]);
    expect(o.valeur).toBe(1);
    expect(o.jour).toBe('2026-10-10');
  });
  test('0 à son prochain déclenchement (8)', () => {
    const o = M.observationSemaineAllegee(carte, [k('2026-10-10', 5), k('2026-10-20', 8)]);
    expect(o.valeur).toBe(0);
    expect(o.debut).toBe('2026-10-20T17:00:00Z');
  });
  test('rien tant que rien n’a tranché ; un refus n’est jamais observé', () => {
    expect(M.observationSemaineAllegee(carte, [k('2026-10-10', 5), k('2026-10-14', 6)])).toBeNull();
    expect(M.observationSemaineAllegee(Object.assign({}, carte, { reponse: 'refusee' }), [k('2026-10-10', 0)])).toBeNull();
  });
  test('les compteurs d’un autre exercice ne comptent pas', () => {
    expect(M.observationSemaineAllegee(carte, [{ exercice: 'rowing', jour: '2026-10-10', compteur: 0 }])).toBeNull();
  });
});

describe('§14 — l’identifiant, dans son espace de noms', () => {
  test('déterministe, UUID v5, jamais égal à un identifiant de consigne', async () => {
    const a = await M.idDEscalier('S1', null, 'semaine_allegee');
    const b = await M.idDEscalier('S1', null, 'semaine_allegee');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const consignes = await Promise.all([
      M.idDePrediction('S1', '', 'semaine_allegee'), M.idDePrediction('escalier', 'S1', ''),
      M.idDePrediction('S1', 'couche', 1)]);
    consignes.forEach((c) => expect(c).not.toBe(a));
    expect(await M.idDEscalier('S2', null, 'semaine_allegee')).not.toBe(a);
  });
});

// ── LE PLAN ─────────────────────────────────────────────────────────────────
const DEBUT = '2026-10-01T10:00:00+00:00';
const C = { etat: 'test_propose', zone: 'lourd', palier: 125, niveau: 5, n: 4,
  ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} };
const NOMS = { couche: 'Développé Couché (Barre)', rowing: 'Rowing', squat: 'Squat (Barre)' };
const AUTRES = [{ exercice: 'rowing', jour: '2026-09-28', compteur: 4, seance: 'X1' },
  { exercice: 'squat', jour: '2026-09-29', compteur: 5, seance: 'X2' }];
function decor(o) {
  const opt = o || {};
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: opt.seance || 'S1', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'couche', id, { series: 4 });
  if (opt.geste) se = opt.geste(se, id);
  const k = opt.consigne || C;
  const c = { consigne: k, libelles: M.libellesConsigne(k),
    compteur: { compteur: opt.compteur === undefined ? 4 : opt.compteur, meilleur: { palier: 125, niveau: 5 }, blocages: [] } };
  const e = { seance: { id: opt.seance || 'S1', debut: opt.debut || DEBUT, edition: false, exercices: se.exercices },
    consignes: { couche: c }, reglage: 'normal', paris: [], suites: {},
    escalier: { cartes: opt.cartes || [], compteurs: opt.compteurs || AUTRES, noms: NOMS, seriesRoutine: { couche: 4 } } };
  return { e, p: T.planDeSeance(e) };
}
const acceptee = (jour, seance) => ({ seance: seance || 'S0', jour, declencheur: 'couche', compteur: 4,
  reponse: 'acceptee', debut: jour, fin: M.finAllegee(jour) });

describe('§14.4 — la carte, dans le plan', () => {
  test('la carte s’ouvre, une seule, en tête de la séance ; aucune violation', () => {
    const { e, p } = decor();
    expect(p.carte.declencheur).toBe('couche');
    expect(p.carte.phrase).toBe('Développé Couché (Barre), Squat (Barre) et Rowing : aucun n\'a progressé depuis 4 séances.');
    expect(p.allegee).toBeNull();
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('pas de déclenchement (5) : pas de carte', () => {
    expect(decor({ compteur: 5 }).p.carte).toBeNull();
  });
  test('la carte une seule fois : la séance qui y a répondu ne la revoit pas', () => {
    const refus = { seance: 'S1', jour: '2026-10-01', declencheur: 'couche', compteur: 4, reponse: 'refusee' };
    expect(decor({ cartes: [refus] }).p.carte).toBeNull();
  });
  test('la mémoire : refusée, la carte ne revient pas tant que le déclencheur n’a pas progressé', () => {
    // 189 — plus de 4 semaines après la carte : sinon la réfractarité (« une fois par épisode ») tait la carte d'abord.
    const refus = { seance: 'S0', jour: '2026-08-24', declencheur: 'couche', compteur: 4, reponse: 'refusee' };
    expect(decor({ compteur: 8, cartes: [refus] }).p.carte).toBeNull();
    const progres = AUTRES.concat([{ exercice: 'couche', jour: '2026-08-26', compteur: 0, seance: 'X0' }]);
    expect(decor({ compteur: 4, cartes: [refus], compteurs: progres }).p.carte).not.toBeNull();
  });
  test('189 — même après un progrès du déclencheur, aucune carte dans les 4 semaines d\u2019une autre', () => {
    const refus = { seance: 'S0', jour: '2026-09-24', declencheur: 'couche', compteur: 4, reponse: 'refusee' };
    const progres = AUTRES.concat([{ exercice: 'couche', jour: '2026-09-26', compteur: 0, seance: 'X0' }]);
    expect(decor({ compteur: 4, cartes: [refus], compteurs: progres }).p.carte).toBeNull();
  });
});

describe('§14.4 — la semaine allégée, dans le plan', () => {
  test('acceptée : la séance du jour et celle du lendemain sont allégées (bandeau, consigne)', () => {
    [DEBUT, '2026-10-02T10:00:00+00:00', '2026-10-07T19:00:00+00:00'].forEach((debut) => {
      const { e, p } = decor({ debut, seance: 'S2', cartes: [acceptee('2026-10-01')] });
      expect(p.carte).toBeNull();
      expect(p.allegee.bandeau).toBe('Semaine allégée jusqu’au 7 oct. : mêmes charges, moins de séries, loin de l’échec. Rien ne monte.');
      const x = p.exercices[0];
      expect(x.entete.jaune).toEqual(['125\u00a0kg\u00a0×\u00a03']);
      expect(x.entete.gris).toBe('2 séries au lieu de 4, cette semaine');
      expect(x.lignes.map((l) => l.role)).toEqual(['ligne', 'ligne', 'hors', 'hors']);
      expect(x.lignes.slice(0, 2).map((l) => [l.charge, l.vise])).toEqual([[125, 3], [125, 3]]);
      expect(x.paris.filter(Boolean).every((q) => q.fondement.allegee === true && q.fondement.compteur === 4)).toBe(true);
      expect(x.entete.compteur).toBeNull();
      expect(T.verifierPlan(p, e).erreurs).toEqual([]);
    });
  });
  test('le 8ᵉ jour, la séance est normale (et la carte peut revenir)', () => {
    const { p } = decor({ debut: '2026-10-08T10:00:00+00:00', seance: 'S3', cartes: [acceptee('2026-10-01')] });
    expect(p.allegee).toBeNull();
    expect(p.exercices[0].consigne.allegee).toBeUndefined();
  });
  test('rien ne monte : une série au-dessus de la visée ne fait proposer aucune montée', () => {
    const { e } = decor({ seance: 'S2', cartes: [acceptee('2026-10-01')] });
    const exos = e.seance.exercices.map((x) => Object.assign({}, x, { series: x.series.map((s, i) => i === 0
      ? Object.assign({}, s, { charge_kg: 125, reps: 8, validee_a: '2026-10-01T10:05:00Z' }) : s) }));
    const e2 = Object.assign({}, e, { seance: Object.assign({}, e.seance, { exercices: exos }) });
    const p2 = T.planDeSeance(e2);
    expect(p2.exercices[0].reaction.plan.every((q) => !q || q.source !== 'coach')).toBe(true);
    expect(T.verifierPlan(p2, e2).erreurs).toEqual([]);
  });
});

describe('§14.4 — I19, I20 : des violations forgées sont vues', () => {
  test('I19 — une ligne de test pendant la période', () => {
    const { e, p } = decor({ seance: 'S2', cartes: [acceptee('2026-10-01')] });
    const faux = JSON.parse(JSON.stringify(p));
    faux.exercices[0].lignes[1].role = 'test';
    expect(T.verifierPlan(faux).erreurs.some((x) => /^I19/.test(x))).toBe(true);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
  test('I19 — trois lignes couvertes au lieu de deux', () => {
    const { p } = decor({ seance: 'S2', cartes: [acceptee('2026-10-01')] });
    const faux = JSON.parse(JSON.stringify(p));
    Object.assign(faux.exercices[0].lignes[2], { role: 'ligne', position: 2, rang: 3, charge: 125, vise: 3 });
    expect(T.verifierPlan(faux).erreurs.some((x) => /^I19 .*3 ligne\(s\) couverte\(s\), pour 2/.test(x))).toBe(true);
  });
  test('I19 — une proposition de montée dans la réaction', () => {
    const { p } = decor({ seance: 'S2', cartes: [acceptee('2026-10-01')] });
    const faux = JSON.parse(JSON.stringify(p));
    faux.exercices[0].reaction.plan[1] = { charge: 130, vise: 3, zone: [3, 5], source: 'coach' };
    expect(T.verifierPlan(faux).erreurs.some((x) => /^I19 .*montée/.test(x))).toBe(true);
  });
  test('I20 — une carte pendant la période, et une carte sur une séance qui a répondu', () => {
    const { p } = decor({ seance: 'S2', cartes: [acceptee('2026-10-01')] });
    const faux = JSON.parse(JSON.stringify(p));
    faux.carte = { declencheur: 'couche', cites: ['couche'] };
    expect(T.verifierPlan(faux).erreurs.some((x) => /^I20 — une carte pendant/.test(x))).toBe(true);
    const refus = { seance: 'S1', jour: '2026-10-01', declencheur: 'couche', compteur: 4, reponse: 'refusee' };
    const d = decor({ cartes: [refus] });
    const faux2 = JSON.parse(JSON.stringify(d.p));
    faux2.carte = { declencheur: 'couche', cites: ['couche', 'squat', 'rowing'] };
    expect(T.verifierPlan(faux2, d.e).erreurs.some((x) => /^I20 — une carte sur une séance/.test(x))).toBe(true);
  });
});

describe('§14.4 — le compteur dans le fondement de chaque pari', () => {
  test('chaque pari de consigne porte le compteur à l’ouverture (même hors période)', () => {
    const p = decor({ compteur: 5 }).p;
    expect(p.exercices[0].paris.filter(Boolean).map((q) => q.fondement.compteur)).toEqual([5, 5, 5, 5]);
  });
  test('sans compteur connu (consigne figée avant 49-U13), rien n’est inventé', () => {
    const { e } = decor();
    const sans = Object.assign({}, e.consignes.couche);
    delete sans.compteur;
    const p = T.planDeSeance(Object.assign({}, e, { consignes: { couche: sans } }));
    expect(p.exercices[0].paris.filter(Boolean).every((q) => q.fondement.compteur === undefined)).toBe(true);
  });
  test('DISCRIMINANT — consigneDExercice : les séances d’une semaine acceptée ne sont ni comptées ni jugées', () => {
    // 6 séances de plateau à 25 kg × 12, tous les 3 jours (jours 0 à 15).
    const jour = (n) => new Date(Date.UTC(2026, 8, 1 + n, 17)).toISOString();
    const groupes = [0, 3, 6, 9, 12, 15].map((n, i) => ({
      seance: { id: 'S' + i, debut: jour(n) },
      series: [0, 1, 2].map((j) => ({ id: 'S' + i + '-' + j, charge_kg: 25, reps: 12, rpe: null, ressenti: null,
        type_serie: 'travail', validee_a: jour(n) }))
    }));
    const base = { mesure: 'charge_reps', reglage: 'normal', equipement: 'barre', intention: 'progresser',
                   seancesSousConsigne: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'] };
    const avant = jour(18);
    // La première séance a une consigne muette (première fois) : 4, comme au 49-U13.
    expect(M.consigneDExercice(groupes, null, avant, base).compteur.compteur).toBe(4);
    // La semaine du 10 au 16/09 (jours 9 à 15) : les séances des jours 9, 12, 15 sont une décharge.
    const p = [{ debut: M.jourCivil(jour(9)), fin: M.finAllegee(M.jourCivil(jour(9))) }];
    // Restent S1 (remise à zéro) et S2 (suivie, sans progrès) : 1. Les séances
    // de la période restent des présences : l'ouverture n'est pas une reprise.
    expect(M.consigneDExercice(groupes, null, avant, Object.assign({ periodesAllegees: p }, base)).compteur.compteur).toBe(1);
  });
});

// ── DÉCISIONS DU 01/10/2026 (#345) ──────────────────────────────────────────
describe('§14.4 — « rejoint » : la consigne s’allège sur la ligne haute (49-30)', () => {
  // L'état « rejoint » n'a pas de ligne de travail : la charge du jour est la
  // ligne HAUTE. L'allégée la reprend, à vise − 2, et n'a plus de haut.
  const R = { etat: 'rejoint', zone: 'lourd', palier: 115, niveau: 5, n: 4,
    ligne: null, haut: { charge: 115, vise: 5, k: 4 }, fondement: {} };
  test('le moteur : 115 kg × 3 sur la ligne, plus de haut, 2 séries sur 4', () => {
    const a = M.consigneAllegee(R, 4);
    expect(a.ligne).toEqual({ charge: 115, vise: 3 });
    expect(a.haut).toBeNull();
    expect([a.n, a.couvre]).toEqual([2, 2]);
    expect(octets(M.phraseAllegee(a))).toBe(octets('115 kg × 3'));
  });
  test('le plan : l’en-tête dit 115 kg × 3, deux lignes couvertes, aucune violation', () => {
    const { e, p } = decor({ consigne: R, cartes: [acceptee('2026-10-01')] });
    const x = p.exercices[0];
    expect(x.entete.jaune).toEqual(['115 kg × 3']);
    expect(x.lignes.map((l) => l.role)).toEqual(['ligne', 'ligne', 'hors', 'hors']);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

describe('§14.4 — pendant la période, la séance ne contient que les lignes allégées', () => {
  test('les lignes de travail en trop, non validées, sont à retirer — de la fin vers le début', () => {
    const { p } = decor({ cartes: [acceptee('2026-10-01')] });
    expect(T.lignesARetirer(p)).toEqual([{ iExo: 0, iSerie: 3 }, { iExo: 0, iSerie: 2 }]);
  });
  test('une série déjà validée n’est jamais retirée', () => {
    const geste = (se) => {
      let x = S.modifierSerie(se, 0, 3, { charge_kg: 125, reps: 5 });
      return S.valider(x, 0, 3, '2026-10-01T10:05:00Z');
    };
    const { p } = decor({ cartes: [acceptee('2026-10-01')], geste });
    const r = T.lignesARetirer(p);
    expect(r.some((l) => l.iSerie === 3)).toBe(false);
    expect(p.exercices[0].lignes[3].validee).toBe(true);
    expect(r).toEqual([{ iExo: 0, iSerie: 2 }]);
  });
  test('hors période (carte ou séance normale) : rien à retirer', () => {
    expect(T.lignesARetirer(decor().p)).toEqual([]);
    expect(T.lignesARetirer(decor({ compteur: 5 }).p)).toEqual([]);
  });
  test('« + Série » reste possible : une ligne ajoutée après le retrait est « hors », sans violation', () => {
    const geste = (se, id) => S.ajouterSerie(S.retirerSerie(S.retirerSerie(se, 0, 3), 0, 2), 0, id);
    const { e, p } = decor({ cartes: [acceptee('2026-10-01')], geste });
    expect(p.exercices[0].lignes.map((l) => l.role)).toEqual(['ligne', 'ligne', 'hors']);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});
