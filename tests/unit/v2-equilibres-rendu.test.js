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

  // 188-2 — les cartes des jours, du temps, de la fréquence et de l'ordre : le même rendu, rien d'écrit, la voix du coach.
  function carteFabriquee(extra) {
    return Object.assign({
      cle: 'jours', famille: 'jours', kind: 'jours', titre: 'Ta semaine prévue et ta semaine réelle', fait: 'Ton programme est prévu pour 4 jours. Tes 8 dernières semaines d’entraînement en comptent 2 en moyenne.',
      repere: 'Les semaines sans aucune séance ne comptent pas.', causes: [{ texte: 'Un programme en 2 jours répartirait tout sur les jours que tu fais vraiment.', proposition: null }],
      propositions: [{ type: 'refaire_jours', cle: 'refaire_jours|2', libelle: 'Refaire mon programme sur 2 jours', jours: 2, refait: true }], libelleRefus: 'Garder 4 jours'
    }, extra || {});
  }
  test('188-2 — une carte des jours : sa proposition, son refus « Garder 4 jours », aucun geste au rendu', () => {
    const a = { etat: 'cartes', cartes: [carteFabriquee()], constats: [], calmes: [], ligne: null };
    const { c, ecrit } = rendre(a);
    expect(ecrit).toEqual([]);
    const t = texte(c);
    expect(t).toMatch(/Refaire mon programme sur 2 jours/);
    expect(t).toMatch(/Garder 4 jours/);
    expect(t).not.toMatch(/Pas maintenant/);
    c.querySelector('[data-pas-maintenant]').click();
    expect(ecrit).toEqual(['plus-tard']);
  });
  test('188-2 — une carte du temps : les deux repères, la durée, aucun pourcentage', () => {
    const k = carteFabriquee({ cle: 'temps', famille: 'temps', kind: 'temps', fait: 'Ta durée est réglée sur 90 min. Depuis 8 semaines, 12 de tes 16 séances ont été écourtées.',
      reperes: ['70 min : la durée réelle de tes séances écourtées.', 'Une séance longue ne déclenche rien.'],
      propositions: [{ type: 'duree', cle: 'duree|70', libelle: 'Régler mes séances sur 70 min', minutes: 70 }], libelleRefus: 'Garder 90 min' });
    const { c } = rendre({ etat: 'cartes', cartes: [k], constats: [], calmes: [], ligne: null });
    const t = texte(c);
    expect(t).toMatch(/Régler mes séances sur 70 min/);
    expect(t).toMatch(/Une séance longue ne déclenche rien/);
    expect(t).toMatch(/Garder 90 min/);
    expect(t).not.toMatch(/%|stimulus/);
  });
  test('188-2 — la suite d’un fait : un bouton, pas d’écriture au rendu', () => {
    const a = { etat: 'cartes', cartes: [], constats: [], calmes: [], ligne: null };
    const { c, ecrit } = rendre(a, { fait: { texte: 'Fait : 70 min.', suite: { libelle: 'Refaire mon programme pour 70 min' } } });
    expect(texte(c)).toMatch(/Refaire mon programme pour 70 min/);
    expect(ecrit).toEqual([]);
  });
});
