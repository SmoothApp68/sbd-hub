/**
 * Harnais d'audit runtime — SBD Hub / TrainHub.
 * OUTIL D'AUDIT. Ne fait partie d'aucun chemin applicatif. Ne rien importer d'ici dans js/.
 *
 * Rôle : servir l'app en statique, lancer Chromium, STUBBER tout le réseau externe
 * (Supabase compris — les vraies données ne doivent JAMAIS être touchées), injecter un
 * profil de test dans localStorage AVANT le boot, et rendre la page prête à inspecter.
 *
 * Réseau : tout ce qui n'est pas 127.0.0.1 est intercepté. Supabase (auth, rest, functions)
 * reçoit des réponses synthétiques ; aucune requête ne sort.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ── Session synthétique ──────────────────────────────────────────────────────
// Le vrai projet Supabase est `swwygywahfdenyzotrce` (index.html). supabase-js lit
// sa session dans localStorage sous `sb-<ref>-auth-token` ; en la semant, getSession()
// réussit SANS aucun appel réseau et l'app se comporte comme pour un compte connecté
// (sinon l'écran de login s'ouvre par-dessus et parasite l'audit).
const SUPA_REF = 'swwygywahfdenyzotrce';
const STUB_USER = {
  id: '00000000-0000-4000-8000-0000000000aa',
  aud: 'authenticated', role: 'authenticated',
  email: 'audit-runtime@local.invalid',
  app_metadata: { provider: 'email' }, user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
function stubSession(user) {
  return {
    access_token: 'stub-access-token', token_type: 'bearer', refresh_token: 'stub-refresh',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user || STUB_USER,
  };
}
function authTokenKey() { return 'sb-' + SUPA_REF + '-auth-token'; }

// ── Stub réseau ──────────────────────────────────────────────────────────────
// Aucune requête ne sort. Supabase reçoit des réponses vides mais bien formées, pour
// que le code de sync suive son chemin normal sans jamais atteindre la vraie base.
async function stubNetwork(context, opts) {
  opts = opts || {};
  const calls = [];
  // En mode anonyme, signInAnonymously() doit rendre un utilisateur SANS email —
  // sinon l'app croit à un compte email et masque le bloc de connexion des Réglages.
  const userFor = () => (opts.anonymous
    ? Object.assign({}, STUB_USER, { email: undefined, is_anonymous: true })
    : STUB_USER);
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1')) return route.continue();
    calls.push({ url, method: route.request().method() });

    if (url.includes('supabase.co') || url.includes('/functions/v1/')) {
      if (url.includes('/auth/v1/user')) {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(userFor()) });
      }
      if (url.includes('/auth/v1/')) {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(stubSession(userFor())) });
      }
      // REST : tableau vide = « aucune ligne cloud » → l'app garde le blob local.
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // Sentry, images d'exercices, tout le reste : coupé net.
    return route.fulfill({ status: 204, body: '' });
  });
  return calls;
}

/**
 * Ouvre l'app avec `dbBlob` déjà persisté sous SBD_HUB_V29.
 * serviceWorkers: 'block' → pas de cache SW qui masquerait une modification de source.
 */
async function openApp(dbBlob, opts) {
  opts = opts || {};
  // RC4 — anti-fuite inter-comptes : si l'uid de la session ne correspond pas au
  // `ownerUid` du blob local, l'app remplace le blob (comportement VOULU). Sans
  // tatouage, tout profil semé serait donc réinitialisé au boot et l'audit
  // observerait defaultDB au lieu du profil demandé. On tatoue pour rester fidèle
  // à « un utilisateur connecté qui rouvre SON app ».
  if (dbBlob && dbBlob.user && !opts.anonymous && opts.stampOwner !== false) {
    dbBlob.user.ownerUid = STUB_USER.id;
  }
  const { server, port } = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const netCalls = await stubNetwork(context, opts);
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

  // Semer AVANT tout script de la page.
  // ⚠️ addInitScript s'exécute à CHAQUE navigation, rechargement compris. Sans la
  // sentinelle, un page.reload() ré-écraserait le db par le blob d'origine et tout
  // test d'aller-retour échouerait pour une raison qui n'appartient pas à l'app.
  await context.addInitScript(({ blob, extraKeys, authKey, session }) => {
    try {
      if (localStorage.getItem('__audit_seeded__')) return;  // déjà semé : ne rien toucher
      localStorage.clear();
      localStorage.setItem('__audit_seeded__', '1');
      if (blob) localStorage.setItem('SBD_HUB_V29', JSON.stringify(blob));
      if (session) localStorage.setItem(authKey, JSON.stringify(session));
      Object.keys(extraKeys || {}).forEach((k) => localStorage.setItem(k, extraKeys[k]));
    } catch (e) { /* ignore */ }
  }, {
    blob: dbBlob, extraKeys: opts.extraKeys || {}, authKey: authTokenKey(),
    session: opts.anonymous ? null : stubSession(),
  });

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
  // L'app boote en différé (defer + setTimeout 0 de restoreTab) : attendre que db existe.
  // `db` est un `let` de portée lexicale globale (app.js:108) — PAS une propriété de window.
  // `typeof window.db` vaut donc 'undefined' alors que l'identifiant nu est bien résolu.
  await page.waitForFunction('typeof db !== "undefined" && db !== null', null, { timeout: 20000 });
  await page.waitForTimeout(opts.settleMs || 900);

  return {
    page, browser, context, errors, netCalls,
    close: async () => { await browser.close(); server.close(); },
  };
}

/** Va sur l'onglet Profil puis le sous-onglet demandé, en passant par les VRAIS clics quand possible. */
async function gotoProfil(page, sub) {
  await page.evaluate(() => { if (typeof showTab === 'function') showTab('tab-profil'); });
  await page.waitForTimeout(250);
  if (sub) {
    await page.evaluate((s) => { if (typeof showProfilSub === 'function') showProfilSub(s); }, sub);
    await page.waitForTimeout(400);
  }
}

/** Ouvre tous les accordéons (les corps sont en max-height:0 tant qu'ils sont fermés). */
async function openAllAccordions(page) {
  await page.evaluate(() => {
    ['ca-forme','ca-load','ca-heatmap','ca-joints','ca-poids','ca-nutri','ca-force','ca-coach']
      .forEach((id) => { const el = document.getElementById(id);
        if (el && !el.classList.contains('open') && typeof toggleCorpsAcc === 'function') toggleCorpsAcc(id); });
    ['acc-profil','acc-keylifts','acc-prog','acc-import','acc-cloud','acc-backup','acc-records',
     'acc-glossary','acc-tier','acc-notif','acc-danger']
      .forEach((id) => { const el = document.getElementById(id);
        if (el && !el.classList.contains('open') && typeof toggleAcc === 'function') toggleAcc(id); });
  });
  await page.waitForTimeout(600);
}

/** Lit le db persisté (localStorage), pas l'objet en mémoire — c'est ce qui survit au reload. */
async function readPersisted(page) {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('SBD_HUB_V29') || 'null'); } catch (e) { return null; }
  });
}

function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

module.exports = { startServer, openApp, gotoProfil, openAllAccordions, readPersisted, get, ROOT };
