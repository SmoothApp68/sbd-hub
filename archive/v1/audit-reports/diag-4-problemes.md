# Diagnostic — 4 problèmes v239
## DIAGNOSTIC UNIQUEMENT — aucun fix, aucun commit

---

## PROBLÈME 1 — Tapis roulant dans toutes les séances muscu

### Cause racine — Ligne 22375 `wpGeneratePowerbuildingDay`

```js
if ((params.cardio || '') === 'integre' && bodyPart !== 'recovery') {
  var _cardioBlock = wpGetCardioForProfile(injuries, 20, isCutting);
  if (_cardioBlock) exercises.push(_cardioBlock);
}
```

**`wpGetCardioForProfile`** (ligne 21251) retourne :
```js
var cardioName = mat === 'maison' ? 'Marche rapide'
  : mat === 'halteres' ? 'Vélo stationnaire'
  : 'Tapis roulant';   // ← Aurélien : mat='salle'
```

**Chaîne causale :**
```
db.user.programParams.cardio === 'integre'  (défaut onboarding, ligne 1565)
  └─ wpGeneratePowerbuildingDay (params.cardio || '') === 'integre'
       └─ guard : bodyPart !== 'recovery'  ← insuffisant
           └─ wpGetCardioForProfile → { name: 'Tapis roulant', type: 'cardio', ... }
               └─ getCardioDuration('powerbuilding', 'hypertrophie') → 20min (CARDIO_MAX_MATRIX ligne 18457)
                   └─ exercises.push(cardioBlock)  ← ajouté à CHAQUE séance muscu
```

**Ce n'est PAS un bug de régression** — comportement intentionnel documenté (v193). Mais la garde `bodyPart !== 'recovery'` injecte le cardio dans TOUTES les séances poids (squat, bench, deadlift). En mode 'integre', l'intention est d'ajouter du cardio léger à chaque séance. Aurélien n'a jamais désactivé ce mode.

**Pourquoi Jeudi (DL) n'a pas de Tapis roulant dans les données Supabase :**
Deux hypothèses : (1) le Tapis roulant est présent mais non signalé, (2) `adaptSessionForDuration` a évincé le cardio car la séance DL avec double Squat Pause dépasse la durée cible (evictionCategory: 'cardio' est utilisé).

### Fix minimal suggéré

**Option A** (comportement) — Ajouter un garde sur le nombre de séances muscu dans la semaine :
```js
// Injecter cardio seulement si la séance est la dernière de la journée
// ou selon un critère de fréquence hebdomadaire
```

**Option B** (UX) — Changer le défaut onboarding de `'integre'` à `'aucun'` pour les powerbuilders ; présenter le choix explicitement dans le wizard.

**Option C** (immédiat) — Guard `isPowerlifting` : en mode powerbuilding/powerlifting, ne pas injecter de cardio dans les séances SBD principaux.

---

## PROBLÈME 2 — Doublon Écarté Haltères + Écarté Machine (Mardi ET Vendredi)

### Cause racine — `WP_ACCESSORIES_BY_PHASE.hypertrophie.bench` lignes 19094-19100

```js
bench: [
  { name: 'Dips',                reps: '10-12', rpe: 8,   sets: 4, rest: 120, priority: 1 },
  { name: 'Écarté Haltères',     reps: '12-15', rpe: 7.5, sets: 3, rest: 60,  priority: 2 },  // ← DEUX
  { name: 'Extension Triceps',   reps: '12-15', rpe: 7.5, sets: 3, rest: 60,  priority: 2 },
  { name: 'Rowing Poulie Assis', reps: '10-12', rpe: 8,   sets: 4, rest: 90,  priority: 1 },
  { name: 'Écarté Machine',      reps: '15',    rpe: 7,   sets: 3, rest: 60,  priority: 3 }   // ← ÉCARTÉS
]
```

Les deux sont dans le même pool. Aucune déduplication n'est appliquée pour les exercices du même groupe musculaire dans `wpGeneratePowerbuildingDay`.

**Filtre esthétique inexistant en powerbuilding — ligne 21759 :**
```js
// RÈGLE 3 — Powerlifting : retirer exercices esthétiques
if (_mode === 'powerlifting') {         // ← seulement en powerlifting
  var _aestheticFilter = ['écarté machine', ...];
  result = result.filter(...);
}
```

→ Le filtre `selectExercisesForProfile` NE retire PAS les écartés en mode `powerbuilding`. Les deux passes le filtre et sont ajoutés.

**Historique :** `Écarté Haltères` a été ajouté lors d'une mise à jour bench (priorité:2), mais `Écarté Machine` (priorité:3) était déjà là. Les deux ont survécu sans garde de déduplication.

