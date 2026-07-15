/**
 * SBD Hub — Harness de validation des profils (Agent 09). LECTURE SEULE.
 * ============================================================================
 * Objectif : prouver que chaque profil est chargeable par le VRAI chargeur de
 * l'app, SANS modifier l'app ni Supabase.
 *
 * « loadDB » n'est pas une fonction nommée : c'est l'IIFE `let db = (() => {…})()`
 * d'app.js (lignes ~83-270, defaultDB inclus). On l'EXTRAIT de la source réelle
 * et on l'exécute dans un vm avec un localStorage stubbé contenant le blob du
 * profil sous 'SBD_HUB_V29'. C'est LE point de décision « accepter le blob » vs
 * « retomber sur defaultDB() ».
 *
 * PHASE 1 (gating) : le blob traverse loadDB sans exception ET sans fallback
 *   (détecté via la sentinelle _fixtureName, absente de defaultDB()).
 * PHASE 2 (caractérisation, best-effort) : on rejoue quelques fonctions RÉELLES
 *   extraites d'app.js/engine.js (getSBDType, recalcBestPR, predictPR, calcTDEE,
 *   _normalizeCheckinEntry, ratios) sur le db chargé, et on IMPRIME les valeurs —
 *   c'est ce qui prouve le RÉALISME (ex. aurel → TDEE 2672, deadlift plateau 169).
 *
 * Sortie : tableau OK/KO par profil. Code de sortie ≠ 0 si une Phase 1 échoue.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const profiles = require('./index');

const ROOT = path.join(__dirname, '..', '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');

// Extraction brace-balancée d'une `function NAME(...) {...}` (même technique que
// tests/unit/caloric-target.test.js — la vraie source, pas une réimplémentation).
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

// Extraction du bloc « loadDB » réel : de `const defaultDB` jusqu'au `})();` qui
// ferme l'IIFE `let db = (() => {`.
function extractLoadDBBlock() {
  const start = APP.indexOf('const defaultDB = () => ({');
  const iife = APP.indexOf('let db = (() => {');
  if (start < 0 || iife < 0) throw new Error('Bloc loadDB introuvable — la source a changé.');
  const closeMarker = '})();';
  const closeIdx = APP.indexOf(closeMarker, iife);
  if (closeIdx < 0) throw new Error('Fin d\'IIFE loadDB introuvable.');
  return APP.slice(start, closeIdx + closeMarker.length);
}

const LOADDB_BLOCK = extractLoadDBBlock();

function makeLocalStorageStub(blobJson) {
  const store = { 'SBD_HUB_V29': blobJson };
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
}

// PHASE 1 — passe le blob dans le VRAI loadDB.
function runRealLoadDB(profileObj) {
  const ctx = vm.createContext({
    localStorage: makeLocalStorageStub(JSON.stringify(profileObj)),
    STORAGE_KEY: 'SBD_HUB_V29',
    console: { log: function () {}, warn: function () {}, error: function () {} }
  });
  // Le bloc déclare `const defaultDB` + `let db` (lexicaux) ; on renvoie `db` via
  // une expression finale dans le MÊME script (même scope lexical).
  return vm.runInContext(LOADDB_BLOCK + '\n;db;', ctx, { timeout: 5000 });
}

// PHASE 2 — contexte de caractérisation avec fonctions réelles sur le db chargé.
function makeCharacterizationCtx(db) {
  const ctx = vm.createContext({
    db: db,
    console: console,
    Date: Date,
    _cache: { sbdType: new Map() },
    // getLogsInRange réel (app.js:1841) réimplémenté à l'identique — dépendance de calcTDEE.
    getLogsInRange: function (days) {
      const lim = Date.now() - days * 86400000;
      return (db.logs || []).filter(function (l) { return l.timestamp >= lim && l.timestamp <= Date.now(); });
    },
    // stubs neutres pour les branches optionnelles de calcTDEE.
    wpDetectPhase: function () { return 'hypertrophie'; },
    calcActivityTRIMP: function () { return 0; }
  });
  vm.runInContext("const VARIANT_KEYWORDS=['pause','spoto','deficit','board'];", ctx);
  ['_getSBDTypeRaw', 'getSBDType', 'getTopE1RMForLift', 'getSmoothedE1RM', 'computeStrengthRatiosDetailed',
    'calcTDEEKatchMcArdle', 'calcTDEE']
    .forEach(function (fn) { try { vm.runInContext(extractFn(ENG, fn), ctx); } catch (e) { /* optionnelle */ } });
  ['calcE1RM', '_exoMaxRealWeight', 'recalcBestPR', '_normalizeCheckinEntry', 'predictPR']
    .forEach(function (fn) { try { vm.runInContext(extractFn(APP, fn), ctx); } catch (e) { /* optionnelle */ } });
  return ctx;
}

