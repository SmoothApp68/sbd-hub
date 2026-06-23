// DÉFIS Lot A — _buildChallengeTemplate : mappe une métrique du picker vers le
// templateData attendu par createChallenge (système ouvert). Pur, vm-extrait.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('Could not extract ' + name);
  return m[0];
}

const ctx = {};
vm.createContext(ctx);
const mapSrc = APP.match(/var CHALLENGE_METRIC_MAP = \{[\s\S]*?\n\};/);
if (!mapSrc) throw new Error('CHALLENGE_METRIC_MAP not found');
vm.runInContext(mapSrc[0], ctx);
vm.runInContext(extractFn(APP, '_buildChallengeTemplate'), ctx);
const build = (k, d) => { ctx.__k = k; ctx.__d = d; return vm.runInContext('_buildChallengeTemplate(__k, __d)', ctx); };

describe('DÉFIS Lot A — _buildChallengeTemplate', () => {
  test('e1RM squat → type weight + target_exercise Squat, target null', () => {
    expect(build('squat_e1rm', 14)).toEqual({ label: 'e1RM Squat', type: 'weight', exercise: 'Squat', target: null, duration: 14 });
  });
  test('bench / dead → noms d\'exo cohérents', () => {
    expect(build('bench_e1rm', 30).exercise).toBe('Développé couché');
    expect(build('dead_e1rm', 30).exercise).toBe('Soulevé de terre');
    expect(build('bench_e1rm', 30).type).toBe('weight');
  });
  test('sessions → frequency (sans exercice) ; volume → volume', () => {
    expect(build('sessions', 7)).toMatchObject({ type: 'frequency', exercise: null, target: null });
    expect(build('volume', 7)).toMatchObject({ type: 'volume', exercise: null, target: null });
  });
  test('durée par défaut 7 si absente / invalide', () => {
    expect(build('volume').duration).toBe(7);
    expect(build('volume', 0).duration).toBe(7);
    expect(build('volume', -5).duration).toBe(7);
  });
  test('toutes les 5 métriques du picker sont mappées', () => {
    ['sessions', 'volume', 'squat_e1rm', 'bench_e1rm', 'dead_e1rm'].forEach((k) => {
      expect(build(k, 7)).not.toBeNull();
    });
  });
  test('métrique inconnue → null (pas de crash)', () => {
    expect(build('dots', 7)).toBeNull();
    expect(build('nope', 7)).toBeNull();
  });
});
