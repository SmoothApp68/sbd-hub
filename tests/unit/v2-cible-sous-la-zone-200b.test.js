'use strict';
// 200b — la cible (dernière fois + 1) sous le bas de la zone : le coach dit « vers tes 6-8 » (VOIX, I26).
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const esp = (t) => t.replace(/[\u00a0\u202f]/g, ' ');
const consigne = (zone, reps, vise) => ({
  etat: 'progression', zone, palier: 130, niveau: 0, n: 3,
  ligne: { charge: 130, vise }, haut: null,
  fondement: { date: '2026-10-24T10:00:00Z', reps: [reps, reps, reps] }
});
const gris = (c) => esp(M.libellesConsigne(c, '2026-11-01T10:00:00Z').gris);

describe('200b — la phrase datée quand la cible est sous la zone', () => {
  test('sous le bas de la zone (4 reps, zone 6-8, cible 5) : « Une rep de plus, vers tes 6-8. »', () => {
    expect(gris(consigne('mix', 4, 5))).toBe('Le 24 oct. : 130 kg × 4, 4, 4. Une rep de plus, vers tes 6-8.');
  });
  test('dans la zone (5 reps, zone 6-8, cible 6) : la phrase habituelle', () => {
    expect(gris(consigne('mix', 5, 6))).toBe('Le 24 oct. : 130 kg × 5, 5, 5. Une rep de plus.');
  });
  test('zone lourd 3-5, 4 reps, cible 5 : la phrase habituelle', () => {
    expect(gris(consigne('lourd', 4, 5))).toBe('Le 24 oct. : 130 kg × 4, 4, 4. Une rep de plus.');
  });
});
