# Audit 63 — Sous-onglet Cardio (Stats) : diagnostic

> Phase 1 du chantier « Cardio Stats » (session autonome, zone verte = affichage).
> Lecture : `renderCardioStats` (app.js:15247-15328), `convertWorkoutToSession` (30452),
> import Hevy (app.js:10153+/10277+, import.js), `createExercise` (import.js:94),
> `logActivityTag` (app.js:30700), carte GO cardio (app.js:27682-27690).

## Sources de vérité cardio (état réel)

1. **`db.logs[].exercises[]`** — `isCardio:true` (posé par `createExercise` via `getExoType`,
   back-fill migration app.js:9951), `distance` (km), `maxTime` (**secondes**). Bien remplis par
   les **imports Hevy** (CSV app.js:10177-10179, texte import.js:947-955, legacy 10281).
2. **`db.activityLogs[]`** — `{date 'YYYY-MM-DD', type, duration (**minutes**), intensity, trimp,
   source: manual|garmin|ghost}` — le chemin PRINCIPAL de log d'activités depuis v142
   (one-tap, ghost log, Garmin). Pas de distance stockée.
3. **Séances GO cardio** — la carte GO saisit KM/TEMPS (durée en **minutes**, app.js:27683-27684),
   mais `convertWorkoutToSession` ne remplit ni `exercise.distance` ni `exercise.maxTime` :
   la durée tombe dans `series[].reps` via le fallback `reps: s.reps || (s.duration || 0)`
   (30495) ; distance/elevation/floors sont perdus.

## Problèmes identifiés et classification

| # | Problème | Classification | Action |
|---|---|---|---|
| P1 | `renderCardioStats` ignore totalement `db.activityLogs` — les activités loggées via le système v142 n'apparaissent JAMAIS, alors que l'état vide promet « Tapis, natation, vélo… apparaissent ici automatiquement » | **AFFICHAGE** | ✅ corrigé : fusion lecture seule logs + activityLogs |
| P2 | Le flux GO **perd** distance/duration/elevation/floors des exos cardio à la sauvegarde (`convertWorkoutToSession` ne les agrège pas) → sessions comptées mais durée « — » et distance absente | **DONNÉE-SOURCE — ZONE ROUGE** | ❌ non corrigé (flux de séance = écriture). À traiter avec Aurélien + vérif Supabase |
| P3 | Conséquence lisible de P2 : pour les exos `isCardio` avec `maxTime===0`, la durée EST présente dans `series[].reps` (minutes GO). Récupérable en lecture avec gardes | **AFFICHAGE** (mitigation) | ✅ corrigé : dérivation d'affichage, distance reste irrécupérable |
| P4 | Unités incohérentes à l'écriture : GO = minutes, import Hevy = secondes, activityLogs = minutes | **DONNÉE-SOURCE — ZONE ROUGE** (à l'écriture) | ❌ écriture non touchée ; l'affichage normalise tout en secondes |
| P5 | `isVelo = /velo|cycling|bike/` ne matche PAS « Vélo » (accent é non normalisé) → exos vélo classés « Autre cardio » | **AFFICHAGE** | ✅ corrigé (matching accent) |
| P6 | Pas de Chart.js dans ce sous-onglet → aucun problème de cycle de vie/fuite. `fmtPace` correct. Gardes `|| 0` → pas de NaN observables | OK | rien |
| P7 | « Record dist. » calculé all-time au milieu de métriques 30 j | mineur, libellé non trompeur | rien (noté) |

## À vérifier côté Supabase (Claude.ai) — problème DONNÉE-SOURCE P2/P4

Avant tout chantier d'écriture sur le flux GO cardio :
- Combien de blobs `sbd_profiles` contiennent des exercices `isCardio:true` avec `maxTime===0`
  et `series` non vide (forme GO) ? → mesure l'ampleur de la perte.
- Le fix d'écriture devra trancher l'unité canonique (secondes, comme l'import) et migrer
  la forme GO existante (minutes dans `series[].reps`).

## Correctif Phase 2 (zone verte, affichage uniquement)

- `computeCardioStatsData()` : fonction pure, fusionne `db.logs` (exos `isCardio`) et
  `db.activityLogs` en entrées normalisées `{name, cat, distance, durationSec, trimp, ts, date,
  source}` — durées converties en secondes (import: déjà sec ; GO: `series[].reps` minutes×60
  avec garde de plausibilité ≤600 min ; activityLogs: minutes×60). Catégorisation par
  `activityType` (natation→swim, course/trail→run, velo→bike, reste→other) ou regex nom
  (accents corrigés). AUCUNE écriture.
- `renderCardioStats` : consomme ces entrées ; mêmes cartes métriques (sessions 30 j, distance,
  durée totale, record, allure) ; historique récent fusionné (10) ; les entrées activityLogs
  affichent durée + TRIMP (pas de distance — jamais stockée, pas de placeholder trompeur) ;
  emojis/labels via `ACTIVITY_SESSION_LABELS` existant.
- Décisions autonomes notées : trail/randonnée → catégorie Course ; yoga/arts martiaux/etc. →
  « Autre activité » (durée + TRIMP honnêtes) ; pas de dédoublonnage logs↔activityLogs
  (chevauchement improbable, à réévaluer si Garmin sync s'étend).
