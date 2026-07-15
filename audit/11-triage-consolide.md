# AUDIT 11 — Triage consolidé (synthèse des rapports 00→10)

> Agent 11 (synthétiseur). READ-ONLY. Livrable pour l'agent 12 (stratège).
> Généré le 2026-07-15. Branche `claude/agent09-profils-fixtures`. SW v350.
> STATUT : rapport final.

## Blocages rencontrés

Aucun blocage bloquant. READ-ONLY strict respecté : **un seul fichier écrit** (`audit/11-triage-consolide.md`), aucun `git`, aucun Supabase, aucun sous-agent, aucune modif d'un fichier applicatif/test/config/CLAUDE.md. Deux limites héritées des rapports sources, à garder en tête :
1. **`npm test` n'a JAMAIS tourné** (node_modules absent) dans tout le dispositif d'audit (constaté par 00, 01, 06, 08). Le « ~602 tests verts » est **analysé, pas vérifié**. Aurélien doit lancer `npm ci && npm test` sur un env avec deps avant de se fier au vert.
2. **Personne n'a accès à Supabase** — toutes les sévérités « data-dépendantes » sont inférées du code. Les questions consolidées sont en fin de rapport.

---

## LE VERDICT EN 10 LIGNES

1. **L'app ne s'effondre pas.** 0 crash sur 9 profils × 10 onglets en local (agent 10), tuyauterie défensive solide (loadDB→defaultDB, quota capté, offline complet, `wp*Safe`).
2. Mais elle **ment par endroits** et **maltraite les utilisateurs non-Aurélien** — c'est ça le vrai sujet, pas la stabilité.
3. **Confirmé À L'ÉCRAN** (pas déduit) : le Coach d'aurel affiche « décharge cette semaine » ET « vise un PR » en même temps ; l'anneau nutrition prescrit **939 kcal à une athlète de 40 kg** ; l'onglet Jeux **réécrit au render la clé qui ressuscite un compte supprimé** (P0 RGPD).
4. Le fil rouge du projet tient toujours : les corrections (arbitre, PR-vs-e1RM, seuils Gemini) ont été faites sur **une** surface (le Coach principal) et **pas propagées** aux autres (Stats, Corps, Diagnostic, Forme Score).
5. **Léa (60 kg) se voit prescrire ~1408 kcal** parce que `calcCalorieCible` est câblé en dur sur le profil d'Aurélien (2300/98). Ça touche de **vrais comptes**, pas du confort.
6. Le **droit à l'oubli est défait localement** : suppression de compte + un render de l'onglet Jeux = le profil « supprimé » revient au reboot.
7. La bonne nouvelle : les **cœurs de calcul** sont justes et bien testés (calcTDEE, wpComputeWorkWeight, computeIntensityVerdict, predictPR, recalcBestPR). Le mal est dans le **dernier kilomètre** (câblage UI, surfaces secondaires, seuils non propagés) et les **garde-fous absents** (données sales, cross-device).
8. Les tests **n'ont pas pu** attraper ces bugs : ~10 % sont du grep de source (vérifient un littéral, pas un comportement) et les fixtures « étalent l'idéal ». La bibliothèque réaliste (agent 09) existe mais **n'est branchée à aucun test**.
9. Ce n'est **pas** 150 bugs indépendants, mais ce n'est **pas** non plus 5 chantiers propres : c'est ~60 problèmes consolidés qui se regroupent en **~7 chantiers**, dont 2 que l'hypothèse initiale ne nommait pas (robustesse données-sales, intégrité sync).
10. Volume réaliste, discipline d'Aurélien respectée (un chantier à la fois, vérif device avant merge) : **3 à 6 mois** de soirées/week-ends. Ce n'est pas un week-end de ménage.

---

## L'HYPOTHÈSE DES 5 FAMILLES : TIENT-ELLE ?

**Verdict : elle TIENT PARTIELLEMENT.** Le méta-pattern « corrections non-propagées » est **le meilleur insight du dispositif** et explique une grande moitié des findings. Mais l'hypothèse est **incomplète** (2 clusters orthogonaux non nommés), **sur-optimiste sur une famille** (e1RM), et **fausse sur le découpage** (« 5 chantiers = fini » ne tient pas — plusieurs familles sont grosses et se recoupent).

### Ce qui TIENT (le méta-pattern est réel)
Quatre des cinq familles pressenties sont **confirmées**, et trois d'entre elles **par l'agent 10 à l'écran** (fait observé, pas déduit) :

| Famille pressentie | Statut | Confirmé par le 10 ? |
|---|---|---|
| (2) Verdicts d'intensité concurrents | ✅ TIENT (la plus forte) | **OUI, à l'écran** (A5 : deload + « vise un PR » simultanés sur aurel) |
| (3) 3 voies caloriques + 2 macros | ✅ TIENT | **OUI, à l'écran** (A4 : 939 kcal à côté de 1706 sur la MÊME carte ; B5 : 216 vs 235 g prot) |
| (4) Render pur violé | ✅ TIENT (plus large que « 3 écritures ») | **OUI, à l'écran** (A6 : Jeux écrit db + SBD_HUB 962 KB ; B4 : freeze consommé au render) |
| (5) Formats coexistants | ✅ TIENT (partie warm-up) | **OUI, chiffré** (A9 : 23,3 % des warm-ups comptés comme travail sur aurel) |
| (1) Fuite e1RM hors Coach | ⚠️ SUR-ÉVALUÉE (voir ci-dessous) | **INFIRMÉE en partie** (A1 : le vaisseau amiral `renderPerfCard` est `display:none` depuis v264 → dette morte, pas un P0) |

### Ce qui NE TIENT PAS (les corrections de l'hypothèse)

