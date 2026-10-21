/** @jest-environment node */
//
// 49-U18 — les correctifs de la séance réelle du 01/10/2026 (delta 49-36,
// `VERSION_CONSIGNE` 5), diagnostiqués par l'outil de rejeu (#349) :
//   A. trois règles de consigne — l'écart habituel sur les 8 derniers écarts
//      (§9.9, §12.6) ; une reprise ne vise jamais au-dessus du haut de la zone
//      (§9.9) ; la charge déjà utilisée plus lourde, hors barre, sur 12 mois
//      (§10.2, le rang 2 seulement) ;
//   B. deux défauts de l'app — une ligne de travail non couverte prend la
//      charge du coach (I25) ; une dégressive ne reprend jamais la charge
//      d'une ancienne séance ;
//   C. les phrases : « Même cible » seulement si c'est la même ; la cible de
//      la prochaine fois calculée avec les MÊMES entrées que la consigne.
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u18-correctifs.json` sort de
// `coach49.py` (Claude.ai, 01/10/2026). Un cas qui semble faux se rapporte ;
// il ne se corrige pas ici.
//
// V03 ET V04 SONT DES TÉMOINS DU RANG 1 (décidé le 02/10/2026). Leurs premiers
// attendus venaient d'une version intermédiaire de la référence (la fenêtre de
// 12 mois appliquée aussi au pas de salle) ; ils ont été remplacés, de façon
// chirurgicale, par leur `avant_le_correctif`. Le pas de salle (24 mois) passe
// avant la charge déjà utilisée : 73 + 7 = 80, 97,6 + 7,5 = 105,1 — la fenêtre
// de 12 mois du rang 2 ne les touche pas.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');

const F = require('./fixtures/cas-49u18-correctifs.json');
const NB = ' ';

const tableau = (o, avecK) => (o === null || o === undefined ? null
  : avecK ? [o.charge, o.vise, o.k] : [o.charge, o.vise]);
const forme = (k) => {
  const z = M.zoneParCle(k.zone);
  return { etat: k.etat, zone: z === null ? null : [z.cle, z.bas, z.haut],
           ligne: tableau(k.ligne, false), haut: tableau(k.haut, true) };
};
const consigneDuCas = (c) => M.consignePour(c.seances, c.avant,
  { equipement: c.equipement, reglage: c.reglage, correction: c.correction || null });
const TEMOINS_RANG_1 = ['V03', 'V04'];

// ── LES CAS ───────────────────────────────────────────────────────────────
describe('49-U18 — le fichier de cas', () => {
  test('11 cas : 4 de la borne, 4 de l’écart habituel, 3 de la charge voisine — 9 changent, 2 témoins', () => {
    expect(F.cas).toHaveLength(11);
    const par = {};
    F.cas.forEach((c) => { par[c.regle] = (par[c.regle] || 0) + 1; });
    expect(par).toEqual({ borne: 4, ecart: 4, voisine: 3 });
    F.cas.forEach((c) => {
      if (TEMOINS_RANG_1.indexOf(c.id) >= 0) expect(c.attendu).toEqual(c.avant_le_correctif);
      else expect(c.attendu).not.toEqual(c.avant_le_correctif);
    });
  });

  F.cas.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      expect(forme(consigneDuCas(c))).toEqual(c.attendu);
    });
  });

  test('V03 et V04, témoins du rang 1 : le pas de salle passe avant la charge déjà utilisée', () => {
    TEMOINS_RANG_1.forEach((id) => {
      const c = F.cas.filter((x) => x.id === id)[0];
      const a = c.attendu;
      expect(a.haut[0]).toBeCloseTo(a.ligne[0] + (id === 'V03' ? 7 : 7.5), 6);
    });
  });

  test('V01 et V03 : un test sans charge connue se dit « le cran au-dessus » (§10, rang 4)', () => {
    const c = F.cas.filter((x) => x.id === 'V01')[0];
    const k = consigneDuCas(c);
    expect(k.haut.charge).toBeNull();
    const l = M.libellesConsigne(k, c.avant);
    expect(l.jaune[1]).toBe('puis le cran au-dessus' + NB + '×' + NB + '8 sur la dernière série');
  });
});

// ── A1 — L'ÉCART HABITUEL, SUR LES 8 DERNIERS ÉCARTS ─────────────────────
describe('49-U18 — l’écart habituel se lit sur les 8 derniers écarts (§9.9, §12.6)', () => {
  const jour = (j) => new Date(Date.UTC(2026, 0, 1) + j * 86400000).toISOString();
  const seance = (j) => ({ debut: jour(j), palier: 50, neutre: false,
    series: [{ charge_kg: 50, reps: 8, rpe: null, role: 'palier', origine: 'palier' }] });

  test('deux fois par semaine il y a un an, une fois par semaine depuis : l’habitude est 7, pas 3,5', () => {
    const l = [];
    let j = 0;
    for (let i = 0; i < 20; i++) { l.push(seance(j)); j += i % 2 ? 4 : 3; }
    for (let i = 0; i < 8; i++) { j += 7; l.push(seance(j)); }
    const avant = jour(j + 14);
    expect(M.ecartHabituel(l, avant)).toBe(7);
    // 14 jours d'absence : 2 fois l'habitude, pas une reprise.
    expect(M.repriseDe(l, avant)).toBe('aucune');
    // Sur TOUT l'historique, la médiane retombait sous 4,7 jours : une reprise.
    const ecarts = [];
    for (let i = 1; i < l.length; i++) ecarts.push((Date.parse(l[i].debut) - Date.parse(l[i - 1].debut)) / 86400000);
    ecarts.sort((a, b) => a - b);
    expect(ecarts[Math.floor(ecarts.length / 2)]).toBeLessThan(14 / 3);
  });
});

// ── A2 — UNE REPRISE RESTE DANS LA ZONE ──────────────────────────────────
describe('49-U18 — une reprise ne vise jamais au-dessus du haut de la zone (§9.9)', () => {
  test('la borne se dit : « Ta zone Volume va jusqu’à 12 : je vise 12. »', () => {
    const c = F.cas.filter((x) => x.id === 'B03')[0];
    const k = consigneDuCas(c);
    expect(k.fondement.borneZone).toEqual({ zone: 'volume', haut: 12, niveau: 15 });
    const l = M.libellesConsigne(k, c.avant);
    expect(l.jaune).toEqual(['24,8' + NB + 'kg' + NB + '×' + NB + '12']);
    expect(l.gris).toBe('Reprise après une pause' + NB + ': ta charge de travail, sans rep de plus.' +
      ' Ta zone Volume va jusqu\'à 12' + NB + ': je vise 12.');
    expect(M.pourquoiConsigne(k, 'normal', c.avant).etat).toContain('Ta zone Volume va jusqu\'à 12' + NB + ': je vise 12.');
  });

  test('la reprise longue aussi, avec sa propre phrase', () => {
    const c = F.cas.filter((x) => x.id === 'B01')[0];
    const l = M.libellesConsigne(consigneDuCas(c), c.avant);
    expect(l.gris).toMatch(/Le test te ramènera à 65.kg\. Ta zone Mix va jusqu'à 8.: je vise 8\.$/);
  });

  test('sans dépassement, ni borne ni phrase (E02 : reprise à 15, zone 15-20)', () => {
    const c = F.cas.filter((x) => x.id === 'E02')[0];
    const k = consigneDuCas(c);
    expect(k.etat).toBe('reprise_courte');
    expect(k.fondement.borneZone).toBeUndefined();
    expect(M.libellesConsigne(k, c.avant).gris).not.toMatch(/Ta zone/);
  });

  test('l’étirement n’est PAS borné : il dépasse la zone exprès (N8 : 28 kg × 13 en Volume 10-12)', () => {
    const N8 = require('./fixtures/consigne-48b7.json').filter((c) => c.id === 'N8')[0];
    const k = M.consignePour(N8.seances, N8.avant, { reglage: N8.reglage, equipement: N8.equipement, correction: null });
    expect(k.etat).toBe('etirement');
    expect(k.ligne.vise).toBe(13);
    expect(k.ligne.vise).toBeGreaterThan(M.zoneParCle(k.zone).haut);
  });
});

// ── A3 — LA CHARGE PLUS LOURDE, SUR 12 MOIS HORS BARRE ───────────────────
describe('49-U18 — la charge déjà utilisée plus lourde, 12 mois hors barre (§10.2)', () => {
  const COUPURE = '2026-10-01T18:00:00+00:00';
  const il = (jours) => new Date(Date.parse(COUPURE) - jours * 86400000).toISOString();
  // Une séance-exercice à une seule charge, telle que `analyser` la décrit
  // (comme au §10.2 de `v2-moteur.test.js`).
  const une = (kg, jours) => ({ debut: il(jours), palier: kg,
    retenues: [{ charge_kg: kg, reps: 10 }], votantes: [{ charge_kg: kg, reps: 10 }] });
  // Le tirage visage du 01/10 : un 25 kg vieux de 17 mois, un 27 récent.
  const visage = [une(25, 520), une(22.5, 60), une(27, 40), une(24.8, 26), une(24.8, 12)];

  test('poulie, machine, haltères : la charge de plus d’un an ne compte plus — 27, pas 25', () => {
    ['poulie', 'machine', 'haltere'].forEach((eq) => {
      expect(M.chargeVoisine(visage, COUPURE, 24.8, eq, 1)).toBe(27);
    });
  });

  test('à la barre, sans limite de date (les disques sont les mêmes partout)', () => {
    expect(M.chargeVoisine(visage, COUPURE, 24.8, 'barre', 1)).toBe(25);
  });

  test('vers le bas, sans limite de date (le repli a sa propre limite de 10 %)', () => {
    const vieux = [une(20, 600), une(30, 10)];
    expect(M.chargeVoisine(vieux, COUPURE, 30, 'poulie', -1)).toBe(20);
  });

  test('le pas de salle (rang 1, 24 mois) ne change pas', () => {
    const pas = [une(40, 700), une(42.5, 650), une(45, 600), une(47.5, 500), une(50, 10)];
    expect(M.pasDeSalle(pas, COUPURE)).toEqual({ pas: 2.5, nature: 'exact' });
    expect(M.chargeVoisine(pas, COUPURE, 50, 'machine', 1)).toBe(52.5);
  });
});

// ── B4 — UNE LIGNE NON COUVERTE PREND LA CHARGE DU COACH (I25) ───────────
describe('49-U18 — une ligne de travail non couverte prend la charge du coach (§9.13, I25)', () => {
  const libre = (id) => ({ id, type_serie: 'travail', charge_kg: null, reps: null, validee_a: null });
  // Le couché du 01/10 : « rejoint » sans ligne basse, un haut à 92 × 11 sur 3
  // séries, une routine de 4.
  const rejoint = { etat: 'rejoint', zone: 'volume', palier: 92, niveau: 11, n: 3, ligne: null,
                    haut: { charge: 92, vise: 11, k: 3 }, fondement: {} };
  const seance = () => ({ id: 'S', debut: '2026-10-01T17:07:00Z', edition: false,
    exercices: [{ exercise_slug: 'couche', series: [libre('a'), libre('b'), libre('c'), libre('d')] }] });
  const entrees = (consigne) => ({ seance: seance(), consignes: { couche: { consigne: consigne } }, paris: [] });

  test('la 1re ligne n’est plus hors plan : la charge et la visée du haut, à la ligne (pas un test)', () => {
    const p = T.planDeSeance(entrees(rejoint));
    const l = p.exercices[0].lignes;
    expect(l.map((x) => [x.role, x.charge, x.vise])).toEqual([
      ['ligne', 92, 11], ['test', 92, 11], ['test', 92, 11], ['test', 92, 11]]);
    // Son pré-remplissage vient du plan, et son pari existe.
    expect(l[0].fantome).toMatchObject({ charge: 92, reps: 11 });
    expect(p.exercices[0].paris[0]).not.toBeNull();
    expect(T.verifierPlan(p, entrees(rejoint)).erreurs).toEqual([]);
    // L'en-tête lit la même source : « 92 kg × 11 », jamais « le cran
    // au-dessus × null » (trouvé au rejeu de la séance du 01/10).
    expect(p.exercices[0].entete.jaune).toEqual(['92' + NB + 'kg' + NB + '×' + NB + '11']);
    expect(p.exercices[0].donc).toBe('Donc 92' + NB + 'kg' + NB + '×' + NB + '11.');
  });

  test('I25 attrape une ligne de travail laissée hors plan sous une consigne', () => {
    const p = T.planDeSeance(entrees(rejoint));
    const forge = JSON.parse(JSON.stringify(p));
    forge.exercices[0].lignes[0] = { iSerie: 0, id: 'a', type: 'travail', validee: false, role: 'hors' };
    const e = T.verifierPlan(forge).erreurs.filter((x) => x.indexOf('I25') === 0);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/série de travail 0 est hors plan sous une consigne « rejoint »/);
  });

  test('sans aucune ligne (silence), rien n’est couvert — et I25 ne dit rien', () => {
    const p = T.planDeSeance(entrees({ etat: 'silence', raison: 'premiere_fois', fondement: {} }));
    expect(p.exercices[0].lignes.every((x) => x.role === 'hors')).toBe(true);
    expect(T.verifierPlan(p).erreurs.filter((x) => x.indexOf('I25') === 0)).toEqual([]);
  });
});

// ── B5 — UNE DÉGRESSIVE NE REPREND JAMAIS UNE ANCIENNE SÉANCE ────────────
describe('49-U18 — une dégressive que le coach laisse vide reste vide (§9.15.3)', () => {
  test('la cascade ne remplit pas une dégressive depuis la fois d’avant (le curl EZ : 15 kg)', () => {
    const prec = { seance: {}, series: [
      { charge_kg: 20, reps: 10, type_serie: 'travail' }, { charge_kg: 15, reps: 10, type_serie: 'degressive' }] };
    const s = { exercices: [{ exercise_slug: 'curl', series: [
      { id: 'a', type_serie: 'travail', charge_kg: null, reps: null },
      { id: 'b', type_serie: 'degressive', charge_kg: null, reps: null }] }] };
    expect(S.fantome(s, 0, 0, prec).charge_kg).toBe(20);
    expect(S.fantome(s, 0, 1, prec).charge_kg).toBeNull();
  });

  test('à la barre (le curl EZ à 20 kg) : la dégressive posée se remplit à 15 kg, et dit quoi enlever (94)', () => {
    const k = { etat: 'progression', zone: 'volume', palier: 20, niveau: 10, n: 1,
                ligne: { charge: 20, vise: 11 }, haut: null, fondement: {} };
    const p = T.planDeSeance({
      seance: { id: 'S', debut: '2026-10-01T17:07:00Z', edition: false, exercices: [{ exercise_slug: 'curl', series: [
        { id: 'a', type_serie: 'travail', charge_kg: null, reps: null, validee_a: null },
        { id: 'b', type_serie: 'degressive', charge_kg: null, reps: null, validee_a: null }] }] },
      consignes: { curl: { consigne: k } }, paris: [],
      catalogue: { curl: { equipement: 'barre', muscles_primaires: ['biceps'] } }
    });
    const x = p.exercices[0];
    expect(x.degressive).toMatchObject({ charge: 15, enleve: 2.5,
                                         phrase: 'Enlève 2,5\u00a0kg de chaque côté : 15\u00a0kg. Sans repos, jusqu\'à l\'échec. Vise 4 à 6.' });
    expect(x.lignes[1].fantome).toMatchObject({ charge: 15, source: 'degressive' });
  });
});

// ── C — LES PHRASES ──────────────────────────────────────────────────────
describe('49-U18 — « Même cible » seulement si c’est la même (principe ii)', () => {
  const jour = (d) => '2026-09-' + d + 'T18:00:00+00:00';
  const serie = (kg, reps, role) => ({ charge_kg: kg, reps: reps, rpe: null, role: role || 'palier', origine: role || 'palier' });
  const s = (d, palier, l) => ({ debut: jour(d), palier: palier, neutre: false, series: l });
  const O = { reglage: 'normal', equipement: 'haltere', correction: null };
  // Le couché du 26/09 : une montée (88), puis 92 ; le 01/10 vise 92 × 11.
  const histoire = [s('17', 88, [serie(88, 10), serie(88, 10), serie(88, 10)]),
                    s('20', 88, [serie(88, 10), serie(88, 10), serie(88, 11)]),
                    s('23', 88, [serie(88, 11), serie(88, 11), serie(92, 11, 'exploration')]),
                    s('26', 92, [serie(88, 10, 'rampe'), serie(92, 11), serie(92, 11)])];

  test('le couché : la cible passait de 92 × 11 à 92 × 10 — « Prochaine séance », pas « Même cible »', () => {
    const avant = M.consignePour(histoire, jour('30'), O);
    expect(avant.etat).toBe('rejoint');
    expect(avant.haut).toMatchObject({ charge: 92, vise: 11 });
    const jourJ = s('30', 92, [serie(92, 10), serie(92, 9), serie(92, 9)]);
    const apres = M.consignePour(histoire.concat([jourJ]), '2026-10-05T18:00:00+00:00', O);
    const c = M.constatDe(avant, apres, 'normal', null);
    expect(c.suite).not.toMatch(/^Même cible/);
    expect(c.suite).toMatch(/^Prochaine séance/);
  });

  test('et quand la cible est vraiment la même, « Même cible » reste (K7, le cas livré)', () => {
    const K7 = require('./fixtures/constat-48b6b.json').filter((c) => c.id === 'K7')[0];
    expect(K7.constat.suite).toMatch(/^Même cible/);
    const c = M.constatDe(M.consignePour(K7.seances, K7.avant, { reglage: K7.reglage, equipement: K7.equipement }),
      M.consignePour(K7.seances.concat([K7.seanceDuJour]), K7.apres, { reglage: K7.reglage, equipement: K7.equipement }),
      K7.reglage, K7.cranSuivant);
    expect(c.suite).toBe(K7.constat.suite);
  });
});

// ── C (ii) — LA SUITE ET LA CONSIGNE REÇOIVENT LES MÊMES ENTRÉES ─────────
//
// Dans l'app (`suiteDe`), la consigne de la prochaine séance — celle que le
// constat annonce — et la consigne de la séance (`consigneDe`) sont le même
// calcul, `Moteur.consigneDExercice` : elles reçoivent maintenant les mêmes
// options (`optionsDeConsigne`). On rejoue `suiteDe` dans un bac, et on lit ce
// qu'il passe au moteur.
describe('49-U18 — la cible du constat : un seul calcul (« le coach ne fait qu’un »)', () => {
  const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  const extraire = (nom) => {
    const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
    if (!m) throw new Error('introuvable : ' + nom);
    return m[0];
  };

  test('`suiteDe` passe au moteur exactement les options de la consigne', () => {
    const vus = [];
    const periodes = [{ debut: 'x', fin: 'y', n: 3 }];
    const ctx = {
      seance: { id: 'S', debut: '2026-10-01T17:07:00Z' }, profil: { intention: 'progresser' },
      local: { exercices: [{ slug: 'curl', equipement: 'barre' }], zones: [] },
      constats: null, etatsExercices: {}, rejeuEnCours: null,
      Modele: { indexerExercices: (l) => ({ curl: l[0] }), gabaritDe: () => ({ mesure: 'charge_reps' }), lesteDe: () => null, parentDe: () => null },
      Profil: { rythmeDe: () => 'normal', salleDeLExercice: () => null },   // 108 — la salle (aucune ici)
      Seance: { partEnBase: () => true },
      Moteur: { suiteDExercice: (g, j, e, a, o) => { vus.push(o); return null; },
                equipementEffectif: (e) => (e ? e.equipement || null : null) },
      // 50-1 : les deux lectures du profil et des modes que `optionsDeConsigne` appelle.
      intentionDeLExercice: () => 'progresser', lestReponseDe: () => null,
      // `suiteDe` lit le catalogue indexé de l'app (PR 2 de la consolidation).
      catalogueIndexe: () => ({ curl: { slug: 'curl', equipement: 'barre' } }),
      cleConsignes: () => 'k', empreinteValidations: () => 'e', exerciceFini: () => true,
      seriesDeTravailDe: () => [],
      // 58-1 : les séances d'un exercice viennent du module des faits.
      faits: { seancesDeLExercice: () => [] }, corpus: () => ({}),
      zoneDe: () => 'mix', seancesSousConsigne: () => ['s1'],
      periodesAllegees: () => [], periodesSerieDePlusDe: () => periodes, enEdition: () => false,
      // 52-1 : la charge de départ de la routine (MOTEUR §9.21), lue par `optionsDeConsigne`.
      chargeDeDepartDe: () => null,
      // 127 : la marche à proposer (MOTEUR §9.17 bis), lue par `optionsDeConsigne` — aucune ici.
      marcheAProposer: () => null,
      // 53-2 bis : la ligne de zone en vigueur (son origine, « Nouveau bloc »).
      ligneDeZoneDe: () => null,
      // 53-2 bis : les zones lues (`local.zones` sans les lignes rendues sans objet par un arrêt).
      zonesLues: () => []
    };
    vm.createContext(ctx);
    ['optionsDeConsigne', 'suiteDe'].forEach((n) => vm.runInContext(extraire(n), ctx));
    vm.runInContext('suiteDe("curl")', ctx);
    const attendu = vm.runInContext('optionsDeConsigne("curl", local.exercices[0])', ctx);
    expect(vus).toHaveLength(1);
    expect(JSON.stringify(vus[0])).toBe(JSON.stringify(attendu));
    // Et ce sont bien celles qui manquaient : la série de plus, la zone par date…
    expect(vus[0].periodesSerieDePlus).toEqual(periodes);
    expect(vus[0].seancesSousConsigne).toEqual(['s1']);
  });
});

describe('50-1 — la version', () => {
  // 5 depuis 49-U18 ; 6 depuis 50-1 (MOTEUR §9.17 : le poids du corps suit la
  // consigne des charges, la charge valant 0 — une règle de la consigne change) ;
  // 7 depuis 51-3 (MOTEUR §9.20 : une séance marquée « douleur » est neutre) ;
  // 8 depuis 53-1 (MOTEUR §9.10 : la charge se reporte au changement de zone) ;
  // 9 depuis 54-1 (MOTEUR §12.2 bis : la zone d'une séance se lit à sa fin).
  // 11 depuis 68A (MOTEUR §9.14 bis, l'élan) ; 12 depuis 68B (§9.14 ter, « à fond »).
  test('VERSION_CONSIGNE vaut 13 (74)', () => {
    expect(M.VERSION_CONSIGNE).toBe(13);
  });
});

// ── SECOND COMMIT (décisions du 02/10/2026) ──────────────────────────────
describe('49-U18 bis — le mot d’ordre se lit sur le rang (principe i)', () => {
  const serie = (kg, reps, role) => ({ charge_kg: kg, reps: reps, rpe: null, role: role || 'palier', origine: role || 'palier' });
  const s = (j, palier, l) => ({ debut: '2026-09-' + j + 'T18:00:00+00:00', palier: palier, neutre: false, series: l });
  const O = { reglage: 'normal', equipement: 'haltere', correction: null };
  const debut = [s('17', 88, [serie(88, 10), serie(88, 10), serie(88, 10)]),
                 s('20', 88, [serie(88, 10), serie(88, 10), serie(88, 11)]),
                 s('23', 88, [serie(88, 11), serie(88, 11), serie(92, 11, 'exploration')])];
  const gris = (derniere) => {
    const k = M.consignePour(debut.concat([s('26', 92, derniere)]), '2026-10-01T17:00:00+00:00', O);
    expect(k.etat).toBe('rejoint');
    return M.libellesConsigne(k, '2026-10-01T17:00:00+00:00').gris;
  };

  test('une montée (88, 92, 92) : « Ta première série à 88 kg » — le couché du 01/10', () => {
    expect(gris([serie(88, 10, 'rampe'), serie(92, 11), serie(92, 11)]))
      .toBe('Ta première série à 88' + NB + 'kg passe à 92' + NB + 'kg.');
  });

  test('une série restée en fin de séance (92, 92, 88) : « Ta dernière série à 88 kg »', () => {
    expect(gris([serie(92, 11), serie(92, 11), serie(88, 10, 'travail')]))
      .toBe('Ta dernière série à 88' + NB + 'kg passe à 92' + NB + 'kg.');
  });

  test('entre les deux (92, 88, 92) : ni première ni dernière, « Ta série restée »', () => {
    expect(gris([serie(92, 11), serie(88, 10, 'travail'), serie(92, 11)]))
      .toBe('Ta série restée à 88' + NB + 'kg passe à 92' + NB + 'kg.');
  });

  test('N5, le cas livré corrigé : « Ta première série à 125 kg »', () => {
    const N5 = require('./fixtures/consigne-48b7.json').filter((c) => c.id === 'N5')[0];
    expect(N5.phrases.gris).toBe('Ta première série à 125' + NB + 'kg passe à 130' + NB + 'kg.');
  });
});

describe('49-U18 bis — la phrase des chauffes disparaît dès qu’une chauffe est validée', () => {
  const k = { etat: 'progression', zone: 'mix', palier: 52.5, niveau: 8, n: 2,
              ligne: { charge: 52.5, vise: 8 }, haut: null, fondement: {} };
  const ligne = (id, type, faite) => ({ id, type_serie: type, charge_kg: faite ? faite[0] : null,
    reps: faite ? faite[1] : null, validee_a: faite ? '2026-10-01T17:10:00Z' : null, reps_visees: type === 'echauffement' ? 10 : null });
  const plan = (premiere) => T.planDeSeance({
    seance: { id: 'S', debut: '2026-10-01T17:07:00Z', edition: false, exercices: [{ exercise_slug: 'mil', series: [
      ligne('c1', 'echauffement', premiere), ligne('c2', 'echauffement'), ligne('t1', 'travail'), ligne('t2', 'travail')] }] },
    consignes: { mil: { consigne: k } }, paris: [],
    catalogue: { mil: { equipement: 'barre', muscles_primaires: ['deltoide_anterieur'] } }
  }).exercices[0];

  test('avant : « Chauffes calées sur 52,5 kg : 20 · 45 kg. »', () => {
    expect(plan(null).chauffes.phrase.replace(/\u00a0/g, ' ')).toBe('Chauffes calées sur 52,5 kg : 20 · 45 kg.');
  });

  test('une chauffe faite à 40 × 6 : plus de phrase ; la 2e chauffe garde sa charge pré-remplie', () => {
    const x = plan([40, 6]);
    expect(x.chauffes.phrase).toBeNull();
    expect(x.lignes[1].fantome).toMatchObject({ charge: 45, source: 'chauffe' });
  });
});

describe('49-U18 bis — sous « rejoint », les lignes ne sont pas un test', () => {
  const libre = (id) => ({ id, type_serie: 'travail', charge_kg: null, reps: null, validee_a: null });
  const plan = (consigne) => T.planDeSeance({
    seance: { id: 'S', debut: '2026-10-01T17:07:00Z', edition: false,
              exercices: [{ exercise_slug: 'x', series: [libre('a'), libre('b'), libre('c')] }] },
    consignes: { x: { consigne: consigne } }, paris: [] }).exercices[0];

  test('« rejoint » : la feuille dit « consigne », la nouvelle charge de travail', () => {
    const x = plan({ etat: 'rejoint', zone: 'volume', palier: 92, niveau: 11, n: 3, ligne: null,
                     haut: { charge: 92, vise: 11, k: 3 }, fondement: {} });
    expect(x.pourquoi.lignes.map((l) => l.libelle)).toEqual(['consigne', 'consigne', 'consigne']);
    // Le rôle interne ne change pas : les paris et la réaction le lisent.
    expect(x.lignes.map((l) => l.role)).toEqual(['test', 'test', 'test']);
  });

  test('un vrai test (« test proposé ») garde son étiquette', () => {
    const x = plan({ etat: 'test_propose', zone: 'volume', palier: 24.8, niveau: 12, n: 3,
                     ligne: { charge: 24.8, vise: 12 }, haut: { charge: 27, vise: 10, k: 1 }, fondement: {} });
    expect(x.pourquoi.lignes.map((l) => l.libelle)).toEqual(['consigne', 'consigne', 'test']);
  });
});

describe('49-U18 bis — la machine Smith suit les machines (12 mois)', () => {
  const COUPURE = '2026-10-01T18:00:00+00:00';
  const une = (kg, jours) => ({ debut: new Date(Date.parse(COUPURE) - jours * 86400000).toISOString(), palier: kg,
    retenues: [{ charge_kg: kg, reps: 10 }], votantes: [{ charge_kg: kg, reps: 10 }] });
  const h = [une(62.5, 500), une(50, 60), une(70, 40), une(60, 20), une(60, 10)];

  test('la charge de plus d’un an ne compte plus : 70, pas 62,5', () => {
    expect(M.chargeVoisine(h, COUPURE, 60, 'machine_smith', 1)).toBe(70);
    expect(M.chargeVoisine(h, COUPURE, 60, 'barre', 1)).toBe(62.5);
  });
});
