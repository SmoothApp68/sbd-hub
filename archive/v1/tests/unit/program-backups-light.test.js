// PROGRAMME — backups allégés (v291). Ne plus stocker weeklyPlan/mesoWeeks quand un
// customProgramTemplate (structure régénérable) existe. Fonctions PURES vm-extraites
// de la vraie source js/app.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('^function ' + name + '\\b[\\s\\S]*?^}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('Could not extract ' + name);
  return m[0];
}

const ctx = { Object: Object, JSON: JSON };
vm.createContext(ctx);
vm.runInContext(extractFn(APP, '_backupHasTemplate'), ctx);
vm.runInContext(extractFn(APP, '_buildBackupSnapshot'), ctx);
vm.runInContext(extractFn(APP, '_lightenBackup'), ctx);
vm.runInContext(extractFn(APP, '_migrateLightenBackups'), ctx);

const hasTemplate = (b) => { ctx.__b = b; return vm.runInContext('_backupHasTemplate(__b)', ctx); };
const buildSnap = (wp, r, t, m, n) => { ctx.__wp = wp; ctx.__r = r; ctx.__t = t; ctx.__m = m; ctx.__n = n;
  return vm.runInContext('_buildBackupSnapshot(__wp, __r, __t, __m, __n)', ctx); };
const lighten = (b) => { ctx.__l = b; return vm.runInContext('_lightenBackup(__l)', ctx); };
const migrate = (arr) => { ctx.__a = arr; return vm.runInContext('_migrateLightenBackups(__a)', ctx); };

const TPL = { id: 't1', name: 'Prog', blocks: [{ sessions: [{ dayIndex: 0, label: 'Squat', exercises: [{ name: 'Squat', slot: 'main_lift' }] }] }] };
const WP = { days: [{ day: 'Lundi' }], mesoWeeks: [{ weekNumber: 1, days: [] }], currentBlock: { phase: 'force' } };

describe('PROGRAMME v291 — _buildBackupSnapshot', () => {
  test('backup_leger_si_template : AVEC template → pas de clé weeklyPlan', () => {
    const snap = buildSnap(WP, { Lundi: 'Squat' }, TPL, 'custom', 1000);
    expect('weeklyPlan' in snap).toBe(false);
    expect(snap.customProgramTemplate).toBe(TPL);
    expect(snap.routine).toEqual({ Lundi: 'Squat' });
    expect(snap.savedAt).toBe(1000);
    expect(snap.sessionCount).toBe(0);
  });

  test('backup_garde_weeklyplan_si_pas_template : SANS template → weeklyPlan conservé', () => {
    const snap = buildSnap(WP, null, null, 'auto', 2000);
    expect(snap.weeklyPlan).toBe(WP);
    expect(snap.customProgramTemplate).toBe(null);
  });
});

describe('PROGRAMME v291 — _backupHasTemplate', () => {
  test('template présent → true ; absent/null → false', () => {
    expect(hasTemplate({ customProgramTemplate: TPL })).toBe(true);
    expect(hasTemplate({ customProgramTemplate: null })).toBe(false);
    expect(hasTemplate({})).toBe(false);
    expect(hasTemplate(null)).toBe(false);
  });
});

describe('PROGRAMME v291 — _lightenBackup', () => {
  test('backup à template + weeklyPlan → weeklyPlan retiré (mesoWeeks parti), reste conservé', () => {
    const heavy = { savedAt: 5, programMode: 'auto', customProgramTemplate: TPL, routine: { Lundi: 'x' }, weeklyPlan: WP };
    const light = lighten(heavy);
    expect('weeklyPlan' in light).toBe(false);
    expect(light.customProgramTemplate).toBe(TPL);
    expect(light.routine).toEqual({ Lundi: 'x' });
    expect(light.savedAt).toBe(5);
  });

  test('idempotent : re-alléger un backup déjà léger → même référence', () => {
    const light = lighten({ customProgramTemplate: TPL, savedAt: 1 });
    expect(lighten(light)).toBe(light);
  });

  test('défensif : backup SANS template → inchangé (même référence, weeklyPlan préservé)', () => {
    const legacy = { customProgramTemplate: null, weeklyPlan: WP, savedAt: 9 };
    expect(lighten(legacy)).toBe(legacy);
    expect(legacy.weeklyPlan).toBe(WP);
  });
});

describe('PROGRAMME v291 — _migrateLightenBackups', () => {
  test('allège ceux à template, laisse les autres, renvoie le compte', () => {
    const arr = [
      { customProgramTemplate: TPL, weeklyPlan: WP, savedAt: 1 }, // → allégé
      { customProgramTemplate: null, weeklyPlan: WP, savedAt: 2 }, // → inchangé (legacy)
      { customProgramTemplate: TPL, savedAt: 3 },                  // → déjà léger
    ];
    const n = migrate(arr);
    expect(n).toBe(1);
    expect('weeklyPlan' in arr[0]).toBe(false);
    expect(arr[1].weeklyPlan).toBe(WP);
    expect('weeklyPlan' in arr[2]).toBe(false);
  });

  test('idempotent : 2e passage → 0 modif', () => {
    const arr = [{ customProgramTemplate: TPL, weeklyPlan: WP, savedAt: 1 }];
    expect(migrate(arr)).toBe(1);
    expect(migrate(arr)).toBe(0);
  });

  test('tableau vide / absent → 0', () => {
    expect(migrate([])).toBe(0);
    expect(migrate(undefined)).toBe(0);
  });
});
