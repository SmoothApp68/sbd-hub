#!/usr/bin/env node
//
// tests/banc/routines-ecran.js — la bibliothèque de routines, à l'écran.
//
// Les tests unitaires disent que le PLAN D'ÉCRITURES est juste. Celui-ci dit
// que l'ÉCRAN marche : l'app réelle, dans un vrai navigateur, à 360 px, avec
// une session truquée et un Supabase DE PAPIER branché sur le réseau.
//
// ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : le Supabase de papier
// applique LES DEUX INDEX UNIQUES de la vraie base —
//
//     routine_exos_rang_uniq        (routine_id, rang)          non différable
//     routines_user_nom_actif_uniq  (user_id, lower(btrim(nom))) WHERE archivee_a IS NULL
//
// Sans eux, le banc serait plus permissif que Postgres : « renuméroter
// proprement » et « écrire n'importe comment » donneraient le même résultat, et
// les scénarios 5 à 7 ne prouveraient rien.
//
// Ce banc a trouvé trois défauts que les tests purs ne voyaient pas :
//   · la recherche annonçait « aucun exercice ne correspond » quand le
//     catalogue n'était pas encore chargé ;
//   · la bibliothèque affichait l'état vide hors ligne — « je ne sais pas »
//     présenté comme « il n'y en a pas » ;
//   · l'aperçu d'une routine affichait « 0 exercice » (défaut du banc, mais
//     trouvé pareil).
//
//   node tests/banc/routines-ecran.js
//
// Sortie : une ligne par vérification, code de retour non nul si l'une échoue —
// pour qu'une campagne de mutation puisse s'en servir.

const path = require('path');
const R = path.join(__dirname, '../..');
const { chromium } = require(path.join(R, 'node_modules/playwright-core'));
// 59-4 — tout navigateur de test passe par la garde réseau (aucune requête vers la vraie base).
const Garde = require(path.join(R, 'tests/banc/garde-reseau.js'));
const { creer } = require(path.join(R, 'v2-atelier/banc/serveur-pages.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.BANC_PORT || 8872), BASE = 'http://127.0.0.1:' + PORT;
// ⚠️ UN DÉLAI FIXE N'EST GARDÉ QUE S'IL EST UNE MESURE DU TEMPS (135). Il n'en reste qu'un usage ici : le
// rythme d'un doigt qui glisse (les pas d'un glissement à la souris). Tout le reste attend un ÉTAT — voir
// `jusqua`, `calme` et `rendu` plus bas.
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ATTENDRE UN ÉTAT, PAS UNE DURÉE (135) ─────────────────────────────────────
//
// Ce banc dormait 110 s de délais fixes, calibrés sur une machine calme. Sous charge (deux ou trois agents,
// six navigateurs pour deux cœurs), « Enregistrer » fait plusieurs allers-retours au faux serveur
// (`routines`, `routine_exercises`, `routine_sets`, puis la relecture de la bibliothèque) avant de rendre la
// bibliothèque : les 900 ms fixes ne suffisaient plus, le contrôle lisait l'éditeur encore ouvert et la
// base à moitié écrite, et toute la suite partait du mauvais écran (12 échecs d'un coup, relevé à la PR 455).
//
// `jusqua(nom, cond)` interroge l'état que le contrôle suivant lit, toutes les 50 ms, jusqu'au plafond. Au
// plafond, il rend la main SANS rien conclure : le contrôle qui suit dit ce qu'il voit, et l'attente est
// comptée (le total s'affiche en fin de banc). Un plafond n'est jamais un succès.
const PLAFOND_MS = 20000;
const statAttente = { n: 0, plafond: 0, pire: 0, pireNom: '', plafonds: [] };
const jusqua = async (nom, cond, max) => {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await cond(); } catch (e) { v = false; }
    if (v) break;
    if (Date.now() - t0 >= (max || PLAFOND_MS)) { statAttente.plafond++; statAttente.plafonds.push(nom); break; }
    await attendre(50);   // le pas d'une attente d'état
  }
  const d = Date.now() - t0;
  statAttente.n++;
  if (d > statAttente.pire) { statAttente.pire = d; statAttente.pireNom = nom; }
  return d;
};
// Le faux serveur, compté : les requêtes en vol et l'instant de la dernière réponse.
const reseau = { enVol: 0, dernier: 0, total: 0, lecturesRoutines: 0,
  // 164 — retenir UNE réponse de lecture des routines : `retenirProchaine` l'arme, `retenue` dit qu'elle attend, `liberer` la rend.
  retenirProchaine: false, retenue: false, liberer: null };
const CALME_MS = 300;
// Le réseau du banc se tait : aucune requête en vol, aucune depuis `CALME_MS`. C'est l'état qui prouve
// qu'une écriture qui ne DOIT PAS partir n'est pas partie (avec l'effet attendu à l'écran, lu avant).
const calme = (nom) => jusqua(nom || 'réseau calme', () => reseau.enVol === 0 && Date.now() - reseau.dernier >= CALME_MS);
// Deux images peintes : un rendu synchrone déclenché par le geste est à l'écran.
const rendu = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {});
// L'écran posé après un chargement. C'est l'état que l'ancien délai fixe de 2,5 s visait (« le boot affiche
// ce qu'il a AVANT de synchroniser, puis honore l'URL quand la synchro rend la main ») :
//   · le faux serveur a servi au moins une requête depuis le chargement (`depuis`), et il est calme ;
//   · la page est chargée, une vue de `main` est affichée ;
//   · l'état de synchronisation a un libellé — l'app le laisse VIDE au démarrage et ne le pose qu'à la fin de
//     sa synchronisation (`synchroniser` → `etat`) — et ce n'est pas « Synchronisation… » ;
//   · la vue affichée ne dit plus « Chargement… » (la bibliothèque se lit APRÈS la synchronisation).
// Sous un processeur très lent, un silence de 500 ms peut tomber ENTRE deux lectures : c'est pourquoi le
// réseau calme seul ne suffit pas, et pourquoi chaque fait ci-dessus est lu dans la page.
const ecranPose = (p, nom, depuis) => jusqua(nom || 'écran posé', async () => {
  if (depuis !== undefined && reseau.total <= depuis) return false;
  if (reseau.enVol !== 0 || Date.now() - reseau.dernier < 500) return false;
  return p.evaluate(() => {
    const sync = document.getElementById('etat-sync');
    const vues = Array.from(document.querySelectorAll('main > section')).filter((x) => !x.hidden);
    return document.readyState === 'complete' && vues.length > 0 &&
      !vues.some((v) => /Chargement…/.test(v.textContent || '')) &&
      (!sync || ((sync.textContent || '').trim() !== '' && !sync.classList.contains('sync')));
  });
});
const vueVisible = (p, id) => p.evaluate((x) => { const n = document.getElementById(x); return !!n && !n.hidden; }, id);
const feuilleFermee = (p) => p.evaluate(() => { const f = document.getElementById('feuille-seance'); return !f || f.hidden; });

let echecs = 0;
const ok = (nom, cond, detail) => {
  if (!cond) echecs++;
  console.log('   ' + (cond ? '✅' : '❌') + ' ' + nom + (detail !== undefined ? '  — ' + detail : ''));
};

