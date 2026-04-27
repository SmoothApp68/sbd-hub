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
  Object.keys(VOLUME_LANDMARKS_FR).forEach(function(muscle) {
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
    formHtml += '<br><span style="color:var(--orange);">⚠️ Deload recommandé — '+deloadCheck.reason+'</span>';
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

  // Progression SBD
  var pr = db.bestPR || {};
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
        var lm = VOLUME_LANDMARKS_FR[e.muscle];
        if (!lm) return;
        var fillPct = Math.min(100, Math.round((e.sets / lm.mrv) * 100));
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

  // ── 5. PROGRESSION SBD (tendance) ──
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

  return '<div class="ai-response-content">' + sections.map(function(s) { return '<div class="ai-section">'+s+'</div>'; }).join('') + '</div><div class="ai-timestamp">Coach Algo · Calcul instantané · Sans IA</div>';
}

// ── SCORE COACH SRS (Stress / Recovery / State) ──
// 60% ACWR + 20% readiness subjective + 20% tendance e1RM
function computeSRS() {
  var logs = db.logs || [];
  var phase = typeof wpDetectPhase === 'function' ? wpDetectPhase() : 'accumulation';
  var bestE1RMs = typeof getAllBestE1RMs === 'function' ? getAllBestE1RMs() : {};

  function getEffVol(days) {
    var cutoff = Date.now() - days * 86400000;
    return logs.filter(function(l) { return l.timestamp >= cutoff; })
      .reduce(function(sum, log) {
        return sum + (log.exercises || []).reduce(function(s, exo) {
          var e1rm = (bestE1RMs[exo.name] && bestE1RMs[exo.name].e1rm) || 0;
          return s + (exo.allSets || exo.series || []).reduce(function(ss, set) {
            if (set.isWarmup || set.setType === 'warmup') return ss;
            var reps = parseFloat(set.reps) || 0;
            var weight = parseFloat(set.weight) || 0;
            var rpe = parseFloat(set.rpe) || (typeof estimateRpeFromIntensity === 'function' ? estimateRpeFromIntensity(weight, e1rm) : 8);
            return ss + (reps * weight * rpe);
          }, 0);
        }, 0);
      }, 0);
  }

  // 1. ACWR — 60% (SBD + activités secondaires coefficient 0.7)
  var acuteSBD = getEffVol(7);
  var chronicSBD = getEffVol(28) / 4 || 1;

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
  var acwrScore = (acwr >= 0.8 && acwr <= 1.3)
    ? 100
    : Math.max(0, 100 - Math.abs(1.05 - acwr) * 150);

  // 2. Readiness subjective — 20%
  var recentR = (db.readiness || []).filter(function(r) {
    return (Date.now() - new Date(r.date).getTime()) < 7 * 86400000;
  });
  var subjScore = recentR.length
    ? recentR.reduce(function(s, r) { return s + r.score; }, 0) / recentR.length
    : 60;

  // 3. Tendance e1RM 14 jours — 20%
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

  var raw = (acwrScore * 0.6) + (subjScore * 0.2) + (trendScore * 0.2);

  // Peak Mode : la fatigue de peak est attendue, on relève le score
  if (phase === 'peak') raw = Math.min(100, raw * 1.2);

  var score = Math.round(Math.min(100, Math.max(0, raw)));

  return {
    score: score,
    acwr: Math.round(acwr * 100) / 100,
    acwrScore: Math.round(acwrScore),
    subjScore: Math.round(subjScore),
    trendScore: Math.round(trendScore),
    peakMode: phase === 'peak',
    label: phase === 'peak' ? '🔥 Fatigue de Peak — normal' :
           score >= 75 ? '✅ Forme optimale' :
           score >= 55 ? '🟡 Forme correcte' :
           score >= 35 ? '🟠 Fatigue modérée' : '🔴 Récupération nécessaire'
  };
}
