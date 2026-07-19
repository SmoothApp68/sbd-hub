// RC4 — garde d'identité (P0 RGPD). L'app était aveugle à l'identité : un blob local
// résiduel (compte précédent / profil supprimé) était adopté et poussé vers le cloud du
// compte entrant. La garde tatoue le propriétaire et purge sur non-correspondance.
// Fonctions extraites de la VRAIE source (app.js / engine.js) via vm — pas de copie.
// Seul defaultDB est un DOUBLE de test minimal (on teste la garde, pas defaultDB).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}
function extractConstArr(src, name) {
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*\\[[^\\]]*\\];'));
  if (!m) throw new Error('Could not extract const ' + name);
  return m[0];
}
function extractArrowConst(src, name) {
  const m = src.match(new RegExp('const ' + name + ' = \\(\\) => \\(\\{[\\s\\S]*?\\n\\}\\);'));
  if (!m) throw new Error('Could not extract arrow const ' + name);
  return m[0];
}

function makeLS() {
  const store = {};
  return {
    _store: store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function buildCtx(ls, initialDb) {
  const ctx = { JSON: JSON, localStorage: ls, console: { warn() {}, log() {} } };
  vm.createContext(ctx);
  vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", ctx);
  vm.runInContext(extractConstArr(ENGINE, 'SBD_HUB_ALL_KEYS'), ctx); // référence STORAGE_KEY
  // Double de test : la garde remplace db par un defaultDB « propre ». On ne teste pas
  // le contenu de defaultDB (couvert ailleurs), seulement le contrôle de flux de la garde.
  vm.runInContext('var defaultDB = () => ({ user: {}, logs: [] });', ctx);
  vm.runInContext(extractFn(APP, 'purgeAllLocalDb'), ctx);
  vm.runInContext(extractFn(APP, '_identityVerdict'), ctx);
  vm.runInContext(extractFn(APP, '_stampOwner'), ctx);
  vm.runInContext(extractFn(APP, 'assertIdentityOrReset'), ctx);
  ctx.db = initialDb;
  return ctx;
}

function seedResidual(ls, blob) {
  // Un appareil pré-fix porte le blob sous V29 ET la clé legacy SBD_HUB.
  ls.setItem('SBD_HUB_V29', JSON.stringify(blob));
  ls.setItem('SBD_HUB', JSON.stringify(blob));
}

describe('RC4 — _identityVerdict : décision pure de la garde', () => {
  const verdict = (o, i) => {
    const ctx = buildCtx(makeLS(), null);
    ctx._o = o; ctx._i = i;
    return vm.runInContext('_identityVerdict(_o, _i)', ctx);
  };
  test('propriétaire différent → reset', () => { expect(verdict('A', 'B')).toBe('reset'); });
  test('même propriétaire authentifié → keep', () => { expect(verdict('A', 'A')).toBe('keep'); });
  test('propriétaire inconnu (blob non tatoué) + uid entrant → reset', () => {
    expect(verdict(null, 'B')).toBe('reset');
    expect(verdict(undefined, 'B')).toBe('reset');
  });
  test('pas encore d\'identité authentifiée → ignore', () => { expect(verdict('A', null)).toBe('ignore'); });
});

describe('RC4 — assertIdentityOrReset : purge sur non-correspondance, conserve sinon', () => {
  const ALEX = { user: { ownerUid: 'A', name: 'AlexGuerrier' }, logs: [{ id: 1 }], bestPR: { squat: 110, bench: 80, deadlift: 140 } };

  test('(a)+(c) uid entrant B ≠ propriétaire A → reset : blob de A purgé, jamais poussable', () => {
    const ls = makeLS();
    seedResidual(ls, ALEX);
    const ctx = buildCtx(ls, JSON.parse(JSON.stringify(ALEX)));
    const wasReset = vm.runInContext("assertIdentityOrReset('B')", ctx);
    expect(wasReset).toBe(true);
    // db en mémoire ne contient plus AlexGuerrier — ce qui serait poussé au cloud de B est vierge
    expect(ctx.db.user.name).toBeUndefined();
    expect(ctx.db.logs).toEqual([]);
    expect(ctx.db.bestPR).toBeUndefined();
    // db tatoué au nom de B ; toutes les clés SBD_HUB* purgées (dont la legacy)
    expect(ctx.db.user.ownerUid).toBe('B');
    expect(Object.keys(ls._store).filter((k) => k.indexOf('SBD_HUB') === 0)).toEqual([]);
  });

  test('(c bis) blob résiduel NON tatoué (legacy) + uid entrant → reset aussi', () => {
    const ls = makeLS();
    const residual = { user: { name: 'AlexGuerrier' }, logs: [{ id: 1 }], bestPR: { squat: 110 } };
    seedResidual(ls, residual);
    const ctx = buildCtx(ls, JSON.parse(JSON.stringify(residual)));
    const wasReset = vm.runInContext("assertIdentityOrReset('B')", ctx);
    expect(wasReset).toBe(true);
    expect(ctx.db.user.name).toBeUndefined();
    expect(ctx.db.logs).toEqual([]);
    expect(ctx.db.user.ownerUid).toBe('B');
    expect(Object.keys(ls._store).filter((k) => k.indexOf('SBD_HUB') === 0)).toEqual([]);
  });

  test('(d) même personne (uid == propriétaire) → keep : le blob est conservé intact', () => {
    const ls = makeLS();
    const mine = { user: { ownerUid: 'A', name: 'Aurel' }, logs: [{ id: 1 }, { id: 2 }], bestPR: { squat: 145 } };
    ls.setItem('SBD_HUB_V29', JSON.stringify(mine));
    const ctx = buildCtx(ls, JSON.parse(JSON.stringify(mine)));
    const wasReset = vm.runInContext("assertIdentityOrReset('A')", ctx);
    expect(wasReset).toBe(false);
    // rien n'est purgé ni écrasé
    expect(ctx.db.user.name).toBe('Aurel');
    expect(ctx.db.logs).toHaveLength(2);
    expect(ctx.db.bestPR.squat).toBe(145);
    expect(ctx.db.user.ownerUid).toBe('A');
    expect(ls.getItem('SBD_HUB_V29')).not.toBeNull(); // blob conservé sur disque
  });

  test('uid entrant vide (pas d\'identité) → no-op, blob intact', () => {
    const ls = makeLS();
    const ctx = buildCtx(ls, JSON.parse(JSON.stringify(ALEX)));
    const wasReset = vm.runInContext("assertIdentityOrReset('')", ctx);
    expect(wasReset).toBe(false);
    expect(ctx.db.user.name).toBe('AlexGuerrier');
  });

  test('le reset efface AUSSI les marqueurs de sync device-local (anti-écrasement du cloud)', () => {
    const ls = makeLS();
    seedResidual(ls, ALEX);
    // marqueurs device-local survivants d'un ancien propriétaire (hors SBD_HUB*)
    ls.setItem('_lastCloudPush', '1720000000000');
    ls.setItem('_lastCloudSync', '999');
    ls.setItem('_wsSyncedHashes', '{"1":"h"}');
    const ctx = buildCtx(ls, JSON.parse(JSON.stringify(ALEX)));
    vm.runInContext("assertIdentityOrReset('B')", ctx);
    // sans ça, _lastCloudPush survivant ferait pousser le defaultDB vide par-dessus le cloud
    expect(ls.getItem('_lastCloudPush')).toBeNull();
    expect(ls.getItem('_lastCloudSync')).toBeNull();
    expect(ls.getItem('_wsSyncedHashes')).toBeNull();
  });
});

describe('RC4 — _canPushForOwner : défense terminale de push', () => {
  const can = (o, s) => {
    const ctx = buildCtx(makeLS(), null);
    vm.runInContext(extractFn(APP, '_canPushForOwner'), ctx);
    ctx._o = o; ctx._s = s;
    return vm.runInContext('_canPushForOwner(_o, _s)', ctx);
  };
  test('blob tatoué A, session B → push REFUSÉ', () => { expect(can('A', 'B')).toBe(false); });
  test('même propriétaire → push autorisé', () => { expect(can('A', 'A')).toBe(true); });
  test('propriétaire absent (backfill au 1er push) → autorisé', () => { expect(can(null, 'B')).toBe(true); });
  test('session absente → autorisé (rien à comparer)', () => { expect(can('A', null)).toBe(true); });
});

describe('RC4 — le reset efface les champs porteurs de santé (VRAI defaultDB, pas un double)', () => {
  test('un blob résiduel avec données de santé est entièrement remis à zéro après reset', () => {
    const ls = makeLS();
    const ctx = { JSON: JSON, localStorage: ls, console: { warn() {}, log() {} } };
    vm.createContext(ctx);
    vm.runInContext("const STORAGE_KEY='SBD_HUB_V29';", ctx);
    vm.runInContext(extractConstArr(ENGINE, 'SBD_HUB_ALL_KEYS'), ctx);
    vm.runInContext(extractArrowConst(APP, 'defaultDB'), ctx); // VRAI defaultDB extrait de app.js
    vm.runInContext(extractFn(APP, 'purgeAllLocalDb'), ctx);
    vm.runInContext(extractFn(APP, '_identityVerdict'), ctx);
    vm.runInContext(extractFn(APP, '_stampOwner'), ctx);
    vm.runInContext(extractFn(APP, 'assertIdentityOrReset'), ctx);
    const residual = {
      user: { ownerUid: 'A', name: 'AlexGuerrier', consentHealth: true, medicalConsent: true, bw: 82, gender: 'homme' },
      logs: [{ id: 1 }],
      bestPR: { squat: 110, bench: 80, deadlift: 140 },
      garminHealth: { hrv: [55, 60], rhr: 48 },
      readinessHistory: [{ sleep: 3, energy: 4 }],
    };
    ls.setItem('SBD_HUB_V29', JSON.stringify(residual));
    ctx.db = JSON.parse(JSON.stringify(residual));
    const wasReset = vm.runInContext("assertIdentityOrReset('B')", ctx);
    expect(wasReset).toBe(true);
    // Toutes les données de santé de A disparaissent (db = vrai defaultDB, tatoué B)
    expect(ctx.db.garminHealth).toBeUndefined();
    expect(ctx.db.readinessHistory).toBeUndefined();
    expect(ctx.db.user.name).toBe('');
    expect(ctx.db.user.consentHealth).toBe(false);
    expect(ctx.db.user.medicalConsent).toBe(false);
    expect(ctx.db.user.bw).toBe(0);
    expect(ctx.db.bestPR).toEqual({ bench: 0, squat: 0, deadlift: 0 });
    expect(ctx.db.logs).toEqual([]);
    expect(ctx.db.user.ownerUid).toBe('B');
  });
});
