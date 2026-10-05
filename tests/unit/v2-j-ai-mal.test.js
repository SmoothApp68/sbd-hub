/** @jest-environment node */
//
// 51-3 — « J'ai mal » (MOTEUR §9.20, delta 51-3).
//
//   · LA NEUTRALITÉ DÉCLARÉE, sur les 4 cas de `cas-51-3-j-ai-mal.json` (des
//     séances réelles d'Aurélien) : avec la marque, la ligne de la consigne est
//     celle qu'on aurait eue sans la séance douloureuse ; sans la marque, elle
//     recule ; la présence compte pour le rythme (N04) ;
//   · la zone suivante en reps (5 cas) et la condition de la carte (4 cas) ;
//   · la marque en séance : sur l'occurrence et chacune de ses séries, en base
//     par `lignes()`, avec l'occurrence (uuid) ; relue, une séance sépare deux
//     occurrences voisines ;
//   · le plan : l'occurrence marquée sans coach (I33), aucune consigne fondée
//     sur une séance marquée (I34), la carte de reprise et « Plus léger » par
//     le repli (I35) — et leurs violations forgées ;
//   · les phrases : la feuille, la phrase de sécurité, la carte sans question.
//
// ⚠️ RAPPORTÉ, PAS CORRIGÉ : la CHARGE du test (`haut`) du fichier de cas
// diffère de l'app sur N01 (attendu et sans la séance), N04 (attendu) et N02
// (sans la marque) — y compris là où la douleur n'intervient pas
// (`sans_la_seance_douloureuse` de N01). C'est le choix de la charge voisine
// (§10.2), pas §9.20 : la zone, l'état, la ligne et la visée du test se
// comparent ici ; la charge du test est dans la description de la PR.

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Modele = require('../../v2/js/modele.js');

const CAS = require('./fixtures/cas-51-3-j-ai-mal.json');
const FANTOME = require('./fixtures/cas-49u2-fantome.json');
const F044 = FANTOME.cas.find((x) => x.id === 'F044');
const CONSIGNE = { etat: F044.consigne.etat, zone: F044.consigne.zone === null ? null : F044.consigne.zone.nom,
  palier: F044.consigne.palier, n: F044.consigne.n, ligne: F044.consigne.ligne, haut: F044.consigne.haut };

const tableau = (o, avecK) => (o === null || o === undefined ? null
  : avecK ? [o.charge, o.vise, o.k] : [o.charge, o.vise]);
const forme = (k) => {
  const z = M.zoneParCle(k.zone);
  return { zone: z === null ? null : [z.cle, z.bas, z.haut], etat: k.etat,
           ligne: tableau(k.ligne, false), haut: tableau(k.haut, true) };
};
// Sans la charge du test (rapportée, voir l'en-tête) : la visée et son rang.
const sansChargeDuTest = (f) => Object.assign({}, f, { haut: f.haut === null ? null : [f.haut[1], f.haut[2]] });
// Les séances du cas, telles que le contrat les donne AVANT la règle : la
// neutralité se recalcule (`neutre` retiré), la marque reste.
const contrat = (c, marque) => c.seances.map((s) => {
  const x = Object.assign({}, s);
  delete x.neutre;
  if (marque === false) x.douleur = false;
  return x;
});
const consigneDe = (seances, avant) => M.consignePour(M.sansPalierRetenues(seances, {}), avant, {});

// ══ 1. LA NEUTRALITÉ DÉCLARÉE ════════════════════════════════════════════════

