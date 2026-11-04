#!/usr/bin/env node
// tests/banc/vitesse.js — 231 : LE GARDE-FOU DE VITESSE. Une séance au 229 prenait 8 à 12 s pour valider UNE série
// (historique de 627 séances, processeur ×4) sans qu'aucun test le voie ; corrigé à moins d'une seconde (#571).
// Ce banc échoue si ça revient.
//
// La vraie app (`v2/`), un faux Supabase en mémoire, un historique SYNTHÉTIQUE de 627 séances / ~17 800 séries
// (rien des données d'Aurélien), une routine de 6 exercices, un bloc Hypertrophie, le processeur ralenti ×4
// (l'ordre de grandeur d'un téléphone milieu de gamme). Chaque geste est mesuré du clic au rendu
// (MutationObserver puis requestAnimationFrame). TROIS passages, chacun sur une page neuve ; on retient la MÉDIANE.
//
// PLAFONDS = la mesure du 03/11/2026 (relevé ci-dessous) × 2, arrondie : la marge est pour la machine de la CI,
// plus lente et plus bruitée que celle-ci. Ils ne bougent que par un geste conscient, dans une PR qui le justifie.
//
// Rien n'est attendu à délai fixe : on attend l'ÉTAT (la page calme, le rendu du geste). Un seul « délai » : `calme`,
// qui lit les images à chaque tour (le pas d'une boucle qui lit l'état), pas une durée.
//
//   node tests/banc/vitesse.js [--json]

