/**
 * PROFIL « aurel_like » — LE PROFIL DE RÉFÉRENCE (le plus important).
 * ============================================================================
 * Reproduit le profil aurel_br (données via Claude.ai, non vérifiables côté repo)
 * AVEC tous les pièges de réalisme, chacun ayant caché un bug réel parti en prod.
 *
 * IDENTITÉ (CLAUDE.md §15) :
 *   98 kg / 182 cm / 28 ans / H. goal=recompo, mode=powerbuilding, level=avance,
 *   coachingStyle=agressif, onboardingVersion=4.
 *   VRAIES PR barres (db.bestPR) : squat 145 / bench 140 / deadlift 170.
 *   e1RM indicateurs (coulisse, JAMAIS un record) : squat ~157 / deadlift ~186-200.
 *   ~20 séances / 28 jours, cible recompo ~2672 kcal.
 *
 * PIÈGES DE RÉALISME EMBARQUÉS (→ colonne « bug caché ») :
 *  (A) TROU en début de fenêtre 28j : 1re séance de la fenêtre à J-22, RIEN entre
 *      J-22 et J-28, MAIS historique complet de ~3 ans → calcTDEE : diviseur =
 *      min(4, ancienneté/7)=4, PAS 22/7. Bug caché : facteur calorique 2870↔2672.
 *  (B) Séances titrées SANS le nom du lift : deadlift dans « Ischios Fessiers ».
 *      Bug caché : reconnaissance du lift basée sur le titre au lieu du nom d'exo.
 *  (C) DEUX variantes du même lift dans UNE séance : « Soulevé de Terre Jambes
 *      Tendues » (RDL) listé EN PREMIER, puis « Soulevé de Terre (Barre) ».
 *      Bug caché : predictPR faisait .find() → tombait sur le RDL (exclu par
 *      getSBDType) → mauvais poids. Guard de régression getSBDType.
 *  (D) « Développé Couché (Haltères) » à côté du « Développé Couché (Barre) ».
 *      Bug caché : le bench haltères pollue bestPR.bench (getSBDType l'exclut via
 *      !haltere) — vérifie que l'exclusion tient.
 *  (E) Warm-ups ET work sets mélangés, dans LES DEUX formats (isWarmup:true ET
 *      setType:'warmup'). Bug caché : un filtre !s.isWarmup seul comptait les
 *      warm-ups typés comme du travail.
 *  (F) rpe null épars. Bug caché : NaN dans les moyennes RPE / e1RM RPE-aware.
 *  (G) Check-ins PARTIELS, dont pain=null (et champs manquants). Bug caché :
 *      !!pain déclenchait un faux « Douleur signalée » ; NaN sur champs absents.
 *  (H) DEADLIFT PLAT : 160×3 constant sur plusieurs semaines (maxRM ≈ 169) alors
 *      que bestPR réel = 170 → predictPR('deadlift') pente ≈ 0 = plateau.
 *      Bug caché : « stable autour de 169 » au lieu de 170 ; e1RM registre 190
 *      (capacité) ≠ bestPR 170 (barre réelle) ≠ maxRM log 169 (récent) — 3 chiffres.
 *
 * Le registre DUP db.exercises[].e1rm porte la CAPACITÉ (haute), distincte du pic
 * historique réel montré dans Records. Volontairement divergents.
 */
'use strict';
const G = require('./generator');

// ── helpers locaux ──────────────────────────────────────────────────────────
function r25(x) { return Math.round(x / 2.5) * 2.5; }

