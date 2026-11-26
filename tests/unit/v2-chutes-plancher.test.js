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
  [81.3, 12, [12, 12, 12, 10], 12, /Dernière série à 10 : tu restes à 81,3 kg × 12(?:, vers tes \d+-\d+)?\.$/],
  [81.3, 12, [12, 12, 12, 9], 12, /Dernière série à 9 : tu restes à 81,3 kg × 12(?:, vers tes \d+-\d+)?\.$/],
  [81.3, 12, [12, 12, 12, 8], 12, /Dernière série à 8 : tu restes à 81,3 kg × 12(?:, vers tes \d+-\d+)?\.$/],
  [100, 10, [10, 10, 10, 7], 10, /Dernière série à 7 : tu restes à 100 kg × 10(?:, vers tes \d+-\d+)?\.$/],
  [100, 10, [10, 10, 10, 6], 10, /Dernière série à 6 : tu restes à 100 kg × 10(?:, vers tes \d+-\d+)?\.$/],
  [140, 4, [4, 3, 2], 4, /Dernière série à 2 : tu restes à 140 kg × 4(?:, vers tes \d+-\d+)?\.$/],
  [100, 9, [9, 8, 6], 8, /Ta cible passe à 100 kg × 8(?:, vers tes \d+-\d+)?\.$/],
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
    expect(gris(r)).toMatch(/Ta cible passe à 90 kg × 6(?:, vers tes \d+-\d+)?\.$/);
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
  test('9, 8, 6 (cible 9) : la visée 8 est SOUS la cible d’avant, la phrase dit la baisse — jamais « tu restes », jamais « Dernière série à 6 »', () => {
    ['franc', 'normal'].forEach((rg) => {
      const r = consigne(histoire(100, 9, [[9, 8, 6]], 'hypertrophie'), 'hypertrophie', rg);
      expect(r.consigne.ligne.vise).toBe(8);
      expect(r.consigne.fondement.cibleAvant).toBe(9);
      expect(gris(r)).toMatch(/Ta cible passe à 100 kg × 8(?:, vers tes \d+-\d+)?\.$/);
      expect(gris(r)).not.toMatch(/restes|Dernière série à/);
    });
  });
  test('la cible sous la zone garde sa clause avec le verbe qui garde : 4, 4, 4 pour une cible de 5 en Mix → « Tu restes à 130 kg × 5, vers tes 6-8. » (RM193, 200b)', () => {
    const r = consigne(histoire(130, 5, [[4, 4, 4]], 'mix'), 'mix', 'franc');
    expect(r.consigne.ligne.vise).toBe(5);
    expect(gris(r)).toMatch(/Tu restes à 130 kg × 5, vers tes 6-8\.$/);
  });
  test('une cible tenue ne dit pas « ta cible passe à » : 8, 8, 8 pour une cible de 9 garde 9 (« tu restes à »)', () => {
    const r = M.consigneDExercice(prev.concat([groupe('c', '18', 90, [8, 8, 8])]), undefined, AVANT, o);
    expect(r.consigne.ligne.vise).toBe(9);
    expect(gris(r)).toMatch(/Tu restes à 90 kg × 9\.$/);
  });
});