function characterize(db) {
  const ctx = makeCharacterizationCtx(db);
  const out = {};
  function safe(label, expr) { try { out[label] = vm.runInContext(expr, ctx); } catch (e) { out[label] = 'ERR:' + e.message; } }
  safe('tdee', 'calcTDEE(db.user.bw || 0, 0)');
  safe('bestPR_recomputed', '(function(){ recalcBestPR(); return db.bestPR; })()');
  safe('predict_dead', '(function(){ var r=predictPR("deadlift", 175); return {reachable:r.reachable, reason:r.reason, currentE1RM:r.currentE1RM, weeklyGain:r.weeklyGain, dataPoints:r.dataPoints}; })()');
  safe('predict_squat', '(function(){ var r=predictPR("squat", 160); return {reachable:r.reachable, reason:r.reason, currentE1RM:r.currentE1RM, weeklyGain:r.weeklyGain, dataPoints:r.dataPoints}; })()');
  safe('ratios', '(function(){ var r=computeStrengthRatiosDetailed(); return {sb:r.squat_bench, sd:r.squat_dead, bd:r.bench_dead, row_b:r.row_bench, raw:r.raw}; })()');
  safe('checkin_norm_last', '(function(){ var h=db.readinessHistory||[]; if(!h.length) return null; var e=_normalizeCheckinEntry(h[h.length-1]); return {pain:e.pain, sleep5:e.sleep5, fraicheur5:e.fraicheur5}; })()');
  return out;
}

// ── RUN ─────────────────────────────────────────────────────────────────────
const FIXED_NOW = Date.parse('2026-07-15T05:42:00Z'); // déterministe pour le rapport
let anyFail = false;
const rows = [];

profiles.names.forEach(function (name) {
  const row = { name: name, load: 'KO', notes: [] };
  let db;
  try {
    const profileObj = profiles.build(name, FIXED_NOW);
    db = runRealLoadDB(profileObj);
    // Gating : pas de fallback + invariants de normalisation loadDB.
    if (!db) throw new Error('db undefined');
    if (db._fixtureName !== name) throw new Error('FALLBACK defaultDB (sentinelle absente)');
    if (!db.user) throw new Error('db.user absent');
    if (!Array.isArray(db.logs)) throw new Error('db.logs non-tableau');
    if (typeof db.user.onboardingVersion !== 'number') throw new Error('onboardingVersion non normalisé en nombre');
    if (!Array.isArray(db.user.injuries)) throw new Error('injuries non normalisé en tableau');
    if (db.user.coachingStyle == null) throw new Error('coachingStyle non défaut');
    row.load = 'OK';
    row.logs = db.logs.length;
  } catch (e) {
    anyFail = true;
    row.notes.push('LOAD: ' + e.message);
    rows.push(row);
    return;
  }
  // Phase 2 (best-effort) — n'invalide pas le chargement, informe.
  try { row.char = characterize(db); } catch (e) { row.notes.push('CHAR: ' + e.message); }
  rows.push(row);
});

// ── REPORT ──────────────────────────────────────────────────────────────────
console.log('\n=== VALIDATION loadDB — profils synthétiques (FIXED_NOW=' + new Date(FIXED_NOW).toISOString() + ') ===\n');
rows.forEach(function (r) {
  console.log('[' + r.load + '] ' + r.name + (r.logs !== undefined ? '  (' + r.logs + ' séances)' : ''));
  if (r.notes.length) r.notes.forEach(function (n) { console.log('      ! ' + n); });
  if (r.char) {
    console.log('      TDEE=' + r.char.tdee + '  bestPR=' + JSON.stringify(r.char.bestPR_recomputed));
    console.log('      predictPR(deadlift)=' + JSON.stringify(r.char.predict_dead));
    console.log('      predictPR(squat)=' + JSON.stringify(r.char.predict_squat));
    console.log('      ratios=' + JSON.stringify(r.char.ratios));
    console.log('      checkin_norm(dernier)=' + JSON.stringify(r.char.checkin_norm_last));
  }
  console.log('');
});

console.log(anyFail ? '❌ AU MOINS UN PROFIL NE CHARGE PAS' : '✅ TOUS LES PROFILS CHARGENT via le vrai loadDB');
process.exit(anyFail ? 1 : 0);
