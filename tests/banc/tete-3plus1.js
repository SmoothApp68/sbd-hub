#!/usr/bin/env node
// tests/banc/tete-3plus1.js — « SIMPLIFIER », PILOTE 3+1 (21/11/2026) : LA TÊTE D'UN EXERCICE EN SÉANCE, dans la vraie app (`v2/`), navigateur réel,
// faux Supabase en mémoire, colonne 380 px. Il joue les CINQ ÉTATS de la maquette validée le 21/11/2026 et MESURE le gain de hauteur.
//
//   (a) un premier exercice, chauffes proposées       (b) un test au cran au-dessus          (c) la première fois d'un exercice (calage)
//   (d) après une série ratée                          (e) une semaine de décharge
//
// La règle : TROIS éléments au plus dans la tête d'un exercice (la consigne, UNE ligne grise, un troisième : le compteur), plus UNE carte de décision ;
// ce qui annonce une décision déjà prise est hors compte et reste visible ; rien d'annoncé n'est caché (le chiffre, le verbe avec son chiffre, « On essaie »,
// la puce « Si ça passe » et son « ≈ », la clause de la Décharge, la réaction au raté entière) ; « Pourquoi ? » est au bout de la ligne grise, sa cible à 44 px.
//
//   node tests/banc/tete-3plus1.js                       # contrôles + tableau des hauteurs (le code est celui de v2/)
//   CAPTURES=<dossier> node tests/banc/tete-3plus1.js    # + une capture par exercice et par état
//   node tests/banc/tete-3plus1.js --racine <v2> --avant # MESURE seulement, sur un autre v2/ (l'état d'avant) : aucun contrôle de la règle
//
// Les hauteurs « avant » ci-dessous ont été relevées par ce même banc, `--avant`, sur `origin/main` (f5cefc6e, 21/11/2026).

