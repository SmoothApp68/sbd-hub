// Refonte onboarding — Prompt A : caractérisation des 12 combos niveau × discipline.
// Le découplage niveau ↔ discipline rend possibles 7 combinaisons neuves (dont
// débutant + powerlifting, jusqu'ici impossible). Ce fichier PROUVE, sur la vraie
// source (vm-extraction, aucune réimplémentation), qu'aucune des 12 combos ne
// plante à la génération et que les tables clés couvrent tous les chemins.
// AUCUNE modification de logique applicative — tests seulement.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');

// Extracteur commentaire-aware : `function name` OU `(var|const|let) NAME = {…}`.
function extract(src, name) {
  let m = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  let start;
  if (m) { start = src.indexOf('{', m.index); }
  else {
    m = src.match(new RegExp('^(?:var|const|let)\\s+' + name + '\\s*=\\s*\\{', 'm'));
    if (!m) throw new Error('NOT FOUND: ' + name);
    start = m.index + m[0].length - 1;
  }
  let i = start, depth = 0, str = null;
  for (; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (str) { if (ch === '\\') i++; else if (ch === str) str = null; continue; }
    if (ch === '/' && nx === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && nx === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) { i++; break; } }
  }
  return src.slice(m.index, i);
}

// ── LA MATRICE ────────────────────────────────────────────────────────────
const LEVELS = ['debutant', 'intermediaire', 'avance'];
const DISCIPLINES = ['powerlifting', 'powerbuilding', 'musculation', 'bien_etre'];
// Objectif réaliste tel que l'onboarding le poserait par archétype (Q2 dépend de
// la discipline dans les faits). generateProgram route sur l'OBJECTIF, la
// discipline n'intervient que via isPB (powerbuilding) — d'où ce mapping.
const GOAL_BY_DISC = { powerlifting: 'force', powerbuilding: 'masse', musculation: 'masse', bien_etre: 'maintien' };
const COMBOS = [];
LEVELS.forEach(level => DISCIPLINES.forEach(mode => COMBOS.push([level, mode, GOAL_BY_DISC[mode]])));

// ── 1. COUVERTURE DES TABLES (mode × level / level) ────────────────────────
describe('12 combos — couverture des tables paramètres (aucun undefined → NaN)', () => {
  const ctx = vm.createContext({ db: {} });
  ['LEVEL_PARAMS', 'BLOCK_DURATION', 'DUP_SEQUENCE'].forEach(n => vm.runInContext(extract(APP, n), ctx));
  vm.runInContext(extract(APP, 'getDUPKey'), ctx);
  ['PROGRESSION_RATES', 'STALENESS_THRESHOLDS', 'TRAINING_MODES'].forEach(n => vm.runInContext(extract(ENG, n), ctx));
  const get = (expr) => vm.runInContext(expr, ctx);

  test.each(COMBOS)('[%s × %s] BLOCK_DURATION[mode][level] est un objet non vide', (level, mode) => {
    const bd = get(`BLOCK_DURATION[${JSON.stringify(mode)}] && BLOCK_DURATION[${JSON.stringify(mode)}][${JSON.stringify(level)}]`);
    expect(bd && typeof bd === 'object').toBe(true);
    expect(Object.keys(bd).length).toBeGreaterThan(0);
    // toutes les durées sont des nombres finis > 0 (pas de NaN downstream)
    Object.values(bd).forEach(v => expect(Number.isFinite(v) && v > 0).toBe(true));
  });

  test.each(COMBOS)('[%s × %s] getDUPKey → clé présente dans DUP_SEQUENCE', (level, mode) => {
    const key = get(`getDUPKey(${JSON.stringify(mode)}, ${JSON.stringify(level)})`);
    expect(get(`!!DUP_SEQUENCE[${JSON.stringify(key)}]`)).toBe(true);
  });

  test.each(COMBOS)('[%s × %s] LEVEL_PARAMS / PROGRESSION_RATES / STALENESS / TRAINING_MODES', (level, mode) => {
    expect(get(`!!LEVEL_PARAMS[${JSON.stringify(level)}]`)).toBe(true);
    expect(get(`!!PROGRESSION_RATES[${JSON.stringify(level)}]`)).toBe(true);
    expect(get(`!!STALENESS_THRESHOLDS[${JSON.stringify(level)}]`)).toBe(true);
    // features de mode : présence + booléens (showSBDCards etc.)
    const feat = get(`TRAINING_MODES[${JSON.stringify(mode)}] && TRAINING_MODES[${JSON.stringify(mode)}].features`);
    expect(feat && typeof feat === 'object').toBe(true);
  });
});

// ── 2. GÉNÉRATION DE PROGRAMME — aucun crash, non vide, aucun NaN ───────────
function buildGenCtx(level, mode) {
  const db = { user: { level, trainingMode: mode }, weeklyPlan: {}, bestPR: {} };
  const ctx = vm.createContext({
    db, obSelectedDays: [], console,
    computeACWR: () => null, wpDetectPhase: () => null,
    Math, JSON, parseFloat, Set, Date
  });
  ['EXO_DB', 'LEVEL_PARAMS', 'INJURY_EXCLUSIONS'].forEach(n => vm.runInContext(extract(APP, n), ctx));
  ['filtMat', 'getSetsReps', 'generateProgram'].forEach(n => vm.runInContext(extract(APP, n), ctx));
  return ctx;
}

