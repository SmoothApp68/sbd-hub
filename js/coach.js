// ============================================================
// js/coach.js — Coach Algo amélioré
// Chargé AVANT app.js
// Dépend de : js/engine.js, js/program.js
// ============================================================

// ── MUSCLES COUVERTS PAR LE PROGRAMME DE LA SEMAINE ──
// Évite les fausses alertes "Volume insuffisant" pour des muscles déjà
// programmés dans des séances à venir (db.weeklyPlan).
function getMusclesPlannedThisWeek() {
  var planned = new Set();
  if (typeof db === 'undefined' || !db || !db.weeklyPlan || !db.weeklyPlan.days) return planned;
  db.weeklyPlan.days.forEach(function(day) {
    if (day.rest) return;
    (day.exercises || []).forEach(function(exo) {
      var name = exo && exo.name;
      if (!name) return;
      var mg = typeof getMuscleGroup === 'function' ? getMuscleGroup(name) : null;
      if (mg && mg !== 'Autre' && mg !== 'Cardio') planned.add(mg);
      var parent = mg && typeof getMuscleGroupParent === 'function' ? getMuscleGroupParent(mg) : null;
      if (parent && parent !== 'Autre' && parent !== 'Cardio') planned.add(parent);
    });
  });
  return planned;
}

// ── ANALYSE VOLUME PAR MUSCLE (MEV/MAV/MRV) ──
// Retourne un rapport complet sur le volume hebdomadaire par muscle
function coachAnalyzeWeeklyVolume() {
  var logs7 = typeof getLogsInRange === 'function' ? getLogsInRange(7) : [];
  if (!logs7.length) return null;

  // Calculer les sets par groupe musculaire
  var muscleSetMap = {};
  logs7.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var mg = typeof getMuscleGroup === 'function' ? getMuscleGroup(exo.name) : 'Autre';
      if (!mg || mg === 'Autre' || mg === 'Cardio') return;
      var numSets = Array.isArray(exo.sets)
        ? exo.sets.filter(function(s) { return !s.isWarmup; }).length
        : (typeof exo.sets === 'number' ? exo.sets : (exo.series || 1));
      muscleSetMap[mg] = (muscleSetMap[mg] || 0) + numSets;
    });
  });

  // Analyser chaque muscle vs landmarks
  var report = { optimal: [], under: [], high: [], over: [] };
  var _muscleKeys = typeof MUSCLE_VOLUME_DISPLAY_KEYS !== 'undefined' ? MUSCLE_VOLUME_DISPLAY_KEYS : [];
  _muscleKeys.forEach(function(muscle) {
    var sets = muscleSetMap[muscle] || 0;
    if (sets === 0) return; // ignorer muscles non travaillés
    var status = getVolumeStatus(muscle, sets);
    var entry = { muscle: muscle, sets: sets, status: status };
    if (status.status === 'optimal') report.optimal.push(entry);
    else if (status.status === 'under') report.under.push(entry);
    else if (status.status === 'high') report.high.push(entry);
    else if (status.status === 'over') report.over.push(entry);
  });

  return report;
}

