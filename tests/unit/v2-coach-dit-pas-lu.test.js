/** @jest-environment node */
//
// « Le coach dit ce qu'il n'a pas lu » (27/11/2026, décision n° 49 du fondateur ; MOTEUR §9.54, I280).
// Quand la consigne repart d'une séance plus ancienne que la dernière de l'exercice, le « Pourquoi ? » le dit :
// « Ta séance du 26 janv. (sans coach) n'est pas lue. » UNE fonction (`seancesNonLues`, dans `consigneDExercice`), UNE phrase (`pourquoiNonLues`),
// câblées par `planDeSeance`. Aucune consigne, aucune charge, aucun verdict ne change ; la colonne PRÉC. reste « la dernière fois ».
// Fixtures : le défaut 1 du banc de rejeu (quatre séances, la 4e neutre) et le diagnostic « PRÉC. contre la phrase » (zone de plan 8-10).

process.env.TZ = 'Europe/Paris';

const Modele = require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/reserve.js');
const T = require('../../v2/js/plan.js');

const esp = (t) => String(t).replace(/[  ]/g, ' ');
const jour = (n) => new Date(Date.UTC(2026, 0, 5 + n, 17)).toISOString();
const AVANT = jour(28);   // 2 févr.
function serie(i, kg, reps, extra) {
  return reps.map((r, j) => Object.assign({ id: 'h' + i + '_' + j, session_id: 'S' + i, exercise_slug: 'x', charge_kg: kg, reps: r, type_serie: 'travail', rang: j + 1,
    rpe: null, ressenti: null, validee_a: jour(i * 7), source: 'app' }, extra || {}));
}
// specs : [{ kg, reps?, extra?, seance? }], une séance tous les `ecart` jours à partir du 5 janv.
function histoire(specs, ecart) {
  return specs.map((s, i) => ({ seance: Object.assign({ id: 'S' + i, debut: jour(i * (ecart || 7)) }, s.seance || {}), series: serie(i, s.kg, s.reps || [8, 8, 8], s.extra) }));
}
const TROIS = [{ kg: 100 }, { kg: 100 }, { kg: 100, reps: [9, 9, 9] }];   // 5, 12 et 19 janv.
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, correction: 'hypertrophie' };
const calcul = (g, o) => M.consigneDExercice(g, undefined, AVANT, Object.assign({}, OPT, o || {}));
const jours = (r) => (r.nonLues || []).map((x) => x.jour + ' ' + x.cause);
const dateDuGris = (r) => String(r.consigne.fondement.date).slice(0, 10);
const decision = (r) => ({ etat: r.consigne.etat, ligne: r.consigne.ligne, haut: r.consigne.haut });

