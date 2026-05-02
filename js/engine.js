// ============================================================
// engine.js — Pure computation, constants, exercise matching
// ============================================================

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const STORAGE_KEY='SBD_HUB_V29';
const ONBOARDING_VERSION=3;
const DAYS_FULL=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const DAYS_SHORT=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const SBD_TYPES=['bench','squat','deadlift'];
const RADAR_CONFIG=[{label:'Dos',key:'Dos',color:'#FF9F0A'},{label:'Torse',key:'Pecs',color:'#0A84FF'},{label:'Tronc',key:'Abdos',color:'#FF453A'},{label:'Jambes',key:'Jambes',color:'#32D74B'},{label:'Bras',key:'Bras',color:'#64D2FF'},{label:'Épaules',key:'Épaules',color:'#BF5AF2'}];
const VARIANT_KEYWORDS=['pause','spoto','deficit','board'];
const REPORT_TTL_MS=7*86400000;

// ── Vocabulaire adaptatif selon niveau (TÂCHE 11) ──
var VOCAB = {
  e1rm:  { 1: 'Force estimée',    2: 'Max théorique',    3: 'e1RM (Brzycki)' },
  rpe:   { 1: 'Difficulté',       2: 'Effort perçu',     3: 'RPE / RIR' },
  peak:  { 1: 'Intensité max',    2: 'Phase de force',   3: 'Peaking / Tapering' },
  apre:  { 1: 'Poids adaptatif',  2: 'Ajustement auto',  3: 'APRE Protocol' },
  srs:   { 1: 'Forme du jour',    2: 'Score de forme',   3: 'SRS / ACWR' },
  deload:{ 1: 'Semaine légère',   2: 'Semaine de récup', 3: 'Deload / Washout' },
  acwr:  { 1: 'Charge accumulée', 2: 'Ratio de charge',  3: 'ACWR' },
  mrv:   { 1: 'Volume max',       2: 'Volume maximum',   3: 'MRV (Max Recoverable Volume)' },
  mev:   { 1: 'Volume mini',      2: 'Volume minimum',   3: 'MEV (Minimum Effective Volume)' }
};

function getVocab(key) {
  var level = (typeof db !== 'undefined' && db.user && db.user.vocabLevel) || 2;
  return (VOCAB[key] && VOCAB[key][level]) || key;
}

// ── ANALYSE ATHLÈTE — Seuils scientifiques ────────────────────
// Ratios de force cibles (powerbuilder)
var STRENGTH_RATIO_TARGETS = {
  squat_bench: { ideal: [1.25, 1.35], alert: 1.20, danger: 1.10 },
  squat_dead:  { ideal: [0.85, 0.90], alert: 0.85, danger: 0.78 },
  bench_dead:  { ideal: [0.65, 0.70], alert: 0.63, danger: 0.58 },
  ohp_bench:   { ideal: [0.60, 0.65], alert: 0.58, danger: 0.50 },
  row_bench:   { ideal: [0.90, 1.00], alert: 0.85, danger: 0.78 }
};

// MRV par groupe musculaire (Dr. Mike Israetel / RP)
var MUSCLE_VOLUME_TARGETS = {
  quads:    { MEV: 8,  MAV_low: 12, MAV_high: 18, MRV: 20 },
  ischio:   { MEV: 4,  MAV_low: 6,  MAV_high: 10, MRV: 12 },
  pecs:     { MEV: 8,  MAV_low: 12, MAV_high: 20, MRV: 22 },
  dos:      { MEV: 10, MAV_low: 14, MAV_high: 22, MRV: 25 },
  epaules:  { MEV: 6,  MAV_low: 10, MAV_high: 16, MRV: 20 },
  biceps:   { MEV: 4,  MAV_low: 8,  MAV_high: 14, MRV: 18 },
  triceps:  { MEV: 4,  MAV_low: 8,  MAV_high: 14, MRV: 18 },
  fessiers: { MEV: 4,  MAV_low: 8,  MAV_high: 16, MRV: 20 }
};

// Zones ACWR
var ACWR_ZONES = {
  green_low: 0.80, green_high: 1.30,
  orange_high: 1.50
};

// Taux de progression normaux par niveau (e1RM %/mois)
var PROGRESSION_RATES = {
  debutant:      { normal: 0.05, alert: 0.01 },
  intermediaire: { normal: 0.02, alert: 0.005 },
  avance:        { normal: 0.01, alert: 0.002 }
};

// Composition corporelle
var BODY_COMP_RATES = {
  muscle_gain_monthly_max: 0.005,
  fat_loss_weekly_max: 0.01
};

// ── INJURY PROFILES ───────────────────────────────────────────
// Three levels per zone: 1=light discomfort, 2=active injury, 3=post-surgery
// level1 = swap dangerous lifts for safer variants + add rehab
// level2 = exclude dangerous lifts entirely + dedicated rehab + cardio alternatives
// level3 = same as level2 but stricter (handled in caller)
const INJURY_PROFILES = {
  genou: {
    level1: {
      replace: { 'Squat (Barre)': 'Box Squat', 'Fentes': 'Step-up contrôlé', 'Leg Extension': 'Terminal Knee Extension' },
      rehab: ['Spanish Squat', 'Terminal Knee Extension'],
      keep: ['Presse (pieds hauts)']
    },
    level2: {
      exclude: ['Squat', 'Fentes', 'Leg Extension', 'Hack Squat'],
      rehab: ['Isometric Wall Sit', 'Straight Leg Raise'],
      cardioAlt: ['Natation', 'Vélo (résistance légère)']
    }
  },
  epaule: {
    level1: {
      replace: { 'Développé Militaire': 'Landmine Press', 'Développé Couché': 'Floor Press ou Haltères' },
      rehab: ['Face Pull', 'External Rotation Cable']
    },
    level2: {
      exclude: ['Développé Militaire', 'Élévations latérales', 'Dips', 'OHP'],
      rehab: ['Face Pull', 'External Rotation', 'Y-T-W'],
      keep: ['Rowing horizontal']
    }
  },
  dos: {
    level1: {
      replace: { 'Soulevé de Terre (Barre)': 'Romanian Deadlift', 'Good Morning': 'Bird Dog' },
      rehab: ['McGill Big 3', 'Bird Dog']
    },
    level2: {
      exclude: ['Soulevé de Terre', 'Good Morning', 'Hyperextensions'],
      rehab: ['Deadbug', 'McGill Curl-up', 'Side Plank']
    }
  },
  hanche: {
    level1: {
      replace: { 'Squat (Barre)': 'Box Squat', 'Fentes': 'Reverse Lunge' },
      rehab: ['Hip Airplane', 'Clamshell']
    },
    level2: {
      exclude: ['Squat profond', 'Fentes profondes', 'Sumo Deadlift'],
      rehab: ['Glute Bridge', 'Clamshell', 'Hip Airplane']
    }
  },
  poignet: {
    level1: {
      replace: { 'Développé Couché': 'Floor Press', 'Curl Barre': 'Curl Haltère neutre' },
      rehab: ['Wrist Roller léger', 'Wrist Flexion/Extension']
    },
    level2: {
      exclude: ['Développé Couché lourd', 'Front Squat', 'Curl Barre'],
      rehab: ['Wrist Mobility', 'Forearm stretch']
    }
  },
  coude: {
    level1: {
      replace: { 'Curl Barre': 'Curl Haltère neutre', 'Tirage Barre': 'Tirage Poignée Neutre' },
      rehab: ['Reverse Curl', 'Wrist Extensor Stretch']
    },
    level2: {
      exclude: ['Curl Barre', 'Skull Crusher', 'Dips'],
      rehab: ['Eccentric Wrist Extension', 'Tyler Twist']
    }
  },
  nuque: {
    level1: {
      replace: { 'Squat (Barre)': 'Safety Bar Squat', 'Shrug': 'Shrug Haltère léger' },
      rehab: ['Chin Tuck', 'Neck Mobility']
    },
    level2: {
      exclude: ['Back Squat lourd', 'Shrug lourd', 'Front Squat'],
      rehab: ['Chin Tuck', 'Upper Trap Stretch']
    }
  }
};

// Returns true if an exercise is excluded by the user's active level-2+ injuries
function isExerciseInjured(exoName, injuries) {
  if (!Array.isArray(injuries)) return false;
  for (var i = 0; i < injuries.length; i++) {
    var inj = injuries[i];
    if (!inj.active || inj.level < 2) continue;
    var profile = INJURY_PROFILES[inj.zone];
    if (!profile) continue;
    var key = inj.level >= 2 ? 'level2' : 'level1';
    var excludeList = (profile[key] && profile[key].exclude) || [];
    for (var j = 0; j < excludeList.length; j++) {
      if (exoName.indexOf(excludeList[j]) >= 0) return true;
    }
  }
  return false;
}

// Returns the replacement exercise for level-1 injuries, or null
function getInjurySwap(exoName, injuries) {
  if (!Array.isArray(injuries)) return null;
  for (var i = 0; i < injuries.length; i++) {
    var inj = injuries[i];
    if (!inj.active || inj.level !== 1) continue;
    var profile = INJURY_PROFILES[inj.zone];
    if (!profile || !profile.level1 || !profile.level1.replace) continue;
    var swap = profile.level1.replace[exoName];
    if (swap) return swap;
  }
  return null;
}

// ── Volume Landmarks (sets/semaine par groupe musculaire) ────
const VOLUME_LANDMARKS = {
  chest:      { MEV: 8,  MAV: 14, MRV: 20 },
  back:       { MEV: 8,  MAV: 16, MRV: 23 },
  shoulders:  { MEV: 6,  MAV: 12, MRV: 18 },
  quads:      { MEV: 6,  MAV: 14, MRV: 20 },
  hamstrings: { MEV: 4,  MAV: 10, MRV: 16 },
  glutes:     { MEV: 4,  MAV: 10, MRV: 16 },
  biceps:     { MEV: 4,  MAV: 10, MRV: 18 },
  triceps:    { MEV: 4,  MAV: 10, MRV: 16 },
  calves:     { MEV: 6,  MAV: 10, MRV: 16 },
  abs:        { MEV: 0,  MAV: 10, MRV: 18 },
  traps:      { MEV: 0,  MAV: 8,  MRV: 14 },
  forearms:   { MEV: 0,  MAV: 6,  MRV: 12 },
};

// Mapping des noms de muscles FR → clé VOLUME_LANDMARKS
const MUSCLE_TO_VL_KEY = {
  'Pecs': 'chest', 'Pecs (haut)': 'chest',
  'Dos': 'back', 'Dorsaux': 'back', 'Lats': 'back',
  'Épaules': 'shoulders', 'Épaules (antérieur)': 'shoulders', 'Épaules (latéral)': 'shoulders', 'Épaules (postérieur)': 'shoulders', 'Deltoïdes': 'shoulders',
  'Quadriceps': 'quads', 'Quads': 'quads',
  'Ischio-jambiers': 'hamstrings', 'Ischio': 'hamstrings', 'Ischios': 'hamstrings',
  'Fessiers': 'glutes', 'Glutes': 'glutes',
  'Biceps': 'biceps',
  'Triceps': 'triceps',
  'Mollets': 'calves',
  'Abdos': 'abs', 'Abdos (frontal)': 'abs', 'Core': 'abs', 'Obliques': 'abs',
  'Trapèzes': 'traps', 'Traps': 'traps',
  'Avant-bras': 'forearms',
  'Jambes': 'quads', // fallback
  'Bras': 'biceps',  // fallback
};

// ── TRAINING MODES ──────────────────────────────────────────
const TRAINING_MODES = {
  bien_etre: {
    id: 'bien_etre',
    label: 'Bien-être & Santé',
    icon: '🧘',
    desc: 'Forme générale, mobilité, cardio modéré',
    features: {
      show1RM: false,
      showIPF: false,
      showSBDCards: false,
      showStrengthLevel: false,
      showPlateauDetection: false,
      showCompetition: false,
      showWeeklyPlan: false,
      showBWRatio: false,
      defaultKeyLifts: [],
      primaryMetrics: ['sessions_count', 'streak', 'calories', 'body_weight'],
      programStyle: 'full_body',
      badgeTheme: 'wellness'
    }
  },
  musculation: {
    id: 'musculation',
    label: 'Musculation',
    icon: '💪',
    desc: 'Hypertrophie, volume, esthétique — tous niveaux',
    features: {
      show1RM: true,
      showIPF: false,
      showSBDCards: false,
      showStrengthLevel: true,
      showPlateauDetection: true,
      showCompetition: false,
      showWeeklyPlan: true,
      showBWRatio: false,
      defaultKeyLifts: ['Développé Couché (Haltères)', 'Squat Barre', 'Rowing Barre', 'Développé Militaire'],
      primaryMetrics: ['volume_total', 'muscle_balance', 'body_weight', 'tonnage_week'],
      programStyle: 'musculation',
      badgeTheme: 'volume'
    }
  },
  bodybuilding: {
    id: 'bodybuilding',
    label: 'Bodybuilding',
    icon: '💪',
    desc: 'Hypertrophie, volume, esthétique',
    features: {
      show1RM: true,
      showIPF: false,
      showSBDCards: false,
      showStrengthLevel: true,
      showPlateauDetection: true,
      showCompetition: false,
      showWeeklyPlan: true,
      showBWRatio: false,
      defaultKeyLifts: ['Développé Couché (Haltères)', 'Squat Barre', 'Rowing Barre', 'Développé Militaire'],
      primaryMetrics: ['volume_total', 'muscle_balance', 'body_weight', 'tonnage_week'],
      programStyle: 'ppl',
      badgeTheme: 'volume'
    }
  },
  powerbuilding: {
    id: 'powerbuilding',
    label: 'Powerbuilding',
    icon: '⚡',
    desc: 'Force SBD + hypertrophie — le meilleur des deux mondes',
    features: {
      show1RM: true,
      showIPF: true,
      showSBDCards: true,
      showStrengthLevel: true,
      showPlateauDetection: true,
      showCompetition: false,
      showWeeklyPlan: true,
      showBWRatio: true,
      defaultKeyLifts: ['Bench Press (Barre)', 'Squat (Barre)', 'Soulevé de Terre'],
      primaryMetrics: ['total_sbd', 'volume_total', 'e1rm_progress', 'muscle_balance'],
      programStyle: 'powerbuilding',
      badgeTheme: 'strength'
    }
  },
  powerlifting: {
    id: 'powerlifting',
    label: 'Powerlifting (SBD)',
    icon: '🏋️',
    desc: 'Squat, Bench, Deadlift — force maximale',
    features: {
      show1RM: true,
      showIPF: true,
      showSBDCards: true,
      showStrengthLevel: true,
      showPlateauDetection: true,
      showCompetition: true,
      showWeeklyPlan: true,
      showBWRatio: true,
      defaultKeyLifts: ['Bench Press (Barre)', 'Squat (Barre)', 'Soulevé de Terre'],
      primaryMetrics: ['total_sbd', 'ipf_gl', 'e1rm_progress', 'bw_ratio'],
      programStyle: 'sbd',
      badgeTheme: 'strength'
    }
  },
  force_athletique: {
    id: 'force_athletique',
    label: 'Force Athlétique / Compétition',
    icon: '🏆',
    desc: 'Périodisation, peaking, catégories de poids',
    features: {
      show1RM: true,
      showIPF: true,
      showSBDCards: true,
      showStrengthLevel: true,
      showPlateauDetection: true,
      showCompetition: true,
      showWeeklyPlan: true,
      showBWRatio: true,
      defaultKeyLifts: ['Bench Press (Barre)', 'Squat (Barre)', 'Soulevé de Terre'],
      primaryMetrics: ['total_sbd', 'ipf_gl', 'wilks', 'comp_countdown'],
      programStyle: 'sbd',
      badgeTheme: 'strength'
    }
  }
};

function getMode() {
  return TRAINING_MODES[db.user.trainingMode] || TRAINING_MODES.powerlifting;
}
function modeFeature(key) {
  return getMode().features[key];
}

// ── TEMPLATES DE PROGRAMME ──────────────────────────────────
const ROUTINE_TEMPLATES = {
  sbd: {
    name: 'SBD Powerlifting',
    icon: '🏋️',
    desc: 'Squat · Bench · Dead',
    routine: {
      Lundi:    '🦵 Squat & Jambes',
      Mardi:    '💪 Bench & Push',
      Mercredi: '🏊 Récupération / Cardio',
      Jeudi:    '🔙 Deadlift & Pull',
      Vendredi: '🎯 Points Faibles',
      Samedi:   '⚡ SBD Technique',
      Dimanche: '😴 Repos Complet'
    }
  },
  ppl: {
    name: 'Push Pull Legs',
    icon: '🔁',
    desc: '6 jours / semaine',
    routine: {
      Lundi:    '💪 Push (Pecs, Épaules, Triceps)',
      Mardi:    '🔙 Pull (Dos, Biceps)',
      Mercredi: '🦵 Legs (Quadri, Ischio)',
      Jeudi:    '💪 Push (volume)',
      Vendredi: '🔙 Pull (volume)',
      Samedi:   '🦵 Legs (volume)',
      Dimanche: '😴 Repos'
    }
  },
  upper_lower: {
    name: 'Upper / Lower',
    icon: '⬆️',
    desc: '4 jours / semaine',
    routine: {
      Lundi:    '⬆️ Upper (Force)',
      Mardi:    '⬇️ Lower (Force)',
      Mercredi: '😴 Repos / Cardio',
      Jeudi:    '⬆️ Upper (Volume)',
      Vendredi: '⬇️ Lower (Volume)',
      Samedi:   '🎯 Optionnel / Cardio',
      Dimanche: '😴 Repos'
    }
  },
  full_body: {
    name: 'Full Body',
    icon: '🌀',
    desc: '3 jours / semaine',
    routine: {
      Lundi:    '🌀 Full Body A',
      Mardi:    '😴 Repos / Cardio',
      Mercredi: '🌀 Full Body B',
      Jeudi:    '😴 Repos / Cardio',
      Vendredi: '🌀 Full Body C',
      Samedi:   '🏃 Cardio léger',
      Dimanche: '😴 Repos'
    }
  },
  custom: {
    name: 'Personnalisé',
    icon: '✏️',
    desc: 'Je définis mes jours',
    routine: {
      Lundi: '', Mardi: '', Mercredi: '', Jeudi: '',
      Vendredi: '', Samedi: '', Dimanche: ''
    }
  }
};

// DEFAULT routine (fallback si pas de profil)
const DEFAULT_ROUTINE = ROUTINE_TEMPLATES.sbd.routine;

// ── SESSION NAME BLACKLIST ──────────────────────────────────
const SESSION_NAME_BLACKLIST=/^(dos$|dos\s|bonsoir|cul$|biceps$|épaules$|avant-bras$|devenue|push$|pull$|leg\s*day|jambes$|dos\s*&|dos\s*et\s|dos\s*wtf|dos\s*faa|dos\s*en\s*spe|dos\s*🔥|dos\s*avec)/i;

// ============================================================
// PERFORMANCE — MEMOIZATION CACHES
// ============================================================
const _cache = {
  exoType: new Map(),
  muscleGroup: new Map(),
  sbdType: new Map(),
  exoDay: new Map(),
  _version: 0,
  _sortedLogs: null
};
function clearCaches() {
  _cache.exoType.clear(); _cache.muscleGroup.clear();
  _cache.sbdType.clear(); _cache.exoDay.clear();
  _cache._sortedLogs = null;
  _cache._version++;
  // Mark settings accordions as dirty so they re-render on next open
  if (typeof _accDirty !== 'undefined') { _accDirty.records = true; _accDirty.keylifts = true; _accDirty.prog = true; }
}
function getSortedLogs() {
  if (!_cache._sortedLogs) _cache._sortedLogs = [...db.logs].sort((a,b) => b.timestamp - a.timestamp);
  return _cache._sortedLogs;
}

