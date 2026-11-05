/** @jest-environment node */
//
// 245 — AUX HALTÈRES, LA CHARGE EST LA PAIRE (les deux ensemble) : une notion (`Modele.chargeEstLaPaire`), ses lecteurs.

global.self = global;
const M = require('../../v2/js/modele.js');
const Mo = require('../../v2/js/moteur.js');

describe('245 — la paire d\'haltères', () => {
  test('chargeEstLaPaire : haltère oui, barre non', () => {
    expect(M.chargeEstLaPaire({ equipement: 'haltere' })).toBe(true);
    expect(M.chargeEstLaPaire({ equipement: 'barre' })).toBe(false);
    expect(M.chargeEstLaPaire(null)).toBe(false);
  });
  test('l\'aide « kg, les deux haltères » vit dans la grille d\'un exercice aux haltères, jamais sur une barre', () => {
    const h = M.grilleDe({ slug: 'curl_halteres', equipement: 'haltere', mesure: 'charge_reps' }, false);
    expect(h.aide).toBe('kg, les deux haltères');
    expect(M.grilleDe({ slug: 'squat_barre', equipement: 'barre', mesure: 'charge_reps' }, false).aide).toBeUndefined();
  });
  test('D-H5 : sans pas, la baisse après un raté aux haltères tombe sur la paire (cran de 2), jamais sur un cran de 1 kg', () => {
    const d = Mo.reactionAuRate({ niveau: 'serie', role: 'travail', charge: 40, reps: 6, vise: 10, bas: 8, haut: 12, rang: 1, derniere: false,
      reglage: 'normal', objectif: 'les_deux', barre: false, materiel: 'haltere', chauffeValidee: true, reposReel: 120, reposCible: 120 });
    expect(d.charge.action).toBe('baisse');
    expect(d.charge.kg % 2).toBe(0);
  });
});