// Séance « jambes » avec squat lourd. warmFormat: 'typed'|'legacy'.
function squatDay(now, off, sqWork, warmFormat, rpe) {
  const ts = now - off * G.DAY - ((off % 4) * 3600000);
  const w = warmFormat === 'legacy'
    ? [G.warmupLegacy(20, 8), G.warmupLegacy(r25(sqWork * 0.5), 5), G.warmupLegacy(r25(sqWork * 0.8), 3)]
    : [G.warmupTyped(20, 8), G.warmupTyped(r25(sqWork * 0.5), 5), G.warmupTyped(r25(sqWork * 0.8), 3)];
  return G.session(ts, 'Quadris', [
    G.exercise('Squat (Barre)', w.concat([
      G.workSet(sqWork, 5, rpe), G.workSet(sqWork, 5, rpe), G.workSet(r25(sqWork * 0.92), 6, rpe)
    ]), { ts: ts, isPrimary: true }),
    G.exercise('Presse à Cuisses', [G.workSet(r25(sqWork * 2), 10, rpe), G.workSet(r25(sqWork * 2), 10, rpe)], { ts: ts }),
    G.exercise('Leg Extension', [G.workSet(60, 15, 9), G.workSet(60, 15, 9)], { ts: ts })
  ], { id: 'a-sq-' + off, type: 'Quadris' });
}

// Séance « pecs » : bench barre + bench HALTÈRES (piège D) + accessoires.
function benchDay(now, off, bpWork, warmFormat, rpe) {
  const ts = now - off * G.DAY - ((off % 3) * 3600000);
  const w = warmFormat === 'legacy'
    ? [G.warmupLegacy(20, 10), G.warmupLegacy(r25(bpWork * 0.55), 5)]
    : [G.warmupTyped(20, 10), G.warmupTyped(r25(bpWork * 0.55), 5)];
  return G.session(ts, 'Pecs / Triceps', [
    G.exercise('Développé Couché (Barre)', w.concat([
      G.workSet(bpWork, 5, rpe), G.workSet(bpWork, 5, rpe), G.workSet(r25(bpWork * 0.9), 8, rpe)
    ]), { ts: ts, isPrimary: true }),
    // (D) bench haltères juste à côté — getSBDType doit l'EXCLURE (!haltere).
    G.exercise('Développé Couché (Haltères)', [G.workSet(42.5, 10, 8), G.workSet(42.5, 10, 8.5)], { ts: ts }),
    G.exercise('Rowing Barre (Pronation)', [G.workSet(r25(bpWork * 0.95), 8, 8), G.workSet(r25(bpWork * 0.95), 8, 8.5)], { ts: ts })
  ], { id: 'a-bp-' + off, type: 'Pecs' });
}

// (B) séance deadlift TITRÉE « Ischios Fessiers » (sans « deadlift » ni « soulevé »).
// dlWork/dlReps pilotent la platitude. warmFormat alterné.
function deadDay(now, off, dlWork, dlReps, warmFormat, rpe, withRDL) {
  const ts = now - off * G.DAY - ((off % 5) * 3600000);
  const w = warmFormat === 'legacy'
    ? [G.warmupLegacy(60, 5), G.warmupLegacy(r25(dlWork * 0.7), 3)]
    : [G.warmupTyped(60, 5), G.warmupTyped(r25(dlWork * 0.7), 3)];
  const exos = [];
  // (C) RDL listé EN PREMIER quand withRDL — c'est l'ordre qui cassait predictPR.
  if (withRDL) {
    exos.push(G.exercise('Soulevé de Terre Jambes Tendues', [
      G.workSet(r25(dlWork * 0.75), 8, 8), G.workSet(r25(dlWork * 0.75), 8, 8.5)
    ], { ts: ts }));
  }
  exos.push(G.exercise('Soulevé de Terre (Barre)', w.concat([
    G.workSet(dlWork, dlReps, rpe), G.workSet(dlWork, dlReps, rpe)
  ]), { ts: ts, isPrimary: true }));
  exos.push(G.exercise('Leg Curl Assis', [G.workSet(55, 12, 9), G.workSet(55, 12, 9)], { ts: ts }));
  return G.session(ts, 'Ischios Fessiers', exos, { id: 'a-dl-' + off, type: 'Ischios' });
}

