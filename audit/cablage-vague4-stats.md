# Audit de câblage — Vague 4 : onglet STATS

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 28/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.

## CONTRÔLE D'EXHAUSTIVITÉ

> **Phase 1 : 28 éléments inventoriés. Phase 2 : 28 verdicts. Phase 5 : 28 statuts runtime.**

| Périmètre | Bornes |
|---|---|
| Markup | `index.html:2552` → `index.html:2609` (`<div id="tab-stats">`) |
| Sous-onglets | `stats-volume` · `stats-muscles` · `stats-records` · `stats-cardio` |
| Générateurs | `showStatsSub` (app.js:16062) → `renderReports`, `renderVolumeChart`, `renderRadarImproved`, `renderMuscleChart`, `renderVolumeLandmarks`, `renderStrengthRatios`, `renderLifts`, `renderCardioStats` |
| États | **36** = 9 profils × 4 sous-onglets |

Contrairement aux vagues 2-3, Stats est **majoritairement statique** : 26 des 28 éléments viennent du
markup, 2 seulement du runtime (les familles `mg-<n>` et `chev-mg-<n>`, ×7 chacune).

---

## LES CONSTATS

### I1 — ⚠️ Deux notions de « cardio » sur le même onglet

**Mesuré**, profil enrichi d'une séance contenant un exercice cardio (« Tapis de course ») **et**
portant 2 activités de natation dans `db.activityLogs` :

| Surface | Sources lues | Résultat affiché |
|---|---|---|
| Sous-onglet **Cardio** (`renderCardioStats`, app.js:16262) | `db.logs` **+** `db.activityLogs` (`computeCardioStatsData`) | 🏊 Natation : 2 sessions · 🏃 Course/Tapis : 1 session |
| Ligne **Cardio** de « Volume par Muscle » (`mg-6`, app.js:10707) | `db.logs` **seulement** | `Sem. 3` — les 2 natations n'y sont pas |

Le code de `mg-6` est explicite :
```js
db.logs.filter(...).forEach(l => l.exercises.forEach(e => {
  const exoType = getExoType(e.name);
  if (exoType === 'cardio' || exoType === 'cardio_stairs') { wd['Cardio'] += (e.sets || 1); return; }
```
Aucune lecture d'`activityLogs`. Une natation loggée en activité compte donc dans le sous-onglet Cardio
et **pas** dans la répartition musculaire, sur le même écran. *Fait, pas jugement.*

### I2 — Deux de mes suspicions initiales : RÉFUTÉES

Je les documente parce qu'elles auraient fait deux faux findings.

| Suspicion | Verdict | Ce qui l'a levée |
|---|---|---|
| « Le sous-onglet Cardio affiche *Aucune session détectée* pour tout le monde » | ✘ **RÉFUTÉE** | Défaut de **mon** test : je ne gardais que la **première** valeur vue par `id`, donc le **placeholder statique** d'`index.html:2607`, jamais le rendu. Corrigé (capture restreinte à la sous-section active) → le rendu est correct : `🏊 Natation · 2 · SESSIONS 30J · 1h25 · 204 TRIMP`. |
| « `mg-6` (ligne Cardio) est structurellement mort » | ✘ **RÉFUTÉE** | Il se remplit dès qu'une séance contient un exercice de type `cardio` : `Sem. 3`. Vide sur les 9 profils **parce qu'aucune fixture ne porte d'exercice cardio**, pas par défaut de câblage. |

### I3 — Le test de consommation : 13 sorties variables, 15 invariantes toutes légitimes

Méthode : capturer le texte rendu de chaque conteneur, pour **9 profils** aux historiques très
différents (0 à 562 séances, PR de 22 kg à 340 kg), et repérer ce qui **ne bouge jamais**.

**Variables (13)** — la consommation est réelle :
`muscleList`, `liftsList`, `radarContainer`, `radarLegend`, `reportDisplay`, `stats-volume`,
`stats-muscles`, `mg-0` à `mg-5` (8 valeurs distinctes chacune), `strengthRatiosContent` (8),
`volumeLandmarksContent` (7), `cardioStatsContent` (2), `stats-records` (3).

**Invariantes (15)** — après vérification, **toutes légitimement statiques** : `reportButtons`,
`volumeButtons`, `radarBtn7`, `radarBtn30`, `muscleViewBarsBtn`, `muscleViewEvolBtn`, `liftsFilterRow`,
`chev-mg-0` à `chev-mg-6` (chevrons « ▾ »), et `mg-6` (cf. I2).

**Aucune valeur affichée ne s'est révélée figée sur un repli.** C'était le risque principal annoncé
pour cette vague ; il ne se matérialise pas.

