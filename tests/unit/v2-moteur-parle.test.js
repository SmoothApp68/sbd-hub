//
// 48b-5b-2 — le moteur parle à l'écran : le pont depuis `analyser`, le plan,
// le fantôme au rang 2, la déviation contre la proposition, l'en-tête, les
// silences. MOTEUR §9.13 · ECRAN-SAISIE §3.1, §7 septendecies.3, §7 unvicies.
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// Le cas réel du couché — dernière séance 125 × 5, 125 × 5, test 130 × 3 —
// ne sépare PAS « juger la déviation contre le plan » de « juger contre la
// dernière séance » : le plan et la dernière séance y proposent tous deux 125
// sur la 1re série. Il faut une dernière séance à **122,5** au 1er rang et un
// plan à 125 : taper 125 n'est une déviation que dans l'ancienne règle, et
// c'est elle qui aurait effacé les 130 de la ligne du test.
//
// Chaque règle se teste là où l'autre est neutre (§7 unvicies.3) : la
// déviation sur une ligne COUVERTE par le plan, le plan sur une ligne NON
// MODIFIÉE.
//
// Environnement jsdom (pas de docblock `node`) : `rendu.js` se termine par
// `this`, et c'est `window.THRendu` qu'on lit.

require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
// Depuis 48b-6a, `moteur.js` lit aussi `THProfil` — le libellé du rythme que
// la feuille « Pourquoi » énonce vit dans `profil.js`, une seule fois.
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/rendu.js');
const Modele = window.THModele;
const Palier = window.THPalier;
const Moteur = window.THMoteur;
const Seance = require('../../v2/js/seance.js');
const Rendu = () => window.THRendu;

const NB = ' ';
let n = 0;
const uuid = () => 'id-' + (++n);
beforeEach(() => { n = 0; });

// Une série de l'HISTORIQUE, telle que `seriesDe` la rend : elle porte son
// rang, son identifiant et son slug — `analyser` trie dessus.
const brute = (kg, reps, type, rpe) => ({
  id: uuid(), rang: n, charge_kg: kg, reps: reps, rpe: rpe === undefined ? null : rpe,
  ressenti: null, type_serie: type || 'travail', exercise_slug: 'dc'
});
// Une série TELLE QUE `precedent` la rend.
const p = (charge, reps, type) => ({
  charge_kg: charge, reps: reps, duree_s: null, distance_m: null,
  type_serie: type || 'travail'
});
const prec = (series) => ({ seance: { id: 'p1' }, series: series });
const jour = (md) => '2026-' + md + 'T18:00:00+00:00';
const AVANT = jour('09-20');

// Les quatre séances de montée régulière qui précèdent chaque cas réel :
// 115 → 122,5 par 2,5, trois séries de 5. Elles donnent la zone Lourd et le pas
// de la barre, exactement comme dans `consigne-48b5b1.json`.
function montee() {
  return [
    { seance: { id: 'S4', debut: jour('08-09') }, series: [brute(122.5, 5), brute(122.5, 5), brute(122.5, 5)] },
    { seance: { id: 'S3', debut: jour('08-02') }, series: [brute(120, 5), brute(120, 5), brute(120, 5)] },
    { seance: { id: 'S2', debut: jour('07-26') }, series: [brute(117.5, 5), brute(117.5, 5), brute(117.5, 5)] },
    { seance: { id: 'S1', debut: jour('07-19') }, series: [brute(115, 5), brute(115, 5), brute(115, 5)] }
  ];
}
// Le cas réel du couché : quatre chauffes, 125 × 5, 125 × 5, test 130 × 3.
function couche() {
  return [{
    seance: { id: 'S5', debut: jour('09-13') },
    series: [brute(20, 15, 'echauffement'), brute(60, 10, 'echauffement'),
             brute(100, 5, 'echauffement'), brute(115, 1, 'echauffement'),
             brute(125, 5), brute(125, 5), brute(130, 3)]
  }].concat(montee());
}
const OPTIONS = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser',
                  reglage: 'normal', edition: false };

// La séance ouverte : un exercice, des séries VIDES, chauffes puis travail.
function ouverte(types) {
  let s = Seance.creer({ id: 'S', userId: 'u', idSerie: uuid });
  s = Seance.ajouterExercice(s, 'dc', uuid);
  for (let i = 1; i < types.length; i++) s = Seance.ajouterSerie(s, 0, uuid);
  types.forEach((t, i) => { if (t !== 'travail') s = Seance.changerType(s, 0, i, t); });
  return s;
}
const T = (k) => Array.from({ length: k }, () => 'travail');
const W = (k) => Array.from({ length: k }, () => 'echauffement');

// ── LE PONT ─────────────────────────────────────────────────────────────────
describe('le pont depuis analyser (MOTEUR §9.13)', () => {
  test('chacun des huit rôles est traduit, et `null` va en « autre »', () => {
    const s = (kg) => ({ charge_kg: kg, reps: 5, rpe: null, ressenti: null });
    const resultat = {
      palier: 125,
      series: [
        { serie: s(20), role: 'chauffe' }, { serie: s(60), role: 'chauffe_probable' },
        { serie: s(120), role: 'rampe' }, { serie: s(125), role: 'travail' },
        { serie: s(122.5), role: 'travail' }, { serie: s(130), role: 'exploration' },
        { serie: s(110), role: 'descente_choisie' }, { serie: s(100), role: 'degressive' },
        { serie: s(125), role: 'echec' }, { serie: s(125), role: null }
      ]
    };
    const c = Moteur.seanceDuContrat(jour('09-13'), resultat);
    expect(c.debut).toBe(jour('09-13'));
    expect(c.palier).toBe(125);
    expect(c.series.map((x) => x.role)).toEqual([
      'autre', 'autre', 'rampe', 'palier', 'travail', 'exploration',
      'autre', 'autre', 'autre', 'autre'
    ]);
    // ⚠️ ET `origine` GARDE LE RÔLE D'`analyser`, CELUI QUE LE CONTRAT EFFACE
    // (48b-6a). Les six rôles que la colonne ci-dessus résume en « autre » se
    // relisent ici un par un : c'est ce qui permet à la feuille « Pourquoi »
    // de dire « dégressive, ne compte pas » là où le contrat ne sait plus que
    // « autre ». Un `null` reste `null` — on ne lui invente pas d'origine.
    expect(c.series.map((x) => x.origine)).toEqual([
      'chauffe', 'chauffe_probable', 'rampe', 'travail', 'travail', 'exploration',
      'descente_choisie', 'degressive', 'echec', null
    ]);
    // L'ordre des séries est conservé, et chaque série garde ses cinq champs.
    expect(c.series.map((x) => x.charge_kg)).toEqual([20, 60, 120, 125, 122.5, 130, 110, 100, 125, 125]);
    expect(Object.keys(c.series[3]).sort())
      .toEqual(['charge_kg', 'origine', 'reps', 'ressenti', 'role', 'rpe']);
  });

  test('DISCRIMINANT — « travail » AU PALIER devient « palier », sous le palier reste « travail »', () => {
    // Séance `125, 125, 122,5, 130` : palier 125. La série à 122,5 est du
    // travail entier, mais elle n'a pas tenu le palier — elle ne vote pas pour
    // le niveau validé. Sans cette distinction, `niveauValide` la lirait.
    const r = Palier.analyser([brute(125, 5), brute(125, 5), brute(122.5, 8), brute(130, 3)],
      undefined, { mesure: 'charge_reps' });
    const c = Moteur.seanceDuContrat(jour('09-13'), r);
    expect(c.palier).toBe(125);
    expect(c.series.map((x) => x.charge_kg + ':' + x.role))
      .toEqual(['125:palier', '125:palier', '122.5:travail', '130:exploration']);
  });

  test('sur la vraie sortie d’analyser, les chauffes tombent en « autre »', () => {
    const r = Palier.analyser(couche()[0].series, undefined, { mesure: 'charge_reps' });
    const c = Moteur.seanceDuContrat(jour('09-13'), r);
    expect(c.series.map((x) => x.role))
      .toEqual(['autre', 'autre', 'autre', 'autre', 'palier', 'palier', 'exploration']);
  });

  // ⚠️ AJOUTÉ LE 20/09 SUR UNE QUESTION D'AURÉLIEN, ET C'ÉTAIT UN TROU : aucun
  // test ne faisait passer un EFFORT par le pont. Les 39 + 37 cas des fixtures
  // nourrissent `consignePour` directement, en forme de contrat ; un pont qui
  // perdait `rpe` ou `ressenti` survivait à 2 391 tests. Ici la série a la forme
  // que l'app lui donne (toutes les colonnes de `COLONNES_SET`), et le cas est
  // N10 du fichier de 5a-2 : 130 × 5 à RPE 10 se compte 4, donc le haut vise 4
  // et la phrase dit « est entré dans ta zone » — pas « a touché le haut ».
  describe('DISCRIMINANT — l’effort d’une série de l’app traverse le pont jusqu’à la consigne', () => {
    let k = 0;
    const app = (kg, reps, effort) => ({
      id: 'a' + (++k), rang: k, session_id: 'S5', user_id: 'u', exercise_slug: 'squat',
      source: 'app', type_serie: 'travail', charge_kg: kg, reps: reps, duree_s: null,
      distance_m: null, rpe: typeof effort === 'number' ? effort : null,
      ressenti: typeof effort === 'string' ? effort : null, note: null,
      groupe_superset: null, validee_a: jour('09-13'), repos_s: null
    });
    // N10 : 120 × 5 (une rampe — l'exercice « monte »), 125 × 5, 125 × 5, puis le
    // test 130 × 5 avec l'effort.
    const squat = (effort) => {
      k = 0;
      return [{ seance: { id: 'S5', debut: jour('09-13') },
        series: [app(120, 5), app(125, 5), app(125, 5), app(130, 5, effort)] }].concat(montee());
    };
    const ETAT = { etat: Palier.ETAT_MONTE };
    const N10 = {
      attendu: { etat: 'etend', zone: 'lourd', n: 3, ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 2 } },
      test: { charge: 130, reps: 5, niveau: 4, date: jour('09-13') },
      jaune: ['130' + NB + 'kg sur les 2 dernières séries, vise 4', 'et 125' + NB + 'kg sur celle d\'avant, vise 5'],
      gris: 'Ton test à 130 du 13' + NB + 'sept. est entré dans ta zone' + NB + ': il gagne une série.'
    };

    test('à RPE 10, le pont garde le rpe : le test se compte 4, le haut vise 4', () => {
      const r = Palier.analyser(squat(10)[0].series, ETAT, { mesure: 'charge_reps' });
      const pont = Moteur.seanceDuContrat(jour('09-13'), r);
      expect(pont.series[3]).toEqual({ charge_kg: 130, reps: 5, rpe: 10, ressenti: null,
                                       role: 'exploration', origine: 'exploration' });
      const c = Moteur.consigneDExercice(squat(10), ETAT, AVANT, OPTIONS);
      expect(c.consigne).toMatchObject(N10.attendu);
      expect(c.consigne.fondement.test).toEqual(N10.test);
      expect(c.libelles).toEqual({ jaune: N10.jaune, gris: N10.gris });
    });

    test('à « reste 0 », le pont garde le ressenti : même compte, même consigne', () => {
      const pont = Moteur.seanceDuContrat(jour('09-13'),
        Palier.analyser(squat('reste_0')[0].series, ETAT, { mesure: 'charge_reps' }));
      expect(pont.series[3]).toEqual({ charge_kg: 130, reps: 5, rpe: null, ressenti: 'reste_0',
                                       role: 'exploration', origine: 'exploration' });
      const c = Moteur.consigneDExercice(squat('reste_0'), ETAT, AVANT, OPTIONS);
      expect(c.consigne).toMatchObject(N10.attendu);
      expect(c.libelles).toEqual({ jaune: N10.jaune, gris: N10.gris });
    });

    test('témoin — sans effort, 130 × 5 touche le haut : vise 5, « a touché le haut »', () => {
      const c = Moteur.consigneDExercice(squat(null), ETAT, AVANT, OPTIONS);
      expect(c.consigne.haut).toEqual({ charge: 130, vise: 5, k: 2 });
      expect(c.libelles.jaune[0]).toBe('130' + NB + 'kg sur les 2 dernières séries, vise 5');
      expect(c.libelles.gris).toContain('a touché le haut de ta zone');
    });
  });

  test('une séance sans palier (pyramide) traverse le pont sans « palier »', () => {
    const r = Palier.analyser([brute(100, 5), brute(110, 3), brute(120, 1)],
      undefined, { mesure: 'charge_reps' });
    const c = Moteur.seanceDuContrat(jour('09-13'), r);
    expect(c.palier).toBeNull();
    expect(c.series.every((x) => x.role === 'travail')).toBe(true);
  });
});