// ============================================================
// EXERCISE TYPE ENGINE
// ============================================================
function _getExoTypeRaw(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'");
  if (SESSION_NAME_BLACKLIST.test(name.toLowerCase())) return 'session_name';
  if (/tapis\s*roulant|treadmill/.test(n)) return 'cardio';
  if (/\bvelo\b|stationnaire|bike|cycling|cyclisme|ergometre\b|\berg\b/.test(n) && !/leg\s*press/.test(n)) return 'cardio';
  if (/natation|swimming|nage\s*(libre|papillon|dos|brasse)|brasse\b|crawl\b/.test(n)) return 'cardio';
  if (/\bnage\b/.test(n) && !/gainage/.test(n)) return 'cardio';
  if (/elliptique|cross.?trainer/.test(n)) return 'cardio';
  if (/rameur|rowing\s*machine|concept\s*2|erg\b/.test(n)) return 'cardio';
  if (/corde\s*(a|à)\s*sauter|jump\s*rope|sauts?\s*a\s*la\s*corde/.test(n)) return 'cardio';
  if (/sprint|course|running|jogging|marche\s*(rapide|sportive|nordique)|power\s*walk/.test(n) && !/militaire/.test(n)) return 'cardio';
  if (/randonnee|hiking|trek/.test(n)) return 'cardio';
  if (/escalier|stair|step\s*machine|stepper/.test(n)) return 'cardio_stairs';
  if (/assault\s*bike|air\s*bike|ski\s*erg|velo\s*assault/.test(n)) return 'cardio';
  if (/boxe|shadow\s*boxing|corde\s*de\s*combat|battle\s*rope/.test(n)) return 'cardio';
  if (/\bplanche\b|plank/.test(n)) return 'time';
  if (/gainage/.test(n) && !/nage/.test(n.replace('gainage',''))) return 'time';
  if (/l.sit|l\s*sit/.test(n)) return 'time';
  if (/poirier|handstand\s*hold/.test(n)) return 'time';
  if (/dead\s*hang|suspension/.test(n) && !/deadlift|souleve/.test(n)) return 'time';
  if (/chaise\s*(murale|isometrique|wall\s*sit)|wall\s*sit/.test(n)) return 'time';
  if (/isometri/.test(n)) return 'time';
  if (/bras\s*(en\s*croix|tendus?\s*face)|croix\s*tendu/.test(n)) return 'time';
  if (/pompe|push.?up/.test(n)) return 'reps';
  if (/\bdips?\b/.test(n)) return 'reps';
  if (/traction|pull.?up|chin.?up/.test(n)) return 'reps';
  if (/burpee/.test(n)) return 'reps';
  if (/mountain\s*climber|grimpeur/.test(n)) return 'reps';
  if (/jumping\s*jack|squat\s*saut|jump\s*squat/.test(n)) return 'reps';
  if (/rowing\s*inverse|inverted\s*row/.test(n)) return 'reps';
  if (/squat\s*(poids\s*du\s*corps|bodyweight|bw)/.test(n)) return 'reps';
  if (/\b(crunch|ab\s*crunch)\b/.test(n) && !/machine|poulie|cable|charge|lest/.test(n)) return 'reps';
  if (/releve\s*(de\s*)?(genoux|jambes|jambe)|hanging\s*(knee|leg)/.test(n) && !/machine/.test(n)) return 'reps';
  if (/v.?up\b|sit.?up\b/.test(n)) return 'reps';
  if (/ab\s*wheel|roue\s*(abdominale|ab)|wheel\s*rollout/.test(n)) return 'reps';
  if (/ciseaux\s*(abdos?|jambes?)|battement\s*(de\s*)?(jambes?|pieds)/.test(n)) return 'reps';
  if (/flexion\s*laterale/.test(n) && !/haltere|barre|poulie/.test(n)) return 'reps';
  if (/\bknee\s*raise\b|\bleg\s*raise\b/.test(n) && !/machine/.test(n)) return 'reps';
  if (/russian\s*twist/.test(n) && !/haltere|barre|medecine/.test(n)) return 'reps';
  return 'weight';
}
function getExoType(name) {
  let r = _cache.exoType.get(name); if (r !== undefined) return r;
  r = _getExoTypeRaw(name); _cache.exoType.set(name, r); return r;
}

// ============================================================
// MUSCLE GROUP ENGINE
// ============================================================
function _getMuscleGroupRaw(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/['']/g,"'");
  if (SESSION_NAME_BLACKLIST.test(name.toLowerCase())) return 'Autre';
  if (/natation|swimming|\bnage\b|tapis|treadmill|cardio|running|jogging|velo\b|cycling|bike|elliptique|cross.?trainer|escalier|stair|randonnee|hiking|rameur|rowing\s*machine|concept\s*2|corde\s*a\s*sauter|jump\s*rope|sprint|marche\s*(rapide|sportive|nordique)|assault\s*bike|ski\s*erg|boxe|shadow\s*box|battle\s*rope/.test(n)) return 'Cardio';
  // Épaules
  if (/developpe\s*militaire|overhead\s*press|ohp\b|press\s*militaire/.test(n)) return 'Épaules';
  if (/elevation\s*laterale|lateral\s*raise/.test(n)) return 'Épaules (latéral)';
  if (/elevation\s*frontale|front\s*raise/.test(n)) return 'Épaules (antérieur)';
  if (/elevation\s*posterieure|rear\s*(delt|felt)|oiseau\b|face\s*pull|rear\s*delt\s*fly|pull\s*(apart|through)/.test(n)) return 'Épaules (postérieur)';
  if (/tirage\s*(vers\s*(le\s*)?visage|nuque|haut\s*poulie|poulie\s*haute)/.test(n)) return 'Épaules (postérieur)';
  if (/arnold/.test(n)) return 'Épaules';
  if (/\bepaule\b|\bshoulder\b/.test(n) && !/decollement|rotatoire|coiffe/.test(n)) return 'Épaules';
  if (/upright\s*row|tirage\s*(menton|au\s*menton)/.test(n)) return 'Épaules';
  // Jambes — Quadriceps
  if (/\bsquat\b/.test(n) && !/hack|avant-bras/.test(n)) return 'Quadriceps';
  if (/hack\s*squat|leg\s*press|presse\s*(a\s*cuisses?|cuisse|jambe)/.test(n)) return 'Quadriceps';
  if (/leg\s*extension|extension\s*(des\s*)?(jambes?|quadriceps?)|quadriceps/.test(n)) return 'Quadriceps';
  if (/fente\s*(avant|laterale|bulgare|inversee|marchee)?|lunge/.test(n)) return 'Quadriceps';
  if (/step.?up\b/.test(n) && !/stepper/.test(n)) return 'Quadriceps';
  if (/sissy\s*squat|split\s*squat|goblet\s*squat|zercher\s*squat/.test(n)) return 'Quadriceps';
  // Jambes — Ischio-jambiers
  if (/deadlift|souleve\s*de\s*terre|romanian|rdl\b/.test(n)) return 'Ischio-jambiers';
  if (/leg\s*curl|curl\s*(des\s*)?jambes?|flexion\s*(des\s*)?genoux|ischio/.test(n)) return 'Ischio-jambiers';
  if (/good\s*morning/.test(n)) return 'Ischio-jambiers';
  // Jambes — Fessiers
  if (/hip\s*thrust|poussee\s*de\s*hanche|pont\s*fessier|glute\s*bridge|hip\s*extension/.test(n)) return 'Fessiers';
  if (/abduction|adduction|kickback|hip\s*abduction/.test(n)) return 'Fessiers';
  if (/fessier|glute/.test(n)) return 'Fessiers';
  // Jambes — Lombaires
  if (/hyperextension|extension\s*du\s*dos\b|extension\s*lombaire/.test(n)) return 'Lombaires';
  // Jambes — Autres
  if (/sumo/.test(n) && !/wrestl/.test(n)) return 'Ischio-jambiers';
  if (/mollet|calf|extension\s*(des\s*)?mollets?|donkey\s*calf|standing\s*calf|seated\s*calf/.test(n)) return 'Mollets';
  // Pecs — haut / bas
  if (/incline\s*(bench|press|dumbbell)|developpe\s*incline|incline/.test(n) && /bench|press|developpe|haltere|dumbbell/.test(n)) return 'Pecs (haut)';
  if (/decline\s*(bench|press)|developpe\s*decline/.test(n)) return 'Pecs (bas)';
  if (/bench\s*press|developpe\s*couche|presse\s*(de\s*)?(poitrine|pectoraux)/.test(n)) return 'Pecs';
  if (/\bpec\b|\bpecs\b|pectoral/.test(n)) return 'Pecs';
  if (/ecarte\s*(couche|halteres?|poulie|cable|bras)?|fly\b|chest\s*fly/.test(n)) return 'Pecs';
  if (/chest\s*press|machine\s*(poitrine|pectoraux)/.test(n)) return 'Pecs';
  if (/pompe|push.?up/.test(n)) return 'Pecs';
  if (/\bspoto\b/.test(n)) return 'Pecs';
  if (/cable\s*crossover|croisement\s*(de\s*)?poulie/.test(n)) return 'Pecs';
  // Dos — sous-groupes
  if (/traction|pull.?up|chin.?up|muscle.?up/.test(n)) return 'Grand dorsal';
  if (/tirage\s*vertical|lat\s*(pulldown|machine|poulie)|pull\s*down/.test(n)) return 'Grand dorsal';
  if (/t.bar\s*row|yates\s*row/.test(n)) return 'Grand dorsal';
  if (/face\s*pull/.test(n)) return 'Haut du dos';
  if (/tirage\s*horizontal/.test(n)) return 'Haut du dos';
  if (/rowing\s*invers|inverted\s*row/.test(n)) return 'Haut du dos';
  if (/rhomboid|retraction\s*scapulaire|rear\s*delt/.test(n)) return 'Haut du dos';
  if (/rowing\b(?!\s*inverse|\s*machine)/.test(n)) return 'Grand dorsal';
  if (/\brow\b/.test(n) && !/inverted|inverse/.test(n)) return 'Grand dorsal';
  if (/tirage\s*(barre|poulie|cable|pronation|supination|1\s*bras|prise\s*neutre|serre\s*poignee|poitrine|nuque)/.test(n)) return 'Grand dorsal';
  if (/shrugs?\b|hausse.?epaule|trapeze|trapezius/.test(n)) return 'Trapèzes';
  // Bras — Biceps / Triceps / Avant-bras
  if (/curl\s*(biceps?|barre|halteres?|1\s*bras|incline|concentre|cable|poulie|marteau|hammer|inversee?|preacher|scott|araignee)?/.test(n) && !/leg\s*curl|jambe/.test(n)) return 'Biceps';
  if (/marteau|hammer\s*curl/.test(n)) return 'Biceps';
  if (/flexion\s*(du\s*)?(coude|biceps|avant.bras)/.test(n)) return 'Biceps';
  if (/bicep/.test(n)) return 'Biceps';
  if (/tricep/.test(n)) return 'Triceps';
  if (/extension\s*(triceps?|des\s*bras|coude|poulie|cable|1\s*bras|2\s*bras|poignee|barre)/.test(n) && !/jambe|mollet|extension\s*(des\s*)?(jambes?|quadriceps?)/.test(n)) return 'Triceps';
  if (/skull\s*crusher|barre\s*front|jm\s*press|french\s*press/.test(n)) return 'Triceps';
  if (/kick.?back|pushdown|push\s*down/.test(n)) return 'Triceps';
  if (/close\s*grip\s*(bench|press)|prise\s*(serree|etroite)/.test(n)) return 'Triceps';
  if (/avant.bras|forearm|poignet|wrist\s*curl/.test(n)) return 'Avant-bras';
  // Abdos — frontal vs obliques
  if (/russian\s*twist/.test(n)) return 'Obliques';
  if (/oblique|rotation\s*(tronc|buste|du\s*buste)/.test(n)) return 'Obliques';
  if (/wood\s*chop|bucheron/.test(n)) return 'Obliques';
  if (/crunch\s*oblique|flexion\s*laterale/.test(n)) return 'Obliques';
  if (/ciseaux|battement/.test(n)) return 'Obliques';
  if (/crunch|ab\s*crunch|crunch\s*(cable|machine|poulie)/.test(n)) return 'Abdos (frontal)';
  if (/planche|plank|gainage/.test(n)) return 'Abdos (frontal)';
  if (/l.sit|l\s*sit/.test(n)) return 'Abdos (frontal)';
  if (/releve\s*(de\s*)?(genoux|jambes?)|hanging\s*(knee|leg)|knee\s*raise|leg\s*raise/.test(n) && !/machine/.test(n)) return 'Abdos (frontal)';
  if (/v.?up|sit.?up/.test(n)) return 'Abdos (frontal)';
  if (/ab\s*wheel/.test(n)) return 'Abdos (frontal)';
  if (/ab\b|abdo|abdominaux|core\b/.test(n)) return 'Abdos (frontal)';
  return 'Autre';
}
function getMuscleGroup(name) {
  let r = _cache.muscleGroup.get(name); if (r !== undefined) return r;
  r = _getMuscleGroupRaw(name); _cache.muscleGroup.set(name, r); return r;
}

// Regroupe les sous-groupes en catégorie principale (pour radar/graphiques qui utilisent les groupes simples)
function getMuscleGroupParent(subGroup) {
  const map = {
    'Quadriceps':'Jambes','Ischio-jambiers':'Jambes','Fessiers':'Jambes','Mollets':'Jambes',
    'Pecs':'Pecs','Pecs (haut)':'Pecs','Pecs (bas)':'Pecs',
    'Grand dorsal':'Dos','Haut du dos':'Dos','Lombaires':'Dos','Trapèzes':'Dos','Dorsaux':'Dos',
    'Épaules':'Épaules','Épaules (latéral)':'Épaules','Épaules (antérieur)':'Épaules','Épaules (postérieur)':'Épaules',
    'Biceps':'Bras','Triceps':'Bras','Avant-bras':'Bras',
    'Abdos (frontal)':'Abdos','Obliques':'Abdos','Abdos':'Abdos',
    'Cardio':'Cardio','Autre':'Autre'
  };
  return map[subGroup] || subGroup;
}

// Retourne les contributions musculaires multi-coefficients d'un exercice
function getMuscleContributions(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/['']/g,"'");
  // Squat (Barre)
  if (/\bsquat\b/.test(n) && !/hack|split|sissy|goblet|zercher/.test(n))
    return [{muscle:'Quadriceps',coeff:1},{muscle:'Fessiers',coeff:0.5},{muscle:'Lombaires',coeff:0.5},{muscle:'Abdos (frontal)',coeff:0.25}];
  // Bench Press
  if (/bench\s*press|developpe\s*couche/.test(n) && !/incline|decline|close\s*grip/.test(n))
    return [{muscle:'Pecs',coeff:1},{muscle:'Triceps',coeff:0.5},{muscle:'Épaules (antérieur)',coeff:0.5}];
  // Deadlift / Soulevé de terre (conventional)
  if ((/deadlift|souleve\s*de\s*terre/.test(n)) && !/romanian|rdl|deficit|sumo/.test(n))
    return [{muscle:'Ischio-jambiers',coeff:1},{muscle:'Lombaires',coeff:1},{muscle:'Grand dorsal',coeff:0.5},{muscle:'Trapèzes',coeff:0.5},{muscle:'Fessiers',coeff:0.5},{muscle:'Avant-bras',coeff:0.25}];
  // Romanian Deadlift / RDL
  if (/romanian|rdl\b/.test(n))
    return [{muscle:'Ischio-jambiers',coeff:1},{muscle:'Lombaires',coeff:0.5},{muscle:'Fessiers',coeff:0.5},{muscle:'Grand dorsal',coeff:0.25}];
  // Développé militaire / OHP
  if (/developpe\s*militaire|overhead\s*press|ohp\b|press\s*militaire/.test(n))
    return [{muscle:'Épaules (antérieur)',coeff:1},{muscle:'Triceps',coeff:0.5},{muscle:'Pecs (haut)',coeff:0.25},{muscle:'Abdos (frontal)',coeff:0.25}];
  // Développé incliné
  if (/incline\s*(bench|press|dumbbell)|developpe\s*incline/.test(n))
    return [{muscle:'Pecs (haut)',coeff:1},{muscle:'Triceps',coeff:0.5},{muscle:'Épaules (antérieur)',coeff:0.5}];
  // Développé couché haltères
  if (/developpe\s*couche\s*haltere|dumbbell\s*(bench|press)/.test(n))
    return [{muscle:'Pecs',coeff:1},{muscle:'Triceps',coeff:0.5},{muscle:'Épaules (antérieur)',coeff:0.25}];
  // Tractions / Pull-up
  if (/traction|pull.?up|chin.?up/.test(n))
    return [{muscle:'Grand dorsal',coeff:1},{muscle:'Biceps',coeff:0.5},{muscle:'Haut du dos',coeff:0.5},{muscle:'Avant-bras',coeff:0.25}];
  // Rowing barre
  if (/rowing\s*(barre|barbell)|barbell\s*row|bent.over\s*row|t.bar\s*row|yates\s*row/.test(n))
    return [{muscle:'Grand dorsal',coeff:1},{muscle:'Haut du dos',coeff:0.5},{muscle:'Biceps',coeff:0.5},{muscle:'Avant-bras',coeff:0.25}];
  // Rowing haltère 1 bras
  if (/rowing\s*(haltere|dumbbell|1\s*bras)|dumbbell\s*row|one.arm\s*row/.test(n))
    return [{muscle:'Grand dorsal',coeff:1},{muscle:'Haut du dos',coeff:0.5},{muscle:'Biceps',coeff:0.25}];
  // Lat Pulldown
  if (/lat\s*(pulldown|machine|poulie)|pull\s*down|tirage\s*vertical/.test(n))
    return [{muscle:'Grand dorsal',coeff:1},{muscle:'Biceps',coeff:0.5},{muscle:'Haut du dos',coeff:0.25}];
  // Hip Thrust
  if (/hip\s*thrust|poussee\s*de\s*hanche|pont\s*fessier|glute\s*bridge/.test(n))
    return [{muscle:'Fessiers',coeff:1},{muscle:'Ischio-jambiers',coeff:0.5},{muscle:'Lombaires',coeff:0.25}];
  // Dips
  if (/\bdips?\b/.test(n))
    return [{muscle:'Pecs (bas)',coeff:1},{muscle:'Triceps',coeff:0.5},{muscle:'Épaules (antérieur)',coeff:0.25}];
  // Curl biceps
  if (/curl\s*(biceps?|barre|haltere|concentre|cable|poulie|marteau|hammer|preacher|scott|araignee|incline|1\s*bras|inversee?)?/.test(n) && !/leg\s*curl|jambe|poignet|wrist/.test(n) && /curl/.test(n))
    return [{muscle:'Biceps',coeff:1},{muscle:'Avant-bras',coeff:0.25}];
  // Extension triceps / Skull crusher
  if (/extension\s*triceps|skull\s*crusher|barre\s*front|french\s*press|pushdown|push\s*down|kick.?back/.test(n))
    return [{muscle:'Triceps',coeff:1},{muscle:'Épaules (postérieur)',coeff:0.25}];
  // Élévation latérale
  if (/elevation\s*laterale|lateral\s*raise/.test(n))
    return [{muscle:'Épaules (latéral)',coeff:1}];
  // Face pull
  if (/face\s*pull/.test(n))
    return [{muscle:'Épaules (postérieur)',coeff:1},{muscle:'Haut du dos',coeff:0.5}];
  // Leg press
  if (/leg\s*press|presse\s*(a\s*cuisses?|cuisse|jambe)/.test(n))
    return [{muscle:'Quadriceps',coeff:1},{muscle:'Fessiers',coeff:0.5}];
  // Leg curl
  if (/leg\s*curl|curl\s*(des\s*)?jambes?|flexion\s*(des\s*)?genoux|ischio/.test(n))
    return [{muscle:'Ischio-jambiers',coeff:1}];
  // Leg extension
  if (/leg\s*extension|extension\s*(des\s*)?(jambes?|quadriceps?)/.test(n))
    return [{muscle:'Quadriceps',coeff:1}];
  // Écarté / Fly
  if (/ecarte|fly\b|chest\s*fly|cable\s*crossover/.test(n))
    return [{muscle:'Pecs',coeff:1}];
  // Crunch
  if (/crunch/.test(n) && !/oblique/.test(n))
    return [{muscle:'Abdos (frontal)',coeff:1}];
  // Russian twist / rotation
  if (/russian\s*twist|rotation\s*(tronc|buste)/.test(n))
    return [{muscle:'Obliques',coeff:1},{muscle:'Abdos (frontal)',coeff:0.25}];
  // Planche / Gainage
  if (/planche|plank|gainage/.test(n))
    return [{muscle:'Abdos (frontal)',coeff:1},{muscle:'Obliques',coeff:0.5},{muscle:'Lombaires',coeff:0.25}];
  // Good morning
  if (/good\s*morning/.test(n))
    return [{muscle:'Lombaires',coeff:1},{muscle:'Ischio-jambiers',coeff:0.5},{muscle:'Fessiers',coeff:0.25}];
  // Hyperextension
  if (/hyperextension|extension\s*du\s*dos|extension\s*lombaire/.test(n))
    return [{muscle:'Lombaires',coeff:1},{muscle:'Fessiers',coeff:0.5}];
  // Shrugs
  if (/shrugs?\b|hausse.?epaule/.test(n))
    return [{muscle:'Trapèzes',coeff:1},{muscle:'Haut du dos',coeff:0.25}];
  // Mollets
  if (/mollet|calf/.test(n))
    return [{muscle:'Mollets',coeff:1}];
  // Fentes / Lunges
  if (/fente|lunge/.test(n))
    return [{muscle:'Quadriceps',coeff:1},{muscle:'Fessiers',coeff:0.5},{muscle:'Ischio-jambiers',coeff:0.25}];
  // Pompes / Push-ups
  if (/pompe|push.?up/.test(n))
    return [{muscle:'Pecs',coeff:1},{muscle:'Triceps',coeff:0.5},{muscle:'Épaules (antérieur)',coeff:0.25}];
  // Sumo deadlift
  if (/sumo/.test(n))
    return [{muscle:'Ischio-jambiers',coeff:1},{muscle:'Lombaires',coeff:1},{muscle:'Grand dorsal',coeff:0.5},{muscle:'Fessiers',coeff:0.5}];
  // Fallback : muscle principal avec coeff 1
  return [{ muscle: getMuscleGroup(name), coeff: 1 }];
}

// ============================================================
// SBD DETECTION
// ============================================================
function _getSBDTypeRaw(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[()]/g,' ');
  if (VARIANT_KEYWORDS.some(kw => n.includes(kw))) return null;
  if (n.includes('bench') || (n.includes('couche') && !n.includes('incline') && !n.includes('haltere') && !n.includes('decline'))) return 'bench';
  if (n.includes('squat') && !n.includes('hack') && !n.includes('goblet') && !n.includes('sissy') && !n.includes('bulgare') && !n.includes('front') && !n.includes('zercher') && !n.includes('split')) return 'squat';
  if (n.includes('deadlift') || (n.includes('souleve') && n.includes('terre'))) return 'deadlift';
  return null;
}
function getSBDType(name) {
  if (_cache.sbdType.has(name)) return _cache.sbdType.get(name);
  const r = _getSBDTypeRaw(name); _cache.sbdType.set(name, r); return r;
}

// ============================================================
// EXERCISE DAY MAP
// ============================================================
// getExerciseDay — déduit depuis l'historique importé de l'utilisateur
// Retourne le jour où un exercice apparaît le plus souvent (source: db.logs)
function getExerciseDay(name) {
  const dayCounts = {};
  db.logs.forEach(log => {
    if (!log.day) return;
    if (log.exercises.some(e => e.name === name)) {
      dayCounts[log.day] = (dayCounts[log.day] || 0) + 1;
    }
  });
  if (!Object.keys(dayCounts).length) return null;
  return Object.entries(dayCounts).sort((a,b) => b[1]-a[1])[0][0];
}



