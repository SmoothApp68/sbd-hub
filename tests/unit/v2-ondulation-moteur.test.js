/** @jest-environment node */
//
// 193-3 (commit 2) — L'ONDULATION DANS LE MOTEUR (MOTEUR §9.29) : une zone de plan posée, le coach ne relit que les séances de
// cette zone. Chaque branche de `consigneDExerciceCalcul` a son test : sous-histoire, première fois, périmée, zone de routine.
//
// ⚠️ LE BANC DE COMPARAISON EXACTE : sans zone de plan (absente, `null`, `undefined`), la sortie complète de
// `consigneDExercice` est identique, octet pour octet, à celle de main après la 193-1 (19f52ae), sauf la phrase « vers tes N-M » de la 200b — `fixtures/ondulation-or.json`.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const corpus = require('./fixtures/ondulation-corpus.js');
const OR = require('./fixtures/ondulation-or.json');

let n = 0;
const brute = (kg, reps) => ({ id: 'r' + (++n), rang: n, charge_kg: kg, reps, rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'squat_barre' });
const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal', edition: false };
const J = (m, d, a) => Date.UTC(a || 2026, m, d, 17);
const grp = (liste, extra) => liste.map((s, i) => ({
  seance: Object.assign({ id: 'H' + (liste.length ? i : 0) + '-' + s.d, debut: new Date(s.d).toISOString() }, s.seance || {}, extra || {}),
  series: (s.reps instanceof Array ? s.reps : [s.reps, s.reps, s.reps, s.reps]).map((r) => brute(s.kg, r))
}));
const calc = (g, avant, o) => M.consigneDExercice(g, undefined, avant, Object.assign({}, OPT, o || {}));
const iso = (t) => new Date(t).toISOString();

// 6 semaines : lundi Lourd 130 (+2,5 / semaine) × 4, jeudi Mix 110 (+2,5 / semaine) × 7
function dup(semaines) {
  const s = [];
  for (let w = 0; w < semaines; w++) {
    s.push({ kg: 130 + 2.5 * w, reps: 4, d: J(8, 7 + w * 7) });
    s.push({ kg: 110 + 2.5 * w, reps: 7, d: J(8, 10 + w * 7) });
  }
  return s;
}

describe('zéro zone de plan = main, octet pour octet', () => {
  const produit = corpus.produire(M);
  test.each(Object.keys(OR))('%s', (cle) => { expect(produit[cle]).toEqual(OR[cle]); });
  test('zonePlan null, undefined ou invalide : la même sortie qu\'absent', () => {
    const h = corpus.histoires().filter((x) => /^(dup|trou|alea3)$/.test(x.nom));
    h.forEach((x) => {
      const avant = '2026-11-02T17:00:00Z';
      const ref = JSON.stringify(calc(x.groupes, avant));
      [undefined, null, '', 'Mix', 'constructor'].forEach((z) => {
        expect(JSON.stringify(calc(x.groupes, avant, { zonePlan: z }))).toBe(ref);
      });
    });
  });
});

describe('le rang plan', () => {
  test('zoneRetenue : le plan passe avant la correction, la correction avant l\'habitude', () => {
    expect(M.zoneRetenue('lourd', 4, 'mix').cle).toBe('mix');
    expect(M.zoneRetenue('lourd', 4, null).cle).toBe('lourd');
    expect(M.zoneRetenue(null, 7, undefined).cle).toBe('mix');
    expect(M.zoneRetenue('lourd', 4, 'inconnue').cle).toBe('lourd');
    expect(M.zoneRetenue(null, 4, 'volume').cle).toBe('volume');
  });
});

