/** @jest-environment node */
//
// « Les mots disent vrai » PR 5b-1 (MOTEUR §9.50, I169) — LES RÉGIMES À VENIR : décharge planifiée, semaine de test, début de bloc.
//   1. `Moteur.regimeAVenir` : la fenêtre de la fois suivante [max(1, e − 2), min(14, e + 3)] (B1), aux bornes ; priorité (B8) ; bloc (B5) ; décharge sautée (B4).
//   2. Les phrases (B3) et les têtes d'effort ; le silence ne crée rien (B7) ; trois fuseaux.
//   3. B2 : une médiane, deux bornes : `ecartDuRythme` est INCHANGÉ (copie de l'ancienne fonction, comparée sur des histoires de 2 à 14 jours).
//   4. I169 sur un plan réel : DISCRIMINANTS.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const esp = (t) => String(t == null ? '' : t).replace(/[\u00a0\u202f]/g, ' ');
const JOUR = '2026-09-26';
const plusJ = (n) => new Date(Date.UTC(2026, 8, 26 + n)).toISOString().slice(0, 10);
// Un bloc de 4 semaines dont la décharge commence `n` jours après JOUR.
const bloc = (n, extra) => Object.assign({ id: 'B1', statut: 'en_cours', semaines: 4, decharge: true, zone: 'lourd', exercices: ['terre'],
  debut: new Date(Date.UTC(2026, 8, 26 + n - 21)).toISOString().slice(0, 10) }, extra || {});
const rg = (o) => M.regimeAVenir(Object.assign({ jour: JOUR, ecart: 7, blocs: [], finsAllegees: [], test: null, slug: 'terre', famille: 'souleve', zone: 'lourd' }, o));

describe('la fenêtre de la fois suivante (B1)', () => {
  test('bornes : [max(1, e − 2), min(14, e + 3)], 7 sans histoire, arrondie au jour', () => {
    expect(M.fenetreDeLaProchaineFois(7)).toEqual({ lo: 5, hi: 10 });
    expect(M.fenetreDeLaProchaineFois(null)).toEqual({ lo: 5, hi: 10 });
    expect(M.fenetreDeLaProchaineFois(2)).toEqual({ lo: 1, hi: 5 });
    expect(M.fenetreDeLaProchaineFois(11)).toEqual({ lo: 9, hi: 14 });
    expect(M.fenetreDeLaProchaineFois(12)).toEqual({ lo: 10, hi: 14 });
    expect(M.fenetreDeLaProchaineFois(14)).toEqual({ lo: 12, hi: 14 });
    expect(M.fenetreDeLaProchaineFois(15)).toEqual({ lo: 13, hi: 14 });
    expect(M.fenetreDeLaProchaineFois(3.5)).toEqual({ lo: 2, hi: 7 });
  });
  const dit = (e, n) => { const r = rg({ ecart: e, blocs: [bloc(n)] }); return r ? r.genre : null; };
  test('une décharge qui commence à jour + hi est dite, à jour + hi + 1 elle se tait', () => {
    expect([dit(2, 5), dit(2, 6)]).toEqual(['decharge', null]);
    expect([dit(7, 10), dit(7, 11)]).toEqual(['decharge', null]);
    expect([dit(11, 14), dit(11, 15)]).toEqual(['decharge', null]);
    expect([dit(15, 14), dit(15, 15)]).toEqual(['decharge', null]);
  });
  test('la décharge (7 jours) doit RECOUPER la fenêtre : finie avant jour + lo, elle se tait', () => {
    // e = 14 : lo = 12 ; une décharge qui commence à jour + 5 finit à jour + 11 (avant), à jour + 6 elle finit à jour + 12.
    expect([dit(14, 5), dit(14, 6)]).toEqual([null, 'decharge']);
    // e = 15 : lo = 13 ; commence à + 6 finit à + 12 (avant), à + 7 finit à + 13.
    expect([dit(15, 6), dit(15, 7)]).toEqual([null, 'decharge']);
    // e = 12 : lo = 10.
    expect([dit(12, 3), dit(12, 4)]).toEqual([null, 'decharge']);
    // e = 11 : lo = 9.
    expect([dit(11, 2), dit(11, 3)]).toEqual([null, 'decharge']);
  });
  test('une décharge déjà commencée ou le jour même : la séance du jour, pas une annonce de suite', () => {
    expect(dit(7, 0)).toBeNull();
    expect(dit(7, -2)).toBeNull();
  });
  test('sans histoire (écart absent) : 7 jours', () => {
    expect(rg({ ecart: null, blocs: [bloc(10)] }).genre).toBe('decharge');
    expect(rg({ ecart: undefined, blocs: [bloc(11)] })).toBeNull();
  });
  test('la date est celle du moteur : debutDecharge, jamais finDuBloc', () => {
    const b = bloc(7);
    expect(rg({ blocs: [b] }).debut).toBe(M.debutDecharge(b));
    expect(rg({ blocs: [b] }).debut).toBe(plusJ(7));
    expect(rg({ blocs: [b] }).debut).not.toBe(M.finDuBloc(b));
  });
});

