# Audit 62 — Diagnostic legacy `ob*` / `doGenerateProgram` / `goApplyAutoReg` (Phase 1, read-only)

> Chantier post-#223. Ancrage : ROADMAP.md + ARCHITECTURE.md.
> Méthode : lecture exhaustive de la zone app.js:1581-2980 + 28008-28330, grep complet
> `js/*.js` + `index.html` + `tests/`, vérification dispatch dynamique.
> **Aucune modification de code. STOP en fin de rapport — validation Aurélien requise.**

---

## ⚠️ VERDICT PRINCIPAL — LA PRÉMISSE DU CHANTIER EST RÉFUTÉE

**`sob*` n'est PAS le remplaçant de `ob*`.** La preuve de couverture demandée
(« `sob*` ⊇ `ob*` ») échoue au point zéro :

- `sobXxx` (supabase.js:3894-3972) = **onboarding SOCIAL** : choix du pseudo,
  réglages de visibilité (`db.social.visibility`), génération du code d'invitation.
  Il écrit exclusivement `db.social.*`. Zéro recouvrement fonctionnel avec `ob*`.
- Les deux flux sont **séquentiels, pas concurrents** : `obFinish()` (app.js:2977)
  enchaîne `showSocialOnboarding()` après l'onboarding principal si l'utilisateur
  est connecté sans pseudo. Même chaînage aux lignes app.js:31444 et supabase.js:1380.
- Le sous-système `ob*` **EST l'onboarding actuel de l'app** (fast flow v3 à
  3 questions + morpho), déclenché au boot : app.js:14596
  `if (needsOnboarding()) showOnboarding();`.

Conséquence : la quasi-totalité de la famille `ob*` est **VIVANTE**. Le nettoyage
possible est chirurgical (~110 lignes prouvées mortes + 12 lignes en décision produit),
pas un retrait de sous-système.

---

## A. CARTOGRAPHIE EXHAUSTIVE

### A.1 Architecture des flux (état réel)

Le même overlay `#onboarding-overlay` (index.html:1987) héberge DEUX parcours :

```
boot (app.js:14596, gate auth email)
  └─ needsOnboarding() = !onboarded || !onboardingVersion || version < 3   (ONBOARDING_VERSION=3, engine.js:12)
       └─ showOnboarding() (app.js:1709)
            ├─ jamais onboardé            → FAST FLOW  q1 → q2 → q3 (→ q4 morpho si non-débutant)
            │                                → obGenerateProgram → consent RGPD → step 7 → obFinish
            ├─ onboardé, version < 3      → WELCOME-BACK (index.html:1992)
            │     ├─ « Passer »            → obFinishWelcomeBack (stamp version 3)
            │     └─ « Mettre à jour »     → gotoObStep('1')  ← ★ FLUX 7 ÉTAPES ENCORE ATTEIGNABLE
            │            '1'→'2'→'3'→'4'→'5'→('6' si mode SBD)→ obGenerateProgram → step 7 → obFinish
            └─ (3ᵉ branche app.js:1737 : inatteignable depuis 14596 — la migration
                app.js:173 stampe toujours onboardingVersion, donc needsOnboarding()
                est faux pour un compte à jour. Code défensif, 0 risque, garder.)

Entrées EXTERNES supplémentaires (code vivant → sous-système) :
  • Réglages morpho : openMorphoSettings (app.js:17374) → gotoObStep('q4') + réaffiche l'overlay
  • Coach : nudge compétition (app.js:18983) → openCompDateSettings (stub, app.js:2185)
  • Wizard moderne « Nouveau Programme » : pbGenerateProgram (app.js:13250) → generateProgram(...)
    et écrit la variable lexicale obSelectedDays (app.js:13244)
  • index.html : ~55 attributs onclick/onchange référencent la famille (lignes 1996-2326)
  • obFinish → showSocialOnboarding (sob*) — chaînage vers le social
  • Tests Playwright : selectTrainingMode (tests/audit-calisthenics-mode-onboarding-v213.spec.js)
```

**Le flux 7 étapes n'est pas mort** : il sert de parcours « mise à jour profil » pour
tout compte avec `onboardingVersion` 1-2, et sera **re-exposé à chaque bump futur**
d'`ONBOARDING_VERSION`. C'est un mécanisme produit, pas un vestige.

### A.2 Dispatch dynamique (règle ROADMAP — re-vérifié ce jour)

`window[...]` / `eval(` / `new Function` : **0 occurrence** dans les 10 fichiers JS
chargés par index.html et dans index.html. (Note : `js/supabase.min.js` contient des
références mais **n'est pas chargé** par index.html — artefact de build hors périmètre,
ne pas toucher dans ce chantier.)