// ============================================================
// DATE PARSING
// ============================================================
function parseHevyDate(dateStr) {
  const monthMap = {
    'janvier':0,'janv':0,'fevrier':1,'février':1,'fevr':1,'févr':1,
    'mars':2,'avril':3,'avr':3,'mai':4,'juin':5,
    'juillet':6,'juil':6,'aout':7,'août':7,
    'septembre':8,'sept':8,'octobre':9,'oct':9,
    'novembre':10,'nov':10,'decembre':11,'décembre':11,'dec':11,'déc':11
  };
  // Normaliser : minuscules, sans accents, sans points d'abréviation
  const norm = dateStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,'').trim();

  // Format 1 : "le mardi, avr 07, 2026 à 1:00pm" ou "le mardi, avr 07, 2026 a 1:00pm"
  // Format 2 : "le 7 avril 2026 a 14:50" (ancien format)
  // Format 3 : "avril 7, 2026 1:00pm"
  const allMonths = Object.keys(monthMap).sort((a,b) => b.length - a.length).join('|');
  const rxFull = new RegExp('(' + allMonths + ')\\s+(\\d{1,2}),?\\s*(\\d{4})(?:[^\\d]+(\\d{1,2}):(\\d{2})\\s*(am|pm)?)?', 'i');
  const m = norm.match(rxFull);
  if (m) {
    const mi = monthMap[m[1]];
    if (mi === undefined) return Date.now();
    let h = m[4] ? parseInt(m[4]) : 12;
    const min = m[5] ? parseInt(m[5]) : 0;
    const ampm = m[6];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return new Date(parseInt(m[3]), mi, parseInt(m[2]), h, min, 0).getTime();
  }
  // Fallback DD/MM/YYYY
  const a = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (a) return new Date(parseInt(a[3]), parseInt(a[2])-1, parseInt(a[1]), 12, 0, 0).getTime();
  return Date.now();
}


// Extraire la liste des exercices d'un jour depuis db.routineExos
function getProgExosForDay(day) {
  const saved = (db.routineExos || {})[day];
  if (!saved) return [];
  return Array.isArray(saved) ? saved.filter(Boolean) : saved.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
}

// Matcher un nom d'exercice Hevy avec un nom de programme (tolérant)
// Table de synonymes inter-langues pour les exercices clés
const EXO_SYNONYMS = [
  // Big 3
  ['deadlift', 'souleve de terre', 'soulevé de terre', 'soulevé de terre conventionnel'],
  ['squat barre', 'squat barbell', 'back squat', 'squat arriere'],
  ['bench press', 'developpe couche', 'développé couché', 'bench barre', 'developpe couche barre'],
  // Compounds
  ['overhead press', 'developpe militaire', 'développé militaire', 'ohp', 'press militaire'],
  ['pull up', 'traction', 'chin up', 'tractions pronation', 'tractions supination'],
  ['romanian deadlift', 'rdl', 'souleve roumain', 'soulevé roumain'],
  ['hip thrust', 'poussee de hanche', 'poussée de hanche', 'hip thrust barre'],
  ['shrug', 'haussement d epaules', 'haussement d\'épaules', 'haussement epaules', 'shrug barre', 'shrug halteres'],
  ['lunge', 'fente', 'fentes', 'fente avant', 'fentes avant'],
  ['leg press', 'presse a cuisses', 'presse à cuisses', 'presse cuisses', 'presse jambes'],
  ['good morning', 'bon matin'],
  // Bench variants
  ['developpe incline', 'développé incliné', 'incline bench', 'incline bench press', 'developpe incline barre', 'developpe incline halteres'],
  ['developpe decline', 'développé décliné', 'decline bench', 'decline bench press'],
  ['developpe halteres', 'développé haltères', 'dumbbell bench press', 'bench halteres'],
  // Squat variants
  ['front squat', 'squat avant', 'squat frontal'],
  ['goblet squat', 'squat goblet'],
  ['squat bulgare', 'bulgarian split squat', 'split squat bulgare'],
  ['hack squat', 'hack squat machine'],
  // Dos
  ['rowing barre', 'barbell row', 'bent over row', 'rowing penche'],
  ['rowing haltere', 'rowing haltères', 'dumbbell row', 'rowing 1 bras', 'rowing un bras'],
  ['tirage vertical', 'lat pulldown', 'tirage poulie haute', 'pulldown'],
  ['tirage horizontal', 'tirage poulie basse', 'seated cable row', 'rowing assis'],
  ['t bar row', 'tirage t barre', 't-bar row'],
  // Épaules
  ['elevation laterale', 'élévation latérale', 'lateral raise', 'elev laterale'],
  ['elevation frontale', 'élévation frontale', 'front raise'],
  ['face pull', 'tirage visage', 'tirage vers le visage'],
  ['arnold press', 'developpe arnold', 'développé arnold'],
  // Bras
  ['curl biceps', 'curl barre', 'barbell curl', 'curl biceps barre'],
  ['curl halteres', 'curl haltères', 'dumbbell curl', 'curl biceps halteres'],
  ['curl marteau', 'hammer curl', 'curl marteau halteres'],
  ['extension triceps', 'triceps extension', 'extension poulie', 'pushdown triceps'],
  ['skull crusher', 'barre front', 'barre au front', 'lying triceps extension'],
  ['dips', 'dip', 'dips poids de corps'],
  // Jambes
  ['leg curl', 'curl jambes', 'leg curl couche', 'leg curl assis'],
  ['leg extension', 'extension jambes', 'extension quadriceps'],
  ['mollet debout', 'standing calf raise', 'extension mollets debout', 'mollets machine'],
  ['mollet assis', 'seated calf raise', 'mollets assis'],
  // Pecs
  ['ecarte couche', 'écarté couché', 'dumbbell fly', 'chest fly', 'ecarte halteres'],
  ['cable crossover', 'croisement poulie', 'vis a vis poulie'],
  ['pompes', 'push up', 'push-up', 'pushup'],
  // Abdos
  ['crunch', 'crunch abdo', 'crunch cable', 'crunch poulie'],
  ['gainage', 'planche', 'plank'],
  // Cardio
  ['tapis course', 'treadmill', 'tapis de course', 'course tapis'],
  ['velo elliptique', 'elliptique', 'elliptical'],
  ['rameur', 'rowing machine', 'concept 2', 'concept2'],
];

// ── Equipment detection (barbell vs dumbbell) ────────────────
// Retourne 'barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', ou null
function getEquipmentType(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  // Explicit markers
  if (/\bbarre\b|barbell|barre\s*(ez|olympique|droite)/.test(n)) return 'barbell';
  if (/haltere|dumbbell|haltères/.test(n)) return 'dumbbell';
  if (/cable|poulie|vis\s*a\s*vis/.test(n)) return 'cable';
  if (/machine|smith|presse|press\s*machine|guided/.test(n)) return 'machine';
  if (/poids\s*de\s*corps|bodyweight|body\s*weight|\bpdec?\b/.test(n)) return 'bodyweight';
  // Implicit from exercise name
  if (/bench\s*press$|developpe\s*couche$|squat$|back\s*squat|deadlift$|souleve\s*de\s*terre$|overhead\s*press$|developpe\s*militaire$|rowing\s*barre|barbell\s*row|t.bar/.test(n)) return 'barbell';
  if (/curl\s*marteau|hammer|goblet|lateral\s*raise|elevation\s*laterale|ecarte/.test(n)) return 'dumbbell';
  if (/lat\s*pulldown|tirage\s*(vertical|horizontal|poulie)|pulldown|push\s*down|face\s*pull|cable\s*crossover/.test(n)) return 'cable';
  if (/hack\s*squat|leg\s*press|presse|leg\s*curl|leg\s*extension|smith/.test(n)) return 'machine';
  if (/traction|pull.?up|chin.?up|pompe|push.?up|dips?|gainage|planche|plank/.test(n)) return 'bodyweight';
  return null;
}

// Factor to convert barbell-equivalent weight for dumbbell exercises
// (e.g., 120kg barbell bench ≠ 120kg dumbbell press)
const DUMBBELL_TO_BARBELL_FACTOR = 0.57;

var _matchCache = {};
var _matchCacheSize = 0;
var _MATCH_CACHE_MAX = 2000;

function _matchCacheInvalidate() {
  _matchCache = {};
  _matchCacheSize = 0;
}

function _matchCacheStore(key, result, reverseKey) {
  if (_matchCacheSize >= _MATCH_CACHE_MAX) {
    _matchCache = {};
    _matchCacheSize = 0;
  }
  _matchCache[key] = result;
  _matchCacheSize++;
  if (reverseKey && !(reverseKey in _matchCache)) {
    _matchCache[reverseKey] = result;
    _matchCacheSize++;
  }
}

function matchExoName(hevyName, progName) {
  if (!hevyName || !progName) return false;

  var cacheKey = hevyName + '|||' + progName;
  if (cacheKey in _matchCache) return _matchCache[cacheKey];

  const norm = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const h = norm(hevyName);
  const p = norm(progName);

  var reverseKey = progName + '|||' + hevyName;
  var result = _matchExoNameCore(h, p, norm);
  _matchCacheStore(cacheKey, result, reverseKey);
  return result;
}

function _matchExoNameCore(h, p, norm) {
  if (h === p) return true;

  // Mots significatifs (>=3 lettres)
  const sig = w => w.length >= 3;

  // Mots qui distinguent formellement une variante d'exercice
  // Includes NFD-normalized French forms (incliné→incline, décliné→decline, etc.)
  const _DIFF_ROOTS = [
    'incline','inclinee','decline','declinee','sumo',
    'bulgare','bulgarian','inverse','inversee',
    'nuque','pause','spoto','deficit','board',
    'hack','goblet','sissy','front','zercher','split',
    'roumain','romanian',
    'lateral','laterale','frontal','frontale',
    'elastique','band','banded','assisted','assiste',
    'leste','weighted',
    'negatif','negative',
    'explosif','explosive','clap','claquee',
    'archer',
    'une','one','single',
    'anneaux','rings','ring',
    'pike',
    'hindu',
    'pseudo',
    'typewriter',
    'commando',
    'diamond','diamant',
    'sureleve','elevated'
  ];
  // Build DIFF set with plural/feminine forms (±1 char) auto-included
  const DIFF = new Set(_DIFF_ROOTS);
  const isDiff = w => { if (DIFF.has(w)) return true; for (let i = 0; i < _DIFF_ROOTS.length; i++) { const r = _DIFF_ROOTS[i]; if (Math.abs(w.length - r.length) <= 2 && (w.startsWith(r) || r.startsWith(w))) return true; } return false; };

  // Word-level matching: check that all words of ref appear as whole words in name
  const wordsOf = s => s.split(' ').filter(sig);
  // Prefix match only for small length differences (plurals: shrug/shrugs, curl/curls)
  const wMatch = (a, b) => {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    return a.startsWith(b) || b.startsWith(a);
  };

  const softWordMatch = (name, ref) => {
    if (name === ref) return true;
    const nameWords = wordsOf(name);
    const refWords = wordsOf(ref);
    if (!refWords.length) return false;
    const refInName = refWords.every(rw => nameWords.some(nw => wMatch(nw, rw)));
    if (!refInName) return false;
    const extra = nameWords.filter(nw => !refWords.some(rw => wMatch(nw, rw)));
    return extra.every(w => !isDiff(w));
  };

  // Vérifier les synonymes — si h et p appartiennent au même groupe → match
  for (const group of EXO_SYNONYMS) {
    const normGroup = group.map(norm);
    const hInGroup = normGroup.some(s => softWordMatch(h, s));
    const pInGroup = normGroup.some(s => softWordMatch(p, s));
    if (hInGroup && pInGroup) return true;
  }

  const hWords = wordsOf(h);
  const pWords = wordsOf(p);
  if (!hWords.length || !pWords.length) return false;

  const pInH = pWords.every(w => hWords.some(hw => wMatch(w, hw)));
  const hInP = hWords.every(w => pWords.some(pw => wMatch(w, pw)));

  // Correspondance bidirectionnelle complète
  if (pInH && hInP) return true;

  // Unidirectionnelle tolérée seulement si les mots "extra" ne sont pas des différenciateurs
  if (pInH && !hInP) {
    const extraH = hWords.filter(w => !pWords.some(pw => wMatch(w, pw)));
    if (extraH.length > 0 && extraH.every(w => !isDiff(w))) return true;
  }
  if (hInP && !pInH) {
    const extraP = pWords.filter(w => !hWords.some(hw => wMatch(w, hw)));
    if (extraP.length > 0 && extraP.every(w => !isDiff(w))) return true;
  }

  // Exercice à 1 mot significatif : tolérer les variations pluriel/singulier
  const shorter = pWords.length <= hWords.length ? pWords : hWords;
  if (shorter.length === 1) {
    const w = shorter[0];
    const other = shorter === pWords ? hWords : pWords;
    if (!other.some(hw => wMatch(w, hw))) return false;
    const extra = other.filter(hw => !wMatch(w, hw));
    return extra.every(ew => !isDiff(ew));
  }

  return false;
}

function calcIPFGLTotal(bench, squat, deadlift, bw) {
  if (!bw || bw <= 0) return 0;
  const total = (bench||0) + (squat||0) + (deadlift||0);
  if (total <= 0) return 0;
  return calcIPFGL(total, bw);
}
// ── Katch-McArdle (plus précis pour athlètes musclés avec % gras connu) ─────
function calcTDEEKatchMcArdle(bw, fatPct, activityFactor, weeklySecondaryTRIMP) {
  var lbm = bw * (1 - (fatPct || 15) / 100);
  var bmr = 370 + (21.6 * lbm);
  var cardioKcal = (weeklySecondaryTRIMP || 0) * 0.5;
  return Math.round(bmr * (activityFactor || 1.6) + cardioKcal);
}

function calcTDEE(bw, tonnage7d) {
  if (!bw || bw <= 0) return 2300;

  // Facteur d'activité basé sur la fréquence réelle des 7 derniers jours
  var sessions7 = typeof getLogsInRange === 'function'
    ? getLogsInRange(7).length
    : Math.round((tonnage7d || 0) / 10000); // fallback estimation
  var activityFactor = sessions7 >= 6 ? 1.85 : sessions7 >= 5 ? 1.7 : sessions7 >= 3 ? 1.55 : 1.3;

  var baseTDEE;
  var height = db.user && db.user.height;
  var age = db.user && db.user.age;
  var gender = db.user && db.user.gender;
  var fatPct = db.user && db.user.fatPct;

  // Katch-McArdle si % gras connu (plus précis pour les athlètes)
  if (fatPct && fatPct > 0 && fatPct < 50) {
    var weeklyActivities = db.user && db.user.secondaryActivities;
    var weeklyTRIMP = 0;
    if (weeklyActivities && typeof calcActivityTRIMP === 'function') {
      weeklyActivities.forEach(function(a) { weeklyTRIMP += calcActivityTRIMP(a); });
    }
    baseTDEE = calcTDEEKatchMcArdle(bw, fatPct, activityFactor, weeklyTRIMP);
  } else if (height && age) {
    // Mifflin-St Jeor si taille et âge disponibles
    var bmr = 10 * bw + 6.25 * height - 5 * age + (gender === 'female' ? -161 : 5);
    baseTDEE = Math.round(bmr * activityFactor);
  } else {
    // Fallback simplifié
    baseTDEE = Math.round(bw * 33 * activityFactor);
  }

  // Ajustement selon la phase courante
  var phase = typeof wpDetectPhase === 'function' ? wpDetectPhase() : 'accumulation';
  var PHASE_KCAL = {
    hypertrophie: +300, accumulation: +200, intro: +100,
    force: 0, intensification: 0, maintien: 0,
    peak: +100, fondation: 0,
    deload: -200, recuperation: -200
  };
  var adjust = PHASE_KCAL[phase] || 0;

  // Calibration ajustement (apprentissage automatique via calibrateTDEE)
  var userAdjust = (db.user && db.user.tdeeAdjustment) || 0;

  return baseTDEE + adjust + userAdjust;
}

// ── TDEE Cycling pour la recompo ──────────────────────────────
// +5% jour entraînement, -10% jour repos pour les utilisateurs en recompo
function getTDEEForDay(baseTDEE, isTrainingDay, goal) {
  if (!baseTDEE) return 0;
  if (goal !== 'recompo') return baseTDEE;
  return isTrainingDay ? Math.round(baseTDEE * 1.05) : Math.round(baseTDEE * 0.90);
}

// ── Calibration TDEE silencieuse ──────────────────────────────
// Si poids stable malgré déficit théorique sur 14j → TDEE sous-estimé
function calibrateTDEE() {
  var entries = (db.body || []).filter(function(e) {
    return e && e.ts && (Date.now() - e.ts < 14 * 86400000);
  });
  if (entries.length < 5) return; // pas assez de données
  entries.sort(function(a, b) { return a.ts - b.ts; });
  var weightChange = entries[entries.length - 1].weight - entries[0].weight;
  var kgPerWeek = (weightChange / 14) * 7;

  var goal = db.user && db.user.goal;
  // Stable malgré déficit déclaré → TDEE sous-estimé, on baisse l'objectif kcal
  if (Math.abs(kgPerWeek) < 0.1 && goal === 'seche') {
    db.user.tdeeAdjustment = (db.user.tdeeAdjustment || 0) - 100;
  }
  // Stable malgré surplus déclaré → TDEE surestimé, on monte l'objectif kcal
  if (Math.abs(kgPerWeek) < 0.1 && goal === 'masse') {
    db.user.tdeeAdjustment = (db.user.tdeeAdjustment || 0) + 100;
  }
}

// ── Cycle menstruel (optionnel, non invasif) ──────────────────
function getCyclePhase() {
  if (!db.user || !db.user.cycleTracking || !db.user.cycleTracking.enabled) return null;
  var last = db.user.cycleTracking.lastPeriodDate;
  if (!last) return null;
  var lastTs = typeof last === 'string' ? new Date(last).getTime() : last;
  if (!lastTs || isNaN(lastTs)) return null;
  var len = db.user.cycleTracking.cycleLength || 28;
  var daysSince = Math.floor((Date.now() - lastTs) / 86400000);
  var day = ((daysSince % len) + len) % len;
  return day <= 14 ? 'folliculaire' : 'luteale';
}

// ── MRV ajusté par genre (+15% femmes) ────────────────────────
function getMRV(muscle, gender) {
  var key = MUSCLE_TO_VL_KEY[muscle] || muscle;
  var base = (VOLUME_LANDMARKS[key] || {}).MRV || 15;
  var isFemale = gender === 'F' || gender === 'female' || gender === 'femme';
  return isFemale ? Math.round(base * 1.15) : base;
}

function getMEV(muscle, gender) {
  var key = MUSCLE_TO_VL_KEY[muscle] || muscle;
  var base = (VOLUME_LANDMARKS[key] || {}).MEV || 6;
  var isFemale = gender === 'F' || gender === 'female' || gender === 'femme';
  return isFemale ? Math.round(base * 1.1) : base;
}

// ── Validation silencieuse du niveau utilisateur ──────────────
// Compare niveau déclaré vs DOTS réel ; corrige _realLevel si surestimé
function validateUserLevel() {
  if (!db.user || !db.bestPR) return;
  var bw = db.user.bw;
  if (!bw || bw <= 0) return;
  var gender = db.user.gender === 'female' ? 'F' : 'M';
  var total = (db.bestPR.squat || 0) + (db.bestPR.bench || 0) + (db.bestPR.deadlift || 0);
  if (total === 0) return;

  var dots = computeDOTS(total, bw, gender);
  var declared = db.user.level;
  var real = dots < 200 ? 'debutant'
           : dots < 300 ? 'intermediaire'
           : dots < 450 ? 'avance'
           : 'competiteur';

  // Correction silencieuse uniquement si surestimation
  var rank = { debutant: 0, intermediaire: 1, avance: 2, competiteur: 3 };
  if (rank[declared] > rank[real]) {
    db.user._realLevel = real;
  } else {
    db.user._realLevel = null; // niveau déclaré OK
  }
}

// ── Recompo progress tracker ──────────────────────────────────
// Croise tendance poids (db.body) et e1RM SBD pour détecter succès/échec
function checkRecompoProgress() {
  var entries = (db.body || []).slice(-14).filter(function(e) { return e && e.weight; });
  if (entries.length < 4) return { neutral: true, msg: 'Pas assez de données — log ton poids 4×/semaine min.' };

  entries.sort(function(a, b) { return (a.ts || 0) - (b.ts || 0); });
  var first = entries[0].weight;
  var last = entries[entries.length - 1].weight;
  var spanDays = Math.max(1, ((entries[entries.length - 1].ts || 0) - (entries[0].ts || 0)) / 86400000);
  var weightTrend = ((last - first) / spanDays) * 7; // kg/semaine

  // Tendance e1RM SBD (moyenne des 3 lifts sur 14j)
  var e1rmTrend = 0;
  if (typeof computeE1RMTrend === 'function') {
    e1rmTrend = computeE1RMTrend();
  } else if (db.exercises) {
    // fallback simple : delta moyen entre PR récent et il y a 14j
    var lifts = ['Squat', 'Bench Press', 'Deadlift'];
    var sum = 0, n = 0;
    lifts.forEach(function(name) {
      var ex = db.exercises[name];
      if (!ex || !ex.history || ex.history.length < 2) return;
      var hist = ex.history.slice(-14);
      var d = hist[hist.length - 1].e1rm - hist[0].e1rm;
      sum += d; n++;
    });
    e1rmTrend = n > 0 ? sum / n : 0;
  }

  var bw = db.user && db.user.bw || 0;
  var pctPerWeek = bw > 0 ? Math.abs(weightTrend) / bw * 100 : 0;

  // Alerte perte trop rapide (>0.7%/sem) + force baisse
  if (weightTrend < -0.5 && e1rmTrend < 0) {
    return { alert: true, msg: 'Perte trop rapide + force en baisse. Augmente les calories des jours de repos.' };
  }
  if (pctPerWeek > 0.7 && weightTrend < 0) {
    return { alert: true, msg: 'Perte trop rapide (' + pctPerWeek.toFixed(1) + '%/sem). Ton e1RM risque de chuter. On ralentit ?' };
  }
  if (weightTrend <= 0.2 && weightTrend >= -0.2 && e1rmTrend >= 0) {
    return { success: true, msg: 'Recompo en cours — poids stable, force maintenue.' };
  }
  return { neutral: true, msg: 'Tendance : ' + weightTrend.toFixed(2) + ' kg/sem, e1RM ' + (e1rmTrend >= 0 ? '+' : '') + e1rmTrend.toFixed(1) + ' kg/sem.' };
}

