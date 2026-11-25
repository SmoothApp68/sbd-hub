/** @jest-environment node */
//
// « Les chutes » (25/11/2026, règle validée par Aurélien ; MOTEUR §9.2 bis, §9.2 ter, I272) — LE PLANCHER DE LA DERNIÈRE SÉRIE.
// Dans la consigne seulement (`consigneDExercice`), jamais dans `niveauValide` : la visée suivante n'est jamais sous le niveau des séries d'avant,
// la tenue qui en résulte (perte de 2 reps ou plus) se fait sans ligne de test, UNE fois de suite, et la phrase dit le fait puis la conséquence
// (« Dernière série à 9 : tu restes à 81,3 kg × 12. »). « Une rep de plus » ne se dit que si la visée dépasse la cible d'avant.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/reserve.js');
const T = require('../../v2/js/plan.js');

const esp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
const jour = (d) => '2026-11-' + d + 'T17:00:00+01:00';
const AVANT = jour('25');
const groupe = (id, d, charge, reps) => ({ seance: { id, debut: jour(d) }, series: reps.map((r, i) => ({ id: id + i, session_id: id, exercise_slug: 'x', charge_kg: charge, reps: r,
  rpe: null, ressenti: null, type_serie: 'travail', rang: i + 1, validee_a: jour(d), source: 'app' })) });
const HAUT = { lourd: 5, mix: 8, hypertrophie: 10, volume: 12, series_longues: 20 };
// Deux séances d'avant qui REÇOIVENT la cible du tableau (à la cible si elle est le haut de la zone, sinon au niveau d'en dessous), puis les séances faites.
function histoire(charge, cible, faits, zone) {
  const prev = HAUT[zone] <= cible ? cible : cible - 1;
  const g = [groupe('a', '04', charge, faits[0].map(() => prev)), groupe('b', '11', charge, faits[0].map(() => prev))];
  faits.forEach((f, i) => g.push(groupe('s' + i, String(15 + i * 3), charge, f)));
  return g;
}
const consigne = (groupes, zone, reglage) => M.consigneDExercice(groupes, undefined, AVANT,
  { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: reglage || 'franc', correction: zone });
const zoneDe = (c) => (c <= 5 ? 'lourd' : c <= 8 ? 'mix' : c <= 10 ? 'hypertrophie' : c <= 12 ? 'volume' : 'series_longues');
const gris = (r) => esp(r.libelles.gris);

// ── 1. LE TABLEAU DE LA RÈGLE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// [charge, cible, séries faites, zone au haut, zone hors haut, visée attendue (les deux zones), phrase attendue (fin du gris)]
const TABLEAU = [
  [81.3, 12, [12, 12, 12, 10], 12, /Dernière série à 10 : tu restes à 81,3 kg × 12\.$/],
  [81.3, 12, [12, 12, 12, 9], 12, /Dernière série à 9 : tu restes à 81,3 kg × 12\.$/],
  [81.3, 12, [12, 12, 12, 8], 12, /Dernière série à 8 : tu restes à 81,3 kg × 12\.$/],
  [100, 10, [10, 10, 10, 7], 10, /Dernière série à 7 : tu restes à 100 kg × 10\.$/],
  [100, 10, [10, 10, 10, 6], 10, /Dernière série à 6 : tu restes à 100 kg × 10\.$/],
  [140, 4, [4, 3, 2], 4, /Dernière série à 2 : tu restes à 140 kg × 4\.$/],
  [100, 9, [9, 8, 6], 8, /Dernière série à 6 : tu restes à 100 kg × 8\.$/],
];
const ZONES = { 12: ['volume', 'series_longues'], 10: ['hypertrophie', 'volume'], 4: ['lourd', 'mix'], 9: ['hypertrophie', 'volume'] };   // [au haut de zone, hors haut]

