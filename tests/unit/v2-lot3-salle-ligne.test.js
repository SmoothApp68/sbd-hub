/**
 * Lot 3 (25/11/2026), changement 3 — « Titre, salle, note » tiennent sur UNE ligne, avec « Modifier », et la salle
 * proposée est celle de la dernière séance TERMINÉE qui en a déclaré une.
 *
 * Ce que ce fichier prouve :
 *   · `faits.derniereSalleDeclaree` : la plus récente terminée avec une salle ; ni la séance en cours, ni une salle vide,
 *     ni une séance non terminée ; `null` sans rien ;
 *   · `Seance.salleDeFin` / `avecSalleDeFin` : la sienne d'abord, la proposée sinon, vide si la personne l'a vidée ; la
 *     proposée n'est écrite que par `avecSalleDeFin` (la séance d'origine n'est pas modifiée) ;
 *   · le rendu : la salle est ÉCRITE EN CLAIR sur la ligne (jamais cachée), « Modifier » ouvre les trois champs, le texte
 *     reste « Séance » sans titre, « note ajoutée » dit qu'il y a une note, et « Terminer » est toujours là.
 */
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/periode.js');
const Seance = require('../../v2/js/seance.js');
const Faits = require('../../v2/js/faits.js');
require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const faits = Faits.creer();

const corpus = (seances) => ({ seances, series: [], exercices: [], journal: [], catalogue: () => ({}) });
const S = (id, debut, extra) => Object.assign({ id, debut, fin: debut, statut: 'terminee', salle: null }, extra || {});

describe('lot 3 — la salle d’avant (fait)', () => {
  test('la plus récente séance terminée qui a déclaré une salle', () => {
    const c = corpus([
      S('a', '2026-11-01T17:00:00Z', { salle: 'Basic-Fit Mulhouse' }),
      S('b', '2026-11-10T17:00:00Z', { salle: 'Basic-Fit Colmar' }),
      S('c', '2026-11-20T17:00:00Z', { salle: null })    // plus récente, mais sans salle : elle ne compte pas
    ]);
    expect(faits.derniereSalleDeclaree(c, 'z')).toBe('Basic-Fit Colmar');
  });
  test('ni la séance en cours, ni une séance non terminée, ni une salle vide ou d’espaces', () => {
    const c = corpus([
      S('a', '2026-11-01T17:00:00Z', { salle: 'Garage' }),
      S('en-cours', '2026-11-24T17:00:00Z', { salle: 'Ailleurs', statut: 'en_cours' }),
      S('moi', '2026-11-25T17:00:00Z', { salle: 'Moi' }),
      S('vide', '2026-11-23T17:00:00Z', { salle: '   ' })
    ]);
    expect(faits.derniereSalleDeclaree(c, 'moi')).toBe('Garage');
  });
  test('aucune séance n’a déclaré de salle : null (rien n’est deviné)', () => {
    expect(faits.derniereSalleDeclaree(corpus([S('a', '2026-11-01T17:00:00Z')]), 'z')).toBeNull();
    expect(faits.derniereSalleDeclaree(corpus([]), 'z')).toBeNull();
  });
});

describe('lot 3 — la salle que « Terminer » écrira', () => {
  const base = { id: 'x', titre: 'Haut du corps A', salle: null, exercices: [] };
  test('la sienne d’abord ; sinon la proposée ; vidée à la main, rien', () => {
    expect(Seance.salleDeFin(Object.assign({}, base, { salle: 'Garage' }), 'Colmar', false)).toBe('Garage');
    expect(Seance.salleDeFin(base, 'Colmar', false)).toBe('Colmar');
    expect(Seance.salleDeFin(base, 'Colmar', true)).toBe('');
    expect(Seance.salleDeFin(base, null, false)).toBe('');
  });
  test('⚠️ la proposée ne s’écrit que par `avecSalleDeFin`, sans toucher la séance d’origine', () => {
    const avant = JSON.stringify(base);
    const fin = Seance.avecSalleDeFin(base, 'Colmar', false);
    expect(fin.salle).toBe('Colmar');
    expect(JSON.stringify(base)).toBe(avant);
    expect(Seance.avecSalleDeFin(base, 'Colmar', true).salle).toBeNull();
    expect(Seance.avecSalleDeFin(Object.assign({}, base, { salle: 'Garage' }), 'Colmar', false).salle).toBe('Garage');
    expect(Seance.avecSalleDeFin(base, null, false)).toBe(base);
  });
  test('la borne de 60 caractères reste celle de la colonne', () => {
    expect(Seance.salleDeFin(base, 'x'.repeat(80), false)).toHaveLength(Seance.SALLE_MAX);
  });
});

describe('lot 3 — la ligne « Titre, salle, note »', () => {
  const rendre = (vue) => {
    const cible = document.createElement('div');
    const appels = [];
    Rendu().rendreFeuilleFin(cible, Object.assign({ compte: { travail: 24 }, titre: 'Haut du corps A', salle: 'Basic-Fit Colmar', note: '',
      salleMax: 60, surTitre() {}, surSalle() {}, surNoteSeance() {}, surTerminer: () => appels.push('terminer'),
      surAbandonner() {}, surModifier: () => appels.push('modifier') }, vue));
    return { cible, appels, texte: cible.textContent };
  };
  test('une ligne : le titre ET la salle en clair, « Modifier » ; aucun champ ouvert', () => {
    const f = rendre({});
    expect(f.cible.querySelector('.resume-fin-v').textContent).toBe('Haut du corps A · Basic-Fit Colmar');
    expect(f.cible.querySelectorAll('.champs-fin, input, textarea')).toHaveLength(0);
    const m = f.cible.querySelector('.resume-fin-m');
    expect(m.textContent).toBe('Modifier');
    m.click();
    expect(f.appels).toEqual(['modifier']);
  });
  test('« Modifier » ouvre les trois champs, la salle dedans', () => {
    const f = rendre({ modifier: true });
    expect(f.cible.querySelectorAll('.champs-fin input, .champs-fin textarea')).toHaveLength(3);
    expect(f.cible.querySelector('.resume-fin')).toBeNull();
    expect(f.cible.querySelector('.champs-fin input[maxlength="60"]').value).toBe('Basic-Fit Colmar');
  });
  test('sans titre : « Séance » ; sans salle : pas de point médian ; une note : « note ajoutée »', () => {
    expect(rendre({ titre: '', salle: '' }).cible.querySelector('.resume-fin-v').textContent).toBe('Séance');
    expect(rendre({ note: 'Dos fatigué' }).cible.querySelector('.resume-fin-v').textContent)
      .toBe('Haut du corps A · Basic-Fit Colmar · note ajoutée');
  });
  test('« Terminer » et « Abandonner et tout effacer » restent là, dans l’ordre', () => {
    const f = rendre({});
    expect(Array.from(f.cible.querySelectorAll('button')).map((b) => b.textContent))
      .toEqual(['Modifier', 'Terminer', 'Abandonner et tout effacer']);
  });
});
