// ============================================================
// supabase.js — Auth, cloud sync, social module
// ============================================================

// ============================================================
// SUPABASE
// ============================================================
const SUPABASE_URL = 'https://swwygywahfdenyzotrce.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JDEEN5nMLQjvfWOX0UfBNw_R38Olz-T';
let supaClient = null, cloudSyncEnabled = false, syncDebounceTimer = null;
try { supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e) { console.warn('Supabase init failed:', e); }

// ── Sync bidirectionnelle au retour sur l'app (multi-appareils) ──
var _lastFocusCheck = 0;
document.addEventListener('visibilitychange', async function() {
  if (document.visibilityState !== 'visible') return;
  if (!supaClient || !cloudSyncEnabled) return;

  // Throttle : max 1 check par minute
  var now = Date.now();
  if (now - _lastFocusCheck < 60000) return;
  _lastFocusCheck = now;

  try {
    var _vAuthRes = await supaClient.auth.getUser();
    if (!_vAuthRes.data || !_vAuthRes.data.user) return;
    var _vRes = await supaClient.from('sbd_profiles').select('updated_at').eq('user_id', _vAuthRes.data.user.id).single();
    if (!_vRes.data) return;
    var _vCloudTs = new Date(_vRes.data.updated_at).getTime();
    var _vLocalTs = (typeof db !== 'undefined' && db.lastSync) ? db.lastSync : 0;
    if (_vCloudTs > _vLocalTs + 5000) {
      await syncFromCloud();
      updateSyncStatus('sync');
      if (typeof showToast === 'function') showToast('🔄 Données mises à jour depuis un autre appareil');
    }
  } catch(e) {
    // Silencieux — ne jamais bloquer l'UI
  }
});

// ============================================================
// ANTHROPIC PROXY HELPER
// ============================================================
async function callAnthropicProxy(body) {
  if (!supaClient || !cloudSyncEnabled) throw new Error('Cloud connection required for AI features');
  const { data: { session } } = await supaClient.auth.getSession();
  if (!session) throw new Error('No active session');
  const r = await fetch(SUPABASE_URL + '/functions/v1/anthropic-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token
    },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Proxy request failed');
  return d;
}


// ============================================================
// CLOUD SYNC
// ============================================================

// Set to true before calling signOut() so onAuthStateChange knows it's intentional.
// Without this flag, a network error (signInAnonymously fails) triggers SIGNED_OUT
// and would show the login screen over the user's local data.
var _voluntaryLogout = false;
async function cloudSignIn() {
  if (!supaClient) return null;
  try {
    const {data:{session}} = await supaClient.auth.getSession();
    if (session) {
      cloudSyncEnabled = true;
      updateCloudUI(session.user);
      // Check password migration (handles anonymous vs email)
      checkPasswordMigration(session.user);
      return session.user;
    }
    const {data, error} = await supaClient.auth.signInAnonymously();
    if (error) throw error;
    cloudSyncEnabled = true;
    updateCloudUI(data.user);
    return data.user;
  } catch(e) {
    console.error('Cloud sign-in:', e);
    updateCloudUI(null, e.message);
    return null;
  }
}

// Listen for auth state changes (handles password recovery callback)
if (supaClient) {
  supaClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      // Only show login if this is a voluntary logout OR the user has no local data.
      // A network-triggered SIGNED_OUT (signInAnonymously failure) must not block
      // access to local data for an already-onboarded user.
      var hasLocalData = typeof db !== 'undefined' && db && db.user && db.user.onboarded;
      if (_voluntaryLogout || !hasLocalData) showLoginScreen();
      _voluntaryLogout = false;
      return;
    }
    if (event === 'PASSWORD_RECOVERY') {
      showSetNewPasswordModal();
    }
    // On sign-in or token refresh, ensure profile exists in Supabase
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user?.email) {
      cloudSyncEnabled = true;
      ensureProfile().catch(e => console.warn('ensureProfile on auth change:', e));
    }
    // Silent token refresh — recover in-progress workout from IDB
    if (event === 'TOKEN_REFRESHED') {
      if (typeof checkWorkoutBackup === 'function') checkWorkoutBackup();
    }
  });
}

function showSetNewPasswordModal() {
  const existing = document.getElementById('setNewPasswordOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'setNewPasswordOverlay';
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '99999';
  overlay.innerHTML =
    '<div class="modal-box" style="max-width:340px;text-align:left;">' +
      '<div style="font-size:28px;text-align:center;margin-bottom:8px;">🔑</div>' +
      '<p style="font-size:16px;font-weight:700;margin:0 0 6px;text-align:center;">Définir ton mot de passe</p>' +
      '<p style="font-size:12px;color:var(--sub);margin:0 0 16px;text-align:center;line-height:1.5;">Choisis un mot de passe pour sécuriser ton compte. Tes données seront conservées.</p>' +
      '<input type="password" id="newPwInput" placeholder="Nouveau mot de passe (min. 8 car.)" style="margin-bottom:8px;" minlength="8">' +
      '<input type="password" id="newPwConfirm" placeholder="Confirmer le mot de passe" style="margin-bottom:4px;">' +
      '<div id="newPwError" style="font-size:12px;color:var(--red);min-height:18px;margin-bottom:8px;text-align:center;"></div>' +
      '<button class="btn" onclick="submitNewPassword()" id="newPwBtn">Valider</button>' +
    '</div>';
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('newPwInput')?.focus(), 100);
}

async function submitNewPassword() {
  const pw = (document.getElementById('newPwInput')?.value || '').trim();
  const pw2 = (document.getElementById('newPwConfirm')?.value || '').trim();
  const errEl = document.getElementById('newPwError');
  const btn = document.getElementById('newPwBtn');
  if (!pw || pw.length < 8) { if (errEl) errEl.textContent = 'Minimum 8 caractères'; return; }
  if (pw !== pw2) { if (errEl) errEl.textContent = 'Les mots de passe ne correspondent pas'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement...'; }
  try {
    const { error } = await supaClient.auth.updateUser({ password: pw });
    if (error) throw error;
    db.passwordMigrated = true;
    saveDB();
    const uid = await getMyUserIdAsync();
    if (uid) {
      try {
        await supaClient.from('profiles').upsert({
          id: uid, password_migrated: true, updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      } catch(pe) { console.warn('Profile upsert on recovery:', pe); }
    }
    const overlay = document.getElementById('setNewPasswordOverlay');
    if (overlay) overlay.remove();
    cloudSyncEnabled = true;
    const { data } = await supaClient.auth.getUser();
    if (data?.user) updateCloudUI(data.user);
    await syncToCloud(true);
    showToast('Mot de passe défini ! Tes données sont synchronisées.');
  } catch(e) {
    if (errEl) errEl.textContent = translateSupaError(e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Valider'; }
  }
}

// Télémétrie silencieuse — envoyer les erreurs critiques à Supabase sans jamais bloquer l'utilisateur
async function logErrorToSupabase(errorType, errorMessage, functionName, appState) {
  try {
    // Source unique = version live du SW (getSWVersion, app.js). Fini le littéral
    // SW_VERSION figé qui étiquetait toute erreur avec une version périmée.
    var swVersion = 'unknown';
    try {
      if (typeof getSWVersion === 'function') { var _v = await getSWVersion(); if (_v) swVersion = _v; }
    } catch (e) {}
    var userId = null;
    try {
      var _u = await supaClient.auth.getUser();
      userId = (_u.data && _u.data.user) ? _u.data.user.id : null;
    } catch(e) {}
    var lightState = appState || {
      logsCount: (typeof db !== 'undefined' && db && db.logs) ? db.logs.length : 0,
      hasWeeklyPlan: !!(typeof db !== 'undefined' && db && db.weeklyPlan),
      onboardingProfile: (typeof db !== 'undefined' && db && db.user) ? db.user.obProfile : null
    };
    await supaClient.from('error_logs').insert({
      user_id: userId,
      error_type: errorType,
      error_message: String(errorMessage).substring(0, 500),
      function_name: functionName || null,
      sw_version: swVersion,
      user_agent: navigator.userAgent.substring(0, 200),
      app_state: lightState
    });
  } catch(e) {
    // Silencieux — ne jamais faire planter l'app à cause du logging
  }
}

async function syncLeaderboard() {
  var _lbNow = Date.now();
  var _lbLast = parseInt(localStorage.getItem('_lastLeaderboardSync') || '0');
  if (_lbNow - _lbLast < 5 * 60 * 1000) return;
  localStorage.setItem('_lastLeaderboardSync', String(_lbNow));
  if (!supaClient) return;
  try {
    var authRes = await supaClient.auth.getUser();
    if (!authRes.data.user) return;
    var userId = authRes.data.user.id;
    var metrics = typeof calcLeaderboardMetrics === 'function' ? calcLeaderboardMetrics() : {};
    var username = (db.user && db.user.name) || 'Athlète';
    var weekKey = typeof getLeaderboardPeriodKey === 'function' ? getLeaderboardPeriodKey('weekly') : '';
    var monthKey = typeof getLeaderboardPeriodKey === 'function' ? getLeaderboardPeriodKey('monthly') : '';
    var entries = [
      {period_type:'weekly', period_key:weekKey, metric:'xp', value:metrics.xp_week||0},
      {period_type:'weekly', period_key:weekKey, metric:'volume', value:metrics.volume_week||0},
      {period_type:'weekly', period_key:weekKey, metric:'sessions', value:metrics.sessions_week||0},
      {period_type:'monthly', period_key:monthKey, metric:'sessions', value:metrics.sessions_month||0},
      {period_type:'alltime', period_key:'alltime', metric:'dots', value:metrics.dots||0},
      {period_type:'alltime', period_key:'alltime', metric:'xp', value:metrics.xp||0},
      {period_type:'alltime', period_key:'alltime', metric:'streak', value:metrics.streak||0}
    ].map(function(e) {
      return Object.assign({}, e, {user_id:userId, username:username, updated_at:new Date().toISOString()});
    });
    await supaClient.from('leaderboard_entries').upsert(entries);
  } catch(e) {
    console.warn('Leaderboard sync error:', e);
  }
}

// v219 — Delta sync : skip upload entirely if db unchanged since last push.
// Aurélien : 510 logs = 443 kB. Was uploaded on every tab switch / autosync.
// Cheap hash on the fields most likely to change keeps the check ~0ms.
function _computeDataHash(d) {
  if (!d) return '';
  var lastLog = (d.logs && d.logs[0]) || null;
  // READY-C2-hotfix-2 : readinessHistory est la source unique des check-in depuis
  // C2-b. L'omettre rendait tout check-in invisible à la sync (hash inchangé →
  // syncToCloud court-circuite). On signe sa longueur ET le ts de sa dernière
  // entrée (un check-in du même jour remplace l'entrée sans changer la longueur
  // → le ts détecte la mise à jour). On garde d.readiness.length (fallback lu).
  var lastRh = (d.readinessHistory && d.readinessHistory[d.readinessHistory.length - 1]) || null;
  // SYNC-LOT1 (P4) : signer la plus récente horloge d'édition de log. Sans ça,
  // éditer un log NON-récent (renommage, reps…) ne change ni logs.length ni
  // logs[0].timestamp → hash inchangé → syncToCloud court-circuite → l'édition
  // n'est jamais poussée (ni au blob ni à workout_sessions). max(editedAt) bascule
  // dès qu'un log quelconque est édité.
  var _maxLogEditedAt = 0;
  var _hashLogs = d.logs || [];
  for (var _hi = 0; _hi < _hashLogs.length; _hi++) {
    var _hl = _hashLogs[_hi];
    var _he = (_hl && (_hl.editedAt || _hl.timestamp)) || 0;
    if (_he > _maxLogEditedAt) _maxLogEditedAt = _he;
  }
  return [
    (d.logs || []).length,
    (lastLog && lastLog.timestamp) || 0,
    _maxLogEditedAt,
    Object.keys(d.exercises || {}).length,
    d.xpHighWaterMark || 0,
    Object.keys(d.earnedBadges || {}).length,
    (d.activityLogs || []).length,
    (d.readiness || []).length,
    (d.readinessHistory || []).length,
    (lastRh && lastRh.ts) || 0,
    JSON.stringify(d.user || {}).length,
    JSON.stringify(d.weeklyPlan || {}).length,
    JSON.stringify(d.bestPR || {}).length,
    d.lastModified || 0
  ].join('|');
}

// P3-c — construit le blob synchronisé SANS logs (les logs vivent dans
// workout_sessions, maintenus par le dual-write P3-b). Allège sbd_profiles.data
// (~815 ko → ~150 ko) → fin des timeouts 57014. Pur → vm-extractable.
function _buildSyncedBlob(d, weeklyPlanToSync) {
  var out = Object.assign({}, d, { gamification: d.gamification || {}, weeklyPlan: weeklyPlanToSync });
  delete out.logs; // logs hors blob (shallow copy : d.logs n'est PAS modifié)
  return out;
}

async function syncToCloud(silent) {
  if (!supaClient || !cloudSyncEnabled) return;
  try {
    const {data:{user}} = await supaClient.auth.getUser();
    if (!user) return;
    if (!db.gamification) db.gamification = {};
    // v219 — Skip upload if data hash unchanged since last successful push
    var _hash = _computeDataHash(db);
    if (db._lastSyncHash === _hash) {
      updateSyncStatus('sync');
      if (!silent) showToast('Déjà à jour');
      return;
    }
    // FIX 3 (Gemini Q3.3): exclude derived weeklyPlan fields from sync payload
    var _weeklyPlanToSync = db.weeklyPlan
      ? (function() {
          var wp = Object.assign({}, db.weeklyPlan);
          delete wp.mesoWeeks;
          delete wp._volumeSuggestions;
          delete wp._volumeSuggestionsDate;
          delete wp._discoveryInsights;
          return wp;
        })()
      : db.weeklyPlan;
    const dataToSync = _buildSyncedBlob(db, _weeklyPlanToSync); // P3-c — sans logs
    const payload = { user_id: user.id, data: dataToSync, updated_at: new Date().toISOString() };
    const {data: _upsertRes, error} = await supaClient.from('sbd_profiles').upsert(payload, { onConflict: 'user_id' }).select('updated_at').single();
    if (error) throw error;
    var _pushTs = (_upsertRes && _upsertRes.updated_at) ? new Date(_upsertRes.updated_at).getTime() : Date.now();
    db._cloudUpdatedAt = db.updatedAt || 0;
    db.lastSync = Date.now();
    db._lastSyncHash = _hash;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    localStorage.setItem('_lastCloudSync', String(db._cloudUpdatedAt));
    localStorage.setItem('_lastCloudPush', String(_pushTs));
    if (!silent) showToast('Synchronisé !');
    updateSyncStatus('sync');
    syncLeaderboard();
    syncLogsToSupabase(user.id).catch(function(e) {
      console.error('log sync failed:', e);
      if (typeof sentryCaptureSilent === 'function') sentryCaptureSilent(e, 'syncLogsToSupabase');
    });
  } catch(e) {
    console.error('Cloud sync:', e);
    if (!silent) showToast('Erreur sync');
    updateSyncStatus('error');
  }
}

// P3-b — Dual-write FIABLE des séances vers workout_sessions.
// db.logs reste la source de lecture locale ET la source de vérité ; cette passe
// rend workout_sessions FIDÈLE au local : insertions, ÉDITIONS (réécriture du data
// + colonnes dérivées) et SUPPRESSIONS. La détection des éditions s'appuie sur une
// carte locale de hash de contenu (localStorage '_wsSyncedHashes', device-local,
// HORS blob) — on ne relit jamais le jsonb cloud (coûteux). Garde-fou anti-wipe.

// Signature de contenu d'un log (djb2 32-bit sur le JSON). Pure → vm-extractable.
function _wsLogHash(log) {
  if (!log) return '0';
  var s;
  try { s = JSON.stringify(log); } catch (e) { s = String(log && log.id); }
  var h = 5381;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0; // djb2
  }
  return (h >>> 0).toString(36);
}

// Calcule le plan de sync fidèle pour workout_sessions. Pure (aucun réseau, aucun
// accès global) → testable par vm-extraction.
// Règles : id absent du cloud → upsert (nouveau) ; id présent + hash changé →
// upsert (édité) ; id présent + hash inconnu localement → adopté SANS réécriture
// (1er run post-backfill : évite de réécrire les centaines de lignes existantes) ;
// id cloud absent du local → suppression, SAUF garde-fou anti-wipe (non hydraté,
// local vide, ou volume de suppression anormal).
function computeWorkoutSessionsSyncPlan(localLogs, cloudSessionIds, syncedHashes, opts) {
  var logs = localLogs || [];
  var hashes = syncedHashes || {};
  var o = opts || {};
  var absDeleteAllow = (typeof o.absDeleteAllow === 'number') ? o.absDeleteAllow : 5;
  var deleteRatioMax = (typeof o.deleteRatioMax === 'number') ? o.deleteRatioMax : 0.2;
  var cloudIds = cloudSessionIds || [];

  var cloudSet = {};
  for (var c = 0; c < cloudIds.length; c++) { cloudSet[cloudIds[c]] = true; }

  var toUpsert = [];
  var nextHashes = {};
  var localSet = {};
  for (var i = 0; i < logs.length; i++) {
    var log = logs[i];
    if (!log || !log.id) continue;
    var id = log.id;
    localSet[id] = true;
    var h = _wsLogHash(log);
    nextHashes[id] = h;
    var known = hashes[id];
    if (!cloudSet[id]) {
      toUpsert.push(log);                       // nouveau (ou perdu côté cloud)
    } else if (known !== undefined && known !== h) {
      toUpsert.push(log);                       // édité depuis le dernier push
    }
    // sinon : présent côté cloud + (hash inconnu → adopté | identique → inchangé)
  }

  var toDelete = [];
  for (var k = 0; k < cloudIds.length; k++) {
    if (!localSet[cloudIds[k]]) toDelete.push(cloudIds[k]);
  }
  var deleteCandidateCount = toDelete.length;

  var deleteAborted = false;
  var deleteAbortReason = null;
  if (o.synced !== true || logs.length === 0) {
    if (deleteCandidateCount > 0) { deleteAborted = true; deleteAbortReason = 'not_hydrated'; }
    toDelete = [];
  } else if (deleteCandidateCount > absDeleteAllow && cloudIds.length > 0 &&
             deleteCandidateCount > deleteRatioMax * cloudIds.length) {
    deleteAborted = true;
    deleteAbortReason = 'threshold_exceeded';
    toDelete = [];
  }

  return {
    toUpsert: toUpsert,
    toDelete: toDelete,
    nextHashes: nextHashes,
    deleteCandidateCount: deleteCandidateCount,
    deleteAborted: deleteAborted,
    deleteAbortReason: deleteAbortReason
  };
}

// Après ce passage, workout_sessions contient EXACTEMENT les id de db.logs (data à
// jour). userIdArg : passé par syncToCloud pour éviter un 2e auth.getUser()
// concurrent (verrous gotrue « lock stolen »). _workoutSessionsSynced reste posé
// uniquement après succès complet.
async function syncLogsToSupabase(userIdArg) {
  if (!supaClient || !db.logs || db.logs.length === 0) return false;
  try {
    var uid = userIdArg;
    if (!uid) {
      const { data: { user } } = await supaClient.auth.getUser();
      if (!user) return false;
      uid = user.id;
    }

    // session_id déjà présents côté cloud (colonnes légères, JAMAIS le jsonb data)
    const { data: existing, error: selErr } = await supaClient
      .from('workout_sessions')
      .select('session_id')
      .eq('user_id', uid);
    if (selErr) { console.warn('[sync] workout_sessions select failed:', (selErr && selErr.message) ? selErr.message : selErr); return false; }
    const cloudIds = (existing || []).map(function(r) { return r.session_id; });

    var syncedHashes = {};
    try { syncedHashes = JSON.parse(localStorage.getItem('_wsSyncedHashes') || '{}') || {}; } catch (e) { syncedHashes = {}; }

    var plan = computeWorkoutSessionsSyncPlan(db.logs, cloudIds, syncedHashes, {
      synced: db._workoutSessionsSynced === true
    });

    if (plan.deleteAborted && plan.deleteAbortReason === 'threshold_exceeded') {
      console.warn('[syncLogs] Suppression anormale ignorée (garde-fou anti-wipe) : '
        + plan.deleteCandidateCount + ' / ' + cloudIds.length
        + ' lignes cloud. Vérification manuelle requise.');
    }

    var allOk = true;

    // 1) Upserts (nouveaux + édités) — batches de 50, upsert sur user_id+session_id
    if (plan.toUpsert.length > 0) {
      var rows = plan.toUpsert.map(function(log) {
        return {
          user_id: uid,
          session_id: log.id,
          short_date: log.shortDate || '',
          title: log.title || '',
          timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
          volume: log.volume || 0,
          duration: log.duration || 0,
          exercise_count: (log.exercises || []).length,
          data: log
        };
      });
      for (var i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const up = await supaClient
          .from('workout_sessions')
          .upsert(batch, { onConflict: 'user_id,session_id' });
        if (up.error) { console.warn('[sync] workout_sessions upsert failed:', (up.error && up.error.message) ? up.error.message : up.error); allOk = false; break; }
      }
    }

    // 2) Suppressions (garde-fou déjà appliqué dans le plan ; user courant uniquement)
    if (allOk && plan.toDelete.length > 0) {
      for (var d = 0; d < plan.toDelete.length; d += 50) {
        const delBatch = plan.toDelete.slice(d, d + 50);
        const del = await supaClient
          .from('workout_sessions')
          .delete()
          .eq('user_id', uid)
          .in('session_id', delBatch);
        if (del.error) { console.warn('[sync] workout_sessions delete failed:', (del.error && del.error.message) ? del.error.message : del.error); allOk = false; break; }
      }
    }

    // 3) Persistance de l'état SEULEMENT si tout a réussi (sinon retry au prochain run)
    if (allOk) {
      try { localStorage.setItem('_wsSyncedHashes', JSON.stringify(plan.nextHashes)); } catch (e) {}
      if (!db._workoutSessionsSynced) {
        db._workoutSessionsSynced = true;
        saveDB();
      }
    }
    return allOk;
  } catch (e) {
    console.warn('[sync] workout_sessions sync error:', (e && e.message) ? e.message : e);
    if (typeof sentryCaptureSilent === 'function') sentryCaptureSilent(e, 'syncLogsToSupabase.body');
    return false;
  }
}

// ── Dual-write workout_sessions DÉCLENCHÉ À t=0 (fin de séance) ───────────────
// Aligné sur le chemin qui marche déjà (le feed) : l'écriture part PENDANT que
// l'utilisateur est encore à l'écran, au lieu de dépendre du syncToCloud debouncé
// (2 s) qui lançait syncLogsToSupabase en fire-and-forget APRÈS le toast — tué quand
// l'app se refermait, d'où workout_sessions figé. L'uid est résolu via le cache
// (getMyUserIdAsync → _cachedUid) : pas de getUser() concurrent → pas de lock gotrue.
// ⚠️ Ce n'est PAS syncToCloud() : on ne pousse QUE workout_sessions, jamais le blob.
// _wsPendingFlush reste vrai tant que l'écriture n'a pas abouti → dernier essai
// best-effort sur pagehide / visibilitychange:hidden (filet de fermeture d'app).
var _wsPendingFlush = false;

async function pushWorkoutSessionsNow() {
  if (!supaClient || !cloudSyncEnabled || !db.logs || db.logs.length === 0) return;
  _wsPendingFlush = true;
  var uid = await getMyUserIdAsync();
  if (!uid) return; // pas (encore) connecté : on garde _wsPendingFlush → retenté plus tard
  var ok = false;
  try {
    ok = await syncLogsToSupabase(uid);
  } catch (e) {
    console.warn('[sync] workout_sessions upsert failed:', (e && e.message) ? e.message : e);
    if (typeof sentryCaptureSilent === 'function') sentryCaptureSilent(e, 'pushWorkoutSessionsNow');
  }
  if (ok) _wsPendingFlush = false;
}

// Filet de fermeture : si une écriture workout_sessions est encore en attente quand
// l'app passe en arrière-plan / se ferme, tenter un dernier flush (best-effort, non
// bloquant). pagehide (et non 'unload', déprécié/peu fiable mobile) + visibilitychange
// hidden couvrent le cas « l'utilisateur referme l'app juste après avoir loggé ».
function _flushWorkoutSessionsOnHide() {
  if (!_wsPendingFlush) return;
  try { pushWorkoutSessionsNow(); } catch (e) {}
}
window.addEventListener('pagehide', _flushWorkoutSessionsOnHide);
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') _flushWorkoutSessionsOnHide();
});
// P3-c — reconstruit db.logs à partir des lignes workout_sessions (data jsonb =
// log complet), trié par timestamp desc. Pur → vm-extractable.
function _logsFromSessionRows(rows) {
  var logs = [];
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i];
    if (r && r.data) logs.push(r.data);
  }
  logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
  return logs;
}

// P3-c — n'hydrater que si le local est vide : le local fait foi quand il existe
// (cf. lot 1). Pur → vm-extractable.
function _shouldHydrateLogs(localLogs) {
  return !localLogs || localLogs.length === 0;
}

// P3-c — charge l'historique depuis workout_sessions vers db.logs quand le local
// est vide (nouvel appareil / réinstallation), les logs n'étant plus dans le blob.
// Pagination par batches de 200 (sous les limites PostgREST, 532 lignes ≈ 3 pages).
async function hydrateLogsFromCloud(userIdArg) {
  if (!supaClient) return false;
  if (!_shouldHydrateLogs(db.logs)) return false; // ne JAMAIS écraser un local peuplé
  try {
    var uid = userIdArg;
    if (!uid) {
      const { data: { user } } = await supaClient.auth.getUser();
      if (!user) return false;
      uid = user.id;
    }
    var rows = [];
    var from = 0;
    var BATCH = 200;
    while (true) {
      const { data, error } = await supaClient
        .from('workout_sessions')
        .select('data')
        .eq('user_id', uid)
        .order('timestamp', { ascending: false })
        .range(from, from + BATCH - 1);
      if (error) { console.error('hydrateLogs select error:', error); return false; }
      if (!data || data.length === 0) break;
      rows = rows.concat(data);
      if (data.length < BATCH) break;
      from += BATCH;
    }
    if (rows.length === 0) return false;
    db.logs = _logsFromSessionRows(rows);
    saveDBNow();
    if (typeof recalcBestPR === 'function') recalcBestPR();
    if (typeof refreshUI === 'function') refreshUI();
    return true;
  } catch (e) {
    console.error('hydrateLogsFromCloud error:', e);
    return false;
  }
}

// SYNC-X — horloge d'édition d'un log : editedAt (posé à chaque mutation, Lot 1) ;
// fallback timestamp de séance pour les anciennes données. Pure.
function _logEditClock(log) {
  return (log && (log.editedAt || log.timestamp)) || 0;
}

// SYNC-X — fusion NON-DESTRUCTIVE de deux jeux de logs par identité (log.id), en
// gardant la version à l'horloge d'ÉDITION la plus récente (PISTE #2 : editedAt, pas
// timestamp de séance). Additive : une séance présente d'un seul côté est conservée
// (jamais supprimée sur simple absence — la suppression cross-device exige un tombstone,
// ABSENT ici → gap documenté). Logs sans id concaténés. Idempotente. Pure → testable.
function _reconcileLogs(localLogs, remoteLogs) {
  var map = {};
  var noId = [];
  (remoteLogs || []).forEach(function(log) {
    if (log && log.id) map[log.id] = log;
    else if (log) noId.push(log);
  });
  (localLogs || []).forEach(function(log) {
    if (log && log.id) {
      if (!map[log.id] || _logEditClock(log) > _logEditClock(map[log.id])) map[log.id] = log;
    } else if (log) {
      noId.push(log);
    }
  });
  return Object.keys(map).map(function(k) { return map[k]; })
    .concat(noId)
    .sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
}

// SYNC-X (PISTE #1) — réconcilie workout_sessions dans un local PEUPLÉ au pull : ajoute
// les séances distantes absentes en local (sync incrémentale cross-device). Efficient :
// on lit d'abord les session_id (léger) et on ne télécharge le data QUE des manquantes
// (sur un appareil à jour : 0 manquant → 0 fetch → no-op idempotent). L'édition d'une
// séance EXISTANTE ne se propage pas ici (faute de colonne editedAt sur workout_sessions)
// — gap documenté ; piste #2 empêche au moins l'écrasement d'une édition au merge du blob.
async function reconcileLogsFromCloud(userIdArg) {
  if (!supaClient || !cloudSyncEnabled) return false;
  try {
    var uid = userIdArg;
    if (!uid) {
      const { data: { user } } = await supaClient.auth.getUser();
      if (!user) return false;
      uid = user.id;
    }
    var localIds = {};
    (db.logs || []).forEach(function(l) { if (l && l.id) localIds[l.id] = true; });
    // 1) ids distants (colonne légère, jamais le jsonb data)
    var remoteIds = [];
    var from = 0;
    var IDBATCH = 1000;
    while (true) {
      const { data, error } = await supaClient
        .from('workout_sessions').select('session_id').eq('user_id', uid)
        .range(from, from + IDBATCH - 1);
      if (error) { console.error('reconcile ids error:', error); return false; }
      if (!data || data.length === 0) break;
      data.forEach(function(r) { if (r && r.session_id) remoteIds.push(r.session_id); });
      if (data.length < IDBATCH) break;
      from += IDBATCH;
    }
    // 2) séances distantes absentes en local
    var missing = remoteIds.filter(function(id) { return !localIds[id]; });
    if (missing.length === 0) return false; // idempotent : rien à ajouter
    // 3) télécharger le data des seules manquantes (batches de 200)
    var added = [];
    for (var i = 0; i < missing.length; i += 200) {
      var batch = missing.slice(i, i + 200);
      const { data, error } = await supaClient
        .from('workout_sessions').select('data').eq('user_id', uid).in('session_id', batch);
      if (error) { console.error('reconcile data error:', error); break; }
      (data || []).forEach(function(r) { if (r && r.data) added.push(r.data); });
    }
    if (added.length === 0) return false;
    db.logs = _reconcileLogs(db.logs, added);
    saveDBNow();
    if (typeof recalcBestPR === 'function') recalcBestPR();
    if (typeof refreshUI === 'function') refreshUI();
    return true;
  } catch (e) {
    console.error('reconcileLogsFromCloud error:', e);
    return false;
  }
}