describe('la DUP : deux paliers qui montent', () => {
  const H = dup(6);
  test('avant chacune des 11 séances suivantes, la zone du plan est celle de la consigne — plus jamais l\'inverse', () => {
    for (let i = 2; i <= 12; i++) {
      const lundi = i % 2 === 0;
      const prochaine = i < 12 ? H[i].d : J(9, 19);
      const avant = iso(prochaine - 3600e3);
      const c = calc(grp(H.slice(0, i)), avant, { zonePlan: lundi ? 'lourd' : 'mix' });
      expect(c.consigne.zone).toBe(lundi ? 'lourd' : 'mix');
      expect(c.etiquette).toBe(lundi ? 'Lourd · ta routine' : 'Mix · ta routine');
      expect(c.plan.zone).toBe(lundi ? 'lourd' : 'mix');
      if (i > 3) { expect(c.consigne.etat).not.toBe('nouvelle_zone'); expect(c.plan.mode).toBe('zone'); }
    }
  });
  test('le lundi et le jeudi suivent leur propre palier (le lundi 142,5 × 5, le jeudi 122,5 × 8) — aujourd\'hui l\'inverse', () => {
    const g = grp(H);
    const lundi = calc(g, iso(J(9, 19)), { zonePlan: 'lourd' });
    const jeudi = calc(g, iso(J(9, 22)), { zonePlan: 'mix' });
    expect(lundi.consigne.palier).toBe(142.5);
    expect(jeudi.consigne.palier).toBe(122.5);
    expect(lundi.consigne.ligne.charge).toBe(142.5);
    expect(jeudi.consigne.ligne.charge).toBe(122.5);
    const sans = calc(g, iso(J(9, 19)));
    expect(sans.consigne.zone).toBe('mix');            // main : l'inverse du plan du lundi
  });
  test('le compteur est celui de la zone : deux compteurs, pas de remise à zéro à chaque séance', () => {
    // le jeudi Mix stagne à 110 × 7 pendant 5 semaines ; le lundi Lourd monte
    const s = [];
    for (let w = 0; w < 6; w++) { s.push({ kg: 130 + 2.5 * w, reps: 4, d: J(8, 7 + w * 7) }); s.push({ kg: 110, reps: 7, d: J(8, 10 + w * 7) }); }
    const g = grp(s);
    const ids = g.map((x) => x.seance.id);
    const jeudi = calc(g, iso(J(9, 22)), { zonePlan: 'mix', seancesSousConsigne: ids });
    const lundi = calc(g, iso(J(9, 19)), { zonePlan: 'lourd', seancesSousConsigne: ids });
    expect(jeudi.compteur.compteur).toBeGreaterThanOrEqual(2);
    expect(lundi.compteur.compteur).toBe(0);
    const sans = calc(g, iso(J(9, 22)), { seancesSousConsigne: ids });
    expect(sans.compteur.compteur).toBe(0);              // main : bloqué à 0
  });
});

describe('l\'appartenance d\'une séance (C1)', () => {
  const vue = (reps) => ({ retenues: reps.map((r) => ({ reps: r })) });
  test('la zone faite : dans les bornes OU rangée par RANGEMENT', () => {
    const z = (reps) => M.zonesDeLaSeanceDePlan(vue(reps), { seance: {} }, null).sort();
    expect(z([4, 4, 4, 4])).toEqual(['lourd']);
    expect(z([7, 7, 7, 6])).toEqual(['mix']);
    expect(z([8, 8, 8, 8])).toEqual(['hypertrophie', 'mix']);       // 8 : le OU garde Mix
    expect(z([10, 10, 10])).toEqual(['hypertrophie', 'volume']);
    expect(z([13, 13])).toEqual(['series_longues']);
    expect(z([2, 2, 1])).toEqual([]);                                // des maximaux : aucune zone
    expect(z([])).toEqual([]);
  });
  test('la zone de la routine suivie passe avant les reps', () => {
    const g = { seance: { routine_id: 'rJeudi' } };
    expect(M.zonesDeLaSeanceDePlan(vue([4, 4, 4]), g, { rJeudi: 'mix' })).toEqual(['mix']);
    expect(M.zonesDeLaSeanceDePlan(vue([4, 4, 4]), g, { rJeudi: null })).toEqual(['lourd']);
    expect(M.zonesDeLaSeanceDePlan(vue([4, 4, 4]), g, { autre: 'mix' })).toEqual(['lourd']);
    expect(M.zonesDeLaSeanceDePlan(vue([4, 4, 4]), { seance: { routine_id: null } }, { rJeudi: 'mix' })).toEqual(['lourd']);
    expect(M.zonesDeLaSeanceDePlan(vue([4, 4, 4]), g, { rJeudi: 'inconnue' })).toEqual(['lourd']);
  });
  test('une séance Mix à 8 reps reste dans la sous-histoire Mix (RANGEMENT seul la perdrait)', () => {
    const s = [];
    for (let w = 0; w < 6; w++) { s.push({ kg: 130 + 2.5 * w, reps: 4, d: J(8, 7 + w * 7) }); s.push({ kg: 110, reps: 6 + Math.min(w, 2), d: J(8, 10 + w * 7) }); }
    const c = calc(grp(s), iso(J(9, 22)), { zonePlan: 'mix' });
    expect(c.plan.n).toBe(6);
    expect(c.consigne.etat).not.toBe('nouvelle_zone');   // C2 : la sous-histoire se rejoue DANS la zone du plan
    expect(c.consigne.zone).toBe('mix');
  });
  test('la zone de la routine range la séance, même si les reps disent autre chose', () => {
    // 4 jeudis faits à 4 reps (Lourd), mais depuis la routine « jeudi » dont la ligne dit Mix : ils sont dans Mix
    const s = [0, 1, 2, 3].map((w) => ({ kg: 120 + 2.5 * w, reps: 4, d: J(8, 10 + w * 7), seance: { routine_id: 'rJeudi' } }));
    const g = grp(s);
    const avec = calc(g, iso(J(9, 8)), { zonePlan: 'mix', zonesDeRoutine: { rJeudi: 'mix' } });
    expect(avec.plan.mode).toBe('zone');
    expect(avec.plan.n).toBe(4);
    const sans = calc(g, iso(J(9, 8)), { zonePlan: 'mix' });
    expect(sans.plan.mode).toBe('premiere');
  });
});