// ── Micro-loading (incrément de charge) ───────────────────────
// Femmes haut du corps : 0.5kg, bas : 1.25kg vs hommes 1.25/2.5
function getLoadIncrement(exoName, gender) {
  var lower = (exoName || '').toLowerCase();
  var isUpperBody = /bench|développé|press|curl|tirage|row|épaule|shoulder|tricep|bicep|chest/.test(lower);
  if (gender === 'female') return isUpperBody ? 0.5 : 1.25;
  return isUpperBody ? 1.25 : 2.5;
}
function estimateRpeFromIntensity(weight, e1rm) {
  if (!e1rm || !weight || e1rm <= 0) return 8;
  var pct = weight / e1rm;
  if (pct > 0.90) return 9.5;
  if (pct > 0.80) return 8.5;
  if (pct > 0.70) return 7.5;
  return 7.0;
}

function calcCalorieCible(bw) {
  const kcalBase = db.user.kcalBase || 2300;
  const bwBase   = db.user.bwBase   || 98;
  if (!bw || bw <= 0) return kcalBase;
  return Math.round(kcalBase * (bw / bwBase));
}
function calcMacrosCibles(kcalCible, bw) {
  var goal = (db.user && db.user.goal) || '';
  var gender = db.user && db.user.gender;
  var mode = (db.user && db.user.trainingMode) || '';

  // Bien-être : maintenance stricte, protéines modérées
  if (mode === 'bien_etre') {
    return {
      prot: Math.round(bw * 1.6),
      carb: Math.round((kcalCible * 0.50) / 4),
      fat:  Math.round((kcalCible * 0.30) / 9),
      kcal: kcalCible
    };
  }

  // Protéines : 2.4g/kg en recompo (2.3-2.5), 1.95g/kg sinon
  var protPerKg = goal === 'recompo' ? 2.4 : 1.95;
  var prot = Math.round(bw * protPerKg);
  // Lipides : 1g/kg min pour femmes (santé hormonale), 0.73g/kg sinon
  var fatPerKg = gender === 'female' ? Math.max(1.0, 0.73) : 0.73;
  var fat = Math.round(bw * fatPerKg);
  var carb = Math.max(0, Math.round((kcalCible - prot * 4 - fat * 9) / 4));
  return { prot: prot, carb: carb, fat: fat, kcal: kcalCible };
}
function detectPlateau(type, n=3) {
  const history = [];
  for (const log of db.logs) {
    for (const exo of log.exercises) {
      if (getSBDType(exo.name)===type && exo.maxRM>0) { history.push({rm:exo.maxRM,ts:log.timestamp}); break; }
    }
    if (history.length >= n+2) break;
  }
  if (history.length < n) return null;
  const recent = history.slice(0, n);
  const daysDiff = (recent[0].ts - recent[n-1].ts) / 86400000;
  if (daysDiff < n*5) return null;
  if (recent[0].rm <= recent[n-1].rm) return { type, sessions: n, delta: recent[0].rm - recent[n-1].rm };
  return null;
}
function calcMomentum(type) {
  const pts=[];
  for (const log of db.logs.slice(0,10)) {
    for (const exo of log.exercises) {
      if (getSBDType(exo.name)===type && exo.maxRM>0) { pts.push({x:log.timestamp/86400000,y:exo.maxRM}); break; }
    }
  }
  if (pts.length<3) return null;
  const n=pts.length,sumX=pts.reduce((s,p)=>s+p.x,0),sumY=pts.reduce((s,p)=>s+p.y,0),sumXY=pts.reduce((s,p)=>s+p.x*p.y,0),sumX2=pts.reduce((s,p)=>s+p.x*p.x,0);
  const slope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX);
  return Math.round(slope*7*10)/10;
}

function analyzePlateauCauses(exoName) {
  // 1. Check if exercise is in plateau (e1RM stable/declining over last 3-4 sessions)
  const history = [];
  for (const log of db.logs) {
    for (const exo of log.exercises) {
      if (matchExoName(exo.name, exoName) && exo.maxRM > 0) {
        history.push({ rm: exo.maxRM, ts: log.timestamp, exo });
        break;
      }
    }
    if (history.length >= 6) break;
  }
  if (history.length < 3) return null;
  const recent = history.slice(0, 4);
  if (recent.length >= 3 && recent[0].rm > recent[recent.length - 1].rm) return null; // progressing

  const causes = [];
  const suggestions = [];
  const bw = db.user.bw || 80;
  const logs4w = getLogsInRange(28);

  // 2. Analyze secondary muscles via getMuscleContributions
  const contribs = getMuscleContributions(exoName);
  const weeklyMuscleSets = {};
  logs4w.forEach(log => {
    log.exercises.forEach(e => {
      const c = getMuscleContributions(e.name);
      c.forEach(({ muscle, coeff }) => {
        weeklyMuscleSets[muscle] = (weeklyMuscleSets[muscle] || 0) + (e.sets || 0) * coeff;
      });
    });
  });
  const weeks = Math.max(1, logs4w.length > 0 ? (Date.now() - logs4w[logs4w.length - 1].timestamp) / (7 * 86400000) : 4);

  const _muscleExoSuggestions = {
    'Triceps':               'Extension triceps câble, Skull crusher',
    'Lombaires':             'Good morning, Hyperextension',
    'Fessiers':              'Hip Thrust, Pont fessier',
    'Avant-bras':            'Curl poignets, Farmer walk',
    'Biceps':                'Curl biceps, Curl marteau',
    'Grand dorsal':          'Tractions, Lat pulldown',
    'Haut du dos':           'Face pull, Rowing inversé',
    'Trapèzes':              'Shrugs, Face pull',
    'Épaules (antérieur)':   'Développé militaire, Élévation frontale',
    'Épaules (postérieur)':  'Face pull, Oiseau',
    'Épaules (latéral)':     'Élévation latérale',
    'Ischio-jambiers':       'Leg curl, Romanian deadlift',
    'Quadriceps':            'Leg extension, Squat bulgare',
    'Abdos (frontal)':       'Crunch câble, Ab wheel',
    'Obliques':              'Russian twist, Wood chop',
    'Pecs':                  'Développé couché haltères, Écarté poulie',
    'Pecs (haut)':           'Développé incliné, Écarté incliné',
  };

  contribs.forEach(({ muscle, coeff }) => {
    if (coeff >= 1) return; // primary muscle, skip
    const weekSets = (weeklyMuscleSets[muscle] || 0) / weeks;
    const minSets = coeff >= 0.5 ? 6 : 3;
    if (weekSets < minSets) {
      causes.push(`${muscle} sous-entraîné (${Math.round(weekSets)}s/sem, minimum ${minSets})`);
      if (_muscleExoSuggestions[muscle]) suggestions.push(_muscleExoSuggestions[muscle]);
    }
  });

  // 3. Check frequency
  const exoCountPerWeek = logs4w.filter(l => l.exercises.some(e => matchExoName(e.name, exoName))).length / weeks;
  const otherSBD = ['bench', 'squat', 'deadlift'];
  let maxOtherFreq = 0;
  otherSBD.forEach(t => {
    const cnt = logs4w.filter(l => l.exercises.some(e => getSBDType(e.name) === t)).length / weeks;
    if (cnt > maxOtherFreq) maxOtherFreq = cnt;
  });
  if (exoCountPerWeek <= 1.2 && maxOtherFreq >= 1.8) {
    causes.push(`Fréquence insuffisante (${Math.round(exoCountPerWeek * 10) / 10}×/sem vs ${Math.round(maxOtherFreq * 10) / 10}×/sem pour d'autres lifts)`);
  }

  // 4. Check intensity distribution from allSets or repRecords
  const allReps = [];
  history.slice(0, 4).forEach(h => {
    const exo = h.exo;
    if (exo.allSets && exo.allSets.length > 0) {
      exo.allSets.forEach(s => { if (s.reps > 0 && s.setType === 'normal') allReps.push(s.reps); });
    } else if (exo.repRecords) {
      Object.keys(exo.repRecords).forEach(k => allReps.push(parseInt(k)));
    }
  });
  if (allReps.length >= 4) {
    const heavy = allReps.filter(r => r >= 3 && r <= 5).length;
    const medium = allReps.filter(r => r >= 8 && r <= 12).length;
    if (heavy === 0 && allReps.every(r => r > 5)) causes.push('Pas assez de travail lourd (3-5 reps)');
    if (medium === 0 && allReps.every(r => r < 6)) causes.push('Pas assez de volume (8-12 reps)');
  }

  // 5. Check agonist/antagonist imbalance
  const _agonistPairs = { 'Pecs': 'Dos', 'Dos': 'Pecs', 'Quadriceps': 'Ischio-jambiers', 'Ischio-jambiers': 'Quadriceps' };
  const primaryMuscle = contribs[0]?.muscle;
  const primaryParent = primaryMuscle ? getMuscleGroupParent(primaryMuscle) : null;
  if (primaryParent && _agonistPairs[primaryParent]) {
    const antagonist = _agonistPairs[primaryParent];
    let agonistSets = 0, antagonistSets = 0;
    logs4w.forEach(log => {
      log.exercises.forEach(e => {
        const p = getMuscleGroupParent(getMuscleGroup(e.name));
        if (p === primaryParent) agonistSets += (e.sets || 0);
        if (p === antagonist) antagonistSets += (e.sets || 0);
      });
    });
    if (antagonistSets > 0 && agonistSets / antagonistSets > 2) {
      causes.push(`Déséquilibre ${primaryParent}/${antagonist} (ratio ${Math.round(agonistSets / antagonistSets * 10) / 10}:1)`);
    }
  }

  // 6. Cross with strength standards
  const latestRM = history[0]?.rm || 0;
  const mainSL = getStrengthLevel(exoName, latestRM, bw);
  if (mainSL) {
    contribs.forEach(({ muscle, coeff }) => {
      if (coeff >= 1) return;
      // Find best exercise for this secondary muscle
      let secRM = 0, secName = '';
      db.logs.slice(0, 20).forEach(l => {
        l.exercises.forEach(e => {
          const mg = getMuscleGroup(e.name);
          if (mg === muscle && (e.maxRM || 0) > secRM) { secRM = e.maxRM; secName = e.name; }
        });
      });
      if (secRM > 0 && secName) {
        const secSL = getStrengthLevel(secName, secRM, bw);
        if (secSL && mainSL.levelIdx >= 2 && secSL.levelIdx <= 0) {
          causes.push(`${muscle} niveau ${secSL.label} (vs ${mainSL.label} sur ${exoName})`);
        }
      }
    });
  }

  // 7. Check fatigue (ATL/CTL ratio)
  const logs7 = getLogsInRange(7), logs28 = getLogsInRange(28);
  const atl = logs7.reduce((s, l) => s + l.volume, 0) / 7;
  const ctl = logs28.reduce((s, l) => s + l.volume, 0) / 28;
  if (ctl > 0 && atl / ctl > 1.4) {
    causes.push('Fatigue accumulée, besoin de deload');
    suggestions.push('Semaine légère à 50-60% des charges');
  }

  if (causes.length === 0) return null;
  return { causes, suggestions };
}

// Standards de force (ratios e1RM / poids de corps) calibrés sur Gemini.
// Ordre important : frontsquat/bulgarian AVANT squat, hammercurl AVANT curl,
// rdl protégé via negative lookahead dans deadlift. Les exos non-matchés ne
// sont pas affichés dans la section "Niveaux de force" (filtré côté render).
const STRENGTH_STANDARDS = {
  bench:        { patterns: [/bench\s*press|developpe\s*couche|\bdc\b/i],                                         ratios: [0.50, 0.75, 1.00, 1.50, 1.85] },
  incline:      { patterns: [/incline|developpe\s*incline|incline\s*bench|\bdci\b/i],                             ratios: [0.40, 0.65, 0.85, 1.25, 1.70] },
  frontsquat:   { patterns: [/front\s*squat|squat\s*avant|squat\s*clavicule/i],                                   ratios: [0.60, 0.85, 1.05, 1.40, 1.90] },
  bulgarian:    { patterns: [/split\s*squat|bulgare|fente\s*bulgare|bulgarian/i],                                 ratios: [0.40, 0.60, 0.80, 1.10, 1.50] },
  squat:        { patterns: [/\bsquat\s*barre|back\s*squat|squat\s*arriere|(?<!hack\s)\bsquat\b/i],               ratios: [0.75, 1.00, 1.50, 2.00, 2.30] },
  deadlift:     { patterns: [/(?<!romanian\s)deadlift(?!\s*jambes)|souleve\s*de\s*terre(?!\s*roumain)|\bsdt\b(?!\s*roumain)/i], ratios: [1.00, 1.25, 1.75, 2.25, 3.00] },
  ohp:          { patterns: [/overhead|militaire|ohp\b|developpe\s*militaire|shoulder\s*press|presse\s*epaules/i],ratios: [0.35, 0.50, 0.75, 1.00, 1.15] },
  row:          { patterns: [/rowing|row\b|tirage\s*horizontal|bent\s*over\s*row/i],                              ratios: [0.50, 0.70, 1.00, 1.30, 1.60] },
  legpress:     { patterns: [/leg\s*press|presse\s*a?\s*cuisses?|presse\s*jambes|hack\s*squat|presse/i],          ratios: [1.50, 2.00, 3.00, 4.00, 5.50] },
  latpull:      { patterns: [/lat\s*pull|lat\s*pulldown|tirage\s*(poulie\s*)?haut|tirage\s*poitrine|tirage\s*vertical|tirage\s*machine|tirage\s*poulie/i], ratios: [0.50, 0.70, 0.90, 1.10, 1.30] },
  pullup:       { patterns: [/traction|pull.?up|chin.?up|tirage\s*fixe/i],                                        ratios: [1.00, 1.20, 1.35, 1.55, 1.80] },
  hammercurl:   { patterns: [/curl\s*marteau|hammer\s*curl|curl\s*prise\s*neutre/i],                              ratios: [0.20, 0.30, 0.45, 0.65, 0.85] },
  curl:         { patterns: [/curl|flexion\s*bras/i],                                                             ratios: [0.15, 0.25, 0.40, 0.55, 0.80] },
  skullcrusher: { patterns: [/barre\s*au\s*front|skullcrusher|extension\s*triceps\s*barre/i],                     ratios: [0.20, 0.35, 0.50, 0.70, 0.95] },
  dips:         { patterns: [/dips|doubles\s*barres|repulsion\s*barres/i],                                        ratios: [0.0, 0.10, 0.30, 0.55, 1.65] },
  hipthrust:    { patterns: [/hip[\s-]*thrust|poussee\s*de\s*hanches?|pont\s*fessier/i],                          ratios: [0.75, 1.00, 1.50, 2.00, 2.75] },
  rdl:          { patterns: [/\brdl\b|romanian|souleve\s*de\s*terre\s*roumain|\bsdt\s*roumain|deadlift\s*jambes\s*tendues|souleve\s*jambes\s*tendues/i], ratios: [0.75, 1.00, 1.40, 1.80, 2.30] },
};
const STRENGTH_STANDARDS_FEMALE = {
  bench:        { patterns: [/bench\s*press|developpe\s*couche|\bdc\b/i],                                         ratios: [0.25, 0.45, 0.65, 0.90, 1.20] },
  incline:      { patterns: [/incline|developpe\s*incline|incline\s*bench|\bdci\b/i],                             ratios: [0.20, 0.35, 0.55, 0.75, 1.00] },
  frontsquat:   { patterns: [/front\s*squat|squat\s*avant|squat\s*clavicule/i],                                   ratios: [0.40, 0.60, 0.80, 1.15, 1.50] },
  bulgarian:    { patterns: [/split\s*squat|bulgare|fente\s*bulgare|bulgarian/i],                                 ratios: [0.30, 0.45, 0.65, 0.90, 1.25] },
  squat:        { patterns: [/\bsquat\s*barre|back\s*squat|squat\s*arriere|(?<!hack\s)\bsquat\b/i],               ratios: [0.50, 0.75, 1.00, 1.40, 1.80] },
  deadlift:     { patterns: [/(?<!romanian\s)deadlift(?!\s*jambes)|souleve\s*de\s*terre(?!\s*roumain)|\bsdt\b(?!\s*roumain)/i], ratios: [0.65, 0.90, 1.20, 1.60, 2.10] },
  ohp:          { patterns: [/overhead|militaire|ohp\b|developpe\s*militaire|shoulder\s*press|presse\s*epaules/i],ratios: [0.20, 0.35, 0.50, 0.65, 0.80] },
  row:          { patterns: [/rowing|row\b|tirage\s*horizontal|bent\s*over\s*row/i],                              ratios: [0.35, 0.50, 0.70, 0.95, 1.20] },
  legpress:     { patterns: [/leg\s*press|presse\s*a?\s*cuisses?|presse\s*jambes|hack\s*squat|presse/i],          ratios: [1.00, 1.50, 2.25, 3.00, 4.00] },
  latpull:      { patterns: [/lat\s*pull|lat\s*pulldown|tirage\s*(poulie\s*)?haut|tirage\s*poitrine|tirage\s*vertical|tirage\s*machine|tirage\s*poulie/i], ratios: [0.35, 0.50, 0.70, 0.85, 1.00] },
  pullup:       { patterns: [/traction|pull.?up|chin.?up|tirage\s*fixe/i],                                        ratios: [0.70, 0.85, 1.00, 1.15, 1.35] },
  hammercurl:   { patterns: [/curl\s*marteau|hammer\s*curl|curl\s*prise\s*neutre/i],                              ratios: [0.10, 0.20, 0.30, 0.45, 0.65] },
  curl:         { patterns: [/curl|flexion\s*bras/i],                                                             ratios: [0.10, 0.18, 0.28, 0.40, 0.55] },
  skullcrusher: { patterns: [/barre\s*au\s*front|skullcrusher|extension\s*triceps\s*barre/i],                     ratios: [0.10, 0.20, 0.30, 0.45, 0.65] },
  dips:         { patterns: [/dips|doubles\s*barres|repulsion\s*barres/i],                                        ratios: [0.0, 0.0, 0.15, 0.35, 0.55] },
  hipthrust:    { patterns: [/hip[\s-]*thrust|poussee\s*de\s*hanches?|pont\s*fessier/i],                          ratios: [0.50, 0.80, 1.20, 1.60, 2.25] },
  rdl:          { patterns: [/\brdl\b|romanian|souleve\s*de\s*terre\s*roumain|\bsdt\s*roumain|deadlift\s*jambes\s*tendues|souleve\s*jambes\s*tendues/i], ratios: [0.50, 0.75, 1.00, 1.40, 1.80] },
};
const STRENGTH_LABELS = [
  { label: 'Débutant',      color: '#86868B', topPct: 'Top 80%' },
  { label: 'Novice',        color: '#0A84FF', topPct: 'Top 60%' },
  { label: 'Intermédiaire', color: '#32D74B', topPct: 'Top 40%' },
  { label: 'Avancé',        color: '#FF9F0A', topPct: 'Top 15%' },
  { label: 'Élite',         color: '#BF5AF2', topPct: 'Top 3%'  },
];

function getStrengthLevel(exoName, e1rm, bw) {
  if (!e1rm || e1rm <= 0 || !bw || bw <= 0) return null;
  const norm = exoName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const _stds = (db.user.gender === 'female') ? STRENGTH_STANDARDS_FEMALE : STRENGTH_STANDARDS;
  let stdKey = null;
  for (const [key, std] of Object.entries(_stds)) {
    if (std.patterns.some(p => p.test(norm))) { stdKey = key; break; }
  }
  if (!stdKey) return null;
  const ratios = _stds[stdKey].ratios;
  const ratio = e1rm / bw;
  let level = 0;
  for (let i = 0; i < ratios.length; i++) {
    if (ratio >= ratios[i]) level = i;
  }
  // Interpolate for finer Top X%
  const basePcts = [80, 60, 40, 15, 3];
  let topPct;
  if (level < ratios.length - 1) {
    const lo = ratios[level], hi = ratios[level + 1];
    const frac = Math.min(1, (ratio - lo) / (hi - lo));
    const pctLo = basePcts[level], pctHi = basePcts[level + 1];
    topPct = 'Top ' + Math.round(pctLo - frac * (pctLo - pctHi)) + '%';
  } else {
    topPct = ratio >= ratios[ratios.length-1] * 1.15 ? 'Top 1%' : 'Top 3%';
  }
  return { ...STRENGTH_LABELS[level], topPct, ratio: Math.round(ratio * 100) / 100, levelIdx: level };
}

function findPreviousBestE1RM(exoName, beforeTs) {
  let best = 0;
  for (const log of db.logs) {
    if (log.timestamp >= beforeTs) continue;
    for (const exo of log.exercises) {
      if ((exo.maxRM||0) > best && matchExoName(exo.name, exoName)) best = exo.maxRM;
    }
  }
  return best;
}

