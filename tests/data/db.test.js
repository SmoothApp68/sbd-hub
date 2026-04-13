import { STORAGE_KEY } from '../../js/constants.js';
import { saveDBNow, loadDB, db } from '../../js/data/db.js';

// Création d'un mock propre que Jest peut suivre
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  removeItem: jest.fn()
};

// On l'attache proprement à l'objet global
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('Base de Données SBD Hub', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // On nettoie les compteurs entre chaque test
  });

  test('saveDBNow sauvegarde les données dans localStorage', () => {
    loadDB(); 
    db.user.name = "Test User"; 
    saveDBNow();

    // On vérifie sur notre objet localStorageMock directement
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY, 
      expect.stringContaining("Test User")
    );
  });
});