// ── 4 bis. D2 (26/11/2026, MOTEUR §9.2 ter delta) : LE PLANCHER S'ARRÊTE AU HAUT DE LA ZONE ────────────────────────────────────────────────────────
// Lourd 3-5, une ligne 100 kg × 5 reçue, `6, 6, 6, 4` : la visée est 5 (le haut), jamais 6 ; la phrase se lit contre la ligne que l'écran a montrée.
describe('D2 — le plancher des chutes est borné au haut de la zone', () => {
  const lourd = (reglage, faits, recu) => {
    const g = [groupe('a', '04', 100, [4, 4, 4, 4]), groupe('b', '11', 100, recu || [5, 5, 5, 5])];
    faits.forEach((f, i) => g.push(groupe('s' + i, String(15 + i * 3), f.charge || 100, f.reps || f)));
    return consigne(g, 'lourd', reglage);
  };
  ['normal', 'franc', 'prudent'].forEach((rg) => {
    test(`${rg} : 6, 6, 6, 4 après 100 kg × 5 → la visée est 5 (le haut du 3-5), la phrase garde la ligne que l’écran a montrée`, () => {
      const r = lourd(rg, [[6, 6, 6, 4]]);
      expect(r.consigne.ligne.vise).toBe(5);
      expect(r.consigne.fondement.cibleAvant).toBe(5);
      expect(gris(r)).toMatch(/Dernière série à 4 : tu restes à 100 kg × 5\.$/);
      expect(gris(r)).not.toMatch(/× 6\./);
    });
    test(`${rg} : 6, 6, 6, 4 sans ligne montrée à cette charge (la séance d’avant était à 105 kg) → « Dernière série à 4 : ta cible passe à 100 kg × 5. »`, () => {
      const g = [groupe('a', '04', 100, [4, 4, 4, 4]), groupe('b', '11', 100, [5, 5, 5, 5]), groupe('c', '14', 105, [3, 3, 3]), groupe('d', '17', 100, [6, 6, 6, 4])];
      const r = consigne(g, 'lourd', rg);
      expect(r.consigne.ligne.vise).toBe(5);
      expect(r.consigne.fondement.cibleAvant).toBeUndefined();
      expect(gris(r)).toMatch(/Dernière série à 4 : ta cible passe à 100 kg × 5\.$/);
    });
    test(`${rg} : 6, 6, 6, 3 (−3) donne la même visée, 5`, () => {
      expect(lourd(rg, [[6, 6, 6, 3]]).consigne.ligne.vise).toBe(5);
    });
  });
  test('la cible d’avant plus haute que la visée (l’écran montrait 6, la zone s’arrête à 5) : « Dernière série à 4 : ta cible passe à 100 kg × 5 » — le verbe dit la baisse et nomme la série', () => {
    const v = M.verbeDeLaConsigne({ etat: 'progression', palier: 100, niveau: 4, ligne: { charge: 100, vise: 5 },
      fondement: { cibleAvant: 6, chuteDeFin: { niveauAvant: 6, derniere: 4, premiere: 6 } } });
    expect(v).toMatchObject({ verbe: 'borne', baisse: true, tombee: 4 });
  });
  test('la ligne montrée égale à la visée : le verbe garde (« tu restes à ») et nomme la série ; la ligne montrée plus basse : « ta cible, » (la ligne monte)', () => {
    const c = (cibleAvant) => M.verbeDeLaConsigne({ etat: 'progression', palier: 100, niveau: 4, ligne: { charge: 100, vise: 5 },
      fondement: { cibleAvant, chuteDeFin: { niveauAvant: 6, derniere: 4, premiere: 6 } } });
    expect(c(5)).toMatchObject({ verbe: 'garde_cible', baisse: false, tombee: 4 });
    expect(c(4)).toMatchObject({ verbe: 'borne', baisse: false, tombee: 4 });
  });
  test('sans borne de zone (le niveau des séries d’avant est dans la zone) la règle de 25/11 est inchangée : 4, 3, 2 (cible 4) → 4 ; 9, 8, 6 → 8', () => {
    ['franc', 'normal'].forEach((rg) => {
      expect(consigne(histoire(140, 4, [[4, 3, 2]], 'lourd'), 'lourd', rg).consigne.ligne.vise).toBe(4);
      expect(consigne(histoire(100, 9, [[9, 8, 6]], 'hypertrophie'), 'hypertrophie', rg).consigne.ligne.vise).toBe(8);
    });
  });
  test('la même série `6, 6, 6, 4` dans une zone qui la contient (Mix 6-8) vise 6 : le plancher n’est borné que par le haut de SA zone ; la perte d’une rep (6, 6, 6, 5) n’est pas une chute', () => {
    const mix = consigne(histoire(100, 6, [[6, 6, 6, 4]], 'mix'), 'mix', 'franc');
    expect(mix.consigne.ligne.vise).toBe(6);
    expect(gris(mix)).toMatch(/Dernière série à 4 : tu restes à 100 kg × 6/);
    expect(lourd('franc', [[6, 6, 6, 5]]).consigne.fondement.chuteDeFin).toBeUndefined();
  });
});

