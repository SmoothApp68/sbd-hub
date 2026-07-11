// PR & records réels (philosophie B) — caractérisation.
// vm-extraction de la vraie source (app.js + engine.js) : recalcBestPR,
// _exoMaxRealWeight, getSBDType. Critère central du chantier : le rep-work ne
// produit plus de « record » gonflé (e1RM), un vrai dépassement en produit un.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const ENGINE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');

function extractFn(src, name) {
  const sm = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!sm) throw new Error('NOT FOUND in source: ' + name);
  const start = sm.index;
  const lineEnd = src.indexOf('\n', start);
  const firstLine = src.slice(start, lineEnd);
  if (firstLine.includes('{') && firstLine.trimEnd().endsWith('}')) return firstLine;
  const rest = src.slice(lineEnd);
  const em = rest.match(/\n\}/);
  return src.slice(start, em ? lineEnd + em.index + 2 : src.length);
}

// Contexte : db synthétique + getSBDType réel (avec ses dépendances réelles).
function makeCtx(db) {
  const ctx = vm.createContext({ console, db, _cache: { sbdType: new Map() } });
  vm.runInContext("const VARIANT_KEYWORDS=['pause','spoto','deficit','board'];", ctx); // engine.js:17 (littéral vérifié)
  ['_getSBDTypeRaw', 'getSBDType'].forEach(fn => vm.runInContext(extractFn(ENGINE, fn), ctx));
  ['calcE1RM', '_exoMaxRealWeight', 'recalcBestPR'].forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
  return ctx;
}

// Exercice de log au format réel : repRecords = { "reps": meilleur poids }
function mkExo(name, repRecords, extra) {
  return Object.assign({ name, repRecords }, extra || {});
}
function mkLog(ts, exos) { return { timestamp: ts, exercises: exos }; }

describe('_exoMaxRealWeight — poids réel, jamais un e1RM', () => {
  test('repRecords prioritaire : max des poids', () => {
    const ctx = makeCtx({ logs: [], user: {} });
    const w = vm.runInContext('_exoMaxRealWeight(' + JSON.stringify(mkExo('Squat (Barre)', { '5': 100, '8': 90 })) + ')', ctx);
    expect(w).toBe(100); // pas 112 (Brzycki de 100×5)
  });
  test('fallback allSets : ignore les warmups', () => {
    const ctx = makeCtx({ logs: [], user: {} });
    const exo = { name: 'Squat (Barre)', allSets: [
      { weight: 120, reps: 3, setType: 'warmup' },
      { weight: 100, reps: 5, setType: 'normal' }
    ] };
    const w = vm.runInContext('_exoMaxRealWeight(' + JSON.stringify(exo) + ')', ctx);
    expect(w).toBe(100);
  });
  test('fallback series quand ni repRecords ni allSets', () => {
    const ctx = makeCtx({ logs: [], user: {} });
    const exo = { name: 'Squat (Barre)', series: [{ weight: 95, reps: 6 }] };
    expect(vm.runInContext('_exoMaxRealWeight(' + JSON.stringify(exo) + ')', ctx)).toBe(95);
  });
});

describe('recalcBestPR — vraies barres + plancher onboarding', () => {
  test('rep-work seul → bestPR = vraie charge max, PAS l\'e1RM gonflé', () => {
    // 100×8 au squat : e1RM Brzycki = 124 ; la vraie barre = 100.
    const db = {
      logs: [mkLog(1000, [mkExo('Squat (Barre)', { '8': 100 }, { maxRM: 124 })])],
      user: {}
    };
    const ctx = makeCtx(db);
    vm.runInContext('recalcBestPR()', ctx);
    expect(db.bestPR).toEqual({ bench: 0, squat: 100, deadlift: 0 });
  });
  test('onboarding déclaré + 0 log → bestPR = onboardingPRs (plus jamais {0,0,0})', () => {
    const db = { logs: [], user: { onboardingPRs: { bench: 140, squat: 148, deadlift: 186 } } };
    const ctx = makeCtx(db);
    vm.runInContext('recalcBestPR()', ctx);
    expect(db.bestPR).toEqual({ bench: 140, squat: 148, deadlift: 186 });
  });
  test('logs SOUS le plancher → le plancher onboarding tient', () => {
    const db = {
      logs: [mkLog(1000, [mkExo('Développé Couché (Barre)', { '1': 120 })])],
      user: { onboardingPRs: { bench: 140, squat: 0, deadlift: 0 } }
    };
    const ctx = makeCtx(db);
    vm.runInContext('recalcBestPR()', ctx);
    expect(db.bestPR.bench).toBe(140);
  });
  test('profil aurel-like : vraies barres ≥ plancher → inchangé (140/148/186)', () => {
    const db = {
      logs: [mkLog(1000, [
        mkExo('Développé Couché (Barre)', { '1': 140, '5': 120 }),
        mkExo('Squat (Barre)', { '1': 148 }),
        mkExo('Soulevé de Terre (Barre)', { '1': 186 })
      ])],
      user: { onboardingPRs: { bench: 140, squat: 148, deadlift: 186 } }
    };
    const ctx = makeCtx(db);
    vm.runInContext('recalcBestPR()', ctx);
    expect(db.bestPR).toEqual({ bench: 140, squat: 148, deadlift: 186 });
  });
  test('exclusions getSBDType observées : goblet exclu, roumain COMPTE (préexistant)', () => {
    // Observé par probe : getSBDType('Squat Goblet') → null, mais
    // getSBDType('Soulevé de Terre Roumain') → 'deadlift' (l'exclusion
    // roumain/rdl ne vit que dans detectNewPR, pas dans getSBDType).
    // Comportement préexistant au chantier — décrit tel quel, signalé au rapport.
    const db = {
      logs: [mkLog(1000, [
        mkExo('Squat Goblet', { '5': 200 }),
        mkExo('Soulevé de Terre Roumain', { '5': 220 })
      ])],
      user: {}
    };
    const ctx = makeCtx(db);
    vm.runInContext('recalcBestPR()', ctx);
    expect(db.bestPR).toEqual({ bench: 0, squat: 0, deadlift: 220 });
  });
});
