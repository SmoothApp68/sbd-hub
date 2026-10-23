/**
 * @jest-environment node
 */
// 144 — les petits restes : un test par point, dans l'ordre du prompt.
const fs = require('fs');
const path = require('path');
const racine = path.join(__dirname, '..', '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

describe('144-1 — le nom du produit', () => {
  test('l\'onglet dit « TrainHub », le manifeste aussi', () => {
    expect(lire('v2/index.html')).toMatch(/<title>TrainHub<\/title>/);
    const m = JSON.parse(lire('v2/manifest.webmanifest'));
    expect(m.name).toBe('TrainHub');
    expect(m.short_name).toBe('TrainHub');
  });
  test('CLAUDE.md nomme la cible iPhone', () => {
    expect(lire('CLAUDE.md')).toMatch(/Android Chrome et iPhone \(Safari, écran d'accueil\)/);
  });
});

describe('144-2 — la durée d\'une séance va jusqu\'à 300 min', () => {
  const Profil = require('../../v2/js/profil.js');
  test('210, 240 et 300 sont proposées, dans l\'ordre, dans la borne de la base', () => {
    [210, 240, 300].forEach((d) => expect(Profil.DUREES).toContain(d));
    expect(Profil.DUREES.slice().sort((a, b) => a - b)).toEqual(Profil.DUREES);
    expect(Math.max.apply(null, Profil.DUREES)).toBe(Profil.DUREE_MAX);
  });
});

describe('144-3 — la vidange de la file ne s\'arrête plus à 200', () => {
  const A = require('../../v2/js/attente.js');
  function fileDe(seances) {
    let f = [];
    for (let s = 0; s < seances; s++) {
      f = A.poser(f, { table: 'sessions', op: A.UPSERT, id: 'S' + s, creation: true, donnees: {} });
      f = A.poser(f, { table: 'sets', op: A.REMPLACER, id: 'S' + s, depend: 'S' + s, donnees: [] });
      for (let k = 0; k < 20; k++) {
        f = A.poser(f, { table: 'predictions', op: A.UPSERT, id: 'P' + s + '_' + k, depend: 'S' + s, donnees: {} });
        f = A.poser(f, { table: 'observations', op: A.OBSERVER, id: 'P' + s + '_' + k, depend: 'S' + s, alaFin: true, donnees: {} });
      }
    }
    return f;
  }
  // La boucle de `vidanger` (app.js), réseau parfait, avec la garde que l'app prend.
  function vidange(f) {
    let garde = A.gardeDeVidange(f.length), envoyees = 0;
    while (garde-- > 0) {
      const op = A.prochaine(f);
      if (!op) break;
      f = A.apresSucces(f, op);
      envoyees++;
    }
    return { f, envoyees };
  }
  test('630 entrées hors ligne, le réseau revient : tout part en UNE vidange', () => {
    const f = fileDe(15);
    expect(f.length).toBe(630);
    const r = vidange(f);
    expect(r.envoyees).toBe(630);
    expect(r.f.length).toBe(0);
  });
  test('la garde garde un plancher de 200 et grandit avec la file', () => {
    expect(A.gardeDeVidange(0)).toBe(200);
    expect(A.gardeDeVidange(undefined)).toBe(200);
    expect(A.gardeDeVidange(630)).toBe(1270);
  });
  test('app.js prend la garde de la file au départ, pas un 200 fixe', () => {
    const src = lire('v2/js/app.js');
    expect(src).toMatch(/var garde = Attente\.gardeDeVidange\(attente\.length\)/);
    expect(src).not.toMatch(/var garde = 200;/);
  });
});
