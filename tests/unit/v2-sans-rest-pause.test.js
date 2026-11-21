// 21/11/2026 — GARDE D'ARCHITECTURE (I268, MOTEUR §9.33, décision du fondateur) : le coach ne propose plus le rest-pause. Plus de fonction qui le
// permet, le pose ou le nomme ; il reste UNE lecture (`Modele.restPauseDe`) et son affichage.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '../../v2/js');
const lire = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const sansCommentaires = (t) => t.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

describe('I268 — plus aucune porte vers le rest-pause', () => {
  const fichiers = fs.readdirSync(DIR).filter((f) => /\.js$/.test(f));
  test('aucune de ces fonctions n\'existe plus dans v2/js', () => {
    fichiers.forEach((f) => {
      const t = sansCommentaires(lire(f));
      ['peutRestPause', 'ajouterRestPause', 'restPauseDeLaFeuille', 'surRestPause', 'EQUIPEMENTS_REST_PAUSE', 'SERIES_POUR_REST_PAUSE',
        'MINI_SERIES_REST_PAUSE'].forEach((nom) => expect([f, nom, t.indexOf(nom) >= 0]).toEqual([f, nom, false]));
    });
  });
  test('le moteur n\'écrit aucun journal, levier ni bouton « rest_pause » ; seul le lexique garde le mot', () => {
    const t = sansCommentaires(lire('moteur.js'));
    expect(t).not.toMatch(/quoi:\s*'rest_pause'/);
    expect(t).not.toMatch(/leviers\.push\('rest_pause'\)/);
    expect(t).not.toMatch(/rest_pause\s*:\s*'Rest-pause'/);
    expect((t.match(/rest[-_]pause/gi) || []).length).toBe(2);   // `cle: 'rest_pause', mot: 'Rest-pause'`
  });
  test('l\'écran n\'offre aucun bouton « Rest-pause » ; `rendu.js` ne fait que lire le cumul', () => {
    expect(sansCommentaires(lire('rendu.js'))).not.toMatch(/'Rest-pause'/);
    expect(sansCommentaires(lire('app.js'))).not.toMatch(/rest.?pause/i);
  });
});
