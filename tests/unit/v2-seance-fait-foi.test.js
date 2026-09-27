/** @jest-environment node */
//
// 49-C — la séance en cours fait foi (MOTEUR §9.13, §9.11, §9.14 ; delta 49-9).
//
// Une règle par bloc, chacune dans une configuration où les autres sont
// NEUTRES : pas de série validée quand on teste la couverture, pas d'ajout
// quand on teste le gel, pas de proposition quand on teste le rang. Le câblage
// (`app.js`) se vérifie au banc de l'écran de séance, section 7 octovicies.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const Moteur = require('../../v2/js/moteur.js');
const Seance = require('../../v2/js/seance.js');
const Plan = require('../../v2/js/plan.js');

const L = { charge: 125, vise: 5 }, H = { charge: 130, vise: 4, k: 1 };
const consigne = (n, ligne, haut) => ({ etat: 'garde', zone: 'lourd', palier: 125, niveau: 5,
  n: n, ligne: ligne, haut: haut });
const C3 = consigne(3, L, H);

const libre = (id, type) => ({ id: id, type_serie: type || 'travail', charge_kg: null, reps: null,
  rpe: null, ressenti: null, validee_a: null, source: null });
const faite = (id, kg, reps) => ({ id: id, type_serie: 'travail', charge_kg: kg, reps: reps,
  rpe: null, ressenti: null, validee_a: '2026-09-26T10:00:00Z', source: 'app' });
// Un pari tel que le plan le porte et que l'app l'écrit, observé sur sa série.
const pari = (serie, rang, role, charge, vise, extra) => Object.assign({
  id: 'p-' + serie, set_observe: serie, valeur_predite: vise, borne_basse: 3, borne_haute: 5,
  valeur_observee: vise, fondement: Object.assign({ rang: rang, charge: charge, role: role,
    seance: 'S' }, extra || {})
});
const vue = (cov) => cov.map((c) => (c ? c.rang + ':' + c.role + ':' + c.charge_kg + '×' + c.reps : null));

// ── RÈGLE 1 — toutes les séries de travail de la séance, à chaque instant ──
describe('§9.13 (49-C) — la consigne couvre les séries de travail de la séance', () => {
  test('DISCRIMINANT — routine à 4, historique à 3 : la PREMIÈRE série est couverte', () => {
    const cov = Seance.couvertureSeance([libre('a'), libre('b'), libre('c'), libre('d')], C3, {});
    expect(vue(cov)).toEqual(['1:ligne:125×5', '2:ligne:125×5', '3:ligne:125×5', '4:haut:130×4']);
  });

  test('DISCRIMINANT — routine à 2, historique à 3 : ligne puis test, rangs 1 et 2', () => {
    const cov = Seance.couvertureSeance([libre('a'), libre('b')], C3, {});
    expect(vue(cov)).toEqual(['1:ligne:125×5', '2:haut:130×4']);
  });

  test('les chauffes, les dégressives et les échecs ne sont pas couverts', () => {
    const cov = Seance.couvertureSeance([libre('w', 'echauffement'), libre('a'), libre('b'),
      libre('d', 'degressive'), libre('e', 'echec')], C3, {});
    expect(vue(cov)).toEqual([null, '1:ligne:125×5', '2:haut:130×4', null, null]);
    expect(cov[1].position).toBe(0);
  });

  test('sans consigne, ou sans `n` : rien', () => {
    expect(Seance.couvertureSeance([libre('a')], null, {})).toEqual([null]);
    expect(Seance.couvertureSeance([libre('a')], { etat: 'silence' }, {})).toEqual([null]);
  });
});

