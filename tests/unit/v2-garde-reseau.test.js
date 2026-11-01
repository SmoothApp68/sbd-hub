/** @jest-environment node */
//
// 59-4 — AUCUN TEST NE PARLE À LA VRAIE BASE.
//
// Relevé 59-3 : le 06/10/2026, la suite Playwright v1 (`npx playwright test`)
// a créé 862 comptes anonymes dans la vraie base — `setupPage` → `cloudSignIn`
// → `signInAnonymously`, sans aucune interception. Elle est aux archives
// (`archive/v1/`). Cette garde empêche que ça recommence :
//
//   1. tout fichier hors `archive/` qui lance un navigateur passe par la garde
//      réseau (`tests/banc/garde-reseau.js`) — sinon il est nommé ici ;
//   2. aucun code hors `archive/` n'appelle `signInAnonymously` ;
//   3. la garde elle-même coupe et note ce qui vise Supabase, et rien d'autre.

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '../..');
const GARDE = 'tests/banc/garde-reseau.js';
const MOI = 'tests/unit/v2-garde-reseau.test.js';
const IGNORES = ['node_modules', '.git', 'archive'];
// Les copies de travail des agents (`.claude/worktrees/`, ignorées par git) sont
// d'autres dépôts : leurs fichiers ne sont pas ceux de celui-ci (135, point 1).
// Le reste de `.claude/` (réglages, skills) reste lu.
const COPIES_DE_TRAVAIL = ['.claude/worktrees'];

function fichiersDeCode(dossier, rel) {
  const out = [];
  fs.readdirSync(dossier, { withFileTypes: true }).forEach((e) => {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (IGNORES.indexOf(e.name) < 0 && COPIES_DE_TRAVAIL.indexOf(r) < 0) fichiersDeCode(path.join(dossier, e.name), r).forEach((x) => out.push(x));
    } else if (/\.(js|mjs|cjs|html)$/.test(e.name)) out.push(r);
  });
  return out;
}
const TOUS = fichiersDeCode(RACINE, '');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

