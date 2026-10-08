/** @jest-environment node */
//
// 60-4 — LES FICHIERS REÇUS DE CLAUDE.AI : la référence, le fichier de cas, la maquette.
//
// Ils font foi (« un cas qui te semble faux se rapporte, il ne se corrige pas en silence »). Ce test les épingle
// par leur taille et leur empreinte : toucher un octet, c'est le faire voir. Il ne rejoue rien — le portage JS
// rejoue les cas dans `v2-generateur.test.js` ; `gen60.py` est une trace, jamais exécutée par la suite.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sha = (brut) => crypto.createHash('sha256').update(brut).digest('hex');
const lire = (...p) => fs.readFileSync(path.join(__dirname, '../..', ...p));

describe('60-4 — les fichiers embarqués, octet pour octet', () => {
  test('la référence gen60.py est celle reçue de Claude.ai', () => {
    const brut = lire('tests/unit/fixtures/gen60.py');
    expect(brut.length).toBe(14297);
    expect(sha(brut)).toBe('6dcf9185640f3b49d84a82083d829875cc02bed26a914f1e454a2572752f0f91');
  });

  test('le fichier de cas cas-60-4-generateur.json est celui reçu de Claude.ai', () => {
    const brut = lire('tests/unit/fixtures/cas-60-4-generateur.json');
    expect(brut.length).toBe(88562);
    expect(sha(brut)).toBe('7fa6191a19d4e9faf05090dd7e2c15c6254fa4101246e07f4e2e5f625efd7843');
  });

  test('la maquette maquette-generateur-v1.html est celle reçue de Claude.ai', () => {
    const brut = lire('v2-atelier/maquettes/maquette-generateur-v1.html');
    expect(brut.length).toBe(33983);
    expect(sha(brut)).toBe('a5742fa211d8d0c179fc3325a66c2e42e222867421d4f2e4624e8d1198794982');
  });

  test('le fichier de cas porte ce que la spec (§5 bis) en dit : 17 programmes, 64 gestes, 30 cartes', () => {
    const C = JSON.parse(lire('tests/unit/fixtures/cas-60-4-generateur.json').toString('utf8'));
    expect(C.generer).toHaveLength(17);
    expect(C.ne_veux_pas).toHaveLength(64);
    expect(C.carte_cycles).toHaveLength(30);
    expect(C.format_exercice).toEqual(['exercise_slug', 'motif', 'role', 'series', 'reps', 'prioritaire', 'menage', 'barre_fixe']);
    // Les deux élastiques de v2_066 sont au catalogue du cas.
    expect(C.catalogue.rowing_elastique[0]).toBe('elastique');
    expect(C.catalogue.tirage_vertical_elastique[0]).toBe('elastique');
  });
});
