/**
 * PROFIL « retour_apres_pause » — historique ancien et RICHE (2 ans d'entraînement
 * sérieux), puis 6 MOIS de rien, puis 2 séances récentes de reprise.
 *
 * STRESSE :
 *  - Return-to-Play (facteur < 1 selon jours d'absence) : ~180j d'absence entre le
 *    dernier bloc ancien et la reprise → wpComputeWorkWeight doit décharger.
 *  - calcTDEE diviseur : db.logs a une ancienneté ÉNORME (2.5 ans) mais la fenêtre
 *    28j ne contient que 2 séances. `_weeksCovered = min(4, ancienneté/7)` = 4 →
 *    sessionsPerWeek = 2/4 = 0.5 → facteur 1.3 (<3/sem). Vérifie que le TDEE de
 *    reprise n'est pas gonflé par l'historique ancien (piège du diviseur).
 *  - ACWR : chronic (56j) quasi vide, acute (7j) = 2 séances → ratio potentiellement
 *    élevé malgré peu de charge. Cold-start guard chronic<3.
 *  - bestPR : les VRAIS records (anciens, lourds) doivent PERSISTER (recalcBestPR
 *    scanne tout l'historique) — la reprise légère ne les efface pas.
 *  - « comeback » badge (reprise après 10j) : doit se déclencher.
 *  - getE1RMTrend / predictPR : 2 points récents très espacés des anciens → la
 *    régression ne doit pas mélanger un point d'il y a 2 ans avec un récent.
 */
'use strict';
const G = require('./generator');

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('retour_apres_pause', {
    name: 'Marc',
    age: 38, bw: 88, height: 183, gender: 'male',
    goal: 'reprise', level: 'avance', trainingMode: 'powerbuilding',
    coachingStyle: 'prudent',
    onboardingVersion: 4,
    onboardingPRs: { squat: 160, bench: 120, deadlift: 200 }
  });

  const logs = [];
  // ── Bloc ancien : ~50 séances de -900j à -190j (2 ans → il y a 6 mois), lourd. ──
  for (let i = 0; i < 50; i++) {
    const off = 190 + i * 14 + (i % 3);      // remonte de -190 à ~-900
    const ts = now - off * G.DAY;
    const kind = i % 3;
    let exos;
    if (kind === 0) {
      exos = [G.exercise('Squat (Barre)', [
        G.warmupLegacy(60, 5), G.warmupLegacy(120, 3),
        G.workSet(150, 3, 8), G.workSet(150, 3, 8.5)
      ], { ts: ts, isPrimary: true })];
    } else if (kind === 1) {
      exos = [G.exercise('Développé Couché (Barre)', [
        G.warmupLegacy(60, 5), G.warmupLegacy(100, 3),
        G.workSet(115, 3, 8), G.workSet(115, 3, 9)
      ], { ts: ts, isPrimary: true })];
    } else {
      exos = [G.exercise('Soulevé de Terre (Barre)', [
        G.warmupLegacy(100, 5), G.warmupLegacy(160, 2),
        G.workSet(190, 2, 8.5)
      ], { ts: ts, isPrimary: true })];
    }
    logs.push(G.session(ts, ['Squat', 'Bench', 'Deadlift'][kind], exos, { id: 'old-' + i }));
  }
  // Vrais records anciens (pic historique) autour de -250j.
  logs.push(G.session(now - 250 * G.DAY, 'PR Day', [
    G.exercise('Squat (Barre)', [G.workSet(160, 1, 10)], { ts: now - 250 * G.DAY, isPrimary: true }),
    G.exercise('Soulevé de Terre (Barre)', [G.workSet(200, 1, 10)], { ts: now - 250 * G.DAY, isPrimary: true })
  ], { id: 'old-pr' }));

  // ── 6 mois de RIEN (aucun log entre -190j et -6j). ──

  // ── Reprise : 2 séances légères récentes (-6j et -1j). ──
  [6, 1].forEach(function (d, i) {
    const ts = now - d * G.DAY;
    logs.push(G.session(ts, 'Reprise', [
      G.exercise('Squat (Barre)', [
        G.warmupTyped(20, 8), G.warmupTyped(60, 5),
        G.workSet(80, 5, 7), G.workSet(80, 5, 7.5)   // BEAUCOUP plus léger qu'avant
      ], { ts: ts, isPrimary: true }),
      G.exercise('Développé Couché (Barre)', [
        G.workSet(70, 8, 7), G.workSet(70, 8, 7.5)
      ], { ts: ts })
    ], { id: 'back-' + i, type: 'Reprise' }));
  });

  p.logs = logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
  p.body = [G.bodyEntry(now - 1 * G.DAY, 88, { kcal: 2500, prot: 190 })];
  G.recomputeBestPR(p);   // bestPR = anciens records (160/120/200), pas la reprise
  return p;
}

module.exports = {
  name: 'retour_apres_pause',
  description: 'Historique riche ancien, 6 mois d\'arrêt, 2 séances de reprise.',
  stresses: 'Return-to-Play ; diviseur TDEE (ancienneté vs fenêtre) ; ACWR reprise ; persistance bestPR ; badge comeback.',
  build
};