// ── COACH MESSAGE ENRICHI ──
// Génère un message de coaching complet basé sur toutes les données disponibles
// Cette fonction REMPLACE generateCoachAlgoMessage dans app.js progressivement
// Pour l'instant elle est appelée séparément sous le nom coachGetFullAnalysis()
function coachGetFullAnalysis() {
  var db = typeof window.db !== 'undefined' ? window.db : null;
  if (!db || !db.logs || db.logs.length === 0) {
    return '<div style="text-align:center;padding:20px;color:var(--sub);font-size:13px;">Importe des séances pour activer le Coach Algo.</div>';
  }
  var coachProfile = (db.user && db.user.coachProfile) || 'full';
  if (coachProfile === 'silent') {
    return '<div style="text-align:center;padding:20px;color:var(--sub);font-size:13px;">Mode silencieux — juste les chiffres.</div>';
  }

  var sections = [];
  var mode = (db.user && db.user.trainingMode) || 'powerlifting';
  var bw = (db.user && db.user.bw) || 0;

  // ── MODE BIEN-ÊTRE : métriques dédiées, retour anticipé ──
  if (mode === 'bien_etre') {
    var wm = typeof computeWellbeingMetrics === 'function' ? computeWellbeingMetrics() : null;
    if (!wm) return '<div style="text-align:center;padding:20px;color:var(--sub);">Commence tes séances pour voir tes métriques.</div>';

    var html = '';
    html += '<div class="ai-section"><div class="ai-section-title">🌿 Ton parcours bien-être</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;">';
    html += '<div style="text-align:center;background:var(--surface);border-radius:12px;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:var(--orange);">' + wm.streak + '</div>';
    html += '<div style="font-size:10px;color:var(--sub);">Jours actifs<br>ce mois</div></div>';
    html += '<div style="text-align:center;background:var(--surface);border-radius:12px;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:var(--purple);">' + wm.varietyScore + '</div>';
    html += '<div style="font-size:10px;color:var(--sub);">Score<br>variété</div></div>';
    html += '<div style="text-align:center;background:var(--surface);border-radius:12px;padding:12px;">';
    html += '<div style="font-size:24px;font-weight:800;color:var(--green);">' + wm.srsWellbeing + '</div>';
    html += '<div style="font-size:10px;color:var(--sub);">Régularité<br>/100</div></div>';
    html += '</div>';

    var motivMsg = wm.streak >= 20 ? '🔥 Mois exceptionnel — tu es en mouvement !'
      : wm.streak >= 12 ? '💪 Belle constance — continue comme ça.'
      : wm.streak >= 6  ? '🌱 Bonne lancée — la régularité se construit.'
      : '👋 Commence par 3 séances cette semaine — la constance est tout.';
    html += '<div style="font-size:13px;color:var(--text);margin-bottom:8px;">' + motivMsg + '</div>';

    if (wm.varietyScore < 30) {
      var lacking = wm.typeBreakdown.cardio < wm.typeBreakdown.force
        ? 'du cardio (marche, vélo, natation)'
        : wm.typeBreakdown.souplesse < wm.typeBreakdown.force
        ? 'de la souplesse (yoga, mobilité)'
        : 'de la force légère';
      html += '<div style="font-size:12px;color:var(--sub);">💡 Ajoute ' + lacking + ' pour un équilibre optimal.</div>';
    }

    html += '</div>';
    html += '<div class="ai-timestamp">Coach Bien-être · Mouvement > Performance</div>';
    return html;
  }

  // ── 1. SCORE DE FORME ──
  var fatigueScore = computeFatigueScore(db.logs);
  var readiness = getLoadFromReadiness(100 - fatigueScore);
  var deloadCheck = shouldDeload(db.logs, mode);

  var formHtml = '<div class="ai-section-title">📊 État de forme</div>';
  formHtml += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">';
  formHtml += '<div style="flex:1;min-width:80px;text-align:center;background:rgba(255,255,255,.04);border-radius:10px;padding:10px;">';
  formHtml += '<div style="font-size:22px;font-weight:800;color:'+(fatigueScore < 40 ? 'var(--green)' : fatigueScore < 70 ? 'var(--orange)' : 'var(--red)')+';">'+(100-fatigueScore)+'</div>';
  formHtml += '<div style="font-size:9px;color:var(--sub);text-transform:uppercase;letter-spacing:.4px;margin-top:2px;">Forme / 100</div></div>';
  formHtml += '<div style="flex:2;padding:10px;background:rgba(255,255,255,.03);border-radius:10px;font-size:12px;color:var(--sub);line-height:1.6;">';
  formHtml += readiness.label;
  if (deloadCheck.needed) {
    formHtml += '<br><span style="color:var(--orange);">⚠️ ' + (typeof getVocab === 'function' ? getVocab('deload') : 'Deload') + ' recommandé — '+deloadCheck.reason+'</span>';
  }
  formHtml += '</div></div>';
  sections.push(formHtml);

  // ── 2. RECOMMANDATIONS AUJOURD'HUI ──
  var today = typeof DAYS_FULL !== 'undefined' ? DAYS_FULL[new Date().getDay()] : '';
  var routine = typeof getRoutine === 'function' ? getRoutine() : {};
  var todayPlan = routine[today] || 'Repos';
  todayPlan = todayPlan.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]+\s*/gu, '').trim();

  var recoHtml = '<div class="ai-section-title">🦍 Coach dit</div>';
  var recos = [];

  // Détecter les muscles en sous-volume — filtrés vs programme prévu
  var volReport = coachAnalyzeWeeklyVolume();
  var plannedMuscles = getMusclesPlannedThisWeek();
  if (volReport && volReport.under.length > 0) {
    var reallyUnder = volReport.under.filter(function(e) { return !plannedMuscles.has(e.muscle); });
    if (reallyUnder.length > 0) {
      recos.push({ dot: 'var(--orange)', text: '<strong>Volume insuffisant :</strong> ' + reallyUnder.map(function(e) { return e.muscle + ' ('+e.sets+' sets)'; }).join(', ') + ' — ajoute des séries cette semaine.' });
    }
  }
  if (volReport && volReport.over.length > 0) {
    recos.push({ dot: 'var(--red)', text: '<strong>Survolume détecté :</strong> ' + volReport.over.map(function(e) { return e.muscle; }).join(', ') + ' — réduis le volume ou passe en deload.' });
  }

  // Équilibre musculaire
  var balance = analyzeMuscleBalance(db.logs, 14);
  if (balance && balance.recommendations) {
    balance.recommendations.forEach(function(r) {
      if (r.type === 'warning') recos.push({ dot: 'var(--orange)', text: r.msg });
    });
  }

  // Progression SBD — cibles (full uniquement)
  var pr = db.bestPR || {};
  if (coachProfile === 'full') {
    var targets = (db.user && db.user.targets) || {};
    if (pr.bench && targets.bench && pr.bench < targets.bench) {
      var gapBench = targets.bench - pr.bench;
      recos.push({ dot: 'var(--accent)', text: '<strong>Bench :</strong> '+pr.bench+'kg → objectif '+targets.bench+'kg ('+gapBench+'kg restants)' });
    }
    if (pr.squat && targets.squat && pr.squat < targets.squat) {
      var gapSquat = targets.squat - pr.squat;
      recos.push({ dot: 'var(--squat)', text: '<strong>Squat :</strong> '+pr.squat+'kg → objectif '+targets.squat+'kg ('+gapSquat+'kg restants)' });
    }
    if (pr.deadlift && targets.deadlift && pr.deadlift < targets.deadlift) {
      var gapDead = targets.deadlift - pr.deadlift;
      recos.push({ dot: 'var(--deadlift)', text: '<strong>Deadlift :</strong> '+pr.deadlift+'kg → objectif '+targets.deadlift+'kg ('+gapDead+'kg restants)' });
    }
  }

  // Séance du jour — enrichie avec les exercices principaux prévus
  var todayPlanData = db.weeklyPlan && db.weeklyPlan.days
    ? db.weeklyPlan.days.find(function(d) { return d.day === today; })
    : null;
  var todayLabel = todayPlan;
  if (todayPlanData && !todayPlanData.rest && todayPlanData.exercises && todayPlanData.exercises.length) {
    var mainExos = todayPlanData.exercises
      .filter(function(e) { return e.isPrimary; })
      .slice(0, 3)
      .map(function(e) { return e.name; });
    if (!mainExos.length) {
      mainExos = todayPlanData.exercises.slice(0, 2).map(function(e) { return e.name; });
    }
    if (mainExos.length) {
      todayLabel += ' <span style="color:var(--sub);font-size:11px;">(' + mainExos.join(', ') + ')</span>';
    }
  }
  recos.push({ dot: 'var(--green)', text: '<strong>Aujourd\'hui (' + today + ') :</strong> ' + todayLabel + (readiness.multiplier < 1 ? ' — charges à '+ Math.round(readiness.multiplier*100)+'%' : '') });

  if (recos.length > 0) {
    recos.forEach(function(r) {
      recoHtml += '<div style="display:flex;gap:9px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);">';
      recoHtml += '<div style="width:7px;height:7px;border-radius:50%;background:'+r.dot+';flex-shrink:0;margin-top:5px;"></div>';
      recoHtml += '<div style="font-size:12px;color:var(--sub);line-height:1.55;">'+r.text+'</div></div>';
    });
  } else {
    recoHtml += '<div style="font-size:12px;color:var(--sub);">Tout est optimal — continue comme ça !</div>';
  }
  sections.push(recoHtml);

  // ── 3. VOLUME PAR MUSCLE (MEV/MAV/MRV) ──
  if (volReport) {
    var allMuscles = volReport.optimal.concat(volReport.under).concat(volReport.high).concat(volReport.over);
    if (allMuscles.length > 0) {
      var volHtml = '<div class="ai-section-title">💪 Volume semaine (MEV → MRV)</div>';
      allMuscles.forEach(function(e) {
        var lm = typeof getMuscleVolumeTarget === 'function' ? getMuscleVolumeTarget(e.muscle) : null;
        if (!lm) return;
        var fillPct = Math.min(100, Math.round((e.sets / lm.MRV) * 100));
        var barColor = e.status.color;
        volHtml += '<div style="margin-bottom:7px;">';
        volHtml += '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">';
        volHtml += '<span style="font-weight:600;">'+e.muscle+'</span>';
        volHtml += '<span style="color:'+barColor+';font-weight:700;">'+e.sets+' sets</span></div>';
        volHtml += '<div style="height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;">';
        volHtml += '<div style="width:'+fillPct+'%;height:100%;background:'+barColor+';border-radius:2px;"></div></div>';
        volHtml += '</div>';
      });
      sections.push(volHtml);
    }
  }

  // ── 4. PLATEAUX ──
  var plateaux = [];
  ['bench', 'squat', 'deadlift'].forEach(function(type) {
    if (typeof detectPlateau === 'function') {
      var p = detectPlateau(type);
      if (p) plateaux.push(p);
    }
  });
  if (plateaux.length > 0) {
    var platHtml = '<div class="ai-section-title">⚠️ Alertes plateau</div>';
    var SUGGESTIONS = {
      bench: ['Pause bench · Spoto press · Monter le volume accessoires épaules/triceps'],
      squat: ['Pause squat · Box squat · Vérifier la récupération jambes'],
      deadlift: ['Déficit deadlift · Romanian DL · Renforcer la chaîne postérieure']
    };
    plateaux.forEach(function(p) {
      platHtml += '<div style="background:rgba(255,69,58,.06);border:1px solid rgba(255,69,58,.15);border-radius:10px;padding:10px 12px;margin-bottom:7px;">';
      platHtml += '<div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:4px;">📉 '+p.type.toUpperCase()+' — plateau depuis '+p.sessions+' séances</div>';
      var sugg = SUGGESTIONS[p.type];
      if (sugg) platHtml += '<div style="font-size:11px;color:var(--sub);">→ '+sugg[0]+'</div>';
      platHtml += '</div>';
    });
    sections.push(platHtml);
  }

  // ── 5. PROGRESSION SBD (tendance) — full uniquement ──
  if (coachProfile === 'full') {
    var momHtml = '<div class="ai-section-title">📈 Tendance SBD</div>';
    momHtml += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">';
    ['bench', 'squat', 'deadlift'].forEach(function(type) {
      var prVal = pr[type] || 0;
      var mom = typeof calcMomentum === 'function' ? calcMomentum(type) : 0;
      var label = type === 'bench' ? 'Bench' : type === 'squat' ? 'Squat' : 'Dead.';
      var color = type === 'bench' ? 'var(--bench)' : type === 'squat' ? 'var(--squat)' : 'var(--deadlift)';
      var trend = mom > 0 ? ('↑ +'+mom) : mom < 0 ? ('↓ '+mom) : '→ stable';
      var trendColor = mom > 0 ? 'var(--green)' : mom < 0 ? 'var(--red)' : 'var(--sub)';
      momHtml += '<div style="background:rgba(255,255,255,.04);border-radius:10px;padding:9px;text-align:center;">';
      momHtml += '<div style="font-size:8px;color:'+color+';text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">'+label+'</div>';
      momHtml += '<div style="font-size:18px;font-weight:900;color:'+color+';">'+prVal+'<span style="font-size:11px;">kg</span></div>';
      momHtml += '<div style="font-size:10px;font-weight:600;color:'+trendColor+';margin-top:2px;">'+trend+'</div>';
      momHtml += '</div>';
    });
    momHtml += '</div>';
    sections.push(momHtml);
  }

  return '<div class="ai-response-content">' + sections.map(function(s) { return '<div class="ai-section">'+s+'</div>'; }).join('') + '</div><div class="ai-timestamp">Coach Algo · Calcul instantané · Sans IA</div>';
}

