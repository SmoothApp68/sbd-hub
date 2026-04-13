// tests/data/db.test.js
import { defaultDB, saveDBNow } from '../../js/data/db.js';

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
  const dbInstance = defaultDB();
  expect(dbInstance).toHaveProperty('user');
  expect(dbInstance).toHaveProperty('logs');
  expect(dbInstance.user).toHaveProperty('name');
  expect(dbInstance.user.level).toBe('intermediaire');
});

test('saveDBNow sauvegarde dans localStorage', () => {
  localStorageMock.clear();
  saveDBNow();
  expect(localStorageMock.getItem('SBD_HUB')).not.toBeNull();
});