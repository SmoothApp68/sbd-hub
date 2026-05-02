# TrainHub — TODO (état en temps réel)

## État général
- Score Gemini : **9.6/10** (↑ post-beta-test)
- SW version : **v138**
- Objectif : lancement multi-users juillet 2026
- Dernier audit : `audit/12-beta-tester-simulation.md` (2 mai 2026)

## ✅ Complété

### Architecture & Algo
- [x] Périodisation 7 phases + DUP hybride
- [x] APRE + Shadow Weight + Back-off sets dynamiques
- [x] SRS (ACWR + Readiness + Trend)
- [x] Live Coaching GO + hiérarchie
- [x] Proxy VBT grind (9G, seuils par phase)
- [x] APRE bridé par phase (85% e1RM hypertrophie)
- [x] Grind Peak = 0G
- [x] isAbandoned flag (séries abandon exclues e1RM)
- [x] analyzeAthleteProfile() — diagnostic sans IA
- [x] Cold Start — semaine calibration
- [x] Bilan du matin (sommeil + readiness)
- [x] Sleep Penalty -5%
- [x] Prehab génératif
- [x] Activités secondaires injectées automatiquement

### Programme
- [x] Custom Programme Builder
- [x] Bibliothèque 800+ exercices
- [x] Backup automatique (15 versions + dates + sessionCount)
- [x] Sync multi-appareils (timestamp serveur)

### Social
- [x] Feed + profil ami enrichi
- [x] Notifications temps réel

### Qualité
- [x] getMRV genre normalisé (F/M/female)
- [x] NaN SÉRIES corrigé dans Stats Volume
- [x] coach.js + program.js dans SW cache
- [x] escapeHtml sur usernames
- [x] RLS vérifiées (propres)

### PHASE 1 — Stabilisation
- [x] TÂCHE 1 : Supprimer constants.js + utils.js orphelins — commit 5dbe918
- [x] TÂCHE 2 : Icônes PWA qualité + séparation any/maskable + icône notifications — commit eb260f5
- [x] TÂCHE 3 : Exercices manquants Custom Builder — tous présents dans EXO_DATABASE, aucun ajout nécessaire
- [x] TÂCHE 4 : Backup programme v2 — déjà implémenté (15 backups, firstUsedAt/lastUsedAt/sessionCount)

### PHASE 2 — Qualité coaching
- [x] TÂCHE 5 : Transfer Matrix auto-apprenante — commit c4703d5
- [x] TÂCHE 6 : Offline first (GO sans réseau) — commit 1178e6f

### PHASE 3 — Différenciation
- [x] TÂCHE 7 : Module cycle menstruel (PhysioManager) — commits a7acb40 + 43f37d5
  - ÉTAPE A : MENSTRUAL_PHASES + getCycleCoeff/getMRVWithCycleAdjust/getRestWithCycleAdjust → engine.js
  - ÉTAPE B : cycleCoeff intégré dans computeSRS() → coach.js
  - ÉTAPE C : wpComputeWorkWeight ajuste la charge selon la phase → app.js
  - ÉTAPE D : renderCoachTodayHTML affiche carte phase + alerte blessure → app.js
  - ÉTAPE E : renderSettingsProfile affiche section menstruel (genre F uniquement) → app.js
  - ÉTAPE F : toggleMenstrualTracking / saveMenstrualData / menstrualResetToday → app.js
  - ÉTAPE G : migration migrateDB (menstrualEnabled + menstrualData) → app.js
  - Supabase migration needed : non (données dans db.user, sync via sbd_profiles)
- [x] TÂCHE 8 : Nettoyage fonctions mortes app.js — 29 fonctions supprimées, 595 lignes — commits 1e63c2f, 261b82c, db24f5c

### PHASE 4 — Lancement
- [x] TÂCHE 10 : Onboarding 3 questions + ONBOARDING_PROFILES — commit 30c7d29
  - 3 étapes (Q1 profil, Q2 objectif, Q3 matériel) pour nouveaux utilisateurs
  - ONBOARDING_VERSION bumped à 3
  - vocabLevel, skipPRs, skipRPE, obProfile migrés dans db.user
- [x] TÂCHE 11 : Vocabulaire adaptatif (VOCAB + getVocab) — commit 40fe86d
  - VOCAB constant dans engine.js (e1rm, rpe, peak, apre, srs, deload, acwr, mrv, mev)
  - getVocab() utilisé dans formatRPE, coach SRS gauge, messages deload
- [x] TÂCHE 12 : 5-Rep Test calibration débutants — commit 74a0d56
  - calcE1RMFrom5RepTest() dans engine.js (Brzycki × 0.85)
  - Carte calibration dans GO idle si cold start + skipPRs profile
  - saveFiveRepTest() → stocke dans db.exercises[name].shadowWeight
