/** @jest-environment node */
//
// 49-U10 — les chauffes et les dégressives, calculées par le coach (MOTEUR
// §9.15, delta 49-22 du 29/09/2026). La routine décide combien de chauffes et
// de dégressives, et leurs reps ; le coach en calcule la charge, à partir de la
// charge de la consigne figée (la ligne, pas le test).
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u10-chauffes.json` (30 chauffes, 7
// dégressives) sort de `cas_chauffes49.py` (Claude.ai, 30/09/2026 ; remplacé
// le même jour pour le seuil des propositions, delta 49-24 — ses espaces
// insécables y sont écrites `\u00a0`, le JSON les relit). Les phrases
// se comparent OCTET PAR OCTET, espaces insécables compris. Un cas qui semble
// faux se rapporte ; il ne se corrige pas ici.

require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');

const FICHIER = require('./fixtures/cas-49u10-chauffes.json');

// Seules les clés du cas sont comparées, dans l'ordre du cas.
const extrait = (r, attendu) => Object.keys(attendu).reduce((o, k) => { o[k] = r[k]; return o; }, {});
const octets = (s) => (s === null || s === undefined ? s : Buffer.from(s, 'utf8').toString('hex'));

// 20/11/2026 (MOTEUR §9.15 delta, « une seule montée ») — LES CAS QUE LA DÉCISION D'AURÉLIEN REMPLACE, comme REMPLACES_94 : le fichier vient
// de la référence et ne se corrige pas ici (rapporté à Claude.ai pour régénération). Toutes les phrases disent l'unité et les reps de chaque
// chauffe (« 20 kg × 10 · 60 kg × 6 · … ») ; les charges ne changent que pour les cas nommés.
const REMPLACES_20_11 = {
  // C001 — la phrase seule (unité et reps sur chaque chauffe)
  C001: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 6, "charge": 60, "reps_coach": false}, {"reps": 3, "charge": 90, "reps_coach": false}, {"reps": 1, "charge": 110, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 125\u00a0kg : 20\u00a0kg × 10 · 60\u00a0kg × 6 · 90\u00a0kg × 3 · 110\u00a0kg × 1."},
  // C002 — la phrase seule (unité et reps sur chaque chauffe)
  C002: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 6, "charge": 60, "reps_coach": false}, {"reps": 3, "charge": 90, "reps_coach": false}, {"reps": 1, "charge": 110, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 125\u00a0kg : 20\u00a0kg × 10 · 60\u00a0kg × 6 · 90\u00a0kg × 3 · 110\u00a0kg × 1."},
  // C003 — la dernière à 90 % au plus (140 = 90,3 % → 130)
  C003: {"situation": "sol", "lignes": [{"reps": 5, "charge": 80, "reps_coach": false}, {"reps": 3, "charge": 110, "reps_coach": false}, {"reps": 1, "charge": 130, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 155\u00a0kg : 80\u00a0kg × 5 · 110\u00a0kg × 3 · 130\u00a0kg × 1."},
  // C004 — la phrase seule (unité et reps sur chaque chauffe)
  C004: {"situation": "barre_legere", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 2, "charge": 50, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 57,5\u00a0kg : 20\u00a0kg × 10 · 50\u00a0kg × 2."},
  // C005 — la phrase seule (unité et reps sur chaque chauffe)
  C005: {"situation": "deja_barre", "lignes": [{"reps": 5, "charge": 60, "reps_coach": false}, {"reps": 2, "charge": 90, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 100\u00a0kg : 60\u00a0kg × 5 · 90\u00a0kg × 2."},
  // C006 — une ligne à froid : 70 % au plus (était 60 %)
  C006: {"situation": "premier_autre", "lignes": [{"reps": 8, "charge": 56, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 80\u00a0kg : 56\u00a0kg × 8."},
  // C007 — une ligne à froid : 70 % au plus
  C007: {"situation": "barre_lourde", "lignes": [{"reps": 8, "charge": 90, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 140\u00a0kg : 90\u00a0kg × 8."},
  // C008 — la phrase seule (unité et reps sur chaque chauffe)
  C008: {"situation": "barre_lourde", "lignes": [{"reps": 6, "charge": 60, "reps_coach": false}, {"reps": 3, "charge": 90, "reps_coach": false}, {"reps": 1, "charge": 110, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 125\u00a0kg : 60\u00a0kg × 6 · 90\u00a0kg × 3 · 110\u00a0kg × 1."},
  // C009 — la phrase seule (unité et reps sur chaque chauffe)
  C009: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 6, "charge": 35, "reps_coach": false}, {"reps": 3, "charge": 50, "reps_coach": false}, {"reps": 1, "charge": 60, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 70\u00a0kg : 20\u00a0kg × 10 · 35\u00a0kg × 6 · 50\u00a0kg × 3 · 60\u00a0kg × 1."},
  // C010 — la phrase seule (unité et reps sur chaque chauffe)
  C010: {"situation": "barre_legere", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 2, "charge": 60, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 67,5\u00a0kg : 20\u00a0kg × 10 · 60\u00a0kg × 2."},
  // C011 — la phrase seule (unité et reps sur chaque chauffe)
  C011: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 6, "charge": 50, "reps_coach": false}, {"reps": 3, "charge": 70, "reps_coach": false}, {"reps": 1, "charge": 90, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 100\u00a0kg : 20\u00a0kg × 10 · 50\u00a0kg × 6 · 70\u00a0kg × 3 · 90\u00a0kg × 1."},
  // C012 — la phrase seule (unité et reps sur chaque chauffe)
  C012: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 6, "charge": 50, "reps_coach": false}, {"reps": 3, "charge": 70, "reps_coach": false}, {"reps": 1, "charge": 85, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 97,5\u00a0kg : 20\u00a0kg × 10 · 50\u00a0kg × 6 · 70\u00a0kg × 3 · 85\u00a0kg × 1."},
  // C013 — la phrase seule (unité et reps sur chaque chauffe)
  C013: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 6, "charge": 50, "reps_coach": false}, {"reps": 3, "charge": 70, "reps_coach": false}, {"reps": 1, "charge": 90, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 105\u00a0kg : 20\u00a0kg × 10 · 50\u00a0kg × 6 · 70\u00a0kg × 3 · 90\u00a0kg × 1."},
  // C016 — une ligne à froid : 70 % au plus
  C016: {"situation": "premier_autre", "lignes": [{"reps": 8, "charge": 70, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 100\u00a0kg : 70\u00a0kg × 8."},
  // C017 — une ligne à froid : 70 % au plus
  C017: {"situation": "premier_autre", "lignes": [{"reps": 8, "charge": 30, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 45\u00a0kg : 30\u00a0kg × 8."},
  // C018 — une marche pour chaque ligne (k ≥ 4 : régulières de 33 % à 88 %), plus de ligne vide
  C018: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 6, "charge": 40, "reps_coach": false}, {"reps": 3, "charge": 60, "reps_coach": false}, {"reps": 1, "charge": 90, "reps_coach": false}, {"reps": 1, "charge": 110, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 125\u00a0kg : 20\u00a0kg × 10 · 40\u00a0kg × 6 · 60\u00a0kg × 3 · 90\u00a0kg × 1 · 110\u00a0kg × 1."},
  // C019 — deux lignes : 50 % puis 88 % (TT6, règle 2 ; était 60 %)
  C019: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 60, "reps_coach": false}, {"reps": 5, "charge": 110, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 125\u00a0kg : 60\u00a0kg × 10 · 110\u00a0kg × 5."},
  // C020 — la phrase seule (unité et reps sur chaque chauffe)
  C020: {"situation": "barre_legere", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 2, "charge": 25, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 30\u00a0kg : 20\u00a0kg × 10 · 25\u00a0kg × 2."},
  // C021 — la phrase seule (unité et reps sur chaque chauffe)
  C021: {"situation": "barre_lourde", "lignes": [{"reps": 10, "charge": 20, "reps_coach": false, "barre": true}, {"reps": 6, "charge": 35, "reps_coach": false}, {"reps": 3, "charge": 50, "reps_coach": false}, {"reps": 1, "charge": 65, "reps_coach": false}], "non_remplies": 0, "phrase": "Chauffes calées sur 72,5\u00a0kg : 20\u00a0kg × 10 · 35\u00a0kg × 6 · 50\u00a0kg × 3 · 65\u00a0kg × 1."},
};

describe('§9.15.1 — les chauffes, les 30 cas', () => {
  test('le fichier a 30 chauffes et 7 dégressives', () => {
    expect(FICHIER.chauffes).toHaveLength(30);
    expect(FICHIER.degressives).toHaveLength(7);
  });

  // 237 (§9.41) — les cas « Proposition » (routine nulle) ne sont plus joués ici : sans ligne de chauffe, c'est
  // `Moteur.propositionDeChauffes` qui décide (v2-chauffes-proposees-237.test.js). `chauffesDe` ne remplit que des lignes.
  FICHIER.chauffes.filter((c) => c.entree.routine !== null).forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const r = M.chauffesDe(c.entree);
      const attendu = REMPLACES_20_11[c.id] || c.attendu;
      expect(extrait(r, attendu)).toEqual(attendu);
      // Octet par octet : la phrase avec ses espaces insécables.
      if ('phrase' in attendu) expect(octets(r.phrase)).toBe(octets(attendu.phrase));
      if ('phrase_proposition' in attendu) {
        expect(octets(r.phrase_proposition)).toBe(octets(attendu.phrase_proposition));
      }
    });
  });
});

// 94 (14/10/2026) — D003 (« à la barre : pas de dégressive ») est REMPLACÉ par
// la décision d'Aurélien (§9.15.3 révisé) : la dégressive posée se remplit à la
// barre aussi. Le fichier de cas vient de la référence (`cas_chauffes49.py`) et
// ne se corrige pas ici : rapporté à Claude.ai pour régénération. En attendant,
// D003 se joue contre ce que la décision dit.
const REMPLACES_94 = {
  D003: { charge: 30, vise: [5, 7], enleve: 5,
          phrase: 'Enlève 5\u00a0kg de chaque côté : 30\u00a0kg. Sans repos, jusqu\'à l\'échec. Vise 5 à 7.' }
};
describe('§9.15.3 — les dégressives, les 7 cas', () => {
  FICHIER.degressives.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const r = M.degressiveDe(c.entree);
      const attendu = REMPLACES_94[c.id] || c.attendu;
      expect(extrait(r, attendu)).toEqual(attendu);
      expect(octets(r.phrase)).toBe(octets(attendu.phrase));
    });
  });
});

describe('§9.15 — ce que les cas supposent', () => {
  test('les phrases portent une espace insécable entre le nombre et « kg », et seulement là', () => {
    const r = M.chauffesDe({ equipement: 'barre', reference: 125, deja_sollicite: false, routine: [10, 6, 3, 1] });
    // 20/11/2026 — l'unité et les reps sur chaque chauffe (MOTEUR §9.15 delta).
    expect(r.phrase).toBe('Chauffes calées sur 125\u00a0kg : 20\u00a0kg × 10 · 60\u00a0kg × 6 · 90\u00a0kg × 3 · 110\u00a0kg × 1.');
    const p = M.propositionDeChauffes({ equipement: 'barre', reference: 100, e1rm: 120, premier: true });
    // Le coach choisit : la barre vide, une marche par 40 kg (⌈(90 − 20) / 40⌉ = 2), la dernière à 88 % (bande inconnue).
    expect(p.phrase).toBe('Chauffe : 20\u00a0kg × 10 · 50\u00a0kg × 6 · 90\u00a0kg × 1.');
  });

  test('« soulevé au sol » : le conventionnel, le sumo, la barre hexagonale — pas le roumain', () => {
    expect(M.SOULEVES_AU_SOL).toEqual(['souleve_de_terre_barre', 'souleve_de_terre_sumo', 'souleve_de_terre_barre_hex']);
    expect(M.SOULEVES_AU_SOL.some((s) => /roumain|jambes_tendues/.test(s))).toBe(false);
  });

  test('le seuil ne touche pas les chauffes de la routine : barre à 30 kg, machine à 20 kg, remplies', () => {
    expect(M.chauffesDe({ equipement: 'barre', reference: 30, deja_sollicite: false, routine: [10, 2] }).lignes
      .map((l) => l.charge)).toEqual([20, 25]);
    expect(M.chauffesDe({ equipement: 'machine', reference: 20, deja_sollicite: false, cran: 2.5, routine: [8] }).lignes
      .map((l) => l.charge)).toEqual([12.5]);
  });

  test('égalité d\'arrondi vers le bas : 75 kg à 50 % (37,5) donne 35, pas 40', () => {
    const r = M.chauffesDe({ equipement: 'barre', reference: 75, deja_sollicite: false, routine: [10, 6, 3, 1] });
    expect(r.lignes[1].charge).toBe(35);
  });
});
