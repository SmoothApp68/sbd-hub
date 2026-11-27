/**
 * Lot 3 (25/11/2026), changement 1 — UN SEUL ÉCRAN DE FIN (la décision 71 du 11/10/2026 est rouverte).
 *
 * Ce que ce fichier prouve :
 *   · l'écran de fin porte le récap COURT (quatre chiffres, records, ce que le coach avait visé) AVANT « Terminer », puis la
 *     ligne titre/salle/note, la question de routine seulement s'il y a un écart, « Terminer » (collé au bas), « Abandonner » ;
 *   · une séance vide garde sa feuille (137) : aucun récap ; sans `recap`, la feuille est celle d'avant ;
 *   · « Terminer » ouvre le toast « Séance enregistrée · Voir le récap », et le récap complet s'ouvre depuis lui, pas avant ;
 *   · le récap de l'écran de fin ne s'écrit nulle part (aucune pose dans la file, aucun cache), et le journal des records n'est
 *     écrit que par `terminerSeance` (58-2).
 */
const fs = require('fs');
const path = require('path');
require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

const RECAP = {
  titre: 'Haut du corps A', debut: '2026-11-21T14:27:00Z', fin: '2026-11-21T15:39:00Z', duree_min: 72, series: 24,
  volume_kg: 13400, volume_texte: '13,4 t', exercices: 7, phraseVolume: '13,4 t soulevées : à peu près un ATR 72 à vide.',
  muscles: { premiers: [{ libelle: 'Pectoraux', series: 8 }], autres: null }, cardio: [],
  records: [{ nom: 'Développé couché', mesure: '100 kg × 5', phrase: ['Record à 5 reps : 100 kg.', 'Avant : 97,5 kg, le 3 nov.'] }],
  pointDeDepart: null,
  note: null
};
const rendre = (vue) => {
  const cible = document.createElement('div');
  const appels = [];
  Rendu().rendreFeuilleFin(cible, Object.assign({ compte: { travail: 24 }, titre: 'Haut du corps A', salle: 'Basic-Fit Colmar', note: '',
    salleMax: 60, recap: RECAP, jeu: null, surTitre() {}, surSalle() {}, surNoteSeance() {}, surModifier() {},
    surTerminer: () => appels.push('terminer'), surAbandonner: () => appels.push('abandonner') }, vue));
  return { cible, appels };
};
const classes = (c) => Array.from(c.children).map((n) => n.className.split(' ')[0]);

