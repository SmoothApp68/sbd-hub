# AUDIT 00 — Inventaire & Références

> Agent 00 (vague 2) · branche `claude/audit-vague2` · SW `trainhub-v350` · READ-ONLY strict.
> Généré le 2026-07-15 ~07:40 UTC. Un seul fichier écrit : `audit/00-inventaire-references.md`.

## Blocages rencontrés

1. **Skill `audit-systematique` finalement DISPONIBLE.** Le prompt affirmait qu'il était absent (« IGNORE l'instruction, signale l'absence »). Vérification faite : il existe à `/home/user/sbd-hub/.claude/skills/audit-systematique/`. Je l'ai **chargé** (format de rapport + taxonomie appliqués). Aucune action requise, mais le prompt était erroné sur ce point.
2. **`npm test` inexécutable ici** : `node_modules/` absent (`jest: not found`). Je n'ai pas installé de dépendances (hors périmètre read-only + réseau). Les vérifs « tests verts » reposent donc sur analyse **statique**. Aurélien : lancer `npm ci && npm test` sur un env avec deps pour confirmer le vert.
3. **Aveugle à Supabase** (voir dernière section).

## Résumé exécutif

52 findings : **2 P1**, **2 P2**, **2 P3**, **46 P4** (dont ~72 fonctions orphelines regroupées). Aucun P0 strict, mais le finding P1 #1 en est proche.
- **LE point critique** : `renderFriendsTab()` (supabase.js:3224) déréférence sans garde `#socialFriendsBadge`, un id qui **n'existe nulle part** dans le DOM → **TypeError à chaque ouverture de l'onglet « 👤 Profil » (amis)**, avant `renderSocialProfileCard()`.
- Le bouton « 📥 Télécharger » de la carte de partage charge **html2canvas depuis un CDN externe** (interdit + bloqué par la CSP) → fonctionnalité morte (P1 #2).
- Côté dette : `program.js` est **à moitié mort** (ses générateurs de mésocycle ne sont jamais appelés, supplantés par `wpGenerate*`), et l'app traîne 4 fichiers orphelins + ~72 fonctions jamais appelées.
- **Bonne nouvelle** : ordre de chargement cohérent (`app.js` dernier, `sentry-init` après `sentry`), cache SW = fichiers réels (aucun manquant/fantôme), assets tous résolus, `CACHE_NAME=trainhub-v350` cohérent, aucune référence de fonction fantôme **non gardée** hors le cas social.

---

## Findings

### [P1] `#socialFriendsBadge` — déréférence nulle non gardée → crash de l'onglet Amis
- **Où** : `js/supabase.js:3224-3230` (dans `renderFriendsTab`, def 3119)
- **Code** :
  ```js
  const badgeEl = document.getElementById('socialFriendsBadge');
  if (pending.length) {
    badgeEl.textContent = pending.length;   // badgeEl === null
    badgeEl.style.display = '';
  } else {
    badgeEl.style.display = 'none';          // null ici aussi
  }
  renderSocialProfileCard();                 // ← jamais atteint
  ```
- **Problème** : la chaîne `socialFriendsBadge` n'apparaît **qu'à cette ligne** dans tout le repo (0 création d'`id`, vérifié). Le HTML statique de l'onglet (`index.html:3236-3264`) contient `pendingRequestsSection`, `pendingRequestsList`, `friendsListCard`, `friendsList` — **pas de badge**. Le garde `if (!pendingSection || !pendingList) return;` (3151) est censé « tous les couvrir » (commentaire l.3153) mais `pendingRequestsSection`/`pendingRequestsList` **existent** (index.html:3263) → le garde passe, puis `badgeEl` est null → **TypeError** dans les deux branches. Hors du seul try/catch (3138-3141, autour du fetch profils). `renderFriendsTab` est async et appelé à l'ouverture du sous-onglet Amis (supabase.js:1354/1369) + après chaque action ami (1877-1975).
- **Conséquence** : la liste d'amis s'affiche (rendue avant l.3224), puis crash → la **carte profil ne se rend jamais** + rejet non catché loggé à chaque fois (télémétrie).
- **Devrait** : garder (`if (badgeEl) {…}`) ou pointer l'`id` réel. Le vrai badge nav est probablement `#socialJeuxBadgeDot` (index.html:3185) ; `updateSocialBadge` (supabase.js:3301, **orphelin**) le visait peut-être.
- **Confiance** : certain (tous éléments vérifiés statiquement).
- **[VOULU?]** : non — id renommé/supprimé, référence restée.

### [P1] `downloadShareCard` charge html2canvas depuis un CDN externe (interdit + bloqué CSP)
- **Où** : `js/app.js:32372-32378`
- **Code** :
  ```js
  if (typeof html2canvas === 'undefined') {
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(script);
    await new Promise(function(res) { script.onload = res; });  // pas d'onerror
  }
  var canvas = await html2canvas(card, { backgroundColor: null, scale: 2, useCORS: true });
  ```
- **Problème** : double violation. (1) Règle projet « **aucun CDN externe — tout bundlé localement** ». (2) La CSP de la page (`index.html:9`, `script-src 'self' 'unsafe-inline'`) **n'autorise pas cdnjs.cloudflare.com** → le script injecté est bloqué. Comme seul `onload` est écouté (jamais `onerror`), la Promise **ne se résout jamais** → `await` bloque indéfiniment (le bouton « 📥 Télécharger » ne fait rien, pas même le toast d'erreur). Wired via `onclick="downloadShareCard()"` (app.js:32359). Casse aussi l'offline.
- **Devrait** : bundler `js/html2canvas.min.js` localement (comme chart.min.js, lazy + SW-cached), ou retirer la fonction.
- **Confiance** : certain (CSP + injection externe + pas d'onerror).
- **[VOULU?]** : non — vestige d'avant le durcissement CSP.

### [P2] `syncSupabase` fantôme dans le pull-to-refresh → pas de sync cloud au tirage
- **Où** : `js/app.js:32662-32663`
- **Code** :
  ```js
  if (typeof refreshUI === 'function') refreshUI();
  if (typeof syncSupabase === 'function') syncSupabase();  // syncSupabase n'existe pas
  ```
- **Problème** : `syncSupabase` n'est **défini nulle part** (le vrai nom est `syncFromCloud`, présent app.js:32699). Gardé par `typeof` → pas de crash, mais le **pull-to-refresh ne déclenche jamais de sync cloud** : il ne fait que re-render local (`refreshUI`). L'utilisateur qui « tire pour rafraîchir » attend un rafraîchissement des données distantes.
- **Devrait** : appeler `syncFromCloud()` (ou le sync réel).
- **Confiance** : certain (fonction inexistante). Impact fonctionnel = domaine sync (croisé).
- **[VOULU?]** : peu probable — geste PTR = attente de sync.

### [P2] `mergeExerciseData` testé mais **0 appelant en prod** — trou de câblage sync possible
- **Où** : `js/engine.js:4993` (def) · testé dans `tests/unit/merge-exercise-data.test.js` (6 réf.)
- **Problème** : la fonction de fusion des données d'exercices (cross-device) est **définie et testée** mais **jamais appelée** par le code chargé (1 seule occurrence dans les 9 fichiers JS chargés = la def). Soit code mort, soit le merge de sync utilise un autre chemin → à confirmer côté agent sync.
- **Devrait** : soit câblée dans le flux de sync (supabase.js), soit supprimée avec son test.
- **Confiance** : certain (0 appelant) ; l'implication sync est **hors-domaine**.
- **[VOULU?]** : possible (helper gardé pour réintégration) → à trancher.

### [P3] `#app-shell` ET `.app-container` obsolètes → l'app n'est pas masquée derrière la waitlist
- **Où** : `js/app.js:32222`
- **Code** :
  ```js
  var app = document.getElementById('app-shell') || document.querySelector('.app-container');
  if (wl) wl.style.display = 'block';
  if (app) app.style.display = 'none';   // app === null → jamais exécuté
  ```
- **Problème** : ni `#app-shell` ni `.app-container` n'existent (vérifié) → `app` toujours null → le contenu de l'app n'est jamais masqué quand la waitlist s'affiche. Gardé (`if (app)`) donc pas de crash.
- **Devrait** : cibler le vrai conteneur racine.
- **Confiance** : certain. **[VOULU?]** : non (ids renommés).

### [P3] CSS orphelin `.wp-day-pill` / `.wp-bloc-controls`
- **Où** : `index.html:567-578`
- **Problème** : ces classes stylent l'UI « weekly plan » (`renderWeeklyPlanUI`) qui est morte (cf. P4 ci-dessous). CSS jamais appliqué.
- **Confiance** : certain. **[VOULU?]** : non (dette).

---

### [P4] UI « weekly plan » morte : `renderWeeklyPlanUI` retourne toujours tôt
- **Où** : `js/app.js:26707` (+ `wpSelectDay:26705`, lecteurs `wpGenerateBtn`/`wpRegenBtn`/`wpMeta`/`wpContent`/`wpBlocSelect` 26709-26713 + app.js:26159)
- **Code** : `if (!genBtn || !content) return; // Elements not in DOM yet`
- **Problème** : les ids `wpGenerateBtn`/`wpContent`/… ne sont **créés nulle part** → la fonction (appelée depuis 18196/26690/26815) **early-return systématiquement**. Sous-système supplanté par `renderProgrammeV2` (onglet Plan v231). `wpSelectDay` n'est référencé que par les `onclick` que ce render mort ne produit jamais.
- **Devrait** : suppression (fonctions + ids + CSS `.wp-*`).
- **Confiance** : certain (ids inexistants + auto-garde). **[VOULU?]** : non.

### [P4] 9 gardes `typeof X === 'function'` vers des fonctions inexistantes (branches mortes)
- **Où / fonction appelée / vrai nom probable** :
  - `js/app.js:7336` `_getFriendLogs` — n'existe pas (branche else morte)
  - `js/app.js:16481` `getMuscleStyle` — n'existe pas → ternaire toujours sur le fallback
  - `js/app.js:32700` `loadFromCloud` — else-if **après** `syncFromCloud` (existe) → fallback mort inoffensif
  - `js/app.js:26955` `purgeVeryOldLogs` — n'existe pas → purge des vieux logs **jamais faite** (croissance stockage)
  - `js/app.js:1651` `renderActiveWorkout` — n'existe pas ; suivi de `showTab('workout')` qui re-render → inoffensif
  - `js/app.js:6805` `showNotification` — else-if **après** `showToast` (existe) → fallback mort inoffensif
  - `js/app.js:24371` `wpGetExerciseMeta` — n'existe pas → `_muscleGroupOf` dégradé (retourne '' si `e.muscleGroup` absent)
  - `js/engine.js:1306` `computeE1RMTrend` — vrai nom `getE1RMTrend(liftType,days)` (engine.js:2619, signature ≠) ; **mais la fonction hôte `checkRecompoProgress` est elle-même orpheline** → moot
  - (`syncSupabase` app.js:32663 → traité en P2)
- **Problème** : `typeof` garde le crash, mais chaque branche « voulue » ne s'exécute jamais. `purgeVeryOldLogs` est la plus notable (dette de stockage).
- **Confiance** : certain (chaque nom = 0 def, vérifié). **[VOULU?]** : non (renommages/suppressions incomplets).

### [P4] `createChallenge` — branche `else` lit des ids `#chal*` inexistants (crash latent, actuellement injoignable)
- **Où** : `js/supabase.js:4389-4393` (dans `createChallenge`, def 4377)
- **Code** : `title = (document.getElementById('chalTitle').value || '').trim();` (+ chalType/chalExercise/chalTarget/chalDuration, `.value` **non gardé**)
- **Problème** : ces ids n'existent nulle part (formulaire manuel retiré). Les **2 seuls appelants** passent `templateData` (`createChallengeFromMetric` app.js:7549, `createChallengeFromTemplate` supabase.js:4434) → la branche `else` est **injoignable**. Mais si un bouton « créer via formulaire » (sans arg) est un jour recâblé → **TypeError immédiate**. `#challengeModalSheet` (4420, gardé) et `#modal-defi` idem inexistants.
- **Devrait** : retirer la branche `else` morte, ou recréer le formulaire.
- **Confiance** : certain. **[VOULU?]** : non (formulaire supprimé, lecteur resté).

### [P4] `createDefiFromModal` orpheline lit `#defi-*`/`#modal-defi` inexistants
- **Où** : `js/supabase.js:2073` (orpheline, 0 appelant) lit `#defi-type`, `#modal-defi`, `#defi-duration` (2076-2089)
- **Problème** : ancien flux de création de défi, entièrement remplacé par `createChallengeFromTemplate`/`FromMetric`. Fonction **et** ids morts.
- **Confiance** : certain. **[VOULU?]** : non (dette).

### [P4] `svgToggleView` + ids anatomie morts (gardés)
- **Où** : `js/app.js:5520` — lit `#anatomyFront`/`#anatomyBack`/`#anatBtnFront`/`#anatBtnBack` (tous gardés `if (front)…`), tous inexistants. Ancien toggle anatomie supplanté par `renderBodyFigure` (5338). `window.svgToggleView` exposé mais le bouton associé n'existe plus.
- **Confiance** : certain. **[VOULU?]** : non.

### [P4] Ids obsolètes gardés (no-op silencieux) — divers
- `#coachTodayContent` (app.js:18992, gardé `if (el)`) → injection incrémentale du coach jamais faite (le rendu principal passe ailleurs).
- `#programViewerCard` (app.js:14507, gardé) → toggle show/hide mort (mais `#programViewer` existe et marche).
- `#dashDaySelector` (app.js:9598, gardé `if (!el) return`) → sélecteur de jour dashboard mort.
- `#ob-mode-continue` (app.js:1955, gardé) → bouton onboarding renommé.
- `#sbdTotalCard` (app.js:8893) : `var card = getElementById(...)` **jamais relu ensuite** → variable morte + id obsolète.
- **Confiance** : certain (ids inexistants). **[VOULU?]** : non (renommages).

### [P4] `program.js` à moitié mort — générateurs de mésocycle jamais appelés (divergence CLAUDE.md §8)
- **Où** : `js/program.js`
- **Morts (0 réf. hors def)** : `epleyE1RM:59`, `brzyckiE1RM:64`, `lombardi1RM:69`, `computeNextLoad:101`, `isFatigued:192`, `generatePLMesocycle:237`, `generatePBSession:267`, `generateMuscuWeek:317`, `calcCompetitionAttempts:355`, `getPeakPhase:365`.
- **Vivants (référencés)** : `recommendSplit`, `getAllSplitsForMode` (← app.js), `getVolumeStatus`, `getLoadFromReadiness`, `computeFatigueScore`, `analyzeMuscleBalance` (← coach.js/app.js), `calcLoadFromPct`.
- **Problème** : la génération de programme réelle passe par `wpGenerate*` (app.js). CLAUDE.md §8 affirme « program.js:61-66 — epleyE1RM ET brzyckiE1RM… **combinées pour la génération de programme** » → **faux**, elles sont mortes. Divergence doc/code.
- **Confiance** : certain (chaque nom = 1 occurrence dans le JS chargé). **[VOULU?]** : partiel — les analyseurs vivants justifient de garder le fichier, mais les générateurs sont à purger.

### [P4] ~72 fonctions orphelines (0 appelant dans les 9 JS chargés + index.html)
Méthode : comptage d'occurrences (dots + chaînes onclick inclus) sur les fichiers **chargés uniquement** ; les `window.X=function` câblés en onclick sont exclus (ex. `openCoachQuestion`, `selectProgramDay`, `goDirectFromHome` = **vivants**, non listés). Recommandation : `grep` de 10 s avant suppression (edge-cases : ajout très récent en attente de câblage, dispatch dynamique par nom).

**engine.js (26)** : `isExerciseInjured:266`, `getInjurySwap:284`, `getEquipmentType:954`, `getCyclePhase:1238`, `getMRV:1251`, `getMEV:1257`, `checkRecompoProgress:1293`, `getLoadIncrement:1339`, `estimateRpeFromIntensity:1345`, `computeWilks:1661` (Wilks supplanté par DOTS), `computeWeeklyActivityScore:1827`, `getCardioForProfile:1920`, `computeDropSets:2248`, `processGrind:2264`, `estimateE1RMFromTransfer:2459`, `findBestTransferSource:2468`, `applyE1RMDecay:2498`, `applyGhostGains:2505`, `countHardSetsInSession:2545`, `getMRVWithCycleAdjust:3311`, `getRestWithCycleAdjust:3320`, `calcMuscleRecoveryDebt:3802`, `calcTRIMPFromGarminZones:4487`, `getPlatesSet:4636`, `detectMomentum:4753` (CLAUDE.md le note orphelin ✓), `getDominantTrainingMode:4872`, `calcStartWeightFromRPE5Test:5173`.
> Note : `getCyclePhase`/`getMRVWithCycleAdjust`/`getRestWithCycleAdjust` = ancien traitement du cycle menstruel par la charge, **volontairement abandonné** (CLAUDE.md §8 : coeff cycle sur le VOLUME via `getCycleCoeff`). **[VOULU]** comme abandon, mais le code mort est resté.

**app.js hors-tests (12)** : `isBadgeActive:4261`, `isBadgeEarned:4319`, `triggerDailyHighlight:7428`, `_normalizeMuscle:9070`, `computeFormScoreComposite:9208`, `parseCSVRow:10363`, `pbGetRecoText:13881`, `_buildSetsFromHistory:20307`, `toggleCoachExo:20320`, `getPivotWeekFrequency:22134`, `getProgressiveCardioDuration:23935`, `showActivityQuickLog:31902`.

**app.js TEST-ONLY (13)** — définies, appelées **seulement** par des tests unitaires, mortes en prod : `getLiftBadgeTier:3886`, `getE1RMDisplay:4712`, `getProgressionScore:7331`, `setGhostMode:7470`, `renderProgramIdentityCard:13592`, `generateWisdomChallenges:21055`, `getCalisthenicCurrentStep:21255`, `validateCalisthenicStep:21261`, `hasPRData:22083`, `getTalkTestInstruction:22086`, `showDataGapBanner:24638`, `getBeginnerRampIncrement:24655`, `startInstinctSession:27815`.

**program.js (10)** : cf. finding dédié ci-dessus.

**import.js (3)** : `shouldGenerateWeekly:11`, `extractWithAI:230`, `buildSessionFromAI:240`.

**supabase.js (6)** : `getMyUserId:1233`, `createDefiFromModal:2073`, `publishGoalActivity:2852`, `updateSocialBadge:3301`, `diagnoseSocial:3436`, `loadFv2LikeCount:4950`.

**engine.js TEST-ONLY (1)** : `mergeExerciseData:4993` (cf. P2).

- **Confiance** : certain sur « 0 référence dans le code chargé » ; l'intention (mort vs point d'entrée futur) reste à trancher au cas par cas.
- **[VOULU?]** : `calcInsolvencyIndex`/`calcWeeklyFatigueCost`/`getSFRForExo`/`SFR_TABLE` (coach.js:329-376) forment une **chaîne inerte gardée volontairement** (CLAUDE.md §backlog) → **[VOULU]**, non recomptés ci-dessus.

### [P4] Fichiers orphelins (présents, jamais chargés)
- `js/supabase.min.js` (154 KB) — **ancien bundle minifié de la glue supabase** (contient `callAnthropicProxy`, `cloudSignIn`… + `SUPABASE_KEY` publishable), supplanté par `js/supabase.js` non minifié. 0 réf. (index.html, SW, source). CLAUDE.md le note (mais le décrit comme « SDK » — c'est en fait la glue).
- `js/babel.config.js` (118 B), `js/jest.config.js` (318 B), `js/jest.setup.js` (89 B) — **doublons** des configs racine ; babel/jest lisent la racine (CWD), pas `js/`. 0 réf.
- `audit.js`, `audit-diag.js`, `audit-debug2.js` (racine) — harnais de dev, non chargés.
- **Confiance** : certain. **[VOULU?]** : non (cleanup).

### [P4] Specs Playwright obsolètes (hors gate `npm test`)
- **Où** : `tests/*.spec.js` (51 fichiers, dont **29 `audit-*.spec.js`** versionnés v154→v230) + `audit/*.spec.js`/`*.js` (~30) + `tests/playwright/` (doublons de `superset`/`training`).
- **Problème** : `jest.config.js testMatch = tests/**/*.test.js` → les `.spec.js` **ne sont pas** dans le gate `npm test` (Playwright, serveur live requis). Markup ancien (versions figées). Aucune ne référence les chemins morts que j'ai trouvés (vérifié : `renderWeeklyPlanUI`/`createDefiFromModal`/`socialFriendsBadge`/`anatomyFront` absents des specs) — elles sont juste périmées. Aucun test unitaire (`.test.js`) ne référence une fonction fantôme confirmée (vérifié → le gate jest n'est pas cassé par ces findings).
- **Confiance** : certain (config + grep). **[VOULU?]** : non (artefacts historiques).

### [P4] Commentaire mort `buildUserAccessoryPool`
- **Où** : `js/app.js:11287` — « Alimente `buildUserAccessoryPool()` dès… » : la fonction **n'existe pas** (CLAUDE.md §14 la liste « N'existe PAS »). Commentaire trompeur uniquement (pas d'appel).
- **Confiance** : certain. **[VOULU?]** : non.

---

## Vérifs positives (RAS — pour référence)

- **Ordre de chargement** (index.html) : `supabase-cdn.min.js → sentry.min.js → sentry-init.js` (head, defer) puis `engine → exercises → supabase → import → program → joints → coach → **app** (dernier)` (body, defer). `sentry-init` après `sentry.min.js` ✓. `app.js` dernier ✓. Tous `defer` (exécution ordonnée). Aucun usage top-level avant définition détecté.
- **Aucun `<script>`/`<link>` cassé** dans index.html (tous les `src`/`href` pointent vers des fichiers réels).
- **Aucun CDN externe** en statique. Seule injection externe = html2canvas (P1 #2). CSP présente et stricte (`script-src 'self' 'unsafe-inline'`).
- **Service Worker** : `CACHE_NAME='trainhub-v350'` (cohérent CLAUDE.md ; skill doc dit v349 = doc périmée). Les 22 entrées de `ASSETS_TO_CACHE` = **fichiers réels** (aucun manquant, aucun fantôme). `chart.min.js` caché car **lazy-load** légitime (`ensureChartLoaded` app.js:433/442) — pas orphelin. Plus aucun littéral `SW_VERSION` (uniquement des commentaires) ; version dérivée via `getSWVersion` (app.js:3597) ✓.
- **Assets** : 4 SVG corps (`assets/body-*.svg`) résolus via `renderBodyFigure` (path construit app.js:5344) + SW-cachés ; 2 icônes PNG référencées (manifest + index.html:25) + cachées. **Aucun asset manquant, aucun asset non référencé.**
- **manifest.json** : icônes présentes, `start_url`/`scope` = `/sbd-hub/` cohérents.

---

## TABLEAU D'INVENTAIRE (carte de référence)

| Fichier | Lignes | Rôle | Chargé par | Statut |
|---|---|---|---|---|
| `index.html` | ~3500 | Shell app, **tout le CSS inline**, DOM statique | — (entrée) | ✅ actif |
| `service-worker.js` | 156 | SW offline, cache `trainhub-v350` | index.html:3467 | ✅ actif |
| `manifest.json` | 44 | Manifest PWA | index.html:19 | ✅ actif |
| `js/supabase-cdn.min.js` | 1 (195 KB) | **SDK Supabase** (createClient) | head:27 · SW | ✅ actif |
| `js/sentry.min.js` | 16 (72 KB) | SDK Sentry | head:30 · SW | ✅ actif |
| `js/sentry-init.js` | 88 | Init Sentry | head:31 · SW | ✅ actif |
| `js/engine.js` | 5867 | Calculs purs, TRIMP, DOTS, ratios | body:3422 · SW | ✅ actif (≥26 fn mortes) |
| `js/exercises.js` | 1181 (461 KB) | Base d'exercices | body:3423 · SW | ✅ actif |
| `js/supabase.js` | 5698 | Glue Supabase, social, sync | body:3424 · SW | ✅ actif (6 fn mortes) |
| `js/import.js` | 1788 | Import/parse séances | body:3425 · SW | ✅ actif (3 fn mortes) |
| `js/program.js` | 375 | Génération programme | body:3426 · SW | ⚠️ **à moitié mort** (10/17 fn mortes) |
| `js/joints.js` | 424 | Stress articulaire | body:3427 · SW | ✅ actif |
| `js/coach.js` | 849 | Arbitre intensité, `computeSRS` | body:3428 · SW | ✅ actif (chaîne SFR inerte [VOULU]) |
| `js/app.js` | 32745 | App principale (**dernier**) | body:3429 · SW | ✅ actif (~25 fn mortes) |
| `js/chart.min.js` | 14 (205 KB) | Chart.js | **lazy** app.js:442 · SW | ✅ actif (lazy) |
| `js/supabase.min.js` | 1 (154 KB) | Ancienne glue minifiée | — | 🔴 **ORPHELIN** |
| `js/babel.config.js` | 5 | Config babel (doublon) | — | 🔴 **ORPHELIN** |
| `js/jest.config.js` | 11 | Config jest (doublon) | — | 🔴 **ORPHELIN** |
| `js/jest.setup.js` | 1 | Setup jest (doublon) | — | 🔴 **ORPHELIN** |
| `assets/body-front.svg` +3 | — | Figures corps (H/F, av/ar) | app.js:5344 · SW | ✅ actif |
| `icons/icon-192.png`, `icon-512.png` | — | Icônes PWA | manifest · index.html:25 · SW | ✅ actif |
| `babel.config.js`, `jest.config.js`, `jest.setup.js`, `playwright.config.js` (racine) | — | Tooling test/build | npm/jest/playwright | ✅ actif (build) |
| `audit.js`, `audit-diag.js`, `audit-debug2.js` (racine) | — | Harnais dev | — | 🟠 orphelin dev |
| `tests/unit/*.test.js` (36) | — | Suite jest (gate `npm test`) | jest | ✅ actif |
| `tests/*.spec.js` (51, dont 29 `audit-*`) | — | Playwright (hors gate jest) | playwright | 🟠 majorité périmés |
| `supabase/functions/{coach-ai,anthropic-proxy}/index.ts` | — | Edge Functions (backend) | déploiement Supabase | ✅ actif (hors repo runtime) |
| `*.sql` (racine) | — | Migrations DB | — | 🟠 backend (manuel) |
| `audit/*.md`, `*.md` racine | — | Rapports/docs | — | 📄 doc |

---

## Angles morts de cet audit

- **`npm test` non exécuté** (deps absentes) : je n'ai pas prouvé le vert du gate jest, seulement qu'aucun `.test.js` ne référence une fonction fantôme confirmée. À relancer avec deps.
- **Détection de fonctions** par regex + blanking de chaînes/commentaires : robuste mais non-AST. Faux positifs possibles pour du **dispatch dynamique** (`window[varName]()`, tables de fonctions construites par chaîne) — non détecté. Les orphelins listés valent « 0 référence textuelle » ; un dispatch dynamique par nom construit échapperait.
- **CSS** : je n'ai signalé que le CSS `.wp-*` orphelin (croisé via le finding UI morte). **Pas d'inventaire CSS exhaustif** (sélecteurs morts, classes jamais appliquées) — index.html fait 312 KB de style inline. Hors périmètre temps.
- **Contenu des Edge Functions** (`coach-ai`, `anthropic-proxy`) non audité (backend Deno, hors repo runtime).
- **Fixtures** : la branche `claude/agent09-profils-fixtures` (fixtures profils) n'est pas dans mon arbre — non vérifiée.

## Hors-domaine (signalé, non investigué)

- **Sync** : `syncSupabase` (PTR ne sync pas, P2) et `mergeExerciseData` (testé, 0 appelant prod, P2) touchent la correction du flux de sync — à trancher par l'agent sync.
- **Social/UX** : l'impact utilisateur complet du crash `renderFriendsTab` (P1 #1) — carte profil manquante, spam télémétrie — relève de l'agent social.
- **Algo** : `checkRecompoProgress` (orpheline) contient un fallback e1RM qui lit `db.exercises['Bench Press'].history` — clés/forme **non conformes** au schéma réel (`'Squat (Barre)'`, `{e1rm,zones}`) ; sans effet car fonction morte, mais symptomatique. Agent algo.
- **coach.js** chaîne `calcInsolvencyIndex`/`SFR_TABLE` inerte : confirmée [VOULU], mentionnée pour l'agent coach.

## À VÉRIFIER CÔTÉ SUPABASE

1. **`ai_rate_limits`** : table mentionnée côté data mais **0 référence** dans le JS du repo (probablement dans l'edge-function `coach-ai`). Requête : lister les tables réellement existantes et croiser avec la liste CLAUDE.md §11. `select table_name from information_schema.tables where table_schema='public';`
2. **`social_challenges`** : `createChallenge` insère `type`, `target_value`, `target_exercise`, `start_date`, `end_date` (supabase.js:4401-4409). Confirmer que ces **colonnes existent** et que `type` accepte les valeurs du picker (`createChallengeFromMetric`). `select column_name,data_type from information_schema.columns where table_name='social_challenges';`
3. **`public_profiles`** : `renderFriendsTab` lit `id, username, training_status, training_...` (supabase.js:3139). Confirmer les colonnes (le crash badge est indépendant, mais valider le fetch profils).
4. Aucune de mes vérifs « fichier/référence » ne dépend de données utilisateur — le reste est prouvé statiquement.

---

STOP. Audit Inventaire & Références terminé. Rapport : `audit/00-inventaire-references.md`. Aucune modification, aucun commit.
