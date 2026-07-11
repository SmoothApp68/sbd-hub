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
  // getRealRecords utilise matchExoName si présent, sinon égalité stricte des
  // noms (chemin réel du code, exercé tel quel ici — pas de réimplémentation).
  ['calcE1RM', '_exoMaxRealWeight', 'recalcBestPR', 'getRealRecords', 'isRealSetPR']
    .forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
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
  test('exclusions getSBDType : goblet ET roumain exclus (finition 4/5)', () => {
    // Inversion délibérée (chantier finition post-PR) : le RDL/roumain est
    // désormais exclu de getSBDType → n'alimente plus bestPR.deadlift.
    // (Avant la finition, seul goblet était exclu ; roumain comptait.)
    const db = {
      logs: [mkLog(1000, [
        mkExo('Squat Goblet', { '5': 200 }),
        mkExo('Soulevé de Terre Roumain', { '5': 220 })
      ])],
      user: {}
    };
    const ctx = makeCtx(db);
    vm.runInContext('recalcBestPR()', ctx);
    expect(db.bestPR).toEqual({ bench: 0, squat: 0, deadlift: 0 });
  });
});

describe('isRealSetPR — les 3 cas canoniques (déclencheurs, commits 2-5)', () => {
  // Historique : 100kg × 5 au squat.
  const HIST = { logs: [mkLog(1000, [mkExo('Squat (Barre)', { '5': 100 })])], user: {} };
  function judge(w, r) {
    const ctx = makeCtx(JSON.parse(JSON.stringify(HIST)));
    return vm.runInContext('isRealSetPR(' + w + ',' + r + ", getRealRecords('Squat (Barre)'))", ctx);
  }
  test('95×8 après 100×5 → PAS de PR (e1RM monte, la barre non)', () => {
    expect(judge(95, 8)).toBeNull();
  });
  test('100×6 après 100×5 → PR de reps', () => {
    const pr = judge(100, 6);
    expect(pr).not.toBeNull();
    expect(pr.kind).toBe('reps');
    expect(pr.prev).toBe(100);
  });
  test('105×1 après 100 max → PR de charge', () => {
    const pr = judge(105, 1);
    expect(pr).not.toBeNull();
    expect(pr.kind).toBe('charge');
    expect(pr.prev).toBe(100);
  });
  test('100×5 répété → pas de PR (égalité = dominé)', () => {
    expect(judge(100, 5)).toBeNull();
  });
  test('80×6 (plus de reps mais bien plus léger) → pas de PR (ne domine rien)', () => {
    expect(judge(80, 6)).toBeNull();
  });
  test('première occurrence d\'un exercice → jamais de PR', () => {
    const ctx = makeCtx({ logs: [], user: {} });
    expect(vm.runInContext("isRealSetPR(100, 5, getRealRecords('Squat (Barre)'))", ctx)).toBeNull();
  });
});

describe('detectNewPR (modale SBD) — charge réelle, garde premier set, 0 ratchet', () => {
  function mkDetectCtx(bestPR) {
    const ctx = makeCtx({ logs: [], user: {}, bestPR });
    vm.runInContext(extractFn(APP, 'detectNewPR'), ctx);
    return ctx;
  }
  test('tout premier set SBD (bestPR=0) → null (plus de modale fantôme)', () => {
    const ctx = mkDetectCtx({ bench: 0, squat: 0, deadlift: 0 });
    expect(vm.runInContext("detectNewPR('Squat (Barre)', 100, 5)", ctx)).toBeNull();
  });
  test('rep-work sous la barre max (95×8 vs PR 100) → null, et bestPR INCHANGÉ (ratchet supprimé)', () => {
    const ctx = mkDetectCtx({ bench: 0, squat: 100, deadlift: 0 });
    // 95×8 : Brzycki ≈ 118 > 100 — l'ancien code aurait ratcheté bestPR en silence.
    expect(vm.runInContext("detectNewPR('Squat (Barre)', 95, 8)", ctx)).toBeNull();
    expect(vm.runInContext('db.bestPR.squat', ctx)).toBe(100);
  });
  test('vraie barre au-dessus (105×1 vs PR 100) → modale, données réelles', () => {
    const ctx = mkDetectCtx({ bench: 0, squat: 100, deadlift: 0 });
    const pr = vm.runInContext("detectNewPR('Squat (Barre)', 105, 1)", ctx);
    expect(pr).toEqual({ liftKey: 'squat', weight: 105, reps: 1, currentPR: 100 });
  });
  test('exclusions propres à detectNewPR : roumain/RDL → null même au-dessus', () => {
    const ctx = mkDetectCtx({ bench: 0, squat: 0, deadlift: 100 });
    expect(vm.runInContext("detectNewPR('Soulevé de Terre Roumain', 150, 1)", ctx)).toBeNull();
  });
});

