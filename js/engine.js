// ============================================================
// engine.js — Pure computation, constants, exercise matching
// ============================================================

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const STORAGE_KEY='SBD_HUB_V29';
const DAYS_FULL=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const DAYS_SHORT=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const SBD_TYPES=['bench','squat','deadlift'];
const RADAR_CONFIG=[{label:'Dos',key:'Dos',color:'#FF9F0A'},{label:'Torse',key:'Pecs',color:'#0A84FF'},{label:'Tronc',key:'Abdos',color:'#FF453A'},{label:'Jambes',key:'Jambes',color:'#32D74B'},{label:'Bras',key:'Bras',color:'#64D2FF'},{label:'Épaules',key:'Épaules',color:'#BF5AF2'}];
const VARIANT_KEYWORDS=['pause','spoto','deficit','board'];
const REPORT_TTL_MS=7*86400000;

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
function calcTDEE(bw, tonnage7d) {
  if (!bw || bw <= 0) return 0;
  const bmr = 88.362 + 13.397 * bw + 4.799 * 182 - 5.677 * 25;
  let actFactor = 1.55;
  if (tonnage7d > 40000) actFactor = 1.60;
  else if (tonnage7d > 20000) actFactor = 1.57;
  else if (tonnage7d < 3000) actFactor = 1.40;
  return Math.round(bmr * actFactor);
}
function calcCalorieCible(bw) {
  const kcalBase = db.user.kcalBase || 2300;
  const bwBase   = db.user.bwBase   || 98;
  if (!bw || bw <= 0) return kcalBase;
  return Math.round(kcalBase * (bw / bwBase));
}
function calcMacrosCibles(kcalCible, bw) {
  const prot = Math.round(bw * 1.95);
  const fat  = Math.round(bw * 0.73);
  const carb = Math.max(0, Math.round((kcalCible - prot*4 - fat*9) / 4));
  return { prot, carb, fat, kcal: kcalCible };
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
      const workSets = (exo.sets || exo.setCount || 0);
      const setCount = typeof workSets === 'number' ? workSets : (Array.isArray(workSets) ? workSets.filter(function(s){ return !s.isWarmup; }).length : 0);
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
