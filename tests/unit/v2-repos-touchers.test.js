// Le minuteur de repos ne recrée plus ses boutons chaque seconde : un toucher qui chevauche un tic n'est plus perdu.
// jsdom : `rendu.js` se termine par `this`.
require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');

describe('repos — boutons stables entre les tics', () => {
  function monter() {
    const cible = document.createElement('div');
    const appels = { ajuster: [], sourdine: 0, passer: 0 };
    const vue = (restant, extra) => Object.assign({
      restant, cible: 90, pas: 15, sourdine: false, question: null,
      surAjuster(d) { appels.ajuster.push(d); }, surSourdine() { appels.sourdine++; }, surPasser() { appels.passer++; },
    }, extra);
    return { cible, appels, vue, rendre: (v) => window.THRendu.rendreRepos(cible, v) };
  }
  const boutons = (c) => Array.from(c.querySelectorAll('button'));

  test('le bouton +15 est le MÊME élément après plusieurs tics, et un clic après 2 tics agit', () => {
    const m = monter();
    m.rendre(m.vue(60));
    const avant = boutons(m.cible);
    const plus = avant.find((b) => b.textContent === '+15');
    m.rendre(m.vue(59));
    m.rendre(m.vue(58));
    const apres = boutons(m.cible);
    expect(apres).toEqual(avant);
    expect(apres.every((b, i) => b === avant[i])).toBe(true);
    expect(m.cible.contains(plus)).toBe(true);
    plus.click();
    expect(m.appels.ajuster).toEqual([15]);
    expect(m.cible.querySelector('.repos-g').textContent).toBe('0:58');
  });

  test('chaque tic met à jour le temps, la cible, la barre et le Son', () => {
    const m = monter();
    m.rendre(m.vue(60));
    const son = boutons(m.cible).find((b) => b.textContent === 'Son');
    m.rendre(m.vue(45, { cible: 120, sourdine: true }));
    expect(m.cible.querySelector('.repos-g').textContent).toBe('0:45');
    expect(m.cible.querySelector('.repos-c').textContent).toBe('cible 2:00');
    expect(m.cible.querySelector('.piste i').style.width).toBe('38%');
    expect(boutons(m.cible).find((b) => b.textContent === 'Son ✕')).toBe(son);
    expect(son.classList.contains('coupe')).toBe(true);
    expect(son.getAttribute('aria-label')).toBe('Rétablir le son du repos');
  });

  test('les gestionnaires lisent la vue du dernier tic (autre série, autre exercice) sans reconstruction', () => {
    const m = monter();
    m.rendre(m.vue(60));
    const plus = boutons(m.cible).find((b) => b.textContent === '+15');
    const autres = { ajuster: [], passer: 0 };
    m.rendre(m.vue(80, { surAjuster(d) { autres.ajuster.push(d); }, surPasser() { autres.passer++; } }));
    expect(boutons(m.cible).find((b) => b.textContent === '+15')).toBe(plus);
    plus.click();
    boutons(m.cible).find((b) => b.textContent === 'Passer').click();
    expect(autres).toEqual({ ajuster: [15], passer: 1 });
    expect(m.appels.ajuster).toEqual([]);
  });

  test('un autre pas change la structure : on reconstruit', () => {
    const m = monter();
    m.rendre(m.vue(60));
    m.rendre(m.vue(60, { pas: 30 }));
    expect(boutons(m.cible).map((b) => b.textContent).slice(0, 3)).toEqual(['−30', '+30', 'Son']);
  });

  test('la question de réserve reste en dernier et garde son nœud entre deux tics', () => {
    const m = monter();
    const q = () => ({ cle: 'a', serie: '30 kg × 11', choisi: null, surChoix() {}, surPasser() {} });
    m.rendre(m.vue(60, { question: q() }));
    const noeud = m.cible.querySelector('.repos-q');
    m.rendre(m.vue(59, { question: q() }));
    expect(m.cible.querySelector('.repos-q')).toBe(noeud);
    expect(m.cible.lastChild).toBe(noeud);
    expect(m.cible.querySelectorAll('.repos-h').length).toBe(1);
  });
});
