# TrainHub — ROADMAP Autonome

## RÈGLES ABSOLUES (ne jamais violer)

### Sécurité du code
- Lire TOUT le code concerné avant de modifier quoi que ce soit
- Faire `node -c js/app.js js/engine.js js/coach.js js/program.js js/supabase.js` après chaque modification
- Faire un audit Playwright après chaque feature (screenshots + vérification visuelle)
- Ne JAMAIS commiter si `node -c` échoue
- Commiter chaque étape séparément avec un message clair

### Sécurité des données
- Ne JAMAIS modifier la structure de `db.logs` (données réelles des users)
- Ne JAMAIS modifier `db.bestPR` directement
- Ne JAMAIS toucher aux politiques RLS Supabase (laisser Claude.ai le faire)
- Ne JAMAIS hardcoder de données utilisateur (nom, email, poids...)
- Toujours tester avec les 3 profils : débutant (cold start), intermédiaire, avancé

### Sécurité du build
- Bumper le SW après chaque groupe de commits
- Vérifier que tous les JS sont dans ASSETS_TO_CACHE du SW
- Ne JAMAIS supprimer une fonction sans vérifier qu'elle n'est pas appelée ailleurs
- Ne JAMAIS renommer une fonction publique sans grep dans tout le codebase

---

## CHECKLIST AVANT CHAQUE COMMIT

```bash
# 1. Syntaxe
node -c js/app.js && node -c js/engine.js && node -c js/coach.js && node -c js/program.js && node -c js/supabase.js

# 2. Fonctions supprimées encore référencées ?
# grep la fonction supprimée dans tous les fichiers JS

# 3. Données utilisateur hardcodées ?
grep -r "Aurélien\|aurel\|Jordan\|Léa\|smoothapp68" js/ --include="*.js"

# 4. console.log non gardés ?
grep -n "console\.log" js/app.js | grep -v "if (DEBUG\|//\|catch"
```

---

## TÂCHES — Dans l'ordre strict

### PHASE 1 — Stabilisation (faire maintenant)

#### TÂCHE 1 — Nettoyer les fichiers orphelins
**Fichiers à toucher :** repo (supprimer des fichiers)
**Fichiers à NE PAS toucher :** index.html, js/app.js
**Action :**
- Supprimer `js/constants.js` du repo (jamais chargé dans index.html)
- Supprimer `js/utils.js` du repo (jamais chargé dans index.html)
- Vérifier qu'aucun autre fichier ne les importe : `grep -r "constants.js\|utils.js" .`
**Test :** app charge normalement après suppression
**Commit :** `chore: remove orphaned constants.js and utils.js`

---