describe('_detectSessionRealPRs — célébration fin de séance', () => {
  function detect(sessionExos, prevExos) {
    const ctx = makeCtx({ logs: [], user: {} });
    vm.runInContext(extractFn(APP, '_detectSessionRealPRs'), ctx);
    const session = { exercises: sessionExos };
    const prevLogs = [mkLog(1000, prevExos)];
    return vm.runInContext(
      '_detectSessionRealPRs(' + JSON.stringify(session) + ',' + JSON.stringify(prevLogs) + ')', ctx);
  }
  test('rep-work (95×8 après 100×5) → aucune célébration', () => {
    expect(detect(
      [mkExo('Squat (Barre)', { '8': 95 }, { maxRM: 118 })],
      [mkExo('Squat (Barre)', { '5': 100 })]
    )).toEqual([]);
  });
  test('vraie barre (105×1 après 100×5) → PR charge, valeurs réelles', () => {
    const prs = detect(
      [mkExo('Squat (Barre)', { '1': 105 })],
      [mkExo('Squat (Barre)', { '5': 100 })]
    );
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ name: 'Squat (Barre)', kind: 'charge', value: 105, prev: 100, gain: 5 });
  });
  test('reps améliorés (100×6 après 100×5) → PR reps', () => {
    const prs = detect(
      [mkExo('Squat (Barre)', { '6': 100 })],
      [mkExo('Squat (Barre)', { '5': 100 })]
    );
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ kind: 'reps', value: 100, reps: 6 });
  });
  test('première occurrence d\'un exercice → pas de célébration', () => {
    expect(detect(
      [mkExo('Curl (Haltère)', { '10': 20 })],
      [mkExo('Squat (Barre)', { '5': 100 })]
    )).toEqual([]);
  });
  test('exercice substitué → ignoré', () => {
    expect(detect(
      [mkExo('Squat (Barre)', { '1': 200 }, { isSubstituted: true })],
      [mkExo('Squat (Barre)', { '5': 100 })]
    )).toEqual([]);
  });
});

describe('_sessionHasRealPR — badge 🏆 du Log', () => {
  // prevBest au format precompute : { nom: {maxWeight, repRecords, occurrences} }
  function hasPR(sessionExos, prevBest) {
    const ctx = makeCtx({ logs: [], user: {} });
    vm.runInContext(extractFn(APP, '_sessionHasRealPR'), ctx);
    return vm.runInContext(
      '_sessionHasRealPR(' + JSON.stringify({ exercises: sessionExos }) + ',' + JSON.stringify(prevBest) + ')', ctx);
  }
  const PREV = { 'Squat (Barre)': { maxWeight: 100, repRecords: { '5': 100 }, occurrences: 3 } };
  test('rep-work (95×8) → pas de badge', () => {
    expect(hasPR([mkExo('Squat (Barre)', { '8': 95 }, { maxRM: 118 })], PREV)).toBe(false);
  });
  test('vraie barre (105×1) → badge', () => {
    expect(hasPR([mkExo('Squat (Barre)', { '1': 105 })], PREV)).toBe(true);
  });
  test('reps améliorés (100×6) → badge', () => {
    expect(hasPR([mkExo('Squat (Barre)', { '6': 100 })], PREV)).toBe(true);
  });
  test('première occurrence d\'un exercice → pas de badge (fini le 🏆 systématique)', () => {
    expect(hasPR([mkExo('Curl (Haltère)', { '10': 20 })], PREV)).toBe(false);
  });
  test('sans matchExoName dans le contexte : fallback égalité stricte (chemin réel)', () => {
    // Le vm ne charge pas matchExoName → typeof === 'undefined' → e.name === k.
    expect(hasPR([mkExo('Squat', { '1': 105 })], PREV)).toBe(false);
  });
});

