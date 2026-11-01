//
// 173 (refonte « Vivant », lot 4) — le Profil rangé par fréquence : quatre groupes dans l'ordre (Mon coach, Mon programme, Moi,
// Mon compte), puis, en bas comme avant, mes exercices et mes données. Mêmes lignes qu'avant (liste comparée), « Objectif » devenu
// « But d’entraînement ». Environnement jsdom ; l'écran est rejoué par l'aide `profilEcran`, le rendu est le vrai.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/rendu.js');
const { profilEcran } = require('./aide-profil-ecran.js');

const PROFIL = {
  id: 'u1', intention: 'progresser', rythme_progression: 'franc', questionnaire_fait_le: '2026-10-07T10:00:00.000Z',
  zones_a_menager: ['dos'], exercices_ecartes: ['x'], username: 'aurel', bio: 'b', taille_cm: 180, objectif: 'muscle'
};

// Les lignes du Profil AVANT 173 (liste relevée sur l'écran de main, dans l'ordre de l'écran), « Objectif » devenu « But d’entraînement » ; 190 : + « Ma salle ».
const LIGNES_D_AVANT = [
  'Matériel', 'Ma salle', 'Zone à ménager', 'Exercices écartés', 'Exporter mes données', 'Refaire mon programme', 'Zones raides',   // 190 : « Ma salle » toujours là
  'But d’entraînement', 'Priorités', 'Entraînement régulier', 'Tous mes exercices', 'Importer depuis Hevy',
  'Poids', 'Taille', 'Date de naissance', 'Sexe', 'Séances par semaine', 'Durée d’une séance', 'Ton temps',
  'Pseudo', 'Bio', 'E-mail de connexion', 'Mot de passe', 'Activer le jeu',
  'Les mots du coach'   // 201
];

function rendu() {
  const e = profilEcran(PROFIL);
  const cible = document.createElement('div');
  window.THRendu.rendreProfil(cible, e.vue);
  return { e, cible };
}

describe('le Profil rangé par fréquence (173)', () => {
  test('quatre groupes, dans l\'ordre, avant mes exercices et mes données', () => {
    const { cible } = rendu();
    const ordre = Array.from(cible.children).filter((n) => n.classList.contains('p-grp') || n.classList.contains('p-sect'))
      .map((n) => n.textContent);
    const groupes = Array.from(cible.querySelectorAll('.p-grp')).map((n) => n.textContent);
    expect(groupes).toEqual(['Mon coach', 'Mon programme', 'Moi', 'Mon compte']);
    expect(ordre.indexOf('Mon coach')).toBeLessThan(ordre.indexOf('CE QUE JE FAIS'));
    expect(ordre.indexOf('Mon compte')).toBeLessThan(ordre.indexOf('MES EXERCICES'));
    expect(ordre.indexOf('MES EXERCICES') + 1).toBe(ordre.indexOf('MES DONNÉES'));
    // Les sections de chaque groupe.
    const apres = (g) => { const i = ordre.indexOf(g); const f = ordre.slice(i + 1); const j = f.findIndex((t) => groupes.concat(['MES EXERCICES']).indexOf(t) >= 0); return f.slice(0, j < 0 ? f.length : j); };
    expect(apres('Mon coach')).toEqual(['POURQUOI', 'TON RYTHME', 'TON POIDS', 'TA PHASE', 'TON BUT', 'TA SEMAINE', 'LES MOTS DU COACH']);   // 201 : + les mots du coach
    expect(apres('Mon programme')).toEqual(['CE QUE JE FAIS']);
    expect(apres('Moi')).toEqual(['MON CORPS', 'DEPUIS QUAND']);
    expect(apres('Mon compte')).toEqual(['L’APP']);
  });

  test('toutes les lignes d\'avant sont là (liste comparée), rien de plus', () => {
    const { cible } = rendu();
    const lignes = Array.from(cible.querySelectorAll('.p-ligne .p-lib')).map((n) => n.firstChild.textContent);
    expect(lignes.slice().sort()).toEqual(LIGNES_D_AVANT.slice().sort());
  });

  test('le but d\'entraînement ouvre la même feuille qu\'avant', () => {
    const { e } = rendu();
    const ligne = e.section('TON BUT').lignes[0];
    expect(ligne.libelle).toBe('But d’entraînement');
    ligne.surChoix();
    expect(e.ouverts).toEqual(['objectif']);
  });
});