// Un fichier « lance un navigateur » s'il charge Playwright ou Puppeteer, ou
// appelle `.launch(` sur un moteur.
const LANCE = /\b(chromium|firefox|webkit)\s*\.\s*(launch|launchPersistentContext|connectOverCDP)\s*\(|require\(\s*[^)]*['"`][^'"`]*(playwright|puppeteer)[^'"`]*['"`]|from\s+['"][^'"]*(playwright|puppeteer)/;
const LANCE_EN_DIRECT = /\b(chromium|firefox|webkit)\s*\.\s*(launch|launchPersistentContext|connectOverCDP)\s*\(/;
const PASSE_PAR_LA_GARDE = /require\([^)]*garde-reseau(\.js)?['"`]\s*\)/;

function horsGarde(nom, src) {
  if (nom === GARDE || nom === MOI || !LANCE.test(src)) return null;
  if (!PASSE_PAR_LA_GARDE.test(src)) return nom + ' — lance un navigateur sans charger la garde réseau';
  if (LANCE_EN_DIRECT.test(src)) return nom + ' — lance un navigateur en direct (passer par Garde.lancer)';
  return null;
}

describe('59-4 — tout navigateur de test passe par la garde réseau', () => {
  test('⚠️ aucun fichier hors archive/ ne lance un navigateur sans la garde — sinon il est nommé ici', () => {
    const fautes = TOUS.map((f) => horsGarde(f, lire(f))).filter(Boolean);
    expect(fautes).toEqual([]);
  });

  test('les cinq bancs à navigateur sont bien vus, et passent par la garde', () => {
    const lanceurs = TOUS.filter((f) => f !== GARDE && f !== MOI && LANCE.test(lire(f))).sort();
    expect(lanceurs).toEqual(['tests/banc/journal-mesure.js', 'tests/banc/ouverture.js', 'tests/banc/profil-creation.js', 'tests/banc/routines-ecran.js',
      'tests/banc/seance-ecran.js', 'tests/banc/sw-navigation.js', 'tests/unit/v2-vivant-progression-mise-en-page.test.js']);
    lanceurs.forEach((f) => expect([f, /Garde\.lancer\(chromium,/.test(lire(f))]).toEqual([f, true]));
  });

  test('la garde de structure voit vraiment un intrus', () => {
    const intrus = "const { chromium } = require('playwright');\n(async () => { const b = await chromium.launch(); })();";
    expect(horsGarde('tests/banc/nouveau.js', intrus)).toMatch(/sans charger la garde/);
    const malin = "const Garde = require('./garde-reseau.js');\nconst { chromium } = require('playwright-core');\nchromium.launch();";
    expect(horsGarde('tests/banc/malin.js', malin)).toMatch(/en direct/);
    expect(horsGarde('x.js', "const p = require('puppeteer');")).toMatch(/sans charger la garde/);
    expect(horsGarde('x.js', "import { chromium } from 'playwright';")).toMatch(/sans charger la garde/);
    const sage = "const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));\nconst { chromium } = require(path.join(R, 'node_modules/playwright-core'));\nGarde.lancer(chromium, {});";
    expect(horsGarde('tests/banc/sage.js', sage)).toBeNull();
    expect(horsGarde('v2/js/app.js', 'var x = 1;')).toBeNull();
  });
});

describe('59-4 — personne n’appelle signInAnonymously', () => {
  // Hors archive/, le mot n'apparaît que là où il DOIT apparaître. Chaque
  // exception a sa raison, et chacune doit encore être vraie.
  const EXCEPTIONS = {
    'v2/vendor/supabase.js': 'le SDK embarqué lui-même : il DÉFINIT la méthode ; l’app v2 ne l’appelle pas'
    // Le code v1 (`js/supabase.js`, `cloudSignIn`, le coupable de 59-3, et ses copies du SDK) est sous
    // `archive/v1/app/` depuis le chantier d'hygiène du 21/10/2026 : `archive/` est hors de cette garde.
  };

  test('⚠️ aucun fichier de code hors archive/ ne contient signInAnonymously, hors la liste', () => {
    const avec = TOUS.filter((f) => f !== MOI && /signInAnonymously/.test(lire(f)));
    expect(avec.filter((f) => !EXCEPTIONS[f])).toEqual([]);
  });

  test('chaque exception est encore vraie, et la v2 n’en a aucune hors du SDK', () => {
    Object.keys(EXCEPTIONS).forEach((f) => expect([f, /signInAnonymously/.test(lire(f))]).toEqual([f, true]));
    expect(TOUS.filter((f) => /^v2\/js\//.test(f) && /signInAnonymously/.test(lire(f)))).toEqual([]);
  });
});

describe('59-4 — la garde réseau elle-même', () => {
  let Garde;
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    Garde = require('../../' + GARDE);
  });
  afterEach(() => { console.error.mockRestore(); });

  test('elle vise Supabase et l’hôte de la configuration de l’app, et rien d’autre', () => {
    const config = lire('v2/js/config.js');
    const url = /URL\s*:\s*['"]([^'"]+)['"]/.exec(config)[1];
    expect(Garde.HOTE).toBe(new URL(url).hostname);
    expect(Garde.versSupabase(url + '/rest/v1/sessions?select=*')).toBe(true);
    expect(Garde.versSupabase('wss://' + Garde.HOTE + '/realtime/v1/websocket')).toBe(true);
    expect(Garde.versSupabase('https://autre-projet.supabase.co/auth/v1/signup')).toBe(true);
    expect(Garde.versSupabase('http://127.0.0.1:8080/index.html')).toBe(false);
    expect(Garde.versSupabase('https://evilsupabase.co/')).toBe(false);
    expect(Garde.versSupabase('pas une url')).toBe(false);
  });

  // Un contexte de papier : il retient ses intercepteurs dans l'ordre.
  function contexte() {
    const ctx = { routes: [], sockets: [], ferme: false };
    ctx.route = async (motif, f) => { ctx.routes.push({ motif, f }); };
    ctx.routeWebSocket = async (motif, f) => { ctx.sockets.push({ motif, f }); };
    ctx.newPage = async () => ({ on() {} });
    ctx.close = async () => { ctx.ferme = true; };
    return ctx;
  }

  test('⚠️ une requête que le banc n’a pas prise en charge est coupée, et notée avec son URL', async () => {
    const ctx = await Garde.garderContexte(contexte());
    expect(ctx.routes.length).toBe(1);
    expect(ctx.sockets.length).toBe(1);
    const coupees = [];
    const req = { method: () => 'POST', url: () => 'https://' + Garde.HOTE + '/auth/v1/signup' };
    await ctx.routes[0].f({ request: () => req, abort: async (r) => coupees.push(r) });
    expect(coupees).toEqual(['blockedbyclient']);
    expect(Garde.fuites()).toEqual(['POST https://' + Garde.HOTE + '/auth/v1/signup']);
    let fermee = false;
    ctx.sockets[0].f({ url: () => 'wss://' + Garde.HOTE + '/realtime/v1', close: () => { fermee = true; } });
    expect(fermee).toBe(true);
    expect(Garde.fuites()[1]).toBe('WebSocket wss://' + Garde.HOTE + '/realtime/v1');
  });

  test('elle se pose une fois par contexte, et AVANT les intercepteurs du banc', async () => {
    const ctx = contexte();
    await Garde.garderContexte(ctx);
    await Garde.garderContexte(ctx);
    expect(ctx.routes.length).toBe(1);
    // Playwright essaie le plus récent d'abord : celui du banc, posé ensuite.
    await ctx.route(/supabase\.co/, () => {});
    expect(ctx.routes[0].motif).toBe(Garde.versSupabase);
  });

  test('`lancer` garde chaque contexte — y compris celui de `newPage`', async () => {
    const crees = [];
    const nav = { newContext: async () => { const c = contexte(); crees.push(c); return c; } };
    const chromium = { launch: async (o) => { nav.options = o; return nav; } };
    const b = await Garde.lancer(chromium, { executablePath: '/x' });
    expect(b.options).toEqual({ executablePath: '/x' });
    await b.newContext({});
    await b.newPage({});
    expect(crees.length).toBe(2);
    crees.forEach((c) => expect([c.routes.length, c.sockets.length]).toEqual([1, 1]));
  });
});
