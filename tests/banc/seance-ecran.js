#!/usr/bin/env node
//
// tests/banc/seance-ecran.js — la séance en cours, dans un vrai navigateur.
//
// ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) :
//
//        L'APP TUÉE EN PLEINE SÉANCE, SANS RÉSEAU.
//
// Une séance terminée proprement avec du réseau ne distingue rien : tout
// marchait déjà. Ce qui sépare « ça tient » de « on perd la séance », c'est la
// coupure au milieu — et elle se mesure ici pour de vrai : la page est FERMÉE
// (le JS s'arrête, la mémoire part), IndexedDB reste, et on rouvre.
//
// Leçon du chantier 21 retenue : le banc mesure aussi les états TRANSITOIRES,
// pas seulement l'état final. Un écran faux affiché une seconde ne laisse
// aucune trace dans une mesure de fin.
//
// Le Supabase de papier applique les contraintes RÉELLES relevées au schéma —
// `sets_validee_si_saisie`, `sets_rang_positif`, `sessions_statut_ok`,
// `sets_rang_unique` différée. Sans elles, écrire juste et écrire n'importe
// quoi donneraient le même résultat.
//
//   node tests/banc/seance-ecran.js

const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
const { creer } = require(path.join(R, 'v2/banc/serveur-pages.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.BANC_PORT || 8874), BASE = 'http://127.0.0.1:' + PORT;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const ok = (nom, cond, detail) => {
  if (!cond) echecs++;
  console.log('   ' + (cond ? '✅' : '❌') + ' ' + nom + (detail !== undefined ? '  — ' + detail : ''));
};

const CATALOGUE = [
  { slug: 'squat-barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'dc-barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'curl', nom: 'Curl Biceps Haltères', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['biceps'], muscles_secondaires: [] }
];

const ROUTINE = {
  id: 'r-banc', nom: 'Push', note: null, archivee_a: null,
  created_at: '2026-09-01T08:00:00Z', modifiee_a: '2026-09-01T08:00:00Z',
  routine_exercises: [
    { id: 're1', routine_id: 'r-banc', exercise_slug: 'squat-barre', rang: 0, series: 3, reps_visees: 5, repos_cible_s: 180, groupe_superset: null },
    { id: 're2', routine_id: 'r-banc', exercise_slug: 'dc-barre', rang: 1, series: 2, reps_visees: 8, repos_cible_s: null, groupe_superset: null }
  ]
};

// ⚠️ LE DÉCOR — une séance DÉJÀ TERMINÉE, dans la semaine affichée.
//
// C'est la moitié de la configuration discriminante du chantier 23. Sans elle,
// les totaux de la semaine valent zéro, et « 0 » avec la séance en cours comme
// sans elle ne distingue rien : le banc passerait sur du code qui ne filtre
// pas. Il faut un total NON NUL qui doit rester IDENTIQUE.
const LUNDI = (() => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(8, 0, 0, 0);
  return d;
})();

const PASSEE = {
  id: 'sess-passee', user_id: 'u-banc', titre: 'Séance de lundi',
  debut: LUNDI.toISOString(), fin: new Date(LUNDI.getTime() + 3600000).toISOString(),
  statut: 'terminee', salle: null, salle_norme: null,
  created_at: LUNDI.toISOString()
};

const SETS_PASSES = [1, 2].map((n) => ({
  id: 'set-passe-' + n, session_id: PASSEE.id, exercise_slug: 'squat-barre',
  charge_kg: 120, reps: 5, duree_s: null, distance_m: null, type_serie: 'travail',
  rang: n, groupe_superset: null, validee_a: LUNDI.toISOString(), rpe: null,
  ressenti: null, repos_s: null, note: null, source: 'import',
  created_at: LUNDI.toISOString(), modifie_a: null
}));

