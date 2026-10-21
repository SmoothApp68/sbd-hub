# Architecture — Training Hub

## Règle principale
**Ne jamais déplacer du code qui fonctionne juste pour le déplacer.**
`app.js` reste intact jusqu'à ce qu'une section soit stable et bien testée.

---

## Règle de développement
Tout nouveau code va directement dans le bon fichier séparé :

| Domaine | Fichier cible |
|---|---|
| Calculs purs, constantes, matching | `js/engine.js` ✅ séparé |
| Base d'exercices | `js/exercises.js` ✅ séparé |
| Supabase, auth, social cloud, télémétrie | `js/supabase.js` ✅ séparé |
| Import Hevy/Garmin (texte + CSV) | `js/import.js` ✅ séparé |
| Génération programme | `js/program.js` ✅ séparé |
| Articulations / contraintes | `js/joints.js` ✅ séparé |
| Coach algo, weekly plan | `js/coach.js` ✅ séparé |
| Init Sentry | `js/sentry-init.js` ✅ séparé |
| Stats · Social · Session GO · Navigation/tabs/**overlays** | ⚠️ toujours dans `js/app.js` |

> ⚠️ `js/stats.js`, `js/social.js`, `js/workout.js`, `js/ui.js` **n'ont jamais été créés**. Stats,
> social, session GO et le système de modales/toasts unifié (§ UI overlays) vivent dans `js/app.js`.

---

## Règle de migration
Les fonctions existantes dans `app.js` sont migrées **une par une**, uniquement quand on touche à cette zone pour une autre raison.

Jamais de migration en bloc.

---

## Ordre de chargement RÉEL dans index.html (:3414-3421)
```html
<script defer src="js/sentry.min.js"></script>
<script defer src="js/sentry-init.js"></script>
<script defer src="js/engine.js"></script>
<script defer src="js/exercises.js"></script>
<script defer src="js/supabase.js"></script>
<script defer src="js/import.js"></script>
<script defer src="js/program.js"></script>
<script defer src="js/joints.js"></script>
<script defer src="js/coach.js"></script>
<script defer src="js/app.js"></script>   <!-- toujours en dernier -->
```

`app.js` reste chargé en dernier — il peut appeler toutes les fonctions des fichiers précédents.

---

## Systèmes livrés (à connaître avant de toucher aux zones concernées)

### UI overlays unifiés (v313-320, dans app.js)
Cœur `_uiOpen(el, opts)` / `_uiClose(el)` / `closeAllOverlays()` : pile LIFO, scroll-lock (body
`position:fixed` + `top:-scrollY`), fermeture Échap, tap-dehors. Primitives publiques :
`showModal`, `showInfoModal`, `showConfirm({title,body,danger,onConfirm,onCancel})`, `showSheet({...})`,
`showToast(msg,{variant,position})`. **Aucun `confirm()` natif ni overlay artisanal.** Fonds de box :
token opaque `--surface-solid`. Z-index : 5 variables `--z-nav/-banner/-overlay/-critical/-toast`.

### Résolution des noms d'exercices (nomenclature Lots 1-B2)
`EXO_DATABASE` porte un `name` précis + `nameAlt` (alias FR/EN). Résolution générique→canonique via
`EXO_SYNONYMS`/`matchExoName` (engine.js), `WP_SYNONYMS`/`wpSynonymGroupOf` (app.js), migration
`migrateExerciseNames` (import.js), fusion d'entrées `mergeExerciseData` (engine.js:5002).

### Modèle `family` — ⚠️ DETTE (pas un système actif)
`family` est posé sur ~139 entrées d'`EXO_DATABASE` (18 valeurs) MAIS **n'est consommé par aucun code
applicatif** (métadonnée dormante). Le seul `family` porteur de logique est celui de
`EXERCISE_TRANSFER_MATRIX` (engine.js:2391, vocabulaire propre `squat/hinge/bench/ohp`), **non aligné**
avec celui d'`EXO_DATABASE`. L'alignement prévu par `audit/67` n'a jamais été livré → à trancher
(aligner ou retirer). Ne PAS présenter `family` comme actif.

---

## Checklist avant tout nouveau fichier JS
- [ ] Fichier créé dans `js/`
- [ ] `<script src="js/nom.js"></script>` ajouté dans `index.html` avant `app.js`
- [ ] Testé sur Android Chrome avant commit
- [ ] Commit atomique avec message clair