describe('la première fois dans une zone (C2, branche « premiere »)', () => {
  const lourd = [0, 1, 2, 3].map((w) => ({ kg: 130 + 2.5 * w, reps: 4, d: J(8, 7 + w * 7) }));
  test('le report §9.10 existant, une seule fois : nouvelle_zone depuis la dernière séance de l\'exercice', () => {
    const c = calc(grp(lourd), iso(J(9, 8)), { zonePlan: 'mix' });
    expect(c.plan.mode).toBe('premiere');
    expect(c.consigne.etat).toBe('nouvelle_zone');
    expect(c.consigne.zone).toBe('mix');
    expect(c.consigne.ligne.charge).toBeLessThan(137.5);
    expect(c.consigne.ligne.charge).toBeGreaterThan(110);
    expect(c.etiquette).toBe('Mix · ta routine');
  });
  test('le jeudi suivant : l\'historique de la zone, pas de nouveau report', () => {
    const s = lourd.concat([{ kg: 125, reps: 6, d: J(9, 8) }]);
    const c = calc(grp(s), iso(J(9, 15)), { zonePlan: 'mix' });
    expect(c.plan.mode).toBe('zone');
    expect(c.consigne.etat).not.toBe('nouvelle_zone');
    expect(c.consigne.zone).toBe('mix');
  });
  test('une correction datée (zones_exercice, bloc) ne déplace pas le passé ni le plan : la zone du plan reste celle du jour', () => {
    const lignes = [{ id: 'z1', exercise_slug: 'squat_barre', zone: 'lourd', corrigee_a: '2026-09-01T08:00:00.000Z' }];
    const c = calc(grp(lourd), iso(J(9, 8)), { zonePlan: 'mix', correction: 'lourd', correctionsDeZone: lignes });
    expect(c.consigne.zone).toBe('mix');
    expect(c.consigne.etat).toBe('nouvelle_zone');
  });
  test('un exercice sans aucune séance : « Première fois ici », sans report', () => {
    const c = calc([], iso(J(9, 8)), { zonePlan: 'mix' });
    expect(c.consigne.etat).toBe('silence');
    expect(c.consigne.raison).toBe('premiere_fois');
  });
});

describe('la sous-histoire périmée (56 jours)', () => {
  // le couché : Mix en juin (100 × 7), Lourd en septembre-octobre
  const base = [{ kg: 100, reps: 7, d: J(5, 4) }, { kg: 100, reps: 7, d: J(5, 11) }];
  const lourd = [0, 1, 2, 3, 4].map((w) => ({ kg: 127.5 + 2.5 * w, reps: 3, d: J(8, 17 + w * 7) }));
  test('Mix en juin, Lourd depuis : « première fois », report depuis la dernière séance — jamais 97,5 kg ni reprise longue', () => {
    const g = grp(base.concat(lourd));
    const c = calc(g, iso(J(9, 22)), { zonePlan: 'mix' });
    expect(c.plan.mode).toBe('premiere');
    expect(c.plan.perimee).toBe(true);
    expect(c.consigne.etat).toBe('nouvelle_zone');
    expect(c.consigne.ligne.charge).toBeGreaterThan(115);
    // main sur la sous-histoire seule serait une reprise longue à 97,5 : la preuve que la règle est nécessaire
    const naif = M.consigneDExercice(grp(base), undefined, iso(J(9, 22)), Object.assign({}, OPT, { correction: 'mix' }));
    expect(naif.consigne.etat).toBe('reprise_longue');
  });
  test('la limite : 56 jours encore la sous-histoire, 57 jours périmée', () => {
    const dernierMix = J(8, 3);
    const mixLourd = base.concat([{ kg: 105, reps: 7, d: dernierMix }]).concat([{ kg: 130, reps: 3, d: dernierMix + 10 * 864e5 }, { kg: 132.5, reps: 3, d: dernierMix + 17 * 864e5 }]);
    const g = grp(mixLourd);
    const j56 = calc(g, iso(dernierMix + 56 * 864e5), { zonePlan: 'mix' });
    const j57 = calc(g, iso(dernierMix + 57 * 864e5), { zonePlan: 'mix' });
    expect(j56.plan.mode).toBe('zone');
    expect(j57.plan.mode).toBe('premiere');
    expect(j57.plan.perimee).toBe(true);
  });
  test('l\'exercice entier à l\'arrêt (rien fait ailleurs depuis) : la sous-histoire, et la reprise §9.9 joue seule', () => {
    const g = grp(base);
    const c = calc(g, iso(J(9, 22)), { zonePlan: 'mix' });
    expect(c.plan.mode).toBe('zone');
    expect(c.consigne.etat).toBe('reprise_longue');
  });
  test('un trou court dans la zone (≤ 56 j) avec l\'exercice actif ailleurs : la reprise courte de la sous-histoire est gardée', () => {
    const hebdo = [0, 1, 2, 3].map((w) => ({ kg: 110, reps: 7, d: J(7, 6 + w * 7) }));
    const ailleurs = [0, 1, 2, 3].map((w) => ({ kg: 130, reps: 4, d: J(8, 3 + w * 7) }));
    const c = calc(grp(hebdo.concat(ailleurs)), iso(J(9, 8)), { zonePlan: 'mix' });
    expect(c.plan.mode).toBe('zone');
    expect(['reprise_courte', 'progression', 'test_propose', 'maintien'].indexOf(c.consigne.etat)).toBeGreaterThanOrEqual(0);
  });
});

