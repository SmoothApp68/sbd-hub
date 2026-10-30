// 188-1 — le RENDU de « Ta semaine et tes équilibres » (jsdom, le vrai rendu) : il lit l'analyse telle quelle, n'écrit rien,
// ne calcule rien, et sa voix passe les règles du coach. Le test de l'analyse vit dans v2-equilibres.test.js.

const fs = require('fs');
const path = require('path');
global.self = global;
const H = require('./helpers-equilibres.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;
const { Eq, construire, entree, routine } = H;

const texte = (n) => n.textContent.replace(/[ \t\n]+/g, ' ').trim();
const COMPL = { squat_barre: 4, souleve_de_terre_roumain: 2, leg_curl: 2, leg_extension: 4, hip_thrust: 2, oiseau: 1, elevations_laterales: 1, curl: 1, extension_triceps: 1 };
// Le rowing, dernier exercice de « Haut A », sauté depuis 8 semaines : une carte, ses causes et une proposition (déplacer).
function analyse(extra) {
  const R_A = routine('r-a', 'Haut A', { developpe_couche_barre: 4, tractions: 3, developpe_militaire_barre: 3, rowing_barre: 4 });
  const sem = {};
  for (let i = 0; i < 20; i++) sem[i] = [{ routine: 'r-a', gestes: [], exos: Object.assign({ developpe_couche_barre: 8, tractions: 2, developpe_militaire_barre: 2 }, COMPL, i < 8 ? { rowing_barre: 3 } : {}) }];
  return Eq.analyser(entree(construire(sem), Object.assign({ routines: [R_A] }, extra || {})));
}
function rendre(a, vue) {
  const c = document.createElement('div');
  const ecrit = [];
  Rendu.rendreEquilibres(c, Object.assign({ analyse: a, fait: null, surProposition: () => ecrit.push('proposition'), surPlusTard: () => ecrit.push('plus-tard') }, vue || {}));
  return { c, ecrit };
}

describe('188-1 — le rendu des équilibres', () => {
  test('rendre ne déclenche aucun geste : aucune proposition n’est appliquée, aucune réponse écrite', () => {
    const a = analyse();
    const avant = JSON.stringify(a);
    const { ecrit } = rendre(a);
    rendre(a);
    expect(ecrit).toEqual([]);
    expect(JSON.stringify(a)).toBe(avant);
  });
  test('la carte porte le fait, le repère du coach, « D’où ça vient » et « Pas maintenant »', () => {
    const a = analyse();
    expect(a.cartes.length).toBeGreaterThan(0);
    const { c } = rendre(a);
    const t = texte(c);
    expect(t).toMatch(/Ta semaine et tes équilibres/);
    expect(t).toMatch(/beaucoup de coachs/);
    expect(c.querySelectorAll('[data-pas-maintenant]').length).toBe(a.cartes.length);
  });
  test('un geste ne part que d’un toucher', () => {
    const a = analyse();
    const { c, ecrit } = rendre(a);
    c.querySelector('[data-pas-maintenant]').click();
    expect(ecrit).toEqual(['plus-tard']);
  });
  test('la voix du rendu : ni reproche, ni compliment, ni point d’exclamation, ni durée d’absence', () => {
    const { c } = rendre(analyse());
    const t = texte(c);
    expect(t).not.toMatch(/bravo|!|honte|tu dois|il faut|danger|blessure|retard|absent/i);
  });
  test('Juste un carnet : le rendu ne pose aucune carte parlante', () => {
    const a = analyse({ intention: 'entretien' });
    expect(a.etat).toBe('carnet');
    const { c } = rendre(a);
    expect(c.querySelectorAll('[data-pas-maintenant]').length).toBe(0);
  });
  test('la ligne de l’écran Séances : une seule, vide si rien ne parle', () => {
    const n = document.createElement('div');
    Rendu.rendreLigneEquilibre(n, { texte: 'Aucune série de tirage pour 40 de poussée.', surOuvrir: () => {} });
    expect(n.hidden).toBe(false);
    Rendu.rendreLigneEquilibre(n, null);
    expect(n.hidden).toBe(true);
  });
});