async function syncFromCloud() {
  if (!supaClient) return false;
  try {
    const {data:{user}} = await supaClient.auth.getUser();
    if (!user) return false;
    const {data, error} = await supaClient.from('sbd_profiles').select('data,updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (data && data.data) {
      var cloudData = data.data;
      var cloudTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
      if (!cloudTs) {
        // No server timestamp — push local as fallback
        await syncToCloud(true);
        return true;
      }
      var lastPush = parseInt(localStorage.getItem('_lastCloudPush') || '0');
      if (cloudTs <= lastPush) {
        // We pushed more recently — local is authoritative
        await syncToCloud(true);
        return true;
      }
      // Cloud has changes after our last push — merge intelligently
      var _localLogs = (typeof db !== 'undefined' && db && db.logs) ? db.logs.length : 0;
      var _cloudLogs = (cloudData && cloudData.logs) ? cloudData.logs.length : 0;
      // FIX 3 — preserve activeWorkout if a session is in progress
      var _activeBackup = (typeof db !== 'undefined' && db) ? (db.activeWorkout || null) : null;
      var _hasActiveSession = _activeBackup &&
        _activeBackup.exercises && _activeBackup.exercises.length > 0 &&
        !_activeBackup.isFinished;
      var _didMergeLogs = false;
      // A2-F1 — Merge par id : union des logs local + cloud, dédupliqués par log.id.
      // SYNC-X : départage désormais par horloge d'ÉDITION (editedAt), pas par timestamp.
      var _localLogsArr = (typeof db !== 'undefined' && db && db.logs) ? db.logs : [];
      var _cloudLogsArr = (cloudData && cloudData.logs) ? cloudData.logs : [];
      // PISTE #2 — fusion non-destructive par horloge d'ÉDITION (editedAt), via le
      // helper partagé _reconcileLogs : une édition non poussée n'est plus écrasée à
      // égalité de timestamp de séance (l'ancien départage `local.timestamp > cloud`).
      var _mergedLogs = _reconcileLogs(_localLogsArr, _cloudLogsArr);
      var _mergedData = Object.assign({}, cloudData);
      _mergedData.logs = _mergedLogs;
      _mergedData.exercises = db.exercises || cloudData.exercises;
      _mergedData.bestPR = db.bestPR || cloudData.bestPR;
      db = _mergedData;
      // P3-c — ne considérer un "merge offline" que si le cloud portait des logs.
      // Sans cette garde, cloudData.logs absent (logs hors blob) rendrait _didMergeLogs
      // toujours vrai → re-push + toast trompeur à CHAQUE pull.
      _didMergeLogs = (cloudData.logs != null) && (_mergedLogs.length > _cloudLogs);
      // On a des séances que le cloud n'a pas → repousser le résultat fusionné
      if (_didMergeLogs) {
        setTimeout(function() { syncToCloud(true); }, 500);
      }
      // FIX 3 — restore active session that was in progress
      if (_hasActiveSession) {
        db.activeWorkout = _activeBackup;
        setTimeout(function() { syncToCloud(true); }, 1200);
      }
      if (db.weeklyPlan && db.weeklyPlan.days) {
        db.weeklyPlan.days.forEach(function(day) {
          if (day.exercises) day.exercises = day.exercises.filter(function(e) { return !e.isPrehab; });
        });
      }
      if (!db.reports) db.reports = [];
      if (!db.logs) db.logs = [];
      if (!db.user) db.user = {};
      if (!db.user.targets) db.user.targets = { bench: 100, squat: 120, deadlift: 140 };
      if (!db.social) db.social = {};
      if (!db.bestPR) db.bestPR = { bench: 0, squat: 0, deadlift: 0 };
      if (!db.gamification) db.gamification = {};
      // logs hors blob : local VIDE → hydratation complète (nouvel appareil) ;
      // local PEUPLÉ → réconciliation incrémentale (PISTE #1 : ajoute les séances
      // distantes manquantes — sync cross-device des nouvelles séances).
      if (_shouldHydrateLogs(db.logs)) {
        await hydrateLogsFromCloud(user.id);
      } else {
        await reconcileLogsFromCloud(user.id);
      }
      db.lastSync = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();
      db._cloudUpdatedAt = db.updatedAt || 0;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      localStorage.setItem('_lastCloudSync', String(db._cloudUpdatedAt));
      localStorage.setItem('_lastCloudPush', String(cloudTs));
      refreshUI();
      // FIX 2 — toast contextuel selon le type de sync
      if (_hasActiveSession) {
        showToast('⚠️ Sync partielle — séance en cours préservée');
      } else if (_didMergeLogs) {
        showToast('✅ Séances offline synchronisées (' + _localLogs + ' logs)');
      } else {
        showToast('Données cloud chargées !');
      }
      return true;
    } else {
      showToast('Aucune donnée cloud trouvée');
      return false;
    }
  } catch(e) {
    console.error('Cloud pull:', e);
    showToast('Erreur chargement cloud');
    return false;
  }
}
function updateCloudUI(user, err) { const el = document.getElementById('cloudStatus'); if (!el) return; const emailSection = document.getElementById('emailLoginSection'); if (err) { el.innerHTML = '<span style="color:var(--red);">Erreur: '+err+'</span>'; return; } if (user) { const label = user.email ? user.email : 'Anonyme ('+user.id.substring(0,8)+'...)'; const color = user.email ? 'var(--green)' : 'var(--orange)'; const hint = user.email ? 'Sync entre appareils active' : 'Connecte-toi par email pour sync multi-appareils'; el.innerHTML = '<span style="color:'+color+';">Connecté au cloud</span><span style="font-size:11px;color:var(--text);display:block;margin-top:4px;">'+label+'</span><span style="font-size:10px;color:var(--sub);display:block;margin-top:2px;">'+hint+'</span>'; if (emailSection) emailSection.style.display = user.email ? 'none' : 'block'; const changePwdSection = document.getElementById('changePasswordSection'); if (changePwdSection) changePwdSection.style.display = user.email ? 'block' : 'none'; return; } el.innerHTML = '<span style="color:var(--sub);">Non connecté</span>'; if (emailSection) emailSection.style.display = 'block'; const _cpS = document.getElementById('changePasswordSection'); if (_cpS) _cpS.style.display = 'none'; }
function updateSyncStatus(s) {
  const el = document.getElementById('syncIndicator');
  if (el) {
    el.textContent = s==='sync' ? '✓ Sauvegardé' : s==='error' ? '⚠️ Erreur de sauvegarde' : '';
    el.style.color = s==='error' ? 'var(--red)' : 'var(--green)';
    setTimeout(() => { if (el) el.textContent = ''; }, 3000);
  }
  if (s === 'sync') {
    const lsd = document.getElementById('lastSyncDisplay');
    if (lsd) {
      const now = new Date();
      lsd.textContent = 'Dernière sauvegarde : ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
    }
  }
}
// ── Auth mode toggle ──
let _authMode = 'login';
function switchAuthMode(mode) {
  _authMode = mode;
  const loginBtn = document.getElementById('authModeLogin');
  const signupBtn = document.getElementById('authModeSignup');
  const confirmField = document.getElementById('inputPasswordConfirm');
  const submitBtn = document.getElementById('authSubmitBtn');
  const forgotBtn = document.getElementById('forgotPasswordBtn');
  if (mode === 'login') {
    loginBtn.style.background = 'var(--blue)'; loginBtn.style.color = 'white';
    signupBtn.style.background = 'var(--surface)'; signupBtn.style.color = 'var(--sub)';
    confirmField.style.display = 'none';
    submitBtn.textContent = 'Se connecter';
    forgotBtn.style.display = '';
  } else {
    signupBtn.style.background = 'var(--blue)'; signupBtn.style.color = 'white';
    loginBtn.style.background = 'var(--surface)'; loginBtn.style.color = 'var(--sub)';
    confirmField.style.display = '';
    submitBtn.textContent = 'Créer un compte';
    forgotBtn.style.display = 'none';
  }
}

function translateSupaError(msg) {
  if (!msg) return 'Erreur inconnue';
  if (msg.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect';
  if (msg.includes('Email not confirmed')) return 'Confirme ton email avant de te connecter';
  if (msg.includes('User already registered')) return 'Cet email est déjà utilisé';
  if (msg.includes('Password should be at least')) return 'Le mot de passe doit faire au moins 8 caractères';
  if (msg.includes('Email rate limit exceeded')) return 'Trop de tentatives, réessaie plus tard';
  if (msg.includes('Signup requires a valid password')) return 'Mot de passe invalide';
  if (msg.includes('Unable to validate email')) return 'Email invalide';
  return msg;
}

async function authSubmit() {
  const email = document.getElementById('inputEmail').value.trim();
  const password = document.getElementById('inputPassword').value;
  if (!email || !email.includes('@')) { showToast('Entre un email valide'); return; }
  if (!password || password.length < 8) { showToast('Le mot de passe doit faire au moins 8 caractères'); return; }
  if (_authMode === 'signup') {
    const confirm = document.getElementById('inputPasswordConfirm').value;
    if (password !== confirm) { showToast('Les mots de passe ne correspondent pas'); return; }
    try {
      const { data, error } = await supaClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: 'https://smoothapp68.github.io/sbd-hub/' }
      });
      if (error) {
        // If email already exists (magic link user), offer password reset
        if (error.message && (error.message.includes('User already registered') || error.message.includes('already been registered'))) {
          showMagicLinkMigrationPrompt(email);
          return;
        }
        throw error;
      }
      if (data.user) {
        db.passwordMigrated = true;
        saveDB();
        try {
          await supaClient.from('profiles').upsert({
            id: data.user.id,
            password_migrated: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });
        } catch(pe) { console.warn('Profile upsert on signup:', pe); }
        cloudSyncEnabled = true;
        updateCloudUI(data.user);
        await syncToCloud(true);
        await ensureProfile();
        showToast('Compte créé ! Bienvenue');
      }
    } catch(e) { showToast(translateSupaError(e.message)); }
  } else {
    try {
      const { data, error } = await supaClient.auth.signInWithPassword({ email, password });
      if (error) {
        // Message clair si le mdp est incorrect — peut-être un user magic link
        if (error.message && error.message.includes('Invalid login')) {
          showModal(
            '<div style="text-align:center;">' +
              '<div style="font-size:28px;margin-bottom:8px;">🔐</div>' +
              '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Email ou mot de passe incorrect</div>' +
              '<div style="font-size:12px;color:var(--sub);line-height:1.6;">Tu t\'es peut-être inscrit avec un <strong>lien magique</strong> (sans mot de passe).<br><br>Essaie de te connecter avec un lien magique, ou réinitialise ton mot de passe.</div>' +
            '</div>',
            'Envoyer un lien magique',
            'var(--accent)',
            function() { sendMagicLink(email); },
            'Fermer'
          );
          return;
        }
        throw error;
      }
      if (data.user) {
        cloudSyncEnabled = true;
        updateCloudUI(data.user);
        await syncToCloud(true);
        await ensureProfile();
        showToast('Connecté !');
        if (typeof postLoginSync === 'function') postLoginSync();
        checkPasswordMigration(data.user);
      }
    } catch(e) { showToast(translateSupaError(e.message)); }
  }
}

function showMagicLinkMigrationPrompt(email) {
  const existing = document.getElementById('magicLinkMigrationOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'magicLinkMigrationOverlay';
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '99999';
  overlay.innerHTML =
    '<div class="modal-box" style="max-width:340px;text-align:left;">' +
      '<div style="font-size:28px;text-align:center;margin-bottom:8px;">📧</div>' +
      '<p style="font-size:16px;font-weight:700;margin:0 0 6px;text-align:center;">Compte existant détecté</p>' +
      '<p style="font-size:13px;color:var(--sub);margin:0 0 16px;text-align:center;line-height:1.6;">' +
        'L\'email <strong style="color:var(--text);">' + email + '</strong> est déjà associé à un compte (magic link).<br><br>' +
        'Pour définir un mot de passe et garder toutes tes données, clique ci-dessous. Tu recevras un email pour créer ton mot de passe.' +
      '</p>' +
      '<button class="btn" onclick="sendMigrationReset(\'' + email + '\')" id="migrationResetBtn">Envoyer l\'email de création de mot de passe</button>' +
      '<button class="btn" style="background:var(--surface);border:1px solid var(--border);color:var(--sub);margin-top:8px;font-size:13px;" onclick="document.getElementById(\'magicLinkMigrationOverlay\').remove()">Annuler</button>' +
    '</div>';
  document.body.appendChild(overlay);
}

async function sendMigrationReset(email) {
  const btn = document.getElementById('migrationResetBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours...'; }
  try {
    const { error } = await supaClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw error;
    const overlay = document.getElementById('magicLinkMigrationOverlay');
    if (overlay) overlay.remove();
    showToast('Email envoyé ! Vérifie ta boîte mail pour définir ton mot de passe.');
  } catch(e) {
    showToast(translateSupaError(e.message));
    if (btn) { btn.disabled = false; btn.textContent = 'Envoyer l\'email de création de mot de passe'; }
  }
}

async function forgotPassword() {
  const email = document.getElementById('inputEmail').value.trim();
  if (!email || !email.includes('@')) { showToast('Entre d\'abord ton email'); return; }
  try {
    const { error } = await supaClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw error;
    showToast('Email de réinitialisation envoyé !');
  } catch(e) { showToast(translateSupaError(e.message)); }
}

async function sendMagicLink(email) {
  if (!email) {
    email = document.getElementById('inputEmail').value.trim();
  }
  if (!email || !email.includes('@')) { showToast('Entre d\'abord ton email'); return; }
  try {
    const { error } = await supaClient.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
    showToast('Lien magique envoyé ! Vérifie ta boîte mail.');
  } catch(e) { showToast(translateSupaError(e.message)); }
}

// ============================================================
// LOGIN SCREEN — gate app behind auth
// ============================================================
let _loginMode = 'login';

function loginSwitchMode(mode) {
  _loginMode = mode;
  const loginBtn = document.getElementById('loginModeLoginBtn');
  const signupBtn = document.getElementById('loginModeSignupBtn');
  const confirmField = document.getElementById('loginPasswordConfirm');
  const submitBtn = document.getElementById('loginSubmitBtn');
  const forgotBtn = document.getElementById('loginForgotBtn');
  if (mode === 'login') {
    loginBtn.style.background = '#0A84FF'; loginBtn.style.color = 'white';
    signupBtn.style.background = 'rgba(255,255,255,0.03)'; signupBtn.style.color = '#7878A8';
    confirmField.style.display = 'none';
    submitBtn.textContent = 'Se connecter';
    forgotBtn.style.display = '';
  } else {
    signupBtn.style.background = '#0A84FF'; signupBtn.style.color = 'white';
    loginBtn.style.background = 'rgba(255,255,255,0.03)'; loginBtn.style.color = '#7878A8';
    confirmField.style.display = '';
    submitBtn.textContent = 'Créer un compte';
    forgotBtn.style.display = 'none';
  }
  hideLoginError();
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function hideLoginError() {
  const el = document.getElementById('loginError');
  if (el) el.style.display = 'none';
}

async function loginSubmit() {
  hideLoginError();
  const email = (document.getElementById('loginEmail').value || '').trim();
  const password = document.getElementById('loginPassword').value || '';
  if (!email || !email.includes('@')) { showLoginError('Entre un email valide'); return; }
  if (!password || password.length < 8) { showLoginError('Le mot de passe doit faire au moins 8 caractères'); return; }

  const btn = document.getElementById('loginSubmitBtn');
  btn.disabled = true; btn.textContent = 'Connexion...';

  if (_loginMode === 'signup') {
    const confirm = (document.getElementById('loginPasswordConfirm').value || '');
    if (password !== confirm) { showLoginError('Les mots de passe ne correspondent pas'); btn.disabled = false; btn.textContent = 'Créer un compte'; return; }
    try {
      const { data, error } = await supaClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: 'https://smoothapp68.github.io/sbd-hub/' }
      });
      if (error) throw error;
      if (data.user) {
        db.passwordMigrated = true;
        saveDB();
        cloudSyncEnabled = true;
        updateCloudUI(data.user);
        await syncToCloud(true);
        await ensureProfile();
        hideLoginScreen();
        showToast('Compte créé ! Bienvenue');
      }
    } catch(e) {
      showLoginError(translateSupaError(e.message));
      btn.disabled = false; btn.textContent = 'Créer un compte';
    }
  } else {
    try {
      const { data, error } = await supaClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        cloudSyncEnabled = true;
        updateCloudUI(data.user);
        // Sync from cloud if remote is newer
        try {
          const {data: prof} = await supaClient.from('sbd_profiles').select('data,updated_at').eq('user_id', data.user.id).maybeSingle();
          if (prof && prof.data) {
            db = prof.data;
            if (!db.reports) db.reports = [];
            db.lastSync = prof.updated_at ? new Date(prof.updated_at).getTime() : Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
            await syncToCloud(true); // push migrated fields back to cloud
            refreshUI();
          } else {
            await syncToCloud(true);
          }
        } catch(se) { await syncToCloud(true); }
        await ensureProfile();
        hideLoginScreen();
        showToast('Connecté !');
        if (typeof postLoginSync === 'function') postLoginSync();
      }
    } catch(e) {
      showLoginError(translateSupaError(e.message));
      btn.disabled = false; btn.textContent = 'Se connecter';
    }
  }
}

async function loginForgotPwd() {
  const email = (document.getElementById('loginEmail').value || '').trim();
  if (!email || !email.includes('@')) { showLoginError('Entre d\'abord ton email'); return; }
  try {
    const { error } = await supaClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw error;
    showLoginError('');
    const el = document.getElementById('loginError');
    if (el) { el.textContent = 'Email de réinitialisation envoy�� !'; el.style.display = 'block'; el.style.color = 'var(--green)'; el.style.borderColor = 'rgba(50,215,75,0.3)'; el.style.background = 'rgba(50,215,75,0.1)'; }
  } catch(e) { showLoginError(translateSupaError(e.message)); }
}

function loginOffline() {
  hideLoginScreen();
  // Show offline indicator
  const banner = document.getElementById('offlineBanner');
  if (banner) { banner.textContent = '📡 Mode hors-ligne'; banner.style.display = 'block'; }
}

function showLoginScreen() {
  // Don't show login screen on waitlist route — checkWaitlistRoute() manages display
  if (window.location.hash === '#waitlist' ||
      (window.location.search && window.location.search.includes('waitlist'))) return;
  const el = document.getElementById('loginScreen');
  if (el) el.style.display = 'flex';
}

function hideLoginScreen() {
  const el = document.getElementById('loginScreen');
  if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 300); }
}

// Called during app init — checks session and shows login if needed
async function checkAuthGate() {
  if (!supaClient) { return; } // No supabase, skip gate
  try {
    const { data: { session } } = await supaClient.auth.getSession();
    if (session && session.user) {
      // Session exists (email or otherwise) — hide any stale login screen and proceed.
      // checkPasswordMigration will handle anonymous sessions downstream.
      cloudSyncEnabled = true;
      hideLoginScreen();
      return;
    }
    // No session — voluntary logout or full cache clear → show login
    showLoginScreen();
  } catch(e) {
    // Network error — let user continue offline
    console.warn('Auth gate check failed:', e);
  }
}

// ── Password migration check (handles anonymous vs email users) ──
async function checkPasswordMigration(user) {
  if (!user) return;

  // Anonymous user (no email) — sign out silently, show login screen
  if (!user.email) {
    await supaClient.auth.signOut();
    cloudSyncEnabled = false;
    updateCloudUI(null);
    showLoginScreen(); // checkAuthGate now passes anonymous sessions; show login here
    // Do NOT touch db or localStorage — data stays intact
    return;
  }

  // Email user — mark as migrated if profile confirms it
  if (db.passwordMigrated === true) return;
  try {
    const { data } = await supaClient.from('profiles').select('password_migrated').eq('id', user.id).maybeSingle();
    if (data && data.password_migrated === true) {
      db.passwordMigrated = true;
      saveDB();
    }
  } catch(e) { console.warn('Migration check error:', e); }
  // No blocking modal — users who need a password can use "Mot de passe oublié"
  // or the automatic prompt when signing up with an existing magic link email
}
async function cloudLogout() {
  if (!supaClient) return;
  _voluntaryLogout = true;
  try {
    await supaClient.auth.signOut();
  } catch(e) { console.warn('signOut error:', e); }
  cloudSyncEnabled = false;
  _cachedUid = null;
  if (_notifRealtimeChannel) {
    try { supaClient.removeChannel(_notifRealtimeChannel); } catch(e) {}
    _notifRealtimeChannel = null;
  }
  if (_globalCommentChannel) {
    try { supaClient.removeChannel(_globalCommentChannel); } catch(e) {}
    _globalCommentChannel = null;
  }
  _notifPanelOpen = false;
  var panel = document.getElementById('notif-panel-global');
  if (panel) panel.style.display = 'none';
  updateCloudUI(null);
  updateNotifBadges(0);
  showToast('Déconnecté du cloud');
  localStorage.removeItem(STORAGE_KEY);
  if (typeof defaultDB === 'function') db = defaultDB();
  if (typeof showLoginScreen === 'function') showLoginScreen();
}

async function changePassword() {
  const pwd = document.getElementById('newPassword').value;
  const confirm = document.getElementById('newPasswordConfirm').value;
  if (!pwd || pwd.length < 8) { showToast('Mot de passe trop court'); return; }
  if (pwd !== confirm) { showToast('Les mots de passe ne correspondent pas'); return; }
  try {
    const { error } = await supaClient.auth.updateUser({ password: pwd });
    if (error) throw error;
    showToast('Mot de passe mis à jour ✅');
    document.getElementById('newPassword').value = '';
    document.getElementById('newPasswordConfirm').value = '';
  } catch(e) {
    showToast('Erreur : ' + e.message);
  }
}

// ============================================================
// SOCIAL MODULE — STATE & HELPERS
// ============================================================
let _socialInitialized = false;
let _feedPage = 0;
const FEED_PAGE_SIZE = 20;
let _feedItems = [];
let _friendsCache = [];
let _notifCache = [];
let _leaderboardCache = [];
let _socialSearchTimeout = null;

// Feed V2 state
let _feedAmisPage = 0;
let _feedAmisItems = [];
let _feedCommunautePage = 0;
let _feedCommunauteItems = [];
let _lb2Period = 'week';
let _lb2Category = 'volume';

const COMMON_EMOJIS = ['💪','🔥','👏','🎉','❤️','😤','🏆','⚡','👊','💯','🙌','😂','🤯','💀','🫡','👑'];

function getMyUserId() {
  if (!supaClient) return null;
  try {
    const session = supaClient.auth.getSession();
    return session?.data?.session?.user?.id || null;
  } catch { return null; }
}

var _cachedUid = null;
var _globalCommentChannel = null;
var _openCommentPostId = null;
var _notifPanelOpen = false;
var _notifRealtimeChannel = null;
var _unreadNotifCount = 0;

function initGlobalCommentChannel() {
  if (_globalCommentChannel || !supaClient) return;
  _globalCommentChannel = supaClient
    .channel('global-comments')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, function(payload) {
      if (payload.new.activity_id !== _openCommentPostId) return;
      var section = document.getElementById('fv2-comments-' + payload.new.activity_id);
      if (!section || section.style.display === 'none') return;
      appendRealtimeComment(payload.new.activity_id, payload.new);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, function(payload) {
      if (!payload.old || payload.old.activity_id !== _openCommentPostId) return;
      var row = document.getElementById('comment-row-' + payload.old.id);
      if (row) row.remove();
      updateCommentCount(payload.old.activity_id);
    })
    .subscribe();
}

async function appendRealtimeComment(activityId, comment) {
  var section = document.getElementById('fv2-comments-' + activityId);
  if (!section) return;
  var uid = _cachedUid || await getMyUserIdAsync();
  var username = 'Utilisateur';
  if (supaClient) {
    var { data: profile } = await supaClient.from('public_profiles').select('username').eq('id', comment.user_id).maybeSingle();
    if (profile) username = profile.username;
  }
  var isMe = comment.user_id === uid;
  var row = document.createElement('div');
  row.className = 'fv2-comment-row';
  row.id = 'comment-row-' + comment.id;
  row.innerHTML =
    '<div class="fv2-comment-body">' +
      '<span class="fv2-comment-user">' + escapeHtml(username) + '</span> ' +
      '<span class="fv2-comment-text">' + escapeHtml(comment.text) + '</span>' +
      '<div class="fv2-comment-time">' + fv2TimeAgo(comment.created_at) + '</div>' +
    '</div>' +
    (isMe ? '<button class="fv2-comment-delete" onclick="deleteComment(\'' + comment.id + '\',\'' + activityId + '\')">×</button>' : '');
  var inputRow = section.querySelector('.fv2-comment-input-row');
  var emptyMsg = section.querySelector('[style*="Pas encore"]');
  if (emptyMsg) emptyMsg.remove();
  if (inputRow) section.insertBefore(row, inputRow);
  else section.appendChild(row);
  updateCommentCount(activityId);
}

function updateCommentCount(activityId) {
  var section = document.getElementById('fv2-comments-' + activityId);
  var count = section ? section.querySelectorAll('.fv2-comment-row').length : 0;
  var btn = document.getElementById('fv2-comment-btn-' + activityId);
  if (btn) btn.innerHTML = '💬 ' + count;
}

async function getMyUserIdAsync() {
  if (_cachedUid) return _cachedUid;
  if (!supaClient) return null;
  try {
    const { data } = await supaClient.auth.getUser();
    _cachedUid = data?.user?.id || null;
    // Associe l'utilisateur à ses erreurs via UUID uniquement (jamais email/pseudo)
    if (_cachedUid && typeof sentrySetUserId === 'function') sentrySetUserId(_cachedUid);
    return _cachedUid;
  } catch { return null; }
}

function timeAgo(input) {
  if (!input) return 'récemment';
  var ms;
  if (typeof input === 'number') { ms = input; }
  else if (input instanceof Date) { ms = input.getTime(); }
  else { ms = new Date(input).getTime(); }
  if (isNaN(ms)) return 'récemment';
  var diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 0) return 'récemment';
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return Math.floor(diff / 60) + 'min';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return Math.floor(diff / 86400) + 'j';
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function avatarInitial(username) {
  return escapeHtml((username || 'U').charAt(0).toUpperCase());
}

function generateInviteCodeString() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 2; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function showSocialSub(subId, btn) {
  document.querySelectorAll('.social-sub-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.social-sub-tab').forEach(el => el.classList.remove('active'));
  var el = document.getElementById(subId);
  if (el) el.classList.add('active');
  if (btn) btn.classList.add('active');
  else document.querySelector('.social-sub-tab[data-sub="'+subId+'"]')?.classList.add('active');
  if (subId === 'social-feed') renderFeed();
  if (subId === 'social-leaderboard') renderLeaderboard();
  if (subId === 'social-friends') renderFriendsTab();
  if (subId === 'social-challenges') renderChallengesTab();
}

// Feed V2 — sub-tab switcher
function showFeedSub(subId, btn) {
  document.querySelectorAll('.feed-sub-content').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('#feedPills .stats-sub-pill').forEach(function(el) { el.classList.remove('active'); });
  var target = document.getElementById(subId);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
  if (subId === 'feed-amis') renderFeedAmis();
  if (subId === 'feed-communaute') renderFeedCommunaute();
  if (subId === 'feed-challenges') renderFeedChallengesV2();
  if (subId === 'feed-classement') renderFeedClassementV2();
  if (subId === 'social-friends') renderFriendsTab();
  if (typeof _updateLastTab === 'function') _updateLastTab('social', subId);
}

var _socialLastInit = 0;
async function initSocialTab() {
  // Throttle: skip full re-init if already initialized in last 30s and DOM has content
  var now = Date.now();
  if (now - _socialLastInit < 30000) {
    var hasContent = document.querySelector('#feed-amis .feed-post, #feedAmisContent .feed-post, #feedAmisContent [class*="friend"]');
    if (hasContent) { initNotifications(); return; }
  }
  _socialLastInit = now;
  if (!supaClient || !cloudSyncEnabled) {
    var amis = document.getElementById('feedAmisContent');
    if (amis) amis.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">☁️</div><div class="feed-empty-title">Connexion requise</div><div class="feed-empty-sub">Connecte-toi au cloud dans Profil > Réglages pour accéder au module social.</div><button onclick="showTab(\'tab-profil\');showProfilSub(\'tab-settings\');setTimeout(function(){toggleAcc(\'acc-cloud\');},200);" style="margin-top:14px;background:var(--blue);color:white;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;">Se connecter au cloud →</button></div>';
    return;
  }
  var uid = await getMyUserIdAsync();
  if (!uid) return;

  // Check if social onboarding needed
  if (!db.social.onboardingCompleted) {
    showSocialOnboarding();
    return;
  }

  // Ensure profile + friend_code exist in Supabase (fire-and-forget, doesn't block feed)
  ensureProfile().catch(function(e) { console.warn('ensureProfile:', e); });

  // Display friend code
  var fcEl = document.getElementById('myFriendCode');
  if (fcEl) fcEl.textContent = db.friendCode || '---';

  // Load the active feed sub-tab
  var activeFeedSub = document.querySelector('.feed-sub-content.active');
  var feedSubId = activeFeedSub ? activeFeedSub.id : 'feed-amis';
  showFeedSub(feedSubId);

  // Init notification bell + badge
  initNotifications();
}

// ============================================================
// SOCIAL MODULE — PROFILE MANAGEMENT
// ============================================================
/*
-- NOTE DÉVELOPPEUR : créer cette table dans Supabase Dashboard > SQL Editor
-- (ajouter les colonnes friend_code et password_migrated à la table profiles existante)
--
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friend_code text UNIQUE;
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_migrated boolean DEFAULT false;
--
-- Si la table profiles n'existe pas encore :
-- CREATE TABLE profiles (
--   id uuid REFERENCES auth.users PRIMARY KEY,
--   username text,
--   friend_code text UNIQUE,
--   password_migrated boolean DEFAULT false,
--   updated_at timestamp DEFAULT now()
-- );
-- RLS : lecture publique pour lookup par code ami, écriture uniquement sur soi-même
-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Public read" ON profiles FOR SELECT USING (true);
-- CREATE POLICY "Self write" ON profiles FOR ALL USING (auth.uid() = id);
*/

function generateFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function ensureFriendCode() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return null;

  // If we already have it locally, verify it exists in DB too
  if (db.friendCode) {
    try {
      const { data } = await supaClient.from('profiles').select('friend_code').eq('id', uid).maybeSingle();
      if (data && data.friend_code) return data.friend_code;
      // Local has it but DB doesn't — write it below
    } catch (_) {}
  }

  try {
    // Check if profile already has a friend_code in Supabase
    const { data } = await supaClient.from('profiles').select('friend_code').eq('id', uid).maybeSingle();
    if (data && data.friend_code) {
      db.friendCode = data.friend_code;
      saveDB();
      return data.friend_code;
    }

    // Generate a new unique code
    let code = db.friendCode || generateFriendCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supaClient.from('public_profiles').select('id').eq('friend_code', code).maybeSingle();
      if (!existing) break;
      code = generateFriendCode();
      attempts++;
    }

    // Save to Supabase via upsert
    const { error } = await supaClient.from('profiles').upsert({
      id: uid,
      friend_code: code
    }, { onConflict: 'id' });
    if (error) {
      console.error('ensureFriendCode UPSERT error:', error);
      showToast('Erreur code ami : ' + error.message);
      return null;
    }

    // Verify write
    const { data: verify } = await supaClient.from('profiles').select('friend_code').eq('id', uid).maybeSingle();
    if (!verify || !verify.friend_code) {
      console.error('ensureFriendCode: wrote code but cannot read it back (RLS?)');
    }

    db.friendCode = code;
    saveDB();
    return code;
  } catch (e) {
    console.error('ensureFriendCode error:', e);
    showToast('Erreur code ami');
    return null;
  }
}

