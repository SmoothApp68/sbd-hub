/** @jest-environment node */
//
// 50-1 — LE POIDS DU CORPS, L'AIDE ET LE LEST (MOTEUR §9.17, delta 49-41).
//
// Le poids du corps (`mesure = reps`) suit EXACTEMENT la consigne des charges,
// la charge valant 0. Seule différence : quand la consigne proposerait un test
// et qu'aucun cran n'existe, c'est soit la CARTE DU LEST (les deux dernières
// séances au haut de la zone, aucune réponse : une fois, sans point
// d'interrogation), soit l'ÉTIREMENT des reps (au-delà de la zone, sans ligne
// haute). Le lesté démarre à 2,5 kg au bas de la zone. L'aide se tape en
// positif, se range en négatif, s'affiche « Aide X kg » ; dessus : ni chauffes,
// ni dégressive, ni repli, ni seconde charge, ni double saut. Entretenir se
// choisit aussi par exercice (`modes_exercice`) et se comporte EXACTEMENT comme
// celui du profil (I13).
//
// LE FICHIER DE CAS FAIT FOI. `cas-50-1-poids-du-corps.json` sort de
// `coach49.py` (Claude.ai, 03/10/2026). Un cas qui semble faux se rapporte ; il
// ne se corrige pas ici — d'où l'empreinte du fichier, vérifiée en tête.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
const P = require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Attente = require('../../v2/js/attente.js');

const CHEMIN = path.join(__dirname, 'fixtures', 'cas-50-1-poids-du-corps.json');
const F = JSON.parse(fs.readFileSync(CHEMIN, 'utf8'));
const NB = String.fromCharCode(160);   // l'espace insécable du formateur
const norm = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');

// ── Les aides à la lecture ──────────────────────────────────────────────────
const forme = (k) => {
  const z = M.zoneParCle(k.zone);
  return { zone: z === null ? null : [z.cle, z.bas, z.haut], etat: k.etat,
    ligne: k.ligne ? [k.ligne.charge, k.ligne.vise] : null,
    haut: k.haut ? [k.haut.charge, k.haut.vise, k.haut.k] : null };
};
const cas = (id) => F.cas.filter((c) => c.id === id)[0];

// Les séances d'un cas, telles que l'APP les a : des séries BRUTES, sans charge
// (`charge_kg` NULL en base sur un exercice en `reps`) — le moteur les lit à 0.
function brutesDe(c, slug) {
  let rang = 0;
  return c.seances.map((s, i) => ({
    seance: { id: 'S' + i, debut: s.debut },
    series: s.series.map((x) => ({
      id: 'b' + i + '-' + (++rang), rang: rang, charge_kg: null, reps: x.reps,
      rpe: x.rpe === undefined ? null : x.rpe, ressenti: null, type_serie: 'travail',
      exercise_slug: slug || 'pompes'
    }))
  }));
}
const OPTIONS_REPS = { mesure: 'reps', equipement: null, intention: 'progresser',
  reglage: 'normal', lestPossible: true, lestReponse: null };
const consigneDeCas = (c, extra, slug) => M.consigneDExercice(brutesDe(c, slug), undefined, c.avant,
  Object.assign({}, OPTIONS_REPS, { lestReponse: c.lest_reponse }, extra || {}));

// ── Le plan d'une séance ────────────────────────────────────────────────────
// `exos` : [{ slug, consigne, mesure, leste, equipement, travail, chauffes, degressives }]
function seanceDe(exos) {
  let n = 0;
  const id = () => 's' + (++n);
  let se = S.creer({ id: 'S1', userId: 'u', idSerie: id });
  exos.forEach((e, i) => {
    se = S.ajouterExercice(se, e.slug, id, { series: e.travail === undefined ? 3 : e.travail });
    if (e.chauffes) se = S.insererChauffes(se, i, e.chauffes.map((r) => [0, r]), id);
    (e.degressives || []).forEach(() => {
      se = S.ajouterSerie(se, i, id);
      const j = se.exercices[i].series.findIndex((x) => x.id === 's' + n);
      se = S.changerType(se, i, j, 'degressive');
    });
  });
  return se;
}

function entreesDe(exos, extra, debut) {
  const se = seanceDe(exos);
  const cs = {}, cat = {};
  exos.forEach((e) => {
    cs[e.slug] = e.consigne || null;
    cat[e.slug] = { equipement: e.equipement === undefined ? null : e.equipement,
      muscles_primaires: ['dos'], mesure: e.mesure === undefined ? null : e.mesure,
      leste: e.leste === undefined ? null : e.leste };
  });
  return Object.assign({
    seance: { id: 'S1', debut: debut || '2026-10-04T10:00:00+00:00', edition: false, exercices: se.exercices },
    consignes: cs, catalogue: cat, reglage: null, paris: [], suites: {},
    intention: 'progresser', modes: {}, lestReponse: null
  }, extra || {});
}
const erreurs = (plan, entrees) => T.verifierPlan(plan, entrees).erreurs;
const clone = (o) => JSON.parse(JSON.stringify(o));