const CATALOGUE = [
  { slug: 'squat-barre', nom: 'Squat (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['quadriceps'], muscles_secondaires: [] },
  { slug: 'dc-barre', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'souleve-terre', nom: 'Soulevé de Terre (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['bas du dos'], muscles_secondaires: [] },
  { slug: 'curl', nom: 'Curl Biceps Haltères', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['biceps'], muscles_secondaires: [] }
];
// 126 — les noms alternatifs communs (`exercise_alias` : clé `alias`, le nom tel quel).
const ALIAS_COMMUNS = [
  { alias: 'DC', slug: 'dc-barre', source: 'app' },
  { alias: 'Bench Press (Barbell)', slug: 'dc-barre', source: 'hevy' },
  { alias: 'Deadlift (Barbell)', slug: 'souleve-terre', source: 'hevy' }
];

(async () => {
  // ── Le Supabase de papier, avec les DEUX index uniques de la vraie base ──
  // ⚠️ `sessions` ET `sets` SONT ICI POUR UNE SEULE RAISON : sans eux, « les
  // séances passées survivent à la suppression de leur routine » n'est pas
  // mesurable, et le §7 duodecies.1 repose entièrement là-dessus.
  //
  // Ils ne sont PAS servis en lecture, volontairement : ce banc est celui des
  // routines, il ne déroule pas la synchronisation des séances, et une ligne de
  // séance à moitié formée serait moins fidèle que pas de ligne du tout. Le
  // banc d'écran séance est l'endroit où `sessions` est complète. Ici, ce qu'on
  // mesure est ce que la SUPPRESSION leur fait — donc l'état du magasin.
  //
  // ⚠️ `routine_sets` EST ENTRÉE AU CHANTIER 43, et le banc DOIT la porter :
  // sans elle, l'éditeur ne rend plus une seule ligne — il lit la structure
  // là, pas dans `routine_exercises`. Un banc qui l'ignorerait mesurerait un
  // écran vide et le trouverait conforme.
  const base = { routines: [], exos: [], series: [], sessions: [], sets: [], blocs: [],
                 // Ce que le SERVEUR rend en lecture, distinct de ce que les
                 // sections écrivent : voir le commentaire de la route `sessions`.
                 corpusSeances: [], corpusSeries: [],
                 graine: 0, envois: [],
                 // ⚠️ UN COMPTE QUI A DÉJÀ REMPLI SON QUESTIONNAIRE (60-2a) — c'est
                 // celui que testent les sections 1 à 10. Sans ça, la règle du
                 // questionnaire s'appliquerait à toutes : un questionnaire jamais
                 // rempli s'ouvre de lui-même, donc le banc mesurerait cet écran-là
                 // au lieu de celui qu'il vise.
                 //
                 // La section 11, elle, remet `profil` à null : un compte neuf
                 // n'a PAS de ligne `profiles` — relevé sur `pg_trigger`, il n'y
                 // a AUCUN trigger sur `auth.users`. Un banc qui poserait la
                 // ligne d'office testerait un serveur qui n'existe pas, et
                 // « l'app crée son profil » passerait pour vrai de n'importe
                 // quelle implémentation, y compris d'une qui ne le crée jamais.
                 profil: { id: 'u-banc', username: 'banc', bio: '',
                   sexe: 'non_precise', taille_cm: null, date_naissance: null,
                   mode_entrainement: 'musculation', unites: 'kg', anciennete: null,
                   intention: 'progresser', materiel: null, niveau_declare: null,
                   seances_par_semaine: null, jours_vises: null,
                   duree_seance_min: null, onboarding_completed: true,
                   questionnaire_fait_le: '2026-10-01T09:00:00.000Z', objectif: null,
                   objectif_depuis: null, priorites: null, temps_reponse: null,
                   historique_declare: null, phase_confirmee_le: null } };
  // Les CHECK de `profiles`, relevés sur `pg_constraint` le 18/09/2026. Sans
  // eux le banc serait plus permissif que Postgres, et écrire « Entretenir » au
  // lieu de « entretien » monterait vert ici pour rendre 23514 sur l'appareil.
  const CHECKS_PROFIL = {
    sexe: ['homme', 'femme', 'non_precise'],
    mode_entrainement: ['bien_etre', 'musculation', 'powerbuilding', 'powerlifting', 'calisthenics'],
    unites: ['kg', 'lb'],
    intention: ['progresser', 'entretien'],
    materiel: ['salle_complete', 'salle_basique', 'maison_equipee', 'maison_minimal', 'poids_du_corps'],
    anciennete: ['moins_1_an', '1_a_3_ans', '3_a_5_ans', 'plus_5_ans'],
    niveau_declare: ['debutant', 'intermediaire', 'avance', 'expert'],
    // 60-2a (`v2_065`, valeurs relevées par Claude.ai le 07/10/2026).
    objectif: ['force', 'muscle', 'les_deux', 'forme'],
    temps_reponse: ['max', 'marge', 'moins', 'varie'],
    historique_declare: ['import', 'non_note', 'debutant']
  };
  const bornesProfil = (l) => {
    for (const col of Object.keys(CHECKS_PROFIL)) {
      const v = l[col];
      if (v === undefined) continue;
      if (v === null) {
        // Les quatre NOT NULL refusent le null ; les trois autres l'acceptent.
        if (['sexe', 'mode_entrainement', 'unites', 'intention'].indexOf(col) >= 0) {
          return 'profiles.' + col + ' NOT NULL';
        }
        continue;
      }
      if (CHECKS_PROFIL[col].indexOf(v) < 0) return 'profiles_' + col + '_ok';
    }
    if (l.taille_cm !== undefined && l.taille_cm !== null &&
        !(l.taille_cm >= 100 && l.taille_cm <= 250)) return 'profiles_taille_ok';
    if (l.seances_par_semaine !== undefined && l.seances_par_semaine !== null &&
        !(l.seances_par_semaine >= 1 && l.seances_par_semaine <= 14)) return 'profiles_rythme_borne';
    if (l.duree_seance_min !== undefined && l.duree_seance_min !== null &&
        !(l.duree_seance_min >= 10 && l.duree_seance_min <= 300)) return 'profiles_rythme_borne';
    // `priorites` : une liste de trois au plus (`{}` = « Pas de priorité », NULL =
    // pas répondu) — ce que la base refuserait en 23514 sinon.
    if (l.priorites !== undefined && l.priorites !== null &&
        !(Array.isArray(l.priorites) && l.priorites.length <= 3)) return 'profiles_priorites_ok';
    // ⚠️ LE TRIGGER `protect_privileged_profile_columns`. Il ne REFUSE pas ces
    // colonnes, il les remet en place — donc un client qui les enverrait ne
    // verrait rien. Le banc, lui, le DIT : c'est la seule façon de savoir que la
    // liste blanche de `THProfil.champsEcrits` tient.
    for (const col of ['is_admin', 'tier', 'tier_awarded_at', 'xp_high_water_mark']) {
      if (l[col] !== undefined) return 'colonne privilégiée envoyée : ' + col;
    }
    return null;
  };
  const replie = (n) => String(n || '').trim().toLowerCase();
  const collisionRang = () => {
    const vus = new Set();
    for (const e of base.exos) { const c = e.routine_id + '#' + e.rang; if (vus.has(c)) return true; vus.add(c); }
    return false;
  };
  // ⚠️ `routines_user_rang_uniq` (v2_043) — UNIQUE (user_id, rang) WHERE
  // archivee_a IS NULL, et NON DIFFÉRABLE. Sans ce refus, le banc serait plus
  // permissif que Postgres et le plan d'écritures du §7 vicies.3 ne prouverait
  // rien : une boucle naïve passerait. C'est la même leçon que `collisionRang`
  // au chantier 28.
  const collisionRangRoutines = () => {
    const vus = new Set();
    for (const r of base.routines) {
      if (r.archivee_a) continue;
      if (r.rang === null || r.rang === undefined) continue;
      const c = r.user_id + '#' + r.rang;
      if (vus.has(c)) return true;
      vus.add(c);
    }
    return false;
  };
  const collisionNom = () => {
    const vus = new Set();
    for (const r of base.routines) {
      if (r.archivee_a) continue;
      const c = r.user_id + '#' + replie(r.nom); if (vus.has(c)) return true; vus.add(c);
    }
    return false;
  };

  const serveur = creer({ racine: path.join(R, 'v2') });
  await new Promise((r) => serveur.listen(PORT, r));
  const nav = await Garde.lancer(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 360, height: 760 } });

  // Le jeton du banc est VERROUILLÉ : le SDK Supabase purge un jeton qu'il ne
  // peut pas valider, l'app se déconnecte alors — correctement, c'est le
  // fail-closed du chantier 18 — et le banc mesurerait l'écran de connexion au
  // lieu de l'écran à tester. On empêche donc la purge, pas la déconnexion.
  const SCRIPT_JETON = () => {
    const JETON = JSON.stringify({
      access_token: 'faux', refresh_token: 'faux', expires_at: 4102444800,
      token_type: 'bearer', user: { id: 'u-banc', email: 'banc@test' }
    });
    localStorage.setItem('th-v2-auth', JETON);
    const vraiRemove = Storage.prototype.removeItem;
    const vraiSet = Storage.prototype.setItem;
    // 59-4 — `window.__jetonLibre` lève le verrou : le banc de « Supprimer mon
    // compte » doit voir le jeton PARTIR.
    Storage.prototype.removeItem = function (c) {
      if (c === 'th-v2-auth' && !window.__jetonLibre) return;
      return vraiRemove.call(this, c);
    };
    Storage.prototype.setItem = function (c, v) { return vraiSet.call(this, c, c === 'th-v2-auth' ? JETON : v); };
  };
  await ctx.addInitScript(SCRIPT_JETON);

  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 140)));

  // 135 — chaque requête au faux serveur est comptée en vol jusqu'à sa réponse (`calme`, `ecranPose`).
  const gererSupabase = async (route) => {
    reseau.enVol++; reseau.total++; reseau.dernier = Date.now();
    try { return await traiterSupabase(route); } finally { reseau.enVol--; reseau.dernier = Date.now(); }
  };
  const traiterSupabase = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop();
    // ⚠️ PROJETER LES COLONNES, COMME POSTGREST (chantier 34). Ce banc
    // renvoyait la ligne entière en ignorant `select=` : une colonne écrite
    // mais absente de la liste de lecture revenait quand même ici, et jamais
    // sur l'appareil. Les routines sont la seule requête du projet à porter une
    // RESSOURCE IMBRIQUÉE — `routine_exercises(...)` — donc c'est aussi le seul
    // endroit où la projection doit descendre d'un niveau.
    const decouperSelect = (texte) => {
      const bouts = []; let profondeur = 0, courant = '';
      for (const c of texte) {
        if (c === '(') profondeur++;
        if (c === ')') profondeur--;
        if (c === ',' && profondeur === 0) { bouts.push(courant); courant = ''; continue; }
        courant += c;
      }
      if (courant.trim()) bouts.push(courant);
      return bouts.map((b) => b.trim()).filter(Boolean);
    };
    const projeterUne = (ligne, champs) => {
      if (champs.indexOf('*') >= 0) return Object.assign({}, ligne);
      const sortie = {};
      for (const champ of champs) {
        const m = /^([A-Za-z_][\w]*)\s*\((.*)\)$/.exec(champ);
        if (m) {
          const imbrique = ligne[m[1]];
          sortie[m[1]] = Array.isArray(imbrique)
            ? imbrique.map((x) => projeterUne(x, decouperSelect(m[2])))
            : imbrique;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(ligne, champ)) sortie[champ] = ligne[champ];
      }
      return sortie;
    };
    const projeter = (data, u) => {
      const select = u.searchParams.get('select');
      if (!select || !Array.isArray(data)) return data;
      const champs = decouperSelect(select);
      return data.map((l) => projeterUne(l, champs));
    };
    const filtrer = (lignes, u) => lignes.filter((l) => {
      for (const [cle, val] of u.searchParams) {
        if (['select', 'order', 'limit', 'offset', 'or'].indexOf(cle) >= 0) continue;
        if (val.startsWith('eq.') && String(l[cle]) !== val.slice(3)) return false;
        // 117 — `in.(a,b)` (le rapprochement des séries).
        if (val.startsWith('in.') && val.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).indexOf(String(l[cle])) < 0) return false;
        if (val.startsWith('gt.') && !(String(l[cle]) > val.slice(3))) return false;
      }
      return true;
    });
    const corps = req.postData() ? JSON.parse(req.postData()) : null;
    // `.single()` envoie `Accept: application/vnd.pgrst.object+json` et
    // PostgREST répond alors par UN OBJET, pas un tableau. Un banc qui rendrait
    // toujours un tableau ferait croire que `routine.id` est indéfini — c'est
    // ce qu'il faisait, et la carte affichait « 0 exercice ».
    const unSeul = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const json = (data, status) => route.fulfill({ status: status || 200,
      contentType: 'application/json',
      body: JSON.stringify(unSeul && Array.isArray(data) ? data[0] : data) });

    if (url.pathname.startsWith('/auth/')) return json({ error: 'x' }, 400);
    if (req.method() === 'GET') {
      if (table === 'exercises') return json(projeter(CATALOGUE, url));
      // 126 (ES §7 quindecies.11) — les noms alternatifs communs (`exercise_alias`, lecture seule), lus par la
      // synchronisation avec le catalogue : la recherche les cherche.
      if (table === 'exercise_alias') return json(projeter(ALIAS_COMMUNS, url));
      // `maybeSingle` sur zéro ligne : PostgREST rend un TABLEAU VIDE, et c'est
      // supabase-js qui en fait `data: null`. Rendre `null` directement ferait
      // croire à une ligne nulle là où il n'y a pas de ligne du tout.
      if (table === 'profiles') {
        return json(projeter(base.profil ? [base.profil] : [], url));
      }
      // ⚠️ POSTGREST APPLIQUE LES FILTRES, ET LE BANC DOIT LE FAIRE AUSSI.
      // `seancesEnCours` demande `statut=eq.en_cours` : un banc qui ignore le
      // filtre rend des séances TERMINÉES à cette question, l'app croit qu'une
      // séance est restée ouverte, et elle tente de la refermer. C'est la même
      // famille que la projection des colonnes du chantier 34 — un banc plus
      // permissif que la base ne prouve rien.
      // 155 — les cycles (`blocs`) : lus par la synchronisation, écrits par la file (renommer un dossier).
      if (table === 'blocs') return json(projeter(base.blocs, url));
      if (table === 'sessions') return json(projeter(filtrer(base.corpusSeances, url), url));
      if (table === 'sets') return json(projeter(filtrer(base.corpusSeries, url), url));
      // ⚠️ AUCUN FILTRE SUR `archivee_a` ICI. `Donnees.mesRoutines` n'en pose
      // pas non plus : le banc le faisait, et rendait donc les archivées
      // invisibles CÔTÉ SERVEUR — la règle d'affichage du client n'était
      // jamais exercée. Depuis le §7 duodecies.1 elle a changé, et c'est ce
      // filtre-là qui l'aurait masqué.
      // ⚠️ DEUX NIVEAUX D'IMBRICATION DEPUIS LE CHANTIER 43 :
      // `routines → routine_exercises → routine_sets`. `projeterUne` descend
      // déjà récursivement ; il fallait seulement que la donnée soit là.
      if (table === 'routines') reseau.lecturesRoutines++;
      // 164 — VOULU : la réponse est CONSTRUITE à la requête (l'état d'alors) et rendue plus tard, comme une 4G lente.
      // La requête retenue ne compte pas « en vol » : le banc doit pouvoir enregistrer pendant qu'elle attend.
      let attente = null;
      if (table === 'routines' && reseau.retenirProchaine) {
        reseau.retenirProchaine = false; reseau.retenue = true;
        attente = new Promise((fin) => { reseau.liberer = fin; });
      }
      if (table === 'routines') {
        const corpsRoutines = projeter(base.routines.map((r) =>
        Object.assign({}, r, {
          routine_exercises: base.exos.filter((e) => e.routine_id === r.id).map((e) =>
            Object.assign({}, e, {
              // ⚠️ DANS LE DÉSORDRE, EXPRÈS. PostgREST ne garantit AUCUN ordre
              // sur une ressource imbriquée sans `order=` — et la requête n'en
              // pose pas. Un banc qui les rendrait triées testerait un serveur
              // qui n'existe pas, et « l'app trie » passerait pour vrai de
              // toute implémentation, y compris d'une qui ne trie rien.
              routine_sets: base.series
                .filter((x) => x.routine_exercise_id === e.id)
                .slice().reverse()
            }))
        })), url);
        if (attente) {
          reseau.enVol--;
          await attente;
          reseau.enVol++; reseau.retenue = false; reseau.liberer = null;
        }
        return json(JSON.parse(JSON.stringify(corpsRoutines)));
      }
      return json([]);
    }
    // ⚠️ LES SIX CHECK DE `routine_exercises`, ET LE NOM DE ROUTINE (ch. 34).
    //
    // Aucun des deux bancs ne les appliquait. Conséquence mesurée à l'audit :
    // supprimer `reposValide` de `routines.js` ne faisait tomber AUCUNE
    // assertion — un repos à 3 s montait vert ici et rendait 23514, code
    // DÉFINITIF, sur l'appareil. Les bornes sont relevées sur les CHECK réels,
    // pas supposées (`routines.js:35-40`).
    const bornes = (l) => {
      if (l.series !== undefined && !(l.series >= 1 && l.series <= 20)) return 'routine_exos_series_bornees';
      if (l.reps_visees !== undefined && l.reps_visees !== null &&
          !(l.reps_visees >= 1 && l.reps_visees <= 100)) return 'routine_exos_reps_bornees';
      if (l.repos_cible_s !== undefined && l.repos_cible_s !== null &&
          !(l.repos_cible_s >= 5 && l.repos_cible_s <= 1800)) return 'routine_exos_repos_borne';
      if (l.groupe_superset !== undefined && l.groupe_superset !== null &&
          !(l.groupe_superset >= 0)) return 'routine_exos_superset_positif';
      if (l.rang !== undefined && !(l.rang >= 0)) return 'routine_exos_rang_positif';
      if (l.exercise_slug !== undefined && !l.exercise_slug) return 'routine_exercises.exercise_slug NOT NULL';
      if (l.exercise_slug !== undefined && !CATALOGUE.some((e) => e.slug === l.exercise_slug)) {
        return 'routine_exercises_exercise_slug_fkey';
      }
      return null;
    };
    // ⚠️ LES BORNES DE `routine_sets` NE SONT PAS CELLES DE LA TABLE PARENTE.
    // Le rang y commence à **1**, là où celui d'un exercice accepte 0 — les
    // confondre donne un 23514 à chaque première série, et c'est exactement le
    // genre de refus DÉFINITIF qui bloque une file pour toujours (chantier 36).
    const bornesSerie = (l) => {
      if (!(l.rang >= 1)) return 'routine_sets_rang_positif';
      if (['travail', 'echauffement', 'degressive', 'echec'].indexOf(l.type_serie) < 0) {
        return 'routine_sets_type_serie';
      }
      if (l.reps_visees !== null && l.reps_visees !== undefined &&
          !(l.reps_visees >= 1 && l.reps_visees <= 100)) return 'routine_sets_reps_bornees';
      if (l.duree_cible_s !== null && l.duree_cible_s !== undefined &&
          !(l.duree_cible_s >= 1 && l.duree_cible_s <= 35999)) return 'routine_sets_duree_bornee';
      if (l.distance_cible_m !== null && l.distance_cible_m !== undefined &&
          !(l.distance_cible_m >= 0 && l.distance_cible_m <= 100000)) return 'routine_sets_distance_bornee';
      if (!l.routine_exercise_id) return 'routine_sets.routine_exercise_id NOT NULL';
      if (!l.user_id) return 'routine_sets.user_id NOT NULL';
      if (!base.exos.some((e) => e.id === l.routine_exercise_id)) {
        return 'routine_sets_routine_exercise_id_fkey';
      }
      return null;
    };
    const nomBorne = (l) => {
      // 52-1 — `routines_dossier_ok` (v2_057) : NULL, ou 1 à 40 caractères
      // sans espace au bord. L'éditeur écrit le dossier par le même chemin.
      if (l.dossier !== undefined && l.dossier !== null) {
        const d = String(l.dossier);
        if (d !== d.trim() || d.length < 1 || d.length > 40) return 'routines_dossier_ok';
      }
      // 99 — `routines.jours` (v2_084) : NULL, ou 1 à 7 jours parmi 1..7 (le CHECK de la base).
      if (l.jours !== undefined && l.jours !== null) {
        const j = l.jours;
        if (!Array.isArray(j) || j.length < 1 || j.length > 7 || !j.every((x) => Number.isInteger(x) && x >= 1 && x <= 7)) return 'routines_jours_check';
      }
      if (l.nom === undefined) return null;
      const t = String(l.nom === null ? '' : l.nom).trim();
      if (!t.length || t.length > 60) return 'routines_nom_court';
      return null;
    };
    const refuserSi = (l, quoi) => quoi
      ? json({ code: quoi.indexOf('fkey') >= 0 ? '23503' : (quoi.indexOf('NOT NULL') >= 0 ? '23502' : '23514'),
               message: quoi }, 400)
      : null;

    base.envois.push({ methode: req.method(), table, corps: corps });
    // ⚠️ LA FONCTION DE VÉRIFICATION DU PSEUDO N'EXISTE PAS EN BASE, et le banc
    // le dit en PGRST202 — pas en rendant « libre ». C'est la configuration
    // discriminante du troisième état : un banc qui répondrait « libre » ne
    // distinguerait pas « on sait que c'est libre » de « on ne sait pas ».
    if (req.method() === 'POST' && table === 'pseudo_libre') {
      return json({ code: 'PGRST202', message:
        'Could not find the function public.pseudo_libre(nom) in the schema cache' }, 404);
    }
    if (req.method() === 'POST' && table === 'delete_user_complete_data') {
      // 59-4 — la base REFUSE (le chemin d'échec) : rien ne part.
      if (base.refuserSuppression) {
        return json({ code: 'P0001', message: 'refus du banc', details: null, hint: null }, 400);
      }
      base.profil = null; base.routines = []; base.exos = [];
      base.series = []; base.sessions = []; base.sets = [];
      base.corpusSeances = []; base.corpusSeries = [];
      base.compteSupprime = true;
      return json(null);
    }
    if (req.method() === 'POST' && table === 'profiles') {
      const l = Array.isArray(corps) ? corps[0] : corps;
      const mauvais = bornesProfil(l);
      if (mauvais) return refuserSi(l, mauvais);
      // `upsert` sur la clé primaire : on fusionne, comme Postgres.
      const defauts = { username: null, bio: '', sexe: 'non_precise', taille_cm: null,
        date_naissance: null, mode_entrainement: 'musculation', unites: 'kg',
        anciennete: null, intention: 'progresser', materiel: null,
        niveau_declare: null, seances_par_semaine: null, jours_vises: null,
        duree_seance_min: null, onboarding_completed: false,
        // 60-2a — la base les crée à NULL : « jamais rempli » est un état de la ligne.
        questionnaire_fait_le: null, objectif: null, objectif_depuis: null, priorites: null,
        temps_reponse: null, historique_declare: null, phase_confirmee_le: null };
      base.profil = Object.assign({}, defauts, base.profil || {}, l);
      return json(projeter([base.profil], url), 201);
    }
    if (req.method() === 'POST' && table === 'blocs') {
      const l = Array.isArray(corps) ? corps[0] : corps;
      const i = base.blocs.findIndex((x) => x.id === l.id);
      const ligne = Object.assign({ decharge: true, statut: 'en_cours', precedent: null }, i >= 0 ? base.blocs[i] : {}, l);
      if (i >= 0) base.blocs[i] = ligne; else base.blocs.push(ligne);
      return json([ligne], 201);
    }
    if (req.method() === 'POST' && table === 'routines') {
      const mauvais = nomBorne(Array.isArray(corps) ? corps[0] : corps);
      if (mauvais) return refuserSi(corps, mauvais);
      const l = Object.assign({ id: 'r' + (++base.graine), archivee_a: null, note: null, rang: null, jours: null }, corps);
      base.routines.push(l);
      if (collisionNom()) { base.routines.pop(); return json({ code: '23505', message: 'duplicate key value violates unique constraint "routines_user_nom_actif_uniq"' }, 409); }
      if (collisionRangRoutines()) { base.routines.pop(); return json({ code: '23505', message: 'duplicate key value violates unique constraint "routines_user_rang_uniq"' }, 409); }
      return json([l], 201);
    }
    if (req.method() === 'POST' && table === 'routine_exercises') {
      for (const c of (Array.isArray(corps) ? corps : [corps])) {
        const mauvais = bornes(c);
        if (mauvais) return refuserSi(c, mauvais);
      }
      const ajout = (Array.isArray(corps) ? corps : [corps]).map((c) => Object.assign({ id: 'e' + (++base.graine) }, c));
      base.exos = base.exos.concat(ajout);
      if (collisionRang()) { base.exos = base.exos.slice(0, -ajout.length);
        return json({ code: '23505', message: 'duplicate key value violates unique constraint "routine_exos_rang_uniq"' }, 409); }
      return json(ajout, 201);
    }
    if (req.method() === 'POST' && table === 'routine_sets') {
      for (const c of (Array.isArray(corps) ? corps : [corps])) {
        const mauvais = bornesSerie(c);
        if (mauvais) return refuserSi(c, mauvais);
      }
      const ajout = (Array.isArray(corps) ? corps : [corps])
        .map((c) => Object.assign({ id: 'rs' + (++base.graine) }, c));
      base.series = base.series.concat(ajout);
      // `routine_sets_rang_unique` est DIFFÉRABLE : l'état intermédiaire d'un
      // remplacement est légal, seule la fin de transaction compte. Comme le
      // client supprime puis insère en deux requêtes, on vérifie APRÈS.
      const vus = new Set();
      for (const x of base.series) {
        const c = x.routine_exercise_id + '#' + x.rang;
        if (vus.has(c)) {
          base.series = base.series.slice(0, -ajout.length);
          return json({ code: '23505', message: 'duplicate key value violates unique constraint "routine_sets_rang_unique"' }, 409);
        }
        vus.add(c);
      }
      return json(ajout, 201);
    }
    if (req.method() === 'PATCH') {
      const mauvais = table === 'routines' ? nomBorne(corps) : bornes(corps);
      if (mauvais) return refuserSi(corps, mauvais);
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      // Une table qu'on ne connaît pas, ou une ligne absente : PostgREST rend un
      // tableau vide, il ne plante pas. Le banc non plus.
      const tab = table === 'routines' ? base.routines
        : (table === 'routine_exercises' ? base.exos : null);
      const l = tab && tab.find((x) => x.id === id);
      if (!l) return json([]);
      const avant = Object.assign({}, l);
      Object.assign(l, corps);
      var index = null;
      if (table === 'routines') {
        if (collisionNom()) index = 'routines_user_nom_actif_uniq';
        else if (collisionRangRoutines()) index = 'routines_user_rang_uniq';
      } else if (collisionRang()) index = 'routine_exos_rang_uniq';
      if (index) { Object.assign(l, avant);
        return json({ code: '23505', message:
          'duplicate key value violates unique constraint "' + index + '"' }, 409); }
      return json([l]);
    }
    // ⚠️ LES DEUX CLÉS ÉTRANGÈRES DE `routines`, ET ELLES NE FONT PAS LA MÊME
    // CHOSE (§7 duodecies.1) :
    //   `routine_exercises_routine_id_fkey`  ON DELETE CASCADE  → les exercices
    //      partent avec la routine, par `routine_id` ;
    //   `sessions_routine_fk`                ON DELETE SET NULL → les séances
    //      RESTENT, elles perdent seulement la référence.
    // Le banc supprimait `base.exos` par l'id de l'EXERCICE — c'est-à-dire
    // jamais, puisqu'on lui passe un id de routine — et ne connaissait pas
    // `sessions`. Les deux promesses sur lesquelles repose la confirmation de
    // suppression n'étaient donc vérifiées nulle part.
    if (req.method() === 'DELETE') {
      const brut = url.searchParams.get('id') || '';
      const ids = brut.startsWith('in.') ? brut.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : [brut.replace('eq.', '')];
      if (table === 'routines') {
        base.routines = base.routines.filter((r) => ids.indexOf(r.id) < 0);
        const partis = base.exos.filter((e) => ids.indexOf(e.routine_id) >= 0).map((e) => e.id);
        base.exos = base.exos.filter((e) => ids.indexOf(e.routine_id) < 0);
        // `routine_sets_routine_exercise_id_fkey` est ON DELETE CASCADE : la
        // cascade est à DEUX étages, et l'oublier laisserait des séries
        // orphelines que la vraie base n'a jamais.
        base.series = base.series.filter((x) => partis.indexOf(x.routine_exercise_id) < 0);
        base.sessions.forEach((x) => { if (ids.indexOf(x.routine_id) >= 0) x.routine_id = null; });
        return json([]);
      }
      if (table === 'routine_sets') {
        // Le remplacement en bloc filtre par `routine_exercise_id`, pas par id.
        const parent = (url.searchParams.get('routine_exercise_id') || '').replace('eq.', '');
        base.series = base.series.filter((x) => x.routine_exercise_id !== parent);
        return json([]);
      }
      base.exos = base.exos.filter((e) => ids.indexOf(e.id) < 0);
      base.series = base.series.filter((x) => ids.indexOf(x.routine_exercise_id) < 0);
      return json([]);
    }
    return json([]);
  };
  await ctx.route(/supabase\.co/, gererSupabase);

  // Le boot affiche ce qu'il a AVANT de synchroniser, puis honore l'URL quand
  // la synchro rend la main. Sur un cache vide — le cas du banc — il faut donc
  // lui laisser finir : 1,2 s ne suffisait pas, et le banc mesurait l'écran
  // intermédiaire. 135 — on attend l'écran posé (`ecranPose`), plus 2,5 s fixes.
  // 135 — et la VUE de l'adresse demandée est celle affichée (l'app honore l'URL quand la synchro rend la main) ;
  // pour Saisie, la bibliothèque est rendue (elle se lit APRÈS la synchronisation : sous charge, un silence de
  // 500 ms tombait entre les deux et le banc lisait une bibliothèque vide — relevé au 1er des 10 passages).
  const VUE_DE = { '/': 'vue-liste', '/saisie': 'vue-saisie', '/progression': 'vue-progression', '/profil': 'vue-profil',
                   '/routine/nouvelle': 'vue-routine' };
  const aller = async (chemin) => {
    const depuis = reseau.total, lectures = reseau.lecturesRoutines;
    await page.goto(BASE + chemin, { waitUntil: 'networkidle' }).catch(() => {});
    await ecranPose(page, 'aller ' + chemin, depuis);
    if (VUE_DE[chemin]) await jusqua('vue de ' + chemin, () => vueVisible(page, VUE_DE[chemin]));
    if (chemin === '/saisie') {
      // La bibliothèque relue du serveur DEPUIS ce chargement (pas la copie de l'appareil), puis rendue.
      await jusqua('bibliothèque relue', () => reseau.lecturesRoutines > lectures && reseau.enVol === 0);
      await jusqua('bibliothèque rendue', () => page.evaluate(() => {
        const l = document.getElementById('liste-routines');
        return !!l && l.children.length > 0 && !/Chargement…/.test(l.textContent || '');
      }));
      await calme('bibliothèque lue');
      await rendu(page);
    }
  };
  const visible = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('main > section')).filter((s) => !s.hidden).map((s) => s.id));
  const texte = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).innerText || '', sel);
  const contenu = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
  // Retient TOUT ce qui est passé à l'écran, pas seulement l'état final. Un
  // écran transitoire faux — « aucune routine » avant d'avoir su — disparaît en
  // une seconde et ne laisse aucune trace dans la mesure finale. C'est
  // exactement ce que la mutation M10 a montré.
  const attendreTexte = async (sel, motif, delai) => {
    const fin = Date.now() + (delai || 10000);
    const vus = [];
    let vu = '';
    while (Date.now() < fin) {
      vu = await contenu(sel);
      vus.push(vu);
      if (motif.test(vu)) return { fin: vu, vus: vus };
      await attendre(300);   // le pas d'une boucle d'attente d'état (pas un délai fixe)
    }
    return { fin: vu, vus: vus };
  };

  // ── 135 — LES GESTES COMMUNS, CHACUN SUIVI DE L'ÉTAT QU'IL PRODUIT ──────────
  //
  // « Enregistrer » (`enregistrerBrouillon`) : le bouton passe à « Enregistrement… » dans le même tour que le
  // clic, puis — écritures faites ET bibliothèque relue — l'app rend Saisie et le bouton redevient
  // « Enregistrer ». Refusé localement (un doublon), le message s'affiche dans le même tour. On attend donc :
  // le bouton rendu, ET (Saisie affichée OU un message d'erreur), puis le réseau calme.
  const enregistrer = async () => {
    await page.click('#btn-enregistrer-routine');
    await jusqua('enregistrer la routine', () => page.evaluate(() => {
      const b = document.getElementById('btn-enregistrer-routine');
      const fini = !!b && !b.disabled && b.textContent === 'Enregistrer';
      const saisie = !document.getElementById('vue-saisie').hidden;
      const erreur = (document.getElementById('erreur-routine').textContent || '').trim() !== '';
      return fini && (saisie || erreur);
    }));
    await calme('après enregistrer');
    await rendu(page);
  };
  // Ouvrir l'éditeur sur une routine existante : la vue `vue-routine`, avec son nom posé dans le champ.
  const editeurOuvert = () => page.evaluate(() => !document.getElementById('vue-routine').hidden &&
    (document.getElementById('champ-nom-routine').value || '') !== '');
  const ouvrirRoutine = async (filtre) => {
    if (filtre) {
      await page.evaluate((f) => {
        Array.from(document.querySelectorAll('#liste-routines .routine'))
          .filter((c) => new RegExp(f).test(c.textContent))[0].click();
      }, filtre);
    } else await page.click('#liste-routines .routine');
    await jusqua('ouvrir la routine', editeurOuvert);
    await rendu(page);
  };
  // Une routine NEUVE : l'éditeur vide, à l'adresse /routine/nouvelle.
  const nouvelleRoutine = async (sel) => {
    await page.click(sel);
    await jusqua('nouvelle routine', async () => (await vueVisible(page, 'vue-routine')) && /\/routine\/nouvelle$/.test(page.url()));
    await rendu(page);
  };
  // Le catalogue : la feuille de recherche ouverte, la requête tapée, et les résultats de CETTE requête —
  // la recherche attend la frappe (`minuterieRecherche`) : sans attendre le bon premier résultat, on lirait
  // la liste d'avant.
  const premierResultat = () => page.evaluate(() => { const b = document.querySelector('#resultats-exo .resultat');
    return b && b.firstChild ? b.firstChild.textContent : ''; });
  const chercherExo = async (q, motifPremier) => {
    await page.click('#btn-ajouter-exo');
    await jusqua('catalogue ouvert', () => vueVisible(page, 'catalogue'));
    await page.fill('#champ-recherche-exo', q);
    await jusqua('résultats de « ' + q + ' »', async () => {
      const t = await premierResultat();
      return typeof motifPremier === 'function' ? motifPremier(t) : motifPremier.test(t);
    });
  };
  const nbExosEditeur = () => page.evaluate(() => document.querySelectorAll('.legende-exo').length);
  const prendreResultat = async () => {
    const avant = await nbExosEditeur();
    await page.click('#resultats-exo .resultat');
    await jusqua('exercice ajouté', async () => (await nbExosEditeur()) === avant + 1 && !(await vueVisible(page, 'catalogue')));
    await rendu(page);
  };

  console.log('\n══ 1. L’ÉTAT VIDE ══');
  await aller('/saisie');
  ok('la vue Saisie est celle qui s’affiche', JSON.stringify(await visible()) === '["vue-saisie"]', JSON.stringify(await visible()));
  const vide = await texte('#liste-routines');
  // `texte` lit `innerText`, qui applique les capitales de la feuille de style :
  // depuis la forge (56-1), le bouton principal s'AFFICHE « CRÉER UNE ROUTINE ».
  // Son texte, lui, n'a pas changé (le contrôle 54-1 plus bas le lit tel quel).
  ok('il dit qu’il n’y a rien, et quoi faire', /Aucune routine/.test(vide) && /Créer une routine/i.test(vide), vide.replace(/\n+/g, ' | ').slice(0, 120));
  ok('aucune excuse, aucun « oups »', !/oups|désolé|erreur/i.test(vide));
  // 54-1 — la phrase dit le vrai, et les trois chemins, dans cet ordre.
  const etatVide = await page.evaluate(() => {
    const c = document.querySelector('#liste-routines .vide-routines');
    return c ? { phrases: Array.from(c.querySelectorAll('p')).map((p) => p.textContent),
                 boutons: Array.from(c.querySelectorAll('button')).map((b) => b.textContent) } : null;
  });
  ok('[54-1] la phrase : « Une routine, c’est une liste d’exercices dans un ordre. Le coach décide des charges à chaque séance. »',
    !!etatVide && JSON.stringify(etatVide.phrases) === JSON.stringify(['Aucune routine pour l’instant.',
      'Une routine, c’est une liste d’exercices dans un ordre. Le coach décide des charges à chaque séance.']),
    JSON.stringify(etatVide && etatVide.phrases));
  // 60-3 (ES §7 quindecies.7) — « Retrouver mes séances qui reviennent », à côté de la création.
  ok('[54-1] les boutons, dans cet ordre : créer, retrouver ses séances qui reviennent (60-3), depuis une séance passée, séance vide',
    !!etatVide && JSON.stringify(etatVide.boutons) === JSON.stringify(['Créer une routine',
      'Retrouver mes séances qui reviennent', 'En faire une depuis une séance passée', 'Ou commencer une séance vide']),
    JSON.stringify(etatVide && etatVide.boutons));
  await page.click('#liste-routines .depuis-seance');
  await jusqua('vue des séances', () => vueVisible(page, 'vue-liste'));
  ok('[54-1] « En faire une depuis une séance passée » ouvre l’historique des séances',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));
  await aller('/saisie');

  console.log('\n══ 2. CRÉER UNE ROUTINE DE TROIS EXERCICES ══');
  await nouvelleRoutine('#liste-routines .principal');
  ok('l’éditeur s’ouvre, et l’URL le dit', page.url().endsWith('/routine/nouvelle'), page.url().replace(BASE, ''));
  await page.fill('#champ-nom-routine', 'Push');
  for (const [q, attendu] of [['squat', 'Squat (Barre)'], ['developpe couche', 'Développé Couché (Barre)'], ['souleve', 'Soulevé de Terre (Barre)']]) {
    // 135 — on attend que la liste réponde à CETTE requête (son premier résultat), au plafond le contrôle dit
    // ce qu'il voit.
    await chercherExo(q, (t) => t === attendu);
    // 67B — le résultat porte une sous-ligne (« Barre · Quadriceps ») : son NOM est le premier nœud.
    const premier = await premierResultat();
    ok('« ' + q +' » trouve « ' + attendu + ' »', premier === attendu, premier);
    await prendreResultat();
  }
  // ══ L'ÉDITEUR EST L'ÉCRAN DE SÉANCE (§7 quindecies) ══════════════════════
  //
  // ⚠️ IL N'Y A PLUS DE `.exo-routine`. Le banc parcourt les mêmes nœuds que
  // l'écran de séance : un `.bloc-seance` par bloc, une `.legende-exo` par
  // exercice, une `.ligne-serie` par série. Un accesseur unique les lit tous —
  // en écrire quatre, c'était s'exposer à ce qu'ils divergent.
  //
  // L'ORDRE DES `.legende-exo` EST L'ORDRE DES EXERCICES, y compris en
  // superset : l'entrelacement porte sur les LIGNES, pas sur les légendes.
  const exos = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.legende-exo')).map((x) => ({
      nom: ((x.querySelector('.nom-exo') || {}).textContent || ''),
      lettre: ((x.querySelector('.lettre-exo') || {}).textContent || ''),
      groupe: x.closest('.bloc-seance').classList.contains('superset'),
      repos: ((x.querySelector('.repos-cible') || {}).textContent || '')
    })));
  const noms = async () => (await exos()).map((x) => x.nom);

  // ⚠️ TOUS LES GESTES PASSENT PAR LE MENU DE LA CARTE (§7 duodecies.2). Les
  // boutons permanents — monter, descendre, retirer, et le lien « grouper avec
  // le suivant » entre chaque paire — ont disparu : c'est la même grammaire
  // qu'en séance, et le banc doit la parcourir pareil.
  // ⚠️ LE i-ᵉ `.menu-pts` EST LE MENU DU i-ᵉ EXERCICE, et ce n'est pas un
  // hasard : sur un bloc d'un seul, le menu est celui du bloc (tête) ; sur un
  // superset, la tête n'en porte aucun et chaque branche a le sien. Les deux
  // règles sont complémentaires, donc l'ordre du DOM suit l'ordre des
  // exercices — exactement ce que le banc a besoin d'adresser.
  // 135 — le menu est ouvert quand la feuille porte ses entrées.
  const menuOuvert = () => page.evaluate(() => !document.getElementById('feuille-seance').hidden &&
    document.querySelectorAll('#feuille-contenu .feuille-menu button').length > 0);
  const menuCarte = async (i) => {
    await page.evaluate((k) => { document.querySelectorAll('.menu-pts')[k].click(); }, i);
    await jusqua('menu de la carte ' + i, menuOuvert);
  };
  const entreesMenu = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
      .map((b) => b.textContent + (b.disabled ? ' (inerte)' : '')));
  // 135 — une entrée touchée a fait son effet quand son bouton a quitté l'écran (la feuille s'est refermée, ou
  // une autre a pris sa place) ; puis le réseau se tait (l'entrée a pu écrire) et l'écran est peint.
  const entree = async (motif) => {
    await page.evaluate((m) => {
      const b = Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => new RegExp(m).test(x.textContent))[0];
      window.__entreeTouchee = b;
      b.click();
    }, motif);
    await jusqua('entrée « ' + motif + ' »', () => page.evaluate(() =>
      !window.__entreeTouchee.isConnected || document.getElementById('feuille-seance').hidden));
    await calme('après « ' + motif + ' »');
    await rendu(page);
  };
  // Un geste = ouvrir le menu de la carte i, puis toucher son entrée.
  const gesteCarte = async (i, motif) => { await menuCarte(i); await entree(motif); };
  // ⚠️ « MONTER » ET « DESCENDRE » ONT QUITTÉ LE MENU AU CHANTIER 46 (§7 vicies.1) :
  // c'est le mode Réorganiser qui porte l'ordre, et le bloc REPLIÉ garde ses
  // deux flèches. Le banc passe donc par le mode — et exerce au passage le
  // repli de l'éditeur, qui n'existait pas avant.
  //
  // Les flèches plutôt que le glissement, ICI : ce qu'on mesure dans ces
  // sections-là est l'ORDRE et les rangs en base, pas le geste. Le glissement a
  // sa propre section, où il est le sujet.
  // 135 — le mode s'ouvre (les blocs repliés sont là), la flèche agit (l'écran est peint), « Enregistrer »
  // le referme (plus aucun bloc replié).
  const replies = () => page.evaluate(() => document.querySelectorAll('#exos-routine .bloc-seance.replie').length);
  const deplacerCarte = async (i, sens) => {
    await page.click('#btn-ranger-routine');
    await jusqua('mode réorganiser ouvert', async () => (await replies()) > 0);
    await page.evaluate(([k, d]) => {
      const b = document.querySelectorAll('#exos-routine .bloc-seance.replie')[k];
      b.querySelectorAll('.replie-gestes .geste')[d === 'haut' ? 0 : 1].click();
    }, [i, sens]);
    await rendu(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#pied-reorg button'))
        .filter((b) => /Enregistrer/.test(b.textContent))[0].click();
    });
    await jusqua('mode réorganiser refermé', async () => (await replies()) === 0);
    await rendu(page);
  };
  ok('trois exercices dans l’ordre d’ajout', JSON.stringify(await noms()) ===
    JSON.stringify(['Squat (Barre)', 'Développé Couché (Barre)', 'Soulevé de Terre (Barre)']), JSON.stringify(await noms()));

  console.log('\n══ 3. UNE CHARGE CIBLE, JAMAIS UNE CHARGE OBSERVÉE ══');
  //
  // ⚠️ L'INVARIANT S'EST PRÉCISÉ AU CHANTIER 43, IL NE S'EST PAS RELÂCHÉ.
  // L'éditeur porte désormais une colonne KG : `routine_sets.charge_cible_kg`
  // existe, et le §7 quindecies.3 l'autorise — une CIBLE, facultative, qui ne
  // prime jamais sur le moteur. Ce qui reste interdit, c'est une charge
  // OBSERVÉE (`charge_kg`, un poids, un RM) dans `routine_exercises`.
  //
  // ⚠️ ET LA COLONNE EST VIDE À LA CRÉATION : on ne préremplit rien. Une valeur
  // inventée se lirait comme une prescription, et elle serait fausse.
  const colsCreation = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.cols-seance span'))
      .map((x) => x.textContent));
  const kgVides = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ch-serie input')).every((i) => i.value === ''));
  // 52-1 (§7 quindecies.3) — sur un exercice jamais fait, la colonne dit ce
  // qu'elle est : la CHARGE DE DÉPART, lue la première fois seulement.
  ok('la colonne de la charge de départ est là, et vide — la routine ne prescrit aucune charge',
    JSON.stringify(colsCreation) === '["","DÉPART (KG)","REPS",""]' && kgVides,
    JSON.stringify(colsCreation) + ' · toutes vides = ' + kgVides);

  console.log('\n══ 4. ENREGISTRER ══');
  await enregistrer();
  ok('retour à la bibliothèque', page.url().endsWith('/saisie'), page.url().replace(BASE, ''));
  ok('la routine est en base avec 3 exercices, rangs 0/1/2',
    base.exos.length === 3 && JSON.stringify(base.exos.map((e) => e.rang)) === '[0,1,2]',
    JSON.stringify(base.exos.map((e) => e.exercise_slug + '@' + e.rang)));
  ok('la carte montre l’aperçu', /Push/.test(await texte('#liste-routines')) && /3 exercices/.test(await texte('#liste-routines')),
    (await texte('#liste-routines')).replace(/\n+/g, ' | '));
  const envoyees = base.envois.flatMap((e) => Array.isArray(e.corps) ? e.corps : [e.corps])
    .flatMap((c) => Object.keys(c || {}));
  // ⚠️ `charge_cible_kg` EST LA SEULE EXCEPTION, ET ELLE EST NOMMÉE. Tout autre
  // nom qui ressemble à une charge est une charge observée, et n'a rien à faire
  // dans une routine (§7 quindecies.3).
  ok('rien qui ressemble à une charge OBSERVÉE n’est parti',
    !envoyees.filter((k) => k !== 'charge_cible_kg').some((k) => /charge|poids|kg|weight|rm\b/i.test(k)),
    Array.from(new Set(envoyees)).join(', '));
  ok('et les trois exercices ont chacun UNE ligne programmée, vide',
    base.series.length === 3 && base.series.every((x) => x.rang === 1 &&
      x.type_serie === 'travail' && x.reps_visees === null && x.charge_cible_kg === null),
    JSON.stringify(base.series.map((x) => x.rang + ':' + x.type_serie)));

  console.log('\n══ 5. RÉORDONNER ET RETIRER AU MILIEU ══');
  await ouvrirRoutine();
  // ⚠️ ADRESSÉ PAR INDICE DE CARTE, PAS PAR POSITION DANS LE DOM. Le chantier
  // 28 intercale un lien de superset entre deux cartes : `nth-child(3)` ne
  // désigne plus la troisième carte mais le deuxième lien.
  await deplacerCarte(2, 'haut');
  ok('à l’écran : le 3e est remonté', JSON.stringify(await noms()) ===
    JSON.stringify(['Squat (Barre)', 'Soulevé de Terre (Barre)', 'Développé Couché (Barre)']), JSON.stringify(await noms()));
  await enregistrer();
  const apres = base.exos.slice().sort((a, b) => a.rang - b.rang);
  ok('en base : l’ordre a suivi, rangs 0/1/2 sans trou',
    JSON.stringify(apres.map((e) => e.exercise_slug)) === '["squat-barre","souleve-terre","dc-barre"]' &&
    JSON.stringify(apres.map((e) => e.rang)) === '[0,1,2]',
    JSON.stringify(apres.map((e) => e.exercise_slug + '@' + e.rang)));

  await ouvrirRoutine();
  await gesteCarte(1, 'Supprimer l');
  await enregistrer();
  const apres2 = base.exos.slice().sort((a, b) => a.rang - b.rang);
  ok('retrait du MILIEU : les rangs se resserrent',
    JSON.stringify(apres2.map((e) => e.rang)) === '[0,1]',
    JSON.stringify(apres2.map((e) => e.exercise_slug + '@' + e.rang)));

  console.log('\n══ 5 bis. LE REPOS RESTE MODIFIABLE DANS LA ROUTINE ══');
  //
  // Vérification demandée au chantier 26 : le repos se change EN SÉANCE
  // (§7 septies.2) sans que la routine cesse d'être l'endroit où il se
  // prescrit. Les deux chemins doivent coexister.
  await ouvrirRoutine();
  // ⚠️ LE REPOS SE CHOISIT À LA MOLETTE (§7 sexdecies), plus au pavé.
  //
  // Le chantier 44 a retiré la duplication que le 42 avait laissée : un pavé de
  // décalage ici, une grille de huit valeurs en séance, pour la même question.
  // Il n'en reste qu'un écran — et le pavé reste sur les lignes de DURÉE, où la
  // valeur est arbitraire (non-régression, section 11).
  //
  // On amène la molette sur une valeur comme un pouce le ferait : en la faisant
  // défiler. `scroll-snap` arrête toujours la piste sur un multiple de la
  // hauteur d'une entrée, donc le rang EST le quotient.
  const reglerRepos = async (secondes) => {
    await page.evaluate((v) => {
      const p = document.querySelector('#feuille-contenu .molette .piste');
      const opts = Array.from(p.querySelectorAll('.opt'));
      const i = opts.findIndex((o) => Number(o.dataset.v) === v);
      p.scrollTop = i * 48;
      p.dispatchEvent(new Event('scroll'));
    }, secondes);
    // 135 — la molette a pris la valeur quand l'entrée centrée (`.sel`) la porte.
    await jusqua('molette sur ' + secondes + ' s', () => page.evaluate((v) => {
      const o = document.querySelector('#feuille-contenu .molette .opt.sel');
      return !!o && Number(o.dataset.v) === v;
    }, secondes));
  };
  const lireCentre = () => page.evaluate(() =>
    (document.querySelector('#feuille-contenu .molette .opt.sel') || {}).textContent || '');
  const molette = (sel) => page.evaluate((s) =>
    document.querySelectorAll('#feuille-contenu .molette ' + s).length, sel);
  const sortie = async (classe) => {
    await page.click('#feuille-contenu .feuille-pied .' + classe);
    // 135 — la feuille s'est refermée, et la carte est peinte.
    await jusqua('feuille refermée (' + classe + ')', () => feuilleFermee(page));
    await rendu(page);
  };
  // ⚠️ LE REPOS S'OUVRE PAR SON BOUTON, PLUS PAR LE MENU (chantier 43). C'est
  // celui de la séance, sous le nom de l'exercice : la même chose se touche au
  // même endroit sur les deux écrans, et « Modifier les paramètres » aurait
  // été un second chemin, plus long, vers le même réglage.
  const ouvrirRepos = async (i) => {
    await page.evaluate((k) => { document.querySelectorAll('.repos-cible')[k].click(); }, i);
    // 135 — la feuille du repos est ouverte quand sa molette porte ses valeurs.
    await jusqua('molette ouverte', () => page.evaluate(() => !document.getElementById('feuille-seance').hidden &&
      document.querySelectorAll('#feuille-contenu .molette .opt').length > 0));
  };
  const remplirRepos = async (secondes) => {
    await ouvrirRepos(0);
    await reglerRepos(secondes);
    await sortie('pri');
  };
  await ouvrirRepos(0);
  const bornes = await page.evaluate(() => {
    const o = Array.from(document.querySelectorAll('#feuille-contenu .molette .opt'));
    return { n: o.length, premier: o[0].textContent, dernier: o[o.length - 1].textContent };
  });
  ok('[44] la feuille du repos porte la MOLETTE — 36 valeurs, de 5 s à 5:00',
    bornes.n === 36 && bornes.premier === '5 s' && bornes.dernier === '5:00',
    JSON.stringify(bornes));
  // ⚠️ ET PLUS AUCUN PAVÉ ICI. C'est la duplication qui disparaît : il y avait
  // deux systèmes pour la même question.
  ok('[44] et aucun pavé de décalage ne subsiste dans cette feuille',
    (await page.evaluate(() =>
      document.querySelectorAll('#feuille-contenu .chrono input').length)) === 0,
    'pavés = ' + (await page.evaluate(() =>
      document.querySelectorAll('#feuille-contenu .chrono input').length)));
  // ⚠️ LA BORNE EST DANS LA LISTE, PLUS DANS UN REFUS. La molette ne peut pas
  // produire une valeur hors bornes : 0:04 et 30:01 ne s'y trouvent tout
  // simplement pas. C'est plus fort qu'un message d'erreur — il n'y a rien à
  // refuser à l'enregistrement.
  ok('[44] zéro n’est pas dans la liste : « désactivé » ne peut pas se confondre',
    (await page.evaluate(() => Array.from(
      document.querySelectorAll('#feuille-contenu .molette .opt'))
      .some((o) => Number(o.dataset.v) <= 0))) === false,
    'aucune valeur <= 0');
  await sortie('sec');
  // CONFIGURATION DISCRIMINANTE : 3:30 franchit la minute — « 3:30 » et « 330 »
  // ne sont pas la même chose, et c'est ce qui a laissé passer la régression du
  // chantier 42.
  await remplirRepos(210);
  await enregistrer();
  const premierExo = base.exos.slice().sort((a, b) => a.rang - b.rang)[0];
  ok('[42] « 3 3 0 » part en base à 210 secondes, pas à 330',
    premierExo.repos_cible_s === 210,
    'repos_cible_s = ' + premierExo.repos_cible_s);

  // ⚠️ LA NOTE DE ROUTINE SURVIT À UNE RÉÉCRITURE DE L'ÉDITEUR.
  //
  // `routine_exercises.note` est posée par la FIN DE SÉANCE, jamais par
  // l'éditeur. Jusqu'au chantier 27 elle était protégée par OMISSION — hors de
  // `CHAMPS_EXERCICE`, donc jamais écrite. Depuis le chantier 28 elle y est
  // (l'éditeur doit écrire `groupe_superset`, et les deux vont ensemble) : la
  // protection est maintenant que le BROUILLON la transporte. Ce test garde la
  // même garantie, sur un mécanisme différent — c'est lui qui dirait qu'on l'a
  // perdue.
  premierExo.note = 'Ceinture, barre basse';
  await aller('/saisie');
  await ouvrirRoutine();
  await remplirRepos(195);        // 3:15
  await enregistrer();
  const apresEditeur = base.exos.filter((e) => e.id === premierExo.id)[0];
  ok('la note de la ligne de routine n’est PAS écrasée par l’éditeur',
    apresEditeur.note === 'Ceinture, barre basse' && apresEditeur.repos_cible_s === 195,
    JSON.stringify({ note: apresEditeur.note, repos: apresEditeur.repos_cible_s }));

  console.log('\n══ 5 quater. REPS SUR LA CARTE, REPOS EN mm:ss ══');
  //
  // §7 quaterdecies — constaté sur device après le chantier 41 : « c'est moins
  // intuitif qu'avant de faire une routine ». Il fallait ouvrir la feuille pour
  // remplir un champ qu'on remplit toujours, et le repos se demandait en
  // secondes brutes alors que le pavé de décalage existe depuis le chantier 25.

  await ouvrirRoutine();
  // ⚠️ LES COLONNES DE L'ÉCRAN DE SÉANCE, MOINS DEUX (§7 quindecies.2).
  const colonnes = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.cols-seance span'))
      .map((x) => x.textContent));
  ok('[43] la ligne porte la charge de départ et REPS — sans `PRÉC.`, sans coche, sans effort',
    JSON.stringify(await colonnes()) === '["","DÉPART (KG)","REPS",""]' &&
    (await page.evaluate(() => document.querySelectorAll('.prec, .ok-serie, .eff-serie').length)) === 0,
    JSON.stringify(await colonnes()));
  const reposCarte = async (i) => (await exos())[i].repos;
  ok('[43] et le repos se LIT sous le nom, en mm:ss, au même bouton qu’en séance',
    /^repos \d+:\d\d$/.test(await reposCarte(0)), '« ' + (await reposCarte(0)) + ' »');

  // ⚠️ TOUT SE TAPE SUR LA LIGNE, SANS OUVRIR AUCUNE FEUILLE. C'était le
  // reproche du chantier 42 (« c'est moins intuitif qu'avant »), et le §7
  // quindecies le règle en supprimant la feuille, pas en la raccourcissant.
  //
  // ⚠️ ADRESSÉ PAR BLOC, PAS PAR EXERCICE : dans un superset, les lignes sont
  // ENTRELACÉES, et « la 2ᵉ ligne du bloc » n'est pas « la 2ᵉ série de A ».
  // Cette section ne travaille que sur des blocs d'un seul, où les deux
  // coïncident ; la section superset, elle, lit les étiquettes.
  const lignes = (b) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.ligne-serie'))
      .map((l) => ({
        badge: l.querySelector('.no-serie').textContent,
        kg: (l.querySelector('.ch-serie input') || {}).value,
        reps: (l.querySelector('.rp-serie input') || {}).value
      })), b);
  const saisirLigne = async (b, j, champ, valeur) => {
    await page.evaluate(([k, r, c, v]) => {
      const l = document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.ligne-serie')[r];
      const champ = l.querySelector(c === 'kg' ? '.ch-serie input' : '.rp-serie input');
      champ.value = v;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    }, [b, j, champ, valeur]);
    // 135 — le gestionnaire d'`input` est synchrone : l'écran peint suffit (ce qui part sur le disque ou en
    // base s'attend là où un contrôle le lit).
    await rendu(page);
  };
  const ajouterSerie = async (b) => {
    const avant = await page.evaluate((k) =>
      document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.ligne-serie').length, b);
    await page.evaluate((k) => {
      document.querySelectorAll('.bloc-seance')[k].querySelector('.ajout-serie button').click();
    }, b);
    // 135 — une ligne de plus dans CE bloc.
    await jusqua('série ajoutée', async () => (await page.evaluate((k) =>
      document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.ligne-serie').length, b)) === avant + 1);
    await rendu(page);
  };

  // ⚠️ IL N'Y A PLUS DE CHAMP « NOMBRE DE SÉRIES ». On n'écrit plus « 3 », on
  // ajoute trois lignes — comme en séance. C'est le cœur du chantier, et un
  // banc qui taperait encore dans un champ ne le mesurerait pas.
  ok('[43] un exercice neuf naît avec UNE ligne, pas trois',
    (await lignes(0)).length === 1, JSON.stringify(await lignes(0)));

  // ⚠️ ON REMPLIT AVANT D'AJOUTER, et c'est la mutation M26 qui l'a imposé.
  //
  // « + Série » RECOPIE la ligne précédente : c'est ce qui fait que programmer
  // « 5, 5, 5 » coûte trois taps et non trois saisies. Sur des lignes VIDES,
  // « recopie la précédente » et « pose une ligne vide » donnent exactement le
  // même écran — le banc comptait les lignes et se déclarait satisfait, et la
  // recopie pouvait disparaître sans qu'une seule assertion bouge.
  await saisirLigne(0, 0, 'reps', '12');
  await saisirLigne(0, 0, 'kg', '60');
  await ajouterSerie(0);
  ok('[43] « + Série » RECOPIE la précédente — trois taps pour trois séries',
    JSON.stringify(await lignes(0)) ===
      JSON.stringify([{ badge: '1', kg: '60', reps: '12' },
                      { badge: '2', kg: '60', reps: '12' }]),
    JSON.stringify(await lignes(0)));
  await ajouterSerie(0);
  ok('[43] et une troisième suit, toujours par recopie',
    (await lignes(0)).length === 3, JSON.stringify(await lignes(0)));

  // ⚠️ DES REPS DISTINCTES — LA CONFIGURATION DISCRIMINANTE. Trois lignes à 8
  // rendent « lire chaque ligne » et « répéter la première » indistinguables.
  await saisirLigne(0, 1, 'reps', '10');
  await saisirLigne(0, 2, 'reps', '8');
  await saisirLigne(0, 2, 'kg', '');
  await enregistrer();
  const exo0 = () => base.exos.slice().sort((a, b) => a.rang - b.rang)[0];
  const series0 = () => base.series.filter((x) => x.routine_exercise_id === exo0().id)
    .slice().sort((a, b) => a.rang - b.rang);
  ok('[43] trois lignes partent en base, rangs 1/2/3 — et le rang commence à 1',
    series0().length === 3 && JSON.stringify(series0().map((x) => x.rang)) === '[1,2,3]',
    JSON.stringify(series0().map((x) => x.rang)));
  ok('[43] chaque ligne porte SES reps, pas celles de la première',
    JSON.stringify(series0().map((x) => x.reps_visees)) === '[12,10,8]',
    JSON.stringify(series0().map((x) => x.reps_visees)));
  // ⚠️ 60 · 60 · VIDE : les deux premières par RECOPIE, la troisième EFFACÉE à
  // la main. Le trou compte autant que les valeurs — c'est lui qui prouve que
  // la charge se programme LIGNE PAR LIGNE, et qu'un champ vidé part bien à
  // NULL plutôt que de garder la valeur recopiée.
  ok('[43] la charge CIBLE se programme par ligne, et un champ vidé part à NULL',
    JSON.stringify(series0().map((x) => x.charge_cible_kg)) === '[60,60,null]',
    JSON.stringify(series0().map((x) => x.charge_cible_kg)));

  // ⚠️ ET ELLES SE RELISENT DANS L'ORDRE DES RANGS, pas dans celui du serveur.
  // Le banc les rend à l'envers exprès (voir le GET) : sans tri côté app, la
  // rampe s'afficherait 8-10-12 et la routine dirait le contraire de ce qu'elle
  // fait. C'est le genre d'écart qu'on ne voit qu'au rechargement.
  await aller('/saisie');
  await ouvrirRoutine();
  ok('[43] rouvertes, les lignes sont dans l’ordre des RANGS, pas du serveur',
    JSON.stringify((await lignes(0)).map((l) => l.reps)) === '["12","10","8"]',
    JSON.stringify((await lignes(0)).map((l) => l.reps)));
  ok('[43] et la charge cible suit la même ligne qu’avant',
    JSON.stringify((await lignes(0)).map((l) => l.kg)) === '["60","60",""]',
    JSON.stringify((await lignes(0)).map((l) => l.kg)));
  ok('[43] et `routine_exercises` n’a reçu ni `series` ni `reps_visees`',
    exo0().series === undefined && exo0().reps_visees === undefined,
    JSON.stringify(Object.keys(exo0())));

  // ⚠️ LES TROIS SORTIES DE LA MOLETTE (§7 sexdecies.3), et elles ne disent pas
  // la même chose. C'est tout l'intérêt de les avoir séparées : « Valider »,
  // « Annuler » et « Désactiver » produisent trois états différents, et deux
  // d'entre eux passent par la même valeur nulle côté pavé.
  //
  // On est DÉJÀ dans l'éditeur (la relecture ci-dessus y est entrée) : y
  // re-rentrer par la carte échouerait, la bibliothèque n'étant plus à l'écran.
  await ouvrirRepos(0);
  await reglerRepos(90);
  ok('[44] la molette se centre sur la valeur qu’on amène', (await lireCentre()) === '1:30',
    '« ' + (await lireCentre()) + ' »');
  // ── ANNULER : rien ne bouge, pas même à l'écran ────────────────────────
  const reposAvant = await reposCarte(0);
  await sortie('sec');
  ok('[44] Annuler ne change RIEN — ni la carte, ni le brouillon',
    (await reposCarte(0)) === reposAvant, '« ' + reposAvant + ' » → « ' + (await reposCarte(0)) + ' »');
  // ── VALIDER : la valeur centrée, et elle suit tout de suite ────────────
  await ouvrirRepos(0);
  await reglerRepos(90);
  await sortie('pri');
  ok('[44] Valider pose la valeur centrée, et la carte suit',
    (await reposCarte(0)) === 'repos 1:30', '« ' + (await reposCarte(0)) + ' »');
  await enregistrer();
  ok('[44] 90 secondes en base', exo0().repos_cible_s === 90,
    'repos_cible_s = ' + exo0().repos_cible_s);

  // Rechargement : ce qui est stocké se recentre sous la fenêtre.
  await aller('/saisie');
  await ouvrirRoutine();
  await ouvrirRepos(0);
  ok('[44] rouverte, la molette repart de 1:30 — jamais d’un « 90 » brut',
    (await lireCentre()) === '1:30', '« ' + (await lireCentre()) + ' »');

  // ── DÉSACTIVER : `NULL`, jamais zéro ──────────────────────────────────
  await sortie('des');
  ok('[44] Désactiver met la carte au tiret, tout de suite',
    (await reposCarte(0)) === 'repos —', '« ' + (await reposCarte(0)) + ' »');
  await enregistrer();
  ok('[44] et la base reçoit NULL, pas zéro',
    exo0().repos_cible_s === null, 'repos_cible_s = ' + JSON.stringify(exo0().repos_cible_s));

  // Sans repos programmé, la molette se pose sur 1:30 — visiblement, et rien
  // n'est écrit tant qu'on n'a pas validé.
  await ouvrirRoutine();
  await ouvrirRepos(0);
  ok('[44] sans repos, elle se pose sur 1:30 et n’écrit rien avant Valider',
    (await lireCentre()) === '1:30', '« ' + (await lireCentre()) + ' »');
  await sortie('sec');
  ok('[44] …et Annuler la laisse désactivée', (await reposCarte(0)) === 'repos —',
    '« ' + (await reposCarte(0)) + ' »');
  await remplirRepos(90);
  await enregistrer();

  // On rend l'écran à la bibliothèque : la section suivante y entre par la carte.
  await aller('/saisie');

  console.log('\n══ 5 ter. LE SUPERSET SE FABRIQUE DANS L’ÉDITEUR ══');
  //
  // §1.3 du chantier 28 : constaté sur device, « l'éditeur de routine ignore
  // les supersets ». Il n'existait AUCUN chemin dans l'app pour en fabriquer
  // un — les routines de test avaient été groupées directement en base. C'est
  // ce chemin-là que cette section parcourt du premier lien à la relecture.
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : TROIS exercices, et
  // le lien posé AU MILIEU. Sur deux exercices, « le lien groupe la paire » et
  // « le bouton groupe toute la liste » rendent exactement le même écran : il
  // faut un troisième, laissé DEHORS, pour que la différence existe. Et c'est
  // le lien du MILIEU qu'on pose : poser celui du bord ne distinguerait pas
  // « le lien relie deux voisins » de « le lien relie le premier au reste ».
  await ouvrirRoutine();
  await chercherExo('curl', /^Curl/);
  await prendreResultat();

  const lettresEditeur = async () => (await exos()).map((x) => x.lettre);
  // ⚠️ LE LIEN N'A PLUS DE BOUTON À LUI (§7 duodecies.2) : il se lit sur le
  // LISERÉ de la carte, exactement comme au détail de séance, et il se pose par
  // le menu. On mesure donc ce qui reste visible — le groupement — et non plus
  // la commande qui le produisait.
  const groupesEditeur = async () => (await exos()).map((x) => x.groupe);
  const cliquerLien = async (i) => { await gesteCarte(i, 'Grouper avec le suivant'); };
  const degrouperCarte = async (i) => { await gesteCarte(i, '^Dégrouper$'); };
  const enBase = () => base.exos.slice().sort((a, b) => a.rang - b.rang)
    .map((e) => e.groupe_superset);

  ok('trois exercices, aucun groupé',
    JSON.stringify(await groupesEditeur()) === '[false,false,false]' &&
    JSON.stringify(await lettresEditeur()) === '["","",""]',
    JSON.stringify(await groupesEditeur()) + ' · ' + JSON.stringify(await lettresEditeur()));

  // ⚠️ LES CINQ GESTES, ET L'ASYMÉTRIE QUI LES MESURE. Sur le PREMIER exercice
  // d'une liste de trois, « Monter » et « Dégrouper » n'ont pas de sens et sont
  // GRISÉS ; les trois autres sont actifs. Un menu où tout serait actif, ou
  // tout grisé, ne prouverait rien.
  await menuCarte(0);
  // ⚠️ QUATRE DEPUIS LE CHANTIER 46 : « Monter » et « Descendre » ont fusionné
  // en « Réorganiser… » (§7 vicies.1). Réordonner n'est presque jamais un geste
  // isolé ; deux entrées qui bougeaient d'un cran chacune ne le disaient pas.
  // 60-3 (ES §7 quindecies.8) — « Remplacer » en tête : cinq entrées. 60-4 (ES §7 quindecies.9) — « Je n'en veux pas »
  // juste après : six.
  ok('[46] le menu porte « Remplacer » (60-3), « Je n’en veux pas » (60-4) et QUATRE gestes — Monter/Descendre ont fusionné',
    (await entreesMenu()).length === 6 &&
    (await entreesMenu())[0] === 'Remplacer' &&
    (await entreesMenu())[1] === 'Je n’en veux pas' &&
    /Grouper avec le suivant/.test((await entreesMenu())[2]) &&
    /Réorganiser/.test((await entreesMenu())[4]) &&
    /Supprimer l/.test((await entreesMenu())[5]) &&
    !(await entreesMenu()).some((e) => /param/i.test(e)) &&
    !(await entreesMenu()).some((e) => /^Monter|^Descendre/.test(e)),
    (await entreesMenu()).join(' | '));
  ok('[41] et il grise ce qui n’a pas de sens sur le premier : Dégrouper',
    (await entreesMenu())[3] === 'Dégrouper (inerte)' &&
    (await entreesMenu())[4] === 'Réorganiser…',
    (await entreesMenu()).join(' | '));
  await page.click('#btn-fermer-feuille');
  await jusqua('feuille fermée', () => feuilleFermee(page));

  // Le lien du MILIEU : les deux DERNIERS se groupent, le premier reste dehors.
  await cliquerLien(1);
  ok('le lien du milieu groupe les deux derniers, et EUX SEULS',
    JSON.stringify(await groupesEditeur()) === '[false,true,true]' &&
    JSON.stringify(await lettresEditeur()) === '["","A","B"]',
    JSON.stringify(await lettresEditeur()));
  await menuCarte(1);
  ok('[41] une fois groupé, « Grouper » se grise et « Dégrouper » s’ouvre',
    (await entreesMenu())[2] === 'Grouper avec le suivant (inerte)' &&
    (await entreesMenu())[3] === 'Dégrouper',
    (await entreesMenu()).join(' | '));
  await page.click('#btn-fermer-feuille');
  await jusqua('feuille fermée', () => feuilleFermee(page));

  await enregistrer();
  ok('`groupe_superset` part en base — un numéro pour la paire, rien pour l’autre',
    JSON.stringify(enBase()) === '[null,1,1]', JSON.stringify(enBase()));

  // ⚠️ LA RELECTURE. Écrire le groupe et le RELIRE sont deux choses : jusqu'au
  // chantier 28 l'éditeur ne transportait pas `groupe_superset`, et un simple
  // aller-retour l'effaçait sans rien dire.
  await ouvrirRoutine();
  ok('rouvert, l’éditeur RETROUVE le superset',
    JSON.stringify(await groupesEditeur()) === '[false,true,true]' &&
    JSON.stringify(await lettresEditeur()) === '["","A","B"]',
    JSON.stringify(await lettresEditeur()));

  // ⚠️ §7 decies — UN SUPERSET À DEUX SE DISSOUT QUAND ON EN SORT UN. Il
  // n'existe pas de groupe à un : sortir B doit laisser B ET C seuls, pas C
  // tout seul dans un groupe. C'est la configuration discriminante — sur un
  // superset à trois, le reste formerait encore un groupe.
  await degrouperCarte(1);
  ok('[41] dégrouper un superset à DEUX le dissout entièrement',
    JSON.stringify(await groupesEditeur()) === '[false,false,false]' &&
    JSON.stringify(await lettresEditeur()) === '["","",""]',
    JSON.stringify(await groupesEditeur()) + ' · ' + JSON.stringify(await lettresEditeur()));
  await cliquerLien(1);   // on le repose, la suite l'attend groupé

  // ⚠️ ASSERTION RETOURNÉE AU CHANTIER 46, ET C'EST UN GAIN.
  //
  // Elle exigeait qu'un déplacement COUPE le superset : l'éditeur échangeait
  // deux EXERCICES voisins (`echanger`), donc descendre le premier le posait
  // ENTRE les deux branches et rompait l'adjacence. La séance, elle, déplace le
  // BLOC entier depuis le chantier 28 — les deux écrans disaient donc deux
  // choses différentes du même geste, et c'est l'éditeur qui avait tort.
  //
  // Depuis le §7 vicies, les deux partagent le mode, le repli et la règle :
  // **un superset se déplace d'un tenant**. Le couper reste possible, par
  // « Dégrouper » — un geste qui le DIT, au lieu d'un effet de bord du
  // déplacement.
  await deplacerCarte(0, 'bas');
  ok('[46] déplacer un bloc ne coupe plus le superset — il voyage entier',
    JSON.stringify(await groupesEditeur()) === '[true,true,false]' &&
    JSON.stringify(await lettresEditeur()) === '["A","B",""]',
    JSON.stringify(await lettresEditeur()));
  await deplacerCarte(1, 'haut');
  ok('[46] …et le retour le laisse intact, à sa place d’origine',
    JSON.stringify(await groupesEditeur()) === '[false,true,true]' &&
    JSON.stringify(await lettresEditeur()) === '["","A","B"]',
    JSON.stringify(await lettresEditeur()));

  // Les trois d'un coup, puis l'écriture : un superset à TROIS, le cas que le
  // chantier 27 avait validé sur device et que l'éditeur ne savait pas produire.
  // Le lien 1 est déjà posé — il a survécu aux deux déplacements ci-dessus —,
  // il ne reste donc que le premier à poser.
  await cliquerLien(0);
  ok('les deux liens posés : un seul bloc de trois, A/B/C',
    JSON.stringify(await lettresEditeur()) === '["A","B","C"]',
    JSON.stringify(await lettresEditeur()));
  await enregistrer();
  ok('en base : UN numéro pour les trois, et les rangs tiennent',
    JSON.stringify(enBase()) === '[1,1,1]' &&
    JSON.stringify(base.exos.slice().sort((a, b) => a.rang - b.rang).map((e) => e.rang)) === '[0,1,2]',
    JSON.stringify(base.exos.slice().sort((a, b) => a.rang - b.rang)
      .map((e) => e.exercise_slug + '@' + e.rang + '#' + e.groupe_superset)));

  // ⚠️ §7 decies — UN GROUPE À UN SEUL EXERCICE, TEL QU'IL EXISTE EN BASE.
  //
  // 13 blocs dans cet état ont été trouvés et nettoyés par `v2_041` (49 séries,
  // 12 séances, 3 comptes). Une routine ancienne peut donc encore en porter un :
  // l'éditeur doit le DISSOUDRE à l'ouverture, sinon le premier enregistrement
  // le réécrit et l'état interdit revient par la porte de l'app.
  base.exos.slice().sort((a, b) => a.rang - b.rang).forEach((e, i) => {
    e.groupe_superset = i === 0 ? 9 : null;      // le premier, seul dans le groupe 9
  });
  await aller('/saisie');
  await ouvrirRoutine();
  ok('un groupe à UN seul exercice ne s’affiche pas comme un superset',
    JSON.stringify(await groupesEditeur()) === '[false,false,false]' &&
    JSON.stringify(await lettresEditeur()) === '["","",""]',
    JSON.stringify(await lettresEditeur()));
  await enregistrer();
  ok('et il est DISSOUS en base au premier enregistrement, pas réécrit',
    JSON.stringify(enBase()) === '[null,null,null]', JSON.stringify(enBase()));

  // On rend la routine à l'état où la suite du banc l'attend : deux exercices,
  // sans superset. Le §6 compte les lignes, pas les groupes.
  await ouvrirRoutine();
  await gesteCarte(2, 'Supprimer l');
  await enregistrer();
  ok('remis à plat : deux exercices, aucun groupe',
    base.exos.length === 2 && JSON.stringify(enBase()) === '[null,null]',
    base.exos.length + ' exercice(s) · ' + JSON.stringify(enBase()));

  console.log('\n══ 6. NOM EN DOUBLON, PUIS SUPPRESSION ══');
  await nouvelleRoutine('#btn-nouvelle-routine');
  await page.fill('#champ-nom-routine', 'push  ');
  await enregistrer();
  ok('le doublon est refusé avec un message clair', /déjà une routine de ce nom/.test(await texte('#erreur-routine')), await texte('#erreur-routine'));
  ok('et on est resté sur l’éditeur, rien n’est perdu', page.url().includes('/routine/'), page.url().replace(BASE, ''));

  // ⚠️ LE NOM EST BORNÉ À LA SAISIE, PAS PAR LE SERVEUR. `routines_nom_court`
  // refuse au-delà de 60 caractères avec un 23514, code DÉFINITIF. Un champ qui
  // laisse taper 61 caractères fait donc bloquer l'entrée au lieu de la
  // corriger — c'est la même maladie que le chantier 36.
  const trop = 'x'.repeat(61);
  await page.fill('#champ-nom-routine', trop);
  const saisi = await page.evaluate(() => document.getElementById('champ-nom-routine').value);
  ok('[41] un nom de 61 caractères est refusé À LA SAISIE, pas par la base',
    saisi.length === 60, saisi.length + ' caractère(s) retenus sur 61');

  console.log('\n══ 6 bis. SUPPRIMER UNE ROUTINE QUI A DÉJÀ SERVI ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) : une routine QUI A SERVI — une
  // séance terminée qui en est issue, avec ses séries. Sur une routine jamais
  // utilisée, « les séances survivent » et « il n'y avait rien à casser » sont
  // indistinguables, et le test ne prouverait rien.
  await aller('/saisie');
  const routineQuiAServi = base.routines[0];
  base.sessions.push({
    id: 'sess-issue', user_id: 'u-banc', titre: 'Push du mardi',
    debut: '2026-09-10T10:00:00Z', fin: '2026-09-10T11:00:00Z', statut: 'terminee',
    note: null, salle: null, salle_norme: null, routine_id: routineQuiAServi.id,
    source: 'app', created_at: '2026-09-10T10:00:00Z'
  });
  base.sets.push({ id: 'set-issue', session_id: 'sess-issue', exercise_slug: 'squat-barre',
    charge_kg: 100, reps: 5, type_serie: 'travail', rang: 1 });
  const exosAvant = base.exos.filter((e) => e.routine_id === routineQuiAServi.id).length;
  ok('[41] la routine a bien servi : une séance terminée en est issue',
    exosAvant > 0 && base.sessions.filter((x) => x.routine_id === routineQuiAServi.id).length === 1,
    exosAvant + ' exercice(s) · ' + base.sessions.length + ' séance(s)');

  await ouvrirRoutine();
  ok('[41] le bouton dit « Supprimer », plus « Archiver »',
    (await texte('#btn-supprimer-routine')).trim() === 'Supprimer' &&
    (await page.evaluate(() => !!document.getElementById('btn-archiver-routine'))) === false,
    '« ' + (await texte('#btn-supprimer-routine')).trim() + ' »');

  await page.click('#btn-supprimer-routine');
  await jusqua('confirmation de suppression', menuOuvert);
  const conf = (await texte('#feuille-contenu')).replace(/\s+/g, ' ');
  ok('[41] il DEMANDE avant, et dit que les séances passées restent intactes',
    /Supprimer cette routine/.test(conf) && /restent intactes/.test(conf),
    conf.slice(0, 120));
  // ⚠️ « LIEN » EST LE MOT À NE PAS DIRE : une séance passée n'est pas liée à sa
  // routine, elle en est issue.
  ok('[41] et elle ne parle jamais de « lien »', !/lien|liée/i.test(conf), conf.slice(0, 90));

  // Annuler d'abord : une confirmation qui ne protège de rien n'en est pas une.
  await entree('Annuler');
  ok('[41] annuler ne supprime RIEN',
    base.routines.filter((r) => r.id === routineQuiAServi.id).length === 1,
    base.routines.length + ' routine(s)');

  await page.click('#btn-supprimer-routine');
  await jusqua('confirmation de suppression', menuOuvert);
  await entree('^Supprimer$');
  // 135 — la suppression a fini quand la bibliothèque est revenue, et le réseau s'est tu.
  await jusqua('suppression faite', () => vueVisible(page, 'vue-saisie'));
  await calme('après la suppression');
  ok('[41] confirmée, la routine quitte la base — pas d’archivage',
    base.routines.filter((r) => r.id === routineQuiAServi.id).length === 0,
    JSON.stringify(base.routines.map((r) => r.nom)));
  // §5 test 5 — la CASCADE, et elle a DEUX ÉTAGES depuis le chantier 43 :
  // `routine_exercises` part avec la routine, `routine_sets` part avec
  // l'exercice. Une série orpheline n'existe pas en base ; elle ne doit pas
  // exister ici non plus, sinon le banc validerait un état impossible.
  ok('[41] ses exercices partent avec elle, aucun orphelin',
    base.exos.filter((e) => e.routine_id === routineQuiAServi.id).length === 0,
    exosAvant + ' avant · ' + base.exos.length + ' ligne(s) restante(s) au total');
  ok('[43] et leurs séries programmées avec eux — cascade à deux étages',
    base.series.every((x) => base.exos.some((e) => e.id === x.routine_exercise_id)),
    base.series.length + ' série(s) restante(s), toutes rattachées');
  // §5 test 4 — le SET NULL. C'est la promesse de la confirmation.
  const seance = base.sessions.filter((x) => x.id === 'sess-issue')[0];
  ok('[41] LA SÉANCE PASSÉE SURVIT, avec ses séries — elle perd juste l’origine',
    !!seance && seance.routine_id === null && seance.titre === 'Push du mardi' &&
    base.sets.filter((x) => x.session_id === 'sess-issue').length === 1,
    JSON.stringify({ seance: !!seance, routine_id: seance && seance.routine_id,
                     series: base.sets.filter((x) => x.session_id === 'sess-issue').length }));
  ok('[41] et elle quitte la liste tout de suite',
    !new RegExp(routineQuiAServi.nom).test(await texte('#liste-routines')),
    (await texte('#liste-routines')).replace(/\n+/g, ' | ').slice(0, 80));

  console.log('\n══ 7. LE NOM REDEVIENT LIBRE ══');
  await nouvelleRoutine('#liste-routines .principal');
  await page.fill('#champ-nom-routine', 'Push');
  await chercherExo('curl', /^Curl/);
  await prendreResultat();
  await enregistrer();
  ok('« Push » est réutilisable après suppression',
    /Push/.test(await texte('#liste-routines')) && base.routines.length === 1,
    JSON.stringify(base.routines.map((r) => r.nom)));

  console.log('\n══ 7 bis. UNE ROUTINE ARCHIVÉE EN BASE ══');
  //
  // ⚠️ DEUX ROUTINES PORTENT ENCORE `archivee_a`, et plus rien ne l'écrira.
  // Archiver était irréversible depuis l'app : la colonne cessait d'être une
  // information et devenait une disparition. Décision du chantier 41 — elle ne
  // cache plus rien, et la routine redevient supprimable.
  base.routines.push({ id: 'r-vieille', user_id: 'u-banc', nom: 'Ancienne',
    note: null, archivee_a: '2026-01-01T00:00:00Z' });
  await aller('/saisie');
  ok('[41] une routine archivée en base REVIENT dans la bibliothèque',
    /Ancienne/.test(await texte('#liste-routines')),
    (await texte('#liste-routines')).replace(/\n+/g, ' | ').slice(0, 90));
  // ⚠️ MAIS ELLE NE RÉSERVE TOUJOURS PAS SON NOM : `routines_user_nom_actif_uniq`
  // est un index PARTIEL. Refuser localement ce que la base accepte bloquerait
  // un enregistrement pour rien.
  await nouvelleRoutine('#btn-nouvelle-routine');
  await page.fill('#champ-nom-routine', 'Ancienne');
  await chercherExo('curl', /^Curl/);
  await prendreResultat();
  await enregistrer();
  ok('[41] et son nom reste libre — l’index d’unicité est PARTIEL',
    !(await texte('#erreur-routine')).trim() &&
    base.routines.filter((r) => replie(r.nom) === 'ancienne').length === 2,
    '« ' + (await texte('#erreur-routine')).trim() + ' » · ' +
    JSON.stringify(base.routines.map((r) => r.nom + (r.archivee_a ? '*' : ''))));

  console.log('\n══ 7 ter. LE BROUILLON VIT SUR L’APPAREIL (§7 octodecies) ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) : un brouillon MODIFIÉ PUIS
  // QUITTÉ SANS ENREGISTRER, l'app rechargée entre les deux. Sur un brouillon
  // enregistré, « persisté » et « en mémoire » sont indistinguables — c'est
  // tout le sujet. `aller()` fait un `goto` complet : c'est bien l'app tuée et
  // rouverte, IndexedDB survivant au rechargement.
  //
  // ⚠️ ET C'EST LE SEUL BANC QUI PEUT LE MESURER. Un test unitaire voit les
  // règles pures (`brouillonReprenable`, `anciennete`) ; il ne voit pas
  // IndexedDB, ni le rechargement, ni le fait qu'AUCUNE requête ne part.
  const bandeau = (sel) => page.evaluate((x) =>
    (document.querySelector('#bandeau-reprise ' + x) || {}).textContent || '', sel);
  const bandeauVisible = () => page.evaluate(() => {
    const n = document.getElementById('bandeau-reprise');
    return !!n && !n.hidden && !!n.querySelector('.bandeau-reprise');
  });
  const brouillonEnBase = () => page.evaluate(() => new Promise((resoudre) => {
    const r = indexedDB.open('trainhub-v2');
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('brouillon')) { db.close(); return resoudre(null); }
      const q = db.transaction(['brouillon'], 'readonly').objectStore('brouillon').get('routine');
      q.onsuccess = () => { db.close(); resoudre(q.result ? q.result.valeur : null); };
      q.onerror = () => { db.close(); resoudre('ERREUR'); };
    };
    r.onerror = () => resoudre('ERREUR');
  }));

  await aller('/saisie');
  ok('[45] au départ, aucun brouillon et aucun bandeau',
    (await brouillonEnBase()) === null && (await bandeauVisible()) === false,
    'brouillon = ' + JSON.stringify(await brouillonEnBase()));

  // ── On commence une routine NEUVE et on la quitte sans enregistrer ──────
  // 135 — le repère se pose AVANT les gestes : posé après (comme avant), il ne voyait que ce qui partait
  // entre deux lignes du banc.
  const envoisAvant = base.envois.length;
  await nouvelleRoutine('#btn-nouvelle-routine');
  await page.fill('#champ-nom-routine', 'Brouillon du mardi');
  await page.evaluate(() => {
    document.getElementById('champ-nom-routine')
      .dispatchEvent(new Event('input', { bubbles: true }));
  });
  await rendu(page);
  await chercherExo('curl', /^Curl/);
  await prendreResultat();
  // 135 — l'état que lisent les deux contrôles : le brouillon posé sur le disque (avec son exercice), puis le
  // réseau qui se tait — ce qui aurait dû partir est parti.
  await jusqua('brouillon sur le disque', async () => {
    const b = await brouillonEnBase();
    return !!b && b !== 'ERREUR' && b.nom === 'Brouillon du mardi' && b.brouillon.exercices.length === 1;
  });
  await calme('brouillon : rien ne part');

  // 5. ⚠️ RIEN N'EST PARTI EN BASE. Une routine en cours d'édition n'a rien à
  // faire sur le serveur, et `routines_nom_court` refuserait un nom vide le
  // temps de le taper.
  ok('[45] modifier un brouillon n’envoie RIEN au serveur',
    base.envois.length === envoisAvant,
    (base.envois.length - envoisAvant) + ' envoi(s) depuis la modification');
  const surDisque = await brouillonEnBase();
  ok('[45] mais il est sur le DISQUE, avec son nom et son exercice',
    !!surDisque && surDisque.nom === 'Brouillon du mardi' &&
    surDisque.brouillon.exercices.length === 1 && !!surDisque.modifie_a,
    JSON.stringify(surDisque && { nom: surDisque.nom,
      exos: surDisque.brouillon.exercices.length, quand: !!surDisque.modifie_a }));

  // 4. ⚠️ L'APP TUÉE ET ROUVERTE. C'est la configuration discriminante.
  await aller('/saisie');
  ok('[45] rouverte, l’app SIGNALE le brouillon — elle ne l’a ni perdu ni enregistré',
    (await bandeauVisible()) === true &&
    /Routine en cours/.test(await bandeau('.reprise-quoi')) &&
    (await bandeau('.reprise-sujet')) === 'Brouillon du mardi',
    (await texte('#bandeau-reprise')).replace(/\s+/g, ' '));
  // 8. L'ancienneté est là, et elle est juste : on vient de le modifier.
  ok('[45] et il dit depuis quand', /instant|min/.test(await bandeau('.reprise-depuis')),
    '« ' + (await bandeau('.reprise-depuis')) + ' »');
  ok('[45] la routine n’est PAS dans la bibliothèque — rien n’a été enregistré',
    !/Brouillon du mardi/.test(await texte('#liste-routines')),
    (await texte('#liste-routines')).replace(/\n+/g, ' | ').slice(0, 80));

  // ── « Reprendre » restitue tout ────────────────────────────────────────
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#bandeau-reprise button'))
      .filter((b) => /Reprendre/.test(b.textContent))[0].click();
  });
  // 135 — l'éditeur rouvert, son nom posé (c'est ce que lit le contrôle, avec le nombre d'exercices).
  await jusqua('brouillon repris', editeurOuvert);
  await rendu(page);
  const repris = await page.evaluate(() => ({
    vue: Array.from(document.querySelectorAll('main > section')).filter((s) => !s.hidden).map((s) => s.id),
    nom: document.getElementById('champ-nom-routine').value,
    exos: document.querySelectorAll('.legende-exo').length
  }));
  ok('[45] « Reprendre » rouvre l’éditeur avec le nom ET l’exercice',
    JSON.stringify(repris.vue) === '["vue-routine"]' &&
    repris.nom === 'Brouillon du mardi' && repris.exos === 1,
    JSON.stringify(repris));

  // 9. ⚠️ LE TAP SUR UN NOM EST REBRANCHÉ (§7 octodecies.4), et le retour
  // restitue le brouillon. C'est LE geste que le chantier 43 avait retiré
  // faute de persistance : consulter l'historique d'un exercice pendant qu'on
  // construit une routine est le moment où l'on décide combien de séries y
  // mettre.
  await page.evaluate(() => { document.querySelector('.legende-exo .nom-exo').click(); });
  await jusqua('page de l’exercice', () => vueVisible(page, 'vue-exercice'));
  await rendu(page);
  ok('[45] taper le nom d’un exercice ouvre SA page',
    JSON.stringify(await visible()) === '["vue-exercice"]' && /exercice\//.test(page.url()),
    JSON.stringify(await visible()) + ' · ' + page.url().replace(BASE, ''));
  await page.goBack({ waitUntil: 'networkidle' }).catch(() => {});
  // 135 — le retour a restitué l'éditeur quand sa vue est revenue avec le nom du brouillon.
  await jusqua('retour à l’éditeur', editeurOuvert);
  await rendu(page);
  const apresRetour = await page.evaluate(() => ({
    vue: Array.from(document.querySelectorAll('main > section')).filter((s) => !s.hidden).map((s) => s.id),
    nom: (document.getElementById('champ-nom-routine') || {}).value,
    exos: document.querySelectorAll('.legende-exo').length
  }));
  ok('[45] et le retour restitue l’éditeur, brouillon INTACT',
    JSON.stringify(apresRetour.vue) === '["vue-routine"]' &&
    apresRetour.nom === 'Brouillon du mardi' && apresRetour.exos === 1,
    JSON.stringify(apresRetour));

  // 6. ⚠️ ENREGISTRER CONSOMME LE BROUILLON. Un bandeau qui proposerait de
  // « reprendre » ce qui vient d'être enregistré ferait douter de
  // l'enregistrement lui-même.
  await enregistrer();
  ok('[45] enregistrer CONSOMME le brouillon — plus rien sur le disque',
    (await brouillonEnBase()) === null, JSON.stringify(await brouillonEnBase()));
  ok('[45] …et plus de bandeau, la routine est dans la bibliothèque',
    (await bandeauVisible()) === false &&
    /Brouillon du mardi/.test(await texte('#liste-routines')),
    'bandeau = ' + (await bandeauVisible()));

  // 7. ── ABANDONNER : le brouillon part, rien n'est écrit ────────────────
  // ⚠️ PAR SON NOM, PAS PAR SA POSITION. La bibliothèque est triée par nom
  // replié : « Ancienne » passe devant, et elle n'a aucun exercice — donc
  // aucun bouton de repos à toucher.
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#liste-routines .routine'))
      .filter((c) => /Brouillon du mardi/.test(c.textContent))[0].click();
  });
  await jusqua('ouvrir « Brouillon du mardi »', editeurOuvert);
  await ouvrirRepos(0);
  await sortie('pri');
  // 135 — la modification est sur le disque (le brouillon de CETTE routine) avant le rechargement qui la teste.
  await jusqua('brouillon de la routine existante sur le disque', async () => {
    const b = await brouillonEnBase();
    return !!b && b !== 'ERREUR' && b.nom === 'Brouillon du mardi';
  });
  await aller('/saisie');
  // ⚠️ LE REPÈRE SE POSE APRÈS LE RECHARGEMENT, PAS AVANT. Un `goto` relance
  // l'app, et la vidange de file au démarrage peut légitimement envoyer ce qui
  // attendait d'une section précédente. Ce qu'on mesure ici est l'ABANDON :
  // mêler les deux ferait échouer le test pour une raison qui n'est pas la
  // sienne — et on ne saurait pas laquelle.
  const envoisAvantAbandon = base.envois.length;
  ok('[45] une modification sur une routine EXISTANTE se signale aussi',
    (await bandeauVisible()) === true, (await texte('#bandeau-reprise')).replace(/\s+/g, ' '));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#bandeau-reprise button'))
      .filter((b) => /Abandonner/.test(b.textContent))[0].click();
  });
  await jusqua('confirmation d’abandon', menuOuvert);
  // ⚠️ IL DEMANDE D'ABORD. Un brouillon de trois jours ne s'efface pas au
  // premier tap : c'est la même confirmation que la suppression d'une routine.
  const confAbandon = (await texte('#feuille-contenu')).replace(/\s+/g, ' ');
  ok('[45] « Abandonner » DEMANDE avant, et dit que rien n’a été enregistré',
    /Abandonner ce brouillon/.test(confAbandon) && /n’a été enregistré/.test(confAbandon),
    confAbandon.slice(0, 110));
  await entree('^Abandonner$');
  // 135 — l'abandon a fini quand le bandeau est parti ; `entree` a déjà attendu le réseau calme.
  await jusqua('bandeau et brouillon partis', async () => (await bandeauVisible()) === false && (await brouillonEnBase()) === null);
  ok('[45] confirmé, le brouillon part — et RIEN n’est parti au serveur',
    (await brouillonEnBase()) === null && (await bandeauVisible()) === false &&
    base.envois.length === envoisAvantAbandon,
    'brouillon = ' + JSON.stringify(await brouillonEnBase()) +
    ' · ' + (base.envois.length - envoisAvantAbandon) + ' envoi(s)');
  // La routine en base n'a pas bougé : l'abandon ne touche que le disque local.
  ok('[45] et la routine enregistrée est intacte',
    /Brouillon du mardi/.test(await texte('#liste-routines')),
    (await texte('#liste-routines')).replace(/\n+/g, ' | ').slice(0, 70));

  console.log('\n══ 7 quater. RÉORGANISER — LE MODE, LA POIGNÉE, LE DÉFILEMENT ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) : une liste PLUS LONGUE QUE
  // L'ÉCRAN. Sur une liste courte, « le défilement est préservé » ne se mesure
  // pas — il n'y a rien à défiler, et une implémentation qui bloque tout
  // passerait. Le viewport du banc fait 760 px de haut ; on pose donc assez de
  // routines pour déborder largement.
  //
  // ⚠️ ET UN DÉPLACEMENT AU MILIEU, jamais en bout : en bout, « renuméroter »
  // et « ne rien faire » rendent le même tableau.
  base.routines = [];
  base.exos = [];
  base.series = [];
  ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']
    .forEach((nom, i) => {
      base.routines.push({ id: 'r-ord-' + i, user_id: 'u-banc', nom: nom,
        note: null, archivee_a: null, rang: i });
      base.exos.push({ id: 'e-ord-' + i, routine_id: 'r-ord-' + i,
        exercise_slug: 'squat-barre', rang: 0, repos_cible_s: null,
        groupe_superset: null, note: null });
      base.series.push({ id: 'rs-ord-' + i, routine_exercise_id: 'e-ord-' + i,
        user_id: 'u-banc', rang: 1, type_serie: 'travail', reps_visees: null,
        charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null });
    });
  await aller('/saisie');

  const nomsBiblio = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#liste-routines .routine-nom')).map((n) => n.textContent));
  const rangsEnBase = () => base.routines.slice()
    .sort((a, b) => (a.rang === null ? 99 : a.rang) - (b.rang === null ? 99 : b.rang))
    .map((r) => r.nom);
  const compter = (sel) => page.evaluate((x) => document.querySelectorAll(x).length, sel);
  const modeOuvert = () => page.evaluate(() => {
    const p = document.getElementById('pied-reorg');
    return !!p && !p.hidden && !!p.querySelector('.reorg-actions');
  });

  ok('[46] la bibliothèque est rangée par `rang`, pas par l’alphabet',
    JSON.stringify(await nomsBiblio()) === JSON.stringify(
      ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']),
    JSON.stringify(await nomsBiblio()));

  // Le rang l'emporte VRAIMENT : on inverse deux rangs en base, l'ordre suit.
  base.routines.find((r) => r.nom === 'Alpha').rang = 7;
  base.routines.find((r) => r.nom === 'Hotel').rang = 0;
  await aller('/saisie');
  ok('[46] …et c’est bien le rang qui commande — Hotel passe devant Alpha',
    (await nomsBiblio())[0] === 'Hotel' && (await nomsBiblio())[7] === 'Alpha',
    JSON.stringify(await nomsBiblio()));
  base.routines.find((r) => r.nom === 'Alpha').rang = 0;
  base.routines.find((r) => r.nom === 'Hotel').rang = 7;
  await aller('/saisie');

  // ① LE DÉFILEMENT, AVANT D'OUVRIR LE MODE — le témoin.
  const hauteurPage = () => page.evaluate(() => document.body.scrollHeight);
  const defilement = () => page.evaluate(() => window.scrollY);
  ok('[46] la liste déborde de l’écran — sinon rien de ce qui suit ne se mesure',
    (await hauteurPage()) > 760, (await hauteurPage()) + ' px de page pour 760 d’écran');

  // ② ON OUVRE LE MODE PAR LE BOUTON. L'appui long est l'autre entrée ; elle
  // se vérifie à l'appareil, un appui long synthétique ne prouvant que le
  // minuteur.
  ok('[46] le bouton « Ranger » est là quand il y a de quoi ranger',
    await page.evaluate(() => {
      const b = document.getElementById('btn-ranger-routines');
      return !!b && !b.hidden;
    }), 'bouton présent');
  await page.click('#btn-ranger-routines');
  await jusqua('mode ranger ouvert', modeOuvert);
  ok('[46] le mode s’ouvre : un pied Annuler / Enregistrer',
    (await modeOuvert()) === true &&
    /Annuler/.test(await contenu('#pied-reorg')) &&
    /Enregistrer/.test(await contenu('#pied-reorg')),
    (await contenu('#pied-reorg')).replace(/\s+/g, ' ').slice(0, 60));
  ok('[46] chaque rangée porte une poignée, et « Démarrer » a disparu',
    (await compter('#liste-routines .poignee')) === 8 &&
    (await compter('#liste-routines .demarrer')) === 0,
    (await compter('#liste-routines .poignee')) + ' poignée(s) · ' +
    (await compter('#liste-routines .demarrer')) + ' « Démarrer »');

  // ③ LA NON-RÉGRESSION DU DÉFILEMENT, MODE OUVERT. Un glissement vertical
  // POSÉ SUR LA CARTE ne doit rien déplacer — il défile. C'est ce que
  // `touch-action: pan-y` hors poignée garantit, et c'est la chose que trois
  // chantiers sur le bouton retour ont appris à vérifier.
  await page.evaluate(() => window.scrollTo(0, 0));
  await jusqua('défilement en haut', () => page.evaluate(() => window.scrollY === 0));
  const ordreAvantDefil = await nomsBiblio();
  const boiteCarte = await page.evaluate(() => {
    const c = document.querySelectorAll('#liste-routines .routine')[3];
    const r = c.getBoundingClientRect();
    return { x: r.left + 30, y: r.top + r.height / 2 };
  });
  await page.mouse.move(boiteCarte.x, boiteCarte.y);
  await page.mouse.down();
  for (let d = 0; d <= 160; d += 20) {
    await page.mouse.move(boiteCarte.x, boiteCarte.y - d);
    await attendre(25);   // VOULU (135) : le rythme d'un doigt qui glisse — un temps d'horloge, pas une attente d'état
  }
  await page.mouse.up();
  // 135 — le relâché est traité (une image peinte) : un déplacement fautif serait à l'écran.
  await rendu(page);
  ok('[46] un glissement vertical HORS poignée ne déplace RIEN',
    JSON.stringify(await nomsBiblio()) === JSON.stringify(ordreAvantDefil),
    JSON.stringify(await nomsBiblio()));

  // ④ LE GLISSEMENT À LA POIGNÉE, AU MILIEU.
  // ⚠️ LA POIGNÉE AU MILIEU DE L'ÉCRAN AVANT DE GLISSER (51-1). La souris du
  // banc n'a pas de capture du pointeur : un glissement qui finit SOUS le bas
  // de l'écran perd son `pointerup`, la rangée reste déplacée à l'écran et
  // l'ordre n'est jamais remonté. Le chantier 51-1 a ajouté une ligne à chaque
  // carte (la durée estimée) : la page est passée de 765 à 893 px pour 760, et
  // le second glissement vers le bas finissait hors de l'écran. Un doigt, lui,
  // ne quitte pas l'écran — c'est le banc qu'on recentre, pas l'app.
  const glisserPoignee = async (i, dy) => {
    await page.evaluate((k) => {
      document.querySelectorAll('#liste-routines .poignee')[k].scrollIntoView({ block: 'center' });
    }, i);
    await rendu(page);   // 135 — le défilement posé avant de lire la position de la poignée
    const b = await page.evaluate((k) => {
      const p = document.querySelectorAll('#liste-routines .poignee')[k];
      const r = p.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, i);
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    const pas = dy > 0 ? 8 : -8;
    for (let d = 0; Math.abs(d) < Math.abs(dy); d += pas) {
      await page.mouse.move(b.x, b.y + d);
      await attendre(18);   // VOULU (135) : le rythme d'un doigt qui glisse
    }
    await page.mouse.move(b.x, b.y + dy);
    await attendre(60);     // VOULU (135) : le doigt marque un temps avant de se lever
    await page.mouse.up();
    await rendu(page);      // 135 — le relâché traité, l'ordre peint
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await jusqua('défilement en haut', () => page.evaluate(() => window.scrollY === 0));
  // ⚠️ LE PAS EST EXACTEMENT LA HAUTEUR + LA MARGE, ET LA COMPARAISON EST
  // STRICTE : à deux pas PILE, la seconde permutation ne se déclenche pas —
  // le milieu de la rangée arrive sur celui du voisin, pas au-delà. Un vrai
  // doigt ne s'arrête jamais au pixel près ; le banc, si. On ajoute donc une
  // marge, sinon il mesurerait « un cran » et appellerait ça un défaut.
  const hRangee = await page.evaluate(() =>
    document.querySelectorAll('#liste-routines .routine-rangee')[0].getBoundingClientRect().height + 10);
  const deuxCrans = 2 * hRangee + 8;
  await glisserPoignee(3, -deuxCrans);      // Delta remonte de deux crans
  ok('[46] glisser par la poignée déplace la rangée, au milieu de la liste',
    (await nomsBiblio()).indexOf('Delta') === 1, JSON.stringify(await nomsBiblio()));

  // ⑤ PLUSIEURS DÉPLACEMENTS, ET RIEN N'EST ÉCRIT AVANT D'ENREGISTRER.
  await glisserPoignee(5, deuxCrans);       // puis un second, vers le bas
  const ordreVoulu = await nomsBiblio();
  ok('[46] deux déplacements à l’écran, et RIEN n’est encore parti en base',
    JSON.stringify(rangsEnBase()) === JSON.stringify(
      ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']),
    'base : ' + JSON.stringify(rangsEnBase()) + ' · écran : ' + JSON.stringify(ordreVoulu));

  // ⑥ ANNULER REMET TOUT EN PLACE.
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#pied-reorg button'))
      .filter((b) => /Annuler/.test(b.textContent))[0].click();
  });
  await jusqua('mode ranger refermé (Annuler)', async () => (await modeOuvert()) === false);
  await rendu(page);
  ok('[46] « Annuler » referme le mode et rend l’ordre d’avant',
    (await modeOuvert()) === false &&
    JSON.stringify(await nomsBiblio()) === JSON.stringify(
      ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']),
    JSON.stringify(await nomsBiblio()));
  ok('[46] …et « Démarrer » est revenu',
    (await compter('#liste-routines .demarrer')) === 8,
    (await compter('#liste-routines .demarrer')) + ' bouton(s)');

  // ⑦ ET ENREGISTRER ÉCRIT — SANS JAMAIS HEURTER `routines_user_rang_uniq`.
  await page.click('#btn-ranger-routines');
  await jusqua('mode ranger ouvert', modeOuvert);
  const envoisAvantRang = base.envois.length;
  await glisserPoignee(3, -deuxCrans);
  await glisserPoignee(5, deuxCrans);
  const voulu = await nomsBiblio();
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#pied-reorg button'))
      .filter((b) => /Enregistrer/.test(b.textContent))[0].click();
  });
  // 135 — le plan d'écritures est fini quand le mode s'est refermé tout seul, et le réseau s'est tu.
  await jusqua('mode ranger refermé (Enregistrer)', async () => (await modeOuvert()) === false);
  await calme('après le rangement');
  ok('[46] enregistré : la base porte l’ordre de l’écran, rangs sans collision',
    JSON.stringify(rangsEnBase()) === JSON.stringify(voulu),
    'base : ' + JSON.stringify(rangsEnBase()) + ' · voulu : ' + JSON.stringify(voulu));
  const refuses = base.envois.slice(envoisAvantRang)
    .filter((e) => e.methode === 'PATCH').length;
  ok('[46] …et le mode s’est refermé tout seul',
    (await modeOuvert()) === false, 'pied : ' + (await modeOuvert()));
  // ⚠️ LE PLAN PASSE PAR UN TAMPON : plus d'écritures que de rangées déplacées.
  // Un plan naïf en ferait moins — et se ferait refuser par l'index.
  ok('[46] le plan a fait un détour par un rang tampon',
    refuses >= 3, refuses + ' PATCH pour deux déplacements');

  // ⑧ APRÈS RECHARGEMENT, L'ORDRE TIENT.
  await aller('/saisie');
  ok('[46] rechargeee, la bibliothèque retrouve l’ordre enregistré',
    JSON.stringify(await nomsBiblio()) === JSON.stringify(voulu),
    JSON.stringify(await nomsBiblio()));

  // ⑨ LE GESTE RAPIDE — UN SEUL ÉVÉNEMENT POUR DEUX CRANS.
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater), trouvée par une MUTATION. Les
  // glissements ci-dessus avancent par pas de 8 px : chaque événement ne
  // franchit qu'un cran, donc une implémentation qui ne permute qu'UNE fois par
  // événement passe. C'est exactement le mutant qui a survécu au premier
  // passage.
  //
  // Un vrai pouce ne glisse pas par pas de 8 px : il LANCE. Et un
  // `pointermove` avalé par une image perdue produit le même saut. Ici on
  // envoie DEUX crans en UN SEUL mouvement — la rangée doit suivre le doigt,
  // pas traîner d'un cran derrière.
  await page.click('#btn-ranger-routines');
  await jusqua('mode ranger ouvert', modeOuvert);
  const avantLance = await nomsBiblio();
  const bLance = await page.evaluate(() => {
    const p = document.querySelectorAll('#liste-routines .poignee')[2];
    const r = p.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(bLance.x, bLance.y);
  await page.mouse.down();
  await page.mouse.move(bLance.x, bLance.y + deuxCrans);   // UN seul mouvement
  await attendre(120);   // VOULU (135) : le doigt marque un temps avant de se lever
  await page.mouse.up();
  await rendu(page);
  ok('[46] un geste RAPIDE franchit ses deux crans d’un coup',
    (await nomsBiblio()).indexOf(avantLance[2]) === 4,
    JSON.stringify(avantLance) + ' → ' + JSON.stringify(await nomsBiblio()));

  // ⑩ CHANGER D'ÉCRAN REFERME LE MODE, ET JETTE CE QUI N'EST PAS ENREGISTRÉ.
  //
  // ⚠️ PAR LES ONGLETS, PAS PAR UN RECHARGEMENT. Un `goto` relance l'app et
  // remettrait tout à zéro de toute façon : il ne mesurerait rien. C'est la
  // navigation INTERNE qui compte — c'est elle qui, jusqu'au chantier 46,
  // laissait le mode ouvert d'un écran à l'autre.
  const ordreAvantOnglet = rangsEnBase();
  await page.evaluate(() => {
    document.getElementById("onglet-seances").click();
  });
  await jusqua('onglet Séances', () => vueVisible(page, 'vue-liste'));
  await page.evaluate(() => {
    document.getElementById("onglet-saisie").click();
  });
  await jusqua('onglet Saisie', () => vueVisible(page, 'vue-saisie'));
  await calme('changement d’onglet : rien ne part');
  await rendu(page);
  ok('[46] changer d’onglet referme le mode — il ne traverse pas les écrans',
    (await modeOuvert()) === false &&
    (await compter('#liste-routines .poignee')) === 0,
    'pied : ' + (await modeOuvert()) + ' · ' +
    (await compter('#liste-routines .poignee')) + ' poignée(s)');
  ok('[46] …et le déplacement non enregistré est jeté, pas écrit en douce',
    JSON.stringify(rangsEnBase()) === JSON.stringify(ordreAvantOnglet) &&
    JSON.stringify(await nomsBiblio()) === JSON.stringify(ordreAvantOnglet),
    'base : ' + JSON.stringify(rangsEnBase()) + ' · écran : ' + JSON.stringify(await nomsBiblio()));

  // ⑪ L'ÉDITEUR DE ROUTINE — LA DEUXIÈME SURFACE, LE MÊME MODE.
  base.exos.push(
    { id: 'e-ed-1', routine_id: 'r-ord-0', exercise_slug: 'dc-barre', rang: 1,
      repos_cible_s: null, groupe_superset: null, note: null },
    { id: 'e-ed-2', routine_id: 'r-ord-0', exercise_slug: 'curl', rang: 2,
      repos_cible_s: null, groupe_superset: null, note: null });
  base.series.push(
    { id: 'rs-ed-1', routine_exercise_id: 'e-ed-1', user_id: 'u-banc', rang: 1,
      type_serie: 'travail', reps_visees: null, charge_cible_kg: null,
      duree_cible_s: null, distance_cible_m: null },
    { id: 'rs-ed-2', routine_exercise_id: 'e-ed-2', user_id: 'u-banc', rang: 1,
      type_serie: 'travail', reps_visees: null, charge_cible_kg: null,
      duree_cible_s: null, distance_cible_m: null });
  await aller('/saisie');
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#liste-routines .routine'))
      .filter((c) => /Alpha/.test(c.textContent))[0].click();
  });
  await jusqua('ouvrir « Alpha »', editeurOuvert);
  await rendu(page);
  const exosEcran = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#exos-routine .nom-exo, #exos-routine .replie-nom'))
      .map((n) => n.textContent.trim()));
  ok('[46] l’éditeur montre ses trois exercices',
    (await exosEcran()).length === 3, JSON.stringify(await exosEcran()));
  await page.click('#btn-ranger-routine');
  await jusqua('éditeur replié', async () => (await replies()) > 0);
  ok('[46] l’éditeur REPLIE ses blocs — le même `blocReplie` que la séance',
    (await compter('#exos-routine .bloc-seance.replie')) === 3 &&
    (await compter('#exos-routine .poignee')) === 3,
    (await compter('#exos-routine .bloc-seance.replie')) + ' replié(s) · ' +
    (await compter('#exos-routine .poignee')) + ' poignée(s)');
  // ⚠️ ET IL COMPTE LES SÉRIES SANS PARLER DE « FAITES » : une routine ne se
  // fait pas, elle se programme. « 0 / 1 série » serait faux des deux côtés.
  ok('[46] …et le repli dit « 1 série », jamais « 0 / 1 »',
    !/0\s*\/\s*1/.test(await contenu('#exos-routine')) &&
    /1 série/.test(await contenu('#exos-routine')),
    (await contenu('#exos-routine')).replace(/\s+/g, ' ').slice(0, 80));
  const avantEdit = await exosEcran();
  const hBloc = await page.evaluate(() =>
    document.querySelectorAll('#exos-routine .bloc-seance')[0].getBoundingClientRect().height + 8) + 8;
  await page.evaluate(() => {
    const p = document.querySelectorAll('#exos-routine .poignee')[2];
    const r = p.getBoundingClientRect();
    window.__pg = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const pg = await page.evaluate(() => window.__pg);
  await page.mouse.move(pg.x, pg.y);
  await page.mouse.down();
  for (let d = 0; d <= 2 * hBloc; d += 10) {
    await page.mouse.move(pg.x, pg.y - d);
    await attendre(18);   // VOULU (135) : le rythme d'un doigt qui glisse
  }
  await page.mouse.up();
  await rendu(page);
  ok('[46] dans l’éditeur aussi, la poignée déplace le bloc',
    JSON.stringify(await exosEcran()) !== JSON.stringify(avantEdit) &&
    (await exosEcran())[0] === avantEdit[2],
    'avant ' + JSON.stringify(avantEdit) + ' → ' + JSON.stringify(await exosEcran()));


  console.log('\n══ 7 bis. 155 — L’APP RELIT TES ROUTINES, ET « RENOMMER LE DOSSIER » ══');
  {
    const U = 'u-banc';
    const maintenant = '2026-10-20T08:00:00.000Z';
    const r155 = (id, nom, dossier, rang, extra) => Object.assign({ id: id, nom: nom, note: null, archivee_a: null,
      rang: rang, dossier: dossier, jours: null, created_at: maintenant, modifiee_a: maintenant }, extra || {});
    base.routines.push(r155('r155a', 'Haut A 155', 'Sèche', 901), r155('r155b', 'Bas A 155', 'Sèche', 902),
      r155('r155c', 'Vieille 155', 'Sèche', 903, { archivee_a: '2026-10-01T08:00:00.000Z' }),
      r155('r155d', 'Masse 155', 'Prise de masse 155', 904));
    const bloc155 = (id, statut, debut, precedent) => ({ id: id, user_id: U, dossier: 'Sèche', zone: 'lourd', debut: debut,
      semaines: 4, decharge: true, exercices: ['squat-barre'], statut: statut, precedent: precedent || null,
      created_at: maintenant, modifie_a: maintenant });
    base.blocs.push(bloc155('b155-1', 'termine', '2026-09-07'), bloc155('b155-2', 'en_cours', '2026-10-19', 'b155-1'));

    await aller('/saisie');
    // L'horloge de la page avance à la demande : le « au plus une fois par minute » se joue sans dormir.
    await page.evaluate(() => {
      const vrai = Date.now.bind(Date);
      window.__avance = 0;
      Date.now = () => vrai() + window.__avance;
    });
    const avancer = (ms) => page.evaluate((m) => { window.__avance += m; }, ms);
    // `aller` recharge la page : l'horloge qui avance à la demande est à reposer.
    const reposerHorloge = () => page.evaluate(() => {
      const vrai = Date.now.bind(Date);
      window.__avance = 0;
      Date.now = () => vrai() + window.__avance;
    });
    const retour = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
    const dossiersAffiches = () => page.evaluate(() => Array.from(document.querySelectorAll('#liste-routines .dossier-ligne'))
      .map((l) => l.getAttribute('data-dossier')));
    ok('[155 prémisse] la bibliothèque montre « Sèche » et « Prise de masse 155 »',
      (await dossiersAffiches()).indexOf('Sèche') >= 0 && (await dossiersAffiches()).indexOf('Prise de masse 155') >= 0,
      JSON.stringify(await dossiersAffiches()));

    // ── A. une routine modifiée « ailleurs » apparaît au retour ──
    const l0 = reseau.lecturesRoutines;
    const bas = base.routines.find((r) => r.id === 'r155b');
    bas.dossier = 'Ailleurs'; bas.modifiee_a = '2026-10-24T09:00:00.000Z';
    await avancer(120000);
    await retour();
    await jusqua('le dossier modifié ailleurs apparaît', async () => (await dossiersAffiches()).indexOf('Ailleurs') >= 0);
    await calme('après la relecture');
    ok('[155 A] DISCRIMINANT — une routine modifiée ailleurs apparaît au retour dans l’app',
      (await dossiersAffiches()).indexOf('Ailleurs') >= 0, JSON.stringify(await dossiersAffiches()));
    ok('[155 A] une seule lecture des routines de plus', reseau.lecturesRoutines === l0 + 1, (reseau.lecturesRoutines - l0) + ' lecture(s)');

    // ── au plus une fois par minute ──
    const l1 = reseau.lecturesRoutines;
    bas.dossier = 'Encore ailleurs'; bas.modifiee_a = '2026-10-24T09:05:00.000Z';
    await retour();
    await calme('retour rapproché');
    ok('[155 A] un second retour dans la minute ne relit pas', reseau.lecturesRoutines === l1 &&
      (await dossiersAffiches()).indexOf('Encore ailleurs') < 0, (reseau.lecturesRoutines - l1) + ' lecture(s)');

    // ── jamais quand l'éditeur d'une routine est ouvert ──
    await ouvrirRoutine('Haut A 155');
    const nomAvant = await page.evaluate(() => document.getElementById('champ-nom-routine').value);
    await page.fill('#champ-nom-routine', 'Haut A 155 en cours de frappe');
    const l2 = reseau.lecturesRoutines;
    await avancer(120000);
    await retour();
    await calme('retour sous l’éditeur');
    ok('[155 A] DISCRIMINANT — pas de relecture pendant l’éditeur, et ce qui se tape reste',
      reseau.lecturesRoutines === l2 &&
      (await page.evaluate(() => document.getElementById('champ-nom-routine').value)) === 'Haut A 155 en cours de frappe' &&
      nomAvant === 'Haut A 155', (reseau.lecturesRoutines - l2) + ' lecture(s)');
    bas.dossier = 'Sèche'; bas.modifiee_a = '2026-10-24T09:10:00.000Z';

    // ── B. renommer, de bout en bout ──
    await aller('/saisie');
    const menuDe = (d) => '#liste-routines .dossier-ligne[data-dossier="' + d + '"] .dossier-menu';
    await page.click(menuDe('Sèche'));
    await jusqua('menu du dossier', async () => !(await feuilleFermee(page)));
    const entrees = await page.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button')).map((b) => b.textContent));
    ok('[155 B] le menu « ⋯ » propose « Renommer le dossier »', entrees.indexOf('Renommer le dossier') >= 0, JSON.stringify(entrees));
    await page.click('#feuille-contenu .renommer-dossier');
    await jusqua('feuille de renommage', () => page.evaluate(() => !!document.querySelector('#feuille-contenu .renommer-valider')));
    const feuille = () => page.evaluate(() => ({
      nom: document.querySelector('#feuille-contenu input').value,
      aide: (document.querySelector('#feuille-contenu .renommer-aide') || {}).textContent,
      erreur: (document.querySelector('#feuille-contenu .erreur') || {}).textContent,
      eteint: document.querySelector('#feuille-contenu .renommer-valider').disabled }));
    let f = await feuille();
    ok('[155 B] la feuille : nom prérempli, la phrase des routines et du cycle',
      f.nom === 'Sèche' && f.aide === 'Tes 2 routines et ton cycle en cours suivent le nouveau nom.', JSON.stringify(f));
    await page.fill('#feuille-contenu input', 'Prise de masse 155');
    f = await feuille();
    ok('[155 B] un nom déjà pris : le message, le bouton éteint',
      f.eteint && f.erreur === 'Un dossier s\'appelle déjà « Prise de masse 155 ».', JSON.stringify(f));
    await page.fill('#feuille-contenu input', '');
    ok('[155 B] un nom vide : le bouton éteint', (await feuille()).eteint);
    await page.fill('#feuille-contenu input', 'Recompo');
    f = await feuille();
    ok('[155 B] un nom libre : le bouton s’allume, plus de message', !f.eteint && f.erreur === '', JSON.stringify(f));

    // Hors ligne : le geste le dit et ne fait rien à moitié.
    const coupe = (route) => route.abort('failed');
    await ctx.route(/supabase\.co/, coupe);
    await page.click('#feuille-contenu .renommer-valider');
    await jusqua('le refus hors ligne', () => page.evaluate(() => ((document.querySelector('#feuille-contenu .erreur') || {}).textContent || '') !== ''));
    ok('[155 B] hors ligne : il le dit, la feuille reste, rien n’a bougé en base',
      (await feuille()).erreur !== '' && base.routines.filter((r) => r.dossier === 'Sèche').length === 3 &&
      base.blocs.every((b) => b.dossier === 'Sèche'), (await feuille()).erreur);
    await ctx.unroute(/supabase\.co/, coupe);

    await page.click('#feuille-contenu .renommer-valider');
    await jusqua('renommage fini en base', () => base.routines.filter((r) => r.dossier === 'Recompo').length === 3 &&
      base.blocs.every((b) => b.dossier === 'Recompo'));
    await calme('après le renommage');
    await jusqua('Recompo à l’écran', async () => (await dossiersAffiches()).indexOf('Recompo') >= 0);
    ok('[155 B] DISCRIMINANT — les 3 routines (archivée comprise) suivent le nouveau nom',
      base.routines.filter((r) => r.dossier === 'Recompo').length === 3 && base.routines.filter((r) => r.dossier === 'Sèche').length === 0,
      JSON.stringify(base.routines.filter((r) => /155/.test(r.nom)).map((r) => r.nom + '→' + r.dossier)));
    ok('[155 B] DISCRIMINANT — tous les cycles (en cours et passé) suivent, `modifie_a` à jour',
      base.blocs.length === 2 && base.blocs.every((b) => b.dossier === 'Recompo' && b.modifie_a > maintenant),
      JSON.stringify(base.blocs.map((b) => b.dossier + ' ' + b.modifie_a)));
    ok('[155 B] l’écran : « Recompo » plein, avec le badge du cycle ; plus de « Sèche »',
      (await dossiersAffiches()).indexOf('Sèche') < 0 &&
      (await page.evaluate(() => !!document.querySelector('#liste-routines .dossier-ligne[data-dossier="Recompo"] .dossier-badge'))),
      JSON.stringify(await dossiersAffiches()));
    ok('[155 B] la feuille est fermée', await feuilleFermee(page));

    // ── C. 164 — la relecture ne peut pas écraser une écriture locale faite pendant sa requête ──
    // La réponse (l'ancienne liste) est retenue ; pendant ce temps on renomme un dossier (écriture locale, puis
    // `chargerRoutines`) ; puis la réponse arrive. Les gardes (feuille refermée, pas d'éditeur) laissent passer :
    // seul le compteur de génération la jette. Page rechargée : aucun éditeur n'a été ouvert (`brouillon` nul).
    await aller('/saisie');
    await reposerHorloge();
    await avancer(120000);
    reseau.retenirProchaine = true;
    await retour();
    await jusqua('[164] la relecture est partie, sa réponse est retenue', () => reseau.retenue === true);
    await page.click('#liste-routines .dossier-ligne[data-dossier="Prise de masse 155"] .dossier-menu');
    await jusqua('[164] menu du dossier', async () => !(await feuilleFermee(page)));
    await page.click('#feuille-contenu .renommer-dossier');
    await jusqua('[164] feuille de renommage', () => page.evaluate(() => !!document.querySelector('#feuille-contenu .renommer-valider')));
    await page.fill('#feuille-contenu input', 'Gain 164');
    await page.click('#feuille-contenu .renommer-valider');
    await jusqua('[164] renommage fini en base', () => base.routines.filter((r) => r.dossier === 'Gain 164').length === 1);
    await calme('[164] après le renommage');
    await jusqua('[164] Gain 164 à l’écran', async () => (await dossiersAffiches()).indexOf('Gain 164') >= 0);
    ok('[164 prémisse] le dossier renommé est affiché, la réponse tarde toujours',
      reseau.retenue === true && (await dossiersAffiches()).indexOf('Prise de masse 155') < 0, JSON.stringify(await dossiersAffiches()));
    reseau.liberer();
    await jusqua('[164] la réponse retenue est arrivée', () => reseau.retenue === false);
    await calme('[164] après la réponse tardive');
    await rendu(page);
    ok('[164] DISCRIMINANT — la réponse tardive (ancienne liste) n\'écrase pas le renommage qu\'on vient de faire',
      (await dossiersAffiches()).indexOf('Gain 164') >= 0 && (await dossiersAffiches()).indexOf('Prise de masse 155') < 0,
      JSON.stringify(await dossiersAffiches()));

    // ── D. 164 (D2) — une routine dont seuls les exercices ou les séries changent ailleurs apparaît au retour ──
    // `routines.modifiee_a` n'est écrite que pour le nom ou le dossier : la signature doit voir le CONTENU.
    const carte155 = (nom) => page.evaluate((n) => (Array.from(document.querySelectorAll('#liste-routines .routine'))
      .filter((c) => c.textContent.indexOf(n) >= 0)[0] || { textContent: '' }).textContent.replace(/\s+/g, ' '), nom);
    await aller('/saisie');
    await reposerHorloge();
    ok('[164 D2 prémisse] la routine « Haut A 155 » n\'a aucun exercice à l\'écran', /0 exercice/.test(await carte155('Haut A 155')), await carte155('Haut A 155'));
    base.exos.push({ id: 'e-164', routine_id: 'r155a', exercise_slug: 'dc-barre', rang: 1, repos_cible_s: null, groupe_superset: null, note: null });
    base.series.push({ id: 'rs-164', routine_exercise_id: 'e-164', user_id: 'u-banc', rang: 1, type_serie: 'travail',
      reps_visees: null, charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null });
    await avancer(120000);
    await retour();
    await jusqua('[164 D2] l\'exercice ajouté ailleurs apparaît', async () => /1 exercice/.test(await carte155('Haut A 155')));
    ok('[164 D2] DISCRIMINANT — exercices et séries changés ailleurs (sans `modifiee_a`) apparaissent au retour',
      /1 exercice · 1 série/.test(await carte155('Haut A 155')), await carte155('Haut A 155'));

    // ── E. 164 (D3) — fermer la feuille « Renommer » par le retour d'Android ne bloque pas la relecture ──
    await aller('/saisie');
    await reposerHorloge();
    await page.click('#liste-routines .dossier-ligne[data-dossier="Recompo"] .dossier-menu');
    await jusqua('[164 D3] menu du dossier', async () => !(await feuilleFermee(page)));
    await page.click('#feuille-contenu .renommer-dossier');
    await jusqua('[164 D3] feuille de renommage', () => page.evaluate(() => !!document.querySelector('#feuille-contenu .renommer-valider')));
    await page.goBack({ waitUntil: 'networkidle' }).catch(() => {});   // le retour d'Android, pas « Annuler »
    await jusqua('[164 D3] la feuille est fermée par le retour', () => feuilleFermee(page));
    const haut = base.routines.find((r) => r.id === 'r155a');
    haut.nom = 'Haut A 164 ailleurs'; haut.modifiee_a = '2026-10-24T11:00:00.000Z';
    await avancer(120000);
    await retour();
    await jusqua('[164 D3] la routine modifiée ailleurs apparaît', async () => /Haut A 164 ailleurs/.test(await carte155('Haut A 164 ailleurs')));
    ok('[164 D3] DISCRIMINANT — après un retour Android sur la feuille « Renommer », la relecture fonctionne encore',
      /Haut A 164 ailleurs/.test(await carte155('Haut A 164 ailleurs')), await carte155('Haut A 164 ailleurs'));
  }

  console.log('\n══ 8. NON-RÉGRESSION ══');
  for (const [chemin, attendu] of [['/', 'vue-liste'], ['/progression', 'vue-progression'], ['/profil', 'vue-profil']]) {
    await aller(chemin);
    const v = await visible();
    ok('l’onglet ' + chemin + ' s’ouvre', v[0] === attendu, JSON.stringify(v));
  }
  await aller('/routine/nouvelle');
  ok('/routine/nouvelle rouvre l’éditeur au rechargement direct', JSON.stringify(await visible()) === '["vue-routine"]', JSON.stringify(await visible()));

  console.log('\n══ 9. SANS RÉSEAU ══');
  await ctx.route(/supabase\.co/, (route) => route.abort('failed'));
  // 135 — pas `aller` : hors réseau, l'écran ne se « pose » pas au sens d'`ecranPose` (aucune réponse du
  // faux serveur) ; l'attente de la condition, juste en dessous, est l'attente d'état de cette section.
  await page.goto(BASE + '/saisie', { waitUntil: 'networkidle' }).catch(() => {});
  // Hors réseau, le SDK Supabase met plusieurs secondes à renoncer. On attend la
  // CONDITION, pas une durée : un banc qui dort trop peu conclut à tort, un banc
  // qui dort trop longtemps n'est plus relancé par personne.
  // 135 — plafond 60 s (25 avant) : sous charge, le SDK met plus longtemps à renoncer ; un plafond ne coûte rien
  // quand l'état vient, et il rend la main sans conclure quand il ne vient pas.
  const horsLigne = await attendreTexte('#liste-routines', /réseau|Réessayer/i, 60000);
  // À AUCUN MOMENT, pas seulement à la fin : l'état vide affiché une seconde
  // annonce une bibliothèque vide à quelqu'un qui a des routines.
  const vuVide = horsLigne.vus.filter((t) => /Aucune routine/.test(t));
  ok('elle ne dit JAMAIS qu’il n’y a aucune routine — « je ne sais pas » n’est pas « il n’y en a pas »',
    vuVide.length === 0, vuVide.length ? vuVide.length + ' rendu(s) fautif(s)' : 'jamais');
  ok('elle dit qu’elle ne peut pas charger, et propose de réessayer',
    /réseau/i.test(horsLigne.fin) && /Réessayer/.test(horsLigne.fin),
    JSON.stringify(await visible()) + ' ' + horsLigne.fin.replace(/\n+/g, ' | ').slice(0, 90));

  console.log('\n══ 10. LE CATALOGUE PAS ENCORE CHARGÉ ══');
  // Un profil NEUF, réseau coupé dès l'ouverture : le cache local est vide, donc
  // le catalogue aussi. « Aucun exercice ne correspond » serait faux — la
  // recherche n'a pas échoué, la synchronisation n'a pas eu lieu.
  const ctx2 = await nav.newContext({ viewport: { width: 360, height: 760 } });
  await ctx2.addInitScript(SCRIPT_JETON);
  await ctx2.route(/supabase\.co/, (route) => route.abort('failed'));
  const page2 = await ctx2.newPage();
  await page2.goto(BASE + '/routine/nouvelle', { waitUntil: 'domcontentloaded' }).catch(() => {});
  // 135 — la configuration discriminante est « la synchronisation a ÉCHOUÉ » (pas « pas encore partie ») :
  // on attend que l'état de synchronisation l'ait constaté (sorti de « Synchronisation… »), l'éditeur affiché.
  await jusqua('synchronisation échouée (hors réseau)', () => page2.evaluate(() => {
    const sync = document.getElementById('etat-sync'), v = document.getElementById('vue-routine');
    return !!v && !v.hidden && !!sync && (sync.textContent || '').trim() !== '' && !sync.classList.contains('sync');
  }), 60000);
  await page2.click('#btn-ajouter-exo').catch(() => {});
  await jusqua('catalogue ouvert (hors réseau)', async () => (await vueVisible(page2, 'catalogue')) &&
    (await page2.evaluate(() => (document.querySelector('#resultats-exo') || {}).textContent || '')) !== '');
  const msgCat = await page2.evaluate(() => (document.querySelector('#resultats-exo') || {}).textContent || '');
  ok('il dit que le catalogue arrive, pas que la recherche n’a rien trouvé',
    /catalogue/i.test(msgCat) && !/correspond/i.test(msgCat), msgCat.slice(0, 90) || '(vide)');
  await ctx2.close();

  // ══ 11. LE PROFIL, L'ONBOARDING ET L'ENTRÉE (chantier 46 §2) ═════════════
  //
  // ⚠️ CONTEXTE NEUF, ET C'EST LA CONFIGURATION DISCRIMINANTE. Ce qu'on teste
  // ici est ce que voit un compte QUI N'A JAMAIS RIEN RÉGLÉ : cache vide, pas
  // de ligne `profiles`, `onboarding_completed` à faux. Le contexte précédent a
  // trois ans de gestes derrière lui — et la section 9 y a coupé le réseau.
  console.log('\n══ 11. LE PROFIL — L’ONBOARDING EST LE PROFIL (ch. 46 §2) ══');
  // ⚠️ UN CATALOGUE QUI DÉPASSE 30, ET C'EST LA CONFIGURATION DISCRIMINANTE.
  // `Routines.chercher` plafonne à 30 par défaut — c'est bon pour un champ qui
  // cherche UN exercice, faux pour une liste qui les montre TOUS. Avec les
  // quatre exercices des sections précédentes, une troncature à 30 ne se voit
  // pas : les deux implémentations rendent la même liste. La vraie base en
  // compte 237. Mutant M25 : il survivait exactement à cause de ça.
  for (let i = 1; i <= 34; i++) {
    CATALOGUE.push({ slug: 'garniture-' + i, nom: 'Garniture ' + (i < 10 ? '0' : '') + i,
      mesure: 'charge_reps', charge: 'externe',
      muscles_primaires: ['quadriceps'], muscles_secondaires: [] });
  }
  base.profil = null;
  base.compteSupprime = false;
  base.corpusSeances = [
    { id: 's1', user_id: 'u-banc', debut: '2024-01-15T18:00:00Z', fin: '2024-01-15T19:30:00Z',
      titre: 'Push', note: null, salle: null, routine_id: null, source: 'app',
      statut: 'terminee', created_at: '2024-01-15T18:00:00Z', salle_norme: null },
    { id: 's2', user_id: 'u-banc', debut: '2026-09-10T18:00:00Z', fin: '2026-09-10T19:20:00Z',
      titre: 'Pull', note: null, salle: null, routine_id: null, source: 'app',
      statut: 'terminee', created_at: '2026-09-10T18:00:00Z', salle_norme: null }
  ];
  // TROIS séries pour DEUX séances : deux nombres différents, pour qu'une
  // phrase de confirmation qui recopierait le mauvais compte se voie.
  base.corpusSeries = [
    { id: 'x1', session_id: 's1', user_id: 'u-banc', exercise_slug: 'squat-barre',
      source: 'app', type_serie: 'travail', charge_kg: 100, reps: 5, duree_s: null,
      distance_m: null, rpe: null, ressenti: null, note: null, groupe_superset: null,
      validee_a: null, rang: 1, repos_s: null, created_at: '2024-01-15T18:10:00Z', modifie_a: null },
    { id: 'x2', session_id: 's2', user_id: 'u-banc', exercise_slug: 'dc-barre',
      source: 'app', type_serie: 'travail', charge_kg: 80, reps: 5, duree_s: null,
      distance_m: null, rpe: null, ressenti: null, note: null, groupe_superset: null,
      validee_a: null, rang: 1, repos_s: null, created_at: '2026-09-10T18:10:00Z', modifie_a: null },
    { id: 'x3', session_id: 's2', user_id: 'u-banc', exercise_slug: 'dc-barre',
      source: 'app', type_serie: 'travail', charge_kg: 82.5, reps: 5, duree_s: null,
      distance_m: null, rpe: null, ressenti: null, note: null, groupe_superset: null,
      validee_a: null, rang: 2, repos_s: null, created_at: '2026-09-10T18:12:00Z', modifie_a: null }
  ];

  const ctx3 = await nav.newContext({ viewport: { width: 360, height: 760 } });
  await ctx3.addInitScript(SCRIPT_JETON);
  await ctx3.route(/supabase\.co/, gererSupabase);
  const page3 = await ctx3.newPage();
  const erreurs3 = [];
  page3.on('pageerror', (e) => erreurs3.push(String(e).slice(0, 140)));
  // 135 — le profil posé : l'écran posé, puis ses lignes rendues.
  const allerProfil3 = async () => {
    const d = reseau.total;
    await page3.goto(BASE + '/profil', { waitUntil: 'networkidle' }).catch(() => {});
    await ecranPose(page3, 'compte neuf : /profil', d);
    await jusqua('profil rendu', () => page3.evaluate(() => !document.getElementById('vue-profil').hidden &&
      document.querySelectorAll('#profil-corps .p-ligne').length > 0));
  };
  const vue3 = () => page3.evaluate(() =>
    Array.from(document.querySelectorAll('main > section')).filter((s) => !s.hidden).map((s) => s.id));
  const txt3 = (sel) => page3.evaluate((x) => (document.querySelector(x) || {}).textContent || '', sel);

  // ── LE QUESTIONNAIRE EST UNE RÈGLE DE ROUTAGE (60-2a) ────────────────────
  // On demande « / » — la racine, l'onglet Séances. Un compte jamais réglé doit
  // voir le questionnaire DÈS LE PREMIER démarrage, quand la ligne de profil
  // arrive : relevé 60-0, la décision ne se prenait que sur le CACHE, et un
  // compte neuf n'était routé qu'au second démarrage.
  let depuis3 = reseau.total;
  await page3.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  await ecranPose(page3, 'compte neuf : /', depuis3);
  // 135 — le questionnaire s'ouvre quand la ligne de profil arrive (lue APRÈS la synchronisation, puis créée) :
  // c'est l'état que lit le contrôle ; au plafond, il dit ce qu'il voit.
  await jusqua('questionnaire ouvert', () => vueVisible(page3, 'vue-questionnaire'));
  await calme('après l’ouverture du questionnaire');
  ok('[60-2a] un compte neuf voit le questionnaire dès le PREMIER démarrage, quand la ligne de profil arrive',
    JSON.stringify(await vue3()) === '["vue-questionnaire"]', JSON.stringify(await vue3()));
  ok('[60-2a] …sur la bienvenue, sans barre d’onglets, avec ses deux sorties (« Plus tard », la barre)',
    /Je suis ton coach/.test(await txt3('#questionnaire-corps')) &&
    await page3.evaluate(() => document.getElementById('onglets').hidden &&
      !!document.querySelector('#questionnaire-corps .q-plus-tard') &&
      !!document.querySelector('#questionnaire-corps .q-prog')),
    (await txt3('#questionnaire-corps')).replace(/\s+/g, ' ').slice(0, 80));
  ok('[60-2a] la ligne a été créée avec `questionnaire_fait_le` à NULL — « jamais rempli » est un état de la ligne',
    !!base.profil && base.profil.questionnaire_fait_le === null, JSON.stringify(base.profil && base.profil.questionnaire_fait_le));
  await page3.click('#questionnaire-corps .q-plus-tard');
  await jusqua('« Plus tard » → Saisie', () => vueVisible(page3, 'vue-saisie'));
  await calme('après « Plus tard »');
  await rendu(page3);
  ok('[60-2a] « Plus tard » mène à Saisie, et Saisie propose de le terminer — sans « Abandonner »',
    JSON.stringify(await vue3()) === '["vue-saisie"]' &&
    /Ton questionnaire n’est pas terminé\./.test(await txt3('#bandeau-questionnaire')) &&
    await page3.evaluate(() => !!document.querySelector('#bandeau-questionnaire .principal') &&
      !document.querySelector('#bandeau-questionnaire .discret')),
    JSON.stringify(await vue3()) + ' · ' + (await txt3('#bandeau-questionnaire')).replace(/\s+/g, ' ').slice(0, 60));
  // ⚠️ UNE FOIS PAR APPAREIL. Au démarrage suivant, le questionnaire ne se rouvre
  // PAS de lui-même (le bandeau et la ligne du Profil restent) — un questionnaire
  // qui reviendrait à chaque ouverture recréerait l'obstacle qu'on vient d'enlever.
  depuis3 = reseau.total;
  await page3.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  await ecranPose(page3, 'compte neuf : / (second démarrage)', depuis3);
  // 135 — la ligne de profil relue (l'état qui déciderait d'ouvrir le questionnaire) : la vue des séances.
  await jusqua('second démarrage sur les séances', () => vueVisible(page3, 'vue-liste'));
  await calme('second démarrage : rien ne s’ouvre');
  ok('[60-2a] …et il ne se rouvre pas de lui-même : l’app rouvre sur les séances',
    JSON.stringify(await vue3()) === '["vue-liste"]', JSON.stringify(await vue3()));
  await allerProfil3();

  // ── TEST 6 — tous les champs « à renseigner » ────────────────────────────
  const videsProfil = await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#profil-corps .p-val.vide')).map((n) => n.textContent));
  ok('[46 §2 · test 6] un profil vide le dit champ par champ, en toutes lettres',
    videsProfil.length >= 7 && videsProfil.every((t) => t === 'à renseigner'),
    videsProfil.length + ' champ(s) · ' + JSON.stringify(Array.from(new Set(videsProfil))));
  ok('[46 §2 · test 6] …et rien n’est une alarme : aucune erreur, aucun blocage',
    await page3.evaluate(() => document.querySelectorAll('#profil-corps .erreur, #profil-corps .manque').length === 0 &&
      !Array.from(document.querySelectorAll('#profil-corps button')).some((b) => b.disabled)),
    'aucune alarme');
  // Les trois chiffres viennent du corpus, pas du profil : ils sont justes même
  // sur un profil vide, et c'est tout l'intérêt.
  const kpisProfil = await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#profil-corps .p-kpi')).map((n) => n.textContent));
  ok('[46 §2] les trois chiffres disent le corpus, pas le profil',
    /^2séances/.test(kpisProfil[0] || '') && /^3séries/.test(kpisProfil[1] || ''), JSON.stringify(kpisProfil));

  // ── TEST 7 — le bandeau d'accueil du profil est RETIRÉ (60-2a) ─────────────
  // C'est le questionnaire qui accueille. Le profil d'un compte jamais réglé n'a
  // plus de « Bienvenue » ni de « Plus tard — voir mes séances ».
  ok('[60-2a · test 7] le profil d’un compte neuf n’a plus de bandeau de bienvenue',
    await page3.evaluate(() => !document.querySelector('#profil-corps .p-accueil') &&
      !document.querySelector('#profil-corps .p-plus-tard') &&
      !/Rien n’est obligatoire/.test(document.getElementById('profil-corps').textContent)),
    'ni bandeau ni sortie');
  // ⚠️ 136 (audit du 16/10, 03 #18) — `onboarding_completed` NE S'ÉCRIT PLUS : quitter le profil n'envoie rien. La
  // ligne du faux serveur l'a à `false` (un compte neuf) ; elle doit le garder. (Avant le 136 : `true`, « vu ».)
  const onboardingAvant = base.profil ? base.profil.onboarding_completed : undefined;
  await page3.evaluate(() => document.querySelector('.onglet[data-vue="saisie"]').click());
  await calme('après avoir quitté le profil');
  ok('[136 · 03 #18] DISCRIMINANT — quitter le profil n’écrit plus `onboarding_completed`',
    !!base.profil && base.profil.onboarding_completed === onboardingAvant && onboardingAvant === false,
    JSON.stringify({ avant: onboardingAvant, apres: base.profil && base.profil.onboarding_completed }));
  await allerProfil3();

  // ── TEST 9 — l’intention, et la CLÉ qui part en base ─────────────────────
  await allerProfil3();
  ok('[46 §2] le profil rouvre sans bandeau une fois vu',
    await page3.evaluate(() => !document.querySelector('#profil-corps .p-accueil')), 'plus de bandeau');
  await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#profil-corps .p-seg button'))
      .find((b) => b.textContent === 'Juste un carnet').click());
  await jusqua('intention reçue en base', () => !!base.profil && base.profil.intention === 'entretien');
  await calme('après « Juste un carnet »');
  await rendu(page3);
  ok('[46 §2 · test 9 · 60-1] « Juste un carnet » est enregistré — et c’est la CLÉ de la base, « entretien »',
    base.profil && base.profil.intention === 'entretien',
    'base.intention = ' + (base.profil && base.profil.intention));
  ok('[46 §2 · test 9] …et l’écran le marque tout de suite',
    await page3.evaluate(() => {
      const b = Array.from(document.querySelectorAll('#profil-corps .p-seg button'));
      return b[1].className === 'on' && b[0].className === '';
    }), '« Juste un carnet » marqué');

  // ── 60-1 — QUATRE LIGNES EN MOINS, ET RIEN QUI PROMETTE CE QUI N'EST PAS BRANCHÉ ──
  const lignesProfil = await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#profil-corps .p-ligne')).map((l) => l.textContent));
  ok('[60-1] le profil n’a plus Discipline, Niveau déclaré, Jours ni Unités ; Matériel reste, sans promesse sous son nom',
    !lignesProfil.some((t) => /^(Discipline|Niveau déclaré|Jours|Unités)/.test(t)) &&
    lignesProfil.some((t) => /^Matériel/.test(t)) && !lignesProfil.some((t) => /Décide des exercices/.test(t)) &&
    lignesProfil.some((t) => /^Durée d’une séance/.test(t)),
    JSON.stringify(lignesProfil.map((t) => t.slice(0, 22))));

  // ── Une feuille de choix, bout en bout ───────────────────────────────────
  await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
      .find((l) => /^Matériel/.test(l.textContent)).click());
  await jusqua('feuille du matériel', () => page3.evaluate(() => !document.getElementById('feuille-seance').hidden &&
    document.querySelectorAll('#feuille-contenu .feuille-menu button').length > 0));
  ok('[46 §2] la feuille de choix montre les cinq matériels, et son aide',
    await page3.evaluate(() =>
      document.querySelectorAll('#feuille-contenu .feuille-menu button').length === 5),
    await txt3('#feuille-contenu .feuille-t'));
  ok('[60-1] l’aide du matériel dit ce qu’il fait : il range, il ne cache jamais',
    (await txt3('#feuille-contenu .feuille-aide')) === 'Je range les exercices selon ton matériel : ce que tu n’as pas passe après, jamais caché.',
    await txt3('#feuille-contenu .feuille-aide'));
  await page3.evaluate(() =>
    document.querySelector('#feuille-contenu .feuille-menu button[data-cle="salle_complete"]').click());
  await jusqua('matériel reçu en base', () => !!base.profil && base.profil.materiel === 'salle_complete');
  await jusqua('feuille du matériel refermée', () => feuilleFermee(page3));
  await calme('après le matériel');
  await rendu(page3);
  ok('[46 §2] le choix part en base sous sa clé, et la ligne n’est plus vide',
    base.profil && base.profil.materiel === 'salle_complete' &&
    await page3.evaluate(() => Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
      .find((l) => /^Matériel/.test(l.textContent)).querySelector('.p-val').textContent === 'Salle complète'),
    'base.materiel = ' + (base.profil && base.profil.materiel));

  // ── 60-1 — LA DURÉE : sa phrase dit ce qui est branché, et le choix part en base ──
  await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
      .find((l) => /^Durée d’une séance/.test(l.textContent)).click());
  await jusqua('feuille de la durée', () => page3.evaluate(() => !document.getElementById('feuille-seance').hidden &&
    (document.querySelector('#feuille-contenu .feuille-aide') || {}).textContent));
  ok('[60-1] l’aide de la durée : « Quand ta routine dépasse ce temps, je te propose de la raccourcir. » — plus de générateur',
    (await txt3('#feuille-contenu .feuille-aide')) === 'Quand ta routine dépasse ce temps, je te propose de la raccourcir.',
    await txt3('#feuille-contenu .feuille-aide'));
  await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
      .find((b) => b.textContent === '60 min').click());
  await jusqua('durée reçue en base', () => !!base.profil && base.profil.duree_seance_min === 60);
  await jusqua('feuille de la durée refermée', () => feuilleFermee(page3));
  await calme('après la durée');
  ok('[60-1] 60 min part en base sous `duree_seance_min`',
    base.profil && base.profil.duree_seance_min === 60, 'base.duree_seance_min = ' + (base.profil && base.profil.duree_seance_min));

  // ⚠️ UNE BORNE REFUSÉE RESTE DANS LA FEUILLE. Le CHECK `profiles_taille_ok`
  // refuse hors 100–250 en 23514 — code DÉFINITIF. On refuse AVANT, avec une
  // phrase, plutôt qu'après, avec une file morte.
  await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
      .find((l) => /^Taille/.test(l.textContent)).click());
  await jusqua('feuille de la taille', () => page3.evaluate(() => !!document.querySelector('#feuille-contenu .champ-texte input')));
  await page3.fill('#feuille-contenu .champ-texte input', '3');
  await page3.click('#feuille-contenu .feuille-pied .pri');
  // 135 — le refus est local et synchrone : la phrase est là, ou la feuille s'est refermée (le défaut).
  await jusqua('taille refusée', () => page3.evaluate(() =>
    !!(document.querySelector('#feuille-contenu .feuille-err') || {}).textContent || document.getElementById('feuille-seance').hidden));
  await calme('taille refusée : rien ne part');
  ok('[46 §2] une taille impossible est refusée DANS la feuille, avec une phrase',
    /entre 100 et 250/.test(await txt3('#feuille-contenu .feuille-err')) &&
    await page3.evaluate(() => !document.querySelector('#feuille-seance').hidden),
    await txt3('#feuille-contenu .feuille-err'));
  await page3.fill('#feuille-contenu .champ-texte input', '182');
  await page3.click('#feuille-contenu .feuille-pied .pri');
  await jusqua('taille reçue en base', () => !!base.profil && base.profil.taille_cm === 182);
  await jusqua('feuille de la taille refermée', () => feuilleFermee(page3));
  await calme('après la taille');
  await rendu(page3);
  ok('[46 §2] …et une taille valide ferme la feuille et remonte au bandeau',
    base.profil && base.profil.taille_cm === 182 &&
    /182 cm/.test(await txt3('#profil-sous')),
    'base.taille_cm = ' + (base.profil && base.profil.taille_cm) + ' · « ' + (await txt3('#profil-sous')) + ' »');

  // ⚠️ LA LISTE BLANCHE. Le trigger `protect_privileged_profile_columns`
  // REMETTRAIT `is_admin` et `tier` en place sans rien dire — le banc, lui,
  // refuse, donc une écriture qui les enverrait se verrait ici.
  const envoisProfil = base.envois.filter((e) => e.table === 'profiles');
  ok('[46 §2] aucune écriture de profil n’a jamais porté de colonne privilégiée',
    envoisProfil.length > 0 && envoisProfil.every((e) => {
      const l = Array.isArray(e.corps) ? e.corps[0] : e.corps;
      return l && l.is_admin === undefined && l.tier === undefined &&
             l.xp_high_water_mark === undefined && l.friend_code === undefined;
    }), envoisProfil.length + ' écriture(s)');

  // ── §2.4 bis — TOUS MES EXERCICES ────────────────────────────────────────
  await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#profil-corps .p-ligne'))
      .find((l) => /^Tous mes exercices/.test(l.textContent)).click());
  await jusqua('« Tous mes exercices »', async () => (await vueVisible(page3, 'vue-exercices')) &&
    (await page3.evaluate(() => document.querySelectorAll('#liste-mes-exos .exo-ligne').length)) > 0);
  await rendu(page3);
  ok('[46 §2.4 bis] « Tous mes exercices » s’ouvre, et c’est une vue avec son URL',
    JSON.stringify(await vue3()) === '["vue-exercices"]' &&
    (await page3.evaluate(() => location.pathname)) === '/profil/exercices',
    JSON.stringify(await vue3()) + ' ' + await page3.evaluate(() => location.pathname));
  // ⚠️ LES EXERCICES FAITS D'ABORD, DU PLUS RÉCENT AU PLUS ANCIEN. Un tri
  // alphabétique répondrait à « quels exercices existent » ; la question ici est
  // « qu'est-ce que je fais ». `dc-barre` (10/09/2026) doit passer devant
  // `squat-barre` (15/01/2024), et les deux devant tout ce qui n'a jamais été fait.
  const ordreExos = await page3.evaluate(() =>
    Array.from(document.querySelectorAll('#liste-mes-exos .exo-ligne')).slice(0, 3)
      .map((n) => n.querySelector('.exo-nom').textContent));
  ok('[46 §2.4 bis] les exercices FAITS passent devant, du plus récent au plus ancien',
    ordreExos[0] === 'Développé Couché (Barre)' && ordreExos[1] === 'Squat (Barre)',
    JSON.stringify(ordreExos));
  ok('[46 §2.4 bis] …et ceux jamais faits le disent, sans disparaître',
    await page3.evaluate(() => {
      const j = document.querySelectorAll('#liste-mes-exos .exo-ligne.jamais');
      return j.length > 0 && /jamais fait/.test(j[0].textContent);
    }), await txt3('#compte-mes-exos'));
  // ⚠️ TOUS, PAS LES TRENTE PREMIERS. La liste répond « qu'est-ce que je
  // fais » sur l'historique ENTIER ; en tronquer la queue ferait disparaître
  // sans un mot les exercices les plus anciens, c'est-à-dire précisément ceux
  // qu'on vient chercher ici.
  ok('[46 §2.4 bis] la liste montre TOUT le catalogue, pas les 30 premiers',
    await page3.evaluate((n) =>
      document.querySelectorAll('#liste-mes-exos .exo-ligne').length === n,
      CATALOGUE.length),
    await page3.evaluate(() => document.querySelectorAll('#liste-mes-exos .exo-ligne').length) +
      ' rendu(s) pour ' + CATALOGUE.length + ' au catalogue');
  // La recherche est celle du catalogue : elle replie les accents des deux côtés.
  await page3.fill('#champ-recherche-mes-exos', 'developpe');
  // 135 — la liste a répondu à la requête quand elle a rétréci (le catalogue entier en compte bien plus).
  await jusqua('recherche « developpe »', () => page3.evaluate((n) =>
    document.querySelectorAll('#liste-mes-exos .exo-ligne').length < n, CATALOGUE.length));
  ok('[46 §2.4 bis] la recherche replie les accents — « developpe » trouve « Développé »',
    await page3.evaluate(() =>
      Array.from(document.querySelectorAll('#liste-mes-exos .exo-nom'))
        .every((n) => /Développé/.test(n.textContent)) &&
      document.querySelectorAll('#liste-mes-exos .exo-nom').length > 0),
    await txt3('#compte-mes-exos'));
  // ⚠️ LE VRAI MANQUE QUE CE BLOC COMBLE : la page d'exercice ne s'atteignait
  // que depuis une séance EN COURS et depuis Progression.
  await page3.click('#liste-mes-exos .exo-ligne');
  await jusqua('page de l’exercice (profil)', () => vueVisible(page3, 'vue-exercice'));
  await rendu(page3);
  ok('[46 §2.4 bis] un tap ouvre la page de l’exercice — sans démarrer de séance',
    JSON.stringify(await vue3()) === '["vue-exercice"]', JSON.stringify(await vue3()));

  // ── TEST 11 — supprimer son compte ───────────────────────────────────────
  await allerProfil3();
  ok('[46 §2] « Quitter » et « Supprimer » sont là, dans cet ordre',
    await page3.evaluate(() => {
      const q = document.querySelector('#btn-deconnexion'), s = document.querySelector('#btn-supprimer-compte');
      return !!q && !!s && !!(q.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), 'Quitter puis Supprimer');
  await page3.click('#btn-supprimer-compte');
  await jusqua('confirmation de suppression du compte', () => page3.evaluate(() => !document.getElementById('feuille-seance').hidden &&
    document.querySelectorAll('#feuille-contenu .feuille-menu button').length > 0));
  const phraseSuppr = await txt3('#feuille-contenu .feuille-aide');
  ok('[46 §2 · test 11] la confirmation DIT CE QUI PART, en chiffres réels',
    /2 séances/.test(phraseSuppr) && /3 séries/.test(phraseSuppr) && /rien ne se récupère/.test(phraseSuppr),
    phraseSuppr.replace(/\s+/g, ' ').slice(0, 130));
  // « Annuler » ne supprime rien : c'est la moitié du geste qu'on ne teste
  // jamais, et c'est celle qui compte le jour où le doigt dérape.
  await page3.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
    .find((b) => b.textContent === 'Annuler').click());
  await jusqua('« Annuler » referme la confirmation', () => feuilleFermee(page3));
  await calme('« Annuler » : rien ne part');
  ok('[46 §2 · test 11] « Annuler » ne supprime rien',
    base.compteSupprime === false && base.corpusSeances.length === 2, 'rien n’est parti');

  // 59-4 — CE QUE L'APPAREIL GARDE : les magasins remplis, les clés `th-v2…`,
  // le jeton, l'écran affiché. Le verrou du jeton est levé : à partir d'ici,
  // un jeton qui part se voit.
  const etatAppareil = () => page3.evaluate(() => new Promise((fin) => {
    const cles = (st) => { const k = []; for (let i = 0; i < st.length; i++) k.push(st.key(i)); return k; };
    const th = cles(localStorage).concat(cles(sessionStorage)).filter((k) => k.indexOf('th-v2') === 0).sort();
    const vues = Array.from(document.querySelectorAll('main > section')).filter((x) => !x.hidden).map((x) => x.id);
    const req = indexedDB.open('trainhub-v2');
    req.onsuccess = () => {
      const db = req.result;
      const noms = Array.from(db.objectStoreNames);
      const remplis = [];
      if (!noms.length) { db.close(); return fin({ remplis, th, jeton: localStorage.getItem('th-v2-auth'), vues }); }
      const t = db.transaction(noms, 'readonly');
      noms.forEach((n) => { const c = t.objectStore(n).count(); c.onsuccess = () => { if (c.result) remplis.push(n); }; });
      t.oncomplete = () => { db.close(); fin({ remplis: remplis.sort(), th, jeton: localStorage.getItem('th-v2-auth'), vues }); };
    };
    req.onerror = () => fin({ erreur: String(req.error) });
  }));
  await page3.evaluate(() => { window.__jetonLibre = true; });

  // L'ÉCHEC D'ABORD (la base refuse) : rien n'est effacé, et l'écran le dit.
  const avantEchec = await etatAppareil();
  base.refuserSuppression = true;
  await page3.click('#btn-supprimer-compte');
  await jusqua('confirmation de suppression du compte', () => page3.evaluate(() => !document.getElementById('feuille-seance').hidden &&
    document.querySelectorAll('#feuille-contenu .feuille-menu button').length > 0));
  await page3.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
    .find((b) => b.textContent === 'Supprimer définitivement').click());
  // 135 — la base a refusé quand le message d'échec est à l'écran (ce que lit le contrôle) ; puis le calme.
  await jusqua('refus de suppression affiché', () => page3.evaluate(() =>
    !!((document.querySelector('#profil-corps .feuille-err') || {}).textContent || '')));
  await calme('après le refus de suppression');
  const apresEchec = await etatAppareil();
  const messageEchec = await page3.evaluate(() =>
    ((document.querySelector('#profil-corps .feuille-err') || {}).textContent || ''));
  ok('[59-4] la base refuse : « Suppression impossible : … » s’affiche',
    /^Suppression impossible : refus du banc$/.test(messageEchec), '« ' + messageEchec + ' »');
  ok('[59-4] la base refuse : RIEN n’est effacé — magasins, clés, jeton, écran',
    avantEchec.remplis.indexOf('seances') >= 0 && JSON.stringify(apresEchec.remplis) === JSON.stringify(avantEchec.remplis) &&
    JSON.stringify(apresEchec.th) === JSON.stringify(avantEchec.th) && !!apresEchec.jeton &&
    JSON.stringify(apresEchec.vues) === JSON.stringify(avantEchec.vues) &&
    base.compteSupprime === false && base.corpusSeances.length === 2,
    JSON.stringify({ avant: avantEchec.remplis, apres: apresEchec.remplis, cles: apresEchec.th, vues: apresEchec.vues }));
  base.refuserSuppression = false;

  const avantSuppression = base.envois.length;
  await page3.click('#btn-supprimer-compte');
  await jusqua('confirmation de suppression du compte', () => page3.evaluate(() => !document.getElementById('feuille-seance').hidden &&
    document.querySelectorAll('#feuille-contenu .feuille-menu button').length > 0));
  await page3.evaluate(() => Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
    .find((b) => b.textContent === 'Supprimer définitivement').click());
  // 135 — supprimé : l'appareil revient à l'écran de connexion (le dernier geste de la suppression).
  await jusqua('écran de connexion après suppression', () => vueVisible(page3, 'vue-connexion'));
  await calme('après la suppression du compte');
  // ⚠️ UN SEUL APPEL, ET AUCUN DELETE. La fonction de base sait ce qui part ;
  // réécrire la suppression en plusieurs DELETE côté client, c'est ainsi qu'on
  // en oublie un — et c'est le défaut RGPD que la v1 a payé (CLAUDE.md §11).
  const depuis = base.envois.slice(avantSuppression);
  ok('[46 §2 · test 11] confirmé, la FONCTION DE BASE est appelée — et AUCUN DELETE client',
    base.compteSupprime === true &&
    depuis.filter((e) => e.table === 'delete_user_complete_data').length === 1 &&
    depuis.filter((e) => e.methode === 'DELETE').length === 0,
    depuis.map((e) => e.methode + ' ' + e.table).join(', ') || '(aucun envoi)');

  // 59-4 — APRÈS LE SUCCÈS, L'APPAREIL EST VIDE : aucun magasin rempli, aucune
  // clé `th-v2…`, plus de jeton, et l'écran de connexion.
  const apresSucces = await etatAppareil();
  ok('[59-4] supprimé : plus aucun magasin local rempli',
    Array.isArray(apresSucces.remplis) && apresSucces.remplis.length === 0, JSON.stringify(apresSucces.remplis));
  ok('[59-4] supprimé : aucune clé th-v2…, plus de jeton',
    apresSucces.th.length === 0 && apresSucces.jeton === null, JSON.stringify(apresSucces.th));
  ok('[59-4] supprimé : l’écran de connexion',
    JSON.stringify(apresSucces.vues) === '["vue-connexion"]', JSON.stringify(apresSucces.vues));

  // ── L'ÉCRAN D'ENTRÉE ─────────────────────────────────────────────────────
  //
  // Le jeton du banc est verrouillé (SCRIPT_JETON) : la déconnexion ne peut pas
  // l'effacer, donc on repart d'un contexte SANS jeton pour voir l'entrée.
  const ctx4 = await nav.newContext({ viewport: { width: 360, height: 760 } });
  await ctx4.route(/supabase\.co/, gererSupabase);
  const page4 = await ctx4.newPage();
  page4.on('pageerror', (e) => erreurs3.push(String(e).slice(0, 140)));
  await page4.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  // 135 — sans jeton, l'app ne synchronise rien : l'état posé est l'écran d'entrée lui-même.
  await jusqua('écran d’entrée', () => vueVisible(page4, 'vue-connexion'));
  await rendu(page4);
  ok('[46 §2 ter] sans jeton, l’app ouvre sur la connexion',
    JSON.stringify(await page4.evaluate(() =>
      Array.from(document.querySelectorAll('main > section')).filter((s) => !s.hidden).map((s) => s.id)))
      === '["vue-connexion"]',
    await page4.evaluate(() => location.pathname));
  ok('[46 §2 ter] la phrase d’accueil, et plus aucun « v2 · socle »',
    /ne raconte pas d’histoires/.test(await page4.evaluate(() =>
      (document.querySelector('#entree-phrase') || {}).textContent || '')) &&
    await page4.evaluate(() => !document.querySelector('.jalon')),
    await page4.evaluate(() => (document.querySelector('#entree-phrase') || {}).textContent || ''));
  ok('[46 §2 ter] en connexion, pas de pseudo — et « mot de passe oublié » est là',
    await page4.evaluate(() => document.querySelector('#env-pseudo').hidden &&
      !document.querySelector('#btn-oubli').hidden), 'deux champs');

  await page4.click('#btn-bascule-entree');
  await jusqua('bascule vers l’inscription', () => page4.evaluate(() => location.pathname === '/inscription'));
  await rendu(page4);
  ok('[46 §2 ter] « Créer un compte » bascule le MÊME écran — trois champs, pas un de plus',
    await page4.evaluate(() => !document.querySelector('#env-pseudo').hidden &&
      document.querySelector('#btn-oubli').hidden &&
      document.querySelector('#btn-connexion').textContent === 'Créer mon compte' &&
      document.querySelectorAll('#form-connexion input').length === 3) &&
    (await page4.evaluate(() => location.pathname)) === '/inscription',
    await page4.evaluate(() => location.pathname));
  ok('[46 §2 ter] le bouton est éteint tant que les trois champs ne tiennent pas',
    await page4.evaluate(() => document.querySelector('#btn-connexion').disabled), 'éteint');

  // ⚠️ LE TROISIÈME ÉTAT, BOUT EN BOUT. La fonction `pseudo_libre` n'existe pas
  // en base (le banc répond PGRST202) : l'écran doit se TAIRE sur la
  // disponibilité, et surtout ne pas retenir l'inscription.
  await page4.fill('#champ-pseudo', 'melodie');
  await page4.fill('#champ-email', 'melodie.dupont@exemple.fr');
  const sondesAvant = base.envois.filter((e) => e.table === 'pseudo_libre').length;
  await page4.fill('#champ-mdp', 'motdepasse1');
  // 135 — la sonde du pseudo est partie (après sa temporisation) et la base a répondu « je ne sais pas »
  // (PGRST202) : c'est après cette réponse que l'écran doit se taire.
  await jusqua('sonde du pseudo répondue', () => base.envois.filter((e) => e.table === 'pseudo_libre').length > sondesAvant);
  await calme('après la sonde du pseudo');
  await rendu(page4);
  ok('[46 §2 ter] sans réponse de la base, l’écran ne dit RIEN sur la disponibilité',
    (await page4.evaluate(() =>
      (document.querySelector('#aide-pseudo') || {}).textContent || '')) === '',
    '« ' + await page4.evaluate(() => (document.querySelector('#aide-pseudo') || {}).textContent || '') + ' »');
  ok('[46 §2 ter] …et elle ne retient personne : le bouton s’allume',
    await page4.evaluate(() => !document.querySelector('#btn-connexion').disabled), 'allumé');

  // 59-4 — L'INSCRIPTION PASSE SON ADRESSE DE RETOUR : le lien de confirmation
  // (s'il y en a un) revient sur CETTE app, l'origine de la page. On observe la
  // vraie requête du SDK (`redirect_to`) ; le faux serveur la refuse, peu importe.
  const inscriptions = [];
  page4.on('request', (r) => { if (/\/auth\/v1\/signup/.test(r.url())) inscriptions.push(r.url()); });
  await page4.click('#btn-connexion');
  await jusqua('inscription partie', () => inscriptions.length > 0);
  await calme('après l’inscription');
  const retourInscription = inscriptions.length ? new URL(inscriptions[0]).searchParams.get('redirect_to') : null;
  ok('[59-4] l’inscription demande au lien de confirmation de revenir sur l’origine de l’app',
    inscriptions.length === 1 && retourInscription === BASE + '/',
    inscriptions.length + ' inscription(s) · redirect_to = ' + retourInscription);
  await page4.fill('#champ-pseudo', 'me');
  // 135 — le refus est local : l'aide le dit (ce que lit le contrôle, avec le bouton éteint).
  await jusqua('pseudo trop court', () => page4.evaluate(() => /3 caractères/.test((document.querySelector('#aide-pseudo') || {}).textContent || '')));
  await rendu(page4);
  ok('[46 §2 ter] un pseudo trop court, lui, est refusé tout de suite — et localement',
    /3 caractères/.test(await page4.evaluate(() =>
      (document.querySelector('#aide-pseudo') || {}).textContent || '')) &&
    await page4.evaluate(() => document.querySelector('#btn-connexion').disabled),
    await page4.evaluate(() => (document.querySelector('#aide-pseudo') || {}).textContent || ''));

  await page4.click('#btn-bascule-entree');
  await jusqua('retour à la connexion', () => page4.evaluate(() => location.pathname !== '/inscription'));
  await rendu(page4);
  ok('[46 §2 ter] revenir à la connexion remet le formulaire à zéro',
    await page4.evaluate(() => document.querySelector('#champ-mdp').value === '' &&
      (document.querySelector('#erreur-connexion').textContent || '') === '' &&
      document.querySelector('#env-pseudo').hidden), 'remis à zéro');
  await ctx3.close();
  await ctx4.close();
  if (erreurs3.length) { console.log('erreurs de page (profil) : ' + erreurs3.join(' | ')); echecs++; }

  console.log('\nattentes d’état : ' + statAttente.n + ', la plus longue ' + statAttente.pire + ' ms (' + statAttente.pireNom +
    '), ' + statAttente.plafond + ' au plafond (' + PLAFOND_MS / 1000 + ' s)' +
    (statAttente.plafonds.length ? ' : ' + statAttente.plafonds.join(' · ') : ''));
  console.log('\nerreurs de page : ' + (erreurs.length ? erreurs.join(' | ') : 'aucune'));
  if (erreurs.length) echecs++;
  console.log('\n' + (echecs ? '❌ ' + echecs + ' vérification(s) en échec' : '✅ tout passe'));
  await nav.close();
  await new Promise((r) => serveur.close(r));
  process.exit(echecs ? 1 : 0);
})();
