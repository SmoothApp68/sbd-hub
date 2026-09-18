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
  { slug: 'marche', nom: 'Marche', mesure: 'distance_temps', charge: 'aucune', muscles_primaires: [], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 38. `Seance.precedent` rend la séance la PLUS
  // RÉCENTE portant l'exercice : un slug déjà utilisé par les sections
  // précédentes ferait pointer l'antécédent sur une séance du banc, et le test
  // ne mesurerait plus rien de déterministe.
  { slug: 'rowing-barre', nom: 'Rowing Barre', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['dorsaux'], muscles_secondaires: [] },
  // ⚠️ RÉSERVÉ AU CHANTIER 40, et à lui seul : « un exercice jamais fait ». Tout
  // slug que le banc utilise ailleurs finit par porter des séries, et la page
  // vide ne serait alors jamais mesurée. Son nom ne répond à aucune des
  // recherches du catalogue faites plus haut.
  { slug: 'souleve-terre', nom: 'Soulevé de Terre (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['ischios'], muscles_secondaires: [] }
];

// ⚠️ UNE ROUTINE PORTE MAINTENANT SES LIGNES (chantier 43). `routine_sets`
// remplace les deux entiers `series` / `reps_visees` : c'est de là que
// `Seance.creer` tire la structure d'une séance démarrée depuis une routine.
// Une fixture restée aux entiers démarrerait une séance à UNE série vide, et
// la moitié du banc mesurerait un écran que personne n'aura jamais.
//
// `progr(n, reps)` fabrique n lignes de TRAVAIL identiques — exactement ce que
// l'entier voulait dire, et rien de plus. La rampe d'échauffement, elle,
// s'écrit à la main : c'est la configuration discriminante du chantier, et la
// cacher derrière une aide la rendrait invisible.
let grainePr = 0;
const progr = (n, reps) => {
  const lignes = [];
  for (let i = 0; i < n; i++) {
    lignes.push({ id: 'pr' + (++grainePr), rang: i + 1, type_serie: 'travail',
      reps_visees: reps === undefined ? null : reps,
      charge_cible_kg: null, duree_cible_s: null, distance_cible_m: null });
  }
  return lignes;
};

const ROUTINE = {
  id: 'r-banc', nom: 'Push', note: null, archivee_a: null,
  created_at: '2026-09-01T08:00:00Z', modifiee_a: '2026-09-01T08:00:00Z',
  routine_exercises: [
    { id: 're1', routine_id: 'r-banc', exercise_slug: 'squat-barre', rang: 0, routine_sets: progr(3, 5), repos_cible_s: 180, groupe_superset: null, note: null },
    { id: 're2', routine_id: 'r-banc', exercise_slug: 'dc-barre', rang: 1, routine_sets: progr(2, 8), repos_cible_s: null, groupe_superset: null, note: null }
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
    { id: 'rs1', routine_id: 'r-super', exercise_slug: 'dc-barre', rang: 0, routine_sets: progr(3, 8), repos_cible_s: 90, groupe_superset: 1, note: null },
    { id: 'rs2', routine_id: 'r-super', exercise_slug: 'curl', rang: 1, routine_sets: progr(3, 12), repos_cible_s: null, groupe_superset: 1, note: null },
    { id: 'rs3', routine_id: 'r-super', exercise_slug: 'planche', rang: 2, routine_sets: progr(2, null), repos_cible_s: null, groupe_superset: 1, note: null },
    { id: 'rs4', routine_id: 'r-super', exercise_slug: 'squat-barre', rang: 3, routine_sets: progr(2, 5), repos_cible_s: 180, groupe_superset: null, note: null }
  ]
};

// ⚠️ CONFIGURATION DISCRIMINANTE DU CHANTIER 24 — les QUATRE mesures dans la
// MÊME séance. Sur une séance qui n'en contient qu'une, « la grille s'adapte »
// et « la grille est fixe » donnent exactement le même écran.
const ROUTINE_MESURES = {
  id: 'r-mesures', nom: 'Les quatre mesures', note: null, archivee_a: null,
  created_at: '2026-09-02T08:00:00Z', modifiee_a: '2026-09-02T08:00:00Z',
  routine_exercises: [
    { id: 'rm1', routine_id: 'r-mesures', exercise_slug: 'dc-barre', rang: 0, routine_sets: progr(1, 8), repos_cible_s: 120, groupe_superset: null, note: null },
    { id: 'rm2', routine_id: 'r-mesures', exercise_slug: 'tractions', rang: 1, routine_sets: progr(1, 12), repos_cible_s: null, groupe_superset: null, note: null },
    { id: 'rm3', routine_id: 'r-mesures', exercise_slug: 'planche', rang: 2, routine_sets: progr(1, null), repos_cible_s: null, groupe_superset: null, note: null },
    { id: 'rm4', routine_id: 'r-mesures', exercise_slug: 'marche', rang: 3, routine_sets: progr(1, null), repos_cible_s: null, groupe_superset: null, note: null }
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
  id: 'set-passe-' + n, session_id: PASSEE.id, user_id: 'u-banc',
  exercise_slug: 'squat-barre',
  charge_kg: 120, reps: 5, duree_s: null, distance_m: null, type_serie: 'travail',
  rang: n, groupe_superset: null, validee_a: LUNDI.toISOString(), rpe: null,
  ressenti: null, repos_s: null, note: null, source: 'import',
  created_at: LUNDI.toISOString(), modifie_a: null
}));

// ⚠️ LA SÉANCE IMPORTÉE, TELLE QUE LA BASE LA PORTE VRAIMENT (chantier 34).
//
// `SETS_PASSES` ci-dessus est une fixture IDÉALISÉE : elle porte `source` d'un
// import ET un `validee_a`. Les 28 103 lignes réelles n'ont PAS de `validee_a`
// — c'est ce que dit `SCHEMA-REEL.md`, et c'est ce que `sets_validee_si_saisie`
// autorise (la contrainte n'exige `validee_a` que pour `source = 'app'`).
//
// C'est exactement cet écart qui a caché la perte : avec un `validee_a`, la
// séance passait par le chemin normal ; sans lui, `lignes()` la rendait VIDE
// et `remplacerSeries` effaçait tout. La configuration discriminante est donc
// `validee_a` NULL **et** `source <> 'app'`, et rien d'autre.
//
// Deux exercices ENTRELACÉS (rangs 1,2,3,4 en A,B,A,B) : 53 blocs de la base
// réelle sont dans cet état, et c'est la forme qui éprouve la préservation des
// rangs à la réécriture. `ressenti` et `repos_s` sont renseignés : ce sont les
// deux colonnes que la liste de lecture oubliait.
const IMPORTEE = {
  id: 'sess-importee', user_id: 'u-banc', titre: 'Séance importée',
  debut: new Date(LUNDI.getTime() + 2 * 86400000).toISOString(),
  fin: new Date(LUNDI.getTime() + 2 * 86400000 + 3600000).toISOString(),
  statut: 'terminee', note: null, salle: null, salle_norme: null,
  routine_id: null, source: 'hevy',
  created_at: new Date(LUNDI.getTime() + 2 * 86400000).toISOString()
};

// ⚠️ DEUX BLOCS, PAS UN — ET C'EST LE CHANTIER 35 QUI L'EXIGE (§6).
// Les quatre premières lignes forment un SUPERSET entrelacé ; les deux
// dernières un exercice seul, posé après. Sans ce second bloc, « Monter le
// bloc » est inerte et le déplacement ne peut pas se mesurer — or c'est
// exactement la forme de la séance du 24/08 qui a montré les défauts : un
// superset, puis un accessoire à la fin.
const SETS_IMPORTES = [
  { slug: 'squat-barre', rang: 1, kg: 100,  groupe: 1 },
  { slug: 'dc-barre',    rang: 2, kg: 60,   groupe: 1 },
  { slug: 'squat-barre', rang: 3, kg: 105,  groupe: 1 },
  { slug: 'dc-barre',    rang: 4, kg: 62.5, groupe: 1 },
  { slug: 'curl',        rang: 5, kg: 12,   groupe: null },
  { slug: 'curl',        rang: 6, kg: 12,   groupe: null }
].map((d) => ({
  id: 'set-imp-' + d.rang, session_id: IMPORTEE.id, user_id: 'u-banc',
  exercise_slug: d.slug, charge_kg: d.kg, reps: 5,
  duree_s: null, distance_m: null, type_serie: 'travail',
  rang: d.rang, groupe_superset: d.groupe,
  validee_a: null,                       // ← LE POINT : NULL, comme les 28 103
  rpe: null, ressenti: 'reste_2', repos_s: 120, note: null,
  source: 'hevy',
  created_at: IMPORTEE.debut, modifie_a: null
}));