describe('« Les chutes » — le tableau de la règle, rejoué sur le moteur (consigneDExercice)', () => {
  TABLEAU.forEach(([charge, cible, fait, vise, phrase]) => {
    ZONES[cible].forEach((zone, iz) => ['franc', 'normal'].forEach((reglage) => {
      test(`${cible} · ${fait.join(', ')} · ${iz ? 'hors haut de zone' : 'au haut de zone'} (${zone}) · ${reglage} : la ligne vise ${vise}, la phrase est vraie`, () => {
        const r = consigne(histoire(charge, cible, [fait], zone), zone, reglage);
        expect(r.consigne.ligne.charge).toBe(charge);
        expect(r.consigne.ligne.vise).toBe(vise);
        expect(gris(r)).toMatch(phrase);
        expect(gris(r)).not.toMatch(/Je ne compte pas la dernière série/);
        expect(gris(r)).not.toMatch(/rep de plus/);
      });
    }));
  });

  test('12, 12, 12, 11 (12) : la perte d’UNE rep n’est pas une chute, le niveau monte comme avant', () => {
    const hors = consigne(histoire(81.3, 12, [[12, 12, 12, 11]], 'series_longues'), 'series_longues', 'franc');
    expect(hors.consigne.ligne.vise).toBe(13);
    expect(gris(hors)).toMatch(/Une rep de plus : 81,3 kg × 13/);
    const haut = consigne(histoire(81.3, 12, [[12, 12, 12, 11]], 'volume'), 'volume', 'franc');
    expect(haut.consigne.etat).toBe('test_propose');
    expect(haut.consigne.ligne.vise).toBe(12);
  });

  test('D3 : 12, 12, 12, 9 au haut de zone, en Franc : tenue sans test ; en Normal : la progression garde 12, la même phrase', () => {
    const franc = consigne(histoire(81.3, 12, [[12, 12, 12, 9]], 'volume'), 'volume', 'franc');
    expect(franc.consigne.etat).toBe('tenue_apres_chute');
    expect(franc.consigne.haut).toBeNull();
    expect(franc.consigne.fondement.chuteDeFin).toMatchObject({ derniere: 9, premiere: 12 });
    const normal = consigne(histoire(81.3, 12, [[12, 12, 12, 9]], 'volume'), 'volume', 'normal');
    expect(normal.consigne.etat).toBe('progression');
    expect(gris(normal)).toBe(gris(franc));
  });

  test('en Franc, au haut de zone : une dernière série à −2 ou −3 retire le test de la séance suivante (le prix accepté) ; −1 ne le retire pas', () => {
    [[12, 12, 12, 10], [12, 12, 12, 9]].forEach((f) => {
      const r = consigne(histoire(81.3, 12, [f], 'volume'), 'volume', 'franc');
      expect(r.consigne.haut).toBeNull();
    });
    const un = consigne(histoire(81.3, 12, [[12, 12, 12, 11]], 'volume'), 'volume', 'franc');
    expect(un.consigne.haut).not.toBeNull();
  });
});

// ── 2. LA MONOTONIE SUR LA GRILLE, CONTRE LE MOTEUR ─────────────────────────────────────────────────────────────────────────────────────────
// Cibles 3 à 15, 3 à 5 séries, séries d'avant à 0, −1 ou −2 de la cible, dernière série de 1 aux séries d'avant : la visée ne baisse jamais quand la dernière série monte,
// ne dépasse jamais le cas sans baisse, et ne passe jamais sous la cible quand trois séries l'ont faite.
describe('« Les chutes » — la monotonie sur la grille (1 878 combinaisons)', () => {
  const faute = { monotone: [], plafond: [], trois: [] };
  let combinaisons = 0;
  for (let c = 3; c <= 15; c++) for (let ns = 3; ns <= 5; ns++) ['franc', 'normal'].forEach((rg) => {
    for (let d = -2; d <= 0; d++) {
      const premiere = Math.max(2, c + d);
      const zone = zoneDe(c);
      const vises = [];
      for (let L = 1; L <= premiere; L++) {
        const reps = [];
        for (let i = 0; i < ns - 1; i++) reps.push(premiere);
        reps.push(L);
        const k = consigne(histoire(100, c, [reps], zone), zone, rg).consigne;
        combinaisons++;
        const v = k.ligne ? k.ligne.vise : null;
        vises.push(v);
        if (v !== null && reps.filter((x) => x >= c).length >= 3 && v < c) faute.trois.push([c, ns, rg, reps.join(',')]);
      }
      for (let i = 1; i < vises.length; i++) if (vises[i] !== null && vises[i - 1] !== null && vises[i] < vises[i - 1]) faute.monotone.push([c, ns, rg, premiere, vises.join(',')]);
      const sans = vises[vises.length - 1];
      vises.forEach((v) => { if (v !== null && sans !== null && v > sans) faute.plafond.push([c, ns, rg, premiere, vises.join(',')]); });
    }
  });
  test('la grille est jouée en entier', () => { expect(combinaisons).toBe(1878); });
  test('aucune combinaison non monotone : plus la dernière série est haute, plus la visée est haute ou égale', () => { expect(faute.monotone).toEqual([]); });
  test('jamais au-dessus du cas sans baisse : une chute ne pousse jamais la cible plus haut', () => { expect(faute.plafond).toEqual([]); });
  test('jamais de cible baissée quand trois séries ont fait la cible', () => { expect(faute.trois).toEqual([]); });
});