describe('seancesNonLues — la dernière séance neutre est nommée, avec sa raison (défaut 1 du banc de rejeu)', () => {
  test('témoin : la 4e séance est normale, le coach la lit, rien n’est sauté, aucune clé', () => {
    const r = calcul(histoire(TROIS.concat([{ kg: 100 }])));
    expect(dateDuGris(r)).toBe('2026-01-26');
    expect('nonLues' in r).toBe(false);
    expect(M.pourquoiNonLues(r.nonLues)).toBeNull();
  });

  const CAS = [
    ['sans coach', { kg: 95, extra: { sans_coach: true } }, undefined, 'sans_coach', 'Ta séance du 26 janv. (sans coach) n’est pas lue.'],
    ['J’ai mal', { kg: 95, extra: { douleur: true } }, undefined, 'douleur', 'Ta séance du 26 janv. (J’ai mal) n’est pas lue.'],
    ['décharge', { kg: 95 }, { periodesAllegees: [{ debut: '2026-01-26', fin: '2026-01-26' }] }, 'decharge', 'Ta séance du 26 janv. (décharge) n’est pas lue.'],
    ['série hors calcul', { kg: 95, extra: { hors_calcul: true } }, undefined, 'hors_calcul', 'Ta séance du 26 janv. (hors calcul) n’est pas lue.'],
    ['chauffe seule', { kg: 60, extra: { type_serie: 'echauffement' } }, undefined, 'sans_serie', 'Ta séance du 26 janv. (aucune série comptée) n’est pas lue.']
  ];
  CAS.forEach(([nom, quatrieme, opt, cause, phrase]) => {
    test(`4e séance « ${nom} » : le gris reste sur le 19 janv., la phrase nomme le 26 janv. et sa raison, la consigne est celle d’avant`, () => {
      const r = calcul(histoire(TROIS.concat([quatrieme])), opt);
      expect(dateDuGris(r)).toBe('2026-01-19');
      expect(jours(r)).toEqual(['2026-01-26 ' + cause]);
      expect(esp(M.pourquoiNonLues(r.nonLues))).toBe(esp(phrase));
      // Aucune décision ne change : la consigne est celle de la même histoire SANS la 4e séance.
      const sans = calcul(histoire(TROIS), opt);
      expect(decision(r)).toEqual(decision(sans));
      expect(esp(r.libelles.gris)).toBe(esp(sans.libelles.gris));
    });
  });

  test('plusieurs séances : une phrase par raison, la plus récente d’abord, trois dates au plus puis « d’autres »', () => {
    const g = histoire(TROIS.concat([{ kg: 95, extra: { sans_coach: true } }, { kg: 95, extra: { sans_coach: true } }, { kg: 95, extra: { sans_coach: true } },
      { kg: 95, extra: { sans_coach: true } }, { kg: 95, extra: { douleur: true } }]), 3);
    const r = calcul(g);
    expect(jours(r)[0]).toMatch(/douleur$/);
    expect(r.nonLues).toHaveLength(5);
    expect(esp(M.pourquoiNonLues(r.nonLues))).toBe('Ta séance du 26 janv. (J’ai mal) n’est pas lue. Tes séances du 23 janv., du 20 janv., du 17 janv. et d’autres (sans coach) ne sont pas lues.');
    const deux = calcul(histoire(TROIS.concat([{ kg: 95, extra: { sans_coach: true } }, { kg: 95, extra: { douleur: true } }]), 5));
    expect(esp(M.pourquoiNonLues(deux.nonLues))).toBe('Ta séance du 25 janv. (J’ai mal) n’est pas lue. Ta séance du 20 janv. (sans coach) n’est pas lue.');
  });

  test('jour sans : le zéro et la séance légère sont nommés, la consigne est celle du retour', () => {
    const r = calcul(histoire([{ kg: 100 }, { kg: 100 }, { kg: 100 }, { kg: 100, reps: [0, 0, 0] }, { kg: 90 }], 5));
    expect(r.consigne.etat).toBe('retour_jour_sans');
    expect(jours(r)).toEqual(['2026-01-25 jour_sans', '2026-01-20 jour_sans']);
    expect(esp(M.pourquoiNonLues(r.nonLues))).toBe('Tes séances du 25 janv. et du 20 janv. (jour sans) ne sont pas lues.');
  });

  test('une séance de la même zone ET récente est lue : jamais nommée', () => {
    const r = calcul(histoire(TROIS.concat([{ kg: 100 }])), { zonePlan: 'hypertrophie', zonesDeRoutine: {} });
    expect('nonLues' in r).toBe(false);
  });
});

describe('seancesNonLues — la zone du plan écarte une séance plus récente (PRÉC. contre la phrase)', () => {
  const R1 = { kg: 90, reps: [5, 5, 5, 5], seance: { routine_id: 'R1' } };   // la séance lue (5 janv.)
  const R2 = { kg: 90, reps: [3], seance: { routine_id: 'R2' } };            // la dernière (12 janv.), une série de 90 × 3
  const ZONES = { R1: 'hypertrophie', R2: 'lourd' };

  test('une autre routine (zone posée par sa routine) : « autre routine »', () => {
    const r = calcul(histoire([R1, R2]), { zonePlan: 'hypertrophie', zonesDeRoutine: ZONES });
    expect(dateDuGris(r)).toBe('2026-01-05');
    expect(jours(r)).toEqual(['2026-01-12 autre_routine']);
    expect(esp(M.pourquoiNonLues(r.nonLues))).toBe('Ta séance du 12 janv. (autre routine) n’est pas lue.');
  });
  test('une autre zone (zone faite : médiane des reps) : « autre zone »', () => {
    const r = calcul(histoire([{ kg: 90, reps: [9, 9, 9, 9] }, { kg: 90, reps: [4, 4, 4] }]), { zonePlan: 'hypertrophie', zonesDeRoutine: {} });
    expect(jours(r)).toEqual(['2026-01-12 autre_zone']);
  });
  test('sans zone de plan, la même histoire lit la dernière séance : rien n’est nommé', () => {
    const r = calcul(histoire([R1, R2]));
    expect(dateDuGris(r)).toBe('2026-01-12');
    expect('nonLues' in r).toBe(false);
  });
  test('la colonne PRÉC. reste « la dernière fois » : la séance écartée par le coach est celle de PRÉC.', () => {
    const g = histoire([R1, R2]);
    const seances = g.map((x) => x.seance).sort((a, b) => (a.debut < b.debut ? 1 : -1));
    const prec = S.precedent('x', seances, (id) => g.filter((x) => x.seance.id === id)[0].series, 'COURS');
    expect(prec.seance.id).toBe('S1');
  });
});