async function lookupFriendByCode(code) {
  if (!supaClient || !code) return null;
  code = code.trim().toUpperCase();
  try {
    const { data, error } = await supaClient.from('public_profiles')
      .select('id, username')
      .eq('friend_code', code)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('lookupFriendByCode error:', e);
    return null;
  }
}

async function addFriendByCode() {
  const input = document.getElementById('friendCodeInput');
  const code = (input.value || '').trim().toUpperCase();
  if (!code || code.length !== 6) { showToast('Entre un code de 6 caractères'); return; }

  const uid = await getMyUserIdAsync();
  if (!uid) { showToast('Connexion requise'); return; }

  // Can't add yourself
  if (code === db.friendCode) { showToast('C\'est ton propre code !'); return; }

  const friend = await lookupFriendByCode(code);
  if (!friend) { showToast('Code ami introuvable'); return; }

  // Send friend request via Supabase (sendFriendRequest handles toasts & re-render)
  await sendFriendRequest(friend.id);

  input.value = '';
}

async function ensureProfile() {
  if (typeof db === 'undefined' || !db) return null;
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return null;

  try {
    // 1. Read existing profile from Supabase
    const { data: existing, error: readErr } = await supaClient
      .from('profiles').select('*').eq('id', uid).maybeSingle();
    if (readErr) {
      console.error('ensureProfile READ error:', readErr);
      if (typeof showToast === 'function') showToast('Erreur lecture profil : ' + readErr.message);
      return null;
    }

    // 2. Determine username: local > base > fallback
    if (!db.social) db.social = {};
    let username = db.social.username
      || (existing && existing.username)
      || null;
    if (!username) {
      try {
        const { data: authData } = await supaClient.auth.getUser();
        username = authData?.user?.email?.split('@')[0] || null;
      } catch (_) {}
      if (!username) {
        username = 'user' + Math.random().toString(36).substring(2, 6);
      }
      db.social.username = username;
      saveDB();
    }

    // 3. Determine friend_code: local > base > generate
    let friendCode = db.friendCode
      || (existing && existing.friend_code)
      || generateFriendCode();

    // 4. Build upsert payload — never overwrite a DB value with a weaker local value
    const onboardingDone = db.social.onboardingCompleted || (existing && existing.onboarding_completed) || false;
    const profilePayload = {
      id: uid,
      username: username,
      bio: db.social.bio || (existing && existing.bio) || '',
      friend_code: friendCode,
      visibility_bio: db.social.visibility?.bio || (existing && existing.visibility_bio) || 'private',
      visibility_prs: db.social.visibility?.prs || (existing && existing.visibility_prs) || 'private',
      visibility_programme: db.social.visibility?.programme || (existing && existing.visibility_programme) || 'private',
      visibility_seances: db.social.visibility?.seances || (existing && existing.visibility_seances) || 'private',
      visibility_stats: db.social.visibility?.stats || (existing && existing.visibility_stats) || 'private',
      onboarding_completed: onboardingDone
    };

    // 5. Upsert — create or update
    const { error: upsertErr } = await supaClient.from('profiles').upsert(
      profilePayload, { onConflict: 'id' }
    );

    if (upsertErr) {
      console.error('ensureProfile UPSERT error:', upsertErr);
      // Username conflict — retry with a random suffix
      if (upsertErr.message && upsertErr.message.includes('username')) {
        const retryUsername = username + Math.floor(Math.random() * 999);
        console.warn('ensureProfile: username conflict, retrying with', retryUsername);
        profilePayload.username = retryUsername;
        const { error: retryErr } = await supaClient.from('profiles').upsert(
          profilePayload, { onConflict: 'id' }
        );
        if (retryErr) {
          console.error('ensureProfile RETRY error:', retryErr);
          showToast('Erreur création profil : ' + retryErr.message);
          return null;
        }
        username = retryUsername;
      } else {
        showToast('Erreur création profil : ' + upsertErr.message);
        return null;
      }
    }

    // Sync onboarding flag back if DB had it true
    if (onboardingDone && !db.social.onboardingCompleted) {
      db.social.onboardingCompleted = true;
    }

    // 5. Sync back to local state
    db.social.profileId = uid;
    db.social.username = username;
    db.friendCode = friendCode;
    saveDB();

    return uid;
  } catch (e) {
    console.error('ensureProfile EXCEPTION:', e);
    showToast('Erreur profil : ' + (e.message || e));
    return null;
  }
}

async function checkUsernameAvailability(username) {
  const statusEl = document.getElementById('sob-username-status');
  if (!statusEl) return;
  username = (username || '').trim().toLowerCase();
  if (!username || username.length < 3) {
    statusEl.innerHTML = '<span style="color:var(--sub);">3 caractères minimum</span>';
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    statusEl.innerHTML = '<span style="color:var(--red);">Lettres, chiffres et _ uniquement</span>';
    return;
  }
  if (!supaClient) return;
  try {
    // Check profiles
    const { data: existing } = await supaClient.from('public_profiles').select('id').eq('username', username).maybeSingle();
    if (existing) {
      statusEl.innerHTML = '<span style="color:var(--red);">❌ Pseudo déjà pris</span>';
      return;
    }
    // Check reserved
    const { data: reserved } = await supaClient.from('reserved_usernames').select('username').eq('username', username).maybeSingle();
    if (reserved) {
      statusEl.innerHTML = '<span style="color:var(--red);">❌ Pseudo réservé temporairement</span>';
      return;
    }
    statusEl.innerHTML = '<span style="color:var(--green);">✓ Disponible</span>';
  } catch (e) {
    statusEl.innerHTML = '<span style="color:var(--sub);">Vérification impossible</span>';
  }
}

async function updateUsername(newUsername) {
  const uid = await getMyUserIdAsync();
  if (!uid) return false;

  // Check cooldown (30 days)
  if (db.social.usernameChangedAt) {
    const daysSince = (Date.now() - new Date(db.social.usernameChangedAt).getTime()) / 86400000;
    if (daysSince < 30) {
      showToast('Tu peux changer de pseudo dans ' + Math.ceil(30 - daysSince) + ' jours');
      return false;
    }
  }

  const oldUsername = db.social.username;
  try {
    // Reserve old username for 30 days
    if (oldUsername) {
      await supaClient.from('reserved_usernames').upsert({
        username: oldUsername.toLowerCase(),
        released_at: new Date(Date.now() + 30 * 86400000).toISOString()
      }, { onConflict: 'username' });
    }
    // Update profile
    const { error } = await supaClient.from('profiles').update({
      username: newUsername.toLowerCase(),
      username_changed_at: new Date().toISOString()
    }).eq('id', uid);
    if (error) throw error;

    db.social.username = newUsername.toLowerCase();
    db.social.usernameChangedAt = new Date().toISOString();
    saveDB();
    showToast('Pseudo mis à jour !');
    return true;
  } catch (e) {
    console.error('updateUsername error:', e);
    showToast('Erreur lors du changement de pseudo');
    return false;
  }
}

async function updateProfileVisibility(field, value) {
  const uid = await getMyUserIdAsync();
  if (!uid) return;
  const col = 'visibility_' + field;
  try {
    await supaClient.from('profiles').update({ [col]: value }).eq('id', uid);
    db.social.visibility[field] = value;
    saveDB();
  } catch (e) {
    console.error('updateProfileVisibility error:', e);
  }
}

async function updateBio(newBio) {
  const uid = await getMyUserIdAsync();
  if (!uid) return;
  try {
    await supaClient.from('profiles').update({ bio: newBio }).eq('id', uid);
    db.social.bio = newBio;
    saveDB();
    showToast('Bio mise à jour');
  } catch (e) {
    console.error('updateBio error:', e);
  }
}

// ============================================================
// SOCIAL MODULE — TRAINING STATUS (live)
// ============================================================
async function setTrainingStatus(active, sessionTitle) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  try {
    await supaClient.from('profiles').update({
      training_status: active ? (sessionTitle || 'Séance') : null,
      training_since: active ? new Date().toISOString() : null
    }).eq('id', uid);
  } catch (e) {
    console.error('setTrainingStatus error:', e);
  }
}

// ============================================================
// SOCIAL MODULE — FRIEND SYSTEM
// ============================================================
async function searchUsers(query) {
  if (!supaClient || !query || query.length < 2) return [];
  const uid = await getMyUserIdAsync();
  try {
    const { data, error } = await supaClient.from('public_profiles')
      .select('id, username')
      .ilike('username', '%' + query + '%')
      .neq('id', uid)
      .limit(10);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('searchUsers error:', e);
    return [];
  }
}

function onFriendSearchInput(val) {
  clearTimeout(_socialSearchTimeout);
  const dropdown = document.getElementById('friendAutocomplete');
  if (!val || val.length < 2) {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    return;
  }
  _socialSearchTimeout = setTimeout(async () => {
    const results = await searchUsers(val);
    if (!results.length) {
      dropdown.classList.remove('open');
      return;
    }
    dropdown.innerHTML = results.map(u =>
      '<div class="friends-ac-item" onclick="onSelectSearchUser(\'' + u.id + '\')">' +
        '<div class="friends-ac-avatar">' + avatarInitial(u.username) + '</div>' +
        '<span class="friends-ac-name">' + escapeHtml(u.username) + '</span>' +
      '</div>'
    ).join('');
    dropdown.classList.add('open');
  }, 300);
}

async function onSelectSearchUser(userId, username) {
  document.getElementById('friendAutocomplete').classList.remove('open');
  document.getElementById('friendSearchInput').value = '';
  // Show profile overlay
  await showProfileOverlay(userId);
}

async function loadFriends() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return [];
  try {
    const { data, error } = await supaClient.from('friendships')
      .select('id, requester_id, target_id, status, created_at')
      .or('requester_id.eq.' + uid + ',target_id.eq.' + uid);
    if (error) throw error;
    _friendsCache = data || [];
    return _friendsCache;
  } catch (e) {
    console.error('loadFriends error:', e);
    return [];
  }
}

async function getAcceptedFriendIds() {
  const uid = await getMyUserIdAsync();
  if (!uid) return [];
  const friends = await loadFriends();
  return friends
    .filter(f => f.status === 'accepted')
    .map(f => f.requester_id === uid ? f.target_id : f.requester_id);
}

async function getFriendProfiles(friendIds) {
  if (!friendIds.length || !supaClient) return [];
  try {
    const { data, error } = await supaClient.from('public_profiles')
      .select('id, username, bio, visibility_bio, visibility_prs, visibility_programme, visibility_seances, visibility_stats')
      .in('id', friendIds);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('getFriendProfiles error:', e);
    return [];
  }
}

async function sendFriendRequest(targetId) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  try {
    // Check if relationship already exists
    const { data: existing } = await supaClient.from('friendships')
      .select('id, status')
      .or(
        'and(requester_id.eq.' + uid + ',target_id.eq.' + targetId + '),' +
        'and(requester_id.eq.' + targetId + ',target_id.eq.' + uid + ')'
      )
      .maybeSingle();
    if (existing) {
      if (existing.status === 'blocked') { showToast('Action impossible'); return; }
      if (existing.status === 'accepted') { showToast('Déjà amis !'); return; }
      if (existing.status === 'pending') { showToast('Demande déjà envoyée'); return; }
    }
    const { error } = await supaClient.from('friendships').insert({
      requester_id: uid,
      target_id: targetId,
      status: 'pending'
    });
    if (error) throw error;
    // Verify the row is actually readable (RLS SELECT could block it)
    const { data: verify, error: verifyErr } = await supaClient.from('friendships')
      .select('id')
      .eq('requester_id', uid)
      .eq('target_id', targetId)
      .eq('status', 'pending')
      .maybeSingle();
    if (verifyErr || !verify) {
      console.error('sendFriendRequest: insert OK but SELECT failed — RLS issue?', verifyErr);
      showToast('Demande envoyée mais vérification impossible. Vérifie dans quelques instants.');
      return;
    }
    showToast('Demande envoyée !');
    renderFriendsTab();
  } catch (e) {
    console.error('sendFriendRequest error:', e);
    showToast('Erreur lors de l\'envoi');
  }
}

async function acceptFriendRequest(friendshipId) {
  if (!supaClient) return;
  try {
    const { data: fs } = await supaClient.from('friendships').select('requester_id').eq('id', friendshipId).single();
    const { error } = await supaClient.from('friendships').update({
      status: 'accepted',
      updated_at: new Date().toISOString()
    }).eq('id', friendshipId);
    if (error) throw error;
    // Create notification for requester
    if (fs) {
      await supaClient.from('notifications').insert({
        user_id: fs.requester_id,
        type: 'friend_accepted',
        data: { username: db.social.username }
      });
    }
    showToast('Ami ajouté !');
    renderFriendsTab();
  } catch (e) {
    console.error('acceptFriendRequest error:', e);
  }
}

async function declineFriendRequest(friendshipId) {
  if (!supaClient) return;
  try {
    await supaClient.from('friendships').delete().eq('id', friendshipId);
    showToast('Demande refusée');
    renderFriendsTab();
  } catch (e) {
    console.error('declineFriendRequest error:', e);
  }
}

async function removeFriend(friendshipId) {
  showModal(
    'Retirer cet ami ?<br><span style="font-size:12px;color:var(--sub);">Il ne sera pas notifié.</span>',
    'Retirer',
    'var(--red)',
    async function() {
      try {
        await supaClient.from('friendships').delete().eq('id', friendshipId);
        showToast('Ami retiré');
        renderFriendsTab();
      } catch (e) {
        console.error('removeFriend error:', e);
      }
    }
  );
}

async function blockUser(targetId) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  try {
    // Check existing relationship
    const { data: existing } = await supaClient.from('friendships')
      .select('id')
      .or(
        'and(requester_id.eq.' + uid + ',target_id.eq.' + targetId + '),' +
        'and(requester_id.eq.' + targetId + ',target_id.eq.' + uid + ')'
      )
      .maybeSingle();
    if (existing) {
      await supaClient.from('friendships').update({
        requester_id: uid,
        target_id: targetId,
        status: 'blocked',
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
    } else {
      await supaClient.from('friendships').insert({
        requester_id: uid,
        target_id: targetId,
        status: 'blocked'
      });
    }
    showToast('Utilisateur bloqué');
    renderFriendsTab();
    closeProfileOverlay();
  } catch (e) {
    console.error('blockUser error:', e);
  }
}

async function unblockUser(friendshipId) {
  if (!supaClient) return;
  try {
    await supaClient.from('friendships').delete().eq('id', friendshipId);
    showToast('Utilisateur débloqué');
    renderFriendsTab();
  } catch (e) {
    console.error('unblockUser error:', e);
  }
}

// ── Invite Codes (legacy — kept for onboarding compat) ──
async function createNewInviteCode() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return null;
  const code = generateInviteCodeString();
  try {
    const { error } = await supaClient.from('invite_codes').insert({
      user_id: uid,
      code: code
    });
    if (error) throw error;
    return code;
  } catch (e) {
    console.error('createNewInviteCode error:', e);
    return null;
  }
}

function copyFriendCode() {
  var el = document.getElementById('myFriendCode');
  var code = el ? el.textContent.trim() : (db.friendCode || '');
  if (!code || code === '---') return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(function() { showToast('Code ' + code + ' copié ! 👥'); }).catch(function() { _fallbackCopy(code); });
  } else {
    _fallbackCopy(code);
  }
}

function _fallbackCopy(text) {
  var el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  showToast('Code copié ! 👥');
}

async function shareActivity(activityId, title) {
  var url = location.origin + location.pathname;
  var shareData = { title: title || 'TrainHub', text: 'Regarde cette séance sur TrainHub !', url: url };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (e) {
      if (e.name !== 'AbortError') { _fallbackCopy(url); showToast('Lien copié ! 📋'); }
    }
  } else {
    _fallbackCopy(url);
    showToast('Lien copié ! 📋');
  }
}

function openDefiModal(activityId, targetUsername) {
  var usernameEsc = escapeHtml(targetUsername || '');
  var formHtml =
    '<div style="font-size:14px;margin-bottom:12px;">Lancer un défi à <strong>' + usernameEsc + '</strong></div>' +
    '<select id="defi-exercise" style="width:100%;padding:8px;margin-bottom:10px;border-radius:8px;border:0.5px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;">' +
      '<option value="squat">🦵 Squat</option>' +
      '<option value="bench">💪 Bench Press</option>' +
      '<option value="deadlift">🏋️ Deadlift</option>' +
      '<option value="total">🏆 Total SBD</option>' +
    '</select>' +
    '<input type="number" id="defi-target" placeholder="Objectif en kg" style="width:100%;padding:8px;margin-bottom:10px;border-radius:8px;border:0.5px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;">' +
    '<input type="date" id="defi-deadline" style="width:100%;padding:8px;border-radius:8px;border:0.5px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;">';

  showModal(formHtml, 'Envoyer le défi 🏆', 'var(--blue)', function() {
    var exercise = (document.getElementById('defi-exercise') || {}).value || 'squat';
    var target = (document.getElementById('defi-target') || {}).value || '';
    var deadline = (document.getElementById('defi-deadline') || {}).value || '';
    submitDefi(activityId, targetUsername, exercise, target, deadline);
  });
}

async function submitDefi(activityId, targetUsername, exercise, target, deadline) {
  var uid = _cachedUid || await getMyUserIdAsync();
  if (!uid || !supaClient) { showToast('Connecte-toi'); return; }
  var targetVal = parseFloat(target);
  if (!targetVal || isNaN(targetVal)) { showToast('Ajoute un objectif en kg'); return; }
  var endDate = deadline ? new Date(deadline) : new Date(Date.now() + 7 * 86400000);
  try {
    await supaClient.from('social_challenges').insert({
      creator_id: uid,
      title: 'Défi ' + exercise + ' — ' + targetVal + 'kg',
      type: exercise,
      target_value: targetVal,
      end_date: endDate.toISOString()
    });
    showToast('Défi envoyé à ' + escapeHtml(targetUsername) + ' 🏆');
  } catch(e) { console.error('submitDefi error:', e); showToast('Erreur envoi défi'); }
}

async function createDefiFromModal() {
  var uid = await getMyUserIdAsync();
  if (!uid || !supaClient) { showToast('Connecte-toi'); return; }
  var type = document.getElementById('defi-type');
  var target = document.getElementById('defi-target');
  var duration = document.getElementById('defi-duration');
  var typeVal = type ? type.value : 'volume';
  var targetVal = parseFloat(target ? target.value : 0);
  var days = parseInt(duration ? duration.value : 7) || 7;
  if (!targetVal || isNaN(targetVal)) { showToast('Ajoute un objectif'); return; }
  var endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  var ins = await supaClient.from('social_challenges').insert({
    creator_id: uid, title: 'Défi ' + typeVal + ' — ' + days + 'j',
    type: typeVal, target_value: targetVal, end_date: endDate.toISOString()
  });
  var modal = document.getElementById('modal-defi');
  if (modal) modal.remove();
  if (ins.error) { console.error('Defi error:', ins.error); showToast('Erreur ❌'); return; }
  showToast('Défi créé ! 🏆');
  if (typeof renderFeedChallengesV2 === 'function') renderFeedChallengesV2();
  if (typeof renderChallengesTab === 'function') renderChallengesTab();
}


// ============================================================
// SOCIAL MODULE — ACTIVITY FEED
// ============================================================
async function loadFeedItems(page) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return [];
  try {
    const { data, error } = await supaClient.from('activity_feed')
      .select('id, user_id, type, data, pinned, created_at')
      .order('created_at', { ascending: false })
      .range(page * FEED_PAGE_SIZE, (page + 1) * FEED_PAGE_SIZE - 1);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('loadFeedItems error:', e);
    return [];
  }
}

async function loadReactionsForActivity(activityId) {
  if (!supaClient) return [];
  try {
    const { data } = await supaClient.from('reactions')
      .select('id, user_id, emoji, created_at')
      .eq('activity_id', activityId);
    return data || [];
  } catch { return []; }
}

async function loadCommentsForActivity(activityId) {
  if (!supaClient) return [];
  try {
    const { data } = await supaClient.from('comments')
      .select('id, user_id, text, created_at')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true });
    return data || [];
  } catch { return []; }
}

async function renderFeed() {
  const uid = await getMyUserIdAsync();
  if (!uid) return;

  const feedContent = document.getElementById('feedContent');
  const pinnedSection = document.getElementById('feedPinnedSection');
  const loadMoreBtn = document.getElementById('feedLoadMore');
  // Guard: the social tab may have been replaced while the awaits above were
  // pending (tab change mid-fetch) — bail out instead of touching null .style/.innerHTML.
  if (!feedContent || !pinnedSection || !loadMoreBtn) return;

  if (_feedPage === 0) {
    _feedItems = [];
    feedContent.innerHTML = '<div style="text-align:center;padding:20px;color:var(--sub);">Chargement...</div>';
    pinnedSection.innerHTML = '';
  }

  var _feedTimeout = setTimeout(function() {
    if (feedContent && feedContent.textContent.trim() === 'Chargement...') {
      feedContent.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">📡</div><div class="feed-empty-title">Connexion lente</div><div class="feed-empty-sub">Impossible de charger le feed. Vérifie ta connexion.</div></div>';
    }
  }, 8000);

  var items;
  try {
    items = await loadFeedItems(_feedPage);
  } catch(e) {
    clearTimeout(_feedTimeout);
    feedContent.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">😕</div><div class="feed-empty-title">Erreur de chargement</div><div class="feed-empty-sub">Impossible de charger le feed.</div></div>';
    return;
  }
  clearTimeout(_feedTimeout);
  _feedItems = _feedItems.concat(items);

  // Get unique user IDs
  const userIds = [...new Set(_feedItems.map(i => i.user_id))];
  let profiles = {};
  const [, friendIds] = await Promise.all([
    (async () => {
      if (userIds.length) {
        try {
          const { data } = await supaClient.from('public_profiles').select('id, username').in('id', userIds);
          (data || []).forEach(p => profiles[p.id] = p);
        } catch {}
      }
    })(),
    getAcceptedFriendIds()
  ]);

  if (!_feedItems.length) {
    feedContent.innerHTML = '<div class="feed-empty">' +
      '<div class="feed-empty-icon">🤝</div>' +
      '<div class="feed-empty-title">' + (friendIds.length ? 'Rien de nouveau' : 'Invite tes amis !') + '</div>' +
      '<div class="feed-empty-sub">' + (friendIds.length ? 'Tes amis n\'ont pas encore posté.' : 'Partage ton code d\'invitation pour retrouver tes partenaires.') + '</div>' +
      (!friendIds.length ? '<button class="btn" style="max-width:200px;margin:0 auto;" onclick="showSocialSub(\'social-friends\')">Ajouter des amis</button>' : '') +
    '</div>';
    pinnedSection.innerHTML = '';
    loadMoreBtn.style.display = 'none';
    return;
  }

  // Training banner — friends currently training
  let trainingBanner = '';
  try {
    if (friendIds.length) {
      const { data: trainingFriends } = await supaClient.from('public_profiles')
        .select('username, training_status, training_since')
        .in('id', friendIds)
        .not('training_status', 'is', null);
      if (trainingFriends && trainingFriends.length) {
        trainingBanner = '<div style="background:rgba(52,199,89,0.08);border:1px solid rgba(52,199,89,0.2);border-radius:12px;padding:10px 14px;margin-bottom:12px;">' +
          trainingFriends.map(f => {
            const mins = Math.floor((Date.now() - new Date(f.training_since).getTime()) / 60000);
            return '<div style="font-size:12px;color:var(--green);padding:2px 0;">🟢 <strong>' + escapeHtml(f.username) + '</strong> s\'entraîne — ' + escapeHtml(f.training_status) + ' · depuis ' + mins + 'min</div>';
          }).join('') + '</div>';
      }
    }
  } catch (e) {}

  // Separate pinned (today's PRs)
  const today = new Date().toDateString();
  const pinned = _feedItems.filter(i => i.pinned && new Date(i.created_at).toDateString() === today);
  const regular = _feedItems.filter(i => !pinned.includes(i));

  if (pinned.length) {
    pinnedSection.innerHTML = trainingBanner + '<div class="feed-pinned-header">🔥 PRs du jour</div>' +
      pinned.map(i => renderFeedCard(i, profiles, uid)).join('');
  } else {
    pinnedSection.innerHTML = trainingBanner;
  }

  feedContent.innerHTML = regular.map(i => renderFeedCard(i, profiles, uid)).join('');
  loadMoreBtn.style.display = items.length >= FEED_PAGE_SIZE ? '' : 'none';

  // Load reactions for all visible items
  _feedItems.forEach(i => loadAndRenderReactions(i.id));
}

function renderFeedSessionDetail(exercises) {
  if (!exercises || !exercises.length) return '<div style="color:var(--sub);font-size:12px;padding:8px;">Pas de détail disponible</div>';

  return '<div style="background:var(--surface);border-radius:10px;padding:10px;margin-top:4px;">' + exercises.map(function(exo) {
    var sets = exo.allSets || [];
    if (!sets.length) {
      // Fallback for exercises without allSets
      return '<div style="margin-bottom:10px;"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">' + escapeHtml(exo.name) + '</div>' +
        '<div style="font-size:11px;color:var(--sub);">' + (exo.sets || 0) + ' séries</div></div>';
    }
    var workSets = sets.filter(function(s) { return s.type !== 'warmup'; });
    var tonnage = sets.reduce(function(sum, s) { return sum + ((s.weight || 0) * (s.reps || 0)); }, 0);

    var html = '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">' + escapeHtml(exo.name) + '</div>';

    // Table header
    html += '<div style="display:grid;grid-template-columns:32px 1fr 1fr 58px;font-size:10px;color:var(--sub);text-transform:uppercase;letter-spacing:0.5px;padding:4px 0;font-weight:600;">';
    html += '<span>Série</span><span>Poids</span><span>Reps</span><span>Type</span></div>';

    // Rows
    sets.forEach(function(s, i) {
      var isWarmup = s.type === 'warmup';
      var isDrop = s.type === 'drop';
      var isFailure = s.type === 'failure';
      var rowColor = isWarmup ? 'color:var(--sub);' : isDrop ? 'color:var(--orange,#ff9500);' : isFailure ? 'color:var(--red);' : '';
      var typeLabel = isWarmup ? 'Échauff.' : isDrop ? 'Drop' : isFailure ? 'Échec' : 'Work';
      var typeBg = isWarmup ? 'rgba(134,134,139,0.1)' : isDrop ? 'rgba(255,159,10,0.12)' : isFailure ? 'rgba(255,69,58,0.12)' : 'rgba(10,132,255,0.08)';

      html += '<div style="display:grid;grid-template-columns:32px 1fr 1fr 58px;font-size:12px;padding:4px 0;border-top:1px solid rgba(255,255,255,0.04);' + rowColor + '">';
      html += '<span style="font-weight:600;font-size:11px;">' + (i + 1) + '</span>';
      html += '<span style="font-weight:700;">' + (s.weight || 0) + 'kg</span>';
      html += '<span>' + (s.reps || 0) + '</span>';
      html += '<span style="font-size:10px;background:' + typeBg + ';padding:2px 6px;border-radius:4px;text-align:center;font-weight:600;">' + typeLabel + '</span>';
      html += '</div>';
    });

    // Footer
    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;font-size:10px;color:var(--sub);padding:6px 0;margin-top:4px;border-top:1px solid rgba(255,255,255,0.06);">';
    html += '<span style="color:var(--purple,#bf5af2);font-weight:600;">' + workSets.length + ' séries</span>';
    if (exo.maxRM) html += '<span>e1RM : <strong style="color:var(--blue);">' + Math.round(exo.maxRM) + 'kg</strong></span>';
    if (tonnage > 0) html += '<span>Tonnage : <strong>' + tonnage + 'kg</strong></span>';
    html += '</div>';

    html += '</div>';
    return html;
  }).join('') + '</div>';
}

