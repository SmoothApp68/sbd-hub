//
// Les routines ont un magasin local (`cache.js`, VERSION 9) : à froid sans réseau, on démarre depuis la copie du téléphone.
// Voir `v2-seance-hors-reseau.test.js` pour le défaut. Environnement jsdom (rendu.js).
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/rendu.js');
require('../../v2/js/routines.js');
const { bac } = require('./aide-bac-app.js');
const ligneRoutine = (id, nom) => ({ id, nom, dossier: null, rang: 1, routine_exercises: [] });
const boutons = (c) => Array.from(c.querySelectorAll('button')).map((b) => b.textContent.trim());

describe('à froid, sans réseau, AVEC la copie du téléphone', () => {
  // `chargerRoutines` réel : le réseau échoue, la copie locale sert.
  function chargement(gardees, reseau) {
    const vrais = {
      routines: [], etatRoutines: { code: 'jamais', message: '' }, generationRoutines: 0, derniereLectureRoutines: 0,
      routinesDuTelephone: false, verificationSeance: null,
      routinesPretes: () => true, relireLaSeanceAvecLesRoutines: () => {},
      normaliserRoutine: (r) => r, texteErreur: (e) => String(e.message || e), console: { warn: () => {} },
      Donnees: { mesRoutines: reseau },
      Cache: { lireTout: async (m) => (m === 'routines' ? gardees.slice() : []), remplacerTout: async (m, l) => { gardees.length = 0; l.forEach((x) => gardees.push(x)); } }
    };
    const f = bac(vrais, ['chargerRoutines', 'memoriserLesRoutines', 'routinesDeLAppareil']);
    return { f, vrais };
  }
  test('le réseau échoue : les routines viennent du téléphone, l’état est « ok », « Démarrer » existe', async () => {
    const gardees = [ligneRoutine('r1', 'Haut A')];
    const { f, vrais } = chargement(gardees, async () => { throw new Error('Failed to fetch'); });
    expect(await f.chargerRoutines()).toBe(true);
    expect(vrais.routines.map((r) => r.nom)).toEqual(['Haut A']);
    expect(vrais.etatRoutines.code).toBe('ok');
    expect(vrais.routinesDuTelephone).toBe(true);
    document.body.innerHTML = '<div id="c"></div>';
    window.THRendu.rendreListeRoutines(document.getElementById('c'), vrais.routines, { surDemarrer: () => {}, surSeanceVide: () => {}, catalogue: [] });
    expect(boutons(document.getElementById('c')).some((t) => /^Démarrer/.test(t))).toBe(true);
  });
  test('le réseau répond : la copie est REMPLACÉE par la lecture fraîche', async () => {
    const gardees = [ligneRoutine('vieille', 'Ancienne')];
    const { f, vrais } = chargement(gardees, async () => [ligneRoutine('r2', 'Bas B')]);
    expect(await f.chargerRoutines()).toBe(true);
    expect(vrais.routinesDuTelephone).toBe(false);
    expect(gardees.map((r) => r.id)).toEqual(['r2']);
  });
  test('ni réseau ni copie : échec, comme avant', async () => {
    const { f, vrais } = chargement([], async () => { throw new Error('Failed to fetch'); });
    expect(await f.chargerRoutines()).toBe(false);
    expect(vrais.etatRoutines.code).toBe('echec');
  });
});

describe('cache.js : le magasin `routines`', () => {
  const CACHE = fs.readFileSync(path.join(__dirname, '../../v2/js/cache.js'), 'utf8');
  test('VERSION 9, créé à la migration, et listé dans MAGASINS (donc vidé par « Quitter » et par le changement de compte)', () => {
    expect(CACHE).toMatch(/var VERSION = 9;/);
    expect(CACHE).toMatch(/createObjectStore\('routines', \{ keyPath: 'id' \}\)/);
    expect(/var MAGASINS = \[([^\]]*)\]/.exec(CACHE)[1]).toMatch(/'routines'/);
  });
  test('la coquille du service worker porte cache.js', () => {
    expect(fs.readFileSync(path.join(__dirname, '../../v2/service-worker.js'), 'utf8')).toMatch(/'\.\/js\/cache\.js'/);
  });
});