#### TÂCHE 2 — Icônes PWA de qualité
**Fichiers à toucher :** `icons/`, `manifest.json`
**Action :**
- Générer ou télécharger des icônes PNG 192×192 et 512×512 de qualité
  (utiliser un logo simple TrainHub avec fond sombre #0C0C18)
- Séparer `purpose: "any maskable"` en deux entrées dans manifest.json :
```json
{ "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
{ "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
{ "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
{ "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
```
- Ajouter l'icône dans `showNotification()` dans service-worker.js :
```js
self.registration.showNotification(title, {
  body: body,
  icon: '/sbd-hub/icons/icon-192.png',  // AJOUTER
  badge: '/sbd-hub/icons/icon-192.png'  // AJOUTER
});
```
**Test :** Lighthouse PWA score
**Commit :** `fix(pwa): quality icons + separate any/maskable + notification icon`

---

#### TÂCHE 3 — Exercices manquants dans Custom Builder
**Fichiers à toucher :** `js/engine.js` (WP_EXO_META ou EXO_DATABASE)
**Fichiers à NE PAS toucher :** js/app.js (sauf si nécessaire)
**Action :**
Vérifier d'abord si ces exercices existent dans EXO_DATABASE avec un nom différent.
Ajouter si vraiment absents :
- Adduction (Machine) — muscleGroup: Adducteurs, type: isolation
- Abduction (Machine) — muscleGroup: Abducteurs, type: isolation
- Gainage Planche — muscleGroup: Abdos, type: isolation
- Gainage Latéral — muscleGroup: Abdos, type: isolation
- Gainage Tape Épaule — muscleGroup: Abdos, type: isolation
- Dead Bug — muscleGroup: Abdos, type: isolation
- Ab Wheel — muscleGroup: Abdos, type: isolation
- Soulevé de Terre Pause — si absent
- Tapis Roulant — si absent (cardio)
**Test :** rechercher ces exercices dans la bibliothèque du Custom Builder
**Commit :** `feat(builder): add missing exercises to library`

---

#### TÂCHE 4 — Backup programme v2
**Fichiers à toucher :** js/app.js
**Action :**
- Augmenter la limite de 5 à 15 backups
- Ajouter `firstUsedAt`, `lastUsedAt`, `sessionCount` dans chaque backup
- Mettre à jour `lastUsedAt` et `sessionCount` dans `finalizeSession()`
- Afficher "Du 15 mars au 20 avril · 12 séances" dans la restore UI
**Test :** créer un programme, vérifier que le backup apparaît avec les bonnes infos
**Commit :** `feat(builder): 15 backups + usage tracking dates`

---

### PHASE 2 — Qualité coaching

#### TÂCHE 5 — Transfer Matrix auto-apprenante
**Fichiers à toucher :** js/engine.js
**Action :**
Dans `getTransferRatio()`, vérifier d'abord l'historique de l'user :
```js
function getTransferRatio(sourceExo, targetExo) {
  var sourceE1rm = getTopE1RMForLift(sourceExo);
  var targetE1rm = getTopE1RMForLift(targetExo);
  if (sourceE1rm > 0 && targetE1rm > 0) {
    return targetE1rm / sourceE1rm; // ratio réel de l'user
  }
  // Fallback sur EXERCISE_TRANSFER_MATRIX
  var src = EXERCISE_TRANSFER_MATRIX[sourceExo];
  var tgt = EXERCISE_TRANSFER_MATRIX[targetExo];
  if (src && tgt && src.family === tgt.family) return tgt.ratio / src.ratio;
  return null;
}
```
**Test :** user avec historique → ratio personnalisé / sans historique → ratio universel
**Commit :** `feat(engine): auto-learning transfer matrix from user history`

---

#### TÂCHE 6 — Offline first (GO sans réseau)
**Fichiers à toucher :** js/app.js, service-worker.js
**Action :**
Vérifier que `finalizeSession()` sauvegarde d'abord en localStorage,
puis tente le sync cloud. Si pas de réseau → stocker dans `db.pendingSync`
et syncer au prochain démarrage.
```js
// Dans finalizeSession() :
saveDB(); // localStorage d'abord
if (navigator.onLine) {
  debouncedSyncToCloud();
} else {
  db.pendingSync = true;
  saveDB();
  showToast('📱 Séance sauvegardée localement — sync au retour du réseau');
}

// Dans initApp() ou syncFromCloud() :
if (db.pendingSync) {
  db.pendingSync = false;
  syncToCloud(true);
}
```
**Test :** couper le réseau, faire une séance, revérifier que les données sont là
**Commit :** `feat(sync): offline-first session save + pending sync on reconnect`

---

### PHASE 3 — Différenciation

#### TÂCHE 7 — Health Connect (Garmin Forerunner 165)
**Attendre la validation de Claude.ai avant de commencer**
Architecture validée par Gemini — voir gemini-garmin-bluetooth.md

#### TÂCHE 8 — Module cycle menstruel
**Attendre la validation de Claude.ai avant de commencer**

#### TÂCHE 9 — Nettoyage fonctions mortes app.js
**Fichiers à toucher :** js/app.js UNIQUEMENT
**Action :**
- grep chaque fonction morte pour confirmer qu'elle n'est pas appelée
- Supprimer par groupes de 5-10 fonctions maximum
- Faire node -c après chaque groupe
- Ne JAMAIS supprimer plus de 200 lignes en une fois
**Commit :** `chore(app): remove dead code batch N/X`

---

## FORMAT DE RAPPORT APRÈS CHAQUE TÂCHE

Après chaque tâche, créer/mettre à jour `TODO.md` avec :
```
## Tâche N — [Nom] ✅
- Commits : [hash]
- Tests : [résultat playwright]
- Notes : [observations]
- Supabase migration needed : [oui/non — décrire si oui]
```

Ne pas modifier les données Supabase directement —
noter les migrations nécessaires dans `TODO.md` pour que Claude.ai les applique.