function renderFeedCard(item, profiles, uid) {
  const profile = profiles[item.user_id] || { username: 'Utilisateur supprimé' };
  const initial = avatarInitial(profile.username);
  const isMe = item.user_id === uid;
  const typeLabels = { session: 'Séance', pr: 'Nouveau PR', goal: 'Objectif', achievement: 'Badge' };
  const typeIcons = { session: '🏋️', pr: '🏆', goal: '🎯', achievement: '⭐' };
  const d = item.data || {};

  let body = '';
  let detail = '';
  if (item.type === 'session') {
    body = '🏋️ <strong>' + escapeHtml(profile.username) + '</strong> a terminé';
    if (d.title) body += ' <em>' + escapeHtml(d.title) + '</em>';
    const stats = [];
    if (d.exercise_count) stats.push(d.exercise_count + ' exos');
    if (d.volume) stats.push(Math.round(d.volume) + 'kg de tonnage');
    if (d.duration) stats.push(formatTime(d.duration));
    if (stats.length) body += ' · ' + stats.join(' · ');
    if (d.top_set) body += '<br><span style="color:var(--blue);font-size:12px;">Top set : ' + escapeHtml(d.top_set) + '</span>';
    if (d.edited) body += ' <span style="font-size:10px;color:var(--sub);font-style:italic;">(modifié)</span>';
    // Photos de séance
    if (d.photos && d.photos.length) {
      body += '<div style="display:flex;gap:4px;margin-top:8px;overflow-x:auto;">';
      d.photos.forEach(function(p) {
        var src = p.url || p.dataUrl || '';
        var safeSrc = /^(https?:|data:image\/)/.test(src) ? encodeURI(src) : '';
        if (safeSrc) body += '<img src="' + safeSrc + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;" loading="lazy">';
      });
      body += '</div>';
    }
    // Pas d'exercises dans data → lazy load au clic
    detail = '<div id="feed-session-detail-' + item.id + '" class="feed-session-lazy">' +
      '<button class="feed-load-session-btn" onclick="loadFeedSessionDetail(\'' + item.id + '\',\'' + (d.session_id || '') + '\',\'' + item.user_id + '\')">' +
      '📋 Voir la séance</button></div>';
    // Rétrocompat : anciens posts avec exercises[] inline
    if (d.exercises && d.exercises.length) {
      const hasEnrichedData = d.exercises.some(e => e.allSets && e.allSets.length);
      detail = hasEnrichedData
        ? renderFeedSessionDetail(d.exercises)
        : d.exercises.map(e => '<div class="exo-row"><span>' + escapeHtml(e.name) + '</span><span style="color:var(--blue);">' + (e.sets || 0) + ' séries</span></div>').join('');
    }
  } else if (item.type === 'pr') {
    body = '🏆 <strong>' + escapeHtml(profile.username) + '</strong> nouveau PR !';
    body += ' <em>' + escapeHtml(d.exercise || '') + '</em> <strong style="color:var(--green);">' + (d.value || 0) + 'kg</strong>';
    if (d.delta && d.delta > 0) body += ' <span style="color:var(--green);">(+' + d.delta + 'kg)</span>';
    if (d.previous) body += '<br><span style="color:var(--sub);font-size:12px;">Ancien : ' + d.previous + 'kg</span>';
  } else if (item.type === 'goal') {
    body = '🎯 <strong>' + escapeHtml(profile.username) + '</strong> — Objectif atteint ! ' +
      escapeHtml(d.exercise || '') + ' ' + (d.value || 0) + 'kg' +
      (d.weeks ? ' (en ' + d.weeks + ' semaines)' : '');
  } else if (item.type === 'achievement') {
    body = '⭐ <strong>' + escapeHtml(profile.username) + '</strong> a débloqué <em>' + escapeHtml(d.badge || d.title || '') + '</em>';
  }

  return '<div class="feed-card' + (item.pinned ? ' pinned' : '') + '" id="feed-' + item.id + '">' +
    '<div class="feed-card-header">' +
      '<div class="feed-avatar" onclick="showProfileOverlay(\'' + item.user_id + '\')">' + initial + '</div>' +
      '<div class="feed-user-info">' +
        '<div class="feed-username" onclick="showProfileOverlay(\'' + item.user_id + '\')">' + escapeHtml(profile.username) + (typeof renderTierBadge==='function' && profile.tier ? ' '+renderTierBadge(profile.tier) : '') + '</div>' +
        '<div class="feed-time">' + timeAgo(item.created_at) + '</div>' +
      '</div>' +
      '<span class="feed-type-badge ' + item.type + '">' + (typeLabels[item.type] || '') + '</span>' +
    '</div>' +
    '<div class="feed-body">' + body + '</div>' +
    (detail ? '<button class="feed-detail-toggle" onclick="toggleFeedDetail(\'' + item.id + '\')">Voir le détail ▾</button><div class="feed-detail-content" id="feed-detail-' + item.id + '">' + detail + '</div>' : '') +
    '<div class="feed-reactions" id="feed-reactions-' + item.id + '"></div>' +
    '<div class="feed-actions">' +
      '<div style="position:relative;"><button class="feed-action-btn" onclick="toggleEmojiPicker(\'' + item.id + '\')">😀 Réagir</button>' +
        '<div class="emoji-picker-popup" id="emoji-picker-' + item.id + '">' +
          '<div class="emoji-picker-grid">' + COMMON_EMOJIS.map(e => '<button onclick="addReaction(\'' + item.id + '\',\'' + e + '\')">' + e + '</button>').join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="feed-action-btn" onclick="toggleComments(\'' + item.id + '\')">💬 Commenter</button>' +
      (item.type === 'session' && !isMe ? '<button class="feed-action-btn" onclick="copyRoutineFromFeed(\'' + item.id + '\')">📋 Copier</button>' : '') +
    '</div>' +
    '<div class="feed-comments-section" id="feed-comments-' + item.id + '" style="display:none;"></div>' +
  '</div>';
}

function toggleFeedDetail(activityId) {
  const el = document.getElementById('feed-detail-' + activityId);
  if (el) el.classList.toggle('open');
}

// Copier la routine d'un ami depuis le feed
async function copyRoutineFromFeed(activityId) {
  var feedItem = (window._feedItems || []).concat(window._feedAmisItems || []).concat(window._feedCommunauteItems || [])
    .find(function(i) { return i.id === activityId; });
  if (!feedItem) { showToast('Impossible de copier'); return; }

  var d = feedItem.data || {};
  var exercises = d.exercises;

  // Nouveau format : pas d'exercises inline → fetch depuis sbd_profiles
  if (!exercises || !exercises.length) {
    if (!d.session_id || !supaClient) { showToast('Données non disponibles'); return; }
    try {
      var { data: profileData } = await supaClient
        .from('sbd_profiles')
        .select('data')
        .eq('user_id', feedItem.user_id)
        .maybeSingle();
      if (profileData && profileData.data && profileData.data.logs) {
        var remoteSession = profileData.data.logs.find(function(l) { return l.id === d.session_id; });
        if (remoteSession) exercises = remoteSession.exercises;
      }
    } catch(e) { console.error('copyRoutineFromFeed fetch error:', e); }
  }

  if (!exercises || !exercises.length) { showToast('Impossible de copier cette routine'); return; }

  var title = d.title || 'Routine copiée';
  if (!confirm('Copier "' + title + '" (' + exercises.length + ' exercices) dans tes routines ?')) return;

  if (!db.savedRoutines) db.savedRoutines = [];
  db.savedRoutines.push({
    id: generateId(),
    title: title,
    exercises: exercises.map(function(e) { return { name: e.name, sets: e.sets || 0 }; }),
    copiedFrom: feedItem.user_id,
    copiedAt: Date.now()
  });
  saveDB();
  showToast('✅ Routine "' + title + '" copiée !');
}

function toggleEmojiPicker(activityId) {
  const el = document.getElementById('emoji-picker-' + activityId);
  if (el) {
    // Close all others first
    document.querySelectorAll('.emoji-picker-popup.open').forEach(p => { if (p !== el) p.classList.remove('open'); });
    el.classList.toggle('open');
  }
}

async function addReaction(activityId, emoji) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  document.getElementById('emoji-picker-' + activityId)?.classList.remove('open');
  try {
    // Toggle: if already reacted with this emoji, remove it
    const { data: existing } = await supaClient.from('reactions')
      .select('id')
      .eq('activity_id', activityId)
      .eq('user_id', uid)
      .eq('emoji', emoji)
      .maybeSingle();
    if (existing) {
      await supaClient.from('reactions').delete().eq('id', existing.id);
    } else {
      await supaClient.from('reactions').insert({
        activity_id: activityId,
        user_id: uid,
        emoji: emoji
      });
      // Notify post author
      const { data: activity } = await supaClient.from('activity_feed').select('user_id').eq('id', activityId).single();
      if (activity && activity.user_id !== uid) {
        await supaClient.from('notifications').insert({
          user_id: activity.user_id,
          type: 'reaction',
          data: { username: db.social.username, emoji: emoji, activity_id: activityId }
        });
      }
    }
    loadAndRenderReactions(activityId);
  } catch (e) {
    console.error('addReaction error:', e);
  }
}

async function loadAndRenderReactions(activityId) {
  const uid = await getMyUserIdAsync();
  const reactions = await loadReactionsForActivity(activityId);
  const container = document.getElementById('feed-reactions-' + activityId);
  if (!container) return;

  // Group by emoji
  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false };
    grouped[r.emoji].count++;
    if (r.user_id === uid) grouped[r.emoji].mine = true;
  });

  container.innerHTML = Object.entries(grouped).map(([emoji, data]) =>
    '<div class="feed-reaction' + (data.mine ? ' mine' : '') + '" onclick="addReaction(\'' + activityId + '\',\'' + emoji + '\')">' +
      emoji + ' <span class="feed-reaction-count">' + data.count + '</span>' +
    '</div>'
  ).join('');
}

async function toggleComments(activityId) {
  var fv2Section = document.getElementById('fv2-comments-' + activityId);
  if (fv2Section) {
    var isOpen = fv2Section.style.display !== 'none';
    // Accordéon : fermer tous les autres
    document.querySelectorAll('.fv2-comments-section').forEach(function(s) {
      if (s.id !== 'fv2-comments-' + activityId && s.style.display !== 'none') s.style.display = 'none';
    });
    if (isOpen) { fv2Section.style.display = 'none'; _openCommentPostId = null; return; }
    _openCommentPostId = activityId;
    fv2Section.style.display = 'block';
    fv2Section.innerHTML = '<div style="text-align:center;padding:8px;font-size:12px;color:var(--sub);">Chargement...</div>';
    await loadFv2Comments(activityId);
    return;
  }
  // Old feed fallback
  const section = document.getElementById('feed-comments-' + activityId);
  if (!section) return;
  const isSectionOpen = section.style.display !== 'none';
  section.style.display = isSectionOpen ? 'none' : 'block';
  if (!isSectionOpen) await loadAndRenderComments(activityId);
}

async function loadAndRenderComments(activityId) {
  const uid = await getMyUserIdAsync();
  const comments = await loadCommentsForActivity(activityId);
  const section = document.getElementById('feed-comments-' + activityId);
  if (!section) return;

  // Get user profiles for comments
  const userIds = [...new Set(comments.map(c => c.user_id))];
  let profiles = {};
  if (userIds.length) {
    try {
      const { data } = await supaClient.from('public_profiles').select('id, username').in('id', userIds);
      (data || []).forEach(p => profiles[p.id] = p);
    } catch {}
  }

  // Get activity author for delete permission
  let activityAuthorId = null;
  try {
    const { data } = await supaClient.from('activity_feed').select('user_id').eq('id', activityId).single();
    if (data) activityAuthorId = data.user_id;
  } catch {}

  const commentsHtml = comments.map(c => {
    const p = profiles[c.user_id] || { username: 'Utilisateur' };
    const canDelete = c.user_id === uid || activityAuthorId === uid;
    return '<div class="feed-comment">' +
      '<div class="feed-comment-avatar">' + avatarInitial(p.username) + '</div>' +
      '<div class="feed-comment-body">' +
        '<div class="feed-comment-user">' + escapeHtml(p.username) + '</div>' +
        '<div class="feed-comment-text">' + escapeHtml(c.text) + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span class="feed-comment-time">' + timeAgo(c.created_at) + '</span>' +
          (canDelete ? '<button class="feed-comment-delete" onclick="deleteComment(\'' + c.id + '\',\'' + activityId + '\')">Supprimer</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  section.innerHTML = commentsHtml +
    '<div class="feed-comment-input">' +
      '<input type="text" id="comment-input-' + activityId + '" placeholder="Commenter..." maxlength="200" onkeydown="if(event.key===\'Enter\')postComment(\'' + activityId + '\')">' +
      '<button onclick="postComment(\'' + activityId + '\')">➤</button>' +
    '</div>';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function postComment(activityId) {
  const input = document.getElementById('comment-input-' + activityId);
  const text = (input?.value || '').trim();
  if (!text) return;
  if (text.length > 200) { showToast('200 caractères max'); return; }
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;

  try {
    await supaClient.from('comments').insert({
      activity_id: activityId,
      user_id: uid,
      text: text
    });
    // Notify post author
    const { data: activity } = await supaClient.from('activity_feed').select('user_id').eq('id', activityId).single();
    if (activity && activity.user_id !== uid) {
      await supaClient.from('notifications').insert({
        user_id: activity.user_id,
        type: 'comment',
        data: { username: db.social.username, text: text.substring(0, 50), activity_id: activityId }
      });
    }
    input.value = '';
    loadAndRenderComments(activityId);
  } catch (e) {
    console.error('postComment error:', e);
  }
}

async function deleteComment(commentId, activityId) {
  if (!supaClient) return;
  try {
    await supaClient.from('comments').delete().eq('id', commentId);
    var fv2Row = document.getElementById('comment-row-' + commentId);
    if (fv2Row) {
      fv2Row.remove();
      var section = document.getElementById('fv2-comments-' + activityId);
      var remaining = section ? section.querySelectorAll('.fv2-comment-row').length : 0;
      var btn = document.getElementById('fv2-comment-btn-' + activityId);
      if (btn) btn.innerHTML = '💬 ' + remaining;
    } else {
      loadAndRenderComments(activityId);
    }
  } catch(e) { console.error('deleteComment error:', e); }
}

function loadMoreFeed() {
  _feedPage++;
  renderFeed();
}

// ── Generic feed posting helper ──
async function postToFeed(type, data, options) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient || !db.social.onboardingCompleted) return;
  try {
    // Dedup: check if a post with same type and dedup key exists
    if (options && options.dedupKey) {
      const { data: existing } = await supaClient.from('activity_feed')
        .select('id')
        .eq('user_id', uid)
        .eq('type', type)
        .contains('data', options.dedupKey)
        .limit(1)
        .maybeSingle();
      if (existing) return; // Already posted
    }
    await supaClient.from('activity_feed').insert({
      user_id: uid,
      type: type,
      pinned: (options && options.pinned) || false,
      data: data
    });
  } catch (e) {
    console.error('postToFeed error:', e);
  }
}

// ── Auto-publish activity events ──
function getSessionPrimaryGroup(title) {
  var t = (title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/squat|quad|jambe/.test(t)) return 'quads';
  if (/bench|pec|poitrine|developpe couche/.test(t)) return 'pecs';
  if (/deadlift|souleve|fessier|ischios|rdl|romanian/.test(t)) return 'posterior';
  if (/epaule|militaire|overhead|shoulder/.test(t)) return 'shoulders';
  if (/dos|back|tirage|rowing|traction/.test(t)) return 'back';
  if (/bras|bicep|tricep|curl/.test(t)) return 'arms';
  return null;
}
var GROUP_COMPOUND_KW = {
  'quads':     ['squat', 'presse', 'hack squat', 'leg press', 'fente', 'lunge'],
  'pecs':      ['developpe', 'bench', 'dips', 'pompes'],
  'posterior': ['deadlift', 'souleve', 'rdl', 'romanian', 'hip thrust', 'leg curl'],
  'shoulders': ['militaire', 'overhead', 'press', 'developpe militaire'],
  'back':      ['tirage', 'rowing', 'tractions', 'pull', 'souleve'],
  'arms':      ['curl barre', 'curl haltere', 'dips', 'extension barre']
};
var _ALL_COMPOUND_KW = ['squat','deadlift','bench','souleve','press','row','pull',
  'chin','dip','lunge','fente','rdl','romanian','developpe','tirage','tractions',
  'militaire','overhead','hip thrust','presse'];
function _computeTopSet(logEntry) {
  var exos = logEntry.exercises || [];
  function _norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function _matchKws(name, kws) {
    var n = _norm(name);
    return kws && kws.some(function(kw) { return n.includes(kw); });
  }
  var sessionGroup = getSessionPrimaryGroup(logEntry.title || '');
  var groupKws = sessionGroup ? GROUP_COMPOUND_KW[sessionGroup] : null;
  var topSet = '';
  // Priority 1: compound matching session primary group
  if (groupKws) {
    var p1 = exos.find(function(e) { return !e.isCardio && e.maxRM > 0 && _matchKws(e.name, groupKws); });
    if (p1) topSet = p1.name + ' ' + Math.round(p1.maxRM) + 'kg';
  }
  // Priority 2: any compound
  if (!topSet) {
    var p2 = exos.find(function(e) { return !e.isCardio && e.maxRM > 0 && _matchKws(e.name, _ALL_COMPOUND_KW); });
    if (p2) topSet = p2.name + ' ' + Math.round(p2.maxRM) + 'kg';
  }
  // Priority 3: highest e1RM fallback
  if (!topSet) {
    var bestE1RM = 0;
    exos.forEach(function(e) {
      if (e.maxRM && e.maxRM > bestE1RM) { bestE1RM = e.maxRM; topSet = e.name + ' ' + Math.round(e.maxRM) + 'kg'; }
    });
  }
  return topSet;
}

async function publishSessionActivity(logEntry) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient || !db.social.onboardingCompleted) return;

  var topSet = _computeTopSet(logEntry);

  const sessionDate = logEntry.shortDate || logEntry.date || '';

  // Photos (URLs seulement, pas les dataUrl)
  var photoUrls = (logEntry.photos || []).filter(function(p) { return p.url; }).map(function(p) { return { url: p.url }; });

  await postToFeed('session', {
    session_id: logEntry.id,       // référence pour lookup
    owner_id: uid,                 // pour savoir chez qui fetcher (amis)
    title: logEntry.title || '',
    duration: logEntry.duration || 0,
    volume: logEntry.volume || 0,
    exercise_count: (logEntry.exercises || []).length,
    top_set: topSet,
    date: sessionDate,
    photos: photoUrls.length > 0 ? photoUrls : undefined
    // ❌ plus d'exercises[] ni allSets — lookup via session_id
  }, { dedupKey: { date: sessionDate } });
}

async function loadFeedSessionDetail(activityId, sessionId, userId) {
  const container = document.getElementById('feed-session-detail-' + activityId);
  if (!container) return;
  const myUid = await getMyUserIdAsync();

  container.innerHTML = '<div style="text-align:center;padding:8px;color:var(--sub);font-size:12px;">Chargement...</div>';

  try {
    let exercises = null;

    if (userId === myUid) {
      // C'est mon post → lire db.logs local
      const localSession = (db.logs || []).find(function(l) { return l.id === sessionId; });
      if (localSession) exercises = localSession.exercises;
    }

    if (!exercises && supaClient) {
      // Ami → fetch sbd_profiles de cet user
      const { data: profile } = await supaClient
        .from('sbd_profiles')
        .select('data')
        .eq('user_id', userId)
        .maybeSingle();

      if (profile && profile.data && profile.data.logs) {
        const remoteSession = profile.data.logs.find(function(l) { return l.id === sessionId; });
        if (remoteSession) exercises = remoteSession.exercises;
      }
    }

    if (!exercises || !exercises.length) {
      container.innerHTML = '<div style="text-align:center;padding:8px;color:var(--sub);font-size:12px;">Détail non disponible</div>';
      return;
    }

    var sessionIdStr = (sessionId || '').replace(/'/g, "\\'");
    var ownerIdStr = (userId || '').replace(/'/g, "\\'");
    container.innerHTML =
      '<button class="feed-load-session-btn" style="margin-bottom:8px;" onclick="closeFeedSessionDetail(\'' + activityId + '\',\'' + sessionIdStr + '\',\'' + ownerIdStr + '\')">' +
      '▴ Refermer la séance</button>' +
      renderFeedSessionDetail(exercises);
  } catch(e) {
    console.error('loadFeedSessionDetail error:', e);
    container.innerHTML = '<div style="text-align:center;padding:8px;color:var(--red);font-size:12px;">Erreur de chargement</div>';
  }
}

function closeFeedSessionDetail(activityId, sessionId, userId) {
  var container = document.getElementById('feed-session-detail-' + activityId);
  if (!container) return;
  container.innerHTML =
    '<button class="feed-load-session-btn" onclick="loadFeedSessionDetail(\'' + activityId + '\',\'' + sessionId + '\',\'' + userId + '\')">' +
    '📋 Voir les exercices</button>';
}

async function migrateActivityFeed() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) { showToast('Non connecté'); return; }

  showToast('🔄 Migration feed en cours...');

  try {
    // 1. Supprimer TOUS les posts session de cet user
    await supaClient.from('activity_feed')
      .delete()
      .eq('user_id', uid)
      .eq('type', 'session');

    // 2. Re-poster les 30 séances les plus récentes (format léger)
    const recentLogs = (db.logs || [])
      .slice()
      .sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); })
      .slice(0, 30);

    for (var i = 0; i < recentLogs.length; i++) {
      var log = recentLogs[i];
      var topSet = _computeTopSet(log);
      var sessionDate = log.shortDate || log.date || '';
      var photoUrls = (log.photos || []).filter(function(p) { return p.url; }).map(function(p) { return { url: p.url }; });

      await supaClient.from('activity_feed').insert({
        user_id: uid,
        type: 'session',
        pinned: false,
        created_at: new Date(log.timestamp || Date.now()).toISOString(),
        data: {
          session_id: log.id,
          owner_id: uid,
          title: log.title || '',
          duration: log.duration || 0,
          volume: log.volume || 0,
          exercise_count: (log.exercises || []).length,
          top_set: topSet,
          date: sessionDate,
          photos: photoUrls.length > 0 ? photoUrls : undefined
        }
      });
    }

    showToast('✅ Feed migré — 30 séances re-postées');
    _feedPage = 0;
    renderFeed();
  } catch(e) {
    console.error('migrateActivityFeed error:', e);
    showToast('Erreur migration ❌');
  }
}