// ── DOTS / Wilks scoring ────────────────────────────────────
function computeDOTS(total, bw, gender) {
  if (!gender) gender = 'M';
  var coeffs = gender === 'M'
    ? [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093]
    : [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706];
  var denom = 0;
  for (var i = 0; i < coeffs.length; i++) denom += coeffs[i] * Math.pow(bw, i);
  return Math.round((500 / denom) * total * 100) / 100;
}

function computeWilks(total, bw, gender) {
  if (!gender) gender = 'M';
  var coeffs = gender === 'M'
    ? [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8]
    : [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8];
  var denom = 0;
  for (var i = 0; i < coeffs.length; i++) denom += coeffs[i] * Math.pow(bw, i);
  return Math.round((500 / denom) * total * 100) / 100;
}

// ── Volume hebdomadaire réel par groupe musculaire ──────────
function computeWeeklyVolume(logs, weeksBack) {
  if (weeksBack === undefined) weeksBack = 1;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (weeksBack * 7));
  const recentLogs = logs.filter(l => new Date(l.date || l.timestamp).getTime() >= cutoff.getTime());

  const volumeByMuscle = {};
  for (const log of recentLogs) {
    for (const exo of log.exercises || []) {
      const contributions = getMuscleContributions(exo.name);
      const detailSets = exo.series || exo.allSets;
      const setCount = (Array.isArray(detailSets) && detailSets.length > 0)
        ? detailSets.filter(function(s) { return !s.isWarmup && s.type !== 'warmup'; }).length
        : (exo.sets || exo.setCount || 0);
      for (var ci = 0; ci < contributions.length; ci++) {
        var mc = contributions[ci];
        var vlKey = MUSCLE_TO_VL_KEY[mc.muscle] || mc.muscle.toLowerCase();
        volumeByMuscle[vlKey] = (volumeByMuscle[vlKey] || 0) + setCount * mc.coeff;
      }
    }
  }
  return volumeByMuscle;
}

// ── Fatigue musculaire (décroissance exponentielle 48h) ─────
function computeMuscleFatigue(logs) {
  var now = Date.now();
  var fatigue = {};
  for (var li = 0; li < logs.length; li++) {
    var log = logs[li];
    var ts = log.timestamp || new Date(log.date).getTime();
    var hoursAgo = (now - ts) / 3600000;
    if (hoursAgo > 168) continue; // 7 jours max
    var decayFactor = Math.exp(-hoursAgo / 48);
    for (var ei = 0; ei < (log.exercises || []).length; ei++) {
      var exo = log.exercises[ei];
      var contributions = getMuscleContributions(exo.name);
      var workSets = typeof exo.sets === 'number' ? exo.sets : (exo.setCount || 0);
      for (var ci = 0; ci < contributions.length; ci++) {
        var mc = contributions[ci];
        var vlKey = MUSCLE_TO_VL_KEY[mc.muscle] || mc.muscle.toLowerCase();
        fatigue[vlKey] = (fatigue[vlKey] || 0) + workSets * mc.coeff * decayFactor;
      }
    }
  }
  for (var muscle in fatigue) {
    var mrv = (VOLUME_LANDMARKS[muscle] || {}).MRV || 15;
    fatigue[muscle] = Math.min(100, Math.round((fatigue[muscle] / (mrv / 7 * 2)) * 100));
  }
  return fatigue;
}

// ============================================================
// SECONDARY ACTIVITIES — TRIMP constants
// ============================================================

var ACTIVITY_MUSCLES = {
  natation:          ['Épaules', 'Dos', 'Pectoraux', 'Triceps'],
  course:            ['Quadriceps', 'Ischio', 'Mollets'],
  trail:             ['Quadriceps', 'Ischio', 'Fessiers', 'Mollets', 'Lombaires'],
  randonnee:         ['Quadriceps', 'Ischio', 'Fessiers', 'Mollets', 'Lombaires'],
  velo:              ['Quadriceps', 'Fessiers', 'Mollets'],
  ski:               ['Quadriceps', 'Fessiers', 'Ischio', 'Adducteurs'],
  yoga:              ['Abdos', 'Lombaires'],
  pilates:           ['Abdos', 'Lombaires'],
  arts_martiaux:     ['Full Body'],
  sports_collectifs: ['Full Body'],
  autre:             ['Full Body']
};

var ACTIVITY_IMPACT_FACTORS = {
  trail:             1.2,
  course:            1.2,
  arts_martiaux:     1.1,
  velo:              1.0,
  ski:               1.0,
  natation:          0.8,
  yoga:              0.5,
  pilates:           0.5,
  sports_collectifs: 0.9,
  randonnee:         1.1,
  autre:             0.8
};

var ACTIVITY_INTENSITY_MULT = { 1: 0.3, 2: 0.6, 3: 1.0, 4: 1.5, 5: 2.0 };

function computeActivityScore(activity) {
  if (!activity) return 0;
  var duration = activity.duration || 60;
  var intensity = activity.intensity || 2;
  var type = activity.type || 'autre';
  var elevGain = activity.elevGain || 0;
  var intensityMult = ACTIVITY_INTENSITY_MULT[intensity] || 0.6;
  var impactFactor = ACTIVITY_IMPACT_FACTORS[type] || 0.8;
  var score = duration * intensityMult * impactFactor;
  if ((type === 'trail' || type === 'randonnee') && elevGain > 0) {
    score += (elevGain / 100) * 10;
  }
  return Math.round(score);
}

function checkActivityInjuryConflict(activityType, injuries) {
  if (!injuries || !injuries.length) return null;
  var CONFLICTS = {
    trail: {
      zones: ['genou', 'hanches'], level: 1,
      alert: 'Le dénivelé du trail génère des chocs excentriques importants sur les genoux. Séance jambes décalée de 48h recommandée.',
      suggestion: 'Remplacer par natation ou vélo résistance légère.'
    },
    course: {
      zones: ['genou'], level: 1,
      alert: 'La course impacte les genoux. Préfère le vélo ou la natation.',
      suggestion: 'Vélo stationnaire ou natation (sans battements forts).'
    },
    natation: {
      zones: ['epaule'], level: 2,
      alert: 'La nage crawl/papillon peut aggraver une blessure épaule.',
      suggestion: 'Préfère la brasse (moins de rotation épaule).'
    },
    randonnee: {
      zones: ['genou', 'hanches'], level: 1,
      alert: 'La randonnée avec dénivelé sollicite fortement les genoux.',
      suggestion: 'Décaler la séance jambes de 24h.'
    }
  };
  var conflict = CONFLICTS[activityType];
  if (!conflict) return null;
  var hasConflict = injuries.some(function(injury) {
    return injury.active
      && conflict.zones.includes(injury.zone)
      && (injury.level || 1) >= conflict.level;
  });
  return hasConflict ? conflict : null;
}

function computeWeeklyActivityScore() {
  var score = 0;
  var weekStart = Date.now() - 7 * 86400000;
  var weeklyActs = (db.weeklyActivities || []).filter(function(a) {
    return a.date && new Date(a.date).getTime() >= weekStart;
  });
  weeklyActs.forEach(function(a) { score += computeActivityScore(a); });
  var fixedActs = (db.user && db.user.activities) || [];
  fixedActs.forEach(function(a) {
    if (!a.fixed || !a.days || !a.days.length) return;
    a.days.forEach(function(day) {
      var alreadyCovered = weeklyActs.some(function(w) {
        return w.type === a.type && w.day === day;
      });
      if (!alreadyCovered) score += computeActivityScore(a);
    });
  });
  return score;
}

// ============================================================
// BEGINNER LP — Substitutes & Exit Criteria
// ============================================================

var BEGINNER_SUBSTITUTES = {
  'Squat (Barre)':            'Goblet Squat',
  'Soulevé de Terre (Barre)': 'Soulevé de Terre Roumain (Haltères)',
  'Développé Couché (Barre)': 'Développé Couché (Haltères)'
};

function checkLPEnd(logs, bw, pr) {
  var sbdExos = ['Squat (Barre)', 'Développé Couché (Barre)', 'Soulevé de Terre (Barre)'];
  var stagnations = 0;

  sbdExos.forEach(function(exoName) {
    var history = [];
    var sortedLogs = (logs || []).slice().sort(function(a, b) { return (b.timestamp||0) - (a.timestamp||0); });
    var keyword = exoName.toLowerCase().split(' ')[0];
    for (var i = 0; i < sortedLogs.length && history.length < 3; i++) {
      var exo = (sortedLogs[i].exercises || []).find(function(e) {
        return e.name && e.name.toLowerCase().indexOf(keyword) >= 0;
      });
      if (!exo) continue;
      var workSets = (exo.allSets || exo.series || []).filter(function(s) {
        return !s.isWarmup && parseFloat(s.weight) > 0;
      });
      if (!workSets.length) continue;
      var lastSet = workSets[workSets.length - 1];
      history.push({ repsAchieved: parseFloat(lastSet.reps) || 0, repsTarget: 5 });
    }
    if (history.length >= 3 && history.every(function(h) { return h.repsAchieved < h.repsTarget; })) {
      stagnations++;
    }
  });

  if (stagnations >= 2) {
    return { exit: true, reason: 'stagnation',
      message: 'Tu as atteint un palier. On passe en double progression pour consolider.' };
  }

  var squat = (pr && pr.squat) || 0;
  var bench = (pr && pr.bench) || 0;
  if (bw > 0 && (squat >= bw * 1.0 || bench >= bw * 0.8)) {
    return { exit: true, reason: 'performance',
      message: 'Tes ratios de force montrent que tu es prêt pour une vraie périodisation.' };
  }

  return { exit: false };
}

// ============================================================
// SMART CARDIO — Strategies, Equipment, Injury Alternatives
// ============================================================

var CARDIO_STRATEGIES = {
  seche:     { type: 'LISS', desc: 'Marche inclinée 30min',             reason: 'Moins catabolique que le HIIT' },
  masse:     { type: 'LISS', desc: 'Vélo léger 20-30min',               reason: 'Santé mitochondriale, préserver les gains' },
  recompo:   { type: 'LISS', desc: 'Marche inclinée ou natation légère', reason: 'Préserver le muscle' },
  bien_etre: { type: 'MIX',  desc: 'HIIT court + LISS long',            reason: 'Cœur + longévité' },
  force:     { type: 'LISS', desc: 'Vélo léger 20min × 2/sem',          reason: 'Récupération active' },
  default:   { type: 'LISS', desc: 'Cardio modéré 30min',               reason: '' }
};

var CARDIO_BY_EQUIPMENT = {
  salle:    ['Tapis roulant', 'Vélo stationnaire', 'Elliptique', 'Rameur'],
  halteres: ['Circuit HIIT 15min', 'Jumping Jacks', 'KB Swings'],
  maison:   ['Marche rapide extérieur', 'AMRAP 10min sans saut', 'Vélo extérieur']
};

var CARDIO_INJURY_ALTERNATIVES = {
  genou:  { banned: ['Course', 'Corde à sauter', 'Burpees'], alt: 'Natation (sans battements) ou Vélo résistance légère' },
  epaule: { banned: ['Rameur', 'Nage crawl'], alt: 'Vélo stationnaire ou Marche inclinée' },
  dos:    { banned: ['Rameur'], alt: 'Vélo stationnaire ou Marche' }
};

function getCardioForProfile(params) {
  var goal = (params.goals || [])[0] || 'force';
  var mat = params.mat || 'salle';
  var injuries = params.injuries || [];
  var duration = params.cardioDuration || 30;

  var hasKneeInjury = injuries.some(function(i) {
    return (typeof i === 'string' ? i : (i.zone || '')) === 'genou';
  });
  var hasShoulderInjury = injuries.some(function(i) {
    return (typeof i === 'string' ? i : (i.zone || '')) === 'epaule';
  });

  var strategy = CARDIO_STRATEGIES[goal] || CARDIO_STRATEGIES.default;
  var availableCardios = (CARDIO_BY_EQUIPMENT[mat] || CARDIO_BY_EQUIPMENT.salle).slice();

  if (hasKneeInjury) {
    availableCardios = availableCardios.filter(function(c) { return !/course|corde|burpee/i.test(c); });
    if (!availableCardios.length) availableCardios = ['Vélo stationnaire'];
  }
  if (hasShoulderInjury) {
    availableCardios = availableCardios.filter(function(c) { return !/rameur|crawl/i.test(c); });
    if (!availableCardios.length) availableCardios = ['Vélo stationnaire'];
  }

  var cardioName = availableCardios[0] || 'Tapis roulant';

  return {
    name: cardioName,
    type: 'cardio',
    restSeconds: 0,
    coachNote: strategy.desc + (strategy.reason ? ' (' + strategy.reason + ')' : ''),
    sets: [{ durationMin: duration, rpe: strategy.type === 'HIIT' ? 7 : 5, isWarmup: false }]
  };
}

// ============================================================
// NUTRITION LONG TERME
// ============================================================

function checkNutritionStagnation() {
  var entries = (db.body || [])
    .filter(function(e) { return Date.now() - e.ts < 14 * 86400000 && e.weight > 0; })
    .sort(function(a, b) { return a.ts - b.ts; });

  if (entries.length < 7) return null;

  var first = entries[0].weight;
  var last = entries[entries.length - 1].weight;
  var changeKg = last - first;
  var changePerWeek = (changeKg / 14) * 7;

  var goals = (db.user && db.user.programParams && db.user.programParams.goals) || [];
  var goal = goals[0] || (db.user && db.user.goal) || 'maintien';

  if (goal === 'masse' && Math.abs(changeKg) < 0.2) {
    return { adjust: 150, msg: 'Poids stable depuis 2 semaines en prise de masse. On monte les calories de 150kcal.', type: 'increase' };
  }
  if (goal === 'seche' && changePerWeek > -0.1) {
    return { adjust: -150, msg: 'Pas de perte de poids depuis 2 semaines. On réduit de 150kcal.', type: 'decrease' };
  }
  if (goal === 'recompo') {
    var bw = (db.user && db.user.bw) || 80;
    if (changePerWeek < -0.7 / 100 * bw) {
      return { adjust: 200, msg: 'Perte de poids trop rapide. Risque de perte musculaire. Augmente les calories des jours de repos.', type: 'warning' };
    }
  }
  return null;
}

function getNutritionStrategyAdvice() {
  var strategyStart = db.user && db.user.nutritionStrategyStartDate
    ? new Date(db.user.nutritionStrategyStartDate).getTime() : null;
  var weeksOnStrategy = strategyStart
    ? Math.round((Date.now() - strategyStart) / (7 * 86400000)) : 0;
  var goal = ((db.user && db.user.programParams && db.user.programParams.goals) || [])[0];

  if (goal === 'recompo' && weeksOnStrategy >= 16) {
    return {
      suggestion: 'lean_bulk',
      msg: 'Tu es en recompo depuis ' + weeksOnStrategy + ' semaines. Pour un avancé, passer en "Lean Bulk" (+200-300kcal) peut accélérer la progression force.',
      weeksOnStrategy: weeksOnStrategy
    };
  }
  return null;
}

// Volume PR : valide le rep range haut avant d'augmenter la charge (musculation)
function checkVolumePR(exoName, currentWeight, repMin, repMax) {
  if (!currentWeight) return null;
  var logs = (db.logs || []).slice().sort(function(a, b) { return (b.timestamp||0) - (a.timestamp||0); });
  var history = [];
  for (var i = 0; i < logs.length && history.length < 3; i++) {
    var exo = (logs[i].exercises || []).find(function(e) {
      return e.name && e.name.toLowerCase().includes(exoName.toLowerCase().split(' ')[0]);
    });
    if (!exo) continue;
    var workSets = (exo.allSets || []).filter(function(s) {
      return !s.isWarmup && Math.abs(parseFloat(s.weight) - currentWeight) < 2.5;
    });
    if (!workSets.length) continue;
    var avgReps = workSets.reduce(function(s, x) { return s + (parseInt(x.reps) || 0); }, 0) / workSets.length;
    history.push({ avgReps: avgReps, sets: workSets.length });
  }
  if (history.length < 2) return { action: 'hold', reason: 'pas assez de données' };
  var lastAvgReps = history[0].avgReps;
  if (lastAvgReps >= repMax) {
    return { action: 'increase', newWeight: currentWeight + 2.5, newReps: repMin,
      reason: 'repMax atteint (' + Math.round(lastAvgReps) + ' reps) → +2.5kg' };
  }
  return { action: 'hold', targetReps: Math.min(repMax, Math.round(lastAvgReps) + 1),
    reason: 'progresser en reps vers ' + repMax + ' avant d\'augmenter' };
}

// Déséquilibre Ischios/Quads sur 30 jours — protection LCA, pertinent pour séances Legs
function checkIschioCuadImbalance() {
  var logs30 = typeof getLogsInRange === 'function' ? getLogsInRange(30) : [];
  var quadSets = 0, hamSets = 0;
  var QUAD_PAT = /squat|presse|leg extension|hack|fentes|step.up/i;
  var HAM_PAT  = /leg curl|hip thrust|rdl|romanian|good morning|ischio|soulevé de terre roumain/i;
  logs30.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var sets = (exo.allSets || []).filter(function(s) { return !s.isWarmup; }).length || (exo.sets || 0);
      if (QUAD_PAT.test(exo.name || '')) quadSets += sets;
      if (HAM_PAT.test(exo.name || ''))  hamSets  += sets;
    });
  });
  if (quadSets === 0 && hamSets === 0) return null;
  var ratio = hamSets > 0 ? quadSets / hamSets : 999;
  if (ratio > 1.5) {
    return {
      imbalance: true,
      ratio: Math.round(ratio * 10) / 10,
      message: 'Dominance Quads détectée (ratio Q/I : ' + Math.round(ratio * 10) / 10 + '). ' +
        'Ajoute du Leg Curl et RDL pour protéger le LCA.',
      inject: ['Leg Curl allongé', 'Soulevé de Terre Roumain (Barre)']
    };
  }
  return { imbalance: false, ratio: Math.round(ratio * 10) / 10 };
}

function computeWellbeingMetrics() {
  var logs = db.logs || [];
  if (!logs.length) return null;

  // Constance : jours distincts actifs sur 30j
  var logs30 = typeof getLogsInRange === 'function' ? getLogsInRange(30) : [];
  var activeDays = {};
  logs30.forEach(function(log) {
    activeDays[new Date(log.timestamp).toDateString()] = true;
  });
  var streak = Object.keys(activeDays).length;

  // Variété : distribution cardio / force / souplesse
  var types = { cardio: 0, force: 0, souplesse: 0 };
  logs30.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var n = exo.name || '';
      if (/natation|vélo|marche|course|cardio/i.test(n)) types.cardio++;
      else if (/yoga|mobilité|étirement|souplesse/i.test(n))  types.souplesse++;
      else types.force++;
    });
  });
  var totalExos = types.cardio + types.force + types.souplesse;
  var varietyScore = totalExos > 0
    ? Math.round(100 * (1 - Math.max(types.cardio, types.force, types.souplesse) / totalExos))
    : 0;

  // Régularité : ratio séances réelles / fréquence cible
  var seancesPerWeek = logs30.length / 4;
  var freq = (db.user && db.user.programParams && db.user.programParams.freq) || 3;
  var srsWellbeing = Math.min(100, Math.round((seancesPerWeek / Math.max(1, freq)) * 100));

  return { streak: streak, varietyScore: varietyScore, srsWellbeing: srsWellbeing, typeBreakdown: types };
}

var BASIC_SUPPLEMENTS = [
  { name: 'Créatine Monohydrate', dose: '3-5g/j', reason: 'Consensus scientifique total sur la force et la puissance', priority: 1 },
  { name: 'Vitamine D3',          dose: '1000-2000 UI/j', reason: 'Immunité et santé hormonale, surtout automne/hiver', priority: 2 },
  { name: 'Whey Protéine',        dose: 'Selon besoins du jour', reason: 'Praticité pour atteindre les apports protéiques', priority: 3 }
];

// Back-Off Sets Dynamiques
function computeBackOffSets(plannedWeight, topSetRPE, targetRPE, backOffCount, bodyPart) {
  if (!plannedWeight || plannedWeight <= 0) return { sets: [], suggestion: null };
  var count = backOffCount || 3;
  var diff = (topSetRPE || targetRPE) - (targetRPE || 8);
  var backOffWeight, suggestion = null;
  var extraReps = 0;

  if (diff > 0) {
    // Overshoot — alléger la charge
    var reduction = Math.min(0.10 + diff * 0.02, 0.25);
    backOffWeight = Math.floor((plannedWeight * (1 - reduction)) / 2.5) * 2.5;
  } else if (diff <= -1.5) {
    // Big undershoot — charger un peu plus + proposer bonus set
    backOffWeight = Math.round(plannedWeight * 1.025 / 2.5) * 2.5;
    suggestion = { type: 'bonus_set', weight: Math.round(plannedWeight * 1.05 / 2.5) * 2.5 };
  } else if (diff <= -1) {
    // Small undershoot — même charge + rep supplémentaire
    backOffWeight = plannedWeight;
    extraReps = 1;
    suggestion = { type: 'extra_reps' };
  } else {
    // On target
    backOffWeight = plannedWeight;
  }
  backOffWeight = Math.max(20, backOffWeight);

  var lower = (bodyPart === 'lower');
  var backOffReps = (lower ? 4 : 5) + extraReps;
  var backOffRpe = Math.max(6, (targetRPE || 8) - 1.5);

  var sets = [];
  for (var i = 0; i < count; i++) {
    sets.push({ weight: backOffWeight, reps: backOffReps, rpe: backOffRpe, isWarmup: false, isBackOff: true });
  }
  return { sets: sets, suggestion: suggestion };
}

