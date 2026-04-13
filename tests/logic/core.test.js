// tests/logic/core.test.js
import { calculateReadiness, getReadinessLoadAdjustment } from '../../js/logic/core.js';

// Test pour calculateReadiness
test('calculateReadiness retourne un score valide', () => {
  const score = calculateReadiness(8, 7, 6, 5); // sommeil, énergie, motivation, courbatures
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);
});

test('calculateReadiness retourne 100 pour des valeurs maximales', () => {
  const score = calculateReadiness(10, 10, 10, 1); // max sommeil/énergie/motivation, min courbatures
  expect(score).toBe(100);
});

// Test pour getReadinessLoadAdjustment
test('getReadinessLoadAdjustment retourne 1.03 pour un score >= 90', () => {
  const adj = getReadinessLoadAdjustment(90);
  expect(adj).toBe(1.03);
});

test('getReadinessLoadAdjustment retourne 0.80 pour un score < 40', () => {
  const adj = getReadinessLoadAdjustment(30);
  expect(adj).toBe(0.80);
});

// Note : Pour tester getRoutine, il faudrait mocker db et les constantes.