- [x] TÂCHE 13 : Streak intelligent (calcSmartStreak) — commit 0ae4e93
  - Ne se casse que sur jours de séance prévus ratés
  - Jours de repos ignorés dans le compte
- [x] TÂCHE 14 : Badges de compétence (5 nouveaux) — commit c853153
  - precision_rpe, tempo_master, consistency_king, pr_hunter, volume_beast
  - Section "Compétence" ajoutée dans l'UI badges
- [x] TÂCHE 16 : Churn detection + réactivation — commit f396aa1
  - detectChurn() : médiane intervalle × 2 = seuil absence
  - Message empathique dans Coach Today selon durée d'absence

### PHASE 5 — Post-lancement
- [x] TÂCHE 15 : Notifications J1→J30 — commit 49562b3
  - NOTIFICATION_SCHEDULE (6 waypoints), calcWeeklyTonnage(), checkScheduledNotifications()
  - Appelée depuis postLoginSync() après login, 1 notif max/jour
  - db.user.onboardingDate défini dans obFinish()
- [x] TÂCHE 17 : Health Connect / Garmin CSV + RHR analysis — commit d925a42
  - ÉTAPE A : UI Health Connect dans renderSettingsProfile()
  - ÉTAPE B : connectHealthConnect(), showGarminCSVImport(), parseGarminCSV(), analyzeRHR()
  - ÉTAPE C : alerte RHR dans analyzeAthleteProfile() → engine.js
  - ÉTAPE D : RHR penalty dans wpComputeWorkWeight() (-5% warning, -20% danger)
  - Supabase migration needed : non (données dans db.rhrHistory via sbd_profiles)
- [x] TÂCHE 18 : Bluetooth FC live GO — commit 25d4d32
  - toggleBluetoothHR() : Web Bluetooth API (Chrome Android)
  - updateHRDisplay() : bpm + % FCmax + indicateur "Prêt"
  - Widget FC sous le timer de repos pendant la séance
- [x] TÂCHE 19 : Weight Cut module — commit 1e128eb
  - WEIGHT_CUT_COEFFICIENTS : bench×1.5, squat×1.0, deadlift×0.5
  - calcWeightCutPenalty() : LPF basé sur % perte de poids corporel
  - getWeightCutWeek(), detectMuscleLoss(), getWeightCutAlerts() → engine.js
  - Pénalité intégrée dans wpComputeWorkWeight() après RHR, avant APRE cap
  - Section Weight Cut dans analyzeAthleteProfile() (progrès + alertes)
  - UI Réglages : toggle + saisie poids + barre de progrès + date compétition
  - toggleWeightCut() / saveWeightCutData() CRUD → app.js
  - Supabase migration needed : non (données dans db.user.weightCut via sbd_profiles)

- [x] FEATURE Activités Secondaires : Total Load Management — commit 5ef1632
  - ACTIVITY_SPEC_COEFFICIENTS (11 types) + RECOVERY_ACTIVITIES + ACTIVITY_TRIMP_THRESHOLDS
  - calcActivityTRIMP() : TRIMP = durée × RPE × C_spec (trail bonus dénivelé)
  - getRecoveryBonus() : yoga/pilates hier → +5% Readiness dans SRS
  - getActivityPenaltyFlags() : volume/shoulder/warning flags selon TRIMP 24h
  - getDominantTrainingMode() + checkSwimmingInterference() → analyzeAthleteProfile()
  - wpComputeWorkWeight() : -3% si charge secondaire lourde (≥400 TRIMP)
  - computeSRS() : recoveryBonus + forceActiveRecovery si ACWR > 1.6 ou TRIMP critique
  - renderCoachTodayHTML() : carte '⚡ Budget Récupération' (barre empilée muscu/activités)
  - calcTRIMPFromGarminZones() : mapping zones FC Garmin → TRIMP
  - SW v128

### Gemini Q4.1 — Features critiques
- [x] FEATURE 1 : Transparence algorithmique (ℹ️ Pourquoi ce poids ?) — commit 64b9fe9
  - explainWeight() : breakdown phase %, RPE trend, sleep/RHR/WC/cycle penalties
  - Bouton ℹ️ dans chaque carte exercice GO, à côté de l'e1RM
- [x] FEATURE 2 : Substitution d'exercice intelligente — commit 64b9fe9
  - getSubstitutes() : même groupe musculaire, ratio transfer matrix
  - showSubstituteMenu() : modal avec % équivalence + charge adaptée
  - substituteExercise() : remplace in-session, flag isSubstituted (e1RM protégé)
  - goReplaceExercise() → utilise le menu smart (fallback recherche manuelle)
