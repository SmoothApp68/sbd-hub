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
// 59-4 — tout navigateur de test passe par la garde réseau (aucune requête vers la vraie base).
const Garde = require(path.join(__dirname, 'garde-reseau.js'));
const { creer } = require(path.join(__dirname, '../../v2-atelier/banc/serveur-pages.js'));

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
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
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

{ n: 5, titre: 'sortie de l’état cassé : l’app revient au premier rechargement qui suit l’installation du nouveau service worker',
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
      // 86 — le 1er rechargement déclenche la mise à jour du service worker ; le 2ᵉ ne vaut
      // que s'il suit l'ACTIVATION du nouveau (sur téléphone, mettre la coquille en cache
      // prend quelques secondes ; un rechargement trop tôt retombe sur l'ancien). On attend
      // donc cet état, plafond 20 s, au lieu d'un délai fixe.
      const versionCorrigee = (CORRIGE.match(/const CACHE_V2 = '([^']+)'/) || [])[1];
      const nouveauActif = async () => {
        for (const w of page.context().serviceWorkers()) {
          const v = await w.evaluate(() => (typeof CACHE_V2 === 'string' && self.serviceWorker
            && self.serviceWorker.state === 'activated') ? CACHE_V2 : null).catch(() => null);
          if (v && v === versionCorrigee) return true;
        }
        return false;
      };
      let revenue = 0, actif = null;
      for (let i = 1; i <= 4 && !revenue; i++) {
        const v = await ouvrir(page, '/');
        if (!v.erreur && v.sections > 0) { revenue = i; break; }
        if (actif === null) {
          const fin = Date.now() + 20000;
          actif = false;
          while (Date.now() < fin && !(actif = await nouveauActif())) await attendre(200);
          if (!actif) break;
        }
      }
      verifier('l’app revient au premier rechargement qui suit l’installation du nouveau service worker (2 au plus)',
        revenue > 0 && revenue <= 2,
        revenue ? 'revenue au rechargement n°' + revenue
          : actif === false ? 'le nouveau service worker (' + versionCorrigee + ') n’est jamais devenu actif en 20 s'
            : 'toujours cassée après 4 rechargements');

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

{ n: 6, titre: 'trappe /__sw-off : TOUT est effacé, désinscription, réponse servie',
  run: () => session(async (page) => {
    await installerSW(page);
    const avant = await etatCache(page);
    verifier('un cache existe avant', avant.entrees > 0, avant.entrees + ' entrées');

    // ⚠️ LA BASE, PAS SEULEMENT LES CACHES (chantier 35, D4). La trappe ne
    // vidait que les caches ; `trainhub-v2` — séances, séries, brouillon de
    // séance en cours et FILE D'ÉCRITURE — survivait. Or c'est là que se loge ce
    // qui empêche l'app de s'ouvrir. On ferme la connexion avant de tirer la
    // trappe : une base tenue ouverte part en `blocked`, et c'est le scénario
    // que couvre `tests/unit/v2-service-worker.test.js`.
    const bases = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('trainhub-v2', 3);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('seances')) db.createObjectStore('seances', { keyPath: 'id' });
      };
      r.onsuccess = () => { r.result.close(); res('ouverte'); };
      r.onerror = () => res('erreur');
      setTimeout(() => res('delai'), 4000);
    }));
    verifier('une base locale existe avant', bases === 'ouverte', String(bases));

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
    const restantes = await page.evaluate(async () => {
      if (typeof indexedDB.databases !== 'function') return 'indisponible';
      return (await indexedDB.databases()).map((d) => d.name).join(',') || 'aucune';
    }).catch((e) => String(e).slice(0, 60));
    verifier('base locale effacée', restantes === 'aucune' || restantes === 'indisponible',
      'bases restantes : ' + restantes);
    verifier('et la page dit ce qui est parti',
      /Données effacées/.test(texte) && /cache/.test(texte) && /trainhub-v2/.test(texte),
      texte.replace(/\s+/g, ' ').slice(0, 130));
    const retour = await ouvrir(page, '/');
    verifier('et l’app se relance derrière', !retour.erreur && retour.sections > 0,
      retour.erreur || retour.sections + ' sections');
  })},

{ n: 7, titre: 'NON-RÉGRESSION chantier 18 : serveur COUPÉ -> la coquille est servie',
  run: () => session(async (page, ctx, serveur) => {
    await installerSW(page);
    await new Promise((r) => serveur.close(r));      // le serveur meurt pour de bon
    await attendre(600);
    // `/saisie` et `/routine/nouvelle` sont des URL de NAVIGATION comme les
    // autres : le service worker doit leur servir la coquille. Ajoutées au
    // chantier 21, avec les vues qui les portent.
    for (const chemin of ['/', '/semaine/2026-08-24', '/progression',
                          '/saisie', '/routine/nouvelle']) {
      const v = await ouvrir(page, chemin);
      verifier('hors ligne ' + chemin, !v.erreur && v.sections > 0,
        v.erreur || v.sections + ' sections');
    }
    // 56-1 (la forge) — hors ligne, les polices viennent du cache du service
    // worker : chacune des sept faces se charge, serveur coupé. Une police
    // absente du cache échouerait ici (et l'app retomberait, sans bruit, sur
    // la police système).
    const polices = await page.evaluate(async () => {
      const faces = Array.from(document.fonts).filter((f) => /Barlow/.test(f.family));
      await Promise.all(faces.map((f) => f.load().catch(() => null)));
      return faces.map((f) => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status);
    }).catch((e) => [String(e).slice(0, 80)]);
    verifier('hors ligne, les sept faces Barlow se chargent depuis le cache',
      polices.length === 7 && polices.every((f) => / loaded$/.test(f)), JSON.stringify(polices));
    await new Promise((r) => serveur.listen(PORT, r));  // pour le `finally`
  })},

