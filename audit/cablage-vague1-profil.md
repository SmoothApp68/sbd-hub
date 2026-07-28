# Audit de câblage — Vague 1 : onglet Profil (Corps, Réglages, RGPD)

> **READ-ONLY.** Aucune modification de code, aucun fix, aucune recommandation, aucune priorisation.
> Date : 28/07/2026 · Base : `main` = `a1c2444` · SW `trainhub-v377`.
> Objet : mesurer l'ampleur du pattern « UI et code non connectés » après 4 cas isolés trouvés le 27/07
> (pont plan→GO, `tempoEcc`, `trainingDuration`, `fatPct`).

## Note de méthode — à lire avant les résultats

Cet audit devait être produit par une exploration parallèle (7 agents). **5 des 6 agents ont échoué**
sur un blocage d'outillage et n'ont produit aucune donnée. **L'audit ci-dessous a donc été réalisé
directement**, par grep, fichier par fichier.

**Conséquence sur la couverture — à ne pas surinterpréter** :
- ✅ **Exhaustif et vérifié ligne à ligne** : les 6 points d'attention, les consentements/RGPD, les
  champs `db.user` du balayage inverse, les handlers d'écriture des Réglages et du Corps.
- ⚠️ **Partiel** : je n'ai PAS audité un par un chaque élément affiché de l'en-tête Profil, ni chaque
  ligne des accordéons Glossaire / Statut & Thèmes / Correction des Records. Ces zones ne sont
  **pas** couvertes par ce rapport — leur absence ici ne vaut pas certificat de bon fonctionnement.

Tout ce qui est affirmé ci-dessous est **vérifié par grep**. Ce qui est supposé est marqué comme tel.

---

## 1. Les 6 points d'attention — verdicts

### 1.1 `trainingDuration` vs `programParams.duration` — 🔴 CHAMP FANTÔME (confirmé)

| | |
|---|---|
| Écrit par | **JAMAIS.** `grep -rn "trainingDuration\s*=" js/ index.html` → **0 résultat** |
| Lu par | **6 sites**, tous en priorité **avant** `programParams.duration` |

Sites de lecture : `app.js:11443`, `25221`, `25265`, `26067`, `27133`, `27342`.
Motif systématique : `(db.user && db.user.trainingDuration) || params.duration || 90`.

