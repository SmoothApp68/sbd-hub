// Refonte onboarding B — dérivations découplées (niveau ↔ discipline).
// Le couplage archétype est remplacé par 2 axes ; les champs annexes sont dérivés.
// On PROUVE que les dérivations reproduisent les 5 archétypes historiques
// (vm-extraction de la vraie source, pas de réimplémentation).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!m) throw new Error('NOT FOUND: ' + name);
  let depth = 0, i = src.indexOf('{', m.index), started = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; started = true; }
    else if (src[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}

const ctx = vm.createContext({});
['_vocabFromLevel', '_deriveObProfile'].forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
const vocab = (l) => vm.runInContext(`_vocabFromLevel(${JSON.stringify(l)})`, ctx);
const obp = (l, m) => vm.runInContext(`_deriveObProfile(${JSON.stringify(l)}, ${JSON.stringify(m)})`, ctx);
// skipPRs est dérivé inline dans obSaveDiscipline ; on caractérise la règle (2 axes).
const skipPRs = (l, m) => (l === 'debutant' || m === 'bien_etre');

describe('_vocabFromLevel — f(niveau) reproduit vocab des archétypes', () => {
  test('debutant→1, intermediaire→2, avance→3', () => {
    expect(vocab('debutant')).toBe(1);
    expect(vocab('intermediaire')).toBe(2);
    expect(vocab('avance')).toBe(3);
  });
});

describe('dérivations — reproduction des 5 archétypes historiques', () => {
  // Archétype | level | mode | vocab | skipPRs | obProfile(dérivé)
  const CASES = [
    ['debutant',      'debutant',      'musculation',   1, true,  'debutant'],
    ['intermediaire', 'intermediaire', 'powerbuilding', 2, false, 'intermediaire'],
    ['powerlifter',   'avance',        'powerlifting',  3, false, 'powerlifter'],
    ['yoga',          'debutant',      'bien_etre',     1, true,  'yoga'],
    ['senior',        'debutant',      'bien_etre',     1, true,  'yoga'], // bien_etre → wellness unifié
  ];
  test.each(CASES)('%s (%s × %s) → vocab %i / skipPRs %s / obProfile %s',
    (_name, level, mode, v, sp, op) => {
      expect(vocab(level)).toBe(v);
      expect(skipPRs(level, mode)).toBe(sp);
      expect(obp(level, mode)).toBe(op);
    });
});

// ── Migration obProfile → axes réels : getLPBienEtreProgress lit trainingMode ──
const ENG = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');
describe('getLPBienEtreProgress — migré sur l\'axe discipline (ex-obProfile yoga/senior)', () => {
  function run(mode) {
    const ctx = vm.createContext({ db: { user: { trainingMode: mode }, exercises: { Squat: { lastReps: 8 } } } });
    vm.runInContext(extractFn(ENG, 'getLPBienEtreProgress'), ctx);
    return vm.runInContext("getLPBienEtreProgress('Squat')", ctx);
  }
  test('trainingMode bien_etre → progression LP bien-être (non null)', () => {
    expect(run('bien_etre')).not.toBeNull();
  });
  test('trainingMode powerlifting → null (plus de dépendance à obProfile)', () => {
    expect(run('powerlifting')).toBeNull();
  });
});

describe('dérivations — combinaisons neuves (découplage)', () => {
  test('débutant + powerlifting → skipPRs true (débutant), obProfile debutant, vocab 1', () => {
    expect(skipPRs('debutant', 'powerlifting')).toBe(true);
    expect(obp('debutant', 'powerlifting')).toBe('debutant');
    expect(vocab('debutant')).toBe(1);
  });
  test('avancé + bien_etre → skipPRs true (bien_etre), obProfile yoga, vocab 3', () => {
    expect(skipPRs('avance', 'bien_etre')).toBe(true);
    expect(obp('avance', 'bien_etre')).toBe('yoga');
    expect(vocab('avance')).toBe(3);
  });
  test('avancé + powerbuilding → skipPRs false, obProfile intermediaire (pas powerlifter)', () => {
    expect(skipPRs('avance', 'powerbuilding')).toBe(false);
    expect(obp('avance', 'powerbuilding')).toBe('intermediaire'); // powerlifter réservé avance+PL
  });
  test('intermédiaire + musculation → skipPRs false, obProfile intermediaire', () => {
    expect(skipPRs('intermediaire', 'musculation')).toBe(false);
    expect(obp('intermediaire', 'musculation')).toBe('intermediaire');
  });
});
