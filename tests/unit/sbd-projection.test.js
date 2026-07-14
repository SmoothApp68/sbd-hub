// Projection de palier SBD dans les recos Coach.
// R3 (2/3) : la branche « objectif défini » affiche le prochain palier réaliste
//   (+2.5/5 kg au-delà de l'e1RM courant), borné ≤ 20 sem, plus de date lointaine.
// v346 : predictPR résout le lift via getSBDType (le matcher du PR) au lieu de
//   matchExoName + libellé générique, qui matchait à tort le RDL « Jambes
//   Tendues » → deadlift raté quand le RDL était listé avant le SDT (Barre).
// Valeurs observées par probe avant assertion (vraie source, vm-extraction).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
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
// Base de temps PETITE (100 j) : predictPR régresse sur x = timestamp/86400000.
// Avec les vraies dates (x ≈ 20000) la cancellation flottante rendait `weeks`
// non déterministe (5 ou 6 selon Date.now()) ; x ≈ 100 → régression précise.
// predictPR ne filtre pas par Date.now() (seule la date-string en dépend, non
// assertée), donc une base fixe est valide.
const T0 = 100 * DAY;

// Contexte vm : predictPR + le VRAI getSBDType (le matcher aligné sur le PR).
function makeCtx(logs) {
  const ctx = vm.createContext({ db: { logs }, Date, Math });
  vm.runInContext(ENG.match(/const VARIANT_KEYWORDS=\[[\s\S]*?\];/)[0], ctx);
  vm.runInContext('var _cache = { sbdType: new Map() };', ctx);
  vm.runInContext(extractFn(ENG, '_getSBDTypeRaw'), ctx);
  vm.runInContext(extractFn(ENG, 'getSBDType'), ctx);
  vm.runInContext(extractFn(APP, 'predictPR'), ctx);
  return ctx;
}
// Série d'un seul lift (nom réel), maxRM décroissant récent→ancien.
function runPredict(maxRMs, spacingDays, target, name, liftType) {
  const logs = maxRMs.map((rm, i) => ({
    timestamp: T0 - i * spacingDays * DAY,
    exercises: [{ name: name || 'Squat (Barre)', maxRM: rm }]
  }));
  const ctx = makeCtx(logs);
  return vm.runInContext('predictPR(' + JSON.stringify(liftType || 'squat') + ', ' + target + ')', ctx);
}

describe('predictPR — régression 6 points, semaines = écart ÷ pente (math inchangée)', () => {
  test('pente 2 kg/sem, e1RM 150 → 160 en 5 sem (observé)', () => {
    const r = runPredict([150, 149, 148, 147, 146, 145], 3.5, 160);
    expect(r).toMatchObject({ reachable: true, weeks: 5, currentE1RM: 150, gap: 10 });
    expect(r.weeklyGain).toBe('2.00');
  });
  test('palier proche (155) → 3 sem ; objectif déjà atteint → weeks 0', () => {
    expect(runPredict([150, 149, 148, 147, 146, 145], 3.5, 155).weeks).toBe(3);
    expect(runPredict([150, 149, 148, 147, 146, 145], 3.5, 145).weeks).toBe(0);
  });
  test('pente lente 0.36 kg/sem vers 200 → 119 sem (pathologie contenue à l\'affichage par la borne 20 sem)', () => {
    const rms = [157, 156.6, 156.3, 155.9, 155.5, 155.2];
    expect(runPredict(rms, 7, 200).weeks).toBe(119);
  });
});