### A.3 Inventaire — fonctions (app.js sauf mention)

| Fonction | Lignes | Fait quoi (états/DOM) | Statut | Preuve |
|---|---|---|---|---|
| `needsOnboarding` | 1688-1690 | lit `db.user.onboarded/onboardingVersion` | VIVANT | appelée 14596 (boot) |
| `showOnboarding` / `hideOnboarding` | 1709-1745 | affiche overlay, route les flux, pré-remplit | VIVANT | 14596 ; hide: 1799, 2945 |
| `gotoObStep` / `updateObProgress` | 1747-1792 | navigation étapes, dots progression | VIVANT | 15 call-sites + index.html:1996 |
| `selectTrainingMode` | 1693-1700 | écrit `db.user.trainingMode`, DOM #ob-mode-grid | VIVANT | index.html:2183-2187 (step 2) |
| `obFinishWelcomeBack` | 1796-1801 | stampe `onboardingVersion=3` | VIVANT | index.html:1997 |
| `obQ1SelectProfile` / `obSaveQ1` | 1808-1838 | écrit name, level, trainingMode, vocabLevel, obProfile, skipPRs/skipRPE | VIVANT | index.html:2013-2035 |
| `obQ2SelectGoal` / `obSaveQ2` | 1840-1852 | écrit `db.user.goal` | VIVANT | index.html:2044-2058 |
| `obQ3SelectMat` / `obSaveQ3` | 1854-1901 | écrit programParams.mat, bascule calisthenics, defaults bw/gender/injuries…, fixe obFreq/obSelectedDays | VIVANT | index.html:2067-2077 |
| `obMorphoAnswer` / `obSaveQ4` / `obSkipMorpho` | 1906-1957 | écrit `db.user.morpho`, régénère weeklyPlan si déjà onboardé | VIVANT | index.html:2094-2128 + openMorphoSettings 17374 |
| `obOnGenderChange` / `obToggleCycleTracking` | 1959-1967 | affichage bloc cycle | VIVANT | index.html:2155, 2163 |
| `obSaveStep1` | 1969-1991 | écrit name, bw, height, age, level, gender, cycleTracking | VIVANT | index.html:2174 |
| `obSelectGoal` / `obSaveStep2` | 1995-2006 | écrit `db.user.goal` | VIVANT | index.html:2191-2198 |
| `obRenderInjuriesList` / `obSetInjuryLevel` / `obSaveStep3` | 2008-2038 | rend #ob-inj-list, délègue à setInjuryLevel → `db.user.injuries` | VIVANT | showOnboarding:1739 + onclick générés + index.html:2211-2212 |
| `obToggleSecondary` / `obSaveStep4` | 2042-2057 | écrit `db.user.secondaryActivities` | VIVANT | index.html:2221-2229 |
| `obSaveStep5` | 2059-2077 | valide jours, écrit prehabEnabled, route step 6/génération | VIVANT | index.html:2281 |
| `obSaveStep6` | 2079-2094 | écrit bestPR (write, jamais delete), onboardingPRs, targets | VIVANT | index.html:2306 |
| `renderConsentStep` / `validateConsent` / `nextOnboardingStep` | 2101-2143 | consent RGPD (consentHealth, medicalConsent) | VIVANT | via obGenerateProgram (2192) |
| `showOnboardingComplete` | 2146-2182 | modal « programme prêt » | VIVANT | pbGenerateProgram:13287 |
| `openCompDateSettings` | 2185-2187 | stub → showTab('tab-seances') | VIVANT | coach:18983 (mais voir D2) |
| `obGenerateProgram` / `_obGenerateProgramCore` | 2192-2307 | consent-gate + anim + inferMissingData + `generateProgram` → écrit generatedProgram, programParams, routine, routineExos | VIVANT | fast flow (1896, 1939, 1956) + 7-step (2075, 2093) + index.html:2307 |
| `renderObSummary` | 2309-2325 | résumé step 7 dans `#ob-summary` (existe, index.html:2319) | VIVANT | _obGenerateProgramCore:2299 |
| `selectDur` | 2327-2331 | écrit obDuration | VIVANT | index.html:2264-2268 |
| **`doGenerateProgram`** | **2333-2347** | ancien générateur step 7 : generateProgram(obGoals **complet**, compDate/compType) + renderObGeneratedProgram | **MORT** | 0 appelant js/ + index.html + tests (grep exhaustif) |
| `LEVEL_PARAMS` / `INJURY_EXCLUSIONS` / `getSetsReps` | 2350-2410 | paramètres du générateur | VIVANT | generateProgram |
| `generateProgram` | 2413-2715 | LE générateur (splits PL/PB/BB, blessures, phases, ACWR) | VIVANT | 2269 (onboarding), 13250 (wizard) |
| `selectFreq` / `renderDayPicker` / `toggleDayPick` / `selectMat` | 2717-2762 | step 5 : fréquence, jours, matériel | VIVANT | index.html:2239-2258 + showOnboarding:1740 |
| **`renderObGoals`** | **2765-2776** | rend drag&drop priorités dans `#ob-priority-list` | **MORT** | l'élément n'existe plus dans index.html (seule la règle CSS :304 subsiste) ; unique appelant = obDrop (circulaire) |
| **`obDragStart/Over/Drop/End`** | **2778-2799** | réordonnancement obGoals | **MORT** | uniquement référencés dans le HTML généré par renderObGoals (jamais rendu) |
| **`renderObGeneratedProgram`** | **2802-2858** | ancien rendu riche step 7 | **MORT** | unique appelant = doGenerateProgram (mort) ; conteneurs `#ob-generated-program` / `#ob-prog-summary` absents d'index.html (double preuve) |
| `autoPopulateKeyLifts` | 2860-2922 | initialise db.keyLifts | VIVANT | obFinish:2943 |
| `obFinish` | 2924-2980 | onboarded=true, version=3, selectedDays→programParams, keyLifts, magicStart/swipe, **chaîne sob*** | VIVANT | index.html:2326 |
| **`goApplyAutoReg`** | **28317-28328** | applique un poids suggéré aux séries non complétées, retire `#go-autoreg-banner` | **ORPHELIN 2ᵉ ordre** | 0 appelant ; `#go-autoreg-banner` n'est créé nulle part (créateur = goShowAutoRegSuggestion, supprimé en #223) → voir D1 |

