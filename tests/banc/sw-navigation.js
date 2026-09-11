#!/usr/bin/env node
//
// tests/banc/sw-navigation.js — le banc du service worker, en navigateur réel.
//
// ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) :
//
//        SERVEUR QUI CANONICALISE · SERVICE WORKER INSTALLÉ · SERVEUR ALLUMÉ
//
// Les trois à la fois. Sur un serveur qui ne redirige pas `/index.html`, ou
// serveur coupé, la garde `redirected` et son absence donnent EXACTEMENT le
// même résultat — c'est pour ça que le défaut a traversé le chantier 18, dont
// le banc ne testait que « serveur coupé ».
//
// Ces scénarios ne tournent pas sous Jest : un service worker demande un vrai
// navigateur, un vrai cycle install/activate et une vraie origine.
//
//   node tests/banc/sw-navigation.js            (tout)
//   node tests/banc/sw-navigation.js 3          (un seul scénario)
//
// Sortie : une ligne par vérification, et un code de retour non nul si l'une
// échoue — pour que la campagne de mutation puisse s'en servir.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require(path.join(__dirname, '../../node_modules/playwright-core'));
const { creer } = require(path.join(__dirname, '../../v2/banc/serveur-pages.js'));

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const RACINE = path.join(__dirname, '../../v2');
const PORT = Number(process.env.BANC_PORT || 8860);
const BASE = 'http://127.0.0.1:' + PORT;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
let echecs = 0;

function verifier(nom, condition, detail) {
  const ok = !!condition;
  if (!ok) echecs++;
  console.log('   ' + (ok ? '✅' : '❌') + ' ' + nom + (detail ? '  — ' + detail : ''));
  return ok;
}

async function ouvrir(page, chemin) {
  let erreur = null;
  await page.goto(BASE + chemin, { waitUntil: 'domcontentloaded', timeout: 12000 })
    .catch((e) => { erreur = (e.message.split('\n')[0] || '').slice(0, 60); });
  await attendre(1500);
  const vue = await page.evaluate(() => ({
    titre: document.title,
    sections: document.querySelectorAll('section').length
  })).catch(() => ({ titre: null, sections: 0 }));
  return { erreur: erreur, sections: vue.sections, titre: vue.titre };
}

const etatCache = (page) => page.evaluate(async () => {
  const noms = await caches.keys();
  const sortie = { noms: noms, entrees: 0, redirigees: [] };
  for (const nom of noms) {
    const c = await caches.open(nom);
    for (const req of await c.keys()) {
      sortie.entrees++;
      const r = await c.match(req);
      if (r && r.redirected) sortie.redirigees.push(new URL(req.url).pathname);
    }
  }
  return sortie;
}).catch((e) => ({ erreur: String(e).slice(0, 60) }));

async function session(fn, options) {
  const opts = options || {};
  const serveur = creer({ racine: opts.racine || RACINE, canonicalise: opts.canonicalise !== false });
  await new Promise((r) => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 360, height: 760 } });
  const page = await ctx.newPage();
  try { await fn(page, ctx, serveur); }
  finally { await nav.close(); await new Promise((r) => serveur.close(r)); }
}

// Installe le service worker et attend qu'il contrôle la page.
async function installerSW(page) {
  // La navigation peut ÉCHOUER — c'est même le but au scénario 5, où le service
  // worker installé est celui du chantier 18. Le banc ne doit pas s'arrêter là :
  // c'est la mesure qui suit qui juge, pas le harnais.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 })
    .catch(() => {});
  await attendre(1500);
}

// Un dossier servi qui EST `v2/`, à un fichier près : le service worker. Des
// liens symboliques pour tout le reste — l'app testée reste la vraie app, seul
// le service worker est celui qu'on veut éprouver. Écrire dans ce dossier, c'est
// DÉPLOYER : le serveur relit le fichier à chaque requête.
function racineAvecSW(contenu) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-v2-'));
  for (const entree of fs.readdirSync(RACINE)) {
    if (entree === 'service-worker.js') continue;
    fs.symlinkSync(path.join(RACINE, entree), path.join(dossier, entree));
  }
  fs.writeFileSync(path.join(dossier, 'service-worker.js'), contenu);
  return dossier;
}

