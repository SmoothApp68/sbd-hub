/**
 * PROFIL « progression_nette » — progresse VRAIMENT : les charges montent
 * régulièrement sur tous les mains lifts. Indispensable pour vérifier que les
 * CAS NOMINAUX se déclenchent (un jeu de fixtures qui ne teste que les pannes est
 * aussi biaisé qu'un jeu qui ne teste que l'idéal).
 *
 * STRESSE :
 *  - predictPR : pente > 0.05 kg/sem → reachable:true, weeks fini, weeklyGain > 0,
 *    confidence (R²) élevée. Le complément exact de l'aurel « deadlift plat ».
 *  - getE1RMTrend : ratio > 1 (tendance haussière).
 *  - « objectif atteint » LÉGITIME : le squat franchit réellement un palier →
 *    doit se déclencher (contrairement au faux positif e1RM gonflé).
 *  - Le message 6-cas / paliers en PR réel : ici currentE1RM MONTE en même temps
 *    que bestPR réel (les deux cohérents) → cas « en progression vers l'objectif ».
 *  - detectVolumeSpike : progression de charge ≠ spike de volume (sets stables) →
 *    ne doit PAS lever d'alerte volume.
 */
'use strict';
const G = require('./generator');

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('progression_nette', {
    name: 'Sofia',
    age: 26, bw: 68, height: 168, gender: 'female',
    goal: 'force', level: 'intermediaire', trainingMode: 'powerbuilding',
    coachingStyle: 'classique',
    onboardingVersion: 4,
    onboardingPRs: { squat: 80, bench: 45, deadlift: 100 }
  });

  const logs = [];
  // 18 séances sur ~16 semaines, charges qui montent de façon nette et régulière.
  // 3 séances/semaine ~ tous les 5-6j, léger jitter (pas d'équidistance parfaite).
  const N = 18;
  for (let i = 0; i < N; i++) {
    const weeksAgo = (N - 1 - i) * 0.9;               // i=0 = plus vieux
    const off = Math.round(weeksAgo * 7) + (i % 2);
    const ts = now - off * G.DAY - (i % 4) * 3600000;
    // Progression : +1.25 kg/sem squat, +0.6 kg/sem bench, +1.5 kg/sem deadlift.
    const sq = Math.round((85 + 1.25 * (i * 0.9)) / 2.5) * 2.5;
    const bp = Math.round((50 + 0.6 * (i * 0.9)) / 2.5) * 2.5;
    const dl = Math.round((105 + 1.5 * (i * 0.9)) / 2.5) * 2.5;
    const rpe = 7.5 + (i % 3) * 0.5;
    const exos = [
      G.exercise('Squat (Barre)', [
        G.warmupTyped(20, 8), G.warmupTyped(Math.round(sq * 0.6 / 2.5) * 2.5, 5),
        G.workSet(sq, 5, rpe), G.workSet(sq, 5, rpe), G.workSet(sq, 5, rpe)
      ], { ts: ts, isPrimary: true }),
      G.exercise('Développé Couché (Barre)', [
        G.workSet(bp, 5, rpe), G.workSet(bp, 5, rpe), G.workSet(bp, 5, rpe)
      ], { ts: ts, isPrimary: true }),
      G.exercise('Soulevé de Terre (Barre)', [
        G.workSet(dl, 3, rpe), G.workSet(dl, 3, rpe)
      ], { ts: ts, isPrimary: true })
    ];
    logs.push(G.session(ts, ['Squat', 'Bench', 'Deadlift'][i % 3], exos, { id: 'prog-' + i }));
  }
  p.logs = logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
  // Check-ins réguliers et sains (progression = bon état).
  p.readinessHistory = [];
  for (let d = 0; d < 10; d++) {
    p.readinessHistory.push(G.checkin(now - d * G.DAY, { sleep: 8, energy: 8, motivation: 9, soreness: 3, pain: null }));
  }
  p.readinessHistory.sort(function (a, b) { return a.ts - b.ts; });
  G.recomputeBestPR(p);
  return p;
}

module.exports = {
  name: 'progression_nette',
  description: 'Progresse vraiment : charges en hausse régulière sur les 3 lifts.',
  stresses: 'Cas NOMINAL : predictPR reachable ; trend haussier ; « objectif atteint » légitime ; pas de faux spike.',
  build
};