### Fix minimal suggéré

Retirer `Écarté Machine` du pool `WP_ACCESSORIES_BY_PHASE.hypertrophie.bench` — `Écarté Haltères` couvre déjà l'isolation pectorale avec meilleure amplitude. `Écarté Machine` ne reste pertinent qu'en fin de séance bodybuilding pur, pas en powerbuilding.

```js
// Supprimer cette ligne dans hypertrophie.bench :
{ name: 'Écarté Machine', reps: '15', rpe: 7, sets: 3, rest: 60, priority: 3 }
```

---

## PROBLÈME 3 — Squat Pause en double sur Jeudi (DL)

### Cause racine — Deux sources indépendantes injectent Squat Pause le même jour

**Source A — Squat Pause 102.5kg ✅**
`WP_ACCESSORIES_BY_PHASE.hypertrophie.deadlift_s2` (ajouté en v239) :
```js
deadlift_s2: [
  { name: 'Squat Pause', reps: '5-6', rpe: 7.5, sets: 3, rest: 180, priority: 1, isPrimary: true },
  ...
]
```
Traité dans la boucle accessoires → `wpDoubleProgressionWeight('Squat Pause', 5, 6)` → 3×5 @ 102.5kg ✅

**Source B — Squat Pause 3×4 @ null ❌**
`wpApplyImbalanceCorrections` — Règle 3 — ligne 21185 :
```js
if (dayKey === 'deadlift' && ratios.squat_deadlift && ratios.squat_deadlift.value < 0.80) {
  exercises.push({
    name: 'Squat Pause', type: 'weight', restSeconds: 240, isPrimary: false,
    coachNote: '⚖️ Ratio Squat/Deadlift bas (...) — Squat Pause ajouté.',
    sets: Array.from({ length: 3 }, function() { return { reps: 4, rpe: 7.5, weight: null, isWarmup: false }; })
  });
}
```

**Trigger pour Aurélien :** S/D ratio = Squat 157kg / Deadlift 200kg = **0.785 < 0.80** → Règle 3 déclenche TOUJOURS.

Ce push ajoute un Squat Pause avec `weight: null` (aucun calcul de charge, juste `Array.from`). La charge null → null en JSON → affiché comme charge manquante.

**Chaîne complète pour Jeudi (semaine 2, phase hypertrophie) :**
```
1. wpGeneratePowerbuildingDay('deadlift')
   ├─ Main lift → Soulevé de Terre
   ├─ Accessories (deadlift_s2) → Squat Pause 102.5kg ✅, Tirage Vertical, Leg Curl, Relevé, Face Pull
   ├─ wpApplyImbalanceCorrections (ratio 0.785 < 0.80) → push Squat Pause null ❌
   └─ Résultat : 2 × Squat Pause dans le même jour
```

### Fix minimal suggéré

**Option A (recommandée)** — Supprimer Squat Pause de `deadlift_s2` et `deadlift_s3` :
La Règle 3 de `wpApplyImbalanceCorrections` couvre déjà le cas "ratio faible". Le Squat Pause dans les accessoires s2/s3 était une redondance non prévue lors de l'ajout v239.

```js
deadlift_s2: [
  // Supprimer la ligne Squat Pause ici
  { name: 'Tirage Vertical', ... },
  { name: 'Leg Curl Allongé', ... },
  { name: 'Relevé de Jambes', ... },
  { name: 'Face Pull', ... }
]
```

**Option B** — Guard dans `wpApplyImbalanceCorrections` :
```js
// Ne pas ajouter si un Squat Pause existe déjà
var alreadyHasSP = exercises.some(function(e) { return /squat pause/i.test(e.name || ''); });
if (!alreadyHasSP && dayKey === 'deadlift' && ratios.squat_deadlift && ratios.squat_deadlift.value < 0.80) {
```

Option A est plus propre car le Squat Pause avec charge correcte vient de la Règle 3 + `wpDoubleProgressionWeight`, non d'un accessoire manuel.

**Note :** l'utilisateur déclare que la source A est "v238 wpCalcVariationWeight" — c'est inexact. Pour le dayKey 'deadlift', `tpl.mainLift === 'squat_pause'` est **false** (mainLift est 'deadlift'). Le Squat Pause @ 102.5kg vient du **pool accessoires deadlift_s2** traité via `wpDoubleProgressionWeight`, pas via `wpCalcVariationWeight`.

---

## PROBLÈME 4 — "Ajuster ma séance" disparue

### Cause racine — Bouton présent dans `renderProgramTab` (code mort), absent de `renderProgrammeV2`