describe('51-3 — une séance marquée est neutre (les 4 cas d’Aurélien)', () => {
  test('le fichier : 4 cas, chacun une seule séance douloureuse, la dernière', () => {
    expect(CAS.neutralite).toHaveLength(4);
    CAS.neutralite.forEach((c) => {
      expect(c.seances.filter((s) => s.douleur)).toHaveLength(1);
      expect(c.seances[c.seances.length - 1].douleur).toBe(true);
    });
  });

  CAS.neutralite.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const avec = forme(consigneDe(contrat(c), c.avant));
      const sans = forme(consigneDe(contrat(c).filter((s) => !s.douleur), c.avant));
      const nonMarquee = forme(consigneDe(contrat(c, false), c.avant));
      expect(sansChargeDuTest(avec)).toEqual(sansChargeDuTest(c.attendu));
      expect(sansChargeDuTest(sans)).toEqual(sansChargeDuTest(c.sans_la_seance_douloureuse));
      expect(sansChargeDuTest(nonMarquee)).toEqual(sansChargeDuTest(c.si_elle_n_etait_pas_marquee));
      // LA PROPRIÉTÉ : la ligne avec la marque = la ligne sans la séance…
      expect(avec.ligne).toEqual(sans.ligne);
      // …et sans la marque, elle aurait reculé.
      expect(nonMarquee.ligne[0]).toBeLessThan(avec.ligne[0]);
    });
  });

  test('⚠️ DISCRIMINANT — N04 : la présence compte pour le rythme (avec elle, pas de reprise)', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N04');
    expect(consigneDe(contrat(c), c.avant).etat).toBe('test_propose');
    expect(consigneDe(contrat(c).filter((s) => !s.douleur), c.avant).etat).toBe('reprise_courte');
  });

  test('la séance marquée reste au contrat, neutre et marquée, sans palier', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N01');
    const r = M.sansPalierRetenues(contrat(c), {});
    const d = r.filter((s) => s.douleur)[0];
    expect([d.neutre, d.palier, d.douleur]).toEqual([true, null, true]);
    expect(r).toHaveLength(c.seances.length);
  });

  test('le contrat lit la marque sur les séries brutes (une seule suffit)', () => {
    const g = (debut, douleur) => ({ seance: { debut }, series: [
      { id: 'a', rang: 1, charge_kg: 100, reps: 5, type_serie: 'travail' },
      { id: 'b', rang: 2, charge_kg: 100, reps: 5, type_serie: 'travail', douleur: douleur }] });
    const s = M.contratDe([g('2026-09-01T10:00:00Z', false), g('2026-09-08T10:00:00Z', true)], null, 'charge_reps', {});
    expect(s.map((x) => !!x.douleur)).toEqual([false, true]);
    expect(s[1].neutre).toBe(true);
    expect(M.seanceDouloureuse([{ douleur: false }, { douleur: true }])).toBe(true);
    expect(M.seanceDouloureuse([{}, { douleur: false }])).toBe(false);
  });
});

// ══ 2. LA ZONE SUIVANTE, LA CARTE ════════════════════════════════════════════

