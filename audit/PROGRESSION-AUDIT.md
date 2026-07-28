# Progression — audit de câblage, vagues 2 à 5

Branche : `claude/audit-cablage-vagues-2-5`. Commit + push après **chaque** vague.

| Vague | Surface | État | N inventoriés | N verdicts | N runtime |
|---|---|---|---|---|---|
| 1 | Profil | ✅ livrée (branche `claude/audit-cablage-vague1`) | 176 | 176 | 176 |
| **2** | **Séances** | ✅ **livrée** | **54** | **54** | **54** |
| **3** | **Maison + Coach** | ✅ **livrée** | **62** | **62** | **62** |
| 4 | Stats | ⏳ à faire | — | — | — |
| 5 | Social + Jeux | ⏳ à faire | — | — | — |

## Vague 2 — findings majeurs

- **G1 🔴** « Appliquer ce jour au programme » (app.js:27347) et « Appliquer toutes les suggestions »
  (27369) écrivent des **objets** dans `db.routineExos` là où les autres écrivains mettent des chaînes
  → `matchExoName` lève `s.toLowerCase is not a function` → **démarrage de séance à 0 exercice**, et
  **`renderCorpsTab` (onglet Corps, vague 1) casse aussi**. Reproduit de bout en bout.
- **G2 ⚠️** La séance est construite depuis `db.routineExos`, pas depuis `db.weeklyPlan` : le plan ne
  fournit que les séries, retrouvées **par nom**. 5 scénarios exécutés — un plan complet peut produire
  une séance **vide** (routineExos vide) ou **une série vide** (nom de variante non rapproché).
- **G3 ⚠️** `s-go` : 5 sous-vues pour 4 pilules, atteignable seulement par 9 appels programmés ;
  `db.user.navMode` (prévu pour ça) est une donnée morte.
- **G4** `activeWorkout` est hors `db` et hors blob de sync : une séance interrompue ne quitte pas
  l'appareil.
- **G5 ✅** Le pont plan→séance de la PR #246 fonctionne (5 annotations transférées, vérifié).

## Vague 3 — findings majeurs

- **H1 🔴** L'accueil affiche « Test : 1 sept. » = **aujourd'hui + 35 jours**, repli de
  `db.user.plannedTestDate` qui n'est **jamais écrit**. Une date glissante présentée comme une échéance.
- **H2 🔴** `dashWeekCard` / `quickLogCard` / `perfCard` masqués en dur (app.js:9397, « v264 »).
  `renderPerfCard` continue pourtant de les alimenter (4 appelants), et les Réglages promettent encore
  « les exercices affichés dans la rubrique Performance sur l'accueil » (index.html:2965).
- **H3 🔴** e1RM affiché en clair sur l'accueil (« e1RM estimé : 158 kg » à côté de « SQUAT 145kg ») —
  3ᵉ point d'affichage d'e1RM relevé par l'audit (§7).
- **H4 ✅ RÉFUTÉ** — l'hypothèse « des cartes du Coach ne s'affichent jamais » **ne se vérifie pas** :
  sur 26 états, les 24 cartes apparaissent toutes au moins une fois. « 📐 Analyse morphologique »,
  que CLAUDE.md dit « jamais branchée », **se rend** derrière « Voir plus ».
- **H6 🔴** 14 conteneurs hérités dans un bloc `display:none` (index.html:2469) ; **6 sont encore
  alimentés** par du JS → du rendu calculé et jeté.

## 10ᵉ extension de méthode (vague 3)

**Les cartes n'ont pas d'`id`.** Le Coach rend 10 cartes pour seulement 4 `id`. Un inventaire par `id`
les manquerait toutes. L'inventaire recense donc **deux familles** : éléments identifiés **et** cartes
identifiées par leur **titre visible**. À reconduire sur toute surface à cartes.

## 9ᵉ piège découvert en vague 2 — à appliquer aux vagues suivantes

**Divergence de TYPE sur un même store.** Plusieurs écrivains alimentent la même clé avec des
structures différentes (ici `routineExos` : chaînes vs objets). Aucun n'est « faux » isolément ; c'est
leur cohabitation qui casse le lecteur. **À chercher systématiquement** : pour chaque store à écrivains
multiples, comparer le **type** de ce qu'ils écrivent, pas seulement le chemin.

*(Rappel des 8 premiers : inline · fallback masquant · condition jamais satisfaisable · double chemin ·
priorité silencieuse `A || B` · addEventListener · markup runtime · définition dupliquée.)*

## Changement de méthode acté en vague 2

L'inventaire par `grep 'id="'` sur `index.html` est **structurellement insuffisant** hors Profil :
sur Séances, 36 des 54 éléments (67 %) sont générés au runtime. L'inventaire passe donc par
`audit/runtime/inventaire-dom.js`, qui énumère le DOM réel dans N états et fait l'union.
Règle de comptage : ids générés en boucle regroupés en familles `×n` ; ids aléatoires (SVG) regroupés.

## Reste à faire

Vagues 4 et 5, puis `audit/SYNTHESE-CABLAGE.md`.
