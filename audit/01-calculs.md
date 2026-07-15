# AUDIT 01 — Calculs & Formules

> Agent 01 (vague 2, prioritaire). READ-ONLY strict. Un seul fichier écrit : `audit/01-calculs.md`.
> Branche `claude/audit-vague2`, Service Worker `trainhub-v350` (service-worker.js:1).
> Note skill : le prompt annonçait `audit-systematique` comme absent — il était en réalité **disponible** et a été chargé (il définit ce format). Divergence mineure : le skill dit `trainhub-v349`, le code est à v350.

## Blocages rencontrés
Aucun. Aucune modification, aucun commit, aucun accès Supabase. `node -c` (lecture seule) passe sur engine.js / coach.js / program.js / app.js.

## Résumé exécutif
**20 findings** : **1 P1/P0**, **1 P1**, **6 P2**, **6 P3**, **6 P4**. Le plus grave (**calcIPFGL**, app.js:15355) : le score IPF GL affiché est **faux et indépendant du poids de corps** (retourne 220 pour tout PdC 60-130 kg au lieu de ~48 @98 kg), et ses seuils de niveau condamnent **tout** utilisateur réel à « Débutant ». Second : le **« plancher combiné 60 % »** (app.js:22688) est du **code mort** (`_prepenaltyBase` jamais écrit). Le calorique de base (getDailyCaloricTarget → calcTDEE) est **juste et matche la réf aurel_br au kcal près (2672 / P216 / L88 / G254)**, mais **trois** voies caloriques et **deux** formules de macros divergent selon la surface.

---

## Findings

### [P1] calcIPFGL — le terme poids-de-corps s'effondre : score IPF GL faux, constant, et « Débutant » pour tous
- **Où** : `js/app.js:15355` (def) ; affiché `js/app.js:15457` (message coach) et `js/app.js:16168` (carte métrique) ; total via `js/engine.js:1130`.
- **Code** :
  ```js
  function calcIPFGL(lift, bw) {
    const a=1236.25115, b=1449.21864, c=0.01644, d=2.12345;
    const denom = a - b * Math.exp(-c * Math.pow(bw, d));   // ⚠️ bw^2.12345
    if (!denom || denom <= 0) return 0;
    return Math.round((600 / denom) * lift * 100) / 100;    // ⚠️ numérateur 600
  }
  ```
- **Problème** : la vraie formule IPF GL (hommes SBD) est `100 / (1236.25115 − 1449.21864·e^(−0.01644·bw)) × total` — **bw à la puissance 1**, numérateur **100**. Ici `Math.pow(bw, d)` avec d=2.12345 rend `−c·bw^d` massivement négatif dès bw≈40 → `e^(...)≈0` → dénominateur **constant 1236.25** quel que soit le poids. Vérifié par node :
  ```
  bw=60  → code 220.83 | vrai IPF GL 65.39
  bw=98  → code 220.83 | vrai IPF GL 48.05
  bw=130 → code 220.83 | vrai IPF GL 42.71
  ```
  Le score = `0.4854 × total`, **indépendant du poids de corps** (la normalisation, seule raison d'être d'un score IPF, est morte). De plus les seuils de niveau `ipf<300?'débutant':ipf<400?'intermédiaire':ipf<500?'avancé':'élite'` (app.js:15456, 16168) sont calibrés sur cette échelle cassée : ils exigent un total de 618/824/1030 kg pour changer de palier → **tout utilisateur réel reste « Débutant »**. aurel_br (total 455, avancé) est affiché « **220 pts — Débutant** » alors que son vrai IPF GL ≈ 48.
- **Devrait** : `denom = a − b·Math.exp(−c·bw)` (sans `Math.pow`, sans d), numérateur `100`, et **recalibrer** les seuils 300/400/500 vers l'échelle réelle (~<50 débutant … >100 élite, à valider Gemini). Le ratio dérivé `ipf/bw` (app.js:16119) est faux en conséquence.
- **Confiance** : certain (déroulé node ci-dessus).
- **[VOULU?]** : non — aucune variante de score de force n'est censée être indépendante du poids de corps.