- [x] FEATURE 3 : Trophées sociaux / Écran célébration PR — commit 64b9fe9
  - checkAndShowPRCelebration() : détecte nouveaux PRs à la finalisation
  - showPRCelebration() : écran 🏆 avec gain + bouton partage social
  - sendLocalNotification() avec détail du PR
  - SW v127

## ✅ SESSION NUIT — Audit Ultra-Complet v128 + Implémentations (mai 2026)
- SW : v128 → **v129** (6 commits)

### B1 — Bug fixes critiques ✅ — commit 94e5968
- `_getWeekStart()` dupliqué (app.js l.13924 écrasait l.3017) — cassait m_consistency challenge
- `isCreator()` vérifie uniquement `db.user.isCreator === true` (supprimé check nom hardcodé)
- Migration one-shot Aurélien → powerbuilding supprimée
- Guard `typeof Chart !== 'undefined'` ajouté dans 4 fonctions de rendu graphique

### B2+B3 — TRIMP Force + HRV z-score dans SRS ✅ — commit f1a171d
- `calcWeeklyTRIMPForce()` : Σ reps×RPE²×C_slot (Foster 2001 adapté powerbuilding)
- `calcHRVZScore()` : z-score HRV sur 7j depuis rhrHistory[].hrv
- Pondération dynamique SRS : avec HRV → ACWR 40% + HRV 30% + Read 15% + Trend 15%
- Zones ACWR powerbuilding : 0.8-1.2 optimal, 1.2-1.4 overreach tolérable, >1.5 danger

### B4 — Arbre de décision plateau ✅ — commit 0face3e
- `classifyStagnation(liftType)` : 4 branches (sur_atteinte/fatigue/consolidation/plateau_reel)
- Intégré dans `analyzeAthleteProfile()` section 7 "Analyse Progression SBD" pour SBD

### B5 — TDEE Katch-McArdle ✅ — commit 043a5bd
- `calcTDEEKatchMcArdle(bw, fatPct, activityFactor, weeklyTRIMP)` dans engine.js
- Activé si `db.user.fatPct` disponible (priorité sur Mifflin-St Jeor)

### B6 — Guards console.log ✅ — commit a11ab99
- Migration STORAGE_KEY conditionné derrière DEBUG
- generateWeeklyPlan : condition DEBUG inversée corrigée (loggait en prod)

### B7 — DB maintenance ✅ — commit 3b98c2a
- `db.user.fatPct` (null) dans defaultDB() + migration migrateDB()
- Note : `_realLevel` est write-only (écrit dans validateUserLevel() mais jamais relu)
  → À connecter lors TÂCHE 20 pour adapter contenu selon niveau réel

### B8 — Guards Premium (audit) ✅
- TÂCHE 20 non encore implémentée — toutes features accessibles
- `coachProfile` contrôle verbosité seulement (pas paywall)

### Audit RLS (A4) — NE PAS MODIFIER
- ✅ Toutes 17 tables ont rowsecurity=true
- ℹ️ Quelques tables avec roles={public} pour write — sécurité via WITH CHECK
- ℹ️ SELECT ouverts sur tables sociales (challenges/leaderboard/reactions) — intentionnel

## ✅ SESSION — Cohérence Algorithmique v129 → v130 (mai 2026)
- SW : v129 → **v130** (5 commits)

### FIX 1+5 — Hard Cap + Kill Switch + Cold Start Guard ✅ — commit a556516
- `isE1RMStabilized(exoName)` : vrai si ≥3 sessions de l'exercice dans db.logs
- Hard Cap : `baseWeight ≤ e1rmRef × 1.025` arrondi à 2.5kg (après toutes pénalités)
- Kill Switch : si pénalités cumulées < 70% → return `{forceActiveRecovery:true}`
- Pénalités physiologiques (sommeil/RHR/cycle/activité) skippées jusqu'à stabilisation

### FIX 2+3 — TRIMP Force normalisé + HRV robuste ✅ — commit a3499c7
- `calcWeeklyTRIMPForce` : divisé par 15 (alignement échelle Bannister cardio)
- `calcChronicTRIMPForce` : divisé par 60 (weekly avg ÷15)
- `calcHRVZScore` : exige minimum 7 lectures HRV (était 3), lit 10 entrées, z capé ±3

### FIX 4 — classifyStagnation amélioré ✅ — commit 98d5330
- Sur-atteinte : seuil continu `trend<-0.03` ou `trend<-0.015+rpe>9.5` (peak) / `rpe>9.0`
- Nouveau cas `monitoring` entre consolidation et plateau_reel
- Seuils élargis à 0.01 (était 0.005) pour détection réaliste

