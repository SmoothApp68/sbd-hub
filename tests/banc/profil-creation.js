#!/usr/bin/env node
// tests/banc/profil-creation.js — 60-2b : LA LIGNE DE PROFIL SE CRÉE SOUS LE BON IDENTIFIANT.
//
// LE CONSTAT (journaux de la base du 07/10/2026, compte Test0710) : un `POST
// /rest/v1/profiles` en 403 (« new row violates row-level security policy »), puis
// un 201 27 secondes plus tard avec le MÊME jeton. `profiles_creation` exige
// `id = auth.uid()` : l'`id` envoyé n'était pas celui du compte connecté.
//
// LE FAUX SERVEUR FAIT COMME LA BASE : il lit le sujet (`sub`) du jeton
// `Authorization`, ne rend à `GET /profiles` que la ligne de ce sujet (RLS de
// lecture), et REFUSE en 403/42501 un `POST` dont l'`id` n'est pas ce sujet. Il
// reproduit aussi ce que le SDK fait de vrai : il absorbe un lien de
// confirmation (`#access_token=…`) en appelant `GET /auth/v1/user`, puis écrit la
// session dans le stockage et émet `SIGNED_IN`.
//
// Le vrai navigateur, la vraie app (`v2/`), un faux Supabase en mémoire. Quatre
// scénarios, chacun dans son contexte (stockage vierge) :
//   1. « compte A, Quitter, inscription du compte B » — la ligne de B se crée du
//      premier coup, sans un seul refus, et celle de A n'est pas touchée ;
//   2. « le lien de confirmation de B ouvre une page dont le stockage porte encore
//      A » — la course du constat : la sonde synchrone lit A, le SDK absorbe B ;
//      sans le correctif, `chargerProfil` créait la ligne avec l'identifiant de A ;
//   3. « la création échoue » — elle se dit, puis se rejoue au chargement suivant ;
//   4. « le jeton change sous l'app, sans évènement » (un autre onglet) — un geste du Profil
//      ne part pas sous l'identifiant de l'ancien compte avec le jeton du nouveau.
//
//   node tests/banc/profil-creation.js

'use strict';
const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
// 59-4 — tout navigateur de test passe par la garde réseau (aucune requête vers la vraie base).
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.BANC_PORT || 8893), BASE = 'http://127.0.0.1:' + PORT;

const A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-0000000000bb';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Le faux jeton : un JWT dont seul le `sub` compte ────────────────────────
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64({ sub, role: 'authenticated', aud: 'authenticated', exp: 4102444800, email: sub + '@banc.test' }) + '.sig';
const subDe = (auth) => {
  const m = /^Bearer (.+)$/.exec(auth || '');
  if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8')).sub || null; }
  catch (e) { return null; }
};
const utilisateur = (id) => ({ id, aud: 'authenticated', role: 'authenticated', email: id + '@banc.test',
  email_confirmed_at: '2026-10-08T08:00:00.000Z', app_metadata: { provider: 'email' }, user_metadata: {},
  created_at: '2026-10-08T08:00:00.000Z' });
const sessionDe = (id) => ({ access_token: jwt(id), token_type: 'bearer', expires_in: 3600,
  expires_at: 4102444800, refresh_token: 'r-' + id, user: utilisateur(id) });

// ── La base de papier ───────────────────────────────────────────────────────
function neuveBase() {
  return {
    profils: {
      [A]: { id: A, username: 'compte_a', onboarding_completed: true, intention: 'progresser', rythme_progression: 'normal',
             questionnaire_fait_le: '2026-10-01T08:00:00.000Z' }
    },
    requetes: [],        // { methode, id, sub, statut } — toutes les écritures de `profiles`
    refus: [],           // les écritures refusées par la « RLS »
    inscrits: 0,
    echecsCreation: 0,   // des échecs 500 à servir avant d'accepter une création
    avertissements: []
  };
}

