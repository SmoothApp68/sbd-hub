/**
 * @jest-environment jsdom
 */
//
// 272 — les trois cartes du niveau d'entraînement (rendu.js) : l'annonce de l'accueil, « Voir ce qui change », « Ton niveau » (import).
// Les phrases viennent de `Profil.annonceDeNiveau` ; ici : ce qui se pose, et ce que chaque bouton appelle.
require('../../v2/js/modele.js');
const Profil = require('../../v2/js/profil.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;

const boite = () => document.createElement('div');
const clic = (n, sel) => n.querySelector(sel).click();

describe('272 — l’annonce de l’accueil', () => {
  const a = { de: 'moins_1_an', vers: '1_a_3_ans', premiere: '2025-11-12T09:00:00.000Z', precoce: false, barres: [] };
  test('surtitre, titre, fait, ligne grise, trois gestes', () => {
    const c = boite(), appels = [];
    Rendu.rendreAnnonceDeNiveau(c, { annonce: Profil.annonceDeNiveau(a), surCompris: () => appels.push('compris'),
      surVoir: () => appels.push('voir'), surAnnuler: () => appels.push('annuler') });
    expect(c.hidden).toBe(false);
    expect(c.querySelector('.niveau-surtitre').textContent).toBe('Nouveau niveau');
    expect(c.querySelector('.niveau-titre').textContent).toBe('1 à 3 ans d’entraînement, depuis aujourd’hui.');
    expect(c.querySelector('.niveau-fait').textContent).toBe('Ta première séance notée date du 12 nov. 2025.');
    expect(c.querySelector('.niveau-gris').textContent).toBe('Le coach monte maintenant selon ta zone et ta réserve.');
    clic(c, '.niveau-compris'); clic(c, '.niveau-voir'); clic(c, '.niveau-annuler');
    expect(appels).toEqual(['compris', 'voir', 'annuler']);
  });
  test('3 à 5 → plus de 5 : ni ligne grise ni « Voir ce qui change »', () => {
    const c = boite();
    Rendu.rendreAnnonceDeNiveau(c, { annonce: Profil.annonceDeNiveau({ de: '3_a_5_ans', vers: 'plus_5_ans', premiere: '2020-01-05T09:00:00.000Z' }),
      surCompris() {}, surVoir() {}, surAnnuler() {} });
    expect(c.querySelector('.niveau-gris')).toBeNull();
    expect(c.querySelector('.niveau-voir')).toBeNull();
  });
  test('annulée : un fait remplace la carte, aucun bouton ; sans annonce : cachée', () => {
    const c = boite();
    Rendu.rendreAnnonceDeNiveau(c, { annulee: 'Entraînement : Moins d’un an, gardé.' });
    expect(c.textContent).toBe('Entraînement : Moins d’un an, gardé.');
    expect(c.querySelector('button')).toBeNull();
    Rendu.rendreAnnonceDeNiveau(c, null);
    expect(c.hidden).toBe(true);
  });
});

describe('272 — « Voir ce qui change » et « Ton niveau »', () => {
  test('le tableau Avant / Maintenant : une ligne par fait, « Tes records » sans « Avant »', () => {
    const c = boite();
    Rendu.rendreFeuilleNiveau(c, { lignes: Profil.lignesDeCeQuiChange('moins_1_an', '1_a_3_ans'), surFermer() {} });
    const lignes = c.querySelectorAll('.niveau-ligne:not(.niveau-tete)');
    expect(lignes.length).toBe(5);
    expect(lignes[0].textContent).toBe('Montée+10 % au plusSelon ta zone et ta réserve');
    expect(lignes[4].querySelector('.niveau-av').textContent).toBe('');
    expect(lignes[4].querySelector('.niveau-ap').textContent).toBe('Ne bougent pas');
  });
  test('la carte d’import : « C’est ça », « J’ai commencé avant » (les niveaux au-dessus), puis la réponse', () => {
    const carte = Profil.carteDeNiveauImport({ anciennete: '1_a_3_ans' },
      { cle: '3_a_5_ans', premiere: '2022-03-03T09:00:00.000Z' });
    const appels = [], c = boite();
    const vue = (o) => Object.assign({ carte, choixOuvert: false, reponse: null, surAccepter: () => appels.push('ok'),
      surCommenceAvant: () => appels.push('avant'), surChoisir: (k) => appels.push(k) }, o || {});
    Rendu.rendreCarteDeNiveauImport(c, vue());
    expect(c.querySelector('.niveau-titre').textContent).toBe('3 à 5 ans d’entraînement, d’après ton historique.');
    expect(c.querySelector('.niveau-fait').textContent).toBe('Ta première séance importée date du 3 mars 2022.');
    clic(c, '.niveau-cest-ca'); clic(c, '.niveau-avant');
    Rendu.rendreCarteDeNiveauImport(c, vue({ choixOuvert: true }));
    expect(Array.from(c.querySelectorAll('.niveau-choix-n')).map((b) => b.textContent)).toEqual(['Plus de 5 ans']);
    clic(c, '.niveau-choix-n');
    Rendu.rendreCarteDeNiveauImport(c, vue({ reponse: '3 à 5 ans d’entraînement.' }));
    expect(c.querySelector('button')).toBeNull();
    expect(appels).toEqual(['ok', 'avant', 'plus_5_ans']);
    Rendu.rendreCarteDeNiveauImport(c, { carte: null });
    expect(c.hidden).toBe(true);
  });
});
