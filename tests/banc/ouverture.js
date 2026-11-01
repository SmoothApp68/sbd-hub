#!/usr/bin/env node
//
// tests/banc/ouverture.js — 203 : MESURER l'ouverture de l'app avant de la changer.
//
// A = `v2/` brut (ce que Cloudflare sert aujourd'hui). B = une copie temporaire dont js/*.js et styles.css sont
// minifiés par esbuild (`minify`, sans `mangleProps` : les API `THxxx.*` se lisent entre fichiers par leur nom ;
// ni vendor/ ni service-worker.js), puis estampée (`estamper-sw.js` sur la copie, APRÈS la minification : le
// numéro de cache porte sur les octets servis). Rien dans `v2/` ne change ; esbuild est une devDependency.
//
// Les deux racines sont servies par `serveur-pages.js` (qui imite Cloudflare) avec gzip — sans compression, la
// mesure mentirait : la minification gagnerait ×3-4 de plus sur le réseau qu'en vrai. Conditions : processeur
// ×4 (CDP `Emulation.setCPUThrottlingRate`, comme `charge-ralentir.js`), réseau 4G (150 ms, ~1,6 Mbit/s), faux
// Supabase, session factice. Deux scénarios : PREMIÈRE VISITE (contexte neuf, cache vide) et RECHARGEMENT avec
// service worker installé. Mesures, toutes lues depuis le banc (l'app n'est pas instrumentée) :
//   · premier rendu (first-contentful-paint) ;
//   · apparition de l'accueil (`performance.mark` posé par un observateur injecté, quand `#vue-liste` n'est
//     plus caché et porte du texte) ;
//   · temps de script (CDP `Performance.getMetrics` : ScriptDuration, TaskDuration) à cet instant ;
//   · octets transférés (CDP `encodedDataLength` de la page jusqu'à l'accueil ; total envoyé par le serveur,
//     service worker compris, une fois l'installation finie).
// N passages alternés (A,B puis B,A…), médiane et min-max.
//
// CONTRÔLE DE SORTIE (même banc) : la copie B expose les mêmes `TH*` avec les mêmes clés que A, et
// `tests/banc/sw-navigation.js` passe sur B (BANC_RACINE).
//
//   node tests/banc/ouverture.js [--passages 7] [--sans-sw-navigation] [--json fichier] [--ralenti 4]

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
// 59-4 — tout navigateur de test passe par la garde réseau (aucune requête vers la vraie base).
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const Verrou = require(path.join(R, 'tests/banc/verrou.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const arg = (nom, defaut) => { const i = process.argv.indexOf('--' + nom); return i >= 0 ? process.argv[i + 1] : defaut; };
const PASSAGES = Number(arg('passages', 7));
const RALENTI = Number(arg('ralenti', 4));
const SORTIE_JSON = arg('json', null);
const SANS_SW_NAV = process.argv.indexOf('--sans-sw-navigation') >= 0;

let echecs = 0;
function verifier(nom, condition, detail) {
  const ok = !!condition;
  if (!ok) echecs++;
  console.log('   ' + (ok ? '✅' : '❌') + ' ' + nom + (detail ? '  — ' + detail : ''));
  return ok;
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── B : la copie minifiée puis estampée ─────────────────────────────────────────────────────────────────────
function fabriquerB() {
  const esbuild = require(path.join(R, 'node_modules/esbuild'));
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ouverture-B-'));
  fs.cpSync(path.join(R, 'v2'), dossier, { recursive: true });
  const bilan = { fichiers: 0, avant: 0, apres: 0 };
  const passer = (fichier, loader) => {
    const src = fs.readFileSync(fichier, 'utf8');
    const out = esbuild.transformSync(src, { minify: true, loader: loader, legalComments: 'none', target: 'es2020' }).code;
    fs.writeFileSync(fichier, out);
    bilan.fichiers++; bilan.avant += Buffer.byteLength(src); bilan.apres += Buffer.byteLength(out);
  };
  for (const f of fs.readdirSync(path.join(dossier, 'js'))) if (/\.js$/.test(f)) passer(path.join(dossier, 'js', f), 'js');
  passer(path.join(dossier, 'styles.css'), 'css');
  // L'estampage vient APRÈS la minification : le numéro de cache porte sur les octets réellement servis.
  const r = cp.spawnSync(process.execPath, [path.join(R, 'v2-atelier/outils/estamper-sw.js'), dossier], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('estamper-sw a échoué sur la copie : ' + (r.stderr || r.stdout));
  return { dossier: dossier, bilan: bilan };
}

// ── un faux Supabase minimal : profil prêt, un historique modeste ───────────────────────────────────────────
function historique() {
  let x = 203;
  const alea = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const uuid = (pref, n) => pref + '-0000-4000-8000-' + String(n).padStart(12, '0');
  const exos = [];
  for (let i = 0; i < 60; i++) exos.push({ slug: 'exo-' + i, nom: 'Exercice ' + i, mesure: 'charge_reps', charge: 'externe',
    parent: null, equipement: i % 2 ? 'haltere' : 'barre', muscles_primaires: ['m' + (i % 12)], muscles_secondaires: [],
    mouvement: null, barre_charge_fixe: false });
  const seances = [], series = [];
  let n = 0;
  const debut0 = Date.now() - 150 * 86400000;
  for (let k = 0; k < 120; k++) {
    const id = uuid('5e55e000', k);
    const debut = new Date(debut0 + k * 1.2 * 86400000).toISOString();
    seances.push({ id: id, user_id: 'u-mesure', titre: 'Séance ' + k, debut: debut,
      fin: new Date(Date.parse(debut) + 70 * 60000).toISOString(), statut: 'terminee', note: null, salle: null,
      routine_id: null, source: 'hevy', created_at: debut });
    let rang = 0;
    for (let e = 0; e < 6; e++) {
      const ex = exos[(k * 3 + e * 7) % exos.length];
      for (let s = 0; s < 3; s++) series.push({ id: uuid('5e7e0000', n++), session_id: id, user_id: 'u-mesure',
        exercise_slug: ex.slug, charge_kg: 40 + Math.round(alea() * 20) * 2.5, reps: 5 + Math.floor(alea() * 6),
        duree_s: null, distance_m: null, type_serie: 'travail', rang: ++rang, groupe_superset: null, validee_a: null,
        rpe: null, ressenti: null, repos_s: null, note: null, source: 'hevy', created_at: debut, modifie_a: null,
        tempo: null, elastique: null, douleur: null, occurrence: null });
    }
  }
  return { exos: exos, seances: seances, series: series };
}
const H = historique();

async function brancherFauxServeur(ctx) {
  await ctx.route(/supabase\.co/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop();
    const json = (data, status) => route.fulfill({ status: status || 200, contentType: 'application/json',
      body: JSON.stringify(/vnd\.pgrst\.object/.test(req.headers()['accept'] || '') && Array.isArray(data) ? data[0] : data) });
    if (url.pathname.startsWith('/auth/')) return json({ error: 'x' }, 400);
    if (/count=exact/.test(req.headers()['prefer'] || '')) {
      const n = table === 'sessions' ? H.seances.length : table === 'sets' ? H.series.length : 0;
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json',
        'content-range': '0-' + Math.max(0, n - 1) + '/' + n, 'access-control-expose-headers': 'content-range, content-length' }, body: '' });
    }
    if (req.method() !== 'GET') return json([], 201);
    const pagine = (liste, cle) => {
      let l = liste;
      const gt = url.searchParams.get(cle) || '';
      if (gt.startsWith('gt.')) l = l.filter((x) => String(x[cle]) > gt.slice(3));
      l = l.slice().sort((a, b) => String(a[cle]).localeCompare(String(b[cle])));
      const lim = Number(url.searchParams.get('limit') || 0);
      return lim ? l.slice(0, lim) : l;
    };
    if (table === 'sessions') return /statut=eq\.en_cours/.test(url.search) ? json([]) : json(pagine(H.seances, 'id'));
    if (table === 'sets') return json(pagine(H.series, 'id'));
    if (table === 'exercises') return json(pagine(H.exos, 'slug'));
    if (table === 'profiles') return json([{ id: 'u-mesure', username: 'mesure', onboarding_completed: true,
      intention: 'progresser', rythme_progression: 'normal', questionnaire_fait_le: '2026-10-01T08:00:00.000Z' }]);
    return json([]);
  });
}

