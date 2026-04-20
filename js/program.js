// ============================================================
// js/program.js — Moteur de génération de programme
// Chargé AVANT app.js dans index.html
// Toutes les fonctions sont globales (pas de module)
// ============================================================

// ── CONSTANTES VOLUME LANDMARKS (Mike Israetel, RP Strength) ──
// MEV = Minimum Effective Volume (sets/semaine min pour progrès)
// MAV = Maximum Adaptive Volume (zone optimale)
// MRV = Maximum Recoverable Volume (au-delà → surentraînement)
var VOLUME_LANDMARKS_FR = {
  'Pectoraux':     { mev: 8,  mav: 16, mrv: 22 },
  'Dos':           { mev: 10, mav: 20, mrv: 26 },
  'Épaules':       { mev: 6,  mav: 14, mrv: 20 },
  'Quadriceps':    { mev: 8,  mav: 16, mrv: 22 },
  'Ischio':        { mev: 6,  mav: 12, mrv: 16 },
  'Fessiers':      { mev: 6,  mav: 14, mrv: 18 },
  'Biceps':        { mev: 6,  mav: 12, mrv: 18 },
  'Triceps':       { mev: 6,  mav: 12, mrv: 18 },
  'Abdominaux':    { mev: 6,  mav: 14, mrv: 20 },
  'Mollets':       { mev: 8,  mav: 14, mrv: 18 },
  'Trapèzes':      { mev: 4,  mav: 10, mrv: 14 },
  'Avant-bras':    { mev: 4,  mav: 10, mrv: 14 }
};