### [P1] Le « plancher combiné 60 % » de wpComputeWorkWeight est du code mort
- **Où** : `js/app.js:22688-22692` (le plancher) ; `js/app.js:23017` (lecture de la source).
- **Code** :
  ```js
  // Combined penalty floor: never drop below 60% of the pre-penalty base
  if (ctx.prepenaltyBase) {
    var _floor = Math.round(ctx.prepenaltyBase * 0.60 / 2.5) * 2.5;
    if (baseWeight < _floor) baseWeight = _floor;
  }
  // ...
  prepenaltyBase: db.exercises && db.exercises[realName] && db.exercises[realName]._prepenaltyBase,
  ```
- **Problème** : `_prepenaltyBase` n'est **jamais écrit** dans tout le repo (grep : uniquement lu en 22689/22690/23017). Donc `ctx.prepenaltyBase` vaut toujours `undefined` → le garde-fou « jamais < 60 % de la base » **ne s'exécute jamais**. CLAUDE.md §8 étape 8 le documente comme une invariante active : elle ne l'est pas. Conséquence : pour un utilisateur **non-avancé et non-femme** (les deux seuls autres planchers ne couvrent que ces cas, app.js:22740/22750), l'empilement sommeil ×0.95 · RHR ×0.80 · activité ×0.97 · mental ×0.97 · return-to-play peut faire descendre la charge jusqu'au `Math.max(20, …)`. De plus, même si `_prepenaltyBase` existait, le plancher est placé **avant** le kill switch compétition ×0.85 (22714), le mental ×0.97 (22726) et le RTP (22733) → ces pénalités le franchiraient quand même.
- **Devrait** : soit écrire `db.exercises[realName]._prepenaltyBase = apre_base` avant les pénalités et **repositionner** le plancher en toute fin de chaîne, soit retirer le code mort et documenter que le vrai plancher est « avancé 60 % e1rmRef / cycle 70 % ».
- **Confiance** : certain (grep exhaustif `prepenalty` sur js/).

### [P2] Trois voies caloriques divergentes pour le même utilisateur
- **Où** : `js/app.js:15316` (getDailyCaloricTarget→calcTDEE) ; `js/engine.js:1355` (calcCalorieCible) ; `js/engine.js:1137` (calcTDEEKatchMcArdle) ; conso Corps `js/app.js:16142,16155`.
- **Code** :
  ```js
  function calcCalorieCible(bw) {
    const kcalBase = db.user.kcalBase || 2300;
    const bwBase   = db.user.bwBase   || 98;
    if (!bw || bw <= 0) return kcalBase;
    return Math.round(kcalBase * (bw / bwBase));   // défaut → 2300
  }
  // Corps : const cible=calcCalorieCible(bw);  setEl('nutriCible',cible);  → 2300
  ```
