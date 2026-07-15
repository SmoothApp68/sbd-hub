# AUDIT 10 — Exécution locale réelle

> Agent 10 : le seul agent qui FAIT TOURNER l'app (Playwright + Chromium headless, viewport Android 412×915)
> et OBSERVE à l'écran ce que les 9 autres ont déduit statiquement.
> Branche `claude/agent09-profils-fixtures`, SW **v350**. Généré le mercredi 15 juillet 2026.
> Réseau **entièrement stubbé** (tout trafic non-localhost aborté et loggé). Aucun accès Supabase.

---

## Blocages rencontrés

**Aucun bloquant.** L'app boote et tourne en local (Playwright + Chromium `/opt/pw-browsers/chromium-1194`, viewport 412×915), réseau entièrement stubbé. Les 9 profils chargent via le vrai boot. Deux limites (non-bloquantes, documentées) : (1) `window.db` inaccessible (`let` non exposé au `window`) → j'observe via `localStorage` + appels de fonctions globales ; (2) mesures de perf sur **matériel serveur** (≫ Android cible) et **synchrones** (Chart.js async non capté) → verdict A7 prudent. Écriture repo : **uniquement** `audit/10-execution.md` + `audit/screenshots/`.

---

## Résumé exécutif

11 scripts Playwright, 9 profils, ~90 renders observés. **Confirmé à l'écran** : A4 (starvation 939 kcal côté Corps vs 1706 côté Coach, **même carte** — P1), A5 (deload + « vise un PR » **simultanés** sur le Coach d'aurel — P0), A6 (render **non pur** : l'onglet **Jeux écrit le db + la clé orpheline RGPD `SBD_HUB` de 962 KB** ; Coach écrit un rapport le lundi ; freeze consommé au render — P0), A2 (« IPF GL » **ignore le poids** — preuve numérique), A3 (crash `socialFriendsBadge` — latent, users **connectés**, Social≠Profil), A9 (23% des warm-ups comptés en séries). **Infirmé/nuancé** : A1 (fuite e1RM dans une carte **masquée** — dette morte, pas P0), A7 (aucun freeze reproduit ≤82ms — mais caveat device), A8 (récence ignorée en interne mais **pas** de faux « objectif atteint » visible). **Exploration** : `mono_lift` déclenche de **fausses alertes 🚨 danger** sur des lifts jamais faits ; `donnees_sales` affiche **« SQUAT 315kg »** et un S/B 3.93 « ✓ optimal » ; `vierge` **ne peut pas s'onboarder offline**. **Robustesse remarquable** : 0 crash, 0 token cassé sur 9×10 renders (sauf « Glucides undefined » sur aurel). **Aucun trafic réseau externe n'a abouti** (Supabase auth+leaderboard abortés à chaque boot).

**LE point** : l'onglet **Jeux réécrit la clé orpheline `SBD_HUB`** à l'ouverture → le P0 RGPD « résurrection post-suppression » (§11) se déclenche **au simple render**, prouvé à l'écran.

---

## A. TABLEAU DE VÉRIFICATION (les 9 findings statiques)

| # | Finding des audits statiques | Agent source | Verdict | Ce que je vois à l'écran |
|---|---|---|---|---|
| A1 | Fuite e1RM dans `renderPerfCard` (app.js:9410) | 04/05/09 | **INFIRMÉ** (code mort visuel) | `#perfCard`/`#perfDisplay` **display:none** sur les 3 profils, jamais ré-affiché (masqué depuis v264). La fuite e1RM existe dans le code mais **n'est jamais rendue à l'écran**. Le vrai Records (dash) montre bien PR réel gros + « e1RM estimé » petit. |
| A2 | `calcIPFGL` cassé → tout le monde « Débutant » (app.js:15355) | 01 | **NUANCÉ** | Le bw est **100 % ignoré** (preuve : `calcIPFGL(455, bw)`=220.83 pour bw∈[40..150]). Mais le libellé **varie par total brut** : aurel 220→Débutant, extreme_haut 407→**Avancé**, extreme_bas 50→Débutant. Donc « tout le monde Débutant » = faux ; le vrai bug = « IPF GL » = `total×0.4853` sans normalisation poids. |
| A3 | Crash onglet Profil `#socialFriendsBadge` (supabase.js:3224) | 00 | **CONFIRMÉ (latent) / mal localisé** | `#socialFriendsBadge` **absent du DOM**. `renderFriendsTab` (Social>Amis, **pas** Profil) déréférence `badgeEl.style`/`.textContent` sur null. Flux offline **protégé** par le guard auth (l.3121). Stub d'un uid authentifié → **`THREW: Cannot read properties of null (reading 'style')`**. Frappe donc les users **connectés** sur Social>Amis. |
| A4 | Cible calorique aberrante profil léger (engine.js:1355) | 06 | **CONFIRMÉ (pire)** | extreme_bas (40kg♀) : anneau **« Objectif: 939 kcal »** À CÔTÉ de **« TDEE estimé: 1706 kcal »** sur la MÊME carte (capture). Coach: 1706. aurel: anneau 2300 vs TDEE/Coach 2672. 60kg♀ → 1408 (formule confirmée). |
| A5 | Contradiction Décharge + Fenêtre optimale (engine.js:2964) | 02/03 | **CONFIRMÉ (aurel, sans dérivation)** | Coach aurel affiche EN MÊME TEMPS : « 🔋 Décharge pour mieux exploser / ✅ Je décharge cette semaine » (arbitre, 19 sem. consécutives) ET « ✅ Fenêtre optimale — Ratio 1.27 — moment idéal pour **viser un PR ou pousser** » (Diagnostic). Capture `coach-aurel_like.png`. |
| A6 | Render pur — 3 écritures suspectées | 02/07 | **CONFIRMÉ (2/3)** | **Jeux** (tab-game) : render écrit `db` (xpHighWaterMark 0→81248, monthlyChallenges, secretQuests, seenBadges) **ET écrit la clé orphelin `SBD_HUB` (962 KB = P0 RGPD)**. **Coach le lundi** : écrit `db.reports[0]` (rapport hebdo, +1061o). **blockStartDate** : non déclenché sur aurel (déjà posé). dash/social/séances/stats/profil = **purs**. `calcStreak()` sans readOnly à 11 sites. |
| A7 | Freezes chiffrés par onglet | 07 | **INFIRMÉ (sur ce matériel)** | Aucun onglet > 100ms même à 562 séances. Pires : Jeux 82ms, Coach 61ms, Profil 40ms. debutant : 1-14ms. Scaling ~6-10× mais absolu faible. **Caveat** : serveur ≫ Android cible ; temps de dessin Chart.js (async) non capturé. |
| A8 | `predictPR` sans récence — faux « objectif atteint » | 07 | **NUANCÉ (latent, non visible)** | `predictPR(deadlift)` retour_apres_pause = `reachable:true, currentE1RM 195` (valeur pré-pause périmée, 6 mois off) → **récence ignorée** confirmée en interne. Mais **aucun** « objectif atteint » affiché (scan dash/coach/stats vide) : la reco montre « définis un objectif » (cibles absentes). `date:"Invalid Date"`/`weeks:null` **non affichés** (gardés quand pas de cible). |
| A9 | Warm-ups comptés en volume (app.js:31776) | 05 | **CONFIRMÉ (compteurs de séries, PAS le tonnage)** | Fixture aurel : **834/4418 warm-ups (23.3%) comptés comme séries de travail** par les filtres `!s.isWarmup` seuls (engine.js:2044 Ischios/Quads, 2882 Push/Pull). Distord les alertes visibles « Push/Pull 2.61 ⚠️ » et « Ischios/Quads 0.43 ». Le **tonnage** (session.volume, series-based) n'est **pas** gonflé. |

---

## B. MATRICE PROFIL × ONGLET

Légende : ✅ OK · ⚠️ anomalie · 🔴 cassé. **Aucun crash (pageError=0) ni token cassé sur 9 profils × 10 onglets**, sauf mention. Réseau : 2 URLs externes **abortées** par profil (Supabase `auth/signup` + `leaderboard_entries`), **0 aboutit**.

| Profil \ Onglet | Maison | Social | Coach | Plan | Log | Analyse | Stats | Jeux | Profil | Corps |
|---|---|---|---|---|---|---|---|---|---|---|
| aurel_like (562) | ✅ | ✅ | ⚠️A5 | ✅ | ✅ | ✅ | ✅ | ⚠️A6 | ✅ | ⚠️A2/A4/undef |
| debutant (3) | ✅ | ✅ | ⚠️Fen.opt | ✅ | ✅ | ✅ | ✅ | ⚠️A6 | ✅ | ⚠️A2/A4 |
| retour_apres_pause (53) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️A6 | ✅ | ⚠️A2/A4 |
| mono_lift (15) | ⚠️0kg | ✅ | 🔴faux danger | ✅ | ✅ | ✅ | ✅ | ⚠️A6 | ✅ | ⚠️A2/A4 |
| donnees_sales (7) | ⚠️315kg | ✅ | 🔴3.93=optimal | ✅ | ✅ | ✅ | ✅ | ⚠️A6 | ✅ | ⚠️A2/A4 |
| extreme_bas (40kg♀) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️A6 | 🔴939kcal | 
| extreme_haut (76) | ✅ | ✅ | ⚠? | ✅ | ✅ | ✅ | ✅ | ⚠️A6 | ✅ | ⚠️A2(Avancé)/A4 |
| progression_nette (18) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️A6 | ✅ | ⚠️A2/A4 |
| vierge (0) | ⚠️onboarding absent (offline) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Temps de rendu synchrone (aurel_like, médiane/3)** : Maison **3ms** · Social **2ms** · Coach **61ms** · Plan **1ms** · Log **7ms** · Analyse **2ms** · Stats **1ms** · Jeux **82ms** · Profil **40ms** · Corps **40ms**. (Caveats A7 : matériel serveur, Chart.js async non capté.)

---

## Findings détaillés

### [P3] A8 — `predictPR` ignore la récence (lift dormant « reachable » sur e1RM périmé) — latent, non affiché · confiance : **probable**
- **Observé** : `predictPR('deadlift')` sur `retour_apres_pause` (historique riche + 6 mois d'arrêt + 2 séances) = `{reachable:true, currentE1RM:195, weeklyGain:"0.08", weeks:null, date:"Invalid Date", confidence:12}`. Le 195 est l'e1RM **d'avant la pause** — la fonction ne pondère pas la récence.
- **Mais non visible** : scan « objectif atteint » sur dash/coach/stats = **vide** ; la reco affiche « Deadlift : 200kg — définis un objectif » (cibles absentes → chemin projection non emprunté). `Invalid Date`/`weeks:null` **gardés** de l'affichage (aucun token cassé détecté à l'écran).
- **Conclusion** : le faux « objectif atteint » **n'est pas reproduit** avec ces fixtures (aucune cible < e1RM périmé). Risque **latent** : si l'utilisateur avait défini une cible sous l'e1RM stale, la projection s'appuierait sur des points pré-pause. À recalibrer côté `predictPR` (fenêtre de récence).

### [P2] A7 — Perf des renders : aucun freeze reproduit (≤82ms à 562 séances) sur ce matériel · confiance : **probable**
- **Mesuré** (médiane de 3 renders synchrones, aurel_like 562 séances vs debutant 3) :

| Onglet | aurel_like | debutant | ratio |
|---|---|---|---|
| Jeux | 82ms | 14ms | 5.9× |
| Coach | 61ms | 6ms | 10× |
| Profil (Corps) | 40ms | 7ms | 5.7× |
| Log | 7ms | 4ms | — |
| dash/social/plan/stats/analyse | 1-3ms | 1-2ms | — |

- **Conclusion** : **aucun** onglet > 100ms, donc **aucun freeze > 1s/3s reproduit**. Les cas connus (Home/gamification/leaderboard) scalent bien avec la donnée (~6-10×) mais restent sous 100ms **ici**.
- **Caveats forts** : (1) matériel serveur ≫ Android milieu de gamme (cible projet) — un 82ms serveur peut valoir plusieurs centaines de ms sur device ; (2) mesure **synchrone** uniquement — le dessin **Chart.js** (async via `ensureChartLoaded`) n'est **pas** capté (Stats à 1ms est donc sous-estimé) ; (3) renders **chauds** (médiane de 3). Verdict prudent : freezes **non prouvés**, mais **non exclus** sur device réel.

### [P0] A5 — Coach : verdict « Décharge cette semaine » (arbitre) ET « Fenêtre optimale — vise un PR » (Diagnostic) sur le même écran · confiance : **certain**
- **Où** : les deux voix sont rendues dans `renderCoachTodayHTML` (app.js:19364) : arbitre `computeIntensityVerdict(collectIntensityContext())` (app.js:19467-19468) + Diagnostic `analyzeAthleteProfile()` (engine.js:2784), alerte « Fenêtre optimale » à engine.js:2964 (`acwr` dans zone verte).
- **Observé (aurel_like, onglet Coach, capture `coach-aurel_like.png`)** — simultanément :
  - LE POINT DU JOUR : « 🔋 **Décharge pour mieux exploser.** 19 semaines d'entraînement consécutives. Deload préventif recommandé même si tu te sens bien. » + carte « Semaine de décharge » + bouton « ✅ Je décharge cette semaine ».
  - FATIGUE & VOLUME : « ✅ **Fenêtre optimale** — Ratio de charge 1.27. Charge équilibrée — c'est le moment idéal pour **viser un PR ou pousser un peu.** »
- **Problème** : contradiction frontale (deload préventif ⇄ « vise un PR »). Viole l'invariante « arbitre = SEULE voix du verdict d'intensité » (§9) : le Diagnostic prescrit une intensification hors arbitre. Les deux systèmes sont indépendants (arbitre = budget de blocs/19 sem. ; Diagnostic = ACWR zone verte), d'où la coexistence.
- **Devrait** : quand l'arbitre décide deload, le Diagnostic ne doit pas afficher « Fenêtre optimale / vise un PR » (le suivre ou se taire). Aussi observé dans la MÊME section : « ✅ Fenêtre optimale » à côté de « 🔴 Pic de charge — hams +100% — le risque de blessure grimpe » (auto-contradiction interne au Diagnostic).
- **Bonus (n'a pas eu besoin de dériver)** : reproduit directement sur aurel_like tel quel.

### [P0] A6 — Render NON PUR : l'onglet Jeux écrit `db` + réécrit la clé orpheline `SBD_HUB` (RGPD) au render ; le Coach écrit un rapport hebdo le lundi · confiance : **certain**
- **Méthode** : contexte frais par onglet, seed → boot settle (4s) → snapshot `SBD_HUB_V29` **et** `SBD_HUB` → navigation onglet → attente 3s (flush des saveDB debouncés) → re-snapshot → diff.
- **Observé** (aurel_like) :

| Onglet | `SBD_HUB_V29` muté | clé orpheline `SBD_HUB` écrite |
|---|---|---|
| dash / social / séances(×4) / stats / profil-corps / profil-stats | **non (pur)** | non |
| **Jeux (tab-game)** | **OUI** | **OUI — 962 106 octets (db complet)** |
| **Coach le lundi** | **OUI** (`db.reports[0]` rapport hebdo) | (via saveDB) |

- **Code (Jeux)** : `getTotalXP` (app.js ~4340) → `if (xp > hwm) { db.gamification.xpHighWaterMark = xp; localStorage.setItem('SBD_HUB', JSON.stringify(db)); }` (app.js:4384-4387). Écrit le **db entier** sous **`SBD_HUB`** (sans `_V29`) au render → c'est **exactement** le P0 RGPD « résurrection post-suppression » de CLAUDE.md §11 (relue via `FALLBACK_KEYS`). Ici **prouvé qu'il se déclenche à l'ouverture de l'onglet Jeux**, pas seulement au gain d'XP.
- **Code (Coach lundi)** : `renderCoachTab` (app.js:18475) `if (new Date().getDay() === 1) generateWeeklyReport();` → écrit `db.reports` + `db.updatedAt`. Reproduit en forçant `Date`→lundi 13/07 : `getDay()===1`, `db.reports.0` créé (rapport hebdo complet), `db.updatedAt` réécrit.
- **Problème** : viole l'invariante « Render pur » (§3/§9) : `db` **différent après render**. Effets de bord : `syncToCloud` déclenchable, orphelin RGPD réécrit. Deux renders ≠ identiques.
- **Devrait** : gamification en lecture pure (readOnly comme `calcStreak(true)` l.18915) ; `generateWeeklyReport` déplacé hors render (ex. au boot/fin de séance) ; supprimer le `setItem('SBD_HUB', …)`.
- **Nuance** : le render dash lui-même est **pur** (test « render dash ×2 » : aucun changement). `blockStartDate` (wpDetectPhase app.js:23461, `saveDB`) **n'a pas** fauté sur aurel (blockStartDate déjà cohérent) — write conditionnel, à re-tester sur un profil sans `currentBlock.blockStartDate`.

### [P1] A9 — Warm-ups GO (`setType:'warmup'`) comptés comme séries de travail dans les ratios Diagnostic · confiance : **certain**
- **Où** : lecteurs `engine.js:2044` (quad/ham sets → Ischios/Quads) et `engine.js:2882` (push/pull sets) filtrent `!s.isWarmup` seul, sans `setType==='warmup'`.
- **Preuve chiffrée (fixture aurel_like)** : sur 4713 `allSets`, le filtre buggy compte **4418** séries de travail vs **3584** corrects → **834 warm-ups (23.3%) comptés à tort** (295 legacy `isWarmup:true` correctement exclus, mais 834 `setType:'warmup'` sans `isWarmup` inclus).
- **Impact visible (Coach aurel, capture)** : « Tu pousses plus que tu ne tires : Push/Pull = **2.61** » (bench a bcp de warm-ups → push gonflé → fausse alarme « trop de push ») et « Ischios/Quads faible (**0.43** < 0.75) ». Ratios calculés sur des compteurs pollués à ~+23%.
- **Devrait** : helper unique `isWorkSet(s) = !(s.isWarmup===true || s.setType==='warmup' || s.isBackOff)` partout (déjà la logique canonique engine.js:2577/3925).
- **Nuance** : `session.volume`/tonnage (finalizeSessionFromSeries, import.js:172, basé sur `series` pré-filtré) **n'est PAS** affecté. Seuls les compteurs sur `allSets` le sont.

### [P1] A4 — `calcCalorieCible` : anneau nutrition Corps hardcodé sur aurel, starvation pour profils légers + contradiction sur la même carte · confiance : **certain**
- **Où** : `engine.js:1355` (`calcCalorieCible`) rendu dans `renderCorpsTab` (`app.js:16142`, id `nutriCible`/`nutriKcalSub`), à côté de `nutriTDEELabel` (`baseTdee=calcTDEE`, app.js:16120).
- **Observé à l'écran** (OBSERVATION, pas déduction) :

| Profil | Anneau « Objectif » (calcCalorieCible) | « TDEE estimé » même carte (calcTDEE) | Coach (getDailyCaloricTarget) |
|---|---|---|---|
| aurel_like (98kg) | **2300** | 2672 | 2672 |
| extreme_bas (40kg ♀) | **939** ⚠️ | 1706 | 1706 |
| extreme_haut (125kg) | 2934 | 4543 | 4543 |
| (60kg ♀ dérivé, formule) | **1408** | — | — |

- **Problème** : `calcCalorieCible = kcalBase(2300) × bw/bwBase(98)`, les défauts sont **les constantes d'aurel** ; ça scale linéairement avec le poids (faux physiologiquement). Pour une athlète de 40kg l'anneau prescrit **939 kcal** (famine), contredit par le « TDEE estimé: 1706 » affiché 3 cm plus bas ET par la carte Coach (1706). Même aurel voit 2300 (anneau) vs 2672 (son propre TDEE + Coach) : divergence 372 kcal.
- **Devrait** : l'anneau Corps doit utiliser la même source que le Coach (`getDailyCaloricTarget`/`calcTDEE`), pas `calcCalorieCible`. Capture : `audit/screenshots/corps-nutri-extreme_bas.png`.
- **Note** : « 891 BRÛLÉES » ≈ 939 objectif → net ~48 kcal (absurde) sur la même carte.

### [P1] A3 — `renderFriendsTab` crash sur `#socialFriendsBadge` null (users connectés, onglet Social>Amis) · confiance : **certain**
- **Où** : `supabase.js:3224-3229` (`renderFriendsTab`). L'id `socialFriendsBadge` **n'existe dans aucun fichier** (grep : seule référence = ce `getElementById`).
- **Code** :
  ```js
  const badgeEl = document.getElementById('socialFriendsBadge'); // → null
  if (pending.length) { badgeEl.textContent = pending.length; ... }  // throw
  else { badgeEl.style.display = 'none'; }                          // throw
  ```
- **Observé** : DOM runtime → `socialFriendsBadge:false` (absent), `pendingRequestsSection/List` présents. Flux offline normal (Social→Amis) : **0 pageerror** (guard `if(!uid||!supaClient)return` l.3121 bloque avant, car pas de session offline). En stubbant un uid authentifié + `loadFriends:[]` puis appel de `renderFriendsTab` → **`THREW: Cannot read properties of null (reading 'style')`**.
- **Problème** : les **deux** branches (pending>0 et =0) déréférencent `badgeEl` null → tout utilisateur **connecté** qui ouvre Social>Amis lève une TypeError (async → unhandled rejection). Le render s'interrompt : la section pending est peinte mais le badge + `renderSocialProfileCard` final (l.3233) ne s'exécutent pas → onglet partiellement rendu.
- **Devrait** : garder `if (badgeEl) { … }` (comme le guard `pendingSection/pendingList` juste au-dessus l.3150 qui, lui, existe). Ajouter `#socialFriendsBadge` au HTML ou retirer le bloc.
- **Correction de localisation vs audit 00** : c'est **Social>Amis** (`renderFriendsTab`), **pas** l'onglet Profil. L'onglet Profil appelle `renderSocialProfileCard` (sûr) via `renderCorpsTab` (app.js:16110) — pas de crash observé sur Profil.

### [P2] A2 — « IPF GL Points » ignore totalement le poids de corps (exp underflow) · confiance : **certain**
- **Où** : `app.js:15355` `calcIPFGL`, affiché `renderCorpsTab` app.js:16168 (`metricIPF`/`metricIPFsub`).
- **Code** :
  ```js
  const a=1236.25115,b=1449.21864,c=0.01644,d=2.12345;
  const denom = a - b * Math.exp(-c * Math.pow(bw, d));  // bw^2.12 → exp underflow
  ```
- **Preuve numérique** : `b·exp(-c·bw^2.12)` = 1.4e-15 (bw=40) … 2.5e-118 (bw=98) → **denom ≡ 1236.25 pour tout bw réaliste** → `calcIPFGL = total × 0.4853` indépendant du poids. `calcIPFGL(455,40)==calcIPFGL(455,150)==220.83`.
- **Observé** : aurel (total 455)→220.83 « Débutant » ; extreme_haut (total 840)→407.68 « **Avancé** » ; extreme_bas (40kg, total 104)→50.48 « Débutant ».
- **Problème** : la formule IPF GL doit **fortement** dépendre du poids (un athlète de 40kg à 2.6× son PdC de total est élite-relatif, ici classé « Débutant » identiquement à un 150kg au même total). Le label « IPF GL Points » est un mensonge : c'est `total×0.4853`. La carte « ratio » adjacente (`ipf/bw`) hérite de la pollution.
- **Devrait** : exposant `d` erroné — la vraie formule IPF GL est `100/(A−B·e^(−C·bw))` (bw **linéaire** dans l'exp). Le `Math.pow(bw, 2.12345)` casse la normalisation.
- **NUANCE vs audit 01** : « tout le monde Débutant » = **faux** (varie par total : Débutant/Avancé/Élite). Le vrai défaut = « bw ignoré ».

### [P4] A1 — Fuite e1RM `renderPerfCard` : code réel mais rendu dans une carte **masquée en permanence** (mort visuel) · confiance : **certain**
- **Où** : `renderPerfCard` (app.js:9321) écrit dans `#perfDisplay`, enfant de `#perfCard` (index.html:2445, dans `tab-dash`).
- **Observé** : sur aurel/extreme_haut/extreme_bas, `getComputedStyle(#perfCard).display === 'none'`, `offsetParent === null`. `renderDash` force `perfCard.style.display='none'` (app.js:8852-8854) et **aucun** code ne le ré-affiche (`grep` exhaustif : 0 site `perfCard...display=''`). Carte remplacée par la composition 4 zones en v264 (commentaire app.js:8850).
- **Problème** : le bug de fuite e1RM (gros chiffre `kl.e1rm` non labellisé ligne 9410, `real1rm` mort car `Array.isArray(exo.sets)` toujours faux sur les logs) **existe** mais **l'utilisateur ne le voit jamais**. La surface Records réellement visible (dash) respecte §7 (PR réel gros, « e1RM estimé » petit — capture `debug-aurel-dash.png`).
- **Devrait** : supprimer `renderPerfCard`+`#perfCard`+`#perfDisplay` (dette morte) OU, si un jour ré-affichée, corriger la fuite. **P4** (dette invisible) et **non P0** comme classé statiquement — car invisible.
- **[VOULU?]** : masquage assumé (v264), mais le code fautif laissé en place est un piège si quelqu'un ré-affiche la carte.

---

## Findings d'exploration (Partie B — ce que personne n'a pu voir à l'écran)

### [P1] B1 — `mono_lift` : fausses alertes 🚨 « danger » sur des lifts jamais exécutés (0 traité comme faible) · confiance : **certain**
- **Observé (mono_lift, onglet Coach, capture `diag-mono_lift.png`)** — deux alertes **rouges** :
  - « 🚨 **Bench nettement plus fort que le Squat** — Ratio Squat/Bench : **0.00** (< 0.85). Déséquilibre marqué — priorise le travail des quadriceps pour **protéger ton Squat lourd.** »
  - « 🚨 **Déficit Rétraction Scapulaire** — Row/Bench = **0.00** (cible > 0.8). Risque d'instabilité des épaules. »
- **Problème** : l'athlète n'a **jamais** squatté ni rowé (mono-bench). `computeStrengthRatiosDetailed` renvoie `squat_bench:0` (nombre, pas `null`) → franchit le seuil danger < 0.85 → 🚨 rouge. Le coach conseille de « protéger ton Squat lourd » **qui n'existe pas.** Confirme le finding **F2 de l'agent 09** à l'écran, en rouge.
- **Devrait** : ratio `null` (carte muette) quand le dénominateur/numérateur n'a **aucune** série loggée, distinct de « réellement faible ».

### [P1] B2 — `donnees_sales` : l'outlier 315kg empoisonne le PR affiché ET fait passer un ratio absurde pour « optimal » · confiance : **certain**
- **Observé (donnees_sales)** : dash Records → « **SQUAT 315kg** » (315 lbs mal saisis en kg, PdC 80kg, aucun garde-fou). Coach → « ✅ Ratio Squat/Bench — S/B = **3.93** ✓ **Dans la zone optimale.** »
- **Problème** : (1) 315kg affiché comme vrai PR barre (F1 agent 09 confirmé). (2) La carte S/B n'a **pas de borne haute** : 3.93 (idéal [1.10,1.35]) est étiqueté « ✓ Dans la zone optimale » en **vert** — le Diagnostic est aveuglé par l'outlier. (3) « ⚠️ Deadlift/Squat faible (0.00 < 1.10) » + « Ischios/Quads faible (0.00) » = fausses alertes (deadlift jamais loggé = 0.00).
- **Devrait** : garde-fou plausibilité (rejeter > ~3.5× PdC sans confirmation) + borne haute S/B + `null` pour lifts absents.

### [P2] B3 — `vierge` (nouveau compte, offline) : l'onboarding ne s'affiche jamais · confiance : **certain**
- **Observé** : au boot de `vierge` (non onboardé), `onboarding-overlay` **non visible** ; seul l'écran de connexion apparaît. Après « Continuer hors-ligne » → app vide (bestPR 0/0/0), **aucun** onboarding pour configurer le profil.
- **Problème** : `needsOnboarding()` est vrai mais l'onboarding n'est déclenché que via `_showFirstRunUI(user)` **si `user.email`** (app.js:14871-14873). Offline/anonyme → jamais. Confirme le **backlog #8** (« Découplage onboarding / cloud+email ») à l'écran : un nouvel utilisateur **sans email/cloud ne peut pas s'onboarder**.

### [P0] B4 — Effet de bord au render : toast « ❄️ Freeze utilisé » + consommation de freeze pendant le render du Coach (`calcStreak` non-readOnly) · confiance : **certain**
- **Observé (mono_lift, ouverture Coach, capture `diag-mono_lift.png`)** : un toast **« ❄️ Freeze utilisé — streak protégé »** apparaît **au render**. C'est `calcStreak()` (sans `readOnly`, app.js:4558-4564) qui pousse `db.gamification.freezesUsedAt`, appelle `syncToCloud()` et `showToast()` **pendant l'affichage**.
- **Problème** : render **non pur** (écrit `db`, sync cloud, toast visible) — renforce A6 sur un 2ᵉ profil et une 3ᵉ voie (freeze) distincte de xpHighWaterMark/reports. Un simple affichage consomme une ressource de jeu.
- **Devrait** : les 11 sites `calcStreak()` d'affichage doivent passer `readOnly:true` (comme app.js:18915).

### [P2] B5 — Macros protéines divergentes entre Coach (216g) et Corps (235g) pour aurel · confiance : **certain**
- **Observé** : Coach nutrition aurel = 2672 kcal / P **216g** ; Corps « Prot cible » = **235g**. `getDailyCaloricTarget` (app.js:15337) = `bw×2.2` = 216 ; `calcMacrosCibles` (engine.js:1377) = `bw×2.4` (recompo) = 235. Deux g/kg différents → deux cibles protéiques affichées. S'ajoute à A4 (même racine : deux moteurs nutrition).

### [P3] B6 — Corps aurel : « Glucides undefined / 178 g » (entrée body partielle) · confiance : **certain**
- **Observé (aurel_like, Corps)** : macro-barre « Glucides **undefined** / 178 g ». `carbMange = todayEntry ? todayEntry.carb : 0` (app.js:16148) → si l'entrée du jour existe mais **sans** champ `carb`, renvoie `undefined` (pas 0) → template `${carbMange} / …` affiche « undefined ». Cosmétique mais visible.

### [P3] B7 — « ✅ ✅ Fenêtre optimale » (double coche) + « vise un PR » affiché quasi-universellement · confiance : **certain**
- **Observé** : « Fenêtre optimale — c'est le moment idéal pour viser un PR ou pousser un peu » apparaît sur **debutant (3 séances)**, **mono_lift**, **donnees_sales**, etc. (ACWR cold-start/guard = zone verte). Double « ✅ ✅ » (coche section + coche alerte). Un débutant de 3 séances incité à « viser un PR » est discutable ; combiné à A5, c'est la source de la contradiction avec le deload.

### [P3] B8 — Diagnostic articulaire : « +340% / +253% / +197% vs habituel » (aurel) — libellés alarmistes · confiance : **probable** · [hors-domaine partiel]
- **Observé (aurel Coach)** : Santé Articulaire → Épaules **+340%**, Genoux **+253%**, Lombaires **+197%** « vs habituel ». Pourcentages énormes pour un powerbuilder assidu (pattern « seuils calibrés occasionnel »). Signalé ; le fond (calcWeeklyJointStress) relève d'un autre domaine.

## Angles morts de cet audit

- **A6 site 3 (`blockStartDate`/wpDetectPhase, app.js:23461)** : **non déclenché** sur aurel (bloc déjà cohérent). Non re-testé sur un profil sans `currentBlock.blockStartDate` — le write conditionnel reste plausible (confiance : hypothèse). À retester.
- **Perf réelle sur device Android** : mes ms sont sur matériel serveur + synchrones (Chart.js async exclu). Un profiling sur device cible reste nécessaire pour trancher A7 définitivement.
- **Le lundi** : reproduit par override de `Date` (fidèle à `renderCoachTab`), pas par une vraie horloge système un lundi. `page.clock` (fake timers) risquait de casser le boot (setTimeout d'init) — approche évitée volontairement (anti-contournement).
- **Chemins authentifiés/cloud** : A3 et tout le Social/leaderboard/challenges ne sont observables **qu'offline** ici (Supabase stubbé). Les crashs latents (A3) ne se déclenchent que connecté — je les ai prouvés par stub d'uid, pas par un vrai login.
- **États de check-in / modales / navigation profonde** (accordéons Réglages, band picker, débrief post-séance) : survolés, pas exhaustivement cliqués.
- `window.db` non exposé → pas de diff mémoire fin ; je diffe le `localStorage` sérialisé (les mutations non persistées m'échappent).

## Hors-domaine (signalé, non investigué)

- Diagnostic articulaire « +340% vs habituel » (B8) : calibration `calcWeeklyJointStress` — domaine seuils/diagnostic (agents 02/03).
- `computeStrengthRatiosDetailed` renvoie `0` au lieu de `null` pour lifts absents (racine de B1/B2) : domaine calculs/engine (agent 01).
- Absence de garde-fou plausibilité poids (315kg) : domaine persistance/import (agent 05).
- Double moteur nutrition (`calcCalorieCible` vs `calcTDEE`/`calcMacrosCibles`) : domaine calculs (agent 01/06) — je confirme l'effet écran (A4/B5).
- `renderPerfCard` + `#perfCard`/`#perfDisplay` mort : candidat cleanup (agent 06 code mort).

## À VÉRIFIER CÔTÉ SUPABASE

1. **Résurrection RGPD** : après un `delete_user_complete_data()`, la clé locale `SBD_HUB` (réécrite au render Jeux, A6/B4) ré-hydrate-t-elle un vrai profil supprimé ? (côté device/local, mais l'impact sync : `syncToCloud` déclenché au render peut-il **ré-uploader** un profil en cours de suppression ?)
   > Vérifier : une session `renderGamificationTab`/`calcStreak` post-suppression relance-t-elle une écriture `sbd_profiles` ?
2. **A3 en prod** : des `error_logs` de type `render_crash`/TypeError mentionnant `socialFriendsBadge` ou `renderFriendsTab` existent-ils pour de vrais users connectés ?
   > `select created_at, message from error_logs where message ilike '%socialFriendsBadge%' or message ilike '%renderFriendsTab%' order by created_at desc limit 20;`
3. **Cible calorique réelle** : la valeur affichée à aurel côté Corps en prod est-elle 2300 (calcCalorieCible) ou 2672 (Coach) ? (calibre la sévérité de A4 selon la carte que l'user regarde le plus).
4. **Outliers en base** : des poids > 3.5× PdC (saisies lbs-en-kg façon donnees_sales 315kg) existent-ils déjà chez de vrais users, empoisonnant `bestPR`/ratios ?
   > balayer `workout_sessions.data.exercises[*].series[*].weight` vs `sbd_profiles.data.user.bw`.
5. **Rapports hebdo dupliqués** : `generateWeeklyReport` écrivant au render chaque lundi, y a-t-il des doublons de `data.reports` (même `weekKey`) accumulés en base ?

---

*(Fichiers écrits par l'agent 10 : `audit/10-execution.md` + `audit/screenshots/*.png` uniquement. Aucune modif applicative/test/config. Aucun commit. Aucun accès Supabase — tout trafic externe abortÉ.)*