// ── RÈGLE 3 — parmi les séries non validées, le test sur les k dernières ────
describe('§9.13 (49-C) — le test va sur la dernière série non validée', () => {
  test('DISCRIMINANT — « + Série » avant le test : le test passe sur la nouvelle dernière', () => {
    let se = Seance.creer({ id: 'S', userId: 'u', idSerie: (() => { let i = 0; return () => 's' + (++i); })() });
    se = Seance.ajouterExercice(se, 'x', (() => { let i = 0; return () => 'e' + (++i); })(), { series: 3 });
    const avant = Seance.couvertureSeance(se.exercices[0].series, C3, {});
    const apres = Seance.couvertureSeance(Seance.ajouterSerie(se, 0, 'e4').exercices[0].series, C3, {});
    expect(vue(avant).map((x) => x.split(':')[1])).toEqual(['ligne', 'ligne', 'haut']);
    expect(vue(apres).map((x) => x.split(':')[1])).toEqual(['ligne', 'ligne', 'ligne', 'haut']);
  });

  test('k = 2 : les DEUX dernières non validées', () => {
    const cov = Seance.couvertureSeance([libre('a'), libre('b'), libre('c'), libre('d')],
      consigne(3, L, { charge: 130, vise: 4, k: 2 }), {});
    expect(vue(cov).map((x) => x.split(':')[1])).toEqual(['ligne', 'ligne', 'haut', 'haut']);
  });

  test('une consigne sans ligne (tout passe) ne couvre que ce que le haut peut couvrir', () => {
    const cov = Seance.couvertureSeance([libre('a'), libre('b'), libre('c'), libre('d')],
      consigne(3, null, { charge: 92.5, vise: 12, k: 3 }), {});
    expect(vue(cov)).toEqual([null, '1:haut:92.5×12', '2:haut:92.5×12', '3:haut:92.5×12']);
  });
});

// ── RÈGLE 2 — une série validée est figée, par son pari ─────────────────────
describe('§9.13 (49-C) — une série validée est figée', () => {
  const series = () => [faite('a', 125, 5), faite('b', 125, 5), faite('c', 130, 4), libre('d')];
  const paris = () => [pari('a', 1, 'ligne', 125, 5), pari('b', 2, 'ligne', 125, 5),
    pari('c', 3, 'haut', 130, 4)];

  test('DISCRIMINANT — « + Série » APRÈS le test fait : la série ajoutée reçoit la ligne', () => {
    const f = Seance.figeesDe(paris(), series(), C3);
    const cov = Seance.couvertureSeance(series(), C3, f);
    expect(vue(cov)).toEqual(['1:ligne:125×5', '2:ligne:125×5', '3:haut:130×4', '4:ligne:125×5']);
    expect(cov.map((c) => !!c.figee)).toEqual([true, true, true, false]);
  });

  test('témoin — sans ses paris, la même séance recalcule les rôles : le test sauterait sur la 4ᵉ', () => {
    const cov = Seance.couvertureSeance(series(), C3, {});
    expect(vue(cov)).toEqual(['1:ligne:125×5', '2:ligne:125×5', '3:ligne:125×5', '4:haut:130×4']);
  });

  test('DISCRIMINANT — après un rechargement : les paris relus du disque donnent les mêmes lignes', () => {
    const relus = JSON.parse(JSON.stringify(paris()));
    const serieRelues = JSON.parse(JSON.stringify(series()));
    expect(vue(Seance.couvertureSeance(serieRelues, C3, Seance.figeesDe(relus, serieRelues, C3))))
      .toEqual(vue(Seance.couvertureSeance(series(), C3, Seance.figeesDe(paris(), series(), C3))));
  });

  test('une série dévalidée n’est plus figée : elle reprend un rôle calculé', () => {
    const s = series();
    s[2] = libre('c');
    const f = Seance.figeesDe(paris(), s, C3);
    expect(f.c).toBeUndefined();
    expect(vue(Seance.couvertureSeance(s, C3, f)).map((x) => x.split(':')[1]))
      .toEqual(['ligne', 'ligne', 'ligne', 'haut']);
  });

  test('la ligne du coach se fige avec SES charges et sa fourchette', () => {
    const p = pari('b', 2, 'coach', 127.5, 3, { revision: 1, charges: [127.5, 130], source: 'preconisation' });
    const f = Seance.figeesDe([p], [faite('b', 127.5, 4)], C3);
    expect(f.b).toEqual({ rang: 2, role: 'coach', ligne: { charge: 127.5, vise: 3, zone: [3, 5],
      source: 'coach', charges: [127.5, 130], sourceHaut: 'preconisation' } });
  });

  test('un pari d’avant 49-C (sans rôle) se relit par la règle qui l’a écrit', () => {
    const vieux = (s, r, kg, v) => ({ set_observe: s, valeur_predite: v, borne_basse: 3, borne_haute: 5,
      fondement: { rang: r, charge: kg } });
    const f = Seance.figeesDe([vieux('a', 2, 125, 5), vieux('b', 3, 130, 4)],
      [faite('a', 125, 5), faite('b', 130, 4)], C3);
    expect([f.a.role, f.b.role]).toEqual(['ligne', 'haut']);
  });

  test('plusieurs paris sur une série : la plus haute révision dit ce que la ligne affichait', () => {
    const f = Seance.figeesDe([pari('b', 2, 'ligne', 125, 5),
      Object.assign(pari('b', 2, 'coach', 127.5, 3, { revision: 1 }), { id: 'p-b-1' })],
      [faite('b', 127.5, 4)], C3);
    expect(f.b.role).toBe('coach');
  });
});