(async () => {
  // ── Le Supabase de papier, avec les contraintes de la vraie base ────────
  const base = {
    sessions: [Object.assign({}, PASSEE), Object.assign({}, IMPORTEE)],
    sets: SETS_PASSES.concat(SETS_IMPORTES).map((s) => Object.assign({}, s)),
    journal: [], patchs: [], reseau: true
  };

  // Le décor ne doit pas fausser les comptes des sections qui parlent de LA
  // séance en cours : on le met de côté une fois pour toutes.
  // ⚠️ DEUX DÉCORS, PAS UN. `IMPORTEE` (chantier 34) est du décor au même titre
  // que `PASSEE` : les compteurs du banc portent sur ce que la SÉANCE EN COURS
  // écrit, pas sur ce que la base contenait déjà.
  const DECORS = [PASSEE.id, IMPORTEE.id];
  const sessions = () => base.sessions.filter((s) => DECORS.indexOf(s.id) < 0);
  const sets = () => base.sets.filter((s) => DECORS.indexOf(s.session_id) < 0);

  // ⚠️ TOUT REFUS EST JOURNALISÉ (chantier 33). Un banc qui ne note pas ce que
  // le serveur a refusé ne peut pas affirmer qu'il n'a rien refusé — et c'est
  // exactement ce qu'un test de perte de données doit pouvoir prouver.
  const refus = (code, msg) => {
    base.journal.push({ op: 'refus', refus: code, message: msg });
    return { code: code, message: msg, details: msg };
  };

  // Les routines du banc, et l'index unique (routine_id, rang) de la vraie
  // base. Un instantané permet de REFUSER une écriture en la défaisant, comme
  // le ferait Postgres — sans lui, le banc laisserait passer un plan qui
  // collisionne et le device seul dirait non.
  const ROUTINES = [ROUTINE, ROUTINE_MESURES, ROUTINE_SUPERSET];
  // ⚠️ L'INSTANTANÉ COPIE AUSSI LES LIGNES PROGRAMMÉES. Sans ça, défaire une
  // écriture refusée rendrait les rangs d'avant et les séries d'après — un
  // état que la vraie base n'atteint jamais, et sur lequel la suite du banc
  // mesurerait n'importe quoi.
  const instantaneRoutines = () =>
    ROUTINES.map((r) => r.routine_exercises.map((e) => Object.assign({}, e, {
      routine_sets: (e.routine_sets || []).map((x) => Object.assign({}, x))
    })));
  const rendreRoutines = (instantane) => {
    ROUTINES.forEach((r, i) => { r.routine_exercises = instantane[i]; });
  };
  const collisionRangRoutine = () => {
    const vus = new Set();
    for (const r of ROUTINES) {
      for (const e of r.routine_exercises) {
        const c = r.id + '#' + e.rang;
        if (vus.has(c)) return true;
        vus.add(c);
      }
    }
    return false;
  };

  // ⚠️ L'UTILISATEUR DE LA SESSION DU BANC. Le RLS réel est
  // `USING (user_id = auth.uid())` avec le même `WITH CHECK` : une écriture
  // dont le `user_id` n'est pas celui du jeton est refusée par le serveur,
  // pas par le client. On imite le WITH CHECK — voir la note au-dessus de
  // `verifierSet`.
  const MOI = 'u-banc';

  function verifierSet(l) {
    // ⚠️ CE QUE CETTE IMITATION PROUVE, ET CE QU'ELLE NE PROUVE PAS.
    //
    // Elle prouve que l'APP envoie un `user_id` cohérent — c'est-à-dire
    // exactement le défaut D2 du chantier 34, où `COLONNES_SEANCE` ne relisait
    // pas la colonne et l'app renvoyait `null` après une synchro.
    //
    // Elle NE prouve PAS que la politique RLS est correcte : la vraie policy
    // vit en base, elle peut être absente, mal écrite ou désactivée sans que
    // ce banc s'en aperçoive. Un faux serveur ne teste jamais le RLS ; il teste
    // ce que le client lui donne à avaler. Confondre les deux donnerait une
    // fausse assurance, et c'est le seul endroit de ce fichier où la tentation
    // existe.
    if (l.user_id === null || l.user_id === undefined) return refus('23502', 'sets.user_id NOT NULL');
    if (l.user_id !== MOI) return refus('42501', 'new row violates row-level security policy for table "sets"');
    if (!l.exercise_slug) return refus('23502', 'sets.exercise_slug NOT NULL');
    if (!CATALOGUE.some((e) => e.slug === l.exercise_slug)) return refus('23503', 'sets_exercise_slug_fkey');
    if (['app', 'hevy', 'import', 'collage'].indexOf(l.source) < 0) return refus('23514', 'sets_source_ok');
    // GÉNÉRÉE : Postgres refuse toute valeur, même NULL — comme `salle_norme`.
    if ('elastique_norme' in l) return refus('428C9', 'elastique_norme est générée');
    // ⚠️ `sets.id` EST uuid NOT NULL (chantier 33). Ce banc ne le vérifiait pas :
    // il acceptait `id: null`, et son upsert par `findIndex` écrasait alors
    // toutes les lignes nulles les unes sur les autres — six séries devenaient
    // deux, SANS ERREUR. C'est par ce trou précis que le défaut du chantier 22
    // a traversé un banc, des tests et onze chantiers. Un banc plus permissif
    // que la base ne teste pas la base.
    if (l.id === null || l.id === undefined) return refus('23502', 'sets.id NOT NULL');
    if (l.source === 'app' && !l.validee_a) return refus('23514', 'sets_validee_si_saisie');
    if (!(l.rang >= 1)) return refus('23514', 'sets_rang_positif');
    if (['echauffement', 'travail', 'degressive', 'echec'].indexOf(l.type_serie) < 0) return refus('23514', 'sets_type_serie_ok');
    if (l.ressenti && ['reste_3_plus', 'reste_2', 'reste_1', 'reste_0'].indexOf(l.ressenti) < 0) return refus('23514', 'sets_ressenti_ok');
    if (l.rpe !== null && l.rpe !== undefined && !(l.rpe > 0 && l.rpe <= 10)) return refus('23514', 'sets_rpe_ok');
    if (l.repos_s !== null && l.repos_s !== undefined && !(l.repos_s >= 0 && l.repos_s <= 3600)) return refus('23514', 'sets_repos_borne');
    // ⚠️ `reps` ET `duree_s` SONT `integer` (chantier 36, D6). Aucun CHECK ne
    // les borne : ce qui les refuse est le TYPE. Au-delà d'`int4` Postgres
    // répond `22003` ; au-delà de 1e21 le nombre part en notation exponentielle
    // dans le JSON et devient `22P02`, code DÉFINITIF. Un banc qui accepte
    // n'importe quel entier ne peut pas voir ce défaut-là.
    for (const col of ['reps', 'duree_s']) {
      const v = l[col];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'number' || !isFinite(v)) return refus('22P02', col + ' : entier invalide');
      if (Math.abs(v) > 2147483647) return refus('22003', col + ' hors int4');
    }
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
  // ⚠️ MOUCHARD SUR `THCache.remplacerTout` (chantier 36). `cache.js` le réserve
  // aux magasins PETITS et rafraîchis en entier, et écrit noir sur blanc que
  // « les 28 103 séries ne passent pas par ici » : il VIDE le magasin puis le
  // réécrit, et une fermeture d'app au milieu le laisse à moitié plein,
  // définitivement. Supprimer UNE séance l'appelait sur `series`.
  //
  // On ENVELOPPE, on ne remplace pas : sinon on ne testerait plus que son propre
  // bouchon.
  await ctx.addInitScript(() => {
    window.__magasinsRemplaces = [];
    const poser = () => {
      if (!window.THCache || window.THCache.__espionne) return false;
      const vrai = window.THCache.remplacerTout;
      window.THCache.remplacerTout = function (magasin, enr) {
        window.__magasinsRemplaces.push(magasin);
        return vrai.call(this, magasin, enr);
      };
      window.THCache.__espionne = true;
      return true;
    };
    if (!poser()) {
      const t = setInterval(() => { if (poser()) clearInterval(t); }, 20);
      setTimeout(() => clearInterval(t), 8000);
    }
  });

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

  // ⚠️ LE FAUX SERVEUR PROJETTE LES COLONNES, COMME POSTGREST (chantier 34).
  //
  // Il renvoyait la LIGNE ENTIÈRE en ignorant `select=`. Le vrai PostgREST ne
  // renvoie que les colonnes demandées — et c'est CE seul écart qui rendait
  // invisibles les trois pertes du chantier 34 : une colonne écrite mais
  // absente de la liste de lecture revenait quand même au banc, jamais sur
  // l'appareil. Un banc plus permissif que la base ne teste pas la base.
  //
  // La syntaxe couverte est celle que `donnees.js` emploie réellement : une
  // liste séparée par des virgules, et UNE ressource imbriquée
  // (`routine_exercises(...)`). Les alias et les filtres imbriqués de
  // PostgREST ne sont pas couverts — l'app ne s'en sert pas, et imiter ce
  // qu'on n'utilise pas donnerait une assurance sur du code qui n'existe pas.
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
      // ⚠️ LA COLONNE ABSENTE DE `select=` EST ABSENTE DE LA RÉPONSE — pas
      // `null`. C'est la différence qui compte : `undefined` traverse
      // `Object.assign` sans écraser, `null` écrase.
      if (Object.prototype.hasOwnProperty.call(ligne, champ)) sortie[champ] = ligne[champ];
    }
    return sortie;
  };
  const projeter = (data, url) => {
    const select = url.searchParams.get('select');
    if (!select || !Array.isArray(data)) return data;
    const champs = decouperSelect(select);
    return data.map((l) => projeterUne(l, champs));
  };

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
      if (table === 'exercises') return json(projeter(CATALOGUE, url));
      if (table === 'routines') return json(projeter([ROUTINE, ROUTINE_MESURES, ROUTINE_SUPERSET], url));
      if (table === 'sessions') {
        const st = (url.searchParams.get('statut') || '').replace('eq.', '');
        return json(projeter(st ? base.sessions.filter((s) => s.statut === st) : base.sessions, url));
      }
      if (table === 'sets') {
        const sid = (url.searchParams.get('session_id') || '').replace('eq.', '');
        return json(projeter(sid ? base.sets.filter((s) => s.session_id === sid) : base.sets, url));
      }
      return json([]);
    }

    // ⚠️ LA MISE À JOUR D'UNE LIGNE DE ROUTINE (chantier 26). Sans ce
    // gestionnaire, un PATCH tombait dans le `json([])` final : la requête
    // « réussissait » sans rien écrire, et « la routine n'est pas touchée »
    // aurait été vrai de toute implémentation — y compris d'une qui écrit à
    // chaque geste. C'est exactement le banc plus permissif que l'appareil.
    // ⚠️ LES CHECK DE `routine_exercises` MANQUAIENT À CE BANC (chantier 36).
    //
    // Le banc des routines les applique depuis le chantier 34 ; celui-ci, non.
    // Or c'est ICI que passe le REPORT DE FIN DE SÉANCE — le seul chemin qui
    // n'appelle pas `Routines.valider()`. Le défaut D5 était donc structurellement
    // invisible : le banc qui voit le geste ne vérifiait pas la contrainte, et le
    // banc qui vérifie la contrainte ne voit pas le geste.
    // ⚠️ ET CELLES DE `routine_sets` (chantier 43), qui ne sont PAS les mêmes :
    // le rang y commence à 1, là où celui d'un exercice accepte 0. C'est ici
    // que passe le report de fin de séance — le seul chemin qui n'appelle pas
    // `Routines.valider()` — donc c'est ici qu'un 23514 définitif naîtrait.
    const checkRoutineSet = (l) => {
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
      return null;
    };
    const exoDeSerie = (id) => {
      for (const r of ROUTINES) {
        const e = r.routine_exercises.filter((x) => x.id === id)[0];
        if (e) return e;
      }
      return null;
    };

    const checkRoutineExo = (l) => {
      if (l.reps_visees !== null && l.reps_visees !== undefined &&
          !(l.reps_visees >= 1 && l.reps_visees <= 100)) return 'routine_exos_reps_bornees';
      if (l.repos_cible_s !== null && l.repos_cible_s !== undefined &&
          !(l.repos_cible_s >= 5 && l.repos_cible_s <= 1800)) return 'routine_exos_repos_borne';
      if (l.groupe_superset !== null && l.groupe_superset !== undefined &&
          !(l.groupe_superset >= 0)) return 'routine_exos_superset_positif';
      if (l.rang !== undefined && !(l.rang >= 0)) return 'routine_exos_rang_positif';
      return null;
    };

    if (req.method() === 'PATCH' && table === 'routine_exercises') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const champs = Array.isArray(corps) ? corps[0] : corps;
      base.patchs.push({ id: id, champs: Object.assign({}, champs) });
      const malPatch = checkRoutineExo(champs);
      if (malPatch) return json(refus('23514', malPatch), 400);
      const avant = instantaneRoutines();
      for (const r of ROUTINES) {
        const i = r.routine_exercises.findIndex((e) => e.id === id);
        if (i >= 0) r.routine_exercises[i] = Object.assign({}, r.routine_exercises[i], champs);
      }
      // ⚠️ `routine_exos_rang_uniq` N'EST PAS DIFFÉRÉE, elle. Contrairement à
      // `sets_rang_unique`, elle se vérifie À CHAQUE ÉNONCÉ : un plan qui passe
      // par un état intermédiaire en collision est refusé au milieu, la routine
      // à moitié écrite. C'est la contrainte qui fait tout l'intérêt du plan.
      if (collisionRangRoutine()) { rendreRoutines(avant);
        return json(refus('23505', 'routine_exos_rang_uniq'), 409); }
      return json([]);
    }

    if (req.method() === 'POST' && table === 'routine_exercises') {
      const lignes = (Array.isArray(corps) ? corps : [corps]).map((l) => Object.assign({}, l));
      base.patchs.push({ op: 'insert', lignes: lignes });
      for (const l of lignes) {
        const mal = checkRoutineExo(l);
        if (mal) return json(refus('23514', mal), 400);
      }
      const avant = instantaneRoutines();
      for (const l of lignes) {
        const r = ROUTINES.filter((x) => x.id === l.routine_id)[0];
        if (r) r.routine_exercises.push(l);
      }
      if (collisionRangRoutine()) { rendreRoutines(avant);
        return json(refus('23505', 'routine_exos_rang_uniq'), 409); }
      return json(lignes, 201);
    }

    // Le remplacement en bloc des lignes d'un exercice : DELETE par parent,
    // puis INSERT. `routine_sets_rang_unique` est DIFFÉRABLE, donc l'état
    // intermédiaire est légal et seule la fin compte.
    if (req.method() === 'DELETE' && table === 'routine_sets') {
      const parent = (url.searchParams.get('routine_exercise_id') || '').replace('eq.', '');
      base.patchs.push({ op: 'delete-series', id: parent });
      const e = exoDeSerie(parent);
      if (e) e.routine_sets = [];
      return json([]);
    }

    if (req.method() === 'POST' && table === 'routine_sets') {
      const lignes = (Array.isArray(corps) ? corps : [corps]).map((l) => Object.assign({}, l));
      base.patchs.push({ op: 'insert-series', lignes: lignes });
      for (const l of lignes) {
        const mal = checkRoutineSet(l);
        if (mal) return json(refus('23514', mal), 400);
      }
      const avant = instantaneRoutines();
      for (const l of lignes) {
        const e = exoDeSerie(l.routine_exercise_id);
        if (!e) { rendreRoutines(avant);
          return json(refus('23503', 'routine_sets_routine_exercise_id_fkey'), 400); }
        e.routine_sets = (e.routine_sets || []).concat([Object.assign({ id: 'pr' + (++grainePr) }, l)]);
      }
      for (const r of ROUTINES) {
        for (const e of r.routine_exercises) {
          const vus = new Set();
          for (const x of (e.routine_sets || [])) {
            if (vus.has(x.rang)) { rendreRoutines(avant);
              return json(refus('23505', 'routine_sets_rang_unique'), 409); }
            vus.add(x.rang);
          }
        }
      }
      return json(lignes, 201);
    }

    if (req.method() === 'DELETE' && table === 'routine_exercises') {
      const brut = url.searchParams.get('id') || '';
      const ids = brut.startsWith('in.')
        ? brut.slice(4, -1).split(',').map((x) => x.replace(/"/g, ''))
        : [brut.replace('eq.', '')];
      base.patchs.push({ op: 'delete', ids: ids });
      for (const r of ROUTINES) {
        r.routine_exercises = r.routine_exercises.filter((e) => ids.indexOf(e.id) < 0);
      }
      return json([]);
    }

    if (req.method() === 'POST' && table === 'sessions') {
      const l = Array.isArray(corps) ? corps[0] : corps;
      base.journal.push({ op: 'session', id: l.id, statut: l.statut });
      // ⚠️ LE DÉFAUT DE LA COLONNE, PAS UN REFUS (chantier 34). `sessions.statut`
      // vaut `'terminee'` PAR DÉFAUT en base : une omission est ACCEPTÉE et
      // rend la séance immédiatement réputée finie. Refuser l'omission, comme
      // ce banc le faisait, produisait un symptôme bruyant là où la production
      // produit une corruption muette — le contraire d'un banc utile.
      if (!('statut' in l)) l.statut = 'terminee';
      if (['en_cours', 'terminee'].indexOf(l.statut) < 0) return json(refus('23514', 'sessions_statut_ok'), 400);
      if (l.user_id === null || l.user_id === undefined) return json(refus('23502', 'sessions.user_id NOT NULL'), 400);
      if (l.user_id !== MOI) return json(refus('42501', 'new row violates row-level security policy for table "sessions"'), 400);
      if (!l.debut) return json(refus('23502', 'sessions.debut NOT NULL'), 400);
      if (l.source === null || l.source === undefined) return json(refus('23502', 'sessions.source NOT NULL'), 400);
      // ⚠️ `sessions_une_seule_en_cours` — INDEX UNIQUE, NON DIFFÉRABLE, sur
      // (user_id) WHERE statut = 'en_cours'. Il n'est ni dans `SCHEMA-REEL.md`
      // ni dans aucun banc, et c'est lui qui fait qu'une séance restée ouverte
      // en base empêche DÉFINITIVEMENT d'en démarrer une autre : 23505 est un
      // code définitif, donc la file se bloque derrière.
      if (l.statut === 'en_cours' && base.sessions.some(
            (x) => x.id !== l.id && x.user_id === l.user_id && x.statut === 'en_cours')) {
        return json(refus('23505', 'sessions_une_seule_en_cours'), 409);
      }
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
      // ⚠️ `sets_pkey` — deux lignes d'un même lot ne peuvent pas partager un
      // identifiant (chantier 34, défaut D4). Le banc les écrasait l'une sur
      // l'autre en silence : six séries en devenaient deux, et le banc
      // applaudissait. C'est la forme exacte du défaut du chantier 33, une
      // contrainte plus loin.
      const idsDuLot = lignes.map((l) => l && l.id);
      if (new Set(idsDuLot).size !== idsDuLot.length) {
        return json(refus('23505', 'duplicate key value violates unique constraint "sets_pkey"'), 409);
      }
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

    // ⚠️ LE PATCH SUR `sessions` MANQUAIT (chantier 36, D7), et c'est le même
    // piège qu'au chantier 26 : sans gestionnaire, il tombait dans le `json([])`
    // final. La requête « réussissait » sans rien écrire — donc « la séance
    // restée ouverte est refermée » aurait été vrai de toute implémentation, y
    // compris d'une qui ne fait rien.
    if (req.method() === 'PATCH' && table === 'sessions') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const champs = Array.isArray(corps) ? corps[0] : corps;
      base.journal.push({ op: 'patch-session', id: id, champs: Object.assign({}, champs) });
      // GÉNÉRÉE : Postgres refuse toute écriture sur `salle_norme`, même NULL.
      if ('salle_norme' in champs) return json(refus('428C9', 'salle_norme est générée'), 400);
      if (champs.statut !== undefined &&
          ['en_cours', 'terminee'].indexOf(champs.statut) < 0) {
        return json(refus('23514', 'sessions_statut_ok'), 400);
      }
      const i = base.sessions.findIndex((x) => x.id === id);
      if (i < 0) return json([]);
      const apres = Object.assign({}, base.sessions[i], champs);
      // Et l'index unique se vérifie ICI aussi : repasser une séance `en_cours`
      // alors qu'une autre l'est déjà est exactement ce qu'il interdit.
      if (apres.statut === 'en_cours' && base.sessions.some(
            (x) => x.id !== id && x.user_id === apres.user_id && x.statut === 'en_cours')) {
        return json(refus('23505', 'sessions_une_seule_en_cours'), 409);
      }
      base.sessions[i] = apres;
      return json([]);
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

  // ⚠️ [50] C'EST UN COMPTE À REBOURS (§7 quatervicies). À l'armement, le grand
  // nombre vaut la CIBLE ENTIÈRE — un chronomètre montant afficherait 0:00 ou
  // 0:01. Les deux lectures se séparent ici, à la seconde près.
  const barreRebours = () => page.evaluate(() => ({
    grand: ((document.querySelector('#repos .repos-g') || {}).textContent || '').trim(),
    largeur: parseInt(((document.querySelector('#repos .piste i') || {}).style || {}).width, 10)
  }));
  const rebours0 = await barreRebours();
  ok('[50] à l’armement, le rebours affiche la cible entière — pas 0:00',
    /^(3:00|2:5[0-9])$/.test(rebours0.grand), 'affiché ' + rebours0.grand);
  ok('[50] …et la piste part PLEINE, pour se vider ensuite',
    rebours0.largeur >= 95, 'piste à ' + rebours0.largeur + '%');

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
  // ⚠️ DEUX séances de décor depuis le chantier 34 (`PASSEE` et `IMPORTEE`),
  // toutes deux TERMINÉES et dans la semaine affichée. Ce qui est éprouvé ici
  // reste intact : la séance EN COURS, elle, n'y entre pas.
  ok('les totaux de la semaine ne comptent QUE les séances terminées',
    /^2 séances · 8 séries de travail$/.test(totaux), totaux);
  ok('la liste ne montre que les deux cartes du décor', (await compter('.jour .seance')) === 2,
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
  // §7 undecies.1 — hors superset, le badge porte `W` : il n'y a pas de lettre
  // d'exercice à porter, et « C » se confondait avec la charge.
  ok('le numéro porte le type : la série devient une chauffe',
    (await lire(0, '.no-serie')) === 'W' &&
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

  // ══ §7 novodecies — UN REPOS DÉSACTIVÉ N'ARME AUCUN CHRONOMÈTRE ═════════
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater) : le deuxième bloc ne prescrit
  // PAS de repos (`repos_cible_s` null), le premier en prescrit 180. Si tous
  // les repos étaient désactivés, « lit la valeur » et « n'arme jamais »
  // rendraient le même écran — et une implémentation qui n'arme plus rien du
  // tout passerait pour correcte.
  //
  // ⚠️ CE BANC BÉNISSAIT LE DÉFAUT. Jusqu'au chantier 45 il validait une série
  // sur l'exercice SANS repos et vérifiait que « la cible s'affiche absente » —
  // c'est-à-dire que la barre était LÀ, à compter sans but. Il travaillait
  // exprès sur cet exercice, « le cas le plus exigeant ». C'était le cas
  // INTERDIT, et personne ne l'a vu parce que la mesure regardait le texte de
  // la barre au lieu de son existence.
  const barreVisible = () => page.evaluate(() => {
    const n = document.getElementById('repos');
    return !!n && !n.hidden;
  });
  // ⚠️ DÉFINIS ICI, PAS PLUS BAS. Les mêmes accesseurs existent à la section
  // 7 septies, mais `const` ne se hisse pas : les appeler d'ici serait une
  // erreur de zone morte. Trois lignes recopiées valent mieux qu'un
  // déplacement qui décalerait tout le reste du banc.
  const toucherBloc = async (iBloc, sel) => {
    await page.evaluate(([k, x]) => {
      document.querySelectorAll('.bloc-seance')[k].querySelector(x).click();
    }, [iBloc, sel]);
    await attendre(400);
  };
  const lireDansBloc = (iBloc, sel) => page.evaluate(([k, x]) =>
    (document.querySelectorAll('.bloc-seance')[k].querySelector(x) || {}).textContent || '',
    [iBloc, sel]);
  const lignesDuBloc = (iBloc) => page.evaluate((k) =>
    document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.ligne-serie').length, iBloc);
  const molette = async (secondes) => {
    await page.evaluate((v) => {
      const p = document.querySelector('#feuille-contenu .molette .piste');
      const opts = Array.from(p.querySelectorAll('.opt'));
      p.scrollTop = opts.findIndex((o) => Number(o.dataset.v) === v) * 48;
      p.dispatchEvent(new Event('scroll'));
    }, secondes);
    await attendre(250);
    await page.click('#feuille-contenu .feuille-pied .pri');
    await attendre(700);
  };

  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const derniere = (await compter('.ligne-serie')) - 1;
  await saisirSerie(derniere, 80, 10);
  ok('[45] repos DÉSACTIVÉ : valider n’arme AUCUN chronomètre',
    (await barreVisible()) === false,
    'barre visible = ' + (await barreVisible()) +
    ' · « ' + (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 40) + ' »');

  // L'autre moitié, sur le bloc d'à côté : un repos prescrit arme, lui.
  // ⚠️ SUR UNE LIGNE NEUVE, jamais sur la ligne 0. À ce stade de la séance les
  // premières lignes sont DÉJÀ validées : `saisirSerie` retape la coche, donc
  // les DÉvaliderait — et une barre absente passerait alors pour la preuve que
  // rien n'arme, alors qu'on vient juste de tout défaire.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  const neuveA = (await lignesDuBloc(0)) - 1;   // le bloc 0 ouvre la liste : index global = index local
  await saisirSerie(neuveA, 100, 5);
  ok('[45] …et l’exercice d’à côté, lui, arme bien sur sa cible',
    (await barreVisible()) === true && /cible 3:00/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));

  // ⚠️ ET LE CHEMIN POUR EN POSER UN RESTE OUVERT : la molette, sous le nom de
  // l'exercice (§7 sexdecies). Ce n'est donc pas une capacité perdue — c'est la
  // barre qui cesse d'être la porte d'entrée d'un repos qui n'existe pas.
  await toucherBloc(1, '.repos-cible');
  await molette(15);
  ok('[45] la molette pose un repos sur l’exercice qui n’en avait pas',
    /repos 0:15/.test(await lireDansBloc(1, '.repos-cible')),
    await lireDansBloc(1, '.repos-cible'));
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const derniereB = (await compter('.ligne-serie')) - 1;
  await saisirSerie(derniereB, 80, 10);
  ok('[45] et LÀ, valider arme — sur la cible qu’on vient de poser',
    (await barreVisible()) === true && /cible 0:15/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));

  // ⚠️ ASSERTION RETOURNÉE DEUX FOIS — 47 PUIS 49 — ET VOICI POURQUOI.
  //
  //   · avant le 47, elle exigeait « cible — » après les −15 : l'état que le
  //     §7 novodecies interdit, une cible ni armée ni désactivée sur laquelle
  //     `reposFige` rend faux pour toute seconde — un chronomètre qui compte
  //     sans jamais se figer. Le banc ne constatait pas le défaut, il le
  //     VERROUILLAIT, deux chantiers durant ;
  //   · au 47, elle exigeait 0:15 : le −15 REFUSAIT de descendre. Bonne règle,
  //     mauvais objet — elle protège le repos PRESCRIT, pas le décompte ;
  //   · au 49 (§7 tervicies), à zéro le repos est FINI : la barre S'EN VA.
  //
  // C'est ce que fait n'importe quel minuteur, et c'est ce que le §7 novodecies.2
  // disait déjà de ces boutons : « ajuster une cible pendant qu'elle court ».
  // Une cible qui court peut arriver à son terme.
  //
  // ⚠️ LA MESURE EST L'EXISTENCE DE LA BARRE, pas son texte. C'est la leçon du
  // §7 novodecies, répétée ici : lire « cible — », c'était décrire un état
  // qui n'aurait jamais dû s'afficher. Les bornes de l'arithmétique (50 s, la
  // cible non multiple de 15 du §2 quater) se prouvent en unitaire, où elles
  // coûtent une milliseconde — ici on prouve l'OBSERVABLE.
  await cliqueRepos(MOINS);
  ok('[49] −15 depuis 0:15 → le repos est FINI, et la barre s’en va',
    (await barreVisible()) === false,
    'barre ' + ((await barreVisible()) ? 'encore là' : 'partie'));

  // ⚠️ ET LE REPOS PRESCRIT N'A PAS BOUGÉ (§5.4 du prompt). C'est l'autre moitié
  // du §7 tervicies : deux objets distincts portent le même nom, et raccourcir
  // le décompte ne touche pas la consigne. Si le réglage de la barre écrivait
  // sur l'exercice, la molette afficherait « repos — » ici.
  ok('[49] …et le repos PRESCRIT de l’exercice est intact',
    /repos 0:15/.test(await lireDansBloc(1, '.repos-cible')),
    await lireDansBloc(1, '.repos-cible'));

  // On réarme pour la suite : valider une série repart de la cible prescrite,
  // qui vaut toujours 15 s. Sans ça, tout ce qui suit mesurerait une barre
  // absente — et l'échéance, le dépassement et la sourdine passeraient à vide.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[1].click());
  await attendre(600);
  const rearmee = (await compter('.ligne-serie')) - 1;
  await saisirSerie(rearmee, 80, 10);
  ok('[49] valider une série réarme sur la cible prescrite, inchangée',
    (await barreVisible()) === true && /cible 0:15/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));

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
  // ⚠️ [50] ON LIT LE GRAND NOMBRE, PAS TOUT LE BANDEAU. Avec le rebours il
  // affiche 0:00 — mais l'étiquette à côté dit toujours « cible 0:15 », si
  // bien qu'un `/0:15/` sur `#repos` entier passerait quoi qu'il arrive. C'est
  // le même piège que le « cible — » du §7 novodecies : mesurer le texte
  // autour plutôt que la valeur.
  const finRebours = (await texte('#repos .repos-g')).trim();
  ok('et il reste ARRÊTÉ à 0:00, sans alarme ni négatif qui grossit',
    finRebours === '0:00', 'affiché ' + finRebours);

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

  // ⚠️ PAS DE « +15 » ICI. Depuis le chantier 45 cet exercice porte un repos de
  // 0:15 — posé à la molette plus haut — et la validation arme donc déjà sur
  // 0:15. L'ajouter porterait la cible à 0:30, que les 17 s d'attente
  // n'atteindraient jamais : le banc conclurait « pas de vibration » sur un
  // chronomètre qui n'a simplement pas fini. Avant le chantier 45, la barre
  // s'ouvrait ici SANS cible, et le « +15 » était le seul moyen d'en poser une.
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
  await page.click('#bandeau-seance .bandeau-fin');
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
    /^3 séances · \d+ séries de travail$/.test(totauxFin), totauxFin);
  ok('et elle prend sa carte dans la liste', (await compter('.jour .seance')) === 3,
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
  await page.click('#bandeau-seance .bandeau-fin');
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
  //
  // ⚠️ ET IL FAUT L'ARMER EXPRÈS (chantier 45). Cette séance-là finit sur
  // `marche`, qui ne prescrit AUCUN repos : depuis que le chronomètre ne s'arme
  // plus sans cible, la barre est fermée en arrivant ici et il n'y aurait plus
  // rien à mesurer. On valide donc une série neuve sur le développé, seul
  // exercice des quatre mesures à porter un repos (120 s). Avant le chantier
  // 45, la barre traînait ouverte « cible — » et le banc s'en contentait.
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  const neuveMesures = await page.evaluate(() =>
    document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.ligne-serie').length - 1);
  await saisirSerie(neuveMesures, 80, 6);
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
  await page.click('#bandeau-seance .bandeau-fin');
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
  //
  // ⚠️ LA MOLETTE, LA MÊME QU'À L'ÉDITEUR (§7 sexdecies). La grille de huit
  // valeurs est partie au chantier 44 : elle et le pavé de l'éditeur disaient
  // la même chose, pour la même question. Il n'en reste qu'un écran — et ce
  // banc et celui des routines parcourent maintenant le MÊME composant.
  const reglerRepos = async (secondes) => {
    await page.evaluate((v) => {
      const p = document.querySelector('#feuille-contenu .molette .piste');
      const opts = Array.from(p.querySelectorAll('.opt'));
      const i = opts.findIndex((o) => Number(o.dataset.v) === v);
      p.scrollTop = i * 48;
      p.dispatchEvent(new Event('scroll'));
    }, secondes);
    await attendre(250);
  };
  const sortieRepos = async (classe) => {
    await page.click('#feuille-contenu .feuille-pied .' + classe);
    await attendre(900);
  };
  const patchsAvantRepos = patchsRoutine().length;
  await ouvrirFeuilleBloc(0, '.repos-cible');
  ok('[44] un appui sur le repos ouvre la MOLETTE — 36 valeurs, pas 8',
    /Temps de repos/.test(await texte('#feuille-contenu')) &&
    (await compter('#feuille-contenu .molette .opt')) === 36 &&
    (await compter('#feuille-contenu .grille-rpe button')) === 0,
    (await compter('#feuille-contenu .molette .opt')) + ' valeur(s)');
  // ⚠️ ET ELLE DIT QUE LA ROUTINE N'EST PAS TOUCHÉE. C'est la seule chose qui
  // diffère entre les deux écrans : la phrase, pas le composant.
  ok('[44] …et elle rappelle que la routine n’est pas touchée',
    /La routine n’est pas touchée/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 90));
  await reglerRepos(120);
  await sortieRepos('pri');
  ok('le repos cible change à l’écran, tout de suite',
    /repos 2:00/.test(await lireBloc(0, '.repos-cible')), await lireBloc(0, '.repos-cible'));
  ok('et RIEN n’est écrit dans la routine au moment du geste (§7 septies.2)',
    patchsRoutine().length === patchsAvantRepos &&
    ROUTINE.routine_exercises[0].repos_cible_s === 180,
    patchsRoutine().length + ' PATCH · routine à ' + ROUTINE.routine_exercises[0].repos_cible_s);

  // ── Le chronomètre s'arrête à l'échéance ───────────────────────────────
  //
  // ⚠️ SUR LE PREMIER BLOC, DEPUIS LE CHANTIER 45. Cette section travaillait sur
  // le SECOND — celui dont la routine ne prescrit AUCUN repos — et posait la
  // cible « entièrement à la main » avec quatre +15. Ce chemin n'existe plus :
  // un repos désactivé n'arme aucun chronomètre, donc il n'y a plus de barre à
  // laquelle parler. On part maintenant du premier bloc, dont le repos vient
  // d'être porté à 2:00 juste au-dessus, et on DESCEND à 1:00 avec quatre −15.
  // Les nombres qui suivent sont inchangés, et le sujet du test non plus : ce
  // qu'il mesure, c'est l'arrêt à l'échéance et la relance, pas l'armement.
  //
  // ⚠️ ET SUR UNE LIGNE NEUVE : les quatre premières sont déjà validées, les
  // retaper les DÉvaliderait (et ne relancerait aucun chronomètre).
  console.log('   … 30 s de chronomètre réel');
  await page.evaluate(() => document.querySelectorAll('.ajout-serie button')[0].click());
  await attendre(600);
  await saisirSerie(4, 60, 8);   // 5ᵉ ligne du bloc 0 : l'index global vaut encore 4
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

  await cliqueRepos2(0, 4);                 // −15 ×4 : 2:00 → cible 1:00
  ok('la cible réglée à la main vaut 1:00', /cible 1:00/.test(await texte('#repos')),
    (await texte('#repos')).replace(/\s+/g, ' ').slice(0, 50));
  // ⚠️ [50] IL DÉCOMPTE, il ne compte pas. « t1 ≠ t2 » passait dans les deux
  // sens et ne distinguait donc pas un rebours d'un chronomètre montant : on
  // compare les secondes, et on exige que ça DIMINUE.
  const enSecondes = (t) => {
    const m = /^(\d+):(\d\d)$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const t1 = await chrono();
  await attendre(20000);                    // écoulé ≈ 21 s, bien sous la cible
  const t2 = await chrono();
  ok('sous la cible, il DÉCOMPTE', enSecondes(t2) < enSecondes(t1) && (await figeQ()) === false,
    t1 + ' → ' + t2);

  // ⚠️ LE CAS SIGNALÉ : trois −15 font passer la cible (1:00 → 0:15) DERRIÈRE
  // le temps écoulé (≈ 22 s). Le chronomètre doit s'arrêter là, alors qu'il n'a
  // jamais franchi d'échéance en montant.
  await cliqueRepos2(0, 3);
  const apresMoins = await chrono();
  await attendre(4000);
  const encore = await chrono();
  // ⚠️ [50] 0:00, ET PLUS 0:15. La cible passe DERRIÈRE l'écoulé : il ne reste
  // rien à décompter. L'ancienne valeur était la cible elle-même, parce que le
  // grand nombre montait vers elle et s'y figeait.
  ok('un −15 qui FRANCHIT la cible arrête le chronomètre à 0:00', apresMoins === '0:00',
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
    enSecondes(reparti) > 0 && reparti !== apresMoins && (await figeQ()) === false,
    apresMoins + ' → ' + reparti);
  // ⚠️ DEUX LECTURES, PAS UNE. `ajusterRepos` redessine lui-même une fois : une
  // seule mesure après le +15 verrait une valeur neuve même avec un minuteur
  // mort, et le chronomètre resterait figé sur elle pour toujours.
  await attendre(3200);
  const reparti2 = await chrono();
  ok('et il CONTINUE de descendre ensuite, minuteur bien relancé',
    enSecondes(reparti2) < enSecondes(reparti), reparti + ' → ' + reparti2);

  // ── L'écran de fin ─────────────────────────────────────────────────────
  await page.click('#bandeau-seance .bandeau-fin');
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

  // ⚠️ `p.champs` : `base.patchs` porte aussi les écritures de `routine_sets`
  // depuis le chantier 43, et une entrée `delete-series` porte le MÊME `id` —
  // celui de l'exercice parent. Sans ce filtre, `.pop()` rend la suppression
  // des séries, qui n'a pas de `champs`.
  const patch = patchsRoutine().filter((p) => p.id === 're1' && p.champs).pop();
  ok('« Reporter » écrit les écarts sur la routine, et RIEN d’autre',
    !!patch && JSON.stringify(Object.keys(patch.champs).sort()) === '["note","repos_cible_s"]' &&
    patch.champs.repos_cible_s === 120 && /Ceinture/.test(patch.champs.note || ''),
    JSON.stringify(patch && patch.champs));

  // ⚠️ « RIEN D'AUTRE » VAUT AUSSI POUR LES SÉRIES (mutation M30, chantier 43).
  //
  // `planEcritures` REMPLACE les lignes d'un exercice — supprime puis réinsère.
  // Appliqué sans condition, le report réécrivait donc la structure de TOUS les
  // exercices à chaque passage, changés ou non : six suppressions et six
  // insertions pour n'avoir rien changé. L'assertion d'au-dessus ne le voyait
  // pas (aucune de ces colonnes ne ressemble à une charge), et c'est exactement
  // ce qu'une mutation a montré. Ici la déviation ne touche que le repos et la
  // note : AUCUNE ligne ne doit bouger.
  const ecrituresSeries = patchsRoutine()
    .filter((p) => p.op === 'insert-series' || p.op === 'delete-series');
  ok('[43] …et aucune ligne programmée n’est réécrite quand elle n’a pas changé',
    ecrituresSeries.length === 0,
    ecrituresSeries.length + ' écriture(s) de `routine_sets`');

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
  await page.click('#bandeau-seance .bandeau-fin');
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
  await reglerRepos(180);
  await sortieRepos('pri');
  const patchsAvantGarder = patchsRoutine().length;
  await page.click('#bandeau-seance .bandeau-fin');
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
  // §7 undecies.3 — le compteur affiche les tours FAITS : rien de fait, 0/3.
  ok('au départ, aucun tour n’est fait : 0/3', /tour 0\/3/.test(await superT()),
    (await superT()).trim());

  // Rangée 0 = A1. Validée seule, elle n'allume rien : le tour n'est pas fait.
  await validerRangee(0, 0);
  ok('valider A1 seul n’allume RIEN — l’éclairage porte sur le tour',
    (await allumees(0)).every((x) => x === false) && /tour 0\/3/.test(await superT()),
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
  ok('et le tour annoncé avance', /tour 1\/3/.test(await superT()), (await superT()).trim());

  // ⚠️ DÉVALIDER NE FAIT PAS RECULER LE TOUR — asymétrie assumée (§2.7).
  await validerRangee(0, 0);          // dévalide A1
  ok('dévalider ne fait PAS reculer le tour', /tour 1\/3/.test(await superT()),
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
  await page.click('#bandeau-seance .bandeau-fin');
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

  console.log('\n══ 7 nonies. LA DÉVIATION — MENU DE BLOC, MODIFIER, REPORT ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : UN SUPERSET À TROIS
  // EXERCICES, ET UN DÉPLACEMENT AU MILIEU DE LA LISTE.
  //
  // Sur un superset à DEUX, « sortir un exercice » et « dissoudre le bloc »
  // donnent exactement le même écran : il reste deux blocs d'un seul dans les
  // deux cas. Il faut un troisième pour que la différence existe — l'un sort,
  // les deux autres restent groupés. Et en déplaçant le DERNIER bloc,
  // « renuméroter les rangs » et « ne rien faire » sont indistinguables : rien
  // ne bouge derrière lui. Le déplacement se fait donc AU MILIEU, là où les
  // rangs de tout ce qui suit doivent suivre sans se heurter à
  // `sets_rang_unique`.
  await aller('/saisie');
  await demarrerRoutine('Superset');

  const menuBloc = async (i) => {
    await page.evaluate((k) => {
      document.querySelectorAll('.bloc-seance')[k].querySelector('.tete-haut .menu-pts').click();
    }, i);
    await attendre(500);
  };
  // ⚠️ « MONTER LE BLOC » A QUITTÉ LE MENU AU CHANTIER 46 (§7 vicies.1) : le
  // menu porte désormais « Réorganiser… », qui ouvre le mode. Les deux flèches
  // vivent sur le bloc REPLIÉ, où elles restent le chemin accessible au clavier.
  // Le banc passe donc par le mode — et sa sortie « Terminé », qui ENREGISTRE.
  const deplacerBlocParMode = async (i, sens) => {
    await page.click('#bandeau-seance .bandeau-modifier');
    await attendre(600);
    await page.evaluate(([k, d]) => {
      document.querySelectorAll('.bloc-seance.replie')[k]
        .querySelector('.geste[aria-label="' + (d === 'haut' ? 'Monter' : 'Descendre') + ' le bloc"]')
        .click();
    }, [i, sens]);
    await attendre(700);
    await page.click('#bandeau-seance .bandeau-modifier');
    await attendre(900);
  };
  const menuExo = async (i, k) => {
    await page.evaluate(([b, x]) => {
      document.querySelectorAll('.bloc-seance')[b]
        .querySelectorAll('.legende-haut .menu-pts')[x].click();
    }, [i, k]);
    await attendre(500);
  };
  const entreesFeuille = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
      .map((b) => b.textContent + (b.disabled ? ' (inerte)' : '')));
  const entree = async (motif) => {
    await page.evaluate((m) => {
      const b = Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => new RegExp(m).test(x.textContent))[0];
      b.click();
    }, motif);
    await attendre(700);
  };
  const choisirCatalogue = async (q) => {
    await page.fill('#champ-recherche-exo', q);
    await attendre(350);
    await page.click('#resultats-exo .resultat');
    await attendre(800);
  };
  // La forme de la séance : un tableau de blocs, chacun la liste de ses noms.
  // ⚠️ PAS LE TEXTE ENTIER : le nom est précédé de sa lettre dans un superset
  // (`A`, `B`, `C`), et replié il vit dans `.replie-nom`. Le même appel doit
  // lire les deux vues, sinon le mode Modifier ne se mesure pas.
  // ⚠️ ET PAS `span:last-child` : depuis le chantier 40, le nom en séance est un
  // BOUTON qui mène à la page d'exercice (§2.8). On lit `.nom-exo`, qui est
  // porté par les deux formes, et on retombe sur le dernier `span` pour la vue
  // repliée.
  const formeEcran = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.bloc-seance')).map((b) =>
      Array.from(b.querySelectorAll('.exo-seance, .replie-nom'))
        .map((n) => (n.querySelector('.nom-exo') || n.querySelector('span:last-child')).textContent)));
  // ⚠️ LES SÉRIES DE **CETTE** SÉANCE. `sets()` écarte le décor, pas les séances
  // des sections précédentes : à la septième, elles sont une vingtaine, et
  // « 2 séries validées » serait faux de toute implémentation.
  const setsSeance = () => base.sets.filter((s) => s.session_id === seanceCourante());
  const rangsBase = () => setsSeance().slice().sort((a, b) => a.rang - b.rang)
    .map((s) => s.exercise_slug + '@' + s.rang);

  // ── §5 bis — le menu est là PENDANT qu'on saisit ────────────────────────
  ok('le menu de bloc est accessible sans passer par Modifier',
    (await compter('.tete-haut .menu-pts')) === 2 &&
    (await compter('.legende-haut .menu-pts')) === 3 &&
    (await compter('.bloc-seance.replie')) === 0,
    (await compter('.tete-haut .menu-pts')) + ' menu(s) de bloc · ' +
    (await compter('.legende-haut .menu-pts')) + ' menu(s) d’exercice');

  await menuBloc(1);
  ok('sur un bloc d’UN SEUL, le menu porte aussi les gestes de l’exercice',
    (await entreesFeuille()).join(' | ').indexOf('Remplacer') >= 0 &&
    (await entreesFeuille()).join(' | ').indexOf('Supprimer l’exercice') >= 0,
    (await entreesFeuille()).join(' | '));
  // §2.8 — « voir la progression » a été inerte du chantier 27 au 40 : la page
  // d'exercice (§7 quater) n'existait pas. Elle existe.
  ok('[40] « Voir la progression » est CÂBLÉ sur un bloc d’un seul',
    (await entreesFeuille()).some((t) => /^Voir la progression$/.test(t)),
    (await entreesFeuille()).join(' | '));
  await fermerFeuille();

  // §5.6 — sur un SUPERSET, « Remplacer » n'a pas de sens au niveau du bloc :
  // il faut dire LEQUEL des trois. Le geste vit sur la branche, et le menu du
  // bloc ne le propose pas — masqué, pas grisé.
  await menuBloc(0);
  ok('sur un SUPERSET, le menu du bloc ne propose PAS « Remplacer »',
    !(await entreesFeuille()).some((t) => /Remplacer/.test(t)) &&
    (await entreesFeuille()).some((t) => /Supprimer le bloc/.test(t)),
    (await entreesFeuille()).join(' | '));
  // ⚠️ L'ASYMÉTRIE EST LA MESURE. Sur un bloc d'un seul il est actif, sur un
  // superset il est grisé — « la progression de QUEL exercice ? » n'a pas de
  // réponse au niveau du bloc. Sans les deux côtés, « câblé » et « inerte »
  // rendraient le même écran.
  ok('[40] mais « Voir la progression » y reste GRISÉ — le bloc ne tranche pas',
    (await entreesFeuille()).some((t) => /Voir la progression \(inerte\)/.test(t)),
    (await entreesFeuille()).join(' | '));
  await fermerFeuille();

  // ── §5.8 — SORTIR UN EXERCICE, celui du MILIEU ──────────────────────────
  // ⚠️ UN TOUR ENTIER, PAS DEUX LIGNES. Une marque de tour ne se voit reculer
  // que si elle a d'abord avancé : avec un tour incomplet, « les marques sont
  // re-semées après un geste » et « elles sont perdues » donnent le même écran.
  await validerRangee(0, 0);      // A1 — Développé Couché
  await validerRangee(0, 1);      // B1 — Curl
  await validerRangee(0, 2);      // C1 — Planche
  ok('le premier tour est bouclé avant qu’on touche à la structure',
    setsSeance().length === 3 && /tour 1\/3/.test(await superT()),
    JSON.stringify(rangsBase()) + ' · ' + (await superT()).trim());

  await menuExo(0, 1);            // le CURL, au milieu du superset à trois
  ok('le menu d’un exercice de superset propose de l’en sortir',
    (await entreesFeuille()).some((t) => /Sortir du superset/.test(t)),
    (await entreesFeuille()).join(' | '));
  await entree('Sortir du superset');

  ok('il sort SEUL : les deux autres restent groupés',
    JSON.stringify(await formeEcran()) ===
    JSON.stringify([['Développé Couché (Barre)', 'Planche'], ['Curl Biceps Haltères'], ['Squat (Barre)']]),
    JSON.stringify(await formeEcran()));
  ok('et il se pose JUSTE APRÈS son bloc, pas en fin de séance',
    (await compter('.bloc-seance')) === 3 && (await compter('.bloc-seance.superset')) === 1,
    (await compter('.bloc-seance')) + ' bloc(s), dont ' +
    (await compter('.bloc-seance.superset')) + ' superset');
  ok('les étiquettes suivent la nouvelle forme',
    JSON.stringify(await etiquettes(0)) === JSON.stringify(['A1', 'B1', 'A2', 'B2', 'A3']) &&
    JSON.stringify(await etiquettes(1)) === JSON.stringify(['1', '2', '3']),
    JSON.stringify(await etiquettes(0)) + ' · ' + JSON.stringify(await etiquettes(1)));
  // ⚠️ LA MARQUE DE TOUR SURVIT AU GESTE. `normaliserGroupes` renumérote les
  // groupes, donc jette `seance.tours` — indexé par numéro de groupe. L'app la
  // re-sème aussitôt depuis l'état courant ; sans ça, le tour reculerait à 1 à
  // chaque déviation, ce que le §2.7 interdit explicitement.
  ok('et le tour atteint ne recule pas d’un geste de structure',
    /tour 1\/3/.test(await superT()), (await superT()).trim());

  // « Ce qui est déjà saisi ne se perd pas » (§5 du chantier).
  ok('la série validée du sortant est TOUJOURS là, à l’écran et en base',
    (await page.evaluate(() => document.querySelectorAll('.bloc-seance')[1]
      .querySelectorAll('.ok-serie.cochee').length)) === 1 &&
    setsSeance().filter((s) => s.exercise_slug === 'curl').length === 1,
    JSON.stringify(rangsBase()));

  // ── §5.5 — DÉPLACER UN BLOC, AU MILIEU DE LA LISTE ──────────────────────
  await deplacerBlocParMode(2, 'haut');   // Squat, en dernier
  ok('le bloc déplacé se pose au milieu, et le superset ne bouge pas',
    JSON.stringify(await formeEcran()) ===
    JSON.stringify([['Développé Couché (Barre)', 'Planche'], ['Squat (Barre)'], ['Curl Biceps Haltères']]),
    JSON.stringify(await formeEcran()));
  // ⚠️ LA CONTRAINTE RÉELLE : tout ce qui suit a changé de rang. Sur une séance
  // DÉJÀ MONTÉE, écrire ces rangs sans se heurter à `sets_rang_unique` est
  // exactement le travail de `remplacerSeries` — déplacer le DERNIER bloc ne
  // l'aurait jamais montré.
  ok('les rangs suivent en base, sans collision',
    JSON.stringify(rangsBase()) ===
      JSON.stringify(['dc-barre@1', 'planche@4', 'curl@8']) &&
    new Set(setsSeance().map((s) => s.rang)).size === setsSeance().length,
    JSON.stringify(rangsBase()));

  // ── §5.7 — GROUPER DEUX BLOCS PAR SÉLECTION ─────────────────────────────
  await menuBloc(1);              // Squat
  await entree('Grouper en superset');
  ok('l’écran passe en SÉLECTION : la consigne prend le bandeau',
    /Grouper avec/.test(await texte('#bandeau-seance')) &&
    (await compter('.bloc-seance.source-groupe')) === 1 &&
    (await compter('.bloc-seance.cible-groupe')) === 2,
    (await texte('#bandeau-seance')).replace(/\s+/g, ' ').slice(0, 50));
  // ⚠️ « Terminer » disparaît pendant la sélection : le laisser sous la main à
  // ce moment-là, c'est proposer de finir sa séance par erreur.
  ok('et « Terminer » n’est plus sous la main', (await compter('#bandeau-seance .bandeau-fin')) === 0,
    (await compter('#bandeau-seance .bandeau-fin')) + ' bouton Terminer');
  // ⚠️ NI LES « ⋯ ». La carte entière est la cible du tap : un bouton au milieu
  // d'elle qui ferait autre chose est un piège, et le bloc SOURCE ne se propose
  // pas à lui-même — se grouper avec soi-même rendrait le geste muet.
  ok('aucun menu « ⋯ » ne reste tapable pendant la sélection',
    (await compter('.menu-pts')) === 0, (await compter('.menu-pts')) + ' menu(s)');
  ok('et le bloc qui a lancé le geste n’est pas sa propre cible',
    (await compter('.bloc-seance.source-groupe')) === 1 &&
    (await compter('.bloc-seance.cible-groupe')) === 2 &&
    (await compter('.bloc-seance.source-groupe.cible-groupe')) === 0,
    (await compter('.bloc-seance.source-groupe')) + ' source · ' +
    (await compter('.bloc-seance.cible-groupe')) + ' cible(s)');
  // §5.7 — la source se réduit à sa tête comme les cibles : on choisit un bloc,
  // on ne saisit pas. Les laisser déployées ferait défiler pour choisir.
  ok('et plus aucune ligne de saisie ne reste sous la main',
    (await compter('.ligne-serie')) === 0, (await compter('.ligne-serie')) + ' ligne(s)');

  await page.evaluate(() => document.querySelectorAll('.bloc-seance')[2].click());
  await attendre(800);
  ok('le bloc touché rejoint le sélectionné : deux supersets',
    (await compter('.bloc-seance')) === 2 && (await compter('.bloc-seance.superset')) === 2,
    JSON.stringify(await formeEcran()));
  ok('et les étiquettes du nouveau bloc s’entrelacent',
    JSON.stringify(await etiquettes(1)) === JSON.stringify(['A1', 'B1', 'A2', 'B2', 'B3']),
    JSON.stringify(await etiquettes(1)));

  // ── §5.2 — REMPLACER, sur un exercice QUI PORTE DU TRAVAIL FAIT ─────────
  //
  // La règle tranchée : les séries validées RESTENT, sous l'ancien nom, et le
  // nouveau démarre vide juste après. On ne récrit pas du travail réellement
  // fait sous un autre exercice — ce serait une donnée fausse, pas un raccourci.
  await menuExo(0, 0);            // Développé Couché — 1 série validée sur 3
  await entree('Remplacer');
  await choisirCatalogue('tractions');
  // ⚠️ LE NOUVEAU HÉRITE DU SLOT, DONC DU NOMBRE DE LIGNES — trois, comme le
  // Développé Couché en avait trois. L'ancien, lui, ne garde que sa ligne
  // FAITE. Le bloc passe donc de 3+2 à 1+3+2 lignes, et l'entrelacement le dit :
  // A n'a plus qu'un tour, B en a trois.
  ok('l’ancien garde SES séries validées, le nouveau démarre vide à sa suite',
    JSON.stringify((await formeEcran())[0]) ===
    JSON.stringify(['Développé Couché (Barre)', 'Tractions', 'Planche']) &&
    JSON.stringify(await etiquettes(0)) ===
    JSON.stringify(['A1', 'B1', 'C1', 'B2', 'C2', 'B3']),
    JSON.stringify((await formeEcran())[0]) + ' · ' + JSON.stringify(await etiquettes(0)));
  ok('la série faite est intacte en base — aucune n’a changé d’exercice',
    setsSeance().filter((s) => s.exercise_slug === 'dc-barre').length === 1 &&
    setsSeance().filter((s) => s.exercise_slug === 'tractions').length === 0,
    JSON.stringify(rangsBase()));
  ok('et le remplaçant hérite du SLOT : il est dans le superset, pas à côté',
    (await compter('.bloc-seance')) === 2 &&
    (await page.evaluate(() => document.querySelectorAll('.bloc-seance')[0]
      .querySelectorAll('.lettre-exo').length)) === 3,
    JSON.stringify(await formeEcran()));

  // ── §5 bis — AJOUTER UN EXERCICE APRÈS UN BLOC ──────────────────────────
  await menuBloc(0);
  await entree('Ajouter un exercice après');
  await choisirCatalogue('marche');
  ok('le nouvel exercice se pose APRÈS le bloc, seul, sans rejoindre le superset',
    JSON.stringify(await formeEcran()) === JSON.stringify([
      ['Développé Couché (Barre)', 'Tractions', 'Planche'], ['Marche'],
      ['Squat (Barre)', 'Curl Biceps Haltères']]),
    JSON.stringify(await formeEcran()));

  // ── §5.3 — LE MODE MODIFIER ─────────────────────────────────────────────
  //
  // ⚠️ AVEC UN REPOS QUI COURT, et c'est la configuration discriminante du
  // défaut relevé le 18/09 : le pied du mode et la barre de repos étaient posés
  // au MÊME `bottom`, donc superposés au pixel près. Le commentaire du code
  // jurait qu'ils ne coexistaient jamais. Ils coexistent au contraire dans le
  // cas le plus ordinaire : on valide une série, puis on remet de l'ordre.
  // Sans chronomètre armé, les deux barres ne se rencontrent pas et le banc
  // applaudirait un écran que personne n'a vu.
  const iArmee = await page.evaluate(() => {
    const toutes = Array.from(document.querySelectorAll('.ligne-serie'));
    const l = toutes.filter((x) => !x.querySelector('.ok-serie.cochee'))[0];
    if (!l) return -1;
    l.querySelector('.ok-serie').click();
    return toutes.indexOf(l);
  });
  await attendre(900);
  await page.click('#bandeau-seance .bandeau-modifier');
  await attendre(700);
  const deuxBarres = await page.evaluate(() => {
    const r = document.getElementById('repos');
    const p = document.getElementById('pied-reorg');
    if (!r || r.hidden || !p || p.hidden) return { ensemble: false };
    const a = r.getBoundingClientRect(), b = p.getBoundingClientRect();
    return { ensemble: true,
             chevauche: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.top + a.height,
             basPied: Math.round(b.bottom), hautRepos: Math.round(a.top) };
  });
  ok('[46] le pied du mode et la barre de repos s’affichent ENSEMBLE',
    deuxBarres.ensemble === true, JSON.stringify(deuxBarres));
  ok('[46] …et ils s’EMPILENT, ils ne se superposent pas',
    deuxBarres.ensemble === true && deuxBarres.chevauche === false &&
    deuxBarres.basPied <= deuxBarres.hautRepos,
    JSON.stringify(deuxBarres));
  // On rend la barre de repos ET la série : la suite de la section compte les
  // séries faites, et une de plus la ferait échouer pour une raison qui n'est
  // pas la sienne. Dévalider repose exactement l'état d'avant.
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#repos button'))
      .filter((x) => /Passer/.test(x.textContent))[0];
    if (b) b.click();
  });
  await attendre(400);
  await page.click('#bandeau-seance .bandeau-modifier');   // on ressort du mode
  await attendre(700);
  await page.evaluate((k) => {
    if (k < 0) return;
    const l = document.querySelectorAll('.ligne-serie')[k];
    if (l) l.querySelector('.ok-serie').click();
  }, iArmee);
  await attendre(1200);
  await page.click('#bandeau-seance .bandeau-modifier');   // et on y rentre
  await attendre(700);
  ok('Modifier replie TOUT sur une ligne par bloc',
    (await compter('.bloc-seance.replie')) === 3 &&
    (await compter('.ligne-serie')) === 0 &&
    (await compter('.replie-avancement')) === 3,
    (await compter('.bloc-seance.replie')) + ' replié(s), ' +
    (await compter('.ligne-serie')) + ' ligne(s) de saisie');
  const bornes = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.bloc-seance'));
    const g = (n, s) => n.querySelector('.geste[aria-label="' + s + '"]').disabled;
    return [g(b[0], 'Monter le bloc'), g(b[b.length - 1], 'Descendre le bloc')];
  });
  ok('les bornes sont grisées : le premier ne monte pas, le dernier ne descend pas',
    JSON.stringify(bornes) === '[true,true]', JSON.stringify(bornes));
  ok('l’avancement remplace le palier : des faits, aucune prescription',
    /2 \/ 6 séries/.test(await texte('.bloc-seance .replie-avancement')),
    (await texte('.bloc-seance .replie-avancement')).trim());

  // ⚠️ DÉPLACER UN SUPERSET ENTIER. C'est le bloc qui bouge, pas ses branches :
  // les trois exercices restent collés, dans leur ordre, et restent un superset.
  await page.evaluate(() => {
    document.querySelectorAll('.bloc-seance')[0]
      .querySelector('.geste[aria-label="Descendre le bloc"]').click();
  });
  await attendre(800);
  ok('un superset se déplace ENTIER, sans se défaire',
    JSON.stringify(await formeEcran()) === JSON.stringify([
      ['Marche'], ['Développé Couché (Barre)', 'Tractions', 'Planche'],
      ['Squat (Barre)', 'Curl Biceps Haltères']]),
    JSON.stringify(await formeEcran()));
  // ⚠️ ET LA POIGNÉE, TROISIÈME SURFACE DU §7 vicies (ch. 46). Le même
  // composant qu'à la bibliothèque et à l'éditeur ; ce qu'on mesure ici est
  // qu'il est BRANCHÉ sur la séance, et qu'un superset y voyage entier.
  ok('[46] les blocs repliés portent une poignée, et un pied apparaît',
    (await compter('.bloc-seance.replie .poignee')) === 3 &&
    (await page.evaluate(() => {
      const p = document.getElementById('pied-reorg');
      return !!p && !p.hidden;
    })) === true,
    (await compter('.bloc-seance.replie .poignee')) + ' poignée(s)');
  const formeAvantGlisse = await formeEcran();
  // ⚠️ LA COURSE SE CALCULE, ELLE NE SE DEVINE PAS. Les blocs repliés n'ont
  // PAS la même hauteur : un superset à trois branches porte trois noms, un bloc
  // seul un seul. Glisser « d'une hauteur de bloc » suffit quand on descend vers
  // un bloc plus court et rate quand on remonte vers un plus haut — mesuré : le
  // premier jet ne déplaçait rien. On vise donc le MILIEU du bloc d'au-dessus,
  // plus une marge : c'est exactement le seuil que le composant compare.
  const pgS = await page.evaluate(() => {
    const b = document.querySelectorAll('.bloc-seance.replie');
    const p = b[2].querySelector('.poignee');
    const r = p.getBoundingClientRect();
    const mi = (n) => { const x = n.getBoundingClientRect(); return x.top + x.height / 2; };
    return { x: r.left + r.width / 2, y: r.top + r.height / 2,
             h: Math.ceil(mi(b[2]) - mi(b[1])) + 12 };
  });
  await page.mouse.move(pgS.x, pgS.y);
  await page.mouse.down();
  for (let d = 0; d <= pgS.h + 10; d += 8) {
    await page.mouse.move(pgS.x, pgS.y - d);
    await attendre(18);
  }
  await page.mouse.up();
  await attendre(500);
  ok('[46] glisser par la poignée remonte le bloc, en séance aussi',
    JSON.stringify(await formeEcran()) !== JSON.stringify(formeAvantGlisse) &&
    JSON.stringify((await formeEcran())[1]) === JSON.stringify(formeAvantGlisse[2]),
    JSON.stringify(formeAvantGlisse) + ' → ' + JSON.stringify(await formeEcran()));
  // On le remet où il était : la suite de ce banc attend cet ordre-là.
  await page.evaluate(() => {
    document.querySelectorAll('.bloc-seance')[1]
      .querySelector('.geste[aria-label="Descendre le bloc"]').click();
  });
  await attendre(700);
  ok('[46] …et les flèches le remettent — elles n’ont pas disparu avec le geste',
    JSON.stringify(await formeEcran()) === JSON.stringify(formeAvantGlisse),
    JSON.stringify(await formeEcran()));

  await page.click('#bandeau-seance .bandeau-modifier');
  await attendre(900);
  ok('« Terminé » rend la saisie',
    (await compter('.bloc-seance.replie')) === 0 && (await compter('.ligne-serie')) > 0 &&
    (await compter('.bloc-seance.superset')) === 2,
    (await compter('.ligne-serie')) + ' ligne(s) de saisie');

  // ── RIEN DE DESTRUCTIF EN SILENCE ───────────────────────────────────────
  await menuBloc(2);              // Squat + Curl : le Curl porte 1 série validée
  await entree('Supprimer le bloc');
  ok('supprimer un bloc qui porte du travail fait DEMANDE d’abord',
    /1 série sera effacée/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 90));
  await entree('Supprimer quand même');
  ok('confirmé : le bloc part de l’écran ET de la base',
    (await compter('.bloc-seance')) === 2 &&
    setsSeance().filter((s) => s.exercise_slug === 'curl').length === 0 &&
    setsSeance().length === 2,
    JSON.stringify(rangsBase()));

  await menuBloc(0);              // Marche : rien de validé
  await entree('Supprimer l’exercice');
  ok('sans travail à perdre, aucune question : il part tout de suite',
    (await compter('.bloc-seance')) === 1 &&
    JSON.stringify(await formeEcran()) ===
    JSON.stringify([['Développé Couché (Barre)', 'Tractions', 'Planche']]),
    JSON.stringify(await formeEcran()));

  // ── §6 — UNE SEULE QUESTION, ET LE DÉFAUT NE TOUCHE À RIEN ──────────────
  const avantFin = JSON.stringify(ROUTINE_SUPERSET.routine_exercises);
  const patchsAvant = base.patchs.length;
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(700);
  const question = await texte('#feuille-contenu');
  ok('la question de fin dit ce qui a dévié, en toutes lettres',
    /s’écarte de/.test(question) && /Tractions — ajouté/.test(question) &&
    /Curl Biceps Haltères — retiré/.test(question) && /Squat \(Barre\) — retiré/.test(question),
    question.replace(/\s+/g, ' ').slice(0, 180));
  ok('aucune charge, aucun poids dans la question',
    !/charge|poids|kg/i.test(question), 'aucun mot de charge');
  const defaut = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.choix-routine button'))
      .map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')));
  ok('le défaut est de NE PAS toucher la routine',
    JSON.stringify(defaut) === '["Garder la routine:true","Reporter sur la routine:false"]',
    JSON.stringify(defaut));

  await page.click('#feuille-contenu .principal');
  await attendre(2600);
  ok('« Garder » tenu parole : la routine est exactement celle d’avant',
    JSON.stringify(ROUTINE_SUPERSET.routine_exercises) === avantFin &&
    base.patchs.length === patchsAvant,
    (base.patchs.length - patchsAvant) + ' écriture(s) de routine');

  // ── §6 — LE REPORT, SUR UNE DÉVIATION DE STRUCTURE PURE ─────────────────
  //
  // ⚠️ COMPOSITION IDENTIQUE, ORDRE ET GROUPEMENT CHANGÉS. C'est la
  // configuration où le report est le plus exposé : les deux lignes ÉCHANGENT
  // leur rang, et `routine_exos_rang_uniq` N'EST PAS DIFFÉRÉE. Un plan naïf
  // écrirait le rang 0 sur la seconde alors que la première l'occupe encore.
  await aller('/saisie');
  await demarrerRoutine('Push');
  // ⚠️ LE NOMBRE DE SÉRIES EST UN NOMBRE DE LIGNES depuis le chantier 43.
  // `routine_exercises.series` n'existe plus dans le circuit : ce qui ne doit
  // pas bouger, c'est la STRUCTURE programmée, ligne pour ligne.
  const structureAvant = () => ROUTINE.routine_exercises.slice()
    .sort((a, b) => a.rang - b.rang)
    .map((e) => (e.routine_sets || []).length + '×' + e.exercise_slug);
  const seriesRoutineAvant = structureAvant();

  await deplacerBlocParMode(1, 'haut');
  await menuBloc(0);
  await entree('Grouper en superset');
  await page.evaluate(() => document.querySelectorAll('.bloc-seance')[1].click());
  await attendre(800);
  // Une série de plus : elle ne doit RIEN reporter (§6.3 — le nombre de séries
  // du jour n'est pas une prescription).
  await page.evaluate(() => document.querySelector('.ajout-serie button').click());
  await attendre(600);
  ok('la séance est un seul superset, dans l’ordre inverse de la routine',
    JSON.stringify(await formeEcran()) ===
    JSON.stringify([['Développé Couché (Barre)', 'Squat (Barre)']]),
    JSON.stringify(await formeEcran()));

  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(700);
  const q2 = await texte('#feuille-contenu');
  ok('ordre ET groupement se rapportent, dans la MÊME question',
    /L’ordre des exercices a changé/.test(q2) &&
    /Le groupement en superset a changé/.test(q2) &&
    (q2.match(/s’écarte de/g) || []).length === 1,
    q2.replace(/\s+/g, ' ').slice(0, 160));
  ok('et la série ajoutée n’y figure pas — le nombre de séries ne se prescrit pas ici',
    !/série/.test(q2.split('s’écarte de')[1] || ''),
    (q2.split('s’écarte de')[1] || '').replace(/\s+/g, ' ').slice(0, 120));

  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.choix-routine button'))
      .filter((b) => /Reporter/.test(b.textContent))[0].click();
  });
  await attendre(400);
  await page.click('#feuille-contenu .principal');
  await attendre(3000);

  const routineApres = ROUTINE.routine_exercises.slice().sort((a, b) => a.rang - b.rang);
  ok('la routine a suivi : ordre échangé, superset posé, rangs 0/1 sans collision',
    JSON.stringify(routineApres.map((e) => e.exercise_slug + '@' + e.rang + '#' + e.groupe_superset)) ===
    JSON.stringify(['dc-barre@0#1', 'squat-barre@1#1']),
    JSON.stringify(routineApres.map((e) => e.exercise_slug + '@' + e.rang + '#' + e.groupe_superset)));
  ok('[43] le nombre de LIGNES programmées n’a PAS bougé (§6.3)',
    JSON.stringify(structureAvant().slice().sort()) ===
    JSON.stringify(seriesRoutineAvant.slice().sort()),
    JSON.stringify(structureAvant()) + ' vs ' + JSON.stringify(seriesRoutineAvant));
  const champsRoutine = base.patchs.slice(patchsAvant)
    .flatMap((p) => p.champs ? Object.keys(p.champs)
      : (p.lignes || []).flatMap((l) => Object.keys(l)));
  // ⚠️ `charge_cible_kg` EST LA SEULE EXCEPTION, ET ELLE EST NOMMÉE (§7
  // quindecies.3) : une CIBLE facultative, qui ne prime jamais sur le moteur.
  // Ce qui reste interdit, c'est une charge OBSERVÉE.
  ok('aucune charge OBSERVÉE n’est partie dans la routine',
    champsRoutine.length > 0 && !champsRoutine.filter((k) => k !== 'charge_cible_kg')
      .some((k) => /charge|poids|kg|weight|rm\b/i.test(k)),
    Array.from(new Set(champsRoutine)).join(', '));

  // ── §6 — UNE LIGNE AJOUTÉE PART AVEC SON IDENTIFIANT ───────────────────
  //
  // ⚠️ C'EST CE QUI REND LE REPORT IDEMPOTENT. `routine_exercises.id` a
  // `gen_random_uuid()` en défaut : laisser la base le choisir marcherait UNE
  // fois, puis une vidange rejouée — réseau qui lâche, app relancée —
  // réinsérerait une seconde fois chaque exercice ajouté. L'app fabrique donc
  // le sien, et la ligne se retrouve au lieu de se dédoubler.
  await aller('/saisie');
  await demarrerRoutine('Push');
  const insertsAvant = base.patchs.filter((p) => p.op === 'insert').length;
  await menuBloc(0);
  await entree('Ajouter un exercice après');
  await choisirCatalogue('planche');

  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(700);
  ok('un exercice ajouté en séance se rapporte comme ajouté',
    /Planche — ajouté/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 140));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.choix-routine button'))
      .filter((b) => /Reporter/.test(b.textContent))[0].click();
  });
  await attendre(400);
  await page.click('#feuille-contenu .principal');
  await attendre(3000);

  const inserts = base.patchs.filter((p) => p.op === 'insert').slice(insertsAvant);
  const lignesInserees = inserts.flatMap((p) => p.lignes);
  ok('la ligne neuve part avec un identifiant fabriqué par l’app',
    lignesInserees.length === 1 && typeof lignesInserees[0].id === 'string' &&
    lignesInserees[0].id.length >= 8 && lignesInserees[0].exercise_slug === 'planche',
    JSON.stringify(lignesInserees.map((l) => l.exercise_slug + '#' + String(l.id).slice(0, 8))));
  ok('et la routine porte bien trois lignes, rangs 0/1/2',
    JSON.stringify(ROUTINE.routine_exercises.slice().sort((a, b) => a.rang - b.rang)
      .map((e) => e.exercise_slug + '@' + e.rang)) ===
    JSON.stringify(['dc-barre@0', 'squat-barre@1', 'planche@2']),
    JSON.stringify(ROUTINE.routine_exercises.slice().sort((a, b) => a.rang - b.rang)
      .map((e) => e.exercise_slug + '@' + e.rang)));

  console.log('\n══ 7 undecies. LES CHAUFFES EN SUPERSET, ET LES GESTES SUR UNE SÉANCE ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : UN SUPERSET DONT
  // LES EXERCICES ONT UN NOMBRE INÉGAL DE CHAUFFES.
  //
  // Avec une chauffe chacun, « les chauffes forment leurs propres tours » et
  // « chaque chauffe est collée à son exercice » rendent exactement le même
  // écran. Il faut que A en ait deux et B une seule pour que le second tour de
  // chauffe existe — et ne contienne que A.
  await aller('/saisie');
  await demarrerRoutine('Superset');

  // La i-ième rangée d'un bloc : on lui change son TYPE par la feuille.
  const passerEnChauffe = async (iBloc, iRangee) => {
    await page.evaluate(([k, r]) => {
      document.querySelectorAll('.bloc-seance')[k]
        .querySelectorAll('.ligne-serie')[r].querySelector('.no-serie').click();
    }, [iBloc, iRangee]);
    await attendre(500);
    await page.click('#feuille-contenu .feuille-menu button:nth-child(2)');   // Échauffement
    await attendre(700);   // la feuille de type se referme d'elle-même
  };

  // Le bloc 0 est le superset : A = Développé Couché (3), B = Curl (3),
  // C = Planche (2). On donne DEUX chauffes à A et UNE à B — C n'en a pas.
  // Les rangées se renumérotent à chaque changement : on reprend toujours la
  // première ligne encore en travail de l'exercice visé.
  await passerEnChauffe(0, 0);   // A1 → chauffe
  ok('une chauffe seule ouvre le bloc : elle ne reste pas collée à son tour',
    JSON.stringify(await etiquettes(0)) ===
    JSON.stringify(['A', 'A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'B3']),
    JSON.stringify(await etiquettes(0)));

  await passerEnChauffe(0, 2);   // B1 → chauffe  (l'ordre a bougé : A, A1, B1, …)
  await passerEnChauffe(0, 2);   // la 2e ligne de A → chauffe (A, B, A1, …)
  ok('chauffes INÉGALES : le 2e tour de chauffe ne contient que celui qui en a deux',
    JSON.stringify(await etiquettes(0)) ===
    JSON.stringify(['A', 'B', 'A', 'A1', 'B1', 'C1', 'B2', 'C2']),
    JSON.stringify(await etiquettes(0)));
  ok('et le compteur de tours ignore les chauffes',
    /tour 0\/2/.test(await superT()), (await superT()).trim());

  // Hors superset — non-régression : la chauffe reste en tête de SON exercice.
  await passerEnChauffe(1, 0);
  // Hors superset le numéro porte le TYPE (« C »), pas la lettre : il n'y a
  // pas d'alternance à nommer. C'est la règle du §3 bis.1, inchangée.
  ok('hors superset, la chauffe reste en tête de son exercice',
    JSON.stringify(await etiquettes(1)) === JSON.stringify(['W', '1']),
    JSON.stringify(await etiquettes(1)));

  // ── §7 decies — un groupe ne descend jamais à un seul exercice ──────────
  await menuExo(0, 2);                       // la Planche, 3e branche
  await entree('Supprimer l’exercice');
  ok('un superset à trois qui perd une branche en garde deux, groupées',
    (await compter('.bloc-seance.superset')) === 1 &&
    JSON.stringify((await formeEcran())[0]) ===
    JSON.stringify(['Développé Couché (Barre)', 'Curl Biceps Haltères']),
    JSON.stringify(await formeEcran()));
  await menuExo(0, 1);                       // le Curl
  await entree('Supprimer l’exercice');
  ok('tombé à un, le bloc n’est PLUS un superset — et rien n’en porte le numéro',
    (await compter('.bloc-seance.superset')) === 0 &&
    (await compter('.lettre-exo')) === 0,
    JSON.stringify(await formeEcran()));

  // On termine la séance pour avoir de quoi exercer les gestes du §7 octies.
  await validerRangee(0, 0);
  await validerRangee(0, 1);
  const idGestes = seanceCourante();
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  // ── §7 octies.3 — REFAIRE ───────────────────────────────────────────────
  await aller('/seance/' + idGestes);
  ok('la séance terminée porte enfin ses trois gestes',
    (await compter('#vue-detail .detail-gestes button')) === 3 &&
    /Refaire cette séance/.test(await texte('#vue-detail .detail-gestes')) &&
    !/Partager/.test(await texte('#vue-detail .detail-gestes')),
    (await texte('#vue-detail .detail-gestes')).replace(/\s+/g, ' '));

  const seancesAvant = sessions().length;
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /Refaire/.test(b.textContent))[0].click();
  });
  await attendre(1600);
  ok('« Refaire » DÉMARRE une séance neuve — il ne copie rien dans l’historique',
    JSON.stringify(await visible()) === '["vue-seance"]' &&
    sessions().length === seancesAvant + 1 &&
    seanceCourante() !== idGestes,
    sessions().length + ' séance(s), en cours = ' + String(seanceCourante()).slice(0, 8));
  // ⚠️ LE POINT DU §7 octies.3 : aucune charge pré-remplie. Le moteur décide
  // des charges — même règle qu'un démarrage depuis une routine.
  const champsRefaits = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie input')).map((i) => i.value));
  ok('aucune charge, aucune rep pré-remplie',
    champsRefaits.length > 0 && champsRefaits.every((v) => v === ''),
    JSON.stringify(champsRefaits));
  ok('et rien n’est monté en base pour cette séance neuve',
    setsSeance().length === 0, setsSeance().length + ' série(s)');

  // Une séance en cours interdit d'en rouvrir une autre : l'écran n'en tient
  // qu'une, et écraser un brouillon perdrait du travail réellement commencé.
  await aller('/seance/' + idGestes);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /Modifier/.test(b.textContent))[0].click();
  });
  await attendre(700);
  ok('avec une séance en cours, « Modifier » refuse et le DIT',
    /séance est en cours/i.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 80));
  await fermerFeuille();

  // On abandonne la séance refaite pour libérer l'écran.
  await aller('/saisie');
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  await page.click('#feuille-contenu .danger');
  await attendre(1600);

  // ── §7 octies.2 — MODIFIER ──────────────────────────────────────────────
  await aller('/seance/' + idGestes);
  const avantModif = base.sessions.filter((s) => s.id === idGestes)[0];
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /Modifier/.test(b.textContent))[0].click();
  });
  await attendre(1200);
  ok('« Modifier » rouvre la séance dans la saisie, avec ses valeurs',
    JSON.stringify(await visible()) === '["vue-seance"]' &&
    (await compter('.ok-serie.cochee')) === 2,
    JSON.stringify(await visible()) + ' · ' + (await compter('.ok-serie.cochee')) + ' validée(s)');
  // ⚠️ CE QUI EST TRANCHÉ : elle RESTE `terminee`. La repasser `en_cours` la
  // ferait sortir des totaux et du relevé pendant l'édition (§7 quinquies).
  ok('elle reste TERMINÉE pendant la correction — elle ne quitte pas l’historique',
    base.sessions.filter((s) => s.id === idGestes)[0].statut === 'terminee',
    JSON.stringify(base.sessions.map((s) => s.statut)));
  ok('et le bandeau le dit : on enregistre, on ne termine pas',
    /Enregistrer/.test(await texte('#bandeau-seance .bandeau-fin')) &&
    /Modification/.test(await texte('#bandeau-seance')),
    (await texte('#bandeau-seance')).replace(/\s+/g, ' ').slice(0, 60));

  // ⚠️ PAS `setsSeance()` ICI : il vise la séance `en_cours`, et le propre de
  // la correction est qu'il n'y en a pas — la séance reste terminée.
  const lignesGestes = () => base.sets.filter((s) => s.session_id === idGestes);
  const chargeAvant = lignesGestes().slice().sort((a, b) => a.rang - b.rang)[0].charge_kg;
  await page.evaluate(() => {
    const i = document.querySelectorAll('.ligne-serie')[0].querySelector('input');
    i.value = '137';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await attendre(400);
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(2600);
  ok('« Enregistrer » referme sur le détail, correction écrite',
    JSON.stringify(await visible()) === '["vue-detail"]' &&
    lignesGestes().some((s) => s.charge_kg === 137),
    'avant ' + chargeAvant + ' → ' + JSON.stringify(lignesGestes().map((s) => s.charge_kg)));
  ok('la fin et le début n’ont pas bougé',
    base.sessions.filter((s) => s.id === idGestes)[0].fin === avantModif.fin &&
    base.sessions.filter((s) => s.id === idGestes)[0].debut === avantModif.debut,
    'fin inchangée');

  // ── §7 octies.1 — SUPPRIMER ─────────────────────────────────────────────
  const nSeriesAvant = lignesGestes().length;
  const autresAvant = base.sets.filter((s) => s.session_id !== idGestes).length;
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /Supprimer/.test(b.textContent))[0].click();
  });
  await attendre(700);
  ok('supprimer une séance DEMANDE d’abord, en comptant ce qui part',
    /Supprimer cette séance/.test(await texte('#feuille-contenu')) &&
    new RegExp(nSeriesAvant + ' série').test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 110));
  await page.click('#feuille-contenu .feuille-menu .danger');
  await attendre(2600);
  ok('confirmé : la séance part, ses séries avec, et rien d’autre n’est touché',
    base.sessions.filter((s) => s.id === idGestes).length === 0 &&
    lignesGestes().length === 0 &&
    base.sets.filter((s) => s.session_id !== idGestes).length === autresAvant,
    nSeriesAvant + ' série(s) parties · ' + autresAvant + ' intactes');
  // ⚠️ ET SANS FAIRE TABLE RASE DU MAGASIN DES SÉRIES (chantier 36).
  // Le résultat visible est le même dans les deux cas — c'est bien pour ça que
  // la mutation survivait. Ce qui diffère est la MANIÈRE, et elle seule décide
  // si une fermeture d'app au mauvais moment coûte tout l'historique.
  const magasins = await page.evaluate(() => window.__magasinsRemplaces || []);
  ok('et SANS réécrire tout le magasin des séries — `cache.js` l’interdit',
    magasins.indexOf('series') < 0 && magasins.indexOf('seances') >= 0,
    'remplacerTout appelé sur : ' + JSON.stringify(magasins));
  ok('et on revient sur la semaine, pas sur un détail vide',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));

  console.log('\n══ 7 duodecies. BADGE DE CHAUFFE, ESPACE DE TOUR, COMPTEUR, MENU DE CARTE ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : UN SUPERSET AVEC DES
  // CHAUFFES. Sans chauffe, « le compteur compte les tours de travail » et « il
  // compte tous les tours » sont indistinguables — il n'y a que des tours de
  // travail. C'est exactement ce qui a laissé passer le défaut du compteur.
  await aller('/saisie');
  await demarrerRoutine('Superset');

  const badges = (iBloc) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.no-serie'))
      .map((n) => n.textContent), iBloc);
  const marques = (iBloc) => page.evaluate((k) =>
    Array.from(document.querySelectorAll('.bloc-seance')[k].querySelectorAll('.ligne-serie'))
      .map((l) => l.classList.contains('debut-tour')), iBloc);

  // A = Développé Couché (3), B = Curl (3), C = Planche (2). Une chauffe sur A
  // et une sur B — C n'en a pas : les tours de chauffe sont donc INÉGAUX.
  await passerEnChauffe(0, 0);
  await passerEnChauffe(0, 2);
  ok('le compteur démarre à 0, et une chauffe ne le fait pas bouger',
    /tour 0\/2/.test(await superT()), (await superT()).trim());

  // ⚠️ LA COULEUR EST CALCULÉE, PAS DÉDUITE D'UNE CLASSE. Une classe posée ne
  // prouve rien si la règle CSS ne s'applique pas — c'est la leçon de la M22 du
  // chantier 27, où un liseré « présent » ne peignait rien.
  const teintes = await page.evaluate(() => {
    const b = document.querySelectorAll('.bloc-seance')[0].querySelectorAll('.no-serie');
    const lu = (n) => {
      const s = getComputedStyle(n);
      return { t: n.textContent, couleur: s.color, fond: s.backgroundColor,
               bord: s.borderTopColor, l: s.width, h: s.height };
    };
    return [lu(b[0]), lu(b[2])];     // une chauffe, une série de travail
  });
  ok('la chauffe porte la LETTRE de son exercice, pas « Ac »',
    teintes[0].t === 'A' && teintes[1].t === 'A1',
    JSON.stringify(await badges(0)));
  ok('elle se distingue par la TEINTE — couleur, fond et bordure diffèrent',
    teintes[0].couleur !== teintes[1].couleur &&
    teintes[0].fond !== teintes[1].fond &&
    teintes[0].bord !== teintes[1].bord &&
    teintes[0].couleur === 'rgb(91, 138, 196)',
    JSON.stringify(teintes[0]) + ' vs ' + JSON.stringify(teintes[1]));
  ok('et la colonne garde son rythme : même boîte, au pixel près',
    teintes[0].l === teintes[1].l && teintes[0].h === teintes[1].h,
    teintes[0].l + '×' + teintes[0].h + ' vs ' + teintes[1].l + '×' + teintes[1].h);

  // ── §7 undecies.2 — l'espace entre les tours ────────────────────────────
  ok('chaque tour ouvre sur une rangée marquée, jamais la première du bloc',
    JSON.stringify(await badges(0)) ===
      JSON.stringify(['A', 'B', 'A1', 'B1', 'C1', 'A2', 'B2', 'C2']) &&
    JSON.stringify(await marques(0)) ===
      JSON.stringify([false, false, true, false, false, true, false, false]),
    JSON.stringify(await badges(0)) + ' · ' + JSON.stringify(await marques(0)));
  // ⚠️ MESURÉ, PAS DÉDUIT D'UNE CLASSE : l'espace doit exister à l'écran.
  const ecarts = await page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('.bloc-seance')[0]
      .querySelectorAll('.ligne-serie'));
    const trou = (i) => Math.round(l[i].getBoundingClientRect().top -
      l[i - 1].getBoundingClientRect().bottom);
    return { entreTours: trou(2), dansUnTour: trou(1) };
  });
  ok('l’espace est RÉEL : une dizaine de pixels entre les tours, zéro dedans',
    ecarts.entreTours >= 9 && ecarts.entreTours <= 13 && ecarts.dansUnTour === 0,
    JSON.stringify(ecarts));
  ok('et aucun texte n’a été ajouté entre les lignes',
    !/Tour\s*\d/i.test(await page.evaluate(() =>
      Array.from(document.querySelectorAll('.bloc-seance')[0]
        .querySelectorAll('.ligne-serie')).map((r) => r.textContent).join(' '))),
    'aucun libellé de tour');

  // Hors superset — non-régression : rien à séparer, rien de marqué, et un `W`.
  await passerEnChauffe(1, 0);
  ok('hors superset : un « W », et aucune rangée marquée',
    JSON.stringify(await badges(1)) === JSON.stringify(['W', '1']) &&
    JSON.stringify(await marques(1)) === JSON.stringify([false, false]),
    JSON.stringify(await badges(1)) + ' · ' + JSON.stringify(await marques(1)));

  // ── §7 undecies.3 — le compteur, sur la configuration discriminante ─────
  await validerRangee(0, 0);          // la chauffe de A
  await validerRangee(0, 1);          // la chauffe de B
  ok('les deux chauffes validées : le compteur n’a toujours pas bougé',
    /tour 0\/2/.test(await superT()), (await superT()).trim());
  await validerRangee(0, 2);          // A1
  ok('un tour entamé mais pas bouclé ne compte pas',
    /tour 0\/2/.test(await superT()), (await superT()).trim());
  await validerRangee(0, 3);          // B1
  await validerRangee(0, 4);          // C1 — le tour 1 est complet
  ok('le premier tour de travail bouclé : 1/2',
    /tour 1\/2/.test(await superT()), (await superT()).trim());

  // ── §7 octies — LE MENU SUR LA CARTE DE SÉANCE ──────────────────────────
  const idCarte = seanceCourante();
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(600);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  await aller('/');
  ok('la carte de séance porte un menu, sans qu’on l’ouvre',
    (await compter('.seance-enveloppe .menu-pts')) > 0,
    (await compter('.seance-enveloppe .menu-pts')) + ' menu(s) sur ' +
    (await compter('.seance')) + ' carte(s)');

  const ouvrirMenuCarte = async () => {
    await page.evaluate((id) => {
      const env = Array.from(document.querySelectorAll('.seance-enveloppe'))
        .filter((e) => e.querySelector('.seance').textContent.indexOf(id) >= 0)[0] ||
        document.querySelectorAll('.seance-enveloppe')[0];
      env.querySelector('.menu-pts').click();
    }, '');
    await attendre(700);
  };
  await ouvrirMenuCarte();
  ok('il propose les TROIS gestes du détail, et pas « Partager »',
    JSON.stringify(await entreesFeuille()) ===
    JSON.stringify(['Refaire cette séance', 'Modifier', 'Supprimer']),
    JSON.stringify(await entreesFeuille()));
  ok('et on n’a pas quitté la liste pour autant',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));

  const avantSup = base.sessions.length;
  await entree('Supprimer');
  ok('« Supprimer » demande d’abord, depuis la liste comme depuis le détail',
    /Supprimer cette séance/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 90));
  await page.click('#feuille-contenu .feuille-menu .danger');
  await attendre(2600);
  ok('confirmé : la séance part, sans jamais avoir été ouverte',
    base.sessions.length === avantSup - 1 &&
    JSON.stringify(await visible()) === '["vue-liste"]',
    avantSup + ' → ' + base.sessions.length + ' séance(s)');

  console.log('\n══ 7 terdecies. L’IDENTIFIANT MANQUANT, ET LA FILE BLOQUÉE ══');
  //
  // CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : AU MOINS UNE SÉRIE
  // AJOUTÉE À LA MAIN, et un serveur qui applique le `NOT NULL` de `sets.id`
  // (`verifierSet`, ajouté par ce chantier). Sans la première, tous les
  // identifiants viennent de `creer({idSerie: uuid})` et sont réels. Sans le
  // second, les lignes nulles s'écrasent les unes sur les autres et le banc
  // applaudit une séance amputée. Il faut les deux — c'est ce qui a laissé le
  // défaut traverser onze chantiers.

  const seanceVide = async () => {
    await aller('/saisie');
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button'))
        .filter((x) => /séance vide/i.test(x.textContent))[0];
      b.click();
    });
    await attendre(900);
  };
  const ajouterExoSeance = async (q) => {
    await page.click('#btn-ajouter-exo-seance');
    await attendre(300);
    await choisirCatalogue(q);
  };
  const plusSerie = async (iBloc) => {
    await page.evaluate((k) => {
      document.querySelectorAll('.ajout-serie')[k].querySelector('button').click();
    }, iBloc);
    await attendre(300);
  };
  const validerToutes = async () => {
    const n = await compter('.ligne-serie');
    for (let i = 0; i < n; i++) {
      const l = (await page.$$('.ligne-serie'))[i];
      await l.$eval('.ok-serie', (b) => b.click());
      await attendre(200);   // rapprochées, comme un pouce sur l'appareil
    }
    await attendre(2600);
    return n;
  };
  const seriesDe = (id) => base.sets.filter((x) => x.session_id === id).length;
  const enCoursId = () => (sessions().filter((x) => x.statut === 'en_cours')[0] || {}).id;
  const terminer = async () => {
    await page.click('#bandeau-seance .bandeau-fin');
    await attendre(600);
    await page.click('#feuille-contenu .principal');
    await attendre(2600);
  };

  // ── 8. L'ajout d'exercice se pose à la FIN, pas en tête ────────────────
  const repereVide = base.journal.length;
  await seanceVide();
  ok('une séance vide s’ouvre, sans aucun exercice',
    JSON.stringify(await visible()) === '["vue-seance"]' && (await compter('.ligne-serie')) === 0,
    JSON.stringify(await visible()) + ' · ' + (await compter('.ligne-serie')) + ' ligne(s)');

  await ajouterExoSeance('Tractions');
  await ajouterExoSeance('Planche');
  // ⚠️ LE DÉFAUT : `addEventListener('click', ouvrirCatalogue)` passait le
  // MouseEvent comme `apres`, `Math.min(n, MouseEvent)` valait `NaN`, et
  // `splice(NaN, …)` insérait à l'index 0 — l'ordre s'inversait.
  ok('les exercices se posent dans l’ordre d’ajout, le second APRÈS le premier',
    JSON.stringify(await formeEcran()) === '[["Tractions"],["Planche"]]',
    JSON.stringify(await formeEcran()));

  // ── 4. Séance vide, six séries ajoutées à la main → les six arrivent ───
  await plusSerie(0); await plusSerie(0);
  await plusSerie(1); await plusSerie(1);
  const idVide = enCoursId();
  const nVide = await validerToutes();
  ok('six séries à l’écran, dont quatre ajoutées à la main', nVide === 6, nVide + ' ligne(s)');
  // ⚠️ DEPUIS UN REPÈRE, pas depuis le début. Le journal est global et porte
  // les refus de toutes les sections précédentes : sans repère, cette ligne
  // parlerait d'un défaut qui n'est pas le sien.
  ok('AUCUNE ligne ne part sans identifiant : le serveur n’a rien refusé',
    !base.journal.slice(repereVide).some((j) => j.refus === '23502'),
    JSON.stringify(base.journal.slice(repereVide).filter((j) => j.op === 'refus').slice(0, 3)));
  ok('les SIX arrivent en base — c’est le cas qui en perdait quatre',
    seriesDe(idVide) === 6 && seriesDe(idVide) === nVide,
    seriesDe(idVide) + '/' + nVide + ' série(s)');

  // ── 7. Fin de séance : plus de fantôme ─────────────────────────────────
  await terminer();
  ok('la séance passe bien `terminee` — aucune séance fantôme `en_cours`',
    sessions().filter((x) => x.statut === 'en_cours').length === 0 &&
    (sessions().filter((x) => x.id === idVide)[0] || {}).statut === 'terminee',
    JSON.stringify(sessions().map((x) => x.statut)));
  ok('et ses six séries sont toujours là après la fin',
    seriesDe(idVide) === 6, seriesDe(idVide) + '/6 série(s)');

  // ── 9. L'état de synchronisation ne ment pas ───────────────────────────
  await aller('/');
  ok('file vidée : l’écran Séances peut dire « à jour »',
    !/refusé/.test(await texte('#etat-sync')), await texte('#etat-sync'));

  // ── 5. Routine + UNE seule série ajoutée → tout arrive ─────────────────
  //      C'est le cas qui montait 3 séries sur 7.
  await aller('/saisie');
  await demarrerRoutine('Push');
  await plusSerie(0);
  const idRoutine = enCoursId();
  const nRoutine = await validerToutes();
  // ⚠️ ON COMPARE À L'ÉCRAN, PAS À UN NOMBRE EN DUR. La routine « Push » a été
  // remaniée par les sections précédentes (report de déviation) : figer « 6 »
  // ici ferait échouer le banc pour une raison étrangère au défaut testé. Ce
  // qui compte est l'ÉGALITÉ — autant de séries en base qu'à l'écran.
  ok('une routine plus une série ajoutée à la main : au moins deux blocs',
    nRoutine >= 2, nRoutine + ' ligne(s)');
  ok('TOUTES arrivent — la série ajoutée ne bloque plus les autres',
    seriesDe(idRoutine) === nRoutine,
    seriesDe(idRoutine) + '/' + nRoutine + ' série(s)');
  await terminer();
  ok('et cette séance-là se termine aussi',
    (sessions().filter((x) => x.id === idRoutine)[0] || {}).statut === 'terminee',
    JSON.stringify(sessions().map((x) => x.statut)));

  console.log('\n══ 7 quaterdecies. CORRIGER UNE SÉANCE IMPORTÉE ══');
  //
  // CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) — les TROIS conditions,
  // et il faut les trois :
  //   1. une séance IMPORTÉE : `validee_a` NULL et `source <> 'app'` ;
  //   2. un serveur qui HONORE `select=` (sinon les colonnes manquantes de la
  //      liste de lecture reviennent quand même, et rien ne se voit) ;
  //   3. le geste « Modifier », puis « Enregistrer ».
  // Avec un `validee_a` renseigné (la fixture `SETS_PASSES`), ou avec le
  // serveur permissif d'avant ce chantier, les quatre vérifications ci-dessous
  // passent quel que soit le code.

  const sesSeries = (id) => base.sets.filter((x) => x.session_id === id);
  const ouvrirMenuDe = async (titre) => {
    await aller('/');
    await page.evaluate((t) => {
      const env = Array.from(document.querySelectorAll('.seance-enveloppe'))
        .filter((e) => e.querySelector('.seance').textContent.indexOf(t) >= 0)[0];
      env.querySelector('.menu-pts').click();
    }, titre);
    await attendre(700);
  };

  const avantCorrection = sesSeries(IMPORTEE.id).length;
  ok('la séance importée porte bien ses 6 séries, sans `validee_a`',
    avantCorrection === 6 && sesSeries(IMPORTEE.id).every((x) => x.validee_a === null),
    avantCorrection + ' série(s), validee_a : ' +
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => x.validee_a)));

  await ouvrirMenuDe('Séance importée');
  await entree('Modifier');
  ok('elle s’ouvre en correction',
    JSON.stringify(await visible()) === '["vue-seance"]', JSON.stringify(await visible()));
  ok('et ses six séries sont à l’écran', (await compter('.ligne-serie')) === 6,
    (await compter('.ligne-serie')) + ' ligne(s)');

  // ── Enregistrer SANS RIEN CHANGER ─────────────────────────────────────
  // ⚠️ EN CORRECTION, « Enregistrer » n'ouvre aucune feuille : `surTerminer`
  // route directement sur `enregistrerEdition` (app.js). Attendre une
  // confirmation ici ferait expirer le banc sur un écran qui n'existe pas.
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(2600);

  ok('enregistrée sans rien changer : AUCUNE série n’est effacée',
    sesSeries(IMPORTEE.id).length === 6,
    sesSeries(IMPORTEE.id).length + '/6 série(s) — c’est LE défaut du chantier 34');
  ok('aucune écriture n’a été refusée par le serveur',
    !base.journal.some((j) => j.op === 'refus'),
    JSON.stringify(base.journal.filter((j) => j.op === 'refus').slice(0, 3)));
  ok('`user_id` est intact sur les séries',
    sesSeries(IMPORTEE.id).length === 6 &&
    sesSeries(IMPORTEE.id).every((x) => x.user_id === 'u-banc'),
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => x.user_id)));
  ok('`ressenti` et `repos_s` ont survécu',
    sesSeries(IMPORTEE.id).length === 6 &&
    sesSeries(IMPORTEE.id).every((x) => x.ressenti === 'reste_2' && x.repos_s === 120),
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => [x.ressenti, x.repos_s])));
  ok('les rangs entrelacés sont préservés',
    JSON.stringify(sesSeries(IMPORTEE.id).sort((a, b) => a.rang - b.rang)
      .map((x) => x.exercise_slug.slice(0, 5) + '@' + x.rang)) ===
    JSON.stringify(['squat@1', 'dc-ba@2', 'squat@3', 'dc-ba@4', 'curl@5', 'curl@6']),
    JSON.stringify(sesSeries(IMPORTEE.id).sort((a, b) => a.rang - b.rang)
      .map((x) => x.exercise_slug.slice(0, 5) + '@' + x.rang)));
  ok('`source` n’a pas été réécrit en `app`',
    sesSeries(IMPORTEE.id).length === 6 &&
    sesSeries(IMPORTEE.id).every((x) => x.source === 'hevy'),
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => x.source)));

  console.log('\n══ 7 quindecies. SUPPRIMER ET DÉPLACER UNE SÉANCE IMPORTÉE ══');
  //
  // CONFIGURATION DISCRIMINANTE (chantier 35, §6) — une séance IMPORTÉE sur
  // laquelle on SUPPRIME et on DÉPLACE, puis qu'on RECHARGE complètement.
  // Sans rechargement, l'écran relit son propre modèle en mémoire et montre le
  // geste qu'on vient de faire, quoi qu'il soit arrivé en base.

  const rangsImportee = () => sesSeries(IMPORTEE.id).slice()
    .sort((a, b) => a.rang - b.rang).map((s) => s.exercise_slug + '@' + s.rang);
  const ouvrirCorrection = async () => {
    await aller('/');
    await ouvrirMenuDe('Séance importée');
    await entree('Modifier');
  };
  const enregistrer = async () => {
    await page.click('#bandeau-seance .bandeau-fin');
    await attendre(2600);
  };

  // ── D2 : DÉPLACER ─────────────────────────────────────────────────────
  await ouvrirCorrection();
  ok('[D2] la séance importée s’ouvre sur deux blocs : un superset, puis le curl',
    JSON.stringify(await formeEcran()) === JSON.stringify([
      ['Squat (Barre)', 'Développé Couché (Barre)'], ['Curl Biceps Haltères']]),
    JSON.stringify(await formeEcran()));
  // ⚠️ [D3] L'ÉCRAN, PAS SEULEMENT LE MODÈLE. Une séance rouverte s'affichait
  // entièrement vierge — aucune case cochée — parce que les 28 103 séries
  // importées portent `validee_a` à NULL. On lit la classe que `rendu.js` pose
  // sur le bouton de validation, `cochee` : c'est elle qui fait le vert.
  const cochees = () => page.evaluate(() =>
    document.querySelectorAll('.ligne-serie .ok-serie.cochee').length);
  ok('[D3] les six séries s’affichent COCHÉES — la séance a bien eu lieu',
    (await cochees()) === 6, (await cochees()) + '/6 cochée(s)');

  // ⚠️ LE VERT, PAS SEULEMENT LA COCHE (survivantes M14/M18 de la campagne de
  // mutations). La rangée porte `.faite` — c'est elle qui fait la couleur — et
  // elle passe par `toursComplets`, un chemin que la coche n'emprunte pas. Deux
  // lectures différentes de « c'est fait » : les deux doivent être vraies.
  const vertes = () => page.evaluate(() =>
    document.querySelectorAll('.serie.faite').length);
  ok('[D3] et elles sont VERTES — le tour entier est reconnu comme fait',
    (await vertes()) === 6, (await vertes()) + '/6 verte(s)');

  // ⚠️ ET LE COMPTEUR DU BLOC REPLIÉ (survivante M17). « Modifier » replie les
  // blocs et affiche « x / y séries » : c'est le troisième endroit qui dit ce
  // qui a été fait, et il affichait « 0 / 4 » sur une séance entièrement faite.
  await page.click('#bandeau-seance .bandeau-modifier');
  await attendre(600);
  const avancements = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.replie-avancement')).map((n) => n.textContent.trim()));
  ok('[D3] replié, le compteur du bloc compte ce qui est fait, pas « 0 / n »',
    (await avancements()).join(' · ') === '4 / 4 séries · 2 / 2 séries',
    JSON.stringify(await avancements()));
  await page.click('#bandeau-seance .bandeau-modifier');
  await attendre(600);

  const avantDeplacement = JSON.stringify(rangsImportee());
  await deplacerBlocParMode(1, 'haut');
  ok('[D2] à l’écran, le curl est passé devant',
    JSON.stringify((await formeEcran())[0]) === JSON.stringify(['Curl Biceps Haltères']),
    JSON.stringify(await formeEcran()));
  await enregistrer();
  ok('[D2] LE DÉPLACEMENT S’ÉCRIT EN BASE',
    rangsImportee()[0].indexOf('curl@') === 0 && rangsImportee()[1].indexOf('curl@') === 0,
    'avant ' + avantDeplacement + ' · après ' + JSON.stringify(rangsImportee()));
  ok('[D2] et rien n’a été perdu au passage',
    sesSeries(IMPORTEE.id).length === 6,
    sesSeries(IMPORTEE.id).length + '/6 série(s)');

  // Rechargement COMPLET : le modèle en mémoire disparaît, l'écran se
  // reconstruit depuis ce qui a été LU. C'est la seule façon de voir ce qui a
  // vraiment été écrit.
  await ouvrirCorrection();
  ok('[D2] après rechargement complet, l’ordre déplacé tient',
    JSON.stringify((await formeEcran())[0]) === JSON.stringify(['Curl Biceps Haltères']),
    JSON.stringify(await formeEcran()));

  // ── D1 : SUPPRIMER ────────────────────────────────────────────────────
  // ⚠️ LE BLOC SE CHERCHE PAR SON NOM, PAS PAR SON INDEX. Tant que D2 n'est
  // pas corrigé, le curl reste en seconde position ; une fois corrigé, il est
  // en première. Un index en dur ferait échouer D1 pour la raison de D2.
  const indexBloc = async (nom) => page.evaluate((n) =>
    Array.from(document.querySelectorAll('.bloc-seance'))
      .findIndex((b) => b.textContent.indexOf(n) >= 0), nom);
  await menuBloc(await indexBloc('Curl'));
  await entree('Supprimer l’exercice');
  // ⚠️ [D3] LA QUESTION EST POSÉE, et c'est le point : avant ce chantier,
  // `compterValidees` comptait 0 sur une séance importée (tous les `validee_a`
  // à NULL) et les deux séries partaient SANS RIEN DEMANDER.
  ok('[D3] supprimer du travail importé DEMANDE d’abord, et le compte',
    /2 séries seront effacées/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 100));
  await entree('Supprimer quand même');
  ok('[D1] à l’écran, le curl est parti',
    (await compter('.bloc-seance')) === 1 && (await compter('.ligne-serie')) === 4,
    (await compter('.bloc-seance')) + ' bloc(s), ' +
    (await compter('.ligne-serie')) + ' ligne(s)');
  await enregistrer();
  ok('[D1] LA SUPPRESSION S’ÉCRIT EN BASE',
    sesSeries(IMPORTEE.id).length === 4,
    sesSeries(IMPORTEE.id).length + '/4 série(s) restantes — ' +
    JSON.stringify(rangsImportee()));
  ok('[D1] et c’est bien le curl qui est parti',
    sesSeries(IMPORTEE.id).every((x) => x.exercise_slug !== 'curl'),
    JSON.stringify(sesSeries(IMPORTEE.id).map((x) => x.exercise_slug)));
  // ⚠️ L'ÉCRAN DE DÉTAIL, TOUT DE SUITE — sans recharger. `enregistrerEdition`
  // y revient, et il lit le CACHE EN MÉMOIRE, pas le modèle. Une correction qui
  // ne purgerait que le disque montrerait encore le curl ici, une seconde après
  // l'avoir supprimé.
  ok('[D1] le détail affiché juste après ne montre plus le curl',
    !/Curl/.test(await texte('#detail-seance')),
    (await texte('#detail-seance')).replace(/\s+/g, ' ').slice(0, 90));

  await ouvrirCorrection();
  ok('[D1] après rechargement complet, la suppression tient',
    (await compter('.ligne-serie')) === 4,
    (await compter('.ligne-serie')) + ' ligne(s)');

  // ⚠️ LA BOUCLE DE RÉSURRECTION — c'est ELLE, le défaut D1 tel qu'il se voit.
  // La suppression PART bien en base. Mais le cache de lecture ne l'apprend
  // jamais : `sets` se synchronise à l'INCRÉMENT (`created_at`/`modifie_a`), et
  // une ligne effacée ne revient par définition jamais dire qu'elle n'est plus
  // là. L'écran la remontre ; la correction suivante la RÉÉCRIT en base. Vu de
  // l'utilisateur, la suppression « ne s'est pas écrite ».
  // ⚠️ [D3] LE TAP DIT CE QUE LA CASE ANNONCE. Une case cochée se dévalide ;
  // tester `validee_a` au lieu de « part en base » ferait VALIDER une case déjà
  // cochée — le tap ferait l'inverse de ce que l'écran montre. Et sur une série
  // importée, dévalider doit la faire VRAIMENT sortir de la base.
  ok('[D3] la case annonce « Dévalider », pas « Valider »',
    (await page.evaluate(() =>
      document.querySelector('.ligne-serie .ok-serie').getAttribute('aria-label'))) === 'Dévalider',
    await page.evaluate(() =>
      document.querySelector('.ligne-serie .ok-serie').getAttribute('aria-label')));
  await page.evaluate(() => document.querySelectorAll('.ligne-serie .ok-serie')[0].click());
  await attendre(900);
  ok('[D3] tapée, elle se DÉCOCHE',
    (await cochees()) === 3, (await cochees()) + '/3 cochée(s)');
  await enregistrer();
  ok('[D3] et elle est VRAIMENT sortie de la base',
    sesSeries(IMPORTEE.id).length === 3,
    sesSeries(IMPORTEE.id).length + '/3 série(s) — ' + JSON.stringify(rangsImportee()));

  await ouvrirCorrection();
  ok('[D3] elle ne revient pas à la réouverture',
    (await compter('.ligne-serie')) === 3 && (await cochees()) === 3,
    (await compter('.ligne-serie')) + ' ligne(s), ' + (await cochees()) + ' cochée(s)');
  await enregistrer();
  ok('[D1] et une correction de plus ne ressuscite rien',
    sesSeries(IMPORTEE.id).length === 3,
    sesSeries(IMPORTEE.id).length + '/3 série(s) — ' + JSON.stringify(rangsImportee()));

  console.log('\n══ 7 sexdecies. TROIS CHEMINS VERS UNE FILE BLOQUÉE ══');
  //
  // Le point commun des trois : une valeur que la base refuse avec un code
  // DÉFINITIF. L'entrée devient la tête de file, `prochaine()` s'arrête dessus,
  // et tout ce qui suit ne monte plus JAMAIS.
  //
  // ⚠️ CE BANC NE POUVAIT PAS LES VOIR AVANT CE CHANTIER. Il ne vérifiait
  // aucun CHECK de `routine_exercises` — alors que c'est ICI que passe le
  // report de fin de séance — ni la plage `int4` de `reps` et `duree_s`. Les
  // deux manques ont été comblés dans le serveur de papier, plus haut.

  const refusDepuis = (n) => base.journal.filter((j, i) => i >= n && j.op === 'refus');
  const glisserPourSupprimer = async (i) => {
    const l = await ligne(i);
    await l.scrollIntoViewIfNeeded();
    await attendre(200);
    const b = await l.boundingBox();
    await page.mouse.move(b.x + b.width - 40, b.y + b.height / 2);
    await page.mouse.down();
    for (let d = 0; d <= 110; d += 14) {
      await page.mouse.move(b.x + b.width - 40 - d, b.y + b.height / 2);
      await attendre(30);
    }
    await page.mouse.up();
    await attendre(700);
  };

  // ── D5 — LA CONFIGURATION DISCRIMINANTE ────────────────────────────────
  //
  // Une DÉVIATION QUI VIDE UN EXERCICE AJOUTÉ. C'est le seul geste qui produit
  // `series: 0`, et il passe par le REPORT, qui n'appelle jamais
  // `Routines.valider()`. Un report avec des valeurs normales ne distingue pas
  // « borné » de « non borné ».
  const repereD5 = base.journal.length;
  await aller('/saisie');
  await demarrerRoutine('Push');
  await saisirSerie(0, 100, 5);
  const avantAjout = await compter('.ligne-serie');
  await ajouterExoSeance('Tractions');
  const avantVidage = await compter('.ligne-serie');
  ok('[D5] l’exercice ajouté arrive avec UNE série de plus',
    avantVidage === avantAjout + 1 && /Tractions/.test(await texte('#vue-seance')),
    avantAjout + ' → ' + avantVidage + ' ligne(s)');

  // ⚠️ PAR LE MENU DU NUMÉRO, pas par le glissement. `rendu.js` le dit :
  // « il n'est JAMAIS le seul chemin : le menu du numéro porte Supprimer ».
  // Au banc, le glissement synthétique est le geste le plus fragile du projet ;
  // ce qu'on éprouve ici est la BORNE du report, pas la reconnaissance du geste.
  await page.evaluate(() => {
    const nos = document.querySelectorAll('.ligne-serie .no-serie');
    nos[nos.length - 1].click();
  });
  await attendre(600);
  await page.click('#feuille-contenu .feuille-menu button.danger');
  await attendre(900);
  ok('[D5] sa dernière série est supprimée — l’exercice reste, VIDE',
    (await compter('.ligne-serie')) === avantVidage - 1 &&
    /Tractions/.test(await texte('#vue-seance')),
    (await compter('.ligne-serie')) + ' ligne(s), Tractions présent : ' +
    /Tractions/.test(await texte('#vue-seance')));

  // Terminer EN REPORTANT sur la routine : c'est le report qui pose l'entrée.
  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(700);
  ok('[D5] la déviation est annoncée, donc la question est posée',
    /s’écarte/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 80));
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#feuille-contenu .choix-routine button'))
      .filter((x) => /Reporter/.test(x.textContent))[0];
    b.click();
  });
  await attendre(400);
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  ok('[D5] AUCUNE écriture n’est refusée — c’était `23514`, définitif',
    refusDepuis(repereD5).length === 0,
    JSON.stringify(refusDepuis(repereD5).slice(0, 3)));
  // ⚠️ LE DÉFAUT D5 A DISPARU PAR CONSTRUCTION AU CHANTIER 43, et le banc le
  // VÉRIFIE plutôt que de le supposer. Il portait sur `series: 0`, refusé par
  // `routine_exos_series_bornees` avec un 23514 DÉFINITIF. La colonne n'est
  // plus écrite, et `routine_sets` n'impose aucun minimum de lignes : un
  // exercice vidé s'écrit pour ce qu'il est, zéro ligne.
  const ligneTractions = ROUTINE.routine_exercises.filter((e) => e.exercise_slug === 'tractions')[0];
  // ⚠️ ZÉRO LIGNE, ET C'EST LE RÉSULTAT ATTENDU — pas un défaut d'écriture.
  //
  // Le scénario VIDE l'exercice ajouté : c'est tout son objet. Ce que la base
  // reçoit est donc une ligne de `routine_exercises` sans aucune série
  // programmée, ce que `routine_sets` accepte (aucune borne de nombre de
  // lignes). Avant le chantier 43, le même geste envoyait `series: 0` et
  // récoltait un 23514 DÉFINITIF qui bloquait la file pour toujours.
  //
  // ⚠️ UNE PREMIÈRE RÉDACTION DE CE TEST EXIGEAIT `length > 0` : elle est
  // tombée ici, et elle avait tort. La leçon vaut dans l'autre sens aussi —
  // « tous les rangs sont >= 1 » est VRAI SUR UNE LISTE VIDE, donc ne prouve
  // rien tout seul. On énonce donc le compte attendu, explicitement.
  const setsTractions = (ligneTractions && ligneTractions.routine_sets) || [];
  ok('[D5] la ligne arrive, VIDÉE — zéro série programmée, et la base l’accepte',
    !!ligneTractions && ligneTractions.series === undefined &&
    setsTractions.length === 0,
    ligneTractions ? setsTractions.length + ' ligne(s) programmée(s)' : 'ligne absente');
  // Et l'écriture des séries, elle, se mesure sur un exercice NON vidé : celui
  // de la routine, qui garde exactement ce qu'il avait.
  const setsSquat = (ROUTINE.routine_exercises
    .filter((e) => e.exercise_slug === 'squat-barre')[0] || {}).routine_sets || [];
  ok('[43] et l’exercice non vidé garde ses lignes, rangs >= 1 et user_id posé',
    setsSquat.length > 0 && setsSquat.every((x) => x.rang >= 1),
    setsSquat.length + ' ligne(s), rangs ' + JSON.stringify(setsSquat.map((x) => x.rang)));
  ok('[D5] et la file n’est pas bloquée : l’état ne dit ni « refusé » ni « échec »',
    !/refusé|échec/i.test(await texte('#etat-sync')),
    (await texte('#etat-sync')) || '(vide)');

  // ── D6 — UN NOMBRE HORS `int4` ─────────────────────────────────────────
  const repereD6 = base.journal.length;
  await seanceVide();
  await ajouterExoSeance('Tractions');
  // ⚠️ « Tractions » se mesure en REPS : sa grille n'a qu'UN champ. `saisirSerie`
  // en attend deux — ici on tape dans le seul qui existe.
  await page.evaluate(async (v) => {
    const l = document.querySelector('.ligne-serie');
    const i = l.querySelector('input');
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  }, '99999999999');
  await attendre(300);
  await page.evaluate(() => document.querySelector('.ligne-serie .ok-serie').click());
  await attendre(1800);
  ok('[D6] AUCUN refus — c’était `22003`, puis `22P02` au-delà de 1e21',
    refusDepuis(repereD6).length === 0,
    JSON.stringify(refusDepuis(repereD6).slice(0, 3)));
  const repsMontees = base.sets.filter((x) => x.session_id === enCoursId()).map((x) => x.reps);
  ok('[D6] et ce qui monte tient dans `int4`',
    repsMontees.length > 0 && repsMontees.every((r) => r === null || Math.abs(r) <= 2147483647),
    JSON.stringify(repsMontees));
  await terminer();

  // ── D7 — LA SÉANCE `en_cours` RESTÉE EN BASE ───────────────────────────
  //
  // `sessions_une_seule_en_cours` est UNIQUE sur (user_id) WHERE
  // statut='en_cours', et NON différable : démarrer la suivante répondait
  // `23505`, code définitif.
  const FANTOME = {
    id: 'sess-fantome', user_id: 'u-banc', titre: 'Restée ouverte',
    debut: new Date(LUNDI.getTime() + 4 * 86400000).toISOString(), fin: null,
    statut: 'en_cours', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: new Date(LUNDI.getTime() + 4 * 86400000).toISOString()
  };
  base.sessions.push(Object.assign({}, FANTOME));
  base.sets.push({
    id: 'set-fantome-1', session_id: FANTOME.id, user_id: 'u-banc',
    exercise_slug: 'squat-barre', charge_kg: 90, reps: 5, duree_s: null,
    distance_m: null, type_serie: 'travail', rang: 1, groupe_superset: null,
    validee_a: FANTOME.debut, rpe: null, ressenti: null, repos_s: null,
    note: null, source: 'app', created_at: FANTOME.debut, modifie_a: null
  });

  // ⚠️ SANS BROUILLON LOCAL → ON LA REPREND. Elle peut porter des séries
  // validées ; les jeter serait la perte que tout ce projet s'interdit.
  const repereD7 = base.journal.length;
  await aller('/');
  await attendre(1500);
  ok('[D7] la séance restée ouverte est REPRISE, avec sa série',
    (base.sessions.filter((x) => x.id === FANTOME.id)[0] || {}).statut === 'en_cours' &&
    (await page.evaluate(() => !document.getElementById('vue-seance').hidden ||
      !!document.querySelector('#bandeau-seance'))),
    'statut=' + (base.sessions.filter((x) => x.id === FANTOME.id)[0] || {}).statut);
  await aller('/saisie');
  ok('[D7] et l’app ne propose pas d’en démarrer une seconde en silence',
    base.sessions.filter((x) => x.statut === 'en_cours').length === 1,
    base.sessions.filter((x) => x.statut === 'en_cours').length + ' séance(s) en_cours');
  ok('[D7] aucun `23505` : rien n’a été refusé',
    refusDepuis(repereD7).length === 0,
    JSON.stringify(refusDepuis(repereD7).slice(0, 3)));

  // ⚠️ AVEC UN BROUILLON LOCAL → ON REFERME LA DISTANTE. Les deux ne peuvent
  // pas coexister, et c'est le brouillon local que l'utilisateur a sous les yeux.
  const SECONDE = Object.assign({}, FANTOME, { id: 'sess-fantome-2', titre: 'Autre appareil' });
  base.sessions.push(SECONDE);
  const repereD7b = base.journal.length;
  await aller('/');
  await attendre(1800);
  ok('[D7] une seconde séance ouverte côté serveur est REFERMÉE, pas supprimée',
    (base.sessions.filter((x) => x.id === SECONDE.id)[0] || {}).statut === 'terminee' &&
    base.sessions.some((x) => x.id === SECONDE.id),
    'statut=' + (base.sessions.filter((x) => x.id === SECONDE.id)[0] || {}).statut);
  ok('[D7] le brouillon local, lui, reste en cours',
    (base.sessions.filter((x) => x.id === FANTOME.id)[0] || {}).statut === 'en_cours',
    'statut=' + (base.sessions.filter((x) => x.id === FANTOME.id)[0] || {}).statut);
  ok('[D7] et sa série n’a pas bougé',
    base.sets.filter((x) => x.session_id === FANTOME.id).length === 1,
    base.sets.filter((x) => x.session_id === FANTOME.id).length + ' série(s)');
  ok('[D7] toujours aucun refus', refusDepuis(repereD7b).length === 0,
    JSON.stringify(refusDepuis(repereD7b).slice(0, 3)));

  console.log('\n══ 7 septdecies. RÉPARER UNE FILE DÉJÀ BLOQUÉE ══');
  //
  // L'APPAREIL NE SE RÉPARE PAS TOUT SEUL. Borner à la saisie (chantier 36)
  // n'a aucun effet sur ce qui est DÉJÀ sur le disque, marqué définitif.
  //
  // CONFIGURATION DISCRIMINANTE : DEUX entrées bloquées, dont UNE SEULE
  // réparable. Avec une entrée unique, « réparer ce qui est réparable » et
  // « tout débloquer » donnent exactement le même écran.

  const SESS_BLOQ = {
    id: 'sess-bloquee', user_id: 'u-banc', titre: 'Bloquée depuis des jours',
    debut: new Date(LUNDI.getTime() + 5 * 86400000).toISOString(),
    fin: new Date(LUNDI.getTime() + 5 * 86400000 + 3600000).toISOString(),
    statut: 'terminee', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: new Date(LUNDI.getTime() + 5 * 86400000).toISOString()
  };
  base.sessions.push(Object.assign({}, SESS_BLOQ));

  // On écrit la file bloquée SUR LE DISQUE, telle qu'une version d'avant le
  // chantier 36 l'aurait laissée — puis on recharge. C'est le seul banc fidèle :
  // une file posée en mémoire serait reposée par le geste, pas relue.
  const repereRep = base.journal.length;
  await page.evaluate(async ([sid, debut]) => {
    await window.THCache.ecrireAttente([
      { cle: 'sets:' + sid, seq: 1, table: 'sets', op: 'remplacer', id: sid,
        donnees: [{
          id: 'set-bloq-1', session_id: sid, user_id: 'u-banc',
          exercise_slug: 'squat-barre', charge_kg: 100, reps: 99999999999,
          duree_s: null, distance_m: null, type_serie: 'travail', rang: 1,
          groupe_superset: null, validee_a: debut, rpe: null, ressenti: null,
          repos_s: null, note: null, source: 'app'
        }],
        version: 1, essais: 1, creation: false, posee_a: null,
        bloquee: { code: '22003', message: 'reps hors int4' } },
      { cle: 'sets:sess-rls', seq: 2, table: 'sets', op: 'remplacer', id: 'sess-rls',
        donnees: [{ id: 'set-rls-1', session_id: 'sess-rls', reps: 5 }],
        version: 1, essais: 1, creation: false, posee_a: null,
        bloquee: { code: '42501', message: 'row-level security' } }
    ]);
  }, [SESS_BLOQ.id, SESS_BLOQ.debut]);

  const enFile = () => page.evaluate(async () => {
    const f = await window.THCache.lireAttente();
    return f.map((e) => e.cle + (e.bloquee ? ':bloquée' : ':libre'));
  });
  ok('[R] la file est bien bloquée sur le disque avant le rechargement',
    JSON.stringify(await enFile()) ===
      JSON.stringify(['sets:sess-bloquee:bloquée', 'sets:sess-rls:bloquée']),
    JSON.stringify(await enFile()));

  await aller('/');
  await attendre(2000);

  ok('[R] LA SÉANCE BLOQUÉE DEPUIS DES JOURS REMONTE ENFIN',
    base.sets.filter((x) => x.session_id === SESS_BLOQ.id).length === 1,
    base.sets.filter((x) => x.session_id === SESS_BLOQ.id).length + ' série(s) montée(s)');
  const monteeRep = base.sets.filter((x) => x.session_id === SESS_BLOQ.id)[0];
  ok('[R] et ce qui monte est BORNÉ — la charge utile a été réparée, pas rejouée',
    !!monteeRep && monteeRep.reps > 0 && monteeRep.reps <= 2147483647,
    monteeRep ? 'reps=' + monteeRep.reps : 'rien');
  ok('[R] aucun refus du serveur : la réparation a produit une ligne acceptable',
    base.journal.filter((j, i) => i >= repereRep && j.op === 'refus').length === 0,
    JSON.stringify(base.journal.filter((j, i) => i >= repereRep && j.op === 'refus').slice(0, 3)));

  // ⚠️ ET L'IRRÉPARABLE RESTE BLOQUÉE, SANS CONDAMNER LA FILE. Pas de
  // déblocage en masse : une entrée RLS le resterait, et la débloquer masquerait
  // un défaut réel derrière une tentative qui échouerait à l'identique.
  ok('[R] l’entrée irréparable reste en file ET marquée — elle n’est pas jetée',
    (await enFile()).indexOf('sets:sess-rls:bloquée') >= 0,
    JSON.stringify(await enFile()));
  ok('[R] mais elle n’a plus empêché la réparable de partir',
    (await enFile()).indexOf('sets:sess-bloquee:bloquée') < 0,
    JSON.stringify(await enFile()));
  ok('[R] et l’état ne dit pas « À jour » — il reste une entrée refusée',
    !/À jour/.test(await texte('#etat-sync')) && /refusé/.test(await texte('#etat-sync')),
    (await texte('#etat-sync')) || '(vide)');

  // On rend la file propre : la section suivante parle d'autre chose.
  await page.evaluate(async () => { await window.THCache.ecrireAttente([]); });
  await aller('/');
  await attendre(1200);
  ok('[R] file vidée, l’app redémarre sans rien réparer ni rien casser',
    JSON.stringify(await visible()) === '["vue-liste"]' &&
    JSON.stringify(await enFile()) === '[]',
    JSON.stringify(await visible()) + ' · ' + JSON.stringify(await enFile()));

  console.log('\n══ 7 octodecies. LE FANTÔME S’ALIGNE PAR TYPE ══');
  //
  // CONFIGURATION DISCRIMINANTE : une séance précédente AVEC des chauffes, et
  // une séance d'aujourd'hui qui en a MOINS. Avec le même nombre des deux
  // côtés, aligner par indice et aligner par type donnent le même fantôme.
  //
  // Ce que seul ce banc peut prouver : `validerSerie` COMMET la valeur du
  // fantôme (§3 bis.3 — « on valide sans rien taper quand c'est juste »). Le
  // test unitaire montre le bon fantôme ; celui-ci montre la bonne ligne EN BASE.

  const AVANT_ROWING = {
    id: 'sess-rowing', user_id: 'u-banc', titre: 'Dos — la fois d’avant',
    debut: new Date(LUNDI.getTime() + 6 * 86400000).toISOString(),
    fin: new Date(LUNDI.getTime() + 6 * 86400000 + 3600000).toISOString(),
    statut: 'terminee', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: new Date(LUNDI.getTime() + 6 * 86400000).toISOString()
  };
  base.sessions.push(Object.assign({}, AVANT_ROWING));
  // `40(W) · 70(W) · 120 · 120 · 120` — exactement le cas de l'audit.
  [[1, 40, 10, 'echauffement'], [2, 70, 5, 'echauffement'],
   [3, 120, 5, 'travail'], [4, 120, 5, 'travail'], [5, 120, 4, 'travail']
  ].forEach(([rang, kg, reps, type]) => {
    base.sets.push({
      id: 'set-row-' + rang, session_id: AVANT_ROWING.id, user_id: 'u-banc',
      exercise_slug: 'rowing-barre', charge_kg: kg, reps: reps, duree_s: null,
      distance_m: null, type_serie: type, rang: rang, groupe_superset: null,
      validee_a: AVANT_ROWING.debut, rpe: null, ressenti: null, repos_s: null,
      note: null, source: 'app', created_at: AVANT_ROWING.debut, modifie_a: null
    });
  });
  // ⚠️ ET UN ANTÉCÉDENT POUR LES TRACTIONS, dans la MÊME séance (chantier 39).
  // Sans lui, la seconde branche du superset n'a rien à afficher en colonne, et
  // « chaque ligne lit les séries de SON exercice » ne se mesure pas : prendre le
  // premier exercice du bloc donnerait le même écran.
  [[6, 12, 'travail'], [7, 10, 'travail']].forEach(([rang, reps]) => {
    base.sets.push({
      id: 'set-trac-' + rang, session_id: AVANT_ROWING.id, user_id: 'u-banc',
      exercise_slug: 'tractions', charge_kg: null, reps: reps, duree_s: null,
      distance_m: null, type_serie: 'travail', rang: rang, groupe_superset: null,
      validee_a: AVANT_ROWING.debut, rpe: null, ressenti: null, repos_s: null,
      note: null, source: 'app', created_at: AVANT_ROWING.debut, modifie_a: null
    });
  });

  const repereF = base.journal.length;
  await aller('/');           // l'app synchronise la séance d'avant
  await attendre(1200);

  // ⚠️ LA SECTION D7 A LAISSÉ UNE SÉANCE EN COURS (elle en reprend une restée
  // ouverte en base, c'est tout son objet). L'écran de saisie n'en tient qu'UNE :
  // sans la refermer, « séance vide » n'existe pas et ce banc échouerait pour une
  // raison étrangère au défaut testé.
  await aller('/saisie');
  if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();

  await seanceVide();
  await ajouterExoSeance('Rowing');
  ok('[F] l’exercice est ajouté, avec UNE série de travail, aucune chauffe',
    (await compter('.ligne-serie')) === 1,
    (await compter('.ligne-serie')) + ' ligne(s)');

  // Le fantôme s'affiche en `placeholder` du champ de charge.
  const fantomeAffiche = () => page.evaluate(() =>
    (document.querySelector('.ligne-serie .ch-serie input') || {}).placeholder || '');
  ok('[F] LE FANTÔME AFFICHÉ EST LA CHARGE DE TRAVAIL, PAS CELLE DE LA CHAUFFE',
    (await fantomeAffiche()) === '120',
    'placeholder = « ' + (await fantomeAffiche()) + ' » (40 = la chauffe, le défaut)');

  // ⚠️ ET LA COLONNE, ICI ET PAS AILLEURS (chantier 39). C'est LA configuration
  // discriminante : la séance d'avant a deux chauffes, celle-ci aucune. Par
  // indice la colonne montrerait 40 ; par type elle montre 120 — comme le
  // fantôme, qu'elle contredisait sur device après la PR #282.
  const colonneAffichee = () => page.evaluate(() =>
    (document.querySelector('.ligne-serie .prec') || {}).textContent || '');
  ok('[F] LA COLONNE « PRÉCÉDENT » AUSSI — elle ne contredit plus le fantôme',
    /120/.test(await colonneAffichee()) && !/\b40\b/.test(await colonneAffichee()),
    'colonne = « ' + (await colonneAffichee()) + ' » · fantôme « ' +
    (await fantomeAffiche()) + ' »');

  // ⚠️ LE GESTE QUE LE §3 bis.3 VEND : valider sans rien taper.
  await page.evaluate(() => document.querySelector('.ligne-serie .ok-serie').click());
  await attendre(1800);
  const idRow = (base.sessions.filter((x) => x.statut === 'en_cours')[0] || {}).id;
  const monteeF = base.sets.filter((x) => x.session_id === idRow)[0];
  ok('[F] et VALIDER SANS RIEN TAPER écrit 120 en base, pas 40',
    !!monteeF && Number(monteeF.charge_kg) === 120,
    monteeF ? 'charge_kg = ' + monteeF.charge_kg : 'aucune série montée');
  ok('[F] les reps aussi viennent de la série de travail',
    !!monteeF && Number(monteeF.reps) === 5,
    monteeF ? 'reps = ' + monteeF.reps : '—');
  ok('[F] aucun refus du serveur',
    base.journal.filter((j, i) => i >= repereF && j.op === 'refus').length === 0,
    JSON.stringify(base.journal.filter((j, i) => i >= repereF && j.op === 'refus').slice(0, 3)));

  await terminer();

  // ── L'ALIGNEMENT TIENT DANS UN SUPERSET (§2.5) ────────────────────────
  //
  // ⚠️ SUR UNE SÉANCE VIERGE, et c'est obligatoire : `derniereSaisie` — « ce que
  // tu viens de taper sur cet exercice » — PRIME sur l'historique, et c'est
  // juste. Sur la séance précédente, la charge validée à 120 masquait le
  // fantôme historique : le banc mesurait la bonne règle au mauvais endroit.
  //
  // ⚠️ ET LA CHAUFFE EST EN SECONDE POSITION DANS LE MODÈLE. Première, les deux
  // alignements donneraient 40 et ne prouveraient rien. En position 2 : par
  // indice elle prendrait `prec[1]` = 70, par type elle est la PREMIÈRE chauffe
  // et prend 40.
  await seanceVide();
  await ajouterExoSeance('Rowing');
  await plusSerie(0);
  await attendre(400);
  await page.evaluate(() => {
    const nos = document.querySelectorAll('.ligne-serie .no-serie');
    nos[nos.length - 1].click();
  });
  await attendre(600);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
      .filter((x) => /chauffement/i.test(x.textContent))[0].click();
  });
  await attendre(800);
  await ajouterExoSeance('Tractions');
  await menuBloc(0);
  await entree('Grouper en superset');
  await attendre(400);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.bloc-seance'))[1];
    if (b) b.click();
  });
  await attendre(800);

  const badgesF = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie .no-serie')).map((n) => n.textContent));
  ok('[F] le superset est formé, la chauffe porte la LETTRE SEULE (§2.5)',
    (await compter('.bloc-seance.superset')) === 1 &&
    (await badgesF()).indexOf('A') >= 0,
    (await compter('.bloc-seance.superset')) + ' superset · badges ' +
    JSON.stringify(await badgesF()));

  const fantomeChauffeA = () => page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('.ligne-serie'))
      .filter((x) => x.querySelector('.no-serie').textContent === 'A')[0];
    if (!d) return '(aucune chauffe A)';
    const i = d.querySelector('.ch-serie input');
    return i ? (i.value ? '(saisie ' + i.value + ')' : i.placeholder) : '(pas de champ)';
  });
  // ⚠️ CHAQUE BRANCHE LIT LES SÉRIES DE SON EXERCICE — MESURÉ SUR LA SECONDE
  // SÉRIE DE B. Sur la première, le rang vaut 0 et le type « travail » des deux
  // côtés : prendre la liste de A ou celle de B donne la même réponse, et
  // l'assertion ne prouverait rien. En seconde position, A porte une CHAUFFE au
  // même indice — la mauvaise liste chercherait donc une chauffe de tractions,
  // qui n'existe pas, et la colonne resterait vide.
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.ajout-serie button'))
      .filter((b) => /Série B/.test(b.textContent))[0].click();
  });
  await attendre(600);
  const colonnesDeB = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie'))
      .filter((x) => /^B/.test(x.querySelector('.no-serie').textContent))
      .map((x) => x.querySelector('.prec').textContent.trim()));
  ok('[F] dans un superset, la colonne de B lit les séries de B, pas celles de A',
    JSON.stringify(await colonnesDeB()) === JSON.stringify(['12', '10']),
    'colonnes B = ' + JSON.stringify(await colonnesDeB()));

  ok('[F] dans un superset, la chauffe prend la CHAUFFE précédente (40), pas `prec[1]` (70)',
    (await fantomeChauffeA()) === '40',
    'placeholder = « ' + (await fantomeChauffeA()) + ' » · badges ' +
    JSON.stringify(await badgesF()));

  await terminer();

  console.log('\n══ 7 unvicies. LE NIVEAU 1 DE LA CASCADE — PAR TYPE, ET S’IL DÉVIE ══');
  //
  // ⚠️ CONFIGURATION DISCRIMINANTE (§2 quater), et elle demande DEUX choses à
  // la fois — c'est la quatrième fois que ce piège revient sur ce sujet :
  //
  //   · des CHAUFFES, sinon la moitié « par type » du défaut ne se voit pas ;
  //   · des charges de travail qui VARIENT (`120 · 120 · 125`), sinon la
  //     règle de déviation ne se mesure pas — tout est égal à tout.
  //
  // La fixture `AVANT_ROWING` ci-dessus ne convient pas : ses trois séries de
  // travail valent 120 · 120 · 120. On en pose donc une seconde, sur un autre
  // exercice, plutôt que de toucher à celle des chantiers 38 et 39.
  //
  // ⚠️ DES ENTIERS, PAS `122,5`. Le placeholder passe par `nombreFr`, qui rend
  // une VIRGULE, quand `fill()` écrirait un point : comparer les deux ferait
  // échouer le banc sur l'écriture du nombre et non sur la règle. `120 · 120 ·
  // 125` varie tout autant — c'est la VARIATION qui discrimine, pas la décimale.
  //
  // Ce que seul ce banc prouve : le fantôme AFFICHÉ à l'écran, après une vraie
  // validation au pouce. Le test unitaire montre la règle ; celui-ci montre que
  // le rendu la lit.
  const AVANT_DC = {
    id: 'sess-dc-rampe', user_id: 'u-banc', titre: 'Pecs — la fois d’avant',
    debut: new Date(LUNDI.getTime() + 5 * 86400000).toISOString(),
    fin: new Date(LUNDI.getTime() + 5 * 86400000 + 3600000).toISOString(),
    statut: 'terminee', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: new Date(LUNDI.getTime() + 5 * 86400000).toISOString()
  };
  base.sessions.push(Object.assign({}, AVANT_DC));
  [[1, 20, 12, 'echauffement'], [2, 60, 8, 'echauffement'],
   [3, 120, 5, 'travail'], [4, 120, 5, 'travail'], [5, 125, 4, 'travail']
  ].forEach(([rang, kg, reps, type]) => {
    base.sets.push({
      id: 'set-dc-' + rang, session_id: AVANT_DC.id, user_id: 'u-banc',
      exercise_slug: 'dc-barre', charge_kg: kg, reps: reps, duree_s: null,
      distance_m: null, type_serie: type, rang: rang, groupe_superset: null,
      validee_a: AVANT_DC.debut, rpe: null, ressenti: null, repos_s: null,
      note: null, source: 'app', created_at: AVANT_DC.debut, modifie_a: null
    });
  });
  await aller('/');
  await attendre(1200);
  await aller('/saisie');
  if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();

  await seanceVide();
  await ajouterExoSeance('Couch');
  await plusSerie(0); await plusSerie(0); await plusSerie(0); await plusSerie(0);
  await attendre(500);
  // Les deux premières en chauffe : on reproduit la forme de la fois d'avant.
  for (const k of [0, 1]) {
    await page.evaluate((i) => {
      document.querySelectorAll('.ligne-serie .no-serie')[i].click();
    }, k);
    await attendre(500);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => /chauffement/i.test(x.textContent))[0].click();
    });
    await attendre(700);
  }
  const fantomes = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.ligne-serie')).map((l) => {
      const i = l.querySelector('.ch-serie input');
      return i ? (i.value || i.placeholder || '') : '';
    }));
  ok('[G] la rampe de la fois d’avant s’affiche, chauffes comprises',
    JSON.stringify(await fantomes()) === JSON.stringify(['20', '60', '120', '120', '125']),
    JSON.stringify(await fantomes()));

  // ① LE DÉFAUT DU DEVICE : taper une chauffe qui DÉVIE (25 au lieu de 20).
  // Sans le filtre par type, les trois séries de travail passeraient à 25.
  await saisirSerie(0, 25, 12);
  ok('[G] une chauffe qui dévie ne touche PAS à la rampe de travail',
    JSON.stringify((await fantomes()).slice(2)) === JSON.stringify(['120', '120', '125']),
    JSON.stringify(await fantomes()));
  ok('[G] …mais elle propage bien à la chauffe suivante',
    (await fantomes())[1] === '25', JSON.stringify(await fantomes()));

  // ② LA RÈGLE DE DÉVIATION : valider la 1ʳᵉ série de travail À CE QUI ÉTAIT
  // PROPOSÉ (120) ne doit rien écraser — la 3ᵉ garde son 125.
  await saisirSerie(2, 120, 5);
  ok('[G] valider 120 sur la 1ʳᵉ laisse le 125 de la 3ᵉ',
    (await fantomes())[4] === '125', JSON.stringify(await fantomes()));

  // ③ ET UNE VRAIE DÉVIATION SE PROPAGE — à plat, jamais en décalant la rampe.
  await saisirSerie(3, 130, 5);
  ok('[G] 130 se propage à plat sur la suivante, pas 135',
    (await fantomes())[4] === '130', JSON.stringify(await fantomes()));

  await terminer();

  console.log('\n══ 7 novodecies. UN SEUL COMPTE, ET UNE COLONNE QUI NE MENT PLUS ══');
  //
  // CONFIGURATION DISCRIMINANTE : une séance AVEC des chauffes. Sans elles,
  // « compter les séries de travail » et « compter toutes les lignes » rendent
  // le même nombre, et les cinq écrans se ressemblent.

  await aller('/saisie');
  if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();
  await seanceVide();
  await ajouterExoSeance('Rowing');
  await plusSerie(0); await plusSerie(0); await plusSerie(0);
  await attendre(400);
  // Les DEUX premières en échauffement : 2 chauffes + 2 séries de travail.
  for (const k of [0, 1]) {
    await page.evaluate((i) => {
      document.querySelectorAll('.ligne-serie .no-serie')[i].click();
    }, k);
    await attendre(500);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#feuille-contenu .feuille-menu button'))
        .filter((x) => /chauffement/i.test(x.textContent))[0].click();
    });
    await attendre(700);
  }
  ok('[C] 2 chauffes + 2 séries de travail',
    (await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ligne-serie .no-serie')).map((n) => n.textContent)
    )).filter((b) => b === 'W').length === 2,
    JSON.stringify(await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ligne-serie .no-serie')).map((n) => n.textContent))));

  // ⚠️ LA COLONNE, SUR LA PREMIÈRE LIGNE DE TRAVAIL. L'antécédent est la séance
  // `40(W) · 70(W) · 120 · 120 · 120` du chantier 38 : par indice la colonne
  // montrerait 40, par type elle montre 120 — comme le fantôme.
  const colonneEtFantome = () => page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('.ligne-serie'))
      .filter((x) => x.querySelector('.no-serie').textContent !== 'W');
    const d = l[0];
    return d ? { colonne: d.querySelector('.prec').textContent.trim(),
                 fantome: d.querySelector('.ch-serie input').placeholder } : null;
  });
  const cf = await colonneEtFantome();
  ok('[C] la colonne « précédent » montre la charge de TRAVAIL, pas la chauffe',
    !!cf && /120/.test(cf.colonne),
    'colonne = « ' + (cf && cf.colonne) + ' »');
  ok('[C] et elle ne contredit plus le fantôme',
    !!cf && cf.colonne.indexOf(cf.fantome) >= 0,
    'colonne « ' + (cf && cf.colonne) + ' » · fantôme « ' + (cf && cf.fantome) + ' »');

  // La colonne d'une CHAUFFE montre une chauffe.
  const colonneChauffe = () => page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('.ligne-serie'))
      .filter((x) => x.querySelector('.no-serie').textContent === 'W')[0];
    return d ? d.querySelector('.prec').textContent.trim() : '';
  });
  ok('[C] sur une chauffe, elle montre une chauffe',
    /40/.test(await colonneChauffe()),
    'colonne = « ' + (await colonneChauffe()) + ' »');

  // ── LE MÊME COMPTE SUR TOUS LES ÉCRANS ────────────────────────────────
  await validerToutes();
  await attendre(1000);
  // L'identifiant se prend MAINTENANT : après « Terminer », la séance n'est plus
  // `en_cours` et son titre vaut null — la retrouver par le libellé affiché
  // chercherait une valeur que la base ne porte pas.
  const idC = enCoursId();
  const bandeau = () => texte('#bandeau-seance .bandeau-ch');
  ok('[C] le BANDEAU compte les séries de travail, pas les lignes',
    /2 séries de travail/.test(await bandeau()),
    (await bandeau()).replace(/\s+/g, ' '));

  await page.click('#bandeau-seance .bandeau-fin');
  await attendre(800);
  ok('[C] l’ÉCRAN DE FIN dit le même nombre',
    /2 séries de travail/.test(await texte('#feuille-contenu')),
    (await texte('#feuille-contenu')).replace(/\s+/g, ' ').slice(0, 60));
  await page.click('#feuille-contenu .principal');
  await attendre(2600);

  // ⚠️ QUATRE LIGNES POUR DEUX SÉRIES DE TRAVAIL. C'est l'écart que les cinq
  // écrans confondaient — et c'est lui que l'avertissement de suppression, seul,
  // doit continuer d'annoncer.
  ok('[C] et la base porte bien 4 lignes pour 2 séries de travail',
    base.sets.filter((x) => x.session_id === idC).length === 4 &&
    base.sets.filter((x) => x.session_id === idC && x.type_serie === 'travail').length === 2,
    base.sets.filter((x) => x.session_id === idC).length + ' ligne(s), ' +
    base.sets.filter((x) => x.session_id === idC && x.type_serie === 'travail').length +
    ' de travail');

  await aller('/');
  await attendre(800);
  const carteC = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.seance-meta')).map((n) => n.textContent));
  ok('[C] la CARTE porte le qualificatif « de travail » qu’elle avait perdu',
    (await carteC()).some((t) => /série(s)? de travail/.test(t)),
    JSON.stringify(await carteC()));

  // ── UNE SORTIE N'A PAS DE SÉRIES DE TRAVAIL ───────────────────────────
  const avantSortie = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  const SORTIE = {
    id: 'sess-sortie', user_id: 'u-banc', titre: 'Marche du soir',
    debut: new Date(LUNDI.getTime() + 3 * 86400000 + 3600000).toISOString(),
    fin: new Date(LUNDI.getTime() + 3 * 86400000 + 7200000).toISOString(),
    statut: 'terminee', note: null, salle: null, salle_norme: null,
    routine_id: null, source: 'app',
    created_at: new Date(LUNDI.getTime() + 3 * 86400000).toISOString()
  };
  base.sessions.push(Object.assign({}, SORTIE));
  [1, 2].forEach((rang) => base.sets.push({
    id: 'set-sortie-' + rang, session_id: SORTIE.id, user_id: 'u-banc',
    exercise_slug: 'marche', charge_kg: null, reps: null, duree_s: 1800,
    distance_m: 3000, type_serie: 'travail', rang: rang, groupe_superset: null,
    validee_a: SORTIE.debut, rpe: null, ressenti: null, repos_s: null,
    note: null, source: 'app', created_at: SORTIE.debut, modifie_a: null
  }));
  await aller('/');
  await attendre(1500);
  const apresSortie = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  ok('[C] UNE SORTIE N’AJOUTE AUCUNE SÉRIE DE TRAVAIL À LA SEMAINE',
    apresSortie.replace(/^\d+ séances/, '') === avantSortie.replace(/^\d+ séances/, ''),
    'avant « ' + avantSortie +' » · après « ' + apresSortie + ' »');
  ok('[C] mais elle est bien là — c’est le compte de séries qui l’ignore, pas la liste',
    /Marche du soir/.test(await texte('#liste-seances')),
    (await texte('#liste-seances')).replace(/\s+/g, ' ').slice(0, 70));

  console.log('\n══ 7 vicies. LA PAGE D’EXERCICE, ET LE COMPTE QUI DIVERGEAIT ══');
  //
  // CONFIGURATION DISCRIMINANTE (§2 quater), et il en faut trois :
  //
  //   · §1 — une séance MIXTE, musculation ET tapis, SEULE dans sa semaine.
  //     Sans sortie dedans, « filtre appliqué » et « filtre absent » donnent le
  //     même nombre ; sans l'isoler dans sa semaine, la barre additionne les
  //     vingt autres séances du banc et la comparaison ne mesure plus rien.
  //   · table par reps — un jeu où UNE ligne au moins est dominée par une autre
  //     à PLUS de reps, et une autre non.
  //   · mesures sans charge — un exercice en `temps` et un en `reps` : deux
  //     chemins différents dans `palier.js`.

  // ⚠️ DES IDENTIFIANTS EN UUID. Le routeur refuse tout le reste (`repli`), et
  // une ouverture directe sur `/seance/sess-mixte` retomberait sur la semaine —
  // le test mesurerait alors le repli, pas le détail.
  const ID_MIXTE = '40000000-0000-4000-8000-000000000014';

  // Une semaine à elle toute seule, loin de celle du banc.
  const L_EXO = new Date(LUNDI.getTime() - 56 * 86400000);
  const isoL = (d) => d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const jourExo = (n) => new Date(L_EXO.getTime() + n * 86400000 + 10 * 3600000).toISOString();

  let nExo = 0;
  const poserSeance = (id, titre, quand, lignes, note) => {
    base.sessions.push({
      id: id, user_id: 'u-banc', titre: titre, debut: quand, fin: quand,
      statut: 'terminee', note: note || null, salle: null, salle_norme: null,
      routine_id: null, source: 'app', created_at: quand
    });
    lignes.forEach((l, k) => base.sets.push(Object.assign({
      id: 'set-exo-' + (++nExo), session_id: id, user_id: 'u-banc',
      charge_kg: null, reps: null, duree_s: null, distance_m: null,
      type_serie: 'travail', rang: k + 1, groupe_superset: null,
      validee_a: quand, rpe: null, ressenti: null, repos_s: null,
      note: null, source: 'app', created_at: quand, modifie_a: null
    }, l)));
  };

  // ── §1 — LA SÉANCE MIXTE : 3 séries de musculation, 2 de tapis ──────────
  const kg = (charge, reps) => ({ exercise_slug: 'dc-barre', charge_kg: charge, reps: reps });
  poserSeance(ID_MIXTE, 'Quads tous terrains', jourExo(2), [
    { exercise_slug: 'dc-barre', charge_kg: 60, reps: 10, type_serie: 'echauffement' },
    kg(120, 6), kg(110, 8), kg(42.5, 14),
    { exercise_slug: 'marche', duree_s: 900, distance_m: 2000 },
    { exercise_slug: 'marche', duree_s: 900, distance_m: 2000 }
  ]);

  await aller('/semaine/' + isoL(L_EXO));
  const barreExo = (await texte('.barre-totaux')).replace(/\s+/g, ' ').trim();
  const carteExo = (await texte('#liste-seances .seance-meta')).replace(/\s+/g, ' ').trim();
  const nBarre = (barreExo.match(/(\d+) séries? de travail/) || [])[1];
  const nCarte = (carteExo.match(/(\d+) séries? de travail/) || [])[1];
  ok('[40 §1] LA CARTE ET LA BARRE DISENT LE MÊME NOMBRE SUR UNE SÉANCE MIXTE',
    nBarre !== undefined && nBarre === nCarte,
    'barre « ' + barreExo + ' » · carte « ' + carteExo + ' »');
  ok('[40 §1] et ce nombre EXCLUT le tapis — 3, pas 5',
    nCarte === '3', 'carte « ' + carteExo + ' »');

  // ── LE RESTE DE L'HISTORIQUE DU COUCHÉ, pour la table par reps ──────────
  // 80 × 15 en dernier : c'est lui qui domine le 42,5 × 14 de la séance mixte.
  poserSeance('40000000-0000-4000-8000-000000000015', 'Pecs – Dos', jourExo(4), [kg(80, 15)], 'Dur de se réveiller');
  // Une planche et des tractions, pour les deux chemins sans charge.
  poserSeance('40000000-0000-4000-8000-000000000016', 'Gainage', jourExo(5), [
    { exercise_slug: 'planche', duree_s: 90 },
    { exercise_slug: 'tractions', reps: 12 }
  ]);

  // ── 3. LE TAP SUR UN NOM D'EXERCICE, DEPUIS LE DÉTAIL D'UNE SÉANCE ──────
  await aller('/seance/' + ID_MIXTE);
  ok('[40] le détail de la séance mixte s’ouvre', (await visible())[0] === 'vue-detail',
    JSON.stringify(await visible()));
  const nomsDetail = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.exos .nom')).map((n) => n.tagName + ':' + n.textContent));
  ok('[40] les noms d’exercices y sont des BOUTONS — inertes depuis le chantier 27',
    (await nomsDetail()).every((t) => t.indexOf('BUTTON:') === 0),
    JSON.stringify(await nomsDetail()));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.exos .nom'))
      .filter((n) => /Couché/.test(n.textContent))[0].click();
  });
  await attendre(900);
  const url = () => page.evaluate(() => location.pathname);
  ok('[40] taper le nom ouvre la page d’exercice, et l’URL la porte',
    (await visible())[0] === 'vue-exercice' && (await url()) === '/exercice/dc-barre',
    JSON.stringify(await visible()) + ' · ' + (await url()));

  // ── 7. LA TABLE PAR REPS : brut, lignes déduites grisées ────────────────
  const tableExo = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.tr-ligne')).map((l) =>
      (l.querySelector('.tr-reps') || {}).textContent + '=' +
      (l.querySelector('.tr-charge') || {}).textContent +
      (l.classList.contains('deduit') ? '(déduit)' : '') +
      (l.classList.contains('cible') ? '(cible)' : '')));
  ok('[40] la table par reps est triée par nombre de répétitions croissant',
    (await tableExo()).length >= 4 &&
    (await tableExo()).map((t) => parseInt(t, 10))
      .every((n, i, a) => i === 0 || a[i - 1] < n),
    JSON.stringify(await tableExo()));
  // ⚠️ L'ASYMÉTRIE EST LA MESURE. Le 14 reps est dominé par le 80 × 15 : il est
  // grisé ET il montre le 80 qu'on pourrait revendiquer, pas le 42,5 fait ce
  // jour-là. Le 6 reps, lui, ne l'est pas. Une table où tout serait déduit — ou
  // rien — ne prouverait rien.
  ok('[40] la ligne dominée est grisée et montre le 80 qu’on pourrait revendiquer',
    (await tableExo()).some((t) => t === '14=80(déduit)'),
    JSON.stringify(await tableExo()));
  ok('[40] et celle qui ne l’est pas garde sa charge brute et sa DATE',
    (await tableExo()).some((t) => t === '6=120') &&
    (await page.evaluate(() => Array.from(document.querySelectorAll('.tr-ligne'))
      .filter((l) => !l.classList.contains('deduit'))
      .map((l) => l.querySelector('.tr-quand').textContent))).every((t) => /\d{4}/.test(t)),
    JSON.stringify(await tableExo()) + ' · ' + JSON.stringify(await page.evaluate(() =>
      Array.from(document.querySelectorAll('.tr-ligne')).map((l) => l.querySelector('.tr-quand').textContent))));

  // ── 4. LES DEUX SOUS-ONGLETS ONT LEUR URL ───────────────────────────────
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.sous-onglet'))
      .filter((b) => /Historique/.test(b.textContent))[0].click();
  });
  await attendre(900);
  ok('[40] l’Historique a SON URL',
    (await url()) === '/exercice/dc-barre/historique' &&
    (await compter('.exo-jour')) >= 2,
    (await url()) + ' · ' + (await compter('.exo-jour')) + ' jour(s)');
  ok('[40] et il montre les séries de chaque jour, chauffe comprise',
    (await compter('.exo-jour .serie')) >= 4 &&
    (await compter('.exo-jour .serie.hors-travail')) >= 1,
    (await compter('.exo-jour .serie')) + ' ligne(s), dont ' +
    (await compter('.exo-jour .serie.hors-travail')) + ' hors travail');
  ok('[40] la note de séance y est rendue',
    /Dur de se réveiller/.test(await texte('#page-exercice')),
    (await texte('#page-exercice')).replace(/\s+/g, ' ').slice(0, 80));

  // ⚠️ LE RECHARGEMENT DIRECT — c'est lui qui distingue une URL d'un onglet.
  await aller('/exercice/dc-barre/historique');
  ok('[40] LE RECHARGEMENT DIRECT ROUVRE L’HISTORIQUE, pas le Résumé',
    (await visible())[0] === 'vue-exercice' &&
    /Historique/.test(await texte('.sous-onglet.actif')),
    JSON.stringify(await visible()) + ' · onglet « ' + (await texte('.sous-onglet.actif')) + ' »');
  await aller('/exercice/dc-barre');
  ok('[40] et celui du Résumé rouvre le Résumé',
    /Résumé/.test(await texte('.sous-onglet.actif')),
    'onglet « ' + (await texte('.sous-onglet.actif')) + ' »');

  // ── 5. UN EXERCICE SANS CHARGE N'AFFICHE JAMAIS 0 kg ────────────────────
  for (const [slug, mot] of [['planche', 'durée'], ['tractions', 'répétitions']]) {
    await aller('/exercice/' + slug);
    const p = (await texte('#page-exercice')).replace(/\s+/g, ' ');
    ok('[40] ' + slug + ' : pas de « 0 kg », et la phrase lit la MESURE',
      (await visible())[0] === 'vue-exercice' && !/0 kg/.test(p) &&
      p.indexOf(mot) >= 0 && !/sans-charge|hors-moteur/.test(p),
      p.slice(0, 110));
  }

  // ── 6. UN EXERCICE JAMAIS FAIT : page vide propre, pas de plantage ──────
  const avantVide = erreurs.length;
  await aller('/exercice/souleve-terre');
  const pVide = (await texte('#page-exercice')).replace(/\s+/g, ' ');
  ok('[40] un exercice jamais fait rend une page, sans erreur de script',
    (await visible())[0] === 'vue-exercice' && erreurs.length === avantVide &&
    /Soulevé de Terre/.test(pVide), pVide.slice(0, 90));
  ok('[40] et il montre des tirets, pas des zéros',
    (await page.evaluate(() =>
      Array.from(document.querySelectorAll('.exo-li-v')).map((n) => n.textContent)))
      .join('|') === '—|—|—',
    JSON.stringify(await page.evaluate(() =>
      Array.from(document.querySelectorAll('.exo-li-v')).map((n) => n.textContent))));

  // ── §7 quater.1 — LE BANDEAU DE SÉANCE, ET « REPRENDRE » ────────────────
  await aller('/saisie');
  if (JSON.stringify(await visible()) === '["vue-seance"]') await terminer();
  await seanceVide();
  await ajouterExoSeance('Développé Couché');
  ok('[40] une séance est en cours', JSON.stringify(await visible()) === '["vue-seance"]',
    JSON.stringify(await visible()));
  const sansBandeau = await compter('.exo-bandeau');
  await page.evaluate(() => { document.querySelector('.exo-seance .nom-exo').click(); });
  await attendre(900);
  ok('[40] taper le nom EN SÉANCE ouvre la page — §2.8, inerte depuis le chantier 27',
    (await visible())[0] === 'vue-exercice' && (await url()) === '/exercice/dc-barre',
    JSON.stringify(await visible()) + ' · ' + (await url()));
  ok('[40] la séance reste visible en bandeau : on n’a pas l’impression de l’avoir quittée',
    sansBandeau === 0 && (await compter('.exo-bandeau')) === 1 &&
    /en cours/.test(await texte('.exo-bandeau')),
    'avant ' + sansBandeau + ' · ici ' + (await compter('.exo-bandeau')) +
    ' · « ' + (await texte('.exo-bandeau')).replace(/\s+/g, ' ') + ' »');
  await page.click('.exo-reprendre');
  await attendre(900);
  ok('[40] « Reprendre » y ramène', JSON.stringify(await visible()) === '["vue-seance"]',
    JSON.stringify(await visible()));

  // Le retour REMONTE l'historique : la page s'atteint depuis trois écrans,
  // décider d'une destination en enverrait deux sur trois au mauvais endroit.
  await aller('/seance/' + ID_MIXTE);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.exos .nom'))
      .filter((n) => /Couché/.test(n.textContent))[0].click();
  });
  await attendre(900);
  await page.click('#btn-retour-exercice');
  await attendre(900);
  ok('[40] le bouton retour de la page ramène D’OÙ L’ON VIENT',
    (await visible())[0] === 'vue-detail' && (await url()) === '/seance/' + ID_MIXTE,
    JSON.stringify(await visible()) + ' · ' + (await url()));
  await terminer().catch(() => {});

  // ══ 47. LES DÉFAUTS DE L'ÉTAT DES LIEUX DU 18/09 ═════════════════════════

  console.log('\n══ 47. « MODIFIER » SUR UNE SÉANCE DONT LES SÉRIES NE SONT PAS ARRIVÉES ══');
  //
  // ⚠️ LA CONFIGURATION DISCRIMINANTE, ET ELLE EST TOUT LE SUJET : une séance
  // que le cache CONNAÎT et dont il n'a AUCUNE série. Sur une séance complète,
  // « la règle est consultée » et « elle ne l'est pas » rendent exactement le
  // même écran — c'est précisément ce qui a laissé le défaut vivre.
  //
  // En vrai, cet état dure : `synchroniser` écrit les SÉANCES au cache avant
  // les SÉRIES. Une app fermée entre les deux, ou un commit refusé, laisse
  // l'écart SUR DISQUE, et le démarrage suivant le relit tel quel.
  // ⚠️ ON REPART D'UN ÉTAT PROPRE, ET C'EST NÉCESSAIRE. Le `terminer()` de la
  // section précédente est appelé depuis le DÉTAIL d'une séance, où
  // `#bandeau-seance` n'existe pas : son `.catch(() => {})` avale l'échec et la
  // séance reste EN COURS. `modifierSeance` refuse alors net
  // (`seanceEnCoursBloque`) — et la mesure dirait « le bouton ne marche pas »
  // alors qu'elle n'aurait mesuré que l'état laissé par la section d'avant.
  await aller('/saisie');
  if ((await visible())[0] === 'vue-seance') await terminer().catch(() => {});

  const ID_VIDE = '40000000-0000-4000-8000-0000000000e1';
  poserSeance(ID_VIDE, 'Séries pas arrivées', jourExo(6), []);
  // ⚠️ ON MESURE AVANT, ON COMPARE APRÈS. Un compte écrit en dur dans
  // l'assertion ne dit rien du défaut — il dit ce que la fixture contenait le
  // jour où on l'a écrit, et il se périme au premier ajout. L'invariante, elle,
  // est « rien n'a bougé », et elle vaut quelle que soit la fixture.
  const setsAvant47 = base.sets.length;
  await aller('/semaine/' + isoL(L_EXO));

  const carteVide = () => page.evaluate((id) => {
    const cartes = Array.from(document.querySelectorAll('.seance'));
    const c = cartes.filter((n) => /Séries pas arrivées/.test(n.textContent))[0];
    if (!c) return null;
    return {
      texte: c.textContent,
      incomplete: c.classList.contains('incomplete'),
      // Le « ⋯ » vit À CÔTÉ de la carte, dans son enveloppe.
      menu: !!(c.parentElement && c.parentElement.querySelector('.menu-pts'))
    };
  }, ID_VIDE);

  const vue47 = await carteVide();
  ok('[47] la CARTE dit que les séries ne sont pas arrivées, et refuse son menu',
    !!vue47 && /séries pas encore reçues/.test(vue47.texte) && vue47.menu === false,
    vue47 ? (vue47.texte.replace(/\s+/g, ' ').slice(0, 60) + ' · menu ' + vue47.menu) : '(carte absente)');

  // ⚠️ ET LE DÉTAIL DE LA MÊME SÉANCE, AU MÊME INSTANT. C'était l'incohérence :
  // la carte refusait, le détail offrait — et « Modifier » y rouvrait une séance
  // vide dont l'enregistrement posait `remplacerSeries(id, [])`.
  await aller('/seance/' + ID_VIDE);
  ok('[47] le DÉTAIL refuse les mêmes gestes — plus aucun bouton',
    JSON.stringify(await visible()) === '["vue-detail"]' &&
    (await compter('#vue-detail .detail-gestes button')) === 0,
    JSON.stringify(await visible()) + ' · ' +
    (await compter('#vue-detail .detail-gestes button')) + ' geste(s)');
  ok('[47] …et il dit POURQUOI, au lieu d’affirmer qu’il n’y a rien',
    /finissent d.arriver/.test(await texte('#vue-detail')) &&
    !/Aucune série sur cette séance/.test(await texte('#vue-detail')),
    (await texte('#vue-detail .vide')).replace(/\s+/g, ' ').slice(0, 70));

  // ⚠️ ET RIEN N'EST PARTI. C'est la mesure qui compte : le défaut ne se voyait
  // pas à l'écran, il se voyait en base. Aucune séance du banc ne doit avoir
  // perdu de séries pendant tout ce qui précède.
  ok('[47] et aucune série n’a été effacée en base',
    base.sets.length === setsAvant47,
    setsAvant47 + ' → ' + base.sets.length + ' série(s) en base');

  // NON-RÉGRESSION DU CHANTIER 29 : une séance COMPLÈTE garde ses trois gestes.
  await aller('/seance/' + ID_MIXTE);
  ok('[47] une séance complète, elle, garde ses trois gestes',
    (await compter('#vue-detail .detail-gestes button')) === 3,
    (await compter('#vue-detail .detail-gestes button')) + ' geste(s)');

  console.log('\n══ 47 bis. « ← SÉANCES » REMONTE, IL N’EMPILE PAS ══');
  //
  // ⚠️ ON MESURE `history.length`, PAS L'ÉCRAN. Les deux implémentations
  // arrivent sur la liste : celle qui EMPILE y arrive en ajoutant une entrée,
  // et c'est l'entrée de trop qui obligeait à trois retours pour sortir — dont
  // un qui ROUVRAIT le détail qu'on venait de quitter.
  await aller('/semaine/' + isoL(L_EXO));
  const longueurAvant = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.seance'))
      .filter((n) => /Quads tous terrains/.test(n.textContent))[0];
    if (c) c.click();
  });
  await attendre(900);
  const surDetail = JSON.stringify(await visible());
  const longueurDetail = await page.evaluate(() => history.length);
  await page.click('#btn-retour');
  await attendre(900);
  const longueurApres = await page.evaluate(() => history.length);
  ok('[47] « ← Séances » ramène aux séances SANS empiler une entrée de plus',
    surDetail === '["vue-detail"]' && JSON.stringify(await visible()) === '["vue-liste"]' &&
    longueurApres === longueurDetail,
    surDetail + ' · ' + longueurAvant + ' → ' + longueurDetail + ' → ' + longueurApres);

  // ⚠️ LA MOITIÉ QUI COMPTE VRAIMENT : le retour d'Android, juste après. Avec
  // une entrée empilée, il ROUVRAIT le détail. C'est le « trois retours pour
  // sortir » du relevé, et c'est ce qu'aucune mesure d'écran seule ne montre.
  await page.goBack().catch(() => {});
  await attendre(900);
  ok('[47] …et le retour d’Android ne ROUVRE PAS le détail qu’on vient de quitter',
    JSON.stringify(await visible()) !== '["vue-detail"]',
    JSON.stringify(await visible()));

  // ⚠️ ET LE REPLI, QUI EST LA MOITIÉ QU'ON N'AURAIT PAS TESTÉE. Après un
  // rechargement DIRECT, aucune de nos entrées n'a été empilée : `history.back()`
  // est alors absorbé par l'ancre de `THSortie` et le bouton ne fait RIEN. Ce
  // trou existait sur le « ← » de la page d'exercice depuis le chantier 40 — le
  // banc ne l'avait jamais vu parce qu'il empile toujours une entrée avant de
  // cliquer. C'est exactement la configuration discriminante : un `aller()`,
  // qui est un goto, et rien d'autre avant le clic.
  await aller('/seance/' + ID_MIXTE);
  await page.click('#btn-retour');
  await attendre(900);
  ok('[47] après un rechargement direct, « ← Séances » n’est pas un bouton MORT',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));

  // Le chemin d'édition ne doit pas non plus laisser d'entrées derrière lui :
  // « Modifier » puis « Enregistrer » revenaient en empilant deux fois, et
  // « ← Séances » remontait alors sur /saisie — le bouton mentait sur sa
  // destination. Les deux REMPLACENT désormais, comme les cinq autres entrées
  // dans l'onglet Saisie.
  await aller('/seance/' + ID_MIXTE);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /^Modifier$/.test(b.textContent))[0].click();
  });
  await attendre(1200);
  const enEdition47 = JSON.stringify(await visible());
  await page.click('#bandeau-seance .bandeau-fin').catch(() => {});
  await attendre(2000);
  const apresEdition = JSON.stringify(await visible());
  await page.click('#btn-retour').catch(() => {});
  await attendre(900);
  ok('[47] après « Modifier → Enregistrer », « ← Séances » va bien aux SÉANCES',
    enEdition47 === '["vue-seance"]' && apresEdition === '["vue-detail"]' &&
    JSON.stringify(await visible()) === '["vue-liste"]',
    enEdition47 + ' → ' + apresEdition + ' → ' + JSON.stringify(await visible()));

  console.log('\n══ 49. LE CHEMIN COMPLET DU RETOUR, SUR UNE PAGE NEUVE ══');
  //
  // ⚠️ UNE PAGE NEUVE, ET C'EST LA CONFIGURATION DISCRIMINANTE (§2 quater).
  // Chrome PLAFONNE `history.length` à 50. La page unique de ce banc sature
  // bien avant d'arriver ici : toute mesure de profondeur y est vraie par
  // saturation, jamais par correction — c'est ce qui a rendu VIDE l'assertion
  // « longueurApres === longueurDetail » du chantier 47, mesurée à 50 = 50. Une
  // page neuve repart à une profondeur de deux ou trois, où une entrée de trop
  // se voit.
  //
  // ⚠️ ET LE CHEMIN ENTIER, PAS LE DERNIER SAUT (§5.7). C'est la troisième fois
  // que le bouton retour coûte un chantier, et à chaque fois pour la même
  // raison : on mesurait UN retour. Un seul ne montre pas qu'une pile est
  // fausse — il montre seulement que l'écran d'après est le bon. On en fait
  // donc DEUX de suite, et on regarde ce que le premier a laissé.
  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/semaine/' + isoL(L_EXO));
  const h49Liste = await page.evaluate(() => history.length);
  const vue49Liste = JSON.stringify(await visible());

  await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.seance'))
      .filter((n) => /Quads tous terrains/.test(n.textContent))[0];
    if (c) c.click();
  });
  await attendre(900);
  const h49Detail = await page.evaluate(() => history.length);
  const libelle49 = (await texte('#btn-retour')).trim();

  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#vue-detail .detail-gestes button'))
      .filter((b) => /^Modifier$/.test(b.textContent))[0].click();
  });
  await attendre(1200);
  const vue49Saisie = JSON.stringify(await visible());
  await page.click('#bandeau-seance .bandeau-fin').catch(() => {});
  await attendre(2000);
  const vue49Retour = JSON.stringify(await visible());
  const h49Apres = await page.evaluate(() => history.length);

  // ⚠️ LE LIBELLÉ EST LA MOITIÉ DU DÉFAUT, ET C'EST ELLE QUI CAUSE L'AUTRE.
  // Un bouton qui NOMME sa destination fait une promesse écrite ; `history.back()`
  // rend l'entrée précédente, qui n'est cette destination que si l'on vient d'y
  // passer. On vérifie donc le mot AVANT le saut — et qu'il n'a pas changé après
  // l'aller-retour par la saisie, là où Aurélien a lu autre chose sur device.
  ok('[49] le détail annonce « ← Séances », avant comme après l’édition',
    libelle49 === '← Séances' && (await texte('#btn-retour')).trim() === '← Séances',
    libelle49 + ' → ' + (await texte('#btn-retour')).trim());

  ok('[49] …et l’édition n’a ajouté aucune entrée d’historique',
    vue49Liste === '["vue-liste"]' && vue49Saisie === '["vue-seance"]' &&
    vue49Retour === '["vue-detail"]' && h49Apres === h49Detail && h49Detail <= h49Liste + 1,
    'liste ' + h49Liste + ' → détail ' + h49Detail + ' → après édition ' + h49Apres);

  // §5.6 — le bouton tient sa promesse : la LISTE, pas autre chose.
  await page.click('#btn-retour').catch(() => {});
  await attendre(900);
  const vue49R1 = JSON.stringify(await visible());
  const h49R1 = await page.evaluate(() => history.length);
  ok('[49] « ← Séances » ramène à la liste — et sans empiler',
    vue49R1 === '["vue-liste"]' && h49R1 === h49Apres,
    vue49R1 + ' · profondeur ' + h49Apres + ' → ' + h49R1);

  // §5.7 — DEUX retours d'Android de suite. Le premier ne doit pas rouvrir le
  // détail qu'on vient de quitter (c'est le grief du chantier 40) ; le second ne
  // doit pas remonter PLUS LOIN que la liste — ni la saisie, ni un écran d'avant.
  // C'est ce saut-là qu'Aurélien a signalé, et un seul retour ne l'aurait pas vu.
  await page.goBack().catch(() => {});
  await attendre(900);
  const vue49B1 = JSON.stringify(await visible());
  await page.goBack().catch(() => {});
  await attendre(900);
  const vue49B2 = JSON.stringify(await visible());
  ok('[49] deux retours d’Android de suite : ni le détail, ni la saisie',
    vue49B1 === '["vue-liste"]' && vue49B2 === '["vue-liste"]',
    vue49B1 + ' → ' + vue49B2);

  // Le repli reste vivant : sur une page neuve ouverte DIRECTEMENT sur le
  // détail, aucune de nos entrées n'a été empilée. Le bouton doit naviguer,
  // pas rester inerte — c'est le trou que le chantier 47 avait fermé, et qui
  // se refermerait tout seul ici puisque la navigation est désormais explicite.
  await page.close(); page = await ctx.newPage(); brancher(page);
  await aller('/seance/' + ID_MIXTE);
  await page.click('#btn-retour').catch(() => {});
  await attendre(900);
  ok('[49] ouvert directement sur le détail, « ← Séances » n’est pas MORT',
    JSON.stringify(await visible()) === '["vue-liste"]', JSON.stringify(await visible()));

  // ⚠️ ET L'AUTRE « ← » NE CHANGE PAS. « ← Retour » ne nomme aucune
  // destination, et la page d'exercice s'atteint depuis trois écrans : elle
  // garde `remonter`. Sans cette mesure, « corriger les deux pareil » serait la
  // régression suivante — c'est exactement ce que le chantier 47 a fait en sens
  // inverse.
  ok('[49] « ← Retour », lui, ne nomme aucune destination',
    (await page.evaluate(() => (document.getElementById('btn-retour-exercice') || {}).textContent || '')).trim()
      === '← Retour',
    await page.evaluate(() => (document.getElementById('btn-retour-exercice') || {}).textContent || ''));

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
