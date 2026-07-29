# Progression — audit de câblage v3 (inventaire par UNION)

Branche `claude/audit-cablage-v3`. Les rapports v2 sont **conservés** ; les v3 sont suffixés `-v3`.

## Le correctif de méthode

La v2 des vagues 2-5 inventoriait **par le DOM seul** → un élément jamais rendu n'entrait jamais dans
l'inventaire. C'est l'angle mort exact du verdict 🔴 RENDU INATTEIGNABLE : **Weight Cut n'aurait pas
été trouvé.** L'inventaire est désormais **A ∪ B** (statique ∪ dynamique), avec la provenance notée.

| Vague | État | Estimation | v2 | **v3** | A∩B | **A seul** | B seul |
|---|---|---|---|---|---|---|---|
| 2 · Séances | ✅ livrée | 113 | 54 | **91** | 50 | **41** | 0 |
| 3 · Maison + Coach | ⏳ | 90 | 62 | — | — | — | — |
| 4 · Stats | ⏳ | 85 | 28 | — | — | — | — |
| 5 · Social + Jeux | ⏳ | 130 | 89 | — | — | — | — |

## Outils construits pour la v3

| Fichier | Rôle |
|---|---|
| `audit/runtime/source-a.js` | inventaire **statique** : markup + handlers + ids produits par le code des fonctions de rendu, avec fermeture d'appels et **barrière inter-surfaces** |
| `audit/runtime/union.js` | union A ∪ B, appariement des ids dynamiques, provenance |
| `audit/runtime/triage-aseul.js` | pour chaque « A seul » : fonction productrice → appelants → point d'entrée UI |

## Vague 2 — ce que l'union a trouvé en plus

**+37 éléments (54 → 91).** Les 41 « A seul » se répartissent en :
- **23** overlays/panneaux à ouverture explicite (recherche d'exercice, calculateur de galettes,
  bibliothèque, assistant, ajustement de séance, import Garmin, glossaire, édition d'objectif, photo)
  → ✅ conditionnels, **absents de l'inventaire v2**. Limite de couverture d'états, pas défaut d'app.
- **2 🔴 CONFIRMÉS** : `prog-chev<n>` / `prog-body<n>` — `renderProgramViewer` (5 appelants réels)
  rend dans `programViewer`, conteneur du bloc `display:none` d'`index.html:2469`, et cherche un
  `programViewerCard` **qui n'existe nulle part**. *Cross-confirmation avec la vague 3 (H6).*
- **16** conditions non provoquées par mes états (capteur FC, check-in déjà fait, PR battu, sauvegardes
  existantes…), dont **3 ❓ non tranchés** : `phasePill`, `phaseDropdown`, `frt<n>`.

## Corrections apportées à la source A (« B seul » : 13 → 0)

1. Appariement des ids dynamiques par préfixe (`'wrap-' + id` ↔ `wrap-sc2-3-<ts>`).
2. Fermeture d'appels trop courte → racines `renderGoExoCard`, `renderWhyButton`, `_goRpeSliderHTML`
   ajoutées.
3. Familles de suffixe variable (`why-btn-<exo>` = 1 élément, pas 3).

## 10ᵉ piège identifié en v3

**La fermeture d'appels traverse les frontières de surface.** À profondeur 3 sans barrière, l'inventaire
de Séances ramenait les sections des Réglages, les badges des Jeux et les graphes du Corps : +20
éléments hors périmètre, et un contrôle d'exhaustivité **trompeusement « cohérent »**. D'où
`ARRET_PAR_DEFAUT` dans `source-a.js`. À reconduire sur toute analyse par fermeture d'appels.

## Reste à faire

Vagues 3, 4, 5 puis `audit/SYNTHESE-CABLAGE-V3.md`.