// ── LE PLAN ─────────────────────────────────────────────────────────────────
describe('le plan : les séries de travail de la séance en cours (§7 septendecies.3, §9.13 49-C)', () => {
  const consigne = (n, ligne, haut) => ({ etat: 'x', n: n, ligne: ligne, haut: haut });
  const L = { charge: 125, vise: 5 }, H = { charge: 130, vise: 4, k: 1 };
  const series = (types) => ouverte(types).exercices[0].series;

  test('n = 3, k = 1 sur 4 chauffes + 3 travail : les chauffes restent nulles', () => {
    const plan = Seance.planDe(series(W(4).concat(T(3))), consigne(3, L, H));
    expect(plan).toEqual([null, null, null, null,
      { charge_kg: 125, reps: 5 }, { charge_kg: 125, reps: 5 }, { charge_kg: 130, reps: 4 }]);
  });

  test('DISCRIMINANT — plus de séries que n : TOUTES sont couvertes, le haut sur la dernière (49-C)', () => {
    // Quatre séries de travail, consigne sur 3 (§9.13, révisé le 26/09/2026) :
    // la séance en cours fait foi, `n` n'est qu'une proposition de départ. La
    // première série reçoit la ligne, comme les autres. Avant 49-C : `null`,
    // et la première série d'une routine à 4 restait hors consigne.
    const plan = Seance.planDe(series(T(4)), consigne(3, L, H));
    expect(plan).toEqual([{ charge_kg: 125, reps: 5 }, { charge_kg: 125, reps: 5 },
      { charge_kg: 125, reps: 5 }, { charge_kg: 130, reps: 4 }]);
  });

  test('DISCRIMINANT — k = 2 : les DEUX dernières reçoivent le haut', () => {
    const plan = Seance.planDe(series(T(3)), consigne(3, L, { charge: 130, vise: 4, k: 2 }));
    expect(plan).toEqual([{ charge_kg: 125, reps: 5 }, { charge_kg: 130, reps: 4 },
      { charge_kg: 130, reps: 4 }]);
  });

  test('moins de séries que n : toutes sont couvertes, le haut sur la dernière', () => {
    const plan = Seance.planDe(series(T(2)), consigne(3, L, H));
    expect(plan).toEqual([{ charge_kg: 125, reps: 5 }, { charge_kg: 130, reps: 4 }]);
  });

  test('« tout passe » (k = n, pas de ligne) couvre toutes les séries avec le haut', () => {
    const plan = Seance.planDe(series(T(3)), consigne(3, null, { charge: 92.5, vise: 12, k: 3 }));
    expect(plan).toEqual([{ charge_kg: 92.5, reps: 12 }, { charge_kg: 92.5, reps: 12 },
      { charge_kg: 92.5, reps: 12 }]);
  });

  test('une charge nulle (« le cran au-dessus ») garde les reps et pas la charge', () => {
    const plan = Seance.planDe(series(T(3)), consigne(3, { charge: 40, vise: 12 },
      { charge: null, vise: 10, k: 1 }));
    expect(plan[2]).toEqual({ charge_kg: null, reps: 10 });
  });

  test('sans consigne, ou consigne en silence : un plan vide', () => {
    expect(Seance.planDe(series(T(3)), null)).toEqual([null, null, null]);
    expect(Seance.planDe(series(T(3)), { etat: 'silence', raison: 'premiere_fois' }))
      .toEqual([null, null, null]);
    expect(Seance.planDe([], consigne(3, L, H))).toEqual([]);
  });

  // ⚠️ AJOUTÉ APRÈS LE BANC DE MUTATION. Le garde `!consigne.n` survivait : une
  // consigne en silence n'a ni `ligne` ni `haut`, donc même sans le garde rien
  // ne s'écrivait. Le garde ne se voit que sur une consigne qui PORTE une ligne
  // sans dire combien de séries elle couvre — et là, il décide : sans `n`, rien
  // n'est couvert. C'est le contrat (§9.13 : une consigne sans `n` n'en est pas
  // une), pas une tolérance : couvrir TOUT par défaut serait la pire des lectures.
  test('DISCRIMINANT — sans `n`, une ligne ne couvre rien', () => {
    expect(Seance.planDe(series(T(3)), { etat: 'x', ligne: L, haut: null })).toEqual([null, null, null]);
    expect(Seance.planDe(series(T(3)), { etat: 'x', n: 0, ligne: L, haut: H })).toEqual([null, null, null]);
  });

  test('les dégressives et les échecs ne sont jamais couverts', () => {
    const plan = Seance.planDe(series(['travail', 'travail', 'degressive', 'echec']), consigne(3, L, H));
    expect(plan).toEqual([{ charge_kg: 125, reps: 5 }, { charge_kg: 130, reps: 4 }, null, null]);
  });
});

// ── LA CASCADE ──────────────────────────────────────────────────────────────
describe('la cascade du fantôme : saisie > plan > dernière séance > cible', () => {
  // Dernière séance : deux chauffes, puis 122,5 · 122,5 · 125. Le plan dit
  // 125 · 125 · 130 sur les trois séries de travail.
  const PREC = () => prec([p(40, 10, 'echauffement'), p(70, 5, 'echauffement'),
                           p(122.5, 5), p(122.5, 5), p(125, 4)]);
  const PLAN = [null, null, { charge_kg: 125, reps: 5 }, { charge_kg: 125, reps: 5 },
                { charge_kg: 130, reps: 4 }];
  const f = (s, i, plan) => Seance.fantome(s, 0, i, PREC(), plan);

  test('DISCRIMINANT — le plan passe DEVANT la dernière séance sur les lignes couvertes', () => {
    const s = ouverte(W(2).concat(T(3)));
    expect(f(s, 2, PLAN)).toMatchObject({ charge_kg: 125, reps: 5 });
    expect(f(s, 4, PLAN)).toMatchObject({ charge_kg: 130, reps: 4 });
    // Sans plan, la dernière séance parle : 122,5 et 125 × 4.
    expect(f(s, 2, null)).toMatchObject({ charge_kg: 122.5, reps: 5 });
    expect(f(s, 4, null)).toMatchObject({ charge_kg: 125, reps: 4 });
  });

  test('les chauffes, non couvertes, gardent la dernière séance', () => {
    const s = ouverte(W(2).concat(T(3)));
    expect(f(s, 0, PLAN)).toMatchObject({ charge_kg: 40, reps: 10 });
    expect(f(s, 1, PLAN)).toMatchObject({ charge_kg: 70, reps: 5 });
  });

  test('DISCRIMINANT — ce qui vient d’être tapé passe DEVANT le plan', () => {
    let s = ouverte(W(2).concat(T(3)));
    s = Seance.modifierSerie(s, 0, 2, { charge_kg: 127.5 });
    // 127,5 dévie de la proposition (125) : il propage sur les lignes de travail
    // suivantes, plan compris.
    expect(f(s, 3, PLAN).charge_kg).toBe(127.5);
    expect(f(s, 4, PLAN).charge_kg).toBe(127.5);
  });

  test('une charge nulle dans le plan retombe sur la dernière séance, les reps restent', () => {
    const s = ouverte(T(3));
    const plan = [{ charge_kg: 125, reps: 5 }, { charge_kg: 125, reps: 5 }, { charge_kg: null, reps: 3 }];
    const pr = prec([p(120, 5), p(120, 5), p(120, 5)]);
    expect(Seance.fantome(s, 0, 2, pr, plan)).toMatchObject({ charge_kg: 120, reps: 3 });
  });

  test('sans dernière séance ni plan, la cible de routine parle (rang 4)', () => {
    const s = ouverte(T(1));
    s.exercices[0].series[0].charge_cible_kg = 60;   // l'intention d'une routine
    expect(Seance.fantome(s, 0, 0, null, [null]).charge_kg).toBe(60);
    // Et le plan passe devant elle.
    expect(Seance.fantome(s, 0, 0, null, [{ charge_kg: 62.5, reps: 8 }]).charge_kg).toBe(62.5);
  });

  test('DISCRIMINANT — les reps du plan passent devant reps_visees, qui passe devant la dernière séance', () => {
    let s = Seance.creer({ id: 'S', userId: 'u', idSerie: uuid });
    s = Seance.ajouterExercice(s, 'dc', uuid, { reps_visees: 8 });
    const pr = prec([p(120, 6)]);
    expect(Seance.fantome(s, 0, 0, pr, [{ charge_kg: 125, reps: 5 }]).reps).toBe(5);
    expect(Seance.fantome(s, 0, 0, pr, [null]).reps).toBe(8);
    expect(Seance.fantome(s, 0, 0, pr, [{ charge_kg: 125, reps: null }]).reps).toBe(8);
    let sans = Seance.creer({ id: 'S2', userId: 'u', idSerie: uuid });
    sans = Seance.ajouterExercice(sans, 'dc', uuid);
    expect(Seance.fantome(sans, 0, 0, pr, [null]).reps).toBe(6);
  });
});

