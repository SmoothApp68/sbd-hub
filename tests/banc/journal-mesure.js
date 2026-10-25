#!/usr/bin/env node
// tests/banc/journal-mesure.js — LA MESURE DU REMPLISSAGE DU JOURNAL (58-2).
//
// Le journal des records (MOTEUR §9.23) se remplit une fois, au premier
// démarrage qui trouve le journal du serveur vide : l'app rejoue les records de
// TOUTES les séances passées, en tranches qui rendent la main. Ce script mesure
// combien de temps ça prend, et si l'écran reste disponible, sur un historique
// de la taille réelle du plus gros compte (≈ 1 260 séances, ≈ 28 000 séries).
//
// ⚠️ UN HISTORIQUE SYNTHÉTIQUE, PAS LES DONNÉES D'AURÉLIEN : le dépôt n'en porte
// pas (et ne doit pas en porter). Il en reprend les ordres de grandeur —
// 1 260 séances sur trois ans et demi, 7 à 8 exercices par séance, 3 à 4 séries
// de travail chacun, des charges qui montent lentement avec du bruit (donc des
// records réguliers), un tiers de matériels de salle (la fenêtre des 12 mois).
//
// Le vrai navigateur, la vraie app (`v2/`), un faux Supabase en mémoire. Deux
// passes : la machine telle quelle, puis le processeur ralenti ×4 (l'outil de
// développement de Chromium) — l'ordre de grandeur d'un téléphone Android
// milieu de gamme. Rien n'est contrôlé : c'est une MESURE, rapportée telle
// quelle (`--json` pour la sortie brute).
//
//   node tests/banc/journal-mesure.js [--seances 1260] [--exercices 100] [--ralenti 4] [--json]

'use strict';
const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
// 59-4 — tout navigateur de test passe par la garde réseau (aucune requête vers la vraie base).
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// 168 : pas de port fixe — le système en donne un libre à l'écoute (PORT/BASE sont posés là).
let PORT = Number(process.env.BANC_PORT || 0), BASE = '';

const arg = (nom, defaut) => {
  const i = process.argv.indexOf('--' + nom);
  return i >= 0 ? process.argv[i + 1] : defaut;
};
const N_SEANCES = Number(arg('seances', 1260));
const RALENTI = Number(arg('ralenti', 4));
// Le nombre d'exercices DISTINCTS de l'historique décide du coût : chaque série
// se compare à l'historique de SON exercice. 100 : l'ordre de grandeur d'un
// compte réel (catalogue de 237, ~8 exercices par séance) ; 60 : pessimiste.
const N_EXOS = Number(arg('exercices', 100));
const JSON_SEUL = process.argv.indexOf('--json') >= 0;