### A.4 Inventaire — globales d'état

| Globale | Ligne | Statut | Preuve |
|---|---|---|---|
| `ONBOARDING_PROFILES` | 1585 | VIVANT | obQ1SelectProfile, obSaveQ1, obSaveQ3 |
| **`obPath`** | **1593** | **MORT** | déclarée, **zéro autre référence** dans tout le repo |
| `obFreq`, `obMat`, `obDuration`, `obSelectedDays`, `obInjuries` | 1594-1595, 1702-1704 | VIVANT | fast flow + step 5 + generateProgram:2445 + pbGenerateProgram:13244 |
| `obGoals` | 1596-1603 | VIVANT | lookup à 2268 (_obGenerateProgramCore) |
| **`obDragSrc`** | **1604** | **MORT** | uniquement utilisée par le cluster drag&drop mort |
| `EXO_DB` / `filtMat` | 1608-1683 | VIVANT | generateProgram, viewer 14260+, import.js:1142 |
| `OB_STEP_SEQUENCE`, `obStepHistory` | 1686, 1701 | VIVANT (obStepHistory est write-only — vestige bénin dans du code vivant, ne pas y toucher isolément) | gotoObStep, updateObProgress |
| `obCardio` | 1705 | VIVANT mais **figé à 'integre'** depuis la suppression de `selectCardio` en #223 → voir D3 | lu à 2269 |
| **`obCompDate` / `obCompType`** | **1706-1707** | **MORT** | uniques lecteurs = doGenerateProgram (mort) ; aucun writer autre que l'init |
| `_obSelectedMode`, `_obQ1SelectedProfile`, `_obQ2SelectedGoal`, `_obMorphoAnswers`, `_obSelectedGoal`, `_obSecondaryActivities`, `_obConsentShown`, `_OB_ZONE_TO_EXCL` | divers | VIVANT | flux fast/7-step vivants |

### A.5 Faux positifs (à GARDER, règle absolue du chantier)

`getWeekKey`, `wpRpeForPhase`, `db.user._realLevel` (lu 3× engine.js), `getExoCategory` —
non réévalués, conservés d'office. S'ajoute : `obDate` (engine.js:3197) = **variable
locale homonyme** lisant `db.user.onboardingDate` — pas de la famille, ne pas toucher.

---

## B. PREUVE DE COUVERTURE

### B.1 `sob*` vs `ob*` — tableau demandé par le prompt

