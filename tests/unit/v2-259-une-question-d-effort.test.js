// 259 — UNE SEULE QUESTION D'EFFORT. « Il t'en restait combien ? » vit dans la barre de repos, avec « Passer » ; la carte de
// l'exercice ne la pose plus d'office (elle ne garde que la phrase du coach qui suit la réponse).
// jsdom : `rendu.js` se termine par `this`.
const fs = require('fs');
const path = require('path');
require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');

const RENDU = fs.readFileSync(path.join(__dirname, '../../v2/js/rendu.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

describe('259 — la question d’effort de la barre de repos', () => {
  function barre(vue) {
    const cible = document.createElement('div');
    window.THRendu.rendreRepos(cible, Object.assign({ restant: 59, cible: 60, pas: 15, question: null }, vue));
    return cible;
  }
  test('la barre pose la question avec 0 · 1 · 2 · 3 ou + · Passer', () => {
    const c = barre({ question: { cle: 'a', serie: '30 kg × 11', choisi: null, surChoix() {}, surPasser() {} } });
    const q = c.querySelector('.repos-q');
    expect(q.textContent).toContain('Il t’en restait combien ?');
    expect(Array.from(q.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['0', '1', '2', '3 ou +', 'Passer']);
  });
  test('« Passer » appelle surPasser et n’écrit aucun ressenti', () => {
    let passe = 0, choix = 0;
    const c = barre({ question: { cle: 'a', serie: '30 kg × 11', choisi: null, surChoix() { choix++; }, surPasser() { passe++; } } });
    c.querySelector('.repos-q button[data-passer="1"]').click();
    expect([passe, choix]).toEqual([1, 0]);
  });
  test('sans question : aucune ligne de question dans la barre', () => {
    expect(barre({}).querySelector('.repos-q')).toBeNull();
  });
});

describe('259 — la carte de l’exercice', () => {
  test('la carte ne fabrique plus de puces ni de « Passer » : seule la phrase d’après la réponse', () => {
    const m = RENDU.match(/function effortViseDeSerie\(ef\) \{[\s\S]*?\n  \}\n/);
    expect(m).not.toBeNull();
    expect(m[0]).not.toMatch(/restait combien|button|Passer|effort-puce/);
    expect(m[0]).toMatch(/effort-vise-dit/);
  });
  test('l’écran ne pose plus `demande` sous la série ; la barre respecte « Passer » de la session', () => {
    const m = APP.match(/function effortViseSurLigne\(iExo, iSerie\) \{[\s\S]*?\n  \}\n/);
    expect(m[0]).not.toMatch(/demande/);
    const q = APP.match(/function questionDuRepos\(iExo, iSerie\) \{[\s\S]*?\n  \}\n/);
    expect(q[0]).toMatch(/effortPasse\[s\.id\]/);
  });
});