// Une aide : une machine assistée, charge négative (la convention de la base).
function aideDe(kg, reps, jours) {
  let rang = 0;
  const debut = (d) => new Date(Date.parse('2026-10-04T10:00:00Z') - d * 86400000).toISOString();
  return jours.map((d, i) => ({
    seance: { id: 'A' + i, debut: debut(d) },
    series: [0, 1, 2].map(() => ({ id: 'a' + (++rang), rang: rang, charge_kg: kg[i], reps: reps[i],
      rpe: null, ressenti: null, type_serie: 'travail', exercise_slug: 'tractions_assistees' }))
  }));
}
const OPTIONS_AIDE = { mesure: 'charge_reps', equipement: 'machine', intention: 'progresser',
  reglage: 'normal', lestPossible: false, lestReponse: null };
const AVANT_AIDE = '2026-10-04T10:00:00Z';

// ═══ 0. LE FICHIER DE CAS N'EST PAS RETOUCHÉ ════════════════════════════════
describe('le fichier de cas', () => {
  test('son empreinte est celle du fichier reçu de Claude.ai', () => {
    const h = crypto.createHash('sha256').update(fs.readFileSync(CHEMIN)).digest('hex');
    expect(h).toBe('1afe8ef3dffc7209c940e86c00653b2b4ab62080c26bcafd1fff62c5d949d998');
  });
  test('treize cas, les quatre listes', () => {
    expect(F.cas).toHaveLength(13);
    expect(F.depart_leste).toHaveLength(3);
    expect(F.aide).toHaveLength(4);
    expect(F.regles_sans_aide).toEqual(['chauffes', 'degressive', 'repli', 'seconde_charge', 'double_saut']);
  });
});

// ═══ 1. LES TREIZE CAS ═════════════════════════════════════════════════════
describe('50-1 — les 13 cas : le poids du corps suit la consigne des charges, la charge valant 0', () => {
  F.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre + ' : ' + c.attendu.etat, () => {
      const k = M.consignePour(c.seances, c.avant,
        { reglage: 'normal', equipement: c.equipement, correction: null, lestReponse: c.lest_reponse });
      const a = c.attendu;
      expect(forme(k)).toEqual({ zone: a.zone, etat: a.etat, ligne: a.ligne, haut: a.haut });
      // La carte du lest : présente quand le cas la dit, absente sinon.
      expect(!!(k.fondement && k.fondement.carteLest)).toBe(a.carte === true);
    });

    test(c.id + ' — la même chose depuis les séries BRUTES de l\'app (charge NULL)', () => {
      const r = consigneDeCas(c);
      const a = c.attendu;
      expect(forme(r.consigne)).toEqual({ zone: a.zone, etat: a.etat, ligne: a.ligne, haut: a.haut });
      expect(r.consigne.palier).toBe(0);
    });
  });

  test('l\'en-tête dit « Poids du corps × N », par le formateur — jamais « 0 kg »', () => {
    const r = consigneDeCas(cas('B007'));
    expect(r.consigne.etat).toBe('progression');
    expect(r.libelles.jaune.map(norm)).toEqual(['Poids du corps × 9']);
    expect(JSON.stringify(r.libelles)).not.toMatch(/0\s*kg/);
  });

  test('un test sans cran : jamais de ligne haute, jamais « le cran au-dessus »', () => {
    ['B003', 'B004', 'B005', 'B006', 'B010', 'B011'].forEach((id) => {
      const r = consigneDeCas(cas(id));
      expect(r.consigne.haut).toBeNull();
      expect(JSON.stringify(r.libelles)).not.toMatch(/cran/);
    });
  });

  test('l\'étirement monte AU-DELÀ de la zone : 21 reps sur une zone qui s\'arrête à 12', () => {
    const r = consigneDeCas(cas('B004'));
    expect(r.consigne.etat).toBe('etirement_reps');
    expect(r.consigne.ligne.vise).toBeGreaterThan(r.consigne.niveau);
    expect(r.consigne.ligne.vise).toBeGreaterThan(M.zoneParCle(r.consigne.zone).haut);
    expect(norm(r.libelles.jaune.join(' '))).toMatch(/^Poids du corps × 21/);
  });

  test('la voix (§20.2) : ni « ? », ni « palier », ni « 0 kg » dans ce que le coach dit', () => {
    F.cas.forEach((c) => {
      const r = consigneDeCas(c);
      const dit = JSON.stringify([r.libelles, r.consigne.fondement && r.consigne.fondement.carteLest]);
      expect(dit).not.toMatch(/\?/);
      expect(dit).not.toMatch(/palier/i);
      expect(dit).not.toMatch(/0\skg|0 kg/);
    });
  });
});