describe('lot 3 — l\'écran de fin porte le récap court avant « Terminer »', () => {
  test('l\'ordre : titre, chiffres, records, « Détail », ligne, « Terminer », « Abandonner »', () => {
    const { cible } = rendre({});
    const c = classes(cible);
    const ordre = ['feuille-t', 'recap-tuiles', 'recap-groupe', 'recap-rec', 'recap-plus', 'recap-detail',
      'resume-fin', 'fin-pied', 'discret'];
    expect(c).toEqual(ordre);
    expect(cible.querySelectorAll('.recap-tuile')).toHaveLength(4);
    expect(cible.querySelector('.recap-pari')).toBeNull();
  });
  test('« Terminer » est dans le pied collé ; c\'est le seul bouton principal ; « Abandonner et tout effacer » reste à part', () => {
    const { cible, appels } = rendre({});
    expect(cible.querySelectorAll('.principal')).toHaveLength(1);
    const b = cible.querySelector('.fin-pied .principal');
    expect(b.textContent).toBe('Terminer');
    b.click();
    Array.from(cible.querySelectorAll('button')).filter((x) => x.textContent === 'Abandonner et tout effacer')[0].click();
    expect(appels).toEqual(['terminer', 'abandonner']);
    expect(cible.querySelector('.fin-pied').textContent).toBe('Terminer');
  });
  test('rien de l\'après : ni « Fermer », ni « Voir la séance », ni « Partager » avant d\'avoir terminé', () => {
    const { cible } = rendre({});
    expect(cible.querySelectorAll('.recap-fermer, .recap-voir, .recap-partager')).toHaveLength(0);
    expect(Array.from(cible.querySelectorAll('button')).map((b) => b.textContent))
      .toEqual(['Détail muscles ›'.replace('Détail ', 'Détail'), 'Modifier', 'Terminer', 'Abandonner et tout effacer'].map((x, i) => i === 0 ? cible.querySelector('.recap-plus').textContent : x));
  });
  test('la question de routine : seulement avec un écart, entre la ligne et « Terminer »', () => {
    expect(rendre({}).cible.querySelector('.question-routine')).toBeNull();
    const { cible } = rendre({ routine: 'Haut du corps A', ecarts: [{ type: 'note' }], majRoutine: false, surMajRoutine() {} });
    const c = classes(cible);
    expect(c.indexOf('resume-fin')).toBeLessThan(c.indexOf('question-routine'));
    expect(c.indexOf('question-routine')).toBeLessThan(c.indexOf('fin-pied'));
  });
  test('sans `recap` : la feuille d\'avant ; vide (137) : aucun récap, aucun pied', () => {
    expect(rendre({ recap: null }).cible.querySelector('.recap-tuiles')).toBeNull();
    const v = rendre({ vide: true, remplies: 0 });
    expect(v.cible.querySelector('.recap-tuiles, .fin-pied, .resume-fin')).toBeNull();
    expect(Array.from(v.cible.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Abandonner', 'Continuer la séance']);
  });
});

describe('lot 3 — le parcours dans app.js (lu au source)', () => {
  const corps = (nom) => {
    const i = APP.indexOf('function ' + nom + '(');
    expect(i).toBeGreaterThan(0);
    const j = APP.indexOf('\n  }\n', i);
    return APP.slice(i, j);
  };
  test('« Terminer » ne rouvre plus le récap : il revient à la semaine et montre le toast ; `ouvrirRecap` n\'a qu\'un appelant', () => {
    const t = corps('terminerSeance');
    expect(t).not.toMatch(/ouvrirRecap\(/);
    expect(t).not.toMatch(/lancerNotesIA\(/);
    expect(t).toMatch(/montrerToastRecap\(finie, jeuDuRecap\)/);
    expect(t).toMatch(/allerA\(Routeur\.RACINE/);
    expect(APP.split('ouvrirRecap(').length - 1).toBe(2);      // la déclaration et `voirLeRecap`
    expect(corps('voirLeRecap')).toMatch(/ouvrirRecap\(t\.seance, t\.jeu\)[\s\S]*lancerNotesIA\(t\.seance\)/);
  });
  test('le toast dit « Séance enregistrée » et « Voir le récap », et s\'efface en quittant la semaine', () => {
    expect(corps('rendreToastRecap')).toMatch(/texte: 'Séance enregistrée', libelle: 'Voir le récap'/);
    expect(APP).toMatch(/if \(nom !== 'liste' && toastRecap\) cacherToastRecap\(\)/);
  });
  test('⚠️ le récap de l\'écran de fin n\'écrit rien ; le journal des records n\'est écrit que par `terminerSeance` (58-2)', () => {
    const r = corps('recapDeFin');
    expect(r).not.toMatch(/poser|ecrire|Attente|Cache\.|sauverSeance|adopterLocalement/);
    expect(APP.split('ecrireJournalDeSeance(seance').length - 1).toBe(1);
    expect(corps('terminerSeance')).toMatch(/await ecrireJournalDeSeance\(seance, null\)/);
    expect(corps('rendreFeuilleFin')).not.toMatch(/ecrireJournalDeSeance|poserJournal/);
  });
  test('la salle proposée ne s\'écrit qu\'à « Terminer »', () => {
    expect(corps('rendreFeuilleFin')).not.toMatch(/avecSalleDeFin/);
    expect(corps('terminerSeance')).toMatch(/Seance\.avecSalleDeFin\(seance, salleFin\.proposee, salleFin\.effacee\)/);
  });
});
