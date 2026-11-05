/** @jest-environment node */
//
// 245 (A12, MOTEUR §4.1 et §9.17, invariant I131) — sur un exercice ASSISTÉ (`exercises.charge = 'assistance'`), la règle des
// 75 % ne classe aucune série : une aide se note en négatif (« −30 kg » est plus facile que « −20 kg »), le seuil relatif
// compare des charges et passait la série de travail elle-même en `chauffe_probable`. Seules les étiquettes font une chauffe.

require('../../v2/js/modele.js');
const P = require('../../v2/js/palier.js');

const serie = (charge, i, type) => ({ charge_kg: charge, reps: 6, type_serie: type || 'travail', rang: i + 1, id: i + 1 });
const suite = (charges, types) => charges.map((c, i) => serie(c, i, types && types[i]));
const roles = (charges, charge, types) => P.analyser(suite(charges, types), null, { mesure: 'charge_reps', charge: charge })
  .series.map((d) => d.role);

describe('245 — A12 : une aide ne classe aucune chauffe probable', () => {
  test('sans charge répétée : toutes les séries sont du travail (le témoin barre classique les classait en chauffe)', () => {
    expect(roles([-30, -25, -20], 'assistance')).toEqual(['travail', 'travail', 'travail']);
    expect(roles([-30, -25, -20], null)).toEqual(['chauffe_probable', 'chauffe_probable', 'chauffe_probable']);
  });

  test('une série moins aidée avant le palier n\'est pas une chauffe', () => {
    const r = P.analyser(suite([-20, -30, -30, -30]), null, { mesure: 'charge_reps', charge: 'assistance' });
    expect(r.palier).toBe(-30);
    expect(r.series.map((d) => d.role)).not.toContain('chauffe_probable');
  });

  test('tractions assistées −30, −30, −30, −25 : le palier est −30', () => {
    const r = P.analyser(suite([-30, -30, -30, -25]), null, { mesure: 'charge_reps', charge: 'assistance' });
    expect(r.palier).toBe(-30);
    expect(r.series.map((d) => d.role)).not.toContain('chauffe_probable');
  });

  test('l\'étiquette « échauffement » fait toujours une chauffe sur une aide', () => {
    const r = roles([-40, -30, -30, -30], 'assistance', [P.CHAUFFE]);
    expect(r[0]).toBe('chauffe');
    expect(r).not.toContain('chauffe_probable');
  });

  test('témoin : la barre classique garde la règle des 75 %', () => {
    expect(roles([40, 60, 100, 100, 100], null)).toEqual(['chauffe_probable', 'chauffe_probable', 'travail', 'travail', 'travail']);
  });

  test('I131 : verifierI131 est vide sur une aide, y compris sans charge répétée', () => {
    [[-30, -25, -20], [-20, -30, -30, -30], [-30, -30, -30, -25]].forEach((c) => {
      expect(P.verifierI131(suite(c), null, { mesure: 'charge_reps' })).toEqual([]);
    });
  });
});
