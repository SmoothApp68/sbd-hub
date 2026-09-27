//
// 49-R2 — la réaction série par série, BRANCHÉE (MOTEUR §9.14, §9.11 ;
// ECRAN-SAISIE §3.2, §7 septendecies.3).
//
// Ce fichier teste les pièces PURES du branchement : le contexte calculé une
// fois par séance et par exercice, la révision de chaque ligne (delta 49-4),
// le pari d'une révision, l'observation de chacun des paris d'un rang, et le
// plan que lit le fantôme. Le câblage lui-même (`app.js`) ne s'exécute que
// dans le banc d'écran, section 7 sexvicies.
//
// Environnement jsdom (pas de docblock `node`), comme `v2-moteur-parle`.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const Moteur = window.THMoteur;
const Seance = require('../../v2/js/seance.js');
const Plan = require('../../v2/js/plan.js');

let n = 0;
const uuid = () => 'id-' + (++n);
beforeEach(() => { n = 0; });

const brute = (kg, reps, type, rpe) => ({
  id: uuid(), rang: n, charge_kg: kg, reps: reps, rpe: rpe === undefined ? null : rpe,
  ressenti: null, type_serie: type || 'travail', exercise_slug: 'dc'
});
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('09-20');
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser',
                  reglage: 'normal', edition: false };

// Le couché : une montée régulière de 115 à 125, puis 125 × 5, 125 × 5, test 130 × 3.
function couche() {
  return [
    { seance: { id: 'S5', debut: jour('09-13') },
      series: [brute(100, 5, 'echauffement'), brute(125, 5), brute(125, 5), brute(130, 3)] },
    { seance: { id: 'S4', debut: jour('08-09') }, series: [brute(122.5, 5), brute(122.5, 5), brute(122.5, 5)] },
    { seance: { id: 'S3', debut: jour('08-02') }, series: [brute(120, 5), brute(120, 5), brute(120, 5)] },
    { seance: { id: 'S2', debut: jour('07-26') }, series: [brute(117.5, 5), brute(117.5, 5), brute(117.5, 5)] },
    { seance: { id: 'S1', debut: jour('07-19') }, series: [brute(115, 5), brute(115, 5), brute(115, 5)] }
  ];
}

// ── LE CONTEXTE ─────────────────────────────────────────────────────────────
describe('§9.14 — le contexte de la réaction, une fois par séance et par exercice', () => {
  test('consigneDExercice le rend avec la consigne : le cran, et la seconde charge', () => {
    const c = Moteur.consigneDExercice(couche(), undefined, AVANT, OPTIONS);
    expect(c.consigne.ligne.charge).toBe(125);
    // Le pas de la salle est 2,5 : le cran au-dessus de 125 est 127,5, le
    // suivant 130 — sous 10 % du palier, donc la préconisation (une seule
    // montée antérieure : pas d'habitude).
    expect(c.contexte).toEqual({ cran: 127.5, haut: { charge: 130, source: 'preconisation' } });
  });

  test('DISCRIMINANT — une séance POSTÉRIEURE à la coupure n’entre pas (§9.12)', () => {
    // Une séance datée après « avant », avec une charge de 126 : lue, elle
    // ferait du cran 126. Elle doit être ignorée.
    const apres = { seance: { id: 'S6', debut: jour('09-25') },
      series: [brute(125, 5), brute(126, 5), brute(126, 5)] };
    const c = Moteur.consigneDExercice(couche().concat([apres]), undefined, AVANT, OPTIONS);
    expect(c.contexte.cran).toBe(127.5);
  });

  test('DISCRIMINANT — la base est la charge de la LIGNE, pas le palier de la consigne', () => {
    // État `attend` : la ligne est l'ancien palier (60), le palier vaut 65.
    const seances = [{ debut: jour('09-01'), palier: 60, series: [
      { charge_kg: 60, reps: 10, role: 'palier' }, { charge_kg: 62.5, reps: 8, role: 'exploration' },
      { charge_kg: 65, reps: 7, role: 'exploration' }] }];
    const consigne = { etat: 'attend', zone: 'mix', palier: 65, n: 2,
      ligne: { charge: 60, vise: 10 }, haut: { charge: 65, vise: 6, k: 1 } };
    const ctx = Moteur.contexteReaction(seances, AVANT, consigne, null, null);
    expect(ctx.cran).toBe(62.5);
  });

  test('sans ligne, ou sans consigne : rien à proposer', () => {
    expect(Moteur.contexteReaction([], AVANT, null, null, null)).toEqual({ cran: null, haut: null });
    expect(Moteur.contexteReaction([], AVANT, { etat: 'tout_passe', ligne: null }, null, null))
      .toEqual({ cran: null, haut: null });
  });
});