// ═══ 2. LE LESTÉ DÉMARRE À 2,5 KG AU BAS DE LA ZONE (§8.4) ═════════════════
describe('50-1 — le départ de la version lestée', () => {
  const libreDe = (zone) => () => ({ groupes: brutesDe(cas('B007'), 'tractions'), etat: undefined,
    options: { mesure: 'reps', equipement: null, reglage: 'normal', correction: zone } });

  F.depart_leste.forEach((d) => {
    test(d.zone[0] + ' (' + d.zone[1] + ' à ' + d.zone[2] + ') : ' + d.attendu.jaune, () => {
      const r = M.consigneDExercice([], undefined, cas('B007').avant, { mesure: 'charge_reps',
        equipement: M.EQUIPEMENT_LEST, intention: 'progresser', reglage: 'normal',
        libre: libreDe(d.zone[0]) });
      expect(r.consigne.ligne).toEqual({ charge: d.attendu.ligne[0], vise: d.attendu.ligne[1] });
      expect(r.consigne.zone).toBe(d.zone[0]);
      expect(r.libelles.jaune.map(norm)).toEqual([norm(d.attendu.jaune)]);
    });
  });

  test('sans exercice libre derrière lui, il reste « première fois ici » (rien d\'inventé)', () => {
    const r = M.consigneDExercice([], undefined, cas('B007').avant, { mesure: 'charge_reps',
      equipement: M.EQUIPEMENT_LEST, intention: 'progresser', reglage: 'normal', libre: null });
    expect(r.consigne.etat).toBe('silence');
    const sansHistoire = M.consigneDExercice([], undefined, cas('B007').avant, { mesure: 'charge_reps',
      equipement: M.EQUIPEMENT_LEST, intention: 'progresser', reglage: 'normal',
      libre: () => ({ groupes: [], etat: undefined, options: { mesure: 'reps', equipement: null, reglage: 'normal' } }) });
    expect(sansHistoire.consigne.etat).toBe('silence');
  });

  test('le cran du lest est 2,5 kg, écrit à UN seul endroit', () => {
    expect(M.SAUT_LEST).toBe(2.5);
    expect(M.equipementEffectif({ charge: 'ajoutee', equipement: 'aucun' })).toBe('lest');
    expect(M.equipementEffectif({ charge: 'externe', equipement: 'barre' })).toBe('barre');
    expect(M.equipementEffectif(null)).toBeNull();
  });
});

// ═══ 3. LA CARTE DU LEST : SES TEXTES ══════════════════════════════════════
describe('50-1 — la carte du lest', () => {
  test('titre, détail et deux boutons, par le formateur', () => {
    const a = F.carte_lest.attendu;
    expect(M.carteLestTitre(F.carte_lest.entree)).toBe(a.titre);
    expect(M.carteLestDetail(F.carte_lest.entree)).toBe(a.detail);
    expect(M.OUI_LEST).toBe(a.oui);
    expect(M.NON_LEST).toBe(a.non);
    expect(a.titre + a.detail).not.toMatch(/\?/);
  });

  test('UNE SEULE carte par séance, même quand deux exercices sont au haut', () => {
    // Deux exercices au haut de leur zone le même jour (la même histoire, deux noms).
    const c3 = consigneDeCas(cas('B003'), null, 'pompes'), c5 = consigneDeCas(cas('B003'), null, 'releve');
    expect(c3.consigne.etat).toBe('carte_lest');
    expect(c5.consigne.etat).toBe('carte_lest');
    const e = entreesDe([
      { slug: 'pompes', consigne: c3, mesure: 'reps', leste: 'pompes_lestees' },
      { slug: 'releve', consigne: c5, mesure: 'reps', leste: 'releve_lestes' }], null, cas('B003').avant);
    const plan = T.planDeSeance(e);
    const cartes = plan.exercices.map((x) => x.carteLest).filter(Boolean);
    expect(cartes).toHaveLength(1);
    expect(plan.exercices[0].carteLest).toBeTruthy();
    expect(plan.exercices[1].carteLest).toBeNull();
    expect(plan.exercices[0].carteLest.oui).toBe('J’ai du lest');
    expect(plan.exercices[0].carteLest.non).toBe('Pas de lest');
    expect(plan.exercices[0].carteLest.leste).toBe('pompes_lestees');
    expect(erreurs(plan, e)).toEqual([]);
  });

  test('pas de version lestée au catalogue : pas de carte, les reps continuent', () => {
    const c = consigneDeCas(cas('B003'), { lestPossible: false });
    expect(c.consigne.etat).toBe('etirement_reps');
    expect(c.consigne.fondement.carteLest).toBeUndefined();
  });

  test('« J’ai du lest » ou « Pas de lest » : la carte ne revient PLUS — ni la consigne, ni le plan', () => {
    ['oui', 'non'].forEach((rep) => {
      const c = consigneDeCas(cas('B003'), { lestReponse: rep });
      expect(c.consigne.etat).toBe('etirement_reps');
      const e = entreesDe([{ slug: 'pompes', consigne: c, mesure: 'reps', leste: 'pompes_lestees' }],
        { lestReponse: rep }, cas('B003').avant);
      const plan = T.planDeSeance(e);
      expect(plan.lestReponse).toBe(rep);
      expect(plan.exercices[0].carteLest).toBeNull();
      expect(erreurs(plan, e)).toEqual([]);
    });
  });

  test('⚠️ DISCRIMINANT — une seule séance au haut de la zone : l\'étirement, PAS la carte', () => {
    // Zone Mix choisie (6 à 8), le haut est 8. La fixture doit VRAIMENT atteindre le
    // chemin du test sans cran : la dernière séance est au haut (8), donc le
    // moteur voudrait tester le cran au-dessus. Avec une seule séance au haut, la
    // carte ne se pose pas ; avec deux, elle se pose (le témoin, juste dessous).
    const jour = (j) => new Date(Date.parse('2026-10-04T10:00:00Z') - j * 86400000).toISOString();
    const seance = (j, reps) => ({ debut: jour(j), palier: 0, neutre: false,
      series: reps.map((r) => ({ charge_kg: 0, reps: r, rpe: null, role: 'palier', origine: 'palier' })) });
    const OPT = { reglage: 'normal', equipement: 'aucun', correction: 'mix', lestReponse: null };
    const AVANT = '2026-10-04T10:00:00Z';
    const deux = M.consignePour([seance(28, [6, 6, 6]), seance(21, [7, 7, 7]), seance(14, [8, 8, 8]), seance(7, [8, 8, 8])], AVANT, OPT);
    expect([deux.etat, deux.fondement.carteLest.niveaux]).toEqual(['carte_lest', [8, 8]]);
    const une = M.consignePour([seance(28, [6, 6, 6]), seance(21, [6, 6, 6]), seance(14, [7, 7, 7]), seance(7, [8, 8, 8])], AVANT, OPT);
    expect(une.niveau).toBe(8);
    expect(une.etat).toBe('etirement_reps');
    expect(une.fondement.carteLest).toBeUndefined();
    expect(une.ligne).toEqual({ charge: 0, vise: 9 });
  });
});

