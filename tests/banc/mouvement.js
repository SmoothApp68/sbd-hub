#!/usr/bin/env node
// tests/banc/mouvement.js — 271 : L'ANIMATION 3D DU MOUVEMENT, dans la vraie app (`v2/`), navigateur réel, faux Supabase.
//
// Contrôles :
//   A. la fiche « Comment faire » de squat_barre : la vue 3D se monte AU-DESSUS de la fiche et des étapes (un canevas WebGL),
//      les muscles de la légende sont ceux du CATALOGUE de l'app (le faux `exercises`), three.js est injecté depuis /vendor/
//      (jamais par index.html), aucune violation de CSP, aucune erreur ; les commandes répondent (Fin, Dos) ;
//   B. 10 allers-retours fiche → Retour → fiche : jamais plus d'UN contexte WebGL vivant, zéro après chaque sortie
//      (`arreter()` à chaque sortie et à chaque rendu : changer d'onglet compris) ;
//   C. un exercice SANS animation : aucun bloc, aucune requête vers /vendor/three ni /mouvements/ ;
//   D. hors ligne et jamais vu (les fichiers du mouvement refusés) : le bloc disparaît, sans erreur, la page reste ;
//   E. mouvement réduit : la vue montre la pose de Fin (bouton « Fin » pressé), sans boucle ;
//   F. tour 9 : « Profil » ramène la vue de profil après « Dos » ; un exercice à un bras (`cote: 'droit'`) ne colore que
//      le côté droit, un exercice à deux bras les deux ; la main O (haltère tenu à deux mains) ne s'affiche qu'au pull-over.
//      CAPTURES=<dossier> : une capture par exercice (pull_over, tirage_vers_visage, escaliers).
//
//   node tests/banc/mouvement.js

'use strict';
const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const Verrou = require(path.join(R, 'tests/banc/verrou.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// WebGL logiciel (une machine de CI n'a pas de carte graphique)
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const EXOS = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', parent: null, equipement: 'barre', mouvement: null, barre_charge_fixe: false,
    muscles_primaires: ['quadriceps', 'adducteurs', 'fessiers'], muscles_secondaires: [], muscles_stabilisateurs: ['abdominaux', 'bas_du_dos', 'ischio_jambiers'],
    description: 'La barre repose sur le haut du dos.\nDescends en gardant le dos droit.\nRemonte en poussant dans le sol.' },
  { slug: 'curl_marteau', nom: 'Curl marteau (Haltères)', mesure: 'charge_reps', charge: 'externe', parent: null, equipement: 'haltere', mouvement: null, barre_charge_fixe: false,
    muscles_primaires: ['biceps'], muscles_secondaires: ['avant_bras'], muscles_stabilisateurs: [],
    description: 'Les pouces en haut.\nLes coudes collés au corps.' },
  ...[['elevation_laterale_poulie', 'Élévation Latérale (Poulie)', 'poulie', ['deltoide_lateral'], ['trapezes'], []],
    ['pull_over', 'Pull-Over (Haltère)', 'haltere', ['pectoraux'], ['grand_dorsal', 'triceps'], []],
    ['tirage_vers_visage', 'Face Pull (Poulie)', 'poulie', ['deltoide_posterieur'], ['trapezes', 'haut_du_dos'], []],
    ['escaliers', 'Escaliers', 'machine', ['quadriceps', 'fessiers'], ['ischio_jambiers', 'mollets'], []]].map((x) => ({
    slug: x[0], nom: x[1], mesure: 'charge_reps', charge: 'externe', parent: null, equipement: x[2], mouvement: null, barre_charge_fixe: false,
    muscles_primaires: x[3], muscles_secondaires: x[4], muscles_stabilisateurs: x[5], description: 'Première étape.\nDeuxième étape.\nTroisième étape.' }))
];

let ko = 0;
const verifier = (c, m) => { console.log((c ? '   ✅ ' : '   ❌ ') + m); if (!c) ko++; };

