// tests/banc/garde-reseau.js — 59-4 : AUCUN NAVIGATEUR DE TEST NE PARLE À LA
// VRAIE BASE.
//
// Relevé 59-3 : le 06/10/2026, la suite Playwright v1 a créé 862 comptes
// anonymes dans la vraie base, parce qu'aucune de ses requêtes vers Supabase
// n'était interceptée. Les bancs v2 posent leur faux serveur à la main, contexte
// par contexte : un contexte oublié, une requête imprévue, et la vraie base
// répond.
//
// Ce module est le SEUL chemin pour ouvrir un navigateur de test :
//
//   const Garde = require('./garde-reseau.js');
//   const nav = await Garde.lancer(chromium, { executablePath: CHROME, … });
//
// Chaque contexte créé par `nav.newContext()` (et `nav.newPage()`, qui en crée
// un) reçoit, AVANT tout autre intercepteur, un filet de dernier recours sur
// `*.supabase.co` et l'hôte de `v2/js/config.js` :
//   - une requête que le faux serveur du banc n'a pas prise en charge est
//     COUPÉE (elle ne part jamais sur le réseau) et notée avec son URL ;
//   - un WebSocket vers Supabase : coupé et noté de même.
// Playwright essaie les intercepteurs du plus récent au plus ancien : ceux des
// bancs, posés après, passent donc avant et ne changent pas de comportement.
//
// Une fuite fait ÉCHOUER le banc : elle s'affiche tout de suite, se relit par
// `fuites()` (le banc de séance la verse dans ses erreurs de page, donc dans le
// rapport que fusionne le lanceur parallèle), et à la sortie du processus le
// code devient 1, quel que soit celui que le banc a choisi.
//
// La garde de structure (`tests/unit/v2-garde-reseau.test.js`) refuse tout
// fichier hors `archive/` qui lance un navigateur sans passer par ici.

const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, '../../v2/js/config.js');

// L'hôte du projet, lu dans la configuration de l'app : si le projet change de
// domaine, la garde le suit sans qu'on la réécrive.
function hoteDeLaConfig() {
  try {
    const m = /URL\s*:\s*['"]([^'"]+)['"]/.exec(fs.readFileSync(CONFIG, 'utf8'));
    return m ? new URL(m[1]).hostname : null;
  } catch (e) { return null; }
}
const HOTE = hoteDeLaConfig();

function versSupabase(url) {
  let h;
  try { h = new URL(String(url)).hostname; } catch (e) { return false; }
  return h === 'supabase.co' || /\.supabase\.co$/.test(h) || (!!HOTE && h === HOTE);
}

const vues = [];
function signaler(quoi, url) {
  const ligne = quoi + ' ' + url;
  if (vues.indexOf(ligne) >= 0) return;
  vues.push(ligne);
  console.error('❌ [garde réseau] requête vers la vraie base, non prise en charge par le banc : ' + ligne);
}

function fuites() { return vues.slice(); }

async function garderContexte(ctx) {
  if (ctx.__gardeReseau) return ctx;
  ctx.__gardeReseau = true;
  await ctx.route(versSupabase, (route) => {
    signaler(route.request().method(), route.request().url());
    return route.abort('blockedbyclient');
  });
  await ctx.routeWebSocket(versSupabase, (ws) => {
    signaler('WebSocket', ws.url());
    ws.close();
  });
  return ctx;
}

// Lance le navigateur et garde chacun de ses contextes, y compris celui que
// `newPage()` crée en douce.
//
// À la sortie du processus, une fuite force le code 1 — posé ici, par le banc
// qui lance un navigateur, et pas au chargement du module (un test unitaire qui
// le charge n'a pas à hériter de ce verdict).
let surveille = false;
function surveillerLaSortie() {
  if (surveille) return;
  surveille = true;
  process.on('exit', () => {
    if (!vues.length) return;
    console.error('\n❌ [garde réseau] ' + vues.length + ' requête(s) vers la vraie base :\n   ' + vues.join('\n   '));
    process.exitCode = 1;
  });
}

async function lancer(chromium, options) {
  surveillerLaSortie();
  const nav = await chromium.launch(options);
  const creer = nav.newContext.bind(nav);
  nav.newContext = async (o) => garderContexte(await creer(o));
  nav.newPage = async (o) => {
    const ctx = await nav.newContext(o);
    const page = await ctx.newPage();
    page.on('close', () => { ctx.close().catch(() => {}); });
    return page;
  };
  return nav;
}

module.exports = { lancer, garderContexte, versSupabase, fuites, HOTE };