// ── RECOMMANDATIONS SPLIT PAR FRÉQUENCE ──
// Basé sur meta-analyse : fréquence 2x/semaine par muscle = optimal
// Sources : Schoenfeld 2016, Ralston 2017
var SPLIT_RECOMMENDATIONS = {
  // Powerlifting / Powerbuilding
  powerlifting: {
    2: { split: 'SBD_2', label: 'Full SBD × 2', desc: 'Squat+Bench lun, Deadlift+Bench ven', days: ['Lundi', 'Vendredi'] },
    3: { split: 'SBD_3', label: 'SBD classique × 3', desc: 'Squat lun, Bench mer, Deadlift ven', days: ['Lundi', 'Mercredi', 'Vendredi'] },
    4: { split: 'SBD_4', label: 'SBD + technique × 4', desc: 'Squat/Dead/Bench + jour technique', days: ['Lundi', 'Mardi', 'Jeudi', 'Samedi'] },
    5: { split: 'SBD_5', label: 'Haute fréquence × 5', desc: 'Chaque lift 2x/sem, accessoires', days: ['Lundi', 'Mardi', 'Mercredi', 'Vendredi', 'Samedi'] }
  },
  powerbuilding: {
    2: { split: 'FULL_2', label: 'Full Body × 2', desc: 'Composé lourd + accessoires complets × 2', days: ['Lundi', 'Jeudi'] },
    3: { split: 'FULL_3', label: 'Full Body × 3', desc: 'SBD + accessoires, 3 jours espacés', days: ['Lundi', 'Mercredi', 'Vendredi'] },
    4: { split: 'UL_4', label: 'Upper/Lower × 4', desc: 'Haut du corps + Bas du corps × 2', days: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi'] },
    5: { split: 'PPL_5', label: 'PPL × 5', desc: 'Push/Pull/Legs + 2 jours force SBD', days: ['Lundi', 'Mardi', 'Mercredi', 'Vendredi', 'Samedi'] }
  },
  musculation: {
    2: { split: 'FULL_2', label: 'Full Body × 2', desc: 'Tous les muscles 2× par semaine, efficace et simple', days: ['Lundi', 'Jeudi'] },
    3: { split: 'FULL_3', label: 'Full Body × 3', desc: 'Optimal pour intermédiaires, chaque muscle 3×/sem', days: ['Lundi', 'Mercredi', 'Vendredi'] },
    4: { split: 'UL_4', label: 'Upper/Lower × 4', desc: 'Haut × 2 + Bas × 2, fréquence optimale', days: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi'] },
    5: { split: 'PPL_5', label: 'PPL + Upper × 5', desc: 'Push/Pull/Legs × 1 + Upper/Lower × 1', days: ['Lundi', 'Mardi', 'Mercredi', 'Vendredi', 'Samedi'] },
    6: { split: 'PPL_6', label: 'PPL × 2', desc: 'Chaque muscle 2×/sem en volume élevé. Avancés seulement.', days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] }
  },
  bien_etre: {
    2: { split: 'BIEN_2', label: '2 activités douces', desc: 'Cardio + Mobilité, 2×/sem', days: ['Lundi', 'Jeudi'] },
    3: { split: 'BIEN_3', label: '3 activités variées', desc: 'Cardio / Yoga / Renfo léger', days: ['Lundi', 'Mercredi', 'Vendredi'] },
    4: { split: 'BIEN_4', label: '4 activités', desc: 'Mix cardio, yoga, renfo, repos actif', days: ['Lundi', 'Mardi', 'Jeudi', 'Samedi'] },
    5: { split: 'BIEN_5', label: '5 activités variées', desc: 'Programme quotidien doux, 1 repos', days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'] }
  }
};

// ── 1RM CALCULATIONS ──
// Plusieurs formules, on prend la moyenne pour plus de précision

function epleyE1RM(weight, reps) {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

function brzyckiE1RM(weight, reps) {
  if (reps === 1) return weight;
  return weight * (36 / (37 - reps));
}

function lombardi1RM(weight, reps) {
  return weight * Math.pow(reps, 0.10);
}

// Moyenne pondérée des formules (Epley légèrement favorisé pour powerlifting)
function calcE1RM(weight, reps) {
  if (!weight || !reps || reps < 1) return 0;
  if (reps === 1) return weight;
  if (reps > 12) reps = 12; // au-delà de 12 reps, l'estimation est peu fiable
  var e = epleyE1RM(weight, reps);
  var b = brzyckiE1RM(weight, reps);
  var l = lombardi1RM(weight, reps);
  return Math.round((e * 0.45 + b * 0.40 + l * 0.15) * 10) / 10;
}

// Calcule la charge cible depuis un 1RM et un pourcentage, arrondie à 2.5kg
function calcLoadFromPct(e1rm, pct) {
  if (!e1rm || !pct) return 0;
  var raw = e1rm * (pct / 100);
  return Math.round(raw / 2.5) * 2.5;
}

// ── SPLIT RECOMMENDATION ──
function recommendSplit(mode, daysPerWeek) {
  var modeRecs = SPLIT_RECOMMENDATIONS[mode] || SPLIT_RECOMMENDATIONS['musculation'];
  var days = Math.max(2, Math.min(6, daysPerWeek || 3));
  // Si la fréquence exacte n'existe pas, prendre la plus proche
  if (modeRecs[days]) return modeRecs[days];
  var keys = Object.keys(modeRecs).map(Number).sort(function(a, b) { return a - b; });
  var closest = keys.reduce(function(prev, curr) {
    return Math.abs(curr - days) < Math.abs(prev - days) ? curr : prev;
  });
  return modeRecs[closest];
}

// Retourne toutes les options de split pour un mode (pour afficher les alternatives)
function getAllSplitsForMode(mode) {
  return SPLIT_RECOMMENDATIONS[mode] || SPLIT_RECOMMENDATIONS['musculation'];
}

// ── PROGRESSIVE OVERLOAD ──
// Règle simple : +1 rep/semaine pendant 4 semaines → +2.5kg, reset au bas de la fourchette
function computeNextLoad(currentLoad, currentReps, targetRepsLow, targetRepsHigh, weeksAtCurrentLoad) {
  if (!currentLoad) return null;
  var result = { load: currentLoad, reps: currentReps, action: 'maintain' };
  if (currentReps >= targetRepsHigh) {
    // Haut de la fourchette atteint → monter la charge
    result.load = currentLoad + 2.5;
    result.reps = targetRepsLow;
    result.action = 'increase';
    result.message = '+2.5kg — tu as atteint le haut de la fourchette';
  } else if (weeksAtCurrentLoad >= 4 && currentReps < targetRepsLow) {
    // Stagnation → garder ou baisser légèrement
    result.action = 'stagnation';
    result.message = 'Stagnation détectée — vérifier récupération et nutrition';
  } else {
    result.reps = currentReps + 1;
    result.action = 'add_rep';
    result.message = '+1 rep cette semaine';
  }
  return result;
}

// ── DELOAD DETECTION ──
// Recommande un deload si : fatigue accumulée élevée OU 4+ semaines sans progrès
function shouldDeload(logs, mode) {
  if (!logs || logs.length < 4) return { needed: false };
  var now = Date.now();
  var fourWeeksAgo = now - 28 * 86400000;
  var recentLogs = logs.filter(function(l) { return l.timestamp >= fourWeeksAgo; });
  if (recentLogs.length < 3) return { needed: false };

  // Score de fatigue : basé sur la fréquence et le volume des 2 dernières semaines
  var twoWeeksAgo = now - 14 * 86400000;
  var last2Weeks = recentLogs.filter(function(l) { return l.timestamp >= twoWeeksAgo; });
  var avgSessionsPerWeek = last2Weeks.length / 2;
  var totalVolume2Weeks = last2Weeks.reduce(function(s, l) { return s + (l.volume || 0); }, 0);

  // Fatigue élevée si > 5 séances/sem ou volume > 20t/sem en moyenne
  var highFreq = avgSessionsPerWeek > 5;
  var highVol = (totalVolume2Weeks / 2) > 20000;

  // Powerlifting : deload toutes les 4-5 semaines systématiquement
  var isPL = mode === 'powerlifting' || mode === 'powerbuilding';
  var sessionCount4Weeks = recentLogs.length;
  var timeBasedDeload = isPL && sessionCount4Weeks >= 12; // ~3 séances/sem × 4 sem

  if (highFreq || highVol || timeBasedDeload) {
    return {
      needed: true,
      reason: highFreq ? 'Fréquence élevée sur 2 semaines' :
               highVol  ? 'Volume très élevé sur 2 semaines' :
               'Cycle de 4 semaines terminé — récupération recommandée',
      intensity: 0.6 // charger à 60% du 1RM pendant le deload
    };
  }
  return { needed: false };
}

// ── VOLUME STATUS PAR MUSCLE ──
function getVolumeStatus(muscle, setsPerWeek) {
  var lm = VOLUME_LANDMARKS_FR[muscle];
  if (!lm) return { status: 'unknown', label: '—', color: 'var(--sub)' };
  if (setsPerWeek < lm.mev) return { status: 'under', label: 'Sous MEV ('+lm.mev+' sets min)', color: 'var(--red)' };
  if (setsPerWeek <= lm.mav) return { status: 'optimal', label: 'Zone optimale (MAV)', color: 'var(--green)' };
  if (setsPerWeek <= lm.mrv) return { status: 'high', label: 'Volume élevé (proche MRV)', color: 'var(--orange)' };
  return { status: 'over', label: 'Au-dessus du MRV — risque surentraînement', color: 'var(--red)' };
}

// ── MUSCLE BALANCE ANALYSIS ──
// Détecte les déséquilibres push/pull et antérieur/postérieur
function analyzeMuscleBalance(logs, days) {
  days = days || 14;
  var cutoff = Date.now() - days * 86400000;
  var recentLogs = (logs || []).filter(function(l) { return l.timestamp >= cutoff; });
  if (!recentLogs.length) return null;

  var pushSets = 0, pullSets = 0, anteriorSets = 0, posteriorSets = 0;
  var PUSH_MUSCLES = ['Pectoraux', 'Épaules', 'Triceps'];
  var PULL_MUSCLES = ['Dos', 'Biceps', 'Trapèzes'];
  var ANTERIOR = ['Quadriceps', 'Abdominaux', 'Pectoraux'];
  var POSTERIOR = ['Ischio', 'Fessiers', 'Dos'];

  recentLogs.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var mg = typeof getMuscleGroup === 'function' ? getMuscleGroup(exo.name) : '';
      var sets = exo.sets || exo.series || 1;
      if (PUSH_MUSCLES.indexOf(mg) >= 0) pushSets += sets;
      if (PULL_MUSCLES.indexOf(mg) >= 0) pullSets += sets;
      if (ANTERIOR.indexOf(mg) >= 0) anteriorSets += sets;
      if (POSTERIOR.indexOf(mg) >= 0) posteriorSets += sets;
    });
  });

  var pushPullRatio = pullSets > 0 ? (pushSets / pullSets) : 0;
  var antPostRatio = posteriorSets > 0 ? (anteriorSets / posteriorSets) : 0;
  var recommendations = [];

  if (pushPullRatio > 1.4) recommendations.push({ type: 'warning', msg: 'Ratio Push/Pull déséquilibré ('+pushPullRatio.toFixed(1)+'×) — ajoute du rowing et des tractions' });
  else if (pushPullRatio < 0.7) recommendations.push({ type: 'info', msg: 'Plus de Pull que de Push — bon pour les épaules' });
  else recommendations.push({ type: 'ok', msg: 'Ratio Push/Pull équilibré (' + pushPullRatio.toFixed(1)+'×)' });

  if (antPostRatio > 1.5) recommendations.push({ type: 'warning', msg: 'Chaîne antérieure dominante — travaille plus les ischio et fessiers' });
  else if (antPostRatio < 0.6) recommendations.push({ type: 'info', msg: 'Bonne attention à la chaîne postérieure' });

  return { pushSets, pullSets, pushPullRatio, anteriorSets, posteriorSets, antPostRatio, recommendations };
}