async function contexte(nav, port, opts) {
  const ctx = await nav.newContext(Object.assign({ viewport: { width: 380, height: 800 }, deviceScaleFactor: 2 }, opts || {}));
  await ctx.addInitScript(() => {
    localStorage.setItem('th-v2-auth', JSON.stringify({ access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800, token_type: 'bearer', user: { id: 'u-mvt', email: 'mvt@test' } }));
    const vr = Storage.prototype.removeItem; Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vr.call(this, c); };
    // les violations de CSP et les contextes WebGL, comptés depuis la page
    window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    window.__gl = { crees: 0, perdus: 0, max: 0 };
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t) {
      const neuf = !this.__compte && /webgl/.test(t);
      const c = gc.apply(this, arguments);
      if (neuf && c) { this.__compte = true; window.__gl.crees++; window.__gl.max = Math.max(window.__gl.max, window.__gl.crees - window.__gl.perdus);
        this.addEventListener('webglcontextlost', () => { window.__gl.perdus++; }); }
      return c;
    };
  });
  await ctx.route(/supabase\.co/, (route) => {
    const req = route.request(), url = new URL(req.url()), table = url.pathname.split('/').pop();
    const json = (d, s) => route.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(/vnd\.pgrst\.object/.test(req.headers()['accept'] || '') && Array.isArray(d) ? d[0] : d) });
    if (url.pathname.startsWith('/auth/')) return json({ error: 'x' }, 400);
    if (/count=exact/.test(req.headers()['prefer'] || '')) return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'content-range': '*/0', 'access-control-expose-headers': 'content-range, content-length' }, body: '' });
    if (req.method() !== 'GET') { let b = null; try { b = req.postDataJSON(); } catch (e) {} return json(Array.isArray(b) ? b : (b ? [b] : []), 201); }
    if (table === 'exercises') return json(url.searchParams.get('slug') && /^gt\./.test(url.searchParams.get('slug')) ? [] : EXOS);
    if (table === 'profiles') return json([{ id: 'u-mvt', username: 'mvt', onboarding_completed: true, intention: 'progresser', rythme_progression: 'franc', objectif: 'les_deux', questionnaire_fait_le: '2026-10-01T08:00:00.000Z', phase: 'maintien', sexe: 'homme', poids_kg: 82 }]);
    return json([]);
  });
  return ctx;
}

async function page(ctx, port, errs) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror ' + String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error' && !/GL Driver Message|GPU stall|WebGL/.test(m.text())) errs.push('console ' + m.text().slice(0, 200)); });
  return p;
}
const ouvrirFiche = async (p, port, slug) => {
  await p.goto('http://127.0.0.1:' + port + '/exercice/' + slug + '/comment', { waitUntil: 'load' });
  await p.waitForSelector('#vue-exercice:not([hidden]) .etapes', { timeout: 90000 });
};
const vivants = (p) => p.evaluate(() => window.__gl.crees - window.__gl.perdus);

