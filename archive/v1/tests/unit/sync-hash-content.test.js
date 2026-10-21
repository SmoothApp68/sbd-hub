// SYNC-HASH (fix 22/07/2026) — _computeDataHash signait la LONGUEUR de db.user
// (JSON.stringify(...).length), pas son contenu → toute modification préservant la
// longueur était INVISIBLE à la sync : syncToCloud court-circuite sur hash inchangé
// (`if (db._lastSyncHash === _hash) return;`) → la modification n'est jamais poussée
// et se perd au reload suivant. Reproduit en device sur les objectifs SBD.
// Le fix signe le CONTENU (djb2 sur la chaîne déjà sérialisée) pour d.user,
// d.weeklyPlan et d.bestPR — les 3 champs qui utilisaient le motif `.length`.
// Vraie source via vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPA = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'supabase.js'), 'utf8');

function extractFn(src, name) {
  const m = src.match(new RegExp('^(?:async )?function ' + name + '\\b[\\s\\S]*?^}', 'm'));
  if (!m) throw new Error('Could not extract fn ' + name);
  return m[0];
}

const ctx = { JSON, Object, console: { warn() {}, log() {} } };
vm.createContext(ctx);
vm.runInContext(extractFn(SUPA, '_computeDataHash'), ctx);
const hash = (d) => { ctx.__d = d; return vm.runInContext('_computeDataHash(__d)', ctx); };

// Base réaliste : un profil rempli (le hash doit rester stable si RIEN ne change)
const baseDb = () => ({
  logs: [{ id: 'w1', timestamp: 1000, editedAt: 1000 }],
  exercises: { 'Squat (Barre)': { e1rm: 157 } },
  earnedBadges: { first: true },
  activityLogs: [],
  readiness: [],
  readinessHistory: [{ ts: 500 }],
  xpHighWaterMark: 1200,
  lastModified: 42,
  user: { name: 'Aurélien', bw: 98, age: 28, targets: { squat: 155, bench: 150, deadlift: 220 } },
  weeklyPlan: { days: [{ name: 'Lundi', exercises: [{ name: 'Squat', sets: 4 }] }] },
  bestPR: { squat: 145, bench: 140, deadlift: 170 },
});

describe('SYNC-HASH — le repro device : objectifs SBD de même longueur', () => {
  test('targets {155,150,220} → {150,145,175} (longueurs identiques) → hash DIFFÉRENT → push effectué', () => {
    const before = baseDb();
    const after = baseDb();
    after.user.targets = { squat: 150, bench: 145, deadlift: 175 };
    // Preuve que l'ancien signal (.length) était aveugle à ce changement :
    expect(JSON.stringify(before.user).length).toBe(JSON.stringify(after.user).length);
    // Le nouveau hash, lui, bascule :
    expect(hash(before)).not.toBe(hash(after));
  });

  test('bw 98 → 97 (même longueur) → hash DIFFÉRENT', () => {
    const before = baseDb();
    const after = baseDb();
    after.user.bw = 97;
    expect(JSON.stringify(before.user).length).toBe(JSON.stringify(after.user).length);
    expect(hash(before)).not.toBe(hash(after));
  });

  test('âge 28 → 29 (même longueur) → hash DIFFÉRENT', () => {
    const before = baseDb();
    const after = baseDb();
    after.user.age = 29;
    expect(hash(before)).not.toBe(hash(after));
  });

  test('permutation pure (même longueur, même caractères déplacés) → hash DIFFÉRENT', () => {
    const before = baseDb();
    const after = baseDb();
    after.user.targets = { squat: 150, bench: 155, deadlift: 220 }; // 155 et 150 échangés
    expect(JSON.stringify(before.user).length).toBe(JSON.stringify(after.user).length);
    expect(hash(before)).not.toBe(hash(after));
  });
});

describe('SYNC-HASH — les 2 autres champs qui utilisaient le motif .length', () => {
  test('bestPR : squat 145 → 150 (même longueur) → hash DIFFÉRENT', () => {
    const before = baseDb();
    const after = baseDb();
    after.bestPR = { squat: 150, bench: 140, deadlift: 170 };
    expect(JSON.stringify(before.bestPR).length).toBe(JSON.stringify(after.bestPR).length);
    expect(hash(before)).not.toBe(hash(after));
  });

  test('weeklyPlan : sets 4 → 5 (même longueur) → hash DIFFÉRENT', () => {
    const before = baseDb();
    const after = baseDb();
    after.weeklyPlan.days[0].exercises[0].sets = 5;
    expect(JSON.stringify(before.weeklyPlan).length).toBe(JSON.stringify(after.weeklyPlan).length);
    expect(hash(before)).not.toBe(hash(after));
  });

  test('weeklyPlan : renommage de jour de même longueur → hash DIFFÉRENT', () => {
    const before = baseDb();
    const after = baseDb();
    after.weeklyPlan.days[0].name = 'Mardi'; // 'Lundi' → 'Mardi', 5 caractères
    expect(JSON.stringify(before.weeklyPlan).length).toBe(JSON.stringify(after.weeklyPlan).length);
    expect(hash(before)).not.toBe(hash(after));
  });
});

describe('SYNC-HASH — non-régression du skip (sémantique inchangée)', () => {
  test('aucune modification → hash IDENTIQUE → push sauté', () => {
    expect(hash(baseDb())).toBe(hash(baseDb()));
  });

  test('le hash est stable sur plusieurs appels du même objet', () => {
    const d = baseDb();
    expect(hash(d)).toBe(hash(d));
  });

  test('db vide / absent → pas de crash', () => {
    expect(hash(null)).toBe('');
    expect(typeof hash({})).toBe('string');
  });

  test('les signaux historiques restent actifs (log ajouté, check-in, xp)', () => {
    const base = baseDb();
    const withLog = baseDb(); withLog.logs.unshift({ id: 'w2', timestamp: 2000, editedAt: 2000 });
    expect(hash(base)).not.toBe(hash(withLog));
    const withRh = baseDb(); withRh.readinessHistory = [{ ts: 900 }];
    expect(hash(base)).not.toBe(hash(withRh));
    const withXp = baseDb(); withXp.xpHighWaterMark = 1300;
    expect(hash(base)).not.toBe(hash(withXp));
  });

  test('édition d\'un log ancien (editedAt) reste détectée — non-régression SYNC-LOT1', () => {
    const base = baseDb();
    const edited = baseDb(); edited.logs[0].editedAt = 5000;
    expect(hash(base)).not.toBe(hash(edited));
  });
});
