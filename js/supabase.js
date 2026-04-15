// ============================================================
// supabase.js — Auth, cloud sync, social module
// ============================================================

// ============================================================
// SUPABASE
// ============================================================
const SUPABASE_URL = 'https://swwygywahfdenyzotrce.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JDEEN5nMLQjvfWOX0UfBNw_R38Olz-T';
let supaClient = null, cloudSyncEnabled = false, syncDebounceTimer = null, _realtimeSubscription = null;
try {
  if (typeof supabase !== 'undefined' && supabase) {
    supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    console.warn('Supabase library not loaded');
  }
} catch(e) { console.warn('Supabase init failed:', e); }

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
    if (event === 'PASSWORD_RECOVERY') {
      showSetNewPasswordModal();
    }
    // On sign-in or token refresh, ensure profile exists in Supabase
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user?.email) {
      cloudSyncEnabled = true;
      ensureProfile().catch(e => console.warn('ensureProfile on auth change:', e));
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

async function syncToCloud(silent) { if (!supaClient || !cloudSyncEnabled) return; try { const {data:{user}} = await supaClient.auth.getUser(); if (!user) return; const payload = { user_id: user.id, data: db, updated_at: new Date().toISOString() }; const {error} = await supaClient.from('sbd_profiles').upsert(payload, { onConflict: 'user_id' }); if (error) throw error; db.lastSync = Date.now(); localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); if (!silent) showToast('Synchronisé !'); updateSyncStatus('sync'); } catch(e) { console.error('Cloud sync:', e); if (!silent) showToast('Erreur sync'); updateSyncStatus('error'); } }
async function syncFromCloud() { if (!supaClient) return false; try { const {data:{user}} = await supaClient.auth.getUser(); if (!user) return false; const {data, error} = await supaClient.from('sbd_profiles').select('data,updated_at').eq('user_id', user.id).maybeSingle(); if (error) throw error; if (data && data.data) { db = data.data; if (!db.reports) db.reports = []; db.lastSync = data.updated_at ? new Date(data.updated_at).getTime() : Date.now(); localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); refreshUI(); showToast('Données cloud chargées !'); return true; } else { showToast('Aucune donnée cloud trouvée'); return false; } } catch(e) { console.error('Cloud pull:', e); showToast('Erreur chargement cloud'); return false; } }
async function syncFromCloudIfNewer() { if (!supaClient || !cloudSyncEnabled) return; try { const {data:{user}} = await supaClient.auth.getUser(); if (!user) return; const {data, error} = await supaClient.from('sbd_profiles').select('data,updated_at').eq('user_id', user.id).maybeSingle(); if (error) throw error; if (data && data.data && data.updated_at) { const cloudTs = new Date(data.updated_at).getTime(); if (cloudTs > (db.lastSync || 0) + 5000) { db = data.data; if (!db.reports) db.reports = []; db.lastSync = cloudTs; localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); if (typeof renderSeancesTab === 'function') renderSeancesTab(); } } } catch(e) { console.error('Cloud sync check:', e); } }
// ── Realtime subscription pour sync instantanée ──────────────
async function startRealtimeSubscription() {
  if (!supaClient || !cloudSyncEnabled || _realtimeSubscription) return;
  try {
    const {data:{user}} = await supaClient.auth.getUser();
    if (!user) return;
    _realtimeSubscription = supaClient
      .channel('public:sbd_profiles')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sbd_profiles',
        filter: 'user_id=eq.' + user.id
      }, function(payload) {
        if (payload.new && payload.new.data) {
          db = payload.new.data;
          if (!db.reports) db.reports = [];
          db.lastSync = payload.new.updated_at ? new Date(payload.new.updated_at).getTime() : Date.now();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
          if (typeof renderSeancesTab === 'function') renderSeancesTab();
        }
      })
      .subscribe();
  } catch(e) { console.error('Realtime subscription:', e); }
}
function updateCloudUI(user, err) { const el = document.getElementById('cloudStatus'); if (!el) return; const emailSection = document.getElementById('emailLoginSection'); if (err) { el.innerHTML = '<span style="color:var(--red);">Erreur: '+err+'</span>'; return; } if (user) { const label = user.email ? user.email : 'Anonyme ('+user.id.substring(0,8)+'...)'; const color = user.email ? 'var(--green)' : 'var(--orange)'; const hint = user.email ? 'Sync entre appareils active' : 'Connecte-toi par email pour sync multi-appareils'; el.innerHTML = '<span style="color:'+color+';">Connecté au cloud</span><span style="font-size:11px;color:var(--text);display:block;margin-top:4px;">'+label+'</span><span style="font-size:10px;color:var(--sub);display:block;margin-top:2px;">'+hint+'</span>'; if (emailSection) emailSection.style.display = user.email ? 'none' : 'block'; return; } el.innerHTML = '<span style="color:var(--sub);">Non connecté</span>'; if (emailSection) emailSection.style.display = 'block'; }
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
            refreshUI();
          } else {
            await syncToCloud(true);
          }
        } catch(se) { await syncToCloud(true); }
        await ensureProfile();
        hideLoginScreen();
        showToast('Connecté !');
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
    if (session && session.user && session.user.email) {
      // User is authenticated with email — proceed normally
      cloudSyncEnabled = true;
      return;
    }
    // No session or anonymous — show login screen
    showLoginScreen();
  } catch(e) {
    // Network error — let user continue offline
    console.warn('Auth gate check failed:', e);
  }
}