'use strict';
const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const Verrou = require(path.join(R, 'tests/banc/verrou.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PASSAGES = 3;
const RALENTI = 4;

// RELEVÉ du 03/11/2026 (médiane de 3 passages, ms, processeur ×4, 627 séances) et PLAFONDS = relevé × 2, arrondis.
//   geste                                          relevé   plafond
//   démarrer une séance                             275       600
//   valider une série (moyenne de 4)               1500      3000   (avant 229 : 8 000 à 12 000)
//   passer à l'exercice suivant (sa 1re série)     2550      5000
//   ouvrir la fiche d'un exercice                  2250      4500
const PLAFONDS_MS = { demarrer: 600, valider: 3000, suivant: 5000, fiche: 4500 };
const GESTES = [
  ['demarrer', 'démarrer une séance (routine de 6 exercices)'],
  ['valider', 'valider une série (moyenne de 4)'],
  ['suivant', 'passer à l\'exercice suivant (sa 1re série)'],
  ['fiche', 'ouvrir la fiche d\'un exercice']
];

let x = 548; const alea = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
const uuid = (p, n) => p + '-0000-4000-8000-' + String(n).padStart(12, '0');
const NOMS=['Squat (Barre)','Développé couché (Barre)','Soulevé de terre (Barre)','Tractions','Développé militaire (Barre)','Rowing buste penché (Barre)','Curl biceps (Haltères)','Dips'];
function historique() {
  const exos = []; const MUS=['quadriceps','pectoraux','grand_dorsal','deltoide_lateral','biceps','triceps','ischio_jambiers','fessiers','deltoide_posterieur','abdominaux','mollets','bas_du_dos'];
  for (let i = 0; i < 153; i++) exos.push({ slug: 'exo-' + i, nom: (NOMS[i]||('Exercice ' + i)), mesure: i < 8 ? 'charge_reps' : i % 11 === 0 ? 'reps' : i % 29 === 0 ? 'temps' : 'charge_reps',
    charge: 'externe', parent: null, equipement: i % 2 ? 'haltere' : 'barre', muscles_primaires: [MUS[i % MUS.length]], muscles_secondaires: [], mouvement: null, barre_charge_fixe: false });
  const poids = exos.map((_, i) => 1 / Math.pow(i + 1, 1.0)); const tot = poids.reduce((a, b) => a + b, 0);
  const tire = () => { let r = alea() * tot; for (let i = 0; i < poids.length; i++) { r -= poids[i]; if (r <= 0) return i; } return 0; };
  const base = exos.map(() => 20 + Math.round(alea() * 16) * 5);
  const t0 = Date.parse('2023-06-05T17:00:00Z'), t1 = Date.parse('2026-11-02T05:00:00Z');
  const seances = [], series = []; let n = 0; const N = 627;
  for (let k = 0; k < N; k++) {
    const f = k / (N - 1);
    const t = t0 + f * (t1 - t0) - (k === N - 1 ? 0 : alea() * 86400000 * 0.5);
    const id = uuid('5e55e000', k), debut = new Date(t).toISOString();
    seances.push({ id, user_id: 'u-mesure', titre: 'Séance ' + k, debut, fin: new Date(t + 70 * 60000).toISOString(), statut: 'terminee', note: null, salle: null, routine_id: null, source: 'hevy', created_at: debut });
    const vus = new Set(); while (vus.size < 7) vus.add(tire());
    let rang = 0, left = 28 + (k % 3 === 0 ? 1 : 0);
    [...vus].forEach((ei, j) => {
      const ex = exos[ei], ns = j === 6 ? left : Math.min(4, left - (6 - j)); left -= ns;
      for (let s = 0; s < ns; s++) series.push({ id: uuid('5e7e0000', n++), session_id: id, user_id: 'u-mesure', exercise_slug: ex.slug,
        charge_kg: ex.mesure === 'charge_reps' ? base[ei] * (1 + f * 0.4) + Math.round(alea() * 4) * 2.5 : null, reps: 4 + Math.floor(alea() * 8),
        duree_s: ex.mesure === 'temps' ? 30 + Math.floor(alea() * 40) : null, distance_m: null, type_serie: s === 0 && alea() < .2 ? 'echauffement' : 'travail', rang: ++rang, groupe_superset: null,
        validee_a: null, rpe: null, ressenti: null, repos_s: null, note: null, source: 'hevy', created_at: debut, modifie_a: null, tempo: null, elastique: null, douleur: null, occurrence: null });
    });
  }
  return { exos, seances, series };
}
const H = historique();
const PESEES = []; { for (let k = 0; k < 160; k++) { const d = new Date(Date.parse('2025-05-01T07:00:00Z') + k * 3.2 * 86400000); PESEES.push({ id: 'p' + k, date: d.toISOString().slice(0, 10), poids_kg: Math.round((82 + Math.sin(k / 9) * 2 + k * 0.01) * 10) / 10, source: 'manuel' }); } }
const T0 = '2026-09-01T10:00:00.000Z';
const rs = (reId, k, type, reps) => ({ id: reId + '-s' + k, routine_exercise_id: reId, user_id: 'u-mesure', rang: k, type_serie: type, reps_visees: reps, charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null, au_max: false, created_at: T0 });
const ROUTINES = [{ id: uuid('0a000000', 1), user_id: 'u-mesure', nom: 'Haut A', note: null, archivee_a: null, rang: 0, dossier: 'P', jours: null, created_at: T0, modifiee_a: T0,
  routine_exercises: [0, 1, 3, 4, 5, 6].map((ei, j) => { const reId = uuid('0b000000', j); return { id: reId, routine_id: uuid('0a000000', 1), exercise_slug: 'exo-' + ei, rang: j, groupe_superset: null, note: null, repos_cible_s: 90, zone: null, created_at: T0,
    routine_sets: [rs(reId, 0, 'echauffement', 10), rs(reId, 1, 'travail', 8), rs(reId, 2, 'travail', 8), rs(reId, 3, 'travail', 8), rs(reId, 4, 'travail', 8)] }; }) }];
const BLOCS = [{ id: uuid('0c000000', 1), user_id: 'u-mesure', dossier: 'P', zone: 'hypertrophie', debut: '2026-11-02', semaines: 5, decharge: true, exercices: ['exo-0', 'exo-1'], statut: 'en_cours', precedent: null, grosse_serie: true, created_at: T0, modifie_a: T0 }];

const mediane = (l) => { const s = l.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// La page est CALME : 20 images de suite à moins de 50 ms l'une de l'autre (sous le ralenti ×4, un travail de fond les allonge).
// Le pas d'une boucle qui lit l'état à chaque image — pas un délai fixe.
const calme = (page) => page.evaluate(() => new Promise((ok) => {
  let n = 0, prec = performance.now();
  const tour = (t) => { n = (t - prec) < 50 ? n + 1 : 0; prec = t; if (n >= 20) ok(true); else requestAnimationFrame(tour); };
  requestAnimationFrame(tour);
}));

// Un geste : le clic, puis le premier rendu où `pret()` est vrai (MutationObserver), puis une image peinte. Rend des ms.
const mesurer = (page, clic, pret, arg) => page.evaluate(({ clic, pret, arg }) => new Promise((resolve) => {
  const c = eval('(' + clic + ')'), p = eval('(' + pret + ')'); const t0 = performance.now();
  const fin = () => requestAnimationFrame(() => resolve(performance.now() - t0));
  const obs = new MutationObserver(() => { let ok = false; try { ok = p(arg); } catch (e) {} if (ok) { obs.disconnect(); fin(); } });
  obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  try { c(arg); } catch (er) { obs.disconnect(); return resolve(-3); }
  setTimeout(() => { obs.disconnect(); resolve(-1); }, 30000);   // plafond : la borne d'une course, le rendu gagne dès qu'il vient
}), { clic: clic.toString(), pret: pret.toString(), arg }).then((t) => Math.round(t));

async function passage(port, errs) {
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const ctx = await nav.newContext({ viewport: { width: 380, height: 780 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => {
      localStorage.setItem('th-v2-auth', JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800, token_type: 'bearer', user: { id: 'u-mesure', email: 'mesure@test' } }));
      const vr = Storage.prototype.removeItem; Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vr.call(this, c); };
    });
    await ctx.route(/supabase\.co/, (route) => {
      const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop();
      const json = (d, s) => route.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(/vnd\.pgrst\.object/.test(req.headers()['accept'] || '') && Array.isArray(d) ? d[0] : d) });
      if (url.pathname.startsWith('/auth/')) return json({ error: 'x' }, 400);
      if (/count=exact/.test(req.headers()['prefer'] || '')) { const n = table === 'sessions' ? H.seances.length : table === 'sets' ? H.series.length : 0;
        return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-' + Math.max(0, n - 1) + '/' + n, 'access-control-expose-headers': 'content-range, content-length' }, body: '' }); }
      if (req.method() !== 'GET') { let b = null; try { b = req.postDataJSON(); } catch (e) {} return json(Array.isArray(b) ? b : (b ? [b] : []), 201); }
      const pag = (l, cle) => { const gt = url.searchParams.get(cle) || ''; if (gt.startsWith('gt.')) l = l.filter((q) => String(q[cle]) > gt.slice(3));
        l = l.slice().sort((a, b) => String(a[cle]).localeCompare(String(b[cle]))); const lim = Number(url.searchParams.get('limit') || 0); return lim ? l.slice(0, lim) : l; };
      if (table === 'sessions') return /statut=eq\.en_cours/.test(url.search) ? json([]) : json(pag(H.seances, 'id'));
      if (table === 'sets') return json(pag(H.series, 'id'));
      if (table === 'exercises') return json(pag(H.exos, 'slug'));
      if (table === 'routines') return json(ROUTINES);
      if (table === 'blocs') return json(BLOCS);
      if (table === 'body_weight_log') return json(PESEES);
      if (table === 'profiles') return json([{ id: 'u-mesure', username: 'mesure', onboarding_completed: true, intention: 'progresser', rythme_progression: 'franc', objectif: 'les_deux', questionnaire_fait_le: '2026-10-01T08:00:00.000Z', phase: 'maintien', sexe: 'homme', poids_kg: 82 }]);
      return json([]);
    });
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: RALENTI });
    await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
    await page.waitForSelector('#vue-liste:not([hidden])', { timeout: 150000 });
    await calme(page);
    await page.evaluate(() => [...document.querySelectorAll('.onglet')].find((b) => b.textContent.trim() === 'Saisie').click());
    await page.waitForSelector('button.demarrer', { timeout: 60000 });
    await calme(page);
    const g = {};
    g.demarrer = await mesurer(page, () => document.querySelector('button.demarrer').click(), () => document.querySelectorAll('.ligne-serie').length > 4);
    await calme(page);
    const val = [];
    // Lignes de la séance : 0 = chauffe du 1er exercice, 1 à 4 = ses séries de travail, 5 = chauffe du 2e, 6 = sa 1re série de travail.
    const valider = (k) => mesurer(page, (k) => document.querySelectorAll('.ligne-serie')[k].querySelector('.ok-serie').click(),
      (k) => document.querySelectorAll('.ligne-serie')[k].querySelector('.ok-serie.cochee'), k);
    const confirmer = () => page.evaluate(() => { [...document.querySelectorAll('button')].filter((b) => /^Oui/.test(b.textContent.trim())).forEach((b) => b.click()); });
    for (const k of [1, 2, 3, 4]) { val.push(await valider(k)); await confirmer(); await calme(page); }
    g.valider = Math.round(val.reduce((a, b) => a + b, 0) / val.length);
    g.suivant = await valider(6); await confirmer(); await calme(page);
    g.fiche = await mesurer(page, () => document.querySelector('.nom-exo').click(),
      () => { const v = document.getElementById('vue-exercice'); return !!v && !v.hidden && v.textContent.trim().length > 40; });
    return g;
  } finally { await nav.close(); }
}

