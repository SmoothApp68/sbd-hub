/** @jest-environment node */
//
// 49-U8 — une séance sans charge répétée ne fait plus taire le coach (MOTEUR
// §7.6, delta 49-16 du 28/09/2026). Une séance sans palier (§7.2) prend pour
// charge de travail la plus lourde charge tenue dans la zone (reps comptées au
// moins au bas de la zone de SA consigne) ; ses séries de travail à cette
// charge deviennent ses séries au palier. Aucune série de travail dans la
// zone : la séance est neutre, et la consigne suivante repart de celle d'avant.
// Une séance neutre reste une PRÉSENCE (delta 49-20, 29/09/2026) : elle ne
// compte pas pour la charge, mais sa date compte pour le rythme (§9.9).
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u8-sans-palier.json` (24 cas) sort du
// simulateur unique du coach (`coach49.py`, Claude.ai, 28/09/2026 ; S008,
// S009, S014 et S023 remplacés le 29/09 après la règle de présence). Un cas qui
// semble faux se rapporte ; il ne se corrige pas ici.
//
// DEUX CONVERSIONS, et deux seulement :
//   · `ligne` et `haut` en tableaux `[charge, vise]` / `[charge, vise, k]`,
//     comme le test de la consigne (§9.13) ;
//   · `zone` en tableau `[clé, bas, haut]` là où `consignePour` rend la clé :
//     le test relit les bornes dans la table `ZONES`, ce qui vérifie aussi la
//     table. (Signalé dans la PR : le format diffère du fichier 48b-5a-2.)

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const FICHIER = require('./fixtures/cas-49u8-sans-palier.json');
const CAS = FICHIER.cas;

const options = (c) => ({ reglage: c.reglage, equipement: c.equipement, correction: c.correction || null });
const tableau = (o, avecK) => (o === null || o === undefined ? null
  : avecK ? [o.charge, o.vise, o.k] : [o.charge, o.vise]);
const forme = (k) => {
  const z = M.zoneParCle(k.zone);
  return { etat: k.etat, zone: z === null ? null : [z.cle, z.bas, z.haut],
           ligne: tableau(k.ligne, false), haut: tableau(k.haut, true) };
};
// Ce que la règle a fait de chaque séance sans palier du cas : sa charge
// retenue, ou sa neutralité (restée au contrat, marquée `neutre`).
function lecture(c, retenues) {
  expect(retenues).toHaveLength(c.seances.length);
  const parDebut = new Map(retenues.map((s) => [s.debut, s]));
  const r = {}, n = [];
  c.seances.forEach((s) => {
    if (s.palier !== null) return;
    const x = parDebut.get(s.debut);
    if (x.neutre === true) { expect(x.palier).toBeNull(); n.push(s.debut); } else r[s.debut] = x.palier;
  });
  return { retenues: r, neutres: n };
}

describe('49-U8 — le fichier de cas', () => {
  test('24 cas : 21 passent du silence à une consigne, S022 à S024 sont des témoins', () => {
    expect(CAS).toHaveLength(24);
    const silences = CAS.filter((c) => c.sans_la_regle.etat === 'silence').map((c) => c.id);
    expect(silences).toHaveLength(21);
    CAS.forEach((c) => {
      if (silences.indexOf(c.id) >= 0) expect(c.attendu.consigne.etat).not.toBe('silence');
    });
    const temoins = CAS.filter((c) => silences.indexOf(c.id) < 0);
    expect(temoins.map((c) => c.id)).toEqual(['S022', 'S023', 'S024']);
    temoins.forEach((c) => {
      expect(c.seances.every((s) => s.palier !== null)).toBe(true);
      expect(c.attendu.consigne).toEqual(c.sans_la_regle);
    });
  });

  test('les deux branches sont jouées : des séances retenues, des séances neutres', () => {
    expect(CAS.some((c) => Object.keys(c.attendu.retenues).length > 0)).toBe(true);
    expect(CAS.some((c) => c.attendu.neutres.length > 0)).toBe(true);
    // Et une séance retenue SOUS sa plus lourde charge : sans elle, « la plus
    // lourde de la séance » passerait (S012 : 44, 48, 52 × 7 → 48).
    expect(CAS.filter((c) => c.id === 'S012')[0].attendu.retenues['2026-06-23T17:30:00+00:00']).toBe(48);
  });
});

describe('49-U8 — les 24 cas, rejoués', () => {
  CAS.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const o = options(c);
      const r = M.sansPalierRetenues(c.seances, o);
      expect(lecture(c, r)).toEqual({ retenues: c.attendu.retenues, neutres: c.attendu.neutres });
      expect(forme(M.consignePour(r, c.avant, o))).toEqual(c.attendu.consigne);
      // Sans la règle : la consigne que l'app rendait jusqu'ici.
      expect(forme(M.consignePour(c.seances, c.avant, o))).toEqual(c.sans_la_regle);
    });
  });
});

describe('49-U8 — la règle, ses bords', () => {
  const S012 = CAS.filter((c) => c.id === 'S012')[0];

  test('pure : les séances d’entrée ne changent pas, l’ordre d’arrivée non plus', () => {
    const avant = JSON.stringify(S012.seances);
    const r1 = M.sansPalierRetenues(S012.seances, options(S012));
    expect(JSON.stringify(S012.seances)).toBe(avant);
    const r2 = M.sansPalierRetenues(S012.seances.slice().reverse(), options(S012));
    const tri = (l) => l.slice().sort((a, b) => Date.parse(a.debut) - Date.parse(b.debut));
    expect(tri(r2)).toEqual(tri(r1));
  });

  test('les séries à la charge retenue deviennent ses séries au palier, les autres gardent leur rôle', () => {
    const r = M.sansPalierRetenues(S012.seances, options(S012));
    const s = r.filter((x) => x.debut === '2026-06-23T17:30:00+00:00')[0];
    expect(s.series.map((x) => x.charge_kg + ':' + x.role)).toEqual(['44:travail', '48:palier', '52:travail']);
    expect(s.series.map((x) => x.origine)).toEqual(['travail', 'travail', 'travail']);
  });

  test('§9.12 — une séance plus récente ne change rien à ce qu’une séance plus ancienne a retenu', () => {
    const o = options(S012);
    const tout = M.sansPalierRetenues(S012.seances, o);
    const coupe = M.sansPalierRetenues(S012.seances.slice(0, -1), o);
    coupe.forEach((s) => expect(tout.filter((x) => x.debut === s.debut)[0]).toEqual(s));
  });

  test('par la chaîne complète : `consigneDExercice` applique la règle, `contratDe` sans options non', () => {
    const jour = (d) => '2026-09-' + d + 'T18:00:00+00:00';
    const serie = (id, kg, reps) => ({ id, charge_kg: kg, reps, rpe: null, ressenti: null,
      type_serie: 'travail', rang: Number(id.slice(-1)) });
    const g = (d, l) => ({ seance: { debut: jour(d) }, series: l.map(([kg, r], i) => serie(d + '-' + (i + 1), kg, r)) });
    const groupes = [g('01', [[100, 5], [100, 5], [100, 5]]), g('08', [[100, 5], [105, 4], [110, 3]])];
    const O = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser', reglage: 'normal' };
    const c = M.consigneDExercice(groupes, undefined, jour('15'), O);
    expect(c.consigne).toMatchObject({ etat: 'attend', palier: 110, zone: 'lourd' });
    const brut = M.consignePour(M.contratDe(groupes, undefined, 'charge_reps'), jour('15'), O);
    expect(brut).toMatchObject({ etat: 'silence', raison: 'pas_de_palier' });
  });

  // DELTA 49-20 — S014, le cas qui l'a révélé : une séance au palier 52 le
  // 05/07, puis une séance neutre le 14/11, trois jours avant. Neutre retirée
  // des dates, il ne restait qu'une date — ou, dans le simulateur, une absence
  // de 135 jours et une reprise longue. Présente pour le rythme, elle dit que
  // l'exercice a été fait : pas de reprise, la consigne repart du 05/07.
  test('DISCRIMINANT — une séance neutre récente empêche une reprise', () => {
    const S014 = CAS.filter((c) => c.id === 'S014')[0];
    const o = options(S014);
    const r = M.sansPalierRetenues(S014.seances, o);
    const neutre = r.filter((s) => s.debut === '2023-11-14T12:38:00+00:00')[0];
    expect(neutre.neutre).toBe(true);
    expect(M.repriseDe(r, S014.avant)).toBe('aucune');
    const c = M.consignePour(r, S014.avant, o);
    expect(c.etat).toBe('progression');
    expect(c.fondement.date).toBe('2023-07-05T11:23:00+00:00');
    // La même histoire SANS la séance neutre : 135 jours d'absence, reprise longue.
    const r2 = M.sansPalierRetenues(S014.seances.filter((s) => s.debut !== neutre.debut), o);
    expect(M.consignePour(r2, S014.avant, o).etat).toBe('reprise_longue');
  });

  test('une séance neutre ne porte aucune charge : ni palier, ni votantes, ni pas de salle', () => {
    const S014 = CAS.filter((c) => c.id === 'S014')[0];
    const o = options(S014);
    const r = M.sansPalierRetenues(S014.seances, o);
    // Les charges des neutres (66, 59, 45, 41, 36) ne créent aucun cran : le
    // seul palier est 52 : le cran vient du repli de la machine (163, 5 kg — avant : `toBeNull`, le cran restait
    // inconnu), jamais d'une charge de séance neutre (57 et 47, pas 59/66/45/41/36).
    expect(M.chargeVoisine(r, S014.avant, 52, 'machine', 1)).toBe(57);
    expect(M.chargeVoisine(r, S014.avant, 52, 'machine', -1)).toBe(47);
  });

  // 3 depuis 49-U8 ; elle a monté depuis (4 en 49-U12, la chute) — ce test
  // garde seulement qu'elle ne redescend pas sous celle de ce chantier.
  test('la version des règles est montée à 3 (au moins)', () => {
    expect(M.VERSION_CONSIGNE).toBeGreaterThanOrEqual(3);
  });
});