| Comportement `ob*` | Équivalent `sob*` | Couvert ? |
|---|---|---|
| Profil (nom, niveau, mode, vocab) | — | **NON — hors domaine** |
| Objectif, matériel, fréquence, jours | — | **NON — hors domaine** |
| Morpho, blessures, activités secondaires, cycle | — | **NON — hors domaine** |
| PRs SBD, targets | — | **NON — hors domaine** |
| Consent RGPD/médical | — | **NON — hors domaine** |
| Génération programme | — | **NON — hors domaine** |
| *(néant côté ob\*)* | pseudo + visibilité + code invite (`db.social.*`) | domaine propre à sob* |

**Couverture sob* ⊇ ob* : 0 %.** Ce n'est pas un trou à boucher : les deux flux
coexistent par design (`obFinish` déclenche `sob*`). **Aucune suppression de `ob*`
ne peut être justifiée par l'existence de `sob*`.**

### B.2 `doGenerateProgram` — qui l'a remplacé (point 6 du prompt)

| Comportement `doGenerateProgram` (mort) | Équivalent vivant | Couvert ? |
|---|---|---|
| Appel `generateProgram(...)` | `_obGenerateProgramCore` app.js:2269 (onboarding, objectif unique — évolution volontaire vs liste complète obGoals) et `pbGenerateProgram` app.js:13250 (wizard) | **COUVERT** |
| Écrit `db.generatedProgram`, `db.routine`, `db.routineExos` | 2270, 2285-2292 / 13252-13270 — mêmes clés, même format | **COUVERT** |
| Écrit `db.user.programParams{goals,freq,mat,duration,injuries,cardio,level}` | 2271 / 13222-13238 | **COUVERT** |
| Écrit `programParams.compDate` / `compType` | **AUCUN writer vivant** (grep exhaustif : seule écriture = 2336, morte) | **NON COUVERT → D2** |
| Rendu step 7 (`renderObGeneratedProgram`) | `renderObSummary` (2309) dans `#ob-summary` (index.html:2319) ; les conteneurs de l'ancien rendu n'existent plus dans le DOM | **COUVERT** |
| Chemin d'invocation (bouton, migration, vieux compte) | Recherché : aucun onclick, aucun appel JS, aucun dispatch dynamique, aucun test. Un vieux compte ne peut PAS l'invoquer : l'entrée UI a été retirée avant #223 | **AUCUN** |
| Données que seul l'ancien code sait lire | Aucune : il écrivait les mêmes clés que le chemin vivant. Voir C pour compDate | **OK** |

### B.3 `goApplyAutoReg` — orphelin 2ᵉ ordre (point 7 du prompt)

- **0 appelant confirmé** (js/, index.html, tests). Son seul producteur d'UI,
  `goShowAutoRegSuggestion` (créateur de `#go-autoreg-banner`), a été supprimé en #223.
- Le flux d'auto-régulation vivant est `goCheckAutoRegulation` (app.js:28008, appelé
  27860 et 27938) : il émet des **messages conseil** (bannière live coach — « réduis de
  5 % », « ajoute 2.5 kg ») mais **n'offre plus d'action un-tap** qui applique le poids
  aux séries restantes. L'ajustement de charge amont reste couvert par
  `wpComputeWorkWeight` (plan), pas en cours de séance.
- **L'effet de `goApplyAutoReg` n'est PAS reproduit : la feature a disparu.**
  Conformément au prompt, c'est signalé comme **décision produit (D1)**, pas comme
  suppression évidente.

---

## C. IMPACT DONNÉES (à router vers Claude.ai)

1. **`db.user.programParams.compDate` / `.compType`** — seul writer historique =
   `doGenerateProgram` (mort). MAIS trois lecteurs **vivants** : nudge coach
   (app.js:18978), peaking coach (19039-19041), weeklyPlan (22360-22362 →
   `generateCompPeakingPlan`). Des blobs existants peuvent porter ces clés et la
   feature peaking fonctionne encore pour eux.
   → **Claude.ai** : vérifier côté Supabase combien de `sbd_profiles` ont
   `data->'user'->'programParams'->>'compDate'` non nul, avant toute décision D2.
   → Les LECTEURS sont à GARDER quoi qu'il arrive ; supprimer `doGenerateProgram`
   ne les touche pas.
2. **`plan._compInfo`** — propriété custom posée sur un Array ; `_flushDB` persiste via
   `JSON.stringify` (app.js:360) qui **droppe les propriétés non indexées d'un Array**
   → jamais persisté, ni en localStorage ni en cloud. Aucun blob concerné. Les gardes
   `_compInfo` restantes (autoPopulateKeyLifts:2891) sont défensives et inoffensives.
3. Aucune autre clé `db.*` exclusive au code mort : `doGenerateProgram` écrivait les
   mêmes clés que le chemin vivant ; le cluster drag&drop et `obPath`/`obDragSrc`
   n'écrivaient rien dans `db`.