// ── LA DÉVIATION ────────────────────────────────────────────────────────────
describe('la déviation se juge contre ce que la ligne proposait (§7 unvicies)', () => {
  // ⚠️ LA CONFIGURATION DISCRIMINANTE : dernière séance 122,5 au 1er rang,
  // plan à 125. Avec 125 des deux côtés (le cas réel), les deux règles
  // répondent pareil.
  const PREC = () => prec([p(122.5, 5), p(125, 5), p(130, 3)]);
  const PLAN = [{ charge_kg: 125, reps: 5 }, { charge_kg: 125, reps: 5 }, { charge_kg: 130, reps: 4 }];
  const f = (s, i) => Seance.fantome(s, 0, i, PREC(), PLAN);

  test('DISCRIMINANT — valider exactement la proposition de la 1re série ne propage rien', () => {
    let s = ouverte(T(3));
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 125 });   // = le plan, ≠ la dernière séance
    // La ligne du test garde 130. L'ancienne règle aurait propagé 125.
    expect(f(s, 1).charge_kg).toBe(125);
    expect(f(s, 2).charge_kg).toBe(130);
    expect(Seance.derniereSaisie(s.exercices[0], 2, 'charge_kg', PREC(), PLAN)).toBeNull();
  });

  test('DISCRIMINANT — retaper la dernière séance là où le plan dit autre chose EST une déviation', () => {
    let s = ouverte(T(3));
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 122.5 });  // = la dernière séance, ≠ le plan
    expect(f(s, 2).charge_kg).toBe(122.5);
  });

  test('une autre valeur propage, comme aujourd’hui', () => {
    let s = ouverte(T(3));
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 127.5 });
    expect(f(s, 1).charge_kg).toBe(127.5);
    expect(f(s, 2).charge_kg).toBe(127.5);
  });

  test('sans plan, la référence est la dernière séance — la règle du chantier 46', () => {
    let s = ouverte(T(3));
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 122.5 });
    expect(Seance.fantome(s, 0, 2, PREC(), null).charge_kg).toBe(130);
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 125 });
    expect(Seance.fantome(s, 0, 2, PREC(), null).charge_kg).toBe(125);
  });

  test('DISCRIMINANT — sous « le cran au-dessus », retaper la dernière séance n’est pas une déviation', () => {
    // Le plan ne propose pas de charge sur cette ligne : la référence retombe
    // sur la dernière séance. Une référence NULLE ferait de chaque saisie une
    // déviation, et 120 tapé sur la 1re série effacerait la 2ᵉ.
    let s = ouverte(T(3));
    const pr = prec([p(120, 5), p(120, 5), p(120, 5)]);
    const plan = [{ charge_kg: null, reps: 6 }, { charge_kg: null, reps: 6 }, { charge_kg: 125, reps: 5 }];
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 120 });
    expect(Seance.derniereSaisie(s.exercices[0], 1, 'charge_kg', pr, plan)).toBeNull();
    expect(Seance.fantome(s, 0, 2, pr, plan).charge_kg).toBe(125);
  });

  test('la déviation d’une chauffe ne regarde pas le plan (il ne couvre pas les chauffes)', () => {
    let s = ouverte(W(2).concat(T(3)));
    const pr = prec([p(40, 10, 'echauffement'), p(70, 5, 'echauffement'), p(125, 5), p(125, 5), p(130, 3)]);
    const plan = [null, null, { charge_kg: 125, reps: 5 }, { charge_kg: 125, reps: 5 }, { charge_kg: 130, reps: 4 }];
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 45 });
    expect(Seance.fantome(s, 0, 1, pr, plan).charge_kg).toBe(45);
    expect(Seance.fantome(s, 0, 2, pr, plan).charge_kg).toBe(125);
  });
});

// ── L'EN-TÊTE ───────────────────────────────────────────────────────────────
describe('l’en-tête dit la consigne (ECRAN-SAISIE §3.1)', () => {
  const EXOS = [
    { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] },
    { slug: 'pl', nom: 'Planche', mesure: 'temps', muscles_primaires: ['abdominaux'] }
  ];
  function rendre(s, libelles, programme, extra) {
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, Object.assign({
      blocs: Modele.blocsDeSeance(s, EXOS),
      modifier: false, selection: null, programme: !!programme,
      surGrouper: () => {}, surDeplacerBloc: () => {},
      surMenuBloc: () => {}, surMenuExercice: () => {},
      tourAtteint: () => 0,
      exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
      precedent: () => null, fantome: () => ({}),
      libelles: libelles,
      surChamp: () => {}, surValider: () => {}, surNumero: () => {},
      surEffort: () => {}, surNote: () => {}, surRepos: () => {},
      surSupprimerSerie: () => {}, surAjoutSerie: () => {}
    }, extra || {}));
    return cible;
  }
  const textes = (cible, sel) => [...cible.querySelectorAll(sel)].map((e) => e.textContent);
  const LIB = { jaune: ['125' + NB + 'kg, vise 5', 'puis 130' + NB + 'kg en dernière série, vise 4'],
                gris: 'Ton test à 130 du 13' + NB + 'sept. est tombé au bas de ta zone' + NB + ': on le garde sur la dernière série.' };

  test('les lignes jaunes puis la phrase grise, entre la mesure et les réglages', () => {
    const cible = rendre(ouverte(T(3)), () => LIB);
    expect(textes(cible, '.consigne')).toEqual(LIB.jaune);
    expect(textes(cible, '.consigne-dit')).toEqual([LIB.gris]);
    // L'ordre dans la légende : type de mesure, jaune, jaune, gris, réglages.
    const legende = cible.querySelector('.legende-exo');
    const classes = [...legende.children].map((e) => e.className);
    expect(classes).toEqual(['legende-haut', 'type-mesure', 'consigne', 'consigne', 'consigne-dit', 'reglages-exo']);
  });

  test('sans libellés (Entretenir, mesure sans charge, Édition) : rien', () => {
    const cible = rendre(ouverte(T(3)), () => null);
    expect(cible.querySelectorAll('.consigne, .consigne-dit').length).toBe(0);
    // Et une vue qui ne connaît pas encore `libelles` — les tests d'avant 48b.
    expect(rendre(ouverte(T(3)), undefined).querySelectorAll('.consigne').length).toBe(0);
  });

  test('en silence du moteur, la seule phrase grise', () => {
    const cible = rendre(ouverte(T(3)), () => ({ jaune: [], gris: 'Première fois ici. Ce que tu notes aujourd\'hui servira de départ.' }));
    expect(cible.querySelectorAll('.consigne').length).toBe(0);
    expect(textes(cible, '.consigne-dit')).toEqual(['Première fois ici. Ce que tu notes aujourd\'hui servira de départ.']);
  });

  test('DISCRIMINANT — en mode programme, rien, même avec des libellés', () => {
    const cible = rendre(ouverte(T(3)), () => LIB, true);
    expect(cible.querySelectorAll('.consigne, .consigne-dit').length).toBe(0);
  });

  test('DISCRIMINANT — toucher la consigne ouvre le calcul : les jaunes ET la grise', () => {
    const vus = [];
    const cible = rendre(ouverte(T(3)), () => LIB, false, { surPourquoi: (s) => vus.push(s) });
    const lignes = [...cible.querySelectorAll('.consigne, .consigne-dit')];
    expect(lignes).toHaveLength(3);
    lignes.forEach((n) => {
      expect(n.getAttribute('role')).toBe('button');
      expect(n.tabIndex).toBe(0);
      n.click();
    });
    // Les deux jaunes et la grise mènent au même endroit : l'exercice, pas la ligne.
    expect(vus).toEqual(['dc', 'dc', 'dc']);
  });

  test('DISCRIMINANT — en silence, la phrase grise SEULE porte le geste', () => {
    // « Pourquoi rien ? » est la question qu'on se pose le plus, et c'est
    // justement là qu'il n'y a aucune ligne jaune à toucher.
    const muet = { jaune: [], gris: 'Première fois ici. Ce que tu notes aujourd\'hui servira de départ.' };
    const vus = [];
    const cible = rendre(ouverte(T(3)), () => muet, false, { surPourquoi: (s) => vus.push(s) });
    expect(cible.querySelectorAll('.consigne')).toHaveLength(0);
    const gris = cible.querySelector('.consigne-dit');
    expect(gris.getAttribute('role')).toBe('button');
    gris.click();
    expect(vus).toEqual(['dc']);
  });

  test('sans `surPourquoi`, aucune ligne ne se prétend tapable', () => {
    const lignes = [...rendre(ouverte(T(3)), () => LIB).querySelectorAll('.consigne, .consigne-dit')];
    expect(lignes).toHaveLength(3);
    lignes.forEach((n) => {
      expect(n.getAttribute('role')).toBeNull();
      expect(n.tabIndex).toBe(-1);
    });
  });

  test('chaque exercice d’un superset reçoit les siens', () => {
    let s = ouverte(T(2));
    s = Seance.ajouterExercice(s, 'pl', uuid);
    const parSlug = { dc: LIB, pl: null };
    const cible = rendre(s, (slug) => parSlug[slug]);
    const legendes = [...cible.querySelectorAll('.legende-exo')];
    expect(legendes[0].querySelectorAll('.consigne').length).toBe(2);
    expect(legendes[1].querySelectorAll('.consigne, .consigne-dit').length).toBe(0);
  });
});