(async () => {
  // ── Le Supabase de papier, avec les contraintes de la vraie base ────────
  const base = {
    sessions: [Object.assign({}, PASSEE)],
    sets: SETS_PASSES.map((s) => Object.assign({}, s)),
    journal: [], reseau: true
  };

  // Le décor ne doit pas fausser les comptes des sections qui parlent de LA
  // séance en cours : on le met de côté une fois pour toutes.
  const sessions = () => base.sessions.filter((s) => s.id !== PASSEE.id);
  const sets = () => base.sets.filter((s) => s.session_id !== PASSEE.id);

  const refus = (code, msg) => ({ code: code, message: msg, details: msg });

  function verifierSet(l) {
    if (l.source === 'app' && !l.validee_a) return refus('23514', 'sets_validee_si_saisie');
    if (!(l.rang >= 1)) return refus('23514', 'sets_rang_positif');
    if (['echauffement', 'travail', 'degressive', 'echec'].indexOf(l.type_serie) < 0) return refus('23514', 'sets_type_serie_ok');
    if (l.ressenti && ['reste_3_plus', 'reste_2', 'reste_1', 'reste_0'].indexOf(l.ressenti) < 0) return refus('23514', 'sets_ressenti_ok');
    if (l.rpe !== null && l.rpe !== undefined && !(l.rpe > 0 && l.rpe <= 10)) return refus('23514', 'sets_rpe_ok');
    if (l.repos_s !== null && l.repos_s !== undefined && !(l.repos_s >= 0 && l.repos_s <= 3600)) return refus('23514', 'sets_repos_borne');
    if (!base.sessions.some((s) => s.id === l.session_id)) return refus('23503', 'sets_session_id_fkey');
    return null;
  }

  const serveur = creer({ racine: path.join(R, 'v2') });
  await new Promise((r) => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 360, height: 760 } });

  const SCRIPT_JETON = () => {
    const JETON = JSON.stringify({
      access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800,
      token_type: 'bearer', user: { id: 'u-banc', email: 'banc@test' }
    });
    localStorage.setItem('th-v2-auth', JETON);
    const vraiRemove = Storage.prototype.removeItem;
    const vraiSet = Storage.prototype.setItem;
    Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vraiRemove.call(this, c); };
    Storage.prototype.setItem = function (c, v) { return vraiSet.call(this, c, c === 'th-v2-auth' ? JETON : v); };
  };
  await ctx.addInitScript(SCRIPT_JETON);

  // ── Mouchards : la vibration et le son ─────────────────────────────────
  //
  // ⚠️ On RELÈVE d'abord la présence native, AVANT de toucher à quoi que ce
  // soit. En remplaçant `navigator.vibrate` par un bouchon, on ne testerait
  // plus que son propre bouchon — et la question posée est justement « l'API
  // est-elle là ? ». On enveloppe donc la vraie fonction, on ne la remplace pas.
  await ctx.addInitScript(() => {
    window.__vibrateNatif = typeof navigator.vibrate === 'function';
    window.__vibrations = [];
    const vrai = window.__vibrateNatif ? navigator.vibrate.bind(navigator) : null;
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: function (d) { window.__vibrations.push(d); return vrai ? vrai(d) : false; }
    });

    window.__bips = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    window.__audioNatif = !!AC;
    if (AC) {
      const creer = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () {
        const o = creer.call(this);
        const demarrer = o.start.bind(o);
        o.start = function (t) { window.__bips++; return demarrer(t); };
        return o;
      };
    }
  });

  await ctx.route(/supabase\.co/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop();
    const corps = req.postData() ? JSON.parse(req.postData()) : null;
    const unSeul = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const json = (data, status) => route.fulfill({
      status: status || 200, contentType: 'application/json',
      body: JSON.stringify(unSeul && Array.isArray(data) ? data[0] : data)
    });

    if (url.pathname.startsWith('/auth/')) return json({ error: 'x' }, 400);
    if (!base.reseau) return route.abort('failed');

    // ⚠️ LE COMPTE DE CONTRÔLE, POUR DE VRAI. Sans l'en-tête `Content-Range`,
    // `compterSeances`/`compterSeries` rendent null, `verifierCompletude` se
    // déclare non vérifiable, et la cohérence entre la purge des séries
    // orphelines et le compte du serveur n'est JAMAIS mise à l'épreuve. C'est
    // précisément ce qui a laissé passer la première version de ce chantier,
    // où filtrer `statut` au serveur faisait purger les séries de la séance en
    // cours pendant qu'on s'entraînait.
    if (/count=exact/.test(req.headers()['prefer'] || '')) {
      const n = table === 'sessions' ? base.sessions.length
              : table === 'sets' ? base.sets.length : 0;
      // ⚠️ `access-control-expose-headers` n'est pas une politesse : sans lui,
      // le navigateur laisse passer la réponse mais INTERDIT au JavaScript de
      // lire `content-range`, qui n'est pas dans la liste sûre du CORS. Le
      // compte revient alors `null`, `verifierCompletude` se déclare non
      // vérifiable, et le banc n'éprouve plus rien. Le vrai Supabase l'envoie.
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-range': '0-' + Math.max(0, n - 1) + '/' + n,
          'access-control-expose-headers': 'content-range, content-length'
        },
        body: ''
      });
    }

    if (req.method() === 'GET') {
      if (table === 'exercises') return json(CATALOGUE);
      if (table === 'routines') return json([ROUTINE]);
      if (table === 'sessions') {
        const st = (url.searchParams.get('statut') || '').replace('eq.', '');
        return json(st ? base.sessions.filter((s) => s.statut === st) : base.sessions);
      }
      if (table === 'sets') {
        const sid = (url.searchParams.get('session_id') || '').replace('eq.', '');
        return json(sid ? base.sets.filter((s) => s.session_id === sid) : base.sets);
      }
      return json([]);
    }

    if (req.method() === 'POST' && table === 'sessions') {
      const l = Array.isArray(corps) ? corps[0] : corps;
      base.journal.push({ op: 'session', id: l.id, statut: l.statut });
      if (['en_cours', 'terminee'].indexOf(l.statut) < 0) return json(refus('23514', 'sessions_statut_ok'), 400);
      if (!l.user_id) return json(refus('23502', 'user_id'), 400);
      const i = base.sessions.findIndex((s) => s.id === l.id);
      if (i >= 0) base.sessions[i] = Object.assign({}, base.sessions[i], l);
      else base.sessions.push(Object.assign({}, l));
      return json([l], 201);
    }

    if (req.method() === 'POST' && table === 'sets') {
      const lignes = Array.isArray(corps) ? corps : [corps];
      base.journal.push({ op: 'sets', n: lignes.length });
      const avant = base.sets.slice();
      for (const l of lignes) {
        const e = verifierSet(l);
        if (e) { base.sets = avant; return json(e, 400); }
        const i = base.sets.findIndex((s) => s.id === l.id);
        if (i >= 0) base.sets[i] = Object.assign({}, l); else base.sets.push(Object.assign({}, l));
      }
      // La contrainte est DIFFÉRÉE : vérifiée à la fin de la transaction.
      const vus = new Set();
      for (const l of base.sets) {
        const c = l.session_id + '#' + l.rang;
        if (vus.has(c)) { base.sets = avant; return json(refus('23505', 'sets_rang_unique'), 409); }
        vus.add(c);
      }
      return json(lignes, 201);
    }

    if (req.method() === 'DELETE') {
      const brut = url.searchParams.get('id') || '';
      const ids = brut.startsWith('in.')
        ? brut.slice(4, -1).split(',').map((x) => x.replace(/"/g, ''))
        : [brut.replace('eq.', '')];
      if (table === 'sessions') {
        base.journal.push({ op: 'suppression', ids: ids });
        base.sessions = base.sessions.filter((s) => ids.indexOf(s.id) < 0);
        base.sets = base.sets.filter((s) => ids.indexOf(s.session_id) < 0);   // CASCADE
      } else {
        base.sets = base.sets.filter((s) => ids.indexOf(s.id) < 0);
      }
      return json([]);
    }
    return json([]);
  });

  let page = await ctx.newPage();
  const erreurs = [];
  const brancher = (p) => {
    p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 140)));
  };
  brancher(page);

  const aller = async (chemin) => {
    await page.goto(BASE + (chemin || '/'), { waitUntil: 'domcontentloaded' }).catch(() => {});
    await attendre(2600);
  };
  const visible = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('main > section')).filter((s) => !s.hidden).map((s) => s.id));
  const texte = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  const compter = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

  // Les lignes de série sont réparties dans plusieurs blocs : on les adresse par
  // leur index GLOBAL, pas par `nth-child`, qui compterait l'en-tête du bloc.
  const ligne = async (i) => (await page.$$('.ligne-serie'))[i];

  const saisirSerie = async (i, charge, reps) => {
    const l = await ligne(i);
    const champs = await l.$$('input');
    await champs[0].fill(String(charge));
    await champs[1].fill(String(reps));
    await l.$eval('.ok-serie', (b) => b.click());
    await attendre(450);
  };

  const toucher = async (i, sel) => {
    const l = await ligne(i);
    await l.$eval(sel, (b) => b.click());
    await attendre(400);
  };
  const lire = async (i, sel) => (await ligne(i)).$eval(sel, (b) => b.textContent);

  console.log('\n══ 1. DÉMARRER DEPUIS UNE ROUTINE ══');
  await aller('/saisie');
  ok('la bibliothèque montre la routine', /Push/.test(await texte('#liste-routines')),
    (await texte('#liste-routines')).slice(0, 60));
  await page.click('.demarrer');
  await attendre(800);
  ok('la séance s’ouvre', JSON.stringify(await visible()) === '["vue-seance"]', JSON.stringify(await visible()));
  ok('la structure de la routine est reprise : 2 blocs, 5 lignes',
    (await compter('.bloc-seance')) === 2 && (await compter('.ligne-serie')) === 5,
    (await compter('.bloc-seance')) + ' blocs, ' + (await compter('.ligne-serie')) + ' lignes');
  ok('AUCUNE série n’est créée en base', sets().length === 0, sets().length + ' séries');
  ok('la séance est en base avec statut `en_cours`',
    sessions().length === 1 && sessions()[0].statut === 'en_cours',
    JSON.stringify(base.sessions.map((s) => s.statut)));

  console.log('\n══ 2. SAISIR, VALIDER, CHRONOMÈTRE ══');
  await saisirSerie(0, 100, 5);
  ok('la première série est validée', (await compter('.serie.faite')) === 1,
    (await compter('.serie.faite')) + ' validée(s)');
  ok('elle est montée avec `validee_a` et rang ≥ 1',
    sets().length === 1 && !!sets()[0].validee_a && sets()[0].rang >= 1,
    JSON.stringify(sets().map((s) => ({ rang: s.rang, v: !!s.validee_a }))));
  const repos = await page.evaluate(() => {
    const r = document.querySelector('#repos');
    return { visible: r && !r.hidden, texte: (r || {}).textContent || '' };
  });
  ok('le chronomètre part SEUL à la validation', repos.visible, repos.texte.replace(/\s+/g, ' ').slice(0, 40));
  ok('il affiche la cible de la routine sans l’imposer', /cible 3:00/.test(repos.texte), repos.texte.replace(/\s+/g, ' ').slice(0, 40));

  await attendre(1200);
  await saisirSerie(1, 100, 5);
  ok('la deuxième porte un `repos_s` mesuré, pas déduit',
    sets().length === 2 && sets()[1].repos_s !== null && sets()[1].repos_s >= 1,
    'repos_s = ' + JSON.stringify(sets().map((s) => s.repos_s)));

  console.log('\n══ 2 bis. LA LIGNE VERTE ET LA VIBRATION ══');
  // §2.1 — l'API haptique : on relève ce qui EST, on ne conclut pas d'avance.
  const haptique = await page.evaluate(() => ({
    natif: window.__vibrateNatif, appels: window.__vibrations.slice(), audio: window.__audioNatif
  }));
  ok('`navigator.vibrate` existe dans ce contexte', haptique.natif === true,
    'natif=' + haptique.natif + ' · Web Audio=' + haptique.audio);
  ok('la validation d’une série APPELLE bien la vibration', haptique.appels.length >= 2,
    haptique.appels.length + ' appel(s) : ' + JSON.stringify(haptique.appels));
  // 18 ms — la valeur d'avant ce chantier — est sous le seuil où un moteur à
  // masse excentrée a seulement fini de démarrer : l'appel réussissait sans que
  // rien ne se sente.
  ok('et pour une durée PERCEPTIBLE, pas 18 ms',
    haptique.appels.every((d) => d >= 30), JSON.stringify(haptique.appels));

  // §2.2 — toute la ligne validée change de fond, pas seulement la coche.
  const fonds = await page.evaluate(() => {
    const lire = (el) => getComputedStyle(el).backgroundColor;
    const lignes = Array.from(document.querySelectorAll('.serie'));
    const faite = lignes.filter((l) => l.classList.contains('faite'))[0];
    const brute = lignes.filter((l) => !l.classList.contains('faite'))[0];
    return { faite: faite && lire(faite), brute: brute && lire(brute) };
  });
  const rvb = (c) => (String(c).match(/\d+/g) || []).map(Number);
  ok('le fond de la ligne validée DIFFÈRE de celui d’une ligne non validée',
    fonds.faite !== fonds.brute, fonds.faite + ' vs ' + fonds.brute);
  const [r, v, b] = rvb(fonds.faite);
  ok('et il est VERT — vert de sens, pas l’accent jaune', v > r && v > b,
    'rvb(' + r + ',' + v + ',' + b + ')');
  // L'accent (#F2B705) est jaune : rouge et vert hauts, bleu bas. Un fond qui
  // partirait de là se reconnaîtrait à son bleu écrasé.
  ok('ce n’est pas l’accent : le bleu n’est pas écrasé', b > 20 && v - b < 40,
    'rvb(' + r + ',' + v + ',' + b + ')');

  console.log('\n══ 2 ter. UNE SÉANCE EN COURS N’EST PAS UNE SÉANCE ══');
  // ⚠️ CONFIGURATION DISCRIMINANTE : une séance `en_cours` DANS LA SEMAINE
  // AFFICHÉE, avec DEUX SÉRIES DÉJÀ VALIDÉES, et un décor terminé non vide
  // (`PASSEE`, 1 séance / 2 séries) pour que les totaux aient une valeur à
  // conserver. Sans ces trois conditions, filtrer et ne pas filtrer donnent
  // exactement le même écran — c'est ainsi que le défaut a survécu au
  // chantier 22.
  ok('la séance en cours porte bien 2 séries validées, dans la semaine affichée',
    sets().length === 2 && sessions()[0].statut === 'en_cours',
    sets().length + ' série(s) · ' + sessions()[0].statut);

  await aller('/');
  const totaux = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  ok('les totaux de la semaine ne comptent QUE la séance terminée',
    /^1 séance · 2 séries de travail$/.test(totaux), totaux);
  ok('la liste ne montre qu’une carte de séance', (await compter('.jour .seance')) === 1,
    (await compter('.jour .seance')) + ' carte(s)');
  ok('et c’est la séance terminée, pas celle en cours',
    /Séance de lundi/.test(await texte('#liste-seances')) &&
    !/Push/.test(await texte('#liste-seances')),
    (await texte('#liste-seances')).replace(/\s+/g, ' ').slice(0, 70));

  // Le relevé par muscle : la séance en cours travaille le squat, le décor
  // aussi. S'il comptait les deux, les quadriceps doubleraient.
  const rappel = (await texte('#rappel-zones')).replace(/\s+/g, ' ').trim();
  ok('le relevé par zone ne double pas les jambes', /(^|\D)2(\D|$)/.test(rappel) && !/\b4\b/.test(rappel),
    rappel.slice(0, 70));

  // Et le cache : la séance en cours n'y entre pas non plus. C'est la même
  // ligne de code qui l'assure — `rangerSeances` court avant l'écriture.
  const enCache = await page.evaluate(() => new Promise((res) => {
    const d = indexedDB.open('trainhub-v2');
    d.onsuccess = () => {
      const bd = d.result;
      const q = bd.transaction('seances', 'readonly').objectStore('seances').getAll();
      q.onsuccess = () => res(q.result.map((s) => s.statut));
      q.onerror = () => res(['?']);
    };
    d.onerror = () => res(['?']);
  }));
  ok('le cache local ne contient AUCUNE séance en cours',
    enCache.length > 0 && enCache.every((st) => st === 'terminee'), JSON.stringify(enCache));

  await aller('/saisie');
  ok('et la séance en cours, elle, est toujours reprise intacte',
    JSON.stringify(await visible()) === '["vue-seance"]' &&
    (await compter('.serie.faite')) === 2,
    JSON.stringify(await visible()) + ' · ' + (await compter('.serie.faite')) + ' validée(s)');

  console.log('\n══ 3. LE TYPE ET L’EFFORT ══');
  await toucher(0, '.no-serie');
  await page.click('#feuille-contenu .feuille-menu button:nth-child(2)');   // Échauffement
  await attendre(700);
  ok('le numéro porte le type : la série devient une chauffe',
    (await lire(0, '.no-serie')) === 'C' &&
    sets().filter((s) => s.type_serie === 'echauffement').length === 1,
    'écran=' + (await lire(0, '.no-serie')) +
    ' base=' + JSON.stringify(sets().map((s) => s.type_serie)));

  await toucher(1, '.eff-serie');
  const feuilleEffort = await texte('#feuille-contenu');
  ok('la feuille pose la question en langage courant', /combien te restait/.test(feuilleEffort),
    feuilleEffort.replace(/\s+/g, ' ').slice(0, 60));
  await page.click('#feuille-contenu .grille-rir button:nth-child(3)');   // « 1 »
  await attendre(600);
  ok('le ressenti est enregistré', sets().some((s) => s.ressenti === 'reste_1'),
    JSON.stringify(sets().map((s) => s.ressenti)));

  await toucher(1, '.eff-serie');
  await page.click('#feuille-contenu .bascule button');
  await attendre(300);
  ok('la bascule vers le RPE donne une GRILLE, pas un curseur',
    (await compter('#feuille-contenu .grille-rpe button')) === 8 &&
    (await compter('#feuille-contenu input[type=range]')) === 0,
    (await compter('#feuille-contenu .grille-rpe button')) + ' boutons');
  await page.click('#feuille-contenu .grille-rpe button:nth-child(6)');   // RPE 9
  await attendre(600);
  const ligneEffort = sets().filter((s) => s.rpe !== null && s.rpe !== undefined)[0];
  ok('RPE et ressenti sont EXCLUSIFS : choisir l’un efface l’autre',
    !!ligneEffort && ligneEffort.rpe === 9 && ligneEffort.ressenti === null,
    JSON.stringify(sets().map((s) => ({ rpe: s.rpe, r: s.ressenti }))));

  console.log('\n══ 4. HORS LIGNE, APP TUÉE EN PLEINE SÉANCE ══');
  base.reseau = false;
  await attendre(200);
  await saisirSerie(2, 110, 4);
  const montees = sets().length;
  ok('la saisie continue sans réseau', (await compter('.serie.faite')) === 3,
    (await compter('.serie.faite')) + ' validée(s) à l’écran');
  ok('et rien n’est monté — c’est attendu', sets().length === montees, montees + ' en base');
  const etatHL = await texte('#etat-sync');
  ok('l’utilisateur voit ce qui reste à envoyer, sans alarme',
    /à envoyer/.test(etatHL) && !/erreur|échec|perdu/i.test(etatHL), etatHL.trim());

  // ⚠️ L'APP EST TUÉE. La page se ferme : le JS s'arrête, la mémoire part.
  // IndexedDB, lui, reste — c'est tout l'enjeu.
  await page.close();
  page = await ctx.newPage();
  brancher(page);

  // ⚠️ On échantillonne PENDANT la réouverture, pas seulement à la fin. Un écran
  // faux affiché deux secondes ne laisse aucune trace dans une mesure d'état
  // final — c'est exactement ce que la mutation M10 du chantier 21 a montré.
  // Ici, voir la liste des séances à la place de sa séance, même une seconde,
  // c'est croire qu'on l'a perdue.
  await page.goto(BASE + '/saisie', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const vues = [];
  for (let i = 0; i < 14; i++) {
    await attendre(300);
    vues.push((await visible())[0] || '');
  }
  const egares = vues.filter((v) => v === 'vue-liste' || v === 'vue-connexion');
  ok('la séance ne disparaît JAMAIS de l’écran pendant la réouverture',
    egares.length === 0, egares.length ? egares.length + ' rendu(s) égaré(s) : ' +
    Array.from(new Set(egares)).join(', ') : 'jamais');

  ok('à la réouverture, on retombe DANS la séance',
    JSON.stringify(await visible()) === '["vue-seance"]', JSON.stringify(await visible()));
  ok('les trois séries validées sont là, intactes',
    (await compter('.serie.faite')) === 3, (await compter('.serie.faite')) + ' validée(s)');
  const valeurs = await page.evaluate(() => Array.from(document.querySelectorAll('.ligne-serie'))
    .map((l) => Array.from(l.querySelectorAll('input')).map((i) => i.value).join('×')));
  ok('avec leurs charges et leurs reps',
    valeurs[0] === '100×5' && valeurs[1] === '100×5' && valeurs[2] === '110×4',
    JSON.stringify(valeurs.slice(0, 3)));

  console.log('\n══ 4 bis. LE GLISSEMENT LATÉRAL ══');
  // La famille de geste qui a coûté trois chantiers. La règle qui la rend sûre :
  // la direction se décide UNE FOIS, au premier mouvement qui dépasse le seuil,
  // et ne change plus. On vérifie les DEUX sens : qu'il supprime quand on tire
  // à l'horizontale, et qu'il ne gêne pas le défilement vertical.
  const avantGlisse = await compter('.ligne-serie');
  const boite = await (await ligne(4)).boundingBox();

  // 1. Un geste DIAGONAL à dominante verticale ne doit rien supprimer.
  //    C'est LUI qui discrimine : un geste parfaitement vertical ne bouge pas
  //    l'axe horizontal, donc il ne supprimerait rien même sans verrouillage.
  //    Un pouce qui fait défiler, lui, part de travers — 70 px de côté pour
  //    90 px vers le bas. Sans le verrouillage de direction, la ligne partirait.
  await page.mouse.move(boite.x + boite.width - 40, boite.y + boite.height / 2);
  await page.mouse.down();
  for (let d = 0; d <= 9; d++) {
    await page.mouse.move(boite.x + boite.width - 40 - d * 8, boite.y + boite.height / 2 + d * 10);
    await attendre(30);
  }
  await page.mouse.up();
  await attendre(600);
  ok('un geste diagonal à dominante verticale ne supprime rien',
    (await compter('.ligne-serie')) === avantGlisse,
    (await compter('.ligne-serie')) + ' ligne(s)');

  // 2. Un geste HORIZONTAL supprime.
  const boite2 = await (await ligne(4)).boundingBox();
  await page.mouse.move(boite2.x + boite2.width - 40, boite2.y + boite2.height / 2);
  await page.mouse.down();
  for (let d = 0; d <= 110; d += 14) {
    await page.mouse.move(boite2.x + boite2.width - 40 - d, boite2.y + boite2.height / 2);
    await attendre(30);
  }
  await page.mouse.up();
  await attendre(700);
  ok('un geste horizontal supprime la série', (await compter('.ligne-serie')) === avantGlisse - 1,
    (await compter('.ligne-serie')) + ' ligne(s) après');

  console.log('\n══ 5. LE RETOUR DU RÉSEAU ══');
  base.reseau = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await attendre(2500);
  ok('la séance monte', sets().length === 3, sets().length + ' séries en base');
  ok('sans doublon de séance', sessions().length === 1, sessions().length + ' séance(s)');
  const ids = sets().map((s) => s.id);
  ok('sans doublon de série', new Set(ids).size === ids.length, ids.length + ' ids, ' + new Set(ids).size + ' distincts');
  const etatOK = await texte('#etat-sync');
  // ⚠️ « À jour » et pas seulement « plus rien à envoyer ». C'est ici que se
  // voit la cohérence entre la purge des séries orphelines et le compte du
  // serveur : si la liste des séances est filtrée sur `statut`, les séries de
  // la séance EN COURS sont purgées du cache alors que le serveur les compte
  // toujours, et l'état bascule en « N séries manquantes ». Un simple
  // « plus rien à envoyer » laissait passer exactement ce défaut.
  ok('et l’état dit « À jour » — le cache et le compte du serveur concordent',
    /À jour/.test(etatOK), etatOK.trim() || '(vide)');

  console.log('\n══ 5 bis. RETIRER UNE SÉRIE DU MILIEU, DÉJÀ MONTÉE ══');
  // ⚠️ Configuration discriminante de l'envoi en LOT. Retirer la série du milieu
  // décale les suivantes vers le bas : la 3ᵉ prend le rang de la 2ᵉ. Envoyées
  // une par une, chacune dans sa transaction, elles heurteraient
  // `sets_rang_unique` — qui n'est différée qu'À L'INTÉRIEUR d'une transaction.
  // Retirer la DERNIÈRE ne prouverait rien : aucun rang ne bouge.
  const rangsAvant = base.sets.filter((x) => x.session_id === sessions()[0].id)
    .map((x) => x.rang).sort((a, b) => a - b);
  await toucher(1, '.no-serie');
  await page.click('#feuille-contenu .feuille-menu button.danger');   // Supprimer la série
  await attendre(2000);
  const apresRetrait = base.sets.filter((x) => x.session_id === sessions()[0].id)
    .sort((a, b) => a.rang - b.rang);
  ok('la série du milieu part, et les rangs suivants se décalent sans collision',
    apresRetrait.length === rangsAvant.length - 1 &&
    new Set(apresRetrait.map((x) => x.rang)).size === apresRetrait.length,
    'avant ' + JSON.stringify(rangsAvant) + ' → après ' + JSON.stringify(apresRetrait.map((x) => x.rang)));
  const etatApres = await texte('#etat-sync');
  ok('et rien ne reste coincé dans la file', !/à envoyer|refusé/.test(etatApres),
    etatApres.trim() || '(vide)');

  console.log('\n══ 5 ter. LE CHRONOMÈTRE — RÉGLAGE, SON, VIBRATION, SOURDINE ══');
  // La barre de repos se redessine chaque seconde : on clique DANS la page,
  // pas via un handle, qui serait périmé avant d'arriver.
  const cliqueRepos = async (i) => {
    await page.evaluate((k) => {
      const b = document.querySelectorAll('#repos .repos-b')[k];
      if (b) b.click();
    }, i);
    await attendre(260);
  };
  const MOINS = 0, PLUS = 1, SON = 2;
  const compteurs = () => page.evaluate(() => ({
    bips: window.__bips, vibrations: window.__vibrations.length
  }));

  // On travaille sur le DEUXIÈME bloc : sa routine ne prescrit PAS de repos
  // (`repos_cible_s` null). C'est le cas le plus exigeant — la cible n'existe
  // pas, et les commandes doivent quand même en poser une.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const derniere = (await compter('.ligne-serie')) - 1;
  await saisirSerie(derniere, 80, 10);
  ok('sans repos prescrit, la cible s’affiche absente — pas zéro, pas deviné',
    /cible —/.test(await texte('#repos')), (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));

  await cliqueRepos(PLUS);
  ok('+15 pose une cible de 15 s', /cible 0:15/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));
  await cliqueRepos(MOINS);
  await cliqueRepos(MOINS);
  ok('−15 ne descend JAMAIS sous zéro', /cible —/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));
  await cliqueRepos(PLUS);

  const avantEcheance = await compteurs();
  await attendre(17000);
  const aEcheance = await compteurs();
  ok('à l’échéance : UN son', aEcheance.bips - avantEcheance.bips === 1,
    (aEcheance.bips - avantEcheance.bips) + ' son(s)');
  ok('et UNE vibration', aEcheance.vibrations - avantEcheance.vibrations === 1,
    (aEcheance.vibrations - avantEcheance.vibrations) + ' vibration(s)');

  // ⚠️ LE DÉPASSEMENT. Le chronomètre informe, il ne commande pas : rien ne se
  // répète, aucune alarme ne monte. C'est ici que se verrait un `setInterval`
  // qui resonne, et nulle part ailleurs.
  await attendre(10000);
  const apresDepassement = await compteurs();
  ok('au dépassement : plus RIEN, ni son ni vibration',
    apresDepassement.bips === aEcheance.bips &&
    apresDepassement.vibrations === aEcheance.vibrations,
    'bips ' + apresDepassement.bips + ' · vibrations ' + apresDepassement.vibrations);
  ok('et la piste continue de se remplir au-delà de la cible, sans alarme',
    /0:2[0-9]|0:3[0-9]/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 40));

  console.log('\n══ 5 quater. LA SOURDINE SE RETIENT D’UNE SÉANCE À L’AUTRE ══');
  await cliqueRepos(SON);
  ok('la sourdine s’affiche coupée', /Son ✕/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 60));

  // ⚠️ FERMETURE COMPLÈTE DE L'APP. Un état gardé en mémoire passerait un
  // simple changement d'onglet ; il ne passe pas ceci.
  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/saisie');
  ok('on retombe dans la séance', JSON.stringify(await visible()) === '["vue-seance"]',
    JSON.stringify(await visible()));
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const derniere2 = (await compter('.ligne-serie')) - 1;
  await saisirSerie(derniere2, 80, 8);
  ok('la sourdine est TOUJOURS coupée après fermeture complète',
    /Son ✕/.test(await texte('#repos')), (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 60));

  await cliqueRepos(PLUS);
  const avantMuet = await compteurs();
  await attendre(17000);
  const apresMuet = await compteurs();
  // La sourdine coupe le SON, pas la vibration : on met son téléphone en
  // silencieux dans une salle, on ne renonce pas pour autant à savoir que le
  // repos est fini.
  ok('en sourdine : aucun son', apresMuet.bips - avantMuet.bips === 0,
    (apresMuet.bips - avantMuet.bips) + ' son(s)');
  ok('mais la vibration reste', apresMuet.vibrations - avantMuet.vibrations === 1,
    (apresMuet.vibrations - avantMuet.vibrations) + ' vibration(s)');
  await cliqueRepos(SON);   // on rétablit, pour ne pas laisser l'état au suivant

  console.log('\n══ 6. TERMINER ══');
  await page.click('#bandeau-seance .discret');
  await attendre(500);
  await page.click('#feuille-contenu .principal');
  await attendre(2200);
  ok('le statut bascule en `terminee`',
    sessions()[0].statut === 'terminee' && !!sessions()[0].fin, sessions()[0].statut);
  ok('on revient à la bibliothèque', JSON.stringify(await visible()) === '["vue-saisie"]',
    JSON.stringify(await visible()));

  // ⚠️ L'AUTRE MOITIÉ DU TEST. Prouver qu'une séance en cours est absente ne
  // vaut que si la même, terminée, revient. Sinon le filtre pourrait tout jeter
  // et le banc applaudirait.
  await aller('/');
  const totauxFin = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  ok('terminée, elle entre dans les totaux de la semaine',
    /^2 séances · \d+ séries de travail$/.test(totauxFin), totauxFin);
  ok('et elle prend sa carte dans la liste', (await compter('.jour .seance')) === 2,
    (await compter('.jour .seance')) + ' carte(s)');

  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/saisie');
  ok('et aucune séance fantôme ne se rouvre',
    JSON.stringify(await visible()) === '["vue-saisie"]', JSON.stringify(await visible()));

  console.log('\n══ 7. ABANDONNER ══');
  await page.click('.demarrer');
  await attendre(900);
  await saisirSerie(0, 90, 6);
  await attendre(800);
  const idAbandon = base.sessions.filter((s) => s.statut === 'en_cours').map((s) => s.id)[0];
  ok('une deuxième séance est bien ouverte', !!idAbandon, idAbandon || '(aucune)');
  await page.click('#bandeau-seance .discret');
  await attendre(500);
  await page.click('#feuille-contenu .danger');
  await attendre(2200);
  ok('la séance abandonnée est SUPPRIMÉE',
    !base.sessions.some((s) => s.id === idAbandon), sessions().length + ' séance(s) restante(s)');
  ok('ses séries partent avec elle',
    !base.sets.some((s) => s.session_id === idAbandon), sets().length + ' série(s)');
  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/saisie');
  ok('et aucune fantôme au lancement suivant',
    JSON.stringify(await visible()) === '["vue-saisie"]', JSON.stringify(await visible()));

  console.log('\n══ 8. NON-RÉGRESSION ══');
  for (const [chemin, attendu] of [['/', 'vue-liste'], ['/progression', 'vue-progression'],
                                   ['/profil', 'vue-profil'], ['/routine/nouvelle', 'vue-routine']]) {
    await aller(chemin);
    ok('l’onglet ' + chemin + ' s’ouvre', (await visible())[0] === attendu, JSON.stringify(await visible()));
  }
  base.reseau = false;
  await aller('/');
  ok('hors ligne, les séances restent lisibles', (await visible())[0] === 'vue-liste',
    JSON.stringify(await visible()));

  console.log('\nerreurs de page : ' + (erreurs.length ? erreurs.join(' | ') : 'aucune'));
  if (erreurs.length) echecs++;
  console.log('\n' + (echecs ? '❌ ' + echecs + ' vérification(s) en échec' : '✅ tout passe'));
  await nav.close();
  await new Promise((r) => serveur.close(r));
  process.exit(echecs ? 1 : 0);
})();