// ── L'historique synthétique (déterministe : un générateur à graine) ────────
function graine(n) {
  let x = n >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
const MATERIELS = ['barre', 'barre', 'barre', 'haltere', 'haltere', 'machine', 'machine', 'poulie', 'aucun'];
function catalogue(nExos) {
  const out = [];
  for (let i = 0; i < nExos; i++) {
    const eq = MATERIELS[i % MATERIELS.length];
    out.push({ slug: 'exo-' + i, nom: 'Exercice ' + i, mesure: eq === 'aucun' ? 'reps' : 'charge_reps',
      charge: eq === 'aucun' ? 'corps' : 'externe', parent: null, equipement: eq,
      muscles_primaires: ['m' + (i % 12)], muscles_secondaires: [], mouvement: null });
    // 128 (v2_099) — `barre_charge_fixe` sur les exercices à la barre, comme en base : une barre qu'on charge.
    if (eq === 'barre') out[out.length - 1].barre_charge_fixe = false;
  }
  return out;
}
const uuid = (pref, n) => pref + '-0000-4000-8000-' + String(n).padStart(12, '0');

function historique(nSeances, nExos) {
  const alea = graine(58);
  const exos = catalogue(nExos || 100);
  const seances = [], series = [];
  const debut0 = Date.now() - nSeances * 1.05 * 86400000;
  const niveau = {};
  exos.forEach((e, i) => { niveau[e.slug] = e.equipement === 'aucun' ? 0 : 20 + (i % 10) * 8; });
  let nSet = 0;
  for (let k = 0; k < nSeances; k++) {
    const id = uuid('5e55e000', k);
    const debut = new Date(debut0 + k * 1.05 * 86400000 + Math.floor(alea() * 3600000)).toISOString();
    seances.push({ id, user_id: 'u-mesure', titre: 'Séance ' + k, debut,
      fin: new Date(Date.parse(debut) + 75 * 60000).toISOString(), statut: 'terminee', note: null,
      salle: null, routine_id: null, source: 'hevy', created_at: debut });
    const nExo = 7 + Math.floor(alea() * 2);
    const depart = Math.floor(alea() * exos.length);
    let rang = 0;
    for (let e = 0; e < nExo; e++) {
      const ex = exos[(depart + e * 7) % exos.length];
      // Une progression lente, du bruit, et des retours en arrière.
      niveau[ex.slug] = Math.max(0, niveau[ex.slug] + (alea() < 0.6 ? 0.5 : -0.4));
      const nSer = 3 + Math.floor(alea() * 2);
      for (let s = 0; s < nSer; s++) {
        const reps = 5 + Math.floor(alea() * 8);
        const charge = ex.equipement === 'aucun' ? null
          : Math.round((niveau[ex.slug] + (alea() - 0.5) * 6) / 2.5) * 2.5;
        series.push({ id: uuid('5e7e0000', nSet++), session_id: id, user_id: 'u-mesure', exercise_slug: ex.slug,
          charge_kg: charge, reps, duree_s: null, distance_m: null, type_serie: 'travail', rang: ++rang,
          groupe_superset: null, validee_a: null, rpe: null, ressenti: null, repos_s: null, note: null,
          source: 'hevy', created_at: debut, modifie_a: null, tempo: null, elastique: null,
          douleur: null, occurrence: null });
      }
    }
  }
  return { exos, seances, series };
}

async function passe(h, ralenti) {
  const base = { records: [], requetes: 0, lots: [] };
  const serveur = creer({ racine: path.join(R, 'v2') });
  PORT = await require('./verrou.js').ecouter(serveur, PORT); BASE = 'http://127.0.0.1:' + PORT;
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const ctx = await nav.newContext({ viewport: { width: 360, height: 760 } });
    await ctx.addInitScript(() => {
      const JETON = JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800,
        token_type: 'bearer', user: { id: 'u-mesure', email: 'mesure@test' } });
      localStorage.setItem('th-v2-auth', JETON);
      const vraiRemove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vraiRemove.call(this, c); };
      // LA SONDE DE L'ÉCRAN : un minuteur toutes les 16 ms. L'écart le plus long
      // entre deux battements, pendant le remplissage, est le temps pendant
      // lequel l'app n'aurait pas pu répondre à un geste.
      window.__battements = [];
      setInterval(() => { window.__battements.push(performance.now()); }, 16);
    });
    const pagine = (liste, url, cle) => {
      let l = liste;
      const gt = url.searchParams.get(cle) || '';
      if (gt.startsWith('gt.')) l = l.filter((x) => String(x[cle]) > gt.slice(3));
      const ca = url.searchParams.get('created_at') || '';
      if (ca.startsWith('gt.')) l = l.filter((x) => String(x.created_at) > ca.slice(3));
      l = l.slice().sort((a, b) => String(a[cle]).localeCompare(String(b[cle])));
      const lim = Number(url.searchParams.get('limit') || 0);
      return lim ? l.slice(0, lim) : l;
    };
    await ctx.route(/supabase\.co/, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      base.requetes++;
      const json = (data, status) => route.fulfill({ status: status || 200, contentType: 'application/json',
        body: JSON.stringify(/vnd\.pgrst\.object/.test(req.headers()['accept'] || '') && Array.isArray(data) ? data[0] : data) });
      if (url.pathname.startsWith('/auth/')) return json({ error: 'x' }, 400);
      if (/count=exact/.test(req.headers()['prefer'] || '')) {
        const n = table === 'sessions' ? h.seances.length : table === 'sets' ? h.series.length
          : table === 'records' ? base.records.length : 0;
        return route.fulfill({ status: 200, headers: { 'content-type': 'application/json',
          'content-range': '0-' + Math.max(0, n - 1) + '/' + n,
          'access-control-expose-headers': 'content-range, content-length' }, body: '' });
      }
      if (req.method() === 'GET') {
        if (table === 'sessions') {
          if (/statut=eq\.en_cours/.test(url.search)) return json([]);
          return json(pagine(h.seances, url, 'id'));
        }
        if (table === 'sets') return json(pagine(h.series, url, 'id'));
        if (table === 'exercises') return json(pagine(h.exos, url, 'slug'));
        if (table === 'records') return json(pagine(base.records, url, 'id'));
        // 60-2a — `questionnaire_fait_le` posé : le questionnaire ne s'ouvre pas
        // par-dessus la mesure (il s'ouvre sur une ligne dont la colonne est VIDE).
        if (table === 'profiles') return json([{ id: 'u-mesure', username: 'mesure', onboarding_completed: true,
          intention: 'progresser', rythme_progression: 'normal', questionnaire_fait_le: '2026-10-01T08:00:00.000Z' }]);
        return json([]);
      }
      if (req.method() === 'POST' && table === 'records') {
        const lignes = JSON.parse(req.postData() || '[]');
        const vus = new Set(base.records.map((x) => x.set_id + '|' + x.type));
        lignes.forEach((l) => {
          const k = l.set_id + '|' + l.type;
          if (vus.has(k)) return;
          vus.add(k);
          base.records.push(Object.assign({}, l, { id: uuid('4ec0d000', base.records.length),
            created_at: new Date().toISOString() }));
        });
        base.lots.push({ n: lignes.length, a: Date.now() });
        return json([], 201);
      }
      return json([], 201);
    });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
    if (ralenti > 1) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: ralenti });
    }
    const t0 = Date.now();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    let etat = null;
    for (let t = 0; t < 600000; t += 500) {
      etat = await page.evaluate(() => window.THApp && THApp.journal ? THApp.journal() : null).catch(() => null);
      if (etat && etat.remplissage && etat.remplissage.fin) break;
      await new Promise((r) => setTimeout(r, 500));   // le pas d'une attente d'état (la boucle lit l'état)
    }
    const tFin = Date.now();
    // La file se vide : tout est monté.
    for (let t = 0; t < 120000; t += 500) {
      const reste = await page.evaluate(() => THCache.lireAttente().then((f) => (f || []).length));
      if (!reste) break;
      await new Promise((r) => setTimeout(r, 500));   // le pas d'une attente d'état (la boucle lit l'état)
    }
    const tMonte = Date.now();
    const sonde = await page.evaluate((r) => {
      // L'horloge de la page (`performance.now`) contre celle du remplissage
      // (`Date.now`) : on les recale par l'instant présent.
      const decalage = Date.now() - performance.now();
      const dans = window.__battements.map((b) => b + decalage).filter((b) => b >= r.debut && b <= r.fin);
      let ecart = 0;
      for (let i = 1; i < dans.length; i++) ecart = Math.max(ecart, dans[i] - dans[i - 1]);
      return { battements: dans.length, plusLongEcart: Math.round(ecart) };
    }, etat.remplissage);
    const meta = await page.evaluate(() => THCache.lireMeta('journalRecords'));
    return {
      ralenti, seances: h.seances.length, series: h.series.length,
      remplissage: etat.remplissage,
      calculMs: etat.remplissage.fin - etat.remplissage.debut,
      depuisOuvertureMs: tFin - t0,
      jusquaToutMonteMs: tMonte - t0,
      lignesEnBase: base.records.length, lots: base.lots.length,
      sonde, journal: meta, erreurs
    };
  } finally {
    await nav.close();
    await new Promise((r) => serveur.close(r));
  }
}