// ── LES SILENCES, ET LE CAS RÉEL, PAR LA CHAÎNE COMPLÈTE ────────────────────
describe('consigneDExercice : les silences passent avant le moteur', () => {
  test('intention « entretien » → null', () => {
    expect(Moteur.consigneDExercice(couche(), undefined, AVANT,
      Object.assign({}, OPTIONS, { intention: 'entretien' }))).toBeNull();
    // « entretenir » n'est PAS la clé : elle ne fait pas taire le moteur.
    expect(Moteur.consigneDExercice(couche(), undefined, AVANT,
      Object.assign({}, OPTIONS, { intention: 'entretenir' }))).not.toBeNull();
  });

  test('mesure autre que charge_reps, ou inconnue → null', () => {
    ['reps', 'temps', 'distance_temps', null, undefined].forEach((m) => {
      expect(Moteur.consigneDExercice(couche(), undefined, AVANT,
        Object.assign({}, OPTIONS, { mesure: m }))).toBeNull();
    });
  });

  test('DISCRIMINANT — séance terminée rouverte (§7 octies) → null, cascade d’avant', () => {
    expect(Moteur.consigneDExercice(couche(), undefined, AVANT,
      Object.assign({}, OPTIONS, { edition: true }))).toBeNull();
    // Le plan d'une consigne nulle est vide, donc le fantôme est celui d'avant.
    const s = ouverte(T(3));
    const plan = Seance.planDe(s.exercices[0].series, null);
    expect(plan).toEqual([null, null, null]);
    const pr = prec([p(122.5, 5), p(125, 5), p(130, 3)]);
    expect(Seance.fantome(s, 0, 2, pr, plan)).toMatchObject({ charge_kg: 130, reps: 3 });
  });

  test('les silences DU moteur gardent leur phrase : première fois, pas de palier', () => {
    const c = Moteur.consigneDExercice([], undefined, AVANT, OPTIONS);
    expect(c.consigne.etat).toBe('silence');
    expect(c.libelles).toEqual({ jaune: [], gris: 'Première fois ici. Ce que tu notes aujourd\'hui servira de départ.' });
    const pyramide = [{ seance: { id: 'S', debut: jour('09-13') },
      series: [brute(100, 5), brute(110, 3), brute(120, 1)] }].concat(montee());
    const c2 = Moteur.consigneDExercice(pyramide, undefined, AVANT, OPTIONS);
    expect(c2.consigne).toMatchObject({ etat: 'silence', raison: 'pas_de_palier' });
    expect(c2.libelles.jaune).toEqual([]);
    expect(c2.libelles.gris).toBe('Pas de palier le 13' + NB + 'sept.' + NB + ': 100, 110 puis 120' + NB + 'kg, aucune charge répétée. Rien à proposer.');
  });

  test('le réglage et la coupure sont ceux qu’on passe : Franc propose le test dès une série au haut', () => {
    const franc = [{ seance: { id: 'S5', debut: jour('09-13') },
      series: [brute(125, 5), brute(125, 4), brute(125, 4)] }].concat(montee());
    expect(Moteur.consigneDExercice(franc, undefined, AVANT, OPTIONS).consigne.etat).toBe('progression');
    expect(Moteur.consigneDExercice(franc, undefined, AVANT,
      Object.assign({}, OPTIONS, { reglage: 'franc' })).consigne.etat).toBe('test_propose');
    // §9.12 — une coupure AVANT la dernière séance ne la voit pas.
    expect(Moteur.consigneDExercice(franc, undefined, jour('09-13'), OPTIONS).consigne.fondement.date)
      .toBe(jour('08-09'));
  });

  // ── LA CASCADE DES REPS SOUS CHAQUE SILENCE (ECRAN-SAISIE §7 septendecies.3) ──
  //
  // Constaté sur l'appareil le 20/09 : en Entretenir, une routine de couché à
  // 5 · 5 · 4 reps donnait le MÊME fantôme que le plan du moteur — mêmes
  // chiffres, autre source. Les trois sources se distinguent ici : le plan
  // vise 5, la routine dit 8, la dernière séance a fait 4 · 5 · 3. Chaque
  // silence descend jusqu'au fantôme, avec une série qui PORTE des reps visées.
  describe('sous chaque silence, le fantôme dit la routine avant la dernière séance', () => {
    const PREC = () => prec([p(125, 4), p(125, 5), p(130, 3)]);
    // La séance DEPUIS UNE ROUTINE, comme sur l'appareil : trois lignes de
    // travail programmées à `reps` (8, ou rien), que `exerciceDepuisRoutine`
    // pose en `reps_visees` sur chaque ligne (ch. 43).
    const avecRoutine = (slug, reps) => Seance.creer({
      id: 'S', userId: 'u', idSerie: uuid,
      routine: { id: 'r', exercices: [{ id: 'e1', exercise_slug: slug, repos_cible_s: null,
        groupe_superset: null, note: null,
        series: [1, 2, 3].map(() => ({ type_serie: 'travail', reps: reps })) }] }
    });
    const fantomes = (s, plan, pr) => [0, 1, 2].map((i) => {
      const f = Seance.fantome(s, 0, i, pr, plan);
      return f.charge_kg + '\u00d7' + f.reps;
    });
    const plan = (options) => {
      const c = Moteur.consigneDExercice(couche(), undefined, AVANT, Object.assign({}, OPTIONS, options));
      return { c: c, plan: Seance.planDe(avecRoutine('dc', 8).exercices[0].series, c ? c.consigne : null) };
    };

    test('témoin — en Progresser, le plan passe devant les reps visées : 125 × 5, puis 130 × 4', () => {
      const r = plan({});
      expect(r.c).not.toBeNull();
      expect(fantomes(avecRoutine('dc', 8), r.plan, PREC())).toEqual(['125\u00d75', '125\u00d75', '130\u00d74']);
    });

    test('DISCRIMINANT — Entretenir : charges de la dernière séance, reps de la routine', () => {
      const r = plan({ intention: 'entretien' });
      expect(r.c).toBeNull();
      expect(r.plan).toEqual([null, null, null]);
      expect(fantomes(avecRoutine('dc', 8), r.plan, PREC())).toEqual(['125\u00d78', '125\u00d78', '130\u00d78']);
      // Sans reps visées, la dernière séance parle, reps comprises.
      expect(fantomes(avecRoutine('dc', null), r.plan, PREC())).toEqual(['125\u00d74', '125\u00d75', '130\u00d73']);
    });

    test('DISCRIMINANT — Édition : même cascade, la routine avant la dernière séance', () => {
      const r = plan({ edition: true });
      expect(r.c).toBeNull();
      expect(fantomes(avecRoutine('dc', 8), r.plan, PREC())).toEqual(['125\u00d78', '125\u00d78', '130\u00d78']);
      expect(fantomes(avecRoutine('dc', null), r.plan, PREC())).toEqual(['125\u00d74', '125\u00d75', '130\u00d73']);
    });

    test('DISCRIMINANT — mesure reps (tractions) : pas de charge, reps de la routine puis de la dernière séance', () => {
      const c = Moteur.consigneDExercice(couche(), undefined, AVANT, Object.assign({}, OPTIONS, { mesure: 'reps' }));
      expect(c).toBeNull();
      const pr = prec([p(null, 10), p(null, 9), p(null, 8)]);
      const s = avecRoutine('tr', 12);
      const vide = Seance.planDe(s.exercices[0].series, null);
      expect([0, 1, 2].map((i) => Seance.fantome(s, 0, i, pr, vide)))
        .toEqual([{ charge_kg: null, reps: 12, duree_s: null, distance_m: null },
                  { charge_kg: null, reps: 12, duree_s: null, distance_m: null },
                  { charge_kg: null, reps: 12, duree_s: null, distance_m: null }]);
      expect([0, 1, 2].map((i) => Seance.fantome(avecRoutine('tr', null), 0, i, pr, vide).reps)).toEqual([10, 9, 8]);
    });
  });
});

describe('un cas réel — le couché, du bout en bout', () => {
  test('l’en-tête, le plan et le fantôme sur la prochaine séance', () => {
    const groupes = couche();
    const c = Moteur.consigneDExercice(groupes, undefined, AVANT, OPTIONS);
    expect(c.consigne).toMatchObject({ etat: 'garde', zone: 'lourd', n: 3,
      ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 } });
    expect(c.libelles.jaune).toEqual(['125' + NB + 'kg, vise 5', 'puis 130' + NB + 'kg en dernière série, vise 4']);
    expect(c.libelles.gris).toBe('Ton test à 130 du 13' + NB + 'sept. est tombé au bas de ta zone' + NB +
      ': on le garde sur la dernière série.');

    // La séance ouverte reproduit la structure : quatre chauffes, trois travail.
    const s = ouverte(W(4).concat(T(3)));
    const pr = Seance.precedent('dc', groupes.map((g) => g.seance),
      (id) => groupes.filter((g) => g.seance.id === id)[0].series, 'S');
    const plan = Seance.planDe(s.exercices[0].series, c.consigne);
    const f = (i) => Seance.fantome(s, 0, i, pr, plan);
    // Les chauffes proposent celles de la dernière séance.
    expect([0, 1, 2, 3].map((i) => f(i).charge_kg + '×' + f(i).reps)).toEqual(['20×15', '60×10', '100×5', '115×1']);
    // Les deux premières séries de travail proposent 125 × 5, la dernière 130 × 4.
    expect([4, 5, 6].map((i) => f(i).charge_kg + '×' + f(i).reps)).toEqual(['125×5', '125×5', '130×4']);
    // Valider 125 sur la première ne touche pas la ligne du test.
    const s2 = Seance.modifierSerie(s, 0, 4, { charge_kg: 125 });
    expect(Seance.fantome(s2, 0, 6, pr, plan).charge_kg).toBe(130);
  });

  test('une rampe notée en travail reçoit la consigne comme les autres (§9.13, 49-C)', () => {
    // Squat : la dernière séance montait 120 · 125 · 125 · 130, l'exercice
    // « monte » (l'état de `etatsExercices`), donc 120 est une rampe (§5.2) et
    // la consigne porte sur n = 3. Depuis le 26/09/2026, la séance en cours
    // fait foi : ses QUATRE séries de travail sont couvertes, et une montée en
    // charge se déclare en échauffement. Avant 49-C : la première gardait 120,
    // la dernière séance.
    const squat = [{ seance: { id: 'S5', debut: jour('09-13') },
      series: [brute(120, 5), brute(125, 5), brute(125, 5), brute(130, 4)] }].concat(montee());
    const c = Moteur.consigneDExercice(squat, { etat: Palier.ETAT_MONTE }, AVANT, OPTIONS);
    expect(c.consigne).toMatchObject({ etat: 'etend', n: 3, haut: { charge: 130, vise: 4, k: 2 } });
    const s = ouverte(T(4));
    const pr = Seance.precedent('dc', squat.map((g) => g.seance),
      (id) => squat.filter((g) => g.seance.id === id)[0].series, 'S');
    const plan = Seance.planDe(s.exercices[0].series, c.consigne);
    expect(plan[0]).toEqual({ charge_kg: 125, reps: 5 });
    const f = (i) => Seance.fantome(s, 0, i, pr, plan);
    expect([0, 1, 2, 3].map((i) => f(i).charge_kg + '×' + f(i).reps)).toEqual(['125×5', '125×5', '130×4', '130×4']);
  });
});

// ── RIEN N'EST ÉCRIT ────────────────────────────────────────────────────────
describe('la proposition n’est jamais écrite (§7 septendecies.3)', () => {
  test('une séance validée sur le plan, et ses lignes pour la file, ne portent aucune trace du plan', () => {
    let s = ouverte(T(3));
    const pr = prec([p(122.5, 5), p(125, 5), p(130, 3)]);
    const plan = Seance.planDe(s.exercices[0].series, { etat: 'garde', n: 3,
      ligne: { charge: 125, vise: 5 }, haut: { charge: 130, vise: 4, k: 1 } });
    // On valide « sans rien taper » : ce que le fantôme montre devient réel.
    [0, 1, 2].forEach((i) => {
      const f = Seance.fantome(s, 0, i, pr, plan);
      s = Seance.modifierSerie(s, 0, i, { charge_kg: f.charge_kg, reps: f.reps });
      s = Seance.valider(s, 0, i, new Date('2026-09-20T10:0' + i + ':00Z'));
    });
    const lignes = Seance.lignes(s);
    expect(lignes.map((l) => l.charge_kg + '×' + l.reps)).toEqual(['125×5', '125×5', '130×4']);
    lignes.forEach((l) => {
      Object.keys(l).forEach((k) => expect(Seance.COLONNES_SET).toContain(k));
    });
    // Les clés que le plan porte — « plan », « propose », « vise », « haut »,
    // « ligne » — n'apparaissent nulle part. (`reps_visees` est une colonne de
    // routine d'avant le moteur, pas une trace du plan.)
    expect(JSON.stringify(s)).not.toMatch(/"(plan|propose|vise|haut|ligne|k)"/);
    expect(Seance.COLONNES_SET).toHaveLength(17);
  });
});


