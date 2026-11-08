/** @jest-environment node */
//
// 271 — L'ANIMATION DU MOUVEMENT (page d'un exercice, onglet « Comment faire ») : les fichiers servis.
//
// three.js r128 et son GLTFLoader sont versés tels quels depuis le paquet npm three@0.128.0 (build/three.min.js,
// examples/js/loaders/GLTFLoader.js) : leur empreinte est figée ici, comme celle du SDK Supabase — changer une
// bibliothèque est un geste conscient. Le corps (corps-glb.json) est le modèle Z-Anatomy adapté (CC BY-SA 4.0),
// sans texture ni compression meshopt : rien à décoder en WASM, rien à charger en blob:.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const V2 = path.join(__dirname, '../../v2');
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(V2, f))).digest('hex');

describe('271 — les bibliothèques du mouvement (vendor/)', () => {
  test('three.js r128 et GLTFLoader : les octets du paquet three@0.128.0, au bit près', () => {
    expect(sha256('vendor/three.min.js')).toBe('9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2');
    expect(sha256('vendor/GLTFLoader.js')).toBe('5c15967ba830918a9caea6338712c994c354bccd4edc4569bde411c3ec06a3e6');
  });
  test('la licence MIT accompagne le code (le fichier de licence, et l’en-tête @license de three.min.js conservé)', () => {
    expect(fs.readFileSync(path.join(V2, 'vendor/LICENSE-three.txt'), 'utf8')).toMatch(/The MIT License[\s\S]*three\.js authors/);
    expect(fs.readFileSync(path.join(V2, 'vendor/three.min.js'), 'utf8').slice(0, 200))
      .toMatch(/@license[\s\S]{0,80}Three\.js Authors[\s\S]{0,40}MIT/);
  });
  test('⚠️ index.html ne charge jamais three.js : il est injecté à la demande (THREE commence par « TH »)', () => {
    const index = fs.readFileSync(path.join(V2, 'index.html'), 'utf8');
    expect(index).not.toMatch(/three|GLTFLoader|meshopt/i);
  });
});

describe('271 — le corps et les exercices (mouvements/)', () => {
  const fichiers = fs.readdirSync(path.join(V2, 'mouvements'));

  test('le corps : un glb en base64, sans texture, sans extension à décoder hors quantification', () => {
    const j = JSON.parse(fs.readFileSync(path.join(V2, 'mouvements/corps-glb.json'), 'utf8'));
    const b = Buffer.from(j.b64, 'base64');
    expect(b.slice(0, 4).toString()).toBe('glTF');
    const gltf = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
    expect(gltf.images).toBeUndefined();
    expect(gltf.textures).toBeUndefined();
    expect(gltf.extensionsRequired || []).toEqual(['KHR_mesh_quantization']);
    expect(gltf.asset.copyright).toMatch(/Z-Anatomy[\s\S]*CC BY-SA 4\.0/);
  });

  test('chaque exercice : format 8, clé = nom du fichier, AUCUN muscle (ils viennent du catalogue de l’app)', () => {
    const ex = fichiers.filter((f) => f !== 'corps-glb.json');
    expect(ex.length).toBeGreaterThan(0);
    ex.forEach((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(V2, 'mouvements', f), 'utf8'));
      expect([f, j.format, j.cle]).toEqual([f, 'trainhub-mouvement/8', f.replace(/\.json$/, '')]);
      expect([f, 'muscles' in j, 'roles' in j]).toEqual([f, false, false]);
      expect([f, j.images.length]).toEqual([f, j.boucle.N]);
    });
  });
});

