// 166 — l'assistant : cinq correctifs de la relecture du 24/10/2026 (D1, D4, D5+D6, D7, D9).
// Chaque défaut est d'abord prouvé rouge sur main, puis tenu dans les deux sens.
const fs = require('fs');
const path = require('path');
global.THModele = require('../../v2/js/modele.js');
const C = require('../../supabase/functions/demander-coach/controle.js');
const A = require('../../v2/js/assistant.js');

describe('166 D1 — sansDate ne retire que les vraies dates', () => {
  test.each([
    ['Tu as fait 3 séries de 5 reps à 100 kg, avec une pause de 3 min.', 'Tu as fait 3 séries de 5 reps à 100 kg, avec une pause de 3 min.'],
    ['Charge de 12 kg, puis marge de 2 reps.', 'Charge de 12 kg, puis marge de 2 reps.'],
    ['Séries de 8 reps, repos de 2 min, le 8 reps compte.', 'Séries de 8 reps, repos de 2 min, le 8 reps compte.'],
  ])('les chiffres sont gardés : %s', (entree, attendu) => {
    expect(A.sansDate(entree)).toBe(attendu);
    expect(C.sansDate(entree)).toBe(attendu);
  });
  test.each([
    ['Ton test du 13 sept. a fait 12 reps.', 'Ton test a fait 12 reps.'],
    ['Ton test le 3 octobre 2026 a fait 12 reps.', 'Ton test a fait 12 reps.'],
    ['Ton test le 1er août a fait 12 reps.', 'Ton test a fait 12 reps.'],
    ['Ton test du 24/10 a fait 12 reps.', 'Ton test a fait 12 reps.'],
    ['Ton test fait le 2026-10-20 est bon.', 'Ton test fait est bon.'],
    ['celle de ton test mardi : elle ne bouge pas', 'celle de ton test: elle ne bouge pas'],
    ['Tu as fait 20 reps il y a 3 jours.', 'Tu as fait 20 reps.'],
    ['Ton test est dans ta zone. Hier, tu as fait 20 reps.', 'Ton test est dans ta zone. Tu as fait 20 reps.'],
  ])('les vraies dates partent : %s', (entree, attendu) => {
    expect(A.sansDate(entree)).toBe(attendu);
    expect(C.sansDate(entree)).toBe(attendu);
  });
});

describe('166 D4 — une douleur ne part jamais (liste élargie, une seule liste)', () => {
  const DOULEURS = ['mon genou tire quand je descends', 'ça pince dans l’épaule', 'j’ai une gêne au coude', 'ça me lance', 'ça coince',
    'ça me fait souffrir', 'douleur', 'blessure', 'tendinite', 'ça craque et fait mal', 'élancement', 'j\'ai un élancement dans le bras',
    'mon épaule me lance', 'ma hanche pince'];
  const PAS = ['je m’y prends mal', 'tirage horizontal', 'tire-bouchon', 'je tire la barre', 'tirer la barre vers moi', 'Pourquoi le tirage poitrine ?',
    'Pourquoi 3 séries de 5 reps ?', 'c’est lourd pour le dos de la barre ? non je demande la charge'];
  test.each(DOULEURS)('douleur : %s', (q) => { expect(C.estSante(q)).toBe(true); expect(A.estSante(q)).toBe(true); });
  test.each(PAS.slice(0, 7))('pas une douleur : %s', (q) => { expect(C.estSante(q)).toBe(false); expect(A.estSante(q)).toBe(false); });
  test('DISCRIMINANT — les deux listes (santé et dates) sont identiques', () => {
    expect(A.MOTIFS_SANTE).toEqual(C.MOTIFS_SANTE);
    expect(A.MOTIFS_DATE).toEqual(C.MOTIFS_DATE);
    expect(A.MOTIFS_DATE.length).toBeGreaterThan(3);
  });
});

describe('166 D5 + D6 — une question de santé ne s’écrit nulle part', () => {
  const index = fs.readFileSync(path.join(__dirname, '../../supabase/functions/demander-coach/index.ts'), 'utf8');
  const bloc = index.slice(index.indexOf('if (C.estSante(question))'), index.indexOf('// 5.'));
  test('le chemin santé répond la phrase de renvoi sans appeler garder() ni toucher à la base', () => {
    expect(bloc).toMatch(/REPONSE_SANTE/);
    expect(bloc).not.toMatch(/garder\(/);
    expect(bloc).not.toMatch(/\.insert\(|\.delete\(|\.update\(|\.upsert\(|\.rpc\(/);
  });
});

describe('166 D7 — la fonction se garde seule', () => {
  const index = fs.readFileSync(path.join(__dirname, '../../supabase/functions/demander-coach/index.ts'), 'utf8');
  test('la taille du corps est bornée avant req.json()', () => {
    expect(C.corpsTropGros('99999', C.MAX_CORPS)).toBe(true);
    expect(C.corpsTropGros('1200', C.MAX_CORPS)).toBe(false);
    expect(C.corpsTropGros(null, C.MAX_CORPS)).toBe(false);
    expect(index.indexOf('corpsTropGros')).toBeGreaterThan(-1);
    expect(index.indexOf('corpsTropGros')).toBeLessThan(index.indexOf('req.json()') > -1 ? index.indexOf('req.json()') : 1e9);
    expect(index).not.toMatch(/await req\.json\(\)/);
  });
  test('la question est filtrée comme dans l’app, quel que soit le format', () => {
    expect(C.nettoyerQuestion('Pourquoi mon test du 24/10 est à 130 kg ?')).toBe('Pourquoi mon test est à 130 kg ?');
    expect(C.nettoyerQuestion('Pourquoi 3 séries de 5 reps ?')).toBe('Pourquoi 3 séries de 5 reps ?');
  });
  test('le contexte est filtré en profondeur, puis une date qui reste fait un 400', () => {
    const bon = { exercice: 'Squat', consigne: '130 kg × 5', lignes: [{ texte: '130 kg × 5', role: 'test le 3 octobre 2026' }], seances: [['130 kg × 5']] };
    const net = C.nettoyerContexte(bon);
    expect(net.lignes[0].role).toBe('test');
    expect(C.verifierContexte(net)).toEqual({ ok: true, raison: null });
    ['24/10', 'le 3 octobre 2026', 'du 13 sept.', '2026-10-20', 'mardi', 'il y a 3 jours']
      .forEach((d) => expect(C.verifierContexte(Object.assign({}, net, { etat: 'ton test ' + d })).raison).toBe('date'));
    const propre = Object.assign({}, bon, { lignes: net.lignes });
    expect(C.verifierContexte(Object.assign({}, propre, { etat: 'séries de 5 reps, pause de 3 min' })).ok).toBe(true);
  });
});

describe('166 D9 — pas de boucle d’accord', () => {
  test('403 accord alors que l’accord local est posé : la conversation reste, une ligne le dit', () => {
    expect(A.issueAccordRefuse({ assistant_accord_a: '2026-10-24T10:00:00Z' })).toBe('attente');
    expect(A.issueAccordRefuse({})).toBe('accord');
    expect(A.issueAccordRefuse(null)).toBe('accord');
    expect(A.TEXTES.accordEnAttente).toBe('Ton accord part dès que le réseau revient.');
  });
});
