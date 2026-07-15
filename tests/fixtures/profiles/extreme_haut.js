/**
 * PROFIL « extreme_haut » — powerlifter d'élite : 300 kg de squat, ~15 séances /
 * semaine (double/triple split). Borne haute de tout l'espace numérique.
 *
 * STRESSE :
 *  - calcTDEE : facteur d'activité PLAFONNÉ (1.7 à 6+ séances/sem). 15 séances/sem
 *    ne doivent PAS faire exploser le TDEE (le cap 1.7 est un garde-fou anti-4035
 *    kcal historique). Vérifie que ~60 séances/28j saturent le cap, pas au-delà.
 *  - detectVolumeSpike / ACWR : volume très haut mais STABLE → pas de faux spike.
 *  - calcWeeklyJointStress : charge articulaire potentiellement > rouge 180 —
 *    doit être une VRAIE alerte ici (charges réellement énormes), pas un artefact.
 *  - getStrengthLevel : niveau « Elite » (levelIdx>=4) → badges mythic. Vérifie
 *    que le plafond haut de la grille de force ne déborde pas.
 *  - Densité extrême : 15 séances/sem = timestamps très rapprochés (plusieurs le
 *    même jour). getLogsInRange / dédup par shortDate ne doivent pas fusionner.
 */
'use strict';
const G = require('./generator');

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('extreme_haut', {
    name: 'Bruno',
    age: 31, bw: 125, height: 190, gender: 'male',
    goal: 'force', level: 'avance', trainingMode: 'powerlifting',
    coachingStyle: 'agressif',
    onboardingVersion: 4,
    fatPct: 18,
    onboardingPRs: { squat: 300, bench: 200, deadlift: 340 }
  });

  const logs = [];
  // ~15 séances/semaine sur 5 semaines ≈ 75 séances. Plusieurs par jour.
  let idx = 0;
  for (let week = 0; week < 5; week++) {
    for (let s = 0; s < 15; s++) {
      const dayOffset = week * 7 + (s % 7);           // répartition sur la semaine
      const slot = Math.floor(s / 7);                  // 0/1/2 → matin/midi/soir
      const ts = now - dayOffset * G.DAY - slot * 5 * 3600000;
      const kind = idx % 3;
      let exos;
      if (kind === 0) {
        exos = [G.exercise('Squat (Barre)', [
          G.warmupTyped(60, 5), G.warmupTyped(200, 3),
          G.workSet(280, 2, 8), G.workSet(285, 1, 9), G.workSet(260, 3, 8)
        ], { ts: ts, isPrimary: true })];
      } else if (kind === 1) {
        exos = [G.exercise('Développé Couché (Barre)', [
          G.warmupTyped(60, 5), G.warmupTyped(150, 3),
          G.workSet(185, 2, 8), G.workSet(190, 1, 9)
        ], { ts: ts, isPrimary: true })];
      } else {
        exos = [G.exercise('Soulevé de Terre (Barre)', [
          G.warmupTyped(100, 5), G.warmupTyped(250, 2),
          G.workSet(320, 1, 9), G.workSet(300, 2, 8.5)
        ], { ts: ts, isPrimary: true })];
      }
      logs.push(G.session(ts, ['Squat', 'Bench', 'Deadlift'][kind], exos, { id: 'hi-' + idx, duration: 5400 }));
      idx++;
    }
  }
  // Vrai 300 squat (record explicite) il y a ~40j.
  {
    const ts = now - 40 * G.DAY;
    logs.push(G.session(ts, 'Compétition', [
      G.exercise('Squat (Barre)', [G.warmupTyped(200, 1), G.workSet(300, 1, 10)], { ts: ts, isPrimary: true })
    ], { id: 'hi-max' }));
  }
  p.logs = logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
  p.body = [G.bodyEntry(now - 1 * G.DAY, 125, { kcal: 4200, prot: 250 })];
  G.recomputeBestPR(p);
  return p;
}

module.exports = {
  name: 'extreme_haut',
  description: '300 kg squat, ~15 séances/semaine, athlète d\'élite lourd.',
  stresses: 'Cap facteur d\'activité TDEE ; densité extrême (plusieurs séances/jour) ; alerte articulaire vraie ; niveau Elite.',
  build
};