// ═══ 4. L'AIDE : SE TAPE EN POSITIF, SE RANGE EN NÉGATIF, S'AFFICHE « AIDE » ══
describe('50-1 — l\'aide', () => {
  F.aide.forEach((a) => {
    test('« ' + a.saisie + ' » → ' + a.stockee + ' → « ' + a.affichee + ' »', () => {
      expect(Mo.rangerAide(a.saisie)).toBe(a.stockee);
      expect(Mo.rangerAide(String(a.saisie).replace('.', ','))).toBe(a.stockee);
      expect(Mo.aideAffichee(a.stockee)).toBe(a.saisie);
      expect(Mo.formatMesure({ charge_kg: a.stockee })).toBe(a.affichee);
    });
  });

  test('UNE seule fonction range : idempotente, tous les signes moins, zéro sans signe, vide = null', () => {
    expect(Mo.rangerAide('-22,5')).toBe(-22.5);
    expect(Mo.rangerAide('−22,5')).toBe(-22.5);
    expect(Mo.rangerAide(-22.5)).toBe(-22.5);
    expect(Mo.rangerAide(0)).toBe(0);
    expect(Object.is(Mo.rangerAide('0'), 0)).toBe(true);
    expect(Mo.rangerAide('')).toBeNull();
    expect(Mo.rangerAide(null)).toBeNull();
    expect(Mo.rangerAide('abc')).toBeNull();
    expect(Mo.aideAffichee(null)).toBeNull();
  });

  test('la colonne s\'appelle « AIDE (KG) » ou « LEST (KG) » : la nature de la charge, pas la mesure', () => {
    const aide = Mo.gabaritDe({ mesure: 'charge_reps', charge: 'assistance' });
    const lest = Mo.gabaritDe({ mesure: 'charge_reps', charge: 'ajoutee' });
    const barre = Mo.gabaritDe({ mesure: 'charge_reps', charge: 'externe' });
    expect(aide.nature).toBe('aide');
    expect(aide.entetes.charge_kg).toBe('AIDE (KG)');
    expect(lest.nature).toBe('lest');
    expect(lest.entetes.charge_kg).toBe('LEST (KG)');
    expect(barre.nature).toBeUndefined();
    expect(aide.mesure).toBe('charge_reps');
    // Mesure inconnue : on ne nomme pas ce qu'on ne connaît pas.
    expect(Mo.gabaritDe({ mesure: 'inconnue', charge: 'assistance' }).nature).toBeUndefined();
  });

  test('la colonne PRÉC. d\'une aide se lit sans signe, sous l\'en-tête qui dit « Aide »', () => {
    expect(Mo.formatPrecedent({ charge_kg: -22.5, reps: 8 }, 'charge_reps', 'aide')).toBe('22,5×8');
    expect(Mo.formatPrecedent({ charge_kg: 60, reps: 8 }, 'charge_reps')).toBe('60×8');
  });

  test('un journal dit « Aide 22,5 kg × 8 », jamais « −22,5 kg »', () => {
    expect(norm(Mo.formatMesure({ charge_kg: -22.5, reps: 8 }))).toBe('Aide 22,5 kg × 8');
    expect(Mo.formatMesure({ charge_kg: -22.5, reps: 8 })).not.toMatch(/[−-]\s?22/);
  });

  test('le poids du corps s\'écrit « Poids du corps », jamais « 0 kg »', () => {
    expect(Mo.charge(0)).toBe('Poids du corps');
    expect(Mo.charge(-25)).toBe('Aide 25' + NB + 'kg');
    expect(Mo.charge(60)).toBe('60' + NB + 'kg');
  });
});