describe('une décharge SAUTÉE ne se date pas (B4), un bloc arrêté non plus (cas 3)', () => {
  test('une semaine allégée acceptée dans les 14 jours avant : pas de cumul, pas de date', () => {
    expect(rg({ blocs: [bloc(7)] }).genre).toBe('decharge');
    expect(rg({ blocs: [bloc(7)], finsAllegees: [plusJ(-2)] })).toBeNull();
    expect(rg({ blocs: [bloc(7)], finsAllegees: [plusJ(6)] })).toBeNull();     // une carte acceptée aujourd'hui (fin = jour + 6)
    expect(rg({ blocs: [bloc(7)], finsAllegees: [plusJ(-30)] }).genre).toBe('decharge');
  });
  test('le bloc doit être en cours et prévoir une décharge', () => {
    expect(rg({ blocs: [bloc(7, { statut: 'termine' })] })).toBeNull();
    expect(rg({ blocs: [bloc(7, { statut: 'abandonne' })] })).toBeNull();
    expect(rg({ blocs: [bloc(7, { decharge: false })] })).toBeNull();
  });
  test('la décharge vaut pour tout exercice, du bloc ou non (cas 5)', () => {
    expect(rg({ blocs: [bloc(7)], slug: 'rowing' }).genre).toBe('decharge');
  });
});

describe('le début d’un bloc (B5) : seulement s’il POSE une zone, et une autre', () => {
  const nouveau = (n, extra) => Object.assign({ id: 'B2', statut: 'en_cours', semaines: 4, decharge: false, zone: 'lourd', exercices: ['terre'], debut: plusJ(n) }, extra || {});
  test('une barre dont la zone change : « bloc » ; même zone : silence (rien ne change)', () => {
    expect(rg({ blocs: [nouveau(8)], zone: 'hypertrophie' })).toEqual({ genre: 'bloc', debut: plusJ(8) });
    expect(rg({ blocs: [nouveau(8)], zone: 'lourd' })).toBeNull();
  });
  test('un exercice hors du bloc ne reçoit aucune ligne : silence', () => {
    expect(rg({ blocs: [nouveau(8)], slug: 'rowing', zone: 'hypertrophie' })).toBeNull();
  });
  test('un bloc Hypertrophie ne pose rien à un accessoire (famille nulle), il pose Mix au soulevé', () => {
    const h = nouveau(8, { zone: 'hypertrophie', exercices: ['rowing', 'terre'] });
    expect(rg({ blocs: [h], slug: 'rowing', famille: null, zone: 'lourd' })).toBeNull();
    expect(rg({ blocs: [h], slug: 'terre', famille: 'souleve', zone: 'lourd' })).toEqual({ genre: 'bloc', debut: plusJ(8) });
  });
  test('un bloc qui a commencé (debut ≤ jour), ou au-delà de la fenêtre : silence', () => {
    expect(rg({ blocs: [nouveau(0)], zone: 'hypertrophie' })).toBeNull();
    expect(rg({ blocs: [nouveau(11)], zone: 'hypertrophie' })).toBeNull();
    expect(rg({ blocs: [nouveau(10)], zone: 'hypertrophie' }).genre).toBe('bloc');
  });
});