describe('51-3 — la zone suivante en reps et la condition de la carte', () => {
  CAS.zone_plus_de_reps.forEach((c) => {
    test(c.zone + ' → ' + c.attendu, () => { expect(M.zonePlusDeReps(c.zone)).toBe(c.attendu); });
  });
  test('une zone inconnue n’a pas de suivante', () => { expect(M.zonePlusDeReps('x')).toBe(null); });

  CAS.carte_reprise.forEach((c) => {
    test('carte — ' + c.titre, () => { expect(M.carteReprise(c.douleurs)).toBe(c.attendu); });
  });

  // Le meilleur du compteur (§12.9) : ici celui de la dernière séance tenue,
  // 120 kg — le cas ne porte pas de paris, donc pas de compteur rejoué.
  const MEILLEUR = { palier: 120, niveau: 5 };

  test('la reprise, figée avec la consigne : la zone suivante et le repli (§14.5) dans cette zone', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N01');
    const se = M.sansPalierRetenues(contrat(c), {});
    const k = M.consignePour(se, c.avant, {});
    const r = M.reprisePour(se, c.avant, k, MEILLEUR);
    expect([r.douleur, r.zone, r.derniere]).toEqual([true, 'mix', c.seances[c.seances.length - 1].debut]);
    // Le repli : le dernier palier TENU dans la zone suivante, sous le meilleur
    // et à 10 % au plus — la fonction de l'escalier, telle quelle.
    expect(r.repli).toEqual(M.repliEscalier(se, c.avant, MEILLEUR, 'mix'));
    expect(r.repli.ligne).toEqual([110, 6]);
    expect(r.repli.palier).toBeLessThan(MEILLEUR.palier);
    expect(r.repli.palier).toBeGreaterThanOrEqual(MEILLEUR.palier * 0.9);
  });

  // 51-3 bis (D3) — « PLUS LÉGER » TOUJOURS PROPOSÉ : sans repli de §14.5, le
  // repli de la reprise longue (§9.9), par SES fonctions.
  test('⚠️ DISCRIMINANT — sans meilleur (aucun compteur) : « Plus léger » par le repli de la reprise longue', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N01');
    const se = M.sansPalierRetenues(contrat(c), {});
    const k = M.consignePour(se, c.avant, {});
    const r = M.reprisePour(se, c.avant, k, null);
    // Le cran en dessous de 120 : 115, déjà fait le 23/12 (`chargeVoisine`),
    // plafonné à 10 % (`repliDeReprise`) — la règle de §9.9, appelée telle quelle.
    expect(r.repli).toEqual({ source: 'reprise_longue', palier: 120, ligne: [M.repliDeReprise(120, 115), 6] });
    expect(M.repliDeReprise(120, 115)).toBe(115);
    expect(M.repliDeReprise(120, 100)).toBe(120);
  });

  test('« Plus léger » est TOUJOURS proposé : les 4 cas réels, avec ou sans meilleur', () => {
    CAS.neutralite.forEach((c) => {
      const se = M.sansPalierRetenues(contrat(c), { equipement: 'barre' });
      const k = M.consignePour(se, c.avant, { equipement: 'barre' });
      [null, { palier: k.palier, niveau: k.niveau }].forEach((m) => {
        const r = M.reprisePour(se, c.avant, k, m, { equipement: 'barre' });
        expect([c.id, M.carteRepriseTextes('X', k, r).choix.map((q) => q.cle)]).toEqual([c.id, ['avant', 'leger', 'sans']]);
      });
    });
  });

  test('au-delà de 10 %, la reprise longue garde le palier (§9.9) : 20 kg × 15 au militaire', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N04');
    const se = M.sansPalierRetenues(contrat(c), { equipement: 'barre' });
    const k = M.consignePour(se, c.avant, { equipement: 'barre' });
    expect(M.reprisePour(se, c.avant, k, null, { equipement: 'barre' }).repli.ligne).toEqual([20, 15]);
  });

  test('sans cran connu, la charge ne s’invente pas : « le cran en dessous »', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N03');
    const se = M.sansPalierRetenues(contrat(c), {});
    const k = M.consignePour(se, c.avant, {});
    const r = M.reprisePour(se, c.avant, k, null);
    expect(r.repli.ligne).toEqual([null, 6]);
    expect(M.texteRepriseLeger(r.repli)).toBe('Plus léger, plus de reps : le cran en dessous\u00a0×\u00a06');
  });

  test('pas de carte sans séance douloureuse en dernier, ni sans consigne', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N01');
    const se = M.sansPalierRetenues(contrat(c, false), {});
    expect(M.reprisePour(se, c.avant, M.consignePour(se, c.avant, {}), MEILLEUR)).toBe(null);
    const se2 = M.sansPalierRetenues(contrat(c), {});
    expect(M.reprisePour(se2, c.avant, null, MEILLEUR)).toBe(null);
  });

  test('⚠️ DISCRIMINANT — sans palier tenu dans la zone suivante (N02) : le repli de la reprise longue, trois choix', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N02');
    const se = M.sansPalierRetenues(contrat(c), {});
    const k = M.consignePour(se, c.avant, {});
    const r = M.reprisePour(se, c.avant, k, { palier: 120, niveau: 5 });
    expect(M.repliEscalier(se, c.avant, { palier: 120, niveau: 5 }, 'mix')).toBe(null);
    expect([r.repli.source, r.repli.ligne]).toEqual(['reprise_longue', [115, 6]]);
    expect(M.carteRepriseTextes('Développé Couché (Barre)', k, r).choix.map((q) => q.cle)).toEqual(['avant', 'leger', 'sans']);
  });
});

// ══ 3. LES PHRASES ═══════════════════════════════════════════════════════════

