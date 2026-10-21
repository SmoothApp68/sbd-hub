# READY-C2-d — Rapport : clôture de la fusion des saisies

Branche : `feat/ready-c2d-cloture` · Base : `main` = `0844384` (C2-c, v285 après ce lot).
Commits (tous verts, règle PROMPT_RULES appliquée) :
`f79ac99` retrait des miroirs · `8d6a0af` désarmement fossile stress ·
`d2b2deb` bannière + glossaire + CTA · `d6a5f3e` test gate comportemental ·
+ correction bannière (`/5`) & bump v285 (commit final).

## Étape 0 — Synchronisation de main (prérequis bloquant)

- État au départ : `origin/main` = `f568ddd` (C2-b, v283). `feat/ready-c2c-rebranchement`
  (`0844384`, v284) non mergée ; son parent C2-b (`f568ddd`) était bien le tip de main.
- Vérifié `git merge-base --is-ancestor f568ddd c2c` → vrai (fast-forward propre).
- Fast-forward `origin/main` → `0844384`. **`main` après synchro = `0844384`**, v284, 129/129 verts.
- Branche `feat/ready-c2d-cloture` créée depuis ce `main`.

## 1. Retrait des miroirs d'écriture (`f79ac99`)

`saveDailyCheckin` n'écrit plus que `db.readinessHistory` (+ `activeWorkout.readiness`
si séance active, inchangé). Confirmé par grep avant retrait que les seuls lecteurs
résiduels de `db.readiness`/`todayWellbeing` étaient la couche d'accès elle-même.
- **db.readiness** : écriture supprimée ; store **conservé en lecture** (fallback
  transitoire de `getTodayCheckin`, entrées pré-C2-b). Non purgé.
- **todayWellbeing** : écriture supprimée (avec le merge rhr/rhrAlert devenu inerte
  en C2-c) ; store **conservé en lecture** (rétrocompat `hasTodayCheckin`). Non purgé.
- **wellbeingHistory** : écriture supprimée (0 lecteur depuis le diagnostic). Non purgé.
- Tests : 4 tests d'écritures-miroir C2-b remplacés (même commit) par « miroirs non
  écrits » + garde de forme `readinessHistory` **strictement identique à C2-b** (clés gelées).

## 2. Désarmement du fossile `stress` (`8d6a0af`)

`getStressVolumeModifier` : branche `todayWellbeing.stress ≥ 4 → ×0.80` **supprimée**
(mine dormante prouvée armée par C2-a, jamais nourrie). Proxy vivant
`motivation5 ≤ 2 ∧ sleep5 ≤ 3 → ×0.80` conservé. Test `fossile_stress_inerte`
supprimé (même commit) → remplacé par `stress_desarme` (régression-garde : un champ
`stress`, où qu'il soit posé, ne déclenche plus rien).

## 3. Bannière + glossaire + CTA (`d2b2deb` + correctif final)

- `getReadinessBannerHtml` détail : réécrit — 4 vrais items (sommeil/énergie/motivation/
  **fraîcheur musculaire**), pondérations Helms réelles (35/25/15/25 %), score /100.
  Plus de `r.stress` (undefined), plus de « courbatures », plus de formule fictive
  « (somme)/20 », plus de suffixe `/5` (l'emoji EST l'échelle de saisie).
- `GLOSSARY.readiness` : réécrit (4 critères réels emoji 1-5, pondérations Helms, /100).
- CTA Batterie Nerveuse : « Bilan du matin / Faire le bilan » → « Check-in du jour /
  Faire le check-in ». Deep-link inchangé (cible toujours le composant Coach `s-coach`).
- Note : le premier jet montrait « X/5 » (valeurs 1-5 exactes mais le sweep exige
  zéro `/5`) — corrigé dans le commit final au profit des pondérations seules.

## 4. Durcissement du test du gate unifié (`d6a5f3e`)

L'assertion méta de `double_saisie_impossible` (valeur de retour d'une façade)
remplacée par un test **comportemental** (stub `document` comptant les créations
d'éléments) :
- Sens 1 : check-in présent → `showReadinessModal` rend la main (callback déclenché)
  **sans monter de modal** (`created === 0`), + contrôle prouvant `created > 0` sans
  check-in (le 0 vient bien du gate).
- Sens 2 : check-in présent → `renderMorningCheckin()` retourne `''` (carte masquée) ;
  aucun check-in → la carte rend le composant.
- « Passer » : skip ferme le modal du jour mais la carte Coach reste affichée
  (skip ≠ check-in).
- `extractVar` généralisé aux littéraux tableau (`CHECKIN_ITEMS`).

## Tests

```
Test Suites: 5 passed, 5 total
Tests:       130 passed, 130 total   (0 rouge, 0 skip — vert à CHAQUE commit)
```
Parcours du compte : 129 (C2-c) → 126 (retrait miroirs : −3) → 126 (stress : ±0) →
126 (bannière : ±0) → 130 (gate : −1 méta +4 comportementaux +1 contrôle).

## Sweep final

- **Écritures** `db.readiness`/`todayWellbeing`/`wellbeingHistory` : plus aucune écriture
  de données. Restent uniquement les **inits défensifs idempotents** du bloc migrations
  (`app.js:478 wellbeingHistory = []`, `app.js:618 db.readiness = db.readiness || []`) —
  pas des écritures d'entrées, laissés en place (ne pas toucher l'existant ; `db.readiness`
  doit défaut-er à `[]` pour le fallback de lecture).
- **`.stress`** hors stockage prod : **vide** (grep `\.stress\b` → 0 hit hors commentaires).
- **`/20` / `/5`** dans bannière/glossaire : **vide** (vérifié par grep ciblé ET par
  assertion Playwright `bannerHasSlash5:false`, `bannerHasSlash20:false`, `glossHasSlash20:false`).

## Vérification visuelle (Playwright, capture `/tmp/c2d-visual.png`)

- Bannière (check-in 68 → « correcte ») détail : « 😴 Sommeil · ⚡ Énergie · 🧠 Motivation
  · 🦵 Fraîcheur musculaire / Pondération Helms : 35 % · 25 % · 15 % · 25 % / Score :
  68 / 100 ». Aucun stress, aucun /5, aucun /20, fraîcheur présente.
- Carte « ☀️ Check-in du jour » (aucun check-in) : 4 items emoji + douleurs + Confirmer.
- Carte masquée quand check-in du jour présent. Zéro pageerror.

## État final de la feature

`db.readinessHistory` est l'unique store de check-in (écriture). Plus aucun contrat
menteur sur la readiness : saisie unique (C2-b), lecteurs sur couche d'accès unique
(C2-c), miroirs/fossiles retirés et UI véridique (C2-d).

## Signalements hors-scope (non traités)

1. **Branchement `loadAdjustment`** sur les charges → **C3** (toujours stocké dans
   `activeWorkout.readiness`/`session.readiness`, jamais consommé sur la charge).
2. **Dédup `wpDetectPhase` deload-auto ↔ `shouldDeload` critère 1**, quirk seuil σ=0,
   rationalisation des 4 métriques de charge aiguë → **C3**.
3. **Redondance `db.garminHealth` ↔ `db.rhrHistory`** → **C3/C4**.
4. `db.wellbeingHistory` : store désormais sans écrivain ni lecteur (init défensif
   conservé). Sa suppression de schéma n'est pas faite (purge interdite) — candidat
   nettoyage post-bêta.
5. Données historiques prod (`db.readiness`/`todayWellbeing`/`wellbeingHistory`
   existantes) : conservées en lecture, jamais purgées (règle du lot).
