// Fix welcome-back v4 — trigger boot-local (indépendant du cloud/email).
// Le welcome-back doit se déclencher pour un utilisateur DÉJÀ onboardé dont la
// version est en retard, et PAS pour un nouvel utilisateur (flux cloud+email).
// vm-extraction de la vraie source (needsOnboarding + ONBOARDING_VERSION).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
const ENG = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');

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
const ONBOARDING_VERSION = parseInt((ENG.match(/const ONBOARDING_VERSION\s*=\s*(\d+)/) || [])[1], 10);

// condition boot-local exacte (app.js init) : onboarded ET needsOnboarding()
function bootTrigger(user) {
  const ctx = vm.createContext({ db: { user }, ONBOARDING_VERSION });
  vm.runInContext(extractFn(APP, 'needsOnboarding'), ctx);
  return vm.runInContext('!!(db.user && db.user.onboarded && needsOnboarding())', ctx);
}

describe('trigger boot-local welcome-back', () => {
  test('ONBOARDING_VERSION vaut bien 4', () => { expect(ONBOARDING_VERSION).toBe(4); });

  test('cas aurel (onboardé, version 3 number) → welcome-back se déclenche', () => {
    expect(bootTrigger({ onboarded: true, onboardingVersion: 3 })).toBe(true);
  });
  test('cas aurel (version "3" STRING, comme en base) → se déclenche pareil', () => {
    expect(bootTrigger({ onboarded: true, onboardingVersion: '3' })).toBe(true);
  });
  test('utilisateur à jour (version 4) → PAS de trigger', () => {
    expect(bootTrigger({ onboarded: true, onboardingVersion: 4 })).toBe(false);
  });
  test('NOUVEL utilisateur (non onboardé) → PAS de trigger boot-local (flux cloud gère)', () => {
    expect(bootTrigger({ onboarded: false, onboardingVersion: 0 })).toBe(false);
  });
  test('onboardé sans version (undefined) → se déclenche (needsOnboarding via !version)', () => {
    expect(bootTrigger({ onboarded: true })).toBe(true);
  });
});

// Normalisations (commit 2) — la migration vit dans l'IIFE db (inline), donc
// source-assert de présence ; le comportement runtime est prouvé en e2e.
describe('normalisations de chargement', () => {
  test('onboardingVersion normalisé en nombre (parseInt) au chargement', () => {
    expect(/parseInt\(p\.user\.onboardingVersion, 10\)/.test(APP)).toBe(true);
  });
  test('coachingStyle migré via == null (couvre null explicite des profils cloud)', () => {
    expect(APP.includes("if (p.user.coachingStyle == null) p.user.coachingStyle = 'classique'")).toBe(true);
  });
  test('showOnboarding est idempotent (no-op si overlay déjà ouvert)', () => {
    expect(APP.includes("if (_ob && _ob.style.display === 'flex') return;")).toBe(true);
  });
});
