#!/usr/bin/env node
// tests/banc/profil-creation.js — 60-2b : LA LIGNE DE PROFIL SE CRÉE SOUS LE BON IDENTIFIANT.
//
// LE CONSTAT (journaux de la base du 07/10/2026, compte Test0710) : un `POST
// /rest/v1/profiles` en 403 (« new row violates row-level security policy »), puis
// un 201 27 secondes plus tard avec le MÊME jeton. `profiles_creation` exige
// `id = auth.uid()` : l'`id` envoyé n'était pas celui du compte connecté.
//
// LE FAUX SERVEUR FAIT COMME LA BASE : il lit le sujet (`sub`) du jeton
// `Authorization`, ne rend à `GET /profiles` que la ligne de ce sujet (RLS de
// lecture), et REFUSE en 403/42501 un `POST` dont l'`id` n'est pas ce sujet. Il
// reproduit aussi ce que le SDK fait de vrai : il absorbe un lien de
// confirmation (`#access_token=…`) en appelant `GET /auth/v1/user`, puis écrit la
// session dans le stockage et émet `SIGNED_IN`.
//
// Le vrai navigateur, la vraie app (`v2/`), un faux Supabase en mémoire. Cinq
// scénarios, chacun dans son contexte (stockage vierge) :
//   1. « compte A, Quitter, inscription du compte B » — la ligne de B se crée du
//      premier coup, sans un seul refus, et celle de A n'est pas touchée. ⚠️ NON-RÉGRESSION
//      pour le 403 : ce scénario passe aussi sur le code d'avant (l'inscription de B vide le
//      cache et la génération écarte l'entrée de A). Mais (60-2c) la ligne de B porte le
//      PSEUDO tapé : ce contrôle-là échoue sur le code d'avant ;
//   2. « le lien de confirmation de B ouvre une page dont le stockage porte encore
//      A » — la course du constat : la sonde synchrone lit A, le SDK absorbe B ;
//      sans le correctif, `chargerProfil` créait la ligne avec l'identifiant de A (403) ;
//   3. « la création échoue » — elle se dit (le code d'avant l'avalait), puis se rejoue
//      au chargement suivant ;
//   4. « le jeton change sous l'app, sans évènement » (un autre onglet) — un geste du Profil
//      ne part pas sous l'identifiant de l'ancien compte avec le jeton du nouveau (403 sans
//      le correctif) ;
//   5. « inscription sur une page vierge » (60-2c) — la ligne naît avec le pseudo tapé : le
//      pseudo se perdait à CHAQUE inscription à session immédiate, pas seulement après « Quitter ».
//   6, 6 bis, 7 (60-3b) — le pseudo traverse la confirmation d'e-mail ; « pris entre-temps » ;
//   8, 9, 9 bis, 10 (60-5) — UN PSEUDO REFUSÉ NE BLOQUE PLUS LE PROFIL, depuis la ligne « Pseudo » du Profil :
//      8   la feuille vérifie avant de se fermer : pris → elle reste ouverte avec le refus, RIEN n'est écrit ;
//      9   hors ligne, la feuille se ferme (on ne sait pas), les réponses attendent, et au retour du réseau
//          la base refuse le pseudo : DEUX envois, les réponses arrivent, la phrase s'affiche ;
//      9 bis  la même chose en ligne, quand la vérification dit « libre » et que la base refuse quand même ;
//      9 ter  un compte qui a DÉJÀ un pseudo : l'ancien revient, et la ligne le dit (pas un silence) ;
//      10  hors ligne avec un pseudo LIBRE : l'envoi attend, puis se résout ;
//      11  la vérification qui PEND (réseau connecté mais sans données) : la feuille attend, le bouton est grisé et le
//          champ figé, puis au bout du délai « on ne sait pas » — elle se ferme et l'envoi part.
//   [E70] (70, ECRAN-PROFIL §5.6) — L'ENTRÉE QUI MARCHE, sans session enregistrée :
//      a  le lien de récupération → l'app entre, « Choisis ton nouveau mot de passe » est ouverte (le questionnaire
//         attend derrière), valider appelle `updateUser` et le profil dit « Mot de passe changé. » ;
//         (a bis) fermée sans valider, rien n'est envoyé et le questionnaire prend la suite ;
//      b  le lien de confirmation (`type=signup`) → l'app entre ;
//      c  le lien expiré (`#error=…&error_code=otp_expired`) → l'écran de connexion, avec la phrase ;
//      d  sans fragment, sans session, HORS RÉSEAU → l'écran de connexion tout de suite ;
//      e  une session enregistrée PÉRIMÉE, hors réseau → l'app tout de suite (le SDK, lui, partirait rafraîchir) ;
//      f  l'adresse ne garde aucun fragment après l'entrée ;
//      g  le SDK ne répond jamais : « Ouverture du lien… » tout de suite, puis à 5 s l'écran de connexion qui le dit ;
//      h  le SDK répond à 7 s : à 5 s l'écran de connexion, puis l'app entre d'elle-même et ouvre la feuille ;
//      et l'inscription sans session : la phrase de §5.6, « Mot de passe oublié ? » juste dessous.
//      a, b, c, f échouent sur le code d'avant 70 (l'écran de connexion, adresse réécrite avant la lecture du jeton).
// SEULS LES SCÉNARIOS 2 ET 4 REPRODUISENT LE 403 SUR LE CODE D'AVANT ; les contrôles du pseudo
// (1 et 5) échouent sur le code d'avant 60-2c ; ceux de 8 à 10, sur le code d'avant 60-5.
//
//   node tests/banc/profil-creation.js

'use strict';
const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
// 59-4 — tout navigateur de test passe par la garde réseau (aucune requête vers la vraie base).
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.BANC_PORT || 8893), BASE = 'http://127.0.0.1:' + PORT;

const A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-0000000000bb';
const C = '00000000-0000-4000-8000-0000000000cc';   // 60-3b — un tiers : il prend le pseudo de B « entre-temps »
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Le faux jeton : un JWT dont seul le `sub` compte ────────────────────────
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64({ sub, role: 'authenticated', aud: 'authenticated', exp: 4102444800, email: sub + '@banc.test' }) + '.sig';
const subDe = (auth) => {
  const m = /^Bearer (.+)$/.exec(auth || '');
  if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8')).sub || null; }
  catch (e) { return null; }
};
// 60-3b — `meta` : les données du compte (`user_metadata`), celles que `signUp` a reçues en `options.data`.
const utilisateur = (id, meta) => ({ id, aud: 'authenticated', role: 'authenticated', email: id + '@banc.test',
  email_confirmed_at: '2026-10-08T08:00:00.000Z', app_metadata: { provider: 'email' }, user_metadata: meta || {},
  created_at: '2026-10-08T08:00:00.000Z' });
const sessionDe = (id, meta) => ({ access_token: jwt(id), token_type: 'bearer', expires_in: 3600,
  expires_at: 4102444800, refresh_token: 'r-' + id, user: utilisateur(id, meta) });

// ── La base de papier ───────────────────────────────────────────────────────
function neuveBase() {
  return {
    profils: {
      [A]: { id: A, username: 'compte_a', onboarding_completed: true, intention: 'progresser', rythme_progression: 'normal',
             questionnaire_fait_le: '2026-10-01T08:00:00.000Z' }
    },
    requetes: [],        // { methode, id, sub, statut } — toutes les écritures de `profiles`
    refus: [],           // les écritures refusées par la « RLS »
    inscrits: 0,
    echecsCreation: 0,   // des échecs 500 à servir avant d'accepter une création
    avertissements: [],
    // 60-5 — `reseauCoupe` : toute requête vers la base échoue (le téléphone hors ligne) ; `tentatives` compte les
    // écritures de profil tentées, aboutes ou non ; `rpcToujoursLibre` : la vérification du pseudo répond « libre »
    // même quand un tiers le tient (il l'a pris entre-temps) ; `questions` : les pseudos demandés à `pseudo_libre`.
    reseauCoupe: false, tentatives: 0, rpcToujoursLibre: false, questions: [], rpcPend: false,
    // 60-3b — la confirmation d'e-mail : `signUp` ne rend alors PAS de session (le projet réel l'exige) ;
    // ce qu'il a reçu est gardé (`inscriptions`), et les données du compte reviennent avec l'utilisateur
    // (`/auth/v1/user`, le jeton rafraîchi), comme chez Supabase.
    confirmationEmail: false,
    inscriptions: [],    // { email, data, redirect_to } — ce que `signUp` a reçu
    metadonnees: {},     // id → user_metadata
    motsDePasse: [],     // 70 — { sub, password } : ce que `updateUser` a reçu
    pesees: [],          // 92 — ce que `body_weight_log` a reçu
    userPend: false, userDelai: 0,  // 70 — la vérification du jeton d'un lien ne répond pas / répond en retard
    // 104 et 108 — la base AVANT v2_086 / v2_088 : `profiles.bilans_annonces` / `profiles.ma_salle` n'existent pas.
    // Un `select` qui les nomme rend 42703, un `upsert` qui les porte rend PGRST204 — comme PostgREST.
    // `refusColonne` compte ces refus.
    sansBilansAnnonces: false, sansMaSalle: false, refusColonne: 0,
    // 123 — la base AVANT v2_095 : `profiles_ma_salle_ok` n'accepte que `{ max, pas }` pour les haltères (v2_088).
    avantV2095: false
  };
}

// 108 — la contrainte `profiles_ma_salle_ok` de v2_088, imitée : NULL, ou un objet aux trois clés connues ; des barres
// de 1 à 100 kg au demi-kilo (au plus 20 par liste) ; des haltères nuls ou `{ max, pas }` (1-100, 0,5-10, pas ≤ max).
// 123 (v2_095) — aussi une liste de 1 à 3 tranches `{ jusqua, pas }` (des « jusqu'à » croissants, chaque pas au plus
// la longueur de sa tranche) ; `avantV2095` : la contrainte de v2_088 seule.
function salleConforme(v, avantV2095) {
  if (v === null) return true;
  if (typeof v !== 'object' || Array.isArray(v)) return false;
  // 132 (`v2_099`, `v2_102`) — les élastiques : `elastiques` [{nom, kg?}], `mini_bandes` [{nom}], `elastiques_par_nom`.
  if (Object.keys(v).some((k) => ['barres_ez', 'barres_droites', 'halteres', 'elastiques', 'elastiques_par_nom',
    'mini_bandes'].indexOf(k) < 0)) return false;
  const demi = (x) => typeof x === 'number' && Math.floor(x * 2) === x * 2;
  const liste = (x, cles) => x === undefined || (Array.isArray(x) && x.length <= 10 && x.every((e) => e &&
    typeof e === 'object' && !Array.isArray(e) && Object.keys(e).every((k) => cles.indexOf(k) >= 0) &&
    typeof e.nom === 'string' && /^[^ ](.{0,28}[^ ])?$/.test(e.nom) &&
    (e.kg === undefined || e.kg === null || (demi(e.kg) && e.kg >= 0.5 && e.kg <= 100))));
  if (!liste(v.elastiques, ['nom', 'kg']) || !liste(v.mini_bandes, ['nom'])) return false;
  if (v.elastiques_par_nom !== undefined && typeof v.elastiques_par_nom !== 'boolean') return false;
  const barres = (l) => l === undefined || (Array.isArray(l) && l.length <= 20 &&
    l.every((x) => typeof x === 'number' && x >= 1 && x <= 100 && Math.floor(x * 2) === x * 2));
  if (!barres(v.barres_ez) || !barres(v.barres_droites)) return false;
  const h = v.halteres;
  if (h === undefined || h === null) return true;
  if (Array.isArray(h)) {
    if (avantV2095 || !h.length || h.length > 3) return false;
    return h.every((t, i) => t && typeof t === 'object' && !Array.isArray(t) &&
      Object.keys(t).every((k) => k === 'jusqua' || k === 'pas') && demi(t.jusqua) && demi(t.pas) &&
      t.jusqua >= 1 && t.jusqua <= 100 && t.pas >= 0.5 && t.pas <= 10 &&
      t.jusqua > (i ? h[i - 1].jusqua : 0) && t.pas <= t.jusqua - (i ? h[i - 1].jusqua : 0));
  }
  return typeof h === 'object' && Object.keys(h).every((k) => k === 'max' || k === 'pas') &&
    typeof h.max === 'number' && typeof h.pas === 'number' && h.max >= 1 && h.max <= 100 && h.pas >= 0.5 &&
    h.pas <= 10 && h.pas <= h.max && Math.floor(h.max * 2) === h.max * 2 && Math.floor(h.pas * 2) === h.pas * 2;
}

