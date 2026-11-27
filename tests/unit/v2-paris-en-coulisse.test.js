/**
 * « Les paris en coulisse » (29/11/2026, maquette paris-en-coulisse validée) — le compte « le coach en a tenu N sur M »
 * quitte le récap de fin de séance, le mois, la saison et l'année ; il vit à UN endroit : Profil › À propos › À propos de ton coach.
 *   · la page lit `faits.parisDuCoach` (un compte depuis le début, jamais par période) et ne calcule rien ;
 *   · « Pas tenu » en ambre, jamais en rouge, une ligne pas tenue se déplie sur « J'avais prévu… » ; 10 lignes, « Voir plus anciens » ;
 *   · sans pari vérifié : « Je n'ai encore vérifié aucun pari. », jamais « 0 sur 0 » ;
 *   · rien n'est écrit : le rendu et le fait ne touchent pas aux paris (`predictions` reste immuable).
 */
const fs = require('fs');
const path = require('path');
require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Bilan = require('../../v2/js/bilan.js');
const Rendu = () => window.THRendu;
const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');

const ligne = (nom, tenu, k) => ({ nom, tenu, quand: 'mardi ' + k + ' nov.', prevu: '100 kg × 5', fait: tenu ? '100 kg × 5' : '100 kg × 3',
  explication: tenu ? null : 'J’avais prévu 5 reps à 100 kg : tu en as fait 3.' });
const PARIS = (n) => ({ verifies: 10, tenus: 9, valeur: '9 sur 10', phrase: 'Sur 10 paris vérifiés, le coach en a tenu 9.',
  lignes: Array.from({ length: n }, (_, k) => ligne('Exo ' + k, k !== 2, k + 1)) });
const P = Bilan.PARIS_DU_COACH;
const rendre = (paris) => {
  const c = document.createElement('div');
  Rendu().rendreFeuilleParisDuCoach(c, { titre: P.titre, intro: P.intro, ceQueJeCompte: P.ceQueJeCompte, aucun: P.aucun, paris });
  return c;
};

describe('la page « À propos de ton coach »', () => {
  test('le compte, la phrase, ce que je compte, puis les dix derniers paris', () => {
    const c = rendre(PARIS(14));
    expect(c.querySelector('.feuille-t').textContent).toBe('À propos de ton coach');
    expect(c.querySelector('.paris-intro').textContent).toBe(P.intro);
    expect(c.querySelector('.paris-valeur').textContent).toBe('9 sur 10');
    expect(c.querySelector('.paris-phrase').textContent).toBe('Sur 10 paris vérifiés, le coach en a tenu 9.');
    expect(c.querySelector('.paris-note').textContent).toBe(P.ceQueJeCompte);
    expect(c.querySelectorAll('.paris-ligne')).toHaveLength(10);
  });
  test('« Voir plus anciens » montre la suite, puis disparaît', () => {
    const c = rendre(PARIS(14));
    const plus = c.querySelector('.paris-plus');
    expect(plus.hidden).toBe(false);
    plus.click();
    expect(c.querySelectorAll('.paris-ligne')).toHaveLength(14);
    expect(plus.hidden).toBe(true);
    expect(rendre(PARIS(6)).querySelector('.paris-plus').hidden).toBe(true);
  });
  test('« Pas tenu » : sans jugement, une ligne qui se déplie sur l’écart', () => {
    const c = rendre(PARIS(5));
    const lignes = Array.from(c.querySelectorAll('.paris-ligne'));
    expect(lignes.map((l) => l.querySelector('.paris-etat').textContent)).toEqual(['Tenu', 'Tenu', 'Pas tenu', 'Tenu', 'Tenu']);
    const rate = lignes[2];
    const ex = rate.querySelector('.paris-explication');
    expect(ex.hidden).toBe(true);
    rate.click();
    expect(ex.hidden).toBe(false);
    expect(rate.getAttribute('aria-expanded')).toBe('true');
    expect(ex.textContent).toBe('J’avais prévu 5 reps à 100 kg : tu en as fait 3.');
    expect(lignes[0].querySelector('.paris-explication')).toBeNull();
    expect(c.textContent).not.toMatch(/bravo|échec|raté|pas réussi|0 sur 0/i);
  });
  test('aucun pari vérifié : une phrase, ni compte ni liste', () => {
    const c = rendre(null);
    expect(c.querySelector('.paris-vide').textContent).toBe('Je n’ai encore vérifié aucun pari. Le premier arrive quand tu fais une série que j’avais prévue.');
    expect(c.querySelector('.paris-valeur')).toBeNull();
    expect(c.textContent).not.toMatch(/0 sur 0/);
  });
});

describe('le compte ne vit plus que là (lecteurs retirés)', () => {
  test('« Pas tenu » en ambre, jamais en rouge (styles.css)', () => {
    const css = lire('styles.css');
    const bloc = css.slice(css.indexOf('.paris-ligne.pas-tenu'), css.indexOf('}', css.indexOf('.paris-ligne.pas-tenu')));
    expect(bloc).toMatch(/var\(--accent\)/);
    expect(css.slice(css.indexOf('.paris-intro'))).not.toMatch(/#[a-f0-9]{3,6}|red|rouge/i);
  });
  test('ni le récap, ni la carte du mois ou de l’année, ni le bloc de Progression ne lisent le compte', () => {
    expect(lire('js/rendu.js')).not.toMatch(/Ce que le coach avait visé|recap-pari|recap-premier|paris tenus/);
    expect(lire('js/annee.js')).not.toMatch(/Le détail des paris|Et le coach|b\.coach|vue\.paris|cle: 'coach'/);
    expect(lire('js/bilans.js')).not.toMatch(/sortie\.coach|compteLe|compterParis/);
    expect(lire('js/faits.js')).not.toMatch(/phrasePremierPari|Bilan\.PHRASE_PREMIER/);
    const app = lire('js/app.js');
    expect(app).not.toMatch(/vue\.paris\b|bm\.coach/);
  });
  test('un seul écrivain du compte : la ligne du Profil et la page passent par `faits.parisDuCoach`, aucune écriture', () => {
    const app = lire('js/app.js');
    const a = app.slice(app.indexOf('function ligneParisDuCoach'), app.indexOf('function ouvrirMentions'));
    expect((a.match(/faits\.parisDuCoach\(/g) || []).length).toBe(1);
    const b = app.slice(app.indexOf('function ouvrirParisDuCoach'), app.indexOf('function ouvrirMotsDuCoach'));
    expect(b).toMatch(/faits\.parisDuCoach\(/);
    expect(a + b).not.toMatch(/poser|ajouterRecords|upsert|insert|ecrire/i);
  });
});

describe('Bilan : le compte ramené, la valeur de la ligne du Profil', () => {
  test('« 9 sur 10 » dès 10 paris vérifiés, tels quels en dessous, rien sans pari', () => {
    expect(Bilan.valeurParis(240, 212)).toBe('9 sur 10');
    expect(Bilan.valeurParis(7, 6)).toBe('6 sur 7');
    expect(Bilan.valeurParis(0, 0)).toBeNull();
    expect(Bilan.phraseParis(0, 0)).toBeNull();
    expect(Bilan.phraseParis(240, 212)).toBe('Sur 10 paris vérifiés, le coach en a tenu 9.');
  });
});