// ── READINESS ADJUSTMENT ──
// Score readiness (0-100) → multiplicateur sur les charges
function getLoadFromReadiness(readinessScore) {
  if (readinessScore >= 85) return { multiplier: 1.0, label: 'Séance normale', color: 'var(--green)' };
  if (readinessScore >= 70) return { multiplier: 0.975, label: 'Légèrement réduit (-2.5%)', color: 'var(--green)' };
  if (readinessScore >= 55) return { multiplier: 0.95, label: 'Charges réduites (-5%)', color: 'var(--orange)' };
  if (readinessScore >= 40) return { multiplier: 0.90, label: 'Séance légère (-10%)', color: 'var(--orange)' };
  return { multiplier: 0.80, label: 'Technique seulement (-20%)', color: 'var(--red)' };
}

// ── ACCUMULATED FATIGUE SCORE (0-100) ──
function computeFatigueScore(logs) {
  if (!logs || !logs.length) return 0;
  var now = Date.now();
  var score = 0;
  var FATIGUE_DECAY_H = 48; // heures pour récupérer d'une série

  logs.forEach(function(log) {
    var hoursAgo = (now - log.timestamp) / 3600000;
    if (hoursAgo > 168) return; // ignorer > 7 jours
    var decay = Math.exp(-hoursAgo / (FATIGUE_DECAY_H * 1.5));
    var totalSets = (log.exercises || []).reduce(function(s, e) { return s + (e.sets || 1); }, 0);
    score += totalSets * decay * 2;
  });

  return Math.min(100, Math.round(score));
}