### FIX 6 — Weight Cut 14j moving average ✅ — commit ac7218b
- `getSmoothedBodyWeight()` : moyenne des `weeklyLogs[].weight` sur 14 jours
- `calcWeightCutPenalty()` utilise poids lissé (plus de faux positifs rétention hormonale)

## ✅ SESSION — DUP Registres e1RM Séparés v130 → v131 (mai 2026)
- SW : v130 → **v131** (6 commits)

### DUP ÉTAPE A — Getters/Setters zones + Tethering ✅ — commit 8c35b67
- `getDUPZone(reps)` : force≤5, hypertrophie 6-12, vitesse≥13
- `getZoneE1RM(exoName, zone)` : lit zones[zone].e1rm, fallback legacy e1rm
- `setZoneE1RM(exoName, zone, e1rm)` : initialise zones si absent, met à jour, tethering auto
- `applyDUPTethering()` : Force/Hypertrophie ne divergent pas >15%
- `getActiveZoneForPhase()` : map phase→zone (force/intensification/peak→force, autres→hypertrophie)

### DUP ÉTAPE B — Migration one-shot ✅ — commit 281243d
- `migrateDUPRegisters()` : dérive zones e1rm depuis 30j de logs (Brzycki par zone)
- Ratios fallback : hypertrophie=0.94×force, vitesse=0.88×force
- `db._dupMigrated` : flag anti-rejeu, appelé depuis init() après loadDB

### DUP ÉTAPE C+D — wpComputeWorkWeight zone-aware ✅ — commit 284f3f8
- History filtrée par zone rep-range (force:1-5, hypertrophie:6-12), fallback all-sets
- `e1rmRef` lit `getZoneE1RM()` pour Hard Cap zone-spécifique
- `setZoneE1RM()` appelé après history build pour persister le e1rm calculé

### DUP ÉTAPE E — Trend zone-aware ✅ — commit 4d9e306
- `getE1RMTrendByZone(liftType, days, zone)` : filtre sets par zone avant calcul tendance
- `classifyStagnation()` utilise zone-trend (phase matchée) avec fallback trend global

### DUP ÉTAPE F — Profil Neuromusculaire ✅ — commit 1bbde0c
- Section 8 dans `analyzeAthleteProfile()` : ratio Force/Hypertrophie par exercice SBD
- `>1.15` → profil neurologique (recommande GPP) ; `<1.02` → profil endurance (recommande intensification)

## ✅ SESSION — LP 3-Strikes + Cold Start RPE5 v131 → v132 (mai 2026)
- SW : v131 → **v132** (2 commits)

### LP ÉTAPE A — Fonctions algo dans engine.js ✅ — commit 704c86c
- `LP_CONFIG` : 3 strikes, -10% deload, DOTS seuil M=250/F=180, 12 semaines max, incréments gender-aware
- `isInLP()` : vérifie lpActive + DOTS total < seuil + durée < 12 semaines
- `recordLPFailure()` : strike1→retry, strike2→deload, strike3→transition APRE (lpActive=false)
- `getLPIncrement()` : 2.5kg (homme lourd), 1.25kg (femme/homme léger), 0.5kg (isolation)
- `calcStartWeightFromRPE5Test()` : Brzycki × 0.70 pour démarrage LP
- `getLPBienEtreProgress()` : LP en reps (8→12) pour yoga/senior/reeducation, puis incrément 1.25kg

### LP ÉTAPE B — Cold Start RPE5 card + Intégration app.js ✅ — commit (ce commit)
- `buildColdStartRPE5Html()` : carte protocole 10 reps RPE5 pour débutant/senior/reeducation
- Affichée dans `buildGoIdleHtml()` si cold start + profil débutant + pas de PRs déclarés
- `defaultDB()` : `lpActive: true, lpStrikes: {}` ajoutés
- Migration : `lpActive` initialisé à `(logs.length < 24)`, `lpStrikes` initialisé à `{}`

### LP ÉTAPE D — Bloc LP dans wpComputeWorkWeight() + détection échec ✅ — commit (ce commit)
- Bloc LP pris en priorité sur l'ancien `isBeginnerMode`
- Strike 0 → +incrément, Strike 1 → retry, Strike 2+ → deload -10%
- `goFinishWorkout()` : RPE ≥ 9.5 sur dernier work set → `recordLPFailure()` + toast

## ✅ SESSION — RGPD + Sport/Coaching Fixes v132 → v134 (mai 2026)
- SW : v132 → **v133** → **v134** (9 commits)
- Score Gemini : 9.2 → **9.5/10**
- Audit complet : `audit/11-v134-complete.md` (34/34 algo tests, 15 screenshots, 0 bugs critiques)

