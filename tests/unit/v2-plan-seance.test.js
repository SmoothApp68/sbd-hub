/** @jest-environment node */
//
// v2/js/plan.js — le plan de séance, un seul coach (MOTEUR §9.13 bis, §9.14 ;
// ECRAN §3.12 ; 49-U1).
//
// Trois blocs :
//   · le CAS DU 26/09/2026, rejoué pas à pas : l'en-tête décrit les 3 séries
//     de la séance, la série 2 reste le test à 130, la phrase de la décision 1 ;
//   · `verifierPlan` sur des plans FABRIQUÉS qui violent chaque invariant de
//     C1 (I1, I2, I3, I6, I9, I12) : chacun doit être vu ;
//   · des plans GÉNÉRÉS — les consignes du fichier de cas 48b-7 × des séances
//     de 2 à 5 séries (avec et sans chauffe) × des suites de gestes — et
//     `verifierPlan` sur chacun, après chaque geste.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const P = require('../../v2/js/palier.js');
const T = require('../../v2/js/plan.js');

const esp = (x) => (x === null || x === undefined ? x : String(x).replace(/ /g, ' '));
const AVANT = '2026-09-26T10:00:00+00:00';

// ── Une séance simulée, et ses paris écrits comme l'app les écrit ──────────
function simulateur(slug, consigneObj, series, types, suiteDe) {
  let n = 0;
  const id = () => slug + '-s' + (++n);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, slug, id, { series: series });
  (types || []).forEach((t, i) => { if (t !== 'travail') se = S.changerType(se, 0, i, t); });
  const paris = [];
  const api = {
    // 49-U4 — la suite (la consigne de la prochaine séance), fournie comme
    // l'app la fournit : quand toutes les séries de travail sont faites.
    entrees: () => {
      const travail = se.exercices[0].series.filter((x) => S.typeDe(x) === 'travail');
      const fini = travail.length && travail.every((x) => S.partEnBase(x));
      return { seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
        consignes: { [slug]: consigneObj }, paris: paris.slice(),
        suites: suiteDe && fini ? { [slug]: suiteDe(travail) } : {} };
    },
    plan: () => T.planDeSeance(api.entrees()),
    exo: () => api.plan().exercices[0],
    // 49-U3 — I4 : chaque plan se compare au précédent (une ligne figée ne
    // change jamais). I7 et I8 lisent les paris des entrées.
    avant: null,
    verifier: () => {
      const e = api.entrees();
      const p = T.planDeSeance(e);
      const v = T.verifierPlan(p, e, api.avant);
      api.avant = p;
      return v;
    },
    series: () => se.exercices[0].series,
    valider: (i, kg, reps) => {
      se = S.modifierSerie(se, 0, i, { charge_kg: kg, reps: reps });
      se = S.valider(se, 0, i, new Date('2026-09-26T10:30:00Z'));
      // 49-U3 — le pari se lit dans le plan, comme `noterPari` le lit.
      const x = api.exo();
      if (!x.consigne || !x.paris) return [];
      const q = x.paris[i];
      if (!q) return [];
      paris.push(Object.assign({}, q, { set_observe: api.series()[i].id }));
      return [q];
    },
    ajouter: () => { se = S.ajouterSerie(se, 0, id); }
  };
  return api;
}

