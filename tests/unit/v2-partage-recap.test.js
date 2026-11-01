/** 214 — le texte partagé d'un récap : fonction pure, sans autre personne, sans coach, sans lien. */
require('../../v2/js/modele.js');
const M = globalThis.THModele || (typeof window !== 'undefined' && window.THModele) || require('../../v2/js/modele.js');
const T = (M.texteDePartage ? M : globalThis.THModele).texteDePartage;

test('titre, durée, séries, tonnage, records', () => {
  const t = T({ titre: 'Push A', duree_min: 63, series: 12, volume_texte: '10,1 t',
    records: [{ nom: 'Développé couché', mesure: '130 kg × 5', phrase: ['Ton meilleur.'] }], paris: { phrase: 'coach' } });
  expect(t).toBe('Push A · 1 h 03\n12 séries de travail · 10,1 t\n1 record :\n• Développé couché : 130 kg × 5');
  expect(t).not.toMatch(/coach|Ton meilleur|http/);
});
test('sans record, sans durée, une série', () => {
  expect(T({ titre: null, duree_min: null, series: 1, volume_texte: '0,1 t', records: [] })).toBe('Séance\n1 série de travail · 0,1 t');
  expect(T(null)).toBe('');
});
