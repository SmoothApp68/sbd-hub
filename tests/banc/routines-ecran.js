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
const { creer } = require(path.join(R, 'v2/banc/serveur-pages.js'));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.BANC_PORT || 8872), BASE = 'http://127.0.0.1:' + PORT;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const base = { routines: [], exos: [], sessions: [], sets: [], graine: 0, envois: [] };
  const replie = (n) => String(n || '').trim().toLowerCase();
  const collisionRang = () => {
    const vus = new Set();
    for (const e of base.exos) { const c = e.routine_id + '#' + e.rang; if (vus.has(c)) return true; vus.add(c); }
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
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
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
    Storage.prototype.removeItem = function (c) { if (c === 'th-v2-auth') return; return vraiRemove.call(this, c); };
    Storage.prototype.setItem = function (c, v) { return vraiSet.call(this, c, c === 'th-v2-auth' ? JETON : v); };
  };
  await ctx.addInitScript(SCRIPT_JETON);

  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 140)));

  await ctx.route(/supabase\.co/, async (route) => {
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
      // ⚠️ AUCUN FILTRE SUR `archivee_a` ICI. `Donnees.mesRoutines` n'en pose
      // pas non plus : le banc le faisait, et rendait donc les archivées
      // invisibles CÔTÉ SERVEUR — la règle d'affichage du client n'était
      // jamais exercée. Depuis le §7 duodecies.1 elle a changé, et c'est ce
      // filtre-là qui l'aurait masqué.
      if (table === 'routines') return json(projeter(base.routines.map((r) =>
        Object.assign({}, r, { routine_exercises: base.exos.filter((e) => e.routine_id === r.id) })), url));
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
    const nomBorne = (l) => {
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
    if (req.method() === 'POST' && table === 'routines') {
      const mauvais = nomBorne(Array.isArray(corps) ? corps[0] : corps);
      if (mauvais) return refuserSi(corps, mauvais);
      const l = Object.assign({ id: 'r' + (++base.graine), archivee_a: null, note: null }, corps);
      base.routines.push(l);
      if (collisionNom()) { base.routines.pop(); return json({ code: '23505', message: 'duplicate key value violates unique constraint "routines_user_nom_actif_uniq"' }, 409); }
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
    if (req.method() === 'PATCH') {
      const mauvais = table === 'routines' ? nomBorne(corps) : bornes(corps);
      if (mauvais) return refuserSi(corps, mauvais);
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const tab = table === 'routines' ? base.routines : base.exos;
      const l = tab.find((x) => x.id === id);
      const avant = Object.assign({}, l);
      Object.assign(l, corps);
      const cassé = table === 'routines' ? collisionNom() : collisionRang();
      if (cassé) { Object.assign(l, avant);
        return json({ code: '23505', message: 'duplicate key value violates unique constraint "' +
          (table === 'routines' ? 'routines_user_nom_actif_uniq' : 'routine_exos_rang_uniq') + '"' }, 409); }
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
        base.exos = base.exos.filter((e) => ids.indexOf(e.routine_id) < 0);
        base.sessions.forEach((x) => { if (ids.indexOf(x.routine_id) >= 0) x.routine_id = null; });
        return json([]);
      }
      base.exos = base.exos.filter((e) => ids.indexOf(e.id) < 0);
      return json([]);
    }
    return json([]);
  });

  // Le boot affiche ce qu'il a AVANT de synchroniser, puis honore l'URL quand
  // la synchro rend la main. Sur un cache vide — le cas du banc — il faut donc
  // lui laisser finir : 1,2 s ne suffisait pas, et le banc mesurait l'écran
  // intermédiaire.
  const aller = async (chemin) => {
    await page.goto(BASE + chemin, { waitUntil: 'networkidle' }).catch(() => {});
    await attendre(2500);
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
      await attendre(300);
    }
    return { fin: vu, vus: vus };
  };

  console.log('\n══ 1. L’ÉTAT VIDE ══');
  await aller('/saisie');
  ok('la vue Saisie est celle qui s’affiche', JSON.stringify(await visible()) === '["vue-saisie"]', JSON.stringify(await visible()));
  const vide = await texte('#liste-routines');
  ok('il dit qu’il n’y a rien, et quoi faire', /Aucune routine/.test(vide) && /Créer une routine/.test(vide), vide.replace(/\n+/g, ' | ').slice(0, 120));
  ok('aucune excuse, aucun « oups »', !/oups|désolé|erreur/i.test(vide));

  console.log('\n══ 2. CRÉER UNE ROUTINE DE TROIS EXERCICES ══');
  await page.click('#liste-routines .principal');
  await attendre(400);
  ok('l’éditeur s’ouvre, et l’URL le dit', page.url().endsWith('/routine/nouvelle'), page.url().replace(BASE, ''));
  await page.fill('#champ-nom-routine', 'Push');
  for (const [q, attendu] of [['squat', 'Squat (Barre)'], ['developpe couche', 'Développé Couché (Barre)'], ['souleve', 'Soulevé de Terre (Barre)']]) {
    await page.click('#btn-ajouter-exo');
    await attendre(250);
    await page.fill('#champ-recherche-exo', q);
    await attendre(250);
    const premier = await page.evaluate(() => (document.querySelector('#resultats-exo .resultat') || {}).textContent || '');
    ok('« ' + q +' » trouve « ' + attendu + ' »', premier === attendu, premier);
    await page.click('#resultats-exo .resultat');
    await attendre(250);
  }
  const noms = () => page.evaluate(() => Array.from(document.querySelectorAll('.exo-routine-nom')).map((n) => n.textContent));

  // ⚠️ TOUS LES GESTES PASSENT PAR LE MENU DE LA CARTE (§7 duodecies.2). Les
  // boutons permanents — monter, descendre, retirer, et le lien « grouper avec
  // le suivant » entre chaque paire — ont disparu : c'est la même grammaire
  // qu'en séance, et le banc doit la parcourir pareil.
  const menuCarte = async (i) => {
    await page.evaluate((k) => {
      document.querySelectorAll('.exo-routine')[k].querySelector('.menu-pts').click();
    }, i);
    await attendre(300);
  };
  const entreesMenu = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
      .map((b) => b.textContent + (b.disabled ? ' (inerte)' : '')));
  const entree = async (motif) => {
    await page.evaluate((m) => {
      const b = Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => new RegExp(m).test(x.textContent))[0];
      b.click();
    }, motif);
    await attendre(350);
  };
  // Un geste = ouvrir le menu de la carte i, puis toucher son entrée.
  const gesteCarte = async (i, motif) => { await menuCarte(i); await entree(motif); };
  ok('trois exercices dans l’ordre d’ajout', JSON.stringify(await noms()) ===
    JSON.stringify(['Squat (Barre)', 'Développé Couché (Barre)', 'Soulevé de Terre (Barre)']), JSON.stringify(await noms()));

  console.log('\n══ 3. AUCUN CHAMP DE CHARGE DANS LE FORMULAIRE ══');
  const champs = await page.evaluate(() => Array.from(document.querySelectorAll('#vue-routine input'))
    .map((i) => ({ id: i.id, lib: (i.closest('label') || {}).innerText || '', type: i.type })));
  ok('les seuls champs sont nom, séries, reps, repos',
    !champs.some((c) => /charge|poids|kg|weight/i.test(c.lib + c.id)),
    champs.map((c) => (c.lib || c.id).replace(/\n/g, ' ')).join(' · '));

  console.log('\n══ 4. ENREGISTRER ══');
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  ok('retour à la bibliothèque', page.url().endsWith('/saisie'), page.url().replace(BASE, ''));
  ok('la routine est en base avec 3 exercices, rangs 0/1/2',
    base.exos.length === 3 && JSON.stringify(base.exos.map((e) => e.rang)) === '[0,1,2]',
    JSON.stringify(base.exos.map((e) => e.exercise_slug + '@' + e.rang)));
  ok('la carte montre l’aperçu', /Push/.test(await texte('#liste-routines')) && /3 exercices/.test(await texte('#liste-routines')),
    (await texte('#liste-routines')).replace(/\n+/g, ' | '));
  const envoyees = base.envois.flatMap((e) => Array.isArray(e.corps) ? e.corps : [e.corps])
    .flatMap((c) => Object.keys(c || {}));
  ok('rien qui ressemble à une charge n’est parti', !envoyees.some((k) => /charge|poids|kg|weight/i.test(k)),
    Array.from(new Set(envoyees)).join(', '));

  console.log('\n══ 5. RÉORDONNER ET RETIRER AU MILIEU ══');
  await page.click('#liste-routines .routine');
  await attendre(700);
  // ⚠️ ADRESSÉ PAR INDICE DE CARTE, PAS PAR POSITION DANS LE DOM. Le chantier
  // 28 intercale un lien de superset entre deux cartes : `nth-child(3)` ne
  // désigne plus la troisième carte mais le deuxième lien.
  await gesteCarte(2, '^Monter$');
  await attendre(250);
  ok('à l’écran : le 3e est remonté', JSON.stringify(await noms()) ===
    JSON.stringify(['Squat (Barre)', 'Soulevé de Terre (Barre)', 'Développé Couché (Barre)']), JSON.stringify(await noms()));
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  const apres = base.exos.slice().sort((a, b) => a.rang - b.rang);
  ok('en base : l’ordre a suivi, rangs 0/1/2 sans trou',
    JSON.stringify(apres.map((e) => e.exercise_slug)) === '["squat-barre","souleve-terre","dc-barre"]' &&
    JSON.stringify(apres.map((e) => e.rang)) === '[0,1,2]',
    JSON.stringify(apres.map((e) => e.exercise_slug + '@' + e.rang)));

  await page.click('#liste-routines .routine');
  await attendre(700);
  await gesteCarte(1, 'Supprimer l');
  await attendre(250);
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  const apres2 = base.exos.slice().sort((a, b) => a.rang - b.rang);
  ok('retrait du MILIEU : les rangs se resserrent',
    JSON.stringify(apres2.map((e) => e.rang)) === '[0,1]',
    JSON.stringify(apres2.map((e) => e.exercise_slug + '@' + e.rang)));

  console.log('\n══ 5 bis. LE REPOS RESTE MODIFIABLE DANS LA ROUTINE ══');
  //
  // Vérification demandée au chantier 26 : le repos se change EN SÉANCE
  // (§7 septies.2) sans que la routine cesse d'être l'endroit où il se
  // prescrit. Les deux chemins doivent coexister.
  await page.click('#liste-routines .routine');
  await attendre(700);
  // ⚠️ LE REPOS SE TAPE AU PAVÉ DE DÉCALAGE (§7 quaterdecies.2), plus dans un
  // champ de secondes. Les chiffres entrent par la DROITE, un `beforeinput` par
  // appui — poser `.value` directement ne passerait pas par le pavé et ne
  // mesurerait donc rien de ce que fait un pouce.
  const taperRepos = async (suite) => {
    await page.evaluate((chiffres) => {
      const i = document.querySelector('#feuille-contenu .chrono input');
      chiffres.split('').forEach((c) => {
        i.dispatchEvent(new InputEvent('beforeinput',
          { inputType: 'insertText', data: c, cancelable: true }));
      });
    }, suite);
    await attendre(200);
  };
  const lireRepos = () => page.evaluate(() =>
    (document.querySelector('#feuille-contenu .chrono input') || {}).value || '');
  // ⚠️ VIDER AVANT DE TAPER, et c'est le pavé qui l'impose : les chiffres
  // s'AJOUTENT par la droite. Taper « 130 » sur un champ qui porte déjà 3:30
  // ne donne pas 1:30 — ça donne trois refus, parce que 33:01 dépasse la borne.
  // Le banc tapait dans un champ vide par accident ; il le fait maintenant
  // exprès.
  const viderRepos = async () => {
    await page.evaluate(() => {
      const i = document.querySelector('#feuille-contenu .chrono input');
      for (let k = 0; k < 8; k++) {
        i.dispatchEvent(new InputEvent('beforeinput',
          { inputType: 'deleteContentBackward', cancelable: true }));
      }
    });
    await attendre(200);
  };
  const remplirRepos = async (suite) => {
    await gesteCarte(0, 'Modifier les param');
    await viderRepos();
    await taperRepos(suite);
    await page.click('#feuille-contenu .principal');
    await attendre(350);
  };
  await menuCarte(0);
  await entree('Modifier les param');
  const libsFeuille = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#feuille-contenu .champ-lib')).map((l) => l.textContent));
  const typeRepos = await page.evaluate(() =>
    (document.querySelector('#feuille-contenu .chrono input') || {}).type || 'absent');
  ok('[42] la feuille porte un PAVÉ de repos, plus un champ de secondes',
    JSON.stringify(libsFeuille) === '["S\u00e9ries","Reps vis\u00e9es","Repos cible"]' &&
    typeRepos === 'text',
    JSON.stringify(libsFeuille) + ' · pavé = ' + typeRepos);
  await page.click('#feuille-contenu .principal');
  await attendre(350);
  // CONFIGURATION DISCRIMINANTE : 3:30 franchit la minute. Un champ numérique
  // simple stockerait 330, le pavé stocke 210.
  await remplirRepos('330');
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
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
  await page.click('#liste-routines .routine');
  await attendre(700);
  await remplirRepos('320');      // 3:20 = 200 s
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  const apresEditeur = base.exos.filter((e) => e.id === premierExo.id)[0];
  ok('la note de la ligne de routine n’est PAS écrasée par l’éditeur',
    apresEditeur.note === 'Ceinture, barre basse' && apresEditeur.repos_cible_s === 200,
    JSON.stringify({ note: apresEditeur.note, repos: apresEditeur.repos_cible_s }));

  console.log('\n══ 5 quater. REPS SUR LA CARTE, REPOS EN mm:ss ══');
  //
  // §7 quaterdecies — constaté sur device après le chantier 41 : « c'est moins
  // intuitif qu'avant de faire une routine ». Il fallait ouvrir la feuille pour
  // remplir un champ qu'on remplit toujours, et le repos se demandait en
  // secondes brutes alors que le pavé de décalage existe depuis le chantier 25.

  await page.click('#liste-routines .routine');
  await attendre(700);
  const champsCarte = (i) => page.evaluate((k) => {
    const c = document.querySelectorAll('.exo-routine')[k];
    return Array.from(c.querySelectorAll('.exo-routine-champs .champ-num')).map((l) => ({
      lib: l.querySelector('.champ-lib').textContent,
      val: l.querySelector('input').value
    }));
  }, i);
  ok('[42] la carte porte SÉRIES et REPS VISÉES, saisissables sans feuille',
    JSON.stringify((await champsCarte(0)).map((c) => c.lib)) === '["Séries","Reps visées"]',
    JSON.stringify(await champsCarte(0)));
  const reposCarte = (i) => page.evaluate((k) =>
    (document.querySelectorAll('.exo-routine')[k].querySelector('.repos-cible') || {}).textContent || '',
    i);
  ok('[42] et le repos s’y LIT, en mm:ss, au même bouton qu’en séance',
    /^repos \d+:\d\d$/.test(await reposCarte(0)), '« ' + (await reposCarte(0)) + ' »');

  // ⚠️ SANS JAMAIS OUVRIR LA FEUILLE. C'est tout l'objet du §7 quaterdecies.1 :
  // le geste le plus fréquent de l'écran ne doit pas coûter un geste de plus.
  const saisirCarte = async (i, k, valeur) => {
    await page.evaluate(([c, j, v]) => {
      const champ = document.querySelectorAll('.exo-routine')[c]
        .querySelectorAll('.exo-routine-champs input')[j];
      champ.value = v;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    }, [i, k, valeur]);
    await attendre(200);
  };
  await saisirCarte(0, 0, '4');     // séries
  await saisirCarte(0, 1, '12');    // reps visées
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  const exo0 = () => base.exos.slice().sort((a, b) => a.rang - b.rang)[0];
  ok('[42] les deux partent en base, sans qu’aucune feuille se soit ouverte',
    exo0().series === 4 && exo0().reps_visees === 12,
    JSON.stringify({ series: exo0().series, reps: exo0().reps_visees }));

  // ⚠️ LE PAVÉ, EN TROIS APPUIS, ET AU-DESSUS DE LA MINUTE. Sous 60 secondes,
  // « décalage sur deux groupes » et « champ numérique simple » rendent la même
  // valeur — c'est ce qui a laissé passer la régression.
  await page.click('#liste-routines .routine');
  await attendre(700);
  await gesteCarte(0, 'Modifier les param');
  await viderRepos();
  await taperRepos('130');
  const vu130 = await lireRepos();
  ok('[42] « 1 » « 3 » « 0 » affiche 1:30 — trois appuis, pas une conversion',
    /^0?1:30$/.test(vu130), '« ' + vu130 + ' »');
  // La borne HAUTE se refuse à la frappe : on n'a jamais besoin de passer
  // au-dessus de 30:00 pour y arriver.
  await taperRepos('0');            // « 1300 » = 13:00, encore admissible
  await taperRepos('0');            // « 13000 » vaudrait 1:30:00 — refusé
  const vuBorne = await lireRepos();
  ok('[42] la borne haute refuse le chiffre de trop, sans rien perdre',
    vuBorne === '13:00', '« ' + vuBorne + ' »');
  // Effacement par la droite, comme au chantier 25.
  await page.evaluate(() => {
    document.querySelector('#feuille-contenu .chrono input').dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true }));
  });
  await attendre(200);
  const vuEfface = await lireRepos();
  ok('[42] effacer retire le DERNIER chiffre, par la droite',
    vuEfface === '01:30', '« ' + vuEfface + ' »');
  await page.click('#feuille-contenu .principal');
  await attendre(350);
  ok('[42] et la carte suit tout de suite', (await reposCarte(0)) === 'repos 1:30',
    '« ' + (await reposCarte(0)) + ' »');
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  ok('[42] 90 secondes en base, pas 130', exo0().repos_cible_s === 90,
    'repos_cible_s = ' + exo0().repos_cible_s);

  // Rechargement : ce qui est stocké se réaffiche en mm:ss.
  await aller('/saisie');
  await page.click('#liste-routines .routine');
  await attendre(700);
  await gesteCarte(0, 'Modifier les param');
  const vuRelu = await lireRepos();
  ok('[42] rouvert, le pavé repart de 1:30 — jamais de « 90 »',
    /^0?1:30$/.test(vuRelu), '« ' + vuRelu + ' »');
  await page.click('#feuille-contenu .principal');
  await attendre(350);
  // ⚠️ LA BORNE BASSE NE PEUT PAS SE REFUSER À LA FRAPPE : pour écrire 0:45 il
  // faut passer par 0:04. Elle se refuse donc à L'ENREGISTREMENT — et le
  // message parle en mm:ss, pas en secondes : annoncer « de 5 à 1800 secondes »
  // obligerait à convertir de tête ce qu'on vient de taper.
  await gesteCarte(0, 'Modifier les param');
  await viderRepos();
  await taperRepos('4');
  await page.click('#feuille-contenu .principal');
  await attendre(350);
  await page.click('#btn-enregistrer-routine');
  await attendre(700);
  const msgBorne = (await texte('#erreur-routine')).trim();
  ok('[42] 0:04 est refusé à l’enregistrement, en mm:ss',
    /0:05/.test(msgBorne) && /30:00/.test(msgBorne) && !/seconde/.test(msgBorne),
    '« ' + msgBorne + ' »');
  await gesteCarte(0, 'Modifier les param');
  await viderRepos();
  await taperRepos('130');
  await page.click('#feuille-contenu .principal');
  await attendre(350);
  await page.click('#btn-enregistrer-routine');
  await attendre(900);

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
  await page.click('#liste-routines .routine');
  await attendre(700);
  await page.click('#btn-ajouter-exo');
  await attendre(250);
  await page.fill('#champ-recherche-exo', 'curl');
  await attendre(250);
  await page.click('#resultats-exo .resultat');
  await attendre(300);

  const lettresEditeur = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.exo-routine')).map((c) => {
      const l = c.querySelector('.lettre-exo');
      return l ? l.textContent : '';
    }));
  // ⚠️ LE LIEN N'A PLUS DE BOUTON À LUI (§7 duodecies.2) : il se lit sur le
  // LISERÉ de la carte, exactement comme au détail de séance, et il se pose par
  // le menu. On mesure donc ce qui reste visible — le groupement — et non plus
  // la commande qui le produisait.
  const groupesEditeur = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.exo-routine')).map((c) => c.classList.contains('groupe')));
  const cliquerLien = async (i) => { await gesteCarte(i, 'Grouper avec le suivant'); };
  const degrouperCarte = async (i) => { await gesteCarte(i, '^Dégrouper$'); };
  const enBase = () => base.exos.slice().sort((a, b) => a.rang - b.rang)
    .map((e) => e.groupe_superset);

  ok('trois exercices, aucun groupé',
    JSON.stringify(await groupesEditeur()) === '[false,false,false]' &&
    JSON.stringify(await lettresEditeur()) === '["","",""]',
    JSON.stringify(await groupesEditeur()) + ' · ' + JSON.stringify(await lettresEditeur()));

  // ⚠️ LES SIX GESTES, ET L'ASYMÉTRIE QUI LES MESURE. Sur le PREMIER exercice
  // d'une liste de trois, « Monter » et « Dégrouper » n'ont pas de sens et sont
  // GRISÉS ; les quatre autres sont actifs. Un menu où tout serait actif, ou
  // tout grisé, ne prouverait rien.
  await menuCarte(0);
  ok('[41] le menu de carte porte les six gestes du §7 duodecies.2',
    (await entreesMenu()).length === 6 &&
    /Grouper avec le suivant/.test((await entreesMenu())[0]) &&
    /Modifier les param/.test((await entreesMenu())[4]),
    (await entreesMenu()).join(' | '));
  ok('[41] et il grise ce qui n’a pas de sens sur le premier : Monter, Dégrouper',
    (await entreesMenu())[1] === 'Dégrouper (inerte)' &&
    (await entreesMenu())[2] === 'Monter (inerte)' &&
    (await entreesMenu())[3] === 'Descendre',
    (await entreesMenu()).join(' | '));
  await page.click('#btn-fermer-feuille');
  await attendre(300);

  // Le lien du MILIEU : les deux DERNIERS se groupent, le premier reste dehors.
  await cliquerLien(1);
  ok('le lien du milieu groupe les deux derniers, et EUX SEULS',
    JSON.stringify(await groupesEditeur()) === '[false,true,true]' &&
    JSON.stringify(await lettresEditeur()) === '["","A","B"]',
    JSON.stringify(await lettresEditeur()));
  await menuCarte(1);
  ok('[41] une fois groupé, « Grouper » se grise et « Dégrouper » s’ouvre',
    (await entreesMenu())[0] === 'Grouper avec le suivant (inerte)' &&
    (await entreesMenu())[1] === 'Dégrouper',
    (await entreesMenu()).join(' | '));
  await page.click('#btn-fermer-feuille');
  await attendre(300);

  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  ok('`groupe_superset` part en base — un numéro pour la paire, rien pour l’autre',
    JSON.stringify(enBase()) === '[null,1,1]', JSON.stringify(enBase()));

  // ⚠️ LA RELECTURE. Écrire le groupe et le RELIRE sont deux choses : jusqu'au
  // chantier 28 l'éditeur ne transportait pas `groupe_superset`, et un simple
  // aller-retour l'effaçait sans rien dire.
  await page.click('#liste-routines .routine');
  await attendre(700);
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

  // ⚠️ L'ADJACENCE EST LA SEULE DÉFINITION (§2.3). Descendre le premier le pose
  // ENTRE les deux autres : la suite contiguë est rompue, donc le superset
  // n'existe plus. Ça se voit à l'endroit exact où le lien vient de céder.
  await gesteCarte(0, '^Descendre$');
  ok('glisser un exercice AU MILIEU d’un superset le défait',
    JSON.stringify(await groupesEditeur()) === '[false,false,false]' &&
    JSON.stringify(await lettresEditeur()) === '["","",""]',
    JSON.stringify(await lettresEditeur()));
  // Et il ne revient pas tout seul : le numéro est perdu, pas mis de côté.
  await gesteCarte(1, '^Monter$');
  ok('et il ne se recolle pas de lui-même au retour',
    JSON.stringify(await groupesEditeur()) === '[false,false,false]',
    JSON.stringify(await groupesEditeur()));

  // Les trois d'un coup, puis l'écriture : un superset à TROIS, le cas que le
  // chantier 27 avait validé sur device et que l'éditeur ne savait pas produire.
  await cliquerLien(0);
  await cliquerLien(1);
  ok('les deux liens posés : un seul bloc de trois, A/B/C',
    JSON.stringify(await lettresEditeur()) === '["A","B","C"]',
    JSON.stringify(await lettresEditeur()));
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
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
  await page.click('#liste-routines .routine');
  await attendre(700);
  ok('un groupe à UN seul exercice ne s’affiche pas comme un superset',
    JSON.stringify(await groupesEditeur()) === '[false,false,false]' &&
    JSON.stringify(await lettresEditeur()) === '["","",""]',
    JSON.stringify(await lettresEditeur()));
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  ok('et il est DISSOUS en base au premier enregistrement, pas réécrit',
    JSON.stringify(enBase()) === '[null,null,null]', JSON.stringify(enBase()));

  // On rend la routine à l'état où la suite du banc l'attend : deux exercices,
  // sans superset. Le §6 compte les lignes, pas les groupes.
  await page.click('#liste-routines .routine');
  await attendre(700);
  await gesteCarte(2, 'Supprimer l');
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  ok('remis à plat : deux exercices, aucun groupe',
    base.exos.length === 2 && JSON.stringify(enBase()) === '[null,null]',
    base.exos.length + ' exercice(s) · ' + JSON.stringify(enBase()));

  console.log('\n══ 6. NOM EN DOUBLON, PUIS SUPPRESSION ══');
  await page.click('#btn-nouvelle-routine');
  await attendre(400);
  await page.fill('#champ-nom-routine', 'push  ');
  await page.click('#btn-enregistrer-routine');
  await attendre(600);
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

  await page.click('#liste-routines .routine');
  await attendre(700);
  ok('[41] le bouton dit « Supprimer », plus « Archiver »',
    (await texte('#btn-supprimer-routine')).trim() === 'Supprimer' &&
    (await page.evaluate(() => !!document.getElementById('btn-archiver-routine'))) === false,
    '« ' + (await texte('#btn-supprimer-routine')).trim() + ' »');

  await page.click('#btn-supprimer-routine');
  await attendre(500);
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
  await attendre(500);
  await entree('^Supprimer$');
  await attendre(900);
  ok('[41] confirmée, la routine quitte la base — pas d’archivage',
    base.routines.filter((r) => r.id === routineQuiAServi.id).length === 0,
    JSON.stringify(base.routines.map((r) => r.nom)));
  // §5 test 5 — la CASCADE.
  ok('[41] ses exercices partent avec elle, aucun orphelin',
    base.exos.filter((e) => e.routine_id === routineQuiAServi.id).length === 0,
    exosAvant + ' avant · ' + base.exos.length + ' ligne(s) restante(s) au total');
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
  await page.click('#liste-routines .principal');
  await attendre(400);
  await page.fill('#champ-nom-routine', 'Push');
  await page.click('#btn-ajouter-exo');
  await attendre(250);
  await page.fill('#champ-recherche-exo', 'curl');
  await attendre(250);
  await page.click('#resultats-exo .resultat');
  await attendre(250);
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
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
  await page.click('#btn-nouvelle-routine');
  await attendre(400);
  await page.fill('#champ-nom-routine', 'Ancienne');
  await page.click('#btn-ajouter-exo');
  await attendre(250);
  await page.fill('#champ-recherche-exo', 'curl');
  await attendre(250);
  await page.click('#resultats-exo .resultat');
  await attendre(250);
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  ok('[41] et son nom reste libre — l’index d’unicité est PARTIEL',
    !(await texte('#erreur-routine')).trim() &&
    base.routines.filter((r) => replie(r.nom) === 'ancienne').length === 2,
    '« ' + (await texte('#erreur-routine')).trim() + ' » · ' +
    JSON.stringify(base.routines.map((r) => r.nom + (r.archivee_a ? '*' : ''))));

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
  await aller('/saisie');
  // Hors réseau, le SDK Supabase met plusieurs secondes à renoncer. On attend la
  // CONDITION, pas une durée : un banc qui dort trop peu conclut à tort, un banc
  // qui dort trop longtemps n'est plus relancé par personne.
  const horsLigne = await attendreTexte('#liste-routines', /réseau|Réessayer/i, 25000);
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
  await attendre(6000);
  await page2.click('#btn-ajouter-exo').catch(() => {});
  await attendre(600);
  const msgCat = await page2.evaluate(() => (document.querySelector('#resultats-exo') || {}).textContent || '');
  ok('il dit que le catalogue arrive, pas que la recherche n’a rien trouvé',
    /catalogue/i.test(msgCat) && !/correspond/i.test(msgCat), msgCat.slice(0, 90) || '(vide)');
  await ctx2.close();

  console.log('\nerreurs de page : ' + (erreurs.length ? erreurs.join(' | ') : 'aucune'));
  if (erreurs.length) echecs++;
  console.log('\n' + (echecs ? '❌ ' + echecs + ' vérification(s) en échec' : '✅ tout passe'));
  await nav.close();
  await new Promise((r) => serveur.close(r));
  process.exit(echecs ? 1 : 0);
})();