// ── 4 ter. D2 : LA MONOTONIE QUAND LA SÉANCE D'AVANT VARIE AUSSI (ce que la grille à une séance ne voyait pas) ────────────────────────────────────────
// Trois séances : la cible − 1 partout, S1 variée (elle peut servir le plancher), S2 variée. Plus la dernière série de S2 est haute, plus la visée est haute ou égale ;
// « une rep de plus » n'est jamais dit contre la ligne que S1 a montrée sans la dépasser ; « ta cible passe à » jamais devant une ligne qui ne baisse pas.
describe('D2 — la monotonie sur la grille à deux séances variées', () => {
  const Z = { lourd: [3, 5], mix: [6, 8], hypertrophie: [8, 10], volume: [10, 12] };
  const faute = { monotone: [], rep: [], passe: [] };
  let n = 0;
  Object.keys(Z).forEach((z) => ['normal', 'franc', 'prudent'].forEach((rg) => {
    const c = Z[z][1];
    const base = [groupe('a', '14', 100, [c - 1, c - 1, c - 1])];
    for (let a = c - 2; a <= c + 1; a++) for (let l = a - 4; l <= a; l++) {
      if (a < 1 || l < 1) continue;
      const g1 = base.concat([groupe('b', '18', 100, [a, a, l])]);
      const k1 = consigne(g1, z, rg).consigne;
      if (!k1 || !k1.ligne || k1.ligne.charge !== 100 || k1.haut) continue;
      const V = k1.ligne.vise;
      for (let x = Math.max(1, V - 1); x <= V + 1; x++) {
        let prec = null;
        for (let L = 1; L <= x; L++) {
          const r = consigne(g1.concat([groupe('c', '22', 100, [x, x, L])]), z, rg);
          const k = r.consigne;
          n++;
          if (!k || !k.ligne || k.ligne.charge !== 100) { prec = null; continue; }
          const vi = k.ligne.vise;
          if (prec !== null && vi < prec) faute.monotone.push([z, rg, [a, a, l].join(), x, L, prec + ' → ' + vi]);
          prec = vi;
          const gr = gris(r);
          if (/Une rep de plus/.test(gr) && vi <= V) faute.rep.push([z, rg, [a, a, l].join(), [x, x, L].join(), V, vi]);
          if (/passe à/.test(gr) && vi >= V) faute.passe.push([z, rg, [a, a, l].join(), [x, x, L].join(), V, vi]);
        }
      }
    }
  }));
  test('la grille est jouée (plusieurs milliers de consignes)', () => { expect(n).toBeGreaterThan(3000); });
  test('aucune paire non monotone : une rep de plus sur la dernière série ne baisse jamais la visée', () => { expect(faute.monotone).toEqual([]); });
  test('« une rep de plus » ne se dit jamais devant une ligne qui ne dépasse pas celle que l’écran a montrée', () => { expect(faute.rep).toEqual([]); });
  test('« ta cible passe à » ne se dit jamais devant une ligne qui ne baisse pas celle que l’écran a montrée', () => { expect(faute.passe).toEqual([]); });
});