function accessoryDay(now, off) {
  const ts = now - off * G.DAY - ((off % 6) * 3600000);
  return G.session(ts, 'Épaules / Bras', [
    G.exercise('Développé Militaire (Barre)', [G.warmupTyped(20, 10), G.workSet(60, 6, 8), G.workSet(60, 6, 8.5)], { ts: ts }),
    G.exercise('Élévations Latérales', [G.workSet(12, 15, 9), G.workSet(12, 15, 9), G.workSet(12, 15, 9)], { ts: ts }),
    G.exercise('Curl Biceps (Barre)', [G.workSet(40, 10, 8), G.workSet(40, 10, 9)], { ts: ts })
  ], { id: 'a-ac-' + off, type: 'Épaules' });
}

function build(now) {
  now = now || Date.now();
  const p = G.blankProfile('aurel_like', {
    name: 'Aurélien',
    age: 28, bw: 98, height: 182, gender: 'male',
    goal: 'recompo', level: 'avance', trainingMode: 'powerbuilding',
    coachingStyle: 'agressif',
    onboardingVersion: 4,
    tier: 'premium', plan: 'premium',
    fatPct: null,                 // Mifflin (taille+âge) → ~2672 recompo
    // Plancher onboarding SOUS les vraies barres (déclaré puis dépassé) : ne
    // remonte pas bestPR au-dessus de 145/140/170.
    onboardingPRs: { squat: 140, bench: 135, deadlift: 165 },
    lpActive: false, lpStrikes: {},
    consentHealth: true, medicalConsent: true
  });

  const logs = [];

  // ── (H) recent flat deadlift : les ~10 séances deadlift les plus récentes à
  //    160×3 (maxRM ≈ 169). Réparties dans/juste après la fenêtre.
  const flatDeadOffsets = [3, 9, 16, 22, 31, 38, 45, 52, 59, 66];
  flatDeadOffsets.forEach(function (off, i) {
    // (C) une des séances flat porte le RDL EN PREMIER ; warm-up format alterné ;
    // (F) rpe null sur une séance sur trois.
    const rpe = (i % 3 === 0) ? null : 8.5;
    const warm = (i % 2 === 0) ? 'typed' : 'legacy';
    logs.push(deadDay(now, off, 160, 3, warm, rpe, i === 0 || i === 2));
  });

  // ── (A) fenêtre 28j : ~20 séances, 1re à J-22, RIEN entre J-22 et J-28. ──
  // Offsets deadlift déjà posés à 3/9/16/22. On complète squat/bench/accessoires
  // pour atteindre ~20 séances dans [1..22], zéro dans [23..29].
  const winSquat = [2, 8, 15, 21];
  const winBench = [1, 5, 12, 19];
  const winAcc = [4, 11, 18];
  const winSquat2 = [6, 13, 20];   // 2e passage squat léger
  const winBench2 = [7, 14];
  winSquat.forEach(function (off, i) {
    logs.push(squatDay(now, off, 130, i % 2 === 0 ? 'typed' : 'legacy', i === 1 ? null : 8.5));
  });
  winSquat2.forEach(function (off, i) {
    logs.push(squatDay(now, off, r25(130 * 0.9), 'legacy', 7.5));
  });
  winBench.forEach(function (off, i) {
    logs.push(benchDay(now, off, 115, i % 2 === 0 ? 'legacy' : 'typed', i === 2 ? null : 8.5));
  });
  winBench2.forEach(function (off) {
    logs.push(benchDay(now, off, r25(115 * 0.9), 'typed', 7.5));
  });
  winAcc.forEach(function (off) { logs.push(accessoryDay(now, off)); });

  // ── Historique BACKBONE : ~3 ans, de J-70 à J-1130, plateau progressif. ──
  // (deadlift déjà couvert jusqu'à J-66 ; ici on continue deadlift à J-73+.)
  let off = 70;
  let idx = 0;
  const cadence = [2, 2, 3, 2, 3, 2, 2]; // ~3.5 séances/sem
  while (off < 1360) {
    // Facteur de progression 0 (vieux) → 1 (récent) sur la fenêtre 70..1360.
    const prog = Math.max(0, Math.min(1, (1360 - off) / (1360 - 70)));
    const sqW = r25(105 + 22 * prog);     // 105 → 127
    const bpW = r25(92 + 20 * prog);      // 92 → 112
    const dlW = r25(140 + 20 * prog);     // 140 → 160
    const rpe = (idx % 4 === 0) ? null : (7.5 + (idx % 3) * 0.5);
    const warm = (idx % 2 === 0) ? 'typed' : 'legacy';
    const kind = idx % 4;
    if (kind === 0) logs.push(squatDay(now, off, sqW, warm, rpe));
    else if (kind === 1) logs.push(benchDay(now, off, bpW, warm, rpe));
    else if (kind === 2) logs.push(deadDay(now, off, dlW, 3, warm, rpe, idx % 6 === 2));
    else logs.push(accessoryDay(now, off));
    off += cadence[idx % cadence.length];
    // Deux « trous » réalistes : vacances (~2 sem) et blessure (~3 sem).
    if (off > 300 && off < 330) off = 330;   // gap vacances
    if (off > 640 && off < 685) off = 685;   // gap blessure
    idx++;
  }

  // ── PR RÉELS (vraies barres) — sessions dédiées, hors fenêtre récente. ──
  // squat 145×1 (bestPR.squat=145), e1RM indicateur via 140×5 (calcE1RM=157).
  {
    const ts = now - 120 * G.DAY;
    logs.push(G.session(ts, 'Test Force Squat', [
      G.exercise('Squat (Barre)', [
        G.warmupTyped(60, 5), G.warmupTyped(120, 2),
        G.workSet(140, 5, 9),   // maxRM = calcE1RM(140,5) = 157 → e1RM indicateur
        G.workSet(145, 1, 10)   // VRAIE barre 145 → bestPR.squat
      ], { ts: ts, isPrimary: true })
    ], { id: 'a-pr-sq' }));
  }
  // bench 140×1 (bestPR.bench=140).
  {
    const ts = now - 95 * G.DAY;
    logs.push(G.session(ts, 'Test Force Bench', [
      G.exercise('Développé Couché (Barre)', [
        G.warmupTyped(60, 5), G.warmupTyped(110, 2),
        G.workSet(132.5, 3, 9), G.workSet(140, 1, 10) // VRAIE barre 140 → bestPR.bench
      ], { ts: ts, isPrimary: true })
    ], { id: 'a-pr-bp' }));
  }
  // deadlift 170×1 (bestPR.deadlift=170) + 165×5 (maxRM=186 → e1RM indicateur haut).
  // TITRÉ « Ischios Fessiers » (B) et bien AVANT les 6 séances deadlift récentes
  // (H) → predictPR ne le voit pas → plateau 169 correct.
  {
    const ts = now - 210 * G.DAY;
    logs.push(G.session(ts, 'Ischios Fessiers', [
      G.exercise('Soulevé de Terre (Barre)', [
        G.warmupTyped(100, 3), G.warmupTyped(150, 1),
        G.workSet(165, 5, 9),   // maxRM = calcE1RM(165,5) = 186 → e1RM indicateur
        G.workSet(170, 1, 10)   // VRAIE barre 170 → bestPR.deadlift
      ], { ts: ts, isPrimary: true })
    ], { id: 'a-pr-dl' }));
  }

  logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
  p.logs = logs;

  // ── Registre DUP db.exercises : CAPACITÉ (e1rm) volontairement > barre réelle.
  //    C'est la source du « stable autour de 169/157 » à ne JAMAIS afficher en PR.
  p.exercises = {
    'Squat (Barre)': {
      e1rm: 157, shadowWeight: 150, ewmaE1rm: 156.4, ewmaSessionCount: 40, lastRPE: 8.5,
      zones: {
        force: { e1rm: 157.5, shadowWeight: 150, sessionsCount: 22 },
        hypertrophie: { e1rm: 147.5, shadowWeight: 140, sessionsCount: 30 },
        vitesse: { e1rm: 137.5, shadowWeight: 130, sessionsCount: 8 }
      }
    },
    'Développé Couché (Barre)': {
      e1rm: 148, shadowWeight: 142, ewmaE1rm: 147.6, ewmaSessionCount: 44, lastRPE: 8.5,
      zones: {
        force: { e1rm: 147.5, shadowWeight: 140, sessionsCount: 25 },
        hypertrophie: { e1rm: 137.5, shadowWeight: 130, sessionsCount: 33 },
        vitesse: { e1rm: 130, shadowWeight: 122.5, sessionsCount: 6 }
      }
    },
    // Deadlift : e1rm registre 190 (capacité) ≠ bestPR 170 (barre) ≠ maxRM log 169 (récent).
    'Soulevé de Terre (Barre)': {
      e1rm: 190, shadowWeight: 180, ewmaE1rm: 188.5, ewmaSessionCount: 38, lastRPE: 9,
      zones: {
        force: { e1rm: 190, shadowWeight: 180, sessionsCount: 20 },
        hypertrophie: { e1rm: 177.5, shadowWeight: 167.5, sessionsCount: 24 },
        vitesse: { e1rm: 167.5, shadowWeight: 157.5, sessionsCount: 5 }
      }
    }
  };

  // ── (G) Check-ins PARTIELS sur ~14 jours : pain=null majoritaire, quelques
  //    douleurs, et des entrées à champs manquants (energy/motivation absents). ──
  const rh = [];
  for (let d = 0; d < 14; d++) {
    const ts = now - d * G.DAY - 7 * 3600000; // le matin
    if (d % 5 === 0) {
      // entrée partielle : seulement sleep + soreness (energy/motivation manquants).
      rh.push(G.checkin(ts, { sleep: 6, soreness: 6, pain: null }));
    } else if (d === 2) {
      rh.push(G.checkin(ts, { sleep: 5, energy: 5, motivation: 7, soreness: 8, pain: 'Bas du dos' }));
    } else if (d === 8) {
      rh.push(G.checkin(ts, { sleep: 7, energy: 6, motivation: 6, soreness: 7, pain: 'Genou' }));
    } else {
      rh.push(G.checkin(ts, { sleep: 7 + (d % 3), energy: 7, motivation: 8, soreness: 4, pain: null }));
    }
  }
  rh.sort(function (a, b) { return a.ts - b.ts; });
  p.readinessHistory = rh;

  // Poids de corps + macros récents (cohérents recompo ~2672).
  p.body = [];
  for (let d = 0; d < 10; d++) {
    p.body.push(G.bodyEntry(now - d * 3 * G.DAY, 98 - (d % 2) * 0.4, { kcal: 2650 + (d % 3) * 40, prot: 216, glucides: 254, lipides: 88 }));
  }
  p.body.sort(function (a, b) { return a.ts - b.ts; });

  // Activités secondaires (natation ~1/sem) — logs réels, source manual.
  p.activityLogs = [
    { date: new Date(now - 5 * G.DAY).toISOString().slice(0, 10), type: 'natation', duration: 45, intensity: 3, trimp: 108, source: 'manual' },
    { date: new Date(now - 12 * G.DAY).toISOString().slice(0, 10), type: 'natation', duration: 40, intensity: 3, trimp: 96, source: 'manual' }
  ];
  p.user.activityTemplate = [{ type: 'natation', intensity: 3, days: ['Mercredi'], duration: 45 }];

  G.recomputeBestPR(p); // → { squat:145, bench:140, deadlift:170 }
  return p;
}

module.exports = {
  name: 'aurel_like',
  description: 'Profil de référence aurel_br : ~550 séances, trous, RDL-first, deadlift plat, check-ins partiels.',
  stresses: 'Diviseur TDEE (trou fenêtre) ; predictPR RDL-first + deadlift plat ; e1RM≠PR réel ; warmups 2 formats ; pain=null ; titres sans lift.',
  build
};