async function publishPRActivity(exerciseName, newValue, oldValue) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient || !db.social.onboardingCompleted) return;
  try {
    await postToFeed('pr', {
      exercise: exerciseName,
      value: newValue,
      previous: oldValue || null,
      delta: oldValue ? Math.round(newValue - oldValue) : null,
      bodyweight: db.user.bw || null
    }, { pinned: true });
    // Check if any friend had this PR and notify them
    const friendIds = await getAcceptedFriendIds();
    if (friendIds.length) {
      const { data: snapshots } = await supaClient.from('leaderboard_snapshots')
        .select('user_id, value')
        .in('user_id', friendIds)
        .eq('exercise_name', exerciseName)
        .order('value', { ascending: false });
      if (snapshots) {
        for (const s of snapshots) {
          if (newValue > s.value) {
            await supaClient.from('notifications').insert({
              user_id: s.user_id,
              type: 'pr_beaten',
              data: { username: db.social.username, exercise: exerciseName, value: newValue }
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('publishPRActivity error:', e);
  }
}

async function publishGoalActivity(exerciseName, value, weeks) {
  await postToFeed('goal', { exercise: exerciseName, value: value, weeks: weeks });
}

// ============================================================
// SOCIAL MODULE — LEADERBOARD
// ============================================================
async function renderLeaderboard() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;

  const friendIds = await getAcceptedFriendIds();
  const allIds = [uid, ...friendIds];
  const filterSelect = document.getElementById('lbExerciseFilter');
  const podiumEl = document.getElementById('lbPodium');
  const tableEl = document.getElementById('lbTable');
  const emptyEl = document.getElementById('lbEmpty');
  // Guard: tab may have changed during the awaits above — avoid null .style/.innerHTML.
  if (!filterSelect || !podiumEl || !tableEl || !emptyEl) return;

  if (!friendIds.length) {
    podiumEl.innerHTML = '';
    tableEl.innerHTML = '';
    emptyEl.style.display = '';
    filterSelect.innerHTML = '<option value="">Aucun ami</option>';
    return;
  }
  emptyEl.style.display = 'none';

  try {
    const { data: snapshots } = await supaClient.from('leaderboard_snapshots')
      .select('user_id, exercise_name, value')
      .in('user_id', allIds)
      .order('value', { ascending: false });

    if (!snapshots || !snapshots.length) {
      podiumEl.innerHTML = '';
      tableEl.innerHTML = '<div class="lb-empty">Aucune donnée de classement</div>';
      filterSelect.innerHTML = '<option value="">Aucune donnée</option>';
      return;
    }

    // Collect all exercises + add "Total SBD" option
    const allExercises = new Set();
    snapshots.forEach(s => allExercises.add(s.exercise_name));
    const SBD_NAMES = ['Squat', 'Développé couché', 'Soulevé de terre'];
    const hasSBD = SBD_NAMES.some(n => allExercises.has(n));

    // Build sorted exercise list with priority order
    const priorityExercises = [];
    if (hasSBD) priorityExercises.push('Total SBD');
    SBD_NAMES.forEach(n => { if (allExercises.has(n)) priorityExercises.push(n); });
    const otherExercises = Array.from(allExercises).filter(n => !SBD_NAMES.includes(n)).sort();

    const currentFilter = filterSelect.value;
    filterSelect.innerHTML = priorityExercises.concat(otherExercises).map(ex =>
      '<option value="' + ex + '"' + (ex === currentFilter ? ' selected' : '') + '>' + ex + '</option>'
    ).join('');
    if (!currentFilter && filterSelect.options.length) filterSelect.value = filterSelect.options[0].value;

    const selectedExercise = filterSelect.value;
    if (!selectedExercise) return;

    // Calculate best values per user
    const bestByUser = {};
    if (selectedExercise === 'Total SBD') {
      // Sum best SBD for each user
      const userSBD = {};
      allIds.forEach(id => { userSBD[id] = { squat: 0, bench: 0, deadlift: 0 }; });
      snapshots.forEach(s => {
        if (!userSBD[s.user_id]) return;
        if (s.exercise_name === 'Squat') userSBD[s.user_id].squat = Math.max(userSBD[s.user_id].squat, s.value);
        else if (s.exercise_name === 'Développé couché') userSBD[s.user_id].bench = Math.max(userSBD[s.user_id].bench, s.value);
        else if (s.exercise_name === 'Soulevé de terre') userSBD[s.user_id].deadlift = Math.max(userSBD[s.user_id].deadlift, s.value);
      });
      Object.entries(userSBD).forEach(([userId, vals]) => {
        const total = vals.squat + vals.bench + vals.deadlift;
        if (total > 0) bestByUser[userId] = total;
      });
    } else {
      snapshots.filter(s => s.exercise_name === selectedExercise).forEach(s => {
        if (!bestByUser[s.user_id] || s.value > bestByUser[s.user_id]) bestByUser[s.user_id] = s.value;
      });
    }

    // Get profiles
    const profileIds = Object.keys(bestByUser);
    let profiles = {};
    if (profileIds.length) {
      const { data } = await supaClient.from('public_profiles').select('id, username').in('id', profileIds);
      (data || []).forEach(p => profiles[p.id] = p);
    }

    // Sort by value descending
    const ranking = Object.entries(bestByUser)
      .map(([userId, value]) => ({ userId, value, username: (profiles[userId] || { username: 'Utilisateur' }).username }))
      .sort((a, b) => b.value - a.value);

    // Render podium (top 3)
    const top3 = ranking.slice(0, 3);
    if (top3.length >= 1) {
      const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : [top3[0]];
      const medals = top3.length >= 3 ? ['🥈', '🥇', '🥉'] : top3.length === 2 ? ['🥈', '🥇'] : ['🥇'];
      podiumEl.innerHTML = podiumOrder.map((entry, i) =>
        '<div class="lb-podium-item' + (entry.userId === uid ? ' me' : '') + '">' +
          '<div class="lb-podium-rank">' + medals[i] + '</div>' +
          '<div class="lb-podium-avatar" onclick="showProfileOverlay(\'' + entry.userId + '\')">' + avatarInitial(entry.username) + '</div>' +
          '<div class="lb-podium-name">' + escapeHtml(entry.username) + '</div>' +
          '<div class="lb-podium-val">' + Math.round(entry.value) + 'kg</div>' +
        '</div>'
      ).join('');
    }

    // Render table (rest)
    const rest = ranking.slice(3);
    tableEl.innerHTML = rest.map((entry, i) =>
      '<div class="lb-row' + (entry.userId === uid ? ' me' : '') + '">' +
        '<div class="lb-rank">' + (i + 4) + '</div>' +
        '<div class="lb-row-avatar" onclick="showProfileOverlay(\'' + entry.userId + '\')">' + avatarInitial(entry.username) + '</div>' +
        '<div class="lb-row-name" onclick="showProfileOverlay(\'' + entry.userId + '\')">' + escapeHtml(entry.username) + '</div>' +
        '<div class="lb-row-val">' + Math.round(entry.value) + 'kg</div>' +
      '</div>'
    ).join('');

  } catch (e) {
    console.error('renderLeaderboard error:', e);
    podiumEl.innerHTML = '';
    tableEl.innerHTML = '<div class="lb-empty">Erreur de chargement</div>';
  }
}

// Alias for clarity — called after import
var updateLeaderboardAfterImport = updateLeaderboardSnapshot;

async function updateLeaderboardSnapshot() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient || !db.social.onboardingCompleted) return;
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekStr = monday.toISOString().split('T')[0];

  // Get key lifts and their best values (mode-aware)
  const keyLifts = db.keyLifts || [];
  const prData = [];
  const seenExercises = new Set();

  // SBD only if mode uses SBD cards
  if (modeFeature('showSBDCards')) {
    SBD_TYPES.forEach(type => {
      if (db.bestPR[type] > 0) {
        const name = type === 'bench' ? 'Développé couché' : type === 'squat' ? 'Squat' : 'Soulevé de terre';
        prData.push({ exercise_name: name, value: db.bestPR[type] });
        seenExercises.add(name);
      }
    });
  }

  // Always include user's key lifts
  keyLifts.forEach(kl => {
    if (seenExercises.has(kl.name)) return;
    let best = 0;
    db.logs.forEach(log => {
      log.exercises.forEach(e => {
        if (e.name === kl.name && e.maxRM > best) best = e.maxRM;
      });
    });
    if (best > 0) {
      prData.push({ exercise_name: kl.name, value: best });
      seenExercises.add(kl.name);
    }
  });

  for (const pr of prData) {
    try {
      await supaClient.from('leaderboard_snapshots').upsert({
        user_id: uid,
        exercise_name: pr.exercise_name,
        value: pr.value,
        snapshot_week: weekStr
      }, { onConflict: 'user_id,exercise_name,snapshot_week', ignoreDuplicates: false });
    } catch (e) {
      console.error('updateLeaderboardSnapshot error:', e);
    }
  }
}

// ============================================================
// SOCIAL MODULE — PROFILE CARD IN FRIENDS TAB
// ============================================================
function renderSocialProfileCard() {
  const container = document.getElementById('socialProfileContent');
  if (!container) return;

  const username = db.social.username || '';
  const bio = db.social.bio || '';
  const vis = db.social.visibility || {};
  const initial = avatarInitial(username);

  const visOptions = function(field) {
    const val = vis[field] || 'private';
    return '<select class="sob-visibility-select" onchange="updateProfileVisibility(\'' + field + '\', this.value)">' +
      '<option value="private"' + (val === 'private' ? ' selected' : '') + '>🔒 Privé</option>' +
      '<option value="friends"' + (val === 'friends' ? ' selected' : '') + '>👥 Amis</option>' +
      '<option value="public"' + (val === 'public' ? ' selected' : '') + '>🌍 Public</option>' +
    '</select>';
  };

  let html = '';
  // Avatar + pseudo + bio (lecture)
  html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">';
  html += '<div style="width:48px;height:48px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;">' + initial + '</div>';
  html += '<div><div style="font-weight:700;font-size:15px;color:var(--text);">' + escapeHtml(username || '—') + '</div>';
  html += '<div style="font-size:12px;color:var(--sub);margin-top:2px;">' + escapeHtml(bio || 'Aucune bio') + '</div></div>';
  html += '</div>';

  // Edit pseudo
  html += '<div style="margin-bottom:12px;">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">Pseudo</div>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<input type="text" id="socialEditUsername" value="' + (username || '').replace(/"/g, '&quot;') + '" placeholder="Ton pseudo" maxlength="20" style="margin-bottom:0;flex:1;">';
  html += '<button class="btn" style="width:auto;padding:8px 14px;font-size:16px;flex-shrink:0;" onclick="saveSocialUsername()">💾</button>';
  html += '</div></div>';

  // Edit bio
  html += '<div style="margin-bottom:14px;">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">Bio</div>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<textarea id="socialEditBio" placeholder="Powerlifter depuis 2020..." maxlength="200" rows="2" style="resize:none;margin-bottom:0;flex:1;">' + (bio || '').replace(/</g, '&lt;') + '</textarea>';
  html += '<button class="btn" style="width:auto;padding:8px 14px;font-size:16px;flex-shrink:0;align-self:flex-end;" onclick="saveSocialBio()">💾</button>';
  html += '</div></div>';

  // Visibility settings
  html += '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:8px;">Visibilité</div>';
  var fields = [
    { key: 'bio', label: 'Bio' },
    { key: 'prs', label: 'PRs / Exercices clés' },
    { key: 'programme', label: 'Programme' },
    { key: 'seances', label: 'Séances détaillées' },
    { key: 'stats', label: 'Stats' }
  ];
  fields.forEach(function(f) {
    html += '<div class="sob-visibility-row"><span class="sob-visibility-label">' + f.label + '</span>' + visOptions(f.key) + '</div>';
  });

  // Quitter la communauté — supprime le profil SOCIAL uniquement (pas le compte ni les séances).
  html += '<div style="border-top:1px solid var(--border);margin-top:16px;padding-top:12px;">';
  html += '<button onclick="showAccountDeletionDialog()" style="width:100%;padding:9px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--sub);font-size:12px;cursor:pointer;">Quitter la communauté</button>';
  html += '<div style="font-size:10px;color:var(--sub);text-align:center;margin-top:6px;">Ton profil, tes posts et tes commentaires disparaissent. Tes séances et ton compte sont conservés.</div>';
  html += '</div>';

  container.innerHTML = html;
}

async function saveSocialUsername() {
  const input = document.getElementById('socialEditUsername');
  const newName = (input.value || '').trim();
  if (!newName || newName.length < 2) { showToast('Pseudo trop court (min. 2 car.)'); return; }
  const ok = await updateUsername(newName);
  if (ok) renderSocialProfileCard();
}

async function saveSocialBio() {
  const textarea = document.getElementById('socialEditBio');
  await updateBio((textarea.value || '').trim());
  renderSocialProfileCard();
}

// ============================================================
// SOCIAL MODULE — RENDER FRIENDS TAB
// ============================================================
async function renderFriendsTab() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;

  // Parallelize independent fetches
  const [friendCode, friends] = await Promise.all([
    ensureFriendCode(),
    loadFriends()
  ]);
  const fcEl = document.getElementById('myFriendCode');
  if (fcEl) fcEl.textContent = friendCode || '---';

  // Get all user IDs from friendships
  const allUserIds = new Set();
  friends.forEach(f => { allUserIds.add(f.requester_id); allUserIds.add(f.target_id); });
  allUserIds.delete(uid);

  let profiles = {};
  if (allUserIds.size) {
    try {
      const { data } = await supaClient.from('public_profiles').select('id, username, training_status, training_since').in('id', Array.from(allUserIds));
      (data || []).forEach(p => profiles[p.id] = p);
    } catch {}
  }

  // Pending requests (where I'm the target)
  const pending = friends.filter(f => f.status === 'pending' && f.target_id === uid);
  const pendingSection = document.getElementById('pendingRequestsSection');
  const pendingList = document.getElementById('pendingRequestsList');
  // Guard: tab may have changed during the awaits above. No await follows before
  // the friends/blocked/badge elements are read, so one check covers them all.
  if (!pendingSection || !pendingList) return;
  if (pending.length) {
    pendingSection.style.display = '';
    pendingList.innerHTML = pending.map(f => {
      const p = profiles[f.requester_id] || { username: 'Utilisateur' };
      return '<div class="friends-item">' +
        '<div class="friends-item-avatar" onclick="showProfileOverlay(\'' + f.requester_id + '\')">' + avatarInitial(p.username) + '</div>' +
        '<div class="friends-item-info"><div class="friends-item-name" onclick="showProfileOverlay(\'' + f.requester_id + '\')">' + escapeHtml(p.username) + '</div><div class="friends-item-status">Demande reçue</div></div>' +
        '<div class="friends-item-actions">' +
          '<button class="friends-item-btn accept" onclick="acceptFriendRequest(\'' + f.id + '\')">Accepter</button>' +
          '<button class="friends-item-btn decline" onclick="declineFriendRequest(\'' + f.id + '\')">Refuser</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } else {
    pendingSection.style.display = 'none';
  }

  // Accepted friends
  const accepted = friends.filter(f => f.status === 'accepted');
  const friendsList = document.getElementById('friendsList');
  const friendsListTitle = document.getElementById('friendsListTitle');
  if (friendsListTitle) friendsListTitle.textContent = 'Mes amis (' + accepted.length + ')';
  if (accepted.length) {
    friendsList.innerHTML = accepted.map(f => {
      const friendId = f.requester_id === uid ? f.target_id : f.requester_id;
      const p = profiles[friendId] || { username: 'Utilisateur' };
      const daysSince = f.created_at ? Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86400000) : 0;
      const sinceText = daysSince <= 0 ? 'Ami depuis aujourd\'hui' : 'Ami depuis ' + daysSince + 'j';
      const isTraining = p.training_status && p.training_since;
      let statusHtml = '';
      if (isTraining) {
        const minsSince = Math.floor((Date.now() - new Date(p.training_since).getTime()) / 60000);
        statusHtml = '<div style="color:var(--green);font-size:11px;font-weight:600;">🟢 S\'entraîne — ' + escapeHtml(p.training_status) + ' · depuis ' + minsSince + 'min</div>';
      } else {
        statusHtml = '<div class="friends-item-status" style="color:var(--sub);font-size:11px;">' + sinceText + '</div>';
      }
      return '<div class="friends-item">' +
        '<div class="friends-item-avatar" onclick="showProfileOverlay(\'' + friendId + '\')" style="position:relative;">' + avatarInitial(p.username) +
        (isTraining ? '<span style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:var(--green);border:2px solid var(--card);animation:pulse 2s infinite;"></span>' : '') +
        '</div>' +
        '<div class="friends-item-info"><div class="friends-item-name" onclick="showProfileOverlay(\'' + friendId + '\')">' + escapeHtml(p.username) + '</div>' +
        statusHtml + '</div>' +
        '<div class="friends-item-actions">' +
          '<button class="friends-item-btn remove" onclick="removeFriend(\'' + f.id + '\')">Retirer</button>' +
          '<button class="friends-item-btn block" onclick="blockUser(\'' + friendId + '\')">Bloquer</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } else {
    friendsList.innerHTML = '<div style="text-align:center;padding:16px;color:var(--sub);font-size:13px;">Aucun ami pour le moment</div>';
  }

  // Blocked users (where I'm the blocker)
  const blocked = friends.filter(f => f.status === 'blocked' && f.requester_id === uid);
  const blockedSection = document.getElementById('blockedSection');
  const blockedList = document.getElementById('blockedList');
  if (blocked.length) {
    blockedSection.style.display = '';
    blockedList.innerHTML = blocked.map(f => {
      const p = profiles[f.target_id] || { username: 'Utilisateur' };
      return '<div class="friends-item">' +
        '<div class="friends-item-avatar">' + avatarInitial(p.username) + '</div>' +
        '<div class="friends-item-info"><div class="friends-item-name">' + escapeHtml(p.username) + '</div><div class="friends-item-status">Bloqué</div></div>' +
        '<div class="friends-item-actions">' +
          '<button class="friends-item-btn unblock" onclick="unblockUser(\'' + f.id + '\')">Débloquer</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } else {
    blockedSection.style.display = 'none';
  }

  // Update friend badge
  const badgeEl = document.getElementById('socialFriendsBadge');
  if (pending.length) {
    badgeEl.textContent = pending.length;
    badgeEl.style.display = '';
  } else {
    badgeEl.style.display = 'none';
  }

  // Render profile card
  renderSocialProfileCard();
}

// ============================================================
// SOCIAL MODULE — NOTIFICATIONS
// ============================================================
async function loadNotifications() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return [];
  try {
    const { data, error } = await supaClient.from('notifications')
      .select('id, type, data, read, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    _notifCache = data || [];
    return _notifCache;
  } catch (e) {
    console.error('loadNotifications error:', e);
    return [];
  }
}

async function renderNotifications() {
  const notifs = await loadNotifications();
  const container = document.getElementById('notifList');
  if (!container) return;

  if (!notifs.length) {
    container.innerHTML = '<div class="notif-empty">Aucune notification</div>';
    return;
  }

  const icons = {
    friend_accepted: { icon: '🤝', css: 'friend' },
    reaction: { icon: '😀', css: 'reaction' },
    comment: { icon: '💬', css: 'comment' },
    pr_beaten: { icon: '💥', css: 'pr_beaten' }
  };

  container.innerHTML = notifs.map(n => {
    const ic = icons[n.type] || { icon: '🔔', css: '' };
    const d = n.data || {};
    let text = '';
    if (n.type === 'friend_accepted') text = '<strong>' + escapeHtml(d.username || 'Utilisateur') + '</strong> a accepté ta demande d\'ami';
    else if (n.type === 'reaction') text = '<strong>' + escapeHtml(d.username || 'Utilisateur') + '</strong> a réagi ' + escapeHtml(d.emoji || '') + ' à ton post';
    else if (n.type === 'comment') text = '<strong>' + escapeHtml(d.username || 'Utilisateur') + '</strong> a commenté : "' + escapeHtml(d.text || '') + '"';
    else if (n.type === 'pr_beaten') text = '<strong>' + escapeHtml(d.username || 'Utilisateur') + '</strong> a battu ton PR ' + escapeHtml(d.exercise || '') + ' avec ' + (d.value || 0) + 'kg !';

    return '<div class="notif-item' + (!n.read ? ' unread' : '') + '">' +
      '<div class="notif-icon ' + ic.css + '">' + ic.icon + '</div>' +
      '<div class="notif-body">' + text + '<div class="notif-time">' + timeAgo(n.created_at) + '</div></div>' +
    '</div>';
  }).join('');
}

async function markAllNotifsRead() {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  try {
    await supaClient.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
    _notifCache.forEach(function(n) { n.read = true; });
    updateNotifBadges(0);
    renderNotifications();
  } catch (e) {
    console.error('markAllNotifsRead error:', e);
  }
}

function updateSocialBadge() {
  updateNotifBadges(_unreadNotifCount);
}

// ============================================================
// SOCIAL MODULE — NOTIFICATION BELL
// ============================================================

async function initNotifications() {
  if (_notifRealtimeChannel) {
    updateNotifBadges(_unreadNotifCount);
    return;
  }
  if (!supaClient) return;
  const uid = await getMyUserIdAsync();
  if (!uid) return;
  const notifs = await loadNotifications();
  const unread = notifs.filter(function(n) { return !n.read; }).length;
  updateNotifBadges(unread);
  _notifRealtimeChannel = supaClient
    .channel('notif-' + uid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid }, function(payload) {
      _notifCache.unshift(payload.new);
      _unreadNotifCount++;
      updateNotifBadges(_unreadNotifCount);
      if (_notifPanelOpen) prependNotifItem(payload.new);
    })
    .subscribe();
}

function updateNotifBadges(count) {
  _unreadNotifCount = count;
  var label = count > 9 ? '9+' : String(count);
  var display = count > 0 ? 'flex' : 'none';
  var bellBadge = document.getElementById('notif-bell-badge');
  if (bellBadge) { bellBadge.style.display = display; bellBadge.textContent = label; }
  var tabBadge = document.getElementById('socialTabBadge');
  if (tabBadge) {
    if (count > 0) { tabBadge.textContent = label; tabBadge.classList.add('visible'); }
    else { tabBadge.classList.remove('visible'); }
  }
}

var _notifPanelCloseListener = null;

async function toggleNotifPanel() {
  var panel = document.getElementById('notif-panel-global');
  if (!panel) return;
  _notifPanelOpen = !_notifPanelOpen;
  panel.style.display = _notifPanelOpen ? 'block' : 'none';
  if (_notifPanelOpen) {
    try {
      await loadNotifList();
      if (_unreadNotifCount > 0) markAllNotifsRead();
    } catch(e) {
      console.error('toggleNotifPanel error:', e);
    }
    if (_notifPanelCloseListener) document.removeEventListener('click', _notifPanelCloseListener);
    _notifPanelCloseListener = function(e) {
      var p = document.getElementById('notif-panel-global');
      var btn = document.querySelector('.global-notif-btn');
      if (p && btn && !p.contains(e.target) && !btn.contains(e.target)) {
        p.style.display = 'none';
        _notifPanelOpen = false;
        document.removeEventListener('click', _notifPanelCloseListener);
        _notifPanelCloseListener = null;
      }
    };
    setTimeout(function() {
      if (_notifPanelOpen && _notifPanelCloseListener) {
        document.addEventListener('click', _notifPanelCloseListener);
      }
    }, 0);
  } else {
    if (_notifPanelCloseListener) {
      document.removeEventListener('click', _notifPanelCloseListener);
      _notifPanelCloseListener = null;
    }
  }
}

async function loadNotifList() {
  var container = document.getElementById('notif-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--sub);font-size:13px;">Chargement...</div>';
  var notifs = await loadNotifications();
  if (!notifs.length) {
    container.innerHTML = '<div class="notif-empty">Aucune notification</div>';
    return;
  }
  container.innerHTML = notifs.map(renderNotifItem).join('');
}

function renderNotifItem(n) {
  var d = {};
  try { d = typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {}); } catch(e) {}
  var icon = { friend_accepted: '🤝', reaction: d.emoji || '😀', comment: '💬', pr_beaten: '💥', defi: '🏆' }[n.type] || '🔔';
  var u = '<strong>' + escapeHtml(d.username || 'Quelqu\'un') + '</strong>';
  var text = 'Nouvelle notification';
  if (n.type === 'friend_accepted') text = u + ' a accepté ta demande d\'ami';
  else if (n.type === 'reaction') text = u + ' a réagi ' + escapeHtml(d.emoji || '') + ' à ton post';
  else if (n.type === 'comment') text = u + ' a commenté : « ' + escapeHtml(d.text || '') + ' »';
  else if (n.type === 'pr_beaten') text = u + ' a battu ton PR ' + escapeHtml(d.exercise || '') + ' avec ' + (d.value || 0) + 'kg !';
  else if (n.type === 'defi') text = u + ' t\'a lancé un défi : ' + escapeHtml(d.exercise || '');
  var dot = n.read ? '' : '<span style="width:7px;height:7px;border-radius:50%;background:var(--blue);display:inline-block;flex-shrink:0;margin-top:6px;"></span>';
  var safeData = encodeURIComponent(JSON.stringify(d));
  return '<div class="notif-item' + (n.read ? '' : ' unread') + '" style="cursor:pointer;" onclick="handleNotifTap(\'' + n.id + '\',\'' + n.type + '\',\'' + safeData + '\')">' +
    '<span style="font-size:18px;flex-shrink:0;">' + escapeHtml(icon) + '</span>' +
    '<div class="notif-body">' + text + '<div class="notif-time">' + timeAgo(n.created_at) + '</div></div>' +
    dot + '</div>';
}

function prependNotifItem(n) {
  var container = document.getElementById('notif-list');
  if (!container) return;
  var empty = container.querySelector('.notif-empty');
  if (empty) container.innerHTML = '';
  var div = document.createElement('div');
  div.innerHTML = renderNotifItem(n);
  container.insertBefore(div.firstElementChild, container.firstChild);
}

function handleNotifTap(notifId, type, dataStr) {
  var d = {};
  try { d = JSON.parse(decodeURIComponent(dataStr)); } catch(e) {}
  if (type === 'comment' || type === 'reaction') { toggleNotifPanel(); showFeedSub('feed-amis'); }
  else if (type === 'friend_accepted') { toggleNotifPanel(); showFeedSub('social-friends'); }
  else if (type === 'defi') { toggleNotifPanel(); showFeedSub('feed-challenges'); }
  else { toggleNotifPanel(); }
}

// ============================================================
// SOCIAL MODULE — DIAGNOSTIC
// ============================================================
async function diagnoseSocial() {
  const results = [];
  const ok = (msg) => results.push({ ok: true, msg });
  const fail = (msg) => results.push({ ok: false, msg });

  // 1. Auth check
  try {
    if (!supaClient) { fail('Client Supabase non initialisé'); }
    else {
      const { data } = await supaClient.auth.getUser();
      if (data?.user) {
        const u = data.user;
        ok('Connecté : ' + (u.email || 'anonyme') + ' (id: ' + u.id.substring(0, 8) + '…)');
      } else { fail('Aucun utilisateur connecté'); }
    }
  } catch (e) { fail('Auth — ' + e.message); }

  // 2. Profiles table & critical columns
  try {
    const uid = await getMyUserIdAsync();
    if (!uid) { fail('Impossible de récupérer ton identifiant'); }
    else {
      const { data, error } = await supaClient.from('profiles')
        .select('id, username, friend_code, bio, visibility_bio, onboarding_completed')
        .eq('id', uid).maybeSingle();
      if (error) {
        fail('Table profiles inaccessible — ' + error.message);
        if (error.message && error.message.includes('column')) {
          fail('Une colonne est probablement manquante dans la table profiles. Vérifie que friend_code, bio et visibility_bio existent.');
        }
      } else if (!data) {
        fail('Aucun profil trouvé pour ton compte (table profiles vide ou RLS bloque)');
      } else {
        ok('Colonnes profiles OK (id, username, friend_code, bio, visibility_bio)');
        if (data.username) { ok('Username en base : ' + data.username); }
        else { fail('Username absent en base — le profil est incomplet'); }
        if (data.friend_code) { ok('Code ami en base : ' + data.friend_code); }
        else { fail('friend_code absent ou vide en base'); }
        if (data.onboarding_completed) { ok('Onboarding complété en base'); }
        else { fail('Onboarding non complété en base — le profil peut être partiel'); }
      }
    }
  } catch (e) { fail('Profiles — ' + e.message); }

  // 3. Friendships table accessible
  try {
    const uid = await getMyUserIdAsync();
    const { data, error } = await supaClient.from('friendships')
      .select('id, requester_id, target_id, status')
      .or('requester_id.eq.' + uid + ',target_id.eq.' + uid)
      .limit(50);
    if (error) { fail('Table friendships inaccessible — ' + error.message); }
    else {
      const pending = (data || []).filter(f => f.status === 'pending');
      const accepted = (data || []).filter(f => f.status === 'accepted');
      ok('Friendships accessibles : ' + (data || []).length + ' total (' + pending.length + ' en attente, ' + accepted.length + ' acceptées)');

      // 3b. Pending requests where I am the TARGET (incoming)
      const incoming = pending.filter(f => f.target_id === uid);
      const outgoing = pending.filter(f => f.requester_id === uid);
      if (incoming.length) { ok(incoming.length + ' demande(s) reçue(s) en attente (tu devrais les voir dans l\'onglet Amis)'); }
      else { ok('Aucune demande reçue en attente'); }
      if (outgoing.length) { ok(outgoing.length + ' demande(s) envoyée(s) en attente'); }
    }
  } catch (e) { fail('Friendships — ' + e.message); }

  // 4. Check that a friend can see the pending request (cross-user visibility)
  try {
    const uid = await getMyUserIdAsync();
    const { data, error } = await supaClient.from('friendships')
      .select('id')
      .eq('status', 'pending')
      .limit(1);
    if (error) { fail('Lecture des demandes pending échouée (RLS SELECT ?) — ' + error.message); }
    else { ok('Lecture RLS des friendships OK'); }
  } catch (e) { fail('RLS friendships — ' + e.message); }

  // 5. Local state check
  if (db.friendCode) { ok('Code ami local (db.friendCode) : ' + db.friendCode); }
  else { fail('Pas de code ami en local (db.friendCode absent)'); }

  if (db.social && db.social.onboardingCompleted) { ok('Onboarding social complété'); }
  else { fail('Onboarding social non complété — le module social peut être bloqué'); }

  // Build readable output
  console.group('🔧 Diagnostic Social');
  results.forEach(r => console[r.ok ? 'log' : 'warn']((r.ok ? '✅' : '❌') + ' ' + r.msg));
  console.groupEnd();

  // Show modal in app
  const modalHtml =
    '<div class="modal-overlay" id="diagSocialOverlay" onclick="if(event.target===this)this.remove()" style="z-index:99999;">' +
      '<div class="modal-box" style="max-width:400px;text-align:left;max-height:80vh;overflow-y:auto;">' +
        '<div style="font-size:22px;text-align:center;margin-bottom:8px;">🔧</div>' +
        '<p style="font-size:16px;font-weight:700;margin:0 0 12px;text-align:center;">Diagnostic Social</p>' +
        results.map(r =>
          '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;font-size:13px;line-height:1.4;">' +
            '<span style="flex-shrink:0;">' + (r.ok ? '✅' : '❌') + '</span>' +
            '<span style="color:' + (r.ok ? 'var(--green)' : 'var(--red)') + ';">' + r.msg + '</span>' +
          '</div>'
        ).join('') +
        '<button class="btn" style="margin-top:16px;" onclick="document.getElementById(\'diagSocialOverlay\').remove()">Fermer</button>' +
      '</div>' +
    '</div>';
  const existing = document.getElementById('diagSocialOverlay');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  return results;
}

// ============================================================
// SOCIAL MODULE — PROFILE OVERLAY
// ============================================================
function _detectPhaseFromTitle(title) {
  if (!title) return null;
  var t = String(title).toLowerCase();
  if (/deload|🔄/.test(t)) return 'deload';
  if (/peak|🎯/.test(t)) return 'peak';
  if (/hypertroph/.test(t)) return 'hypertrophie';
  if (/intensification/.test(t)) return 'intensification';
  if (/accumulation/.test(t)) return 'accumulation';
  if (/force/.test(t)) return 'force';
  if (/intro/.test(t)) return 'intro';
  return null;
}

async function showProfileOverlay(userId) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  const overlay = document.getElementById('profileOverlay');

  overlay.style.display = '';
  overlay.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sub);">Chargement...</div>';

  try {
    const { data: profile, error: profileErr } = await supaClient.from('public_profiles')
      .select('id, username, bio, tier, training_status, training_since, visibility_bio, visibility_prs, visibility_programme, visibility_seances, visibility_stats')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) {
      console.error('showProfileOverlay query error:', profileErr);
      overlay.innerHTML = '<button class="profile-back" onclick="closeProfileOverlay()">← Retour</button><div style="text-align:center;padding:40px;color:var(--red);">Erreur de chargement du profil</div>';
      return;
    }
    if (!profile) {
      overlay.innerHTML = '<button class="profile-back" onclick="closeProfileOverlay()">← Retour</button><div style="text-align:center;padding:40px;color:var(--sub);">Ce profil n\'est pas encore configuré.<br><span style="font-size:12px;">L\'utilisateur n\'a pas encore complété son inscription sociale.</span></div>';
      return;
    }

    const isMe = userId === uid;
    // Check friendship
    let friendship = null;
    if (!isMe) {
      const { data } = await supaClient.from('friendships')
        .select('id, status, requester_id, target_id')
        .or(
          'and(requester_id.eq.' + uid + ',target_id.eq.' + userId + '),' +
          'and(requester_id.eq.' + userId + ',target_id.eq.' + uid + ')'
        )
        .maybeSingle();
      friendship = data;
    }
    const isFriend = friendship?.status === 'accepted';
    const isPending = friendship?.status === 'pending';

    // Determine visibility
    const canSeeBio = isMe || profile.visibility_bio === 'public' || (profile.visibility_bio === 'friends' && isFriend);
    const canSeePrs = isMe || profile.visibility_prs === 'public' || (profile.visibility_prs === 'friends' && isFriend);
    const canSeeProgramme = isMe || profile.visibility_programme === 'public' || (profile.visibility_programme === 'friends' && isFriend);
    const canSeeSeances = isMe || profile.visibility_seances === 'public' || (profile.visibility_seances === 'friends' && isFriend);
    const canSeeStats = isMe || profile.visibility_stats === 'public' || (profile.visibility_stats === 'friends' && isFriend);

    let html = '<button class="profile-back" onclick="closeProfileOverlay()">← Retour</button>';
    html += '<div class="profile-header">';
    html += '<div class="profile-big-avatar">' + avatarInitial(profile.username) + '</div>';
    html += '<div class="profile-username">' + escapeHtml(profile.username) + (typeof renderTierBadge === 'function' && profile.tier ? ' ' + renderTierBadge(profile.tier) : '') + '</div>';

    // Live training indicator (training_status est rempli pendant une séance en cours)
    if (canSeeStats && profile.training_status && profile.training_since) {
      const minsSince = Math.max(0, Math.round((Date.now() - new Date(profile.training_since).getTime()) / 60000));
      html += '<div style="margin-top:6px;font-size:12px;color:var(--green);font-weight:600;">🟢 ' + escapeHtml(profile.training_status) + ' · depuis ' + minsSince + 'min</div>';
    }

    if (canSeeBio && profile.bio) html += '<div class="profile-bio">' + escapeHtml(profile.bio) + '</div>';
    else if (!canSeeBio) html += '<div class="profile-bio" style="font-style:italic;color:var(--sub);">Bio privée</div>';
    html += '</div>';

    // Phase actuelle (dérivée du dernier titre de séance)
    if (canSeeStats) {
      try {
        const { data: lastSession } = await supaClient.from('activity_feed')
          .select('data, created_at')
          .eq('user_id', userId)
          .eq('type', 'session')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const phase = lastSession && lastSession.data ? _detectPhaseFromTitle(lastSession.data.title) : null;
        if (phase) {
          const phaseColors = {
            hypertrophie: '#0A84FF', force: '#FF9F0A', peak: '#FF453A', deload: '#32D74B',
            accumulation: '#5AC8FA', intensification: '#FF9500', intro: '#BF5AF2'
          };
          const c = phaseColors[phase] || '#86868B';
          const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);
          html += '<div style="display:flex;justify-content:center;margin-bottom:14px;"><span style="background:' + c + '22;border:1px solid ' + c + ';color:' + c + ';padding:5px 14px;border-radius:14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">📅 Phase : ' + phaseLabel + '</span></div>';
        }
      } catch(e) { /* ignore phase detection errors */ }
    }

    // Action buttons
    if (!isMe) {
      html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
      if (isFriend) {
        html += '<button class="btn" style="background:var(--surface);border:1px solid var(--border);color:var(--red);font-size:13px;" onclick="removeFriend(\'' + friendship.id + '\');closeProfileOverlay();">Retirer</button>';
      } else if (isPending) {
        if (friendship.target_id === uid) {
          html += '<button class="btn" style="background:var(--green);color:#000;font-size:13px;" onclick="acceptFriendRequest(\'' + friendship.id + '\')">Accepter</button>';
        } else {
          html += '<button class="btn" style="background:var(--surface);border:1px solid var(--border);color:var(--sub);font-size:13px;" disabled>Demande envoyée</button>';
        }
      } else if (!friendship || friendship.status !== 'blocked') {
        html += '<button class="btn" style="font-size:13px;" onclick="sendFriendRequest(\'' + userId + '\')">Ajouter en ami</button>';
      }
      html += '<button class="btn" style="background:rgba(255,69,58,0.1);border:1px solid rgba(255,69,58,0.3);color:var(--red);font-size:13px;width:auto;padding:10px 16px;" onclick="blockUser(\'' + userId + '\')">Bloquer</button>';
      html += '</div>';
      // Compare + Défi (only for accepted friends)
      if (isFriend) {
        const usernameEsc = (profile.username || '').replace(/'/g, "\\'");
        html += '<div style="display:flex;gap:8px;margin-bottom:16px;">' +
          '<button class="btn" style="background:linear-gradient(135deg,rgba(255,149,0,0.15),rgba(255,59,48,0.15));border:1px solid rgba(255,149,0,0.3);color:var(--orange,#ff9500);font-size:13px;font-weight:700;" onclick="showComparisonView(\'' + userId + '\')">⚔️ Comparer</button>' +
          '<button class="btn" style="background:linear-gradient(135deg,rgba(0,132,255,0.15),rgba(100,210,255,0.15));border:1px solid rgba(0,132,255,0.3);color:var(--blue);font-size:13px;font-weight:700;" onclick="openDefiModal(null,\'' + usernameEsc + '\')">🏆 Défi</button>' +
        '</div>';
      }
    }

    // PRs section avec tendance e1RM (slope sur 4 semaines)
    html += '<div class="profile-section"><div class="card"><div class="profile-section-title">PRs / Exercices clés</div>';
    if (canSeePrs) {
      const { data: snapshots } = await supaClient.from('leaderboard_snapshots')
        .select('exercise_name, value, snapshot_week')
        .eq('user_id', userId)
        .order('snapshot_week', { ascending: false });
      if (snapshots && snapshots.length) {
        const grouped = {};
        snapshots.forEach(s => {
          if (!grouped[s.exercise_name]) grouped[s.exercise_name] = [];
          grouped[s.exercise_name].push(s);
        });
        html += Object.entries(grouped).map(([name, snaps]) => {
          const latest = snaps[0];
          const latestTs = new Date(latest.snapshot_week).getTime();
          const fourWksAgoTs = latestTs - 28 * 86400000;
          const baseline = snaps.find(s => new Date(s.snapshot_week).getTime() <= fourWksAgoTs);
          let trendIcon = '→';
          let trendColor = 'var(--sub)';
          let trendTitle = 'Stable';
          if (baseline) {
            const delta = latest.value - baseline.value;
            if (delta >= 1.25) { trendIcon = '↑'; trendColor = 'var(--green)'; trendTitle = '+' + delta.toFixed(1) + 'kg en 4 sem.'; }
            else if (delta <= -1.25) { trendIcon = '↓'; trendColor = 'var(--red)'; trendTitle = delta.toFixed(1) + 'kg en 4 sem.'; }
          }
          return '<div class="stat-row"><span style="font-size:13px;">' + escapeHtml(name) + '</span>' +
            '<span><span style="color:' + trendColor + ';margin-right:6px;font-weight:700;" title="' + trendTitle + '">' + trendIcon + '</span>' +
            '<span style="font-weight:700;color:var(--blue);">' + Math.round(latest.value) + 'kg</span></span></div>';
        }).join('');
      } else {
        html += '<div style="color:var(--sub);font-size:13px;text-align:center;padding:12px;">Aucun PR enregistré</div>';
      }
    } else {
      html += '<div class="profile-private">🔒 Section privée</div>';
    }
    html += '</div></div>';

    // Stats section avec streak
    html += '<div class="profile-section"><div class="card"><div class="profile-section-title">Stats</div>';
    if (canSeeStats) {
      const { data: activities } = await supaClient.from('activity_feed')
        .select('created_at')
        .eq('user_id', userId)
        .eq('type', 'session')
        .order('created_at', { ascending: false })
        .limit(200);
      const totalSessions = activities ? activities.length : 0;
      html += '<div class="stat-row"><span>Séances</span><span style="font-weight:700;">' + totalSessions + '</span></div>';

      // Streak : semaines consécutives avec ≥1 session
      let streak = 0;
      if (activities && activities.length && typeof getISOWeekKey === 'function') {
        const weekSet = new Set();
        activities.forEach(a => {
          const k = getISOWeekKey(new Date(a.created_at).getTime());
          if (k) weekSet.add(k);
        });
        let cursorTs = Date.now();
        // Allow one-week grace if this week hasn't seen a session yet
        const currentWk = getISOWeekKey(cursorTs);
        if (!weekSet.has(currentWk)) cursorTs -= 7 * 86400000;
        while (true) {
          const wk = getISOWeekKey(cursorTs);
          if (!wk || !weekSet.has(wk)) break;
          streak++;
          cursorTs -= 7 * 86400000;
        }
      }
      if (streak > 0) {
        html += '<div class="stat-row"><span>Streak</span><span style="font-weight:700;color:var(--orange);">🔥 ' + streak + ' semaine' + (streak > 1 ? 's' : '') + '</span></div>';
      }
    } else {
      html += '<div class="profile-private">🔒 Section privée</div>';
    }
    html += '</div></div>';

    overlay.innerHTML = html;
  } catch (e) {
    console.error('showProfileOverlay error:', e);
    overlay.innerHTML = '<button class="profile-back" onclick="closeProfileOverlay()">← Retour</button><div style="text-align:center;padding:40px;color:var(--red);">Erreur de chargement</div>';
  }
}

function closeProfileOverlay() {
  document.getElementById('profileOverlay').style.display = 'none';
}

// ============================================================
// SOCIAL MODULE — COMPARISON VIEW (⚔️)
// ============================================================
async function showComparisonView(friendId) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  const overlay = document.getElementById('profileOverlay');
  overlay.style.display = '';
  overlay.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sub);">Chargement comparaison...</div>';

  try {
    // Load friend profile
    const { data: friendProfile } = await supaClient.from('public_profiles')
      .select('id, username, visibility_prs, visibility_stats')
      .eq('id', friendId)
      .maybeSingle();
    if (!friendProfile) { overlay.innerHTML = '<button class="profile-back" onclick="closeProfileOverlay()">← Retour</button><div style="text-align:center;padding:40px;color:var(--sub);">Profil introuvable</div>'; return; }

    const canSeePrs = friendProfile.visibility_prs === 'public' || friendProfile.visibility_prs === 'friends';
    const canSeeStats = friendProfile.visibility_stats === 'public' || friendProfile.visibility_stats === 'friends';

    // Load friend's leaderboard snapshots
    let friendPRs = {};
    if (canSeePrs) {
      const { data: snapshots } = await supaClient.from('leaderboard_snapshots')
        .select('exercise_name, value')
        .eq('user_id', friendId)
        .order('value', { ascending: false });
      if (snapshots) {
        snapshots.forEach(s => {
          if (!friendPRs[s.exercise_name] || s.value > friendPRs[s.exercise_name]) friendPRs[s.exercise_name] = s.value;
        });
      }
    }

    // Load friend's session stats
    let friendSessionsPerWeek = 0;
    let friendAvgVolume = 0;
    if (canSeeStats) {
      const { data: activities } = await supaClient.from('activity_feed')
        .select('data, created_at')
        .eq('user_id', friendId)
        .eq('type', 'session')
        .order('created_at', { ascending: false })
        .limit(30);
      if (activities && activities.length) {
        const weeks = Math.max(1, (Date.now() - new Date(activities[activities.length - 1].created_at).getTime()) / (7 * 86400000));
        friendSessionsPerWeek = Math.round((activities.length / weeks) * 10) / 10;
        const totalVol = activities.reduce((s, a) => s + ((a.data && a.data.volume) || 0), 0);
        friendAvgVolume = activities.length ? Math.round(totalVol / activities.length) : 0;
      }
    }

    // My data
    const myUsername = db.social.username || 'Moi';
    const myPRs = {};
    // SBD
    if (db.bestPR.squat > 0) myPRs['Squat'] = db.bestPR.squat;
    if (db.bestPR.bench > 0) myPRs['Développé couché'] = db.bestPR.bench;
    if (db.bestPR.deadlift > 0) myPRs['Soulevé de terre'] = db.bestPR.deadlift;
    // Key lifts
    (db.keyLifts || []).forEach(kl => {
      if (myPRs[kl.name]) return;
      let best = 0;
      db.logs.forEach(log => { log.exercises.forEach(e => { if (e.name === kl.name && e.maxRM > best) best = e.maxRM; }); });
      if (best > 0) myPRs[kl.name] = best;
    });

    // My session stats (last 30 sessions)
    const recentLogs = db.logs.slice(0, 30);
    let mySessionsPerWeek = 0;
    let myAvgVolume = 0;
    if (recentLogs.length) {
      const weeks = Math.max(1, (Date.now() - recentLogs[recentLogs.length - 1].timestamp) / (7 * 86400000));
      mySessionsPerWeek = Math.round((recentLogs.length / weeks) * 10) / 10;
      myAvgVolume = Math.round(recentLogs.reduce((s, l) => s + (l.volume || 0), 0) / recentLogs.length);
    }

    // Total SBD
    const myTotal = (myPRs['Squat'] || 0) + (myPRs['Développé couché'] || 0) + (myPRs['Soulevé de terre'] || 0);
    const friendTotal = (friendPRs['Squat'] || 0) + (friendPRs['Développé couché'] || 0) + (friendPRs['Soulevé de terre'] || 0);

    // Build comparison HTML
    let html = '<button class="profile-back" onclick="showProfileOverlay(\'' + friendId + '\')">← Retour au profil</button>';
    html += '<div style="text-align:center;padding:16px 0 12px;"><div style="font-size:20px;font-weight:800;">⚔️ Comparaison</div>';
    html += '<div style="display:flex;justify-content:center;align-items:center;gap:20px;margin-top:12px;">';
    html += '<div style="text-align:center;"><div style="width:44px;height:44px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;margin:0 auto;">' + avatarInitial(myUsername) + '</div><div style="font-size:12px;font-weight:700;margin-top:4px;">' + escapeHtml(myUsername) + '</div></div>';
    html += '<div style="font-size:18px;font-weight:800;color:var(--sub);">VS</div>';
    html += '<div style="text-align:center;"><div style="width:44px;height:44px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;margin:0 auto;">' + avatarInitial(friendProfile.username) + '</div><div style="font-size:12px;font-weight:700;margin-top:4px;">' + escapeHtml(friendProfile.username) + '</div></div>';
    html += '</div></div>';

    function compRow(label, myVal, friendVal, unit) {
      const myNum = typeof myVal === 'number' ? myVal : 0;
      const fNum = typeof friendVal === 'number' ? friendVal : 0;
      const maxVal = Math.max(myNum, fNum, 1);
      const myPct = (myNum / maxVal) * 100;
      const fPct = (fNum / maxVal) * 100;
      const myColor = myNum > fNum ? 'var(--green)' : myNum === fNum ? 'var(--blue)' : 'var(--sub)';
      const fColor = fNum > myNum ? 'var(--green)' : fNum === myNum ? 'var(--blue)' : 'var(--sub)';
      const myDisplay = myVal === '🔒' ? '🔒' : Math.round(myNum) + (unit || '');
      const fDisplay = friendVal === '🔒' ? '🔒' : Math.round(fNum) + (unit || '');

      return '<div style="margin-bottom:12px;">' +
        '<div style="text-align:center;font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">' + label + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<div style="width:60px;text-align:right;font-size:13px;font-weight:700;color:' + myColor + ';">' + myDisplay + '</div>' +
          '<div style="flex:1;display:flex;gap:2px;align-items:center;">' +
            '<div style="flex:1;height:8px;border-radius:4px;background:var(--border);overflow:hidden;direction:rtl;"><div style="height:100%;border-radius:4px;background:' + myColor + ';width:' + myPct + '%;"></div></div>' +
            '<div style="flex:1;height:8px;border-radius:4px;background:var(--border);overflow:hidden;"><div style="height:100%;border-radius:4px;background:' + fColor + ';width:' + fPct + '%;"></div></div>' +
          '</div>' +
          '<div style="width:60px;text-align:left;font-size:13px;font-weight:700;color:' + fColor + ';">' + fDisplay + '</div>' +
        '</div></div>';
    }

    html += '<div class="card" style="margin-top:12px;">';

    // SBD exercises
    const sbdExos = ['Squat', 'Développé couché', 'Soulevé de terre'];
    sbdExos.forEach(exo => {
      const myVal = myPRs[exo] || 0;
      const fVal = canSeePrs ? (friendPRs[exo] || 0) : '🔒';
      html += compRow(exo, myVal, fVal, 'kg');
    });

    // Total SBD
    html += compRow('Total SBD', myTotal, canSeePrs ? friendTotal : '🔒', 'kg');

    // Session stats
    html += '<div style="border-top:1px solid var(--border);margin:8px 0;"></div>';
    html += compRow('Séances / semaine', mySessionsPerWeek, canSeeStats ? friendSessionsPerWeek : '🔒', '');
    html += compRow('Tonnage moyen / séance', myAvgVolume, canSeeStats ? friendAvgVolume : '🔒', 'kg');

    html += '</div>';

    overlay.innerHTML = html;
  } catch (e) {
    console.error('showComparisonView error:', e);
    overlay.innerHTML = '<button class="profile-back" onclick="closeProfileOverlay()">← Retour</button><div style="text-align:center;padding:40px;color:var(--red);">Erreur de chargement</div>';
  }
}

// ============================================================
// SOCIAL MODULE — SOCIAL ONBOARDING (3 screens)
// ============================================================
// Passe à true juste après une suppression pour ne pas re-suggérer, à la
// recréation immédiate, une identité issue des données qu'on vient d'effacer.
// One-shot : consommé (remis à false) à chaque affichage de l'onboarding.
var _skipOnboardingPrefill = false;
function showSocialOnboarding() {
  document.getElementById('social-onboarding-overlay').style.display = '';
  // Pre-fill with user name if available — sauf juste après une suppression.
  const nameInput = document.getElementById('sob-username');
  if (!_skipOnboardingPrefill && db.user.name && !nameInput.value) {
    nameInput.value = db.user.name.toLowerCase().replace(/\s+/g, '_');
  }
  _skipOnboardingPrefill = false;
}

function sobUpdateProgress(step) {
  const dots = document.querySelectorAll('#sob-progress .sob-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i < step));
}

async function sobNext(currentStep) {
  if (currentStep === 1) {
    // Validate username
    const username = (document.getElementById('sob-username').value || '').trim().toLowerCase();
    if (!username || username.length < 3) {
      showToast('Pseudo trop court (3 car. min)');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showToast('Lettres, chiffres et _ uniquement');
      return;
    }
    // Check availability
    if (supaClient) {
      const { data: existing } = await supaClient.from('public_profiles').select('id').eq('username', username).maybeSingle();
      if (existing) { showToast('Pseudo déjà pris'); return; }
      const { data: reserved } = await supaClient.from('reserved_usernames').select('username').eq('username', username).maybeSingle();
      if (reserved) { showToast('Pseudo réservé temporairement'); return; }
    }

    db.social.username = username;
    db.social.bio = (document.getElementById('sob-bio').value || '').trim();

    document.getElementById('sob-step-1').classList.remove('active');
    document.getElementById('sob-step-2').classList.add('active');
    sobUpdateProgress(2);
  } else if (currentStep === 2) {
    // Save visibility settings
    db.social.visibility.bio = document.getElementById('sob-vis-bio').value;
    db.social.visibility.prs = document.getElementById('sob-vis-prs').value;
    db.social.visibility.programme = document.getElementById('sob-vis-programme').value;
    db.social.visibility.seances = document.getElementById('sob-vis-seances').value;
    db.social.visibility.stats = document.getElementById('sob-vis-stats').value;

    document.getElementById('sob-step-2').classList.remove('active');
    document.getElementById('sob-step-3').classList.add('active');
    sobUpdateProgress(3);

    // Generate invite code
    await ensureProfile();
    const code = await createNewInviteCode();
    document.getElementById('sob-invite-code').textContent = code || '---';
  }
}

function copySobInviteCode() {
  const code = document.getElementById('sob-invite-code').textContent;
  if (!code || code === '---') return;
  navigator.clipboard.writeText(code).then(() => showToast('Code copié !')).catch(() => showToast('Erreur copie'));
}

async function sobFinish() {
  db.social.onboardingCompleted = true;
  saveDBNow();

  // Ensure profile is created in Supabase
  await ensureProfile();

  // Update leaderboard
  await updateLeaderboardSnapshot();

  document.getElementById('social-onboarding-overlay').style.display = 'none';
  showToast('Bienvenue dans la communauté !');
  initSocialTab();
}

// ============================================================
// SOCIAL MODULE — ACCOUNT DELETION
// ============================================================
function showAccountDeletionDialog() {
  let selectedOption = null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal-box" style="max-width:340px;text-align:left;">' +
      '<p style="font-size:16px;font-weight:700;margin:0 0 6px;text-align:center;">Quitter la communauté</p>' +
      '<p style="font-size:12px;color:var(--sub);margin:0 0 16px;text-align:center;">Cette action est irréversible.</p>' +
      '<div class="deletion-option" id="del-erase" onclick="selectDeletionOption(\'erase\')">' +
        '<div class="deletion-option-title">Effacement total</div>' +
        '<div class="deletion-option-desc">Posts, commentaires, réactions, profil — tout disparaît.</div>' +
      '</div>' +
      '<div class="deletion-option" id="del-anon" onclick="selectDeletionOption(\'anon\')">' +
        '<div class="deletion-option-title">Anonymisation</div>' +
        '<div class="deletion-option-desc">Le profil disparaît mais les commentaires restent sous "Utilisateur supprimé".</div>' +
      '</div>' +
      '<div class="modal-actions" style="margin-top:16px;">' +
        '<button class="modal-cancel" style="background:var(--sub);color:#000;">Annuler</button>' +
        '<button class="modal-confirm" id="del-confirm" style="background:var(--red);color:white;" disabled>Supprimer</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
  overlay.querySelector('.modal-confirm').onclick = async () => {
    overlay.remove();
    await executeAccountDeletion(selectedOption);
  };

  window.selectDeletionOption = function(opt) {
    selectedOption = opt;
    document.querySelectorAll('.deletion-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('del-' + opt).classList.add('selected');
    document.getElementById('del-confirm').disabled = false;
  };
}

// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.emoji-picker-popup') && !e.target.closest('.feed-action-btn')) {
    document.querySelectorAll('.emoji-picker-popup.open').forEach(p => p.classList.remove('open'));
  }
  if (!e.target.closest('.friends-search')) {
    document.getElementById('friendAutocomplete')?.classList.remove('open');
  }
});

