'use strict';
// « Réponses lentes » (19/11/2026) : les écrans qui annoncent un geste d'équilibre (« Pas maintenant », réglage de durée,
// priorités, leurs « Annuler ») ne passent plus par l'aller-retour réseau du profil : la copie locale suffit pour les afficher.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

function corps(nom) {
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error(nom + ' introuvable');
  const suite = src.indexOf('\n  }\n', i);
  return src.slice(i, suite);
}

describe('poserProfil : la main rendue après la copie locale', () => {
  const c = corps('poserProfil');
  test('l\'option sansAttendre lance l\'envoi sans l\'attendre, et le laisse repartir en cas d\'échec', () => {
    expect(c).toMatch(/options && options\.sansAttendre\) \{ envoyerProfil\(\)\.catch/);
    expect(c.indexOf('sauverProfilLocal()')).toBeLessThan(c.indexOf('sansAttendre'));
  });
  test('sans l\'option, l\'envoi reste attendu (les autres appelants ne changent pas)', () => {
    expect(c.endsWith("\n    await envoyerProfil();")).toBe(true);
  });
});

describe('les gestes d\'équilibre ne retiennent pas l\'écran', () => {
  test('repondreALaCarte (Pas maintenant, un oui) et le réglage de durée posent sans attendre', () => {
    expect(corps('repondreALaCarte')).toMatch(/poserProfil\(\{ cartes_semaine: toutes \}, \{ sansAttendre: true \}\)/);
    expect(corps('regleLaDureeEquilibre')).toMatch(/poserProfil\(champs, \{ sansAttendre: true \}\)/);
  });
  test('chaque « Annuler » d\'une carte de la semaine rend les réponses sans attendre', () => {
    const restes = src.match(/await poserProfil\(\{ cartes_semaine: avantReponses \}\);/g);
    expect(restes).toBeNull();
  });
});