// Injecté AVANT tout script de la page : la session factice, et l'observateur qui pose la marque « accueil ».
function initialiser() {
  const JETON = JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800,
    token_type: 'bearer', user: { id: 'u-mesure', email: 'mesure@test' } });
  try { localStorage.setItem('th-v2-auth', JETON); } catch (e) { /* pas de stockage */ }
  const vraiRemove = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vraiRemove.call(this, c); };
  const verifier = () => {
    const s = document.getElementById('vue-liste');
    if (s && !s.hidden && (s.textContent || '').trim().length > 40) {
      performance.mark('accueil');
      window.__accueil = performance.now();
      return true;
    }
    return false;
  };
  const obs = new MutationObserver(() => { if (verifier()) obs.disconnect(); });
  obs.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'], characterData: true });
}

async function ouvrirContexte(nav) {
  const ctx = await nav.newContext({ viewport: { width: 360, height: 760 } });
  await ctx.addInitScript(initialiser);
  await brancherFauxServeur(ctx);
  return ctx;
}

async function freiner(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RALENTI });
  await cdp.send('Network.enable');
  // 4G : ≈ 1,6 Mbit/s descendant, 150 ms d'aller-retour, 750 kbit/s montant.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
    downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Performance.enable');
  const bilan = { octets: 0 };
  cdp.on('Network.loadingFinished', (e) => { bilan.octets += e.encodedDataLength || 0; });
  return { cdp: cdp, bilan: bilan };
}

