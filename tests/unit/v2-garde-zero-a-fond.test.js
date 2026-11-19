/** @jest-environment node */
// « Garde 0 » (19/11/2026) — à garde AFFICHÉE 0, « à fond » est la cible : la réaction en série ne la traite plus comme un doute et ne fait
// pas reculer. Cas réel : développé militaire haltères, zone Hypertrophie 8-10, réglage Franc, ligne 64 kg × 8, série 1 à 72 kg × 8.
require('../../v2/js/palier.js');
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const consigne = { etat: 'nouvelle_zone', zone: 'hypertrophie', palier: 64, n: 4,
  ligne: { charge: 64, vise: 8 }, haut: null };
const serieUne = (ressenti) => [{ charge_kg: 72, reps: 8, rpe: null, ressenti: ressenti === undefined ? null : ressenti }];
const sp = (t) => String(t).replace(/[  ]/g, ' ');

describe('à garde affichée 0', () => {
  test('sans note : la question garde la charge au lieu de promettre un retour', () => {
    const r = M.reactionPour(consigne, serieUne(), { gardeAffichee: 0 });
    expect(r.message.type).toBe('effort_suggere');
    expect(r.message.garde0).toBe(true);
    const t = sp(M.phraseReaction(r.message, M.zoneParCle('hypertrophie')));
    expect(t).toMatch(/Note ce qu'il t'en restait/);
    expect(t).toMatch(/je garde 72 kg/);
    expect(t).not.toMatch(/je reviens/);
  });
  test('« reste 0 » : sur la cible, les séries 2 à 4 restent à 72 kg (avant : retour à 64)', () => {
    const r = M.reactionPour(consigne, [{ charge_kg: 72, reps: 8, rpe: 10, ressenti: null }], { gardeAffichee: 0 });
    expect(r.plan.slice(1).map((l) => l.charge)).toEqual([72, 72, 72]);
    expect(r.message === null || r.message.type !== 'pas_encore').toBe(true);
  });
  test('sous le bas de la zone, « à fond » garde son sens (retour à la ligne)', () => {
    const r = M.reactionPour(consigne, [{ charge_kg: 72, reps: 6, rpe: 10, ressenti: null }], { gardeAffichee: 0 });
    expect(r.plan.slice(1).map((l) => l.charge)).toEqual([64, 64, 64]);
  });
});

describe('à garde affichée ≥ 1 ou inconnue : rien ne change', () => {
  test.each([[undefined], [{}], [{ gardeAffichee: 1 }], [{ gardeAffichee: 2 }]])('contexte %j', (ctx) => {
    const r = M.reactionPour(consigne, serieUne(), ctx);
    expect(r.message.type).toBe('effort_suggere');
    expect(r.message.garde0).toBe(false);
    expect(sp(M.phraseReaction(r.message, M.zoneParCle('hypertrophie')))).toMatch(/Si c'était à fond, note-le : je reviens à 64 kg/);
    const f = M.reactionPour(consigne, [{ charge_kg: 72, reps: 8, rpe: 10, ressenti: null }], ctx);
    expect(f.plan.slice(1).map((l) => l.charge)).toEqual([64, 64, 64]);
  });
});

describe('la phrase dit le fait en tête et passe le lexique', () => {
  test('« 72 kg × 8, pile au bas de ta fourchette : je garde 72 kg. »', () => {
    const r = M.reactionPour(consigne, serieUne(), { gardeAffichee: 0 });
    const t = sp(M.phraseReaction(r.message, M.zoneParCle('hypertrophie')));
    expect(t).toMatch(/^72 kg × 8, pile au bas de ta fourchette : je garde 72 kg\. Note ce qu'il t'en restait/);
    expect(t).not.toMatch(/garde 0/);
  });
});

describe('un seul prédicat d\'éligibilité (plan.js lit le même aux deux endroits)', () => {
  test('palier > 0 et charge × reps (ou mesure inconnue) : éligible ; aide, durée, distance : non', () => {
    expect(M.effortViseEligible(64)).toBe(true);
    expect(M.effortViseEligible(64, null)).toBe(true);
    expect(M.effortViseEligible(64, 'charge_reps')).toBe(true);
    expect(M.effortViseEligible(-30, 'charge_reps')).toBe(false);
    expect(M.effortViseEligible(64, 'duree')).toBe(false);
    expect(M.effortViseEligible(64, 'distance')).toBe(false);
  });
});

describe('le vrai chemin du plan (planDeSeance + verifierPlan)', () => {
  global.window = global;
  const Seance = require('../../v2/js/seance.js');
  const Plan = require('../../v2/js/plan.js');
  function jouer(cons, n, faites, reglage) {
    let k = 0; const id = () => 'x-s' + (++k);
    let se = Seance.creer({ id: 'S', userId: 'u', idSerie: id }); se = Seance.ajouterExercice(se, 'x', id, { series: n });
    const paris = []; let avant = null; let sortie = null;
    const entrees = () => ({ seance: { id: 'S', debut: '2026-10-11T10:00:00Z', edition: false, exercices: se.exercices },
      consignes: { x: { consigne: cons, contexte: { cran: null, haut: null } } }, reglage, paris: paris.slice() });
    for (let t = 0; t <= faites.length; t++) {
      const e = entrees(); const p = Plan.planDeSeance(e);
      const erreurs = Plan.verifierPlan(p, e, avant).erreurs;
      sortie = { lignes: p.exercices[0].lignes.map((l) => l.charge + 'x' + l.vise + '[' + l.role + ']'), erreurs };
      avant = p; if (t === faites.length) break;
      const f = faites[t];
      se = Seance.modifierSerie(se, 0, t, { charge_kg: f.charge, reps: f.reps });
      se = Seance.definirEffort(se, 0, t, { rpe: f.rpe, ressenti: null });
      se = Seance.valider(se, 0, t, new Date('2026-10-11T10:30:00Z'));
      const q = Plan.planDeSeance(entrees()).exercices[0].paris[t];
      if (q) paris.push(Object.assign({}, q, { set_observe: se.exercices[0].series[t].id }));
    }
    return sortie;
  }
  const cons = (o) => Object.assign({ etat: 'nouvelle_zone', zone: 'hypertrophie', palier: 64, n: 4, ligne: { charge: 64, vise: 8 }, haut: null }, o || {});

  test.each([[4], [2]])('72 × 8 à fond en Franc (n = %i) : charge gardée sur les séries restantes, aucun invariant en échec', (n) => {
    const r = jouer(cons({ n }), n, [{ charge: 72, reps: 8, rpe: 10 }], 'franc');
    expect(r.erreurs).toEqual([]);
    expect(r.lignes.slice(1).every((l) => /^72x8/.test(l))).toBe(true);
  });
  test('un exercice aidé (palier négatif) n\'entre pas dans la règle : aucune ligne d\'élan à garde 0', () => {
    const r = jouer(cons({ palier: -30, ligne: { charge: -30, vise: 8 } }), 4, [{ charge: -25, reps: 8, rpe: 10 }], 'franc');
    expect(r.lignes.some((l) => /^-25x8\[elan\]/.test(l))).toBe(false);
  });
});