async function contexte(nav, bd, o) {
  const opt = o || {};
  const ctx = await nav.newContext({ viewport: { width: 380, height: 760 }, serviceWorkers: 'block' });
  // Le stockage de départ — posé UNE fois par onglet (le rechargement ne le repose pas).
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('__graine')) return;
    sessionStorage.setItem('__graine', '1');
    if (s) localStorage.setItem('th-v2-auth', s);
  }, opt.stockage ? JSON.stringify(opt.stockage) : null);
  // 135 — chaque requête est comptée en vol jusqu'à sa réponse (`calme`). Sauf celles que le banc fait PENDRE
  // exprès (`userPend`, `rpcPend`) : elles ne répondent jamais, et le calme se mesure sans elles.
  await ctx.route(/supabase\.co/, async (route) => {
    const r = route.request(), ch = new URL(r.url()).pathname;
    const pend = (bd.userPend && ch === '/auth/v1/user' && r.method() === 'GET') ||
      (bd.rpcPend && ch.indexOf('/rest/v1/rpc/pseudo_libre') === 0);
    if (pend) return traiter(route);
    bd.enVol = (bd.enVol || 0) + 1; bd.dernier = Date.now();
    try { return await traiter(route); } finally { bd.enVol--; bd.dernier = Date.now(); }
  });
  async function traiter(route) {
    const req = route.request();
    const url = new URL(req.url());
    const chemin = url.pathname;
    const sub = subDe(req.headers()['authorization']);
    const json = (data, status) => route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(data) });
    const objet = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    // 60-5 — le réseau coupé : rien n'arrive à la base (ni l'écriture, ni la question du pseudo).
    if (bd.reseauCoupe) {
      if (chemin === '/rest/v1/profiles' && req.method() === 'POST') bd.tentatives++;
      return route.abort('internetdisconnected');
    }

    // ── L'authentification ────────────────────────────────────────────────
    if (chemin === '/auth/v1/signup' && req.method() === 'POST') {
      bd.inscrits++;
      const id = B;      // le seul compte qui s'inscrit au banc
      const corps = JSON.parse(req.postData() || '{}');
      bd.inscriptions.push({ email: corps.email, data: corps.data, redirect_to: url.searchParams.get('redirect_to') });
      bd.metadonnees[id] = corps.data || {};
      // Confirmation d'e-mail : l'utilisateur à plat, SANS jeton (le SDK en tire `session: null`).
      return bd.confirmationEmail ? json(utilisateur(id, bd.metadonnees[id])) : json(sessionDe(id, bd.metadonnees[id]));
    }
    if (chemin === '/auth/v1/token' && req.method() === 'POST') {
      const g = url.searchParams.get('grant_type');
      if (g === 'refresh_token') {
        const r = JSON.parse(req.postData() || '{}').refresh_token || '';
        const qui = r.replace(/^r-/, '');
        return json(sessionDe(qui, bd.metadonnees[qui]));
      }
      // Connexion par mot de passe : le compte qui s'est inscrit (60-3b), sinon A.
      const qui = bd.inscriptions.some((i) => i.email === (JSON.parse(req.postData() || '{}').email)) ? B : A;
      return json(sessionDe(qui, bd.metadonnees[qui]));
    }
    if (chemin === '/auth/v1/user' && req.method() === 'GET') {
      // 70 — la vérification du jeton d'un lien : qui ne répond jamais (`userPend`), ou en retard (`userDelai`, ms).
      if (bd.userPend) return new Promise(() => {});
      if (bd.userDelai) { await attendre(bd.userDelai); bd.userRepondu = Date.now(); }   // 86 — l'instant de la réponse
      return sub ? json(utilisateur(sub, bd.metadonnees[sub])) : json({ message: 'jeton absent' }, 401);
    }
    // 70 — `updateUser({ password })` : le nouveau mot de passe, sous le compte du jeton.
    if (chemin === '/auth/v1/user' && req.method() === 'PUT') {
      if (!sub) return json({ message: 'jeton absent' }, 401);
      bd.motsDePasse.push({ sub, password: (JSON.parse(req.postData() || '{}')).password });
      return json(utilisateur(sub, bd.metadonnees[sub]));
    }
    if (chemin === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (chemin.indexOf('/auth/') === 0) return json({ error: 'x' }, 400);

    // ── Les profils : la « RLS » ───────────────────────────────────────────
    if (chemin === '/rest/v1/profiles') {
      if (bd.sansBilansAnnonces && /bilans_annonces/.test(url.searchParams.get('select') || '')) {
        bd.refusColonne++;
        return json({ code: '42703', details: null, hint: null, message: 'column profiles.bilans_annonces does not exist' }, 400);
      }
      if (bd.sansBilansAnnonces && req.method() === 'POST' && /"bilans_annonces"/.test(req.postData() || '')) {
        bd.refusColonne++;
        return json({ code: 'PGRST204', details: null, hint: null,
          message: "Could not find the 'bilans_annonces' column of 'profiles' in the schema cache" }, 400);
      }
      if (bd.sansMaSalle && /ma_salle/.test(url.searchParams.get('select') || '')) {
        bd.refusColonne++;
        return json({ code: '42703', details: null, hint: null, message: 'column profiles.ma_salle does not exist' }, 400);
      }
      if (bd.sansMaSalle && req.method() === 'POST' && /"ma_salle"/.test(req.postData() || '')) {
        bd.refusColonne++;
        return json({ code: 'PGRST204', details: null, hint: null,
          message: "Could not find the 'ma_salle' column of 'profiles' in the schema cache" }, 400);
      }
      if (req.method() === 'GET') {
        const demande = (/(?:^|[?&])id=eq\.([^&]+)/.exec(url.search) || [])[1];
        const lignes = Object.keys(bd.profils).map((k) => bd.profils[k])
          .filter((l) => l.id === sub && (!demande || l.id === decodeURIComponent(demande)));   // lecture : sa ligne seulement
        if (objet) {
          return lignes.length ? json(lignes[0]) : json({ code: 'PGRST116', details: 'The result contains 0 rows',
            hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406);
        }
        return json(lignes);
      }
      if (req.method() === 'POST') {
        const corps = JSON.parse(req.postData() || '{}');
        const l = Array.isArray(corps) ? corps[0] : corps;
        bd.tentatives++;
        // `aPseudo` : cette écriture portait-elle un pseudo ? (60-5 : le second envoi n'en porte plus)
        const enregistre = (statut) => bd.requetes.push({ methode: 'POST', id: l.id, sub, statut, aPseudo: typeof l.username === 'string' && !!l.username });
        if (!sub || l.id !== sub) {          // profiles_creation / profiles_modif : id = auth.uid()
          enregistre(403);
          bd.refus.push({ id: l.id, sub });
          return json({ code: '42501', details: null, hint: null,
            message: 'new row violates row-level security policy for table "profiles"' }, 403);
        }
        // 60-3b — `profiles_username_uniq` : index unique sur lower(username), toutes lignes confondues
        // (l'index ignore la RLS : B ne VOIT pas la ligne qui lui prend son pseudo, la base la voit).
        if (l.username && Object.keys(bd.profils).some((k) => bd.profils[k].id !== l.id && bd.profils[k].username &&
            String(bd.profils[k].username).toLowerCase() === String(l.username).toLowerCase())) {
          enregistre(409);
          return json({ code: '23505', details: 'Key (lower(username::text))=(' + String(l.username).toLowerCase() + ') already exists.',
            hint: null, message: 'duplicate key value violates unique constraint "profiles_username_uniq"' }, 409);
        }
        // 108 — `profiles_ma_salle_ok` (v2_088, v2_095 : 123) : la contrainte, imitée (la forme et les bornes).
        if (l.ma_salle !== undefined && !salleConforme(l.ma_salle, bd.avantV2095)) {
          enregistre(400);
          return json({ code: '23514', details: null, hint: null,
            message: 'new row for relation "profiles" violates check constraint "profiles_ma_salle_ok"' }, 400);
        }
        if (!bd.profils[l.id] && bd.echecsCreation > 0) {
          bd.echecsCreation--;
          enregistre(500);
          return json({ message: 'incident passager' }, 500);
        }
        bd.profils[l.id] = Object.assign({ questionnaire_fait_le: null }, bd.profils[l.id] || {}, l);
        enregistre(201);
        return json(objet ? bd.profils[l.id] : [bd.profils[l.id]], 201);
      }
    }

    // 92 — la file des pesées : ce qu'elle envoie est relevé.
    if (chemin === '/rest/v1/body_weight_log' && req.method() === 'POST') {
      const corps = JSON.parse(req.postData() || '{}');
      (Array.isArray(corps) ? corps : [corps]).forEach((l) => bd.pesees.push(l));
      return json(objet ? corps : [corps], 201);
    }
    // ── Le reste : de quoi démarrer ───────────────────────────────────────
    if (chemin.indexOf('/rest/v1/rpc/pseudo_libre') === 0) {
      // 60-5 — comme la vraie fonction (SECURITY DEFINER) : « libre » si AUCUNE ligne, la sienne comprise, ne le tient.
      const nom = String((JSON.parse(req.postData() || '{}')).nom || '').toLowerCase();
      bd.questions.push(nom);
      if (bd.rpcPend) return new Promise(() => {});          // 60-5 : connecté, mais la réponse ne vient jamais
      const tenu = Object.keys(bd.profils).some((k) => bd.profils[k].username && String(bd.profils[k].username).toLowerCase() === nom);
      return json(bd.rpcToujoursLibre ? true : !tenu);
    }
    if (/count=exact/.test(req.headers()['prefer'] || '')) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/0',
        'access-control-expose-headers': 'content-range, content-length' }, body: '' });
    }
    if (req.method() === 'GET') return json(objet ? null : []);
    return json([], 201);
  }
  return ctx;
}

async function attendreQue(page, cond, ms) {
  const fin = Date.now() + (ms || 12000);
  while (Date.now() < fin) {
    if (await cond()) return true;
    await attendre(200);   // le pas d'une boucle d'attente d'état (pas un délai fixe)
  }
  return false;
}

// ── 135 — L'ÉTAT, PAS LA DURÉE ────────────────────────────────────────────────
// Les délais fixes de ce banc « laissaient finir ce qui part encore » ou laissaient une feuille s'ouvrir. Ils
// deviennent l'attente de l'état que le contrôle suivant lit :
//   · `calme` : la base de papier n'a plus rien en vol, et rien depuis 400 ms ; puis l'écran est peint ;
//   · `feuilleOuverte` / `feuilleFermee` : la feuille du Profil, avec son contenu ;
//   · `rendu` : deux images peintes — la réaction synchrone d'un geste dans la feuille est à l'écran.
// Gardés, commentés « VOULU » : ceux qui constatent qu'un envoi N'A PAS lieu après un évènement sans effet
// visible (`online`) — aucun état de l'app ne dit « je n'enverrai rien », seul le temps le constate.
const rendu = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
const calme = async (page, bd, ms) => {
  await attendreQue(page, () => (bd.enVol || 0) === 0 && Date.now() - (bd.dernier || 0) >= 400, ms || 20000);
  await rendu(page);
};
const feuilleOuverte = (page) => attendreQue(page, () => page.evaluate(() => {
  const f = document.querySelector('#feuille-seance'), c = document.querySelector('#feuille-contenu');
  return !!f && !f.hidden && !!c && c.children.length > 0;
}), 10000);
const feuilleFermee = (page) => attendreQue(page, () => page.evaluate(() => {
  const f = document.querySelector('#feuille-seance'); return !f || f.hidden;
}), 10000);
const versInscription = (page) => attendreQue(page, () => page.evaluate(() => {
  const p = document.querySelector('#env-pseudo'); return !!p && !p.hidden;
}), 10000);

// ── 60-3b — l'inscription AVEC confirmation d'e-mail ────────────────────────
// Le pseudo tapé n'est pas déjà normalisé : le contrôle de la ligne discrimine aussi la normalisation.
const PSEUDO_TAPE = 'Mélodie Dupont', PSEUDO_NORMALISE = 'melodie_dupont';

// Page vierge → écran d'inscription → les trois champs → « Créer » : ce que fait la personne avant de
// quitter son navigateur pour ouvrir le lien reçu par e-mail.
async function inscrireSansSession(nav, bd) {
  const ctx = await contexte(nav, bd, {});
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await attendreQue(page, () => page.evaluate(() => {
    const v = document.querySelector('#vue-connexion'); return !!v && !v.hidden; }), 15000);
  await page.click('#btn-bascule-entree');
  await versInscription(page);
  await page.fill('#champ-pseudo', PSEUDO_TAPE);
  await page.fill('#champ-email', 'b@banc.test');
  await page.fill('#champ-mdp', 'motdepasse123');
  await attendreQue(page, () => page.evaluate(() => !document.querySelector('#btn-connexion').disabled), 5000);
  await page.click('#btn-connexion');
  await attendreQue(page, () => bd.inscriptions.length > 0, 15000);
  await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
  const message = await page.evaluate(() => document.querySelector('#erreur-connexion').textContent);
  const jeton = await page.evaluate(() => localStorage.getItem('th-v2-auth'));
  // 70 — « Mot de passe oublié ? » visible, juste sous la phrase.
  const oubli = await page.evaluate(() => {
    const b = document.querySelector('#btn-oubli');
    return { visible: !b.hidden && b.offsetParent !== null, sous: document.querySelector('#erreur-connexion').nextElementSibling === b };
  });
  await ctx.close();       // « l'autre navigateur » : la mémoire de la page (`pseudoAInscrire`) disparaît avec elle
  return { erreurs, message, jeton, oubli };
}

