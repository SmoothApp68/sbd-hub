/** @jest-environment node */
//
// 53-1 — LE REPORT DE CHARGE AU CHANGEMENT DE ZONE (MOTEUR §9.10, delta 53-1).
//
// « Quand la zone retenue pour la séance diffère de la zone de la dernière
// séance non neutre, la charge = la plus basse de (a) la dernière charge tenue
// dans la zone visée dans les 90 jours et (b) l'estimation depuis le dernier
// palier, P × (1 + n/30) / (1 + bas/30), arrondie au cran inférieur de
// l'exercice ; la visée = le bas de la zone. »
//
//   1. la fonction pure, sur les 39 cas du fichier (34 passages réels Lourd ↔
//      Mix d'Aurélien, 5 limites) ;
//   2. le câblage dans la consigne (`consigneDExercice`) : la correction à
//      l'étiquette, la zone lue à date (jusqu'à la fin de la séance), la
//      séance d'après, le compteur, le cran du moteur, ce qui ne change pas ;
//   3. les phrases : la phrase grise, la feuille, le constat — jamais un
//      maximum.

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const F = require('./fixtures/cas-53-1-report-de-charge.json');

const norm = (t) => String(t).replace(/[  ]/g, ' ');

// ══ 1. LA FONCTION PURE, SUR LES 39 CAS ══════════════════════════════════════
//
// ⚠️ LA ZONE DE LA DERNIÈRE SÉANCE, DANS LE FICHIER, EST CELLE DE SON NIVEAU
// VALIDÉ (« zone de son niveau validé », `regle`) : la simulation de référence
// n'avait que des séances importées, sans consigne. Le test la dérive donc par
// la table du rangement (`zoneDe`) ; dans l'app, c'est la zone de la consigne
// que la séance a reçue (`zoneDeLaDerniere`, partie 2). La fonction ne lit
// cette zone que pour savoir si elle a changé.
// Le cran du fichier est un pas fixe (`pas`) : `cran(c, s)` = c ± pas.

