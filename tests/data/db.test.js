// tests/data/db.test.js
import { defaultDB, loadDB, saveDB, saveDBNow } from '../../js/data/db.js';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    clear: () => { store = {}; }
  };
})();
global.localStorage = localStorageMock;

// Test pour defaultDB
test('defaultDB retourne une structure valide', () => {
  const db = defaultDB();
  expect(db).toHaveProperty('user');
  expect(db).toHaveProperty('logs');
  expect(db.user).toHaveProperty('name');
  expect(db.user.level).toBe('intermediaire');
});

// Test pour loadDB
test('loadDB retourne defaultDB si localStorage est vide', () => {
  localStorageMock.clear();
  const db = loadDB();
  expect(db.user.level).toBe('intermediaire');
});

// Test pour saveDB
test('saveDB sauvegarde dans localStorage', () => {
  localStorageMock.clear();
  const db = defaultDB();
  // Simuler l'import de db dans le module (pour éviter la circularité)
  const { saveDBNow } = require('../../js/data/db.js');
  saveDBNow();
  expect(localStorageMock.getItem('SBD_HUB')).not.toBeNull();
});