describe('la semaine de test (cas 6) et la priorité (B8)', () => {
  test('commence après aujourd’hui et recoupe la fenêtre : dite ; commencée : la séance du jour', () => {
    expect(rg({ test: { debut: plusJ(7), fin: plusJ(13) } })).toEqual({ genre: 'test', debut: plusJ(7) });
    expect(rg({ test: { debut: plusJ(11), fin: plusJ(17) } })).toBeNull();
    expect(rg({ test: { debut: plusJ(-1), fin: plusJ(5) } })).toBeNull();
    expect(rg({ test: { debut: plusJ(1), fin: plusJ(4) }, ecart: 14 })).toBeNull();      // finie avant jour + 12
  });
  test('un seul régime : le plus proche ; à égalité, la décharge, puis le test, puis le bloc', () => {
    const b = { id: 'B3', statut: 'en_cours', semaines: 4, decharge: false, zone: 'lourd', exercices: ['terre'], debut: plusJ(7) };
    const t = { debut: plusJ(7), fin: plusJ(13) };
    expect(rg({ blocs: [bloc(7), b], test: t, zone: 'hypertrophie' }).genre).toBe('decharge');
    expect(rg({ blocs: [b], test: t, zone: 'hypertrophie' }).genre).toBe('test');
    expect(rg({ blocs: [bloc(9)], test: t }).genre).toBe('test');
    expect(rg({ blocs: [bloc(6)], test: t }).genre).toBe('decharge');
  });
});

describe('trois fuseaux : un seul résultat pour les dates de l’annonce', () => {
  test('Europe/Paris, America/Los_Angeles, Pacific/Auckland : la date dite est celle du bloc (jours civils)', () => {
    const avant = process.env.TZ;
    const instant = '2026-09-26T22:30:00Z';
    const dates = ['Europe/Paris', 'America/Los_Angeles', 'Pacific/Auckland'].map((tz) => {
      process.env.TZ = tz;
      const r = rg({ jour: M.jourCivil(instant), blocs: [bloc(8)] });
      return r ? r.debut : null;
    });
    process.env.TZ = avant;
    expect(dates).toEqual([plusJ(8), plusJ(8), plusJ(8)]);
  });
});

describe('les phrases (B3, Q3) : date absolue, aucune charge, aucun rep, tête factuelle', () => {
  const cA = { etat: 'progression', zone: 'hypertrophie', palier: 70, niveau: 8, n: 3, ligne: { charge: 70, vise: 9 }, haut: null, fondement: { date: '2026-09-26T18:00:00+02:00', reps: [8, 8, 8] } };
  const suite = (regime, cApres) => M.annonceDe('suite', { cAvant: cA, cApres: cApres || cA, z: M.zoneParCle('hypertrophie'), reglage: 'normal', fait: 8, cranSuivant: 72.5, cranApproche: false, testConfirme: false, regime });
  test('trois phrases exactes', () => {
    expect(esp(suite({ genre: 'decharge', debut: '2026-11-16' }))).toBe('Ta décharge commence le 16 nov., prévue par ton programme.');
    expect(esp(suite({ genre: 'test', debut: '2026-11-23' }))).toBe('Ta semaine de test commence le 23 nov.');
    expect(esp(suite({ genre: 'bloc', debut: '2026-11-23' }))).toBe('Ton bloc commence le 23 nov.');
  });
  test('sans régime : l’annonce d’avant, inchangée', () => {
    expect(esp(suite(null))).toBe('La prochaine fois : une rep de plus, 70 kg × 9.');
    expect(esp(suite(undefined))).toBe('La prochaine fois : une rep de plus, 70 kg × 9.');
  });
  test('le régime REMPLACE une annonce, il n’en crée jamais (sens 6 : le silence reste le silence)', () => {
    expect(suite({ genre: 'decharge', debut: '2026-11-16' }, Object.assign({}, cA, { etat: 'silence' }))).toBeNull();
  });
  test('« il te manque », « on retestera », « on reteste d’un seul cran » sous régime : la date aussi', () => {
    const r = { genre: 'decharge', debut: '2026-11-16' };
    expect(esp(M.annonceDe('suite', { cAvant: cA, cApres: Object.assign({}, cA, { etat: 'retest_un_cran' }), z: M.zoneParCle('hypertrophie'), reglage: 'normal', fait: 8, regime: r })))
      .toBe('Ta décharge commence le 16 nov., prévue par ton programme.');
    expect(esp(M.annonceDe('suite', { cAvant: cA, cApres: cA, z: M.zoneParCle('hypertrophie'), reglage: 'normal', fait: 8, cranSuivant: 72.5, testConfirme: true, regime: r })))
      .toBe('Ta décharge commence le 16 nov., prévue par ton programme.');
  });
  const ev = (extra) => Object.assign({ effet: 'garde', charge: 130, reps: 5, reserve: 0, visee: 2, auHaut: false }, extra || {});
  const R = { genre: 'decharge', debut: '2026-11-16' };
  test('la tête d’effort : garde, test au-dessus, test = visée, sortie', () => {
    expect(esp(M.annonceDe('effort', { ev: ev(), moment: 'apres', regime: R }))).toBe('130 kg × 5, sans marge.');
    expect(esp(M.annonceDe('effort', { ev: ev({ reserve: 2 }), moment: 'apres', regime: R }))).toBe('130 kg × 5, avec 2 en réserve.');
    expect(esp(M.annonceDe('effort', { ev: ev({ effet: 'test', charge: 34, reps: 9, reserve: 3, visee: 1 }), haut: 36, moment: 'apres', regime: R })))
      .toBe('34 kg × 9, il t’en restait 3. Au-dessus de ce que je visais.');
    expect(esp(M.annonceDe('effort', { ev: ev({ effet: 'test', charge: 34, reps: 9, reserve: 2, visee: 2 }), haut: 36, moment: 'apres', regime: R })))
      .toBe('34 kg × 9, il t’en restait 2 : c’est ce que je visais.');
    expect(esp(M.annonceDe('effort', { ev: ev({ effet: 'test', charge: 30, reps: 10, reserve: 1, visee: 1, sortie: true }), haut: { charge: 32.5, vise: 8 }, moment: 'apres', regime: R })))
      .toBe('Deux fois 30 kg × 10 au haut de ta zone.');
  });
  test('sans régime la phrase d’effort est inchangée', () => {
    expect(esp(M.annonceDe('effort', { ev: ev(), moment: 'apres' }))).toBe('130 kg × 5, sans marge. Je garde 130 kg la prochaine fois.');
    expect(esp(M.annonceDe('effort', { ev: ev(), moment: 'apres', regime: null }))).toBe('130 kg × 5, sans marge. Je garde 130 kg la prochaine fois.');
  });
});

