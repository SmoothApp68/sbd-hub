# Chantier A — Unifier les modales · PHASE 1 (diagnostic + design)

> ✅ **Plan EXÉCUTÉ (v313-319).** Les 5 vagues sont livrées ; chantier A complet.

> **Read-only.** Suite de `POLISH_DIAGNOSTIC.md` + Tier 0 (v312 : `.modal-overlay` animée entrée+sortie,
> helper `closeModalEl()`). Ce document = inventaire des call-sites classés, API cible, CSS/z-index cible,
> plan de migration en vagues. **Aucune migration effectuée. Attente du GO d'Aurélien.**

---

## TL;DR

- **44 call-sites** d'overlay classés. Le cœur de la migration : **~29 sites migrables** vers 5 primitives ;
  **13 restent tels quels** (formulaires complexes, bannières, popovers) mais s'alignent sur la nouvelle
  échelle z-index ; **2 wizards plein écran** (quiz, swipe) restent aussi (COMPLEX).
- Découverte clé : `showInfoModal` / `showModal` / `showToast` / `goShowBottomSheet` sont **déjà** les
  4 primitives de facto. La cible n'est PAS un nouveau système parallèle : c'est **formaliser l'existant**
  (celui déjà animé au Tier 0) et y rebrancher les sites artisanaux. Risque fortement réduit.
- 3 comportements transverses **manquent totalement** dans l'app : fermeture **Échap** (0 handler),
  **scroll-lock** du fond (inexistant), **gestion de pile** (remplacée par un idiome « nuke-all »
  `querySelectorAll('.modal-overlay').forEach(remove)` présent ×10).
- Défaut latent confirmé : `.toast` (z 999) passe **sous** toutes les modales (z 9999+) — un toast
  déclenché modale ouverte est invisible. Corrigé par l'échelle z cible.
- Plan : **5 vagues atomiques** (la 4ᵉ = les 11 `confirm()` natifs, le seul vrai point 🟡).

---

## A. Inventaire des call-sites classés par primitive cible

### État des lieux transverse (préalables factuels)

| Comportement | État actuel | Preuve |
|---|---|---|
| Fermeture Échap | **Aucune** (0 handler clavier modal dans app.js) | seul `keydown` : un Enter sur input programme (app.js:3032) |
| Scroll-lock du fond | **Aucun** (page scrollable derrière chaque overlay) | aucun `body.style.overflow`/classe no-scroll ; `overscroll-behavior-y:contain` (index.html:66) ne verrouille pas |
| Pile de modales | Idiome **nuke-all** ×10 : `querySelectorAll('.modal-overlay').forEach(o=>o.remove())` | app.js:8463, 8488, 13978, 14005, 14074/78/82, 18261, 18272, 27899 |
| Empilement réel | Oui — flux adjust-session : `openAdjustSession` (13874) + `_adjustPrimaryWarning` (14068) / `_adjustShowAlternatives` (13972) s'ouvrent **par-dessus** sans nettoyer | échelle z ad-hoc : 9999 → 10000 (consent/PR) → 20000 (sheets) → 30000 (crop/demo) → 99999 (quiz) |
| z-index | **23 valeurs distinctes** (1 → 99999) | inventaire grep index.html+app.js |
| Toast vs modale | `.toast` z 999 **sous** `.modal-overlay` z 9999 → toast invisible si modale ouverte | index.html:169 vs 178 |

### → CENTER — 14 sites

