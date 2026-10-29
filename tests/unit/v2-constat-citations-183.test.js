/** @jest-environment node */
//
// 183 — I26 « citation_non_ecrite » : le constat ne déclare que ce qu'il écrit (MOTEUR §20 bis).
// Le compte « 2 » de `phraseExtension` (`regle('series')`) se calculait en tête de fonction : sous le bas de la zone, ou sur
// toutes les séries, la phrase ne l'écrit pas, et la garde (I26) le lisait comme un chiffre déclaré sans être dit.

require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const Mo = require('../../v2/js/modele.js');
const M = require('../../v2/js/moteur.js');

const sr = (kg, reps) => ({ charge_kg: kg, reps: reps, role: 'travail', rpe: null, ressenti: null });
const esp = (t) => String(t || '').replace(/[  ]/g, ' ');

function constat(apres) {
  const cAvant = { etat: 'etend', zone: 'hypertrophie', palier: 54, niveau: 7, ligne: { charge: 54, vise: 8 }, haut: { charge: 56, vise: 9, k: 2 }, n: 3,
    fondement: { seance: [sr(54, 8), sr(54, 8), sr(56, 7)], reps: [8, 8, 7], date: '2026-10-01T10:00:00Z' } };
  return Mo.capturer(function () { return M.constatDe(cAvant, apres, 'franc', 56, '2026-10-08T10:00:00Z'); });
}
const apres = (reps) => ({ etat: 'progression', zone: 'hypertrophie', palier: 54, niveau: 6, ligne: { charge: 54, vise: 6 }, haut: null, n: 3,
  fondement: { seance: [sr(54, 8)].concat(reps.map((r) => sr(56, r))), reps: [8].concat(reps), date: '2026-10-08T10:00:00Z' } });

describe('183 — I26 : une citation déclarée est une citation écrite', () => {
  test('DISCRIMINANT — sous le bas de la zone, la phrase ne dit pas le compte : « 2 » n’est pas déclaré', () => {
    const c = constat(apres([6, 5]));
    expect(esp(c.texte.verdict)).toBe('56 kg × 6, 5 : pas encore dans ta zone.');
    const regles = c.citations.filter((q) => q.nature === 'regle' && q.objet.regle === 'series');
    expect(regles).toEqual([]);
  });
  test('TÉMOIN — dans la zone, le compte est écrit ET déclaré (rien ne change dans la phrase)', () => {
    const c = constat(apres([9, 9]));
    expect(esp(c.texte.verdict)).toMatch(/ta nouvelle charge tient sur 2 séries/);
    expect(c.citations.filter((q) => q.nature === 'regle' && q.objet.regle === 'series').length).toBe(1);
  });
});