async function executeAccountDeletion(mode) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;

  try {
    if (mode === 'erase') {
      // Delete everything
      await supaClient.from('reactions').delete().eq('user_id', uid);
      await supaClient.from('comments').delete().eq('user_id', uid);
      await supaClient.from('notifications').delete().eq('user_id', uid);
      await supaClient.from('activity_feed').delete().eq('user_id', uid);
      await supaClient.from('invite_codes').delete().eq('user_id', uid);
      await supaClient.from('leaderboard_snapshots').delete().eq('user_id', uid);
      await supaClient.from('friendships').delete().or('requester_id.eq.' + uid + ',target_id.eq.' + uid);
      await supaClient.from('profiles').delete().eq('id', uid);
    } else {
      // Anonymize: mark profile as deleted, keep comments
      await supaClient.from('profiles').update({
        deleted_at: new Date().toISOString(),
        anonymized: true,
        username: 'deleted_' + uid.substring(0, 8),
        bio: ''
      }).eq('id', uid);
      // Remove personal data
      await supaClient.from('activity_feed').delete().eq('user_id', uid);
      await supaClient.from('reactions').delete().eq('user_id', uid);
      await supaClient.from('friendships').delete().or('requester_id.eq.' + uid + ',target_id.eq.' + uid);
      await supaClient.from('invite_codes').delete().eq('user_id', uid);
      await supaClient.from('leaderboard_snapshots').delete().eq('user_id', uid);
      await supaClient.from('notifications').delete().eq('user_id', uid);
    }

    // Reset local social data
    db.social = {
      profileId: null,
      username: '',
      bio: '',
      visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' },
      onboardingCompleted: false,
      usernameChangedAt: null
    };
    saveDBNow();
    // Ne PAS rappeler initSocialTab() ici : comme onboardingCompleted vient de
    // passer à false, il ré-ouvrirait showSocialOnboarding() et re-proposerait un
    // formulaire de recréation dans la foulée de la suppression. On affiche un état
    // neutre ; rejoindre reste possible mais devient un geste explicite de l'user.
    _skipOnboardingPrefill = true;
    showToast('Tu as quitté la communauté');
    var _amis = document.getElementById('feedAmisContent');
    if (_amis) {
      _amis.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">👋</div><div class="feed-empty-title">Tu as quitté la communauté</div><div class="feed-empty-sub">Ton profil social, tes posts et tes commentaires ont été supprimés. Tes séances et ton compte sont conservés.</div><button onclick="showSocialOnboarding()" style="margin-top:14px;background:var(--blue);color:white;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;">Rejoindre à nouveau</button></div>';
    }
  } catch (e) {
    console.error('executeAccountDeletion error:', e);
    showToast('Erreur lors de la suppression');
  }
}

// ============================================================
// SOCIAL CHALLENGES (DÉFIS ENTRE AMIS)
// ============================================================
const CHALLENGE_TYPES = {
  volume:    { label: 'Volume', icon: '📊', desc: 'Tonnage total sur la période', unit: 'kg' },
  reps:      { label: 'Reps', icon: '💪', desc: 'Nombre total de reps', unit: 'reps' },
  weight:    { label: 'Charge max', icon: '🏋️', desc: 'Meilleur e1RM', unit: 'kg' },
  frequency: { label: 'Nb séances', icon: '🔥', desc: 'Nombre de séances', unit: 'séances' },
  custom:    { label: 'Perso', icon: '📝', desc: 'Objectif personnalisé', unit: '' }
};

const CHALLENGE_TEMPLATES = [
  { icon: '💪', label: '100 pompes en 7j', type: 'reps', target: 100, duration: 7, exercise: 'Pompes' },
  { icon: '🏋️', label: 'Max Bench cette semaine', type: 'weight', target: null, duration: 7, exercise: 'Développé couché' },
  { icon: '📊', label: 'Plus gros tonnage de la semaine', type: 'volume', target: null, duration: 7, exercise: null },
  { icon: '🔥', label: '5 séances cette semaine', type: 'frequency', target: 5, duration: 7, exercise: null },
  { icon: '🦵', label: 'PR Squat ce mois', type: 'weight', target: null, duration: 30, exercise: 'Squat' }
];

// ============================================================
// SCORING AUTOMATIQUE DES DÉFIS (Lot B)
// Chaque appareil calcule SON propre score depuis db.logs (local, privé) sur la
// fenêtre ABSOLUE [start_date, end_date] et n'écrit que current_value de SA ligne.
// ============================================================

// Normalisation %PDC (type 'weight' uniquement). Pure.
function _normalizeWeightScore(e1rm, bw) {
  var w = (bw && bw > 0) ? bw : (typeof BW_FALLBACK_KG !== 'undefined' ? BW_FALLBACK_KG : 80);
  return (e1rm > 0) ? (e1rm / w) : 0;
}

// Normalise un nom d'exercice pour le matching non-SBD : lowercase, retrait du
// suffixe matériel entre parenthèses (ex. « (Barre) »), collapse des espaces, trim.
// Pure. « Tirage vers Visage (Poulie) » → « tirage vers visage ».
function _normalizeExoName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cœur pur : score depuis une liste de logs + poids de corps, fenêtre ABSOLUE.
// frequency → nb de séances ; volume → tonnage brut (kg) ; weight → meilleur e1RM
// (calcE1RM, recalculé sur les séries de travail de la fenêtre) normalisé %PDC.
function _computeChallengeScoreFromLogs(challenge, logs, bw) {
  if (!challenge) return 0;
  var startTs = challenge.start_date ? new Date(challenge.start_date).getTime() : 0;
  var endTs = challenge.end_date ? new Date(challenge.end_date).getTime() : Infinity;
  var inWindow = (logs || []).filter(function(l) {
    var t = l && l.timestamp;
    return typeof t === 'number' && t >= startTs && t <= endTs;
  });
  if (challenge.type === 'frequency') return inWindow.length;
  if (challenge.type === 'volume') {
    return inWindow.reduce(function(s, l) { return s + (parseFloat(l.volume) || 0); }, 0);
  }
  if (challenge.type === 'weight') {
    var target = challenge.target_exercise || '';
    var targetType = (typeof getSBDType === 'function') ? getSBDType(target) : null;
    var targetNorm = _normalizeExoName(target);
    var best = 0;
    inWindow.forEach(function(l) {
      (l.exercises || []).forEach(function(exo) {
        var name = exo.name || '';
        var match = targetType
          // Défi SBD : matcher par TYPE (getSBDType absorbe casse + suffixe matériel,
          // ex. « Développé couché » et « Développé Couché (Barre) » → bench).
          ? ((typeof getSBDType === 'function') && getSBDType(name) === targetType)
          // Non-SBD : match par NOM NORMALISÉ (et non strict) pour absorber le
          // suffixe matériel et la casse.
          : (!!targetNorm && _normalizeExoName(name) === targetNorm);
        if (!match) return;
        (exo.allSets || exo.series || []).forEach(function(set) {
          if (set.setType === 'warmup' || set.isWarmup) return;
          var w = set.weight || 0, r = set.reps || 0;
          if (w > 0 && r > 0 && typeof calcE1RM === 'function') {
            var e = calcE1RM(w, r);
            if (e > best) best = e;
          }
        });
      });
    });
    return _normalizeWeightScore(best, bw);
  }
  return 0;
}

// Wrapper : MON score depuis db.logs + getUserBW().
function computeMyChallengeScore(challenge, uid) {
  var logs = (typeof db !== 'undefined' && db && db.logs) ? db.logs : [];
  var bw = (typeof getUserBW === 'function') ? getUserBW()
    : (typeof BW_FALLBACK_KG !== 'undefined' ? BW_FALLBACK_KG : 80);
  return _computeChallengeScoreFromLogs(challenge, logs, bw);
}

// Formatage d'affichage par type. Pure. weight → ratio %PDC à 2 décimales
// (ex. 1.78 → « 1.78× PDC », plus de Math.round qui afficherait « 2 »).
function formatChallengeValue(value, type) {
  var v = value || 0;
  if (type === 'weight') return v.toFixed(2) + '× PDC';
  if (type === 'volume') return Math.round(v) + ' kg';
  return String(Math.round(v));
}

// Recalcule MON score pour mes défis ACTIFS et n'écrit current_value que s'il a
// changé (anti-spam réseau). Réutilise les données déjà chargées par le render
// (aucun fetch en plus) et met à jour myPart en mémoire pour un rendu immédiat.
async function refreshMyChallengeScores(uid, challenges, participants) {
  if (!supaClient || !cloudSyncEnabled || !uid) return;
  var now = Date.now();
  for (var i = 0; i < (challenges || []).length; i++) {
    var c = challenges[i];
    if (!c || !c.end_date || new Date(c.end_date).getTime() <= now) continue; // actifs seulement
    var myPart = (participants || []).find(function(p) { return p.challenge_id === c.id && p.user_id === uid; });
    if (!myPart) continue; // je ne participe pas → je n'écris pas
    var score = computeMyChallengeScore(c, uid);
    var rounded = Math.round(score * 1000) / 1000;
    if (Math.abs((myPart.current_value || 0) - rounded) < 1e-6) continue; // inchangé → pas d'écriture
    try {
      var up = await supaClient.from('challenge_participants').update({ current_value: rounded })
        .eq('challenge_id', c.id).eq('user_id', uid);
      if (!up.error) myPart.current_value = rounded;
    } catch (e) { console.error('refreshMyChallengeScores error:', e); }
  }
}

async function renderChallengesTab() {
  const templatesEl = document.getElementById('challengeTemplates');
  const activeEl = document.getElementById('challengesActiveList');
  const finishedEl = document.getElementById('challengesFinishedList');
  if (!templatesEl || !activeEl || !finishedEl) return;

  if (!supaClient || !cloudSyncEnabled) {
    activeEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--sub);font-size:13px;">☁️ Connexion cloud requise pour les défis sociaux</div>';
    templatesEl.innerHTML = '';
    finishedEl.innerHTML = '';
    return;
  }

  // Render quick templates
  templatesEl.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:8px;">Défis rapides</div>' +
    '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px;">' +
    CHALLENGE_TEMPLATES.map((t, i) =>
      '<button onclick="createChallengeFromTemplate(' + i + ')" style="flex-shrink:0;padding:8px 14px;border-radius:20px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">' +
      t.icon + ' ' + t.label + '</button>'
    ).join('') + '</div>';

  const uid = await getMyUserIdAsync();
  if (!uid) return;

  try {
    // Load challenges where user is participant or creator
    const { data: participations } = await supaClient.from('challenge_participants')
      .select('challenge_id')
      .eq('user_id', uid);
    const myChIds = (participations || []).map(p => p.challenge_id);

    // Also load challenges created by friends (that user can join)
    const friendIds = await getAcceptedFriendIds();
    const allCreatorIds = [uid, ...friendIds];

    let allChallenges = [];
    if (myChIds.length) {
      const { data } = await supaClient.from('social_challenges')
        .select('*')
        .in('id', myChIds)
        .order('created_at', { ascending: false });
      if (data) allChallenges = data;
    }
    // Also get friend-created challenges not yet joined
    if (friendIds.length) {
      const { data } = await supaClient.from('social_challenges')
        .select('*')
        .in('creator_id', friendIds)
        .order('created_at', { ascending: false });
      if (data) {
        data.forEach(c => {
          if (!allChallenges.find(x => x.id === c.id)) allChallenges.push(c);
        });
      }
    }
    // Also get own created challenges
    const { data: ownChallenges } = await supaClient.from('social_challenges')
      .select('*')
      .eq('creator_id', uid)
      .order('created_at', { ascending: false });
    if (ownChallenges) {
      ownChallenges.forEach(c => {
        if (!allChallenges.find(x => x.id === c.id)) allChallenges.push(c);
      });
    }

    const now = new Date();
    const active = allChallenges.filter(c => new Date(c.end_date) > now);
    const finished = allChallenges.filter(c => new Date(c.end_date) <= now).slice(0, 10);

    // Load all participants for these challenges
    const allChIds = allChallenges.map(c => c.id);
    let allParticipants = [];
    if (allChIds.length) {
      const { data } = await supaClient.from('challenge_participants')
        .select('*')
        .in('challenge_id', allChIds);
      allParticipants = data || [];
    }

    // Lot B — recalcul auto de MON score avant rendu (anti-spam : écrit si changé)
    await refreshMyChallengeScores(uid, active, allParticipants);

    // Load profiles for all involved users
    const involvedIds = new Set();
    allChallenges.forEach(c => involvedIds.add(c.creator_id));
    allParticipants.forEach(p => involvedIds.add(p.user_id));
    let profiles = {};
    if (involvedIds.size) {
      const { data } = await supaClient.from('public_profiles').select('id, username').in('id', Array.from(involvedIds));
      (data || []).forEach(p => profiles[p.id] = p);
    }

    // Render active
    if (active.length) {
      activeEl.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:8px;">En cours</div>' +
        active.map(c => renderChallengeCard(c, allParticipants.filter(p => p.challenge_id === c.id), profiles, uid)).join('');
    } else {
      activeEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--sub);font-size:12px;">Aucun défi en cours.<br>Crée un défi ou utilise un template rapide !</div>';
    }

    // Render finished
    if (finished.length) {
      finishedEl.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin:16px 0 8px;">Terminés</div>' +
        finished.map(c => renderChallengeCard(c, allParticipants.filter(p => p.challenge_id === c.id), profiles, uid)).join('');
    } else {
      finishedEl.innerHTML = '';
    }
  } catch (e) {
    console.error('renderChallengesTab error:', e);
    activeEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);font-size:12px;">Erreur de chargement des défis</div>';
  }
}