'use strict';
const path = require('path');
const fs = require('fs');
const R = path.join(__dirname, '../..');
// 21/11/2026 — la colonne : 380 par défaut ; `LARGEUR=360 node tests/banc/tete-3plus1.js` rejoue les cinq états sur un téléphone étroit (tout.js joue les deux).
const LARGEUR = +(process.env.LARGEUR || 380);
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const Verrou = require(path.join(R, 'tests/banc/verrou.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const RACINE = arg('racine', path.join(R, 'v2'));
const AVANT = process.argv.indexOf('--avant') >= 0;
const CAPTURES = process.env.CAPTURES || null;
if (CAPTURES) fs.mkdirSync(CAPTURES, { recursive: true });

// La hauteur au-dessus de la 1re série (px), relevée sur l'état d'AVANT (`origin/main` f5cefc6e), et le gain minimal que la règle doit donner (marge sur le gain mesuré).
const AVANT_PX = { a: 283, b: 396, c: 404, d: 189, e: 283 };
const GAIN_MIN = { a: 30, b: 80, c: 60, d: 10, e: 30 };

let ko = 0;
const verifier = (c, m, d) => { console.log((c ? '   ✅ ' : '   ❌ ') + m + (c || d === undefined ? '' : '  → ' + d)); if (!c) ko++; };
const esp = (t) => String(t || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

// ── données ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const U = 'u-tete';
const uuid = (p, n) => p + '-0000-4000-8000-' + String(n).padStart(12, '0');
const fiche = (slug, nom, equipement, muscles, extra) => Object.assign({ slug, nom, mesure: 'charge_reps', charge: 'externe', parent: null,
  equipement, muscles_primaires: muscles, muscles_secondaires: [], mouvement: null, barre_charge_fixe: false, actif: true, proprietaire: null }, extra || {});
const CATALOGUE = [
  fiche('developpe-couche', 'Développé couché (Barre)', 'barre', ['pectoraux'], { mouvement: 'poussee_horizontale' }),
  fiche('developpe-militaire', 'Développé militaire (Barre)', 'barre', ['deltoide_anterieur'], { mouvement: 'poussee_verticale' }),
  fiche('tractions', 'Tractions', 'barre_fixe', ['grand_dorsal'], { mesure: 'reps', charge: 'aucune', mouvement: 'tirage_vertical' }),
  fiche('elevation-laterale', 'Élévation latérale (Haltères)', 'haltere', ['deltoide_lateral'])
];
const T0 = '2026-09-01T10:00:00.000Z';
const rs = (reId, k, type, reps) => ({ id: reId + '-s' + k, routine_exercise_id: reId, user_id: U, rang: k, type_serie: type, reps_visees: reps,
  charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null, au_max: false, created_at: T0 });
function routine(slugs, opts) {
  const rid = uuid('0a000000', 1);
  return [{ id: rid, user_id: U, nom: 'Haut A', note: null, archivee_a: null, rang: 0, dossier: (opts && opts.dossier) || null, jours: null, created_at: T0, modifiee_a: T0,
    routine_exercises: slugs.map((d, j) => { const reId = uuid('0b000000', j);
      const sets = []; for (let k = 0; k < d.series; k++) sets.push(rs(reId, k, 'travail', d.reps));
      return { id: reId, routine_id: rid, exercise_slug: d.slug, rang: j, groupe_superset: null, note: null, repos_cible_s: d.repos || 120, zone: null, created_at: T0, routine_sets: sets }; }) }];
}
// Un historique de « Haut A » : n séances, tous les 3,5 jours, la dernière il y a 3 jours. `prog(slug, k, n)` rend [[kg, reps, ressenti], …].
function historique(n, slugs, prog) {
  const seances = [], series = []; let s = 0;
  const fin = Date.now() - 3 * 86400000;
  for (let k = 0; k < n; k++) {
    const t = fin - (n - 1 - k) * 3.5 * 86400000;
    const id = uuid('5e55e000', k), debut = new Date(t).toISOString();
    seances.push({ id, user_id: U, titre: 'Haut A', debut, fin: new Date(t + 70 * 60000).toISOString(), statut: 'terminee', note: null, salle: null,
      routine_id: uuid('0a000000', 1), source: 'app', created_at: debut });
    let rang = 0;
    for (const slug of slugs) {
      const lignes = prog(slug, k, n);
      if (!lignes) continue;
      for (const l of lignes) {
        series.push({ id: uuid('5e7e0000', s++), session_id: id, user_id: U, exercise_slug: slug, charge_kg: l[0], reps: l[1], duree_s: null, distance_m: null,
          type_serie: 'travail', rang: ++rang, groupe_superset: null, validee_a: new Date(t + rang * 180000).toISOString(), rpe: null, ressenti: l[2] || null,
          repos_s: 120, note: null, source: 'app', created_at: debut, modifie_a: null, tempo: null, elastique: null, douleur: null, occurrence: null, hors_calcul: false });
      }
    }
  }
  return { seances, series };
}
const r3 = (kg, reps, res) => [[kg, reps, res], [kg, reps, res], [kg, reps, res]];
const PROFIL = { id: U, username: 'tete', onboarding_completed: true, intention: 'progresser', rythme_progression: 'normal', objectif: 'les_deux',
  questionnaire_fait_le: '2026-10-01T08:00:00.000Z', sexe: 'homme', jeu_actif: true, compte_prive: true, date_naissance: '1997-11-10', anciennete: 'plus_3_ans', niveau_declare: 'avance' };
const HAUT_A = [
  { slug: 'developpe-couche', series: 3, reps: 8, repos: 180 },
  { slug: 'developpe-militaire', series: 3, reps: 8, repos: 150 },
  { slug: 'tractions', series: 3, reps: 8, repos: 120 },
  { slug: 'elevation-laterale', series: 3, reps: 12, repos: 90 }
];
function progStandard(slug, k, n) {
  const f = k / Math.max(1, n - 1);
  if (slug === 'developpe-couche') return r3(80 + Math.round(f * 4) * 2.5, 8, 'reste_2');
  if (slug === 'developpe-militaire') return r3(45 + Math.round(f * 2) * 2.5, 8, 'reste_1');
  if (slug === 'tractions') return [[null, 9, 'reste_1'], [null, 8, 'reste_1'], [null, 7, 'reste_0']];
  return null;   // élévation latérale : jamais faite (la première fois)
}
const SCENARIOS = {
  a: { nom: 'chauffes proposées', exo: 0, routine: routine(HAUT_A), h: historique(10, HAUT_A.map((d) => d.slug), progStandard) },
  b: { nom: 'test au cran au-dessus', exo: 0, routine: routine(HAUT_A), h: historique(10, HAUT_A.map((d) => d.slug), (slug, k, n) => {
    if (slug === 'developpe-couche') return k >= n - 2 ? r3(90, 9, 'reste_3_plus') : r3(87.5, 8, 'reste_2');
    return progStandard(slug, k, n); }) },
  c: { nom: 'première fois (calage)', exo: 3, routine: routine(HAUT_A), h: historique(10, HAUT_A.map((d) => d.slug), progStandard) },
  d: { nom: 'après une série ratée', exo: 0, routine: routine(HAUT_A), h: historique(10, HAUT_A.map((d) => d.slug), progStandard) },
  e: { nom: 'semaine de décharge', exo: 0, routine: routine(HAUT_A, { dossier: 'P' }), h: historique(10, HAUT_A.map((d) => d.slug), progStandard), decharge: true }
};
function blocsDe(sc) {
  if (!sc.decharge) return [];
  // Un bloc de 5 semaines commencé il y a 4 semaines (lundi) : la 5e est la décharge.
  const d = new Date(); d.setHours(12, 0, 0, 0); const jour = (d.getDay() + 6) % 7; d.setDate(d.getDate() - jour - 28);
  const debut = d.toISOString().slice(0, 10);
  return [{ id: uuid('0c000000', 1), user_id: U, dossier: 'P', zone: 'mix', debut, semaines: 5, decharge: true, exercices: ['developpe-couche', 'developpe-militaire'],
    statut: 'en_cours', precedent: null, grosse_serie: false, created_at: T0, modifie_a: T0 }];
}
function fauxSupabase(sc) {
  const s0 = sc.h.seances[0];
  // Un vieux pari tenu : « Mon premier pari » ne se déclenche pas.
  const predictions = [{ id: uuid('9a000000', 1), user_id: U, module: 'moteur.consigne', module_version: 1, emise_a: s0.debut, exercise_slug: 'developpe-couche', session_id: s0.id,
    grandeur: 'reps', horizon_jours: 0, valeur_predite: 8, borne_basse: 8, borne_haute: 8, fondement: { seance: s0.id, compteur: null }, valeur_observee: 8, observee_a: s0.fin, set_observe: null }];
  const base = { sessions: sc.h.seances.slice(), sets: sc.h.series.slice(), blocs: blocsDe(sc), profiles: [Object.assign({}, PROFIL)], predictions };
  const decouper = (t) => { const b = []; let p = 0, c = ''; for (const ch of t) { if (ch === '(') p++; if (ch === ')') p--; if (ch === ',' && !p) { b.push(c); c = ''; continue; } c += ch; } if (c.trim()) b.push(c); return b.map((x) => x.trim()).filter(Boolean); };
  const une = (l, ch) => { if (ch.indexOf('*') >= 0) return Object.assign({}, l); const o = {}; for (const c of ch) { const m = /^([A-Za-z_]\w*)\s*\((.*)\)$/.exec(c); if (m) { const im = l[m[1]]; o[m[1]] = Array.isArray(im) ? im.map((x) => une(x, decouper(m[2]))) : im; continue; }
    const j = /^(\w+):(\w+)->(\w+)$/.exec(c); if (j) { const ob = l[j[2]]; o[j[1]] = ob && j[3] in ob ? ob[j[3]] : null; continue; } if (c in l) o[c] = l[c]; } return o; };
  const projeter = (d, url) => { const s = url.searchParams.get('select'); return !s || !Array.isArray(d) ? d : d.map((l) => une(l, decouper(s))); };
  const upsert = (liste, lignes) => { for (const l of lignes) { const i = liste.findIndex((x) => x.id === l.id); if (i >= 0) liste[i] = Object.assign({}, liste[i], l); else liste.push(Object.assign({}, l)); } };
  return async (route) => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop();
    const unSeul = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const json = (d, st) => route.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(unSeul && Array.isArray(d) ? (d[0] || null) : d) });
    if (url.pathname.startsWith('/auth/')) return json({ error: 'x' }, 400);
    if (/\/rpc\//.test(url.pathname)) return json(null);
    if (url.pathname.startsWith('/functions/')) return json({ erreur: 'indisponible' }, 503);
    if (/count=exact/.test(req.headers()['prefer'] || '')) { const n = (base[table] || []).length;
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-' + Math.max(0, n - 1) + '/' + n, 'access-control-expose-headers': 'content-range, content-length' }, body: '' }); }
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let b = null; try { b = req.postDataJSON(); } catch (e) { b = null; }
      const lignes = Array.isArray(b) ? b : (b ? [b] : []);
      if (req.method() === 'POST' && (table === 'sessions' || table === 'sets')) upsert(base[table], lignes);
      if (req.method() === 'PATCH' && table === 'sessions') { const id = (url.searchParams.get('id') || '').replace('eq.', ''); const s = base.sessions.find((x) => x.id === id); if (s) Object.assign(s, b); }
      return json(lignes, 201);
    }
    if (req.method() === 'DELETE') return json([], 200);
    if (req.method() !== 'GET') return json([]);
    const filtrer = (l) => { for (const [k, v] of url.searchParams) { if (k === 'select' || k === 'limit' || k === 'order' || k === 'offset') continue;
      if (v.startsWith('eq.')) l = l.filter((x) => String(x[k]) === v.slice(3)); else if (v.startsWith('gt.')) l = l.filter((x) => String(x[k]) > v.slice(3));
      else if (v.startsWith('in.(')) { const ids = v.slice(4, -1).split(',').map((q) => q.replace(/"/g, '')); l = l.filter((x) => ids.indexOf(String(x[k])) >= 0); } }
      l = l.slice().sort((a, b) => String(a.id || a.slug).localeCompare(String(b.id || b.slug)));
      const lim = Number(url.searchParams.get('limit') || 0); return lim ? l.slice(0, lim) : l; };
    if (table === 'exercises') return json(projeter(filtrer(CATALOGUE), url));
    if (table === 'routines') return json(projeter(sc.routine, url));
    if (table === 'sessions' || table === 'sets' || table === 'blocs' || table === 'profiles' || table === 'predictions') return json(projeter(filtrer(base[table]), url));
    return json([]);
  };
}

const calme = (page) => page.evaluate(() => new Promise((ok) => { let n = 0, prec = performance.now();
  const tour = (t) => { n = (t - prec) < 60 ? n + 1 : 0; prec = t; if (n >= 15) ok(true); else requestAnimationFrame(tour); }; requestAnimationFrame(tour); }));

// Ce que la page montre de chaque exercice : hauteur au-dessus de la 1re série, les éléments de la tête, les cartes, les textes.
const MESURER = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.height > 0 && !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
  const T = (e) => (e.innerText || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(document.querySelectorAll('#vue-seance .bloc-seance')).filter(vis).map((b, i) => {
    const rb = b.getBoundingClientRect();
    const l1 = b.querySelector('.ligne-serie');
    const leg = b.querySelector('.legende-exo');
    const tous = (sel, racine) => Array.from((racine || b).querySelectorAll(sel)).filter(vis);
    const dansLeg = (sel) => (leg ? tous(sel, leg) : []);
    const dits = dansLeg('.consigne-dit');
    const SPECIAUX = /compteur|frere|serie-de-plus|serie-de-moins|alleger-en-cours|tempo-en-cours|premier-pari|puissance|ajout-semaine|charge-programme|approchee/;
    const gris = dits.filter((d) => !SPECIAUX.test(d.className) && !d.classList.contains('habituelle-pour'));
    const tiers = dits.filter((d) => /compteur|frere/.test(d.className));
    const lien = leg ? leg.querySelector('.lien-pourquoi') : null;
    const rl = lien ? lien.getBoundingClientRect() : null;
    const cartes = tous('.proposition-exercice, .habituelle').filter((c) => !/chauffes-auto|chauffes-posees|chauffes-silence/.test(c.className) && !c.closest('.ligne-serie'));
    const consignes = dansLeg('.consigne');
    const reac = tous('.rate-reaction');
    const aide = tous('.aide-unite');
    return {
      i, nom: T(b.querySelector('.nom-exo') || b).slice(0, 40),
      h1: l1 ? Math.round(l1.getBoundingClientRect().top - rb.top) : null,
      consignes: consignes.map(T),
      gris: gris.map(T),
      grisDansRang: !!(lien && lien.closest('.ligne-gris')),
      lien: rl ? { h: Math.round(rl.height), neuf: lien.classList.contains('pourquoi-neuf') } : null,
      cible: rl ? (() => { lien.scrollIntoView({ block: 'center' }); const q = lien.getBoundingClientRect(); const out = {}; for (let ix = 0; ix <= 10; ix++) for (let iy = 0; iy <= 10; iy++) { const X = q.left + 0.5 + (q.width - 1) * ix / 10, Y = q.top + 0.5 + (q.height - 1) * iy / 10; const z = document.elementFromPoint(X, Y); const k = z === lien || lien.contains(z) ? 'ok' : (z ? z.tagName + '.' + String(z.className).slice(0, 30) + '@' + JSON.stringify((r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)])(z.getBoundingClientRect())) : 'rien'); out[k] = (out[k] || 0) + 1; } return out; })() : null,
      lienRect: rl ? [Math.round(rl.left), Math.round(rl.top), Math.round(rl.width), Math.round(rl.height)] : null, docW: document.documentElement.scrollWidth,
      tiers: tiers.map(T),
      elements: (consignes.length ? 1 : 0) + (gris.length || dansLeg('.ligne-titre').length ? 1 : 0) + (tiers.length ? 1 : 0),
      cartes: cartes.map((c) => c.className.replace(/\s+/g, ' ') + ' | ' + T(c)),
      raison: !!b.querySelector('.pc-raison'), approchee: dits.filter((d) => /approchee/.test(d.className)).map(T),
      puce: !!(leg && leg.querySelector('.si-ca-passe.sp-ouvre')), puceTexte: leg && leg.querySelector('.si-ca-passe') ? T(leg.querySelector('.si-ca-passe')) : null,
      reactions: reac.map(T), reactionBoutons: reac.map((r) => Array.from(r.querySelectorAll('button')).map(T)),
      aide: aide.map(T), bandeau: Array.from(document.querySelectorAll('.bandeau-allegee')).filter(vis).map(T),
      tete: leg ? T(leg) : '', chauffesAjouter: tous('.proposition-chauffes .pc-ajouter').map(T)
    };
  });
};
const feuilleOuverte = (page) => page.evaluate(() => {
  const f = Array.from(document.querySelectorAll('#feuille-seance, .feuille')).filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && !e.hidden; })[0];
  if (!f) return null;
  const T = (e) => (e.innerText || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  return { texte: T(f), sections: Array.from(f.querySelectorAll('[data-pq-section]')).map((n) => n.getAttribute('data-pq-section') + ' : ' + T(n)) };
});
const fermerFeuille = async (page) => {
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#feuille-seance button, .feuille button')).find((x) => /Fermer/.test(x.textContent) && x.getBoundingClientRect().height > 0); if (b) b.click(); });
  await calme(page);
};

async function jouer(code, sc, port) {
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
  const errs = [];
  try {
    const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: 800 }, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await ctx.addInitScript((u) => {
      const J = JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800, token_type: 'bearer', user: { id: u, email: 'tete@test' } });
      localStorage.setItem('th-v2-auth', J);
      const vr = Storage.prototype.removeItem; Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vr.call(this, c); };
      const vs = Storage.prototype.setItem; Storage.prototype.setItem = function (c, v) { return vs.call(this, c, c === 'th-v2-auth' ? J : v); };
    }, U);
    await ctx.route(/supabase\.co/, fauxSupabase(sc));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
    await page.waitForSelector('#vue-liste:not([hidden])', { timeout: 60000 }).catch(() => {});
    await calme(page);
    await page.goto('http://127.0.0.1:' + port + '/saisie', { waitUntil: 'load' });
    await page.waitForSelector('button.demarrer', { timeout: 60000 });
    await calme(page);
    await page.evaluate(() => document.querySelector('button.demarrer').click());
    await page.waitForFunction(() => document.querySelectorAll('#vue-seance .ligne-serie').length > 0, null, { timeout: 30000 });
    await calme(page);
    const capture = async (suffixe, mesures) => {
      if (!CAPTURES) return;
      const blocs = page.locator('#vue-seance .bloc-seance');
      const nb = await blocs.count();
      for (let k = 0; k < nb; k++) await blocs.nth(k).screenshot({ path: path.join(CAPTURES, (AVANT ? 'avant' : 'apres') + '-' + code + suffixe + '-exo' + k + '.png') }).catch(() => {});
      await page.screenshot({ path: path.join(CAPTURES, (AVANT ? 'avant' : 'apres') + '-' + code + suffixe + '-plein.png'), fullPage: true });
      fs.writeFileSync(path.join(CAPTURES, (AVANT ? 'avant' : 'apres') + '-' + code + suffixe + '-mesure.json'), JSON.stringify(mesures, null, 1));
    };
    const m = await page.evaluate(MESURER);
    await capture('', m);
    const e = m[sc.exo];
    return { page, m, e, errs, capture };
  } catch (x) { await nav.close(); throw x; }
  finally { /* le navigateur reste ouvert pour les contrôles de l'état, `fermer` le rend */ }
}