// ── §3.8 — L'ÉTIQUETTE DE ZONE ──────────────────────────────────────────────
describe('l’étiquette de zone (ECRAN-SAISIE §3.8)', () => {
  const EXOS = [
    { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] },
    { slug: 'tr', nom: 'Tractions', mesure: 'reps', muscles_primaires: ['dorsaux'] }
  ];
  const rendre = (s, etiquette, programme) => {
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, {
      blocs: Modele.blocsDeSeance(s, EXOS),
      modifier: false, selection: null, programme: !!programme,
      surGrouper: () => {}, surDeplacerBloc: () => {},
      surMenuBloc: () => {}, surMenuExercice: () => {},
      tourAtteint: () => 0,
      exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
      precedent: () => null, fantome: () => ({}),
      etiquette: etiquette,
      surChamp: () => {}, surValider: () => {}, surNumero: () => {},
      surEffort: () => {}, surNote: () => {}, surRepos: () => {},
      surSupprimerSerie: () => {}, surAjoutSerie: () => {}
    });
    return cible;
  };
  const puces = (c) => [...c.querySelectorAll('.puce-zone')].map((e) => e.textContent);
  // La consigne d'un cas du fichier, calculée pour de vrai.
  const CAS = require('./fixtures/consigne-48b7.json');
  const consigneDe = (id) => {
    const c = CAS.filter((x) => x.id === id)[0];
    return Moteur.consignePour(c.seances, c.avant,
      { reglage: c.reglage, equipement: c.equipement, correction: null });
  };

  test('avec une zone, l’étiquette la dit — libellé et bornes', () => {
    expect(Moteur.etiquetteZone(consigneDe('N1'))).toBe('Lourd 3-5');
    const cible = rendre(ouverte(T(3)), () => 'Lourd 3-5');
    expect(puces(cible)).toEqual(['Lourd 3-5']);
  });

  test('DISCRIMINANT — pendant un étirement, c’est la ZONE FIGÉE, pas celle des reps étirées', () => {
    // N8 : le palier vise 13 reps au-delà du haut, ce qui rangerait l'exercice
    // en Séries longues si la zone suivait l'habitude. Elle ne la suit pas.
    const c = consigneDe('N8');
    expect(c.fondement.habitude.valeur).toBe(12);
    expect(Moteur.etiquetteZone(c)).toBe('Volume 10-12');
    const n9 = consigneDe('N9');
    expect(n9.fondement.habitude.valeur).toBe(13);   // 13 reps d'habitude…
    expect(Moteur.etiquetteZone(n9)).toBe('Volume 10-12');   // … et la zone tient
  });

  test('sans zone — silence et règle de bord — rien du tout', () => {
    ['N13', 'N14', 'N15'].forEach((id) => {
      expect([id, Moteur.etiquetteZone(consigneDe(id))]).toEqual([id, null]);
    });
    expect(puces(rendre(ouverte(T(3)), () => null))).toEqual([]);
    // Et une vue qui ne connaît pas encore `etiquette` — les tests d'avant 48b-6a.
    expect(puces(rendre(ouverte(T(3)), undefined))).toEqual([]);
  });

  test('DISCRIMINANT — en mode programme, rien, même avec une étiquette', () => {
    expect(puces(rendre(ouverte(T(3)), () => 'Lourd 3-5', true))).toEqual([]);
  });

  test('DISCRIMINANT — ce n’est PAS un bouton avant 48b-7', () => {
    const cible = rendre(ouverte(T(3)), () => 'Lourd 3-5');
    const puce = cible.querySelector('.puce-zone');
    expect(puce.tagName).toBe('SPAN');
    expect(puce.getAttribute('role')).toBeNull();
    expect(puce.tabIndex).toBe(-1);
    // Jamais jaune : le jaune est la seule voix du moteur (§7 bis.4).
    expect(puce.className).not.toMatch(/consigne/);
  });

  test('Entretenir, Édition et mesure sans charge : aucune consigne, donc aucune étiquette', () => {
    const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser',
                  reglage: 'normal', edition: false };
    expect(Moteur.consigneDExercice(couche(), undefined, AVANT, OPT).etiquette).toBe('Lourd 3-5');
    [{ intention: 'entretien' }, { edition: true }, { mesure: 'reps' }].forEach((quoi) => {
      expect([quoi, Moteur.consigneDExercice(couche(), undefined, AVANT,
        Object.assign({}, OPT, quoi))]).toEqual([quoi, null]);
    });
  });
});

// ── §3.10 — LA FEUILLE « POURQUOI » ─────────────────────────────────────────
describe('la feuille « Pourquoi » (ECRAN-SAISIE §3.10)', () => {
  const CAS = require('./fixtures/consigne-48b7.json');
  const pourquoiDe = (id) => {
    const c = CAS.filter((x) => x.id === id)[0];
    const r = Moteur.consignePour(c.seances, c.avant,
      { reglage: c.reglage, equipement: c.equipement, correction: null });
    return Moteur.pourquoiConsigne(r, c.reglage);
  };
  const rendre = (pourquoi, surProfil) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuillePourquoi(cible, {
      nom: 'Développé Couché (Barre)', pourquoi: pourquoi,
      surProfil: surProfil || (() => {})
    });
    return cible;
  };
  const textes = (c, sel) => [...c.querySelectorAll(sel)].map((e) => e.textContent);

  test('Y1 — la feuille de la maquette, ligne pour ligne', () => {
    const cible = rendre(pourquoiDe('Y1'));
    expect(textes(cible, '.feuille-t')).toEqual(['Pourquoi cette consigne']);
    expect(textes(cible, '.feuille-sous')).toEqual(['Développé Couché (Barre)']);
    expect(textes(cible, '.pq-sec')).toEqual(['Ta dernière séance, le 13\u00a0sept.']);
    expect(textes(cible, '.pq-quoi')).toEqual(
      ['20, 60, 100, 115', '125\u00a0\u00d7\u00a04', '125\u00a0\u00d7\u00a05', '130\u00a0\u00d7\u00a03']);
    expect(textes(cible, '.pq-role')).toEqual(
      ['chauffes, ne comptent pas', 'au palier', 'au palier', 'test, au bas de ta zone']);
    // Les quatre paragraphes, puis « Donc », le réglage et la fin : sept lignes.
    const p = textes(cible, '.pq-p');
    expect(p[0]).toMatch(/^Ta zone/);
    expect(p[1]).toMatch(/^Ton palier est 125/);
    expect(p[2]).toMatch(/^Ton test à 130 a fait 3/);
    expect(textes(cible, '.pq-p.fort')).toEqual(
      ['Donc 125\u00a0kg, vise 5, puis 130\u00a0kg en dernière série, vise 4.']);
    expect(p[p.length - 1]).toBe('Tu veux faire autre chose ? Tape-le, ta saisie fait foi.');
  });

  test('DISCRIMINANT — les chauffes sont GRISÉES, les séries qui comptent ne le sont pas', () => {
    const cible = rendre(pourquoiDe('Y1'));
    const muets = [...cible.querySelectorAll('.pq-ligne')].map((n) => n.classList.contains('muet'));
    expect(muets).toEqual([true, false, false, false]);
  });

  test('« Profil » est un LIEN, et il y va', () => {
    let alle = 0;
    const cible = rendre(pourquoiDe('Y1'), () => { alle++; });
    const lien = cible.querySelector('.lien-profil');
    expect(lien.tagName).toBe('BUTTON');
    expect(lien.textContent).toBe('Profil');
    lien.click();
    expect(alle).toBe(1);
    // La phrase reste entière autour de lui.
    expect(lien.parentNode.textContent).toBe('Ton réglage\u00a0: Normal. Il se change dans Profil.');
  });

  test('en silence, la feuille dit la séance et pourquoi le moteur se tait — rien d’autre', () => {
    const cible = rendre(pourquoiDe('N15'));
    expect(textes(cible, '.pq-quoi')).toHaveLength(3);
    expect(textes(cible, '.pq-role')).toEqual(['', '', '']);
    expect(textes(cible, '.pq-p')).toEqual([
      'Ta dernière séance n\'a répété aucune charge sur deux séries\u00a0: sans palier, le moteur n\'a rien à proposer.',
      'Tu veux faire autre chose ? Tape-le, ta saisie fait foi.'
    ]);
    expect(cible.querySelector('.lien-profil')).toBeNull();
    expect(textes(cible, '.pq-p.fort')).toEqual([]);
  });

  test('première fois : pas même une séance à montrer', () => {
    const cible = rendre(pourquoiDe('N14'));
    expect(textes(cible, '.pq-sec')).toEqual([]);
    expect(textes(cible, '.pq-ligne')).toEqual([]);
    expect(textes(cible, '.pq-p')[0]).toBe('Rien avant aujourd\'hui\u00a0: ce que tu notes servira de départ.');
  });
});

// ── §9.1.1 — LA ZONE EN VIGUEUR ─────────────────────────────────────────────
describe('la zone en vigueur se lit sur l’historique (MOTEUR §9.1.1)', () => {
  const L = (id, slug, zone, quand) => ({ id: id, exercise_slug: slug, zone: zone, corrigee_a: quand });
  const T = (jour) => '2026-09-' + jour + 'T10:00:00+00:00';

  test('deux lignes : la plus récente l’emporte', () => {
    const lignes = [L('a', 'dc', 'lourd', T('10')), L('b', 'dc', 'volume', T('14'))];
    expect(Moteur.zoneEnVigueur(lignes, 'dc')).toBe('volume');
    // Et l'ordre du tableau n'y fait rien : c'est la DATE qui tranche.
    expect(Moteur.zoneEnVigueur(lignes.slice().reverse(), 'dc')).toBe('volume');
  });

  test('DISCRIMINANT — une ligne VIDE, la plus récente, ramène à la déduction', () => {
    // « Revenir à celle d'après tes séances » AJOUTE une ligne, il n'efface
    // rien : le choix d'avant reste en base, et ne doit plus rien décider.
    const lignes = [L('a', 'dc', 'lourd', T('10')), L('b', 'dc', null, T('14'))];
    expect(Moteur.zoneEnVigueur(lignes, 'dc')).toBeNull();
    // La même ligne vide, mais PLUS ANCIENNE, ne défait rien.
    expect(Moteur.zoneEnVigueur([L('a', 'dc', null, T('10')), L('b', 'dc', 'lourd', T('14'))], 'dc'))
      .toBe('lourd');
  });

  test('DISCRIMINANT — « vide » se normalise en `null`, quelle que soit sa forme', () => {
    // La colonne est `text` NULLABLE : la base peut rendre `null`, et un jour
    // une chaîne vide. Les deux veulent dire « retour à la déduction », et la
    // fonction rend `null` dans les deux cas plutôt que de laisser filer une
    // valeur que chaque appelant devrait retester à sa façon.
    ['', null, undefined].forEach((vide) => {
      expect([vide, Moteur.zoneEnVigueur([L('a', 'dc', vide, T('14'))], 'dc')]).toEqual([vide, null]);
    });
  });

  test('DISCRIMINANT — l’appareil devant le serveur, et l’inverse', () => {
    const serveur = L('s', 'dc', 'volume', T('10'));
    const appareil = L('a', 'dc', 'mix', T('14'));
    expect(Moteur.zoneEnVigueur([serveur, appareil], 'dc')).toBe('mix');
    expect(Moteur.zoneEnVigueur([L('s', 'dc', 'volume', T('16')), appareil], 'dc')).toBe('volume');
  });

  test('DISCRIMINANT — à la même seconde, l’identifiant tranche, et toujours pareil', () => {
    // Deux appareils peuvent poser dans la même seconde. Sans ce départage, la
    // zone dépendrait de l'ordre d'arrivée des lignes : deux lectures de la
    // même base donneraient deux consignes.
    const a = L('aaa', 'dc', 'lourd', T('14')), b = L('bbb', 'dc', 'volume', T('14'));
    expect(Moteur.zoneEnVigueur([a, b], 'dc')).toBe('volume');
    expect(Moteur.zoneEnVigueur([b, a], 'dc')).toBe('volume');
  });

  test('chaque exercice a la sienne ; sans ligne, rien', () => {
    const lignes = [L('a', 'dc', 'lourd', T('14')), L('b', 'sq', 'volume', T('14'))];
    expect(Moteur.zoneEnVigueur(lignes, 'dc')).toBe('lourd');
    expect(Moteur.zoneEnVigueur(lignes, 'sq')).toBe('volume');
    expect(Moteur.zoneEnVigueur(lignes, 'tr')).toBeNull();
    expect(Moteur.zoneEnVigueur([], 'dc')).toBeNull();
    expect(Moteur.zoneEnVigueur(null, 'dc')).toBeNull();
  });

  test('une ligne sans date ne décide de rien', () => {
    expect(Moteur.zoneEnVigueur([L('a', 'dc', 'lourd', null)], 'dc')).toBeNull();
    expect(Moteur.zoneEnVigueur([L('a', 'dc', 'lourd', null), L('b', 'dc', 'mix', T('10'))], 'dc'))
      .toBe('mix');
  });

  test('DISCRIMINANT — la correction traverse jusqu’à la consigne, et l’emporte', () => {
    const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser',
                  reglage: 'normal', edition: false };
    const sans = Moteur.consigneDExercice(couche(), undefined, AVANT, OPT);
    expect(sans.etiquette).toBe('Lourd 3-5');
    const avec = Moteur.consigneDExercice(couche(), undefined, AVANT,
      Object.assign({}, OPT, { correction: 'volume' }));
    expect(avec.etiquette).toBe('Volume 10-12');
    // Et ce n'est pas qu'une étiquette : la consigne entière a changé.
    expect(avec.consigne.zone).toBe('volume');
    expect(avec.libelles.jaune).not.toEqual(sans.libelles.jaune);
    expect(avec.pourquoi.zone).toContain('choisie par toi');
  });
});

