# Stats Tab Audit
*Date : 2026-04-26 | Commits : `0f0297c`, `9d0f589`*

---

## 1. Résumé

| Priorité | Problème | Statut |
|---|---|---|
| 🔴 | Stats encore dans Profil (pill + section vide) | ✅ Corrigé |
| 🔴 | Radar « Jambes » hyper-dominant (4 groupes agrégés) | ✅ Corrigé |
| 🟠 | Lifts — chips de filtre affichaient sous-groupes fins | ✅ Corrigé |
| 🟡 | `getMuscleGroupRadar` n'existait pas | ✅ Créé |
| 🟡 | `renderMuscleEvolChart` utilisait tableau hardcodé | ✅ Aligné sur `RADAR_AXES` |

---

## 2. Radar — avant/après split Jambes

### Avant
```js
const RADAR_AXES = ['Dos','Pecs','Abdos','Jambes','Bras','Épaules','Cardio'];
// Jambes = Quadriceps + Ischio-jambiers + Fessiers + Mollets
// → toujours dominant pour un powerlifter (squat + deadlift)
```

### Après
```js
const RADAR_AXES = ['Dos','Pecs','Abdos','Quads','Ischio','Épaules','Bras','Cardio'];
// 8 axes, Jambes splitté en Quads (squat) et Ischio (deadlift + fessiers + mollets)
```

Nouvelle fonction `getMuscleGroupRadar(subGroup)` :
```
Quadriceps  → Quads
Ischio-jambiers, Fessiers, Mollets → Ischio
Grand dorsal, Haut du dos, Lombaires, Trapèzes → Dos
Pecs, Pecs (haut), Pecs (bas) → Pecs
Épaules (toutes variantes) → Épaules
Biceps, Triceps, Avant-bras → Bras
Abdos (frontal), Obliques, Abdos → Abdos
Cardio → Cardio
null → pas affiché dans le radar
```

Couleurs mises à jour : `Quads: #32D74B`, `Ischio: #30D158` (deux verts distincts).

`getMuscleGroupParent` non modifiée — utilisée ailleurs (volume landmarks, etc.).

---

## 3. Meilleurs lifts — filtre muscle

### Avant
```js
const muscle = getMuscleGroup(exo.name);
// → chips : "Quadriceps", "Grand dorsal", "Pecs (haut)"...
```

### Après
```js
const muscle = getMuscleGroupParent(getMuscleGroup(exo.name));
// → chips : "Jambes", "Dos", "Pecs"...
```

Le filtre `lifts.filter(l => l.muscle === liftsMuscleFilter)` fonctionne sans modification
car `l.muscle` stocke maintenant la catégorie parente.

---

## 4. Profil — ce qui a été supprimé

| Élément | Fichier | Ligne (avant) |
|---|---|---|
| `<button onclick="showProfilSub('tab-profil-stats',this)">📊 Stats</button>` | `index.html` | 2402 |
| `<div id="tab-profil-stats" class="profil-sub-section"></div>` | `index.html` | 2792 |
| Branche `if (id === 'tab-profil-stats') { showTab('tab-stats'); return; }` | `js/app.js` | 1820-1824 |

---

## 5. Fonctions — doublons et alignement

| Fonction | Problème | Traitement |
|---|---|---|
| `getMuscleGroupRadar` | N'existait pas — créée pour le radar | ✅ Créée dans `app.js` |
| `renderMuscleEvolChart` | `const muscles = ['Jambes',...]` hardcodé | ✅ Remplacé par `RADAR_AXES` |
| `renderRadarImproved` | Utilisait `getMuscleGroupParent` | ✅ Remplacé par `getMuscleGroupRadar` |
| `getMuscleGroupParent` | Utilisée dans volume landmarks, reports | ✓ Non modifiée |
| `renderBodyFigure`, `renderMuscleColors`, `renderMuscleList` | Validées dans Jeux | ✓ Non touchées |

Hardcoded `['Jambes','Dos','...]` restant à vérifier :
- `js/app.js:7722` — `const PARENTS = ['Jambes',...]` dans un module de génération
  de programme. Non lié au radar — non modifié.

---

## 6. Checklist visuelle par sous-onglet

| Sous-onglet | Vérification | Note |
|---|---|---|
| **Volume** | Chart.js bar + sélecteurs 7j/30j | Non testé interactivement — audit statique OK |
| **Muscles** | Radar 8 axes post-split | Dynamique (`numAxes = RADAR_AXES.length`) — aucun ajustement SVG nécessaire |
| **Records** | Chips filtre catégories parentes | ✅ Corrigé |
| **Cardio** | Empty state si pas de logs cardio | Code présent — non testé |

---

## 7. Reste à faire

| Tâche | Priorité |
|---|---|
| Test visuel interactif (DevTools, données réelles) | 🟠 Recommandé |
| Vérifier que `PARENTS` (ligne 7722) n'est pas utilisé dans le radar | 🟡 |
| Vérifier `renderStrengthRatios` — utilise-t-il `getMuscleGroupParent` ou hardcode ? | 🟡 |
| Audit Cardio — vérifier que les logs cardio remontent dans le bon sous-onglet | 🟡 |
