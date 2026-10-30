/** @jest-environment node */
//
// 60-4 / 60-6 — LES FICHIERS REÇUS DE CLAUDE.AI : les références, le fichier de cas, la maquette.
//
// Ils font foi (« un cas qui te semble faux se rapporte, il ne se corrige pas en silence »). Ce test les épingle
// par leur taille et leur empreinte : toucher un octet, c'est le faire voir. Il ne rejoue rien — le portage JS
// rejoue les cas dans `v2-generateur.test.js` ; `gen60.py` et `gen60b.py` sont des traces, jamais exécutées par la suite.
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

  test('la maquette maquette-generateur-v1.html est celle reçue de Claude.ai', () => {
    const brut = lire('v2-atelier/maquettes/maquette-generateur-v1.html');
    expect(brut.length).toBe(33983);
    expect(sha(brut)).toBe('a5742fa211d8d0c179fc3325a66c2e42e222867421d4f2e4624e8d1198794982');
  });
});

// ── 60-6 : la référence et les cas après l'audit des profils ───────────────────
// `gen60b.py` = `gen60.py` + quatre règles ; `cas-60-6-generateur.json` a remplacé `cas-60-4-generateur.json` (quinze
// de ses dix-sept programmes sortent à l'identique, les deux de 2 jours changent exprès : le rejeu le montre).
describe('60-6 — les fichiers embarqués, octet pour octet', () => {
  test('la référence gen60b.py est celle reçue de Claude.ai, revue en 190 (la barre de traction)', () => {
    const brut = lire('tests/unit/fixtures/gen60b.py');
    expect(brut.length).toBe(17308);
    expect(sha(brut)).toBe('4e5db26072155af71da8c17b407a04fdba841b53ba990204a3194103a21a110e');
  });

  test('le fichier de cas cas-60-6-generateur.json est celui reçu de Claude.ai', () => {
    const brut = lire('tests/unit/fixtures/cas-60-6-generateur.json');
    expect(brut.length).toBe(122887);
    expect(sha(brut)).toBe('258a1948754ad1ac6753f8a6c166741def0f6587ab88ed4739208b8588760fa6');
    expect(brut[brut.length - 1]).not.toBe(10);                             // une seule ligne, sans saut de ligne final
  });

  test('le fichier de cas porte ce que la spec (§5 bis) en dit : 32 programmes, 78 gestes, 30 cartes', () => {
    const C = JSON.parse(lire('tests/unit/fixtures/cas-60-6-generateur.json').toString('utf8'));
    expect(C.generer).toHaveLength(32);
    expect(C.ne_veux_pas).toHaveLength(78);
    expect(C.carte_cycles).toHaveLength(30);
    expect(C.format_exercice).toEqual(['exercise_slug', 'motif', 'role', 'series', 'reps', 'prioritaire', 'menage', 'barre_fixe']);
    // Les nouveautés d'entrée : l'ancienneté et le matériel non renseigné.
    expect(C.generer.filter((c) => c.entree.anciennete === 'moins_1_an').length).toBeGreaterThan(0);
    expect(C.generer.filter((c) => c.entree.materiel === null).length).toBeGreaterThan(0);
    // Les deux élastiques de v2_066 sont au catalogue du cas.
    expect(C.catalogue.rowing_elastique[0]).toBe('elastique');
    expect(C.catalogue.tirage_vertical_elastique[0]).toBe('elastique');
  });
});