**A. La famille (1) e1RM est sur-évaluée.** L'agent 04 la classait P0 sur `renderPerfCard`. L'agent 10 a **observé** que cette carte est masquée en permanence (`display:none`, `offsetParent===null`, jamais ré-affichée depuis v264) → **la fuite existe dans le code mais n'est jamais rendue** → P4 dette morte, pas P0. La surface Records réellement visible **respecte §7** (PR réel gros, « e1RM estimé » petit). Restent des fuites secondaires (app.js:10018 « Meilleur : Xkg », 9957) non confirmées à l'écran, ET une **question produit non tranchée** : §7 strict (« jamais afficher l'e1RM ») vs « Philosophie B » du code (e1RM OK si labellisé). L'agent 04 dit lui-même que c'est une **décision produit**, pas un bug pur. → Famille réelle mais **plus petite** et **pas corrigeable d'un seul chantier tant que la décision §7 vs Philo B n'est pas prise.**

**B. La famille (5) confond un bug et une landmine gardée.** Le sous-problème warm-up (`setType` vs `isWarmup`) est un **vrai bug confirmé** (23 % d'inflation). Mais `exo.sets` number-vs-array est une **landmine actuellement GARDÉE** (`Array.isArray` partout — 05, 07, 09 concordent) : ce n'est pas un bug live, c'est de la dette. La famille (5) = essentiellement le warm-up.

**C. Les 2 « P0 standalone » ne sont pas standalone.** Le **P0 RGPD** est en fait **imbriqué dans la famille (4)** : l'écriture `setItem('SBD_HUB')` se déclenche **au render de l'onglet Jeux** (agent 10 A6). C'est donc mi-render-impur (famille 4), mi-suppression-incomplète (persistance). Le **calcIPFGL** est, lui, vraiment isolé — mais l'agent 10 a **corrigé** l'agent 01 : ce n'est pas « tout le monde Débutant » (ça varie par total brut : Débutant/Avancé/Élite), le vrai bug est « le poids de corps est ignoré » (`total × 0.4853`).

**D. Il manque au moins 2 familles que personne n'a nommées au niveau méta** (mon finding le plus précieux) :

- **FAMILLE 6 — Duplication des diagnostics (ratios + push/pull).** C'est le problème **le plus vu** (5 agents : 01, 03, 04, 06, 10). Deux systèmes de ratios (`STRENGTH_RATIO_TARGETS` recalibré côté Coach vs `computeStrengthRatios` non recalibré côté Stats) + **trois** calculs push/pull divergents + une prescription programme **cross-wired** (valeurs d'un système, seuils de l'autre) + le bug **« 0 traité comme faible »** (ratio d'un lift jamais loggé = 0 → fausse alerte 🚨 danger, confirmé à l'écran B1/B2). C'est le même méta-pattern (non-propagation), **mais un code, un fix et un risque distincts** de la famille (2). L'hypothèse le noyait dans « seuils recalibrés » ; il mérite son nom.

- **FAMILLE 7 — Garde-fous absents (données sales / cas limites).** Ce n'est **PAS** de la non-propagation, c'est du **code défensif jamais écrit** : aucun garde-fou d'outlier (315 kg empoisonne PR+ratios, confirmé B2), 0-traité-comme-faible, arithmétique sur champs manquants (`null/2=0`, `undefined/2=NaN`), `predictPR` sans fenêtre de récence (faux « objectif atteint » latent), `getSBDType`/~94 accès `log.exercises` non gardés (crash sur log malformé), plafond localStorage ~2700 séances, calcTDEE 4524 kcal sur height/age=0. Cette famille contient de **vrais bugs utilisateur** et l'hypothèse ne la voit pas du tout.

- **(demi-famille 8) — Intégrité sync/persistance.** Perte de données cross-device : login `db=prof.data` jette les logs, le merge de pull **écrase XP/badges/check-ins** (viole « XP ne descend jamais »), hash lit le mauvais chemin `xpHighWaterMark`. **Non confirmée à l'écran** (agent 10 était offline) → sévérité inférée, à prouver sur device multi-appareils. Distincte de la famille (4).

### Combien de findings entrent dans les familles ?
Sur ~60 findings consolidés : **~40 entrent dans les 6 familles + demi-famille 8** (non-propagation + render + formats + sync), **~12 sont de la robustesse (famille 7)**, et **~8 restent orphelins** (calcIPFGL, renderFriendsTab crash, onboarding offline, dette pure, overlays natifs, chantier couleur). Donc oui, le regroupement est **massivement vrai** — mais « 5 familles » devient **7 chantiers**, et deux d'entre eux ne sont pas de la propagation.

### Une famille = un seul chantier ? Illusion partielle.
- Vrai pour : caloriques (3), warm-up (5), calcIPFGL. Fix cohérent et contenu.
- **Illusoire pour** : l'arbitre (2) touche 6 émetteurs dans 3 fichiers ; les ratios (6) touchent Coach + Stats + prescription + le bug 0-as-null ; le render pur (4) touche 4 voies d'écriture + la suppression RGPD. Ce sont des **thèmes** cohérents mais des **chantiers lourds**, pas des one-liners.

---

## LES FAMILLES

> « Nb agents » = signal de largeur : un problème vu par 4-5 agents est structurellement plus large qu'un vu par un seul.

| # | Famille | Findings regroupés | Vue par (agents) | Nb | 1 chantier suffit ? | Effort |
|---|---|---|---|---|---|---|
| **2** | **Arbitre = seule voix violé** (verdicts d'intensité concurrents) | Diagnostic ACWR push/deload · carte Volume deload · AutoTuner −1 série · getActivityRecommendation repos · SNC « repos complet » · LCA « risque blessure » · RHR/Garmin repos · computeSRS label · coachGetFullAnalysis (tab-ai orphelin) | 02, 03, 10 | 3 | Thème oui, mais **6 émetteurs / 3 fichiers** | **gros** |
| **6** | **Duplication diagnostics** (ratios + push/pull) — *non nommée par l'hypothèse* | 2 systèmes de ratios divergents · Stats non recalibré · prescription cross-wired · 3 push/pull · **0-traité-comme-faible** (fausse alerte danger) | 01, 03, 04, 06, 10 | **5** | Non (Coach+Stats+prescription+null) | **moyen-gros** |
| **4** | **Render pur violé** | Jeux écrit db+SBD_HUB · Coach lundi generateWeeklyReport · calcStreak freeze au render (11 sites) · blockStartDate (conditionnel) · saveDB au boot | 02, 05, 07, 09, 10 | **5** | Oui (thème « sortir les écritures du render ») | **moyen** |
| **3** | **Voies caloriques + macros** | calcCalorieCible hardcodé aurel (2300/98) · Corps 2300 vs Coach 2672 · Forme Score adhérence vs 2300 · 2 formules macros (216 vs 235) · Katch cardioKcal ×7 | 01, 06, 07, 10 | 4 | **Oui** (une source de vérité) | **moyen** |
| **5** | **Formats coexistants** (warm-up) | warm-up `setType` sans `isWarmup` → 23 % compté travail · migrateDUPRegisters · (exo.sets num/array = landmine GARDÉE, pas un bug) | 05, 06, 09, 10 | 4 | **Oui** (helper `isWorkSet`) | **petit-moyen** |
| **1** | **Fuite e1RM** — *sur-évaluée* | renderPerfCard (**MORT visuel**, A1) · fuites 10018/9957 (non confirmées écran) · §7 strict vs Philo B (**décision produit**) | 01, 03, 04, 09, 10 | 5 | Non (décision produit d'abord) | **petit** (après décision) |
| **7** | **Garde-fous absents** (robustesse) — *non nommée par l'hypothèse* | pas d'outlier guard (315 kg) · predictPR sans récence · checkin `null/2=0` · getSBDType/log.exercises non gardés · localStorage plafond · TDEE 4524 (height=0) | 07, 09, 10 | 3 | Oui (thème « normaliser+garder ») | **moyen** |
| **8** | **Intégrité sync** (demi-famille) — *NON confirmée écran* | login db=prof.data jette logs · merge écrase XP/badges/checkins · hash mauvais chemin xpHWM · bestPR desync | 00, 05, 08 | 3 | Oui | **moyen-gros, risqué** |

**Orphelins hors familles (~8)** : calcIPFGL (bw ignoré) · renderFriendsTab crash (users connectés) · onboarding impossible offline · overlays `prompt()`/`confirm()` natifs · chantier couleur (rouge décoratif) · dette/code mort · html2canvas CDN externe · syncSupabase fantôme au pull-to-refresh.

---

## P0 — le coach ment, l'app casse, ou un vrai utilisateur est touché

> Note : les 3 P0 se **recoupent** (le P0 RGPD est la face « écriture » du P0 render-pur). Traités ensemble au Chantier 1.

| # | Finding | Où | Preuve | Confirmé par le 10 ? | Effort |
|---|---|---|---|---|---|
| **P0-1** | **RGPD : le profil « supprimé » ressuscite** — `setItem('SBD_HUB')` (db complet) écrit au render ; suppression n'efface que `SBD_HUB_V29` ; `SBD_HUB` ∈ FALLBACK_KEYS → relu au boot | écriture app.js:4388 · fallback app.js:113 · suppression app.js:1675 | 05 (chaîne complète lisible) ; 09-F6 | **OUI (A6/B4)** : `SBD_HUB` **962 KB réécrit à l'ouverture de l'onglet Jeux** | petit (retirer l'écriture + purge complète des clés) |
| **P0-2** | **Render non pur** : Jeux écrit `db` (xpHWM, quêtes) ; Coach le lundi écrit `db.reports` ; **calcStreak consomme un freeze + sync cloud + toast au render** (11 sites sans readOnly) | app.js:4384-4388 (Jeux) · 18475→20384 (Coach lundi) · 4549-4564 (calcStreak) | 02, 05, 07, 09 | **OUI (A6 + B4)** : mutations diffées à l'écran ; **toast « ❄️ Freeze utilisé » observé au render** de mono_lift | moyen (readOnly partout + generateWeeklyReport hors render) |
| **P0-3** | **Arbitre contredit** : « Décharge cette semaine » (arbitre, 19 sem.) ET « Fenêtre optimale — vise un PR » (Diagnostic ACWR) sur le **même écran** | arbitre app.js:19467 · Diagnostic engine.js:2964 | 02 (P0), 03 (P1 SNC) | **OUI (A5)** : reproduit tel quel sur aurel, capture `coach-aurel_like.png` ; + auto-contradiction interne (« Fenêtre optimale » à côté de « Pic de charge — risque de blessure ») | gros (6 émetteurs) |

**Ce que le 10 a fait tomber du rang P0** (fait observé > déduction) :
- **e1RM `renderPerfCard`** : classé P0 par 04 → **P4** (carte `display:none` permanente, jamais rendue).
- **calcIPFGL « tout le monde Débutant »** (01, P1) → **nuancé P2** : le libellé varie par total (Avancé/Élite existent) ; vrai bug = « bw ignoré ».
- **`predictPR` faux « objectif atteint »** (07, P0/§7) → **latent** : mécanisme confirmé (récence ignorée) mais **aucun « objectif atteint » affiché** (pas de cible < e1RM périmé dans les fixtures). Reste à corriger, mais pas P0 observé.
- **Freeze/perf au render** (07, P1) → **non reproduit** ≤ 82 ms, mais **caveat fort** : matériel serveur ≫ Android, Chart.js async non mesuré → non exclu sur device.

---

## P1 → P4 (condensé)

### P1 — chiffre faux / seuil absurde / vrai utilisateur touché

| # | Finding consolidé | Où | Agents | Confirmé 10 ? |
|---|---|---|---|---|
| P1-a | **calcCalorieCible hardcodé aurel (2300/98)** → Léa 60 kg **1408 kcal**, extreme_bas 40 kg **939 kcal** (famine), aurel 2300 vs son propre TDEE 2672 | engine.js:1355, rendu app.js:16142 | 01, 06, 10 | **OUI (A4)** — 939 à côté de 1706 sur la même carte |
| P1-b | **Warm-ups `setType:'warmup'` comptés comme travail** (23,3 %) → fausses alertes « Push/Pull 2.61 », « Ischios/Quads 0.43 » | engine.js:2044, 2882, 4696 · app.js:14629, 18803 · computeWeeklyVolume:1705 · detectVolumeSpike:4696 | 05, 06, 09, 10 | **OUI (A9)** — 834/4418 chiffré |
| P1-c | **2 systèmes de ratios + Stats non recalibré** : bench/squat 0.97 → « ⚠️ Trop haut » (Stats) alors que « rien d'alarmant » (Coach) ; bandes [0.60,0.70]/[0.80,0.85]/[0.60,0.65] absurdes | app.js:15618/15633-36 vs engine.js:43 | 01, 03, 04, 06 | partiel (Stats non ouvert par 10, mais Coach confirmé) |
| P1-d | **0-traité-comme-faible** → fausses alertes 🚨 danger sur lifts jamais faits (« protège ton Squat lourd » à un mono-bencher) | computeStrengthRatiosDetailed engine.js:2589 (retourne 0, pas null) | 09-F2, 10-B1 | **OUI (B1/B2)** — mono_lift 🚨, donnees_sales S/B 3.93 « ✓ optimal » |
| P1-e | **Pas de garde-fou outlier** : 315 kg (lbs saisis en kg) → bestPR 315, S/B 3.93 affiché « optimal », empoisonne charges | recalcBestPR app.js:1759 | 07, 09-F1, 10-B2 | **OUI (B2)** — « SQUAT 315kg » |
| P1-f | **Forme Score juge l'adhérence vs 2300** → manger les 2672 du Coach = jugé NON-adhérent par sa propre app | app.js:15916 | 06 | non (Stats/Forme non ouverts) |
| P1-g | **predictPR sans fenêtre de récence** → faux « objectif atteint » pour un revenant (e1RM vieux de 7 mois pris pour courant) | app.js:9262 | 07, 08, 10-A8 | latent (mécanisme oui, affichage non) |
| P1-h | **Login `db=prof.data`** persiste un blob sans logs → boot suivant jette le profil (defaultDB), historique non ré-hydraté | supabase.js:1057 | 05 | non (offline) |
| P1-i | **Merge de pull écrase XP/badges/check-ins** avec le cloud (pas de max/union) → viole « XP ne descend jamais » cross-device | supabase.js:733 | 05, 08 | non (offline/multi-device) |
| P1-j | **Plafonds de progression non scalés au niveau** (2.5 kg/sem deadlift pour tous) → avancé faussement « Sur la bonne voie » | engine.js:5611 | 03 | non |
| P1-k | **Fuites e1RM secondaires** affichées « Meilleur : Xkg » sans disclaimer (hors renderPerfCard mort) + décision §7 vs Philo B | app.js:10018, 9957, 16845 | 01, 03, 04 | non confirmé écran (Records visible = OK) |
| P1-l | **calcTDEE fallback 4524 kcal** sur height/age=0 (bw×33) | engine.js:1184 | 07 | (déduit) |

### P2 — incohérence / contradiction entre surfaces

| # | Finding | Où | Agents |
|---|---|---|---|
| P2-a | **calcIPFGL ignore le poids de corps** (`Math.pow(bw,2.12345)` → underflow) : `total×0.4853`, « IPF GL » est un mensonge | app.js:15355 | 01, 10-A2 |
| P2-b | **renderFriendsTab crash** `#socialFriendsBadge` (id inexistant) → TypeError pour tout user **connecté** sur Social>Amis | supabase.js:3224 | 00, 10-A3 |
| P2-c | **3 calculs push/pull divergents** (fenêtres 7/14/30j, sets vs kg, pondérations ≠) alimentant la même surface | engine.js:2874 · app.js:15638 · program.js:144 | 01, 03, 06 |
| P2-d | **2 formules de macros** (P 2.2/L 0.9 Coach vs P 2.4/L 0.73 Corps), commentaire « harmonisées » faux | app.js:15337 vs engine.js:1377 | 01, 06, 10-B5 |
| P2-e | **hash de sync lit `d.xpHighWaterMark`** (top-level, toujours 0) au lieu de `d.gamification.*` → XP non synchronisée | supabase.js:268 | 05 |
| P2-f | **coachGetFullAnalysis / tab-ai** : 2ᵉ coach complet hors arbitre, atteignable par deep-link/lastTab | coach.js:67, index.html:2520 | 02 |
| P2-g | **checkin : arithmétique sur champs manquants** → `null/2=0` (énergie mini), `undefined/2=NaN` (seuils ignorés) | app.js:689 | 05, 09-F4 |
| P2-h | **bestPR desync logs** (bestPR dans le blob, logs hors blob) → « PR sans log » ou bestPR remis à 0 si recalc sur logs vides | supabase.js:284, app.js:1759 | 05 |
| P2-i | **logs[0] supposé le plus récent** alors que push/unshift divergent → faux « washout » possible | engine.js:2307 | 05, 07, 09-F3 |
| P2-j | **getSBDType crash sur exo sans `name`** (17 sites `.name.toLowerCase()` non gardés) | engine.js:809 | 07 |
| P2-k | **~94 accès `log.exercises.*` non gardés** → crash sur log malformé (1 normalisation loadDB couvrirait tout) | app.js:9266… | 07 |
| P2-l | **computeSRS double-compte l'activité secondaire** (ACWR + malus direct) | coach.js:707/804 | 01 |
| P2-m | **getProgressionScore compare au plus VIEUX historique** (`slice(-N)` au lieu de `slice(0,N)`) | app.js:7350 | 01 |
| P2-n | **2 tables de phase contradictoires** (PHASE_MULT peak 1.05 vs APRE_PHASE_CAPS peak 1.00) | app.js:22975 vs 22695 | 01 |
| P2-o | **prescription programme cross-wired** : valeurs de `computeStrengthRatios`, seuils de `STRENGTH_RATIO_TARGETS` | app.js:23766 | 06 |
| P2-p | **DUP tethering asymétrique** (détecte à 1.15, corrige à 0.85 → écart réel 17,6 %) ; l'hypertrophie peut tirer la force ↑ | engine.js:4936 | 01 |
| P2-q | **Alertes danger du Diagnostic capées** (peuvent passer sous « Voir plus ») ; AutoTuner cite « Insolvency » (métrique gelée) | app.js:19415 · coach.js:551 | 02, 03 |
| P2-r | **localStorage plafond ~2700 séances** (1 MB / 562 séances) → écriture perdue au quota (silencieux) | app.js:364 | 07 |

### P3 — cosmétique / ton / lisibilité
Rouge décoratif sur scores/jauges <40, ratios « danger », perte musculaire, volume >MRV (04) · tokens `--color-*` morts, couleurs de lift incohérentes (04) · micro-typo <8px (04) · `prompt()`/`confirm()` natifs (régression overlays, 04) · « Progression Anormalement Lente » qui se contredit (03) · MRV « risque surentraînement » alarmiste (03, 04) · quêtes d'intensité pendant deload (03) · hooks marketing « il t'attend toujours »/« top 5% mondial » (03) · « Glucides undefined » (10-B6) · « Fenêtre optimale — vise un PR » sur débutant 3 séances (10-B7) · articulaire « +340% vs habituel » (10-B8) · calcStreak plancher `2026-W01` en dur (01) · check-in daté UTC vs local près de minuit (07, 08) · onboarding impossible offline (10-B3, backlog #8).

### P4 — dette invisible
Code mort confirmé 0-appelant : `calibrateTDEE`, `detectMomentum`, `checkRecompoProgress`, `computeWilks`, `estimateE1RMFromTransfer`, générateurs `program.js` (epley/brzycki/lombardi/generatePL/PB/Muscu…), ~72 fn orphelines + 13 test-only (00, 06) · fichiers orphelins `supabase.min.js` (154 KB), `js/{babel,jest}.config.js`, `js/jest.setup.js` (00, 06, 08) · **renderPerfCard/#perfCard mort** (10-A1) · html2canvas CDN externe + CSP (bouton Télécharger mort, 00) · `syncSupabase` fantôme au pull-to-refresh (00) · `purgeVeryOldLogs` inexistante → vieux logs jamais purgés (00) · 29 `audit-*.spec.js` Playwright périmés hors gate (00, 06, 08) · tests grep-source (~10 %) + fixtures idéalisées + fixtures agent 09 branchées à **aucun** test + 0 contrôle du temps (08) · 3 vocabulaires muscle→parent, ~17 copies de fenêtre temporelle vs getLogsInRange (06) · modèle de temps sync redondant (5 horodatages, 05).

---

## CHANTIERS PROPOSÉS

> Rappel méthode (CLAUDE.md) : **un chantier à la fois · diagnostic-first (jamais diagnostiquer ET fixer) · 1 prompt = 1 commit atomique · test dans le même commit · bump SW · PR jamais mergée sans vérif device · Claude Code n'a pas accès à Supabase.** Chaque chantier = un cycle diagnostic → fix minimal → vérif device → merge.
> Ordre = (dégât utilisateur réel) × (confirmé par le 10) × (contenance/risque). Les chantiers 1-4 sont les plus rentables ; 8 est le plus risqué.

### Chantier 1 — RGPD + render pur *(P0, légal, confirmé écran)*
- **Contenu** : retirer `setItem('SBD_HUB')` (app.js:4388) ; purger **toutes** les clés SBD à la suppression/déconnexion (`requestAccountDeletion` 1675, `cloudLogout`) ; sortir `generateWeeklyReport` de `renderCoachTab` (→ boot/fin de séance) ; passer `readOnly:true` aux 11 sites `calcStreak()` d'affichage (consommation de freeze hors render).
- **Gain** : droit à l'oubli réellement respecté (légal) ; render pur = invariante enfin vraie et testable ; plus de sync/toast parasite au render.
- **Débloque** : le test « render pur » (chantier 12) devient assertable.
- **Effort** : petit-moyen. **Risque** : faible (on retire des écritures). **Dépendance** : aucune. **→ FAIS-LE EN PREMIER.**

### Chantier 2 — Une seule source calorique + macros *(P1, vrais utilisateurs, confirmé écran)*
- **Contenu** : router l'anneau Corps (`nutriCible`) **et** l'adhérence du Forme Score sur `getDailyCaloricTarget`/`calcTDEE` ; supprimer/rebrancher `calcCalorieCible` (hardcode aurel) ; unifier `calcMacrosCibles` avec les ratios du Coach (trancher 2.2/0.9 canonique) ; corriger le commentaire « harmonisées » faux.
- **Gain** : Léa/extreme_bas ne se voient plus prescrire la famine ; l'utilisateur ne voit plus 2 objectifs kcal + 2 jeux de macros ; le Forme Score cesse de contredire le Coach.
- **Effort** : moyen. **Risque** : faible-moyen. **Dépendance** : une **décision Gemini/Aurélien** (quelle cible est « vraie » pour aurel : 2300 ou 2672 ?) + question Supabase (kcalBase/bwBase renseignés ?).

### Chantier 3 — L'arbitre = seule voix *(P0, confirmé écran, GROS)*
- **Contenu** : faire **consommer le verdict** (ou rendre non-prescriptifs) par : Diagnostic ACWR (engine.js:2953-2966), carte Volume (app.js:20156), AutoTuner (coach.js:531), getActivityRecommendation (app.js:18997), carte SNC (engine.js:2977), LCA « risque blessure » (engine.js:2921), cartes RHR/Garmin. **Retirer** la surface orpheline `coachGetFullAnalysis`/tab-ai.
- **Gain** : fin des messages contradictoires (« décharge » + « vise un PR ») ; un seul verdict d'intensité, cohérent avec le profil d'agressivité.
- **Débloque** : crédibilité du Coach (le cœur produit).
- **Effort** : **gros** (6 émetteurs, 3 fichiers). **Risque** : moyen (change la surface principale → **vérif device + Gemini obligatoires**). **Dépendance** : idéalement après un test d'exclusivité de l'arbitre (chantier 12). **Recoupe** le chantier 4 sur `analyzeAthleteProfile`.

### Chantier 4 — `isWorkSet()` canonique (warm-up) *(P1, confirmé 23 %)*
- **Contenu** : un helper unique `isWorkSet(s) = !(s.isWarmup===true || s.setType==='warmup' || s.isBackOff)` appliqué à `computeWeeklyVolume` (1705), `analyzeAthleteProfile` push/pull (2882), `detectVolumeSpike` (4696), `detectQuadHamImbalance` (2044), `migrateDUPRegisters` (14629), et les ~40 filtres divergents.
- **Gain** : fin des 23 % de gonflement → alertes Push/Pull et Ischios/Quads justes.
- **Effort** : petit-moyen (mécanique mais nombreux sites). **Risque** : faible-moyen (change des sorties diagnostic → vérif). **Dépendance** : partage `analyzeAthleteProfile` avec le chantier 3 (peut être le même commit pour cette fn).

### Chantier 5 — Une seule table de ratios + 0-comme-null *(P1, le plus vu — 5 agents)*
- **Contenu** : faire lire `STRENGTH_RATIO_TARGETS` à `computeStrengthRatios` (Stats) ; retourner **null** (carte muette) pour un lift sans série loggée (fin des fausses alertes 🚨) ; borne haute de plausibilité ; corriger le cross-wiring de `wpApplyImbalanceCorrections`.
- **Gain** : Stats et Coach disent la même chose ; plus de « protège ton Squat lourd » à qui n'a jamais squatté ; plus de S/B 3.93 « optimal ».
- **Effort** : moyen. **Risque** : moyen (comportement diagnostic). **Dépendance** : le garde-fou outlier (chantier 7) renforce ce fix ; recoupe chantiers 3/4 sur le diagnostic.

### Chantier 6 — calcIPFGL + carte Corps *(P2, isolé, quick win)*
- **Contenu** : corriger la formule (`denom = a − b·e^(−c·bw)`, sans `Math.pow`, numérateur 100) ; recalibrer les seuils de niveau (300/400/500 → échelle réelle).
- **Gain** : le score « IPF GL » redevient normalisé au poids (sens réel).
- **Effort** : trivial-petit. **Risque** : faible. **Dépendance** : Gemini pour les nouveaux seuils de niveau. **Bon premier commit « facile ».**

### Chantier 7 — Garde-fous données sales *(P1/P2, confirmé écran)*
- **Contenu** : normaliser chaque log au `loadDB` (`log.exercises=[]`, garde `name`) ; flag d'outlier non-destructif sur `recalcBestPR`/ratios (>3.5× PdC = « vérifie l'unité ») ; fenêtre de récence dans `predictPR` ; checkin champs manquants → `null` (pas 0/NaN) ; garde-fou TDEE fallback (height/age=0).
- **Gain** : fin des crash sur log malformé, du poison 315 kg, du faux « objectif atteint » latent, du 4524 kcal.
- **Effort** : moyen. **Risque** : faible-moyen. **Dépendance** : le flag outlier sert le chantier 5.

### Chantier 8 — Intégrité sync/persistance *(P1, NON confirmé écran, RISQUÉ)*
- **Contenu** : corriger login `db=prof.data` (ne jamais persister un db sans `logs`) ; merge **monotone** (XP=max, badges=union, checkins/activityLogs/body=union par date) ; corriger le chemin `xpHighWaterMark` du hash ; bestPR monotone tant que logs non hydratés.
- **Gain** : plus de perte d'historique au login, plus de régression XP/badges cross-device.
- **Effort** : moyen-gros. **Risque** : **ÉLEVÉ** (la sync est fragile, un mauvais fix perd des données réelles). **Dépendance** : questions Supabase d'abord (blobs avec `logs` ? régressions XP observables ?) + **vérif multi-appareils obligatoire**. Agent 10 n'a pas pu l'observer (offline) → à prouver avant de toucher.

### Chantier 9 — Garde renderFriendsTab *(P2, trivial)*
- **Contenu** : `if (badgeEl) { … }` (supabase.js:3224) + ajouter/retirer l'id.
- **Gain** : fin du crash Social>Amis pour les users **connectés**.
- **Effort** : trivial. **Risque** : nul. **Dépendance** : aucune. **Quick win à glisser dans un autre chantier.**

### Chantier 10 — Chantier couleur *(P3, backlog #1 d'Aurélien)*
- **Contenu** : sortir le rouge des scores/jauges <40, ratios structure, perte musculaire, volume >MRV ; adopter les tokens `--color-*` ; phases de bloc.
- **Effort** : moyen. **Risque** : faible (cosmétique). **Dépendance** : palette Gemini + maquette validée. Haut sur la liste d'Aurélien mais **pas** un bug de vérité.

### Chantier 11 — Dette / cleanup *(P4)*
- **Contenu** : purger le code mort (program.js générateurs, calibrateTDEE, detectMomentum, checkRecompoProgress, computeWilks, orphelins), fichiers orphelins, html2canvas CDN, syncSupabase fantôme, specs Playwright périmées. **Grep de 10 s avant chaque suppression** (dispatch dynamique, window[x], onclick).
- **Effort** : moyen. **Risque** : faible. **Priorité** : basse (invisible utilisateur).

### Chantier 12 — Filet de tests *(transversal, protège tout le reste)*
- **Contenu** : brancher `tests/fixtures/profiles/` (agent 09) dans le gate jest ; ajouter les **5 tests manquants** (a-e, agent 08) ; test « render pur » (db inchangé après 2 renders) ; test « exclusivité arbitre » (≤1 verdict d'intensité) ; `useFakeTimers`. **À tisser dans chaque chantier** (test dans le même commit, CLAUDE.md §4), pas en bloc séparé.
- **Gain** : les corrections ci-dessus ne régressent plus ; on cesse de vérifier des littéraux.
- **Préalable non négociable** : `npm ci && npm test` doit d'abord **tourner** (jamais vérifié pendant l'audit).

### Honnêteté sur le volume
- **Petits (jours)** : 1, 6, 9.
- **Moyens (1-2 semaines chacun, avec vérif device)** : 2, 4, 7, 10, 11.
- **Gros et risqués (2-4 semaines, Gemini + device + Supabase)** : 3, 5, 8.
- **Transversal** : 12 (dans chaque commit).

**Total réaliste pour un solo dev, avec la discipline « un chantier à la fois + vérif device avant merge » : 3 à 6 mois de soirées/week-ends.** Ce n'est pas un plan de nettoyage rassurant — c'est un vrai backlog. La bonne nouvelle : les **4 premiers chantiers** (RGPD/render, caloriques, arbitre, warm-up) couvrent **tout ce qui ment à l'écran et tout ce qui touche un vrai utilisateur** ; le reste est important mais moins saignant.

---

## ANGLES MORTS

Croisement des sections « Angles morts » des 11 rapports — **là où sont les prochains bugs** :

1. **`npm test` jamais exécuté** (node_modules absent : 00, 01, 06, 08). Le « ~602 verts » est **analysé, pas prouvé**. De plus ~10 % des assertions sont du grep-source et les fixtures réalistes (09) ne sont branchées à aucun test → même vert, ça ne protège pas grand-chose. **À faire tourner d'abord.**
2. **Perf sur vrai device Android non mesurée** (07, 10). Agent 10 : aucun freeze ≤ 82 ms, **mais** matériel serveur ≫ Android + **Chart.js async non capté** → le freeze n'est ni prouvé ni exclu. Le plus gros risque perf non mesuré = le dessin des graphes.
3. **Toute la surface authentifiée/cloud/social n'est observable qu'offline** (10). Les crashes latents (renderFriendsTab A3) ne se déclenchent que **connecté** — prouvés par stub d'uid, pas par un vrai login. **C'est le plus gros angle mort runtime** : Social, leaderboard, challenges, sync réelle, le flux de login email (P1-h) — personne ne les a vus tourner authentifié.
4. **Edge Functions non auditées** (`coach-ai`, `anthropic-proxy`, RPC `delete_user_complete_data`) : 00, 05, 08. Le RPC de suppression est **le pendant serveur du P0 RGPD** — sa couverture n'est pas vérifiée.
5. **CSS jamais inventorié** (312 KB inline dans index.html) : 00, 04, 06. Sélecteurs morts, rouges décoratifs restants, débordements horizontaux mobile non catalogués.
6. **IndexedDB / triple store** (localStorage↔IDB↔cloud) survolé (05) — cohérence non auditée.
7. **Modes non-powerbuilding** (bien_être, calisthenics, powerlifting) à peine effleurés (03, 04) — tout l'audit vise le profil aurel.
8. **Navigation profonde** (accordéons Réglages, band picker, débrief post-séance, modales) survolée, pas cliquée (10).
9. **Détection d'orphelins par grep textuel** (non-AST) : un dispatch dynamique `window[x]()` échapperait (00, 06). Les « orphelins » valent « 0 référence textuelle », pas « prouvé mort ».
10. **`blockStartDate` muté au render** non déclenché sur aurel (bloc déjà cohérent) — à re-tester sur un profil **sans** `currentBlock.blockStartDate` (10, hypothèse restante).
11. **Fixtures synthétiques non calibrées au réel** (09) : bestPR aurel 145/140/170 (CLAUDE.md) vs 148/140/186 (un test) — divergence non tranchée.

### Findings encore « hypothèse » (à prouver)
- P1-h/P1-i (perte de données login + merge cross-device) : **mécanisme certain, déclenchement non observé** (offline). Priorité de preuve avant le chantier 8.
- P1-g (faux « objectif atteint ») : mécanisme confirmé, **affichage jamais reproduit** — dépend d'une cible < e1RM périmé.
- P2-c ACWR blend activité (coach.js:709) : magnitude dépend du profil (dominerait pour un profil bien_être, jamais testé).

---

## QUESTIONS SUPABASE (dédupliquées + requêtes)

> Fusion des sections « À VÉRIFIER CÔTÉ SUPABASE » des 11 rapports. Aurélien les passe via Claude.ai en un aller-retour. `aurel = 6e2936e7-de11-4f19-89b1-d1eb5968ba35`.

**Q1 — Inventaire tables + RPC suppression** *(00, 05)* : lister les tables réelles + vérifier que `delete_user_complete_data()` couvre **toutes** les tables du user (pendant du P0 RGPD côté serveur), et confirmer `ai_rate_limits` (référencée data, absente du repo JS).
`select tablename from pg_tables where schemaname='public';`

**Q2 — calcCalorieCible multi-user** *(01, 06, 10)* : `kcalBase`/`bwBase` sont-ils renseignés pour les users ≠ aurel ? Sinon l'anneau Corps prescrit une homothétie du profil d'Aurélien (Léa → 1408).
`select id, data->'user'->>'kcalBase' kb, data->'user'->>'bwBase' bb, data->'user'->>'bw' bw from sbd_profiles;`

**Q3 — Cible « vraie » pour aurel** *(06, 10)* : 2300 (calcCalorieCible) ou 2672 (calcTDEE/Coach) ? **Décision coaching Gemini/Aurélien** — prérequis du chantier 2.

**Q4 — fatPct & activités** *(01, 08)* : `fatPct` renseigné (→ Katch-McArdle, +~300 kcal vs Mifflin) ? `activityLogs`/`secondaryActivities` peuplés (→ terme cardioKcal buggé, TDEE) ?
`select id, data->'user'->>'fatPct' fp, jsonb_array_length(data->'activityLogs') na from sbd_profiles;`

**Q5 — Warm-ups en base** *(05, 06, 10)* : les sets `workout_sessions.data.exercises[*].allSets[*]` portent-ils `setType:'warmup'` **sans** `isWarmup` (chemin GO) ? Quantifier la proportion chez aurel (calibre les 23 %).
`select count(*) from workout_sessions, jsonb_path_query(data,'$.exercises[*].allSets[*]') s where user_id='6e2936e7-…' and s->>'setType'='warmup' and not (s ? 'isWarmup');`

**Q6 — e1RM vs bestPR par lift** *(03, 04, 08, 09)* : écart réel `data.exercises['Soulevé de Terre (Barre)'].e1rm` (~188 ?) vs `bestPR.deadlift` (170 ?) vs maxRM log récent (169 ?) — chiffre la fuite e1RM et calibre les tests. Confirmer bestPR réel (145/140/170 vs 148/140/186).
`select data->'bestPR' bp, data->'exercises'->'Soulevé de Terre (Barre)'->>'e1rm' e1 from sbd_profiles where user_id='6e2936e7-…';`

**Q7 — Ratios & alertes réelles aurel** *(03)* : recomputer les 5 ratios depuis `data.exercises`+`bestPR` → confirme « Bench/Squat ⚠️ Trop haut » (Stats) ; les sets portent-ils des flags `grind` (≥3/séance) + ACWR >1.3 (fréquence carte SNC) ; ratio Ischios/Quads <0.75 (fréquence « risque LCA »).

**Q8 — Résurrection RGPD & sync au render** *(05, 10)* : **vérif device** — record d'XP → « Supprimer mon compte » → reload → le profil revient-il ? Et un render de l'onglet Jeux **post-suppression** relance-t-il une écriture `sbd_profiles` (ré-upload) ?

**Q9 — error_logs socialFriendsBadge** *(10)* : des crashes réels de users connectés existent-ils ?
`select created_at, message from error_logs where message ilike '%socialFriendsBadge%' or message ilike '%renderFriendsTab%' order by created_at desc limit 20;`

**Q10 — Régression XP/badges cross-device** *(05, 08)* : un blob récent avec un `xpHighWaterMark` **inférieur** à une trace antérieure prouverait le bug de merge (P1-i).
`select user_id, updated_at, data->'gamification'->>'xpHighWaterMark' xp, (select count(*) from jsonb_object_keys(data->'earnedBadges')) badges from sbd_profiles order by updated_at desc;`

**Q11 — bestPR sans logs** *(05)* : users avec `bestPR>0` mais 0 ligne `workout_sessions` (blob hydraté sans logs) ?
`select p.user_id, p.data->'bestPR' bp, count(w.session_id) n from sbd_profiles p left join workout_sessions w on w.user_id=p.user_id group by 1,2 having count(w.session_id)=0 and (p.data->'bestPR') is not null;`

**Q12 — Blobs avec clé `logs`** *(05)* : des blobs `sbd_profiles.data` contiennent-ils encore une clé `logs` non vide (vieux push pré-P3c → symptôme du bug login) ?
`select user_id, jsonb_typeof(data->'logs'), jsonb_array_length(data->'logs') from sbd_profiles where data ? 'logs';`

**Q13 — Volumétrie & données sales** *(07, 08, 09, 10)* : plus gros `sbd_profiles.data` (proche du plafond 5 MB ?) ; users avec `height=0`/`age=0` (TDEE 4524) ou poids >3.5× PdC (outlier 315 kg) ; timestamps futurs / doublons `shortDate`.
`select user_id, pg_column_size(data) bytes, jsonb_array_length(coalesce(data->'logs','[]'::jsonb)) n from sbd_profiles order by bytes desc limit 10;`

**Q14 — Check-ins partiels** *(05, 07, 09)* : les `data.readinessHistory` ont-elles des champs manquants / `pain:null`, ou toujours 4 champs complets ? (calibre P2-g).
`select jsonb_path_query(data,'$.readinessHistory[*]') from sbd_profiles where user_id='6e2936e7-…' limit 5;`

**Q15 — Orphelin tab-ai & rapports dupliqués** *(02, 10)* : combien d'users ont `lastTab.main='tab-ai'` (portée du coach orphelin) ; des `data.reports` weekly dupliqués (même weekKey, du generateWeeklyReport au render) ?
`select count(*) from sbd_profiles where data->'gamification'->'lastTab'->>'main'='tab-ai';`

---

## CONTRADICTIONS ENTRE RAPPORTS

> Règle appliquée : **l'agent 10 a OBSERVÉ, les autres ont DÉDUIT — quand ils divergent, le 10 fait foi.**

| Sujet | Position statique | Position agent 10 (observée) | Tranché |
|---|---|---|---|
| **Fuite e1RM renderPerfCard** | 04 : **P0** (gros chiffre e1RM non labellisé) | **A1 : carte `display:none` depuis v264, jamais rendue → P4 dette morte** | **10 gagne** → downgrade P0→P4. La fuite existe mais invisible. Reste à trancher §7 vs Philo B pour les autres surfaces. |
| **calcIPFGL** | 01 : « **tout le monde Débutant** » (P1) | **A2 : varie par total brut (Débutant/Avancé/Élite) ; vrai bug = bw ignoré** (P2) | **10 gagne** → recadrer le libellé du finding : « bw ignoré », pas « tous Débutant ». |
| **Crash socialFriendsBadge** | 00 : onglet **Profil (amis)** | **A3 : Social>Amis (renderFriendsTab), pas Profil ; guardé offline → frappe les users CONNECTÉS** | **10 gagne** → localisation + population corrigées. |
| **predictPR faux « objectif atteint »** | 07 : **P0/P1** (motif §7) | **A8 : mécanisme confirmé (récence ignorée) MAIS aucun « objectif atteint » affiché** (pas de cible < e1RM stale) | **10 nuance** → latent, à corriger (récence) mais pas P0 observé. |
| **Freeze au render (gros historique)** | 07/08 : **P1** (bug e, non couvert) | **A7 : aucun freeze ≤ 82 ms — MAIS caveat serveur ≫ Android + Chart.js async non mesuré** | **Non tranché** : le 10 infirme *sur ce matériel* mais ne peut pas exclure sur device. À profiler sur Android. |

### Divergences NON tranchées par l'observation (à arbitrer par Aurélien/Gemini)
- **§7 strict vs « Philosophie B »** (e1RM jamais affiché vs autorisé si labellisé) : 04 le pose explicitement comme **décision produit**, pas comme bug. CLAUDE.md §7 dit « jamais », le code applique « si labellisé ». **À trancher avant tout chantier e1RM.** Je ne tranche pas : c'est une décision produit, pas une erreur de code.
- **Cible calorique « vraie » d'aurel** : 2300 (calcCalorieCible) ou 2672 (calcTDEE) ? 01 dit calcTDEE=2672 matche la réf ; 06 constate la divergence sans trancher. → **Q3 Supabase + Gemini.**
- **bestPR de référence** : 145/140/170 (CLAUDE.md §15) vs 148/140/186 (test pr-real-records) : 09 le signale. → **Q6 Supabase.**

### Désaccords où JE prends position (mon rôle de synthétiseur)
- **e1RM famille (1)** : l'agent 04 la met en tête (P0). **Je la classe plus bas** : son P0 est mort (A1), le reste est P1 secondaire + une décision produit. Ce n'est **pas** le chantier prioritaire, contrairement à ce que sa position P0 suggère.
- **`exo.sets` number/array** (famille 5) : 05/07/09 le notent comme landmine. **Je refuse de le compter comme bug** : il est gardé (`Array.isArray`) partout → dette, pas bug live. Ne pas gonfler la famille (5) avec.
- **calcStreak au render** (07 le classe P1 robustesse) : **je le remonte en P0** avec le render pur — l'agent 10 a **observé le toast « freeze utilisé » à l'écran** (B4), c'est une écriture + sync + effet visible au render, pas juste une non-idempotence théorique.

---

STOP. Triage consolidé terminé. Rapport : `audit/11-triage-consolide.md`. Aucune modification applicative, aucun commit, aucun Supabase, aucun sous-agent.