// ── 3. « UNE FOIS DE SUITE » ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('« Les chutes » — la tenue sans test ne se fait qu’une fois de suite', () => {
  const F9 = [12, 12, 12, 9];
  test('Franc : la 1re séance à −3 tient sans test ; la 2e à −3 de suite, la consigne reçue étant déjà cette tenue, le test revient', () => {
    const une = consigne(histoire(81.3, 12, [F9], 'volume'), 'volume', 'franc');
    expect(une.consigne.etat).toBe('tenue_apres_chute');
    expect(une.consigne.haut).toBeNull();
    const deux = consigne(histoire(81.3, 12, [F9, F9], 'volume'), 'volume', 'franc');
    expect(deux.consigne.etat).toBe('test_propose');
    expect(deux.consigne.haut).not.toBeNull();
    expect(deux.consigne.ligne.vise).toBe(12);
  });
  test('Franc : une séance pleine entre les deux ne change rien (la tenue reçue est celle de la veille de la dernière séance), le test revient sur la séance pleine', () => {
    const plein = consigne(histoire(81.3, 12, [F9, [12, 12, 12, 12]], 'volume'), 'volume', 'franc');
    expect(plein.consigne.haut).not.toBeNull();
    const encore = consigne(histoire(81.3, 12, [F9, [12, 12, 12, 12], F9], 'volume'), 'volume', 'franc');
    expect(encore.consigne.etat).toBe('tenue_apres_chute');
    expect(encore.consigne.haut).toBeNull();
  });
  test('Normal : aucun test à proposer, la visée reste 12 des deux fois, seules la ligne et la phrase comptent', () => {
    [[F9], [F9, F9]].forEach((f) => {
      const r = consigne(histoire(81.3, 12, f, 'volume'), 'volume', 'normal');
      expect(r.consigne.ligne.vise).toBe(12);
      expect(gris(r)).toMatch(/Dernière série à 9 : tu restes à 81,3 kg × 12\.$/);
    });
  });
});

// ── 4. #746, POINT B : 5, 6, 9 POUR UNE CIBLE DE 9 ─────────────────────────────────────────────────────────────────────────────────────────
describe('« Les chutes » — #746 B : la cible baisse, la phrase le dit', () => {
  const o = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', correction: 'hypertrophie' };
  const prev = [groupe('a', '04', 90, [8, 8, 8]), groupe('b', '11', 90, [8, 8, 8])];
  const jr = groupe('c', '18', 90, [5, 6, 9]);
  test('la consigne reçue demandait 9 ; après 5, 6, 9 la ligne vise 6, le gris dit « ta cible passe à », jamais « une rep de plus »', () => {
    const recu = M.consigneDExercice(prev, undefined, jour('18'), o);
    expect(recu.consigne.ligne.vise).toBe(9);
    const r = M.consigneDExercice(prev.concat([jr]), undefined, AVANT, o);
    expect(r.consigne.ligne.vise).toBe(6);
    expect(r.consigne.fondement.cibleAvant).toBe(9);
    expect(gris(r)).toMatch(/Ta cible passe à 90 kg × 6\.$/);
    expect(gris(r)).not.toMatch(/rep de plus/);
  });
  test('l’annonce de fin d’exercice et le constat du jour disent la même chose : la cible passe à 6, « Pas encore » avec son écart', () => {
    const recu = M.consigneDExercice(prev, undefined, jour('18'), o);
    const s = M.suiteDExercice(prev, { seance: jr.seance, series: jr.series }, undefined, jour('19'), o);
    const c = M.constatDuJour(recu.consigne, s.apres.consigne, 'normal', s.cranSuivant,
      { series: jr.series.map((x) => ({ charge_kg: x.charge_kg, reps: x.reps })) }, jour('18'), false, false);
    expect(esp(c.suite)).toBe('La prochaine fois : ta cible passe à 90 kg × 6.');
    expect(esp(c.verdict)).toBe('Pas encore : 90 kg × 5, 6, 9 pour une cible de 9.');
  });
  test('une cible tenue ne dit pas « ta cible passe à » : 8, 8, 8 pour une cible de 9 garde 9 (« tu restes à »)', () => {
    const r = M.consigneDExercice(prev.concat([groupe('c', '18', 90, [8, 8, 8])]), undefined, AVANT, o);
    expect(r.consigne.ligne.vise).toBe(9);
    expect(gris(r)).toMatch(/Tu restes à 90 kg × 9\.$/);
  });
});