// ── POWERLIFTING : GÉNÉRATION MÉSOCYCLE ──
// Structure : 1 intro + 2 montée + 1 peak + 1 deload = 5 semaines
// prs = { bench, squat, deadlift } en kg
function generatePLMesocycle(weekNum, prs, targetWeeks, isCompetition) {
  // weekNum dans le mésocycle (1-5)
  var phase = weekNum <= 1 ? 'intro' : weekNum <= 3 ? 'build' : weekNum === 4 ? 'peak' : 'deload';
  var intensities = { intro: 0.70, build1: 0.77, build2: 0.83, peak: 0.90, deload: 0.55 };
  var pct;
  if (phase === 'intro') pct = intensities.intro;
  else if (phase === 'build') pct = weekNum === 2 ? intensities.build1 : intensities.build2;
  else if (phase === 'peak') pct = isCompetition ? 0.93 : 0.90;
  else pct = intensities.deload;

  var repsMap = { intro: '5×5', build1: '4×4', build2: '3×3', peak: '2×2', deload: '3×10' };
  var reps = repsMap[phase === 'build' ? (weekNum === 2 ? 'build1' : 'build2') : phase];

  return {
    phase: phase,
    weekLabel: phase === 'intro' ? 'Intro — Remise en route' :
               phase === 'build' ? 'Montée de charge sem. '+(weekNum-1) :
               phase === 'peak'  ? (isCompetition ? 'Peak — Compétition' : 'Peak — Test 1RM') :
               'Deload — Récupération',
    pct: Math.round(pct * 100),
    squatLoad: calcLoadFromPct(prs.squat, pct * 100),
    benchLoad: calcLoadFromPct(prs.bench, pct * 100),
    deadliftLoad: calcLoadFromPct(prs.deadlift, pct * 100),
    reps: reps,
    restSeconds: phase === 'peak' ? 300 : phase === 'deload' ? 120 : 240
  };
}