// ── TRIMP FORCE (Foster et al. 2001 adapté powerbuilding) ──────────────────
// TRIMP = Σ (reps × RPE² × C_slot) par séance
// C_slot : primaire=1.5, secondaire=1.2, isolation=1.0
function calcWeeklyTRIMPForce(logs) {
  var cutoff = Date.now() - 7 * 86400000;
  var weekLogs = (logs || []).filter(function(l) { return l.timestamp > cutoff; });
  var total = 0;
  weekLogs.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var cSlot = exo.isPrimary ? 1.5 : (exo.slot === 'isolation' ? 1.0 : 1.2);
      (exo.allSets || []).forEach(function(s) {
        if (s.isWarmup || s.isBackOff) return;
        var rpe = parseFloat(s.rpe) || 7;
        var reps = parseInt(s.reps) || 0;
        total += reps * Math.pow(rpe, 2) * cSlot;
      });
    });
  });
  // FIX 2: divide by 15 to align with Bannister cardio TRIMP scale
  return Math.round(total / 15);
}

function calcChronicTRIMPForce(logs) {
  var cutoff = Date.now() - 28 * 86400000;
  var monthLogs = (logs || []).filter(function(l) { return l.timestamp > cutoff; });
  var total = 0;
  monthLogs.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var cSlot = exo.isPrimary ? 1.5 : (exo.slot === 'isolation' ? 1.0 : 1.2);
      (exo.allSets || []).forEach(function(s) {
        if (s.isWarmup || s.isBackOff) return;
        var rpe = parseFloat(s.rpe) || 7;
        var reps = parseInt(s.reps) || 0;
        total += reps * Math.pow(rpe, 2) * cSlot;
      });
    });
  });
  // FIX 2: weekly avg (÷4) then normalize (÷15) = ÷60
  return Math.round(total / 60);
}

