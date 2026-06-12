// Pure unit tests for _wpApplyWorkWeightBounds (ALGO-A1).
// The function is 100% pure ((weight, penalties, ctx) -> { weight, coachNotes }),
// so these tests exercise the clamp pipeline directly — they are the injury
// guard-rails (hard cap, floors, phase caps) under CI.
//
// Real source is vm-extracted from app.js (no reimplementation). All asserted
// numbers were captured by executing the function first (probe), then frozen —
// OBSERVED behavior, not the theoretical ideal.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const sm = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!sm) throw new Error('NOT FOUND in source: ' + name);
  const start = sm.index;
  const lineEnd = src.indexOf('\n', start);
  const firstLine = src.slice(start, lineEnd);
  if (firstLine.includes('{') && firstLine.trimEnd().endsWith('}')) return firstLine; // one-liner
  const rest = src.slice(lineEnd);
  const em = rest.match(/\n\}/);
  const end = em ? lineEnd + em.index + 2 : src.length;
  return src.slice(start, end);
}

const PREAMBLE = extractFn(APP, 'wpRound25') + '\n' + extractFn(APP, '_wpApplyWorkWeightBounds');

test('purity: source contains no db / typeof / impure helper / Date', () => {
  const body = extractFn(APP, '_wpApplyWorkWeightBounds');
  expect(body).not.toMatch(/\bdb\b/);
  expect(body).not.toMatch(/typeof/);
  expect(body).not.toMatch(/saveDB|showToast|new Date/);
});

const ctx = { Math: Math };
vm.createContext(ctx);
vm.runInContext(PREAMBLE, ctx);

function neutralPen(o) {
  return Object.assign({ e1rmRef: 0, sleepMult: 1.0, rhrMult: 1.0, rhrAlert: null,
    wcPenalty: 1.0, actMult: 1.0, stabilized: true, cumulPenalty: 1.0,
    wcActive: false, wcE1rmCap: 0, wcEmergency: null, mentalPenalty: 1.0,
    absencePenalty: { factor: 1.0 } }, o || {});
}
function neutralCtx(o) {
  return Object.assign({ isMainLift: false, notLP: true, isBeginnerMode: false,
    lastWeight: 0, prepenaltyBase: 0, histE1rm: 0, phase: 'accumulation',
    blockWeek: 1, isFemaleWithCycle: false, isAdvancedLevel: false }, o || {});
}
function bounds(w, pen, c) {
  ctx.__w = w; ctx.__p = pen; ctx.__c = c;
  return vm.runInContext('_wpApplyWorkWeightBounds(__w, __p, __c)', ctx);
}

describe('_wpApplyWorkWeightBounds — clamps individuels (valeurs observées)', () => {
  test('identité : pen/ctx neutres → poids inchangé, zéro note', () => {
    const r = bounds(140, neutralPen(), neutralCtx());
    expect(r.weight).toBe(140);
    expect(r.coachNotes).toEqual([]);
  });
  test('Hard Cap 102.5% : 250 avec e1rmRef 200 → 205', () => {
    expect(bounds(250, neutralPen({ e1rmRef: 200 }), neutralCtx()).weight).toBe(205);
  });
  test('cap +5%/sem (main lift, hors LP) : last 140, demandé 150 → 147.5', () => {
    expect(bounds(150, neutralPen(), neutralCtx({ isMainLift: true, lastWeight: 140 })).weight).toBe(147.5);
  });
  test('cap APRE phase accumulation (0.85) : histE1rm 225, 200 → 192.5 (= harnais)', () => {
    expect(bounds(200, neutralPen(), neutralCtx({ histE1rm: 225 })).weight).toBe(192.5);
  });
  test('cap APRE phase deload (0.75) : histE1rm 225, 200 → 170 (= harnais)', () => {
    expect(bounds(200, neutralPen(), neutralCtx({ histE1rm: 225, phase: 'deload' })).weight).toBe(170);
  });
  test('phase peak (cap 1.00) ne mord pas : histE1rm 225, 230 → 230', () => {
    expect(bounds(230, neutralPen(), neutralCtx({ histE1rm: 225, phase: 'peak' })).weight).toBe(230);
  });
  test('plancher 60% pré-pénalité : prepenaltyBase 100, poids 40 → 60', () => {
    expect(bounds(40, neutralPen(), neutralCtx({ prepenaltyBase: 100 })).weight).toBe(60);
  });
  test('plancher cycle 70% apre_base : sleep 0.5 sur 100 (femme) → 70 + 2 notes', () => {
    const r = bounds(100, neutralPen({ sleepMult: 0.5 }), neutralCtx({ isFemaleWithCycle: true }));
    expect(r.weight).toBe(70);
    expect(r.coachNotes.length).toBe(2);
    expect(r.coachNotes[1]).toMatch(/cycle/i);
  });
  test('plancher avancé 60% e1RM (main lift) : e1rmRef 200, poids 100 → 120', () => {
    expect(bounds(100, neutralPen({ e1rmRef: 200 }),
      neutralCtx({ isMainLift: true, isAdvancedLevel: true })).weight).toBe(120);
  });
  test('surcharge hebdo S3 : main lift, 140 → 145 (+2.5 × 2 semaines)', () => {
    expect(bounds(140, neutralPen(), neutralCtx({ isMainLift: true, blockWeek: 3 })).weight).toBe(145);
  });
  test('surcharge hebdo désactivée en deload : S3, 140 → 140', () => {
    expect(bounds(140, neutralPen(),
      neutralCtx({ isMainLift: true, blockWeek: 3, phase: 'deload' })).weight).toBe(140);
  });
  test('cap WC 98% e1RM : wcActive, cap 100, poids 110 → 97.5', () => {
    expect(bounds(110, neutralPen({ wcActive: true, wcE1rmCap: 100 }), neutralCtx()).weight).toBe(97.5);
  });
  test('urgence compétition : ×0.85 → 85 + message en note', () => {
    const r = bounds(100, neutralPen({ wcEmergency: { emergency: true, message: 'Urgence pesée' } }), neutralCtx());
    expect(r.weight).toBe(85);
    expect(r.coachNotes).toContain('Urgence pesée');
  });
});