// ── §3.8 — L'ÉTIQUETTE EST UNE PORTE, ET LE MENU DES ZONES ──────────────────
describe('l’étiquette se touche, et le menu (ECRAN-SAISIE §3.8)', () => {
  const EXOS = [
    { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] }
  ];
  const rendre = (vue) => {
    const s = ouverte(T(3));
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, Object.assign({
      blocs: Modele.blocsDeSeance(s, EXOS),
      modifier: false, selection: null, programme: false,
      surGrouper: () => {}, surDeplacerBloc: () => {},
      surMenuBloc: () => {}, surMenuExercice: () => {},
      tourAtteint: () => 0,
      exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
      precedent: () => null, fantome: () => ({}),
      etiquette: () => 'Lourd 3-5',
      surChamp: () => {}, surValider: () => {}, surNumero: () => {},
      surEffort: () => {}, surNote: () => {}, surRepos: () => {},
      surSupprimerSerie: () => {}, surAjoutSerie: () => {}
    }, vue || {}));
    return cible;
  };

  test('DISCRIMINANT — avec un geste c’est un BOUTON, sans geste c’est un span', () => {
    const vus = [];
    const b = rendre({ surZone: (s) => vus.push(s) }).querySelector('.puce-zone');
    expect(b.tagName).toBe('BUTTON');
    b.click();
    expect(vus).toEqual(['dc']);
    // Sans `surZone` — un écran qui ne sait pas corriger — elle ne promet rien.
    expect(rendre({}).querySelector('.puce-zone').tagName).toBe('SPAN');
  });

  test('DISCRIMINANT — « choisie » se voit, « déduite » ne se voit pas', () => {
    expect(rendre({ surZone: () => {}, zoneChoisie: () => true })
      .querySelector('.puce-zone').className).toContain('choisie');
    expect(rendre({ surZone: () => {}, zoneChoisie: () => false })
      .querySelector('.puce-zone').className).not.toContain('choisie');
  });

  test('l’étiquette reste absente là où le moteur se tait', () => {
    // Le geste ne la fait pas apparaître : c'est la consigne qui décide.
    expect(rendre({ surZone: () => {}, etiquette: () => null })
      .querySelectorAll('.puce-zone')).toHaveLength(0);
  });

  // ── Le menu ──
  const ZONES = Moteur.ZONES;
  const menu = (vue) => {
    const cible = document.createElement('div');
    Rendu().rendreFeuilleZone(cible, Object.assign({
      nom: 'Rowing Poulie Assis - Prise en V', zones: ZONES,
      choisie: null, deduite: { zone: 'volume', habitude: 10, seances: 8 },
      surChoix: () => {}, surFermer: () => {}
    }, vue || {}));
    return cible;
  };
  const textes = (c, sel) => [...c.querySelectorAll(sel)].map((e) => e.textContent);

  test('les cinq zones, avec leurs bornes, et le titre', () => {
    const c = menu();
    expect(textes(c, '.feuille-t')).toEqual(['Zone de travail']);
    expect(textes(c, '.feuille-sous'))
      .toEqual(['Rowing Poulie Assis - Prise en V, dans toutes tes routines']);
    expect(textes(c, '.oz-nom')).toEqual(['Lourd', 'Mix', 'Hypertrophie', 'Volume', 'Séries longues']);
    expect(textes(c, '.oz-reps')).toEqual(
      ['3 à 5 reps', '6 à 8 reps', '8 à 10 reps', '10 à 12 reps', '15 à 20 reps']);
    // Aucune saisie libre : cinq boutons, pas un champ.
    expect(c.querySelectorAll('input, textarea')).toHaveLength(0);
  });

  test('DISCRIMINANT — la coche suit la zone CHOISIE, sinon la déduite', () => {
    const actives = (c) => [...c.querySelectorAll('.option-zone.active')].map((n) => n.dataset.cle);
    expect(actives(menu())).toEqual(['volume']);
    expect(actives(menu({ choisie: 'hypertrophie' }))).toEqual(['hypertrophie']);
    expect(menu({ choisie: 'hypertrophie' }).querySelector('[data-cle="hypertrophie"]')
      .getAttribute('aria-pressed')).toBe('true');
  });

  test('DISCRIMINANT — la raison ne vit que sous la zone DÉDUITE', () => {
    const c = menu({ choisie: 'hypertrophie' });
    expect(textes(c, '.oz-sous')).toEqual(['D’après tes 8 dernières séances : 10 reps d’habitude.'
      .replace(/’/g, '\'')]);
    expect(c.querySelector('[data-cle="volume"] .oz-sous')).not.toBeNull();
    expect(c.querySelector('[data-cle="hypertrophie"] .oz-sous')).toBeNull();
    // Sans habitude — un exercice jamais fait — aucune raison à donner.
    expect(textes(menu({ deduite: null }), '.oz-sous')).toEqual([]);
  });

  test('DISCRIMINANT — « Revenir » n’existe que si une zone est choisie', () => {
    const revenir = (c) => textes(c, 'button').filter((x) => /Revenir/.test(x));
    expect(revenir(menu())).toEqual([]);
    expect(revenir(menu({ choisie: 'hypertrophie' })))
      .toEqual(['Revenir à celle d\'après tes séances']);
  });

  test('choisir rend la clé ; « Revenir » rend null ; « Fermer » ferme', () => {
    const vus = []; let ferme = 0;
    const c = menu({ choisie: 'lourd', surChoix: (v) => vus.push(v), surFermer: () => { ferme++; } });
    c.querySelector('[data-cle="volume"]').click();
    [...c.querySelectorAll('button')].filter((b) => /Revenir/.test(b.textContent))[0].click();
    [...c.querySelectorAll('button')].filter((b) => b.textContent === 'Fermer')[0].click();
    expect(vus).toEqual(['volume', null]);
    expect(ferme).toBe(1);
  });
});