const deployer = (dossier, contenu) =>
  fs.writeFileSync(path.join(dossier, 'service-worker.js'), contenu);

const lire = (f) => fs.readFileSync(f, 'utf8');

const SCENARIOS = [
{ n: 1, titre: 'serveur qui canonicalise + SW installé + serveur ALLUMÉ -> la navigation passe',
  run: () => session(async (page) => {
    await installerSW(page);
    const racine = await ouvrir(page, '/');
    verifier('la racine se charge', !racine.erreur && racine.sections > 0,
      racine.erreur || racine.sections + ' sections');
    const vue = await ouvrir(page, '/semaine/2026-08-24');
    verifier('une URL de vue se charge', !vue.erreur && vue.sections > 0,
      vue.erreur || vue.sections + ' sections');
  })},

{ n: 2, titre: 'aucune réponse servie à une navigation ne porte `redirected`',
  run: () => session(async (page) => {
    await installerSW(page);
    // On interroge directement ce que le service worker servirait.
    const verdict = await page.evaluate(async () => {
      const c = await caches.open((await caches.keys())[0]);
      const r = await c.match('/index.html');
      return r ? { existe: true, redirected: r.redirected, status: r.status, ok: r.ok } : { existe: false };
    });
    verifier('la coquille en cache existe', verdict.existe, JSON.stringify(verdict));
    verifier('elle n’est PAS marquée redirigée', verdict.existe && !verdict.redirected,
      'redirected=' + verdict.redirected);
    verifier('et elle reste un 200 valide', verdict.status === 200 && verdict.ok === true,
      'status=' + verdict.status);
  })},

{ n: 3, titre: 'aucune entrée du cache ne porte `redirected` après installation',
  run: () => session(async (page) => {
    await installerSW(page);
    const etat = await etatCache(page);
    verifier('le cache est rempli', etat.entrees > 0, etat.entrees + ' entrées');
    verifier('aucune entrée redirigée', etat.redirigees && etat.redirigees.length === 0,
      (etat.redirigees || []).join(', ') || 'aucune');
  })},

{ n: 4, titre: 'entrée absente, vide ou en erreur -> le réseau est tenté',
  run: () => session(async (page) => {
    await installerSW(page);
    // On empoisonne le cache À LA MAIN avec ce que le chantier 18 y mettait :
    // une réponse 200, `ok`, `basic`, mais redirigée.
    const pose = await page.evaluate(async () => {
      const c = await caches.open((await caches.keys())[0]);
      // `/index.html` tout court serait servi PAR LE SERVICE WORKER depuis le
      // cache, donc propre. On ajoute une chaîne de requête : elle rate le
      // cache, part au réseau, suit le 308 de la canonicalisation, et revient
      // avec la marque. C'est exactement la réponse que le chantier 18 stockait.
      const r = await fetch('/index.html?poison=1');
      await c.put('/index.html', r);
      const relu = await c.match('/index.html');
      return { redirected: relu.redirected, status: relu.status, ok: relu.ok, type: relu.type };
    });
    verifier('cache empoisonné pour le test', pose.redirected === true, JSON.stringify(pose));
    const apres = await ouvrir(page, '/');
    verifier('la navigation passe QUAND MÊME (réseau)', !apres.erreur && apres.sections > 0,
      apres.erreur || apres.sections + ' sections');
    // Et cache entièrement vidé : idem, le réseau prend le relais.
    await page.evaluate(async () => { for (const n of await caches.keys()) await caches.delete(n); });
    const vide = await ouvrir(page, '/semaine/2026-08-24');
    verifier('cache vidé : la navigation passe aussi', !vide.erreur && vide.sections > 0,
      vide.erreur || vide.sections + ' sections');
  })},

{ n: 5, titre: 'sortie de l’état cassé : deux rechargements suffisent',
  // LE SCÉNARIO DU §6 POINT 3 — celui qui manquait. Il ne part PAS du service
  // worker corrigé : il installe celui du chantier 18, CONSTATE que l'app est
  // cassée, déploie la correction, et compte les rechargements.
  //
  // ⚠️ Une page dont la navigation a échoué est une page d'erreur du navigateur :
  // origine opaque, ni `caches` ni `localStorage`. Toute mesure se prend donc
  // AVANT la casse ou APRÈS le retour, jamais pendant.
  run: async () => {
    const CASSE = lire(path.join(__dirname, 'fixtures/sw-chantier-18.js'));
    const CORRIGE = lire(path.join(RACINE, 'service-worker.js'));
    const dossier = racineAvecSW(CASSE);
    await session(async (page) => {
      // Première visite : elle réussit (le service worker n'est pas encore là),
      // et c'est elle qui l'installe. Des données utilisateur sont posées au
      // passage : tout ce chantier vise à ne PAS avoir à les effacer.
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.setItem('banc-marqueur', 'données précieuses'));
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 })
        .catch(() => {});
      await attendre(1500);

      const etat = await page.evaluate(async () => {
        const noms = await caches.keys();
        if (!noms.length) return { aucun: true };
        const r = await (await caches.open(noms[0])).match('/index.html');
        return r ? { redirected: r.redirected, status: r.status, ok: r.ok, type: r.type } : { absente: true };
      }).catch((e) => ({ erreur: String(e).slice(0, 60) }));
      verifier('le chantier 18 met en cache une réponse REDIRIGÉE',
        etat.redirected === true, JSON.stringify(etat));

      const casse = await ouvrir(page, '/semaine/2026-08-24');
      verifier('et l’app en devient INACCESSIBLE, réseau présent',
        !!casse.erreur || casse.sections === 0,
        casse.erreur || casse.sections + ' sections — LE BANC NE REPRODUIT PLUS LE DÉFAUT');

      deployer(dossier, CORRIGE);   // ← la correction est mise en ligne

      // On compte les rechargements. Aucun effacement, aucun réglage touché.
      let revenue = 0;
      for (let i = 1; i <= 4 && !revenue; i++) {
        const v = await ouvrir(page, '/');
        if (!v.erreur && v.sections > 0) revenue = i; else await attendre(1500);
      }
      verifier('l’app revient en DEUX rechargements au plus', revenue > 0 && revenue <= 2,
        revenue ? 'revenue au rechargement n°' + revenue : 'toujours cassée après 4');

      const fin = await page.evaluate(async () => {
        const sales = [];
        for (const n of await caches.keys()) {
          const c = await caches.open(n);
          for (const req of await c.keys()) {
            const r = await c.match(req);
            if (r && r.redirected) sales.push(n + new URL(req.url).pathname);
          }
        }
        return { marqueur: localStorage.getItem('banc-marqueur'), sales: sales };
      }).catch((e) => ({ erreur: String(e).slice(0, 60) }));
      verifier('sans que rien n’ait été effacé à la main',
        fin.marqueur === 'données précieuses', 'marqueur = ' + JSON.stringify(fin.marqueur));
      verifier('et le cache est ressorti propre',
        !!fin.sales && fin.sales.length === 0,
        (fin.sales || [fin.erreur]).join(', ') || 'aucune entrée redirigée');
    }, { racine: dossier });
  }},