(async () => {
  const rendre = await Verrou.prendre();
  const serveur = creer({ racine: RACINE, gzip: true });
  const port = await Verrou.ecouter(serveur, 0);
  const gains = {};
  try {
    for (const code of ['a', 'b', 'c', 'd', 'e']) {
      const sc = SCENARIOS[code];
      console.log('\n══ (' + code + ') ' + sc.nom + (AVANT ? ' — AVANT' : ''));
      const nav0 = [];
      const J = await jouer(code, sc, port);
      const { page, m, e, errs, capture } = J;
      try {
        // (d) : la série 1 ratée (5 reps au lieu de 9), validée : la réaction du coach parle sous elle.
        if (code === 'd') {
          const l0 = page.locator('#vue-seance .bloc-seance').first().locator('.ligne-serie').first();
          const champs = l0.locator('input');
          await champs.nth((await champs.count()) - 1).fill('5');
          await l0.locator('.ok-serie').click();
          await calme(page);
        }
        const m2 = code === 'd' ? await page.evaluate(MESURER) : m;
        const e2 = m2[sc.exo];
        if (code === 'd') await capture('-ratee', m2);
        const h = e2.h1;   // (d) : mesurée APRÈS la série ratée, comme l'état d'avant (la carte de chauffe a alors laissé la place)
        gains[code] = { avant: AVANT_PX[code], apres: h };
        console.log('   hauteur au-dessus de la 1re série : ' + h + ' px (avant : ' + AVANT_PX[code] + ' px, gain ' + (AVANT_PX[code] - h) + ' px)');
        console.log('   tête : ' + e.tete.slice(0, 220));
        verifier(errs.length === 0, 'aucune erreur de page', errs.join(' | '));
        if (AVANT) continue;

        // ── la règle, sur tous les exercices de l'état ─────────────────────────────────────────────────────────────────────────────────────
        verifier(m.every((x) => x.elements <= 3), 'la tête compte trois éléments au plus (consigne, une ligne grise, un troisième)', JSON.stringify(m.map((x) => x.elements)));
        verifier(m.every((x) => x.tiers.length <= 1), 'un seul troisième élément (compteur ou « Pendant ce temps »)');
        verifier(m.every((x) => x.cartes.length <= 1), 'une seule carte de décision par exercice', JSON.stringify(m.map((x) => x.cartes)));
        verifier(m.every((x) => !x.lien || x.lien.h >= 44), '« Pourquoi ? » garde une cible de 44 px', JSON.stringify(m.map((x) => x.lien && x.lien.h)));
        // La cible se SONDE (`elementFromPoint`, grille 11 × 11 sur la boîte du lien) : une boîte de 44 px que la puce ou un voisin recouvre n'est pas une cible.
        verifier(m.every((x) => !x.cible || (x.cible.ok === 121 && x.lien.h >= 44)), '« Pourquoi ? » : les 121 points de sa cible de 44 px touchent le lien (' + LARGEUR + ' px)', JSON.stringify(m.map((x) => x.cible)));
        verifier(m.every((x) => !/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|hier)\s*:\s*[\d]/i.test(x.tete)), 'aucun fait daté (« Mardi : 90 kg × 8, 8, 8. ») dans la tête', m.map((x) => x.tete).join(' || '));
        verifier(m.every((x) => !x.raison), 'plus de « Pourquoi cette chauffe ? » sous la carte');
        verifier(h <= AVANT_PX[code] - GAIN_MIN[code], 'gain de hauteur ≥ ' + GAIN_MIN[code] + ' px (' + h + ' ≤ ' + (AVANT_PX[code] - GAIN_MIN[code]) + ')');

        if (code === 'a') {
          verifier(e.gris.length === 1 && e.gris[0] === 'Une rep de plus : 90 kg × 9.', 'le verbe avec son chiffre, seul, en gris : « Une rep de plus : 90 kg × 9. »', JSON.stringify(e.gris));
          verifier(e.grisDansRang, '« Pourquoi ? » est au bout de la ligne grise');
          verifier(e.consignes.length === 1 && /^90\s*kg\s*×\s*9/.test(e.consignes[0]), 'le chiffre du jour reste : 90 kg × 9', JSON.stringify(e.consignes));
          verifier(e.cartes.length === 1 && /Chauffe : 45 kg × 15\./.test(e.cartes[0]) && e.chauffesAjouter.length >= 1, 'la carte de chauffe reste, une rangée, avec « Ajouter » et « Non merci »', JSON.stringify(e.cartes));
          verifier(!!e.lien && e.lien.neuf, 'le point ambre de « Pourquoi ? » est allumé : la section « La chauffe » n’a pas été lue');
          await page.locator('#vue-seance .bloc-seance').first().locator('.lien-pourquoi').first().click();
          await calme(page);
          const f = await feuilleOuverte(page);
          verifier(!!f && /Ta dernière séance/.test(f.texte), 'la feuille dit « Ta dernière séance, … » (le fait daté y est)', f && f.texte.slice(0, 120));
          verifier(!!f && f.sections.some((s) => /^chauffe : Premier exercice de la séance sur ce muscle.*60\s*%/.test(s)), 'la feuille a sa section « La chauffe », la raison mot pour mot', JSON.stringify(f && f.sections));
          if (CAPTURES) await page.screenshot({ path: path.join(CAPTURES, 'apres-a-pourquoi.png') });
          await fermerFeuille(page);
          const m3 = await page.evaluate(MESURER);
          verifier(m3.every((x) => !x.lien || !x.lien.neuf), 'la section « La chauffe » lue : le point ambre s’éteint');
        }
        if (code === 'b') {
          verifier(/Si ça passe, ≈ 92,5 kg × 8, à la série que tu veux\./.test(e.puceTexte || ''), 'la puce « Si ça passe, ≈ 92,5 kg × 8 » reste, avec son « ≈ » (I61)', e.puceTexte);
          verifier(e.gris.length === 1 && e.gris[0] === 'On essaie 92,5 kg.', '« On essaie 92,5 kg. » reste, seul', JSON.stringify(e.gris));
          verifier(e.approchee.length === 0, 'la phrase « ≈ 92,5 kg : vise la barre au-dessus… » ne vit plus sous la puce');
          verifier(e.puce, 'la puce se touche (la feuille s’ouvre dessus)');
          await page.locator('#vue-seance .bloc-seance').first().locator('.si-ca-passe').first().click();
          await calme(page);
          const f = await feuilleOuverte(page);
          verifier(!!f && f.sections.some((s) => /^approchee : ≈ 92,5 kg : vise la barre au-dessus, ou des petits disques si ta barre se charge\. Note ce que tu as mis\./.test(s)), 'la feuille dit comment charger le « ≈ », mot pour mot', JSON.stringify(f && f.sections));
          verifier(!!f && /dernière série, 90 kg × 9|90 kg × 9/.test(f.texte), 'la feuille dit aussi la dernière série (« la dernière fois, 90 kg × 9 … » y est)', f && f.texte.slice(0, 200));
          if (CAPTURES) await page.screenshot({ path: path.join(CAPTURES, 'apres-b-pourquoi.png') });
          await fermerFeuille(page);
        }
        if (code === 'c') {
          verifier(!/Deux séries de chauffe/.test(e.tete), 'la phrase des deux chauffes n’est pas dite avant « Je ne sais pas »', e.tete);
          verifier(e.cartes.length === 1 && /habituelle/.test(e.cartes[0]) && /Ta charge habituelle/.test(e.cartes[0]), 'la question de la charge habituelle est la carte de décision', JSON.stringify(e.cartes));
          verifier(e.aide.length === 0, 'l’unité (« kg, les deux haltères ») est cachée tant que la question est là', JSON.stringify(e.aide));
          verifier(e.grisDansRang, '« Pourquoi ? » suit le titre « On trouve ta charge » sur sa ligne');
          verifier(/On trouve ta charge/.test(e.consignes.join(' ')), 'le titre « On trouve ta charge » reste');
          await page.locator('#vue-seance .bloc-seance').nth(3).locator('button', { hasText: 'Je ne sais pas' }).click();
          await calme(page);
          const m3 = await page.evaluate(MESURER);
          await capture('2', m3);
          verifier(/Deux séries de chauffe de 5, en montant/.test(m3[3].tete), 'après « Je ne sais pas » : la phrase des deux chauffes est dite', m3[3].tete);
          verifier(m3[3].aide.length === 1 && /kg, les deux haltères/.test(m3[3].aide[0]), 'l’unité revient après la question', JSON.stringify(m3[3].aide));
          console.log('   après « Je ne sais pas » : ' + m3[3].h1 + ' px au-dessus de la 1re série');
        }
        if (code === 'd') {
          const r = e2.reactions;
          verifier(r.length === 1 && /5 au lieu de 9\./.test(r[0]), 'la réaction au raté parle, entière : « 5 au lieu de 9. … »', JSON.stringify(r));
          verifier(e2.reactionBoutons[0] && e2.reactionBoutons[0].length >= 1, 'ses gestes sont là', JSON.stringify(e2.reactionBoutons));
          verifier(e2.cartes.length === 0, 'une seule carte à la fois : la carte de chauffe a laissé la place à la réaction', JSON.stringify(e2.cartes));
          verifier(e2.gris.length === 1 && e2.gris[0] === 'Une rep de plus : 90 kg × 9.', 'le verbe avec son chiffre reste', JSON.stringify(e2.gris));
        }
        if (code === 'e') {
          verifier(e.bandeau.length === 1 && /^Décharge, semaine \d sur \d : prévue par ton programme\./.test(e.bandeau[0]), 'le bandeau de la séance dit la semaine', JSON.stringify(e.bandeau));
          verifier(m.slice(0, 3).every((x) => x.gris.length === 1 && x.gris[0] === 'Décharge : 2 séries au lieu de 3.'), 'chaque exercice dit « Décharge : 2 séries au lieu de 3. », sans la semaine', JSON.stringify(m.map((x) => x.gris)));
          verifier(m.slice(0, 3).every((x) => !/semaine/.test(x.tete)), 'la semaine n’est dite qu’au bandeau (pas dans la tête des exercices)');
        }
      } finally { await page.context().browser().close(); }
    }
    console.log('\n══ HAUTEUR AU-DESSUS DE LA 1RE SÉRIE (px, colonne 380)');
    console.log('   état                      avant   après   gain');
    Object.keys(gains).forEach((c) => console.log('   (' + c + ') ' + SCENARIOS[c].nom.padEnd(24) + String(gains[c].avant).padStart(5) + String(gains[c].apres).padStart(8) + String(gains[c].avant - gains[c].apres).padStart(7)));
    if (CAPTURES) fs.writeFileSync(path.join(CAPTURES, (AVANT ? 'avant' : 'apres') + '-hauteurs.json'), JSON.stringify(gains, null, 1));
  } finally { serveur.close(); rendre(); }
  console.log('\n' + (ko ? '❌ ' + ko + ' contrôle(s) en échec' : '✅ tout passe') + ' · contrôles · tete-3plus1');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