// ── Password migration check (handles anonymous vs email users) ──
async function checkPasswordMigration(user) {
  if (!user) return;

  // Anonymous user (no email) — sign out silently, show normal login
  if (!user.email) {
    await supaClient.auth.signOut();
    cloudSyncEnabled = false;
    updateCloudUI(null);
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
async function cloudLogout() { if (!supaClient) return; await supaClient.auth.signOut(); cloudSyncEnabled = false; updateCloudUI(null); showToast('Déconnecté du cloud'); }


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

const COMMON_EMOJIS = ['💪','🔥','👏','🎉','❤️','😤','🏆','⚡','👊','💯','🙌','😂','🤯','💀','🫡','👑'];

async function getMyUserIdAsync() {
  if (!supaClient) return null;
  try {
    const { data } = await supaClient.auth.getUser();
    return data?.user?.id || null;
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
  return (username || 'U').charAt(0).toUpperCase();
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
  document.getElementById(subId).classList.add('active');
  if (btn) btn.classList.add('active');
  else document.querySelector('.social-sub-tab[data-sub="'+subId+'"]')?.classList.add('active');
  if (subId === 'social-feed') renderFeed();
  if (subId === 'social-leaderboard') renderLeaderboard();
  if (subId === 'social-friends') renderFriendsTab();
  if (subId === 'social-challenges') renderChallengesTab();
}

async function initSocialTab() {
  if (!supaClient || !cloudSyncEnabled) {
    document.getElementById('social-feed').innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">🔒</div><div class="feed-empty-title">Accès réservé aux membres</div><div class="feed-empty-sub">Crée un compte gratuit pour accéder au module social.</div><button class="btn" style="max-width:200px;margin:16px auto 0;" onclick="showLoginScreen()">Se connecter</button></div>';
    return;
  }
  const uid = await getMyUserIdAsync();
  if (!uid) return;

  // Check if social onboarding needed
  if (!db.social.onboardingCompleted) {
    showSocialOnboarding();
    return;
  }

  // Ensure profile + friend_code exist in Supabase (creates/updates if needed)
  await ensureProfile();

  // Display friend code
  const fcEl = document.getElementById('myFriendCode');
  if (fcEl) fcEl.textContent = db.friendCode || '---';

  // Load the active sub-tab
  const activeSub = document.querySelector('.social-sub-content.active');
  const subId = activeSub ? activeSub.id : 'social-feed';
  if (subId === 'social-feed') renderFeed();
  else if (subId === 'social-leaderboard') renderLeaderboard();
  else if (subId === 'social-friends') renderFriendsTab();

  // Update notification badge
  updateSocialBadge();
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
      const { data: existing } = await supaClient.from('profiles').select('id').eq('friend_code', code).maybeSingle();
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
    const { data, error } = await supaClient.from('profiles')
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
  if (!window.db || !window.db.social) return null;
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return null;

  try {
    // 1. Read existing profile from Supabase
    const { data: existing, error: readErr } = await supaClient
      .from('profiles').select('*').eq('id', uid).maybeSingle();
    if (readErr) {
      console.error('ensureProfile READ error:', readErr);
      showToast('Erreur lecture profil : ' + readErr.message);
      return null;
    }

    // 2. Determine username: local > base > fallback
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
    const { data: existing } = await supaClient.from('profiles').select('id').eq('username', username).maybeSingle();
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
    const { data, error } = await supaClient.from('profiles')
      .select('id, username')
      .ilike('username', '%' + query + '%')
      .neq('id', uid)
      .is('deleted_at', null)
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
      '<div class="friends-ac-item" onclick="onSelectSearchUser(\'' + u.id + '\',\'' + u.username + '\')">' +
        '<div class="friends-ac-avatar">' + avatarInitial(u.username) + '</div>' +
        '<span class="friends-ac-name">' + u.username + '</span>' +
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
      .or('requester_id.eq.' + uid + ',target_id.eq.' + uid)
      .limit(500);
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
    const { data, error } = await supaClient.from('profiles')
      .select('id, username, bio, visibility_bio, visibility_prs, visibility_programme, visibility_seances, visibility_stats')
      .in('id', friendIds)
      .is('deleted_at', null)
      .limit(500);
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
  const code = document.getElementById('myFriendCode').textContent;
  if (!code || code === '---') return;
  navigator.clipboard.writeText(code).then(() => showToast('Code ami copié !')).catch(() => showToast('Erreur copie'));
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
      .eq('activity_id', activityId)
      .limit(500);
    return data || [];
  } catch { return []; }
}

async function loadCommentsForActivity(activityId) {
  if (!supaClient) return [];
  try {
    const { data } = await supaClient.from('comments')
      .select('id, user_id, text, created_at')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true })
      .limit(200);
    return data || [];
  } catch { return []; }
}

async function renderFeed() {
  const uid = await getMyUserIdAsync();
  if (!uid) return;

  const feedContent = document.getElementById('feedContent');
  const pinnedSection = document.getElementById('feedPinnedSection');
  const loadMoreBtn = document.getElementById('feedLoadMore');

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
  if (userIds.length) {
    try {
      const { data } = await supaClient.from('profiles').select('id, username').in('id', userIds).limit(500);
      (data || []).forEach(p => profiles[p.id] = p);
    } catch {}
  }

  if (!_feedItems.length) {
    const friendIds = await getAcceptedFriendIds();
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
    const friendIds = await getAcceptedFriendIds();
    if (friendIds.length) {
      const { data: trainingFriends } = await supaClient.from('profiles')
        .select('username, training_status, training_since')
        .in('id', friendIds)
        .not('training_status', 'is', null)
        .limit(500);
      if (trainingFriends && trainingFriends.length) {
        trainingBanner = '<div style="background:rgba(52,199,89,0.08);border:1px solid rgba(52,199,89,0.2);border-radius:12px;padding:10px 14px;margin-bottom:12px;">' +
          trainingFriends.map(f => {
            const mins = Math.floor((Date.now() - new Date(f.training_since).getTime()) / 60000);
            return '<div style="font-size:12px;color:var(--green);padding:2px 0;">🟢 <strong>' + f.username + '</strong> s\'entraîne — ' + f.training_status + ' · depuis ' + mins + 'min</div>';
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
      return '<div style="margin-bottom:10px;"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">' + exo.name + '</div>' +
        '<div style="font-size:11px;color:var(--sub);">' + (exo.sets || 0) + ' séries</div></div>';
    }
    var workSets = sets.filter(function(s) { return s.type !== 'warmup'; });
    var tonnage = sets.reduce(function(sum, s) { return sum + ((s.weight || 0) * (s.reps || 0)); }, 0);

    var html = '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">' + exo.name + '</div>';

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
    body = '🏋️ <strong>' + profile.username + '</strong> a terminé';
    if (d.title) body += ' <em>' + d.title + '</em>';
    const stats = [];
    if (d.exercise_count) stats.push(d.exercise_count + ' exos');
    if (d.volume) stats.push(Math.round(d.volume) + 'kg de tonnage');
    if (d.duration) stats.push(formatTime(d.duration));
    if (stats.length) body += ' · ' + stats.join(' · ');
    if (d.top_set) body += '<br><span style="color:var(--blue);font-size:12px;">Top set : ' + d.top_set + '</span>';
    if (d.edited) body += ' <span style="font-size:10px;color:var(--sub);font-style:italic;">(modifié)</span>';
    // Photos de séance
    if (d.photos && d.photos.length) {
      body += '<div style="display:flex;gap:4px;margin-top:8px;overflow-x:auto;">';
      d.photos.forEach(function(p) {
        var src = p.url || p.dataUrl || '';
        if (src) body += '<img src="' + src + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;" loading="lazy">';
      });
      body += '</div>';
    }
    if (d.exercises && d.exercises.length) {
      // Check if enriched data exists (allSets present on at least one exercise)
      const hasEnrichedData = d.exercises.some(e => e.allSets && e.allSets.length);
      if (hasEnrichedData) {
        detail = renderFeedSessionDetail(d.exercises);
      } else {
        // Fallback: basic display for old posts
        detail = d.exercises.map(e =>
          '<div class="exo-row"><span>' + e.name + '</span><span style="color:var(--blue);">' + (e.sets || 0) + ' séries</span></div>'
        ).join('');
      }
    }
  } else if (item.type === 'pr') {
    body = '🏆 <strong>' + profile.username + '</strong> nouveau PR !';
    body += ' <em>' + (d.exercise || '') + '</em> <strong style="color:var(--green);">' + (d.value || 0) + 'kg</strong>';
    if (d.delta && d.delta > 0) body += ' <span style="color:var(--green);">(+' + d.delta + 'kg)</span>';
    if (d.previous) body += '<br><span style="color:var(--sub);font-size:12px;">Ancien : ' + d.previous + 'kg</span>';
  } else if (item.type === 'goal') {
    body = '🎯 <strong>' + profile.username + '</strong> — Objectif atteint ! ' +
      (d.exercise || '') + ' ' + (d.value || 0) + 'kg' +
      (d.weeks ? ' (en ' + d.weeks + ' semaines)' : '');
  } else if (item.type === 'achievement') {
    body = '⭐ <strong>' + profile.username + '</strong> a débloqué <em>' + (d.badge || d.title || '') + '</em>';
  }

  return '<div class="feed-card' + (item.pinned ? ' pinned' : '') + '" id="feed-' + item.id + '">' +
    '<div class="feed-card-header">' +
      '<div class="feed-avatar" onclick="showProfileOverlay(\'' + item.user_id + '\')">' + initial + '</div>' +
      '<div class="feed-user-info">' +
        '<div class="feed-username" onclick="showProfileOverlay(\'' + item.user_id + '\')">' + profile.username + (typeof renderTierBadge==='function' && profile.tier ? ' '+renderTierBadge(profile.tier) : '') + '</div>' +
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
      (item.type === 'session' && d.exercises && d.exercises.length && !isMe ? '<button class="feed-action-btn" onclick="copyRoutineFromFeed(\'' + item.id + '\')">📋 Copier</button>' : '') +
    '</div>' +
    '<div class="feed-comments-section" id="feed-comments-' + item.id + '" style="display:none;"></div>' +
  '</div>';
}

function toggleFeedDetail(activityId) {
  const el = document.getElementById('feed-detail-' + activityId);
  if (el) el.classList.toggle('open');
}

// Copier la routine d'un ami depuis le feed
function copyRoutineFromFeed(activityId) {
  var feedItem = window._feedItems ? window._feedItems.find(function(i) { return i.id === activityId; }) : null;
  if (!feedItem || !feedItem.data || !feedItem.data.exercises) {
    showToast('Impossible de copier cette routine');
    return;
  }
  var exercises = feedItem.data.exercises;
  var title = feedItem.data.title || 'Routine copiée';
  if (!confirm('Copier "' + title + '" (' + exercises.length + ' exercices) dans tes routines ?')) return;

  // Sauvegarder comme routine personnalisée
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
  const section = document.getElementById('feed-comments-' + activityId);
  if (!section) return;
  const isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    await loadAndRenderComments(activityId);
  }
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
      const { data } = await supaClient.from('profiles').select('id, username').in('id', userIds).limit(500);
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
        '<div class="feed-comment-user">' + p.username + '</div>' +
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
    loadAndRenderComments(activityId);
  } catch (e) {
    console.error('deleteComment error:', e);
  }
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
async function publishSessionActivity(logEntry) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient || !db.social.onboardingCompleted) return;

  // Build top set string (best e1RM set)
  let topSet = '';
  let bestE1RM = 0;
  (logEntry.exercises || []).forEach(e => {
    if (e.maxRM && e.maxRM > bestE1RM) {
      bestE1RM = e.maxRM;
      topSet = e.name + ' ' + Math.round(e.maxRM) + 'kg';
    }
  });

  const sessionDate = logEntry.shortDate || logEntry.date || '';

  // Build enriched exercises with full sets detail
  const enrichedExercises = (logEntry.exercises || []).map(e => {
    const setsData = (e.allSets && e.allSets.length) ? e.allSets.map(s => ({
      weight: s.weight || 0,
      reps: s.reps || 0,
      type: s.setType === 'warmup' ? 'warmup' : s.setType === 'drop' ? 'drop' : s.setType === 'failure' || s.setType === 'abandon' ? 'failure' : 'work'
    })) : null;
    const totalVolume = setsData ? setsData.reduce((sum, s) => sum + (s.weight * s.reps), 0) : 0;
    return {
      name: e.name,
      sets: e.sets || (setsData ? setsData.length : 0),
      allSets: setsData,
      maxRM: e.maxRM || null,
      totalVolume: totalVolume
    };
  });

  // Photos (URLs seulement, pas les dataUrl qui seraient trop lourdes)
  var photoUrls = (logEntry.photos || []).filter(function(p) { return p.url; }).map(function(p) { return { url: p.url }; });

  await postToFeed('session', {
    title: logEntry.title || '',
    duration: logEntry.duration || 0,
    volume: logEntry.volume || 0,
    exercise_count: enrichedExercises.length,
    top_set: topSet,
    date: sessionDate,
    exercises: enrichedExercises,
    photos: photoUrls.length > 0 ? photoUrls : undefined
  }, { dedupKey: { date: sessionDate } });
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
        .order('value', { ascending: false })
        .limit(500);
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
      .order('value', { ascending: false })
      .limit(1000);

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
      const { data } = await supaClient.from('profiles').select('id, username').in('id', profileIds).limit(500);
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
          '<div class="lb-podium-name">' + entry.username + '</div>' +
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
        '<div class="lb-row-name" onclick="showProfileOverlay(\'' + entry.userId + '\')">' + entry.username + '</div>' +
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

  if (prData.length === 0) return;
  try {
    const rows = prData.map(pr => ({
      user_id: uid,
      exercise_name: pr.exercise_name,
      value: pr.value,
      snapshot_week: weekStr
    }));
    await supaClient.from('leaderboard_snapshots').upsert(rows, { onConflict: 'user_id,exercise_name,snapshot_week', ignoreDuplicates: false });
  } catch (e) {
    console.error('updateLeaderboardSnapshot error:', e);
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
  html += '<div><div style="font-weight:700;font-size:15px;color:var(--text);">' + (username || '—') + '</div>';
  html += '<div style="font-size:12px;color:var(--sub);margin-top:2px;">' + (bio || 'Aucune bio') + '</div></div>';
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

  // Load friend code
  const friendCode = await ensureFriendCode();
  const fcEl = document.getElementById('myFriendCode');
  if (fcEl) fcEl.textContent = friendCode || '---';

  // Load friendships
  const friends = await loadFriends();

  // Get all user IDs from friendships
  const allUserIds = new Set();
  friends.forEach(f => { allUserIds.add(f.requester_id); allUserIds.add(f.target_id); });
  allUserIds.delete(uid);

  let profiles = {};
  if (allUserIds.size) {
    try {
      const { data } = await supaClient.from('profiles').select('id, username, training_status, training_since').in('id', Array.from(allUserIds)).limit(500);
      (data || []).forEach(p => profiles[p.id] = p);
    } catch {}
  }

  // Pending requests (where I'm the target)
  const pending = friends.filter(f => f.status === 'pending' && f.target_id === uid);
  const pendingSection = document.getElementById('pendingRequestsSection');
  const pendingList = document.getElementById('pendingRequestsList');
  if (pending.length) {
    pendingSection.style.display = '';
    pendingList.innerHTML = pending.map(f => {
      const p = profiles[f.requester_id] || { username: 'Utilisateur' };
      return '<div class="friends-item">' +
        '<div class="friends-item-avatar" onclick="showProfileOverlay(\'' + f.requester_id + '\')">' + avatarInitial(p.username) + '</div>' +
        '<div class="friends-item-info"><div class="friends-item-name" onclick="showProfileOverlay(\'' + f.requester_id + '\')">' + p.username + '</div><div class="friends-item-status">Demande reçue</div></div>' +
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
        statusHtml = '<div style="color:var(--green);font-size:11px;font-weight:600;">🟢 S\'entraîne — ' + p.training_status + ' · depuis ' + minsSince + 'min</div>';
      } else {
        statusHtml = '<div class="friends-item-status" style="color:var(--sub);font-size:11px;">' + sinceText + '</div>';
      }
      return '<div class="friends-item">' +
        '<div class="friends-item-avatar" onclick="showProfileOverlay(\'' + friendId + '\')" style="position:relative;">' + avatarInitial(p.username) +
        (isTraining ? '<span style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:var(--green);border:2px solid var(--card);animation:pulse 2s infinite;"></span>' : '') +
        '</div>' +
        '<div class="friends-item-info"><div class="friends-item-name" onclick="showProfileOverlay(\'' + friendId + '\')">' + p.username + '</div>' +
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
        '<div class="friends-item-info"><div class="friends-item-name">' + p.username + '</div><div class="friends-item-status">Bloqué</div></div>' +
        '<div class="friends-item-actions">' +
          '<button class="friends-item-btn unblock" onclick="unblockUser(\'' + f.id + '\')">Débloquer</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } else {
    blockedSection.style.display = 'none';
  }

  // Notifications
  await renderNotifications();

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
    if (n.type === 'friend_accepted') text = '<strong>' + (d.username || 'Utilisateur') + '</strong> a accepté ta demande d\'ami';
    else if (n.type === 'reaction') text = '<strong>' + (d.username || 'Utilisateur') + '</strong> a réagi ' + (d.emoji || '') + ' à ton post';
    else if (n.type === 'comment') text = '<strong>' + (d.username || 'Utilisateur') + '</strong> a commenté : "' + (d.text || '') + '"';
    else if (n.type === 'pr_beaten') text = '<strong>' + (d.username || 'Utilisateur') + '</strong> a battu ton PR ' + (d.exercise || '') + ' avec ' + (d.value || 0) + 'kg !';

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
    _notifCache.forEach(n => n.read = true);
    renderNotifications();
    updateSocialBadge();
  } catch (e) {
    console.error('markAllNotifsRead error:', e);
  }
}

async function updateSocialBadge() {
  const notifs = _notifCache.length ? _notifCache : await loadNotifications();
  const unreadCount = notifs.filter(n => !n.read).length;
  const badge = document.getElementById('socialTabBadge');
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }
}

// ============================================================
// SOCIAL MODULE — PROFILE OVERLAY
// ============================================================
async function showProfileOverlay(userId) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  const overlay = document.getElementById('profileOverlay');

  overlay.style.display = '';
  overlay.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sub);">Chargement...</div>';

  try {
    const { data: profile, error: profileErr } = await supaClient.from('profiles')
      .select('id, username, bio, visibility_bio, visibility_prs, visibility_programme, visibility_seances, visibility_stats')
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
    html += '<div class="profile-username">' + profile.username + '</div>';
    if (canSeeBio && profile.bio) html += '<div class="profile-bio">' + escapeHtml(profile.bio) + '</div>';
    else if (!canSeeBio) html += '<div class="profile-bio" style="font-style:italic;color:var(--sub);">Bio privée</div>';
    html += '</div>';

    // Action buttons
    if (!isMe) {
      html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
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
      // Compare button (only for accepted friends)
      if (isFriend) {
        html += '<div style="margin-bottom:16px;"><button class="btn" style="background:linear-gradient(135deg,rgba(255,149,0,0.15),rgba(255,59,48,0.15));border:1px solid rgba(255,149,0,0.3);color:var(--orange,#ff9500);font-size:13px;font-weight:700;" onclick="showComparisonView(\'' + userId + '\')">⚔️ Comparer</button></div>';
      }
    }

    // PRs section
    html += '<div class="profile-section"><div class="card"><div class="profile-section-title">PRs / Exercices clés</div>';
    if (canSeePrs) {
      // Show leaderboard snapshots for this user
      const { data: snapshots } = await supaClient.from('leaderboard_snapshots')
        .select('exercise_name, value')
        .eq('user_id', userId)
        .order('value', { ascending: false })
        .limit(100);
      if (snapshots && snapshots.length) {
        const best = {};
        snapshots.forEach(s => { if (!best[s.exercise_name] || s.value > best[s.exercise_name]) best[s.exercise_name] = s.value; });
        html += Object.entries(best).map(([name, val]) =>
          '<div class="stat-row"><span style="font-size:13px;">' + name + '</span><span style="font-weight:700;color:var(--blue);">' + Math.round(val) + 'kg</span></div>'
        ).join('');
      } else {
        html += '<div style="color:var(--sub);font-size:13px;text-align:center;padding:12px;">Aucun PR enregistré</div>';
      }
    } else {
      html += '<div class="profile-private">🔒 Section privée</div>';
    }
    html += '</div></div>';

    // Stats section
    html += '<div class="profile-section"><div class="card"><div class="profile-section-title">Stats</div>';
    if (canSeeStats) {
      const { data: activities } = await supaClient.from('activity_feed')
        .select('type, created_at')
        .eq('user_id', userId)
        .eq('type', 'session')
        .order('created_at', { ascending: false })
        .limit(100);
      const totalSessions = activities ? activities.length : 0;
      html += '<div class="stat-row"><span>Séances</span><span style="font-weight:700;">' + totalSessions + '</span></div>';
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
    const { data: friendProfile } = await supaClient.from('profiles')
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
        .order('value', { ascending: false })
        .limit(100);
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
    html += '<div style="text-align:center;"><div style="width:44px;height:44px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;margin:0 auto;">' + avatarInitial(myUsername) + '</div><div style="font-size:12px;font-weight:700;margin-top:4px;">' + myUsername + '</div></div>';
    html += '<div style="font-size:18px;font-weight:800;color:var(--sub);">VS</div>';
    html += '<div style="text-align:center;"><div style="width:44px;height:44px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;margin:0 auto;">' + avatarInitial(friendProfile.username) + '</div><div style="font-size:12px;font-weight:700;margin-top:4px;">' + friendProfile.username + '</div></div>';
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
function showSocialOnboarding() {
  document.getElementById('social-onboarding-overlay').style.display = '';
  // Pre-fill with user name if available
  const nameInput = document.getElementById('sob-username');
  if (db.user.name && !nameInput.value) {
    nameInput.value = db.user.name.toLowerCase().replace(/\s+/g, '_');
  }
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
      const { data: existing } = await supaClient.from('profiles').select('id').eq('username', username).maybeSingle();
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
      '<p style="font-size:16px;font-weight:700;margin:0 0 6px;text-align:center;">Supprimer le compte social</p>' +
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
    showToast('Compte social supprimé');
    initSocialTab();
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
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) allChallenges = data;
    }
    // Also get friend-created challenges not yet joined
    if (friendIds.length) {
      const { data } = await supaClient.from('social_challenges')
        .select('*')
        .in('creator_id', friendIds)
        .order('created_at', { ascending: false })
        .limit(100);
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
      .order('created_at', { ascending: false })
      .limit(100);
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
        .in('challenge_id', allChIds)
        .limit(1000);
      allParticipants = data || [];
    }

    // Load profiles for all involved users
    const involvedIds = new Set();
    allChallenges.forEach(c => involvedIds.add(c.creator_id));
    allParticipants.forEach(p => involvedIds.add(p.user_id));
    let profiles = {};
    if (involvedIds.size) {
      const { data } = await supaClient.from('profiles').select('id, username').in('id', Array.from(involvedIds)).limit(500);
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
  html += '<div style="font-weight:700;font-size:14px;">' + t.icon + ' ' + (challenge.title || t.label) + '</div>';
  html += '<span style="font-size:10px;padding:3px 8px;border-radius:10px;background:' + (isFinished ? 'rgba(255,255,255,0.05)' : 'rgba(10,132,255,0.1)') + ';color:' + (isFinished ? 'var(--sub)' : 'var(--blue)') + ';">' + (isFinished ? 'Terminé' : daysLeft + 'j restants') + '</span>';
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--sub);margin-bottom:10px;">par ' + creator.username + (challenge.target_exercise ? ' · ' + challenge.target_exercise : '') + '</div>';
  if (challenge.description) html += '<div style="font-size:12px;color:var(--sub);margin-bottom:8px;">' + challenge.description + '</div>';

  // Participants + progress
  if (sorted.length) {
    sorted.forEach((p, i) => {
      const prof = profiles[p.user_id] || { username: '?' };
      const val = p.current_value || 0;
      const pct = challenge.target_value ? Math.min(100, (val / challenge.target_value) * 100) : 0;
      const isMe = p.user_id === uid;
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;' + (isMe ? 'background:rgba(10,132,255,0.05);padding:4px 6px;border-radius:8px;' : '') + '">';
      html += '<span style="font-size:11px;font-weight:700;width:18px;color:' + (i === 0 && !isFinished ? 'var(--green)' : 'var(--sub)') + ';">' + (i + 1) + '.</span>';
      html += '<span style="font-size:12px;font-weight:' + (isMe ? '700' : '500') + ';flex:1;">' + prof.username + '</span>';
      html += '<span style="font-size:12px;font-weight:700;color:var(--blue);">' + Math.round(val) + (t.unit ? ' ' + t.unit : '') + '</span>';
      if (challenge.target_value) {
        html += '<div style="width:60px;height:4px;background:var(--border);border-radius:2px;"><div style="height:4px;background:var(--blue);border-radius:2px;width:' + pct + '%;"></div></div>';
      }
      html += '</div>';
    });
  } else {
    html += '<div style="font-size:12px;color:var(--sub);text-align:center;padding:8px;">Aucun participant</div>';
  }

  // Actions
  if (!isFinished) {
    html += '<div style="display:flex;gap:8px;margin-top:10px;">';
    if (!isParticipant) {
      html += '<button class="btn" style="font-size:12px;padding:8px 16px;" onclick="joinChallenge(\'' + challenge.id + '\')">Rejoindre</button>';
    } else {
      html += '<button class="btn" style="font-size:12px;padding:8px 16px;background:var(--surface);border:1px solid var(--border);color:var(--text);" onclick="showUpdateChallengeProgress(\'' + challenge.id + '\')">📝 Mettre à jour</button>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function showCreateChallengeModal() {
  // Remove existing modal if any
  const existing = document.getElementById('challengeModalSheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'challengeModalSheet';
  sheet.className = 'go-bottom-sheet';
  sheet.style.display = '';
  sheet.innerHTML =
    '<div class="go-bottom-sheet-overlay" onclick="document.getElementById(\'challengeModalSheet\').remove()"></div>' +
    '<div class="go-bottom-sheet-content" style="max-height:80vh;overflow-y:auto;">' +
      '<div class="go-bottom-sheet-handle"></div>' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:14px;text-align:center;">Créer un défi</div>' +
      '<div style="margin-bottom:12px;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">Titre</div>' +
        '<input type="text" id="chalTitle" placeholder="Mon défi..." maxlength="60" style="margin-bottom:0;">' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">Type</div>' +
        '<select id="chalType" style="margin-bottom:0;">' +
          '<option value="volume">📊 Volume (tonnage)</option>' +
          '<option value="reps">💪 Reps</option>' +
          '<option value="weight">🏋️ Charge max (e1RM)</option>' +
          '<option value="frequency">🔥 Nb séances</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">Exercice ciblé (optionnel)</div>' +
        '<input type="text" id="chalExercise" placeholder="Ex: Bench Press" maxlength="50" style="margin-bottom:0;">' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">Objectif</div>' +
        '<input type="number" id="chalTarget" placeholder="Ex: 100" style="margin-bottom:0;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;margin-bottom:4px;">Durée</div>' +
        '<select id="chalDuration" style="margin-bottom:0;">' +
          '<option value="3">3 jours</option>' +
          '<option value="7" selected>1 semaine</option>' +
          '<option value="14">2 semaines</option>' +
          '<option value="30">1 mois</option>' +
        '</select>' +
      '</div>' +
      '<button class="btn" style="background:linear-gradient(135deg,var(--orange,#ff9500),var(--red,#ff3b30));border:none;font-size:14px;" onclick="createChallenge()">Lancer 🚀</button>' +
    '</div>';
  document.body.appendChild(sheet);
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

async function joinChallenge(challengeId) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  try {
    await supaClient.from('challenge_participants').insert({
      challenge_id: challengeId,
      user_id: uid,
      current_value: 0
    });
    showToast('Tu as rejoint le défi !');
    renderChallengesTab();
  } catch (e) {
    console.error('joinChallenge error:', e);
    showToast('Erreur');
  }
}

function showUpdateChallengeProgress(challengeId) {
  const existing = document.getElementById('chalUpdateSheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'chalUpdateSheet';
  sheet.className = 'go-bottom-sheet';
  sheet.style.display = '';
  sheet.innerHTML =
    '<div class="go-bottom-sheet-overlay" onclick="document.getElementById(\'chalUpdateSheet\').remove()"></div>' +
    '<div class="go-bottom-sheet-content">' +
      '<div class="go-bottom-sheet-handle"></div>' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:14px;text-align:center;">Mettre à jour ta progression</div>' +
      '<input type="number" id="chalUpdateValue" placeholder="Nouvelle valeur" style="margin-bottom:12px;text-align:center;font-size:18px;">' +
      '<button class="btn" onclick="updateSocialChallengeProgress(\'' + challengeId + '\')">Enregistrer</button>' +
    '</div>';
  document.body.appendChild(sheet);
}

async function updateSocialChallengeProgress(challengeId) {
  const uid = await getMyUserIdAsync();
  if (!uid || !supaClient) return;
  const val = parseFloat(document.getElementById('chalUpdateValue').value);
  if (isNaN(val)) { showToast('Entre une valeur'); return; }
  try {
    await supaClient.from('challenge_participants').update({
      current_value: val
    }).eq('challenge_id', challengeId).eq('user_id', uid);

    const sheet = document.getElementById('chalUpdateSheet');
    if (sheet) sheet.remove();
    showToast('Progression mise à jour !');
    renderChallengesTab();
  } catch (e) {
    console.error('updateSocialChallengeProgress error:', e);
    showToast('Erreur');
  }
}

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
async function keepAlive() {
  if (!supaClient || !cloudSyncEnabled) return;
  await safeSupabaseCall(async function() {
    var { data: { user } } = await supaClient.auth.getUser();
    if (user) {
      await supaClient.from('sbd_profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }
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