- **Problème** : `getDailyCaloricTarget()` = `calcTDEE` = **2672** kcal (Mifflin, matche la réf). Le ring nutrition du Corps affiche `cible = calcCalorieCible` = `kcalBase(2300 déf) × bw/bwBase(98 déf)` = **2300** par défaut — un modèle totalement différent (échelle linéaire d'un `kcalBase` manuel, ignore goal/activité/Mifflin). Troisième valeur : si `db.user.fatPct` est renseigné, calcTDEE bascule sur Katch-McArdle et retourne **~2971+** (voir déroulé plus bas). Même utilisateur, jusqu'à trois « objectifs » kcal selon la surface et les champs remplis. C'est le frère du bug « calcTDEE puis cycling maison par-dessus » (pitfall #7).
- **Devrait** : une seule source de vérité affichée comme « objectif ». Si le ring est un override manuel assumé, l'étiqueter distinctement de la reco algorithmique et ne pas retomber sur 2300 par défaut.
- **Confiance** : certain pour la divergence ; les chiffres exacts dépendent de `db.user.kcalBase`/`fatPct` (→ Supabase).
- **[VOULU?]** : le ring « piloté manuellement » (commentaire app.js:16143) peut être délibéré, mais le défaut 2300 vs 2672 reste incohérent.

### [P2] Deux formules de macros divergentes — le commentaire « harmonisées » est faux
- **Où** : `js/app.js:15337-15338` (getDailyCaloricTarget) vs `js/engine.js:1377-1382` (calcMacrosCibles) ; commentaire trompeur `js/app.js:15335`.
- **Code** :
  ```js
  // app.js:15335 : « Macros harmonisées avec calcMacrosCibles : P 2.2 g/kg, L 0.9 g/kg. »
  var targetProteins = Math.round(bw * 2.2);   // 98 → 216
  var targetFats     = Math.round(bw * 0.9);   // 98 → 88
  // engine.js:1377 :
  var protPerKg = goal === 'recompo' ? 2.4 : 1.95;   // 98 → 235
  var fatPerKg  = gender === 'female' ? 1.0 : 0.73;  // 98 → 72
  ```
- **Problème** : pour aurel_br (recompo, H, 98 kg), getDailyCaloricTarget → **P216 / L88**, calcMacrosCibles → **P235 / L72**. Le commentaire prétend l'harmonisation (2.2/0.9) mais calcMacrosCibles utilise 2.4/0.73. Le Corps (app.js:16044, 16144) affiche la version calcMacrosCibles → l'utilisateur voit deux jeux de macros selon l'écran. CLAUDE.md §8 documente 2.2/0.9 comme canonique.
- **Devrait** : une seule table de macros, ou aligner les deux et corriger le commentaire.
- **Confiance** : certain.

### [P2] computeStrengthRatios : ratios calculés depuis l'e1RM (pas bestPR) + bandes idéales divergentes
- **Où** : `js/app.js:15618` (def, appelée en 15589 carte « Plage idéale » et 20445 coach) ; source `js/engine.js:44` (STRENGTH_RATIO_TARGETS).
- **Code** :
  ```js
  const squat = (getSmoothedE1RM('squat') …) || e1rm('squat');   // e1RM, pas bestPR
  if (squat && deadlift) ratios.squat_deadlift = { value: squat/deadlift, ideal: [0.80, 0.85], … };
  if (bench && squat)    ratios.bench_squat    = { value: bench/squat,    ideal: [0.60, 0.70], … };
  if (row && bench)      ratios.row_bench      = { value: row/bench,      ideal: [0.90, 1.00], … };
  ```
- **Problème** : (a) les valeurs affichées à l'utilisateur sont calculées depuis l'**e1RM lissé** (gonflable par le rep-work), ce que CLAUDE.md §7/§9 interdit pour tout chiffre **affiché/comparé** (« utilise bestPR »). D'autres surfaces utilisent bien `db.bestPR.squat/db.bestPR.bench` (app.js:21061, 22153, 24616) → **le même ratio S/B diffère selon l'écran**. (b) les bandes idéales hardcodées **divergent** de STRENGTH_RATIO_TARGETS (source de vérité) : squat_deadlift `[0.80,0.85]` vs engine `[0.75,1.05]` ; bench_squat `[0.60,0.70]` vs l'inverse de squat_bench `[1.10,1.35]` (= `[0.74,0.91]`) ; row_bench `[0.90,1.00]` vs `[0.80,1.00]`. Seul ohp_bench `[0.60,0.65]` coïncide. CLAUDE.md §10 signalait déjà push_pull ; voici les frères.
- **Devrait** : dériver les valeurs de `db.bestPR` et lire les bandes depuis STRENGTH_RATIO_TARGETS.
- **Confiance** : certain (divergence) ; probable pour l'impact réel (dépend de l'écart e1RM↔bestPR).