describe('getSBDType — caractérisation complète (38 usages, finition 4/5)', () => {
  // Batterie figée par probe AVANT la modification, puis vérifiée APRÈS :
  // seuls RDL/roumain/romanian/jambes tendues/stiff-leg basculent hors deadlift.
  const EXPECTED = {
    'Squat (Barre)': 'squat',
    'Développé Couché (Barre)': 'bench',
    'Soulevé de Terre (Barre)': 'deadlift',
    'Soulevé de Terre Sumo': 'deadlift',       // sumo = style de compétition, reste
    'Deadlift': 'deadlift',
    'Soulevé de Terre Roumain': null,           // ← bascule (finition)
    'Romanian Deadlift': null,                  // ← bascule (finition)
    'Soulevé de Terre Jambes Tendues': null,    // ← bascule (finition)
    'Stiff-Leg Deadlift': null,                 // ← bascule (finition)
    'Stiff Leg Deadlift': null,                 // ← bascule (finition)
    'RDL (Haltères)': null,                     // déjà null avant (pas de mot-clé deadlift)
    'Soulevé de Terre Deficit': null,           // VARIANT_KEYWORDS (inchangé)
    'Bench Press Pause': null,                  // VARIANT_KEYWORDS (inchangé)
    'Front Squat': null,                        // exclusion squat (inchangé)
    'Squat Goblet': null,                       // exclusion squat (inchangé)
    'Hurdle Hops': null,                        // \brdl\b ne matche pas « hurdle »
    'Rack Pull': null
  };
  const ctx = makeCtx({ logs: [], user: {} });
  Object.keys(EXPECTED).forEach(name => {
    test(name + ' → ' + JSON.stringify(EXPECTED[name]), () => {
      expect(vm.runInContext('getSBDType(' + JSON.stringify(name) + ')', ctx)).toBe(EXPECTED[name]);
    });
  });
});

describe('getBestE1RMForLift — e1RM affiché Home = max historique (comme Stats)', () => {
  test('max des maxRM sur les logs du type, pas le registre DUP', () => {
    // Deux séances squat : maxRM 148 (ancienne) et 138 (récente) → l'affichage
    // Home doit suivre le MAX historique (148), pas la valeur récente.
    const db = {
      logs: [
        mkLog(1000, [mkExo('Squat (Barre)', { '5': 125 }, { maxRM: 148 })]),
        mkLog(2000, [mkExo('Squat (Barre)', { '5': 117 }, { maxRM: 138 })])
      ],
      user: {}, exercises: { 'Squat (Barre)': { e1rm: 138 } }
    };
    const ctx = makeCtx(db);
    vm.runInContext(extractFn(APP, 'getBestE1RMForLift'), ctx);
    expect(vm.runInContext("getBestE1RMForLift('squat')", ctx)).toBe(148);
  });
  test('type non présent dans les logs → 0 (le garde-fou bestPR prend le relais)', () => {
    const ctx = makeCtx({ logs: [], user: {} });
    vm.runInContext(extractFn(APP, 'getBestE1RMForLift'), ctx);
    expect(vm.runInContext("getBestE1RMForLift('bench')", ctx)).toBe(0);
  });
});

describe('getLiftPRDisplay (Stats→Records) — vrai poids en headline, e1RM en est.', () => {
  function display(lift) {
    const ctx = makeCtx({ logs: [], user: {} });
    ['getLiftType', 'getLiftPRDisplay'].forEach(fn => vm.runInContext(extractFn(APP, fn), ctx));
    return vm.runInContext('getLiftPRDisplay(' + JSON.stringify(lift) + ')', ctx);
  }
  test('curl 30×12 (cas Aurélien) : headline 30 kg réels, e1RM 40 en « est. »', () => {
    const pr = display({ name: 'Curl (Haltère)', maxWeight: 30, maxRM: 40 });
    expect(pr.label).toBe('30 kg');
    expect(pr.sub).toBe('est. 40 kg e1RM');
  });
  test('single lourd : e1RM == poids réel → pas de sous-libellé redondant', () => {
    const pr = display({ name: 'Squat (Barre)', maxWeight: 140, maxRM: 140 });
    expect(pr.label).toBe('140 kg');
    expect(pr.sub).toBe('');
  });
  test('fallback sans poids réel : e1RM conservé mais étiqueté', () => {
    const pr = display({ name: 'Squat (Barre)', maxWeight: 0, maxRM: 120 });
    expect(pr.label).toBe('120 kg');
    expect(pr.sub).toBe('e1RM estimé');
  });
});