// ── SFR (Stimulus/Fatigue Ratio) — coût récupération distinct du TRIMP ────
var SFR_TABLE = {
  'soulevé de terre': 1.0, 'deadlift': 1.0,
  'squat': 1.12, 'squat barre': 1.12, 'back squat': 1.12,
  'développé couché': 1.4, 'bench press': 1.4, 'bench': 1.4,
  'rowing poulie': 2.5, 'chest supported': 2.5,
  'rowing barre': 1.5,
  'leg curl': 3.5, 'curl': 3.5,
  '_big': 1.2, '_compound': 2.0, '_isolation': 3.5
};

function getSFRForExo(exoName, category) {
  var name = (exoName || '').toLowerCase();
  for (var key in SFR_TABLE) {
    if (key[0] !== '_' && name.indexOf(key) >= 0) return SFR_TABLE[key];
  }
  if (category === 'isolation') return SFR_TABLE['_isolation'];
  if (category === 'compound') return SFR_TABLE['_compound'];
  return SFR_TABLE['_big'];
}

function calcWeeklyFatigueCost(logs) {
  var cutoff = Date.now() - 7 * 86400000;
  var weekLogs = (logs || []).filter(function(l) { return l.timestamp > cutoff; });
  var total = 0;
  weekLogs.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var sfr = getSFRForExo(exo.name, exo.slot);
      (exo.allSets || []).forEach(function(s) {
        if (s.isWarmup || s.isBackOff) return;
        var rpe = parseFloat(s.rpe) || 7;
        var reps = parseInt(s.reps) || 0;
        total += reps * (1 / sfr) * (Math.pow(rpe, 2) / 100);
      });
    });
  });
  return Math.round(total * 10) / 10;
}