describe('53-1 — reportDeZone, les 39 cas du fichier', () => {
  test('le fichier : 34 passages réels et 5 limites, la règle de §9.10', () => {
    expect(F.cas.length).toBe(39);
    expect(F.cas.filter((c) => /^R/.test(c.id)).length).toBe(34);
    expect(F.cas.filter((c) => /^L/.test(c.id)).length).toBe(5);
    Object.keys(F.zones).forEach((cle) => {
      const z = M.zoneParCle(cle);
      expect([cle, z.bas, z.haut]).toEqual([cle, F.zones[cle][0], F.zones[cle][1]]);
    });
  });

  F.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const L = c.seances[c.seances.length - 1];
      const zoneAvant = L ? (M.zoneDe(L.niveau) || {}).cle || null : null;
      const r = M.reportDeZone({
        seances: c.seances.map((s) => ({ debut: s.date + 'T12:00:00Z', palier: s.palier, niveau: s.niveau })),
        avant: c.jour + 'T12:00:00Z', zoneAvant, zone: c.zone_cible,
        cran: (x, s) => x + s * c.pas
      });
      const lu = r && { charge: r.charge, visee: r.visee, origine: r.origine,
        depuis: { date: r.depuis.debut.slice(0, 10), palier: r.depuis.palier, niveau: r.depuis.niveau } };
      expect(lu).toEqual(c.attendu);
    });
  });

  test('⚠️ DISCRIMINANT — la plus BASSE des deux : L37, la charge tenue est plus lourde, l’estimation l’emporte', () => {
    const c = F.cas.find((x) => x.id === 'L37');
    expect(c.attendu.origine).toBe('estimee');
    // La charge déjà tenue en Mix (100 × 6) aurait donné 100.
    expect(c.attendu.charge).toBeLessThan(100);
  });

  test('⚠️ DISCRIMINANT — 90 jours : L38, une charge tenue il y a 158 jours est ignorée', () => {
    const c = F.cas.find((x) => x.id === 'L38');
    expect(c.attendu.origine).toBe('estimee');
    expect(M.REPORT_FENETRE_JOURS).toBe(90);
  });

  test('la sortie ne porte AUCUNE estimation brute : seule la charge arrondie en sort', () => {
    const r = M.reportDeZone({ seances: [{ debut: '2026-09-01T10:00:00Z', palier: 100, niveau: 5 }],
      avant: '2026-09-08T10:00:00Z', zoneAvant: 'lourd', zone: 'mix', cran: (x, s) => x + s * 2.5 });
    expect(Object.keys(r).sort()).toEqual(['charge', 'depuis', 'origine', 'visee']);
    expect(r.charge).toBe(95);   // 97,2 estimé, au cran inférieur
  });

  test('sans cran connu en dessous : la charge reste inconnue (« le cran en dessous »), jamais inventée', () => {
    const r = M.reportDeZone({ seances: [{ debut: '2026-09-01T10:00:00Z', palier: 100, niveau: 5 }],
      avant: '2026-09-08T10:00:00Z', zoneAvant: 'lourd', zone: 'mix', cran: () => null });
    expect([r.charge, r.visee, r.origine]).toEqual([null, 6, 'estimee']);
  });

  test('vers une zone plus lourde, le cran inférieur se lit en montant : 100 × 7 → Lourd, 110 (112,1 estimé)', () => {
    const r = M.reportDeZone({ seances: [{ debut: '2026-09-01T10:00:00Z', palier: 100, niveau: 7 }],
      avant: '2026-09-08T10:00:00Z', zoneAvant: 'mix', zone: 'lourd', cran: (x, s) => x + s * 2.5 });
    expect([r.charge, r.visee]).toEqual([110, 3]);
  });

  test('ni un corps (0), ni une aide (négative) : pas de report', () => {
    const avec = (palier) => M.reportDeZone({ seances: [{ debut: '2026-09-01T10:00:00Z', palier, niveau: 5 }],
      avant: '2026-09-08T10:00:00Z', zoneAvant: 'lourd', zone: 'mix', cran: (x, s) => x + s * 2.5 });
    expect(avec(0)).toBe(null);
    expect(avec(-20)).toBe(null);
  });

  test('rien après la séance prescrite (§9.12), et une zone inconnue ne change rien', () => {
    const base = { avant: '2026-09-08T10:00:00Z', zoneAvant: 'lourd', zone: 'mix', cran: (x, s) => x + s * 2.5 };
    expect(M.reportDeZone(Object.assign({}, base, { seances: [{ debut: '2026-09-09T10:00:00Z', palier: 100, niveau: 5 }] }))).toBe(null);
    expect(M.reportDeZone(Object.assign({}, base, { zoneAvant: null, seances: [{ debut: '2026-09-01T10:00:00Z', palier: 100, niveau: 5 }] }))).toBe(null);
    expect(M.reportDeZone(Object.assign({}, base, { zone: 'x', seances: [{ debut: '2026-09-01T10:00:00Z', palier: 100, niveau: 5 }] }))).toBe(null);
  });
});

// ══ 2. LE CÂBLAGE DANS LA CONSIGNE ═══════════════════════════════════════════

let rang = 0;
const g = (debut, charge, reps, fin) => ({
  seance: { id: 'S-' + debut, debut, fin: fin === undefined ? debut.replace('T10', 'T11') : fin },
  series: reps.map((r) => ({ id: 'x' + (++rang), rang, charge_kg: charge, reps: r, rpe: null, ressenti: null,
    type_serie: 'travail', exercise_slug: 'squat' }))
});
const O = (extra) => Object.assign({ mesure: 'charge_reps', equipement: 'barre', intention: 'progresser',
  reglage: 'normal' }, extra || {});
const choix = (zone, t) => ({ correction: zone, correctionsDeZone: [{ id: '1', exercise_slug: 'squat', zone, corrigee_a: t }] });
// Trois séances en Lourd, 100 kg × 5 ; la zone choisie Mix le 10/09 au soir.
const LOURD = [g('2026-09-01T10:00:00Z', 100, [5, 5, 5]), g('2026-09-04T10:00:00Z', 100, [5, 5, 5]),
  g('2026-09-08T10:00:00Z', 100, [5, 5, 5])];
const AVANT = '2026-09-11T10:00:00Z';
const MIX_LE_10 = choix('mix', '2026-09-10T20:00:00Z');
const consigne = (groupes, extra, avant) => M.consigneDExercice(groupes, null, avant || AVANT, O(extra));