### PRIORITÉ 1 — Consentement santé Art. 9 RGPD ✅ — commit rgpd-1
- `showConsentModal()` : overlay explicite santé (FC, HRV, menstruel) avec grant/refuse
- `grantHealthConsent()` / `revokeHealthConsent()` : maj db.user.consentHealth + date
- `checkRequiredConsents()` : appelé depuis postLoginSync(), timeout 600ms
- `renderRGPDSection()` : statut consentement + bouton export + zone danger dans Réglages

### PRIORITÉ 2 — IndexedDB Backup + Session Recovery ✅ — commit rgpd-2
- `initWorkoutIDB()` : ouvre `sbd-hub-backup` IDB, store `workout`
- `backupWorkoutToIDB()` : appelé depuis goAutoSave() — snapshot mid-session
- `restoreWorkoutFromIDB()` + `clearWorkoutIDB()` : restore si backup < 4h, clear après finish
- `checkWorkoutBackup()` : proposé en modal, appelé depuis postLoginSync() + TOKEN_REFRESHED

### PRIORITÉ 3 — Suppression compte Art. 17 ✅ — commit rgpd-3
- `requestAccountDeletion()` : double confirmation → RPC `delete_user_complete_data` → signOut
- Bouton "Zone Danger" dans renderRGPDSection()

### PRIORITÉ 4 — Export données Art. 20 ✅ — commit rgpd-4
- `exportUserData()` : JSON blob (profil, logs, exercices, body, rhrHistory, weeklyLogs)
- Téléchargement automatique `trainhub-export-YYYY-MM-DD.json`

### PRIORITÉ 5 — CSP enforcement ✅ — commit rgpd-5
- `<meta http-equiv="Content-Security-Policy" ...>` dans index.html
- Correction BUG 2 : `Report-Only` ignoré via meta → changé en enforcement
- Politiques : default-src 'self', script-src unsafe-inline + cdn.jsdelivr.net, connect-src Supabase

### FIX 1 — Rest Times PCr (engine.js) ✅ — commit fix-rest
- `getOptimalRestTime(weight, e1rm, slot)` : 300s/240s/180s/90s selon % e1RM
- Seuils : >90%=5min (PCr complet), >80%=4min, >70%=3min, isolation=90s
- Intégré dans `wpGeneratePowerbuildingDay()` avec calcul e1RM par zone

### FIX 2 — Volume Spike Detection ✅ — commit fix-rest (engine.js groupé)
- `detectVolumeSpike()` : +15%/week threshold par groupe musculaire (7j vs 7j précédents)
- Alertes injectées dans `analyzeAthleteProfile()` section fatigueAlerts

### FIX 3 — Tapering Auto (Jordan/compétiteur) ✅ — commit fix-rest (engine.js groupé)
- `TAPERING_PROTOCOL` : S3×1.0, S2×0.70 (singles/doubles), S1×0.40 RPE 6-7
- `getTaperingWeek()` : lit `db.user.weightCut.competitionDate`
- `getTaperingFlatAdjustment()` : J-7 + SRS<65 → +15% glucides
- CoachsNote tapering injectée dans wpGeneratePowerbuildingDay()

### FIX 4 — Momentum + Mental Recovery ✅ — commit fix-momentum
- `detectMomentum()` : 2+ PRs en 7j → 65% proba new PR (carte verte dans Coach Today)
- `getMentalRecoveryPenalty()` : -3% baseWeight si dernier set isAbandoned ou RPE≥10
- Pénalité mentale dans wpComputeWorkWeight() après cycle penalty, avant hard cap
- Carte momentum cachée si mode silencieux

### BUG FIX — Stack overflow generateWeeklyPlan ✅ (audit)
- Guard `_renderProgramBuilderInProgress` dans renderProgramBuilderView() — rompt récursion mutuelle

### Audit v134 — Résultats ✅
- Phase A (code) : syntaxe OK, 0 doublon, 0 log non gardé, 0 donnée hardcodée
- Phase B (visuel) : 15 screenshots 390px — 0 NaN, 0 undefined, 0 erreur JS réelle
- Phase C (algo) : 34/34 assertions vertes (FIX 1-4, DUP, LP, Activités, RGPD)
- Findings non-bloquants : F1 program.js SW (déjà présent), F2 _realLevel write-only, F3 fatPct absent UI
- SW bumped : v132 → v133 (FIX 1-4) → **v134** (audit)

## ✅ SESSION — Fixes Audit Final Gemini v134 → v135 (mai 2026)
- SW : v134 → **v135** (8 commits)

### FIX 1 — Plate Calculator + Bar Weight Setting ✅
- `calcPlates(targetWeight, barWeight)` + `formatPlates()` dans engine.js
- `isBarbellExercise()` : détection regex (squat/bench/deadlift/barre/SDT)
- `renderGoExoCard()` : affichage galettes inline sous e1RM pour exercices barre
- `saveBarWeight()` + select dans renderSettingsProfile() (20/15/10/5kg)
- `defaultDB` + `migrateDB` : `db.user.barWeight = 20`

