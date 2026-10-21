/**
 * PROFIL « debutant » — onboarding fait, 3 séances, UN SEUL lift, pas de check-in,
 * pas de PR réel (juste onboardingPRs déclarés).
 *
 * STRESSE :
 *  - LP actif (isInLP : DOTS bas + <12 sem) : db.user.lpActive=true, lpStrikes.
 *  - recalcBestPR avec plancher onboardingPRs : le débutant n'a JAMAIS soulevé
 *    145kg mais a déclaré des PR modestes → bestPR doit = onboardingPRs (les
 *    séances légères ne les dépassent pas).
 *  - Un seul lift loggé (squat) → ratios S/B, S/D, B/D indisponibles (dénominateur
 *    absent). Toute carte de ratio doit se taire, pas afficher NaN/Infinity.
 *  - predictPR('squat') avec seulement 3 points : progression détectable OU
 *    « pas assez de données » selon l'espacement — ici 3 points progressifs.
 *  - Cold-start SRS (score 75, ACWR=1.0 guard chronic<3 séances).
 */
'use strict';
const G = require('./generator');

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('debutant', {
    name: 'Kevin',
    age: 22, bw: 72, height: 176, gender: 'male',
    goal: 'masse', level: 'debutant', trainingMode: 'musculation',
    coachingStyle: 'prudent',
    onboardingVersion: 4,
    onboardingPRs: { squat: 70, bench: 50, deadlift: 90 },
    lpActive: true, lpStrikes: {},
    vocabLevel: 1
  });

  // 3 séances de squat espacées ~5j, charges qui montent doucement (linear progression).
  const days = [12, 6, 1];        // J-12, J-6, J-1 (espacées, pas idéalisées)
  const loads = [50, 55, 60];     // LP classique +2.5→+5kg
  p.logs = days.map(function (d, i) {
    const ts = now - d * G.DAY - 3600000;
    const exo = G.exercise('Squat (Barre)', [
      G.warmupTyped(20, 8),
      G.warmupTyped(40, 5),
      G.workSet(loads[i], 5, 7 + i * 0.5),
      G.workSet(loads[i], 5, 8),
      G.workSet(loads[i], 5, 8.5)
    ], { ts: ts, isPrimary: true });
    return G.session(ts, 'Full Body', [exo], { id: 'deb-' + i, type: 'Débutant' });
  }).sort(function (a, b) { return b.timestamp - a.timestamp; });

  G.recomputeBestPR(p); // bestPR reste = onboardingPRs (60 < 70)
  return p;
}

module.exports = {
  name: 'debutant',
  description: 'Onboarding fait, 3 séances, 1 seul lift, PR = onboarding seulement.',
  stresses: 'LP actif ; plancher onboardingPRs ; ratios indisponibles (1 lift) ; cold-start SRS.',
  build
};