// ── 4 quater. D1 (26/11/2026, MOTEUR §9.2 ter delta) : LA LIGNE QUE LE COACH RELIT EST CELLE QUE L'ÉCRAN A MONTRÉE ─────────────────────────────────────────
describe('D1 — `fondement.cibleAvant` est la visée que l’écran a montrée', () => {
  const o = (reglage) => ({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage, correction: 'lourd' });
  const avecReserve = (id, d, reps) => { const g = groupe(id, d, 100, reps); g.series[reps.length - 1].rpe = 9; return g; };
  const base = () => [groupe('a', '04', 100, [4, 4, 4, 4]), groupe('b', '11', 100, [5, 5, 5, 2])];
  test('reçu 100 kg × 5 après 5, 5, 5, 2, puis 5, 5, 5, 5 à 1 en réserve : Normal garde (plus d’essai fondé sur un « × 4 » que l’écran n’a jamais montré)', () => {
    const recu = M.consigneDExercice(base(), undefined, jour('14'), o('normal'));
    expect(recu.consigne.ligne.vise).toBe(5);
    const r = M.consigneDExercice(base().concat([avecReserve('c', '15', [5, 5, 5, 5])]), undefined, AVANT, o('normal'));
    expect(r.consigne.fondement.cibleAvant).toBe(5);
    expect(r.consigne.haut).toBeNull();
    expect(gris(r)).toMatch(/Je garde 100 kg/);
  });
  test('le même cas en Franc : l’essai vient dans les deux cas (D1 ne change rien) ; en Prudent : « Tu restes à 100 kg × 5 »', () => {
    const g = base().concat([avecReserve('c', '15', [5, 5, 5, 5])]);
    expect(M.consigneDExercice(g, undefined, AVANT, o('franc')).consigne.etat).toBe('test_propose');
    expect(gris(M.consigneDExercice(g, undefined, AVANT, o('prudent')))).toMatch(/Tu restes à 100 kg × 5\.$/);
  });
  test('après 4, 4, 4, 4 (reçu 5) puis 5, 5, 5, 5 à 1 en réserve : la ligne relue est 5, comme après toute autre ligne 100 kg × 5', () => {
    const g = [groupe('a', '04', 100, [5, 5, 5, 5]), groupe('b', '11', 100, [4, 4, 4, 4]), avecReserve('c', '15', [5, 5, 5, 5])];
    expect(M.consigneDExercice(g, undefined, AVANT, o('normal')).consigne.fondement.cibleAvant).toBe(5);
  });
  // La propriété, sur la grille à deux séances : la cible d'avant relue est TOUJOURS la visée de la consigne que S1 a reçue (celle de `consigneDExercice` avant S2).
  const fautes = [];
  let n = 0;
  ['lourd', 'mix', 'hypertrophie', 'volume'].forEach((z) => ['normal', 'franc', 'prudent'].forEach((rg) => {
    const c = { lourd: 5, mix: 8, hypertrophie: 10, volume: 12 }[z];
    for (let a = c - 2; a <= c + 1; a++) for (let l = a - 4; l <= a; l++) {
      if (a < 1 || l < 1) continue;
      const g1 = [groupe('a', '14', 100, [c - 1, c - 1, c - 1]), groupe('b', '18', 100, [a, a, l])];
      const k1 = consigne(g1, z, rg).consigne;
      if (!k1 || !k1.ligne || k1.ligne.charge !== 100 || k1.haut) continue;
      for (let x = Math.max(1, k1.ligne.vise - 1); x <= k1.ligne.vise + 1; x++) for (let L = 1; L <= x; L += 1) {
        const k = consigne(g1.concat([groupe('c', '22', 100, [x, x, L])]), z, rg).consigne;
        n++;
        if (k && k.fondement && k.fondement.cibleAvant !== undefined && k.fondement.cibleAvant !== k1.ligne.vise) fautes.push([z, rg, [a, a, l].join(), [x, x, L].join(), k1.ligne.vise, k.fondement.cibleAvant]);
      }
    }
  }));
  test('la grille est jouée', () => { expect(n).toBeGreaterThan(3000); });
  test('⚠️ aucune cible d’avant relue ne diffère de la visée que l’écran avait montrée', () => { expect(fautes).toEqual([]); });
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
  test('⚠️ DISCRIMINANT sens 3 — « tu restes à » devant une visée sous la cible d’avant (9, 8, 6 : 8 sous 9) est attrapé', () => {
    const g = histoire(100, 9, [[9, 8, 6]], 'hypertrophie');
    const p = planDe(consigne(g, 'hypertrophie', 'normal'));
    expect(erreurs(p)).toEqual([]);
    p.exercices[0].entete.gris = 'Le 15 nov. : 100 kg × 9, 8, 6. Dernière série à 6 : tu restes à 100 kg × 8.';
    expect(erreurs(p).join('\n')).toMatch(/dit « tu restes à » alors que la ligne \(8\) est sous la cible d’avant \(9\)/);
  });
  test('D2 : un plan réel `6, 6, 6, 4` en Lourd 3-5 : aucune erreur I272 ; ⚠️ DISCRIMINANT — une visée au-dessus du haut de la zone (6) est attrapée, et « ta cible, » devant la ligne montrée égale', () => {
    const g = [groupe('a', '04', 100, [4, 4, 4, 4]), groupe('b', '11', 100, [5, 5, 5, 5]), groupe('c', '15', 100, [6, 6, 6, 4])];
    const entrees = { precedents: { x: { seance: g[2].seance, series: g[2].series } } };
    const p = planDe(consigne(g, 'lourd', 'normal'));
    expect(p.exercices[0].consigne.ligne.vise).toBe(5);
    expect(erreurs(p, entrees)).toEqual([]);
    const haut = JSON.parse(JSON.stringify(p));
    haut.exercices[0].consigne.ligne.vise = 6;
    expect(erreurs(haut, entrees).join('\n')).toMatch(/au-dessus du haut de la zone \(5\)/);
    const mot = JSON.parse(JSON.stringify(p));
    mot.exercices[0].entete.gris = 'Le 15 nov. : 100 kg × 6, 6, 6, 4. Dernière série à 4 : ta cible, 100 kg × 5.';
    expect(erreurs(mot, entrees).join('\n')).toMatch(/devrait dire « tu restes à »/);
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

// ── 7. ÉCART A (25/11/2026) — LA PHRASE DES PROTÉGÉS SUIT LA RÈGLE, SA VISÉE NE CHANGE PAS ──────────────────────────────────────────────────
// `fondement.cibleAvant` se pose pour TOUT le monde (avant : seulement si le plancher est actif, donc jamais pour un protégé). Le plancher, lui, n'agit toujours pas sur eux.
describe('Écart A — la population protégée : la phrase est vraie, la consigne est celle d’avant', () => {
  const prot = (g, zone) => M.consigneDExercice(g, undefined, AVANT,
    { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', correction: zone, protegee: true });
  test('12, 12, 12, 9 (cible 12), protégé : la cible passe à 11, jamais « Une rep de plus » ; la visée reste 11 (le plancher ne les touche pas)', () => {
    const r = prot(histoire(80, 12, [[12, 12, 12, 9]], 'volume'), 'volume');
    expect(r.consigne.ligne.vise).toBe(11);
    expect(r.consigne.fondement.cibleAvant).toBe(12);
    expect(r.consigne.fondement.chuteDeFin).toBeUndefined();
    expect(gris(r)).toMatch(/Ta cible passe à 80 kg × 11/);
    expect(gris(r)).not.toMatch(/rep de plus/);
  });
  test('10, 10, 10, 6 (11 reçue), protégé : la visée vaut 11, égale à la cible d’avant : « tu restes à », jamais « Une rep de plus »', () => {
    const g = [groupe('a', '04', 80, [10, 10, 10, 10]), groupe('b', '11', 80, [10, 10, 10, 10]), groupe('c', '18', 80, [10, 10, 10, 6])];
    const r = prot(g, 'volume');
    expect(r.consigne.ligne.vise).toBe(11);
    expect(r.consigne.fondement.cibleAvant).toBe(11);
    expect(gris(r)).not.toMatch(/rep de plus/);
    expect(gris(r)).toMatch(/tu restes à 80 kg × 11/);
  });
  test('une montée vraie reste « Une rep de plus » pour un protégé (12, 12, 12, 11 → 13 ; la cible d’avant est 12)', () => {
    const r = prot(histoire(80, 12, [[12, 12, 12, 11]], 'series_longues'), 'series_longues');
    expect(r.consigne.ligne.vise).toBe(13);
    expect(gris(r)).toMatch(/Une rep de plus : 80 kg × 13/);
  });
  test('la consigne du protégé n’a pas bougé : même ligne, même état qu’avec `cibleAvant` ignorée (comparaison à l’arbre d’avant #751 : visées 11 et 11)', () => {
    const a = prot(histoire(80, 12, [[12, 12, 12, 9]], 'volume'), 'volume').consigne;
    expect([a.etat, a.ligne.charge, a.ligne.vise]).toEqual(['progression', 80, 11]);
  });
  test('I272 sur un plan protégé : la phrase fausse (« Une rep de plus » devant une cible qui baisse) est attrapée, la vraie passe', () => {
    let n = 0;
    const id = () => 's' + (++n);
    let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
    se = S.ajouterExercice(se, 'x', id, { series: 3 });
    const r = prot(histoire(80, 12, [[12, 12, 12, 9]], 'volume'), 'volume');
    const p = T.planDeSeance({ seance: { id: 'S1', debut: AVANT, edition: false, exercices: se.exercices }, consignes: { x: r }, reglage: 'normal', paris: [], suites: {} });
    const err = (q) => T.verifierPlan(q, {}).erreurs.filter((e) => /^I272/.test(e));
    expect(err(p)).toEqual([]);
    p.exercices[0].entete.gris = 'Le 15 nov. : 80 kg × 12, 12, 12, 9. Une rep de plus : 80 kg × 11.';
    p.exercices[0].verbe = Object.assign({}, p.exercices[0].verbe, { verbe: 'monte_reps' });
    expect(err(p).join('\n')).toMatch(/ne dépasse pas la cible d’avant \(12\)/);
  });
});

// ── 8. ÉCART B (25/11/2026) — EN NORMAL ET EN PRUDENT, LE PLANCHER NE RETIRE AUCUN TEST ───────────────────────────────────────────────────────
// Le prix accepté (CHUTES-REGLE) : « en Franc, une dernière série à −2/−3 retire le test de la séance suivante, une fois ; en Normal et en Prudent, seules la ligne et la phrase changent ».
// Avant ce correctif, la perte se mesurait sur la PREMIÈRE série : une meilleure première série (au-dessus de la cible) faisait d'une fin à −1 une fin à −2, et la tenue sans test retirait l'essai
// d'un dépassement (156 paires en Normal, 44 en Prudent, 0 avant #751). Le Franc garde son prix (4, 5, 3 donne l'essai, 5, 5, 3 ne le donne plus : accepté, NE PAS le changer).
describe('Écart B — « essai monotone » : une rep de plus ne retire jamais l’essai en Normal ni en Prudent', () => {
  const brute = (z, rg, cib, reps) => M.consigneDExercice(
    [groupe('a', '04', 100, reps.map(() => cib)), groupe('b', '11', 100, reps.map(() => cib)), groupe('c', '18', 100, reps)], undefined, AVANT,
    { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: rg, correction: z }).consigne;
  const essai = (k) => !!(k && k.haut && k.haut.charge > 100);

  test('Normal, Lourd, cible 4 : 5, 5, 4 donne l’essai ; 6, 5, 4 le donne aussi (la ligne vise 5, la phrase dit le fait)', () => {
    expect(essai(brute('lourd', 'normal', 4, [5, 5, 4]))).toBe(true);
    const k = brute('lourd', 'normal', 4, [6, 5, 4]);
    expect(essai(k)).toBe(true);
    expect(k.etat).toBe('test_propose');
  });
  test('Prudent, Lourd, cible 5 : 6, 6, 5 donne l’essai ; 7, 6, 5 le donne aussi', () => {
    expect(essai(brute('lourd', 'prudent', 5, [6, 6, 5]))).toBe(true);
    expect(essai(brute('lourd', 'prudent', 5, [7, 6, 5]))).toBe(true);
  });
  test('une CHUTE (§9.2 bis) retire encore l’essai dans tous les réglages, comme avant #751 : 5, 5, 1 (cible 3) en Normal', () => {
    const k = brute('lourd', 'normal', 3, [5, 5, 1]);
    expect(essai(k)).toBe(false);
    expect(k.etat).toBe('tenue_apres_chute');
  });
  test('le prix du Franc est gardé : 4, 5, 3 (cible 5) donne l’essai, 5, 5, 3 tient sans essai', () => {
    expect(essai(brute('lourd', 'franc', 5, [4, 5, 3]))).toBe(true);
    const k = brute('lourd', 'franc', 5, [5, 5, 3]);
    expect(essai(k)).toBe(false);
    expect(k.etat).toBe('tenue_apres_chute');
  });
  test('GRILLE : en Normal et en Prudent, une rep de plus sur une série ne retire jamais un essai (0 paire ; 156 + 44 sur main avant la correction, 0 avant #751)', () => {
    const memo = new Map();
    const C = (z, rg, cib, reps) => {
      const key = [z, rg, cib, reps.join(',')].join('|');
      if (!memo.has(key)) memo.set(key, brute(z, rg, cib, reps));
      return memo.get(key);
    };
    const fautes = [];
    let paires = 0;
    [['lourd', 3, 5], ['mix', 6, 8], ['hypertrophie', 8, 10]].forEach(([z, a, b]) => ['normal', 'prudent'].forEach((rg) => {
      for (let cib = a; cib <= b; cib++) [3, 4].forEach((ns) => {
        const vals = [];
        for (let d = -3; d <= 2; d++) if (cib + d >= 1) vals.push(cib + d);
        let combos = [[]];
        for (let s = 0; s < ns; s++) combos = combos.flatMap((c) => vals.map((x) => c.concat([x])));
        combos.forEach((r) => {
          const k0 = C(z, rg, cib, r);
          for (let j = 0; j < ns; j++) {
            if (r[j] + 1 > cib + 2) continue;
            const r2 = r.slice();
            r2[j]++;
            paires++;
            if (essai(k0) && !essai(C(z, rg, cib, r2))) fautes.push(`${z} ${rg} cible ${cib} : ${r.join(',')} → ${r2.join(',')}`);
          }
        });
      });
    }));
    expect(paires).toBeGreaterThan(20000);
    expect(fautes.slice(0, 5)).toEqual([]);
  }, 180000);
});