// ═══ 5. SUR UNE AIDE : NI CHAUFFES, NI DÉGRESSIVE, NI REPLI, NI SECONDE CHARGE, NI DOUBLE SAUT ═══
describe('50-1 — les cinq règles coupées sur une aide (regles_sans_aide)', () => {
  const histoire = () => aideDe([-30, -27.5, -25, -25], [8, 12, 12, 12], [28, 21, 14, 7]);
  const consigne = (opts, g) => M.consigneDExercice(g || histoire(), undefined, AVANT_AIDE, Object.assign({}, OPTIONS_AIDE, opts || {}));

  test('le fichier liste ces cinq règles, et pas une de plus', () => {
    expect(F.regles_sans_aide).toHaveLength(5);
  });

  test('chauffes et dégressive : le plan n\'en pose ni sur la ligne, ni en proposition', () => {
    const c = consigne();
    expect(c.consigne.palier).toBe(-25);
    const exos = [{ slug: 'tractions_assistees', consigne: c, mesure: 'charge_reps', equipement: 'machine',
      chauffes: [10, 6], degressives: [1] }];
    const e = entreesDe(exos, null, AVANT_AIDE);
    const plan = T.planDeSeance(e);
    const x = plan.exercices[0];
    expect(x.chauffes).toBeFalsy();
    expect(x.proposition).toBeFalsy();
    expect(x.degressive).toBeFalsy();
    x.lignes.forEach((l) => { expect(l.chauffe || null).toBeNull(); expect(l.degressive || null).toBeNull(); });
    expect(erreurs(plan, e)).toEqual([]);
    // Le contraste : le même historique en positif, sur une machine, a ses chauffes.
    const pos = consigne({ equipement: 'machine' }, aideDe([30, 32.5, 35, 35], [8, 12, 12, 12], [28, 21, 14, 7]));
    const ep = entreesDe([{ slug: 'tractions_assistees', consigne: pos, mesure: 'charge_reps', equipement: 'machine',
      chauffes: [10, 6], degressives: [1] }], null, AVANT_AIDE);
    const xp = T.planDeSeance(ep).exercices[0];
    expect(!!(xp.chauffes || xp.proposition || xp.degressive)).toBe(true);
  });

  test('repli : jamais de marche « repli » sur une aide ; au poids du corps, ni repli ni schéma', () => {
    // Un exercice en blocage (compteur 4 à 7, deux séances) : la marche est « repli ».
    expect(M.marcheIsolee(2, 'volume', 'maintien', false, true, 25)).toBe(M.MARCHE_REPLI);
    expect(M.marcheIsolee(2, 'volume', 'maintien', false, true, -25)).toBe(M.MARCHE_SILENCE);
    expect(M.marcheIsolee(2, 'volume', 'maintien', false, true, 0)).toBe(M.MARCHE_SILENCE);
    // Le schéma, en zone de force : une carte sur une charge ; pas sur un corps.
    expect(M.marcheIsolee(1, 'lourd', 'maintien', false, false, 100)).toBe(M.MARCHE_SCHEMA);
    expect(M.marcheIsolee(1, 'lourd', 'maintien', false, false, 0)).toBe(M.MARCHE_SILENCE);
  });

  test('repli de reprise longue : une aide garde sa charge de travail', () => {
    const longue = aideDe([-30, -27.5, -25, -25], [8, 12, 12, 12], [150, 143, 136, 129]);
    const c = M.consigneDExercice(longue, undefined, AVANT_AIDE, Object.assign({}, OPTIONS_AIDE));
    expect(c.consigne.etat).toBe('reprise_longue');
    expect(c.consigne.ligne.charge).toBe(c.consigne.palier);
    // Le contraste : la même absence sur une barre rend un repli (une charge plus basse).
    const barre = aideDe([100, 102.5, 105, 105], [8, 12, 12, 12], [150, 143, 136, 129]);
    const b = M.consigneDExercice(barre, undefined, AVANT_AIDE, Object.assign({}, OPTIONS_AIDE, { equipement: 'barre' }));
    expect(b.consigne.etat).toBe('reprise_longue');
    expect(b.consigne.ligne.charge).toBeLessThan(b.consigne.palier);
  });

  test('seconde charge : le contexte de la réaction ne propose pas « ou 130 kg » sur une aide', () => {
    const c = consigne();
    expect(c.contexte.haut).toBeNull();
    const pos = consigne({ equipement: 'barre' }, aideDe([100, 102.5, 105, 105], [8, 12, 12, 12], [28, 21, 14, 7]));
    expect(pos.contexte.cran).not.toBeNull();
  });

  test('double saut : le réglage « franc » ne prend pas deux crans d\'aide en moins', () => {
    const forts = aideDe([-30, -27.5, -25, -25], [8, 14, 15, 15], [28, 21, 14, 7]);
    const normal = M.consigneDExercice(forts, undefined, AVANT_AIDE, Object.assign({}, OPTIONS_AIDE, { reglage: 'normal' }));
    const franc = M.consigneDExercice(forts, undefined, AVANT_AIDE, Object.assign({}, OPTIONS_AIDE, { reglage: 'franc' }));
    expect(franc.consigne.haut).toEqual(normal.consigne.haut);
    expect(franc.consigne.fondement.preuve).toBeUndefined();
  });
});

