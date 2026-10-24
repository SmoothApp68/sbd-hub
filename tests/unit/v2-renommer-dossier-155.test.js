/** @jest-environment node */
//
// 155 — « Renommer le dossier » : le plan d'écritures (fonction pure de routines.js).
const path = require('path');
const Routines = require(path.join(__dirname, '../../v2/js/routines.js'));

const NOW = '2026-10-24T10:00:00.000Z';
const routines = [
  { id: 'a', nom: 'Haut A', dossier: 'Sèche', archivee_a: null },
  { id: 'b', nom: 'Bas A', dossier: 'Sèche', archivee_a: null },
  { id: 'c', nom: 'Vieille', dossier: 'Sèche', archivee_a: '2026-10-01T00:00:00Z' },
  { id: 'd', nom: 'Masse', dossier: 'Prise de masse', archivee_a: null },
  { id: 'e', nom: 'Voisine', dossier: 'sèche', archivee_a: null },
  { id: 'f', nom: 'Libre', dossier: null, archivee_a: null }
];
const blocs = [
  { id: 'b1', dossier: 'Sèche', statut: 'termine', modifie_a: '2026-09-01T00:00:00Z' },
  { id: 'b2', dossier: 'Sèche', statut: 'en_cours', modifie_a: '2026-10-01T00:00:00Z' },
  { id: 'b3', dossier: 'Prise de masse', statut: 'en_cours', modifie_a: '2026-10-01T00:00:00Z' }
];
const plan = (n) => Routines.planRenommageDossier(routines, blocs, 'Sèche', n, NOW);

describe('planRenommageDossier', () => {
  test('toutes les routines du dossier, archivées comprises, et tous ses cycles, modifie_a à jour', () => {
    const p = plan('Recompo');
    expect(p.ok).toBe(true);
    expect(p.routines.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(p.routines.every((r) => r.champs.dossier === 'Recompo')).toBe(true);
    expect(p.actives).toBe(2);
    expect(p.blocs.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(p.blocs.every((b) => b.dossier === 'Recompo' && b.modifie_a === NOW)).toBe(true);
    expect(p.enCours).toBe(true);
  });
  test('ne touche ni les autres dossiers, ni la casse voisine, ni l’entrée', () => {
    const p = plan('Recompo');
    expect(p.routines.some((r) => ['d', 'e', 'f'].indexOf(r.id) >= 0)).toBe(false);
    expect(p.blocs.some((b) => b.id === 'b3')).toBe(false);
    expect(blocs[0].dossier).toBe('Sèche');
    expect(blocs[0].modifie_a).toBe('2026-09-01T00:00:00Z');
  });
  test('refuse vide, trop long, identique', () => {
    expect(plan('   ').raison).toBe('vide');
    expect(plan('x'.repeat(41)).raison).toBe('trop-long');
    expect(plan('x'.repeat(40)).ok).toBe(true);
    expect(plan('Sèche').raison).toBe('identique');
    expect(plan('  Sèche ').raison).toBe('identique');
  });
  test('refuse un nom déjà pris — jamais de fusion', () => {
    const p = plan('Prise de masse');
    expect(p.ok).toBe(false);
    expect(p.raison).toBe('pris');
    expect(p.message).toBe('Un dossier s\'appelle déjà « Prise de masse ».');
    expect(p.routines).toEqual([]);
    expect(p.blocs).toEqual([]);
  });
  test('un nom porté seulement par une routine archivée ou un cycle est pris aussi', () => {
    const r = [{ id: 'x', nom: 'X', dossier: 'Sèche' }, { id: 'y', nom: 'Y', dossier: 'Ancien', archivee_a: 'z' }];
    expect(Routines.planRenommageDossier(r, [], 'Sèche', 'Ancien', NOW).raison).toBe('pris');
    expect(Routines.planRenommageDossier(r, [{ id: 'q', dossier: 'Cycle' }], 'Sèche', 'Cycle', NOW).raison).toBe('pris');
  });
  test('la casse : « sèche » et « Sèche » sont deux dossiers, l’un se renomme en l’autre', () => {
    const p = Routines.planRenommageDossier(routines, blocs, 'sèche', 'Sèche', NOW);
    expect(p.raison).toBe('pris');
    const q = Routines.planRenommageDossier(routines, blocs, 'sèche', 'SÈCHE', NOW);
    expect(q.ok).toBe(true);
    expect(q.routines.map((r) => r.id)).toEqual(['e']);
  });
  test('un dossier sans routine mais avec un cycle (programme orphelin) se renomme', () => {
    const p = Routines.planRenommageDossier([], blocs, 'Sèche', 'Recompo', NOW);
    expect(p.ok).toBe(true);
    expect(p.routines).toEqual([]);
    expect(p.blocs.length).toBe(2);
  });
});

describe('phraseRenommage', () => {
  test('les phrases', () => {
    expect(Routines.phraseRenommage(5, true)).toBe('Tes 5 routines et ton cycle en cours suivent le nouveau nom.');
    expect(Routines.phraseRenommage(5, false)).toBe('Tes 5 routines suivent le nouveau nom.');
    expect(Routines.phraseRenommage(1, false)).toBe('Ta routine suit le nouveau nom.');
    expect(Routines.phraseRenommage(0, true)).toBe('Ton cycle en cours suit le nouveau nom.');
  });
});
