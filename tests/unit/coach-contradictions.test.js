// Fix 2 contradictions Coach : (1) verdict Insolvency retiré + leviers gelés,
// (2) alertes Volume MRV du Diagnostic retirées (bug d'unité 30j vs hebdo).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const COACH = fs.readFileSync(path.join(ROOT, 'js', 'coach.js'), 'utf8');
const ENG = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');

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
const DAY = 86400000;

describe('contradiction 1 — verdict Insolvency retiré', () => {
  test('analyzeAthleteProfileWithInsolvency est un passthrough (plus de Banqueroute)', () => {
    const body = extractFn(COACH, 'analyzeAthleteProfileWithInsolvency');
    expect(body).not.toContain('Banqueroute');
    expect(body).not.toContain('Bilan de Récupération');
    expect(body).toContain('return typeof analyzeAthleteProfile');
  });
  test('C3b gelé : plus de modulateur Insolvency dans wpGeneratePowerbuildingDay', () => {
    const body = extractFn(APP, 'wpGeneratePowerbuildingDay');
    expect(body).not.toContain('_insolvencyLevel'); // plus aucune lecture de l'index
    expect(body).not.toContain('calcInsolvencyIndex'); // plus de calcul de l'index
    expect(body).not.toContain('Index Insolvency');    // plus de note coach
  });
});

describe('contradiction 1 — auto-tuner sur signal réel (jointAlerts), plus l\'index cassé', () => {
  function run(opts) {
    const now = Date.now();
    const ctx = vm.createContext({
      db: { user: {}, weeklyPlan: {}, logs: opts.logs },
      getMuscleContributions: () => [{ muscle: 'Quadriceps', coeff: 1 }],
      getMuscleKey: () => 'quads',
      getMuscleVolumeTarget: () => ({ MEV: 8, MAV_high: 16, MRV: 20 }),
      getJointStressAlerts: () => opts.jointAlerts || [],
      VOLUME_DELTA_LIMITS: { max: 4, min: -4 },
      Date
    });
    vm.runInContext(extractFn(COACH, 'calcVolumeAutoTune'), ctx);
    return vm.runInContext('calcVolumeAutoTune(db.logs)', ctx);
  }
  // 12 séances denses sur 4 sem, quads à ~18 sets/sem (≥ MAV_high 16), en hausse.
  function denseLogs(setsPerSession) {
    const logs = [];
    for (let d = 2; d <= 26; d += 2) {
      logs.push({ timestamp: Date.now() - d * DAY, exercises: [
        { name: 'Squat', allSets: Array.from({ length: setsPerSession }, () => ({ weight: 100, reps: 5, rpe: 8, setType: 'normal' })) }
      ] });
    }
    return logs;
  }
  test('volume haut + en hausse + AUCUNE articulation rouge → suggère +1 (avant : mort car insolvency<0.9 jamais vrai)', () => {
    // early 4 sets/session, late 6 → trend > 0 ; ~18 sets/sem late
    const logs = [];
    for (let d = 26; d >= 15; d -= 2) logs.push({ timestamp: Date.now() - d * DAY, exercises: [{ name: 'Squat', allSets: Array.from({length:4},()=>({weight:100,reps:5,rpe:8,setType:'normal'})) }] });
    for (let d = 12; d >= 2; d -= 2) logs.push({ timestamp: Date.now() - d * DAY, exercises: [{ name: 'Squat', allSets: Array.from({length:9},()=>({weight:100,reps:5,rpe:8,setType:'normal'})) }] });
    const r = run({ logs, jointAlerts: [] });
    expect(r.quads).toBe(1); // +1 delta
  });
  test('même volume MAIS genou en zone rouge → PAS de +1 (récup KO), et -1 déclenché', () => {
    const logs = [];
    for (let d = 26; d >= 15; d -= 2) logs.push({ timestamp: Date.now() - d * DAY, exercises: [{ name: 'Squat', allSets: Array.from({length:9},()=>({weight:100,reps:5,rpe:8,setType:'normal'})) }] });
    for (let d = 12; d >= 2; d -= 2) logs.push({ timestamp: Date.now() - d * DAY, exercises: [{ name: 'Squat', allSets: Array.from({length:9},()=>({weight:100,reps:5,rpe:8,setType:'normal'})) }] });
    const r = run({ logs, jointAlerts: [{ joint: 'genoux', level: 'red' }] });
    expect(r.quads).toBe(-1); // réduction sur signal articulaire réel
  });
});

describe('contradiction 2 — alertes Volume MRV retirées du Diagnostic', () => {
  test('analyzeAthleteProfile ne compare plus un cumul 30j au MRV hebdo', () => {
    const body = extractFn(ENG, 'analyzeAthleteProfile');
    expect(body).not.toContain('au-dessus du MRV');
    expect(body).not.toContain('Volume ' + "' + label + '" + ' insuffisant'); // gabarit retiré
    expect(body).not.toContain('var volumes   = getVolumeByMuscleGroup')       // décl orpheline retirée
      && expect(body).not.toContain('volumes[key]');
  });
  test('conservé : Volume Spike (7j vs 7j) et fatigue SNC restent dans le Diagnostic', () => {
    const body = extractFn(ENG, 'analyzeAthleteProfile');
    expect(body).toContain('Volume Spike');
    expect(body).toContain('Fatigue Systémique (SNC)');
  });
});
