/** @jest-environment node */
//
// 134 — L'iPhone, la partie technique (audit iPhone du 21/10/2026). Les gardes de la coquille et des styles.

const fs = require('fs');
const path = require('path');

const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2', f), 'utf8');
const css = lire('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
const regle = (sel) => {
  const re = new RegExp('(?:^|})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = css.match(re);
  return m ? m[1] : null;
};

describe('I-09 — le bas des feuilles laisse la place à la barre d’accueil', () => {
  test('⚠️ DISCRIMINANT — `.voile` : padding-bottom = max(l’actuel, env(safe-area-inset-bottom))', () => {
    const r = regle('.voile');
    expect(r).not.toBeNull();
    expect(r).toMatch(/padding:var\(--e4\)/);
    expect(r).toMatch(/padding-bottom:\s*max\(\s*var\(--e4\)\s*,\s*env\(safe-area-inset-bottom\s*,\s*0px\)\s*\)/);
  });

  test('la navigation du bas l’avait déjà', () => {
    expect(regle('.onglets')).toMatch(/env\(safe-area-inset-bottom/);
  });
});

describe('I-15, I-16, I-19 — l’icône, la barre d’état, le nom', () => {
  const html = lire('index.html');
  const manifeste = JSON.parse(lire('manifest.webmanifest'));
  const meta = (nom) => { const m = html.match(new RegExp('<meta name="' + nom + '" content="([^"]*)"')); return m && m[1]; };

  test('⚠️ DISCRIMINANT — `apple-touch-icon` : 180 × 180, opaque, posée sur le fond de l’app', () => {
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/);
    const png = fs.readFileSync(path.join(__dirname, '../../v2/icons/apple-touch-icon.png'));
    expect(png.slice(1, 4).toString()).toBe('PNG');
    // IHDR : largeur, hauteur, puis le type de couleur — 2 (RGB) : aucune couche alpha, donc aucun coin transparent.
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
    expect(png[25]).toBe(2);
  });

  test('la barre d’état opaque et sombre (`black`, jamais `black-translucent`), le mode installé, le nom', () => {
    expect(meta('apple-mobile-web-app-capable')).toBe('yes');
    expect(meta('apple-mobile-web-app-status-bar-style')).toBe('black');
    expect(meta('apple-mobile-web-app-title')).toBe('TrainHub');
  });

  test('le manifeste s’appelle « TrainHub », sans le jalon « v2 »', () => {
    expect(manifeste.name).toBe('TrainHub');
    expect(manifeste.short_name).toBe('TrainHub');
    expect(manifeste.description).not.toMatch(/v2|Socle/);
  });

  test('⚠️ la nouvelle icône est dans la coquille du service worker (hors ligne, l’écran d’accueil la garde)', () => {
    expect(lire('service-worker.js')).toMatch(/'\.\/icons\/apple-touch-icon\.png'/);
  });
});
