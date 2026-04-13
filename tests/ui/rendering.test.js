// tests/ui/rendering.test.js
import { showToast, showModal } from '../../js/ui/rendering.js';

// Nettoie le DOM avant chaque test
beforeEach(() => {
  document.body.innerHTML = '';
});

test('showToast ajoute un toast au DOM', () => {
  showToast('Test message');
  const toast = document.querySelector('.toast');
  expect(toast).not.toBeNull();
  expect(toast.textContent).toBe('Test message');
});

test('showModal ajoute une modale au DOM', () => {
  showModal('Test modal', 'OK', 'var(--green)', () => {}, 'Annuler');
  const modal = document.querySelector('.modal-overlay');
  expect(modal).not.toBeNull();
  expect(modal.querySelector('.modal-box').textContent).toContain('Test modal');
});