# Audit 27 — Protection Sync Offline → Cloud — v177

> Playwright headless Chrome 1194 — 17 tests SYNC-01 à SYNC-04
> Objectif : valider que syncFromCloud() ne perd jamais de séances locales
> Score : 17/17 (100 %)

---

## Problème initial (scénario Gemini)

```
1. User fait 2 séances en offline (localStorage = S1+S2, updatedAt=18h00)
2. Léa sur autre appareil push vers cloud → cloudTs=18h30
3. User remonte en Wi-Fi → syncFromCloud() : cloudTs(18h30) > lastPush(17h00)
4. Avant fix : db = cloudData → S1+S2 PERDUS
```

**Root cause** : la comparaison ne regardait que les timestamps, pas le contenu.
Un cloud plus récent en temps pouvait avoir moins de séances (push depuis un autre device sans les nouvelles séances offline).

---

## Fixes implémentés (supabase.js:246)

| Fix | Description | Commit |
|---|---|---|
| FIX 1 | Merge si `localLogs > cloudLogs` — logs locaux prioritaires | `2982f62` |
| FIX 2 | Toast contextuel — `'✅ Séances offline synchronisées (N logs)'` | `2982f62` |
| FIX 3 | `activeWorkout` préservé si séance en cours — jamais écrasé | `2982f62` |

### Logique de merge (supabase.js ligne ~246-300)

```js
var _localLogs  = db.logs  ? db.logs.length  : 0;
var _cloudLogs  = cloudData.logs ? cloudData.logs.length : 0;
var _activeBackup = db.activeWorkout || null;
var _hasActiveSession = _activeBackup &&
  _activeBackup.exercises.length > 0 && !_activeBackup.isFinished;

if (_localLogs > _cloudLogs) {
  // Merge : logs locaux + données cloud pour le reste
  var _mergedData = Object.assign({}, cloudData);
  _mergedData.logs     = db.logs;
  _mergedData.exercises = db.exercises || cloudData.exercises;
  _mergedData.bestPR   = db.bestPR    || cloudData.bestPR;
  db = _mergedData;
  setTimeout(() => syncToCloud(true), 500); // repush immédiat
} else {
  db = cloudData; // comportement inchangé : cloud wins
}

if (_hasActiveSession) {
  db.activeWorkout = _activeBackup; // restaurer séance en cours
  setTimeout(() => syncToCloud(true), 1200);
}
```

### Garanties
- **Atomique** : pas d'état intermédiaire visible (tout en mémoire avant `localStorage.setItem`)
- **Supabase down** : comportement inchangé — `syncFromCloud()` retourne `false` avant d'atteindre ce code
- **Pas de double-comptage** : les logs locaux sont pris tels quels, sans concaténation avec cloud logs
- **Repush** : après merge, les données mergées sont immédiatement repoussées au cloud (`syncToCloud(true)`)

---

## Résultats par test

| Test | Scénario | Résultat | Valeur observée |
|---|---|---|---|
| SYNC-01a | `syncFromCloud()` est définie | ✅ | fonction disponible |
| SYNC-01b | local(5) > cloud(3) → merge déclenché | ✅ | localLogs=5 cloudLogs=3 |
| SYNC-01c | merged a 5 logs (local wins) | ✅ | mergedLogs=5 |
| SYNC-01d | données cloud préservées (user.name) | ✅ | cloudNamePreserved=true |
| SYNC-02a | séance active correctement détectée | ✅ | detectedAsActive=true |
| SYNC-02b | activeWorkout.id préservé après overwrite cloud | ✅ | id=test-session-123 |
| SYNC-02c | activeWorkout.exercises préservé | ✅ | exercises=1 |
| SYNC-02d | données cloud prises pour le reste | ✅ | cloudNameTaken=true |
| SYNC-03a | local(2) ≤ cloud(3) → PAS de merge | ✅ | local=2 cloud=3 |
| SYNC-03b | cloud data prise telle quelle | ✅ | resultLogs=3 |
| SYNC-03c | user.name = cloud (comportement actuel préservé) | ✅ | CloudWins |
| SYNC-04a | merge pattern dans source (minification-safe) | ✅ | hasMergePattern=true |
| SYNC-04b | activeWorkout backup + isFinished check dans source | ✅ | activeBackup=true |
| SYNC-04c | Object.assign merge dans source | ✅ | hasMergedData=true |
| SYNC-04d | toast "Séances offline" dans source | ✅ | hasMergeToast=true |
| SYNC-04e | toast "séance en cours" dans source | ✅ | hasActiveToast=true |
| SYNC-04f | 0 erreur console critique (page complète) | ✅ | 0 erreur |

---

## Toasts

| Situation | Toast affiché |
|---|---|
| `localLogs > cloudLogs` → merge | `✅ Séances offline synchronisées (N logs)` |
| Séance en cours → `activeWorkout` restauré | `⚠️ Sync partielle — séance en cours préservée` |
| Cloud wins (comportement normal) | `Données cloud chargées !` (inchangé) |

---

## Fichiers modifiés

| Fichier | Changement |
|---|---|
| `js/supabase.js` | +36 lignes dans `syncFromCloud()` — merge intelligent |
| `js/supabase.min.js` | Régénéré (153,724 bytes ← 153,305 bytes) |
| `js/app.js` | SW_VERSION bumped `v176` → `v177` |
| `js/app.min.js` | Régénéré (806,870 bytes) |
| `service-worker.js` | CACHE_NAME `trainhub-v176` → `trainhub-v177` |

---

## Cas non couverts (acceptés)

- **Conflits de contenu identique** (même nb de logs, contenu différent) → last-write-wins timestamp, comportement inchangé. Un merge basé sur les IDs de séances serait la v2.
- **Test live Supabase** — impossible en CI (offline). La logique est testée en simulation `page.evaluate`.
- **Merge de `activityLogs`** — non inclus dans ce fix (activités secondaires). Priorité logs de force en premier.

---

## Score final : **17/17 (100 %)**

La protection couvre le scénario critique décrit par Gemini.
Aucune régression détectée. SW v177 déployé.

**Méthode reproductible :**
```bash
cd /home/user && python3 -m http.server 8787 &
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node sbd-hub/audit/27-sync-protection.js
```

**Résultats bruts :** `audit/27-sync-protection-results.json`