describe('53-1 — le câblage : la correction à l’étiquette (Lourd → Mix)', () => {
  test('⚠️ DISCRIMINANT — la ligne repart de la charge estimée, au bas de la zone, avec sa phrase', () => {
    const r = consigne(LOURD, MIX_LE_10);
    expect([r.consigne.etat, r.consigne.zone, r.consigne.ligne, r.consigne.haut])
      .toEqual(['nouvelle_zone', 'mix', { charge: 95, vise: 6 }, null]);
    expect(r.consigne.fondement.report).toEqual({ origine: 'estimee', zoneAvant: 'lourd',
      depuis: { date: '2026-09-08T10:00:00Z', palier: 100, niveau: 5 } });
    expect(norm(r.libelles.gris)).toBe('Nouvelle zone : Mix. Estimée depuis ton 100 kg × 5, un peu en dessous pour démarrer.');
    expect(r.libelles.jaune.map(norm)).toEqual(['95 kg × 6']);
    // Avant 53-1 : 100 kg × 6 — le palier gardé, une rep de plus (le relevé du 05/10).
  });

  test('la charge déjà tenue en Mix, plus basse que l’estimation : elle l’emporte, datée', () => {
    const r = consigne([g('2026-08-20T10:00:00Z', 90, [7, 7, 7])].concat(LOURD), MIX_LE_10);
    expect([r.consigne.etat, r.consigne.ligne]).toEqual(['nouvelle_zone', { charge: 90, vise: 6 }]);
    expect(r.consigne.fondement.report.origine).toBe('tenue');
    expect(norm(r.libelles.gris)).toBe('Nouvelle zone : Mix. Ta charge déjà tenue en Mix, le 20 août : 90 kg × 7.');
  });

  test('⚠️ DISCRIMINANT — sans changement de zone, rien ne change (la consigne d’avant 53-1)', () => {
    const r = consigne(LOURD, {});
    expect([r.consigne.etat, r.consigne.zone, r.consigne.ligne]).toEqual(['test_propose', 'lourd', { charge: 100, vise: 5 }]);
  });

  test('⚠️ DISCRIMINANT — la zone choisie PENDANT la dernière séance est la sienne : pas de second report', () => {
    // Choisie Mix le 08/09 à 10 h 30, pendant la séance (10 h – 11 h) : elle
    // s'est faite en Mix. Lue à son début, la séance d'après reporterait encore.
    const r = consigne(LOURD, choix('mix', '2026-09-08T10:30:00Z'));
    expect([r.consigne.etat, r.consigne.zone, r.consigne.ligne]).toEqual(['progression', 'mix', { charge: 100, vise: 6 }]);
  });

  test('la séance d’après progresse normalement : une rep de plus', () => {
    const faite = LOURD.concat([g('2026-09-11T10:00:00Z', 95, [6, 6, 6])]);
    const r = consigne(faite, MIX_LE_10, '2026-09-14T10:00:00Z');
    expect([r.consigne.etat, r.consigne.zone, r.consigne.ligne]).toEqual(['progression', 'mix', { charge: 95, vise: 7 }]);
  });

  test('le compteur repart à zéro (§12.2 bis, déjà câblé) : 1 sans le changement, 0 avec', () => {
    const sous = { seancesSousConsigne: LOURD.map((x) => x.seance.id) };
    expect(consigne(LOURD, sous).compteur.compteur).toBe(1);
    expect(consigne(LOURD, Object.assign({}, sous, MIX_LE_10)).compteur.compteur).toBe(0);
  });

  test('⚠️ DISCRIMINANT — le cran est celui du moteur : un pas de salle de 5 kg donne 90, pas 92,5', () => {
    const pas5 = [80, 85, 90, 95].map((c, i) => g('2026-08-' + (10 + 3 * i) + 'T10:00:00Z', c, [5, 5, 5]))
      .concat([g('2026-09-08T10:00:00Z', 100, [4, 4, 4])]);
    const r = consigne(pas5, MIX_LE_10);
    // 100 × 4 → Mix : 94,4 estimé ; le pas de la salle (80, 85, 90, 95, 100) est de 5.
    expect([r.consigne.etat, r.consigne.ligne]).toEqual(['nouvelle_zone', { charge: 90, vise: 6 }]);
    // Sans cet historique, le repli de la barre (2,5) : 92,5.
    const seul = [g('2026-09-01T10:00:00Z', 100, [4, 4, 4]), g('2026-09-08T10:00:00Z', 100, [4, 4, 4])];
    expect(consigne(seul, MIX_LE_10).consigne.ligne).toEqual({ charge: 92.5, vise: 6 });
  });

  test('sans cran connu (matériel inconnu, aucune charge plus basse) : « le cran en dessous », sans chiffre', () => {
    const r = consigne(LOURD, Object.assign({ equipement: null }, MIX_LE_10));
    expect(r.consigne.ligne).toEqual({ charge: null, vise: 6 });
    expect(r.libelles.jaune.map(norm)).toEqual(['Le cran en dessous × 6']);
  });

  test('vers une zone plus lourde (Mix → Lourd) : l’estimation au cran inférieur, au bas de Lourd', () => {
    const mix = [g('2026-09-01T10:00:00Z', 100, [7, 7, 7]), g('2026-09-04T10:00:00Z', 100, [7, 7, 7]),
      g('2026-09-07T10:00:00Z', 100, [7, 7, 7])];
    const r = consigne(mix, choix('lourd', '2026-09-10T20:00:00Z'));
    expect([r.consigne.etat, r.consigne.zone, r.consigne.ligne]).toEqual(['nouvelle_zone', 'lourd', { charge: 110, vise: 3 }]);
    // 53-1 bis (delta Z3) — la charge monte : la phrase le dit.
    expect(norm(r.libelles.gris)).toBe('Nouvelle zone : Lourd. Moins de reps, plus de charge : estimée depuis ton 100 kg × 7.');
  });
});

