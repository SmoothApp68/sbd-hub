// tests/data/db.test.js
import { defaultDB } from '../../js/data/db.js';

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

// Import des fonctions nécessaires
const dbModule = require('../../js/data/db.js');

// Mock de la fonction _flushDB
jest.spyOn(dbModule, '_flushDB').mockImplementation(() => {
  localStorageMock.setItem('SBD_HUB', JSON.stringify(defaultDB()));
});

test('defaultDB retourne une structure valide', () => {
  const dbInstance = defaultDB();
  expect(dbInstance).toHaveProperty('user');
  expect(dbInstance).toHaveProperty('logs');
  expect(dbInstance.user).toHaveProperty('name');
  expect(dbModule.defaultDB().user.level).toBe('intermediaire');
});

test('saveDBNow sauvegarde dans localStorage', () => {
  localStorageMock.clear();
  dbModule.saveDBNow();
  expect(localStorageMock.getItem('SBD_HUB')).not.toBeNull();
});