function computeDropSets(topSetWeight, topSetRPE, dropPct, dropCount) {
  if (!topSetWeight || topSetWeight <= 0) return [];
  var pct = dropPct || 0.10;
  var count = dropCount || 2;
  if (topSetRPE >= 9.5) count = Math.max(1, count - 1);
  var dropWeight = Math.round(topSetWeight * (1 - pct) / 2.5) * 2.5;
  dropWeight = Math.max(20, dropWeight);
  var sets = [];
  for (var i = 0; i < count; i++) {
    sets.push({ weight: dropWeight, reps: 'max', rpe: null, isWarmup: false, isDropSet: true });
  }
  return sets;
}

// Proxy VBT — Grind Notation (9G)

function processGrind(set, e1rmForLift) {
  if (!set.grind) return set;
  if (!set.rpe) {
    var pct = (e1rmForLift > 0 && set.weight > 0) ? set.weight / e1rmForLift : 0;
    set.rpe = pct > 0.80 ? 9 : 9.5;
  } else {
    set.rpe = Math.max(set.rpe, 9);
  }
  return set;
}

function getSetRPELabel(set) {
  if (!set.rpe && !set.grind) return '—';
  var rpe = set.grind ? Math.max(set.rpe || 9, 9) : set.rpe;
  return rpe + (set.grind ? 'G' : '');
}

function countGrindThisSession() {
  var grindCount = 0;
  var heavySetsCount = 0;
  // Read directly from the active workout (not yet in db.logs)
  if (typeof activeWorkout !== 'undefined' && activeWorkout && activeWorkout.exercises) {
    activeWorkout.exercises.forEach(function(exo) {
      if (!/squat|bench|dead|développé|soulevé/i.test(exo.name || '')) return;
      (exo.sets || []).forEach(function(s) {
        if (s.type === 'warmup' || s.isWarmup || s.isBackOff || !s.completed) return;
        heavySetsCount++;
        if (s.grind) grindCount++;
      });
    });
  }
  return { grindCount: grindCount, heavySetsCount: heavySetsCount };
}

function checkActiveWashoutNeeded() {
  var planHistory = db.weeklyPlanHistory || [];

  var lastEvent = planHistory.slice().reverse().find(function(p) {
    return p.isWashout || p.isDeload;
  });

  var refDate = lastEvent
    ? new Date(lastEvent.generated_at).getTime()
    : ((db.logs && db.logs.length) ? db.logs[0].timestamp : null);

  if (!refDate) return null;

  var weeksSince = Math.round((Date.now() - refDate) / (7 * 86400000));

  if (weeksSince >= 16) {
    return {
      needed: true,
      weeksSince: weeksSince,
      msg: '🔧 ' + weeksSince + ' semaines de charges lourdes. ' +
        'La 1ère semaine du prochain bloc Hypertrophie sera un Active Washout ' +
        '(charges axiales remplacées par unilatéral + tempo 4s excentrique).',
      substitutes: {
        'Squat (Barre)':            'Bulgarian Split Squat',
        'High Bar Squat':           'Bulgarian Split Squat',
        'Soulevé de Terre (Barre)': 'RDL Haltères unilatéral',
        'Paused Squat':             'Step-up tempo 4s'
      },
      tempoNote: 'Excentrique 4 secondes — tous les exercices de jambes.'
    };
  }

  return { needed: false, weeksSince: weeksSince };
}

// ============================================================
// PREHAB — generative warm-up routines (rendered, not persisted)
// ============================================================
var PREHAB_ROUTINES = {
  bench_standard: [
    { name: 'Band Pull-Apart', sets: 2, reps: 15 },
    { name: 'Face Pull léger', sets: 2, reps: 15 },
    { name: 'Mobilisation thoracique', sets: 1, reps: '60s' }
  ],
  bench_low_readiness: [
    { name: 'Mobilisation thoracique', sets: 2, reps: '60s' },
    { name: 'Activation coiffe rotateurs', sets: 2, reps: 15 },
    { name: 'Band Pull-Apart', sets: 3, reps: 15 },
    { name: 'Face Pull léger', sets: 2, reps: 20 }
  ],
  bench_shoulder_injury: [
    { name: 'Pendule épaule', sets: 2, reps: '30s' },
    { name: 'Rotation externe bande', sets: 3, reps: 15 },
    { name: 'Face Pull léger', sets: 3, reps: 20 }
  ],
  squat_standard: [
    { name: 'Hip Circle', sets: 2, reps: 10 },
    { name: 'Activation fessiers (pont)', sets: 2, reps: 15 },
    { name: 'Mobilité cheville (mur)', sets: 1, reps: '45s' }
  ],
  squat_low_readiness: [
    { name: 'Hip Circle', sets: 3, reps: 10 },
    { name: 'Activation fessiers (pont)', sets: 3, reps: 15 },
    { name: 'Mobilité cheville (mur)', sets: 2, reps: '45s' },
    { name: 'Gobelet Squat léger', sets: 2, reps: 10 }
  ],
  squat_knee_injury: [
    { name: 'Terminal Knee Extension', sets: 3, reps: 15 },
    { name: 'Activation fessiers (pont)', sets: 3, reps: 15 },
    { name: 'Mobilité cheville (mur)', sets: 2, reps: '45s' }
  ],
  deadlift_standard: [
    { name: 'Hip Hinge bande', sets: 2, reps: 10 },
    { name: 'Activation ischios (pont)', sets: 2, reps: 12 },
    { name: 'Cat-Cow mobilisation', sets: 1, reps: '45s' }
  ],
  deadlift_low_readiness: [
    { name: 'McGill Curl-up', sets: 3, reps: 8 },
    { name: 'Bird Dog', sets: 2, reps: 10 },
    { name: 'Hip Hinge bande', sets: 3, reps: 10 },
    { name: 'Cat-Cow mobilisation', sets: 2, reps: '45s' }
  ],
  deadlift_back_injury: [
    { name: 'McGill Curl-up', sets: 3, reps: 8 },
    { name: 'Bird Dog', sets: 3, reps: 10 },
    { name: 'Side Plank', sets: 2, reps: '30s' },
    { name: 'Dead Bug', sets: 2, reps: 10 }
  ],
  weakpoints_standard: [
    { name: 'Mobilisation thoracique', sets: 2, reps: '45s' },
    { name: 'Band Pull-Apart', sets: 2, reps: 15 }
  ]
};

function getPrehabKey(dayKey, srsScore, injuries) {
  injuries = injuries || [];
  var isLow = (typeof srsScore === 'number') && srsScore < 55;
  var hasKnee = injuries.some(function(i) { return i && i.active && i.zone === 'genou'; });
  var hasShoulder = injuries.some(function(i) { return i && i.active && i.zone === 'epaule'; });
  var hasBack = injuries.some(function(i) { return i && i.active && (i.zone === 'dos' || i.zone === 'lombaires'); });
  if (dayKey === 'bench')   return hasShoulder ? 'bench_shoulder_injury' : isLow ? 'bench_low_readiness' : 'bench_standard';
  if (dayKey === 'squat')   return hasKnee     ? 'squat_knee_injury'     : isLow ? 'squat_low_readiness' : 'squat_standard';
  if (dayKey === 'deadlift')return hasBack     ? 'deadlift_back_injury'  : isLow ? 'deadlift_low_readiness' : 'deadlift_standard';
  if (dayKey === 'weakpoints') return 'weakpoints_standard';
  return null;
}

function generatePrehabRoutine(key) {
  return (PREHAB_ROUTINES[key] || []).map(function(exo) {
    return { name: exo.name, sets: exo.sets, reps: exo.reps };
  });
}

// ============================================================
// CUSTOM PROGRAMME — TRANSFER MATRIX & SLOT BLACKLIST
// ============================================================

var EXERCISE_TRANSFER_MATRIX = {
  // Famille Squat (parent: 'Squat (Barre)')
  'Squat (Barre)':          { family: 'squat', ratio: 1.00 },
  'High Bar Squat':         { family: 'squat', ratio: 0.97 },
  'Paused Squat':           { family: 'squat', ratio: 0.88 },
  'Front Squat':            { family: 'squat', ratio: 0.80 },
  'Bulgarian Split Squat':  { family: 'squat', ratio: 0.65 },
  'Goblet Squat':           { family: 'squat', ratio: 0.55 },
  'Hack Squat':             { family: 'squat', ratio: 0.75 },

  // Famille Hinge (parent: 'Soulevé de Terre (Barre)')
  'Soulevé de Terre (Barre)':         { family: 'hinge', ratio: 1.00 },
  'Soulevé de Terre Sumo (Barre)':    { family: 'hinge', ratio: 0.95 },
  'Soulevé de Terre Roumain (Barre)': { family: 'hinge', ratio: 0.80 },
  'Rack Pull':                         { family: 'hinge', ratio: 1.05 },
  'Déficit Deadlift':                  { family: 'hinge', ratio: 0.90 },
  'Good Morning':                      { family: 'hinge', ratio: 0.55 },

  // Famille Bench (parent: 'Développé Couché (Barre)')
  'Développé Couché (Barre)':          { family: 'bench', ratio: 1.00 },
  'Spoto Press':                        { family: 'bench', ratio: 0.92 },
  'Larsen Press':                       { family: 'bench', ratio: 0.90 },
  'Paused Bench':                       { family: 'bench', ratio: 0.92 },
  'Close Grip Bench':                   { family: 'bench', ratio: 0.88 },
  'Développé Incliné (Barre)':          { family: 'bench', ratio: 0.82 },
  'Développé Couché (Haltères)':        { family: 'bench', ratio: 0.85 },

  // Famille OHP (parent: 'Développé Militaire (Barre)')
  'Développé Militaire (Barre)':        { family: 'ohp', ratio: 1.00 },
  'Développé Militaire (Haltères)':     { family: 'ohp', ratio: 0.90 },
  'Push Press':                          { family: 'ohp', ratio: 1.10 }
};

var SLOT_PROMOTION_BLACKLIST = [
  'Curl Biceps', 'Curl Marteau', 'Extension Triceps', 'Leg Extension',
  'Leg Curl', 'Élévation Latérale', 'Élévation Frontale', 'Fly',
  'Écarté', 'Face Pull', 'Shrugs', 'Crunch', 'Planche'
];

// Calculer l'e1RM estimé pour un exercice sans historique
// via le ratio de transfert depuis un exercice parent connu
function estimateE1RMFromTransfer(targetExoName, sourceExoName, sourceE1RM) {
  var target = EXERCISE_TRANSFER_MATRIX[targetExoName];
  var source = EXERCISE_TRANSFER_MATRIX[sourceExoName];
  if (!target || !source) return null;
  if (target.family !== source.family) return null;
  return Math.round(sourceE1RM * (target.ratio / source.ratio) / 2.5) * 2.5;
}

// Trouver le meilleur exercice source pour estimer un e1RM
function findBestTransferSource(targetExoName, allBestE1RMs) {
  var target = EXERCISE_TRANSFER_MATRIX[targetExoName];
  if (!target) return null;
  var best = null, bestE1RM = 0;
  Object.keys(allBestE1RMs || {}).forEach(function(exoName) {
    var source = EXERCISE_TRANSFER_MATRIX[exoName];
    if (!source || source.family !== target.family) return;
    var e1rm = allBestE1RMs[exoName];
    if (e1rm > bestE1RM) { bestE1RM = e1rm; best = exoName; }
  });
  if (!best) return null;
  return { exoName: best, e1rm: bestE1RM };
}

// Ratio de transfert entre deux exercices — utilise l'historique réel de l'user si disponible,
// sinon fallback sur EXERCISE_TRANSFER_MATRIX universel.
function getTransferRatio(sourceExo, targetExo) {
  var allE1RMs = typeof getAllBestE1RMs === 'function' ? getAllBestE1RMs() : {};
  var sourceE1rm = allE1RMs[sourceExo] ? allE1RMs[sourceExo].e1rm : 0;
  var targetE1rm = allE1RMs[targetExo] ? allE1RMs[targetExo].e1rm : 0;
  if (sourceE1rm > 0 && targetE1rm > 0) {
    return targetE1rm / sourceE1rm;
  }
  var src = EXERCISE_TRANSFER_MATRIX[sourceExo];
  var tgt = EXERCISE_TRANSFER_MATRIX[targetExo];
  if (src && tgt && src.family === tgt.family) return tgt.ratio / src.ratio;
  return null;
}

// Decay e1RM après absence : -1 % par semaine, plafonné à -15 %
function applyE1RMDecay(e1rm, weeksAbsent) {
  var decay = Math.min(0.15, weeksAbsent * 0.01);
  return Math.round(e1rm * (1 - decay) / 2.5) * 2.5;
}

// Ghost Gains : si le lift principal a progressé, répercuter
// la progression sur un exercice absent via le ratio de transfert
function applyGhostGains(oldE1rm, mainLiftDelta, transferRatio) {
  return Math.round((oldE1rm + mainLiftDelta * transferRatio) / 2.5) * 2.5;
}

// ============================================================
// CUSTOM PROGRAMME — FATIGUE PENALTY
// ============================================================

var MRV_HARD_SETS_THRESHOLD = 8;
var MAX_MAIN_LIFTS_PER_SESSION = 3;

// Vérifier si deux exercices partagent le même groupe musculaire principal
function doExercisesShareMuscleGroup(exoNameA, exoNameB) {
  var mgA = typeof getMuscleGroup === 'function' ? getMuscleGroup(exoNameA) : null;
  var mgB = typeof getMuscleGroup === 'function' ? getMuscleGroup(exoNameB) : null;
  if (!mgA || !mgB) return false;
  return mgA === mgB;
}

// Calculer le penalty de fatigue pour un exercice selon sa position
// dans la séance et les exercices qui le précèdent
function getFatiguePenalty(exerciseList, targetIndex) {
  if (!exerciseList || targetIndex <= 0) return 0;
  var target = exerciseList[targetIndex];
  var totalPenalty = 0;
  for (var i = 0; i < targetIndex; i++) {
    var prev = exerciseList[i];
    var sameGroup = doExercisesShareMuscleGroup(prev.name || prev.id || '', target.name || target.id || '');
    var isIsolation = prev.slot === 'isolation';
    var multiplier = isIsolation ? 0.5 : 1.0;
    var basePenalty = 0;
    if (i === 0) basePenalty = sameGroup ? 0.05 : 0.02;
    else if (i === 1) basePenalty = sameGroup ? 0.10 : 0.05;
    else basePenalty = 0.15;
    totalPenalty += basePenalty * multiplier;
  }
  return Math.min(totalPenalty, 0.25);
}

// Compter les Hard Sets (RPE ≥ 8) dans une séance pour alerte MRV
function countHardSetsInSession(exercises) {
  var count = 0;
  (exercises || []).forEach(function(exo) {
    if (exo.slot === 'isolation') return;
    (exo.sets || []).forEach(function(s) {
      if (!s.isWarmup && !s.isBackOff && (s.rpe || 0) >= 8) count++;
    });
  });
  return count;
}

// ============================================================
// ANALYSE ATHLÈTE — Fonctions de calcul (Étape B)
// ============================================================

// Meilleur e1RM connu pour un lift (squat/bench/deadlift/ohp/row)
function getTopE1RMForLift(liftType) {
  var OHP_RE  = /développé militaire|overhead press|\bohp\b|press militaire|military press/i;
  var ROW_RE  = /rowing|barbell row|seal row|yates|t.bar|bent.over/i;
  var best = 0;
  (db.logs || []).forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var match = false;
      if (liftType === 'ohp')  match = OHP_RE.test(exo.name || '');
      else if (liftType === 'row') match = ROW_RE.test(exo.name || '');
      else match = typeof getSBDType === 'function' && getSBDType(exo.name) === liftType;
      if (!match) return;
      if (exo.maxRM && exo.maxRM > best) best = exo.maxRM;
      (exo.allSets || []).forEach(function(s) {
        if (s.isWarmup) return;
        var e = typeof wpCalcE1RM === 'function'
          ? wpCalcE1RM(parseFloat(s.weight), parseInt(s.reps), parseFloat(s.rpe))
          : 0;
        if (e > best) best = e;
      });
    });
  });
  return best > 0 ? best : null;
}

// Ratios de force actuels (squat/bench/deadlift/ohp/row)
function computeStrengthRatiosDetailed() {
  var e1rms = {
    squat:     getTopE1RMForLift('squat')    || 0,
    bench:     getTopE1RMForLift('bench')    || 0,
    deadlift:  getTopE1RMForLift('deadlift') || 0,
    ohp:       getTopE1RMForLift('ohp')      || 0,
    row:       getTopE1RMForLift('row')      || 0
  };
  return {
    squat_bench: e1rms.bench     > 0 ? e1rms.squat    / e1rms.bench    : null,
    squat_dead:  e1rms.deadlift  > 0 ? e1rms.squat    / e1rms.deadlift : null,
    bench_dead:  e1rms.deadlift  > 0 ? e1rms.bench    / e1rms.deadlift : null,
    ohp_bench:   e1rms.bench     > 0 ? e1rms.ohp      / e1rms.bench    : null,
    row_bench:   e1rms.bench     > 0 ? e1rms.row      / e1rms.bench    : null,
    raw: e1rms
  };
}

// Tendance poids de corps sur N jours → kg/semaine (null si données insuffisantes)
function getWeightTrend(days) {
  var entries = (db.body || [])
    .filter(function(e) { return Date.now() - e.ts < days * 86400000 && e.weight > 0; })
    .sort(function(a, b) { return a.ts - b.ts; });
  if (entries.length < 4) return null;
  var first = entries.slice(0, 3).reduce(function(s, e) { return s + e.weight; }, 0) / 3;
  var last  = entries.slice(-3).reduce(function(s, e) { return s + e.weight; }, 0) / 3;
  return (last - first) / days * 7;
}

// Tendance e1RM sur N jours pour un lift SBD → ratio (null si données insuffisantes)
function getE1RMTrend(liftType, days) {
  var cutoff = Date.now() - days * 86400000;
  var points = [];
  (db.logs || []).forEach(function(log) {
    if (log.timestamp < cutoff) return;
    (log.exercises || []).forEach(function(exo) {
      if (typeof getSBDType !== 'function' || getSBDType(exo.name) !== liftType) return;
      (exo.allSets || []).forEach(function(s) {
        if (s.isWarmup || s.isBackOff || s.isDropSet) return;
        var w = parseFloat(s.weight), r = parseInt(s.reps);
        if (!w || !r) return;
        var e = typeof wpCalcE1RM === 'function'
          ? wpCalcE1RM(w, r, parseFloat(s.rpe))
          : 0;
        if (e > 0) points.push({ ts: log.timestamp, e1rm: e });
      });
    });
  });
  if (points.length < 3) return null;
  points.sort(function(a, b) { return a.ts - b.ts; });
  var first = points.slice(0, 3).reduce(function(s, p) { return s + p.e1rm; }, 0) / 3;
  var last  = points.slice(-3).reduce(function(s, p) { return s + p.e1rm; }, 0) / 3;
  return first > 0 ? (last - first) / first : null;
}

// ÉTAPE E: zone-aware e1RM trend — only considers sets in the target zone
function getE1RMTrendByZone(liftType, days, zone) {
  var cutoff = Date.now() - days * 86400000;
  var points = [];
  (db.logs || []).forEach(function(log) {
    if (log.timestamp < cutoff) return;
    (log.exercises || []).forEach(function(exo) {
      if (typeof getSBDType !== 'function' || getSBDType(exo.name) !== liftType) return;
      (exo.allSets || []).forEach(function(s) {
        if (s.isWarmup || s.isBackOff || s.isDropSet || s.isAbandoned) return;
        var reps = parseInt(s.reps) || 0;
        var setZone = typeof getDUPZone === 'function' ? getDUPZone(reps) : 'force';
        if (setZone !== zone) return;
        var e = typeof wpCalcE1RM === 'function'
          ? wpCalcE1RM(parseFloat(s.weight), reps, parseFloat(s.rpe))
          : 0;
        if (e > 0) points.push({ ts: log.timestamp, e1rm: e });
      });
    });
  });
  if (points.length < 3) return null;
  points.sort(function(a, b) { return a.ts - b.ts; });
  var first = points.slice(0, 3).reduce(function(s, p) { return s + p.e1rm; }, 0) / 3;
  var last  = points.slice(-3).reduce(function(s, p) { return s + p.e1rm; }, 0) / 3;
  return first > 0 ? (last - first) / first : null;
}

// RPE moyen sur un lift SBD sur les N dernières séances le contenant
function getAvgRPEForLift(liftType, nSessions) {
  var total = 0, count = 0, sessions = 0;
  var sorted = (db.logs || []).slice().sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
  for (var i = 0; i < sorted.length && sessions < nSessions; i++) {
    var found = false;
    (sorted[i].exercises || []).forEach(function(exo) {
      if (typeof getSBDType !== 'function' || getSBDType(exo.name) !== liftType) return;
      found = true;
      (exo.allSets || []).forEach(function(s) {
        if (!s.isWarmup && !s.isBackOff && parseFloat(s.rpe) > 0) {
          total += parseFloat(s.rpe); count++;
        }
      });
    });
    if (found) sessions++;
  }
  return count > 0 ? Math.round(total / count * 10) / 10 : null;
}

// Volume par groupe musculaire sur 30 jours → keyed par MUSCLE_VOLUME_TARGETS
function getVolumeByMuscleGroup() {
  var MG_TO_KEY = {
    'Quadriceps': 'quads', 'Ischio-jambiers': 'ischio',
    'Pecs': 'pecs', 'Pecs (haut)': 'pecs', 'Pecs (bas)': 'pecs',
    'Grand dorsal': 'dos', 'Haut du dos': 'dos', 'Lombaires': 'dos', 'Trapèzes': 'dos',
    'Épaules': 'epaules', 'Épaules (latéral)': 'epaules',
    'Épaules (antérieur)': 'epaules', 'Épaules (postérieur)': 'epaules',
    'Biceps': 'biceps', 'Triceps': 'triceps', 'Fessiers': 'fessiers'
  };
  var logs30 = typeof getLogsInRange === 'function' ? getLogsInRange(30) : [];
  var volumes = {};
  logs30.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var mg = typeof getMuscleGroup === 'function' ? getMuscleGroup(exo.name) : null;
      var key = mg ? MG_TO_KEY[mg] : null;
      if (!key) return;
      var allSets = exo.allSets || exo.series || [];
      var sets = Array.isArray(allSets)
        ? allSets.filter(function(s) { return !s.isWarmup; }).length
        : (typeof exo.sets === 'number' ? exo.sets : 0);
      volumes[key] = (volumes[key] || 0) + sets;
    });
  });
  return volumes;
}

