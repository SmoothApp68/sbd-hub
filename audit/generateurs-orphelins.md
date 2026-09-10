# Générateurs orphelins — balayage du motif « l'id a disparu, le code est resté »

**READ-ONLY.** Aucune correction. Périmètre strict : le motif identifié sur `wpApplyDay`,
pas une 6e vague d'audit.

**Motif recherché** — un générateur qui lit un id inexistant et sort sur une garde
silencieuse : il ne fait rien, ne lève rien, ne dit rien.

```js
const el = document.getElementById('unIdQuiNExistePlus');
if (!el) return;          // ← sortie muette
```

## Réponse en une ligne

**Deux fonctions**, pas dix. `renderWeeklyPlanUI` (déjà connue) et **`renderDaySelector`**
(nouvelle). Les 23 autres ids absents relèvent d'autres motifs, signalés plus bas sans
investigation.

---

## Méthode

**Passe statique** (`audit/runtime/orphelins-scan.js`) — ids **lus** ∖ ids **créés**.

| | |
|---|---|
| ids créés (littéraux `id="X"`, `.id='X'`, `setAttribute`, options d'overlay) | **622** |
| préfixes dynamiques (`id="pfx-${v}"`) — un id lu qui en dérive n'est pas déclaré orphelin | 40 |
| lectures littérales (`getElementById('X')`, `querySelector('#X')`) | 575 → **421 ids distincts** |
| **ids lus JAMAIS créés** | **25** |
| ids indéterminés (couverts par un préfixe) | 0 |

La preuve d'orphelinat est **statique** : si le littéral n'apparaît nulle part comme
création, aucun chemin d'exécution ne peut le produire.

> **Une correction en cours de route.** Le premier passage donnait 27 ids absents, dont
> `#swap-modal` et `#challengePickerSheet` — **faux positifs**. Le système d'overlays passe
> l'id en *option* (`showSheet({ id: 'swap-modal' })`) et `_uiOpen` fait
> `if (opts.id) overlay.id = opts.id` (`app.js:1522`) : l'id n'existe jamais comme littéral
> `id="X"`. J'ai corrigé le scan (fenêtre de 30 lignes après tout appel
> `showSheet|showModal|showConfirm|showInfoModal|_uiOpen`) plutôt que la liste à la main.

**Passe runtime** (`audit/runtime/orphelins-runtime.js`) — 17 états balayés (7 onglets +
sous-onglets Profil, Séances, Social), profil `aurel_like` avec `weeklyPlan` complet et
`generatedProgram` :

```
   ids candidats trouvés au moins une fois : 0
   TÉMOINS trouvés (contrôle de la sonde)  : 4/5 → ["dayExercisesContainer","trainingLogs",
                                                    "programViewer","sbdTotalDisplay"]
```

Les témoins sont des ids qui **existent** : ils prouvent que la sonde sait en trouver.
Aucun des 25 candidats n'apparaît, sur aucun état.

---

## Cas 1 — `renderWeeklyPlanUI` (déjà documenté)

| | |
|---|---|
| **fonction** | `renderWeeklyPlanUI` — `js/app.js:27313` |
| **ids manquants** | `#wpGenerateBtn` (27315), `#wpContent` (27318) — plus `#wpMeta`, `#wpRegenBtn`, `#wpBlocSelect`, non gardés |
| **garde** | `if (!genBtn || !content) return;` |
| **appelants** | 4 — `app.js:18802` (toggle Prehab), `27296` (fin de `generateWeeklyPlan`), `27311` (`wpSelectDay`), `27423` (`regenerateWeeklyPlan`). **Tous no-op.** |
| **disparition** | `2d3a43b`, **27/04/2026** — *« refactor(coach): remove programme generation from Coach — owned by Programme tab »*. 24 lignes retirées d'`index.html` : le bloc `#weeklyPlanSection` de l'onglet **Coach**, entre `#coach-today` et `#coach-history`. |
| **ce qui est perdu** | **Une UI entière** : badge de bloc, pastilles des 7 jours, détail de la séance sélectionnée, prehab, note du coach, durée estimée, bouton renommer — et les deux boutons **« Appliquer ce jour au programme »** / **« Appliquer toutes les suggestions au programme »**. |
| **runtime** | `renderWeeklyPlanUI()` → aucune levée, **delta DOM = 0 caractère**. |

Le plan hebdo lui-même reste vivant : `generateWeeklyPlan` est appelé de 16 endroits et
`db.weeklyPlan` lu 259 fois — c'est lui qui alimente la carte GO. Seule son **UI de
consultation et d'application** est orpheline.