async function contexte(nav, bd, o) {
  const opt = o || {};
  const ctx = await nav.newContext({ viewport: { width: 380, height: 760 }, serviceWorkers: 'block' });
  // Le stockage de départ — posé UNE fois par onglet (le rechargement ne le repose pas).
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('__graine')) return;
    sessionStorage.setItem('__graine', '1');
    if (s) localStorage.setItem('th-v2-auth', s);
  }, opt.stockage ? JSON.stringify(opt.stockage) : null);
  await ctx.route(/supabase\.co/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const chemin = url.pathname;
    const sub = subDe(req.headers()['authorization']);
    const json = (data, status) => route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(data) });
    const objet = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');

    // ── L'authentification ────────────────────────────────────────────────
    if (chemin === '/auth/v1/signup' && req.method() === 'POST') {
      bd.inscrits++;
      const id = B;      // le seul compte qui s'inscrit au banc
      return json(sessionDe(id));
    }
    if (chemin === '/auth/v1/token' && req.method() === 'POST') {
      const g = url.searchParams.get('grant_type');
      if (g === 'refresh_token') {
        const r = JSON.parse(req.postData() || '{}').refresh_token || '';
        return json(sessionDe(r.replace(/^r-/, '')));
      }
      return json(sessionDe(A));
    }
    if (chemin === '/auth/v1/user' && req.method() === 'GET') {
      return sub ? json(utilisateur(sub)) : json({ message: 'jeton absent' }, 401);
    }
    if (chemin === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (chemin.indexOf('/auth/') === 0) return json({ error: 'x' }, 400);

    // ── Les profils : la « RLS » ───────────────────────────────────────────
    if (chemin === '/rest/v1/profiles') {
      if (req.method() === 'GET') {
        const demande = (/(?:^|[?&])id=eq\.([^&]+)/.exec(url.search) || [])[1];
        const lignes = Object.keys(bd.profils).map((k) => bd.profils[k])
          .filter((l) => l.id === sub && (!demande || l.id === decodeURIComponent(demande)));   // lecture : sa ligne seulement
        if (objet) {
          return lignes.length ? json(lignes[0]) : json({ code: 'PGRST116', details: 'The result contains 0 rows',
            hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406);
        }
        return json(lignes);
      }
      if (req.method() === 'POST') {
        const corps = JSON.parse(req.postData() || '{}');
        const l = Array.isArray(corps) ? corps[0] : corps;
        const enregistre = (statut) => bd.requetes.push({ methode: 'POST', id: l.id, sub, statut });
        if (!sub || l.id !== sub) {          // profiles_creation / profiles_modif : id = auth.uid()
          enregistre(403);
          bd.refus.push({ id: l.id, sub });
          return json({ code: '42501', details: null, hint: null,
            message: 'new row violates row-level security policy for table "profiles"' }, 403);
        }
        if (!bd.profils[l.id] && bd.echecsCreation > 0) {
          bd.echecsCreation--;
          enregistre(500);
          return json({ message: 'incident passager' }, 500);
        }
        bd.profils[l.id] = Object.assign({ questionnaire_fait_le: null }, bd.profils[l.id] || {}, l);
        enregistre(201);
        return json(objet ? bd.profils[l.id] : [bd.profils[l.id]], 201);
      }
    }

    // ── Le reste : de quoi démarrer ───────────────────────────────────────
    if (chemin.indexOf('/rest/v1/rpc/pseudo_libre') === 0) return json(true);
    if (/count=exact/.test(req.headers()['prefer'] || '')) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/0',
        'access-control-expose-headers': 'content-range, content-length' }, body: '' });
    }
    if (req.method() === 'GET') return json(objet ? null : []);
    return json([], 201);
  });
  return ctx;
}

async function attendreQue(page, cond, ms) {
  const fin = Date.now() + (ms || 12000);
  while (Date.now() < fin) {
    if (await cond()) return true;
    await attendre(200);
  }
  return false;
}

const rapport = { controles: 0, echecs: [] };
function ok(nom, cond, detail) {
  rapport.controles++;
  if (cond) { console.log('   ✅ ' + nom); return; }
  rapport.echecs.push(nom);
  console.log('   ❌ ' + nom + (detail ? '  — ' + detail : ''));
}