// Détecte une chute de performance des accessoires après un PR sur un lift principal
// Retourne le ratio d'augmentation de RPE (positif = fatigue), ou null
function detectAccessoryDropoff() {
  var sorted = (db.logs || []).slice().sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
  if (sorted.length < 4) return null;
  var last = sorted[0];
  var hasPR = (last.exercises || []).some(function(exo) {
    var type = typeof getSBDType === 'function' ? getSBDType(exo.name) : null;
    if (!type) return false;
    var best = (db.bestPR || {})[type] || 0;
    return exo.maxRM > 0 && best > 0 && exo.maxRM >= best * 0.98;
  });
  if (!hasPR) return null;
  var prevRpe = 0, prevN = 0;
  sorted.slice(1, 4).forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      if (typeof getSBDType === 'function' && getSBDType(exo.name)) return;
      (exo.allSets || []).forEach(function(s) {
        if (!s.isWarmup && parseFloat(s.rpe) > 0) { prevRpe += parseFloat(s.rpe); prevN++; }
      });
    });
  });
  if (prevN === 0) return null;
  prevRpe /= prevN;
  var lastRpe = 0, lastN = 0;
  (last.exercises || []).forEach(function(exo) {
    if (typeof getSBDType === 'function' && getSBDType(exo.name)) return;
    (exo.allSets || []).forEach(function(s) {
      if (!s.isWarmup && parseFloat(s.rpe) > 0) { lastRpe += parseFloat(s.rpe); lastN++; }
    });
  });
  if (lastN === 0) return null;
  lastRpe /= lastN;
  return prevRpe > 0 ? (lastRpe - prevRpe) / prevRpe : null;
}

// ── Arbre de décision plateau (Gemini Q4.1 — B4) ──────────────────────────
// Retourne null si pas de plateau, sinon { type, action, message }
function classifyStagnation(liftType) {
  // ÉTAPE E: use zone-specific trend, fallback to global trend
  var activeZone = typeof getActiveZoneForPhase === 'function' ? getActiveZoneForPhase() : 'hypertrophie';
  var trend3w = getE1RMTrendByZone(liftType, 21, activeZone);
  if (trend3w === null) trend3w = getE1RMTrend(liftType, 21);
  if (trend3w === null) return null;
  var srs = typeof computeSRS === 'function' ? computeSRS() : { score: 75 };
  var rpeAvg = getAvgRPEForLift(liftType, 4);
  var week = (db.weeklyPlan && db.weeklyPlan.week) || 0;
  var weekInBlock = week % 4 || 4;
  var phase = typeof wpDetectPhase === 'function' ? wpDetectPhase() : 'accumulation';

  // FIX 4: Phase-aware RPE threshold — peak/intensification/force expect high RPE
  var peakPhases = { peak: true, intensification: true, force: true };
  var rpeThreshold = peakPhases[phase] ? 9.5 : 9.0;

  // Sur-atteinte: continuous threshold — deeply negative trend, or negative + high RPE
  if (trend3w < -0.03 || (trend3w < -0.015 && rpeAvg !== null && rpeAvg > rpeThreshold)) {
    return { type: 'sur_atteinte', action: 'emergency_deload',
      message: '🔴 Sur-atteinte détectée. 3 jours de repos complets recommandés.' };
  }

  // Fatigue → Deload -30% vol -10% intensité
  if (srs.score < 65 && trend3w <= 0) {
    return { type: 'fatigue', action: 'deload',
      message: '🟠 Fatigue accumulée. Deload : -30% volume, -10% intensité pendant 7j.' };
  }

  // Consolidation → Attendre fin du bloc (semaine 3-4)
  if (Math.abs(trend3w) < 0.01 && weekInBlock >= 3) {
    return { type: 'consolidation', action: 'wait',
      message: '🟡 Phase de consolidation normale. Attends la fin du bloc.' };
  }

  var logs7 = (db.logs || []).filter(function(l) { return l.timestamp > Date.now() - 7 * 86400000; });
  var compliance = logs7.length > 0 ? Math.min(1, logs7.length / 3) : 0;

  // FIX 4: Monitoring — stagnation légère, surveiller 2-3 séances avant de pivoter
  if (Math.abs(trend3w) < 0.01 && srs.score >= 65 && compliance > 0.80) {
    return { type: 'monitoring', action: 'continue',
      message: '🔵 Progression ralentie — surveille 2-3 séances avant de pivoter.' };
  }

  // Plateau réel → Changer variante ou rep-range
  if (Math.abs(trend3w) < 0.005 && srs.score > 80 && compliance > 0.90) {
    return { type: 'plateau_reel', action: 'pivot',
      message: '💡 Plateau réel détecté. Change le rep-range ou la variante principale.' };
  }

  return null;
}

// ============================================================
// analyzeAthleteProfile() — Diagnostic athlétique (Étape C)
// Retourne un tableau de sections [{title, alerts:[{severity,title,text}]}]
// severity : 'danger' | 'warning' | 'good' | 'info'
// ============================================================
function analyzeAthleteProfile() {
  var ratios    = computeStrengthRatiosDetailed();
  var srs       = typeof computeSRS === 'function' ? computeSRS() : { score: 70, acwr: 1.0 };
  var volumes   = getVolumeByMuscleGroup();
  var level     = (db.user && db.user.level) || 'intermediaire';
  var phase     = typeof wpDetectPhase === 'function' ? wpDetectPhase() : 'accumulation';
  var wellbeing = db.todayWellbeing || null;
  var sections  = [];

  // ── SECTION 1 : BIOMÉCANIQUE & RATIOS ──────────────────────────────────────
  var bioAlerts = [];
  var sb = ratios.squat_bench;
  if (sb !== null) {
    var tSB = STRENGTH_RATIO_TARGETS.squat_bench;
    if (sb < tSB.danger) {
      bioAlerts.push({ severity: 'danger', title: 'Dominance Poussée Supérieure Critique',
        text: 'Ratio Squat/Bench : ' + sb.toFixed(2) + ' (cible > ' + tSB.ideal[0] + '). '
          + 'Tes pectoraux compensent le déficit de tes quadriceps. '
          + 'Sur un Squat maximal, le risque de Good Morning Squat est élevé.' });
    } else if (sb < tSB.alert) {
      bioAlerts.push({ severity: 'warning', title: 'Ratio Squat/Bench à surveiller',
        text: 'S/B = ' + sb.toFixed(2) + ' (cible ' + tSB.ideal[0] + '–' + tSB.ideal[1] + '). '
          + 'Prioriser les variantes quadriceps-dominantes (High Bar, Hack Squat, Front Squat).' });
    } else {
      bioAlerts.push({ severity: 'good', title: 'Ratio Squat/Bench',
        text: 'S/B = ' + sb.toFixed(2) + ' ✓ Dans la zone optimale.' });
    }
  }

  var sd = ratios.squat_dead;
  if (sd !== null) {
    var tSD = STRENGTH_RATIO_TARGETS.squat_dead;
    if (sd < tSD.danger) {
      bioAlerts.push({ severity: 'danger', title: 'Alerte Chaîne Antérieure',
        text: 'Ratio Squat/Dead : ' + sd.toFixed(2) + ' (cible > ' + tSD.ideal[0] + '). '
          + 'Ta chaîne postérieure compense massivement le déficit des quadriceps. '
          + 'Risque lombaire documenté sur les charges maximales au Squat.' });
    } else if (sd < tSD.alert) {
      bioAlerts.push({ severity: 'warning', title: 'Ratio Squat/Dead',
        text: 'S/D = ' + sd.toFixed(2) + '. Renforcement quadriceps prioritaire (Leg Press, Hack Squat).' });
    }
  }

  var rb = ratios.row_bench;
  if (rb !== null) {
    var tRB = STRENGTH_RATIO_TARGETS.row_bench;
    if (rb >= tRB.ideal[0]) {
      bioAlerts.push({ severity: 'good', title: 'Symétrie Horizontale',
        text: 'Row/Bench = ' + rb.toFixed(2) + ' ✓ Épaules structurellement protégées.' });
    } else if (rb < tRB.danger) {
      bioAlerts.push({ severity: 'danger', title: 'Déficit Rétraction Scapulaire',
        text: 'Row/Bench = ' + rb.toFixed(2) + ' (cible > ' + tRB.ideal[0] + '). '
          + 'Risque d\'instabilité des épaules sur le Bench lourd. '
          + 'Prioriser Rowing Barre et Seal Row.' });
    } else {
      bioAlerts.push({ severity: 'warning', title: 'Ratio Row/Bench',
        text: 'R/B = ' + rb.toFixed(2) + ' (cible ' + tRB.ideal[0] + '–' + tRB.ideal[1] + '). '
          + 'Augmenter le volume de tirage horizontal.' });
    }
  }

  // Push / Pull ratio (sets sur 30j)
  var PUSH_KEYS = { 'Pecs': 1, 'Pecs (haut)': 1, 'Pecs (bas)': 1,
    'Épaules': 1, 'Épaules (antérieur)': 1, 'Épaules (latéral)': 1, 'Triceps': 1 };
  var PULL_KEYS = { 'Grand dorsal': 1, 'Haut du dos': 1, 'Trapèzes': 1,
    'Biceps': 1, 'Épaules (postérieur)': 1 };
  var pushSets = 0, pullSets = 0;
  var logs30 = typeof getLogsInRange === 'function' ? getLogsInRange(30) : [];
  logs30.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var mg = typeof getMuscleGroup === 'function' ? getMuscleGroup(exo.name) : null;
      if (!mg) return;
      var allSets = exo.allSets || exo.series || [];
      var n = Array.isArray(allSets)
        ? allSets.filter(function(s) { return !s.isWarmup; }).length
        : (typeof exo.sets === 'number' ? exo.sets : 0);
      if (PUSH_KEYS[mg]) pushSets += n;
      if (PULL_KEYS[mg]) pullSets += n;
    });
  });
  if (pushSets + pullSets > 0) {
    var ppRatio = pullSets > 0 ? pushSets / pullSets : null;
    if (ppRatio !== null) {
      if (ppRatio > 1.2) {
        bioAlerts.push({ severity: 'warning', title: 'Dominance Antérieure',
          text: 'Ratio Push/Pull = ' + ppRatio.toFixed(2) + ' (cible ≤ 1.0). '
            + 'Risque de posture cyphotique et conflit sous-acromial à terme.' });
      } else if (ppRatio < 0.8) {
        bioAlerts.push({ severity: 'info', title: 'Bonne Attention au Dos',
          text: 'Ratio Push/Pull = ' + ppRatio.toFixed(2) + '. '
            + 'Assure-toi de maintenir le volume pectoraux (MEV = 8 séries/sem).' });
      }
    }
  }

  if (bioAlerts.length) sections.push({ title: '⚠️ Biomécanique & Ratios', alerts: bioAlerts });

  // ── SECTION 2 : FATIGUE & VOLUME ───────────────────────────────────────────
  var fatigueAlerts = [];
  var acwr = srs.acwr || 1.0;

  if (acwr > ACWR_ZONES.orange_high) {
    fatigueAlerts.push({ severity: 'danger', title: 'Zone Rouge — Risque de Blessure',
      text: 'ACWR = ' + acwr.toFixed(2) + ' (> 1.50). '
        + 'Le risque de blessure est statistiquement doublé. '
        + 'Réduire le volume de 30% cette semaine.' });
  } else if (acwr > ACWR_ZONES.green_high) {
    fatigueAlerts.push({ severity: 'warning', title: 'Zone Orange — Charge Élevée',
      text: 'ACWR = ' + acwr.toFixed(2) + '. Surveille les signaux de fatigue et réduis si RPE augmente.' });
  }

  // Volume proche MRV par groupe musculaire
  var TARGET_LABELS = {
    quads: 'Quadriceps', ischio: 'Ischio-jambiers', pecs: 'Pectoraux',
    dos: 'Dos', epaules: 'Épaules', biceps: 'Biceps', triceps: 'Triceps', fessiers: 'Fessiers'
  };
  Object.keys(MUSCLE_VOLUME_TARGETS).forEach(function(key) {
    var target = MUSCLE_VOLUME_TARGETS[key];
    var vol = volumes[key] || 0;
    var label = TARGET_LABELS[key] || key;
    if (vol === 0) return;
    if (vol >= target.MRV) {
      fatigueAlerts.push({ severity: 'danger', title: 'Volume ' + label + ' au-dessus du MRV',
        text: vol + ' séries/sem (MRV = ' + target.MRV + '). '
          + 'Risque de catabolisme et stagnation. Réduire à ' + target.MAV_high + ' séries max.' });
    } else if (vol >= target.MAV_high) {
      fatigueAlerts.push({ severity: 'warning', title: 'Volume ' + label + ' élevé',
        text: vol + ' séries/sem (MAV max = ' + target.MAV_high + ', MRV = ' + target.MRV + '). '
          + 'Approche de la limite de récupération.' });
    } else if (vol < target.MEV) {
      fatigueAlerts.push({ severity: 'info', title: 'Volume ' + label + ' insuffisant',
        text: vol + ' séries/sem (MEV = ' + target.MEV + '). '
          + 'En dessous du minimum de stimulation pour l\'adaptation.' });
    }
  });

  // Fatigue SNC vs musculaire
  var grindData = typeof countGrindThisSession === 'function' ? countGrindThisSession() : null;
  if (acwr > 1.3 && grindData && grindData.grindCount > 2) {
    fatigueAlerts.push({ severity: 'danger', title: 'Fatigue Systémique (SNC)',
      text: 'ACWR élevé + ' + grindData.grindCount + ' grind(s) détectés. '
        + 'Le système nerveux central est en dette. Repos complet recommandé.' });
  } else if (acwr < 1.2) {
    var rpeSquat = getAvgRPEForLift('squat', 4);
    if (rpeSquat !== null && rpeSquat > 8.5) {
      fatigueAlerts.push({ severity: 'warning', title: 'Fatigue Musculaire Localisée',
        text: 'ACWR normal (' + acwr.toFixed(2) + ') mais RPE Squat moyen = ' + rpeSquat
          + ' sur 4 séances. Fatigue périphérique — SNC intact, muscles saturés.' });
    }
  }

  if (fatigueAlerts.length) sections.push({ title: '🔋 Fatigue & Volume', alerts: fatigueAlerts });

  // ── SECTION 3 : NUTRITION & PROGRESSION ────────────────────────────────────
  var nutrAlerts = [];
  var e1rmTrend = getE1RMTrend('squat', 84); // 12 semaines
  var wTrend    = getWeightTrend(21);

  if (wTrend !== null && e1rmTrend !== null) {
    var wStable  = Math.abs(wTrend) < 0.1;
    var eUp      = e1rmTrend > 0.005;
    var eDown    = e1rmTrend < -0.005;
    if (!wStable && wTrend > 0 && eUp) {
      nutrAlerts.push({ severity: 'good', title: 'Prise de Masse Productive',
        text: 'Poids ↗ (' + (wTrend > 0 ? '+' : '') + wTrend.toFixed(2)
          + 'kg/sem) ET force ↗. Prise de masse musculaire en cours.' });
    } else if (wStable && eUp) {
      nutrAlerts.push({ severity: 'good', title: 'Recompo Confirmée',
        text: 'Poids stable ET force en progression. '
          + 'Recomposition corporelle active — rare et précieuse à ce niveau.' });
    } else if (!wStable && wTrend > 0 && eDown) {
      nutrAlerts.push({ severity: 'warning', title: 'Prise de Gras Probable',
        text: 'Poids ↗ mais force ↘. Le corps stocke sans performer. '
          + 'Revoir le surplus calorique ou la qualité de récupération.' });
    } else if (wStable && !eUp && !eDown) {
      nutrAlerts.push({ severity: 'warning', title: 'Double Stagnation',
        text: 'Poids stable ET force stable. Équilibre homéostatique atteint. '
          + 'Un changement de stimulus est nécessaire (calorique ou volume).' });
    }
  }

  if (e1rmTrend !== null) {
    var monthlyRate = e1rmTrend / 3;
    var rateTarget  = PROGRESSION_RATES[level] || PROGRESSION_RATES.intermediaire;
    if (monthlyRate < rateTarget.alert) {
      nutrAlerts.push({ severity: 'warning', title: 'Progression Anormalement Lente',
        text: 'Progression e1RM Squat : ' + (monthlyRate * 100).toFixed(1) + '%/mois '
          + '(attendu > ' + (rateTarget.normal * 100).toFixed(1) + '% pour niveau '
          + level + '). '
          + (level === 'debutant'
            ? 'Vérifier technique et alimentation.'
            : 'Normal si en deload ou recompo strict.') });
    }
  }

  if (nutrAlerts.length) sections.push({ title: '🥩 Nutrition & Progression', alerts: nutrAlerts });

  // ── SECTION 4 : BIEN-ÊTRE DU JOUR ──────────────────────────────────────────
  if (wellbeing) {
    var wbAlerts = [];
    if (wellbeing.sleep <= 2) {
      wbAlerts.push({ severity: 'warning', title: 'Sommeil Insuffisant',
        text: 'Qualité du sommeil : ' + wellbeing.sleep + '/5. '
          + 'Sleep Penalty actif : charges réduites de 5% ce jour.' });
    }
    if (wellbeing.motivation <= 1 && phase === 'peak') {
      wbAlerts.push({ severity: 'danger', title: 'Faible Motivation en Phase Peak',
        text: 'Tentative de PR déconseillée. '
          + 'Séance technique à 80% recommandée à la place.' });
    }
    if (wellbeing.pain && wellbeing.pain !== 'Aucune') {
      wbAlerts.push({ severity: 'info', title: 'Douleur Signalée : ' + wellbeing.pain,
        text: 'Adapte les exercices concernés. Si douleur > 4/10, réduis la charge ou substitue.' });
    }
    if (wbAlerts.length) sections.push({ title: '🌙 Bien-être du Jour', alerts: wbAlerts });
  }

  // ── RHR alert — Garmin Health Connect (TÂCHE 17 ÉTAPE C) ──
  var rhrAlert = db.todayWellbeing && db.todayWellbeing.rhrAlert;
  if (rhrAlert) {
    var rhrAlerts = [];
    rhrAlerts.push({
      severity: rhrAlert.level === 'danger' ? 'danger' : 'warning',
      title: '❤️ FC Repos Élevée',
      text: rhrAlert.msg + '. '
        + (rhrAlert.level === 'danger'
          ? 'Envisage une séance de récupération active ou un jour de repos complet.'
          : 'Les charges sont automatiquement réduites de 5% aujourd\'hui.')
    });
    sections.push({ title: '⌚ Données Garmin', alerts: rhrAlerts });
  }

  // ── Weight Cut alerts (TÂCHE 19 ÉTAPE C) ──
  if (db.user && db.user.weightCut && db.user.weightCut.active) {
    var wcAlerts = typeof getWeightCutAlerts === 'function' ? getWeightCutAlerts() : [];
    var wc19 = db.user.weightCut;
    var cutWeek = typeof getWeightCutWeek === 'function' ? getWeightCutWeek() : 0;
    var wcProgress = wc19.startWeight && wc19.currentWeight
      ? Math.round((wc19.startWeight - wc19.currentWeight) * 10) / 10
      : 0;
    var wcTarget = wc19.targetWeight && wc19.startWeight
      ? Math.round((wc19.startWeight - wc19.targetWeight) * 10) / 10
      : 0;
    wcAlerts.unshift({
      severity: 'info',
      title: '⚖️ Weight Cut — Semaine ' + cutWeek,
      text: 'Progression : -' + wcProgress + 'kg / -' + wcTarget + 'kg objectif. '
        + 'Les charges sont automatiquement ajustées selon ta perte de poids.'
    });
    if (wcAlerts.length) sections.push({ title: '⚖️ Weight Cut', alerts: wcAlerts });
  }

  // ── Swimming interference check ──
  var swimAlert = typeof checkSwimmingInterference === 'function' ? checkSwimmingInterference() : null;
  if (swimAlert) {
    sections.push({ title: '🏊 Natation vs Musculation', alerts: [{ severity: swimAlert.severity, title: '⚠️ Interférence natation', text: swimAlert.msg }] });
  }

  // ── SECTION 7 : PROGRESSION SBD — arbre de décision plateau ──
  var progressionAlerts = [];
  ['squat', 'bench', 'deadlift'].forEach(function(lift) {
    var stagnation = classifyStagnation(lift);
    if (stagnation) {
      var liftLabel = lift === 'bench' ? 'Bench' : lift === 'squat' ? 'Squat' : 'Deadlift';
      progressionAlerts.push({
        severity: stagnation.type === 'sur_atteinte' ? 'danger'
                : stagnation.type === 'fatigue' ? 'warning' : 'info',
        title: liftLabel + ' — ' + stagnation.type.replace(/_/g, ' '),
        text: stagnation.message
      });
    }
  });
  if (progressionAlerts.length) {
    sections.push({ title: '📈 Analyse Progression SBD', alerts: progressionAlerts });
  }

  return sections;
}

// ── COLD START DETECTION ────────────────────────────────────────────────────

function isColdStart() {
  var logs = db.logs || [];
  var hasE1RM = db.exercises && Object.keys(db.exercises).length > 0;
  return logs.length === 0 && !hasE1RM;
}

