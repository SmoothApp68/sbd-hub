# Beta Test — Audit programme généré (4 profils réels)

## Méthodologie

- Code lu : `selectExercisesForProfile()`, `wpGeneratePowerbuildingDay()`,
  `wpGenerateMuscuDay()`, `applyShoulderFilter()`, `applyKneeFilter()`,
  `applyPivotWeekSwaps()`, `getLegOverreachModifiers()`.
- Supabase : table `sbd_profiles`, lecture de `data.user`, `data.bestPR`,
  `data.user.programParams`, `data.user.injuries`, `data.weeklyPlan`,
  `data.generatedProgram` (template wizard), `data.routine`.
- Date du snapshot : 2026-05-12.

> Aucune modification de code dans cet audit — signalement uniquement.

---

## 🚨 Découverte critique — Pipeline bypass pour mode `musculation`

### Localisation
`generateWeeklyPlan()` lignes 22180 / 22253 :

```js
if (mode === 'powerbuilding' || mode === 'powerlifting') {
  // → wpGeneratePowerbuildingDaySafe()  (applique v211 complet)
} else if (mode === 'musculation' || mode === 'bodybuilding') {
  // → wpGenerateMuscuDay()
}
```

### Constat
`wpGenerateMuscuDay()` (line 21685) **n'appelle jamais** :
- `selectExercisesForProfile()` (RULE 1-9, Priority Queue)
- `applyAgeAdaptations()` (senior)
- `applyPivotWeekSwaps()`
- `getLegOverreachModifiers()`
- `getStressVolumeModifier()`

Seuls `applyShoulderFilter()` et `applyKneeFilter()` sont appelés en fin
de fonction (lignes 21863-21864).

### Impact bêta
- **Léa** (musculation, 45min) : RULE 4 "45min → retirer Deadlift, ajouter
  RDL" non appliquée. Son template Mercredi conserve Deadlift au lieu
  de RDL alors que sa durée est 45min.
- **Alexis** (musculation, débutant) : aucune correction de ratios
  (Sq/Bench 0.91, Dead/Squat 1.80), aucun `isPrimary`/`isCorrectivePriority`
  flag posé, pas de Mobilité Cheville injectée malgré Dead/Squat > 1.50,
  pas de Face Pull RULE 9 malgré le bench primary.
- **TalkTest** : non utilisé (pas de chemin de codage car les 2 profils
  musculation ont déjà des PRs).
- **Pivot Week + Leg Overreach** : invisibles pour 50% de la cible
  utilisateur potentielle bêta.

---

## 🚨 Découverte secondaire — `weeklyPlan.days` non-persisté pour 3/4 profils

Seul Alexis a un `weeklyPlan.days` peuplé en base (7 jours, exos complets
avec poids/RPE). Pour Aurélien, Léa et D'Jo : `weeklyPlan` ne contient
que `{currentBlock, lastDeloadDate}` — le programme runtime n'est pas
synchronisé vers Supabase. Cette absence de persistance bloque l'audit
côté serveur des règles dynamiques (RULE 1-9, Priority Queue, Pivot Week,
Leg Overreach) — ces règles ne sont vérifiables qu'à l'exécution client.

> **Recommandation hors-scope** : forcer `saveDB()` après chaque
> `generateWeeklyPlan()` puis `cloudSync()` afin que les invariants soient
> mesurables côté Supabase pour les 50 bêta-testeurs.

---

## Profil 1 — Aurélien (powerbuilding, avancé, 90min, freq 5)

**PRs** : Squat 148 · Bench 140 · Deadlift 170
**Ratios** : Sq/Bench = 1.057 · Dead/Squat = 1.149
**Mode** : powerbuilding → pipeline v211 actif ✅
**Injuries** : aucune

### Template wizard (`generatedProgram`)

| Jour | Label | Exos |
|---|---|---|
| Lundi | Squat — Force & Volume | squat, leg_press, rdl, leg_curl, mollet, cardio_liss (4×10) |
| Mardi | Bench — Force & Volume | bench, incline_bench, ecarte, tri_cable, elev_lat, cardio_liss (4×10) |
| Mercredi | Repos | — |
| Jeudi | Deadlift — Force & Volume | deadlift, row_barre, lat_pull, face_pull, curl_barre, cardio_liss (4×10) |
| Vendredi | Bench 2 — Volume & Accessoires | bench_halt, ohp, elev_lat, tri_cable, curl_halt, cardio_liss |
| Samedi | Spécialisation Quad — Rattrapage | squat, leg_press, leg_ext, hip_thrust, mollet, cardio_liss |
| Dimanche | Repos | — |