**`renderProgramTab()` — ligne 10541 → `#programBuilderContent` :**
```js
// Ligne 10752 (DANS renderProgramTab)
html += '<button onclick="openAdjustSession()" ...>Ajuster ma séance</button>';
```

**`renderProgrammeV2()` — ligne 10401 → `#programmeV2Content` :**
```js
// Lignes 10445-10452 (DANS renderProgrammeV2) — PAS de Ajuster ma séance
h += '<button onclick="startPgmEdit()" ...>Modifier le planning</button>'
  + '<button onclick="generateWeeklyPlan()" ...>⚡ Nouveau programme</button>';
container.innerHTML = h;
```

**Depuis v237** : `renderProgramBuilder()` délègue TOUJOURS à `renderProgrammeV2()`, et `#programBuilderContent` a `display:none`. `renderProgramTab()` n'est plus jamais appelé → le bouton "Ajuster ma séance" est dans du **code mort**.

**`openAdjustSession()` EST encore fonctionnelle — ligne 12696 :**
```
openAdjustSession()              ← existe ✅
_renderAdjustSessionHTML()       ← existe ✅
_adjustSwitchDay()               ← existe ✅
_adjustShowAlternatives()        ← existe ✅ (utilise EXERCISE_ALTERNATIVES)
_adjustApplyChange()             ← existe ✅
_adjustPrimaryWarning()          ← existe ✅
```
Toutes ces fonctions existent et sont complètes. Le problème est uniquement l'absence du point d'entrée dans V2.

**Situation du ✏️ par jour :**
Dans `renderProgramTab` (code mort), le ✏️ appelle `progEditDay(day)` → `pbEditExisting()` (wizard programme), pas un swap d'exercice. Il n'y avait pas de swap directement depuis le ✏️ — le swap passait déjà par "Ajuster ma séance".

Dans `renderProgrammeV2`, `renderWeekRowsCompact()` génère des lignes sans ✏️ — juste `✓` (fait) ou `›` (à venir). Tap sur la ligne → `progShowDayDetail(day)` (modal détail du jour, pas de swap).

### Fix minimal suggéré

Ajouter le bouton dans `renderProgrammeV2` au footer :

```js
// AVANT (ligne 10445-10452) :
h += '<div style="display:flex;gap:8px;padding:10px 12px 16px;">'
  + '<button onclick="startPgmEdit()" ...>Modifier le planning</button>'
  + '<button onclick="generateWeeklyPlan()" ...>⚡ Nouveau programme</button>'
  + '</div>';

// APRÈS :
h += '<div style="display:flex;gap:8px;padding:10px 12px 4px;">'
  + '<button onclick="openAdjustSession()" style="flex:1;padding:11px;border-radius:10px;'
  + 'font-size:13px;font-weight:500;border:0.5px solid var(--border);'
  + 'background:var(--surface);color:var(--sub);cursor:pointer;">'
  + 'Ajuster ma séance</button>'
  + '<button onclick="generateWeeklyPlan()" ...>⚡ Nouveau programme</button>'
  + '</div>'
  + '<div style="padding:0 12px 16px;">'
  + '<button onclick="startPgmEdit()" style="width:100%;...">Modifier le planning</button>'
  + '</div>';
```

---

## Tableau récapitulatif

| Problème | Fichier | Ligne | Type | Criticité |
|---|---|---|---|---|
| Tapis roulant | `app.js` | 22375 | Comportement non désiré (cardio=integre par défaut) | Moyen |
| Doublon Écarté | `app.js` | 19094-19100 | Double entrée dans WP_ACCESSORIES_BY_PHASE | Faible |
| Double Squat Pause | `app.js` | 21185 (Source B) | Règle 3 wpApplyImbalanceCorrections + v239 deadlift_s2 | Élevé |
| Ajuster ma séance | `app.js` | 10445 | Bouton non porté depuis renderProgramTab vers renderProgrammeV2 | Élevé |

---

## Actions recommandées (par priorité)

1. **URGENT — Double Squat Pause (P3)** : Supprimer Squat Pause de `deadlift_s2` et `deadlift_s3` → régénérer le plan
2. **URGENT — Ajuster ma séance (P4)** : Ajouter `openAdjustSession()` dans le footer de `renderProgrammeV2`
3. **MODÉRÉ — Écarté Machine (P2)** : Retirer Écarté Machine de `WP_ACCESSORIES_BY_PHASE.hypertrophie.bench`
4. **MODÉRÉ — Tapis roulant (P1)** : Décider si cardio 'integre' doit s'appliquer à toutes les séances SBD ou seulement à des jours spécifiques
