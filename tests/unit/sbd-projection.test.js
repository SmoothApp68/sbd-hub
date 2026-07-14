// Fix justesse Coach R3 (2/3) : la branche « objectif défini » des recos SBD
// n'affiche plus de date lointaine (« objectif dans ~117 sem. (2028) ») mais le
// prochain palier réaliste (+2.5/5 kg au-delà de l'e1RM courant), borné ≤ 20 sem
// comme la branche « prochain cap ». predictPR elle-même est INCHANGÉE (la borne
// vit à l'affichage). Valeurs observées par probe avant assertion.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

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

function runPredict(maxRMs, spacingDays, target) {
  const logs = maxRMs.map((rm, i) => ({
    timestamp: Date.now() - i * spacingDays * DAY,
    exercises: [{ name: 'Squat (Barre)', maxRM: rm }]
  }));
  const ctx = vm.createContext({ db: { logs }, matchExoName: (a, b) => a === b, Date, Math });
  vm.runInContext(extractFn(APP, 'predictPR'), ctx);
  return vm.runInContext('predictPR("Squat (Barre)", ' + target + ')', ctx);
}

describe('predictPR — INCHANGÉE (régression 6 points, semaines = écart ÷ pente)', () => {
  test('pente 2 kg/sem, e1RM 150 → 160 en 5 sem (observé)', () => {
    const r = runPredict([150, 149, 148, 147, 146, 145], 3.5, 160);
    expect(r).toMatchObject({ reachable: true, weeks: 5, currentE1RM: 150, gap: 10 });
    expect(r.weeklyGain).toBe('2.00');
  });
  test('palier proche (155) → 3 sem ; objectif déjà atteint → weeks 0', () => {
    expect(runPredict([150, 149, 148, 147, 146, 145], 3.5, 155).weeks).toBe(3);
    expect(runPredict([150, 149, 148, 147, 146, 145], 3.5, 145).weeks).toBe(0);
  });
  test('pente lente 0.36 kg/sem vers 200 → 119 sem (la pathologie existe toujours dans predictPR — la borne vit à l\'affichage)', () => {
    const rms = [157, 156.6, 156.3, 155.9, 155.5, 155.2];
    expect(runPredict(rms, 7, 200).weeks).toBe(119);
  });
});

describe('recos Coach — branche « objectif défini » : palier borné, plus de date lointaine', () => {
  test('la projection lointaine « objectif dans ~N sem. (date) » est retirée', () => {
    expect(APP).not.toContain('objectif dans ~');
  });
  test('remplacée par le prochain palier e1RM (référentiel explicite)', () => {
    expect(APP).toContain('prochain palier e1RM ');
    expect(APP).toContain('Math.floor(pred.currentE1RM / _inc) * _inc + _inc');
  });
  test('palier borné par l\'objectif et échéance bornée ≤ 20 sem (les DEUX branches)', () => {
    expect(APP).toContain('Math.min(targets[t], Math.floor(pred.currentE1RM');
    // branche objectif + branche « prochain cap » : 2 occurrences de la borne
    expect((APP.match(/weeks > 0 && \w+\.weeks <= 20/g) || []).length).toBe(2);
  });
  test('incrément via getDPIncrement (plancher 2.5), « objectif atteint » conservé', () => {
    expect(APP).toContain('Math.max(2.5, getDPIncrement(_exoName, pred.currentE1RM) || 0)');
    expect(APP).toContain('objectif atteint !');
  });
  test('guide pr_prediction mis à jour (palier + borne 20 semaines)', () => {
    const m = APP.match(/pr_prediction: \{[\s\S]*?\},/);
    expect(m[0]).toContain('palier');
    expect(m[0]).toContain('20 semaines');
    expect(m[0]).not.toContain('~11 semaines');
  });
});