// ── INSOLVENCY INDEX — Calcul principal ──────────────────────────────────
// Ratio dette/capacité. > 1.0 = insolvabilité biologique.
// Séparé du SRS (radar tactique) — mesure la dette accumulée sur 7j.
// Source : Gemini validation 2026
function calcInsolvencyIndex(logs) {
  if (!logs || logs.length === 0) return { index: 0, level: 'ok', details: {} };

  // 1. Coût de fatigue hebdomadaire (Prompt A — SFR-pondéré)
  var fatigueCost = typeof calcWeeklyFatigueCost === 'function'
    ? calcWeeklyFatigueCost(logs) : 0;
  if (!fatigueCost || isNaN(fatigueCost) || fatigueCost <= 0) {
    return { index: 0, level: 'ok', details: {} };
  }

  // 2. Capacité de base individuelle
  var baseCapacity = typeof calcBaseCapacity === 'function'
    ? calcBaseCapacity() : 1.0;

  // 3. Budget récupération depuis le SRS (0.0 → 1.0)
  // SRS score 100 = récupération optimale, score 0 = épuisement total
  var srs = typeof computeSRS === 'function' ? computeSRS() : null;
  var srsScore = (srs && typeof srs.score === 'number') ? srs.score : 70;
  // Plancher à 0.3 pour éviter division par ~0 si SRS très bas
  var recoveryBudget = Math.max(0.3, srsScore / 100);

  // 4. Index brut
  // fatigueCost est normalisé (Σ reps × (1/SFR) × RPE²/100)
  // dénominateur ×100 calibré pour qu'une semaine normale (fatigueCost≈70) donne index≈0.875
  var rawIndex = fatigueCost / (baseCapacity * recoveryBudget * 100);

  // 5. Malus articulaire : +0.2 par articulation en zone rouge
  var jointAlerts = typeof getJointStressAlerts === 'function'
    ? getJointStressAlerts(logs) : [];
  var redJoints = jointAlerts.filter(function(a) { return a.level === 'red'; });
  var jointMalus = redJoints.length * 0.2;

  var finalIndex = Math.round((rawIndex + jointMalus) * 100) / 100;
  // Valeur bornée à 1.99 pour l'affichage — au-delà de critical (1.4)
  // la valeur exacte n'a pas de valeur informative pour l'utilisateur
  var displayIndex = Math.min(finalIndex, 1.99);

  // 6. Niveau
  var thresholds = typeof INSOLVENCY_THRESHOLDS !== 'undefined'
    ? INSOLVENCY_THRESHOLDS : { orange: 1.0, red: 1.2, critical: 1.4 };
  var level = finalIndex >= thresholds.critical ? 'critical'
            : finalIndex >= thresholds.red      ? 'red'
            : finalIndex >= thresholds.orange   ? 'orange'
            : 'ok';

  return {
    index:         finalIndex,
    displayIndex:  displayIndex,
    level:         level,
    fatigueCost:   fatigueCost,
    baseCapacity:  baseCapacity,
    recoveryBudget:Math.round(recoveryBudget * 100),
    jointMalus:    jointMalus,
    redJoints:     redJoints.map(function(a) { return a.label; }),
    srsScore:      srsScore
  };
}