{ n: 8, titre: 'une nouvelle version déployée app ouverte : bandeau, « Recharger » donne la nouvelle, rien n’est effacé (88)',
  run: async () => {
    const ACTUEL = lire(path.join(RACINE, 'service-worker.js'));
    const NOUVEAU = ACTUEL.replace(/const CACHE_V2 = '([^']+)'/, "const CACHE_V2 = '$1-banc-nouvelle'");
    const versionNouvelle = (NOUVEAU.match(/const CACHE_V2 = '([^']+)'/) || [])[1];
    const dossier = racineAvecSW(ACTUEL);
    await session(async (page) => {
      const majVisible = () => page.evaluate(() => { const b = document.getElementById('bandeau-maj');
        return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; }).catch(() => false);
      // Première visite : le service worker s'installe et prend la main. C'est
      // une PREMIÈRE INSTALLATION — rien à annoncer.
      await installerSW(page);
      await page.evaluate(() => localStorage.setItem('banc-marqueur', 'données précieuses'));
      await attendre(1000);
      verifier('[maj-premiere-installation] à la première installation, aucun bandeau', !(await majVisible()));
      // Rechargement normal : la page démarre déjà contrôlée.
      await ouvrir(page, '/');
      await page.evaluate(() => { window.__sansRechargement = 1; });
      verifier('l’app tourne, aucun bandeau', !(await majVisible()));

      deployer(dossier, NOUVEAU);   // ← la nouvelle version est mise en ligne, app ouverte
      // Ce que fait l'app quand elle revient au premier plan : chercher une mise à jour.
      // Borné : une attente sans issue ferait pendre le banc entier (vu sous `tout.js`).
      await page.evaluate(() => Promise.race([
        navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => null),
        new Promise((r) => setTimeout(r, 10000))
      ])).catch(() => {});
      await page.waitForFunction(() => { const b = document.getElementById('bandeau-maj');
        return !!b && !b.hidden; }, null, { timeout: 20000 }).catch(() => {});
      verifier('[maj-bandeau] le bandeau « Une nouvelle version est prête. » apparaît',
        await majVisible() && /Une nouvelle version est prête\./.test(
          await page.evaluate(() => document.getElementById('bandeau-maj').textContent)));
      await attendre(1500);
      verifier('[maj-sans-rechargement-impose] et l’app NE se recharge PAS d’elle-même',
        await page.evaluate(() => window.__sansRechargement === 1).catch(() => false));

      await page.click('#btn-maj-recharger', { timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await attendre(1500);
      const apres = await page.evaluate(async () => ({
        recharge: window.__sansRechargement === undefined,
        caches: await caches.keys(),
        marqueur: localStorage.getItem('banc-marqueur'),
        sections: document.querySelectorAll('section').length,
        bandeau: !document.getElementById('bandeau-maj').hidden
      })).catch((e) => ({ erreur: String(e).slice(0, 60) }));
      verifier('« Recharger » recharge la page, qui s’affiche',
        apres.recharge && apres.sections > 0, JSON.stringify({ r: apres.recharge, s: apres.sections }));
      verifier('[maj-nouvelle-version] la page rechargée tourne sur la nouvelle version',
        (apres.caches || []).indexOf(versionNouvelle) >= 0, (apres.caches || []).join(', '));
      verifier('le bandeau n’est plus là', apres.bandeau === false);
      verifier('sans que rien n’ait été effacé', apres.marqueur === 'données précieuses',
        'marqueur = ' + JSON.stringify(apres.marqueur));
    }, { racine: dossier });
  }}
];

// Les quatre vérifications d'avant-fusion (CLAUDE.md §4 bis), rattachées aux
// scénarios qui les approchent. Le banc ne REMPLACE pas la vérification sur
// appareil — il dit seulement laquelle est déjà tenue en machine.
const VERIF_6 = [
  { p: 1, sur: [1], texte: 'fenêtre privée, 1re visite → installation → rechargement → l’app s’affiche',
    obligatoire: true },
  { p: 2, sur: [2, 3], texte: 'aucune entrée de cache ne porte `redirected: true`',
    obligatoire: false },
  { p: 3, sur: [5], texte: 'SW cassé en place → l’app revient au 1er rechargement qui suit l’installation du nouveau SW, sans effacer',
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
