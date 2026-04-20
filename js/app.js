// ============================================================
// app.js — DB, UI, rendering, navigation, init
// ============================================================

// ============================================================
// UI Adaptative — t() et shouldShow()
// ============================================================
function t(key, value, opts) {
  var level = db ? (db.user.level || 'intermediaire') : 'intermediaire';
  var mode = db ? (db.user.trainingMode || 'powerlifting') : 'powerlifting';
  var detail = db ? (db.user.uiDetail || 'auto') : 'auto';
  if (detail === 'simple') level = 'debutant';
  else if (detail === 'expert') level = 'competiteur';

  var isBeginner = (detail === 'auto') ? (level === 'debutant' || mode === 'bien_etre') : (detail === 'simple');
  var isAdvanced = (detail === 'auto') ? (level === 'avance' || level === 'competiteur') : (detail === 'expert');

  if (key === 'rpe') {
    if (isBeginner) {
      if (value <= 5) return 'Très facile 😌';
      if (value <= 6) return 'Effort léger 😌';
      if (value <= 7) return 'Effort modéré 😊';
      if (value <= 8) return 'Effort soutenu 💪';
      if (value <= 9) return 'Effort intense 🔥';
      return 'Maximum 🔥🔥';
    }
    if (isAdvanced) return 'RPE ' + value;
    return 'RPE ' + value + ' (' + Math.max(0, 10 - Math.round(value)) + ' reps en réserve)';
  }
  if (key === 'sets_reps') {
    var s = value, r = opts;
    if (isBeginner) return s + ' séries de ' + r + ' répétitions';
    return s + '×' + r;
  }
  if (key === 'deload') {
    if (isBeginner) return 'Semaine de récupération 🧘';
    return 'Semaine de deload';
  }
  if (key === 'mesocycle') {
    if (isBeginner) return 'Cycle de ' + (value || 4) + ' semaines';
    return 'Mésocycle';
  }
  if (key === 'progressive_overload') {
    if (isBeginner) return 'On augmente un peu chaque semaine';
    return 'Surcharge progressive';
  }
  if (key === 'compliance') {
    if (isBeginner) return value + ' séances sur ' + (opts || '?') + ' prévues 👏';
    return 'Compliance : ' + Math.round(value) + '%';
  }
  return String(value);
}

function shouldShow(feature) {
  var level = db ? (db.user.level || 'intermediaire') : 'intermediaire';
  var mode = db ? (db.user.trainingMode || 'powerlifting') : 'powerlifting';
  var detail = db ? (db.user.uiDetail || 'auto') : 'auto';
  if (detail === 'simple') level = 'debutant';
  else if (detail === 'expert') level = 'competiteur';

  var rules = {
    dots_wilks:      ['avance', 'competiteur'],
    e1rm_detail:     ['intermediaire', 'avance', 'competiteur'],
    rpe_number:      ['intermediaire', 'avance', 'competiteur'],
    sbd_total:       ['intermediaire', 'avance', 'competiteur'],
    mev_mav_mrv:     ['avance', 'competiteur'],
    strength_ratios: ['intermediaire', 'avance', 'competiteur'],
    volume_numbers:  ['intermediaire', 'avance', 'competiteur'],
    ipf_score:       ['avance', 'competiteur'],
    mesocycle_label: ['avance', 'competiteur'],
    tonnage_detail:  ['intermediaire', 'avance', 'competiteur'],
  };
  var allowed = rules[feature];
  if (!allowed) return true;
  return allowed.indexOf(level) >= 0;
}

// ============================================================
// DB
// ============================================================
const defaultDB = () => ({
  user: { name: '', bw: 0, targets: { bench: 100, squat: 120, deadlift: 140 }, level: 'intermediaire', gender: 'unspecified', onboarded: false, kcalBase: 2300, bwBase: 80, trainingMode: null },
  routine: null, logs: [], bestPR: { bench: 0, squat: 0, deadlift: 0 }, reports: [], body: [], lastSync: 0,
  keyLifts: [],
  weeklyChallenges: null,
  monthlyChallenges: null,
  secretQuestsCompleted: [],
  questHistory: [],
  questStreak: 0,
  seenBadges: [],
  unlockedTitles: [],
  activeTitle: null,
  passwordMigrated: false,
  friendCode: null,
  friends: [],
  social: {
    profileId: null,
    username: '',
    bio: '',
    visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' },
    onboardingCompleted: false,
    usernameChangedAt: null
  }
});
let db = (() => {
  try {
    // Migration automatique : chercher dans les clés connues
    const FALLBACK_KEYS = ['SBD_HUB_V28', 'SBD_HUB_V27', 'SBD_HUB_V26', 'SBD_HUB'];
    if (!localStorage.getItem(STORAGE_KEY)) {
      for (const k of FALLBACK_KEYS) {
        const old = localStorage.getItem(k);
        if (old) {
          try {
            const parsed = JSON.parse(old);
            if (parsed.logs && parsed.user) {
              localStorage.setItem(STORAGE_KEY, old);
              console.log('[Migration] Données migrées de', k, 'vers', STORAGE_KEY);
              break;
            }
          } catch(e) {}
        }
      }
    }
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return defaultDB();
    const p = JSON.parse(s);
    if (!p.logs || !p.user) return defaultDB();
    if (!p.reports) p.reports = [];
    if (!p.routine) p.routine = null;
    if (!p.body) p.body = [];
    if (!p.keyLifts) p.keyLifts = [];
    if (p.user.name === undefined) p.user.name = '';
    if (p.user.onboarded === undefined) p.user.onboarded = true;
    if (!p.user.gender) p.user.gender = 'unspecified';
    if (p.user.trainingMode === undefined) p.user.trainingMode = 'powerlifting';
    // Migrations modes : bodybuilding → musculation, force_athletique → powerlifting
    if (p.user.trainingMode === 'bodybuilding') p.user.trainingMode = 'musculation';
    if (p.user.trainingMode === 'force_athletique') p.user.trainingMode = 'powerlifting';
    // Migration one-shot : Aurélien → powerbuilding (supprimer après déploiement semaine 1)
    if (!p._migPBMode && p.user.trainingMode === 'powerlifting') {
      var _n = (p.user.name || '').toLowerCase();
      if (_n.indexOf('aurél') >= 0 || _n.indexOf('aurel') >= 0) {
        p.user.trainingMode = 'powerbuilding';
        p._migPBMode = true;
      }
    }
    if (!p.monthlyChallenges) p.monthlyChallenges = null;
    if (!p.secretQuestsCompleted) p.secretQuestsCompleted = [];
    if (!p.questHistory) p.questHistory = [];
    if (p.questStreak === undefined) p.questStreak = 0;
    if (!p.seenBadges) p.seenBadges = [];
    if (!p.unlockedTitles) p.unlockedTitles = [];
    if (p.activeTitle === undefined) p.activeTitle = null;
    if (!p.social) p.social = { profileId: null, username: '', bio: '', visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' }, onboardingCompleted: false, usernameChangedAt: null };
    if (!p.social.visibility) p.social.visibility = { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' };
    if (p.passwordMigrated === undefined) p.passwordMigrated = false;
    if (!p.friendCode) p.friendCode = null;
    if (!p.friends) p.friends = [];
    if (!p.readiness) p.readiness = [];
    if (!p.challenges) p.challenges = [];
    return p;
  } catch { return defaultDB(); }
})();

let selectedDay = 'Lundi', chartSBD = null, chartSBDs = [], chartVolume = null, newPRs = { bench: false, squat: false, deadlift: false };
var sbdChartMode = 'bars';
let chartPerf = null;
let perfChartMode = 'bars';
let perfSelectedLift = null; // nom de l'exercice sélectionné en mode Progression
let activeStatsSub = 'stats-volume';
let currentWeekOffset = 0;
let sparklineCharts = {};
let currentMuscleView = 'bars';
let chartMuscleEvol = null;
let liftsMuscleFilter = 'Tout';
let activeWorkout = null;
let _goSessionTimerId = null;
let _goRestTimerId = null;
let _goAutoSaveId = null;
let _goWakeLock = null;
let _goSessionPaused = false;

// Chart memory management — destroy charts of inactive tabs
var _currentTab = 'tab-dash';
function _destroyTabCharts(tabId) {
  if (tabId === 'tab-dash') {
    if (chartPerf && typeof chartPerf.destroy === 'function') { chartPerf.destroy(); chartPerf = null; }
    if (window.chartPerfLine && typeof window.chartPerfLine.destroy === 'function') { window.chartPerfLine.destroy(); window.chartPerfLine = null; }
    if (window._chartPerfLine && typeof window._chartPerfLine.destroy === 'function') { window._chartPerfLine.destroy(); window._chartPerfLine = null; }
    if (chartSBD && typeof chartSBD.destroy === 'function') { chartSBD.destroy(); chartSBD = null; }
    if (chartVolume && typeof chartVolume.destroy === 'function') { chartVolume.destroy(); chartVolume = null; }
  }
  if (tabId === 'tab-stats') {
    if (chartMuscleEvol && typeof chartMuscleEvol.destroy === 'function') { chartMuscleEvol.destroy(); chartMuscleEvol = null; }
  }
}

// Routine active : perso (db.routine) > généré (db.generatedProgram) > template > rien
function getRoutine() {
  // Priorité 1 : routine personnalisée (modifiée dans Réglages > Mon Programme)
  if (db.routine && Object.keys(db.routine).length > 0) return db.routine;
  // Priorité 2 : routine générée à l'onboarding
  if (db.generatedProgram && db.generatedProgram.length > 0) {
    const r = {};
    db.generatedProgram.forEach(d => { r[d.day] = d.isRest ? '😴 Repos' : (d.label || d.day); });
    return r;
  }
  // Priorité 3 : template par défaut selon le mode
  const style = modeFeature('programStyle');
  if (style && ROUTINE_TEMPLATES[style]) return ROUTINE_TEMPLATES[style].routine;
  return DEFAULT_ROUTINE;
}

var _saveDBTimer = null;
var _saveDBDirty = false;

function saveDB() {
  clearCaches();
  _saveDBDirty = true;
  if (_saveDBTimer) return; // already scheduled
  _saveDBTimer = setTimeout(function() {
    _saveDBTimer = null;
    _flushDB();
  }, 2000);
  debouncedCloudSync();
}

function saveDBNow() {
  clearCaches();
  if (_saveDBTimer) { clearTimeout(_saveDBTimer); _saveDBTimer = null; }
  _saveDBDirty = true;
  _flushDB();
  debouncedCloudSync();
}

function _flushDB() {
  if (!_saveDBDirty) return;
  _saveDBDirty = false;
  try {
    if (!db.gamification) db.gamification = {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch(e) {
    console.error('saveDB error:', e);
  }
}

// Flush before leaving/hiding the page
window.addEventListener('beforeunload', _flushDB);
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') _flushDB();
});
function debouncedCloudSync() { if (!cloudSyncEnabled) return; clearTimeout(syncDebounceTimer); syncDebounceTimer = setTimeout(() => { syncToCloud(true); }, 2000); }
function generateId() { return Math.random().toString(36).substr(2, 9); }

// ── GAMIFICATION — defensive init ───────────────────────────
db.gamification = db.gamification || {};
db.gamification.streakFreezes = db.gamification.streakFreezes ?? 1;
db.gamification.lastFreezeGrantedMonth = db.gamification.lastFreezeGrantedMonth ?? -1;
db.gamification.freezesUsedAt = db.gamification.freezesUsedAt ?? [];
db.gamification.freezeActiveThisWeek = db.gamification.freezeActiveThisWeek ?? false;
db.gamification.playerClass = db.gamification.playerClass ?? null;
db.gamification.quizAnswers = db.gamification.quizAnswers ?? [];
db.gamification.quizCompletedAt = db.gamification.quizCompletedAt ?? null;
db.gamification.liftRanks = db.gamification.liftRanks || null;

// ── READINESS PRÉ-SÉANCE ────────────────────────────────────
db.readiness = db.readiness || [];

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function hasTodayReadiness() {
  const today = getTodayStr();
  return (db.readiness || []).some(r => r.date === today);
}

function isTodayTrainingDay() {
  const routine = getRoutine();
  const todayName = DAYS_FULL[new Date().getDay()];
  const label = routine[todayName] || '';
  return label && !/repos|😴/i.test(label);
}

function getTodayReadiness() {
  const today = getTodayStr();
  return (db.readiness || []).find(r => r.date === today) || null;
}

function showReadinessModal(onComplete) {
  if (hasTodayReadiness()) { if (onComplete) onComplete(); return; }
  _readinessOnComplete = onComplete || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'readinessModal';
  overlay.innerHTML = `<div class="modal-box" style="max-width:360px;padding:20px;">
    <div style="font-size:16px;font-weight:700;margin-bottom:14px;text-align:center;">Comment te sens-tu ?</div>
    <div class="readiness-sliders">
      <div class="readiness-row"><span>😴 Sommeil</span><input type="range" min="1" max="10" value="5" id="rd-sleep"><span id="rd-sleep-val">5</span></div>
      <div class="readiness-row"><span>⚡ Énergie</span><input type="range" min="1" max="10" value="5" id="rd-energy"><span id="rd-energy-val">5</span></div>
      <div class="readiness-row"><span>🧠 Motivation</span><input type="range" min="1" max="10" value="5" id="rd-motivation"><span id="rd-motivation-val">5</span></div>
      <div class="readiness-row"><span>🦵 Courbatures</span><input type="range" min="1" max="10" value="5" id="rd-soreness"><span id="rd-soreness-val">5</span></div>
    </div>
    <div style="font-size:10px;color:var(--sub);text-align:center;margin:4px 0;">1 = mauvais · 10 = excellent (courbatures : 10 = très courbaturé)</div>
    <div id="rd-score-preview" style="text-align:center;font-size:13px;font-weight:700;margin:8px 0;color:var(--blue);">Score : —</div>
    <div id="rd-adj-preview" style="text-align:center;font-size:11px;color:var(--sub);margin-bottom:8px;"></div>
    <div class="modal-actions">
      <button class="modal-cancel" style="background:var(--sub);color:#000;" onclick="skipReadiness()">Passer</button>
      <button class="modal-confirm" style="background:var(--green);color:#000;" onclick="submitReadiness()">Valider</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  ['sleep','energy','motivation','soreness'].forEach(k => {
    const slider = document.getElementById('rd-'+k);
    slider.oninput = () => {
      document.getElementById('rd-'+k+'-val').textContent = slider.value;
      updateReadinessPreview();
    };
  });
  updateReadinessPreview();
}

function updateReadinessPreview() {
  const sleep = parseInt(document.getElementById('rd-sleep')?.value || 5);
  const energy = parseInt(document.getElementById('rd-energy')?.value || 5);
  const motivation = parseInt(document.getElementById('rd-motivation')?.value || 5);
  const soreness = parseInt(document.getElementById('rd-soreness')?.value || 5);
  const score = calculateReadiness(sleep, energy, motivation, soreness);
  const adj = getReadinessLoadAdjustment(score);
  const pctStr = adj >= 1 ? '+' + Math.round((adj - 1) * 100) + '%' : Math.round((adj - 1) * 100) + '%';
  const el = document.getElementById('rd-score-preview');
  const adjEl = document.getElementById('rd-adj-preview');
  if (el) el.textContent = 'Score readiness : ' + score + '%';
  if (el) el.style.color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--blue)' : 'var(--orange)';
  if (adjEl) adjEl.textContent = adj === 1 ? 'Charges inchangées' : 'Charges ajustées : ' + pctStr;
}

// Calcul readiness pondéré (Helms 2018, Zourdos 2016)
function calculateReadiness(sleep, energy, motivation, soreness) {
  const sorenessInverted = 11 - soreness;
  return Math.min(100, Math.max(0, Math.round(
    (sleep * 0.35 + energy * 0.25 + motivation * 0.15 + sorenessInverted * 0.25) * 10
  )));
}

// Ajustement charge selon readiness (Tuchscherer RPE system, Helms 2018)
function getReadinessLoadAdjustment(readinessScore) {
  if (readinessScore >= 90) return 1.03;
  if (readinessScore >= 80) return 1.00;
  if (readinessScore >= 70) return 0.97;
  if (readinessScore >= 60) return 0.93;
  if (readinessScore >= 50) return 0.90;
  if (readinessScore >= 40) return 0.85;
  return 0.80;
}

let _readinessOnComplete = null;

function skipReadiness() {
  const modal = document.getElementById('readinessModal');
  if (modal) modal.remove();
  if (_readinessOnComplete) { _readinessOnComplete(); _readinessOnComplete = null; }
}

function submitReadiness() {
  const sleep = parseInt(document.getElementById('rd-sleep').value);
  const energy = parseInt(document.getElementById('rd-energy').value);
  const motivation = parseInt(document.getElementById('rd-motivation')?.value || document.getElementById('rd-stress')?.value || 5);
  const soreness = parseInt(document.getElementById('rd-soreness').value);
  const score = calculateReadiness(sleep, energy, motivation, soreness);
  const adj = getReadinessLoadAdjustment(score);
  // Stocker dans db.readiness (rétrocompat)
  db.readiness.push({ date: getTodayStr(), sleep, energy, motivation, soreness, score });
  // Stocker dans l'historique readiness (90 jours)
  if (!db.readinessHistory) db.readinessHistory = [];
  db.readinessHistory.push({ ts: Date.now(), sleep, energy, motivation, soreness, score });
  db.readinessHistory = db.readinessHistory.slice(-90);
  saveDB();
  // Stocker dans la séance active si elle existe
  if (activeWorkout) {
    activeWorkout.readiness = { sleep, energy, motivation, soreness, score, loadAdjustment: adj };
  }
  const modal = document.getElementById('readinessModal');
  if (modal) modal.remove();
  const adjMsg = adj === 1 ? '' : (adj > 1 ? ' (+' + Math.round((adj-1)*100) + '% charges)' : ' (' + Math.round((adj-1)*100) + '% charges)');
  showToast('✅ Readiness : ' + score + '/100' + adjMsg);
  if (_readinessOnComplete) { _readinessOnComplete(); _readinessOnComplete = null; }
}

function getReadinessBannerHtml() {
  const r = getTodayReadiness();
  if (!r) return '';
  var detail = '<div class="readiness-detail" style="display:none;margin-top:6px;font-size:11px;line-height:1.6;opacity:0.85;">' +
    '😴 Sommeil : ' + r.sleep + '/5 · ⚡ Énergie : ' + r.energy + '/5 · 💪 Courbatures : ' + r.soreness + '/5 · 🧠 Stress : ' + r.stress + '/5<br>' +
    'Score : (' + r.sleep + '+' + r.energy + '+' + r.soreness + '+' + r.stress + ') / 20 × 100 = ' + r.score + '/100' +
    '</div>';
  var toggleBtn = ' <span class="glossary-tip" onclick="event.stopPropagation();var d=this.parentElement.querySelector(\'.readiness-detail\');d.style.display=d.style.display===\'none\'?\'block\':\'none\';">ℹ️</span>';
  if (r.score < 40) return '<div style="background:rgba(255,69,58,0.15);border-left:3px solid var(--red);padding:8px 12px;margin:8px 0;border-radius:8px;font-size:12px;color:var(--red);">⚠️ Readiness faible (' + r.score + '/100) — séance allégée recommandée (volume -40%, charge -15%)' + toggleBtn + detail + '</div>';
  if (r.score < 60) return '<div style="background:rgba(255,159,10,0.12);border-left:3px solid var(--orange);padding:8px 12px;margin:8px 0;border-radius:8px;font-size:12px;color:var(--orange);">Readiness modérée (' + r.score + '/100) — charge maintenue, volume réduit (-1 set/exo)' + toggleBtn + detail + '</div>';
  if (r.score >= 80) return '<div style="background:rgba(50,215,75,0.12);border-left:3px solid var(--green);padding:8px 12px;margin:8px 0;border-radius:8px;font-size:12px;color:var(--green);">Readiness excellente (' + r.score + '/100) — go ! 💪' + toggleBtn + detail + '</div>';
  if (r.score >= 60) return '<div style="background:rgba(255,255,255,0.05);border-left:3px solid var(--sub);padding:8px 12px;margin:8px 0;border-radius:8px;font-size:12px;color:var(--text);">Readiness correcte (' + r.score + '/100) — programme normal' + toggleBtn + detail + '</div>';
  return '';
}

// ── GLOSSAIRE & TRANSPARENCE ────────────────────────────────
const GLOSSARY = {
  rpe: {
    short: "RPE (Rate of Perceived Exertion)",
    desc: "Échelle de 1 à 10 qui mesure l'effort ressenti. RPE 7 = tu aurais pu faire 3 reps de plus. RPE 10 = impossible d'en faire une de plus.",
    example: "Si tu fais 5 reps et que tu aurais pu en faire 2 de plus → RPE 8.",
    category: "bases"
  },
  e1rm: {
    short: "e1RM (1RM estimé)",
    desc: "Le poids maximum que tu pourrais soulever 1 seule fois, estimé à partir de tes séries. Calculé avec la formule d'Epley : poids × (1 + reps / 30).",
    example: "100kg × 5 reps → e1RM ≈ 117kg",
    category: "performance"
  },
  mev: {
    short: "MEV (Volume Minimum Efficace)",
    desc: "Le nombre minimum de séries par semaine pour qu'un muscle progresse. En dessous, tu maintiens mais tu ne grandis pas.",
    example: "MEV pecs = 8 séries/semaine. Si tu fais 6 → pas assez pour progresser.",
    category: "volume"
  },
  mav: {
    short: "MAV (Volume Adaptatif Maximum)",
    desc: "La zone de volume optimale pour progresser. C'est le sweet spot entre 'pas assez' et 'trop'.",
    example: "MAV pecs = 14 séries/semaine. C'est là que la croissance musculaire est maximale.",
    category: "volume"
  },
  mrv: {
    short: "MRV (Volume Maximum Récupérable)",
    desc: "Le volume maximum que ton corps peut encaisser et dont il peut récupérer. Au-delà, tu accumules de la fatigue sans bénéfice.",
    example: "MRV pecs = 20 séries/semaine. Au-delà, risque de surmenage et de blessure.",
    category: "volume"
  },
  dots: {
    short: "DOTS Score",
    desc: "Score qui compare ta force relative à ton poids de corps. Remplace le Wilks depuis 2020. Plus le score est haut, plus tu es fort pour ton poids.",
    calc: "DOTS = (500 / coefficient) × total. Le coefficient dépend de ton poids de corps et de ton sexe. Un DOTS > 400 = niveau national.",
    example: "Total 520kg à 98kg de poids de corps → DOTS ≈ 387 (niveau avancé).",
    category: "performance"
  },
  wilks: {
    short: "Wilks Score",
    desc: "Ancien score de force relative (utilisé avant 2020, encore populaire). Même principe que le DOTS mais avec des coefficients différents.",
    calc: "Wilks = (500 / coefficient) × total. Coefficient polynomial basé sur le poids de corps.",
    example: "Total 520kg à 98kg → Wilks ≈ 342.",
    category: "performance"
  },
  deload: {
    short: "Deload (semaine de récupération)",
    desc: "Semaine où on réduit volontairement le volume (-40%) et la charge (-15 à 20%) pour laisser le corps récupérer. Ça permet de repartir plus fort ensuite.",
    example: "Après 4 semaines d'entraînement intensif, 1 semaine de deload pour dissiper la fatigue.",
    category: "recuperation"
  },
  mesocycle: {
    short: "Mésocycle",
    desc: "Bloc d'entraînement de 4 à 6 semaines avec une progression planifiée. Chaque semaine est un peu plus intense que la précédente, puis on récupère.",
    example: "Semaine 1 : base → Semaine 2 : montée → Semaine 3 : pic → Semaine 4 : peak → Semaine 5 : deload.",
    category: "recuperation"
  },
  readiness: {
    short: "Score de Readiness",
    desc: "Indique à quel point ton corps est prêt à s'entraîner aujourd'hui, sur 100.",
    calc: "Moyenne de 4 critères notés de 1 à 5 : sommeil, énergie, douleurs (inversé), stress. Score = (somme / 20) × 100.",
    example: "Sommeil 4/5 + Énergie 3/5 + Douleurs 4/5 + Stress 3/5 = 14/20 → Readiness 70/100.",
    category: "recuperation"
  },
  form_score: {
    short: "Score de Forme",
    desc: "Score global de 0 à 100 qui résume ton état actuel en combinant plusieurs facteurs.",
    calc: "Score = Readiness moy. 7j (×20%) + Compliance programme (×25%) + Tendance force (×20%) + Récupération musculaire (×15%) + Régularité nutrition (×10%) + Qualité sommeil (×10%).",
    example: "Readiness 70 × 0.20 + Compliance 80 × 0.25 + Tendance +1 × 0.20 + Récupération 60 × 0.15 + Nutrition 50 × 0.10 + Sommeil 70 × 0.10 = 68/100.",
    category: "scores"
  },
  pr_prediction: {
    short: "Prédiction de PR",
    desc: "Estimation de quand tu atteindras ton objectif de poids, basée sur ta progression actuelle.",
    calc: "1. Progression hebdomadaire en kg (régression linéaire sur 6 dernières séances). 2. Écart entre e1RM actuel et objectif. 3. Semaines = écart ÷ progression/semaine. 4. Confiance (%) = R² de la régression (régularité de la progression).",
    example: "e1RM 140kg, objectif 160kg, progression +1.84 kg/sem → ~11 semaines. R² = 0.16 → confiance 16%.",
    category: "scores"
  },
  tonnage: {
    short: "Tonnage",
    desc: "Le poids total soulevé pendant une séance ou une semaine. C'est la somme de (poids × reps) pour chaque série.",
    calc: "Tonnage = Σ (poids × reps) pour chaque série de travail.",
    example: "Squat : 100kg × 5 × 4 séries = 2000kg. Bench : 80kg × 8 × 3 = 1920kg. Total séance = 3920kg ≈ 3.9 tonnes.",
    category: "performance"
  },
  compliance: {
    short: "Compliance (adhérence)",
    desc: "Le pourcentage de séances que tu as réellement faites par rapport à ce qui était prévu.",
    calc: "Compliance = (séances réalisées ÷ séances prévues) × 100.",
    example: "4 séances prévues, 3 réalisées → Compliance = 75%.",
    category: "scores"
  },
  progressive_overload: {
    short: "Surcharge progressive",
    desc: "Le principe fondamental de la progression : augmenter progressivement la difficulté (poids, reps, ou séries) pour forcer le corps à s'adapter.",
    example: "Semaine 1 : 60kg × 10. Semaine 2 : 62.5kg × 10. Semaine 3 : 62.5kg × 12. Semaine 4 : 65kg × 10.",
    category: "bases"
  },
  load_pct: {
    short: "Pourcentage de charge (LOAD_PCT)",
    desc: "Le pourcentage de ton max estimé utilisé comme charge de travail. Change chaque semaine du mésocycle.",
    calc: "Semaine 1 : 88% | Semaine 2 : 92% | Semaine 3 : 96% | Semaine 4 : 100%. Ajusté par le niveau.",
    example: "e1RM squat = 150kg. Semaine 2 (92%) pour 5 reps : charge Epley = 150 × 0.889 = 133kg × 0.92 = 122.5kg.",
    category: "formules"
  },
  epley: {
    short: "Formule d'Epley",
    desc: "Formule mathématique pour estimer ton 1RM à partir d'une série de plusieurs reps.",
    calc: "e1RM = poids × (1 + reps ÷ 30). Inversement : poids = e1RM × (1.0278 − 0.0278 × reps cibles).",
    example: "100kg × 5 reps → e1RM = 100 × 1.167 = 116.7kg. Limites : moins précis au-delà de 10 reps.",
    category: "formules"
  },
  fatigue_index: {
    short: "Indice de fatigue musculaire",
    desc: "Estime à quel point un muscle est fatigué, de 0% (frais) à 100% (surentraîné).",
    calc: "Pour chaque séance des 7 derniers jours, on compte les séries pondérées par la contribution musculaire, avec décroissance exponentielle (demi-vie 48h). Normalisé par rapport au MRV.",
    example: "Pecs : 12 séries avec décroissance → score 65%. Entraîné hier = plus fatigué qu'il y a 3 jours.",
    category: "recuperation"
  },
  strength_ratios: {
    short: "Ratios de force",
    desc: "Comparaison entre tes performances sur différents exercices pour détecter des déséquilibres musculaires.",
    calc: "Ratio = e1RM exercice A ÷ e1RM exercice B. Comparé à des plages idéales établies par la science du sport.",
    example: "Row/Bench idéal : 0.90-1.00. Si < 0.75 → dos trop faible par rapport aux pecs → risque épaule.",
    category: "scores"
  }
};

const GLOSSARY_CATEGORIES = {
  bases: { label: 'Bases', icon: '📚', keys: ['rpe', 'progressive_overload'] },
  performance: { label: 'Mesures de performance', icon: '📊', keys: ['e1rm', 'tonnage', 'dots', 'wilks'] },
  volume: { label: 'Gestion du volume', icon: '📐', keys: ['mev', 'mav', 'mrv'] },
  recuperation: { label: 'Récupération & fatigue', icon: '🔄', keys: ['readiness', 'deload', 'fatigue_index', 'mesocycle'] },
  scores: { label: 'Scores & prédictions', icon: '🎯', keys: ['form_score', 'pr_prediction', 'compliance', 'strength_ratios'] },
  formules: { label: 'Formules', icon: '🧮', keys: ['epley', 'load_pct'] }
};

function renderGlossaryTip(key) {
  if (!GLOSSARY[key]) return '';
  return '<span class="glossary-tip" onclick="event.stopPropagation();showGlossaryModal(\'' + key + '\')">ℹ️</span>';
}

function showGlossaryModal(key) {
  var g = GLOSSARY[key];
  if (!g) return;
  var existing = document.getElementById('glossaryModal');
  if (existing) existing.remove();
  var body = '<p style="font-size:13px;line-height:1.6;color:var(--text);margin:0 0 12px;">' + g.desc + '</p>';
  if (g.calc) body += '<div style="background:rgba(10,132,255,0.08);border-radius:10px;padding:10px 12px;margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:var(--blue);margin-bottom:4px;">📐 Comment c\'est calculé</div><div style="font-size:12px;color:var(--text);line-height:1.5;">' + g.calc + '</div></div>';
  if (g.example) body += '<div style="background:rgba(50,215,75,0.08);border-radius:10px;padding:10px 12px;"><div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:4px;">💡 Exemple concret</div><div style="font-size:12px;color:var(--text);line-height:1.5;">' + g.example + '</div></div>';
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'glossaryModal';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="modal-box" style="max-width:380px;padding:20px;text-align:left;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
    '<div style="font-size:15px;font-weight:700;color:var(--text);">' + g.short + '</div>' +
    '<button onclick="document.getElementById(\'glossaryModal\').remove()" style="background:none;border:none;color:var(--sub);font-size:18px;cursor:pointer;padding:0;">✕</button>' +
    '</div>' + body + '</div>';
  document.body.appendChild(overlay);
}

function renderGlossaryPage() {
  var el = document.getElementById('glossaryPageContent');
  if (!el) return;
  var html = '';
  for (var catKey in GLOSSARY_CATEGORIES) {
    var cat = GLOSSARY_CATEGORIES[catKey];
    html += '<div style="margin-bottom:16px;">' +
      '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">' + cat.icon + ' ' + cat.label + '</div>';
    cat.keys.forEach(function(key) {
      var g = GLOSSARY[key];
      if (!g) return;
      html += '<div class="glossary-item" onclick="showGlossaryModal(\'' + key + '\')">' +
        '<span style="font-size:12px;font-weight:600;color:var(--text);">' + g.short + '</span>' +
        '<span class="glossary-tip">ℹ️</span>' +
        '</div>';
    });
    html += '</div>';
  }
  el.innerHTML = html;
}

// ── EXPORT / IMPORT JSON ─────────────────────────────────────
function exportData() {
  const json = JSON.stringify(db, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'training-hub-backup-' + date + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Sauvegarde téléchargée !');
}

// Export CSV — format tableur simple
function exportDataCSV() {
  var rows = [['Date', 'Jour', 'Titre', 'Exercice', 'Série', 'Poids (kg)', 'Reps', 'RPE', 'Type', 'Volume (kg)']];
  (db.logs || []).forEach(function(session) {
    var date = session.shortDate || session.date || '';
    var day = session.day || '';
    var title = (session.title || 'Séance').replace(/"/g, '""');
    (session.exercises || []).forEach(function(exo) {
      var exoName = (exo.name || '').replace(/"/g, '""');
      var sets = exo.allSets || exo.series || [];
      sets.forEach(function(s, si) {
        var w = s.weight || 0;
        var r = s.reps || 0;
        var rpe = s.rpe || '';
        var type = s.setType || 'normal';
        var vol = w * r;
        rows.push([date, day, '"' + title + '"', '"' + exoName + '"', si + 1, w, r, rpe, type, vol]);
      });
      if (sets.length === 0) {
        rows.push([date, day, '"' + title + '"', '"' + exoName + '"', '', '', '', '', '', '']);
      }
    });
  });

  var csv = rows.map(function(r) { return r.join(';'); }).join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'training-hub-export-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Export CSV téléchargé !');
}

let _restoreData = null;
function previewRestore(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      // Validation minimale
      if (!parsed.logs || !parsed.user) throw new Error('Format invalide');
      _restoreData = parsed;
      const preview = document.getElementById('restorePreview');
      const btn = document.getElementById('restoreBtn');
      const sessions = parsed.logs ? parsed.logs.length : 0;
      const name = parsed.user ? (parsed.user.name || 'Inconnu') : '—';
      preview.style.display = '';
      preview.innerHTML = '✅ Fichier valide<br>' +
        '<strong>' + sessions + '</strong> séances · Profil : <strong>' + name + '</strong>';
      btn.disabled = false;
    } catch(err) {
      _restoreData = null;
      const preview = document.getElementById('restorePreview');
      preview.style.display = '';
      preview.innerHTML = '❌ Fichier invalide : ' + err.message;
      document.getElementById('restoreBtn').disabled = true;
    }
  };
  reader.readAsText(file);
}

function importData() {
  if (!_restoreData) return;
  showModal(
    'Restaurer les données ? Toutes les données actuelles seront remplacées.',
    'Restaurer',
    'var(--orange)',
    () => {
      db = sanitizeDB(_restoreData);
      saveDB();
      _restoreData = null;
      document.getElementById('restoreFileInput').value = '';
      document.getElementById('restorePreview').style.display = 'none';
      document.getElementById('restoreBtn').disabled = true;
      refreshUI();
      showToast('✓ Données restaurées !');
    }
  );
}
function showToast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2500); }
function showModal(msg, cText, cColor, onConfirm, onCancelOrText) { var cancelLabel = typeof onCancelOrText === 'string' ? onCancelOrText : 'Annuler'; var onCancel = typeof onCancelOrText === 'function' ? onCancelOrText : null; const o = document.createElement('div'); o.className = 'modal-overlay'; o.innerHTML = '<div class="modal-box"><p style="margin:0 0 5px;font-size:14px;">'+msg+'</p><div class="modal-actions"><button class="modal-cancel" style="background:var(--sub);color:#000;">'+cancelLabel+'</button><button class="modal-confirm" style="background:'+cColor+';color:white;">'+cText+'</button></div></div>'; document.body.appendChild(o); o.querySelector('.modal-cancel').onclick = () => { o.remove(); if (onCancel) onCancel(); }; o.querySelector('.modal-confirm').onclick = () => { o.remove(); onConfirm(); }; }
function formatDate(ts) { return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function formatTime(sec) { if (!sec || sec <= 0) return '0s'; const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60; if (h > 0) return h+'h'+String(m).padStart(2,'0')+'m'+String(s).padStart(2,'0')+'s'; return m > 0 ? m+'m'+s+'s' : s+'s'; }
function calcE1RM(w, r) { return r <= 1 ? w : Math.round(w / (1.0278 - 0.0278 * r)); }
function recalcBestPR() {
  db.bestPR = { bench: 0, squat: 0, deadlift: 0 };
  db.logs.forEach(log => {
    log.exercises.forEach(exo => {
      const type = getSBDType(exo.name);
      if (!type || !exo.maxRM || exo.maxRM <= 0) return;
      if (exo.maxRM > db.bestPR[type]) db.bestPR[type] = exo.maxRM;
    });
  });
}
function setPeriodButtons(id, period) { const c = document.getElementById(id); if (c) c.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period)); }
function getLogsInRange(days) { const lim = Date.now() - days * 86400000; return db.logs.filter(l => l.timestamp >= lim && l.timestamp <= Date.now()); }
function daysLeft(expiresAt) { return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)); }

// ============================================================
// ONBOARDING — STATE
// ============================================================
let obPath = 'generate'; // 'generate' | 'import'
let obFreq = 3;
let obMat  = 'salle';
let obGoals = [
  { id:'force',   icon:'🏋️', label:'Gagner en force', desc:'SBD, powerlifting, 1RM' },
  { id:'masse',   icon:'💪', label:'Prendre de la masse', desc:'Hypertrophie, volume' },
  { id:'seche',   icon:'🔥', label:'Perdre du poids / Sécher', desc:'Déficit calorique + cardio' },
  { id:'recompo', icon:'⚖️', label:'Recomposition corporelle', desc:'Perdre du gras, garder le muscle' },
  { id:'maintien',icon:'🎯', label:'Maintien / Forme générale', desc:'Rester en forme, santé' },
  { id:'reprise', icon:'🌱', label:'Reprise / Rééducation', desc:'Après blessure ou pause' },
];
let obDragSrc = null;

// ── EXERCISE DATABASE ────────────────────────────────────────
// Format: { name, sets, reps, mat:['salle','halteres','maison'], muscle, icon, alts:[{name,mat}] }
const EXO_DB = {
  // JAMBES
  squat:          { name:'Squat barre', sets:'4×5', mat:['salle'], muscle:'Jambes', icon:'🦵', alts:[{name:'Goblet Squat',mat:'halteres'},{name:'Squat haltères',mat:'halteres'},{name:'Squat bulgare',mat:'halteres'},{name:'Squat poids de corps',mat:'maison'}] },
  leg_press:      { name:'Leg Press', sets:'3×10', mat:['salle'], muscle:'Jambes', icon:'🦵', alts:[{name:'Hack Squat machine',mat:'salle'},{name:'Fentes avant',mat:'halteres'},{name:'Step-up',mat:'maison'}] },
  fente:          { name:'Fentes avant', sets:'3×12', mat:['salle','halteres'], muscle:'Jambes', icon:'🦵', alts:[{name:'Fentes bulgares',mat:'halteres'},{name:'Step-up',mat:'maison'},{name:'Fentes marchées',mat:'maison'}] },
  leg_curl:       { name:'Leg Curl couché', sets:'3×12', mat:['salle'], muscle:'Jambes', icon:'🦵', alts:[{name:'Romanian Deadlift haltères',mat:'halteres'},{name:'Hip Thrust',mat:'salle'},{name:'Good Morning',mat:'maison'}] },
  rdl:            { name:'Romanian Deadlift', sets:'3×10', mat:['salle','halteres'], muscle:'Jambes', icon:'🦵', alts:[{name:'Leg Curl couché',mat:'salle'},{name:'Hip Thrust',mat:'salle'},{name:'Pont fessier',mat:'maison'}] },
  hip_thrust:     { name:'Hip Thrust', sets:'3×12', mat:['salle','halteres'], muscle:'Jambes', icon:'🍑', alts:[{name:'Pont fessier',mat:'maison'},{name:'Leg Curl couché',mat:'salle'},{name:'Kickback câble',mat:'salle'}] },
  deadlift:       { name:'Soulevé de terre', sets:'4×5', mat:['salle'], muscle:'Jambes/Dos', icon:'🏋️', alts:[{name:'Roumain haltères',mat:'halteres'},{name:'Trap bar deadlift',mat:'salle'},{name:'Good Morning',mat:'maison'}] },
  leg_ext:        { name:'Leg Extension', sets:'3×15', mat:['salle'], muscle:'Jambes', icon:'🦵', alts:[{name:'Squat bulgare',mat:'halteres'},{name:'Sissy Squat',mat:'maison'},{name:'Step-up',mat:'maison'}] },
  mollet:         { name:'Mollets debout', sets:'4×15', mat:['salle','halteres'], muscle:'Mollets', icon:'🦶', alts:[{name:'Mollets assis machine',mat:'salle'},{name:'Mollets escalier',mat:'maison'}] },
  // PECS
  bench:          { name:'Bench Press barre', sets:'4×5', mat:['salle'], muscle:'Pecs', icon:'🫁', alts:[{name:'Développé haltères',mat:'halteres'},{name:'Développé incliné barre',mat:'salle'},{name:'Pompes lestées',mat:'maison'}] },
  bench_halt:     { name:'Développé haltères', sets:'3×10', mat:['halteres','salle'], muscle:'Pecs', icon:'🫁', alts:[{name:'Bench Press barre',mat:'salle'},{name:'Pompes',mat:'maison'},{name:'Développé incliné haltères',mat:'halteres'}] },
  incline_bench:  { name:'Développé incliné barre', sets:'3×8', mat:['salle'], muscle:'Pecs', icon:'🫁', alts:[{name:'Développé incliné haltères',mat:'halteres'},{name:'Pompes pieds surélevés',mat:'maison'}] },
  ecarte:         { name:'Écarté poulie basse', sets:'3×15', mat:['salle'], muscle:'Pecs', icon:'🫁', alts:[{name:'Écarté haltères',mat:'halteres'},{name:'Pompes diamant',mat:'maison'}] },
  pompe:          { name:'Pompes', sets:'4×max', mat:['maison','halteres','salle'], muscle:'Pecs', icon:'🫁', alts:[{name:'Pompes diamant',mat:'maison'},{name:'Pompes pieds surélevés',mat:'maison'},{name:'Bench Press barre',mat:'salle'}] },
  dips_pec:       { name:'Dips (pecs)', sets:'3×10', mat:['salle','maison'], muscle:'Pecs', icon:'🫁', alts:[{name:'Développé décliné haltères',mat:'halteres'},{name:'Pompes pieds surélevés',mat:'maison'}] },
  // DOS
  row_barre:      { name:'Rowing barre', sets:'4×8', mat:['salle'], muscle:'Dos', icon:'🔙', alts:[{name:'Rowing haltère 1 bras',mat:'halteres'},{name:'Rowing TRX',mat:'maison'},{name:'Tirage horizontal câble',mat:'salle'}] },
  traction:       { name:'Tractions', sets:'4×max', mat:['salle','maison'], muscle:'Dos', icon:'🔙', alts:[{name:'Lat Pulldown',mat:'salle'},{name:'Traction élastique',mat:'maison'},{name:'Rowing inversé',mat:'maison'}] },
  lat_pull:       { name:'Lat Pulldown', sets:'3×12', mat:['salle'], muscle:'Dos', icon:'🔙', alts:[{name:'Tractions',mat:'salle'},{name:'Tractions élastique',mat:'maison'},{name:'Tirage poulie haute',mat:'salle'}] },
  row_halt:       { name:'Rowing haltère 1 bras', sets:'3×12', mat:['halteres','salle'], muscle:'Dos', icon:'🔙', alts:[{name:'Rowing barre',mat:'salle'},{name:'Rowing inversé',mat:'maison'},{name:'Tirage horizontal câble',mat:'salle'}] },
  rowing_inv:     { name:'Rowing inversé', sets:'3×12', mat:['maison','salle'], muscle:'Dos', icon:'🔙', alts:[{name:'Rowing haltère',mat:'halteres'},{name:'Tractions',mat:'maison'},{name:'Lat Pulldown',mat:'salle'}] },
  face_pull:      { name:'Face Pull', sets:'3×15', mat:['salle'], muscle:'Épaules/Dos', icon:'🔙', alts:[{name:'Oiseau haltères',mat:'halteres'},{name:'Élévation postérieure',mat:'halteres'}] },
  shrug:          { name:'Shrugs barre', sets:'3×15', mat:['salle','halteres'], muscle:'Dos', icon:'🔙', alts:[{name:'Shrugs haltères',mat:'halteres'},{name:'Élévation épaules',mat:'maison'}] },
  // ÉPAULES
  ohp:            { name:'Développé militaire barre', sets:'4×6', mat:['salle'], muscle:'Épaules', icon:'🫴', alts:[{name:'Développé militaire haltères',mat:'halteres'},{name:'Arnold Press',mat:'halteres'},{name:'Pompes Pike',mat:'maison'}] },
  ohp_halt:       { name:'Développé militaire haltères', sets:'3×10', mat:['halteres','salle'], muscle:'Épaules', icon:'🫴', alts:[{name:'Arnold Press',mat:'halteres'},{name:'Développé militaire barre',mat:'salle'},{name:'Pompes Pike',mat:'maison'}] },
  elev_lat:       { name:'Élévation latérale', sets:'4×15', mat:['halteres','salle'], muscle:'Épaules', icon:'🫴', alts:[{name:'Élévation latérale câble',mat:'salle'},{name:'Upright Row',mat:'salle'}] },
  elev_front:     { name:'Élévation frontale', sets:'3×12', mat:['halteres','salle'], muscle:'Épaules', icon:'🫴', alts:[{name:'Élévation frontale câble',mat:'salle'},{name:'Développé militaire haltères',mat:'halteres'}] },
  // BRAS
  curl_barre:     { name:'Curl barre', sets:'3×12', mat:['salle','halteres'], muscle:'Biceps', icon:'💪', alts:[{name:'Curl haltères',mat:'halteres'},{name:'Curl marteau',mat:'halteres'},{name:'Curl câble',mat:'salle'}] },
  curl_halt:      { name:'Curl haltères', sets:'3×12', mat:['halteres','salle'], muscle:'Biceps', icon:'💪', alts:[{name:'Curl barre',mat:'salle'},{name:'Curl marteau',mat:'halteres'},{name:'Curl concentré',mat:'halteres'}] },
  skull:          { name:'Skull Crusher', sets:'3×12', mat:['salle','halteres'], muscle:'Triceps', icon:'💪', alts:[{name:'Extension triceps câble',mat:'salle'},{name:'JM Press',mat:'salle'},{name:'Dips triceps',mat:'maison'}] },
  tri_cable:      { name:'Extension triceps câble', sets:'3×15', mat:['salle'], muscle:'Triceps', icon:'💪', alts:[{name:'Skull Crusher',mat:'salle'},{name:'Dips triceps',mat:'maison'},{name:'Extension triceps haltère',mat:'halteres'}] },
  dips_tri:       { name:'Dips triceps', sets:'3×max', mat:['salle','maison'], muscle:'Triceps', icon:'💪', alts:[{name:'Extension triceps câble',mat:'salle'},{name:'Skull Crusher',mat:'salle'},{name:'Kickback triceps',mat:'halteres'}] },
  // ABDOS
  crunch:         { name:'Crunch', sets:'3×20', mat:['maison','salle','halteres'], muscle:'Abdos', icon:'🔥', alts:[{name:'Crunch câble',mat:'salle'},{name:'Relevé de genoux suspendu',mat:'salle'},{name:'Ab Wheel',mat:'maison'}] },
  planche:        { name:'Planche', sets:'3×60s', mat:['maison','salle','halteres'], muscle:'Abdos', icon:'🔥', alts:[{name:'Gainage latéral',mat:'maison'},{name:'Planche avec toucher',mat:'maison'}] },
  releve_genoux:  { name:'Relevé de genoux suspendu', sets:'3×15', mat:['salle','maison'], muscle:'Abdos', icon:'🔥', alts:[{name:'Relevé de jambes sol',mat:'maison'},{name:'Crunch',mat:'maison'}] },
  russian_twist:  { name:'Russian Twist', sets:'3×20', mat:['maison','halteres','salle'], muscle:'Abdos', icon:'🔥', alts:[{name:'Rotation buste câble',mat:'salle'},{name:'Crunch oblique',mat:'maison'}] },
  // CARDIO
  cardio_hiit:    { name:'HIIT / Intervalles', sets:'20min', mat:['maison','salle','halteres'], muscle:'Cardio', icon:'🏃', alts:[{name:'Course à pied',mat:'maison'},{name:'Vélo stationnaire',mat:'salle'},{name:'Corde à sauter',mat:'maison'}] },
  cardio_liss:    { name:'Cardio modéré (LISS)', sets:'30–45min', mat:['maison','salle','halteres'], muscle:'Cardio', icon:'🏃', alts:[{name:'Marche rapide',mat:'maison'},{name:'Natation',mat:'maison'},{name:'Elliptique',mat:'salle'}] },
};

// ── PROGRAMME GENERATOR ─────────────────────────────────────
// (Version courte supprimée — seule la version enrichie à 9 paramètres est conservée)

function filtMat(ids, mat) {
  // Filtre les exos selon matériel, garde ceux compatibles ou prend premier alt
  return ids.map(id => {
    const e = EXO_DB[id];
    if (!e) return id;
    if (e.mat.includes(mat) || mat === 'salle') return id;
    // Chercher un alt compatible
    const alt = e.alts.find(a => a.mat === mat || mat === 'salle');
    if (alt) {
      // Créer un exo temporaire
      EXO_DB['_alt_'+id+'_'+mat] = { name: alt.name, sets: e.sets, mat: [mat], muscle: e.muscle, icon: e.icon, alts: [{ name: e.name, mat: e.mat[0] }, ...e.alts.filter(a2 => a2.name !== alt.name)] };
      return '_alt_'+id+'_'+mat;
    }
    return id;
  });
}

// ── ONBOARDING FLOW ──────────────────────────────────────────
const OB_STEPS_GENERATE = ['1','1b','2','3','4a','5','5b','6','6b','6c','6d','7']; // +6e si force_athletique
const OB_STEPS_IMPORT   = ['1','1b','2','3','4b','7_import'];

let _obSelectedMode = null;
function selectTrainingMode(modeId) {
  _obSelectedMode = modeId;
  db.user.trainingMode = modeId;
  document.querySelectorAll('#ob-mode-grid .ob-mode-btn').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  document.getElementById('ob-mode-continue').disabled = false;
}
let obStepHistory = [];
let obSelectedDays = [];
let obDuration    = 60;    // minutes par séance
let obInjuries    = [];    // zones fragiles
let obCardio      = 'integre'; // 'integre' | 'dedie' | 'aucun'
let obCompDate    = null;
let obCompType    = 'powerlifting';

function showOnboarding() {
  document.getElementById('onboarding-overlay').style.display = 'flex';
  renderObGoals();
  obStepHistory = [];
  gotoObStep('1');
}
function hideOnboarding() {
  document.getElementById('onboarding-overlay').style.display = 'none';
}

function gotoObStep(stepId) {
  obStepHistory.push(stepId);
  document.querySelectorAll('.ob-step').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('ob-step-'+stepId);
  if (el) { el.classList.add('active'); el.scrollIntoView({behavior:'smooth',block:'start'}); }
  updateObProgress(stepId);
  window.scrollTo(0,0);
}

function getObSteps() {
  let steps = obPath === 'import' ? [...OB_STEPS_IMPORT] : [...OB_STEPS_GENERATE];
  // Remove step 2 (SBD records) if mode doesn't use SBD
  if (db.user.trainingMode && !TRAINING_MODES[db.user.trainingMode]?.features?.showSBDCards) {
    steps = steps.filter(s => s !== '2');
  }
  // Add 6e only for force_athletique
  if (db.user.trainingMode === 'force_athletique' && !steps.includes('6e')) {
    const idx6d = steps.indexOf('6d');
    if (idx6d !== -1) steps.splice(idx6d + 1, 0, '6e');
  }
  return steps;
}

function updateObProgress(stepId) {
  const allSteps = getObSteps();
  const current = allSteps.indexOf(stepId) + 1;
  document.getElementById('ob-progress').innerHTML = allSteps.map((_,i) =>
    '<div class="ob-dot'+(i < current ? ' active' : '')+'"></div>'
  ).join('');
}

function obNext(step) {
  const s = String(step);
  if (s === '1') {
    const name = document.getElementById('ob-name').value.trim();
    if (!name) { showToast('Entre ton prénom 😊'); return; }
    db.user.name  = name;
    db.user.bw    = parseFloat(document.getElementById('ob-bw').value) || 0;
    db.user.level = document.getElementById('ob-level').value;
    db.user.gender = document.getElementById('ob-gender').value || 'unspecified';
    saveDB();
    gotoObStep('1b');
  } else if (s === '1b') {
    if (!db.user.trainingMode) { showToast('Choisis un objectif'); return; }
    // Only show SBD records if powerlifting or force_athletique
    if (modeFeature('showSBDCards')) {
      const defaults = { debutant:{b:80,s:100,d:120}, intermediaire:{b:100,s:130,d:150}, avance:{b:130,s:160,d:190}, competiteur:{b:150,s:180,d:220} };
      const d = defaults[db.user.level] || defaults.intermediaire;
      document.getElementById('ob-bench-tgt').value = d.b;
      document.getElementById('ob-squat-tgt').value = d.s;
      document.getElementById('ob-dead-tgt').value  = d.d;
      gotoObStep('2');
    } else {
      gotoObStep('3');
    }
  } else if (s === '2') {
    const benchPR = parseFloat(document.getElementById('ob-bench-pr').value) || 0;
    const squatPR = parseFloat(document.getElementById('ob-squat-pr').value) || 0;
    const deadPR  = parseFloat(document.getElementById('ob-dead-pr').value)  || 0;
    if (benchPR > 0) db.bestPR.bench = benchPR;
    if (squatPR > 0) db.bestPR.squat = squatPR;
    if (deadPR  > 0) db.bestPR.deadlift = deadPR;
    db.user.targets = {
      bench:    parseFloat(document.getElementById('ob-bench-tgt').value) || db.user.targets.bench,
      squat:    parseFloat(document.getElementById('ob-squat-tgt').value) || db.user.targets.squat,
      deadlift: parseFloat(document.getElementById('ob-dead-tgt').value)  || db.user.targets.deadlift
    };
    saveDB();
    gotoObStep('3');
  } else if (s === '3') {
    gotoObStep(obPath === 'import' ? '4b' : '4a');
  } else if (s === '4a') {
    gotoObStep('5');
  } else if (s === '4b') {
    const text = document.getElementById('ob-manual-prog').value.trim();
    if (!text) { showToast('Colle ton programme d\'abord'); return; }
    const parsed = parseManualProgram(text);
    db.routine = parsed;
    db.routineExos = db.routineExos || {};
    for (const [day, content] of Object.entries(parsed)) {
      if (content && content.toLowerCase() !== 'repos' && content.toLowerCase() !== 'off') {
        db.routineExos[day] = content.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
      }
    }
    saveDB();
    obFinish();
  } else if (s === '5') {
    // Après fréquence → choix des jours
    renderDayPicker();
    gotoObStep('5b');
  } else if (s === '5b') {
    if (obSelectedDays.length !== obFreq) {
      document.getElementById('ob-days-hint').textContent =
        obSelectedDays.length < obFreq
          ? 'Sélectionne encore ' + (obFreq - obSelectedDays.length) + ' jour(s)'
          : 'Tu as sélectionné trop de jours — retire-en ' + (obSelectedDays.length - obFreq);
      return;
    }
    gotoObStep('6');
  } else if (s === '6') {
    // Mat choisi → durée
    gotoObStep('6b');
  } else if (s === '6b') {
    // Durée → blessures
    gotoObStep('6c');
  } else if (s === '6c') {
    // Blessures → cardio
    gotoObStep('6d');
  } else if (s === '6d') {
    // Cardio → compétition si force_athletique, sinon générer
    if (db.user.trainingMode === 'force_athletique') {
      gotoObStep('6e');
    } else {
      doGenerateProgram();
    }
  } else if (s === '6e') {
    // Compétition → générer
    obCompDate = document.getElementById('ob-comp-date').value || null;
    obCompType = document.getElementById('ob-comp-type').value;
    doGenerateProgram();
  }
}

function obSkip(step) {
  const s = String(step);
  if (s === '2') gotoObStep('3');
  else if (s === '3' || s === '4b' || s === '7') obFinish();
}

function selectPath(p) {
  obPath = p;
  document.getElementById('path-btn-generate').classList.toggle('selected', p === 'generate');
  document.getElementById('path-btn-import').classList.toggle('selected', p === 'import');
}

function selectDur(min) {
  obDuration = min;
  document.querySelectorAll('.ob-dur-btn').forEach(b => b.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
}

function toggleInjury(zone) {
  const btn = document.querySelector('.ob-inj-btn[data-inj="'+zone+'"]');
  if (obInjuries.includes(zone)) {
    obInjuries = obInjuries.filter(z => z !== zone);
    if (btn) btn.classList.remove('selected');
  } else {
    obInjuries.push(zone);
    if (btn) btn.classList.add('selected');
  }
}

function selectCardio(mode) {
  obCardio = mode;
  document.querySelectorAll('.ob-cardio-btn').forEach(b => b.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
}

function doGenerateProgram() {
  const generated = generateProgram(obGoals, obFreq, obMat, obDuration, obInjuries, obCardio, obCompDate, obCompType, db.user.level);
  db.generatedProgram = generated;
  db.user.programParams = { goals: obGoals.map(g=>g.id), freq: obFreq, mat: obMat, duration: obDuration, injuries: obInjuries, cardio: obCardio, compDate: obCompDate, compType: obCompType, level: db.user.level };
  db.routine = {};
  db.routineExos = db.routineExos || {};
  generated.forEach(d => {
    db.routine[d.day] = d.isRest ? '😴 Repos' : (d.isCardio ? '🏃 '+d.label : d.label);
    if (!d.isRest && d.exos && d.exos.length > 0) {
      db.routineExos[d.day] = d.exos.map(id => EXO_DB[id] ? EXO_DB[id].name : id);
    }
  });
  renderObGeneratedProgram(generated);
  gotoObStep('7');
}

// ── PARAMÈTRES PAR NIVEAU ────────────────────────────────────
const LEVEL_PARAMS = {
  debutant: {
    setsWork: 2, setsMax: 3, repsLow: 10, repsHigh: 15,
    exosPerSession: { 30:3, 45:3, 60:4, 90:5, 120:5 },
    note: 'Progression linéaire — ajoute 2.5kg à chaque séance',
    complexity: 'low' // pas d'exercices techniques complexes
  },
  intermediaire: {
    setsWork: 3, setsMax: 4, repsLow: 6, repsHigh: 12,
    exosPerSession: { 30:3, 45:4, 60:5, 90:6, 120:7 },
    note: 'Ondulation du volume — varie les reps semaine à semaine',
    complexity: 'medium'
  },
  avance: {
    setsWork: 4, setsMax: 5, repsLow: 3, repsHigh: 10,
    exosPerSession: { 30:4, 45:5, 60:6, 90:7, 120:8 },
    note: 'Blocs force / volume / intensité avec deload toutes les 4–6 semaines',
    complexity: 'high'
  },
  competiteur: {
    setsWork: 4, setsMax: 6, repsLow: 1, repsHigh: 8,
    exosPerSession: { 30:4, 45:5, 60:6, 90:8, 120:9 },
    note: 'Cycle de périodisation avec semaine de peak et deload pré-compétition',
    complexity: 'high'
  }
};

// ── EXERCICES EXCLUS PAR BLESSURE ───────────────────────────
const INJURY_EXCLUSIONS = {
  epaules:  ['ohp','ohp_halt','elev_lat','elev_front','incline_bench','dips_pec','dips_tri','face_pull','upright_row'],
  genoux:   ['squat','leg_press','leg_ext','fente','hack_squat','step_up','sissy'],
  dos:      ['deadlift','rdl','row_barre','row_halt','good_morning','shrug'],
  poignets: ['bench','bench_halt','curl_barre','skull','row_barre'],
  nuque:    ['lat_pull','traction','shrug','face_pull'],
  hanches:  ['deadlift','rdl','hip_thrust','fente','squat']
};

// ── SETS×REPS PAR NIVEAU ─────────────────────────────────────
function getSetsReps(exoId, level, goalId) {
  const lp = LEVEL_PARAMS[level] || LEVEL_PARAMS.intermediaire;
  const isStrength = goalId === 'force' || goalId === 'recompo';
  const isHypertrophy = goalId === 'masse' || goalId === 'seche';
  const isCardioExo = exoId === 'cardio_hiit' || exoId === 'cardio_liss';

  if (isCardioExo) return EXO_DB[exoId]?.sets || '30min';

  const exo = EXO_DB[exoId];
  if (!exo) return lp.setsWork+'×10';

  if (exo.exoType === 'time' || exo.sets?.includes('s') || exo.sets?.includes('min')) return exo.sets;
  if (exo.sets?.includes('max')) return lp.setsWork+'×max';

  if (isStrength) {
    const reps = level === 'debutant' ? 6 : level === 'intermediaire' ? 5 : level === 'avance' ? 3 : 2;
    return lp.setsWork+'×'+reps;
  }
  if (isHypertrophy) {
    return lp.setsWork+'×'+lp.repsHigh;
  }
  return lp.setsWork+'×'+(Math.round((lp.repsLow+lp.repsHigh)/2));
}

// ── GÉNÉRATION PROGRAMME ENRICHIE ───────────────────────────
function generateProgram(goals, freq, mat, duration, injuries, cardio, compDate, compType, level) {
  const g1    = goals[0]?.id || 'force';
  const lp    = LEVEL_PARAMS[level] || LEVEL_PARAMS.intermediaire;
  const exosN = lp.exosPerSession[duration] || lp.exosPerSession[60];
  const excluded = new Set((injuries||[]).flatMap(z => INJURY_EXCLUSIONS[z]||[]));

  // Filtrage exercices par blessures + matériel
  function filtSafe(ids, m) {
    return filtMat(ids.filter(id => !excluded.has(id)), m).slice(0, exosN);
  }

  // Débutants : remplacer les exercices complexes par des alternatives plus simples
  function filtLevel(ids) {
    if (lp.complexity === 'low') {
      const REPLACEMENTS = {
        'squat':    'leg_press',
        'deadlift': 'rdl',
        'rdl':      'leg_curl',
        'ohp':      'ohp_halt',
        'skull':    'tri_cable',
      };
      return ids.map(id => REPLACEMENTS[id] || id);
    }
    return ids;
  }

  const trainingDays = obSelectedDays.length === freq
    ? obSelectedDays
    : { 1:['Lundi'],2:['Lundi','Jeudi'],3:['Lundi','Mercredi','Vendredi'],4:['Lundi','Mardi','Jeudi','Vendredi'],5:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],6:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'] }[Math.min(freq,6)] || ['Lundi','Mercredi','Vendredi'];

  // Blocs ajustés
  const B = {
    force: {
      push:    { label:'Push — Force', exos: filtSafe(filtLevel(['bench','ohp','incline_bench','tri_cable','elev_lat']), mat) },
      pull:    { label:'Pull — Force', exos: filtSafe(filtLevel(['deadlift','row_barre','lat_pull','traction','curl_barre','face_pull']), mat) },
      legs:    { label:'Jambes — Force', exos: filtSafe(filtLevel(['squat','leg_press','rdl','mollet','leg_curl']), mat) },
      full_a:  { label:'Full Body A — Force', exos: filtSafe(filtLevel(['squat','bench','row_barre','ohp','curl_barre']), mat) },
      full_b:  { label:'Full Body B — Force', exos: filtSafe(filtLevel(['deadlift','incline_bench','lat_pull','elev_lat','tri_cable']), mat) },
      sbd:     { label:'SBD Technique', exos: filtSafe(['squat','bench','deadlift'], mat) },
      faibles: { label:'Points Faibles', exos: filtSafe(filtLevel(['elev_lat','face_pull','crunch','mollet','russian_twist']), mat) },
    },
    masse: {
      push:    { label:'Push — Volume', exos: filtSafe(filtLevel(['bench_halt','incline_bench','ecarte','dips_pec','tri_cable','elev_lat']), mat) },
      pull:    { label:'Pull — Volume', exos: filtSafe(filtLevel(['row_halt','lat_pull','traction','face_pull','curl_halt','shrug']), mat) },
      legs:    { label:'Jambes — Volume', exos: filtSafe(filtLevel(['leg_press','leg_curl','fente','hip_thrust','mollet','leg_ext']), mat) },
      full_a:  { label:'Full Body A — Volume', exos: filtSafe(filtLevel(['bench_halt','squat','row_halt','ohp_halt','curl_halt']), mat) },
      full_b:  { label:'Full Body B — Volume', exos: filtSafe(filtLevel(['incline_bench','rdl','lat_pull','elev_lat','tri_cable']), mat) },
      upper:   { label:'Upper Body', exos: filtSafe(filtLevel(['bench_halt','row_halt','ohp_halt','lat_pull','elev_lat','curl_halt']), mat) },
      lower:   { label:'Lower Body', exos: filtSafe(filtLevel(['squat','leg_press','rdl','leg_curl','hip_thrust','mollet']), mat) },
    },
    seche: {
      push:    { label:'Push + Cardio', exos: filtSafe(filtLevel(['bench_halt','incline_bench','pompe','tri_cable','cardio_hiit']), mat) },
      pull:    { label:'Pull + Cardio', exos: filtSafe(filtLevel(['row_halt','traction','lat_pull','curl_halt','cardio_liss']), mat) },
      legs:    { label:'Jambes + Cardio', exos: filtSafe(filtLevel(['squat','rdl','leg_press','fente','cardio_hiit']), mat) },
      full_a:  { label:'Full Body + HIIT', exos: filtSafe(filtLevel(['squat','pompe','rowing_inv','crunch','cardio_hiit']), mat) },
      cardio:  { label:'Cardio actif', exos: filtSafe(['cardio_hiit','cardio_liss','planche','crunch'], mat) },
    },
    recompo: {
      push:    { label:'Push (Recompo)', exos: filtSafe(filtLevel(['bench_halt','ohp_halt','ecarte','dips_pec','tri_cable']), mat) },
      pull:    { label:'Pull (Recompo)', exos: filtSafe(filtLevel(['traction','row_halt','lat_pull','curl_halt','face_pull']), mat) },
      legs:    { label:'Jambes (Recompo)', exos: filtSafe(filtLevel(['squat','rdl','leg_press','hip_thrust','mollet']), mat) },
      full_a:  { label:'Full Body A', exos: filtSafe(filtLevel(['squat','bench_halt','row_halt','crunch','planche']), mat) },
      full_b:  { label:'Full Body B', exos: filtSafe(filtLevel(['rdl','ohp_halt','traction','planche','russian_twist']), mat) },
      cardio:  { label:'Cardio modéré', exos: filtSafe(['cardio_liss','planche','crunch'], mat) },
    },
    maintien: {
      full_a:  { label:'Full Body A', exos: filtSafe(filtLevel(['squat','bench_halt','row_halt','ohp_halt','crunch']), mat) },
      full_b:  { label:'Full Body B', exos: filtSafe(filtLevel(['rdl','pompe','traction','elev_lat','planche']), mat) },
      full_c:  { label:'Full Body C', exos: filtSafe(filtLevel(['fente','incline_bench','lat_pull','crunch','cardio_liss']), mat) },
      cardio:  { label:'Cardio + Mobilité', exos: filtSafe(['cardio_liss','planche','russian_twist'], mat) },
    },
    reprise: {
      full_a:  { label:'Full Body Doux A', exos: filtSafe(['pompe','rowing_inv','planche','mollet','crunch'], mat) },
      full_b:  { label:'Full Body Doux B', exos: filtSafe(['leg_press','ohp_halt','lat_pull','crunch','planche'], mat) },
      cardio:  { label:'Cardio léger', exos: filtSafe(['cardio_liss','planche'], mat) },
    },
    bien_etre: {
      full_a:  { label:'Full Body Doux', exos: filtSafe(filtLevel(['pompe','rowing_inv','planche','pilates_bridge','crunch']), mat) },
      full_b:  { label:'Full Body Équilibré', exos: filtSafe(filtLevel(['leg_press','ohp_halt','lat_pull','pilates_rollup','planche']), mat) },
      mobility:{ label:'Mobilité & Récupération', exos: filtSafe(['yoga_downdog','mobility_hip_flexor','mobility_thoracic','pilates_cat_cow','mobility_hamstring','yoga_child_pose','mobility_world_greatest'], mat) },
      pilates: { label:'Pilates — Core & Stabilité', exos: filtSafe(['pilates_hundred','pilates_rollup','pilates_bridge','pilates_swimming','pilates_teaser','pilates_mermaid','pilates_side_kick'], mat) },
      stretching:{ label:'Étirements Complets', exos: filtSafe(['mobility_hip_flexor','mobility_hamstring','mobility_pec_stretch','mobility_90_90','yoga_pigeon','yoga_downdog','mobility_shoulder_dislocate'], mat) },
      cardio:  { label:'Cardio Doux', exos: filtSafe(['cardio_liss','planche'], mat) },
    }
  };
  // Add shared mobility/pilates/stretching blocs to all goals
  var _sharedMobility = { label:'Mobilité & Récupération', exos: filtSafe(['yoga_downdog','mobility_hip_flexor','mobility_thoracic','pilates_cat_cow','mobility_hamstring','yoga_child_pose','mobility_world_greatest'], mat) };
  var _sharedPilates = { label:'Pilates — Core & Stabilité', exos: filtSafe(['pilates_hundred','pilates_rollup','pilates_bridge','pilates_swimming','pilates_teaser','pilates_mermaid','pilates_side_kick'], mat) };
  var _sharedStretching = { label:'Étirements Complets', exos: filtSafe(['mobility_hip_flexor','mobility_hamstring','mobility_pec_stretch','mobility_90_90','yoga_pigeon','yoga_downdog','mobility_shoulder_dislocate'], mat) };
  for (var _bk in B) { if (!B[_bk].mobility) B[_bk].mobility = _sharedMobility; if (!B[_bk].pilates) B[_bk].pilates = _sharedPilates; if (!B[_bk].stretching) B[_bk].stretching = _sharedStretching; }

  const Bg = B[g1] || B.maintien;

  // ── Split intelligent basé sur fréquence, objectif et niveau ──
  // Chaque muscle entraîné 2×/sem minimum (pas de bro-split)
  // Sources : NSCA, Stronger by Science, meta-analyses 2024-2025
  function getSplitForFrequency(f, goal, lvl) {
    const isPL = goal === 'force' || goal === 'recompo';
    if (f <= 2) return 'full_body';
    if (f === 3) return lvl === 'debutant' ? 'full_body' : 'upper_lower_alt';
    if (f === 4) return isPL ? 'powerlifting_4' : 'upper_lower';
    if (f === 5) return isPL ? 'powerlifting_5' : 'ppl_ul';
    if (f >= 6) return isPL ? 'powerlifting_6' : 'ppl_x2';
    return 'upper_lower';
  }

  // Powerlifting-specific blocks (SBD chaque lift 2×/sem)
  const plBlocks = {
    squat_acc:  { label:'Squat + Accessoires', exos: filtSafe(filtLevel(['squat','leg_press','rdl','leg_curl','mollet']), mat) },
    bench_acc:  { label:'Bench + Accessoires', exos: filtSafe(filtLevel(['bench','incline_bench','ecarte','tri_cable','elev_lat']), mat) },
    dead_acc:   { label:'Deadlift + Accessoires', exos: filtSafe(filtLevel(['deadlift','row_barre','lat_pull','face_pull','curl_barre']), mat) },
    bench2_sq:  { label:'Bench 2 + Squat léger', exos: filtSafe(filtLevel(['bench_halt','ohp','squat','elev_lat','tri_cable']), mat) },
    squat2:     { label:'Squat 2', exos: filtSafe(filtLevel(['squat','leg_press','hip_thrust','leg_curl','mollet']), mat) },
    bench2:     { label:'Bench 2', exos: filtSafe(filtLevel(['bench_halt','incline_bench','dips_pec','tri_cable','elev_lat']), mat) },
    dead2_acc:  { label:'Deadlift 2 + Accessoires', exos: filtSafe(filtLevel(['deadlift','row_halt','traction','face_pull','curl_halt']), mat) },
    accessoires:{ label:'Accessoires', exos: filtSafe(filtLevel(['elev_lat','face_pull','curl_barre','tri_cable','crunch','mollet']), mat) },
  };

  // Map split → séquence de blocs
  function getSplitSequence(splitType, f) {
    switch (splitType) {
      case 'full_body':
        if (f === 1) return [Bg.full_a];
        if (f === 2) return [Bg.full_a, Bg.full_b];
        return [Bg.full_a, Bg.full_b, Bg.full_a || Bg.full_c]; // 3j FB
      case 'upper_lower_alt':
        // 3j : U/L/U puis semaine suivante L/U/L (on fait U/L/U pour la génération)
        return [Bg.upper || Bg.push, Bg.lower || Bg.legs, Bg.upper || Bg.pull];
      case 'upper_lower':
        // 4j : U/L/U/L
        return [Bg.upper || Bg.push, Bg.lower || Bg.legs, Bg.upper || Bg.pull, Bg.lower || Bg.legs];
      case 'ppl_ul':
        // 5j : PPL + U/L
        return [Bg.push, Bg.pull, Bg.legs, Bg.upper || Bg.push, Bg.lower || Bg.legs];
      case 'ppl_x2':
        // 6j : PPL × 2
        return [Bg.push, Bg.pull, Bg.legs, Bg.push, Bg.pull, Bg.legs];
      case 'powerlifting_4':
        return [plBlocks.squat_acc, plBlocks.bench_acc, plBlocks.dead_acc, plBlocks.bench2_sq];
      case 'powerlifting_5':
        return [plBlocks.squat_acc, plBlocks.bench_acc, plBlocks.dead_acc, plBlocks.squat2, plBlocks.bench2];
      case 'powerlifting_6':
        return [plBlocks.squat_acc, plBlocks.bench_acc, plBlocks.dead_acc, plBlocks.squat2, plBlocks.bench2, plBlocks.dead2_acc];
      default:
        return [Bg.full_a];
    }
  }

  // Bien-être et modes spéciaux gardent leur logique dédiée
  const specialSequences = {
    bien_etre:{ 1:[Bg.full_a],2:[Bg.full_a,Bg.mobility],3:[Bg.full_a,Bg.mobility,Bg.full_b],4:[Bg.full_a,Bg.pilates,Bg.full_b,Bg.mobility],5:[Bg.full_a,Bg.pilates,Bg.full_b,Bg.stretching,Bg.cardio],6:[Bg.full_a,Bg.pilates,Bg.full_b,Bg.stretching,Bg.cardio,Bg.mobility] },
    seche:    { 1:[Bg.full_a],2:[Bg.full_a,Bg.cardio],3:[Bg.full_a,Bg.cardio,Bg.full_a],4:[Bg.push,Bg.pull,Bg.legs,Bg.cardio],5:[Bg.push,Bg.pull,Bg.legs,Bg.cardio,Bg.full_a],6:[Bg.push,Bg.pull,Bg.legs,Bg.cardio,Bg.full_a,Bg.cardio] },
    reprise:  { 1:[Bg.full_a],2:[Bg.full_a,Bg.full_b],3:[Bg.full_a,Bg.cardio,Bg.full_b],4:[Bg.full_a,Bg.cardio,Bg.full_b,Bg.mobility],5:[Bg.full_a,Bg.cardio,Bg.full_b,Bg.mobility,Bg.full_a],6:[Bg.full_a,Bg.cardio,Bg.full_b,Bg.mobility,Bg.full_a,Bg.cardio] },
    maintien: { 1:[Bg.full_a],2:[Bg.full_a,Bg.full_b],3:[Bg.full_a,Bg.full_b,Bg.full_c],4:[Bg.full_a,Bg.full_b,Bg.full_c,Bg.cardio],5:[Bg.full_a,Bg.full_b,Bg.full_c,Bg.cardio,Bg.mobility],6:[Bg.full_a,Bg.full_b,Bg.full_c,Bg.cardio,Bg.mobility,Bg.full_a] },
  };

  let seq;
  if (specialSequences[g1]) {
    seq = specialSequences[g1][Math.min(freq, 6)] || [Bg.full_a];
  } else {
    const splitType = getSplitForFrequency(Math.min(freq, 6), g1, level);
    seq = getSplitSequence(splitType, Math.min(freq, 6));
  }
  const plan = [];
  const allDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  allDays.forEach(day => {
    const tIdx = trainingDays.indexOf(day);
    if (tIdx >= 0 && seq[tIdx]) {
      const bloc = seq[tIdx];
      const exosWithSets = (bloc.exos||[]).map(id => ({
        id,
        setsReps: getSetsReps(id, level, g1)
      }));
      // Cardio intégré : ajouter cardio_liss à la fin si option choisie et pas déjà là
      if (cardio === 'integre' && !bloc.label.toLowerCase().includes('cardio') && !exosWithSets.some(e=>e.id==='cardio_liss'||e.id==='cardio_hiit')) {
        exosWithSets.push({ id:'cardio_liss', setsReps:'15min' });
      }
      plan.push({ day, label: bloc.label, exos: exosWithSets.map(e=>e.id), exosSets: exosWithSets, isRest: false, isCardio: bloc.label.toLowerCase().includes('cardio') });
    } else if (cardio === 'dedie' && !trainingDays.includes(day) && day !== 'Dimanche') {
      // Jours de repos → cardio léger dédié
      plan.push({ day, label:'Cardio léger', exos:['cardio_liss','planche'], exosSets:[{id:'cardio_liss',setsReps:'30–40min'},{id:'planche',setsReps:'3×60s'}], isRest: false, isCardio: true });
    } else {
      plan.push({ day, label:'Repos', exos:[], exosSets:[], isRest:true });
    }
  });

  // Compétition : ajouter bloc info peak si date renseignée
  if (compDate) {
    const weeksOut = Math.round((new Date(compDate) - Date.now()) / 604800000);
    plan._compInfo = { date: compDate, weeksOut, type: compType };
  }
  plan._levelNote = lp.note;
  plan._level = level;

  return plan;
}

function selectFreq(f) {
  obFreq = f;
  obSelectedDays = []; // reset jours à chaque changement de fréquence
  document.querySelectorAll('.ob-freq-btn').forEach((b, i) => b.classList.toggle('selected', i+1 === f));
}

function renderDayPicker() {
  const grid = document.getElementById('ob-days-grid');
  const sub  = document.getElementById('ob-days-needed');
  if (sub) sub.textContent = obFreq;
  document.getElementById('ob-days-hint').textContent = '';

  const shorts = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  grid.innerHTML = DAYS_FULL.map((day, i) => {
    const sel = obSelectedDays.includes(day);
    return '<div class="ob-day-pick'+(sel?' selected':'')+'" data-day="'+day+'" onclick="toggleDayPick(\''+day+'\')">'+
      '<div class="dp-short">'+shorts[i]+'</div>'+
      '<div class="dp-full">'+day.substring(0,3)+'</div></div>';
  }).join('');
}

function toggleDayPick(day) {
  const hint = document.getElementById('ob-days-hint');
  if (obSelectedDays.includes(day)) {
    obSelectedDays = obSelectedDays.filter(d => d !== day);
  } else {
    if (obSelectedDays.length >= obFreq) {
      hint.textContent = 'Tu as déjà sélectionné ' + obFreq + ' jour(s). Retire-en un d\'abord.';
      return;
    }
    // Maintain week order
    const order = DAYS_FULL;
    obSelectedDays.push(day);
    obSelectedDays.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  hint.textContent = obSelectedDays.length === obFreq ? '✓ Parfait !' :
    'Encore ' + (obFreq - obSelectedDays.length) + ' jour(s) à sélectionner';
  renderDayPicker();
}

function selectMat(m) {
  obMat = m;
  document.querySelectorAll('.ob-mat-btn').forEach(b => b.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
}

// Drag & drop priorités
function renderObGoals() {
  const list = document.getElementById('ob-priority-list');
  if (!list) return;
  list.innerHTML = obGoals.map((g, i) =>
    '<div class="ob-priority-item" draggable="true" data-id="'+g.id+'" '+
    'ondragstart="obDragStart(event,'+i+')" ondragover="obDragOver(event)" ondrop="obDrop(event,'+i+')" ondragend="obDragEnd()">'+
    '<div class="ob-priority-rank">'+(i+1)+'</div>'+
    '<div class="ob-priority-icon">'+g.icon+'</div>'+
    '<div class="ob-priority-text"><strong>'+g.label+'</strong><span>'+g.desc+'</span></div>'+
    '<div class="ob-priority-handle">⠿</div></div>'
  ).join('');
}

function obDragStart(e, i) {
  obDragSrc = i;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function obDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.ob-priority-item').forEach(el => el.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}
function obDrop(e, i) {
  e.preventDefault();
  if (obDragSrc === null || obDragSrc === i) return;
  const moved = obGoals.splice(obDragSrc, 1)[0];
  obGoals.splice(i, 0, moved);
  renderObGoals();
}
function obDragEnd() {
  document.querySelectorAll('.ob-priority-item').forEach(el => { el.classList.remove('dragging'); el.classList.remove('drag-over'); });
  obDragSrc = null;
}

// Preview import manuel
function previewManualImport() {
  const text = document.getElementById('ob-manual-prog').value.trim();
  const preview = document.getElementById('ob-import-preview');
  if (!text) { preview.style.display = 'none'; return; }
  const parsed = parseManualProgram(text);
  preview.style.display = 'block';
  preview.innerHTML = DAYS_FULL.map(day => {
    const val = parsed[day]; if (!val) return '';
    return '<div class="ob-import-day-row"><span class="ob-import-day-badge">'+day.substring(0,3)+'</span><span class="ob-import-day-content">'+val+'</span></div>';
  }).filter(Boolean).join('');
}

function parseManualProgram(text) {
  const result = {};
  const dayAliases = {
    'lun':'Lundi','lundi':'Lundi','mon':'Lundi','monday':'Lundi',
    'mar':'Mardi','mardi':'Mardi','tue':'Mardi','tuesday':'Mardi',
    'mer':'Mercredi','mercredi':'Mercredi','wed':'Mercredi','wednesday':'Mercredi',
    'jeu':'Jeudi','jeudi':'Jeudi','thu':'Jeudi','thursday':'Jeudi',
    'ven':'Vendredi','vendredi':'Vendredi','fri':'Vendredi','friday':'Vendredi',
    'sam':'Samedi','samedi':'Samedi','sat':'Samedi','saturday':'Samedi',
    'dim':'Dimanche','dimanche':'Dimanche','sun':'Dimanche','sunday':'Dimanche'
  };
  const lines = text.split('\n');
  lines.forEach(line => {
    const m = line.match(/^([^:：]+)[：:]\s*(.+)$/);
    if (!m) return;
    const dayRaw = m[1].trim().toLowerCase().replace(/[^a-záàâäéèêëîïôöùûüÿ]/g,'');
    const content = m[2].trim();
    const day = dayAliases[dayRaw];
    if (day) result[day] = content;
  });
  return result;
}

// Render programme généré (step 7)
function renderObGeneratedProgram(plan) {
  const container = document.getElementById('ob-generated-program');
  const summaryEl = document.getElementById('ob-prog-summary');
  if (!container) return;

  // Tags résumé
  const levelLabels = { debutant:'Débutant', intermediaire:'Intermédiaire', avance:'Avancé', competiteur:'Compétiteur' };
  const matLabels   = { salle:'Salle complète', halteres:'Haltères', maison:'Maison' };
  const durLabels   = { 30:'30min', 45:'45min', 60:'1h', 90:'1h30', 120:'2h+' };
  const cardioLabels = { integre:'Cardio intégré', dedie:'Cardio dédié', aucun:'Sans cardio' };

  const tags = [
    { text: obGoals[0]?.icon+' '+obGoals[0]?.label, cls:'' },
    obGoals[1] ? { text: obGoals[1]?.icon+' '+obGoals[1]?.label, cls:'purple' } : null,
    { text: '📆 '+obFreq+'j/sem', cls:'green' },
    { text: matLabels[obMat]||obMat, cls:'orange' },
    { text: durLabels[obDuration]||obDuration+'min', cls:'orange' },
    { text: levelLabels[db.user.level]||db.user.level, cls:'' },
    { text: cardioLabels[obCardio], cls: obCardio==='aucun'?'':'green' },
    obInjuries.length ? { text:'🩹 '+obInjuries.length+' zone(s) ménagée(s)', cls:'orange' } : null
  ].filter(Boolean);

  if (summaryEl) summaryEl.innerHTML = '<div class="ob-prog-tags">'+tags.map(t=>'<span class="ob-prog-tag'+(t.cls?' '+t.cls:'')+'" >'+t.text+'</span>').join('')+'</div>';

  // Bloc compétition
  let compHtml = '';
  if (plan._compInfo) {
    const ci = plan._compInfo;
    const w = ci.weeksOut;
    let advice = '';
    if (w > 12) advice = 'Phase de construction — '+Math.round(w-4)+' semaines de volume, puis 4 semaines de peak.';
    else if (w > 6) advice = 'Phase de force — réduis progressivement le volume, augmente l\'intensité.';
    else if (w > 2) advice = 'Peak — séances courtes, charges lourdes, récupération prioritaire.';
    else advice = 'Deload — séances légères, aucun nouveau max. Préserve ton énergie.';
    compHtml = '<div class="ob-comp-bloc"><div class="ob-comp-bloc-title">🏆 Compétition dans '+w+' semaine'+(w>1?'s':'')+' — '+new Date(ci.date).toLocaleDateString('fr-FR')+'</div><div class="ob-comp-bloc-body">'+advice+'</div></div>';
  }

  // Note niveau
  const levelNote = plan._levelNote ? '<div style="background:rgba(50,215,75,0.08);border:1px solid rgba(50,215,75,0.2);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--green);margin-bottom:14px;">💡 '+plan._levelNote+'</div>' : '';

  container.innerHTML = compHtml + levelNote +
    '<div class="ob-program-card">'+
    plan.filter(d => !d._compInfo).map(d => {
      if (d.isRest) return '<div class="ob-day-card" style="opacity:0.4;"><div class="ob-day-header"><span class="ob-day-name">'+d.day+'</span><span class="ob-day-type">😴 Repos</span></div></div>';
      const exoRows = (d.exosSets||d.exos.map(id=>({id,setsReps:''}))).map(e => {
        const exo = EXO_DB[e.id] || { name: e.id, icon:'💪' };
        return '<span class="ob-exo-tag">'+exo.icon+' '+exo.name+(e.setsReps?' · '+e.setsReps:'')+'</span>';
      }).join('');
      const restColor = d.isCardio ? 'var(--green)' : 'var(--blue)';
      return '<div class="ob-day-card">'+
        '<div class="ob-day-header"><span class="ob-day-name" style="color:'+restColor+'">'+d.day+'</span>'+
        '<span class="ob-day-type">'+(d.isCardio?'🏃 ':'🏋️ ')+'Entraînement</span></div>'+
        '<div class="ob-day-label">'+d.label+'</div>'+
        '<div class="ob-day-exos">'+exoRows+'</div></div>';
    }).join('')+
    '</div>';
}

function autoPopulateKeyLifts() {
  if (db.keyLifts && db.keyLifts.length > 0) return; // déjà configurés

  const lifts = [];

  // Priorité 1 : exercices par défaut du mode actif
  const modeDefaults = modeFeature('defaultKeyLifts') || [];
  if (modeDefaults.length > 0) {
    modeDefaults.forEach(name => {
      lifts.push({ name, target: 0 });
    });
  }

  // Priorité 1b : exercices SBD si mode SBD et renseignés pendant l'onboarding
  if (modeFeature('showSBDCards') && lifts.length === 0) {
    const SBD_DEFAULTS = [
      { key: 'bench',    name: 'Bench press (Barre)', targetKey: 'bench' },
      { key: 'squat',    name: 'Squat (Barre)',        targetKey: 'squat' },
      { key: 'deadlift', name: 'Soulevé de Terre',     targetKey: 'deadlift' }
    ];
    SBD_DEFAULTS.forEach(({ key, name, targetKey }) => {
      if ((db.bestPR[key] || 0) > 0 || (db.user.targets[targetKey] || 0) > 0) {
        lifts.push({ name, target: db.user.targets[targetKey] || 0 });
      }
    });
  }

  // Priorité 2 : exercices du programme généré (si pas de SBD)
  if (lifts.length === 0 && db.generatedProgram) {
    const seen = new Set();
    for (const day of db.generatedProgram) {
      if (day.isRest || day.isCardio || day._compInfo) continue;
      const exos = day.exosSets || (day.exos || []).map(id => ({ id }));
      for (const e of exos) {
        const exo = EXO_DB[e.id];
        if (exo && !seen.has(exo.name) && seen.size < 4) {
          seen.add(exo.name);
          lifts.push({ name: exo.name, target: 0 });
        }
      }
      if (seen.size >= 4) break;
    }
  }

  // Priorité 3 : exercices du programme importé manuellement
  if (lifts.length === 0 && db.routineExos) {
    const seen = new Set();
    for (const day of DAYS_FULL) {
      const exos = getProgExosForDay(day);
      for (const name of exos) {
        if (!seen.has(name) && seen.size < 4 && name) {
          seen.add(name);
          lifts.push({ name, target: 0 });
        }
      }
      if (seen.size >= 4) break;
    }
  }

  if (lifts.length > 0) {
    db.keyLifts = lifts.slice(0, 6);
  }
}

function obFinish() {
  db.user.onboarded = true;
  autoPopulateKeyLifts();
  saveDB();
  hideOnboarding();
  refreshUI();
  renderProgramViewer();
  showToast('Bienvenue ' + (db.user.name||'') + ' ! 🚀');
  // Enchaîner l'onboarding social si user connecté et pas encore de pseudo
  setTimeout(async function() {
    var isLoggedIn = false;
    try {
      if (typeof supaClient !== 'undefined' && supaClient) {
        var session = await supaClient.auth.getSession();
        isLoggedIn = !!(session && session.data && session.data.session);
      }
    } catch(e) {}
    if (isLoggedIn && (!db.social || !db.social.onboardingCompleted)) {
      if (typeof showSocialOnboarding === 'function') showSocialOnboarding();
    }
  }, 500);
}

// ============================================================
// ROUTINE EDITOR (Réglages)
// ============================================================
let editingRoutine = {};
let editingExos = {}; // { Lundi: ['Squat (Barre)', 'Presse', ...], ... }

function renderSettingsRoutineEditor() {
  // Charger l'état actuel
  const currentRoutine = getRoutine();
  editingRoutine = JSON.parse(JSON.stringify(currentRoutine));
  // Charger les exercices sauvegardés
  const savedExos = db.routineExos || {};
  editingExos = {};
  DAYS_FULL.forEach(day => {
    editingExos[day] = savedExos[day]
      ? (Array.isArray(savedExos[day]) ? [...savedExos[day]] : savedExos[day].split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean))
      : [];
  });
  renderExoEditor();
}

function renderExoEditor() {
  const orderedDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const editor = document.getElementById('routineEditor');
  const DAY_ICONS = { Lundi:'🦵', Mardi:'💪', Mercredi:'🏊', Jeudi:'🏋️', Vendredi:'🎯', Samedi:'⚡', Dimanche:'😴' };

  editor.innerHTML = orderedDays.map(day => {
    const label = editingRoutine[day] || '';
    const exos = editingExos[day] || [];
    const isRest = label.toLowerCase().includes('repos') || label.includes('😴') || (!label && !exos.length);
    const count = exos.length;

    return `<div class="prog-day-section" id="prog-section-${day}">
      <div class="prog-day-section-header" onclick="toggleProgSection('${day}')">
        <div class="prog-day-section-name">
          ${DAY_ICONS[day]||'📅'} ${day}
          <input class="prog-day-label-input" type="text" value="${label}" placeholder="${isRest ? 'Repos' : 'Ex: Squat Lourd'}"
            onclick="event.stopPropagation()"
            oninput="editingRoutine['${day}']=this.value;updateProgSectionStyle('${day}')">
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${count > 0 ? `<span class="prog-day-section-count">${count} exo${count>1?'s':''}</span>` : ''}
          <span style="color:var(--sub);font-size:12px;" id="prog-chev-${day}">▾</span>
        </div>
      </div>
      <div id="prog-body-${day}" style="display:none;">
        <div class="prog-exo-list" id="prog-exo-list-${day}">
          ${exos.length === 0
            ? `<div style="color:var(--sub);font-size:12px;padding:6px 0;text-align:center;opacity:0.6;">Aucun exercice — ajouter ci-dessous</div>`
            : exos.map((e, i) => `
              <div class="prog-exo-item" id="prog-exo-${day}-${i}">
                <span class="prog-exo-item-name">${typeof e === 'string' ? e : (e && e.name) || 'Exercice'}</span>
                <button class="prog-exo-del" onclick="removeProgExo('${day}', ${i})" title="Supprimer">✕</button>
              </div>`).join('')
          }
        </div>
        <div class="prog-exo-add-row">
          <input class="prog-exo-add-input" type="text" id="prog-add-${day}"
            placeholder="Ajouter un exercice..."
            onkeydown="if(event.key==='Enter')addProgExo('${day}')">
          <button class="prog-exo-add-btn" onclick="addProgExo('${day}')">+ Ajouter</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleProgSection(day) {
  const body = document.getElementById('prog-body-' + day);
  const chev = document.getElementById('prog-chev-' + day);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (chev) chev.textContent = open ? '▾' : '▴';
}

function addProgExo(day) {
  const inp = document.getElementById('prog-add-' + day);
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  if (!editingExos[day]) editingExos[day] = [];
  editingExos[day].push(val);
  inp.value = '';
  // Re-render juste la liste + compteur
  const listEl = document.getElementById('prog-exo-list-' + day);
  const sectionEl = document.getElementById('prog-section-' + day);
  if (listEl) {
    listEl.innerHTML = editingExos[day].map((e, i) => `
      <div class="prog-exo-item" id="prog-exo-${day}-${i}">
        <span class="prog-exo-item-name">${typeof e === 'string' ? e : (e && e.name) || 'Exercice'}</span>
        <button class="prog-exo-del" onclick="removeProgExo('${day}', ${i})" title="Supprimer">✕</button>
      </div>`).join('');
  }
  // Mettre à jour le compteur dans le header
  updateProgCounter(day);
  inp.focus();
}

function removeProgExo(day, idx) {
  if (!editingExos[day]) return;
  editingExos[day].splice(idx, 1);
  const listEl = document.getElementById('prog-exo-list-' + day);
  if (listEl) {
    listEl.innerHTML = editingExos[day].length === 0
      ? `<div style="color:var(--sub);font-size:12px;padding:6px 0;text-align:center;opacity:0.6;">Aucun exercice — ajouter ci-dessous</div>`
      : editingExos[day].map((e, i) => `
          <div class="prog-exo-item" id="prog-exo-${day}-${i}">
            <span class="prog-exo-item-name">${typeof e === 'string' ? e : (e && e.name) || 'Exercice'}</span>
            <button class="prog-exo-del" onclick="removeProgExo('${day}', ${i})" title="Supprimer">✕</button>
          </div>`).join('');
  }
  updateProgCounter(day);
}

function updateProgCounter(day) {
  const count = (editingExos[day] || []).length;
  const header = document.querySelector(`#prog-section-${day} .prog-day-section-count`);
  if (header) { header.textContent = count + ' exo' + (count > 1 ? 's' : ''); header.style.display = count > 0 ? '' : 'none'; }
  else if (count > 0) {
    const nameEl = document.querySelector(`#prog-section-${day} .prog-day-section-name`);
    if (nameEl) { const badge = document.createElement('span'); badge.className = 'prog-day-section-count'; badge.textContent = count + ' exo' + (count > 1 ? 's' : ''); nameEl.parentElement.insertBefore(badge, nameEl.nextSibling); }
  }
}

function updateProgSectionStyle(day) { /* réactivité label — rien à faire */ }

function saveRoutine() {
  // Lire les labels depuis les inputs
  DAYS_FULL.forEach(day => {
    const inp = document.getElementById('rdInput_' + day);
    if (inp) editingRoutine[day] = inp.value.trim();
    // Récupérer aussi depuis les prog-day-label-input
    const labelInp = document.querySelector(`#prog-section-${day} .prog-day-label-input`);
    if (labelInp) editingRoutine[day] = labelInp.value.trim();
  });
  db.routine = JSON.parse(JSON.stringify(editingRoutine));
  // Sauvegarder les listes d'exercices (format tableau)
  if (!db.routineExos) db.routineExos = {};
  DAYS_FULL.forEach(day => { db.routineExos[day] = editingExos[day] || []; });
  saveDB();
  showToast('✓ Programme sauvegardé !');
  renderDash();
}


// ============================================================
// TAB NAVIGATION
// ============================================================
let activeSeancesSub = 'seances-list';
let activeProfilSub = 'tab-corps';

function showSeancesSub(id, btn) {
  activeSeancesSub = id;
  document.querySelectorAll('.seances-sub-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#tab-seances .stats-sub-pill').forEach(el => el.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'seances-list') renderSeancesTab();
  if (id === 'seances-go') renderGoTab();
  if (id === 'seances-programme') {
    var oldPgm = document.getElementById('programmeV2Content');
    if (oldPgm) oldPgm.innerHTML = '';
    renderProgramBuilder();
  }
  if (id === 'seances-coach') renderCoachTab();
}

function showJeuxSub(id, btn) {
  document.querySelectorAll('#tab-game .jeux-sub-section').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('#tab-game > .stats-sub-nav .stats-sub-pill').forEach(function(el) { el.classList.remove('active'); });
  var sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  try { localStorage.setItem('activeJeuxSub', id); } catch(e) {}
}

function showProfilSub(id, btn) {
  activeProfilSub = id;
  document.querySelectorAll('.profil-sub-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#tab-profil > .stats-sub-nav .stats-sub-pill').forEach(el => el.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'tab-corps') renderCorpsTab();
  if (id === 'tab-settings') fillSettingsFields();
  // Stats dans le profil — rediriger vers le vrai onglet Stats
  if (id === 'tab-profil-stats') {
    showTab('tab-stats');
    return;
  }
  // Afficher les badges dans le profil — rendre dans tab-game puis copier le HTML
  if (id === 'tab-profil-badges') {
    if (typeof renderGamificationTab === 'function') renderGamificationTab();
    var badgesContainer = document.getElementById('profil-badges-content');
    var gameEl = document.getElementById('tab-game');
    if (badgesContainer && gameEl) {
      badgesContainer.innerHTML = gameEl.innerHTML;
    }
  }
}

var _lastTabIndex = 0;
var _scrollPositions = {};
var _skipPushState = false;

function showTab(tabId, opts) {
  opts = opts || {};
  // Save scroll position of current tab before switching
  if (_currentTab) {
    _scrollPositions[_currentTab] = window.scrollY;
  }
  // Destroy charts of the previous tab to free memory
  if (_currentTab && _currentTab !== tabId) _destroyTabCharts(_currentTab);
  // Determine slide direction
  var newBtn = document.querySelector('.tab-btn[data-tab="'+tabId+'"]');
  var newIndex = newBtn ? parseInt(newBtn.dataset.index||'0') : 0;
  var slideClass = newIndex > _lastTabIndex ? 'slide-in-right' : 'slide-in-left';
  _lastTabIndex = newIndex;
  _currentTab = tabId;
  document.querySelectorAll('.content-section').forEach(el => { el.classList.remove('active','slide-in-right','slide-in-left'); });
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  var target = document.getElementById(tabId);
  if (target) { target.classList.add('active', slideClass); }
  if (newBtn) newBtn.classList.add('active');
  if (tabId==='tab-dash') renderDash();
  if (tabId==='tab-seances') {
    if (activeSeancesSub === 'seances-go') renderGoTab();
    else renderSeancesTab();
  }
  if (tabId==='tab-stats') { showStatsSub(activeStatsSub, document.querySelector('.stats-sub-pill.active')); }
  if (tabId==='tab-ai') { renderReportsTimeline(); markReportsRead(); renderCoachAlgoAI(); }
  if (tabId==='tab-game') {
    renderGamificationTab();
    // Restore last active sub-tab (default: jeux-profil-joueur)
    var savedJeuxSub = null;
    try { savedJeuxSub = localStorage.getItem('activeJeuxSub'); } catch(e) {}
    var validSubs = ['jeux-profil-joueur','jeux-rangs','jeux-badges'];
    if (validSubs.indexOf(savedJeuxSub) < 0) savedJeuxSub = 'jeux-profil-joueur';
    var targetBtn = document.querySelector('#tab-game > .stats-sub-nav .stats-sub-pill[onclick*="'+savedJeuxSub+'"]');
    if (typeof showJeuxSub === 'function') showJeuxSub(savedJeuxSub, targetBtn);
  }
  if (tabId==='tab-profil') {
    if (activeProfilSub === 'tab-settings') fillSettingsFields();
    else renderCorpsTab();
  }
  if (tabId==='tab-social') { initSocialTab(); }

  // Restore scroll position for the new tab
  requestAnimationFrame(function() { window.scrollTo(0, _scrollPositions[tabId] || 0); });

  // Persist active tab
  try { localStorage.setItem('activeTab', tabId); } catch(e) {}

  // History API — push state for back button navigation
  if (!_skipPushState && !opts.noPush) {
    history.pushState({ tab: tabId }, '', '#' + tabId);
  }

  // Haptic feedback
  if (navigator.vibrate) try { navigator.vibrate(10); } catch(e) {}
}

// Back button (popstate) handler
window.addEventListener('popstate', function(e) {
  if (e.state && e.state.tab) {
    _skipPushState = true;
    showTab(e.state.tab);
    _skipPushState = false;
  }
});

// Tab bar click handler
document.querySelector('.tab-bar').addEventListener('click', e => { const b = e.target.closest('.tab-btn'); if (b) showTab(b.dataset.tab); });

// Close session-card dropdowns on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.sc-dropdown') && !e.target.closest('.sc-menu-btn')) {
    if (typeof closeAllScMenus === 'function') closeAllScMenus();
  }
});

// On load: restore tab from hash or localStorage
// Deferred via setTimeout(0) so all top-level const/var declarations (SECRET_QUESTS,
// PLAYER_CLASSES, SBD_TIERS, etc.) finish evaluating before renderGamificationTab fires.
(function _restoreTab() {
  var hash = window.location.hash.replace('#', '');
  if (hash === 'admin') return; // handled elsewhere
  var saved = null;
  try { saved = localStorage.getItem('activeTab'); } catch(e) {}
  var validTabs = ['tab-dash','tab-social','tab-seances','tab-profil','tab-stats','tab-ai','tab-game'];
  var target = validTabs.indexOf(hash) >= 0 ? hash : (validTabs.indexOf(saved) >= 0 ? saved : 'tab-dash');
  setTimeout(function() {
    _skipPushState = true;
    try { showTab(target); } catch(e) { console.error('restoreTab showTab error:', e); }
    _skipPushState = false;
    try { history.replaceState({ tab: target }, '', '#' + target); } catch(e) {}
  }, 0);
})();
document.getElementById('dayButtonsContainer').addEventListener('click', e => { const b = e.target.closest('.day-btn'); if (!b) return; selectedDay = b.dataset.day; document.querySelectorAll('.day-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); document.getElementById('routineDisplay').textContent = getRoutine()[selectedDay] || '—'; renderDayExercises(selectedDay); });

// ============================================================
// GAMIFICATION — XP, NIVEAUX, BADGES
// ============================================================
const XP_LEVELS = [
  { level:1,  name:'Âme errante',             xp:0,       icon:'👻' },
  { level:2,  name:'Porteur de lame',         xp:500,     icon:'🗡️' },
  { level:3,  name:'Recrue du Rukongai',      xp:1500,    icon:'🏘️' },
  { level:4,  name:'Élève de l\'Académie',    xp:3500,    icon:'📜' },
  { level:5,  name:'Faucheur d\'âmes',        xp:6000,    icon:'💀' },
  { level:6,  name:'Lame nommée',             xp:10000,   icon:'⚔️' },
  { level:7,  name:'Gardien de division',     xp:16000,   icon:'🛡️' },
  { level:8,  name:'Chasseur de Hollows',     xp:24000,   icon:'👹' },
  { level:9,  name:'Porteur du masque',       xp:35000,   icon:'🎭' },
  { level:10, name:'Lame libérée',            xp:50000,   icon:'✨' },
  { level:11, name:'Bras droit du Capitaine', xp:70000,   icon:'💪' },
  { level:12, name:'Maître de division',      xp:95000,   icon:'🏯' },
  { level:13, name:'Éveilleur de Bankai',     xp:125000,  icon:'🔥' },
  { level:14, name:'Lame finale',             xp:160000,  icon:'⚡' },
  { level:15, name:'Dévoreur de mondes',      xp:200000,  icon:'🌑' },
  { level:16, name:'Sang Royal',              xp:240000,  icon:'👑' },
  { level:17, name:'Fléau du Seireitei',      xp:280000,  icon:'🌊' },
  { level:18, name:'Flamme millénaire',       xp:320000,  icon:'🔱' },
  { level:19, name:'Trancheur de ciel',       xp:360000,  icon:'⛩️' },
  { level:20, name:'L\'Ombre qui marche',     xp:400000,  icon:'🌒' },
  { level:21, name:'Forgeur d\'âmes',         xp:430000,  icon:'⚒️' },
  { level:22, name:'Au-delà de la lame',      xp:455000,  icon:'🌟' },
  { level:23, name:'Gardien du Trône',        xp:475000,  icon:'🏰' },
  { level:24, name:'Dieu déchu',              xp:490000,  icon:'💫' },
  { level:25, name:'Roi des Âmes',            xp:500000,  icon:'👁️' },
];

const BADGE_THRESHOLDS = {
  male: {
    bench:    [60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300],
    squat:    [80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 350],
    deadlift: [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 350, 400],
    ohp:      [40, 60, 80, 100, 120, 140]
  },
  female: {
    bench:    [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150],
    squat:    [50, 65, 80, 95, 110, 125, 140, 155, 170, 185, 200, 220, 250],
    deadlift: [60, 75, 90, 105, 120, 135, 150, 170, 190, 210, 230, 260, 300],
    ohp:      [20, 30, 40, 50, 60, 70]
  }
};

function getAllBadges() {
  const streak = calcStreak();
  const b = [];
  const B = db.bestPR.bench||0, S = db.bestPR.squat||0, D = db.bestPR.deadlift||0;
  const _gender = (db.user.gender === 'female') ? 'female' : 'male';
  const _bt = BADGE_THRESHOLDS[_gender];

  // ── Stats pré-calculées (single pass) ──
  let totalVol = 0, maxSessVol = 0, totalSets = 0, ohpRM = 0, maxSessDur = 0, totalDur = 0;
  const _uniqueExos = new Set();
  const bw = db.user.bw||0;
  const _ohpRe = /overhead|militaire|\bohp\b|press mil/i;
  db.logs.forEach(l => {
    totalVol += (l.volume||0);
    if ((l.volume||0) > maxSessVol) maxSessVol = l.volume||0;
    let sessSets = 0;
    (l.exercises||[]).forEach(e => {
      sessSets += (e.sets||0);
      _uniqueExos.add(e.name);
      if (_ohpRe.test(e.name) && (e.maxRM||0) > ohpRM) ohpRM = e.maxRM;
    });
    totalSets += sessSets;
    const dur = l.duration || (sessSets * 210);
    if (dur > maxSessDur) maxSessDur = dur;
    totalDur += dur;
  });
  const uniqueExos = _uniqueExos.size;
  const total       = B+S+D;

  // ── Séances ──
  b.push({id:'s1',    r:'common',    icon:'🎯', name:'Reçu à l\'Examen',          ref:'Bleach', desc:'Première séance — bienvenue à l\'Académie des Shinigamis', condition:'1 séance', ck:()=>db.logs.length>=1});
  b.push({id:'s10',   r:'uncommon',  icon:'📜', name:'Carte Shinigami',            ref:'Bleach', desc:'10 séances — ton diplôme de Shinigami est officiellement validé', condition:'10 séances', ck:()=>db.logs.length>=10});
  b.push({id:'s25',   r:'uncommon',  icon:'🏘️', name:'Aventurier d\'Astrub',       ref:'Dofus',  desc:'25 séances — tu quittes enfin le tutoriel d\'Astrub', condition:'25 séances', ck:()=>db.logs.length>=25});
  b.push({id:'s50',   r:'rare',      icon:'⭐', name:'Siège au Seireitei',         ref:'Bleach', desc:'50 séances — on t\'attribue enfin un siège dans une division', condition:'50 séances', ck:()=>db.logs.length>=50});
  b.push({id:'s75',   r:'rare',      icon:'🛡️', name:'Chevalier de Bonta',         ref:'Dofus',  desc:'75 séances — la milice de Bonta te reconnaît comme l\'un des siens', condition:'75 séances', ck:()=>db.logs.length>=75});
  b.push({id:'s100',  r:'epic',      icon:'🌟', name:'Centurion',                  ref:'Bleach', desc:'100 séances — même un vice-capitaine te respecte désormais', condition:'100 séances', ck:()=>db.logs.length>=100});
  b.push({id:'s200',  r:'epic',      icon:'🎓', name:'Maître de Guilde',           ref:'Dofus',  desc:'200 séances — ta guilde te suit les yeux fermés en toutes circonstances', condition:'200 séances', ck:()=>db.logs.length>=200});
  b.push({id:'s300',  r:'epic',      icon:'⚔️', name:'Vice-Capitaine',             ref:'Bleach', desc:'300 séances — le haori blanc t\'attend au bout du couloir du Gotei 13', condition:'300 séances', ck:()=>db.logs.length>=300});
  b.push({id:'s365',  r:'legendary', icon:'🌍', name:'Tour du Monde des Douze',    ref:'Dofus',  desc:'365 séances — tu as parcouru les 12 nations sans jamais fléchir', condition:'365 séances', ck:()=>db.logs.length>=365});
  b.push({id:'s500',  r:'legendary', icon:'💀', name:'Capitaine du Gotei 13',      ref:'Bleach', desc:'500 séances — Yamamoto en personne t\'a nommé à la tête d\'une division', condition:'500 séances', ck:()=>db.logs.length>=500});
  b.push({id:'s750',  r:'mythic',    icon:'🥚', name:'Gardien des 6 Dofus',        ref:'Dofus',  desc:'750 séances — les six œufs légendaires sont sous ta garde exclusive', condition:'750 séances', ck:()=>db.logs.length>=750});
  b.push({id:'s1000', r:'divine',    icon:'🔥', name:'Bankai Éternel',             ref:'Bleach', desc:'1000 séances — ton Bankai ne se désactive plus jamais. Tu ES ton Bankai', condition:'1000 séances', ck:()=>db.logs.length>=1000});

  // ── Volume par séance (max session) ──
  b.push({id:'vs1',   r:'common',    icon:'🪨', name:'Tonneau d\'Astrub',           ref:'Dofus',  desc:'1t en une séance — les marchands d\'Astrub notent ton premier passage', condition:'1t en 1 séance', ck:()=>maxSessVol>=1000});
  b.push({id:'vs3',   r:'common',    icon:'🚛', name:'Porteur de Pandawa',           ref:'Dofus',  desc:'3t — même un Pandawa sobre ne porterait pas plus sans tituber', condition:'3t en 1 séance', ck:()=>maxSessVol>=3000});
  b.push({id:'vs5',   r:'uncommon',  icon:'⚡', name:'Reishi Compressé',             ref:'Bleach', desc:'5t — ton énergie spirituelle commence à peser comme des particules Reishi', condition:'5t en 1 séance', ck:()=>maxSessVol>=5000});
  b.push({id:'v10t',  r:'rare',      icon:'🏗️', name:'Forgeron de Bonta',            ref:'Dofus',  desc:'10t en une séance — les forges de Bonta s\'inclinent devant ton labeur', condition:'10t en 1 séance', ck:()=>maxSessVol>=10000});
  b.push({id:'vs20',  r:'epic',      icon:'💥', name:'Bankai Partiel',               ref:'Bleach', desc:'20t — ta libération commence à faire trembler les murs de la salle', condition:'20t en 1 séance', ck:()=>maxSessVol>=20000});
  b.push({id:'vs30',  r:'legendary', icon:'🌊', name:'Chaos d\'Ogrest',              ref:'Dofus',  desc:'30t — Ogrest lui-même a pleuré moins de tonnes en une seule journée', condition:'30t en 1 séance', ck:()=>maxSessVol>=30000});
  b.push({id:'vs40',  r:'mythic',    icon:'🌑', name:'Mugetsu',                      ref:'Bleach', desc:'40t — tout ou rien. Tu brûles tout ce que tu as en une seule séance', condition:'40t en 1 séance', ck:()=>maxSessVol>=40000});
  b.push({id:'vs50',  r:'divine',    icon:'✨', name:'Dieu Iop',                     ref:'Dofus',  desc:'50t en une séance — Goultard le Barbare en personne s\'incline', condition:'50t en 1 séance', ck:()=>maxSessVol>=50000});
  b.push({id:'vs100', r:'divine',    icon:'💀', name:'Mais t\'es malade ?',          ref:'—',      desc:'100t en une séance — appelle un médecin, pas un coach', impossible:true, condition:'100t en 1 séance', ck:()=>false});

  // ── Volume cumulatif total ──
  b.push({id:'vt10',    r:'common',    icon:'⛏️', name:'Apprenti Forgeron',           ref:'Dofus',  desc:'10t cumulées — la forge ne fait que commencer', condition:'10t cumulées', ck:()=>totalVol>=10000});
  b.push({id:'vt50',    r:'common',    icon:'⚒️', name:'Artisan d\'Astrub',            ref:'Dofus',  desc:'50t — tes premiers pas d\'artisan sont validés par la guilde', condition:'50t cumulées', ck:()=>totalVol>=50000});
  b.push({id:'vt100',   r:'uncommon',  icon:'⚔️', name:'Lame Forgée',                 ref:'Bleach', desc:'100t — ton zanpakuto prend enfin une forme reconnaissable', condition:'100t cumulées', ck:()=>totalVol>=100000});
  b.push({id:'vt250',   r:'rare',      icon:'🩸', name:'Sacrieur Éprouvé',            ref:'Dofus',  desc:'250t — la douleur est devenue ton alliée la plus fidèle', condition:'250t cumulées', ck:()=>totalVol>=250000});
  b.push({id:'vt500',   r:'epic',      icon:'⚡', name:'Shikai du Tonnage',           ref:'Bleach', desc:'500t — ton zanpakuto rugit de satisfaction à chaque kilo supplémentaire', condition:'500t cumulées', ck:()=>totalVol>=500000});
  b.push({id:'vt1000',  r:'legendary', icon:'🗺️', name:'Sculpteur du Monde',          ref:'Dofus',  desc:'1000t cumulées — assez pour remodeler les continents des Douze nations', condition:'1000t cumulées', ck:()=>totalVol>=1000000});
  b.push({id:'vt2500',  r:'mythic',    icon:'🌑', name:'Gravure du Zanpakuto',        ref:'Bleach', desc:'2500t — ton nom est gravé dans la lame pour l\'éternité', condition:'2500t cumulées', ck:()=>totalVol>=2500000});
  b.push({id:'vt5000',  r:'divine',    icon:'🌍', name:'Gardien des Douze',           ref:'Dofus',  desc:'5000t — les 12 dieux reconnaissent enfin l\'étendue de ton labeur', condition:'5000t cumulées', ck:()=>totalVol>=5000000});
  b.push({id:'vt7500',  r:'divine',    icon:'👁️', name:'Kenpachi du Volume',          ref:'Bleach', desc:'7500t — tu cherches encore plus fort. Toujours plus fort. Sans jamais t\'arrêter', condition:'7500t cumulées', ck:()=>totalVol>=7500000});
  b.push({id:'vt10000', r:'divine',    icon:'🌌', name:'Krosmoz',                     ref:'Dofus',  desc:'10 000t cumulées — tu dépasses le monde des Douze. Tu ES le Krosmoz', condition:'10 000t cumulées', ck:()=>totalVol>=10000000});

  // ── Durée de séance (max) ──
  b.push({id:'dur60',  r:'common',    icon:'⏱️', name:'Première Heure',             ref:'Dofus',  desc:'1h — le temps d\'un donjon Astrub en solo. Pas mal pour commencer', condition:'1h en 1 séance', ck:()=>maxSessDur>=3600});
  b.push({id:'dur90',  r:'uncommon',  icon:'🌲', name:'Entraînement de Division',   ref:'Bleach', desc:'1h30 — un entraînement standard au Seireitei entre deux missions', condition:'1h30 en 1 séance', ck:()=>maxSessDur>=5400});
  b.push({id:'dur120', r:'rare',      icon:'🏰', name:'Donjon Majeur',              ref:'Dofus',  desc:'2h — le temps d\'un donjon de haut niveau avec une bonne équipe', condition:'2h en 1 séance', ck:()=>maxSessDur>=7200});
  b.push({id:'dur150', r:'epic',      icon:'⚔️', name:'Dangai Training',            ref:'Bleach', desc:'2h30 — Ichigo s\'entraînait dans le Dangai avant l\'affrontement final', condition:'2h30 en 1 séance', ck:()=>maxSessDur>=9000});
  b.push({id:'dur180', r:'legendary', icon:'⏰', name:'Maître du Temps',            ref:'Dofus',  desc:'3h — même Xelor est impressionné par ta maîtrise du tempo', condition:'3h en 1 séance', ck:()=>maxSessDur>=10800});
  b.push({id:'dur240', r:'mythic',    icon:'🌑', name:'Retraite de Seireitei',      ref:'Bleach', desc:'4h — comme Byakuya en méditation solitaire avant d\'activer son Bankai', condition:'4h en 1 séance', ck:()=>maxSessDur>=14400});
  b.push({id:'dur480', r:'divine',    icon:'🛋️', name:'T\'es au chômage ?',         ref:'—',      desc:'8h en une séance — c\'est une journée de boulot. Appelle tes proches', impossible:true, condition:'8h en 1 séance', ck:()=>false});

  // ── Temps d\'entraînement cumulatif ──
  b.push({id:'tdur50',   r:'uncommon',  icon:'🕐', name:'50 Heures de Forge',         ref:'Dofus',  desc:'50h cumulées — un forgeron de Bonta met moins de temps pour une épée légendaire', condition:'50h cumulées', ck:()=>totalDur>=180000});
  b.push({id:'tdur100',  r:'rare',      icon:'🕑', name:'Siège Confirmé',             ref:'Bleach', desc:'100h — ta place au Seireitei n\'est plus discutable pour personne', condition:'100h cumulées', ck:()=>totalDur>=360000});
  b.push({id:'tdur250',  r:'epic',      icon:'🕒', name:'Maîtrise du Reishi',         ref:'Bleach', desc:'250h — ton énergie spirituelle prend une forme permanente et visible', condition:'250h cumulées', ck:()=>totalDur>=900000});
  b.push({id:'tdur500',  r:'legendary', icon:'🕓', name:'Reiatsu Écrasant',           ref:'Bleach', desc:'500h — les gens autour de toi commencent à sentir ta présence involontaire', condition:'500h cumulées', ck:()=>totalDur>=1800000});
  b.push({id:'tdur1000', r:'divine',    icon:'🕔', name:'Millénaire des Douze',        ref:'Dofus',  desc:'1000h — mille heures gravées dans l\'histoire du monde des Douze nations', condition:'1000h cumulées', ck:()=>totalDur>=3600000});
  b.push({id:'tdur1500', r:'divine',    icon:'🌒', name:'Bankai Final',               ref:'Bleach', desc:'1500h — même Yamamoto regardait avec respect ceux qui avaient autant forgé', condition:'1500h cumulées', ck:()=>totalDur>=5400000});
  b.push({id:'tdur2000', r:'divine',    icon:'⚗️', name:'Dieu Forgeron',              ref:'Dofus',  desc:'2000h — les dieux des Douze eux-mêmes n\'ont pas forgé autant dans leur vie', condition:'2000h cumulées', ck:()=>totalDur>=7200000});

  // ── Séries totales ──
  b.push({id:'st100',   r:'common',    icon:'📊', name:'Recrue du Seireitei',         ref:'Bleach', desc:'100 séries — les officiers du Seireitei commencent à te remarquer', condition:'100 séries', ck:()=>totalSets>=100});
  b.push({id:'st500',   r:'uncommon',  icon:'🛡️', name:'Guerrier de Bonta',           ref:'Dofus',  desc:'500 séries — la milice de Bonta t\'inscrit dans ses rangs officiels', condition:'500 séries', ck:()=>totalSets>=500});
  b.push({id:'st1000',  r:'rare',      icon:'🩸', name:'Sacrieur Confirmé',           ref:'Dofus',  desc:'1000 séries de douleur — ton corps est devenu un véritable temple sacré', condition:'1000 séries', ck:()=>totalSets>=1000});
  b.push({id:'st2500',  r:'epic',      icon:'⚡', name:'Libération Shikai',           ref:'Bleach', desc:'2500 séries — ta lame intérieure se libère enfin et révèle son vrai nom', condition:'2500 séries', ck:()=>totalSets>=2500});
  b.push({id:'st5000',  r:'legendary', icon:'🌍', name:'Conquérant des Douze',        ref:'Dofus',  desc:'5000 séries — les 12 nations connaissent ton nom et tremblent', condition:'5000 séries', ck:()=>totalSets>=5000});
  b.push({id:'st10000', r:'mythic',    icon:'💥', name:'Les 10 000 Coups',            ref:'Bleach', desc:'10 000 séries — Yamamoto frappait 10 000 fois par jour depuis des siècles', condition:'10 000 séries', ck:()=>totalSets>=10000});
  b.push({id:'st20000', r:'divine',    icon:'🌌', name:'Ascension Divine',            ref:'Dofus',  desc:'20 000 séries — tu dépasses le plan mortel et entres dans la légende des Douze', condition:'20 000 séries', ck:()=>totalSets>=20000});
  b.push({id:'st40000', r:'divine',    icon:'🔥', name:'Forme Finale Absolue',        ref:'Bleach', desc:'40 000 séries — au-delà du Bankai. Au-delà de tout ce qui existe', condition:'40 000 séries', ck:()=>totalSets>=40000});

  // ── Exercices uniques maîtrisés ──
  b.push({id:'ex10',  r:'common',    icon:'📚', name:'Carnet d\'Astrub',             ref:'Dofus',  desc:'10 exercices — le carnet de l\'apprenti commence à se remplir', condition:'10 exercices', ck:()=>uniqueExos>=10});
  b.push({id:'ex25',  r:'uncommon',  icon:'📖', name:'Polyvalent du Gotei',          ref:'Bleach', desc:'25 exercices — tu maîtrises Kidō, Zanjutsu et Hakuda à la fois', condition:'25 exercices', ck:()=>uniqueExos>=25});
  b.push({id:'ex50',  r:'rare',      icon:'🗺️', name:'Encyclopédie des Douze',       ref:'Dofus',  desc:'50 exercices — les 12 nations n\'ont plus de secrets pour toi', condition:'50 exercices', ck:()=>uniqueExos>=50});
  b.push({id:'ex75',  r:'epic',      icon:'🌀', name:'Érudit d\'Urahara',            ref:'Bleach', desc:'75 exercices — même Kisuke serait impressionné par ta pluridisciplinarité', condition:'75 exercices', ck:()=>uniqueExos>=75});
  b.push({id:'ex100', r:'legendary', icon:'📜', name:'Maître de toutes les Classes', ref:'Dofus',  desc:'100 exercices — Iop, Sacrieur, Pandawa... tu les incarnes tous à la fois', condition:'100 exercices', ck:()=>uniqueExos>=100});


  // ── Bench Press (only if SBD mode) ──
  if (modeFeature('showSBDCards')) {
  const _benchRarities = ['common','common','uncommon','uncommon','rare','rare','rare','epic','epic','epic','legendary','legendary','mythic'];
  const _benchIcons = ['🌱','💪','⚔️','🩸','⚡','🏰','🌀','🪓','🌊','🔥','❄️','👁️','💥'];
  const _benchNames = ["L'Apprenti d'Astrub","Cogneur de la Milice","Iop Authentique","Sacrieur de la Fonte","Shikai Débloqué","Champion de Brakmar","Reishi Condensé","Goultard le Barbare","Reiatsu d'Élite","Fracture du Temps","Lame de Glace de Rukia","Kenpachi Sans Bandeau","BANKAI — Pectoraux"];
  const _benchRefs = ['Dofus','Dofus','Dofus','Dofus','Bleach','Dofus','Bleach','Dofus','Bleach','Bleach','Bleach','Bleach','Bleach'];
  const _benchDescs = ["Astrub reconnaît tes efforts. La forge ne fait que commencer","Les miliciens d'Astrub s'écartent sur ton passage","Force avant tout — l'intelligence peut attendre selon les Iops","Ta douleur est ton carburant — sang et acier mêlés","Ton zanpakuto pectoraux a enfin révélé sa vraie forme","Même les forces obscures de Brakmar fléchissent devant toi","Ton aura déborde — les plafonds de la salle tremblent","Tu atteins la légende du plus grand des Iops de l'histoire","Ton reiatsu commence à impressionner les capitaines du Gotei","Tout sacrifier pour un PR — ta lame brise le temps lui-même","Ton press glace l'atmosphère — Sode no Shirayuki s'incline","Il a retiré son bandeau — il te voit enfin comme un rival digne","Forme finale. Byakuya pose Senbonzakura pour t'admirer"];
  _bt.bench.forEach((kg,i)=>b.push({id:`bench_${kg}`,r:_benchRarities[i]||'mythic',icon:_benchIcons[i]||'💥',name:_benchNames[i]||('Bench '+kg+'kg'),ref:_benchRefs[i]||'Bleach',desc:_benchDescs[i]||('Bench press '+kg+'kg'),condition:'Bench '+kg+'kg',ck:()=>B>=kg}));

  // ── Squat ──
  const _squatRarities = ['common','common','uncommon','uncommon','rare','rare','rare','epic','epic','epic','legendary','legendary','mythic'];
  const _squatIcons = ['🦵','🐼','🌲','💧','⚔️','🌀','🌳','🩸','🌊','👻','✨','🔥','🌌'];
  const _squatNames = ["Cavalier de Dragodinde","Pandawa en Transe","Racines d'Amakna","Flux de Reishi","Guerrier du Seireitei","Aura Condensée","Ancré comme un Sadida","Iop Transcendé","Déferlante d'Ogrest","Reiatsu Oppressant","Bankai des Jambes","Flamme de Yamamoto","Chaos Primordial"];
  const _squatRefs = ['Dofus','Dofus','Dofus','Bleach','Bleach','Bleach','Dofus','Dofus','Dofus','Bleach','Bleach','Bleach','Dofus'];
  const _squatDescs = ["Tes cuisses portent ta Dragodinde avec fierté et aisance","L'ivresse de l'acier — la sagesse du Bambou sacré","Tes jambes sont enracinées comme les arbres de la forêt d'Amakna","Ton énergie spirituelle descend dans tes jambes à chaque rep","Pour l'honneur du Gotei — Renji Abarai serait jaloux","Ton aura se condense jusqu'aux genoux à chaque répétition","Les arbres-poupées du Sadida sont jaloux de la force de tes cuisses","Tu dépasses la simple force brute — même un dieu-Iop t'envie","Là où tu squattes, le sol s'en souvient pour toujours","Ton reiatsu involontaire fait plier les genoux des autres clients","Tu as transcendé les limites — la forme finale est atteinte","300kg — Yamamoto lui-même salue cette chaleur dans ses jambes","Au-delà du monde des Douze — tu existes dans l'Extérieur"];
  _bt.squat.forEach((kg,i)=>b.push({id:`squat_${kg}`,r:_squatRarities[i]||'mythic',icon:_squatIcons[i]||'🌌',name:_squatNames[i]||('Squat '+kg+'kg'),ref:_squatRefs[i]||'Dofus',desc:_squatDescs[i]||('Squat '+kg+'kg'),condition:'Squat '+kg+'kg',ck:()=>S>=kg}));

  // ── Deadlift ──
  const _deadRarities = ['common','common','uncommon','uncommon','rare','rare','rare','epic','epic','epic','legendary','legendary','mythic'];
  const _deadIcons = ['⚒️','🌲','🌑','👁️','🔥','🩸','⚡','🌊','❄️','🌑','🏆','💥','🔥'];
  const _deadNames = ["Forgeron d'Amakna","Bûcheron Musclé","Ombre du Seireitei","Kenpachi t'a Senti","Flamme d'Amaterasu","Sacrieur Transcendé","Shunpo du Sol","Chaos d'Ogrest","Sode no Shirayuki","Getsuga Tensho","Les Trois Cents","Mugetsu du Sol","Zanka no Tachi"];
  const _deadRefs = ['Dofus','Dofus','Bleach','Bleach','Bleach','Dofus','Bleach','Dofus','Bleach','Bleach','Dofus','Bleach','Bleach'];
  const _deadDescs = ["Les forges d'Amakna te font confiance pour le premier lingot","Plus solide que les arbres millénaires de la forêt d'Amakna","Tu tires depuis l'ombre — comme les agents de la Division 2","Il a senti ton reiatsu depuis les profondeurs du Seireitei","Ta barre brûle comme la flamme noire inextinguible de Yamamoto","La douleur du bas du dos t'alimente comme rien d'autre ne peut","Tes mains attrapent la barre avec la vitesse du pas flash","Même Ogrest n'aurait pas osé soulever un tel poids du sol","Ton deadlift gèle l'air ambiant — Rukia approuve dans l'ombre","Ton cri intérieur libère une énergie obscure et dévastatrice","Les 12 Dieux s'inclinent ensemble devant ce chiffre légendaire","Tout ou rien — comme Ichigo face au Roi des Quincies","Yamamoto libère la flamme ultime — ton deadlift en est l'écho"];
  _bt.deadlift.forEach((kg,i)=>b.push({id:`dead_${kg}`,r:_deadRarities[i]||'mythic',icon:_deadIcons[i]||'🔥',name:_deadNames[i]||('Deadlift '+kg+'kg'),ref:_deadRefs[i]||'Bleach',desc:_deadDescs[i]||('Deadlift '+kg+'kg'),condition:'Dead '+kg+'kg',ck:()=>D>=kg}));

  // ── Overhead Press ──
  const _ohpRarities = ['common','uncommon','rare','epic','legendary','mythic'];
  const _ohpIcons = ['💪','🌤️','🛡️','🌊','💫','🔥'];
  const _ohpNames = ["Bras d'Iop Junior","Brise de Seireitei","Épaules de la Division","Iop Divin","Épaules de Goultard","Zanka no Tachi — Higashi"];
  const _ohpRefsArr = ['Dofus','Bleach','Bleach','Dofus','Dofus','Bleach'];
  const _ohpDescs = ["Premier pas sur la voie du dieu-Iop. L'acier au-dessus ne fait que commencer","60kg au-dessus — un Shinigami de 6e division te regarderait avec respect","Les épaulières du Seireitei ont été forgées pour tes épaules","La paume tendue vers le ciel — 100kg au-dessus comme un dieu-Iop","Goultard portait ses victoires légendaires sur ces épaules millénaires","Yamamoto libère sa flamme vers les cieux — ton press en est l'écho terrestre"];
  _bt.ohp.forEach((kg,i)=>b.push({id:`ohp_${kg}`,r:_ohpRarities[i]||'mythic',icon:_ohpIcons[i]||'🔥',name:_ohpNames[i]||('OHP '+kg+'kg'),ref:_ohpRefsArr[i]||'Bleach',desc:_ohpDescs[i]||('OHP '+kg+'kg'),condition:'OHP '+kg+'kg',ck:()=>ohpRM>=kg}));

  // ── Total SBD ──
  b.push({id:'total_300',r:'rare',      icon:'🔱',name:'La Trinité',            ref:'Dofus',  desc:'B+S+D ≥ 300kg — les trois piliers accomplis. Rushu frémit depuis sa prison', condition:'Total SBD ≥ 300kg', ck:()=>total>=300});
  b.push({id:'total_400',r:'epic',      icon:'⚡',name:'Aura d\'Élite',          ref:'Bleach', desc:'B+S+D ≥ 400kg — ton reiatsu combiné commence à impressionner le Gotei 13', condition:'Total SBD ≥ 400kg', ck:()=>total>=400});
  b.push({id:'total_500',r:'legendary', icon:'👑',name:'Total de Goultard',      ref:'Dofus',  desc:'B+S+D ≥ 500kg — le légendaire Iop te tend la main en signe d\'égal à égal', condition:'Total SBD ≥ 500kg', ck:()=>total>=500});
  b.push({id:'total_600',r:'legendary', icon:'💀',name:'Capitaine de Force',     ref:'Bleach', desc:'B+S+D ≥ 600kg — tu te déplaces avec la puissance d\'un capitaine du Gotei 13', condition:'Total SBD ≥ 600kg', ck:()=>total>=600});
  b.push({id:'total_700',r:'mythic',    icon:'🌊',name:'Chaos de l\'Extérieur',  ref:'Dofus',  desc:'B+S+D ≥ 700kg — même les Dieux des Douze se taisent devant ta force brute', condition:'Total SBD ≥ 700kg', ck:()=>total>=700});
  b.push({id:'total_800',r:'divine',    icon:'🔥',name:'Bankai Total',           ref:'Bleach', desc:'B+S+D ≥ 800kg — Yamamoto libère sa flamme en signe d\'hommage ultime', condition:'Total SBD ≥ 800kg', ck:()=>total>=800});

  // ── Poids de Corps ──
  if (bw > 0) {
    const _bwB = _gender === 'female' ? [0.75, 1.0, 1.25] : [1.0, 1.5, 2.0];
    const _bwS = _gender === 'female' ? [1.0, 1.5, 2.0] : [1.5, 2.0, 2.5];
    const _bwD = _gender === 'female' ? [1.25, 1.75, 2.25] : [2.0, 2.5, 3.0];
    b.push({id:'bw_b1',  r:'uncommon', icon:'⚖️', name:_bwB[0]+'× au Bench',    ref:'Dofus',  desc:`${Math.round(bw*_bwB[0])}kg au bench — ton propre corps dans la fonte. L'Iop approuve enfin`, condition:_bwB[0]+'× BW au Bench', ck:()=>B>=bw*_bwB[0]});
    b.push({id:'bw_b15', r:'rare',     icon:'💪', name:_bwB[1]+'× au Bench',    ref:'Bleach', desc:`${Math.round(bw*_bwB[1])}kg — digne d'un combattant du Seireitei`, condition:_bwB[1]+'× BW au Bench', ck:()=>B>=bw*_bwB[1]});
    b.push({id:'bw_b2',  r:'epic',     icon:'🔥', name:_bwB[2]+'× au Bench',    ref:'Bleach', desc:`${Math.round(bw*_bwB[2])}kg bench — ton reiatsu dépasse celui d'un vice-capitaine`, condition:_bwB[2]+'× BW au Bench', ck:()=>B>=bw*_bwB[2]});
    b.push({id:'bw_s15', r:'uncommon', icon:'🦵', name:_bwS[0]+'× au Squat',    ref:'Dofus',  desc:`${Math.round(bw*_bwS[0])}kg — la milice de Bonta est impressionnée par ta puissance`, condition:_bwS[0]+'× BW au Squat', ck:()=>S>=bw*_bwS[0]});
    b.push({id:'bw_s2',  r:'rare',     icon:'🌳', name:_bwS[1]+'× au Squat',    ref:'Dofus',  desc:`${Math.round(bw*_bwS[1])}kg — les Sadidas sont jaloux de ta puissance de jambes`, condition:_bwS[1]+'× BW au Squat', ck:()=>S>=bw*_bwS[1]});
    b.push({id:'bw_s25', r:'epic',     icon:'🌊', name:_bwS[2]+'× au Squat',    ref:'Dofus',  desc:`${Math.round(bw*_bwS[2])}kg — Ogrest lui-même ne squattait pas autant à son pic`, condition:_bwS[2]+'× BW au Squat', ck:()=>S>=bw*_bwS[2]});
    b.push({id:'bw_d2',  r:'rare',     icon:'⚒️', name:_bwD[0]+'× au Deadlift', ref:'Dofus',  desc:`${Math.round(bw*_bwD[0])}kg deadlift — les forgerons de Bonta s'inclinent en silence`, condition:_bwD[0]+'× BW au Dead', ck:()=>D>=bw*_bwD[0]});
    b.push({id:'bw_d25', r:'epic',     icon:'🌑', name:_bwD[1]+'× au Deadlift', ref:'Bleach', desc:`${Math.round(bw*_bwD[1])}kg — ton Getsuga résonne depuis le sol jusqu'au ciel`, condition:_bwD[1]+'× BW au Dead', ck:()=>D>=bw*_bwD[1]});
    b.push({id:'bw_d3',  r:'legendary',icon:'🔥', name:_bwD[2]+'× au Deadlift', ref:'Bleach', desc:`${Math.round(bw*_bwD[2])}kg — Yamamoto lui-même te salue depuis ses flammes éternelles`, condition:_bwD[2]+'× BW au Dead', ck:()=>D>=bw*_bwD[2]});
  }
  } // end if showSBDCards

  // ── Streak (semaines consécutives) ──
  const streakData = [
    [4,   'common',    '📅', "Collectionneur d'Almanax",  'Dofus',  "4 semaines parfaites — l'engagement de l'Almanax Dofus est là"],
    [8,   'common',    '🏠', "Guildien Modèle",           'Dofus',  "Ta guilde compte sur toi chaque semaine — tu n'as jamais déçu"],
    [12,  'uncommon',  '⏳', "Survivant Temporis",        'Dofus',  "Un serveur saisonnier Temporis complet sans jamais fléchir"],
    [26,  'uncommon',  '🎯', "Élève de l'Académie",       'Bleach', "6 mois d'assiduité — Yoruichi t'a sélectionné pour la formation avancée"],
    [52,  'rare',      '🎂', "Anniversaire de Serveur",   'Dofus',  "Un an de connexion — les anciens du serveur t'accueillent parmi eux"],
    [78,  'rare',      '⚡', "Shikai Débloqué",           'Bleach', "78 semaines — ton zanpakuto te révèle enfin son vrai nom en entier"],
    [104, 'rare',      '💎', "Shinigami Confirmé",        'Bleach', "2 ans — ta Division ne peut plus t'imaginer absent du Seireitei"],
    [130, 'epic',      '🌋', "Grands Comptes des Douze",  'Dofus',  "2 ans et demi — les Grands Comptes murmurent ton nom avec respect"],
    [156, 'epic',      '👻', "Reiatsu Perceptible",       'Bleach', "3 ans — les humains ordinaires commencent à sentir ta présence"],
    [182, 'epic',      '📚', "Mémoire du Monde",          'Dofus',  "3 ans et demi — les bibliothèques du monde des Douze conservent ton histoire"],
    [208, 'epic',      '⚔️', "Rang de Capitaine",         'Bleach', "4 ans — tu portes dignement le haori blanc du Gotei 13"],
    [234, 'legendary', '⭐', "Vice-Capitaine Permanent",  'Bleach', "4 ans et demi — ta présence est aussi immuable que le Gotei lui-même"],
    [260, 'legendary', '🔗', "Pilier des Douze",          'Dofus',  "5 ans — les dieux des Douze te confient la garde de leurs reliques sacrées"],
    [286, 'legendary', '🌀', "Reiatsu Permanent",         'Bleach', "5 ans et demi — ton énergie spirituelle ne se dissipe plus jamais"],
    [312, 'legendary', '💥', "Bankai Maîtrisé",           'Bleach', "6 ans — tu ne l'actives plus, tu l'es en permanence désormais"],
    [338, 'legendary', '🌍', "Émissaire des Douze",       'Dofus',  "6 ans et demi — les 12 dieux t'ont choisi pour porter leur message"],
    [364, 'legendary', '📜', "Chronique Éternelle",       'Dofus',  "7 ans — les historiens des Douze nations écrivent des livres sur toi"],
    [390, 'mythic',    '🌊', "Témoin d'Ogrest",           'Dofus',  "7 ans et demi — tu as vu le Chaos d'Ogrest de près sans fléchir"],
    [416, 'mythic',    '🌺', "Chroniqueur des Âges",      'Dofus',  "8 ans — tu as vécu assez de saisons pour voir le monde changer"],
    [442, 'mythic',    '🌑', "Forme Libérée",             'Bleach', "8 ans et demi — au-delà de toute limite, comme après la libération finale"],
    [468, 'mythic',    '🥚', "Porteur des 6 Dofus",       'Dofus',  "9 ans — les six œufs légendaires t'ont désigné comme gardien éternel"],
    [494, 'mythic',    '🌠', "Mugetsu de l'Âme",          'Bleach', "9 ans et demi — tu brûles tout ce qui te reste pour tenir debout"],
    [520, 'divine',    '🔥', "Zanka no Tachi",            'Bleach', "10 ans — Yamamoto libérait la flamme ultime. Tu ES cette flamme"],
  ];
  streakData.forEach(([w,r,icon,name,ref,desc])=>b.push({id:`streak_${w}`,r,icon,name,ref,desc,condition:w+' semaines',ck:()=>streak>=w}));

  // ── Collectionneur ──
  // Fix: use a function that counts all non-collector, non-impossible unlocked badges
  // plus recursively includes collector badges that are themselves unlocked
  const _nonColBadges = b.filter(x => !x.impossible);
  const _nonColCount = _nonColBadges.filter(x => x.ck()).length;
  function _colCount(threshold) {
    // Count non-collector unlocked + collector badges whose threshold is met
    let count = _nonColCount;
    if (count >= 5) count++;   // col5 unlocked
    if (count >= 15) count++;  // col15 unlocked
    if (count >= 30) count++;  // col30 unlocked
    if (count >= 50) count++;  // col50 unlocked
    if (count >= 75) count++;  // col75 unlocked
    if (count >= 100) count++; // col100 unlocked
    return count >= threshold;
  }
  const totalNormal = _nonColBadges.length + 7; // +7 for the collector badges about to be added
  b.push({id:'col5',    r:'common',    icon:'🎒', name:'Premier Inventaire',      ref:'Dofus',        desc:'5 badges — ton inventaire commence à se remplir d\'histoire', condition:'5 badges', ck:()=>_colCount(5)});
  b.push({id:'col15',   r:'uncommon',  icon:'💀', name:'Collectionneur d\'Âmes',  ref:'Bleach',       desc:'15 badges — tu accumules les lames comme un Shinigami expérimenté', condition:'15 badges', ck:()=>_colCount(15)});
  b.push({id:'col30',   r:'rare',      icon:'🏺', name:'Chasseur de Trophées',    ref:'Dofus',        desc:'30 badges — les vitrines d\'Astrub ne suffisent plus à tout exposer', condition:'30 badges', ck:()=>_colCount(30)});
  b.push({id:'col50',   r:'epic',      icon:'📂', name:'Archiviste du Seireitei', ref:'Bleach',       desc:'50 badges — le Département de Recherche du Seireitei t\'envie profondément', condition:'50 badges', ck:()=>_colCount(50)});
  b.push({id:'col75',   r:'legendary', icon:'🛡️', name:'Gardien de Panoplie',     ref:'Dofus',        desc:'75 badges — ta panoplie légendaire fait pâlir les marchands d\'équipement', condition:'75 badges', ck:()=>_colCount(75)});
  b.push({id:'col100',  r:'mythic',    icon:'🌀', name:'Bankai Collectionné',     ref:'Bleach',       desc:'100 badges — chaque badge est une lame supplémentaire dans ton arsenal', condition:'100 badges', ck:()=>_colCount(100)});
  b.push({id:'col_all', r:'divine',    icon:'👑', name:'Complétionniste Divin',   ref:'Dofus × Bleach',desc:'Tous les badges — tu as tout accompli. Légende absolue des deux mondes', condition:'Tous les badges', ck:()=>{ let c=_nonColCount; [5,15,30,50,75,100].forEach(function(t){if(c>=t)c++;}); return c>=totalNormal; }});

  // ── Wellness theme for bien_etre mode ──
  if (getBadgeTheme() === 'wellness') {
    var wellnessNames = {
      's1':   { name:'Premier Pas',              desc:'1 séance — le voyage commence par un pas' },
      's10':  { name:'Habitude en Construction',  desc:'10 séances — tu construis une routine' },
      's25':  { name:'Routine Installée',         desc:'25 séances — c\'est devenu naturel' },
      's50':  { name:'Pratiquant Régulier',       desc:'50 séances — la constance paie' },
      's75':  { name:'Équilibre Trouvé',          desc:'75 séances — corps et esprit en harmonie' },
      's100': { name:'Centurion du Bien-être',    desc:'100 séances — un siècle de mouvements' },
      's200': { name:'Maître de la Constance',    desc:'200 séances — force intérieure' },
      's300': { name:'Pilier de Régularité',      desc:'300 séances — rien ne t\'arrête' },
      's365': { name:'Un An de Bien-être',        desc:'365 séances — une année complète de dévouement' },
      's500': { name:'Sage du Mouvement',         desc:'500 séances — la discipline est devenue sagesse' },
      'vs1':  { name:'Première Tonne',            desc:'1t en une séance — bien joué !' },
      'vs3':  { name:'Effort Soutenu',            desc:'3t — tu mets du cœur à l\'ouvrage' },
      'vs5':  { name:'Endurance Remarquable',     desc:'5t — ton corps te remercie' },
      'vt10':   { name:'Apprenti du Mouvement',   desc:'10t cumulées — tu poses les bases' },
      'vt50':   { name:'Artisan du Corps',         desc:'50t — le travail porte ses fruits' },
      'vt100':  { name:'Sculpteur de Forme',       desc:'100t — ton engagement est visible' },
      'dur60':  { name:'Première Heure',           desc:'1h — une belle séance complète' },
      'dur90':  { name:'Session Prolongée',        desc:'1h30 — tu prends soin de toi' },
      'dur120': { name:'Marathonien du Studio',    desc:'2h — engagement et persévérance' },
    };
    b.forEach(function(badge) {
      if (wellnessNames[badge.id]) {
        badge.name = wellnessNames[badge.id].name;
        badge.desc = wellnessNames[badge.id].desc;
        badge.ref = 'Bien-être';
      }
    });
  }

  return b;
}

function getBadgeTheme() {
  var mode = db.user.trainingMode || 'powerlifting';
  if (mode === 'bien_etre') return 'wellness';
  return 'warrior';
}

function calcTotalXP() {
  let xp = 0;
  const sorted = getSortedLogs().slice().reverse();
  const runningBest = {};
  sorted.forEach(log => {
    xp += 100;
    xp += Math.min(10, (log.exercises||[]).length) * 8;
    xp += Math.floor((log.volume || 0) / 500);
    (log.exercises||[]).forEach(exo => {
      if (exo.maxRM > 0) {
        const prev = runningBest[exo.name] || 0;
        if (prev > 0 && exo.maxRM > prev) xp += 50;
        else if (prev === 0) xp += 20;
        if (exo.maxRM > (runningBest[exo.name] || 0)) runningBest[exo.name] = exo.maxRM;
      }
    });
  });
  xp += calcStreak() * 25;
  // Weekly challenges XP
  var weeklyXP = 0;
  if (db.weeklyChallenges && db.weeklyChallenges.challenges) {
    db.weeklyChallenges.challenges.forEach(function(c) { if (c.completed) weeklyXP += (c.xpReward || 0); });
  }
  // Perfect quest bonus (25%)
  if (db.weeklyChallenges && db.weeklyChallenges.challenges) {
    var allDone = db.weeklyChallenges.challenges.every(function(c) { return c.completed; });
    if (allDone && db.weeklyChallenges.challenges.length > 0) weeklyXP = Math.round(weeklyXP * 1.25);
  }
  // Flame bonus
  var qs = db.questStreak || 0;
  if (qs >= 4) weeklyXP = Math.round(weeklyXP * 1.20);
  else if (qs >= 3) weeklyXP = Math.round(weeklyXP * 1.15);
  else if (qs >= 2) weeklyXP = Math.round(weeklyXP * 1.10);
  xp += weeklyXP;
  // Monthly challenges XP
  if (db.monthlyChallenges && db.monthlyChallenges.challenges) {
    db.monthlyChallenges.challenges.forEach(function(c) { if (c.completed) xp += (c.xpReward || 0); });
  }
  // Secret quests XP
  (db.secretQuestsCompleted || []).forEach(function(sqId) {
    var sq = SECRET_QUESTS.find(function(s) { return s.id === sqId; });
    if (sq) xp += sq.xp;
  });
  return xp;
}

function calcStreak() {
  // Weekly calendar streak: ISO weeks (Mon-Sun) with ≥1 session
  if (!db.logs.length) return 0;

  db.gamification = db.gamification || {};

  function getISOWeekMonday(ts) {
    var d = new Date(ts);
    var day = d.getDay(); // 0=dim, 1=lun
    var diff = (day === 0 ? -6 : 1 - day);
    var monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().slice(0, 10);
  }

  var now = Date.now();
  var currentWeek = getISOWeekMonday(now);

  // Collect all weeks that have at least 1 session
  var weeksWithSession = new Set();
  db.logs.forEach(function(log) {
    var ts = log.timestamp || new Date(log.date).getTime();
    if (ts) weeksWithSession.add(getISOWeekMonday(ts));
  });

  // Freeze already consumed this calendar week? Prevent double-consumption across repeated calls.
  var usedAt = db.gamification.freezesUsedAt || [];
  var freezeUsedThisWeek = usedAt.some(function(ts) { return getISOWeekMonday(ts) === currentWeek; });
  var freezeConsumedThisCall = false;

  // Count consecutive weeks backward; optionally consume ONE freeze to bridge a missing week.
  function countFromWeek(startWeek) {
    var streak = 0;
    var checkWeek = startWeek;
    while (true) {
      var hasSession = weeksWithSession.has(checkWeek);
      var protectedByManual = (checkWeek === currentWeek && db.gamification.freezeActiveThisWeek === true);
      if (hasSession || protectedByManual) {
        streak++;
      } else if (!freezeConsumedThisCall && !freezeUsedThisWeek
                 && (db.gamification.streakFreezes || 0) > 0
                 && streak >= 4) {
        // Consume one freeze to bridge this missing week
        streak++;
        freezeConsumedThisCall = true;
        db.gamification.streakFreezes = Math.max(0, (db.gamification.streakFreezes || 0) - 1);
        db.gamification.freezesUsedAt = db.gamification.freezesUsedAt || [];
        db.gamification.freezesUsedAt.push(Date.now());
        db.gamification.freezeActiveThisWeek = false;
        if (typeof syncToCloud === 'function') syncToCloud();
        if (typeof showToast === 'function') showToast('❄️ Freeze utilisé — streak protégé');
      } else {
        break;
      }
      var d = new Date(checkWeek);
      d.setDate(d.getDate() - 7);
      checkWeek = d.toISOString().slice(0, 10);
    }
    return streak;
  }

  var streak = countFromWeek(currentWeek);

  // If current week has no session yet, check from last week (don't break streak)
  if (!weeksWithSession.has(currentWeek) && db.gamification.freezeActiveThisWeek !== true) {
    var lastWeek = new Date(currentWeek);
    lastWeek.setDate(lastWeek.getDate() - 7);
    var lastWeekKey = lastWeek.toISOString().slice(0, 10);
    if (weeksWithSession.has(lastWeekKey)) {
      streak = countFromWeek(lastWeekKey);
    }
  }

  // Store in db for cloud sync
  if (!db.weeklyStreak || db.weeklyStreak !== streak) db.weeklyStreak = streak;
  if (!db.weeklyStreakRecord || streak > db.weeklyStreakRecord) db.weeklyStreakRecord = streak;

  return streak;
}

// ── STREAK FREEZES ──────────────────────────────────────────
function grantMonthlyFreeze() {
  db.gamification = db.gamification || {};
  db.gamification.streakFreezes = db.gamification.streakFreezes ?? 1;
  db.gamification.lastFreezeGrantedMonth = db.gamification.lastFreezeGrantedMonth ?? -1;
  var currentMonth = new Date().getMonth();
  if (currentMonth !== db.gamification.lastFreezeGrantedMonth
      && db.gamification.streakFreezes < 2) {
    db.gamification.streakFreezes += 1;
    db.gamification.lastFreezeGrantedMonth = currentMonth;
    if (typeof syncToCloud === 'function') syncToCloud();
  }
}

function activateFreezeManual() {
  db.gamification = db.gamification || {};
  if ((db.gamification.streakFreezes || 0) > 0 && db.gamification.freezeActiveThisWeek === false) {
    db.gamification.freezeActiveThisWeek = true;
    db.gamification.streakFreezes -= 1;
    db.gamification.freezesUsedAt = db.gamification.freezesUsedAt || [];
    db.gamification.freezesUsedAt.push(Date.now());
    if (typeof syncToCloud === 'function') syncToCloud();
    if (typeof showToast === 'function') showToast('❄️ Semaine protégée');
    if (typeof renderGamificationTab === 'function') renderGamificationTab();
  } else {
    if (typeof showToast === 'function') showToast('Aucun freeze disponible');
  }
}

function getStreakFreezes() {
  db.gamification = db.gamification || {};
  return db.gamification.streakFreezes || 0;
}

function getXPLevel(xp) {
  let lvl = XP_LEVELS[0];
  for (const l of XP_LEVELS) {
    if (xp >= l.xp) lvl = l;
  }
  return lvl;
}

function getNextXPLevel(xp) {
  for (const l of XP_LEVELS) {
    if (l.xp > xp) return l;
  }
  return null;
}

function getAllBestE1RMs() {
  // Returns { exoName: { e1rm, date } } for all exercises across all logs
  const best = {};
  db.logs.forEach(log => {
    (log.exercises||[]).forEach(exo => {
      if (!exo.maxRM || exo.maxRM <= 0) return;
      if (!best[exo.name] || exo.maxRM > best[exo.name].e1rm) {
        best[exo.name] = { e1rm: exo.maxRM, date: log.shortDate || log.date || '' };
      }
    });
  });
  return best;
}

function toggleBdgSection(head) {
  const body = head.nextElementSibling;
  const chev = head.querySelector('.bdg-sec-chev');
  body.classList.toggle('open');
  if (chev) chev.classList.toggle('open');
}

// ── Gamification helpers ──

function _getWeekKey() {
  var d = new Date(); var day = d.getDay(); var diff = d.getDate() - day + (day === 0 ? -6 : 1);
  var mon = new Date(d.setDate(diff)); mon.setHours(0,0,0,0);
  return mon.toISOString().slice(0,10);
}

function _getWeekStart(date) {
  var d = new Date(date); var day = d.getDay(); var diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff); d.setHours(0,0,0,0); return d;
}

function _getLogsThisWeek() {
  var wk = _getWeekKey();
  var start = new Date(wk).getTime();
  var end = start + 7 * 86400000;
  return db.logs.filter(function(l) { return l.timestamp >= start && l.timestamp < end; });
}

// ── Weekly Quest Pool (V2) ──
var WEEKLY_QUEST_POOL = [
  { id:'pr', name:'Chasseur de records', desc:'Bats un record personnel cette semaine', targetFn:function(){return 1;}, currentFn:function(wl,pb){ var prs=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){ if(e.maxRM>0&&e.maxRM>(pb[e.name]||0)) prs++; }); }); return prs; }, xp:250 },
  { id:'discovery', name:'Explorateur', desc:'Essaie un exercice jamais fait', targetFn:function(){return 1;}, currentFn:function(wl){ var allExos=new Set(); db.logs.forEach(function(l){(l.exercises||[]).forEach(function(e){allExos.add(e.name);}); }); var weekExos=new Set(); wl.forEach(function(l){(l.exercises||[]).forEach(function(e){weekExos.add(e.name);}); }); var newCount=0; weekExos.forEach(function(n){ var foundBefore=false; db.logs.forEach(function(l2){ if(wl.indexOf(l2)>=0)return; (l2.exercises||[]).forEach(function(e2){if(e2.name===n)foundBefore=true;}); }); if(!foundBefore)newCount++; }); return newCount; }, xp:100 },
  { id:'muscle_weak', name:'Rééquilibrage', descFn:function(t,m){return t+' séries de '+m+' cette semaine';}, targetFn:function(){ var muscleVol={}; getLogsInRange(28).forEach(function(l){(l.exercises||[]).forEach(function(e){ var mg=getMuscleGroupParent?getMuscleGroupParent(getMuscleGroup(e.name)||'Autre'):(getMuscleGroup(e.name)||'Autre'); if(mg!=='Autre') muscleVol[mg]=(muscleVol[mg]||0)+(e.sets||0); }); }); var sorted=Object.keys(muscleVol).sort(function(a,b){return muscleVol[a]-muscleVol[b];}); var weak=sorted[0]||'Pectoraux'; var isSmall=/Biceps|Triceps|Épaules|Mollets|Avant-bras/i.test(weak); return {target:isSmall?10:14, muscle:weak}; }, currentFn:function(wl,pb,meta){ var sets=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){ var mg=getMuscleGroupParent?getMuscleGroupParent(getMuscleGroup(e.name)||'Autre'):(getMuscleGroup(e.name)||'Autre'); if(mg===meta.muscle)sets+=(e.sets||0); }); }); return sets; }, xp:100 },
  { id:'tonnage', name:'Tonnage record', descFn:function(t){return 'Dépasse '+Math.round(t/1000)+'t de volume cette semaine';}, targetFn:function(){ var avg=getLogsInRange(28).reduce(function(s,l){return s+(l.volume||0);},0)/4; return Math.max(1000, Math.round(avg*1.05/100)*100); }, currentFn:function(wl){ return wl.reduce(function(s,l){return s+(l.volume||0);},0); }, xp:100 },
  { id:'consistency', name:'Machine de guerre', descFn:function(t){return 'Entraîne-toi '+t+' jours d\'affilée';}, targetFn:function(){ var st=getTrainingDaysCount(); return Math.max(2,st-1); }, currentFn:function(wl){ var days=wl.map(function(l){return new Date(l.timestamp).toISOString().slice(0,10);}).filter(function(v,i,a){return a.indexOf(v)===i;}).sort(); var maxStreak=0,cur=1; for(var i=1;i<days.length;i++){ var d1=new Date(days[i-1]),d2=new Date(days[i]); if((d2-d1)===86400000)cur++; else cur=1; if(cur>maxStreak)maxStreak=cur; } return days.length?Math.max(maxStreak,cur):0; }, xp:150 },
  { id:'compound', name:'Force brute', desc:'Fais au moins 15 séries de mouvements composés', targetFn:function(){return 15;}, currentFn:function(wl){ var compoundRe=/squat|bench|deadlift|souleve|developpe|overhead|ohp|rowing|row\b|press/i; var sets=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){if(compoundRe.test(e.name))sets+=(e.sets||0);}); }); return sets; }, xp:100 },
  { id:'tempo', name:'Contrôle total', desc:'3 séries en tempo lent (RPE renseigné)', targetFn:function(){return 3;}, currentFn:function(wl){ var count=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){ if(e.rpe&&e.rpe>0)count+=(e.sets||0); }); }); return count; }, xp:80 },
  { id:'volume_session', name:'Séance monstre', descFn:function(t){return 'Dépasse '+Math.round(t/1000)+'t dans une seule séance';}, targetFn:function(){ var maxes=[]; getLogsInRange(28).forEach(function(l){maxes.push(l.volume||0);}); var avg=maxes.length?Math.max.apply(null,maxes):5000; return Math.round(avg*1.1/100)*100; }, currentFn:function(wl){ var mx=0; wl.forEach(function(l){if((l.volume||0)>mx)mx=l.volume||0;}); return mx; }, xp:120 },
  { id:'variety', name:'Touche à tout', descFn:function(t){return 'Fais au moins '+t+' exercices différents cette semaine';}, targetFn:function(){ var avg=new Set(); getLogsInRange(28).forEach(function(l){(l.exercises||[]).forEach(function(e){avg.add(e.name);}); }); return Math.max(8, Math.min(15, Math.round(avg.size/4))); }, currentFn:function(wl){ var s=new Set(); wl.forEach(function(l){(l.exercises||[]).forEach(function(e){s.add(e.name);}); }); return s.size; }, xp:80 },
  { id:'rpe_log', name:'Scientifique', desc:'Renseigne l\'EPE sur 10 séries', targetFn:function(){return 10;}, currentFn:function(wl){ var count=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){if(e.rpe&&e.rpe>0)count+=(e.sets||0);}); }); return count; }, xp:60 },
  { id:'accessory', name:'Petits détails', descFn:function(t){return t+' séries d\'isolation cette semaine';}, targetFn:function(){ var compoundRe=/squat|bench|deadlift|souleve|developpe|overhead|ohp|rowing|row\b|press|dips|traction|pull.?up/i; var isoSets=[]; getLogsInRange(28).forEach(function(l){var s=0;(l.exercises||[]).forEach(function(e){if(!compoundRe.test(e.name))s+=(e.sets||0);}); isoSets.push(s); }); var avg=isoSets.length?isoSets.reduce(function(a,b){return a+b;},0)/Math.max(1,isoSets.length):12; return Math.max(10, Math.min(20, Math.round(avg/4*1.05))); }, currentFn:function(wl){ var compoundRe=/squat|bench|deadlift|souleve|developpe|overhead|ohp|rowing|row\b|press|dips|traction|pull.?up/i; var sets=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){if(!compoundRe.test(e.name))sets+=(e.sets||0);}); }); return sets; }, xp:80 },
  { id:'heavy', name:'Charges lourdes', desc:'Au moins 5 séries à +85% e1RM', targetFn:function(){return 5;}, currentFn:function(wl){ var best=getAllBestE1RMs(); var count=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){ var b=best[e.name]; if(b&&e.maxRM>=b.e1rm*0.85)count+=(e.sets||0); }); }); return count; }, xp:150 },
  { id:'endurance', name:'Endurance', desc:'Au moins 8 séries de 10+ reps', targetFn:function(){return 8;}, currentFn:function(wl){ var count=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){ if(e.reps&&e.reps>=10)count+=(e.sets||0); else if(e.sets&&!e.reps)count+=0; }); }); return count; }, xp:80 },
  { id:'upper_lower', name:'Équilibre', desc:'Ratio haut/bas du corps entre 40-60%', targetFn:function(){return 1;}, currentFn:function(wl){ var upper=0,lower=0; var lowerRe=/squat|deadlift|souleve|leg|mollet|ischio|quadri|fessier|hip.*thrust|rdl|presse|lunge|fente/i; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){ if(lowerRe.test(e.name))lower+=(e.sets||0); else upper+=(e.sets||0); }); }); var total=upper+lower; if(total===0)return 0; var ratio=upper/total; return(ratio>=0.4&&ratio<=0.6)?1:0; }, xp:100 },
  { id:'no_skip', name:'Zéro impasse', desc:'Complète toutes les séries prévues du programme', targetFn:function(){return 1;}, currentFn:function(wl){ return wl.length>=getTrainingDaysCount()?1:0; }, xp:120 }
];

// ── Monthly Quest Pool ──
var MONTHLY_QUEST_POOL = [
  { id:'m_pr_count', name:'Série de records', descFn:function(t){return 'Bats '+t+' records personnels ce mois';}, targetFn:function(){ return Math.max(3, Math.min(5, Math.round(db.logs.length/50))); }, xp:500 },
  { id:'m_volume', name:'Titan', descFn:function(t){return 'Accumule '+Math.round(t/1000)+'t de volume ce mois';}, targetFn:function(){ var avg=getLogsInRange(28).reduce(function(s,l){return s+(l.volume||0);},0); return Math.round(avg*1.1/1000)*1000; }, xp:400 },
  { id:'m_sessions', name:'Régulier', descFn:function(t){return 'Complète '+t+' séances ce mois';}, targetFn:function(){ return getTrainingDaysCount()*4; }, xp:400 },
  { id:'m_streak', name:'Inarrêtable', descFn:function(t){return 'Maintiens ta série '+t+' semaines d\'affilée';}, targetFn:function(){ return Math.max(4, calcStreak()+2); }, xp:350 },
  { id:'m_strength', name:'Palier de force', desc:'Atteins un nouveau palier de force sur un exercice', targetFn:function(){return 1;}, xp:600 },
  { id:'m_muscle_balance', name:'Harmonie', desc:'Travaille tous les groupes musculaires au moins 8 séries', targetFn:function(){return 8;}, xp:300 },
  { id:'m_nutrition', name:'Discipline', descFn:function(t){return 'Remplis tes macros '+t+' jours ce mois';}, targetFn:function(){return 20;}, xp:350 },
  { id:'m_discovery', name:'Aventurier', desc:'Essaie 3 nouveaux exercices ce mois', targetFn:function(){return 3;}, xp:250 },
  { id:'m_heavy_month', name:'Mois de force', desc:'15 séries à +90% e1RM ce mois', targetFn:function(){return 15;}, xp:400 },
  { id:'m_consistency', name:'Métronome', descFn:function(t){return 'Entraîne-toi au moins '+t+' jours chaque semaine pendant 4 semaines';}, targetFn:function(){ return getTrainingDaysCount(); }, xp:500 }
];

// ── Player Classes (Dofus) ──
const PLAYER_CLASSES = [
  { id:'iop',      icon:'⚔️',  name:'Iop',      desc:'Force brute. Tu vis pour les charges lourdes, rien d\'autre.' },
  { id:'sacrieur', icon:'🩸',  name:'Sacrieur', desc:'Tu sacrifies tout pour la pompe. Le volume est ta religion.' },
  { id:'pandawa',  icon:'🍶',  name:'Pandawa',  desc:'Patient et équilibré. Tu joues sur le long terme.' },
  { id:'osamodas', icon:'🐉',  name:'Osamodas', desc:'Instinctif. Tu écoutes ton corps et varies sans cesse.' },
  { id:'xelor',    icon:'⏳',  name:'Xelor',    desc:'Tout est planifié. La périodisation, c\'est ton art.' },
  { id:'feca',     icon:'🛡️', name:'Feca',     desc:'Technique et prévention. Ton temple, tu le protèges.' },
  { id:'ecaflip',  icon:'🎲',  name:'Ecaflip',  desc:'Irrégulier mais enthousiaste. Tu y vas quand tu peux.' },
  { id:'enutrof',  icon:'💰',  name:'Enutrof',  desc:'Vétéran. Des années de fer, des progressions en béton.' }
];

// ── Quiz Questions (7) ──
const QUIZ_QUESTIONS = [
  {
    type: 'choice',
    text: "Ton objectif principal à la salle ?",
    options: [
      { text: "Soulever le plus lourd possible",   scores: { iop:3, xelor:1 } },
      { text: "Construire un physique esthétique",  scores: { sacrieur:3, osamodas:1 } },
      { text: "Rester en forme et en santé",        scores: { pandawa:3, feca:1 } },
      { text: "Performer en compétition",           scores: { xelor:3, iop:1 } },
      { text: "Reprendre après une pause",          scores: { ecaflip:3, pandawa:1 } },
      { text: "Continuer sur la durée",             scores: { enutrof:3 } }
    ]
  },
  {
    type: 'slider',
    text: "Ton ratio idéal ?",
    labelLeft: "⚡ Force pure",
    labelRight: "💪 Volume pur",
    scoreFn: function(v) {
      if (v <= 2)  return { iop:2 };
      if (v <= 4)  return { xelor:1, iop:1 };
      if (v === 5) return { osamodas:2, feca:1 };
      if (v <= 7)  return { sacrieur:1, osamodas:1 };
      return { sacrieur:2 };
    }
  },
  {
    type: 'choice',
    text: "Ta séance idéale ?",
    options: [
      { text: "Peu de séries, charges lourdes",         scores: { iop:2, xelor:1 } },
      { text: "Beaucoup de séries, pompe maximale",     scores: { sacrieur:2 } },
      { text: "Régulière, technique, sans blessure",    scores: { feca:2, pandawa:1 } },
      { text: "Variée, jamais la même chose",           scores: { osamodas:2 } },
      { text: "Courte et efficace",                     scores: { enutrof:2, ecaflip:1 } }
    ]
  },
  {
    type: 'choice',
    text: "Une semaine sans salle, c'est ?",
    options: [
      { text: "Insupportable, je dois compenser",  scores: { iop:2, sacrieur:1 } },
      { text: "Normal, le corps récupère",          scores: { pandawa:3 } },
      { text: "Je fais autre chose (cardio…)",      scores: { osamodas:2 } },
      { text: "J'avais planifié ce repos",          scores: { xelor:2, enutrof:1 } },
      { text: "Ça arrive souvent chez moi",         scores: { ecaflip:2 } }
    ]
  },
  {
    type: 'slider',
    text: "Comment tu organises ton entraînement ?",
    labelLeft: "🎲 Total improvisation",
    labelRight: "📋 Tout planifié",
    scoreFn: function(v) {
      if (v <= 2)  return { ecaflip:2, osamodas:1 };
      if (v <= 5)  return { osamodas:1, feca:1 };
      if (v <= 8)  return { xelor:1, enutrof:1 };
      return { xelor:2 };
    }
  },
  {
    type: 'choice',
    text: "Ton rapport aux blessures ?",
    options: [
      { text: "Je pousse jusqu'à la limite",         scores: { iop:2, sacrieur:1 } },
      { text: "Je fais très attention à ma technique", scores: { feca:3 } },
      { text: "J'écoute mon corps au jour le jour",  scores: { osamodas:2, pandawa:1 } },
      { text: "J'ai déjà été blessé, ça change tout", scores: { feca:2, enutrof:1 } },
      { text: "Je ne me suis jamais vraiment blessé", scores: { ecaflip:1, iop:1 } }
    ]
  },
  {
    type: 'choice',
    text: "Si tu étais un personnage Dofus ?",
    options: [
      { text: "⚔️  Un guerrier qui fonce dans le tas",          scores: { iop:3 } },
      { text: "🩸  Un titan du volume qui encaisse tout",        scores: { sacrieur:3 } },
      { text: "🍶  Un moine patient et serein",                  scores: { pandawa:3 } },
      { text: "🐉  Un dresseur qui s'adapte à tout",             scores: { osamodas:3 } },
      { text: "⏳  Un maître du temps et de la stratégie",       scores: { xelor:3 } },
      { text: "🛡️  Un gardien qui protège son temple",           scores: { feca:3 } },
      { text: "🎲  Un joueur qui tente sa chance",               scores: { ecaflip:3 } },
      { text: "💰  Un chasseur de trésors au long cours",        scores: { enutrof:3 } }
    ]
  }
];

function computeQuizResult(answers) {
  var scores = {};
  PLAYER_CLASSES.forEach(function(c) { scores[c.id] = 0; });
  QUIZ_QUESTIONS.forEach(function(q, i) {
    var a = answers[i];
    if (a == null) return;
    var delta = null;
    if (q.type === 'choice') {
      var opt = q.options[a];
      if (opt && opt.scores) delta = opt.scores;
    } else if (q.type === 'slider' && typeof q.scoreFn === 'function') {
      delta = q.scoreFn(a);
    }
    if (delta) {
      Object.keys(delta).forEach(function(k) { scores[k] = (scores[k] || 0) + delta[k]; });
    }
  });
  // Tiebreak priority: Xelor > Enutrof > Feca > Osamodas > Iop = Sacrieur = Pandawa = Ecaflip
  var priority = ['xelor','enutrof','feca','osamodas','iop','sacrieur','pandawa','ecaflip'];
  var best = priority[0], bestScore = -1, bestPrio = priority.length;
  priority.forEach(function(c, idx) {
    var s = scores[c] || 0;
    if (s > bestScore || (s === bestScore && idx < bestPrio)) {
      best = c; bestScore = s; bestPrio = idx;
    }
  });
  return best;
}

function showClassQuiz() {
  // Prevent stacking
  var existing = document.getElementById('classQuizOverlay');
  if (existing) existing.remove();

  var answers = new Array(QUIZ_QUESTIONS.length).fill(null);
  var currentQ = 0;

  var overlay = document.createElement('div');
  overlay.id = 'classQuizOverlay';
  overlay.innerHTML =
    '<style>' +
      '#classQuizOverlay{position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;}' +
      '#classQuizOverlay .cq-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:24px;max-width:380px;width:100%;color:#fff;animation:cqFade 0.4s ease;}' +
      '#classQuizOverlay .cq-progress{font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;text-align:center;}' +
      '#classQuizOverlay .cq-progress-bar{height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;margin-bottom:20px;}' +
      '#classQuizOverlay .cq-progress-fill{height:100%;background:var(--purple);transition:width 0.35s ease;}' +
      '#classQuizOverlay .cq-question{font-size:18px;font-weight:700;margin-bottom:18px;line-height:1.4;text-align:center;}' +
      '#classQuizOverlay .cq-options{display:flex;flex-direction:column;gap:10px;margin-bottom:20px;}' +
      '#classQuizOverlay .cq-option{background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:12px 16px;width:100%;text-align:left;color:#fff;font-size:14px;cursor:pointer;transition:all 0.2s;font-family:inherit;}' +
      '#classQuizOverlay .cq-option:hover{background:rgba(255,255,255,0.04);}' +
      '#classQuizOverlay .cq-option.selected{border-color:var(--purple);background:rgba(191,90,242,0.15);}' +
      '#classQuizOverlay .cq-slider-wrap{margin-bottom:20px;}' +
      '#classQuizOverlay .cq-slider-labels{display:flex;justify-content:space-between;font-size:12px;color:var(--sub);margin-bottom:10px;}' +
      '#classQuizOverlay .cq-slider{width:100%;accent-color:var(--purple);}' +
      '#classQuizOverlay .cq-slider-val{text-align:center;font-size:13px;color:var(--purple);font-weight:700;margin-top:8px;}' +
      '#classQuizOverlay .cq-next{background:var(--purple);color:#fff;border:none;border-radius:12px;padding:14px;width:100%;font-size:15px;font-weight:700;cursor:pointer;transition:opacity 0.2s;font-family:inherit;}' +
      '#classQuizOverlay .cq-next:disabled{opacity:0.3;cursor:not-allowed;}' +
      '#classQuizOverlay .cq-reveal{text-align:center;padding:20px 0;}' +
      '#classQuizOverlay .cq-reveal-icon{font-size:72px;display:inline-block;animation:cqPulse 1s ease infinite;}' +
      '#classQuizOverlay .cq-reveal-small{font-size:13px;color:var(--sub);margin-top:14px;letter-spacing:0.8px;}' +
      '#classQuizOverlay .cq-reveal-lead{font-size:14px;color:var(--sub);margin-bottom:6px;}' +
      '#classQuizOverlay .cq-reveal-name{font-size:2rem;font-weight:800;color:var(--purple);margin:8px 0;}' +
      '#classQuizOverlay .cq-reveal-desc{font-size:13px;color:var(--sub);line-height:1.6;margin:12px 0 22px;}' +
      '@keyframes cqFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}' +
      '@keyframes cqPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}' +
    '</style>' +
    '<div class="cq-card" id="cqCard"></div>';
  document.body.appendChild(overlay);

  function renderQ() {
    var q = QUIZ_QUESTIONS[currentQ];
    var total = QUIZ_QUESTIONS.length;
    var pct = Math.round(((currentQ + 1) / total) * 100);
    var isLast = currentQ === total - 1;
    var card = document.getElementById('cqCard');

    var body = '';
    body += '<div class="cq-progress">Question ' + (currentQ + 1) + ' / ' + total + '</div>';
    body += '<div class="cq-progress-bar"><div class="cq-progress-fill" style="width:' + pct + '%;"></div></div>';
    body += '<div class="cq-question">' + q.text + '</div>';

    if (q.type === 'choice') {
      body += '<div class="cq-options">';
      q.options.forEach(function(opt, i) {
        var sel = answers[currentQ] === i ? ' selected' : '';
        body += '<button class="cq-option' + sel + '" data-idx="' + i + '">' + opt.text + '</button>';
      });
      body += '</div>';
    } else if (q.type === 'slider') {
      var val = answers[currentQ] == null ? 5 : answers[currentQ];
      body += '<div class="cq-slider-wrap">';
      body += '<div class="cq-slider-labels"><span>' + q.labelLeft + '</span><span>' + q.labelRight + '</span></div>';
      body += '<input type="range" min="0" max="10" step="1" value="' + val + '" class="cq-slider" id="cqSlider">';
      body += '<div class="cq-slider-val" id="cqSliderVal">' + val + ' / 10</div>';
      body += '</div>';
    }

    body += '<button class="cq-next" id="cqNextBtn"' + (answers[currentQ] == null ? ' disabled' : '') + '>' + (isLast ? 'Voir mon résultat' : 'Suivant →') + '</button>';
    card.innerHTML = body;

    if (q.type === 'choice') {
      card.querySelectorAll('.cq-option').forEach(function(btn) {
        btn.onclick = function() {
          answers[currentQ] = parseInt(btn.getAttribute('data-idx'));
          card.querySelectorAll('.cq-option').forEach(function(b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          document.getElementById('cqNextBtn').disabled = false;
        };
      });
    } else if (q.type === 'slider') {
      var slider = document.getElementById('cqSlider');
      var valEl = document.getElementById('cqSliderVal');
      if (answers[currentQ] == null) answers[currentQ] = parseInt(slider.value);
      document.getElementById('cqNextBtn').disabled = false;
      slider.oninput = function() {
        var v = parseInt(slider.value);
        answers[currentQ] = v;
        valEl.textContent = v + ' / 10';
      };
    }

    document.getElementById('cqNextBtn').onclick = function() {
      if (answers[currentQ] == null) return;
      if (isLast) revealResult();
      else { currentQ++; renderQ(); }
    };
  }

  function revealResult() {
    var classSlug = computeQuizResult(answers);
    var cls = PLAYER_CLASSES.find(function(c) { return c.id === classSlug; }) || PLAYER_CLASSES[0];
    var card = document.getElementById('cqCard');

    card.innerHTML =
      '<div class="cq-reveal">' +
        '<div class="cq-reveal-icon">' + cls.icon + '</div>' +
        '<div class="cq-reveal-small">Analyse en cours…</div>' +
      '</div>';

    setTimeout(function() {
      card.innerHTML =
        '<div class="cq-reveal">' +
          '<div class="cq-reveal-lead">Tu es un(e)…</div>' +
          '<div style="height:14px;"></div>' +
          '<div class="cq-reveal-icon" style="animation:none;">' + cls.icon + '</div>' +
          '<div class="cq-reveal-name">' + cls.name + '</div>' +
          '<div class="cq-reveal-desc">' + cls.desc + '</div>' +
          '<button class="cq-next" id="cqDoneBtn">Commencer l\'aventure</button>' +
        '</div>';
      document.getElementById('cqDoneBtn').onclick = function() {
        db.gamification = db.gamification || {};
        db.gamification.playerClass = classSlug;
        db.gamification.quizAnswers = answers;
        db.gamification.quizCompletedAt = Date.now();
        saveDB();
        if (typeof syncToCloud === 'function') syncToCloud();
        overlay.remove();
        if (typeof renderGamificationTab === 'function') renderGamificationTab();
      };
    }, 1200);
  }

  renderQ();
}

// ── SBD Lift Ranks (Dofus tiers) ──
const SBD_TIERS = [
  { name: 'Apprenti',   color: '#8B7355', min: 0  },
  { name: 'Aventurier', color: '#9EB0C0', min: 20 },
  { name: 'Guerrier',   color: '#C8A24C', min: 40 },
  { name: 'Champion',   color: '#78D8D0', min: 60 },
  { name: 'Héros',      color: '#6EB4FF', min: 75 },
  { name: 'Légende',    color: '#BF5AF2', min: 90 }
];

const STRENGTH_LEVEL_STANDARDS = {
  bench: {
    male:   [0.35, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25],
    female: [0.20, 0.30, 0.45, 0.60, 0.80, 1.00, 1.20, 1.40, 1.60]
  },
  squat: {
    male:   [0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50],
    female: [0.35, 0.50, 0.70, 0.90, 1.10, 1.30, 1.55, 1.80, 2.00]
  },
  deadlift: {
    male:   [0.60, 0.85, 1.10, 1.35, 1.60, 1.90, 2.20, 2.50, 2.75],
    female: [0.40, 0.60, 0.80, 1.00, 1.25, 1.50, 1.75, 2.00, 2.20]
  }
};

const STRENGTH_PERCENTILE_POINTS = [5, 10, 20, 35, 50, 65, 80, 90, 95];

function calcLiftPercentile(liftType, e1rm, bw, gender) {
  if (!e1rm || !bw || bw <= 0) return 0;
  var ratio = e1rm / bw;
  var g = (gender === 'female') ? 'female' : 'male';
  var stds = STRENGTH_LEVEL_STANDARDS[liftType] && STRENGTH_LEVEL_STANDARDS[liftType][g];
  if (!stds) return 0;
  if (ratio <= stds[0]) return 0;
  if (ratio >= stds[8]) return 99;
  for (var i = 0; i < 8; i++) {
    if (ratio <= stds[i + 1]) {
      var t = (ratio - stds[i]) / (stds[i + 1] - stds[i]);
      return Math.round(
        STRENGTH_PERCENTILE_POINTS[i] +
        t * (STRENGTH_PERCENTILE_POINTS[i + 1] - STRENGTH_PERCENTILE_POINTS[i])
      );
    }
  }
  return 95;
}

function percentileToSBDTier(pct) {
  var tier = SBD_TIERS[0];
  for (var i = 0; i < SBD_TIERS.length; i++) {
    if (pct >= SBD_TIERS[i].min) tier = SBD_TIERS[i];
  }
  return tier;
}

// Kg e1RM required to reach the next tier (based on its min percentile → ratio threshold)
function _kgToReachTier(liftType, nextTierMinPct, bw, gender) {
  if (!bw || bw <= 0) return null;
  var g = (gender === 'female') ? 'female' : 'male';
  var stds = STRENGTH_LEVEL_STANDARDS[liftType] && STRENGTH_LEVEL_STANDARDS[liftType][g];
  if (!stds) return null;
  // Find percentile points bracket around nextTierMinPct and interpolate back to ratio
  for (var i = 0; i < STRENGTH_PERCENTILE_POINTS.length - 1; i++) {
    var p0 = STRENGTH_PERCENTILE_POINTS[i], p1 = STRENGTH_PERCENTILE_POINTS[i + 1];
    if (nextTierMinPct <= p0) return Math.round(stds[i] * bw);
    if (nextTierMinPct <= p1) {
      var t = (nextTierMinPct - p0) / (p1 - p0);
      var ratio = stds[i] + t * (stds[i + 1] - stds[i]);
      return Math.round(ratio * bw);
    }
  }
  return Math.round(stds[stds.length - 1] * bw);
}

function calcAndStoreLiftRanks() {
  try {
    db.gamification = db.gamification || {};
    var bw = db.user && db.user.bw ? db.user.bw : 0;
    var gender = db.user && db.user.gender ? db.user.gender : 'male';
    var now = Date.now();
    var map = { squat: null, bench: null, deadlift: null };

    // Collect best e1RM per SBD type across all logs (uses existing getSBDType)
    var bestByType = { squat: 0, bench: 0, deadlift: 0 };
    (db.logs || []).forEach(function(log) {
      (log.exercises || []).forEach(function(exo) {
        if (!exo || !exo.name || !exo.maxRM || exo.maxRM <= 0) return;
        var type = (typeof getSBDType === 'function') ? getSBDType(exo.name) : null;
        if (!type) return;
        if (exo.maxRM > bestByType[type]) bestByType[type] = exo.maxRM;
      });
    });

    // Fallback to db.bestPR (which already stores e1RM via maxRM) if logs path missed
    if (db.bestPR) {
      ['squat','bench','deadlift'].forEach(function(t) {
        if ((db.bestPR[t] || 0) > bestByType[t]) bestByType[t] = db.bestPR[t];
      });
    }

    ['squat','bench','deadlift'].forEach(function(liftType) {
      var e1rm = bestByType[liftType];
      if (!e1rm || !bw) { map[liftType] = null; return; }
      var pct = calcLiftPercentile(liftType, e1rm, bw, gender);
      var tier = percentileToSBDTier(pct);
      map[liftType] = {
        tier: tier.name,
        color: tier.color,
        percentile: pct,
        e1rm: e1rm,
        updatedAt: now
      };
    });

    db.gamification.liftRanks = map;
    if (typeof saveDB === 'function') saveDB();
    if (typeof syncToCloud === 'function') syncToCloud(true);
  } catch(e) {
    console.error('calcAndStoreLiftRanks error:', e);
  }
}

// ── Secret Quests ──
var SECRET_QUESTS = [
  { id:'sq_triple', condition:function(){ var wl=_getLogsThisWeek(); var pb=_getPrevBest(); var prs=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){if(e.maxRM>0&&e.maxRM>(pb[e.name]||0))prs++;}); }); return prs>=3; }, name:'Triplé d\'or', msg:'🔥 3 records en une semaine — tu es en feu !', xp:300 },
  { id:'sq_marathon', condition:function(){ var maxDur=0; db.logs.forEach(function(l){ var dur=l.duration||0; if(dur>maxDur)maxDur=dur; }); return maxDur>=10800; }, name:'Marathon de fer', msg:'⏱ Plus de 3 heures de training — respect !', xp:150 },
  { id:'sq_first', condition:function(){ return db.logs.length>=1; }, name:'Premier pas', msg:'👣 Tu as essayé quelque chose de nouveau !', xp:50 },
  { id:'sq_hyper', condition:function(){ var now=Date.now(); var twoWeeks=14*86400000; var count=db.logs.filter(function(l){return (now-l.timestamp)<twoWeeks;}).length; return count>=10; }, name:'Hyperactif', msg:'💪 10 séances en 14 jours — machine !', xp:200 },
  { id:'sq_club400', condition:function(){ return (db.bestPR.bench||0)+(db.bestPR.squat||0)+(db.bestPR.deadlift||0)>=400; }, name:'Club des 400', msg:'🏋️ Bienvenue dans le club des 400kg total !', xp:500 },
  { id:'sq_early', condition:function(){ return db.logs.some(function(l){ var h=new Date(l.timestamp).getHours(); return h<7; }); }, name:'Lève-tôt', msg:'🌅 Séance avant 7h — la discipline !', xp:100 },
  { id:'sq_nutrition7', condition:function(){ if(!db.body||!db.body.length)return false; var sorted=db.body.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);}); var streak=0,maxStreak=0; for(var i=0;i<sorted.length;i++){ if(sorted[i].kcal&&sorted[i].kcal>0){streak++;if(streak>maxStreak)maxStreak=streak;}else{streak=0;} } return maxStreak>=7; }, name:'Nutrition parfaite', msg:'🥗 7 jours de macros impeccables !', xp:200 },
  { id:'sq_breakthrough', condition:function(){ var best=getAllBestE1RMs(); var bw=db.user.bw||80; for(var name in best){ var sl=getStrengthLevel(name,best[name].e1rm,bw); if(sl&&sl.levelIdx>=3)return true; } return false; }, name:'Percée', msg:'📈 Tu as franchi un cap de force !', xp:250 }
];

// ── Title Pool ──
var TITLE_POOL = [
  { id:'t_apprenti', condition:function(){return db.logs.length>=10;}, title:'Apprenti guerrier', rarity:'common', condText:'10 séances' },
  { id:'t_veteran', condition:function(){return db.logs.length>=50;}, title:'Vétéran de la salle', rarity:'uncommon', condText:'50 séances' },
  { id:'t_bench_bw', condition:function(){var bw=db.user.bw||0;return bw>0&&(db.bestPR.bench||0)>=bw;}, title:'Presser de son poids', rarity:'uncommon', condText:'Bench ≥ poids de corps' },
  { id:'t_squat15', condition:function(){var bw=db.user.bw||0;return bw>0&&(db.bestPR.squat||0)>=bw*1.5;}, title:'Roi du squat', rarity:'rare', condText:'Squat ≥ 1.5× poids de corps' },
  { id:'t_dead2', condition:function(){var bw=db.user.bw||0;return bw>0&&(db.bestPR.deadlift||0)>=bw*2;}, title:'Maître du soulevé', rarity:'rare', condText:'Deadlift ≥ 2× poids de corps' },
  { id:'t_club400', condition:function(){return (db.bestPR.bench||0)+(db.bestPR.squat||0)+(db.bestPR.deadlift||0)>=400;}, title:'Membre du club 400', rarity:'epic', condText:'Total SBD ≥ 400kg' },
  { id:'t_streak10', condition:function(){return calcStreak()>=10;}, title:'L\'Inarrêtable', rarity:'epic', condText:'Série ≥ 10 semaines' },
  { id:'t_hunter', condition:function(){ var wl=_getLogsThisWeek(); var pb=_getPrevBest(); var prs=0; wl.forEach(function(l){(l.exercises||[]).forEach(function(e){if(e.maxRM>0&&e.maxRM>(pb[e.name]||0))prs++;}); }); return prs>=3; }, title:'Chasseur de records', rarity:'rare', condText:'3 PRs en 1 semaine' },
  { id:'t_centurion', condition:function(){return db.logs.length>=100;}, title:'Centurion du fer', rarity:'legendary', condText:'100 séances' },
  { id:'t_elite', condition:function(){ var best=getAllBestE1RMs(); var bw=db.user.bw||80; for(var n in best){ var sl=getStrengthLevel(n,best[n].e1rm,bw); if(sl&&sl.levelIdx>=4)return true; } return false; }, title:'Forgeron d\'élite', rarity:'mythic', condText:'Niveau Élite sur 1 exercice' },
  { id:'t_quester', condition:function(){return db.questStreak>=8;}, title:'Quêteur infatigable', rarity:'mythic', condText:'Toutes quêtes hebdo 8 sem d\'affilée' },
  { id:'t_legend', condition:function(){return db.logs.length>=200&&(db.bestPR.bench||0)+(db.bestPR.squat||0)+(db.bestPR.deadlift||0)>=500;}, title:'Légende vivante', rarity:'divine', condText:'200 séances + Total > 500kg' }
];

var _titleRarityColor = {common:'#86868B',uncommon:'#32d74b',rare:'#0a84ff',epic:'#bf5af2',legendary:'#ff9f0a',mythic:'#ff453a',divine:'#bf5af2'};

// ── Helpers ──
function _hashWeekKey(key) {
  var h = 0;
  for (var i = 0; i < key.length; i++) h += key.charCodeAt(i);
  return h;
}

function _getPrevBest() {
  var wkStart = new Date(_getWeekKey()).getTime();
  var prevBest = {};
  db.logs.forEach(function(l) {
    if (l.timestamp >= wkStart) return;
    (l.exercises||[]).forEach(function(e) {
      if (e.maxRM > 0 && e.maxRM > (prevBest[e.name]||0)) prevBest[e.name] = e.maxRM;
    });
  });
  return prevBest;
}

function _getMonthKey() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

function _getLogsThisMonth() {
  var mk = _getMonthKey();
  var parts = mk.split('-');
  var start = new Date(parseInt(parts[0]), parseInt(parts[1])-1, 1).getTime();
  var end = new Date(parseInt(parts[0]), parseInt(parts[1]), 1).getTime();
  return db.logs.filter(function(l) { return l.timestamp >= start && l.timestamp < end; });
}

function _daysLeftInMonth() {
  var d = new Date();
  var last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  return last - d.getDate();
}

// ── Weekly Challenges V2 ──
function generateWeeklyChallenges() {
  var weekKey = _getWeekKey();
  if (db.weeklyChallenges && db.weeklyChallenges.weekKey === weekKey) return;

  // Check previous week completion for quest streak
  if (db.weeklyChallenges && db.weeklyChallenges.challenges) {
    var allDone = db.weeklyChallenges.challenges.every(function(c) { return c.completed; });
    if (allDone) { db.questStreak = (db.questStreak || 0) + 1; }
    else { db.questStreak = 0; }
  }

  var sessTarget = getTrainingDaysCount();
  var challenges = [];

  // 1. Assiduité (fixed — uses getTrainingDaysCount())
  challenges.push({ id:'w_assiduite', type:'assiduite', label:'Respecte ton programme', description:'Complète ' + sessTarget + ' séances cette semaine', target:sessTarget, current:0, xpReward:200, completed:false });

  // 2. Nutrition (fixed — uses same dynamic count)
  challenges.push({ id:'w_nutrition', type:'nutrition', label:'Remplis tes macros ' + sessTarget + ' jours', description:'Enregistre tes calories ' + sessTarget + ' jours cette semaine', target:sessTarget, current:0, xpReward:150, completed:false, onclick:'nutrition' });

  // 3. Pesée (fixed)
  challenges.push({ id:'w_pesee', type:'pesee', label:'Pèse-toi cette semaine', description:'Enregistre au moins 1 pesée cette semaine', target:1, current:0, xpReward:50, completed:false, onclick:'pesee' });

  // 4. Rotating quest from pool
  var history = db.questHistory || [];
  var poolIdx = _hashWeekKey(weekKey) % WEEKLY_QUEST_POOL.length;
  var attempts = 0;
  while (history.indexOf(WEEKLY_QUEST_POOL[poolIdx].id) >= 0 && attempts < WEEKLY_QUEST_POOL.length) {
    poolIdx = (poolIdx + 1) % WEEKLY_QUEST_POOL.length;
    attempts++;
  }
  var chosen = WEEKLY_QUEST_POOL[poolIdx];
  var targetData = chosen.targetFn();
  var target = typeof targetData === 'object' ? targetData.target : targetData;
  var meta = typeof targetData === 'object' ? targetData : {};
  var description = chosen.descFn ? chosen.descFn(target, meta.muscle) : chosen.desc;
  challenges.push({ id:'w_rotating', type:chosen.id, label:chosen.name, description:description, target:target, current:0, xpReward:chosen.xp, completed:false, meta:meta });

  // Update quest history (keep last 6)
  history.push(chosen.id);
  if (history.length > 6) history = history.slice(-6);
  db.questHistory = history;

  db.weeklyChallenges = { weekKey: weekKey, challenges: challenges };
  saveDB();
}

function updateChallengeProgress() {
  if (!db.weeklyChallenges || !db.weeklyChallenges.challenges) return;
  var weekLogs = _getLogsThisWeek();
  var prevBest = _getPrevBest();

  // Count body entries this week
  var wkStart = new Date(db.weeklyChallenges.weekKey).getTime();
  var wkEnd = wkStart + 7 * 86400000;
  var bodyThisWeek = (db.body || []).filter(function(b) {
    var ts = new Date(b.date).getTime();
    return ts >= wkStart && ts < wkEnd;
  });

  db.weeklyChallenges.challenges.forEach(function(c) {
    if (c.type === 'assiduite') {
      c.current = weekLogs.length;
    } else if (c.type === 'nutrition') {
      c.current = bodyThisWeek.filter(function(b) { return b.kcal && b.kcal > 0; }).length;
    } else if (c.type === 'pesee') {
      c.current = bodyThisWeek.filter(function(b) { return b.bw && b.bw > 0; }).length;
    } else {
      // Rotating quest — find matching pool entry
      var poolEntry = WEEKLY_QUEST_POOL.find(function(p) { return p.id === c.type; });
      if (poolEntry) {
        c.current = poolEntry.currentFn(weekLogs, prevBest, c.meta || {});
      }
    }
    if (c.current >= c.target && !c.completed) { c.completed = true; try { navigator.vibrate([50,50,50]); } catch(e) {} saveDB(); }
  });
}

// ── Monthly Challenges ──
function generateMonthlyChallenges() {
  var monthKey = _getMonthKey();
  if (db.monthlyChallenges && db.monthlyChallenges.monthKey === monthKey) return;

  var monthHash = _hashWeekKey(monthKey);
  var challenges = [];
  var idx1 = monthHash % MONTHLY_QUEST_POOL.length;
  var idx2 = (idx1 + 1 + (monthHash % Math.max(1, MONTHLY_QUEST_POOL.length - 1))) % MONTHLY_QUEST_POOL.length;
  if (idx2 === idx1) idx2 = (idx1 + 1) % MONTHLY_QUEST_POOL.length;

  [idx1, idx2].forEach(function(idx) {
    var q = MONTHLY_QUEST_POOL[idx];
    var target = q.targetFn();
    var description = q.descFn ? q.descFn(target) : q.desc;
    challenges.push({ id: q.id, type: q.id, label: q.name, description: description, target: target, current: 0, xpReward: q.xp, completed: false });
  });

  db.monthlyChallenges = { monthKey: monthKey, challenges: challenges };
  saveDB();
}

function updateMonthlyChallengeProgress() {
  if (!db.monthlyChallenges || !db.monthlyChallenges.challenges) return;
  var monthLogs = _getLogsThisMonth();
  var prevBest = {};
  var mk = _getMonthKey();
  var parts = mk.split('-');
  var monthStart = new Date(parseInt(parts[0]), parseInt(parts[1])-1, 1).getTime();
  db.logs.forEach(function(l) {
    if (l.timestamp >= monthStart) return;
    (l.exercises||[]).forEach(function(e) {
      if (e.maxRM > 0 && e.maxRM > (prevBest[e.name]||0)) prevBest[e.name] = e.maxRM;
    });
  });

  db.monthlyChallenges.challenges.forEach(function(c) {
    if (c.type === 'm_pr_count') {
      var prs = 0;
      monthLogs.forEach(function(l) { (l.exercises||[]).forEach(function(e) { if (e.maxRM > 0 && e.maxRM > (prevBest[e.name]||0)) prs++; }); });
      c.current = prs;
    } else if (c.type === 'm_volume') {
      c.current = monthLogs.reduce(function(s,l) { return s + (l.volume||0); }, 0);
    } else if (c.type === 'm_sessions') {
      c.current = monthLogs.length;
    } else if (c.type === 'm_streak') {
      c.current = calcStreak();
    } else if (c.type === 'm_strength') {
      var best = getAllBestE1RMs(); var bw = db.user.bw || 80; var found = 0;
      for (var n in best) { var sl = getStrengthLevel(n, best[n].e1rm, bw); if (sl && sl.levelIdx >= 2) found++; }
      c.current = found > 0 ? 1 : 0;
    } else if (c.type === 'm_muscle_balance') {
      var muscleMin = Infinity; var muscleVol = {};
      monthLogs.forEach(function(l) { (l.exercises||[]).forEach(function(e) {
        var mg = getMuscleGroupParent ? getMuscleGroupParent(getMuscleGroup(e.name)||'Autre') : (getMuscleGroup(e.name)||'Autre');
        if (mg !== 'Autre') muscleVol[mg] = (muscleVol[mg]||0) + (e.sets||0);
      }); });
      for (var g in muscleVol) { if (muscleVol[g] < muscleMin) muscleMin = muscleVol[g]; }
      c.current = muscleMin === Infinity ? 0 : muscleMin;
    } else if (c.type === 'm_nutrition') {
      c.current = (db.body || []).filter(function(b) {
        var d = new Date(b.date); var bm = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
        return bm === mk && b.kcal && b.kcal > 0;
      }).length;
    } else if (c.type === 'm_discovery') {
      var beforeExos = new Set();
      db.logs.forEach(function(l) { if (l.timestamp < monthStart) (l.exercises||[]).forEach(function(e) { beforeExos.add(e.name); }); });
      var newCount = 0;
      monthLogs.forEach(function(l) { (l.exercises||[]).forEach(function(e) { if (!beforeExos.has(e.name)) { beforeExos.add(e.name); newCount++; } }); });
      c.current = newCount;
    } else if (c.type === 'm_heavy_month') {
      var best2 = getAllBestE1RMs(); var count = 0;
      monthLogs.forEach(function(l) { (l.exercises||[]).forEach(function(e) {
        var b = best2[e.name]; if (b && e.maxRM >= b.e1rm * 0.9) count += (e.sets||0);
      }); });
      c.current = count;
    } else if (c.type === 'm_consistency') {
      // Count weeks in month where sessions >= routine days
      var routineDays = getTrainingDaysCount();
      var weekMap = {};
      monthLogs.forEach(function(l) {
        var ws = _getWeekStart(new Date(l.timestamp)).toISOString().slice(0,10);
        weekMap[ws] = (weekMap[ws]||0) + 1;
      });
      var completeWeeks = 0;
      for (var w in weekMap) { if (weekMap[w] >= routineDays) completeWeeks++; }
      c.current = completeWeeks;
    }
    if (c.current >= c.target && !c.completed) { c.completed = true; try { navigator.vibrate([50,50,50]); } catch(e) {} saveDB(); }
  });
}

// ── Secret Quests ──
function checkSecretQuests() {
  var completed = db.secretQuestsCompleted || [];
  var newlyCompleted = [];
  SECRET_QUESTS.forEach(function(sq) {
    if (completed.indexOf(sq.id) >= 0) return;
    try {
      if (sq.condition()) {
        completed.push(sq.id);
        newlyCompleted.push(sq);
      }
    } catch(e) {}
  });
  if (newlyCompleted.length > 0) {
    db.secretQuestsCompleted = completed;
    saveDB();
    // Show toast for first new one
    newlyCompleted.forEach(function(sq) {
      _showSecretQuestToast(sq);
    });
  }
}

function _showSecretQuestToast(sq) {
  try { navigator.vibrate(100); } catch(e) {}
  var el = document.createElement('div');
  el.className = 'toast';
  el.style.background = 'var(--gold)';
  el.style.color = '#000';
  el.innerHTML = '🔮 ' + sq.name + ' — +' + sq.xp + ' XP';
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3000);
}

// ── Titles ──
function checkTitles() {
  var unlocked = db.unlockedTitles || [];
  TITLE_POOL.forEach(function(t) {
    if (unlocked.indexOf(t.id) >= 0) return;
    try { if (t.condition()) { unlocked.push(t.id); } } catch(e) {}
  });
  db.unlockedTitles = unlocked;
}

function showTitleModal() {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  var box = document.createElement('div');
  box.className = 'modal-box';
  box.style.maxWidth = '340px';
  box.style.textAlign = 'left';
  box.innerHTML = '<div style="font-size:16px;font-weight:800;margin-bottom:14px;text-align:center;">Choisis ton titre</div><div class="title-modal-list" id="titleList"></div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  var list = box.querySelector('#titleList');
  var html = '';
  var unlocked = db.unlockedTitles || [];
  TITLE_POOL.forEach(function(t) {
    var isUnlocked = unlocked.indexOf(t.id) >= 0;
    var isActive = db.activeTitle === t.id;
    var rc = _titleRarityColor[t.rarity] || '#86868B';
    html += '<div class="title-row ' + (isActive ? 'active-title' : '') + (isUnlocked ? '' : ' locked-title') + '" ' + (isUnlocked ? 'onclick="db.activeTitle=&quot;' + t.id + '&quot;;saveDB();document.querySelector(&quot;.modal-overlay&quot;).remove();renderGamificationTab();"' : '') + '>';
    html += '<div><div style="font-size:13px;font-weight:700;color:' + (isUnlocked ? rc : 'var(--sub)') + ';">' + (isUnlocked ? '' : '🔒 ') + t.title + '</div>';
    html += '<div class="title-cond">' + t.condText + '</div></div>';
    html += '<div class="title-rarity" style="background:' + rc + '15;color:' + rc + ';">' + t.rarity + '</div>';
    html += '</div>';
  });
  list.innerHTML = html;
}

function _calcTodayXP() {
  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var todayEnd = todayStart + 86400000;
  var xp = 0;
  var runBest = {};
  getSortedLogs().slice().reverse().forEach(function(log) {
    var isToday = log.timestamp >= todayStart && log.timestamp < todayEnd;
    (log.exercises||[]).forEach(function(exo) {
      if (exo.maxRM > 0) {
        var prev = runBest[exo.name] || 0;
        if (isToday) {
          if (prev > 0 && exo.maxRM > prev) xp += 50;
          else if (prev === 0) xp += 20;
        }
        if (exo.maxRM > (runBest[exo.name]||0)) runBest[exo.name] = exo.maxRM;
      }
    });
    if (isToday) {
      xp += 100;
      xp += Math.min(10, (log.exercises||[]).length) * 8;
      xp += Math.floor((log.volume || 0) / 500);
    }
  });
  return xp;
}

function scrollToBadgeCategory(badgeId) {
  var sections = document.querySelectorAll('.bdg-section');
  sections.forEach(function(sec) {
    var found = sec.querySelector('[data-badge-id="' + badgeId + '"]');
    if (found) {
      var body = sec.querySelector('.bdg-sec-body');
      if (body && !body.classList.contains('open')) {
        toggleBdgSection(sec.querySelector('.bdg-sec-head'));
      }
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      found.style.outline = '2px solid var(--purple)';
      found.style.outlineOffset = '2px';
      setTimeout(function() { found.style.outline = ''; found.style.outlineOffset = ''; }, 2000);
    }
  });
}

function getTrainingDaysCount() {
  var routine = getRoutine();
  if (routine) {
    var days = 0;
    for (var k in routine) {
      var v = routine[k];
      if (v && typeof v === 'string' && v.toLowerCase() !== 'repos' && v.toLowerCase() !== 'rest' && v !== '') days++;
    }
    if (days > 0) return days;
  }
  if (db.user.trainingDays) return db.user.trainingDays;
  var last4w = getLogsInRange(28);
  if (last4w.length >= 4) return Math.round(last4w.length / 4);
  return 5;
}

function calcBadgeProgress(badge) {
  if (!badge || badge.impossible) return null;
  var id = badge.id;
  var logs = db.logs;
  var B = db.bestPR.bench||0, S = db.bestPR.squat||0, D = db.bestPR.deadlift||0;
  var bw = db.user.bw||80;

  // Pre-compute stats
  var totalVol = 0, maxSessVol = 0, totalSets = 0, totalDur = 0, maxSessDur = 0;
  var uniqueExos = new Set();
  logs.forEach(function(l) {
    totalVol += (l.volume||0);
    if ((l.volume||0) > maxSessVol) maxSessVol = l.volume||0;
    var ss = 0;
    (l.exercises||[]).forEach(function(e) { ss += (e.sets||0); uniqueExos.add(e.name); });
    totalSets += ss;
    var dur = l.duration || (ss * 210);
    if (dur > maxSessDur) maxSessDur = dur;
    totalDur += dur;
  });

  // Sessions
  if (/^s\d+$/.test(id)) { var t = parseInt(id.slice(1)); return { current: logs.length, target: t, pct: Math.min(100, Math.round(logs.length/t*100)) }; }
  // Volume session
  if (/^vs\d+$/.test(id) || id === 'v10t') { var t = id === 'v10t' ? 10000 : parseInt(id.slice(2)) * 1000; return { current: maxSessVol, target: t, pct: Math.min(100, Math.round(maxSessVol/t*100)) }; }
  // Volume cumul
  if (/^vt\d+$/.test(id)) { var t = parseInt(id.slice(2)) * 1000; return { current: totalVol, target: t, pct: Math.min(100, Math.round(totalVol/t*100)) }; }
  // Duration session
  if (/^dur\d+$/.test(id)) { var mins = parseInt(id.slice(3)); var t = mins * 60; return { current: maxSessDur, target: t, pct: Math.min(100, Math.round(maxSessDur/t*100)) }; }
  // Duration cumul
  if (/^tdur\d+$/.test(id)) { var h = parseInt(id.slice(4)); var t = h * 3600; return { current: totalDur, target: t, pct: Math.min(100, Math.round(totalDur/t*100)) }; }
  // Sets
  if (/^st\d+$/.test(id)) { var t = parseInt(id.slice(2)); return { current: totalSets, target: t, pct: Math.min(100, Math.round(totalSets/t*100)) }; }
  // Exercises
  if (/^ex\d+$/.test(id)) { var t = parseInt(id.slice(2)); return { current: uniqueExos.size, target: t, pct: Math.min(100, Math.round(uniqueExos.size/t*100)) }; }
  // Bench
  if (id.startsWith('bench_')) { var t = parseInt(id.split('_')[1]); return { current: B, target: t, pct: Math.min(100, Math.round(B/t*100)) }; }
  // Squat
  if (id.startsWith('squat_')) { var t = parseInt(id.split('_')[1]); return { current: S, target: t, pct: Math.min(100, Math.round(S/t*100)) }; }
  // Deadlift
  if (id.startsWith('dead_')) { var t = parseInt(id.split('_')[1]); return { current: D, target: t, pct: Math.min(100, Math.round(D/t*100)) }; }
  // OHP
  if (id.startsWith('ohp_')) {
    var ohpRM = 0;
    var _ohpRe = /overhead|militaire|\bohp\b|press mil/i;
    logs.forEach(function(l) { (l.exercises||[]).forEach(function(e) { if (_ohpRe.test(e.name) && (e.maxRM||0) > ohpRM) ohpRM = e.maxRM; }); });
    var t = parseInt(id.split('_')[1]);
    return { current: ohpRM, target: t, pct: Math.min(100, Math.round(ohpRM/t*100)) };
  }
  // Total SBD
  if (id.startsWith('total_')) { var t = parseInt(id.split('_')[1]); var total = B+S+D; return { current: total, target: t, pct: Math.min(100, Math.round(total/t*100)) }; }
  // BW ratios
  if (id.startsWith('bw_')) {
    var m = id.match(/bw_(b|s|d)(\d+)/);
    if (m) {
      var val = m[1] === 'b' ? B : m[1] === 's' ? S : D;
      var ratio = parseFloat(m[2]) / 10 || 1;
      // Determine actual ratio from badge condition
      if (badge.condition) {
        var rm = badge.condition.match(/([\d.]+)×/);
        if (rm) ratio = parseFloat(rm[1]);
      }
      var t = bw * ratio;
      return t > 0 ? { current: val, target: Math.round(t), pct: Math.min(100, Math.round(val/t*100)) } : null;
    }
  }
  // Streak
  if (id.startsWith('streak_')) { var t = parseInt(id.split('_')[1]); var s = calcStreak(); return { current: s, target: t, pct: Math.min(100, Math.round(s/t*100)) }; }
  // Collector — count non-collector badges only (matches _colCount unlock logic)
  if (id.startsWith('col')) {
    var allB = getAllBadges();
    var nonCol = allB.filter(function(x){return !x.impossible && !x.id.startsWith('col');});
    var unl = nonCol.filter(function(x){return x.ck();}).length;
    var t2;
    if (id === 'col_all') {
      // For col_all, target = total non-impossible badges (including collector)
      var allNorm = allB.filter(function(x){return !x.impossible;});
      t2 = allNorm.length;
      unl = allNorm.filter(function(x){return x.ck();}).length;
    } else {
      t2 = parseInt(id.slice(3));
    }
    return t2 > 0 ? { current: unl, target: t2, pct: Math.min(100, Math.round(unl/t2*100)) } : null;
  }
  return null;
}

function calcXPBreakdown() {
  var xpSeances = 0, xpRecords = 0, xpTonnage = 0;
  var sorted = getSortedLogs().slice().reverse();
  var runningBest = {};
  sorted.forEach(function(log) {
    xpSeances += 100;
    xpSeances += Math.min(10, (log.exercises||[]).length) * 8;
    xpTonnage += Math.floor((log.volume||0) / 500);
    (log.exercises||[]).forEach(function(exo) {
      if (exo.maxRM > 0) {
        var prev = runningBest[exo.name] || 0;
        if (prev > 0 && exo.maxRM > prev) xpRecords += 50;
        else if (prev === 0) xpRecords += 20;
        if (exo.maxRM > (runningBest[exo.name]||0)) runningBest[exo.name] = exo.maxRM;
      }
    });
  });
  var xpRegularite = calcStreak() * 25;
  var xpDefis = 0;
  if (db.weeklyChallenges && db.weeklyChallenges.challenges) {
    db.weeklyChallenges.challenges.forEach(function(c) { if (c.completed) xpDefis += (c.xpReward||0); });
  }
  if (db.monthlyChallenges && db.monthlyChallenges.challenges) {
    db.monthlyChallenges.challenges.forEach(function(c) { if (c.completed) xpDefis += (c.xpReward||0); });
  }
  (db.secretQuestsCompleted || []).forEach(function(sqId) {
    var sq = SECRET_QUESTS.find(function(s) { return s.id === sqId; });
    if (sq) xpDefis += sq.xp;
  });
  return { seances: xpSeances, records: xpRecords, regularite: xpRegularite, tonnage: xpTonnage, defis: xpDefis };
}

function renderGamificationTab() {
  var bw = db.user.bw || 80;
  var totalXP = calcTotalXP();
  var currLevel = getXPLevel(totalXP);
  var nextLevel = getNextXPLevel(totalXP);
  var streak = calcStreak();

  // ── Check titles & secret quests ──
  checkTitles();
  checkSecretQuests();

  // ── Clean up previous render artifacts (recap banners, separators) ──
  document.querySelectorAll('#tab-game > .gam-recap, #tab-game > .gam-separator').forEach(function(el) { el.remove(); });
  document.querySelectorAll('#tab-game .gam-separator').forEach(function(el) { el.remove(); });

  // ── 0. Weekly recap banner (Monday) ──
  (function() {
    var levelCardEl = document.getElementById('gamLevelCard');
    var today = new Date();
    var isMonday = today.getDay() === 1;
    var dismissed = sessionStorage.getItem('gamRecapDismissed');
    if (isMonday && !dismissed && db.weeklyChallenges && db.weeklyChallenges.challenges) {
      var ch = db.weeklyChallenges.challenges;
      var prevDone = ch.filter(function(c) { return c.completed; }).length;
      var prevXP = ch.reduce(function(s,c) { return s + (c.completed ? c.xpReward : 0); }, 0);
      var prevSessions = _getLogsThisWeek().length;
      var isPerfect = prevDone === ch.length && ch.length > 0;
      var recapHtml = '<div class="gam-recap' + (isPerfect ? ' shimmer' : '') + '" style="' + (isPerfect ? 'border-color:var(--gold);' : '') + '">' +
        '<div><div class="gam-recap-text">' + (isPerfect ? '🔥 Semaine parfaite !' : '📊 Semaine dernière') + '</div>' +
        '<div class="gam-recap-sub">' + prevDone + '/' + ch.length + ' quêtes · +' + prevXP + ' XP · ' + prevSessions + ' séances</div></div>' +
        '<button class="gam-recap-close" onclick="this.parentElement.remove();sessionStorage.setItem(\'gamRecapDismissed\',\'1\')">✕</button></div>';
      levelCardEl.insertAdjacentHTML('beforebegin', recapHtml);
    }
  })();

  // ── 1. Level card (V2 — reiatsu + today XP + clickable stats + title) ──
  var levelCard = document.getElementById('gamLevelCard');
  var xpInLevel = totalXP - currLevel.xp;
  var xpToNext = nextLevel ? nextLevel.xp - currLevel.xp : 1;
  var pct = nextLevel ? Math.min(100, Math.round(xpInLevel / xpToNext * 100)) : 100;
  var nextName = nextLevel ? '→ ' + nextLevel.icon + ' ' + nextLevel.name : 'NIVEAU MAX';
  var totalVolT = Math.round(db.logs.reduce(function(s,l){return s+(l.volume||0);}, 0) / 1000);
  var todayXP = _calcTodayXP();

  // Active title
  var activeTitleText = '';
  if (db.activeTitle) {
    var at = TITLE_POOL.find(function(t) { return t.id === db.activeTitle; });
    if (at) {
      var atColor = _titleRarityColor[at.rarity] || 'var(--sub)';
      activeTitleText = '<div class="lvl-title" style="color:' + atColor + ';" onclick="showTitleModal()">' + at.title + '</div>';
    }
  } else {
    activeTitleText = '<div class="lvl-title" style="color:var(--sub);" onclick="showTitleModal()">Choisir un titre ▾</div>';
  }

  // Player class line
  var classLine = '';
  (function() {
    var pc = (db.gamification && db.gamification.playerClass) ? db.gamification.playerClass : null;
    if (!pc || typeof PLAYER_CLASSES === 'undefined') return;
    var cls = PLAYER_CLASSES.find(function(c) { return c.id === pc; });
    if (!cls) return;
    classLine = '<div class="lvl-class" style="font-size:12px;color:var(--sub);margin-top:2px;">' +
      cls.icon + ' <strong style="color:var(--text);font-weight:600;">' + cls.name + '</strong> · Niveau ' + currLevel.level +
      '</div>';
  })();

  levelCard.innerHTML =
    '<div class="lvl-card lvl-card-v2">' +
      '<div class="lvl-bg"></div>' +
      (todayXP > 0 ? '<div class="lvl-xp-today">Aujourd\'hui : +' + todayXP + ' XP</div>' : '') +
      '<div class="lvl-top">' +
        '<div class="lvl-icon-wrap">' + currLevel.icon + '<div class="lvl-icon-ring"></div></div>' +
        '<div class="lvl-info">' +
          '<div class="lvl-num">Niveau ' + currLevel.level + ' · ' + totalXP.toLocaleString() + ' XP</div>' +
          '<div class="lvl-name">' + currLevel.name + '</div>' +
          classLine +
          activeTitleText +
        '</div>' +
      '</div>' +
      '<div class="lvl-xp-row">' +
        '<div class="lvl-xp-bar-bg"><div class="lvl-xp-bar lvl-xp-bar-v2" style="width:' + pct + '%;"></div></div>' +
        (pct > 0 && pct < 100 ? '<div class="lvl-xp-particle" style="left:' + pct + '%;"></div>' : '') +
        '<div class="lvl-xp-text"><span><strong>' + xpInLevel.toLocaleString() + '</strong> / ' + xpToNext.toLocaleString() + ' XP</span><span class="lvl-next">' + nextName + '</span></div>' +
      '</div>' +
      '<div class="lvl-stats">' +
        '<div class="lvl-stat lvl-stat-click" onclick="showTab(\'tab-seances\')"><div class="lvl-stat-val">' + db.logs.length + '</div><div class="lvl-stat-lbl">Séances</div></div>' +
        '<div class="lvl-stat lvl-stat-click" onclick="document.getElementById(\'gamHeatmap\').scrollIntoView({behavior:\'smooth\',block:\'start\'})"><div class="lvl-stat-val">' + streak + '🔥</div><div class="lvl-stat-lbl">Série sem.</div></div>' +
        '<div class="lvl-stat lvl-stat-click" onclick="showTab(\'tab-profil\');showProfilSub(\'tab-profil-stats\')"><div class="lvl-stat-val">' + totalVolT + 't</div><div class="lvl-stat-lbl">Vol. total</div></div>' +
      '</div>' +
    '</div>';

  // ── 2. Sources d'XP (clickable) ──
  (function() {
    var bd = calcXPBreakdown();
    var maxXP = Math.max(bd.seances, bd.records, bd.regularite, bd.tonnage, bd.defis, 1);
    var bars = [
      {label:'Séances', val:bd.seances, color:'var(--blue)', click:'showTab(\'tab-seances\')'},
      {label:'Records', val:bd.records, color:'var(--green)', click:'showTab(\'tab-profil\');showProfilSub(\'tab-profil-stats\');setTimeout(function(){showStatsSub(\'stats-records\');},100)'},
      {label:'Régularité', val:bd.regularite, color:'var(--orange)', click:'document.getElementById(\'gamHeatmap\').scrollIntoView({behavior:\'smooth\',block:\'start\'})'},
      {label:'Tonnage', val:bd.tonnage, color:'var(--purple)', click:'showTab(\'tab-profil\');showProfilSub(\'tab-profil-stats\');setTimeout(function(){showStatsSub(\'stats-volume\');},100)'},
      {label:'Défis', val:bd.defis, color:'var(--teal)', click:'document.getElementById(\'gamChallenges\').scrollIntoView({behavior:\'smooth\',block:\'start\'})'}
    ];
    var html = '<div class="mc"><div class="mc-title">📊 Sources d\'XP</div>' +
      '<div class="xs-counters">' +
        '<div class="xs-counter"><div class="xs-counter-val" style="color:var(--blue);">' + bd.seances.toLocaleString() + '</div><div class="xs-counter-lbl">Séances</div></div>' +
        '<div class="xs-counter"><div class="xs-counter-val" style="color:var(--green);">' + bd.records.toLocaleString() + '</div><div class="xs-counter-lbl">Records</div></div>' +
        '<div class="xs-counter"><div class="xs-counter-val" style="color:var(--orange);">' + bd.regularite.toLocaleString() + '</div><div class="xs-counter-lbl">Régularité</div></div>' +
      '</div>';
    bars.forEach(function(br) {
      var w = maxXP > 0 ? Math.round(br.val/maxXP*100) : 0;
      html += '<div class="xs-bar-row xs-bar-row-click" onclick="' + br.click + '"><div class="xs-bar-label">' + br.label + '</div><div class="xs-bar-bg"><div class="xs-bar" style="width:' + w + '%;background:' + br.color + ';"></div></div><div class="xs-bar-val">' + br.val.toLocaleString() + ' XP</div></div>';
    });
    html += '</div><div class="gam-separator">✦ ─── ✦ ─── ✦</div>';
    document.getElementById('gamXPSources').innerHTML = html;
  })();

  // ── 3. Quêtes hebdomadaires (Dofus quest style) ──
  generateWeeklyChallenges();
  updateChallengeProgress();
  (function() {
    var ch = db.weeklyChallenges ? db.weeklyChallenges.challenges : [];
    var done = ch.filter(function(c){return c.completed;}).length;
    var qs = db.questStreak || 0;

    // Flame rendering
    var flameHtml = '';
    if (qs > 0) {
      var flameCount = Math.min(3, qs);
      var flameClass = qs >= 4 ? 'gold' : (qs <= 1 ? 'dim' : '');
      for (var fi = 0; fi < flameCount; fi++) flameHtml += '<span class="flame-icon ' + flameClass + '"></span>';
      var bonusPct = qs >= 4 ? 20 : qs >= 3 ? 15 : qs >= 2 ? 10 : 0;
      if (bonusPct > 0) flameHtml += '<span class="flame-bonus">Série ×' + qs + ' — bonus +' + bonusPct + '%</span>';
    }
    var flameSec = flameHtml ? '<span class="flame-wrap">' + flameHtml + '</span>' : '';

    var html = '<div class="quest-card"><div class="mc-title"><span>⚡ Quêtes de la semaine ' + flameSec + '</span><span class="mc-title-right">' + done + '/' + ch.length + ' complétées</span></div>';

    ch.forEach(function(c) {
      var isDone = c.completed;
      var pctC = c.target > 0 ? Math.min(100, Math.round(c.current/c.target*100)) : 0;
      var remaining = Math.max(0, c.target - c.current);
      var onclick = '';
      if (c.type === 'assiduite') onclick = 'showTab(\'tab-seances\')';
      else if (c.type === 'nutrition' || c.onclick === 'nutrition') onclick = 'showTab(\'tab-profil\');showProfilSub(\'tab-corps\')';
      else if (c.type === 'pesee' || c.onclick === 'pesee') onclick = 'showTab(\'tab-profil\');showProfilSub(\'tab-corps\')';

      html += '<div class="quest-item ' + (isDone ? 'q-done' : 'q-active') + '"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' +
        '<div class="wc-status" style="color:' + (isDone ? 'var(--green)' : 'var(--orange)') + ';">' + (isDone ? '✓' : '○') + '</div>' +
        '<div class="wc-info"><div class="wc-label ' + (isDone ? 'done' : 'active') + '">' + c.label + '</div><div class="wc-desc">' + c.description + '</div>' +
        (isDone ? '' : '<div style="font-size:10px;color:var(--orange);margin-top:2px;">Il t\'en manque ' + remaining + '</div>') +
        '<div class="wc-bar-bg"><div class="wc-bar ' + (isDone ? 'done' : 'active') + '" style="width:' + pctC + '%;"></div></div></div>' +
        '<div class="wc-xp">+' + c.xpReward + ' XP</div></div>';
    });

    if (!ch.length) html += '<div style="color:var(--sub);font-size:12px;text-align:center;padding:12px;">Pas encore de données pour générer des quêtes.</div>';

    // Perfect quest bonus
    if (done === ch.length && ch.length > 0) {
      var baseXP = ch.reduce(function(s,c){return s+c.xpReward;},0);
      var bonusXP = Math.round(baseXP * 0.25);
      html += '<div class="quest-perfect shimmer">🌟 Quête parfaite ! +' + bonusXP + ' XP bonus</div>';
    }
    html += '</div>';
    document.getElementById('gamChallenges').innerHTML = html;
  })();

  // ── 3b. Quêtes mensuelles — Arcs du mois ──
  generateMonthlyChallenges();
  updateMonthlyChallengeProgress();
  (function() {
    var mc = db.monthlyChallenges ? db.monthlyChallenges.challenges : [];
    if (!mc.length) { document.getElementById('gamMonthlyChallenges').innerHTML = ''; return; }
    var done = mc.filter(function(c){return c.completed;}).length;
    var daysLeft = _daysLeftInMonth();
    var html = '<div class="quest-arc"><div class="mc-title"><span>🏔 Arcs du mois</span><span class="mc-title-right">' + done + '/' + mc.length + '</span></div>';
    mc.forEach(function(c) {
      var isDone = c.completed;
      var pctC = c.target > 0 ? Math.min(100, Math.round(c.current/c.target*100)) : 0;
      html += '<div class="quest-item ' + (isDone ? 'q-done' : '') + '" style="' + (isDone ? 'border:1px solid var(--gold-border);' : '') + '">' +
        '<div class="wc-status" style="color:' + (isDone ? 'var(--green)' : 'var(--purple)') + ';">' + (isDone ? '✓' : '○') + '</div>' +
        '<div class="wc-info"><div class="wc-label" style="color:' + (isDone ? 'var(--green)' : 'var(--text)') + ';">' + c.label + '</div><div class="wc-desc">' + c.description + '</div>' +
        '<div class="quest-arc-bar"><div class="quest-arc-fill" style="width:' + pctC + '%;"></div></div>' +
        '<div class="quest-remaining">Il reste ' + daysLeft + ' jours</div></div>' +
        '<div class="wc-xp">+' + c.xpReward + ' XP</div></div>';
    });
    html += '</div><div class="gam-separator">⟡ ── ⟡</div>';
    document.getElementById('gamMonthlyChallenges').innerHTML = html;
  })();

  // ── 3c. Secret quests section (in badges, rendered later) ──

  // ── 3d. Mes Rangs SBD ──
  (function() {
    var host = document.getElementById('gamSBDRanks');
    if (!host) return;
    if (typeof modeFeature === 'function' && modeFeature('showSBDCards') === false) {
      host.innerHTML = ''; return;
    }
    db.gamification = db.gamification || {};
    var lr = db.gamification.liftRanks;
    if (!lr || (!lr.squat && !lr.bench && !lr.deadlift)) { host.innerHTML = ''; return; }
    var bw = (db.user && db.user.bw) ? db.user.bw : 0;
    var gender = (db.user && db.user.gender) ? db.user.gender : 'male';
    var lifts = [
      { key:'squat',    icon:'🦵', label:'Squat' },
      { key:'bench',    icon:'🫸', label:'Développé couché' },
      { key:'deadlift', icon:'💀', label:'Soulevé de terre' }
    ];
    var sHtml = '<div class="mc-title" style="margin-bottom:12px;"><span>⚔️ Mes Rangs SBD</span></div>';
    lifts.forEach(function(l) {
      var r = lr[l.key];
      if (!r) return;
      var idx = -1;
      for (var i = 0; i < SBD_TIERS.length; i++) { if (r.percentile >= SBD_TIERS[i].min) idx = i; }
      var nextTier = (idx < SBD_TIERS.length - 1) ? SBD_TIERS[idx + 1] : null;
      var topPct = Math.max(1, 100 - r.percentile);
      var nextLine = '';
      if (nextTier && bw > 0) {
        var kgNeeded = _kgToReachTier(l.key, nextTier.min, bw, gender);
        if (kgNeeded && kgNeeded > r.e1rm) {
          var diff = kgNeeded - r.e1rm;
          nextLine = '<div class="sbd-rank-detail-next">Il te faut <strong style="color:' + nextTier.color + ';">+' + diff + ' kg</strong> de e1RM pour atteindre <strong style="color:' + nextTier.color + ';">' + nextTier.name + '</strong></div>';
        }
      } else if (!nextTier) {
        nextLine = '<div class="sbd-rank-detail-next">🏆 Tier maximum atteint — Légende vivante.</div>';
      }
      sHtml += '<div class="sbd-rank-detail-card">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;">' +
          '<div>' +
            '<div style="font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:0.8px;">' + l.icon + ' ' + l.label + '</div>' +
            '<div class="sbd-rank-detail-tier" style="color:' + r.color + ';">' + r.tier + '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div class="sbd-rank-detail-e1rm">' + r.e1rm + ' kg</div>' +
            '<div class="sbd-rank-detail-pct">Top ' + topPct + '% mondial</div>' +
          '</div>' +
        '</div>' +
        nextLine +
      '</div>';
    });
    sHtml += '<div class="gam-separator">⟡ ── ⟡</div>';
    host.innerHTML = '<div class="mc">' + sHtml + '</div>';
  })();

  // ── 4. Récemment débloqués ──
  (function() {
    var allBadges = getAllBadges();
    var rarityColor = {common:'#86868B',uncommon:'#32d74b',rare:'#0a84ff',epic:'#bf5af2',legendary:'#ff9f0a',mythic:'#ff453a',divine:'#bf5af2'};
    var unlocked = allBadges.filter(function(b){return !b.impossible && b.ck();});
    var recent = unlocked.slice(-5).reverse();

    // Add recently completed secret quests
    var secretCompleted = db.secretQuestsCompleted || [];
    var secretBadges = secretCompleted.map(function(sqId) {
      var sq = SECRET_QUESTS.find(function(s){return s.id===sqId;});
      return sq ? { icon:'🔮', name:sq.name, ref:'SECRÈTE', r:'legendary', isSecret:true } : null;
    }).filter(Boolean).slice(-2);

    // Mark all unlocked badges as seen (even if we don't display them)
    var seenBadges = db.seenBadges || [];
    var seenChanged = false;
    unlocked.forEach(function(b) { if (seenBadges.indexOf(b.id) < 0) { seenBadges.push(b.id); seenChanged = true; } });
    if (seenChanged) { db.seenBadges = seenBadges; saveDB(); }

    var combined = secretBadges.concat(recent).slice(0, 5);
    if (!combined.length) { document.getElementById('gamRecentBadges').innerHTML = ''; return; }
    var html = '<div class="mc"><div class="mc-title">🏆 Récemment débloqués</div><div class="ru-scroll">';
    combined.forEach(function(b) {
      var rc = rarityColor[b.r] || '#86868B';
      var isNew = !b.isSecret && b.id && seenBadges.indexOf(b.id) < 0;
      var secClass = b.isSecret ? ' secret-badge' : '';
      var clickAttr = b.id && !b.isSecret ? ' onclick="scrollToBadgeCategory(\'' + b.id + '\')" style="cursor:pointer;border:1px solid ' + rc + '33;"' : ' style="border:1px solid ' + rc + '33;"';
      html += '<div class="ru-item' + secClass + '"' + clickAttr + '>' +
        (isNew ? '<div class="new-dot" style="position:absolute;top:6px;right:6px;"></div>' : '') +
        '<div class="ru-icon">' + b.icon + '</div><div class="ru-name">' + b.name + '</div>' +
        (b.isSecret ? '<div class="secret-label">SECRÈTE</div>' : '<div class="ru-date">' + (b.ref||'') + '</div>') +
        '</div>';
    });
    html += '</div></div>';
    document.getElementById('gamRecentBadges').innerHTML = html;
  })();

  // ── 5. Prochains badges ──
  (function() {
    var allBadges = getAllBadges();
    var rarityColor = {common:'#86868B',uncommon:'#32d74b',rare:'#0a84ff',epic:'#bf5af2',legendary:'#ff9f0a',mythic:'#ff453a',divine:'#bf5af2'};
    var locked = allBadges.filter(function(b){return !b.impossible && !b.ck();});
    var withProgress = [];
    locked.forEach(function(b) {
      var p = calcBadgeProgress(b);
      if (p && p.pct > 0) withProgress.push({badge:b, progress:p});
    });
    withProgress.sort(function(a,b){return b.progress.pct - a.progress.pct;});
    var top4 = withProgress.slice(0,4);
    if (!top4.length) { document.getElementById('gamNextBadges').innerHTML = ''; return; }
    var html = '<div class="mc"><div class="mc-title"><span>🎯 Prochains badges</span><span class="mc-title-right">Les plus proches</span></div>';
    top4.forEach(function(item) {
      var b = item.badge, p = item.progress;
      var rc = rarityColor[b.r] || '#86868B';
      var isAlmost = p.pct > 90;
      html += '<div class="nb-item" style="cursor:pointer;border:1px solid ' + rc + '22;' + (isAlmost ? 'border-color:var(--gold-border);' : '') + '" onclick="scrollToBadgeCategory(\'' + b.id + '\')"><div class="nb-icon" style="border:1px solid ' + rc + '33;">' + b.icon + '</div>' +
        '<div class="nb-info"><div class="nb-name">' + b.name + '</div><div class="nb-desc">' + b.desc + '</div>' +
        '<div class="nb-bar-bg"><div class="nb-bar" style="width:' + p.pct + '%;background:' + rc + ';"></div></div></div>' +
        '<div class="nb-pct" style="color:' + (isAlmost ? 'var(--orange)' : rc) + ';">' + p.pct + '%' + (isAlmost ? '<div style="font-size:9px;">Presque !</div>' : '') + '</div></div>';
    });
    html += '</div>';
    document.getElementById('gamNextBadges').innerHTML = html;
  })();

  // ── 6. Strength cards (grille paginée + clickable) ──
  (function() {
    var strContainer = document.getElementById('gamStrengthContent');
    if (!modeFeature('showStrengthLevel')) { if (strContainer) strContainer.innerHTML = ''; return; }
    var bestE1RMs = getAllBestE1RMs();
    var _stds = (db.user.gender === 'female') ? STRENGTH_STANDARDS_FEMALE : STRENGTH_STANDARDS;
    var segColors = ['#86868B','#0A84FF','#32D74B','#FF9F0A','#BF5AF2'];

    var allExos = [];
    for (var eName in bestE1RMs) {
      var data = bestE1RMs[eName];
      var sl = getStrengthLevel(eName, data.e1rm, bw);
      var sesCount = 0, prCount = 0, runBest = 0;
      getSortedLogs().slice().reverse().forEach(function(log) {
        var found = false;
        (log.exercises||[]).forEach(function(e) {
          if (e.name === eName) { found = true; if (e.maxRM > 0 && e.maxRM > runBest) { prCount++; runBest = e.maxRM; } }
        });
        if (found) sesCount++;
      });
      var exoXP = prCount * 50 + sesCount * 8;
      allExos.push({name:eName, e1rm:data.e1rm, sl:sl, sesCount:sesCount, exoXP:exoXP});
    }
    allExos.sort(function(a,b) {
      var aIdx = a.sl ? a.sl.levelIdx : -1;
      var bIdx = b.sl ? b.sl.levelIdx : -1;
      if (bIdx !== aIdx) return bIdx - aIdx;
      return (b.sl?b.sl.ratio:0) - (a.sl?a.sl.ratio:0);
    });

    if (!allExos.length) {
      strContainer.innerHTML = '<div class="mc" style="border-color:rgba(255,159,10,0.15);"><div class="mc-title">📊 Niveaux de force</div><div style="color:var(--sub);font-size:12px;text-align:center;padding:20px;">Importe des séances pour voir ton niveau par exercice.</div></div>';
      return;
    }

    var perPage = 6;
    var totalPages = Math.ceil(allExos.length / perPage);
    var pagesHtml = '';
    for (var pg = 0; pg < totalPages; pg++) {
      pagesHtml += '<div class="sg-page">';
      var start = pg * perPage, end = Math.min(start + perPage, allExos.length);
      for (var ei = start; ei < end; ei++) {
        var item = allExos[ei];
        var hasSL = !!item.sl;
        var isDim = item.sesCount <= 2 && !hasSL;
        var norm = item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        var ratios = null;
        for (var sKey in _stds) { if (_stds[sKey].patterns.some(function(p){return p.test(norm);})) { ratios = _stds[sKey].ratios; break; } }

        pagesHtml += '<div class="sg-card sg-card-click' + (isDim?' dim':'') + '" onclick="showTab(\'tab-profil\');showProfilSub(\'tab-profil-stats\');setTimeout(function(){showStatsSub(\'stats-records\');},100)">';
        pagesHtml += '<div class="sg-top"><div class="sg-name">' + item.name + '</div>';
        if (hasSL) pagesHtml += '<div class="sg-badge" style="background:' + item.sl.color + '22;color:' + item.sl.color + ';">' + item.sl.label.slice(0,3) + '</div>';
        pagesHtml += '</div>';
        pagesHtml += '<div class="sg-e1rm">e1RM ' + Math.round(item.e1rm) + 'kg' + (hasSL ? ' · ' + item.sl.ratio + '× BW' : '') + '</div>';

        if (ratios && hasSL) {
          var maxR = ratios[ratios.length-1] * 1.2;
          var needlePct = Math.min(98, Math.max(2, (item.sl.ratio / maxR) * 100));
          var gaugeHtml = '';
          for (var gi = 0; gi < 5; gi++) {
            var segOpacity = gi <= item.sl.levelIdx ? '0.5' : '0.25';
            gaugeHtml += '<div class="sg-gauge-seg" style="width:20%;background:' + segColors[gi] + ';opacity:' + segOpacity + ';"></div>';
          }
          pagesHtml += '<div class="sg-gauge" style="position:relative;">' + gaugeHtml + '<div class="sg-gauge-needle" style="left:' + needlePct + '%;"></div></div>';
          pagesHtml += '<div class="sg-labels"><span>Déb</span><span>Nov</span><span>Int</span><span>Av</span><span>Éli</span></div>';
        }

        pagesHtml += '<div class="sg-footer">';
        if (isDim) {
          pagesHtml += '<span>Pas assez de données</span>';
        } else if (hasSL) {
          var nextLvl = item.sl.levelIdx < 4 ? STRENGTH_LABELS[item.sl.levelIdx+1] : null;
          if (nextLvl && ratios) {
            var nextKg = Math.ceil(ratios[item.sl.levelIdx+1] * bw);
            pagesHtml += '<span style="color:var(--sub);">→ ' + nextLvl.label + ' à ' + nextKg + 'kg</span>';
          } else {
            pagesHtml += '<span style="color:var(--green);">Niveau max !</span>';
          }
        } else {
          pagesHtml += '<span></span>';
        }
        pagesHtml += '<div class="sg-footer-xp">+' + item.exoXP + ' XP</div>';
        pagesHtml += '</div></div>';
      }
      pagesHtml += '</div>';
    }

    var dotsHtml = '';
    for (var di = 0; di < totalPages; di++) {
      dotsHtml += '<div class="sg-dot' + (di===0?' active':'') + '" data-page="' + di + '"></div>';
    }

    strContainer.innerHTML =
      '<div class="mc" style="border-color:rgba(255,159,10,0.15);">' +
        '<div class="mc-title"><span>📊 Niveaux de force</span><span class="mc-title-right">1/' + totalPages + ' →</span></div>' +
        '<div class="sg-pages" id="sgPages">' + pagesHtml + '</div>' +
        '<div class="sg-dots" id="sgDots">' + dotsHtml + '</div>' +
      '</div>';

    var pagesEl = document.getElementById('sgPages');
    var dotsEl = document.getElementById('sgDots');
    var labelEl = strContainer.querySelector('.mc-title-right');
    if (pagesEl && dotsEl) {
      pagesEl.addEventListener('scroll', function() {
        var pageW = pagesEl.offsetWidth;
        var idx = Math.round(pagesEl.scrollLeft / pageW);
        dotsEl.querySelectorAll('.sg-dot').forEach(function(d,i) { d.classList.toggle('active', i===idx); });
        if (labelEl) labelEl.textContent = (idx+1) + '/' + totalPages + ' →';
      });
      dotsEl.querySelectorAll('.sg-dot').forEach(function(dot) {
        dot.addEventListener('click', function() {
          var pg = parseInt(dot.getAttribute('data-page'));
          pagesEl.scrollTo({left: pg * pagesEl.offsetWidth, behavior:'smooth'});
        });
      });
    }
  })();

  // Separator
  document.getElementById('gamStrengthContent').insertAdjacentHTML('beforeend', '<div class="gam-separator">✦ ─── ✦ ─── ✦</div>');

  // ── 7. Heatmap de régularité (52 semaines, clickable) ──
  (function() {
    var now = Date.now();
    var weekMs = 7 * 86400000;
    var weekCounts = new Array(52).fill(0);
    db.logs.forEach(function(l) {
      var wIdx = Math.floor((now - l.timestamp) / weekMs);
      if (wIdx >= 0 && wIdx < 52) weekCounts[wIdx]++;
    });
    var cells = '';
    for (var w = 51; w >= 0; w--) {
      var c = weekCounts[w];
      var cls = c === 0 ? '' : c === 1 ? ' l1' : c === 2 ? ' l2' : c === 3 ? ' l3' : ' l4';
      var weekOffset = -(w);
      cells += '<div class="hm-cell hm-cell-click' + cls + '" onclick="currentWeekOffset=-' + w + ';showTab(\'tab-seances\')" title="' + c + ' séance(s)"></div>';
    }
    db.gamification = db.gamification || {};
    var freezeCount = db.gamification.streakFreezes || 0;
    var freezeActive = db.gamification.freezeActiveThisWeek === true;
    var freezeTooltip = freezeCount + ' freeze(s) disponible(s) · Se régénère le 1er du mois';
    var freezeBadge = '<span class="hm-freeze' + (freezeCount === 0 ? ' dim' : '') + '" title="' + freezeTooltip + '" onclick="showToast(\'' + freezeTooltip.replace(/'/g, "\\'") + '\')" style="cursor:pointer;margin-left:6px;' + (freezeCount === 0 ? 'opacity:0.35;filter:grayscale(1);' : '') + '">❄️ ×' + freezeCount + '</span>';
    var freezeBtn = (freezeCount > 0 && !freezeActive)
      ? '<button class="hm-freeze-btn" onclick="activateFreezeManual()" style="margin-top:8px;padding:6px 12px;background:rgba(110,180,255,0.15);border:1px solid rgba(110,180,255,0.4);color:var(--blue);border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">❄️ Protéger cette semaine</button>'
      : (freezeActive ? '<div style="margin-top:8px;font-size:11px;color:var(--blue);text-align:center;">❄️ Semaine protégée</div>' : '');
    document.getElementById('gamHeatmap').innerHTML =
      '<div class="mc">' +
        '<div class="mc-title"><span>🔥 Régularité</span><span class="hm-streak">' + streak + ' semaines' + freezeBadge + '</span></div>' +
        '<div class="hm-grid">' + cells + '</div>' +
        freezeBtn +
        '<div class="hm-legend">Moins <div class="hm-legend-cell" style="background:#1C1C1E;"></div><div class="hm-legend-cell" style="background:rgba(50,215,75,0.20);"></div><div class="hm-legend-cell" style="background:rgba(50,215,75,0.40);"></div><div class="hm-legend-cell" style="background:rgba(50,215,75,0.60);"></div><div class="hm-legend-cell" style="background:rgba(50,215,75,0.85);"></div> Plus</div>' +
      '</div>';
  })();

  // Separator
  document.getElementById('gamHeatmap').insertAdjacentHTML('beforeend', '<div class="gam-separator">⟡ ── ⟡</div>');

  // ── 8. Badges (overview + chips + secret quests section + accordions + progress) ──
  var allBadges = getAllBadges();
  var rarityLabel = {common:'Commun',uncommon:'Peu commun',rare:'Rare',epic:'Épique',legendary:'Légendaire',mythic:'Mythique',divine:'Divin'};
  var rarityColor = {common:'#86868B',uncommon:'#32d74b',rare:'#0a84ff',epic:'#bf5af2',legendary:'#ff9f0a',mythic:'#ff453a',divine:'#bf5af2'};
  var seenBadgesSet = db.seenBadges || [];

  var normalBadges = allBadges.filter(function(b){ return !b.impossible; });
  var totalUnlocked = normalBadges.filter(function(b){ return b.ck(); }).length;
  var totalCount = normalBadges.length;
  var overviewPct = totalCount > 0 ? Math.round(totalUnlocked / totalCount * 100) : 0;

  var rarityOrder = ['common','uncommon','rare','epic','legendary','mythic','divine'];
  var rarityBreakdown = '';
  rarityOrder.forEach(function(r) {
    var rBadges = normalBadges.filter(function(b){ return b.r === r; });
    if (!rBadges.length) return;
    var rUnlocked = rBadges.filter(function(b){ return b.ck(); }).length;
    var rc = rarityColor[r];
    rarityBreakdown += '<div class="bdg-rarity" style="background:' + rc + '15;color:' + rc + ';">' + (rarityLabel[r]||r) + ' ' + rUnlocked + '/' + rBadges.length + '</div>';
  });

  document.getElementById('gamBadgesOverview').innerHTML =
    '<div class="bdg-overview">' +
      '<div class="bdg-total-val">' + totalUnlocked + ' <span>/ ' + totalCount + '</span></div>' +
      '<div class="bdg-total-lbl">Badges débloqués</div>' +
      '<div class="bdg-total-bar-bg"><div class="bdg-total-bar" style="width:' + overviewPct + '%;"></div></div>' +
      '<div class="bdg-rarity-row">' + rarityBreakdown + '</div>' +
    '</div>';

  // Badge sections
  var sections = [
    { title:'🎯 Séances', ids: ['s1','s10','s25','s50','s75','s100','s200','s300','s365','s500','s750','s1000'] },
    { title:'💪 Volume par Séance', ids: ['vs1','vs3','vs5','v10t','vs20','vs30','vs40','vs50','vs100'] },
    { title:'📦 Volume Cumulatif', ids: ['vt10','vt50','vt100','vt250','vt500','vt1000','vt2500','vt5000','vt7500','vt10000'] },
    { title:'⏱️ Durée de Séance', ids: ['dur60','dur90','dur120','dur150','dur180','dur240','dur480'] },
    { title:'🕐 Temps Total', ids: ['tdur50','tdur100','tdur250','tdur500','tdur1000','tdur1500','tdur2000'] },
    { title:'🔢 Séries Totales', ids: ['st100','st500','st1000','st2500','st5000','st10000','st20000','st40000'] },
    { title:'🧩 Exercices Maîtrisés', ids: ['ex10','ex25','ex50','ex75','ex100'] },
    { title:'🏋️ Bench Press', ids: allBadges.filter(function(b){return b.id.startsWith('bench_');}).map(function(b){return b.id;}) },
    { title:'🦵 Squat', ids: allBadges.filter(function(b){return b.id.startsWith('squat_');}).map(function(b){return b.id;}) },
    { title:'💀 Deadlift', ids: allBadges.filter(function(b){return b.id.startsWith('dead_');}).map(function(b){return b.id;}) },
    { title:'🔝 Overhead Press', ids: allBadges.filter(function(b){return b.id.startsWith('ohp_');}).map(function(b){return b.id;}) },
    { title:'🔱 Total SBD', ids: allBadges.filter(function(b){return b.id.startsWith('total_');}).map(function(b){return b.id;}) },
    { title:'⚖️ Poids de Corps', ids: allBadges.filter(function(b){return b.id.startsWith('bw_');}).map(function(b){return b.id;}) },
    { title:'📅 Assiduité', ids: allBadges.filter(function(b){return b.id.startsWith('streak_');}).map(function(b){return b.id;}) },
    { title:'🏆 Collectionneur', ids: allBadges.filter(function(b){return b.id.startsWith('col');}).map(function(b){return b.id;}) },
  ];

  var badgeMap = {};
  allBadges.forEach(function(b) { badgeMap[b.id] = b; });

  // Chips nav
  var chipsHtml = '<div class="bc-scroll">';
  // Add secret quests chip
  var sqCompleted = (db.secretQuestsCompleted || []).length;
  chipsHtml += '<div class="bc-chip" onclick="document.getElementById(\'bdgSecSecret\').scrollIntoView({behavior:\'smooth\',block:\'start\'})">🔮 Secrètes <span class="bc-chip-count" style="background:var(--gold-subtle);color:var(--gold);">' + sqCompleted + '/' + SECRET_QUESTS.length + '</span></div>';
  sections.forEach(function(sec, si) {
    var sectionBadges = sec.ids.map(function(id){ return badgeMap[id]; }).filter(Boolean);
    if (!sectionBadges.length) return;
    var countable = sectionBadges.filter(function(b){ return !b.impossible; });
    var unlocked = countable.filter(function(b){ return b.ck(); }).length;
    var icon = sec.title.split(' ')[0];
    var name = sec.title.replace(/^[^\s]+\s*/, '');
    chipsHtml += '<div class="bc-chip" onclick="document.getElementById(\'bdgSec' + si + '\').scrollIntoView({behavior:\'smooth\',block:\'start\'})">' + icon + ' ' + name + ' <span class="bc-chip-count" style="background:var(--purple)22;color:var(--purple);">' + unlocked + '/' + countable.length + '</span></div>';
  });
  chipsHtml += '</div>';

  // Build sections
  var secHtml = chipsHtml;

  // Secret quests section
  secHtml += '<div class="bdg-section" id="bdgSecSecret">';
  secHtml += '<div class="bdg-sec-head" onclick="toggleBdgSection(this)">';
  secHtml += '<div class="bdg-sec-title">🔮 Quêtes secrètes <span class="bdg-sec-count" style="color:var(--gold);">' + sqCompleted + '/' + SECRET_QUESTS.length + '</span></div>';
  secHtml += '<span class="bdg-sec-chev">▾</span></div>';
  secHtml += '<div class="bdg-sec-body"><div class="bdg-grid">';
  SECRET_QUESTS.forEach(function(sq) {
    var isCompleted = (db.secretQuestsCompleted || []).indexOf(sq.id) >= 0;
    if (isCompleted) {
      secHtml += '<div class="bdg legendary" style="border-color:var(--gold-border);">';
      secHtml += '<div class="bdg-rarity-bar" style="background:var(--gold);"></div>';
      secHtml += '<div class="secret-label">SECRÈTE</div>';
      secHtml += '<div class="bdg-icon">🔮</div>';
      secHtml += '<div class="bdg-name">' + sq.name + '</div>';
      secHtml += '<div class="bdg-desc">' + sq.msg + '</div>';
      secHtml += '<div style="font-size:10px;color:var(--gold);font-weight:700;margin-top:4px;">+' + sq.xp + ' XP</div>';
      secHtml += '</div>';
    } else {
      secHtml += '<div class="bdg locked" style="opacity:0.35;">';
      secHtml += '<div class="bdg-icon">🔒</div>';
      secHtml += '<div class="bdg-name">???</div>';
      secHtml += '<div class="bdg-desc">Quête secrète non révélée</div>';
      secHtml += '</div>';
    }
  });
  secHtml += '</div></div></div>';

  // Regular badge sections
  sections.forEach(function(sec, si) {
    var sectionBadges = sec.ids.map(function(id){ return badgeMap[id]; }).filter(Boolean);
    if (!sectionBadges.length) return;
    var countable = sectionBadges.filter(function(b){ return !b.impossible; });
    var unlocked = countable.filter(function(b){ return b.ck(); }).length;
    var isOpen = si === 0 ? ' open' : '';

    secHtml += '<div class="bdg-section" id="bdgSec' + si + '">';
    secHtml += '<div class="bdg-sec-head" onclick="toggleBdgSection(this)">';
    secHtml += '<div class="bdg-sec-title">' + sec.title + ' <span class="bdg-sec-count">' + unlocked + '/' + countable.length + '</span></div>';
    secHtml += '<span class="bdg-sec-chev' + isOpen + '">▾</span>';
    secHtml += '</div>';
    secHtml += '<div class="bdg-sec-body' + isOpen + '">';
    secHtml += '<div class="bdg-grid">';

    sectionBadges.forEach(function(badge) {
      var isUnlocked = badge.ck();
      var rc = rarityColor[badge.r] || '#86868B';
      var isNew = isUnlocked && seenBadgesSet.indexOf(badge.id) < 0;

      if (badge.impossible) {
        secHtml += '<div class="bdg locked" data-badge-id="' + badge.id + '" style="opacity:0.55;border-style:dashed;">';
        secHtml += '<div class="bdg-rarity-bar"></div>';
        secHtml += '<div style="font-size:8px;font-weight:700;color:#ff453a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">IMPOSSIBLE</div>';
        secHtml += '<div class="bdg-icon">' + badge.icon + '</div>';
        secHtml += '<div class="bdg-name">' + badge.name + '</div>';
        secHtml += '<div class="bdg-desc">' + badge.desc + '</div>';
        if (badge.condition) secHtml += '<div class="bdg-condition">' + badge.condition + '</div>';
        secHtml += '</div>';
      } else if (isUnlocked) {
        var themeClass = (badge.r === 'common' || badge.r === 'uncommon') ? ' common-v2' : '';
        if (badge.r === 'mythic') themeClass = ' mythic-v2';
        if (badge.r === 'divine') themeClass = ' divine-v2';
        secHtml += '<div class="bdg ' + badge.r + themeClass + '" data-badge-id="' + badge.id + '" style="position:relative;">';
        if (isNew) secHtml += '<div class="new-dot" style="position:absolute;top:6px;right:6px;"></div>';
        secHtml += '<div class="bdg-rarity-bar"></div>';
        secHtml += '<div class="bdg-rarity-lbl" style="color:' + rc + ';">' + (rarityLabel[badge.r]||'') + '</div>';
        secHtml += '<div class="bdg-icon">' + badge.icon + '</div>';
        secHtml += '<div class="bdg-name">' + badge.name + '</div>';
        secHtml += '<div style="font-size:9px;color:var(--purple);font-style:italic;margin-bottom:3px;">' + badge.ref + '</div>';
        secHtml += '<div class="bdg-desc">' + badge.desc + '</div>';
        secHtml += '</div>';
      } else {
        var prog = calcBadgeProgress(badge);
        var progPct = prog ? prog.pct : 0;
        var closeToUnlock = progPct > 50;
        secHtml += '<div class="bdg locked" data-badge-id="' + badge.id + '" style="opacity:' + (closeToUnlock?'0.55':'0.35') + ';' + (closeToUnlock?'border:1px solid '+rc+'33;':'') + '">';
        secHtml += '<div class="bdg-icon">🔒</div>';
        secHtml += '<div class="bdg-name">' + badge.name + '</div>';
        secHtml += '<div class="bdg-desc">???</div>';
        if (badge.condition) secHtml += '<div class="bdg-condition">' + badge.condition + '</div>';
        if (prog && prog.pct > 0) {
          secHtml += '<div class="bp-wrap"><div class="bp-bar-bg"><div class="bp-bar" style="width:' + prog.pct + '%;background:' + rc + ';"></div></div>';
          secHtml += '<div class="bp-text">' + (typeof prog.current === 'number' ? Math.round(prog.current).toLocaleString() : prog.current) + '/' + (typeof prog.target === 'number' ? Math.round(prog.target).toLocaleString() : prog.target) + ' (' + prog.pct + '%)</div></div>';
        }
        secHtml += '</div>';
      }
    });

    secHtml += '</div></div></div>';
  });

  document.getElementById('gamBadgesSections').innerHTML = secHtml;
}


// ============================================================
// RENDER — DASHBOARD
// ============================================================
function refreshUI() {
  recalcBestPR();
  if (db.user.name) { const ni=document.getElementById('inputName'); if(ni)ni.value=db.user.name; }
  if (db.user.bw) { const bi=document.getElementById('inputBW'); if(bi)bi.value=db.user.bw; }
  updateCoachBadge();
  // Only render the currently active tab instead of everything
  const activeTab = document.querySelector('.content-section.active');
  const tabId = activeTab ? activeTab.id : 'tab-dash';
  if (tabId === 'tab-dash') { renderDash(); renderProgramViewer(); }
  else if (tabId === 'tab-seances') { if (activeSeancesSub === 'seances-go') renderGoTab(); else renderSeancesTab(); }
  else if (tabId === 'tab-stats') showStatsSub(activeStatsSub);
  else if (tabId === 'tab-ai') { renderReportsTimeline(); renderCoachAlgoAI(); }
  else if (tabId === 'tab-profil') { if (activeProfilSub === 'tab-settings') { renderProgramViewer(); _accDirty.prog = true; _accDirty.records = true; _accDirty.keylifts = true; fillSettingsFields(); } else { renderCorpsTab(); } }
  else if (tabId === 'tab-social') { initSocialTab(); }
  else if (tabId === 'tab-game') { renderGamificationTab(); }
  else { renderDash(); renderProgramViewer(); }
}

// ── Streak de semaines consécutives (pour homepage) ──────────
function getWeekKey(ts) {
  const d = new Date(ts);
  const day = d.getDay() || 7; // 1=lun, 7=dim
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}

function computeWeekStreak() {
  if (!db.logs || !db.logs.length) return { current: 0, record: 0 };

  function getISOMonday(ts) {
    var d = new Date(ts);
    var day = d.getDay();
    var diff = (day === 0 ? -6 : 1 - day);
    var monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().slice(0, 10);
  }

  var weeksWithSession = new Set(db.logs.map(function(l) {
    return getISOMonday(l.timestamp || new Date(l.date).getTime());
  }));

  var currentWeek = getISOMonday(Date.now());

  // Count consecutive weeks backward
  function countFrom(startWeek) {
    var s = 0, check = startWeek;
    while (weeksWithSession.has(check)) {
      s++;
      var d = new Date(check);
      d.setDate(d.getDate() - 7);
      check = d.toISOString().slice(0, 10);
    }
    return s;
  }

  var current = countFrom(currentWeek);
  if (!weeksWithSession.has(currentWeek)) {
    var lw = new Date(currentWeek);
    lw.setDate(lw.getDate() - 7);
    var lwKey = lw.toISOString().slice(0, 10);
    if (weeksWithSession.has(lwKey)) current = countFrom(lwKey);
  }

  // Compute all-time record
  var sorted = Array.from(weeksWithSession).sort();
  var maxStreak = sorted.length ? 1 : 0;
  var cur = 1;
  for (var i = 1; i < sorted.length; i++) {
    var prev = new Date(sorted[i - 1]);
    var curr = new Date(sorted[i]);
    var diffWeeks = Math.round((curr - prev) / (7 * 86400000));
    if (diffWeeks === 1) { cur++; if (cur > maxStreak) maxStreak = cur; }
    else cur = 1;
  }

  var record = Math.max(maxStreak, current, db.weeklyStreakRecord || 0);

  // Persist
  db.weeklyStreak = current;
  if (record > (db.weeklyStreakRecord || 0)) db.weeklyStreakRecord = record;

  return { current: current, record: record };
}

function wpGetStreak() {
  function isoMonday(ts) {
    var d = new Date(ts);
    var diff = (d.getDay() === 0 ? -6 : 1 - d.getDay());
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }
  var thisWeek = isoMonday(Date.now());
  var prevWeek = (function() { var d = new Date(thisWeek); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();
  var hasThisWeek = (db.logs || []).some(function(l) {
    return isoMonday(l.timestamp || new Date(l.date).getTime()) === thisWeek;
  });

  if (!db.wpStreak) {
    var cws = typeof computeWeekStreak === 'function' ? computeWeekStreak() : { current: 0, record: 0 };
    var seed = Math.max(cws.current, cws.record, db.weeklyStreakRecord || 0);
    db.wpStreak = { count: seed, week: hasThisWeek ? thisWeek : prevWeek };
    saveDB();
    return seed;
  }

  if (db.wpStreak.week === thisWeek) return db.wpStreak.count;

  if (hasThisWeek) {
    if (db.wpStreak.week === prevWeek) {
      db.wpStreak = { count: db.wpStreak.count + 1, week: thisWeek };
    } else if (db.wpStreak.week < prevWeek) {
      var fresh = typeof computeWeekStreak === 'function' ? computeWeekStreak().current : 1;
      db.wpStreak = { count: fresh, week: thisWeek };
    } else {
      db.wpStreak = { count: db.wpStreak.count, week: thisWeek };
    }
    saveDB();
  }

  return db.wpStreak.count;
}

// ── Carte "Cette semaine" (nouvelle homepage) ────────────────
function renderWeekCard() {
  const el = document.getElementById('dashWeekContent');
  if (!el) return;

  const name = db.user.name || '';
  const now = new Date();
  const todayIdx = now.getDay(); // 0=dim
  const todayName = DAYS_FULL[todayIdx];
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Streak de semaines consécutives
  const weekStreak = computeWeekStreak();
  const streak = weekStreak.current;
  const streakRecord = weekStreak.record;

  // Score de forme (0-100) — même calcul que Profil > Corps
  let formScore = null;
  try {
    const fs = calcFormScore();
    if (fs && typeof fs.total === 'number') formScore = fs.total;
  } catch(e) {}
  const scoreColor = formScore === null ? 'var(--sub)' : formScore >= 70 ? 'var(--green)' : formScore >= 40 ? 'var(--orange)' : 'var(--red)';

  // Métriques semaine
  const logsWeek = getLogsInRange(7);
  const seancesCount = logsWeek.length;
  const totalDuration = logsWeek.reduce((s, l) => s + (l.duration || 0), 0);
  const totalVolume = logsWeek.reduce((s, l) => s + (l.volume || 0), 0);
  const durationStr = totalDuration > 0
    ? (totalDuration >= 3600 ? Math.floor(totalDuration/3600) + 'h' + (Math.floor((totalDuration%3600)/60) > 0 ? String(Math.floor((totalDuration%3600)/60)).padStart(2,'0') : '') : Math.floor(totalDuration/60) + 'min')
    : '—';
  const volumeStr = totalVolume > 0 ? (totalVolume >= 1000 ? Math.round(totalVolume/100)/10 + 't' : Math.round(totalVolume) + 'kg') : '—';

  // Programme du jour
  const routine = getRoutine();
  const todayLabel = routine[todayName] || '';
  const isRestDay = /repos|😴/i.test(todayLabel);

  // État de chaque jour (fait / repos / futur)
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const weekDaysFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  // Map timestamp → séance pour la semaine
  const weekStart = getWeekStart(Date.now());
  const seanceDays = new Set(
    db.logs
      .filter(l => l.timestamp >= weekStart)
      .map(l => new Date(l.timestamp).getDay()) // 0=dim
  );
  // Convertir en index Lun=0..Dim=6
  const toMonIdx = d => d === 0 ? 6 : d - 1;
  const todayMonIdx = toMonIdx(todayIdx);

  const daysHtml = weekDays.map((lbl, i) => {
    const fullDay = weekDaysFull[i];
    const jsDay = i === 6 ? 0 : i + 1; // Lun=1..Dim=0
    const isDone = seanceDays.has(jsDay);
    const isToday = i === todayMonIdx;
    const isRest = /repos|😴/i.test(routine[fullDay] || '');

    let cls, dotContent;
    if (isToday) {
      cls = 'background:rgba(10,132,255,0.1);border:0.5px solid rgba(10,132,255,0.4);';
      dotContent = '<div style="width:18px;height:18px;border-radius:50%;background:#0a84ff;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:#fff;">●</div>';
    } else if (isDone) {
      cls = 'background:rgba(50,215,75,0.08);border:0.5px solid rgba(50,215,75,0.3);';
      dotContent = '<div style="width:18px;height:18px;border-radius:50%;background:#32D74B;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#000;">✓</div>';
    } else {
      cls = 'background:var(--surface);border:0.5px solid var(--border);';
      dotContent = '<div style="width:18px;height:18px;border-radius:50%;background:var(--border);margin:0 auto;"></div>';
    }

    return '<div style="flex:1;border-radius:8px;padding:6px 2px;text-align:center;' + cls + '">' +
      '<div style="font-size:7px;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">' + lbl + '</div>' +
      dotContent +
      '</div>';
  }).join('');

  // Aujourd'hui card
  const todayHtml = !isRestDay && todayLabel
    ? '<div style="background:rgba(10,132,255,0.06);border:0.5px solid rgba(10,132,255,0.25);border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;overflow:hidden;">' +
        '<div style="width:32px;height:32px;background:rgba(10,132,255,0.15);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">🏋️</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:9px;color:rgba(10,132,255,0.6);text-transform:uppercase;letter-spacing:0.06em;">Aujourd\'hui</div>' +
          '<div style="font-size:12px;font-weight:700;margin-top:1px;">' + todayLabel + '</div>' +
        '</div>' +
        '<button class="btn" style="padding:8px 12px;font-size:11px;font-weight:700;border-radius:20px;white-space:nowrap;flex-shrink:0;max-width:96px;" onclick="showTab(\'tab-seances\');showSeancesSub(\'seances-go\');">GO 💪</button>' +
      '</div>'
    : '<div style="text-align:center;padding:8px;color:var(--sub);font-size:12px;">😴 Repos complet</div>';

  el.innerHTML =
    // Header : nom + date + pills
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">' +
      '<div>' +
        '<div style="font-size:16px;font-weight:800;">Salut ' + (name || 'Athlète') + ' 👋</div>' +
        '<div style="font-size:10px;color:var(--sub);margin-top:2px;">' + dateStr.charAt(0).toUpperCase() + dateStr.slice(1) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">' +
        (formScore !== null
          ? '<div style="display:flex;align-items:center;gap:5px;background:rgba(50,215,75,0.05);border:0.5px solid rgba(50,215,75,0.2);border-radius:20px;padding:4px 9px;">' +
              '<div style="width:6px;height:6px;border-radius:50%;background:' + scoreColor + ';flex-shrink:0;"></div>' +
              '<span style="font-size:9px;color:var(--sub);">Forme</span>' +
              '<span style="font-size:11px;font-weight:800;color:' + scoreColor + ';">' + formScore + '</span>' +
            '</div>'
          : '') +
      '</div>' +
    '</div>' +

    // Jours de la semaine
    '<div style="display:flex;gap:4px;margin-bottom:12px;">' + daysHtml + '</div>' +

    // Métriques
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">' +
      '<div style="background:var(--surface);border-radius:10px;padding:9px 6px;text-align:center;border:0.5px solid var(--border);">' +
        '<div style="font-size:17px;font-weight:800;color:var(--green);">' + seancesCount + '</div>' +
        '<div style="font-size:8px;color:var(--sub);margin-top:2px;text-transform:uppercase;">Séances</div>' +
      '</div>' +
      '<div style="background:var(--surface);border-radius:10px;padding:9px 6px;text-align:center;border:0.5px solid var(--border);">' +
        '<div style="font-size:17px;font-weight:800;color:var(--blue);">' + durationStr + '</div>' +
        '<div style="font-size:8px;color:var(--sub);margin-top:2px;text-transform:uppercase;">Durée</div>' +
      '</div>' +
      '<div style="background:var(--surface);border-radius:10px;padding:9px 6px;text-align:center;border:0.5px solid var(--border);">' +
        '<div style="font-size:17px;font-weight:800;color:var(--orange);">' + volumeStr + '</div>' +
        '<div style="font-size:8px;color:var(--sub);margin-top:2px;text-transform:uppercase;">Volume</div>' +
      '</div>' +
    '</div>' +

    // Streak semaines
    (streak > 0
      ? '<div style="display:flex;align-items:center;gap:6px;background:rgba(255,159,10,0.08);border:0.5px solid rgba(255,159,10,0.3);border-radius:12px;padding:6px 12px;margin-bottom:12px;">' +
          '<span style="font-size:16px;">🔥</span>' +
          '<div>' +
            '<div style="display:flex;align-items:baseline;gap:4px;">' +
              '<span style="font-size:18px;font-weight:900;color:#ff9f0a;">' + streak + '</span>' +
              '<span style="font-size:9px;color:rgba(255,159,10,0.6);">sem. consécutives</span>' +
            '</div>' +
            (streakRecord > streak
              ? '<div style="font-size:9px;color:#555;">Record : ' + streakRecord + ' sem.</div>'
              : '<div style="font-size:9px;color:#32d74b;">🏆 Record en cours !</div>') +
          '</div>' +
        '</div>'
      : '') +

    // Aujourd'hui + GO
    todayHtml;
}

function renderDash() {
  // Carte bienvenue
  const welcomeCard = document.getElementById('welcomeCard');
  if (welcomeCard) {
    const noData = !db.logs || db.logs.length === 0;
    welcomeCard.style.display = noData ? '' : 'none';
    if (noData && db.user.name) {
      const title = document.getElementById('welcomeTitle');
      if (title) title.textContent = 'Salut ' + db.user.name + ' ! Tout est prêt.';
    }
  }

  requestAnimationFrame(function() {
    renderWeekCard();
    renderPerfCard();
    if (typeof renderSBDRanksHome === 'function') renderSBDRanksHome();
  });
}

function renderSBDRanksHome() {
  var card = document.getElementById('sbdRanksCard');
  var host = document.getElementById('sbdRanksHome');
  if (!card || !host) return;
  if (typeof modeFeature === 'function' && modeFeature('showSBDCards') === false) {
    card.style.display = 'none'; return;
  }
  card.style.display = '';
  db.gamification = db.gamification || {};
  var lr = db.gamification.liftRanks;
  if (!lr || (!lr.squat && !lr.bench && !lr.deadlift)) {
    host.innerHTML = '<div style="font-size:12px;color:var(--sub);text-align:center;padding:8px 0;">Enregistre une séance SBD pour voir ton rang</div>';
    return;
  }
  var lifts = [
    { key:'squat',    icon:'🦵', label:'SQ' },
    { key:'bench',    icon:'🫸', label:'BP' },
    { key:'deadlift', icon:'💀', label:'DL' }
  ];
  var html = '';
  lifts.forEach(function(l) {
    var r = lr[l.key];
    if (!r) return;
    // Progression inside the current tier towards the next
    var idx = -1;
    for (var i = 0; i < SBD_TIERS.length; i++) { if (r.percentile >= SBD_TIERS[i].min) idx = i; }
    var nextMin = idx < SBD_TIERS.length - 1 ? SBD_TIERS[idx + 1].min : 100;
    var curMin = SBD_TIERS[idx] ? SBD_TIERS[idx].min : 0;
    var span = Math.max(1, nextMin - curMin);
    var pctInTier = Math.max(0, Math.min(100, Math.round((r.percentile - curMin) / span * 100)));
    html += '<div class="sbd-rank-row">' +
      '<span class="sbd-rank-icon">' + l.icon + '</span>' +
      '<span class="sbd-rank-name">' + l.label + '</span>' +
      '<span class="sbd-rank-val">' + r.e1rm + ' kg</span>' +
      '<div class="sbd-rank-bar-bg"><div class="sbd-rank-bar" style="width:' + pctInTier + '%;background:' + r.color + ';"></div></div>' +
      '<span class="sbd-rank-tier" style="color:' + r.color + ';">' + r.tier + '</span>' +
    '</div>';
  });
  if (!html) {
    host.innerHTML = '<div style="font-size:12px;color:var(--sub);text-align:center;padding:8px 0;">Enregistre une séance SBD pour voir ton rang</div>';
    return;
  }
  host.innerHTML = html;
}

// ============================================================
// Résumé hebdomadaire — nombre de séances, durée, volume
// ============================================================
function renderWeeklySummary() {
  var now = new Date();
  var dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Lundi = 0
  var weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  var weekStartTs = weekStart.getTime();
  var nowTs = now.getTime();

  var sessions = 0, totalDuration = 0, totalVolume = 0;
  (db.logs || []).forEach(function(log) {
    // Utiliser timestamp (fiable) au lieu de log.date (string FR non parsable)
    var ts = log.timestamp;
    if (!ts) return;
    if (ts >= weekStartTs && ts <= nowTs) {
      sessions++;
      // Duration est en secondes
      if (log.duration) totalDuration += log.duration;
      // Volume : utiliser log.volume (pré-calculé) ou recalculer
      if (log.volume) {
        totalVolume += log.volume;
      } else {
        (log.exercises || []).forEach(function(exo) {
          (exo.series || exo.allSets || []).forEach(function(s) {
            if (s.weight && s.reps) totalVolume += s.weight * s.reps;
          });
        });
      }
    }
  });

  var el;
  el = document.getElementById('weekSessions');
  if (el) el.textContent = sessions;

  // Duration : convertir secondes → affichage lisible
  el = document.getElementById('weekDuration');
  if (el) {
    var durMin = Math.round(totalDuration / 60);
    if (durMin >= 60) {
      var h = Math.floor(durMin / 60);
      var m = durMin % 60;
      el.textContent = h + 'h' + (m > 0 ? (m < 10 ? '0' : '') + m : '');
    } else {
      el.textContent = durMin + 'min';
    }
  }

  el = document.getElementById('weekVolume');
  if (el) el.textContent = totalVolume >= 1000 ? (totalVolume / 1000).toFixed(1) + 't' : Math.round(totalVolume) + 'kg';

  // Message si aucune séance
  var card = document.getElementById('weeklySummaryCard');
  if (card && sessions === 0) {
    var msgEl = card.querySelector('.weekly-empty-msg');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.className = 'weekly-empty-msg';
      msgEl.style.cssText = 'text-align:center;padding:8px 0;font-size:12px;color:var(--sub);';
      msgEl.textContent = 'Aucune séance cette semaine — c\'est le moment de s\'y mettre !';
      card.appendChild(msgEl);
    }
    msgEl.style.display = sessions === 0 ? '' : 'none';
  } else if (card) {
    var exist = card.querySelector('.weekly-empty-msg');
    if (exist) exist.style.display = 'none';
  }
}

// ============================================================
// Programme du jour — carte d'accueil
// ============================================================
function renderTodayProgram() {
  var el = document.getElementById('todayProgramContent');
  if (!el) return;
  var todayDay = DAYS_FULL[new Date().getDay()];
  var routine = getRoutine();
  var label = routine[todayDay] || '';
  var isRest = !label || /repos|😴/i.test(label);

  var h = '';
  if (isRest) {
    h += '<div style="text-align:center;padding:8px 0;">';
    h += '<div style="font-size:28px;margin-bottom:4px;">😴</div>';
    h += '<div style="font-size:15px;font-weight:600;color:var(--sub);">Jour de repos</div>';
    h += '</div>';
    // Changer le bouton
    var btn = document.getElementById('startTodayWorkoutBtn');
    if (btn) { btn.textContent = 'Séance libre 🏋️'; }
  } else {
    h += '<div style="font-size:16px;font-weight:700;color:var(--accent);margin-bottom:6px;">' + label + '</div>';
    // Afficher les exercices du jour
    var exos = (db.routineExos && db.routineExos[todayDay]) ? db.routineExos[todayDay] : [];
    if (!exos.length && db.generatedProgram) {
      var gp = db.generatedProgram.find(function(p) { return p.day === todayDay && !p.isRest; });
      if (gp && gp.exercises) exos = gp.exercises.map(function(e) { return e.name || e; });
    }
    if (exos.length > 0) {
      exos.forEach(function(name) {
        var exoName = typeof name === 'string' ? name : (name && name.name) || 'Exercice';
        h += '<div style="font-size:13px;color:var(--sub);padding:2px 0;">• ' + exoName + '</div>';
      });
    } else {
      h += '<div style="font-size:13px;color:var(--sub);">' + todayDay + '</div>';
    }
  }
  el.innerHTML = h;
}

// ============================================================
// Total SBD estimé — barres + progression
// ============================================================
function toggleSBDChart(mode) {
  sbdChartMode = mode;
  renderSBDTotal();
}

function renderSBDTotal() {
  var el = document.getElementById('sbdTotalDisplay');
  if (!el) return;
  var card = document.getElementById('sbdTotalCard');

  if (chartSBD) { try { chartSBD.destroy(); } catch(e) {} chartSBD = null; }
  chartSBDs.forEach(function(c) { try { c.destroy(); } catch(e) {} });
  chartSBDs = [];

  var realBench = db.bestPR.bench || 0;
  var realSquat = db.bestPR.squat || 0;
  var realDead  = db.bestPR.deadlift || 0;

  var estBench = 0, estSquat = 0, estDead = 0;
  db.logs.forEach(function(log) {
    (log.exercises || []).forEach(function(exo) {
      var type = getSBDType(exo.name);
      if (!type) return;
      var rm = exo.maxRM || 0;
      if (!rm && exo.repRecords) {
        Object.entries(exo.repRecords).forEach(function(kv) {
          var e = calcE1RM(kv[1], parseInt(kv[0]));
          if (e > rm) rm = Math.round(e);
        });
      }
      if (type === 'bench'    && rm > estBench) estBench = rm;
      if (type === 'squat'    && rm > estSquat) estSquat = rm;
      if (type === 'deadlift' && rm > estDead)  estDead  = rm;
    });
  });

  var tgt = db.user.targets || {};
  var tgtBench = tgt.bench || 0, tgtSquat = tgt.squat || 0, tgtDead = tgt.deadlift || 0;

  var toggleHtml =
    '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
    '<button onclick="toggleSBDChart(\'bars\')" class="period-btn' + (sbdChartMode === 'bars' ? ' active' : '') + '">📊 Barres</button>' +
    '<button onclick="toggleSBDChart(\'line\')" class="period-btn' + (sbdChartMode === 'line' ? ' active' : '') + '">📈 Progression</button>' +
    '</div>';

  if (sbdChartMode === 'bars') {
    if (!realBench && !realSquat && !realDead && !estBench && !estSquat && !estDead) {
      el.innerHTML = toggleHtml + '<div style="text-align:center;font-size:12px;color:var(--sub);padding:16px 0;">Importe des séances pour voir tes performances</div>';
      if (card) { var tl = card.querySelector('.sbd-total-line'); if (tl) tl.innerHTML = ''; }
      return;
    }
    var total = realBench + realSquat + realDead;
    if (card) {
      var totalEl = card.querySelector('.sbd-total-line');
      if (!totalEl) { totalEl = document.createElement('div'); totalEl.className = 'sbd-total-line'; totalEl.style.cssText = 'text-align:center;margin-top:10px;font-size:13px;color:var(--sub);'; card.appendChild(totalEl); }
      totalEl.innerHTML = total > 0 ? 'Total : <strong style="color:var(--text);font-size:18px;">' + total + 'kg</strong>' : '';
    }
    var sbdPairs = [
      { label: 'Bench',    real: realBench, est: estBench, tgt: tgtBench, color: '#0A84FF' },
      { label: 'Squat',    real: realSquat, est: estSquat, tgt: tgtSquat, color: '#FF453A' },
      { label: 'Deadlift', real: realDead,  est: estDead,  tgt: tgtDead,  color: '#FF9F0A' }
    ];
    var miniHtml = '<div style="display:flex;gap:6px;height:120px;overflow:hidden;">';
    sbdPairs.forEach(function(p) { miniHtml += '<div style="flex:1;min-width:0;position:relative;"><canvas id="chartSBD_' + p.label + '"></canvas></div>'; });
    miniHtml += '</div>';
    miniHtml += '<div style="display:flex;justify-content:center;gap:14px;margin-top:6px;">' +
      '<span style="font-size:10px;color:var(--sub);">&#9646; Réel</span>' +
      '<span style="font-size:10px;color:var(--sub);opacity:0.6;">&#9646; Estimé</span>' +
      '<span style="font-size:10px;color:var(--sub);opacity:0.3;">&#9646; Objectif</span></div>';
    el.innerHTML = toggleHtml + miniHtml;
    requestAnimationFrame(function() {
      sbdPairs.forEach(function(p) {
        var ctx = document.getElementById('chartSBD_' + p.label);
        if (!ctx) return;
        var vals = [p.real, p.est, p.tgt].filter(function(v) { return v > 0; });
        var maxVal = vals.length ? Math.max.apply(null, vals) : 100;
        var minVal = vals.length ? Math.min.apply(null, vals) : 0;
        chartSBDs.push(new Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['Réel', 'Est.', 'Obj.'],
            datasets: [{ label: p.label, data: [p.real || null, p.est || null, p.tgt || null],
              backgroundColor: [p.color, p.color + '66', p.color + '22'],
              borderColor: [p.color, p.color + '99', p.color + '55'],
              borderWidth: 1, borderRadius: 4 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: { display: true, text: p.label, color: p.color, font: { size: 11, weight: '600' }, align: 'center', padding: { top: 0, bottom: 2 } },
              tooltip: { callbacks: { label: function(c) { return (c.parsed.y || '—') + ' kg'; }, title: function() { return p.label; } } }
            },
            scales: {
              x: { display: false },
              y: { display: false, beginAtZero: false, min: Math.floor(minVal * 0.85), suggestedMax: Math.ceil(maxVal * 1.1) }
            }
          }
        }));
      });
    });

  } else {
    var sbdDef = [
      { type: 'bench',    label: 'Bench',    color: '#0A84FF' },
      { type: 'squat',    label: 'Squat',    color: '#FF453A' },
      { type: 'deadlift', label: 'Deadlift', color: '#FF9F0A' }
    ];
    var sortedLogs = db.logs.slice().sort(function(a, b) { return a.timestamp - b.timestamp; });
    var datasets = [];
    sbdDef.forEach(function(def) {
      var seen = {};
      sortedLogs.forEach(function(log) {
        (log.exercises || []).forEach(function(exo) {
          if (getSBDType(exo.name) !== def.type) return;
          var rm = exo.maxRM || 0;
          if (!rm && exo.repRecords) {
            Object.entries(exo.repRecords).forEach(function(kv) {
              var e = calcE1RM(kv[1], parseInt(kv[0]));
              if (e > rm) rm = Math.round(e);
            });
          }
          if (!(rm > 0)) return;
          var lbl = new Date(log.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
          if (!seen[lbl] || rm > seen[lbl].val) seen[lbl] = { ts: log.timestamp, val: Math.round(rm) };
        });
      });
      var pts = Object.values(seen).sort(function(a, b) { return a.ts - b.ts; }).slice(-20);
      if (pts.length < 2) return;
      datasets.push({
        label: def.label,
        _xlabels: pts.map(function(p) { return new Date(p.ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }),
        data: pts.map(function(p) { return p.val; }),
        borderColor: def.color, backgroundColor: def.color + '22',
        borderWidth: 2, pointRadius: 3, pointBackgroundColor: def.color,
        fill: false, tension: 0.35
      });
    });
    if (!datasets.length) {
      el.innerHTML = toggleHtml + '<div style="text-align:center;font-size:12px;color:var(--sub);padding:16px 0;">Importe des séances pour voir ta progression</div>';
      if (card) { var tl2 = card.querySelector('.sbd-total-line'); if (tl2) tl2.innerHTML = ''; }
      return;
    }
    el.innerHTML = toggleHtml + '<div style="position:relative;height:180px;"><canvas id="chartSBDCanvas"></canvas></div>';
    if (card) { var tl3 = card.querySelector('.sbd-total-line'); if (tl3) tl3.innerHTML = ''; }
    requestAnimationFrame(function() {
      var ctx = document.getElementById('chartSBDCanvas');
      if (!ctx) return;
      var longestLabels = datasets.reduce(function(a, b) { return a._xlabels.length >= b._xlabels.length ? a : b; })._xlabels;
      chartSBD = new Chart(ctx, {
        type: 'line',
        data: {
          labels: longestLabels,
          datasets: datasets.map(function(ds) {
            return { label: ds.label, data: ds.data, borderColor: ds.borderColor,
              backgroundColor: ds.backgroundColor, borderWidth: ds.borderWidth,
              pointRadius: ds.pointRadius, pointBackgroundColor: ds.pointBackgroundColor,
              fill: ds.fill, tension: ds.tension };
          })
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#86868B', font: { size: 10 }, boxWidth: 10 } },
            tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y + ' kg'; } } }
          },
          scales: {
            x: { ticks: { color: '#86868B', font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: '#86868B', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: false }
          }
        }
      });
    });
  }
}

// ============================================================
// PRs récents — 3 derniers records
// ============================================================
function renderRecentPRs() {
  var el = document.getElementById('recentPRsContent');
  if (!el) return;
  // Chercher les PRs les plus récents dans les logs
  var prs = [];
  for (var i = db.logs.length - 1; i >= 0 && prs.length < 5; i--) {
    var log = db.logs[i];
    (log.exercises || []).forEach(function(exo) {
      if (exo.maxRM > 0 && prs.length < 3) {
        // Vérifier si c'est vraiment un PR (meilleur de l'historique pour cet exo)
        var isBest = true;
        for (var j = 0; j < db.logs.length; j++) {
          if (j === i) continue;
          var otherLog = db.logs[j];
          (otherLog.exercises || []).forEach(function(otherExo) {
            if (otherExo.name === exo.name && otherExo.maxRM >= exo.maxRM && otherLog.timestamp < log.timestamp) {
              isBest = false;
            }
          });
        }
        if (isBest && !prs.some(function(p) { return p.name === exo.name; })) {
          prs.push({ name: exo.name, value: Math.round(exo.maxRM), date: log.shortDate || log.date });
        }
      }
    });
  }
  if (prs.length === 0) {
    el.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--sub);padding:8px 0;">Aucun PR enregistré pour le moment</div>';
    return;
  }
  var h = '';
  prs.forEach(function(pr) {
    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">';
    h += '<div style="font-size:13px;font-weight:600;color:var(--text);">' + pr.name + '</div>';
    h += '<div style="text-align:right;"><span style="font-size:15px;font-weight:700;color:var(--accent);">' + pr.value + 'kg</span>';
    h += '<span style="font-size:10px;color:var(--sub);margin-left:6px;">' + pr.date + '</span></div>';
    h += '</div>';
  });
  el.innerHTML = h;
}

// ============================================================
// Heatmap muscles 2D — vue avant/arrière (gardé pour usage pendant séance)
// ============================================================
function renderMuscleHeatmap2D() {
  var container = document.getElementById('muscleHeatmap2D');
  if (!container) return;

  // Calculer les séries par muscle cette semaine
  var now = new Date();
  var dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
  var weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);

  var muscleSets = {};
  (db.logs || []).forEach(function(log) {
    var d = new Date(log.date);
    if (d >= weekStart && d <= now) {
      (log.exercises || []).forEach(function(exo) {
        var setsCount = (exo.sets || []).length;
        // Chercher l'exercice dans la base pour obtenir les muscles
        var exoData = null;
        if (typeof EXO_DATABASE !== 'undefined') {
          for (var key in EXO_DATABASE) {
            var e = EXO_DATABASE[key];
            if (e.name === exo.name || (e.nameAlt && e.nameAlt.indexOf(exo.name) >= 0)) {
              exoData = e;
              break;
            }
          }
        }
        if (exoData) {
          (exoData.primaryMuscles || []).forEach(function(m) {
            var mNorm = _normalizeMuscle(m);
            muscleSets[mNorm] = (muscleSets[mNorm] || 0) + setsCount;
          });
          (exoData.secondaryMuscles || []).forEach(function(m) {
            var mNorm = _normalizeMuscle(m);
            muscleSets[mNorm] = (muscleSets[mNorm] || 0) + Math.ceil(setsCount * 0.5);
          });
        }
      });
    }
  });

  var maxSets = 0;
  for (var k in muscleSets) if (muscleSets[k] > maxSets) maxSets = muscleSets[k];
  if (maxSets === 0) maxSets = 1;

  // Mapper les muscles normalisés aux parties du corps SVG
  var muscleMapping = {
    front: {
      'pecs': { path: 'M55,60 Q75,55 95,60 L95,80 Q75,85 55,80 Z', label: 'Pecs' },
      'epaules': { path: 'M45,50 Q50,45 55,50 L55,65 Q50,65 45,60 Z M95,50 Q100,45 105,50 L105,65 Q100,65 95,60 Z', label: 'Épaules' },
      'biceps': { path: 'M40,65 Q42,60 45,65 L45,90 Q42,95 40,90 Z M105,65 Q108,60 110,65 L110,90 Q108,95 105,90 Z', label: 'Biceps' },
      'abdos': { path: 'M60,82 Q75,80 90,82 L90,115 Q75,118 60,115 Z', label: 'Abdos' },
      'quadriceps': { path: 'M55,120 Q65,118 75,120 L72,160 Q63,162 55,160 Z M75,120 Q85,118 95,120 L95,160 Q87,162 78,160 Z', label: 'Quadriceps' },
    },
    back: {
      'dos': { path: 'M55,55 Q75,50 95,55 L95,85 Q75,90 55,85 Z', label: 'Dos' },
      'trapezes': { path: 'M60,40 Q75,38 90,40 L88,55 Q75,52 62,55 Z', label: 'Trapèzes' },
      'triceps': { path: 'M40,65 Q42,60 45,65 L45,90 Q42,95 40,90 Z M105,65 Q108,60 110,65 L110,90 Q108,95 105,90 Z', label: 'Triceps' },
      'lombaires': { path: 'M62,87 Q75,85 88,87 L88,105 Q75,108 62,105 Z', label: 'Lombaires' },
      'fessiers': { path: 'M55,108 Q75,105 95,108 L95,125 Q75,128 55,125 Z', label: 'Fessiers' },
      'ischiojambiers': { path: 'M55,128 Q65,125 75,128 L72,165 Q63,167 55,165 Z M75,128 Q85,125 95,128 L95,165 Q87,167 78,165 Z', label: 'Ischio' },
      'mollets': { path: 'M58,168 Q65,165 72,168 L70,190 Q65,192 60,190 Z M78,168 Q85,165 92,168 L90,190 Q85,192 80,190 Z', label: 'Mollets' },
    }
  };

  function getColor(intensity) {
    if (intensity <= 0) return 'rgba(255,255,255,0.04)';
    if (intensity < 0.25) return 'rgba(59,130,246,0.2)';
    if (intensity < 0.5) return 'rgba(59,130,246,0.4)';
    if (intensity < 0.75) return 'rgba(59,130,246,0.65)';
    return 'rgba(59,130,246,0.9)';
  }

  function renderSide(side, muscles) {
    var paths = '';
    for (var muscleKey in muscles) {
      var m = muscles[muscleKey];
      var intensity = (muscleSets[muscleKey] || 0) / maxSets;
      var color = getColor(intensity);
      var setsNum = muscleSets[muscleKey] || 0;
      paths += '<path d="' + m.path + '" fill="' + color + '" stroke="rgba(255,255,255,0.1)" stroke-width="0.5">' +
               '<title>' + m.label + ': ' + setsNum + ' séries</title></path>';
    }
    // Silhouette
    var silhouette = '<path d="M75,8 Q80,8 82,12 Q84,16 82,20 Q80,24 78,26 L80,28 Q88,30 92,35 L105,45 Q110,48 108,55 L110,60 Q112,65 110,70 L112,85 Q112,95 110,95 L105,95 Q102,95 105,65 L95,50 Q90,45 90,55 L95,120 Q98,125 95,130 L95,165 Q96,170 95,175 L95,190 Q95,198 90,200 L82,200 Q78,198 78,195 L78,170 Q78,165 75,163 Q72,165 72,170 L72,195 Q72,198 68,200 L60,200 Q55,198 55,190 L55,175 Q54,170 55,165 L55,130 Q52,125 55,120 L60,55 Q60,45 55,50 L45,65 Q48,95 45,95 L40,95 Q38,95 38,85 L40,70 Q38,65 40,60 L42,55 Q40,48 45,45 L58,35 Q62,30 70,28 L72,26 Q70,24 68,20 Q66,16 68,12 Q70,8 75,8 Z" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
    return '<div style="text-align:center;"><div style="font-size:10px;color:var(--sub);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">' + side + '</div>' +
           '<svg viewBox="30 0 90 210" width="130" height="220" style="overflow:visible;">' + silhouette + paths + '</svg></div>';
  }

  container.innerHTML = renderSide('Avant', muscleMapping.front) + renderSide('Arrière', muscleMapping.back);

  // Légende sous la heatmap
  var legendHtml = '<div style="display:flex;justify-content:center;gap:12px;margin-top:8px;font-size:10px;color:var(--sub);">';
  legendHtml += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;background:rgba(59,130,246,0.2);"></span> Peu</span>';
  legendHtml += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;background:rgba(59,130,246,0.5);"></span> Moyen</span>';
  legendHtml += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:3px;background:rgba(59,130,246,0.9);"></span> Beaucoup</span>';
  legendHtml += '</div>';
  container.innerHTML += legendHtml;
}

function _normalizeMuscle(name) {
  var n = (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.indexOf('pec') >= 0 || n.indexOf('chest') >= 0) return 'pecs';
  if (n.indexOf('epaule') >= 0 || n.indexOf('deltoid') >= 0 || n.indexOf('shoulder') >= 0) return 'epaules';
  if (n.indexOf('bicep') >= 0) return 'biceps';
  if (n.indexOf('tricep') >= 0) return 'triceps';
  if (n.indexOf('abdo') >= 0 || n.indexOf('core') >= 0) return 'abdos';
  if (n.indexOf('quad') >= 0) return 'quadriceps';
  if (n.indexOf('ischio') >= 0 || n.indexOf('hamstring') >= 0) return 'ischiojambiers';
  if (n.indexOf('fessier') >= 0 || n.indexOf('glute') >= 0) return 'fessiers';
  if (n.indexOf('mollet') >= 0 || n.indexOf('calf') >= 0 || n.indexOf('calves') >= 0) return 'mollets';
  if (n.indexOf('dorsal') >= 0 || n.indexOf('dos') >= 0 || n.indexOf('lat') >= 0 || n.indexOf('back') >= 0) return 'dos';
  if (n.indexOf('trapez') >= 0 || n.indexOf('haut du dos') >= 0) return 'trapezes';
  if (n.indexOf('lombaire') >= 0 || n.indexOf('lower back') >= 0) return 'lombaires';
  if (n.indexOf('avant-bras') >= 0 || n.indexOf('forearm') >= 0) return 'biceps'; // regroupé
  return n;
}

// ============================================================
// Lancer la séance du jour
// ============================================================
function startTodayWorkout() {
  showTab('tab-seances');
  // Aller directement au sous-onglet GO
  var goBtn = document.querySelector('.stats-sub-pill[onclick*="seances-go"]') ||
              document.querySelectorAll('#tab-seances .stats-sub-nav .stats-sub-pill')[1];
  if (typeof showSeancesSub === 'function') showSeancesSub('seances-go', goBtn);
}

function renderReadinessSparkline() {
  const el = document.getElementById('readinessSparkline');
  if (!el) return;
  const cutoff = Date.now() - 14 * 86400000;
  const recent = (db.readiness || []).filter(r => new Date(r.date).getTime() >= cutoff).sort((a,b) => a.date.localeCompare(b.date));
  if (recent.length < 2) { el.innerHTML = '<div style="font-size:11px;color:var(--sub);text-align:center;padding:8px;">Pas encore de données readiness</div>'; return; }
  const vals = recent.map(r => r.score);
  const W = 280, H = 60, pad = 6;
  const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1;
  const pts = vals.map((v, i) => ({
    x: pad + (i / (vals.length - 1)) * (W - pad * 2),
    y: pad + (1 - (v - minV) / range) * (H - pad * 2)
  }));
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  const lastScore = vals[vals.length - 1];
  const color = lastScore >= 75 ? 'var(--green)' : lastScore >= 40 ? 'var(--orange)' : 'var(--red)';
  // Moyenne et tendance
  const avg = Math.round(vals.reduce((s,v) => s+v, 0) / vals.length);
  const trend = vals.length >= 3 ? vals[vals.length-1] - vals[0] : 0;
  const trendArrow = trend > 10 ? '↗' : trend < -10 ? '↘' : '→';
  const trendColor = trend > 10 ? 'var(--green)' : trend < -10 ? 'var(--red)' : 'var(--sub)';
  // Dernier détail
  const lastR = recent[recent.length - 1];
  const detailParts = [];
  if (lastR.sleep) detailParts.push('😴 ' + lastR.sleep + '/10');
  if (lastR.energy) detailParts.push('⚡ ' + lastR.energy + '/10');
  if (lastR.motivation) detailParts.push('🧠 ' + lastR.motivation + '/10');

  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
    '<span style="font-size:11px;font-weight:700;color:var(--sub);">READINESS</span>' +
    '<span style="font-size:11px;color:var(--sub);">Moy: ' + avg + '% <span style="color:' + trendColor + ';">' + trendArrow + '</span></span></div>' +
    '<div style="display:flex;align-items:center;gap:8px;">' +
    '<span style="font-size:20px;font-weight:800;color:' + color + ';">' + lastScore + '</span>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:60px;flex:1;">' +
    '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="3" fill="' + color + '"/>' +
    '</svg></div>' +
    (detailParts.length ? '<div style="font-size:10px;color:var(--sub);margin-top:2px;">' + detailParts.join(' · ') + '</div>' : '');
}

// ── Heatmap de récupération musculaire ──────────────────────
function renderMuscleHeatmap() {
  const el = document.getElementById('muscleHeatmapContent');
  if (!el) return;
  const fatigue = computeMuscleFatigue(db.logs || []);
  const vol = computeWeeklyVolume(db.logs, 1);

  function fColor(level) {
    if (level < 30) return '#32D74B';
    if (level < 60) return '#FFD60A';
    if (level < 85) return '#FF9F0A';
    return '#FF453A';
  }
  // Simplified body SVG (front view) with muscle zones
  const muscles = [
    { key:'shoulders', label:'Épaules',   cx:62,  cy:68,  rx:14, ry:10 },
    { key:'shoulders', label:'Épaules',   cx:138, cy:68,  rx:14, ry:10 },
    { key:'chest',     label:'Pecs',      cx:100, cy:85,  rx:22, ry:14 },
    { key:'biceps',    label:'Biceps',    cx:52,  cy:105, rx:8,  ry:16 },
    { key:'triceps',   label:'Triceps',   cx:148, cy:105, rx:8,  ry:16 },
    { key:'abs',       label:'Abdos',     cx:100, cy:120, rx:16, ry:18 },
    { key:'forearms',  label:'Avant-bras',cx:44,  cy:140, rx:6,  ry:14 },
    { key:'forearms',  label:'Avant-bras',cx:156, cy:140, rx:6,  ry:14 },
    { key:'quads',     label:'Quads',     cx:85,  cy:170, rx:12, ry:22 },
    { key:'quads',     label:'Quads',     cx:115, cy:170, rx:12, ry:22 },
    { key:'hamstrings',label:'Ischio',    cx:85,  cy:175, rx:8,  ry:12 },
    { key:'hamstrings',label:'Ischio',    cx:115, cy:175, rx:8,  ry:12 },
    { key:'calves',    label:'Mollets',   cx:85,  cy:210, rx:8,  ry:14 },
    { key:'calves',    label:'Mollets',   cx:115, cy:210, rx:8,  ry:14 },
    { key:'traps',     label:'Trapèzes',  cx:100, cy:55,  rx:18, ry:8  },
    { key:'back',      label:'Dos',       cx:100, cy:100, rx:18, ry:16 },
    { key:'glutes',    label:'Fessiers',  cx:100, cy:148, rx:16, ry:10 },
  ];

  const seen = new Set();
  let svgParts = '';
  const tooltipData = [];
  muscles.forEach((m, i) => {
    const f = fatigue[m.key] || 0;
    const color = fColor(f);
    const opacity = 0.4 + (f / 100) * 0.5;
    svgParts += `<ellipse cx="${m.cx}" cy="${m.cy}" rx="${m.rx}" ry="${m.ry}" fill="${color}" opacity="${opacity}" style="cursor:pointer;" onclick="showMuscleFatigueTooltip('${m.key}')"/>`;
    if (!seen.has(m.key)) {
      seen.add(m.key);
      const lm = VOLUME_LANDMARKS[m.key];
      const sets = Math.round((vol[m.key] || 0) * 10) / 10;
      tooltipData.push({ key: m.key, label: m.label, fatigue: f, sets, mav: lm ? lm.MAV : '—' });
    }
  });

  // Outline body shape
  const bodyOutline = '<path d="M100,20 C85,20 78,30 78,45 L72,60 60,65 45,90 40,130 48,155 55,150 58,120 65,105 70,85 80,65 85,150 80,180 78,220 82,240 92,240 95,205 100,195 105,205 108,240 118,240 122,220 120,180 115,150 120,65 130,85 135,105 142,120 145,150 152,155 160,130 155,90 140,65 128,60 122,45 C122,30 115,20 100,20Z" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>';

  const svg = '<svg viewBox="30 10 140 240" style="width:180px;height:280px;display:block;margin:0 auto;">' + bodyOutline + svgParts + '</svg>';

  // Legend bars below
  let legendHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px;">';
  tooltipData.forEach(d => {
    const color = fColor(d.fatigue);
    legendHtml += '<div style="display:flex;align-items:center;gap:6px;font-size:10px;padding:4px 6px;background:rgba(255,255,255,0.03);border-radius:6px;cursor:pointer;" onclick="showMuscleFatigueTooltip(\'' + d.key + '\')">' +
      '<div style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0;"></div>' +
      '<span style="color:var(--text);font-weight:600;">' + d.label + '</span>' +
      '<span style="color:var(--sub);margin-left:auto;">' + d.fatigue + '%</span></div>';
  });
  legendHtml += '</div>';

  // Color legend
  const colorLegend = '<div style="display:flex;gap:8px;justify-content:center;margin-top:10px;font-size:9px;color:var(--sub);">' +
    '<span><span style="color:#32D74B;">●</span> Frais</span>' +
    '<span><span style="color:#FFD60A;">●</span> Récup</span>' +
    '<span><span style="color:#FF9F0A;">●</span> Fatigué</span>' +
    '<span><span style="color:#FF453A;">●</span> Surent.</span></div>';

  el.innerHTML = svg + colorLegend + legendHtml + '<div id="muscleFatigueTooltip" style="display:none;margin-top:8px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:11px;"></div>';
}

function showMuscleFatigueTooltip(key) {
  const el = document.getElementById('muscleFatigueTooltip');
  if (!el) return;
  const fatigue = computeMuscleFatigue(db.logs || []);
  const vol = computeWeeklyVolume(db.logs, 1);
  const lm = VOLUME_LANDMARKS[key] || {};
  const LABELS_FR = { chest:'Pecs', back:'Dos', shoulders:'Épaules', quads:'Quads', hamstrings:'Ischio', glutes:'Fessiers', biceps:'Biceps', triceps:'Triceps', calves:'Mollets', abs:'Abdos', traps:'Trapèzes', forearms:'Avant-bras' };
  const f = fatigue[key] || 0;
  const sets = Math.round((vol[key] || 0) * 10) / 10;
  // Find last session with this muscle
  let lastSession = '—';
  for (let i = db.logs.length - 1; i >= 0; i--) {
    const log = db.logs[i];
    const found = log.exercises.some(exo => {
      const contribs = getMuscleContributions(exo.name);
      return contribs.some(c => (MUSCLE_TO_VL_KEY[c.muscle] || c.muscle.toLowerCase()) === key);
    });
    if (found) {
      const d = new Date(log.timestamp);
      const diff = Math.round((Date.now() - d.getTime()) / 86400000);
      lastSession = diff === 0 ? "aujourd'hui" : diff === 1 ? 'hier' : 'il y a ' + diff + 'j';
      break;
    }
  }
  el.style.display = 'block';
  el.innerHTML = '<div style="font-weight:700;color:var(--text);margin-bottom:4px;">' + (LABELS_FR[key] || key) + '</div>' +
    '<div>Fatigue : <strong>' + f + '%</strong> ' + renderGlossaryTip('fatigue_index') + '</div>' +
    '<div>Dernière séance : ' + lastSession + '</div>' +
    '<div>' + sets + ' sets cette semaine (MAV: ' + (lm.MAV || '—') + ') ' + renderGlossaryTip('mav') + '</div>';
}

// ── Score de forme composite (Dashboard) ────────────────────
function computeFormScoreComposite() {
  const components = {};
  // 1. Readiness moyenne 7j (20%)
  const recent = (db.readiness || []).filter(r => (Date.now() - new Date(r.date).getTime()) < 7 * 86400000);
  components.readiness = recent.length > 0 ? recent.reduce((s, r) => s + r.score, 0) / recent.length : 50;
  // 2. Compliance 7j (25%)
  const routine = getRoutine();
  const planned = Math.max(1, Object.values(routine).filter(v => v && !/repos|😴/i.test(v)).length);
  const logsWeek = (db.logs || []).filter(l => (Date.now() - (l.timestamp || 0)) < 7 * 86400000).length;
  components.compliance = Math.min(100, (logsWeek / planned) * 100);
  // 3. Tendance force (20%)
  const mainLifts = ['squat', 'bench', 'deadlift'];
  let trendScore = 0, trendCount = 0;
  mainLifts.forEach(name => {
    const pts = [];
    const desc = [...db.logs].sort((a,b) => b.timestamp - a.timestamp);
    for (const log of desc) {
      const exo = log.exercises.find(e => getSBDType(e.name) === name && e.maxRM > 0);
      if (exo) { pts.push(exo.maxRM); if (pts.length >= 4) break; }
    }
    if (pts.length >= 2) {
      trendCount++;
      trendScore += pts[0] >= pts[pts.length - 1] ? 1 : -1;
    }
  });
  components.trend = trendCount > 0 ? 50 + (trendScore / trendCount) * 25 : 50;
  // 4. Fatigue inverse (15%)
  const fatigue = computeMuscleFatigue(db.logs || []);
  const fatVals = Object.values(fatigue);
  const avgFat = fatVals.length > 0 ? fatVals.reduce((s,v) => s+v, 0) / fatVals.length : 50;
  components.recovery = 100 - avgFat;
  // 5. Nutrition (10%)
  const nutriDays = (db.body || []).filter(e => (Date.now() - (e.ts||0)) < 7 * 86400000 && (e.kcal > 0 || e.prot > 0));
  components.nutrition = nutriDays.length > 0 ? Math.min(100, (nutriDays.length / 7) * 100) : 30;
  // 6. Sommeil (10%)
  components.sleep = recent.length > 0 ? (recent.reduce((s, r) => s + r.sleep, 0) / recent.length) * 20 : 50;
  // Final
  const score = Math.round(
    components.readiness * 0.20 + components.compliance * 0.25 +
    components.trend * 0.20 + components.recovery * 0.15 +
    components.nutrition * 0.10 + components.sleep * 0.10
  );
  return { score: Math.max(0, Math.min(100, score)), components };
}

function renderFormScoreDash() {
  const el = document.getElementById('formScoreContent');
  if (!el) return;
  const { score, components } = computeFormScoreComposite();
  const color = score < 40 ? 'var(--red)' : score < 60 ? 'var(--orange)' : score < 75 ? '#FFD60A' : 'var(--green)';
  const COMP_LABELS = { readiness:'Readiness', compliance:'Assiduité', trend:'Force', recovery:'Récupération', nutrition:'Nutrition', sleep:'Sommeil' };
  const COMP_WEIGHTS = { readiness:'20%', compliance:'25%', trend:'20%', recovery:'15%', nutrition:'10%', sleep:'10%' };
  const barsHtml = Object.entries(components).map(([k,v]) =>
    '<div style="display:flex;align-items:center;gap:6px;font-size:10px;">' +
    '<span style="width:70px;color:var(--sub);">' + (COMP_LABELS[k]||k) + '</span>' +
    '<div style="flex:1;height:4px;background:var(--border);border-radius:2px;">' +
    '<div style="height:4px;width:' + Math.round(v) + '%;background:' + color + ';border-radius:2px;"></div></div>' +
    '<span style="width:24px;text-align:right;font-weight:600;">' + Math.round(v) + '</span></div>'
  ).join('');
  // Detailed breakdown (expandable)
  const breakdownHtml = Object.entries(components).map(([k,v]) => {
    const w = COMP_WEIGHTS[k] || '?';
    const wNum = parseFloat(w) / 100;
    return '<div class="breakdown-line">' +
      '<span class="bl-label">' + (COMP_LABELS[k]||k) + '</span>' +
      '<span class="bl-value">' + Math.round(v) + '/100</span>' +
      '<span class="bl-weight">× ' + w + '</span>' +
      '<span class="bl-contribution">= ' + (v * wNum).toFixed(1) + '</span></div>';
  }).join('');
  el.innerHTML = '<div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;">' +
    '<div style="width:56px;height:56px;border-radius:50%;border:3px solid ' + color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
    '<span style="font-size:22px;font-weight:800;color:' + color + ';">' + score + '</span></div>' +
    '<div><div style="font-size:11px;font-weight:700;color:var(--sub);text-transform:uppercase;">Score de forme ' + renderGlossaryTip('form_score') + '</div>' +
    '<div style="font-size:13px;color:var(--text);margin-top:2px;">' +
    (score >= 75 ? 'Excellente forme !' : score >= 60 ? 'En bonne voie' : score >= 40 ? 'Peut mieux faire' : 'Attention fatigue') +
    '</div></div></div>' +
    '<div style="display:flex;flex-direction:column;gap:4px;">' + barsHtml + '</div>' +
    '<div class="breakdown-toggle" onclick="var d=this.nextElementSibling;d.style.display=d.style.display===\'none\'?\'block\':\'none\';this.textContent=d.style.display===\'none\'?\'📐 Voir le détail du calcul\':\'📐 Masquer le détail\';">📐 Voir le détail du calcul</div>' +
    '<div class="breakdown" style="display:none;">' + breakdownHtml +
    '<div class="breakdown-total">Total : ' + score + '/100</div></div>';
}

// ── Prédiction de PR ────────────────────────────────────────
function predictPR(exerciseName, targetWeight) {
  // Use inline trend calculation (same as renderPerfCard's logic)
  const pts = [];
  const desc = [...db.logs].sort((a,b) => b.timestamp - a.timestamp);
  for (const log of desc) {
    const exo = log.exercises.find(e => e.name === exerciseName || matchExoName(e.name, exerciseName));
    if (!exo || !exo.maxRM || exo.maxRM <= 0) continue;
    pts.push({ x: log.timestamp / 86400000, y: exo.maxRM });
    if (pts.length >= 6) break;
  }
  if (pts.length < 2) return { reachable: false, reason: 'Pas assez de données' };
  pts.sort((a,b) => a.x - b.x);
  const n = pts.length;
  const sumX = pts.reduce((s,p) => s+p.x, 0), sumY = pts.reduce((s,p) => s+p.y, 0);
  const sumXY = pts.reduce((s,p) => s+p.x*p.y, 0), sumX2 = pts.reduce((s,p) => s+p.x*p.x, 0);
  const denom = n*sumX2 - sumX*sumX;
  const slope = denom !== 0 ? (n*sumXY - sumX*sumY) / denom : 0;
  const kgPerWeek = slope * 7;

  // R² calculation
  const meanY = sumY / n;
  const ssTot = pts.reduce((s,p) => s + Math.pow(p.y - meanY, 2), 0);
  const ssRes = pts.reduce((s,p) => { const pred = (slope * p.x) + ((sumY - slope * sumX) / n); return s + Math.pow(p.y - pred, 2); }, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const currentE1RM = pts[pts.length - 1].y;
  if (kgPerWeek <= 0) return { reachable: false, reason: 'Pas de progression détectée' };
  if (currentE1RM >= targetWeight) return { reachable: true, reason: 'Objectif déjà atteint !', weeks: 0 };
  const gap = targetWeight - currentE1RM;
  const weeks = Math.ceil(gap / kgPerWeek);
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + weeks * 7);
  return {
    reachable: true, weeks, date: targetDate.toLocaleDateString('fr-FR'),
    confidence: Math.round(r2 * 100), weeklyGain: kgPerWeek.toFixed(2),
    currentE1RM: Math.round(currentE1RM), gap: Math.round(gap), dataPoints: n
  };
}

// ── DOTS / Wilks dans le Dashboard ──────────────────────────
function renderDotsWilks() {
  const card = document.getElementById('dotsWilksCard');
  const el = document.getElementById('dotsWilksContent');
  if (!card || !el) return;
  const bw = db.user.bw;
  if (!bw || bw <= 0) { card.style.display = 'none'; return; }
  // Get best e1RM for SBD
  let squat = 0, bench = 0, deadlift = 0;
  db.logs.forEach(log => {
    log.exercises.forEach(exo => {
      const type = getSBDType(exo.name);
      if (type === 'squat' && (exo.maxRM||0) > squat) squat = exo.maxRM;
      if (type === 'bench' && (exo.maxRM||0) > bench) bench = exo.maxRM;
      if (type === 'deadlift' && (exo.maxRM||0) > deadlift) deadlift = exo.maxRM;
    });
  });
  if (!squat || !bench || !deadlift) { card.style.display = 'none'; return; }
  card.style.display = shouldShow('dots_wilks') ? '' : 'none';
  if (!shouldShow('dots_wilks')) return;
  const total = squat + bench + deadlift;
  const gender = db.user.gender === 'F' ? 'F' : 'M';
  const dots = computeDOTS(total, bw, gender);
  const wilks = computeWilks(total, bw, gender);
  const cat = dots < 250 ? 'Débutant' : dots < 350 ? 'Intermédiaire' : dots < 450 ? 'Avancé' : dots < 550 ? 'Élite' : '🏆 Élite+';
  var dotsBreakdown = '<div class="breakdown" style="display:none;margin-top:8px;">' +
    '<div class="breakdown-line"><span class="bl-label">Squat (e1RM)</span><span class="bl-value">' + squat + 'kg</span></div>' +
    '<div class="breakdown-line"><span class="bl-label">Bench (e1RM)</span><span class="bl-value">' + bench + 'kg</span></div>' +
    '<div class="breakdown-line"><span class="bl-label">Deadlift (e1RM)</span><span class="bl-value">' + deadlift + 'kg</span></div>' +
    '<div class="breakdown-line"><span class="bl-label">Total</span><span class="bl-value" style="font-weight:700;">' + total + 'kg</span></div>' +
    '<div class="breakdown-line"><span class="bl-label">Poids de corps</span><span class="bl-value">' + bw + 'kg</span></div>' +
    '<div class="breakdown-line"><span class="bl-label">Genre</span><span class="bl-value">' + (gender === 'F' ? 'Femme' : 'Homme') + '</span></div>' +
    '<div class="breakdown-total">DOTS = ' + dots + ' · Wilks = ' + wilks + '</div></div>';
  el.innerHTML = '<div style="font-size:11px;font-weight:700;color:var(--sub);margin-bottom:8px;">TOTAL ESTIMÉ</div>' +
    '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px;">' +
    '<span style="font-size:28px;font-weight:800;color:var(--text);">' + total + '<span style="font-size:14px;color:var(--sub);font-weight:500;">kg</span></span>' +
    '<span style="font-size:12px;color:var(--sub);">S' + squat + ' / B' + bench + ' / D' + deadlift + '</span></div>' +
    '<div style="display:flex;gap:16px;margin-top:8px;">' +
    '<div><div style="font-size:10px;color:var(--sub);text-transform:uppercase;">DOTS ' + renderGlossaryTip('dots') + '</div><div style="font-size:20px;font-weight:800;color:var(--blue);">' + dots + '</div></div>' +
    '<div><div style="font-size:10px;color:var(--sub);text-transform:uppercase;">Wilks ' + renderGlossaryTip('wilks') + '</div><div style="font-size:20px;font-weight:800;color:var(--green);">' + wilks + '</div></div>' +
    '<div><div style="font-size:10px;color:var(--sub);text-transform:uppercase;">Catégorie</div><div style="font-size:14px;font-weight:700;color:var(--orange);margin-top:4px;">' + cat + '</div></div>' +
    '</div>' +
    '<div class="breakdown-toggle" onclick="var d=this.nextElementSibling;d.style.display=d.style.display===\'none\'?\'block\':\'none\';this.textContent=d.style.display===\'none\'?\'📐 Voir le détail\':\'📐 Masquer le détail\';">📐 Voir le détail</div>' +
    dotsBreakdown;
}

// ── Rubrique Performance configurable ────────────────────────
function setPerfMode(mode) { perfChartMode = mode; renderPerfCard(); }
function selectPerfLift(name) {
  perfSelectedLift = name;
  if (perfChartMode !== 'curve') {
    perfChartMode = 'curve';
  }
  renderPerfCard();
}

// Incrément objectif selon le groupe musculaire de l'exercice
function getPerfIncrement(exoName) {
  const mg = getMuscleGroupParent(getMuscleGroup(exoName));
  return (mg === 'Jambes') ? 5 : 2.5;
}

function renderPerfCard() {
  const el = document.getElementById('perfDisplay');
  if (!el) return;

  // Bien-être mode: show wellness metrics instead of key lifts
  if (db.user.trainingMode === 'bien_etre') {
    const logs7d = getLogsInRange(7);
    const sessionsWeek = logs7d.length;
    const streak = db.questStreak || 0;
    const lastBody = (db.body || []).slice(-1)[0];
    const bw = lastBody ? lastBody.bw : (db.user.bw || 0);
    const kcal = lastBody ? (lastBody.kcal || 0) : 0;
    el.innerHTML = '<div class="sbd-grid" style="grid-template-columns:repeat(2,1fr);">' +
      '<div class="rm-box"><div style="font-size:10px;color:var(--sub);text-transform:uppercase;">Séances / sem</div><div class="rm-val" style="color:var(--green);">' + sessionsWeek + '</div></div>' +
      '<div class="rm-box"><div style="font-size:10px;color:var(--sub);text-transform:uppercase;">Streak</div><div class="rm-val" style="color:var(--orange);">' + streak + 'j</div></div>' +
      '<div class="rm-box"><div style="font-size:10px;color:var(--sub);text-transform:uppercase;">Poids du jour</div><div class="rm-val">' + (bw > 0 ? bw + '<span style="font-size:12px;color:var(--sub);">kg</span>' : '—') + '</div></div>' +
      '<div class="rm-box"><div style="font-size:10px;color:var(--sub);text-transform:uppercase;">Calories</div><div class="rm-val" style="color:var(--teal);">' + (kcal > 0 ? kcal : '—') + '</div></div>' +
    '</div>';
    return;
  }

  // ── Récupérer les key lifts configurés (ou SBD par défaut) ──
  var keyLifts = (db.keyLifts && db.keyLifts.length)
    ? db.keyLifts.map(function(kl) { return kl.name; }).filter(Boolean).slice(0, 5)
    : ['Développé Couché (Barre)', 'Squat (Barre)', 'Soulevé de Terre (Barre)'];

  // ── Données par exercice clé : e1RM, 1RM réel, objectif ──
  var LIFT_COLORS = ['#0A84FF','#32D74B','#FF453A','#FF9F0A','#BF5AF2'];
  var klData = [];
  keyLifts.forEach(function(name, i) {
    var bestE1rm = 0;
    var bestReal = 0;
    db.logs.forEach(function(log) {
      log.exercises.forEach(function(exo) {
        if (matchExoName(exo.name, name)) {
          if ((exo.maxRM || 0) > bestE1rm) bestE1rm = exo.maxRM;
          if (Array.isArray(exo.sets)) {
            exo.sets.forEach(function(s) {
              if (s.reps === 1 && (s.weight || 0) > bestReal) bestReal = s.weight;
            });
          }
        }
      });
    });
    var target = 0;
    if (db.keyLifts && db.keyLifts.length) {
      var klEntry = db.keyLifts.find(function(kl) { return kl.name === name; });
      if (klEntry && klEntry.target > 0) target = klEntry.target;
    }
    if (bestE1rm > 0 || bestReal > 0) {
      klData.push({
        name: name,
        shortLabel: name.replace(/\(Barre\)/,'').replace(/\(Haltères\)/,'Halt.').trim().split(' ').slice(0,2).join(' '),
        e1rm: Math.round(bestE1rm),
        real1rm: Math.round(bestReal),
        target: Math.round(target),
        color: LIFT_COLORS[i % LIFT_COLORS.length]
      });
    }
  });

  if (!klData.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--sub);font-size:13px;">Importe des séances pour voir ta progression</div>';
    return;
  }

  // ── Toggle Barres / Progression ──
  var toggleHtml =
    '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
      '<button onclick="setPerfMode(\'bars\')" style="flex:1;padding:6px 0;border-radius:8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border:none;cursor:pointer;' +
        (perfChartMode === 'bars' ? 'background:var(--accent);color:#fff;' : 'background:var(--surface);color:var(--sub);border:0.5px solid var(--border);') +
      '">Barres</button>' +
      '<button onclick="setPerfMode(\'curve\')" style="flex:1;padding:6px 0;border-radius:8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border:none;cursor:pointer;' +
        (perfChartMode === 'curve' ? 'background:var(--accent);color:#fff;' : 'background:var(--surface);color:var(--sub);border:0.5px solid var(--border);') +
      '">Progression</button>' +
    '</div>';

  // ── Boîtes rm-box : e1RM, 1RM réel, objectif, ratio bw ──
  var userBw = db.user.bw || 0;
  var selectedLift = perfSelectedLift || klData[0].name;
  var boxesHtml = '<div class="sbd-grid" style="grid-template-columns:repeat(' + Math.min(klData.length, 3) + ',1fr);gap:6px;margin-bottom:10px;">';
  klData.forEach(function(kl) {
    var isSelected = (kl.name === selectedLift);
    var borderStyle = (perfChartMode === 'curve' && isSelected) ? '1.5px solid ' + kl.color : '0.5px solid var(--border)';
    var bwRatio = (userBw > 0) ? '<div style="font-size:11px;color:var(--green);margin-top:2px;">×' + (kl.e1rm / userBw).toFixed(2) + ' bw</div>' : '';
    var realLine = kl.real1rm > 0 ? '<div style="font-size:9px;color:var(--sub);margin-top:1px;">1RM: ' + kl.real1rm + ' kg</div>' : '';
    var targetLine = kl.target > 0 ? '<div style="font-size:9px;color:var(--orange);margin-top:1px;">Obj: ' + kl.target + ' kg</div>' : '';
    boxesHtml += '<div class="rm-box" style="cursor:pointer;border:' + borderStyle + ';" onclick="selectPerfLift(\'' + kl.name.replace(/'/g, "\\'") + '\')">' +
      '<div style="font-size:9px;color:var(--sub);text-transform:uppercase;margin-bottom:2px;">' + kl.shortLabel + '</div>' +
      '<div class="rm-val" style="color:' + kl.color + ';">' + kl.e1rm + '<span style="font-size:11px;color:var(--sub);"> kg</span></div>' +
      realLine + targetLine + bwRatio +
    '</div>';
  });
  boxesHtml += '</div>';

  // Détruire anciens charts si existants
  if (chartPerf) { try { chartPerf.destroy(); } catch(e) {} chartPerf = null; }
  if (window._chartPerfLine) { try { window._chartPerfLine.destroy(); } catch(e) {} window._chartPerfLine = null; }

  // ── MODE BARRES : 3 datasets groupés ──
  if (perfChartMode === 'bars') {
    var barLabels = klData.map(function(kl) { return kl.shortLabel; });
    var real1rms = klData.map(function(kl) { return kl.real1rm > 0 ? kl.real1rm : null; });
    var e1rms = klData.map(function(kl) { return kl.e1rm > 0 ? kl.e1rm : null; });
    var targets = klData.map(function(kl) { return kl.target > 0 ? kl.target : null; });
    var bgMain = klData.map(function(kl) { return kl.color; });
    var bgE1rm = klData.map(function(kl) { return kl.color + '99'; });
    var bgTarget = klData.map(function(kl) { return kl.color + '33'; });

    el.innerHTML = toggleHtml + boxesHtml +
      '<div style="height:200px;"><canvas id="chartPerfDash"></canvas></div>';

    requestAnimationFrame(function() {
      var ctxBar = document.getElementById('chartPerfDash');
      if (!ctxBar) return;
      chartPerf = new Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: barLabels,
          datasets: [
            { label: '1RM Réel', data: real1rms, backgroundColor: bgMain, borderRadius: 6, barThickness: 18 },
            { label: 'e1RM (Epley)', data: e1rms, backgroundColor: bgE1rm, borderRadius: 6, barThickness: 18 },
            { label: 'Objectif', data: targets, backgroundColor: bgTarget, borderRadius: 6, barThickness: 18, borderColor: bgMain, borderWidth: 1.5 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { font: { size: 10 }, boxWidth: 10, color: '#86868B' } },
            tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y + ' kg'; } } }
          },
          scales: {
            x: { ticks: { color: '#86868B', font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { color: '#86868B', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' },
              beginAtZero: true }
          }
        }
      });
    });
    return;
  }

  // ── MODE PROGRESSION (courbe individuelle) ──
  var curveLift = selectedLift;
  var curveColor = LIFT_COLORS[0];
  klData.forEach(function(kl) { if (kl.name === curveLift) curveColor = kl.color; });

  var pts = [];
  db.logs.slice().sort(function(a,b){ return a.timestamp - b.timestamp; }).forEach(function(log) {
    log.exercises.forEach(function(exo) {
      if (matchExoName(exo.name, curveLift) && (exo.maxRM || 0) > 0) {
        pts.push({ ts: log.timestamp, val: Math.round(exo.maxRM) });
      }
    });
  });
  // Garder max par session, 8 derniers points
  var seen = {};
  pts.forEach(function(p) {
    var key = new Date(p.ts).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit'});
    if (!seen[key] || p.val > seen[key].val) seen[key] = p;
  });
  var sorted = Object.values(seen).sort(function(a,b){ return a.ts - b.ts; }).slice(-6);
  var lineLabels = [];
  var lineData = [];
  sorted.forEach(function(p) {
    lineLabels.push(new Date(p.ts).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit'}));
    lineData.push(p.val);
  });

  if (lineData.length < 2) {
    el.innerHTML = toggleHtml + boxesHtml +
      '<div style="text-align:center;padding:16px;color:var(--sub);font-size:12px;">Pas assez de données pour la courbe de progression</div>';
    return;
  }

  var minVal = Math.min.apply(null, lineData);
  var sugMin = Math.floor(minVal * 0.9);

  el.innerHTML = toggleHtml + boxesHtml +
    '<div style="height:200px;"><canvas id="chartPerfLine"></canvas></div>';

  requestAnimationFrame(function() {
    var ctxLine = document.getElementById('chartPerfLine');
    if (!ctxLine) return;
    window._chartPerfLine = new Chart(ctxLine, {
      type: 'line',
      data: {
        labels: lineLabels,
        datasets: [{
          data: lineData,
          borderColor: curveColor,
          backgroundColor: curveColor + '18',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: curveColor,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: function(ctx) { return ctx.parsed.y + ' kg e1RM'; } }
        }},
        scales: {
          x: { ticks: { color: '#86868B', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#86868B', font: { size: 10 }, callback: function(v) { return v + ' kg'; } }, grid: { color: 'rgba(255,255,255,0.05)' },
            beginAtZero: false, suggestedMin: sugMin }
        }
      }
    });
  });
}

// ── Réglages : éditeur exercices clés ────────────────────────
function renderKeyLiftsEditor() {
  const keyLifts = db.keyLifts || [];
  const editor = document.getElementById('keyLiftsEditor');
  if (!editor) return;
  if (!keyLifts.length) {
    editor.innerHTML = '<p style="font-size:12px;color:var(--sub);text-align:center;padding:8px 0;">Aucun exercice clé — ajoute-en ci-dessous.</p>';
    return;
  }
  editor.innerHTML = keyLifts.map((kl, i) =>
    '<div class="keylift-editor-row">' +
    '<input type="text" value="' + kl.name + '" placeholder="Ex: Squat (Barre)" oninput="db.keyLifts['+i+'].name=this.value">' +
    '<input class="tgt-input" type="number" value="' + (kl.target||'') + '" placeholder="Obj kg" oninput="db.keyLifts['+i+'].target=parseFloat(this.value)||0">' +
    '<button class="keylift-editor-del" onclick="removeKeyLift('+i+')">✕</button>' +
    '</div>'
  ).join('');
}

function addKeyLift() {
  if (!db.keyLifts) db.keyLifts = [];
  if (db.keyLifts.length >= 6) { showToast('Maximum 6 exercices'); return; }
  db.keyLifts.push({ name: '', target: 0 });
  renderKeyLiftsEditor();
  // Focus sur le dernier input
  const rows = document.querySelectorAll('.keylift-editor-row input[type="text"]');
  if (rows.length) rows[rows.length-1].focus();
}

function removeKeyLift(i) {
  if (!db.keyLifts) return;
  db.keyLifts.splice(i, 1);
  renderKeyLiftsEditor();
}

function saveKeyLifts() {
  // Relire les inputs au cas où l'utilisateur aurait tapé sans déclencher oninput
  const rows = document.querySelectorAll('.keylift-editor-row');
  if (rows.length && db.keyLifts) {
    rows.forEach((row, i) => {
      const nameInp = row.querySelector('input[type="text"]');
      const tgtInp = row.querySelector('input[type="number"]');
      if (nameInp && db.keyLifts[i]) db.keyLifts[i].name = nameInp.value.trim();
      if (tgtInp && db.keyLifts[i]) db.keyLifts[i].target = parseFloat(tgtInp.value) || 0;
    });
    db.keyLifts = db.keyLifts.filter(kl => kl.name);
  }
  saveDB();
  showToast('✓ Exercices clés sauvegardés !');
  renderPerfCard();
}

function renderDaySelector() {
  var el = document.getElementById('dashDaySelector');
  if (!el) return;
  var todayIdx = new Date().getDay(); // 0=dim
  var DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  var DAYS_FULL_LOCAL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  var html = '<div style="display:flex;gap:8px;overflow-x:auto;padding:4px 0;-webkit-overflow-scrolling:touch;scrollbar-width:none;">';
  for (var i = 1; i <= 7; i++) { // Lun=1 à Dim=7 (puis Dim=0)
    var idx = i % 7; // 1,2,3,4,5,6,0
    var fullName = DAYS_FULL_LOCAL[idx];
    var isToday = (idx === todayIdx);
    var isSelected = (fullName === selectedDay);
    var bg = isSelected ? 'var(--blue)' : isToday ? 'rgba(10,132,255,0.15)' : 'var(--surface)';
    var color = isSelected ? '#fff' : isToday ? 'var(--blue)' : 'var(--sub)';
    var border = isSelected ? 'var(--blue)' : isToday ? 'rgba(10,132,255,0.4)' : 'var(--border)';
    var weight = (isSelected || isToday) ? '700' : '500';
    html += '<button onclick="selectedDay=\'' + fullName + '\';renderDaySelector();renderDayExercises(\'' + fullName + '\');" ' +
      'style="flex-shrink:0;min-width:44px;padding:8px 10px;border-radius:12px;border:1px solid ' + border + ';' +
      'background:' + bg + ';color:' + color + ';font-size:12px;font-weight:' + weight + ';cursor:pointer;transition:all 0.2s;">' +
      DAYS_SHORT[idx] +
      (isToday ? '<div style="font-size:8px;margin-top:1px;opacity:0.8;">auj.</div>' : '') +
      '</button>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderDayExercises(day) {
  selectedDay = day; // s'assurer que selectedDay est mis à jour
  const c = document.getElementById('dayExercisesContainer') || document.getElementById('trainingLogs');
  if (!c) return;
  const progNames = getProgExosForDay(day);

  // ── Repos ────────────────────────────────────────────────────
  const routine = getRoutine();
  const dayLabel = routine[day] || '';
  const isRestDay = dayLabel.toLowerCase().includes('repos') || dayLabel.includes('😴') ||
    (day === 'Dimanche' && !progNames.length && !dayLabel);

  if (isRestDay && !progNames.length) {
    c.innerHTML = '<div style="text-align:center;padding:24px 0;color:var(--sub);">' +
      '<div style="font-size:32px;margin-bottom:8px;">😴</div>' +
      '<div style="font-size:14px;font-weight:600;color:var(--text);">Repos complet</div>' +
      '<div style="font-size:12px;margin-top:4px;">Récupération & adaptation</div>' +
      '</div>';
    if (typeof renderDaySelector === 'function') renderDaySelector();
    return;
  }

  // Fonction utilitaire : accumule le meilleur record pour une liste de noms Hevy exacts
  function accumulateBest(logsToSearch, nameFilter) {
    const best = {};
    logsToSearch.forEach(log => {
      log.exercises.forEach(exo => {
        if (SESSION_NAME_BLACKLIST.test(exo.name.toLowerCase())) return;
        if (nameFilter && !nameFilter.has(exo.name)) return;
        const key = exo.name;
        const exoType = getExoType(exo.name);
        if (!best[key]) { best[key] = { ...exo, exoType }; return; }
        if (exoType === 'cardio' || exoType === 'cardio_stairs') {
          if ((exo.distance||0) > (best[key].distance||0)) best[key].distance = exo.distance;
          if ((exo.maxTime||0) > (best[key].maxTime||0)) best[key].maxTime = exo.maxTime;
        } else if (exoType === 'time') {
          if ((exo.maxTime||0) > (best[key].maxTime||0)) best[key] = { ...exo, exoType };
        } else if (exoType === 'reps') {
          if ((exo.maxReps||0) > (best[key].maxReps||0)) { best[key].maxReps = exo.maxReps; best[key].maxRepsDate = exo.maxRepsDate; }
          else if ((exo.maxReps||0) === (best[key].maxReps||0) && exo.maxRepsDate && (!best[key].maxRepsDate || exo.maxRepsDate > best[key].maxRepsDate)) { best[key].maxRepsDate = exo.maxRepsDate; }
          if ((exo.maxRM||0) > (best[key].maxRM||0)) { best[key].maxRM = exo.maxRM; best[key].maxRMDate = exo.maxRMDate; }
          else if ((exo.maxRM||0) === (best[key].maxRM||0) && exo.maxRMDate && (!best[key].maxRMDate || exo.maxRMDate > best[key].maxRMDate)) { best[key].maxRMDate = exo.maxRMDate; }
          if (exo.repRecords) {
            if (!best[key].repRecords) best[key].repRecords = {};
            Object.entries(exo.repRecords).forEach(([r,w]) => { if (!best[key].repRecords[r] || w > best[key].repRecords[r]) best[key].repRecords[r] = w; });
          }
        } else {
          if ((exo.maxRM||0) > (best[key].maxRM||0)) best[key] = { ...exo, exoType };
          if (exo.repRecords) {
            if (!best[key].repRecords) best[key].repRecords = {};
            Object.entries(exo.repRecords).forEach(([r,w]) => { if (!best[key].repRecords[r] || w > best[key].repRecords[r]) best[key].repRecords[r] = w; });
          }
        }
      });
    });
    return best;
  }

  // ── Programme configuré dans Réglages ────────────────────────
  if (progNames.length > 0) {
    // Étape 1 : pour chaque exercice du programme, trouver le NOM EXACT Hevy
    // en cherchant d'abord dans les séances du même jour de la semaine
    // Sort same-day logs and all logs by most recent first
    const allLogsByRecency = getSortedLogs();
    const logsOfDay = allLogsByRecency.filter(l => l.day === day);
    const hevyNameForProg = {}; // progName → nom Hevy exact
    const matchTimestamp = {}; // progName → timestamp of matched log (to detect staleness)

    progNames.forEach(progName => {
      // Priorité 1 : séances du même jour (les plus récentes d'abord)
      for (const log of logsOfDay) {
        for (const exo of log.exercises) {
          if (matchExoName(exo.name, progName)) {
            hevyNameForProg[progName] = exo.name;
            matchTimestamp[progName] = log.timestamp;
            break;
          }
        }
        if (hevyNameForProg[progName]) break;
      }
      // Priorité 2 : tout l'historique, récent d'abord
      if (!hevyNameForProg[progName]) {
        for (const log of allLogsByRecency) {
          for (const exo of log.exercises) {
            if (matchExoName(exo.name, progName)) {
              hevyNameForProg[progName] = exo.name;
              matchTimestamp[progName] = log.timestamp;
              break;
            }
          }
          if (hevyNameForProg[progName]) break;
        }
      }
    });

    // Étape 2 : accumuler les records ALL TIME pour les noms Hevy trouvés
    const hevyNamesNeeded = new Set(Object.values(hevyNameForProg).filter(Boolean));
    const best = accumulateBest(db.logs, hevyNamesNeeded);

    const staleThreshold = Date.now() - 60 * 86400000; // 60 days

    // Étape 2b : trouver la date réelle de la dernière séance pour chaque exercice
    // (pas seulement le jour de la semaine correspondant — évite les faux positifs stale)
    const lastSeen = {};
    progNames.forEach(progName => {
      const hevyName = hevyNameForProg[progName];
      if (!hevyName) return;
      for (const log of allLogsByRecency) {
        if (log.exercises.some(e => e.name === hevyName)) {
          lastSeen[progName] = log.timestamp;
          break;
        }
      }
    });

    // Étape 3 : afficher dans l'ordre du programme
    let html = '';
    progNames.forEach((progName, idx) => {
      const hevyName = hevyNameForProg[progName];
      const exo = hevyName ? best[hevyName] : null;
      const isStale = hevyName && (lastSeen[progName] || 0) < staleThreshold;
      if (exo) {
        html += formatExoDropdown(hevyName, exo, 'prog-' + idx, isStale ? progName : null);
      } else {
        const ems = _ecMuscleStyle(progName);
        html += '<div class="ec ec-empty"><div class="ec-head">' +
          '<div class="ec-ico" style="background:' + ems.bg + ';">' + ems.icon + '</div>' +
          '<div class="ec-info"><div class="ec-name">' + progName + '</div></div>' +
          '<div class="ec-right"><div style="font-size:11px;color:var(--sub);">Aucun record</div></div>' +
          '</div></div>';
      }
    });
    c.innerHTML = html;
    _initSparkTooltips(c);
    return;
  }

  // ── Fallback : séances de CE jour de la semaine uniquement ───
  const best = accumulateBest(db.logs.filter(l => l.day === day), null);
  const entries = Object.entries(best);
  if (!entries.length) {
    const hasLogs = db.logs && db.logs.length > 0;
    c.innerHTML = '<div style="text-align:center;padding:20px 0;">' +
      '<div style="font-size:28px;margin-bottom:10px;">' + (hasLogs ? '📅' : '📥') + '</div>' +
      '<div style="font-size:13px;color:var(--sub);line-height:1.6;">' +
      (hasLogs
        ? 'Définis ton programme dans<br><strong style="color:var(--text);">Réglages → 📅 Mon Programme</strong>'
        : 'Importe tes séances depuis Hevy<br>dans <strong style="color:var(--text);">Réglages → 📥 Import</strong>') +
      '</div></div>';
    return;
  }
  let html = entries.map(([n,e], idx) => formatExoDropdown(n, e, 'day-' + idx)).join('');
  c.innerHTML = html;
  _initSparkTooltips(c);
}

function _initSparkTooltips(container) {
  container.addEventListener('mouseenter', function(e) {
    var hit = e.target.closest('.spark-hit');
    if (!hit) return;
    var tip = document.getElementById(hit.dataset.tip);
    if (tip) { tip.innerHTML = '<span style="color:' + hit.dataset.color + ';">' + hit.dataset.label + '</span>'; tip.style.opacity = '1'; }
  }, true);
  container.addEventListener('mouseleave', function(e) {
    var hit = e.target.closest('.spark-hit');
    if (!hit) return;
    var tip = document.getElementById(hit.dataset.tip);
    if (tip) tip.style.opacity = '0';
  }, true);
  container.addEventListener('touchstart', function(e) {
    var hit = e.target.closest('.spark-hit');
    if (!hit) return;
    e.preventDefault();
    var tip = document.getElementById(hit.dataset.tip);
    if (tip) { tip.innerHTML = '<span style="color:' + hit.dataset.color + ';">' + hit.dataset.label + '</span>'; tip.style.opacity = '1'; setTimeout(function() { tip.style.opacity = '0'; }, 2000); }
  }, {passive: false});
}

// ============================================================
// EXERCISE CARD DISPLAY
// ============================================================

// Muscle icon + color helper
function _ecMuscleStyle(name) {
  const mg = getMuscleGroup(name);
  const parent = getMuscleGroupParent(mg);
  const n = name.toLowerCase();
  const styles = {
    'Jambes':  { bg:'rgba(50,215,75,0.1)',  color:'var(--green)',  icon:'🦵', tagBg:'rgba(50,215,75,0.1)', tagColor:'var(--green)' },
    'Pecs':    { bg:'rgba(10,132,255,0.1)',  color:'var(--blue)',   icon:'🫁', tagBg:'rgba(10,132,255,0.1)', tagColor:'var(--blue)' },
    'Dos':     { bg:'rgba(255,159,10,0.1)',  color:'var(--orange)', icon:'🔙', tagBg:'rgba(255,159,10,0.1)', tagColor:'var(--orange)' },
    'Épaules': { bg:'rgba(191,90,242,0.1)',  color:'var(--purple)', icon:'🫴', tagBg:'rgba(191,90,242,0.1)', tagColor:'var(--purple)' },
    'Bras':    { bg:'rgba(100,210,255,0.1)', color:'var(--teal)',   icon:'💪', tagBg:'rgba(100,210,255,0.1)', tagColor:'var(--teal)' },
    'Abdos':   { bg:'rgba(255,69,58,0.1)',   color:'var(--red)',    icon:'🔥', tagBg:'rgba(255,69,58,0.1)', tagColor:'var(--red)' },
    'Cardio':  { bg:'rgba(255,159,10,0.1)',  color:'var(--orange)', icon:'🏃', tagBg:'rgba(255,159,10,0.1)', tagColor:'var(--orange)' },
  };
  const s = styles[parent] || { bg:'rgba(134,134,139,0.1)', color:'var(--sub)', icon:'💪', tagBg:'rgba(134,134,139,0.1)', tagColor:'var(--sub)' };
  // Cardio sub-icons
  if (parent === 'Cardio') {
    if (/natation|swimming|nage/.test(n)) s.icon = '🏊';
    else if (/velo|cycling|bike/.test(n)) s.icon = '🚴';
    else if (/randonnee|hiking/.test(n)) s.icon = '🥾';
  }
  if (mg === 'Fessiers') s.icon = '🍑';
  return { ...s, tag: mg };
}

// Build sparkline SVG for e1RM progression (with date tooltips)
function _buildSparkSVG(exoName, muscleColor) {
  const pts = [];
  const sorted = getSortedLogs();
  for (let i = 0; i < sorted.length && pts.length < 12; i++) {
    const log = sorted[i];
    for (const exo of log.exercises) {
      if (matchExoName(exo.name, exoName) && (exo.maxRM || 0) > 0) {
        pts.push({ ts: log.timestamp, rm: exo.maxRM, date: log.shortDate || formatDate(log.timestamp) });
        break;
      }
    }
  }
  if (pts.length < 2) return '';
  pts.reverse();
  const w = 280, h = 46, pad = 2, topPad = 14;
  const minRM = Math.min(...pts.map(p => p.rm)), maxRM = Math.max(...pts.map(p => p.rm));
  const range = maxRM - minRM || 1;
  const points = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = topPad + pad + (1 - (p.rm - minRM) / range) * (h - topPad - pad * 2);
    return { x, y };
  });
  const line = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const area = line + ' L' + points[points.length - 1].x.toFixed(1) + ',' + h + ' L' + points[0].x.toFixed(1) + ',' + h + ' Z';
  const gradId = 'sg' + Math.random().toString(36).substr(2, 5);
  const tipId = 'ectip' + Math.random().toString(36).substr(2, 5);
  const col = muscleColor || 'var(--blue)';
  const circles = points.map((p, i) =>
    '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="' + col + '" opacity="' + (i === points.length-1 ? '1' : '0.5') + '"/>' +
    '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="14" fill="transparent" class="spark-hit" ' +
    'data-tip="' + tipId + '" data-label="' + pts[i].rm + 'kg · ' + pts[i].date + '" data-color="' + col + '"/>'
  ).join('');
  return '<div class="ec-spark" style="position:relative;">' +
    '<div id="' + tipId + '" style="position:absolute;top:0;left:0;right:0;text-align:center;font-size:10px;font-weight:600;color:var(--sub);height:12px;pointer-events:none;opacity:0;transition:opacity 0.15s;"></div>' +
    '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="touch-action:none;">' +
    '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + col + '" stop-opacity="0.15"/><stop offset="100%" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#' + gradId + ')"/>' +
    '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    circles +
    '</svg></div>';
}

function buildRMTable(e1rm, repRecords, exoName) {
  // e1RM coherence: if repRecords is empty but e1rm > 0, try to reconstruct
  if (e1rm > 0 && (!repRecords || Object.keys(repRecords).length === 0)) {
    repRecords = repRecords || {};
    if (exoName) {
      for (const log of db.logs) {
        for (const exo of log.exercises) {
          if (matchExoName(exo.name, exoName)) {
            const source = (exo.allSets && exo.allSets.length > 0) ? exo.allSets : (exo.series || []);
            source.forEach(s => {
              const w = s.weight || 0, r = s.reps || 0;
              if (w > 0 && r > 0) { const rKey = String(r); if (!repRecords[rKey] || w > repRecords[rKey]) repRecords[rKey] = w; }
            });
          }
        }
      }
    }
  }
  const TARGET_REPS = [1, 3, 5, 8, 10, 12, 15];
  let missingReal = 0;
  const coachTips = [];
  const hdr = '<div class="rm-row" style="border-top:none;font-size:10px;color:var(--sub);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;"><span class="rm-lbl">Reps</span><span class="rm-theo">Théo.</span><span class="rm-real">Réel</span></div>';
  const rows = TARGET_REPS.map(r => {
    const theo = r === 1 ? e1rm : Math.round((e1rm * (1.0278 - 0.0278 * r)) * 2) / 2;
    const realW = (repRecords && repRecords[String(r)]) ? repRecords[String(r)] : null;
    const label = r === 1 ? '1 rep' : r + ' reps';
    let realHtml, cls;
    if (realW) {
      const gap = theo - realW;
      if (gap > 2.5) { cls = 'pot'; realHtml = realW + 'kg <span style="font-size:10px;">↑+' + gap.toFixed(1) + '</span>'; coachTips.push(r + ' reps'); }
      else { cls = 'done'; realHtml = realW + 'kg ✓'; }
    } else { missingReal++; cls = 'miss'; realHtml = '—'; }
    return '<div class="rm-row"><span class="rm-lbl">' + label + '</span><span class="rm-theo">~' + theo + 'kg</span><span class="rm-real ' + cls + '">' + realHtml + '</span></div>';
  }).join('');

  let tip = '';
  if (coachTips.length > 0) tip = '<div class="ec-tip">💡 Potentiel non exploité à ' + coachTips.join(', ') + ' reps</div>';
  else if (missingReal === TARGET_REPS.length) tip = '<div class="ec-tip" style="opacity:0.6;">💡 Poids estimés depuis e1RM. Enregistre des séries pour valider.</div>';

  const uid = 'rc' + Math.random().toString(36).substr(2, 5);
  const calcHtml = '<div class="ec-calc"><span class="ec-calc-lbl">Calcul rapide</span><input type="number" min="1" max="30" placeholder="reps" oninput="calcDashRM(this,' + e1rm + ',\'' + uid + '\')"><span style="color:var(--sub);">→</span><span class="ec-calc-res" id="' + uid + '">—</span></div>';

  return '<div class="ec-rm-section"><div class="ec-rm-title">Tableau RM</div>' + hdr + rows + '</div>' + tip + calcHtml;
}

function calcDashRM(input, e1rm, uid) {
  const r = parseInt(input.value);
  const out = document.getElementById(uid);
  if (!out) return;
  if (!r || r < 1 || r > 30) { out.textContent = '—'; return; }
  const w = r === 1 ? e1rm : Math.round((e1rm * (1.0278 - 0.0278 * r)) * 2) / 2;
  out.textContent = '~' + w + 'kg (théorique)';
}

function formatExoDropdown(name, exo, idx, staleMatchName) {
  const exoType = exo.exoType || getExoType(name);
  const ms = _ecMuscleStyle(name);
  const isPR = SBD_TYPES.some(t => exo.maxRM === db.bestPR[t] && db.bestPR[t] > 0);
  const id = 'exo-' + idx;

  // ── Main display value + date ──
  let mainVal = '', mainUnit = '', dateTs = null;
  if (exoType === 'cardio' || exoType === 'cardio_stairs') {
    const parts = [];
    if (exo.distance) parts.push(exo.distance.toFixed(2) + 'km');
    if (exo.maxTime) { parts.push(formatTime(exo.maxTime)); if (exo.distance) { const kmh = exo.distance / (exo.maxTime / 3600); parts.push(kmh.toFixed(1) + ' km/h'); } }
    mainVal = parts.join(' · ') || 'Cardio'; mainUnit = ''; dateTs = exo.cardioDate;
  } else if (exoType === 'time') {
    const _mt = exo.maxTime;
    if (!_mt || _mt <= 1) { mainVal = '—'; } else { mainVal = Math.floor(_mt / 60) + ':' + String(_mt % 60).padStart(2, '0'); }
    mainUnit = ''; dateTs = exo.maxTimeDate;
  } else if (exoType === 'reps') {
    if (exo.maxRM > 0) { mainVal = exo.maxRM; mainUnit = '<span>kg e1RM</span>'; }
    else if (exo.maxReps) { mainVal = exo.maxReps; mainUnit = '<span>reps</span>'; }
    else { mainVal = '—'; }
    dateTs = exo.maxRepsDate || exo.maxRMDate;
  } else {
    mainVal = exo.maxRM || 0; mainUnit = '<span>kg</span>'; dateTs = exo.maxRMDate;
  }
  const ds = dateTs ? formatDate(dateTs) : '';

  // ── Staleness warning ──
  const staleHtml = staleMatchName
    ? '<div style="font-size:10px;color:var(--orange);padding:4px 16px 0;">⚠️ Correspondu à "' + staleMatchName + '" — dernière séance > 60j</div>'
    : '';

  // ── PR badge ──
  const prHtml = isPR ? '<div class="ec-pr">PR</div>' : '';

  // ── Header ──
  let html = '<div class="ec">';
  html += '<div class="ec-head">';
  html += '<div class="ec-ico" style="background:' + ms.bg + ';">' + ms.icon + '</div>';
  html += '<div class="ec-info"><div class="ec-name">' + name + '</div>';
  html += '<span class="ec-tag" style="background:' + ms.tagBg + ';color:' + ms.tagColor + ';">' + ms.tag + '</span></div>';
  html += '<div class="ec-right">' + prHtml + '<div class="ec-e1rm">' + mainVal + mainUnit + '</div>';
  if (ds) html += '<div class="ec-date">' + ds + '</div>';
  html += '</div></div>';

  // ── Sparkline (only for weight/reps with RM data) ──
  if ((exoType === 'weight' || exoType === 'reps') && exo.maxRM > 0) {
    html += _buildSparkSVG(name, ms.color);
  }

  // ── Trend (delta vs previous + BW ratio) ──
  if ((exoType === 'weight' || exoType === 'reps') && exo.maxRM > 0) {
    let deltaHtml = '';
    const sorted = getSortedLogs();
    let prev = null, curr = null;
    for (const log of sorted) {
      for (const e of log.exercises) {
        if (matchExoName(e.name, name) && (e.maxRM || 0) > 0) {
          if (!curr) { curr = e.maxRM; } else if (!prev) { prev = e.maxRM; break; }
        }
      }
      if (prev !== null) break;
    }
    if (curr && prev) {
      const d = curr - prev;
      if (d > 0) deltaHtml = '<span class="ec-trend-delta up">+' + d.toFixed(1) + 'kg ↑</span>';
      else if (d < 0) deltaHtml = '<span class="ec-trend-delta dn">' + d.toFixed(1) + 'kg ↓</span>';
      else deltaHtml = '<span class="ec-trend-delta fl">= stable</span>';
    }
    let bwHtml = '';
    if (db.user.bw > 0 && modeFeature('showBWRatio')) {
      bwHtml = '<span class="ec-trend-meta">' + (exo.maxRM / db.user.bw).toFixed(2) + '× PC</span>';
    }
    if (deltaHtml || bwHtml) html += '<div class="ec-trend">' + deltaHtml + bwHtml + '</div>';
  }

  html += staleHtml;

  // ── Toggle button ──
  html += '<div class="ec-toggle" onclick="toggleExo(\'' + id + '\')">Voir détails <span class="chev">▾</span></div>';

  // ── Body (collapsible) ──
  let bodyContent = '';
  if ((exoType === 'weight' || exoType === 'reps') && exo.maxRM > 0) {
    bodyContent = modeFeature('show1RM') ? buildRMTable(exo.maxRM, exo.repRecords, exo.name) : '<div style="padding:12px 16px;font-size:12px;color:var(--sub);">Meilleur : <strong style="color:var(--blue);">' + exo.maxRM + 'kg</strong></div>';
    if (exoType === 'reps' && exo.maxReps) {
      const bwNote = db.user.bw > 0
        ? '<div class="ec-bw">💪 Force totale : ' + (db.user.bw + exo.maxRM) + 'kg (PC+lest)</div>'
        : '';
      bodyContent = '<div style="padding:8px 16px;"><div style="font-size:12px;color:var(--sub);">Max reps (poids corps) : <strong style="color:var(--green);">' + exo.maxReps + ' reps</strong></div>' + bwNote + '</div><div class="ec-divider"></div>' + bodyContent;
    }
  } else if (exoType === 'weight' && (!exo.repRecords || !Object.keys(exo.repRecords).length)) {
    bodyContent = '<div style="padding:12px 16px;font-size:12px;color:var(--sub);">e1RM estimé : <strong style="color:var(--blue);">' + (exo.maxRM || 0) + 'kg</strong></div>';
  } else if (exoType === 'reps' && !exo.maxRM && exo.maxReps) {
    bodyContent = '<div style="padding:12px 16px;"><div style="font-size:12px;color:var(--sub);">Max reps (poids corps) : <strong style="color:var(--green);">' + exo.maxReps + ' reps</strong></div>' +
      '<div class="ec-tip">💡 Pas de séries lestées. Ajoute du poids pour le tableau RM.</div></div>';
  } else if (exoType === 'cardio' || exoType === 'cardio_stairs') {
    const records = [];
    if (exo.distance) records.push('<div class="rm-row"><span class="rm-lbl">📏 Dist.</span><span class="rm-theo" style="color:var(--green);font-weight:600;">' + exo.distance.toFixed(2) + ' km</span><span></span></div>');
    if (exo.maxTime) records.push('<div class="rm-row"><span class="rm-lbl">⏱ Temps</span><span class="rm-theo" style="color:var(--green);font-weight:600;">' + formatTime(exo.maxTime) + '</span><span></span></div>');
    if (exo.distance && exo.maxTime) {
      const kmh = exo.distance / (exo.maxTime / 3600);
      records.push('<div class="rm-row"><span class="rm-lbl">⚡ Vit.</span><span class="rm-theo" style="color:var(--green);font-weight:600;">' + kmh.toFixed(1) + ' km/h</span><span></span></div>');
      const minkm = (exo.maxTime / 60) / exo.distance;
      const minPart = Math.floor(minkm); const secPart = Math.round((minkm - minPart) * 60);
      records.push('<div class="rm-row"><span class="rm-lbl">🏃 Allure</span><span class="rm-theo" style="color:var(--green);font-weight:600;">' + minPart + "\'" + String(secPart).padStart(2, '0') + '" /km</span><span></span></div>');
    }
    bodyContent = '<div class="ec-rm-section">' + records.join('') + '</div>';
  } else if (exoType === 'time') {
    const fmtT = s => { if (!s || s <= 0) return '0:00'; const m = Math.floor(s / 60), sc = s % 60; return m + ':' + String(sc).padStart(2, '0'); };
    const timeSessions = [];
    [...db.logs].sort((a, b) => b.timestamp - a.timestamp).forEach(log => {
      if (timeSessions.length >= 5) return;
      const found = log.exercises.find(e => e.name === name);
      if (found && (found.maxTime || 0) > 1) timeSessions.push({ date: log.shortDate || formatDate(log.timestamp), time: found.maxTime });
    });
    const rows = [];
    if (exo.maxTime > 1) rows.push('<div class="rm-row"><span class="rm-lbl">🏆 Record</span><span class="rm-theo" style="color:var(--green);font-weight:600;">' + fmtT(exo.maxTime) + '</span><span></span></div>');
    timeSessions.forEach((s, i) => {
      const prev = timeSessions[i + 1];
      const delta = prev ? s.time - prev.time : null;
      const dStr = delta === null ? '' : delta > 0 ? ' <span style="color:var(--green);">↑+' + delta + 's</span>' : delta < 0 ? ' <span style="color:var(--red);">↓' + delta + 's</span>' : ' =';
      rows.push('<div class="rm-row"><span class="rm-lbl">' + s.date + '</span><span class="rm-theo">' + fmtT(s.time) + dStr + '</span><span></span></div>');
    });
    if (timeSessions.length >= 3) {
      const times = timeSessions.map(s => s.time);
      const avgD = ((times[0] - times[times.length - 1]) / (times.length - 1)).toFixed(1);
      const tc = parseFloat(avgD) > 0 ? 'var(--green)' : parseFloat(avgD) < 0 ? 'var(--red)' : 'var(--sub)';
      rows.push('<div class="rm-row" style="border-top:1px solid rgba(255,255,255,0.06);"><span class="rm-lbl">📈 Tend.</span><span class="rm-theo" style="color:' + tc + ';font-weight:600;">' + (parseFloat(avgD) > 0 ? '+' : '') + avgD + 's/séance</span><span></span></div>');
    }
    if (!rows.length) rows.push('<div style="padding:12px 16px;font-size:11px;color:var(--orange);">Re-importe la séance pour récupérer le temps</div>');
    bodyContent = '<div class="ec-rm-section">' + rows.join('') + '</div>';
  }

  if (bodyContent) {
    html += '<div class="ec-body" id="' + id + '">' + bodyContent + '</div>';
  }
  html += '</div>';
  return html;
}

function toggleExo(id) {
  const body = document.getElementById(id);
  if (!body) return;
  body.classList.toggle('open');
  const card = body.closest('.ec');
  if (!card) return;
  const toggle = card.querySelector('.ec-toggle');
  if (toggle) toggle.classList.toggle('open', body.classList.contains('open'));
}

// ============================================================
// CHARTS
// ============================================================
function renderVolumeChart(period) {
  period = period || 'week';
  setPeriodButtons('volumeButtons', period);
  const cv = document.getElementById('chartVolume'); if (!cv) return; if (chartVolume) chartVolume.destroy();
  // 'week' = 10 dernières séances, 'month' = 30 dernières séances
  const limit = period === 'week' ? 10 : 30;
  const vl = [...db.logs].sort((a,b) => a.timestamp-b.timestamp).filter(l => l.volume > 0).slice(-limit);
  console.log('renderVolumeChart', period, 'vl.length=', vl.length, 'db.logs.length=', db.logs.length);
  chartVolume = new Chart(cv, {type:'line', data:{labels:vl.map(l=>(l.shortDate||l.date||'').substring(0,5)), datasets:[{data:vl.map(l=>l.volume), borderColor:'#BF5AF2', backgroundColor:'rgba(191,90,242,0.1)', borderWidth:3, fill:true, tension:0.4, pointBackgroundColor:'#BF5AF2', pointRadius:3}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{title:items=>{const log=vl[items[0].dataIndex];return(log.title||'')+(log.shortDate?' · '+log.shortDate:'');}, label:c=>' '+(c.raw/1000).toFixed(2)+'t'}}}, scales:{y:{display:false}, x:{grid:{display:false}, ticks:{color:'#86868B', font:{size:10}, maxRotation:30}}}}});
}

function renderMuscleChart(period) {
  period = period || 'week';
  // Mettre à jour les boutons 7j/28j
  document.querySelectorAll('[data-mperiod]').forEach(b => b.classList.toggle('active', b.dataset.mperiod === period));
  // Utiliser la nouvelle fonction du volume musculaire (barres + mini-évolution)
  // stocke la période courante pour setMuscleView
  window._musclePeriod = period;
  renderMuscleVolumeContent(period);
}

function renderMuscleVolumeContent(period) {
  period = period || window._musclePeriod || 'week';
  const days = period === 'week' ? 7 : 28;
  const rl = getLogsInRange(days);

  // Sub-group volume via getMuscleContributions
  const subVol = {};
  rl.forEach(l => l.exercises.forEach(e => {
    const contribs = getMuscleContributions(e.name);
    const exoType = getExoType(e.name);
    if (exoType === 'cardio' || exoType === 'cardio_stairs') {
      subVol['Cardio'] = (subVol['Cardio'] || 0) + (e.sets || 1);
      return;
    }
    contribs.forEach(c => {
      const key = c.muscle;
      subVol[key] = (subVol[key] || 0) + (e.sets || 1) * c.coeff;
    });
  }));

  // Group by parent
  const PARENTS = ['Jambes','Dos','Pecs','Épaules','Bras','Abdos','Cardio'];
  const COLORS = { Jambes:'#32D74B', Dos:'#FF9F0A', Pecs:'#0A84FF', Épaules:'#BF5AF2', Bras:'#64D2FF', Abdos:'#FF453A', Cardio:'#FF6B00' };
  const parentTotals = {};
  const parentSubs = {};
  PARENTS.forEach(p => { parentTotals[p] = 0; parentSubs[p] = {}; });

  Object.entries(subVol).forEach(([sub, vol]) => {
    const parent = getMuscleGroupParent(sub);
    if (!parentTotals.hasOwnProperty(parent)) return;
    parentTotals[parent] += vol;
    if (parent === sub || sub === 'Cardio') return; // no sub-breakdown for Cardio or if sub===parent
    parentSubs[parent][sub] = (parentSubs[parent][sub] || 0) + vol;
  });

  // 4-week evolution (by parent)
  const now = Date.now(); const week = 7*86400000;
  const weeks = [
    { label:'S-3', start:now-4*week, end:now-3*week },
    { label:'S-2', start:now-3*week, end:now-2*week },
    { label:'S-1', start:now-2*week, end:now-week },
    { label:'Sem.', start:now-week, end:now }
  ];
  const weeklyData = weeks.map(w => {
    const wd = {};
    PARENTS.forEach(p => wd[p] = 0);
    db.logs.filter(l => l.timestamp >= w.start && l.timestamp <= w.end).forEach(l => l.exercises.forEach(e => {
      const exoType = getExoType(e.name);
      if (exoType === 'cardio' || exoType === 'cardio_stairs') { wd['Cardio'] += (e.sets || 1); return; }
      getMuscleContributions(e.name).forEach(c => {
        const p = getMuscleGroupParent(c.muscle);
        if (wd.hasOwnProperty(p)) wd[p] += (e.sets || 1) * c.coeff;
      });
    }));
    return wd;
  });

  const maxVal = Math.max(...PARENTS.map(p => parentTotals[p] || 0), 1);
  const listEl = document.getElementById('muscleList');
  if (!listEl) return;

  if (!db.logs.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:24px 0;color:var(--sub);font-size:13px;">Importe des séances pour voir<br>la répartition musculaire.</div>';
    return;
  }

  listEl.innerHTML = PARENTS.map((grp, gi) => {
    const total = Math.round((parentTotals[grp] || 0) * 10) / 10;
    const pct = Math.round((total / maxVal) * 100);
    const color = COLORS[grp] || '#86868B';
    const mgId = 'mg-' + gi;

    // Sub-groups
    const subs = Object.entries(parentSubs[grp] || {}).sort((a, b) => b[1] - a[1]);
    const subMax = subs.length ? Math.max(...subs.map(s => s[1]), 1) : 1;
    const subsHtml = subs.map(([sub, vol]) => {
      const sv = Math.round(vol * 10) / 10;
      const sp = Math.round((vol / subMax) * 100);
      return '<div class="mg-sub-row">' +
        '<span class="mg-sub-name">' + sub + '</span>' +
        '<div class="mg-sub-bar-bg"><div class="mg-sub-bar-fill" style="width:' + sp + '%;background:' + color + ';opacity:0.7;"></div></div>' +
        '<span class="mg-sub-count" style="color:' + color + ';">' + sv + 's</span></div>';
    }).join('');

    // Weekly evolution
    const weekMaxAll = Math.max(...weeklyData.map(wd => wd[grp] || 0), 1);
    const weekCells = weeklyData.map((wd, wi) => {
      const wv = Math.round((wd[grp] || 0) * 10) / 10;
      const h = Math.round((wv / weekMaxAll) * 20);
      return '<div class="mg-week"><div class="mg-week-bar-area"><div class="mg-week-bar" style="height:' + Math.max(h, 2) + 'px;background:' + color + ';opacity:' + (wi === 3 ? '1' : '0.4') + '"></div></div>' +
        '<div class="mg-week-lbl">' + weeks[wi].label + '</div>' +
        '<div class="mg-week-val" style="color:' + (wv > 0 ? color : 'var(--sub)') + ';">' + (wv || '—') + '</div></div>';
    }).join('');

    return '<div class="mg-card">' +
      '<div class="mg-head" onclick="toggleMgCard(\'' + mgId + '\')">' +
        '<div class="mg-head-row">' +
          '<span class="mg-name"><span class="mg-dot" style="background:' + color + ';"></span>' + grp + '</span>' +
          '<span class="mg-count" style="color:' + color + ';">' + total + 's <span class="mg-chev" id="chev-' + mgId + '">▾</span></span>' +
        '</div>' +
        '<div class="mg-bar-bg"><div class="mg-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
      '</div>' +
      '<div class="mg-body" id="' + mgId + '">' +
        (subsHtml ? '<div class="mg-subs">' + subsHtml + '</div>' : '') +
        '<div class="mg-weeks" style="padding:10px 16px 12px;">' + weekCells + '</div>' +
      '</div></div>';
  }).join('');
}

function toggleMgCard(id) {
  const body = document.getElementById(id);
  if (!body) return;
  body.classList.toggle('open');
  const chev = document.getElementById('chev-' + id);
  if (chev) chev.classList.toggle('open', body.classList.contains('open'));
}

function renderReports(period) {
  period=period||'week';setPeriodButtons('reportButtons',period);
  const rl=getLogsInRange(period==='week'?7:30);
  let tv=0,ts=0;rl.forEach(l=>{tv+=l.volume;l.exercises.forEach(e=>ts+=e.sets);});
  document.getElementById('reportDisplay').innerHTML='<div class="report-box"><div class="report-val">'+rl.length+'</div><div class="report-label">Séances</div></div><div class="report-box"><div class="report-val">'+ts+'</div><div class="report-label">Séries</div></div><div class="report-box"><div class="report-val">'+(tv/1000).toFixed(1)+'t</div><div class="report-label">Volume</div></div><div class="report-box"><div class="report-val">'+(rl.length>0?Math.round(ts/rl.length):0)+'</div><div class="report-label">Séries/Séance</div></div>';
}

// ============================================================
// SETTINGS
// ============================================================
function updateProfile() {
  const name = document.getElementById('inputName').value.trim();
  const bw   = parseFloat(document.getElementById('inputBW').value) || 0;
  if (name) db.user.name = name;
  db.user.bw = bw;
  saveDB(); renderDash();
}
function saveProfileSettings() {
  // Nom + poids de corps
  const name = document.getElementById('inputName').value.trim();
  const bw   = parseFloat(document.getElementById('inputBW').value) || 0;
  if (name) db.user.name = name;
  if (bw > 0) db.user.bw = bw;
  // Niveau (déjà sauvé en live via updateProfileField, mais on s'assure)
  const lvlEl = document.getElementById('settingsLevel');
  if (lvlEl) db.user.level = lvlEl.value;
  // Nutrition
  const kcal = parseFloat(document.getElementById('inputKcalBase').value);
  const bwBase = parseFloat(document.getElementById('inputBWBase').value);
  if (kcal > 0) db.user.kcalBase = kcal;
  if (bwBase > 0) db.user.bwBase = bwBase;
  saveDB();
  renderDash();
  showToast('✓ Profil sauvegardé');
}
function fullReset() { showModal('⚠️ Toutes les données seront effacées.','Effacer','var(--red)',()=>{db=defaultDB();saveDBNow();refreshUI();showToast('✓ Réinitialisé');}); }

// ============================================================
// MIGRATION & CLEANUP
// ============================================================
function cleanupExistingLogs() {
  let changed=false;
  db.logs.forEach(log=>{
    const before=log.exercises.length;
    log.exercises=log.exercises.filter(e=>!SESSION_NAME_BLACKLIST.test(e.name.toLowerCase()));
    if(log.exercises.length!==before)changed=true;
    log.exercises.forEach(exo=>{
      const exoType=getExoType(exo.name);exo.exoType=exoType;
      if(!exo.repRecords){exo.repRecords={};changed=true;}
      if(exo.series&&exo.series.length>0){exo.series.forEach(s=>{if(!s.weight||!s.reps)return;const rKey=String(s.reps);if(!exo.repRecords[rKey]||s.weight>exo.repRecords[rKey]){exo.repRecords[rKey]=s.weight;changed=true;}const rm=calcE1RM(s.weight,s.reps);if(rm>(exo.maxRM||0)){exo.maxRM=rm;changed=true;}});}

      // ── Migration allSets : reconstruire depuis series[] et/ou repRecords{} ──
      if (!exo.allSets || !Array.isArray(exo.allSets)) {
        exo.allSets = [];
        // Priorité à series[] si elle a plus de données
        const fromSeries = (exo.series && exo.series.length > 0) ? exo.series : [];
        const fromRepRecords = exo.repRecords ? Object.entries(exo.repRecords) : [];
        if (fromSeries.length >= fromRepRecords.length && fromSeries.length > 0) {
          fromSeries.forEach(s => {
            if (s.weight > 0 || s.reps > 0) exo.allSets.push({ weight: s.weight || 0, reps: s.reps || 0, setType: 'normal', rpe: null });
          });
        } else if (fromRepRecords.length > 0) {
          fromRepRecords.forEach(([rKey, w]) => {
            const r = parseInt(rKey);
            if (w > 0 && r > 0) exo.allSets.push({ weight: w, reps: r, setType: 'normal', rpe: null });
          });
        }
        changed = true;
      }

      // ── Repair e1RM coherence: if e1rm > 0 but repRecords empty, reconstruct ──
      if ((exo.maxRM || 0) > 0 && exo.repRecords && Object.keys(exo.repRecords).length === 0) {
        // Try to reconstruct from allSets or series
        const source = (exo.allSets && exo.allSets.length > 0) ? exo.allSets : (exo.series || []);
        source.forEach(s => {
          const w = s.weight || 0, r = s.reps || 0;
          if (w > 0 && r > 0) {
            const rKey = String(r);
            if (!exo.repRecords[rKey] || w > exo.repRecords[rKey]) exo.repRecords[rKey] = w;
          }
        });
        if (Object.keys(exo.repRecords).length > 0) changed = true;
      }

      if(exoType==='reps'&&!exo.isReps){exo.isReps=true;changed=true;}
      if(exoType==='time'&&!exo.isTime){exo.isTime=true;changed=true;}
      if((exoType==='cardio'||exoType==='cardio_stairs')&&!exo.isCardio){exo.isCardio=true;changed=true;}
      if(exoType==='reps'){
        // Repair corrupted maxReps from local exercise data only (avoid O(n²) nested scan)
        let trueMax=0;
        if(exo.series&&exo.series.length>0){exo.series.forEach(s=>{if((s.reps||0)>trueMax)trueMax=s.reps;});}
        if(exo.repRecords){Object.keys(exo.repRecords).forEach(k=>{const r=parseInt(k);if(r>trueMax)trueMax=r;});}
        if(trueMax===0&&(exo.sets||0)>1&&(exo.totalReps||0)>0&&(exo.maxReps||0)>=(exo.totalReps||0)){
          const estimated=Math.ceil(exo.totalReps/exo.sets);
          if(estimated>trueMax)trueMax=estimated;
        }
        if(trueMax===0&&(exo.sets||0)>1&&(exo.totalReps||0)>0&&(exo.maxReps||0)===exo.totalReps){
          const estimated=Math.ceil(exo.totalReps/exo.sets);
          if(estimated>trueMax)trueMax=estimated;
        }
        if(trueMax>0&&trueMax<(exo.maxReps||0)){exo.maxReps=trueMax;changed=true;}
        else if(trueMax===0&&(exo.maxReps||0)>25){exo.maxReps=20;changed=true;}
      }
      if(exoType==='time'){if(exo.series&&exo.series.length>0){exo.series.forEach(s=>{const t=s.reps||0;if(t>1&&t<3600&&t>(exo.maxTime||0)){exo.maxTime=t;changed=true;}});}}
    });
  });
  if(changed)saveDB();
}

// ============================================================
// CSV IMPORT
// ============================================================
let csvParsedData = null;

function previewCSV(input) {
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=e.target.result;const result=parseCSVData(text);
    if(!result){document.getElementById('csvPreview').style.display='block';document.getElementById('csvPreview').innerHTML='<span style="color:var(--red);">❌ Format non reconnu. Vérifie que le séparateur est le point-virgule (;).</span>';document.getElementById('csvImportBtn').disabled=true;return;}
    csvParsedData=result;const preview=document.getElementById('csvPreview');preview.style.display='block';
    const existingDates=new Set(db.logs.map(l=>l.shortDate));const newSessions=result.sessions.filter(s=>!existingDates.has(s.shortDate));
    preview.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;"><div style="text-align:center;"><div style="font-size:18px;font-weight:800;color:var(--purple);">'+result.sessions.length+'</div><div>Séances</div></div><div style="text-align:center;"><div style="font-size:18px;font-weight:800;color:var(--green);">'+newSessions.length+'</div><div>Nouvelles</div></div><div style="text-align:center;"><div style="font-size:18px;font-weight:800;color:var(--blue);">'+result.totalRows+'</div><div>Séries</div></div></div><div style="font-size:11px;color:var(--sub);">Période : '+result.dateMin+' → '+result.dateMax+'</div>'+(newSessions.length<result.sessions.length?'<div style="font-size:11px;color:var(--orange);margin-top:4px;">⚠️ '+(result.sessions.length-newSessions.length)+' séance(s) déjà importée(s) — ignorées.</div>':'');
    document.getElementById('csvImportBtn').disabled=newSessions.length===0;
    if(newSessions.length===0)document.getElementById('csvImportBtn').textContent='Tout est déjà importé';
  };
  reader.readAsText(file,'UTF-8');
}

// ── Parser CSV RFC 4180 (gère les champs entre guillemets) ───
function parseCSVRow(line, sep) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i+1] === '"') { cur += '"'; i++; } // guillemet échappé ""
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') { inQ = true; }
      else if (c === sep) { fields.push(cur.trim()); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// ── Parser de dates françaises Hevy (format CSV) ────────────
// Format : "29 mars 2026, 14:50" ou "1 juil. 2025, 16:02"
function parseHevyCSVDate(raw) {
  const MOIS = {
    'janvier':1,'fevrier':2,'février':2,'fevr':2,'févr':2,
    'mars':3,'avril':4,'mai':5,'juin':6,
    'juillet':7,'juil':7,'aout':8,'août':8,
    'septembre':9,'sept':9,'octobre':10,'oct':10,
    'novembre':11,'nov':11,'decembre':12,'décembre':12,'dec':12,'déc':12
  };
  // Normaliser : retirer les points d'abréviation, mettre en minuscules sans accents
  const norm = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,'').trim();
  const m = norm.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [,d,mo,y,h,min] = m;
  const month = MOIS[mo.trim()];
  if (!month) return null;
  return new Date(parseInt(y), month-1, parseInt(d), parseInt(h), parseInt(min), 0).getTime();
}

// ── Parser CSV natif Hevy ────────────────────────────────────
function parseHevyCSV(text) {
  const rawLines = text.split('\n');
  if (rawLines.length < 2) return null;

  const header = parseCSVRow(rawLines[0], ',');
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const idx = {};
  header.forEach((h,i) => { idx[norm(h)] = i; });

  const iTitle  = idx['title'];
  const iStart  = idx['start_time'];
  const iExo    = idx['exercise_title'];
  const iType   = idx['set_type'];
  const iWeight = idx['weight_kg'];
  const iReps   = idx['reps'];
  const iDist   = idx['distance_km'];
  const iDur    = idx['duration_seconds'];
  const iRpe    = idx['rpe'];

  if (iExo === undefined || iWeight === undefined || iStart === undefined) return null;

  const sessMap = new Map(); // key: title||start_time
  let totalRows = 0;
  let dateMin = '99/99/9999', dateMax = '01/01/1900';

  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    const cols = parseCSVRow(line, ',');

    const title  = (cols[iTitle]  || '').trim();
    const start  = (cols[iStart]  || '').trim();
    const exoN   = (cols[iExo]    || '').trim();
    const setType= (cols[iType]   || 'normal').trim().toLowerCase();
    const wkg    = parseFloat(cols[iWeight]) || 0;
    const reps   = parseInt(cols[iReps])     || 0;
    const distKm = parseFloat(cols[iDist])   || 0;
    const durSec = parseFloat(cols[iDur])    || 0;
    const rpe    = parseFloat(cols[iRpe])    || 0;

    if (!exoN || !start) continue;
    totalRows++;

    const key = title + '||' + start;
    if (!sessMap.has(key)) sessMap.set(key, { title, start, rows: [] });
    sessMap.get(key).rows.push({ exoN, setType, wkg, reps, distKm, durSec, rpe });
  }

  const sessions = [];
  for (const [, v] of sessMap) {
    const ts = parseHevyCSVDate(v.start);
    if (!ts) continue;

    const d  = new Date(ts);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = d.getFullYear();
    const shortDate = dd+'/'+mm+'/'+yy;

    if (shortDate < dateMin) dateMin = shortDate;
    if (shortDate > dateMax) dateMax = shortDate;

    const session = {
      date: v.start, shortDate, timestamp: ts, volume: 0,
      title: v.title, type: '', day: DAYS_FULL[d.getDay()],
      id: generateId(), exercises: []
    };

    // Grouper par exercice
    const exoMap = new Map();
    for (const row of v.rows) {
      if (!exoMap.has(row.exoN)) exoMap.set(row.exoN, []);
      exoMap.get(row.exoN).push(row);
    }

    for (const [exoName, sets] of exoMap) {
      const exoType = getExoType(exoName);
      const isCardio = exoType === 'cardio' || exoType === 'cardio_stairs';
      const isTime   = exoType === 'time';
      const isReps   = exoType === 'reps';

      const exo = {
        name: exoName,
        muscleGroup: getMuscleGroup(exoName),
        exoType, isCardio, isTime, isReps,
        maxRM: 0, maxRMDate: null,
        maxReps: 0, maxRepsDate: null,
        totalReps: 0, maxTime: 0, distance: 0,
        sets: 0, repRecords: {}, series: [], allSets: [], _rawSets: []
      };

      for (const s of sets) {
        // warmup, dropset, failure : comptent dans le volume mais PAS dans les records
        const isWarmup  = s.setType === 'warmup';
        const isDrop    = s.setType === 'dropset';
        const isFailure = s.setType === 'failure';
        const countForRecord = !isWarmup && !isDrop && !isFailure;
        const _csvSetType = isWarmup ? 'warmup' : isDrop ? 'drop' : isFailure ? 'failure' : 'normal';
        exo.allSets.push({ weight: s.wkg || 0, reps: s.reps || 0, setType: _csvSetType, rpe: s.rpe || null });
        if (countForRecord && s.wkg > 0 && s.reps > 0 && !isCardio && !isTime) exo._rawSets.push({weight: s.wkg, reps: s.reps});

        if (isCardio) {
          if (s.distKm > exo.distance) exo.distance = s.distKm;
          if (s.durSec > exo.maxTime)  { exo.maxTime = s.durSec; exo.cardioDate = ts; }
          if (s.distKm > 0) session.volume += s.distKm * 1000;
        } else if (isTime) {
          session.volume += s.durSec / 10;
          if (s.durSec > exo.maxTime) { exo.maxTime = s.durSec; exo.maxTimeDate = ts; }
        } else if (isReps) {
          // BW ou lest (poids optionnel)
          if (countForRecord) {
            exo.totalReps += s.reps;
            if (s.reps > exo.maxReps) { exo.maxReps = s.reps; exo.maxRepsDate = ts; }
            if (s.wkg > 0) {
              session.volume += s.wkg * s.reps;
              const rm = calcE1RM(s.wkg, s.reps);
              if (rm > exo.maxRM) { exo.maxRM = rm; exo.maxRMDate = ts; }
              const rKey = String(s.reps);
              if (!exo.repRecords[rKey] || s.wkg > exo.repRecords[rKey]) exo.repRecords[rKey] = s.wkg;
            }
            exo.sets++;
          } else {
            // warmup/drop/failure : tonnage mais pas records
            if (s.wkg > 0) session.volume += s.wkg * s.reps;
          }
        } else {
          // Exercice avec poids (weight)
          // Toujours compter dans le tonnage
          if (s.wkg > 0 && s.reps > 0) session.volume += s.wkg * s.reps;
          if (countForRecord && s.wkg > 0 && s.reps > 0) {
            exo.sets++;
            const rKey = String(s.reps);
            if (!exo.repRecords[rKey] || s.wkg > exo.repRecords[rKey]) exo.repRecords[rKey] = s.wkg;
            const existing = exo.series.find(x => x.reps === s.reps);
            if (existing) { if (s.wkg > existing.weight) { existing.weight = s.wkg; existing.date = ts; } }
            else exo.series.push({ weight: s.wkg, reps: s.reps, date: ts });
            const rm = calcE1RM(s.wkg, s.reps);
            if (rm > exo.maxRM) { exo.maxRM = rm; exo.maxRMDate = ts; }
          } else if (!countForRecord && s.wkg > 0) {
            // warmup léger : quand même dans le tonnage (déjà ajouté ci-dessus)
          }
        }
      }

      if (exo.maxRM > 0 || exo.isCardio || exo.maxTime > 0 || exo.maxReps > 0 || exo.sets > 0)
        session.exercises.push(exo);
    }

    // Estimer la durée si non fournie (~2 min par série, incluant repos)
    if (!session.duration) {
      var totalSets = 0;
      session.exercises.forEach(function(ex) { totalSets += (ex.allSets || ex.series || []).length; });
      if (totalSets > 0) session.duration = totalSets * 120; // 2 min/série en secondes
    }

    if (session.exercises.length > 0) sessions.push(session);
  }

  sessions.sort((a, b) => b.timestamp - a.timestamp);
  return { sessions, totalRows, dateMin, dateMax };
}

function parseCSVData(text) {
  const lines=text.split('\n').filter(l=>l.trim());if(lines.length<2)return null;
  // Détection format Hevy natif
  const firstLine=lines[0];
  const hNorm=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/"/g,'').trim();
  const hCols=firstLine.split(',').map(hNorm);
  if(hCols.includes('exercise_title')&&hCols.includes('weight_kg')&&hCols.includes('start_time')){
    return parseHevyCSV(text);
  }
  const header=lines[0];const sep=header.includes(';')?';':',';
  const cols=header.split(sep).map(c=>c.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  const iDate=cols.findIndex(c=>c==='date');const iSeance=cols.findIndex(c=>c.includes('seance')||c.includes('séance'));
  const iExo=cols.findIndex(c=>c.includes('exercice'));const iPoids=cols.findIndex(c=>c.includes('poids'));
  const iReps=cols.findIndex(c=>c==='reps');const iDist=cols.findIndex(c=>c.includes('distance')||c.includes('dist'));
  const iDuree=cols.findIndex(c=>c.includes('duree')||c.includes('durée')||c.includes('dur'));
  if(iDate===-1||iExo===-1)return null;
  const sessionsMap=new Map();let totalRows=0,dateMin='99/99/9999',dateMax='01/01/1900';
  for(let i=1;i<lines.length;i++){
    const row=lines[i].split(sep);if(row.length<3)continue;
    const dateRaw=(row[iDate]||'').trim();const seance=(iSeance>=0?row[iSeance]:'').trim();
    const exo=(row[iExo]||'').trim();if(!dateRaw||!exo)continue;
    const poids=parseFloat((row[iPoids]||'').replace(',','.'))||0;const reps=parseInt(row[iReps]||'')||0;
    const dist=parseFloat((row[iDist]||'').replace(',','.'))||0;const duree=parseFloat((row[iDuree]||'').replace(',','.'))||0;
    const key=dateRaw+'||'+seance;if(!sessionsMap.has(key))sessionsMap.set(key,{dateRaw,seance,rows:[]});
    sessionsMap.get(key).rows.push({exo,poids,reps,dist,duree});totalRows++;
    if(dateRaw<dateMin)dateMin=dateRaw;if(dateRaw>dateMax)dateMax=dateRaw;
  }
  const sessions=[];for(const[,v]of sessionsMap){const session=buildSessionFromCSV(v.dateRaw,v.seance,v.rows);if(session)sessions.push(session);}
  sessions.sort((a,b)=>b.timestamp-a.timestamp);
  return{sessions,totalRows,dateMin,dateMax};
}

function buildSessionFromCSV(dateRaw, seanceName, rows) {
  const parts=dateRaw.split('/');if(parts.length!==3)return null;
  const ts=new Date(parseInt(parts[2]),parseInt(parts[1])-1,parseInt(parts[0]),12,0,0).getTime();if(isNaN(ts))return null;
  const titleParts=seanceName.split(' - ');const title=titleParts[0].trim();const type=titleParts[1]?titleParts[1].trim():'';
  const session={date:dateRaw,shortDate:dateRaw,timestamp:ts,volume:0,exercises:[],id:generateId(),title,type,day:DAYS_FULL[new Date(ts).getDay()]};
  const exoMap=new Map();for(const row of rows){if(!exoMap.has(row.exo))exoMap.set(row.exo,[]);exoMap.get(row.exo).push(row);}
  for(const[exoName,sets]of exoMap){
    const exoType=getExoType(exoName);const isCardio=exoType==='cardio'||exoType==='cardio_stairs';const isTime=exoType==='time';const isReps=exoType==='reps';
    const exo={name:exoName,exoType,isCardio,isTime,isReps,maxRM:0,maxReps:0,totalReps:0,maxTime:0,distance:0,sets:0,repRecords:{},series:[],allSets:[],_rawSets:[]};
    for(const s of sets){
      exo.sets++;
      if(isCardio){const distKm=s.dist>0?s.dist/1000:0;if(distKm>exo.distance)exo.distance=distKm;if(s.duree>exo.maxTime){exo.maxTime=s.duree;exo.cardioDate=ts;}}
      else if(isTime){if(s.duree>exo.maxTime){exo.maxTime=s.duree;exo.maxTimeDate=ts;}session.volume+=s.duree/10;}
      else if(isReps){exo.totalReps+=s.reps;if(s.reps>exo.maxReps){exo.maxReps=s.reps;exo.maxRepsDate=ts;}if(s.poids>0){session.volume+=s.poids*s.reps;const rm=calcE1RM(s.poids,s.reps);if(rm>exo.maxRM){exo.maxRM=rm;exo.maxRMDate=ts;}const rKey=String(s.reps);if(!exo.repRecords[rKey]||s.poids>exo.repRecords[rKey])exo.repRecords[rKey]=s.poids;}exo.allSets.push({weight:s.poids||0,reps:s.reps||0,setType:'normal',rpe:null});}
      else{const w=s.poids,r=s.reps;exo.allSets.push({weight:w||0,reps:r||0,setType:'normal',rpe:null});if(w>0&&r>0){exo._rawSets.push({weight:w,reps:r});session.volume+=w*r;const rKey=String(r);if(!exo.repRecords[rKey]||w>exo.repRecords[rKey])exo.repRecords[rKey]=w;const ex=exo.series.find(x=>x.reps===r);if(ex){if(w>ex.weight){ex.weight=w;ex.date=ts;}}else exo.series.push({weight:w,reps:r,date:ts});const rm=calcE1RM(w,r);if(rm>exo.maxRM){exo.maxRM=rm;exo.maxRMDate=ts;}}}
    }
    if(exo.maxRM>0||exo.isCardio||exo.maxTime>0||exo.maxReps>0||exo.sets>0)session.exercises.push(exo);
  }
  // Estimer la durée (~2 min par série)
  if (!session.duration) {
    var totalSets = 0;
    session.exercises.forEach(function(ex) { totalSets += (ex.allSets || ex.series || []).length; });
    if (totalSets > 0) session.duration = totalSets * 120;
  }
  return session.exercises.length>0?session:null;
}

async function importCSV() {
  if(!csvParsedData)return;
  const btn=document.getElementById('csvImportBtn');btn.disabled=true;btn.textContent='Import en cours...';
  const progress=document.getElementById('csvProgress');const bar=document.getElementById('csvProgressBar');const txt=document.getElementById('csvProgressText');progress.style.display='block';
  const existingDates=new Set(db.logs.map(l=>l.shortDate));const newSessions=csvParsedData.sessions.filter(s=>!existingDates.has(s.shortDate));
  let imported=0,prs={bench:0,squat:0,deadlift:0};
  for(const session of newSessions){
    // Nettoyer les _rawSets temporaires avant de sauvegarder (allSets est conservé)
    session.exercises.forEach(exo=>{ delete exo._rawSets; });
    session.exercises.forEach(exo=>{const type=getSBDType(exo.name);if(type&&exo.maxRM&&exo.maxRM>prs[type])prs[type]=exo.maxRM;});
    db.logs.push(session);imported++;
    if(imported%10===0||imported===newSessions.length){const pct=Math.round((imported/newSessions.length)*100);bar.style.width=pct+'%';txt.textContent=imported+' / '+newSessions.length+' séances importées';await new Promise(r=>setTimeout(r,0));}
  }
  db.logs.sort((a,b)=>b.timestamp-a.timestamp);saveDBNow();
  bar.style.width='100%';txt.textContent='✓ '+imported+' séances importées !';btn.textContent='✓ Importé';showToast('✓ '+imported+' séances importées');
  const prSummary=Object.entries(prs).filter(([,v])=>v>0).map(([k,v])=>k.toUpperCase()+' : '+v+'kg').join(' · ');
  if(prSummary){showToast('🏆 PRs : '+prSummary);var _bestPR=Object.entries(prs).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);if(_bestPR.length>0){var _t=_bestPR[0][0],_n=_t==='bench'?'Développé couché':_t==='squat'?'Squat':'Soulevé de terre';setTimeout(function(){showPRCelebration(_n,_bestPR[0][1],0);},500);}}
  // Vérifier les records suspects après import CSV
  const suspectCount = Object.values(getSuspiciousRecordsSummary()).length;
  if (suspectCount > 0) {
    setTimeout(() => showToast('⚠️ ' + suspectCount + ' record' + (suspectCount>1?'s':'') + ' suspect' + (suspectCount>1?'s':'') + ' détecté' + (suspectCount>1?'s':'') + ' — vérifie dans Réglages → Correction des Records'), 1500);
  }
  refreshUI();csvParsedData=null;
}

function getSuspiciousRecordsSummary() {
  const exoMap = {};
  const histByName = {};
  db.logs.forEach(log => {
    log.exercises.forEach(exo => {
      if (!exo.maxRM || exo.maxRM <= 0) return;
      if (!exoMap[exo.name] || exo.maxRM > exoMap[exo.name].maxRM) {
        exoMap[exo.name] = { name: exo.name, maxRM: exo.maxRM };
      }
      if (!histByName[exo.name]) histByName[exo.name] = [];
      histByName[exo.name].push(exo.maxRM);
    });
  });
  const suspects = {};
  Object.values(exoMap).forEach(r => {
    const hist = histByName[r.name];
    if (!hist || hist.length < 3) return;
    const s = [...hist].sort((a, b) => a - b);
    const q3 = s[Math.floor(s.length * 0.75)];
    const iqr = (q3 - s[Math.floor(s.length * 0.25)]) || q3 * 0.15;
    const median = s[Math.floor(s.length / 2)];
    if (r.maxRM > q3 + 2 * iqr && r.maxRM > median * 1.4) suspects[r.name] = r;
  });
  return suspects;
}

// ============================================================
// ============================================================
// ============================================================
// PROGRAMME V2 — Mode Lecture + Édition (drag & drop)
// ============================================================
var _pgmEditMode = false;
var _pgmOriginalDays = null;

function renderProgrammeV2() {
  var container = document.getElementById('programmeV2Content');
  if (!container) return;

  var wp = db.weeklyPlan;
  if (!wp || !wp.days || !wp.days.length) {
    container.innerHTML = '';
    return;
  }

  var now = new Date();
  var todayIdx = (now.getDay() + 6) % 7; // 0=Lundi, 6=Dimanche
  var dayLabels = ['L', 'M', 'Me', 'J', 'V', 'Sa', 'Di'];

  // Determine which days are done this week
  var weekStart = new Date(now);
  weekStart.setDate(now.getDate() - todayIdx);
  weekStart.setHours(0, 0, 0, 0);
  var doneDays = new Set();
  if (db.logs) {
    db.logs.forEach(function(log) {
      var d = new Date(log.timestamp || log.date);
      if (d >= weekStart && d <= now) {
        var dIdx = (d.getDay() + 6) % 7;
        doneDays.add(dIdx);
      }
    });
  }

  var h = '';

  // Header
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
  h += '<div style="font-size:16px;font-weight:800;color:var(--text);">📅 Programme Semaine' + (wp.week ? ' ' + wp.week : '') + '</div>';
  if (!_pgmEditMode) {
    h += '<button onclick="startPgmEdit()" style="background:var(--surface);border:1px solid var(--border);color:var(--blue);padding:8px 14px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;">Modifier le planning</button>';
  }
  h += '</div>';

  // Edit mode bar
  if (_pgmEditMode) {
    h += '<div class="pgm-edit-bar">';
    h += '<button onclick="savePgmEdit()" style="background:var(--green);border:none;color:#000;font-weight:700;">✓ Enregistrer</button>';
    h += '<button onclick="cancelPgmEdit()" style="background:var(--surface);border:1px solid var(--border);color:var(--sub);">Annuler</button>';
    h += '<button onclick="resetPgmEdit()" style="background:rgba(255,69,58,0.1);border:1px solid rgba(255,69,58,0.3);color:var(--red);">↺ Réinitialiser</button>';
    h += '</div>';
    h += '<div style="font-size:11px;color:var(--sub);margin-bottom:10px;text-align:center;">Glisse-dépose les jours pour réorganiser ta semaine</div>';
  }

  // Day cards
  h += '<div class="pgm-days" id="pgmDaysContainer">';
  wp.days.forEach(function(day, idx) {
    var isDone = doneDays.has(idx);
    var isToday = idx === todayIdx;
    var isRest = day.rest;
    var stateClass = isRest ? 'rest' : isDone ? 'done' : isToday ? 'today' : '';
    var badgeClass = isRest ? 'rest-badge' : isDone ? 'done' : isToday ? 'today' : 'upcoming';
    var statusClass = isRest ? 'rest-status' : isDone ? 'done' : isToday ? 'today' : 'upcoming';
    var statusText = isRest ? '— Repos' : isDone ? '✓ Fait' : isToday ? '← Aujourd\'hui' : 'À venir';
    var exos = day.exercises || [];
    var exoCount = exos.length;
    var estDuration = exoCount * 8; // ~8min per exercise estimate

    h += '<div class="pgm-day ' + stateClass + '" data-day-idx="' + idx + '"' +
      (_pgmEditMode ? ' draggable="true" ondragstart="pgmDragStart(event,' + idx + ')" ondragend="pgmDragEnd(event)" ondragover="pgmDragOver(event)" ondragleave="pgmDragLeave(event)" ondrop="pgmDrop(event,' + idx + ')"' : '') + '>';
    h += '<div class="pgm-day-header">';
    h += '<div class="pgm-day-badge ' + badgeClass + '">' + dayLabels[idx] + '</div>';
    h += '<div class="pgm-day-info">';
    h += '<div class="pgm-day-title">' + (day.title || (isRest ? '😴 Repos' : 'Séance')) + '</div>';
    if (!isRest) h += '<div class="pgm-day-sub">' + exoCount + ' exercice' + (exoCount > 1 ? 's' : '') + (estDuration > 0 ? ' · ~' + estDuration + 'min' : '') + '</div>';
    h += '</div>';
    h += '<div class="pgm-day-status ' + statusClass + '">' + statusText + '</div>';
    h += '</div>';

    // Today: show first 3 exercises + GO button
    if (isToday && !isRest && !_pgmEditMode && exos.length > 0) {
      h += '<div class="pgm-today-exos">';
      exos.slice(0, 3).forEach(function(exo) {
        var detail = '';
        if (exo.weight && exo.sets && exo.reps) {
          detail = exo.weight + 'kg · ' + exo.sets + '×' + exo.reps;
        } else if (exo.sets && exo.reps) {
          detail = exo.sets + '×' + exo.reps;
        } else if (exo.sets) {
          detail = exo.sets + ' séries';
        }
        h += '<div class="pgm-today-exo"><span class="pgm-today-exo-name">' + (exo.name || exo.exercise || '') + '</span><span class="pgm-today-exo-detail">' + detail + '</span></div>';
      });
      if (exos.length > 3) h += '<div style="font-size:11px;color:var(--sub);padding:2px 0;">+' + (exos.length - 3) + ' exercices</div>';
      h += '<button class="pgm-go-btn" onclick="showSeancesSub(\'seances-go\',document.querySelector(\'.stats-sub-pill:nth-child(2)\'))">GO 💪</button>';
      h += '</div>';
    }

    h += '</div>';
  });
  h += '</div>';

  container.innerHTML = h;
}

function startPgmEdit() {
  _pgmEditMode = true;
  _pgmOriginalDays = JSON.parse(JSON.stringify(db.weeklyPlan.days));
  renderProgrammeV2();
}

function cancelPgmEdit() {
  if (_pgmOriginalDays) db.weeklyPlan.days = _pgmOriginalDays;
  _pgmEditMode = false;
  _pgmOriginalDays = null;
  renderProgrammeV2();
}

async function savePgmEdit() {
  _pgmEditMode = false;
  _pgmOriginalDays = null;
  saveDB();
  renderProgrammeV2();
  if (typeof syncToCloud === 'function') syncToCloud(true);
  showToast('✓ Planning sauvegardé');
}

function resetPgmEdit() {
  if (!db.weeklyPlan) return;
  if (db.weeklyPlan.original) {
    db.weeklyPlan.days = JSON.parse(JSON.stringify(db.weeklyPlan.original));
    renderProgrammeV2();
    showToast('Planning réinitialisé');
  } else {
    showToast('Pas de plan original disponible');
  }
}

// Drag & Drop handlers
function pgmDragStart(e, idx) {
  e.dataTransfer.setData('text/plain', idx.toString());
  e.target.classList.add('dragging');
}

function pgmDragEnd(e) {
  e.target.classList.remove('dragging');
}

function pgmDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function pgmDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function pgmDrop(e, toIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  var fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
  if (isNaN(fromIdx) || fromIdx === toIdx) return;
  pgmSwapDays(fromIdx, toIdx);
}

function pgmSwapDays(a, b) {
  var days = db.weeklyPlan.days;
  if (!days || !days[a] || !days[b]) return;
  // Swap content, keep day label
  var tmpTitle = days[a].title;
  var tmpExos = days[a].exercises;
  var tmpRest = days[a].rest;
  var tmpNote = days[a].coachNote;
  days[a].title = days[b].title;
  days[a].exercises = days[b].exercises;
  days[a].rest = days[b].rest;
  days[a].coachNote = days[b].coachNote;
  days[b].title = tmpTitle;
  days[b].exercises = tmpExos;
  days[b].rest = tmpRest;
  days[b].coachNote = tmpNote;
  renderProgrammeV2();
}

// PROGRAMME BUILDER — Guided + Manual paths
// ============================================================
var _pbState = null;

function renderProgramBuilder() {
  var container = document.getElementById('programBuilderContent');
  if (!container) return;

  // Si un programme existe déjà (généré OU manuel OU routine), afficher la vue programme
  var hasProgram = (db.generatedProgram && db.generatedProgram.length > 0) ||
                   (db.manualProgram && db.manualProgram.dayNames && db.manualProgram.dayNames.length > 0) ||
                   (db.routine && Object.keys(db.routine).length > 0);
  if (hasProgram && !_pbState) {
    renderProgramBuilderView(container);
    return;
  }

  // Si le builder est en cours, afficher l'étape courante
  if (_pbState) {
    renderProgramBuilderStep(container);
    return;
  }

  // Écran de choix initial
  var h = '<div style="text-align:center;padding:20px 0;">';
  h += '<div style="font-size:48px;margin-bottom:16px;">📅</div>';
  h += '<div style="font-size:20px;font-weight:700;margin-bottom:8px;">Comment tu veux créer ton programme ?</div>';
  h += '<div style="font-size:13px;color:var(--sub);margin-bottom:24px;line-height:1.6;">Choisis ta méthode préférée. Tu pourras tout modifier après.</div>';

  // Option 1 : Guidé
  h += '<div class="card" style="text-align:left;cursor:pointer;border:1px solid rgba(10,132,255,0.3);margin-bottom:12px;" onclick="pbStartGuided()">';
  h += '<div style="display:flex;align-items:center;gap:12px;">';
  h += '<div style="font-size:32px;">🤖</div>';
  h += '<div><div style="font-size:15px;font-weight:700;">L\'appli me guide</div>';
  h += '<div style="font-size:12px;color:var(--sub);margin-top:4px;line-height:1.5;">Réponds à quelques questions et on te propose un programme adapté. Tu pourras tout modifier après.</div></div>';
  h += '</div></div>';

  // Option 2 : Manuel
  h += '<div class="card" style="text-align:left;cursor:pointer;border:1px solid rgba(255,159,10,0.3);" onclick="pbStartManual()">';
  h += '<div style="display:flex;align-items:center;gap:12px;">';
  h += '<div style="font-size:32px;">🛠️</div>';
  h += '<div><div style="font-size:15px;font-weight:700;">Je construis moi-même</div>';
  h += '<div style="font-size:12px;color:var(--sub);margin-top:4px;line-height:1.5;">Choisis ton split, tes exercices, et organise tout comme tu veux. On te donnera des suggestions en chemin.</div></div>';
  h += '</div></div>';

  h += '</div>';
  container.innerHTML = h;
}

function pbStartGuided() {
  _pbState = { mode: 'guided', step: 1, days: 4, goal: 'hypertrophie', equipment: ['barbell','dumbbell','machine','cable'], duration: 60, level: db.user.level || 'intermediaire' };
  renderProgramBuilder();
}

function pbStartManual() {
  _pbState = { mode: 'manual', step: 1, days: 4, split: 'ppl', dayNames: [], dayExercises: {} };
  renderProgramBuilder();
}

function renderProgramBuilderStep(container) {
  var s = _pbState;
  var h = '';

  if (s.mode === 'guided') {
    var totalSteps = 5;
    // Progress bar
    h += '<div style="display:flex;gap:4px;margin-bottom:20px;">';
    for (var i = 1; i <= totalSteps; i++) {
      h += '<div style="flex:1;height:4px;border-radius:2px;background:' + (i <= s.step ? 'var(--accent)' : 'rgba(255,255,255,0.1)') + ';"></div>';
    }
    h += '</div>';

    if (s.step === 1) {
      h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Combien de jours par semaine ?</div>';
      h += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">';
      for (var d = 2; d <= 6; d++) {
        h += '<button onclick="_pbState.days=' + d + ';_pbState.step=2;renderProgramBuilder();" class="day-btn' + (s.days === d ? ' active' : '') + '" style="width:50px;height:50px;font-size:18px;font-weight:700;">' + d + '</button>';
      }
      h += '</div>';
    } else if (s.step === 2) {
      h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Quel objectif principal ?</div>';
      var goals = [
        { id: 'force', label: 'Force', desc: 'Devenir plus fort sur les mouvements de base', icon: '🏋️' },
        { id: 'hypertrophie', label: 'Hypertrophie', desc: 'Prendre du volume musculaire', icon: '💪' },
        { id: 'mixte', label: 'Mixte', desc: 'Force + volume, le meilleur des deux', icon: '⚡' },
        { id: 'remise_en_forme', label: 'Remise en forme', desc: 'Retrouver la forme et la santé', icon: '🌱' }
      ];
      goals.forEach(function(g) {
        var sel = s.goal === g.id ? 'border-color:var(--accent);background:rgba(10,132,255,0.08);' : '';
        h += '<div class="card" style="cursor:pointer;' + sel + '" onclick="_pbState.goal=\'' + g.id + '\';_pbState.step=3;renderProgramBuilder();">';
        h += '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:24px;">' + g.icon + '</span>';
        h += '<div><div style="font-weight:700;">' + g.label + '</div><div style="font-size:12px;color:var(--sub);">' + g.desc + '</div></div></div></div>';
      });
    } else if (s.step === 3) {
      h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Quel équipement as-tu ?</div>';
      var equips = [
        { id: 'barbell', label: 'Barre + rack', icon: '🏋️' },
        { id: 'dumbbell', label: 'Haltères', icon: '💪' },
        { id: 'machine', label: 'Machines', icon: '⚙️' },
        { id: 'cable', label: 'Câbles', icon: '🔗' },
        { id: 'bodyweight', label: 'Poids de corps', icon: '🤸' }
      ];
      h += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      equips.forEach(function(eq) {
        var sel = s.equipment.indexOf(eq.id) >= 0;
        h += '<button onclick="pbToggleEquip(\'' + eq.id + '\')" class="day-btn' + (sel ? ' active' : '') + '" style="padding:10px 14px;font-size:13px;">' + eq.icon + ' ' + eq.label + '</button>';
      });
      h += '</div>';
      h += '<button class="btn" style="margin-top:20px;" onclick="_pbState.step=4;renderProgramBuilder();">Continuer →</button>';
    } else if (s.step === 4) {
      h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Combien de temps par séance ?</div>';
      var durations = [30, 45, 60, 75, 90];
      h += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">';
      durations.forEach(function(d) {
        h += '<button onclick="_pbState.duration=' + d + ';_pbState.step=5;renderProgramBuilder();" class="day-btn' + (s.duration === d ? ' active' : '') + '" style="padding:10px 16px;font-size:13px;">' + d + 'min</button>';
      });
      h += '</div>';
    } else if (s.step === 5) {
      h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Niveau d\'expérience ?</div>';
      var levels = [
        { id: 'debutant', label: 'Débutant', desc: 'Moins de 6 mois', icon: '🌱' },
        { id: 'intermediaire', label: 'Intermédiaire', desc: '6 mois à 2 ans', icon: '📈' },
        { id: 'avance', label: 'Avancé', desc: '2+ ans', icon: '🔥' }
      ];
      levels.forEach(function(l) {
        var sel = s.level === l.id ? 'border-color:var(--accent);background:rgba(10,132,255,0.08);' : '';
        h += '<div class="card" style="cursor:pointer;' + sel + '" onclick="_pbState.level=\'' + l.id + '\';pbGenerateProgram();">';
        h += '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:24px;">' + l.icon + '</span>';
        h += '<div><div style="font-weight:700;">' + l.label + '</div><div style="font-size:12px;color:var(--sub);">' + l.desc + '</div></div></div></div>';
      });
    }

    // Back button
    if (s.step > 1) {
      h += '<button onclick="_pbState.step--;renderProgramBuilder();" style="background:none;border:none;color:var(--accent);font-size:13px;cursor:pointer;padding:10px;margin-top:10px;">← Retour</button>';
    } else {
      h += '<button onclick="_pbState=null;renderProgramBuilder();" style="background:none;border:none;color:var(--sub);font-size:13px;cursor:pointer;padding:10px;margin-top:10px;">← Annuler</button>';
    }
  }

  if (s.mode === 'manual') {
    if (s.step === 1) {
      h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Combien de jours ?</div>';
      h += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">';
      for (var d = 2; d <= 6; d++) {
        h += '<button onclick="_pbState.days=' + d + ';_pbState.step=2;renderProgramBuilder();" class="day-btn' + (s.days === d ? ' active' : '') + '" style="width:50px;height:50px;font-size:18px;font-weight:700;">' + d + '</button>';
      }
      h += '</div>';
      h += '<button onclick="_pbState=null;renderProgramBuilder();" style="background:none;border:none;color:var(--sub);font-size:13px;cursor:pointer;padding:10px;margin-top:10px;">← Annuler</button>';
    } else if (s.step === 2) {
      h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Quel split ?</div>';
      var splits = [
        { id: 'ppl', label: 'PPL (Push/Pull/Legs)', desc: 'Classique pour 3-6 jours' },
        { id: 'upper_lower', label: 'Upper / Lower', desc: 'Idéal pour 4 jours' },
        { id: 'full_body', label: 'Full Body', desc: 'Parfait pour 2-3 jours' },
        { id: 'bro_split', label: 'Bro Split', desc: '1 muscle par jour, 5-6 jours' },
        { id: 'custom', label: 'Custom', desc: 'Nomme chaque jour toi-même' }
      ];
      splits.forEach(function(sp) {
        var sel = s.split === sp.id ? 'border-color:var(--accent);background:rgba(10,132,255,0.08);' : '';
        h += '<div class="card" style="cursor:pointer;' + sel + '" onclick="_pbState.split=\'' + sp.id + '\';pbSetupDays();renderProgramBuilder();">';
        h += '<div><div style="font-weight:700;">' + sp.label + '</div><div style="font-size:12px;color:var(--sub);">' + sp.desc + '</div></div></div>';
      });
      h += '<button onclick="_pbState.step=1;renderProgramBuilder();" style="background:none;border:none;color:var(--accent);font-size:13px;cursor:pointer;padding:10px;">← Retour</button>';
    } else if (s.step === 3) {
      // Build each day
      h += '<div style="font-size:18px;font-weight:700;margin-bottom:16px;">Organise tes jours</div>';
      for (var i = 0; i < s.dayNames.length; i++) {
        var dayName = s.dayNames[i];
        var exos = s.dayExercises[dayName] || [];
        h += '<div class="card" style="margin-bottom:10px;">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        h += '<div style="font-weight:700;font-size:14px;">' + dayName + '</div>';
        h += '<span style="font-size:11px;color:var(--sub);">' + exos.length + ' exo' + (exos.length > 1 ? 's' : '') + '</span>';
        h += '</div>';
        exos.forEach(function(exoName, ei) {
          var exoLabel = typeof exoName === 'string' ? exoName : (exoName && exoName.name) || 'Exercice';
          h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:13px;">';
          h += '<span>' + exoLabel + '</span>';
          h += '<button onclick="pbRemoveExo(\'' + dayName.replace(/'/g, "\\'") + '\',' + ei + ')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;">✕</button>';
          h += '</div>';
        });
        h += '<button onclick="pbAddExoToDay(\'' + dayName.replace(/'/g, "\\'") + '\')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;padding:6px 0;">+ Ajouter un exercice</button>';
        h += '</div>';
      }
      h += '<button class="btn" style="margin-top:10px;" onclick="pbSaveManualProgram()">💾 Sauvegarder le programme</button>';
      h += '<button onclick="_pbState.step=2;renderProgramBuilder();" style="background:none;border:none;color:var(--accent);font-size:13px;cursor:pointer;padding:10px;display:block;margin-top:8px;">← Retour</button>';
    }
  }

  container.innerHTML = h;
}

function pbToggleEquip(eqId) {
  var idx = _pbState.equipment.indexOf(eqId);
  if (idx >= 0) _pbState.equipment.splice(idx, 1);
  else _pbState.equipment.push(eqId);
  renderProgramBuilder();
}

function pbSetupDays() {
  var s = _pbState;
  var dayTemplates = {
    ppl: function(n) { var base = ['Push', 'Pull', 'Legs']; var r = []; for (var i = 0; i < n; i++) r.push(base[i % 3]); return r; },
    upper_lower: function(n) { var base = ['Upper', 'Lower']; var r = []; for (var i = 0; i < n; i++) r.push(base[i % 2]); return r; },
    full_body: function(n) { var r = []; for (var i = 0; i < n; i++) r.push('Full Body ' + String.fromCharCode(65 + i)); return r; },
    bro_split: function(n) { var base = ['Pecs', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Accessoires']; return base.slice(0, n); },
    custom: function(n) { var r = []; for (var i = 0; i < n; i++) r.push('Jour ' + (i + 1)); return r; }
  };
  s.dayNames = (dayTemplates[s.split] || dayTemplates.custom)(s.days);
  s.dayExercises = {};
  s.dayNames.forEach(function(d) { s.dayExercises[d] = []; });
  s.step = 3;
}

function pbAddExoToDay(dayName) {
  var exoName = prompt('Nom de l\'exercice :');
  if (exoName && exoName.trim()) {
    if (!_pbState.dayExercises[dayName]) _pbState.dayExercises[dayName] = [];
    _pbState.dayExercises[dayName].push(exoName.trim());
    renderProgramBuilder();
  }
}

function pbRemoveExo(dayName, idx) {
  if (_pbState.dayExercises[dayName]) {
    _pbState.dayExercises[dayName].splice(idx, 1);
    renderProgramBuilder();
  }
}

function pbSaveManualProgram() {
  var s = _pbState;
  var routine = {};
  var allDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  s.dayNames.forEach(function(dayName, i) {
    if (i < allDays.length) {
      routine[allDays[i]] = dayName;
    }
  });
  db.routine = routine;
  // Aussi sauvegarder les exercices de chaque jour
  db.manualProgram = { dayNames: s.dayNames, dayExercises: s.dayExercises };
  // Aussi sauvegarder dans routineExos pour que le bouton GO fonctionne
  if (!db.routineExos) db.routineExos = {};
  s.dayNames.forEach(function(dayName, i) {
    if (i < allDays.length) {
      db.routineExos[allDays[i]] = s.dayExercises[dayName] || [];
    }
  });
  _pbState = null;
  saveDBNow();
  console.log('Programme manuel sauvegardé:', { routine: db.routine, manualProgram: db.manualProgram, routineExos: db.routineExos });
  showToast('Programme sauvegardé !');
  renderProgramBuilder();
}

function pbGenerateProgram() {
  var s = _pbState;
  // Utiliser le générateur existant
  var goalMap = { force: 'force', hypertrophie: 'masse', mixte: 'force', remise_en_forme: 'bien_etre' };
  var goals = [{ id: goalMap[s.goal] || 'force' }];
  var mat = s.equipment;

  // Sauvegarder les paramètres dans le profil
  db.user.level = s.level;
  db.user.trainingFreq = s.days;
  db.user.trainingDuration = s.duration;
  db.user.trainingGoal = s.goal;
  db.user.equipment = s.equipment;

  // Appeler le générateur existant si disponible
  try {
    // Simuler les variables globales d'onboarding
    window.obSelectedDays = { 2: ['Lundi', 'Jeudi'], 3: ['Lundi', 'Mercredi', 'Vendredi'], 4: ['Lundi', 'Mardi', 'Jeudi', 'Vendredi'], 5: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'], 6: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] }[s.days] || ['Lundi', 'Mercredi', 'Vendredi'];
    var result = generateProgram(goals, s.days, mat, s.duration, [], [], null, null, s.level);
    if (result && result.length > 0) {
      db.generatedProgram = result;
      // Also create routine map
      var routine = {};
      result.forEach(function(d) { routine[d.day] = d.isRest ? '😴 Repos' : (d.label || d.day); });
      db.routine = routine;
    }
  } catch(e) {
    console.error('Program generation error:', e);
    showToast('Erreur lors de la génération');
  }

  // Aussi sauvegarder les exercices par jour dans routineExos pour le bouton GO
  if (db.generatedProgram) {
    if (!db.routineExos) db.routineExos = {};
    db.generatedProgram.forEach(function(d) {
      if (!d.isRest && d.exercises) {
        db.routineExos[d.day] = d.exercises.map(function(e) { return typeof e === 'string' ? e : (e && e.name) || 'Exercice'; });
      }
    });
  }

  _pbState = null;
  saveDBNow();
  console.log('Programme généré sauvegardé:', { routine: db.routine, generatedProgram: db.generatedProgram, routineExos: db.routineExos });
  showToast('Programme généré !');
  renderProgramBuilder();
}

function renderProgramBuilderView(container) {
  if (!container) return;
  var mode = (db.user && db.user.trainingMode) || 'powerlifting';

  // Header commun avec bouton Modifier
  var headerHtml = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'+
    '<div style="font-size:18px;font-weight:700;">📅 Programme</div>'+
    '<button onclick="pbEditExisting()" style="background:var(--surface);border:1px solid var(--border);color:var(--accent);padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-weight:600;">Modifier le planning</button>'+
  '</div>';

  var modeHtml = '';
  if (mode === 'powerbuilding') {
    modeHtml = renderProgramPowerbuilding();
  } else if (mode === 'musculation' || mode === 'bodybuilding') {
    modeHtml = renderProgramMusculation();
  } else if (mode === 'bien_etre' || mode === 'bien-etre') {
    modeHtml = renderProgramBienEtre();
  } else {
    modeHtml = renderProgramPowerlifting();
  }

  var footerHtml = '<div style="display:flex;gap:8px;margin-top:10px;">'+
    '<button class="btn" style="flex:1;background:var(--red);font-size:13px;" onclick="pbResetProgram()">Réinitialiser</button>'+
  '</div>';

  container.innerHTML = headerHtml + modeHtml + footerHtml;

  if (mode === 'powerbuilding') setTimeout(pbSliderInit, 50);
  setTimeout(function() {
    if (typeof initProgDragDrop === 'function') initProgDragDrop();
  }, 100);
}

function initProgDragDrop() {
  var rows = document.querySelectorAll('.prog-day-row[draggable="true"]');
  var dragSrc = null;

  rows.forEach(function(row) {
    row.addEventListener('dragstart', function(e) {
      dragSrc = this;
      this.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.dataset.day);
    });
    row.addEventListener('dragend', function() {
      this.style.opacity = '1';
      document.querySelectorAll('.prog-day-row').forEach(function(r) {
        r.classList.remove('drag-over');
      });
    });
    row.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.prog-day-row').forEach(function(r) { r.classList.remove('drag-over'); });
      this.classList.add('drag-over');
      return false;
    });
    row.addEventListener('drop', function(e) {
      e.stopPropagation();
      if (dragSrc !== this) {
        var srcDay = e.dataTransfer.getData('text/plain');
        var dstDay = this.dataset.day;
        progSwapDays(srcDay, dstDay);
      }
      return false;
    });
  });
}

function progSwapDays(srcDay, dstDay) {
  if (!srcDay || !dstDay || srcDay === dstDay) return;
  var routine = typeof getRoutine === 'function' ? getRoutine() : (db.routine || {});

  // Swap dans routine
  var tmp = routine[srcDay];
  routine[srcDay] = routine[dstDay];
  routine[dstDay] = tmp;
  db.routine = routine;

  // Swap dans weeklyPlan.days
  if (db.weeklyPlan && db.weeklyPlan.days) {
    var srcWp = db.weeklyPlan.days.find(function(d){ return d.day === srcDay; });
    var dstWp = db.weeklyPlan.days.find(function(d){ return d.day === dstDay; });
    if (srcWp && dstWp) {
      var tmpExos = srcWp.exercises; var tmpTitle = srcWp.title; var tmpNote = srcWp.coachNote; var tmpRest = srcWp.rest;
      srcWp.exercises = dstWp.exercises; srcWp.title = dstWp.title; srcWp.coachNote = dstWp.coachNote; srcWp.rest = dstWp.rest;
      dstWp.exercises = tmpExos; dstWp.title = tmpTitle; dstWp.coachNote = tmpNote; dstWp.rest = tmpRest;
    }
  }

  if (typeof saveDB === 'function') saveDB();
  if (typeof syncToCloud === 'function') syncToCloud(true);
  renderProgramBuilderView(document.getElementById('programBuilderContent'));
  showToast('✅ ' + srcDay + ' ↔ ' + dstDay);
}

// ── PROGRAMME — MODE POWERBUILDING ──
function renderProgramPowerbuilding() {
  var accentPct = (db.user && db.user.pbAccent) || 65;
  var sliderHtml = '<div class="card" style="margin-bottom:10px;">'+
    '<div style="font-size:12px;font-weight:700;margin-bottom:4px;">Équilibre du cycle</div>'+
    '<div class="pb-slider-labels"><span style="color:var(--purple);">💪 Volume</span>'+
    '<span id="pb-pct-lbl" style="color:var(--sub);font-size:10px;">'+accentPct+'% force</span>'+
    '<span style="color:var(--accent);">⚡ Force</span></div>'+
    '<div class="pb-slider-track" id="pb-track">'+
      '<div class="pb-slider-fill" id="pb-fill" style="width:'+accentPct+'%;"></div>'+
      '<div class="pb-slider-thumb" id="pb-thumb" style="left:calc('+accentPct+'% - 11px);"></div>'+
    '</div>'+
    '<div id="pb-reco" style="font-size:10px;color:var(--sub);padding:8px 10px;background:rgba(10,132,255,.05);border:1px solid rgba(10,132,255,.12);border-radius:9px;line-height:1.5;">'+
      pbGetRecoText(accentPct)+
    '</div>'+
  '</div>';

  return sliderHtml + renderProgDaysList();
}

function pbGetRecoText(pct) {
  if (pct >= 70) return '<strong>Accent Force ('+pct+'%) :</strong> composé en 3-4 reps @ 85-90% 1RM, back-off sets × 3 @ 80%, accessoires en 8-12 reps.';
  if (pct >= 45) return '<strong>Équilibre ('+pct+'%) :</strong> composé en 4-6 reps @ 78-83%, accessoires en 10-15 reps. Zone optimale powerbuilding.';
  return '<strong>Accent Volume ('+pct+'%) :</strong> composé en 6-8 reps @ 72-75%, accessoires en 15-20 reps. Phase d\'accumulation.';
}

function pbSliderInit() {
  var track = document.getElementById('pb-track');
  var fill = document.getElementById('pb-fill');
  var thumb = document.getElementById('pb-thumb');
  var lbl = document.getElementById('pb-pct-lbl');
  var reco = document.getElementById('pb-reco');
  if (!track || !fill || !thumb) return;
  var dragging = false;

  function setVal(pct) {
    pct = Math.max(10, Math.min(90, pct));
    fill.style.width = pct+'%';
    thumb.style.left = 'calc('+pct+'% - 11px)';
    if (lbl) lbl.textContent = Math.round(pct)+'% force';
    if (reco) reco.innerHTML = pbGetRecoText(Math.round(pct));
    if (!db.user) db.user = {};
    db.user.pbAccent = Math.round(pct);
    if (typeof saveDB === 'function') saveDB();
  }

  track.addEventListener('click', function(e) {
    var r = track.getBoundingClientRect();
    setVal(((e.clientX-r.left)/r.width)*100);
  });
  thumb.addEventListener('mousedown', function(){ dragging=true; });
  thumb.addEventListener('touchstart', function(){ dragging=true; }, {passive:true});
  document.addEventListener('mouseup', function(){ dragging=false; });
  document.addEventListener('touchend', function(){ dragging=false; });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var r = track.getBoundingClientRect();
    setVal(((e.clientX-r.left)/r.width)*100);
  });
  document.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    var r = track.getBoundingClientRect();
    setVal(((e.touches[0].clientX-r.left)/r.width)*100);
  }, {passive:true});
}

// ── PROGRAMME — MODE MUSCULATION ──
function renderProgramMusculation() {
  var mode = (db.user && db.user.trainingMode) || 'musculation';
  var freq = (db.user && db.user.programParams && db.user.programParams.frequency) || 4;

  var recSplit = typeof recommendSplit === 'function' ? recommendSplit(mode, freq) : null;
  var allSplits = typeof getAllSplitsForMode === 'function' ? getAllSplitsForMode(mode) : {};

  var splitChips = Object.keys(allSplits).map(function(days) {
    var s = allSplits[days];
    var isRec = recSplit && s.split === recSplit.split;
    var isCur = db.user && db.user.selectedSplit === s.split;
    var cls = isCur ? ' active' : '';
    return '<button class="prog-split-chip'+cls+'" onclick="progSelectSplit(\''+s.split+'\','+days+')">'+
      (isRec ? '⭐ ' : '')+s.label+
    '</button>';
  }).join('');

  var splitBar = splitChips ? '<div class="prog-split-bar">'+splitChips+'</div>' : '';
  return splitBar + renderProgDaysList();
}

// ── PROGRAMME — MODE POWERLIFTING ──
function renderProgramPowerlifting() {
  var currentWeek = (db.user && db.user.programParams && db.user.programParams.currentWeek) || 6;
  var hasCompet = !!(db.user && db.user.programParams && db.user.programParams.competitionDate);

  var gridCells = '';
  for (var w = 1; w <= 12; w++) {
    var isCur = w === currentWeek;
    var isDone = w < currentWeek;
    var inComp = w >= 11;
    var bg = isDone ? 'rgba(50,215,75,.15)' : isCur ? 'var(--accent)' : inComp ? 'rgba(191,90,242,.15)' : 'rgba(255,69,58,.12)';
    var color = isDone ? 'var(--green)' : isCur ? '#fff' : inComp ? 'var(--purple)' : 'rgba(255,69,58,.8)';
    var label = (w===5||w===10) ? 'D' : (w===4||w===9) ? 'P' : String(w);
    gridCells += '<div class="prog-pl-cell'+(isCur?' current selected':isDone?' done':'')+'" '+
      'style="background:'+bg+';color:'+color+';" onclick="progPLSelectWeek('+w+')">'+label+'</div>';
  }
  var gridHtml = '<div class="card" style="margin-bottom:10px;">'+
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--sub);margin-bottom:8px;">'+
      '12 semaines · <span id="pl-sel-lbl">Semaine '+currentWeek+'</span>'+
    '</div>'+
    '<div class="prog-pl-grid" style="grid-template-columns:repeat(12,1fr);">'+gridCells+'</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">'+
      '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--sub);"><div style="width:8px;height:8px;border-radius:2px;background:rgba(50,215,75,.4);"></div>Terminée</div>'+
      '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--sub);"><div style="width:8px;height:8px;border-radius:2px;background:var(--accent);"></div>Cette sem.</div>'+
      '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--sub);">P = Peak · D = Deload</div>'+
    '</div>'+
  '</div>';

  var competDate = (db.user && db.user.programParams && db.user.programParams.competitionDate) || '';
  var competHtml = '<div class="card" style="margin-bottom:10px;">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:'+(hasCompet?'10':'0')+'px;">'+
      '<div style="font-size:13px;font-weight:700;">🏆 Compétition / Test max</div>'+
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">'+
        '<input type="checkbox" id="pl-has-compet" '+(hasCompet?'checked':'')+' onchange="progToggleCompet(this.checked)" style="width:16px;height:16px;">'+
        '<span style="font-size:12px;color:var(--sub);">Activer</span>'+
      '</label>'+
    '</div>'+
    (hasCompet ? '<input type="date" id="pl-compet-date" value="'+competDate+'" onchange="progSetCompetDate(this.value)" style="width:100%;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;">' : '')+
  '</div>';

  return gridHtml + competHtml + renderProgDaysList();
}

// ── PROGRAMME — MODE BIEN-ÊTRE ──
function renderProgramBienEtre() {
  var streak = 0;
  var intention = (db.user && db.user.weekIntention) || 'Clique sur ✏️ pour définir ton intention de la semaine';
  var heroHtml = '<div class="be-prog-hero">'+
    '<div class="be-prog-ico">🌿</div>'+
    '<div class="be-prog-title">Intention de la semaine <span onclick="beEditIntention()" style="font-size:14px;cursor:pointer;opacity:.5;">✏️</span></div>'+
    '<div class="be-prog-sub">'+intention+'</div>'+
    '<div class="be-prog-stats">'+
      '<div class="be-prog-stat"><div class="be-prog-stat-val" style="color:var(--green);">🔥 '+streak+'</div><div class="be-prog-stat-lbl">Jours actifs</div></div>'+
      '<div class="be-prog-stat"><div class="be-prog-stat-val" style="color:var(--teal);">4</div><div class="be-prog-stat-lbl">Objectif sem.</div></div>'+
    '</div>'+
  '</div>';

  return heroHtml + renderProgBienEtreDays();
}

// ── PLANNING JOURS MODIFIABLE ──
function renderProgDaysList() {
  // Source : weeklyPlan (données enrichies) prioritaire sur generatedProgram
  var wpDays = (db.weeklyPlan && db.weeklyPlan.days) ? db.weeklyPlan.days : [];
  var routine = typeof getRoutine === 'function' ? getRoutine() : {};
  var today = typeof DAYS_FULL !== 'undefined' ? DAYS_FULL[new Date().getDay()] : '';
  var allDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  var rowsHtml = allDays.map(function(day) {
    var label = routine[day] || '';
    var isRest = !label || /repos/i.test(label);
    var isToday = day === today;
    var dayShort = day.substring(0,3);

    // Chercher dans weeklyPlan.days
    var wpDay = wpDays.find(function(d) { return d.day === day; });
    var exos = [];
    if (wpDay && wpDay.exercises && wpDay.exercises.length) {
      exos = wpDay.exercises.map(function(e) {
        return typeof e === 'string' ? e : (e && e.name) || 'Exercice';
      });
    }

    if (isRest) {
      return '<div class="prog-day-row rest">' +
        '<span class="prog-drag-handle" style="opacity:.1;">⠿</span>' +
        '<div class="prog-day-label' + (isToday ? ' today' : '') + '">' + dayShort + '</div>' +
        '<div class="prog-day-content"><div class="prog-day-name" style="color:var(--sub);">Repos</div></div>' +
        '<div class="prog-day-actions"><div class="prog-action-btn" style="color:var(--green);font-size:10px;" onclick="pbEditExisting()">+</div></div>' +
      '</div>';
    }

    var title = (wpDay && wpDay.title) ? wpDay.title : label;
    var exoStr = exos.slice(0,3).join(' · ') + (exos.length > 3 ? ' +' + (exos.length - 3) : '');
    var coachNote = (wpDay && wpDay.coachNote) ? wpDay.coachNote : '';
    var setsCount = (wpDay && wpDay.exercises) ? wpDay.exercises.reduce(function(s, e) {
      return s + ((e.sets && e.sets.filter(function(ss) { return !ss.isWarmup; }).length) || 0);
    }, 0) : 0;
    var metaStr = exos.length + ' exo' + (exos.length > 1 ? 's' : '') + (setsCount > 0 ? ' · ' + setsCount + ' séries' : '');

    return '<div class="prog-day-row' + (isToday ? ' today' : '') + '" draggable="true" data-day="' + day + '">' +
      '<span class="prog-drag-handle">⠿</span>' +
      '<div class="prog-day-label' + (isToday ? ' today' : '') + '">' + dayShort + '</div>' +
      '<div class="prog-day-content" onclick="progShowDayDetail(\'' + day + '\')" style="cursor:pointer;">' +
        '<div class="prog-day-name">' + title + '</div>' +
        (exoStr ? '<div class="prog-day-exos">' + exoStr + '</div>' : '') +
        (coachNote ? '<div style="font-size:9px;color:var(--orange);margin-top:3px;">💡 ' + coachNote + '</div>' : '') +
      '</div>' +
      '<div class="prog-day-actions">' +
        '<div class="prog-action-btn" onclick="event.stopPropagation();progEditDay(\'' + day + '\')">✏️</div>' +
        '<div class="prog-action-btn danger" onclick="event.stopPropagation();progConfirmRemoveDay(\'' + day + '\')">×</div>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="prog-planning">' +
    '<div class="prog-planning-head">' +
      '<div class="prog-planning-title">Semaine type</div>' +
      '<span class="prog-planning-add" onclick="pbEditExisting()">+ Modifier</span>' +
    '</div>' +
    rowsHtml +
  '</div>';
}

// ── PLANNING BIEN-ÊTRE ──
function renderProgBienEtreDays() {
  var today = DAYS_FULL[new Date().getDay()];
  var routine = getRoutine();
  var allDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  var ACTIVITIES = [
    {key:'cardio',ico:'🏃',label:'Cardio',color:'var(--green)',borderColor:'rgba(50,215,75,.2)'},
    {key:'yoga',ico:'🧘',label:'Yoga',color:'var(--teal)',borderColor:'rgba(100,210,255,.2)'},
    {key:'renfo',ico:'💪',label:'Renfo',color:'var(--purple)',borderColor:'rgba(191,90,242,.2)'},
    {key:'velo',ico:'🚴',label:'Cardio',color:'var(--green)',borderColor:'rgba(50,215,75,.2)'}
  ];

  var rowsHtml = allDays.map(function(day) {
    var label = routine[day] || '';
    var isRest = !label || /repos/i.test(label);
    var isToday = day === today;
    var dayShort = day.substring(0,3);
    var lowLabel = label.toLowerCase();
    var act = ACTIVITIES.find(function(a){ return lowLabel.indexOf(a.key)>=0 || lowLabel.indexOf(a.label.toLowerCase())>=0; }) || null;

    if (isRest) {
      return '<div class="be-prog-act-row rest">'+
        '<span class="prog-drag-handle" style="opacity:.1;">⠿</span>'+
        '<div class="prog-day-label">'+dayShort+'</div>'+
        '<div class="be-prog-act-ico" style="background:rgba(255,255,255,.03);">😴</div>'+
        '<div class="be-prog-act-info"><div class="be-prog-act-name" style="color:var(--sub);">Repos</div></div>'+
        '<div class="be-prog-act-edit" style="color:var(--green);">+</div>'+
      '</div>';
    }

    return '<div class="be-prog-act-row'+(isToday?' today':'')+'">'+
      '<span class="prog-drag-handle">⠿</span>'+
      '<div class="prog-day-label'+(isToday?' today':'')+'">'+dayShort+'</div>'+
      '<div class="be-prog-act-ico" style="background:rgba(100,210,255,.1);">'+(act?act.ico:'🌿')+'</div>'+
      '<div class="be-prog-act-info">'+
        '<div class="be-prog-act-name">'+label+'</div>'+
        '<div class="be-prog-act-meta">'+(isToday?'Aujourd\'hui · ':'')+'45 min</div>'+
      '</div>'+
      (act?'<div class="be-prog-act-tag" style="color:'+act.color+';border-color:'+act.borderColor+';">'+act.label+'</div>':'')+
      '<div class="be-prog-act-check" style="color:'+(isToday?'var(--accent)':'var(--sub)')+';">'+(isToday?'→':'·')+'</div>'+
      '<div class="be-prog-act-edit">✏️</div>'+
    '</div>';
  }).join('');

  return '<div class="prog-planning"><div class="prog-planning-head">'+
    '<div class="prog-planning-title">Cette semaine</div>'+
    '<span class="prog-planning-add" onclick="pbEditExisting()">+ Modifier</span>'+
  '</div>'+rowsHtml+'</div>';
}

// ── HELPERS INTERACTIVITÉ ──
function progSelectSplit(splitId, days) {
  document.querySelectorAll('.prog-split-chip').forEach(function(b){ b.classList.remove('active'); });
  if (typeof event !== 'undefined' && event && event.currentTarget) event.currentTarget.classList.add('active');
  if (!db.user) db.user = {};
  db.user.selectedSplit = splitId;
  if (typeof saveDB === 'function') saveDB();
  if (typeof showToast === 'function') showToast('Split mis à jour : '+splitId);
}

function progPLSelectWeek(w) {
  document.querySelectorAll('.prog-pl-cell').forEach(function(c,i){ c.classList.toggle('selected',i===w-1); });
  var lbl = document.getElementById('pl-sel-lbl');
  if (lbl) lbl.textContent = 'Semaine '+w;
}

function progToggleCompet(checked) {
  if (!db.user) db.user = {};
  if (!db.user.programParams) db.user.programParams = {};
  if (!checked) { db.user.programParams.competitionDate = null; }
  if (typeof saveDB === 'function') saveDB();
  if (typeof renderProgramBuilderView === 'function') {
    renderProgramBuilderView(document.getElementById('programBuilderContent'));
  }
}

function progSetCompetDate(date) {
  if (!db.user) db.user = {};
  if (!db.user.programParams) db.user.programParams = {};
  db.user.programParams.competitionDate = date;
  if (typeof saveDB === 'function') saveDB();
  if (typeof showToast === 'function') showToast('Date de compétition enregistrée');
}

function progEditDay(day) { if (typeof pbEditExisting==='function') pbEditExisting(); }
function progRemoveDay(day) { if (typeof showToast==='function') showToast('Modifie le planning pour supprimer ce jour'); }
function progAddDay(day) { if (typeof pbEditExisting==='function') pbEditExisting(); }
function progShowDayDetail(day) {
  var wpDays = (db.weeklyPlan && db.weeklyPlan.days) ? db.weeklyPlan.days : [];
  var wpDay = wpDays.find(function(d) { return d.day === day; });
  if (!wpDay || !wpDay.exercises || !wpDay.exercises.length) {
    showToast('Aucun détail disponible pour ' + day);
    return;
  }

  var exosHtml = wpDay.exercises.map(function(e) {
    if (!e || !e.name) return '';
    var workSets = (e.sets || []).filter(function(s) { return !s.isWarmup; });
    var warmSets = (e.sets || []).filter(function(s) { return s.isWarmup; });
    var firstWork = workSets[0];
    var loadStr = '';
    if (firstWork) {
      if (e.type === 'cardio') {
        loadStr = (firstWork.durationMin || '?') + 'min';
      } else if (e.type === 'time') {
        loadStr = Math.round((firstWork.durationSec || 0) / 60) + 'min';
      } else if (firstWork.weight) {
        loadStr = workSets.length + '×' + firstWork.reps + ' @ ' + firstWork.weight + 'kg';
      } else {
        loadStr = workSets.length + '×' + firstWork.reps;
      }
    }
    var warmStr = warmSets.length > 0 ? ' · ' + warmSets.length + ' échauff.' : '';

    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04);">' +
      '<div style="flex:1;">' +
        '<div style="font-size:13px;font-weight:700;">' + e.name + '</div>' +
        '<div style="font-size:10px;color:var(--sub);">' + loadStr + warmStr +
          (e.restSeconds ? ' · repos ' + Math.round(e.restSeconds/60) + 'min' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  var html = '<div style="padding:4px 0;">' +
    '<div style="font-size:16px;font-weight:800;margin-bottom:4px;">' + (wpDay.title || day) + '</div>' +
    (wpDay.coachNote ? '<div style="font-size:11px;color:var(--orange);margin-bottom:12px;">💡 ' + wpDay.coachNote + '</div>' : '') +
    exosHtml +
  '</div>';

  showModal(html, 'GO 💪', 'var(--accent)', function() {
    if (typeof startTodayWorkout === 'function') startTodayWorkout();
  });
}

function progConfirmRemoveDay(day) {
  showModal('Supprimer ' + day + ' du programme ?', 'Supprimer', 'var(--red)', function() {
    if (db.weeklyPlan && db.weeklyPlan.days) {
      db.weeklyPlan.days = db.weeklyPlan.days.map(function(d) {
        if (d.day === day) return { day: day, rest: true, title: '😴 Repos Complet', exercises: [] };
        return d;
      });
      if (typeof saveDB === 'function') saveDB();
      if (typeof syncToCloud === 'function') syncToCloud(true);
      renderProgramBuilderView(document.getElementById('programBuilderContent'));
      showToast('Jour supprimé');
    }
  });
}
function beEditIntention() {
  var val = prompt('Intention de la semaine :', (db.user && db.user.weekIntention) || '');
  if (val !== null) {
    if (!db.user) db.user = {};
    db.user.weekIntention = val;
    if (typeof saveDB==='function') saveDB();
    renderProgramBuilderView(document.getElementById('programBuilderContent'));
  }
}

function pbEditExisting() {
  // Entrer en mode édition manuelle à partir du programme existant
  var routine = getRoutine();
  var allDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var dayNames = [];
  var dayExercises = {};
  allDays.forEach(function(day) {
    var label = routine[day];
    if (label && !/repos|😴/i.test(label)) {
      dayNames.push(label);
      // Récupérer les exercices existants
      var exos = (db.routineExos && db.routineExos[day]) ? db.routineExos[day] : [];
      if (!exos.length && db.generatedProgram) {
        var gp = db.generatedProgram.find(function(p) { return p.day === day && !p.isRest; });
        if (gp && gp.exercises) exos = gp.exercises.map(function(e) { return typeof e === 'string' ? e : (e && e.name) || 'Exercice'; });
      }
      dayExercises[label] = exos;
    }
  });
  _pbState = { mode: 'manual', step: 3, days: dayNames.length || 4, split: 'custom', dayNames: dayNames, dayExercises: dayExercises };
  renderProgramBuilder();
}

function pbResetProgram() {
  if (!confirm('Réinitialiser le programme ? Tu pourras en créer un nouveau.')) return;
  db.generatedProgram = null;
  db.routine = null;
  db.manualProgram = null;
  db.routineExos = null;
  saveDBNow();
  _pbState = null;
  renderProgramBuilder();
}

// PROGRAMME VIEWER + SWAP EXERCICE
// ============================================================
function renderProgramViewer() {
  const plan = db.generatedProgram;
  const card = document.getElementById('programViewerCard');
  const viewer = document.getElementById('programViewer');
  if (!plan || !plan.length) { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = 'block';
  if (!viewer) return;
  viewer.innerHTML = plan.map((d, di) => {
    if (d.isRest) {
      return '<div class="prog-day-card" style="opacity:0.45;">'+
        '<div class="prog-day-header">'+
        '<div><div class="prog-day-badge" style="background:var(--border);color:var(--sub);">'+d.day.substring(0,3)+'</div><div class="prog-day-title" style="margin-top:6px;">Repos</div></div>'+
        '</div></div>';
    }
    const exos = d.exos || [];
    return '<div class="prog-day-card">'+
      '<div class="prog-day-header" onclick="toggleProgDay('+di+')">'+
      '<div><div class="prog-day-badge">'+d.day.substring(0,3)+'</div><div class="prog-day-title" style="margin-top:6px;">'+d.label+'</div>'+
      '<div class="prog-day-sub">'+exos.length+' exercice'+(exos.length>1?'s':'')+'</div></div>'+
      '<span class="prog-day-chevron" id="prog-chev-'+di+'">▾</span></div>'+
      '<div class="prog-day-body" id="prog-body-'+di+'">'+
      exos.map((id, ei) => {
        const exoEntry = d.exosSets ? d.exosSets[ei] : null;
        const setsReps = exoEntry?.setsReps || EXO_DB[id]?.sets || '';
        const e = EXO_DB[id] || { name: id, sets:'', icon:'💪', muscle:'', alts:[] };
        return '<div class="prog-exo-row">'+
          '<span class="prog-exo-icon">'+e.icon+'</span>'+
          '<div class="prog-exo-info">'+
          '<div class="prog-exo-name">'+e.name+'</div>'+
          '<div class="prog-exo-detail">'+(setsReps||e.sets)+(e.muscle?' · '+e.muscle:'')+'</div></div>'+
          (e.alts && e.alts.length ? '<button class="prog-exo-swap" onclick="openSwap('+di+','+ei+',\''+id+'\')">↔ Remplacer</button>' : '')+
          '</div>';
      }).join('')+
      '</div></div>';
  }).join('');
}

function toggleProgDay(di) {
  const body = document.getElementById('prog-body-'+di);
  const chev = document.getElementById('prog-chev-'+di);
  if (!body) return;
  body.classList.toggle('open');
  if (chev) chev.classList.toggle('open');
}

function openSwap(dayIdx, exoIdx, currentId) {
  const exo = EXO_DB[currentId];
  if (!exo || !exo.alts || !exo.alts.length) return;
  const matIcons = { salle:'🏋️', halteres:'💪', maison:'🏠' };
  const modal = document.createElement('div');
  modal.className = 'swap-modal';
  modal.id = 'swap-modal';
  modal.innerHTML = '<div class="swap-modal-box">'+
    '<div class="swap-modal-title">Remplacer : '+exo.name+'</div>'+
    '<div class="swap-modal-sub">Même groupe musculaire · '+exo.muscle+'</div>'+
    exo.alts.map((alt, ai) => {
      const matLabel = alt.mat || 'salle';
      return '<button class="swap-alt-btn" onclick="confirmSwap('+dayIdx+','+exoIdx+',\''+currentId+'\','+ai+')">'+
        '<span class="swap-alt-icon">'+(matIcons[matLabel]||'💪')+'</span>'+
        '<div><span class="swap-alt-name">'+alt.name+'</span>'+
        '<span class="swap-alt-mat">'+matLabel+'<span class="swap-mat-badge">'+matLabel+'</span></span></div>'+
        '</button>';
    }).join('')+
    '<button onclick="closeSwap()" style="width:100%;margin-top:8px;background:none;border:none;color:var(--sub);padding:12px;cursor:pointer;font-size:13px;">Annuler</button>'+
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeSwap(); });
}

function closeSwap() {
  const m = document.getElementById('swap-modal');
  if (m) m.remove();
}

function confirmSwap(dayIdx, exoIdx, currentId, altIdx) {
  const exo = EXO_DB[currentId];
  if (!exo || !exo.alts[altIdx]) return;
  const alt = exo.alts[altIdx];
  // Créer ou réutiliser une entrée pour cet alt
  const newId = '_swap_'+dayIdx+'_'+exoIdx;
  EXO_DB[newId] = {
    name: alt.name, sets: exo.sets, mat: [alt.mat||'salle'],
    muscle: exo.muscle, icon: exo.icon,
    alts: [{ name: exo.name, mat: exo.mat[0] }, ...exo.alts.filter((_,i) => i !== altIdx)]
  };
  if (db.generatedProgram && db.generatedProgram[dayIdx]) {
    db.generatedProgram[dayIdx].exos[exoIdx] = newId;
    saveDB();
  }
  closeSwap();
  renderProgramViewer();
  showToast('✓ Exercice remplacé');
}

// ============================================================
// INIT
// ============================================================
(function init() {
  if(!db.reports)db.reports=[];
  if (typeof grantMonthlyFreeze === 'function') grantMonthlyFreeze();
  // Class quiz trigger — runs for any user without a playerClass
  db.gamification = db.gamification || {};
  if (!db.gamification.playerClass) {
    setTimeout(function() { if (typeof showClassQuiz === 'function') showClassQuiz(); }, 400);
  }
  let ns=false;
  db.logs.forEach(l=>{if(!l.id){l.id=generateId();ns=true;}});

  // Recalculer maxRM de chaque exercice depuis series/repRecords (corrige les valeurs corrompues)
  db.logs.forEach(log=>{
    log.exercises.forEach(exo=>{
      if(exo.isCardio||exo.isTime)return;
      let recalc=0;
      if(exo.series&&exo.series.length){exo.series.forEach(s=>{if(s.weight>0&&s.reps>0){const rm=calcE1RM(s.weight,s.reps);if(rm>recalc)recalc=rm;}});}
      if(exo.repRecords){Object.entries(exo.repRecords).forEach(([rKey,w])=>{if(w>0){const rm=calcE1RM(w,parseInt(rKey));if(rm>recalc)recalc=rm;}});}
      // Toujours écraser maxRM avec la valeur recalculée (même 0 si aucune donnée)
      if(exo.maxRM!==recalc){exo.maxRM=recalc;ns=true;}
    });
  });

  recalcBestPR();
  if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
  if(ns)saveDB();
  cleanupExistingLogs();
  purgeExpiredReports();
  // Compress logs older than 6 months to save storage
  if (typeof compressOldLogs === 'function') compressOldLogs();

  const today=DAYS_FULL[new Date().getDay()];
  selectedDay=today;
  document.querySelectorAll('.day-btn').forEach(b=>b.classList.toggle('active',b.dataset.day===today));

  // Pré-remplir settings
  if(db.user.name){const ni=document.getElementById('inputName');if(ni)ni.value=db.user.name;}
  document.getElementById('inputBW').value=db.user.bw||'';
  const tB=document.getElementById('tgtBench'),tS=document.getElementById('tgtSquat'),tD=document.getElementById('tgtDead');
  if(tB)tB.value=db.user.targets.bench;if(tS)tS.value=db.user.targets.squat;if(tD)tD.value=db.user.targets.deadlift;

  newPRs={bench:false,squat:false,deadlift:false};
  renderDash();
  updateCoachBadge();
  // Migration : generatedProgram
  if (!db.generatedProgram) db.generatedProgram = null;

  // Migration : re-estimer la durée des séances sans source GO réelle
  var _durMigrated = false;
  (db.logs || []).forEach(function(log) {
    if (log.durationSource === 'go') return;
    var estimated = estimateSessionDuration(log.exercises || []) * 60; // en secondes
    if (estimated > 0) { log.duration = estimated; log.durationSource = 'estimated'; _durMigrated = true; }
  });
  if (_durMigrated) saveDB();
  renderProgramViewer();

  // ONBOARDING — afficher si pas encore fait
  if(!db.user.onboarded){
    showOnboarding();
  }

  // Auth gate: show login screen if not authenticated
  checkAuthGate().then(() => {
    cloudSignIn().then(async user => {
      if (!user) return;
      if (db.logs.length === 0) {
        await syncFromCloud();
        if (typeof grantMonthlyFreeze === 'function') grantMonthlyFreeze();
        if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
        return;
      }
      if (!db.lastSync) {
        if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
        syncToCloud(true);
        return;
      }
      try {
        const {data:{user:u}} = await supaClient.auth.getUser();
        if (!u) {
          if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
          syncToCloud(true); return;
        }
        const {data, error} = await supaClient.from('sbd_profiles').select('updated_at').eq('user_id', u.id).maybeSingle();
        if (error) throw error;
        if (data && data.updated_at) {
          const cloudTs = new Date(data.updated_at).getTime();
          if (cloudTs > db.lastSync + 5000) {
            showToast('☁️ Données plus récentes sur le cloud — synchronisation…');
            await syncFromCloud();
            if (typeof grantMonthlyFreeze === 'function') grantMonthlyFreeze();
            if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
          } else {
            if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
            syncToCloud(true);
          }
        } else {
          if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
          syncToCloud(true);
        }
      } catch(e) {
        if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
        syncToCloud(true);
      }
      // Check password migration for existing magic-link users
      checkPasswordMigration(user);
      // Keep-alive ping to prevent Supabase project pause
      if (typeof keepAlive === 'function') keepAlive();
    });
  });
  // Local notifications init
  try { initNotifications(); } catch(e) {}
})();

// ============================================================
// NOTIFICATIONS LOCALES
// ============================================================
function initNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'granted') {
    _checkTrainingReminder();
    return;
  }
  if (db.logs.length < 3) return;
  Notification.requestPermission().then(function(perm) {
    if (perm === 'granted') _checkTrainingReminder();
  });
}

function sendLocalNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body: body }); } catch(e) {}
}

function _checkTrainingReminder() {
  var now = new Date();
  if (now.getHours() < 17) return;
  var today = getTodayStr();
  var alreadyTrained = db.logs.some(function(l) { return l.shortDate === today || (l.timestamp && new Date(l.timestamp).toISOString().slice(0,10) === today); });
  if (alreadyTrained) return;
  if (!isTodayTrainingDay()) return;
  var routine = getRoutine();
  var todayDay = DAYS_FULL[now.getDay()];
  var label = routine[todayDay] || 'entraînement';
  sendLocalNotification('💪 C\'est jour d\'entraînement', todayDay + ' — ' + label);
}

// ============================================================
// ONGLET CORPS
// ============================================================
function calcIPFGL(lift, bw) {
  const a=1236.25115, b=1449.21864, c=0.01644, d=2.12345;
  const denom = a - b * Math.exp(-c * Math.pow(bw, d));
  if (!denom || denom <= 0) return 0;
  return Math.round((600 / denom) * lift * 100) / 100;
}


// ── Récupération musculaire ──────────────────────────────────
function getMuscleRecoveryStatus() {
  const RECOVERY_HOURS = {
    'Jambes':72,'Quadriceps':72,'Ischio-jambiers':72,'Fessiers':72,
    'Dos':72,'Grand dorsal':72,'Haut du dos':72,
    'Pecs':48,'Pecs (haut)':48,'Pecs (bas)':48,
    'Épaules':48,'Épaules (latéral)':48,'Épaules (antérieur)':48,'Épaules (postérieur)':48,
    'Biceps':48,'Triceps':48,'Bras':48,
    'Abdos (frontal)':24,'Obliques':24,'Mollets':24,'Avant-bras':24,'Trapèzes':48,'Lombaires':72
  };
  const now = Date.now();
  const status = {};
  const recentLogs = db.logs.filter(l => l.timestamp > now - 7*86400000).sort((a,b) => b.timestamp - a.timestamp);
  const muscleLastTrained = {};
  const muscleLastVolume = {};

  recentLogs.forEach(log => {
    log.exercises.forEach(exo => {
      const muscle = getMuscleGroup(exo.name);
      const parent = getMuscleGroupParent(muscle);
      [muscle, parent].forEach(m => {
        if (!muscleLastTrained[m]) {
          muscleLastTrained[m] = log.timestamp;
          muscleLastVolume[m] = exo.sets || 0;
        }
      });
    });
  });

  Object.keys(RECOVERY_HOURS).forEach(muscle => {
    const lastTs = muscleLastTrained[muscle];
    if (!lastTs) { status[muscle] = { hoursSince:999, recoveryPct:100, isRecovered:true }; return; }
    const hoursSince = (now - lastTs) / 3600000;
    const baseRec = RECOVERY_HOURS[muscle] || 48;
    const vol = muscleLastVolume[muscle] || 0;
    const volMult = vol > 10 ? 1.3 : vol > 6 ? 1.1 : 1.0;
    const recoveryPct = Math.min(100, Math.round((hoursSince / (baseRec * volMult)) * 100));
    status[muscle] = { hoursSince: Math.round(hoursSince), recoveryPct, isRecovered: recoveryPct >= 85 };
  });
  return status;
}

function generateCoachAlgoMessage() {
  const bw=db.user.bw,bench=db.bestPR.bench,squat=db.bestPR.squat,dead=db.bestPR.deadlift;
  const logs7=getLogsInRange(7),tonnage7=logs7.reduce((s,l)=>s+l.volume,0);
  const ipf=calcIPFGLTotal(bench,squat,dead,bw);
  const tdee=calcTDEE(bw,tonnage7);
  const today=new Date().toDateString();
  const todayEntry=(db.body||[]).find(e=>new Date(e.ts).toDateString()===today);
  const kcalAuj=todayEntry?todayEntry.kcal:null,protAuj=todayEntry?todayEntry.prot:null;
  const plateaux=['bench','squat','deadlift'].map(t=>detectPlateau(t)).filter(Boolean);
  const momB=calcMomentum('bench'),momS=calcMomentum('squat'),momD=calcMomentum('deadlift');
  let sections=[];

  // ── Bloc en cours ──
  const currentBloc = db.weeklyPlan?.week || null;
  const level = db.user.level || 'intermediaire';
  var blocP = null;
  try { blocP = BLOC_PARAMS && BLOC_PARAMS[level] ? BLOC_PARAMS[level][currentBloc] : null; } catch(e) {}
  if (currentBloc && blocP) {
    let blocHtml = '<div class="ai-section-title">📅 BLOC EN COURS</div>';
    blocHtml += `Semaine ${currentBloc} — <span class="ai-highlight blue">${blocP.label || 'Progression linéaire'}</span><br>`;
    blocHtml += `RPE cible : ${blocP.rpe} · Charge : ${Math.round(blocP.loadMultiplier * 100)}% e1RM`;
    sections.push(`<div class="ai-section">${blocHtml}</div>`);
  }

  // ── Récupération musculaire ──
  const recovery = getMuscleRecoveryStatus();
  const fatigued = Object.entries(recovery).filter(([m,r]) => !r.isRecovered && r.hoursSince < 168)
    .sort((a,b) => a[1].recoveryPct - b[1].recoveryPct);
  if (fatigued.length) {
    let recHtml = '<div class="ai-section-title">💤 RÉCUPÉRATION</div>';
    fatigued.slice(0,6).forEach(([muscle, r]) => {
      const color = r.recoveryPct < 50 ? 'red' : 'orange';
      recHtml += `<span class="ai-highlight ${color}">${muscle} ${r.recoveryPct}%</span> `;
    });
    // Warning si demain tape un muscle fatigué
    const tomorrow = DAYS_FULL[(new Date().getDay() + 1) % 7];
    const tomorrowExos = getProgExosForDay(tomorrow);
    if (tomorrowExos.length) {
      const conflicting = [...new Set(tomorrowExos.map(e => getMuscleGroupParent(getMuscleGroup(e))))].filter(m => {
        const r = recovery[m]; return r && !r.isRecovered;
      });
      if (conflicting.length) {
        recHtml += `<br><span style="color:var(--orange);">⚠️ Demain (${tomorrow}) : ${conflicting.join(', ')} pas encore récupéré(s)</span>`;
      }
    }
    sections.push(`<div class="ai-section">${recHtml}</div>`);
  }
  // Force section: adapt to mode
  if (modeFeature('showSBDCards')) {
    let analyseForce=`<div class="ai-section-title">📊 FORCE</div>`;
    if (modeFeature('showIPF') && ipf>0) {
      const ipfLabel=ipf<300?'débutant':ipf<400?'intermédiaire':ipf<500?'avancé':'élite';
      analyseForce+=`Score IPF GL : <span class="ai-highlight blue">${ipf} pts</span> (niveau ${ipfLabel})<br>`;
    }
    const moms=[momB&&`Bench ${momB>0?'+':''}${momB}kg/sem`,momS&&`Squat ${momS>0?'+':''}${momS}kg/sem`,momD&&`Dead ${momD>0?'+':''}${momD}kg/sem`].filter(Boolean);
    if (moms.length) analyseForce+=`Momentum : <span class="ai-highlight ${moms.some(m=>m.includes('-'))?'orange':'green'}">${moms.join(' · ')}</span>`;
    sections.push(`<div class="ai-section">${analyseForce}</div>`);
  } else {
    // Non-SBD mode: show general training stats
    let analyseGeneral=`<div class="ai-section-title">📊 ENTRAÎNEMENT</div>`;
    analyseGeneral+=`Séances (7j) : <span class="ai-highlight blue">${logs7.length}</span> · Tonnage : <span class="ai-highlight green">${Math.round(tonnage7)}kg</span>`;
    sections.push(`<div class="ai-section">${analyseGeneral}</div>`);
  }
  if (tdee>0) {
    let nutri=`<div class="ai-section-title">🍽️ NUTRITION</div>`;
    nutri+=`TDEE estimé : <span class="ai-highlight blue">${tdee} kcal/jour</span><br>`;
    if (kcalAuj) {
      const delta=kcalAuj-tdee,color=delta>300?'orange':delta<-400?'red':'green';
      nutri+=`Aujourd'hui : <span class="ai-highlight ${color}">${delta>0?'+':''}${delta} kcal vs TDEE</span><br>`;
    }
    if (protAuj&&bw>0) {
      const ppk=Math.round((protAuj/bw)*10)/10;
      nutri+=`Protéines : <span class="ai-highlight ${ppk>=1.8?'green':'red'}">${protAuj}g (${ppk}g/kg)</span> ${ppk>=1.8?'✓':'→ cible 2g/kg'}`;
    } else if (!kcalAuj) nutri+=`<span style="color:var(--sub);font-size:12px;">Entre tes macros du jour pour l'analyse.</span>`;
    sections.push(`<div class="ai-section">${nutri}</div>`);
  }
  if (modeFeature('showPlateauDetection') && plateaux.length>0) {
    let alertes=`<div class="ai-section-title">⚠️ ALERTES</div>`;
    const sugg={bench:'Essaie Spoto Bench ou monte le volume',squat:'Variation pause squat ou fentes lestées',deadlift:'Déficit deadlift ou Romanian'};
    const _sbdNames={bench:'Bench Press (Barbell)',squat:'Squat (Barbell)',deadlift:'Deadlift (Barbell)'};
    plateaux.forEach(p=>{
      alertes+=`<div class="plateau-alert">📉 <strong>${p.type.toUpperCase()}</strong> plateau depuis ${p.sessions} séances`;
      const analysis = analyzePlateauCauses(_sbdNames[p.type]||p.type);
      if (analysis && analysis.causes.length > 0) {
        alertes+=`<div style="margin-top:6px;font-size:11px;">Causes probables :<br>`;
        analysis.causes.forEach(c=>{alertes+=`• ${c}<br>`;});
        if (analysis.suggestions.length > 0) {
          alertes+=`→ Ajoute : ${analysis.suggestions.slice(0,2).join(', ')}`;
        }
        alertes+=`</div>`;
      } else {
        alertes+=` → ${sugg[p.type]}`;
      }
      alertes+=`</div>`;
    });
    sections.push(`<div class="ai-section">${alertes}</div>`);
  }
  if (!sections.length) return '<span style="color:var(--sub);font-size:13px;">Importe des séances pour activer l\'analyse.</span>';
  return `<div class="ai-response-content">${sections.join('')}</div><div class="ai-timestamp">Coach Algo • Calcul instantané • Sans IA</div>`;
}


// ============================================================
// STATS SOUS-ONGLETS
// ============================================================
function showStatsSub(id, btn) {
  if (!id) id = activeStatsSub;
  activeStatsSub = id;
  // Deactivate all stats sub-sections
  document.querySelectorAll('#tab-stats .stats-sub-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#tab-stats .stats-sub-pill').forEach(el => el.classList.remove('active'));
  // Activate in tab-stats
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  else { document.querySelectorAll('#tab-stats .stats-sub-pill[onclick*="' + id + '"]').forEach(function(pill) { pill.classList.add('active'); }); }
  if (id === 'stats-volume') { renderReports('week'); requestAnimationFrame(() => renderVolumeChart('week')); }
  if (id === 'stats-muscles') { renderRadarImproved('week'); requestAnimationFrame(() => renderMuscleChart('week')); renderVolumeLandmarks(); renderStrengthRatios(); }
  if (id === 'stats-records') { renderLifts(); }
  if (id === 'stats-cardio') { renderCardioStats(); }
}

// ── Volume Landmarks — jauges MEV/MAV/MRV ──────────────────
function renderVolumeLandmarks() {
  const el = document.getElementById('volumeLandmarksContent');
  if (!el) return;
  const vol = computeWeeklyVolume(db.logs, 1);
  const LABELS_FR = {
    chest:'Pecs', back:'Dos', shoulders:'Épaules', quads:'Quads',
    hamstrings:'Ischio', glutes:'Fessiers', biceps:'Biceps', triceps:'Triceps',
    calves:'Mollets', abs:'Abdos', traps:'Trapèzes', forearms:'Avant-bras'
  };
  let html = '';
  for (const [key, lm] of Object.entries(VOLUME_LANDMARKS)) {
    const sets = Math.round((vol[key] || 0) * 10) / 10;
    const pct = Math.min(100, (sets / lm.MRV) * 100);
    let color = 'var(--sub)'; let status = '< MEV';
    if (shouldShow('mev_mav_mrv')) {
      if (sets >= lm.MRV) { color = 'var(--red)'; status = '> MRV ⚠️ ' + renderGlossaryTip('mrv'); }
      else if (sets >= lm.MAV) { color = 'var(--orange)'; status = 'MAV→MRV ' + renderGlossaryTip('mav'); }
      else if (sets >= lm.MEV) { color = 'var(--green)'; status = 'MEV→MAV ✅ ' + renderGlossaryTip('mev'); }
    } else {
      if (sets >= lm.MEV) { color = 'var(--green)'; status = '✅ Volume suffisant'; }
      else { color = 'var(--orange)'; status = '⚠️ Volume insuffisant'; }
    }
    var zoneLabel = sets < lm.MEV ? '< MEV (sous le minimum)' : sets < lm.MAV ? 'MEV→MAV (zone efficace) ✅' : sets < lm.MRV ? 'MAV→MRV (volume élevé)' : '> MRV (surmenage) ⚠️';
    html += '<div style="margin-bottom:8px;">' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">' +
      '<span style="font-weight:600;">' + (LABELS_FR[key] || key) + '</span>' +
      '<span style="color:' + color + ';">' + sets + '/' + lm.MRV + ' sets · ' + status + '</span></div>' +
      '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">' +
      '<div style="height:6px;width:' + pct + '%;background:' + color + ';border-radius:3px;transition:width 0.4s;"></div></div>' +
      '<div class="vol-detail" style="display:none;font-size:10px;color:var(--sub);margin-top:3px;line-height:1.5;">' +
      'MEV: ' + lm.MEV + ' · MAV: ' + lm.MAV + ' · MRV: ' + lm.MRV + ' sets/sem<br>' +
      'Actuel : ' + sets + ' sets → ' + zoneLabel + '</div>' +
      '</div>';
  }
  if (html) {
    html += '<div class="breakdown-toggle" onclick="document.querySelectorAll(\'.vol-detail\').forEach(function(d){d.style.display=d.style.display===\'none\'?\'block\':\'none\';});this.textContent=this.textContent.indexOf(\'Voir\')>=0?\'📐 Masquer les zones\':\'📐 Voir les zones MEV/MAV/MRV\';">📐 Voir les zones MEV/MAV/MRV</div>';
  }
  el.innerHTML = html || '<div style="font-size:12px;color:var(--sub);text-align:center;padding:10px;">Importe des séances pour voir le volume</div>';
}

// ── Ratios d'équilibre ──────────────────────────────────────
function renderStrengthRatios() {
  const el = document.getElementById('strengthRatiosContent');
  if (!el) return;
  const ratios = computeStrengthRatios();
  if (!ratios || !Object.keys(ratios).length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--sub);text-align:center;padding:10px;">Pas assez de données pour calculer les ratios</div>';
    return;
  }
  let html = '';
  for (const [key, r] of Object.entries(ratios)) {
    const val = r.value;
    const lo = r.ideal[0], hi = r.ideal[1];
    const inRange = val >= lo && val <= hi;
    const pctPos = Math.min(95, Math.max(5, ((val - (lo - 0.3)) / ((hi + 0.3) - (lo - 0.3))) * 100));
    const idealLeft = ((lo - (lo - 0.3)) / ((hi + 0.3) - (lo - 0.3))) * 100;
    const idealWidth = ((hi - lo) / ((hi + 0.3) - (lo - 0.3))) * 100;
    const color = inRange ? 'var(--green)' : 'var(--orange)';
    const alert = !inRange ? (val < lo ? '⚠️ Trop bas' : '⚠️ Trop haut') : '✅';
    html += '<div style="margin-bottom:12px;">' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">' +
      '<span style="font-weight:600;">' + r.label + ' ' + renderGlossaryTip('strength_ratios') + '</span>' +
      '<span style="color:' + color + ';">' + val.toFixed(2) + ' ' + alert + '</span></div>' +
      '<div style="position:relative;height:8px;background:var(--border);border-radius:4px;">' +
      '<div style="position:absolute;left:' + idealLeft + '%;width:' + idealWidth + '%;height:100%;background:rgba(50,215,75,0.25);border-radius:4px;"></div>' +
      '<div style="position:absolute;left:' + pctPos + '%;top:-2px;width:4px;height:12px;background:' + color + ';border-radius:2px;transform:translateX(-50%);"></div>' +
      '</div>' +
      '<div style="font-size:9px;color:var(--sub);margin-top:2px;">Plage idéale : ' + lo.toFixed(2) + ' – ' + hi.toFixed(2) + '</div>' +
      '</div>';
  }
  el.innerHTML = html;
}

function computeStrengthRatios() {
  const e1rm = (name) => {
    let best = 0;
    db.logs.forEach(log => {
      log.exercises.forEach(exo => {
        if ((exo.maxRM || 0) > best && matchExoName(exo.name, name)) best = exo.maxRM;
      });
    });
    return best > 0 ? best : null;
  };
  const squat = e1rm('squat'), bench = e1rm('bench'), deadlift = e1rm('deadlift');
  const ohp = e1rm('ohp'), row = e1rm('barbell row');
  const ratios = {};
  if (squat && deadlift) ratios.squat_deadlift = { value: squat/deadlift, ideal: [0.80, 0.85], label: 'Squat / Deadlift' };
  if (bench && squat)    ratios.bench_squat    = { value: bench/squat,    ideal: [0.60, 0.70], label: 'Bench / Squat' };
  if (ohp && bench)      ratios.ohp_bench      = { value: ohp/bench,      ideal: [0.60, 0.65], label: 'OHP / Bench' };
  if (row && bench)      ratios.row_bench       = { value: row/bench,      ideal: [0.90, 1.00], label: 'Row / Bench' };
  const vol = computeWeeklyVolume(db.logs, 1);
  const pushVol = (vol.chest || 0) + (vol.shoulders || 0) * 0.5 + (vol.triceps || 0);
  const pullVol = (vol.back || 0) + (vol.biceps || 0);
  if (pullVol > 0) ratios.push_pull = { value: pushVol/pullVol, ideal: [0.80, 1.10], label: 'Push / Pull (volume)' };
  return ratios;
}

function renderCardioStats() {
  const el = document.getElementById('cardioStatsContent');
  if (!el) return;

  const isSwim = n => /natation|swimming|nage|crawl|brasse|papillon|dos crawl/.test(n.toLowerCase());
  const isTapis = n => /tapis|treadmill|course|running|jogging/.test(n.toLowerCase());
  const isVelo = n => /velo|cycling|bike/.test(n.toLowerCase());
  const fmtDur = sec => { if (!sec) return '—'; const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60); return h > 0 ? h+'h'+String(m).padStart(2,'0') : m+'min'; };
  const fmtPace = (dist, sec) => dist > 0 && sec > 0 ? ((sec/60)/dist).toFixed(1) + ' min/km' : null;

  const all = [];
  db.logs.forEach(log => {
    log.exercises.forEach(exo => {
      if (!exo.isCardio) return;
      all.push({ name: exo.name, distance: exo.distance || 0, duration: exo.maxTime || 0, ts: log.timestamp, date: log.shortDate || formatDate(log.timestamp) });
    });
  });

  if (!all.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--sub);font-size:13px;">Aucune session cardio détectée.<br><span style="font-size:11px;">Tapis, natation, vélo… apparaissent ici automatiquement.</span></div>';
    return;
  }

  const limit30 = Date.now() - 30 * 86400000;
  const swim = all.filter(c => isSwim(c.name));
  const tapis = all.filter(c => isTapis(c.name));
  const velo = all.filter(c => isVelo(c.name) && !isSwim(c.name) && !isTapis(c.name));
  const other = all.filter(c => !isSwim(c.name) && !isTapis(c.name) && !isVelo(c.name));

  const CARDIO_TYPES = [
    { list: swim,  label: 'Natation',        icon: '🏊', color: '#64D2FF', bg: 'rgba(100,210,255,0.1)' },
    { list: tapis, label: 'Course / Tapis',   icon: '🏃', color: '#32D74B', bg: 'rgba(50,215,75,0.1)' },
    { list: velo,  label: 'Vélo',             icon: '🚴', color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)' },
    { list: other, label: 'Autre cardio',     icon: '💪', color: '#86868B', bg: 'rgba(134,134,139,0.1)' }
  ];

  const sectionHtml = CARDIO_TYPES.map(t => {
    if (!t.list.length) return '';
    const recent = t.list.filter(c => c.ts >= limit30);
    const totalDist = recent.reduce((s, c) => s + c.distance, 0);
    const totalDur = recent.reduce((s, c) => s + c.duration, 0);
    const bestDist = Math.max(...t.list.map(c => c.distance), 0);
    const avgPace = totalDist > 0 && totalDur > 0 ? fmtPace(totalDist, totalDur) : null;

    let metrics = '<div class="cardio-metric"><div class="cardio-metric-val" style="color:' + t.color + ';">' + recent.length + '</div><div class="cardio-metric-lbl">Sessions 30j</div></div>';
    if (totalDist > 0) metrics += '<div class="cardio-metric"><div class="cardio-metric-val" style="color:' + t.color + ';">' + totalDist.toFixed(1) + '<span>km</span></div><div class="cardio-metric-lbl">Distance</div></div>';
    if (totalDur > 0) metrics += '<div class="cardio-metric"><div class="cardio-metric-val" style="color:' + t.color + ';">' + fmtDur(totalDur) + '</div><div class="cardio-metric-lbl">Durée totale</div></div>';
    if (bestDist > 0) metrics += '<div class="cardio-metric"><div class="cardio-metric-val" style="color:' + t.color + ';">' + bestDist.toFixed(1) + '<span>km</span></div><div class="cardio-metric-lbl">Record dist.</div></div>';
    if (avgPace) metrics += '<div class="cardio-metric"><div class="cardio-metric-val" style="color:' + t.color + ';">' + avgPace + '</div><div class="cardio-metric-lbl">Allure moy.</div></div>';

    return '<div class="cardio-sec"><div class="cardio-sec-title" style="color:' + t.color + ';">' + t.icon + ' ' + t.label + '</div>' +
      '<div class="cardio-metrics">' + metrics + '</div></div>';
  }).join('');

  // Recent history
  const recentAll = [...all].sort((a, b) => b.ts - a.ts).slice(0, 10);
  const getCardioStyle = c => {
    if (isSwim(c.name)) return { icon: '🏊', color: '#64D2FF', bg: 'rgba(100,210,255,0.1)' };
    if (isTapis(c.name)) return { icon: '🏃', color: '#32D74B', bg: 'rgba(50,215,75,0.1)' };
    if (isVelo(c.name)) return { icon: '🚴', color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)' };
    return { icon: '💪', color: '#86868B', bg: 'rgba(134,134,139,0.1)' };
  };

  const historyHtml = recentAll.map(c => {
    const cs = getCardioStyle(c);
    const pace = fmtPace(c.distance, c.duration);
    return '<div class="cardio-h-item">' +
      '<div class="cardio-h-left">' +
        '<div class="cardio-h-ico" style="background:' + cs.bg + ';">' + cs.icon + '</div>' +
        '<div><div class="cardio-h-name">' + c.name + '</div><div class="cardio-h-date">' + c.date + '</div></div>' +
      '</div>' +
      '<div class="cardio-h-right">' +
        (c.distance ? '<div class="cardio-h-dist">' + c.distance.toFixed(2) + ' km</div>' : '') +
        (c.duration ? '<div class="cardio-h-time">' + fmtDur(c.duration) + '</div>' : '') +
        (pace ? '<div class="cardio-h-pace">' + pace + '</div>' : '') +
      '</div></div>';
  }).join('');

  el.innerHTML = sectionHtml +
    '<div style="font-size:11px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:0.8px;margin:14px 0 8px;">Historique récent</div>' +
    historyHtml;
}

// ============================================================
// SCORE DE FORME (EWMA ATL/CTL + composantes + Momentum)
// ============================================================
function calcFormScore() {
  // Composante 1 — Régularité (25pts) — utiliser le plan si disponible
  const sessions7 = getLogsInRange(7).length;
  let plannedDays = 3;
  if (db.weeklyPlan?.days) {
    plannedDays = db.weeklyPlan.days.filter(d => !d.rest).length || 3;
  } else {
    const routine = getRoutine();
    plannedDays = Math.max(3, Object.values(routine).filter(v => v && !v.includes('Repos') && !v.includes('😴')).length);
  }
  const c1 = Math.min(25, Math.round((sessions7 / plannedDays) * 25));

  // Composante 2 — Ratio charge aiguë/chronique ATL/CTL (25pts) — EWMA
  // Seuils ajustés au bloc en cours
  const _fLevel = db.user.level || 'intermediaire';
  const _fWeek = db.weeklyPlan?.week || null;
  var _fBlocP = null;
  try { _fBlocP = BLOC_PARAMS && BLOC_PARAMS[_fLevel] ? BLOC_PARAMS[_fLevel][_fWeek] : null; } catch(e) {}
  let acwrIdeal = { low: 0.8, high: 1.3 };
  if (_fBlocP && _fBlocP.label) {
    if (_fBlocP.label.includes('Accumulation')) acwrIdeal = { low: 1.0, high: 1.5 };
    else if (_fBlocP.label.includes('Deload')) acwrIdeal = { low: 0.4, high: 0.8 };
    else if (_fBlocP.label.includes('Peak') || _fBlocP.label.includes('Réalisation')) acwrIdeal = { low: 0.9, high: 1.2 };
  }
  let atl = 0, ctl = 0, c2 = 0;
  const allLogs = [...db.logs].sort((a,b) => a.timestamp - b.timestamp);
  // Count distinct training days in history
  const distinctDays = new Set(allLogs.map(l => new Date(l.timestamp).toDateString())).size;
  if (distinctDays >= 7) {
    // EWMA approach: walk day by day over the last 60 days
    const alphaAcute = 2 / (7 + 1);    // ~0.25
    const alphaChronic = 2 / (28 + 1);  // ~0.069
    const now = Date.now();
    const startMs = now - 60 * 86400000;
    // Build daily sets map
    const dailySets = {};
    allLogs.forEach(l => {
      if (l.timestamp < startMs) return;
      const dayKey = new Date(l.timestamp).toDateString();
      const sets = l.exercises.reduce((s, e) => s + (e.sets || 0), 0);
      dailySets[dayKey] = (dailySets[dayKey] || 0) + sets;
    });
    // Initialize EWMA with first day's value
    let ewmaAcute = 0, ewmaChronic = 0, initialized = false;
    for (let d = 60; d >= 0; d--) {
      const dt = new Date(now - d * 86400000);
      const dayKey = dt.toDateString();
      const load = dailySets[dayKey] || 0;
      if (!initialized) {
        ewmaAcute = load; ewmaChronic = load; initialized = true;
      } else {
        ewmaAcute = alphaAcute * load + (1 - alphaAcute) * ewmaAcute;
        ewmaChronic = alphaChronic * load + (1 - alphaChronic) * ewmaChronic;
      }
    }
    atl = Math.round(ewmaAcute * 10) / 10;
    ctl = Math.round(ewmaChronic * 10) / 10;
    if (ctl > 0) {
      const r = atl / ctl;
      if (r >= acwrIdeal.low && r <= acwrIdeal.high) c2 = 25;
      else if (r >= acwrIdeal.low - 0.3 && r < acwrIdeal.low) c2 = Math.round(((r - (acwrIdeal.low - 0.3)) / 0.3) * 18) + 4;
      else if (r > acwrIdeal.high && r <= acwrIdeal.high + 0.5) c2 = Math.round(((acwrIdeal.high + 0.5 - r) / 0.5) * 20);
      else c2 = 5;
    } else if (atl > 0) c2 = 15;
  } else {
    // Fallback: raw sets counting (not enough history for EWMA)
    const setsInRange = days => db.logs.filter(l => l.timestamp >= Date.now() - days * 86400000)
      .reduce((s, l) => s + l.exercises.reduce((ss, e) => ss + (e.sets || 0), 0), 0);
    atl = setsInRange(7);
    ctl = setsInRange(28) / 4;
    if (ctl > 0) {
      const r = atl / ctl;
      if (r >= acwrIdeal.low && r <= acwrIdeal.high) c2 = 25;
      else if (r >= acwrIdeal.low - 0.3 && r < acwrIdeal.low) c2 = Math.round(((r - (acwrIdeal.low - 0.3)) / 0.3) * 18) + 4;
      else if (r > acwrIdeal.high && r <= acwrIdeal.high + 0.5) c2 = Math.round(((acwrIdeal.high + 0.5 - r) / 0.5) * 20);
      else c2 = 5;
    } else if (atl > 0) c2 = 15;
  }

  // Composante 3 — Progression exercices clés (25pts) — via computeExoTrend
  let c3 = 0;
  const keyExos = (db.keyLifts && db.keyLifts.length > 0)
    ? db.keyLifts.map(k => k.name || k)
    : null;
  if (keyExos && keyExos.length > 0) {
    // Use computeExoTrend-style regression on key lifts
    let progCount = 0, stagCount = 0, regCount = 0;
    keyExos.forEach(exoName => {
      const pts = [];
      const desc = [...db.logs].sort((a, b) => b.timestamp - a.timestamp);
      for (const log of desc) {
        const exo = log.exercises.find(e => e.name === exoName || matchExoName(e.name, exoName));
        if (!exo || !exo.maxRM || exo.maxRM <= 0) continue;
        pts.push({ x: log.timestamp / 86400000, y: exo.maxRM });
        if (pts.length >= 6) break;
      }
      if (pts.length < 2) return;
      pts.sort((a, b) => a.x - b.x);
      const n = pts.length;
      const sumX = pts.reduce((s, p) => s + p.x, 0), sumY = pts.reduce((s, p) => s + p.y, 0);
      const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0), sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      if (slope > 0.01) progCount++;
      else if (slope < -0.01) regCount++;
      else stagCount++;
    });
    const total3 = progCount + stagCount + regCount;
    if (total3 > 0) {
      c3 = Math.round((progCount / total3) * 25 + (stagCount / total3) * 12.5 + (regCount / total3) * 5);
    } else {
      c3 = 12; // no data
    }
  } else {
    // Fallback SBD
    let sbdFound = 0;
    ['bench', 'squat', 'deadlift'].forEach(type => {
      const pts = [];
      [...db.logs].sort((a, b) => a.timestamp - b.timestamp)
        .filter(l => l.timestamp >= Date.now() - 28 * 86400000)
        .forEach(log => log.exercises.forEach(e => { if (getSBDType(e.name) === type && e.maxRM > 0) pts.push(e.maxRM); }));
      if (pts.length < 2) return;
      sbdFound++;
      if (pts[pts.length - 1] > pts[0]) c3 += 25 / 3;
      else if (pts[pts.length - 1] === pts[0]) c3 += 10 / 3;
    });
    if (sbdFound === 0) c3 = 12;
    else c3 = Math.round(c3);
  }

  // Composante 4 — Nutrition (25pts) : tracking (12.5) + adhérence (12.5)
  const limit7 = Date.now() - 7 * 86400000;
  const nutriDays = (db.body || []).filter(e => e.ts >= limit7 && (e.kcal > 0 || e.prot > 0));
  const c4_tracking = Math.min(12.5, Math.round((nutriDays.length / 7) * 12.5 * 10) / 10);
  let c4_adherence = 0;
  if (nutriDays.length > 0) {
    const bw = db.user.bw || 80;
    const tdee = db.user.tdee || calcCalorieCible(bw);
    const protTarget = db.user.protTarget || Math.round(bw * 1.95);
    let adherentDays = 0;
    nutriDays.forEach(entry => {
      let ok = true;
      if (entry.kcal > 0 && tdee > 0 && Math.abs(entry.kcal - tdee) / tdee > 0.10) ok = false;
      if (entry.prot > 0 && protTarget > 0 && Math.abs(entry.prot - protTarget) / protTarget > 0.10) ok = false;
      if (ok) adherentDays++;
    });
    c4_adherence = Math.min(12.5, Math.round((adherentDays / nutriDays.length) * 12.5 * 10) / 10);
  }
  const c4 = Math.round(c4_tracking + c4_adherence);

  // Bonus Momentum (+5 pts max, capped at 100 total)
  let momentum = 0;
  const routine = getRoutine();
  const routineDays = Object.entries(routine).filter(([, v]) => v && !v.includes('Repos') && !v.includes('😴')).map(([d]) => d);
  if (routineDays.length > 0) {
    const orderedDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const todayIdx = orderedDays.indexOf(DAYS_FULL[new Date().getDay()]);
    // Walk backwards from today, counting consecutive routine days that had a session
    const logDaySet = new Set();
    db.logs.forEach(l => {
      const d = new Date(l.timestamp);
      logDaySet.add(d.toDateString());
    });
    let streak = 0;
    for (let i = 0; i < 14; i++) { // max 2 weeks back
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() - i);
      const dayName = DAYS_FULL[checkDate.getDay()];
      if (!routineDays.includes(dayName)) continue; // skip rest days
      if (logDaySet.has(checkDate.toDateString())) {
        streak++;
      } else {
        break; // streak broken
      }
    }
    momentum = Math.min(5, streak);
  }

  const rawTotal = c1 + Math.max(0, c2) + c3 + c4 + momentum;
  const total = Math.min(100, Math.max(0, rawTotal));
  return { total, atl, ctl, momentum, components: [
    { label: 'Régularité', score: c1 },
    { label: 'Charge', score: Math.max(0, c2) },
    { label: 'Progression', score: c3 },
    { label: 'Nutrition', score: c4 }
  ]};
}

function renderFormeScore() {
  const el = document.getElementById('formeScoreContent');
  const tag = document.getElementById('formeScoreTag');
  if (!el) return;
  if (!db.logs.length) { el.innerHTML = '<div style="color:var(--sub);font-size:12px;text-align:center;padding:12px;">Importe des séances<br>pour calculer le score de forme.</div>'; return; }
  const fs = calcFormScore();
  const color = fs.total >= 80 ? 'var(--green)' : fs.total >= 60 ? 'var(--blue)' : fs.total >= 40 ? 'var(--orange)' : 'var(--red)';
  const label = fs.total >= 80 ? 'Optimal' : fs.total >= 60 ? 'Bon' : fs.total >= 40 ? 'Moyen' : 'À améliorer';
  if (tag) { tag.textContent = label; tag.style.color = color; }
  let momentumHtml = '';
  if (fs.momentum && fs.momentum > 0) {
    momentumHtml = '<div class="forme-bar-row">' +
      '<span class="forme-bar-name">Momentum</span>' +
      '<div class="forme-bar-bg"><div class="forme-bar-fill" style="width:' + Math.round((fs.momentum / 5) * 100) + '%;background:var(--purple);"></div></div>' +
      '<span class="forme-bar-score" style="color:var(--purple);">+' + fs.momentum + '</span>' +
      '</div>';
  }
  el.innerHTML =
    '<div class="forme-score-wrap">' +
      '<div class="forme-circle" style="color:' + color + ';border-color:' + color + ';">' +
        '<span class="forme-circle-val" style="color:' + color + ';">' + fs.total + '</span>' +
        '<span class="forme-circle-lbl" style="color:' + color + ';">/100</span>' +
      '</div>' +
      '<div class="forme-bars">' +
        fs.components.map(c => {
          const pct = Math.round((c.score / 25) * 100);
          const bColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--blue)' : pct >= 30 ? 'var(--orange)' : 'var(--red)';
          return '<div class="forme-bar-row">' +
            '<span class="forme-bar-name">' + c.label + '</span>' +
            '<div class="forme-bar-bg"><div class="forme-bar-fill" style="width:' + pct + '%;background:' + bColor + ';"></div></div>' +
            '<span class="forme-bar-score" style="color:' + bColor + ';">' + c.score + '/25</span>' +
            '</div>';
        }).join('') +
        momentumHtml +
      '</div>' +
    '</div>';
}

function renderTrainingLoad() {
  const el = document.getElementById('trainingLoadContent');
  if (!el) return;
  if (!db.logs.length) { el.innerHTML = '<div style="color:var(--sub);font-size:12px;text-align:center;padding:12px;">Aucune séance importée.</div>'; return; }
  const fs = calcFormScore();
  const { atl, ctl } = fs;
  const ratio = ctl > 0 ? atl / ctl : (atl > 0 ? 1.0 : 0);
  // Zone: 0→sous (0-0.8), optimal (0.8-1.3), surcharge (>1.3). Max gauge = 2.0
  const needlePct = Math.min(98, Math.max(2, (ratio / 2.0) * 100));
  const statusLabel = ratio === 0 ? 'Aucune donnée' : ratio < 0.5 ? 'Très sous-entraîné' : ratio < 0.8 ? 'Sous-entraîné' : ratio <= 1.3 ? '✓ Zone optimale' : ratio <= 1.6 ? '⚠️ Charge élevée' : '🔴 Surcharge';
  const statusColor = ratio === 0 ? 'var(--sub)' : ratio < 0.8 ? 'var(--blue)' : ratio <= 1.3 ? 'var(--green)' : ratio <= 1.6 ? 'var(--orange)' : 'var(--red)';
  el.innerHTML =
    '<div class="tl-numbers">' +
      '<div class="tl-num-box"><div class="tl-num-val" style="color:var(--blue);">' + atl + '</div><div class="tl-num-lbl">ATL 7j</div></div>' +
      '<div class="tl-num-box"><div class="tl-num-val" style="color:var(--purple);">' + Math.round(ctl) + '</div><div class="tl-num-lbl">CTL moy.</div></div>' +
      '<div class="tl-num-box"><div class="tl-num-val" style="color:' + statusColor + ';">' + (ctl > 0 ? ratio.toFixed(2) : '—') + '</div><div class="tl-num-lbl">Ratio</div></div>' +
    '</div>' +
    '<div class="tl-gauge-bg"><div class="tl-gauge-needle" style="left:' + needlePct + '%;"></div></div>' +
    '<div class="tl-gauge-labels"><span>Repos</span><span>Optimal</span><span>Surcharge</span></div>' +
    '<div style="margin-top:10px;"><span class="tl-status" style="background:' + statusColor + '1a;color:' + statusColor + ';border:1px solid ' + statusColor + '33;">' + statusLabel + '</span></div>';
}

function renderMacroHistory() {
  const el = document.getElementById('macroHistoryDisplay');
  if (!el) return;
  const days = 7;
  const entries = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate()+1);
    const match = (db.body||[]).find(e => e.ts >= d.getTime() && e.ts < next.getTime() && (e.kcal > 0 || e.prot > 0));
    entries.push({ label: d.toLocaleDateString('fr-FR',{weekday:'narrow'}), prot: match?.prot||0, carb: match?.carb||0, fat: match?.fat||0, kcal: match?.kcal||0 });
  }
  const hasData = entries.some(e => e.kcal > 0);
  if (!hasData) { el.innerHTML = ''; return; }
  const macros = calcMacrosCibles(calcCalorieCible(db.user.bw), db.user.bw);
  const maxKcal = Math.max(...entries.map(e => e.kcal), macros.prot*4+macros.carb*4+macros.fat*9, 1);
  el.innerHTML =
    '<div style="font-size:11px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:0.8px;margin:14px 0 4px;">Macros 7 jours</div>' +
    '<div class="macro-hist-wrap">' +
    entries.map(e => {
      const hProt = Math.round(e.prot > 0 ? Math.min(62, (e.prot*4/maxKcal)*62) : 0);
      const hCarb = Math.round(e.carb > 0 ? Math.min(62, (e.carb*4/maxKcal)*62) : 0);
      const hFat  = Math.round(e.fat  > 0 ? Math.min(62, (e.fat*9/maxKcal)*62) : 0);
      return '<div class="macro-hist-col">' +
        '<div class="macro-hist-bars">' +
          '<div class="macro-hist-bar" style="height:' + hProt + 'px;background:#0A84FF;"></div>' +
          '<div class="macro-hist-bar" style="height:' + hCarb + 'px;background:#FF9F0A;"></div>' +
          '<div class="macro-hist-bar" style="height:' + hFat  + 'px;background:#BF5AF2;"></div>' +
        '</div>' +
        '<div class="macro-hist-lbl">' + e.label + '</div>' +
        '</div>';
    }).join('') +
    '</div>' +
    '<div style="display:flex;gap:14px;justify-content:center;font-size:10px;margin-top:4px;">' +
      '<span style="color:#0A84FF;">■ Prot</span><span style="color:#FF9F0A;">■ Carb</span><span style="color:#BF5AF2;">■ Lip</span>' +
    '</div>';
}

function renderWeightTrend() {
  const el = document.getElementById('weightTrendDisplay');
  if (!el) return;
  const bwHistory = (db.body||[]).filter(e => e.bw > 0).sort((a,b) => b.ts-a.ts);
  if (bwHistory.length < 2) { el.innerHTML = ''; return; }
  const last7 = bwHistory.filter(e => e.ts >= Date.now()-7*86400000);
  const avg7 = last7.length ? (last7.reduce((s,e)=>s+e.bw,0)/last7.length).toFixed(1) : null;
  // Trend: kg/week from linear regression on last 14 days
  const last14 = bwHistory.filter(e => e.ts >= Date.now()-14*86400000).reverse();
  let trend = null;
  if (last14.length >= 2) {
    const n = last14.length;
    const x0 = last14[0].ts;
    const xs = last14.map(e => (e.ts-x0)/86400000);
    const ys = last14.map(e => e.bw);
    const mx = xs.reduce((a,b)=>a+b)/n, my = ys.reduce((a,b)=>a+b)/n;
    const num = xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0);
    const den = xs.reduce((s,x)=>s+(x-mx)**2,0);
    if (den > 0) trend = Math.round((num/den)*7*10)/10; // kg/week
  }
  if (!avg7) { el.innerHTML = ''; return; }
  const trendStr = trend !== null ? (trend > 0 ? '↑ +'+trend : trend < 0 ? '↓ '+trend : '→ stable') + ' kg/sem' : '';
  const trendColor = trend === null ? 'var(--sub)' : Math.abs(trend) < 0.3 ? 'var(--green)' : 'var(--orange)';
  el.innerHTML =
    '<div class="weight-trend-row">' +
      '<div><div class="weight-avg">' + avg7 + ' kg</div><div class="weight-avg-sub">Moyenne 7 jours</div></div>' +
      (trendStr ? '<div style="text-align:right;"><div style="font-size:14px;font-weight:700;color:'+trendColor+';">' + trendStr + '</div></div>' : '') +
    '</div>';
}

// ============================================================
// CORPS TAB
// ============================================================
function toggleCorpsAcc(id) {
  const body = document.getElementById(id);
  if (!body) return;
  body.classList.toggle('open');
  const chev = document.getElementById('chev-' + id);
  if (chev) chev.classList.toggle('open', body.classList.contains('open'));

  // Rendu lazy du profil social à l'ouverture de l'accordéon
  if (id === 'ca-social-profile' && body.classList.contains('open')) {
    if (typeof renderSocialProfileCard === 'function') renderSocialProfileCard();
  }
}

function renderCorpsTab() {
  const bw=db.user.bw;
  const bench=db.bestPR.bench,squat=db.bestPR.squat,dead=db.bestPR.deadlift;
  const logs7=getLogsInRange(7),tonnage7=logs7.reduce((s,l)=>s+l.volume,0);
  const ipf=calcIPFGLTotal(bench,squat,dead,bw);
  const ratio=bw>0&&ipf>0?Math.round((ipf/bw)*100)/100:0;
  const baseTdee=calcTDEE(bw,tonnage7);
  // Dynamic TDEE based on today's programme
  const todayDayName = DAYS_FULL[new Date().getDay()];
  const todayRoutine = getRoutine();
  const todayLabel = todayRoutine[todayDayName] || '';
  const todayIsRest = !todayLabel || /repos|😴/i.test(todayLabel);
  const todayIsDeload = isDeloadWeek();
  let tdeeMultiplier = 0.95; // Repos par défaut
  let tdeeLabel = '🛋️ Jour de repos — -5% kcal';
  if (todayIsDeload) {
    tdeeMultiplier = 0.95; tdeeLabel = '🔄 Jour de deload — -5% kcal';
  } else if (!todayIsRest) {
    // Check if today has a big lift
    const todayExos = getProgExosForDay(todayDayName);
    const hasBig = todayExos.some(n => {
      const nl = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return /squat|deadlift|souleve|bench\s*(press|barre|couche)?|developpe\s*couche/.test(nl);
    });
    if (hasBig) { tdeeMultiplier = 1.10; tdeeLabel = '🏋️ Jour lourd — +10% kcal'; }
    else { tdeeMultiplier = 1.05; tdeeLabel = '💪 Jour modéré — +5% kcal'; }
  }
  const tdee = baseTdee > 0 ? Math.round(baseTdee * tdeeMultiplier) : 0;
  const cible=calcCalorieCible(bw);
  const adjustedCible = baseTdee > 0 ? Math.round(cible * tdeeMultiplier / (cible > 0 && baseTdee > 0 ? baseTdee / baseTdee : 1)) : cible;
  const macros=calcMacrosCibles(adjustedCible > 0 ? adjustedCible : cible, bw);
  const today=new Date().toDateString();
  const todayEntry=(db.body||[]).find(e=>new Date(e.ts).toDateString()===today);
  const kcalMange=todayEntry?todayEntry.kcal:0,protMange=todayEntry?todayEntry.prot:0,carbMange=todayEntry?todayEntry.carb:0,fatMange=todayEntry?todayEntry.fat:0;
  const now2=new Date(),heuresPassed=now2.getHours()+now2.getMinutes()/60;
  const brulees=tdee>0?Math.round((tdee/24)*heuresPassed):0;
  const restantes=Math.max(0,(adjustedCible||cible)-kcalMange);
  const RING_CIRCUM=440,pctMange=cible>0?Math.min(1,kcalMange/cible):0,dashOffset=Math.round(RING_CIRCUM*(1-pctMange));
  const ring=document.getElementById('nutriRingFill');
  if (ring){ring.style.strokeDashoffset=dashOffset;ring.className='nutri-ring-fill'+(pctMange>1?' over':pctMange>0.9?' warn':'');}
  const setEl=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  setEl('nutriKcalRestantes',restantes);setEl('nutriKcalSub',kcalMange>0?`sur ${cible} kcal`:`Objectif: ${cible} kcal`);
  setEl('nutriMangees',kcalMange);setEl('nutriCible',cible);setEl('nutriBrulees',brulees);
  const barW=(done,target)=>Math.min(100,target>0?Math.round(done/target*100):0)+'%';
  const applyBar=(id,done,target)=>{const el=document.getElementById(id);if(!el)return;el.style.width=barW(done,target);el.classList.toggle('over',done>target*1.05);};
  applyBar('nutriProtBar',protMange,macros.prot);applyBar('nutriCarbBar',carbMange,macros.carb);applyBar('nutriFatBar',fatMange,macros.fat);
  setEl('nutriProtLabel',`${protMange} / ${macros.prot} g`);setEl('nutriCarbLabel',`${carbMange} / ${macros.carb} g`);setEl('nutriFatLabel',`${fatMange} / ${macros.fat} g`);
  setEl('nutriTDEELabel',tdee>0?`${tdee} kcal`:'—');setEl('nutriProtCible',`${macros.prot}g`);
  const tdeeDayEl = document.getElementById('nutriDayTypeLabel');
  if (tdeeDayEl) tdeeDayEl.textContent = tdeeLabel;
  // IPF GL card: only show if mode supports it
  const ipfCard = document.getElementById('metricIPFCard');
  if (ipfCard) ipfCard.style.display = modeFeature('showIPF') ? '' : 'none';
  if (modeFeature('showIPF')) {
    setEl('metricIPF',ipf>0?ipf:'—');setEl('metricIPFsub',ipf>0?(ipf<300?'Débutant':ipf<400?'Intermédiaire':ipf<500?'Avancé':'🏆 Élite'):'Importe des séances');
  }
  // Ratio card: only show if mode supports it
  const ratioCard = document.getElementById('metricRatioCard');
  if (ratioCard) ratioCard.style.display = modeFeature('showBWRatio') ? '' : 'none';
  if (modeFeature('showBWRatio')) {
    setEl('metricRatio',ratio>0?ratio:'—');setEl('metricRatioSub',ratio>0?(ratio>4?'🔥 Recompo active':ratio>3?'En progression':'Continue'):'IPF GL / kg corps');
  }
  // Poids : historique 15 dernières entrées
  const bwHistory=(db.body||[]).filter(e=>e.bw>0).sort((a,b)=>b.ts-a.ts).slice(0,15);
  const wEl=document.getElementById('weightHistory');
  if (wEl){if(!bwHistory.length){wEl.innerHTML='<p style="color:var(--sub);font-size:12px;text-align:center;">Aucune entrée</p>';}
  else{wEl.innerHTML=bwHistory.map((e,i)=>{const prev=bwHistory[i+1];const delta=prev?Math.round((e.bw-prev.bw)*10)/10:null;const cls=delta===null?'':delta>0?'trend-up':delta<0?'trend-down':'trend-flat';const str=delta===null?'':(delta>0?'↑':delta<0?'↓':'→')+Math.abs(delta)+'kg';return`<div class="weight-history-item"><span>${new Date(e.ts).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</span><span style="font-weight:700;">${e.bw} kg</span><span class="${cls}" style="font-size:12px;min-width:50px;text-align:right;">${str}</span></div>`;}).join('');}}
  const pEl=document.getElementById('plateauAlerts');
  if (pEl){
    if (modeFeature('showPlateauDetection')) {
      const plateaux=['bench','squat','deadlift'].map(t=>detectPlateau(t)).filter(Boolean);pEl.innerHTML=plateaux.map(p=>`<div class="plateau-alert">📉 ${p.type.toUpperCase()} plateau — adapte la variation</div>`).join('');
    } else { pEl.innerHTML = ''; }
  }
  try { const cEl=document.getElementById('coachAlgoContent');if(cEl)cEl.innerHTML=generateCoachAlgoMessage(); } catch(e) { console.warn('Coach algo render failed:', e); }
  // Nouvelles sections — each wrapped in try/catch so one failure doesn't block others
  try { renderFormeScore(); } catch(e) { const _e=document.getElementById('formeScoreContent'); if(_e) _e.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:10px;">Données insuffisantes</div>'; }
  try { renderTrainingLoad(); } catch(e) { const _e=document.getElementById('trainingLoadContent'); if(_e) _e.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:10px;">Données insuffisantes</div>'; }
  try { renderWeightTrend(); } catch(e) {}
  try { renderMacroHistory(); } catch(e) {}
  try { renderBodyWeightChart(bwHistory); } catch(e) {}
  try { renderMuscleHeatmap(); } catch(e) { const _e=document.getElementById('muscleHeatmapContent'); if(_e) _e.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:10px;">Données insuffisantes</div>'; }
}
function renderBodyWeightChart(entries) {
  const el = document.getElementById('chartBodyWeight');
  if (!el) return;
  if (entries.length < 2) { el.innerHTML = ''; return; }
  const sorted = [...entries].reverse();
  const w = 280, h = 60, pad = 4;
  const bws = sorted.map(e => e.bw);
  const minB = Math.min(...bws), maxB = Math.max(...bws);
  const range = maxB - minB || 1;
  const points = sorted.map((e, i) => ({
    x: pad + (i / (sorted.length - 1)) * (w - pad * 2),
    y: pad + (1 - (e.bw - minB) / range) * (h - pad * 2)
  }));
  const line = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const area = line + ' L' + points[points.length - 1].x.toFixed(1) + ',' + h + ' L' + points[0].x.toFixed(1) + ',' + h + ' Z';
  const last = points[points.length - 1];
  const gradId = 'bwg' + Math.random().toString(36).substr(2, 5);
  el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:60px;">' +
    '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--green)" stop-opacity="0.15"/><stop offset="100%" stop-color="var(--green)" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#' + gradId + ')"/>' +
    '<path d="' + line + '" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="3" fill="var(--green)"/>' +
    '</svg>' +
    '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--sub);margin-top:2px;">' +
    '<span>' + new Date(sorted[0].ts).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit'}) + '</span>' +
    '<span>' + minB.toFixed(1) + '–' + maxB.toFixed(1) + ' kg</span>' +
    '<span>' + new Date(sorted[sorted.length-1].ts).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit'}) + '</span></div>';
}
// ============================================================
// ONGLET SÉANCES — vue semaine ←→
// ============================================================
function getWeekStart(ts) {
  const d = new Date(ts); d.setHours(0,0,0,0);
  const day = d.getDay(); const diff = day===0 ? -6 : 1-day;
  d.setDate(d.getDate()+diff); return d.getTime();
}
function getWeekEnd(ws) { return ws + 6*86400000 + 86399999; }

function navigateWeek(dir) {
  currentWeekOffset += dir;
  renderSeancesTab();
}

function renderSeancesTab() {
  const now = Date.now();
  const thisWeekStart = getWeekStart(now);
  const targetWeekStart = thisWeekStart + (currentWeekOffset * 7 * 86400000);
  const targetWeekEnd = getWeekEnd(targetWeekStart);

  const startD = new Date(targetWeekStart), endD = new Date(targetWeekEnd);
  const fmt = d => d.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'});
  document.getElementById('weekRangeLabel').textContent = fmt(startD) + ' – ' + fmt(endD);
  document.getElementById('weekIndexLabel').textContent =
    currentWeekOffset === 0 ? 'Cette semaine' :
    currentWeekOffset === -1 ? 'Semaine passée' :
    'Il y a ' + Math.abs(currentWeekOffset) + ' semaines';

  document.getElementById('prevWeekBtn').style.opacity = '1';
  document.getElementById('nextWeekBtn').style.opacity = currentWeekOffset >= 0 ? '0.3' : '1';
  document.getElementById('nextWeekBtn').disabled = currentWeekOffset >= 0;

  const sessions = db.logs.filter(l => l.timestamp >= targetWeekStart && l.timestamp <= targetWeekEnd)
    .sort((a,b) => a.timestamp - b.timestamp);

  const container = document.getElementById('weekSessionsContainer');

  // Stats semaine
  var totalDur = sessions.reduce(function(s,l){ return s+(l.duration||0); }, 0);
  var totalVol = sessions.reduce(function(s,l){ return s+(l.volume||0); }, 0);
  var durMin = Math.round(totalDur/60);
  var durStr = durMin>=60 ? Math.floor(durMin/60)+'h'+(durMin%60>0?(durMin%60<10?'0':'')+(durMin%60):'') : durMin+'min';
  var volStr2 = totalVol>=1000 ? (totalVol/1000).toFixed(1)+'t' : totalVol+'kg';

  var statsHtml = '<div class="wk-stats-bar">'+
    '<div class="wk-stats-item"><div class="wk-stats-val" style="color:var(--accent);">'+sessions.length+'</div><div class="wk-stats-lbl">Séances</div></div>'+
    '<div class="wk-stats-item"><div class="wk-stats-val" style="color:var(--purple);">'+volStr2+'</div><div class="wk-stats-lbl">Volume</div></div>'+
    '<div class="wk-stats-item"><div class="wk-stats-val" style="color:var(--orange);">'+durStr+'</div><div class="wk-stats-lbl">Durée</div></div>'+
  '</div>';

  // Générer les cards (sans jours de repos)
  var cardsHtml = sessions.length === 0
    ? '<div style="text-align:center;padding:32px 20px;color:var(--sub);font-size:13px;">Aucune séance cette semaine</div>'
    : sessions.map(function(session, si) {
      return renderSessionCard2(session, si);
    }).join('');

  container.innerHTML = statsHtml + '<div id="sc-cards-wrap">' + cardsHtml + '</div>';
}

function renderSessionCard2(session, si) {
  var ts = session.timestamp || 0;
  var d = new Date(ts);
  var dayShort = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()];
  var dayNum = d.getDate();
  var monthShort = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][d.getMonth()];
  var dayLabel = dayShort+' '+dayNum+' '+monthShort;

  // Couleur selon type de séance (SBD ou autre)
  var title = session.title || 'Séance';
  var titleLow = title.toLowerCase();
  var accentColor = 'var(--purple)';
  var borderColor = 'rgba(191,90,242,.2)';
  var bgColor = 'rgba(191,90,242,.04)';
  var topbarBg = 'linear-gradient(90deg,var(--purple),var(--teal))';
  if (/squat|jambe|quad|leg/i.test(titleLow)) {
    accentColor='var(--squat)'; borderColor='rgba(255,69,58,.2)'; bgColor='rgba(255,69,58,.04)';
    topbarBg='linear-gradient(90deg,var(--squat),var(--orange))';
  } else if (/bench|pecto|push|poitrine|développé/i.test(titleLow)) {
    accentColor='var(--bench)'; borderColor='rgba(10,132,255,.2)'; bgColor='rgba(10,132,255,.04)';
    topbarBg='linear-gradient(90deg,var(--bench),var(--teal))';
  } else if (/dead|soulevé|deadlift|pull|dos/i.test(titleLow)) {
    accentColor='var(--deadlift)'; borderColor='rgba(255,159,10,.2)'; bgColor='rgba(255,159,10,.04)';
    topbarBg='linear-gradient(90deg,var(--deadlift),var(--orange))';
  }

  var vol = session.volume || 0;
  var volDisplay = vol >= 1000 ? (vol/1000).toFixed(1)+'t' : vol+'kg';
  var dur = session.duration ? Math.round(session.duration/60)+'min' : '';
  var exoCount = (session.exercises||[]).length;
  var metaStr = [dur, exoCount+' exercice'+(exoCount>1?'s':'')].filter(Boolean).join(' · ');

  // Badge PR
  var hasPR = (session.exercises||[]).some(function(e){ return e.isPR || e.maxRM > 0; });
  var prBadge = hasPR ? '<span class="sc-pr-badge" style="background:rgba(50,215,75,.1);color:var(--green);border:1px solid rgba(50,215,75,.18);">🏆 PR</span>' : '';

  // Tags muscles
  var muscles = {};
  (session.exercises||[]).forEach(function(e){
    var mg = typeof getMuscleGroup==='function' ? getMuscleGroup(e.name) : '';
    if (mg && mg!=='Autre' && mg!=='Cardio') muscles[mg]=true;
  });
  var tagsHtml = Object.keys(muscles).slice(0,3).map(function(mg){
    return '<span class="sc-tag" style="color:var(--sub);border-color:var(--border);">'+mg+'</span>';
  }).join('');

  // Détail complet (sets par exercice)
  var detailHtml = renderSessionDetail2(session);

  var uid = 'sc2-'+si+'-'+ts;

  return '<div class="sc" style="background:'+bgColor+';border-color:'+borderColor+';" id="wrap-'+uid+'">'+
    '<div class="sc-topbar" style="background:'+topbarBg+';"></div>'+
    '<div class="sc-body-wrap" onclick="togSc2(\''+uid+'\')">'+
      '<div class="sc-row1">'+
        '<div class="sc-day-label" style="color:'+accentColor+';">'+dayLabel+prBadge+'</div>'+
        '<div class="sc-vol-block"><div class="sc-vol-num" style="color:var(--purple);">'+volDisplay+'</div><div class="sc-vol-unit">volume</div></div>'+
      '</div>'+
      '<div class="sc-title">'+title+'</div>'+
      '<div class="sc-meta-line">'+metaStr+'</div>'+
      (tagsHtml ? '<div class="sc-tags">'+tagsHtml+'</div>' : '')+
      '<div class="sc-footer">'+
        '<div style="flex:1;font-size:10px;color:var(--sub);">Appuie pour voir le détail</div>'+
        '<button class="sc-menu-btn" onclick="event.stopPropagation();togScMenu(\'menu-'+uid+'\')">···</button>'+
      '</div>'+
    '</div>'+
    '<div class="sc-dropdown" id="menu-'+uid+'">'+
      '<div class="sc-dd-item" onclick="copySessionToGo(\''+session.id+'\');closeAllScMenus()"><span class="sc-dd-ico">↩</span>Copier dans GO</div>'+
      '<div class="sc-dd-item" onclick="shareSessionToFeed(\''+session.id+'\');closeAllScMenus()"><span class="sc-dd-ico">📤</span>Partager à un gym bro</div>'+
      '<div class="sc-dd-sep"></div>'+
      '<div class="sc-dd-item" onclick="openSessionEditor(\''+session.id+'\');closeAllScMenus()"><span class="sc-dd-ico">✏️</span>Renommer</div>'+
      '<div class="sc-dd-item sc-dd-danger" onclick="deleteSessionFromList(\''+session.id+'\');closeAllScMenus()"><span class="sc-dd-ico">🗑️</span>Supprimer</div>'+
    '</div>'+
    '<div class="sc-detail" id="det-'+uid+'">'+detailHtml+'</div>'+
  '</div>';
}

function renderSessionDetail2(session) {
  var exos = session.exercises || [];
  if (!exos.length) return '<div class="sc-detail-inner"><div style="padding:12px 14px;font-size:12px;color:var(--sub);">Aucun exercice</div></div>';

  var exoBlocks = exos.map(function(exo) {
    var ms = typeof getMuscleStyle==='function' ? getMuscleStyle(exo.name)
      : (typeof _ecMuscleStyle==='function' ? _ecMuscleStyle(exo.name) : {bg:'rgba(120,120,168,.1)',icon:'💪'});
    var best = exo.maxRM > 0 ? exo.maxRM+'kg × '+(((exo.allSets||[]).filter(function(s){return s.weight===exo.maxRM;})[0]||{}).reps||'?')+' reps' : '';
    var bestColor = exo.isPR ? 'color:var(--green)' : 'color:var(--sub)';

    var sets = exo.allSets || exo.series || [];
    var setsHtml = '';
    if (sets.length > 0) {
      var rows = sets.map(function(s, i) {
        var w = s.weight || 0;
        var r = s.reps || 0;
        var rest = s.restSeconds ? Math.round(s.restSeconds/60)+'min' : (s.rest || '—');
        var isWarmup = s.setType==='warmup' || s.isWarmup;
        var isPR = s.setType==='pr' || s.isPR;
        var rowCls = isWarmup ? 'sc-wu' : isPR ? 'sc-pr' : 'sc-wk';
        var typeLabel = isWarmup ? 'Échauff.' : isPR ? '🏆 PR' : 'Travail';
        return '<tr class="'+rowCls+'">'+
          '<td class="sc-set-n">'+(i+1)+'</td>'+
          '<td class="sc-set-type"><span>'+typeLabel+'</span></td>'+
          '<td class="sc-set-load">'+(w>0?w+'kg':'—')+'</td>'+
          '<td class="sc-set-reps">'+(r>0?'×'+r:'—')+'</td>'+
          '<td class="sc-set-rest">'+rest+'</td>'+
        '</tr>';
      }).join('');
      setsHtml = '<table class="sc-sets-table">'+
        '<tr><th>S</th><th>Type</th><th>Charge</th><th>Reps</th><th>Repos</th></tr>'+
        rows+'</table>';
    }

    return '<div class="sc-exo-block">'+
      '<div class="sc-exo-head2">'+
        '<div class="sc-exo-ico2" style="background:'+ms.bg+'">'+ms.icon+'</div>'+
        '<span class="sc-exo-name2">'+exo.name+'</span>'+
        '<span class="sc-exo-best2" style="'+bestColor+'">'+best+'</span>'+
      '</div>'+
      setsHtml+
    '</div>';
  }).join('');

  return '<div class="sc-detail-inner">'+
    '<div class="sc-detail-lbl">Détail · '+exos.length+' exercice'+(exos.length>1?'s':'')+'</div>'+
    exoBlocks+
    '<div class="sc-actions">'+
      '<button class="sc-action-btn" style="color:var(--accent);border-color:rgba(10,132,255,.2);background:rgba(10,132,255,.08);" onclick="copySessionToGo(\''+session.id+'\')">↩ Copier dans GO</button>'+
      '<button class="sc-action-btn" style="color:var(--sub);border-color:var(--border);background:var(--surface);" onclick="openSessionEditor(\''+session.id+'\')">✏️ Modifier</button>'+
    '</div>'+
  '</div>';
}

function togSc2(uid) {
  var det = document.getElementById('det-'+uid);
  if (!det) return;
  var was = det.classList.contains('open');
  document.querySelectorAll('.sc-detail.open').forEach(function(d){ d.classList.remove('open'); });
  if (!was) det.classList.add('open');
  closeAllScMenus();
}

function togScMenu(id) {
  var m = document.getElementById(id);
  if (!m) return;
  var was = m.classList.contains('open');
  closeAllScMenus();
  if (!was) m.classList.add('open');
}

function closeAllScMenus() {
  document.querySelectorAll('.sc-dropdown.open').forEach(function(d){ d.classList.remove('open'); });
}

function copySessionToGo(sessionId) {
  var session = db.logs.find(function(l){ return l.id===sessionId; });
  if (!session) { showToast('Séance introuvable'); return; }
  db._copiedSession = session;
  showToast('✅ Séance copiée — ouvre GO pour la lancer');
  showSeancesSub('seances-go', document.querySelector('[onclick*="seances-go"]'));
}

function shareSessionToFeed(sessionId) {
  var session = db.logs.find(function(l){ return l.id===sessionId; });
  if (!session) return;
  if (typeof publishSessionActivity==='function') {
    publishSessionActivity(session);
    showToast('📤 Partagé dans le feed !');
  } else {
    showToast('Social non disponible');
  }
}

function toggleSession(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}
function toggleScExo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
  const chev = document.getElementById('chev-' + id);
  if (chev) chev.classList.toggle('open', el.classList.contains('open'));
}
function deleteSessionFromList(logId) {
  showModal('Supprimer cette séance ?', 'Supprimer', 'var(--red)', () => {
    db.logs = db.logs.filter(l => l.id !== logId);
    db.reports = db.reports.filter(r => !(r.type==='debrief' && r.sessionId===logId));
    saveDBNow(); renderSeancesTab(); showToast('✓ Séance supprimée');
  });
}

// ============================================================
// STATS — RADAR AMÉLIORÉ
// ============================================================
const MUSCLE_COLORS_RADAR = {
  'Dos':'#FF9F0A','Pecs':'#0A84FF','Abdos':'#FF453A',
  'Jambes':'#32D74B','Bras':'#64D2FF','Épaules':'#BF5AF2','Cardio':'#FF6B00'
};
const RADAR_AXES = ['Dos','Pecs','Abdos','Jambes','Bras','Épaules','Cardio'];

function renderRadarImproved(period) {
  period = period || 'week';
  document.getElementById('radarBtn7').classList.toggle('active', period==='week');
  document.getElementById('radarBtn30').classList.toggle('active', period==='month');

  const rl = getLogsInRange(period==='week' ? 7 : 30);

  // Compter séries ET nombre d'exercices distincts par groupe
  const msSets = {}; const msExos = {};
  RADAR_AXES.forEach(k => { msSets[k] = 0; msExos[k] = new Set(); });

  rl.forEach(l => l.exercises.forEach(e => {
    const mg = getMuscleGroupParent(getMuscleGroup(e.name));
    if (msSets.hasOwnProperty(mg)) {
      msSets[mg] += e.sets;
      msExos[mg].add(e.name);
    }
  }));

  // Séries brutes par groupe — pas de normalisation artificielle
  const values = RADAR_AXES.map(k => msSets[k] || 0);
  const rawMax = Math.max(...values, 1);

  // Pas propre pour les anneaux (ex: max=28 → step=5, ringMax=30)
  function niceStep(v) {
    if (v <= 5) return 1;
    if (v <= 15) return 2;
    if (v <= 40) return 5;
    if (v <= 100) return 10;
    return 20;
  }
  const step = niceStep(rawMax / 4);
  const ringMax = Math.ceil(rawMax / step) * step || 4;
  const numRings = 4;
  const numAxes = RADAR_AXES.length;
  const R = 95, cx = 150, cy = 135;
  const angleStep = (2 * Math.PI) / numAxes;

  let svg = '<svg viewBox="0 0 300 270" style="width:100%;height:100%;max-width:100%;">';

  // Grid rings avec labels propres (multiples du step)
  for (let lv = 1; lv <= numRings; lv++) {
    const r = (lv / numRings) * R;
    const pts = [];
    for (let i = 0; i < numAxes; i++) {
      const a = i * angleStep - Math.PI/2;
      pts.push((cx + r*Math.cos(a)).toFixed(1) + ',' + (cy + r*Math.sin(a)).toFixed(1));
    }
    svg += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="rgba(255,255,255,' + (lv===numRings?'0.14':'0.06') + ')" stroke-width="' + (lv===numRings?'1.5':'0.8') + '"/>';
    const labelVal = Math.round((lv / numRings) * ringMax);
    svg += '<text x="' + (cx + r + 4) + '" y="' + (cy - 4) + '" fill="rgba(134,134,139,0.65)" font-size="8" dominant-baseline="middle">' + labelVal + '</text>';
  }

  // Axis lines
  for (let i = 0; i < numAxes; i++) {
    const a = i * angleStep - Math.PI/2;
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R*Math.cos(a)).toFixed(1) + '" y2="' + (cy + R*Math.sin(a)).toFixed(1) + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
  }

  // Data polygon — basé sur séries brutes / ringMax
  const dp = [];
  for (let i = 0; i < numAxes; i++) {
    const a = i * angleStep - Math.PI/2;
    const r = (values[i] / ringMax) * R;
    dp.push({ x: cx + r*Math.cos(a), y: cy + r*Math.sin(a), color: MUSCLE_COLORS_RADAR[RADAR_AXES[i]] });
  }
  svg += '<polygon points="' + dp.map(p => p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ') + '" fill="rgba(10,132,255,0.1)" stroke="#0A84FF" stroke-width="2" stroke-linejoin="round"/>';

  // Points + labels
  RADAR_AXES.forEach((muscle, i) => {
    const a = i * angleStep - Math.PI/2;
    const color = MUSCLE_COLORS_RADAR[muscle];
    const lDist = R + 30;
    const lx = cx + lDist * Math.cos(a);
    const ly = cy + lDist * Math.sin(a);
    const val = values[i];

    svg += '<circle cx="' + dp[i].x.toFixed(1) + '" cy="' + dp[i].y.toFixed(1) + '" r="' + (val > 0 ? 5 : 3) + '" fill="' + (val > 0 ? color : '#3A3A3C') + '" stroke="var(--card)" stroke-width="2"/>';
    svg += '<text x="' + lx.toFixed(1) + '" y="' + (ly - 6).toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" fill="' + (val > 0 ? color : '#5A5A5E') + '" font-size="11" font-weight="600">' + muscle + '</text>';
    if (val > 0) svg += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 7).toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" fill="' + color + '" font-size="9" opacity="0.9">' + val + 's</text>';
  });

  svg += '</svg>';
  const ct = document.getElementById('radarContainer'); if (ct) ct.innerHTML = svg;

  // Légende — séries brutes
  const legend = document.getElementById('radarLegend');
  if (legend) legend.innerHTML = RADAR_AXES.map((muscle, i) => {
    const val = values[i] || 0;
    const color = MUSCLE_COLORS_RADAR[muscle];
    return '<div style="display:flex;align-items:center;gap:5px;font-size:11px;">' +
      '<div style="width:10px;height:10px;border-radius:50%;background:' + (val>0?color:'#3A3A3C') + '"></div>' +
      '<span style="color:' + (val>0?'var(--text)':'var(--sub)') + '">' + muscle + ': <strong>' + val + '</strong></span></div>';
  }).join('');
}

// ============================================================
// STATS — VOLUME MUSCULAIRE avec évolution 4 semaines
// ============================================================
function setMuscleView(v) {
  currentMuscleView = v;
  document.getElementById('muscleViewBarsBtn').classList.toggle('active', v==='bars');
  document.getElementById('muscleViewEvolBtn').classList.toggle('active', v==='evol');
  document.getElementById('muscleViewBarsSection').style.display = v==='bars' ? 'block' : 'none';
  document.getElementById('muscleViewEvolSection').style.display = v==='evol' ? 'block' : 'none';
  if (v === 'evol') renderMuscleEvolChart();
  else renderMuscleVolumeContent(window._musclePeriod || 'week');
}

function renderMuscleEvolChart() {
  const ctx = document.getElementById('chartMuscleEvol'); if (!ctx) return;
  if (chartMuscleEvol) chartMuscleEvol.destroy();

  const now = Date.now(); const week = 7*86400000;
  const weeks = [
    { label:'S-3', start:now-4*week, end:now-3*week },
    { label:'S-2', start:now-3*week, end:now-2*week },
    { label:'S-1', start:now-2*week, end:now-week },
    { label:'Cette sem.', start:now-week, end:now }
  ];
  const muscles = ['Jambes','Dos','Pecs','Épaules','Bras','Abdos','Cardio'];
  // Single pass: accumulate sets per muscle per week bucket
  const weekBuckets = weeks.map(() => ({})); // array of { muscle: sets }
  muscles.forEach(m => weekBuckets.forEach(b => b[m] = 0));
  db.logs.forEach(l => {
    for (let wi = 0; wi < weeks.length; wi++) {
      if (l.timestamp >= weeks[wi].start && l.timestamp <= weeks[wi].end) {
        l.exercises.forEach(e => {
          const mg = getMuscleGroupParent(getMuscleGroup(e.name));
          if (weekBuckets[wi].hasOwnProperty(mg)) weekBuckets[wi][mg] += e.sets;
        });
        break; // a log can only be in one week
      }
    }
  });
  const datasets = muscles.map(mg => {
    const color = MUSCLE_COLORS_RADAR[mg] || '#86868B';
    return {
      label: mg,
      data: weekBuckets.map(b => b[mg] || 0),
      borderColor: color, backgroundColor: color + '22',
      borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: color, tension: 0.3, fill: false
    };
  }).filter(d => d.data.some(v => v > 0));

  // Filters
  const fEl = document.getElementById('muscleEvolFilters');
  if (fEl) fEl.innerHTML = datasets.map(d =>
    '<button class="lifts-filter-chip active" onclick="toggleEvolFilter(this,\'' + d.label + '\')" style="border-color:' + MUSCLE_COLORS_RADAR[d.label] + ';color:' + MUSCLE_COLORS_RADAR[d.label] + '">' + d.label + '</button>'
  ).join('');

  chartMuscleEvol = new Chart(ctx, {
    type: 'line',
    data: { labels: weeks.map(w => w.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y + 's' } } },
      scales: {
        y: { grid: { color: '#2C2C2E' }, ticks: { color: '#86868B', callback: v => v + 's' }, beginAtZero: true },
        x: { grid: { display: false }, ticks: { color: '#86868B' } }
      }
    }
  });
}
function toggleEvolFilter(btn, muscle) {
  if (!chartMuscleEvol) return;
  btn.classList.toggle('active');
  const ds = chartMuscleEvol.data.datasets.find(d => d.label === muscle);
  if (ds) ds.hidden = !btn.classList.contains('active');
  chartMuscleEvol.update();
}

// ============================================================
// STATS — MEILLEURS LIFTS refaits
// ============================================================
function renderLifts() {
  const liftMap = {};
  const limit180 = Date.now() - 180*86400000;
  const recentLogs = db.logs.filter(l => l.timestamp >= limit180);
  const exoCount = {};
  recentLogs.forEach(log => {
    const seen = new Set();
    log.exercises.forEach(e => { if (!seen.has(e.name)) { exoCount[e.name] = (exoCount[e.name]||0)+1; seen.add(e.name); } });
  });

  db.logs.forEach(log => {
    log.exercises.forEach(exo => {
      if (SESSION_NAME_BLACKLIST.test(exo.name.toLowerCase())) return;
      if ((exoCount[exo.name]||0) < 3) return;
      if (VARIANT_KEYWORDS.some(kw => exo.name.toLowerCase().includes(kw))) return;
      const exoType = getExoType(exo.name);
      if (exoType !== 'weight' && exoType !== 'reps') return;
      if (!exo.maxRM || exo.maxRM <= 0) return;
      const muscle = getMuscleGroup(exo.name);
      const canonKey = Object.keys(liftMap).find(k => matchExoName(exo.name, k)) || exo.name;
      if (!liftMap[canonKey]) liftMap[canonKey] = { name: canonKey, muscle, maxRM: 0, maxRMDate: null, repRecords: {}, history: [] };
      const l = liftMap[canonKey];
      if (exo.maxRM > l.maxRM) { l.maxRM = exo.maxRM; l.maxRMDate = exo.maxRMDate; }
      else if (exo.maxRM === l.maxRM && exo.maxRMDate && (!l.maxRMDate || exo.maxRMDate > l.maxRMDate)) { l.maxRMDate = exo.maxRMDate; }
      if (exo.repRecords) Object.entries(exo.repRecords).forEach(([r,w]) => { if (!l.repRecords[r] || w > l.repRecords[r]) l.repRecords[r] = w; });
    });
  });

  const lifts = Object.values(liftMap).sort((a,b) => b.maxRM - a.maxRM);
  const muscles = ['Tout', ...new Set(lifts.map(l => l.muscle))];

  document.getElementById('liftsFilterRow').innerHTML = muscles.map(m =>
    '<button class="lifts-filter-chip' + (m===liftsMuscleFilter?' active':'') + '" onclick="setLiftsFilter(\'' + m + '\')">' + m + '</button>'
  ).join('');

  const filtered = liftsMuscleFilter === 'Tout' ? lifts : lifts.filter(l => l.muscle === liftsMuscleFilter);
  const el = document.getElementById('liftsList');
  if (!filtered.length) {
    const hasLogs = db.logs && db.logs.length > 0;
    el.innerHTML = '<div style="text-align:center;padding:24px 0;">' +
      '<div style="font-size:28px;margin-bottom:10px;">' + (hasLogs ? '💪' : '📥') + '</div>' +
      '<div style="font-size:13px;color:var(--sub);line-height:1.6;">' +
      (hasLogs ? 'Aucun lift trouvé pour ce filtre.<br>Essaie "Tout".' : 'Importe des séances depuis Hevy<br>dans <strong style="color:var(--text);">Réglages → 📥 Import</strong>') +
      '</div></div>';
    return;
  }

  const displayLifts = filtered.slice(0, 10);
  const sortedLogs = getSortedLogs().slice().reverse();
  displayLifts.forEach(lift => {
    let runMax = 0; const pts = [];
    sortedLogs.forEach(log => {
      log.exercises.forEach(exo => {
        if (matchExoName(exo.name, lift.name) && exo.maxRM > 0 && exo.maxRM > runMax) {
          runMax = exo.maxRM;
          pts.push({ rm: exo.maxRM, date: log.shortDate||formatDate(log.timestamp), ts: log.timestamp });
        }
      });
    });
    lift.history = pts;
  });

  const RANK_STYLES = [
    'background:rgba(255,215,0,0.15);color:#FFD700;',
    'background:rgba(192,192,192,0.12);color:#C0C0C0;',
    'background:rgba(205,127,50,0.12);color:#CD7F32;'
  ];

  el.innerHTML = displayLifts.map((lift, idx) => {
    const color = MUSCLE_COLORS_RADAR[lift.muscle] || '#86868B';
    const bwRatio = db.user.bw > 0 ? (lift.maxRM / db.user.bw).toFixed(2) : null;
    const prDate = lift.maxRMDate ? formatDate(lift.maxRMDate) : '—';
    const isSBD = !!getSBDType(lift.name);
    const rankStyle = idx < 3 ? RANK_STYLES[idx] : 'background:var(--surface);color:var(--sub);';
    const lcId = 'lc-' + idx;

    // Badges
    let badgesHtml = '';
    if (isSBD && modeFeature('showSBDCards')) badgesHtml += '<span class="lc-badge purple">SBD</span>';
    if (bwRatio && modeFeature('showBWRatio')) badgesHtml += '<span class="lc-badge blue">×' + bwRatio + ' bw</span>';
    if (lift.history.length > 1) {
      const gain = lift.history[lift.history.length-1].rm - lift.history[0].rm;
      badgesHtml += '<span class="lc-badge ' + (gain >= 0 ? 'green' : 'orange') + '">' + (gain >= 0 ? '+' : '') + gain + 'kg total</span>';
    }

    // Sparkline SVG with gradient + date tooltips
    let sparkHtml = '';
    if (lift.history.length > 1) {
      const vals = lift.history.map(p => p.rm);
      const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1;
      const W = 280, H = 50, pad = 4, topPad = 16;
      const points = vals.map((v, i) => ({
        x: pad + (i / (vals.length - 1)) * (W - pad * 2),
        y: topPad + pad + (1 - (v - minV) / range) * (H - topPad - pad * 2)
      }));
      const line = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
      const area = line + ' L' + points[points.length-1].x.toFixed(1) + ',' + H + ' L' + points[0].x.toFixed(1) + ',' + H + ' Z';
      const gid = 'lcg' + Math.random().toString(36).substr(2,5);
      const tipId = 'stip-' + idx;
      const circles = points.map((p, i) =>
        '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="' + color + '" opacity="' + (i === points.length-1 ? '1' : '0.5') + '"/>' +
        '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="14" fill="transparent" class="spark-hit" ' +
        'data-tip="' + tipId + '" data-label="' + vals[i] + 'kg · ' + lift.history[i].date + '" data-color="' + color + '"/>'
      ).join('');
      sparkHtml = '<div class="lc-spark" style="position:relative;">' +
        '<div id="' + tipId + '" style="position:absolute;top:0;left:0;right:0;text-align:center;font-size:10px;font-weight:600;color:var(--sub);height:14px;pointer-events:none;opacity:0;transition:opacity 0.15s;"></div>' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="touch-action:none;">' +
        '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity="0.15"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
        '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        circles +
        '</svg></div>';
    }

    // RM grid — reps dynamiques pour garantir au moins un ✓
    const STANDARD_REPS = [1, 3, 5, 8, 10, 12];
    const realReps = Object.keys(lift.repRecords).map(Number).filter(r => r > 0).sort((a,b) => a - b);
    const standardWithReal = STANDARD_REPS.filter(r => lift.repRecords[String(r)]);

    let TARGET_REPS;
    if (standardWithReal.length >= 1) {
      TARGET_REPS = STANDARD_REPS;
    } else if (realReps.length > 0) {
      const toInclude = realReps.slice(0, 3);
      const remaining = STANDARD_REPS.filter(r => !toInclude.includes(r));
      TARGET_REPS = [...toInclude, ...remaining].sort((a,b) => a - b).slice(0, 6);
    } else {
      TARGET_REPS = STANDARD_REPS;
    }

    const rmCells = TARGET_REPS.map(r => {
      const theo = r === 1 ? lift.maxRM : Math.round((lift.maxRM * (1.0278 - 0.0278 * r)) * 2) / 2;
      const realKg = lift.repRecords[String(r)] || null;
      const label = r === 1 ? '1RM' : r + ' reps';
      let realHtml = '', cls = 'miss';
      if (realKg) {
        const gap = theo - realKg;
        if (gap > 2.5) { cls = 'pot'; realHtml = realKg + 'kg ↑'; }
        else { cls = 'done'; realHtml = realKg + 'kg ✓'; }
      } else { realHtml = '—'; }
      return '<div class="lc-rm-cell">' +
        '<div class="lc-rm-label">' + label + '</div>' +
        '<div class="lc-rm-est">' + theo + 'kg</div>' +
        '<div class="lc-rm-real ' + cls + '">' + realHtml + '</div></div>';
    }).join('');

    const uid = 'lcc' + Math.random().toString(36).substr(2,5);

    return '<div class="lc">' +
      '<div class="lc-head">' +
        '<div class="lc-rank" style="' + rankStyle + '">' + (idx + 1) + '</div>' +
        '<div class="lc-info"><div class="lc-name">' + lift.name + '</div>' +
        '<div class="lc-muscle" style="color:' + color + ';">' + lift.muscle + '</div></div>' +
        '<div class="lc-right"><div class="lc-e1rm">' + lift.maxRM + '<span>kg</span></div>' +
        '<div class="lc-date">' + prDate + '</div></div>' +
      '</div>' +
      (badgesHtml ? '<div class="lc-badges">' + badgesHtml + '</div>' : '') +
      sparkHtml +
      '<div class="lc-toggle" onclick="toggleLiftCard(\'' + lcId + '\')">Voir détails <span class="chev">▾</span></div>' +
      '<div class="lc-body" id="' + lcId + '">' +
        '<div class="lc-rm-grid">' + rmCells + '</div>' +
        '<div class="lc-calc"><span class="lc-calc-lbl">Calcul rapide</span>' +
        '<input type="number" min="1" max="30" placeholder="reps" oninput="calcLiftWeight(this,' + lift.maxRM + ',\'' + uid + '\')">' +
        '<span style="color:var(--sub);">→</span><span class="lc-calc-res" id="' + uid + '">—</span></div>' +
      '</div></div>';
  }).join('');

  // Délégation d'événements pour les tooltips sparkline
  el.addEventListener('mouseenter', function(e) {
    var hit = e.target.closest('.spark-hit');
    if (!hit) return;
    var tip = document.getElementById(hit.dataset.tip);
    if (tip) { tip.innerHTML = '<span style="color:' + hit.dataset.color + ';">' + hit.dataset.label + '</span>'; tip.style.opacity = '1'; }
  }, true);
  el.addEventListener('mouseleave', function(e) {
    var hit = e.target.closest('.spark-hit');
    if (!hit) return;
    var tip = document.getElementById(hit.dataset.tip);
    if (tip) tip.style.opacity = '0';
  }, true);
  el.addEventListener('touchstart', function(e) {
    var hit = e.target.closest('.spark-hit');
    if (!hit) return;
    e.preventDefault();
    var tip = document.getElementById(hit.dataset.tip);
    if (tip) { tip.innerHTML = '<span style="color:' + hit.dataset.color + ';">' + hit.dataset.label + '</span>'; tip.style.opacity = '1'; setTimeout(function() { tip.style.opacity = '0'; }, 2000); }
  }, {passive: false});
}

function setLiftsFilter(muscle) {
  liftsMuscleFilter = muscle;
  renderLifts();
}

function toggleLiftCard(id) {
  const body = document.getElementById(id);
  if (!body) return;
  body.classList.toggle('open');
  const card = body.closest('.lc');
  if (card) {
    const toggle = card.querySelector('.lc-toggle');
    if (toggle) toggle.classList.toggle('open', body.classList.contains('open'));
  }
}

function calcLiftWeight(input, e1rm, uid) {
  const r = parseInt(input.value);
  const out = document.getElementById(uid);
  if (!out) return;
  if (!r || r < 1 || r > 30) { out.textContent = '—'; return; }
  const w = r === 1 ? e1rm : Math.round((e1rm * (1.0278 - 0.0278 * r)) * 2) / 2;
  out.textContent = '~' + w + 'kg';
}

function updateNutriTargets() {
  const kcal = parseFloat(document.getElementById('inputKcalBase').value);
  const bw   = parseFloat(document.getElementById('inputBWBase').value);
  if (kcal > 0) db.user.kcalBase = kcal;
  if (bw   > 0) db.user.bwBase   = bw;
  saveDB();
  showToast('✓ Cibles nutritionnelles sauvegardées');
}

// ============================================================
// ACCORDÉON RÉGLAGES
// ============================================================
// Lazy-render flags for heavy accordion content
var _accDirty = { records: true, keylifts: true, prog: true };

function toggleAcc(id) {
  const body = document.getElementById(id);
  const chev = document.getElementById('chev-' + id);
  if (!body) return;
  const isOpen = body.classList.contains('open');
  const opening = !isOpen;
  body.classList.toggle('open', opening);
  if (chev) chev.classList.toggle('open', opening);
  // Lazy render heavy content only when accordion opens
  if (opening) {
    if (id === 'acc-records' && _accDirty.records) { _accDirty.records = false; renderRecordsCorrectionList(); }
    if (id === 'acc-keylifts' && _accDirty.keylifts) { _accDirty.keylifts = false; renderKeyLiftsEditor(); }
    if (id === 'acc-prog' && _accDirty.prog) { _accDirty.prog = false; renderSettingsRoutineEditor(); }
    if (id === 'acc-glossary') { renderGlossaryPage(); }
  }
}

function fillSettingsFields() {
  const ni = document.getElementById('inputName'); if (ni && db.user.name) ni.value = db.user.name;
  const bi = document.getElementById('inputBW'); if (bi) bi.value = db.user.bw || '';
  const kEl = document.getElementById('inputKcalBase'); if (kEl) kEl.value = db.user.kcalBase || 2300;
  const bwEl = document.getElementById('inputBWBase'); if (bwEl) bwEl.value = db.user.bwBase || 80;
  const tB = document.getElementById('tgtBench'), tS = document.getElementById('tgtSquat'), tD = document.getElementById('tgtDead');
  if (tB) tB.value = db.user.targets.bench; if (tS) tS.value = db.user.targets.squat; if (tD) tD.value = db.user.targets.deadlift;
  renderSettingsProfile();
  if (typeof renderStorageGauge === 'function') renderStorageGauge();
  if (typeof renderTierSection === 'function') renderTierSection();
  // Mark lazy accordions as dirty so they render on open
  _accDirty.records = true;
  _accDirty.keylifts = true;
  _accDirty.prog = true;
}

// ── Tier & Thèmes — rendu de la section statut ──
function renderTierBadge(tier) {
  if (tier === 'founder') return '<span class="badge-founder" style="background:var(--founder-gradient);color:var(--founder-text);padding:1px 6px;border-radius:4px;font-size:9px;font-weight:800;">FOUNDER</span>';
  if (tier === 'early_adopter') return '<span style="background:rgba(199,199,204,0.2);color:#C7C7CC;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:800;">EARLY ADOPTER</span>';
  return '';
}

function isCreator() {
  return db.user.name === 'Aurélien' || db.user.isCreator === true;
}

function renderTierSection() {
  // Déterminer le tier actuel
  var tier = 'member';
  if (db.isFounder || db.godMode) tier = 'founder';
  else if (db.isEarlyAdopter) tier = 'early_adopter';
  else if (db.user && db.user.tier) tier = db.user.tier;

  var isFounder = tier === 'founder' || isCreator();
  var isEA = tier === 'early_adopter' || isFounder;

  // Section bienvenue
  var welcomeEl = document.getElementById('tierWelcomeSection');
  if (welcomeEl) {
    var wh = '';
    if (isFounder) {
      wh = '<div style="text-align:center;padding:12px;background:linear-gradient(135deg,rgba(200,133,10,0.1),rgba(232,184,48,0.05));border-radius:12px;margin-bottom:12px;">';
      wh += '<div style="font-size:28px;margin-bottom:4px;">👑</div>';
      wh += '<div style="font-size:14px;font-weight:700;color:#E8B830;">Founder</div>';
      wh += '<div style="font-size:11px;color:var(--sub);margin-top:4px;">Accès complet à tous les thèmes et fonctionnalités exclusives.</div>';
      wh += '</div>';
    } else if (isEA) {
      wh = '<div style="text-align:center;padding:12px;background:rgba(199,199,204,0.05);border-radius:12px;margin-bottom:12px;">';
      wh += '<div style="font-size:28px;margin-bottom:4px;">⭐</div>';
      wh += '<div style="font-size:14px;font-weight:700;color:#C7C7CC;">Early Adopter</div>';
      wh += '<div style="font-size:11px;color:var(--sub);margin-top:4px;">Merci de faire partie des premiers !</div>';
      wh += '</div>';
    } else {
      wh = '<div style="text-align:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:12px;">';
      wh += '<div style="font-size:14px;color:var(--sub);">Membre</div>';
      wh += '</div>';
    }
    welcomeEl.innerHTML = wh;
  }

  // Section badges tier
  var badgesEl = document.getElementById('tierBadgesSection');
  if (badgesEl) {
    var bh = '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    bh += '<div style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;' + (isFounder ? 'background:var(--founder-gradient);color:var(--founder-text);' : 'background:rgba(255,255,255,0.05);color:var(--sub);opacity:0.4;') + '">Founder</div>';
    bh += '<div style="padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;' + (isEA ? 'background:rgba(199,199,204,0.15);color:#C7C7CC;' : 'background:rgba(255,255,255,0.05);color:var(--sub);opacity:0.4;') + '">Early Adopter</div>';
    bh += '</div>';
    badgesEl.innerHTML = bh;
  }

  // Section thèmes
  var themeEl = document.getElementById('themeSelector');
  if (themeEl) {
    var saved = localStorage.getItem('selectedTheme') || 'default';
    var themes = [
      { id: 'default', name: 'Bleu iOS', color: '#0A84FF', locked: false },
      { id: 'silver', name: 'Silver', color: '#C7C7CC', locked: !isEA },
      { id: 'gold', name: 'Gold', color: '#E8B830', locked: !isFounder }
    ];
    var th = '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    themes.forEach(function(t) {
      var isActive = saved === t.id;
      var clickable = !t.locked;
      var style = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;cursor:' + (clickable ? 'pointer' : 'default') + ';';
      style += 'background:' + (isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)') + ';';
      style += 'border:1px solid ' + (isActive ? t.color : 'rgba(255,255,255,0.06)') + ';';
      style += t.locked ? 'opacity:0.35;' : '';
      var onclick = clickable ? 'applyThemeWithCheck(\'' + t.id + '\');setTimeout(renderTierSection,200);' : '';
      th += '<div style="' + style + '" onclick="' + onclick + '">';
      th += '<div style="width:20px;height:20px;border-radius:50%;background:' + t.color + ';flex-shrink:0;"></div>';
      th += '<div><div style="font-size:12px;font-weight:600;color:var(--text);">' + t.name + '</div>';
      if (t.locked) th += '<div style="font-size:10px;color:var(--sub);">🔒 ' + (t.id === 'gold' ? 'Founder' : 'Early Adopter') + '</div>';
      th += '</div></div>';
    });
    th += '</div>';
    themeEl.innerHTML = th;
  }
}

// ── Settings Profile Editor ──────────────────────────────────
// Debounced save for rapid toggle interactions (avoids clearCaches + JSON.stringify on each click)
let _saveSettingsTimer = null;
function _debouncedSaveSettings() {
  if (_saveSettingsTimer) clearTimeout(_saveSettingsTimer);
  _saveSettingsTimer = setTimeout(() => { saveDB(); _saveSettingsTimer = null; }, 300);
}

function updateProfileField(field, value) {
  if (!db.user.programParams) db.user.programParams = {};
  if (field === 'level') {
    db.user.level = value;
    db.user.programParams.level = value;
  } else if (field === 'trainingMode') {
    db.user.trainingMode = value;
  } else {
    db.user.programParams[field] = value;
  }
  _debouncedSaveSettings();
  showToast('✓ Profil mis à jour');
}

function renderSettingsProfile() {
  const params = db.user.programParams || {};

  // Niveau
  const lvl = document.getElementById('settingsLevel');
  if (lvl) lvl.value = db.user.level || 'intermediaire';

  // Genre
  const genderEl = document.getElementById('settingsGender');
  if (genderEl) genderEl.value = db.user.gender || 'unspecified';

  // Mode d'entraînement
  const modeEl = document.getElementById('settingsTrainingMode');
  if (modeEl) modeEl.value = db.user.trainingMode || 'powerlifting';

  // Niveau de détail UI
  const uiDetailEl = document.getElementById('settingsUIDetail');
  if (uiDetailEl) uiDetailEl.value = db.user.uiDetail || 'auto';

  // Objectifs (toggle buttons)
  const goalsEl = document.getElementById('settingsGoals');
  if (goalsEl) {
    const allGoals = [
      { id:'force', icon:'🏋️', label:'Force' },
      { id:'masse', icon:'💪', label:'Masse' },
      { id:'seche', icon:'🔥', label:'Sèche' },
      { id:'recompo', icon:'⚖️', label:'Recompo' },
      { id:'maintien', icon:'🎯', label:'Maintien' },
      { id:'reprise', icon:'🌱', label:'Reprise' },
    ];
    const selected = params.goals || ['force'];
    goalsEl.innerHTML = allGoals.map(g => {
      const active = selected.includes(g.id);
      return `<button class="settings-toggle-btn ${active?'active':''}" onclick="toggleSettingsGoal('${g.id}', this)" style="padding:6px 12px;border-radius:8px;border:1px solid ${active?'var(--blue)':'var(--border)'};background:${active?'rgba(10,132,255,0.15)':'var(--surface)'};color:${active?'var(--blue)':'var(--sub)'};font-size:12px;font-weight:600;cursor:pointer;">${g.icon} ${g.label}</button>`;
    }).join('');
  }

  // Fréquence
  const freqEl = document.getElementById('settingsFreq');
  if (freqEl) {
    const currentFreq = params.freq || 3;
    freqEl.innerHTML = [1,2,3,4,5,6].map(f => {
      const active = f === currentFreq;
      return `<button class="settings-toggle-btn ${active?'active':''}" onclick="setSettingsFreq(${f}, this)" style="padding:6px 14px;border-radius:8px;border:1px solid ${active?'var(--blue)':'var(--border)'};background:${active?'rgba(10,132,255,0.15)':'var(--surface)'};color:${active?'var(--blue)':'var(--sub)'};font-size:13px;font-weight:700;cursor:pointer;">${f}j/sem</button>`;
    }).join('');
  }

  // Jours d'entraînement
  const daysEl = document.getElementById('settingsDays');
  if (daysEl) {
    const currentDays = params.selectedDays || [];
    const dayLabels = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
    daysEl.innerHTML = dayLabels.map(d => {
      const active = currentDays.includes(d);
      return `<button class="settings-toggle-btn ${active?'active':''}" onclick="toggleSettingsDay('${d}', this)" style="padding:6px 12px;border-radius:8px;border:1px solid ${active?'var(--blue)':'var(--border)'};background:${active?'rgba(10,132,255,0.15)':'var(--surface)'};color:${active?'var(--blue)':'var(--sub)'};font-size:12px;font-weight:600;cursor:pointer;">${d.substring(0,3)}</button>`;
    }).join('');
  }

  // Matériel
  const matEl = document.getElementById('settingsMat');
  if (matEl) {
    const currentMat = params.mat || 'salle';
    const mats = [{id:'salle',label:'🏢 Salle'},{id:'halteres',label:'🏠 Haltères'},{id:'maison',label:'🏡 Maison'}];
    matEl.innerHTML = mats.map(m => {
      const active = m.id === currentMat;
      return `<button class="settings-toggle-btn ${active?'active':''}" onclick="setSettingsMat('${m.id}', this)" style="padding:6px 14px;border-radius:8px;border:1px solid ${active?'var(--blue)':'var(--border)'};background:${active?'rgba(10,132,255,0.15)':'var(--surface)'};color:${active?'var(--blue)':'var(--sub)'};font-size:12px;font-weight:600;cursor:pointer;">${m.label}</button>`;
    }).join('');
  }

  // Durée
  const durEl = document.getElementById('settingsDuration');
  if (durEl) {
    const currentDur = params.duration || 60;
    const durs = [{v:30,l:'30min'},{v:45,l:'45min'},{v:60,l:'1h'},{v:75,l:'1h15'},{v:90,l:'1h30'},{v:120,l:'2h'}];
    durEl.innerHTML = durs.map(d => {
      const active = d.v === currentDur;
      return `<button class="settings-toggle-btn ${active?'active':''}" onclick="setSettingsDuration(${d.v}, this)" style="padding:6px 12px;border-radius:8px;border:1px solid ${active?'var(--blue)':'var(--border)'};background:${active?'rgba(10,132,255,0.15)':'var(--surface)'};color:${active?'var(--blue)':'var(--sub)'};font-size:12px;font-weight:600;cursor:pointer;">${d.l}</button>`;
    }).join('');
  }

  // Blessures
  const injEl = document.getElementById('settingsInjuries');
  if (injEl) {
    const currentInj = params.injuries || [];
    const zones = ['Épaules','Genoux','Dos','Poignets','Nuque','Hanches'];
    injEl.innerHTML = zones.map(z => {
      const active = currentInj.includes(z);
      return `<button class="settings-toggle-btn ${active?'active':''}" onclick="toggleSettingsInjury('${z}', this)" style="padding:6px 12px;border-radius:8px;border:1px solid ${active?'var(--orange)':'var(--border)'};background:${active?'rgba(255,159,10,0.15)':'var(--surface)'};color:${active?'var(--orange)':'var(--sub)'};font-size:12px;font-weight:600;cursor:pointer;">${z}</button>`;
    }).join('');
  }

  // Cardio
  const cardioEl = document.getElementById('settingsCardio');
  if (cardioEl) {
    const currentCardio = params.cardio || 'integre';
    const opts = [{id:'integre',l:'🏃 Intégré'},{id:'dedie',l:'📅 Jours dédiés'},{id:'aucun',l:'❌ Aucun'}];
    cardioEl.innerHTML = opts.map(o => {
      const active = o.id === currentCardio;
      return `<button class="settings-toggle-btn ${active?'active':''}" onclick="setSettingsCardio('${o.id}', this)" style="padding:6px 12px;border-radius:8px;border:1px solid ${active?'var(--blue)':'var(--border)'};background:${active?'rgba(10,132,255,0.15)':'var(--surface)'};color:${active?'var(--blue)':'var(--sub)'};font-size:12px;font-weight:600;cursor:pointer;">${o.l}</button>`;
    }).join('');
  }
}

function toggleSettingsGoal(goalId, btn) {
  if (!db.user.programParams) db.user.programParams = {};
  const goals = db.user.programParams.goals || ['force'];
  const idx = goals.indexOf(goalId);
  if (idx >= 0) { if (goals.length > 1) goals.splice(idx, 1); else return; }
  else goals.push(goalId);
  db.user.programParams.goals = goals;
  _debouncedSaveSettings();
  // Toggle just this button instead of re-rendering all groups
  const active = goals.includes(goalId);
  btn.classList.toggle('active', active);
  btn.style.borderColor = active ? 'var(--blue)' : 'var(--border)';
  btn.style.background = active ? 'rgba(10,132,255,0.15)' : 'var(--surface)';
  btn.style.color = active ? 'var(--blue)' : 'var(--sub)';
}

function setSettingsGender(g) { db.user.gender = g; _debouncedSaveSettings(); showToast('✓ Profil mis à jour'); }

// Helper to toggle a single-select button group without full re-render
function _toggleSingleSelect(containerId, btn, field, value, color) {
  if (!db.user.programParams) db.user.programParams = {};
  db.user.programParams[field] = value;
  const c = color || 'var(--blue)';
  const container = document.getElementById(containerId);
  if (container) {
    container.querySelectorAll('.settings-toggle-btn').forEach(b => {
      b.classList.remove('active');
      b.style.borderColor = 'var(--border)';
      b.style.background = 'var(--surface)';
      b.style.color = 'var(--sub)';
    });
  }
  btn.classList.add('active');
  btn.style.borderColor = c;
  btn.style.background = c === 'var(--blue)' ? 'rgba(10,132,255,0.15)' : 'rgba(255,159,10,0.15)';
  btn.style.color = c;
  _debouncedSaveSettings();
}

function setSettingsFreq(f, btn) { _toggleSingleSelect('settingsFreq', btn, 'freq', f); }
function setSettingsMat(m, btn) { _toggleSingleSelect('settingsMat', btn, 'mat', m); }
function setSettingsDuration(d, btn) { _toggleSingleSelect('settingsDuration', btn, 'duration', d); }
function setSettingsCardio(c, btn) { _toggleSingleSelect('settingsCardio', btn, 'cardio', c); }

function toggleSettingsDay(day, btn) {
  if (!db.user.programParams) db.user.programParams = {};
  const days = db.user.programParams.selectedDays || [];
  const idx = days.indexOf(day);
  if (idx >= 0) days.splice(idx, 1); else days.push(day);
  db.user.programParams.selectedDays = days;
  _debouncedSaveSettings();
  const active = days.includes(day);
  btn.classList.toggle('active', active);
  btn.style.borderColor = active ? 'var(--blue)' : 'var(--border)';
  btn.style.background = active ? 'rgba(10,132,255,0.15)' : 'var(--surface)';
  btn.style.color = active ? 'var(--blue)' : 'var(--sub)';
}

function toggleSettingsInjury(zone, btn) {
  if (!db.user.programParams) db.user.programParams = {};
  const inj = db.user.programParams.injuries || [];
  const idx = inj.indexOf(zone);
  if (idx >= 0) inj.splice(idx, 1); else inj.push(zone);
  db.user.programParams.injuries = inj;
  _debouncedSaveSettings();
  // Toggle just this button
  const active = inj.includes(zone);
  btn.classList.toggle('active', active);
  btn.style.borderColor = active ? 'var(--orange)' : 'var(--border)';
  btn.style.background = active ? 'rgba(255,159,10,0.15)' : 'var(--surface)';
  btn.style.color = active ? 'var(--orange)' : 'var(--sub)';
}

// ── Records Correction Tool ──────────────────────────────────
function renderRecordsCorrectionList() {
  const el = document.getElementById('recordsCorrectionList');
  if (!el) return;

  // Single pass: collect all e1RMs per exercise name AND find best records
  const exoMap = {};
  const histByName = {};
  db.logs.forEach(log => {
    log.exercises.forEach(exo => {
      if (!exo.maxRM || exo.maxRM <= 0) return;
      const key = exo.name;
      // Track best record
      if (!exoMap[key] || exo.maxRM > exoMap[key].maxRM) {
        exoMap[key] = { name: exo.name, maxRM: exo.maxRM, date: log.shortDate || log.date, logId: log.id };
      }
      // Collect history for suspicious detection
      if (!histByName[key]) histByName[key] = [];
      histByName[key].push(exo.maxRM);
    });
  });

  // SBD records
  ['bench','squat','deadlift'].forEach(t => {
    if (db.bestPR[t] > 0) {
      const label = t === 'bench' ? 'Bench Press' : t === 'squat' ? 'Squat' : 'Deadlift';
      if (!exoMap[label] || db.bestPR[t] > exoMap[label].maxRM) {
        exoMap[label] = { name: label, maxRM: db.bestPR[t], date: 'SBD record', isSBD: true, sbdType: t };
      }
    }
  });

  const sorted = Object.values(exoMap).sort((a,b) => b.maxRM - a.maxRM);

  if (!sorted.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--sub);text-align:center;">Aucun record enregistré.</p>';
    return;
  }

  // Pre-compute suspicious flags using already-collected history (no second pass)
  function isSuspicious(name, maxRM) {
    const hist = histByName[name];
    if (!hist || hist.length < 3) return false;
    const s = [...hist].sort((a, b) => a - b);
    const q1 = s[Math.floor(s.length * 0.25)];
    const q3 = s[Math.floor(s.length * 0.75)];
    const iqr = q3 - q1 || q3 * 0.15;
    const median = s[Math.floor(s.length / 2)];
    return maxRM > q3 + 2 * iqr && maxRM > median * 1.4;
  }

  el.innerHTML = sorted.slice(0, 20).map(r => {
    const suspicious = isSuspicious(r.name, r.maxRM);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">${r.name} ${suspicious?'⚠️':''}</div>
        <div style="font-size:11px;color:var(--sub);">e1RM: <strong style="color:${suspicious?'var(--red)':'var(--blue)'};">${Math.round(r.maxRM)}kg</strong> — ${r.date}${suspicious?' <span style="color:var(--orange);font-size:10px;">(possible erreur de saisie)</span>':''}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button onclick="editRecord('${r.name.replace(/'/g,"\\'")}', ${r.maxRM}, ${r.isSBD?'true':'false'}, '${r.sbdType||''}')" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--blue);font-size:11px;font-weight:600;cursor:pointer;">Modifier</button>
        <button onclick="deleteRecord('${r.name.replace(/'/g,"\\'")}', ${r.isSBD?'true':'false'}, '${r.sbdType||''}')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,69,58,0.3);background:rgba(255,69,58,0.08);color:var(--red);font-size:11px;font-weight:600;cursor:pointer;">Supprimer</button>
      </div>
    </div>`;
  }).join('');
}

function editRecord(exoName, currentRM, isSBD, sbdType) {
  const newVal = prompt('Nouveau e1RM pour ' + exoName + ' (actuellement ' + Math.round(currentRM) + 'kg) :', Math.round(currentRM));
  if (!newVal) return;
  const val = parseFloat(newVal);
  if (isNaN(val) || val < 0 || val > 500) { showToast('Valeur invalide'); return; }

  // Corriger dans les logs (matchExoName pour couvrir les variantes orthographiques)
  db.logs.forEach(log => {
    log.exercises.forEach(exo => {
      if (!matchExoName(exo.name, exoName)) return;
      if (exo.maxRM > val) exo.maxRM = val;
      // Recalculer les repRecords si besoin
      if (exo.repRecords) {
        Object.keys(exo.repRecords).forEach(rKey => {
          const reps = parseInt(rKey);
          const w = exo.repRecords[rKey];
          if (calcE1RM(w, reps) > val * 1.05) {
            exo.repRecords[rKey] = Math.round(val * (1.0278 - 0.0278 * reps) * 10) / 10;
          }
        });
      }
      // Aussi corriger les séries
      if (exo.series) {
        exo.series = exo.series.filter(s => calcE1RM(s.weight, s.reps) <= val * 1.05);
      }
    });
  });

  saveDB();
  renderRecordsCorrectionList();
  refreshUI();
  showToast('✓ Record corrigé : ' + exoName + ' → ' + val + 'kg');
}

function deleteRecord(exoName, isSBD, sbdType) {
  showModal('Supprimer le record de ' + exoName + ' ? Les séries et records seront effacés pour cet exercice.', 'Supprimer', 'var(--red)', () => {
    // Effacer complètement l'exercice de tous les logs
    db.logs.forEach(log => {
      log.exercises = log.exercises.filter(exo => !matchExoName(exo.name, exoName));
    });

    saveDB();
    recalcBestPR();
    renderRecordsCorrectionList();
    refreshUI();
    showToast('✓ Record supprimé pour ' + exoName);
  });
}

// ============================================================
// COACH ALGO — render dans tab-ai
// ============================================================
function renderCoachAlgoAI() {
  var el = document.getElementById('coachAlgoContentAI');
  if (!el) return;
  if (!db.logs || db.logs.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:12px 0;color:var(--sub);font-size:13px;line-height:1.7;">Aucune séance importée.<br><span style="font-size:12px;">Réglages → 📥 Importer des Séances</span></div>';
    return;
  }
  if (typeof coachGetFullAnalysis === 'function') {
    el.innerHTML = coachGetFullAnalysis();
  } else {
    el.innerHTML = generateCoachAlgoMessage();
  }
}

// ============================================================
// COACH TAB — Briefing, Post-Session, Weekly Report
// ============================================================
var _coachSelectedDay = null;
var _activeCoachSub = 'coach-today';

function renderCoachTab() {
  if (new Date().getDay() === 1) generateWeeklyReport();
  updateCoachHistoBadge();
  const wpSec = document.getElementById('weeklyPlanSection');
  if (_activeCoachSub === 'coach-today') {
    renderCoachToday();
    if (wpSec) wpSec.style.display = '';
    renderWeeklyPlanUI();
  } else {
    if (wpSec) wpSec.style.display = 'none';
    renderCoachHistory();
  }
}

function showCoachSub(id, btn) {
  _activeCoachSub = id;
  document.querySelectorAll('#seances-coach .coach-sub-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#seances-coach .coach-sub-nav .stats-sub-pill').forEach(el => el.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  const wpSec = document.getElementById('weeklyPlanSection');
  if (id === 'coach-today') {
    renderCoachToday();
    if (wpSec) wpSec.style.display = '';
    renderWeeklyPlanUI();
  } else {
    if (wpSec) wpSec.style.display = 'none';
    renderCoachHistory();
    markReportsRead();
    updateCoachHistoBadge();
  }
}

function updateCoachHistoBadge() {
  const badge = document.getElementById('coachHistoBadge');
  if (!badge) return;
  const unread = (db.reports || []).filter(r => !r.read && r.expires_at > Date.now()).length;
  if (unread > 0) { badge.textContent = unread; badge.style.display = 'inline-flex'; }
  else { badge.style.display = 'none'; }
}

function renderCoachToday() {
  var el = document.getElementById('coach-today');
  if (!el) return;

  if (!db.logs || db.logs.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:32px 20px;color:var(--sub);font-size:13px;line-height:1.7;">'+
      'Importe des séances pour activer le Coach.<br>'+
      '<span style="font-size:12px;">Réglages → 📥 Importer des Séances</span></div>';
    return;
  }

  el.innerHTML = renderCoachTodayHTML();
}

function renderCoachTodayHTML() {
  var mode = (db.user && db.user.trainingMode) || 'powerlifting';
  var pr = db.bestPR || {};
  var html = '';

  // ── 1. JAUGES ──
  var fatigueScore = typeof computeFatigueScore === 'function' ? computeFatigueScore(db.logs) : 50;
  var formScore = Math.max(0, Math.min(100, 100 - fatigueScore));

  var lastSession = db.logs && db.logs.length ? db.logs[db.logs.length-1] : null;
  var hoursAgo = lastSession ? Math.round((Date.now()-lastSession.timestamp)/3600000) : 72;
  var recovScore = Math.min(100, Math.round((hoursAgo/48)*100));

  var volReport = typeof coachAnalyzeWeeklyVolume === 'function' ? coachAnalyzeWeeklyVolume() : null;
  var volOptimal = volReport ? volReport.optimal.length : 0;
  var volTotal = volReport ? (volReport.optimal.length + volReport.under.length + volReport.high.length + volReport.over.length) : 0;
  var volScore = volTotal > 0 ? Math.round((volOptimal/volTotal)*100) : 50;

  var gaugeColor = function(s) { return s>=70?'var(--green)':s>=40?'var(--orange)':'var(--red)'; };

  html += '<div class="coach-gauges">';
  html += '<div class="coach-gauge">'+
    '<div class="coach-gauge-val" style="color:'+gaugeColor(formScore)+';">'+formScore+'</div>'+
    '<div class="coach-gauge-bar"><div class="coach-gauge-fill" style="width:'+formScore+'%;background:'+gaugeColor(formScore)+';"></div></div>'+
    '<div class="coach-gauge-lbl">Forme</div></div>';
  html += '<div class="coach-gauge">'+
    '<div class="coach-gauge-val" style="color:'+gaugeColor(recovScore)+';">'+recovScore+'</div>'+
    '<div class="coach-gauge-bar"><div class="coach-gauge-fill" style="width:'+recovScore+'%;background:'+gaugeColor(recovScore)+';"></div></div>'+
    '<div class="coach-gauge-lbl">Récup.</div></div>';
  html += '<div class="coach-gauge">'+
    '<div class="coach-gauge-val" style="color:'+gaugeColor(volScore)+';">'+volScore+'</div>'+
    '<div class="coach-gauge-bar"><div class="coach-gauge-fill" style="width:'+volScore+'%;background:'+gaugeColor(volScore)+';"></div></div>'+
    '<div class="coach-gauge-lbl">Volume</div></div>';
  html += '</div>';

  // ── 2. ALERTE DELOAD ──
  var deload = typeof shouldDeload === 'function' ? shouldDeload(db.logs, mode) : {needed:false};
  if (deload && deload.needed) {
    html += '<div class="coach-deload">'+
      '<div class="coach-deload-ico">⚠️</div>'+
      '<div class="coach-deload-text"><strong>Deload recommandé</strong><br>'+(deload.reason||'')+'</div>'+
    '</div>';
  }

  // ── 3. RECOMMANDATIONS ──
  var today = typeof DAYS_FULL !== 'undefined' ? DAYS_FULL[new Date().getDay()] : '';
  var routine = typeof getRoutine === 'function' ? getRoutine() : {};
  var todayPlan = routine[today] || 'Repos';
  var recos = [];

  recos.push({ dot: 'var(--green)', text: '<strong>Aujourd\'hui ('+today+') :</strong> '+todayPlan });

  if (volReport && volReport.under && volReport.under.length > 0) {
    recos.push({ dot: 'var(--orange)', text: '<strong>Volume insuffisant :</strong> '+
      volReport.under.map(function(e){ return e.muscle+' ('+e.sets+' sets/sem)'; }).join(', ')+
      ' — cible MEV : '+volReport.under.map(function(e){
        var lm = typeof VOLUME_LANDMARKS_FR!=='undefined' ? VOLUME_LANDMARKS_FR[e.muscle] : null;
        return lm ? lm.mev+' sets' : '?';
      }).join(', ')
    });
  }
  if (volReport && volReport.over && volReport.over.length > 0) {
    recos.push({ dot: 'var(--red)', text: '<strong>Survolume :</strong> '+
      volReport.over.map(function(e){ return e.muscle; }).join(', ')+' au-dessus du MRV — réduis ou planifie un deload'
    });
  }

  var balance = typeof analyzeMuscleBalance === 'function' ? analyzeMuscleBalance(db.logs, 14) : null;
  if (balance && balance.recommendations) {
    balance.recommendations.forEach(function(r) {
      if (r.type === 'warning') recos.push({ dot: 'var(--orange)', text: r.msg });
    });
  }

  var targets = (db.user && db.user.targets) || {};
  ['bench','squat','deadlift'].forEach(function(t) {
    if (pr[t] && targets[t] && pr[t] < targets[t]) {
      var gap = targets[t] - pr[t];
      var label = t==='bench'?'Bench':t==='squat'?'Squat':'Deadlift';
      recos.push({ dot: 'var(--accent)', text: '<strong>'+label+' :</strong> '+pr[t]+'kg → objectif '+targets[t]+'kg (−'+gap+'kg)' });
    }
  });

  html += '<div class="coach-recos"><div class="coach-reco-title">🦍 Recommandations</div>';
  if (recos.length === 0) {
    html += '<div class="coach-reco-text">Tout est optimal — continue comme ça !</div>';
  } else {
    html += recos.map(function(r) {
      return '<div class="coach-reco-item">'+
        '<div class="coach-reco-dot" style="background:'+r.dot+';"></div>'+
        '<div class="coach-reco-text">'+r.text+'</div>'+
      '</div>';
    }).join('');
  }
  html += '</div>';

  // ── 4. VOLUME PAR MUSCLE ──
  if (volReport) {
    var allMuscles = (volReport.optimal||[]).concat(volReport.under||[]).concat(volReport.high||[]).concat(volReport.over||[]);
    if (allMuscles.length > 0) {
      html += '<div class="coach-muscles"><div class="coach-reco-title">💪 Volume / semaine</div>';
      allMuscles.forEach(function(e) {
        var lm = typeof VOLUME_LANDMARKS_FR!=='undefined' ? VOLUME_LANDMARKS_FR[e.muscle] : null;
        if (!lm) return;
        var fillPct = Math.min(100, Math.round((e.sets/lm.mrv)*100));
        var barColor = (e.status && e.status.color) || 'var(--sub)';
        html += '<div class="coach-muscle-row">'+
          '<div class="coach-muscle-top">'+
            '<span class="coach-muscle-name">'+e.muscle+'</span>'+
            '<span class="coach-muscle-sets" style="color:'+barColor+';">'+e.sets+' sets</span>'+
          '</div>'+
          '<div class="coach-muscle-bar"><div class="coach-muscle-fill" style="width:'+fillPct+'%;background:'+barColor+';"></div></div>'+
        '</div>';
      });
      html += '</div>';
    }
  }

  // ── 5. PROGRESSION SBD ──
  html += '<div class="coach-sbd"><div class="coach-reco-title">📈 Tendance SBD</div><div class="coach-sbd-grid">';
  var SBD_COLORS = {bench:'var(--blue)',squat:'var(--red)',deadlift:'var(--orange)'};
  ['bench','squat','deadlift'].forEach(function(type) {
    var prVal = pr[type] || 0;
    var mom = typeof calcMomentum === 'function' ? calcMomentum(type) : 0;
    var label = type==='bench'?'Bench':type==='squat'?'Squat':'Dead.';
    var color = SBD_COLORS[type];
    var trend = mom>0?'↑ +'+mom+'kg':mom<0?'↓ '+mom+'kg':'→ stable';
    var trendColor = mom>0?'var(--green)':mom<0?'var(--red)':'var(--sub)';
    html += '<div class="coach-sbd-item">'+
      '<div class="coach-sbd-label" style="color:'+color+';">'+label+'</div>'+
      '<div class="coach-sbd-pr" style="color:'+color+';">'+prVal+'<span style="font-size:11px;font-weight:400;">kg</span></div>'+
      '<div class="coach-sbd-trend" style="color:'+trendColor+';">'+trend+'</div>'+
    '</div>';
  });
  html += '</div></div>';

  html += '<div class="ai-timestamp">Coach Algo · Calcul instantané · Sans IA</div>';
  return html;
}

function coachSelectDay(day) {
  _coachSelectedDay = day;
  renderCoachToday();
}

function renderCoachDayDetail(day, routine, donedays, weekStart) {
  const label = routine[day] || '';
  const isRest = !label || /repos|😴|natation|🏊/i.test(label);

  if (isRest) {
    const isSwim = /natation|🏊/i.test(label);
    return '<div class="coach-rest-day">' + (isSwim ? '🏊 Natation — récupération active' : '😴 Repos complet') + '</div>';
  }

  // Check if day is already done (use actual log data)
  const dayDone = !!donedays[day];
  let exercises = [];
  let usePlanSets = false;

  // PRIORITY 1: routine manuelle for exercise list
  const progExos = getProgExosForDay(day);

  // PRIORITY 2: weeklyPlan for detailed sets
  const plan = db.weeklyPlan;
  let planDay = null;
  if (plan && plan.days) {
    planDay = plan.days.find(d => d.day === day && !d.rest);
  }

  // If day is done, use actual log data
  if (dayDone) {
    const weekLogs = (db.logs || []).filter(l => l.timestamp >= weekStart);
    const dayLog = weekLogs.find(l => DAYS_FULL[new Date(l.timestamp).getDay()] === day);
    if (dayLog && dayLog.exercises) {
      exercises = dayLog.exercises.map(e => ({
        name: e.name,
        sets: (e.series || e.allSets || []).map((s, idx) => ({
          label: (s.isWarmup || s.type === 'warmup') ? '🔥 Chauffe ' + (idx + 1) : 'Série ' + (idx + 1),
          weight: s.weight || 0,
          reps: s.reps || 0,
          rpe: s.rpe || null,
          rest: s.rest || null,
          isWarmup: s.isWarmup || s.type === 'warmup',
          isPR: s.isPR || false
        })),
        actual: true
      }));
    }
  } else if (planDay && planDay.exercises && planDay.exercises.length) {
    // Use weeklyPlan sets
    exercises = planDay.exercises.map(pe => {
      const matched = progExos.find(n => matchExoName(n, pe.name));
      return {
        name: pe.name,
        sets: (pe.sets || []).map((s, idx) => {
          const isW = s.isWarmup || false;
          const isB = s.isBackoff || false;
          const lbl = isW ? '🔥 Chauffe ' + (idx + 1) : (isB ? 'Back-off ' + (idx + 1) : 'Série ' + (idx + 1));
          return { label: lbl, weight: s.weight || 0, reps: s.reps || 0, rpe: s.rpe || null, rest: pe.restSeconds || null, isWarmup: isW, isPR: false };
        }),
        actual: false
      };
    });
    // Add any routine exercises not in plan
    progExos.forEach(name => {
      if (!exercises.find(e => matchExoName(e.name, name))) {
        const prev = goGetPreviousSets(name);
        exercises.push({ name: name, sets: _buildSetsFromHistory(prev), actual: false });
      }
    });
  } else {
    // Fallback: use routine + history
    exercises = progExos.map(name => {
      const prev = goGetPreviousSets(name);
      return { name: name, sets: _buildSetsFromHistory(prev), actual: false };
    });
  }

  if (!exercises.length) {
    return '<div class="coach-rest-day" style="font-size:12px;">Aucun exercice configuré pour ' + day + '</div>';
  }

  let h = '<div style="margin-top:4px;">';
  exercises.forEach((exo, idx) => {
    const ms = _ecMuscleStyle(exo.name);
    const shortName = exo.name.replace(/\s*\(.*\)/, '').trim();

    // Summary: sets x reps @ weight
    let summary = '';
    const workSets = (exo.sets || []).filter(s => !s.isWarmup);
    if (workSets.length > 0) {
      const w = workSets[0].weight;
      const r = workSets[0].reps;
      summary = workSets.length + '×' + r + (w ? ' @ ' + w + 'kg' : '');
    }

    // Trend vs last session
    let trendHtml = '';
    if (!exo.actual) {
      var pts = [];
      var desc = getSortedLogs();
      for (var i = 0; i < desc.length && pts.length < 4; i++) {
        var found = desc[i].exercises.find(function(e) { return matchExoName(e.name, exo.name) && e.maxRM > 0; });
        if (found) pts.push(found.maxRM);
      }
      if (pts.length >= 2) {
        var d = pts[0] - pts[1];
        if (d > 0) trendHtml = '<span class="cec-trend" style="color:var(--green);">↑+' + d + 'kg</span>';
        else if (d < 0) trendHtml = '<span class="cec-trend" style="color:var(--red);">↓' + d + 'kg</span>';
        else trendHtml = '<span class="cec-trend" style="color:var(--sub);">→</span>';
      }
    }

    const hasDetails = exo.sets && exo.sets.length > 0;
    h += '<div class="coach-exo-card" id="coachExo' + idx + '">';
    h += '<div class="coach-exo-card-header" onclick="toggleCoachExo(' + idx + ')">';
    h += '<span class="cec-icon">' + ms.icon + '</span>';
    h += '<span class="cec-name">' + shortName + '</span>';
    h += trendHtml;
    h += '<span class="cec-summary">' + summary + '</span>';
    if (hasDetails) h += '<span class="cec-chevron">▾</span>';
    h += '</div>';

    if (hasDetails) {
      h += '<div class="coach-exo-card-body">';
      h += '<table class="coach-sets-table"><thead><tr><th>Label</th><th>Kg</th><th>Reps</th><th>Repos</th><th>RPE</th></tr></thead><tbody>';
      exo.sets.forEach(s => {
        let rowCls = s.isWarmup ? ' class="warmup"' : (s.isPR ? ' class="pr"' : '');
        let rpeHtml = '';
        if (s.rpe) {
          let rpeCls = s.rpe <= 8 ? 'rpe-green' : (s.rpe < 9.5 ? 'rpe-orange' : 'rpe-red');
          rpeHtml = '<span class="rpe-badge ' + rpeCls + '">' + s.rpe + '</span>';
        }
        let restHtml = s.rest ? '<span style="background:rgba(255,255,255,0.05);padding:1px 5px;border-radius:4px;font-size:10px;">' + fmtRest(s.rest) + '</span>' : '';
        let prefix = s.isWarmup ? '🔥 ' : (s.isPR ? '🏆 ' : '');
        h += '<tr' + rowCls + '><td>' + prefix + s.label + '</td><td>' + (s.weight || '—') + '</td><td>' + (s.reps || '—') + '</td><td>' + restHtml + '</td><td>' + rpeHtml + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
  });
  h += '</div>';
  return h;
}

function _buildSetsFromHistory(prev) {
  if (!prev || !prev.series || !prev.series.length) return [];
  return prev.series.map((s, idx) => ({
    label: 'Série ' + (idx + 1),
    weight: s.weight || 0,
    reps: s.reps || 0,
    rpe: s.rpe || null,
    rest: null,
    isWarmup: s.isWarmup || s.type === 'warmup' || false,
    isPR: false
  }));
}

function toggleCoachExo(idx) {
  const card = document.getElementById('coachExo' + idx);
  if (card) card.classList.toggle('open');
}

function _getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday is start of week
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function renderCoachHistory() {
  const el = document.getElementById('coach-history');
  if (!el) return;
  const reports = (db.reports || [])
    .filter(r => r.expires_at > Date.now())
    .sort((a, b) => b.created_at - a.created_at);

  if (!reports.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px 20px;color:var(--sub);font-size:13px;">Aucun rapport disponible.<br>Termine une séance dans le GO pour voir les analyses ici.</div>';
    return;
  }

  let h = '';
  reports.forEach((r, idx) => {
    const typeIcon = r.type === 'debrief' ? '🏋️' : '📊';
    const typeLabel = r.type === 'debrief' ? 'Débrief Séance' : 'Bilan Hebdo';
    const relTime = typeof timeAgo === 'function' ? timeAgo(r.created_at) : '';
    const dl = typeof daysLeft === 'function' ? daysLeft(r.expires_at) : '';
    const unreadDot = !r.read ? '🔴 ' : '';

    h += '<div class="coach-history-card" id="coachHist' + idx + '">';
    h += '<div class="coach-history-header" onclick="toggleCoachHist(' + idx + ')">';
    h += '<span class="ch-icon">' + typeIcon + '</span>';
    h += '<span class="ch-title">' + unreadDot + typeLabel + '</span>';
    h += '<span class="ch-meta">' + relTime + (dl ? ' · ' + dl + 'j' : '') + '</span>';
    h += '<span class="ch-chevron">▾</span>';
    h += '</div>';
    h += '<div class="coach-history-body">' + (r.html || '') + '</div>';
    h += '</div>';
  });

  el.innerHTML = h;
}

function toggleCoachHist(idx) {
  const card = document.getElementById('coachHist' + idx);
  if (card) card.classList.toggle('open');
}

function checkProgressionSuggestions() {
  var suggestions = [];
  var recentLogs = getLogsInRange(21);
  var exoSessions = {};
  recentLogs.forEach(function(log) {
    log.exercises.forEach(function(e) {
      if (!exoSessions[e.name]) exoSessions[e.name] = [];
      exoSessions[e.name].push({ maxReps: Math.max.apply(null, (e.series||[]).map(function(s){return s.reps||0;}).concat([0])) });
    });
  });
  Object.keys(exoSessions).forEach(function(name) {
    var sessions = exoSessions[name];
    if (sessions.length < 3) return;
    var exoData = null;
    var keys = Object.keys(EXO_DATABASE);
    for (var i = 0; i < keys.length; i++) {
      if (matchExoName(EXO_DATABASE[keys[i]].name, name)) { exoData = EXO_DATABASE[keys[i]]; break; }
    }
    if (!exoData || !exoData.progressions) return;
    var currentIdx = exoData.progressions.indexOf(exoData.id);
    if (currentIdx < 0 || currentIdx >= exoData.progressions.length - 1) return;
    var easyCount = sessions.filter(function(s) { return s.maxReps >= 15; }).length;
    if (easyCount >= 3) {
      var nextExo = EXO_DATABASE[exoData.progressions[currentIdx + 1]];
      if (nextExo) suggestions.push({ from: exoData.name, to: nextExo.name, reason: 'Tu fais 15+ reps régulièrement — prêt pour la suite !' });
    }
  });
  return suggestions;
}

function renderProgressionSuggestions() {
  // Legacy — now inline in renderCoachToday()
}

function renderCoachBriefing() {
  // Legacy — now handled by renderCoachToday()
  renderCoachToday();
}

function generateWeeklyReport() {
  var weekKey = _getWeekKey();
  if ((db.reports||[]).some(function(r) { return r.type === 'weekly' && r.weekKey === weekKey; })) return;

  var prevWeekStart = new Date(weekKey).getTime() - 7 * 86400000;
  var prevWeekEnd = new Date(weekKey).getTime();
  var weekLogs = db.logs.filter(function(l) { return l.timestamp >= prevWeekStart && l.timestamp < prevWeekEnd; });
  if (weekLogs.length === 0) return;

  var totalVol = weekLogs.reduce(function(s, l) { return s + (l.volume || 0); }, 0);
  var totalSets = 0;
  weekLogs.forEach(function(l) { l.exercises.forEach(function(e) { totalSets += (e.sets || 0); }); });
  var planned = getTrainingDaysCount();
  var compliance = Math.min(100, Math.round((weekLogs.length / Math.max(1, planned)) * 100));

  var h = '<div class="ai-section-title">📊 BILAN SEMAINE</div>';
  h += '<strong>' + weekLogs.length + '</strong> séances sur ' + planned + ' prévues (' + compliance + '% compliance)<br>';
  h += 'Volume total : <span class="ai-highlight blue">' + (totalVol / 1000).toFixed(1) + 't</span> · ' + totalSets + ' séries<br>';

  var trends = [];
  ['squat', 'bench', 'deadlift'].forEach(function(type) {
    var mom = calcMomentum(type);
    if (mom !== null) trends.push(type.charAt(0).toUpperCase() + type.slice(1) + ' : ' + (mom > 0 ? '+' : '') + mom + 'kg/sem');
  });
  if (trends.length) {
    h += '<div class="ai-section-title">📈 TENDANCES</div>';
    h += trends.join('<br>') + '<br>';
  }

  var weekReadiness = (db.readiness || []).filter(function(r) {
    var ts = new Date(r.date).getTime();
    return ts >= prevWeekStart && ts < prevWeekEnd;
  });
  if (weekReadiness.length) {
    var avgR = Math.round(weekReadiness.reduce(function(s, r) { return s + r.score; }, 0) / weekReadiness.length);
    h += '<div class="ai-section-title">😴 READINESS MOYENNE</div>';
    h += avgR + '/100 ' + (avgR >= 70 ? '✅' : avgR >= 40 ? '⚠️' : '🔴') + '<br>';
  }

  h += '<div class="ai-section-title">💡 RECOMMANDATION</div>';
  if (compliance < 60) h += 'Essaie de maintenir au moins ' + Math.ceil(planned * 0.75) + ' séances cette semaine.';
  else if (compliance >= 100 && weekReadiness.length && weekReadiness[weekReadiness.length - 1].score < 50) h += 'Tu t\'es bien entraîné mais ta readiness baisse. Pense à récupérer.';
  else h += 'Continue comme ça. Régularité = progression.';

  if (!db.reports) db.reports = [];
  db.reports.push({
    id: generateId(),
    type: 'weekly',
    weekKey: weekKey,
    html: '<div class="ai-response-content">' + h + '</div>',
    created_at: Date.now(),
    expires_at: Date.now() + 14 * 86400000,
    read: false
  });
  saveDBNow();
}

function renderCoachReports() {
  // Legacy — now handled by renderCoachHistory()
  renderCoachHistory();
}


// ============================================================
// WEEKLY PLAN — génération locale (sans IA)
// ============================================================
let wpSelectedDay = DAYS_FULL[new Date().getDay()] === 'Dimanche' ? 'Lundi' : DAYS_FULL[new Date().getDay()];

// Arrondi au 0.5kg
function round05(v) { return Math.round(v * 2) / 2; }

// Ratios poids de corps pour estimation de charge sans historique
const BW_RATIOS = {
  big:       { debutant: 0.5,  intermediaire: 0.8,  avance: 1.2,  competiteur: 1.5  },
  compound:  { debutant: 0.3,  intermediaire: 0.5,  avance: 0.8,  competiteur: 1.0  },
  isolation: { debutant: 0.15, intermediaire: 0.25, avance: 0.35, competiteur: 0.45 },
};

// ── Apprentissage progression personnalisée ─────────────────
// Après 4+ semaines de données, calcule le taux de progression réel
function getPersonalProgressionRate(exoName) {
  const pts = [];
  const desc = [...db.logs].sort((a,b) => b.timestamp - a.timestamp);
  for (const log of desc) {
    const exo = log.exercises.find(e => e.name === exoName || matchExoName(e.name, exoName));
    if (!exo || !exo.maxRM || exo.maxRM <= 0) continue;
    pts.push({ x: log.timestamp / 86400000, y: exo.maxRM });
    if (pts.length >= 8) break;
  }
  if (pts.length < 4) return null;
  pts.sort((a,b) => a.x - b.x);
  const n = pts.length;
  const sumX = pts.reduce((s,p) => s+p.x, 0), sumY = pts.reduce((s,p) => s+p.y, 0);
  const sumXY = pts.reduce((s,p) => s+p.x*p.y, 0), sumX2 = pts.reduce((s,p) => s+p.x*p.x, 0);
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  const kgPerWeek = Math.round(slope * 7 * 10) / 10;
  const lastE1rm = pts[pts.length - 1].y;
  if (lastE1rm <= 0) return null;
  const pctPerWeek = Math.round((kgPerWeek / lastE1rm) * 1000) / 10;
  return { kgPerWeek, pctPerWeek, lastE1rm, confidence: n >= 6 ? 'high' : 'medium', n };
}

// ── Catégorie d'exercice (global) ───────────────────────────
function getExoCategory(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (/squat|deadlift|souleve|bench\s*(press|barre|couche)?|developpe\s*couche/.test(n)) return 'big';
  if (/overhead|militaire|\bohp\b|rowing\b|tirage|row\b|traction|pull.?up|chin.?up|\bdips?\b|rdl|roumain|hip\s*thrust|pouss[ée]e\s*de\s*hanche|leg\s*press|presse\s*(a\s*)?cuisses|fentes?|\blunge|good\s*morning|inclin[eé]|d[eé]clin[eé]/.test(n)) return 'compound';
  return 'isolation';
}

// ── Helpers séries / reps / repos par catégorie et objectif ──
// Sources : NSCA, PubMed (de Salles 2009), Stronger by Science, Pelland/Zourdos 2025
function mapTrainingModeToGoal(mode) {
  const map = { powerlifting:'force', force_athletique:'force', powerbuilding:'force', bodybuilding:'masse', musculation:'masse', bien_etre:'bien_etre' };
  return map[mode] || 'force';
}

function getWorkSets(exerciseCategory, goal) {
  const table = {
    force:    { big: 5, compound: 4, isolation: 3 },
    masse:    { big: 4, compound: 4, isolation: 3 },
    recompo:  { big: 4, compound: 3, isolation: 3 },
    seche:    { big: 3, compound: 3, isolation: 2 },
    maintien: { big: 3, compound: 3, isolation: 2 },
    bien_etre:{ big: 3, compound: 3, isolation: 2 }
  };
  return (table[goal] || table.maintien)[exerciseCategory] || 3;
}

function getRepRange(exerciseCategory, goal) {
  const table = {
    force:    { big: {reps:5, rpe:8},  compound: {reps:6, rpe:8},  isolation: {reps:10, rpe:8} },
    masse:    { big: {reps:8, rpe:8},  compound: {reps:10, rpe:8}, isolation: {reps:12, rpe:9} },
    recompo:  { big: {reps:6, rpe:8},  compound: {reps:8, rpe:8},  isolation: {reps:10, rpe:8} },
    seche:    { big: {reps:8, rpe:7},  compound: {reps:10, rpe:8}, isolation: {reps:15, rpe:8} },
    maintien: { big: {reps:6, rpe:7},  compound: {reps:8, rpe:7},  isolation: {reps:12, rpe:7} },
    bien_etre:{ big: {reps:10,rpe:7},  compound: {reps:12, rpe:7}, isolation: {reps:15, rpe:7} }
  };
  return (table[goal] || table.maintien)[exerciseCategory] || {reps:10, rpe:8};
}

function getRestSeconds(exerciseCategory, goal) {
  const table = {
    force:    { big: 240, compound: 180, isolation: 120 },
    masse:    { big: 150, compound: 120, isolation: 75 },
    recompo:  { big: 180, compound: 150, isolation: 90 },
    seche:    { big: 120, compound: 90,  isolation: 60 },
    maintien: { big: 150, compound: 120, isolation: 90 },
    bien_etre:{ big: 120, compound: 90,  isolation: 60 }
  };
  return (table[goal] || table.maintien)[exerciseCategory] || 90;
}

// ── Échauffements intelligents par exercice ─────────────────
// Sources : Ripped Body, BarBend (Ben Pollack), Skill Based Fitness
function getWarmupSets(exoName, workWeight, workReps, isFirstForMuscleGroup, isFirstCompound, cat) {
  if (!workWeight || workWeight <= 0) return [];
  if (!cat) cat = 'isolation';

  // Isolation → pas d'échauffement (muscles déjà chauds après compounds)
  if (cat === 'isolation') return [];

  // Premier compound de la séance → échauffement complet
  if (isFirstCompound) {
    if (workReps <= 5) {
      // Force : 5 montantes → bar, 50%, 65%, 80%, 90%
      return [
        { isWarmup: true, weight: round05(workWeight * 0.40), reps: 8 },
        { isWarmup: true, weight: round05(workWeight * 0.55), reps: 5 },
        { isWarmup: true, weight: round05(workWeight * 0.70), reps: 3 },
        { isWarmup: true, weight: round05(workWeight * 0.85), reps: 2 },
        { isWarmup: true, weight: round05(workWeight * 0.92), reps: 1 }
      ];
    } else if (workReps <= 10) {
      // Hypertrophie : 3 montantes
      return [
        { isWarmup: true, weight: round05(workWeight * 0.50), reps: 8 },
        { isWarmup: true, weight: round05(workWeight * 0.65), reps: 5 },
        { isWarmup: true, weight: round05(workWeight * 0.80), reps: 3 }
      ];
    } else {
      // Endurance : 2 montantes
      return [
        { isWarmup: true, weight: round05(workWeight * 0.50), reps: 10 },
        { isWarmup: true, weight: round05(workWeight * 0.70), reps: 5 }
      ];
    }
  }

  // Compound suivant mais premier pour ce groupe musculaire → 2 montantes
  if (isFirstForMuscleGroup) {
    return [
      { isWarmup: true, weight: round05(workWeight * 0.50), reps: 5 },
      { isWarmup: true, weight: round05(workWeight * 0.70), reps: 3 }
    ];
  }

  // Compound suivant, même groupe déjà échauffé → 1 montante
  return [
    { isWarmup: true, weight: round05(workWeight * 0.60), reps: 5 }
  ];
}

// ── Estimation durée séance scientifique ────────────────────
function estimateSessionDuration(exercises) {
  if (!exercises || !exercises.length) return 0;
  let totalSec = 600; // 10min : échauffement articulaire + rangement final

  exercises.forEach(function(exo) {
    var meta = wpGetExoMeta(exo.name) || {};
    var isHeavy = meta.mechanic === 'compound';

    // Transition + installation (rack vs machine)
    totalSec += isHeavy ? 120 : 60;

    var allSets = exo.allSets || [];
    allSets.forEach(function(set) {
      // TUT
      var repSpeed = (set.reps || 0) <= 5 ? 4.5 : 3.5;
      totalSec += (set.reps || 0) * repSpeed;

      // Repos réel + manipulation des poids
      var rest = set.restSeconds || (isHeavy ? 180 : 90);
      var logistics = (isHeavy || (set.weight || 0) > 100) ? 45 : 15;
      totalSec += rest + logistics;
    });
  });

  // Facteur de fatigue : 10% plus lent en fin de séance
  return Math.round((totalSec * 1.10) / 60);
}

// Adapter la séance si elle dépasse la durée configurée
function adaptSessionForDuration(exercises, targetMinutes, goal) {
  if (!targetMinutes || targetMinutes <= 0) return { exercises, adaptations: [] };
  const est = estimateSessionDuration(exercises);
  if (est <= targetMinutes) return { exercises, adaptations: [] };

  const adaptations = [];
  let adapted = JSON.parse(JSON.stringify(exercises));

  // 1. Supersets sur isolations (gain ~30%)
  const isoExos = adapted.filter(e => getExoCategory(e.name) === 'isolation');
  if (isoExos.length >= 2) {
    for (let i = 0; i < isoExos.length - 1; i += 2) {
      isoExos[i].superset = isoExos[i + 1].name;
      isoExos[i].restSeconds = Math.round((isoExos[i].restSeconds || 60) * 0.5);
    }
    adaptations.push('Supersets sur isolations');
    const est2 = estimateSessionDuration(adapted);
    if (est2 <= targetMinutes) return { exercises: adapted, adaptations };
  }

  // 2. Réduire séries isolations (max -1, jamais <2)
  adapted.forEach(e => {
    if (getExoCategory(e.name) !== 'isolation') return;
    const work = e.sets.filter(s => !s.isWarmup);
    if (work.length > 2) {
      const idx = e.sets.findIndex(s => !s.isWarmup);
      if (idx >= 0) e.sets.splice(idx, 1);
    }
  });
  adaptations.push('Séries isolations réduites');
  const est3 = estimateSessionDuration(adapted);
  if (est3 <= targetMinutes) return { exercises: adapted, adaptations };

  // 3. Réduire repos de 15% max
  adapted.forEach(e => { e.restSeconds = Math.round((e.restSeconds || 90) * 0.85); });
  adaptations.push('Repos réduits (-15%)');
  const est4 = estimateSessionDuration(adapted);
  if (est4 <= targetMinutes) return { exercises: adapted, adaptations };

  // 4. Dernier recours : retirer une isolation
  const lastIso = adapted.findIndex(e => getExoCategory(e.name) === 'isolation');
  if (lastIso >= 0) {
    adaptations.push('Isolation retirée : ' + adapted[lastIso].name);
    adapted.splice(lastIso, 1);
  }

  return { exercises: adapted, adaptations };
}

// ── Deload automatique ──────────────────────────────────────
function shouldDeload() {
  const reasons = [];
  // 1. Fin de mésocycle (semaine 4 complétée)
  if (db.weeklyPlan && db.weeklyPlan.week === 4) {
    const planAge = db.weeklyPlan.generated_at ? (Date.now() - new Date(db.weeklyPlan.generated_at).getTime()) / 86400000 : 0;
    if (planAge >= 5) reasons.push('Fin de mésocycle (4 semaines)');
  }
  // 2. Readiness basse chronique
  const last3 = (db.readiness || []).slice(-3);
  if (last3.length === 3 && last3.every(r => r.score < 40)) {
    reasons.push('Readiness < 40 pendant 3 jours consécutifs');
  }
  // 3. Plateau multiple
  const bigLifts = ['squat', 'bench', 'deadlift'];
  const plateaus = bigLifts.filter(l => detectPlateau(l));
  if (plateaus.length >= 2) {
    reasons.push('Plateau sur ' + plateaus.join(' et '));
  }
  return { needed: reasons.length > 0, reasons };
}

let _deloadDismissed = false;
function renderDeloadBanner() {
  const el = document.getElementById('deloadBanner');
  if (!el) return;
  if (_deloadDismissed || db._deloadAccepted) { el.innerHTML = ''; return; }
  const { needed, reasons } = shouldDeload();
  if (!needed) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="background:rgba(10,132,255,0.12);border:1px solid var(--blue);border-radius:12px;padding:12px;margin:8px 0;">' +
    '<div style="font-size:13px;font-weight:700;color:var(--blue);margin-bottom:6px;">🔄 Semaine de deload recommandée ' + renderGlossaryTip('deload') + '</div>' +
    '<div style="font-size:11px;color:var(--sub);margin-bottom:8px;">' + reasons.join(' · ') + '</div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button onclick="acceptDeload()" style="flex:1;padding:6px;background:var(--blue);border:none;color:white;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">Accepter</button>' +
    '<button onclick="dismissDeload()" style="flex:1;padding:6px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:8px;font-size:11px;cursor:pointer;">Ignorer</button>' +
    '</div></div>';
}

function acceptDeload() {
  db._deloadAccepted = true;
  saveDB();
  showToast('🔄 Deload activé — charges et volume réduits');
  const el = document.getElementById('deloadBanner');
  if (el) el.innerHTML = '';
}

function dismissDeload() {
  _deloadDismissed = true;
  const el = document.getElementById('deloadBanner');
  if (el) el.innerHTML = '';
}

function isDeloadWeek() {
  return !!db._deloadAccepted;
}

// ============================================================
// GENERATE WEEKLY PLAN v3
// Règles calibrées par coach expert (Gemini) + science APRE/RPE
// Sources : Zourdos 2016, Israetel MEV/MAV/MRV, SFR
// ============================================================

// ── CONSTANTES GLOBALES ALGO v3 ─────────────────────────────
var WP_INJURY_EXCLUSIONS = {
  'epaules':  ['Développé militaire','Élévations latérales','Oiseau machine','Tirage nuque','Dips'],
  'nuque':    ['Tirage nuque','Shrugs','Développé militaire'],
  'poignets': ['Curl poignet','Curl marteau','Dips','Shrugs'],
  'genoux':   ['Fentes','Leg Extension','Squat complet'],
  'dos':      ['Soulevé de Terre','Good Morning','Hyperextensions'],
  'hanches':  ['Hip Thrust','Fentes'],
  'coudes':   ['Extension triceps','Skull Crusher']
};

var WP_PROGRESSION = {
  upper: { increase: 2.5, decrease: 5.0 },
  lower: { increase: 5.0, decrease: 10.0 }
};

var WP_SESSION_TEMPLATES = {
  squat: {
    title: '🦵 Jambes',
    mainLift: 'squat',
    bodyPart: 'lower',
    accessories: [
      { name: 'Presse à cuisses',   reps: '6-8',  rpe: 8.5, sets: 4, rest: 180, priority: 1 },
      { name: 'Leg Extension',      reps: '12',   rpe: 7,   sets: 4, rest: 90,  priority: 2 },
      { name: 'Adduction',          reps: '12',   rpe: 7,   sets: 3, rest: 60,  priority: 2 },
      { name: 'Abduction',          reps: '12',   rpe: 7,   sets: 3, rest: 60,  priority: 2 },
      { name: 'Mollets (Machine)',   reps: '12',   rpe: 8,   sets: 4, rest: 60,  priority: 3, isoTension: true },
      { name: 'Gainage planche',    reps: '90s',  rpe: 7,   sets: 3, rest: 60,  priority: 1, type: 'time' }
    ]
  },
  bench: {
    title: '💪 Pecs — Dos',
    mainLift: 'bench',
    bodyPart: 'upper',
    accessories: [
      { name: 'Rowing poulie assis',       reps: '6',    rpe: 8.5, sets: 4, rest: 180, priority: 1 },
      { name: 'Développé incliné haltères',reps: '6-8',  rpe: 8.5, sets: 3, rest: 150, priority: 1 },
      { name: 'Tractions',                 reps: '6',    rpe: 8,   sets: 4, rest: 150, priority: 1, type: 'reps', useBodyweight: true },
      { name: 'Écarté machine',            reps: '12',   rpe: 7,   sets: 4, rest: 90,  priority: 2 },
      { name: 'Oiseau machine',            reps: '12',   rpe: 7,   sets: 3, rest: 60,  priority: 1 }
    ]
  },
  deadlift: {
    title: '🏋️ Ischios — Fessiers',
    mainLift: 'deadlift',
    bodyPart: 'lower',
    accessories: [
      { name: 'Hip Thrust',           reps: '6-8',  rpe: 8.5, sets: 4, rest: 180, priority: 1 },
      { name: 'Leg Curl allongé',     reps: '12',   rpe: 7,   sets: 4, rest: 90,  priority: 1 },
      { name: 'Mollets (Machine)',     reps: '12',   rpe: 8,   sets: 4, rest: 60,  priority: 2 },
      { name: 'Élévations latérales', reps: '15',   rpe: 7.5, sets: 3, rest: 60,  priority: 2 },
      { name: 'Gainage planche',      reps: '90s',  rpe: 7,   sets: 3, rest: 60,  priority: 1, type: 'time' }
    ]
  },
  weakpoints: {
    title: '🎯 Épaules — Bras',
    mainLift: null,
    bodyPart: 'upper',
    accessories: [
      { name: 'Tirage visage',             reps: '12',  rpe: 7.5, sets: 4, rest: 90  },
      { name: 'Oiseau machine',            reps: '12',  rpe: 7,   sets: 3, rest: 60  },
      { name: 'Tirage poitrine poulie',    reps: '8',   rpe: 8,   sets: 4, rest: 120 },
      { name: 'Shrugs',                    reps: '12',  rpe: 7.5, sets: 4, rest: 90  },
      { name: 'Curl marteau',              reps: '10',  rpe: 7.5, sets: 4, rest: 90  },
      { name: 'Extension triceps',         reps: '12',  rpe: 7.5, sets: 4, rest: 90  },
      { name: 'Curl poignet',              reps: '15',  rpe: 7,   sets: 4, rest: 60  },
      { name: 'Élévations latérales',      reps: '15',  rpe: 7.5, sets: 3, rest: 60  },
      { name: 'Ab Wheel',                  reps: 'max', rpe: 8,   sets: 4, rest: 90, type: 'reps' }
    ]
  },
  technique: {
    title: '⚡ S B Day',
    mainLift: 'squat_pause',
    bodyPart: 'lower',
    accessories: [
      { name: 'Spoto Bench',           reps: '3-5',  rpe: 8, sets: 5, rest: 240, isPrimary: true },
      { name: 'Soulevé de Terre Pause',reps: '3-5',  rpe: 8, sets: 4, rest: 240, isPrimary: true },
      { name: 'Gainage planche',       reps: '90s',  rpe: 7, sets: 3, rest: 60,  type: 'time'    }
    ]
  },
  recovery: {
    title: '🏊 Cardio',
    mainLift: null,
    bodyPart: 'recovery',
    accessories: [
      { name: 'Natation', reps: '45min', rpe: 5, sets: 1, rest: 0, type: 'cardio' }
    ]
  }
};

var WP_PPL_TEMPLATES = {
  push_a: {
    title: '💪 Push A — Pecto / Épaules / Triceps',
    exercises: ['Développé couché','Développé incliné haltères','Écarté machine','Élévations latérales','Extension triceps','Dips']
  },
  pull_a: {
    title: '🔵 Pull A — Dos / Biceps',
    exercises: ['Tractions','Rowing barre','Tirage poitrine poulie','Curl barre','Face pull']
  },
  legs_a: {
    title: '🦵 Legs A — Quad / Fessiers',
    exercises: ['Squat','Presse à cuisses','Leg Extension','Hip Thrust','Adduction']
  },
  push_b: {
    title: '💪 Push B — Épaules / Pecto incliné',
    exercises: ['Développé militaire','Développé incliné haltères','Écarté machine','Élévations latérales','Dips']
  },
  pull_b: {
    title: '🔵 Pull B — Dos épais / Ischio',
    exercises: ['Rowing haltères','Romanian Deadlift','Leg Curl allongé','Curl marteau','Face pull']
  },
  legs_b: {
    title: '🦵 Legs B — Ischio / Fessiers',
    exercises: ['Romanian Deadlift','Leg Curl allongé','Hip Thrust','Adduction','Gainage planche']
  },
  upper_a: {
    title: '💪 Upper A',
    exercises: ['Développé couché','Rowing barre','Développé militaire','Tractions','Curl haltères','Extension triceps']
  },
  lower_a: {
    title: '🦵 Lower A',
    exercises: ['Squat','Romanian Deadlift','Presse à cuisses','Leg Curl allongé','Hip Thrust','Gainage planche']
  },
  upper_b: {
    title: '💪 Upper B',
    exercises: ['Développé incliné haltères','Rowing haltères','Élévations latérales','Tirage poitrine poulie','Curl barre','Dips']
  },
  lower_b: {
    title: '🦵 Lower B',
    exercises: ['Fentes','Romanian Deadlift','Leg Extension','Leg Curl allongé','Hip Thrust','Adduction']
  },
  full_a: {
    title: '🏋️ Full Body A',
    exercises: ['Squat','Développé couché','Rowing barre','Élévations latérales','Curl haltères','Gainage planche']
  },
  full_b: {
    title: '🏋️ Full Body B',
    exercises: ['Romanian Deadlift','Développé incliné haltères','Tractions','Hip Thrust','Extension triceps','Ab Wheel']
  },
  full_c: {
    title: '🏋️ Full Body C',
    exercises: ['Presse à cuisses','Développé militaire','Rowing haltères','Leg Curl allongé','Curl barre','Gainage planche']
  }
};

// Addendum A: Double Progression — exercices isolation uniquement
var ISOLATION_EXOS = ['Leg Curl', 'Élévations latérales', 'Curl', 'Extension triceps',
  'Écarté', 'Oiseau', 'Adduction', 'Abduction', 'Mollets', 'Face pull', 'Tirage visage'];

// Addendum B: flag niveau débutant (module-level, set par generateWeeklyPlan)
var isBeginnerMode = false;
var rpeCapReprise = null; // Correction 7: cap RPE pour avancé en reprise

// ── FONCTIONS UTILITAIRES ────────────────────────────────────

function wpRound25(v) { return Math.round(v / 2.5) * 2.5; }
function wpRound05(v) { return Math.round(v * 2) / 2; }

function wpIsIsolation(name) {
  return ISOLATION_EXOS.some(function(iso) {
    return name && name.toLowerCase().includes(iso.toLowerCase());
  });
}

// ── NORMALISATION NOM EXERCICE ───────────────────────────────
function wpNormalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c').replace(/[ñ]/g, 'n')
    .replace(/[()[\]]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── TABLE DE SYNONYMES COMPLÈTE ──────────────────────────────
var WP_SYNONYMS = {
  'Squat': [
    'Squat (Barre)','Squat (Machine)','Squat (Haltere)','Squat (Poids du Corps)',
    'Hack Squat (Machine)','Belt Squat (Machine)','Squat Avant',
    'Squat avec pause (barre)','Sumo Squat (Kettlebell)','Squat'
  ],
  'Souleve de Terre': [
    'Souleve de Terre (Barre)','Souleve de Terre Sumo',
    'Souleve De Terre avec pause','Deadlift','Romanian Deadlift (Barre)'
  ],
  'Romanian Deadlift': [
    'Souleve de Terre Roumain (Barre)','Souleve de Terre Roumain',
    'Souleve de Terre Jambes Tendues','Romanian Deadlift (Barre)','RDL'
  ],
  'Squat Pause': ['Squat avec pause (barre)', 'Squat Pause'],
  'Souleve de Terre Pause': ['Souleve De Terre avec pause', 'Souleve de Terre avec pause'],
  'Spoto Bench': ['Spoto Bench'],
  'Presse a cuisses': [
    'Presse a Cuisses','Presse a Cuisses Horizontal',
    'Presse a Cuisses (pieds Bas)','Presse a Cuisses Une Jambe',
    'Presse au Sol (Haltere)','Hack Squat (Machine)','Leg Press'
  ],
  'Leg Extension': ['Extension Jambes','Extensions Une Jambe','Leg Extension'],
  'Leg Curl allonge': [
    'Leg Curl Allonge (Machine)','Leg Curl Assis','Leg Curl Couche','Leg Curl (Machine)'
  ],
  'Hip Thrust': [
    'Hip Thrust (Machine)','Poussee de hanches (machine)',
    'Releve de Bassin (Barre)','Hip trust machine',
    'Single Leg Hip Thrust (Dumbbell)'
  ],
  'Adduction': ['Adduction Hanche','Adduction Machine'],
  'Abduction': ['Abduction Hanche','Abduction Machine'],
  'Fentes': ['Split Squat Bulgare','Fentes (Halteres)','Step Up Haltere','Fentes'],
  'Mollets (Machine)': [
    'Extension Mollets Debout (Machine)','Extension Mollets Assis','Mollets','Mollets (Machine)'
  ],
  'Kickbacks fessiers': [
    'Kickbacks Fessier (Machine)','Kickbacks Poulie','Rear Kick (Machine)','Kick back cable'
  ],
  'Extension dos': [
    'Extension Dos (Hyperextension Lestee)','Extension Dos (Hyperextension)',
    'Extension Dos (Machine)','Flexion Buste Avant (Barre)'
  ],
  'Developpe couche': [
    'Developpe Couche (Barre)','Developpe Couche (Haltere)',
    'Developpe Couche (Machine Smith)','Developpe Couche Decline (Barre)',
    'Developpe Couche Decline (Haltere)','Developpe Couche Decline (Machine)',
    'Bench Press','Bench','Chest Press (Machine)','Chest Press Convergent (Machine)',
    'Presse au Sol (Haltere)'
  ],
  'Developpe incline halteres': [
    'Developpe Couche Incline (Haltere)','Developpe Couche Incline (Barre)',
    'Developpe Couche Incline (Machine Smith)'
  ],
  'Developpe militaire': [
    'Developpe Militaire (Barre)','Developpe Militaire (Haltere)',
    'Developpe Arnold (Haltere)','Developpe Militaire Debout (Barre)',
    'Developpe Militaire Assis (Barre)','Developpe Militaire (Machine Smith)',
    'Presse Epaules Assis (Machine)','OHP','Military Press'
  ],
  'Dips': [
    'Dips Triceps','Dips Torse','Dips Banc','Machine Dips Assis',
    'Dips Torse (Assiste)','Dips Triceps (Assiste)'
  ],
  'Pompes': ['Pompes','Pompes Claquees','Pompes Diamant','Pompes - Prise Serree'],
  'Tractions': [
    'Tractions','Tractions (Elastique)','Tractions Supination','Tractions Pronation',
    'Tractions (Leste)','Tractions Elastiques','Pull-up'
  ],
  'Rowing halteres': ['Rowing Haltere','Rowing Inverse','Rowing Penche (Barre)'],
  'Rowing poulie assis': [
    'Rowing Poulie Assis','Rowing Assis (Machine)','Rowing Poulie Assis - Prise Large',
    'Seated Cable Row - V Grip (Cable)',
    'Tirage assis a la poulie - prise en V (poulie)',
    'Iso-Lateral Low Row','Rowing Debout (Barre)',
    'Tirage Horizontal Cable','Tirage un bras','Tirage Machine Convergente'
  ],
  'Tirage poitrine poulie': [
    'Tirage Poitrine (Poulie)','Tirage Poitrine (Machine)',
    'Tirage Poitrine Bras Tendus (Poulie)',
    'Tirage Poitrine - Prise Serree (Poulie)',
    'Tirage Poitrine Un Bras','Tirage bras tendu'
  ],
  'Ecarte machine': [
    'Ecarte (Machine)','Ecarte (Haltere)','Ecarte Incline (Haltere)',
    'Ecartes Poulie Basse','Ecartes Poulie','Butterfly (Pec Deck)',
    'Ecartes a la poulie assis','Pull-Over'
  ],
  'Oiseau machine': [
    'Oiseau (Machine)','Oiseau (Haltere)','Oiseau Penche (Haltere)',
    'Oiseau (Poulie)','Oiseau Un Bras (Poulie)'
  ],
  'Elevations laterales': [
    'Elevation Laterale (Haltere)','Elevation Laterale (Poulie)',
    'Elevation Laterale Complete','Elevation Disque Frontale',
    'Elevation Frontale (Haltere)','Elevation Frontale (Barre)',
    'Elevation Frontale (Poulie)','Elevation Y',
    'Single Arm Lateral Raise (Cable)','Elevation laterale a un bras (cable)'
  ],
  'Face pull': ['Tirage vers Visage','Face Pull'],
  'Extension triceps': [
    'Extension Triceps Poulie Haute','Extension Triceps (Haltere)',
    'Extension Triceps Corde','Extension Triceps (Poulie)',
    'Extension Triceps (Barre)','Skullcrusher (Haltere)','Skullcrusher (Barre)',
    'Overhead Triceps Extension (Cable)',
    'Extension des triceps au-dessus de la tete (cable)',
    'Extension Triceps Un Bras (Haltere)'
  ],
  'Curl barre': [
    'Curl Biceps (Barre)','Curl Biceps (Barre EZ)','Curl Biceps (Poulie)',
    'Curl Pupitre (Barre)','Curl Pupitre (Machine)','Curl Pupitre (Haltere)',
    'Curl Incline Assis (Haltere)','Curl Biceps (Haltere)'
  ],
  'Curl halteres': ['Curl Biceps (Haltere)','Curl Incline Assis (Haltere)'],
  'Curl marteau': ['Curl Marteau (Haltere)','Curl Marteau Oblique'],
  'Shrugs': ['Shrug (Haltere)','Shrug (Poulie)'],
  'Gainage planche': [
    'Planche','Planche Laterale','Planche Inversee','Gainage',
    'Gainage Tape Epaule','L-Sit Hold','Poirier'
  ],
  'Ab Wheel': [
    'Releve de Genoux','Releve de Jambes Allonge','Releve de Genoux Suspendu',
    'Releve de Jambes Suspendu','Releve de Jambe Barres Paralleles',
    'V Up','Abdominaux Talons','Abdos Ciseaux','Crunch Velo',
    'Crunchs Velo Jambes Sureleve','Rotation Russe (Leste)',
    'Battements de Jambes sur Banc','Flexion Laterale'
  ],
  'Tapis roulant': ['Tapis Roulant','Course a pieds','Escaliers','Randonnee','Corde a Sauter','Burpee'],
  'Natation': ['Natation','Rameur'],
  'Velo doux': ['Velo Machine','Cyclisme'],
  'Marche inclinees tapis': ['Tapis Roulant']
};

// Trouve le vrai nom dans db.logs — 3 niveaux de fallback
function wpFindBestMatch(targetName, logs) {
  var normalTarget = wpNormalizeName(targetName);

  // Niveau 1 : exact normalisé
  for (var i = 0; i < logs.length; i++) {
    var exos = logs[i].exercises || [];
    for (var j = 0; j < exos.length; j++) {
      if (wpNormalizeName(exos[j].name) === normalTarget) return exos[j].name;
    }
  }

  // Niveau 2 : synonymes (lookup par clé normalisée + reverse lookup)
  var synonyms = [];
  Object.keys(WP_SYNONYMS).forEach(function(key) {
    var normalKey = wpNormalizeName(key);
    if (normalKey === normalTarget) {
      // Clé correspond → ajouter tous ses synonymes
      synonyms = synonyms.concat(WP_SYNONYMS[key]);
    } else if (WP_SYNONYMS[key].some(function(s) { return wpNormalizeName(s) === normalTarget; })) {
      // Reverse lookup → la cible est un synonyme de cette clé
      synonyms = synonyms.concat(WP_SYNONYMS[key]).concat([key]);
    }
  });
  var normalSynonyms = synonyms.map(wpNormalizeName);
  for (var i = 0; i < logs.length; i++) {
    var exos = logs[i].exercises || [];
    for (var j = 0; j < exos.length; j++) {
      if (normalSynonyms.indexOf(wpNormalizeName(exos[j].name)) >= 0) return exos[j].name;
    }
  }

  // Niveau 3 : premier mot significatif
  var STOP = ['barre','haltere','machine','poulie','cable','assis','debout','leste','assiste'];
  var targetWords = normalTarget.split(' ').filter(function(w) {
    return w.length > 3 && STOP.indexOf(w) === -1;
  });
  if (targetWords.length > 0) {
    var firstWord = targetWords[0];
    for (var i = 0; i < logs.length; i++) {
      var exos = logs[i].exercises || [];
      for (var j = 0; j < exos.length; j++) {
        if (wpNormalizeName(exos[j].name).includes(firstWord)) return exos[j].name;
      }
    }
  }

  // Niveau 4 : mot principal au début ou après un espace (boundary plus strict)
  // STOP étendu : allonge / couche / incline aussi ignorés
  var STOP4 = ['machine','barre','haltere','poulie','cable','assis','debout','leste','assiste','allonge','couche','incline'];
  var targetWords4 = normalTarget.split(' ').filter(function(w) {
    return w.length > 3 && STOP4.indexOf(w) < 0;
  });
  if (targetWords4.length > 0) {
    var mainWord = targetWords4[0];
    for (var i = 0; i < logs.length; i++) {
      var exos = logs[i].exercises || [];
      for (var j = 0; j < exos.length; j++) {
        var normalLog = wpNormalizeName(exos[j].name);
        if (normalLog.startsWith(mainWord) || normalLog.includes(' ' + mainWord)) {
          return exos[j].name;
        }
      }
    }
  }

  return null;
}

// Fallback PR/BW pour exercices jamais faits
function wpEstimateWeight(exoName) {
  var bw = parseFloat(db.user && db.user.bw) || 80;
  var pr = db.bestPR || {};
  var ESTIMATES = {
    'Spoto Bench':              { base: 'bench',    ratio: 0.80 },
    'Souleve de Terre Pause':   { base: 'deadlift', ratio: 0.75 },
    'Squat Pause':              { base: 'squat',    ratio: 0.80 },
    'Ab Wheel':                 { base: 'bw',       ratio: 0    },
    'Gainage planche':          { base: 'bw',       ratio: 0    },
    'Presse a cuisses':         { base: 'bw',       ratio: 2.50 },
    'Leg Extension':            { base: 'bw',       ratio: 0.55 },
    'Leg Curl allonge':         { base: 'bw',       ratio: 0.45 },
    'Elevations laterales':     { base: 'bw',       ratio: 0.12 },
    'Shrugs':                   { base: 'bw',       ratio: 0.90 },
    'Ecarte machine':           { base: 'bench',    ratio: 0.65 },
    'Oiseau machine':           { base: 'bw',       ratio: 0.45 },
    'Tirage poitrine poulie':   { base: 'bw',       ratio: 0.60 },
    'Romanian Deadlift':        { base: 'deadlift', ratio: 0.65 },
    'Rowing poulie assis':      { base: 'deadlift', ratio: 0.50 },
    'Developpe incline halteres': { base: 'bench',  ratio: 0.55 },
    'Extension triceps':        { base: 'bw',       ratio: 0.25 },
    'Curl barre':               { base: 'bw',       ratio: 0.22 },
    'Face pull':                { base: 'bw',       ratio: 0.18 },
    'Hip Thrust':               { base: 'bw',       ratio: 1.20 },
    'Adduction':                { base: 'bw',       ratio: 1.00 },
    'Abduction':                { base: 'bw',       ratio: 0.90 },
    'Mollets Machine':          { base: 'bw',       ratio: 1.40 }
  };
  var normalExo = wpNormalizeName(exoName);
  var est = null;
  Object.keys(ESTIMATES).forEach(function(key) {
    var nk = wpNormalizeName(key);
    if (normalExo === nk || normalExo.includes(nk.split(' ')[0])) est = ESTIMATES[key];
  });
  if (!est) return wpRound25(bw * 0.40);
  if (est.ratio === 0) return null;
  var baseVal = est.base === 'bw' ? bw
    : est.base === 'bench'    ? (pr.bench    || bw * 1.0)
    : est.base === 'squat'    ? (pr.squat    || bw * 1.3)
    : est.base === 'deadlift' ? (pr.deadlift || bw * 1.6)
    : bw;
  return wpRound25(baseVal * est.ratio);
}

function wpDoubleProgressionWeight(exoName, targetRepMin, targetRepMax) {
  var logs = (db.logs || []).slice().sort(function(a, b) { return (b.timestamp||0) - (a.timestamp||0); });
  var realName = wpFindBestMatch(exoName, logs);
  if (!realName) return null;
  for (var i = 0; i < Math.min(logs.length, 15); i++) {
    var log = logs[i];
    var exo = (log.exercises || []).find(function(e) {
      return wpNormalizeName(e.name) === wpNormalizeName(realName);
    });
    if (!exo) continue;
    var workSets = (exo.allSets || exo.series || []).filter(function(s) {
      var isWarm = s.isWarmup === true || s.setType === 'warmup';
      return !isWarm && parseFloat(s.weight) > 0;
    });
    if (!workSets.length) continue;
    var lastSet    = workSets[workSets.length - 1];
    var lastWeight = parseFloat(lastSet.weight) || 0;
    var lastRpe    = parseFloat(lastSet.rpe)    || 8;
    var completedSets = workSets.filter(function(s) { return parseInt(s.reps) > 0; });
    if (!completedSets.length) {
      return { weight: lastWeight, reps: targetRepMax, progressed: false };
    }
    var allSetsComplete = completedSets.every(function(s) {
      return parseInt(s.reps) >= targetRepMax;
    });
    if (allSetsComplete && lastRpe <= 8) {
      return { weight: wpRound25(lastWeight + 2), reps: targetRepMin, progressed: true };
    }
    return { weight: lastWeight, reps: targetRepMax, progressed: false };
  }
  var estimated = wpEstimateWeight(exoName, null);
  if (estimated) {
    return { weight: estimated, reps: targetRepMin, progressed: false, isEstimate: true };
  }
  return null;
}

// ── FORMULE BRZYCKI AJUSTÉE RPE ─────────────────────────────
function wpCalcE1RM(weight, reps, rpe) {
  weight = parseFloat(weight) || 0;
  reps   = parseInt(reps)    || 1;
  rpe    = parseFloat(rpe)   || 8;
  if (weight <= 0) return 0;
  if (reps <= 0)   return weight;
  rpe = Math.max(6, Math.min(10, rpe));
  var divisor = 1.0278 - 0.0278 * (reps + (10 - rpe));
  if (divisor <= 0) return weight * 1.5;
  return Math.round((weight / divisor) * 10) / 10;
}

function wpComputeWorkWeight(liftType, bodyPart) {
  var pr = db.bestPR || {};
  var logs = (db.logs || []).slice().sort(function(a, b) { return (b.timestamp||0) - (a.timestamp||0); });
  var targetNames = {
    squat: 'Squat', bench: 'Développé couché',
    deadlift: 'Soulevé de Terre', squat_pause: 'Squat Pause'
  };
  var targetName = targetNames[liftType] || liftType;
  var realName = wpFindBestMatch(targetName, logs);

  if (!realName) {
    var prVal = pr[liftType] || 0;
    return prVal > 0 ? wpRound25(prVal * 0.75) : 60;
  }

  var history = [];
  for (var i = 0; i < logs.length && history.length < 4; i++) {
    var log = logs[i];
    var exo = (log.exercises || []).find(function(e) {
      return wpNormalizeName(e.name) === wpNormalizeName(realName);
    });
    if (!exo) continue;
    var workSets = (exo.allSets || exo.series || []).filter(function(s) {
      var isWarm = s.isWarmup === true || s.setType === 'warmup';
      return !isWarm && parseFloat(s.weight) > 0 && parseInt(s.reps) > 0;
    });
    if (!workSets.length) continue;
    var maxSet = workSets.reduce(function(m, s) {
      return parseFloat(s.weight) > parseFloat(m.weight) ? s : m;
    }, workSets[0]);
    history.push({
      weight: parseFloat(maxSet.weight) || 0,
      reps:   parseInt(maxSet.reps)     || 0,
      rpe:    parseFloat(maxSet.rpe)    || 7.5,
      e1rm:   wpCalcE1RM(maxSet.weight, maxSet.reps, maxSet.rpe)
    });
  }

  if (!history.length) {
    var prVal = pr[liftType] || 0;
    return prVal > 0 ? wpRound25(prVal * 0.75) : 60;
  }

  var last = history[0];
  var prog = WP_PROGRESSION[bodyPart] || WP_PROGRESSION.upper;
  var logsCount = (db.logs || []).length;
  var isCuttingW = ((db.user && db.user.programParams && db.user.programParams.goals) || []).includes('seche');
  var baseWeight;

  if (isBeginnerMode) {
    baseWeight = last.rpe < 9 ? last.weight + prog.increase : last.weight;
  } else if (isCuttingW) {
    // Correction 6: sèche → progression par reps, charge seulement si RPE < 7
    baseWeight = last.rpe < 7 ? last.weight + prog.increase : last.weight;
  } else {
    if (last.rpe < 8)         baseWeight = last.weight + prog.increase;
    else if (last.rpe <= 8.5) baseWeight = last.weight;
    else if (last.rpe < 9.5)  baseWeight = last.weight;
    else                      baseWeight = wpRound25(last.weight * 0.90);
    if (history.length >= 2 && history[1].rpe <= 7 && last.rpe >= 9) {
      baseWeight = last.weight;
    }
  }

  // Correction 7: RPE cap reprise (Jordan)
  if (rpeCapReprise !== null && last.rpe >= rpeCapReprise) {
    baseWeight = last.weight;
  }

  // e1RM growth : si e1RM a progressé avec RPE stable → charge sous-estimée (RPE menteur)
  if (history.length >= 2) {
    var e1rmGrowth = (history[0].e1rm || 0) - (history[1].e1rm || 0);
    if (e1rmGrowth > 5 && history[0].rpe <= history[1].rpe) {
      baseWeight = wpRound25(last.weight + prog.increase * 1.5);
    }
  }

  // Bloc post-deload (Gemini) : multiplicateurs e1RM sur 4 semaines
  var PHASE_MULT = { intro: 0.90, accumulation: 0.95, intensification: 1.00, peak: 1.05, deload: 0.60 };
  var currentPhase = typeof wpDetectPhase === 'function' ? wpDetectPhase() : 'accumulation';
  var lastDeloadPlan = (db.weeklyPlanHistory || []).slice().reverse().find(function(p) { return p.isDeload; });
  var weeksSinceDeload2 = lastDeloadPlan
    ? Math.round((Date.now() - new Date(lastDeloadPlan.generated_at).getTime()) / (7 * 86400000))
    : 99;
  if (weeksSinceDeload2 <= 4) {
    var mult = PHASE_MULT[currentPhase] || 1.0;
    var preDeloadE1rm = Math.max.apply(null, history.map(function(h) { return h.e1rm || 0; }));
    if (preDeloadE1rm > 0 && mult !== 1.0) {
      var wReps = wpRepsForPhase(currentPhase);
      var d = 1.0278 - 0.0278 * wReps;
      if (d > 0) baseWeight = wpRound25(preDeloadE1rm * mult * d);
    }
  }

  return wpRound25(baseWeight);
}

function wpDetectPlateau(liftType) {
  var logs = db.logs || [];
  var liftNames = {
    squat:    ['Squat', 'Squat (Barre)'],
    bench:    ['Développé couché', 'Bench'],
    deadlift: ['Soulevé de Terre', 'Deadlift']
  };
  var names = liftNames[liftType] || [];
  var history = [];
  var sortedLogs2 = logs.slice().sort(function(a, b) { return (b.timestamp||0) - (a.timestamp||0); });
  for (var i = 0; i < sortedLogs2.length && history.length < 6; i++) {
    var log = sortedLogs2[i];
    var exo = (log.exercises || []).find(function(e) {
      return names.some(function(n) { return e.name && e.name.toLowerCase().includes(n.toLowerCase()); });
    });
    if (!exo) continue;
    var workSets = (exo.allSets || exo.series || []).filter(function(s) {
      var isWarm = s.isWarmup === true || s.setType === 'warmup';
      return !isWarm && parseFloat(s.weight) > 0;
    });
    if (!workSets.length) continue;
    var best = workSets.reduce(function(m, s) {
      return parseFloat(s.weight) > parseFloat(m.weight) ? s : m;
    }, workSets[0]);
    history.push({ weight: parseFloat(best.weight) || 0, rpe: parseFloat(best.rpe) || 7.5 });
  }
  if (history.length < 3) return null;
  var stagnant = history[0].weight === history[1].weight && history[0].weight === history[2].weight;
  var highRpe = history[0].rpe >= 9 && history[1].rpe >= 9;
  if (!stagnant || !highRpe) return null;
  var corrections = {
    bench:    { variation: 'Spoto Bench',  reason: 'Échec probable en bas de mouvement' },
    squat:    { variation: 'Squat Pause',  reason: 'Renforcer la sortie du trou' },
    deadlift: { variation: 'Block Pulls',  reason: 'Travailler le verrouillage au genou' }
  };
  return { liftType: liftType, sessions: history.length, correction: corrections[liftType], action: 'back_off_10pct' };
}

function wpDetectPhase() {
  var deloadCheck = typeof shouldDeload === 'function' ? shouldDeload(db.logs, db.user.trainingMode) : { needed: false };
  if (deloadCheck.needed) return 'deload';
  var weeksSince = 0;
  var plans = db.weeklyPlanHistory || [];
  for (var i = plans.length - 1; i >= 0; i--) {
    if (plans[i].isDeload) {
      weeksSince = Math.round((Date.now() - new Date(plans[i].generated_at).getTime()) / (7 * 86400000));
      break;
    }
  }
  if (weeksSince === 0) {
    // Fallback : rotation sur 4 semaines selon la fréquence réelle
    // Évite le blocage en Peak permanent (ex: 497 logs → 124 semaines → toujours peak)
    var freq = (db.user && db.user.programParams && db.user.programParams.freq) || 4;
    var totalWeeks = Math.round((db.logs || []).length / Math.max(1, freq));
    weeksSince = (totalWeeks % 4) + 1; // Cycle 1→2→3→4→1→2→3→4...
  }
  // Bloc post-deload (Gemini) : S1 intro → S2 accum → S3 intensif → S4+ peak
  if (weeksSince === 1) return 'intro';
  if (weeksSince === 2) return 'accumulation';
  if (weeksSince === 3) return 'intensification';
  if (weeksSince >= 4)  return 'peak';
  return 'intro';
}

function wpRepsForPhase(phase) {
  return { intro: 5, accumulation: 5, intensification: 3, peak: 2, deload: 5 }[phase] || 5;
}
function wpSetsForPhase(phase) {
  return { intro: 4, accumulation: 4, intensification: 4, peak: 3, deload: 2 }[phase] || 4;
}
function wpRpeForPhase(phase) {
  return { intro: 7, accumulation: 8, intensification: 8.5, peak: 9, deload: 6 }[phase] || 8;
}

function wpBuildMainSets(weight, reps, setsCount, rpe) {
  return Array.from({ length: setsCount }, function() {
    return { weight: weight, reps: reps, rpe: rpe, isWarmup: false };
  });
}

function wpApplySupersets(exercises) {
  var result = [];
  var i = 0;
  while (i < exercises.length) {
    var exo = exercises[i];
    var isHeavy = exo.isPrimary || /squat|bench|deadlift|développé couché|soulevé|rowing poulie|tractions/i.test(exo.name || '');
    if (!isHeavy && i + 1 < exercises.length) {
      var next = exercises[i + 1];
      var nextIsHeavy = next.isPrimary || /squat|bench|deadlift|développé couché|soulevé|rowing poulie|tractions/i.test(next.name || '');
      if (!nextIsHeavy) {
        exo.superset = true;
        exo.supersetWith = next.name;
        next.isSecondInSuperset = true;
        next.restSeconds = 0;
        result.push(exo);
        result.push(next);
        i += 2;
        continue;
      }
    }
    result.push(exo);
    i++;
  }
  return result;
}

function wpCoachNote(liftType, phase, weight, history) {
  var notes = [];
  var plateau = liftType ? wpDetectPlateau(liftType) : null;
  if (plateau) notes.push('⚠️ Plateau détecté sur ' + liftType + ' — ' + plateau.correction.reason + '. Cette semaine : ' + plateau.correction.variation + '.');
  if (phase === 'peak') notes.push('Semaine Peak — gros efforts, récupération maximale entre séances. RPE 9 toléré.');
  if (phase === 'deload') notes.push('Deload — charges -20%, volume ÷2. On recharge le SNC.');
  if (phase === 'accumulation') notes.push('Phase d\'accumulation — construire le volume, valider les paliers.');
  if (history && history.length > 0) {
    if (history[0].rpe >= 9.5) notes.push('RPE très élevé la semaine passée — charges ajustées à la baisse.');
    else if (history[0].rpe < 7) notes.push('RPE faible → charges augmentées cette semaine.');
  }
  return notes.slice(0, 2).join(' ');
}

// Addendum H: Cardio adapté blessures
function wpGetCardioForProfile(injuries, duration, isCutting) {
  var hasWrist = (injuries || []).includes('poignets');
  var hasNeck  = (injuries || []).includes('nuque');
  if (hasWrist || hasNeck) {
    return {
      name: 'Marche inclinée (tapis)', type: 'cardio', restSeconds: 0,
      sets: [{ durationMin: duration || 15, incline: 7, speed: 5.5, isWarmup: false }],
      coachNote: 'Marche inclinée — 0 tension poignets/nuque. Pente 5-8%, 5-6km/h.'
    };
  }
  return { name: 'Tapis roulant', type: 'cardio', restSeconds: 0, sets: [{ durationMin: duration || 20, isWarmup: false }] };
}

// Addendum F: Pain Tracker
function wpCheckPainScore(score) {
  score = parseInt(score) || 0;
  if (score <= 2) return { proceed: true, note: '', modifySession: false };
  if (score <= 5) return {
    proceed: true,
    note: '⚠️ Courbatures détectées — échauffement prolongé recommandé (+5min). Les DOMS disparaissent avec la chaleur.',
    modifySession: false
  };
  return {
    proceed: false,
    note: '🛑 Douleur articulaire détectée (score ' + score + '/10). Séance de force annulée — mobilité forcée.',
    modifySession: true, forceMobility: true,
    mobilitySession: [
      { name: 'Échauffement articulaire', type: 'time', sets: [{ durationSec: 600, isWarmup: false }] },
      { name: 'Yoga & Mobilité',          type: 'time', sets: [{ durationSec: 1800, isWarmup: false }] },
      { name: 'Marche active',            type: 'cardio', sets: [{ durationMin: 20, isWarmup: false }] }
    ]
  };
}

// Addendum D: Séances manquées
function wpCountMissedSessions() {
  var routine = getRoutine();
  var now = Date.now();
  var weekStart = now - (new Date().getDay() || 7) * 86400000;
  weekStart = new Date(weekStart).setHours(0, 0, 0, 0);
  var plannedDays = 0, doneDays = 0;
  var allDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  allDays.forEach(function(day, idx) {
    var dayTs = weekStart + idx * 86400000;
    if (dayTs > now) return;
    var label = routine[day] || '';
    if (!label || /repos/i.test(label)) return;
    plannedDays++;
    var done = (db.logs || []).some(function(l) { return l.timestamp >= dayTs && l.timestamp < dayTs + 86400000; });
    if (done) doneDays++;
  });
  return plannedDays - doneDays;
}

function wpAdjustForMissedSessions(plan, missed) {
  if (missed === 0) return plan;
  if (missed === 1) { plan.missedNote = '1 séance manquée — décalage sur le lendemain possible.'; return plan; }
  if (missed === 2) {
    plan.days = plan.days.map(function(d) {
      if (d.rest) return d;
      if (/point|faible|technique|accessoire/i.test(d.title || '')) {
        return { day: d.day, rest: true, title: '😴 Repos (séance compressée)', exercises: [] };
      }
      return d;
    });
    plan.missedNote = '2 séances manquées — programme compressé sur les lifts principaux.';
    return plan;
  }
  plan.isRepeatWeek = true;
  plan.missedNote = 'Plus de 2 séances manquées — semaine répétée. Mêmes charges qu\'avant.';
  var lastLog = (db.logs || []).slice().sort(function(a, b) { return (b.timestamp||0) - (a.timestamp||0); })[0];
  var daysSinceLastLog = lastLog ? Math.round((Date.now() - lastLog.timestamp) / 86400000) : 0;
  if (daysSinceLastLog > 10) {
    plan.days.forEach(function(d) {
      if (d.rest) return;
      d.exercises.forEach(function(exo) {
        exo.sets = (exo.sets || []).map(function(s) {
          if (s.isWarmup || !s.weight) return s;
          return Object.assign({}, s, { weight: wpRound25(s.weight * 0.95) });
        });
      });
    });
    plan.missedNote += ' Gap > 10 jours → charges réduites de 5%.';
  }
  return plan;
}

var WP_EXO_META = {
  'squat barre':               { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'quad'     },
  'squat pause':               { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'quad'     },
  'hack squat':                { mechanic: 'compound',  equipment: 'machine',    muscleGroup: 'quad'     },
  'presse a cuisses':          { mechanic: 'compound',  equipment: 'machine',    muscleGroup: 'quad'     },
  'leg press':                 { mechanic: 'compound',  equipment: 'machine',    muscleGroup: 'quad'     },
  'extension jambes':          { mechanic: 'isolation', equipment: 'machine',    muscleGroup: 'quad'     },
  'leg extension':             { mechanic: 'isolation', equipment: 'machine',    muscleGroup: 'quad'     },
  'fente halteres':            { mechanic: 'compound',  equipment: 'dumbbell',   muscleGroup: 'quad'     },
  'fente barre':               { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'quad'     },
  'souleve de terre':          { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'hams'     },
  'romanian deadlift':         { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'hams'     },
  'souleve de terre roumain':  { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'hams'     },
  'leg curl':                  { mechanic: 'isolation', equipment: 'machine',    muscleGroup: 'hams'     },
  'good morning':              { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'hams'     },
  'hip thrust':                { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'glute'    },
  'rowing barre':              { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'back'     },
  'rowing haltere':            { mechanic: 'compound',  equipment: 'dumbbell',   muscleGroup: 'back'     },
  'rowing poulie assis':       { mechanic: 'compound',  equipment: 'cable',      muscleGroup: 'back'     },
  'rowing poulie':             { mechanic: 'compound',  equipment: 'cable',      muscleGroup: 'back'     },
  'tirage poulie':             { mechanic: 'compound',  equipment: 'cable',      muscleGroup: 'back'     },
  'tirage vertical':           { mechanic: 'compound',  equipment: 'cable',      muscleGroup: 'back'     },
  'tirage isole':              { mechanic: 'compound',  equipment: 'cable',      muscleGroup: 'back'     },
  'tractions':                 { mechanic: 'compound',  equipment: 'bodyweight', muscleGroup: 'back'     },
  'extension dos':             { mechanic: 'compound',  equipment: 'bodyweight', muscleGroup: 'back'     },
  'spoto bench':               { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'chest'    },
  'souleve de terre pause':    { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'hams'     },
  'developpe couche':          { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'chest'    },
  'developpe incline halteres':{ mechanic: 'compound',  equipment: 'dumbbell',   muscleGroup: 'chest'    },
  'developpe incline':         { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'chest'    },
  'ecarte poulie':             { mechanic: 'isolation', equipment: 'cable',      muscleGroup: 'chest'    },
  'ecarte halteres':           { mechanic: 'isolation', equipment: 'dumbbell',   muscleGroup: 'chest'    },
  'dips':                      { mechanic: 'compound',  equipment: 'bodyweight', muscleGroup: 'chest'    },
  'developpe militaire':       { mechanic: 'compound',  equipment: 'barbell',    muscleGroup: 'shoulder' },
  'developpe halteres':        { mechanic: 'compound',  equipment: 'dumbbell',   muscleGroup: 'shoulder' },
  'elevations laterales':      { mechanic: 'isolation', equipment: 'dumbbell',   muscleGroup: 'shoulder' },
  'elevations poulie':         { mechanic: 'isolation', equipment: 'cable',      muscleGroup: 'shoulder' },
  'oiseau':                    { mechanic: 'isolation', equipment: 'dumbbell',   muscleGroup: 'shoulder' },
  'curl barre':                { mechanic: 'isolation', equipment: 'barbell',    muscleGroup: 'biceps'   },
  'curl haltere':              { mechanic: 'isolation', equipment: 'dumbbell',   muscleGroup: 'biceps'   },
  'curl marteau':              { mechanic: 'isolation', equipment: 'dumbbell',   muscleGroup: 'biceps'   },
  'curl poulie':               { mechanic: 'isolation', equipment: 'cable',      muscleGroup: 'biceps'   },
  'extension triceps barre':   { mechanic: 'isolation', equipment: 'barbell',    muscleGroup: 'triceps'  },
  'triceps corde':             { mechanic: 'isolation', equipment: 'cable',      muscleGroup: 'triceps'  },
  'triceps poulie':            { mechanic: 'isolation', equipment: 'cable',      muscleGroup: 'triceps'  },
  'skullcrusher':              { mechanic: 'isolation', equipment: 'barbell',    muscleGroup: 'triceps'  },
  'gainage':                   { mechanic: 'compound',  equipment: 'bodyweight', muscleGroup: 'core'     },
  'crunch':                    { mechanic: 'isolation', equipment: 'bodyweight', muscleGroup: 'core'     },
  'releve de jambes':          { mechanic: 'isolation', equipment: 'bodyweight', muscleGroup: 'core'     },
  'mollets presse':            { mechanic: 'isolation', equipment: 'machine',    muscleGroup: 'calves'   },
  'mollets debout':            { mechanic: 'isolation', equipment: 'machine',    muscleGroup: 'calves'   },
  'mollets halteres':          { mechanic: 'isolation', equipment: 'dumbbell',   muscleGroup: 'calves'   }
};

function wpGetExoMeta(name) {
  if (!name) return null;
  var n = wpNormalizeName(name);

  // Niveau 1 : égalité stricte normalisée
  var keys = Object.keys(WP_EXO_META);
  for (var i = 0; i < keys.length; i++) {
    if (wpNormalizeName(keys[i]) === n) return WP_EXO_META[keys[i]];
  }

  // Niveau 2 : frontière de mot (évite 'curl' → 'leg curl')
  for (var i = 0; i < keys.length; i++) {
    var keyNorm = wpNormalizeName(keys[i]);
    try {
      if (new RegExp('\\b' + keyNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(n)) {
        return WP_EXO_META[keys[i]];
      }
    } catch(e) { /* ignore regex errors */ }
  }

  // Niveau 3 : fallback sur le premier mot significatif de la clé
  for (var i = 0; i < keys.length; i++) {
    var keyNorm = wpNormalizeName(keys[i]);
    var firstWord = keyNorm.split(' ')[0];
    if (firstWord.length > 3 && (n.startsWith(firstWord + ' ') || n === firstWord)) {
      return WP_EXO_META[keys[i]];
    }
  }

  return null;
}

function wpNeedsAcclimationWarmup(exoName, previousExoNames, workWeight) {
  var meta = wpGetExoMeta(exoName);
  if (!meta || meta.mechanic === 'isolation') return false;
  if (meta.equipment === 'machine' && workWeight > 100) return true;
  if (!previousExoNames || !previousExoNames.length) return false;
  var prevMetas = previousExoNames.map(wpGetExoMeta).filter(Boolean);
  if (!prevMetas.length) return false;
  // Règle 2 : shift d'instabilité (machine → câble OU machine/câble → poids libre)
  var instabilityRank = { machine: 0, cable: 1, barbell: 2, dumbbell: 3, bodyweight: 2, unknown: 0 };
  var currRank = instabilityRank[meta.equipment] || 0;
  var isUnstableShift = meta.equipment === 'barbell' || meta.equipment === 'dumbbell' || meta.equipment === 'cable';
  if (!isUnstableShift) return false;
  var prevEquips = prevMetas.map(function(m) { return m.equipment; });
  var maxPrevRank = Math.max.apply(null, prevEquips.map(function(eq) {
    return instabilityRank[eq] || 0;
  }));
  if (currRank > maxPrevRank) return true;
  // Règle 1 : changement de groupe musculaire
  var prevGroups = prevMetas.map(function(m) { return m.muscleGroup; });
  if (!prevGroups.includes(meta.muscleGroup)) return true;
  return false;
}

function wpBuildWarmups(workWeight, workReps, liftType, exerciseOrder, previousExoNames) {
  if (!workWeight || workWeight < 40) return [];
  if ((exerciseOrder || 1) > 1) {
    var needsFeeler = wpNeedsAcclimationWarmup(liftType, previousExoNames || [], workWeight);
    if (!needsFeeler) return [];
    var feelerWeight = wpRound25(workWeight * 0.75);
    if (feelerWeight >= workWeight * 0.95) return [];
    return [{ weight: feelerWeight, reps: Math.min(4, workReps || 4), isWarmup: true, restSeconds: 90 }];
  }
  var steps, repsPattern, restsPattern;
  if (workReps <= 3) {
    steps        = [0.40, 0.55, 0.70, 0.82, 0.90];
    repsPattern  = [8,    5,    3,    2,    1   ];
    restsPattern = [60,   90,   120,  120,  150 ];
  } else {
    steps        = [0.40, 0.55, 0.70, 0.80];
    repsPattern  = [8,    5,    3,    2   ];
    restsPattern = [60,   90,   90,   120 ];
  }
  var warmups = [];
  for (var i = 0; i < steps.length; i++) {
    var w = Math.round((workWeight * steps[i]) / 2.5) * 2.5;
    if (w < 20) continue;
    if (w >= workWeight * 0.95) continue;
    if (warmups.length > 0 && warmups[warmups.length - 1].weight === w) continue;
    // Paliers 1-2 (i < 2) : reps libres pour chauffer le muscle
    // Paliers 3-5 (i >= 2) : reps ≤ workReps (spécificité power, Gemini)
    var rawReps   = repsPattern[i];
    var finalReps = i >= 2 ? Math.min(rawReps, workReps) : rawReps;
    finalReps = Math.max(1, finalReps);
    warmups.push({ weight: w, reps: finalReps, isWarmup: true, restSeconds: restsPattern[i] || 90 });
  }
  return warmups;
}

function wpFilterInjuries(exoList, injuries) {
  if (!injuries || !injuries.length) return exoList;
  var excluded = injuries.reduce(function(acc, zone) {
    return acc.concat(WP_INJURY_EXCLUSIONS[zone] || []);
  }, []);
  return exoList.filter(function(e) {
    var name = typeof e === 'string' ? e : (e.name || '');
    return !excluded.some(function(ex) {
      return name.toLowerCase().includes(ex.toLowerCase());
    });
  });
}

// ── GÉNÉRATION PAR MODE ─────────────────────────────────────

function wpDeriveTitle(exercises) {
  var NAMES = { quad:'Jambes', hams:'Ischios', glute:'Fessiers', chest:'Pecs', back:'Dos', shoulder:'Épaules', biceps:'Biceps', triceps:'Triceps', core:'Gainage', calves:'Mollets' };
  var ICONS = { quad:'🦵', hams:'🦵', glute:'🍑', chest:'💪', back:'🔵', shoulder:'🎯', biceps:'💪', triceps:'💪', core:'🧘', calves:'🦿' };
  var counts = {};
  (exercises || []).forEach(function(e) {
    var meta = wpGetExoMeta(e && e.name);
    if (!meta || !meta.muscleGroup) return;
    counts[meta.muscleGroup] = (counts[meta.muscleGroup] || 0) + 1;
  });
  var groups = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
  if (!groups.length) return null;
  var top = groups.slice(0, 2);
  return (ICONS[top[0]] || '🏋️') + ' ' + top.map(function(g) { return NAMES[g] || g; }).join(' — ');
}

function wpGeneratePowerbuildingDay(dayKey, routine, phase, params) {
  var tpl = WP_SESSION_TEMPLATES[dayKey];
  if (!tpl) return null;
  var bodyPart = tpl.bodyPart;
  var injuries = params.injuries || [];
  var duration = params.duration || 90;
  var goals = params.goals || [];
  var isCutting = goals.includes('seche');

  // Addendum C: sèche + fatigue élevée → deload forcé
  if (isCutting && typeof computeFatigueScore === 'function') {
    if (computeFatigueScore(db.logs) > 75) {
      phase = 'deload';
      showToast('⚠️ Sèche + fatigue élevée → Deload forcé');
    }
  }

  var useSupersets = duration <= 60 || isCutting;
  var maxExos = duration <= 45 ? 5 : duration <= 60 ? 7 : duration <= 90 ? 9 : 12;
  var exercises = [];

  if (tpl.mainLift && tpl.mainLift !== 'squat_pause') {
    var weight = wpComputeWorkWeight(tpl.mainLift, bodyPart);
    var reps = wpRepsForPhase(phase);
    var setsCount = wpSetsForPhase(phase);
    var rpe = wpRpeForPhase(phase);
    if (isCutting) setsCount = Math.max(2, Math.floor(setsCount * 0.7));
    var mainName = tpl.mainLift === 'squat' ? 'Squat (Barre)' : tpl.mainLift === 'bench' ? 'Développé couché' : 'Soulevé de Terre';
    var warmups = wpBuildWarmups(weight, reps, mainName, 1, []);
    if (phase === 'deload') { weight = wpRound25(weight * 0.80); setsCount = Math.ceil(setsCount / 2); rpe = 6; }
    var mainExoObj = {
      name: mainName,
      type: 'weight', restSeconds: bodyPart === 'lower' ? 300 : 240, isPrimary: true,
      sets: warmups.concat(wpBuildMainSets(weight, reps, setsCount, rpe))
    };
    // Correction 2: Peak → 5min repos obligatoire + note vitesse de barre
    if (phase === 'peak') {
      mainExoObj.restSeconds = 300;
      mainExoObj.coachNote = '⚠️ Repos 5min minimum entre les séries. Ne cherche pas l\'échec — cherche la vitesse de barre. Récupération nerveuse prioritaire.';
    }
    // Alerte "en forme aujourd'hui" (Gemini Option B UX)
    if (phase === 'intensification' || phase === 'peak') {
      mainExoObj.coachNote = (mainExoObj.coachNote || '') + ' 💡 Si les paliers d\'échauffement semblent légers (RPE < 7), tente +5kg sur le Top Set.';
    }
    exercises.push(mainExoObj);
  }

  if (tpl.mainLift === 'squat_pause') {
    var sqW = wpComputeWorkWeight('squat', 'lower');
    var pauseWeight = wpRound25(sqW * 0.85);
    exercises.push({
      name: 'Squat Pause', type: 'weight', restSeconds: 240, isPrimary: true,
      sets: wpBuildWarmups(pauseWeight, 3, 'Squat Pause', 1, []).concat(wpBuildMainSets(pauseWeight, 3, 5, 8))
    });
  }

  var accessories = wpFilterInjuries(tpl.accessories || [], injuries);
  // Rééquilibrage Squat/Bench (Gemini)
  if (dayKey === 'squat') {
    var imbalance = wpDetectSquatBenchImbalance();
    if (imbalance && imbalance.imbalance) {
      accessories = accessories.map(function(a) {
        if (/presse|leg.ext|extension.jambe/i.test(a.name)) {
          return Object.assign({}, a, { sets: (a.sets || 3) + 1 });
        }
        return a;
      });
    }
  }
  var remaining = maxExos - exercises.length;
  var placedExoNames = exercises.map(function(e) { return e.name || ''; });
  // Trier par priorité avant de couper — évite de supprimer les exercices cruciaux (Gemini)
  var sortedAccessories = accessories.slice().sort(function(a, b) {
    return (a.priority || 2) - (b.priority || 2);
  });
  sortedAccessories.slice(0, remaining).map(function(acc) {
    var cappedSets = duration <= 45
      ? Math.max(2, Math.min(acc.sets || 3, 3))
      : (acc.sets || 3);
    return Object.assign({}, acc, { sets: cappedSets });
  }).forEach(function(acc) {
    var accOrder = acc.isPrimary ? 1 : (placedExoNames.length + 1);
    // ── Rotation plateau isolation ──────────────────────────
    var plat = wpDetectIsolationPlateau(acc.name);
    if (plat && plat.plateauWeeks >= 3) {
      var vi = WP_ISOLATION_VARIANTS[acc.name];
      if (vi) acc = Object.assign({}, acc, { name: vi.variant, reps: vi.repRange[0] + '-' + vi.repRange[1], plateauNote: '🔄 Variante auto — ' + plat.plateauWeeks + ' sem. plateau' });
    } else if (plat && plat.plateauWeeks >= 1) {
      var hiR = parseInt(String(acc.reps).split('-').pop() || '12') + 3;
      var loR = parseInt(String(acc.reps).split('-')[0] || '10') + 3;
      acc = Object.assign({}, acc, { reps: loR + '-' + hiR, plateauNote: '📈 Rep range +3 — plateau sem. ' + plat.plateauWeeks });
    }
    var repsArr = String(acc.reps || '10').split('-').map(Number);
    var repsLow  = repsArr[0] || 10;
    var repsHigh = repsArr[repsArr.length - 1] || 12;
    var repsVal  = repsHigh;
    var sc = phase === 'deload' ? Math.ceil((acc.sets || 3) / 2) : (acc.sets || 3);
    // Tapering Peak : -1 série sur les accessoires pour préserver la fraîcheur nerveuse
    if (phase === 'peak' && !acc.isPrimary && acc.type !== 'time' && acc.type !== 'cardio') {
      sc = Math.max(1, sc - 1);
    }
    if (isCutting) sc = Math.max(2, Math.floor(sc * 0.7));
    var restVal = phase === 'deload' ? 90 : (acc.rest || 120);
    if (isCutting) restVal += 30;
    var dpResult = wpDoubleProgressionWeight(acc.name, repsLow, repsHigh);

    if (acc.type === 'time') {
      exercises.push({ name: acc.name, type: 'time', restSeconds: acc.rest || 60,
        sets: Array.from({ length: sc }, function() { return { durationSec: 90, isWarmup: false }; }) });
    } else if (acc.type === 'cardio') {
      exercises.push({ name: acc.name, type: 'cardio', restSeconds: 0, sets: [{ durationMin: 45, isWarmup: false }] });
    } else if (acc.type === 'reps' && acc.useBodyweight) {
      var bw = parseFloat(db.user.bw) || 80;
      exercises.push({ name: acc.name, type: 'reps', restSeconds: acc.rest || 120, bodyweightBase: bw,
        sets: Array.from({ length: sc }, function() { return { reps: repsVal, rpe: acc.rpe || 8, weight: null, isWarmup: false, useBodyweight: true }; }) });
    } else {
      var accWeight = dpResult ? (parseFloat(dpResult.weight) || 0) : 0;
      var accWarmups = wpBuildWarmups(accWeight, repsVal, acc.name, accOrder, placedExoNames);
      var exoObj = { name: acc.name, type: 'weight', restSeconds: restVal,
        sets: accWarmups.concat(Array.from({ length: sc }, function() {
          return { reps: dpResult ? dpResult.reps : repsVal, rpe: phase === 'deload' ? 6 : (acc.rpe || 7.5), weight: dpResult ? dpResult.weight : null, isWarmup: false };
        })) };
      if (dpResult && dpResult.isEstimate) exoObj.coachNote = '💡 Charge estimée (1ère fois) — ajuste selon ta sensation.';
      exercises.push(exoObj);
    }
    placedExoNames.push(acc.name);
  });

  // Correction 3: Buffer 48h Squat → Deadlift
  var dayCoachNote = wpCoachNote(tpl.mainLift, phase, null, null);
  if (dayKey === 'squat') {
    var _imb = wpDetectSquatBenchImbalance();
    if (_imb && _imb.imbalance) {
      dayCoachNote = (dayCoachNote || '') + ' 📊 Déséquilibre Squat/Bench (' + _imb.recommendation + ') — +1 série sur les accessoires Quad.';
    }
  }
  if (dayKey === 'deadlift') {
    var fortyEightHAgo = Date.now() - 48 * 3600000;
    var axialWarning = false;
    var squatRpe48 = 0;
    var sortedRecent = (db.logs || []).slice().sort(function(a, b) { return (b.timestamp||0) - (a.timestamp||0); });
    for (var li = 0; li < Math.min(sortedRecent.length, 5); li++) {
      var rLog = sortedRecent[li];
      if (rLog.timestamp < fortyEightHAgo) break;
      var sqEx = (rLog.exercises || []).find(function(e) { return e.name && /squat/i.test(e.name) && !/pause/i.test(e.name); });
      if (sqEx) {
        var sqWS48 = (sqEx.allSets || sqEx.series || []).filter(function(s) { return !(s.isWarmup === true || s.setType === 'warmup'); });
        if (sqWS48.length) { squatRpe48 = parseFloat(sqWS48[sqWS48.length - 1].rpe) || 8; axialWarning = true; }
        break;
      }
    }

    if (axialWarning && squatRpe48 > 9) {
      // RPE > 9 dans les 48h → remplacer Deadlift par Back Extension lestée
      exercises = exercises.filter(function(e) { return !/soulevé|deadlift/i.test(e.name || ''); });
      exercises.unshift({
        name: 'Extension Dos (Hyperextension Lestée)', type: 'weight', restSeconds: 180, isPrimary: true,
        coachNote: '⚠️ Fatigue axiale (Squat RPE ' + squatRpe48 + ' il y a < 48h). Deadlift remplacé. Retour la semaine prochaine.',
        sets: wpBuildWarmups(60, 8, 'Extension Dos', 1, []).concat([
          { weight: 60, reps: 8, rpe: 7, isWarmup: false },
          { weight: 60, reps: 8, rpe: 7, isWarmup: false },
          { weight: 60, reps: 8, rpe: 7, isWarmup: false }
        ])
      });
      dayCoachNote = '🔴 Charge axiale remplacée — Squat RPE > 9 il y a moins de 48h.';
    } else if (axialWarning) {
      // RPE ≤ 9 : garder Deadlift mais réduire volume + cap RPE 7.5
      exercises.forEach(function(exo) {
        if (!/soulevé|deadlift/i.test(exo.name || '')) return;
        var workArr = (exo.sets || []).filter(function(s) { return !(s.isWarmup === true || s.setType === 'warmup'); });
        if (workArr.length > 1) {
          exo.sets = (exo.sets || []).filter(function(s, idx, arr) {
            if (s.isWarmup === true || s.setType === 'warmup') return true;
            return arr.slice(0, idx).filter(function(x) { return !(x.isWarmup === true || x.setType === 'warmup'); }).length < workArr.length - 1;
          });
        }
        exo.sets = (exo.sets || []).map(function(s) { return s.isWarmup ? s : Object.assign({}, s, { rpe: Math.min(s.rpe || 8, 7.5) }); });
        exo.coachNote = 'Volume réduit : Squat détecté il y a < 48h.';
      });
      dayCoachNote = (dayCoachNote || '') + ' ⚠️ Squat < 48h — volume Dead réduit, RPE cap 7.5.';
    }
  }

  if (useSupersets) exercises = wpApplySupersets(exercises);
  if ((params.cardio || '') === 'integre' && bodyPart !== 'recovery') {
    exercises.push(wpGetCardioForProfile(injuries, 17, isCutting));
  }
  var derivedTitle = wpDeriveTitle(exercises) || tpl.title;
  return { rest: false, title: derivedTitle, coachNote: dayCoachNote, exercises: exercises };
}

function wpGenerateMuscuDay(tplKey, params, phase) {
  var tpl = WP_PPL_TEMPLATES[tplKey];
  if (!tpl) return null;
  var injuries = params.injuries || [];
  var goals = params.goals || [];
  var duration = params.duration || 60;
  var mat = params.mat || 'salle';
  var gender = db.user.gender || 'male';
  var isCutting = goals.includes('seche');
  var isBulking = goals.includes('masse');

  if (isCutting && typeof computeFatigueScore === 'function') {
    if (computeFatigueScore(db.logs) > 75) { phase = 'deload'; showToast('⚠️ Sèche + fatigue élevée → Deload forcé'); }
  }

  var useSupersets = duration <= 60 || isCutting;
  var maxExos = duration <= 45 ? 5 : duration <= 60 ? 7 : 9;
  var repRange = isCutting ? [12, 20] : isBulking ? [6, 10] : [8, 12];
  var rpeTarget = isCutting ? 8 : 7.5;
  var setsCount = phase === 'deload' ? 2 : (isCutting ? 3 : 4);
  if (isCutting) setsCount = Math.max(2, Math.floor(setsCount * 0.7));

  var MAT_SUBS = { 'halteres': {
    'Squat': 'Goblet Squat haltère', 'Développé couché': 'Développé haltères',
    'Rowing barre': 'Rowing haltères', 'Curl barre': 'Curl haltères',
    'Développé militaire': 'Développé militaire haltères',
    'Tirage poitrine poulie': null, 'Tractions': 'Tractions', 'Presse à cuisses': null
  }};

  var exoNames = wpFilterInjuries(tpl.exercises, injuries);
  if (mat !== 'salle') {
    var subs = MAT_SUBS[mat] || {};
    exoNames = exoNames.map(function(n) { return subs.hasOwnProperty(n) ? subs[n] : n; }).filter(Boolean);
  }
  if (gender === 'female' && /legs|lower/i.test(tplKey)) {
    ['Hip Thrust','Adduction','Glute Kickback'].forEach(function(e) { if (exoNames.indexOf(e) === -1) exoNames.push(e); });
  }
  exoNames = exoNames.slice(0, maxExos);

  // Correction 4: Volume cap selon durée
  var sessionDuration = params.duration || 60;
  var maxTotalSets = sessionDuration <= 45 ? 18 : sessionDuration <= 60 ? 24 : sessionDuration <= 90 ? 32 : 40;
  var totalSetsUsed = 0;

  // Correction 5: Grip neutre pour blessures poignets
  var mustUseNeutralGrip = (injuries || []).includes('poignets');

  var exercises = exoNames.map(function(name) {
    if (totalSetsUsed >= maxTotalSets) return null;

    // Correction 5: substitutions grip neutre
    if (mustUseNeutralGrip) {
      if (/curl biceps|curl barre/i.test(name)) name = 'Curl marteau';
    }

    // Rotation plateau isolation
    var _plat = wpDetectIsolationPlateau(name);
    if (_plat && _plat.plateauWeeks >= 3) {
      var _vi = WP_ISOLATION_VARIANTS[name];
      if (_vi) name = _vi.variant;
    }
    var isCompound = /squat|développé|rowing|tractions|deadlift|soulevé|presse/i.test(name);
    var rpe = isCompound ? (rpeTarget + 0.5) : rpeTarget;
    var reps = isCompound ? repRange[0] : repRange[1];
    var rest = isCompound ? 150 : 90;
    if (isCutting) rest += 30;
    var thisSets = Math.min(setsCount, maxTotalSets - totalSetsUsed);
    totalSetsUsed += thisSets;
    var dpResult = wpDoubleProgressionWeight(name, repRange[0], repRange[1]);
    var exoObj = {
      name: name, type: 'weight', restSeconds: phase === 'deload' ? Math.ceil(rest / 2) : rest,
      sets: Array.from({ length: thisSets }, function() {
        return { reps: dpResult ? dpResult.reps : reps, rpe: phase === 'deload' ? 6 : rpe, weight: dpResult ? dpResult.weight : null, isWarmup: false };
      })
    };
    if (mustUseNeutralGrip && /arnold/i.test(name)) {
      exoObj.gripNote = 'Prise neutre impérative — paumes face à face, zéro rotation.';
    }
    if (mustUseNeutralGrip && /curl marteau/i.test(name)) {
      exoObj.gripNote = 'Prise marteau — position anatomique pour poignets sensibles.';
    }
    return exoObj;
  }).filter(Boolean);

  if (useSupersets) exercises = wpApplySupersets(exercises);
  var note = isCutting ? 'Sèche — RPE 8, repos courts, supersets sur l\'isolation.' :
             isBulking  ? 'Masse — RPE 7-8, charges lourdes, manger suffisamment.' : 'Recompo — progression régulière, RPE 8.';
  return { rest: false, title: tpl.title, coachNote: note, exercises: exercises };
}

// ── DÉTECTION PLATEAU ISOLATION ─────────────────────────────
function wpDetectIsolationPlateau(exoName) {
  var logs = (db.logs || []).slice().sort(function(a, b) { return (b.timestamp||0) - (a.timestamp||0); });
  var realName = wpFindBestMatch(exoName, logs);
  if (!realName) return null;
  var hist = [];
  for (var i = 0; i < logs.length && hist.length < 6; i++) {
    var exo = (logs[i].exercises || []).find(function(e) {
      return wpNormalizeName(e.name) === wpNormalizeName(realName);
    });
    if (!exo) continue;
    var ws = (exo.allSets || exo.series || []).filter(function(s) {
      return !(s.isWarmup === true || s.setType === 'warmup') && parseFloat(s.weight) > 0;
    });
    if (!ws.length) continue;
    var ls = ws[ws.length - 1];
    hist.push({ weight: parseFloat(ls.weight), reps: parseInt(ls.reps), rpe: parseFloat(ls.rpe) || 8 });
  }
  if (hist.length < 3) return null;
  var stagnant = hist[0].weight === hist[1].weight && hist[1].weight === hist[2].weight;
  if (!stagnant) return null;
  var weeks = 1;
  for (var j = 3; j < hist.length; j++) {
    if (hist[j].weight === hist[0].weight) weeks++; else break;
  }
  return { plateauWeeks: weeks, currentWeight: hist[0].weight };
}

// Table de rotation des variantes isolation (Gemini)
var WP_ISOLATION_VARIANTS = {
  'Leg Curl allongé':     { repRange: [15, 20], variant: 'Leg Curl Assis' },
  'Leg Curl Assis':       { repRange: [8,  12], variant: 'Leg Curl allongé' },
  'Élévations latérales': { repRange: [15, 20], variant: 'Elevation Laterale (Poulie)' },
  'Extension triceps':    { repRange: [15, 20], variant: 'Extension Triceps Corde' },
  'Curl barre':           { repRange: [15, 20], variant: 'Curl marteau' },
  'Écarté machine':       { repRange: [15, 20], variant: 'Ecartes Poulie Basse' }
};

// ── DÉTECTION DÉSÉQUILIBRE SQUAT/BENCH ──────────────────────
function wpDetectSquatBenchImbalance() {
  var pr = db.bestPR || {};
  var benchE1rm = parseFloat(pr.bench) || 0;
  var squatE1rm = parseFloat(pr.squat) || 0;
  if (benchE1rm <= 0 || squatE1rm <= 0) return null;
  var ratio = squatE1rm / benchE1rm;
  if (ratio < 1.20) {
    return {
      imbalance: true,
      ratio: Math.round(ratio * 100) / 100,
      deficit: Math.round((1.20 - ratio) * benchE1rm),
      recommendation: 'Squat ' + Math.round(ratio * 100) + '% du Bench (cible: 120-125%)'
    };
  }
  return { imbalance: false, ratio: ratio };
}

// ── FONCTION PRINCIPALE ──────────────────────────────────────
function generateWeeklyPlan() {
  var btn = document.getElementById('wpGenerateBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Calcul en cours…'; }

  try {
    var params      = db.user.programParams || {};
    var mode        = db.user.trainingMode || 'powerbuilding';
    var routine     = getRoutine();
    var injuries    = params.injuries || [];
    var freq        = params.freq || 4;
    var phase       = wpDetectPhase();
    var allDays     = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
    var selectedDays = params.selectedDays || allDays.slice(0, freq);

    // Addendum B + Correction 7: Détection niveau réel
    var logsCount = (db.logs || []).length;
    rpeCapReprise = null;

    // Correction 7: Avancé en reprise (Jordan) — poids > 1.2× PC sur Squat/Deadlift
    var isAdvancedReprise = false;
    if (logsCount < 24) {
      var bwCheck = parseFloat(db.user && db.user.bw) || 80;
      var threshold = bwCheck * 1.2;
      var recentLogsCheck = (db.logs || []).slice(-10);
      recentLogsCheck.forEach(function(log) {
        (log.exercises || []).forEach(function(exo) {
          if (!/squat|deadlift|souleve/i.test(exo.name || '')) return;
          var wSets = (exo.allSets || exo.series || []).filter(function(s) {
            var isWarm = s.isWarmup === true || s.setType === 'warmup';
            return !isWarm && parseFloat(s.weight) > 0;
          });
          if (wSets.some(function(s) { return parseFloat(s.weight) > threshold; })) isAdvancedReprise = true;
        });
      });
    }
    if (isAdvancedReprise) rpeCapReprise = 8;

    isBeginnerMode = logsCount < 24 && !isAdvancedReprise;
    if (isBeginnerMode) {
      var recentLogs = (db.logs || []).slice(-6);
      var highRpeCount = 0;
      recentLogs.forEach(function(log) {
        (log.exercises || []).forEach(function(exo) {
          var ws = (exo.allSets || exo.series || []).filter(function(s) { return !(s.isWarmup === true || s.setType === 'warmup'); });
          if (ws.length && parseFloat(ws[ws.length - 1].rpe) >= 9.5) highRpeCount++;
        });
      });
      if (highRpeCount >= 2) { isBeginnerMode = false; showToast('📈 Niveau intermédiaire atteint — progression APRE activée'); }
    }

    var days = [];

    // ── POWERBUILDING / POWERLIFTING ─────────────────────────
    if (mode === 'powerbuilding' || mode === 'powerlifting') {
      days = allDays.map(function(day) {
        var isTraining = selectedDays.indexOf(day) >= 0;
        var label = routine[day] || '';
        if (!isTraining || !label || /repos/i.test(label)) return { day: day, rest: true, title: '😴 Repos Complet', exercises: [] };
        var dayKey = 'bench';
        if (/squat|jambe|quad|leg/i.test(label)) dayKey = 'squat';
        else if (/dead|soulevé|pull|dos/i.test(label)) dayKey = 'deadlift';
        else if (/récup|cardio|natation/i.test(label)) dayKey = 'recovery';
        else if (/point|faible|technique.*sbd|sbd.*tech/i.test(label)) {
          dayKey = allDays.indexOf(day) % 2 === 0 ? 'weakpoints' : 'technique';
        }
        var dayData = wpGeneratePowerbuildingDay(dayKey, routine, phase, params);
        if (!dayData) return { day: day, rest: false, title: label, coachNote: '', exercises: [] };
        return Object.assign({ day: day }, dayData, { title: label || dayData.title });
      });

    // ── MUSCULATION ──────────────────────────────────────────
    } else if (mode === 'musculation' || mode === 'bodybuilding') {
      var splitMap;
      if (freq >= 6) {
        splitMap = { 'Lundi':'push_a','Mardi':'pull_a','Mercredi':'legs_a','Jeudi':'push_b','Vendredi':'pull_b','Samedi':'legs_b','Dimanche':null };
      } else if (freq >= 4) {
        splitMap = { 'Lundi':'upper_a','Mardi':'lower_a','Mercredi':null,'Jeudi':'upper_b','Vendredi':'lower_b','Samedi':null,'Dimanche':null };
      } else {
        splitMap = { 'Lundi':'full_a','Mercredi':'full_b','Vendredi':'full_c','Mardi':null,'Jeudi':null,'Samedi':null,'Dimanche':null };
      }
      var tplKeys = Object.values(splitMap).filter(Boolean);
      var tplIdx = 0;
      days = allDays.map(function(day) {
        if (selectedDays.indexOf(day) < 0) return { day: day, rest: true, title: '😴 Repos Complet', exercises: [] };
        var tplKey = tplKeys[tplIdx % tplKeys.length];
        tplIdx++;
        var dayData = wpGenerateMuscuDay(tplKey, params, phase);
        if (!dayData) return { day: day, rest: true, title: '😴 Repos Complet', exercises: [] };
        return Object.assign({ day: day }, dayData);
      });

    // ── BIEN-ÊTRE ────────────────────────────────────────────
    } else {
      var beActivities = [
        { name: 'Marche rapide', type: 'cardio', duration: 30 },
        { name: 'Yoga & Mobilité', type: 'time', duration: 45 },
        { name: 'Natation', type: 'cardio', duration: 40 },
        { name: 'Renfo léger', type: 'weight', reps: 15, rpe: 5 },
        { name: 'Vélo doux', type: 'cardio', duration: 35 }
      ];
      var beIdx = 0;
      days = allDays.map(function(day) {
        if (selectedDays.indexOf(day) < 0) return { day: day, rest: true, title: '😴 Repos', exercises: [] };
        var act = beActivities[beIdx % beActivities.length]; beIdx++;
        var exo = { name: act.name, type: act.type, restSeconds: 0,
          sets: [act.type === 'weight' ? { reps: act.reps || 15, rpe: act.rpe || 5, isWarmup: false } : { durationMin: act.duration, isWarmup: false }] };
        return { day: day, rest: false, title: '🌿 ' + act.name, coachNote: 'Régularité > intensité. L\'objectif c\'est d\'y aller.', exercises: [exo] };
      });
    }

    // ── DELOAD GLOBAL ────────────────────────────────────────
    if (phase === 'deload') {
      days.forEach(function(d) {
        if (d.rest) return;
        d.isDeload = true;
        if (!d.title.includes('Deload')) d.title = '🔄 ' + d.title;
        d.exercises.forEach(function(exo) {
          exo.sets = (exo.sets || []).map(function(s) {
            var ns = Object.assign({}, s);
            if (ns.weight) ns.weight = wpRound25(ns.weight * 0.80);
            if (ns.rpe) ns.rpe = Math.min(ns.rpe, 6);
            return ns;
          }).filter(function(s, i, arr) {
            if (s.isWarmup) return true;
            return arr.slice(0, i).filter(function(x) { return !x.isWarmup; }).length < 3;
          });
        });
      });
    }

    // ── SAUVEGARDER ─────────────────────────────────────────
    var plan = {
      days: days, week: (db.weeklyPlanHistory || []).length + 1, weekStreak: (typeof computeWeekStreak === 'function' ? computeWeekStreak().current : 0),
      phase: phase, mode: mode, isDeload: phase === 'deload', generated_at: new Date().toISOString()
    };

    // Addendum D: Séances manquées
    var missed = wpCountMissedSessions();
    if (missed > 0) { plan = wpAdjustForMissedSessions(plan, missed); if (plan.missedNote) showToast('📋 ' + plan.missedNote); }

    if (!db.weeklyPlanHistory) db.weeklyPlanHistory = [];
    db.weeklyPlanHistory.push({ generated_at: plan.generated_at, isDeload: plan.isDeload });
    if (db.weeklyPlanHistory.length > 12) db.weeklyPlanHistory.shift();

    db.weeklyPlan = plan;
    if (!db.routine) db.routine = {};
    days.forEach(function(d) { db.routine[d.day] = d.rest ? '😴 Repos Complet' : d.title; });

    saveDB();
    if (typeof syncToCloud === 'function') syncToCloud();
    showToast(phase === 'deload' ? '🔄 Semaine deload — récupération !' : '✅ Programme calculé !');
    renderWeeklyPlanUI();
    if (typeof renderProgramBuilderView === 'function') {
      renderProgramBuilderView(document.getElementById('programBuilderContent'));
    }

  } catch(err) {
    console.error('generateWeeklyPlan v3 error:', err);
    showToast('Erreur : ' + (err.message || String(err)));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '✦ Générer le programme de la semaine'; }
  }
}


function regenerateWeeklyPlan() {
  showModal('Régénérer le programme ?', 'Régénérer', 'var(--blue)', () => {
    db.weeklyPlan = null; saveDB(); renderWeeklyPlanUI(); generateWeeklyPlan();
  });
}

function wpSelectDay(day) { wpSelectedDay = day; renderWeeklyPlanUI(); }

let wpBodyOpen = true;
function toggleWpBody() {
  wpBodyOpen = !wpBodyOpen;
  const body = document.getElementById('wpBody');
  const chev = document.getElementById('wpChevron');
  if (body) body.style.display = wpBodyOpen ? '' : 'none';
  if (chev) chev.style.transform = wpBodyOpen ? '' : 'rotate(-90deg)';
}

function renderWeeklyPlanUI() {
  const plan = db.weeklyPlan;
  const genBtn = document.getElementById('wpGenerateBtn');
  const regenBtn = document.getElementById('wpRegenBtn');
  const meta = document.getElementById('wpMeta');
  const content = document.getElementById('wpContent');
  const select = document.getElementById('wpBlocSelect');
  if (!genBtn || !content) return; // Elements not in DOM yet
  if (!plan) {
    genBtn.style.display = 'flex'; if (regenBtn) regenBtn.style.display = 'none'; if (meta) meta.textContent = '';
    content.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--sub);font-size:13px;">Aucun programme généré.<br>Appuie sur le bouton pour créer ta semaine 🦍</div>';
    return;
  }
  genBtn.style.display = 'none'; regenBtn.style.display = 'block';
  if (select) select.value = String(plan.week || 1);
  // Masquer le sélecteur de bloc pour les débutants (progression linéaire)
  const blocControls = document.querySelector('.wp-bloc-controls');
  if (blocControls) blocControls.style.display = (db.user.level === 'debutant') ? 'none' : 'flex';
  const genDate = plan.generated_at ? new Date(plan.generated_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}) : '';
  meta.textContent = genDate ? 'Généré le ' + genDate : '';
  const todayName = DAYS_FULL[new Date().getDay()];
  const orderedDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const pillsHtml = orderedDays.map(day => {
    const dayData = plan.days ? plan.days.find(d => d.day === day) : null;
    const isRest = !dayData || dayData.rest;
    const isToday = day === todayName;
    const isActive = day === wpSelectedDay;
    let cls = 'wp-day-pill';
    if (isRest) cls += ' rest'; else if (isToday) cls += ' today';
    if (isActive) cls += ' active';
    const onclick = isRest ? '' : `onclick="wpSelectDay('${day}')"`;
    return `<div class="${cls}" ${onclick}>${day.substring(0,3)}</div>`;
  }).join('');
  const sel = plan.days ? plan.days.find(d => d.day === wpSelectedDay) : null;
  let sessionHtml = '';
  if (!sel || sel.rest) {
    sessionHtml = `<div class="wp-rest-day">😴 ${wpSelectedDay === 'Dimanche' ? 'Repos complet' : 'Repos / Récupération'}</div>`;
  } else {
    // Durée estimée du jour
    const dayDuration = estimateSessionDuration(sel.exercises || []);
    const durationHtml = dayDuration > 0
      ? `<div style="font-size:11px;color:var(--sub);margin-top:6px;">⏱️ ~${dayDuration}min estimé</div>`
      : '';
    const applyDayBtn = `<button onclick="wpApplyDay('${wpSelectedDay}')" style="margin-top:10px;padding:6px 14px;background:var(--green);border:none;color:#000;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">Appliquer ce jour au programme</button>`;
    const rdBanner = (wpSelectedDay === DAYS_FULL[new Date().getDay()]) ? getReadinessBannerHtml() : '';
    const displayTitle = (db.planDayTitles && db.planDayTitles[wpSelectedDay]) || sel.title || wpSelectedDay;
    const renameBtn = `<button onclick="wpRenameDay('${wpSelectedDay}')" style="background:none;border:none;color:var(--sub);cursor:pointer;font-size:13px;padding:2px 6px;opacity:0.6;" title="Renommer">✏️</button>`;
    sessionHtml = `<div class="wp-session"><div class="wp-session-title" style="display:flex;align-items:center;gap:6px;">${displayTitle}${renameBtn}</div>${durationHtml}${rdBanner}${sel.coachNote?`<div class="wp-coach-note">🦍 ${sel.coachNote}</div>`:''}<div style="margin-top:14px;">${(sel.exercises||[]).map(renderWpExercise).join('')}</div>${applyDayBtn}</div>`;
  }
  // Bloc badge avec label (intermédiaire+)
  var streak = typeof wpGetStreak === 'function' ? wpGetStreak() : 0;
  var streakLabel = streak > 1 ? streak + ' semaines 🔥' : streak === 1 ? '1 semaine 🔥' : 'Semaine ' + (plan.week || 1);
  var blocLabel = plan.blocLabel ? ' — ' + plan.blocLabel : '';
  var blocBadge = '<div class="wp-bloc-badge">' + streakLabel + blocLabel + '</div>';
  const applyAllBtn = `<button onclick="wpApplyAll()" style="display:block;width:100%;margin:12px 0 4px;padding:10px;background:var(--blue);border:none;color:white;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">Appliquer toutes les suggestions au programme</button>`;
  content.innerHTML = `${blocBadge}${applyAllBtn}<div class="wp-days">${pillsHtml}</div>${sessionHtml}`;
}

function wpApplyDay(day) {
  const plan = db.weeklyPlan;
  if (!plan || !plan.days) return;
  const dayData = plan.days.find(d => d.day === day && !d.rest);
  if (!dayData || !dayData.exercises || !dayData.exercises.length) return;
  if (!db.routineExos) db.routineExos = {};
  db.routineExos[day] = dayData.exercises;
  saveDB();
  showToast('✓ Programme du ' + day + ' mis à jour');
}

function wpApplyAll() {
  const plan = db.weeklyPlan;
  if (!plan || !plan.days) return;
  showModal('Appliquer tout ?', 'Appliquer', 'var(--blue)', () => {
    if (!db.routineExos) db.routineExos = {};
    plan.days.forEach(d => {
      if (d.rest || !d.exercises || !d.exercises.length) return;
      db.routineExos[d.day] = d.exercises;
    });
    saveDB();
    showToast('✓ Programme complet mis à jour');
    refreshUI();
  });
}

function wpRenameDay(day) {
  var current = (db.planDayTitles && db.planDayTitles[day]) || '';
  var val = prompt('Nom de la séance du ' + day + ' :', current);
  if (val === null) return; // annulé
  if (!db.planDayTitles) db.planDayTitles = {};
  if (val.trim()) {
    db.planDayTitles[day] = val.trim();
  } else {
    delete db.planDayTitles[day]; // reset au titre généré
  }
  saveDB();
  renderWeeklyPlanUI();
}

function fmtRest(sec) {
  if (!sec) return '';
  const m = Math.floor(sec/60), s = sec%60;
  return m + 'min' + (s ? ' ' + s + 's' : '');
}

function renderWpExercise(exo) {
  const type = exo.type || 'weight';
  const sets = exo.sets || [];
  const restHtml = exo.restSeconds ? '<div class="wpe-rest">⏸ Repos : ' + fmtRest(exo.restSeconds) + '</div>' : '';

  // Muscle icon
  const ms = _ecMuscleStyle(exo.name);

  // Type tag
  const exoType = getExoType(exo.name);
  let typeTag = 'Isolation';
  if (exoType === 'cardio' || exoType === 'cardio_stairs') typeTag = 'Cardio';
  else if (exoType === 'time') typeTag = 'Isométrique';
  else {
    const n = exo.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if (/squat|deadlift|souleve|bench\s*(press|barre|couche)?|developpe\s*couche/.test(n)) typeTag = 'Composé';
    else if (/overhead|militaire|\bohp\b|rowing\b|tirage|row\b|traction|pull.?up|chin.?up|\bdips?\b|rdl|roumain|hip\s*thrust|leg\s*press|presse|fentes?|\blunge|good\s*morning|inclin[eé]|d[eé]clin[eé]/.test(n)) typeTag = 'Composé';
  }

  // Summary — work sets only (exclude back-off)
  const wrkSetsOnly = sets.filter(s => !s.isWarmup && !s.isBackoff);
  const backoffSetsAll = sets.filter(s => s.isBackoff);
  let summary = '';
  if (wrkSetsOnly.length > 0 && type !== 'cardio' && type !== 'cardio_stairs' && !exo.noData) {
    const s0 = wrkSetsOnly[0];
    if (type === 'time') {
      const sec = s0.durationSec || 0;
      summary = wrkSetsOnly.length + '×' + (sec >= 60 ? Math.floor(sec/60) + 'min' + (sec%60 ? sec%60+'s' : '') : sec + 's');
    } else if (type === 'reps' && s0.weight > 0) {
      summary = wrkSetsOnly.length + '×' + s0.reps + ' @ ' + s0.weight + 'kg';
    } else if (type === 'reps') {
      summary = wrkSetsOnly.length + '×' + (s0.reps === 'max' ? 'max' : s0.reps);
    } else if (type === 'weight' && s0.weight > 0) {
      summary = wrkSetsOnly.length + '×' + s0.reps + ' @ ' + s0.weight + 'kg';
    }
    if (s0.rpe && type !== 'time') summary += ' · RPE ' + s0.rpe;
    if (backoffSetsAll.length) summary += ' + ' + backoffSetsAll.length + ' back-off';
  }

  // Sets content
  let setsHtml = '';

  if (exo.noData) {
    setsHtml = '<div class="wpe-nodata">⚠️ Pas encore de données — importe une séance Hevy pour cet exercice.</div>';

  } else if (exo.estimated) {
    // Charges estimées depuis le poids de corps
    const wup = sets.filter(s => s.isWarmup), wrk = sets.filter(s => !s.isWarmup);
    const hdr = '<div class="wpe-set-hdr"><span></span><span>Charge</span><span>Reps</span><span>RPE</span></div>';
    let rows = wup.map((s, i) => '<div class="wpe-set-row wpe-warmup"><span class="wpe-set-num">E' + (i+1) + '</span><span class="wpe-set-charge">' + s.weight + 'kg</span><span class="wpe-set-reps">' + s.reps + '</span><span>—</span></div>').join('');
    rows += wrk.map((s, i) => '<div class="wpe-set-row"><span class="wpe-set-num">S' + (i+1) + '</span><span class="wpe-set-charge">' + s.weight + 'kg</span><span class="wpe-set-reps">' + s.reps + '</span><span class="wpe-set-rpe">' + (s.rpe ? t('rpe', s.rpe) : '—') + '</span></div>').join('');
    setsHtml = '<div style="background:rgba(255,159,10,0.12);border-left:3px solid var(--orange);padding:6px 10px;margin:4px 12px 8px;border-radius:6px;font-size:11px;color:var(--orange);">📐 Charges estimées — à ajuster après ta première séance</div>' +
      '<div class="wpe-sets">' + hdr + rows + '</div>';

  } else if (type === 'time') {
    const wrkSets = sets.filter(s => !s.isWarmup);
    const sec = wrkSets[0]?.durationSec || 30;
    const durFmt = sec >= 60 ? Math.floor(sec/60) + 'min' + (sec%60 ? ' ' + sec%60 + 's' : '') : sec + 's';
    const hdr = '<div class="wpe-set-hdr"><span></span><span>Durée</span><span></span><span></span></div>';
    const rows = wrkSets.map((s, i) => '<div class="wpe-set-row"><span class="wpe-set-num">S' + (i+1) + '</span><span class="wpe-set-charge" style="color:var(--teal);">' + durFmt + '</span><span></span><span></span></div>').join('');
    setsHtml = '<div class="wpe-sets">' + hdr + rows + '</div>';

  } else if (type === 'reps') {
    const wrkSets = sets.filter(s => !s.isWarmup);
    const hasWeight = wrkSets.some(s => s.weight !== null && s.weight > 0);
    if (hasWeight) {
      const hdr = '<div class="wpe-set-hdr"><span></span><span>Lest</span><span>Reps</span><span>RPE</span></div>';
      const rows = wrkSets.map((s, i) => '<div class="wpe-set-row"><span class="wpe-set-num">S' + (i+1) + '</span><span class="wpe-set-charge">' + s.weight + 'kg</span><span class="wpe-set-reps">' + (s.reps === 'max' ? 'max' : s.reps) + '</span><span class="wpe-set-rpe">' + (s.rpe ? t('rpe', s.rpe) : '—') + '</span></div>').join('');
      setsHtml = '<div class="wpe-sets">' + hdr + rows + '</div>';
    } else {
      const target = wrkSets[0]?.reps ?? 'max';
      const repsLabel = target === 'max' ? 'max reps' : target + ' reps';
      setsHtml = '<div style="padding:8px 16px;font-size:13px;"><span style="color:var(--sub);">' + wrkSets.length + ' séries</span> <span style="font-weight:700;color:var(--text);"> × ' + repsLabel + '</span><span style="font-size:11px;color:var(--sub);margin-left:8px;">(poids de corps)</span></div>';
    }

  } else if (type === 'cardio' || type === 'cardio_stairs') {
    const hdr = '<div class="wpe-set-hdr"><span></span><span>Dist.</span><span>Durée</span><span></span></div>';
    const rows = sets.map((s, i) => '<div class="wpe-set-row"><span class="wpe-set-num">S' + (i+1) + '</span><span class="wpe-set-charge">' + (s.distance ? s.distance.toFixed(2) + 'km' : '—') + '</span><span class="wpe-set-reps">' + (s.durationMin ? s.durationMin + 'min' : '—') + '</span><span>—</span></div>').join('');
    setsHtml = '<div class="wpe-sets">' + hdr + rows + '</div>';

  } else {
    const wup = sets.filter(s => s.isWarmup);
    const wrk = sets.filter(s => !s.isWarmup && !s.isBackoff);
    const bo  = sets.filter(s => s.isBackoff);
    const hdr = '<div class="wpe-set-hdr"><span></span><span>Charge</span><span>Reps</span><span>RPE</span></div>';
    let rows = wup.map((s, i) => '<div class="wpe-set-row wpe-warmup"><span class="wpe-set-num">E' + (i+1) + '</span><span class="wpe-set-charge">' + (s.weight > 0 ? s.weight + 'kg' : '—') + '</span><span class="wpe-set-reps">' + s.reps + '</span><span>—</span></div>').join('');
    rows += wrk.map((s, i) => '<div class="wpe-set-row"><span class="wpe-set-num">S' + (i+1) + '</span><span class="wpe-set-charge">' + (s.weight > 0 ? s.weight + 'kg' : '—') + '</span><span class="wpe-set-reps">' + s.reps + '</span><span class="wpe-set-rpe">' + (s.rpe ? 'RPE ' + s.rpe : '—') + '</span></div>').join('');
    // Back-off sets en teal
    rows += bo.map((s, i) => '<div class="wpe-set-row" style="opacity:0.8;"><span class="wpe-set-num" style="color:var(--teal);">BO' + (i+1) + '</span><span class="wpe-set-charge" style="color:var(--teal);">' + (s.weight > 0 ? s.weight + 'kg' : '—') + '</span><span class="wpe-set-reps">' + s.reps + '</span><span class="wpe-set-rpe" style="color:var(--teal);">' + (s.rpe ? 'RPE ' + s.rpe : '—') + '</span></div>').join('');
    setsHtml = '<div class="wpe-sets">' + hdr + rows + '</div>';
  }

  return '<div class="wpe">' +
    '<div class="wpe-head">' +
      '<div class="wpe-ico" style="background:' + ms.bg + ';">' + ms.icon + '</div>' +
      '<div class="wpe-info"><div class="wpe-name">' + exo.name + '</div>' +
      (summary ? '<div class="wpe-summary">' + summary + '</div>' : '') + '</div>' +
      '<span class="wpe-type-tag">' + typeTag + '</span>' +
    '</div>' +
    setsHtml + restHtml + '</div>';
}

// EXO_DATABASE is loaded from js/exercises.js
// GO TAB — État, timers, auto-save, wake lock
// ============================================================
// (activeWorkout, _goSession*, _goWakeLock moved to top of file to avoid TDZ)
let _goSessionPausedAt = 0;
let _goSearchDebounce = null;
let _goMusclesExpanded = false;

function goAutoSave() {
  if (activeWorkout) {
    try { localStorage.setItem('SBD_ACTIVE_WORKOUT', JSON.stringify(activeWorkout)); } catch(e) {}
  }
}
function goStartAutoSave() { goStopAutoSave(); _goAutoSaveId = setInterval(goAutoSave, 30000); }
function goStopAutoSave() { if (_goAutoSaveId) { clearInterval(_goAutoSaveId); _goAutoSaveId = null; } }

function goRequestWakeLock() {
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function(l) { _goWakeLock = l; }).catch(function(){}); } catch(e) {}
}
function goReleaseWakeLock() {
  try { if (_goWakeLock) { _goWakeLock.release(); _goWakeLock = null; } } catch(e) {}
}

// ── Format helpers ──
function goFormatTime(sec) {
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function goFormatRestBadge(sec) {
  if (sec >= 60) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + 'min' + (s > 0 ? ' ' + s + 's' : '');
  }
  return sec + 's';
}

// ── Get tracking type for an exercise in workout ──
function goGetExoTrackingType(exo) {
  if (exo.exoId && EXO_DATABASE[exo.exoId]) return EXO_DATABASE[exo.exoId].trackingType;
  var t = getExoType(exo.name);
  if (t === 'cardio_stairs') return 'cardio';
  return t || 'weight';
}

// ── Get default rest seconds ──
function goGetDefaultRest(exoName, exoId) {
  if (exoId && EXO_DATABASE[exoId]) return EXO_DATABASE[exoId].defaultRest;
  var n = exoName.toLowerCase();
  if (/squat|bench|deadlift|souleve|developpe\s*couche/.test(n)) return 180;
  if (/rowing|ohp|militaire|hip\s*thrust|dips|leg\s*press/.test(n)) return 150;
  if (/tapis|velo|rameur|natation|corde|assault|stair|elliptique/.test(n)) return 300;
  return 90;
}

// ── Get previous sets for an exercise from db.logs ──
function goGetPreviousSets(exoName) {
  for (var i = db.logs.length - 1; i >= 0; i--) {
    var ses = db.logs[i];
    for (var j = 0; j < (ses.exercises || []).length; j++) {
      if (matchExoName(ses.exercises[j].name, exoName)) {
        return { series: ses.exercises[j].series || ses.exercises[j].allSets || [], date: ses.shortDate || ses.date || '' };
      }
    }
  }
  return null;
}

// ── Get last time summary for an exercise ──
function goGetLastTimeSummary(exoName) {
  var prev = goGetPreviousSets(exoName);
  if (!prev || !prev.series.length) return null;
  var s = prev.series;
  var w = s[0].weight || 0;
  var r = s[0].reps || 0;
  return { weight: w, reps: r, sets: s.length, date: prev.date };
}

// ============================================================
// GO TAB — Render principal
// ============================================================
function renderGoTab() {
  if (activeWorkout) {
    document.getElementById('goIdleView').style.display = 'none';
    document.getElementById('goActiveView').style.display = 'block';
    goRequestRender();
  } else {
    document.getElementById('goIdleView').style.display = 'block';
    document.getElementById('goActiveView').style.display = 'none';
    renderGoIdleView();
  }
}

// ── Idle View ──
function renderGoIdleView() {
  var el = document.getElementById('goIdleView');
  if (!el) return;
  el.innerHTML = buildGoIdleHtml();
}

function buildGoIdleHtml() {
  var today = DAYS_FULL[new Date().getDay()];
  var routine = getRoutine();
  var todayLabel = routine[today] || '';
  var isRestDay = !todayLabel || /repos/i.test(todayLabel);
  var hasDraft = !!localStorage.getItem('SBD_ACTIVE_WORKOUT');

  // Dernier debrief (séance la plus récente)
  var lastSession = db.logs && db.logs.length ? db.logs[db.logs.length-1] : null;
  var hasDebrief = lastSession && (Date.now() - lastSession.timestamp < 86400000*2);

  // Toggle Récap / Débrief
  var toggleHtml = '<div class="go-toggle">'+
    '<div class="go-toggle-btn active" id="go-t-recap" onclick="goSwitchView(\'recap\')">📋 Récap séance</div>'+
    '<div class="go-toggle-btn" id="go-t-debrief" onclick="goSwitchView(\'debrief\')">'+(hasDebrief?'✅ Débrief':'📊 Débrief')+'</div>'+
  '</div>';

  // Hero séance du jour
  var heroHtml = '';
  if (!isRestDay) {
    // Source : weeklyPlan.days prioritaire
    var wpDays = (db.weeklyPlan && db.weeklyPlan.days) ? db.weeklyPlan.days : [];
    var wpToday = wpDays.find(function(d) { return d.day === today && !d.rest; });
    var todayExercises = wpToday ? (wpToday.exercises || []) : [];

    // Fallback : routineExos (noms seulement)
    var todayExos = (db.routineExos && db.routineExos[today]) || [];

    var exosHtml = '';
    if (todayExercises.length > 0) {
      exosHtml = todayExercises.map(function(e) {
        if (!e || !e.name) return '';
        var workSets = (e.sets || []).filter(function(s) { return !s.isWarmup; });
        var firstWork = workSets[0];
        var loadStr = '';
        if (firstWork) {
          if (e.type === 'cardio') loadStr = (firstWork.durationMin || '?') + 'min';
          else if (e.type === 'time') loadStr = Math.round((firstWork.durationSec || 0)/60) + 'min';
          else if (firstWork.weight) loadStr = workSets.length + '×' + firstWork.reps + ' @ ' + firstWork.weight + 'kg';
          else loadStr = workSets.length + '×' + firstWork.reps;
        }
        return '<div class="go-plan-exo">' +
          '<div class="go-plan-exo-ico">🏋️</div>' +
          '<span class="go-plan-exo-name">' + e.name + '</span>' +
          '<span class="go-plan-exo-load">' + loadStr + '</span>' +
        '</div>';
      }).join('');
    } else if (todayExos.length > 0) {
      exosHtml = todayExos.map(function(name) {
        return '<div class="go-plan-exo">' +
          '<div class="go-plan-exo-ico">🏋️</div>' +
          '<span class="go-plan-exo-name">' + (typeof name==='string'?name:(name&&name.name)||'Exercice') + '</span>' +
        '</div>';
      }).join('');
    }

    var exoCount = todayExercises.length || todayExos.length;
    var coachNote = wpToday && wpToday.coachNote ? wpToday.coachNote : '';

    heroHtml = '<div class="go-hero">'+
      '<div class="go-hero-top">'+
        '<span class="go-badge">Aujourd\'hui</span>'+
        '<span class="go-hero-date">'+today+'</span>'+
      '</div>'+
      '<div class="go-hero-title">'+todayLabel+'</div>'+
      '<div class="go-hero-sub">' + exoCount + ' exercices prévus' +
        (coachNote ? '<br><span style="color:var(--orange);font-size:10px;">💡 ' + coachNote + '</span>' : '') +
      '</div>' +
      (exosHtml ?
        '<div class="go-plan-toggle" onclick="goTogglePlan()">' +
          '<span class="go-plan-lbl">Voir le plan détaillé</span>' +
          '<span class="go-plan-chev" id="go-plan-chev">▾</span>' +
        '</div>' +
        '<div class="go-plan-body" id="go-plan-body">' + exosHtml + '</div>'
      : '') +
      '<button class="go-launch" onclick="openReadinessQuiz(\'today\')">Lancer la séance du jour 💪</button>'+
    '</div>';
  } else {
    heroHtml = '<div class="go-hero" style="text-align:center;">'+
      '<div style="font-size:36px;margin-bottom:8px;">😴</div>'+
      '<div class="go-hero-title">Jour de repos</div>'+
      '<div class="go-hero-sub">Récupération — profite bien !</div>'+
    '</div>';
  }

  // Débrief de la dernière séance
  var debriefHtml = '';
  if (lastSession) {
    var vol = lastSession.volume||0;
    var volStr = vol>=1000?(vol/1000).toFixed(1)+'t':vol+'kg';
    var dur = lastSession.duration ? Math.round(lastSession.duration/60)+'min' : '—';
    var exoCount = (lastSession.exercises||[]).length;
    debriefHtml = '<div class="go-debrief" id="go-debrief-section" style="display:none;">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'+
        '<span class="go-badge" style="background:var(--green);">Dernière séance</span>'+
        '<span style="font-size:10px;color:rgba(255,255,255,.4);">'+((lastSession.title||'Séance'))+'</span>'+
      '</div>'+
      '<div class="go-debrief-grid">'+
        '<div class="go-debrief-item"><div class="go-debrief-val" style="color:var(--accent);">'+exoCount+'</div><div class="go-debrief-lbl">Exercices</div></div>'+
        '<div class="go-debrief-item"><div class="go-debrief-val" style="color:var(--purple);">'+volStr+'</div><div class="go-debrief-lbl">Volume</div></div>'+
        '<div class="go-debrief-item"><div class="go-debrief-val" style="color:var(--orange);">'+dur+'</div><div class="go-debrief-lbl">Durée</div></div>'+
      '</div>'+
    '</div>';
  }

  // Options alternatives
  var altsHtml = '<div class="go-or">— ou —</div>'+
    '<div class="go-alts">'+
      '<div class="go-alt" onclick="goStartWorkout(false)">'+
        '<div class="go-alt-ico">📋</div>'+
        '<div class="go-alt-title">Séance vide</div>'+
        '<div class="go-alt-sub">Choisis tes exercices librement</div>'+
      '</div>'+
      '<div class="go-alt" onclick="goStartGroupClass()">'+
        '<div class="go-alt-ico">🎵</div>'+
        '<div class="go-alt-title">Cours collectif</div>'+
        '<div class="go-alt-sub">Yoga, CrossFit, HIIT…</div>'+
      '</div>'+
    '</div>';

  var draftHtml = hasDraft ? '<button class="go-btn-sec" style="margin-top:10px;" onclick="goRestoreDraft()">📂 Reprendre brouillon</button>' : '';

  return toggleHtml + '<div id="go-recap-view">' + heroHtml + altsHtml + draftHtml + '</div>' + debriefHtml;
}

function goSwitchView(view) {
  var recap = document.getElementById('go-recap-view');
  var debrief = document.getElementById('go-debrief-section');
  var t1 = document.getElementById('go-t-recap');
  var t2 = document.getElementById('go-t-debrief');
  if (!recap) return;
  if (view==='recap') {
    recap.style.display=''; if(debrief)debrief.style.display='none';
    if(t1)t1.classList.add('active'); if(t2)t2.classList.remove('active');
  } else {
    recap.style.display='none'; if(debrief)debrief.style.display='';
    if(t2)t2.classList.add('active'); if(t1)t1.classList.remove('active');
  }
}

function goTogglePlan() {
  var body = document.getElementById('go-plan-body');
  var chev = document.getElementById('go-plan-chev');
  if (!body) return;
  body.classList.toggle('open');
  if (chev) chev.classList.toggle('open', body.classList.contains('open'));
}

// ── READINESS QUIZ ──
var _quizAnswers = {};
var _quizWorkoutType = 'today';

function openReadinessQuiz(workoutType) {
  _quizAnswers = {};
  _quizWorkoutType = workoutType || 'today';
  document.querySelectorAll('.quiz-step').forEach(function(s){ s.classList.remove('active'); });
  var first = document.getElementById('qs1');
  if (first) first.classList.add('active');
  [1,2,3].forEach(function(i){ var d=document.getElementById('qd'+i); if(d)d.classList.toggle('active',i===1); });
  document.querySelectorAll('.quiz-opt').forEach(function(o){ o.classList.remove('selected'); });
  document.querySelectorAll('.quiz-next').forEach(function(b){ b.classList.remove('ready'); });
  var ov = document.getElementById('quiz-overlay');
  if (ov) ov.classList.add('open');
}

function quizSelect(el, q, val) {
  var row = el.closest('.quiz-opts');
  row.querySelectorAll('.quiz-opt').forEach(function(o){ o.classList.remove('selected'); });
  el.classList.add('selected');
  _quizAnswers[q] = val;
  var qNum = q.replace('q','');
  var btn = document.getElementById('qn'+qNum);
  if (btn) btn.classList.add('ready');
}

function quizNext(n) {
  document.querySelectorAll('.quiz-step').forEach(function(s){ s.classList.remove('active'); });
  var step = document.getElementById('qs'+n);
  if (step) step.classList.add('active');
  [1,2,3].forEach(function(i){ var d=document.getElementById('qd'+i); if(d)d.classList.toggle('active',i<=n); });
}

function quizShowResult() {
  var score = Math.round(
    ((_quizAnswers.q1||3)/5)*35 +
    ((_quizAnswers.q2||3)/5)*35 +
    ((_quizAnswers.q3||3)/5)*30
  );
  document.querySelectorAll('.quiz-step').forEach(function(s){ s.classList.remove('active'); });
  var step = document.getElementById('qs4');
  if (step) step.classList.add('active');
  [1,2,3,4].forEach(function(i){ var d=document.getElementById('qd'+i); if(d)d.classList.toggle('active',i<=4); });

  var numEl = document.getElementById('quiz-score-num');
  var ringEl = document.getElementById('quiz-ring-fill');
  var titleEl = document.getElementById('quiz-result-title');
  var subEl = document.getElementById('quiz-result-sub');
  if (numEl) numEl.textContent = score;
  if (ringEl) {
    var color = score>=75?'var(--green)':score>=50?'var(--orange)':'var(--red)';
    ringEl.style.stroke = color;
    ringEl.style.strokeDashoffset = Math.round(201 - (score/100)*201);
    if (numEl) numEl.style.color = color;
  }
  if (score >= 75) {
    if(titleEl) titleEl.textContent = 'Prêt à y aller 💪';
    if(subEl) subEl.textContent = 'Bonne forme générale. Charge normale, séance complète.';
  } else if (score >= 50) {
    if(titleEl) titleEl.textContent = 'Forme correcte 🙂';
    if(subEl) subEl.textContent = 'Légèrement fatigué. Réduis les charges de 5% et écoute ton corps.';
  } else {
    if(titleEl) titleEl.textContent = 'Fatigue élevée 😴';
    if(subEl) subEl.textContent = 'Prends soin de toi. Séance légère ou repos — ça fait partie de la progression.';
  }
}

function quizLaunch() {
  var ov = document.getElementById('quiz-overlay');
  if (ov) ov.classList.remove('open');
  var name = (db.user && db.user.name) ? db.user.name : 'champion';
  var today = DAYS_FULL[new Date().getDay()];
  var routine = getRoutine();
  var todayLabel = routine[today] || 'la séance';
  var msgTitle = document.getElementById('go-msg-title');
  var msgBody = document.getElementById('go-msg-body');
  if (msgTitle) msgTitle.textContent = 'C\'est parti, ' + name + ' !';
  if (msgBody) msgBody.innerHTML = todayLabel + '<br>Concentre-toi, exécute proprement.';
  var msg = document.getElementById('go-msg-overlay');
  if (msg) msg.classList.add('open');
}

function goLaunchActual() {
  if (typeof _goDoStartWorkout === 'function') {
    _goDoStartWorkout(true);
  } else if (typeof goStartWorkout === 'function') {
    goStartWorkout(true);
  }
}

// ── Start Workout ──
function goStartWorkout(withProgram) {
  // Show readiness modal before starting (only if not already filled today)
  if (withProgram && !hasTodayReadiness()) {
    showReadinessModal(function() { _goDoStartWorkout(withProgram); });
    return;
  }
  _goDoStartWorkout(withProgram);
}

function _goDoStartWorkout(withProgram) {
  var todayDay = DAYS_FULL[new Date().getDay()];
  var routine = getRoutine();
  activeWorkout = {
    id: generateId(),
    title: withProgram ? (routine && routine[todayDay] ? routine[todayDay] : 'Séance') : 'Séance vide',
    startTime: Date.now(),
    exercises: [],
    restTimer: { running: false, remaining: 0, total: 0, exoIndex: -1 }
  };
  if (withProgram) {
    var dayExos = getProgExosForDay(todayDay);
    // Check if weeklyPlan has data for today
    var planDay = null;
    if (db.weeklyPlan && db.weeklyPlan.days) {
      planDay = db.weeklyPlan.days.find(function(d) { return d.day === todayDay && !d.rest; });
    }

    dayExos.forEach(function(exoRef) {
      var found = null;
      // Try to find in EXO_DATABASE by id or name match
      var keys = Object.keys(EXO_DATABASE);
      for (var i = 0; i < keys.length; i++) {
        var e = EXO_DATABASE[keys[i]];
        if (keys[i] === exoRef || matchExoName(e.name, exoRef)) { found = e; break; }
      }
      // Also check db.customExercises
      if (!found && db.customExercises) {
        for (var j = 0; j < db.customExercises.length; j++) {
          if (matchExoName(db.customExercises[j].name, exoRef)) { found = db.customExercises[j]; break; }
        }
      }
      var name = found ? found.name : exoRef;
      var exoId = found ? found.id : null;
      var initSets = [];
      var restSec = goGetDefaultRest(name, exoId);

      // Try to get sets from weeklyPlan first
      var planExo = null;
      if (planDay && planDay.exercises) {
        planExo = planDay.exercises.find(function(pe) { return matchExoName(pe.name, name); });
      }

      if (planExo && planExo.sets && planExo.sets.length) {
        // Pre-fill ALL sets from weeklyPlan
        planExo.sets.forEach(function(ps) {
          var setType = 'normal';
          if (ps.isWarmup) setType = 'warmup';
          else if (ps.isBackoff) setType = 'backoff';
          initSets.push({
            weight: ps.weight || 0,
            reps: ps.reps || 0,
            type: setType,
            completed: false,
            rpe: ps.rpe || null,
            duration: 0,
            distance: 0
          });
        });
        if (planExo.restSeconds) restSec = planExo.restSeconds;
      } else {
        // Fallback: pre-fill from history (all previous sets, not just one)
        var prevData = goGetPreviousSets(name);
        if (prevData && prevData.series && prevData.series.length > 0) {
          prevData.series.forEach(function(s) {
            var setType = (s.isWarmup || s.type === 'warmup') ? 'warmup' : ((s.isBackoff || s.type === 'backoff') ? 'backoff' : 'normal');
            initSets.push({
              weight: s.weight || 0,
              reps: s.reps || 0,
              type: setType,
              completed: false,
              rpe: s.rpe || null,
              duration: s.duration || 0,
              distance: s.distance || 0
            });
          });
        } else {
          // No history — single empty set
          initSets.push({ weight: 0, reps: 0, type: 'normal', completed: false, rpe: null, duration: 0, distance: 0 });
        }
      }

      activeWorkout.exercises.push({
        exoId: exoId,
        name: name,
        sets: initSets,
        restSeconds: restSec,
        notes: ''
      });
    });
  }
  _goSessionPaused = false;
  goStartAutoSave();
  goRequestWakeLock();
  goStartSessionTimer();
  goAutoSave();
  renderGoTab();

  // Social: set training status
  try { setTrainingStatus(true, activeWorkout.title); } catch(e) {}
}

// ── Restore Draft ──
function goRestoreDraft() {
  try {
    var data = JSON.parse(localStorage.getItem('SBD_ACTIVE_WORKOUT'));
    if (data) {
      activeWorkout = data;
      _goSessionPaused = false;
      goStartAutoSave();
      goRequestWakeLock();
      goStartSessionTimer();
      renderGoTab();
      showToast('Brouillon restauré');
    }
  } catch(e) { showToast('Erreur de restauration'); }
}

// ── Session Timer ──
function goStartSessionTimer() {
  goStopSessionTimer();
  _goSessionTimerId = setInterval(function() {
    if (!activeWorkout || _goSessionPaused) return;
    var el = document.getElementById('goTimerDisplay');
    if (el) {
      var elapsed = Math.floor((Date.now() - activeWorkout.startTime) / 1000);
      el.textContent = goFormatTime(elapsed);
    }
  }, 1000);
}
function goStopSessionTimer() { if (_goSessionTimerId) { clearInterval(_goSessionTimerId); _goSessionTimerId = null; } }
function goTogglePause() {
  if (_goSessionPaused) {
    // Resume: adjust startTime to account for pause duration
    activeWorkout.startTime += (Date.now() - _goSessionPausedAt);
    _goSessionPaused = false;
    showToast('Séance reprise');
  } else {
    _goSessionPausedAt = Date.now();
    _goSessionPaused = true;
    showToast('Séance en pause');
  }
  goRequestRender();
}

// ============================================================
// ── Cours Collectif ──
var _GROUP_ICONS = {Yoga:'🧘',Pilates:'🤸',Natation:'🏊',Cycling:'🚴',Boxing:'🥊',Running:'🏃',Danse:'💃'};

function goStartGroupClass() {
  goShowBottomSheet('Type de cours', [
    { icon:'🧘', label:'Yoga', action: function() { _goCreateGroupSession('Yoga'); } },
    { icon:'🤸', label:'Pilates', action: function() { _goCreateGroupSession('Pilates'); } },
    { icon:'🏊', label:'Natation', action: function() { _goCreateGroupSession('Natation'); } },
    { icon:'🚴', label:'Cycling', action: function() { _goCreateGroupSession('Cycling'); } },
    { icon:'🥊', label:'Boxing / Combat', action: function() { _goCreateGroupSession('Boxing'); } },
    { icon:'🏃', label:'Running club', action: function() { _goCreateGroupSession('Running'); } },
    { icon:'💃', label:'Danse', action: function() { _goCreateGroupSession('Danse'); } },
    { icon:'📝', label:'Autre (personnalisé)', action: function() {
      var name = prompt('Nom du cours :');
      if (name) _goCreateGroupSession(name);
    }}
  ]);
}

function _goCreateGroupSession(type) {
  activeWorkout = {
    id: generateId(),
    title: type,
    startTime: Date.now(),
    isGroupClass: true,
    groupType: type,
    exercises: [{
      exoId: null,
      name: type,
      sets: [{ weight: 0, reps: 0, type: 'normal', completed: false, duration: 0, distance: 0 }],
      restSeconds: 0,
      notes: ''
    }],
    restTimer: { running: false, remaining: 0, total: 0, exoIndex: -1 }
  };
  _goSessionPaused = false;
  goStartAutoSave();
  goRequestWakeLock();
  goStartSessionTimer();
  goAutoSave();
  renderGoTab();

  // Social: set training status
  try { setTrainingStatus(true, activeWorkout.title); } catch(e) {}
}

// GO TAB — Active View Rendering
// ============================================================
var _goRenderPending = false;
function goRequestRender() {
  if (_goRenderPending) return;
  _goRenderPending = true;
  requestAnimationFrame(function() {
    _goRenderPending = false;
    renderGoActiveView();
  });
}

function renderGoActiveView() {
  if (!activeWorkout) return;
  var elapsed = Math.floor((Date.now() - activeWorkout.startTime) / 1000);

  // ── Group Class: simplified view ──
  if (activeWorkout.isGroupClass) {
    var gIcon = _GROUP_ICONS[activeWorkout.groupType] || '🏋️';
    var gh = '<div class="go-group-class">';
    gh += '<div class="go-group-icon">' + gIcon + '</div>';
    gh += '<div class="go-group-title">' + activeWorkout.title + '</div>';
    gh += '<div class="go-group-timer" id="goTimerDisplay">' + goFormatTime(elapsed) + '</div>';
    gh += '<textarea class="go-group-notes" placeholder="Notes sur le cours..." onchange="activeWorkout.exercises[0].notes=this.value;">' + (activeWorkout.exercises[0].notes || '') + '</textarea>';
    gh += '<div style="display:flex;gap:12px;margin-top:20px;">';
    gh += '<button class="go-btn-sec" style="flex:1;" onclick="goTogglePause()">' + (_goSessionPaused ? '▶ Reprendre' : '⏸ Pause') + '</button>';
    gh += '<button class="go-finish-btn" style="flex:2;background:var(--green);color:#000;" onclick="goConfirmFinish()">✓ Terminer</button>';
    gh += '</div></div>';
    document.getElementById('goActiveView').innerHTML = gh;
    return;
  }

  var allE1RMs = getAllBestE1RMs();

  // Compute counters
  var tonnage = 0, totalSets = 0, totalExos = activeWorkout.exercises.length;
  activeWorkout.exercises.forEach(function(exo) {
    exo.sets.forEach(function(s) {
      if (s.completed) { totalSets++; tonnage += (s.weight || 0) * (s.reps || 0); }
    });
  });
  var tonnageDisplay = tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + 't' : tonnage + 'kg';

  var h = '';
  // ── Header sticky ──
  h += '<div class="go-header">';
  h += '<div class="go-header-top">';
  h += '<div><div class="go-header-label" onclick="goEditTitle()" style="cursor:pointer;display:flex;align-items:center;gap:4px;">' + (activeWorkout.title || 'SÉANCE EN COURS') + ' <span style="font-size:10px;opacity:0.5;">✏️</span></div>';
  h += '<div class="go-header-timer" id="goTimerDisplay">' + goFormatTime(elapsed) + '</div></div>';
  h += '<div class="go-header-btns">';
  h += '<button class="go-header-btn" onclick="goTogglePause()">' + (_goSessionPaused ? '▶' : '⏸') + '</button>';
  h += '<button class="go-header-btn danger" onclick="goConfirmDiscard()">✕</button>';
  h += '<button class="go-header-btn" style="background:rgba(50,215,75,0.7);" onclick="goConfirmFinish()">✓</button>';
  h += '</div></div>';
  h += '<div class="go-counters">';
  h += '<div class="go-counter-box"><div class="go-counter-val" id="goCntTonnage">' + tonnageDisplay + '</div><div class="go-counter-lbl">Tonnage ' + renderGlossaryTip('tonnage') + '</div></div>';
  h += '<div class="go-counter-box"><div class="go-counter-val" id="goCntExos">' + totalExos + '</div><div class="go-counter-lbl">Exercices</div></div>';
  h += '<div class="go-counter-box"><div class="go-counter-val" id="goCntSets">' + totalSets + '</div><div class="go-counter-lbl">Séries</div></div>';
  h += '</div></div>';

  // ── Readiness Banner (post-GO) ──
  h += getReadinessBannerHtml();

  // ── Rest Timer (if active) ──
  if (activeWorkout.restTimer && activeWorkout.restTimer.running) {
    var rt = activeWorkout.restTimer;
    var exoNameRest = rt.exoIndex >= 0 && rt.exoIndex < activeWorkout.exercises.length ? activeWorkout.exercises[rt.exoIndex].name : '';
    var pct = rt.total > 0 ? Math.max(0, Math.round((1 - rt.remaining / rt.total) * 100)) : 0;
    h += '<div class="go-rest-timer">';
    h += '<div class="go-rest-timer-title">⏱ Repos</div>';
    h += '<div class="go-rest-timer-exo">' + exoNameRest + '</div>';
    h += '<div class="go-rest-timer-count" id="goRestDisplay">' + goFormatTime(rt.remaining) + '</div>';
    // Barre de progression
    h += '<div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;margin:8px 0 10px;overflow:hidden;">';
    h += '<div id="goRestProgress" style="height:100%;width:' + pct + '%;background:var(--green);border-radius:2px;transition:width 1s linear;"></div>';
    h += '</div>';
    h += '<div class="go-rest-timer-btns">';
    h += '<button onclick="goAdjustRest(-15)">-15s</button>';
    h += '<button onclick="goAdjustRest(15)">+15s</button>';
    h += '<button class="skip" onclick="goSkipRest()">Passer</button>';
    h += '</div></div>';
  }

  // ── Muscle Distribution toggle ──
  h += '<div style="text-align:center;margin-bottom:10px;">';
  h += '<button class="go-btn-sec" style="width:auto;display:inline-flex;padding:8px 16px;font-size:12px;" onclick="_goMusclesExpanded=!_goMusclesExpanded;goRequestRender();">';
  h += '💪 Répartition musculaire ' + (_goMusclesExpanded ? '▲' : '▼') + '</button></div>';
  if (_goMusclesExpanded) {
    h += renderGoMuscleDistribution();
  }

  // ── Exercise Cards ──
  activeWorkout.exercises.forEach(function(exo, exoIdx) {
    h += renderGoExoCard(exo, exoIdx, allE1RMs);
  });

  // ── Add Exercise ──
  h += '<button class="go-add-exo" onclick="goOpenSearch()">➕ Ajouter un exercice</button>';

  // ── Finish / Cancel Buttons ──
  h += '<button class="go-finish-btn" style="background:var(--green);color:#000;" onclick="goConfirmFinish()">✓ Terminer la séance</button>';
  h += '<button class="go-btn-sec" style="border-color:rgba(255,69,58,0.3);color:var(--red);" onclick="goConfirmDiscard()">✕ Annuler la séance</button>';

  document.getElementById('goActiveView').innerHTML = h;
}

// ── Render a single exercise card ──
function renderGoExoCard(exo, exoIdx, allE1RMs) {
  var ms = _ecMuscleStyle(exo.name);
  var tt = goGetExoTrackingType(exo);
  var e1rm = allE1RMs[exo.name] ? allE1RMs[exo.name].e1rm : 0;
  var prev = goGetPreviousSets(exo.name);
  var prevSeries = prev ? prev.series : [];

  // Superset visual indicator
  var isSuperset = goIsPartOfSuperset(exoIdx);
  var supersetStyle = isSuperset ? 'border-left:3px solid ' + goGetSupersetColor(exoIdx) + ';' : '';
  var h = '<div class="go-exo-card" style="' + supersetStyle + '">';
  // Superset link button
  if (exoIdx < activeWorkout.exercises.length - 1) {
    var isLinked = exo.supersetWith === exoIdx + 1;
    h += '<div style="position:absolute;right:8px;top:8px;z-index:2;">';
    h += '<button onclick="goToggleSuperset(' + exoIdx + ')" style="background:' + (isLinked ? 'var(--accent)' : 'var(--surface)') + ';border:1px solid ' + (isLinked ? 'var(--accent)' : 'var(--border)') + ';color:' + (isLinked ? '#fff' : 'var(--sub)') + ';padding:3px 8px;border-radius:6px;font-size:9px;cursor:pointer;">' + (isLinked ? '🔗 Superset' : '🔗') + '</button></div>';
  }
  // Header avec miniature exercice
  var _imgUrl = exo.exoId ? getExoImageUrl(exo.exoId, 0) : null;
  h += '<div class="go-exo-header">';
  if (_imgUrl) {
    h += '<div class="exo-thumb" onclick="showExoDemo(\'' + (exo.exoId || '') + '\',\'' + exo.name.replace(/'/g, "\\'") + '\')">';
    h += '<img src="' + _imgUrl + '" loading="lazy" alt="" onerror="this.parentNode.innerHTML=\'<div class=exo-thumb-placeholder>' + getExoPlaceholderIcon(exo.name) + '</div>\'">';
    h += '</div>';
  } else {
    h += '<div class="exo-thumb" onclick="showExoDemo(\'\',\'' + exo.name.replace(/'/g, "\\'") + '\')">';
    h += '<div class="exo-thumb-placeholder">' + getExoPlaceholderIcon(exo.name) + '</div></div>';
  }
  h += '<div class="go-exo-info"><div class="go-exo-name">' + exo.name + '</div>';
  if (e1rm > 0) h += '<div class="go-exo-e1rm">e1RM: ' + Math.round(e1rm) + 'kg ' + renderGlossaryTip('e1rm') + '</div>';
  h += '</div>';
  h += '<button class="go-exo-menu" onclick="goShowExoMenu(' + exoIdx + ')">⋮</button>';
  h += '</div>';

  // Notes
  h += '<div class="go-exo-notes"><input type="text" placeholder="Ajouter des notes ici..." value="' + (exo.notes || '').replace(/"/g, '&quot;') + '" onchange="activeWorkout.exercises[' + exoIdx + '].notes=this.value;goAutoSave();"></div>';

  // Rest badge
  h += '<div class="go-rest-badge" onclick="goEditRest(' + exoIdx + ')">⏱ Repos: ' + goFormatRestBadge(exo.restSeconds || 90) + '</div>';

  // BW info & assistance selector
  var _bwExoData = exo.exoId ? EXO_DATABASE[exo.exoId] : null;
  if (_bwExoData && _bwExoData.isAssisted) {
    h += '<div class="go-assist-input">';
    h += '<span>🟡 Assistance :</span>';
    h += '<select onchange="activeWorkout.exercises[' + exoIdx + '].assistWeight=parseInt(this.value);goAutoSave();goRequestRender();">';
    h += '<option value="0">Aucune</option>';
    [10,20,30,40].forEach(function(v) {
      h += '<option value="' + v + '"' + (exo.assistWeight === v ? ' selected' : '') + '>~' + v + 'kg</option>';
    });
    h += '</select>';
    if (db.user.bw > 0 && exo.assistWeight > 0) {
      h += '<span style="color:var(--green);font-size:11px;margin-left:4px;">→ ~' + Math.max(0, Math.round(db.user.bw * (_bwExoData.bwFactor||1) - exo.assistWeight)) + 'kg eff.</span>';
    }
    h += '</div>';
  } else if (_bwExoData && _bwExoData.bwFactor && db.user.bw > 0) {
    var _bwComp = Math.round(db.user.bw * _bwExoData.bwFactor);
    h += '<div style="font-size:10px;color:var(--sub);padding:2px 12px;">💡 Charge effective : ' + _bwComp + 'kg (' + Math.round(_bwExoData.bwFactor * 100) + '% de ' + db.user.bw + 'kg)</div>';
  }

  // Sets table
  h += '<div style="padding:0 8px;overflow-x:auto;">';
  h += '<table class="go-sets-table"><thead><tr>';
  h += '<th style="width:36px;">SÉRIE</th><th>PRÉCÉDENT</th>';
  if (tt === 'weight') { h += '<th>KG <span onclick="goShowPlateCalc(' + exoIdx + ',0)" style="cursor:pointer;font-size:10px;">🔢</span></th><th>RÉPS</th><th style="width:44px;">RPE ' + renderGlossaryTip('rpe') + '</th>'; }
  else if (tt === 'reps') { h += '<th>RÉPS</th><th style="width:44px;">RPE ' + renderGlossaryTip('rpe') + '</th>'; }
  else if (tt === 'time') { h += '<th>DURÉE</th>'; }
  else if (tt === 'cardio') { h += '<th>KM</th><th>TEMPS</th>'; }
  h += '<th style="width:36px;">✓</th></tr></thead><tbody>';

  exo.sets.forEach(function(set, setIdx) {
    var isDone = set.completed;
    var rowClass = isDone ? ' class="go-row-done"' : '';
    h += '<tr' + rowClass + '>';

    // Set type button
    var typeLabel = '', typeClass = '';
    if (set.type === 'warmup') { typeLabel = 'W'; typeClass = ' warmup'; }
    else if (set.type === 'failure') { typeLabel = 'F'; typeClass = ' failure'; }
    else if (set.type === 'drop') { typeLabel = 'D'; typeClass = ' drop'; }
    else {
      // Count normal sets before this one
      var normalCount = 0;
      for (var k = 0; k <= setIdx; k++) { if (exo.sets[k].type === 'normal') normalCount++; }
      typeLabel = String(normalCount);
    }
    h += '<td><button class="go-set-type-btn' + typeClass + '" onclick="goShowSetTypeSheet(' + exoIdx + ',' + setIdx + ')">' + typeLabel + '</button></td>';

    // Previous
    var prevText = '—';
    if (prevSeries[setIdx]) {
      var ps = prevSeries[setIdx];
      if (ps.weight && ps.reps) prevText = ps.weight + '×' + ps.reps;
      else if (ps.reps) prevText = ps.reps + ' reps';
    }
    h += '<td><span class="go-set-prev">' + prevText + '</span></td>';

    // Inputs based on tracking type
    if (tt === 'weight') {
      var wVal = set.weight ? set.weight : '';
      var rVal = set.reps ? set.reps : '';
      var rpVal = set.rpe ? set.rpe : '';
      h += '<td><input class="go-set-input" type="number" inputmode="decimal" value="' + wVal + '" placeholder="kg" onchange="goUpdateSetValue(' + exoIdx + ',' + setIdx + ',\'weight\',this.value)" ' + (isDone ? 'tabindex="-1"' : '') + '></td>';
      h += '<td><input class="go-set-input" type="number" inputmode="decimal" value="' + rVal + '" placeholder="reps" onchange="goUpdateSetValue(' + exoIdx + ',' + setIdx + ',\'reps\',this.value)" ' + (isDone ? 'tabindex="-1"' : '') + '></td>';
      h += '<td><input class="go-set-input" type="number" inputmode="decimal" value="' + rpVal + '" placeholder="—" style="width:40px;" onchange="goUpdateSetValue(' + exoIdx + ',' + setIdx + ',\'rpe\',this.value)" ' + (isDone ? 'tabindex="-1"' : '') + '></td>';
    } else if (tt === 'reps') {
      var rVal2 = set.reps ? set.reps : '';
      var rpVal2 = set.rpe ? set.rpe : '';
      h += '<td><input class="go-set-input" type="number" inputmode="decimal" value="' + rVal2 + '" placeholder="reps" onchange="goUpdateSetValue(' + exoIdx + ',' + setIdx + ',\'reps\',this.value)" ' + (isDone ? 'tabindex="-1"' : '') + '></td>';
      h += '<td><input class="go-set-input" type="number" inputmode="decimal" value="' + rpVal2 + '" placeholder="—" style="width:40px;" onchange="goUpdateSetValue(' + exoIdx + ',' + setIdx + ',\'rpe\',this.value)" ' + (isDone ? 'tabindex="-1"' : '') + '></td>';
    } else if (tt === 'time') {
      h += '<td><input class="go-set-input" type="number" inputmode="decimal" value="' + (set.duration || '') + '" placeholder="sec" onchange="goUpdateSetValue(' + exoIdx + ',' + setIdx + ',\'duration\',this.value)" ' + (isDone ? 'tabindex="-1"' : '') + '></td>';
    } else if (tt === 'cardio') {
      h += '<td><input class="go-set-input" type="number" inputmode="decimal" value="' + (set.distance || '') + '" placeholder="km" onchange="goUpdateSetValue(' + exoIdx + ',' + setIdx + ',\'distance\',this.value)" ' + (isDone ? 'tabindex="-1"' : '') + '></td>';
      h += '<td><input class="go-set-input" type="number" inputmode="decimal" value="' + (set.duration || '') + '" placeholder="min" onchange="goUpdateSetValue(' + exoIdx + ',' + setIdx + ',\'duration\',this.value)" ' + (isDone ? 'tabindex="-1"' : '') + '></td>';
    }

    // Check button
    h += '<td><button class="go-check-btn' + (isDone ? ' done' : '') + '" onclick="goToggleSetComplete(' + exoIdx + ',' + setIdx + ')">' + (isDone ? '✓' : '') + '</button></td>';
    h += '</tr>';
  });

  h += '</tbody></table></div>';

  // Add set button
  h += '<button class="go-add-set-btn" onclick="goAddSet(' + exoIdx + ')">+ Série</button>';

  // Footer with instructions + last time
  var exoData = exo.exoId ? EXO_DATABASE[exo.exoId] : null;
  if (exoData && exoData.instructions) {
    h += '<div class="go-exo-footer"><button onclick="goShowInstructions(' + exoIdx + ')">📖 Instructions</button></div>';
  }

  var lastTime = goGetLastTimeSummary(exo.name);
  if (lastTime) {
    h += '<div class="go-last-time">🕐 Dernière fois : ' + (lastTime.weight ? lastTime.weight + 'kg × ' : '') + lastTime.reps + ' × ' + lastTime.sets + ' séries · ' + lastTime.date + '</div>';
  }

  h += '</div>';
  return h;
}

// ============================================================
// GO TAB — Set operations, rest timer, counters
// ============================================================
function goToggleSetComplete(exoIdx, setIdx) {
  var set = activeWorkout.exercises[exoIdx].sets[setIdx];
  set.completed = !set.completed;
  if (set.completed) {
    // Supersets : ne lancer le timer qu'après le DERNIER exo du superset
    var exo = activeWorkout.exercises[exoIdx];
    var isInSuperset = goIsPartOfSuperset(exoIdx);
    var isLastInChain = !exo.supersetWith; // pas de lien vers le suivant = dernier de la chaîne
    if (!isInSuperset || isLastInChain) {
      var restSec = activeWorkout.exercises[exoIdx].restSeconds || 90;
      goStartRestTimer(restSec, exoIdx);
    }
    // Auto-régulation RPE
    goCheckAutoRegulation(exoIdx, setIdx);
  }
  goAutoSave();
  goUpdateCounters();
  goRequestRender();
  // Scroll to next incomplete set
  if (set.completed) {
    setTimeout(function() {
      var rows = document.querySelectorAll('.go-sets-table tr');
      for (var i = 0; i < rows.length; i++) {
        if (!rows[i].classList.contains('go-row-done') && rows[i].querySelector('.go-check-btn') && !rows[i].querySelector('.go-check-btn.done')) {
          rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
    }, 100);
  }
}

// ── Auto-régulation intra-séance basée sur le RPE ──────────
function goCheckAutoRegulation(exoIdx, setIdx) {
  if (!activeWorkout || !db.weeklyPlan) return;
  var exo = activeWorkout.exercises[exoIdx];
  var set = exo.sets[setIdx];
  if (!set || !set.completed || !set.rpe) return;

  // Trouver le RPE cible depuis le plan
  var todayDay = DAYS_FULL[new Date().getDay()];
  var planDay = db.weeklyPlan.days ? db.weeklyPlan.days.find(function(d) { return d.day === todayDay && !d.rest; }) : null;
  if (!planDay) return;
  var planExo = (planDay.exercises || []).find(function(e) { return matchExoName(e.name, exo.name); });
  if (!planExo) return;
  var planWorkSets = (planExo.sets || []).filter(function(s) { return !s.isWarmup && !s.isBackoff; });
  var targetRPE = planWorkSets.length ? planWorkSets[0].rpe : null;
  if (!targetRPE) return;

  var rpeActual = parseFloat(set.rpe);
  var rpeDiff = rpeActual - targetRPE;
  var currentWeight = set.weight || 0;
  if (currentWeight <= 0) return;

  // Ajustement plus agressif si readiness < 70
  var readinessLow = activeWorkout.readiness && activeWorkout.readiness.score < 70;
  var suggestion = null;

  if (rpeDiff >= 1.5) {
    var factor = readinessLow ? 0.90 : 0.93;
    suggestion = { type:'reduce', message:'RPE ' + rpeActual + ' vs cible ' + targetRPE + ' — trop dur',
      action:'Baisser à ' + round05(currentWeight * factor) + 'kg', newWeight: round05(currentWeight * factor) };
  } else if (rpeDiff >= 1) {
    suggestion = { type:'reduce', message:'RPE ' + rpeActual + ' vs cible ' + targetRPE + ' — un peu dur',
      action:'Essaie ' + round05(currentWeight * 0.95) + 'kg', newWeight: round05(currentWeight * 0.95) };
  } else if (rpeDiff <= -1.5) {
    suggestion = { type:'increase', message:'RPE ' + rpeActual + ' vs cible ' + targetRPE + ' — tu peux monter',
      action:'Essaie ' + round05(currentWeight * 1.05) + 'kg', newWeight: round05(currentWeight * 1.05) };
  } else if (rpeDiff <= -1) {
    suggestion = { type:'increase', message:'RPE ' + rpeActual + ' — marge disponible',
      action:'Tu pourrais monter à ' + round05(currentWeight * 1.025) + 'kg', newWeight: round05(currentWeight * 1.025) };
  }

  if (suggestion) goShowAutoRegSuggestion(exoIdx, setIdx, suggestion);
}

function goShowAutoRegSuggestion(exoIdx, setIdx, suggestion) {
  // Retirer toute suggestion précédente
  var prev = document.getElementById('go-autoreg-banner');
  if (prev) prev.remove();

  var bgColor = suggestion.type === 'reduce' ? 'rgba(255,159,10,0.08)' : 'rgba(10,132,255,0.08)';
  var borderColor = suggestion.type === 'reduce' ? 'var(--orange)' : 'var(--blue)';
  var icon = suggestion.type === 'reduce' ? '📉' : '📈';

  var banner = document.createElement('div');
  banner.id = 'go-autoreg-banner';
  banner.style.cssText = 'background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:10px;padding:10px 12px;margin:8px 0;font-size:12px;';
  banner.innerHTML = '<div style="font-weight:700;margin-bottom:4px;">' + icon + ' ' + suggestion.message + '</div>' +
    '<div style="color:var(--sub);margin-bottom:6px;">' + suggestion.action + '</div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button onclick="goApplyAutoReg(' + exoIdx + ',' + suggestion.newWeight + ')" style="flex:1;padding:6px;background:' + borderColor + ';border:none;color:white;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">Oui</button>' +
    '<button onclick="document.getElementById(\'go-autoreg-banner\').remove()" style="flex:1;padding:6px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:8px;font-size:11px;cursor:pointer;">Non</button></div>';

  // Insérer après l'exercice courant
  var exoCard = document.querySelectorAll('.go-exo-card')[exoIdx];
  if (exoCard) exoCard.parentNode.insertBefore(banner, exoCard.nextSibling);
}

function goApplyAutoReg(exoIdx, newWeight) {
  var exo = activeWorkout.exercises[exoIdx];
  // Appliquer le nouveau poids aux séries non complétées
  exo.sets.forEach(function(s) {
    if (!s.completed) s.weight = newWeight;
  });
  var banner = document.getElementById('go-autoreg-banner');
  if (banner) banner.remove();
  goAutoSave();
  goRequestRender();
  showToast('✅ Charge ajustée à ' + newWeight + 'kg');
}

function goAddSet(exoIdx) {
  var exo = activeWorkout.exercises[exoIdx];
  var lastSet = exo.sets.length > 0 ? exo.sets[exo.sets.length - 1] : null;
  var newSet = {
    weight: lastSet ? lastSet.weight : 0,
    reps: lastSet ? lastSet.reps : 0,
    type: 'normal',
    completed: false,
    rpe: null,
    duration: lastSet ? lastSet.duration : 0,
    distance: lastSet ? lastSet.distance : 0
  };
  // If no sets yet, try to pre-fill from previous session
  if (!lastSet) {
    var prev = goGetPreviousSets(exo.name);
    if (prev && prev.series.length > 0) {
      newSet.weight = prev.series[0].weight || 0;
      newSet.reps = prev.series[0].reps || 0;
    }
  }
  exo.sets.push(newSet);
  goAutoSave();
  goRequestRender();
}

function goRemoveSet(exoIdx, setIdx) {
  activeWorkout.exercises[exoIdx].sets.splice(setIdx, 1);
  goAutoSave();
  goUpdateCounters();
  goRequestRender();
}

function goUpdateSetValue(exoIdx, setIdx, field, value) {
  var v = parseFloat(value) || 0;
  activeWorkout.exercises[exoIdx].sets[setIdx][field] = v;
  goAutoSave();
}

function goUpdateCounters() {
  if (!activeWorkout) return;
  var tonnage = 0, totalSets = 0;
  activeWorkout.exercises.forEach(function(exo) {
    exo.sets.forEach(function(s) {
      if (s.completed) { totalSets++; tonnage += (s.weight || 0) * (s.reps || 0); }
    });
  });
  var el1 = document.getElementById('goCntTonnage');
  var el2 = document.getElementById('goCntSets');
  if (el1) el1.textContent = tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + 't' : tonnage + 'kg';
  if (el2) el2.textContent = totalSets;
}

// ── Rest Timer ──
function goStartRestTimer(seconds, exoIndex) {
  goSkipRest(); // clear any existing
  activeWorkout.restTimer = { running: true, remaining: seconds, total: seconds, exoIndex: exoIndex };
  _goRestTimerId = setInterval(function() {
    if (!activeWorkout || !activeWorkout.restTimer.running) { goSkipRest(); return; }
    activeWorkout.restTimer.remaining--;
    var el = document.getElementById('goRestDisplay');
    if (el) el.textContent = goFormatTime(Math.max(0, activeWorkout.restTimer.remaining));
    // Mise à jour de la barre de progression
    var progEl = document.getElementById('goRestProgress');
    if (progEl && activeWorkout.restTimer.total > 0) {
      var pct = Math.max(0, Math.round((1 - activeWorkout.restTimer.remaining / activeWorkout.restTimer.total) * 100));
      progEl.style.width = pct + '%';
    }
    if (activeWorkout.restTimer.remaining <= 0) {
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch(e) {}
      // Notification sonore
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.3;
        osc.start();
        setTimeout(function() { osc.stop(); ctx.close(); }, 300);
      } catch(e) {}
      goSkipRest();
      goRequestRender();
    }
  }, 1000);
  goRequestRender();
}

function goAdjustRest(delta) {
  if (!activeWorkout || !activeWorkout.restTimer.running) return;
  activeWorkout.restTimer.remaining = Math.max(0, activeWorkout.restTimer.remaining + delta);
  var el = document.getElementById('goRestDisplay');
  if (el) el.textContent = goFormatTime(activeWorkout.restTimer.remaining);
}

function goSkipRest() {
  if (_goRestTimerId) { clearInterval(_goRestTimerId); _goRestTimerId = null; }
  if (activeWorkout) activeWorkout.restTimer = { running: false, remaining: 0, total: 0, exoIndex: -1 };
}

// ── Modifier le titre de la séance ──
function goEditTitle() {
  if (!activeWorkout) return;
  var newTitle = prompt('Nom de la séance :', activeWorkout.title || 'Séance');
  if (newTitle !== null && newTitle.trim()) {
    activeWorkout.title = newTitle.trim();
    goAutoSave();
    goRequestRender();
  }
}

// ============================================================
// PHOTOS DE SÉANCE — Compression, Recadrage, Upload
// ============================================================
// Architecture : tout l'upload passe par uploadSessionPhoto()
// Pour migrer vers Cloudinary plus tard, il suffit de modifier
// cette seule fonction.

/**
 * Compresse et redimensionne une image.
 * @param {File|Blob} file — fichier image source
 * @param {Object} opts
 *   opts.maxWidth  — largeur max (default 800)
 *   opts.quality   — qualité JPEG 0-1 (default 0.75)
 *   opts.crop      — null | {x,y,w,h} (coordonnées sur l'image source)
 * @returns {Promise<Blob>} — blob JPEG compressé
 */
function compressImage(file, opts) {
  opts = opts || {};
  var maxWidth  = opts.maxWidth  || 800;
  var quality   = opts.quality   || 0.75;
  var crop      = opts.crop      || null;

  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function(e) {
      var img = new Image();
      img.onerror = reject;
      img.onload = function() {
        // Zone source (crop ou image entière)
        var sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (crop) {
          sx = crop.x; sy = crop.y; sw = crop.w; sh = crop.h;
        }

        // Dimensions de sortie (max maxWidth tout en gardant le ratio)
        var ratio = sw / sh;
        var outW = Math.min(sw, maxWidth);
        var outH = Math.round(outW / ratio);
        if (outH > maxWidth) { outH = maxWidth; outW = Math.round(outH * ratio); }

        var canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

        canvas.toBlob(function(blob) {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed'));
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Crop centré automatique selon un ratio donné.
 * Retourne les coordonnées {x, y, w, h} pour compressImage.
 * @param {number} imgW — largeur originale
 * @param {number} imgH — hauteur originale
 * @param {number} ratioW — ratio largeur (ex: 1)
 * @param {number} ratioH — ratio hauteur (ex: 1)
 */
function autoCropCenter(imgW, imgH, ratioW, ratioH) {
  var targetRatio = ratioW / ratioH;
  var currentRatio = imgW / imgH;
  var x, y, w, h;
  if (currentRatio > targetRatio) {
    // Image trop large → crop sur les côtés
    h = imgH;
    w = Math.round(imgH * targetRatio);
    x = Math.round((imgW - w) / 2);
    y = 0;
  } else {
    // Image trop haute → crop en haut/bas
    w = imgW;
    h = Math.round(imgW / targetRatio);
    x = 0;
    y = Math.round((imgH - h) / 2);
  }
  return { x: x, y: y, w: w, h: h };
}

/**
 * Upload une photo de séance vers Supabase Storage.
 * ── POINT UNIQUE D'UPLOAD ──
 * Pour migrer vers Cloudinary : modifier uniquement cette fonction.
 * @param {Blob} blob — image compressée
 * @param {string} sessionId — id de la séance
 * @param {number} index — numéro de la photo (0-3)
 * @returns {Promise<string|null>} — URL publique ou null
 */
async function uploadSessionPhoto(blob, sessionId, index) {
  if (typeof supabase === 'undefined' || !supabase) return null;
  try {
    var user = (await supabase.auth.getUser()).data.user;
    if (!user) return null;

    var path = user.id + '/' + sessionId + '/' + index + '.jpg';
    var { data, error } = await supabase.storage
      .from('session-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

    if (error) { console.warn('Photo upload error:', error); return null; }

    var { data: urlData } = supabase.storage
      .from('session-photos')
      .getPublicUrl(path);

    return urlData ? urlData.publicUrl : null;
  } catch(e) {
    console.warn('uploadSessionPhoto error:', e);
    return null;
  }
}

/**
 * Supprime une photo de séance de Supabase Storage.
 * @param {string} sessionId
 * @param {number} index
 */
async function deleteSessionPhoto(sessionId, index) {
  if (typeof supabase === 'undefined' || !supabase) return;
  try {
    var user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    var path = user.id + '/' + sessionId + '/' + index + '.jpg';
    await supabase.storage.from('session-photos').remove([path]);
  } catch(e) {}
}

// ── État du crop interactif ──
var _cropState = null;

/**
 * Ouvre l'outil de recadrage pour une image.
 * @param {File} file — fichier source
 * @param {Function} onDone — callback(blob) appelé avec le blob final
 */
function openCropTool(file, onDone) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      _cropState = {
        img: img,
        file: file,
        imgW: img.width,
        imgH: img.height,
        ratio: '1:1',    // défaut
        onDone: onDone
      };
      renderCropOverlay();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderCropOverlay() {
  var cs = _cropState;
  if (!cs) return;

  var old = document.getElementById('cropOverlay');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'cropOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:15px;';

  // Calculer les dimensions d'affichage (fit dans l'écran)
  var maxW = Math.min(window.innerWidth - 30, 400);
  var maxH = window.innerHeight - 200;
  var scale = Math.min(maxW / cs.imgW, maxH / cs.imgH, 1);
  var dispW = Math.round(cs.imgW * scale);
  var dispH = Math.round(cs.imgH * scale);

  // Zone de crop auto-centrée selon le ratio choisi
  var rParts = cs.ratio.split(':');
  var rW = parseInt(rParts[0]);
  var rH = parseInt(rParts[1]);
  var cropBox = autoCropCenter(dispW, dispH, rW, rH);

  var h = '';
  // Header
  h += '<div style="color:white;font-size:16px;font-weight:700;margin-bottom:12px;">Recadrer la photo</div>';

  // Ratio buttons
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  var ratios = [
    { val: 'none', label: 'Original' },
    { val: '1:1', label: 'Carré 1:1' },
    { val: '4:3', label: 'Paysage 4:3' }
  ];
  ratios.forEach(function(r) {
    var sel = cs.ratio === r.val;
    h += '<button onclick="_cropState.ratio=\'' + r.val + '\';renderCropOverlay();" style="padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ' + (sel ? 'var(--accent)' : 'rgba(255,255,255,0.2)') + ';background:' + (sel ? 'var(--accent)' : 'rgba(255,255,255,0.1)') + ';color:white;">' + r.label + '</button>';
  });
  h += '</div>';

  // Image preview with crop overlay
  h += '<div style="position:relative;width:' + dispW + 'px;height:' + dispH + 'px;margin-bottom:16px;">';
  h += '<img src="' + cs.img.src + '" style="width:100%;height:100%;object-fit:contain;border-radius:8px;">';

  if (cs.ratio !== 'none') {
    // Zones sombres en dehors du crop
    // Haut
    if (cropBox.y > 0) h += '<div style="position:absolute;top:0;left:0;width:100%;height:' + cropBox.y + 'px;background:rgba(0,0,0,0.6);"></div>';
    // Bas
    var bottomH = dispH - cropBox.y - cropBox.h;
    if (bottomH > 0) h += '<div style="position:absolute;bottom:0;left:0;width:100%;height:' + bottomH + 'px;background:rgba(0,0,0,0.6);"></div>';
    // Gauche
    if (cropBox.x > 0) h += '<div style="position:absolute;top:' + cropBox.y + 'px;left:0;width:' + cropBox.x + 'px;height:' + cropBox.h + 'px;background:rgba(0,0,0,0.6);"></div>';
    // Droite
    var rightW = dispW - cropBox.x - cropBox.w;
    if (rightW > 0) h += '<div style="position:absolute;top:' + cropBox.y + 'px;right:0;width:' + rightW + 'px;height:' + cropBox.h + 'px;background:rgba(0,0,0,0.6);"></div>';
    // Bordure du crop
    h += '<div style="position:absolute;top:' + cropBox.y + 'px;left:' + cropBox.x + 'px;width:' + cropBox.w + 'px;height:' + cropBox.h + 'px;border:2px solid var(--accent);border-radius:4px;pointer-events:none;"></div>';
  }
  h += '</div>';

  // Taille estimée
  h += '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:12px;">Original : ' + cs.imgW + '×' + cs.imgH + ' — Sortie : 800px max, JPEG 75%</div>';

  // Buttons
  h += '<div style="display:flex;gap:10px;">';
  h += '<button onclick="closeCropTool()" style="padding:12px 24px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:white;font-size:14px;font-weight:600;cursor:pointer;">Annuler</button>';
  h += '<button onclick="applyCrop()" style="padding:12px 24px;border-radius:10px;border:none;background:var(--accent);color:white;font-size:14px;font-weight:700;cursor:pointer;">Valider</button>';
  h += '</div>';

  overlay.innerHTML = h;
  document.body.appendChild(overlay);
}

function closeCropTool() {
  _cropState = null;
  var el = document.getElementById('cropOverlay');
  if (el) el.remove();
}

function applyCrop() {
  var cs = _cropState;
  if (!cs) return;

  var cropOpts = null;
  if (cs.ratio !== 'none') {
    var rParts = cs.ratio.split(':');
    cropOpts = autoCropCenter(cs.imgW, cs.imgH, parseInt(rParts[0]), parseInt(rParts[1]));
  }

  compressImage(cs.file, { maxWidth: 800, quality: 0.75, crop: cropOpts })
    .then(function(blob) {
      var cb = cs.onDone;
      closeCropTool();
      if (cb) cb(blob);
    })
    .catch(function(err) {
      console.error('Crop/compress error:', err);
      showToast('Erreur de compression');
      closeCropTool();
    });
}

// ── UI pour ajouter des photos à une séance ──

/**
 * Ouvre le sélecteur de photos pour une séance.
 * @param {string} sessionId — id de la séance dans db.logs
 */
function openSessionPhotoPicker(sessionId) {
  var session = db.logs.find(function(l) { return l.id === sessionId; });
  if (!session) return;
  if (!session.photos) session.photos = [];
  if (session.photos.length >= 4) { showToast('Maximum 4 photos par séance'); return; }

  var remaining = 4 - session.photos.length;

  // Modal avec 2 options : caméra ou galerie
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'photoPickerOverlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var h = '<div class="modal-box" style="max-width:300px;">';
  h += '<p style="margin:0 0 14px;font-size:15px;font-weight:700;text-align:center;">Ajouter une photo</p>';
  h += '<button onclick="_pickPhoto(\'' + sessionId + '\',true)" class="btn" style="margin-bottom:8px;">📷 Prendre une photo</button>';
  h += '<button onclick="_pickPhoto(\'' + sessionId + '\',false)" class="btn" style="background:var(--surface);border:1px solid var(--border);color:var(--text);margin-bottom:8px;">🖼️ Choisir dans la galerie</button>';
  h += '<button onclick="document.getElementById(\'photoPickerOverlay\').remove();" class="btn" style="background:transparent;color:var(--sub);font-size:13px;">Annuler</button>';
  h += '</div>';
  overlay.innerHTML = h;
  document.body.appendChild(overlay);
}

function _pickPhoto(sessionId, useCamera) {
  var overlay = document.getElementById('photoPickerOverlay');
  if (overlay) overlay.remove();

  var session = db.logs.find(function(l) { return l.id === sessionId; });
  if (!session) return;
  var remaining = 4 - (session.photos || []).length;

  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (useCamera) {
    input.capture = 'environment';
  } else {
    input.multiple = true;
  }
  input.onchange = function() {
    var files = Array.from(input.files).slice(0, remaining);
    if (!files.length) return;
    processSessionPhotos(sessionId, files);
  };
  input.click();
}

async function processSessionPhotos(sessionId, files) {
  var session = db.logs.find(function(l) { return l.id === sessionId; });
  if (!session) return;
  if (!session.photos) session.photos = [];

  // Traiter chaque fichier via le crop tool (séquentiellement)
  var idx = 0;
  function processNext() {
    if (idx >= files.length) return;
    var file = files[idx];
    idx++;

    openCropTool(file, async function(blob) {
      showToast('📤 Upload en cours...');
      var photoIndex = session.photos.length;
      var url = await uploadSessionPhoto(blob, sessionId, photoIndex);

      if (url) {
        session.photos.push({
          url: url,
          index: photoIndex,
          addedAt: Date.now(),
          size: blob.size
        });
        saveDB();
        showToast('✅ Photo ajoutée (' + Math.round(blob.size / 1024) + ' Ko)');
      } else {
        // Stocker en base64 en fallback si pas de Supabase
        var reader = new FileReader();
        reader.onload = function(e) {
          session.photos.push({
            dataUrl: e.target.result,
            index: photoIndex,
            addedAt: Date.now(),
            size: blob.size
          });
          saveDB();
          showToast('✅ Photo sauvegardée localement (' + Math.round(blob.size / 1024) + ' Ko)');
        };
        reader.readAsDataURL(blob);
      }

      // Mettre à jour l'éditeur si ouvert
      if (_editSession && _editSessionId === sessionId) {
        _editSession.photos = session.photos;
        renderSessionEditor();
      }
      // Photo suivante
      processNext();
    });
  }
  processNext();
}

function removeSessionPhoto(sessionId, photoIdx) {
  if (!confirm('Supprimer cette photo ?')) return;
  var session = db.logs.find(function(l) { return l.id === sessionId; });
  if (!session || !session.photos) return;

  var photo = session.photos[photoIdx];
  if (photo && !photo.dataUrl) {
    // Supprimer du storage
    deleteSessionPhoto(sessionId, photo.index);
  }
  session.photos.splice(photoIdx, 1);
  saveDB();
  showToast('Photo supprimée');

  if (_editSession && _editSessionId === sessionId) {
    _editSession.photos = session.photos;
    renderSessionEditor();
  }
}

/**
 * Rendu des photos d'une séance (pour l'éditeur et l'historique).
 * @param {string} sessionId
 * @param {Array} photos
 * @param {boolean} editable — afficher les boutons supprimer
 */
function renderSessionPhotos(sessionId, photos, editable) {
  if (!photos || photos.length === 0) {
    if (!editable) return '';
    return '<div style="text-align:center;padding:8px 0;">' +
      '<button onclick="openSessionPhotoPicker(\'' + sessionId + '\')" style="background:none;border:1px dashed rgba(255,255,255,0.15);color:var(--sub);padding:16px;border-radius:10px;cursor:pointer;font-size:12px;width:100%;">📷 Ajouter des photos (max 4)</button></div>';
  }

  var h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;">';
  photos.forEach(function(photo, pi) {
    var src = photo.url || photo.dataUrl || '';
    h += '<div style="position:relative;width:calc(50% - 4px);aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--surface);">';
    h += '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">';
    if (editable) {
      h += '<button onclick="removeSessionPhoto(\'' + sessionId + '\',' + pi + ')" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.7);border:none;color:white;cursor:pointer;font-size:11px;">✕</button>';
    }
    h += '</div>';
  });

  if (editable && photos.length < 4) {
    h += '<div style="width:calc(50% - 4px);aspect-ratio:1;border-radius:10px;border:1px dashed rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--sub);" onclick="openSessionPhotoPicker(\'' + sessionId + '\')">';
    h += '<span style="font-size:24px;">+</span></div>';
  }
  h += '</div>';
  return h;
}

// ============================================================
// ÉDITEUR DE SÉANCE PASSÉE — plein écran
// ============================================================
var _editSession = null;   // copie de travail
var _editSessionId = null; // id dans db.logs

function openSessionEditor(sessionId) {
  var session = db.logs.find(function(l) { return l.id === sessionId; });
  if (!session) { showToast('Séance introuvable'); return; }

  _editSessionId = sessionId;
  // Copie profonde pour pouvoir annuler
  _editSession = JSON.parse(JSON.stringify(session));

  renderSessionEditor();
}

function renderSessionEditor() {
  var s = _editSession;
  if (!s) return;

  // Supprimer l'overlay précédent s'il existe
  var old = document.getElementById('sessionEditorOverlay');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'sessionEditorOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:20000;background:var(--bg-primary);overflow-y:auto;padding:15px 15px 120px;';

  var dt = new Date(s.timestamp);
  var dateVal = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  var timeVal = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');

  var h = '';
  // ── Header ──
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
  h += '<button onclick="closeSessionEditor()" style="background:none;border:none;color:var(--accent);font-size:14px;font-weight:600;cursor:pointer;">← Annuler</button>';
  h += '<div style="font-size:16px;font-weight:700;color:var(--text);">Modifier la séance</div>';
  h += '<button onclick="saveSessionEdits()" style="background:var(--accent);border:none;color:white;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Enregistrer</button>';
  h += '</div>';

  // ── Titre ──
  h += '<div class="card">';
  h += '<label style="font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Titre</label>';
  h += '<input type="text" id="seTitle" value="' + (s.title || '').replace(/"/g, '&quot;') + '" style="font-size:16px;font-weight:600;margin-top:4px;">';
  h += '</div>';

  // ── Date & Heure ──
  h += '<div class="card">';
  h += '<label style="font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Date & Heure</label>';
  h += '<div style="display:flex;gap:8px;margin-top:4px;">';
  h += '<input type="date" id="seDate" value="' + dateVal + '" style="flex:1;margin:0;">';
  h += '<input type="time" id="seTime" value="' + timeVal + '" style="width:120px;margin:0;">';
  h += '</div></div>';

  // ── Notes de séance ──
  h += '<div class="card">';
  h += '<label style="font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Notes</label>';
  h += '<textarea id="seNotes" rows="2" style="margin-top:4px;resize:vertical;" placeholder="Notes de séance...">' + (s.notes || '') + '</textarea>';
  h += '</div>';

  // ── Photos ──
  h += '<div class="card">';
  h += '<label style="font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Photos</label>';
  h += renderSessionPhotos(_editSessionId, s.photos || [], true);
  h += '</div>';

  // ── Exercices ──
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px;">';
  h += '<div style="font-size:13px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.5px;">' + s.exercises.length + ' Exercice' + (s.exercises.length > 1 ? 's' : '') + '</div>';
  h += '<button onclick="seAddExercise()" style="background:var(--accent);border:none;color:white;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">+ Ajouter</button>';
  h += '</div>';

  s.exercises.forEach(function(exo, ei) {
    var sets = exo.allSets || exo.series || [];
    h += '<div class="card" style="padding:12px;">';

    // Exo header : nom + actions
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    h += '<input type="text" value="' + (exo.name || '').replace(/"/g, '&quot;') + '" onchange="_editSession.exercises[' + ei + '].name=this.value;" style="flex:1;margin:0;font-weight:700;font-size:14px;padding:8px 10px;">';
    h += '<div style="display:flex;gap:4px;margin-left:6px;flex-shrink:0;">';
    // Boutons monter/descendre/supprimer
    if (ei > 0) h += '<button onclick="seMoveExo(' + ei + ',-1)" style="background:var(--surface);border:1px solid var(--border);color:var(--sub);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px;">↑</button>';
    if (ei < s.exercises.length - 1) h += '<button onclick="seMoveExo(' + ei + ',1)" style="background:var(--surface);border:1px solid var(--border);color:var(--sub);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px;">↓</button>';
    h += '<button onclick="seRemoveExo(' + ei + ')" style="background:rgba(255,69,58,0.1);border:1px solid rgba(255,69,58,0.2);color:var(--red);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px;">✕</button>';
    h += '</div></div>';

    // Table des séries
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    h += '<thead><tr style="color:var(--sub);font-size:10px;text-transform:uppercase;">';
    h += '<th style="text-align:left;padding:4px;width:40px;">Série</th>';
    h += '<th style="text-align:center;padding:4px;">Poids</th>';
    h += '<th style="text-align:center;padding:4px;">Reps</th>';
    h += '<th style="text-align:center;padding:4px;width:50px;">RPE</th>';
    h += '<th style="text-align:center;padding:4px;width:60px;">Type</th>';
    h += '<th style="width:28px;"></th>';
    h += '</tr></thead><tbody>';

    sets.forEach(function(set, si) {
      h += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">';
      h += '<td style="padding:4px;color:var(--sub);font-weight:600;">' + (si + 1) + '</td>';
      h += '<td style="padding:4px;"><input type="number" step="0.5" value="' + (set.weight || '') + '" onchange="seUpdateSet(' + ei + ',' + si + ',\'weight\',this.value)" style="width:100%;margin:0;padding:6px;font-size:13px;text-align:center;"></td>';
      h += '<td style="padding:4px;"><input type="number" value="' + (set.reps || '') + '" onchange="seUpdateSet(' + ei + ',' + si + ',\'reps\',this.value)" style="width:100%;margin:0;padding:6px;font-size:13px;text-align:center;"></td>';
      h += '<td style="padding:4px;"><input type="number" step="0.5" value="' + (set.rpe || '') + '" onchange="seUpdateSet(' + ei + ',' + si + ',\'rpe\',this.value)" style="width:100%;margin:0;padding:6px;font-size:13px;text-align:center;" placeholder="—"></td>';

      var typeOpts = '<option value="normal"' + (set.setType === 'normal' || !set.setType ? ' selected' : '') + '>Normal</option>';
      typeOpts += '<option value="warmup"' + (set.setType === 'warmup' ? ' selected' : '') + '>Échauff.</option>';
      typeOpts += '<option value="drop"' + (set.setType === 'drop' ? ' selected' : '') + '>Drop</option>';
      typeOpts += '<option value="failure"' + (set.setType === 'failure' ? ' selected' : '') + '>Échec</option>';
      h += '<td style="padding:4px;"><select onchange="seUpdateSet(' + ei + ',' + si + ',\'setType\',this.value)" style="width:100%;margin:0;padding:4px;font-size:11px;">' + typeOpts + '</select></td>';

      h += '<td style="padding:4px;text-align:center;"><button onclick="seRemoveSet(' + ei + ',' + si + ')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:11px;">✕</button></td>';
      h += '</tr>';
    });

    h += '</tbody></table>';
    h += '<button onclick="seAddSet(' + ei + ')" style="background:none;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;padding:6px 0;margin-top:4px;">+ Série</button>';
    h += '</div>';
  });

  // ── Zone de danger ──
  h += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,69,58,0.2);">';
  h += '<button onclick="seDeleteSession()" style="width:100%;padding:14px;background:rgba(255,69,58,0.1);border:1px solid rgba(255,69,58,0.3);color:var(--red);border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">🗑️ Supprimer cette séance</button>';
  h += '</div>';

  overlay.innerHTML = '<div style="max-width:500px;margin:0 auto;">' + h + '</div>';
  document.body.appendChild(overlay);
}

function closeSessionEditor() {
  _editSession = null;
  _editSessionId = null;
  var overlay = document.getElementById('sessionEditorOverlay');
  if (overlay) overlay.remove();
}

function seUpdateSet(exoIdx, setIdx, field, value) {
  var sets = _editSession.exercises[exoIdx].allSets || _editSession.exercises[exoIdx].series || [];
  if (!sets[setIdx]) return;
  if (field === 'weight' || field === 'reps' || field === 'rpe') {
    sets[setIdx][field] = value === '' ? null : parseFloat(value);
  } else {
    sets[setIdx][field] = value;
  }
}

function seAddSet(exoIdx) {
  var exo = _editSession.exercises[exoIdx];
  var sets = exo.allSets || exo.series;
  // Copier la dernière série comme base
  var lastSet = sets.length > 0 ? JSON.parse(JSON.stringify(sets[sets.length - 1])) : { weight: 0, reps: 0, setType: 'normal', rpe: null };
  lastSet.setType = 'normal';
  sets.push(lastSet);
  // Aussi mettre à jour series si c'est le tableau utilisé
  if (!exo.allSets && exo.series) {
    exo.series.push({ weight: lastSet.weight || 0, reps: lastSet.reps || 0, date: _editSession.timestamp });
  }
  renderSessionEditor();
}

function seRemoveSet(exoIdx, setIdx) {
  var exo = _editSession.exercises[exoIdx];
  if (exo.allSets) exo.allSets.splice(setIdx, 1);
  if (exo.series) exo.series.splice(setIdx, 1);
  renderSessionEditor();
}

function seMoveExo(exoIdx, direction) {
  var target = exoIdx + direction;
  if (target < 0 || target >= _editSession.exercises.length) return;
  var exos = _editSession.exercises;
  var temp = exos[exoIdx];
  exos[exoIdx] = exos[target];
  exos[target] = temp;
  renderSessionEditor();
}

function seRemoveExo(exoIdx) {
  if (!confirm('Supprimer cet exercice ?')) return;
  _editSession.exercises.splice(exoIdx, 1);
  renderSessionEditor();
}

function seAddExercise() {
  var name = prompt('Nom de l\'exercice :');
  if (!name || !name.trim()) return;
  var newExo = {
    name: name.trim(),
    exoType: 'weight',
    sets: 0, maxRM: 0, maxReps: 0, maxTime: 0,
    totalReps: 0, distance: 0,
    repRecords: {},
    series: [{ weight: 0, reps: 0, date: _editSession.timestamp }],
    allSets: [{ weight: 0, reps: 0, setType: 'normal', rpe: null }],
    isCardio: false, isReps: false, isTime: false
  };
  _editSession.exercises.push(newExo);
  renderSessionEditor();
}

function seDeleteSession() {
  if (!confirm('Supprimer définitivement cette séance ?\nCette action est irréversible.')) return;
  db.logs = db.logs.filter(function(l) { return l.id !== _editSessionId; });
  saveDBNow();
  recalcBestPR();
  closeSessionEditor();
  renderSeancesTab();
  showToast('✓ Séance supprimée');
}

function saveSessionEdits() {
  if (!_editSession || !_editSessionId) return;

  // Lire les champs du formulaire
  var titleEl = document.getElementById('seTitle');
  var dateEl = document.getElementById('seDate');
  var timeEl = document.getElementById('seTime');
  var notesEl = document.getElementById('seNotes');

  if (titleEl) _editSession.title = titleEl.value.trim() || 'Séance';
  if (_editSession.name) _editSession.name = _editSession.title;
  if (notesEl) _editSession.notes = notesEl.value.trim();

  // Mettre à jour date/heure
  if (dateEl && timeEl) {
    var parts = dateEl.value.split('-');
    var timeParts = timeEl.value.split(':');
    if (parts.length === 3) {
      var newDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]),
                             parseInt(timeParts[0] || 12), parseInt(timeParts[1] || 0), 0);
      _editSession.timestamp = newDate.getTime();
      _editSession.date = newDate.toLocaleDateString('fr-FR');
      _editSession.shortDate = String(newDate.getDate()).padStart(2, '0') + '/' + String(newDate.getMonth() + 1).padStart(2, '0');
      _editSession.day = DAYS_FULL[newDate.getDay()];
    }
  }

  // Recalculer le volume et les stats pour chaque exercice
  var totalVolume = 0;
  _editSession.exercises.forEach(function(exo) {
    var sets = exo.allSets || [];
    exo.sets = 0;
    exo.maxRM = 0;
    exo.repRecords = {};
    exo.series = [];
    var ts = _editSession.timestamp;
    sets.forEach(function(s) {
      var w = s.weight || 0;
      var r = s.reps || 0;
      var st = s.setType || 'normal';
      var isWork = st !== 'warmup';

      exo.series.push({ weight: w, reps: r, date: ts });

      if (isWork) {
        exo.sets++;
        if (w > 0 && r > 0) {
          totalVolume += w * r;
          var rm = calcE1RM(w, r);
          if (rm > exo.maxRM) { exo.maxRM = rm; exo.maxRMDate = ts; }
          var rKey = String(r);
          if (!exo.repRecords[rKey] || w > exo.repRecords[rKey]) exo.repRecords[rKey] = w;
        }
      }
    });
  });
  _editSession.volume = totalVolume;
  _editSession.edited = true;
  _editSession.editedAt = Date.now();

  // Remplacer dans db.logs
  var idx = db.logs.findIndex(function(l) { return l.id === _editSessionId; });
  if (idx >= 0) {
    db.logs[idx] = _editSession;
  }

  saveDBNow();
  recalcBestPR();

  // Mettre à jour le feed social si possible
  try {
    if (typeof updateSessionActivity === 'function') {
      updateSessionActivity(_editSession);
    }
  } catch(e) {}

  closeSessionEditor();
  renderSeancesTab();
  showToast('✅ Séance modifiée');
}

// Mettre à jour un post social après modification
async function updateSessionActivity(session) {
  if (typeof supabase === 'undefined' || !supabase) return;
  try {
    var { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Trouver l'activité correspondante (même date + type session)
    var { data: activities } = await supabase
      .from('activities')
      .select('id, data')
      .eq('user_id', user.id)
      .eq('type', 'session')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!activities) return;
    var match = activities.find(function(a) {
      return a.data && a.data.title === session.title &&
             Math.abs((a.data.timestamp || 0) - session.timestamp) < 86400000;
    });
    if (!match) return;

    // Mettre à jour les données
    var newData = Object.assign({}, match.data, {
      title: session.title,
      volume: session.volume,
      exercise_count: session.exercises.length,
      exercises: session.exercises.map(function(e) {
        return { name: e.name, sets: e.sets, maxRM: e.maxRM, allSets: e.allSets || e.series || [] };
      }),
      edited: true
    });
    await supabase.from('activities').update({ data: newData }).eq('id', match.id);
  } catch(e) { console.warn('updateSessionActivity error:', e); }
}

// ── Supersets / Bisets / Trisets ──
function goToggleSuperset(exoIdx) {
  if (!activeWorkout || exoIdx >= activeWorkout.exercises.length - 1) return;
  var exo = activeWorkout.exercises[exoIdx];
  // Toggle : si déjà lié → défaire, sinon → lier
  if (exo.supersetWith === exoIdx + 1) {
    delete exo.supersetWith;
  } else {
    exo.supersetWith = exoIdx + 1;
  }
  goAutoSave();
  goRequestRender();
}

function goIsPartOfSuperset(exoIdx) {
  if (!activeWorkout) return false;
  // Est lié à l'exercice suivant ?
  var exo = activeWorkout.exercises[exoIdx];
  if (exo && exo.supersetWith !== undefined) return true;
  // Est la cible d'un lien ?
  for (var i = 0; i < activeWorkout.exercises.length; i++) {
    if (activeWorkout.exercises[i].supersetWith === exoIdx) return true;
  }
  return false;
}

function goGetSupersetColor(exoIdx) {
  // Trouver le premier exercice de la chaîne
  var colors = ['#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#ec4899'];
  var chainStart = exoIdx;
  for (var i = 0; i < exoIdx; i++) {
    if (activeWorkout.exercises[i].supersetWith === exoIdx ||
        (activeWorkout.exercises[i].supersetWith !== undefined && _isInSameChain(i, exoIdx))) {
      chainStart = i;
      break;
    }
  }
  return colors[chainStart % colors.length];
}

function _isInSameChain(startIdx, targetIdx) {
  var visited = {};
  var current = startIdx;
  while (current !== undefined && !visited[current]) {
    visited[current] = true;
    if (current === targetIdx) return true;
    current = activeWorkout.exercises[current] ? activeWorkout.exercises[current].supersetWith : undefined;
  }
  return false;
}

// ── Calculateur de plateaux ──
function goShowPlateCalc(exoIdx, setIdx) {
  var totalWeight = 0;
  if (activeWorkout && exoIdx >= 0) {
    var set = activeWorkout.exercises[exoIdx].sets[setIdx];
    if (set) totalWeight = set.weight || 0;
  }
  var barWeight = db.plateCalcBar || 20;
  var availablePlates = db.plateCalcPlates || [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'plateCalcOverlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var h = '<div class="modal-box" style="max-width:320px;text-align:left;">';
  h += '<div style="font-size:16px;font-weight:700;margin-bottom:12px;text-align:center;">🔢 Calculateur de plateaux</div>';
  h += '<div style="margin-bottom:12px;">';
  h += '<label style="font-size:11px;color:var(--sub);text-transform:uppercase;">Poids total (kg)</label>';
  h += '<input type="number" id="plateCalcWeight" value="' + totalWeight + '" step="0.5" style="font-size:20px;text-align:center;" oninput="updatePlateCalc()">';
  h += '</div>';
  h += '<div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;">';
  h += '<label style="font-size:11px;color:var(--sub);white-space:nowrap;">Barre :</label>';
  h += '<select id="plateCalcBarSelect" onchange="updatePlateCalc()" style="flex:1;margin:0;padding:8px;">';
  h += '<option value="20"' + (barWeight === 20 ? ' selected' : '') + '>Olympique (20kg)</option>';
  h += '<option value="15"' + (barWeight === 15 ? ' selected' : '') + '>Femme (15kg)</option>';
  h += '<option value="10"' + (barWeight === 10 ? ' selected' : '') + '>EZ (10kg)</option>';
  h += '<option value="7"' + (barWeight === 7 ? ' selected' : '') + '>EZ court (7kg)</option>';
  h += '</select></div>';
  h += '<div id="plateCalcResult" style="min-height:60px;"></div>';
  h += '<div class="modal-actions"><button onclick="document.getElementById(\'plateCalcOverlay\').remove()" style="background:var(--surface);color:var(--text);">Fermer</button></div>';
  h += '</div>';
  overlay.innerHTML = h;
  document.body.appendChild(overlay);
  updatePlateCalc();
}

function updatePlateCalc() {
  var weightInput = document.getElementById('plateCalcWeight');
  var barSelect = document.getElementById('plateCalcBarSelect');
  var result = document.getElementById('plateCalcResult');
  if (!weightInput || !result) return;

  var total = parseFloat(weightInput.value) || 0;
  var bar = parseFloat(barSelect ? barSelect.value : 20);
  var availablePlates = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];

  if (total <= bar) {
    result.innerHTML = '<div style="text-align:center;color:var(--sub);font-size:13px;padding:10px;">Barre seule (' + bar + 'kg)</div>';
    return;
  }

  var perSide = (total - bar) / 2;
  var plates = [];
  var remaining = perSide;
  availablePlates.forEach(function(p) {
    while (remaining >= p - 0.001) {
      plates.push(p);
      remaining -= p;
    }
  });

  if (Math.abs(remaining) > 0.01) {
    result.innerHTML = '<div style="text-align:center;color:var(--red);font-size:13px;padding:10px;">Impossible avec les disques disponibles</div>';
    return;
  }

  var h = '<div style="text-align:center;margin-bottom:8px;font-size:12px;color:var(--sub);">Chaque côté : <strong style="color:var(--text);">' + perSide + 'kg</strong></div>';
  h += '<div style="display:flex;justify-content:center;align-items:center;gap:3px;margin-bottom:8px;">';
  // Visual representation
  h += '<div style="width:6px;height:40px;background:var(--sub);border-radius:2px;"></div>'; // bar
  plates.forEach(function(p) {
    var height = Math.max(25, Math.min(50, p * 2));
    var colors = { 25: '#ef4444', 20: '#3b82f6', 15: '#f59e0b', 10: '#22c55e', 5: '#f0f0ff', 2.5: '#a855f7', 1.25: '#64748b', 0.5: '#94a3b8' };
    h += '<div style="width:' + (p >= 10 ? 14 : 10) + 'px;height:' + height + 'px;background:' + (colors[p] || '#666') + ';border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#000;font-weight:700;">' + p + '</div>';
  });
  h += '<div style="width:80px;height:6px;background:var(--sub);border-radius:2px;"></div>'; // bar middle
  // Mirror
  plates.slice().reverse().forEach(function(p) {
    var height = Math.max(25, Math.min(50, p * 2));
    var colors = { 25: '#ef4444', 20: '#3b82f6', 15: '#f59e0b', 10: '#22c55e', 5: '#f0f0ff', 2.5: '#a855f7', 1.25: '#64748b', 0.5: '#94a3b8' };
    h += '<div style="width:' + (p >= 10 ? 14 : 10) + 'px;height:' + height + 'px;background:' + (colors[p] || '#666') + ';border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#000;font-weight:700;">' + p + '</div>';
  });
  h += '<div style="width:6px;height:40px;background:var(--sub);border-radius:2px;"></div>';
  h += '</div>';
  // List
  var plateCounts = {};
  plates.forEach(function(p) { plateCounts[p] = (plateCounts[p] || 0) + 1; });
  h += '<div style="font-size:12px;color:var(--text);text-align:center;">';
  Object.keys(plateCounts).sort(function(a, b) { return b - a; }).forEach(function(p) {
    h += '<span style="margin:0 6px;">' + plateCounts[p] + '× ' + p + 'kg</span>';
  });
  h += '</div>';

  result.innerHTML = h;
}

function goEditRest(exoIdx) {
  var exo = activeWorkout.exercises[exoIdx];
  var items = [
    { icon: '⏱', label: '1 min', action: function() { exo.restSeconds = 60; goRequestRender(); } },
    { icon: '⏱', label: '1 min 30s', action: function() { exo.restSeconds = 90; goRequestRender(); } },
    { icon: '⏱', label: '2 min', action: function() { exo.restSeconds = 120; goRequestRender(); } },
    { icon: '⏱', label: '2 min 30s', action: function() { exo.restSeconds = 150; goRequestRender(); } },
    { icon: '⏱', label: '3 min', action: function() { exo.restSeconds = 180; goRequestRender(); } },
    { icon: '⏱', label: '4 min', action: function() { exo.restSeconds = 240; goRequestRender(); } },
    { icon: '⏱', label: '5 min', action: function() { exo.restSeconds = 300; goRequestRender(); } }
  ];
  goShowBottomSheet('Temps de repos', items);
}

// ── Démonstration exercice (plein écran, animation alternée) ──
function showExoDemo(exoId, exoName) {
  var data = exoId ? EXO_DATABASE[exoId] : null;
  // Chercher par nom si pas trouvé par id
  if (!data && exoName) {
    for (var k in EXO_DATABASE) {
      if (EXO_DATABASE[k].name === exoName) { data = EXO_DATABASE[k]; exoId = k; break; }
    }
  }

  var img0 = exoId ? getExoImageUrl(exoId, 0) : null;
  var img1 = exoId ? getExoImageUrl(exoId, 1) : null;

  var overlay = document.createElement('div');
  overlay.className = 'exo-demo-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var h = '';
  // Animation alternée des 2 images
  if (img0 && img1) {
    h += '<div class="exo-demo-anim">';
    h += '<img src="' + img0 + '" alt="Position départ">';
    h += '<img src="' + img1 + '" alt="Position fin">';
    h += '</div>';
  } else {
    h += '<div style="font-size:80px;margin-bottom:16px;">' + getExoPlaceholderIcon(exoName) + '</div>';
  }

  // Nom
  h += '<div style="font-size:18px;font-weight:700;color:white;text-align:center;margin-bottom:8px;">' + (exoName || 'Exercice') + '</div>';

  // Muscles
  if (data) {
    var muscles = '';
    if (data.primaryMuscles && data.primaryMuscles.length) {
      muscles += '<span style="color:var(--accent);font-weight:600;">' + data.primaryMuscles.join(', ') + '</span>';
    }
    if (data.secondaryMuscles && data.secondaryMuscles.length) {
      muscles += ' <span style="color:var(--sub);">· ' + data.secondaryMuscles.join(', ') + '</span>';
    }
    if (muscles) h += '<div style="font-size:12px;text-align:center;margin-bottom:12px;">' + muscles + '</div>';

    // Instructions
    if (data.instructions) {
      h += '<div style="max-width:340px;font-size:12px;color:rgba(255,255,255,0.7);line-height:1.7;text-align:left;white-space:pre-line;max-height:150px;overflow-y:auto;padding:10px;background:rgba(255,255,255,0.05);border-radius:10px;">' + data.instructions + '</div>';
    }
  }

  // Bouton fermer
  h += '<button onclick="this.closest(\'.exo-demo-overlay\').remove()" style="margin-top:16px;padding:12px 32px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:white;font-size:14px;font-weight:600;cursor:pointer;">Fermer</button>';

  overlay.innerHTML = h;
  document.body.appendChild(overlay);
}

function goShowInstructions(exoIdx) {
  var exo = activeWorkout.exercises[exoIdx];
  var data = exo.exoId ? EXO_DATABASE[exo.exoId] : null;
  // Also check custom exercises
  if (!data && db.customExercises) {
    for (var i = 0; i < db.customExercises.length; i++) {
      if (db.customExercises[i].id === exo.exoId || matchExoName(db.customExercises[i].name, exo.name)) {
        data = db.customExercises[i]; break;
      }
    }
  }
  if (!data || !data.instructions) { showToast('Pas d\'instructions disponibles'); return; }
  var body = '<div style="font-size:13px;color:var(--text);line-height:1.8;white-space:pre-line;padding:0 4px;">' + data.instructions + '</div>';
  // Difficulty
  if (data.difficulty) {
    var stars = '';
    for (var d = 1; d <= 5; d++) stars += d <= data.difficulty ? '★' : '☆';
    var diffLabels = ['','Très facile','Facile','Moyen','Difficile','Expert'];
    body += '<div style="margin-top:10px;font-size:12px;color:var(--sub);">Difficulté : <span style="color:var(--orange);">' + stars + '</span> ' + (diffLabels[data.difficulty]||'') + '</div>';
  }
  // Tips
  if (data.tips) {
    body += '<div style="background:rgba(255,159,10,0.1);border-radius:10px;padding:10px 12px;margin-top:12px;">';
    body += '<div style="font-size:11px;font-weight:700;color:var(--orange);margin-bottom:4px;">💡 Conseil</div>';
    body += '<div style="font-size:12px;color:var(--text);line-height:1.5;">' + data.tips + '</div></div>';
  }
  // Progression chain
  if (data.progressions && data.progressions.length > 1) {
    var currentIdx = data.progressions.indexOf(data.id);
    body += '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">';
    body += '<div style="font-size:11px;font-weight:700;color:var(--purple);margin-bottom:6px;">📈 Chaîne de progression</div>';
    body += '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">';
    data.progressions.forEach(function(progId, idx) {
      var progExo = EXO_DATABASE[progId];
      var progName = progExo ? progExo.name.replace(/\s*\(.*\)/, '').split(' ').slice(0,3).join(' ') : progId;
      var isCurrent = idx === currentIdx;
      var isPast = idx < currentIdx;
      var style = isCurrent ? 'background:var(--blue);color:white;font-weight:700;' : isPast ? 'background:rgba(50,215,75,0.15);color:var(--green);' : 'background:var(--surface);color:var(--sub);';
      body += '<span style="padding:3px 8px;border-radius:6px;font-size:10px;' + style + '">' + (isPast ? '✓ ' : '') + progName + '</span>';
      if (idx < data.progressions.length - 1) body += '<span style="color:var(--sub);font-size:10px;">→</span>';
    });
    body += '</div></div>';
  }
  var overlay = document.createElement('div');
  overlay.className = 'go-bottom-sheet';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="go-sheet-box">' +
    '<div class="go-sheet-handle"></div>' +
    '<div class="go-sheet-title">📖 ' + exo.name + '</div>' +
    body +
    '<button class="go-btn-sec" style="margin-top:16px;" onclick="this.closest(\'.go-bottom-sheet\').remove()">Fermer</button>' +
    '</div>';
  document.body.appendChild(overlay);
}

// ============================================================
// GO TAB — Bottom Sheets
// ============================================================
function goShowBottomSheet(title, items) {
  var overlay = document.createElement('div');
  overlay.className = 'go-bottom-sheet';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  var h = '<div class="go-sheet-box"><div class="go-sheet-handle"></div>';
  h += '<div class="go-sheet-title">' + title + '</div>';
  items.forEach(function(item, i) {
    var cls = item.danger ? ' danger' : '';
    h += '<div class="go-sheet-item' + cls + '" data-idx="' + i + '">';
    h += '<span class="sheet-icon">' + (item.icon || '') + '</span> ' + item.label;
    h += '</div>';
  });
  h += '</div>';
  overlay.innerHTML = h;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.go-sheet-item').forEach(function(el) {
    el.onclick = function() {
      var idx = parseInt(el.getAttribute('data-idx'));
      overlay.remove();
      if (items[idx] && items[idx].action) items[idx].action();
    };
  });
}

function goShowExoMenu(exoIdx) {
  goShowBottomSheet(activeWorkout.exercises[exoIdx].name, [
    { icon: '🔄', label: 'Remplacer l\'exercice', action: function() { goReplaceExercise(exoIdx); } },
    { icon: '↕️', label: 'Déplacer vers le haut', action: function() {
      if (exoIdx > 0) { var tmp = activeWorkout.exercises[exoIdx]; activeWorkout.exercises[exoIdx] = activeWorkout.exercises[exoIdx-1]; activeWorkout.exercises[exoIdx-1] = tmp; goRequestRender(); }
    }},
    { icon: '↕️', label: 'Déplacer vers le bas', action: function() {
      if (exoIdx < activeWorkout.exercises.length - 1) { var tmp = activeWorkout.exercises[exoIdx]; activeWorkout.exercises[exoIdx] = activeWorkout.exercises[exoIdx+1]; activeWorkout.exercises[exoIdx+1] = tmp; goRequestRender(); }
    }},
    { icon: '✕', label: 'Retirer l\'exercice', danger: true, action: function() {
      activeWorkout.exercises.splice(exoIdx, 1);
      goAutoSave();
      goUpdateCounters();
      goRequestRender();
    }}
  ]);
}

function goReplaceExercise(exoIdx) {
  // Open search, but when selected, replace instead of add
  window._goReplaceIdx = exoIdx;
  goOpenSearch();
}

function goShowSetTypeSheet(exoIdx, setIdx) {
  goShowBottomSheet('Type de série', [
    { icon: 'W', label: 'Série d\'Échauffement', action: function() { activeWorkout.exercises[exoIdx].sets[setIdx].type = 'warmup'; goRequestRender(); } },
    { icon: '#', label: 'Série Normale', action: function() { activeWorkout.exercises[exoIdx].sets[setIdx].type = 'normal'; goRequestRender(); } },
    { icon: 'F', label: 'Série Ratée', action: function() { activeWorkout.exercises[exoIdx].sets[setIdx].type = 'failure'; goRequestRender(); } },
    { icon: 'D', label: 'Série Drop', action: function() { activeWorkout.exercises[exoIdx].sets[setIdx].type = 'drop'; goRequestRender(); } },
    { icon: '✕', label: 'Retirer la série', danger: true, action: function() { goRemoveSet(exoIdx, setIdx); } }
  ]);
}

// ============================================================
// GO TAB — Exercise Search Overlay
// ============================================================
var _goSearchFilters = { equip: '', muscle: '', diff: '', type: '' };
var _goMuscleMap = {
  'Pecs': ['Pecs','Pecs (haut)','Pecs (bas)'],
  'Dos': ['Grand dorsal','Haut du dos','Trapèzes','Lombaires'],
  'Épaules': ['Épaules','Épaules (antérieur)','Épaules (latéral)','Épaules (postérieur)'],
  'Jambes': ['Quadriceps','Ischio-jambiers','Fessiers','Mollets','Adducteurs','Abducteurs'],
  'Bras': ['Biceps','Triceps','Avant-bras'],
  'Abdos': ['Abdos (frontal)','Obliques'],
  'Cardio': ['Cardio']
};

function goOpenSearch() {
  _goSearchFilters = { equip: '', muscle: '', diff: '', type: '' };
  var overlay = document.createElement('div');
  overlay.className = 'go-search-overlay';
  overlay.id = 'goSearchOverlay';

  var h = '<div class="go-search-header">';
  h += '<button class="go-search-back" onclick="goCloseSearch()">← Retour</button>';
  h += '<input class="go-search-input" id="goSearchInput" type="text" placeholder="🔍 Rechercher un exercice..." autofocus>';
  h += '</div>';
  // Muscle filter
  h += '<div class="go-filter-section"><div class="go-filter-label">Muscle</div><div class="go-search-filters">';
  ['Tout','Pecs','Dos','Épaules','Jambes','Bras','Abdos','Cardio'].forEach(function(m) {
    h += '<span class="go-search-chip' + (m === 'Tout' ? ' active' : '') + '" data-filter="muscle" data-val="' + (m === 'Tout' ? '' : m) + '" onclick="goSetFilter(this)">' + m + '</span>';
  });
  h += '</div></div>';
  // Equipment filter
  h += '<div class="go-filter-section"><div class="go-filter-label">Matériel</div><div class="go-search-filters">';
  [['Tout',''],['Barre','barbell'],['Haltères','dumbbell'],['Machine','machine'],['Câble','cable'],['Corps','bodyweight'],['Autre','other']].forEach(function(m) {
    h += '<span class="go-search-chip' + (m[0] === 'Tout' ? ' active' : '') + '" data-filter="equip" data-val="' + m[1] + '" onclick="goSetFilter(this)">' + m[0] + '</span>';
  });
  h += '</div></div>';
  // Difficulty filter
  h += '<div class="go-filter-section"><div class="go-filter-label">Difficulté</div><div class="go-search-filters">';
  [['Tout',''],['★ Facile','1-2'],['★★★ Moyen','3'],['★★★★ Dur','4-5']].forEach(function(m) {
    h += '<span class="go-search-chip' + (m[0] === 'Tout' ? ' active' : '') + '" data-filter="diff" data-val="' + m[1] + '" onclick="goSetFilter(this)">' + m[0] + '</span>';
  });
  h += '</div></div>';
  h += '<div class="go-search-results" id="goSearchResults"></div>';
  overlay.innerHTML = h;
  document.body.appendChild(overlay);
  goRenderSearchResults('', _goSearchFilters);
  document.getElementById('goSearchInput').addEventListener('input', function() {
    var q = this.value;
    if (_goSearchDebounce) clearTimeout(_goSearchDebounce);
    _goSearchDebounce = setTimeout(function() { goRenderSearchResults(q, _goSearchFilters); }, 200);
  });
}

function goCloseSearch() {
  var el = document.getElementById('goSearchOverlay');
  if (el) el.remove();
  window._goReplaceIdx = undefined;
}

function goSetFilter(chip) {
  var filterType = chip.getAttribute('data-filter');
  var val = chip.getAttribute('data-val');
  _goSearchFilters[filterType] = val;
  chip.parentElement.querySelectorAll('.go-search-chip').forEach(function(c) { c.classList.remove('active'); });
  chip.classList.add('active');
  var q = document.getElementById('goSearchInput') ? document.getElementById('goSearchInput').value : '';
  goRenderSearchResults(q, _goSearchFilters);
}


function _goNormalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'");
}

// Fuzzy matching — tolérance aux fautes de frappe
function _fuzzyMatch(needle, haystack) {
  if (!needle || !haystack) return 0;
  if (haystack.indexOf(needle) >= 0) return 100; // Exact substring = score max
  // Score par distance de Levenshtein partielle (mots)
  var needleWords = needle.split(/\s+/);
  var haystackWords = haystack.split(/\s+/);
  var totalScore = 0;
  var matched = 0;
  for (var i = 0; i < needleWords.length; i++) {
    var nw = needleWords[i];
    if (nw.length < 2) continue;
    var bestWordScore = 0;
    for (var j = 0; j < haystackWords.length; j++) {
      var hw = haystackWords[j];
      // Exact word prefix match
      if (hw.indexOf(nw) === 0) { bestWordScore = Math.max(bestWordScore, 90); continue; }
      // Substring match
      if (hw.indexOf(nw) >= 0) { bestWordScore = Math.max(bestWordScore, 80); continue; }
      // Fuzzy: Levenshtein distance tolerance (max 2 edits for words >= 4 chars)
      if (nw.length >= 4) {
        var dist = _levenshtein(nw, hw.substring(0, Math.max(nw.length + 2, hw.length)));
        var maxDist = nw.length <= 5 ? 1 : 2;
        if (dist <= maxDist) { bestWordScore = Math.max(bestWordScore, 70 - dist * 10); }
      }
    }
    if (bestWordScore > 0) { totalScore += bestWordScore; matched++; }
  }
  if (needleWords.length === 0) return 0;
  return matched === needleWords.length ? Math.round(totalScore / needleWords.length) : (matched > 0 ? Math.round(totalScore / needleWords.length * 0.5) : 0);
}

function _levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  var matrix = [];
  for (var i = 0; i <= b.length; i++) matrix[i] = [i];
  for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (var i = 1; i <= b.length; i++) {
    for (var j = 1; j <= a.length; j++) {
      var cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[b.length][a.length];
}

// Pre-computed search index for EXO_DATABASE
var _exoSearchIndex = null;

function buildExoSearchIndex() {
  _exoSearchIndex = [];
  var keys = Object.keys(EXO_DATABASE);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var e = EXO_DATABASE[k];
    var searchText = _goNormalize(e.name);
    if (e.nameAlt) {
      for (var j = 0; j < e.nameAlt.length; j++) { searchText += ' ' + _goNormalize(e.nameAlt[j]); }
    }
    var muscleStr = '';
    if (e.primaryMuscles) {
      for (var j = 0; j < e.primaryMuscles.length; j++) { muscleStr += ' ' + _goNormalize(e.primaryMuscles[j]); }
    }
    _exoSearchIndex.push({
      id: k,
      data: e,
      searchText: searchText,
      muscleSearchText: muscleStr,
      equipment: e.equipment,
      difficulty: e.difficulty || 2,
      primaryMuscles: e.primaryMuscles || []
    });
  }
}

function goRenderSearchResults(query, filters) {
  // Support legacy string equipFilter or new filters object
  var equipFilter = typeof filters === 'string' ? filters : (filters ? filters.equip : '');
  var muscleFilter = (filters && typeof filters === 'object') ? filters.muscle : '';
  var diffFilter = (filters && typeof filters === 'object') ? filters.diff : '';
  var typeFilter = (filters && typeof filters === 'object') ? filters.type : '';
  var container = document.getElementById('goSearchResults');
  if (!container) return;
  var q = _goNormalize(query.trim());
  var allE1RMs = getAllBestE1RMs();
  var results = [];
  var targetMuscles = (muscleFilter && _goMuscleMap[muscleFilter]) ? _goMuscleMap[muscleFilter] : null;

  // Build index on first use
  if (!_exoSearchIndex) buildExoSearchIndex();

  // Search using pre-computed index
  for (var i = 0; i < _exoSearchIndex.length; i++) {
    var entry = _exoSearchIndex[i];
    if (equipFilter && entry.equipment !== equipFilter) continue;
    // Muscle filter
    if (targetMuscles) {
      var hasMuscle = false;
      for (var j = 0; j < entry.primaryMuscles.length; j++) {
        if (targetMuscles.indexOf(entry.primaryMuscles[j]) >= 0) { hasMuscle = true; break; }
      }
      if (!hasMuscle) continue;
    }
    // Difficulty filter
    if (diffFilter) {
      var d = entry.difficulty;
      if (diffFilter === '1-2' && d > 2) continue;
      if (diffFilter === '3' && d !== 3) continue;
      if (diffFilter === '4-5' && d < 4) continue;
    }
    // Text search — fuzzy matching
    if (q) {
      // 1. Exact substring match (original logic)
      var exactMatch = entry.searchText.indexOf(q) >= 0;
      if (!exactMatch) {
        var qWords = q.split(/\s+/);
        exactMatch = qWords.every(function(w) { return entry.searchText.indexOf(w) >= 0; });
      }
      if (!exactMatch) {
        exactMatch = q.split(/\s+/).every(function(w) { return entry.muscleSearchText.indexOf(w) >= 0; });
      }
      // 2. Fuzzy match si pas de match exact
      var fuzzyScore = 0;
      if (!exactMatch) {
        fuzzyScore = _fuzzyMatch(q, entry.searchText);
        if (fuzzyScore < 50) fuzzyScore = Math.max(fuzzyScore, _fuzzyMatch(q, entry.muscleSearchText));
        if (fuzzyScore < 50) continue;
      }
      entry._searchScore = exactMatch ? 100 : fuzzyScore;
    } else {
      entry._searchScore = 50;
    }
    results.push(entry.data);
    entry.data._searchScore = entry._searchScore;
  }

  // Search custom exercises
  (db.customExercises || []).forEach(function(e) {
    if (equipFilter && e.equipment !== equipFilter) return;
    if (q) {
      var nameN = _goNormalize(e.name);
      if (nameN.indexOf(q) < 0) return;
    }
    results.push(e);
  });

  var h = '';

  // Sort: search score first, then history, then difficulty
  results.sort(function(a, b) {
    var aScore = a._searchScore || 50;
    var bScore = b._searchScore || 50;
    if (bScore !== aScore) return bScore - aScore;
    var aE1 = allE1RMs[a.name] ? 1 : 0;
    var bE1 = allE1RMs[b.name] ? 1 : 0;
    if (bE1 !== aE1) return bE1 - aE1;
    return (a.difficulty || 2) - (b.difficulty || 2);
  });

  // Counter
  var hasFilters = equipFilter || muscleFilter || diffFilter || q;
  if (hasFilters) h += '<div style="font-size:11px;color:var(--sub);padding:4px 16px;">' + results.length + ' exercice' + (results.length > 1 ? 's' : '') + ' trouvé' + (results.length > 1 ? 's' : '') + '</div>';

  // If no query, show recent exercises first
  if (!q && !equipFilter && !muscleFilter && !diffFilter) {
    var recents = _goGetRecentExercises(5);
    if (recents.length) {
      h += '<div class="go-search-section">Récents</div>';
      recents.forEach(function(name) {
        var ms = _ecMuscleStyle(name);
        var e1rm = allE1RMs[name] ? allE1RMs[name].e1rm : 0;
        // Chercher l'id pour l'image
        var _rExoId = null;
        for (var _rk in EXO_DATABASE) { if (EXO_DATABASE[_rk].name === name) { _rExoId = _rk; break; } }
        var _rImgUrl = _rExoId ? getExoImageUrl(_rExoId, 0) : null;
        h += '<div class="go-search-item" onclick="goSelectSearchResult(\'' + name.replace(/'/g, "\\'") + '\',\'' + (_rExoId || '') + '\')">';
        if (_rImgUrl) {
          h += '<div class="go-search-item-icon" style="padding:0;"><img src="' + _rImgUrl + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentNode.style.background=\'' + ms.bg + '\';this.parentNode.innerHTML=\'' + ms.icon + '\';"></div>';
        } else {
          h += '<div class="go-search-item-icon" style="background:' + ms.bg + ';">' + ms.icon + '</div>';
        }
        h += '<div class="go-search-item-info"><div class="go-search-item-name">' + name + '</div>';
        h += '<div class="go-search-item-sub">Récent</div></div>';
        if (e1rm > 0) h += '<div class="go-search-item-e1rm">' + Math.round(e1rm) + 'kg</div>';
        h += '</div>';
      });
      h += '<div class="go-search-section">Tous les exercices</div>';
    }
  }

  // Render results
  if (results.length === 0 && q) {
    h += '<div style="text-align:center;padding:40px 0;color:var(--sub);">Aucun résultat pour "' + query + '"</div>';
  }
  results.forEach(function(e) {
    var ms = _ecMuscleStyle(e.name);
    var equipLabels = { barbell: 'Barre', dumbbell: 'Haltères', machine: 'Machine', cable: 'Câble', bodyweight: 'Corps', other: 'Autre' };
    var catLabels = { compound: 'Composé', isolation: 'Isolation', cardio: 'Cardio', stretch: 'Étirement' };
    var diffStars = '';
    if (e.difficulty) { for (var ds = 1; ds <= e.difficulty; ds++) diffStars += '★'; }
    var sub = (equipLabels[e.equipment] || '') + ' · ' + (ms.tag || '') + (diffStars ? ' · ' + diffStars : '');
    var e1rm = allE1RMs[e.name] ? allE1RMs[e.name].e1rm : 0;
    var _sImgUrl = e.id ? getExoImageUrl(e.id, 0) : null;
    h += '<div class="go-search-item" onclick="goSelectSearchResult(\'' + e.name.replace(/'/g, "\\'") + '\',\'' + (e.id || '') + '\')">';
    if (_sImgUrl) {
      h += '<div class="go-search-item-icon" style="padding:0;overflow:hidden;border-radius:10px;"><img src="' + _sImgUrl + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentNode.style.background=\'' + ms.bg + '\';this.parentNode.innerHTML=\'' + ms.icon + '\';"></div>';
    } else {
      h += '<div class="go-search-item-icon" style="background:' + ms.bg + ';">' + ms.icon + '</div>';
    }
    h += '<div class="go-search-item-info"><div class="go-search-item-name">' + e.name + '</div>';
    h += '<div class="go-search-item-sub">' + sub + '</div></div>';
    if (e1rm > 0) h += '<div class="go-search-item-e1rm">' + Math.round(e1rm) + 'kg</div>';
    h += '</div>';
  });

  // Create custom exercise link
  h += '<div class="go-search-create" onclick="goCloseSearch();goOpenWizard();">➕ Créer un exercice personnalisé</div>';

  container.innerHTML = h;
}

function _goGetRecentExercises(limit) {
  var seen = {};
  var recents = [];
  for (var i = db.logs.length - 1; i >= 0 && recents.length < limit; i--) {
    var ses = db.logs[i];
    for (var j = 0; j < (ses.exercises || []).length && recents.length < limit; j++) {
      var name = ses.exercises[j].name;
      if (!seen[name]) { seen[name] = true; recents.push(name); }
    }
  }
  return recents;
}

function goSelectSearchResult(name, exoId) {
  goCloseSearch();
  if (typeof window._goReplaceIdx === 'number') {
    // Replace mode
    var idx = window._goReplaceIdx;
    window._goReplaceIdx = undefined;
    activeWorkout.exercises[idx].name = name;
    activeWorkout.exercises[idx].exoId = exoId || null;
    activeWorkout.exercises[idx].restSeconds = goGetDefaultRest(name, exoId);
    activeWorkout.exercises[idx].sets = [];
  } else {
    // Add mode
    activeWorkout.exercises.push({
      exoId: exoId || null,
      name: name,
      sets: [],
      restSeconds: goGetDefaultRest(name, exoId),
      notes: ''
    });
    // Difficulty warning for beginners
    var _exoData = exoId ? EXO_DATABASE[exoId] : null;
    if (_exoData && _exoData.difficulty >= 4 && (db.user.level || 'intermediaire') === 'debutant') {
      var alts = (_exoData.alternatives || []).map(function(altId) { var a = EXO_DATABASE[altId]; return a ? a.name : null; }).filter(Boolean);
      var msg = '⚠️ ' + _exoData.name + ' est un exercice avancé (difficulté ' + _exoData.difficulty + '/5).';
      if (_exoData.tips) msg += '\n\n💡 ' + _exoData.tips;
      if (alts.length) msg += '\n\nAlternatives : ' + alts.join(', ');
      msg += '\n\nContinuer quand même ?';
      if (!confirm(msg)) { activeWorkout.exercises.pop(); return; }
    }
  }
  goAutoSave();
  goRequestRender();
}

// ============================================================
// GO TAB — Custom Exercise Wizard
// ============================================================
function goOpenWizard() {
  var overlay = document.createElement('div');
  overlay.className = 'go-search-overlay';
  overlay.id = 'goWizardOverlay';

  var muscleList = ['Quadriceps','Ischio-jambiers','Fessiers','Pecs','Grand dorsal','Trapèzes','Épaules','Biceps','Triceps','Abdos (frontal)','Obliques','Lombaires','Mollets','Avant-bras'];
  var equipOpts = [
    { val: 'barbell', icon: '🏋️', label: 'Barre' },
    { val: 'dumbbell', icon: '💪', label: 'Haltères' },
    { val: 'machine', icon: '⚙️', label: 'Machine' },
    { val: 'cable', icon: '🔗', label: 'Câble' },
    { val: 'bodyweight', icon: '🤸', label: 'Corps' },
    { val: 'other', icon: '📦', label: 'Autre' }
  ];
  var trackOpts = [
    { val: 'weight', icon: '🏋️', label: 'Poids × Réps' },
    { val: 'reps', icon: '🔢', label: 'Réps seules' },
    { val: 'time', icon: '⏱', label: 'Durée' },
    { val: 'cardio', icon: '🏃', label: 'Cardio' }
  ];

  // State
  window._wizState = { step: 1, name: '', equipment: '', trackingType: 'weight', primaryMuscle: '', secondaryMuscles: [], tertiaryMuscles: [], instructions: '' };

  var h = '<div class="go-search-header">';
  h += '<button class="go-search-back" onclick="document.getElementById(\'goWizardOverlay\').remove()">← Retour</button>';
  h += '<span style="font-size:15px;font-weight:700;">Créer un exercice</span>';
  h += '<span></span></div>';
  h += '<div class="go-wizard" id="goWizardContent"></div>';
  overlay.innerHTML = h;
  document.body.appendChild(overlay);
  goRenderWizardStep();
}

function goRenderWizardStep() {
  var ws = window._wizState;
  var container = document.getElementById('goWizardContent');
  if (!container) return;
  var muscleList = ['Quadriceps','Ischio-jambiers','Fessiers','Pecs','Grand dorsal','Trapèzes','Épaules','Biceps','Triceps','Abdos (frontal)','Obliques','Lombaires','Mollets','Avant-bras'];
  var h = '';

  if (ws.step === 1) {
    h += '<div class="go-wizard-step active">';
    h += '<div class="go-wizard-title">Étape 1/3</div>';
    h += '<div class="go-wizard-sub">Informations de base</div>';
    h += '<div class="go-wizard-label">Nom de l\'exercice</div>';
    h += '<input type="text" id="wizName" value="' + ws.name.replace(/"/g, '&quot;') + '" placeholder="Ex: Curl araignée" style="margin-bottom:16px;">';
    h += '<div class="go-wizard-label">Matériel</div>';
    h += '<div class="go-wizard-grid">';
    var equipOpts = [{val:'barbell',icon:'🏋️',label:'Barre'},{val:'dumbbell',icon:'💪',label:'Haltères'},{val:'machine',icon:'⚙️',label:'Machine'},{val:'cable',icon:'🔗',label:'Câble'},{val:'bodyweight',icon:'🤸',label:'Corps'},{val:'other',icon:'📦',label:'Autre'}];
    equipOpts.forEach(function(o) {
      var sel = ws.equipment === o.val ? ' selected' : '';
      h += '<div class="go-wizard-opt' + sel + '" onclick="window._wizState.equipment=\'' + o.val + '\';goRenderWizardStep();"><div class="wiz-icon">' + o.icon + '</div>' + o.label + '</div>';
    });
    h += '</div>';
    h += '<div class="go-wizard-label">Type de comptage</div>';
    h += '<div class="go-wizard-grid col2">';
    var trackOpts = [{val:'weight',icon:'🏋️',label:'Poids × Réps'},{val:'reps',icon:'🔢',label:'Réps seules'},{val:'time',icon:'⏱',label:'Durée'},{val:'cardio',icon:'🏃',label:'Cardio'}];
    trackOpts.forEach(function(o) {
      var sel = ws.trackingType === o.val ? ' selected' : '';
      h += '<div class="go-wizard-opt' + sel + '" onclick="window._wizState.trackingType=\'' + o.val + '\';goRenderWizardStep();"><div class="wiz-icon">' + o.icon + '</div>' + o.label + '</div>';
    });
    h += '</div>';
    h += '<button class="go-wizard-next" onclick="goWizardNext()">Continuer →</button>';
    h += '</div>';
  } else if (ws.step === 2) {
    h += '<div class="go-wizard-step active">';
    h += '<div class="go-wizard-title">Étape 2/3</div>';
    h += '<div class="go-wizard-sub">Muscles ciblés</div>';
    h += '<div class="go-wizard-label">Muscle principal</div>';
    h += '<div class="go-wizard-muscles">';
    muscleList.forEach(function(m) {
      var sel = ws.primaryMuscle === m ? ' selected' : '';
      h += '<span class="go-wizard-muscle' + sel + '" onclick="window._wizState.primaryMuscle=\'' + m + '\';goRenderWizardStep();">' + m + '</span>';
    });
    h += '</div>';
    h += '<div class="go-wizard-label">Muscles secondaires</div>';
    h += '<div class="go-wizard-muscles">';
    muscleList.forEach(function(m) {
      if (m === ws.primaryMuscle) return;
      var sel = ws.secondaryMuscles.indexOf(m) >= 0 ? ' selected' : '';
      h += '<span class="go-wizard-muscle' + sel + '" onclick="goWizardToggleMuscle(\'secondaryMuscles\',\'' + m + '\')">' + m + '</span>';
    });
    h += '</div>';
    h += '<div class="go-wizard-label">Muscles tertiaires (stabilisateurs)</div>';
    h += '<div class="go-wizard-muscles">';
    muscleList.forEach(function(m) {
      if (m === ws.primaryMuscle || ws.secondaryMuscles.indexOf(m) >= 0) return;
      var sel = ws.tertiaryMuscles.indexOf(m) >= 0 ? ' selected' : '';
      h += '<span class="go-wizard-muscle' + sel + '" onclick="goWizardToggleMuscle(\'tertiaryMuscles\',\'' + m + '\')">' + m + '</span>';
    });
    h += '</div>';
    h += '<button class="go-wizard-next" onclick="goWizardNext()">Continuer →</button>';
    h += '</div>';
  } else if (ws.step === 3) {
    h += '<div class="go-wizard-step active">';
    h += '<div class="go-wizard-title">Étape 3/3</div>';
    h += '<div class="go-wizard-sub">Instructions d\'exécution</div>';
    h += '<textarea id="wizInstructions" rows="6" placeholder="1. Position de départ : pieds largeur d\'épaules...\n2. Descente : fléchir les genoux...\n3. Remontée : pousser sur les talons..." style="min-height:140px;font-size:14px;">' + ws.instructions + '</textarea>';
    h += '<button class="go-wizard-next" style="background:var(--green);" onclick="goWizardCreate()">✓ Créer l\'exercice</button>';
    h += '</div>';
  }

  container.innerHTML = h;
}

function goWizardNext() {
  var ws = window._wizState;
  if (ws.step === 1) {
    var nameInput = document.getElementById('wizName');
    ws.name = nameInput ? nameInput.value.trim() : '';
    if (!ws.name) { showToast('Donne un nom à l\'exercice'); return; }
    if (!ws.equipment) { showToast('Choisis un matériel'); return; }
    ws.step = 2;
  } else if (ws.step === 2) {
    if (!ws.primaryMuscle) { showToast('Choisis un muscle principal'); return; }
    ws.step = 3;
  }
  goRenderWizardStep();
}

function goWizardToggleMuscle(field, muscle) {
  var arr = window._wizState[field];
  var idx = arr.indexOf(muscle);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(muscle);
  goRenderWizardStep();
}

function goWizardCreate() {
  var ws = window._wizState;
  var instrEl = document.getElementById('wizInstructions');
  ws.instructions = instrEl ? instrEl.value.trim() : '';

  var exo = {
    id: 'custom_' + generateId(),
    name: ws.name,
    nameAlt: [],
    equipment: ws.equipment,
    category: ws.trackingType === 'cardio' ? 'cardio' : 'compound',
    trackingType: ws.trackingType,
    primaryMuscles: [ws.primaryMuscle],
    secondaryMuscles: ws.secondaryMuscles.slice(),
    tertiaryMuscles: ws.tertiaryMuscles.slice(),
    defaultRest: ws.trackingType === 'cardio' ? 300 : 90,
    instructions: ws.instructions,
    createdAt: Date.now()
  };

  if (!db.customExercises) db.customExercises = [];
  db.customExercises.push(exo);
  _matchCacheInvalidate();
  _exoSearchIndex = null;
  saveDB();

  // Close wizard
  var el = document.getElementById('goWizardOverlay');
  if (el) el.remove();

  // Add to active workout if exists
  if (activeWorkout) {
    activeWorkout.exercises.push({
      exoId: exo.id,
      name: exo.name,
      sets: [],
      restSeconds: exo.defaultRest,
      notes: ''
    });
    goAutoSave();
    goRequestRender();
  }

  showToast('Exercice "' + exo.name + '" créé');
}

// ============================================================
// GO TAB — Muscle Distribution
// ============================================================
function renderGoMuscleDistribution() {
  if (!activeWorkout) return '';
  var muscleVolume = {};
  var muscleDetails = {}; // { parentGroup: { subMuscle: { sets, exercises:[] } } }

  activeWorkout.exercises.forEach(function(exo) {
    var completedSets = exo.sets.filter(function(s) { return s.completed; }).length;
    if (completedSets === 0) return;
    var contribs = getMuscleContributions(exo.name);
    contribs.forEach(function(c) {
      var parent = getMuscleGroupParent(c.muscle);
      var weighted = Math.round(completedSets * c.coeff * 2) / 2; // round to 0.5
      if (!muscleVolume[parent]) muscleVolume[parent] = 0;
      muscleVolume[parent] += weighted;
      if (!muscleDetails[parent]) muscleDetails[parent] = {};
      if (!muscleDetails[parent][c.muscle]) muscleDetails[parent][c.muscle] = { sets: 0, exercises: [], coeff: c.coeff };
      muscleDetails[parent][c.muscle].sets += weighted;
      if (muscleDetails[parent][c.muscle].exercises.indexOf(exo.name) < 0) {
        muscleDetails[parent][c.muscle].exercises.push(exo.name);
      }
    });
  });

  // Sort by volume
  var sorted = Object.keys(muscleVolume).sort(function(a, b) { return muscleVolume[b] - muscleVolume[a]; });
  if (sorted.length === 0) return '<div class="go-muscles-card"><div class="go-muscles-title">Répartition musculaire</div><div style="text-align:center;color:var(--sub);font-size:13px;padding:16px;">Valide des séries pour voir la répartition</div></div>';

  var maxVol = muscleVolume[sorted[0]] || 1;
  var colors = { 'Jambes':'var(--green)', 'Pecs':'var(--blue)', 'Dos':'var(--orange)', 'Épaules':'var(--purple)', 'Bras':'var(--teal)', 'Abdos':'var(--red)', 'Cardio':'var(--orange)' };

  var h = '<div class="go-muscles-card">';
  h += '<div class="go-muscles-title">Répartition musculaire</div>';

  sorted.forEach(function(group) {
    var vol = muscleVolume[group];
    var pct = Math.round((vol / maxVol) * 100);
    var color = colors[group] || 'var(--sub)';

    h += '<div class="go-muscle-row">';
    h += '<div class="go-muscle-dot" style="background:' + color + ';"></div>';
    h += '<div class="go-muscle-name">' + group + '</div>';
    h += '<div class="go-muscle-bar-bg"><div class="go-muscle-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>';
    h += '<div class="go-muscle-sets">' + vol + ' sér.</div>';
    h += '</div>';

    // Sub-muscles
    var subs = muscleDetails[group];
    if (subs) {
      h += '<div class="go-muscle-subs">';
      Object.keys(subs).forEach(function(sub) {
        var d = subs[sub];
        var coeffLabel = d.coeff >= 1 ? '1re' : d.coeff >= 0.5 ? '2nd' : '3re';
        var badgeClass = d.coeff >= 1 ? 'primary' : d.coeff >= 0.5 ? 'secondary' : 'tertiary';
        h += '<div class="go-muscle-sub-row">';
        h += '<span class="go-muscle-sub-badge ' + badgeClass + '">' + coeffLabel + '</span>';
        h += sub + ' · via ' + d.exercises.join(', ');
        h += '</div>';
      });
      h += '</div>';
    }
  });

  h += '</div>';
  return h;
}

// ============================================================
// GO TAB — Convert Workout & Finish
// ============================================================
function convertWorkoutToSession(workout) {
  var session = createSession(workout.title, workout.startTime);
  session.duration = Math.round((Date.now() - workout.startTime) / 1000);
  session.durationSource = 'go';

  // Group class: single cardio-like exercise with duration
  if (workout.isGroupClass) {
    session.isGroupClass = true;
    session.groupType = workout.groupType;
    var gExo = createExercise(workout.title);
    gExo.isCardio = true;
    gExo.exoType = 'cardio';
    gExo.maxTime = session.duration;
    gExo.cardioDate = workout.startTime;
    gExo.sets = 1;
    gExo.notes = workout.exercises[0] ? workout.exercises[0].notes : '';
    session.exercises.push(gExo);
    return finalizeSessionFromSeries(session);
  }

  workout.exercises.forEach(function(exo) {
    var exercise = createExercise(exo.name);
    var _bwData = exo.exoId ? EXO_DATABASE[exo.exoId] : null;
    var _hasBW = _bwData && _bwData.bwFactor && db.user.bw > 0;
    var _assist = exo.assistWeight || 0;
    var completedSets = exo.sets.filter(function(s) { return s.completed; });
    completedSets.forEach(function(s) {
      var w = s.weight || 0;
      // For BW exercises, store effective weight (body weight × factor + added - assist)
      if (_hasBW) {
        w = Math.round(db.user.bw * _bwData.bwFactor + (s.weight || 0) - _assist);
      }
      exercise.series.push({
        weight: w,
        reps: s.reps || (s.duration || 0),
        date: workout.startTime
      });
      exercise.allSets.push({
        weight: w,
        reps: s.reps || (s.duration || 0),
        setType: s.type === 'warmup' ? 'warmup' : s.type === 'failure' ? 'failure' : s.type === 'drop' ? 'drop' : 'normal',
        rpe: s.rpe || null
      });
    });
    if (exercise.series.length > 0) session.exercises.push(exercise);
  });

  return finalizeSessionFromSeries(session);
}

function goConfirmFinish() {
  if (!activeWorkout) return;
  var totalExos = 0, totalSets = 0, tonnage = 0;
  activeWorkout.exercises.forEach(function(exo) {
    var done = exo.sets.filter(function(s) { return s.completed; });
    if (done.length > 0) totalExos++;
    totalSets += done.length;
    done.forEach(function(s) { tonnage += (s.weight || 0) * (s.reps || 0); });
  });
  var volStr = tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + 't' : tonnage + 'kg';
  showModal(
    'Terminer la séance ?<br><span style="font-size:12px;color:var(--sub);">' + totalExos + ' exercices · ' + totalSets + ' séries · ' + volStr + ' de volume</span>',
    'Terminer',
    'var(--green)',
    function() { goFinishWorkout(); }
  );
}

function goFinishWorkout() {
  if (!activeWorkout) return;
  var session = convertWorkoutToSession(activeWorkout);

  // Track old PRs for PR detection
  const oldPRs = { bench: db.bestPR.bench, squat: db.bestPR.squat, deadlift: db.bestPR.deadlift };

  // Add to db.logs
  db.logs.push(session);
  saveDBNow();

  // Generate AI debrief
  try { saveAlgoDebrief(session); } catch(e) {}

  // Social: publish session activity
  try { publishSessionActivity(session); } catch(e) {}

  // Social: detect new PRs and publish + celebration
  try {
    recalcBestPR();
    if (typeof calcAndStoreLiftRanks === 'function') calcAndStoreLiftRanks();
    var _prCelebrated = false;
    SBD_TYPES.forEach(type => {
      if (db.bestPR[type] > oldPRs[type] && oldPRs[type] > 0) {
        const name = type === 'bench' ? 'Développé couché' : type === 'squat' ? 'Squat' : 'Soulevé de terre';
        publishPRActivity(name, db.bestPR[type], oldPRs[type]);
        sendLocalNotification('🏆 Nouveau record !', name + ' : ' + db.bestPR[type] + 'kg (ancien: ' + oldPRs[type] + 'kg)');
        if (!_prCelebrated) { showPRCelebration(name, db.bestPR[type], oldPRs[type]); _prCelebrated = true; }
      }
    });
    updateLeaderboardSnapshot();
  } catch(e) {}

  // Cleanup
  try { localStorage.removeItem('SBD_ACTIVE_WORKOUT'); } catch(e) {}
  goStopAutoSave();
  goStopSessionTimer();
  goSkipRest();
  goReleaseWakeLock();

  activeWorkout = null;
  _goSessionPaused = false;

  // Notification
  var _nSets = 0, _nTonnage = 0;
  (session.exercises||[]).forEach(function(e) { _nSets += (e.sets||0); });
  _nTonnage = session.volume || 0;
  sendLocalNotification('✅ Séance terminée', 'Bravo ! ' + _nSets + ' séries, ' + (_nTonnage >= 1000 ? (_nTonnage/1000).toFixed(1) + 't' : _nTonnage + 'kg') + ' de volume');

  showToast('✅ Séance sauvegardée');
  renderGoTab();

  // Naviguer vers la semaine de la séance dans Training
  try {
    var _sesTs = session.timestamp;
    var _thisWeekStart = getWeekStart(Date.now());
    var _sesWeekStart = getWeekStart(_sesTs);
    var _weekDiff = Math.round((_sesWeekStart - _thisWeekStart) / (7 * 86400000));
    currentWeekOffset = _weekDiff;
    // Forcer le re-render si l'onglet séances est visible
    if (activeSeancesSub === 'seances-list') {
      renderSeancesTab();
    }
  } catch(e) {}

  // Force render all key views — refreshUI() only renders the active sub-tab
  // which is still 'seances-go' at this point
  if (activeSeancesSub !== 'seances-list') {
    renderSeancesTab();
  }
  renderDash();

  // Social: clear training status
  try { setTrainingStatus(false); } catch(e) {}

  // Proposer d'ajouter des photos après la séance
  setTimeout(function() {
    showModal(
      '📷 Ajouter des photos ?<br><span style="font-size:12px;color:var(--sub);">Tu peux ajouter 1 à 4 photos à cette séance.</span>',
      'Ajouter des photos',
      'var(--accent)',
      function() { openSessionPhotoPicker(session.id); },
      'Plus tard'
    );
  }, 1500);
}

function goConfirmDiscard() {
  showModal(
    'Annuler la séance ?<br><span style="font-size:12px;color:var(--sub);">Toutes les données de cette séance seront perdues.</span>',
    'Annuler la séance',
    'var(--red)',
    function() { goDiscardWorkout(); }
  );
}

function goDiscardWorkout() {
  try { localStorage.removeItem('SBD_ACTIVE_WORKOUT'); } catch(e) {}
  goStopAutoSave();
  goStopSessionTimer();
  goSkipRest();
  goReleaseWakeLock();
  activeWorkout = null;
  _goSessionPaused = false;
  showToast('Séance annulée');
  renderGoTab();

  // Social: clear training status
  try { setTrainingStatus(false); } catch(e) {}
}

// ============================================================
// PR CELEBRATION OVERLAY
// ============================================================
function showPRCelebration(liftName, newValue, oldValue) {
  var overlay = document.createElement('div');
  overlay.className = 'pr-celebration-overlay';
  overlay.innerHTML = '<div class="pr-celebration-box">' +
    '<div class="pr-celebration-trophy">🏆</div>' +
    '<div class="pr-celebration-title">Nouveau record !</div>' +
    '<div class="pr-celebration-detail">' + liftName + ' : ' + Math.round(oldValue) + 'kg → <strong style="color:var(--success)">' + Math.round(newValue) + 'kg</strong></div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function() { dismissPRCelebration(overlay); });
  setTimeout(function() { dismissPRCelebration(overlay); }, 3000);
}
function dismissPRCelebration(overlay) {
  if (!overlay || overlay._dismissed) return;
  overlay._dismissed = true;
  var box = overlay.querySelector('.pr-celebration-box');
  if (box) box.classList.add('fade-out');
  setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 500);
}

// ============================================================
// PULL-TO-REFRESH (mobile)
// ============================================================
(function() {
  var startY = 0, pulling = false, indicator = null;
  function getIndicator() {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'ptr-indicator';
      indicator.textContent = 'Rafraîchissement...';
      document.body.appendChild(indicator);
    }
    return indicator;
  }
  document.addEventListener('touchstart', function(e) {
    if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });
  document.addEventListener('touchmove', function(e) {
    if (!pulling) return;
    var diff = e.touches[0].clientY - startY;
    if (diff > 60) { getIndicator().classList.add('visible'); }
  }, { passive: true });
  document.addEventListener('touchend', function() {
    if (!pulling) return;
    pulling = false;
    var ind = getIndicator();
    if (ind.classList.contains('visible')) {
      ind.classList.remove('visible');
      if (typeof refreshUI === 'function') refreshUI();
      if (typeof syncSupabase === 'function') syncSupabase();
    }
  }, { passive: true });
})();

// ============================================================
// SIGN OUT
// ============================================================
async function appSignOut() {
  showModal(
    'Se déconnecter ?',
    'Confirmer',
    'var(--red)',
    async function() {
      if (typeof supabase !== 'undefined' && supabase) {
        try { await supabase.auth.signOut(); } catch(e) {}
      }
      if (typeof supaClient !== 'undefined' && supaClient) {
        try { await supaClient.auth.signOut(); } catch(e) {}
      }
      // Effacer la session (garder les données d'entraînement)
      db.user.email = '';
      db.user.supabaseId = '';
      if (db.social) db.social.onboardingCompleted = false;
      saveDBNow();
      setTimeout(function() { window.location.reload(); }, 300);
    },
    'Annuler'
  );
}

// ============================================================
// POST-LOGIN SYNC
// ============================================================
async function postLoginSync() {
  try {
    if (typeof syncFromCloud === 'function') await syncFromCloud();
    else if (typeof loadFromCloud === 'function') await loadFromCloud();
    if (typeof ensureProfile === 'function') await ensureProfile();
    if (!db.social || !db.social.onboardingCompleted) {
      setTimeout(function() {
        if (typeof showSocialOnboarding === 'function') showSocialOnboarding();
      }, 800);
    }
  } catch(e) {
    console.error('postLoginSync error:', e);
  }
}