describe('51-3 — les phrases de §9.20', () => {
  test('la feuille « J’ai mal » : le titre, la phrase, quatre choix, la phrase de sécurité telle quelle', () => {
    const f = M.feuilleDouleur('Squat (Barre)');
    expect(f.titre).toBe('Squat (Barre) : tu as mal');
    expect(f.phrase).toBe('Pour aujourd’hui, Squat (Barre) est sans coach : il ne comptera pas comme un recul.');
    expect(f.choix.map((q) => q.texte)).toEqual(['Alléger', 'Changer de position', 'Un frère', 'Arrêter cet exercice']);
    expect(f.securite).toBe('Si la douleur dépasse 5 sur 10, ou ne redescend pas en 24 heures, demande l’avis d’un professionnel.');
  });

  test('aucun diagnostic, aucune localisation, aucun conseil médical : rien d’autre que la sécurité', () => {
    const f = M.feuilleDouleur('X');
    const tout = [f.titre, f.phrase, f.securite].concat(f.choix.map((q) => q.texte + ' ' + (q.sous || ''))).join(' ');
    expect(tout).not.toMatch(/tendin|entorse|déchir|inflamm|genou|épaule|dos|glace|anti-?inflam|repos complet|médecin/i);
  });

  test('la carte de reprise : trois choix, sans question', () => {
    const c = CAS.neutralite.find((x) => x.id === 'N01');
    const se = M.sansPalierRetenues(contrat(c), {});
    const k = M.consignePour(se, c.avant, {});
    const t = M.carteRepriseTextes('Squat (Barre)', k, M.reprisePour(se, c.avant, k, { palier: 120, niveau: 5 }));
    expect(t.titre).toBe('Ta dernière séance de Squat (Barre) était douloureuse.');
    expect(t.phrase).toBe('On reprend comme tu veux. Tu peux toujours changer d’avis depuis l’étiquette de l’exercice.');
    expect(t.choix.map((q) => q.texte)).toEqual(['Comme avant : 120 kg × 5',
      'Plus léger, plus de reps : 110 kg × 6', 'Sans coach cette fois']);
    expect([t.titre, t.phrase].concat(t.choix.map((q) => q.texte)).join(' ')).not.toMatch(/\?/);
  });
});

// ══ 4. LA MARQUE EN SÉANCE, L'OCCURRENCE EN BASE ══════════════════════════════

const UUID = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function decor(slugs, n) {
  let k = 0;
  const id = () => UUID(++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: n || 3 }); });
  return { se, id };
}
const QUAND = new Date('2026-10-05T10:30:00Z');
const faire = (se, i, j, kg, reps) => S.valider(S.modifierSerie(se, i, j, { charge_kg: kg, reps: reps }), i, j, QUAND);

describe('51-3 — la marque sur l’occurrence, et l’envoi', () => {
  test('⚠️ DISCRIMINANT — les séries validées ET à venir portent la marque ; la charge et les reps ne changent pas', () => {
    let { se, id } = decor(['x', 'y']);
    se = faire(se, 0, 0, 100, 5);
    const avant = S.lignes(se).filter((l) => l.exercise_slug === 'x');
    se = S.marquerDouleur(se, 0);
    se = faire(se, 0, 1, 90, 8);
    se = S.ajouterSerie(se, 0, id());
    se = faire(se, 0, 3, 90, 8);
    const l = S.lignes(se);
    expect(l.filter((r) => r.exercise_slug === 'x').map((r) => r.douleur)).toEqual([true, true, true]);
    expect(l.filter((r) => r.exercise_slug === 'y').map((r) => r.douleur)).toEqual([]);
    expect(l.filter((r) => r.exercise_slug === 'x')[0].charge_kg).toBe(avant[0].charge_kg);
    expect(l.filter((r) => r.exercise_slug === 'x')[0].reps).toBe(avant[0].reps);
    expect(S.occurrenceDouloureuse(se.exercices[0])).toBe(true);
    expect(S.occurrenceDouloureuse(se.exercices[1])).toBe(false);
  });

  test('une série non marquée part avec `douleur: false`, jamais absente', () => {
    let { se } = decor(['x']);
    se = faire(se, 0, 0, 100, 5);
    expect(S.lignes(se)[0].douleur).toBe(false);
  });

  test('⚠️ DISCRIMINANT — chaque série écrit l’uuid de son occurrence ; deux occurrences, deux uuid', () => {
    let { se } = decor(['x', 'x']);
    se = faire(se, 0, 0, 100, 5);
    se = faire(se, 1, 0, 80, 8);
    const l = S.lignes(se);
    const occ = l.map((r) => r.occurrence);
    expect(occ.every((o) => /^[0-9a-f-]{36}$/.test(o))).toBe(true);
    expect(occ[0]).not.toBe(occ[1]);
    expect('o-' + occ[0]).toBe(se.exercices[0].occurrence);
  });

  test('une occurrence sans uuid (exercice posé sans série) s’écrit NULL', () => {
    expect(S.uuidDOccurrence('o-x-0')).toBe(null);
    expect(S.uuidDOccurrence('o-' + UUID(7))).toBe(UUID(7));
    expect(S.uuidDOccurrence(null)).toBe(null);
  });

  test('`douleur` et `occurrence` sont déclarées : lues et écrites', () => {
    expect(S.COLONNES_SET).toEqual(expect.arrayContaining(['douleur', 'occurrence']));
  });
});

