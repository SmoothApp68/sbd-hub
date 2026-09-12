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

// Attendre une CONDITION plutôt qu'une durée. Le pavé de chronométrage pose une
// écriture par chiffre : taper « 21000 » enchaîne cinq vidanges de file, et la
// dernière montée arrive après un délai qui dépend de la machine. Un `sleep`
// calibré sur un portable devient une intermittence sur un runner chargé.
const jusqua = async (cond, ms) => {
  const fin = Date.now() + (ms || 6000);
  while (Date.now() < fin) {
    if (await cond()) return true;
    await attendre(120);
  }
  return false;
};

let echecs = 0;
const ok = (nom, cond, detail) => {
  if (!cond) echecs++;
  console.log('   ' + (cond ? '✅' : '❌') + ' ' + nom + (detail !== undefined ? '  — ' + detail : ''));
};

const CATALOGUE = [
  { slug: 'squat-barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'dc-barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'curl', nom: 'Curl Biceps Haltères', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['biceps'], muscles_secondaires: [] },
  // ⚠️ Les trois autres mesures du catalogue (chantier 24). Sans elles, le banc
  // ne teste qu'un quart de la grille — et c'est exactement l'angle mort qui a
  // laissé passer le défaut pendant trois chantiers de saisie.
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps', charge: 'aucune', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  { slug: 'planche', nom: 'Planche', mesure: 'temps', charge: 'aucune', muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
  { slug: 'marche', nom: 'Marche', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] }
];

const ROUTINE = {
  id: 'r-banc', nom: 'Push', note: null, archivee_a: null,
  created_at: '2026-09-01T08:00:00Z', modifiee_a: '2026-09-01T08:00:00Z',
  routine_exercises: [
    { id: 're1', routine_id: 'r-banc', exercise_slug: 'squat-barre', rang: 0, series: 3, reps_visees: 5, repos_cible_s: 180, groupe_superset: null, note: null },
    { id: 're2', routine_id: 'r-banc', exercise_slug: 'dc-barre', rang: 1, series: 2, reps_visees: 8, repos_cible_s: null, groupe_superset: null, note: null }
  ]
};

// ⚠️ CONFIGURATION DISCRIMINANTE DU CHANTIER 27 — UN SUPERSET À SÉRIES
// INÉGALES, ET UN EXERCICE SEUL DANS LA MÊME SÉANCE.
//
// Sur un superset régulier validé de haut en bas, « l'éclairage porte sur le
// tour » et « l'éclairage porte sur la ligne » donnent le même écran : chaque
// validation ferme son tour dans la foulée. Il faut la branche plus courte (C
// n'a que deux séries) pour que le tour 3 se ferme sans `C3`, et l'exercice
// seul pour prouver que les lettres ne débordent pas sur lui.
const ROUTINE_SUPERSET = {
  id: 'r-super', nom: 'Superset', note: null, archivee_a: null,
  created_at: '2026-09-03T08:00:00Z', modifiee_a: '2026-09-03T08:00:00Z',
  routine_exercises: [
    { id: 'rs1', routine_id: 'r-super', exercise_slug: 'dc-barre', rang: 0, series: 3, reps_visees: 8, repos_cible_s: 90, groupe_superset: 1, note: null },
    { id: 'rs2', routine_id: 'r-super', exercise_slug: 'curl', rang: 1, series: 3, reps_visees: 12, repos_cible_s: null, groupe_superset: 1, note: null },
    { id: 'rs3', routine_id: 'r-super', exercise_slug: 'planche', rang: 2, series: 2, reps_visees: null, repos_cible_s: null, groupe_superset: 1, note: null },
    { id: 'rs4', routine_id: 'r-super', exercise_slug: 'squat-barre', rang: 3, series: 2, reps_visees: 5, repos_cible_s: 180, groupe_superset: null, note: null }
  ]
};