// ── §3.9 — LE CONSTAT DE FIN DE BLOC ────────────────────────────────────────
//
// ⚠️ C'EST LE FICHIER QUI FAIT FOI. `constat-48b6b.json` porte, pour chacun
// des 14 cas, l'historique, la séance du jour, les deux instants, les deux
// consignes attendues, le cran suivant et le constat. Le test rejoue, il ne
// redit pas la règle : le constat n'a le droit de recalculer AUCUNE règle du
// moteur, et vérifier d'abord les deux consignes est ce qui le prouve.
describe('le constat de fin de bloc (ECRAN-SAISIE §3.9)', () => {
  const CAS = require('./fixtures/constat-48b6b.json');
  const forme = (r) => r.etat === 'silence'
    ? { etat: 'silence', raison: r.raison }
    : { etat: r.etat, zone: r.zone, n: r.n,
        ligne: r.ligne && [r.ligne.charge, r.ligne.vise],
        haut: r.haut && [r.haut.charge, r.haut.vise, r.haut.k] };
  const deux = (c) => {
    const o = { reglage: c.reglage, equipement: c.equipement, correction: null };
    return { avant: Moteur.consignePour(c.seances, c.avant, o),
             apres: Moteur.consignePour(c.seances.concat([c.seanceDuJour]), c.apres, o) };
  };

  test('les 17 branches y sont, chacune avec sa jumelle', () => {
    const ids = new Set(CAS.map((c) => c.id));
    [['test déjà tenté ou première fois', 'K1', 'K2'],
     ['dans la zone ou pas encore', 'K1', 'K3'],
     ['retest d’un cran ou étirement', 'K3', 'K4'],
     ['rep gagnée jusqu’au haut ou en dessous', 'K5', 'K6'],
     ['gagnée ou rien', 'K6', 'K7'],
     ['Normal, Franc sur la meilleure série, Prudent', 'K6', 'K13'],
     ['Prudent : la phrase générale', 'K12', 'K6'],
     ['reprise', 'K9', 'K1'],
     ['première fois', 'K10', 'K1'],
     ['pas de palier, sans suite', 'K11', 'K1'],
     ['charge sous le palier', 'K14', 'K1'],
     // 48b-6b-2 — l’extension, et les quatre façons de ne pas y tomber.
     ['l’extension ou le test du jour', 'K15', 'K1'],
     ['l’extension dans la zone ou pas encore', 'K15', 'K17'],
     ['sur quelques séries ou sur toutes', 'K15', 'K8'],
     ['le palier bascule ou non', 'K15', 'K16']].forEach(([regle, a, b]) => {
      expect([regle, ids.has(a), ids.has(b)]).toEqual([regle, true, true]);
    });
    expect(CAS).toHaveLength(17);
  });

  // ⚠️ K15 EN PREMIER : c’est le squat du téléphone. La consigne disait
  // « 130 kg sur les 2 dernières séries, vise 4 » ; il a fait exactement ça,
  // et l’en-tête a répondu « Pas encore : 4-4 à 130 » — le nouveau palier
  // comparé à l’ancien. C’est ce cas-là qui a ouvert 48b-6b-2.
  test('K15 — le squat de l’appareil ne dit plus « Pas encore »', () => {
    const c = CAS.filter((x) => x.id === 'K15')[0];
    const { avant, apres } = deux(c);
    expect([avant.etat, avant.palier, avant.niveau]).toEqual(['etend', 125, 5]);
    expect([apres.etat, apres.palier, apres.niveau]).toEqual(['rejoint', 130, 4]);
    const constat = Moteur.constatDe(avant, apres, c.reglage, 132.5);
    expect(constat.verdict).toBe('4-4 à 130' + NB + ': ta nouvelle charge tient sur 2 séries, dans ta zone.');
    expect(constat.verdict).not.toMatch(/Pas encore/);
  });

  CAS.forEach((c) => {
    test(`${c.id} — ${c.titre} (${c.reglage})`, () => {
      const { avant, apres } = deux(c);
      // La prémisse d'abord : si les deux consignes ne sont pas celles du
      // fichier, le constat mesurerait autre chose que ce qu'il annonce.
      expect(forme(avant)).toEqual(c.consigneAvant);
      expect(forme(apres)).toEqual(c.consigneApres);
      const cran = apres.palier === null || apres.palier === undefined ? null
        : Moteur.chargeVoisine(c.seances.concat([c.seanceDuJour]), c.apres,
                               apres.palier, c.equipement, 1);
      expect(cran).toBe(c.cranSuivant);
      expect(Moteur.constatDe(avant, apres, c.reglage, cran)).toEqual(c.constat);
    });
  });

  // ── LES CAS QUE LE FICHIER N'ATTEINT PAS ─────────────────────────────────
  //
  // Le fichier couvre les branches que la spec nomme. Trois viennent de la
  // campagne de mutation de 48b-6b — trois lignes du moteur qu'on pouvait
  // retirer sans faire rougir un seul des cas —, deux de 48b-6b-2 : le
  // sous-cas qu'aucun des 17 ne porte, et le changement de comportement qu'on
  // assume. Chacun part d'un cas du fichier, dont on ne change que ce qui le
  // rend discriminant — le reste vient de lui.
  const K = (id) => JSON.parse(JSON.stringify(CAS.filter((c) => c.id === id)[0]));
  const auPalier = (kg, reps) => ({ charge_kg: kg, reps: reps, rpe: null,
    role: 'palier', origine: 'travail' });
  const exploration = (kg, reps) => ({ charge_kg: kg, reps: reps, rpe: null,
    role: 'exploration', origine: 'exploration' });
  const uneSeance = (debut, palier, series) => ({ debut: debut, palier: palier, series: series });
  const constatDe = (c) => {
    const { avant, apres } = deux(c);
    const cran = apres.palier === null || apres.palier === undefined ? null
      : Moteur.chargeVoisine(c.seances.concat([c.seanceDuJour]), c.apres,
                             apres.palier, c.equipement, 1);
    return { cran: cran, constat: Moteur.constatDe(avant, apres, c.reglage, cran) };
  };

  // ── 48b-6b-2 ─────────────────────────────────────────────────────────────

  test('l’extension sur TOUTES les séries, mais sous le bas de la zone', () => {
    // Le sous-cas qu'aucun des 17 ne porte : les deux moitiés de la phrase
    // s'opposent — « ta nouvelle charge tient » et « pas encore dans ta zone ».
    // C'est la ZONE qui décide de la forme ; le compte, lui, se dit toujours.
    const c = K('K8');
    c.seanceDuJour = uneSeance('2026-09-20T18:00:00+00:00', 92.5,
      [auPalier(92.5, 8), auPalier(92.5, 8), auPalier(92.5, 8)]);
    expect(constatDe(c).constat).toEqual({
      verdict: '8-8-8 à 92,5' + NB + ': sur toutes tes séries, pas encore dans ta zone.',
      suite: 'Même cible la prochaine fois' + NB + ': 92,5' + NB + 'kg, vise 9.'
    });
  });

  test('sans zone connue, la clause de zone tombe (règle de bord, §9.1.2)', () => {
    // Sous 3 reps d'habitude il n'y a plus de zone du tout — l'état `bord`.
    // Le moteur ne peut pas dire « dans ta zone » et ne l'invente pas : la
    // phrase garde ce qu'elle sait, la charge, les reps, le nombre de séries.
    // Aucun des 17 ne passe par là, et c'est pourtant atteignable.
    const jour = (d, p, series) => uneSeance('2026-' + d + 'T18:00:00+00:00', p, series);
    const trois = (d) => jour(d, 100, [auPalier(100, 2), auPalier(100, 2), auPalier(100, 2)]);
    const c = {
      reglage: 'normal', equipement: 'barre',
      seances: ['07-19', '07-26', '08-02', '08-09'].map(trois).concat([
        jour('09-13', 100, [auPalier(100, 2), auPalier(100, 2), exploration(105, 2)])]),
      seanceDuJour: jour('09-20', 105,
        [auPalier(100, 2), auPalier(105, 2), auPalier(105, 2)]),
      avant: '2026-09-20T18:00:00+00:00', apres: '2026-09-20T20:00:00+00:00'
    };
    // La prémisse : c'est bien une consigne SANS zone.
    expect(deux(c).apres.zone).toBeNull();
    expect(constatDe(c).constat.verdict)
      .toBe('2-2 à 105' + NB + ': ta nouvelle charge tient sur 2 séries.');
  });

  test('CHANGEMENT ASSUMÉ — « tout passe » annoncé ne félicite plus d’office', () => {
    // 48b-6b lisait l'état de la consigne d'AVANT : `tout_passe` suffisait à
    // écrire « 92,5 kg sur toutes tes séries », que la séance ait pris la
    // charge ou non. Le moteur constate, il ne présume pas : si la charge
    // n'est pas prise, c'est une séance ordinaire, et elle se dit comme telle.
    const gagne = K('K8');
    gagne.seanceDuJour = uneSeance('2026-09-20T18:00:00+00:00', 90,
      [auPalier(90, 11), auPalier(90, 11), auPalier(90, 11)]);
    expect(constatDe(gagne).constat).toEqual({
      verdict: '90' + NB + 'kg' + NB + ': 10 reps le 13' + NB + 'sept., 11 aujourd\'hui.',
      suite: 'Il te manque une rep pour tester 92,5.'
    });

    const rien = K('K8');
    rien.seanceDuJour = uneSeance('2026-09-20T18:00:00+00:00', 90,
      [auPalier(90, 10), auPalier(90, 10), auPalier(90, 10)]);
    expect(constatDe(rien).constat).toEqual({
      verdict: 'Pas encore' + NB + ': 10-10-10 à 90.',
      suite: 'Même cible la prochaine fois' + NB + ': 90' + NB + 'kg, vise 11.'
    });

    // Et la garde qui porte le changement : plus aucune félicitation.
    [gagne, rien].forEach((c) => {
      expect(constatDe(c).constat.verdict).not.toMatch(/toutes tes séries/);
    });
    // K8 lui-même, où la charge EST prise, la dit toujours.
    expect(constatDe(K('K8')).constat.verdict).toMatch(/toutes tes séries/);
  });

  test('DISCRIMINANT — la fois d’avant ne se cite que si c’était LA MÊME CHARGE', () => {
    // Le retest d'un cran : 130 raté le 13 sept., 127,5 aujourd'hui. Les deux
    // séances portent un test, mais pas à la même charge. K1 tient l'autre
    // moitié de la règle — même charge les deux fois, la citation paraît.
    const c = K('K1');
    c.seances[c.seances.length - 1] = uneSeance('2026-09-13T18:00:00+00:00', 125,
      [auPalier(125, 5), auPalier(125, 5), exploration(130, 2)]);
    c.seanceDuJour = uneSeance('2026-09-20T18:00:00+00:00', 125,
      [auPalier(125, 5), auPalier(125, 5), exploration(127.5, 3)]);
    // Sans la garde, ce serait « 2 reps le 13 sept. » — le 130 raconté comme
    // un 127,5.
    expect(constatDe(c).constat).toEqual({
      verdict: '127,5' + NB + 'kg' + NB + ': 3 aujourd\'hui, au bas de ta zone.',
      suite: 'Prochaine séance' + NB + ': 125' + NB + 'kg, vise 5, puis 127,5' + NB +
             'kg en dernière série, vise 4.'
    });
  });

  test('DISCRIMINANT — hors Franc, la meilleure série ne compte pas', () => {
    // Des séries INÉGALES : 3-3-3 la fois d'avant, 4-3-3 aujourd'hui. Aucun
    // des 14 n'en a — ils montent tous d'un bloc. En Normal le niveau validé
    // est 3 : rien n'est gagné. En Franc, une seule série suffit.
    const c = K('K6');
    c.seanceDuJour = uneSeance('2026-09-20T18:00:00+00:00', 125,
      [auPalier(125, 4), auPalier(125, 3), auPalier(125, 3)]);
    expect(constatDe(c).constat).toEqual({
      verdict: 'Pas encore' + NB + ': 4-3-3 à 125.',
      suite: 'Même cible la prochaine fois' + NB + ': 125' + NB + 'kg, vise 4.'
    });
    // La jumelle, à la même séance : le réglage seul change le constat.
    expect(constatDe(Object.assign(c, { reglage: 'franc' })).constat).toEqual({
      verdict: '125' + NB + 'kg' + NB + ': 3 reps le 13' + NB + 'sept., 4 aujourd\'hui.',
      suite: 'Il te manque une rep pour tester 127,5.'
    });
  });

  test('DISCRIMINANT — sans cran connu, le manque s’annonce quand même', () => {
    // Une machine dont on n'a jamais bougé la charge : aucun pas observé, donc
    // aucun cran au-dessus à nommer. La phrase ne peut pas s'arrêter là pour
    // autant — il manque bien une rep.
    const c = K('K6');
    c.equipement = 'machine';
    const trois = (d, r) => uneSeance('2026-' + d + 'T18:00:00+00:00', 40,
      [auPalier(40, r), auPalier(40, r), auPalier(40, r)]);
    c.seances = ['07-19', '07-26', '08-02', '08-09', '09-13'].map((d) => trois(d, 8));
    c.seanceDuJour = trois('09-20', 9);
    const r = constatDe(c);
    expect(r.cran).toBeNull();
    expect(r.constat).toEqual({
      verdict: '40' + NB + 'kg' + NB + ': 8 reps le 13' + NB + 'sept., 9 aujourd\'hui.',
      suite: 'Il te manque une rep pour tester le cran au-dessus.'
    });
  });

  test('DISCRIMINANT — l’orchestrateur part des séries BRUTES, comme l’app', () => {
    // `constatDExercice` fait le pont lui-même : l'app lui passe ce qu'elle a
    // en mémoire, pas le contrat du moteur. Sans ce test, le pont pourrait
    // perdre une colonne sans qu'aucun des 14 cas ne s'en aperçoive.
    // ⚠️ DES IDENTIFIANTS, ET À CONTRE-SENS DU RANG (20/09/2026). Ces cas
    // n'en portaient aucun, et c'était leur angle mort : sans `id`, le
    // départage de `Palier.trier` ne se déclenchait pas et l'ordre du tableau
    // survivait par chance. L'app, elle, donne de vrais UUID — et pendant un
    // chantier, le constat a lu la séance du jour dans l'ordre de ces UUID.
    // Les deux formes de ce que l'app passe sont donc jouées : avec le rang
    // (depuis le correctif du 20/09), et sans lui.
    const brut = (avecRang) => (s) => ({ seance: { debut: s.debut },
      series: s.series.map((x, i, l) => {
        var ligne = { id: 'u' + (l.length - i), charge_kg: x.charge_kg, reps: x.reps,
          rpe: x.rpe, ressenti: null, type_serie: 'travail' };
        if (avecRang) ligne.rang = i + 1;
        return ligne;
      }) });
    // ⚠️ `{ etat: 'monte' }`, ET C'EST LA MOITIÉ DU PONT. Le rôle `rampe` ne
    // naît QUE sur un exercice qui monte (`palier.js`, §5.2) : sans cet état,
    // `analyser` prend la première série d'un échauffement en charge pour du
    // travail, et K15 comme K17 comptent « les 2 d'avant » au lieu d'« une ».
    // L'app passe `etatsExercices[slug]` ; le test doit passer la même chose.
    [true, false].forEach((avecRang) => {
      const forme = brut(avecRang);
      const quoi = avecRang ? 'avec rang' : 'sans rang';
      CAS.forEach((c) => {
        const r = Moteur.constatDExercice(
          c.seances.map(forme), forme(c.seanceDuJour), { etat: 'monte' }, c.avant, c.apres,
          { mesure: 'charge_reps', equipement: c.equipement, intention: 'progresser',
            reglage: c.reglage, edition: false });
        expect([quoi, c.id, r.constat]).toEqual([quoi, c.id, c.constat]);
        expect([quoi, c.id, r.cranSuivant]).toEqual([quoi, c.id, c.cranSuivant]);
      });
    });
  });

  // ── LA SÉANCE DU 20/09, CELLE QUI A OUVERT LE DÉFAUT ─────────────────────
  //
  // Squat, 21 h 09 : une rampe à 120, puis 130 sur trois séries — 5, 4, 4. Le
  // constat a écrit « 4-5-4 ». Ni l'ordre de l'écran, ni celui de la
  // validation : celui des UUID, tirés au hasard. C'est le cas d'espèce du
  // §1.2 de MOTEUR-PROGRESSION (`120 → 130 → 130 → 130` mal lu), par l'autre
  // bout — là, le rang manquait au lieu d'être ignoré.
  test('DISCRIMINANT — la séance du 20/09 se lit « 5-4-4 », jamais « 4-5-4 »', () => {
    const jour = (d) => '2026-' + d + 'T18:00:00+00:00';
    const hist = ['08-16', '08-23', '08-30', '09-06', '09-13'].map((d, i) => ({
      seance: { debut: jour(d) },
      series: [115 + i * 2.5, 115 + i * 2.5, 115 + i * 2.5].map((kg, k) => ({
        id: 'h' + k, rang: k + 1, charge_kg: kg, reps: 5, rpe: null,
        ressenti: null, type_serie: 'travail' }))
    }));
    // Les identifiants sont à CONTRE-SENS du rang, comme ce soir-là : trié sur
    // eux, on lirait « 4-5-4 » ; trié sur le rang, « 5-4-4 ».
    const duSoir = [[120, 5, 'z'], [130, 5, 'm'], [130, 4, 'b'], [130, 4, 'a']]
      .map((x, i) => ({ id: x[2], rang: i + 1, charge_kg: x[0], reps: x[1],
        rpe: null, ressenti: null, type_serie: 'travail' }));
    const r = Moteur.constatDExercice(hist, { seance: { debut: jour('09-20') }, series: duSoir },
      { etat: 'monte' }, jour('09-20'), '2026-09-20T21:30:00+00:00',
      { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser',
        reglage: 'normal', edition: false });
    expect(r.constat.verdict).toBe('Pas encore' + NB + ': 5-4-4 à 130.');
    expect(r.constat.verdict).not.toMatch(/4-5-4/);
    // Et le 120 reste la RAMPE, pas une descente de fin : l'ordre décide aussi
    // du rôle, donc de la phrase qui suit.
    const roles = r.apres.consigne.fondement.seance.map((x) => x.role);
    expect(roles).toEqual(['rampe', 'palier', 'palier', 'palier']);
  });

  test('DISCRIMINANT — là où le moteur se tait, il ne constate pas non plus', () => {
    const c = CAS[0];
    const brut = (s) => ({ seance: { debut: s.debut }, series: s.series.map((x) => ({
      charge_kg: x.charge_kg, reps: x.reps, rpe: null, ressenti: null, type_serie: 'travail' })) });
    const OPT = { mesure: 'charge_reps', equipement: 'barre', intention: 'progresser',
                  reglage: 'normal', edition: false };
    const faire = (quoi) => Moteur.constatDExercice(c.seances.map(brut), brut(c.seanceDuJour),
      undefined, c.avant, c.apres, Object.assign({}, OPT, quoi));
    expect(faire({})).not.toBeNull();
    [{ intention: 'entretien' }, { edition: true }, { mesure: 'reps' }].forEach((quoi) => {
      expect([quoi, faire(quoi)]).toEqual([quoi, null]);
    });
  });

  test('sans l’une des deux consignes, pas de constat', () => {
    expect(Moteur.constatDe(null, { etat: 'progression' }, 'normal', null)).toBeNull();
    expect(Moteur.constatDe({ etat: 'progression' }, null, 'normal', null)).toBeNull();
  });
});

