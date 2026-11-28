/**
 * @jest-environment jsdom
 */
// L'écran de secours (v2/js/secours.js) : « L'app n'a pas pu démarrer » + « Réessayer », jamais une page vide.
const fs = require('fs');
const path = require('path');
const V2 = path.join(__dirname, '../../v2');

function charger() {
  jest.resetModules();
  document.documentElement.className = '';
  document.body.innerHTML = '<main class="tel"><section id="vue-liste"></section></main><nav class="onglets"></nav>';
  delete window.THSecours;
  window.THApp = {};   // `app.js` « a fini » : le contrôle de fin de chargement (readyState complete en jsdom) ne se déclenche pas
  const S = require(path.join(V2, 'js/secours.js'));
  delete window.THApp;
  return S;
}

describe('secours.js', () => {
  beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('montrer pose UNE section avec le titre, le texte et « Réessayer » ; idempotent', () => {
    const S = charger();
    expect(S.montrer(new Error('x'))).toBe(true);
    S.montrer(new Error('y'));
    expect(document.querySelectorAll('#vue-secours').length).toBe(1);
    expect(document.querySelector('#vue-secours h1').textContent).toBe('L’app n’a pas pu démarrer');
    expect(document.getElementById('btn-secours-reessayer').textContent).toBe('Réessayer');
    expect(document.documentElement.classList.contains('en-secours')).toBe(true);
  });

  test('à la fin du chargement, sans THApp (app.js absent ou arrêté), l’écran se montre', () => {
    jest.resetModules();
    document.body.innerHTML = '<main class="tel"></main>';
    delete window.THApp; delete window.THSecours;
    require(path.join(V2, 'js/secours.js'));
    expect(document.getElementById('vue-secours')).not.toBeNull();
  });

  test('un script de l’app qui ne charge pas déclenche l’écran ; le captcha (autre origine) non ; et pas une fois THApp posé', () => {
    charger();
    const ev = (src) => { const s = document.createElement('script'); s.src = src; document.body.appendChild(s);
      s.dispatchEvent(new Event('error')); };
    ev('https://challenges.cloudflare.com/turnstile/v0/api.js');
    expect(document.getElementById('vue-secours')).toBeNull();
    window.THApp = {};
    ev(window.location.origin + '/js/config.js');
    expect(document.getElementById('vue-secours')).toBeNull();
    delete window.THApp;
    ev(window.location.origin + '/js/config.js');
    expect(document.getElementById('vue-secours')).not.toBeNull();
  });

});

describe('câblage', () => {
  const index = fs.readFileSync(path.join(V2, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(V2, 'service-worker.js'), 'utf8');
  const app = fs.readFileSync(path.join(V2, 'js/app.js'), 'utf8');
  test('secours.js se charge EN PREMIER, avant le SDK et config.js, et il est dans la coquille', () => {
    const i = index.indexOf('/js/secours.js');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(index.indexOf('/vendor/supabase.js'));
    expect(i).toBeLessThan(index.indexOf('/js/config.js'));
    expect(sw).toContain("'./js/secours.js'");
  });
  test('index.html porte un <noscript>', () => { expect(index).toMatch(/<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/); });
  test('demarrer attrape tout : try/catch, THConfig vérifié, écran de secours', () => {
    const m = /async function demarrer\(\) \{([\s\S]*?)\n  \}\n/.exec(app);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/try \{/);
    expect(m[1]).toMatch(/THConfig/);
    expect(m[1]).toMatch(/THSecours\.montrer/);
  });
});