describe('B2 : une médiane, deux bornes — `ecartDuRythme` est inchangée', () => {
  // L'ancienne fonction (main, 5a), copiée telle quelle.
  const ancienne = (groupes) => {
    const dates = (groupes || []).map((g) => { const t = Date.parse(g && g.seance ? g.seance.debut : null); return Number.isNaN(t) ? null : t; })
      .filter((t) => t !== null).sort((a, b) => a - b);
    if (dates.length < 2) return 7;
    const ec = [];
    for (let i = 1; i < dates.length; i++) ec.push((dates[i] - dates[i - 1]) / 86400000);
    const s = ec.slice(-8).sort((a, b) => a - b), k = s.length >> 1;
    const m = s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
    return Math.min(14, Math.max(1, m));
  };
  let g = 7;
  const al = () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296; };
  test('mêmes valeurs que main sur des histoires de cadence 0,5 à 30 jours, avec gigue', () => {
    [0.5, 1, 2, 3.5, 7, 10, 14, 21, 30].forEach((cad) => {
      for (let h = 0; h < 25; h++) {
        const n = Math.floor(al() * 14);
        let t = Date.UTC(2026, 0, 1, 17);
        const groupes = [];
        for (let i = 0; i < n; i++) { groupes.push({ seance: { debut: new Date(t).toISOString() } }); t += Math.round((cad + (al() - 0.5) * 3) * 86400000); }
        expect(M.ecartDuRythme(groupes)).toBeCloseTo(ancienne(groupes), 9);
      }
    });
    expect(M.ecartDuRythme([])).toBe(7);
    expect(M.ecartDuRythme([{ seance: { debut: '2026-01-01T10:00:00Z' } }])).toBe(7);
  });
  test('la fenêtre n’est pas la borne du retour simulé : écart 2 → retour à 2 jours, fenêtre 1 à 5', () => {
    const gr = [0, 2, 4, 6].map((d) => ({ seance: { debut: new Date(Date.UTC(2026, 0, 1 + d, 17)).toISOString() } }));
    expect(M.ecartDuRythme(gr)).toBe(2);
    expect(M.fenetreDeLaProchaineFois(2)).toEqual({ lo: 1, hi: 5 });
  });
});