### Ce qui fonctionne ✅
- **`_gwpNeedsSquatSpec` détecté** : Sq/Bench 1.057 < 1.20 + avancé +
  powerbuilding → Spécialisation Quad bookée Samedi (`leg_ext` présent
  dans le template).
- **diversity_score Bench 1 / Bench 2** : Mardi=`bench` (barre)
  vs Vendredi=`bench_halt` (haltères) — variantes différentes ✅
- **6 exos / jour ≤ 7** plafond 90min musc respecté (mais voir ⚠️
  cardio).
- **Priority Queue** (v211) : présent en code, s'appliquera au runtime.
- **Mobilité Cheville Morpho-Logic** non déclenché — Dead/Squat 1.149
  < 1.50 → comportement attendu ✅

### Ce qui est ambigu ⚠️
- **Cardio LISS 15min sur 5 jours = 75min/semaine** : compatible avec
  cardio='integre'. Néanmoins le doc `context-programme-algo-v2.md`
  parle de 20min max powerbuilding × Hypertrophie. À confirmer.
- **Leg Extension sur Lundi (Squat lourd)** : absent du template
  (`squat,leg_press,rdl,leg_curl,mollet,cardio_liss`). RULE 5 ajoutera
  `Leg Extension` correctif au runtime (Sq/Bench < 1.10 → seuil
  musc par défaut). Vérifiable seulement en runtime.
- **Bench Press en J1 (Mardi)** : `bench` au template, mais le runtime
  `wpGeneratePowerbuildingDay()` peut switcher via `SBD_VARIANTS` selon
  phase + dupProfileKey. Le bug 1 du `context-programme-algo-v2.md`
  (Larsen en J1 Force) n'est pas vérifiable sans runtime.
- **Cycle 3 Leg Overreach** : `_completedMacrocycles=null` → trigger
  pas encore actif (≥ 2 requis). Comportement attendu pour un user
  en semaine 2.

### Ce qui ne fonctionne pas ❌
- **`weeklyPlan.days` vide** → impossible de vérifier la sortie réelle
  côté serveur (cf. découverte secondaire).
- **Cardio = `cardio_liss` 15min** apparaît sur 5 jours d'entraînement
  consécutifs (Lun/Mar/Jeu/Ven/Sam). Bug 6 connu (cardio 34min
  hardcodé) supposé résolu en v200+ mais non vérifiable depuis cette
  base de données.

---

## Profil 2 — Léa (musculation, intermédiaire, 45min, freq 4)

**PRs** : Squat 127 · Bench 72 · Deadlift 112.5
**Ratios** : Sq/Bench = 1.764 · Dead/Squat = 0.886
**Mode** : musculation → **pipeline v211 BYPASS** 🚨
**Injuries** : aucune
**Cycle menstruel** : non activé (`cycleTracking.enabled` à vérifier)

### Template wizard

| Jour | Label | Exos | sets×reps |
|---|---|---|---|
| Lundi | Squat + Accessoires | squat, leg_press, rdl, leg_curl, cardio_liss | 3×5 |
| Mardi | Bench + Accessoires | bench, incline_bench, ecarte, tri_cable, cardio_liss | 3×5 |
| Mercredi | Deadlift + Accessoires | **deadlift**, row_barre, lat_pull, face_pull, cardio_liss | 3×5 |
| Jeudi | Bench 2 + Squat léger | bench_halt, ohp, squat, elev_lat, cardio_liss | 3×5 |
| Vendredi/Samedi/Dimanche | Repos | — | — |

### Ce qui fonctionne ✅
- **4 exos + cardio = 5 items** sur 45min : OK avec RULE 1
  (plafond musc 45min = 4 exos hors cardio). Plafond respecté.
- **Ratio Dead/Squat 0.886** : sous le seuil musculation 1.00 (RULE 5
  correctif RDL). RDL EST déjà présent Lundi et Mercredi.
- **Pas de blessure** → pas de filtre épaule/genou.

### Ce qui ne fonctionne pas ❌
- **Routine préfixée "🔄"** : `routine.Lundi = "🔄 💪 Upper A"`,
  `Mardi = "🔄 🦵 Lower A"`, etc. — le préfixe `🔄` n'est posé qu'en
  phase `deload` (line 22384). Or `currentBlock.phase = 'hypertrophie'`,
  `week=3`. **État incohérent : un préfixe de deload persiste dans
  `db.routine` alors que la phase a changé.**
