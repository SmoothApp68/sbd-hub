// ============================================================
// joints.js — Tendon Stress Tracker v1
// Pattern matching sur les noms d'exercices → articulations
// Calcul du stress sur 14 jours avec baseline 3 mois
// ============================================================

var JOINT_PATTERNS = [
  // ÉPAULES — développé/press
  { patterns: ['développé militaire', 'overhead press', 'ohp', 'arnold',
               'développé arnold', 'élévation frontale', 'élévation y',
               'upright row', 'rowing debout', 'épaulé'],
    joints: ['shoulder'], weight: 1.0 },

  { patterns: ['élévation latérale', 'oiseau', 'écarté', 'face pull',
               'rear delt', 'arrière épaule', 'reverse fly'],
    joints: ['shoulder_rear'], weight: 0.7 },

  { patterns: ['développé couché', 'bench press', 'chest press', 'butterfly',
               'pec deck', 'pompe', 'push up', 'dips torse', 'dips banc',
               'écarté pec', 'écartés poulie', 'pull over'],
    joints: ['shoulder', 'elbow'], weight: 0.8 },

  // COUDES
  { patterns: ['extension triceps', 'triceps', 'dips', 'skull crusher',
               'barre front', 'close grip'],
    joints: ['elbow'], weight: 1.0 },

  { patterns: ['curl', 'biceps', 'marteau', 'hammer', 'pupitre',
               'concentration', 'spider curl', 'drag curl'],
    joints: ['elbow'], weight: 0.9 },

  { patterns: ['rowing', 'tirage', 'traction', 'pull up', 'chin up',
               'lat pull', 'poulie haute', 'anneau'],
    joints: ['elbow', 'shoulder'], weight: 0.7 },

  // POIGNETS
  { patterns: ['curl poignet', 'wrist curl', 'extension poignet',
               'grip', 'farmer', 'dead hang', 'deadlift', 'soulevé de terre',
               'soulevé', 'rack pull', 'rdl', 'romanian'],
    joints: ['wrist'], weight: 0.6 },

  // GENOUX
  { patterns: ['squat', 'leg press', 'hack squat', 'goblet', 'belt squat',
               'fente', 'lunge', 'split squat', 'bulgarian', 'step up',
               'box jump', 'pistol', 'sissy squat'],
    joints: ['knee'], weight: 1.0 },

  { patterns: ['extension jambe', 'leg extension', 'quad', 'vélo',
               'cyclisme', 'spinning'],
    joints: ['knee'], weight: 0.8 },

  { patterns: ['leg curl', 'curl jambe', 'ischio', 'nordic', 'glute ham'],
    joints: ['knee'], weight: 0.6 },

  { patterns: ['mollet', 'calf', 'gastro', 'solen', 'standing calf',
               'seated calf'],
    joints: ['ankle'], weight: 0.5 },

  // LOMBAIRES
  { patterns: ['soulevé de terre', 'deadlift', 'rdl', 'romanian',
               'sumo', 'rack pull', 'good morning', 'hyperextension',
               'extension dos', 'back extension', 'jefferson'],
    joints: ['lower_back'], weight: 1.0 },

  { patterns: ['rowing barre', 'bent over row', 'barbell row',
               't-bar', 'pendlay'],
    joints: ['lower_back'], weight: 0.8 },

  { patterns: ['squat', 'leg press', 'hack squat', 'belt squat'],
    joints: ['lower_back'], weight: 0.5 },

  // HANCHES
  { patterns: ['hip thrust', 'fessier', 'glute bridge', 'abduction',
               'adduction', 'clamshell', 'fire hydrant', 'donkey kick'],
    joints: ['hip'], weight: 0.7 },

  { patterns: ['fente', 'lunge', 'split squat', 'bulgarian', 'step up',
               'hip flexor', 'psoas', 'relevé de jambe', 'mountain climber'],
    joints: ['hip'], weight: 0.6 },

  // CARDIO
  { patterns: ['course', 'running', 'tapis roulant', 'trail', 'sprint',
               'burpee', 'jumping jack', 'corde à sauter'],
    joints: ['knee', 'ankle'], weight: 0.4 },

  { patterns: ['natation', 'swimming', 'brasse', 'crawl', 'papillon'],
    joints: ['shoulder'], weight: 0.3 }
];