// ── LE RANG — jamais celui d'une série figée ────────────────────────────────
describe('§9.11 (49-C) — le rang d’une série non figée ne prend jamais un rang figé', () => {
  test('DISCRIMINANT — une série faite supprimée plus haut : la suivante ne reprend pas son rang', () => {
    // a (rang 1) supprimée ; b garde le rang 2, figé ; c et d, libres, ne
    // peuvent pas prendre 2 : c = 3, d = 4.
    const s = [faite('b', 125, 5), libre('c'), libre('d')];
    const cov = Seance.couvertureSeance(s, C3, Seance.figeesDe([pari('b', 2, 'ligne', 125, 5)], s, C3));
    expect(cov.map((c) => c.rang)).toEqual([2, 3, 4]);
  });

  test('retirer une série NON validée ne touche à rien de ce qui est fait', () => {
    const s = [faite('a', 125, 5), libre('b'), libre('c')];
    const f = Seance.figeesDe([pari('a', 1, 'ligne', 125, 5)], s, C3);
    const avant = Seance.couvertureSeance(s, C3, f)[0];
    const apres = Seance.couvertureSeance([s[0], s[2]], C3, f)[0];
    expect(apres).toEqual(avant);
  });
});

// ── RÈGLES 4 et 6 — la réaction suit la séance ──────────────────────────────
describe('§9.14 (49-C) — la réaction suit la couverture de la séance', () => {
  const ctx = { cran: 127.5, haut: null };
  const s = (kg, reps) => ({ charge_kg: kg, reps: reps, rpe: null, ressenti: null });
  const planDe = (series, f) => Moteur.planDeCouverture(C3, Seance.couvertureSeance(series, C3, f || {}));

  test('DISCRIMINANT — routine à 4, historique à 3 : 125 × 8 sur la PREMIÈRE série propose sur la 2ᵉ', () => {
    const plan0 = planDe([libre('a'), libre('b'), libre('c'), libre('d')]);
    const r = Moteur.reactionPour(C3, [s(125, 8)], ctx, plan0);
    expect(r.message).toMatchObject({ type: 'propose', rang: 1, charges: [127.5], marge: 3 });
    expect(r.plan[1]).toMatchObject({ charge: 127.5, source: 'coach' });
  });

  test('DISCRIMINANT — moins de séries que la consigne : plus de silence (#318 retiré)', () => {
    // Routine à 2 : la ligne, puis le test. 49-U1 (§9.14, 26/09/2026) : la
    // série 2 est un test, la réaction ne propose plus de charge — elle parle
    // (avant 49-U1 : `propose`, qui remplaçait le test). Le silence de #318,
    // lui, reste retiré : il y a bien un message.
    const plan0 = planDe([libre('a'), libre('b')]);
    const r = Moteur.reactionPour(C3, [s(125, 8)], ctx, plan0);
    expect(r.message).toMatchObject({ type: 'test_suit', rang: 1 });
    expect(r.plan[1]).toMatchObject({ source: 'consigne', charge: 130 });
  });

  test('DISCRIMINANT — une série plus légère en travail n’est PAS un refus : la suivante propose encore', () => {
    const plan0 = planDe([libre('a'), libre('b'), libre('c'), libre('d')]);
    const r = Moteur.reactionPour(C3, [s(100, 8), s(125, 8)], ctx, plan0);
    expect(r.message).toMatchObject({ type: 'propose', rang: 2 });
    // Et son pari — lu dans le plan (49-U3) — dit « autre chose tenté » :
    // reliée, rien de compté.
    const q = Plan.planDesLignes([faite('a', 100, 8), libre('b'), libre('c'), libre('d')], C3, ctx, {},
      { slug: 'x', seance: 'S' }).paris[0];
    expect(Moteur.observationDe(q.fondement, { enBase: true, id: 'a', charge: 100, reps: 8 }))
      .toEqual({ set_observe: 'a', valeur_observee: null });
  });

  test('sans plan de séance, `reactionPour` reste celle du fichier de cas (n de la consigne)', () => {
    const r = Moteur.reactionPour(C3, [], ctx);
    expect(r.plan).toHaveLength(3);
  });

  test('DISCRIMINANT — une ligne figée n’est jamais réécrite par une montée tenue', () => {
    // En Hypertrophie (en Lourd, la montée ne se propage pas, §9.7). a 50 × 12
    // → proposition sur b (52,5) ; b faite à 52,5 × 9, la montée tient. c,
    // déjà faite comme test à 55, reste le test ; d, libre, passe au coach.
    // Sans le gel, c serait réécrite en ligne du coach à 52,5.
    const CH = { etat: 'progression', zone: 'hypertrophie', palier: 50, niveau: 9, n: 3,
      ligne: { charge: 50, vise: 9 }, haut: { charge: 55, vise: 8, k: 1 } };
    const series = [faite('a', 50, 12), faite('b', 52.5, 9), faite('c', 55, 8), libre('d')];
    const f = Seance.figeesDe([pari('a', 1, 'ligne', 50, 9),
      pari('b', 2, 'coach', 52.5, 8, { revision: 1, charges: [52.5] }),
      pari('c', 3, 'haut', 55, 8)], series, CH);
    const plan0 = Moteur.planDeCouverture(CH, Seance.couvertureSeance(series, CH, f));
    const r = Moteur.reactionPour(CH, [s(50, 12), s(52.5, 9), s(55, 8)], { cran: 52.5, haut: null }, plan0);
    expect(r.plan.map((p) => p.source + ':' + p.charge)).toEqual(
      ['consigne:50', 'coach:52.5', 'consigne:55', 'coach:52.5']);
  });

  test('DISCRIMINANT — une proposition qui n’a pas eu lieu n’est pas inventée au rejeu', () => {
    // b a été faite comme ligne de la consigne ; a corrigée APRÈS à 125 × 8 :
    // le rejeu ne propose pas sur b, déjà faite.
    const series = [faite('a', 125, 8), faite('b', 125, 5), libre('c')];
    const f = Seance.figeesDe([pari('a', 1, 'ligne', 125, 5), pari('b', 2, 'ligne', 125, 5)], series, C3);
    const r = Moteur.reactionPour(C3, [s(125, 8), s(125, 5)], ctx, planDe(series, f));
    expect(r.revision).toBe(0);
    expect(r.plan[1].source).toBe('consigne');
  });
});

