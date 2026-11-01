// 205 — LA FEUILLE « DISQUES » (maquette « Calculateur de disques v1 »), son entrée par la grande charge et par le ⋯.
//
// Du pur affichage : le calcul est `Moteur.decomposerCharge` (testé dans v2-ma-salle-190) ; ici on prouve ce que l’écran montre et touche.

const fs = require('fs');
const path = require('path');

require('../../v2/js/modele.js');
const Moteur = require('../../v2/js/moteur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
require('../../v2/js/rendu.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const { progTravail } = require('./aide-routine-programmee.js');

const Rendu = () => window.THRendu;

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'ec', nom: 'Écarté Poulie', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);
let graine = 0;
const uuid = () => 'set-' + (++graine);

function seanceDe(lignes) {
  return Seance.creer({
    id: 'S', userId: 'u', idSerie: uuid,
    routine: { id: 'r', exercices: lignes.map(([slug, series, groupe], i) => ({
      id: 're' + i, exercise_slug: slug, series: progTravail(series), reps_visees: null, repos_cible_s: null,
      groupe_superset: groupe === undefined ? null : groupe })) }
  });
}

function rendre(seance, extra) {
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, seance, Object.assign({
    blocs: Modele.blocsDeSeance(seance, CATALOGUE),
    tourAtteint: (g) => Seance.tourAtteint(seance, g),
    exercice: (slug) => INDEX[slug],
    precedent: () => null,
    fantome: (i, j) => Seance.fantome(seance, i, j, null),
    surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {},
    surMenuBloc: () => {}, surMenuExercice: () => {}, surNote: () => {}, surRepos: () => {}, surPourquoi: () => {},
    libelles: () => ({ jaune: ['100 kg × 7'], gris: 'Le 29 oct. : 100 kg × 6. Une rep de plus.' }),
    etiquette: () => '6-8 reps'
  }, extra || {}));
  return cible;
}


const vueDisques = (charge, extra) => {
  const presents = Moteur.disquesPresentsDe({});
  const dec = (kg) => Moteur.decomposerCharge(kg, 20, presents);
  return Object.assign({
    nom: 'Squat', charge, barre: 20, decomposition: dec(charge),
    charges: [20, 60, 130, 115].map((c) => ({ charge: c, libelle: c === 115 ? 'recul' : '', decomposition: dec(c) })),
    phraseIntrouvable: 'Je ne trouve pas ' + Modele.nombreSigne(charge) + ' kg avec tes disques et une barre de 20 kg.',
    choixBarre: false, barresProposees: Moteur.BARRES_PROPOSEES, surChoixBarre: () => {}, surBarre: () => {}, surCharge: () => {}
  }, extra || {});
};

describe('205 — la feuille « Disques »', () => {
  test('130 kg : 25 + 25 + 5, la barre dessinée avec le chiffre sur chaque disque, la liste du jour avec la charge touchée en surbrillance', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleDisques(c, vueDisques(130));
    expect(c.querySelector('.dq-charge').textContent).toBe('130 kg');
    expect(c.querySelector('.dq-texte').textContent).toBe('25 + 25 + 5');
    expect([...c.querySelectorAll('.dq-disque')].map((d) => d.textContent)).toEqual(['25', '25', '5']);
    expect(c.querySelector('.dq-disque').style.background).toBe('rgb(229, 72, 77)');   // le rouge de compétition
    expect([...c.querySelectorAll('.dq-item')].map((l) => l.textContent)).toEqual([
      '20barre vide', '6020', '13025 + 25 + 5', '11525 + 20 + 2,5 · recul']);
    expect(c.querySelector('.dq-item.act b').textContent).toBe('130');
    expect(c.querySelector('.dq-barre-choix').textContent).toBe('Barre20 kg ›');
  });

  test('101,3 kg : la phrase de la maquette, aucun disque dessiné, jamais un arrondi', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleDisques(c, vueDisques(101.3));
    expect(c.querySelector('.dq-introuvable').textContent).toBe('Je ne trouve pas 101,3 kg avec tes disques et une barre de 20 kg.');
    expect(c.querySelectorAll('.dq-disque').length).toBe(0);
  });

  test('« Barre 20 kg › » ouvre les poids de barre ; un toucher choisit ; un toucher sur une charge de la liste la sélectionne', () => {
    const c = document.createElement('div');
    const surBarre = jest.fn(), surCharge = jest.fn(), surChoixBarre = jest.fn();
    Rendu().rendreFeuilleDisques(c, vueDisques(130, { choixBarre: true, surBarre, surCharge, surChoixBarre }));
    expect([...c.querySelectorAll('.dq-barres .q-puce')].map((b) => b.textContent)).toEqual(['25 kg', '20 kg', '15 kg', '10 kg']);
    c.querySelectorAll('.dq-barres .q-puce')[2].click();
    expect(surBarre).toHaveBeenCalledWith(15);
    c.querySelectorAll('.dq-item')[1].click();
    expect(surCharge).toHaveBeenCalledWith(60);
    c.querySelector('.dq-barre-choix').click();
    expect(surChoixBarre).toHaveBeenCalled();
  });
});

describe('205 — l’entrée : la grande charge et le ⋯', () => {
  test('la grande charge d’un exercice à la barre se touche (sans rouvrir « Pourquoi ») ; sans barre, elle ne se touche pas', () => {
    const seance = seanceDe([['dc', 3]]);
    const surDisques = jest.fn(), surPourquoi = jest.fn();
    const c = rendre(seance, { surDisques, surPourquoi, disquesPossibles: () => true });
    const charge = c.querySelector('.c-charge-disques');
    expect(charge.textContent).toBe('100');
    charge.click();
    expect(surDisques).toHaveBeenCalledWith(0, 100);
    expect(surPourquoi).not.toHaveBeenCalled();
    const sans = rendre(seance, { surDisques, disquesPossibles: () => false });
    expect(sans.querySelector('.c-charge-disques')).toBeNull();
  });

  test('« Disques » dans le ⋯ de l’exercice et du bloc, seulement quand le geste existe', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleExercice(c, { nom: 'Squat', surRemplacer: () => {}, surDegrouper: () => {}, surDisques: () => {} });
    expect([...c.querySelectorAll('.menu-disques')].map((b) => b.textContent)).toEqual(['Disques']);
    const d = document.createElement('div');
    Rendu().rendreFeuilleBloc(d, { superset: false, noms: 'Squat', peutGrouper: false, surRemplacer: () => {}, surDisques: () => {},
      surGrouper: () => {}, surAjouterApres: () => {}, surSupprimer: () => {}, surMonter: () => {}, surDescendre: () => {} });
    expect(d.querySelectorAll('.menu-disques').length).toBe(1);
    const e = document.createElement('div');
    Rendu().rendreFeuilleBloc(e, { superset: false, noms: 'Curl', peutGrouper: false, surRemplacer: () => {}, surDisques: null,
      surGrouper: () => {}, surAjouterApres: () => {}, surSupprimer: () => {} });
    expect(e.querySelectorAll('.menu-disques').length).toBe(0);
  });
});