var JOINT_LABELS = {
  shoulder:      '💪 Épaules',
  shoulder_rear: '🔙 Épaules arrière',
  elbow:         '🦾 Coudes',
  wrist:         '🤲 Poignets',
  knee:          '🦵 Genoux',
  lower_back:    '⬇️ Lombaires',
  hip:           '🦴 Hanches',
  ankle:         '🦶 Chevilles'
};

var JOINT_RELIEF = {
  shoulder: {
    replace: { from: ['Développé Couché (Barre)', 'Développé Militaire (Barre)'],
               to:   ['Développé Couché (Haltère)', 'Développé Arnold (Haltère)'],
               reason: 'Les haltères offrent plus de liberté de rotation' },
    remove:  ['Dips Torse', 'Élévation Frontale (Barre)'],
    note:    'Les épaules récupèrent mieux avec des trajectoires libres'
  },
  elbow: {
    replace: { from: ['Extension Triceps (Barre)', 'Skull Crusher'],
               to:   ['Extension Triceps (Corde)', 'Extension Triceps (Haltère)'],
               reason: 'La corde réduit le stress en pronation sur les coudes' },
    remove:  ['Curl Pupitre (Barre)', 'Close Grip Bench'],
    note:    'Privilégier les angles neutres (prise marteau) si douleur'
  },
  knee: {
    replace: { from: ['Squat (Barre)', 'Hack Squat (Machine)'],
               to:   ['Leg Press', 'Belt Squat (Machine)'],
               reason: 'La presse réduit le cisaillement sur les genoux' },
    remove:  ['Extension Jambes', 'Jump Squat'],
    note:    'Si douleur antérieure : éviter flexion > 90° avec charge'
  },
  lower_back: {
    replace: { from: ['Soulevé de Terre (Barre)', 'Rowing Barre'],
               to:   ['Romanian Deadlift', 'Rowing Assis (Machine)'],
               reason: 'La machine réduit le moment de force lombaire' },
    remove:  ['Good Morning', 'Jefferson Curl'],
    note:    'Privilégier le gainage comme accessoire lombaire'
  },
  wrist: {
    note: 'Utiliser des sangles ou des straps pour les exercices de tirage. Réduire le volume de curl en supination.'
  },
  hip: {
    note: 'Étirements fléchisseurs de hanche recommandés (2×30s par côté avant chaque séance de jambes)'
  },
  ankle: {
    note: 'Réduire la course à impact. Privilégier vélo ou natation temporairement.'
  },
  shoulder_rear: {
    note: 'Les épaules arrière récupèrent rapidement — réduire les élévations si gêne.'
  }
};

function matchExoToJoints(exoName) {
  if (!exoName) return [];
  var name = exoName.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  var matched = {};
  JOINT_PATTERNS.forEach(function(rule) {
    var hits = rule.patterns.some(function(p) {
      return name.indexOf(p.normalize('NFD').replace(/[̀-ͯ]/g, '')) >= 0;
    });
    if (hits) {
      rule.joints.forEach(function(joint) {
        if (!matched[joint] || matched[joint] < rule.weight) {
          matched[joint] = rule.weight;
        }
      });
    }
  });

  return Object.keys(matched).map(function(joint) {
    return { joint: joint, weight: matched[joint] };
  });
}

function calcJointStressForPeriod(startTs, endTs) {
  var scores = {};
  Object.keys(JOINT_LABELS).forEach(function(j) { scores[j] = 0; });

  (db.logs || []).forEach(function(log) {
    var ts = log.timestamp || 0;
    if (ts < startTs || ts > endTs) return;

    (log.exercises || []).forEach(function(exo) {
      var jointMatches = matchExoToJoints(exo.name);
      if (!jointMatches.length) return;

      (exo.allSets || exo.series || []).forEach(function(s) {
        if (s.isWarmup) return;
        var w = parseFloat(s.weight) || 0;
        var r = parseInt(s.reps) || 0;
        var rpe = parseFloat(s.rpe) || 7;
        var rpeMultiplier = rpe >= 9.5 ? 1.5 : rpe >= 8.5 ? 1.2 : rpe < 7 ? 0.8 : 1.0;
        var tonnage = (w > 0 ? w * r : r * 10) * rpeMultiplier;

        jointMatches.forEach(function(match) {
          scores[match.joint] = (scores[match.joint] || 0) + tonnage * match.weight;
        });
      });
    });
  });

  return scores;
}