(async () => {
  const rendre = await Verrou.prendre();
  const serveur = creer({ racine: path.join(R, 'v2'), gzip: true });
  const port = await Verrou.ecouter(serveur, 0);
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ARGS });
  try {
    // ── A et B ──
    {
      const errs = [], req = [];
      const ctx = await contexte(nav, port); const p = await page(ctx, port, errs);
      p.on('request', (r) => req.push(new URL(r.url()).pathname));
      await ouvrirFiche(p, port, 'squat_barre');
      await p.waitForSelector('.exo-mouvement canvas.thm-canevas', { timeout: 90000 });
      const a = await p.evaluate(() => {
        const page = document.getElementById('page-exercice'), m = page.querySelector('.exo-mouvement');
        const apres = (x) => !!x && !!(m.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
        return { avantFiche: apres(page.querySelector('.exo-comment-fiche')), avantEtapes: apres(page.querySelector('.etapes')),
          leg: m.querySelector('.thm-leg') ? m.querySelector('.thm-leg').textContent : '', canevas: document.querySelectorAll('canvas.thm-canevas').length,
          scripts: [...document.scripts].map((s) => s.getAttribute('src') || ''), styleAttr: m.querySelectorAll('[style]').length,
          boutons: [...m.querySelectorAll('button')].map((b) => b.textContent), large: m.getBoundingClientRect().right <= 380.5, three: typeof THREE };
      });
      if (process.env.CAPTURE) { await p.waitForTimeout(800); await p.screenshot({ path: process.env.CAPTURE, fullPage: true }); }
      verifier(a.avantFiche && a.avantEtapes, 'A · la vue 3D est juste au-dessus du texte qui décrit l’exercice (fiche et étapes)');
      verifier(a.canevas === 1, 'A · un seul canevas WebGL (' + a.canevas + ')');
      verifier(/Travaille\s*Quadriceps, Adducteurs, Fessiers/.test(a.leg) && /Stabilise\s*Abdominaux, Bas du dos, Ischio-jambiers/.test(a.leg) && !/Aide/.test(a.leg),
        'A · la légende lit le catalogue de l’app : « ' + a.leg + ' »');
      verifier(a.scripts.some((s) => s === '/vendor/three.min.js') && a.scripts.some((s) => s === '/vendor/GLTFLoader.js') && a.three === 'object', 'A · three.js et GLTFLoader injectés à la demande depuis /vendor/');
      verifier(req.indexOf('/mouvements/corps-glb.json') >= 0 && req.indexOf('/mouvements/squat_barre.json') >= 0, 'A · le corps et l’exercice lus dans /mouvements/');
      verifier(a.styleAttr === 0, 'A · aucun attribut style dans le bloc (' + a.styleAttr + ')');
      verifier(a.boutons.join('|') === 'Profil|Face|Dos|Départ|Fin|▶ Lecture', 'A · les commandes : ' + a.boutons.join(' · '));
      verifier(a.large, 'A · aucun débordement à 380 px');
      await p.click('.exo-mouvement [data-pose=fin]');
      verifier(await p.getAttribute('.exo-mouvement [data-pose=fin]', 'aria-pressed') === 'true', 'A · « Fin » : la pose de fin, bouton pressé');
      await p.click('.exo-mouvement [data-pose=joue]');
      verifier(await p.getAttribute('.exo-mouvement [data-pose=joue]', 'aria-pressed') === 'true', 'A · « ▶ Lecture » repart');
      await p.click('.exo-mouvement [data-vue=dos]');
      // l'onglet « Résumé » (un nouveau rendu de la page) arrête la vue ; revenir à « Comment faire » la remonte
      await p.evaluate(() => [...document.querySelectorAll('.sous-onglet')].find((b) => /Résumé/.test(b.textContent)).click());
      await p.waitForFunction(() => !document.querySelector('.exo-mouvement') && THMouvement.etat().montees === 0 && !THMouvement.etat().atelier, null, { timeout: 30000 });
      verifier(await vivants(p) === 0, 'B · changer d’onglet arrête la vue : aucun contexte WebGL vivant');
      await p.evaluate(() => [...document.querySelectorAll('.sous-onglet')].find((b) => /Comment faire/.test(b.textContent)).click());
      await p.waitForSelector('.exo-mouvement canvas.thm-canevas', { timeout: 60000 });
      let pire = 0, restes = [];
      for (let i = 0; i < 10; i++) {
        // sortir par un onglet (Saisie), revenir par le retour du navigateur (le retour d'Android)
        await p.evaluate(() => [...document.querySelectorAll('.onglet')].find((b) => b.textContent.trim() === 'Saisie').click());
        await p.waitForFunction(() => document.getElementById('vue-exercice').hidden, null, { timeout: 30000 });
        restes.push(await p.evaluate(() => [window.__gl.crees - window.__gl.perdus, document.querySelectorAll('canvas.thm-canevas').length, THMouvement.etat().montees, THMouvement.etat().atelier ? 1 : 0].join('/')));
        await p.evaluate(() => history.back());
        await p.waitForSelector('#vue-exercice:not([hidden]) .exo-mouvement canvas.thm-canevas', { timeout: 60000 });
        pire = Math.max(pire, await vivants(p));
      }
      const gl = await p.evaluate(() => window.__gl);
      verifier(restes.every((x) => x === '0/0/0/0'), 'B · 10 sorties : 0 contexte vivant, 0 canevas, 0 vue, pas de rendu (' + [...new Set(restes)].join(', ') + ')');
      verifier(pire === 1 && gl.max === 1, 'B · jamais plus d’un contexte WebGL vivant (max ' + gl.max + ', ' + gl.crees + ' créés, ' + gl.perdus + ' rendus)');
      verifier(await p.evaluate(() => THMouvement.etat().montees) === 1, 'B · une seule vue montée à la fin');
      // « ← Retour », sur une fiche ouverte directement (la pile de l'app est vide : il mène à la semaine)
      await ouvrirFiche(p, port, 'squat_barre');
      await p.waitForSelector('.exo-mouvement canvas.thm-canevas', { timeout: 60000 });
      await p.click('#btn-retour-exercice');
      await p.waitForFunction(() => document.getElementById('vue-exercice').hidden, null, { timeout: 30000 });
      verifier(await p.evaluate(() => window.__gl.crees - window.__gl.perdus === 0 && !document.querySelector('canvas.thm-canevas') && THMouvement.etat().montees === 0 && !THMouvement.etat().atelier),
        'B · « ← Retour » arrête la vue et rend le contexte');
      const csp = await p.evaluate(() => window.__csp);
      verifier(!csp.length, 'A · aucune violation de CSP' + (csp.length ? ' : ' + csp.join(' | ') : ''));
      verifier(!errs.length, 'A/B · aucune erreur de page ni de console' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
      await ctx.close();
    }
    // ── C : un exercice sans animation ──
    {
      const errs = [], req = [];
      const ctx = await contexte(nav, port); const p = await page(ctx, port, errs);
      p.on('request', (r) => req.push(new URL(r.url()).pathname));
      await ouvrirFiche(p, port, 'curl_marteau');
      await p.waitForTimeout(0);
      await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(ok)))));
      const c = await p.evaluate(() => ({ bloc: !!document.querySelector('.exo-mouvement, .thm'), three: typeof THREE }));
      verifier(!c.bloc, 'C · un exercice sans animation : aucun bloc');
      verifier(c.three === 'undefined' && !req.some((u) => /^\/(vendor\/(three|GLTF)|mouvements\/)/.test(u)), 'C · ni three.js ni fichier de mouvement chargé');
      verifier(!errs.length, 'C · aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
      await ctx.close();
    }
    // ── D : hors ligne et jamais vu ──
    {
      const errs = [];
      const ctx = await contexte(nav, port); const p = await page(ctx, port, errs);
      await ctx.route(/\/(mouvements|vendor\/(three|GLTF))/, (r) => r.abort('internetdisconnected'));
      await ouvrirFiche(p, port, 'squat_barre');
      await p.waitForFunction(() => { const m = document.querySelector('.exo-mouvement'); return m && !m.childNodes.length && THMouvement.etat().montees === 0; }, null, { timeout: 60000 });
      const d = await p.evaluate(() => ({ visible: getComputedStyle(document.querySelector('.exo-mouvement')).display, etapes: document.querySelectorAll('.etapes .etape').length }));
      verifier(d.visible === 'none' && d.etapes === 3, 'D · hors ligne, jamais vu : le bloc ne s’affiche pas, la page reste (' + d.etapes + ' étapes)');
      verifier(!errs.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length, 'D · sans erreur' + (errs.length ? ' (réseau seulement : ' + errs.length + ')' : ''));
      // le réseau revient : la fiche suivante réessaie (un échec n'est jamais gardé)
      await ctx.unroute(/\/(mouvements|vendor\/(three|GLTF))/);
      await p.evaluate(() => [...document.querySelectorAll('.sous-onglet')].find((b) => /Résumé/.test(b.textContent)).click());
      await p.evaluate(() => [...document.querySelectorAll('.sous-onglet')].find((b) => /Comment faire/.test(b.textContent)).click());
      await p.waitForSelector('.exo-mouvement canvas.thm-canevas', { timeout: 90000 });
      verifier(true, 'D · le réseau revenu, la fiche suivante monte la vue');
      await ctx.close();
    }
    // ── E : mouvement réduit ──
    {
      const errs = [];
      const ctx = await contexte(nav, port, { reducedMotion: 'reduce' }); const p = await page(ctx, port, errs);
      await ouvrirFiche(p, port, 'squat_barre');
      await p.waitForSelector('.exo-mouvement canvas.thm-canevas', { timeout: 90000 });
      const e = await p.evaluate(() => [...document.querySelectorAll('.exo-mouvement [data-pose]')].map((b) => b.getAttribute('data-pose') + '=' + b.getAttribute('aria-pressed')).join(','));
      verifier(e === 'depart=false,fin=true,joue=false', 'E · mouvement réduit : la pose de Fin, sans boucle (' + e + ')');
      verifier(!errs.length, 'E · aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
      await ctx.close();
    }
    // ── F : tour 9 (Profil, un seul côté, la main O) ──
    {
      const errs = [];
      const ctx = await contexte(nav, port, { reducedMotion: 'reduce' }); const p = await page(ctx, port, errs);
      const diag = () => p.evaluate(() => THMouvement.etat().diagnostic);
      const monte = async (slug) => {
        await ouvrirFiche(p, port, slug);
        await p.waitForSelector('.exo-mouvement canvas.thm-canevas', { timeout: 90000 });
        return diag();
      };
      let d = await monte('pull_over');
      const bt = await p.evaluate(() => [...document.querySelectorAll('.exo-mouvement button')].map((b) => b.textContent).join('|'));
      verifier(bt === 'Profil|Face|Dos|Départ|Fin|▶ Lecture', 'F · les commandes : ' + bt);
      verifier(d.mains.O && !d.mains.B && !d.mains.D, 'F · pull-over : la main O seule (' + JSON.stringify(d.mains) + ')');
      verifier(d.colores.droit > 0 && d.colores.gauche > 0, 'F · pull-over (deux bras) : les deux côtés colorés (' + d.colores.droit + ' / ' + d.colores.gauche + ')');
      if (process.env.CAPTURES) await p.screenshot({ path: path.join(process.env.CAPTURES, 'pull_over.png'), fullPage: true });
      await p.click('.exo-mouvement [data-vue=dos]');
      const dos = await diag();
      await p.click('.exo-mouvement [data-vue=profil]');
      const pro = await diag();
      verifier(Math.abs(dos.az - (-90)) < 0.5 && Math.abs(pro.az) < 0.5 && Math.abs(pro.el - 6) < 0.5, 'F · « Profil » répond : de dos (az ' + dos.az + ') à profil (az ' + pro.az + ', él ' + pro.el + ')');
      d = await monte('elevation_laterale_poulie');
      verifier(d.colores.droit > 0 && d.colores.gauche === 0, 'F · élévation latérale à un bras (cote droit) : le côté droit seul coloré (' + d.colores.droit + ' / ' + d.colores.gauche + ')');
      verifier(!d.mains.O && d.mains.D, 'F · hors pull-over : pas de main O (' + JSON.stringify(d.mains) + ')');
      for (const slug of ['tirage_vers_visage', 'escaliers']) {
        d = await monte(slug);
        verifier(!d.mains.O && d.colores.droit > 0 && d.colores.gauche > 0, 'F · ' + slug + ' : deux côtés colorés, pas de main O');
        if (process.env.CAPTURES) await p.screenshot({ path: path.join(process.env.CAPTURES, slug + '.png'), fullPage: true });
      }
      verifier(!errs.length, 'F · aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
      await ctx.close();
    }
  } catch (e) { verifier(false, '[exception] ' + (e && e.stack || e)); }
  finally { await nav.close(); serveur.close(); rendre(); }
  console.log(ko ? '\n   ' + ko + ' contrôle(s) en échec' : '\n   tout passe');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