// ── 5. I272 : LE PLAN VÉRIFIE LA RÈGLE, ET SES DISCRIMINANTS L'ATTRAPENT ───────────────────────────────────────────────────────────────────────
describe('I272 — le plancher et la phrase sont vérifiés sur chaque plan', () => {
  function planDe(r, o) {
    let n = 0;
    const id = () => 's' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'x', id, { series: 3 });
    return T.planDeSeance(Object.assign({ seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices },
      consignes: { x: r }, reglage: 'normal', paris: [], suites: {} }, o || {}));
  }
  const erreurs = (p, entrees) => T.verifierPlan(p, entrees || {}).erreurs.filter((e) => /^I272/.test(e));
  const G = histoire(81.3, 12, [[12, 12, 12, 9]], 'volume');
  const precedents = { x: { seance: G[2].seance, series: G[2].series } };

  test('un plan réel (la chute, la perte de 2, la cible qui baisse) : aucune erreur I272, entrées comprises', () => {
    expect(erreurs(planDe(consigne(G, 'volume', 'normal')), { precedents })).toEqual([]);
    TABLEAU.forEach(([charge, cible, fait]) => {
      const zone = ZONES[cible][1];
      const g = histoire(charge, cible, [fait], zone);
      const e = erreurs(planDe(consigne(g, zone, 'franc')), { precedents: { x: { seance: g[2].seance, series: g[2].series } } });
      expect(e).toEqual([]);
    });
  });
  test('⚠️ DISCRIMINANT sens 1 — une visée sous le niveau des séries d’avant (11 après 12, 12, 12, 9) est attrapée', () => {
    const p = planDe(consigne(G, 'volume', 'normal'));
    p.exercices[0].consigne = JSON.parse(JSON.stringify(p.exercices[0].consigne));
    p.exercices[0].consigne.ligne.vise = 11;
    expect(erreurs(p, { precedents }).join('\n')).toMatch(/sous le niveau des séries d’avant \(12\)/);
  });
  test('⚠️ DISCRIMINANT sens 2 — « une rep de plus » devant une ligne qui ne dépasse pas la cible d’avant est attrapé', () => {
    const g = [groupe('a', '04', 90, [8, 8, 8]), groupe('b', '11', 90, [8, 8, 8]), groupe('c', '18', 90, [5, 6, 9])];
    const r = M.consigneDExercice(g, undefined, AVANT, { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', correction: 'hypertrophie' });
    const p = planDe(r);
    expect(erreurs(p)).toEqual([]);
    p.exercices[0].verbe = Object.assign({}, p.exercices[0].verbe, { verbe: 'monte_reps' });
    expect(erreurs(p).join('\n')).toMatch(/ne dépasse pas la cible d’avant \(9\)/);
  });
  test('⚠️ DISCRIMINANT — l’ancienne phrase « Je ne compte pas la dernière série » ne s’affiche plus', () => {
    const p = planDe(consigne(G, 'volume', 'normal'));
    p.exercices[0].entete.gris = 'Le 15 nov. : 81,3 kg × 12, 12, 12, 9. Je ne compte pas la dernière série : tu restes à 81,3 kg × 12.';
    expect(erreurs(p, { precedents }).join('\n')).toMatch(/dit encore « Je ne compte pas la dernière série »/);
  });
  test('⚠️ DISCRIMINANT — « Dernière série à N » doit être celle des entrées', () => {
    const p = planDe(consigne(G, 'volume', 'normal'));
    p.exercices[0].consigne = JSON.parse(JSON.stringify(p.exercices[0].consigne));
    p.exercices[0].consigne.fondement.chuteDeFin.derniere = 7;
    expect(erreurs(p, { precedents }).join('\n')).toMatch(/n’est pas celui des entrées \(9\)/);
  });
});

// ── 6. CE QUI NE CHANGE PAS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('« Les chutes » — le niveau validé n’est pas touché', () => {
  test('`niveauValide` et `chuteDe` rendent ce qu’ils rendaient : 12, 12, 12, 9 vaut toujours 10 (la 2e série à −3 fait baisser le niveau, le plancher est dans la consigne)', () => {
    const ser = [12, 12, 12, 9].map((r) => ({ charge_kg: 81.3, reps: r, type_serie: 'travail' }));
    expect(M.niveauValide(ser)).toBe(10);
    expect(M.chuteDe(ser)).toBeNull();
  });
  test('la chute du §9.2 bis garde ses autres lecteurs : 12, 12, 12, 6 est toujours une chute (retirée du niveau)', () => {
    const ser = [12, 12, 12, 6].map((r) => ({ charge_kg: 81.3, reps: r, type_serie: 'travail' }));
    expect(M.chuteDe(ser)).not.toBeNull();
  });
});
