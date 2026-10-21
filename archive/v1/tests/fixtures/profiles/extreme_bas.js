/**
 * PROFIL « extreme_bas » — utilisateur très léger (40 kg de poids de corps),
 * charges minuscules. Borne basse de tout l'espace numérique.
 *
 * STRESSE :
 *  - calcTDEE : bw=40 → BMR minuscule → cibles caloriques plancher. Vérifie
 *    qu'aucun plancher artificiel absurde (2300 fallback) n'écrase un vrai petit
 *    besoin, et qu'aucune macro (P 2.2 g/kg = 88 g) ne devient négative/nulle.
 *  - getStrengthLevel / DOTS : ratios charge/bw peuvent être ÉLEVÉS même à
 *    charges faibles (60kg squat / 40kg bw = 1.5× bw). Le niveau de force ne doit
 *    pas être « débutant » juste parce que les kg absolus sont petits.
 *  - Plate calculator / arrondis 2.5 : charges 22.5/25 kg, barWeight 15 (barre
 *    femme/légère). Arrondis ne doivent pas tomber sous la barre.
 *  - Onboarding femme + cycle menstruel activé (coeff volume, PAS charge).
 */
'use strict';
const G = require('./generator');

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('extreme_bas', {
    name: 'Mina',
    age: 19, bw: 40, height: 150, gender: 'female',
    goal: 'masse', level: 'debutant', trainingMode: 'powerbuilding',
    coachingStyle: 'prudent',
    onboardingVersion: 4,
    barWeight: 15,
    menstrualEnabled: true,
    cycleTracking: { enabled: true, lastPeriodDate: new Date(now - 10 * G.DAY).toISOString().slice(0, 10), cycleLength: 28 },
    onboardingPRs: { squat: 35, bench: 20, deadlift: 45 }
  });

  const logs = [];
  for (let i = 0; i < 8; i++) {
    const ts = now - (i * 3 + 1) * G.DAY;
    const exos = [
      G.exercise('Squat (Barre)', [
        G.warmupTyped(15, 8), G.workSet(30 + i, 8, 8), G.workSet(30 + i, 8, 8.5)
      ], { ts: ts, isPrimary: true }),
      G.exercise('Développé Couché (Barre)', [
        G.workSet(20 + (i % 3), 8, 8), G.workSet(20 + (i % 3), 8, 9)
      ], { ts: ts }),
      G.exercise('Soulevé de Terre (Barre)', [
        G.workSet(42.5, 5, 8), G.workSet(42.5, 5, 8.5)
      ], { ts: ts })
    ];
    logs.push(G.session(ts, 'Full', exos, { id: 'lo-' + i }));
  }
  p.logs = logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
  p.body = [G.bodyEntry(now - 2 * G.DAY, 40, { kcal: 1600, prot: 90 })];
  G.recomputeBestPR(p);
  return p;
}

module.exports = {
  name: 'extreme_bas',
  description: 'Poids de corps 40 kg, charges minuscules, femme + cycle.',
  stresses: 'Bornes basses TDEE/macros ; niveau de force relatif vs absolu ; barre légère 15 kg ; cycle volume.',
  build
};
