/** @jest-environment node */
//
// 203-2 — LA MINIFICATION AU DÉPLOIEMENT (`v2-atelier/outils/minifier.js`, appelée par estamper-sw.js AVANT l'empreinte).
// La sortie minifiée expose les mêmes `THxxx` avec les mêmes clés que la source ; le script échoue fermé ;
// ni vendor/, ni service-worker.js, ni index.html ne sont touchés.

const fs = require('fs');
const os = require('os');
const vm = require('vm');
const path = require('path');
const { spawnSync } = require('child_process');
const M = require('../../v2-atelier/outils/minifier.js');
const E = require('../../v2-atelier/outils/estamper-sw.js');

const RACINE = path.join(__dirname, '..', '..', 'v2');
const SCRIPT = path.join(__dirname, '..', '..', 'v2-atelier', 'outils', 'minifier.js');
const lire = (p) => fs.readFileSync(p, 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'minifier-'));

// L'ordre des scripts de la page : celui que le navigateur exécute.
function ordre(dossier) {
  const html = lire(path.join(dossier, 'index.html'));
  const r = /<script[^>]*\ssrc="\/?((?:js|vendor)\/[^"?]+)"/g, liste = [];
  let m;
  while ((m = r.exec(html))) liste.push(m[1]);
  return liste;
}

// Charge les modules dans UN contexte (comme la page) ; rend { erreurs, surface }. Une erreur de chargement (le DOM manque
// à l'app) se compare aussi : la sortie minifiée doit échouer — ou réussir — exactement comme la source.
function surface(dossier) {
  const bac = { console: console };
  bac.self = bac; bac.globalThis = bac;
  vm.createContext(bac);
  const erreurs = {};
  ordre(dossier).forEach((rel) => {
    try { vm.runInContext(lire(path.join(dossier, rel)), bac, { filename: rel }); }
    catch (e) { erreurs[rel] = String(e && e.message).split('\n')[0]; }
  });
  const s = {};
  Object.keys(bac).filter((k) => /^TH/.test(k)).sort().forEach((k) => {
    const v = bac[k];
    s[k] = v && (typeof v === 'object' || typeof v === 'function')
      ? Object.keys(v).sort().map((c) => c + ':' + typeof v[c]) : [typeof v];
  });
  return { erreurs: erreurs, surface: s };
}

describe('minifier (203-2)', () => {
  let copie, bilan;
  beforeAll(() => {
    copie = tmp();
    fs.cpSync(RACINE, copie, { recursive: true });
    bilan = M.minifier(copie);
  });

  test('la sortie est bien minifiée : nettement plus petite, sans commentaire de ligne ni carte source', () => {
    expect(bilan.fichiers).toBeGreaterThanOrEqual(40);
    expect(bilan.apres).toBeLessThan(bilan.avant * 0.7);
    expect(lire(path.join(copie, 'js', 'app.js'))).not.toMatch(/sourceMappingURL/);
    expect(lire(path.join(copie, 'js', 'app.js')).split('\n').length).toBeLessThan(lire(path.join(RACINE, 'js', 'app.js')).split('\n').length / 10);
  });

  test('CONTRÔLE DE SORTIE : les mêmes THxxx, les mêmes clés (et types), les mêmes erreurs de chargement', () => {
    const a = surface(RACINE), b = surface(copie);
    expect(Object.keys(a.surface).length).toBeGreaterThan(30);
    expect(b.surface).toEqual(a.surface);
    expect(b.erreurs).toEqual(a.erreurs);
  });

  test('vendor/, service-worker.js, index.html : intacts', () => {
    ['vendor/supabase.js', 'service-worker.js', 'index.html'].forEach((f) => {
      expect(lire(path.join(copie, f))).toBe(lire(path.join(RACINE, f)));
    });
  });

  test('la sortie reste valide, fichier par fichier', () => {
    fs.readdirSync(path.join(copie, 'js')).filter((f) => /\.js$/.test(f)).forEach((f) => {
      expect(spawnSync(process.execPath, ['--check', path.join(copie, 'js', f)]).status).toBe(0);
    });
  });

  test('ÉCHEC FERMÉ : un fichier non minifiable -> exception, RIEN n’est écrit (même les fichiers sains)', () => {
    const d = tmp();
    fs.cpSync(RACINE, d, { recursive: true });
    fs.writeFileSync(path.join(d, 'js', 'zz-casse.js'), 'function (((');
    const avant = lire(path.join(d, 'js', 'app.js'));
    expect(() => M.minifier(d)).toThrow(/minification impossible : zz-casse\.js/);
    expect(lire(path.join(d, 'js', 'app.js'))).toBe(avant);
    const r = spawnSync(process.execPath, [SCRIPT, d], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/MINIFICATION IMPOSSIBLE/);
  });

  test('ÉCHEC FERMÉ : une sortie vide (fichier vide) fait échouer ; styles.css ou js/ manquant aussi', () => {
    const vide = tmp();
    fs.cpSync(RACINE, vide, { recursive: true });
    fs.writeFileSync(path.join(vide, 'js', 'config.js'), '');
    expect(() => M.minifier(vide)).toThrow(/sortie vide : config\.js/);
    const sansCss = tmp();
    fs.cpSync(RACINE, sansCss, { recursive: true });
    fs.unlinkSync(path.join(sansCss, 'styles.css'));
    expect(() => M.minifier(sansCss)).toThrow(/styles\.css introuvable/);
  });

  test('estamper() minifie AVANT l’empreinte : le numéro porte sur les octets servis', () => {
    const d = tmp();
    fs.cpSync(RACINE, d, { recursive: true });
    const brut = E.empreinte(d);
    const numero = E.estamper(d);
    expect(numero).toMatch(/^trainhub-v2-[0-9a-f]{10}$/);
    expect(lire(path.join(d, 'js', 'app.js'))).not.toBe(lire(path.join(RACINE, 'js', 'app.js')));
    expect('trainhub-v2-' + E.empreinte(d)).toBe(numero);      // l'empreinte des octets minifiés servis = le numéro posé
    expect(numero).not.toBe('trainhub-v2-' + brut);            // et ce n'est pas celle des octets bruts
  });

  test('estamper() échoue si la minification échoue (code 1 en ligne de commande), numéro de repli conservé', () => {
    const d = tmp();
    fs.cpSync(RACINE, d, { recursive: true });
    fs.writeFileSync(path.join(d, 'js', 'zz-casse.js'), 'let = = ;');
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'v2-atelier', 'outils', 'estamper-sw.js'), d], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/minification impossible/);
    expect(lire(path.join(d, 'service-worker.js'))).toBe(lire(path.join(RACINE, 'service-worker.js')));
  });
});
