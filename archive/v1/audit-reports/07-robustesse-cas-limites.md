# AUDIT 07 — Robustesse & Cas limites

> Généré le 2026-07-15 (~12h05 UTC). Branche `claude/agent09-profils-fixtures` (SW v350).
> READ-ONLY. Un seul fichier écrit : ce rapport. Aucune modification, aucun commit, aucun Supabase.
> Méthode : simulation d'utilisateurs extrêmes en SUIVANT le code, appuyée sur les fixtures
> agent 09 (`tests/fixtures/profiles/`) exécutées via le VRAI `loadDB` (`validate.js`).

## Blocages rencontrés
Aucun. Accès repo complet, `node` disponible, les 9 profils passent le vrai `loadDB`
(`node tests/fixtures/profiles/validate.js` → « ✅ TOUS LES PROFILS CHARGENT »).
Aveugle à Supabase (questions listées en fin de rapport).

## Résumé exécutif
**8 findings** (0 P0 franc, 2 P1, 5 P2, 1 P3) + 1 P1 hors-domaine signalé.
La tuyauterie défensive de base est **solide** (voir « Mitigations ») : `loadDB` retombe
sur `defaultDB()` sur toute exception, le quota localStorage est capté avec toast, deux
traps globaux capturent erreurs+rejets, le SW précache tout le shell (offline complet),
les écritures offline sont mises en file (`pendingSync`) et rejouées sur `online`, et les
wrappers `wp*Safe` protègent la génération de programme. **Le point le plus important** :
`predictPR` n'a **aucune fenêtre de récence** → il déclare « Objectif déjà atteint ! » à un
revenant sur un e1RM vieux de ~7 mois (motif « faux ✅ objectif atteint » listé P0 §7).
Les autres risques sont des **angles morts défensifs** (log sans `.exercises`, exo sans
`.name`, aucun garde-fou d'outlier, plafond localStorage vers ~2700 séances) et une
**non-idempotence de render** (`calcStreak()` mutant appelé en render).

## Matrice SCÉNARIO × ZONE
Légende : ✅ OK · ⚠️ dégradé (marche mais sortie douteuse / perf) · 🔴 casse (crash / NaN / perte / mensonge)

| Scénario | loadDB / boot | Home / Coach render | Diagnostic / Ratios | TDEE / Nutrition | predictPR / Trend | Gamification / Leaderboard | Offline / Sync |
|---|---|---|---|---|---|---|---|
| 1. Nouvel utilisateur (0 séance) | ✅ | ✅ guards vide | ✅ ratios `null` | ⚠️ 2300 défaut | ✅ « Pas assez de données » | ✅ | ✅ |
| 2. Massif (562 séances, 1 MB) | ✅ | ⚠️ perf | ⚠️ perf (re-tris) | ✅ 2672 | ✅ | ✅ O(n) badge stats | ⚠️ blob 1 MB / sync |
| 3. Retour après pause (6 mois) | ✅ | ⚠️ | ✅ | ✅ 2390 | 🔴 faux « Objectif atteint » (stale) | ⚠️ streak/freeze au render | ✅ |
| 4. Données sales (typos / 0 / futur / dup) | ✅ | 🔴 si log sans `.exercises` / exo sans `.name` | ⚠️ ratio 3.9 non signalé | 🔴 4524 kcal (height/age=0) | ⚠️ | ⚠️ | ✅ futur exclu des fenêtres |
| 5. Offline / Supabase down / Gemini timeout | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ file `pendingSync` |
| 6. Mono-lift (bench seul) | ✅ | ✅ | ✅ ratios manquants masqués (guard `if(row&&bench)`) | ✅ | ✅ | ✅ | ✅ |
| 7. Valeurs extrêmes (40/300 kg, 15 séances/sem) | ✅ | ⚠️ | ⚠️ articulaire (à confirmer) | ✅ cap 1.7 tient (4543) | ✅ | ⚠️ | ✅ |
| 8. Temps & fuseaux (minuit, UTC vs local) | — | ⚠️ clés date UTC vs local mélangées | — | ⚠️ diviseur 28j | ⚠️ | ⚠️ check-in 00h–02h mal daté | — |

## Findings

### [P1] `predictPR` sans fenêtre de récence → faux « Objectif déjà atteint » pour un revenant
- **Où** : `app.js:9262-9298`
- **Code** :
  ```js
  for (const log of desc) {                       // desc = TOUS les logs triés, sans borne d'âge
    const exo = log.exercises.find(e => getSBDType(e.name) === liftType);
    if (!exo || !exo.maxRM || exo.maxRM <= 0) continue;
    pts.push({ x: log.timestamp / 86400000, y: exo.maxRM });
    if (pts.length >= 6) break;
  }
  ...
  const currentE1RM = pts[pts.length - 1].y;      // « courant » = le + récent des 6, même vieux de 7 mois
  if (currentE1RM >= targetWeight) return { reachable: true, reason: 'Objectif déjà atteint !', weeks: 0 };
  ```
- **Problème** : les 6 points sont les 6 séances **les plus récentes contenant le lift**,
  sans plancher d'ancienneté. Profil `retour_apres_pause` (reproduit par `validate.js`) :
  le deadlift n'a pas été travaillé depuis ~200 j ; `predictPR('deadlift', 175)` renvoie
  `{reachable:true, reason:"Objectif déjà atteint !"}` sur un e1RM vieux de ~214 j pris pour
  « courant ». C'est le motif « faux ✅ objectif atteint » explicitement listé **P0 en §7**.
  La régression peut aussi mélanger des points espacés de 2 ans (bloc -190 j → -900 j).
- **Devrait** : ne garder que les points dans une fenêtre récente (ex. 90-120 j) ; si aucun
  point récent → « Pas de données récentes », pas de verdict d'objectif ; distinguer
  « courant » (récent) de « dernier connu » (potentiellement périmé).
- **Confiance** : certain (reproduit ; ligne `predict_dead` de `retour_apres_pause`).
- **[VOULU?]** : « 6 derniers points » est un choix simple, mais l'absence de garde-fou de récence produit un mensonge au revenant.

### [P1] Render non-idempotent : `calcStreak()` (chemin MUTANT) appelé pendant les renders
- **Où** : appelé sans `readOnly` à `app.js:3931` (`_computeBadgeStats`), `7594` (`_buildGamContext`), `4348`/`7312` (XP), `8354` (leaderboard), `11180` (home). Seul `app.js:18915` passe `calcStreak(true)`.
- **Code** (chemin mutant, `calcStreak`, app.js:4549-4564) :
  ```js
  } else if (!readOnly && !freezeConsumedThisCall && (db.gamification.streakFreezes||0) > 0 && streak >= 4) {
    streak++; freezeConsumedThisCall = true;
    db.gamification.streakFreezes = Math.max(0, ...-1);
    db.gamification.freezeProtectedWeeks.push(checkWeek);   // ← ÉCRITURE db
    db.gamification.freezesUsedAt.push(Date.now());
    if (typeof syncToCloud === 'function') syncToCloud();   // ← RÉSEAU au render
    if (typeof showToast === 'function') showToast('❄️ Freeze utilisé — streak protégé');
  }
  ```
- **Problème** : pour un utilisateur avec streak ≥ 4, une semaine manquée et des freezes
  dispo, le simple **render** de la gamification/home/leaderboard **consomme un freeze**,
  écrit dans `db`, déclenche une **sync cloud** et un **toast**. Viole l'invariante « Render
  pur » (§3/§9 : « db identique après deux renders ») — c'est le pattern P0 « écriture au
  render ». Deux renders successifs donnent des `db` différents (1er consomme, 2e voit protégé).
- **Devrait** : les chemins d'affichage passent `calcStreak(true)` ; la consommation de
  freeze se fait dans un chemin d'action explicite (fin de séance / tick hebdo), pas au render.
- **Confiance** : certain (chemin mutant + sites d'appel sans `readOnly` vérifiés).
- **[VOULU?]** : non. Cross-réf. invariante §9 (render pur) — peut être co-traité par l'audit render/profils.

### [P2] `getSBDType`/`_getSBDTypeRaw` crashe sur un exercice sans `name`
- **Où** : `engine.js:809-810` (+ 17 sites `\.name\.toLowerCase()` non gardés : 13 app.js, 4 engine.js)
- **Code** :
  ```js
  function _getSBDTypeRaw(name) {
    const n = name.toLowerCase().normalize('NFD')...   // ← name undefined → TypeError
  ```
- **Problème** : contrairement à `matchExoName` (gardé : `if (!hevyName || !progName) return false`,
  engine.js:999), `_getSBDTypeRaw` déréférence `name` sans garde. Un exercice sans `name`
  (import partiel, merge cloud, édition) fait planter `getSBDType(e.name)` — donc `predictPR`,
  `recalcBestPR`, ratios, badges, etc. Le trap global loggue mais la carte/calcul reste cassé.
  Ex. aussi `app.js:10278` : `e.name.toLowerCase()` dans un `.filter` non gardé.
- **Devrait** : `if (!name) return null;` en tête de `_getSBDTypeRaw` ; garder les `.name.toLowerCase()`.
- **Confiance** : certain sur le code ; probable sur l'occurrence réelle (dépend des données Supabase).
- **[VOULU?]** : non.

### [P2] ~94 accès `log.exercises.*` non gardés → un log sans `.exercises` casse le render
- **Où** : ex. `app.js:9266`, `15819`, `15847`, `15871` (+ ~90 via `grep -n "\.exercises\.\(forEach\|find\|map\|some\|filter\|reduce\)"`)
- **Code** (échantillon) :
  ```js
  const exo = log.exercises.find(e => getSBDType(e.name) === liftType);   // 9266
  const sets = l.exercises.reduce((s, e) => s + (e.sets || 0), 0);        // 15819
  ```
- **Problème** : `loadDB` (app.js:110-270) valide `p.logs`/`p.user` mais **ne normalise
  jamais chaque log** — aucun `if (!log.exercises) log.exercises = []`. Un log sans
  `exercises` (Hevy/merge/corruption) lève `TypeError` dans toute carte qui l'itère.
  Un **seul** point de normalisation dans `loadDB` couvrirait les 94 sites.
- **Devrait** : au chargement, `db.logs.forEach(l => { if (!Array.isArray(l.exercises)) l.exercises = []; })`.
- **Confiance** : certain (absence de normalisation vérifiée ; accès directs).
- **[VOULU?]** : non.

### [P2] Aucun garde-fou d'outlier : un poids aberrant devient PR/ratio réel affiché
- **Où** : `recalcBestPR` (app.js:1759) → `_exoMaxRealWeight` ; ratios (engine.js:2589)
- **Problème** : `donnees_sales` — squat saisi à **315** (315 lbs ≈ 143 kg mal convertis)
  chez bw 80 → `bestPR.squat = 315`, S/B = **3.93**, S/D = **2.21** (validate.js). Aucune
  vérification de plausibilité (> 4× bw, ou saut > +40 % vs historique). La valeur pollue
  records, ratios, e1RM et donc les charges prescrites, sans le moindre signal.
- **Devrait** : détecteur d'outlier NON destructif (flag « valeur inhabituelle, vérifie l'unité »)
  sur les records/ratios affichés.
- **Confiance** : certain (reproduit).
- **[VOULU?]** : possible (le projet évite de rejeter les données user) — mais afficher 3.9 sans broncher est un angle mort.

### [P2] Plafond localStorage : ~1 MB / 560 séances → mur vers ~2700 séances, écriture perdue au quota
- **Où** : `_flushDB` (app.js:364-379) ; mesure : `snapshots/aurel_like.json` = **1 047 450 octets** (562 séances)
- **Problème** : mesuré, `aurel_like` (562 séances) sérialise à **1,00 MB** (~1860 o/séance).
  Projection : 2000 séances ≈ **3,55 MB**, ~2700 séances ≈ 5 MB (quota Chrome courant). Passé
  ce seuil, `_flushDB` lève `QuotaExceededError` : capté (bien) avec un toast, **mais
  l'écriture est perdue** — l'utilisateur continue de s'entraîner et la persistance locale
  s'arrête silencieusement (atténué SI cloud sync en ligne). De plus `JSON.stringify(db)` de
  1→3,5 MB à chaque `saveDB` (debounce 2 s) coûte sur le thread principal.
- **Devrait** : purge/archivage des vieux logs (garder N mois en local, reste au cloud) ou
  compaction ; sinon message clair « historique trop volumineux, active le cloud ».
- **Confiance** : certain (taille mesurée ; comportement quota lu dans `_flushDB`).
- **[VOULU?]** : non anticipé pour un utilisateur pluriannuel.

### [P3] `calcFormScore` re-trie tout l'historique une fois par key-lift (perf)
- **Où** : `app.js:15867-15884` (dans `calcFormScore`, app.js:15780) et `15897`
- **Code** :
  ```js
  keyExos.forEach(exoName => {
    const pts = [];
    const desc = [...db.logs].sort((a, b) => b.timestamp - a.timestamp);   // copie+tri À CHAQUE lift
  ```
- **Problème** : 5 key-lifts × 562 logs → 5 copies + 5 tris identiques par appel (au render).
  Idem `[...db.logs].sort(...)` répété 3× dans le fallback SBD (15897). O(k·n log n) évitable.
  Pas un freeze bloquant à 562, mais gaspillage qui grossit avec l'historique.
- **Devrait** : trier `db.logs` une fois hors de la boucle.
- **Confiance** : certain.

### [P1 — HORS-DOMAINE, signalé] `calcTDEE` : données sales (height/age=0) → 4524 kcal
- **Où** : `engine.js:1184-1190`
- **Problème** : `donnees_sales` (`height:0, age:0`, bw 80) → `height && age` faux → fallback
  `bw × 33 × 1.6 = 4224` + masse (+300) = **4524 kcal** (validate.js). `0` est bien traité
  comme « inconnu » (falsy), mais le fallback `bw×33` surestime — frère du bug « 4035 kcal ».
- **Confiance** : certain (reproduit). **Domaine calculs (audit 01) → juste signalé.**

## Mitigations robustes en place (NE PAS régresser)
- `loadDB` : `try { ... } catch { return defaultDB(); }` (app.js:269) — blob illisible → défaut, jamais de crash au boot.
- `_flushDB` : capture `QuotaExceededError` + toast (app.js:371-378).
- Traps globaux `window.error` + `unhandledrejection` → `logErrorToSupabase` avec filtrage réseau bénin (app.js:390-411).
- SW : `ASSETS_TO_CACHE` inclut chart.min.js, supabase-cdn, tous les js/ + SVG → **offline complet réel** ; Supabase/googleapis/functions jamais cachés ; shell cache-first + stale-while-revalidate offline-safe (service-worker.js:90-140). `cache.addAll` échoue en bloc si un asset 404 (dépendance implicite, assets stables).
- Écritures offline : `db.pendingSync=true` + `_flushDB()` (données NON perdues localement) puis resync sur `online` (app.js:414-430) → **aucune perte de séance hors-ligne** tant que le quota tient.
- Coach IA offline/timeout : callbacks d'erreur propres (cooldown/queue/« Coach indisponible, réessaie demain ») — app.js:28324-28332. Leaderboard garde `navigator.onLine === false` (app.js:7359).
- `wp*Safe` : `wpComputeWorkWeightSafe`/`wpGeneratePowerbuildingDaySafe`/`wpGenerateMuscuDaySafe`/`wpBuildWarmupsSafe` — try/catch + fallback (60 kg / dernière charge / séance vide), guards cold-start v146/v147 présents (app.js:25387-25456).
- `calcStreak` : ignore les logs à timestamp NaN (`droppedLogs`, app.js:4514) ; `getISOWeekKey` renvoie `null` sur date invalide (gardé, 4468).
- `computeStrengthRatiosDetailed` (engine.js:2589) et le builder de carte (app.js:15633-15636, `if(squat&&deadlift)`, `if(row&&bench)`) → **mono-lift masque proprement** les ratios manquants (pas de fausse alerte « danger »).
- `getLogsInRange` filtre `l.timestamp <= Date.now()` → séance future exclue des fenêtres (prouvé par `donnees_sales`).
- TDEE : cap facteur d'activité 1.7 tient à 15 séances/sem (`extreme_haut` → 4543 kcal cohérent pour bw 125 / 18 % gras, pas de dérive type « 4035 »).
- `_computeBadgeStats` (app.js:3930) : **une seule passe** sur `db.logs` (pas d'O(n²)) ; `db.bestPR` garanti par `recalcBestPR()` au boot (`init`, app.js:14783/14802).

## Angles morts de cet audit
- Perf réelle des gros renders (Home 11079, gamification 7227/7569, leaderboard 8269) non
  mesurée en navigateur (DOM requis). Analyse statique : pas d'O(n²) flagrant trouvé côté
  badges (single pass) ; le coût dominant est la sérialisation `saveDB` (1→3,5 MB) et les
  re-tris de `calcFormScore`.
- `calcWeeklyJointStress`/articulaire sur charges extrêmes (`extreme_haut`) : plausibilité des
  chiffres non chiffrée (frontière audit 03/04).
- Dédup par `shortDate` sur densité extrême (plusieurs séances/jour, `extreme_haut`) : non
  vérifié end-to-end (le doublon `donnees_sales` reste compté 2× dans les compteurs bruts —
  à confirmer côté agrégats).
- Encodage cassé (noms mojibake) : `normalize('NFD')` gère les accents ; UTF-8 corrompu non testé.

## Hors-domaine (signalé, non investigué)
- `calcTDEE` fallback 4524 kcal sur height/age=0 → audit 01 (calculs).
- Ratio S/B 3.9 (outlier) non colorié « alerte » → audit 04 (couleur) pour le rendu.
- `calcStreak()` mutant au render → invariante §9 « render pur » (co-traité par audit render/profils) — j'en fais un finding P1 ci-dessus pour l'angle robustesse (non-idempotence).
- `blockStartDate` muté au render (dette connue v230) — non ré-audité.

## À VÉRIFIER CÔTÉ SUPABASE
1. **Logs sans `exercises` / exos sans `name`** — existe-t-il en base des séances où
   `data.exercises` est absent/non-tableau, ou un exercice sans `name` ? (déclenche les crashs P2)
   `select id, user_id from workout_sessions where data->'exercises' is null or jsonb_typeof(data->'exercises') <> 'array' limit 20;`
   et pour les noms : parcourir `data.exercises[]` à la recherche de `name` null/vide.
2. **Taille du plus gros `sbd_profiles.data`** — un utilisateur réel approche-t-il du plafond
   local (~5 MB) ou du poids qui ralentit la sync ?
   `select user_id, pg_column_size(data) as bytes, jsonb_array_length(coalesce(data->'logs','[]'::jsonb)) as logs from sbd_profiles order by bytes desc limit 10;`
3. **Profils « sales » réels** — des users avec `data.user.height=0`/`age=0` (TDEE gonflé) ou
   des poids aberrants (> 4× bw) dans `bestPR`/`workout_sessions.data` ?
4. **Timestamps futurs / doublons `shortDate`** — des `workout_sessions.timestamp > now()` ou
   des paires (`user_id, short_date, title`) dupliquées susceptibles de double-compter ?
5. **Check-ins datés en fuseau** — les `data.readinessHistory[].date` sont-ils cohérents en
   UTC (comme `getTodayStr`), ou certains ont-ils été écrits en date locale (mismatch 00h–02h) ?

STOP. Audit robustesse & cas limites terminé. Rapport : audit/07-robustesse-cas-limites.md. Aucune modification, aucun commit.
