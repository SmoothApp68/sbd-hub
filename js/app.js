// ============================================================
// app.js — DB, UI, rendering, navigation, init
// ============================================================

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
    return p;
  } catch { return defaultDB(); }
})();

let selectedDay = 'Lundi', chartSBD = null, chartVolume = null, newPRs = { bench: false, squat: false, deadlift: false };

// Routine active (user ou fallback)
function getRoutine() {
  if (db.routine) return db.routine;
  const style = modeFeature('programStyle');
  if (style && ROUTINE_TEMPLATES[style]) return ROUTINE_TEMPLATES[style].routine;
  return DEFAULT_ROUTINE;
}

let _saveDBTimer = null;
function saveDB() {
  clearCaches();
  // Debounce actual localStorage write to avoid blocking main thread on rapid calls
  if (_saveDBTimer) clearTimeout(_saveDBTimer);
  _saveDBTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch(e) { console.warn('saveDB error:', e); }
    _saveDBTimer = null;
  }, 100);
  debouncedCloudSync();
}
function debouncedCloudSync() { if (!cloudSyncEnabled) return; clearTimeout(syncDebounceTimer); syncDebounceTimer = setTimeout(() => { syncToCloud(true); }, 2000); }
function generateId() { return Math.random().toString(36).substr(2, 9); }

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