// ── AUTO-TUNER : ajustements de Volume Landmarks ─────────────────────────────
// Évalué en fin de mésocycle (4 semaines).
// +1 delta : volume ≥ MAV_high + insolvency moyen < 0.9 + volume en hausse
// -1 delta : insolvency moyen ≥ 1.2 (zone rouge persistante)
// Source : Gemini validation 2026
function calcVolumeAutoTune(logs) {
  if (!logs || logs.length === 0) return {};

  var now = Date.now();
  var fourWeeks = 28 * 86400000;
  var twoWeeks  = 14 * 86400000;

  var logs4w = logs.filter(function(l) { return l.timestamp > now - fourWeeks; });
  // Minimum 8 séances sur 14j calendaires — évite les faux positifs cold start
  if (logs4w.length < 8) return {};
  var oldestLog = logs4w.reduce(function(min, l) { return l.timestamp < min ? l.timestamp : min; }, Date.now());
  if ((Date.now() - oldestLog) < 14 * 86400000) return {};

  // Cooldown 25j entre deux évaluations (1 mésocycle minimum)
  // Empêche les tirs répétés à chaque régénération de plan (audit 60)
  var _lastSuggestion = (db.weeklyPlan && db.weeklyPlan._volumeSuggestionsDate) || 0;
  if (_lastSuggestion && (now - _lastSuggestion) < 25 * 86400000) return {};

  // Insolvency sur les 7 derniers jours uniquement — un pic isolé ne doit pas
  // déclencher une réduction globale (lissage vs calcul sur 4 semaines)
  var logs7d = logs.filter(function(l) { return l.timestamp > now - 7 * 86400000; });
  var insolvency7d = typeof calcInsolvencyIndex === 'function'
    ? calcInsolvencyIndex(logs7d) : { index: 0 };
  var avgInsolvency = insolvency7d.index || 0;

  function getMuscleWeeklySets(subset, startTs, endTs) {
    var sets = {};
    subset.filter(function(l) {
      return l.timestamp >= startTs && l.timestamp < endTs;
    }).forEach(function(log) {
      (log.exercises || []).forEach(function(exo) {
        var contribs = typeof getMuscleContributions === 'function'
          ? getMuscleContributions(exo.name) : [];
        var workSets = (exo.allSets || []).filter(function(s) {
          return !(s.isWarmup === true || s.setType === 'warmup');
        });
        contribs.forEach(function(mc) {
          if (mc.coeff < 0.5) return;
          var key = typeof getMuscleKey === 'function' ? getMuscleKey(mc.muscle) : null;
          if (!key) return;
          sets[key] = (sets[key] || 0) + workSets.length;
        });
      });
    });
    return sets;
  }

  var setsEarly = getMuscleWeeklySets(logs4w, now - fourWeeks, now - twoWeeks);
  var setsLate  = getMuscleWeeklySets(logs4w, now - twoWeeks, now);

  var recommendations = {};
  Object.keys(setsLate).forEach(function(muscle) {
    var target = typeof getMuscleVolumeTarget === 'function'
      ? getMuscleVolumeTarget(muscle) : null;
    if (!target) return;
    var avgSets = setsLate[muscle] || 0;
    var trend = avgSets - (setsEarly[muscle] || 0);
    var limits = typeof VOLUME_DELTA_LIMITS !== 'undefined' ? VOLUME_DELTA_LIMITS : { max: 4, min: -4 };
    var currentDelta = (db.user && db.user.volumeDeltas && db.user.volumeDeltas[muscle]) || 0;
    if (avgSets >= target.MAV_high && avgInsolvency < 0.9 && trend >= 0) {
      if (currentDelta < limits.max) recommendations[muscle] = currentDelta + 1;
    } else if (avgInsolvency >= 1.3 && avgSets > target.MEV) {
      // Ne réduire que si le muscle correspond à une articulation en zone rouge
      // OU si l'insolvency est vraiment critique (> 1.4)
      var MUSCLE_TO_JOINT = {
        quads: 'genoux', ischio: 'genoux', fessiers: 'hanches',
        dos: 'lombaires', trapezes: 'lombaires', pecs: 'epaules', epaules: 'epaules'
      };
      var jointAlerts7d = typeof getJointStressAlerts === 'function'
        ? getJointStressAlerts(logs7d) : [];
      var muscleJoint = MUSCLE_TO_JOINT[muscle];
      var hasJointAlert = muscleJoint && jointAlerts7d.some(function(a) {
        return a.joint === muscleJoint && a.level === 'red';
      });
      if ((hasJointAlert || avgInsolvency >= 1.4) && currentDelta > limits.min) {
        recommendations[muscle] = currentDelta - 1;
      }
    }
  });
  return recommendations;
}

// Mode passif — ne plus modifier volumeDeltas automatiquement.
// Retourne les suggestions pour affichage Coach ; l'utilisateur valide manuellement.
function applyVolumeAutoTune(logs) {
  var recs = calcVolumeAutoTune(logs);
  if (!recs || Object.keys(recs).length === 0) return { changed: false, suggestions: {} };

  // MODE PASSIF — ne plus écrire dans db.user.volumeDeltas
  // Les suggestions sont stockées dans db.weeklyPlan._volumeSuggestions par generateWeeklyPlan
  return { changed: false, suggestions: recs };
}

// ── Diagnostic Coach enrichi avec l'Insolvency Index ────────────────────────
// Wrapper autour d'analyzeAthleteProfile() — distinct du SRS (radar tactique).
// Insolvency = bilan comptable (dette accumulée 7j). SRS = forme du jour.
function analyzeAthleteProfileWithInsolvency() {
  var sections = typeof analyzeAthleteProfile === 'function'
    ? analyzeAthleteProfile() : [];

  var insolvency = calcInsolvencyIndex(db.logs || []);
  if (insolvency.index <= 0) return sections;

  var alerts = [];
  var indexDisplay = (insolvency.displayIndex !== undefined
    ? insolvency.displayIndex : insolvency.index).toFixed(2);
  var budgetDisplay = insolvency.recoveryBudget + '%';

  if (insolvency.level === 'ok') {
    alerts.push({
      severity: 'good',
      title: '✅ Bilan de récupération',
      text: 'Index ' + indexDisplay + ' — Capacité de récupération OK. '
          + 'Budget SRS : ' + budgetDisplay + '. Continue à ce rythme.'
    });
  } else if (insolvency.level === 'orange') {
    alerts.push({
      severity: 'warning',
      title: '⚠️ Déficit de récupération modéré',
      text: 'Index ' + indexDisplay + ' — Tu dépenses légèrement plus que tu ne récupères. '
          + 'Budget SRS : ' + budgetDisplay + '. '
          + 'Volume accessoires réduit automatiquement (-1 série) cette semaine.'
    });
  } else if (insolvency.level === 'red') {
    var jointText = insolvency.redJoints.length
      ? ' Articulations en rouge : ' + insolvency.redJoints.join(', ') + '.'
      : '';
    alerts.push({
      severity: 'danger',
      title: '🔴 Insolvabilité biologique',
      text: 'Index ' + indexDisplay + ' — Récupération insuffisante. '
          + 'Séance Active Recovery recommandée (cardio zone 2, mobilité).'
          + jointText
    });
  } else if (insolvency.level === 'critical') {
    alerts.push({
      severity: 'danger',
      title: '🚨 Banqueroute — Deload immédiat',
      text: 'Index ' + indexDisplay + ' — Surcharge critique. '
          + 'Deload complet cette semaine obligatoire. '
          + 'Charges réduites à 50-60%, volume minimal.'
    });
  }

  if (alerts.length > 0) {
    sections.push({
      title: '💳 Bilan de Récupération (Insolvency Index)',
      alerts: alerts
    });
  }

  return sections;
}