function renderChallengeCard(challenge, participants, profiles, uid) {
  const t = CHALLENGE_TYPES[challenge.type] || CHALLENGE_TYPES.custom;
  const isFinished = new Date(challenge.end_date) <= new Date();
  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.end_date) - Date.now()) / 86400000));
  const creator = profiles[challenge.creator_id] || { username: '?' };
  const isParticipant = participants.some(p => p.user_id === uid);

  // Sort participants by value desc
  const sorted = [...participants].sort((a, b) => (b.current_value || 0) - (a.current_value || 0));

  let html = '<div class="card" style="margin-bottom:12px;border:1px solid ' + (isFinished ? 'var(--border)' : 'rgba(10,132,255,0.3)') + ';">';
  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<div style="font-weight:700;font-size:14px;">' + t.icon + ' ' + escapeHtml(challenge.title || t.label) + '</div>';
  html += '<span style="font-size:10px;padding:3px 8px;border-radius:10px;background:' + (isFinished ? 'rgba(255,255,255,0.05)' : 'rgba(10,132,255,0.1)') + ';color:' + (isFinished ? 'var(--sub)' : 'var(--blue)') + ';">' + (isFinished ? 'Terminé' : daysLeft + 'j restants') + '</span>';
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--sub);margin-bottom:10px;">par ' + escapeHtml(creator.username) + (challenge.target_exercise ? ' · ' + escapeHtml(challenge.target_exercise) : '') + '</div>';
  if (challenge.description) html += '<div style="font-size:12px;color:var(--sub);margin-bottom:8px;">' + escapeHtml(challenge.description) + '</div>';

  // Participants + progress
  if (sorted.length) {
    sorted.forEach((p, i) => {
      const prof = profiles[p.user_id] || { username: '?' };
      const val = p.current_value || 0;
      const pct = challenge.target_value ? Math.min(100, (val / challenge.target_value) * 100) : 0;
      const isMe = p.user_id === uid;
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;' + (isMe ? 'background:rgba(10,132,255,0.05);padding:4px 6px;border-radius:8px;' : '') + '">';
      html += '<span style="font-size:11px;font-weight:700;width:18px;color:' + (i === 0 && !isFinished ? 'var(--green)' : 'var(--sub)') + ';">' + (i + 1) + '.</span>';
      html += '<span style="font-size:12px;font-weight:' + (isMe ? '700' : '500') + ';flex:1;">' + escapeHtml(prof.username) + '</span>';
      html += '<span style="font-size:12px;font-weight:700;color:var(--blue);">' + formatChallengeValue(val, challenge.type) + '</span>';
      if (challenge.target_value) {
        html += '<div style="width:60px;height:4px;background:var(--border);border-radius:2px;"><div style="height:4px;background:var(--blue);border-radius:2px;width:' + pct + '%;"></div></div>';
      }
      html += '</div>';
    });
  } else {
    html += '<div style="font-size:12px;color:var(--sub);text-align:center;padding:8px;">Aucun participant</div>';
  }

  // Actions — Lot B : scoring auto, plus de bouton manuel. Seul « Rejoindre » subsiste.
  if (!isFinished && !isParticipant) {
    html += '<div style="display:flex;gap:8px;margin-top:10px;">';
    html += '<button class="btn" style="font-size:12px;padding:8px 16px;" onclick="joinChallenge(\'' + challenge.id + '\',this)">Rejoindre</button>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

async function createChallenge(templateData) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) { showToast('Connexion requise'); return; }

  let title, type, exercise, target, duration;
  if (templateData) {
    title = templateData.label;
    type = templateData.type;
    exercise = templateData.exercise || null;
    target = templateData.target || null;
    duration = templateData.duration || 7;
  } else {
    title = (document.getElementById('chalTitle').value || '').trim();
    type = document.getElementById('chalType').value;
    exercise = (document.getElementById('chalExercise').value || '').trim() || null;
    target = parseFloat(document.getElementById('chalTarget').value) || null;
    duration = parseInt(document.getElementById('chalDuration').value) || 7;
    if (!title) { showToast('Donne un titre au défi'); return; }
  }

  const end = new Date();
  end.setDate(end.getDate() + duration);

  try {
    const { data, error } = await supaClient.from('social_challenges').insert({
      creator_id: uid,
      title: title,
      type: type,
      target_value: target,
      target_exercise: exercise,
      start_date: new Date().toISOString(), // Lot A — ancre la fenêtre de scoring (Lot B)
      end_date: end.toISOString()
    }).select('id').single();

    if (error) throw error;

    // Auto-join as participant
    await supaClient.from('challenge_participants').insert({
      challenge_id: data.id,
      user_id: uid,
      current_value: 0
    });

    const sheet = document.getElementById('challengeModalSheet');
    if (sheet) sheet.remove();

    showToast('🔥 Défi créé !');
    renderChallengesTab();
  } catch (e) {
    console.error('createChallenge error:', e);
    showToast('Erreur lors de la création du défi');
  }
}

async function createChallengeFromTemplate(index) {
  const t = CHALLENGE_TEMPLATES[index];
  if (!t) return;
  await createChallenge({ label: t.label, type: t.type, exercise: t.exercise, target: t.target, duration: t.duration });
}

async function joinChallenge(challengeId, btnEl) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) { showToast('Connecte-toi pour rejoindre'); return; }
  try {
    // Check if already joined
    var existing = await supaClient.from('challenge_participants').select('id').eq('challenge_id', challengeId).eq('user_id', uid).maybeSingle();
    if (existing.data) {
      // Leave
      await supaClient.from('challenge_participants').delete().eq('id', existing.data.id);
      if (btnEl) { btnEl.textContent = 'Rejoindre'; btnEl.classList.remove('joined'); }
      showToast('Challenge quitté');
    } else {
      // Join
      var ins = await supaClient.from('challenge_participants').insert({ challenge_id: challengeId, user_id: uid, current_value: 0 });
      if (ins.error) { console.error('Join error:', ins.error); showToast('Erreur ❌'); return; }
      if (btnEl) { btnEl.textContent = 'Rejoint ✓'; btnEl.classList.add('joined'); }
      showToast('Challenge rejoint 🏆');
    }
    // Refresh challenges in both V1 and V2
    if (typeof renderChallengesTab === 'function') renderChallengesTab();
    if (typeof renderFeedChallengesV2 === 'function') renderFeedChallengesV2();
  } catch (e) {
    console.error('joinChallenge error:', e);
    showToast('Erreur');
  }
}

// Lot B — scoring MANUEL retiré (showUpdateChallengeProgress / updateSocialChallengeProgress).
// Le score est désormais calculé automatiquement (computeMyChallengeScore + refreshMyChallengeScores).

// ============================================================
// SUPABASE PAUSE DETECTION & SAFE WRAPPER
// ============================================================
var _supabasePaused = false;

async function checkSupabaseHealth() {
  if (!supaClient) return false;
  try {
    var { data, error } = await supaClient.from('sbd_profiles').select('user_id').limit(1).maybeSingle();
    if (error) {
      if (error.message && (
        error.message.indexOf('project is paused') >= 0 ||
        error.message.indexOf('ECONNREFUSED') >= 0 ||
        error.message.indexOf('fetch failed') >= 0 ||
        error.code === 'PGRST301'
      )) {
        if (!_supabasePaused) {
          _supabasePaused = true;
          showToast('Cloud indisponible — mode hors-ligne');
          console.warn('Supabase paused, switching to offline mode');
        }
        return false;
      }
    }
    if (_supabasePaused) {
      _supabasePaused = false;
      showToast('Cloud reconnecté');
      try { syncToCloud(true); } catch(e) {}
    }
    return true;
  } catch(e) {
    _supabasePaused = true;
    return false;
  }
}

async function safeSupabaseCall(fn) {
  if (_supabasePaused) return null;
  try {
    return await fn();
  } catch(e) {
    if (e.message && (e.message.indexOf('fetch') >= 0 || e.message.indexOf('network') >= 0)) {
      _supabasePaused = true;
      showToast('Connexion cloud perdue — données sauvegardées localement');
    }
    return null;
  }
}

// Periodically check if Supabase comes back online
setInterval(function() {
  if (_supabasePaused) checkSupabaseHealth();
}, 5 * 60 * 1000);

// Keep-alive: update last_active to prevent project pause
// SYNC-LOT1 (P3) : heartbeat anti-pause sur une table DÉDIÉE. Avant, ce ping
// faisait UPDATE sbd_profiles SET updated_at=now() SANS données → le pull voyait
// "cloud plus récent" et armait le merge (qui écrasait l'édition locale). On
// cible désormais public.heartbeats : sbd_profiles.updated_at ne bouge plus que
// sur un vrai push de données. userIdArg réutilise l'uid du boot (évite un 2e
// auth.getUser() → verrou gotrue « lock stolen »).
async function keepAlive(userIdArg) {
  if (!supaClient || !cloudSyncEnabled) return;
  await safeSupabaseCall(async function() {
    var uid = userIdArg;
    if (!uid) {
      var { data: { user } } = await supaClient.auth.getUser();
      if (!user) return;
      uid = user.id;
    }
    await supaClient.from('heartbeats')
      .upsert({ user_id: uid, last_seen: new Date().toISOString() }, { onConflict: 'user_id' });
  });
}

// ============================================================
// OLD LOG COMPRESSION
// ============================================================
function compressOldLogs() {
  var sixMonthsAgo = Date.now() - 180 * 86400000;
  var modified = false;

  (db.logs || []).forEach(function(log) {
    if (log.timestamp > sixMonthsAgo) return;
    if (log._compressed) return;

    (log.exercises || []).forEach(function(exo) {
      if (!exo.allSets || exo.allSets.length <= 1) return;

      var bestSet = { weight: 0, reps: 0 };
      var totalVol = 0;
      var setCount = 0;

      exo.allSets.forEach(function(s) {
        if (s.setType === 'warmup') return;
        setCount++;
        totalVol += (s.weight || 0) * (s.reps || 0);
        if ((s.weight || 0) > bestSet.weight ||
            ((s.weight || 0) === bestSet.weight && (s.reps || 0) > bestSet.reps)) {
          bestSet = { weight: s.weight || 0, reps: s.reps || 0 };
        }
      });

      exo._originalSetCount = exo.allSets.length;
      exo.allSets = [bestSet];
      exo.sets = setCount;
      exo._compressedVolume = totalVol;
    });

    log._compressed = true;
    modified = true;
  });

  if (modified) {
    saveDBNow();
    // old logs compressed (6+ months)
  }
}

// ============================================================
// STORAGE GAUGE (Réglages)
// ============================================================
function renderStorageGauge() {
  var el = document.getElementById('storageGauge');
  if (!el) return;

  var localSize = 0;
  try {
    for (var key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        localSize += (localStorage[key].length || 0) * 2;
      }
    }
  } catch(e) {}
  var localMB = (localSize / 1024 / 1024).toFixed(2);

  var logCount = (db.logs || []).length;
  var supaEstMB = (logCount * 0.002).toFixed(2);
  var supaPercent = Math.round((supaEstMB / 500) * 100);

  var barColor = supaPercent > 80 ? 'var(--red)' : supaPercent > 50 ? 'var(--orange)' : 'var(--green)';
  var h = '<div style="margin-top:12px;padding:12px;background:var(--surface);border-radius:12px;border:1px solid var(--border);">';
  h += '<div style="font-size:12px;font-weight:700;margin-bottom:8px;">Stockage</div>';
  h += '<div style="font-size:11px;color:var(--sub);">Local : ' + localMB + ' MB</div>';
  if (cloudSyncEnabled) {
    h += '<div style="font-size:11px;color:var(--sub);margin-top:2px;">Cloud : ~' + supaEstMB + ' MB / 500 MB (' + supaPercent + '%)</div>';
    h += '<div style="background:var(--surface);border-radius:4px;height:6px;margin-top:6px;overflow:hidden;border:1px solid var(--border);">';
    h += '<div style="background:' + barColor + ';height:100%;width:' + Math.min(100, supaPercent) + '%;border-radius:4px;"></div>';
    h += '</div>';
    if (supaPercent > 70) {
      h += '<div style="font-size:10px;color:var(--orange);margin-top:4px;">Les logs de +6 mois sont compresses automatiquement.</div>';
    }
  }
  h += '<div style="margin-top:6px;font-size:11px;color:var(--sub);">' + logCount + ' seances';
  var reportCount = (db.reports || []).length;
  if (reportCount > 0) h += ' · ' + reportCount + ' reports';
  h += '</div>';
  h += '</div>';

  el.innerHTML = h;
}