// ═══ 6. LES INVARIANTS I28 À I31 ET I13 — ET LEURS VIOLATIONS FORGÉES ═══════
describe('50-1 — les invariants du poids du corps, de la carte, de l\'aide, d\'Entretenir', () => {
  const planPdc = (extra, exoExtra) => {
    const c = consigneDeCas(cas('B007'), null, 'tractions');
    const e = entreesDe([Object.assign({ slug: 'tractions', consigne: c, mesure: 'reps', leste: 'tractions_lestees' }, exoExtra || {})], extra, cas('B007').avant);
    return { e, plan: T.planDeSeance(e), c };
  };
  const planCarte = () => {
    const c = consigneDeCas(cas('B003'));
    const e = entreesDe([{ slug: 'pompes', consigne: c, mesure: 'reps', leste: 'pompes_lestees' }], null, cas('B003').avant);
    return { e, plan: T.planDeSeance(e) };
  };
  const planAide = () => {
    const c = M.consigneDExercice(aideDe([-30, -27.5, -25, -25], [8, 12, 12, 12], [28, 21, 14, 7]),
      undefined, AVANT_AIDE, OPTIONS_AIDE);
    const e = entreesDe([{ slug: 'tractions_assistees', consigne: c, mesure: 'charge_reps', equipement: 'machine' }], null, AVANT_AIDE);
    return { e, plan: T.planDeSeance(e) };
  };
  const dit = (liste, inv) => liste.some((t) => t.indexOf(inv) === 0);

  test('les trois plans de départ sont sains', () => {
    [planPdc(), planCarte(), planAide()].forEach(({ e, plan }) => expect(erreurs(plan, e)).toEqual([]));
  });

  test('le plan PORTE la mesure, le mode et l\'intention : c\'est ce qui le rend vérifiable', () => {
    const { plan } = planPdc({ modes: { tractions: 'progresser' } });
    expect(plan.intention).toBe('progresser');
    expect(plan.edition).toBe(false);
    expect(plan.exercices[0].mesure).toBe('reps');
    expect(plan.exercices[0].mode).toBe('progresser');
    expect(plan.exercices[0].intention).toBe('progresser');
  });

  test('I28 forgée : une ligne haute avec une charge au poids du corps', () => {
    const { e, plan } = planPdc();
    const f = clone(plan);
    f.exercices[0].consigne.haut = { charge: 5, vise: 3, k: 1 };
    expect(dit(erreurs(f, e), 'I28')).toBe(true);
  });

  test('I28 forgée : une série qui porte une charge au poids du corps', () => {
    const { e, plan } = planPdc();
    const f = clone(plan);
    f.exercices[0].lignes.find((l) => l.role !== 'hors').charge = 10;
    expect(dit(erreurs(f, e), 'I28')).toBe(true);
  });

  test('I28 forgée : une ligne « test » au poids du corps', () => {
    const { e, plan } = planPdc();
    const f = clone(plan);
    f.exercices[0].lignes.find((l) => l.role !== 'hors').role = 'test';
    expect(dit(erreurs(f, e), 'I28')).toBe(true);
  });

  test('I29 forgée : la carte du lest revient après une réponse', () => {
    const { e, plan } = planCarte();
    const f = clone(plan);
    f.lestReponse = 'non';
    expect(dit(erreurs(f, e), 'I29')).toBe(true);
  });

  test('I29 forgée : deux cartes du lest dans la même séance', () => {
    const c3 = consigneDeCas(cas('B003'), null, 'pompes'), c5 = consigneDeCas(cas('B003'), null, 'releve');
    const e = entreesDe([
      { slug: 'pompes', consigne: c3, mesure: 'reps', leste: 'pompes_lestees' },
      { slug: 'releve', consigne: c5, mesure: 'reps', leste: 'releve_lestes' }], null, cas('B003').avant);
    const f = clone(T.planDeSeance(e));
    f.exercices[1].carteLest = clone(f.exercices[0].carteLest);
    const liste = erreurs(f, e);
    expect(liste.some((t) => /I29 — 2 cartes/.test(t))).toBe(true);
  });

  test('I29 forgée : une carte sans deux séances au haut de la zone', () => {
    const { e, plan } = planCarte();
    const f = clone(plan);
    f.exercices[0].carteLest.niveaux = [12, 9];
    expect(dit(erreurs(f, e), 'I29')).toBe(true);
  });

  test('I29 forgée : une carte sans version lestée à poser', () => {
    const { e, plan } = planCarte();
    const f = clone(plan);
    f.exercices[0].carteLest.leste = null;
    expect(dit(erreurs(f, e), 'I29')).toBe(true);
  });

  test('I29 forgée : un point d\'interrogation dans la carte', () => {
    const { e, plan } = planCarte();
    const f = clone(plan);
    f.exercices[0].carteLest.detail += ' Tu as du lest ?';
    expect(dit(erreurs(f, e), 'I29')).toBe(true);
  });

  test('I30 forgée : des chauffes sur une aide', () => {
    const { e, plan } = planAide();
    const f = clone(plan);
    f.exercices[0].chauffes = { situation: 'machine', reference: -25, iSerie: 0, phrase: 'x' };
    expect(dit(erreurs(f, e), 'I30')).toBe(true);
  });

  test('I30 forgée : une dégressive sur une aide', () => {
    const { e, plan } = planAide();
    const f = clone(plan);
    f.exercices[0].degressive = { charge: -20, vise: 10, repos: 0, phrase: 'x' };
    expect(dit(erreurs(f, e), 'I30')).toBe(true);
  });

  test('I30 forgée : un repli sur une aide', () => {
    const { e, plan } = planAide();
    const f = clone(plan);
    f.exercices[0].consigne.repli = { palier: -30, niveau: 8, debut: 'x', reps: [8], ligne: [-30, 8] };
    expect(dit(erreurs(f, e), 'I30')).toBe(true);
  });

  test('I30 forgée : une seconde charge, un double saut', () => {
    const { e, plan } = planAide();
    const f = clone(plan);
    f.exercices[0].contexte = { cran: -22.5, haut: { charge: -20, vise: 8 } };
    expect(dit(erreurs(f, e), 'I30')).toBe(true);
    const g = clone(plan);
    g.exercices[0].consigne.fondement.preuve = 'depassement';
    expect(dit(erreurs(g, e), 'I30')).toBe(true);
  });

  test('I13 forgée : Entretenir (le profil) avec une ligne du coach', () => {
    const { e, plan } = planPdc();
    const f = clone(plan);
    f.intention = 'entretien';
    expect(dit(erreurs(f, e), 'I13')).toBe(true);
  });

  test('I13 forgée : Édition avec une ligne du coach', () => {
    const { e, plan } = planPdc();
    const f = clone(plan);
    f.edition = true;
    expect(dit(erreurs(f, e), 'I13')).toBe(true);
  });

  test('I13 forgée : une mesure en durée avec une ligne du coach', () => {
    const { e, plan } = planPdc();
    const f = clone(plan);
    f.exercices[0].mesure = 'temps';
    expect(dit(erreurs(f, e), 'I13')).toBe(true);
  });

  test('I31 forgée : un exercice en Entretenir qui garde une ligne du coach', () => {
    const { e, plan } = planPdc();
    const f = clone(plan);
    f.exercices[0].mode = 'entretien';
    expect(dit(erreurs(f, e), 'I31')).toBe(true);
  });
});