// L'installation du service worker est FINIE : actif, activé, rien en installation ni en attente, et il contrôle la
// page. On interroge depuis le banc (une fonction asynchrone dans waitForFunction rendrait une promesse, toujours vraie).
async function swPose(page) {
  const fin = Date.now() + Number(process.env.OUVERTURE_SW_MS || 90000);
  while (Date.now() < fin) {
    const ok = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return !!r && !!r.active && r.active.state === 'activated' && !r.installing && !r.waiting && !!navigator.serviceWorker.controller;
    }).catch(() => false);
    if (ok) return true;
    await attendre(200);
  }
  return false;
}

// Lit les mesures une fois la marque « accueil » posée.
async function lire(page, sonde) {
  await page.waitForFunction(() => typeof window.__accueil === 'number', null, { timeout: 90000, polling: 50 });
  const m = await sonde.cdp.send('Performance.getMetrics');
  const metr = {}; m.metrics.forEach((x) => { metr[x.name] = x.value; });
  const octetsAccueil = sonde.bilan.octets;
  const web = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = performance.getEntriesByType('paint').filter((p) => p.name === 'first-contentful-paint')[0];
    return { fcp: fcp ? fcp.startTime : null, accueil: window.__accueil, dcl: nav.domContentLoadedEventEnd || null,
      load: nav.loadEventEnd || null, scripts: performance.getEntriesByType('resource').length };
  });
  return { fcp: web.fcp, accueil: web.accueil, dcl: web.dcl, load: web.load,
    script: (metr.ScriptDuration || 0) * 1000, taches: (metr.TaskDuration || 0) * 1000, octetsPage: octetsAccueil };
}

async function passage(nav, variante, base, scenario) {
  const ctx = await ouvrirContexte(nav);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 120)));
  const sonde = await freiner(ctx, page);
  try {
    if (scenario === 'froid') {
      const avant = variante.serveur.octetsEnvoyes();
      await page.goto(base + '/', { waitUntil: 'commit' });
      const m = await lire(page, sonde);
      if (!(await swPose(page))) throw new Error('le service worker ne s\'est pas installé (' + variante.nom + ')');
      m.octetsServeur = variante.serveur.octetsEnvoyes() - avant;   // la page + l'installation du service worker
      m.erreurs = erreurs.length;
      return m;
    }
    // Rechargement SW chaud : on installe d'abord, puis on mesure LE rechargement.
    await page.goto(base + '/', { waitUntil: 'load' });
    if (!(await swPose(page))) throw new Error('le service worker ne s\'est pas installé (' + variante.nom + ')');
    await page.waitForFunction(() => typeof window.__accueil === 'number', null, { timeout: 90000 });
    const controle = await page.evaluate(() => !!navigator.serviceWorker.controller);
    if (process.env.OUVERTURE_DEBUG) console.error('SW controle=' + controle + ' ' + variante.nom + ' ' + JSON.stringify(await page.evaluate(async () => { const g = await navigator.serviceWorker.getRegistration(); return g ? [g.installing && g.installing.state, g.waiting && g.waiting.state, g.active && g.active.state] : null; })));
    sonde.bilan.octets = 0;
    const avant = variante.serveur.octetsEnvoyes();
    await page.reload({ waitUntil: 'commit' });
    // L'ancienne marque est partie avec l'ancien document ; la nouvelle vient de l'observateur.
    const m = await lire(page, sonde);
    await attendre(300);
    m.octetsServeur = variante.serveur.octetsEnvoyes() - avant;
    m.erreurs = erreurs.length;
    return m;
  } finally { await ctx.close(); }
}

