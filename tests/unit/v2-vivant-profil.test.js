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
  'Les mots du coach',   // 201
  'Mentions légales', 'Confidentialité', 'Santé'   // 212
];

function rendu() {
  const e = profilEcran(PROFIL);
  const cible = document.createElement('div');
  window.THRendu.rendreProfil(cible, e.vue);
  return { e, cible };
}

describe('le Profil rangé par fréquence (173)', () => {
  test('cinq groupes, dans l\'ordre', () => {
    const { cible } = rendu();
    // 213 — cinq groupes repliés ; leurs sections, dans l'ordre, sont dans le corps de chacun.
    const groupes = Array.from(cible.querySelectorAll('.p-gr')).map((n) => n.dataset.groupe);
    expect(groupes).toEqual(['Mon coach', 'Mon programme', 'Moi', 'Mon compte', 'À propos']);
    const sections = (g) => Array.from(cible.querySelectorAll('.p-gr[data-groupe="' + g + '"] .p-sect')).map((n) => n.textContent);
    expect(sections('Mon coach')).toEqual(['POURQUOI', 'TON RYTHME', 'TA PHASE', 'TON BUT', 'TA SEMAINE']);
    expect(sections('Mon programme')).toEqual(['CE QUE JE FAIS', 'MES EXERCICES']);
    expect(sections('Moi')).toEqual(['TON POIDS', 'MON PROFIL', 'MA SALLE', 'MON CORPS', 'DEPUIS QUAND']);
    expect(sections('Mon compte')).toEqual(['L’APP', 'MES DONNÉES', 'LE JEU']);
    expect(sections('À propos')).toEqual(['LES MOTS DU COACH', 'MENTIONS']);
    // 213 — tout est fermé à l'arrivée, et chaque groupe a son résumé.
    expect(cible.querySelectorAll('.p-gr-tete[aria-expanded="true"]').length).toBe(0);
    expect(Array.from(cible.querySelectorAll('.p-gr-corps')).every((c) => c.hidden)).toBe(true);
    expect(Array.from(cible.querySelectorAll('.p-gr-resume')).length).toBe(5);
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

describe('213 — les groupes se déplient un à un', () => {
  test('un seul groupe ouvert à la fois, et l\'appelant en est prévenu', () => {
    const e = profilEcran(PROFIL);
    const cible = document.createElement('div');
    const dits = [];
    window.THRendu.rendreProfil(cible, Object.assign({}, e.vue, { surGroupe: (n) => dits.push(n) }));
    const tete = (g) => cible.querySelector('.p-gr[data-groupe="' + g + '"] .p-gr-tete');
    tete('Mon coach').click();
    tete('Moi').click();
    expect(cible.querySelectorAll('.p-gr-tete[aria-expanded="true"]').length).toBe(1);
    expect(tete('Moi').getAttribute('aria-expanded')).toBe('true');
    tete('Moi').click();
    expect(cible.querySelectorAll('.p-gr-tete[aria-expanded="true"]').length).toBe(0);
    expect(dits).toEqual(['Mon coach', 'Moi', null]);
  });

  test('`ouvert` rouvre le groupe d\'où l\'on vient ; la carte « À compléter » ouvre le groupe et la feuille', () => {
    const e = profilEcran(PROFIL);
    const cible = document.createElement('div');
    window.THRendu.rendreProfil(cible, Object.assign({}, e.vue, { ouvert: 'Moi' }));
    expect(cible.querySelector('.p-gr[data-groupe="Moi"] .p-gr-corps').hidden).toBe(false);
    const titre = cible.querySelector('.p-ac-titre');
    expect(titre.textContent).toMatch(/^À compléter \(\d+\)$/);
    const libelles = Array.from(cible.querySelectorAll('.p-ac-ligne .p-lib')).map((n) => n.textContent);
    expect(libelles).not.toContain('Bio');
    expect(libelles).not.toContain('Pseudo');
  });
});