// ── HRV z-score (normalisé sur 7j) ────────────────────────────────────────
// z > 1.0  → God Mode (augmenter le score)
// z < -1.5 → Fatigue nerveuse (réduire le score)
function calcHRVZScore() {
  var history = db.rhrHistory || [];
  // FIX 3: look at up to 10 entries, require minimum 7 valid HRV readings
  var hrvValues = history.slice(0, 10)
    .filter(function(e) { return e && e.hrv; })
    .map(function(e) { return e.hrv; });
  if (hrvValues.length < 7) return null;
  var todayHRV = hrvValues[0];
  var mean = hrvValues.reduce(function(a, b) { return a + b; }, 0) / hrvValues.length;
  var variance = hrvValues.reduce(function(a, b) { return a + Math.pow(b - mean, 2); }, 0) / hrvValues.length;
  var std = Math.sqrt(variance) || 1;
  // FIX 3: cap z-score at ±3 to prevent outlier distortion
  var z = (todayHRV - mean) / std;
  return Math.max(-3, Math.min(3, z));
}

// ── SCORE COACH SRS (Stress / Recovery / State) ──
// Avec HRV    : ACWR 40%, HRV 30%, Readiness 15%, Trend 15%
// Sans HRV    : ACWR 60%, Readiness 20%, Trend 20%
// Zones ACWR powerbuilding (Foster/Gabbett adapté force) :
//   0.8–1.2 → progression durable (score 100)
//   1.2–1.4 → overreach tolérable 1-2 semaines (décroissance linéaire)
//   > 1.5   → risque blessure ligamentaire
function computeSRS() {
  // Cold start guard — no training data yet
  if (typeof isColdStart === 'function' && isColdStart()) {
    return { score: 75, acwr: 1.0, isColdStart: true, message: 'Semaine de calibration — pas encore de données.' };
  }

  var logs = db.logs || [];
  // Lecture directe currentBlock.phase (NE PAS appeler wpDetectPhase → cycle avec shouldDeload)
  var phase = (db.weeklyPlan && db.weeklyPlan.currentBlock && db.weeklyPlan.currentBlock.phase)
    || 'accumulation';

  // 1. ACWR via TRIMP Force (remplace volume × RPE)
  var acuteSBD = calcWeeklyTRIMPForce(logs);
  var chronicSBD = calcChronicTRIMPForce(logs) || 1;

  function getActivityEffVol(days) {
    var cutoff = Date.now() - days * 86400000;
    var extScore = 0;
    var allActs = (db.weeklyActivities || []).filter(function(a) {
      return a.date && new Date(a.date).getTime() >= cutoff;
    });
    allActs.forEach(function(a) {
      extScore += (typeof computeActivityScore === 'function' ? computeActivityScore(a) : 0) * 0.7;
    });
    var fixedActs = (db.user && db.user.activities) || [];
    fixedActs.forEach(function(a) {
      if (!a.fixed) return;
      var occurrences = Math.floor(days / 7) * (a.days ? a.days.length : 1);
      for (var i = 0; i < occurrences; i++) {
        extScore += (typeof computeActivityScore === 'function' ? computeActivityScore(a) : 0) * 0.7;
      }
    });
    return extScore;
  }

  var acuteExt = getActivityEffVol(7);
  var chronicExt = getActivityEffVol(28) / 4 || 1;
  var acute = acuteSBD + acuteExt;
  var chronic = chronicSBD + chronicExt + 1;
  var acwr = acute / chronic;
  // Zones powerbuilding : 0.8-1.2 optimal, 1.2-1.4 overreach tolérable, >1.5 danger
  var acwrScore;
  if (acwr >= 0.8 && acwr <= 1.2) {
    acwrScore = 100;
  } else if (acwr > 1.2 && acwr <= 1.4) {
    acwrScore = Math.max(60, 100 - (acwr - 1.2) * 200); // linéaire 100→60
  } else {
    acwrScore = Math.max(0, 100 - Math.abs(1.0 - acwr) * 160);
  }

  // 2. Readiness subjective
  var recentR = (db.readiness || []).filter(function(r) {
    return (Date.now() - (r.ts || new Date(r.date).getTime())) < 7 * 86400000;
  });
  var subjScore = recentR.length
    ? recentR.reduce(function(s, r) { return s + r.score; }, 0) / recentR.length
    : 60;

  // 3. Tendance e1RM 14 jours
  var trendScore = 70;
  var sbd = ['squat','bench','deadlift'];
  var deltas = [];
  sbd.forEach(function(type) {
    var pts = [];
    var sorted = logs.slice().sort(function(a,b) { return b.timestamp - a.timestamp; });
    for (var i = 0; i < sorted.length && pts.length < 6; i++) {
      var exo = (sorted[i].exercises || []).find(function(e) {
        return typeof getSBDType === 'function' && getSBDType(e.name) === type && e.maxRM > 0;
      });
      if (exo) pts.push(exo.maxRM);
    }
    if (pts.length >= 2) {
      deltas.push((pts[0] - pts[pts.length-1]) / pts[pts.length-1] * 100);
    }
  });
  if (deltas.length) {
    var avgDelta = deltas.reduce(function(s,d){ return s+d; },0) / deltas.length;
    trendScore = Math.min(100, Math.max(0, 70 + avgDelta * 5));
  }

  // 4. HRV z-score (si données disponibles)
  var hrvZ = calcHRVZScore();
  var raw;
  if (hrvZ !== null) {
    // Avec HRV : ACWR 40%, HRV 30%, Readiness 15%, Trend 15%
    var hrvScore = Math.min(100, Math.max(0, 70 + hrvZ * 15));
    raw = (acwrScore * 0.40) + (hrvScore * 0.30) + (subjScore * 0.15) + (trendScore * 0.15);
  } else {
    // Sans HRV : ACWR 60%, Readiness 20%, Trend 20%
    raw = (acwrScore * 0.60) + (subjScore * 0.20) + (trendScore * 0.20);
  }

  // Peak Mode : la fatigue de peak est attendue, on relève le score
  if (phase === 'peak') raw = Math.min(100, raw * 1.2);

  // PhysioManager — ajustement cycle menstruel
  var cycleCoeff = typeof getCycleCoeff === 'function' ? getCycleCoeff() : 1.0;
  raw = raw * cycleCoeff;

  // Recovery Bonus — yoga/pilates/activité légère hier → +5% Readiness
  var recoveryBonus = typeof getRecoveryBonus === 'function' ? getRecoveryBonus() : 0;
  if (recoveryBonus > 0) {
    raw = Math.min(100, raw * (1 + recoveryBonus));
  }

  var score = Math.round(Math.min(100, Math.max(0, raw)));

  // Malus SRS — activité secondaire intense dans les dernières 24h (activityLogs)
  var _todayStr2 = new Date().toISOString().split('T')[0];
  var _yesterdayD = new Date(); _yesterdayD.setDate(_yesterdayD.getDate() - 1);
  var _yesterdayStr2 = _yesterdayD.toISOString().split('T')[0];
  var _recentActs = (db.activityLogs || []).filter(function(l) {
    return l.date === _todayStr2 || l.date === _yesterdayStr2;
  });
  _recentActs.forEach(function(act) {
    var _actType = (typeof ACTIVITY_KEY_MAP !== 'undefined' && ACTIVITY_KEY_MAP[act.type]) || act.type;
    var _coeff = (typeof ACTIVITY_SPEC_COEFFICIENTS !== 'undefined' && ACTIVITY_SPEC_COEFFICIENTS[_actType]) || 1.0;
    var _intensity = act.intensity || 3;
    var _malus = Math.round(_coeff * (_intensity / 5) * 10);
    score = Math.max(0, score - _malus);
  });

  // ACWR critical or secondary TRIMP critical → cap score + forceActiveRecovery
  var activityFlags = typeof getActivityPenaltyFlags === 'function'
    ? getActivityPenaltyFlags() : { trimp24h: 0, flags: [] };
  var criticalThreshold = typeof ACTIVITY_TRIMP_THRESHOLDS !== 'undefined'
    ? ACTIVITY_TRIMP_THRESHOLDS.critical : 600;
  if (acwr > 1.6 || activityFlags.trimp24h > criticalThreshold) {
    return {
      score: Math.min(score, 40),
      acwr: Math.round(acwr * 100) / 100,
      acwrScore: Math.round(acwrScore),
      subjScore: Math.round(subjScore),
      trendScore: Math.round(trendScore),
      peakMode: phase === 'peak',
      cyclePhase: typeof getCurrentMenstrualPhase === 'function' ? getCurrentMenstrualPhase() : null,
      forceActiveRecovery: true,
      reason: 'Charge totale critique — séance de récupération recommandée',
      label: '🔴 Charge critique — récupération active'
    };
  }

  return {
    score: score,
    acwr: Math.round(acwr * 100) / 100,
    acwrScore: Math.round(acwrScore),
    subjScore: Math.round(subjScore),
    trendScore: Math.round(trendScore),
    hrvZ: hrvZ !== null ? Math.round(hrvZ * 100) / 100 : null,
    hasHRV: hrvZ !== null,
    acuteTRIMP: Math.round(acuteSBD),
    chronicTRIMP: Math.round(chronicSBD),
    peakMode: phase === 'peak',
    cyclePhase: typeof getCurrentMenstrualPhase === 'function' ? getCurrentMenstrualPhase() : null,
    label: phase === 'peak' ? '🔥 Fatigue de Peak — normal' :
           score >= 75 ? '✅ Forme optimale' :
           score >= 55 ? '🟡 Forme correcte' :
           score >= 35 ? '🟠 Fatigue modérée' : '🔴 Récupération nécessaire'
  };
}