## Cas 2 — `renderDaySelector` ⚠️ NOUVEAU

| | |
|---|---|
| **fonction** | `renderDaySelector` — `js/app.js:10152` |
| **id manquant** | `#dashDaySelector` (10153) |
| **garde** | `if (!el) return;` |
| **appelants** | 2 — `renderDayExercises` (`app.js:10197`) et les boutons qu'elle génère elle-même (`10168`, récursif). **Le seul appelant externe est donc `renderDayExercises`.** |
| **disparition** | `2aff1fa`, **15/04/2026** — *« feat(dash): nouvelle structure #tab-dash — dashWeekCard + perfCard »*. Ligne retirée : `<div id="dashDaySelector" style="margin-bottom:12px;"></div>`. |
| **ce qui est perdu** | **Un sélecteur de jour** : 7 boutons Lun→Dim, jour courant marqué « auj. », jour sélectionné en bleu, chacun rebranchant `selectedDay` + `renderDayExercises(jour)`. |
| **runtime** | `renderDaySelector()` → aucune levée, **delta DOM = 0 caractère**. `#dashDaySelector` absent sur les 17 états. |

**La conséquence utilisateur est plus fine que pour le cas 1.** Son compagnon
`renderDayExercises` (`app.js:10179`), lui, **fonctionne** : ses conteneurs
`#dayExercisesContainer` et `#trainingLogs` existent bien (vérifié au runtime, `true`
tous les deux). L'écran affiche donc les exercices d'**un** jour — mais **le moyen d'en
changer a disparu**. La variable `selectedDay` reste pilotable par le code, plus par
l'utilisateur.

---

## Les 23 autres ids absents — signalés, non investigués

Hors périmètre : ils ne sortent pas sur une garde silencieuse. Classés par conséquence
apparente, **sans vérification** au-delà de la lecture du site d'appel.

**Levée probable — l'id est déréférencé sans garde**
- `#chalTitle` `#chalType` `#chalExercise` `#chalTarget` `#chalDuration` — `createChallenge`
  (`supabase.js:4743-4747`), `.value` directement sur le retour.