describe('predictPR — résolution du lift via getSBDType (fix deadlift v346)', () => {
  // Séance « Ischios Fessiers » type aurel : RDL (jambes tendues, plat) ET
  // SDT (Barre) qui progresse, dans la même séance.
  function mixedLogs(rdlFirst) {
    const logs = [];
    for (let i = 0; i < 6; i++) {
      const sdt = { name: 'Soulevé de Terre (Barre)', maxRM: 200 - i * 0.4 }; // progresse
      const rdl = { name: 'Soulevé de Terre Jambes Tendues', maxRM: 110 };     // plat
      logs.push({ timestamp: T0 - i * 7 * DAY, exercises: rdlFirst ? [rdl, sdt] : [sdt, rdl] });
    }
    return logs;
  }
  test('RDL listé AVANT le SDT (Barre) → palier calculé sur le SDT (plus pollué par le RDL)', () => {
    // Avant fix : .find prenait le RDL (matchExoName trop permissif) → pente 0 → pas de palier.
    const r = vm.runInContext('predictPR("deadlift", 210)', makeCtx(mixedLogs(true)));
    expect(r.reachable).toBe(true);
    expect(r.currentE1RM).toBe(200);         // e1RM du SDT (Barre), pas 110 du RDL
    expect(parseFloat(r.weeklyGain)).toBeGreaterThan(0);
  });
  test('RDL-only (aucun SDT de compétition) → pas de données deadlift → pas de palier', () => {
    const logs = [];
    for (let i = 0; i < 6; i++) logs.push({ timestamp: T0 - i * 7 * DAY,
      exercises: [{ name: 'Soulevé de Terre Jambes Tendues', maxRM: 110 - i }] });
    const r = vm.runInContext('predictPR("deadlift", 150)', makeCtx(logs));
    expect(r.reachable).toBe(false); // getSBDType('...Jambes Tendues') === null → 0 points
  });
  test('bench : DB haltères présent dans la séance → palier bench sur le barre uniquement', () => {
    const logs = [];
    for (let i = 0; i < 6; i++) logs.push({ timestamp: T0 - i * 7 * DAY, exercises: [
      { name: 'Développé Couché (Haltères)', maxRM: 60 },        // exclu (getSBDType null)
      { name: 'Développé Couché (Barre)', maxRM: 140 - i * 0.5 } // le vrai bench
    ] });
    const r = vm.runInContext('predictPR("bench", 150)', makeCtx(logs));
    expect(r.reachable).toBe(true);
    expect(r.currentE1RM).toBe(140);   // barre, pas 60 des haltères
  });
  test('« Soulevé de Terre Roumain » exclu aussi (RDL EN)', () => {
    const logs = [];
    for (let i = 0; i < 6; i++) logs.push({ timestamp: T0 - i * 7 * DAY,
      exercises: [{ name: 'Soulevé de Terre Roumain', maxRM: 120 - i }] });
    expect(vm.runInContext('predictPR("deadlift", 150)', makeCtx(logs)).reachable).toBe(false);
  });
  test('source : predictPR résout via getSBDType, plus via matchExoName ; appelants passent t', () => {
    const body = extractFn(APP, 'predictPR');
    expect(body).toContain('getSBDType(e.name) === liftType');
    expect(body).not.toContain('matchExoName');           // plus le matcher permissif ici
    // les 3 appels passent le type de lift (t), plus le libellé générique
    expect(APP).toContain('predictPR(t, targets[t])');
    expect(APP).toContain('predictPR(t, _palier)');
    expect(APP).toContain('predictPR(t, nextMilestone)');
  });
});

describe('recos Coach — branche « objectif défini » : palier borné, plus de date lointaine', () => {
  test('la projection lointaine « objectif dans ~N sem. (date) » est retirée', () => {
    expect(APP).not.toContain('objectif dans ~');
  });
  test('palier ancré sur le PR RÉEL (pr[t]), plus sur l\'e1RM courant, sans libellé « e1RM »', () => {
    // le palier ne doit jamais tomber sous le PR affiché (« 137.5 » alors que PR 140)
    expect(APP).toContain('• prochain palier ' + "' + _palier + 'kg dans ~'");
    expect(APP).not.toContain('prochain palier e1RM ');
    expect(APP).toContain('Math.floor(pr[t] / _inc) * _inc + _inc');
    expect(APP).not.toContain('Math.floor(pred.currentE1RM / _inc)');
  });
  test('palier borné par l\'objectif et échéance bornée ≤ 20 sem (les DEUX branches)', () => {
    expect(APP).toContain('Math.min(targets[t], Math.floor(pr[t]');
    // branche objectif + branche « prochain cap » : 2 occurrences de la borne
    expect((APP.match(/weeks > 0 && \w+\.weeks <= 20/g) || []).length).toBe(2);
  });
  test('incrément via getDPIncrement sur le PR (plancher 2.5), « objectif atteint » conservé', () => {
    expect(APP).toContain('Math.max(2.5, getDPIncrement(_exoName, pr[t]) || 0)');
    expect(APP).toContain('objectif atteint !');
  });
  test('guide pr_prediction : palier = PR réel (plus « e1RM courant »)', () => {
    const m = APP.match(/pr_prediction: \{[\s\S]*?\},/);
    expect(m[0]).toContain('PR réel arrondi');
    expect(m[0]).toContain('20 semaines');
    expect(m[0]).not.toContain('e1RM courant arrondi');
  });
});