// ⚠️ CONFIGURATION DISCRIMINANTE DU CHANTIER 24 — les QUATRE mesures dans la
// MÊME séance. Sur une séance qui n'en contient qu'une, « la grille s'adapte »
// et « la grille est fixe » donnent exactement le même écran.
const ROUTINE_MESURES = {
  id: 'r-mesures', nom: 'Les quatre mesures', note: null, archivee_a: null,
  created_at: '2026-09-02T08:00:00Z', modifiee_a: '2026-09-02T08:00:00Z',
  routine_exercises: [
    { id: 'rm1', routine_id: 'r-mesures', exercise_slug: 'dc-barre', rang: 0, series: 1, reps_visees: 8, repos_cible_s: 120, groupe_superset: null, note: null },
    { id: 'rm2', routine_id: 'r-mesures', exercise_slug: 'tractions', rang: 1, series: 1, reps_visees: 12, repos_cible_s: null, groupe_superset: null, note: null },
    { id: 'rm3', routine_id: 'r-mesures', exercise_slug: 'planche', rang: 2, series: 1, reps_visees: null, repos_cible_s: null, groupe_superset: null, note: null },
    { id: 'rm4', routine_id: 'r-mesures', exercise_slug: 'marche', rang: 3, series: 1, reps_visees: null, repos_cible_s: null, groupe_superset: null, note: null }
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
    journal: [], patchs: [], reseau: true
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
      if (table === 'routines') return json([ROUTINE, ROUTINE_MESURES, ROUTINE_SUPERSET]);
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

    // ⚠️ LA MISE À JOUR D'UNE LIGNE DE ROUTINE (chantier 26). Sans ce
    // gestionnaire, un PATCH tombait dans le `json([])` final : la requête
    // « réussissait » sans rien écrire, et « la routine n'est pas touchée »
    // aurait été vrai de toute implémentation — y compris d'une qui écrit à
    // chaque geste. C'est exactement le banc plus permissif que l'appareil.
    if (req.method() === 'PATCH' && table === 'routine_exercises') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const champs = Array.isArray(corps) ? corps[0] : corps;
      base.patchs.push({ id: id, champs: Object.assign({}, champs) });
      for (const r of [ROUTINE, ROUTINE_MESURES]) {
        const i = r.routine_exercises.findIndex((e) => e.id === id);
        if (i >= 0) r.routine_exercises[i] = Object.assign({}, r.routine_exercises[i], champs);
      }
      return json([]);
    }

    if (req.method() === 'POST' && table === 'sessions') {
      const l = Array.isArray(corps) ? corps[0] : corps;
      base.journal.push({ op: 'session', id: l.id, statut: l.statut });
      if (['en_cours', 'terminee'].indexOf(l.statut) < 0) return json(refus('23514', 'sessions_statut_ok'), 400);
      if (!l.user_id) return json(refus('23502', 'user_id'), 400);
      // GÉNÉRÉE : Postgres refuse toute valeur, même la bonne, même NULL.
      if ('salle_norme' in l) return json(refus('428C9', 'salle_norme est générée'), 400);
      if (l.salle !== null && l.salle !== undefined &&
          !(String(l.salle).length >= 1 && String(l.salle).length <= 60)) {
        return json(refus('23514', 'sessions_salle_non_vide'), 400);
      }
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

  // La bibliothèque porte plusieurs routines, triées par nom : on démarre CELLE
  // qu'on vise, pas la première venue.
  const demarrerRoutine = async (nom) => {
    await page.evaluate((n) => {
      const rangees = Array.from(document.querySelectorAll('.routine-rangee'));
      const r = rangees.filter((x) => x.querySelector('.routine-nom').textContent === n)[0];
      r.querySelector('.demarrer').click();
    }, nom);
    await attendre(900);
  };

  console.log('\n══ 1. DÉMARRER DEPUIS UNE ROUTINE ══');
  await aller('/saisie');
  ok('la bibliothèque montre la routine', /Push/.test(await texte('#liste-routines')),
    (await texte('#liste-routines')).slice(0, 60));
  await demarrerRoutine('Push');
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
  ok('la première série est validée', (await compter('.ok-serie.cochee')) === 1,
    (await compter('.ok-serie.cochee')) + ' validée(s)');
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
    (await compter('.ok-serie.cochee')) === 2,
    JSON.stringify(await visible()) + ' · ' + (await compter('.ok-serie.cochee')) + ' validée(s)');

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
  ok('la saisie continue sans réseau', (await compter('.ok-serie.cochee')) === 3,
    (await compter('.ok-serie.cochee')) + ' validée(s) à l’écran');
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
    (await compter('.ok-serie.cochee')) === 3, (await compter('.ok-serie.cochee')) + ' validée(s)');
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
  // ⚠️ ASSERTION RETOURNÉE AU CHANTIER 26 (§7 septies.3). Elle exigeait que le
  // chronomètre CONTINUE de compter au-delà de la cible — c'était le
  // comportement d'alors, et c'est précisément celui qu'Aurélien a demandé de
  // corriger : « il s'arrête à l'échéance, il ne continue pas à compter
  // au-delà ». Dix secondes après une cible de 0:15, l'affichage doit donc
  // encore dire 0:15. Le reste de l'invariante ne bouge pas : rien ne se
  // répète, aucune alarme ne monte — c'est l'assertion juste au-dessus.
  ok('et il reste ARRÊTÉ sur la cible, sans alarme ni décompte qui presse',
    /0:15/.test(await texte('#repos')) && !/0:2[0-9]/.test(await texte('#repos')),
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
  await demarrerRoutine('Push');
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

  console.log('\n══ 7 bis. LES QUATRE MESURES ══');
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : les QUATRE mesures
  // dans la MÊME séance. Sur une séance d'une seule mesure, « la grille
  // s'adapte » et « la grille est fixe » rendent le même écran — c'est
  // exactement pourquoi le défaut a survécu à trois chantiers de saisie. Les
  // assertions comparent donc les lignes ENTRE ELLES.
  await aller('/saisie');
  await demarrerRoutine('Les quatre mesures');
  // L'identifiant de CETTE séance : `sessions()[0]` désigne la plus ancienne,
  // qui est la séance Push déjà terminée plus haut.
  const idMesures = (base.sessions.filter((x) => x.statut === 'en_cours')[0] || {}).id;
  ok('la séance des quatre mesures s’ouvre',
    JSON.stringify(await visible()) === '["vue-seance"]' && (await compter('.bloc-seance')) === 4,
    JSON.stringify(await visible()) + ' · ' + (await compter('.bloc-seance')) + ' bloc(s)');

  const gabarits = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')).map((b) => ({
      nom: b.querySelector('.exo-seance').textContent,
      type: b.querySelector('.type-mesure') ? b.querySelector('.type-mesure').textContent : null,
      grille: Array.from(b.querySelector('.serie').classList).filter((c) => c.indexOf('g-') === 0)[0],
      colonnes: getComputedStyle(b.querySelector('.serie')).gridTemplateColumns,
      entetes: Array.from(b.querySelectorAll('.cols-seance span')).map((x) => x.textContent).filter(Boolean),
      champs: Array.from(b.querySelectorAll('.serie .ch-serie, .serie .rp-serie')).map((c) =>
        (c.querySelector('u') ? c.querySelector('u').textContent : '')),
      effort: b.querySelectorAll('.serie .eff-serie').length
    })));

  const g4 = await gabarits();
  ok('quatre grilles DIFFÉRENTES, une par mesure',
    JSON.stringify(g4.map((x) => x.grille)) ===
      '["g-charge_reps","g-reps","g-temps","g-distance_temps"]',
    JSON.stringify(g4.map((x) => x.grille)));
  ok('et elles ne rendent pas les mêmes colonnes à l’écran',
    new Set(g4.map((x) => x.colonnes)).size === 4,
    JSON.stringify(g4.map((x) => x.colonnes)));
  ok('les en-têtes suivent la mesure',
    JSON.stringify(g4.map((x) => x.entetes)) ===
      JSON.stringify([['PRÉC.', 'KG', 'REPS', 'EFFORT'], ['PRÉC.', 'REPS', 'EFFORT'],
                      ['PRÉC.', 'DURÉE'], ['PRÉC.', 'DURÉE', 'DISTANCE']]),
    JSON.stringify(g4.map((x) => x.entetes)));
  // Depuis le chantier 25, la DURÉE ne porte plus d'unité écrite : c'est la
  // forme `HH:MM:SS` qui la dit. Seuls les kilos et les kilomètres en gardent.
  ok('chaque champ porte son unité', JSON.stringify(g4.map((x) => x.champs)) ===
    JSON.stringify([['kg', ''], [''], [''], ['', 'km']]),
    JSON.stringify(g4.map((x) => x.champs)));
  ok('le type de mesure est rappelé sous le nom',
    JSON.stringify(g4.map((x) => x.type)) ===
      '["CHARGE × REPS","REPS SEULES","DURÉE","DISTANCE ET DURÉE"]',
    JSON.stringify(g4.map((x) => x.type)));

  // §3 — la colonne d'effort n'existe que là où il y a des répétitions.
  ok('aucune colonne d’effort sur `temps` ni sur `distance_temps`',
    JSON.stringify(g4.map((x) => x.effort)) === '[1,1,0,0]',
    JSON.stringify(g4.map((x) => x.effort)));

  // ⚠️ Et la LARGEUR, qui est tout l'enjeu : chaque gabarit doit être plus
  // confortable que le précédent, à 360 px. Le champ principal est en `1fr` —
  // on mesure ce que le navigateur lui donne VRAIMENT.
  const largeurs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')).map((b) =>
      Math.round(b.querySelector('.serie .ch-serie').getBoundingClientRect().width)));
  ok('le champ principal gagne en largeur à chaque colonne retirée',
    largeurs[0] < largeurs[1] && largeurs[1] < largeurs[2] && largeurs[0] >= 70,
    'kg=' + largeurs[0] + ' reps=' + largeurs[1] + ' durée=' + largeurs[2] +
    ' durée(sortie)=' + largeurs[3] + ' px');

  console.log('\n══ 7 ter. SAISIR DANS LES QUATRE MESURES ══');
  // ⚠️ UN CHAMP DE DURÉE NE SE REMPLIT PAS, IL SE TAPE.
  //
  // Depuis le chantier 25 la durée est un pavé de chronométrage : il n'écoute
  // QUE `beforeinput`, chiffre par chiffre. `fill()` de Playwright pose la
  // valeur d'un bloc et n'émet pas ces événements — il ne saisirait rien, et
  // le banc verrait un champ vide sans savoir pourquoi. On tape pour de vrai.
  const estChrono = (bloc, i) => bloc.$$eval('.serie .ch-serie, .serie .rp-serie',
    (envs, k) => envs[k] ? envs[k].classList.contains('chrono') : false, i);

  const saisirChamps = async (iBloc, valeurs) => {
    const bloc = (await page.$$('.bloc-seance'))[iBloc];
    const champs = await bloc.$$('.serie input');
    for (let i = 0; i < valeurs.length; i++) {
      if (await estChrono(bloc, i)) {
        await champs[i].click();
        await champs[i].type(String(valeurs[i]), { delay: 30 });
      } else {
        await champs[i].fill(String(valeurs[i]));
      }
    }
    await bloc.$eval('.serie .ok-serie', (b) => b.click());
    await attendre(500);
  };
  // ⚠️ 6 reps là où la routine en VISE 8 : c'est ce qui sépare « le fantôme
  // complète un champ vide » de « le fantôme écrase ce qu'on a tapé ». Saisir
  // 8 ne prouverait rien, les deux comportements donneraient 8.
  await saisirChamps(0, [80, 6]);
  await saisirChamps(1, [12]);
  // La planche : `5` `0` -> 00:50. Deux appuis, pas « 50 s ».
  await saisirChamps(2, ['50']);
  // ⚠️ CONFIGURATION DISCRIMINANTE : 2 h 10 en CINQ appuis. Sous une heure, un
  // pavé à deux groupes et un pavé à trois rendent la même chose.
  await saisirChamps(3, ['21000', '8,4']);
  await jusqua(() => base.sets.filter((x) => x.session_id === idMesures).length === 4, 8000);

  const montees4 = base.sets.filter((x) => x.session_id === idMesures);
  const parExo = {};
  montees4.forEach((x) => { parExo[x.exercise_slug] = x; });
  ok('les quatre séries sont montées', montees4.length === 4, montees4.length + ' série(s)');
  ok('le développé porte charge ET reps, rien d’autre — et la valeur TAPÉE, pas la visée',
    parExo['dc-barre'] && parExo['dc-barre'].charge_kg === 80 && parExo['dc-barre'].reps === 6 &&
    parExo['dc-barre'].duree_s === null && parExo['dc-barre'].distance_m === null,
    JSON.stringify(parExo['dc-barre'] && { c: parExo['dc-barre'].charge_kg, r: parExo['dc-barre'].reps, d: parExo['dc-barre'].duree_s }));
  ok('les tractions portent des reps et AUCUNE charge',
    parExo.tractions && parExo.tractions.reps === 12 && parExo.tractions.charge_kg === null &&
    parExo.tractions.duree_s === null,
    JSON.stringify(parExo.tractions && { c: parExo.tractions.charge_kg, r: parExo.tractions.reps }));
  ok('la planche porte une DURÉE, pas un poids',
    parExo.planche && parExo.planche.duree_s === 50 && parExo.planche.charge_kg === null &&
    parExo.planche.reps === null,
    JSON.stringify(parExo.planche && { d: parExo.planche.duree_s, c: parExo.planche.charge_kg, r: parExo.planche.reps }));
  // Saisie en minutes et en kilomètres, base en secondes et en mètres.
  ok('la marche porte durée ET distance, converties en secondes et en mètres',
    parExo.marche && parExo.marche.duree_s === 7800 && parExo.marche.distance_m === 8400,
    JSON.stringify(parExo.marche && { d: parExo.marche.duree_s, m: parExo.marche.distance_m }));
  ok('et RIEN n’est écrit dans `rpe` ni dans `ressenti` sur les deux mesures sans effort',
    [parExo.planche, parExo.marche].every((x) => x && (x.rpe === null || x.rpe === undefined) &&
      (x.ressenti === null || x.ressenti === undefined)),
    JSON.stringify([parExo.planche, parExo.marche].map((x) => x && { rpe: x.rpe, r: x.ressenti })));

  // L'effort reste accessible là où il a un sens, et l'affichage rend la forme
  // saisie — pas une traduction.
  // Les handles se périment au moindre re-rendu : on adresse dans la page.
  const effortTractions = () => page.evaluate(() =>
    document.querySelectorAll('.bloc-seance')[1].querySelector('.serie .eff-serie').textContent);
  await page.evaluate(() =>
    document.querySelectorAll('.bloc-seance')[1].querySelector('.serie .eff-serie').click());
  await attendre(600);
  // La bascule RPE/ressenti se RETIENT (§3 bis.2) : le §3 l'a laissée sur RPE.
  // On revient au ressenti, sinon la feuille rend l'autre grille.
  if ((await compter('#feuille-contenu .grille-rpe')) > 0) {
    await page.click('#feuille-contenu .bascule button');
    await attendre(400);
  }
  await page.click('#feuille-contenu .grille-rir button:nth-child(3)');
  await attendre(1600);
  const tractionsEnBase = base.sets.filter((x) => x.exercise_slug === 'tractions' &&
    x.session_id === idMesures)[0];
  ok('l’effort reste saisissable sur `reps`, et s’affiche en reps restantes',
    (await effortTractions()) === '−1' && tractionsEnBase &&
    tractionsEnBase.ressenti === 'reste_1',
    (await effortTractions()) + ' · base=' + JSON.stringify(tractionsEnBase && tractionsEnBase.ressenti));

  console.log('\n══ 7 quinquies. LE PAVÉ DE CHRONOMÉTRAGE ══');
  // ⚠️ CONFIGURATION DISCRIMINANTE : une durée qui DÉPASSE UNE HEURE. Sous une
  // heure, un pavé à deux groupes et un pavé à trois rendent le même écran —
  // et toutes les durées d'essai évidentes (planche, gainage) sont sous la
  // minute. La marche ci-dessus a été saisie `2·1·0·0·0`.
  const champDuree = async () => page.evaluate(() => {
    const i = document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input');
    return { valeur: i.value, tampon: i.dataset.chiffres, mode: i.inputMode };
  });
  const frapper = async (suite) => {
    const i = (await page.$$('.bloc-seance'))[3];
    const champ = (await i.$$('.serie input'))[0];
    await champ.click();
    await champ.type(String(suite), { delay: 30 });
    await attendre(250);
  };

  let d = await champDuree();
  ok('la durée reste affichée en horloge après validation', d.valeur === '02:10:00',
    JSON.stringify(d));
  ok('et le champ repart du tampon canonique, pas d’une chaîne à reformer',
    d.tampon === '21000' && d.mode === 'numeric', JSON.stringify(d));

  // Effacer : le geste inverse exact, par la droite.
  await page.evaluate(() => {
    document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input').focus();
  });
  await page.keyboard.press('Backspace');
  await attendre(250);
  d = await champDuree();
  // « 21000 » moins son dernier chiffre = « 2100 » = 21 min 00 s. Les heures
  // disparaissent DÈS ce premier effacement : c'est le décalage, pas un
  // décompte — le chiffre des heures redevient celui des minutes.
  ok('effacer retire le dernier chiffre et l’affichage se resserre',
    d.valeur === '21:00' && d.tampon === '2100', JSON.stringify(d));

  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await attendre(250);
  d = await champDuree();
  ok('les heures disparaissent avec leur chiffre', d.valeur === '00:21' && d.tampon === '21',
    JSON.stringify(d));

  // Rien qui ne soit un chiffre n'entre — virgule, lettre, collage.
  await page.keyboard.type(',a');
  await page.evaluate(() => {
    const i = document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input');
    i.dispatchEvent(new InputEvent('beforeinput',
      { inputType: 'insertFromPaste', data: '999', cancelable: true, bubbles: true }));
  });
  await attendre(250);
  d = await champDuree();
  ok('ni virgule, ni lettre, ni collage', d.valeur === '00:21', JSON.stringify(d));

  // La borne : cinq chiffres, et 9:59:59 — rien qu'on ne sache reprendre.
  await frapper('999999');
  d = await champDuree();
  ok('le pavé est borné, et ce qu’il produit reste une horloge',
    d.tampon.length <= 5 && /^\d\d:\d\d(:\d\d)?$/.test(d.valeur) &&
    Number(d.valeur.split(':').slice(-1)[0]) < 60, JSON.stringify(d));

  // ⚠️ UNE VALEUR DIFFÉRENTE DE CELLE DÉJÀ EN BASE. Retaper `21000` et
  // revérifier 7 800 serait satisfait aussi bien par « la valeur retapée est
  // remontée » que par « rien n'a bougé » : l'assertion ne pourrait pas
  // échouer. On retape donc 2 h 13, qui n'a jamais été écrit.
  await page.evaluate(() => {
    const i = document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input');
    i.focus();
  });
  for (let k = 0; k < 6; k++) await page.keyboard.press('Backspace');
  await frapper('21300');
  const remontee = await jusqua(async () => {
    const m = base.sets.filter((x) => x.session_id === idMesures && x.exercise_slug === 'marche')[0];
    return m && m.duree_s === 7980;
  }, 8000);
  ok('une valeur RETAPÉE après validation remonte bien en base', remontee,
    'duree_s = ' + JSON.stringify((base.sets.filter((x) => x.session_id === idMesures &&
      x.exercise_slug === 'marche')[0] || {}).duree_s) + ' (attendu 7980)');

  // Et on la remet à sa valeur d'origine pour la carte de séance qui suit.
  await page.evaluate(() => {
    document.querySelectorAll('.bloc-seance')[3].querySelector('.serie input').focus();
  });
  for (let k = 0; k < 6; k++) await page.keyboard.press('Backspace');
  await frapper('21000');
  await jusqua(async () => {
    const m = base.sets.filter((x) => x.session_id === idMesures && x.exercise_slug === 'marche')[0];
    return m && m.duree_s === 7800;
  }, 8000);

  console.log('\n══ 7 sexies. RIEN D’INTERACTIF SOUS LA BARRE DE REPOS ══');
  // ⚠️ CONFIGURATION DISCRIMINANTE : barre de repos OUVERTE **et** défilement
  // au MAXIMUM. La barre est `position: fixed` : elle n'ajoute aucune course de
  // défilement, donc le contenu qu'elle recouvre n'est récupérable que si la
  // réserve du bas en tient compte. Tester sans faire défiler ne montre rien.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await attendre(600);

  const jetons = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return { onglets: s.getPropertyValue('--h-onglets').trim(),
             repos: s.getPropertyValue('--h-repos').trim() };
  });
  ok('les deux hauteurs sont MESURÉES, pas devinées',
    /^\d+px$/.test(jetons.onglets) && /^\d+px$/.test(jetons.repos) &&
    parseInt(jetons.repos, 10) > 0, JSON.stringify(jetons));

  const geometrie = await page.evaluate(() => {
    const repos = document.querySelector('#repos');
    const onglets = document.querySelector('.onglets');
    if (!repos || repos.hidden) return { ouvert: false };
    const rb = repos.getBoundingClientRect(), ro = onglets.getBoundingClientRect();
    const chevauche = (a, b) => a.left < b.right && b.left < a.right &&
                                a.top < b.bottom && b.top < a.bottom;
    // Tout ce qui se tape, hors des deux barres elles-mêmes.
    const cibles = Array.from(document.querySelectorAll(
      '#vue-seance button, #vue-seance input, #vue-seance a, #vue-seance [role="button"]'))
      .filter((n) => !repos.contains(n) && !onglets.contains(n))
      .filter((n) => n.offsetParent !== null);
    const dessous = cibles.filter((n) => chevauche(n.getBoundingClientRect(), rb))
      .map((n) => (n.className || n.tagName) + '');
    const erreur = document.querySelector('#erreur-seance');
    return {
      ouvert: true,
      nCibles: cibles.length,
      dessous: dessous,
      barresSeChevauchent: chevauche(rb, ro),
      hautRepos: Math.round(rb.top), basRepos: Math.round(rb.bottom),
      hautOnglets: Math.round(ro.top),
      erreurDessous: chevauche(erreur.getBoundingClientRect(), rb),
      // Le dernier bouton du flux : « Ajouter un exercice ».
      basDuDernier: Math.round(document.querySelector('#btn-ajouter-exo-seance')
        .getBoundingClientRect().bottom)
    };
  });

  ok('la barre de repos est bien ouverte pour ce test', geometrie.ouvert === true,
    JSON.stringify(geometrie.ouvert));
  ok('le banc a de quoi mesurer : plusieurs commandes dans la séance',
    geometrie.nCibles >= 8, geometrie.nCibles + ' cible(s) tapable(s)');
  // C'EST LE DÉFAUT CONSTATÉ SUR DEVICE.
  ok('AUCUNE commande ne reste sous la barre de repos', geometrie.dessous.length === 0,
    geometrie.dessous.length ? geometrie.dessous.join(' · ') : 'aucune');
  ok('« Ajouter un exercice » finit AU-DESSUS de la barre',
    geometrie.basDuDernier <= geometrie.hautRepos,
    'bas du bouton ' + geometrie.basDuDernier + ' · haut de la barre ' + geometrie.hautRepos);
  // Trouvé à la cartographie : le seul message d'erreur de la séance
  // (« Sauvegarde impossible sur cet appareil ») vivait entièrement dessous.
  ok('le message d’erreur de séance n’est plus masqué', geometrie.erreurDessous === false,
    'sous la barre : ' + geometrie.erreurDessous);
  // La barre de repos se posait à `bottom:56px` alors que les onglets font
  // ~69 px : elle mordait leurs 13 px hauts, et son z-index les recouvrait.
  ok('la barre de repos ne mord plus sur la barre d’onglets',
    geometrie.barresSeChevauchent === false,
    'bas du repos ' + geometrie.basRepos + ' · haut des onglets ' + geometrie.hautOnglets);

  console.log('\n══ 7 quater. LA CARTE DE SÉANCE DIT LA BONNE GRANDEUR ══');
  await page.click('#bandeau-seance .discret');
  await attendre(500);
  await page.click('#feuille-contenu .principal');
  await attendre(2400);
  await aller('/');
  const carte = await page.evaluate(() => {
    const cartes = Array.from(document.querySelectorAll('.jour .seance'));
    const c = cartes.filter((x) => /quatre mesures/i.test(x.textContent))[0] ||
              cartes[cartes.length - 1];
    return Array.from(c.querySelectorAll('.apercu-exo')).map((l) => l.textContent);
  });
  ok('la carte donne la grandeur de chaque mesure, pas un blanc',
    carte.length === 3 && /80/.test(carte[0]) && /12/.test(carte[1]) && /50\s*s/.test(carte[2]),
    JSON.stringify(carte));

  console.log('\n══ 7 septies. NOTES, REPOS EN SÉANCE, FIN DE SÉANCE ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) :
  //   UN EXERCICE À AU MOINS TROIS SÉRIES, DONT UNE AJOUTÉE *APRÈS* LA NOTE.
  //
  // Sur une série unique, « duplique sur toutes » et « écrit sur celle-là »
  // produisent exactement la même ligne en base. Il faut plusieurs séries pour
  // distinguer la duplication, et une ajoutée ENSUITE pour distinguer « on
  // recopie au geste » de « on projette à l'écriture ».
  await aller('/saisie');
  await demarrerRoutine('Push');

  const patchsRoutine = () => base.patchs.slice();
  // ⚠️ SCOPÉ À LA SÉANCE EN COURS. `squat-barre` a déjà servi dans les sections
  // précédentes : lire toute la table mélangerait des séries d'autres séances,
  // et la note « manquerait » sur des lignes qui n'ont jamais été concernées.
  const seanceCourante = () => (base.sessions.filter((s) => s.statut === 'en_cours')[0] || {}).id;
  const notesEnBase = (slug) => {
    const sid = seanceCourante();
    return base.sets.filter((s) => s.session_id === sid && s.exercise_slug === slug)
      .sort((a, b) => a.rang - b.rang)
      .map((s) => s.note);
  };
  const lireBloc = (iBloc, sel) => page.evaluate(([k, s]) =>
    (document.querySelectorAll('.bloc-seance')[k].querySelector(s) || {}).textContent || '',
    [iBloc, sel]);
  const ouvrirFeuilleBloc = async (iBloc, sel) => {
    await page.evaluate(([k, s]) => {
      document.querySelectorAll('.bloc-seance')[k].querySelector(s).click();
    }, [iBloc, sel]);
    await attendre(400);
  };
  const taperFeuille = async (sel, texte) => {
    await page.fill('#feuille-contenu ' + sel, texte);
    await attendre(500);
  };
  const fermerFeuille = async () => { await page.click('#btn-fermer-feuille'); await attendre(600); };

  // §7 septies.2 — le repos s'affiche MÊME ABSENT : sans tiret, il n'y aurait
  // rien à toucher pour en poser un, et le seul chemin serait l'éditeur.
  ok('chaque exercice porte ses deux réglages sous son nom',
    (await compter('.reglages-exo')) === 2 &&
    (await compter('.reglages-exo .repos-cible')) === 2 &&
    (await compter('.reglages-exo .note-exo')) === 2,
    (await compter('.reglages-exo')) + ' tête(s)');
  const reglages = await page.evaluate(() => Array.from(document.querySelectorAll('.bloc-seance'))
    .map((b) => b.querySelector('.repos-cible').textContent.trim()));
  ok('le repos prescrit s’affiche, et son ABSENCE aussi — pas zéro, pas deviné',
    reglages[0] === 'repos 3:00' && reglages[1] === 'repos —', JSON.stringify(reglages));

  // ── La note d'exercice ──────────────────────────────────────────────────
  await ouvrirFeuilleBloc(0, '.note-exo');
  ok('un appui sur « + Note » ouvre la feuille de note',
    /Note de l’exercice/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 60));
  await taperFeuille('textarea', 'Barre basse, ceinture');
  await fermerFeuille();
  ok('la note s’affiche sous le nom, à la place du « + Note »',
    /Barre basse, ceinture/.test(await lireBloc(0, '.note-exo')), await lireBloc(0, '.note-exo'));

  await saisirSerie(0, 100, 5);
  await saisirSerie(1, 100, 5);
  await saisirSerie(2, 100, 5);
  ok('TOUTES les séries de cet exercice portent la note en base',
    notesEnBase('squat-barre').length === 3 &&
    notesEnBase('squat-barre').every((n) => n === 'Barre basse, ceinture'),
    JSON.stringify(notesEnBase('squat-barre')));

  // ⚠️ LA SÉRIE AJOUTÉE APRÈS. C'est elle qui sépare les deux implémentations.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  await saisirSerie(3, 105, 5);
  ok('une série ajoutée APRÈS la note la reçoit aussi',
    notesEnBase('squat-barre').length === 4 &&
    notesEnBase('squat-barre').every((n) => n === 'Barre basse, ceinture'),
    JSON.stringify(notesEnBase('squat-barre')));

  // ── La note modifiée : toutes suivent ───────────────────────────────────
  await ouvrirFeuilleBloc(0, '.note-exo');
  await taperFeuille('textarea', 'Ceinture + genouillères');
  await fermerFeuille();
  ok('modifiée, toutes les séries suivent — aucune ne reste en arrière',
    notesEnBase('squat-barre').length === 4 &&
    notesEnBase('squat-barre').every((n) => n === 'Ceinture + genouillères'),
    JSON.stringify(notesEnBase('squat-barre')));

  // ── La note de série : minoritaire, mais elle existe ────────────────────
  await toucher(1, '.no-serie');
  ok('le menu de la série porte un champ de note propre',
    /Note de cette série/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 80));
  await taperFeuille('textarea', 'Celle-ci sur bloc');
  await fermerFeuille();
  ok('une note de série est DISTINCTE de celle de l’exercice, et ne déteint pas',
    JSON.stringify(notesEnBase('squat-barre')) === JSON.stringify([
      'Ceinture + genouillères', 'Celle-ci sur bloc',
      'Ceinture + genouillères', 'Ceinture + genouillères']),
    JSON.stringify(notesEnBase('squat-barre')));
  ok('et son numéro le signale — sinon la note serait invisible',
    (await compter('.no-serie.a-note')) === 1,
    (await compter('.no-serie.a-note')) + ' série(s) marquée(s)');

  // ── Le repos se modifie en séance, sans rien écrire dans la routine ─────
  const patchsAvantRepos = patchsRoutine().length;
  await ouvrirFeuilleBloc(0, '.repos-cible');
  ok('un appui sur le repos ouvre la grille de valeurs',
    /Repos cible/.test(await texte('#feuille-contenu')) &&
    (await compter('#feuille-contenu .grille-rpe button')) === 8,
    (await compter('#feuille-contenu .grille-rpe button')) + ' valeur(s)');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#feuille-contenu .grille-rpe button'))
      .filter((x) => x.textContent.trim() === '2:00')[0];
    b.click();
  });
  await attendre(900);
  ok('le repos cible change à l’écran, tout de suite',
    /repos 2:00/.test(await lireBloc(0, '.repos-cible')), await lireBloc(0, '.repos-cible'));
  ok('et RIEN n’est écrit dans la routine au moment du geste (§7 septies.2)',
    patchsRoutine().length === patchsAvantRepos &&
    ROUTINE.routine_exercises[0].repos_cible_s === 180,
    patchsRoutine().length + ' PATCH · routine à ' + ROUTINE.routine_exercises[0].repos_cible_s);

  // ── Le chronomètre s'arrête à l'échéance ───────────────────────────────
  //
  // On travaille sur le SECOND bloc : sa routine ne prescrit pas de repos, donc
  // la cible se pose entièrement à la main et on la maîtrise à la seconde.
  console.log('   … 30 s de chronomètre réel');
  await saisirSerie(4, 60, 8);
  const cliqueRepos2 = async (i, n) => {
    for (let k = 0; k < (n || 1); k++) {
      await page.evaluate((j) => {
        const b = document.querySelectorAll('#repos .repos-b')[j];
        if (b) b.click();
      }, i);
      await attendre(260);
    }
  };
  const chrono = async () => (await texte('#repos .repos-g')).trim();
  const figeQ = () => page.evaluate(() =>
    !!document.querySelector('#repos .repos-g.fige'));

  await cliqueRepos2(1, 4);                 // +15 ×4 → cible 1:00
  ok('la cible posée à la main vaut 1:00', /cible 1:00/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));
  const t1 = await chrono();
  await attendre(20000);                    // écoulé ≈ 21 s, bien sous la cible
  const t2 = await chrono();
  ok('sous la cible, il compte', t1 !== t2 && (await figeQ()) === false, t1 + ' → ' + t2);

  // ⚠️ LE CAS SIGNALÉ : trois −15 font passer la cible (1:00 → 0:15) DERRIÈRE
  // le temps écoulé (≈ 22 s). Le chronomètre doit s'arrêter là, alors qu'il n'a
  // jamais franchi d'échéance en montant.
  await cliqueRepos2(0, 3);
  const apresMoins = await chrono();
  await attendre(4000);
  const encore = await chrono();
  ok('un −15 qui FRANCHIT la cible arrête le chronomètre', apresMoins === '0:15',
    'affiché ' + apresMoins);
  ok('et il ne repart pas tout seul quatre secondes plus tard',
    encore === apresMoins && (await figeQ()) === true, apresMoins + ' → ' + encore);

  // ⚠️ S'ARRÊTER, C'EST AUSSI ARRÊTER DE TRAVAILLER.
  //
  // `rendreRepos` VIDE et reconstruit la barre à chaque passage. Un minuteur
  // qu'on laisse tourner derrière un affichage figé rebâtit donc le DOM une
  // fois par seconde pour rien, pendant trois minutes de repos — et la valeur
  // affichée serait la même, donc rien d'autre ne le verrait. On observe le
  // DOM lui-même, sinon « arrêté » ne veut dire que « arrêté à l'écran ».
  const remuements = await page.evaluate(() => new Promise((res) => {
    const cible = document.getElementById('repos');
    let n = 0;
    const obs = new MutationObserver((l) => { n += l.length; });
    obs.observe(cible, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); res(n); }, 3200);
  }));
  ok('figé, la barre cesse AUSSI de se redessiner chaque seconde',
    remuements === 0, remuements + ' remaniement(s) du DOM en 3,2 s');

  // Le +15 le remet en marche : un arrêt qui ne sait pas repartir figerait le
  // repos suivant pour toujours.
  await cliqueRepos2(1, 3);                 // cible 1:00, au-delà de l'écoulé
  await attendre(2500);
  const reparti = await chrono();
  ok('un +15 qui repousse la cible le remet en marche',
    reparti !== apresMoins && (await figeQ()) === false, apresMoins + ' → ' + reparti);
  // ⚠️ DEUX LECTURES, PAS UNE. `ajusterRepos` redessine lui-même une fois : une
  // seule mesure après le +15 verrait une valeur neuve même avec un minuteur
  // mort, et le chronomètre resterait figé sur elle pour toujours.
  await attendre(3200);
  const reparti2 = await chrono();
  ok('et il CONTINUE d’avancer ensuite, minuteur bien relancé',
    reparti2 !== reparti, reparti + ' → ' + reparti2);

  // ── L'écran de fin ─────────────────────────────────────────────────────
  await page.click('#bandeau-seance .discret');
  await attendre(600);
  ok('l’écran de fin porte les trois champs déclarés',
    (await compter('#feuille-contenu .champs-fin .champ-texte')) === 3,
    (await compter('#feuille-contenu .champs-fin .champ-texte')) + ' champ(s)');
  ok('et la question sur la routine, puisque la séance a dévié (§6.2)',
    (await compter('#feuille-contenu .question-routine')) === 1 &&
    /repos 3:00 → 2:00/.test(await texte('#feuille-contenu .ecarts')),
    (await texte('#feuille-contenu .ecarts')).replace(/\s+/g, ' ').slice(0, 90));

  await page.fill('#feuille-contenu .champs-fin input[type="text"]', 'Jambes du jeudi');
  await attendre(300);
  await page.evaluate(() => {
    const c = document.querySelectorAll('#feuille-contenu .champs-fin .champ-texte');
    const salle = c[1].querySelector('input');
    salle.value = 'Basic-Fit Mulhouse';
    salle.dispatchEvent(new Event('input', { bubbles: true }));
    const note = c[2].querySelector('textarea');
    note.value = 'Dos fatigué, charges tenues';
    note.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await attendre(500);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#feuille-contenu .choix-routine button'))
      .filter((x) => /Reporter/.test(x.textContent))[0];
    b.click();
  });
  await attendre(400);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  const finie = base.sessions.filter((s) => s.titre === 'Jambes du jeudi')[0];
  ok('titre, salle et note de séance sont enregistrés', !!finie &&
    finie.salle === 'Basic-Fit Mulhouse' && /Dos fatigué/.test(finie.note || ''),
    JSON.stringify({ t: finie && finie.titre, s: finie && finie.salle, n: finie && finie.note }));
  // La base de papier REFUSE `salle_norme` (428C9) : si l'app l'envoyait, la
  // séance ne serait jamais montée et le test précédent tomberait déjà. On
  // vérifie en plus que rien n'est resté coincé dans la file.
  ok('`salle_norme` n’est jamais envoyée — la séance monte',
    finie.statut === 'terminee' && !/à envoyer|refusé/.test(await texte('#etat-sync')),
    (await texte('#etat-sync')).trim() || '(vide)');

  const patch = patchsRoutine().filter((p) => p.id === 're1').pop();
  ok('« Reporter » écrit les écarts sur la routine, et RIEN d’autre',
    !!patch && JSON.stringify(Object.keys(patch.champs).sort()) === '["note","repos_cible_s"]' &&
    patch.champs.repos_cible_s === 120 && /Ceinture/.test(patch.champs.note || ''),
    JSON.stringify(patch && patch.champs));

  await aller('/');
  await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.jour .seance'))
      .filter((x) => /Jambes du jeudi/.test(x.textContent))[0];
    c.click();
  });
  await attendre(1200);
  ok('la note de séance se relit sur le détail',
    /Dos fatigué/.test(await texte('#vue-detail')),
    (await texte('#vue-detail')).replace(/\s+/g, ' ').slice(0, 100));

  // ── Aucune déviation → aucune question (§6.2) ──────────────────────────
  //
  // La routine porte maintenant 2:00 et la note : une séance qui n'y touche pas
  // est CONFORME. C'est l'autre moitié du test — prouver qu'on demande ne vaut
  // que si l'on prouve aussi qu'on se tait.
  await aller('/saisie');
  await demarrerRoutine('Push');
  ok('la note de la routine suit dans la nouvelle séance',
    /Ceinture/.test(await lireBloc(0, '.note-exo')), await lireBloc(0, '.note-exo'));
  await saisirSerie(0, 100, 5);
  await page.click('#bandeau-seance .discret');
  await attendre(600);
  ok('sans déviation, AUCUNE question sur la routine ne se pose',
    (await compter('#feuille-contenu .question-routine')) === 0,
    (await compter('#feuille-contenu .question-routine')) + ' question(s)');
  await fermerFeuille();

  // ⚠️ L'AUTRE MOITIÉ : « GARDER », qui est le DÉFAUT.
  //
  // Prouver que « Reporter » écrit ne vaut que si l'on prouve aussi que ne rien
  // demander n'écrit pas. Sans ce test, une implémentation qui reporte TOUJOURS
  // passerait le banc — et corrigerait les routines d'Aurélien dans son dos.
  await ouvrirFeuilleBloc(0, '.repos-cible');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#feuille-contenu .grille-rpe button'))
      .filter((x) => x.textContent.trim() === '3:00')[0];
    b.click();
  });
  await attendre(900);
  const patchsAvantGarder = patchsRoutine().length;
  await page.click('#bandeau-seance .discret');
  await attendre(600);
  ok('une déviation ROUVRE la question', (await compter('#feuille-contenu .question-routine')) === 1,
    (await texte('#feuille-contenu .ecarts')).replace(/\s+/g, ' ').slice(0, 60));
  ok('et « Garder la routine » est sélectionné par défaut',
    await page.evaluate(() => {
      const s = document.querySelector('#feuille-contenu .choix-routine button.sel');
      return !!s && /Garder/.test(s.textContent);
    }), 'défaut = garder');
  await page.click('#feuille-contenu .principal');
  await attendre(2600);
  ok('terminer en gardant n’écrit RIEN dans la routine',
    patchsRoutine().length === patchsAvantGarder &&
    ROUTINE.routine_exercises[0].repos_cible_s === 120,
    patchsRoutine().length + ' PATCH (avant ' + patchsAvantGarder +
    ') · routine à ' + ROUTINE.routine_exercises[0].repos_cible_s);

  console.log('\n══ 7 octies. LES SUPERSETS ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : un superset à
  // SÉRIES INÉGALES, validé DANS LE DÉSORDRE. Sur un superset régulier validé
  // de haut en bas, « éclairage par tour » et « éclairage par ligne » rendent
  // exactement le même écran.
  await aller('/saisie');
  await demarrerRoutine('Superset');

  const etiquettes = (iBloc) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.no-serie'))
      .map((n) => n.textContent), iBloc);
  const allumees = (iBloc) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.serie'))
      .map((r) => r.classList.contains('faite')), iBloc);
  // Une rangée est adressée par son INDICE D'AFFICHAGE dans le bloc — c'est
  // l'ordre entrelacé, donc exactement ce qu'un pouce touche.
  const validerRangee = async (iBloc, iRangee) => {
    await page.evaluate(([k, r]) => {
      document.querySelectorAll('.bloc-seance')[k]
        .querySelectorAll('.ligne-serie')[r].querySelector('.ok-serie').click();
    }, [iBloc, iRangee]);
    await attendre(500);
  };
  const superT = () => texte('.bloc-seance.superset .superset-t');

  ok('le superset fait UN bloc, l’exercice seul en fait un autre',
    (await compter('.bloc-seance')) === 2 &&
    (await compter('.bloc-seance.superset')) === 1,
    (await compter('.bloc-seance')) + ' bloc(s), dont ' +
    (await compter('.bloc-seance.superset')) + ' superset');

  // Le liseré du détail de séance, repris tel quel : la même chose se reconnaît
  // au même signe d'un écran à l'autre. Couleur calculée, pas classe posée.
  const lisere = await page.evaluate(() => {
    const b = document.querySelectorAll('.bloc-seance');
    return [getComputedStyle(b[0]).borderLeftWidth, getComputedStyle(b[1]).borderLeftWidth];
  });
  ok('le superset porte le liseré, l’exercice seul n’en a pas',
    lisere[0] === '3px' && lisere[1] === '0px', JSON.stringify(lisere));

  ok('les séries s’affichent ENTRELACÉES, et le tour 3 n’attend aucun C3',
    JSON.stringify(await etiquettes(0)) ===
    JSON.stringify(['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3']),
    JSON.stringify(await etiquettes(0)));

  ok('l’exercice seul numérote 1, 2 — aucune lettre',
    JSON.stringify(await etiquettes(1)) === JSON.stringify(['1', '2']),
    JSON.stringify(await etiquettes(1)));

  const legende = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.exo-seance'))
      .map((n) => n.textContent));
  ok('le nom de chaque exercice n’apparaît QU’UNE FOIS, dans la légende',
    legende.length === 3 && /^ADéveloppé/.test(legende[0]) && /^BCurl/.test(legende[1]),
    JSON.stringify(legende));

  // ⚠️ 360 px — LA LARGEUR RÉELLE DE L'APPAREIL. La légende existe pour tenir
  // le nom une seule fois ; si elle le coupe, elle ne sert plus à rien. Et
  // « A1 » dans 30 px de numéro débordait : la colonne passe à 36.
  const geom = await page.evaluate(() => {
    const bloc = document.querySelectorAll('.bloc-seance')[0];
    const noms = Array.from(bloc.querySelectorAll('.exo-seance'));
    const rangees = Array.from(bloc.querySelectorAll('.serie'));
    return {
      largeur: document.documentElement.clientWidth,
      debordePage: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      nomsCoupes: noms.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
      // ⚠️ ON MESURE LE TEXTE, PAS LA BOÎTE. `.no-serie` est une grille à
      // contenu centré, `overflow` visible : « A1 » dans 12 px déborde sur les
      // colonnes voisines SANS changer d'un pixel son `scrollWidth`. Une
      // mutation qui rétrécissait la colonne passait donc au travers. Un
      // `Range` sur le contenu donne la largeur réellement peinte.
      numerosCoupes: Array.from(bloc.querySelectorAll('.no-serie')).filter((n) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        return r.getBoundingClientRect().width > n.getBoundingClientRect().width + 1;
      }).length,
      rangeesDebordantes: rangees.filter((r) => r.scrollWidth > r.clientWidth + 1).length
    };
  });
  ok('à 360 px : aucun nom coupé, aucun numéro coupé, rien qui déborde',
    geom.largeur <= 360 && !geom.debordePage && geom.nomsCoupes === 0 &&
    geom.numerosCoupes === 0 && geom.rangeesDebordantes === 0,
    JSON.stringify(geom));

  // §3 ter — un superset peut mélanger les mesures. Chaque ligne garde la
  // sienne ; l'en-tête se tait plutôt que de mentir sur la moitié des rangées.
  const grilles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.serie'))
      .map((r) => Array.from(r.classList).filter((c) => c.startsWith('g-'))[0]));
  ok('chaque ligne garde le gabarit de SON exercice, même mélangés',
    JSON.stringify(grilles) === JSON.stringify([
      'g-charge_reps', 'g-charge_reps', 'g-temps',
      'g-charge_reps', 'g-charge_reps', 'g-temps',
      'g-charge_reps', 'g-charge_reps']),
    JSON.stringify(grilles));
  ok('et l’en-tête de colonnes se tait sur un bloc à mesures mélangées',
    (await page.evaluate(() =>
      document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.cols-seance').length)) === 0 &&
    (await page.evaluate(() =>
      document.querySelectorAll('.bloc-seance')[1].querySelectorAll('.cols-seance').length)) === 1,
    'superset mélangé : aucun · exercice seul : un');

  // ── L'éclairage porte sur le TOUR, et le tour ne recule pas ─────────────
  ok('au départ, le tour annoncé est le premier', /tour 1\/3/.test(await superT()),
    (await superT()).trim());

  // Rangée 0 = A1. Validée seule, elle n'allume rien : le tour n'est pas fait.
  await validerRangee(0, 0);
  ok('valider A1 seul n’allume RIEN — l’éclairage porte sur le tour',
    (await allumees(0)).every((x) => x === false) && /tour 1\/3/.test(await superT()),
    JSON.stringify(await allumees(0)) + ' · ' + (await superT()).trim());
  // ⚠️ ET ELLE SE VOIT POUR DE VRAI — couleur calculée, pas classe posée.
  // Le style de la coche était accroché à `.serie.faite` ; le fond vert disant
  // désormais « le tour est fait », la coche d'une ligne validée dans un tour
  // incomplet se serait éteinte exactement là où elle sert le plus.
  const coche = await page.evaluate(() => {
    const bloc = document.querySelectorAll('.bloc-seance')[0];
    const cochees = bloc.querySelectorAll('.ok-serie.cochee');
    const eteinte = bloc.querySelectorAll('.ok-serie:not(.cochee)')[0];
    return {
      n: cochees.length,
      fond: cochees[0] ? getComputedStyle(cochees[0]).backgroundColor : '',
      fondEteinte: eteinte ? getComputedStyle(eteinte).backgroundColor : '',
      rangeeAllumee: cochees[0] ? cochees[0].closest('.serie').classList.contains('faite') : null
    };
  });
  ok('mais sa coche, elle, se voit — même dans un tour non allumé',
    coche.n === 1 && coche.rangeeAllumee === false &&
    coche.fond !== coche.fondEteinte && /^rgb/.test(coche.fond),
    JSON.stringify(coche));

  // ⚠️ DANS LE DÉSORDRE : C1 avant B1.
  await validerRangee(0, 2);          // C1
  await validerRangee(0, 1);          // B1
  ok('le tour se ferme dans le désordre, et s’allume d’un coup',
    JSON.stringify(await allumees(0)) ===
    JSON.stringify([true, true, true, false, false, false, false, false]),
    JSON.stringify(await allumees(0)));
  ok('et le tour annoncé avance', /tour 2\/3/.test(await superT()), (await superT()).trim());

  // ⚠️ DÉVALIDER NE FAIT PAS RECULER LE TOUR — asymétrie assumée (§2.7).
  await validerRangee(0, 0);          // dévalide A1
  ok('dévalider ne fait PAS reculer le tour', /tour 2\/3/.test(await superT()),
    (await superT()).trim());
  ok('mais l’éclairage, lui, dit la vérité du moment',
    (await allumees(0)).slice(0, 3).every((x) => x === false),
    JSON.stringify((await allumees(0)).slice(0, 3)));
  await validerRangee(0, 0);          // revalide A1

  // ── Le tour 3, sans C3 ─────────────────────────────────────────────────
  for (const r of [3, 4, 5, 6, 7]) await validerRangee(0, r);
  ok('le tour 3 se ferme sans C3 : tout le bloc est allumé',
    (await allumees(0)).every((x) => x === true) && /tour 3\/3/.test(await superT()),
    JSON.stringify(await allumees(0)) + ' · ' + (await superT()).trim());

  // ── Le superset SURVIT à l'enregistrement ──────────────────────────────
  //
  // L'exercice seul est validé lui aussi : sans ses lignes, la comparaison
  // avec le détail ne porterait que sur le superset et laisserait justement
  // passer un débordement des lettres sur le bloc d'à côté.
  await validerRangee(1, 0);
  await validerRangee(1, 1);
  const enBase = sets().filter((s) => s.session_id === seanceCourante());
  ok('`groupe_superset` part en base — sinon le superset disparaîtrait au détail',
    enBase.length === 10 &&
    enBase.filter((s) => s.groupe_superset === 1).length === 8 &&
    enBase.filter((s) => s.groupe_superset === null).length === 2,
    JSON.stringify(enBase.map((s) => s.exercise_slug + '@' + s.groupe_superset)));

  const idSuper = seanceCourante();
  await page.click('#bandeau-seance .discret');
  await attendre(600);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  // ⚠️ LA COMPARAISON QUI COMPTE : le détail de séance rend déjà
  // l'entrelacement en lecture (chantier 12). Les deux écrans doivent dire la
  // même chose de la même séance — sinon l'un des deux est faux.
  await aller('/seance/' + idSuper);
  const auDetail = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#vue-detail .bloc')).map((b) =>
      Array.from(b.querySelectorAll('.serie .tag')).map((t) => t.textContent)));
  ok('le détail rend les MÊMES étiquettes que la saisie',
    JSON.stringify(auDetail) ===
    JSON.stringify([['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3'], ['1', '2']]),
    JSON.stringify(auDetail));
  ok('et il reconnaît le superset, liseré compris',
    (await compter('#vue-detail .bloc.superset')) === 1,
    (await compter('#vue-detail .bloc.superset')) + ' bloc(s) superset');

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