| Site (app.js:ligne) | Contenu | Complexité | Vigilance |
|---|---|---|---|
| `showInfoModal` :1326 | info générique + Fermer | — | **est la primitive de base** (déjà animée Tier 0) |
| `showGlossaryModal` :1146 | définition glossaire | TRIVIAL | backdrop-close + ✕ |
| `showJeuHelp` :6751 | aide onglet Jeux | TRIVIAL | |
| `showOnboardingComplete` :2151 | célébration fin onboarding | TRIVIAL | 2 boutons nav |
| `showProgramPreview` :13305 | aperçu programme | TRIVIAL | box scrollable 70vh |
| `openSessionPhotoPicker` :29083 | menu caméra/galerie | TRIVIAL | (candidat sheet, décision cosmétique) |
| `showTitleModal` :6774 | choix de titre | MODERATE | `#titleList` peuplé après append |
| `showCustomBuilderChoice` :12132 | choix point de départ | MODERATE | callbacks câblés après append |
| `showShareModal` :31278 | carte de partage | MODERATE | `#share-card` capturé par canvas — id à préserver |
| `showActivityQuickLog` :30833 | checklist activités du jour | MODERATE | **délègue déjà à showInfoModal** (auto-migré) |
| `_adjustShowAlternatives` :13952 | alternatives d'exercice | MODERATE | **s'empile** sur adjust-session |
| `_adjustApplyChange` :13977 | séance vs cycle entier | MODERATE | nuke-all avant ouverture |
| `_adjustPrimaryWarning` :14029 | raison changement lift primaire | MODERATE | **s'empile**, chaîne 3 handlers |
| `showExoDemo` :29750 | lightbox démo exercice | MODERATE | `.exo-demo-overlay` dédiée z 30000 — traiter en lightbox média |

### → CONFIRM — 5 sites modaux + 11 `confirm()` natifs

| Site | Contenu | Complexité | Vigilance |
|---|---|---|---|
| `showModal` :1328 | oui/non générique | — | **est la primitive de base** (déjà animée Tier 0) |
| `showConsentModal` :1341 | gate consentement RGPD | MODERATE | z 10000 (au-dessus de tout) — niveau `--z-critical` |
| `showPhaseValidationGate` :8432 | fin de bloc → phase suivante | MODERATE | 2 actions distinctes (valider/reporter), pas OK/annuler |
| `_showDuplicateImportModal` :10306 | doublons d'import | MODERATE | ⚠️ **backdrop-click déclenche `onCancel`** (pas juste fermer) — à préserver |
| `showPRConfirmation` :27876 | « nouveau record ? » | MODERATE | `confirmNewPR` fait nuke-all |

**Les 11 `confirm()` natifs** (bloquants synchrones → async par callback, analysés un par un) :

| Ligne | Fonction | Pattern | Adaptation |
|---|---|---|---|
| 1435 | `clearLocalCache` | garde `if(!confirm)return` | TRIVIAL — corps → onConfirm |
| 12664 | `cancelCustomBuilder` | garde | TRIVIAL |
| 12698 | `restoreCustomProgramBackup` | garde | TRIVIAL |
| 13330 | `deleteCustomProgramBackup` | garde | TRIVIAL |
| 14113 | `pbResetProgram` | garde | TRIVIAL |
| 17529 | `setProgramMode` | garde | TRIVIAL |
| 29186 | `removeSessionPhoto` | garde | TRIVIAL |
| 29415 | `seRemoveExo` | garde | TRIVIAL |
| 29438 | `seDeleteSession` | garde | TRIVIAL |
| 28051 | `showGrindTechQuestion` | `var answer = confirm(...)` — **les 2 branches agissent** (`grindTech = !answer`) | MODERATE — onConfirm ET onCancel écrivent ; réordonnancement sûr : appelée par `toggleGrind` (28027) qui enchaîne sur `goCheckAutoRegulation`, lequel **ne lit pas** `grindTech` (lu uniquement à la sauvegarde, 30711) |
| 30401 | `goSelectSearchResult` | `push()` AVANT la question, `pop()` si annule, `goAutoSave()`+`goRequestRender()` APRÈS | MODERATE — restructurer : question AVANT le push (propre), ou déplacer pop+save+render dans les callbacks |