describe('12 combos — generateProgram aboutit (7 jours, ≥1 séance, aucun NaN)', () => {
  test.each(COMBOS)('[%s × %s / %s] plan valide', (level, mode, goal) => {
    const ctx = buildGenCtx(level, mode);
    const goalObj = JSON.stringify([{ id: goal }]);
    let plan;
    expect(() => {
      plan = vm.runInContext(
        `generateProgram(${goalObj}, 3, 'salle', 60, [], 'aucun', null, null, ${JSON.stringify(level)})`, ctx);
    }).not.toThrow();
    expect(Array.isArray(plan)).toBe(true);
    expect(plan.length).toBe(7);                                  // 7 jours
    expect(plan.filter(d => !d.isRest).length).toBeGreaterThanOrEqual(1); // ≥1 séance
    // aucun setsReps NaN / undefined
    plan.filter(d => !d.isRest).forEach(d => {
      (d.exosSets || []).forEach(e => {
        expect(typeof e.setsReps).toBe('string');
        expect(/NaN|undefined/.test(e.setsReps)).toBe(false);
      });
    });
  });
});

// ── 3. mesoWeeks — le cas null débutant (dont débutant-force) ne casse rien ─
describe('buildMesoWeeks — débutant → null (LP), autres → blocs finis', () => {
  function runMeso(level, mode, phase) {
    const db = { user: { level, trainingMode: mode },
      weeklyPlan: { days: [{ day: 'Lundi', exercises: [] }], currentBlock: { week: 1, phase } } };
    const ctx = vm.createContext({
      db, console,
      wpDetectPhase: () => {}, buildWeekSummary: () => ({}), buildProjectedWeek: () => [],
      buildCompletedWeekDays: () => [], buildCompletedWeekSummary: () => ({}), buildDeloadWeekDays: () => []
    });
    vm.runInContext(extract(APP, 'BLOCK_DURATION'), ctx);
    vm.runInContext(extract(APP, 'buildMesoWeeks'), ctx);
    vm.runInContext('buildMesoWeeks()', ctx);
    return db.weeklyPlan.mesoWeeks;
  }
  test('débutant + powerlifting (force) → mesoWeeks = null (chemin app.js:25789)', () => {
    expect(runMeso('debutant', 'powerlifting', 'force')).toBeNull();
  });
  test.each(['debutant', 'intermediaire', 'avance'])('débutant→null / autres→array pour %s', (level) => {
    const mw = runMeso(level, 'powerbuilding', 'hypertrophie');
    if (level === 'debutant') { expect(mw).toBeNull(); return; }
    expect(Array.isArray(mw)).toBe(true);
    mw.forEach(w => expect(Number.isFinite(w.blockDuration) && w.blockDuration > 0).toBe(true));
    expect(mw.length).toBe(mw[0].blockDuration + 1); // blockDuration + semaine deload
  });
  test('consommateurs de mesoWeeks null-guardés (source-assert)', () => {
    // les 3 lecteurs principaux gardent null avant .length/.find
    expect(APP.includes('var _mesoWeeksRef = db.weeklyPlan && db.weeklyPlan.mesoWeeks')).toBe(true);
    expect(APP.includes('if (!mesoWeeks || mesoWeeks.length === 0) return')).toBe(true);
  });
});

// ── 4. FILET AXIAL GO (showDOMSModal) — la clause level!=='debutant' exclut ─
describe('filet axial GO — combos neuves gérées proprement', () => {
  function runAxial(level, mode) {
    let uiOpened = 0, cbCalled = 0;
    const db = { user: { level, trainingMode: mode } };
    const ctx = vm.createContext({
      db,
      hasTodayDOMS: () => false,
      getProgExosForDay: () => ['Squat (Barre)'],   // séance axiale lourde
      DAYS_FULL: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
      _uiOpen: () => { uiOpened++; },
      window: {},
      document: { createElement: () => ({ style: {}, set innerHTML(v) {}, get innerHTML() { return ''; } }) },
      Date
    });
    vm.runInContext(extract(APP, 'showDOMSModal'), ctx);
    vm.runInContext('showDOMSModal(function(){ globalThis.__cb = (globalThis.__cb||0)+1; })', ctx);
    cbCalled = vm.runInContext('globalThis.__cb || 0', ctx);
    return { uiOpened, cbCalled };
  }
  test('débutant + powerlifting → gate SKIP (callback direct, pas de modale)', () => {
    const r = runAxial('debutant', 'powerlifting'); // level==='debutant' exclut d'emblée
    expect(r.uiOpened).toBe(0);
    expect(r.cbCalled).toBe(1);
  });
  test('avancé + powerlifting → gate ACTIF (modale sécurité lombaire ouverte)', () => {
    const r = runAxial('avance', 'powerlifting');
    expect(r.uiOpened).toBe(1);
    expect(r.cbCalled).toBe(0);
  });
  test('intermédiaire + powerbuilding → gate SKIP (ni avancé ni powerlifting)', () => {
    const r = runAxial('intermediaire', 'powerbuilding');
    expect(r.uiOpened).toBe(0);
    expect(r.cbCalled).toBe(1);
  });
});
