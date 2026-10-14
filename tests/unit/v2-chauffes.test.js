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

describe('§9.15.1 — les chauffes, les 30 cas', () => {
  test('le fichier a 30 chauffes et 7 dégressives', () => {
    expect(FICHIER.chauffes).toHaveLength(30);
    expect(FICHIER.degressives).toHaveLength(7);
  });

  FICHIER.chauffes.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const r = M.chauffesDe(c.entree);
      expect(extrait(r, c.attendu)).toEqual(c.attendu);
      // Octet par octet : la phrase avec ses espaces insécables.
      if ('phrase' in c.attendu) expect(octets(r.phrase)).toBe(octets(c.attendu.phrase));
      if ('phrase_proposition' in c.attendu) {
        expect(octets(r.phrase_proposition)).toBe(octets(c.attendu.phrase_proposition));
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
          phrase: 'Enlève 2 × 5\u00a0kg : 30\u00a0kg. Sans repos, jusqu\'à l\'échec. Vise 5 à 7.' }
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
    expect(r.phrase).toBe('Chauffes calées sur 125 kg : 20 · 60 · 90 · 110 kg.');
    const p = M.chauffesDe({ equipement: 'barre', reference: 95, deja_sollicite: false, routine: null });
    expect(p.phrase_proposition).toBe('Chauffe : 20 kg × 10 · 45 kg × 6 · 65 kg × 3 · 85 kg × 1');
  });

  test('« soulevé au sol » : le conventionnel, le sumo, la barre hexagonale — pas le roumain', () => {
    expect(M.SOULEVES_AU_SOL).toEqual(['souleve_de_terre_barre', 'souleve_de_terre_sumo', 'souleve_de_terre_barre_hex']);
    expect(M.SOULEVES_AU_SOL.some((s) => /roumain|jambes_tendues/.test(s))).toBe(false);
  });

  // §9.15.2 (delta 49-24) — le seuil d'une PROPOSITION, des deux côtés ; et
  // il ne touche jamais les chauffes de la routine.
  test('seuil de proposition : 60 kg à la barre, 80 kg ailleurs, bornes comprises', () => {
    const p = (equipement, reference) => M.chauffesDe({ equipement, reference, deja_sollicite: false, cran: 5, routine: null }).proposition.length;
    expect(p('barre', 57.5)).toBe(0);
    expect(p('barre', 60)).toBeGreaterThan(0);
    expect(p('machine', 77.5)).toBe(0);
    expect(p('machine', 80)).toBeGreaterThan(0);
    expect(p('haltere', 78)).toBe(0);
    expect(p('poulie', 80)).toBeGreaterThan(0);
    expect(M.SEUIL_PROPOSITION_BARRE).toBe(60);
    expect(M.SEUIL_PROPOSITION_AUTRE).toBe(80);
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