// La page NEUVE « qui s'ouvre avec la session du lien » : le stockage porte la session de B, avec les
// données de son compte (`user_metadata`) telles que le serveur les a reçues à l'inscription.
const pageDuLien = async (nav, bd) => {
  const ctx = await contexte(nav, bd, { stockage: sessionDe(B, bd.metadonnees[B]) });
  return { ctx, page: await ctx.newPage() };
};

// La ligne « Pseudo » de l'écran Profil, telle qu'elle se lit.
const lignePseudoDuProfil = (page) => page.evaluate(() => {
  const l = Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
    .filter((x) => ((x.querySelector('.p-lib') || {}).textContent || '').indexOf('Pseudo') === 0)[0];
  return l ? { lib: l.querySelector('.p-lib').textContent, val: (l.querySelector('.p-val') || {}).textContent || '' } : null;
});

// 60-5 — un clic sur la ligne du Profil dont le libellé commence par `libelle`.
const cliquerLigne = (page, libelle) => page.evaluate((l) => Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
  .filter((x) => ((x.querySelector('.p-lib') || {}).textContent || '').indexOf(l) === 0)[0].click(), libelle);

// La feuille de saisie : ouverte ? sa phrase de refus, son bouton « Valider » grisé ?
const feuilleSaisie = (page) => page.evaluate(() => {
  const champ = document.querySelector('#feuille-contenu .champ-texte input');
  const v = document.querySelector('#feuille-seance');
  const bouton = Array.from(document.querySelectorAll('#feuille-contenu button')).filter((b) => b.textContent === 'Valider')[0];
  return { ouverte: !!champ && !!v && !v.hidden, phrase: (document.querySelector('#feuille-contenu .feuille-err') || {}).textContent || '',
           valeur: champ ? champ.value : null, valider: bouton ? !bouton.disabled : null };
});

// Ouvre la feuille « Pseudo », y tape `pseudo`, touche « Valider ».
async function taperPseudo(page, pseudo) {
  await cliquerLigne(page, 'Pseudo');
  await feuilleOuverte(page);
  await page.fill('#feuille-contenu input', pseudo);
  await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button'))
    .filter((b) => b.textContent === 'Valider')[0].click());
}

// Un compte (B) qui a sa ligne de profil SANS pseudo, et un tiers (C) qui tient `Deja_Pris` — l'index est sur lower().
const baseSansPseudo = () => {
  const bd = neuveBase();
  bd.profils[B] = { id: B, username: null, onboarding_completed: true, questionnaire_fait_le: '2026-10-01T08:00:00.000Z' };
  bd.profils[C] = { id: C, username: 'Deja_Pris' };
  return bd;
};
const PHRASE_PRIS = 'Ce pseudo vient d’être pris : choisis-en un autre.';
const choisirObjectif = async (page, cle) => {
  await cliquerLigne(page, 'Objectif');
  await feuilleOuverte(page);
  await page.click('#feuille-contenu .feuille-menu button[data-cle="' + cle + '"]');
};
const ouvrirProfilDe = async (nav, bd) => {
  const ctx = await contexte(nav, bd, { stockage: sessionDe(B, {}) });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
  await page.goto(BASE + '/profil', { waitUntil: 'domcontentloaded' });
  await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 15000);
  await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
  return { ctx, page, erreurs };
};

const rapport = { controles: 0, echecs: [] };
function ok(nom, cond, detail) {
  rapport.controles++;
  if (cond) { console.log('   ✅ ' + nom); return; }
  rapport.echecs.push(nom);
  console.log('   ❌ ' + nom + (detail ? '  — ' + detail : ''));
}