(async () => {
  const rendre = await Verrou.prendre();
  const serveur = creer({ racine: path.join(R, 'v2'), gzip: true });
  const port = await Verrou.ecouter(serveur, 0);
  const errs = [], passages = [];
  try { for (let i = 0; i < PASSAGES; i++) passages.push(await passage(port, errs)); }
  finally { serveur.close(); rendre(); }
  const med = {}; GESTES.forEach(([k]) => { med[k] = mediane(passages.map((p) => p[k])); });
  if (process.argv.indexOf('--json') >= 0) console.log(JSON.stringify({ passages, med }));
  console.log('\n══ VITESSE (627 séances, processeur ×' + RALENTI + ', médiane de ' + PASSAGES + ') ══');
  let echec = 0;
  GESTES.forEach(([k, nom]) => {
    const plafond = PLAFONDS_MS[k], m = med[k], ok = m > 0 && m <= plafond;
    if (!ok) echec++;
    console.log('   ' + (ok ? '✅' : '❌') + ' ' + nom.padEnd(46) + String(m).padStart(6) + ' ms   plafond ' + String(plafond).padStart(6) + ' ms   (' + passages.map((p) => p[k]).join(' · ') + ')');
  });
  if (errs.length) { console.log('   ❌ erreurs de page : ' + errs.slice(0, 3).join(' | ')); echec++; }
  console.log(echec ? '\n   ' + echec + ' contrôle(s) en échec' : '\n   tout passe');
  process.exit(echec ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
