/** @jest-environment node */
//
// 59-1 — LA GARDE DE PUBLICATION : le dossier publié ne contient que l'app.
//
// Cloudflare Pages publie `v2/` EN ENTIER : tout fichier posé là est servi
// publiquement. Le relevé de sécurité 59-0 y a trouvé les specs (avec des
// données d'entraînement nominatives et le plan de la base), les maquettes et
// le banc. Ils vivent désormais dans `v2-atelier/`.
//
// Cette garde dit ce qui a le DROIT d'être dans `v2/` — une liste blanche, pas
// une liste noire : un fichier nouveau, quel qu'il soit, fait échouer le test
// avec son nom. L'élargir est un geste conscient, dans une PR qui le justifie.

const fs = require('fs');
const path = require('path');

const V2 = path.join(__dirname, '../../v2');

// Ce qui a le droit d'être publié : l'app, et rien d'autre.
const FICHIERS = ['index.html', 'service-worker.js', 'styles.css', 'manifest.webmanifest', '_headers', '_redirects'];
const DOSSIERS = {
  js: /^[a-z0-9-]+\.js$/,                         // l'app
  fonts: /^([a-z0-9-]+\.woff2|OFL\.txt)$/,        // les polices servies et leur licence
  vendor: /^supabase\.js$/,                       // le SDK, versé localement (aucun CDN)
  icons: /^icon-\d+\.png$/                        // les icônes du manifeste
};

function publiables(chemin) {
  const parts = chemin.split('/');
  if (parts.length === 1) return FICHIERS.indexOf(parts[0]) >= 0;
  if (parts.length === 2 && DOSSIERS[parts[0]]) return DOSSIERS[parts[0]].test(parts[1]);
  return false;
}

function tout(dossier, prefixe) {
  const out = [];
  fs.readdirSync(dossier, { withFileTypes: true }).forEach((e) => {
    const rel = prefixe ? prefixe + '/' + e.name : e.name;
    if (e.isDirectory()) {
      const dedans = tout(path.join(dossier, e.name), rel);
      // Un dossier vide se signale aussi : il n'a rien à faire là.
      if (!dedans.length) out.push(rel + '/');
      dedans.forEach((x) => out.push(x));
    } else out.push(rel);
  });
  return out;
}

describe('59-1 — le dossier publié ne contient que l’app', () => {
  const publies = tout(V2, '');

  test('⚠️ tout fichier de v2/ est sur la liste blanche — sinon il est nommé ici', () => {
    expect(publies.filter((f) => !publiables(f))).toEqual([]);
  });

  test('l’app est bien là (la liste blanche n’est pas vide par accident)', () => {
    FICHIERS.forEach((f) => expect([f, publies.indexOf(f) >= 0]).toEqual([f, true]));
    ['js/app.js', 'js/faits.js', 'vendor/supabase.js', 'icons/icon-192.png'].forEach((f) =>
      expect([f, publies.indexOf(f) >= 0]).toEqual([f, true]));
  });

  test('ni specs, ni maquettes, ni banc dans v2/ — ils vivent dans v2-atelier/', () => {
    ['specs', 'maquettes', 'banc'].forEach((d) => {
      expect([d, fs.existsSync(path.join(V2, d))]).toEqual([d, false]);
      expect([d, fs.existsSync(path.join(V2, '../v2-atelier', d))]).toEqual([d, true]);
    });
  });

  test('⚠️ le service worker ne met en cache que des fichiers de la liste, qui existent', () => {
    const src = fs.readFileSync(path.join(V2, 'service-worker.js'), 'utf8');
    const m = /const SHELL = \[([\s\S]*?)\];/.exec(src);
    expect(m).not.toBeNull();
    const sansCommentaires = m[1].split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const shell = (sansCommentaires.match(/'[^']*'/g) || []).map((x) => x.slice(1, -1));
    expect(shell.length).toBeGreaterThan(20);
    const fautes = shell.filter((e) => e !== './').map((e) => e.replace(/^\.\//, ''))
      .filter((f) => !publiables(f) || !fs.existsSync(path.join(V2, f)));
    expect(fautes).toEqual([]);
    // `_headers` et `_redirects` sont la configuration de l'hébergeur : jamais servis, jamais en cache.
    expect(shell.filter((e) => /_headers|_redirects/.test(e))).toEqual([]);
  });

  test('la garde voit vraiment un intrus', () => {
    expect(publiables('specs/MOTEUR-PROGRESSION-V2.md')).toBe(false);
    expect(publiables('maquettes/x.html')).toBe(false);
    expect(publiables('js/sous/x.js')).toBe(false);
    expect(publiables('js/notes.md')).toBe(false);
    expect(publiables('.DS_Store')).toBe(false);
    expect(publiables('js/app.js')).toBe(true);
  });
});

describe('59-1 — les en-têtes de sécurité (`v2/_headers`, Cloudflare Pages)', () => {
  const texte = fs.readFileSync(path.join(V2, '_headers'), 'utf8');
  const lignes = texte.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l));

  test('une seule règle, sur tous les chemins, et les cinq en-têtes', () => {
    expect(lignes[0]).toBe('/*');
    const entetes = lignes.slice(1).map((l) => l.trim());
    expect(entetes).toEqual([
      "Content-Security-Policy: frame-ancestors 'none'",
      'X-Frame-Options: DENY',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()'
    ]);
    // Cloudflare : un en-tête appartient à la règle qui le précède s'il est INDENTÉ.
    lignes.slice(1).forEach((l) => expect(/^\s+\S/.test(l)).toBe(true));
  });

  test('la CSP de la page reste dans index.html, telle quelle', () => {
    const index = fs.readFileSync(path.join(V2, 'index.html'), 'utf8');
    expect(index).toMatch(/<meta http-equiv="Content-Security-Policy"[\s\S]*default-src 'self'/);
  });

  test('l’app n’utilise aucune des permissions refusées (caméra, micro, position, paiement)', () => {
    const js = fs.readdirSync(path.join(V2, 'js')).map((f) => fs.readFileSync(path.join(V2, 'js', f), 'utf8')).join('\n');
    expect(js).not.toMatch(/getUserMedia|mediaDevices|geolocation|PaymentRequest/);
  });
});