(async () => {
  const serveur = creer({ racine: path.join(R, 'v2') });
  await new Promise((r) => serveur.listen(PORT, r));
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    // ══ 1. COMPTE A, « QUITTER », INSCRIPTION DU COMPTE B ════════════════════
    console.log('\n══ 1. compte A, « Quitter », inscription du compte B ══');
    {
      const bd = neuveBase();
      const ctx = await contexte(nav, bd, { stockage: sessionDe(A) });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/profil', { waitUntil: 'domcontentloaded' });
      const surProfil = await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#btn-deconnexion')), 15000);
      ok('prémisse — A est connecté, son profil s’affiche', surProfil);
      await page.click('#btn-deconnexion');
      await feuilleOuverte(page);
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((b) => b.textContent === 'Quitter')[0].click());
      const surConnexion = await attendreQue(page, () => page.evaluate(() => !document.querySelector('#vue-connexion').hidden), 10000);
      ok('« Quitter » ramène sur l’écran de connexion', surConnexion);
      const avantB = bd.requetes.length;
      await page.click('#btn-bascule-entree');
      await versInscription(page);
      await page.fill('#champ-pseudo', 'test_0710');
      await page.fill('#champ-email', 'b@banc.test');
      await page.fill('#champ-mdp', 'motdepasse123');
      await attendreQue(page, () => page.evaluate(() => !document.querySelector('#btn-connexion').disabled), 5000);
      await page.click('#btn-connexion');
      const cree = await attendreQue(page, () => !!bd.profils[B], 15000);
      ok('non-régression — la ligne de B est créée', cree, JSON.stringify(Object.keys(bd.profils)));
      ok('non-régression — du PREMIER coup : aucune écriture de profil refusée par la base',
        bd.refus.length === 0, JSON.stringify(bd.refus));
      // 60-2c : le pseudo tapé à l'inscription est celui de la ligne. `garantirProprietaire` (le cache
      // n'appartient plus à personne, B entre) le remettait à zéro entre sa pose et sa lecture.
      ok('DISCRIMINANT (60-2c) — la ligne de B porte le PSEUDO tapé à l’inscription, dans la même page, juste après « Quitter »',
        !!bd.profils[B] && bd.profils[B].username === 'test_0710', JSON.stringify(bd.profils[B]));
      ok('les écritures de B sont sous l’identifiant de B, et seulement celui-là',
        bd.requetes.slice(avantB).every((q) => q.id === B && q.sub === B && q.statut === 201), JSON.stringify(bd.requetes.slice(avantB)));
      ok('la ligne de A n’a pas bougé', bd.profils[A].username === 'compte_a' && bd.profils[A].intention === 'progresser');
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 2. LE LIEN DE CONFIRMATION DE B, SUR UNE PAGE QUI PORTE ENCORE A ═════
    console.log('\n══ 2. le lien de confirmation de B ouvre une page dont le stockage porte encore A ══');
    {
      const bd = neuveBase();
      const ctx = await contexte(nav, bd, { stockage: sessionDe(A) });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      const lien = BASE + '/#access_token=' + jwt(B) + '&expires_in=3600&refresh_token=r-' + B + '&token_type=bearer&type=signup';
      await page.goto(lien, { waitUntil: 'domcontentloaded' });
      const cree = await attendreQue(page, () => !!bd.profils[B], 15000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      ok('DISCRIMINANT — la ligne de B est créée', cree, JSON.stringify(bd.requetes));
      ok('DISCRIMINANT — du PREMIER coup : aucune création refusée (jamais l’identifiant de A sous le jeton de B)',
        bd.refus.length === 0, JSON.stringify(bd.refus));
      ok('aucune écriture de profil sous l’identifiant de A', bd.requetes.every((q) => q.id !== A), JSON.stringify(bd.requetes));
      const jeton = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('th-v2-auth')).user.id; } catch (e) { return null; }
      });
      ok('le SDK a bien absorbé le lien : la session stockée est celle de B', jeton === B, String(jeton));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 4. LE JETON CHANGE SOUS L'APP, SANS ÉVÈNEMENT : L'ÉCRITURE SUIT LE CLIENT ═══
    // Un autre onglet (ou un lien) a posé la session de B dans le stockage commun ; cet onglet-ci n'a
    // reçu aucun évènement et garde A en mémoire. Un geste du Profil part alors : l'`id` du corps ne
    // doit pas être celui de A sous le jeton de B (403), ni la ligne de A s'écrire dans celle de B.
    console.log('\n══ 4. le jeton change sous l’app, sans évènement : l’écriture suit le client ══');
    {
      const bd = neuveBase();
      const ctx = await contexte(nav, bd, { stockage: sessionDe(A) });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/profil', { waitUntil: 'domcontentloaded' });
      const surProfil = await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 15000);
      ok('prémisse — A est connecté, son profil s’affiche', surProfil);
      await calme(page, bd);     // l'entrée de A va jusqu'au bout (135 : l'état, plus 1,5 s)
      const avant = bd.requetes.length;
      await page.evaluate((s) => localStorage.setItem('th-v2-auth', s), JSON.stringify(sessionDe(B)));
      await page.evaluate(() => Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
        .filter((x) => ((x.querySelector('.p-lib') || {}).textContent || '').indexOf('Objectif') === 0)[0].click());
      await feuilleOuverte(page);
      await page.click('#feuille-contenu .feuille-menu button[data-cle="force"]');
      await attendreQue(page, () => !!bd.profils[B], 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const apres = bd.requetes.slice(avant);
      ok('DISCRIMINANT — aucune écriture de profil sous l’identifiant de A avec le jeton de B (pas de 403)',
        bd.refus.length === 0 && apres.every((q) => q.id === q.sub), JSON.stringify(apres));
      ok('DISCRIMINANT — la ligne de A n’a pas reçu le geste (il n’a pas été envoyé sous un autre identifiant)',
        bd.profils[A].objectif === undefined || bd.profils[A].objectif === null, JSON.stringify(bd.profils[A]));
      ok('la ligne de B n’a pas reçu le geste de A non plus', !bd.profils[B] || !bd.profils[B].objectif, JSON.stringify(bd.profils[B]));
      ok('le client entre sur SON compte : la ligne de B existe', !!bd.profils[B], JSON.stringify(Object.keys(bd.profils)));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 3. LA CRÉATION QUI ÉCHOUE SE DIT, PUIS SE REJOUE ═════════════════════
    console.log('\n══ 3. une création qui échoue se dit, puis se rejoue au chargement suivant ══');
    {
      const bd = neuveBase();
      bd.echecsCreation = 1;
      const ctx = await contexte(nav, bd, { stockage: sessionDe(B) });
      const page = await ctx.newPage();
      const avertissements = [];
      page.on('console', (m) => { if (m.type() === 'warning' && /Profil non créé/.test(m.text())) avertissements.push(m.text().slice(0, 200)); });
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      const dit = await attendreQue(page, () => avertissements.length > 0, 15000);
      ok('DISCRIMINANT — l’échec de la création se DIT (console), il n’est plus avalé', dit, JSON.stringify(bd.requetes));
      ok('prémisse — la première création a échoué (500) : pas de ligne', !bd.profils[B] && bd.requetes.some((q) => q.statut === 500), JSON.stringify(bd.requetes));
      await page.reload({ waitUntil: 'domcontentloaded' });
      const rejouee = await attendreQue(page, () => !!bd.profils[B], 15000);
      ok('DISCRIMINANT — au chargement suivant du profil, la création est REJOUÉE et réussit', rejouee, JSON.stringify(bd.requetes));
      ok('aucune écriture refusée par la base', bd.refus.length === 0, JSON.stringify(bd.refus));
      await ctx.close();
    }

    // ══ 5. L'INSCRIPTION SUR UNE PAGE VIERGE : LE PSEUDO N'A PAS BESOIN DE « QUITTER » POUR SE PERDRE ═══
    // Un compte NEUF n'est jamais propriétaire du cache : `garantirProprietaire` s'exécute à chaque
    // inscription à session immédiate, sur un appareil vierge comme après « Quitter ».
    console.log('\n══ 5. inscription sur une page vierge : la ligne naît avec le pseudo tapé ══');
    {
      const bd = neuveBase();
      const ctx = await contexte(nav, bd, {});
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      const surConnexion = await attendreQue(page, () => page.evaluate(() => {
        const v = document.querySelector('#vue-connexion'); return !!v && !v.hidden; }), 15000);
      ok('prémisse — page vierge : l’écran de connexion s’affiche, personne n’est connecté', surConnexion);
      await page.click('#btn-bascule-entree');
      await versInscription(page);
      await page.fill('#champ-pseudo', 'test_0710');
      await page.fill('#champ-email', 'b@banc.test');
      await page.fill('#champ-mdp', 'motdepasse123');
      await attendreQue(page, () => page.evaluate(() => !document.querySelector('#btn-connexion').disabled), 5000);
      await page.click('#btn-connexion');
      const cree = await attendreQue(page, () => !!bd.profils[B], 15000);
      ok('la ligne de B est créée, du premier coup, sans refus', cree && bd.refus.length === 0, JSON.stringify([Object.keys(bd.profils), bd.refus]));
      ok('DISCRIMINANT (60-2c) — la ligne de B porte le PSEUDO tapé à l’inscription (page vierge, sans « Quitter »)',
        !!bd.profils[B] && bd.profils[B].username === 'test_0710', JSON.stringify(bd.profils[B]));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 6. INSCRIPTION AVEC CONFIRMATION D'E-MAIL : LE PSEUDO VOYAGE AVEC LE COMPTE ═══
    // `signUp` ne rend pas de session ; la page d'inscription se ferme (avec elle, sa mémoire
    // `pseudoAInscrire`) ; une PAGE NEUVE s'ouvre avec la session du lien. La ligne doit naître avec le pseudo.
    console.log('\n══ 6. inscription avec confirmation : une page neuve s’ouvre avec la session du lien ══');
    {
      const bd = neuveBase();
      bd.confirmationEmail = true;
      const p1 = await inscrireSansSession(nav, bd);
      ok('prémisse — `signUp` a été appelé une fois, sans session : la page dit de confirmer l’e-mail',
        bd.inscriptions.length === 1 && /confirme ton e-mail/.test(p1.message) && !p1.jeton, JSON.stringify([bd.inscriptions, p1.message, p1.jeton]));
      ok('DISCRIMINANT — le pseudo NORMALISÉ part dans les données du compte (`options.data.pseudo`)',
        !!bd.inscriptions[0] && JSON.stringify(bd.inscriptions[0].data) === JSON.stringify({ pseudo: PSEUDO_NORMALISE }),
        JSON.stringify(bd.inscriptions[0]));
      ok('non-régression — l’adresse de retour est celle de la page (`emailRedirectTo`)',
        !!bd.inscriptions[0] && bd.inscriptions[0].redirect_to === BASE + '/', JSON.stringify(bd.inscriptions[0]));
      ok('sans session, aucune ligne de profil n’est écrite avant le lien', !bd.profils[B] && bd.requetes.length === 0, JSON.stringify(bd.requetes));

      const { ctx, page } = await pageDuLien(nav, bd);     // stockage vierge de l'inscription, mémoire vide
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      const cree = await attendreQue(page, () => !!bd.profils[B], 15000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      ok('la ligne de B est créée par la page neuve', cree, JSON.stringify(bd.requetes));
      ok('DISCRIMINANT — la ligne de B porte le PSEUDO de l’inscription, repris des données du compte',
        !!bd.profils[B] && bd.profils[B].username === PSEUDO_NORMALISE, JSON.stringify(bd.profils[B]));
      ok('du premier coup : une seule écriture, créée (201), sous l’identifiant de B',
        bd.requetes.length === 1 && bd.requetes[0].statut === 201 && bd.requetes[0].id === B && bd.requetes[0].sub === B && bd.refus.length === 0,
        JSON.stringify(bd.requetes));
      ok('aucune erreur de page', p1.erreurs.length === 0 && erreurs.length === 0, JSON.stringify([p1.erreurs, erreurs]));
      await ctx.close();
    }

    // ══ 6 bis. LE LIEN N'A PAS OUVERT DE SESSION : CONNEXION À LA MAIN, SUR UNE PAGE VIERGE ═══
    // Le même compte, la même mémoire perdue ; la personne tape son e-mail et son mot de passe. La ligne se
    // crée alors (première connexion) : le pseudo est toujours celui des données du compte.
    console.log('\n══ 6 bis. connexion à la main sur une page vierge, après la confirmation ══');
    {
      const bd = neuveBase();
      bd.confirmationEmail = true;
      const p1 = await inscrireSansSession(nav, bd);
      const ctx = await contexte(nav, bd, {});
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await attendreQue(page, () => page.evaluate(() => {
        const v = document.querySelector('#vue-connexion'); return !!v && !v.hidden; }), 15000);
      await page.fill('#champ-email', 'b@banc.test');
      await page.fill('#champ-mdp', 'motdepasse123');
      await attendreQue(page, () => page.evaluate(() => !document.querySelector('#btn-connexion').disabled), 5000);
      await page.click('#btn-connexion');
      const cree = await attendreQue(page, () => !!bd.profils[B], 15000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      ok('la ligne de B est créée à la première connexion', cree, JSON.stringify(bd.requetes));
      ok('DISCRIMINANT — elle porte le PSEUDO de l’inscription, repris des données du compte',
        !!bd.profils[B] && bd.profils[B].username === PSEUDO_NORMALISE, JSON.stringify(bd.profils[B]));
      ok('aucune écriture refusée, aucune erreur de page', bd.refus.length === 0 && p1.erreurs.length === 0 && erreurs.length === 0,
        JSON.stringify([bd.refus, p1.erreurs, erreurs]));
      await ctx.close();
    }

    // ══ 7. « PRIS ENTRE-TEMPS » : LA LIGNE NAÎT SANS LE PSEUDO, ET LE PROFIL LE DIT ═══
    console.log('\n══ 7. pris entre-temps : la ligne naît sans pseudo, la ligne « Pseudo » du Profil le dit ══');
    {
      const bd = neuveBase();
      bd.confirmationEmail = true;
      const p1 = await inscrireSansSession(nav, bd);
      // Pendant que le courriel dormait, quelqu'un d'autre a pris le pseudo (la sonde disait « libre » à la frappe).
      bd.profils[C] = { id: C, username: PSEUDO_NORMALISE.toUpperCase() };    // l'index est sur lower(username)
      const { ctx, page } = await pageDuLien(nav, bd);
      const erreurs = [], avertissements = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      page.on('console', (m) => { if (m.type() === 'warning' && /Pseudo déjà pris/.test(m.text())) avertissements.push(m.text().slice(0, 200)); });
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      const cree = await attendreQue(page, () => !!bd.profils[B], 15000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      ok('prémisse — l’inscription a bien déposé le pseudo dans les données du compte',
        !!bd.inscriptions[0] && bd.inscriptions[0].data && bd.inscriptions[0].data.pseudo === PSEUDO_NORMALISE, JSON.stringify(bd.inscriptions));
      ok('DISCRIMINANT — la ligne de B est créée quand même, SANS pseudo (le 23505 est repris, pas avalé)',
        cree && (bd.profils[B].username === null || bd.profils[B].username === undefined), JSON.stringify(bd.profils[B]));
      ok('l’ordre : la création avec le pseudo est refusée (409), puis celle sans pseudo passe (201) — aucun refus de la « RLS »',
        JSON.stringify(bd.requetes.map((q) => q.statut)) === '[409,201]' && bd.refus.length === 0, JSON.stringify(bd.requetes));
      ok('le pseudo pris se DIT (console), il n’est pas avalé', avertissements.length > 0, JSON.stringify(avertissements));
      ok('la ligne du tiers n’a pas bougé', bd.profils[C].username === PSEUDO_NORMALISE.toUpperCase() && !bd.profils[C].questionnaire_fait_le);

      await page.goto(BASE + '/profil', { waitUntil: 'domcontentloaded' });
      await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 15000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const l1 = await lignePseudoDuProfil(page);
      ok('DISCRIMINANT — la ligne « Pseudo » du Profil dit « Ce pseudo vient d’être pris : choisis-en un autre. »',
        !!l1 && l1.lib.indexOf('Ce pseudo vient d’être pris : choisis-en un autre.') >= 0, JSON.stringify(l1));
      ok('et elle reste « à renseigner » (aucun pseudo n’est posé)', !!l1 && /à renseigner/.test(l1.val), JSON.stringify(l1));

      await page.reload({ waitUntil: 'domcontentloaded' });
      await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 15000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const l2 = await lignePseudoDuProfil(page);
      ok('la phrase est retenue d’une ouverture à l’autre (rechargement)',
        !!l2 && l2.lib.indexOf('Ce pseudo vient d’être pris') >= 0, JSON.stringify(l2));

      // Un pseudo se pose : la phrase s'en va.
      await page.evaluate(() => Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
        .filter((x) => ((x.querySelector('.p-lib') || {}).textContent || '').indexOf('Pseudo') === 0)[0].click());
      await feuilleOuverte(page);
      await page.fill('#feuille-contenu input', 'melodie_b');
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button'))
        .filter((b) => b.textContent === 'Valider')[0].click());
      const pose = await attendreQue(page, () => bd.profils[B] && bd.profils[B].username === 'melodie_b', 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const l3 = await lignePseudoDuProfil(page);
      ok('un autre pseudo se pose depuis le Profil : la ligne de B le porte', pose, JSON.stringify(bd.profils[B]));
      ok('DISCRIMINANT — la phrase disparaît une fois un pseudo posé, la ligne montre le pseudo',
        !!l3 && l3.lib.indexOf('pris') < 0 && l3.val === 'melodie_b', JSON.stringify(l3));
      ok('aucune erreur de page', p1.erreurs.length === 0 && erreurs.length === 0, JSON.stringify([p1.erreurs, erreurs]));
      await ctx.close();
    }

    // ══ 8. LA FEUILLE VÉRIFIE AVANT DE SE FERMER : UN PSEUDO PRIS NE SE POSE PAS ═══
    console.log('\n══ 8. Profil → Pseudo → un pseudo pris : la feuille refuse, rien n’est écrit ══');
    {
      const bd = baseSansPseudo();
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      const avant = bd.tentatives;
      await taperPseudo(page, 'Deja_Pris');
      // 135 — la question est partie et revenue (la feuille la rend), plus 900 ms.
      await attendreQue(page, () => bd.questions.length > 0, 10000);
      await calme(page, bd);
      const f = await feuilleSaisie(page);
      ok('prémisse — la feuille a posé la question de la base, avec le pseudo normalisé', bd.questions.join() === 'deja_pris', JSON.stringify(bd.questions));
      ok('DISCRIMINANT — la feuille RESTE OUVERTE et dit « Déjà pris — essaie « … » ou « … ». »',
        f.ouverte && /^Déjà pris — essaie « \S+ » ou « \S+ »\.$/.test(f.phrase), JSON.stringify(f));
      ok('le bouton « Valider » est rendu (la question est finie)', f.valider === true, JSON.stringify(f));
      ok('DISCRIMINANT — RIEN n’est écrit : aucune écriture de profil n’est partie', bd.tentatives === avant, 'tentatives ' + bd.tentatives);
      const l1 = await lignePseudoDuProfil(page);
      ok('et la ligne « Pseudo » n’a pas bougé : « à renseigner », sans phrase de refus',
        !!l1 && /à renseigner/.test(l1.val) && l1.lib.indexOf('pris') < 0, JSON.stringify(l1));
      // Un pseudo libre passe, dans la même feuille (si elle est encore ouverte : sinon le refus ci-dessus a déjà échoué).
      if (f.ouverte) {
        await page.fill('#feuille-contenu input', 'melodie_b');
        await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button'))
          .filter((b) => b.textContent === 'Valider')[0].click());
      } else {
        await taperPseudo(page, 'melodie_b');
      }
      const pose = await attendreQue(page, () => bd.profils[B].username === 'melodie_b', 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const f2 = await feuilleSaisie(page), l2 = await lignePseudoDuProfil(page);
      ok('un pseudo LIBRE se pose depuis la même feuille : la ligne de B le porte', pose, JSON.stringify(bd.profils[B]));
      ok('la feuille est fermée et la ligne « Pseudo » montre le pseudo', !f2.ouverte && !!l2 && l2.val === 'melodie_b', JSON.stringify([f2, l2]));
      ok('la ligne du tiers n’a pas bougé', bd.profils[C].username === 'Deja_Pris');
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 9. HORS LIGNE : LA FEUILLE SE FERME ; AU RETOUR, LA BASE REFUSE LE PSEUDO, LES RÉPONSES ARRIVENT ═══
    console.log('\n══ 9. hors ligne, puis « pris entre-temps » : le pseudo sort de l’envoi, les réponses arrivent ══');
    {
      const bd = baseSansPseudo();
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      bd.reseauCoupe = true;
      await choisirObjectif(page, 'force');                 // une réponse du questionnaire, hors ligne
      await feuilleFermee(page);                            // 135 — la feuille du choix s'est refermée
      await calme(page, bd);
      await taperPseudo(page, 'Deja_Pris');                 // la question ne passe pas : « on ne sait pas »
      await feuilleFermee(page);                            // 135 — « on ne sait pas » : la feuille se ferme (la prémisse)
      await calme(page, bd);
      const f = await feuilleSaisie(page), l1 = await lignePseudoDuProfil(page);
      ok('prémisse — hors ligne, la feuille se ferme (on ne sait pas) : le pseudo se montre posé, en local',
        !f.ouverte && !!l1 && l1.val === 'deja_pris', JSON.stringify([f, l1]));
      ok('prémisse — hors ligne, rien n’est arrivé en base : ni la réponse, ni le pseudo',
        !bd.profils[B].objectif && bd.profils[B].username === null, JSON.stringify(bd.profils[B]));
      ok('l’envoi ATTEND (des tentatives, aucune écriture reçue)', bd.tentatives >= 1 && bd.requetes.length === 0, JSON.stringify([bd.tentatives, bd.requetes]));

      bd.reseauCoupe = false;
      const avant = bd.requetes.length;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));       // le téléphone retrouve le réseau
      const resolu = await attendreQue(page, () => bd.requetes.length - avant >= 2, 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const envois = bd.requetes.slice(avant);
      ok('DISCRIMINANT — DEUX envois au retour : le premier (avec le pseudo) refusé en 409, le second (sans) accepté en 201',
        resolu && JSON.stringify(envois.map((q) => [q.statut, q.aPseudo])) === '[[409,true],[201,false]]', JSON.stringify(envois));
      ok('DISCRIMINANT — la réponse du questionnaire est ARRIVÉE en base', bd.profils[B].objectif === 'force', JSON.stringify(bd.profils[B]));
      ok('le pseudo refusé n’est pas en base (la ligne de B n’a pas de pseudo)', bd.profils[B].username === null, JSON.stringify(bd.profils[B]));
      ok('la ligne du tiers n’a pas bougé', bd.profils[C].username === 'Deja_Pris');
      const l2 = await lignePseudoDuProfil(page);
      ok('DISCRIMINANT — la ligne « Pseudo » dit « Ce pseudo vient d’être pris : choisis-en un autre. » et redevient « à renseigner »',
        !!l2 && l2.lib.indexOf(PHRASE_PRIS) >= 0 && /à renseigner/.test(l2.val), JSON.stringify(l2));
      // Aucun rejeu : le profil ne repart plus tout seul.
      const total = bd.tentatives;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      // VOULU (135) : on constate qu'un envoi N'A PAS lieu. Aucun état de l'app ne dit « je n'enverrai rien » ;
      // seul un temps laissé à l'envoi fautif pour partir le constate.
      await attendre(1500);
      ok('PAS DE REJEU SANS FIN : un nouveau retour du réseau n’envoie plus rien (plus rien n’attend)', bd.tentatives === total, bd.tentatives + ' / ' + total);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 15000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const l3 = await lignePseudoDuProfil(page);
      ok('la phrase est retenue d’une ouverture à l’autre (rechargement)',
        !!l3 && l3.lib.indexOf(PHRASE_PRIS) >= 0, JSON.stringify(l3));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 9 bis. EN LIGNE : LA VÉRIFICATION DIT « LIBRE », LA BASE REFUSE QUAND MÊME ═══
    console.log('\n══ 9 bis. en ligne : « libre » à la vérification, refusé à l’envoi (pris entre les deux) ══');
    {
      const bd = baseSansPseudo();
      bd.rpcToujoursLibre = true;                           // un tiers l'a pris juste après la question
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      await choisirObjectif(page, 'force');
      await attendreQue(page, () => bd.profils[B].objectif === 'force', 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const avant = bd.requetes.length;
      await taperPseudo(page, 'Deja_Pris');
      const resolu = await attendreQue(page, () => bd.requetes.length - avant >= 2, 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const envois = bd.requetes.slice(avant);
      ok('la feuille s’est fermée sur le « libre » de la vérification', !(await feuilleSaisie(page)).ouverte);
      ok('DISCRIMINANT — DEUX envois : 409 avec le pseudo, puis 201 sans lui',
        resolu && JSON.stringify(envois.map((q) => [q.statut, q.aPseudo])) === '[[409,true],[201,false]]', JSON.stringify(envois));
      ok('les réponses déjà en base y sont toujours, le pseudo n’y est pas',
        bd.profils[B].objectif === 'force' && bd.profils[B].username === null, JSON.stringify(bd.profils[B]));
      const l = await lignePseudoDuProfil(page);
      ok('la ligne « Pseudo » dit la phrase, « à renseigner »', !!l && l.lib.indexOf(PHRASE_PRIS) >= 0 && /à renseigner/.test(l.val), JSON.stringify(l));
      // Le choix d'un pseudo libre, ensuite, rétablit tout.
      bd.rpcToujoursLibre = false;
      await taperPseudo(page, 'melodie_b');
      const pose = await attendreQue(page, () => bd.profils[B].username === 'melodie_b', 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const l2 = await lignePseudoDuProfil(page);
      ok('un pseudo libre se pose ensuite : la phrase s’en va', pose && !!l2 && l2.val === 'melodie_b' && l2.lib.indexOf('pris') < 0, JSON.stringify(l2));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 9 ter. UN COMPTE QUI A DÉJÀ UN PSEUDO : L'ANCIEN REVIENT, LA LIGNE LE DIT ═══
    console.log('\n══ 9 ter. hors ligne, un compte qui a déjà un pseudo : l’ancien revient, avec la phrase ══');
    {
      const bd = baseSansPseudo();
      bd.profils[B].username = 'ancien';
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      bd.reseauCoupe = true;
      await taperPseudo(page, 'Deja_Pris');
      await feuilleFermee(page);                            // 135 — l'état, plus 1,2 s
      await calme(page, bd);
      const l1 = await lignePseudoDuProfil(page);
      ok('prémisse — hors ligne, la ligne montre le nouveau pseudo, posé en local', !!l1 && l1.val === 'deja_pris', JSON.stringify(l1));
      bd.reseauCoupe = false;
      const avant = bd.requetes.length;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      const resolu = await attendreQue(page, () => bd.requetes.length - avant >= 2, 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      ok('DEUX envois au retour : 409 avec le pseudo, puis 201 sans lui ; la base garde l’ancien pseudo',
        resolu && JSON.stringify(bd.requetes.slice(avant).map((q) => [q.statut, q.aPseudo])) === '[[409,true],[201,false]]' &&
          bd.profils[B].username === 'ancien', JSON.stringify([bd.requetes.slice(avant), bd.profils[B]]));
      const l2 = await lignePseudoDuProfil(page);
      ok('DISCRIMINANT (revue) — la ligne montre l’ANCIEN pseudo ET dit « Ce pseudo vient d’être pris : choisis-en un autre. » (pas un silence)',
        !!l2 && l2.val === 'ancien' && l2.lib.indexOf(PHRASE_PRIS) >= 0, JSON.stringify(l2));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 15000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const l3 = await lignePseudoDuProfil(page);
      ok('la phrase est retenue d’une ouverture à l’autre', !!l3 && l3.val === 'ancien' && l3.lib.indexOf(PHRASE_PRIS) >= 0, JSON.stringify(l3));
      await taperPseudo(page, 'nouveau_pseudo');
      const pose = await attendreQue(page, () => bd.profils[B].username === 'nouveau_pseudo', 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const l4 = await lignePseudoDuProfil(page);
      ok('choisir un pseudo libre : la base le porte, la phrase s’en va', pose && !!l4 && l4.val === 'nouveau_pseudo' && l4.lib.indexOf('pris') < 0, JSON.stringify([bd.profils[B], l4]));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 10. HORS LIGNE AVEC UN PSEUDO LIBRE : L'ENVOI ATTEND, PUIS SE RÉSOUT ═══
    console.log('\n══ 10. hors ligne, pseudo libre : l’envoi attend le retour du réseau, puis se résout ══');
    {
      const bd = baseSansPseudo();
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      bd.reseauCoupe = true;
      await choisirObjectif(page, 'force');
      await feuilleFermee(page);                            // 135 — l'état, plus 700 ms
      await calme(page, bd);
      await taperPseudo(page, 'melodie_b');
      await feuilleFermee(page);                            // 135 — l'état, plus 1,2 s
      await calme(page, bd);
      const l1 = await lignePseudoDuProfil(page);
      ok('hors ligne : la feuille se ferme et la ligne montre le pseudo, posé en local', !(await feuilleSaisie(page)).ouverte && !!l1 && l1.val === 'melodie_b', JSON.stringify(l1));
      ok('rien n’est arrivé en base tant que le réseau manque', bd.profils[B].username === null && !bd.profils[B].objectif, JSON.stringify(bd.profils[B]));
      bd.reseauCoupe = false;
      const avant = bd.requetes.length;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      const resolu = await attendreQue(page, () => bd.profils[B].username === 'melodie_b', 12000);
      await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
      const envois = bd.requetes.slice(avant);
      ok('au retour du réseau, le pseudo ET la réponse arrivent, en UN envoi', resolu && bd.profils[B].objectif === 'force' &&
        JSON.stringify(envois.map((q) => [q.statut, q.aPseudo])) === '[[201,true]]', JSON.stringify([bd.profils[B], envois]));
      const l2 = await lignePseudoDuProfil(page);
      ok('la ligne montre le pseudo, sans phrase', !!l2 && l2.val === 'melodie_b' && l2.lib.indexOf('pris') < 0, JSON.stringify(l2));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ [E70] L'ENTRÉE QUI MARCHE : LE RETOUR DE LIEN SE LIT AVANT LE ROUTAGE ═══
    console.log('\n══ [E70] l’entrée qui marche : lien de récupération, de confirmation, expiré ; le démarrage hors ligne inchangé ══');
    {
      const maintenant = Math.floor(Date.now() / 1000);
      const lien = (chemin, type) => BASE + chemin + '#access_token=' + jwt(B) + '&expires_at=' + (maintenant + 3600) +
        '&expires_in=3600&refresh_token=r-' + B + '&token_type=bearer&type=' + type;
      const ecran = (page) => page.evaluate(() => {
        const vue = (id) => { const v = document.querySelector('#' + id); return !!v && !v.hidden; };
        const f = document.querySelector('#feuille-seance');
        const corps = document.querySelector('#profil-corps');
        return { adresse: location.href, hash: location.hash, connexion: vue('vue-connexion'), profil: vue('vue-profil'),
          questionnaire: vue('vue-questionnaire'),
          authentifiee: Array.from(document.querySelectorAll('main > section, body > section, section[id^="vue-"]'))
            .some((v) => v.id !== 'vue-connexion' && v.id !== 'vue-lien' && !v.hidden),   // l'attente du lien n'est pas l'app
          feuille: f && !f.hidden ? (document.querySelector('#feuille-contenu').textContent || '') : null,
          message: (document.querySelector('#erreur-connexion') || {}).textContent || '',
          profilTexte: corps ? corps.textContent : '' };
      });
      const sansFragment = (e) => e.hash === '' && e.adresse.indexOf('#') < 0 && !/access_token|error=/.test(e.adresse);

      // (a) le lien de récupération, page sans session enregistrée
      console.log('   — (a) le lien de récupération');
      {
        const bd = neuveBase();
        const ctx = await contexte(nav, bd, {});
        const page = await ctx.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
        await page.goto(lien('/profil', 'recovery'), { waitUntil: 'domcontentloaded' });
        const ouverte = await attendreQue(page, async () => /Choisis ton nouveau mot de passe/.test((await ecran(page)).feuille || ''), 15000);
        // La ligne de profil de B se crée (questionnaire jamais rempli) : il est DÛ, et il doit attendre derrière.
        await attendreQue(page, () => !!bd.profils[B], 12000);
        await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
        const e1 = await ecran(page);
        ok('DISCRIMINANT [E70 a] — l’app ENTRE (pas l’écran de connexion) et le jeton du lien est enregistré',
          !e1.connexion && e1.profil && !!(await page.evaluate(() => localStorage.getItem('th-v2-auth'))), JSON.stringify(e1));
        ok('DISCRIMINANT [E70 a] — la feuille « Choisis ton nouveau mot de passe » s’est ouverte d’elle-même, sur le Profil',
          ouverte && /Choisis ton nouveau mot de passe/.test(e1.feuille || ''), JSON.stringify(e1.feuille));
        ok('[E70 a] — le questionnaire dû attend derrière : la feuille du mot de passe passe d’abord',
          !!bd.profils[B] && !bd.profils[B].questionnaire_fait_le && !e1.questionnaire && e1.feuille !== null, JSON.stringify([bd.profils[B], e1.questionnaire]));
        ok('DISCRIMINANT [E70 f] — l’adresse ne garde aucun fragment après l’entrée', sansFragment(e1) && /\/profil$/.test(e1.adresse), e1.adresse);
        await page.fill('#feuille-contenu input', 'nouveau-mdp-70');
        await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button'))
          .filter((b) => b.textContent === 'Valider')[0].click());
        const change = await attendreQue(page, () => bd.motsDePasse.length > 0, 8000);
        ok('DISCRIMINANT [E70 a] — valider appelle `updateUser` avec le nouveau mot de passe, sous le compte du lien',
          change && JSON.stringify(bd.motsDePasse) === JSON.stringify([{ sub: B, password: 'nouveau-mdp-70' }]), JSON.stringify(bd.motsDePasse));
        const dit = await attendreQue(page, async () => /Mot de passe changé\./.test((await ecran(page)).profilTexte), 5000);
        const e2 = await ecran(page);
        ok('[E70 a] — validé : « Mot de passe changé. » dans le profil, la feuille est fermée',
          dit && e2.profil && e2.feuille === null, JSON.stringify([e2.feuille, e2.profilTexte.slice(0, 80)]));
        await calme(page, bd);     // `USER_UPDATED` : l'app ré-entre et re-rend le Profil — la phrase reste (135 : l'état, plus 1,5 s)
        ok('[E70 a] — la phrase survit au re-rendu qui suit le changement', /Mot de passe changé\./.test((await ecran(page)).profilTexte));
        // La ligne « Mot de passe » du Profil, elle, garde son titre habituel (le clic n'est pas une récupération).
        await cliquerLigne(page, 'Mot de passe');
        await feuilleOuverte(page);
        const e3 = await ecran(page);
        ok('[E70 a] — la ligne « Mot de passe » ouvre la feuille titrée « Mot de passe », pas celle de la récupération',
          /^Mot de passe/.test(e3.feuille || '') && !/Choisis/.test(e3.feuille || ''), JSON.stringify(e3.feuille));
        ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
        await ctx.close();
      }

      // (a bis) la même arrivée, la feuille fermée SANS valider : rien n'est changé, et le questionnaire
      // qui attendait derrière prend la suite.
      console.log('   — (a bis) le lien de récupération, feuille fermée sans valider');
      {
        const bd = neuveBase();
        const ctx = await contexte(nav, bd, {});
        const page = await ctx.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
        await page.goto(lien('/profil', 'recovery'), { waitUntil: 'domcontentloaded' });
        await attendreQue(page, async () => /Choisis ton nouveau mot de passe/.test((await ecran(page)).feuille || ''), 15000);
        await attendreQue(page, () => !!bd.profils[B], 12000);
        await calme(page, bd);   // 135 — ce qui part encore est arrivé (était un délai fixe)
        ok('prémisse — la feuille est ouverte, le questionnaire dû attend', !(await ecran(page)).questionnaire && !!bd.profils[B]);
        await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button'))
          .filter((b) => b.textContent === 'Annuler')[0].click());
        const suit = await attendreQue(page, async () => (await ecran(page)).questionnaire, 5000);
        const e = await ecran(page);
        ok('[E70 a bis] — fermée sans valider : aucun mot de passe envoyé, et le questionnaire prend la suite',
          bd.motsDePasse.length === 0 && suit && e.feuille === null, JSON.stringify([bd.motsDePasse, e.questionnaire, e.feuille]));
        ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
        await ctx.close();
      }

      // (b) le lien de confirmation d'inscription
      console.log('   — (b) le lien de confirmation (`type=signup`)');
      {
        const bd = neuveBase();
        const ctx = await contexte(nav, bd, {});
        const page = await ctx.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
        await page.goto(lien('/', 'signup'), { waitUntil: 'domcontentloaded' });
        const entree = await attendreQue(page, async () => { const e = await ecran(page); return !e.connexion && e.authentifiee; }, 15000);
        await attendreQue(page, () => !!bd.profils[B], 12000);
        const e = await ecran(page);
        ok('DISCRIMINANT [E70 b] — l’app ENTRE, sur le compte du lien (sa ligne de profil se crée)',
          entree && !e.connexion && !!bd.profils[B] && bd.refus.length === 0, JSON.stringify([e, bd.requetes]));
        ok('[E70 b] — aucune feuille du mot de passe : ce n’est pas une récupération', !/nouveau mot de passe/.test(e.feuille || ''), JSON.stringify(e.feuille));
        ok('DISCRIMINANT [E70 f] — l’adresse ne garde aucun fragment', sansFragment(e), e.adresse);
        ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
        await ctx.close();
      }

      // (c) le lien expiré ou déjà servi
      console.log('   — (c) le lien expiré');
      {
        const bd = neuveBase();
        const ctx = await contexte(nav, bd, {});
        const page = await ctx.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
        await page.goto(BASE + '/profil#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
          { waitUntil: 'domcontentloaded' });
        const dit = await attendreQue(page, async () => { const e = await ecran(page); return e.connexion && !!e.message; }, 15000);
        const e = await ecran(page);
        ok('DISCRIMINANT [E70 c] — l’écran de connexion DIT pourquoi : la phrase de §5.6, au mot près',
          dit && e.connexion && e.message === 'Ce lien a expiré ou a déjà servi. Redemande-en un avec « Mot de passe oublié ? ».', JSON.stringify(e.message));
        ok('[E70 f] — l’adresse ne garde pas l’erreur', sansFragment(e) && /\/connexion$/.test(e.adresse), e.adresse);
        ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
        await ctx.close();
      }

      // (d) sans fragment, sans session, hors réseau : le démarrage n'attend rien
      console.log('   — (d) sans fragment, sans session, hors réseau');
      {
        const bd = neuveBase();
        bd.reseauCoupe = true;
        const ctx = await contexte(nav, bd, {});
        const page = await ctx.newPage();
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
        const t0 = Date.now();
        const vu = await attendreQue(page, async () => (await ecran(page)).connexion, 8000);
        const delai = Date.now() - t0;
        const e = await ecran(page);
        ok('[E70 d] — l’écran de connexion tout de suite (< 2 s), sans phrase', vu && delai < 2000 && !e.message, delai + ' ms · ' + JSON.stringify(e.message));
        await ctx.close();
      }

      // (e) une session enregistrée PÉRIMÉE, hors réseau : l'app tout de suite, comme aujourd'hui.
      // La configuration discriminante (CADRAGE §2 quater) : un jeton périmé fait partir le SDK en
      // rafraîchissement réseau, qui ne répond pas — l'attendre au démarrage laisserait l'écran vide.
      console.log('   — (e) une session enregistrée (périmée), hors réseau');
      {
        const bd = neuveBase();
        bd.reseauCoupe = true;
        const perimee = Object.assign(sessionDe(A), { expires_at: maintenant - 86400, expires_in: 3600 });
        const ctx = await contexte(nav, bd, { stockage: perimee });
        const page = await ctx.newPage();
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
        const t0 = Date.now();
        const vu = await attendreQue(page, async () => { const e = await ecran(page); return !e.connexion && e.authentifiee; }, 8000);
        const delai = Date.now() - t0;
        ok('DISCRIMINANT [E70 e] — l’app tout de suite (< 3 s) : le démarrage sans fragment n’attend pas le SDK', vu && delai < 3000, delai + ' ms');
        await ctx.close();
      }

      const PHRASE_NON_VERIFIE = 'Le lien n\'a pas pu être vérifié. Réessaie, ou redemande-en un avec « Mot de passe oublié ? ».';
      const lienVu = (page) => page.evaluate(() => {
        const v = document.querySelector('#vue-lien');
        return !!v && !v.hidden && /Ouverture du lien…/.test(v.textContent);
      });

      // (g) le SDK ne répond jamais : l'attente se voit, puis elle s'arrête à 5 s.
      console.log('   — (g) le lien, la vérification ne répond jamais');
      {
        const bd = neuveBase();
        bd.userPend = true;
        const ctx = await contexte(nav, bd, {});
        const page = await ctx.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
        const t0 = Date.now();
        await page.goto(lien('/profil', 'recovery'), { waitUntil: 'domcontentloaded' });
        const attente = await attendreQue(page, () => lienVu(page), 3000);
        const tAttente = Date.now() - t0;
        ok('[E70 g] — « Ouverture du lien… » s’affiche tout de suite (< 3 s), et rien d’autre',
          attente && !(await ecran(page)).connexion, tAttente + ' ms');
        const dit = await attendreQue(page, async () => { const e = await ecran(page); return e.connexion && !!e.message; }, 12000);
        const delai = Date.now() - t0;
        const e = await ecran(page);
        ok('DISCRIMINANT [E70 g] — à 5 s sans réponse : l’écran de connexion, avec la phrase au mot près',
          dit && delai >= 4500 && delai < 8000 && e.message === PHRASE_NON_VERIFIE && !(await lienVu(page)),
          delai + ' ms · ' + JSON.stringify(e.message));
        ok('[E70 g] — l’adresse est nettoyée', sansFragment(e) && /\/connexion$/.test(e.adresse), e.adresse);
        ok('[E70 g] — aucune session inventée', !(await page.evaluate(() => localStorage.getItem('th-v2-auth'))));
        ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
        await ctx.close();
      }

      // (h) le SDK répond à 7 s : l'écran de connexion à 5 s, puis l'entrée tardive, d'elle-même.
      console.log('   — (h) le lien de récupération, la vérification répond à 7 s');
      {
        const bd = neuveBase();
        bd.userDelai = 7000;
        const ctx = await contexte(nav, bd, {});
        const page = await ctx.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
        const t0 = Date.now();
        await page.goto(lien('/profil', 'recovery'), { waitUntil: 'domcontentloaded' });
        const dit = await attendreQue(page, async () => { const e = await ecran(page); return e.connexion && !!e.message; }, 12000);
        const vu = Date.now(), delai = vu - t0;
        const e1 = await ecran(page);
        // 86 — l'ORDRE, pas une durée depuis `goto` : l'écran de connexion est vu AVANT la réponse
        // du faux SDK (instant noté par le serveur), et pas avant 4,5 s (minuteur de 5 s, ECRAN-PROFIL §5.6).
        const avantReponse = !bd.userRepondu || vu < bd.userRepondu;
        ok('[E70 h] — à 5 s, l’écran de connexion dit que le lien n’a pas pu être vérifié (avant la réponse du SDK)',
          dit && delai >= 4500 && avantReponse && e1.message === PHRASE_NON_VERIFIE,
          delai + ' ms · ' + (avantReponse ? 'avant' : 'APRÈS') + ' la réponse du SDK · ' + JSON.stringify(e1.message));
        const entre = await attendreQue(page, async () => /Choisis ton nouveau mot de passe/.test((await ecran(page)).feuille || ''), 15000);
        const e2 = await ecran(page);
        ok('DISCRIMINANT [E70 h] — le SDK répond à 7 s : l’app ENTRE d’elle-même et ouvre la feuille de récupération',
          entre && !e2.connexion && e2.profil && !!(await page.evaluate(() => localStorage.getItem('th-v2-auth'))),
          (Date.now() - t0) + ' ms · ' + JSON.stringify([e2.connexion, e2.profil, e2.feuille]));
        ok('[E70 h] — l’adresse ne garde aucun fragment après l’entrée tardive', sansFragment(e2) && /\/profil$/.test(e2.adresse), e2.adresse);
        ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
        await ctx.close();
      }

      // L'inscription sans session : la phrase, et « Mot de passe oublié ? » juste dessous.
      console.log('   — l’inscription sans session');
      {
        const bd = neuveBase();
        bd.confirmationEmail = true;
        const p = await inscrireSansSession(nav, bd);
        ok('DISCRIMINANT [E70] — l’inscription dit la phrase de §5.6, au mot près',
          p.message === 'Compte créé si l\'adresse est nouvelle : confirme ton e-mail, puis connecte-toi. ' +
            'Si tu as déjà un compte avec cette adresse, aucun mail ne part : utilise « Mot de passe oublié ? ».', JSON.stringify(p.message));
        ok('DISCRIMINANT [E70] — « Mot de passe oublié ? » est visible, juste sous la phrase', p.oubli.visible && p.oubli.sous, JSON.stringify(p.oubli));
        ok('aucune erreur de page', p.erreurs.length === 0, JSON.stringify(p.erreurs));
      }
    }

    // ══ 11. LA VÉRIFICATION QUI PEND : ELLE NE RETIENT PAS LA PERSONNE ═══
    console.log('\n══ 11. la vérification du pseudo ne répond pas : la feuille attend visiblement, puis se ferme ══');
    {
      const bd = baseSansPseudo();
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      bd.rpcPend = true;
      await cliquerLigne(page, 'Pseudo');
      await feuilleOuverte(page);
      await page.fill('#feuille-contenu input', 'melodie_b');
      const t0 = Date.now();
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button'))
        .filter((b) => b.textContent === 'Valider')[0].click());
      // 135 — « pendant l'attente » : la question est EN VOL (posée à la base qui ne répond pas), l'écran peint.
      await attendreQue(page, () => bd.questions.length > 0, 10000);
      await rendu(page);
      const attente = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#feuille-contenu button')).filter((x) => x.textContent === 'Valider')[0];
        const champ = document.querySelector('#feuille-contenu .champ-texte input');
        return { desactive: b.disabled, opacite: getComputedStyle(b).opacity, figé: champ.readOnly,
                 phrase: (document.querySelector('#feuille-contenu .feuille-err') || {}).textContent || '' };
      });
      ok('pendant l’attente — « Valider » est grisé (désactivé ET visiblement : opacité réduite), le champ est figé, aucune phrase périmée',
        attente.desactive === true && Number(attente.opacite) < 1 && attente.figé === true && attente.phrase === '', JSON.stringify(attente));
      ok('rien n’est écrit tant que la question est en vol', bd.tentatives === 0 && (await feuilleSaisie(page)).ouverte, 'tentatives ' + bd.tentatives);
      const ferme = await attendreQue(page, async () => !(await feuilleSaisie(page)).ouverte, 9000);
      const delai = Date.now() - t0;
      ok('DISCRIMINANT — au bout du délai (≈ 4 s) la feuille se ferme : « on ne sait pas » ne retient personne',
        ferme && delai >= 3500 && delai < 8000, 'fermée après ' + delai + ' ms');
      const pose = await attendreQue(page, () => bd.profils[B].username === 'melodie_b', 12000);
      ok('et l’envoi part : le pseudo arrive en base (UN envoi, accepté)', pose && JSON.stringify(bd.requetes.map((q) => [q.statut, q.aPseudo])) === '[[201,true]]', JSON.stringify([bd.profils[B], bd.requetes]));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 92. LE POIDS SE SAISIT DEPUIS LE PROFIL, PAR LE CHEMIN DU QUESTIONNAIRE ═══
    console.log('\n══ 92. la ligne « Poids » du Profil : une pesée datée, écrite par la file des pesées ══');
    {
      const bd = baseSansPseudo();
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      await cliquerLigne(page, 'Poids');
      await feuilleOuverte(page);
      const champs = await page.evaluate(() => ({
        poids: !!document.querySelector('#feuille-contenu input[data-cle="poids"]'),
        jour: (document.querySelector('#feuille-contenu input[data-cle="jour"]') || {}).value || '' }));
      const auj = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
      ok('[92] la ligne « Poids » ouvre la saisie : le poids, et la date du jour par défaut', champs.poids && champs.jour === auj, JSON.stringify([champs, auj]));
      const valider = () => page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button'))
        .filter((b) => b.textContent === 'Valider')[0].click());
      await page.fill('#feuille-contenu input[data-cle="poids"]', '500');
      await valider();
      // 135 — le refus est local : la phrase dans la feuille (ce que lit le contrôle).
      await attendreQue(page, () => page.evaluate(() => !!(document.querySelector('#feuille-contenu .feuille-err') || {}).textContent), 5000);
      const refus = await page.evaluate(() => (document.querySelector('#feuille-contenu .feuille-err') || {}).textContent || '');
      ok('[92] un poids hors bornes reste dans la feuille, avec la phrase du questionnaire', /^Un poids entre 20 et 400 kg\.$/.test(refus), refus);
      await page.fill('#feuille-contenu input[data-cle="poids"]', '96,8');
      await valider();
      const ecrit = await attendreQue(page, () => bd.pesees.length > 0, 10000);
      ok('DISCRIMINANT [92] — la pesée part dans `body_weight_log` (la file des pesées, `poserPesee`) : 96,8 kg, aujourd’hui, source app',
        ecrit && bd.pesees[0].poids_kg === 96.8 && bd.pesees[0].date === auj && bd.pesees[0].source === 'app', JSON.stringify(bd.pesees));
      const ligne = await page.evaluate(() => {
        const l = Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
          .filter((x) => ((x.querySelector('.p-lib') || {}).textContent || '').indexOf('Poids') === 0)[0];
        return l ? (l.querySelector('.p-val') || {}).textContent || '' : null;
      });
      ok('[92] la ligne montre la dernière pesée datée : « 96,8 kg · aujourd’hui »', ligne === '96,8 kg · aujourd\'hui', String(ligne));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }
    // ══ 93. LA LIGNE NAÎT D'UN GESTE DU PROFIL : LE QUESTIONNAIRE S'OUVRE QUAND MÊME ═══
    // La création de `chargerProfil` échoue une fois (500) ; la personne va au Profil et choisit Sexe → Femme
    // dans la même page : c'est cet envoi qui crée la ligne. Il la crée avec le pseudo tapé, et le questionnaire
    // s'ouvre (avant 93 : la ligne naissait sans pseudo, et le questionnaire ne s'ouvrait jamais).
    console.log('\n══ 93. création ratée, puis Sexe → Femme dans le Profil : la ligne naît du geste, le questionnaire s’ouvre ══');
    {
      const bd = neuveBase();
      bd.echecsCreation = 1;
      const ctx = await contexte(nav, bd, {});
      const page = await ctx.newPage();
      const erreurs = [];
      const avertissements = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      page.on('console', (m) => { if (m.type() === 'warning' && /Profil non créé/.test(m.text())) avertissements.push(m.text()); });
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await attendreQue(page, () => page.evaluate(() => {
        const v = document.querySelector('#vue-connexion'); return !!v && !v.hidden; }), 15000);
      await page.click('#btn-bascule-entree');
      await versInscription(page);
      await page.fill('#champ-pseudo', 'test_0710');
      await page.fill('#champ-email', 'b@banc.test');
      await page.fill('#champ-mdp', 'motdepasse123');
      await attendreQue(page, () => page.evaluate(() => !document.querySelector('#btn-connexion').disabled), 5000);
      await page.click('#btn-connexion');
      const rate = await attendreQue(page, () => avertissements.length > 0, 15000);
      ok('prémisse [93] — la création au chargement a échoué : pas de ligne', rate && !bd.profils[B], JSON.stringify(bd.requetes));
      const questionnaireOuvert = () => page.evaluate(() => { const v = document.querySelector('#vue-questionnaire'); return !!v && !v.hidden; });
      ok('prémisse [93] — sans ligne, le questionnaire n’est pas ouvert', !(await questionnaireOuvert()));
      await page.click('#onglet-profil');
      await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 8000);
      await cliquerLigne(page, 'Sexe');
      await feuilleOuverte(page);
      await page.click('#feuille-contenu .feuille-menu button[data-cle="femme"]');
      const cree = await attendreQue(page, () => !!bd.profils[B], 12000);
      ok('[93] la ligne naît du geste du Profil', cree && bd.profils[B].sexe === 'femme', JSON.stringify(bd.profils[B]));
      // (`onboarding_completed` part à `false` avec la création, puis passe à `true` quand on quitte le Profil pour le
      // questionnaire — `marquerProfilVu`, comme pour toute ligne créée par `chargerProfil` : il n'est pas contrôlé ici.)
      ok('DISCRIMINANT [93] — elle naît avec le PSEUDO tapé à l’inscription',
        !!bd.profils[B] && bd.profils[B].username === 'test_0710', JSON.stringify(bd.profils[B]));
      const ouvert = await attendreQue(page, questionnaireOuvert, 8000);
      ok('DISCRIMINANT [93] — le questionnaire s’ouvre de lui-même après la naissance de la ligne', ouvert);
      ok('aucune écriture refusée par la base', bd.refus.length === 0, JSON.stringify(bd.refus));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 108. « MA SALLE » : LA FEUILLE ÉCRIT LA DÉCLARATION (v2_088 lancée) ══════════════════════════════════
    console.log('\n══ 108. « Ma salle » : cocher les barres EZ, les haltères, Valider — la déclaration part en base ══');
    {
      const bd = baseSansPseudo();
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      const valeurLigne = () => page.evaluate(() => {
        const l = Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
          .filter((x) => ((x.querySelector('.p-lib') || {}).textContent || '').indexOf('Ma salle') === 0)[0];
        return l ? ((l.querySelector('.p-val') || {}).textContent || '') : null;
      });
      ok('[108] la ligne « Ma salle » est là, sous « Matériel »', (await valeurLigne()) !== null);
      await cliquerLigne(page, 'Ma salle');
      await feuilleOuverte(page);
      const puces = await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .salle-puces[data-type="barres_ez"] button[data-kg]'))
        .map((b) => b.dataset.kg + (b.getAttribute('aria-pressed') === 'true' ? '+' : '')));
      ok('[108] la feuille : la barre EZ, 10 à 40 kg, rien de coché (non renseignée)', JSON.stringify(puces) === JSON.stringify(['10', '15', '20', '25', '30', '35', '40']), JSON.stringify(puces));
      for (const kg of ['10', '15', '20', '25', '30']) {
        await page.click('#feuille-contenu .salle-puces[data-type="barres_ez"] button[data-kg="' + kg + '"]');
        await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 80 ms)
      }
      await page.fill('#feuille-contenu .salle-halteres input', '40');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      await page.click('#feuille-contenu .salle-pas button[data-pas="2"]');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button')).filter((b) => b.textContent === 'Valider')[0].click());
      const ecrit = await attendreQue(page, () => !!bd.profils[B].ma_salle, 10000);
      ok('DISCRIMINANT [108] — la déclaration part en base : EZ 10-30, haltères jusqu’à 40 de 2 en 2', ecrit &&
        JSON.stringify(bd.profils[B].ma_salle) === JSON.stringify({ barres_ez: [10, 15, 20, 25, 30], barres_droites: [], halteres: { max: 40, pas: 2 } }),
        JSON.stringify(bd.profils[B].ma_salle));
      await calme(page, bd);   // 135 — l'écriture rendue à l'écran (était 300 ms)
      ok('[108] la ligne dit ce qui est déclaré : « EZ, haltères »', (await valeurLigne()) === 'EZ, haltères', String(await valeurLigne()));
      // « Effacer » écrit le vide : non renseignée, rien ne change.
      await cliquerLigne(page, 'Ma salle');
      await feuilleOuverte(page);
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button')).filter((b) => b.textContent === 'Effacer')[0].click());
      const efface = await attendreQue(page, () => bd.profils[B].ma_salle === null, 10000);
      ok('[108] « Effacer » écrit le vide (NULL)', efface, JSON.stringify(bd.profils[B].ma_salle));
      ok('[108] aucune écriture refusée par la contrainte imitée', bd.requetes.every((q) => q.statut !== 400), JSON.stringify(bd.requetes));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 123. « MA SALLE » : LES HALTÈRES PAR TRANCHES, APRÈS ET AVANT v2_095 ══════════════════════════════════
    // « Ok ma salle, par contre pour les petites haltères de 1 à 10 c'est de 1 en 1 » : de 1 en 1 jusqu'à 10, puis de 2
    // en 2 jusqu'à 40. Après v2_095, la liste part ; « Pas d'haltères » les efface. Avant, la base refuse la liste
    // (23514) : la colonne sort de l'envoi, la salle d'avant est gardée, le Profil le dit (le mécanisme de 116).
    for (const avant of [false, true]) {
      const tag = avant ? '[123, avant v2_095]' : '[123, après v2_095]';
      console.log('\n══ 123. « Ma salle » par tranches ' + (avant ? '(base AVANT v2_095)' : '(base APRÈS v2_095)') + ' ══');
      const bd = baseSansPseudo();
      bd.avantV2095 = avant;
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      await cliquerLigne(page, 'Ma salle');
      await feuilleOuverte(page);
      const sansOn = () => page.evaluate(() => {
        const b = document.querySelector('#feuille-contenu .salle-sans button');
        return b ? b.getAttribute('aria-pressed') : null;
      });
      ok(tag + ' « Pas d’haltères » allumée sur une salle sans haltères', (await sansOn()) === 'true', String(await sansOn()));
      await page.fill('#feuille-contenu .salle-halteres[data-i="0"] input', '10');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      ok(tag + ' taper un « jusqu’à » éteint « Pas d’haltères »', (await sansOn()) === 'false', String(await sansOn()));
      await page.click('#feuille-contenu .salle-pas[data-i="0"] button[data-pas="1"]');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      await page.click('#feuille-contenu .salle-tranche');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      await page.fill('#feuille-contenu .salle-halteres[data-i="1"] input', '40');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      await page.click('#feuille-contenu .salle-pas[data-i="1"] button[data-pas="2"]');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      const lignes = await page.evaluate(() => document.querySelectorAll('#feuille-contenu .salle-halteres').length);
      ok(tag + ' deux lignes de tranche, « + Une tranche » toujours là (au plus 3)', lignes === 2 &&
        !!(await page.$('#feuille-contenu .salle-tranche')), String(lignes));
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button')).filter((b) => b.textContent === 'Valider')[0].click());
      const TRANCHES = [{ jusqua: 10, pas: 1 }, { jusqua: 40, pas: 2 }];
      if (!avant) {
        const ecrit = await attendreQue(page, () => !!bd.profils[B].ma_salle, 10000);
        ok('DISCRIMINANT ' + tag + ' — la liste des tranches part en base', ecrit &&
          JSON.stringify(bd.profils[B].ma_salle) === JSON.stringify({ barres_ez: [], barres_droites: [], halteres: TRANCHES }),
          JSON.stringify(bd.profils[B].ma_salle));
        await calme(page, bd);   // 135 — l'écriture rendue à l'écran (était 300 ms)
        // « Pas d'haltères » : le geste explicite.
        await cliquerLigne(page, 'Ma salle');
        await feuilleOuverte(page);
        ok(tag + ' la feuille rouverte montre les deux tranches', (await page.evaluate(() =>
          Array.from(document.querySelectorAll('#feuille-contenu .salle-halteres input')).map((x) => x.value).join(','))) === '10,40');
        await page.click('#feuille-contenu .salle-sans button');
        await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
        await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button')).filter((b) => b.textContent === 'Valider')[0].click());
        const efface = await attendreQue(page, () => bd.profils[B].ma_salle === null, 10000);
        ok('DISCRIMINANT ' + tag + ' — « Pas d’haltères » efface les haltères (rien d’autre déclaré : NULL)', efface,
          JSON.stringify(bd.profils[B].ma_salle));
        ok(tag + ' aucune écriture refusée par la contrainte imitée', bd.requetes.every((q) => q.statut !== 400), JSON.stringify(bd.requetes));
      } else {
        const refuse = await attendreQue(page, () => bd.requetes.some((q) => q.statut === 400), 10000);
        ok('prémisse ' + tag + ' — la base d’avant refuse la liste (23514)', refuse, JSON.stringify(bd.requetes));
        await calme(page, bd);   // 135 — le refus traité et dit à l'écran (était 800 ms)
        ok('DISCRIMINANT ' + tag + ' — la salle d’avant est gardée en base (rien n’est inventé à la place)',
          (bd.profils[B].ma_salle === undefined || bd.profils[B].ma_salle === null), JSON.stringify(bd.profils[B].ma_salle));
        const texte = await page.evaluate(() => (document.querySelector('#profil-corps') || {}).textContent || '');
        ok(tag + ' le Profil le dit : « Pas enregistré : Ma salle. »', /Pas enregistré : Ma salle\./.test(texte), texte.slice(0, 200));
        // Le reste du profil s'écrit toujours (la colonne refusée ne bloque rien).
        await cliquerLigne(page, 'Sexe');
        await feuilleOuverte(page);
        await page.click('#feuille-contenu .feuille-menu button[data-cle="femme"]');
        const sexe = await attendreQue(page, () => bd.profils[B].sexe === 'femme', 10000);
        ok(tag + ' un geste suivant du Profil s’écrit (Sexe)', sexe, JSON.stringify(bd.profils[B].sexe));
      }
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 132. « MA SALLE » : LES DEUX LISTES D'ÉLASTIQUES, L'ORDRE EN GLISSANT, « PAR SON NOM » ══════════════════════
    // ECRAN-PROFIL §2.4 sexies (maquette `maquette-elastiques-v2.html`, écran 1). Les grands élastiques Noir (35 kg),
    // Rouge (25 kg) et Vert, tapés dans le désordre et rangés EN GLISSANT ; les mini-bandes Bleue et Jaune ; « par son
    // nom ». L'ordre est la donnée : il part en base tel quel. Un nom déjà dans la liste est refusé, avec sa phrase.
    console.log('\n══ 132. « Ma salle » : deux listes d’élastiques, l’ordre en glissant, « par son nom » ══');
    {
      const bd = baseSansPseudo();
      const { ctx, page, erreurs } = await ouvrirProfilDe(nav, bd);
      await page.setViewportSize({ width: 360, height: 760 });
      await cliquerLigne(page, 'Ma salle');
      await feuilleOuverte(page);
      const ajouter = async (liste, nom, kg) => {
        await page.click('#feuille-contenu .el-carte[data-liste="' + liste + '"] .el-ajout');
        await attendreQue(page, () => page.evaluate((l) => !!document.querySelector('#feuille-contenu .el-carte[data-liste="' + l + '"] .el-champ-nom'), liste), 5000);
        await page.fill('#feuille-contenu .el-carte[data-liste="' + liste + '"] .el-champ-nom', nom);
        if (kg !== undefined) await page.fill('#feuille-contenu .el-carte[data-liste="' + liste + '"] .el-champ-kg', kg);
        await page.evaluate((l) => Array.from(document.querySelectorAll('#feuille-contenu .el-carte[data-liste="' + l + '"] .el-saisie button'))
          .filter((b) => b.textContent === 'Ajouter')[0].click(), liste);
        await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      };
      const noms = (liste) => page.evaluate((l) => Array.from(document.querySelectorAll('#feuille-contenu .el-carte[data-liste="' + l + '"] .el-rang'))
        .map((r) => r.querySelector('.el-nom').textContent + '|' + r.querySelector('.el-kg').textContent), liste);
      ok('[132] la feuille montre « Grands élastiques », « Mini-bandes » et le choix « en kg / par son nom »',
        (await page.evaluate(() => document.querySelectorAll('#feuille-contenu .el-carte').length)) === 3);
      await ajouter('elastiques', 'Vert', '');
      await ajouter('elastiques', 'Rouge', '25');
      await ajouter('elastiques', 'Noir', '35');
      ok('[132] trois grands élastiques, dans l’ordre tapé, le kg facultatif (« — »)',
        JSON.stringify(await noms('elastiques')) === JSON.stringify(['Vert|\u2014', 'Rouge|25\u00a0kg', 'Noir|35\u00a0kg']),
        JSON.stringify(await noms('elastiques')));
      await ajouter('elastiques', 'noir', '');
      const err = await page.evaluate(() => (document.querySelector('#feuille-contenu .feuille-err') || {}).textContent || '');
      ok('[132] un nom déjà dans la liste est refusé, et la phrase le dit', /déjà dans la liste/.test(err) &&
        (await noms('elastiques')).length === 3, err);
      // Glisser : Noir (3e) tout en haut (vers le haut), puis Vert (2e) tout en bas (vers le bas).
      const glisser = async (de, vers) => {
        const rangs = await page.$$('#feuille-contenu .el-carte[data-liste="elastiques"] .el-rang');
        const p = await (await rangs[de].$('.el-poignee')).boundingBox();
        const cible = await rangs[vers].boundingBox();
        await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
        await page.mouse.down();
        const y = vers < de ? cible.y + 4 : cible.y + cible.height - 4;
        for (let k = 1; k <= 6; k++) await page.mouse.move(p.x + p.width / 2, p.y + (y - p.y) * k / 6);
        await page.mouse.up();
        await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 200 ms)
      };
      await glisser(2, 0);
      await glisser(1, 2);
      ok('DISCRIMINANT [132] — glisser range la liste : Noir, Rouge, Vert',
        JSON.stringify((await noms('elastiques')).map((x) => x.split('|')[0])) === JSON.stringify(['Noir', 'Rouge', 'Vert']),
        JSON.stringify(await noms('elastiques')));
      await ajouter('mini_bandes', 'Bleue');
      await ajouter('mini_bandes', 'Jaune');
      ok('[132] les mini-bandes : un nom seul (pas de champ kg)',
        JSON.stringify(await noms('mini_bandes')) === JSON.stringify(['Bleue|', 'Jaune|']) &&
        !(await page.$('#feuille-contenu .el-carte[data-liste="mini_bandes"] .el-champ-kg')), JSON.stringify(await noms('mini_bandes')));
      await page.click('#feuille-contenu .el-choix button[data-choix="nom"]');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      const large = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      ok('[132] à 360 px, rien ne déborde', large);
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button')).filter((b) => b.textContent === 'Valider')[0].click());
      const ATTENDU = { barres_ez: [], barres_droites: [], halteres: null,
        elastiques: [{ nom: 'Noir', kg: 35 }, { nom: 'Rouge', kg: 25 }, { nom: 'Vert' }],
        mini_bandes: [{ nom: 'Bleue' }, { nom: 'Jaune' }], elastiques_par_nom: true };
      const ecrit = await attendreQue(page, () => !!bd.profils[B].ma_salle, 10000);
      ok('DISCRIMINANT [132] — les deux listes, dans leur ordre, et « par son nom » partent en base', ecrit &&
        JSON.stringify(bd.profils[B].ma_salle) === JSON.stringify(ATTENDU), JSON.stringify(bd.profils[B].ma_salle));
      await calme(page, bd);   // 135 — l'écriture rendue à l'écran (était 300 ms)
      await cliquerLigne(page, 'Ma salle');
      await feuilleOuverte(page);
      ok('[132] la feuille rouverte : l’ordre et le choix relus',
        JSON.stringify((await noms('elastiques')).map((x) => x.split('|')[0])) === JSON.stringify(['Noir', 'Rouge', 'Vert']) &&
        (await page.evaluate(() => (document.querySelector('#feuille-contenu .el-choix button[data-choix="nom"]') || {}).getAttribute('aria-pressed'))) === 'true');
      // Retirer Vert, revenir « en kg » : la base suit.
      await page.click('#feuille-contenu .el-carte[data-liste="elastiques"] .el-rang[data-i="2"] .el-retirer');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      await page.click('#feuille-contenu .el-choix button[data-choix="kg"]');
      await rendu(page);   // 135 — le geste dans la feuille est synchrone : l'écran peint (était 150 ms)
      await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu button')).filter((b) => b.textContent === 'Valider')[0].click());
      const suivi = await attendreQue(page, () => !!bd.profils[B].ma_salle && !bd.profils[B].ma_salle.elastiques_par_nom &&
        (bd.profils[B].ma_salle.elastiques || []).length === 2, 10000);
      ok('[132] retirer un élastique et revenir « en kg » : la base suit', suivi, JSON.stringify(bd.profils[B].ma_salle));
      ok('[132] aucune écriture refusée par la contrainte imitée', bd.requetes.every((q) => q.statut !== 400), JSON.stringify(bd.requetes));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }

    // ══ 104 et 108. LES COLONNES `bilans_annonces` ET `ma_salle` N'EXISTENT PAS ENCORE (v2_086, v2_088 pas lancées) ══════════════════════════════
    // Le défaut de #418 : une colonne nommée avant sa migration, et le profil ne se lisait plus. Ici, la lecture et
    // l'écriture la nomment, la base la refuse : le profil se lit quand même, et un geste du Profil s'écrit.
    console.log('\n══ 104. colonnes `bilans_annonces` et `ma_salle` absentes en base : le profil se lit et s’écrit quand même ══');
    {
      const bd = neuveBase();
      bd.sansBilansAnnonces = true;
      bd.sansMaSalle = true;
      bd.profils[A].bilans_annonces = undefined;
      const ctx = await contexte(nav, bd, { stockage: sessionDe(A) });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/profil', { waitUntil: 'domcontentloaded' });
      const lu = await attendreQue(page, () => page.evaluate(() =>
        /compte_a/.test((document.querySelector('#profil-corps') || {}).textContent || '')), 15000);
      ok('prémisse [104, 108] — la base a refusé une colonne au moins une fois (42703)', bd.refusColonne > 0, String(bd.refusColonne));
      ok('DISCRIMINANT [104, 108] — le profil se lit : le Profil montre le pseudo de la ligne', lu);
      await attendreQue(page, () => page.evaluate(() => !!document.querySelector('#profil-corps .p-ligne')), 8000);
      const avant = bd.requetes.length;
      await cliquerLigne(page, 'Sexe');
      await feuilleOuverte(page);
      await page.click('#feuille-contenu .feuille-menu button[data-cle="femme"]');
      const ecrit = await attendreQue(page, () => bd.profils[A].sexe === 'femme', 12000);
      ok('DISCRIMINANT [104, 108] — un geste du Profil s’écrit en base (Sexe → Femme)', ecrit, JSON.stringify(bd.profils[A]));
      ok('[104, 108] l’écriture est passée du premier coup, sans la colonne', bd.requetes.slice(avant).every((q) => q.statut === 201),
        JSON.stringify(bd.requetes.slice(avant)));
      ok('[104, 108] une colonne n’est plus demandée après son refus : au plus un refus par colonne, par lecture et par écriture',
        bd.refusColonne <= 4, String(bd.refusColonne));
      ok('aucune écriture refusée par la « RLS »', bd.refus.length === 0, JSON.stringify(bd.refus));
      ok('aucune erreur de page', erreurs.length === 0, JSON.stringify(erreurs));
      await ctx.close();
    }
  } finally {
    await nav.close();
    await new Promise((r) => serveur.close(r));
  }
  console.log('\n   ' + rapport.controles + ' contrôles · ' + rapport.echecs.length + ' en échec');
  if (rapport.echecs.length) { console.log('❌ en échec'); process.exit(1); }
  console.log('✅ tout passe');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
