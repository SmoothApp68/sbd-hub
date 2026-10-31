/** @jest-environment node */
//
// 193-1 (8) — UN TEST RATÉ À UNE SEULE GROSSE SÉRIE (MOTEUR §9.28, option A). Avec des reculs, une grosse série seule, plus lourde que le
// palier d'avant et sous le bas de la zone, rend la séance NEUTRE : palier inchangé, même test reproposé. Sans recul, rien ne change.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');

let n = 0;
const b = (kg, r, type) => ({ id: 'h' + (++n), rang: n, charge_kg: kg, reps: r, type_serie: type || 'travail', exercise_slug: 'sq' });
const OPT = { reglage: 'franc', equipement: 'barre', correction: null };
const reculs = () => [b(135, 6, 'recul'), b(135, 6, 'recul'), b(135, 6, 'recul')];
const hist = (jours) => M.contratDe(jours.map((series, i) => ({ seance: { debut: '2026-10-0' + (i + 1) + 'T10:00:00Z' }, series: series })),
  null, 'charge_reps', OPT);
const suivante = (jours) => M.consignePour(hist(jours), '2026-10-04', OPT);

describe('193-1 — le test raté à une seule grosse série', () => {
  const base = [b(150, 4)].concat(reculs());
  test('150 × 5 (test proposé : 152,5 × 3), puis 152,5 × 2 (+ reculs) : le palier reste 150, le même test est reproposé', () => {
    const c = suivante([[b(150, 5)].concat(reculs()), [b(152.5, 2)].concat(reculs())]);
    expect(c.palier).toBe(150);
    expect(c.etat).toBe('test_propose');
    expect(c.haut.charge).toBe(152.5);
    expect(c.haut.k).toBe(1);
  });
  test('150 × 4, puis 152,5 × 2 (+ reculs) : le palier reste 150, la séance n’a pas de palier', () => {
    const c = suivante([base, [b(152.5, 2)].concat(reculs())]);
    expect(c.palier).toBe(150);
    expect(c.niveau).toBe(4);
  });
  test('152,5 × 3 (+ reculs) : nouveau palier', () => {
    const c = suivante([base, [b(152.5, 3)].concat(reculs())]);
    expect(c.palier).toBe(152.5);
  });
  test('sans recul, une série unique plus lourde et sous la zone garde son comportement d’avant', () => {
    const avec = suivante([[b(150, 4)], [b(152.5, 2)]]);
    expect(avec.palier).toBe(152.5);
  });
  test('une grosse série unique plus LÉGÈRE que le palier d’avant n’est pas un test raté', () => {
    const c = suivante([base, [b(147.5, 2)].concat(reculs())]);
    expect(c.palier).not.toBe(150);
  });
});
