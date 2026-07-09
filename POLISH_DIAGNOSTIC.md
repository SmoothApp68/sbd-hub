# Diagnostic COSMÉTIQUE / POLISH — TrainHub

> **Read-only.** Cartographie de l'état visuel (modales, transitions, cohérence stylistique, fluidité)
> pour préparer le chantier de polish avant lancement. Cible : Android Chrome (PWA), vanilla JS.
> Aucun code applicatif modifié, aucun changement visuel. Ce fichier = livrable de diagnostic uniquement.
>
> Méthode : 4 sweeps parallèles sur `js/app.js` (~31 600 lignes) + `index.html` (CSS inline lignes 32–1902),
> avec vérification croisée par comptages indépendants. Toutes les références sont en `fichier:ligne`.

---

## TL;DR — Verdict factuel

L'app est **fonctionnellement solide mais visuellement fragmentée**. Il n'existe **aucune couche UI unifiée** : chaque écran réinvente sa façon d'afficher une pop-up, d'animer, et de choisir ses couleurs. Ce n'est pas un problème de goût, c'est une **fragmentation mesurable** :

| Dimension | Fait mesuré |
|---|---|
| **Modales / overlays** | **8 systèmes distincts** coexistent ; z-index de **999 → 99999** sans échelle ; **2** toasts (bords d'écran opposés) ; **2,5** bottom-sheets (dont 1 cassée) ; **11** `confirm()` natifs ; les dialogues centrés n'ont **aucune animation** d'ouverture/fermeture. |
| **Transitions** | `@keyframes slideUp` et `shimmer` **définis 2× chacun** (la 2ᵉ écrase la 1ʳᵉ → les cartes n'ont plus leur fondu) ; **6 keyframes morts** ; sous-onglets tous en **snap** brutal ; tout **anime à l'entrée, rien à la sortie** ; `fadeIn` utilisé à **5 durées** différentes. |
| **Couleurs / tokens** | **421 hex + 417 rgba en dur** dans app.js (vs 1429 `var()`) ; **double vocabulaire** de tokens (`--accent` **et** `--blue`) ; **3 violets**, **4 gris**, **4 fonds sombres** quasi-identiques ; `var(--sub,#8e8e93)` où le fallback ≠ la vraie valeur du token. |
| **Boutons / états** | `.btn` (le seul bouton « système ») utilisé **8×** ; **40+ classes** de boutons ; **138 boutons inline** réinventent `.btn` ; **1 seule** règle `:disabled` (le reste = `opacity:0.4` en dur) ; aucun composant spinner/loading partagé. |
| **Fluidité Android** | Le picker d'exercices rend **~881 items + 881 images d'un coup** (aussi la cause des 429) ; **3 barres fixes** en `backdrop-filter: blur(20px)` repeignent à chaque frame de scroll ; **350 `onclick`** dont beaucoup sur des `<div>` **sans retour tactile** ; `transition: all` **54×** ; **~20 barres** animent `width` (layout). |

**Bonne nouvelle transversale** : `prefers-reduced-motion` est géré par un **blanket global** (`index.html:1098`). Toute transition *ajoutée* est donc automatiquement a11y-safe → **ajouter du mouvement est quasi zéro-risque**.

---

## 1. Pop-ups / modales — 8 systèmes coexistants (priorité Aurélien)

### Tableau comparatif

| | A. `.modal-overlay` | B. overlays inline plein écran | C1. `.toast` (file) | C2. `showPRToast` | D. `.go-bottom-sheet` | E. `.swap-modal` | F. bannières | G. popovers | H. `confirm()` natif |
|---|---|---|---|---|---|---|---|---|---|
| **Construit via** | classe CSS | `cssText` / `insertAdjacentHTML` | classe + file d'attente | `cssText` inline | classe CSS | classe CSS | inline / HTML statique | HTML statique + JS | API navigateur |
| **Style** | dialogue centré | plein écran | pilule **bas** | pilule **haut** | bottom-sheet | bottom-sheet | barre haut/bas | ancré | dialogue OS |
| **Anim. entrée/sortie** | **aucune / aucune** | quasi aucune | `toastSlide` in / **aucune** | `slideDownFade` / — | `fadeIn` backdrop / **aucune** | **aucune** | keyframe non-branchée | aucune | n/a |
| **Backdrop** | noir 0.70 | opaque, sans flou | aucun | aucun | noir **0.70** | noir **0.75** | aucun | aucun | dim OS |
| **Fermeture** | bouton seul | bouton seul | timeout | timeout | **tap-dehors** + bouton | bouton | timeout + × | tap-away | OK/Annuler |
| **Scroll** | box 85vh, **pas de lock** | inner auto, pas de lock | n/a | n/a | box **80vh** | box **70vh** | n/a | n/a | n/a |
| **z-index** | **9999 / 10000** | **9998 → 99999** | **999** | **9999** | **20000** | **20000** | **1050 / 9998 / 9999** | **999 / 9999** | OS |

### Recensement (~55–60 sites de création de pop-up)
- **Système A** (`.modal-overlay` / `.modal-box`) — le quasi-standard. Helpers réutilisables : `showModal()` `app.js:1319`, `showInfoModal()` `app.js:1317`, `closeModal()` `app.js:1318`. **22 sites** posent `className='modal-overlay'` en direct (souvent en re-surchargeant la classe avec du style inline, ex. `showReadinessModal` `app.js:713`). ~35 invocations effectives.
- **Système B** — ~10-12 overlays plein écran faits main (`showPaywall:27412`, `showMagicStart:2874`, `showPROverlay:31447`, `renderCropOverlay:28973`, quiz `4596`…).
- **Systèmes C1/C2** — **deux toasts indépendants** : la file `.toast` en **bas** (z 999) et `showPRToast` en **haut** (gradient, z 9999, autre animation).
- **Systèmes D / D′ / E** — **trois** implémentations de bottom-sheet : `goShowBottomSheet` (D, correcte), `openSwap`/`.swap-modal` (E, classe séparée, 0.75 backdrop, 70vh), et `_showChallengeSheet` (**D′ — CASSÉE**).
- **Système F** — bannières (`showLiveCoachBanner:28418`, install banners…), z-index 1050/9998/9999.
- **Système G** — popovers/tooltips ancrés (`showMusclePopover`, `showMuscleFatigueTooltip`).
- **Système H** — **11 `confirm()` natifs** (`app.js:1426, 12655, 12689, 13321, 14104, 17520, 28042, 29177, 29406, 29429, 30392`) — chrome OS, bloquant, non-stylable, visuellement étranger au reste.

### Incohérences objectives les plus parlantes

**(1) Une bottom-sheet, deux implémentations avec des constantes différentes :**
```css
/* index.html:1199 — Système D */
.go-bottom-sheet{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:20000;...;animation:fadeIn 0.15s ease;}
.go-sheet-box{background:#1A1A2E;border-radius:20px 20px 0 0;...max-height:80vh;overflow-y:auto;}
/* index.html:441 — Système E : quasi-clone, chiffres différents, pas d'animation */
.swap-modal{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:20000;...}
.swap-modal-box{background:#1A1A2E;border-radius:20px 20px 0 0;...max-height:70vh;overflow-y:auto;}
```

**(2) Bottom-sheet CASSÉE — classes CSS inexistantes (`_showChallengeSheet`, `app.js:7163`) :**
Le HTML référence `go-bottom-sheet-overlay`, `go-bottom-sheet-content`, `go-bottom-sheet-handle` qui **n'existent pas** dans le CSS (seuls `.go-sheet-box` / `.go-sheet-handle` existent) → le contenu s'affiche **sans panneau, sans coins arrondis**. Bug visuel latent.

**(3) Dialogue centré = zéro animation, alors que tout le reste bouge :**
```js
// app.js:1317 — Système A : réutilise .modal-overlay, aucune animation, z-index 9999
function showInfoModal(title, contentHtml){ var o=document.createElement('div'); o.className='modal-overlay'; ... document.body.appendChild(o); }
// closeModal — app.js:1318 : sort du DOM instantanément, aucun fondu
function closeModal(){ var el=document.querySelector('.modal-overlay'); if(el) el.remove(); }
```

---

## 2. Transitions & animations — mouvement présent mais incohérent + défauts structurels

### Défauts structurels (bugs réels, pas du goût)
- **`@keyframes slideUp` défini 2× :** ligne 103 (`translateY(20px)` + opacité) et ligne 1696 (`translateY(60px)`, **sans opacité**). En CSS la dernière gagne → `.card { animation:slideUp 0.5s }` (`index.html:127`) exécute en réalité la version 1696 : **les cartes glissent de 60px sans fondu**, pas l'effet voulu.
- **`@keyframes shimmer` défini 2×** (ligne 1000 puis 1487, sens opposé) → tous les shimmers défilent à l'envers de l'intention.
- **6 keyframes morts** (définis, jamais référencés) : `slideOutLeft`, `slideOutRight`, `fillBar`, `prCelebrateOut`, `badgeUnlock`, `xpFloat`.
- **Animation de célébration PR symétrique orpheline** : `.pr-celebration-box` / `.fade-out` (`index.html:1554-1555`) prévoit entrée **et** sortie, mais `showPRCelebration` (`app.js:31380`) appelle le `showModal` générique **sans animation** → la seule anim symétrique bien conçue n'est jamais utilisée.

### Pas d'échelle de timing
- **Durées de transition distinctes :** `0.1 / 0.15 / 0.2 / 0.25 / 0.3 / 0.35 / 0.4 / 0.5 / 0.6s` — dominante 0.2s, mais formats mixtes (`0.15s` **et** `.15s`).
- Le **même** keyframe `fadeIn` est joué à **5 durées** pour le même « faire apparaître un overlay » : `0.15s` (1199), `0.2s` (1178/1690/1892), `0.25s` (558/1209), `0.3s` (1246/1327/1505/1553/1622), `0.35s` (291/1518).
- Accordéons (`max-height`) : `0.3s` / `0.35s` / `0.4s` selon la section. Chevrons : `0.2s` ou `0.3s`. **Une seule** courbe custom dans tout le fichier (`cubic-bezier(.4,0,.2,1)` sur `.sc-detail:657`), tout le reste en `ease` implicite.

### Couverture du mouvement

| Interaction | État | Preuve |
|---|---|---|
| Onglets principaux (barre du bas) | **Animé** (slide directionnel) | `showTab` `app.js:3336`, CSS 76-77 |
| Sous-onglets (seances / coach / profil / jeux / stats) | **INSTANTANÉ (snap)** | `showProfilSub` `app.js:3302`, `showCoachSub` `17982`, etc. — CSS = `display:block`, aucun keyframe |
| Cartes `.card` | Animé (mais keyframe erroné, cf. supra) | CSS 127-132 |
| Ouverture modale générique | **INSTANTANÉ** | `.modal-overlay` sans animation |
| Fermeture modale/overlay/toast | **INSTANTANÉ** (`.remove()`, ~40 sites) | asymétrie entrée/sortie généralisée |
| Injection de contenu `innerHTML` (coach, stats, feed) | **Snap brutal** | pervasif |
| Barres de progression / jauges / anneaux | Animé | CSS multiples |

**Asymétrie dominante : tout anime à l'ENTRÉE, presque rien à la SORTIE.** Overlays, modales et toasts sont arrachés du DOM par `.remove()`.

### `prefers-reduced-motion` — **SUPPORTÉ** (blanket global, `index.html:1098`)
```css
@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:0.01ms!important; transition-duration:0.01ms!important; } }
```
Couvre **tout** le CSS. Seule limite : ne couvre pas les animations JS (`scrollIntoView({behavior:'smooth'})` `app.js:1747`).

---

## 3. Cohérence visuelle — tokens partiels, hardcoding massif

### Couleurs (dans `js/app.js`)
| Style de référence | Nombre |
|---|---|
| `var(--…)` tokens | **1429** |
| hex en dur `#…` | **421** |
| `rgba(…)` en dur | **417** |
| **valeurs hex distinctes** | **88** |

Les littéraux (hex + rgba = **838**) rivalisent avec les tokens (1429). Tokens gagnent ~63/37 — mais le hardcoding est **structurel, pas incident**.

**Double vocabulaire de tokens** (`index.html:63`, ligne « Legacy aliases ») : chaque couleur existe sous 2 noms, et le code préfère massivement les alias legacy :

| Concept | Token sémantique | Alias legacy | Usage réel |
|---|---|---|---|
| bleu accent `#0A84FF` | `--accent` (×129) | `--blue` (×61) | + `#0A84FF` en dur ×19 |
| vert succès `#32D74B` | `--success` (**×~1**) | `--green` (×109) | + `#32D74B` en dur ×21 |
| texte 2ⁿᵈ `#7878A8` | `--text-secondary` (**×2**) | `--sub` (×456) | — |

→ La couche **sémantique est quasi-morte** ; le code cible les alias. Et les mêmes couleurs sont **re-écrites en dur** ailleurs.

**Même couleur, plusieurs graphies — fragments réels :**
- **Violet** = 3 couleurs distinctes utilisées de façon interchangeable pour « épique/spécial » : `#bf5af2` (×30), `#7c6bff` (×15), `#a78bfa` (×9).
- **Gris texte** = 4 gris coexistants : `#86868b` (×21), `#8e8e93` (×6), `#555566` (×9), `#4a4a6a` (×9) — alors que `--sub` vaut `#7878A8`.
- **Fonds sombres** = 4 variantes quasi-identiques : `#1a1528`, `#2a2a45`, `#1a1a2e`, `#141428`.
- **Fallbacks contradictoires** : `var(--sub,#8e8e93)` (`app.js:14580`) — le fallback `#8e8e93` ≠ la vraie valeur `#7878A8`.

**Palette de rangs dupliquée dans 2 fonctions** (`app.js:6486` **et** `7250`) :
```js
{common:'#86868B',uncommon:'#32d74b',rare:'#0a84ff',epic:'#bf5af2',legendary:'#ff9f0a',mythic:'#ff453a'}
```

### Espacements / rayons / typo
- **`border-radius` : ~15 valeurs distinctes** (échelle molle 8/10/12/14 dominante, mais fuites `7/9/13/18px`). Pas d'échelle appliquée.
- **`padding` : aucune échelle** — chaque composant choisit sa paire (`6px 12px`, `10px 12px`, `8px 12px`, `6px 14px`…).
- **`font-size` : ~20 tailles distinctes**, aucun token `--font-size-*`, fuites `6/7/17/21/36/46px`. Trio corps 11/12/13 quasi ex æquo (216/197/188) → pas de standard de texte.

### Boutons & états
- **`.btn`** (le seul bouton système, `index.html:147`) utilisé **8×** seulement. **40+ classes** de boutons ; ~12 variantes quasi-dupliquées rien qu'en onboarding (`.ob-*-btn`). **138 `<button>` inline** (sur 267) réinventent padding/rayon.
- **`:active`** : uniforme (règle globale `button:active,[role=button]:active` `index.html:150`) ✅.
- **`:hover`** : ad-hoc, aucune convention globale (mineur sur tactile).
- **`:disabled`** : **1 seule** règle dans tout le CSS. Le reste = `opacity:0.4` en dur inline (~11 sites) → l'apparence dépend de chaque appelant.
- **loading/spinner** : aucun composant partagé ; seul `@keyframes spin` dans un **2ᵉ** bloc `<style>` isolé (`index.html:1911`).

---

## 4. Fluidité perçue (Android Chrome) — points de jank concrets

| # | Risque | Où | Sévérité |
|---|---|---|---|
| 1 | **Picker rend ~881 exercices + 881 images d'un coup** (aucun cap/window) | `goRenderSearchResults` `app.js:30206`, boucle `30325`, `innerHTML` `30349` | **HAUTE** |
| 2 | **Images tapent raw.githubusercontent.com sans retry** → 429/404 (le fameux problème d'images) ; seul un `onerror` remet un placeholder | `getExoImageUrl` `exercises.js:112`, base `exercises.js:6` | **HAUTE** |
| 3 | **3 barres fixes en `backdrop-filter: blur(20px)`** repeignent à chaque frame de scroll | tab-bar `index.html:69`, top-bar `1479`, rest-timer sticky `1163` | **HAUTE** |
| 4 | Page Badges construit **98 badges + 16 sections** en un seul `innerHTML` | `_renderGamBadges` `app.js:7619` | MOY-HAUTE |
| 5 | Feed **re-render tout l'accumulé** + refait 1 requête réactions **par item** à chaque « load more » | `renderFeed` `supabase.js:2133`, `2224`, `2228` | MOY |
| 6 | **Retour tactile manquant** sur les `<div>` cliquables (`.feed-card`, `.bdg`, `.ob-*-btn`, `.theme-option`…) — 350 `onclick`, `:active` global ne couvre que `<button>` | `index.html:150` (portée) ; sites app.js/supabase.js | MOY |
| 7 | **`transition: all` ×54** + **~20 barres animent `width`** (layout, pas `transform`) | `index.html` (100, 482, 510, 844, 1030, 1079…) | MOY |
| 8 | Handler scroll lit `offsetWidth` à chaque tick (forced layout) | carrousel force `app.js:7571` | MOY-BAS |

Reste **propre** : seulement 4 lectures forced-layout dans tout app.js, et les timers (GO `27051`, repos `28645`, autosave `25940`) ne font que du `textContent` → pas de jank.

---

## 5. Chantiers de polish — proposition de découpage priorisé

> Légende risque : 🟢 = purement visuel/réversible (CSS, style) · 🟡 = touche à de la logique/flux (à tester)
> Impact = impact visuel perçu · Effort = S / M / L

### ⚡ TIER 0 — Quick wins (S, fort impact/effort, 🟢) — à faire en premier quel que soit le chantier choisi
| Action | Fichier | Impact | Effort | Risque |
|---|---|---|---|---|
| **Animer `.modal-overlay` + `.modal-box` (fade backdrop + scale-in box)** — 1 règle CSS anime instantanément **~35 dialogues** | `index.html:164` | **Fort** | **S** | 🟢 |
| **Réparer les `@keyframes` dupliqués** (`slideUp`, `shimmer`) → les cartes retrouvent leur fondu | `index.html:103/1696, 1000/1487` | Moyen | **S** | 🟢 (bugfix) |
| **Ajouter `:active { transform:scale(.98) }`** aux rangées `<div>` tappables (feed, badges, onboarding) | `index.html` (classes) | Moyen-Fort | **S** | 🟢 |
| **Réduire/retirer `backdrop-filter: blur(20px)`** sur les 3 barres de scroll | `index.html:69, 1163, 1479` | Moyen (fluidité) | **S** | 🟢 |
| Purger les **6 keyframes morts** | `index.html` | Faible (propreté) | **S** | 🟢 |

### CHANTIER A — Unifier les modales (⭐ priorité Aurélien)
- **Périmètre** : `app.js` (helpers `showModal/showInfoModal/showToast/goShowBottomSheet` + ~55 sites), `index.html` (`.modal-overlay`, `.toast`, `.go-bottom-sheet`, `.swap-modal`).
- **Impact : Fort** (le plus visible) · **Effort : L** (phasable) · **Risque : 🟢 en majorité, 🟡 sur 2 points**.
- Découpage suggéré : **A1** réparer la sheet cassée `_showChallengeSheet` + poser une **échelle de z-index** (ex. toast 100, sheet 200, modal 300, overlay plein écran 400) 🟢 · **A2** fusionner les **2 toasts** en un seul (`showPRToast` → passe par la file `.toast`) 🟢 · **A3** fusionner `.swap-modal` dans `.go-bottom-sheet` (une seule bottom-sheet) 🟢 · **A4** remplacer les **11 `confirm()` natifs** par `showModal` 🟡 *(confirm est bloquant/synchrone, showModal est à callback → change le flux, à tester)*.

### CHANTIER B — Cohérence du mouvement
- **Périmètre** : `index.html` (keyframes, timings), `app.js` (switchers de sous-onglets).
- **Impact : Moyen-Fort** · **Effort : M** · **Risque : 🟢** (le blanket reduced-motion couvre tout ajout).
- Contenu : ajouter une transition aux **sous-onglets** (aujourd'hui snap), ajouter des **animations de sortie** (fin de l'asymétrie in/out), **unifier l'échelle de durées** (une variable `--dur-fast/-mid/-slow`), brancher l'anim symétrique orpheline de célébration PR.

### CHANTIER C — Centraliser les tokens couleur
- **Périmètre** : `index.html:33-64` (`:root`), `app.js` (838 littéraux couleur).
- **Impact : Moyen** (peu visible à l'unité, mais règle les micro-incohérences + débloque un futur theming) · **Effort : L** (mécanique, scriptable, phasable) · **Risque : 🟢 sauf décisions**.
- ⚠️ **Nécessite des arbitrages d'Aurélien** : choisir LE violet canonique (parmi 3), LE gris texte (parmi 4), LE fond carte (parmi 4) — ce ne sont pas des doublons exacts mais des couleurs réellement différentes. Puis remplacement mécanique + suppression du double vocabulaire (garder sémantique **ou** legacy, pas les deux).

### CHANTIER D — Polish boutons & états
- **Périmètre** : `index.html` (classes boutons), `app.js` (138 boutons inline).
- **Impact : Moyen** · **Effort : M-L** · **Risque : 🟢**.
- Contenu : convention `:disabled` réelle (remplacer `opacity:0.4` inline), composant spinner/loading partagé, consolider les ~12 variantes `.ob-*-btn`, faire pointer les CTA inline vers `.btn`.

### CHANTIER E — Fluidité Android (mixte cosmétique / perf)
- **Périmètre** : `app.js` (`goRenderSearchResults`), `supabase.js` (`renderFeed`), `index.html` (CSS).
- **Impact : Fort** (vitesse perçue) · **Effort : mixte** · **Risque : 🟢 pour la partie CSS, 🟡 pour 2 items**.
- Parties 🟢 : `transition: all` → propriétés ciblées, barres `width` → `transform: scaleX`, réduction du blur (déjà en Tier 0).
- Parties 🟡 (touchent la **logique de rendu**, à tester) : **virtualiser/paginer le picker 881 items + batcher ses images** (règle aussi les 429), corriger le **re-render intégral du feed**.

---

## Ordre de priorité recommandé (impact/effort)

1. **⚡ Tier 0** — quick wins CSS (½ journée, fort ROI, 100% 🟢). Notamment : **animer `.modal-overlay`** donne un gain visuel immédiat sur ~35 pop-ups pour ~1 règle CSS.
2. **Chantier A (modales)** — la priorité d'Aurélien ; commencer par A1→A3 (🟢) avant A4 (🟡).
3. **Chantier B (mouvement)** — cohérence perçue, faible risque.
4. **Chantier E — partie 🟢** (blur, transition:all, barres) puis **partie 🟡** (virtualisation picker = plus gros gain de fluidité réelle + fix des 429).
5. **Chantier C (tokens couleur)** — gros mais mécanique ; nécessite d'abord les arbitrages couleur d'Aurélien.
6. **Chantier D (boutons/états)** — finition.

> **STOP — diagnostic seul.** À Aurélien de choisir le 1er chantier. Aucun code applicatif n'a été modifié.