✅ Vérifié : les 9 fonctions TRIVIAL sont des handlers `onclick` purs — **aucun appelant ne dépend du
retour synchrone**. Le seul enchaînement synchrone (`toggleGrind`) est prouvé sans dépendance d'ordre.

### → SHEET — 5 sites (3 implémentations, dont 1 cassée)

| Site | Contenu | Complexité | Vigilance |
|---|---|---|---|
| `goShowBottomSheet` :29862 | menu d'actions générique | — | **sheet canonique qui marche** (`.go-bottom-sheet`/`.go-sheet-box`/`.go-sheet-handle`, index.html:1213-1220) ; 4 appelants |
| `goShowInstructions` :29804 | instructions exercice | MODERATE | utilise déjà les bonnes classes |
| `_showDebriefSheet` :19599 | récap fin de séance | MODERATE | `.modal-overlay` hackée en `align-items:flex-end` ; **auto-dismiss 15s à préserver** |
| `openSwap` :14175 | swap d'exercice | MODERATE | `.swap-modal` (clone divergent : 0.75/70vh, sans anim) → fusionner dans `.go-bottom-sheet` |
| `_showChallengeSheet` :7172 | picker de défi | MODERATE **CASSÉE** | émet `go-bottom-sheet-overlay/-content/-handle` — **classes sans aucun CSS** → panneau sans fond/coins, tap-dehors mort. Fix : supprimer le div `-overlay`, `onclick` sur la racine, renommer `-content`→`go-sheet-box` et `-handle`→`go-sheet-handle` (miroir de `goShowBottomSheet`) |

### → TOAST — 2 implémentations → 1

| Site | Vigilance |
|---|---|
| `showToast` :1304 | **primitive de base** (file `_toastQueue`, ~100 appelants) — conservée |
| `showPRToast` :31425 | doublon : haut d'écran, gradient, `slideDownFade`, z 9999, hors file → devient `showToast(msg, {variant:'pr'})` (style gradient préservé en variante CSS) |

### → FULLSCREEN — 5 sites

| Site | Complexité | Vigilance |
|---|---|---|
| `showPaywall` :27412 | TRIVIAL | `insertAdjacentHTML`, 1 action |
| `showMagicStart` :2879 | MODERATE | 3 callbacks, id-guarded |
| `showPROverlay` :31445 | MODERATE | anim `prPulse`, z 10000 |
| quiz `showClassQuiz` :4593 | **COMPLEX** | wizard multi-étapes, état interne, `<style>` inline, z 99999 → **reste tel quel**, aligné z + fade entrée |
| swipe-onboarding :10962 | **COMPLEX** | wizard multi-étapes, `_swipeState` → **reste tel quel**, aligné z |

### → KEEP-AS-IS — 13 sites (pas de restructuration, alignement z uniquement)

- **Formulaires/outils complexes sur la primitive de base (6)** : `showReadinessModal` :705 (check-in),
  `showDOMSModal` :742, ob-consent :2197, `goShowPlateCalc` :29639, `openAdjustSession` :13874 (éditeur
  à onglets qui spawne les sous-modales), `renderCropOverlay` :28973 (outil crop, z 30000).
- **Bannières (5)** : `showLiveCoachBanner` :28389 (⚠️ a des effets de bord sur le plan — PAS toast-able),
  `#ios-install-banner` :14574, `showDataGapBanner` :23613 (en fait une string HTML inline, pas un overlay),
  `#installBanner` / `#iosInstallGuide` statiques (index.html:1967/1980).
- **Popovers (2)** : `showMusclePopover` :5267, `showMuscleFatigueTooltip` :8837 (éléments ancrés existants).

**Comptage : 14 center + 5 confirm-modaux + 11 confirm() natifs + 5 sheets + 2 toasts + 5 fullscreen
+ 13 keep-as-is = 55 sites recensés** (cohérent avec le diagnostic global : ~55-60).

---

## B. Système cible unifié

