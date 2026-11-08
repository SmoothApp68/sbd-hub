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
