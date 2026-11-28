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

describe('repos — la question de réserve suit chaque changement d’état (Q78)', () => {
  function monter() {
    const cible = document.createElement('div');
    const rendre = (restant, question) => window.THRendu.rendreRepos(cible, {
      restant, cible: 90, pas: 15, sourdine: false, question,
      surAjuster() {}, surSourdine() {}, surPasser() {},
    });
    return { cible, rendre };
  }
  const q = (cle, serie, choisi) => ({ cle, serie, choisi: choisi || null, surChoix() {}, surPasser() {} });

  test('« un tap : le bouton s’allume » — le choix se met à jour sans changer les boutons du minuteur', () => {
    const m = monter();
    m.rendre(60, q('a', '60 kg × 9'));
    const plus = Array.from(m.cible.querySelectorAll('.repos-h button')).find((b) => b.textContent === '+15');
    m.rendre(59, q('a', '60 kg × 9', 'reste_1'));
    const choisis = Array.from(m.cible.querySelectorAll('.repos-q button.sel')).map((b) => b.getAttribute('data-ressenti'));
    expect(choisis).toEqual(['reste_1']);
    expect(m.cible.querySelectorAll('.repos-q').length).toBe(1);
    expect(Array.from(m.cible.querySelectorAll('.repos-h button')).find((b) => b.textContent === '+15')).toBe(plus);
  });

  test('« rien après sa première série, la question après sa dernière » — texte remplacé, jamais empilé', () => {
    const m = monter();
    m.rendre(60, null);
    expect(m.cible.querySelector('.repos-q')).toBeNull();
    m.rendre(59, q('b', '40 kg × 11'));
    expect(m.cible.querySelector('.repos-q-t').textContent).toContain('40 kg × 11');
    m.rendre(58, q('c', '60 kg × 9'));
    expect(m.cible.querySelectorAll('.repos-q').length).toBe(1);
    expect(m.cible.querySelector('.repos-q-t').textContent).toContain('60 kg × 9');
    expect(m.cible.querySelector('.repos-q-t').textContent).not.toContain('40 kg');
    m.rendre(57, null);
    expect(m.cible.querySelector('.repos-q')).toBeNull();
  });

  test('« rien ne reste sous la barre » — la hauteur ne grandit pas : un seul .repos-h, une seule piste, la question en dernier', () => {
    const m = monter();
    m.rendre(60, q('a', '60 kg × 9'));
    m.rendre(59, q('b', '40 kg × 11'));
    m.rendre(58, q('b', '40 kg × 11', 'reste_2'));
    m.rendre(57, null);
    m.rendre(56, q('d', '50 kg × 8'));
    expect(m.cible.querySelectorAll('.repos-h').length).toBe(1);
    expect(m.cible.querySelectorAll('.piste').length).toBe(1);
    expect(Array.from(m.cible.children).map((n) => n.className.split(' ')[0])).toEqual(['repos-h', 'piste', 'repos-q']);
  });
});