### Principe directeur
**Ne pas créer un 9ᵉ système.** Le socle = les primitives de facto existantes, déjà animées au Tier 0
(`.modal-overlay`/`.modal-box` + `closeModalEl`). On les complète (sheet, confirm, variantes toast) et on
ajoute les 3 comportements transverses manquants (Échap, scroll-lock, pile). Les signatures existantes
`showModal(msg, cText, cColor, onConfirm, onCancelOrText)` / `showInfoModal(title, html)` / `showToast(msg,
duration, onClick)` sont **conservées telles quelles** (≈150 appelants ne bougent pas).

### API cible (vanilla, pas de framework)

```js
// ── Cœur interne (nouveau, ~60 lignes) ─────────────────────────────
// Gère : pile (_uiStack), scroll-lock compteur, Échap, backdrop tap-dehors,
// animations entrée/sortie 240ms (réutilise closeModalEl du Tier 0).
_uiOpen({ el, dismissible, onDismiss })   // enregistre dans la pile, lock scroll
_uiClose(el)                              // = closeModalEl + dépile + unlock si pile vide
closeAllOverlays()                        // remplace l'idiome nuke-all (×10 sites), version animée

// ── Primitives publiques ────────────────────────────────────────────
showInfoModal(title, html)                        // EXISTANTE, inchangée → center
showModal(msg, cText, cColor, onConfirm, onCancel) // EXISTANTE, inchangée → confirm générique
showConfirm({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel })
                                                  // NOUVELLE — remplace les confirm() natifs
                                                  // danger:true → bouton rouge var(--danger)
showSheet({ title, html, items })                 // NOUVELLE — unifie les bottom-sheets
                                                  // items:[{icon,label,action}] OU html libre
                                                  // (généralisation de goShowBottomSheet)
showToast(msg, duration, onClick)                 // EXISTANTE, inchangée
showToast(msg, { duration, onClick, variant })    // + options : variant 'pr' absorbe showPRToast
```

