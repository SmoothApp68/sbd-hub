/** @jest-environment node */
//
// R1 (20/11/2026, MOTEUR §9.39 (6), §9.28, §9.42 bis) — LE RECUL RATÉ. Un recul répondu « Oui, manquée » GARDE son type : une seule lecture du zéro en séance l'admet
// (Z2, une phrase seule : jamais « Prendre », fourchette ni « garde ») ; le plafond entre les séances l'exclut ; il sort de la stagnation, du volume ; l'écart des reculs lit
// le 0 (« Je les éloigne »), sauf (a) un recul réussi à cette charge ou plus lourd, (b) « J'ai eu mal », (c) la grosse série ratée sans recalage (cas G).
// Sources de la décision : tour de table et contradicteur à froid du 20/11/2026 (claude/RECUL-RATE-2026-11-20.md).

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Modele = global.THModele;
const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');

const g = (kg, reps, extra) => Object.assign({ charge_kg: kg, reps, type_serie: 'travail' }, extra || {});
const r = (kg, reps, extra) => g(kg, reps, Object.assign({ type_serie: 'recul' }, extra || {}));

describe('R1 — le type et les prédicats', () => {
  test('un recul « Oui, manquée » garde son type ; un travail passe à echec', () => {
    let se = S.creer({ id: 'S', userId: 'u', idSerie: (() => { let k = 0; return () => 'i' + (++k); })() });
    se = S.ajouterExercice(se, 'sq', (() => { let k = 100; return () => 'j' + (++k); })(), { series: 2 });
    se = S.modifierSerie(se, 0, 0, { charge_kg: 125, reps: 0 });
    se = S.changerType(se, 0, 0, 'recul');
    expect(S.marquerManquee(se, 0, 0).exercices[0].series[0].type_serie).toBe('recul');
    se = S.modifierSerie(se, 0, 1, { charge_kg: 140, reps: 0 });
    expect(S.marquerManquee(se, 0, 1).exercices[0].series[1].type_serie).toBe('echec');
  });
  test('un recul à 0 rep : hors volume (estEssaiRate), jamais une série de travail ; avec des reps, il reste du travail', () => {
    expect(Modele.estEssaiRate(r(125, 0))).toBe(true);
    expect(Modele.estTravail(r(125, 0))).toBe(false);
    expect(Modele.estTravailOuEssai(r(125, 0))).toBe(true);   // la question « 0 rep : tu l'as manquée ? » le lit encore
    expect(Modele.estTravail(r(125, 5))).toBe(true);
    expect(Modele.estEssaiRate(g(125, 0, { type_serie: 'test' }))).toBe(true);   // #729 inchangé
    expect(Modele.estEssaiRate(g(125, 0))).toBe(false);
  });
  test('le journal dit « recul · manquée » à 0 rep, « recul » sinon', () => {
    expect(Modele.motDEchec(r(125, 0))).toBe('recul · manquée');
    expect(Modele.motDEchec(r(125, 5))).toBe('recul');
  });
  test('estZeroDeTravail admet le recul ; zeroPartiel (le plafond) l\'exclut toujours', () => {
    expect(Modele.estZeroDeTravail(r(125, 0))).toBe(true);
    expect(Modele.zeroPartiel([g(140, 3), r(125, 0)], { porte: true })).toBeNull();
    expect(Modele.zeroPartiel([g(140, 3), r(125, 0)], { porte: false })).toBeNull();
    expect(Modele.zeroPartiel([g(100, 3), g(140, 0, { type_serie: 'echec' }), r(125, 0)], { porte: true })).toEqual({ charge: 140, n: 1 });
  });
});

describe('R1 — Moteur.reactionAuZero : un recul est toujours Z2', () => {
  const base = { muet: false, charge: 125, descente: 115, restantes: [125, 125] };
  test('recul, des lignes plus lourdes que la descente : Z2, aucun bouton', () => {
    const d = M.reactionAuZero(Object.assign({ role: 'recul' }, base));
    expect(d).toMatchObject({ cas: 'Z2', role: 'recul', charge: null, leviers: [] });
    expect(sp(M.phraseDeRate(d))).toBe('125 kg est resté à 0 rep.');
  });
  test('un travail dans le même cas reste Z1 (inchangé)', () => {
    expect(M.reactionAuZero(Object.assign({ role: 'travail' }, base)).cas).toBe('Z1');
  });
});

