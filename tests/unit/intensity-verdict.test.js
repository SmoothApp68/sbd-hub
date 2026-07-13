// Arbitre d'intensité (étape 4 Coach, prompt 1/4) — TABLE DE VÉRITÉ.
// computeIntensityVerdict est PURE : vm-extraction de la vraie source, chaque
// combinaison d'états → 1 verdict unique. Spec validée Gemini (pyramide stricte,
// post-filtre subjectif 1 cran, calibration mute l'ACWR, bornes ACWR × profil).
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
function extractVar(src, name) {
  const m = src.match(new RegExp('^var ' + name + ' = \\{', 'm'));
  if (!m) throw new Error('NOT FOUND var: ' + name);
  const rest = src.slice(m.index);
  const em = rest.match(/\n\};/);
  return rest.slice(0, em.index + 3);
}

const ctx = vm.createContext({});
vm.runInContext(extractVar(APP, 'INTENSITY_ACWR_BOUNDS'), ctx);
vm.runInContext(extractFn(APP, '_checkinIsBad'), ctx);
vm.runInContext(extractFn(APP, 'computeIntensityVerdict'), ctx);

function verdict(c) {
  return vm.runInContext('computeIntensityVerdict(' + JSON.stringify(c) + ')', ctx);
}
// Check-in normalisé (échelle x10 source) : bon par défaut, surchargeable.
const goodCheckin = { sleep10: 8, energy10: 8, soreness10: 3, motivation10: 8, pain: null };
const badCheckin  = { sleep10: 3, energy10: 8, soreness10: 3, motivation10: 8, pain: null };

describe('Pyramide — crans de sécurité (1-2)', () => {
  test('kill-switch + bonus set dispo → ease (jamais push)', () => {
    const v = verdict({ killSwitch: true, backOffOpportunity: true, acwr: 1.0 });
    expect(v.direction).toBe('ease');
    expect(v.source).toBe('killswitch');
    expect(v.severity).toBe('critical');
  });
  test('douleur aiguë + ACWR sweet spot → ease au CRAN 1 (pas le post-filtre)', () => {
    const v = verdict({ painAcute: true, acwr: 1.0, checkin: goodCheckin });
    expect(v.direction).toBe('ease');
    expect(v.source).toBe('pain');
    expect(v.severity).toBe('critical');
    expect(v.degradedByCheckin).toBeUndefined();
  });
  test('blessure danger → ease critical', () => {
    const v = verdict({ injuryDanger: true, momentumPRs: 5 });
    expect(v.direction).toBe('ease');
    expect(v.source).toBe('injury');
  });
  test('absence 20 jours → ease return-to-play', () => {
    const v = verdict({ absenceDays: 20, acwr: 0.9 });
    expect(v.direction).toBe('ease');
    expect(v.source).toBe('returnToPlay');
  });
});

describe('Pyramide — deload (crans 3-4)', () => {
  test('CAS HISTORIQUE : ovulatoire + 2 PR + 11 sem sans deload → deload (UN seul message)', () => {
    const v = verdict({ cyclePhase: 'ovulatoire', momentumPRs: 2, deloadCalendar: true, acwr: 1.1 });
    expect(v.direction).toBe('deload');
    expect(v.source).toBe('deloadCalendar');
  });
  test('deload data-driven → deload + FLAG resetDeloadCalendar (correctif Gemini #1)', () => {
    const v = verdict({ deloadDataDriven: { needed: true, reason: 'Check-in effondré' }, deloadCalendar: true });
    expect(v.direction).toBe('deload');
    expect(v.source).toBe('deloadData');
    expect(v.reason).toBe('Check-in effondré');
    expect(v.resetDeloadCalendar).toBe(true);
  });
  test('deload data-driven prime sur le calendaire (cran 3 avant 4)', () => {
    const v = verdict({ deloadDataDriven: { needed: true, reason: 'x' }, deloadCalendar: true });
    expect(v.source).toBe('deloadData');
  });
});

