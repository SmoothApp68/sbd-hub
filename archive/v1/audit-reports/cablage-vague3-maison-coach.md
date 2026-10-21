# Audit de câblage — Vague 3 : MAISON + COACH

> **READ-ONLY sur le code applicatif.** Aucun fix, aucune recommandation, aucune priorisation.
> Date : 28/07/2026 · Base : `origin/main` = `a1c2444` · SW `trainhub-v377`.

## CONTRÔLE D'EXHAUSTIVITÉ

> **Phase 1 : 62 éléments inventoriés. Phase 2 : 62 verdicts. Phase 5 : 62 statuts runtime.**

| Famille | Nombre | Comment |
|---|---|---|
| Éléments à `id` | **38** | union du DOM réel de `#tab-dash` et `#s-coach` sur **26 états** |
| **Cartes du Coach / Maison** (sans `id`) | **24** | recensées **par leur titre visible** sur les mêmes 26 états |
| **Total** | **62** | |

**Extension de méthode, imposée par la surface.** Les cartes du Coach **n'ont pas d'`id`** : un
inventaire par `id` les aurait toutes manquées (le Coach ne rend que 4 `id` sur le profil riche, alors
qu'il affiche 10 cartes). L'inventaire recense donc **deux familles** : les éléments identifiés *et*
les cartes, identifiées par leur titre. C'est la 3ᵉ extension de méthode de l'audit, après le markup
runtime (vague 1) et l'inventaire par le DOM (vague 2).

| Périmètre | Bornes |
|---|---|
| Maison | `index.html:2441-2487` + `renderDash`, `renderTodaySessionInline`, `renderPerfCard`, `renderQuickLogCard` |
| Coach | `#coach-today` / `#coach-history`, remplis par `renderCoachTab` / `renderCoachToday` (app.js) |
| États | 9 Maison + 17 Coach = **26** — profils `vierge`/`debutant`/`aurel_like`/`mono_lift`/`extreme_bas`/`extreme_haut`/`progression_nette`/`retour_apres_pause`/`donnees_sales`, × phases (deload, peak), × check-in bas/haut, × blessure active, × ACWR élevé, × femme + cycle, × « Voir plus » déplié, × historique |

---

## LES CONSTATS

### H1 — 🔴 L'accueil affiche une date de test que personne n'a jamais fixée

**Mesuré à l'écran**, sur les 3 profils : le bloc « RECORDS PERSONNELS » de la Maison affiche

```
RECORDS PERSONNELS      Test : 1 sept.
SQUAT   145kg  / 160    e1RM estimé : 158 kg
```

Or **le 1ᵉʳ septembre est exactement aujourd'hui (28/07/2026) + 35 jours** — vérifié par calcul.
C'est le repli de `db.user.plannedTestDate` :

```js
var plannedTestDate = (db.user && db.user.plannedTestDate)      // app.js:11784
  ? new Date(db.user.plannedTestDate)
  : new Date(Date.now() + 35 * 86400000);                        // ← toujours ce chemin
```
`plannedTestDate` est un **CHAMP FANTÔME** (relevé en vague 1, phase 3A) : **aucune écriture** dans
tout le dépôt. Le repli est donc systématique, pour tout le monde, et il est **présenté comme une
échéance** sur l'écran d'accueil. Une date glissante affichée comme un rendez-vous.

**Confiance : certain.** Mécanique + valeur affichée reproduites.

### H2 — 🔴 Trois cartes de l'accueil masquées en dur, dont une que les Réglages promettent encore

```js
// app.js:9397 — commentaire du code : « Maison v264 — anciennes cards remplacées
// par la composition 4 zones »
['dashWeekCard', 'quickLogCard', 'perfCard'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
});
```
Les trois sont **invisibles sur les 9 états Maison** — vérifié. La dépréciation est explicite et
assumée : **[VOULU]**.

Deux conséquences qui, elles, ne le sont pas :

1. **`renderPerfCard` (app.js:9866) continue de s'exécuter** et remplit `perfDisplay`, à l'intérieur du
   conteneur masqué. Elle a **4 sites d'appel** (9856, 9862, 9866, 10139), dont `saveKeyLifts`.
2. **Les Réglages promettent toujours cet affichage.** `index.html:2965`, accordéon « Exercices Clés » :
   > « Les exercices affichés dans la rubrique **Performance sur l'accueil**. Jusqu'à 6. »

   L'utilisateur configure jusqu'à 6 exercices clés (`db.keyLifts`) pour une rubrique **masquée depuis
   v264**. Même classe que l'écart RGPD de la vague 1 (F15) : une promesse d'interface que le code ne
   tient plus.

### H3 — 🔴 L'e1RM est affiché en clair sur l'écran d'accueil

Toujours dans « RECORDS PERSONNELS », pour chacun des trois lifts :
```
SQUAT   145kg  / 160     e1RM estimé : 158 kg
BENCH   140kg  / 143     e1RM estimé : 140 kg
DEAD    170kg  / 190     …
```
CLAUDE.md §7 : « e1RM = indicateur / tendance, **JAMAIS un record**. Ne l'affiche **jamais** comme un
chiffre à l'utilisateur. » Ici il est affiché, nommé, et **juxtaposé au PR réel** — 145 kg à côté de
158 kg pour le même lift, sur la première page de l'app.

C'est le **troisième** point d'affichage d'e1RM relevé par l'audit, après la section « Correction des
Records » (vague 1, F14 : « e1RM: 186kg » pour un deadlift dont le PR est 170).
**[VOULU ?]** — le libellé « e1RM estimé » est honnête et distinct de « 145kg ». Constat posé, pas tranché.

### H4 — ✅ Aucune carte du Coach n'est inatteignable : hypothèse RÉFUTÉE

C'était l'attente principale de cette vague. **Elle ne se vérifie pas.** Sur 26 états, **les 24 cartes
recensées apparaissent au moins une fois**. Aucune n'est structurellement morte.

Cartes rares (1 à 2 états sur 26) — rares par *condition*, pas par défaut :

| Carte | Apparaît sur |
|---|---|
| `👋 Bienvenue — Semaine 1 de calibration` | profil vierge |
| `🌸 Phase folliculaire tardive` / `🌸 Phase lutéale` | femme + cycle |
| `⚠️ Alerte Récupération — epaule` | blessure active |
| `📐 Analyse morphologique` | « Voir plus » déplié |
| `🔥 20 séances sur 30j — Mode Instinct dispo` | « Voir plus » déplié |
| `🔍 Exercice recommandé : Soulevé de Terre Roumain` | « Voir plus » déplié |
| `🏆 Compétition prévue ?` | mono-lift, extreme_haut |
| `🔄 3 séances identiques détectées` | progression_nette, ACWR élevé |

**Note** : « 📐 Analyse morphologique » **se rend bien**. CLAUDE.md (backlog post-bêta, §1) la dit
« déjà présente mais jamais branchée » — **c'est inexact au runtime**, elle s'affiche derrière « Voir plus ».

### H5 — Le budget de blocs masque 3 cartes sur 13

Profil riche, vue par défaut : **10 cartes**. Après « Voir plus » : **13**. Le budget en cache donc 3 —
`Analyse morphologique`, `Mode Instinct`, `Exercice recommandé`. Fonctionnement conforme à l'intention
documentée (CLAUDE.md v340). *Fait, pas jugement.*

### H6 — 🔴 Quatorze conteneurs hérités dans un bloc masqué, six encore alimentés

`index.html:2469-2486` — commentaire : « IDs conservés pour compatibilité avec les fonctions existantes » :
```html
<div style="display:none;">
  <div id="routineDisplay"></div>  <div id="readinessSparkline"></div>
  <div id="dotsWilksContent"></div> <div id="formScoreContent"></div>
  <div id="programViewer"></div>   <div id="trainingLogs"></div>
  … 14 conteneurs au total
</div>
```

| Conteneur | Écrivain JS |
|---|---|
| `routineDisplay`, `programViewer`, `trainingLogs`, `dayButtonsContainer`, `dayExercisesContainer`, `sbdTotalDisplay` | **1 chacun** → du rendu calculé et jeté |
| `readinessSparkline`, `dotsWilksContent`, `formScoreContent`, `todayProgramContent` | **0** → vestige pur |

Les 14 sont invisibles sur les 9 états Maison — vérifié. **[VOULU]** pour le masquage (le commentaire
l'assume) ; le coût de rendu des 6 encore alimentés, lui, n'est pas commenté.

---

## PHASE 2 — 62 VERDICTS

### A. Éléments à `id` (38)

| # | Élément | Source | Champ db | Écrit par | Atteignable | Verdict | Runtime |
|---|---|---|---|---|---|---|---|
| 1-18 | `tab-dash`, `welcomeCard`, `welcomeTitle`, `todaySessionInline`, `doms-morning-card`, `perfDisplay`, `s-coach`, `coach-today`, `coach-history`, + conteneurs de la timeline hebdo | markup | `db.logs`, `db.weeklyPlan`, `db.bestPR`, `db.readinessHistory` | `renderDash` / `renderTodaySessionInline` / `renderCoachToday` | oui | ✅ CÂBLÉ | ✔ visible |
| 19-21 | `dashWeekCard`, `quickLogCard`, `perfCard` | markup | — | masqués en dur app.js:9397 | **NON** | 🔴 **RENDU INATTEIGNABLE** [VOULU] — cf. H2 | ✔ inatteignable |
| 22 | `dashWeekContent` | markup | — | — (dans #19) | **NON** | 🔴 inatteignable | ✔ inatteignable |
| 23-36 | `routineDisplay`, `readinessSparkline`, `dotsWilksContent`, `formScoreContent`, `programViewer`, `trainingLogs`, `dayButtonsContainer`, `dayExercisesContainer`, `sbdTotalDisplay`, `todayProgramContent`, `acc-dash-reports-card`, `acc-dash-weekly-card`, `acc-dash-reports`, `acc-dash-weekly` | markup | divers | 6 encore alimentés, 4 vestiges | **NON** (bloc `display:none`) | 🔴 **RENDU INATTEIGNABLE** [VOULU] — cf. H6 | ✔ inatteignable |
| 37 | `coachHistoBadge` | markup | `db.reports[].read` | `updateCoachHistoBadge` 19098 | si rapport non lu | ✅ CÂBLÉ | ✔ conditionnel |
| 38 | `meso-*` / conteneurs Coach générés | **runtime** | `db.weeklyPlan.currentBlock` | `renderCoachToday` | oui | ✅ CÂBLÉ | ✔ visible |

### B. Cartes (24)

| # | Carte | États / 26 | Condition | Verdict | Runtime |
|---|---|---|---|---|---|
| 39 | `LE POINT DU JOUR` | 15 | toujours (hors vierge) | ✅ CÂBLÉ | ✔ visible |
| 40 | `Potentiel de Performance` | 15 | idem | ✅ CÂBLÉ | ✔ visible |
| 41 | `⚡ Budget Récupération` | 15 | idem | ✅ CÂBLÉ | ✔ visible |
| 42 | `📊 Diagnostic Athlétique` | 15 | idem | ✅ CÂBLÉ | ✔ visible |
| 43 | `🍽️ NUTRITION — JOUR DE REPOS` | 15 | idem | ✅ CÂBLÉ | ✔ visible |
| 44 | `Coach Algo · Calcul instantané · Sans IA` | 15 | pied de page | ✅ CÂBLÉ | ✔ visible |
| 45 | `💪 VOLUME / SEMAINE` | 14 | données de volume | ✅ CÂBLÉ | ✔ visible |
| 46 | `🦍 RECOMMANDATIONS` | 10 | recommandations dispo | ✅ CÂBLÉ | ✔ visible |
| 47 | `🦴 SANTÉ ARTICULAIRE (14 J)` | 8 | historique ≥ 14 j | ✅ CÂBLÉ | ✔ visible |
| 48 | `SEMAINE —` (timeline Maison) | 8 | toujours | ✅ CÂBLÉ | ✔ visible |
| 49 | `💪` (DOMS matinale) | 8 | séance prévue + DOMS non saisis | ✅ CÂBLÉ | ✔ visible |
| 50 | `🔋` (verdict d'intensité) | 6 | arbitre actif | ✅ CÂBLÉ | ✔ visible |
| 51 | `☀️ Check-in du jour` | 6 | pas de check-in du jour | ✅ CÂBLÉ | ✔ visible |
| 52 | `🏆 Compétition prévue ?` | 2 | pas de date de compétition | ✅ CÂBLÉ | ✔ conditionnel |
| 53 | `🔄 3 séances identiques détectées` | 2 | répétition détectée | ✅ CÂBLÉ | ✔ conditionnel |
| 54 | `Tout est prêt !` (welcomeCard) | 1 | 0 séance | ✅ CÂBLÉ | ✔ conditionnel |
| 55 | `SEMAINE 4` | 1 | bloc en semaine 4 | ✅ CÂBLÉ | ✔ conditionnel |
| 56 | `👋 Bienvenue — Semaine 1 de calibration` | 1 | profil vierge | ✅ CÂBLÉ | ✔ conditionnel |
| 57 | `🌸 Phase folliculaire tardive` | 1 | femme, phase folliculaire | ✅ CÂBLÉ | ✔ conditionnel |
| 58 | `🌸 Phase lutéale` | 1 | femme, phase lutéale | ✅ CÂBLÉ | ✔ conditionnel |
| 59 | `⚠️ Alerte Récupération — epaule` | 1 | blessure active | ✅ CÂBLÉ | ✔ conditionnel |
| 60 | `📐 Analyse morphologique` | 1 | « Voir plus » déplié | ✅ CÂBLÉ | ✔ conditionnel |
| 61 | `🔥 Mode Instinct dispo` | 1 | « Voir plus » + 20 séances/30 j | ✅ CÂBLÉ | ✔ conditionnel |
| 62 | `🔍 Exercice recommandé` | 1 | « Voir plus » déplié | ✅ CÂBLÉ | ✔ conditionnel |

**Décompte** : ✅ CÂBLÉ 44 · 🔴 RENDU INATTEIGNABLE 18 = **62**.
Runtime : ✔ visible 32 · ✔ conditionnel 12 · ✔ inatteignable 18 = **62**. Aucune ligne sans statut.

---

## PHASE 3 — CROISEMENT INVERSE

| Champ | UI pour voir | UI pour modifier | Constat |
|---|---|---|---|
| **`db.user.plannedTestDate`** | ✅ « Test : 1 sept. » sur l'accueil | ❌ **aucune** | 🔴 **CHAMP FANTÔME AFFICHÉ** — cf. H1 |
| **`db.keyLifts`** | ❌ (conteneur masqué depuis v264) | ✅ Réglages → Exercices Clés | 🔴 configurable mais **jamais rendu** — cf. H2 |
| `db.readinessHistory` | ✅ carte Check-in + Point du jour | ✅ check-in | ✅ |
| `db.weeklyPlan.currentBlock` | ✅ timeline + méso | ❌ (dérivé) | ✅ |
| `db.reports` | ✅ Coach → Historique + badge | ❌ | ✅ |
| `db.bestPR` | ✅ Records personnels (accueil) | ✅ Réglages → Correction | ✅ |
| `db.exercises[].e1rm` | ✅ **« e1RM estimé » sur l'accueil** | ❌ | ⚠️ affiché, non corrigeable — cf. H3 |
| `db.user.targets` | ✅ « / 160 » sur l'accueil | ✅ Réglages + Coach inline | ✅ |
| `db.gamification.*` (streak) | ✅ « 4 🔥 STREAK » | ❌ | ✅ |

---

## PHASE 5 — VÉRIFICATION RUNTIME

Banc `audit/runtime/`, réseau intégralement stubbé, 26 états.

- **5a** : les 18 inatteignables **confirmés** (invisibles sur tous les états, masquage en dur tracé
  dans le code). Les 12 conditionnels **confirmés** par l'état qui les déclenche.
- **5b/5c** : la Maison et le Coach sont des surfaces de **lecture** — aucun champ éditable en propre
  hors check-in (couvert par les cartes) et objectifs SBD inline (aller-retour déjà confirmé en vague 1).
  La consommation est vérifiée par différence entre profils : le contenu des cartes **change**
  effectivement selon le profil (`html` de 1 372 o sur `vierge` à 18 879 o sur riche + « Voir plus »).
- **5d** : aucune écriture propre à cette surface → aucun nouveau champ non signé.

**Aucune ligne sans statut runtime.**

---

## Angles morts de cette vague

- Le **contenu chiffré** des cartes n'est pas audité ligne à ligne (c'est l'objet des audits 01-03) :
  je vérifie qu'elles s'affichent et d'où vient leur donnée, pas la justesse de chaque seuil.
- Les cartes sont identifiées par leur **titre visible** : deux cartes au même titre seraient comptées
  une fois. Aucun doublon détecté sur les 26 états.
- **Aucun device Android réel.**

## À VÉRIFIER CÔTÉ SUPABASE

1. **H1** — `data.user.plannedTestDate` existe-t-il pour un seul compte réel ?
   `select user_id, data->'user'->>'plannedTestDate' from sbd_profiles;` (attendu : NULL partout)
2. **H2** — combien de comptes ont un `data.keyLifts` non vide ? (mesure du travail utilisateur investi dans
   une rubrique masquée) `select user_id, jsonb_array_length(data->'keyLifts') from sbd_profiles;`