// ── LE CAS DU 26/09/2026 ────────────────────────────────────────────────────
describe('49-U1 — le cas du 26/09/2026, rejoué sur le plan', () => {
  const set = (sid, kg, reps, rang) => ({ id: sid + '-' + rang, session_id: sid, exercise_slug: 'terre',
    charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', rang, validee_a: 'v', source: 'app' });
  const jour = (d) => (d === '01' ? '2026-08-' : '2026-09-') + d + 'T18:00:00+00:00';
  const seances = [['z', '01', [[127.5, 3], [127.5, 3], [127.5, 3]]], ['a', '05', [[120, 5], [120, 5], [120, 5]]],
    ['b', '12', [[122.5, 5], [122.5, 5], [122.5, 5]]], ['c', '19', [[125, 5], [125, 5], [125, 5], [130, 4]]]]
    .map(([sid, d, l]) => ({ seance: { id: sid, debut: jour(d) }, series: l.map(([kg, r], i) => set(sid, kg, r, i + 1)) }));
  const etat = P.etatsExercices(P.seanceExercices([].concat(...seances.map((g) =>
    g.series.map((s) => Object.assign({ slug: 'terre' }, s))))));
  const cons = M.consigneDExercice(seances, etat.terre, AVANT,
    { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false });

  test('prémisse : `etend`, n = 4, deux tests à 130, et le cran au-dessus de 125 est 127,5', () => {
    expect(cons.consigne).toMatchObject({ etat: 'etend', n: 4, ligne: { charge: 125, vise: 5 },
      haut: { charge: 130, vise: 4, k: 2 } });
    expect(cons.contexte.cran).toBe(127.5);
    // La consigne brute, seule, décrit QUATRE séries — c'est ce que l'en-tête
    // affichait le 26/09.
    expect(cons.libelles.jaune.map(esp)).toEqual(['130 kg × 4 sur les 2 dernières séries',
      '125 kg × 5 sur les 2 d\'avant']);
  });

  test('DISCRIMINANT — routine à 3 : l’en-tête décrit les 3 séries de la grille (I6)', () => {
    const sim = simulateur('terre', cons, 3);
    const x = sim.exo();
    // ECRAN §3.12 (68A) — l'objectif du jour ; le « Donc » de la feuille garde
    // ses phrases (avant 68A, l'en-tête disait les mêmes).
    expect(x.entete.jaune.map(esp)).toEqual(['Aujourd\'hui : 125 kg × 5.',
      'Si ça passe, 130 kg × 4 sur 2 séries, celles que tu veux.']);
    expect(esp(x.donc)).toBe('Donc 130 kg × 4 sur les 2 dernières séries, 125 kg × 5 sur celle d\'avant.');
    expect(x.lignes.map((l) => l.role + ':' + l.charge + '×' + l.vise)).toEqual(['ligne:125×5', 'test:130×4', 'test:130×4']);
    // I26 (49-U19) se rapporte à part (`ecartsPhrases`) : ici, I1 à I25.
    const v = sim.verifier();
    expect({ ok: v.ok, erreurs: v.erreurs }).toEqual({ ok: true, erreurs: [] });
  });

  test('DISCRIMINANT — 125 × 8 : AUCUNE proposition à 127,5, la série 2 reste le test à 130 (I2)', () => {
    const sim = simulateur('terre', cons, 3);
    sim.valider(0, 125, 8);
    const x = sim.exo();
    expect(x.lignes[1]).toMatchObject({ role: 'test', charge: 130, vise: 4, source: 'consigne', proposee: false });
    expect(x.reaction.revision).toBe(0);
    expect(esp(x.message.phrase)).toBe('125 kg × 8, 3 de plus que prévu : ton test à 130 kg arrive dès la série 2, avec de la marge.');
    expect(x.message).toMatchObject({ type: 'test_suit', iSerie: 1 });
    expect(sim.verifier().ok).toBe(true);
  });

  test('130 × 4 en série 2 : pas de « ton test a avancé », et le pari est celui du test', () => {
    const sim = simulateur('terre', cons, 3);
    sim.valider(0, 125, 8);
    const pari = sim.valider(1, 130, 4);
    expect(pari).toHaveLength(1);
    expect(pari[0].fondement).toMatchObject({ rang: 2, role: 'haut', charge: 130 });
    expect(pari[0].fondement.revision).toBeUndefined();
    const x = sim.exo();
    expect(x.message).toBeNull();
    expect(sim.verifier().ok).toBe(true);
    sim.valider(2, 130, 4);
    expect(sim.verifier().ok).toBe(true);
  });
});

// ── SANS TEST À SUIVRE : LA PROPOSITION CLASSIQUE DE R2 ────────────────────
describe('49-U1 — sans test à suivre, la proposition de R2 marche toujours', () => {
  const C = { consigne: { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 3,
    ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} },
    contexte: { cran: 127.5, haut: null }, libelles: { jaune: [], gris: 'g' } };

  // 49-U5 (delta 49-13, §9.14) — AVANT : « routine à 4 : 125 × 8 propose
  // 127,5 sur la série 2 ». Le test à 130 est prévu plus loin dans le bloc : la
  // proposition prend SA charge (I14), une seule montée par bloc.
  test('routine à 4 : 125 × 8 propose 130 sur la série 2 — la charge du test prévu en série 4', () => {
    const sim = simulateur('x', C, 4);
    sim.valider(0, 125, 8);
    const x = sim.exo();
    expect(x.lignes[1]).toMatchObject({ role: 'coach', charge: 130, proposee: true });
    expect(x.lignes[3]).toMatchObject({ role: 'test', charge: 130 });
    expect(esp(x.message.phrase)).toBe('125 kg × 8, 3 de plus que visé : je passe ta série 2 à 130 kg, vise 3 à 5.');
    expect(sim.verifier().ok).toBe(true);
  });

  // 49-U5 — AVANT : « 127,5 tenu, le test à 130 encore à venir : tu montes,
  // pas ton test a avancé (I9) ». 127,5 n'est plus proposé : c'est un refus,
  // le coach se tait. 130 tenu, lui, fait avancer le test d'une série (I9).
  test('DISCRIMINANT — 127,5 ensuite est un refus (silence) ; 130 tenu : « ton test a avancé d’une série » (I9)', () => {
    const refus = simulateur('x', C, 4);
    refus.valider(0, 125, 8);
    refus.valider(1, 127.5, 4);
    expect(refus.exo().message).toBeNull();
    expect(refus.verifier().ok).toBe(true);
    const sim = simulateur('x', C, 4);
    sim.valider(0, 125, 8);
    sim.valider(1, 130, 4);
    const x = sim.exo();
    expect(x.message).toMatchObject({ type: 'tenue' });
    expect(esp(x.message.phrase)).toBe('130 kg × 4, dans ta zone : ton test a avancé d\'une série.');
    expect(sim.verifier().ok).toBe(true);
  });

  test('témoin — la proposition EST la charge du test : « ton test a avancé d’une série »', () => {
    const C2 = Object.assign({}, C, { consigne: Object.assign({}, C.consigne,
      { haut: { charge: 127.5, vise: 4, k: 1 } }) });
    const sim = simulateur('x', C2, 3);
    sim.valider(0, 125, 8);
    sim.valider(1, 127.5, 4);
    expect(esp(sim.exo().message.phrase)).toBe('127,5 kg × 4, dans ta zone : ton test a avancé d\'une série.');
    expect(sim.verifier().ok).toBe(true);
  });

  test('l’en-tête d’une forme inhabituelle (test fait, puis une série ajoutée) se dit dans l’ordre', () => {
    const sim = simulateur('x', C, 3);
    sim.valider(0, 125, 5); sim.valider(1, 125, 5); sim.valider(2, 130, 4);
    sim.ajouter();
    const x = sim.exo();
    expect(x.entete.jaune.map(esp)).toEqual(['125 kg × 5 sur 2 séries', 'puis 130 kg × 4 sur une série',
      'puis 125 kg × 5 sur une série']);
    expect(sim.verifier().ok).toBe(true);
  });
});

// ── verifierPlan VOIT CHAQUE VIOLATION ──────────────────────────────────────
describe('49-U1 — verifierPlan voit chaque violation (I1, I2, I3, I5, I6, I9, I12)', () => {
  // Une consigne « garde » porte son test : la feuille « Pourquoi », que le
  // plan rédige, le lit (PR 1, relevé du 01/10).
  const C = { consigne: { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 3,
    ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: { test: { charge: 130, reps: 3, niveau: 3, date: '2026-09-24T10:00:00+00:00' } } },
    contexte: { cran: 127.5, haut: null }, libelles: { jaune: [], gris: '' } };
  const base = () => { const sim = simulateur('x', C, 3); return { sim, plan: JSON.parse(JSON.stringify(sim.plan())) }; };
  const erreurs = (plan) => T.verifierPlan(plan).erreurs.map((e) => e.split(' — ')[0]);

  test('le plan d’origine passe', () => {
    expect(T.verifierPlan(base().plan)).toEqual({ ok: true, erreurs: [], ecartsPhrases: [] });
  });

  test('I1 — un rôle inconnu, ou une chauffe couverte', () => {
    const { plan } = base();
    plan.exercices[0].lignes[0].role = 'mystère';
    expect(erreurs(plan)).toContain('I1');
    const b = base().plan;
    b.exercices[0].lignes[0].type = 'echauffement';
    expect(erreurs(b)).toContain('I1');
  });

  test('DISCRIMINANT — I2 : une ligne du coach à la place d’un test', () => {
    const { plan } = base();
    plan.exercices[0].reaction.plan[2] = { charge: 132.5, vise: 3, zone: [3, 5], source: 'coach' };
    expect(erreurs(plan)).toContain('I2');
  });

  test('I3 — une proposition plus basse que la ligne prévue, ou pas au-dessus du palier', () => {
    const { plan } = base();
    plan.exercices[0].reaction.plan[1] = { charge: 120, vise: 3, zone: [3, 5], source: 'coach' };
    expect(erreurs(plan)).toContain('I3');
  });

  test('I6 — un en-tête qui compte les séries de la consigne brute (4) pour une grille à 3', () => {
    const { plan } = base();
    plan.exercices[0].entete.jaune = ['130 kg × 4 sur les 2 dernières séries', '125 kg × 5 sur les 2 d\'avant'];
    expect(erreurs(plan)).toContain('I6');
    const b = base().plan;
    b.exercices[0].entete.segments = [{ role: 'ligne', charge: 125, vise: 5, nombre: 3 }, { role: 'haut', charge: 130, vise: 4, nombre: 1 }];
    expect(erreurs(b)).toContain('I6');
  });

  test('I9 — « propose » sans ligne du coach ; « ton test arrive » sur une ligne ; « ton test a avancé » à tort', () => {
    const a = base().plan;
    a.exercices[0].reaction.message = { type: 'propose', rang: 1, charge: 125, reps: 8, charges: [127.5], marge: 3 };
    expect(erreurs(a)).toContain('I9');
    const b = base().plan;
    b.exercices[0].reaction.message = { type: 'test_suit', rang: 1, charge: 125, reps: 8, marge: 3, test: {} };
    expect(erreurs(b)).toContain('I9');
    const c = base().plan;
    c.exercices[0].reaction.plan[1] = { charge: 127.5, vise: 3, zone: [3, 5], source: 'coach' };
    c.exercices[0].reaction.message = { type: 'tenue', rang: 2, charge: 127.5, reps: 4, avance: true };
    c.exercices[0].lignes[1].validee = true;
    expect(erreurs(c)).toContain('I9');
  });

  test('I5 (audit du 16/10/2026, 01 #7) — un test perdu, un test de trop, un test qui n’est pas sur la dernière ligne', () => {
    expect(base().plan.exercices[0].planInitial.map((q) => q.role)).toEqual(['ligne', 'ligne', 'haut']);
    const perdu = base().plan;
    perdu.exercices[0].planInitial[2].role = 'ligne';
    expect(erreurs(perdu)).toContain('I5');
    const trop = base().plan;
    trop.exercices[0].planInitial[1].role = 'haut';
    expect(erreurs(trop)).toContain('I5');
    const ailleurs = base().plan;
    ailleurs.exercices[0].planInitial[0].role = 'haut';
    ailleurs.exercices[0].planInitial[2].role = 'ligne';
    expect(erreurs(ailleurs)).toContain('I5');
    // Un test figé (validé avec son pari) : il ne reste plus de test à poser.
    const fige = base().plan;
    fige.exercices[0].planInitial[2].figee = true;
    expect(erreurs(fige)).not.toContain('I5');
    fige.exercices[0].planInitial[1].role = 'haut';
    expect(erreurs(fige)).toContain('I5');
  });

  test('I8 (122) — une ligne non figée reprend un rang qu’une série faite a quitté', () => {
    const p = base().plan;
    p.exercices[0].rangsQuittes = [1];
    expect(erreurs(p)).toContain('I8');
  });

  test('I12 — même entrée, plan différent', () => {
    const { sim } = base();
    const autre = simulateur('x', C, 4).plan();
    expect(T.verifierPlan(autre, sim.entrees()).erreurs.map((e) => e.split(' — ')[0])).toContain('I12');
  });

  test('`seriesDites` compte ce que le texte dit', () => {
    // §20.2 (49-U9) — la voix a changé ses mots, pas ce qu'ils comptent.
    expect(T.seriesDites(['130 kg × 4 sur les 2 dernières séries', '125 kg × 5 sur celle d\'avant']))
      .toEqual({ compte: 3, sansCompte: 0 });
    expect(T.seriesDites(['125 kg × 5', 'puis 130 kg × 4 sur la dernière série']))
      .toEqual({ compte: 1, sansCompte: 1 });
  });
});

// ── DES PLANS GÉNÉRÉS ───────────────────────────────────────────────────────
describe('49-U1 — plans générés : les invariants tiennent après chaque geste', () => {
  const CAS = require('./fixtures/consigne-48b7.json');
  // 49-U4 — la suite de chaque cas : `consignePour` sur l'historique du cas
  // augmenté de la séance du jour, passée par le même pont que l'app
  // (`contratDe`), et le cran au-dessus de son palier.
  const APRES = '2026-09-26T12:00:00+00:00';
  const consignes = CAS.map((c) => {
    const opts = { reglage: c.reglage, equipement: c.equipement, correction: c.correction };
    const k = M.consignePour(c.seances, c.avant, opts);
    const suiteDe = (faites) => {
      const tous = c.seances.concat(M.contratDe([{ seance: { debut: AVANT }, series: faites }], null, 'charge_reps'));
      const apres = M.consignePour(tous, APRES, opts);
      const P = apres.palier;
      return { consigne: apres,
        cranSuivant: P === null || P === undefined ? null : M.chargeVoisine(tous, APRES, P, c.equipement, 1) };
    };
    return { id: c.id, suiteDe, obj: { consigne: k, libelles: M.libellesConsigne(k),
      contexte: M.contexteReaction(c.seances, c.avant, k, c.equipement, null) } };
  });
  // Les gestes : ce que la ligne affiche, +3, +5, plus léger, plus lourd ; et
  // sur une ligne proposée, l'accepter ou la refuser.
  const SUITES = [
    ['plan', 'plan', 'plan', 'plan', 'plan'],
    ['+3', 'accepte', 'plan', 'plan', 'plan'],
    ['+5', 'refuse', 'plan', '+3', 'plan'],
    ['leger', '+3', 'accepte', 'plan', 'plan'],
    ['+3', 'plan', '+3', 'lourd', 'plan'],
    ['+3', 'accepte-bas', 'plan', 'plan', 'plan']
  ];
  const FORMES = [];
  [2, 3, 4, 5].forEach((n) => { FORMES.push({ n, types: null }); FORMES.push({ n: n + 1, types: ['echauffement'] }); });

  test('toutes les combinaisons passent verifierPlan (et I12), après chaque geste', () => {
    let plans = 0;
    const echecs = [];
    // 49-U2 — I11 n'éprouve rien si aucun plan ne porte les deux sources : on
    // compte les fantômes « dernière série » et les retours au plan qui suivent.
    // 68A — le fantôme n'a plus qu'une source, le plan ; les gestes « lourd »
    // et « léger » portent l'élan et « plus léger » (MOTEUR §9.14 bis).
    const sources = { plan: 0, derniere: 0, elan: 0, plusLeger: 0 };
    // 49-U4 — I10 n'éprouve rien sans constats : on compte ceux qui disent une
    // montée tenue (K-V11, la séance menée par le coach, est parti en 49-U10). La partie « suite »
    // d'I10 (b) se RAPPORTE, elle ne fait pas échouer ce test (décision de
    // fond, hors de ce commit) : elle est comptée à part.
    const constats = { tous: 0, montee: 0, remplace: 0, garde: 0, pasDePalier: 0 };
    const suiteSous = [];
    // 49-U5 — I14 et la réaction en reprise n'éprouvent rien sans leurs cas :
    // on compte les propositions suivies d'un test prévu, et celles d'une
    // reprise (muette avant le 27/09).
    const u5 = { avantTest: 0, reprise: 0 };
    const vuU5 = {};
    consignes.forEach(({ id, obj, suiteDe }) => {
      FORMES.forEach((forme) => {
        SUITES.forEach((suite, iSuite) => {
          const sim = simulateur('x', obj, forme.n, forme.types, suiteDe);
          const verifier = (quand) => {
            plans++;
            const v0 = sim.verifier();
            const horsSuite = v0.erreurs.filter((e) => e.indexOf('I10 suite') !== 0);
            v0.erreurs.filter((e) => e.indexOf('I10 suite') === 0).forEach((e) =>
              suiteSous.push(id + ' · ' + forme.n + (forme.types ? 'W' : '') + ' · suite ' + iSuite + ' : ' + e));
            const v = { ok: horsSuite.length === 0, erreurs: horsSuite };
            const k10 = sim.exo().constat;
            if (k10) {
              constats.tous++;
              if (k10.montee) constats.montee++;
              // La montée ne remplace que le verdict qui la contredisait ; les
              // autres verdicts restent tels qu'ils étaient (décidé le 27/09).
              if (k10.montee) constats[/^La montée du coach a tenu/.test(k10.verdict) ? 'remplace' : 'garde']++;
              if (/^Pas de palier/.test(k10.verdict)) constats.pasDePalier++;
            }
            const xU5 = sim.exo();
            (xU5.lignes || []).forEach((l, i) => {
              if (l.role !== 'coach' || !l.proposee) return;
              const cle = id + '|' + forme.n + (forme.types ? 'W' : '') + '|' + iSuite + '|' + i;
              if (vuU5[cle]) return;
              vuU5[cle] = true;
              if ((xU5.planInitial || []).some((q, t) => t > l.position && q && q.role === 'haut')) u5.avantTest++;
              if (/^reprise/.test(xU5.consigne.etat)) u5.reprise++;
            });
            const ls = sim.exo().lignes || [];
            ls.forEach((l) => {
              if (l.role === 'elan') sources.elan++;
              if (!l.fantome) return;
              sources[l.fantome.source] = (sources[l.fantome.source] || 0) + 1;
            });
            const mU = sim.exo().message;
            if (mU && mU.type === 'plus_leger') sources.plusLeger++;
            if (!v.ok) echecs.push(id + ' · ' + forme.n + (forme.types ? 'W' : '') + ' · suite ' + iSuite + ' · ' + quand + ' : ' + v.erreurs[0]);
          };
          verifier('ouverture');
          sim.series().forEach((s, i) => {
            if (S.typeDe(sim.series()[i]) !== 'travail') { sim.valider(i, 20, 10); verifier('chauffe ' + i); return; }
            const x = sim.exo();
            const l = x.lignes[i];
            const geste = suite[Math.min(i, suite.length - 1)];
            const P0 = obj.consigne && obj.consigne.ligne ? obj.consigne.ligne.charge : 50;
            let kg = l.charge === null || l.charge === undefined ? (P0 || 50) + 2.5 : l.charge;
            let reps = l.vise || (l.fourchette ? l.fourchette[0] : 8) || 8;
            if (geste === '+3') reps += 3;
            if (geste === '+5') reps += 5;
            if (geste === 'leger') kg = Math.max(0, kg - 10);
            if (geste === 'lourd') kg += 5;
            if (geste === 'refuse' && l.proposee) kg = P0 || kg;
            if (geste === 'accepte-bas' && l.proposee) reps = Math.max(1, (l.fourchette ? l.fourchette[0] : reps) - 1);
            sim.valider(i, kg, reps);
            verifier('série ' + i + ' ' + geste);
            if (i === 1 && iSuite % 2 === 0) { sim.ajouter(); verifier('+ Série'); }
          });
        });
      });
    });
    expect(echecs.slice(0, 5)).toEqual([]);
    expect(plans).toBeGreaterThan(3000);
    expect(sources.derniere).toBe(0);
    expect(sources.elan).toBeGreaterThan(50);
    expect(sources.plusLeger).toBeGreaterThan(10);
    expect(constats.tous).toBeGreaterThan(100);
    expect(constats.montee).toBeGreaterThan(10);
    expect(u5.avantTest).toBeGreaterThan(10);
    expect(u5.reprise).toBeGreaterThan(3);
    expect(constats.remplace).toBeGreaterThan(10);
    expect(constats.garde).toBeGreaterThan(10);
    // Ce que la PR rapporte : les constats, et les montées tenues dont la
    // prochaine séance proposerait moins.
    // eslint-disable-next-line no-console
    console.log('49-U5 propositions ' + JSON.stringify(u5) + ' · 49-U4 constats ' + JSON.stringify(constats) + ' · suite sous la montée : ' +
      suiteSous.length + '\n' + suiteSous.slice(0, 40).join('\n'));
  });
});

// ── 122 — UN RANG QUITTÉ PAR UNE SÉRIE FAITE N'EST JAMAIS REPRIS (I8 ; le défaut trouvé au 115) ────────────────
describe('122 — I7, I8 : supprimer les séries faites puis en valider une nouvelle', () => {
  const C = { consigne: { etat: 'garde', zone: 'lourd', palier: 125, niveau: 5, n: 2,
    ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 }, fondement: {} },
    contexte: { cran: 127.5, haut: null }, libelles: { jaune: [], gris: '' } };
  // Comme l'app : un pari dont l'identifiant (rang, révision) existe déjà ne s'écrit pas (`dejaNote`), et la série
  // observe le pari de son rang ; supprimée, son observation se vide (le pari reste).
  function jouer(retenirLeRang) {
    let n = 0;
    const id = () => 'x-s' + (++n);
    let se = S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: id }), 'x', id, { series: 2 });
    const paris = [];
    const entrees = () => ({ seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices },
      consignes: { x: C }, paris: paris.slice(), suites: {} });
    const valider = (i, kg, reps) => {
      se = S.valider(S.modifierSerie(se, 0, i, { charge_kg: kg, reps }), 0, i, new Date('2026-09-26T10:30:00Z'));
      const q = T.planDeSeance(entrees()).exercices[0].paris[i];
      const sid = se.exercices[0].series[i].id;
      const meme = paris.filter((o) => o.fondement.rang === q.fondement.rang && (o.fondement.revision || 0) === (q.fondement.revision || 0))[0];
      if (meme) meme.set_observe = sid; else paris.push(Object.assign({}, q, { set_observe: sid }));
    };
    valider(0, 125, 5);
    const rang = T.planDeSeance(entrees()).exercices[0].lignes[0].rang;
    const sid = se.exercices[0].series[0].id;
    paris.forEach((o) => { if (o.set_observe === sid) o.set_observe = null; });
    se = S.retirerSerie(se, 0, 0);
    if (retenirLeRang) se = S.quitterRang(se, 0, rang);
    valider(0, 130, 4);
    const e = entrees();
    const p = T.planDeSeance(e);
    return { p, paris, erreurs: T.verifierPlan(p, e).erreurs.filter((x) => /^I[78] /.test(x)) };
  }
  test('témoin — sans le rang retenu, la nouvelle série reprend le rang 1 et observe le pari de l’ancienne (une « ligne » à 125)', () => {
    const r = jouer(false);
    expect(r.p.exercices[0].lignes[0].rang).toBe(1);
    expect(r.paris.length).toBe(1);
    expect([r.paris[0].fondement.role, r.paris[0].fondement.charge]).toEqual(['ligne', 125]);
  });
  test('⚠️ DISCRIMINANT — le rang retenu : la nouvelle série prend le rang 2, son propre pari (le test à 130) ; l’ancien reste, non observé', () => {
    const r = jouer(true);
    expect(r.p.exercices[0].lignes[0].rang).toBe(2);
    expect(r.paris.map((o) => [o.fondement.rang, o.fondement.role, o.fondement.charge, !!o.set_observe]))
      .toEqual([[1, 'ligne', 125, false], [2, 'haut', 130, true]]);
    expect(r.erreurs).toEqual([]);
  });
  test('« Annuler » rend le rang ; une série non retenue n’en laisse aucun', () => {
    let se = S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: () => 'a' }), 'x', (() => { let k = 0; return () => 'y' + (++k); })(), { series: 2 });
    se = S.quitterRang(S.quitterRang(se, 0, 2), 0, 1);
    expect(se.exercices[0].rangsQuittes).toEqual([1, 2]);
    expect(S.rendreRang(se, 0, 1).exercices[0].rangsQuittes).toEqual([2]);
    expect(S.quitterRang(se, 0, null)).toBe(se);
  });
});