// ── LA RÉVISION DE CHAQUE LIGNE (delta 49-4) ────────────────────────────────
describe('§9.11 — la révision de chaque ligne, lue sur le plan seul', () => {
  const L = (source) => ({ charge: 50, vise: 9, zone: null, source: source });
  test('DISCRIMINANT — la première ligne du coach : 1 ; les suivantes : 2 ; le reste : 0', () => {
    expect(Moteur.revisionsDuPlan([L('consigne'), L('coach'), L('coach'), L('coach')]))
      .toEqual([0, 1, 2, 2]);
    expect(Moteur.revisionsDuPlan([L('consigne'), L('coach'), L('retour')])).toEqual([0, 1, 0]);
    expect(Moteur.revisionsDuPlan([L('consigne'), L('consigne')])).toEqual([0, 0]);
    expect(Moteur.revisionsDuPlan([])).toEqual([]);
  });
});

// ── LE PARI D'UNE RÉVISION ──────────────────────────────────────────────────
describe('§9.11 — le pari d’une révision, écrit à la validation de SA série', () => {
  // R003 : 50 × 12 (3 de plus que visé) → 52,5 proposé ; 52,5 × 9 tient.
  const consigne = { etat: 'progression', zone: 'hypertrophie', palier: 50, niveau: 9, n: 3,
    ligne: { charge: 50, vise: 9 }, haut: null };
  const ctx = { cran: 52.5, haut: { charge: 55, source: 'preconisation' } };
  const opts = { slug: 'dc', reglage: 'normal', seance: 'S-1' };
  const s = (charge, reps, rpe) => ({ charge_kg: charge, reps: reps, rpe: rpe || null, ressenti: null });

  // ⚠️ 49-U3 — LE PARI SE LIT DANS LE PLAN. Ces tests appelaient
  // `lignesDeRevision`, qui relançait la réaction de son côté ; elle n'existe
  // plus. Ils rejouent désormais les validations une à une, comme l'app :
  // à chaque validation, le pari que le plan porte pour la série (`paris`),
  // observé sur elle, qui fige sa ligne pour la suite. Les attendus sont
  // INCHANGÉS.
  const Plan = require('../../v2/js/plan.js');
  const parisEcrits = (faites) => {
    const n = Math.max(consigne.n, faites.length);
    const vus = faites.map((f) => ({ charge: f.charge_kg, reps: f.reps, rpe: f.rpe }));
    const paris = [], parSerie = [];
    let figees = {};
    for (let t = 0; t < vus.length; t++) {
      const apres = Plan.rejouer(consigne, ctx, n, vus.slice(0, t + 1), figees, opts);
      const q = apres.paris[t];
      parSerie.push(q ? [q] : []);
      if (q) paris.push(Object.assign({}, q, { set_observe: 'r' + (t + 1) }));
      const g = Seance.figeesDe(paris, apres.series, consigne);
      figees = {};
      Object.keys(g).forEach((k) => { figees[Number(k.slice(1)) - 1] = g[k]; });
    }
    return parSerie;
  };
  // Le pari de révision (≥ 1) écrit à la validation de la série `j` — rien
  // tant qu'elle n'est pas validée (`noterPari` n'écrit que pour une série
  // faite).
  const revision = (faites, j) => (j >= faites.length ? []
    : parisEcrits(faites)[j].filter((l) => l.fondement.revision >= 1));

  test('la série proposée, validée : UNE ligne de révision 1, avec la séance dans le fondement', () => {
    const l = revision([s(50, 12), s(52.5, 9)], 1);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ module: 'moteur.consigne', exercise_slug: 'dc', grandeur: 'reps',
      valeur_predite: 8, borne_basse: 8, borne_haute: 10 });
    expect(l[0].fondement).toMatchObject({ rang: 2, charge: 52.5, revision: 1, seance: 'S-1',
      zone: 'hypertrophie', palier: 50, niveau: 9, reglage: 'normal', etat: 'progression',
      charges: [52.5], source: null,
      declencheur: { rang: 1, charge: 50, reps: 12, comptees: 12, marge: 3 } });
  });

  test('à 5 reps de marge, les DEUX charges et la source de la seconde', () => {
    const l = revision([s(50, 14), s(55, 8)], 1);
    expect(l[0].fondement).toMatchObject({ charges: [52.5, 55], source: 'preconisation', revision: 1 });
  });

  test('la montée tenue : la série suivante porte la révision 2', () => {
    const l = revision([s(50, 12), s(52.5, 9), s(52.5, 8)], 2);
    expect(l).toHaveLength(1);
    expect(l[0].fondement).toMatchObject({ rang: 3, revision: 2, charge: 52.5,
      declencheur: { rang: 2, charge: 52.5, reps: 9, comptees: 9, marge: 1 } });
  });

  test('DISCRIMINANT — PAS AVANT sa validation : la série proposée non faite n’écrit rien', () => {
    // La proposition est affichée (la série 1 est validée), mais la série 2
    // ne l'est pas : aucun pari n'est encore un fait à écrire.
    expect(revision([s(50, 12)], 1)).toEqual([]);
    // Témoin : le plan porte bien la proposition, et le pari qu'elle écrira.
    const plan = Plan.rejouer(consigne, ctx, 3, [{ charge: 50, reps: 12 }], {}, opts);
    expect(plan.lignes[1].role).toBe('coach');
    expect(plan.paris[1].fondement.revision).toBe(1);
  });

  test('DISCRIMINANT — 8 reps puis « à fond » : la proposition disparaît, aucun pari', () => {
    // La même série à RPE 10 compte une rep de moins : 11, 2 de plus que visé.
    expect(Moteur.reactionPour(consigne, [s(50, 12, 10)], ctx).message).toBeNull();
    expect(revision([s(50, 12, 10), s(52.5, 9)], 1)).toEqual([]);
  });

  test('une ligne de la consigne, ou un retour au palier, n’écrit rien de neuf', () => {
    expect(revision([s(50, 9), s(50, 9)], 1)).toEqual([]);
    // Montée ratée : la ligne 3 revient au palier, son pari est celui de l'ouverture.
    expect(revision([s(50, 12), s(52.5, 6), s(50, 9)], 2)).toEqual([]);
  });

  test('le refus : la ligne proposée validée plus bas reste un pari de révision 1 — « autre chose tenté »', () => {
    const l = revision([s(50, 12), s(50, 11)], 1);
    expect(l).toHaveLength(1);
    expect(Moteur.observationDe(l[0].fondement,
      { enBase: true, id: 'x', charge: 50, reps: 11 })).toEqual({ set_observe: 'x', valeur_observee: null });
  });
});