describe('Cran 5 — deadlift demain (bypass calibration, correctif Gemini #2)', () => {
  test('calibration + deadlift demain → maintain SANS lire l\'ACWR', () => {
    const v = verdict({ calibrating: true, deadliftTomorrow: true, acwr: 1.8 });
    expect(v.direction).toBe('maintain');
    expect(v.source).toBe('planning');
  });
  test('hors calibration + deadlift demain + acwr 1.4 → ease', () => {
    const v = verdict({ deadliftTomorrow: true, acwr: 1.4 });
    expect(v.direction).toBe('ease');
    expect(v.source).toBe('planning');
  });
  test('hors calibration + deadlift demain + acwr sain (1.1) → pas de contrainte (défaut ACWR : push)', () => {
    const v = verdict({ deadliftTomorrow: true, acwr: 1.1 });
    expect(v.direction).toBe('push');
    expect(v.source).toBe('acwr');
  });
});

describe('Cran 6 — calibration : ACWR totalement muet (correctif Gemini #3)', () => {
  test('calibration + faux ACWR 1.8 → maintain (pas de deload injustifié)', () => {
    const v = verdict({ calibrating: true, acwr: 1.8 });
    expect(v.direction).toBe('maintain');
    expect(v.source).toBe('calibration');
  });
  test('calibration + momentum 3 PR → maintain (jamais push en calibration, profil dormant)', () => {
    const v = verdict({ calibrating: true, momentumPRs: 3, profile: 'agressif' });
    expect(v.direction).toBe('maintain');
    expect(v.source).toBe('calibration');
  });
  test('calibration + check-in TRÈS bas → le signal descendant passe (maintain → ease via post-filtre)', () => {
    const v = verdict({ calibrating: true, checkin: badCheckin });
    expect(v.direction).toBe('ease');
    expect(v.degradedByCheckin).toBe(true);
  });
  test('calibration + deload data-driven (check-in effondré) → deload (crans 1-4 restent actifs)', () => {
    const v = verdict({ calibrating: true, deloadDataDriven: { needed: true, reason: 'x' } });
    expect(v.direction).toBe('deload');
  });
});

describe('Cran 7 — opportunités (rien au-dessus)', () => {
  test('momentum 2 vrais PR → push', () => {
    const v = verdict({ momentumPRs: 2, acwr: 1.0 });
    expect(v.direction).toBe('push');
    expect(v.source).toBe('momentum');
  });
  test('momentum 1 seul PR → pas le déclencheur momentum (défaut ACWR)', () => {
    const v = verdict({ momentumPRs: 1, acwr: 1.35, profile: 'classique' });
    expect(v.source).toBe('acwr');
    expect(v.direction).toBe('maintain');
  });
  test('ovulatoire seul → push', () => {
    const v = verdict({ cyclePhase: 'ovulatoire', acwr: 1.0 });
    expect(v.direction).toBe('push');
    expect(v.source).toBe('cycle');
  });
  test('bonus set dispo seul → push', () => {
    const v = verdict({ backOffOpportunity: true, acwr: 1.0 });
    expect(v.direction).toBe('push');
    expect(v.source).toBe('backoff');
  });
});