// ── §3.9 — L'ÉCRAN : LE CONSTAT PREND LA PLACE DE LA CONSIGNE ───────────────
describe('l’en-tête passe au constat (ECRAN-SAISIE §3.9)', () => {
  const EXOS = [
    { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] }
  ];
  const LIB = { jaune: ['125' + NB + 'kg, vise 5'], gris: 'Une phrase grise.' };
  const CONSTAT = { verdict: '125' + NB + 'kg' + NB + ': 3 reps le 13' + NB + 'sept., 4 aujourd\'hui.',
                    suite: 'Il te manque une rep pour tester 127,5.' };
  const rendre = (vue) => {
    const s = ouverte(T(3));
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, Object.assign({
      blocs: Modele.blocsDeSeance(s, EXOS),
      modifier: false, selection: null, programme: false,
      surGrouper: () => {}, surDeplacerBloc: () => {},
      surMenuBloc: () => {}, surMenuExercice: () => {},
      tourAtteint: () => 0,
      exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
      precedent: () => null, fantome: () => ({}),
      libelles: () => LIB, etiquette: () => 'Lourd 3-5',
      surChamp: () => {}, surValider: () => {}, surNumero: () => {},
      surEffort: () => {}, surNote: () => {}, surRepos: () => {},
      surSupprimerSerie: () => {}, surAjoutSerie: () => {}
    }, vue || {}));
    return cible;
  };
  const textes = (c, sel) => [...c.querySelectorAll(sel)].map((e) => e.textContent);

  test('DISCRIMINANT — le constat REMPLACE la consigne, il ne s’y ajoute pas', () => {
    const c = rendre({ constat: () => CONSTAT });
    expect(textes(c, '.constat')).toEqual([CONSTAT.verdict]);
    expect(textes(c, '.constat-suite')).toEqual([CONSTAT.suite]);
    // Plus une seule ligne de consigne : elle prescrivait ce qui vient d'être fait.
    expect(textes(c, '.consigne, .consigne-dit')).toEqual([]);
  });

  test('sans constat, la consigne reste', () => {
    const c = rendre({ constat: () => null });
    expect(textes(c, '.consigne')).toEqual(LIB.jaune);
    expect(textes(c, '.constat, .constat-suite')).toEqual([]);
    // Et une vue qui ne connaît pas encore `constat` — les tests d'avant 48b-6b.
    expect(textes(rendre({}), '.consigne')).toEqual(LIB.jaune);
  });

  test('l’étiquette de zone reste, elle', () => {
    expect(textes(rendre({ constat: () => CONSTAT }), '.puce-zone')).toEqual(['Lourd 3-5']);
  });

  test('DISCRIMINANT — jamais en jaune : le constat ne porte aucune classe de consigne', () => {
    const c = rendre({ constat: () => CONSTAT });
    [...c.querySelectorAll('.constat, .constat-suite')].forEach((n) => {
      expect(n.className).not.toMatch(/consigne/);
    });
  });

  test('un constat sans suite ne pose qu’une ligne', () => {
    const c = rendre({ constat: () => ({ verdict: 'Pas de palier aujourd\'hui.', suite: null }) });
    expect(textes(c, '.constat')).toEqual(['Pas de palier aujourd\'hui.']);
    expect(textes(c, '.constat-suite')).toEqual([]);
  });

  // ── §3.9 (48b-6b-2) — LA PORTE ÉTROITE ───────────────────────────────────

  test('DISCRIMINANT — majConstat réécrit les deux lignes SANS toucher aux champs', () => {
    // TOUTE la raison d'être de cette fonction : taper dans un champ ne
    // redessine pas la séance, sinon le champ perdrait le focus au milieu d'un
    // nombre. Si un jour elle reconstruit la légende, ce test tombe — et c'est
    // exactement ce qu'on lui demande de garder.
    const c = rendre({ constat: () => CONSTAT });
    const champ = c.querySelector('input');
    champ.value = '127,5';
    Rendu().majConstat(c, 'dc', { verdict: 'Nouveau verdict.', suite: 'Nouvelle suite.' });
    expect(textes(c, '.constat')).toEqual(['Nouveau verdict.']);
    expect(textes(c, '.constat-suite')).toEqual(['Nouvelle suite.']);
    expect(c.querySelector('input')).toBe(champ);
    expect(champ.value).toBe('127,5');
  });

  test('la suite se retire quand elle disparaît, et revient à sa place', () => {
    const c = rendre({ constat: () => CONSTAT });
    Rendu().majConstat(c, 'dc', { verdict: 'Seul.', suite: null });
    expect(textes(c, '.constat-suite')).toEqual([]);
    Rendu().majConstat(c, 'dc', { verdict: 'Seul.', suite: 'De retour.' });
    expect(textes(c, '.constat-suite')).toEqual(['De retour.']);
    const classes = [...c.querySelector('.legende-exo').children].map((n) => n.className);
    expect(classes.indexOf('constat-suite')).toBe(classes.indexOf('constat') + 1);
  });

  test('DISCRIMINANT — sans constat à l’écran, elle ne construit rien', () => {
    // Elle ne fait pas revenir la consigne et ne crée pas un constat absent :
    // c'est le prochain vrai rendu qui s'en charge.
    const c = rendre({ constat: () => null });
    Rendu().majConstat(c, 'dc', CONSTAT);
    expect(textes(c, '.constat, .constat-suite')).toEqual([]);
    expect(textes(c, '.consigne')).toEqual(LIB.jaune);
    expect(() => Rendu().majConstat(c, 'slug-inconnu', CONSTAT)).not.toThrow();
    expect(() => Rendu().majConstat(null, 'dc', CONSTAT)).not.toThrow();
  });

  test('DISCRIMINANT — en mode programme, rien, même avec un constat', () => {
    const s = ouverte(T(3));
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, {
      blocs: Modele.blocsDeSeance(s, EXOS), modifier: false, selection: null, programme: true,
      surGrouper: () => {}, surDeplacerBloc: () => {}, surMenuBloc: () => {},
      surMenuExercice: () => {}, tourAtteint: () => 0,
      exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
      precedent: () => null, fantome: () => ({}), constat: () => CONSTAT,
      surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {},
      surNote: () => {}, surRepos: () => {}, surSupprimerSerie: () => {}, surAjoutSerie: () => {}
    });
    expect(textes(cible, '.constat, .constat-suite')).toEqual([]);
  });
});