### FIX 2 — Return-to-Play après absence > 7j ✅
- `getAbsencePenalty()` dans engine.js : -8%/j7, -15%/j10, -18%/j14
- Intégré dans `wpComputeWorkWeight()` après mental penalty
- Carte info bleue dans `renderCoachTodayHTML()` si absence détectée

### FIX 3 — APRE bloqué pendant Weight Cut ✅
- `wpComputeWorkWeight()` : cap baseWeight à 98% e1RM si weightCut.active
- Empêche la progression APRE pendant la perte de poids (anti-yoyo LPF)

### FIX 4 — Cold Start e1RM reference guard ✅
- `shouldRecordE1RMAsReference()` : false si cold start + sommeil≤2 ou readiness≤1
- `goFinishWorkout()` : tag `session.skipColdStartRef = true` si état insuffisant
- `wpComputeWorkWeight()` : filtre sessions skipColdStartRef de l'historique

### FIX 5 — RPE Dissonance Detection ✅
- `detectRPEDissonance(rpe, restSec)` dans engine.js
- `goToggleSetComplete()` : timestamp `set._completedAt`, calcul repos réel vs RPE déclaré
- Toast si RPE≤7 + repos>4min (sous-estimation) ou RPE≥9 + repos<2min (surestimation)

### FIX 6 — Notification J6 rétention débutant ✅
- Entrée J6 ajoutée dans `NOTIFICATION_SCHEDULE` avec `profileFilter:'debutant'`
- `checkScheduledNotifications()` : filtre `profileFilter` vs `db.user.obProfile`

## ✅ SESSION — Cartes de Partage + Waitlist v136 → v137 (mai 2026)
- SW : v136 → **v137** (4 commits)

### FEATURE 1 — Cartes de Partage ✅
- `generateShareCard(session)` dans engine.js : collecte PRs, mainLifts, tonnage hors warmup
- `renderShareCardHTML(cardData)` : carte 340px dark gradient (doré si PR, bleu sinon)
- `showShareModal(session)` : overlay modal avec carte + bouton télécharger
- `downloadShareCard()` : html2canvas chargé à la demande, scale:2 haute résolution
- `goFinishWorkout()` : toast "Partager ta séance" si hasPR ou tonnage > 2t (délai 3.5s)

### FEATURE 2 — Waitlist Page ✅
- `index.html` : section `#waitlist-page` (dark gradient, stats, form email/profil, features clés)
- `checkWaitlistRoute()` : détecte `#waitlist` ou `?waitlist` — skip app init, affiche waitlist
- `submitWaitlist()` : insert Supabase `waitlist` table, gère erreur 23505 (doublon email)
- `init()` : `checkWaitlistRoute()` en premier
- ✅ **Migration Supabase appliquée** : table `waitlist` créée (RLS activée, policy `waitlist_anon_insert`)

## ✅ SESSION — Warm-up Generator + Accessibilité + i18n v135 → v136 (mai 2026)
- SW : v135 → **v136** (3 commits)

### FEATURE 1 — Warm-up Generator ✅
- `WARMUP_PROTOCOL_HEAVY` (feeler set 87%) / `WARMUP_PROTOCOL_VOLUME` (économie énergie) dans engine.js
- `WARMUP_ACTIVATION` : drills spécifiques squat/bench/deadlift
- `generateWarmupSets(workWeight, e1rm, liftType, isEarlyMorning)` : paliers par intensité
  - ≥80% e1RM → protocole heavy avec feeler set
  - Séance matinale (<10h) → cardio 5min ajouté
  - Ne dépasse jamais le poids de travail
- `wpGeneratePowerbuildingDay()` : `mainExoObj.warmupSets = generateWarmupSets(...)`
- `renderGoExoCard()` : bloc Activation (drills) + checklist paliers avant le tableau des séries
- `toggleWarmupSet()` : `warmupCompleted[i]` persisté dans activeWorkout, non loggé

### FEATURE 2 — Accessibilité ✅
- **Icônes daltonisme** : `_SEVERITY_ICONS` (🚨⚠️✅ℹ️) ajoutées à toutes les alertes Diagnostic Athlétique
- **Touch targets 48px** : `.go-check-btn` CSS 30→48px (index.html)
- **ARIA labels** : `aria-label` sur inputs poids (kg/lbs), répétitions, bouton valider série
- **Consentement médical** : case obligatoire dans ob-step-7 avant `obFinish()`
  - `db.user.medicalConsent + medicalConsentDate` persistés
  - `obFinish()` bloque si case non cochée