function seanceAReculs(fait, nbReculs) {
  let k = 0;
  const id = () => 'x-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  se = S.ajouterExercice(se, 'sq', id, { series: 1 + nbReculs });
  se.exercices[0].series.forEach((s, i) => { s.reps_visees = 6; if (i > 0) s.type_serie = 'recul'; });
  fait.forEach(([kg, reps, extra], i) => Object.assign(se.exercices[0].series[i], { charge_kg: kg, reps, validee_a: '2026-11-20T10:0' + i + ':00.000Z' }, extra || {}));
  const e = {
    seance: { id: 'S', debut: '2026-11-20T10:00:00Z', edition: false, exercices: se.exercices },
    consignes: { sq: { consigne: { etat: 'progression', zone: 'lourd', palier: 140, n: 3, niveau: 3, ligne: { charge: 140, vise: 4 }, haut: null }, contexte: { cran: 142.5, haut: null } } },
    reglage: 'normal', paris: [], catalogue: { sq: { equipement: 'barre', mesure: 'charge_reps', pas: 2.5 } }
  };
  const p = T.planDeSeance(e);
  return { p, e, x: p.exercices[0], erreurs: T.verifierPlan(p, e).erreurs };
}

describe('R1 — en séance : une seule voix, une phrase seule', () => {
  test('140 × 3 puis 125 × 0 (« Oui, manquée ») : « 125 kg est resté à 0 rep. », aucun bouton, aucune fourchette ; le type est gardé', () => {
    const t = seanceAReculs([[140, 3], [125, 0, { type_serie: 'recul' }]], 2);
    expect(t.x.rate).toMatchObject({ cas: 'Z2', niveau: 'zero', iSerie: 1, role: 'recul', fourchette: null, garde: null });
    expect(t.x.rate.boutons).toEqual([]);
    expect(sp(t.x.rate.phrase)).toBe('125 kg est resté à 0 rep.');
    expect(t.x.zeros.map((z) => [z.iSerie, z.cas, z.proposition])).toEqual([[1, 'Z2', false]]);
    expect(t.erreurs).toEqual([]);
  });
  test('I237 étendu : un recul qui dirait Z1 est refusé ; une fourchette sous un 0 aussi (I236)', () => {
    const t = seanceAReculs([[140, 3], [125, 0, { type_serie: 'recul' }]], 2);
    const f = JSON.parse(JSON.stringify(t.p));
    f.exercices[0].zeros[0].cas = 'Z1'; f.exercices[0].zeros[0].proposition = true;
    expect(T.verifierPlan(f, t.e).erreurs.join('|')).toMatch(/I237.*recul à 0 rep.*dit Z1/);
  });
  test('la grosse série à 0 garde sa réaction (inchangée : aucune ligne plus lourde qui reste, Z2) ; le recul à 0 qui suit, Z2 aussi', () => {
    const t = seanceAReculs([[140, 0, { type_serie: 'echec' }]], 2);
    expect(t.x.rate).toMatchObject({ cas: 'Z2', zero: 140 });
    const u = seanceAReculs([[140, 0, { type_serie: 'echec' }], [125, 0, { type_serie: 'recul' }]], 2);
    expect(u.x.rate).toMatchObject({ cas: 'Z2', role: 'recul', boutons: [] });
    expect(u.erreurs).toEqual([]);
  });
});

// ── l'histoire : squat, 12 et 16 nov. 140 × 3 + reculs 125 × 6, 6 ─────────────────────────────────────────────────
const jourH = (i) => new Date(Date.UTC(2026, 10, 12 + i * 4, 18)).toISOString();
const seanceH = (i, series) => ({ seance: { id: 'H' + i, debut: jourH(i) }, series: series.map((s, j) => Object.assign({ id: 'h' + i + j, rang: j, rpe: null, ressenti: null, exercise_slug: 'squat' }, s)) });
const bonne = () => [g(140, 3), r(125, 6), r(125, 6)];
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
const consigne = (liste, jours) => M.consigneDExercice(liste.map((s, i) => seanceH(i, s)), undefined, new Date(Date.parse(jourH(liste.length - 1)) + (jours || 4) * 864e5).toISOString(), OPT);

