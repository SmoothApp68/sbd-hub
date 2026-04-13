// ============================================================
// constants.js — Constantes globales pour sbd-hub
// ============================================================

// Clé de stockage local
const STORAGE_KEY = 'SBD_HUB_V29';

// Jours de la semaine
const DAYS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// Types d'exercices SBD
const SBD_TYPES = ['bench', 'squat', 'deadlift'];

// Configuration du radar musculaire
const RADAR_CONFIG = [
  { label: 'Dos', key: 'Dos', color: '#FF9F0A' },
  { label: 'Torse', key: 'Pecs', color: '#0A84FF' },
  { label: 'Tronc', key: 'Abdos', color: '#FF453A' },
  { label: 'Jambes', key: 'Jambes', color: '#32D74B' },
  { label: 'Bras', key: 'Bras', color: '#64D2FF' },
  { label: 'Épaules', key: 'Épaules', color: '#BF5AF2' }
];

// Mots-clés pour les variantes d'exercices
const VARIANT_KEYWORDS = ['pause', 'spoto', 'deficit', 'board'];

// Temps de vie des rapports (7 jours)
const REPORT_TTL_MS = 7 * 86400000;

// Repères de volume (sets/semaine par groupe musculaire)
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
  'Pecs': 'chest', 'Pecs (haut)': 'chest', 'Pecs (bas)': 'chest',
  'Dos': 'back', 'Dorsaux': 'back', 'Lats': 'back', 'Grand dorsal': 'back', 'Haut du dos': 'back', 'Lombaires': 'back',
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

// Routine par défaut (fallback si pas de profil)
const DEFAULT_ROUTINE = {
  Lundi:    '🦵 Squat & Jambes',
  Mardi:    '💪 Bench & Push',
  Mercredi: '🏊 Récupération / Cardio',
  Jeudi:    '🔙 Deadlift & Pull',
  Vendredi: '🎯 Points Faibles',
  Samedi:   '⚡ SBD Technique',
  Dimanche: '😴 Repos Complet'
};

// Liste noire des noms de séance à ignorer
const SESSION_NAME_BLACKLIST = /^(dos$|dos\s|bonsoir|cul$|biceps$|épaules$|avant-bras$|devenue|push$|pull$|leg\s*day|jambes$|dos\s*&|dos\s*et\s|dos\s*wtf|dos\s*faa|dos\s*en\s*spe|dos\s*🔥|dos\s*avec)/i;