// ── RÈGLE 5 — un pari par série, à sa validation ────────────────────────────
describe('§9.11 (49-C) — le pari d’une série, avec ce que sa ligne affichait', () => {
  const ctx = { cran: 127.5, haut: null };
  const s = (kg, reps) => ({ charge_kg: kg, reps: reps, rpe: null, ressenti: null });
  const o = (rang, role) => ({ slug: 'x', reglage: 'normal', seance: 'S', rang: rang, role: role });
  const plan0 = () => Moteur.planDeCouverture(C3,
    Seance.couvertureSeance([libre('a'), libre('b'), libre('c')], C3, {}));

  // ⚠️ 49-U3 — LE PARI SE LIT DANS LE PLAN (`paris[iSerie]`), tel qu'il
  // s'écrira à la validation de la série : `lignesDePari` ne relance plus la
  // réaction, c'est le plan qui la calcule sur les séries qui PRÉCÈDENT. Les
  // attendus sont inchangés ; seul le chemin l'est.
  const parisDu = (series) => Plan.planDesLignes(series, C3, ctx, {},
    { slug: 'x', reglage: 'normal', seance: 'S' }).paris;

  test('la ligne de la consigne : révision 0, sa charge, sa visée, son rôle', () => {
    const p = parisDu([faite('a', 125, 5), libre('b'), libre('c')])[0];
    expect(p).toMatchObject({ grandeur: 'reps', valeur_predite: 5, borne_basse: 3, borne_haute: 5,
      fondement: { rang: 1, charge: 125, role: 'ligne', seance: 'S', etat: 'garde' } });
    expect(p.fondement.revision).toBeUndefined();
  });

  test('le test : rôle `haut`, sa charge et sa visée', () => {
    const p = parisDu([faite('a', 125, 5), faite('b', 125, 5), libre('c')])[2];
    expect(p).toMatchObject({ valeur_predite: 4, fondement: { rang: 3, charge: 130, role: 'haut' } });
  });

  test('la proposition du coach : UN pari, de révision 1, rôle `coach`', () => {
    const p = parisDu([faite('a', 125, 8), libre('b'), libre('c')])[1];
    expect(p.fondement).toMatchObject({ rang: 2, revision: 1, role: 'coach', charge: 127.5,
      charges: [127.5], declencheur: { rang: 1, marge: 3 } });
  });

  // La mise en forme du pari, seule : `lignesDePari` reçoit la réaction (celle
  // que le plan calcule) et ne la relance pas.
  test('le déclencheur porte SON rang, pas sa position', () => {
    const avant = Moteur.reactionPour(C3, [s(125, 8)], ctx, plan0());
    const p = Moteur.lignesDePari(C3, avant, [s(125, 8)], 1,
      Object.assign(o(5, 'ligne'), { rangs: [4, 5, 6] }));
    expect(p[0].fondement.declencheur.rang).toBe(4);
  });

  test('en silence, ou sans réaction, rien', () => {
    expect(Moteur.lignesDePari({ etat: 'silence', raison: 'premiere_fois' }, { plan: [] }, [], 0, o(1))).toEqual([]);
    expect(Moteur.lignesDePari(C3, null, [], 0, o(1, 'ligne'))).toEqual([]);
  });
});

