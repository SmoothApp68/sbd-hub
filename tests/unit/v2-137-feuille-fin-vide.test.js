//
// 137 (audit du 16/10, E12 ; ECRAN-SAISIE §7 septies.4) — UNE SÉANCE SANS SÉRIE VALIDÉE NE SE TERMINE PAS : ELLE
// S'ABANDONNE. Environnement jsdom : `modele.js` et `rendu.js` se terminent par `this`.

require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const feuille = (vue) => {
  const cible = document.createElement('div');
  const appels = [];
  const trace = (n) => () => appels.push(n);
  Rendu().rendreFeuilleFin(cible, Object.assign({ compte: { travail: 0 }, titre: '', salle: '', note: '',
    surTitre: () => {}, surSalle: () => {}, surNoteSeance: () => {}, surTerminer: trace('terminer'),
    surAbandonner: trace('abandonner'), surValider: trace('valider'), surContinuer: trace('continuer') }, vue));
  return { cible, appels,
    boutons: Array.from(cible.querySelectorAll('button')).map((b) => [b.textContent, b.className]),
    phrases: Array.from(cible.querySelectorAll('.feuille-aide')).map((n) => n.textContent),
    clic: (t) => Array.from(cible.querySelectorAll('button')).filter((b) => b.textContent === t)[0].click() };
};

describe('137 — E12 : la feuille de fin d’une séance sans série validée', () => {
  test('vide, rien tapé : la phrase, [Abandonner] en principal, [Continuer la séance] ; ni titre, ni salle, ni note, ni routine', () => {
    const f = feuille({ vide: true, remplies: 0, ecarts: [{ type: 'x' }], routine: 'R',
      manque: { phrase: 'Il manque le D+.', serie: 's', valeur: '', unite: 'm', champ: 'denivele_m', surSaisie: () => {} } });
    expect(f.phrases).toEqual(['Aucune série validée : rien à enregistrer.']);
    expect(f.boutons.map((b) => b[0])).toEqual(['Abandonner', 'Continuer la séance']);
    expect(f.boutons[0][1]).toMatch(/principal/);
    expect(f.boutons[0][1]).not.toMatch(/danger/);
    expect(f.cible.querySelector('.champs-fin, .question-routine, .manque-fin, input, textarea')).toBeNull();
    f.clic('Abandonner'); f.clic('Continuer la séance');
    expect(f.appels).toEqual(['abandonner', 'continuer']);
  });
  test('vide avec des séries remplies : la phrase (pluriel, singulier), [Les valider] puis [Abandonner] en rouge', () => {
    const f2 = feuille({ vide: true, remplies: 2 });
    expect(f2.phrases).toEqual(['Aucune série validée : rien à enregistrer.', '2 séries remplies ne sont pas validées.']);
    expect(f2.boutons.map((b) => b[0])).toEqual(['Les valider', 'Abandonner']);
    expect(f2.boutons[0][1]).toMatch(/principal/);
    expect(f2.boutons[1][1]).toMatch(/danger/);
    f2.clic('Les valider'); f2.clic('Abandonner');
    expect(f2.appels).toEqual(['valider', 'abandonner']);
    expect(feuille({ vide: true, remplies: 1 }).phrases[1]).toBe('1 série remplie n’est pas validée.');
  });
  test('une séance avec une série validée ne change pas : titre, salle, note, [Terminer], [Abandonner et tout effacer]', () => {
    const f = feuille({ vide: false, compte: { travail: 3 } });
    expect(f.cible.querySelector('.feuille-t em').textContent).toBe('3 séries de travail enregistrées');
    expect(f.cible.querySelectorAll('.champs-fin input, .champs-fin textarea').length).toBe(3);
    expect(f.boutons.map((b) => b[0])).toEqual(['Terminer', 'Abandonner et tout effacer']);
    expect(f.phrases).toEqual([]);
  });
});
