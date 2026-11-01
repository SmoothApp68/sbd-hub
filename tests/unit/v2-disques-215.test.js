// 215 — « Mes disques › » dans la feuille « Disques » : le même geste que « Ma salle », la barre recalculée.
require('../../v2/js/modele.js');
const Moteur = require('../../v2/js/moteur.js');
const Profil = require('../../v2/js/profil.js');

describe('215 — Mes disques depuis la feuille « Disques »', () => {
  const profil = { ma_salle: null };
  test('griser le 25 : 130 kg se charge en 20 + 20 + 15 par côté', () => {
    const champs = Profil.champsDisque(profil, 25);
    expect(champs).not.toBeNull();
    const apres = Object.assign({}, profil, champs);
    expect(Profil.disquesPresentsDuProfil(apres)).not.toContain(25);
    const d = Moteur.decomposerCharge(130, 20, Profil.disquesPresentsDuProfil(apres));
    expect(d.ok).toBe(true);
    expect(d.parCote).toEqual([20, 20, 15]);
    // avant : 130 = 20 + 25 + 10 ... la décomposition passait par le 25
    expect(Moteur.decomposerCharge(130, 20, Profil.disquesPresentsDuProfil(profil)).parCote).toContain(25);
  });
  test('le même toucher rend le disque ; un disque inconnu est refusé ; le résumé se lit du plus lourd au plus léger', () => {
    const grise = Object.assign({}, profil, Profil.champsDisque(profil, 25));
    const rendu = Object.assign({}, grise, Profil.champsDisque(grise, 25));
    expect(Profil.disquesPresentsDuProfil(rendu)).toContain(25);
    expect(Profil.champsDisque(profil, 7)).toBeNull();
    expect(Profil.resumeDisques(profil)).toMatch(/^25 · 20 · 15 · 10 · 5 · 2,5 · 1,25/);
    expect(Profil.resumeDisques(grise).startsWith('20')).toBe(true);
  });
  test('la ligne des disques porte « absence » : une puce éteinte se lit « absent »', () => {
    const l = Profil.lignesMateriel(Profil.brouillonSalle(profil))[0];
    expect(l.absence).toBe(true);
  });
});