// ── RÈGLE 7 — le nombre de séries proposé au départ, hors routine ───────────
describe('§9.13 (49-C) — le pré-remplissage hors routine', () => {
  const prec = (types) => ({ series: types.map((t) => ({ type_serie: t })) });

  test('l’habitude d’abord : `n`', () => {
    expect(Seance.seriesDeDepart(4, prec(['travail', 'travail']), 'progresser')).toBe(4);
  });

  test('DISCRIMINANT — sans consigne, les séries de travail de la dernière séance (chauffes exclues)', () => {
    expect(Seance.seriesDeDepart(null, prec(['echauffement', 'travail', 'travail', 'travail', 'travail']),
      'entretien')).toBe(4);
  });

  test('sans historique, l’intention : 3 en Progresser, 2 en Entretenir', () => {
    expect(Seance.seriesDeDepart(null, null, 'progresser')).toBe(3);
    expect(Seance.seriesDeDepart(null, null, null)).toBe(3);
    expect(Seance.seriesDeDepart(null, null, 'entretien')).toBe(2);
    expect([Seance.SERIES_DEPART_PROGRESSER, Seance.SERIES_DEPART_ENTRETIEN]).toEqual([3, 2]);
  });

  test('`ajouterExercice` et `insererExercice` posent ce nombre de séries de travail, identifiants distincts', () => {
    let i = 0;
    const id = () => 'id-' + (++i);
    let se = Seance.creer({ id: 'S', userId: 'u', idSerie: id });
    se = Seance.ajouterExercice(se, 'x', id, { series: 3 });
    se = Seance.insererExercice(se, 0, 'y', id, { series: 2 });
    expect(se.exercices.map((e) => e.series.length)).toEqual([2, 3]);
    const ids = se.exercices.flatMap((e) => e.series.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(se.exercices[1].series.every((s) => s.type_serie === 'travail' && s.charge_kg === null)).toBe(true);
  });

  test('sans nombre, ou avec un identifiant chaîne : une seule série, comme avant', () => {
    let se = Seance.creer({ id: 'S', userId: 'u', idSerie: () => 'z' });
    expect(Seance.ajouterExercice(se, 'x', 'unique', { series: 3 }).exercices[0].series).toHaveLength(1);
    expect(Seance.ajouterExercice(se, 'x', () => 'q').exercices[0].series).toHaveLength(1);
  });
});