### I4 — 🔴 Le point F14 se répète : 4ᵉ surface d'affichage de l'e1RM

Sous-onglet **Records**, profil `aurel_like` (`db.bestPR.squat = 145`) :
```
1  Squat (Barre)  SBD  ×1.48 bw  38 séances   🏋️ 145 kg   est. 158 kg e1RM   30/03/2026
```
Le PR réel et l'e1RM sont affichés **côte à côte**, tous deux étiquetés. C'est la 4ᵉ surface relevée
par l'audit après « Correction des Records » (vague 1, F14), l'accueil (vague 3, H3) et le Coach.
**[VOULU ?]** — l'étiquetage est explicite ici (`🏋️` vs `est. … e1RM`).

### I5 — 🔴 Aucune borne de plausibilité : « Squat 315 kg · ×3.94 bw » affiché tel quel

Profil `donnees_sales` (`bestPR.squat = 315`, poids de corps 80 kg — saisie en lbs manifestement) :
```
1  Squat (Barre)  SBD  ×3.94 bw  4 séances   🏋️ 315 kg   est. 354 kg e1RM   20/07/2026
```
Aucun signalement, aucune borne. Le ratio **×3,94 poids de corps** est affiché comme une performance
ordinaire. Recoupe le point « garde-fous données sales » du backlog post-bêta (CLAUDE.md #5), ici
**observé à l'écran** sur la surface Stats.

---

## PHASE 2 — 28 VERDICTS

| # | Élément | Source | Champ db | Écrit par | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|---|
| 1 | `tab-stats` | markup | — | `showTab` | oui | ➖ conteneur | ✔ visible |
| 2 | `stats-volume` | markup | `db.logs` | `showStatsSub` 16073 | oui (défaut) | ✅ CÂBLÉ | ✔ visible |
| 3 | `reportButtons` | markup | — | statique | oui | ➖ COSMÉTIQUE | ✔ visible |
| 4 | `reportDisplay` | markup | `db.logs` | `renderReports` | oui | ✅ CÂBLÉ | ✔ visible |
| 5 | `volumeButtons` | markup | — | statique | oui | ➖ COSMÉTIQUE | ✔ visible |
| 6 | `chartVolume` | markup | `db.logs` | `renderVolumeChart` (Chart.js) | oui | ✅ CÂBLÉ | ✔ visible |
| 7 | `stats-muscles` | markup | `db.logs` | `showStatsSub` 16074 | oui | ✅ CÂBLÉ | ✔ visible |
| 8 | `radarBtn7` | markup | — | statique | oui | ➖ COSMÉTIQUE | ✔ visible |
| 9 | `radarBtn30` | markup | — | statique | oui | ➖ COSMÉTIQUE | ✔ visible |
| 10 | `radarContainer` | markup | `db.logs` | `renderRadarImproved` | oui | ✅ CÂBLÉ | ✔ visible |
| 11 | `radarLegend` | markup | idem | idem | oui | ✅ CÂBLÉ | ✔ visible |
| 12 | `muscleViewBarsBtn` | markup | — | bascule de vue | oui | ➖ COSMÉTIQUE | ✔ visible |
| 13 | `muscleViewEvolBtn` | markup | — | bascule de vue | oui | ➖ COSMÉTIQUE | ✔ visible |
| 14 | `muscleViewBarsSection` | markup | `db.logs` | `renderMuscleList` | oui (défaut) | ✅ CÂBLÉ | ✔ visible |
| 15 | `muscleList` | markup | `db.logs` + `MUSCLE_PARENT_MAP` | `renderMuscleList` 10718 | oui | ✅ CÂBLÉ | ✔ visible |
| 16 | `muscleViewEvolSection` | markup | `db.logs` | bascule « Évolution » | sur bascule | ✅ CÂBLÉ | ✔ conditionnel |
| 17 | `muscleEvolFilters` | markup | — | idem | dans #16 | ✅ CÂBLÉ | ✔ conditionnel |
| 18 | `chartMuscleEvol` | markup | `db.logs` | `renderMuscleChart` | dans #16 | ✅ CÂBLÉ | ✔ conditionnel |
| 19 | `muscleEvolLegend` | markup | idem | idem | dans #16 | ✅ CÂBLÉ | ✔ conditionnel |
| 20 | `volumeLandmarksContent` | markup | `computeWeeklyVolume` | `renderVolumeLandmarks` 10080 | oui | ✅ CÂBLÉ | ✔ visible |
| 21 | `strengthRatiosContent` | markup | `db.bestPR` + `STRENGTH_RATIO_TARGETS` | `renderStrengthRatios` | oui | ✅ CÂBLÉ | ✔ visible |
| 22 | `stats-records` | markup | `db.bestPR`, `db.exercises` | `showStatsSub` 16075 | oui | ✅ CÂBLÉ | ✔ visible |
| 23 | `liftsFilterRow` | markup | — | statique | oui | ➖ COSMÉTIQUE | ✔ visible |
| 24 | `liftsList` | markup | `db.bestPR` + e1RM | `renderLifts` | oui | ⚠️ **e1RM affiché** — cf. I4, I5 | ✔ visible |
| 25 | `stats-cardio` | markup | `db.logs` + `db.activityLogs` | `showStatsSub` 16076 | oui | ✅ CÂBLÉ | ✔ visible |
| 26 | `cardioStatsContent` | markup | `computeCardioStatsData` | `renderCardioStats` 16262 | oui | ✅ CÂBLÉ | ✔ visible |
| 27 | `chev-mg-<n>` ×7 | **runtime** | — | `renderMuscleList` | oui | ➖ COSMÉTIQUE | ✔ visible |
| 28 | `mg-<n>` ×7 | **runtime** | `db.logs` (volume par parent) | `renderMuscleList` 10730 | oui | ⚠️ **DIVERGENT** (ligne Cardio) — cf. I1 | ✔ visible |

**Décompte** : ✅ CÂBLÉ 18 · ⚠️ DIVERGENT 2 · ➖ COSMÉTIQUE 8 = **28**.
Runtime : ✔ visible 24 · ✔ conditionnel 4 = **28**. Aucune ligne sans statut.

---

## PHASE 3 — CROISEMENT INVERSE

| Champ | UI pour voir | UI pour modifier | Constat |
|---|---|---|---|
| `db.bestPR` | ✅ Records + ratios | ✅ (Réglages → Correction, vague 1) | ✅ |
| **`db.exercises[].e1rm`** | ✅ « est. 158 kg e1RM » | ❌ **aucune** | ⚠️ affiché, non corrigeable — cf. I4 |
| `db.logs` | ✅ volume, muscles, records, cardio | partiel (Séances) | ✅ |
| **`db.activityLogs`** | ✅ sous-onglet Cardio | ❌ depuis Stats | ⚠️ ignoré par la répartition musculaire — cf. I1 |
| `db.gamification.muscleXP` | ✅ « ⚡ XP musculaire » | ❌ | ✅ |
| `STRENGTH_RATIO_TARGETS` (constantes) | ✅ via les ratios | ❌ (constantes moteur) | ✅ **[VOULU]** |

Aucun champ **écrit** depuis Stats : c'est une surface de **lecture pure**. Conséquence directe pour la
phase 5d : **aucun nouveau champ non signé** ne peut provenir de cette vague.

---

## PHASE 5 — VÉRIFICATION RUNTIME

- **5a** — 36 états (9 profils × 4 sous-onglets). Les 4 éléments jamais visibles au repos (#16-19,
  vue « Évolution ») sont **conditionnels** : révélés par la bascule Barres/Évolution.
- **5b** — sans objet : aucun champ éditable sur cette surface (lecture pure, cf. phase 3).
- **5c** — c'était le cœur de la vague. 9 historiques distincts, capture du texte rendu, recherche des
  invariants : **13 variables, 15 invariantes toutes légitimement statiques**. Aucune valeur figée sur
  un repli. ⚠️ **Un défaut de mon propre test a d'abord produit 20 faux invariants** — corrigé et
  documenté en I2.
- **5d** — aucune écriture → aucun push à mesurer.

**Aucune ligne sans statut runtime.**

---

## Angles morts de cette vague

- **Les graphiques Chart.js** (`chartVolume`, `chartMuscleEvol`) sont vérifiés comme *conteneurs
  rendus*, pas comme *courbes justes* : je n'ai pas lu les données du canvas.
- **La justesse des chiffres** n'est pas l'objet de cet audit (c'est celui des audits 01-03) : je
  vérifie que la sortie **dépend** de l'entrée, pas qu'elle soit correcte.
- Aucune fixture ne porte d'exercice cardio ni de séance filtrée par période courte.
- **Aucun device Android réel.**

## À VÉRIFIER CÔTÉ SUPABASE

1. **I5** — combien de comptes ont un `bestPR` implausible (> 3× le poids de corps) ?
   `select user_id, data->'bestPR', data->'user'->>'bw' from sbd_profiles;`
2. **I1** — quels comptes ont des `activityLogs` de type cardio ? (mesure de la portée de l'écart)