(async () => {
  const serveur = creer({ racine: path.join(R, 'v2') });
  await new Promise((r) => serveur.listen(PORT, r));
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    // ══ 1. COMPTE A, « QUITTER », INSCRIPTION DU COMPTE B ════════════════════
    console.log('\n══ 1. compte A, « Quitter », inscription du compte B ══');
    {
      const bd = neuveBase();
      const ctx = await contexte(nav, bd, { stockage: sessionDe(A) });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/profil', { waitUntil: 'domcontentloaded' });
      const surProfil = await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#btn-deconnexion')), 15000);
      ok('prémisse — A est connecté, son profil s’affiche', surProfil);
      await page.click('#btn-deconnexion');
      await attendre(500);
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((b) => b.textContent === 'Quitter')[0].click());
      const surConnexion = await attendreQue(page, () => page.evaluate(() => !document.querySelector('#vue-connexion').hidden), 10000);
      ok('« Quitter » ramène sur l’écran de connexion', surConnexion);
      const avantB = bd.requetes.length;
      await page.click('#btn-bascule-entree');
      await attendre(300);
      await page.fill('#champ-pseudo', 'test_0710');
      await page.fill('#champ-email', 'b@banc.test');
      await page.fill('#champ-mdp', 'motdepasse123');
      await attendreQue(page, () => page.evaluate(() => !document.querySelector('#btn-connexion').disabled), 5000);
      await page.click('#btn-connexion');
      const cree = await attendreQue(page, () => !!bd.profils[B], 15000);
      ok('DISCRIMINANT — la ligne de B est créée', cree, JSON.stringify(Object.keys(bd.profils)));
      ok('DISCRIMINANT — du PREMIER coup : aucune écriture de profil refusée par la base',
        bd.refus.length === 0, JSON.stringify(bd.refus));
      // ⚠️ RELEVÉ, HORS PÉRIMÈTRE (noté, non corrigé) : le pseudo saisi à l'inscription ne suit pas quand
      // elle vient APRÈS un « Quitter » dans la même page — `garantirProprietaire` (le cache n'appartient
      // plus à personne, B entre) remet `pseudoAInscrire` à zéro, et la ligne de B naît sans `username`.
      // Le banc ne le contrôle donc pas : il dirait faux sur le code d'avant comme sur celui d'après.
      ok('les écritures de B sont sous l’identifiant de B, et seulement celui-là',
        bd.requetes.slice(avantB).every((q) => q.id === B && q.sub === B && q.statut === 201), JSON.stringify(bd.requetes.slice(avantB)));
      ok('la ligne de A n’a pas bougé', bd.profils[A].username === 'compte_a' && bd.profils[A].intention === 'progresser');
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 2. LE LIEN DE CONFIRMATION DE B, SUR UNE PAGE QUI PORTE ENCORE A ═════
    console.log('\n══ 2. le lien de confirmation de B ouvre une page dont le stockage porte encore A ══');
    {
      const bd = neuveBase();
      const ctx = await contexte(nav, bd, { stockage: sessionDe(A) });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      const lien = BASE + '/#access_token=' + jwt(B) + '&expires_in=3600&refresh_token=r-' + B + '&token_type=bearer&type=signup';
      await page.goto(lien, { waitUntil: 'domcontentloaded' });
      const cree = await attendreQue(page, () => !!bd.profils[B], 15000);
      await attendre(1500);     // laisse finir ce qui part encore (l'entrée de A, ses lectures)
      ok('DISCRIMINANT — la ligne de B est créée', cree, JSON.stringify(bd.requetes));
      ok('DISCRIMINANT — du PREMIER coup : aucune création refusée (jamais l’identifiant de A sous le jeton de B)',
        bd.refus.length === 0, JSON.stringify(bd.refus));
      ok('aucune écriture de profil sous l’identifiant de A', bd.requetes.every((q) => q.id !== A), JSON.stringify(bd.requetes));
      const jeton = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('th-v2-auth')).user.id; } catch (e) { return null; }
      });
      ok('le SDK a bien absorbé le lien : la session stockée est celle de B', jeton === B, String(jeton));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 4. LE JETON CHANGE SOUS L'APP, SANS ÉVÈNEMENT : L'ÉCRITURE SUIT LE CLIENT ═══
    // Un autre onglet (ou un lien) a posé la session de B dans le stockage commun ; cet onglet-ci n'a
    // reçu aucun évènement et garde A en mémoire. Un geste du Profil part alors : l'`id` du corps ne
    // doit pas être celui de A sous le jeton de B (403), ni la ligne de A s'écrire dans celle de B.
    console.log('\n══ 4. le jeton change sous l’app, sans évènement : l’écriture suit le client ══');
    {
      const bd = neuveBase();
      const ctx = await contexte(nav, bd, { stockage: sessionDe(A) });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/profil', { waitUntil: 'domcontentloaded' });
      const surProfil = await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 15000);
      ok('prémisse — A est connecté, son profil s’affiche', surProfil);
      await attendre(1500);     // l'entrée de A va jusqu'au bout
      const avant = bd.requetes.length;
      await page.evaluate((s) => localStorage.setItem('th-v2-auth', s), JSON.stringify(sessionDe(B)));
      await page.evaluate(() => Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
        .filter((x) => ((x.querySelector('.p-lib') || {}).textContent || '').indexOf('Objectif') === 0)[0].click());
      await attendre(500);
      await page.click('#feuille-contenu .feuille-menu button[data-cle="force"]');
      await attendreQue(page, () => !!bd.profils[B], 12000);
      await attendre(1500);
      const apres = bd.requetes.slice(avant);
      ok('DISCRIMINANT — aucune écriture de profil sous l’identifiant de A avec le jeton de B (pas de 403)',
        bd.refus.length === 0 && apres.every((q) => q.id === q.sub), JSON.stringify(apres));
      ok('DISCRIMINANT — la ligne de A n’a pas reçu le geste (il n’a pas été envoyé sous un autre identifiant)',
        bd.profils[A].objectif === undefined || bd.profils[A].objectif === null, JSON.stringify(bd.profils[A]));
      ok('la ligne de B n’a pas reçu le geste de A non plus', !bd.profils[B] || !bd.profils[B].objectif, JSON.stringify(bd.profils[B]));
      ok('le client entre sur SON compte : la ligne de B existe', !!bd.profils[B], JSON.stringify(Object.keys(bd.profils)));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 3. LA CRÉATION QUI ÉCHOUE SE DIT, PUIS SE REJOUE ═════════════════════
    console.log('\n══ 3. une création qui échoue se dit, puis se rejoue au chargement suivant ══');
    {
      const bd = neuveBase();
      bd.echecsCreation = 1;
      const ctx = await contexte(nav, bd, { stockage: sessionDe(B) });
      const page = await ctx.newPage();
      const avertissements = [];
      page.on('console', (m) => { if (m.type() === 'warning' && /Profil non créé/.test(m.text())) avertissements.push(m.text().slice(0, 200)); });
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      const dit = await attendreQue(page, () => avertissements.length > 0, 15000);
      ok('DISCRIMINANT — l’échec de la création se DIT (console), il n’est plus avalé', dit, JSON.stringify(bd.requetes));
      ok('prémisse — la première création a échoué (500) : pas de ligne', !bd.profils[B] && bd.requetes.some((q) => q.statut === 500), JSON.stringify(bd.requetes));
      await page.reload({ waitUntil: 'domcontentloaded' });
      const rejouee = await attendreQue(page, () => !!bd.profils[B], 15000);
      ok('DISCRIMINANT — au chargement suivant du profil, la création est REJOUÉE et réussit', rejouee, JSON.stringify(bd.requetes));
      ok('aucune écriture refusée par la base', bd.refus.length === 0, JSON.stringify(bd.refus));
      await ctx.close();
    }
  } finally {
    await nav.close();
    await new Promise((r) => serveur.close(r));
  }
  console.log('\n   ' + rapport.controles + ' contrôles · ' + rapport.echecs.length + ' en échec');
  if (rapport.echecs.length) { console.log('❌ en échec'); process.exit(1); }
  console.log('✅ tout passe');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