// ============================================================
// FEED V2 — AMIS
// ============================================================
function fv2TimeAgo(input) {
  if (!input) return '';
  var diff = Math.floor((Date.now() - new Date(input).getTime()) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return 'il y a ' + Math.floor(diff / 60) + 'min';
  if (diff < 86400) return 'il y a ' + Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return 'il y a ' + Math.floor(diff / 86400) + 'j';
  return new Date(input).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function fv2DurationStr(sec) {
  if (!sec || sec <= 0) return '—';
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + 'h ' + (m > 0 ? m + 'min' : '');
  return m + 'min';
}

function fv2TierBadge(tier) {
  if (tier === 'founder') return '<span class="fv2-badge-founder">⭐ Founder</span>';
  if (tier === 'early_adopter' || tier === 'member') return '<span class="fv2-badge-member">Membre</span>';
  return '';
}

var _popoverOpen = null;

function openFv2Menu(activityId, authorId) {
  if (_popoverOpen === activityId) { closeFv2Popover(); return; }
  closeFv2Popover();
  closeReactionPicker();
  _popoverOpen = activityId;

  var uid = _cachedUid;
  var isMe = uid === authorId;

  var menuEl = document.createElement('div');
  menuEl.className = 'fv2-popover';
  menuEl.id = 'fv2-popover-' + activityId;

  if (isMe) {
    menuEl.innerHTML =
      '<div class="fv2-popover-item danger" onclick="deleteFeedPost(\'' + activityId + '\');closeFv2Popover();">🗑️ Supprimer</div>';
  } else {
    menuEl.innerHTML =
      '<div class="fv2-popover-item" onclick="copyRoutineFromFeed(\'' + activityId + '\');closeFv2Popover();">📋 Copier la routine</div>' +
      '<div class="fv2-popover-item danger" onclick="reportFeedPost(\'' + activityId + '\');closeFv2Popover();">🚩 Signaler</div>';
  }

  var card = document.getElementById('fv2-' + activityId);
  var btn = card ? card.querySelector('.fv2-menu') : null;
  if (!btn) { _popoverOpen = null; return; }
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(menuEl);

  setTimeout(function() {
    document.addEventListener('click', closeFv2Popover, { once: true });
  }, 0);
}

function closeFv2Popover() {
  if (_popoverOpen) {
    var el = document.getElementById('fv2-popover-' + _popoverOpen);
    if (el) el.remove();
    _popoverOpen = null;
  }
}

function reportFeedPost(activityId) {
  showToast('Signalement envoyé');
}

async function deleteFeedPost(activityId) {
  if (!supaClient) return;
  if (!confirm('Supprimer ce post ?')) return;
  try {
    await supaClient.from('activity_feed').delete().eq('id', activityId);
    var card = document.getElementById('fv2-' + activityId) || document.getElementById('feed-' + activityId);
    if (card) card.remove();
    showToast('Post supprimé');
  } catch(e) {
    console.error('deleteFeedPost error:', e);
    showToast('Erreur');
  }
}

function fv2RenderCard(item, profile, uid) {
  var d = item.data || {};
  var exercises = d.exercises || [];
  var hasExercises = exercises.length > 0;

  // === Nouveau format : pas d'exercises inline → lazy load ===
  if (!hasExercises) {
    var totalVol = d.volume || 0;
    var volStr = totalVol >= 1000 ? Math.round(totalVol).toLocaleString('fr-FR') + ' kg' : (totalVol || 0) + ' kg';
    var initial = avatarInitial(profile.username);
    var titleEsc = (d.title || 'Séance').replace(/'/g, "\\'");
    var sessionIdStr = (d.session_id || '').replace(/'/g, "\\'");
    var ownerIdStr = (item.user_id || '').replace(/'/g, "\\'");

    var statsHtml = '<div class="fv2-stats">' +
      '<span>🏋️ <strong>' + volStr + '</strong></span>' +
      '<span>⏱ <strong>' + fv2DurationStr(d.duration || 0) + '</strong></span>' +
      '<span>📋 <strong>' + (d.exercise_count || 0) + ' exos</strong></span>' +
      '</div>';

    var lazyExoHtml = '<div id="feed-session-detail-' + item.id + '" class="feed-session-lazy">' +
      '<button class="feed-load-session-btn" onclick="loadFeedSessionDetail(\'' + item.id + '\',\'' + sessionIdStr + '\',\'' + ownerIdStr + '\')">' +
      '📋 Voir les exercices</button></div>';

    if (d.top_set) {
      lazyExoHtml = '<div class="fv2-topset"><div class="fv2-topset-left"><div class="fv2-topset-label">🏋️ Meilleur set</div><strong>' + d.top_set + '</strong></div></div>' + lazyExoHtml;
    }

    var actionsHtml = '<div class="fv2-actions">' +
      '<button class="fv2-action" id="fv2-like-' + item.id + '" onclick="openReactionPicker(\'' + item.id + '\')">❤️ 0</button>' +
      '<button class="fv2-action" id="fv2-comment-btn-' + item.id + '" onclick="toggleComments(\'' + item.id + '\')">💬 0</button>' +
      '<button class="fv2-action" onclick="openDefiModal(\'' + item.id + '\',\'' + (profile.username || '').replace(/'/g, "\\'") + '\')">🏆 Défi</button>' +
      '<button class="fv2-action" onclick="shareActivity(\'' + item.id + '\',\'' + titleEsc + '\')">↗️</button>' +
      '</div>';

    return '<div class="fv2-card" id="fv2-' + item.id + '">' +
      '<div class="fv2-header">' +
        '<div class="fv2-avatar" onclick="showProfileOverlay(\'' + item.user_id + '\')">' + initial + '</div>' +
        '<div class="fv2-user-info">' +
          '<div class="fv2-username">' + escapeHtml(profile.username || 'Utilisateur') + ' ' + fv2TierBadge(profile.tier) + '</div>' +
          '<div class="fv2-subtitle">' + escapeHtml(d.title || 'Séance') + ' · ' + fv2TimeAgo(item.created_at) + '</div>' +
        '</div>' +
        '<button class="fv2-menu" onclick="openFv2Menu(\'' + item.id + '\',\'' + item.user_id + '\')">···</button>' +
      '</div>' +
      lazyExoHtml +
      statsHtml +
      actionsHtml +
      '<div class="fv2-comments-section" id="fv2-comments-' + item.id + '" style="display:none;"></div>' +
      '</div>';
  }
  // === Ancien format : exercises inline (rétrocompat) ===

  var workExos = exercises.map(function(exo) {
    var sets = (exo.allSets || exo.series || []).filter(function(s) { return s.type !== 'warmup'; });
    return { name: exo.name, sets: sets, allSets: exo.allSets || exo.series || [], isCardio: exo.isCardio || exo.isTime, maxRM: exo.maxRM || 0, reps: exo.reps, weight: exo.weight, setsCount: sets.length || exo.sets || 0 };
  });

  // Top set : priorité premier polyarticulaire, fallback plus lourd e1RM
  var COMPOUND_KEYWORDS = ['squat', 'deadlift', 'bench', 'souleve', 'press', 'row', 'pull', 'chin', 'dip', 'lunge', 'fente', 'rdl', 'romanian', 'developpe', 'tirage', 'tractions'];
  function isCompoundExo(name) {
    var n = (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return COMPOUND_KEYWORDS.some(function(kw) { return n.includes(kw); });
  }
  var topSet = null;
  for (var ci = 0; ci < workExos.length; ci++) {
    if (!workExos[ci].isCardio && isCompoundExo(workExos[ci].name)) { topSet = workExos[ci]; break; }
  }
  if (!topSet) {
    workExos.forEach(function(e) {
      if (!e.isCardio && e.maxRM > 0 && e.maxRM > (topSet ? topSet.maxRM : 0)) topSet = e;
    });
  }

  // Total volume
  var totalVol = d.volume || 0;
  if (!totalVol) {
    workExos.forEach(function(e) {
      e.allSets.forEach(function(s) { totalVol += (s.weight || 0) * (s.reps || 0); });
    });
  }
  var volStr = totalVol >= 1000 ? Math.round(totalVol).toLocaleString('fr-FR') + ' kg' : totalVol + ' kg';

  // Top set display
  var topSetHtml = '';
  if (topSet) {
    var bestSet = null;
    topSet.allSets.forEach(function(s) { if (s.weight > 0 && s.reps > 0 && (!bestSet || s.weight > bestSet.weight)) bestSet = s; });
    topSetHtml = '<div class="fv2-topset">' +
      '<div class="fv2-topset-left"><div class="fv2-topset-label">🏋️ Meilleur set</div><strong>' + topSet.name + '</strong> · ' + (bestSet ? bestSet.weight + 'kg × ' + bestSet.reps : '') + '</div>' +
      '<div class="fv2-topset-right"><div class="fv2-topset-label">Volume total</div>' + volStr + '</div></div>';
  }

  // Exercise list (max 4)
  var exoHtml = '<div class="fv2-exos">';
  var maxShow = Math.min(4, workExos.length);
  for (var i = 0; i < maxShow; i++) {
    var e = workExos[i];
    var detail = '';
    if (e.isCardio) {
      detail = fv2DurationStr(d.duration || 0);
    } else {
      var bestW = 0, bestR = 0;
      e.allSets.forEach(function(s) { if (s.weight > bestW) { bestW = s.weight; bestR = s.reps; } });
      detail = bestW > 0 ? bestW + 'kg · ' + e.setsCount + '×' + bestR : e.setsCount + ' séries';
    }
    exoHtml += '<div class="fv2-exo-row"><span class="fv2-exo-name">• ' + e.name + '</span><span class="fv2-exo-detail">' + detail + '</span></div>';
  }
  if (workExos.length > 4) {
    var extra = workExos.slice(4).map(function(e) { return e.name; }).join(', ');
    exoHtml += '<div class="fv2-exo-more">+' + (workExos.length - 4) + ' exercices · ' + extra + '</div>';
  }
  exoHtml += '</div>';

  // Stats bar
  var statsHtml = '<div class="fv2-stats">' +
    '<span>🏋️ <strong>' + volStr + '</strong></span>' +
    '<span>⏱ <strong>' + fv2DurationStr(d.duration || 0) + '</strong></span>' +
    '<span>📋 <strong>' + exercises.length + ' exos</strong></span>' +
    '</div>';

  // Actions
  var titleEsc = (d.title || 'Séance').replace(/'/g, "\\'");
  var actionsHtml = '<div class="fv2-actions">' +
    '<button class="fv2-action" id="fv2-like-' + item.id + '" onclick="openReactionPicker(\'' + item.id + '\')">❤️ 0</button>' +
    '<button class="fv2-action" id="fv2-comment-btn-' + item.id + '" onclick="toggleComments(\'' + item.id + '\')">💬 0</button>' +
    '<button class="fv2-action" onclick="openDefiModal(\'' + item.id + '\',\'' + (profile.username || '').replace(/'/g, "\\'") + '\')">🏆 Défi</button>' +
    '<button class="fv2-action" onclick="shareActivity(\'' + item.id + '\',\'' + titleEsc + '\')">↗️</button>' +
    '</div>';

  var initial = avatarInitial(profile.username);

  return '<div class="fv2-card" id="fv2-' + item.id + '">' +
    '<div class="fv2-header">' +
      '<div class="fv2-avatar" onclick="showProfileOverlay(\'' + item.user_id + '\')">' + initial + '</div>' +
      '<div class="fv2-user-info">' +
        '<div class="fv2-username">' + escapeHtml(profile.username || 'Utilisateur') + ' ' + fv2TierBadge(profile.tier) + '</div>' +
        '<div class="fv2-subtitle">' + escapeHtml(d.title || 'Séance') + ' · ' + fv2TimeAgo(item.created_at) + '</div>' +
      '</div>' +
      '<button class="fv2-menu" onclick="openFv2Menu(\'' + item.id + '\',\'' + item.user_id + '\')">···</button>' +
    '</div>' +
    topSetHtml +
    exoHtml +
    statsHtml +
    actionsHtml +
    '<div class="fv2-comments-section" id="fv2-comments-' + item.id + '" style="display:none;"></div>' +
    '</div>';
}

var _feedAmisInflight = false;
async function renderFeedAmis() {
  if (_feedAmisInflight) return;
  _feedAmisInflight = true;
  var container = document.getElementById('feedAmisContent');
  try {
  var uid = await getMyUserIdAsync();
  if (!uid) {
    if (container && _feedAmisPage === 0) {
      container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">🔐</div><div class="feed-empty-title">Connexion requise</div></div>';
    }
    return;
  }
  var loadMoreEl = document.getElementById('feedAmisLoadMore');
  var inviteEl = document.getElementById('feedAmisInvite');
  if (!container) return;

  if (_feedAmisPage === 0) {
    _feedAmisItems = [];
    container.innerHTML = [1,2,3].map(function() {
      return '<div class="fv2-card skeleton-card">' +
        '<div class="skeleton-line" style="width:55%;height:13px;margin-bottom:10px;"></div>' +
        '<div class="skeleton-line" style="width:88%;height:10px;margin-bottom:6px;"></div>' +
        '<div class="skeleton-line" style="width:38%;height:10px;"></div>' +
      '</div>';
    }).join('');
  }

  try {
    // Load feed items from friends + self
    var friendIds = await getAcceptedFriendIds();
    var allIds = [uid].concat(friendIds);
    var from = _feedAmisPage * FEED_PAGE_SIZE;
    var to = from + FEED_PAGE_SIZE - 1;

    var resp = await supaClient.from('activity_feed')
      .select('id, user_id, type, data, pinned, created_at')
      .in('user_id', allIds)
      .order('created_at', { ascending: false })
      .range(from, to);
    var items = resp.data || [];
    _feedAmisItems = _feedAmisItems.concat(items);

    // Load profiles with tier
    var userIds = [];
    var seen = {};
    _feedAmisItems.forEach(function(i) { if (!seen[i.user_id]) { seen[i.user_id] = true; userIds.push(i.user_id); } });
    var profiles = {};
    if (userIds.length) {
      var pResp = await supaClient.from('public_profiles').select('id, username, tier').in('id', userIds);
      (pResp.data || []).forEach(function(p) { profiles[p.id] = p; });
    }

    if (!_feedAmisItems.length) {
      container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">🤝</div>' +
        '<div class="feed-empty-title">' + (friendIds.length ? 'Rien de nouveau' : 'Invite tes amis !') + '</div>' +
        '<div class="feed-empty-sub">' + (friendIds.length ? 'Tes amis n\'ont pas encore posté.' : 'Partage ton code pour retrouver tes partenaires.') + '</div></div>';
    } else {
      container.innerHTML = _feedAmisItems.map(function(item) {
        var prof = profiles[item.user_id] || { username: 'Utilisateur' };
        if (item.type === 'session') return fv2RenderCard(item, prof, uid);
        return renderFeedCard(item, profiles, uid);
      }).join('');
      loadAllLikeCounts(_feedAmisItems, uid);
      initGlobalCommentChannel();
    }

    if (loadMoreEl) loadMoreEl.style.display = items.length >= FEED_PAGE_SIZE ? '' : 'none';

    // Friend code invitation card
    if (inviteEl) {
      inviteEl.innerHTML = '<div class="fv2-invite-card">' +
        '<div style="font-size:12px;color:var(--sub);margin-bottom:4px;">Code ami</div>' +
        '<div class="fv2-invite-code">' + (db.friendCode || '---') + '</div>' +
        '<button class="btn" style="width:auto;padding:8px 20px;font-size:12px;margin:0 auto;" onclick="copyFriendCode()">Partager</button>' +
        '</div>';
    }
  } catch (e) {
    console.error('renderFeedAmis error:', e);
    container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">😕</div><div class="feed-empty-title">Erreur</div><div class="feed-empty-sub">Impossible de charger le feed.</div></div>';
  }
  } finally {
    _feedAmisInflight = false;
  }
}

function loadMoreFeedAmis() { _feedAmisPage++; renderFeedAmis(); }

async function loadFv2LikeCount(activityId, uid) {
  if (!supaClient) return;
  try {
    var resp = await supaClient.from('reactions').select('id, user_id, emoji').eq('activity_id', activityId);
    var reactions = resp.data || [];
    var count = reactions.length;
    var liked = reactions.some(function(r) { return r.user_id === uid; });
    var btnEl = document.getElementById('fv2-like-' + activityId);
    if (btnEl) {
      btnEl.className = 'fv2-action' + (liked ? ' liked' : '');
      btnEl.innerHTML = (liked ? '❤️' : '🤍') + ' ' + count;
    }
    var cResp = await supaClient.from('comments').select('id', { count: 'exact', head: true }).eq('activity_id', activityId);
    var cCount = cResp.count || 0;
    var cBtn = document.getElementById('fv2-comment-btn-' + activityId);
    if (cBtn) cBtn.innerHTML = '💬 ' + cCount;
  } catch (e) {}
}

async function loadAllLikeCounts(items, uid) {
  if (!items.length || !supaClient) return;
  var ids = items.map(function(i) { return i.id; });
  try {
    var likesResp = await supaClient.from('reactions').select('activity_id, user_id, emoji').in('activity_id', ids);
    var commResp = await supaClient.from('comments').select('activity_id').in('activity_id', ids);
    var likeGrouped = {};
    (likesResp.data || []).forEach(function(r) {
      if (!likeGrouped[r.activity_id]) likeGrouped[r.activity_id] = { count: 0, mine: false, mineEmoji: '❤️' };
      likeGrouped[r.activity_id].count++;
      if (r.user_id === uid) { likeGrouped[r.activity_id].mine = true; likeGrouped[r.activity_id].mineEmoji = r.emoji; }
    });
    var commGrouped = {};
    (commResp.data || []).forEach(function(r) {
      commGrouped[r.activity_id] = (commGrouped[r.activity_id] || 0) + 1;
    });
    ids.forEach(function(id) {
      var info = likeGrouped[id] || { count: 0, mine: false, mineEmoji: '❤️' };
      var btn = document.getElementById('fv2-like-' + id);
      if (btn) {
        btn.innerHTML = (info.mine ? info.mineEmoji : '❤️') + ' ' + info.count;
        btn.className = 'fv2-action' + (info.mine ? ' liked' : '');
      }
      var cCount = commGrouped[id] || 0;
      var cBtn = document.getElementById('fv2-comment-btn-' + id);
      if (cBtn) cBtn.innerHTML = '💬 ' + cCount;
    });
  } catch(e) { console.error('loadAllLikeCounts error:', e); }
}

// ── Reaction picker ──────────────────────────────────────────
var _reactionPickerOpen = null;

function openReactionPicker(activityId) {
  if (_reactionPickerOpen === activityId) { closeReactionPicker(); return; }
  closeReactionPicker();
  closeFv2Popover();
  _reactionPickerOpen = activityId;
  var btn = document.getElementById('fv2-like-' + activityId);
  if (!btn) return;
  var picker = document.createElement('div');
  picker.className = 'fv2-reaction-picker';
  picker.id = 'reaction-picker-' + activityId;
  ['❤️', '💪', '🔥', '🏆', '👑', '💯', '🫡'].forEach(function(emoji) {
    var b = document.createElement('button');
    b.textContent = emoji;
    b.onclick = function(e) { e.stopPropagation(); toggleFv2Reaction(activityId, emoji); };
    picker.appendChild(b);
  });
  btn.parentElement.style.position = 'relative';
  btn.parentElement.insertBefore(picker, btn);
  setTimeout(function() {
    document.addEventListener('click', closeReactionPicker, { once: true });
  }, 0);
}

function closeReactionPicker() {
  if (_reactionPickerOpen) {
    var el = document.getElementById('reaction-picker-' + _reactionPickerOpen);
    if (el) el.remove();
    _reactionPickerOpen = null;
  }
}

async function toggleFv2Reaction(activityId, emoji) {
  closeReactionPicker();
  var uid = _cachedUid || await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  var { data: existing } = await supaClient.from('reactions')
    .select('id, emoji').eq('activity_id', activityId).eq('user_id', uid).maybeSingle();
  if (existing) {
    await supaClient.from('reactions').delete().eq('id', existing.id);
    if (existing.emoji === emoji) { refreshReactionCount(activityId, uid); return; }
  }
  await supaClient.from('reactions').insert({ activity_id: activityId, user_id: uid, emoji: emoji });
  refreshReactionCount(activityId, uid);
}

async function refreshReactionCount(activityId, uid) {
  if (!supaClient) return;
  var { data } = await supaClient.from('reactions').select('user_id, emoji').eq('activity_id', activityId);
  var count = (data || []).length;
  var mine = (data || []).find(function(r) { return r.user_id === uid; });
  var btn = document.getElementById('fv2-like-' + activityId);
  if (btn) {
    btn.innerHTML = (mine ? mine.emoji : '❤️') + ' ' + count;
    btn.className = 'fv2-action' + (mine ? ' liked' : '');
  }
}

// ── Commentaires fv2 ─────────────────────────────────────────
async function loadFv2Comments(activityId) {
  var section = document.getElementById('fv2-comments-' + activityId);
  if (!section) return;
  var uid = _cachedUid || await getMyUserIdAsync();

  var { data: comments } = await supaClient
    .from('comments')
    .select('id, user_id, text, created_at, profiles(username)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: true });

  var commentsHtml = (comments || []).map(function(c) {
    var isMe = c.user_id === uid;
    var username = (c.profiles && c.profiles.username) || 'Utilisateur';
    return '<div class="fv2-comment-row" id="comment-row-' + c.id + '">' +
      '<div class="fv2-comment-body">' +
        '<span class="fv2-comment-user">' + escapeHtml(username) + '</span> ' +
        '<span class="fv2-comment-text">' + escapeHtml(c.text) + '</span>' +
        '<div class="fv2-comment-time">' + fv2TimeAgo(c.created_at) + '</div>' +
      '</div>' +
      (isMe ? '<button class="fv2-comment-delete" onclick="deleteComment(\'' + c.id + '\',\'' + activityId + '\')">×</button>' : '') +
    '</div>';
  }).join('') || '<div style="text-align:center;padding:8px;font-size:12px;color:var(--sub);">Pas encore de commentaires</div>';

  section.innerHTML = commentsHtml +
    '<div class="fv2-comment-input-row">' +
      '<input type="text" id="comment-input-' + activityId + '" class="fv2-comment-input" placeholder="Ajouter un commentaire..." maxlength="280" ' +
      'onkeydown="if(event.key===\'Enter\')sendComment(\'' + activityId + '\')">' +
      '<button class="fv2-comment-send" onclick="sendComment(\'' + activityId + '\')">↑</button>' +
    '</div>';

  var countBadge = document.getElementById('fv2-comment-btn-' + activityId);
  if (countBadge) countBadge.innerHTML = '💬 ' + (comments || []).length;
}

async function sendComment(activityId) {
  var input = document.getElementById('comment-input-' + activityId);
  if (!input) return;
  var text = (input.value || '').trim();
  if (!text) return;
  var uid = _cachedUid || await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  input.disabled = true;
  var { error } = await supaClient.from('comments').insert({ activity_id: activityId, user_id: uid, text: text });
  if (!error) {
    input.value = '';
    await loadFv2Comments(activityId);
  } else {
    showToast('Erreur envoi commentaire');
  }
  input.disabled = false;
  input.focus();
}

async function toggleFv2Like(activityId, btnEl) {
  var uid = await getMyUserIdAsync();
  if (!uid || !supaClient) { showToast('Connecte-toi pour réagir'); return; }
  try {
    var resp = await supaClient.from('reactions').select('id').eq('activity_id', activityId).eq('user_id', uid).eq('emoji', '❤️').maybeSingle();
    if (resp.data) {
      await supaClient.from('reactions').delete().eq('id', resp.data.id);
    } else {
      await supaClient.from('reactions').insert({ activity_id: activityId, user_id: uid, emoji: '❤️' });
    }
    // Recount
    var allResp = await supaClient.from('reactions').select('id, user_id').eq('activity_id', activityId);
    var all = allResp.data || [];
    var count = all.length;
    var liked = all.some(function(r) { return r.user_id === uid; });
    if (btnEl) {
      btnEl.innerHTML = (liked ? '❤️' : '🤍') + ' ' + count;
      btnEl.className = 'fv2-action' + (liked ? ' liked' : '');
    }
  } catch (e) { console.error('toggleFv2Like error:', e); }
}

// ============================================================
// FEED V2 — COMMUNAUTÉ
// ============================================================
var _feedCommunauteInflight = false;
async function renderFeedCommunaute() {
  if (_feedCommunauteInflight) return;
  _feedCommunauteInflight = true;
  var container = document.getElementById('feedCommunauteContent');
  try {
  var uid = await getMyUserIdAsync();
  if (!uid) {
    if (container && _feedCommunautePage === 0) {
      container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">🔐</div><div class="feed-empty-title">Connexion requise</div></div>';
    }
    return;
  }
  var loadMoreEl = document.getElementById('feedCommunauteLoadMore');
  if (!container) return;

  if (_feedCommunautePage === 0) {
    _feedCommunauteItems = [];
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--sub);">Chargement...</div>';
  }

  try {
    var from = _feedCommunautePage * FEED_PAGE_SIZE;
    var to = from + FEED_PAGE_SIZE - 1;
    var resp = await supaClient.from('activity_feed')
      .select('id, user_id, type, data, pinned, created_at')
      .order('created_at', { ascending: false })
      .range(from, to);
    var items = resp.data || [];
    _feedCommunauteItems = _feedCommunauteItems.concat(items);

    var userIds = [];
    var seen = {};
    _feedCommunauteItems.forEach(function(i) { if (!seen[i.user_id]) { seen[i.user_id] = true; userIds.push(i.user_id); } });
    var profiles = {};
    if (userIds.length) {
      var pResp = await supaClient.from('public_profiles').select('id, username, tier, training_status').in('id', userIds);
      (pResp.data || []).forEach(function(p) { profiles[p.id] = p; });
    }

    if (!_feedCommunauteItems.length) {
      container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">🌍</div>' +
        '<div class="feed-empty-title">La communauté démarre</div>' +
        '<div class="feed-empty-sub">Invite tes amis pour animer le feed !</div>' +
        '<div class="fv2-invite-card" style="margin-top:16px;">' +
          '<div style="font-size:12px;color:var(--sub);">Code ami</div>' +
          '<div class="fv2-invite-code">' + (db.friendCode || '---') + '</div>' +
          '<button class="btn" style="width:auto;padding:8px 20px;font-size:12px;margin:0 auto;" onclick="copyFriendCode()">Inviter</button>' +
        '</div></div>';
    } else {
      container.innerHTML = _feedCommunauteItems.map(function(item) {
        var prof = profiles[item.user_id] || { username: 'Utilisateur' };
        if (item.type === 'session') return fv2RenderCard(item, prof, uid);
        return renderFeedCard(item, profiles, uid);
      }).join('');
      loadAllLikeCounts(_feedCommunauteItems, uid);
      initGlobalCommentChannel();
    }

    if (loadMoreEl) loadMoreEl.style.display = items.length >= FEED_PAGE_SIZE ? '' : 'none';
  } catch (e) {
    console.error('renderFeedCommunaute error:', e);
    container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">😕</div><div class="feed-empty-title">Erreur</div></div>';
  }
  } finally {
    _feedCommunauteInflight = false;
  }
}

function loadMoreFeedCommunaute() { _feedCommunautePage++; renderFeedCommunaute(); }

// ============================================================
// FEED V2 — CHALLENGES
// ============================================================
var _feedChallengesV2Inflight = false;
async function renderFeedChallengesV2() {
  if (_feedChallengesV2Inflight) return;
  _feedChallengesV2Inflight = true;
  try {
  var container = document.getElementById('feedChallengesContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--sub);">Chargement...</div>';

  if (!supaClient || !cloudSyncEnabled) {
    container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">☁️</div><div class="feed-empty-title">Connexion requise</div></div>';
    return;
  }

  var uid = await getMyUserIdAsync();
  if (!uid) return;

  try {
    // Load all challenges
    var friendIds = await getAcceptedFriendIds();
    var allCreatorIds = [uid].concat(friendIds);
    var allChallenges = [];

    // Parallelize the independent fetches: my participations, friend-created and
    // own-created challenges only depend on uid/friendIds, not on each other.
    var _chRes = await Promise.all([
      supaClient.from('challenge_participants').select('challenge_id').eq('user_id', uid),
      friendIds.length ? supaClient.from('social_challenges').select('*').in('creator_id', friendIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
      supaClient.from('social_challenges').select('*').eq('creator_id', uid).order('created_at', { ascending: false })
    ]);
    var partResp = _chRes[0], r2 = _chRes[1], r3 = _chRes[2];
    var myChIds = (partResp.data || []).map(function(p) { return p.challenge_id; });

    // My-participated challenges depend on partResp's ids → fetched after.
    if (myChIds.length) {
      var r1 = await supaClient.from('social_challenges').select('*').in('id', myChIds).order('created_at', { ascending: false });
      if (r1.data) allChallenges = r1.data;
    }
    // Friend-created (merge, dedup) — same order as before
    if (r2.data) r2.data.forEach(function(c) { if (!allChallenges.find(function(x) { return x.id === c.id; })) allChallenges.push(c); });
    // Own created (merge, dedup)
    if (r3.data) r3.data.forEach(function(c) { if (!allChallenges.find(function(x) { return x.id === c.id; })) allChallenges.push(c); });

    // Load participants
    var allChIds = allChallenges.map(function(c) { return c.id; });
    var allParticipants = [];
    if (allChIds.length) {
      var r4 = await supaClient.from('challenge_participants').select('*').in('challenge_id', allChIds);
      allParticipants = r4.data || [];
    }

    // Load profiles
    var involvedIds = {};
    allChallenges.forEach(function(c) { involvedIds[c.creator_id] = true; });
    allParticipants.forEach(function(p) { involvedIds[p.user_id] = true; });
    var profiles = {};
    var idArr = Object.keys(involvedIds);
    if (idArr.length) {
      var r5 = await supaClient.from('public_profiles').select('id, username, tier').in('id', idArr);
      (r5.data || []).forEach(function(p) { profiles[p.id] = p; });
    }

    var now = new Date();
    var active = allChallenges.filter(function(c) { return new Date(c.end_date) > now; });
    var finished = allChallenges.filter(function(c) { return new Date(c.end_date) <= now; }).slice(0, 5);

    // Lot B — recalcul auto de MON score avant rendu (écrit si changé)
    await refreshMyChallengeScores(uid, active, allParticipants);

    var h = '';

    // Create button
    h += '<div class="ch2-create" onclick="showChallengePicker()"><div style="font-size:28px;margin-bottom:6px;">➕</div><div style="font-size:13px;font-weight:600;color:var(--sub);">Créer un challenge</div></div>';

    // Active challenges
    if (active.length) {
      h += '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:8px;">En cours</div>';
      active.forEach(function(c) {
        var parts = allParticipants.filter(function(p) { return p.challenge_id === c.id; });
        var isJoined = parts.some(function(p) { return p.user_id === uid; });
        var daysLeft = Math.max(0, Math.ceil((new Date(c.end_date) - now) / 86400000));
        var sorted = parts.slice().sort(function(a, b) { return (b.current_value || 0) - (a.current_value || 0); });
        var myPart = parts.find(function(p) { return p.user_id === uid; });
        var myRank = sorted.findIndex(function(p) { return p.user_id === uid; }) + 1;

        h += '<div class="ch2-card ' + (isJoined ? 'active-joined' : 'open-card') + '">';
        h += '<div class="ch2-header"><div class="ch2-status ' + (isJoined ? 'active' : 'open') + '">' +
          (isJoined ? '🟢 ACTIF · REJOINT ✓' : '🔵 OUVERT · INSCRIPTIONS') + '</div>' +
          '<div class="ch2-time">' + daysLeft + 'j restants</div></div>';
        h += '<div class="ch2-title">' + escapeHtml(c.title || 'Challenge') + '</div>';
        h += '<div class="ch2-meta">' + parts.length + ' participant' + (parts.length > 1 ? 's' : '') + '</div>';

        if (isJoined && myPart) {
          var pct = c.target_value ? Math.min(100, Math.round((myPart.current_value || 0) / c.target_value * 100)) : 0;
          h += '<div class="ch2-progress">';
          h += '<div style="display:flex;justify-content:space-between;font-size:12px;"><span style="font-weight:700;">Ma position : #' + myRank + '</span><span style="color:var(--blue);font-weight:700;">' + formatChallengeValue(myPart.current_value, c.type) + (c.target_value ? ' / ' + c.target_value : '') + '</span><span style="color:var(--green);font-weight:700;">' + pct + '% ↑</span></div>';
          h += '<div class="ch2-bar-bg"><div class="ch2-bar-fill" style="width:' + pct + '%;background:var(--green);"></div></div>';
          if (sorted.length >= 2) {
            h += '<div class="ch2-podium-row">Podium : 🥇 ' + escapeHtml((profiles[sorted[0].user_id] || {}).username || '?');
            if (sorted[1]) h += ' · 🥈 ' + escapeHtml((profiles[sorted[1].user_id] || {}).username || '?');
            h += '</div>';
          }
          h += '</div>';
        } else {
          h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">';
          h += '<span style="font-size:11px;color:var(--sub);">Créé par ' + escapeHtml((profiles[c.creator_id] || {}).username || '?') + '</span>';
          h += '<button class="btn" style="font-size:12px;padding:8px 16px;width:auto;" onclick="joinChallenge(\'' + c.id + '\',this)">Rejoindre</button>';
          h += '</div>';
        }
        h += '</div>';
      });
    }

    // Finished
    if (finished.length) {
      h += '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin:16px 0 8px;">Terminés</div>';
      finished.forEach(function(c) {
        var parts = allParticipants.filter(function(p) { return p.challenge_id === c.id; });
        var sorted = parts.slice().sort(function(a, b) { return (b.current_value || 0) - (a.current_value || 0); });
        var myRank = sorted.findIndex(function(p) { return p.user_id === uid; }) + 1;
        var medals = ['🥇','🥈','🥉'];

        h += '<div class="ch2-card finished">';
        h += '<div class="ch2-header"><div class="ch2-status done">⚪ TERMINÉ</div>' +
          (myRank > 0 ? '<div class="ch2-time">' + (medals[myRank - 1] || '#' + myRank) + ' ta place</div>' : '') + '</div>';
        h += '<div class="ch2-title">' + escapeHtml(c.title || 'Challenge') + '</div>';
        if (sorted.length) {
          h += '<div style="font-size:11px;color:var(--sub);margin-top:4px;">';
          sorted.slice(0, 3).forEach(function(p, i) {
            h += (medals[i] || (i + 1) + '.') + ' ' + escapeHtml((profiles[p.user_id] || {}).username || '?') + ' · ' + formatChallengeValue(p.current_value, c.type) + '  ';
          });
          h += '</div>';
        }
        h += '</div>';
      });
    }

    if (!active.length && !finished.length) {
      h += '<div class="feed-empty" style="padding-top:10px;"><div class="feed-empty-icon">🏆</div><div class="feed-empty-title">Aucun challenge</div><div class="feed-empty-sub">Crée le premier challenge !</div></div>';
    }

    container.innerHTML = h;
  } catch (e) {
    console.error('renderFeedChallengesV2 error:', e);
    container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">😕</div><div class="feed-empty-title">Erreur</div></div>';
  }
  } finally {
    _feedChallengesV2Inflight = false;
  }
}

// ============================================================
// FEED V2 — CLASSEMENT
// ============================================================
function setLb2Period(p) { _lb2Period = p; renderFeedClassementV2(); }
function setLb2Category(c) { _lb2Category = c; renderFeedClassementV2(); }

var _feedClassementV2Inflight = false;
async function renderFeedClassementV2() {
  if (_feedClassementV2Inflight) return;
  _feedClassementV2Inflight = true;
  try {
  var container = document.getElementById('feedClassementContent');
  if (!container) return;

  var uid = await getMyUserIdAsync();
  if (!uid || !supaClient) {
    container.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">☁️</div><div class="feed-empty-title">Connexion requise</div></div>';
    return;
  }

  var periodPills = '<div class="lb2-period-pills">' +
    ['week','month','all'].map(function(p) {
      var labels = { week: 'Cette semaine', month: 'Ce mois', all: 'All time' };
      return '<button class="stats-sub-pill' + (_lb2Period === p ? ' active' : '') + '" onclick="setLb2Period(\'' + p + '\')">' + labels[p] + '</button>';
    }).join('') + '</div>';

  var catPills = '<div class="lb2-category-pills">' +
    [{ id: 'volume', label: 'Volume 🏋️' }, { id: 'sessions', label: 'Séances 📅' }, { id: 'streak', label: 'Streak 🔥' }, { id: 'sbd', label: 'SBD ⚡️' }].map(function(c) {
      return '<button class="stats-sub-pill' + (_lb2Category === c.id ? ' active' : '') + '" onclick="setLb2Category(\'' + c.id + '\')">' + c.label + '</button>';
    }).join('') + '</div>';

  container.innerHTML = periodPills + catPills + '<div id="lb2Body"><div style="text-align:center;padding:20px;color:var(--sub);">Chargement...</div></div>';

  try {
    var friendIds = await getAcceptedFriendIds();
    var allIds = [uid].concat(friendIds);

    var profiles = {};
    var snaps = [];
    if (allIds.length) {
      // Parallelize: profiles and snapshots both key on allIds and are independent.
      var _needSnaps = (_lb2Category === 'sbd' || _lb2Category === 'volume');
      var _lb2Res = await Promise.all([
        supaClient.from('public_profiles').select('id, username, tier').in('id', allIds),
        _needSnaps ? supaClient.from('leaderboard_snapshots').select('user_id, exercise_name, value').in('user_id', allIds) : Promise.resolve({ data: [] })
      ]);
      (_lb2Res[0].data || []).forEach(function(p) { profiles[p.id] = p; });
      snaps = _lb2Res[1].data || [];
    }

    var ranking = [];

    if (_lb2Category === 'sbd') {
      // snaps already fetched in parallel with profiles above (no extra round-trip).
      var userSBD = {};
      allIds.forEach(function(id) { userSBD[id] = { s: 0, b: 0, d: 0 }; });
      snaps.forEach(function(s) {
        if (!userSBD[s.user_id]) return;
        if (s.exercise_name === 'Squat') userSBD[s.user_id].s = Math.max(userSBD[s.user_id].s, s.value);
        else if (s.exercise_name === 'Développé couché') userSBD[s.user_id].b = Math.max(userSBD[s.user_id].b, s.value);
        else if (s.exercise_name === 'Soulevé de terre') userSBD[s.user_id].d = Math.max(userSBD[s.user_id].d, s.value);
      });
      ranking = Object.keys(userSBD).map(function(id) {
        var t = userSBD[id].s + userSBD[id].b + userSBD[id].d;
        return { userId: id, score: t, username: (profiles[id] || {}).username || '?' };
      }).filter(function(r) { return r.score > 0; });
    } else if (_lb2Category === 'volume') {
      var volByUser = {};
      snaps.forEach(function(s) {
        if (!volByUser[s.user_id]) volByUser[s.user_id] = 0;
        volByUser[s.user_id] += s.value;
      });
      ranking = Object.keys(volByUser).map(function(id) {
        return { userId: id, score: Math.round(volByUser[id]), username: (profiles[id] || {}).username || '?' };
      });
    } else if (_lb2Category === 'streak') {
      var localStreak = typeof computeWeekStreak === 'function' ? computeWeekStreak().current : 0;
      ranking = [{ userId: uid, score: localStreak, username: (profiles[uid] || {}).username || 'Moi' }];
    } else {
      // sessions — use snapshot count as proxy
      var snapResp3 = await supaClient.from('leaderboard_snapshots').select('user_id, exercise_name').in('user_id', allIds);
      var sessByUser = {};
      (snapResp3.data || []).forEach(function(s) {
        if (!sessByUser[s.user_id]) sessByUser[s.user_id] = new Set();
        sessByUser[s.user_id].add(s.exercise_name);
      });
      ranking = Object.keys(sessByUser).map(function(id) {
        return { userId: id, score: sessByUser[id].size, username: (profiles[id] || {}).username || '?' };
      });
    }

    ranking.sort(function(a, b) { return b.score - a.score; });

    var body = document.getElementById('lb2Body');
    if (!body) return;

    if (!ranking.length) {
      body.innerHTML = '<div class="feed-empty" style="padding-top:10px;"><div class="feed-empty-icon">📊</div><div class="feed-empty-title">Pas de données</div><div class="feed-empty-sub">Ajoute des amis pour voir le classement !</div></div>';
      return;
    }

    var h = '';
    // Podium
    var top3 = ranking.slice(0, 3);
    if (top3.length >= 2) {
      var podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : [top3[1], top3[0]];
      var barHeights = top3.length >= 3 ? [70, 100, 50] : [70, 100];
      var medals = top3.length >= 3 ? ['🥈', '🥇', '🥉'] : ['🥈', '🥇'];
      var barColors = ['rgba(192,192,192,0.3)', 'rgba(255,214,10,0.3)', 'rgba(205,127,50,0.3)'];
      h += '<div class="lb2-podium">';
      podiumOrder.forEach(function(entry, i) {
        h += '<div class="lb2-podium-bar">' +
          '<div class="lb2-podium-medal">' + medals[i] + '</div>' +
          '<div class="lb2-podium-avatar" style="' + (entry.userId === uid ? 'border:2px solid var(--accent);' : '') + '">' + avatarInitial(entry.username) + '</div>' +
          '<div class="lb2-podium-name">' + entry.username + '</div>' +
          '<div class="lb2-podium-score">' + entry.score + '</div>' +
          '<div class="bar" style="height:' + barHeights[i] + 'px;background:' + barColors[i] + ';"></div></div>';
      });
      h += '</div>';
    }

    // Full list
    ranking.forEach(function(entry, i) {
      h += '<div class="lb2-row' + (entry.userId === uid ? ' me' : '') + '">' +
        '<div class="lb2-rank">' + (i + 1) + '</div>' +
        '<div class="lb2-row-avatar">' + avatarInitial(entry.username) + '</div>' +
        '<div class="lb2-row-info"><div class="lb2-row-name">' + entry.username + '</div></div>' +
        '<div class="lb2-row-score">' + entry.score + '</div></div>';
    });

    body.innerHTML = h;
  } catch (e) {
    console.error('renderFeedClassementV2 error:', e);
    var b = document.getElementById('lb2Body');
    if (b) b.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">😕</div><div class="feed-empty-title">Erreur</div></div>';
  }
  } finally {
    _feedClassementV2Inflight = false;
  }
}

// ============================================================
// BUG REPORT — guided questionnaire
// ============================================================
const BUG_CATEGORIES = [
  {id:'import', label:'📥 Import de séances'},
  {id:'go', label:'🏋️ Séance en cours (GO)'},
  {id:'stats', label:'📊 Stats / Graphiques'},
  {id:'programme', label:'📋 Programme'},
  {id:'social', label:'🤝 Social / Amis'},
  {id:'sync', label:'☁️ Synchronisation cloud'},
  {id:'affichage', label:'🎨 Affichage / Interface'},
  {id:'autre', label:'❓ Autre'},
];

const BUG_SEVERITIES = [
  {id:'bloquant', label:'🔴 Bloquant — je ne peux plus utiliser l\'app'},
  {id:'genant', label:'🟠 Gênant — ça perturbe mon utilisation'},
  {id:'mineur', label:'🟡 Mineur — petit problème cosmétique'},
];

let _bugStep = 0;
let _bugData = {};

function showBugReport() {
  _bugStep = 0;
  _bugData = {
    current_tab: document.querySelector('.tab-btn.active')?.dataset?.tab || 'unknown',
    device_info: {
      ua: navigator.userAgent,
      screen: screen.width + 'x' + screen.height,
      lang: navigator.language,
    },
    app_version: 'v96',
  };
  document.getElementById('bugReportModal').style.display = '';
  renderBugStep();
}

function closeBugReport() {
  document.getElementById('bugReportModal').style.display = 'none';
}

function renderBugStep() {
  const el = document.getElementById('bugReportForm');
  const btnStyle = 'width:100%;text-align:left;padding:14px 16px;' +
    'background:var(--surface,#2a2a3e);border:1px solid var(--border,#3a3a5c);' +
    'border-radius:12px;color:var(--text);font-size:14px;cursor:pointer;margin-bottom:8px;display:block;';

  if (_bugStep === 0) {
    el.innerHTML = '<p style="color:var(--sub);font-size:14px;margin-bottom:16px;">Quelle partie de l\'app est concernée ?</p>' +
      BUG_CATEGORIES.map(c =>
        '<button onclick="bugSelectCategory(\'' + c.id + '\')" style="' + btnStyle + '">' + c.label + '</button>'
      ).join('');
  } else if (_bugStep === 1) {
    el.innerHTML = '<p style="color:var(--sub);font-size:14px;margin-bottom:16px;">Quel est l\'impact du bug ?</p>' +
      BUG_SEVERITIES.map(s =>
        '<button onclick="bugSelectSeverity(\'' + s.id + '\')" style="' + btnStyle + '">' + s.label + '</button>'
      ).join('');
  } else if (_bugStep === 2) {
    const taStyle = 'width:100%;background:var(--surface);border:1px solid var(--border);' +
      'border-radius:10px;padding:10px;color:var(--text);font-size:13px;resize:vertical;box-sizing:border-box;';
    el.innerHTML =
      '<div style="margin-bottom:12px;">' +
        '<label style="font-size:12px;color:var(--sub);display:block;margin-bottom:6px;">Comment reproduire le bug ?</label>' +
        '<textarea id="bugSteps" placeholder="Ex: 1. Aller dans GO 2. Ajouter un exercice 3. ..." style="' + taStyle + '" rows="3"></textarea>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<label style="font-size:12px;color:var(--sub);display:block;margin-bottom:6px;">Ce qui devrait se passer</label>' +
        '<textarea id="bugExpected" placeholder="Ex: La séance devrait se sauvegarder..." style="' + taStyle + '" rows="2"></textarea>' +
      '</div>' +
      '<div style="margin-bottom:20px;">' +
        '<label style="font-size:12px;color:var(--sub);display:block;margin-bottom:6px;">Ce qui se passe réellement</label>' +
        '<textarea id="bugActual" placeholder="Ex: L\'app plante / rien ne se passe..." style="' + taStyle + '" rows="2"></textarea>' +
      '</div>' +
      '<button onclick="submitBugReport()" style="width:100%;padding:14px;background:var(--red,#ff3b30);' +
      'color:white;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;">Envoyer 🐛</button>';
  } else if (_bugStep === 3) {
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;">' +
      '<div style="font-size:48px;margin-bottom:16px;">✅</div>' +
      '<h3 style="margin-bottom:8px;">Merci !</h3>' +
      '<p style="color:var(--sub);font-size:14px;">Ton rapport a été envoyé.</p>' +
      '<button onclick="closeBugReport()" style="margin-top:24px;padding:12px 32px;' +
      'background:var(--surface);border:1px solid var(--border);border-radius:12px;' +
      'color:var(--text);font-size:14px;cursor:pointer;">Fermer</button>' +
      '</div>';
  }
}

function bugSelectCategory(cat) {
  _bugData.category = cat;
  _bugStep = 1;
  renderBugStep();
}

function bugSelectSeverity(sev) {
  _bugData.severity = sev;
  _bugStep = 2;
  renderBugStep();
}

async function submitBugReport() {
  _bugData.steps = document.getElementById('bugSteps')?.value || '';
  _bugData.expected = document.getElementById('bugExpected')?.value || '';
  _bugData.actual = document.getElementById('bugActual')?.value || '';

  try {
    const { data: { session } } = await supaClient.auth.getSession();
    if (session) {
      _bugData.user_id = session.user.id;
      _bugData.user_email = session.user.email || null;
    }
  } catch(e) {}

  try {
    await supaClient.from('bug_reports').insert([{
      user_id: _bugData.user_id || null,
      user_email: _bugData.user_email || null,
      category: _bugData.category,
      severity: _bugData.severity,
      current_tab: _bugData.current_tab,
      steps: _bugData.steps,
      expected: _bugData.expected,
      actual: _bugData.actual,
      device_info: _bugData.device_info,
      app_version: _bugData.app_version,
    }]);
    _bugStep = 3;
    renderBugStep();
  } catch(e) {
    showToast('Erreur lors de l\'envoi — ' + e.message);
  }
}

// ============================================================
// WEB PUSH — v160
// ============================================================

var PUSH_VAPID_PUBLIC_KEY = 'BG09zEE8jwn60A5Yyrfg9ZueS5Pp6QuQ1Zc2NkC5xbOzbG-ZhQt518KJnkDm8-56Zn59ifLFk6fOGwamuMrsnJ8';

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(base64);
  return Uint8Array.from([].map.call(raw, function(c) { return c.charCodeAt(0); }));
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Notifications push non supportées sur ce navigateur.');
    return null;
  }
  try {
    var permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Notifications refusées. Active-les dans les réglages du téléphone.');
      return null;
    }
    var reg = await navigator.serviceWorker.ready;
    var existing = await reg.pushManager.getSubscription();
    var sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUSH_VAPID_PUBLIC_KEY)
    });
    if (!supaClient) {
      showToast('🔔 Notifications locales activées !');
      return sub;
    }
    var { data: { user } } = await supaClient.auth.getUser();
    if (!user) {
      showToast('🔔 Notifications locales activées !');
      return sub;
    }
    var subJson = sub.toJSON();
    await supaClient.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    if (typeof db !== 'undefined' && typeof saveDB === 'function') {
      db._pushEnabled = true;
      saveDB();
    }
    showToast('🔔 Notifications push activées !');
    return sub;
  } catch(e) {
    console.error('subscribeToPush:', e);
    showToast('Erreur activation push : ' + (e.message || e));
    return null;
  }
}