Comportements centralisés dans `_uiOpen` (aujourd'hui au cas par cas ou absents) :
- **Fermeture** : tap-dehors (si `dismissible`, défaut oui sauf confirm/gates), bouton, **Échap**
  (nouveau — ferme le sommet de pile *dismissible* uniquement, jamais les gates de consentement).
- **Scroll-lock** : compteur de pile → `document.body.style.overflow='hidden'` quand ≥1 overlay,
  restauré à 0. (Pile, pas booléen : le flux adjust-session empile réellement 2 modales.)
- **Sortie animée partout** : `_uiClose` = `closeModalEl` → les ~22 sites artisanaux qui font
  `.remove()` sec héritent de la sortie 240ms en migrant.

### CSS cible (une seule couche)

- **center/confirm** : `.modal-overlay`/`.modal-box` existants — déjà conformes au mockup
  (fade backdrop + scale 0.98, 240ms ease, symétrique). **Zéro changement.**
- **sheet** : `.go-bottom-sheet`/`.go-sheet-box`/`.go-sheet-handle` promus classes uniques de sheet.
  Ajout : entrée box `translateY(100%)→0` 240ms ease + sortie symétrique via `.closing`
  (le backdrop garde le fade 240ms). `.swap-modal` supprimée après migration (vague 5).
- **fullscreen** : fade backdrop 240ms entrée/sortie (pas de scale — plein écran).
- **toast** : `.toast` existant + variante `.toast--pr` (gradient, reprend le style de showPRToast) ;
  position unifiée **en bas** (bord unique — le toast PR descend du haut vers le bas d'écran ;
  si Aurélien préfère garder le PR en haut, c'est 1 ligne CSS, à trancher au GO).

### Échelle z-index cible (définie UNE fois dans `:root`)

| Variable | Valeur | Contenu |
|---|---|---|
| `--z-nav` | 1000 | tab-bar (existant), top-bar |
| `--z-banner` | 1100 | bannières coach/install, popovers |
| `--z-overlay` | 1200 | **toutes** modales/sheets/fullscreen — l'empilement se fait par ordre DOM (déjà le cas dans le flux adjust : 2 overlays à z égal) |
| `--z-critical` | 1300 | gates de consentement, crop, quiz (doivent dominer tout overlay) |
| `--z-toast` | 1400 | feedback toujours visible → **corrige le défaut toast-sous-modale** |

Remplace les 23 valeurs actuelles (1→99999). Migration mécanique (sed contrôlé + vérif visuelle).

---

## C. Plan de migration par vagues (commits atomiques, SW bump par vague, Playwright par vague)

| Vague | Périmètre | Sites | Risque | Ce qui pourrait casser |
|---|---|---|---|---|
| **1 — Socle + toasts** | Cœur `_uiOpen`/`_uiClose`/`closeAllOverlays` (ajout pur, 0 suppression) ; échelle z (vars + remap des valeurs existantes) ; scroll-lock ; Échap ; fusion toasts (showPRToast → variant) ; remplacement des 10 nuke-all par `closeAllOverlays()` | ~16 | 🟢 | remap z : vérifier visuellement consent/crop/quiz au-dessus ; scroll-lock : tester les modales à contenu scrollable (readiness) |
| **2 — Sheets** | Fix `_showChallengeSheet` (classes existantes) ; `openSwap` → sheet unifiée ; `_showDebriefSheet` → vraie sheet (**préserver auto-dismiss 15s**) ; `showSheet()` public ; anim translateY entrée/sortie | 5 | 🟢/🟡 léger | callbacks `confirmSwap`/`closeSwap` ; timer débrief |
| **3 — Dialogues centrés artisanaux** | Les 10 TRIVIAL d'abord (1 commit), puis les 9 MODERATE un par un (ids DOM à préserver : `#share-card`, `#titleList` ; backdrop-onCancel de `_showDuplicateImportModal` ; empilement adjust-session) | 19 | 🟡 léger | câblage post-append des callbacks ; contenu dynamique |
| **4 — confirm() natifs** | 9 gardes → `showConfirm` (corps → onConfirm) ; `showGrindTechQuestion` (2 branches) ; `goSelectSearchResult` (question avant push) | 11 | **🟡** | seul vrai point sync→async — analyse par site faite (§A), appelants vérifiés (tous onclick, 1 enchaînement prouvé sans dépendance) |
| **5 — Nettoyage** | Suppression CSS morts (`.swap-modal`, `slideDownFade` si absorbé, doublons) **après grep 0 usage** ; mise à jour CLAUDE.md §fonctions | — | 🟢 | rien si grep propre |

Hors périmètre (constaté, pas traité) : les 13 KEEP-AS-IS gardent leur structure — ils prennent
seulement les variables z en vague 1. Les 2 wizards COMPLEX (quiz, swipe) idem.

### Points de vigilance actés
1. **confirm() sync→async** : détail par site au §A — 9 triviaux prouvés sans dépendance d'ordre,
   2 restructurations locales documentées.
2. **Pile** : scroll-lock par compteur (pas booléen) ; Échap ne ferme que le sommet *dismissible* ;
   `closeAllOverlays()` conserve la sémantique nuke-all existante (en version animée).
3. **Zéro régression Tier 0** : `.modal-overlay`/`.modal-box`/`closeModalEl` sont le socle du système
   cible — ils ne changent pas, ils sont étendus.
4. Bouton retour Android (fermer la modale via history API) : **hors scope** chantier A (change le
   flux de navigation) — noter pour post-bêta.

---

**STOP Phase 1. Aucune migration effectuée. En attente du GO d'Aurélien sur :**
1. l'API cible (§B) — noms et signatures ;
2. la position unique du toast (bas d'écran, y compris variante PR ?) ;
3. le découpage en 5 vagues (§C) — exécution ensuite vague par vague, commits atomiques.
