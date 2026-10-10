//
// 66B — « LE COACH RELIT TA SEMAINE », LE RENDU (QUESTIONNAIRE §5 ter.4 bis), sur le vrai rendu (jsdom) et les ONZE
// sorties du fichier de cas (`fixtures/cas-66-relire.json`, les `attendu`). Le rendu ne calcule rien : les textes de
// la sortie apparaissent tels quels ; des boutons seulement là où il y a une proposition ; « en retard sur ton
// couché » seulement sur une ligne `retard` ; la légende de la jauge à partir de deux barres ; aucune couleur
// d'alerte ; une carte repliée dit « Rien ne change. » sans bouton. Et la rangée de Saisie.

const fs = require('fs');
const path = require('path');

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;

const DONNEES = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-66-relire.json'), 'utf8'));
const CSS = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');
const texte = (n) => n.textContent.replace(/[ \t\n]+/g, ' ').trim();

function rendre(sortie, vue) {
  const c = document.createElement('div');
  Rendu.rendreRelecture(c, sortie, Object.assign({ nommer: (s) => 'NOM:' + s, seche: null }, vue || {}));
  return c;
}

describe('66B — le rendu de la relecture, sur les onze sorties du fichier de cas', () => {
  test('le fichier a onze cas', () => expect(DONNEES.cas.length).toBe(11));

  DONNEES.cas.forEach((cas) => {
    const s = cas.attendu, h = s.historique, sem = s.semaine;
    test(cas.nom + ' — chaque texte de la sortie apparaît tel quel ; des boutons seulement là où il y a une proposition', () => {
      const c = rendre(s);
      const t = texte(c);
      const attendus = [].concat(
        h.barres.map((b) => b.detail), h.barres.map((b) => b.nom),
        h.ratio ? [h.ratio.phrase, h.ratio.gris] : [], h.ratio && h.ratio.proposition ? [h.ratio.proposition.phrase] : [],
        h.peu_travailles ? [h.peu_travailles] : [], sem.verifs, sem.constats,
        sem.propositions.map((p) => p.phrase), sem.propositions.map((p) => p.question));
      expect(attendus.filter((x) => t.indexOf(x) < 0)).toEqual([]);
      // Les boutons : la priorité, s'il y en a une, et chaque retrait.
      const n = (h.ratio && h.ratio.proposition ? 1 : 0) + sem.propositions.length;
      expect(c.querySelectorAll('.rl-oui').length).toBe(n);
      expect(c.querySelectorAll('.rl-non').length).toBe(n);
      // « en retard sur ton couché » : exactement les lignes `retard`.
      expect(Array.from(c.querySelectorAll('.rl-barre')).filter((b) => /en retard sur ton couché/.test(b.textContent))
        .map((b) => b.dataset.slug)).toEqual(h.barres.filter((b) => b.retard).map((b) => b.slug));
      // La légende de la jauge : à partir de deux barres.
      expect(!!c.querySelector('.rl-legende')).toBe(h.barres.length >= 2);
      // La section « Ton historique » : absente sans barre, sans ratio, sans muscle peu travaillé.
      expect(!!c.querySelector('.rl-historique')).toBe(!!(h.barres.length || h.ratio || h.peu_travailles));
      // Chaque ligne de retrait : « {exercice} · {routine} : de a », le `de` barré.
      sem.propositions.forEach((p) => p.lignes.forEach((l) => {
        expect(t).toContain('NOM:' + l.exercise_slug + ' · ' + l.routine + ' : ' + l.de + ' ' + l.a);
      }));
      expect(Array.from(c.querySelectorAll('.rl-chg s')).map((x) => x.textContent))
        .toEqual([].concat.apply([], sem.propositions.map((p) => p.lignes.map((l) => String(l.de)))));
      // Aucune classe d'alerte.
      expect(c.querySelectorAll('[class*="alerte"], [class*="danger"], [class*="erreur"], [class*="manque"]').length).toBe(0);
    });
  });

  test('trois priorités prises : pas de bouton de priorité ; la priorité déjà là non plus', () => {
    ['trois-priorites', 'femme-force-deja-priorite'].forEach((nom) => {
      const c = rendre(DONNEES.cas.filter((x) => x.nom === nom)[0].attendu);
      expect([nom, !!c.querySelector('.rl-ratio'), c.querySelectorAll('.rl-ratio button').length]).toEqual([nom, true, 0]);
    });
  });

  test('une carte repliée rend « Rien ne change. » et aucun bouton ; l’autre carte garde les siens', () => {
    const s = DONNEES.cas.filter((x) => x.nom === 'priorite-deplacements')[0].attendu;
    expect(s.historique.ratio.proposition).not.toBeNull();
    const c = rendre(s, { replie: (p) => p.type === 'priorite' });
    expect(texte(c.querySelector('.rl-ratio'))).toBe('Rien ne change.');
    expect(c.querySelectorAll('.rl-ratio button').length).toBe(0);
    const sec = DONNEES.cas.filter((x) => x.nom === 'seche-deux-muscles')[0].attendu;
    const d = rendre(sec, { replie: (p) => p.type === 'retirer' && p.muscle === sec.semaine.propositions[0].muscle });
    const cartes = d.querySelectorAll('.rl-retrait');
    expect(texte(cartes[0])).toBe('Rien ne change.');
    expect(cartes[0].querySelectorAll('button').length).toBe(0);
    expect(cartes[1].querySelectorAll('button').length).toBe(2);
  });

  test('l’en-tête : « s séance(s) · n série(s) », 0 et 1 au singulier, et la sèche avec ou sans date', () => {
    const base = DONNEES.cas[0].attendu;
    const avec = (seances, series, seche) => texte(rendre(Object.assign({}, base,
      { semaine: Object.assign({}, base.semaine, { seances, series }) }), { seche }).querySelector('.rl-sous'));
    expect(avec(1, 0, null)).toBe('1 séance · 0 série');
    expect(avec(5, 109, 'le 29 sept.')).toBe('5 séances · 109 séries · en sèche depuis le 29 sept.');
    expect(avec(2, 12, '')).toBe('2 séances · 12 séries · en sèche');
  });

  test('les gestes : le « oui » et le « non » appellent la vue avec LEUR proposition ; la ligne grise du geste en tête de sa section', () => {
    const s = DONNEES.cas.filter((x) => x.nom === 'aurel-seche-avant')[0].attendu;
    const appels = [];
    const c = rendre(s, { surOui: (p) => appels.push(['oui', p.type]), surNon: (p) => appels.push(['non', p.type]),
      fait: { section: 'semaine', texte: 'Séries retirées.' } });
    c.querySelector('.rl-retrait .rl-oui').click();
    c.querySelector('.rl-retrait .rl-non').click();
    expect(appels).toEqual([['oui', 'retirer'], ['non', 'retirer']]);
    const sem = c.querySelector('.rl-semaine');
    expect(sem.children[1].className).toBe('rl-fait');
    expect(sem.children[1].textContent).toBe('Séries retirées.');
  });

  test('aucune couleur d’alerte dans les styles de la relecture (ni `--manque`, ni couleur écrite en dur)', () => {
    const regles = CSS.split('}').filter((r) => /\.rl-/.test(r));
    expect(regles.length).toBeGreaterThan(10);
    expect(regles.filter((r) => /--manque|#[0-9a-f]{3,8}\b|rgba?\(/i.test(r))).toEqual([]);
  });
});

describe('66B — la rangée « Le coach relit ce dossier » dans Saisie', () => {
  const routine = (id, nom, dossier) => ({ id, nom, dossier, archivee_a: null, rang: null, exercices: [] });
  const liste = (routines, vue) => {
    const c = document.createElement('div');
    Rendu.rendreListeRoutines(c, routines, Object.assign({ catalogue: [] }, vue));
    return c;
  };
  const rangees = (c) => Array.from(c.querySelectorAll('.rl-rangee')).map((b) => (b.dataset.dossier || '') + '|' + b.textContent);

  test('sous l’en-tête de chaque dossier relisible ; aucune pour un dossier que la vue dit sans routine active, ni pour « Sans dossier »', () => {
    const appels = [];
    const c = liste([routine('a', 'A', 'Sèche'), routine('b', 'B', 'Vieux'), routine('c', 'C', null)],
      { surRelire: (d) => appels.push(d), relirable: (d) => d !== 'Vieux' });
    expect(rangees(c)).toEqual(['Sèche|Le coach relit ce dossier ›']);
    // Juste sous l'en-tête de « Sèche ».
    const r = c.querySelector('.rl-rangee');
    expect(r.previousElementSibling.getAttribute('data-dossier')).toBe('Sèche');
    r.click();
    expect(appels).toEqual(['Sèche']);
  });

  test('sans aucun dossier : UNE rangée, « Le coach relit ta semaine », juste après « Retrouver mes séances qui reviennent »', () => {
    const appels = [];
    const c = liste([routine('a', 'A', null), routine('b', 'B', null)],
      { surRelire: (d) => appels.push(d), relirable: () => true, surRetrouver() {} });
    expect(rangees(c)).toEqual(['|Le coach relit ta semaine ›']);
    expect(c.querySelector('.rl-rangee').previousElementSibling.classList.contains('retrouver-seances')).toBe(true);
    c.querySelector('.rl-rangee').click();
    expect(appels).toEqual([null]);
  });

  test('pas de rangée sans routine, ni pendant qu’on range, ni sans le crochet', () => {
    expect(rangees(liste([], { surRelire() {}, relirable: () => true }))).toEqual([]);
    expect(rangees(liste([routine('a', 'A', 'Sèche')], { surRelire() {}, relirable: () => true, reorganiser: true }))).toEqual([]);
    expect(rangees(liste([routine('a', 'A', 'Sèche')], { relirable: () => true }))).toEqual([]);
    expect(rangees(liste([routine('a', 'A', 'Sèche')], { surRelire() {}, relirable: () => false }))).toEqual([]);
  });
});
