// 57-1 — UN EXERCICE DU BILAN OUVRE SA PAGE (ECRAN §7 bis.14, §7 quater).
//
// Au test sur l'appareil de #371, toucher un exercice « le plus fait » dans le
// bilan du mois ne menait nulle part. Il ouvre maintenant sa page, par la même
// porte que partout ailleurs : le bouton `nom-exo lien` et `surExercice(slug)`.
//
// ⚠️ DISCRIMINANT : on touche le DEUXIÈME exercice de la liste, et on attend SON
// identifiant — pas le premier, pas le nom affiché. Un lien qui ouvrirait
// toujours le premier, ou qui passerait le nom, échoue ici.
//
// Environnement jsdom (pas de docblock `node`) : `rendu.js` construit du DOM.

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

function vueDuMois(surExercice) {
  return {
    titre: 'Septembre 2026',
    bilan: { seances: 3, series: 30, jours: [2, 9, 16] },
    records: [],
    temps: null,
    volume: 12000,
    barres: [{ libelle: 'juillet', series: 20, courant: false }, { libelle: 'août', series: 25, courant: false },
             { libelle: 'septembre', series: 30, courant: true }],
    premierJour: new Date(2026, 8, 1),
    muscles: [],
    moisAvant: 'août',
    exercices: [{ slug: 'squat_barre', nom: 'Squat (Barre)', series: 12 },
                { slug: 'developpe_couche_barre', nom: 'Développé Couché (Barre)', series: 9 }],
    paris: null,
    surPrecedent: function () {},
    surSuivant: null,
    surRecords: function () {},
    surSeance: function () {},
    surExercice: surExercice
  };
}

describe('57-1 — le bilan du mois : un exercice « le plus fait » ouvre sa page', () => {
  test('⚠️ DISCRIMINANT — toucher le deuxième exercice ouvre la page de CELUI-LÀ, par son identifiant', () => {
    const cible = document.createElement('div');
    const ouverts = [];
    Rendu().rendreBilanMois(cible, vueDuMois((slug) => ouverts.push(slug)));
    const liens = Array.from(cible.querySelectorAll('.carte-mois .ligne-mois button.nom-exo.lien'));
    expect(liens.map((b) => b.textContent)).toEqual(['Squat (Barre)', 'Développé Couché (Barre)']);
    liens[1].click();
    expect(ouverts).toEqual(['developpe_couche_barre']);
    liens[0].click();
    expect(ouverts).toEqual(['developpe_couche_barre', 'squat_barre']);
  });

  test('le même bouton que le nom d’un exercice en séance, et le même texte qu’avant', () => {
    const cible = document.createElement('div');
    Rendu().rendreBilanMois(cible, vueDuMois(() => {}));
    const ligne = Array.from(cible.querySelectorAll('.ligne-mois'))
      .filter((l) => /Squat/.test(l.textContent))[0];
    expect(ligne.textContent).toBe('Squat (Barre)12 séries');
    const b = ligne.querySelector('button');
    expect(b.className).toBe('nom-exo lien');
    expect(b.type).toBe('button');
  });

  test('sans porte (`surExercice` absent), le nom reste du texte, sans bouton', () => {
    const cible = document.createElement('div');
    Rendu().rendreBilanMois(cible, vueDuMois(undefined));
    expect(cible.querySelectorAll('.ligne-mois button').length).toBe(0);
    expect(cible.textContent).toMatch(/Squat \(Barre\)12 séries/);
  });
});