describe('trois zones dans la semaine', () => {
  test('trois sous-histoires, trois paliers, un seul report par zone au départ', () => {
    const s = [];
    for (let w = 0; w < 4; w++) {
      s.push({ kg: 130 + 2.5 * w, reps: 4, d: J(8, 7 + w * 7) });       // lundi Lourd
      s.push({ kg: 110 + 2.5 * w, reps: 7, d: J(8, 9 + w * 7) });       // mercredi Mix
      s.push({ kg: 90 + 2.5 * w, reps: 11, d: J(8, 11 + w * 7) });      // vendredi Volume
    }
    const g = grp(s);
    const avant = iso(J(9, 5));
    const l = calc(g, avant, { zonePlan: 'lourd' }), m = calc(g, avant, { zonePlan: 'mix' }), v = calc(g, avant, { zonePlan: 'volume' });
    expect([l.consigne.palier, m.consigne.palier, v.consigne.palier]).toEqual([137.5, 117.5, 97.5]);
    [l, m, v].forEach((c) => { expect(c.plan.mode).toBe('zone'); expect(c.consigne.etat).not.toBe('nouvelle_zone'); });
  });
});

describe('la zone à ménager prime sur la zone de la routine (MOTEUR §9.29)', () => {
  // que des lundis Lourd : sans la zone de plan, l'habitude est Lourd et la règle de ménagement s'applique (A4, 187)
  const histo = () => grp(dup(6).filter((x, i) => i % 2 === 0));
  const avant = iso(J(9, 20));
  test('squat à zone de plan Lourd + genou à ménager : aucune série lourde, la zone de plan est suspendue et le dit', () => {
    const r = calc(histo(), avant, { zonePlan: 'lourd', menagee: true });
    expect(r.consigne.zone).not.toBe('lourd');
    expect(r.consigne.fondement.menagee).toBe(true);
    expect(r.plan).toEqual(expect.objectContaining({ zone: 'lourd', suspendue: true, mode: 'suspendue', origine: 'routine' }));
    expect(r.etiquette).toMatch(/zone à ménager/);
    expect(M.pourquoiPlan(r.plan)).toMatch(/ménager/);
    expect(M.pourquoiPlan(r.plan)).not.toMatch(/\d/);
  });
  test('la même ligne sans zone à ménager : Lourd, la sous-histoire (rien ne change)', () => {
    const r = calc(histo(), avant, { zonePlan: 'lourd', menagee: false });
    expect(r.consigne.zone).toBe('lourd');
    expect(r.plan.suspendue).toBeUndefined();
    expect(r.etiquette).toBe('Lourd · ta routine');
  });
  test('une zone de plan Mix + zone à ménager : le plan tient (la règle ne touche que Lourd)', () => {
    const r = calc(histo(), avant, { zonePlan: 'mix', menagee: true });
    expect(r.consigne.zone).toBe('mix');
    expect(r.plan.suspendue).toBeUndefined();
  });
  test('« juste pour aujourd\'hui » (Lourd) + zone à ménager : suspendu aussi, et le dit', () => {
    const r = calc(histo(), avant, { zonePlan: 'lourd', zonePlanOrigine: 'aujourdhui', menagee: true });
    expect(r.consigne.zone).not.toBe('lourd');
    expect(M.pourquoiPlan(r.plan)).toMatch(/aujourd/);
  });
});
