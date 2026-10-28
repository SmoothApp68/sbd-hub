/** @jest-environment node */
//
// 178 (diagnostic 172) — LE NUMÉRO DE CACHE ESTAMPÉ AU DÉPLOIEMENT (`v2-atelier/outils/estamper-sw.js`).
// Le numéro est une empreinte de ce que la coquille (`SHELL`) sert : stable si rien ne change, différent dès
// qu'un octet d'un fichier de la coquille (ou du service worker) change, indifférent à ce qui est hors coquille.
// Et le script ÉCHOUE FERMÉ : littéral absent ou doublé, SHELL introuvable, fichier de la coquille manquant.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const E = require('../../v2-atelier/outils/estamper-sw.js');

const SCRIPT = path.join(__dirname, '..', '..', 'v2-atelier', 'outils', 'estamper-sw.js');
const SW_MODELE = [
  "// service worker de test",
  "const CACHE_V2 = 'trainhub-v2-repli';",
  'const SHELL = [',
  "  './',",
  "  './index.html',",
  '  // un commentaire avec \'./faux.js\' entre guillemets',
  "  './js/a.js',",
  "  './js/b.js'",
  '];',
  'self.x = 1;',
  ''
].join('\n');

function dossier(extra) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'estamper-'));
  fs.mkdirSync(path.join(d, 'js'));
  fs.writeFileSync(path.join(d, 'service-worker.js'), SW_MODELE);
  fs.writeFileSync(path.join(d, 'index.html'), '<html>accueil</html>');
  fs.writeFileSync(path.join(d, 'js', 'a.js'), 'var a = 1;');
  fs.writeFileSync(path.join(d, 'js', 'b.js'), 'var b = 2;');
  fs.writeFileSync(path.join(d, 'hors-coquille.txt'), 'rien');
  if (extra) extra(d);
  return d;
}
const lire = (d) => fs.readFileSync(path.join(d, 'service-worker.js'), 'utf8');
const numeroDe = (d) => (/const CACHE_V2 = '([^']*)';/.exec(lire(d)) || [])[1];

describe('estamper-sw (178)', () => {
  test('la coquille est lue dans SHELL, commentaires écartés', () => {
    expect(E.coquilleDe(SW_MODELE)).toEqual(['./', './index.html', './js/a.js', './js/b.js']);
  });

  test('empreinte stable : deux dossiers au même contenu, même numéro ; relancer ne change rien', () => {
    const d1 = dossier(), d2 = dossier();
    expect(E.empreinte(d1)).toBe(E.empreinte(d2));
    const n = E.estamper(d1);
    expect(n).toMatch(/^trainhub-v2-[0-9a-f]{10}$/);
    expect(numeroDe(d1)).toBe(n);
    expect(E.estamper(d1)).toBe(n);   // idempotent : le numéro posé n'entre pas dans l'empreinte
  });

  test('DISCRIMINANT : un octet change dans un fichier de la coquille -> un autre numéro', () => {
    const d = dossier(), avant = E.empreinte(d);
    fs.writeFileSync(path.join(d, 'js', 'a.js'), 'var a = 2;');
    expect(E.empreinte(d)).not.toBe(avant);
  });

  test('DISCRIMINANT : la page d’accueil (« ./ ») et le code du service worker comptent aussi', () => {
    const d = dossier(), avant = E.empreinte(d);
    fs.writeFileSync(path.join(d, 'index.html'), '<html>autre</html>');
    const apresPage = E.empreinte(d);
    expect(apresPage).not.toBe(avant);
    fs.writeFileSync(path.join(d, 'service-worker.js'), lire(d).replace('self.x = 1;', 'self.x = 2;'));
    expect(E.empreinte(d)).not.toBe(apresPage);
  });

  test('un fichier hors coquille ne change pas le numéro', () => {
    const d = dossier(), avant = E.empreinte(d);
    fs.writeFileSync(path.join(d, 'hors-coquille.txt'), 'autre chose');
    fs.writeFileSync(path.join(d, 'nouveau.js'), 'x');
    expect(E.empreinte(d)).toBe(avant);
  });

  test('échec fermé : littéral CACHE_V2 absent, doublé, ou reformaté', () => {
    const sans = dossier((d) => fs.writeFileSync(path.join(d, 'service-worker.js'), SW_MODELE.replace(/const CACHE_V2 = .*\n/, '')));
    expect(() => E.empreinte(sans)).toThrow(/exactement une fois/);
    const double = dossier((d) => fs.writeFileSync(path.join(d, 'service-worker.js'), SW_MODELE + "const CACHE_V2 = 'b';\n"));
    expect(() => E.empreinte(double)).toThrow(/exactement une fois/);
    const guillemets = dossier((d) => fs.writeFileSync(path.join(d, 'service-worker.js'), SW_MODELE.replace("'trainhub-v2-repli'", '"trainhub-v2-repli"')));
    expect(() => E.estamper(guillemets)).toThrow(/exactement une fois/);
  });

  test('échec fermé : SHELL introuvable, ou fichier de la coquille manquant ; rien n’est écrit', () => {
    const sansShell = dossier((d) => fs.writeFileSync(path.join(d, 'service-worker.js'), SW_MODELE.replace('const SHELL', 'const AUTRE')));
    expect(() => E.estamper(sansShell)).toThrow(/SHELL/);
    const manque = dossier((d) => fs.unlinkSync(path.join(d, 'js', 'b.js')));
    expect(() => E.estamper(manque)).toThrow(/manquant/);
    expect(numeroDe(manque)).toBe('trainhub-v2-repli');
  });

  test('en ligne de commande : code 0 et service worker valide ; code 1 si le littéral manque', () => {
    const d = dossier();
    const ok = spawnSync(process.execPath, [SCRIPT, d], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/SW estampillé : trainhub-v2-[0-9a-f]{10}/);
    expect(spawnSync(process.execPath, ['--check', path.join(d, 'service-worker.js')]).status).toBe(0);
    const cass = dossier((x) => fs.writeFileSync(path.join(x, 'service-worker.js'), SW_MODELE.replace(/const CACHE_V2 = .*\n/, '')));
    const ko = spawnSync(process.execPath, [SCRIPT, cass], { encoding: 'utf8' });
    expect(ko.status).toBe(1);
    expect(ko.stderr).toMatch(/ESTAMPILLE IMPOSSIBLE/);
  });

  test('le VRAI service worker du dépôt : littéral au format attendu, coquille complète, sortie valide', () => {
    const racine = path.join(__dirname, '..', '..', 'v2');
    const copie = fs.mkdtempSync(path.join(os.tmpdir(), 'estamper-reel-'));
    fs.cpSync(racine, copie, { recursive: true });
    const n = E.estamper(copie);
    expect(n).toMatch(/^trainhub-v2-[0-9a-f]{10}$/);
    expect(spawnSync(process.execPath, ['--check', path.join(copie, 'service-worker.js')]).status).toBe(0);
    expect(E.coquilleDe(lire(copie)).length).toBeGreaterThan(40);
    // le dépôt lui-même n'a pas été touché
    expect(fs.readFileSync(path.join(racine, 'service-worker.js'), 'utf8')).toMatch(/const CACHE_V2 = 'trainhub-v2-[^']+';/);
  });
});
