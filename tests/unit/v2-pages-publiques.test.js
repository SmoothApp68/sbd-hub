/** @jest-environment node */
// 19/11/2026 — les pages PUBLIQUES de politique (Garmin, Google Play) : même source que l'app, sans compte, lien à la connexion.
const fs = require('fs');
const path = require('path');
const M = require('../../v2/js/mentions.js');
const G = require('../../v2-atelier/outils/pages-publiques.js');
const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');
const decoder = (h) => h.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

describe('pages publiques', () => {
  test('les fichiers commités sont exactement ce que le script produit (une seule source : THMentions.pages)', () => {
    G.PAGES.forEach((p) => expect([p.chemin, lire(p.chemin + '.html')]).toEqual([p.chemin, G.fabriquer(p.chemin)]));
  });
  test('chaque page sert le texte de l’écran du Profil, bloc par bloc', () => {
    G.PAGES.forEach((p) => {
      const html = lire(p.chemin + '.html');
      M.page(p.cle).blocs.forEach((b) => {
        expect(decoder(html)).toContain(b.texte);
        if (b.titre) expect(decoder(html)).toContain(b.titre);
      });
    });
  });
  test('lisibles sans compte : aucun script, aucune dépendance à l’app, CSP fermée', () => {
    G.PAGES.forEach((p) => {
      const html = lire(p.chemin + '.html');
      expect(html).not.toMatch(/<script/i);
      expect(html).toMatch(/default-src 'none'/);
      expect(html).toMatch(/font-src 'self'/);   // les polices de styles.css, sinon le texte retombe sur la police du système
      expect(html).toContain('<link rel="canonical" href="' + G.RACINE + '/' + p.chemin + '">');
    });
  });
  test('adresses stables : /confidentialite et /mentions-legales', () => {
    expect(G.PAGES.map((p) => p.chemin)).toEqual(expect.arrayContaining(['confidentialite', 'mentions-legales']));
  });
  test('la ligne contact reste cachée tant qu’elle vaut le marqueur', () => {
    expect(lire('mentions-legales.html')).not.toMatch(/Contact|COMPLÉTER/);
  });
  test('le service worker ne met pas ces pages en cache et les laisse au réseau (coquille inchangée)', () => {
    const SW = require('../../v2/service-worker.js');
    expect(SW.SHELL.join(' ')).not.toMatch(/confidentialite|mentions-legales|sante/);
    G.PAGES.forEach((p) => { expect(SW.PAGES_PUBLIQUES.has('/' + p.chemin)).toBe(true); expect(SW.PAGES_PUBLIQUES.has('/' + p.chemin + '.html')).toBe(true); });
  });
});

describe('bloc Garmin', () => {
  test('marqué « à venir » tant que la fonction n’existe pas, avec tout ce qui est promis', () => {
    expect(M.GARMIN_OUVERT).toBe(false);
    const t = JSON.stringify(M.page('confidentialite').blocs);
    ['fonction à venir', 'n’existe pas encore', 'fréquence cardiaque moyenne et maximale', 'consentement explicite', 'article 9',
     'Aucune revente', 'Aucun entraînement d’IA', 'depuis le Profil', 'eu-west-1'].forEach((m) => expect(t).toContain(m));
  });
});

describe('lien depuis la connexion', () => {
  test('index.html porte la ligne, le rendu pose Confidentialité et Mentions légales, app.js la câble', () => {
    expect(lire('index.html')).toMatch(/id="entree-legal"/);
    expect(lire('js/rendu.js')).toMatch(/\['confidentialite', 'Confidentialité'\], \['mentions', 'Mentions légales'\]/);
    expect(lire('js/app.js')).toMatch(/legal: \$\('entree-legal'\)/);
  });
});