{ n: 6, titre: 'trappe /__sw-off : caches vidés, désinscription, réponse servie',
  run: () => session(async (page) => {
    await installerSW(page);
    const avant = await etatCache(page);
    verifier('un cache existe avant', avant.entrees > 0, avant.entrees + ' entrées');
    const trappe = await ouvrir(page, '/__sw-off');
    const texte = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
    verifier('la trappe répond', !trappe.erreur, trappe.erreur || 'servie');
    verifier('elle dit ce qu’elle a fait', /service worker/i.test(texte), texte.split('\n')[0]);
    const apres = await page.evaluate(async () => {
      const noms = await caches.keys();
      const detail = {};
      for (const n of noms) detail[n] = (await (await caches.open(n)).keys()).length;
      return { caches: noms.length, detail: detail,
               sw: (await navigator.serviceWorker.getRegistrations()).length,
               controle: !!navigator.serviceWorker.controller };
    });
    verifier('caches vidés', apres.caches === 0,
      apres.caches + ' restant(s) ' + JSON.stringify(apres.detail) +
      ' · contrôlé=' + apres.controle);
    verifier('service worker désinscrit', apres.sw === 0, apres.sw + ' restant(s)');
    const retour = await ouvrir(page, '/');
    verifier('et l’app se relance derrière', !retour.erreur && retour.sections > 0,
      retour.erreur || retour.sections + ' sections');
  })},