describe('53-1 — ce qui ne change pas : la reprise, le corps, l’aide, le lest', () => {
  test('la reprise prime (§9.9) : après une coupure, pas de report', () => {
    const vieilles = [g('2026-07-01T10:00:00Z', 100, [5, 5, 5]), g('2026-07-04T10:00:00Z', 100, [5, 5, 5]),
      g('2026-07-08T10:00:00Z', 100, [5, 5, 5])];
    expect(consigne(vieilles, MIX_LE_10).consigne.etat).toBe('reprise_courte');
  });

  test('le poids du corps : la règle de §9.17, sans report (aucune masse à estimer)', () => {
    const corps = LOURD.map((x) => ({ seance: x.seance, series: x.series.map((s) => Object.assign({}, s, { charge_kg: null })) }));
    const r = consigne(corps, Object.assign({ mesure: 'reps', equipement: null }, MIX_LE_10));
    expect([r.consigne.etat, r.consigne.ligne]).toEqual(['progression', { charge: 0, vise: 6 }]);
  });

  test('une aide : pas de report (une charge négative n’est pas une masse levée)', () => {
    const aide = LOURD.map((x) => ({ seance: x.seance, series: x.series.map((s) => Object.assign({}, s, { charge_kg: -20 })) }));
    const r = consigne(aide, Object.assign({ equipement: 'machine' }, MIX_LE_10));
    expect([r.consigne.etat, r.consigne.ligne]).toEqual(['progression', { charge: -20, vise: 6 }]);
  });

  test('un lest : pas de report (la charge saisie n’est pas la masse levée, le corps n’y est pas)', () => {
    const r = consigne(LOURD, Object.assign({ equipement: 'lest' }, MIX_LE_10));
    expect([r.consigne.etat, r.consigne.ligne]).toEqual(['progression', { charge: 100, vise: 6 }]);
  });
});

// ══ 3. LES PHRASES ═══════════════════════════════════════════════════════════