function calcCurrentJointStress() {
  var now = Date.now();
  return calcJointStressForPeriod(now - 14 * 86400000, now);
}

function calcJointBaseline() {
  var baseline = {};
  Object.keys(JOINT_LABELS).forEach(function(j) { baseline[j] = 0; });
  var windowSize = 14 * 86400000;
  var validWindows = 0;

  for (var i = 1; i <= 6; i++) {
    var windowEnd = Date.now() - i * windowSize;
    var windowStart = windowEnd - windowSize;
    var hasData = (db.logs || []).some(function(l) {
      return (l.timestamp || 0) >= windowStart && (l.timestamp || 0) <= windowEnd;
    });
    if (!hasData) continue;

    validWindows++;
    var windowScores = calcJointStressForPeriod(windowStart, windowEnd);
    Object.keys(baseline).forEach(function(j) {
      baseline[j] += windowScores[j];
    });
  }

  if (validWindows > 0) {
    Object.keys(baseline).forEach(function(j) {
      baseline[j] = baseline[j] / validWindows;
    });
  }

  return { scores: baseline, windows: validWindows };
}

function evaluateJointAlerts() {
  var current = calcCurrentJointStress();
  var baselineData = calcJointBaseline();
  var baseline = baselineData.scores;

  if (baselineData.windows < 3) return [];

  var alerts = [];
  Object.keys(JOINT_LABELS).forEach(function(joint) {
    var base = baseline[joint];
    var curr = current[joint];
    if (base < 500 || curr < 100) return;

    var ratio = curr / base;
    var severity = ratio >= 1.5 ? 'danger' : ratio >= 1.25 ? 'warning' : null;
    if (severity) {
      alerts.push({
        joint: joint,
        label: JOINT_LABELS[joint],
        severity: severity,
        ratio: Math.round(ratio * 100),
        overBy: Math.round((ratio - 1) * 100),
        relief: JOINT_RELIEF[joint] || { note: 'Réduire le volume sur cette articulation' }
      });
    }
  });

  return alerts.sort(function(a, b) {
    return (a.severity === 'danger' ? 0 : 1) - (b.severity === 'danger' ? 0 : 1);
  });
}

function renderJointAlertsHTML() {
  var alerts = evaluateJointAlerts();
  if (!alerts.length) return '';

  var html = '<div style="margin-bottom:12px;">';
  html += '<div style="font-size:11px;color:var(--sub);text-transform:uppercase;'
    + 'letter-spacing:0.8px;margin-bottom:8px;">🦴 Santé articulaire (14 derniers jours)</div>';

  alerts.forEach(function(alert) {
    var color = alert.severity === 'danger' ? 'var(--red)' : 'var(--orange)';
    html += '<div style="background:var(--surface);border-radius:12px;'
      + 'padding:12px;margin-bottom:8px;border-left:3px solid ' + color + ';">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    html += '<div style="font-size:13px;font-weight:700;">' + alert.label + '</div>';
    html += '<div style="font-size:12px;color:' + color + ';font-weight:700;">'
      + '+' + alert.overBy + '% vs habituel</div>';
    html += '</div>';
    var relief = alert.relief;
    if (relief.replace && relief.replace.to && relief.replace.to[0]) {
      html += '<div style="font-size:12px;color:var(--sub);margin-bottom:4px;">'
        + '💡 Privilégier : <strong style="color:var(--text);">' + relief.replace.to[0] + '</strong>';
      if (relief.replace.reason) html += ' — ' + relief.replace.reason;
      html += '</div>';
    }
    if (relief.note) {
      html += '<div style="font-size:11px;color:var(--sub);">📌 ' + relief.note + '</div>';
    }
    html += '</div>';
  });

  html += '</div>';
  return html;
}

function renderJointHealthSection() {
  var el = document.getElementById('jointHealthContent');
  if (!el) return;
  var alerts = evaluateJointAlerts();
  if (!alerts.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--sub);padding:8px;text-align:center;">'
      + '✅ Aucun stress articulaire anormal détecté sur les 14 derniers jours.</div>';
    return;
  }
  el.innerHTML = renderJointAlertsHTML();
}