{ n: 7, titre: 'NON-RÉGRESSION chantier 18 : serveur COUPÉ -> la coquille est servie',
  run: () => session(async (page, ctx, serveur) => {
    await installerSW(page);
    await new Promise((r) => serveur.close(r));      // le serveur meurt pour de bon
    await attendre(600);
    for (const chemin of ['/', '/semaine/2026-08-24', '/progression']) {
      const v = await ouvrir(page, chemin);
      verifier('hors ligne ' + chemin, !v.erreur && v.sections > 0,
        v.erreur || v.sections + ' sections');
    }
    await new Promise((r) => serveur.listen(PORT, r));  // pour le `finally`
  })}
];

// Les quatre vérifications d'avant-fusion (CLAUDE.md §4 bis), rattachées aux
// scénarios qui les approchent. Le banc ne REMPLACE pas la vérification sur
// appareil — il dit seulement laquelle est déjà tenue en machine.
const VERIF_6 = [
  { p: 1, sur: [1], texte: 'fenêtre privée, 1re visite → installation → rechargement → l’app s’affiche',
    obligatoire: true },
  { p: 2, sur: [2, 3], texte: 'aucune entrée de cache ne porte `redirected: true`',
    obligatoire: false },
  { p: 3, sur: [5], texte: 'SW cassé en place → deux rechargements → l’app revient sans effacer',
    obligatoire: true },
  { p: 4, sur: [7], texte: 'mode avion + rechargement → non-régression du chantier 18',
    obligatoire: false }
];

(async () => {
  const seul = Number(process.argv[2]) || null;
  const bilan = {};
  for (const s of SCENARIOS) {
    if (seul && s.n !== seul) continue;
    console.log('\n══ ' + s.n + '. ' + s.titre.toUpperCase() + ' ══');
    const avant = echecs;
    try { await s.run(); }
    catch (e) { echecs++; console.log('   ❌ le scénario a levé : ' + String(e).slice(0, 160)); }
    bilan[s.n] = echecs === avant;
  }

  if (!seul) {
    console.log('\n══ LES QUATRE VÉRIFICATIONS D’AVANT-FUSION (CLAUDE.md §4 bis) ══');
    for (const v of VERIF_6) {
      const tenu = v.sur.every((n) => bilan[n]);
      console.log('   ' + (tenu ? '✅' : '❌') + ' ' + v.p + '. ' + v.texte +
        (v.obligatoire ? '  [OBLIGATOIRE]' : '') +
        '  — scénario' + (v.sur.length > 1 ? 's ' : ' ') + v.sur.join(' + '));
    }
    console.log('   ⚠️ approché en machine. La vérification sur APPAREIL RÉEL reste due.');
  }

  console.log('\n' + (echecs ? '❌ ' + echecs + ' vérification(s) en échec' : '✅ tout passe'));
  process.exit(echecs ? 1 : 0);
})();