describe('53-1 — les phrases : d’où vient la charge, jamais un maximum', () => {
  const MAX = /\b1\s?RM\b|\bmax(?:imum|imale?)?\b|\bmaximaux\b/i;

  test('la feuille « Pourquoi » : l’état, sans l’estimation', () => {
    const e = consigne(LOURD, MIX_LE_10);
    expect(norm(M.pourquoiConsigne(e.consigne, 'normal', AVANT).etat)).toBe(
      'Ta zone passe de Lourd à Mix : j\'estime ta charge depuis 100 kg × 5, et je la prends un peu en dessous ' +
      'pour démarrer. On vise le bas de ta zone, 6 reps ; la progression reprend à la séance suivante.');
    const t = consigne([g('2026-08-20T10:00:00Z', 90, [7, 7, 7])].concat(LOURD), MIX_LE_10);
    expect(norm(M.pourquoiConsigne(t.consigne, 'normal', AVANT).etat)).toBe(
      'Ta zone passe de Lourd à Mix : je reprends la charge que tu y as déjà tenue, 90 kg × 7, plutôt qu\'une ' +
      'estimation. On vise le bas de ta zone, 6 reps ; la progression reprend à la séance suivante.');
  });

  test('⚠️ aucune phrase ne dit un maximum (« 1RM », « max ») : l’estimation reste en coulisse', () => {
    const textes = [];
    [LOURD, [g('2026-08-20T10:00:00Z', 90, [7, 7, 7])].concat(LOURD)].forEach((gs) => {
      const r = consigne(gs, MIX_LE_10);
      textes.push(r.libelles.gris, ...r.libelles.jaune);
      const p = M.pourquoiConsigne(r.consigne, 'normal', AVANT);
      Object.keys(p).forEach((k) => { if (typeof p[k] === 'string') textes.push(p[k]); });
    });
    expect(textes.filter((t) => MAX.test(norm(t)))).toEqual([]);
    expect(MAX.test('ton max estimé')).toBe(true);
    expect(MAX.test('ton 1RM')).toBe(true);
  });

  // 53-1 bis (delta Z3) — LE MILITAIRE REJOUÉ (séance du 01/10) : 52,5 kg × 10
  // en Volume, la zone choisie Mix. Le report MONTE (58,3 estimé, 57,5 au
  // cran) : « un peu en dessous pour démarrer » sonnerait faux.
  const MILITAIRE = [g('2026-09-20T10:00:00Z', 52.5, [10, 10, 10, 10]), g('2026-09-24T10:00:00Z', 52.5, [10, 10, 10, 10]),
    g('2026-09-27T10:00:00Z', 52.5, [10, 10, 10, 10])];
  const MIX_LE_30 = choix('mix', '2026-09-30T20:00:00Z');
  const AVANT_MIL = '2026-10-01T10:00:00Z';

  test('⚠️ DISCRIMINANT — le militaire rejoué : la charge monte, « Moins de reps, plus de charge »', () => {
    const r = consigne(MILITAIRE, MIX_LE_30, AVANT_MIL);
    expect([r.consigne.etat, r.consigne.zone, r.consigne.palier, r.consigne.ligne])
      .toEqual(['nouvelle_zone', 'mix', 52.5, { charge: 57.5, vise: 6 }]);
    expect(norm(r.libelles.gris)).toBe('Nouvelle zone : Mix. Moins de reps, plus de charge : estimée depuis ton 52,5 kg × 10.');
    expect(norm(M.pourquoiConsigne(r.consigne, 'normal', AVANT_MIL).etat)).toBe(
      'Ta zone passe de Volume à Mix : j\'estime ta charge depuis 52,5 kg × 10 : moins de reps, plus de charge. ' +
      'On vise le bas de ta zone, 6 reps ; la progression reprend à la séance suivante.');
  });

  test('⚠️ « un peu en dessous » ne se dit jamais d’une charge qui monte, et se dit toujours d’une charge qui baisse', () => {
    const lus = [[MILITAIRE, MIX_LE_30, AVANT_MIL], [LOURD, MIX_LE_10, AVANT],
      [[g('2026-09-01T10:00:00Z', 100, [7, 7, 7]), g('2026-09-04T10:00:00Z', 100, [7, 7, 7]),
        g('2026-09-07T10:00:00Z', 100, [7, 7, 7])], choix('lourd', '2026-09-10T20:00:00Z'), AVANT]];
    const sens = lus.map(([gs, o, av]) => {
      const r = consigne(gs, o, av);
      const textes = [r.libelles.gris, M.pourquoiConsigne(r.consigne, 'normal', av).etat].map(norm);
      return [r.consigne.ligne.charge > r.consigne.palier, textes.every((t) => /un peu en dessous/.test(t)),
        textes.every((t) => /plus de charge/.test(t))];
    });
    expect(sens).toEqual([[true, false, true], [false, true, false], [true, false, true]]);
  });

  test('le constat de la première séance d’une nouvelle zone : un repère, pas un verdict contre l’ancienne', () => {
    const avant = consigne(LOURD, MIX_LE_10);
    const faite = LOURD.concat([g('2026-09-11T10:00:00Z', 95, [6, 6, 6])]);
    const apres = consigne(faite, MIX_LE_10, '2026-09-11T12:00:00Z');
    const c = M.constatDe(avant.consigne, apres.consigne, 'normal', 97.5, '2026-09-11T12:00:00Z');
    expect(norm(c.verdict)).toBe('Premier repère en Mix : 95 kg × 6, 6, 6.');
  });
});