### FEATURE 3 — Unités kg/lbs ✅
- `toDisplayWeight(kg)` / `toDisplayWeightLabel()` / `fromDisplayWeight(val)` dans engine.js
- `getPlatesSet()` : retourne PLATES_US_LBS ou PLATES_EU_KG selon db.user.units
- Toggle kg/lbs dans renderSettingsProfile() (section Équipement & Unités)
- `setWeightUnit(unit)` : sauvegarde + refresh settings
- `renderGoExoCard()` : colonne KG/LBS dynamique, display/store conversion via fromDisplayWeight
- `goUpdateSetValue()` : fromDisplayWeight() appliqué pour le champ weight
- `defaultDB` + `migrateDB` : `db.user.units = 'kg'`, `medicalConsent`, `medicalConsentDate`

## ✅ SESSION — Audit + Optimisations v138 → v139 (2 mai 2026)
- SW : v138 → **v139**

### TÂCHE 1 — Branches non-mergées : analyse complète ✅
Toutes les 5 branches basées sur codebase du 25 avril 2026 (17k lignes vs 21k en main).
Pas de merge base commun → merge git impossible (168+ conflits sur app.js seul).
**Toutes les améliorations utiles sont déjà dans main :**
- `fix-ux-audit-issues` : forme score guard ✓ (l.11530), title chooser guard ✓ (l.5889), pills scrollable ✓ (CSS), rangs SBD conditional ✓ (l.6030)
- `fix-social-tab-loading` : `_getWeekStart` unique ✓ (l.3270), dead functions déjà supprimés (TÂCHE 8)
- `add-muscle-badges` : nécessite `assets/badges/*.png` (manquants) + `computeMuscleTonnage()` — **reporter à future session avec assets**
- `feed-program-modulable` : Feed V2 complexe, trop divergent — **reporter à future sprint**
- `audit/dead-functions-backup` : dead code déjà supprimé (TÂCHE 8)

### TÂCHE 2 — Optimisation chargement Social tab ✅
- `supabase.js` : `_socialLastInit` throttle 30s dans `initSocialTab()`
- Évite re-fetch Supabase à chaque switch vers onglet Social
- Patterns `refreshUI()` + `showTab()` déjà optimisés (render active tab only)

### TÂCHE 3 — Splash screen + 404 ✅ (déjà implémentés)
- Splash `#splashScreen` : déjà en index.html (l.1901), fade-out après 1s (l.3289)
- Route inconnue : déjà gérée dans `_restoreTab()` (l.2556) — fallback vers tab-dash