describe('Cran 8 — défaut ACWR × profil (bornes ±0.1 Gemini)', () => {
  test('ACWR 1.05 classique, rien d\'autre → push (défaut agressif quand sain)', () => {
    const v = verdict({ acwr: 1.05, profile: 'classique' });
    expect(v.direction).toBe('push');
  });
  test('ACWR 1.35 : agressif=push · classique=maintain · prudent=maintain (1.2-1.4)', () => {
    // NB : le prompt annonçait « prudent=deload/ease à 1.35 » mais 1.35 < 1.4
    // (borne haute prudent) — la TABLE de bornes est la spec normative.
    expect(verdict({ acwr: 1.35, profile: 'agressif' }).direction).toBe('push');
    expect(verdict({ acwr: 1.35, profile: 'classique' }).direction).toBe('maintain');
    expect(verdict({ acwr: 1.35, profile: 'prudent' }).direction).toBe('maintain');
  });
  test('ACWR 1.45 : prudent=deload · classique=maintain · agressif=maintain', () => {
    expect(verdict({ acwr: 1.45, profile: 'prudent' }).direction).toBe('deload');
    expect(verdict({ acwr: 1.45, profile: 'classique' }).direction).toBe('maintain');
    expect(verdict({ acwr: 1.45, profile: 'agressif' }).direction).toBe('maintain');
  });
  test('ACWR 1.55 : classique=deload · agressif=maintain ; 1.65 : agressif=deload', () => {
    expect(verdict({ acwr: 1.55, profile: 'classique' }).direction).toBe('deload');
    expect(verdict({ acwr: 1.55, profile: 'agressif' }).direction).toBe('maintain');
    expect(verdict({ acwr: 1.65, profile: 'agressif' }).direction).toBe('deload');
  });
  test('profil inconnu/absent → bornes classiques', () => {
    expect(verdict({ acwr: 1.35 }).direction).toBe('maintain');
    expect(verdict({ acwr: 1.05 }).direction).toBe('push');
  });
});

describe('Post-filtre subjectif (étape B) — 1 cran max', () => {
  test('ACWR 1.05 + mauvais check-in (sommeil 3/10) → maintain (push dégradé d\'UN cran)', () => {
    const v = verdict({ acwr: 1.05, checkin: badCheckin });
    expect(v.direction).toBe('maintain');
    expect(v.degradedByCheckin).toBe(true);
  });
  test('ACWR 1.05 + PAS de check-in → push (aucune modification)', () => {
    const v = verdict({ acwr: 1.05, checkin: null });
    expect(v.direction).toBe('push');
    expect(v.degradedByCheckin).toBeUndefined();
  });
  test('ACWR 1.05 + bon check-in → push (pas de dégradation)', () => {
    const v = verdict({ acwr: 1.05, checkin: goodCheckin });
    expect(v.direction).toBe('push');
  });
  test('maintain + mauvais check-in (soreness 8/10) → ease', () => {
    const v = verdict({ acwr: 1.35, profile: 'classique', checkin: { sleep10: 8, energy10: 8, soreness10: 8 } });
    expect(v.direction).toBe('ease');
    expect(v.degradedByCheckin).toBe(true);
  });
  test('deload + mauvais check-in → deload (jamais dégradé au-delà)', () => {
    const v = verdict({ deloadCalendar: true, checkin: badCheckin });
    expect(v.direction).toBe('deload');
    expect(v.degradedByCheckin).toBeUndefined();
  });
  test('ease sécurité (kill-switch) + mauvais check-in → inchangé (pas de double peine)', () => {
    const v = verdict({ killSwitch: true, checkin: badCheckin });
    expect(v.direction).toBe('ease');
    expect(v.degradedByCheckin).toBeUndefined();
  });
  test('opportunité momentum + mauvais check-in → maintain (le subjectif tempère l\'opportunité)', () => {
    const v = verdict({ momentumPRs: 3, acwr: 1.0, checkin: badCheckin });
    expect(v.direction).toBe('maintain');
    expect(v.source).toBe('momentum');
  });
});

describe('Pureté & unicité', () => {
  test('le verdict ne mute pas le contexte', () => {
    const c = { acwr: 1.05, checkin: badCheckin, momentumPRs: 2 };
    const snap = JSON.stringify(c);
    verdict(c);
    expect(JSON.stringify(c)).toBe(snap);
  });
  test('toujours exactement UN verdict avec les 4 champs', () => {
    [{}, { killSwitch: true }, { calibrating: true }, { acwr: 2.0 }].forEach(c => {
      const v = verdict(c);
      expect(['push', 'maintain', 'ease', 'deload']).toContain(v.direction);
      expect(typeof v.reason).toBe('string');
      expect(typeof v.source).toBe('string');
      expect(typeof v.severity).toBe('string');
    });
  });
});