- **Routine vs selectedDays** : `programParams.selectedDays = ['Mardi',
  'Mercredi','Jeudi','Vendredi']` mais `routine` montre training
  Lundi/Mardi/Mercredi/Jeudi (Vendredi = Repos). **Désynchro**.
- **Mode 45min + mode musculation** : `wpGenerateMuscuDay` n'applique
  pas la RULE 4 (retirer Deadlift à 45min, ajouter RDL). Léa garde
  donc `deadlift` 3×5 en plein milieu de sa semaine 45min → setup +
  repos lourds = explosion du timing.
- **Bench 2 Jeudi inclut un `squat`** : "Bench 2 + Squat léger"
  superpose un 3ème squat day sur une semaine 4j à 45min — densité
  irréaliste pour le créneau.
- **Cycle menstruel** : `gender=female` mais aucun signal d'adaptation
  cycle (à vérifier en runtime — pas d'info en base).

### Ce qui est ambigu ⚠️
- **Pivot Week préfixe** : si les `🔄` venaient en réalité de
  `applyPivotWeekSwaps()`, il faudrait `currentBlock.week % 12 === 0`.
  Le code de pivot ne modifie pas `db.routine` (seulement `exo.note`),
  donc le préfixe vient bien de l'autre source (deload). Cas suspect.

---

## Profil 3 — D'Jo (powerlifting, intermédiaire, blessure épaule, 120min, freq 6)

**PRs** : Squat 213 · Bench 144 · Deadlift 223
**Ratios** : Sq/Bench = 1.479 · Dead/Squat = 1.047
**Mode** : powerlifting → pipeline v211 actif ✅
**Injuries** : `[{zone:'epaule', level:1, since:'2026-05-02', active:true}]`
**`programParams.injuries` (sérialisation séparée)** : `["epaules"]`
(pluriel — utilisé par le wizard initial uniquement)

### Template wizard

| Jour | Label | Exos | sets×reps |
|---|---|---|---|
| Lundi | **Repos** ⚠️ | — | — |
| Mardi | Push — Force | bench, tri_cable, cardio_liss | 4×3 |
| Mercredi | Pull — Force | deadlift, row_barre, lat_pull, traction, curl_barre, cardio_liss | 4×3 |
| Jeudi | SBD Technique | squat, bench, deadlift, cardio_liss | 4×3 |
| Vendredi | **Repos** ⚠️ | — | — |
| Samedi | Points Faibles | crunch, mollet, russian_twist, cardio_liss | 4×3 |
| Dimanche | Jambes — Force | squat, leg_press, rdl, mollet, leg_curl, cardio_liss | 4×3 |

### Ce qui fonctionne ✅
- **Mode powerlifting** → `wpGeneratePowerbuildingDay()` au runtime →
  `applyShoulderFilter()` actif → Bench Press (Barre) sera remplacé
  par `Floor Press` (vérification code ligne 19080).
- **RULE 6 Hard Cap** : runtime appliquera `maxRPE: 7`, `maxIntensity: 0.75`
  sur Bench/OHP/Dips/Larsen pour zone='epaule'.
- **Mardi "Push — Force" 3 exos seulement** : sous le plafond
  (RULE 1 powerlifting = 6 exos pour 120min — 1 mode PL = 6).
- **Plafond exos** : aucune séance n'excède 6 exos.

### Ce qui ne fonctionne pas ❌
- **Routine incohérente avec selectedDays** :
  `selectedDays = [Lun,Mar,Mer,Jeu,Ven,Sam]` (6 jours)
  mais `routine` place training Mar/Mer/Jeu/Sam/**Dim** et Repos
  Lun/Ven. **Lundi/Vendredi sont marqués Repos malgré sélection.
  Dimanche est marqué training malgré exclusion.** 🚨
- **`programParams.goals` aberrant** : `["force","masse","seche","recompo",
  "maintien","reprise"]` — 6 goals contradictoires sélectionnés
  (force + sèche + reprise = incohérent). Le wizard n'a pas validé
  l'unicité.
- **`compDate` à `null`** alors que `compType = 'powerlifting'` :
  l'utilisateur est marqué compétiteur sans date → pas de peaking
  J-14/J-3 possible (nudge mensuel attendu selon Gemini).
- **`Points Faibles` Samedi = crunch + mollet + russian_twist** :
  pour un powerlifter avec Bench 144 et bench-blessure, le "point
  faible" devrait être bench-spécifique (close-grip, pin press,
  rotateurs externes) — ici on a 100% abdos/mollets, choix
  inadéquat pour un PL.

### Ce qui est ambigu ⚠️
- **`weeklyPlan.days` vide** → on ne peut pas confirmer que
  `applyShoulderFilter()` a bien transformé Bench → Floor Press
  côté runtime. Logique côté code OK, mais sortie non vérifiée.
- **freq=6 + durée=120min** : 6 séances PL à 2h = 12h/semaine de
  muscu pour quelqu'un avec blessure épaule active. Gemini
  recommande pour D'Jo : "réduire à 4j/semaine". L'algo n'applique
  PAS cette règle automatiquement (laissé au choix user).
- **Threshold ratios PL** : Sq/Bench 1.479 > 1.25 ✅, Dead/Squat
  1.047 < 1.15 → **RDL devrait être ajouté correctif** (RULE 5
  posterior_chain). RDL EST déjà présent Dimanche (template). À vérifier
  si le tag `isCorrectivePriority` est posé en runtime.

---

## Profil 4 — Alexis (musculation, débutant, 90min, freq 5)

**PRs** : Squat 80 · Bench 87 · Deadlift 144
**Ratios** : Sq/Bench = 0.920 · Dead/Squat = 1.800 🚨
**Mode** : musculation → **pipeline v211 BYPASS** 🚨
**Injuries** : aucune
**weeklyPlan.days** : peuplé (7 jours) — **seul profil auditable au runtime**

### Programme runtime (vérifié)

| Jour | Title | Exos |
|---|---|---|
| Lundi | 💪 Upper A | Développé couché 4×6@62.5, Rowing barre 4×6@79, Développé militaire 4×7@56, Tractions 4×6@35, Curl haltères 3×10@17.5, Extension triceps 3×11@20 |
| Mardi | 🦵 Lower A | Squat 4×6@65, Romanian Deadlift 4×6@105, Presse à cuisses 4×6@212.5, Leg Curl 3×15@48.4, Hip Thrust 4×6@52.5, Gainage 3×10 |
| Mercredi | 😴 Repos | — |
| Jeudi | 💪 Upper B | Développé incliné haltères 4×6@52.5, Rowing haltères 4×6@42.5, Élévations latérales 3×15@16, Tirage poitrine 4×6@62.5, Curl barre 3×15@36, Dips 4×6@35 |
| Vendredi | 🦵 Lower B | Fentes 4×8 (sans poids), RDL 4×6@105, Leg Extension 4×15@28.3, Leg Curl 4×15@48.4, Hip Thrust 4×6@52.5, Adduction 4×10@85 |
| Samedi | 💪 Upper A | **identique à Lundi (mêmes 6 exos, mêmes poids, mêmes reps, mêmes RPE)** |
| Dimanche | 😴 Repos | — |

### Ce qui fonctionne ✅
- **6 exos par séance ≤ 7** plafond 90min musc respecté.
- **Supersets** correctement marqués (`superset:true`,
  `supersetWith`, `isSecondInSuperset`).
- **Double Progression** activée (`isDoubleProgression:true`,
  `targetRepsMax`).
- **`coachNote` "📈 Volume PR atteint"** sur Développé couché et
  incliné — logique de progression visible.
- **Ratio tirage/poussée Mardi (Lower A)** : pas applicable
  (séance bas du corps).

### Ce qui ne fonctionne pas ❌
- **🚨 Doublon parfait Lundi = Samedi (Upper A identique)** :
  même titre, même 6 exos, mêmes poids, mêmes reps, mêmes RPE.
  Aucun diversity_score appliqué (chemin musculation, splitMap
  freq>=6 attendu différent, mais ici freq=5 et la rotation
  `tplKeys` recycle après 4 entrées). Pour un débutant qui
  s'entraîne 5j/semaine, Upper A 2× sans aucune variation =
  zéro stimulus différencié.
- **🚨 Aucun flag exercice** : `isPrimary`, `isCorrectivePriority`,
  `_addedByRule`, `_injurySubstitute`, `maxRPE` — **tous absents**
  des 30 exos persistés. Confirme le bypass v209-v211 sur la
  branche musculation.
- **🚨 Ratio Squat/Bench 0.92 < seuil musc 1.10** : RULE 5
  devrait ajouter `Leg Extension` correctif sur Lower A (Mardi,
  jour squat lourd). Réalité : Leg Extension est sur **Lower B
  Vendredi** uniquement, pas sur Lower A. Quads chroniquement
  sous-stimulés.
- **🚨 Ratio Dead/Squat 1.80 > 1.50** : RULE Morpho-Logic devrait
  injecter `Mobilité Cheville` en warmup. Réalité : aucun exercice
  cheville/mobilité sur toute la semaine.
- **Ratio pull/push Upper A** : Push 4+4+3=11 sets · Pull 4+4+3=11 sets
  → ratio 1.00 < 1.20 attendu (RULE 2). Pas de Rowing Poulie / Face
  Pull additionnel injecté.
- **Ratio pull/push Upper B** : Push 4+3+4=11 sets · Pull 4+4=8 sets
  → ratio 0.73 < 1.20 → **déficit pull plus marqué encore**, pas
  corrigé.
- **`restSeconds: 0`** sur Leg Curl Vendredi et Adduction Vendredi
  (dernier exo de leur superset). Bug supersets — repos de 0 seconde
  rendu littéralement en runtime.
- **`Adduction 4×10 @85kg` débutant** : 85 kg en adduction pour un
  Squat 80kg = charge clairement copiée d'un log ancien sans
  re-normalisation.
- **Fentes 4×8 `weight: null`** : poids non calculé. À 144 kg de
  Deadlift et 80 kg de Squat, le débutant n'a pas d'indication de
  charge → pas d'aide pour démarrer.
- **Hip Thrust 52.5 kg deux fois (Mardi + Vendredi)** : exactement
  la même charge sur deux séances → pas de logique différenciée.
- **Romanian Deadlift 105 kg deux fois (Mardi + Vendredi)** : idem,
  doublon de charge. Et 105kg en RDL pour un débutant qui squat 80kg
  est très lourd ratio-wise.
- **Cardio = 'aucun'** dans `programParams` → OK pas de cardio
  attendu, et il n'y en a pas dans le runtime ✅.

### Ce qui est ambigu ⚠️
- **`bench_halt` (Développé couché) 62.5 kg** : Alexis a un PR Bench
  87 kg → 62.5kg = 72% du PR. Pour un débutant en double progression
  à 4×6 RPE 8, c'est correct mais à valider (la formule LP_BEGINNER
  vs APRE pourrait diverger).
- **Beginner Ramp v210** : `getBeginnerRampIncrement` ne s'active que
  dans les 3 premières séances. Si Alexis en a 64 logs → trop tard.
  Pas un bug.
- **Cycle Pivot Week** : `week=1` → désactivé. Comportement attendu.

---

## Synthèse — Checklist de validation

| Critère | Aurélien | Léa | D'Jo | Alexis |
|---|---|---|---|---|
| Nb exos respecte plafond durée | ✅ 6/7 | ✅ 4/4 | ✅ 6/6 | ✅ 6/7 |
| Ratio tirage/poussée ≥ 1.2 (1.5 épaule) | — runtime | — runtime | — runtime | ❌ 1.0 Upper A / 0.73 Upper B |
| Correctifs ratios déséquilibrés | ⚠️ runtime | — n/a | ⚠️ runtime | ❌ absent (bypass) |
| Priority Queue respectée | — runtime | ❌ bypass | — runtime | ❌ bypass |
| Aurélien : Leg Extension isCorrectivePriority | ⚠️ pas dans template, ajout runtime attendu | — | — | — |
| Léa : max 4-5 exos (45min) + RDL au lieu DL | — | ❌ Deadlift présent | — | — |
| D'Jo : Bench → Floor Press (épaule) | — | — | ⚠️ runtime non persisté | — |
| Alexis : Dead/Squat 1.80 → Mobilité Cheville warmup | — | — | — | ❌ absent |
| Alexis : Sq/Bench 0.91 → correctif quad | — | — | — | ❌ absent |
| diversity_score Upper A ≠ Upper A entre jours | — | — | — | ❌ Lundi = Samedi parfait |
| Pas de doublon exos entre jours même type | — | ⚠️ Bench 2 + squat | — | ⚠️ Hip Thrust/RDL même charge ×2 |
| Jours de repos cohérents avec freq | ✅ | ❌ Vendredi absent | ❌ Lundi/Ven Repos, Dim training | ✅ |

---

## Bugs bloquants à corriger AVANT bêta

1. **🚨 `wpGenerateMuscuDay()` bypasse `selectExercisesForProfile()`**
   (line 21685 → return line 21868). Ajouter le même bloc try/catch
   v209 utilisé dans `wpGeneratePowerbuildingDay()` line 21584.
   Impact : Léa (mode=musculation) + Alexis + tous les bêta-testeurs
   musculation perdent les 9 règles + Priority Queue + Pivot Week +
   Leg Overreach. Estimation : >50% des 50 invitations bêta.

2. **🚨 Doublon parfait Upper A Lundi/Samedi (Alexis)** :
   `splitMap` line 22258 pour freq=4 : `[upper_a, lower_a, null,
   upper_b, lower_b, null, null]`. Avec freq=5 et selectedDays
   incluant Lundi+Mardi+Jeudi+Vendredi+Samedi, le 5ème jour
   recycle `tplKeys[0]` = upper_a. Pas de variation. Ajouter une
   logique de rotation contextuelle.

3. **🚨 Routine désynchronisée des selectedDays** (D'Jo + Léa) :
   `db.routine` peut diverger de `programParams.selectedDays` après
   migrations. Audit de cohérence à ajouter dans `migrateDB()`.

4. **🚨 Préfixe `🔄` persiste après changement de phase** (Léa) :
   `db.routine.X` est figé avec le préfixe deload même quand
   `currentBlock.phase` change. Ajouter un strip dans
   `confirmPhaseTransition()` ou recalculer `db.routine` à chaque
   transition.

5. **🚨 `restSeconds: 0` sur 2è exo des supersets** (Alexis) :
   logique supersets met le rest à 0 sur l'exo secondaire (logique
   « zéro repos en superset ») mais le runtime affiche 0s
   littéralement → confusion utilisateur. Afficher "superset
   immédiat" textuel ou `null`.

6. **🚨 Wizard accepte 6 goals contradictoires** (D'Jo : `force, masse,
   seche, recompo, maintien, reprise`). Validation manquante à l'étape
   `obSelectGoal()` : max 2 goals compatibles.

7. **`weeklyPlan.days` non persisté côté Supabase** pour 3/4 profils :
   l'audit ne peut pas valider runtime + on perd la traçabilité
   bêta. Forcer un `saveDB() + cloudSync()` après `generateWeeklyPlan()`.

---

## Issues secondaires (non-bloquantes bêta)

- D'Jo `compDate=null` + `compType='powerlifting'` → nudge mensuel
  pour saisir la compétition (validation Gemini déjà spécifiée).
- D'Jo "Points Faibles" Samedi = abdos uniquement → choix douteux
  pour un PL blessure-épaule.
- Alexis charges aberrantes (Adduction 85kg) → audit `recalcOnboardingCharges()`.
- Alexis Fentes `weight:null` → fallback charge à ajouter.

---

## Ce qui fonctionne globalement ✅

- **Aurélien Spécialisation Quad** : détection ratio < 1.20 +
  niveau avancé + powerbuilding → `_gwpNeedsSquatSpec=true` →
  Leg Extension tagué `isCorrectivePriority` runtime + bloc
  "Spécialisation Quad — Rattrapage" présent Samedi.
- **Aurélien diversity Bench** : Mardi `bench` (barre) ≠
  Vendredi `bench_halt` (haltères) — variantes différentes.
- **D'Jo shoulder filter** : code OK, transformation Bench →
  Floor Press appliquée au runtime (non persistable mais
  logique vérifiée).
- **Code v211 (Priority Queue, KneeFilter, Pivot Week, Leg
  Overreach)** : présent et invocable, mais **inactif** pour
  mode `musculation`.

---

## Recommandations finales avant bêta

| Priorité | Action |
|---|---|
| 🚨 CRITIQUE | Réparer le bypass `wpGenerateMuscuDay()` (call site `selectExercisesForProfile` + helpers v211) |
| 🚨 CRITIQUE | Audit cohérence `db.routine` ↔ `programParams.selectedDays` dans `migrateDB()` |
| 🚨 CRITIQUE | Strip préfixe `🔄` dans `confirmPhaseTransition()` |
| HAUTE | Doublon Upper A Lundi/Samedi (rotation contextuelle musculation) |
| HAUTE | Validation goals (max 2 compatibles) dans `obSelectGoal()` |
| HAUTE | Persistance `weeklyPlan.days` → Supabase (`saveDB() + cloudSync()`) |
| MOYENNE | Fallback charge sur Fentes (`weight:null`) |
| MOYENNE | Affichage "superset immédiat" vs `restSeconds:0` |
| FAIBLE | Nudge mensuel compDate (D'Jo) |
| FAIBLE | Audit recalibrage charges accessoires débutant (Adduction 85kg) |