const mediane = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const stats = (a) => ({ med: mediane(a), min: Math.min.apply(null, a), max: Math.max.apply(null, a) });

// Les TH* d'une page : nom → clés triées (ou type).
const surfaceTH = (page) => page.evaluate(() => {
  const sortie = {};
  Object.getOwnPropertyNames(window).filter((n) => /^TH[A-Za-z0-9_]*$/.test(n)).forEach((n) => {
    const v = window[n];
    sortie[n] = (v && (typeof v === 'object' || typeof v === 'function'))
      ? Object.keys(v).sort().map((k) => k + ':' + typeof v[k]) : [typeof v];
  });
  return sortie;
});

async function surfaces(nav, variantes) {
  const out = {};
  for (const v of variantes) {
    const ctx = await ouvrirContexte(nav);
    const page = await ctx.newPage();
    await page.goto(v.base + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.__accueil === 'number', null, { timeout: 90000 });
    out[v.nom] = await surfaceTH(page);
    await ctx.close();
  }
  return out;
}

(async () => {
  const rendre = await Verrou.prendre();
  const B = fabriquerB();
  const variantes = [];
  let nav = null;
  try {
    for (const [nom, racine] of [['A', path.join(R, 'v2')], ['B', B.dossier]]) {
      const serveur = creer({ racine: racine, gzip: true });
      const port = await Verrou.ecouter(serveur, 0);
      variantes.push({ nom: nom, racine: racine, serveur: serveur, base: 'http://127.0.0.1:' + port });
    }
    console.log('B : ' + B.bilan.fichiers + ' fichiers minifiés, ' + (B.bilan.avant / 1024).toFixed(0) + ' ko -> ' +
      (B.bilan.apres / 1024).toFixed(0) + ' ko (avant gzip) ; processeur ×' + RALENTI + ', 4G, ' + PASSAGES + ' passages alternés');
    nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });

    // ── Contrôle de sortie : les mêmes THxxx, les mêmes clés ──
    console.log('\n══ CONTRÔLE DE SORTIE ══');
    const surf = await surfaces(nav, variantes);
    const nomsA = Object.keys(surf.A).sort(), nomsB = Object.keys(surf.B).sort();
    verifier('A expose des THxxx (' + nomsA.length + ')', nomsA.length >= 30, nomsA.length + ' globaux');
    verifier('B expose les mêmes THxxx que A', JSON.stringify(nomsA) === JSON.stringify(nomsB),
      JSON.stringify(nomsA.filter((n) => nomsB.indexOf(n) < 0)) + JSON.stringify(nomsB.filter((n) => nomsA.indexOf(n) < 0)));
    const diff = nomsA.filter((n) => JSON.stringify(surf.A[n]) !== JSON.stringify(surf.B[n]));
    verifier('chaque THxxx de B porte les mêmes clés (et types) que celui de A', diff.length === 0, diff.join(', '));
    const sw = fs.readFileSync(path.join(B.dossier, 'service-worker.js'), 'utf8');
    verifier('B : CACHE_V2 estampé (trainhub-v2-<10 hex>)', /const CACHE_V2 = 'trainhub-v2-[0-9a-f]{10}';/.test(sw));
    verifier('B : le service worker n\'est pas minifié', sw === fs.readFileSync(path.join(R, 'v2/service-worker.js'), 'utf8').replace(/const CACHE_V2 = '[^']*';/, /const CACHE_V2 = '[^']*';/.exec(sw)[0]));

    // ── La mesure ──
    const res = { froid: { A: [], B: [] }, chaud: { A: [], B: [] } };
    for (const scenario of ['froid', 'chaud']) {
      for (let i = 0; i < PASSAGES; i++) {
        const ordre = i % 2 ? [variantes[1], variantes[0]] : [variantes[0], variantes[1]];
        for (const v of ordre) {
          res[scenario][v.nom].push(await passage(nav, v, v.base, scenario));
        }
        process.stderr.write('.');
      }
      process.stderr.write(' ' + scenario + '\n');
    }

    const champs = [['fcp', 'premier rendu (FCP)', 'ms'], ['accueil', 'accueil visible', 'ms'], ['dcl', 'DOMContentLoaded', 'ms'],
      ['load', 'load', 'ms'], ['script', 'temps de script', 'ms'], ['octetsPage', 'octets reçus par la page (à l\'accueil)', 'o'],
      ['octetsServeur', 'octets envoyés par le serveur (SW compris)', 'o']];
    const tableau = {};
    console.log('\n══ MESURE (médiane [min–max], n=' + PASSAGES + ') ══');
    for (const scenario of ['froid', 'chaud']) {
      console.log('\n── ' + (scenario === 'froid' ? 'PREMIÈRE VISITE (cache vide)' : 'RECHARGEMENT, service worker installé'));
      const ligne = (s, u) => u === 'o' ? Math.round(s.med / 1024) + ' ko [' + Math.round(s.min / 1024) + '–' + Math.round(s.max / 1024) + ']'
        : Math.round(s.med) + ' ms [' + Math.round(s.min) + '–' + Math.round(s.max) + ']';
      console.log('   ' + 'mesure'.padEnd(44) + 'A (brut)'.padEnd(26) + 'B (minifié)'.padEnd(26) + 'B/A');
      tableau[scenario] = {};
      champs.forEach(([cle, nom, u]) => {
        const a = res[scenario].A.map((x) => x[cle]).filter((x) => typeof x === 'number');
        const b = res[scenario].B.map((x) => x[cle]).filter((x) => typeof x === 'number');
        if (!a.length || !b.length) { console.log('   ' + nom.padEnd(44) + '(indisponible)'); return; }
        const sa = stats(a), sb = stats(b);
        tableau[scenario][cle] = { A: sa, B: sb };
        console.log('   ' + nom.padEnd(44) + ligne(sa, u).padEnd(26) + ligne(sb, u).padEnd(26) + (sa.med > 0 ? (sb.med / sa.med * 100).toFixed(0) + ' %' : '–'));
      });
      const err = res[scenario].A.concat(res[scenario].B).reduce((n, x) => n + x.erreurs, 0);
      verifier('aucune erreur de page pendant la mesure (' + scenario + ')', err === 0, err + ' erreur(s)');
    }
    if (SORTIE_JSON) fs.writeFileSync(SORTIE_JSON, JSON.stringify({ passages: PASSAGES, ralenti: RALENTI, minification: B.bilan, tableau: tableau, brut: res }, null, 1));

    // ── sw-navigation sur B ──
    if (!SANS_SW_NAV) {
      console.log('\n══ sw-navigation.js SUR B ══');
      await nav.close(); nav = null;
      const r = cp.spawnSync(process.execPath, [path.join(R, 'tests/banc/sw-navigation.js')],
        { encoding: 'utf8', env: Object.assign({}, process.env, { BANC_RACINE: B.dossier }), maxBuffer: 64 * 1024 * 1024 });
      const lignes = (r.stdout || '').split('\n');
      const ko = lignes.filter((l) => /❌/.test(l));
      const okn = lignes.filter((l) => /✅/.test(l)).length;
      verifier('sw-navigation.js passe sur B (' + okn + ' vérifications vertes)', r.status === 0 && ko.length === 0,
        'code ' + r.status + (ko.length ? ' · ' + ko.slice(0, 3).join(' | ') : ''));
    }
  } finally {
    if (nav) await nav.close().catch(() => {});
    for (const v of variantes) await new Promise((r) => v.serveur.close(r));
    fs.rmSync(B.dossier, { recursive: true, force: true });
    rendre();
  }
  console.log(echecs ? '\n❌ ' + echecs + ' contrôle(s) en échec' : '\n✅ contrôles de sortie verts');
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