describe('_wpApplyWorkWeightBounds — cas combinés et quirks gelés', () => {
  test('surcharge S4 (+7.5) puis Hard Cap e1rmRef 140 : le cap a le dernier mot → 142.5', () => {
    expect(bounds(140, neutralPen({ e1rmRef: 140 }),
      neutralCtx({ isMainLift: true, blockWeek: 4 })).weight).toBe(142.5);
  });
  test('priorité observée : plancher avancé (aval) > cap de phase (amont) → 120', () => {
    // histE1rm 130 → cap accumulation = 110 ; plancher avancé (e1rmRef 200) = 120.
    // Le plancher s'applique APRÈS le cap dans le pipeline → il gagne.
    expect(bounds(150, neutralPen({ e1rmRef: 200 }),
      neutralCtx({ isMainLift: true, isAdvancedLevel: true, histE1rm: 130 })).weight).toBe(120);
  });
  test('QUIRK gelé : pénalité sommeil SANS Math.max(20) → un poids < 20 reste < 20', () => {
    // Le plancher absolu 20kg n existe que sur les chemins RHR/cut/activité/
    // mental/absence/urgence — PAS sur le chemin sommeil. Comportement réel.
    const r = bounds(15, neutralPen({ sleepMult: 0.95 }), neutralCtx());
    expect(r.weight).toBe(15);
    expect(r.weight).toBeLessThan(20);
  });
  test('contraste : RHR warning AVEC Math.max(20) → 15 remonte à 20', () => {
    const r = bounds(15, neutralPen({ rhrMult: 0.95, rhrAlert: { level: 'warning' } }), neutralCtx());
    expect(r.weight).toBe(20);
  });
  test('stabilized=false saute les pénalités physio mais PAS le cut → 90, 1 note', () => {
    const r = bounds(100, neutralPen({ sleepMult: 0.95, rhrMult: 0.80, actMult: 0.97,
      mentalPenalty: 0.97, absencePenalty: { factor: 0.9 }, stabilized: false, wcPenalty: 0.9 }),
      neutralCtx());
    expect(r.weight).toBe(90);
    expect(r.coachNotes.length).toBe(1);
    expect(r.coachNotes[0]).toMatch(/cut/i);
  });
  test('pureté d exécution : mêmes entrées → mêmes sorties, entrées non mutées', () => {
    const pen = neutralPen({ e1rmRef: 200 });
    const c = neutralCtx({ isMainLift: true, lastWeight: 140 });
    const snapshot = JSON.stringify({ pen: pen, c: c });
    const r1 = bounds(150, pen, c);
    const r2 = bounds(150, pen, c);
    expect(r1).toEqual(r2);
    expect(JSON.stringify({ pen: pen, c: c })).toBe(snapshot);
  });
});