// ── L'OBSERVATION, PARI PAR PARI ────────────────────────────────────────────
describe('§9.11 (P7) — chacun des paris d’un rang se juge sur SES charges', () => {
  const rev0 = { rang: 2, charge: 50, palier: 50 };
  const rev1 = { rang: 2, charge: 52.5, charges: [52.5, 55], palier: 50, revision: 1 };
  const fait = (charge) => ({ enBase: true, id: 'set-2', charge: charge, reps: 8 });

  test('DISCRIMINANT — deux paris sur un rang, la série à 55 : seul celui du coach compte', () => {
    expect(Moteur.observationDe(rev1, fait(55))).toEqual({ set_observe: 'set-2', valeur_observee: 8 });
    expect(Moteur.observationDe(rev0, fait(55))).toEqual({ set_observe: 'set-2', valeur_observee: null });
  });

  test('la même série faite au palier : seul le pari de l’ouverture compte', () => {
    expect(Moteur.observationDe(rev0, fait(50))).toEqual({ set_observe: 'set-2', valeur_observee: 8 });
    expect(Moteur.observationDe(rev1, fait(50))).toEqual({ set_observe: 'set-2', valeur_observee: null });
  });

  test('la charge basse de la proposition compte aussi, et le cran sans chiffre accepte tout au-dessus', () => {
    expect(Moteur.observationDe(rev1, fait(52.5)).valeur_observee).toBe(8);
    const sansChiffre = { rang: 2, charge: null, charges: [null], palier: 50, revision: 1 };
    expect(Moteur.observationDe(sansChiffre, fait(51)).valeur_observee).toBe(8);
    expect(Moteur.observationDe(sansChiffre, fait(50)).valeur_observee).toBeNull();
  });
});

