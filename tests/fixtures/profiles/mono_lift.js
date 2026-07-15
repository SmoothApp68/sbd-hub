/**
 * PROFIL « mono_lift » — ne fait QUE du bench. Aucun squat, aucun row, aucun
 * deadlift, aucun OHP. Dénominateurs de ratios systématiquement absents.
 *
 * STRESSE :
 *  - computeStrengthRatiosDetailed (engine.js:2589) : squat/deadlift/ohp/row = 0.
 *    squat_bench = (bench>0 ? squat/bench : null) → squat=0 → 0/140 = 0 (PAS null !)
 *    → un ratio 0.00 pourrait être classé « danger < 0.85 » alors que la donnée
 *    est ABSENTE, pas mauvaise. Piège de fausse alerte.
 *  - STRENGTH_RATIO_TARGETS : la carte ratios doit distinguer « pas de squat
 *    loggé » de « squat très faible ». Fixture qui force cette distinction.
 *  - bestPR.squat/deadlift = 0 → toute comparaison « objectif atteint » sur ces
 *    lifts doit se taire.
 *  - getTopE1RMForLift('row'/'ohp') → null (aucun match) : row_bench/ohp_bench null.
 */
'use strict';
const G = require('./generator');

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('mono_lift', {
    name: 'Benchonly',
    age: 34, bw: 84, height: 181, gender: 'male',
    goal: 'force', level: 'avance', trainingMode: 'powerlifting',
    coachingStyle: 'classique',
    onboardingVersion: 4,
    onboardingPRs: { squat: 0, bench: 150, deadlift: 0 } // n'a déclaré QUE le bench
  });

  const logs = [];
  // 14 séances de bench sur ~8 semaines, uniquement du développé couché barre + haltères + accessoires pecs.
  for (let i = 0; i < 14; i++) {
    const off = i * 4 + (i % 2);         // ~tous les 4j
    const ts = now - off * G.DAY;
    const top = 130 + (i % 3) * 2.5;     // oscille 130/132.5/135, pic ponctuel 150
    const exos = [
      G.exercise('Développé Couché (Barre)', [
        G.warmupLegacy(20, 10),
        G.warmupLegacy(90, 5),
        G.workSet(top, 3, 8),
        G.workSet(top, 3, 8.5),
        G.workSet(top - 10, 6, 8)
      ], { ts: ts, isPrimary: true }),
      G.exercise('Développé Incliné (Haltères)', [
        G.workSet(40, 10, 8), G.workSet(40, 10, 8.5)
      ], { ts: ts }),
      G.exercise('Écarté Poulie', [
        G.workSet(15, 15, 8), G.workSet(15, 15, 9)
      ], { ts: ts })
    ];
    logs.push(G.session(ts, 'Pecs', exos, { id: 'mono-' + i, type: 'Bench' }));
  }
  // Un vrai PR bench 150 il y a ~30j (dépasse l'onboarding, alimente bestPR.bench).
  {
    const ts = now - 30 * G.DAY;
    logs.push(G.session(ts, 'Test Max Bench', [
      G.exercise('Développé Couché (Barre)', [
        G.warmupTyped(20, 10), G.warmupTyped(100, 3), G.warmupTyped(130, 1),
        G.workSet(150, 1, 9.5)
      ], { ts: ts, isPrimary: true })
    ], { id: 'mono-max', type: 'Bench' }));
  }
  p.logs = logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
  G.recomputeBestPR(p);
  return p;
}

module.exports = {
  name: 'mono_lift',
  description: 'Uniquement du bench : squat/row/deadlift/ohp absents.',
  stresses: 'Ratios à dénominateur/numérateur absent (0 vs null) ; fausse alerte danger ; bestPR partiel.',
  build
};
