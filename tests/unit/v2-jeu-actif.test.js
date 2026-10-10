/** @jest-environment node */
//
// 64B — L'INTERRUPTEUR DU JEU (`profiles.jeu_actif`, v2_068, NOT NULL DEFAULT true ; JEU-V1 §9.1).
//
// Trois choses à tenir : il est LU et ÉCRIT (une colonne écrite et non relue est effacée de l'état local au premier
// envoi — le piège de `rythme_progression`) ; absent, il vaut « allumé » ; et un `null` ne part JAMAIS (NOT NULL →
// 23502, que la file classe définitif, sur une ligne de profil qui part entière à chaque envoi).

const fs = require('fs');
const path = require('path');

global.self = global;
const Profil = require('../../v2/js/profil.js');

const DONNEES = fs.readFileSync(path.join(__dirname, '../../v2/js/donnees.js'), 'utf8');
const colonnesLues = () => {
  const m = /var COLONNES_PROFIL =([\s\S]*?')\s*;/.exec(DONNEES);
  return m[1].split('\n').filter((l) => !/^\s*\/\//.test(l)).join('').match(/'([^']*)'/g)
    .map((s) => s.slice(1, -1)).join('').split(',').map((s) => s.trim()).filter(Boolean);
};

describe('64B — jeuActif : éteint seulement si le profil le dit', () => {
  test('false → éteint', () => {
    expect(Profil.jeuActif({ jeu_actif: false })).toBe(false);
  });
  test('true, absent, null, profil vide ou absent → allumé', () => {
    expect(Profil.jeuActif({ jeu_actif: true })).toBe(true);
    expect(Profil.jeuActif({ username: 'aurel' })).toBe(true);
    expect(Profil.jeuActif({ jeu_actif: null })).toBe(true);
    expect(Profil.jeuActif({})).toBe(true);
    expect(Profil.jeuActif(null)).toBe(true);
    expect(Profil.jeuActif(undefined)).toBe(true);
  });
});

describe('64B — jeu_actif est lu ET écrit', () => {
  test('il est dans la liste blanche des écritures et dans les colonnes relues', () => {
    expect(Profil.CHAMPS_ECRITS).toContain('jeu_actif');
    expect(colonnesLues()).toContain('jeu_actif');
  });

  test('⚠️ chaque colonne écrite est relue (sinon `profil = rendu` l’efface au premier envoi)', () => {
    const lues = colonnesLues();
    expect(lues.length).toBeGreaterThan(20);
    expect(Profil.CHAMPS_ECRITS.filter((c) => lues.indexOf(c) < 0)).toEqual([]);
  });
});

describe('64B — un null ne part jamais', () => {
  test('un booléen part ; null, absent ou autre chose ne part pas', () => {
    expect(Profil.champsEcrits({ jeu_actif: false })).toEqual({ jeu_actif: false });
    expect(Profil.champsEcrits({ jeu_actif: true })).toEqual({ jeu_actif: true });
    expect(Profil.champsEcrits({ jeu_actif: null, username: 'a' })).toEqual({ username: 'a' });
    expect(Profil.champsEcrits({ jeu_actif: undefined })).toEqual({});
    expect(Profil.champsEcrits({ jeu_actif: 'false' })).toEqual({});
  });

  test('la ligne entière d’un profil local sans la colonne part sans elle', () => {
    const local = { username: 'aurel', intention: 'progresser', taille_cm: 182 };
    expect(Object.prototype.hasOwnProperty.call(Profil.champsEcrits(local), 'jeu_actif')).toBe(false);
  });

  test('les autres colonnes à null partent toujours (le filtre ne vaut que pour la colonne NOT NULL)', () => {
    expect(Profil.champsEcrits({ bio: null, objectif: null })).toEqual({ bio: null, objectif: null });
  });
});
