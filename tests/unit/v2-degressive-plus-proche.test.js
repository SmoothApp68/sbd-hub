/** @jest-environment node */
//
// 245 (C2, MOTEUR §9.15.3, invariant I132) — hors barre, la dégressive est la charge DISPONIBLE LA PLUS PROCHE de la baisse
// visée (−22,5 % à la première, −20 % à la seconde), dans la fenêtre de la barre (−15 % à −30 %), vers le bas à égalité,
// toujours sous la dernière série. Rien dans la fenêtre : « Trop léger pour une dégressive. ».

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

const deg = (o) => M.degressiveDe(Object.assign({ equipement: 'haltere', reps_travail: 10 }, o));

describe('245 — la charge disponible la plus proche', () => {
  test('2 × 10 = 20 kg, cran de la paire 2 : 16 (−20 %), pas 14 (−30 %)', () => {
    expect(deg({ derniere_serie: 20, cran: 2 }).charge).toBe(16);
  });
  test('2 × 32 = 64 kg, cran 4 : cible 49,6 → 48', () => {
    expect(deg({ derniere_serie: 64, cran: 4 }).charge).toBe(48);
  });
  test('poulie au cran de 5 : 50 → 40', () => {
    expect(deg({ equipement: 'poulie', derniere_serie: 50, cran: 5 }).charge).toBe(40);
  });
  test('seconde baisse : 16 → cible 12,8 → 12 (−25 %, dans la fenêtre)', () => {
    expect(deg({ derniere_serie: 16, cran: 2, rang: 2, reps_premiere: 6 }).charge).toBe(12);
  });
  test('une paire de 4 kg sans paire de 3 : « Trop léger pour une dégressive. »', () => {
    const d = deg({ derniere_serie: 4, cran: 2 });
    expect(d.charge).toBeNull();
    expect(d.phrase).toBe('Trop léger pour une dégressive.');
  });
  test('à égalité, vers le bas ; jamais au niveau de la dernière série', () => {
    const r = M.degressiveLaPlusProche(100, 0.225, [70, 85, 100], null);
    expect(r.charge).toBe(70);   // 70 et 85 à égale distance de 77,5 : le bas
    expect(M.degressiveLaPlusProche(100, 0.225, [77, 78], null).charge).toBe(77);   // 77,5 pile entre les deux → le bas
  });
  test('la salle déclarée passe par le même choix (une barre fixe)', () => {
    const salle = { materiel: 'barre_ez', charges: [10, 15, 20, 25, 30] };
    expect(M.degressiveDe({ equipement: 'barre', derniere_serie: 30, reps_travail: 10, salle, cran: 2.5 }).charge).toBe(25);   // cible 23,25 → 25 (−16,7 %) plutôt que 20 (−33 %)
  });
  test('I132 : aucune charge de la fenêtre n\'est plus proche que celle choisie', () => {
    for (const [der, cran] of [[20, 2], [64, 4], [50, 5], [37.5, 2.5], [100, 1.25], [14, 2], [90, 10]]) {
      const d = deg({ derniere_serie: der, cran });
      if (d.charge === null) continue;
      const dist = Math.abs(d.charge - d.choix.cible);
      d.choix.dans.forEach((c) => expect(Math.abs(c - d.choix.cible)).toBeGreaterThanOrEqual(dist - 1e-9));
      expect(d.charge).toBeLessThan(der);
    }
  });
});