### [P2] computeSRS compte l'activité secondaire deux fois
- **Où** : `js/coach.js:707-710` (dans l'ACWR) et `js/coach.js:804-810` (malus direct).
- **Code** :
  ```js
  var acuteExt   = getActivityEffVol(7);           // activité DANS l'acute ACWR
  var chronicExt = getActivityEffVol(28) / 4 || 1;
  // ... plus bas, APRÈS le score pondéré :
  _recentActs.forEach(function(act) {
    var _malus = Math.round(_coeff * (_intensity / 5) * 10);
    score = Math.max(0, score - _malus);           // re-pénalise la même activité
  });
  ```
- **Problème** : une activité secondaire intense pèse sur le SRS **via l'ACWR** (acuteExt/chronicExt → acwrScore) **puis** une seconde fois via le malus forfaitaire. C'est le frère du triple-comptage kcal (activité comptée dans le multiplicateur puis re-ajoutée).
- **Devrait** : choisir un seul canal (ACWR ou malus), pas les deux.
- **Confiance** : probable (le malus est modeste ~5-10 pts, mais c'est un double comptage structurel).

### [P2] getProgressionScore compare la période récente à l'historique le plus ANCIEN, pas « juste avant »
- **Où** : `js/app.js:7350`.
- **Code** :
  ```js
  var _older = _logs.filter(l => (l.timestamp||0) <= _30d);   // index 0 = plus récent
  var _olderSlice = _older.slice(-_recent.length);            // ⚠️ prend les N plus VIEUX
  ```
- **Problème** : `db.logs` est trié plus-récent-en-index-0 (CLAUDE.md §11). `_older.slice(-N)` prend donc les **N séances les plus anciennes** de tout l'historique, pas « une fenêtre équivalente juste avant » les 30 j comme l'annonce le commentaire (7329-7331). Pour un athlète établi, la « progression » compare ce mois-ci à ses tout premiers mois → score gonflé/instable. Alimente la métrique « progression » du leaderboard.
- **Devrait** : `_older.slice(0, _recent.length)` (les N séances immédiatement avant la fenêtre 30 j).
- **Confiance** : probable (dépend de l'ordre garanti des logs ; friend-logs non garantis triés).

### [P2] calcTDEEKatchMcArdle : TRIMP hebdomadaire ajouté comme terme kcal quotidien
- **Où** : `js/engine.js:1140-1141`.
- **Code** :
  ```js
  var cardioKcal = (weeklySecondaryTRIMP || 0) * 0.5;   // TRIMP = grandeur HEBDO
  return Math.round(bmr * (activityFactor || 1.6) + cardioKcal);  // ajouté à un TDEE QUOTIDIEN
  ```
- **Problème** : `weeklyTRIMP` est la somme hebdomadaire (calcTDEE:1179-1182). `bmr × activityFactor` est un TDEE **journalier**. Ajouter `weeklyTRIMP×0.5` chaque jour attribue ~7× l'énergie du cardio sur la semaine si l'intention était « 0.5 kcal par unité de TRIMP hebdo ». De plus le facteur d'activité 1.6 « inclut déjà » l'activité générale — chevauchement partiel. N'affecte QUE le chemin Katch (fatPct renseigné) et si `db.user.secondaryActivities` est peuplé.
- **Devrait** : `cardioKcal = weeklyTRIMP × 0.5 / 7` (répartition journalière), et vérifier le non-double-comptage avec l'activityFactor.
- **Confiance** : probable ; latent si secondaryActivities/fatPct non peuplés (→ Supabase).

### [P3] DUP tethering : détecte à ×1.15 mais corrige à ×0.85, et l'hypertrophie peut tirer la force vers le haut
- **Où** : `js/engine.js:4936-4942`.
- **Code** :
  ```js
  if (forceE1RM > hypertE1RM * 1.15) { z.hypertrophie.e1rm = Math.round(forceE1RM * 0.85 / 2.5) * 2.5; }
  if (hypertE1RM > forceE1RM)        { z.force.e1rm = Math.round(hypertE1RM * 1.02 / 2.5) * 2.5; exo.e1rm = z.force.e1rm; }
  ```
- **Problème** : (a) détection à 1.15 mais correction à 0.85 ; or `1/1.15 = 0.8696`. Après correction, force/hyper = `1/0.85 = 1.176` → **encore 17,6 % d'écart**, pas 15 %. Le « ±15 % » (CLAUDE.md le marquait déjà `[À VÉRIFIER]`) est inexact. (b) tethering **asymétrique** : dès que hypertE1RM dépasse forceE1RM d'un iota, la zone force (et `exo.e1rm` qui pilote les charges) est relevée à `hyper×1.02`. Or l'e1RM hypertrophie vient de séries 6-12 reps (Brzycki), exactement le « e1RM gonflé par le rep-work » que CLAUDE.md §7 met en garde → risque de faire monter la capacité-force sur du volume.
- **Devrait** : corriger à `forceE1RM / 1.15` pour un vrai cap 15 %, et réévaluer si l'hypertrophie doit pouvoir piloter la force à la hausse.
- **Confiance** : certain (arithmétique) ; **[VOULU?]** possible pour l'asymétrie (récupérer un e1RM force sous-estimé).

### [P3] computeSRS : tendance « 14 jours » qui n'est pas datée + seconde implémentation de trend
- **Où** : `js/coach.js:748-768` (vs `js/engine.js:2619` getE1RMTrend).
- **Code** :
  ```js
  // 3. Tendance e1RM 14 jours
  for (var i = 0; i < sorted.length && pts.length < 6; i++) { … pts.push(exo.maxRM); }
  deltas.push((pts[0] - pts[pts.length-1]) / pts[pts.length-1] * 100);
  ```
- **Problème** : le commentaire dit « 14 jours » mais le code prend les **6 derniers points** sans aucun filtre de date : s'ils s'étalent sur 3 mois, l'étiquette est fausse. Par ailleurs c'est une **deuxième** définition du trend e1RM, distincte de `getE1RMTrend` (fenêtre datée, moyenne 3 premiers/3 derniers, `wpCalcE1RM`) — backlog CLAUDE.md #3 (« socle commun »). Utilise `maxRM` (Brzycki) au lieu de wpCalcE1RM ailleurs.
- **Devrait** : filtrer par date réelle ou corriger le libellé ; converger vers un seul trend.
- **Confiance** : certain.

### [P3] TRIMP Force : citation « Foster et al. 2001 » incorrecte
- **Où** : `js/coach.js:287-306`.
- **Code** :
  ```js
  // ── TRIMP FORCE (Foster et al. 2001 …) ──   TRIMP = Σ (reps × RPE² × C_slot)
  total += reps * Math.pow(rpe, 2) * cSlot;
  return Math.round(total / 15);   // acute ;  /60 en chronic
  ```
- **Problème** : la méthode de Foster (session-RPE) = `RPE_séance × durée(min)`, celle de Bannister = HR-dépendante. `reps × RPE²` n'est ni l'une ni l'autre — c'est un proxy maison (défendable, quadratique sur l'effort). La normalisation ÷15 (acute) / ÷60 (chronic) est **cohérente** (7/15 = 28/60 = 0,4667 → ACWR steady-state ≈ 1.0, vérifié). Seule la **référence académique** est erronée. Note aussi : RPE par défaut 7 si absent (coach.js:299) — n'affecte pas le ratio (même défaut acute/chronic).
- **Devrait** : citer « session-RPE adapté » sans attribuer à Foster/Bannister.
- **Confiance** : certain.

### [P3] Deux tables de phase contradictoires (PHASE_MULT peak 1.05 vs APRE_PHASE_CAPS peak 1.00) ; macros bien_être non équilibrées
- **Où** : `js/app.js:22975` (PHASE_MULT) vs `js/app.js:22695-22699` (APRE_PHASE_CAPS) ; `js/engine.js:1367-1373` (bien_être).
- **Problème** : (a) PHASE_MULT peak = **1.05** (105 % e1RM) mais APRE_PHASE_CAPS peak = **1.00** plafonne à 100 % → le cap gagne, l'intention 105 % est inatteignable. Deux tables à réconcilier. (b) calcMacrosCibles bien_être fixe `carb = kcal×0.50/4` et `fat = kcal×0.30/9` **indépendamment** de la protéine (`bw×1.6`) → la somme des macros ≠ objectif kcal (dépasse de la valeur protéique). Le chemin non-bien_être équilibre correctement (carbs = reste).
- **Devrait** : aligner peak (1.00 ou 1.05, pas les deux) ; pour bien_être, dériver les glucides en reste après protéines et lipides.
- **Confiance** : certain. **[VOULU?]** : le cap peak comme garde-fou est plausible.

### [P3] calcStreak : plancher de date codé en dur `'2026-W01'`
- **Où** : `js/app.js:4546`.
- **Code** : `} else if (checkWeek < '2026-W01') { … break; }`
- **Problème** : toute série (streak) remontant avant 2026-W01 est coupée à cette semaine. Un utilisateur avec de l'historique 2025 perd sa régularité pré-2026 du calcul de streak. Seuil magique non nommé.
- **Devrait** : nommer/documenter la constante (date de lancement) ou dériver du premier log réel.
- **Confiance** : certain. **[VOULU?]** : borne de lancement d'app plausible.

### [P3] SRS ACWR : mélange d'échelles SBD-TRIMP (÷15/÷60) et activité (×0.7)
- **Où** : `js/coach.js:709-711`.
- **Problème** : `acute = acuteSBD + acuteExt` additionne un TRIMP normalisé (÷15) et un score d'activité brut (×0.7). Pour un powerbuilder, acuteSBD (~3000) domine acuteExt (~130 estimé) → blend OK. Mais pour un profil bien_être (peu de SBD, beaucoup de cardio), l'activité pourrait dominer et distordre l'ACWR SBD.
- **Devrait** : normaliser l'activité sur la même échelle que le TRIMP force avant sommation.
- **Confiance** : hypothèse (magnitude dépend du profil ; à confirmer sur données réelles).

### [P4] WP_PROGRESSION : fallback avec mauvaises clés (`increment`/`deloadPct`) → NaN si atteint
- **Où** : `js/app.js:22845` (fallback) vs `js/app.js:21100` (def réelle `{increase, decrease}`).
- **Code** : `… || { increment: 2.5, deloadPct: 0.20 };` puis usage `last.weight + prog.increase`.
- **Problème** : le fallback expose `increment` alors que le code lit `prog.increase` → `last.weight + undefined = NaN`. Inatteignable en pratique (`WP_PROGRESSION.upper` existe toujours), mais latent et trompeur.
- **Devrait** : fallback `{ increase: 2.5, decrease: 5.0 }`.
- **Confiance** : certain.

### [P4] getCyclePhase — doublon binaire mort de getCurrentMenstrualPhase
- **Où** : `js/engine.js:1239` (0 caller, grep confirmé) vs `js/engine.js:3273` (getCurrentMenstrualPhase, 4 phases).
- **Problème** : getCyclePhase lit `db.user.cycleTracking` et retourne folliculaire/lutéale (binaire), divergent de la version à 4 phases utilisée par getCycleCoeff/computeSRS. Code mort à risque de divergence si un jour recâblé.
- **Devrait** : supprimer.
- **Confiance** : certain (0 caller dans js/).

### [P4] Cluster de fonctions program.js probablement mortes
- **Où** : `js/program.js` — `isFatigued` (193), `generatePBSession` (268), `generatePLMesocycle` (238), `computeNextLoad` (102), `lombardi1RM` (71) : **0 caller hors program.js** dans js/.
- **Problème** : le générateur actif est `wpGeneratePowerbuildingDay` (app.js). Ces fonctions (dont une 3e formule ACWR-tonnage `isFatigued` seuil 1.3, et un `computeFatigueScore` maison — celui-ci a 5 callers, donc vivant) semblent orphelines. `epleyE1RM`/`brzyckiE1RM` (61/66) : à vérifier (combinées « pour la génération de programme » selon CLAUDE.md, mais génération program.js non appelée).
- **Devrait** : confirmer via index.html/tests puis cleanup.
- **Confiance** : probable (grep js/ seulement — usage inline HTML non exclu).

### [P4] calibrateTDEE mort (lit `db.body` inexistant, 0 caller)
- **Où** : `js/engine.js:1218`.
- **Problème** : `db.body` n'est pas dans le schéma (CLAUDE.md §11) → `(db.body || [])` toujours vide → `entries.length < 5` → return immédiat. Confirme CLAUDE.md (« dead code »).
- **Devrait** : cleanup.
- **Confiance** : certain.

### [P4] Trois helpers e1RM avec gardes-reps incohérentes
- **Où** : `js/app.js:1729` (calcE1RM, `Math.min(r,20)`) ; `js/app.js:22489` (wpCalcE1RM, garde `divisor<=0`) ; `js/program.js:66` (brzyckiE1RM, **aucun cap**) ; `js/engine.js:4059` (calcE1RMFrom5RepTest, **aucun cap**).
- **Problème** : `brzyckiE1RM` et `calcE1RMFrom5RepTest` divisent par `(37 − reps)` / `(1.0278 − 0.0278·reps)` sans garde : à reps ≥ 37 (resp. ~37) → Infinity/négatif. calcE1RM cape à 20, wpCalcE1RM garde le diviseur. Trois comportements pour la même formule Brzycki.
- **Devrait** : cap/garde uniforme (≤ ~15 reps, Brzycki invalide au-delà).
- **Confiance** : certain (données réelles rarement ≥ 37 reps → risque faible, d'où P4).

---

## Calculs vérifiés JUSTES (déroulés, pas de finding)
- **calcTDEE Mifflin** (engine.js:1144) : `10·98 + 6.25·182 − 5·28 + 5 = 1982.5` ×1.6 (5 séances/sem) − 500 (recompo) = **2672** ✅ matche la réf. Diviseur « semaines couvertes » basé sur l'historique **complet** borné à 4 (pas la fenêtre glissante) → stable au décalage d'un jour (pitfall #3 corrigé).
- **getDailyCaloricTarget macros** (app.js:15337) : P216 / L88 / **G254** = `(2672 − 864 − 792)/4` ✅ matche la réf ; label « jour de séance » **informatif**, zéro effet kcal (double-comptage #4 corrigé).
- **predictPR** (app.js:9262) : régression linéaire, garde `denom!==0`, **seuil pente 0.05 kg/sem** (app.js:9286) neutralise le bruit de cancellation flottante ~1e-11 (pitfall #5 corrigé), garde `ssTot>0` sur R².
- **calcE1RM** (app.js:1729) Brzycki cap 20 ✅ ; **wpCalcE1RM** (app.js:22489) Brzycki RPE-aware (reps effectifs = reps + (10−RPE)), diviseur gardé ✅.
- **computeDOTS** (engine.js:1653) : coefficients IPF DOTS H/F **exacts**, `500/denom × total` ✅ (aurel ≈ 283).
- **detectVolumeSpike** (engine.js:4680) : 7 j vs 7 j, unités cohérentes, `if(prev===0) return` garde la division ✅ (seuils +20 %/+30 % conformes CLAUDE.md §10).
- **calcWeeklyJointStress** (engine.js:3915) : fenêtre 7 j, seuils **130/180** nommés (engine.js:3564) ✅ ; n'intègre pas les reps (charge moy × sets — choix de modèle défendable).
- **computeSRS ACWR** : ÷15 acute / ÷60 chronic → steady-state ≈ 1.0 (7/15 = 28/60), guards cold-start / chronic<3 / reprise<21j corrects.
- **calcWeightCutPenalty** (engine.js:4105) : moyenne 14 j, cap 20 %, garde `startWeight` ✅.

---

## Angles morts de cet audit
- **Chart.js / rendu graphique** : non audité (hors périmètre calcul pur).
- **Valeurs réelles des champs** (`db.user.fatPct`, `kcalBase`, `bwBase`, `secondaryActivities`, `weeklyLogs[].loss` en kg ou fraction) : invérifiables sans Supabase → conditionnent la portée réelle des findings caloriques (P2 #3, #8).
- **getMuscleContributions / MUSCLE_PARENT_MAP** : structure lue (child→parent cohérente, self-maps inoffensifs), mais je n'ai pas déroulé un tonnage complet multi-exercices pour prouver l'absence de double-comptage parent+enfant dans une même somme affichée — à confirmer si un agent volume l'attaque.
- **Ordre exact des 13-15 pénalités** vs device : j'ai vérifié la logique et l'ordre du code, pas le rendu sur vraies données (règle CLAUDE.md §4 : vérif device obligatoire).
- **calcWeeklyFatigueCost / Insolvency / SFR_TABLE** (coach.js:329-365) : lus, non déroulés numériquement (métriques secondaires).

## Hors-domaine (signalé, non investigué)
- `classifyStagnation` (engine.js:2751) retourne `action:'deload'` en cas de fatigue → possible prescription d'intensité **hors arbitre** (invariante §9) — à trancher par l'agent « arbitre/invariantes ».
- `computeStrengthRatios` utilise l'e1RM pour un chiffre affiché → recoupe l'audit « affichage e1RM vs PR » (§7).
- `renderPerfCard` (app.js:9374) expose `e1rm` arrondi ; `real1rm` dépend de `Array.isArray(exo.sets)` (souvent un nombre ?) → agent « records/affichage ».
- Commentaires périmés app.js:23788/23813 (citent squat_bench.alert 1.20 / squat_dead.danger 0.78 ; réels 1.10 / 0.65) — le code lit dynamiquement STRENGTH_RATIO_TARGETS, donc correct ; doc drift seulement.
- Multiples définitions push/pull (program.js:138 `analyzeMuscleBalance` fenêtre 14 j coeff vertical 0.5 ; app.js:15640 hebdo epaules×0.5) — agent volume.

## À VÉRIFIER CÔTÉ SUPABASE
1. **`db.user.fatPct` est-il renseigné pour les utilisateurs réels ?** Si oui, calcTDEE bascule sur Katch-McArdle (≈2971+ pour aurel_br) au lieu de Mifflin (2672) → saut de ~300 kcal. Requête : `select id, (data->'user'->>'fatPct') as fatpct from sbd_profiles where data->'user'->>'fatPct' is not null;`
2. **`db.user.kcalBase` / `bwBase` existent-ils ?** Déterminent si le ring Corps affiche 2300 (défaut) ou une valeur calibrée. Requête : `select id, data->'user'->>'kcalBase' kb, data->'user'->>'bwBase' bb from sbd_profiles;`
3. **`db.user.secondaryActivities` est-il peuplé ?** Sinon le terme `cardioKcal` de Katch (bug d'unité #8) est inerte. Requête : `select id, jsonb_array_length(data->'user'->'secondaryActivities') from sbd_profiles where data->'user'->'secondaryActivities' is not null;`
4. **`weeklyLogs[].loss` (weight cut) est-il en fraction (0.012 = 1.2 %) ou en kg ?** calcWeightCutPenalty compare à `0.012` (engine.js:4123) — si c'est des kg, le seuil water-cut est faux. Requête : inspecter `data->'user'->'weightCut'->'weeklyLogs'` d'un profil en cut.
5. **Un score IPF GL de ~220 « Débutant » a-t-il déjà été vu/rapporté côté data/feedback ?** (Confirme l'impact utilisateur du finding P1 calcIPFGL avant fix.)

---

STOP. Audit Calculs terminé. Rapport : audit/01-calculs.md. Aucune modification, aucun commit.