describe('271 — le module de l’app (js/mouvement.js) : le catalogue et les muscles', () => {
  const M = require('../../v2/js/mouvement.js');
  const Semaine = require('../../v2/js/semaine.js');
  const exos = fs.readdirSync(path.join(V2, 'mouvements')).filter((f) => f !== 'corps-glb.json');

  test('chaque slug du CATALOGUE a son JSON, et aucun JSON n’est orphelin', () => {
    const inscrits = Object.keys(M.CATALOGUE).map((s) => M.CATALOGUE[s]).sort();
    expect(inscrits).toEqual(exos.slice().sort());
    Object.keys(M.CATALOGUE).forEach((s) => expect([s, M.CATALOGUE[s]]).toEqual([s, s + '.json']));
  });

  test('existe / url : une clé du catalogue, rien d’autre (pas de prototype, pas de devinette)', () => {
    expect(M.existe('squat_barre')).toBe(true);
    expect(M.url('squat_barre')).toBe('/mouvements/squat_barre.json');
    ['toString', 'constructor', '__proto__', 'squat', '', null, undefined, 42].forEach((x) => {
      expect([x, M.existe(x), M.url(x)]).toEqual([x, false, null]);
    });
  });

  test('⚠️ chaque clé de muscle de l’app (Semaine.LIBELLES_MUSCLE) a sa table vers le corps 3D, et rien de plus', () => {
    expect(Object.keys(M.MUSCLES_APP).sort()).toEqual(Object.keys(Semaine.LIBELLES_MUSCLE).sort());
    const corps = JSON.parse(fs.readFileSync(path.join(V2, 'mouvements/corps-glb.json'), 'utf8'));
    const b = Buffer.from(corps.b64, 'base64');
    const groupes = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString()).extras.muscles;
    Object.keys(M.MUSCLES_APP).forEach((k) => M.MUSCLES_APP[k].forEach((g) => expect([k, g, groupes.indexOf(g) >= 0]).toEqual([k, g, true])));
  });

  test('les libellés par défaut sont ceux de l’app (l’app passe les siens de toute façon)', () => {
    expect(M.commun.LIBELLES).toEqual(Semaine.LIBELLES_MUSCLE);
  });

  test('les rôles se lisent sur le catalogue ; une clé inconnue n’est jamais devinée', () => {
    const r = M.rolesDuCatalogue({ primaires: ['quadriceps', 'fessiers'], secondaires: [], stabilisateurs: ['bas_du_dos', 'jambes'] });
    expect(r.roles).toEqual({ prim: ['quadriceps', 'fessiers'], sec: [], stab: ['bas_du_dos'] });
    expect(r.inconnues).toEqual(['jambes']);
    expect(M.rolesDuCatalogue(null).roles).toEqual({ prim: [], sec: [], stab: [] });
  });

  test('aucun innerHTML, aucun attribut style, aucun console : les styles sont des classes de styles.css', () => {
    const src = fs.readFileSync(path.join(V2, 'js/mouvement.js'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(src).not.toMatch(/\.style\s*(\.|\[|=(?!=))|setAttribute\(\s*['"]style/);
    expect(src).not.toMatch(/console\./);
    const css = fs.readFileSync(path.join(V2, 'styles.css'), 'utf8');
    ['.exo-mouvement', '.thm-vue', '.thm-canevas', '.thm-fige', '.thm-btn', '.thm-leg', '.thm-annonce'].forEach((c) => expect([c, css.indexOf(c) >= 0]).toEqual([c, true]));
  });

  test('index.html le charge avant rendu.js ; la coquille le garde ; rien d’autre du mouvement n’y entre', () => {
    const index = fs.readFileSync(path.join(V2, 'index.html'), 'utf8');
    expect(index.indexOf('/js/mouvement.js')).toBeGreaterThan(0);
    expect(index.indexOf('/js/mouvement.js')).toBeLessThan(index.indexOf('/js/rendu.js'));
    const SW = require('../../v2/service-worker.js');
    expect(SW.SHELL).toContain('./js/mouvement.js');
    expect(SW.SHELL.filter((f) => /mouvements\/|three|GLTF/.test(f))).toEqual([]);
  });

  test('⚠️ la CSP n’a pas bougé pour le mouvement : ni wasm, ni eval, ni blob:', () => {
    const index = fs.readFileSync(path.join(V2, 'index.html'), 'utf8');
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(index)[1];
    expect(csp).not.toMatch(/wasm-unsafe-eval|unsafe-eval|unsafe-inline|blob:/);
    expect(csp).toMatch(/img-src 'self' data:;/);   // l'image figée de la vue est un toDataURL
  });
});