// ── POWERBUILDING : GÉNÉRATION SÉANCE ──
// accentPct : 0=full volume, 100=full force
function generatePBSession(lift, prs, accentPct) {
  var forcePct = Math.max(10, Math.min(90, accentPct));
  // Composé principal
  var mainIntensity, mainReps, mainSets, backoffSets;
  if (forcePct >= 70) {
    // Accent force : top single + back-off sets
    mainIntensity = 0.87 + (forcePct - 70) * 0.001;
    mainReps = forcePct >= 80 ? '1 (RPE 9)' : '3';
    mainSets = 1;
    backoffSets = { count: 2, pct: 80, reps: 3 };
  } else if (forcePct >= 45) {
    // Équilibre : 4-6 reps
    mainIntensity = 0.78 + (forcePct - 45) * 0.004;
    mainReps = '4-6';
    mainSets = 4;
    backoffSets = null;
  } else {
    // Accent volume : 6-8 reps
    mainIntensity = 0.72;
    mainReps = '6-8';
    mainSets = 4;
    backoffSets = null;
  }

  // Accessoires (reps inversement proportionnels au focus force)
  var accRepsLow = forcePct >= 70 ? 8 : forcePct >= 45 ? 10 : 12;
  var accRepsHigh = forcePct >= 70 ? 12 : forcePct >= 45 ? 15 : 20;
  var accSets = 3;

  var pr = prs[lift] || 100;
  return {
    mainExercise: {
      load: calcLoadFromPct(pr, mainIntensity * 100),
      reps: mainReps,
      sets: mainSets,
      rpe: forcePct >= 70 ? 9 : 8
    },
    backoffSets: backoffSets ? {
      load: calcLoadFromPct(pr, backoffSets.pct),
      reps: backoffSets.reps,
      sets: backoffSets.count
    } : null,
    accessoryScheme: accSets+'×'+accRepsLow+'-'+accRepsHigh+' (RPE 8)',
    restMain: forcePct >= 70 ? 300 : 240,
    restAccessory: forcePct >= 70 ? 120 : 90
  };
}