function getColdStartWeek() {
  var obDate = db.user && db.user.onboardingDate;
  if (!obDate) return 1;
  var diff = Date.now() - new Date(obDate).getTime();
  return Math.min(4, Math.floor(diff / (7 * 86400000)) + 1);
}

// ── CALIBRATION WEIGHTS ─────────────────────────────────────────────────────

var CALIBRATION_WEIGHTS = {
  squat:    { debutant: 40, intermediaire: 60, avance: 80, competiteur: 100 },
  bench:    { debutant: 30, intermediaire: 45, avance: 60, competiteur: 80  },
  deadlift: { debutant: 50, intermediaire: 70, avance: 90, competiteur: 110 },
  'default': { debutant: 20, intermediaire: 30, avance: 40, competiteur: 50 }
};

function getCalibrationWeight(exoName, bodyPart) {
  var level = (db.user && db.user.level) || 'debutant';
  var name = (exoName || '').toLowerCase();
  var key;
  if (name.includes('squat')) key = 'squat';
  else if (name.includes('bench') || name.includes('développé') || name.includes('couché')) key = 'bench';
  else if (name.includes('soulevé') || name.includes('deadlift') || name.includes('sdt')) key = 'deadlift';
  else key = 'default';
  var table = CALIBRATION_WEIGHTS[key] || CALIBRATION_WEIGHTS['default'];
  return Math.max(20, table[level] || table.debutant);
}

function getOnboardingPR(exoName) {
  var prs = db.user && db.user.onboardingPRs;
  if (!prs) return 0;
  var name = (exoName || '').toLowerCase();
  if (name.includes('squat')) return prs.squat || 0;
  if (name.includes('bench') || name.includes('développé') || name.includes('couché')) return prs.bench || 0;
  if (name.includes('soulevé') || name.includes('deadlift') || name.includes('sdt')) return prs.deadlift || 0;
  return 0;
}

// ============================================================
// PHYSIOMANAGER — Module cycle menstruel (TÂCHE 7)
// Toutes les fonctions retournent des valeurs neutres si
// menstrualEnabled === false ou si l'utilisateur n'est pas F.
// Ne jamais afficher ces données dans le feed social.
// ============================================================

var MENSTRUAL_PHASES = {
  folliculaire_precoce: {
    days: [1, 2, 3, 4, 5, 6, 7],
    cycleCoeff: 0.92,
    mrvCoeff: 0.90,
    rpeAdjust: +1,
    restMultiplier: 1.20,
    injuryAlert: false,
    label: 'Phase folliculaire précoce'
  },
  folliculaire_tardive: {
    days: [8, 9, 10, 11, 12, 13],
    cycleCoeff: 1.08,
    mrvCoeff: 1.10,
    rpeAdjust: -1,
    restMultiplier: 0.90,
    injuryAlert: false,
    label: 'Phase folliculaire tardive'
  },
  ovulatoire: {
    days: [14, 15, 16],
    cycleCoeff: 1.10,
    mrvCoeff: 1.12,
    rpeAdjust: -1,
    restMultiplier: 0.85,
    injuryAlert: true,
    label: 'Phase ovulatoire'
  },
  luteale: {
    days: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
    cycleCoeff: 0.88,
    mrvCoeff: 0.85,
    rpeAdjust: +2,
    restMultiplier: 1.30,
    injuryAlert: true,
    label: 'Phase lutéale'
  }
};

function getCurrentMenstrualPhase() {
  if (!db.user || !db.user.menstrualEnabled || !db.user.menstrualData) return null;
  var data = db.user.menstrualData;
  if (!data.lastPeriodStart) return null;
  var cycleLength = data.cycleLength || 28;
  var start = new Date(data.lastPeriodStart);
  var today = new Date();
  var diffDays = Math.floor((today - start) / 86400000);
  var dayInCycle = (diffDays % cycleLength) + 1;
  if (dayInCycle < 1) dayInCycle = 1;
  for (var phase in MENSTRUAL_PHASES) {
    var p = MENSTRUAL_PHASES[phase];
    if (p.days.indexOf(dayInCycle) !== -1) return phase;
  }
  // Cycle plus long que 28j : phase lutéale étendue
  return 'luteale';
}

function getCycleCoeff() {
  var gender = db.user && db.user.gender;
  if (!db.user || !db.user.menstrualEnabled) return 1.0;
  if (gender && gender !== 'F' && gender !== 'female' && gender !== 'femme') return 1.0;
  var phase = getCurrentMenstrualPhase();
  if (!phase || !MENSTRUAL_PHASES[phase]) return 1.0;
  return MENSTRUAL_PHASES[phase].cycleCoeff;
}

function getMRVWithCycleAdjust(baseMRV) {
  var gender = db.user && db.user.gender;
  if (!db.user || !db.user.menstrualEnabled) return baseMRV;
  if (gender && gender !== 'F' && gender !== 'female' && gender !== 'femme') return baseMRV;
  var phase = getCurrentMenstrualPhase();
  if (!phase || !MENSTRUAL_PHASES[phase]) return baseMRV;
  return Math.round(baseMRV * MENSTRUAL_PHASES[phase].mrvCoeff);
}

function getRestWithCycleAdjust(baseRestSec) {
  var gender = db.user && db.user.gender;
  if (!db.user || !db.user.menstrualEnabled) return baseRestSec;
  if (gender && gender !== 'F' && gender !== 'female' && gender !== 'femme') return baseRestSec;
  var phase = getCurrentMenstrualPhase();
  if (!phase || !MENSTRUAL_PHASES[phase]) return baseRestSec;
  return Math.round(baseRestSec * MENSTRUAL_PHASES[phase].restMultiplier);
}

// ── 5-Rep Test calibration (TÂCHE 12) ────────────────────────
// Pour profils sans PRs (debutant, yoga, senior, reeducation)
// Sécurité S1 : coefficient 0.85 sur le e1RM calculé

function calcE1RMFrom5RepTest(weight, reps) {
  if (!weight || weight <= 0 || !reps || reps <= 0) return 0;
  var e1rm = weight / (1.0278 - (0.0278 * reps));
  return Math.round(e1rm * 0.85 / 2.5) * 2.5;
}

function shouldShow5RepTest(exoName) {
  if (!isColdStart()) return false;
  var profile = db.user && db.user.obProfile;
  var skipPRs = db.user && db.user.skipPRs;
  if (!skipPRs && profile !== 'debutant' && profile !== 'yoga' && profile !== 'senior' && profile !== 'reeducation') return false;
  // Only show for main compound lifts
  var name = (exoName || '').toLowerCase();
  return name.includes('squat') || name.includes('bench') || name.includes('développé')
    || name.includes('soulevé') || name.includes('deadlift') || name.includes('presse')
    || name.includes('rowing') || name.includes('pull');
}

// ── WEIGHT CUT MODULE (TÂCHE 19) ────────────────────────────────────────────

var WEIGHT_CUT_COEFFICIENTS = {
  squat:    1.0,
  bench:    1.5,
  deadlift: 0.5
};

var WEIGHT_CUT_RATES = {
  phase1: 0.010,
  phase2: 0.012,
  danger: 0.015
};

// FIX 6: 14-day moving average of body weight to smooth hormonal fluctuations
function getSmoothedBodyWeight() {
  var wc = db.user && db.user.weightCut;
  if (!wc) return 0;
  var logs = wc.weeklyLogs || [];
  if (!logs.length) return wc.currentWeight || 0;
  var cutoff = Date.now() - 14 * 86400000;
  var recent = logs.filter(function(l) { return l.ts && l.ts >= cutoff && l.weight > 0; });
  if (!recent.length) return wc.currentWeight || 0;
  var sum = recent.reduce(function(s, l) { return s + l.weight; }, 0);
  return sum / recent.length;
}

function calcWeightCutPenalty(liftType) {
  if (!db.user || !db.user.weightCut || !db.user.weightCut.active) return 1.0;
  var wc = db.user.weightCut;
  if (!wc.startWeight) return 1.0;

  // FIX 6: use 14-day moving average instead of raw currentWeight
  var smoothedWeight = getSmoothedBodyWeight();
  if (!smoothedWeight) return 1.0;

  var lossPct = (wc.startWeight - smoothedWeight) / wc.startWeight;
  if (lossPct < 0.02) return 1.0;

  var weeklyLoss = wc.weeklyLogs && wc.weeklyLogs.length > 0
    ? (wc.weeklyLogs[wc.weeklyLogs.length - 1].loss || 0)
    : 0;
  var isWaterCut = weeklyLoss > 0.012;
  var waterMultiplier = isWaterCut ? 1.5 : 1.0;

  var coeff = WEIGHT_CUT_COEFFICIENTS[liftType] || 1.0;
  var penalty = lossPct * coeff * waterMultiplier;
  penalty = Math.min(penalty, 0.20);

  return Math.round((1 - penalty) * 100) / 100;
}

function getWeightCutWeek() {
  if (!db.user || !db.user.weightCut || !db.user.weightCut.active) return 0;
  var wc = db.user.weightCut;
  if (!wc.startDate) return 0;
  var days = Math.floor((Date.now() - new Date(wc.startDate).getTime()) / 86400000);
  return Math.floor(days / 7) + 1;
}

function detectMuscleLoss() {
  if (!db.user || !db.user.weightCut || !db.user.weightCut.active) return false;
  var srs = typeof computeSRS === 'function' ? computeSRS() : { score: 75 };
  if (srs.score < 65) return false;
  var squatTrend = typeof getE1RMTrend === 'function' ? getE1RMTrend('squat', 14) : null;
  return squatTrend !== null && squatTrend < -0.05 && srs.score >= 65;
}

function getWeightCutAlerts() {
  if (!db.user || !db.user.weightCut || !db.user.weightCut.active) return [];
  var wc = db.user.weightCut;
  var alerts = [];

  var weeklyLogs = wc.weeklyLogs || [];
  if (weeklyLogs.length > 0) {
    var lastLoss = weeklyLogs[weeklyLogs.length - 1].loss || 0;
    if (lastLoss > WEIGHT_CUT_RATES.danger) {
      alerts.push({
        severity: 'danger',
        title: '⚠️ Perte trop rapide',
        text: 'Tu perds ' + Math.round(lastLoss * 100) + '% de ton poids par semaine. '
          + 'Au-delà de 1.5%, tu risques de perdre du muscle. Ralentis le déficit.'
      });
    }
  }

  if (detectMuscleLoss()) {
    alerts.push({
      severity: 'danger',
      title: '🔴 Perte musculaire suspectée',
      text: 'Ton SRS est bon mais tes performances baissent. '
        + 'Signal de fonte musculaire. Augmente les protéines et réduis le déficit.'
    });
  }

  if (wc.competitionDate) {
    var daysToCompet = Math.floor(
      (new Date(wc.competitionDate) - Date.now()) / 86400000
    );
    if (daysToCompet === 2) {
      alerts.push({
        severity: 'info',
        title: '💧 J-2 avant compétition',
        text: 'Commence la rehydratation progressive. '
          + 'Les performances reviennent à 90-95% en 24-48h après réhydratation.'
      });
    }
    if (daysToCompet === 1) {
      alerts.push({
        severity: 'info',
        title: '🏆 J-1 : Protocole final',
        text: 'Dernier cut hydrique si nécessaire. '
          + 'Rehydratation complète cette nuit. Glucides élevés demain matin.'
      });
    }
  }

  return alerts;
}

// ── TOTAL LOAD MANAGEMENT — Secondary Activities (Feature: activities) ──────

var ACTIVITY_SPEC_COEFFICIENTS = {
  natation:          0.8,
  course:            1.2,
  trail:             1.4,
  randonnee:         1.0,
  velo:              1.0,
  yoga:              0.5,
  pilates:           0.5,
  ski:               1.3,
  arts_martiaux:     1.6,
  sports_collectifs: 1.5,
  autre:             1.0
};

var RECOVERY_ACTIVITIES = ['yoga', 'pilates'];
var RECOVERY_RPE_THRESHOLD = 3;

var ACTIVITY_INTERFERENCE_RULES = {
  natation: {
    shoulderVolumePenalty: 0.20,
    intensityThreshold: 6
  },
  course: {
    weeklyTRIMPLimit: 3 * 30 * 6 * 1.2,
    legVolumePenalty: 0.30
  },
  arts_martiaux: {
    incompatibleWithPhases: ['peak', 'intensification']
  }
};

var GARMIN_ZONE_WEIGHTS = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 6 };

var ACTIVITY_TRIMP_THRESHOLDS = {
  light:    150,
  moderate: 300,
  heavy:    400,
  critical: 600
};

function calcActivityTRIMP(activity) {
  if (!activity) return 0;
  var type = activity.type || 'autre';
  var duration = activity.duration || 45;
  var intensity = activity.intensity || 3;
  var rpe = intensity * 1.6;
  var cSpec = ACTIVITY_SPEC_COEFFICIENTS[type] || 1.0;

  if (RECOVERY_ACTIVITIES.includes(type) || rpe < RECOVERY_RPE_THRESHOLD) return 0;

  var trailBonus = 1.0;
  if (type === 'trail' && activity.elevGain) {
    trailBonus = 1 + (activity.elevGain / 1000);
  }

  return Math.round(duration * rpe * cSpec * trailBonus);
}

function getSecondaryTRIMPLast24h() {
  var activities = (db.user && db.user.activities) || [];
  var total = 0;
  var today = new Date().getDay();
  var yesterday = ((today - 1) + 7) % 7;
  var dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  var yesterdayName = dayNames[yesterday];

  activities.forEach(function(act) {
    if (!act.fixed) return;
    if ((act.days || []).includes(yesterdayName)) {
      total += calcActivityTRIMP(act);
    }
  });

  return total;
}

function getTodaySecondaryActivities() {
  var today = new Date().getDay();
  var dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  var todayName = dayNames[today];
  var activities = (db.user && db.user.activities) || [];
  return activities.filter(function(act) {
    return act.fixed && (act.days || []).includes(todayName);
  });
}

function getRecoveryBonus() {
  var yesterday = ((new Date().getDay() - 1) + 7) % 7;
  var dayNames = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  var yesterdayName = dayNames[yesterday];
  var activities = (db.user && db.user.activities) || [];
  var hasRecovery = activities.some(function(act) {
    return act.fixed
      && (act.days || []).includes(yesterdayName)
      && (RECOVERY_ACTIVITIES.includes(act.type) || (act.intensity || 5) <= 2);
  });
  return hasRecovery ? 0.05 : 0.0;
}

function calcTRIMPFromGarminZones(zonesData, activityType) {
  if (!zonesData) return 0;
  var cSpec = ACTIVITY_SPEC_COEFFICIENTS[activityType] || 1.0;
  var total = 0;
  Object.keys(zonesData).forEach(function(zone) {
    var minutes = zonesData[zone] || 0;
    var weight = GARMIN_ZONE_WEIGHTS[parseInt(zone)] || 1;
    total += minutes * weight;
  });
  return Math.round(total * cSpec);
}

function getActivityPenaltyFlags() {
  var trimp24h = getSecondaryTRIMPLast24h();
  var todayActivities = getTodaySecondaryActivities();
  var flags = [];

  if (trimp24h >= ACTIVITY_TRIMP_THRESHOLDS.heavy) {
    flags.push({
      type: 'volume',
      reduction: 1,
      removeAccessories: true,
      reason: 'Activité intense hier (' + trimp24h + ' TRIMP)'
    });
  } else if (trimp24h >= ACTIVITY_TRIMP_THRESHOLDS.moderate) {
    flags.push({
      type: 'volume',
      reduction: 0.5,
      removeAccessories: false,
      reason: 'Activité modérée hier (' + trimp24h + ' TRIMP)'
    });
  }

  todayActivities.forEach(function(act) {
    var phase = typeof wpDetectPhase === 'function' ? wpDetectPhase() : '';
    var rule = ACTIVITY_INTERFERENCE_RULES[act.type];
    if (rule && rule.incompatibleWithPhases && rule.incompatibleWithPhases.includes(phase)) {
      flags.push({
        type: 'warning',
        reason: (act.type === 'arts_martiaux' ? 'Arts martiaux' : act.type)
          + ' incompatible avec la phase ' + phase
          + '. Risque de saturation du SNC avant les tentatives lourdes.'
      });
    }
    if (act.type === 'natation' && rule && (act.intensity || 0) > rule.intensityThreshold) {
      flags.push({
        type: 'shoulder',
        reduction: rule.shoulderVolumePenalty,
        reason: 'Natation intense → volume accessoires épaules réduit de 20%'
      });
    }
  });

  return { trimp24h: trimp24h, flags: flags };
}

function getDominantTrainingMode() {
  var activities = (db.user && db.user.activities) || [];
  var secondaryTRIMPWeekly = activities.reduce(function(total, act) {
    if (!act.fixed) return total;
    var daysPerWeek = (act.days || []).length;
    return total + calcActivityTRIMP(act) * daysPerWeek;
  }, 0);

  var muscuSessionsPerWeek = (db.user && db.user.programParams && db.user.programParams.freq) || 4;
  var muscuTRIMPWeekly = muscuSessionsPerWeek * 300;
  var secondaryRatio = secondaryTRIMPWeekly / (secondaryTRIMPWeekly + muscuTRIMPWeekly + 1);

  if (secondaryRatio > 0.5) return 'cardio_dominant';
  if (secondaryRatio > 0.3) return 'balanced';
  return 'strength_dominant';
}

function checkSwimmingInterference() {
  var activities = (db.user && db.user.activities) || [];
  var swimActivity = activities.find(function(a) { return a.type === 'natation'; });
  if (!swimActivity) return null;

  var weeklySwimTRIMP = calcActivityTRIMP(swimActivity) * (swimActivity.days || []).length;
  var weeklyMuscuTRIMP = ((db.user && db.user.programParams && db.user.programParams.freq) || 4) * 300;

  if (weeklySwimTRIMP > weeklyMuscuTRIMP * 0.30) {
    return {
      severity: 'warning',
      msg: 'Ton volume de natation (' + Math.round(weeklySwimTRIMP) + ' TRIMP/sem) '
        + 'représente plus de 30% de ta charge totale. '
        + 'Risque d\'interférence avec la progression au Bench Press.'
    };
  }
  return null;
}

// ── DUP REGISTERS — Zone-specific e1RM tracking ──────────────────────────────
// Option B : sous-objet zones dans db.exercises (rétrocompatibilité garantie)
// Tethering : Force et Hypertrophie ne peuvent diverger de plus de 15%

function getDUPZone(targetReps) {
  if (!targetReps || targetReps <= 5) return 'force';
  if (targetReps <= 12) return 'hypertrophie';
  return 'vitesse';
}

function getZoneE1RM(exoName, zone) {
  var exo = db.exercises && db.exercises[exoName];
  if (!exo) return 0;
  if (exo.zones && exo.zones[zone] && exo.zones[zone].e1rm > 0) {
    return exo.zones[zone].e1rm;
  }
  return exo.e1rm || exo.shadowWeight || 0;
}

function applyDUPTethering(exoName) {
  var exo = db.exercises && db.exercises[exoName];
  if (!exo || !exo.zones) return;
  var z = exo.zones;
  var forceE1RM = z.force && z.force.e1rm || 0;
  var hypertE1RM = z.hypertrophie && z.hypertrophie.e1rm || 0;
  if (!forceE1RM || !hypertE1RM) return;
  if (forceE1RM > hypertE1RM * 1.15) {
    z.hypertrophie.e1rm = Math.round(forceE1RM * 0.85 / 2.5) * 2.5;
  }
  if (hypertE1RM > forceE1RM) {
    z.force.e1rm = Math.round(hypertE1RM * 1.02 / 2.5) * 2.5;
    exo.e1rm = z.force.e1rm;
  }
}

function setZoneE1RM(exoName, zone, newE1RM) {
  if (!exoName || !zone || !(newE1RM > 0)) return;
  if (!db.exercises) db.exercises = {};
  if (!db.exercises[exoName]) db.exercises[exoName] = {};
  var exo = db.exercises[exoName];
  if (!exo.zones) {
    var legacyE1RM = exo.e1rm || exo.shadowWeight || newE1RM;
    exo.zones = {
      force:        { e1rm: Math.round(legacyE1RM * 1.00 / 2.5) * 2.5, shadowWeight: 0, sessionsCount: 0 },
      hypertrophie: { e1rm: Math.round(legacyE1RM * 0.94 / 2.5) * 2.5, shadowWeight: 0, sessionsCount: 0 },
      vitesse:      { e1rm: Math.round(legacyE1RM * 0.88 / 2.5) * 2.5, shadowWeight: 0, sessionsCount: 0 }
    };
  }
  if (!exo.zones[zone]) {
    exo.zones[zone] = { e1rm: 0, shadowWeight: 0, sessionsCount: 0 };
  }
  exo.zones[zone].e1rm = Math.round(newE1RM / 2.5) * 2.5;
  exo.zones[zone].sessionsCount = (exo.zones[zone].sessionsCount || 0) + 1;
  exo.e1rm = Math.max(
    (exo.zones.force && exo.zones.force.e1rm) || 0,
    (exo.zones.hypertrophie && exo.zones.hypertrophie.e1rm) || 0,
    (exo.zones.vitesse && exo.zones.vitesse.e1rm) || 0
  );
  applyDUPTethering(exoName);
}

function getActiveZoneForPhase() {
  var phase = typeof wpDetectPhase === 'function' ? wpDetectPhase() : 'accumulation';
  var zoneMap = {
    intro: 'hypertrophie', accumulation: 'hypertrophie', hypertrophie: 'hypertrophie',
    force: 'force', intensification: 'force', peak: 'force',
    deload: 'hypertrophie', recuperation: 'hypertrophie'
  };
  return zoneMap[phase] || 'hypertrophie';
}