### TÂCHE 4 — Screenshots audit supprimés du repo ✅
- 130 fichiers supprimés (audit/screenshots/**)
- `.gitignore` mis à jour : `audit/screenshots/`

## ✅ SESSION — Beta Tester Simulation v137 → v138 (2 mai 2026)
- SW : v137 → **v138** (1 fix)

### Bug fix : Waitlist route override par showLoginScreen ✅
- `supabase.js` : `showLoginScreen()` — guard `window.location.hash === '#waitlist'`
- Cause : `onAuthStateChange(SIGNED_OUT)` appelait `showLoginScreen()` qui s'affichait par-dessus `#waitlist-page`
- Audit Playwright : `audit/12-beta-tester-simulation.md`, 50 screenshots, 18 tests ✓
- Score : 9.5 → **9.6/10**

## ✅ SESSION — Activités Secondaires Refactor + Gamification v141 → v143 (mai 2026)
- SW : v141 → v142 → **v143** (8 commits A + 3 commits B + 4 commits FIX)

### A — Activités Secondaires (8 fixes)
- `ACTIVITY_KEY_MAP` : mapping EN→FR (swimming→natation, running→course, etc.) dans engine.js
- `sanitizeActivity()` : normalise string/object → objet uniforme avec type FR
- `calcActivityTRIMP()` : appelle sanitizeActivity() pour tolérer les clés EN
- `natation.intensityThreshold` : 6 → 3 (repos actif même à faible intensité)
- `getActivityHeavyThreshold()` : seuil adaptatif DOTS<250→300, 250-400→450, ≥400→600
- `getSecondaryTRIMPLast24h()` : lit d'abord activityLogs (réel), puis activityTemplate (planifié)
- `migrateActivityData()` : fusionne secondaryActivities + activities → activityTemplate
- DB guards : activityLogs[], activityTemplate[], earnedBadges{}, _ghostLogAnswered, xpHighWaterMark

### B — Gamification (3 fixes)
- Badges permanents (`badgeType:'achiever'`) vs statut (`badgeType:'status'`, re-évalués)
- `checkAndAwardBadges()` : achiever skip si déjà gagné, status update active flag
- XP high-water mark (`db.gamification.xpHighWaterMark`) : XP ne peut que monter
- `consistency_month` + `weekly_warrior` : nouveaux badges status re-évalués

### FIX (4 corrections post-audit Gemini)
- Seuil adaptatif `getActivityHeavyThreshold()` via DOTS (FIX 1)
- One-tap activity log via pills dans la carte succès (FIX 2)
- Ghost log : confirmation matin des activités d'hier non loggées (FIX 3)
- Badges permanents/status + XP high-water mark (FIX 4)

## ✅ SESSION — Review Complète Claude Code + Blockers v143 → v144 (mai 2026)
- SW : v143 → **v144** (4 commits)
- Audit complet : `audit/15-complete-beta-review.md` (score 6.5/10 → v143)

### BLOCKER 1 — Doublon showPRCelebration ✅ — commit 76cb320 + dc707f6
- Identifié : 2 définitions JS (l.22190 et l.22253) → JS last-write-wins → ancienne version écrasait la nouvelle
- Fix : renamed → deleted `_showLegacyPRCelebration` + `dismissPRCelebration`
- CSV import caller mis à jour : `showPRCelebration([{name,value,prev,gain}],'import')`
- Toutes les célébrations PR passent maintenant par la version modale avec activity tags + partage

### BLOCKER 2 — Auto-générer weeklyPlan au J1 ✅ — commit 76cb320
- Ajout dans init sequence (après migrations) : si `onboarded + programParams.freq + !weeklyPlan` → `generateWeeklyPlan()`
- Empêche l'écran "Comment créer ton programme ?" pour un utilisateur onboardé sans plan

### FIX 3 — Console.log : FALSE POSITIVE ✅ (aucune modification)
- 7 console.log détectés par grep sont TOUS dans des blocs `if (DEBUG)` multi-lignes :
  - `calcStreak` : `var DEBUG = window.DEBUG_STREAK === true; if (DEBUG) { ... }`
  - `generateWeeklyPlan` : `if (typeof DEBUG !== 'undefined' && DEBUG) { ... }`
- Pattern grep `grep -v "if.*DEBUG"` ne filtre que les guards sur la même ligne → faux positif

### FIX 4 — Chart.js local : BLOQUÉ (réseau) 🔴
- CDN `cdnjs.cloudflare.com` et `cdn.jsdelivr.net` bloqués en environnement CI
- **Action manuelle requise** : `curl -o js/chart.min.js https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`
- Puis : remplacer `<script src="https://cdn.jsdelivr.net/npm/chart.js">` par `<script src="js/chart.min.js">` dans index.html
- Puis : ajouter `/sbd-hub/js/chart.min.js` dans `ASSETS_TO_CACHE` du service-worker.js

### FIX 5 — Inputs GO pré-remplis : CONFIRMÉ ✅ (aucune modification)
- `renderGoExoCard()` lines 19123-19124 : `wVal = set.weight`, `rVal = set.reps`
- `_goDoStartWorkout()` lines 18692-18708 : pre-fill sets depuis `weeklyPlan.exercises[].sets`
- Les poids et reps suggérés par l'algo sont déjà dans les inputs au démarrage de séance

### FIX 6 — Galettes rétractables ✅ — commit dc707f6
- `renderGoExoCard()` : "🏋️ Galettes ▾" → tap pour révéler/cacher (display toggle)
- Réduit la pollution visuelle pendant la séance

### FIX 7 — IndexedDB backup : CONFIRMÉ ✅ (aucune modification)
- `goAutoSave()` (l.18060) appelle déjà `backupWorkoutToIDB()` explicitement

## 🔄 En cours / À faire

### PHASE 5 — Reste
- [ ] TÂCHE 9 : Health Connect API native (Supabase Edge Functions, attendre validation)
- [ ] TÂCHE 20 : Paywall features Premium
  - Gate : db.user.tier (free/premium/founder)
  - Features à gater : SRS dynamique, APRE avancé, analyzeAthleteProfile complet
  - Exposer db.user.fatPct dans UI Réglages pour Katch-McArdle (F3)

## Migrations Supabase — Historique

### ✅ WAITLIST TABLE — Appliquée le 2 mai 2026
- Table `waitlist` (id, email UNIQUE, profile, created_at)
- RLS activée, policy `waitlist_anon_insert` (INSERT FOR anon WITH CHECK true)

### Migrations historiques
(à appliquer par Claude.ai après chaque tâche)
- TÂCHE 15 (notifications J1→J30) : nécessite table `notification_schedule` en Supabase
  - Colonnes : user_id, day_number (1-30), scheduled_at, sent_at, title, body, type
  - RLS : user peut lire ses propres lignes, Edge Function peut écrire