---

## LISTE FINALE

### 🟢 SÛR À SUPPRIMER — couverture/mort prouvée (~110 lignes, app.js uniquement)

| # | Item | Lignes | ~L | Preuve |
|---|---|---|---|---|
| 1 | `doGenerateProgram` | 2333-2347 | 15 | 0 appelant (js + html + tests + 0 dispatch dynamique) |
| 2 | `renderObGeneratedProgram` | 2802-2858 | 57 | unique appelant = #1 ; conteneurs DOM absents |
| 3 | `renderObGoals` + `obDragStart/Over/Drop/End` | 2765-2799 | 35 | `#ob-priority-list` absent du DOM ; cluster auto-référent |
| 4 | `obDragSrc` | 1604 | 1 | utilisée uniquement par #3 |
| 5 | `obPath` | 1593 | 1 | zéro référence hors déclaration |
| 6 | `obCompDate` / `obCompType` | 1706-1707 | 2 | uniques lecteurs dans #1 (supprimer APRÈS #1) |
| — | (optionnel) CSS `.ob-priority-list` | index.html:304 | 1 | orpheline après #3 |

Ordre de suppression conseillé (Phase 3, commits atomiques + `node -c` + Jest) :
#1 → #2 → #3+#4 → #5+#6. Ne PAS toucher à la signature de `generateProgram`
(params `compDate/compType` + bloc 2706-2709) : fonction cœur vivante, appelée avec
`null, null` par les deux chemins vivants — figée pré-bêta (règle POST-BÊTA CLAUDE.md).

### 🔵 VIVANT — garder (≈ 1 300 lignes de la zone 1581-2980 + goCheckAutoRegulation)

Tout le reste de la famille : les deux flux d'onboarding (fast q1-q4 ET 7 étapes —
ce dernier atteignable via welcome-back index.html:1996 pour tout compte
`onboardingVersion < 3`, et re-exposé à chaque bump de version), `generateProgram` et
ses tables (réutilisé par le wizard moderne `pbGenerateProgram`), `EXO_DB` (lu aussi par
import.js et le viewer), le consent RGPD, `renderObSummary`, `autoPopulateKeyLifts`,
`obFinish` (qui chaîne vers `sob*`), toutes les globales d'état sauf les 4 mortes,
et l'écosystème `sob*` au complet.

### 🟠 DÉCISION PRODUIT — Aurélien tranche (12 lignes de code concernées)

| # | Sujet | Détail | Options |
|---|---|---|---|
| **D1** | `goApplyAutoReg` (28317-28328, 12 L) | Techniquement orphelin prouvé, MAIS le supprimer **entérine la disparition** de la feature « appliquer la charge suggérée en un tap pendant la séance » (perdue en #223 avec `goShowAutoRegSuggestion`). `goCheckAutoRegulation` ne fait plus que des messages conseil. | (a) supprimer = acter la perte ; (b) recâbler un bouton « Appliquer » dans la bannière live coach (petite feature) |
| **D2** | `programParams.compDate` sans setter | Plus AUCUN code vivant n'écrit compDate ; le nudge coach (18983) « Ajouter une date → » ouvre un **stub** (`openCompDateSettings` → simple showTab) sans champ de saisie. La feature peaking compétition (nudge + `generateCompPeakingPlan` + weeklyPlan taper) n'est activable que pour d'anciens blobs. | (a) construire un vrai réglage compDate (Programme/Profil) ; (b) retirer nudge + peaking (chantier séparé). Vérif Supabase préalable (section C.1) |
| **D3** | `obCardio` figé `'integre'` | Depuis la suppression de `selectCardio` (#223), le choix cardio dédié/aucun n'est plus proposable à l'onboarding ; la variable reste un input constant de `generateProgram`. Info produit, aucune action code requise ici. | acter ou re-proposer le choix plus tard |

### Estimation totale

- SÛR : **~110 L** app.js (+1 L CSS optionnelle index.html)
- DÉCISION : **12 L** (goApplyAutoReg)
- VIVANT : **~1 300 L** — intouchées

---

## STOP — Phase 1 terminée

Aucune suppression effectuée. Attente de validation d'Aurélien sur :
1. la liste SÛR (6 items, ~110 L),
2. D1 (goApplyAutoReg : acter la perte ou recâbler),
3. D2 (compDate : vérif Supabase par Claude.ai puis trancher),
4. D3 (info).

Phase 3 (suppressions par commits atomiques, `node -c` + Jest par groupe, bump SW)
uniquement après ce feu vert.