// ── I169 sur un plan réel ──────────────────────────────────────────────────────────────────────────────────────
describe('I169 — verifierRegimes relit l’annonce du plan (DISCRIMINANTS)', () => {
  const AVANT = '2026-09-26T10:00:00+00:00', APRES = '2026-09-26T12:00:00+00:00';
  const OPTS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
  const jour = (d) => '2026-09-' + d + 'T18:00:00+00:00';
  const set = (sid, kg, reps, rang) => ({ id: sid + '-' + rang, session_id: sid, exercise_slug: 'terre', charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', rang, validee_a: 'v', source: 'app' });
  const HIST = [['a', '05', [[120, 5], [120, 5], [120, 5]]], ['b', '12', [[122.5, 5], [122.5, 5], [122.5, 5]]], ['c', '19', [[125, 5], [125, 5], [125, 5]]]]
    .map(([sid, d, l]) => ({ seance: { id: sid, debut: jour(d) }, series: l.map(([kg, r], i) => set(sid, kg, r, i + 1)) }));
  const CONS = M.consigneDExercice(HIST, undefined, AVANT, OPTS);
  const serie = (id, kg, reps) => ({ id, type_serie: 'travail', charge_kg: kg, reps, rpe: null, ressenti: null, validee_a: '2026-09-26T10:30:00Z', source: 'app' });
  const plan = (extra) => {
    const series = [serie('t1', 125, 4), serie('t2', 125, 4), serie('t3', 125, 4)];
    const s = M.suiteDExercice(HIST, { seance: { debut: AVANT }, series }, undefined, APRES, OPTS);
    const entrees = Object.assign({ seance: { id: 'S', debut: AVANT, edition: false, exercices: [{ exercise_slug: 'terre', series }] }, consignes: { terre: CONS }, reglage: 'normal', paris: [],
      suites: { terre: { consigne: s.apres.consigne, cranSuivant: s.cranSuivant, cranSuivantApprochee: s.cranSuivantApprochee === true, testConfirme: s.testConfirme === true, ecart: s.ecart } } }, extra || {});
    return { entrees, plan: T.planDeSeance(entrees), s };
  };
  const i169 = (p) => T.verifierPlan(p.plan, p.entrees).erreurs.filter((e) => /^I169/.test(e));
  const i164 = (p) => T.verifierPlan(p.plan, p.entrees).erreurs.filter((e) => /^I164/.test(e));
  const AVEC = { programme: { blocs: [bloc(2, { exercices: ['autre'] })] } };       // décharge le 28/09, l'exercice n'est pas du bloc (cas 5)
  const P = plan(AVEC);
  const x0 = P.plan.exercices[0];

  test('l’écart habituel de la suite est rendu par le moteur (7 : trois séances hebdomadaires)', () => {
    expect(P.s.ecart).toBe(7);
  });
  test('sans bloc : l’annonce chiffrée d’avant, aucune erreur', () => {
    const q = plan();
    expect(esp(q.plan.exercices[0].constat.suite)).toMatch(/^(Prochaine séance|La prochaine fois) : /);
    expect(q.plan.exercices[0].constat.regime).toBeNull();
    expect(i169(q)).toEqual([]);
  });
  test('décharge dans la fenêtre, exercice absent du bloc : la date, aucune charge ; I164 ne voit pas la phrase de date', () => {
    expect(esp(x0.constat.suite)).toBe('Ta décharge commence le 28 sept., prévue par ton programme.');
    expect(x0.constat.regime).toEqual({ genre: 'decharge', debut: '2026-09-28' });
    expect(i169(P)).toEqual([]);
    expect(i164(P)).toEqual([]);
    // I10 relit toujours la suite chiffrée : elle reste posée.
    expect(x0.constat.suiteCharges.some((v) => v !== null)).toBe(true);
  });
  test('le plan est pur : deux rendus identiques, rien n’est écrit', () => {
    expect(JSON.stringify(T.planDeSeance(P.entrees))).toBe(JSON.stringify(P.plan));
  });
  test('une carte « semaine allégée » acceptée avant : la décharge saute, l’annonce redevient chiffrée (B4)', () => {
    const q = plan(Object.assign({ escalier: { cartes: [{ reponse: 'acceptee', debut: '2026-09-18', fin: '2026-09-24', seance: 'X', jour: '2026-09-18' }] } }, AVEC));
    expect(q.plan.exercices[0].constat.regime).toBeNull();
    expect(esp(q.plan.exercices[0].constat.suite)).toMatch(/^(Prochaine séance|La prochaine fois) : /);
    expect(i169(q)).toEqual([]);
  });
  test('une décharge hors fenêtre (jour + 11) : chiffrée ; I169 sens 3 ne réclame rien', () => {
    const q = plan({ programme: { blocs: [bloc(11)] } });
    expect(q.plan.exercices[0].constat.regime).toBeNull();
    expect(i169(q)).toEqual([]);
  });
  test('semaine de test acceptée dans la fenêtre : « Ta semaine de test commence le … »', () => {
    const q = plan({ semaineDeTest: { debut: '2026-09-30', fin: '2026-10-06', modes: {}, mesures: {}, refus: {}, maxEstimes: {}, seriesDuMax: {} } });
    expect(esp(q.plan.exercices[0].constat.suite)).toBe('Ta semaine de test commence le 30 sept.');
    expect(i169(q)).toEqual([]);
  });

  const forger = (champs, extra) => {
    const x = P.plan.exercices[0];
    const sauve = { c: Object.assign({}, x.constat), ev: x.effortVise ? Object.assign({}, x.effortVise) : null };
    Object.assign(x.constat, champs);
    if (extra && x.effortVise) Object.assign(x.effortVise, extra);
    const r = i169(P);
    x.constat = sauve.c; if (sauve.ev) x.effortVise = sauve.ev;
    return r;
  };
  test('sens 1 — une charge, des reps ou « la prochaine fois » sous un régime', () => {
    expect(forger({ suite: 'La prochaine fois : une rep de plus, 70 kg × 9.' }).length).toBeGreaterThan(0);
    expect(forger({ suite: 'Ta décharge commence le 28 sept., prévue par ton programme, 70 kg × 9.' }).length).toBeGreaterThan(0);
    expect(forger({ suite: 'Prochaine séance : 70 kg × 9.' }).length).toBeGreaterThan(0);
  });
  test('sens 2 — la date dite n’est pas celle des entrées, ou hors [jour + 1, jour + 14]', () => {
    expect(forger({ suite: 'Ta décharge commence le 29 sept., prévue par ton programme.' }).length).toBeGreaterThan(0);
    expect(forger({ regime: { genre: 'decharge', debut: '2026-09-29' }, suite: 'Ta décharge commence le 29 sept., prévue par ton programme.' }).length).toBeGreaterThan(0);
    expect(forger({ regime: { genre: 'decharge', debut: '2026-10-20' }, suite: 'Ta décharge commence le 20 oct., prévue par ton programme.' }).length).toBeGreaterThan(0);
    expect(forger({ regime: { genre: 'decharge', debut: '2026-09-26' }, suite: 'Ta décharge commence le 26 sept., prévue par ton programme.' }).length).toBeGreaterThan(0);
  });
  test('sens 3 — un régime que les entrées donnent dans la fenêtre mais que l’annonce n’a pas dit', () => {
    expect(forger({ regime: null, suite: 'Prochaine séance : 70 kg × 9.' }).length).toBeGreaterThan(0);
  });
  test('sens 3 inverse — un régime dit alors que les entrées n’en donnent pas', () => {
    const q = plan({ programme: { blocs: [bloc(11)] } });
    const c = q.plan.exercices[0].constat;
    c.regime = { genre: 'decharge', debut: plusJ(11) };
    c.suite = 'Ta décharge commence le 6 oct., prévue par ton programme.';
    expect(i169(q).length).toBeGreaterThan(0);
  });
  test('sens 4 — « commence le » sans régime', () => {
    expect(forger({ regime: null, suite: 'Ta décharge commence le 28 sept., prévue par ton programme.' }).length).toBeGreaterThan(0);
  });
  test('sens 5 — lexique relatif, sur la suite et sur l’effort', () => {
    ['demain', 'la semaine prochaine', 'bientôt', 'dans 3 jours', 'jusqu’au 4 oct.', 'semaine allégée', 'séances plus légères'].forEach((m) => {
      expect(forger({ suite: 'Ta décharge commence ' + m + ', prévue par ton programme.' }).length).toBeGreaterThan(0);
    });
    const q = plan();
    q.plan.exercices[0].effortVise = { phrase: '130 kg × 5, sans marge. Je garde 130 kg la prochaine fois, c’est le repos.' };
    expect(i169(q).length).toBeGreaterThan(0);
  });
  test('sens 1 (effort) — la phrase d’effort promet sous un régime', () => {
    expect(forger({}, { phrase: '130 kg × 5, sans marge. Je garde 130 kg la prochaine fois.' }).length).toBeGreaterThan(0);
  });
});