// ── Collecteur (prompt 1/4 b) : helpers lecture seule ────────────────────────
describe('_countRealPRsLast7d — vrais PR composés majeurs (jamais les flags morts)', () => {
  const DAY = 86400000;
  function count(logs) {
    const c = vm.createContext({ db: { logs }, _cache: { sbdType: new Map() } });
    vm.runInContext("const VARIANT_KEYWORDS=['pause','spoto','deficit','board'];", c);
    const ENGINE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');
    ['_getSBDTypeRaw', 'getSBDType'].forEach(fn => vm.runInContext(extractFn(ENGINE, fn), c));
    ['_exoMaxRealWeight', 'isRealSetPR', '_detectSessionRealPRs', '_countRealPRsLast7d']
      .forEach(fn => vm.runInContext(extractFn(APP, fn), c));
    return vm.runInContext('_countRealPRsLast7d()', c);
  }
  const mk = (daysAgo, name, repRecords) => ({
    timestamp: Date.now() - daysAgo * DAY,
    exercises: [{ name, repRecords }]
  });
  test('vraie barre squat cette semaine (105 après 100) → 1 PR', () => {
    expect(count([mk(20, 'Squat (Barre)', { '5': 100 }), mk(2, 'Squat (Barre)', { '1': 105 })])).toBe(1);
  });
  test('PR sur ACCESSOIRE seul (curl) → 0 (composés majeurs uniquement)', () => {
    expect(count([mk(20, 'Curl (Haltère)', { '10': 20 }), mk(2, 'Curl (Haltère)', { '10': 25 })])).toBe(0);
  });
  test('OHP compte comme composé majeur', () => {
    expect(count([mk(20, 'Overhead Press', { '5': 50 }), mk(2, 'Overhead Press', { '5': 55 })])).toBe(1);
  });
  test('rep-work sans dépassement (95×8 après 100×5) → 0', () => {
    expect(count([mk(20, 'Squat (Barre)', { '5': 100 }), mk(2, 'Squat (Barre)', { '8': 95 })])).toBe(0);
  });
  test('PR vieux de 10 jours → 0 (fenêtre 7j)', () => {
    expect(count([mk(30, 'Squat (Barre)', { '5': 100 }), mk(10, 'Squat (Barre)', { '1': 110 })])).toBe(0);
  });
});

describe('_planHasDeadliftTomorrow — plan réel, RDL exclu', () => {
  function has(days) {
    const c = vm.createContext({ db: { weeklyPlan: { days } }, _cache: { sbdType: new Map() } });
    vm.runInContext("const VARIANT_KEYWORDS=['pause','spoto','deficit','board'];", c);
    const ENGINE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');
    ['_getSBDTypeRaw', 'getSBDType'].forEach(fn => vm.runInContext(extractFn(ENGINE, fn), c));
    vm.runInContext(extractFn(APP, '_planHasDeadliftTomorrow'), c);
    return vm.runInContext('_planHasDeadliftTomorrow()', c);
  }
  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const tomorrow = JOURS[(new Date().getDay() + 1) % 7];
  test('deadlift au plan de demain → true', () => {
    expect(has([{ day: tomorrow, exercises: [{ name: 'Soulevé de Terre (Barre)' }] }])).toBe(true);
  });
  test('RDL demain → false (accessoire hinge, pas le soulevé de compét)', () => {
    expect(has([{ day: tomorrow, exercises: [{ name: 'Soulevé de Terre Roumain' }] }])).toBe(false);
  });
  test('demain = repos → false ; plan absent → false', () => {
    expect(has([{ day: tomorrow, rest: true, exercises: [{ name: 'Soulevé de Terre (Barre)' }] }])).toBe(false);
    expect(has([])).toBe(false);
  });
});
