/** @jest-environment node */
//
// 49-U10 — les chauffes et les dégressives, calculées par le coach (MOTEUR
// §9.15, delta 49-22 du 29/09/2026). La routine décide combien de chauffes et
// de dégressives, et leurs reps ; le coach en calcule la charge, à partir de la
// charge de la consigne figée (la ligne, pas le test).
//
// LE FICHIER DE CAS FAIT FOI. `cas-49u10-chauffes.json` (25 chauffes, 7
// dégressives) sort de `cas_chauffes49.py` (Claude.ai, 30/09/2026). Les phrases
// se comparent OCTET PAR OCTET, espaces insécables compris. Un cas qui semble
// faux se rapporte ; il ne se corrige pas ici.

require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');

const FICHIER = require('./fixtures/cas-49u10-chauffes.json');

// Seules les clés du cas sont comparées, dans l'ordre du cas.
const extrait = (r, attendu) => Object.keys(attendu).reduce((o, k) => { o[k] = r[k]; return o; }, {});
const octets = (s) => (s === null || s === undefined ? s : Buffer.from(s, 'utf8').toString('hex'));

describe('§9.15.1 — les chauffes, les 25 cas', () => {
  test('le fichier a 25 chauffes et 7 dégressives', () => {
    expect(FICHIER.chauffes).toHaveLength(25);
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

describe('§9.15.3 — les dégressives, les 7 cas', () => {
  FICHIER.degressives.forEach((c) => {
    test(c.id + ' — ' + c.titre, () => {
      const r = M.degressiveDe(c.entree);
      expect(extrait(r, c.attendu)).toEqual(c.attendu);
      expect(octets(r.phrase)).toBe(octets(c.attendu.phrase));
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

  test('égalité d\'arrondi vers le bas : 75 kg à 50 % (37,5) donne 35, pas 40', () => {
    const r = M.chauffesDe({ equipement: 'barre', reference: 75, deja_sollicite: false, routine: [10, 6, 3, 1] });
    expect(r.lignes[1].charge).toBe(35);
  });
});