function showReadinessModal() {
  if (hasTodayReadiness()) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'readinessModal';
  overlay.innerHTML = `<div class="modal-box" style="max-width:360px;padding:20px;">
    <div style="font-size:16px;font-weight:700;margin-bottom:14px;text-align:center;">Comment te sens-tu ?</div>
    <div class="readiness-sliders">
      <div class="readiness-row"><span>😴 Sommeil</span><input type="range" min="1" max="5" value="3" id="rd-sleep"><span id="rd-sleep-val">3</span></div>
      <div class="readiness-row"><span>⚡ Énergie</span><input type="range" min="1" max="5" value="3" id="rd-energy"><span id="rd-energy-val">3</span></div>
      <div class="readiness-row"><span>💪 Courbatures</span><input type="range" min="1" max="5" value="3" id="rd-soreness"><span id="rd-soreness-val">3</span></div>
      <div class="readiness-row"><span>🧠 Stress</span><input type="range" min="1" max="5" value="3" id="rd-stress"><span id="rd-stress-val">3</span></div>
    </div>
    <div style="font-size:10px;color:var(--sub);text-align:center;margin:8px 0;">1 = mauvais · 5 = excellent</div>
    <div class="modal-actions">
      <button class="modal-cancel" style="background:var(--sub);color:#000;" onclick="document.getElementById('readinessModal').remove()">Passer</button>
      <button class="modal-confirm" style="background:var(--green);color:#000;" onclick="submitReadiness()">Valider</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  ['sleep','energy','soreness','stress'].forEach(k => {
    const slider = document.getElementById('rd-'+k);
    slider.oninput = () => document.getElementById('rd-'+k+'-val').textContent = slider.value;
  });
}

function submitReadiness() {
  const sleep = parseInt(document.getElementById('rd-sleep').value);
  const energy = parseInt(document.getElementById('rd-energy').value);
  const soreness = parseInt(document.getElementById('rd-soreness').value);
  const stress = parseInt(document.getElementById('rd-stress').value);
  const score = Math.round(((sleep + energy + soreness + stress) / 20) * 100);
  db.readiness.push({ date: getTodayStr(), sleep, energy, soreness, stress, score });
  saveDB();
  const modal = document.getElementById('readinessModal');
  if (modal) modal.remove();
  showToast('✅ Readiness : ' + score + '/100');
}

function getReadinessBannerHtml() {
  const r = getTodayReadiness();
  if (!r) return '';
  if (r.score < 40) return '<div style="background:rgba(255,69,58,0.15);border-left:3px solid var(--red);padding:8px 12px;margin:8px 0;border-radius:8px;font-size:12px;color:var(--red);">⚠️ Readiness faible (' + r.score + '/100) — séance allégée recommandée (volume -40%, charge -15%)</div>';
  if (r.score < 60) return '<div style="background:rgba(255,159,10,0.12);border-left:3px solid var(--orange);padding:8px 12px;margin:8px 0;border-radius:8px;font-size:12px;color:var(--orange);">Readiness modérée (' + r.score + '/100) — charge maintenue, volume réduit (-1 set/exo)</div>';
  if (r.score >= 80) return '<div style="background:rgba(50,215,75,0.12);border-left:3px solid var(--green);padding:8px 12px;margin:8px 0;border-radius:8px;font-size:12px;color:var(--green);">Readiness excellente (' + r.score + '/100) — go ! 💪</div>';
  return '';
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
function showModal(msg, cText, cColor, onConfirm, onCancel) { const o = document.createElement('div'); o.className = 'modal-overlay'; o.innerHTML = '<div class="modal-box"><p style="margin:0 0 5px;font-size:14px;">'+msg+'</p><div class="modal-actions"><button class="modal-cancel" style="background:var(--sub);color:#000;">Annuler</button><button class="modal-confirm" style="background:'+cColor+';color:white;">'+cText+'</button></div></div>'; document.body.appendChild(o); o.querySelector('.modal-cancel').onclick = () => { o.remove(); if (onCancel) onCancel(); }; o.querySelector('.modal-confirm').onclick = () => { o.remove(); onConfirm(); }; }
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
function timeAgo(ts) { const d = Date.now()-ts; if (d < 3600000) return 'il y a '+Math.max(1,Math.round(d/60000))+'min'; if (d < 86400000) return 'il y a '+Math.round(d/3600000)+'h'; return 'il y a '+Math.round(d/86400000)+'j'; }
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
  generated.forEach(d => { db.routine[d.day] = d.isRest ? '😴 Repos' : (d.isCardio ? '🏃 '+d.label : d.label); });
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
    }
  };

  const Bg = B[g1] || B.maintien;

  const sequences = {
    force:    { 1:[Bg.full_a],2:[Bg.full_a,Bg.full_b],3:[Bg.legs,Bg.push,Bg.pull],4:[Bg.legs,Bg.push,Bg.pull,Bg.sbd],5:[Bg.legs,Bg.push,Bg.pull,Bg.sbd,Bg.faibles],6:[Bg.legs,Bg.push,Bg.pull,Bg.sbd,Bg.faibles,Bg.full_a] },
    masse:    { 1:[Bg.full_a],2:[Bg.full_a,Bg.full_b],3:[Bg.push,Bg.pull,Bg.legs],4:[Bg.upper,Bg.lower,Bg.push,Bg.pull],5:[Bg.push,Bg.pull,Bg.legs,Bg.upper,Bg.lower],6:[Bg.push,Bg.pull,Bg.legs,Bg.push,Bg.pull,Bg.legs] },
    seche:    { 1:[Bg.full_a],2:[Bg.full_a,Bg.cardio],3:[Bg.full_a,Bg.cardio,Bg.full_a],4:[Bg.push,Bg.pull,Bg.legs,Bg.cardio],5:[Bg.push,Bg.pull,Bg.legs,Bg.cardio,Bg.full_a],6:[Bg.push,Bg.pull,Bg.legs,Bg.cardio,Bg.full_a,Bg.cardio] },
    recompo:  { 1:[Bg.full_a],2:[Bg.full_a,Bg.full_b],3:[Bg.push,Bg.pull,Bg.legs],4:[Bg.full_a,Bg.full_b,Bg.cardio,Bg.full_a],5:[Bg.push,Bg.pull,Bg.legs,Bg.cardio,Bg.full_b],6:[Bg.push,Bg.pull,Bg.legs,Bg.cardio,Bg.full_b,Bg.cardio] },
    maintien: { 1:[Bg.full_a],2:[Bg.full_a,Bg.full_b],3:[Bg.full_a,Bg.full_b,Bg.full_c],4:[Bg.full_a,Bg.full_b,Bg.full_c,Bg.cardio],5:[Bg.full_a,Bg.full_b,Bg.full_c,Bg.cardio,Bg.full_a],6:[Bg.full_a,Bg.full_b,Bg.full_c,Bg.cardio,Bg.full_a,Bg.full_b] },
    reprise:  { 1:[Bg.full_a],2:[Bg.full_a,Bg.full_b],3:[Bg.full_a,Bg.cardio,Bg.full_b],4:[Bg.full_a,Bg.cardio,Bg.full_b,Bg.cardio],5:[Bg.full_a,Bg.cardio,Bg.full_b,Bg.cardio,Bg.full_a],6:[Bg.full_a,Bg.cardio,Bg.full_b,Bg.cardio,Bg.full_a,Bg.cardio] }
  };

  const seq = (sequences[g1]||sequences.maintien)[Math.min(freq,6)] || [Bg.full_a];
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
                <span class="prog-exo-item-name">${e}</span>
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
        <span class="prog-exo-item-name">${e}</span>
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
            <span class="prog-exo-item-name">${e}</span>
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
}

function showTab(tabId) {
  document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  const tabBtn = document.querySelector('.tab-btn[data-tab="'+tabId+'"]');
  if (tabBtn) tabBtn.classList.add('active');
  if (tabId==='tab-dash') renderDash();
  if (tabId==='tab-seances') {
    if (activeSeancesSub === 'seances-go') renderGoTab();
    else renderSeancesTab();
    if (isTodayTrainingDay() && !hasTodayReadiness()) showReadinessModal();
  }
  if (tabId==='tab-stats') { showStatsSub(activeStatsSub, document.querySelector('.stats-sub-pill.active')); }
  if (tabId==='tab-ai') { renderReportsTimeline(); markReportsRead(); renderWeeklyPlanUI(); renderCoachAlgoAI(); }
  if (tabId==='tab-game') { renderGamificationTab(); }
  if (tabId==='tab-profil') {
    if (activeProfilSub === 'tab-settings') fillSettingsFields();
    else renderCorpsTab();
  }
  if (tabId==='tab-social') { initSocialTab(); }
}
document.querySelector('.tab-bar').addEventListener('click', e => { const b = e.target.closest('.tab-btn'); if (b) showTab(b.dataset.tab); });
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

  return b;
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
  if (!db.logs.length) return 0;
  const now = Date.now();
  const weekMs = 7 * 86400000;
  // Build Set of week indices that have sessions — single pass O(n)
  const weeksWithSessions = new Set();
  db.logs.forEach(l => {
    const weekIdx = Math.floor((now - l.timestamp) / weekMs);
    if (weekIdx >= 0 && weekIdx < 530) weeksWithSessions.add(weekIdx);
  });
  let streak = 0;
  for (let w = 0; w < 530; w++) {
    if (weeksWithSessions.has(w)) streak++;
    else if (w > 0) break;
  }
  return streak;
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
function _getRoutineDays() {
  if (!db.routine) return 4;
  var days = 0;
  for (var k in db.routine) { if (db.routine[k] && db.routine[k] !== 'Repos') days++; }
  return days > 0 ? days : 4;
}

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

function _calcExoXP(exoName) {
  var xp = 0;
  var sorted = getSortedLogs().slice().reverse();
  var best = 0;
  sorted.forEach(function(log) {
    var found = false;
    (log.exercises||[]).forEach(function(e) {
      if (e.name === exoName) {
        found = true;
        if (e.maxRM > 0 && e.maxRM > best) { xp += 50; best = e.maxRM; }
      }
    });
    if (found) xp += 8;
  });
  return xp;
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

  levelCard.innerHTML =
    '<div class="lvl-card lvl-card-v2">' +
      '<div class="lvl-bg"></div>' +
      (todayXP > 0 ? '<div class="lvl-xp-today">Aujourd\'hui : +' + todayXP + ' XP</div>' : '') +
      '<div class="lvl-top">' +
        '<div class="lvl-icon-wrap">' + currLevel.icon + '<div class="lvl-icon-ring"></div></div>' +
        '<div class="lvl-info">' +
          '<div class="lvl-num">Niveau ' + currLevel.level + ' · ' + totalXP.toLocaleString() + ' XP</div>' +
          '<div class="lvl-name">' + currLevel.name + '</div>' +
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
        '<div class="lvl-stat lvl-stat-click" onclick="showTab(\'tab-stats\')"><div class="lvl-stat-val">' + totalVolT + 't</div><div class="lvl-stat-lbl">Vol. total</div></div>' +
      '</div>' +
    '</div>';

  // ── 2. Sources d'XP (clickable) ──
  (function() {
    var bd = calcXPBreakdown();
    var maxXP = Math.max(bd.seances, bd.records, bd.regularite, bd.tonnage, bd.defis, 1);
    var bars = [
      {label:'Séances', val:bd.seances, color:'var(--blue)', click:'showTab(\'tab-seances\')'},
      {label:'Records', val:bd.records, color:'var(--green)', click:'showTab(\'tab-stats\');setTimeout(function(){showStatsSub(\'stats-records\');},100)'},
      {label:'Régularité', val:bd.regularite, color:'var(--orange)', click:'document.getElementById(\'gamHeatmap\').scrollIntoView({behavior:\'smooth\',block:\'start\'})'},
      {label:'Tonnage', val:bd.tonnage, color:'var(--purple)', click:'showTab(\'tab-stats\');setTimeout(function(){showStatsSub(\'stats-volume\');},100)'},
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

        pagesHtml += '<div class="sg-card sg-card-click' + (isDim?' dim':'') + '" onclick="showTab(\'tab-stats\');setTimeout(function(){showStatsSub(\'stats-records\');},100)">';
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
    document.getElementById('gamHeatmap').innerHTML =
      '<div class="mc">' +
        '<div class="mc-title"><span>🔥 Régularité</span><span class="hm-streak">' + streak + ' semaines</span></div>' +
        '<div class="hm-grid">' + cells + '</div>' +
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

function renderDash() {
  const routine = getRoutine();
  document.getElementById('routineDisplay').textContent = routine[selectedDay] || '—';
  const greet = document.getElementById('dashGreeting');
  if (greet && db.user.name) greet.textContent = 'Salut ' + db.user.name + ' 👋';

  // Carte de bienvenue : visible seulement si aucune séance importée
  const welcomeCard = document.getElementById('welcomeCard');
  if (welcomeCard) {
    const noData = !db.logs || db.logs.length === 0;
    welcomeCard.style.display = noData ? '' : 'none';
    if (noData && db.user.name) {
      const title = document.getElementById('welcomeTitle');
      if (title) title.textContent = 'Salut ' + db.user.name + ' ! Tout est prêt.';
    }
  }

  renderPerfCard();
  renderDayExercises(selectedDay);
  renderReadinessSparkline();
}

function renderReadinessSparkline() {
  const el = document.getElementById('readinessSparkline');
  if (!el) return;
  const cutoff = Date.now() - 28 * 86400000;
  const recent = (db.readiness || []).filter(r => new Date(r.date).getTime() >= cutoff).sort((a,b) => a.date.localeCompare(b.date));
  if (recent.length < 2) { el.innerHTML = '<div style="font-size:11px;color:var(--sub);text-align:center;padding:8px;">Pas encore de données readiness</div>'; return; }
  const vals = recent.map(r => r.score);
  const labels = recent.map(r => r.date.slice(5));
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
  el.innerHTML = '<div style="font-size:11px;font-weight:700;color:var(--sub);margin-bottom:4px;">READINESS</div>' +
    '<div style="display:flex;align-items:center;gap:8px;">' +
    '<span style="font-size:20px;font-weight:800;color:' + color + ';">' + lastScore + '</span>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:60px;flex:1;">' +
    '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="3" fill="' + color + '"/>' +
    '</svg></div>';
}

// ── Rubrique Performance configurable ────────────────────────
let chartPerf = null;
let perfChartMode = 'bars';
function setPerfMode(mode) { perfChartMode = mode; renderPerfCard(); }

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

  const keyLifts = db.keyLifts || [];

  if (!keyLifts.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;">' +
      '<div style="font-size:28px;margin-bottom:10px;">🎯</div>' +
      '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px;">Aucun exercice clé configuré</div>' +
      '<div style="font-size:12px;color:var(--sub);line-height:1.6;">Choisis les mouvements que tu veux suivre<br>dans Réglages → 🎯 Exercices Clés</div>' +
      '</div>';
    return;
  }

  // Construire records par exercice clé : real1RM, e1RM, historique progression
  const records = {}; // { name: { real1rm, e1rm, date, history:[{ts,rm}] } }
  keyLifts.forEach(kl => { records[kl.name] = { real1rm: 0, e1rm: 0, date: null, history: [] }; });

  // Pre-build a map of exercise names to key lift names for O(1) lookup
  // instead of calling matchExoName for each keyLift × each exercise
  const _exoToKeyLift = new Map(); // hevyName → kl.name
  function _resolveKeyLift(exoName) {
    if (_exoToKeyLift.has(exoName)) return _exoToKeyLift.get(exoName);
    for (const kl of keyLifts) {
      if (matchExoName(exoName, kl.name)) { _exoToKeyLift.set(exoName, kl.name); return kl.name; }
    }
    _exoToKeyLift.set(exoName, null);
    return null;
  }

  // Parcourir tout l'historique chronologiquement pour la courbe (use cached sorted)
  const _chronoLogs = getSortedLogs().slice().reverse();
  _chronoLogs.forEach(log => {
    log.exercises.forEach(exo => {
      const klName = _resolveKeyLift(exo.name);
      if (!klName) return;
      const rec = records[klName];
      if ((exo.maxRM || 0) > rec.e1rm) {
        rec.e1rm = exo.maxRM || 0;
        rec.date = log.shortDate || formatDate(log.timestamp);
      }
      const real = parseFloat((exo.repRecords || {})['1'] || 0);
      if (real > rec.real1rm) rec.real1rm = real;
      if ((exo.maxRM || 0) > 0) rec.history.push({ ts: log.timestamp, rm: exo.maxRM, date: log.shortDate || formatDate(log.timestamp) });
    });
  });

  // Auto-incrément objectif si e1RM (Epley) dépasse l'objectif actuel
  // On utilise e1RM et non real1rm : le 1RM réel est rare, l'e1RM est la mesure standard
  let changed = false;
  keyLifts.forEach(kl => {
    const rec = records[kl.name];
    const inc = getPerfIncrement(kl.name);
    if (rec.e1rm > 0 && kl.target > 0 && rec.e1rm >= kl.target) {
      while (kl.target <= rec.e1rm) kl.target += inc;
      changed = true;
      showToast('🎯 ' + kl.name.split(' ')[0] + ' → nouvel objectif ' + kl.target + 'kg !');
    }
  });
  if (changed) saveDB();

  // ── Boîtes rm-box ─────────────────────────────────────────
  const cols = keyLifts.length <= 3 ? 'repeat(' + keyLifts.length + ',1fr)' : 'repeat(3,1fr)';
  const PALETTE = ['#0A84FF','#32D74B','#FF9F0A','#FF453A','#BF5AF2','#64D2FF'];

  const boxesHtml = keyLifts.map((kl, i) => {
    const rec = records[kl.name];
    const e1rm = rec.e1rm;
    const real = rec.real1rm;
    const target = kl.target || 0;
    const bw = db.user.bw > 0 && e1rm > 0 ? '×' + (e1rm / db.user.bw).toFixed(2) + ' bw' : null;
    const isPR = !!(newPRs && newPRs[kl.name]);
    const shortName = kl.name.replace(/\s*\(.*\)/, '').trim().split(' ').slice(0, 2).join(' ');
    const color = PALETTE[i % PALETTE.length];

    return '<div class="rm-box">' +
      (isPR ? '<div class="pr-badge">🔥 PR!</div>' : '') +
      '<div style="font-size:10px;color:var(--sub);">' + shortName.toUpperCase() + '</div>' +
      '<div class="rm-val" style="color:' + color + '">' + (e1rm || 0) + '<span style="font-size:12px;color:var(--sub);font-weight:normal;">kg e1RM</span></div>' +
      (real > 0 ? '<div style="font-size:11px;color:var(--green);margin-top:2px;">✓ ' + real + 'kg réel</div>' : '') +
      (target > 0 ? '<div class="rm-target">Visé : ' + target + 'kg</div>' : '<div class="rm-target" style="color:var(--border);">—</div>') +
      (bw ? '<div style="font-size:11px;color:var(--green);margin-top:4px;font-weight:600;">' + bw + '</div>' : '') +
      '</div>';
  }).join('');

  // ── Trend rows : progression récente par exercice ──────────
  // Montre la tendance inter-séances (kg/sem) + dernier vs avant-dernier
  const trendRows = keyLifts.map((kl, i) => {
    const color = PALETTE[i % PALETTE.length];
    const hist = [...records[kl.name].history].sort((a,b) => a.ts - b.ts);

    let trendHtml = '';
    if (hist.length >= 2) {
      // Régression linéaire sur les points disponibles (max 8)
      const pts = hist.slice(-8);
      const n = pts.length;
      const sumX = pts.reduce((s,p,i) => s+i, 0);
      const sumY = pts.reduce((s,p) => s+p.rm, 0);
      const sumXY = pts.reduce((s,p,i) => s+i*p.rm, 0);
      const sumX2 = pts.reduce((s,p,i) => s+i*i, 0);
      const denom = n*sumX2 - sumX*sumX;
      const kgPerSess = denom !== 0 ? (n*sumXY - sumX*sumY) / denom : 0;

      const last = pts[pts.length-1].rm;
      const prev = pts[pts.length-2].rm;
      const delta = last - prev;
      const deltaStr = delta > 0 ? '+' + delta : String(delta);
      const deltaColor = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--sub)';
      const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';

      // Tendance globale
      const trendKg = Math.round(kgPerSess * 10) / 10;
      let trendLabel = '';
      if (Math.abs(trendKg) < 0.2 && hist.length >= 3) trendLabel = '<span style="color:var(--orange);font-size:10px;">● plateau</span>';
      else if (trendKg > 0) trendLabel = '<span style="color:var(--green);font-size:10px;">↑ +' + Math.abs(trendKg) + 'kg/séance</span>';
      else trendLabel = '<span style="color:var(--red);font-size:10px;">↓ ' + trendKg + 'kg/séance</span>';

      trendHtml =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">' +
        '<span style="color:' + deltaColor + ';font-size:12px;font-weight:700;">' + arrow + ' ' + deltaStr + 'kg vs préc.</span>' +
        trendLabel +
        '</div>';
    } else if (hist.length === 1) {
      trendHtml = '<div style="color:var(--sub);font-size:11px;margin-top:6px;">1 séance enregistrée</div>';
    } else {
      trendHtml = '<div style="color:var(--sub);font-size:11px;margin-top:6px;">Aucune donnée</div>';
    }

    // Mini sparkline SVG (petite, dans la ligne de tendance)
    let sparkSvg = '';
    if (hist.length > 2) {
      const pts = hist.slice(-12);
      let runMax = 0;
      const vals = pts.map(p => { if (p.rm > runMax) runMax = p.rm; return runMax; });
      const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1;
      const W = 80, H = 24, pad = 2;
      const svgPts = vals.map((v, j) =>
        (pad + (j / (vals.length-1)) * (W-2*pad)).toFixed(1) + ',' +
        (H - pad - ((v-minV)/range) * (H-2*pad)).toFixed(1)
      );
      sparkSvg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:80px;height:24px;flex-shrink:0;">' +
        '<polyline points="' + svgPts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" opacity="0.8"/>' +
        '<circle cx="' + svgPts[svgPts.length-1].split(',')[0] + '" cy="' + svgPts[svgPts.length-1].split(',')[1] + '" r="2.5" fill="' + color + '"/>' +
        '</svg>';
    }

    const target = kl.target || 0;
    const e1rm = records[kl.name].e1rm;
    const pct = target > 0 && e1rm > 0 ? Math.min(100, Math.round(e1rm / target * 100)) : null;
    const progressBar = pct !== null
      ? '<div style="height:3px;background:var(--border);border-radius:2px;margin-top:8px;"><div style="height:3px;background:' + color + ';border-radius:2px;width:' + pct + '%;transition:width 0.5s;"></div></div>' +
        '<div style="font-size:10px;color:var(--sub);margin-top:3px;text-align:right;">' + pct + '% de l\'objectif</div>'
      : '';

    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
      '<div style="width:3px;height:36px;background:' + color + ';border-radius:2px;flex-shrink:0;"></div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + kl.name.replace(/\s*\(.*\)/, '').trim() + '</div>' +
        trendHtml +
        progressBar +
      '</div>' +
      sparkSvg +
    '</div>';
  }).join('');

  // ── Toggle barres / courbe ────────────────────────────────
  const toggleHtml =
    '<div style="display:flex;gap:6px;margin-bottom:14px;">' +
    '<button class="period-btn' + (perfChartMode==='bars'?' active':'') + '" onclick="setPerfMode(\'bars\')" style="font-size:11px;">📊 Barres</button>' +
    '<button class="period-btn' + (perfChartMode==='curve'?' active':'') + '" onclick="setPerfMode(\'curve\')" style="font-size:11px;">📈 Progression</button>' +
    '</div>';

  if (perfChartMode === 'bars') {
    // ── Mode barres : bar chart e1RM / réel / objectif ─────
    const labels   = keyLifts.map(kl => kl.name.replace(/\s*\(.*\)/, '').trim().split(' ').slice(0,2).join(' '));
    const real1rms = keyLifts.map(kl => records[kl.name].real1rm);
    const e1rms    = keyLifts.map(kl => records[kl.name].e1rm);
    const targets  = keyLifts.map(kl => kl.target || 0);
    const bgMain   = keyLifts.map((_, i) => PALETTE[i % PALETTE.length]);
    const bgE1rm   = keyLifts.map((_, i) => PALETTE[i % PALETTE.length] + '99');
    const bgTarget = keyLifts.map((_, i) => PALETTE[i % PALETTE.length] + '33');

    if (window.chartPerfLine && typeof window.chartPerfLine.destroy === 'function') { window.chartPerfLine.destroy(); window.chartPerfLine = null; }

    el.innerHTML =
      toggleHtml +
      '<div class="sbd-grid" style="grid-template-columns:' + cols + ';margin-bottom:16px;">' + boxesHtml + '</div>' +
      '<div style="height:200px;"><canvas id="chartPerf"></canvas></div>';

    const cvBar = document.getElementById('chartPerf');
    if (cvBar) {
      if (chartPerf && typeof chartPerf.destroy === 'function') chartPerf.destroy();
      chartPerf = new Chart(cvBar, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: '1RM Réel',     data: real1rms, backgroundColor: bgMain,   borderRadius: 6, barThickness: 22 },
            { label: 'e1RM (Epley)', data: e1rms,    backgroundColor: bgE1rm,   borderRadius: 6, barThickness: 22 },
            { label: 'Objectif',     data: targets,  backgroundColor: bgTarget, borderRadius: 6, barThickness: 22, borderColor: bgMain, borderWidth: 2 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#F5F5F7', font: { size: 10 }, boxWidth: 10 } },
            tooltip: { callbacks: { afterLabel: c => {
              if (c.datasetIndex === 2) {
                const rm = e1rms[c.dataIndex];
                return targets[c.dataIndex] > 0 && rm > 0 ? 'Reste : ' + (targets[c.dataIndex] - rm) + 'kg' : '';
              }
              return '';
            }}}
          },
          scales: {
            y: { grid: { color: '#2C2C2E' }, ticks: { color: '#86868B' } },
            x: { grid: { display: false }, ticks: { color: '#F5F5F7', font: { weight: 'bold' } } }
          }
        }
      });
    }

  } else {
    // ── Mode courbe : trend rows + sparklines SVG ──────────
    if (chartPerf && typeof chartPerf.destroy === 'function') { chartPerf.destroy(); chartPerf = null; }
    if (window.chartPerfLine && typeof window.chartPerfLine.destroy === 'function') { window.chartPerfLine.destroy(); window.chartPerfLine = null; }

    el.innerHTML =
      toggleHtml +
      '<div class="sbd-grid" style="grid-template-columns:' + cols + ';margin-bottom:16px;">' + boxesHtml + '</div>' +
      (trendRows
        ? '<div style="background:var(--surface);border-radius:12px;padding:4px 12px;">' + trendRows + '</div>'
        : '');
  }
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

function renderDayExercises(day) {
  const c = document.getElementById('trainingLogs');
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
function renderSBDChart() {
  const ctx=document.getElementById('chartSBD');if(!ctx)return;if(chartSBD)chartSBD.destroy();
  const lastPRDates={};SBD_TYPES.forEach(type=>{for(const log of db.logs){for(const exo of log.exercises){if(getSBDType(exo.name)===type&&exo.maxRM===db.bestPR[type]){lastPRDates[type]=log.date.split(' à')[0];return;}}}});
  chartSBD=new Chart(ctx,{type:'bar',data:{labels:['Bench','Squat','Dead'],datasets:[{label:'1RM Actuel',data:SBD_TYPES.map(t=>db.bestPR[t]),backgroundColor:['#0A84FF','#32D74B','#FF9F0A'],borderRadius:8,barThickness:35},{label:'1RM Visé',data:SBD_TYPES.map(t=>db.user.targets[t]),backgroundColor:['rgba(10,132,255,0.3)','rgba(50,215,75,0.3)','rgba(255,159,10,0.3)'],borderColor:['#0A84FF','#32D74B','#FF9F0A'],borderWidth:2,borderDash:[5,5],barThickness:35}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:'#F5F5F7',font:{size:11}}},tooltip:{callbacks:{afterLabel(c){const t=SBD_TYPES[c.dataIndex];return c.datasetIndex===0?'Depuis: '+(lastPRDates[t]||'N/A'):'Reste: '+(db.user.targets[t]-db.bestPR[t])+'kg';}}}},scales:{y:{grid:{color:'#2C2C2E',drawBorder:false},ticks:{color:'#86868B'}},x:{grid:{display:false},ticks:{color:'#F5F5F7',font:{weight:'bold'}}}}}});
}

function renderVolumeChart(period) {
  period = period || 'week';
  setPeriodButtons('volumeButtons', period);
  const cv = document.getElementById('chartVolume'); if (!cv) return; if (chartVolume) chartVolume.destroy();
  // 'week' = 10 dernières séances, 'month' = 30 dernières séances
  const limit = period === 'week' ? 10 : 30;
  const vl = [...db.logs].sort((a,b) => a.timestamp-b.timestamp).filter(l => l.volume > 0).slice(-limit);
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

function renderTopLifts() {
  const bl={};
  db.logs.forEach(log=>{log.exercises.forEach(exo=>{if(SESSION_NAME_BLACKLIST.test(exo.name.toLowerCase()))return;const exoType=getExoType(exo.name);if(exoType!=='weight'&&exoType!=='reps')return;if(!exo.maxRM||exo.maxRM<=0)return;if(!bl[exo.name]||exo.maxRM>bl[exo.name].maxRM)bl[exo.name]={name:exo.name,maxRM:exo.maxRM,date:exo.maxRMDate?formatDate(exo.maxRMDate):'N/A',muscle:getMuscleGroup(exo.name)};});});
  const byMuscle={};Object.values(bl).forEach(lift=>{if(!byMuscle[lift.muscle])byMuscle[lift.muscle]=[];byMuscle[lift.muscle].push(lift);});
  const finalLifts=[];Object.entries(byMuscle).forEach(([muscle,lifts])=>{lifts.sort((a,b)=>b.maxRM-a.maxRM);finalLifts.push(...lifts.slice(0,2).map(l=>({...l,muscle})));});
  finalLifts.sort((a,b)=>b.maxRM-a.maxRM);
  const sorted=finalLifts.slice(0,15);const medals=['🥇','🥈','🥉'];
  document.getElementById('topExosList').innerHTML=sorted.length===0?'<p style="color:var(--sub);font-size:13px;text-align:center;">Aucun lift</p>':sorted.map((l,i)=>'<div class="stat-row"><span style="font-size:14px;">'+(medals[i]||'💪')+' '+l.name+'<span style="font-size:10px;color:var(--sub);margin-left:6px;">'+l.muscle+'</span></span><div style="text-align:right;"><div style="color:var(--blue);font-weight:bold;font-size:14px;">'+l.maxRM+'kg</div><div style="font-size:10px;color:var(--sub);">'+l.date+'</div></div></div>').join('');
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
function updateTargets() {
  const b=parseFloat(document.getElementById('tgtBench').value)||db.user.targets.bench;
  const s=parseFloat(document.getElementById('tgtSquat').value)||db.user.targets.squat;
  const d=parseFloat(document.getElementById('tgtDead').value)||db.user.targets.deadlift;
  db.user.targets={bench:b,squat:s,deadlift:d};
  saveDB(); renderDash();
}
function fullReset() { showModal('⚠️ Toutes les données seront effacées.','Effacer','var(--red)',()=>{db=defaultDB();saveDB();refreshUI();showToast('✓ Réinitialisé');}); }

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
  db.logs.sort((a,b)=>b.timestamp-a.timestamp);saveDB();
  bar.style.width='100%';txt.textContent='✓ '+imported+' séances importées !';btn.textContent='✓ Importé';showToast('✓ '+imported+' séances importées');
  const prSummary=Object.entries(prs).filter(([,v])=>v>0).map(([k,v])=>k.toUpperCase()+' : '+v+'kg').join(' · ');
  if(prSummary)showToast('🏆 PRs : '+prSummary);
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
  if(ns)saveDB();
  cleanupExistingLogs();
  purgeExpiredReports();

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
  renderProgramViewer();

  // ONBOARDING — afficher si pas encore fait
  if(!db.user.onboarded){
    showOnboarding();
  }

  cloudSignIn().then(async user => {
    if (!user) return;
    if (db.logs.length === 0) {
      syncFromCloud();
      return;
    }
    if (!db.lastSync) {
      syncToCloud(true);
      return;
    }
    try {
      const {data:{user:u}} = await supaClient.auth.getUser();
      if (!u) { syncToCloud(true); return; }
      const {data} = await supaClient.from('sbd_profiles').select('updated_at').eq('user_id', u.id).maybeSingle();
      if (data && data.updated_at) {
        const cloudTs = new Date(data.updated_at).getTime();
        if (cloudTs > db.lastSync + 5000) {
          showToast('☁️ Données plus récentes sur le cloud — synchronisation…');
          syncFromCloud();
        } else {
          syncToCloud(true);
        }
      } else {
        syncToCloud(true);
      }
    } catch(e) {
      syncToCloud(true);
    }
    // Check password migration for existing magic-link users
    checkPasswordMigration(user);
  });
})();

// ============================================================
// ONGLET CORPS
// ============================================================
let chartBodyWeight = null;

function calcIPFGL(lift, bw) {
  const a=1236.25115, b=1449.21864, c=0.01644, d=2.12345;
  const denom = a - b * Math.exp(-c * Math.pow(bw, d));
  if (!denom || denom <= 0) return 0;
  return Math.round((600 / denom) * lift * 100) / 100;
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
let activeStatsSub = 'stats-volume';
function showStatsSub(id, btn) {
  if (!id) id = activeStatsSub;
  activeStatsSub = id;
  document.querySelectorAll('.stats-sub-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.stats-sub-pill').forEach(el => el.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  else { const pill = document.querySelector('.stats-sub-pill[onclick*="' + id + '"]'); if (pill) pill.classList.add('active'); }
  if (id === 'stats-volume') { renderReports('week'); renderVolumeChart('week'); }
  if (id === 'stats-muscles') { renderRadarImproved('week'); renderMuscleChart('week'); renderVolumeLandmarks(); renderStrengthRatios(); }
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
    if (sets >= lm.MRV) { color = 'var(--red)'; status = '> MRV ⚠️'; }
    else if (sets >= lm.MAV) { color = 'var(--orange)'; status = 'MAV→MRV'; }
    else if (sets >= lm.MEV) { color = 'var(--green)'; status = 'MEV→MAV ✅'; }
    html += '<div style="margin-bottom:8px;">' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">' +
      '<span style="font-weight:600;">' + (LABELS_FR[key] || key) + '</span>' +
      '<span style="color:' + color + ';">' + sets + '/' + lm.MRV + ' sets · ' + status + '</span></div>' +
      '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">' +
      '<div style="height:6px;width:' + pct + '%;background:' + color + ';border-radius:3px;transition:width 0.4s;"></div></div></div>';
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
      '<span style="font-weight:600;">' + r.label + '</span>' +
      '<span style="color:' + color + ';">' + val.toFixed(2) + ' ' + alert + '</span></div>' +
      '<div style="position:relative;height:8px;background:var(--border);border-radius:4px;">' +
      '<div style="position:absolute;left:' + idealLeft + '%;width:' + idealWidth + '%;height:100%;background:rgba(50,215,75,0.25);border-radius:4px;"></div>' +
      '<div style="position:absolute;left:' + pctPos + '%;top:-2px;width:4px;height:12px;background:' + color + ';border-radius:2px;transform:translateX(-50%);"></div>' +
      '</div></div>';
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
  // Composante 1 — Régularité (25pts)
  const sessions7 = getLogsInRange(7).length;
  const routine = getRoutine();
  const plannedDays = Math.max(3, Object.values(routine).filter(v => v && !v.includes('Repos') && !v.includes('😴')).length);
  const c1 = Math.min(25, Math.round((sessions7 / plannedDays) * 25));

  // Composante 2 — Ratio charge aiguë/chronique ATL/CTL (25pts) — EWMA
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
      if (r >= 0.8 && r <= 1.3) c2 = 25;
      else if (r >= 0.5 && r < 0.8) c2 = Math.round(((r - 0.5) / 0.3) * 18) + 4;
      else if (r > 1.3 && r <= 1.8) c2 = Math.round(((1.8 - r) / 0.5) * 20);
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
      if (r >= 0.8 && r <= 1.3) c2 = 25;
      else if (r >= 0.5 && r < 0.8) c2 = Math.round(((r - 0.5) / 0.3) * 18) + 4;
      else if (r > 1.3 && r <= 1.8) c2 = Math.round(((1.8 - r) / 0.5) * 20);
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
}

function renderCorpsTab() {
  const bw=db.user.bw;
  const bench=db.bestPR.bench,squat=db.bestPR.squat,dead=db.bestPR.deadlift;
  const logs7=getLogsInRange(7),tonnage7=logs7.reduce((s,l)=>s+l.volume,0);
  const ipf=calcIPFGLTotal(bench,squat,dead,bw);
  const ratio=bw>0&&ipf>0?Math.round((ipf/bw)*100)/100:0;
  const tdee=calcTDEE(bw,tonnage7);
  const cible=calcCalorieCible(bw);
  const macros=calcMacrosCibles(cible,bw);
  const today=new Date().toDateString();
  const todayEntry=(db.body||[]).find(e=>new Date(e.ts).toDateString()===today);
  const kcalMange=todayEntry?todayEntry.kcal:0,protMange=todayEntry?todayEntry.prot:0,carbMange=todayEntry?todayEntry.carb:0,fatMange=todayEntry?todayEntry.fat:0;
  const now2=new Date(),heuresPassed=now2.getHours()+now2.getMinutes()/60;
  const brulees=tdee>0?Math.round((tdee/24)*heuresPassed):0;
  const restantes=Math.max(0,cible-kcalMange);
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
  const cEl=document.getElementById('coachAlgoContent');if(cEl)cEl.innerHTML=generateCoachAlgoMessage();
  // Nouvelles sections
  renderFormeScore();
  renderTrainingLoad();
  renderWeightTrend();
  renderMacroHistory();
  renderBodyWeightChart(bwHistory);
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
let currentWeekOffset = 0;
let sparklineCharts = {};

function getWeekStart(ts) {
  const d = new Date(ts); d.setHours(12,0,0,0);
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

  const weekLogs = db.logs.filter(l => l.timestamp >= targetWeekStart && l.timestamp <= targetWeekEnd)
    .sort((a,b) => a.timestamp - b.timestamp);

  const container = document.getElementById('weekSessionsContainer');

  if (!weekLogs.length) {
    container.innerHTML = '<div class="week-empty">😴 Aucune séance cette semaine</div>';
    return;
  }

  const SET_TYPE_LABELS = { warmup:'Échauf.', drop:'Drop', failure:'Échec', superset:'SS', normal:'' };

  container.innerHTML = weekLogs.map((session, si) => {
    const dt = new Date(session.timestamp);
    const dayShort = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][dt.getDay()];
    const dayNum = dt.getDate();
    const nbExos = session.exercises.length;
    const volStr = session.volume > 0 ? (session.volume / 1000).toFixed(2) : '0';

    // Meta chips
    const metaParts = [];
    if (session.type) metaParts.push(session.type);
    metaParts.push(nbExos + ' exo' + (nbExos > 1 ? 's' : ''));
    const metaHtml = metaParts.map((p, i) => (i > 0 ? '<span class="sc-meta-dot"></span>' : '') + '<span>' + p + '</span>').join('');

    // Exercise rows
    const exoCards = session.exercises.map((exo, ei) => {
      const ms = _ecMuscleStyle(exo.name);
      const exoType = exo.exoType || getExoType(exo.name);
      let bestStr = '—';
      if (exoType === 'cardio' || exoType === 'cardio_stairs') {
        const p = [];
        if (exo.distance) p.push(exo.distance.toFixed(1) + 'km');
        if (exo.maxTime) p.push(formatTime(exo.maxTime));
        bestStr = p.join(' · ') || 'Cardio';
      } else if (exoType === 'time') {
        bestStr = (exo.maxTime && exo.maxTime > 1) ? Math.floor(exo.maxTime / 60) + ':' + String(exo.maxTime % 60).padStart(2, '0') : '—';
      } else if (exoType === 'reps') {
        bestStr = exo.maxReps ? exo.maxReps + ' reps' : (exo.maxRM > 0 ? exo.maxRM + 'kg' : '—');
      } else {
        bestStr = exo.maxRM > 0 ? exo.maxRM + 'kg' : '—';
      }

      const exoId = 'sc-exo-' + si + '-' + ei;

      // Build sets detail from allSets
      const sets = (exo.allSets && exo.allSets.length > 0) ? exo.allSets : (exo.series || []);
      let setsHtml = '';
      if (sets.length > 0) {
        const setHdr = '<div class="sc-set-hdr"><span>Set</span><span>Poids</span><span>Reps</span><span>Type</span></div>';
        // Find the best e1RM set for PR marking
        let bestE1RM = 0;
        sets.forEach(s => { if ((s.weight || 0) > 0 && (s.reps || 0) > 0) { const e = calcE1RM(s.weight, s.reps); if (e > bestE1RM) bestE1RM = e; } });

        const setRows = sets.map((s, setIdx) => {
          const st = s.setType || 'normal';
          const w = s.weight || 0;
          const r = s.reps || 0;
          const isPRSet = w > 0 && r > 0 && calcE1RM(w, r) === bestE1RM && bestE1RM > 0 && st === 'normal';
          const rowCls = isPRSet ? 'pr-set' : st;
          const tagText = isPRSet ? 'PR' : (SET_TYPE_LABELS[st] || '');
          const tagHtml = tagText ? '<span class="sc-set-tag">' + tagText + '</span>' : '';
          return '<div class="sc-set-row ' + rowCls + '">' +
            '<span class="sc-set-num">' + (setIdx + 1) + '</span>' +
            '<span class="sc-set-w">' + (w > 0 ? w + 'kg' : '—') + '</span>' +
            '<span class="sc-set-r">' + (r > 0 ? r : '—') + '</span>' +
            tagHtml + '</div>';
        }).join('');

        // Footer with volume
        const exoVol = sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
        const footHtml = exoVol > 0 ? '<div class="sc-exo-footer"><span class="sc-exo-vol">' + (exoVol / 1000).toFixed(2) + 't vol.</span><span>' + sets.length + ' séries</span></div>' : '';

        setsHtml = '<div class="sc-exo-detail" id="' + exoId + '"><div class="sc-sets">' + setHdr + setRows + '</div>' + footHtml + '</div>';
      }

      return '<div class="sc-exo">' +
        '<div class="sc-exo-head" onclick="toggleScExo(\'' + exoId + '\')">' +
        '<div class="sc-exo-ico" style="background:' + ms.bg + ';">' + ms.icon + '</div>' +
        '<span class="sc-exo-name">' + exo.name + '</span>' +
        '<span class="sc-exo-best">' + bestStr + '</span>' +
        '<span class="sc-exo-chev" id="chev-' + exoId + '">▾</span>' +
        '</div>' + setsHtml + '</div>';
    }).join('');

    const sessId = 'sess-' + si;
    return '<div class="sc">' +
      '<div class="sc-head" onclick="toggleSession(\'' + sessId + '\')">' +
      '<div class="sc-day-badge" style="background:rgba(191,90,242,0.12);color:var(--purple);">' +
        '<span class="d-name">' + dayShort + '</span><span class="d-num">' + dayNum + '</span></div>' +
      '<div class="sc-info"><div class="sc-title">' + (session.title || 'Séance') + '</div>' +
        '<div class="sc-meta">' + metaHtml + '</div></div>' +
      '<div class="sc-right"><div class="sc-vol">' + volStr + '<span>t</span></div></div>' +
      '</div>' +
      '<div class="sc-body" id="' + sessId + '">' +
        exoCards +
        '<div class="sc-delete"><button class="sc-delete-btn" onclick="deleteSessionFromList(\'' + session.id + '\')">Supprimer</button></div>' +
      '</div></div>';
  }).join('');
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
    saveDB(); renderSeancesTab(); showToast('✓ Séance supprimée');
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
let currentMuscleView = 'bars';
let chartMuscleEvol = null;

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
let liftsMuscleFilter = 'Tout';

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

function renderDashReports() {
  purgeExpiredReports();
  const reports = db.reports.filter(r => r.expires_at > Date.now()).sort((a, b) => b.created_at - a.created_at);
  const card = document.getElementById('acc-dash-reports-card');
  const badge = document.getElementById('dashReportsBadge');
  if (!card) return;
  if (!reports.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  const unread = reports.filter(r => !r.read).length;
  if (badge) { badge.textContent = unread; badge.style.display = unread ? '' : 'none'; }
  const container = document.getElementById('acc-dash-reports');
  if (!container) return;
  container.innerHTML = '<div style="padding-top:4px;">' +
    reports.map(r => {
      const typeLabel = r.type === 'debrief' ? '🏋️ Débrief Séance' : '📊 Bilan Hebdo';
      const dl = daysLeft(r.expires_at);
      const unreadDot = r.read ? '' : '<span class="report-new-dot"></span>';
      return '<div class="report-card ' + r.type + '" style="margin-bottom:8px;">' +
        '<div class="report-card-header"><div class="report-card-type">' + unreadDot + ' ' + typeLabel + '</div>' +
        '<div style="text-align:right;"><div class="report-card-date">' + timeAgo(r.created_at) + '</div>' +
        '<div class="report-card-expiry">⏳ ' + dl + 'j restants</div></div></div>' +
        '<div class="report-card-body" id="dr-body-' + r.id + '" style="display:none;"><div class="ai-response-content">' + r.html + '</div></div>' +
        '<button class="report-toggle" onclick="toggleDashReport(\'' + r.id + '\')">Voir ▾</button>' +
        '</div>';
    }).join('') + '</div>';
}

function toggleDashReport(id) {
  const body = document.getElementById('dr-body-' + id);
  if (!body) return;
  const btn = body.parentElement.querySelector('.report-toggle');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.textContent = isOpen ? 'Voir ▾' : 'Masquer ▴';
}

function renderDashWeeklyPlan() {
  const card = document.getElementById('acc-dash-weekly-card');
  const badge = document.getElementById('dashWeeklyBadge');
  const container = document.getElementById('acc-dash-weekly');
  if (!card || !container) return;
  const plan = db.weeklyPlan;
  if (!plan || !plan.days || !plan.days.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  if (badge) badge.style.display = '';
  const todayName = DAYS_FULL[new Date().getDay()];
  const orderedDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  container.innerHTML = '<div style="padding-top:4px;">' +
    orderedDays.map(day => {
      const d = plan.days.find(p => p.day === day);
      if (!d) return '';
      const isToday = day === todayName;
      const isRest = d.rest;
      const dayColor = isRest ? 'var(--sub)' : isToday ? 'var(--blue)' : 'var(--text)';
      const exoPreview = !isRest && d.exercises && d.exercises.length
        ? '<div style="font-size:11px;color:var(--sub);margin-top:2px;">' +
          d.exercises.slice(0, 3).map(e => e.name).join(' · ') +
          (d.exercises.length > 3 ? ' +' + (d.exercises.length - 3) : '') + '</div>'
        : '';
      return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--border);">' +
        '<div><span style="font-size:13px;font-weight:' + (isToday ? '800' : '600') + ';color:' + dayColor + ';">' + (isToday ? '▶ ' : '') + day.substring(0, 3) + '</span>' +
        exoPreview + '</div>' +
        '<span style="font-size:11px;color:' + (isRest ? 'var(--sub)' : 'var(--green)') + ';">' + (isRest ? '😴 Repos' : '💪 ' + (d.exercises || []).length + ' exos') + '</span>' +
        '</div>';
    }).join('') +
    '<button onclick="showTab(\'tab-ai\')" style="margin-top:12px;width:100%;background:transparent;border:1px solid var(--border);color:var(--sub);border-radius:10px;padding:10px;font-size:12px;cursor:pointer;">Voir le programme complet →</button>' +
    '</div>';
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
const _accDirty = { records: true, keylifts: true, prog: true };

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
  // Mark lazy accordions as dirty so they render on open
  _accDirty.records = true;
  _accDirty.keylifts = true;
  _accDirty.prog = true;
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
// SBD CHART VIEWS
// ============================================================
function setSBDView(view) {
  window._sbdView = view;
  document.querySelectorAll('[data-sbd]').forEach(b => b.classList.toggle('active', b.dataset.sbd === view));
  if (view === 'bar') renderSBDBar(); else renderSBDLine();
}
function renderSBDBar() {
  const ctx = document.getElementById('chartSBD'); if (!ctx) return;
  if (chartSBD) chartSBD.destroy();
  chartSBD = new Chart(ctx, {
    type: 'bar',
    data: { labels: ['Bench','Squat','Dead'], datasets: [
      { label:'1RM Actuel', data: SBD_TYPES.map(t=>db.bestPR[t]), backgroundColor:['#0A84FF','#32D74B','#FF9F0A'], borderRadius:8, barThickness:35 },
      { label:'1RM Visé', data: SBD_TYPES.map(t=>db.user.targets[t]), backgroundColor:['rgba(10,132,255,0.3)','rgba(50,215,75,0.3)','rgba(255,159,10,0.3)'], borderColor:['#0A84FF','#32D74B','#FF9F0A'], borderWidth:2, borderDash:[5,5], barThickness:35 }
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, labels:{ color:'#F5F5F7', font:{size:11} } }, tooltip:{ callbacks:{ afterLabel(c){ const t=SBD_TYPES[c.dataIndex]; return c.datasetIndex===0?'':' Reste: '+(db.user.targets[t]-db.bestPR[t])+'kg'; } } } }, scales:{ y:{ grid:{color:'#2C2C2E'}, ticks:{color:'#86868B'} }, x:{ grid:{display:false}, ticks:{color:'#F5F5F7',font:{weight:'bold'}} } } }
  });
}
function renderSBDLine() {
  const ctx = document.getElementById('chartSBD'); if (!ctx) return;
  if (chartSBD) chartSBD.destroy();
  const colors = { bench:'#0A84FF', squat:'#32D74B', deadlift:'#FF9F0A' };
  const typeData = {};
  SBD_TYPES.forEach(type => {
    typeData[type] = []; let max = 0;
    [...db.logs].sort((a,b) => a.timestamp-b.timestamp).forEach(log => {
      log.exercises.forEach(exo => { if (getSBDType(exo.name)===type && exo.maxRM>0 && exo.maxRM>max) { max=exo.maxRM; typeData[type].push({x: log.shortDate||formatDate(log.timestamp), y:max}); } });
    });
  });
  const allDates = new Set(); SBD_TYPES.forEach(type => typeData[type].forEach(p => allDates.add(p.x)));
  const sortedDates = [...allDates].sort((a,b) => { const pa=a.split('/'),pb=b.split('/'); return new Date(+pa[2],+pa[1]-1,+pa[0])-new Date(+pb[2],+pb[1]-1,+pb[0]); });
  const datasets = SBD_TYPES.filter(type => typeData[type].length>0).map(type => ({
    label: type[0].toUpperCase()+type.slice(1), data: typeData[type], borderColor:colors[type], backgroundColor:'transparent',
    borderWidth:3, pointRadius:3, pointBackgroundColor:colors[type], pointBorderColor:'transparent', pointHoverRadius:5, tension:0.4, fill:false
  }));
  if (!datasets.length) { renderSBDBar(); return; }
  chartSBD = new Chart(ctx, {
    type:'line', data:{ labels:sortedDates, datasets },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:true,labels:{color:'#F5F5F7',font:{size:11},boxWidth:12}} },
      scales:{ x:{type:'category',grid:{color:'#2C2C2E'},ticks:{color:'#86868B',font:{size:10},maxRotation:0,callback:function(val,i){const lbl=this.getLabelForValue(val);return i%Math.max(1,Math.floor(sortedDates.length/8))===0?lbl.substring(0,5):''}}}, y:{grid:{color:'#2C2C2E'},ticks:{color:'#86868B',callback:v=>v+'kg'}} }
    }
  });
}

// ============================================================
// COACH ALGO — render dans tab-ai
// ============================================================
function renderCoachAlgoAI() {
  const el = document.getElementById('coachAlgoContentAI'); if (!el) return;
  if (db.logs.length === 0) { el.innerHTML = '<div style="text-align:center;padding:12px 0;color:var(--sub);font-size:13px;line-height:1.7;">Aucune séance importée.<br><span style="font-size:12px;">Réglages → 📥 Importer des Séances</span></div>'; return; }
  el.innerHTML = generateCoachAlgoMessage();
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

function generateWeeklyPlan() {
  const btn = document.getElementById('wpGenerateBtn');
  btn.disabled = true; btn.textContent = 'Calcul en cours...';
  const weekNum = parseInt(document.getElementById('wpBlocSelect').value);
  const wi = weekNum - 1; // 0-based index

  // Pre-sort once for all computeExoTrend calls
  const _logsByDesc = [...db.logs].sort((a,b) => b.timestamp - a.timestamp);

  // ── Niveau de l'athlète ──────────────────────────────────────
  // Ajuste la vitesse de progression et l'intensité maximale
  const LEVEL = db.user.level || 'intermediaire';
  const LVL = {
    //                loadOfs : décalage du % de charge de base
    //                progFactor : multiplicateur des bonuses de progression
    //                rpeMax : plafond RPE (on ne va jamais au-delà)
    debutant:      { loadOfs:+0.02, progFactor:0.6,  rpeMax:8.0 },
    intermediaire: { loadOfs: 0.00, progFactor:1.0,  rpeMax:9.0 },
    avance:        { loadOfs:-0.02, progFactor:1.3,  rpeMax:9.5 },
    competiteur:   { loadOfs:-0.04, progFactor:1.6,  rpeMax:10  },
  }[LEVEL] || { loadOfs:0, progFactor:1, rpeMax:9 };

  // ── Catégorie d'exercice ─────────────────────────────────────
  function getExoCategory(name) {
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if (/squat|deadlift|souleve|bench\s*(press|barre|couche)?|developpe\s*couche/.test(n)) return 'big';
    if (/overhead|militaire|\bohp\b|rowing\b|tirage|row\b|traction|pull.?up|chin.?up|\bdips?\b|rdl|roumain|hip\s*thrust|pouss[ée]e\s*de\s*hanche|leg\s*press|presse\s*(a\s*)?cuisses|fentes?|\blunge|good\s*morning/.test(n)) return 'compound';
    return 'isolation';
  }

  // ── Schémas reps/séries/RPE par catégorie et mode d'entraînement ──
  const SCHEMES = {
    powerlifting: {
      big:       { reps:[5,  5,  3,  2 ], sets:[4,4,4,3], rpe:[7,  8,  8.5,9  ], rest:210 },
      compound:  { reps:[10, 8,  6,  5 ], sets:[3,4,4,3], rpe:[7,  7.5,8,  8.5], rest:150 },
      isolation: { reps:[15, 12, 12, 12], sets:[3,4,4,3], rpe:[7,  7,  7.5,7  ], rest:90  },
    },
    force_athletique: {
      big:       { reps:[5,  5,  3,  2 ], sets:[4,4,4,3], rpe:[7,  8,  8.5,9  ], rest:210 },
      compound:  { reps:[10, 8,  6,  5 ], sets:[3,4,4,3], rpe:[7,  7.5,8,  8.5], rest:150 },
      isolation: { reps:[15, 12, 12, 12], sets:[3,4,4,3], rpe:[7,  7,  7.5,7  ], rest:90  },
    },
    bodybuilding: {
      big:       { reps:[10, 8,  8,  6 ], sets:[4,4,5,4], rpe:[7,  7.5,8,  8.5], rest:150 },
      compound:  { reps:[12, 10, 10, 8 ], sets:[3,4,4,3], rpe:[7,  7.5,8,  8.5], rest:120 },
      isolation: { reps:[15, 12, 12, 10], sets:[3,4,4,4], rpe:[8,  8,  8.5,9  ], rest:75  },
    },
    bien_etre: {
      big:       { reps:[12, 12, 10, 10], sets:[3,3,3,3], rpe:[6,  6.5,7,  7  ], rest:120 },
      compound:  { reps:[12, 12, 10, 10], sets:[3,3,3,3], rpe:[6,  6.5,7,  7  ], rest:90  },
      isolation: { reps:[15, 15, 12, 12], sets:[2,3,3,3], rpe:[6,  6,  6.5,7  ], rest:60  },
    }
  };
  const SCHEME = SCHEMES[db.user.trainingMode] || SCHEMES.powerlifting;

  // ── Notes coach par semaine ──────────────────────────────────
  const WEEK_NOTES = [
    'Semaine de base — pose les fondations, pas d\'ego sur la barre.',
    'Accumulation — monte progressivement, technique avant tout.',
    'Intensification — charges lourdes, récupère bien entre séries.',
    LEVEL === 'avance' || LEVEL === 'competiteur'
      ? 'Peak — RPE max autorisé, tout sur la table.'
      : 'Peak — séances courtes et intenses, c\'est là que ça compte.',
  ];

  // ── Facteurs de charge par semaine ──────────────────────────
  // Semaine 4 = Peak : toujours 100% du théorique, pas de dékalage de niveau
  // (le niveau joue sur les semaines 1-3 uniquement)
  const LOAD_PCT = wi === 3
    ? 1.00
    : [0.88, 0.92, 0.96][wi] + LVL.loadOfs;

  // ── Tendance réelle par exercice (régression linéaire) ───────
  // Utilise les 6 sessions les plus RÉCENTES (pas les plus anciennes)
  function computeExoTrend(exoName) {
    const pts = [];
    // Trier décroissant (récent en premier), collecter les 6 dernières occurrences
    const desc = _logsByDesc;
    for (const log of desc) {
      const exo = log.exercises.find(e => e.name === exoName || matchExoName(e.name, exoName));
      if (!exo || !exo.maxRM || exo.maxRM <= 0) continue;
      pts.push({ x: log.timestamp / 86400000, y: exo.maxRM });
      if (pts.length >= 6) break;
    }
    if (pts.length < 2) return { kgPerWeek: 0, lastE1rm: pts[0]?.y || 0, n: pts.length };
    // Re-trier croissant pour la régression (x croissant = temps croissant)
    pts.sort((a,b) => a.x - b.x);
    const n = pts.length;
    const sumX = pts.reduce((s,p) => s+p.x, 0), sumY = pts.reduce((s,p) => s+p.y, 0);
    const sumXY = pts.reduce((s,p) => s+p.x*p.y, 0), sumX2 = pts.reduce((s,p) => s+p.x*p.x, 0);
    const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
    return { kgPerWeek: Math.round(slope*7*10)/10, lastE1rm: pts[pts.length-1].y, n };
  }

  // ── Fréquence hebdomadaire d'un exercice ─────────────────────
  // Compte le nombre de jours dans db.routineExos où cet exercice apparaît.
  function getExoFreqPerWeek(exoName) {
    let freq = 0;
    DAYS_FULL.forEach(day => {
      const dayExos = getProgExosForDay(day);
      if (dayExos.some(e => e === exoName || matchExoName(e, exoName))) freq++;
    });
    return freq || 1; // minimum 1 (évite la division par zéro)
  }

  // ── Agréger meilleurs records tous jours confondus ──────────
  const allBest = {};
  db.logs.forEach(log => {
    log.exercises.forEach(exo => {
      if (!allBest[exo.name]) allBest[exo.name] = { maxRM:0, maxRMDate:null, maxReps:0, maxTime:0, distance:0, repRecords:{}, _ts:0 };
      const r = allBest[exo.name];
      if ((exo.maxRM||0) > r.maxRM) { r.maxRM = exo.maxRM; r.maxRMDate = exo.maxRMDate || log.timestamp; }
      if ((exo.maxReps ||0) > r.maxReps)  r.maxReps  = exo.maxReps;
      if ((exo.maxTime ||0) > r.maxTime)  r.maxTime  = exo.maxTime;
      if ((exo.distance||0) > r.distance) r.distance = exo.distance;
      Object.entries(exo.repRecords||{}).forEach(([k,v]) => { if (!r.repRecords[k]||v>r.repRecords[k]) r.repRecords[k]=v; });
      if ((log.timestamp||0) > r._ts) r._ts = log.timestamp;
    });
  });

  // Cache: programme name → list of matching Hevy names (for resolveRecentRecord)
  const _progNameToHevyNames = {};

  // Résoudre un nom de programme → record dans allBest
  // En cas d'ambiguïté, préférer le plus récemment enregistré
  function resolveRecord(exoName) {
    if (allBest[exoName]) return allBest[exoName];
    const matches = Object.keys(allBest).filter(k => matchExoName(k, exoName) || matchExoName(exoName, k));
    if (!matches.length) return null;
    matches.sort((a,b) => (allBest[b]._ts||0) - (allBest[a]._ts||0));
    return allBest[matches[0]];
  }

  // ── Record RÉCENT (90 derniers jours) ───────────────────────
  // Pour la programmation, ce qui compte c'est ce que tu fais MAINTENANT,
  // pas ton PR de l'année dernière. Fallback sur all-time si rien de récent.
  function resolveRecentRecord(exoName) {
    const cutoff = Date.now() - 90 * 86400000;
    const recent = { maxRM: 0, maxReps: 0, maxTime: 0, distance: 0, repRecords: {} };
    // Find matching Hevy names once (cached)
    if (!_progNameToHevyNames[exoName]) {
      _progNameToHevyNames[exoName] = Object.keys(allBest).filter(k =>
        k === exoName || matchExoName(k, exoName) || matchExoName(exoName, k)
      );
    }
    const hevyNames = new Set([exoName, ..._progNameToHevyNames[exoName]]);

    db.logs
      .filter(l => l.timestamp >= cutoff)
      .forEach(log => {
        const exo = log.exercises.find(e => hevyNames.has(e.name));
        if (!exo) return;
        if ((exo.maxRM||0) > recent.maxRM) recent.maxRM = exo.maxRM;
        if ((exo.maxReps||0) > recent.maxReps) recent.maxReps = exo.maxReps;
        if ((exo.maxTime||0) > recent.maxTime) recent.maxTime = exo.maxTime;
        if ((exo.distance||0) > recent.distance) recent.distance = exo.distance;
        Object.entries(exo.repRecords||{}).forEach(([k,v]) => {
          if (!recent.repRecords[k] || v > recent.repRecords[k]) recent.repRecords[k] = v;
        });
      });
    const hasData = recent.maxRM > 0 || Object.keys(recent.repRecords).length > 0 || recent.maxReps > 0 || recent.maxTime > 0;
    return hasData ? recent : resolveRecord(exoName); // fallback all-time si rien de récent
  }

  // ── Calculer le poids de travail cible ──────────────────────
  // Toujours calculé depuis le meilleur e1RM estimé × LOAD_PCT de la semaine.
  // Garantit une progression monotone S1→S4 quel que soit le repRecord disponible.
  function computeWorkWeight(hist, tReps, cat, exoName) {
    const trend = exoName ? computeExoTrend(exoName) : { kgPerWeek:0, n:0 };

    // Ajustement tendance : progression forte → +kg ; régression → −kg
    let adj = 0;
    if (trend.n >= 3) {
      if (trend.kgPerWeek > 1.5)       adj = round05(Math.min(trend.kgPerWeek * 0.4, 5));
      else if (trend.kgPerWeek < -0.5) adj = round05(Math.max(trend.kgPerWeek * 0.5, -5));
    }

    // Meilleur e1RM depuis tous les repRecords disponibles
    const allRecs = Object.entries(hist?.repRecords||{})
      .map(([r,w]) => [parseInt(r), parseFloat(w)]).filter(([,w]) => w > 0);
    const bestE1rm = Math.max(
      hist?.maxRM || 0,
      ...(allRecs.length ? allRecs.map(([r,w]) => calcE1RM(w, r)) : [0])
    );
    if (bestE1rm <= 0) return null;

    // Charge cible = Epley(e1RM → tReps) × LOAD_PCT de la semaine
    const epleyTarget = bestE1rm * (1.0278 - 0.0278 * tReps);
    const workWeight  = round05(epleyTarget * LOAD_PCT + adj);
    return workWeight > 0 ? workWeight : null;
  }

  // ── Note coach dynamique par jour ───────────────────────────
  // Utilise detectPlateau() + calcMomentum() + computeExoTrend()
  // Priorité : plateau SBD > tendance principale > note générique semaine
  function buildDayCoachNote(dayExoNames) {
    if (!dayExoNames || !dayExoNames.length) return WEEK_NOTES[wi];

    // 1. Vérifier plateaux SBD pour les lifts présents ce jour
    for (const sbdType of ['squat', 'bench', 'deadlift']) {
      if (!dayExoNames.some(n => getSBDType(n) === sbdType)) continue;
      const plat = detectPlateau(sbdType, 3);
      if (plat) {
        const nm = sbdType === 'bench' ? 'Bench' : sbdType === 'squat' ? 'Squat' : 'Dead';
        return nm + ' en plateau — essaie une variante ou décharge légèrement.';
      }
      // Momentum fort → note positive
      const mom = calcMomentum(sbdType);
      if (mom !== null && mom > 1.5) {
        const nm = sbdType === 'bench' ? 'Bench' : sbdType === 'squat' ? 'Squat' : 'Dead';
        return nm + ' en feu (+' + mom + 'kg/sem) — reste sur cette lancée.';
      }
    }

    // 2. Tendance sur le premier exercice composé non-SBD du jour
    for (const exoName of dayExoNames.slice(0, 4)) {
      if (getSBDType(exoName)) continue;
      const cat = getExoCategory(exoName);
      if (cat === 'isolation') continue;
      const tr = computeExoTrend(exoName);
      if (tr.n < 3) continue;
      const short = exoName.split(' ').slice(0,2).join(' ');
      if (tr.kgPerWeek > 1.5) return short + ' progresse (+' + tr.kgPerWeek + 'kg/sem) — continue.';
      if (tr.kgPerWeek < -1)  return short + ' en recul — priorité technique, pas la charge.';
    }

    // 3. Note générique de la semaine
    return WEEK_NOTES[wi];
  }

  const routine = getRoutine();
  const plan = { week: weekNum, generated_at: new Date().toISOString(), days: [] };

  DAYS_FULL.forEach(day => {
    const label  = routine[day] || '';
    const isRest = !label || /repos|😴/i.test(label);
    const exercises = [];

    let exoNames = [];
    if (!isRest) {
      // Priorité 1 : exercices configurés dans Réglages
      exoNames = getProgExosForDay(day);
      // Priorité 2 : session la plus récente du même jour
      if (!exoNames.length) {
        const recent = [...db.logs]
          .filter(l => l.day === day && l.exercises.length > 0)
          .sort((a,b) => b.timestamp - a.timestamp)[0];
        if (recent) exoNames = recent.exercises.filter(e => !e.isCardio).slice(0,8).map(e => e.name);
      }

      exoNames.forEach(exoName => {
        const exoType = getExoType(exoName);
        const hist    = resolveRecentRecord(exoName); // basé sur les 90 derniers jours, pas all-time
        const cat     = getExoCategory(exoName);
        const sc      = SCHEME[cat] || SCHEME.isolation;
        const tReps   = sc.reps[wi];
        const rest    = (exoType === 'cardio' || exoType === 'cardio_stairs' || exoType === 'time') ? 0 : sc.rest;

        // RPE plafonné au niveau de l'athlète
        const tRpe = Math.min(sc.rpe[wi], LVL.rpeMax);

        // Fréquence hebdomadaire → ajuster le volume par séance
        // Si tu fais l'exercice 3×/sem → 1 série de moins par séance (charge cumulée)
        // Si 1×/sem → 1 série de plus (moins d'occasions, plus de volume par séance)
        const freq = (exoType === 'weight' || exoType === 'reps') ? getExoFreqPerWeek(exoName) : 1;
        const nSets = Math.max(2, sc.sets[wi] + (freq >= 3 ? -1 : freq === 1 ? +1 : 0));

        if (exoType === 'time') {
          // ── Gainage / isométrique — progression durée ────────
          const recSec  = hist?.maxTime || 30;
          const progSec = Math.round(recSec * (1 + wi * 0.08));
          exercises.push({ name:exoName, type:'time', restSeconds:0,
            sets: Array.from({length:3}, () => ({ isWarmup:false, durationSec:progSec })) });

        } else if (exoType === 'reps') {
          // ── BW ou lesté (tractions, pompes, dips…) ───────────
          const weightedRecs = Object.entries(hist?.repRecords||{})
            .map(([r,w]) => [parseInt(r), w]).filter(([,w]) => w > 0)
            .sort((a,b) => a[0] - b[0]);
          if (weightedRecs.length > 0) {
            const workW = computeWorkWeight(hist, tReps, cat, exoName);
            exercises.push({ name:exoName, type:'reps', restSeconds:rest,
              sets: Array.from({length:nSets}, () => ({ isWarmup:false, weight:workW, reps:tReps, rpe:tRpe })) });
          } else {
            // Poids de corps pur → % du max progressif
            // Cap à 25 : au-delà c'est probablement un total séance mal importé
            const recMax = Math.min(hist?.maxReps || 0, 25);
            const bwFactors = [0.75, 0.80, 0.85, 0.90];
            const target = recMax > 0 ? Math.max(3, Math.round(recMax * bwFactors[wi])) : 'max';
            exercises.push({ name:exoName, type:'reps', restSeconds:rest,
              sets: Array.from({length:nSets}, () => ({ isWarmup:false, weight:null, reps:target, rpe:tRpe })) });
          }

        } else if (exoType === 'cardio' || exoType === 'cardio_stairs') {
          // ── Cardio ───────────────────────────────────────────
          const recMin = hist?.maxTime ? Math.round(hist.maxTime/60) : 20;
          exercises.push({ name:exoName, type:'cardio', restSeconds:0,
            sets: [{ isWarmup:false, durationMin:recMin, distance:hist?.distance||null }] });

        } else {
          // ── Poids — N séries identiques au poids cible ───────
          let workWeight = computeWorkWeight(hist, tReps, cat, exoName);
          // Si exercice haltères et poids > 60kg/main → probablement des records barre mal attribués
          const eqType = getEquipmentType(exoName);
          if (workWeight && eqType === 'dumbbell' && workWeight > 60) {
            workWeight = round05(workWeight * DUMBBELL_TO_BARBELL_FACTOR);
          }
          if (workWeight && workWeight > 0) {
            // Échauffements adaptés : 2 paliers si gros lift, 1 si composé/isolation
            const warmups = cat === 'big'
              ? [ { isWarmup:true, weight:Math.max(20, round05(workWeight*0.4)), reps:8 },
                  { isWarmup:true, weight:Math.max(20, round05(workWeight*0.65)), reps:5 },
                  { isWarmup:true, weight:Math.max(20, round05(workWeight*0.85)), reps:2 } ]
              : [ { isWarmup:true, weight:Math.max(20, round05(workWeight*0.5)), reps:10 },
                  { isWarmup:true, weight:Math.max(20, round05(workWeight*0.75)), reps:5  } ];
            exercises.push({ name:exoName, type:'weight', restSeconds:rest, sets:[
              ...warmups,
              ...Array.from({length:nSets}, () => ({ isWarmup:false, weight:workWeight, reps:tReps, rpe:tRpe }))
            ]});
          } else {
            // Estimation depuis le poids de corps
            const bw = db.user.bw || 70;
            const lvl = db.user.level || 'intermediaire';
            const bwRatio = (BW_RATIOS[cat] || BW_RATIOS.compound)[lvl] || 0.5;
            const estimatedE1RM = bw * bwRatio;
            const epleyEst = estimatedE1RM * (1.0278 - 0.0278 * tReps);
            const estWork = round05(epleyEst * LOAD_PCT);
            if (estWork > 0) {
              const warmups = cat === 'big'
                ? [ { isWarmup:true, weight:Math.max(20, round05(estWork*0.4)), reps:8 },
                    { isWarmup:true, weight:Math.max(20, round05(estWork*0.65)), reps:5 },
                    { isWarmup:true, weight:Math.max(20, round05(estWork*0.85)), reps:2 } ]
                : [ { isWarmup:true, weight:Math.max(20, round05(estWork*0.5)), reps:10 },
                    { isWarmup:true, weight:Math.max(20, round05(estWork*0.75)), reps:5  } ];
              exercises.push({ name:exoName, type:'weight', restSeconds:rest, estimated:true, sets:[
                ...warmups,
                ...Array.from({length:nSets}, () => ({ isWarmup:false, weight:estWork, reps:tReps, rpe:tRpe }))
              ]});
            } else {
              exercises.push({ name:exoName, type:'weight', restSeconds:rest, sets:[], noData:true });
            }
          }
        }
      });
    }

    plan.days.push({ day, title: label || day, rest: isRest, coachNote: isRest ? '' : buildDayCoachNote(exoNames), exercises });
  });

  db.weeklyPlan = plan;
  saveDB();
  btn.disabled = false;
  btn.innerHTML = '✦ Générer le programme de la semaine';
  showToast('✅ Programme calculé !');
  renderWeeklyPlanUI();
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
  if (!plan) {
    genBtn.style.display = 'flex'; regenBtn.style.display = 'none'; meta.textContent = '';
    content.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--sub);font-size:13px;">Aucun programme généré.<br>Appuie sur le bouton pour créer ta semaine 🦍</div>';
    return;
  }
  genBtn.style.display = 'none'; regenBtn.style.display = 'block';
  if (select) select.value = String(plan.week || 1);
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
    const applyDayBtn = `<button onclick="wpApplyDay('${wpSelectedDay}')" style="margin-top:10px;padding:6px 14px;background:var(--green);border:none;color:#000;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">Appliquer ce jour au programme</button>`;
    const rdBanner = (wpSelectedDay === DAYS_FULL[new Date().getDay()]) ? getReadinessBannerHtml() : '';
    sessionHtml = `<div class="wp-session"><div class="wp-session-title">${sel.title || wpSelectedDay}</div>${rdBanner}${sel.coachNote?`<div class="wp-coach-note">🦍 ${sel.coachNote}</div>`:''}<div style="margin-top:14px;">${(sel.exercises||[]).map(renderWpExercise).join('')}</div>${applyDayBtn}</div>`;
  }
  const applyAllBtn = `<button onclick="wpApplyAll()" style="display:block;width:100%;margin:12px 0 4px;padding:10px;background:var(--blue);border:none;color:white;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">Appliquer toutes les suggestions au programme</button>`;
  content.innerHTML = `<div class="wp-bloc-badge">Semaine ${plan.week||1}</div>${applyAllBtn}<div class="wp-days">${pillsHtml}</div>${sessionHtml}`;
}

function wpApplyDay(day) {
  const plan = db.weeklyPlan;
  if (!plan || !plan.days) return;
  const dayData = plan.days.find(d => d.day === day && !d.rest);
  if (!dayData || !dayData.exercises || !dayData.exercises.length) return;
  if (!db.routineExos) db.routineExos = {};
  db.routineExos[day] = dayData.exercises.map(e => e.name);
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
      db.routineExos[d.day] = d.exercises.map(e => e.name);
    });
    saveDB();
    showToast('✓ Programme complet mis à jour');
    refreshUI();
  });
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
    else if (/overhead|militaire|\bohp\b|rowing\b|tirage|row\b|traction|pull.?up|chin.?up|\bdips?\b|rdl|roumain|hip\s*thrust|leg\s*press|presse|fentes?|\blunge|good\s*morning/.test(n)) typeTag = 'Composé';
  }

  // Summary
  const wrkSetsAll = sets.filter(s => !s.isWarmup);
  let summary = '';
  if (wrkSetsAll.length > 0 && type !== 'cardio' && type !== 'cardio_stairs' && !exo.noData) {
    const s0 = wrkSetsAll[0];
    if (type === 'time') {
      const sec = s0.durationSec || 0;
      summary = wrkSetsAll.length + '×' + (sec >= 60 ? Math.floor(sec/60) + 'min' + (sec%60 ? sec%60+'s' : '') : sec + 's');
    } else if (type === 'reps' && s0.weight > 0) {
      summary = wrkSetsAll.length + '×' + s0.reps + ' @ ' + s0.weight + 'kg';
    } else if (type === 'reps') {
      summary = wrkSetsAll.length + '×' + (s0.reps === 'max' ? 'max' : s0.reps);
    } else if (type === 'weight' && s0.weight > 0) {
      summary = wrkSetsAll.length + '×' + s0.reps + ' @ ' + s0.weight + 'kg';
    }
    if (s0.rpe && type !== 'time') summary += ' · RPE ' + s0.rpe;
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
    rows += wrk.map((s, i) => '<div class="wpe-set-row"><span class="wpe-set-num">S' + (i+1) + '</span><span class="wpe-set-charge">' + s.weight + 'kg</span><span class="wpe-set-reps">' + s.reps + '</span><span class="wpe-set-rpe">' + (s.rpe ? 'RPE ' + s.rpe : '—') + '</span></div>').join('');
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
      const rows = wrkSets.map((s, i) => '<div class="wpe-set-row"><span class="wpe-set-num">S' + (i+1) + '</span><span class="wpe-set-charge">' + s.weight + 'kg</span><span class="wpe-set-reps">' + (s.reps === 'max' ? 'max' : s.reps) + '</span><span class="wpe-set-rpe">' + (s.rpe ? 'RPE ' + s.rpe : '—') + '</span></div>').join('');
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
    const wup = sets.filter(s => s.isWarmup), wrk = sets.filter(s => !s.isWarmup);
    const hdr = '<div class="wpe-set-hdr"><span></span><span>Charge</span><span>Reps</span><span>RPE</span></div>';
    let rows = wup.map((s, i) => '<div class="wpe-set-row wpe-warmup"><span class="wpe-set-num">E' + (i+1) + '</span><span class="wpe-set-charge">' + s.weight + 'kg</span><span class="wpe-set-reps">' + s.reps + '</span><span>—</span></div>').join('');
    rows += wrk.map((s, i) => '<div class="wpe-set-row"><span class="wpe-set-num">S' + (i+1) + '</span><span class="wpe-set-charge">' + s.weight + 'kg</span><span class="wpe-set-reps">' + s.reps + '</span><span class="wpe-set-rpe">' + (s.rpe ? 'RPE ' + s.rpe : '—') + '</span></div>').join('');
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

// ============================================================
// EXO_DATABASE — Base d'exercices complète pour l'onglet GO
// ============================================================
const EXO_DATABASE = {
// ── PECS ──
bench_press_barbell:{id:'bench_press_barbell',name:'Développé Couché (Barre)',nameAlt:['Bench Press','Bench barre','DC barre'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Pecs'],secondaryMuscles:['Triceps','Épaules (antérieur)'],tertiaryMuscles:['Abdos (frontal)'],defaultRest:180,instructions:'1. Allongé sur le banc, pieds au sol, fessiers et omoplates plaqués\n2. Prise légèrement plus large que les épaules\n3. Descendre la barre au sternum en contrôlant (2-3s)\n4. Pousser vers le haut en expirant\n5. Verrouiller les coudes sans hyperextension'},
bench_press_dumbbell:{id:'bench_press_dumbbell',name:'Développé Couché (Haltères)',nameAlt:['Dumbbell Bench Press','DC haltères'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Pecs'],secondaryMuscles:['Triceps','Épaules (antérieur)'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Allongé sur le banc, un haltère dans chaque main\n2. Bras tendus au-dessus de la poitrine, paumes vers l\'avant\n3. Descendre les haltères de chaque côté du torse\n4. Pousser vers le haut en rapprochant les haltères\n5. Contrôler la descente'},
incline_bench_barbell:{id:'incline_bench_barbell',name:'Développé Incliné (Barre)',nameAlt:['Incline Bench Press','DI barre'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Pecs (haut)'],secondaryMuscles:['Triceps','Épaules (antérieur)'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Banc incliné à 30-45°, pieds au sol\n2. Prise légèrement plus large que les épaules\n3. Descendre la barre au haut de la poitrine\n4. Pousser vers le haut en expirant\n5. Garder les omoplates serrées'},
incline_bench_dumbbell:{id:'incline_bench_dumbbell',name:'Développé Incliné (Haltères)',nameAlt:['Incline Dumbbell Press','DI haltères'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Pecs (haut)'],secondaryMuscles:['Triceps','Épaules (antérieur)'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Banc incliné à 30-45°, un haltère dans chaque main\n2. Pousser les haltères vers le haut\n3. Descendre lentement de chaque côté\n4. Sentir l\'étirement en bas du mouvement\n5. Remonter en contractant les pecs'},
decline_bench:{id:'decline_bench',name:'Développé Décliné (Barre)',nameAlt:['Decline Bench Press','DD barre'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Pecs (bas)'],secondaryMuscles:['Triceps'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Banc décliné, pieds calés sous les supports\n2. Prise largeur d\'épaules ou légèrement plus large\n3. Descendre la barre vers le bas des pecs\n4. Pousser vers le haut\n5. Contrôler le mouvement en permanence'},
dumbbell_fly:{id:'dumbbell_fly',name:'Écarté Haltères',nameAlt:['Dumbbell Fly','Écarté couché'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Pecs'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Allongé sur le banc, bras tendus au-dessus de la poitrine\n2. Légère flexion des coudes maintenue tout le long\n3. Ouvrir les bras en arc de cercle\n4. Descendre jusqu\'à sentir l\'étirement des pecs\n5. Remonter en serrant les pecs'},
cable_fly:{id:'cable_fly',name:'Écarté Poulie',nameAlt:['Cable Fly','Cable Crossover','Vis-à-vis'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Pecs'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout entre les poulies, un pas en avant\n2. Bras ouverts, légère flexion des coudes\n3. Ramener les mains devant la poitrine en arc\n4. Serrer les pecs en fin de mouvement\n5. Revenir lentement en position de départ'},
machine_fly:{id:'machine_fly',name:'Écarté Machine (Pec Deck)',nameAlt:['Pec Deck','Machine Fly','Butterfly'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Pecs'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis sur la machine, dos bien calé\n2. Coudes à hauteur des épaules sur les supports\n3. Rapprocher les bras devant la poitrine\n4. Serrer les pecs 1-2s en fin de mouvement\n5. Revenir lentement en contrôlant'},
push_up:{id:'push_up',name:'Pompes',nameAlt:['Push-ups','Push up'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Pecs'],secondaryMuscles:['Triceps','Épaules (antérieur)'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Position planche, mains largeur d\'épaules\n2. Corps gainé de la tête aux pieds\n3. Descendre en pliant les coudes\n4. Poitrine frôle le sol\n5. Pousser pour remonter'},
diamond_push_up:{id:'diamond_push_up',name:'Pompes Diamant',nameAlt:['Diamond Push-ups'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Triceps'],secondaryMuscles:['Pecs'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Position pompe, mains rapprochées formant un diamant\n2. Pouces et index se touchent\n3. Descendre en gardant les coudes près du corps\n4. Remonter en poussant fort\n5. Garder le corps gainé'},
feet_elevated_push_up:{id:'feet_elevated_push_up',name:'Pompes Pieds Surélevés',nameAlt:['Decline Push-ups'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Pecs (haut)'],secondaryMuscles:['Triceps','Épaules (antérieur)'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Pieds sur un banc ou support surélevé\n2. Mains au sol, largeur d\'épaules\n3. Corps en ligne droite\n4. Descendre en contrôlant\n5. Pousser pour remonter'},
dips_chest:{id:'dips_chest',name:'Dips (Pecs)',nameAlt:['Chest Dips','Dips pectoraux'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Pecs (bas)'],secondaryMuscles:['Triceps','Épaules (antérieur)'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Barres parallèles, bras tendus\n2. Pencher le buste légèrement en avant\n3. Descendre en pliant les coudes\n4. Aller jusqu\'à 90° ou plus si mobilité le permet\n5. Remonter en poussant'},
cable_crossover:{id:'cable_crossover',name:'Cable Crossover',nameAlt:['Croisement poulie','Cross-over'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Pecs'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Poulies en position haute\n2. Un pas en avant, buste penché\n3. Tirer les câbles vers le bas et l\'avant\n4. Croiser les mains devant le bassin\n5. Remonter lentement'},
chest_press_machine:{id:'chest_press_machine',name:'Chest Press Machine',nameAlt:['Presse pectorale','Machine pecs'],equipment:'machine',category:'compound',trackingType:'weight',primaryMuscles:['Pecs'],secondaryMuscles:['Triceps'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Assis, dos bien calé contre le dossier\n2. Poignées à hauteur de poitrine\n3. Pousser les poignées vers l\'avant\n4. Tendre les bras sans verrouiller\n5. Revenir lentement'},
// ── DOS ──
barbell_row:{id:'barbell_row',name:'Rowing Barre',nameAlt:['Barbell Row','Bent-over Row'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Haut du dos','Biceps'],tertiaryMuscles:['Avant-bras'],defaultRest:150,instructions:'1. Debout, buste penché à 45°, barre en mains\n2. Prise pronation largeur d\'épaules\n3. Tirer la barre vers le nombril\n4. Serrer les omoplates en haut\n5. Redescendre lentement'},
dumbbell_row:{id:'dumbbell_row',name:'Rowing Haltère 1 Bras',nameAlt:['Dumbbell Row','One-arm Row'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Haut du dos','Biceps'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Un genou et une main sur le banc\n2. Haltère dans l\'autre main, bras tendu\n3. Tirer l\'haltère vers la hanche\n4. Serrer l\'omoplate en haut\n5. Redescendre en contrôlant'},
tbar_row:{id:'tbar_row',name:'Rowing T-Bar',nameAlt:['T-Bar Row'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Haut du dos','Biceps'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Debout au-dessus de la barre en T\n2. Prise serrée, buste penché\n3. Tirer vers la poitrine\n4. Serrer les omoplates\n5. Redescendre lentement'},
cable_row:{id:'cable_row',name:'Tirage Horizontal Câble',nameAlt:['Cable Row','Seated Cable Row'],equipment:'cable',category:'compound',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Haut du dos','Biceps'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Assis, pieds sur les supports, câble en mains\n2. Dos droit, poitrine sortie\n3. Tirer la poignée vers le nombril\n4. Serrer les omoplates 1-2s\n5. Relâcher lentement en tendant les bras'},
pull_up_pronation:{id:'pull_up_pronation',name:'Tractions Pronation',nameAlt:['Pull-ups','Tractions'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Biceps','Haut du dos'],tertiaryMuscles:['Avant-bras'],defaultRest:150,instructions:'1. Barre fixe, prise pronation large\n2. Partir bras tendus\n3. Tirer en amenant le menton au-dessus de la barre\n4. Descendre lentement\n5. Éviter le balancement'},
pull_up_supination:{id:'pull_up_supination',name:'Tractions Supination (Chin-up)',nameAlt:['Chin-ups','Tractions supination'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Grand dorsal','Biceps'],secondaryMuscles:['Haut du dos'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Barre fixe, prise supination (paumes vers soi)\n2. Prise largeur d\'épaules\n3. Tirer en amenant le menton au-dessus\n4. Serrer les biceps et le dos en haut\n5. Redescendre en contrôlant'},
pull_up_neutral:{id:'pull_up_neutral',name:'Tractions Prise Neutre',nameAlt:['Neutral Grip Pull-ups'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Biceps','Haut du dos'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Poignées parallèles, paumes face à face\n2. Bras tendus en position basse\n3. Tirer jusqu\'au menton au-dessus des mains\n4. Contrôler la descente\n5. Amplitude complète'},
lat_pulldown_wide:{id:'lat_pulldown_wide',name:'Tirage Vertical Prise Large',nameAlt:['Lat Pulldown','Tirage poulie haute'],equipment:'cable',category:'compound',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Biceps','Haut du dos'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Assis, cuisses calées sous les supports\n2. Prise large pronation sur la barre\n3. Tirer la barre vers le haut de la poitrine\n4. Serrer les omoplates en bas\n5. Remonter lentement en contrôlant'},
lat_pulldown_close:{id:'lat_pulldown_close',name:'Tirage Vertical Prise Serrée',nameAlt:['Close Grip Pulldown'],equipment:'cable',category:'compound',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Biceps'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Poignée en V ou prise serrée\n2. Assis, dos droit\n3. Tirer vers le sternum\n4. Coudes près du corps\n5. Remonter en contrôlant l\'étirement'},
lat_pulldown_neutral:{id:'lat_pulldown_neutral',name:'Tirage Vertical Prise Neutre',nameAlt:['Neutral Grip Pulldown'],equipment:'cable',category:'compound',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Biceps'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Poignée à prises parallèles\n2. Tirer vers la poitrine\n3. Garder le buste légèrement incliné\n4. Serrer le dos en bas du mouvement\n5. Contrôler la remontée'},
seated_row_machine:{id:'seated_row_machine',name:'Tirage Horizontal Machine',nameAlt:['Seated Row Machine'],equipment:'machine',category:'compound',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Haut du dos'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Assis, poitrine contre le support\n2. Saisir les poignées\n3. Tirer vers soi en serrant les omoplates\n4. Tenir 1s en contraction\n5. Relâcher lentement'},
face_pull:{id:'face_pull',name:'Face Pull',nameAlt:['Tirage visage'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Épaules (postérieur)'],secondaryMuscles:['Haut du dos'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Poulie haute avec corde\n2. Tirer vers le visage, coudes hauts\n3. Écarter les mains en fin de mouvement\n4. Rotation externe des épaules\n5. Revenir lentement'},
inverted_row:{id:'inverted_row',name:'Rowing Inversé',nameAlt:['Inverted Row','Australian Pull-up'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Haut du dos'],secondaryMuscles:['Grand dorsal','Biceps'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Sous une barre basse, corps en planche\n2. Prise pronation ou supination\n3. Tirer la poitrine vers la barre\n4. Serrer les omoplates\n5. Redescendre en contrôlant'},
pullover_cable:{id:'pullover_cable',name:'Pullover (Câble)',nameAlt:['Cable Pullover','Pullover poulie'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Grand dorsal'],secondaryMuscles:['Pecs'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout face à la poulie haute\n2. Bras tendus, saisir la barre ou corde\n3. Tirer vers les cuisses en gardant les bras tendus\n4. Contracter les dorsaux en bas\n5. Remonter lentement'},
// ── JAMBES ──
squat_barbell:{id:'squat_barbell',name:'Squat Barre',nameAlt:['Back Squat','Squat arrière'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers','Lombaires'],tertiaryMuscles:['Abdos (frontal)'],defaultRest:180,instructions:'1. Barre sur les trapèzes, pieds largeur d\'épaules\n2. Descendre en poussant les hanches en arrière\n3. Cuisses au moins parallèles au sol\n4. Pousser sur les talons pour remonter\n5. Garder le dos droit et la poitrine haute'},
front_squat:{id:'front_squat',name:'Front Squat',nameAlt:['Squat avant'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers','Abdos (frontal)'],tertiaryMuscles:[],defaultRest:180,instructions:'1. Barre sur les deltoïdes avant, coudes hauts\n2. Pieds largeur d\'épaules\n3. Descendre en gardant le buste très droit\n4. Cuisses parallèles ou plus bas\n5. Remonter en gardant les coudes hauts'},
goblet_squat:{id:'goblet_squat',name:'Goblet Squat',nameAlt:['Squat gobelet'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Haltère tenu verticalement contre la poitrine\n2. Pieds légèrement plus larges que les épaules\n3. Descendre profond, coudes entre les genoux\n4. Pousser sur les talons pour remonter\n5. Garder le dos droit'},
bulgarian_split_squat:{id:'bulgarian_split_squat',name:'Squat Bulgare',nameAlt:['Bulgarian Split Squat','Fente bulgare'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Pied arrière sur un banc derrière soi\n2. Haltères en mains ou barre sur le dos\n3. Descendre le genou arrière vers le sol\n4. Genou avant ne dépasse pas les orteils\n5. Pousser sur le pied avant pour remonter'},
hack_squat:{id:'hack_squat',name:'Hack Squat Machine',nameAlt:['Hack Squat'],equipment:'machine',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Dos calé contre le support de la machine\n2. Pieds sur la plateforme, largeur d\'épaules\n3. Déverrouiller et descendre\n4. Cuisses parallèles au sol\n5. Pousser pour remonter'},
deadlift_conventional:{id:'deadlift_conventional',name:'Soulevé de Terre Conventionnel',nameAlt:['Deadlift','SDT conventionnel','Soulevé de terre'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Ischio-jambiers','Lombaires'],secondaryMuscles:['Grand dorsal','Trapèzes','Fessiers'],tertiaryMuscles:['Avant-bras'],defaultRest:180,instructions:'1. Pieds largeur de hanches, barre au-dessus des pieds\n2. Prise pronation ou mixte, mains hors des genoux\n3. Dos plat, poitrine haute, tirer la barre\n4. Pousser le sol avec les pieds\n5. Verrouiller hanches et genoux en haut'},
deadlift_sumo:{id:'deadlift_sumo',name:'Soulevé de Terre Sumo',nameAlt:['Sumo Deadlift','SDT sumo'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Ischio-jambiers','Fessiers'],secondaryMuscles:['Lombaires','Grand dorsal'],tertiaryMuscles:[],defaultRest:180,instructions:'1. Pieds très écartés, pointes vers l\'extérieur\n2. Prise entre les jambes, bras verticaux\n3. Dos plat, poitrine haute\n4. Pousser les genoux vers l\'extérieur\n5. Tirer en tendant les hanches'},
rdl_barbell:{id:'rdl_barbell',name:'Romanian Deadlift (Barre)',nameAlt:['RDL','Soulevé de terre roumain'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Ischio-jambiers'],secondaryMuscles:['Lombaires','Fessiers'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Debout, barre en mains, jambes quasi tendues\n2. Pousser les hanches en arrière\n3. Descendre la barre le long des jambes\n4. Sentir l\'étirement des ischios\n5. Remonter en contractant les fessiers'},
deadlift_deficit:{id:'deadlift_deficit',name:'Soulevé de Terre Déficit',nameAlt:['Deficit Deadlift'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Ischio-jambiers','Lombaires'],secondaryMuscles:['Grand dorsal','Fessiers'],tertiaryMuscles:[],defaultRest:180,instructions:'1. Debout sur une plateforme de 5-10cm\n2. Même technique que le conventionnel\n3. Amplitude de mouvement augmentée\n4. Garder le dos plat\n5. Contrôler la descente'},
leg_press:{id:'leg_press',name:'Leg Press',nameAlt:['Presse à cuisses'],equipment:'machine',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Dos bien calé sur le siège\n2. Pieds sur la plateforme largeur d\'épaules\n3. Déverrouiller et descendre\n4. Genoux à 90° minimum\n5. Pousser sans verrouiller complètement'},
leg_extension:{id:'leg_extension',name:'Leg Extension',nameAlt:['Extension des jambes'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis, dos calé, chevilles sous le boudin\n2. Tendre les jambes vers l\'avant\n3. Contracter les quadriceps en haut\n4. Tenir 1s en extension\n5. Redescendre lentement'},
leg_curl_seated:{id:'leg_curl_seated',name:'Leg Curl Assis',nameAlt:['Seated Leg Curl'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Ischio-jambiers'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis, coussin sur les cuisses\n2. Chevilles sur le boudin supérieur\n3. Plier les genoux vers l\'arrière\n4. Contracter les ischios en bas\n5. Remonter lentement'},
leg_curl_lying:{id:'leg_curl_lying',name:'Leg Curl Couché',nameAlt:['Lying Leg Curl'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Ischio-jambiers'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Allongé face au sol sur la machine\n2. Chevilles sous le boudin\n3. Plier les genoux en amenant les talons aux fesses\n4. Contracter les ischios\n5. Redescendre en contrôlant'},
hip_thrust_barbell:{id:'hip_thrust_barbell',name:'Hip Thrust (Barre)',nameAlt:['Hip Thrust','Poussée de hanche'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Fessiers'],secondaryMuscles:['Ischio-jambiers'],tertiaryMuscles:['Lombaires'],defaultRest:150,instructions:'1. Haut du dos sur un banc, pieds au sol\n2. Barre sur les hanches avec protection\n3. Pousser les hanches vers le plafond\n4. Serrer les fessiers en haut (1-2s)\n5. Redescendre lentement'},
glute_bridge:{id:'glute_bridge',name:'Pont Fessier',nameAlt:['Glute Bridge'],equipment:'bodyweight',category:'isolation',trackingType:'reps',primaryMuscles:['Fessiers'],secondaryMuscles:['Ischio-jambiers'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Allongé au sol, genoux pliés, pieds à plat\n2. Pousser les hanches vers le haut\n3. Serrer les fessiers en haut\n4. Tenir 1-2s\n5. Redescendre lentement'},
hip_abduction:{id:'hip_abduction',name:'Abduction Machine',nameAlt:['Hip Abduction'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Fessiers'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis sur la machine, dos calé\n2. Jambes contre les coussins intérieurs\n3. Écarter les jambes vers l\'extérieur\n4. Tenir en contraction 1s\n5. Revenir lentement'},
hip_adduction:{id:'hip_adduction',name:'Adduction Machine',nameAlt:['Hip Adduction'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Fessiers'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis, dos calé, jambes écartées\n2. Ramener les jambes l\'une vers l\'autre\n3. Contracter les adducteurs\n4. Tenir 1s\n5. Revenir lentement'},
walking_lunge:{id:'walking_lunge',name:'Fentes Marchées',nameAlt:['Walking Lunges'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers','Ischio-jambiers'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Debout, haltères en mains\n2. Grand pas en avant\n3. Descendre le genou arrière vers le sol\n4. Pousser sur le pied avant pour avancer\n5. Alterner les jambes en marchant'},
forward_lunge:{id:'forward_lunge',name:'Fentes Avant',nameAlt:['Forward Lunges','Fentes'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Debout, haltères en mains\n2. Faire un grand pas en avant\n3. Descendre le genou arrière\n4. Pousser pour revenir en position initiale\n5. Alterner les jambes'},
step_up:{id:'step_up',name:'Step-Up',nameAlt:['Step Up','Montée sur banc'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Quadriceps'],secondaryMuscles:['Fessiers'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Face à un banc, haltère dans chaque main\n2. Monter un pied sur le banc\n3. Pousser pour monter complètement\n4. Redescendre en contrôlant\n5. Alterner les jambes'},
calf_raise_standing:{id:'calf_raise_standing',name:'Mollets Debout',nameAlt:['Standing Calf Raise','Mollets machine debout'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Mollets'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout sur la machine, épaules sous les coussins\n2. Pointes des pieds sur le rebord\n3. Monter sur la pointe des pieds\n4. Tenir 1s en haut\n5. Descendre lentement sous le niveau de la plateforme'},
calf_raise_seated:{id:'calf_raise_seated',name:'Mollets Assis',nameAlt:['Seated Calf Raise'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Mollets'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis, genoux sous les coussins\n2. Pointes des pieds sur le rebord\n3. Monter sur la pointe des pieds\n4. Contracter les mollets en haut\n5. Descendre lentement'},
calf_raise_press:{id:'calf_raise_press',name:'Mollets Presse',nameAlt:['Calf Press','Mollets leg press'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Mollets'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Sur la leg press, pieds en bas de la plateforme\n2. Seules les pointes des pieds sur le rebord\n3. Pousser en extension de cheville\n4. Amplitude maximale\n5. Redescendre lentement'},
// ── ÉPAULES ──
ohp_barbell:{id:'ohp_barbell',name:'Développé Militaire (Barre)',nameAlt:['OHP','Overhead Press','Press militaire'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Épaules (antérieur)'],secondaryMuscles:['Triceps','Pecs (haut)'],tertiaryMuscles:['Abdos (frontal)'],defaultRest:150,instructions:'1. Debout, barre au niveau des clavicules\n2. Prise légèrement plus large que les épaules\n3. Pousser la barre au-dessus de la tête\n4. Tendre les bras complètement\n5. Redescendre lentement aux clavicules'},
ohp_dumbbell:{id:'ohp_dumbbell',name:'Développé Militaire (Haltères)',nameAlt:['Dumbbell Shoulder Press','DM haltères'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Épaules (antérieur)'],secondaryMuscles:['Triceps'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Assis ou debout, haltères aux épaules\n2. Pousser les haltères au-dessus de la tête\n3. Rapprocher les haltères en haut\n4. Redescendre aux épaules\n5. Garder le dos droit'},
arnold_press:{id:'arnold_press',name:'Arnold Press',nameAlt:['Arnold'],equipment:'dumbbell',category:'compound',trackingType:'weight',primaryMuscles:['Épaules'],secondaryMuscles:['Triceps'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Assis, haltères devant le visage, paumes vers soi\n2. Écarter les coudes en tournant les poignets\n3. Pousser au-dessus de la tête\n4. Paumes vers l\'avant en haut\n5. Redescendre en inversant la rotation'},
lateral_raise_dumbbell:{id:'lateral_raise_dumbbell',name:'Élévation Latérale Haltères',nameAlt:['Lateral Raise','Élévation latérale'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Épaules (latéral)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout, haltères le long du corps\n2. Monter les bras sur les côtés\n3. Arrêter à hauteur d\'épaules\n4. Légère inclinaison vers l\'avant des poignets\n5. Redescendre lentement'},
lateral_raise_cable:{id:'lateral_raise_cable',name:'Élévation Latérale Câble',nameAlt:['Cable Lateral Raise'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Épaules (latéral)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout à côté de la poulie basse\n2. Saisir la poignée de la main opposée\n3. Monter le bras sur le côté\n4. Arrêter à hauteur d\'épaule\n5. Redescendre lentement'},
front_raise:{id:'front_raise',name:'Élévation Frontale',nameAlt:['Front Raise'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Épaules (antérieur)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout, haltères devant les cuisses\n2. Monter un bras ou les deux devant soi\n3. Arrêter à hauteur d\'épaules\n4. Garder les bras quasi tendus\n5. Redescendre lentement'},
rear_delt_fly_dumbbell:{id:'rear_delt_fly_dumbbell',name:'Oiseau Haltères',nameAlt:['Rear Delt Fly','Élévation postérieure'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Épaules (postérieur)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Penché en avant, buste presque horizontal\n2. Haltères sous la poitrine\n3. Écarter les bras sur les côtés\n4. Serrer les omoplates en haut\n5. Redescendre lentement'},
rear_delt_fly_cable:{id:'rear_delt_fly_cable',name:'Oiseau Poulie',nameAlt:['Cable Rear Delt Fly'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Épaules (postérieur)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Poulies à hauteur d\'épaules, croisées\n2. Tirer les câbles en écartant les bras\n3. Serrer les omoplates\n4. Bras à l\'horizontale\n5. Revenir lentement'},
upright_row:{id:'upright_row',name:'Upright Row',nameAlt:['Tirage menton','Rowing vertical'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Épaules (latéral)'],secondaryMuscles:['Trapèzes'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Debout, barre en mains prise serrée\n2. Tirer la barre vers le menton\n3. Coudes vers le haut et l\'extérieur\n4. Monter jusqu\'au niveau des épaules\n5. Redescendre lentement'},
shrugs_barbell:{id:'shrugs_barbell',name:'Shrugs Barre',nameAlt:['Barbell Shrugs','Haussements d\'épaules'],equipment:'barbell',category:'isolation',trackingType:'weight',primaryMuscles:['Trapèzes'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout, barre en mains, bras tendus\n2. Hausser les épaules vers les oreilles\n3. Tenir 1-2s en haut\n4. Redescendre lentement\n5. Ne pas rouler les épaules'},
shrugs_dumbbell:{id:'shrugs_dumbbell',name:'Shrugs Haltères',nameAlt:['Dumbbell Shrugs'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Trapèzes'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout, un haltère dans chaque main\n2. Bras le long du corps\n3. Hausser les épaules vers les oreilles\n4. Tenir en contraction\n5. Redescendre lentement'},
// ── BRAS ──
curl_barbell:{id:'curl_barbell',name:'Curl Barre',nameAlt:['Barbell Curl','Curl biceps barre'],equipment:'barbell',category:'isolation',trackingType:'weight',primaryMuscles:['Biceps'],secondaryMuscles:[],tertiaryMuscles:['Avant-bras'],defaultRest:90,instructions:'1. Debout, barre en supination\n2. Coudes près du corps\n3. Monter la barre en pliant les coudes\n4. Contracter les biceps en haut\n5. Redescendre lentement sans balancer'},
curl_dumbbell:{id:'curl_dumbbell',name:'Curl Haltères',nameAlt:['Dumbbell Curl','Curl biceps haltères'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Biceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout ou assis, un haltère dans chaque main\n2. Bras le long du corps, supination\n3. Monter en pliant les coudes\n4. Alterner ou simultané\n5. Contrôler la descente'},
hammer_curl:{id:'hammer_curl',name:'Curl Marteau',nameAlt:['Hammer Curl'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Biceps'],secondaryMuscles:['Avant-bras'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout, haltères en prise neutre (pouces en haut)\n2. Monter les haltères sans tourner les poignets\n3. Coudes fixes près du corps\n4. Contracter en haut\n5. Redescendre lentement'},
concentration_curl:{id:'concentration_curl',name:'Curl Concentré',nameAlt:['Concentration Curl'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Biceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis, coude appuyé sur l\'intérieur de la cuisse\n2. Haltère en supination\n3. Monter en contractant le biceps\n4. Tenir 1s en haut\n5. Redescendre lentement'},
incline_curl:{id:'incline_curl',name:'Curl Incliné',nameAlt:['Incline Curl'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Biceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Banc incliné à 45°, bras pendants\n2. Haltères en supination\n3. Monter en contractant les biceps\n4. Ne pas bouger les épaules\n5. Redescendre en étirant'},
preacher_curl:{id:'preacher_curl',name:'Curl Preacher (Larry Scott)',nameAlt:['Preacher Curl','Curl pupitre'],equipment:'barbell',category:'isolation',trackingType:'weight',primaryMuscles:['Biceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Bras sur le pupitre incliné\n2. Barre ou haltères en supination\n3. Monter en contractant les biceps\n4. Ne pas lever les coudes du pupitre\n5. Redescendre lentement'},
cable_curl:{id:'cable_curl',name:'Curl Câble',nameAlt:['Cable Curl'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Biceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Poulie basse, barre droite ou EZ\n2. Monter en pliant les coudes\n3. Coudes fixes, près du corps\n4. Contracter en haut\n5. Redescendre en contrôlant'},
tricep_pushdown:{id:'tricep_pushdown',name:'Extension Triceps Poulie Haute',nameAlt:['Tricep Pushdown','Pushdown'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Triceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Debout face à la poulie haute\n2. Barre ou corde, coudes au corps\n3. Tendre les bras vers le bas\n4. Contracter les triceps\n5. Remonter lentement sans bouger les coudes'},
skull_crusher:{id:'skull_crusher',name:'Skull Crusher',nameAlt:['Barre front','Lying Tricep Extension'],equipment:'barbell',category:'isolation',trackingType:'weight',primaryMuscles:['Triceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Allongé, barre tenue bras tendus au-dessus\n2. Plier les coudes, descendre la barre vers le front\n3. Coudes fixes, seuls les avant-bras bougent\n4. Remonter en tendant les bras\n5. Contrôler le mouvement'},
tricep_kickback:{id:'tricep_kickback',name:'Kickback Triceps',nameAlt:['Tricep Kickback'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Triceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Penché en avant, bras le long du corps\n2. Coude à 90°, haltère en main\n3. Tendre le bras vers l\'arrière\n4. Contracter le triceps\n5. Revenir à 90° lentement'},
dips_triceps:{id:'dips_triceps',name:'Dips Triceps',nameAlt:['Tricep Dips','Dips banc'],equipment:'bodyweight',category:'compound',trackingType:'reps',primaryMuscles:['Triceps'],secondaryMuscles:['Pecs (bas)','Épaules (antérieur)'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Barres parallèles, buste droit (vertical)\n2. Descendre en pliant les coudes vers l\'arrière\n3. Coudes près du corps\n4. Descendre à 90°\n5. Pousser pour remonter'},
french_press:{id:'french_press',name:'French Press',nameAlt:['Overhead Tricep Extension'],equipment:'barbell',category:'isolation',trackingType:'weight',primaryMuscles:['Triceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis ou debout, barre au-dessus de la tête\n2. Plier les coudes, descendre derrière la tête\n3. Coudes fixes vers le plafond\n4. Remonter en tendant les bras\n5. Contrôler le mouvement'},
jm_press:{id:'jm_press',name:'JM Press',nameAlt:[],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Triceps'],secondaryMuscles:['Pecs'],tertiaryMuscles:[],defaultRest:120,instructions:'1. Allongé, barre au-dessus comme un bench\n2. Descendre la barre vers le menton/nez\n3. Coudes vers l\'avant (pas sur les côtés)\n4. Mélange de skull crusher et bench\n5. Pousser vers le haut'},
close_grip_bench:{id:'close_grip_bench',name:'Développé Couché Prise Serrée',nameAlt:['Close Grip Bench Press','CGBP'],equipment:'barbell',category:'compound',trackingType:'weight',primaryMuscles:['Triceps'],secondaryMuscles:['Pecs'],tertiaryMuscles:[],defaultRest:150,instructions:'1. Allongé, prise serrée (mains largeur d\'épaules)\n2. Descendre la barre sur le sternum\n3. Coudes près du corps\n4. Pousser vers le haut\n5. Focus sur les triceps'},
wrist_curl:{id:'wrist_curl',name:'Curl Poignet',nameAlt:['Wrist Curl'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Avant-bras'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:60,instructions:'1. Assis, avant-bras sur les cuisses\n2. Poignets au-dessus des genoux, paumes vers le haut\n3. Monter les poignets en contractant\n4. Amplitude complète\n5. Redescendre lentement'},
wrist_extension:{id:'wrist_extension',name:'Extension Poignet',nameAlt:['Reverse Wrist Curl'],equipment:'dumbbell',category:'isolation',trackingType:'weight',primaryMuscles:['Avant-bras'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:60,instructions:'1. Avant-bras sur les cuisses, paumes vers le bas\n2. Monter les poignets vers le haut\n3. Contracter les extenseurs\n4. Amplitude complète\n5. Redescendre lentement'},
// ── ABDOS ──
crunch:{id:'crunch',name:'Crunch',nameAlt:['Crunch classique'],equipment:'bodyweight',category:'isolation',trackingType:'reps',primaryMuscles:['Abdos (frontal)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:60,instructions:'1. Allongé, genoux pliés, pieds au sol\n2. Mains derrière la tête ou sur la poitrine\n3. Décoller les épaules du sol\n4. Contracter les abdos\n5. Redescendre sans reposer la tête'},
cable_crunch:{id:'cable_crunch',name:'Crunch Câble',nameAlt:['Cable Crunch','Crunch poulie'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Abdos (frontal)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. À genoux face à la poulie haute\n2. Corde derrière la tête\n3. Enrouler le buste vers le sol\n4. Contracter les abdos\n5. Remonter lentement'},
machine_crunch:{id:'machine_crunch',name:'Crunch Machine',nameAlt:['Ab Crunch Machine'],equipment:'machine',category:'isolation',trackingType:'weight',primaryMuscles:['Abdos (frontal)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Assis sur la machine, pieds calés\n2. Mains sur les poignées\n3. Enrouler le buste vers l\'avant\n4. Contracter les abdos\n5. Revenir lentement'},
hanging_knee_raise:{id:'hanging_knee_raise',name:'Relevé de Genoux Suspendu',nameAlt:['Hanging Knee Raise'],equipment:'bodyweight',category:'isolation',trackingType:'reps',primaryMuscles:['Abdos (frontal)'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:90,instructions:'1. Suspendu à la barre fixe\n2. Monter les genoux vers la poitrine\n3. Enrouler le bassin\n4. Contracter les abdos en haut\n5. Redescendre lentement'},
hanging_leg_raise:{id:'hanging_leg_raise',name:'Relevé de Jambes Suspendu',nameAlt:['Hanging Leg Raise'],equipment:'bodyweight',category:'isolation',trackingType:'reps',primaryMuscles:['Abdos (frontal)'],secondaryMuscles:['Obliques'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Suspendu à la barre, jambes tendues\n2. Monter les jambes devant soi\n3. Aller le plus haut possible\n4. Contracter les abdos\n5. Redescendre sans balancer'},
plank:{id:'plank',name:'Planche',nameAlt:['Plank','Gainage frontal'],equipment:'bodyweight',category:'isolation',trackingType:'time',primaryMuscles:['Abdos (frontal)'],secondaryMuscles:['Obliques','Lombaires'],tertiaryMuscles:[],defaultRest:60,instructions:'1. Appui sur les avant-bras et les pointes de pieds\n2. Corps en ligne droite\n3. Serrer les abdos et les fessiers\n4. Ne pas laisser le bassin descendre\n5. Respirer normalement'},
side_plank:{id:'side_plank',name:'Gainage Latéral',nameAlt:['Side Plank'],equipment:'bodyweight',category:'isolation',trackingType:'time',primaryMuscles:['Obliques'],secondaryMuscles:['Abdos (frontal)'],tertiaryMuscles:[],defaultRest:60,instructions:'1. Sur le côté, appui sur un avant-bras\n2. Pieds superposés ou décalés\n3. Hanches soulevées, corps aligné\n4. Maintenir la position\n5. Alterner les côtés'},
ab_wheel:{id:'ab_wheel',name:'Ab Wheel',nameAlt:['Roue abdominale','Ab Roller'],equipment:'bodyweight',category:'isolation',trackingType:'reps',primaryMuscles:['Abdos (frontal)'],secondaryMuscles:['Lombaires'],tertiaryMuscles:[],defaultRest:90,instructions:'1. À genoux, mains sur la roue\n2. Rouler vers l\'avant en contrôlant\n3. Aller le plus loin possible\n4. Revenir en contractant les abdos\n5. Garder le dos plat'},
russian_twist:{id:'russian_twist',name:'Russian Twist',nameAlt:['Rotation russe'],equipment:'bodyweight',category:'isolation',trackingType:'reps',primaryMuscles:['Obliques'],secondaryMuscles:['Abdos (frontal)'],tertiaryMuscles:[],defaultRest:60,instructions:'1. Assis, buste incliné en arrière, pieds décollés\n2. Mains jointes ou avec poids\n3. Tourner le buste à gauche puis à droite\n4. Chaque rotation = 1 rep\n5. Garder les abdos contractés'},
wood_chop_cable:{id:'wood_chop_cable',name:'Wood Chop Câble',nameAlt:['Cable Wood Chop','Bûcheron'],equipment:'cable',category:'isolation',trackingType:'weight',primaryMuscles:['Obliques'],secondaryMuscles:['Abdos (frontal)'],tertiaryMuscles:[],defaultRest:90,instructions:'1. Poulie haute ou basse, debout de profil\n2. Tirer en diagonale de haut en bas\n3. Rotation du tronc contrôlée\n4. Bras quasi tendus\n5. Revenir lentement'},
// ── CARDIO ──
treadmill:{id:'treadmill',name:'Tapis Roulant',nameAlt:['Treadmill','Course tapis'],equipment:'machine',category:'cardio',trackingType:'cardio',primaryMuscles:['Cardio'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:300,instructions:'1. Monter sur le tapis à l\'arrêt\n2. Démarrer à vitesse basse\n3. Augmenter progressivement\n4. Garder une foulée naturelle\n5. Utiliser les barres si besoin pour l\'équilibre'},
stationary_bike:{id:'stationary_bike',name:'Vélo Stationnaire',nameAlt:['Stationary Bike','Vélo d\'appartement'],equipment:'machine',category:'cardio',trackingType:'cardio',primaryMuscles:['Cardio'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:300,instructions:'1. Régler la hauteur de selle\n2. Pieds sur les pédales\n3. Pédaler à rythme régulier\n4. Ajuster la résistance selon l\'objectif\n5. Garder le dos droit'},
elliptical:{id:'elliptical',name:'Vélo Elliptique',nameAlt:['Elliptical','Cross-trainer'],equipment:'machine',category:'cardio',trackingType:'cardio',primaryMuscles:['Cardio'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:300,instructions:'1. Pieds sur les pédales, mains sur les poignées\n2. Mouvement fluide, pas de choc\n3. Pousser et tirer avec les bras\n4. Garder le dos droit\n5. Ajuster la résistance'},
rowing_machine:{id:'rowing_machine',name:'Rameur',nameAlt:['Rowing Machine','Concept 2','Erg'],equipment:'machine',category:'cardio',trackingType:'cardio',primaryMuscles:['Cardio'],secondaryMuscles:['Grand dorsal'],tertiaryMuscles:[],defaultRest:300,instructions:'1. Pieds calés, genoux pliés\n2. Saisir la poignée, bras tendus\n3. Pousser avec les jambes d\'abord\n4. Puis tirer avec le dos et les bras\n5. Revenir en ordre inverse'},
swimming:{id:'swimming',name:'Natation',nameAlt:['Swimming','Nage'],equipment:'other',category:'cardio',trackingType:'cardio',primaryMuscles:['Cardio'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:300,instructions:'1. Échauffement progressif\n2. Alterner les nages si possible\n3. Respiration régulière\n4. Séries ou continu selon l\'objectif\n5. Récupération active entre les longueurs'},
jump_rope:{id:'jump_rope',name:'Corde à Sauter',nameAlt:['Jump Rope','Sauts corde'],equipment:'other',category:'cardio',trackingType:'cardio',primaryMuscles:['Cardio','Mollets'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:300,instructions:'1. Corde ajustée à sa taille\n2. Poignets souples, coudes au corps\n3. Petits sauts sur la pointe des pieds\n4. Garder le regard droit devant\n5. Rythme régulier'},
assault_bike:{id:'assault_bike',name:'Assault Bike',nameAlt:['Air Bike','Vélo assault'],equipment:'machine',category:'cardio',trackingType:'cardio',primaryMuscles:['Cardio'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:300,instructions:'1. Assis sur le vélo, pieds sur les pédales\n2. Mains sur les poignées mobiles\n3. Pédaler et pousser/tirer avec les bras\n4. Résistance augmente avec la vitesse\n5. Idéal pour le HIIT'},
stairmaster:{id:'stairmaster',name:'Stairmaster',nameAlt:['Stepper','Escalier'],equipment:'machine',category:'cardio',trackingType:'cardio',primaryMuscles:['Cardio','Quadriceps'],secondaryMuscles:[],tertiaryMuscles:[],defaultRest:300,instructions:'1. Monter sur la machine\n2. Saisir les poignées légèrement\n3. Monter les marches à rythme régulier\n4. Ne pas s\'appuyer sur les bras\n5. Ajuster la vitesse selon l\'objectif'},
};
// Nombre total d'exercices
// console.log('EXO_DATABASE:', Object.keys(EXO_DATABASE).length, 'exercices');

// ============================================================
// GO TAB — État, timers, auto-save, wake lock
// ============================================================
let activeWorkout = null;
let _goSessionTimerId = null;
let _goRestTimerId = null;
let _goAutoSaveId = null;
let _goWakeLock = null;
let _goSessionPaused = false;
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
    renderGoActiveView();
  } else {
    document.getElementById('goIdleView').style.display = 'block';
    document.getElementById('goActiveView').style.display = 'none';
    renderGoIdleView();
  }
}

// ── Idle View ──
function renderGoIdleView() {
  var todayDay = DAYS_FULL[new Date().getDay()];
  var routine = getRoutine();
  var sessionName = (routine && routine[todayDay]) ? routine[todayDay] : '';
  var hasDraft = !!localStorage.getItem('SBD_ACTIVE_WORKOUT');
  var h = '<div class="go-idle-wrap">' +
    '<div class="go-idle-icon">🏋️</div>' +
    '<div class="go-idle-title">Prêt à t\'entraîner ?</div>' +
    '<div class="go-idle-sub">' + todayDay + (sessionName ? ' · ' + sessionName : '') + '</div>' +
    '<button class="go-btn-main" onclick="goStartWorkout(true)">▶ Lancer la séance</button>' +
    '<button class="go-btn-sec" onclick="goStartWorkout(false)">📝 Séance vide</button>' +
    (hasDraft ? '<button class="go-btn-sec" onclick="goRestoreDraft()">📂 Reprendre brouillon</button>' : '') +
    '</div>';
  document.getElementById('goIdleView').innerHTML = h;
}

// ── Start Workout ──
function goStartWorkout(withProgram) {
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
      // Pre-add one empty set per exercise from program
      var prevData = goGetPreviousSets(name);
      var firstPrev = prevData && prevData.series.length > 0 ? prevData.series[0] : null;
      initSets.push({ weight: firstPrev ? (firstPrev.weight || 0) : 0, reps: firstPrev ? (firstPrev.reps || 0) : 0, type: 'normal', completed: false, rpe: null, duration: 0, distance: 0 });
      activeWorkout.exercises.push({
        exoId: exoId,
        name: name,
        sets: initSets,
        restSeconds: goGetDefaultRest(name, exoId),
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
  renderGoActiveView();
}

// ============================================================
// GO TAB — Active View Rendering
// ============================================================
function renderGoActiveView() {
  if (!activeWorkout) return;
  var elapsed = Math.floor((Date.now() - activeWorkout.startTime) / 1000);
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
  h += '<div><div class="go-header-label">SÉANCE EN COURS</div>';
  h += '<div class="go-header-timer" id="goTimerDisplay">' + goFormatTime(elapsed) + '</div></div>';
  h += '<div class="go-header-btns">';
  h += '<button class="go-header-btn" onclick="goTogglePause()">' + (_goSessionPaused ? '▶' : '⏸') + '</button>';
  h += '<button class="go-header-btn danger" onclick="goConfirmDiscard()">✕</button>';
  h += '<button class="go-header-btn" style="background:rgba(50,215,75,0.7);" onclick="goConfirmFinish()">✓</button>';
  h += '</div></div>';
  h += '<div class="go-counters">';
  h += '<div class="go-counter-box"><div class="go-counter-val" id="goCntTonnage">' + tonnageDisplay + '</div><div class="go-counter-lbl">Tonnage</div></div>';
  h += '<div class="go-counter-box"><div class="go-counter-val" id="goCntExos">' + totalExos + '</div><div class="go-counter-lbl">Exercices</div></div>';
  h += '<div class="go-counter-box"><div class="go-counter-val" id="goCntSets">' + totalSets + '</div><div class="go-counter-lbl">Séries</div></div>';
  h += '</div></div>';

  // ── Rest Timer (if active) ──
  if (activeWorkout.restTimer && activeWorkout.restTimer.running) {
    var rt = activeWorkout.restTimer;
    var exoNameRest = rt.exoIndex >= 0 && rt.exoIndex < activeWorkout.exercises.length ? activeWorkout.exercises[rt.exoIndex].name : '';
    h += '<div class="go-rest-timer">';
    h += '<div class="go-rest-timer-title">⏱ Timer repos</div>';
    h += '<div class="go-rest-timer-exo">' + exoNameRest + '</div>';
    h += '<div class="go-rest-timer-count" id="goRestDisplay">' + goFormatTime(rt.remaining) + '</div>';
    h += '<div class="go-rest-timer-rec">Repos recommandé : ' + goFormatRestBadge(rt.total) + '</div>';
    h += '<div class="go-rest-timer-btns">';
    h += '<button onclick="goAdjustRest(-30)">-30s</button>';
    h += '<button onclick="goAdjustRest(30)">+30s</button>';
    h += '<button class="skip" onclick="goSkipRest()">Passer</button>';
    h += '</div></div>';
  }

  // ── Muscle Distribution toggle ──
  h += '<div style="text-align:center;margin-bottom:10px;">';
  h += '<button class="go-btn-sec" style="width:auto;display:inline-flex;padding:8px 16px;font-size:12px;" onclick="_goMusclesExpanded=!_goMusclesExpanded;renderGoActiveView();">';
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

  var h = '<div class="go-exo-card">';
  // Header
  h += '<div class="go-exo-header">';
  h += '<div class="go-exo-icon" style="background:' + ms.bg + ';">' + ms.icon + '</div>';
  h += '<div class="go-exo-info"><div class="go-exo-name">' + exo.name + '</div>';
  if (e1rm > 0) h += '<div class="go-exo-e1rm">e1RM: ' + Math.round(e1rm) + 'kg</div>';
  h += '</div>';
  h += '<button class="go-exo-menu" onclick="goShowExoMenu(' + exoIdx + ')">⋮</button>';
  h += '</div>';

  // Notes
  h += '<div class="go-exo-notes"><input type="text" placeholder="Ajouter des notes ici..." value="' + (exo.notes || '').replace(/"/g, '&quot;') + '" onchange="activeWorkout.exercises[' + exoIdx + '].notes=this.value;goAutoSave();"></div>';

  // Rest badge
  h += '<div class="go-rest-badge" onclick="goEditRest(' + exoIdx + ')">⏱ Repos: ' + goFormatRestBadge(exo.restSeconds || 90) + '</div>';

  // Sets table
  h += '<div style="padding:0 8px;overflow-x:auto;">';
  h += '<table class="go-sets-table"><thead><tr>';
  h += '<th style="width:36px;">SÉRIE</th><th>PRÉCÉDENT</th>';
  if (tt === 'weight') { h += '<th>KG</th><th>RÉPS</th><th style="width:44px;">RPE</th>'; }
  else if (tt === 'reps') { h += '<th>RÉPS</th><th style="width:44px;">RPE</th>'; }
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
    // Start rest timer
    var restSec = activeWorkout.exercises[exoIdx].restSeconds || 90;
    goStartRestTimer(restSec, exoIdx);
  }
  goAutoSave();
  goUpdateCounters();
  renderGoActiveView();
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
  renderGoActiveView();
}

function goRemoveSet(exoIdx, setIdx) {
  activeWorkout.exercises[exoIdx].sets.splice(setIdx, 1);
  goAutoSave();
  goUpdateCounters();
  renderGoActiveView();
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
    if (activeWorkout.restTimer.remaining <= 0) {
      try { if (navigator.vibrate) navigator.vibrate(200); } catch(e) {}
      goSkipRest();
      renderGoActiveView();
    }
  }, 1000);
  renderGoActiveView();
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

function goEditRest(exoIdx) {
  var exo = activeWorkout.exercises[exoIdx];
  var items = [
    { icon: '⏱', label: '1 min', action: function() { exo.restSeconds = 60; renderGoActiveView(); } },
    { icon: '⏱', label: '1 min 30s', action: function() { exo.restSeconds = 90; renderGoActiveView(); } },
    { icon: '⏱', label: '2 min', action: function() { exo.restSeconds = 120; renderGoActiveView(); } },
    { icon: '⏱', label: '2 min 30s', action: function() { exo.restSeconds = 150; renderGoActiveView(); } },
    { icon: '⏱', label: '3 min', action: function() { exo.restSeconds = 180; renderGoActiveView(); } },
    { icon: '⏱', label: '4 min', action: function() { exo.restSeconds = 240; renderGoActiveView(); } },
    { icon: '⏱', label: '5 min', action: function() { exo.restSeconds = 300; renderGoActiveView(); } }
  ];
  goShowBottomSheet('Temps de repos', items);
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
  var overlay = document.createElement('div');
  overlay.className = 'go-bottom-sheet';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="go-sheet-box">' +
    '<div class="go-sheet-handle"></div>' +
    '<div class="go-sheet-title">📖 ' + exo.name + '</div>' +
    '<div style="font-size:13px;color:var(--text);line-height:1.8;white-space:pre-line;padding:0 4px;">' + data.instructions + '</div>' +
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
      if (exoIdx > 0) { var tmp = activeWorkout.exercises[exoIdx]; activeWorkout.exercises[exoIdx] = activeWorkout.exercises[exoIdx-1]; activeWorkout.exercises[exoIdx-1] = tmp; renderGoActiveView(); }
    }},
    { icon: '↕️', label: 'Déplacer vers le bas', action: function() {
      if (exoIdx < activeWorkout.exercises.length - 1) { var tmp = activeWorkout.exercises[exoIdx]; activeWorkout.exercises[exoIdx] = activeWorkout.exercises[exoIdx+1]; activeWorkout.exercises[exoIdx+1] = tmp; renderGoActiveView(); }
    }},
    { icon: '✕', label: 'Retirer l\'exercice', danger: true, action: function() {
      activeWorkout.exercises.splice(exoIdx, 1);
      goAutoSave();
      goUpdateCounters();
      renderGoActiveView();
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
    { icon: 'W', label: 'Série d\'Échauffement', action: function() { activeWorkout.exercises[exoIdx].sets[setIdx].type = 'warmup'; renderGoActiveView(); } },
    { icon: '#', label: 'Série Normale', action: function() { activeWorkout.exercises[exoIdx].sets[setIdx].type = 'normal'; renderGoActiveView(); } },
    { icon: 'F', label: 'Série Ratée', action: function() { activeWorkout.exercises[exoIdx].sets[setIdx].type = 'failure'; renderGoActiveView(); } },
    { icon: 'D', label: 'Série Drop', action: function() { activeWorkout.exercises[exoIdx].sets[setIdx].type = 'drop'; renderGoActiveView(); } },
    { icon: '✕', label: 'Retirer la série', danger: true, action: function() { goRemoveSet(exoIdx, setIdx); } }
  ]);
}

// ============================================================
// GO TAB — Exercise Search Overlay
// ============================================================
function goOpenSearch() {
  var overlay = document.createElement('div');
  overlay.className = 'go-search-overlay';
  overlay.id = 'goSearchOverlay';

  var equipMap = { 'Tout': '', 'Barre': 'barbell', 'Haltères': 'dumbbell', 'Machine': 'machine', 'Câble': 'cable', 'Corps': 'bodyweight', 'Autre': 'other' };
  var equipLabels = Object.keys(equipMap);

  var h = '<div class="go-search-header">';
  h += '<button class="go-search-back" onclick="goCloseSearch()">← Retour</button>';
  h += '<input class="go-search-input" id="goSearchInput" type="text" placeholder="🔍 Rechercher un exercice..." autofocus>';
  h += '</div>';
  h += '<div class="go-search-filters" id="goSearchFilters">';
  equipLabels.forEach(function(lbl) {
    var cls = lbl === 'Tout' ? ' active' : '';
    h += '<span class="go-search-chip' + cls + '" data-equip="' + equipMap[lbl] + '" onclick="goFilterEquip(this)">' + lbl + '</span>';
  });
  h += '</div>';
  h += '<div class="go-search-results" id="goSearchResults"></div>';
  overlay.innerHTML = h;
  document.body.appendChild(overlay);

  // Show recent exercises by default
  goRenderSearchResults('', '');

  // Debounced search
  document.getElementById('goSearchInput').addEventListener('input', function() {
    var q = this.value;
    if (_goSearchDebounce) clearTimeout(_goSearchDebounce);
    _goSearchDebounce = setTimeout(function() {
      var activeChip = document.querySelector('#goSearchFilters .go-search-chip.active');
      var equip = activeChip ? activeChip.getAttribute('data-equip') : '';
      goRenderSearchResults(q, equip);
    }, 200);
  });
}

function goCloseSearch() {
  var el = document.getElementById('goSearchOverlay');
  if (el) el.remove();
  window._goReplaceIdx = undefined;
}

function goFilterEquip(chip) {
  document.querySelectorAll('#goSearchFilters .go-search-chip').forEach(function(c) { c.classList.remove('active'); });
  chip.classList.add('active');
  var equip = chip.getAttribute('data-equip');
  var q = document.getElementById('goSearchInput').value;
  goRenderSearchResults(q, equip);
}

function _goNormalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'");
}

function goRenderSearchResults(query, equipFilter) {
  var container = document.getElementById('goSearchResults');
  if (!container) return;
  var q = _goNormalize(query.trim());
  var allE1RMs = getAllBestE1RMs();
  var results = [];

  // Search EXO_DATABASE
  var keys = Object.keys(EXO_DATABASE);
  keys.forEach(function(k) {
    var e = EXO_DATABASE[k];
    if (equipFilter && e.equipment !== equipFilter) return;
    if (q) {
      var nameN = _goNormalize(e.name);
      var match = nameN.indexOf(q) >= 0;
      if (!match && e.nameAlt) {
        for (var i = 0; i < e.nameAlt.length; i++) {
          if (_goNormalize(e.nameAlt[i]).indexOf(q) >= 0) { match = true; break; }
        }
      }
      // Also try matching individual words
      if (!match) {
        var qWords = q.split(/\s+/);
        match = qWords.every(function(w) { return nameN.indexOf(w) >= 0; });
      }
      if (!match) return;
    }
    results.push(e);
  });

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

  // If no query, show recent exercises first
  if (!q && !equipFilter) {
    var recents = _goGetRecentExercises(5);
    if (recents.length) {
      h += '<div class="go-search-section">Récents</div>';
      recents.forEach(function(name) {
        var ms = _ecMuscleStyle(name);
        var e1rm = allE1RMs[name] ? allE1RMs[name].e1rm : 0;
        h += '<div class="go-search-item" onclick="goSelectSearchResult(\'' + name.replace(/'/g, "\\'") + '\',null)">';
        h += '<div class="go-search-item-icon" style="background:' + ms.bg + ';">' + ms.icon + '</div>';
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
    var sub = (equipLabels[e.equipment] || '') + ' · ' + (ms.tag || '') + ' · ' + (catLabels[e.category] || '');
    var e1rm = allE1RMs[e.name] ? allE1RMs[e.name].e1rm : 0;
    h += '<div class="go-search-item" onclick="goSelectSearchResult(\'' + e.name.replace(/'/g, "\\'") + '\',\'' + (e.id || '') + '\')">';
    h += '<div class="go-search-item-icon" style="background:' + ms.bg + ';">' + ms.icon + '</div>';
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
  }
  goAutoSave();
  renderGoActiveView();
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
    renderGoActiveView();
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

  workout.exercises.forEach(function(exo) {
    var exercise = createExercise(exo.name);
    var completedSets = exo.sets.filter(function(s) { return s.completed; });
    completedSets.forEach(function(s) {
      exercise.series.push({
        weight: s.weight || 0,
        reps: s.reps || (s.duration || 0),
        date: workout.startTime
      });
      exercise.allSets.push({
        weight: s.weight || 0,
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
  saveDB();

  // Generate AI debrief
  try { saveAlgoDebrief(session); } catch(e) {}

  // Social: publish session activity
  try { publishSessionActivity(session); } catch(e) {}

  // Social: detect new PRs and publish
  try {
    recalcBestPR();
    SBD_TYPES.forEach(type => {
      if (db.bestPR[type] > oldPRs[type] && oldPRs[type] > 0) {
        const name = type === 'bench' ? 'Développé couché' : type === 'squat' ? 'Squat' : 'Soulevé de terre';
        publishPRActivity(name, db.bestPR[type], oldPRs[type]);
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

  showToast('✅ Séance sauvegardée');
  renderGoTab();
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
}