// ── 122 — I26 (le défaut trouvé au 115) : une ligne d'élan figée tient la place de la ligne de la consigne ───────
describe('122 — I26 : l’en-tête garde la ligne de la consigne qu’un élan figé remplace', () => {
  // Reproduit au banc (sections « quitter » puis « 115 ») : consigne 60 kg × 5 puis un test à 100 ; la série 1 faite à
  // 70 × 5 (l'élan porte la série 2 à 70), la série 2 faite, puis la série 1 supprimée. Il reste l'élan à 70 (figé)
  // et le test : « Aujourd'hui : 60 kg × 5 » ne trouvait plus de ligne (I26, cible_hors_lignes).
  const C = { consigne: { etat: 'test_propose', zone: 'lourd', palier: 60, niveau: 5, n: 1, ligne: { charge: 60, vise: 5 },
    haut: { charge: 100, vise: 3, k: 1 }, fondement: { date: '2026-10-17T01:43:03.841Z', reps: [5],
      seance: [{ charge_kg: 60, reps: 5, rpe: null, ressenti: null, role: 'palier', origine: 'travail' }], habitude: { valeur: 5, seances: 3 } } },
    contexte: { cran: 62.5, haut: null }, libelles: { jaune: [], gris: '' } };
  test('⚠️ DISCRIMINANT — la première série supprimée : l’en-tête « 60 kg × 5 » n’est pas une cible hors des lignes', () => {
    let n = 0;
    const id = () => 'q' + (++n);
    let se = S.ajouterExercice(S.creer({ id: 'S', userId: 'u', idSerie: id }), 'squat', id, { series: 3 });
    const paris = [];
    const entrees = () => ({ seance: { id: 'S', debut: AVANT, edition: false, exercices: se.exercices }, consignes: { squat: C },
      paris: paris.slice(), suites: {} });
    const valider = (i, kg, reps) => {
      se = S.valider(S.modifierSerie(se, 0, i, { charge_kg: kg, reps }), 0, i, new Date(AVANT));
      const q = T.planDeSeance(entrees()).exercices[0].paris[i];
      if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[i].id }));
    };
    valider(0, 70, 5);
    valider(1, 72.5, 5);
    expect(T.planDeSeance(entrees()).exercices[0].lignes.map((l) => l.role)).toEqual(['ligne', 'elan', 'test']);
    const rang = T.planDeSeance(entrees()).exercices[0].lignes[0].rang;
    const sid = se.exercices[0].series[0].id;
    paris.forEach((o) => { if (o.set_observe === sid) o.set_observe = null; });
    se = S.quitterRang(S.retirerSerie(se, 0, 0), 0, rang);
    const e = entrees();
    const p = T.planDeSeance(e);
    expect(p.exercices[0].lignes.map((l) => [l.role, l.charge])).toEqual([['elan', 70], ['test', 100]]);
    expect(p.exercices[0].entete.jaune[0].replace(/ /g, ' ')).toBe('Aujourd\'hui : 60 kg × 5.');
    expect(T.verifierPlan(p, e).erreurs.filter((x) => /cible_hors_lignes/.test(x))).toEqual([]);
  });
});