describe('R1 — l\'histoire : un recul raté ne touche ni la grosse série ni la stagnation', () => {
  const sans = [bonne(), bonne(), bonne()];
  const rate = [bonne(), bonne(), [g(140, 3), r(125, 0), r(125, 5)]];
  test('la consigne suivante est la même : 140 kg, la grosse série décide', () => {
    expect(consigne(rate).consigne.ligne).toEqual(consigne(sans).consigne.ligne);
    expect(consigne(rate).consigne.palier).toBe(140);
  });
  test('stagnation : un recul « manquée » n\'est plus « manqué au travail » — le 140 × 4 qui suit 140 × 3 est un progrès (avant : le recul retypé echec l\'annulait)', () => {
    const compteur = (typeDuZero) => {
      const liste = [bonne(), bonne(), [g(140, 4), r(125, 0, { type_serie: typeDuZero }), r(125, 5)]];
      const groupes = liste.map((s, i) => seanceH(i, s));
      const c = M.contratDe(groupes, null, 'charge_reps', { reglage: 'normal', equipement: 'barre', correction: null });
      return M.compteurDe(c, new Date(Date.parse(jourH(3))).toISOString(), { reglage: 'normal', equipement: 'barre', toutes: true });
    };
    // le chemin d'avant R1 (le recul passait à echec) : la séance est « sans progrès » ; le chemin d'après (le recul garde son type) : progrès
    expect(compteur('echec').verdicts.map((v) => v.progres)).toEqual([true, false]);
    expect(compteur('recul').verdicts.map((v) => v.progres)).toEqual([true, true]);
    expect(compteur('recul').compteur).toBe(0);
  });
});

describe('R1 — ecartDeRecul lit le 0', () => {
  const E = (series, cible, opt) => M.ecartDeRecul({ series }, cible === undefined ? 6 : cible, null, opt);
  test('le recul raté seul : l\'écart s\'éloigne de 2,5 points (« Je les éloigne »)', () => {
    const e = E([g(140, 3), r(125, 0), r(125, 0)]);
    expect(e).toMatchObject({ sens: 'eloigne', reel: 0.105 });
    expect(e.ecart).toBeCloseTo(0.13, 6);
  });
  test('sans 0, la lecture est celle d\'avant (6, 6 : ni éloigné ni rapproché)', () => {
    expect(E([g(140, 3), r(125, 6), r(125, 6)])).toMatchObject({ sens: null });
  });
  test('(a) un recul a réussi à cette charge ou plus lourd dans la séance : le 0 est ignoré (0 puis 125 × 6 → pas éloigné)', () => {
    expect(E([g(140, 3), r(125, 0), r(125, 6)]).sens).toBeNull();
    expect(E([g(140, 3), r(122.5, 0), r(125, 6)]).sens).toBeNull();
    // un recul réussi seulement PLUS LÉGER ne couvre pas le 0
    expect(E([g(140, 3), r(125, 0), r(115, 6)]).sens).toBe('eloigne');
  });
  test('(b) « J\'ai eu mal » noté : le 0 est ignoré', () => {
    expect(E([g(140, 3), r(125, 0, { douleur: true }), r(125, 0)]).sens).toBeNull();
  });
  test('(c) la grosse série ratée à 0 rep (sans recalage : cas G) : le 0 du recul est ignoré ; grosse sous la zone à 1 rep ou plus (recalage) : l\'exception ne joue pas', () => {
    const grosseZero = g(140, 0, { type_serie: 'echec' });
    expect(E([grosseZero, g(135, 3), r(125, 0), r(125, 0)], 6, { bas: 3 }).sens).toBeNull();
    // 140 × 2 sous la zone 3-5 : les reculs se sont recalés sur le max du jour (G) — un 0 après ce recalage dit bien « écart trop petit »
    expect(E([g(140, 2), r(125, 0), r(125, 0)], 6, { bas: 3 }).sens).toBe('eloigne');
  });
  test('un recul qui n\'a que des reps vraies garde « rapproche » ; les 0 ignorés ne font jamais un « rapproche »', () => {
    expect(E([g(140, 3), r(125, 9), r(125, 9)]).sens).toBe('rapproche');
    expect(E([g(140, 3), r(125, 0, { douleur: true })]).sens).toBeNull();
  });
});
