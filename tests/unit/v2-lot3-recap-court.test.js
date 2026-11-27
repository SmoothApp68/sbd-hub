/**
 * Lot 3 (25/11/2026), changement 2 — le récap court : l'essentiel visible, le reste sous « Détail ».
 *
 * Ce que ce fichier prouve :
 *   · visible : l'en-tête, les quatre chiffres, les records (une médaille par ligne, sa phrase), 
 *     (aucun bloc des paris depuis le 29/11/2026) ; moins de 800 caractères sur l'exemple de la maquette ;
 *   · replié (dans le DOM, `hidden`) : la comparaison, les séries par muscle, le jeu, la note — et un
 *     toucher sur « Détail » les rend ; chaque ligne reste celle d'avant, mot pour mot ;
 *   · aucun bloc sans matière : pas de « Détail » quand il n'y a rien dessous, pas de « 0 record » ;
 *   · aucun « bravo » ; « Fermer », « Voir la séance » et « Partager » restent après le corps.
 */
require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const RECAP = {
  titre: 'Haut du corps A', debut: '2026-11-21T14:27:00Z', fin: '2026-11-21T15:39:00Z', duree_min: 72, series: 24,
  volume_kg: 13400, volume_texte: '13,4 t', exercices: 7, phraseVolume: '13,4 t soulevées : à peu près un ATR 72 à vide.',
  muscles: { premiers: [{ libelle: 'Pectoraux', series: 8 }, { libelle: 'Dos', series: 7.5 }, { libelle: 'Épaules', series: 6.5 },
    { libelle: 'Triceps', series: 5 }, { libelle: 'Biceps', series: 3.5 }], autres: { n: 3, series: 4.5 } },
  cardio: [],
  records: [
    { nom: 'Développé couché', mesure: '100 kg × 5', phrase: ['Record à 5 reps : 100 kg.', 'Avant : 97,5 kg, le 3 nov.'] },
    { nom: 'Tractions', mesure: '8 reps', phrase: ['Record au poids du corps : 8 reps.', 'Avant : 7 reps, le 12 nov.'] },
    { nom: 'Rowing barre', mesure: '80 kg × 8', phrase: ['Record à 8 reps : 80 kg.', 'Avant : 77,5 kg, le 9 nov.'] }],
  pointDeDepart: null,
  note: 'Épaule gauche un peu raide sur le militaire.'
};
const JEU = { apport: { xp: 420, niveau: { de: 13, a: 14 }, muscles: [], succes: [], points: 0 }, succes: [], caps: [] };

const rendre = (recap, jeu) => {
  const c = document.createElement('div');
  Rendu().rendreRecap(c, { recap, jeu: jeu || null, surFermer() {}, surVoir() {}, surPartager() {} });
  return c;
};
const enfants = (c, classe) => Array.from(c.children).filter((n) => n.classList.contains(classe));
// Le texte VISIBLE : tout sauf ce qui est sous un élément `hidden`.
const visible = (c) => {
  const copie = c.cloneNode(true);
  copie.querySelectorAll('[hidden]').forEach((n) => n.remove());
  return copie.textContent.replace(/\s+/g, ' ').trim();
};

describe('lot 3 — le récap court', () => {
  test('visible : en-tête, quatre chiffres, trois records, et plus aucun pari (29/11/2026, « Les paris en coulisse »)', () => {
    const c = rendre(RECAP, JEU);
    expect(c.querySelector('.recap-titre').textContent).toBe('Haut du corps A');
    expect(Array.from(c.querySelectorAll('.recap-tuile')).map((t) => t.querySelector('span').textContent))
      .toEqual(['durée', 'séries', 'volume', 'exercices']);
    expect(Array.from(c.querySelectorAll('.recap-rec .l1')).map((n) => n.textContent))
      .toEqual(['Développé couché : 100 kg × 5', 'Tractions : 8 reps', 'Rowing barre : 80 kg × 8']);
    expect(c.querySelector('.recap-voix')).toBeNull();
    expect(c.querySelector('.recap-pari')).toBeNull();
    expect(visible(c)).not.toMatch(/pari|visé|le coach en a tenu/i);
  });

  test('replié : la comparaison, les muscles, le jeu, la note — dans le DOM, sous « Détail »', () => {
    const c = rendre(RECAP, JEU);
    const d = c.querySelector('.recap-detail');
    expect(d.hidden).toBe(true);
    expect(d.querySelector('.recap-comp').textContent).toBe('13,4 t soulevées : à peu près un ATR 72 à vide.');
    expect(d.querySelectorAll('.recap-mu')).toHaveLength(6);
    expect(d.querySelector('.recap-pari')).toBeNull();
    expect(d.querySelector('#jeu-fin')).not.toBeNull();
    expect(d.querySelector('.recap-note').textContent).toBe('Épaule gauche un peu raide sur le militaire.');
    // Ces blocs ne sont PAS dans le texte visible.
    const v = visible(c);
    expect(v).not.toMatch(/Séries par muscle|ATR 72|Pectoraux|Épaule gauche|XP/);
  });

  test('« Détail » dit ce qu\'il contient, et un toucher le rend (aria-expanded)', () => {
    const c = rendre(RECAP, JEU);
    const b = c.querySelector('.recap-plus');
    expect(b.querySelector('.recap-plus-t').textContent).toBe('Détail');
    expect(b.querySelector('.recap-plus-d').textContent).toBe('muscles · jeu · note ›');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    b.click();
    expect(c.querySelector('.recap-detail').hidden).toBe(false);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(visible(c)).toMatch(/Séries par muscle.*Pectoraux/);
    b.click();
    expect(c.querySelector('.recap-detail').hidden).toBe(true);
  });

  test('moins de 800 caractères visibles sur l\'exemple de la maquette (corps, sans les boutons)', () => {
    const c = rendre(RECAP, JEU);
    c.querySelectorAll('.recap-bouton, .recap-partage-liste').forEach((n) => n.remove());
    expect(visible(c).length).toBeLessThan(800);
  });

  test('sans matière sous « Détail » : pas de « Détail » ; sans record : pas de « 0 record » ; jamais « bravo »', () => {
    const nu = Object.assign({}, RECAP, { phraseVolume: null, muscles: { premiers: [], autres: null }, records: [], note: null });
    const c = rendre(nu, null);
    expect(c.querySelector('.recap-plus')).toBeNull();
    expect(c.querySelector('.recap-detail')).toBeNull();
    expect(c.textContent).not.toMatch(/0 record|bravo/i);
    expect(c.querySelector('.recap-groupe')).toBeNull();
  });

  test('le cardio et « Point de départ » restent visibles ; les boutons suivent le corps', () => {
    const cardio = Object.assign({}, RECAP, { cardio: [{ nom: 'Tapis roulant', fait: '20 min' }], pointDeDepart: 'Cette séance me sert de point de départ.' });
    const c = rendre(cardio, null);
    expect(visible(c)).toMatch(/Tapis roulant20 min/);
    expect(visible(c)).toMatch(/Cette séance me sert de point de départ\./);
    const boutons = Array.from(c.children).filter((n) => n.tagName === 'BUTTON').map((b) => b.textContent);
    expect(boutons).toEqual([c.querySelector('.recap-plus').textContent, 'Fermer', 'Voir la séance', 'Partager']);
    expect(c.querySelector('.recap-plus').compareDocumentPosition(c.querySelector('.recap-fermer')) & 4).toBeTruthy();
  });
});