// ── MUSCULATION : SPLIT GENERATOR ──
// Génère la structure de la semaine selon le split choisi
function generateMuscuWeek(splitId, level) {
  var weeks = {
    'FULL_2': [
      { day: 'Lundi', name: 'Full Body A', muscles: ['Pectoraux', 'Dos', 'Quadriceps', 'Épaules'] },
      { day: 'Jeudi', name: 'Full Body B', muscles: ['Pectoraux', 'Dos', 'Ischio', 'Biceps', 'Triceps'] }
    ],
    'FULL_3': [
      { day: 'Lundi',   name: 'Full Body A', muscles: ['Quadriceps', 'Pectoraux', 'Dos', 'Épaules'] },
      { day: 'Mercredi',name: 'Full Body B', muscles: ['Ischio', 'Pectoraux', 'Dos', 'Biceps', 'Triceps'] },
      { day: 'Vendredi',name: 'Full Body C', muscles: ['Quadriceps', 'Pectoraux', 'Dos', 'Abdominaux'] }
    ],
    'UL_4': [
      { day: 'Lundi',   name: 'Upper A', muscles: ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps'] },
      { day: 'Mardi',   name: 'Lower A', muscles: ['Quadriceps', 'Ischio', 'Fessiers', 'Mollets'] },
      { day: 'Jeudi',   name: 'Upper B', muscles: ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps'] },
      { day: 'Vendredi',name: 'Lower B', muscles: ['Quadriceps', 'Ischio', 'Fessiers', 'Abdominaux'] }
    ],
    'PPL_5': [
      { day: 'Lundi',   name: 'Push A', muscles: ['Pectoraux', 'Épaules', 'Triceps'] },
      { day: 'Mardi',   name: 'Pull A', muscles: ['Dos', 'Biceps', 'Trapèzes'] },
      { day: 'Mercredi',name: 'Legs A', muscles: ['Quadriceps', 'Ischio', 'Fessiers', 'Mollets'] },
      { day: 'Vendredi',name: 'Push B', muscles: ['Pectoraux', 'Épaules', 'Triceps'] },
      { day: 'Samedi',  name: 'Pull B', muscles: ['Dos', 'Biceps', 'Abdominaux'] }
    ],
    'PPL_6': [
      { day: 'Lundi',   name: 'Push A', muscles: ['Pectoraux', 'Épaules', 'Triceps'] },
      { day: 'Mardi',   name: 'Pull A', muscles: ['Dos', 'Biceps', 'Trapèzes'] },
      { day: 'Mercredi',name: 'Legs A', muscles: ['Quadriceps', 'Ischio', 'Fessiers'] },
      { day: 'Jeudi',   name: 'Push B', muscles: ['Pectoraux', 'Épaules', 'Triceps'] },
      { day: 'Vendredi',name: 'Pull B', muscles: ['Dos', 'Biceps', 'Abdominaux'] },
      { day: 'Samedi',  name: 'Legs B', muscles: ['Quadriceps', 'Ischio', 'Fessiers', 'Mollets'] }
    ]
  };
  return weeks[splitId] || weeks['FULL_3'];
}

// ── COMPÉTITION : PEAK PLANNING ──
// Calcule les tentatives openers / 2e / 3e pour une compétition
function calcCompetitionAttempts(pr) {
  if (!pr) return null;
  return {
    opener:  calcLoadFromPct(pr, 90),  // 90% → lift sûr
    second:  calcLoadFromPct(pr, 96),  // 96% → près du PR
    third:   calcLoadFromPct(pr, 101)  // 101% → nouveau PR
  };
}

// Calcule les semaines restantes avant compétition et la phase recommandée
function getPeakPhase(competitionDate) {
  if (!competitionDate) return null;
  var weeksOut = Math.ceil((new Date(competitionDate) - Date.now()) / (7 * 86400000));
  var phase, advice;
  if (weeksOut > 12) { phase = 'accumulation'; advice = 'Phase de volume — construire la base'; }
  else if (weeksOut > 6) { phase = 'intensification'; advice = 'Monter l\'intensité progressivement'; }
  else if (weeksOut > 2) { phase = 'peak'; advice = 'Charges lourdes, volume bas, récupération max'; }
  else { phase = 'deload'; advice = 'Séances très légères — conserver l\'énergie pour la compét'; }
  return { weeksOut, phase, advice };
}