(async () => {
  await require('./verrou.js').prendre();   // 168
  const h = historique(N_SEANCES, N_EXOS);
  const out = [];
  for (const ralenti of [1, RALENTI]) out.push(await passe(h, ralenti));
  if (JSON_SEUL) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log('Historique synthétique : ' + h.seances.length + ' séances, ' + h.series.length + ' séries, ' +
    h.exos.length + ' exercices');
  out.forEach((m) => {
    const r = m.remplissage;
    console.log('\n── processeur ' + (m.ralenti > 1 ? 'ralenti ×' + m.ralenti + ' (ordre de grandeur d’un téléphone)' : 'de la machine'));
    console.log('   calcul des records (tranches comprises) : ' + (m.calculMs / 1000).toFixed(1) + ' s');
    console.log('   ' + r.tranches + ' tranches, la plus longue ' + r.plusLongueTranche + ' ms');
    console.log('   plus long écart de l’écran pendant le remplissage : ' + m.sonde.plusLongEcart + ' ms (' +
      m.sonde.battements + ' battements)');
    console.log('   ' + r.lignes + ' lignes, ' + r.lots + ' lots ; en base : ' + m.lignesEnBase);
    console.log('   depuis l’ouverture : remplissage posé à ' + (m.depuisOuvertureMs / 1000).toFixed(1) +
      ' s, tout monté à ' + (m.jusquaToutMonteMs / 1000).toFixed(1) + ' s ; journal « ' + (m.journal || {}).etat + ' »');
    if (m.erreurs.length) console.log('   erreurs de page : ' + m.erreurs.join(' | '));
  });
})().catch((e) => { console.error(e); process.exit(1); });