- `#socialFriendsBadge` — `renderFriendsTab` (`supabase.js:3565`), `badgeEl.textContent`
  sans garde. **Déjà au scope de lancement (fix #5).**

**No-op silencieux sans `return`** — le cousin du motif
- `#anatomyFront` `#anatomyBack` `#anatBtnFront` `#anatBtnBack` — `svgToggleView`
  (`app.js:6076-6079`) : les quatre lectures sont gardées une à une par `if (x)`, donc la
  fonction s'exécute entièrement **et ne fait rien**. La bascule vue avant / vue arrière
  de l'anatomie est inopérante.

**`#ob-mode-continue` — tranché au runtime : PAS un bloquant** *(voir l'annexe en fin de doc)*
- `selectTrainingMode` (`app.js:2520`) : `if (continueBtn) continueBtn.disabled = false;` est une
  **ligne morte**. Le bouton « Continuer → » de l'écran existe bel et bien, sans id et
  **jamais désactivé** : le parcours avance normalement. Vestige d'une version où il
  démarrait désactivé.

**Décoratif ou avec repli — sans conséquence apparente**
- `#programViewerCard` — `renderProgramViewer` (`app.js:15067`) : sert seulement à
  masquer/afficher une carte, sous `if (card)`. La fonction sort sur `#programViewer`, qui
  **existe**, et rend normalement.
- `#sbdTotalCard` — `renderSBDTotal` (`app.js:9448`) : idem, la garde de sortie porte sur
  `#sbdTotalDisplay`, qui **existe**.
- `#coachTodayContent` — `confirmGhostLog` (`app.js:19598`), branche `else if` de repli ;
  le chemin principal est `renderCoachTab()`.
- `#app-shell` — `checkWaitlistRoute` (`app.js:32886`), repli explicite
  `|| document.querySelector('.app-container')`.
- `#defi-type` `#defi-duration` `#modal-defi` — `createDefiFromModal` (`supabase.js:2409-2422`),
  toutes les lectures gardées.
- `#challengeModalSheet` — `createChallenge` (`supabase.js:4774`), sous `if (sheet)`.
- `#wpMeta` `#wpRegenBtn` `#wpBlocSelect` `#wpGenerateBtn` (`app.js:26765`) — famille du cas 1.

---

## Limites de ce balayage

- **Ids littéraux uniquement.** `getElementById(variable)` n'est pas résolu :
  **26 occurrences** (24 dans `app.js`, 2 dans `supabase.js`). Angle mort assumé.
- **Le motif exact seulement.** Un générateur qui sort sur autre chose qu'une garde d'id
  (drapeau, `db` vide, condition métier jamais vraie) n'est pas détecté — c'est un autre
  motif, hors périmètre.
- **17 états runtime**, sans ouvrir les modales et feuilles. La preuve d'absence reste
  statique ; le runtime la confirme sur les états parcourus.
- **Ce balayage ne dit pas si la fonctionnalité manque à quelqu'un.** Il dit qu'elle ne
  s'affiche pas.

## Ce que ça change

Deux fonctionnalités crues actives ne le sont pas, disparues à **12 jours d'intervalle**
(15 et 27 avril 2026), toutes deux par un refactor d'`index.html` qui a retiré un conteneur
sans toucher au générateur. Ce n'est pas un pattern à dix occurrences : c'est un pattern à
deux, avec la même cause.

Avec Weight Cut, les badges du Profil et les 3 sections Social, la famille « le point
d'entrée disparaît, le code reste » compte maintenant **7 cas connus** — mais seuls ces
deux-ci ont la signature *garde d'id silencieuse*, la seule qui soit mécaniquement
cherchable. Les cinq autres ont des causes différentes et ne se détectent pas par ce
balayage.

---

## Backlog — points d'entrée perdus, à décider

| | surface | décision à prendre |
|---|---|---|
| `renderWeeklyPlanUI` | plan hebdo + boutons « Appliquer » (onglet Coach) | rebrancher le conteneur ou supprimer le générateur |
| `renderDaySelector` | sélecteur de jour du Dashboard | idem — perdu le 15/04, personne ne s'en est aperçu |
| `svgToggleView` | **bascule vue avant / vue arrière de l'anatomie** | motif cousin (gardes `if (x)` sans `return`) : la fonction s'exécute et ne fait rien. Effet utilisateur identique — un bouton qui ne répond pas. Les 4 ids `#anatomyFront` `#anatomyBack` `#anatBtnFront` `#anatBtnBack` sont absents. |

---

## Annexe — `#ob-mode-continue`, vérifié au runtime

Banc : `audit/runtime/ob-mode-continue.js`. Vrais clics Playwright, pas `page.evaluate` :
`selectTrainingMode` lit le `event` global, que seul un vrai clic renseigne.

```
1) NOUVEL UTILISATEUR (profil vierge)
   showOnboarding() → {"etape":"ob-step-q1","overlay":"flex"}
   → l'écran ob-mode n'est même pas sur son chemin (fast flow 3 questions)

2) UTILISATEUR EXISTANT — réouverture du profil (flux long)
   showOnboarding() → ob-step-1  →  « Continuer » → ob-step-2
   #ob-mode-continue absent        : true
   boutons de mode d'entraînement  : 5
   bouton « Continuer → »  id=(sans id)  disabled=false  onclick=obSaveStep2()

3) PARCOURS RÉEL — clic sur un mode, puis sur « Continuer »
   clic sur un mode : visible=true
   → db.user.trainingMode = powerbuilding, boutons marqués sélectionnés = 1
   bouton « Continuer » : 1 trouvé, visible=true, activable=true
   après clic → ob-step-3
   erreurs JS non capturées : 0
```

**Verdict : pas de bloquant.** Deux faits distincts :

1. **`#ob-step-2` n'est pas sur le chemin d'un nouvel utilisateur.** `showOnboarding`
   (`app.js:2543`) route les non-onboardés vers `gotoObStep('q1')` — le fast flow v337.
   L'écran mode + objectif appartient au **flux long**, atteint depuis les Réglages
   (`obSaveStep1` → `gotoObStep('2')`, `app.js:2894`).
2. **Sur ce flux long, tout fonctionne.** Le bouton « Continuer → » existe, n'a pas d'id,
   n'est **jamais** `disabled`, et fait avancer à l'étape 3. `selectTrainingMode` écrit
   correctement `db.user.trainingMode` et marque le bouton sélectionné.

La ligne `if (continueBtn) continueBtn.disabled = false;` est donc un **vestige** : le
bouton démarrait désactivé dans une version antérieure et portait cet id. Aucun impact
utilisateur — ligne morte à nettoyer, pas un bloquant du parcours d'entrée.

⚠️ Ce qui reste à surveiller pour la refonte du tunnel : le parcours d'entrée a **deux
chemins** (`ob-step-1..7` pour l'édition, `ob-step-q1..q4` + `qdisc`/`qstyle` pour les
nouveaux), qui se partagent le même overlay et les mêmes handlers. Constat, pas
investigation — hors périmètre de ce balayage.