// ── LE PLAN ET LE FANTÔME DE LA LIGNE PROPOSÉE ──────────────────────────────
describe('ECRAN §3.2 — la ligne proposée : sa charge, et des reps à taper', () => {
  function ouverte(k) {
    let se = Seance.creer({ id: 'S', userId: 'u', idSerie: uuid });
    se = Seance.ajouterExercice(se, 'dc', uuid);
    for (let i = 1; i < k; i++) se = Seance.ajouterSerie(se, 0, uuid);
    return se;
  }
  const consigne = { etat: 'progression', zone: 'hypertrophie', palier: 50, n: 3,
    ligne: { charge: 50, vise: 9 }, haut: null };
  const plan = [{ charge: 50, vise: 9, zone: null, source: 'consigne' },
                { charge: 52.5, vise: 8, zone: [8, 10], source: 'coach' },
                { charge: 50, vise: 9, zone: null, source: 'consigne' }];
  // La fois d'avant : 50 × 9 partout, et la routine vise 10 — deux replis que
  // la ligne proposée ne doit PAS prendre.
  const prec = { seance: { id: 'p1' }, series: [
    { charge_kg: 50, reps: 9, type_serie: 'travail' }, { charge_kg: 50, reps: 9, type_serie: 'travail' },
    { charge_kg: 50, reps: 9, type_serie: 'travail' }] };

  test('le plan lit la réaction : la ligne du coach porte sa charge, PAS de reps, et la fourchette', () => {
    const se = ouverte(3);
    const p = Seance.planDe(se.exercices[0].series, consigne, plan);
    expect(p[0]).toEqual({ charge_kg: 50, reps: 9 });
    expect(p[1]).toEqual({ charge_kg: 52.5, reps: null, proposee: true, fourchette: [8, 10], palier: 50 });
  });

  // ⚠️ 49-U2 — LE FANTÔME D'UNE LIGNE COUVERTE VIENT DU PLAN (§9.13 bis), plus
  // de `Seance.fantome`. Ces trois tests passaient par la cascade avec un plan
  // posé à la main et des charges TAPÉES ; ils passent désormais par le plan,
  // avec des séries VALIDÉES — seule une série faite décide (« c'est la
  // dernière série validée qui décide »). La réaction propose 52,5 sur la
  // série 2 après 50 × 12, comme le plan d'avant le posait à la main.
  const contexte = { cran: 52.5, haut: { charge: 55, source: 'preconisation' } };
  const fantomes = (se) => Plan.planDesLignes(se.exercices[0].series, consigne, contexte, {})
    .lignes.map((l) => l.fantome);
  const faire = (se, i, kg, reps) => Seance.valider(Seance.modifierSerie(se, 0, i, { charge_kg: kg, reps: reps }),
    0, i, new Date('2026-09-26T10:0' + i + ':00Z'));

  test('DISCRIMINANT — le fantôme de ses reps reste VIDE : ni la fois d’avant, ni la routine', () => {
    let se = ouverte(3);
    se = Seance.modifierSerie(se, 0, 1, { reps_visees: 10 });
    se = faire(se, 0, 50, 12);
    const f = fantomes(se);
    expect(f[1]).toEqual({ charge: 52.5, reps: null, source: 'plan' });
    // Témoin : la ligne d'après, de la consigne, garde son fantôme de reps.
    expect(f[2]).toEqual({ charge: 50, reps: 9, source: 'plan' });
  });

  test('P10 — une charge ÉGALE OU SUPÉRIEURE à la proposée est une acceptation : elle ne se propage pas', () => {
    let se = ouverte(3);
    se = faire(se, 0, 50, 12);
    se = faire(se, 1, 55, 8);
    // La ligne 3 garde ce que le PLAN lui donne — ici la réaction, qui propose
    // 55 après une proposition acceptée —, jamais la série faite recopiée
    // (55 × 8). Avant 49-U2, les charges étaient tapées sans être validées :
    // la réaction ne réagissait pas, et la ligne restait à 50.
    const lignes = Plan.planDesLignes(se.exercices[0].series, consigne, contexte, {}).lignes;
    expect(fantomes(se)[2].source).toBe('plan');
    expect(fantomes(se)[2].charge).toBe(lignes[2].charge);
    expect(fantomes(se)[2]).not.toEqual({ charge: 55, reps: 8, source: 'derniere' });
  });

  test('P3 — une charge INFÉRIEURE est un refus : la ligne suivante recopie la série faite, charge ET reps', () => {
    let se = ouverte(3);
    se = faire(se, 0, 50, 12);
    se = faire(se, 1, 47.5, 11);
    // Avant 49-U2 : 47,5 et les reps du plan (9) — deux sources sur une ligne.
    expect(fantomes(se)[2]).toEqual({ charge: 47.5, reps: 11, source: 'derniere' });
  });
});