// ═══ 7. ENTRETENIR PAR EXERCICE : EXACTEMENT COMME LE PROFIL ═══════════════
describe('50-1 — Entretenir se choisit aussi par exercice (modes_exercice)', () => {
  const ligne = (id, slug, mode, t) => ({ id: id, exercise_slug: slug, mode: mode, choisi_a: t });

  test('la ligne la plus récente fait foi ; une valeur inconnue ne change rien', () => {
    const l = [ligne('a', 'pompes', 'entretien', '2026-09-01T10:00:00Z'),
               ligne('b', 'pompes', 'progresser', '2026-09-02T10:00:00Z')];
    expect(M.modeEnVigueur(l, 'pompes')).toBe('progresser');
    expect(M.modeEnVigueur(l.concat([ligne('c', 'pompes', 'entretien', '2026-09-03T10:00:00Z')]), 'pompes')).toBe('entretien');
    expect(M.modeEnVigueur(l.concat([ligne('d', 'pompes', 'autre', '2026-09-04T10:00:00Z')]), 'pompes')).toBeNull();
    expect(M.modeEnVigueur(l, 'tractions')).toBeNull();
    expect(M.modeEnVigueur([], 'pompes')).toBeNull();
    expect(M.modeEnVigueur(null, 'pompes')).toBeNull();
    // À la même seconde : l'identifiant départage, dans les deux ordres.
    const e1 = ligne('a', 'pompes', 'entretien', '2026-09-05T10:00:00Z');
    const e2 = ligne('b', 'pompes', 'progresser', '2026-09-05T10:00:00Z');
    expect(M.modeEnVigueur([e1, e2], 'pompes')).toBe(M.modeEnVigueur([e2, e1], 'pompes'));
  });

  test('l\'intention d\'un exercice : le profil est l\'interrupteur général, puis l\'exercice', () => {
    expect(M.intentionDe('entretien', null)).toBe('entretien');
    expect(M.intentionDe('entretien', 'progresser')).toBe('entretien');
    expect(M.intentionDe('progresser', 'entretien')).toBe('entretien');
    expect(M.intentionDe('progresser', null)).toBe('progresser');
    expect(M.intentionDe(null, null)).toBe('progresser');
  });

  test('un exercice en Entretenir n\'a pas de consigne : le moteur se tait, comme au profil', () => {
    ['charge_reps', 'reps'].forEach((mesure) => {
      const o = Object.assign({}, OPTIONS_REPS, { mesure: mesure, intention: M.intentionDe('progresser', 'entretien') });
      expect(M.consigneDExercice(brutesDe(cas('B007')), undefined, cas('B007').avant, o)).toBeNull();
    });
  });

  test('I13 — le plan d\'un exercice en Entretenir est celui du profil en Entretenir : ni en-tête, ni carte, ni ligne', () => {
    const base = { slug: 'pompes', mesure: 'reps', leste: 'pompes_lestees' };
    const sans = Object.assign({}, base, { consigne: null });
    const parExercice = entreesDe([sans], { modes: { pompes: 'entretien' } });
    const parProfil = entreesDe([sans], { intention: 'entretien' });
    const a = T.planDeSeance(parExercice), b = T.planDeSeance(parProfil);
    expect(a.exercices[0].mode).toBe('entretien');
    expect(a.exercices[0].intention).toBe('entretien');
    ['entete', 'lignes', 'carteLest', 'consigne', 'message', 'proposition', 'chauffes', 'degressive', 'escalier']
      .forEach((cle) => expect([cle, a.exercices[0][cle]]).toEqual([cle, b.exercices[0][cle]]));
    expect(a.exercices[0].consigne).toBeNull();
    expect(a.exercices[0].carteLest).toBeNull();
    expect(erreurs(a, parExercice)).toEqual([]);
    expect(erreurs(b, parProfil)).toEqual([]);
  });

  test('un exercice en Entretenir ne gêne pas les autres : ils gardent leur consigne', () => {
    const c = consigneDeCas(cas('B007'), null, 'tractions');
    const e = entreesDe([{ slug: 'pompes', mesure: 'reps', consigne: null }, { slug: 'tractions', mesure: 'reps', consigne: c }],
      { modes: { pompes: 'entretien' } }, cas('B007').avant);
    const plan = T.planDeSeance(e);
    expect(plan.exercices[0].consigne).toBeNull();
    expect(plan.exercices[1].consigne).not.toBeNull();
    expect(erreurs(plan, e)).toEqual([]);
  });

  test('la ligne de base : une table, un magasin, une file, des colonnes — le patron des zones', () => {
    expect(Attente.MODES).toBe('modes_exercice');
    // Le cache n'a pas d'export (une IIFE sur `self`) : on lit le source, comme
    // le fait `v2-cache-integrite`.
    const cache = fs.readFileSync(path.join(__dirname, '../../v2/js/cache.js'), 'utf8');
    expect(cache).toMatch(/var VERSION = 6;/);
    expect(cache).toMatch(/var MAGASINS = \[[^\]]*'modes'/);
    expect(cache).toMatch(/createObjectStore\('modes', \{ keyPath: 'id' \}\)/);
    // La file d'envoi sait où poser une ligne de `modes_exercice` — sans cette
    // branche, un choix fait hors ligne resterait dans la file pour toujours.
    const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
    expect(app).toMatch(/op\.table === Attente\.MODES\) return Donnees\.enregistrerMode\(op\.donnees\)/);
    // Et la synchronisation FOND les lignes par identifiant (jamais de remplacement).
    expect(app).toMatch(/local\.modes = fondreModes\(local\.modes, modes\)/);
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/donnees.js'), 'utf8');
    expect(src).toMatch(/from\('modes_exercice'\)/);
    expect(src).toMatch(/COLONNES_MODE = 'id, user_id, exercise_slug, mode, choisi_a, created_at'/);
  });
});

