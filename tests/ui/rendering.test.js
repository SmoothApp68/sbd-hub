// tests/ui/rendering.test.js
import { showToast, showModal } from '../../js/ui/rendering.js';

// Mock document.body
const mockBody = document.createElement('div');
document.body = mockBody;

// Test pour showToast
test('showToast ajoute un toast au DOM', () => {
  showToast('Test message');
  const toast = document.querySelector('.toast');
  expect(toast).not.toBeNull();
  expect(toast.textContent).toBe('Test message');
  setTimeout(() => {
    expect(document.querySelector('.toast')).toBeNull();
  }, 3000); // Attend la suppression automatique
});

// Test pour showModal
test('showModal ajoute une modale au DOM', () => {
  showModal('Test modal', 'OK', 'var(--green)', () => {}, 'Annuler');
  const modal = document.querySelector('.modal-overlay');
  expect(modal).not.toBeNull();
  expect(modal.querySelector('.modal-box').textContent).toContain('Test modal');
});

// Note : Ces tests supposent un environnement DOM (comme Jest avec jsdom).
// Si tu utilises un autre framework, adapte les mocks en conséquence.