describe('51-3 — une séance relue sépare deux occurrences voisines', () => {
  const ligne = (id, occ, k, douleur) => ({ id, session_id: 'S', exercise_slug: 'x', rang: k, groupe_superset: null,
    type_serie: 'travail', charge_kg: 100, reps: 5, validee_a: '2026-10-01T10:00:00Z', occurrence: occ, douleur: !!douleur });
  const CAT = [{ slug: 'x', nom: 'X', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [] }];

  test('⚠️ DISCRIMINANT — deux occurrences voisines en base : deux blocs au détail', () => {
    const plat = [ligne('a', UUID(1), 1), ligne('b', UUID(1), 2), ligne('c', UUID(2), 3), ligne('d', UUID(2), 4)];
    expect(Modele.construireBlocs(plat, CAT).map((b) => b.series.length)).toEqual([2, 2]);
  });

  test('NULL (importée, ou d’avant la colonne) : le regroupement par voisinage', () => {
    const plat = [ligne('a', null, 1), ligne('b', null, 2), ligne('c', null, 3)];
    expect(Modele.construireBlocs(plat, CAT)).toHaveLength(1);
  });

  test('reprise depuis la base : chaque occurrence retrouve son identifiant et sa marque', () => {
    const plat = [ligne('a', UUID(1), 1), ligne('b', UUID(2), 2, true)];
    const se = S.reprendre({ id: 'S', debut: '2026-10-01T09:00:00Z', statut: 'terminee' }, Modele.construireBlocs(plat, CAT));
    expect(se.exercices.map((e) => e.occurrence)).toEqual(['o-' + UUID(1), 'o-' + UUID(2)]);
    expect(se.exercices.map((e) => S.occurrenceDouloureuse(e))).toEqual([false, true]);
    // Renvoyée : les mêmes uuid, la même marque.
    expect(S.lignes(se).map((r) => [r.occurrence, r.douleur])).toEqual([[UUID(1), false], [UUID(2), true]]);
  });
});

// ══ 5. LE PLAN : I33 À I35 ═══════════════════════════════════════════════════

// 47,5 kg, et pas 45 : 45 vaut exactement « 50 − 10 % », et une charge calculée
// à −10 % hors du repli passerait pour lui (la mutation (d) l'a montré).
const REPLI = { palier: 47.5, niveau: 6, debut: '2026-09-20T10:00:00Z', reps: [6, 6], ligne: [47.5, 6] };
const entreesDe = (se, extra) => Object.assign({
  seance: { id: 'S', debut: '2026-10-05T10:00:00Z', edition: false, exercices: se.exercices, reprises: se.reprises || null },
  consignes: { x: { consigne: CONSIGNE, contexte: F044.contexte, compteur: { compteur: 0, meilleur: { palier: 50, niveau: 5 } } } },
  reglage: 'normal', paris: [], catalogue: { x: { nom: 'Squat X' } }
}, extra || {});
const avecReprise = (e) => Object.assign({}, e, { consignes: { x: Object.assign({}, e.consignes.x, {
  reprise: { douleur: true, zone: 'mix', derniere: '2026-10-01T10:00:00Z', repli: REPLI },
  douleurs: ['2026-10-01T10:00:00Z'] }) } });