describe('I280 — le plan dit la séance sautée, et la vérifie', () => {
  function planDe(r, o) {
    let n = 0;
    const id = () => 's' + (++n);
    let se = S.creer({ id: 'S9', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'x', id, { series: 3 });
    return T.planDeSeance(Object.assign({ seance: { id: 'S9', debut: AVANT, edition: false, exercices: se.exercices },
      consignes: { x: r }, reglage: 'normal', paris: [], suites: {} }, o || {}));
  }
  const i280 = (p, entrees) => T.verifierPlan(p, entrees || {}).erreurs.filter((e) => /^I280/.test(e));
  const toutes = (p, entrees) => T.verifierPlan(p, entrees || {}).erreurs;
  const G = histoire(TROIS.concat([{ kg: 95, extra: { sans_coach: true } }]));
  const prec = (g) => ({ x: { seance: g[g.length - 1].seance, series: g[g.length - 1].series } });

  test('le « Pourquoi ? » porte la phrase, l’exercice porte la liste, la phrase est dite (x.phrases) et citée', () => {
    const r = calcul(G);
    const p = planDe(r);
    const x = p.exercices[0];
    expect(esp(x.pourquoi.nonLues)).toBe('Ta séance du 26 janv. (sans coach) n’est pas lue.');
    expect(x.nonLues.map((q) => q.jour)).toEqual(['2026-01-26']);
    const dite = x.phrases.filter((q) => q.ou === 'pourquoi.nonLues');
    expect(dite).toHaveLength(1);
    expect(dite[0].citations.length).toBe(1);
    expect(esp(x.entete.gris)).not.toMatch(/26 janv/);   // le gris ne change pas : il cite la séance lue
  });

  test('un plan réel : aucune erreur I280 ni I26 (les dates sont citées), PRÉC. comprise dans les entrées', () => {
    const entrees = { precedents: prec(G) };
    const p = planDe(calcul(G));
    expect(i280(p, entrees)).toEqual([]);
    expect(toutes(p, entrees).filter((e) => /^I26/.test(e))).toEqual([]);
    // Le témoin, la dernière séance est lue : le gris cite la dernière séance, aucune phrase.
    const g = histoire(TROIS.concat([{ kg: 100 }]));
    const pt = planDe(calcul(g));
    expect(pt.exercices[0].pourquoi.nonLues).toBeUndefined();
    expect(i280(pt, { precedents: prec(g) })).toEqual([]);
  });

  test('toutes les raisons passent le plan sans erreur I280 ni I26', () => {
    const cas = [
      [histoire(TROIS.concat([{ kg: 95, extra: { douleur: true } }])), {}],
      [histoire(TROIS.concat([{ kg: 95 }])), { periodesAllegees: [{ debut: '2026-01-26', fin: '2026-01-26' }] }],
      [histoire(TROIS.concat([{ kg: 95, extra: { hors_calcul: true } }])), {}],
      [histoire([{ kg: 100 }, { kg: 100 }, { kg: 100 }, { kg: 100, reps: [0, 0, 0] }, { kg: 90 }], 5), {}],
      [histoire([{ kg: 90, reps: [5, 5, 5, 5], seance: { routine_id: 'R1' } }, { kg: 90, reps: [3], seance: { routine_id: 'R2' } }]), { zonePlan: 'hypertrophie', zonesDeRoutine: { R1: 'hypertrophie', R2: 'lourd' } }]
    ];
    cas.forEach(([g, o]) => {
      const p = planDe(calcul(g, o));
      expect(p.exercices[0].pourquoi.nonLues).toBeTruthy();
      const e = toutes(p, { precedents: prec(g) }).filter((q) => /^(I280|I26)/.test(q));
      expect(e).toEqual([]);
    });
  });

  // ── Les discriminants : chaque faute est vue ──
  test('⚠️ la phrase retirée : le gris cite le 19 janv. et la dernière séance est celle du 26, sans un mot', () => {
    const p = planDe(calcul(G));
    const x = p.exercices[0];
    delete x.pourquoi.nonLues; delete x.nonLues;
    expect(i280(p, { precedents: prec(G) }).join('\n')).toMatch(/I280 — exercice 0 \(x\) : le gris cite la séance du 2026-01-19 alors que la dernière séance est celle du 2026-01-26/);
  });
  test('⚠️ la liste sans la phrase, et la phrase sans la liste', () => {
    const p = planDe(calcul(G));
    const x = p.exercices[0];
    const phrase = x.pourquoi.nonLues;
    delete x.pourquoi.nonLues;
    expect(i280(p).join('\n')).toMatch(/sans phrase au « Pourquoi \? »/);
    x.pourquoi.nonLues = phrase; x.nonLues = null;
    expect(i280(p).join('\n')).toMatch(/sans séance sautée/);
  });
  test('⚠️ une séance « sautée » plus ancienne que celle du gris est refusée', () => {
    const p = planDe(calcul(G));
    p.exercices[0].nonLues = [{ debut: jour(0), jour: '2026-01-05', cause: 'sans_coach' }];
    expect(i280(p).join('\n')).toMatch(/n’est pas plus récente que celle du gris/);
  });
  test('⚠️ la phrase ne date pas la séance sautée la plus récente', () => {
    const p = planDe(calcul(G));
    p.exercices[0].pourquoi.nonLues = 'Ta séance (sans coach) n’est pas lue.';
    expect(i280(p).join('\n')).toMatch(/n’est pas datée dans la phrase/);
  });
  test('⚠️ une autre séance que la dernière est annoncée : la dernière reste muette', () => {
    const p = planDe(calcul(G));
    const x = p.exercices[0];
    x.nonLues = [{ debut: jour(22), jour: '2026-01-27', cause: 'sans_coach' }];
    x.pourquoi.nonLues = 'Ta séance du ' + Modele.jourCourt('2026-01-27') + ' (sans coach) n’est pas lue.';
    expect(i280(p, { precedents: prec(G) }).join('\n')).toMatch(/la dernière séance est celle du 2026-01-26/);
  });
  test('la séance du plan lui-même (en cours ou rechargée) n’est pas une séance non lue ; une vraie séance sautée l’est toujours', () => {
    const g = histoire(TROIS);
    const p = planDe(calcul(g));
    const soi = { seance: { id: 'S9', debut: AVANT, series: [] } };
    const moi = { x: { seance: { id: 'S9', debut: AVANT }, series: [] } };
    expect(i280(p, Object.assign({ precedents: moi }, soi))).toEqual([]);
    const autre = { x: { seance: { id: 'S8', debut: AVANT }, series: [] } };   // même instant que le plan, autre id : pas « avant » non plus
    expect(i280(p, Object.assign({ precedents: autre }, soi))).toEqual([]);
    // sans `entrees.seance`, l'ancien comportement : la dernière séance doit être dite
    expect(i280(p, { precedents: moi }).length).toBe(1);
  });
  test('une séance sautée du MÊME jour civil que celle du gris, mais plus tard, est plus récente', () => {
    const p = planDe(calcul(G));
    const d = p.exercices[0].consigne.fondement.date;
    const tard = new Date(Date.parse(d) + 3600e3).toISOString();
    const x = p.exercices[0];
    x.nonLues = [{ debut: tard, jour: x.nonLues[0].jour, cause: 'sans_coach' }];
    x.consigne.fondement = Object.assign({}, x.consigne.fondement, { date: d.slice(0, 10) + 'T10:00:00.000Z' });
    x.nonLues[0].jour = d.slice(0, 10); x.nonLues[0].debut = d.slice(0, 10) + 'T12:00:00.000Z';
    expect(i280(p).join('\n')).not.toMatch(/n’est pas plus récente/);
    x.nonLues[0].debut = d.slice(0, 10) + 'T08:00:00.000Z';
    expect(i280(p).join('\n')).toMatch(/n’est pas plus récente/);
  });
  test('une séance arrivée APRÈS le calcul figé n’est pas non lue (vueJusqua) ; sans cette marque, elle est réclamée', () => {
    const g = histoire(TROIS);
    const r = calcul(g);
    expect(r.vueJusqua).toBe(g[2].seance.debut);
    const arrivee = { seance: { id: 'S8', debut: jour(25) }, series: [] };
    expect(i280(planDe(r), { precedents: { x: arrivee }, consignes: { x: r } })).toEqual([]);
    const sans = JSON.parse(JSON.stringify(r)); delete sans.vueJusqua;
    expect(i280(planDe(sans), { precedents: { x: arrivee }, consignes: { x: sans } }).length).toBe(1);
    // une séance déjà vue au calcul et sautée sans phrase reste réclamée
    const G4 = histoire(TROIS.concat([{ kg: 95, extra: { sans_coach: true } }]));
    const p = planDe(calcul(G4)); delete p.exercices[0].pourquoi.nonLues; delete p.exercices[0].nonLues;
    expect(i280(p, { precedents: prec(G4) }).length).toBe(1);
  });
});