**Mécanique** : le champ étant toujours `undefined`, l'expression retombe systématiquement sur
`params.duration`. Le fantôme est donc **inoffensif tant qu'il reste vide** — mais si une valeur y
atterrissait (import, sync d'un blob ancien), elle **écraserait silencieusement** le réglage Durée de
l'utilisateur sur les 6 sites. C'est exactement ce qui est soupçonné chez une utilisatrice réelle
(valeur `60` présente en base).

⚠️ Nuance : `app.js:27342` lit `trainingDuration || programParams.duration`, les 5 autres lisent
`trainingDuration || params.duration` (paramètre de fonction). Deux chaînes de repli différentes.

### 1.2 `fatPct` — ✅ CÂBLÉ (le soupçon initial est RÉFUTÉ)

| | |
|---|---|
| Écrit par | **index.html:2759** — `onchange` inline : `db.user.fatPct=parseFloat(this.value)||null;saveDB()` |
| Lu par | `engine.js:1178-1187` → `calcTDEEKatchMcArdle` (engine.js:1141) si `0 < fatPct < 50` |
| Rendu | Atteignable — champ visible dans Réglages → Profil Athlète, pré-rempli par `app.js:15368` |

**Correction d'une hypothèse de départ** : `fatPct` était listé comme « UI existe, rien ne la remplit ».
C'est **faux**. Le handler d'écriture existe, en `onchange` inline dans le markup — il n'apparaît pas
si l'on cherche une fonction nommée côté JS, ce qui explique le faux positif initial. La chaîne
Katch-McArdle est complète et active.

*Le seul reproche factuel* : le champ n'est pas collecté à l'onboarding (c'est l'objet du morceau (b)
de la refonte), donc `fatPct` reste `null` pour tout utilisateur qui ne visite pas les Réglages.

### 1.3 `db.user.targets` (objectifs SBD) — ✅ CÂBLÉ, avec deux voies d'écriture

Deux chemins d'écriture distincts, **tous deux avec rafraîchissement** :

| Chemin | Écrit | Rafraîchit |
|---|---|---|
| Réglages → `updateTarget` (app.js:17843) | `db.user.targets[type]` (17850) | `fillTargetSettings()` + `renderCoachToday()` (17853-17854) |
| Coach inline (app.js:~20882) | `db.user.targets[type]` (20894) | `renderCoachToday()` (20901) |

Lecteurs réels : `app.js:9466`, `11761`, `17867`, `20589`, `3662` (keyLifts), `coach.js:171`.

**Le point « l'affichage ne se rafraîchit qu'au reload » n'est PAS reproduit ici** : les deux chemins
appellent un render. **HYPOTHÈSE non vérifiée** : si le symptôme existe en device, il porterait sur une
surface *tierce* qui affiche les objectifs sans être re-rendue par ces deux appels (ex. l'onglet Stats
ou une carte Home) — hors périmètre de cette vague, à vérifier en vague 3/4.

### 1.4 `bwBase` / `kcalBase` — ⚠️ DIVERGENT (deux chaînes caloriques concurrentes)

| | |
|---|---|
| Écrits par | `updateNutriTargets` (app.js:17551-17554) et `app.js:10806-10809`, depuis `#inputKcalBase` / `#inputBWBase` |
| Lus par | `calcCalorieCible` (engine.js:1359-1364) **uniquement** |

`calcCalorieCible` est consommée à **3 endroits du sous-onglet Corps** : `app.js:16468`, `16596`, `16694`.

**Mécanique de la divergence** — `calcCalorieCible` est une chaîne **parallèle** à `calcTDEE` :

```js
function calcCalorieCible(bw) {            // engine.js:1359
  const kcalBase = db.user.kcalBase || 2300;
  const bwBase   = db.user.bwBase   || 98;   // ⚠️ défaut 98 ici…
  if (!bw || bw <= 0) return kcalBase;
  return Math.round(kcalBase * (bw / bwBase));
}
```

Trois observations vérifiées :
1. C'est une **simple règle de trois** sur un `kcalBase` saisi à la main — elle n'utilise ni l'âge, ni
   la taille, ni le `fatPct`, ni le TRIMP, contrairement à `calcTDEE` (engine.js:1144).
2. **Le défaut de `bwBase` diverge** entre `defaultDB` (**80**, app.js:84) et `calcCalorieCible`
   (**98**, engine.js:1361). Deux valeurs de repli pour la même donnée.
3. Résultat : le sous-onglet **Corps** affiche une cible calorique issue de `calcCalorieCible`, pendant
   que le **Coach** affiche celle de `calcTDEE` — **deux chiffres pour la même personne**.

Cela **confirme indépendamment le fix #2 du scope de lancement** (CLAUDE.md §17), toujours ouvert.

Champ associé : **`db.user.tdee`** — lu en `app.js:15873` et `16468` (`db.user.tdee || …`), **jamais
écrit** (grep exhaustif : 2 résultats, tous deux des lectures). 🔴 **CHAMP FANTÔME**, inoffensif
(retombe toujours sur le calcul).

### 1.5 Consentements — ✅ écrits et lus, mais ⚠️ une promesse non tenue

| Champ | Écrit par | Lu par | Verdict |
|---|---|---|---|
| `consentHealth` | modal RGPD (app.js:1580), onboarding (3023), révocation (1593/1604) | `checkRequiredConsents` (1549), garde de génération (3088), export (1937), affichage RGPD (1616) | ✅ CÂBLÉ |
| `medicalConsent` | onboarding (3025), `obFinish` (3712) | **garde de génération (3088) uniquement** | ✅ CÂBLÉ (mono-consommateur) |

Il existe bien une UI de **consultation ET de révocation** : `renderRGPDSection` (app.js:1614) affiche
l'état + la date, `revokeHealthConsent` (app.js:1591) permet de retirer le consentement.

🔴 **Écart vérifié entre la promesse et le code.** La modale de révocation affiche (app.js:1601) :

> « Retirer ton consentement désactivera les modules HRV, FC repos et suivi menstruel. »

**Aucun de ces trois modules ne teste `consentHealth`.** Vérifié par grep :
- suivi menstruel → gaté sur `db.user.menstrualEnabled` (app.js:18142)
- FC repos / HRV → gatés sur `db.garminHealth` (app.js:23170, 29044)
- `grep consentHealth` dans les modules santé → **0 résultat**

Retirer son consentement **n'a donc aucun effet** sur la collecte ou l'usage des données de santé : cela
ne change que l'affichage de la section RGPD et re-déclenche la modale au prochain `postLoginSync`.
Sur une app santé soumise au RGPD, l'écart entre ce qui est annoncé à l'utilisateur et ce que le code
fait est un fait à connaître.

### 1.6 `morpho` — ⚠️ DIVERGENT, une clé sur quatre partiellement orpheline

Ce que **q4 collecte** (`obSaveQ4`, app.js:2812-2817) : `long_femurs`, `short_arms_long_torso`,
`long_arms`, `short_torso`.

| Table consommatrice | Clés attendues | Correspondance |
|---|---|---|
| `MORPHO_SUBSTITUTIONS` (engine.js:3424) | `long_femurs`, `long_arms`, `short_arms_long_torso`, `short_torso` | ✅ **les 4 correspondent** |
| `JOINT_MORPHO_COEFFS` (engine.js:3412) | `long_femurs`, `long_arms`, `short_torso`, **`long_torso`** | ⚠️ **`long_torso` n'est jamais collecté** ; `short_arms_long_torso` n'y est pas attendu |

**Verdict précis, clé par clé** :
- `long_femurs`, `long_arms`, `short_torso` → ✅ consommées par les **deux** tables.
- `short_arms_long_torso` → ✅ consommée par `MORPHO_SUBSTITUTIONS` (substitution deadlift), ❌ **sans
  effet sur la charge articulaire** (`JOINT_MORPHO_COEFFS` ne connaît pas cette clé).
- `long_torso` (coefficient hanches ×1.1) → 🔴 **RENDU INATTEIGNABLE** : aucune UI ne collecte cette
  clé, le coefficient ne s'applique donc jamais.

**Nuance par rapport à la note de backlog existante** : celle-ci indiquait « la réponse 2 de q4 n'a
aucun effet ». C'est **inexact** — elle a bien un effet sur les substitutions d'exercices, mais aucun
sur la charge articulaire. L'asymétrie est réelle, sa portée est plus étroite qu'annoncé.

---

## 2. Sous-onglet Corps

| Champ affiché | Chemin db | Écrit par | Lu par | Atteignable ? | Verdict |
|---|---|---|---|---|---|
| Poids du jour (saisie) | `db.body[].bw` + `db.user.bw` | `saveBodyEntry` (import.js:1596) | 12+ sites (graphe, TDEE, DOTS, badges) | oui | ✅ CÂBLÉ |
| Macros (P/G/L/kcal) | `db.body[].prot/carb/fat/kcal` | `saveMacroEntry` (import.js:1610) | `app.js:9786`, `16463`, `16591`, `16698`, badge nutrition (7368) | oui | ✅ CÂBLÉ |
| Calcul auto des kcal | (aucun — placeholder) | `updateCalcCalories` (import.js:1626) | — (écrit un `placeholder`, pas une donnée) | oui | ✅ (UI pure) |
| Cible calorique affichée | via `calcCalorieCible` | `kcalBase`/`bwBase` (Réglages) | `app.js:16468`, `16596`, `16694` | oui | ⚠️ **DIVERGENT** (cf. 1.4) |
| Graphe de poids | `db.body[].bw` | idem saisie | `app.js:16623`, `16729` | oui | ✅ CÂBLÉ |
| `db.user.tdee` | `db.user.tdee` | **JAMAIS** | `15873`, `16468` (en repli) | — | 🔴 **CHAMP FANTÔME** |

`db.body` est bien câblé et largement consommé (12+ sites vérifiés). **NON VÉRIFIÉ** : sa
synchronisation cloud (aucune trace dans `_buildSyncedBlob`) — à confirmer, hors périmètre.

---

## 3. Sous-onglet Réglages — champs écrits par l'UI

Handlers d'écriture inventoriés (index.html:2749-3143), tous **vérifiés** :

| Champ | Écrit par | Lu par | Verdict |
|---|---|---|---|
| `name`, `bw`, `level`, `trainingMode` | `saveProfileSettings` / `updateProfileField` (17825) | nombreux | ✅ CÂBLÉ |
| `height`, `age` | `updateProfileField` (17830) | `calcTDEE` (Mifflin) | ✅ CÂBLÉ |
| `gender` | `setSettingsGender` (app.js) | cycle, coefficients genoux (engine.js:3890) | ✅ CÂBLÉ |
| `fatPct` | onchange inline (index.html:2759) | `calcTDEE` Katch | ✅ CÂBLÉ |
| `targets.*` | `updateTarget` (17843) | 6 sites | ✅ CÂBLÉ |
| `kcalBase`, `bwBase` | `updateNutriTargets` (17551) | `calcCalorieCible` seul | ⚠️ DIVERGENT |
| `injuries` | `setInjuryLevel` (17932) | générateur, prehab, morpho | ✅ CÂBLÉ *(sauf `coude`, cf. vague onboarding)* |
| `cycleTracking`, `menstrualEnabled` | `toggleCycleTracking`, `updateCycleField` | `getCycleCoeff`, volume | ✅ CÂBLÉ |
| `prehabEnabled` | `setPrehabEnabled` | `app.js:14567`, `18074` | ✅ CÂBLÉ |
| `weightCut` | `toggleWeightCut` (18539), `saveWeightCutData` (18560) | 36 sites | ✅ CÂBLÉ |
| **`targetBW`** | `updateProfileField` (17830) | **rien** (17589 ne fait que re-remplir le champ) | 🔴 **DONNÉE MORTE** |
| **`uiDetail`** | onchange inline (index.html) | `app.js:12`, `59` | ✅ CÂBLÉ |

### 🔴 `targetBW` — DONNÉE MORTE (vérifié)

`grep -rniE "targetbw|target_bw|poids cible"` sur `js/` + `index.html` → **3 sites seulement** :
- `app.js:84` (défaut `null`) · `app.js:168` (migration) · `app.js:17830` (écriture UI)
- `app.js:17589` : `tBwEl.value = db.user.targetBW || ''` — **re-remplit le champ de réglage**, ce qui
  n'est pas une consommation métier.

L'utilisateur saisit un **poids cible** ; aucune décision, aucun calcul, aucun affichage ne l'utilise.

---

## 4. Confidentialité & RGPD

| Élément | Écrit par | Lu par | Verdict |
|---|---|---|---|
| Consentement santé | modal + onboarding + révocation | 4 sites (dont 2 gardes réelles) | ✅ CÂBLÉ ⚠️ *promesse de révocation non tenue (1.5)* |
| Consentement médical | onboarding (3025), `obFinish` (3712) | garde de génération (3088) | ✅ CÂBLÉ |
| Export JSON | `exportData` | inclut `consentHealth` (1937), `db.body` (1943) | ✅ CÂBLÉ |
| Suppression de compte | `requestAccountDeletion` → Edge Function | — | ✅ CÂBLÉ *(vérifié en chantier RGPD antérieur)* |
| Déconnexion | `appSignOut` / `cloudLogout` → `_purgeLocalSession` | — | ✅ CÂBLÉ |

---

## 5. Le sens inverse — champs de données SANS UI

### A. `db.user` — aucune UI de consultation NI de modification

| Champ | Écrit par (interne) | Lu par | Remarque |
|---|---|---|---|
| `_realLevel` | code (validation de niveau) | 7 sites | niveau « réel » inféré, invisible et incorrigible |
| `obProfile` | dérivé à l'onboarding (`_deriveObProfile`) | 6 sites | archétype dérivé |
| `programMode` | code | 15 sites | UI dynamique partielle (`app.js:18086`) — **NON VÉRIFIÉ** si elle l'édite vraiment |
| `coachProfile` | code | 11 sites | |
| `lpActive`, `lpStrikes` | moteur LP (3 Strikes) | 3 / 14 sites | l'utilisateur ne voit jamais son état LP |
| `volumeDeltas` | moteur | 8 sites | |
| `tdeeAdjustment` | code | 5 sites | ajustement calorique appris, non consultable |
| `onboardingDate`, `onboardingVersion` | onboarding | 9 / 6 sites | |
| `ownerUid` | RC4 (`_stampOwner`) | 10 sites | normal (technique) |
| `menstrualData` | `toggleCycleTracking` | 10 sites | données saisies ailleurs, pas revues ici |
| `secondaryActivities` | onboarding (legacy) | 6 sites | supplanté par `activityTemplate` |
| **`coachEnabled`** | **JAMAIS** | **JAMAIS** | 🔴 **vestige total** — 2 occurrences en tout : `defaultDB` (84) et migration (199) |

### B. Clés de premier niveau de `db` sans UI de correction

`db.exercises` (registres e1RM DUP — pilotent les charges, **non consultables ni corrigeables**) ·
`db.weeklyPlanHistory` · `db.generatedProgram` · `db.gamification.*` (hors badges affichés) ·
`db.garminHealth` · `db.reports` · `db._obSeqTunnel` et autres flags `_`-préfixés.

**Le cas le plus notable** : `db.exercises[].e1rm` **pilote les charges prescrites** et n'a **aucune
interface** — un e1RM faussé (import sale, série mal saisie) ne peut être ni vu ni corrigé par
l'utilisateur. Seul `db.bestPR` dispose d'une UI (« Correction des Records »).

---

## 6. Synthèse chiffrée — l'ampleur du pattern

Sur le périmètre **effectivement vérifié** de cette vague :

| Verdict | Nombre | Champs |
|---|---|---|
| 🔴 CHAMP FANTÔME | **2** | `trainingDuration`, `db.user.tdee` |
| 🔴 DONNÉE MORTE | **2** | `targetBW`, `coachEnabled` |
| 🔴 RENDU INATTEIGNABLE | **1** | coefficient `long_torso` (`JOINT_MORPHO_COEFFS`) |
| ⚠️ DIVERGENT | **2** | chaîne calorique (`calcCalorieCible` vs `calcTDEE`), `morpho` (2 tables, clés désalignées) |
| ⚠️ Promesse non tenue | **1** | révocation du consentement santé sans effet sur les modules |
| ✅ CÂBLÉ | ~20 | l'essentiel des Réglages et du Corps |

**Le pattern se confirme, mais plus faiblement qu'anticipé sur cette surface** : la majorité des champs
des Réglages sont correctement câblés. Les cas rouges sont **peu nombreux et concentrés** — surtout,
**un des 4 cas initiaux (`fatPct`) est réfuté**.

Le constat le plus significatif de cette vague n'est pas un champ mort, mais deux écarts de nature
différente : la **double chaîne calorique** (deux chiffres pour la même personne, déjà au scope de
lancement) et l'**écart entre la promesse de révocation RGPD et son effet réel**.

---

## Ce que ce rapport ne couvre PAS

En-tête de l'onglet Profil (identité, XP, badges, rang) · accordéons Glossaire, Statut & Thèmes,
Correction des Records, Sauvegarde & Restauration, Import, Sync Cloud — inventoriés mais **non
audités champ par champ**. Synchronisation cloud de `db.body`. Les vagues 2 à 5 (Séances, Maison+Coach,
Stats, Social+Jeux).

Aucune modification de code n'a été faite. Aucune recommandation n'est formulée : ce rapport est un
état des lieux.