// ═══ 8. LE PROFIL ET LE CATALOGUE PORTENT CE QU'IL FAUT ═════════════════════
describe('50-1 — la réponse du lest vit au profil, la version lestée au catalogue', () => {
  test('lest_reponse et lest_reponse_le s\'écrivent par le chemin de la phase', () => {
    const Profil = require('../../v2/js/profil.js');
    const champs = Profil.champsEcrits({ lest_reponse: 'oui', lest_reponse_le: '2026-10-04T10:00:00Z', intention: 'progresser' });
    expect(champs.lest_reponse).toBe('oui');
    expect(champs.lest_reponse_le).toBe('2026-10-04T10:00:00Z');
  });

  test('`lesteDe` : l\'exercice dont `parent` est lui et dont la charge est ajoutée', () => {
    const index = {
      pompes: { slug: 'pompes', mesure: 'reps', charge: 'aucune', parent: null },
      pompes_lestees: { slug: 'pompes_lestees', mesure: 'charge_reps', charge: 'ajoutee', parent: 'pompes' },
      pompes_diamant: { slug: 'pompes_diamant', mesure: 'reps', charge: 'aucune', parent: 'pompes' },
      tractions: { slug: 'tractions', mesure: 'reps', charge: 'aucune', parent: null }
    };
    expect(Mo.lesteDe(index, 'pompes')).toBe('pompes_lestees');
    expect(Mo.lesteDe(index, 'tractions')).toBeNull();
    expect(Mo.lesteDe(index, 'inconnu')).toBeNull();
    expect(Mo.lesteDe(null, 'pompes')).toBeNull();
  });

  test('`parentDe` : l\'exercice libre d\'un lesté — jamais celui d\'une simple variante', () => {
    const index = {
      pompes: { slug: 'pompes', mesure: 'reps', charge: 'aucune', parent: null },
      pompes_lestees: { slug: 'pompes_lestees', mesure: 'charge_reps', charge: 'ajoutee', parent: 'pompes' },
      pompes_diamant: { slug: 'pompes_diamant', mesure: 'reps', charge: 'aucune', parent: 'pompes' },
      orpheline: { slug: 'orpheline', mesure: 'charge_reps', charge: 'ajoutee', parent: 'disparue' }
    };
    expect(Mo.parentDe(index, 'pompes_lestees')).toBe('pompes');
    expect(Mo.parentDe(index, 'pompes_diamant')).toBeNull();
    expect(Mo.parentDe(index, 'pompes')).toBeNull();
    expect(Mo.parentDe(index, 'orpheline')).toBeNull();
    expect(Mo.parentDe(null, 'pompes_lestees')).toBeNull();
  });

  test('le lesté est un AUTRE exercice : son matériel effectif est le lest, son cran 2,5 kg', () => {
    expect(M.equipementEffectif({ slug: 'pompes_lestees', charge: 'ajoutee', equipement: 'aucun' })).toBe(M.EQUIPEMENT_LEST);
  });
});

// ═══ 9. LES SÉRIES AU POIDS DU CORPS RESTENT SANS CHARGE EN BASE ═══════════
describe('50-1 — le contrat du poids du corps', () => {
  test('`analyserPoidsDuCorps` : palier 0, jamais de vote du zéro', () => {
    const r = P.analyserPoidsDuCorps([
      { id: '1', rang: 1, charge_kg: null, reps: 10, type_serie: 'travail' },
      { id: '2', rang: 2, charge_kg: null, reps: 9, type_serie: 'travail' }]);
    expect(r.palier).toBe(0);
    expect(r.series.every((x) => x.serie.charge_kg === 0)).toBe(true);
  });

  test('une séance sans série de travail n\'a pas de palier', () => {
    const r = P.analyserPoidsDuCorps([{ id: '1', rang: 1, charge_kg: null, reps: 10, type_serie: 'echauffement' }]);
    expect(r.palier).toBeNull();
  });

  // 6 en 50-1 ; 7 depuis 51-3 (MOTEUR §9.20, la séance douloureuse est neutre).
  test('la version de la consigne a changé : 7 depuis (6 en 50-1)', () => {
    expect(M.VERSION_CONSIGNE).toBe(7);
  });
});
