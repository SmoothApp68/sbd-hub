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
  const base = { routines: [], exos: [], graine: 0, envois: [] };
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
      if (table === 'exercises') return json(CATALOGUE);
      if (table === 'routines') return json(base.routines.filter((r) => !r.archivee_a).map((r) =>
        Object.assign({}, r, { routine_exercises: base.exos.filter((e) => e.routine_id === r.id) })));
      return json([]);
    }
    base.envois.push({ methode: req.method(), table, corps: corps });
    if (req.method() === 'POST' && table === 'routines') {
      const l = Object.assign({ id: 'r' + (++base.graine), archivee_a: null, note: null }, corps);
      base.routines.push(l);
      if (collisionNom()) { base.routines.pop(); return json({ code: '23505', message: 'duplicate key value violates unique constraint "routines_user_nom_actif_uniq"' }, 409); }
      return json([l], 201);
    }
    if (req.method() === 'POST' && table === 'routine_exercises') {
      const ajout = (Array.isArray(corps) ? corps : [corps]).map((c) => Object.assign({ id: 'e' + (++base.graine) }, c));
      base.exos = base.exos.concat(ajout);
      if (collisionRang()) { base.exos = base.exos.slice(0, -ajout.length);
        return json({ code: '23505', message: 'duplicate key value violates unique constraint "routine_exos_rang_uniq"' }, 409); }
      return json(ajout, 201);
    }
    if (req.method() === 'PATCH') {
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
    if (req.method() === 'DELETE') {
      const brut = url.searchParams.get('id') || '';
      const ids = brut.startsWith('in.') ? brut.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : [brut.replace('eq.', '')];
      base.routines = base.routines.filter((r) => ids.indexOf(r.id) < 0);
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
  // La i-ième CARTE de l'éditeur, et un clic dedans.
  const carteEditeur = async (i, sel) => {
    await page.evaluate(([k, s]) => {
      document.querySelectorAll('.exo-routine')[k].querySelector(s).click();
    }, [i, sel]);
    await attendre(250);
  };
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
  await carteEditeur(2, '.geste[aria-label="Monter"]');
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
  await carteEditeur(1, '.geste[aria-label="Retirer"]');
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
  // Le 3e champ de la 1re carte : séries · reps visées · REPOS. Adressé par
  // indice, pour la même raison que les cartes — un lien de superset s'intercale
  // désormais entre deux d'entre elles.
  const remplirRepos = async (v) => {
    await page.evaluate((val) => {
      const i = document.querySelectorAll('.exo-routine')[0]
        .querySelectorAll('.exo-routine-champs .champ-num input')[2];
      i.value = val;
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
    await attendre(250);
  };
  const aChampRepos = await page.evaluate(() =>
    document.querySelectorAll('.exo-routine')[0]
      .querySelectorAll('.exo-routine-champs .champ-num input').length);
  ok('le champ « Repos (s) » est là, dans l’éditeur', aChampRepos === 3,
    aChampRepos + ' champ(s) numériques');
  await remplirRepos('210');
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  const premierExo = base.exos.slice().sort((a, b) => a.rang - b.rang)[0];
  ok('la valeur saisie part bien en base', premierExo.repos_cible_s === 210,
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
  await remplirRepos('200');
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  const apresEditeur = base.exos.filter((e) => e.id === premierExo.id)[0];
  ok('la note de la ligne de routine n’est PAS écrasée par l’éditeur',
    apresEditeur.note === 'Ceinture, barre basse' && apresEditeur.repos_cible_s === 200,
    JSON.stringify({ note: apresEditeur.note, repos: apresEditeur.repos_cible_s }));

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
  const liensEditeur = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.lien-superset'))
      .map((d) => d.classList.contains('actif')));
  const cliquerLien = async (i) => {
    await page.evaluate((k) => {
      document.querySelectorAll('.lien-superset')[k].querySelector('button').click();
    }, i);
    await attendre(250);
  };
  const enBase = () => base.exos.slice().sort((a, b) => a.rang - b.rang)
    .map((e) => e.groupe_superset);

  ok('trois exercices, deux liens entre eux, aucun actif',
    JSON.stringify(await liensEditeur()) === '[false,false]' &&
    JSON.stringify(await lettresEditeur()) === '["","",""]',
    JSON.stringify(await liensEditeur()) + ' · ' + JSON.stringify(await lettresEditeur()));

  // Le lien du MILIEU : les deux DERNIERS se groupent, le premier reste dehors.
  await cliquerLien(1);
  ok('le lien du milieu groupe les deux derniers, et EUX SEULS',
    JSON.stringify(await liensEditeur()) === '[false,true]' &&
    JSON.stringify(await lettresEditeur()) === '["","A","B"]',
    JSON.stringify(await lettresEditeur()));
  ok('et le bouton dit comment le défaire',
    /séparer/i.test(await page.evaluate(() =>
      document.querySelectorAll('.lien-superset')[1].querySelector('button').textContent)),
    await page.evaluate(() => document.querySelectorAll('.lien-superset')[1].querySelector('button').textContent));

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
    JSON.stringify(await liensEditeur()) === '[false,true]' &&
    JSON.stringify(await lettresEditeur()) === '["","A","B"]',
    JSON.stringify(await lettresEditeur()));

  // ⚠️ L'ADJACENCE EST LA SEULE DÉFINITION (§2.3). Descendre le premier le pose
  // ENTRE les deux autres : la suite contiguë est rompue, donc le superset
  // n'existe plus. Ça se voit à l'endroit exact où le lien vient de céder.
  await carteEditeur(0, '.geste[aria-label="Descendre"]');
  ok('glisser un exercice AU MILIEU d’un superset le défait',
    JSON.stringify(await liensEditeur()) === '[false,false]' &&
    JSON.stringify(await lettresEditeur()) === '["","",""]',
    JSON.stringify(await lettresEditeur()));
  // Et il ne revient pas tout seul : le numéro est perdu, pas mis de côté.
  await carteEditeur(1, '.geste[aria-label="Monter"]');
  ok('et il ne se recolle pas de lui-même au retour',
    JSON.stringify(await liensEditeur()) === '[false,false]',
    JSON.stringify(await liensEditeur()));

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

  // On rend la routine à l'état où la suite du banc l'attend : deux exercices,
  // sans superset. Le §6 compte les lignes, pas les groupes.
  await page.click('#liste-routines .routine');
  await attendre(700);
  await cliquerLien(0);
  await cliquerLien(1);
  await carteEditeur(2, '.geste[aria-label="Retirer"]');
  await page.click('#btn-enregistrer-routine');
  await attendre(900);
  ok('remis à plat : deux exercices, aucun groupe',
    base.exos.length === 2 && JSON.stringify(enBase()) === '[null,null]',
    base.exos.length + ' exercice(s) · ' + JSON.stringify(enBase()));

  console.log('\n══ 6. NOM EN DOUBLON, PUIS ARCHIVAGE ══');
  await page.click('#btn-nouvelle-routine');
  await attendre(400);
  await page.fill('#champ-nom-routine', 'push  ');
  await page.click('#btn-enregistrer-routine');
  await attendre(600);
  ok('le doublon est refusé avec un message clair', /déjà une routine de ce nom/.test(await texte('#erreur-routine')), await texte('#erreur-routine'));
  ok('et on est resté sur l’éditeur, rien n’est perdu', page.url().includes('/routine/'), page.url().replace(BASE, ''));

  await aller('/saisie');
  await page.click('#liste-routines .routine');
  await attendre(700);
  await page.click('#btn-archiver-routine');
  await attendre(900);
  ok('archivée : elle quitte la liste', /Aucune routine/.test(await texte('#liste-routines')), (await texte('#liste-routines')).replace(/\n+/g, ' | ').slice(0, 80));
  ok('et elle reste en base — les séances gardent leur lien',
    base.routines.length === 1 && !!base.routines[0].archivee_a, JSON.stringify(base.routines.map((r) => r.nom + (r.archivee_a ? ' (archivée)' : ''))));

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
  ok('« Push » est réutilisable après archivage', /Push/.test(await texte('#liste-routines')) && base.routines.filter((r) => !r.archivee_a).length === 1,
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