const erreursDe = (p, e, inv) => T.verifierPlan(p, e).erreurs.filter((x) => x.indexOf(inv + ' —') === 0);
const copie = (o) => JSON.parse(JSON.stringify(o));

describe('51-3 — I33 : une occurrence marquée est sans coach', () => {
  test('⚠️ DISCRIMINANT — marquée en pleine séance : ni consigne, ni ligne du coach, ni pari ; l’autre occurrence non touchée', () => {
    let { se } = decor(['x', 'y']);
    const e0 = entreesDe(se);
    expect(T.planDeSeance(e0).exercices[0].consigne).toBeTruthy();
    se = faire(se, 0, 0, 50, 5);
    se = S.marquerDouleur(se, 0);
    const e = entreesDe(se);
    const p = T.planDeSeance(e);
    expect(p.exercices[0].douleur).toBe(true);
    expect(p.exercices[0].consigne).toBe(null);
    expect(p.exercices[0].lignes.every((l) => l.role === 'hors')).toBe(true);
    expect((p.exercices[0].paris || []).filter(Boolean)).toEqual([]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('violation forgée : une ligne du coach sur une occurrence marquée → I33', () => {
    let { se } = decor(['x']);
    const e = entreesDe(se);
    const p = copie(T.planDeSeance(e));
    p.exercices[0].douleur = true;
    expect(erreursDe(p, e, 'I33').join(' ')).toMatch(/occurrence marquée « douleur » : une consigne/);
  });
});

describe('51-3 — I34 : une consigne ne lit jamais une séance marquée', () => {
  test('violation forgée : la ligne fondée sur une séance marquée → I34', () => {
    const { se } = decor(['x']);
    const e = entreesDe(se, { consignes: { x: { consigne: Object.assign({}, CONSIGNE, { fondement: { date: '2026-10-01T10:00:00Z' } }),
      contexte: F044.contexte, douleurs: ['2026-10-01T10:00:00Z'] } } });
    expect(erreursDe(T.planDeSeance(e), e, 'I34').join(' ')).toMatch(/se fonde sur une séance marquée/);
  });

  test('une séance marquée qui ne fonde rien : I34 se tait', () => {
    const { se } = decor(['x']);
    const e = entreesDe(se, { consignes: { x: { consigne: Object.assign({}, CONSIGNE, { fondement: { date: '2026-09-20T10:00:00Z' } }),
      contexte: F044.contexte, douleurs: ['2026-10-01T10:00:00Z'] } } });
    expect(erreursDe(T.planDeSeance(e), e, 'I34')).toEqual([]);
  });
});

describe('51-3 — I35 : la carte de reprise, et « Plus léger » par le repli', () => {
  // 51-3 bis — le repli de la reprise longue : sa ligne, sans ligne haute, et
  // PAS un repli d'escalier (I22 ne le juge pas contre le meilleur du compteur).
  const REPLI_LONGUE = { source: 'reprise_longue', palier: 50, ligne: [47.5, 6] };
  test('⚠️ DISCRIMINANT — « Plus léger » par le repli de la reprise longue : sa ligne, sans ligne haute, le plan juste', () => {
    let { se } = decor(['x']);
    se = S.choisirReprise(se, 'x', { choix: 'leger', repli: REPLI_LONGUE });
    const e = avecReprise(entreesDe(se));
    e.consignes.x.compteur = { compteur: 0, meilleur: null };
    const p = T.planDeSeance(e);
    const k = p.exercices[0].consigne;
    expect([k.ligne.charge, k.ligne.vise, k.haut, k.repli]).toEqual([47.5, 6, null, undefined]);
    expect(k.plusLegere).toEqual({ source: 'reprise_longue', palier: 50 });
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('la dernière séance marquée : la carte, trois choix, sans question ; le plan est juste', () => {
    const { se } = decor(['x']);
    const e = avecReprise(entreesDe(se));
    const p = T.planDeSeance(e);
    const k = p.exercices[0].carteReprise;
    expect(k.titre).toBe('Ta dernière séance de Squat X était douloureuse.');
    expect(k.choix.map((q) => q.cle)).toEqual(['avant', 'leger', 'sans']);
    expect([k.zone, k.repli]).toEqual(['mix', REPLI]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('un choix fait dans la séance : la carte se retire', () => {
    let { se } = decor(['x']);
    se = S.choisirReprise(se, 'x', { choix: 'avant' });
    const p = T.planDeSeance(avecReprise(entreesDe(se)));
    expect(p.exercices[0].carteReprise).toBe(null);
    expect(p.exercices[0].consigne.ligne.charge).toBe(CONSIGNE.ligne.charge);
  });

  test('⚠️ DISCRIMINANT — « Plus léger » : la consigne prend la ligne du repli, rien d’autre', () => {
    let { se } = decor(['x']);
    se = S.choisirReprise(se, 'x', { choix: 'leger', repli: REPLI });
    const e = avecReprise(entreesDe(se));
    const p = T.planDeSeance(e);
    expect([p.exercices[0].consigne.ligne.charge, p.exercices[0].consigne.ligne.vise]).toEqual([47.5, 6]);
    expect(p.exercices[0].consigne.haut).toBe(null);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });

  test('violation forgée : « Plus léger » à une autre charge que le repli → I35', () => {
    let { se } = decor(['x']);
    se = S.choisirReprise(se, 'x', { choix: 'leger', repli: REPLI });
    const e = avecReprise(entreesDe(se));
    const p = copie(T.planDeSeance(e));
    p.exercices[0].consigne.ligne.charge = 45;
    expect(erreursDe(p, e, 'I35').join(' ')).toMatch(/« Plus léger » pose 45, le repli est à 47.5/);
  });

  test('violations forgées : une carte sans dernière séance marquée, une carte qui questionne → I35', () => {
    const { se } = decor(['x']);
    const e = avecReprise(entreesDe(se));
    const p = copie(T.planDeSeance(e));
    p.exercices[0].carteReprise.titre += ' ?';
    expect(erreursDe(p, e, 'I35').join(' ')).toMatch(/pose une question/);
    const sansMarque = entreesDe(se);
    const p2 = copie(T.planDeSeance(e));
    expect(erreursDe(p2, sansMarque, 'I35').join(' ')).toMatch(/sans dernière séance marquée/);
  });

  test('« Sans coach cette fois » : la marque, et ni carte ni coach', () => {
    let { se } = decor(['x']);
    se = S.marquerDouleur(se, 0);
    const e = avecReprise(entreesDe(se));
    const p = T.planDeSeance(e);
    expect([p.exercices[0].carteReprise, p.exercices[0].consigne, p.exercices[0].douleur]).toEqual([null, null, true]);
    expect(T.verifierPlan(p, e).erreurs).toEqual([]);
  });
});

// ══ 6. 51-3 BIS (D4) — LA MARQUE SE POSE AU CHOIX ═════════════════════════════

describe('51-3 bis — la marque se pose au choix, jamais à l’ouverture de la feuille', () => {
  const fs = require('fs');
  const path = require('path');
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const corps = APP.match(/^  function rendreFeuilleDeviation\b[\s\S]*?^  }/m)[0];

  test('⚠️ DISCRIMINANT — ouvrir « J’ai mal » ne marque rien : la porte n’ouvre que la feuille', () => {
    const porte = corps.match(/var jaiMal = function \(iExo\) \{[\s\S]*?\n    \};/)[0];
    expect(porte).not.toMatch(/marquerDouleur|apresGeste/);
    expect(porte).toMatch(/feuille = \{ quoi: 'douleur'/);
  });

  test('chacun des quatre choix marque, AVANT d’agir (le frère compris)', () => {
    const feuilleDouleur = corps.slice(corps.indexOf("if (quoiFeuille === 'douleur')"), corps.indexOf("if (quoiFeuille === 'freres')"));
    const surChoix = feuilleDouleur.slice(feuilleDouleur.indexOf('surChoix'));
    expect(surChoix.indexOf('Seance.marquerDouleur(seance, cibleExo)')).toBeGreaterThan(-1);
    expect(surChoix.indexOf('Seance.marquerDouleur')).toBeLessThan(surChoix.indexOf("cle === 'frere'"));
  });
});
