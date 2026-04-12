# Architecture — Training Hub

## Règle principale
**Ne jamais déplacer du code qui fonctionne juste pour le déplacer.**
`app.js` reste intact jusqu'à ce qu'une section soit stable et bien testée.

---

## Règle de développement
Tout nouveau code va directement dans le bon fichier séparé :

| Domaine | Fichier cible |
|---|---|
| Stats (volume, landmarks, équilibre, records, cardio) | `js/stats.js` |
| Social (feed, amis, leaderboard, défis) | `js/social.js` |
| Session GO, séances, workout | `js/workout.js` |
| Coach algo, weekly plan | `js/coach.js` |
| Navigation, tabs, toasts, modals | `js/ui.js` |
| Calculs purs, constantes, matching | `js/engine.js` ✅ déjà séparé |
| Base d'exercices | `js/exercises.js` ✅ déjà séparé |
| Supabase, auth, social cloud | `js/supabase.js` ✅ déjà séparé |
| Import Hevy (texte + CSV) | `js/import.js` ✅ déjà séparé |

---

## Règle de migration
Les fonctions existantes dans `app.js` sont migrées **une par une**, uniquement quand on touche à cette zone pour une autre raison.

Jamais de migration en bloc.

---

## Ordre de chargement dans index.html
```html
<script src="js/engine.js"></script>
<script src="js/exercises.js"></script>
<script src="js/supabase.js"></script>
<script src="js/import.js"></script>
<script src="js/stats.js"></script>     <!-- à créer -->
<script src="js/workout.js"></script>   <!-- à créer -->
<script src="js/coach.js"></script>     <!-- à créer -->
<script src="js/social.js"></script>    <!-- à créer -->
<script src="js/ui.js"></script>        <!-- à créer -->
<script src="js/app.js"></script>       <!-- toujours en dernier -->
```

`app.js` reste chargé en dernier — il peut appeler toutes les fonctions des fichiers précédents.

---

## Checklist avant tout nouveau fichier JS
- [ ] Fichier créé dans `js/`
- [ ] `<script src="js/nom.js"></script>` ajouté dans `index.html` avant `app.js`
- [ ] Testé sur Android Chrome avant commit
- [ ] Commit atomique avec message clair
