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

// 247 — LE CAPTCHA. L'app charge le script de Cloudflare Turnstile (`challenges.cloudflare.com`) quand sa clé de
// site est posée : un banc qui le laisserait partir parlerait à un tiers réel (et à la protection anti-robot de
// Cloudflare), exactement comme un banc qui parlerait à la vraie base. Même filet, même règle : le banc sert un FAUX
// widget (`page.route`) ; ce qu'il n'a pas pris en charge est coupé, noté et fait échouer le banc.
function versCloudflare(url) {
  let h;
  try { h = new URL(String(url)).hostname; } catch (e) { return false; }
  return h === 'challenges.cloudflare.com';
}
const aCouper = (url) => versSupabase(url) || versCloudflare(url);

const vues = [];
function signaler(quoi, url) {
  const ligne = quoi + ' ' + url;
  if (vues.indexOf(ligne) >= 0) return;
  vues.push(ligne);
  console.error('❌ [garde réseau] requête vers la vraie base (ou vers Cloudflare Turnstile), non prise en charge par le banc : ' + ligne);
}

function fuites() { return vues.slice(); }

async function garderContexte(ctx) {
  if (ctx.__gardeReseau) return ctx;
  ctx.__gardeReseau = true;
  await ctx.route(aCouper, (route) => {
    signaler(route.request().method(), route.request().url());
    return route.abort('blockedbyclient');
  });
  // 267 — LE DÉPÔT PORTE LA VRAIE CLÉ DU CAPTCHA (config.js) : tout banc reçoit config.js avec une clé VIDE, sinon l'écran de
  // connexion chargerait le vrai Turnstile. Un banc qui joue le captcha (profil-creation) pose sa propre route après celle-ci :
  // la plus récente l'emporte.
  await ctx.route(/\/js\/config\.js(\?.*)?$/, async (route) => {
    // Un banc qui ferme son navigateur pendant que config.js est en vol (le service worker le redemande à la fermeture) fait
    // échouer `route.fetch` : « Target page, context or browser has been closed ». Ce n'est pas une fuite réseau : on
    // l'ignore, la page n'existe plus. Toute autre erreur reste levée.
    // CI-3 (21/11/2026) — `ECONNRESET` ne veut pas toujours dire « la page se ferme » : sur la CI, la connexion locale de config.js a
    // été coupée alors que la page restait ouverte (exécution 44863863986, [O109]) ; la route refusée, l'app démarrait sans
    // configuration (« Cannot read properties of undefined (reading 'URL') »). On REDEMANDE donc le fichier, deux fois au plus, avant
    // de refuser la route ; une page qui se ferme vraiment échoue alors par « has been closed », traité comme avant.
    // Démarrage sans page blanche : `ECONNREFUSED` aussi — le serveur du banc COUPÉ (scénario 11 de sw-navigation) refuse la
    // connexion ; avant, `route.fetch` levait tel quel et tuait le processus du banc au lieu de laisser la page échouer.
    const COUPURE = /ECONNRESET|ECONNREFUSED|socket hang up|EPIPE|ECONNABORTED/i;
    const FERMEE = /has been closed|has been disposed|Target closed|Target page, context or browser/i;
    for (let essai = 0; ; essai++) {
      try {
        // CI-1 (16/11/2026) : « Response has been disposed » (r.text() après la fermeture du navigateur) est la même fermeture en vol.
        const r = await route.fetch();
        const corps = (await r.text()).replace(/TURNSTILE_SITE_KEY\s*:\s*'[^']*'/, "TURNSTILE_SITE_KEY: ''");
        return await route.fulfill({ response: r, body: corps });
      } catch (e) {
        const m = String(e && e.message);
        if (FERMEE.test(m)) return undefined;
        // CI-2 (20/11/2026) — `route.fetch: read ECONNRESET` levé tel quel tuait le processus du banc (rejet non rattrapé). Une coupure
        // de la connexion locale n'est pas une fuite vers la vraie base : après deux nouvelles demandes, la route est refusée.
        if (COUPURE.test(m)) {
          if (essai < 2) continue;
          return route.abort('connectionreset').catch(() => undefined);
        }
        throw e;
      }
    }
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

module.exports = { lancer, garderContexte, versSupabase, versCloudflare, aCouper, fuites, HOTE };
