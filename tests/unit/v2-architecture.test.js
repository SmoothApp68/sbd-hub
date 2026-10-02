/** @jest-environment node */
//
// LA GARDE D'ARCHITECTURE — « un seul coach, un seul câblage » (29/09/2026).
//
// C1 à C6 ont fait de `planDeSeance` le seul coach : la garde de C6 vérifie
// chaque plan (`verifierPlan`, I1 à I15), et le banc vérifie les invariants
// après chaque geste. Ils protègent le RÉSULTAT. Ce test protège le CÂBLAGE :
// un calcul du coach appelé directement depuis l'écran, en contournant le
// plan, ne se verrait dans les invariants que s'il produisait une
// contradiction visible. Ici, il se voit à la lecture du source.
//
// LA RÈGLE. Chaque fonction de calcul du coach (liste `GARDEES`) ne s'appelle
// que depuis le module qui la définit, `plan.js`, ou un fichier inscrit pour
// elle dans `AUTORISATIONS`, AVEC SA RAISON. Élargir la liste est un geste
// conscient, visible dans une PR — jamais un blocage : c'est ce qui laisse
// passer les chantiers suivants (programmes, poids du corps, chauffes…) sans
// laisser passer un second coach.
//
// LE PÉRIMÈTRE : ce que l'app sert — `v2/js/*.js` et `v2/index.html`. Les
// tests et les bancs sont hors du périmètre (ils appellent le moteur exprès).
//
// LA LECTURE : le source, commentaires et chaînes retirés. Un appel se
// reconnaît à l'accès par propriété (`Moteur.x`, `M.x`, `racine.THMoteur.x`,
// `Moteur().x` — l'alias ne compte pas), ou à l'accès entre crochets
// (`Moteur['x']`). Limite assumée : un alias de la FONCTION elle-même
// (`var f = …`) se voit à sa création, pas à ses appels.

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '../..');
const V2 = path.join(RACINE, 'v2');

// ── LES FONCTIONS DE CALCUL DU COACH ────────────────────────────────────────
//
// `module` : le fichier qui la définit et l'exporte (il a toujours le droit de
// l'appeler). `motif` : seulement quand le nom est AUSSI un champ ou un rappel
// ordinaire ailleurs — `fantome` est un champ des lignes du plan et un rappel
// de la vue (`vue.fantome(i, j)` dans `rendu.js`) : on ne garde que l'appel
// qualifié par le module.
const GARDEES = [
  // moteur.js — la consigne
  { fn: 'consignePour', module: 'moteur.js' },
  { fn: 'consigneDExercice', module: 'moteur.js' },
  { fn: 'contratDe', module: 'moteur.js' },
  { fn: 'sansPalierRetenues', module: 'moteur.js' },
  { fn: 'consigneFigee', module: 'moteur.js' },
  { fn: 'habitudeDe', module: 'moteur.js' },
  { fn: 'zoneRetenue', module: 'moteur.js' },
  { fn: 'zoneEnVigueur', module: 'moteur.js' },
  { fn: 'niveauValide', module: 'moteur.js' },
  { fn: 'chargeVoisine', module: 'moteur.js' },
  { fn: 'pasDeSalle', module: 'moteur.js' },
  { fn: 'repriseDe', module: 'moteur.js' },
  { fn: 'ecartHabituel', module: 'moteur.js' },
  // moteur.js — la réaction, la seconde charge, la couverture, les paris
  { fn: 'reactionPour', module: 'moteur.js' },
  { fn: 'contexteReaction', module: 'moteur.js' },
  { fn: 'secondeCharge', module: 'moteur.js' },
  { fn: 'sautsDeMontee', module: 'moteur.js' },
  { fn: 'planDeCouverture', module: 'moteur.js' },
  { fn: 'lignesDePari', module: 'moteur.js' },
  { fn: 'revisionsDuPlan', module: 'moteur.js' },
  { fn: 'observationDe', module: 'moteur.js' },
  { fn: 'idDePrediction', module: 'moteur.js' },
  // moteur.js — ce que le coach dit (phrases, en-tête, pourquoi, constat)
  { fn: 'phraseReaction', module: 'moteur.js' },
  { fn: 'enteteDeDisposition', module: 'moteur.js' },
  { fn: 'libellesConsigne', module: 'moteur.js' },
  { fn: 'pourquoiConsigne', module: 'moteur.js' },
  { fn: 'etiquetteZone', module: 'moteur.js' },
  { fn: 'constatDe', module: 'moteur.js' },
  { fn: 'constatDuJour', module: 'moteur.js' },
  { fn: 'suiteDExercice', module: 'moteur.js' },
  // moteur.js — les chauffes et les dégressives (§9.15, 49-U10)
  { fn: 'situationChauffe', module: 'moteur.js' },
  { fn: 'chauffesDe', module: 'moteur.js' },
  { fn: 'degressiveDe', module: 'moteur.js' },
  // moteur.js — la chute de fin de séance (§9.2 bis, 49-U12)
  { fn: 'chuteDe', module: 'moteur.js' },
  // moteur.js — le compteur de stagnation (§12.9, 49-U13)
  { fn: 'compteurDe', module: 'moteur.js' },
  { fn: 'phraseCompteur', module: 'moteur.js' },
  // moteur.js — l'escalier, la semaine allégée (§14.4, 49-U14)
  { fn: 'blocageGeneralise', module: 'moteur.js' },
  { fn: 'phraseCarte', module: 'moteur.js' },
  { fn: 'consigneAllegee', module: 'moteur.js' },
  { fn: 'phraseAllegee', module: 'moteur.js' },
  { fn: 'detailAllegee', module: 'moteur.js' },
  { fn: 'bandeauAllegee', module: 'moteur.js' },
  { fn: 'periodeAllegee', module: 'moteur.js' },
  { fn: 'carteAutorisee', module: 'moteur.js' },
  { fn: 'observationSemaineAllegee', module: 'moteur.js' },
  { fn: 'idDEscalier', module: 'moteur.js' },
  // moteur.js — l'escalier, le blocage isolé (§14.5, 49-U15)
  { fn: 'nIsole', module: 'moteur.js' },
  { fn: 'declenchementsRepondus', module: 'moteur.js' },
  { fn: 'marcheIsolee', module: 'moteur.js' },
  { fn: 'autresAvancent', module: 'moteur.js' },
  { fn: 'carteSchema', module: 'moteur.js' },
  { fn: 'phraseSeche', module: 'moteur.js' },
  { fn: 'repliEscalier', module: 'moteur.js' },
  { fn: 'consigneRepli', module: 'moteur.js' },
  { fn: 'phraseRepli', module: 'moteur.js' },
  { fn: 'observationMarche', module: 'moteur.js' },
  // moteur.js — la règle de volume, la place pour une série de plus (§14.6, 49-U16)
  { fn: 'placeDeVolume', module: 'moteur.js' },
  { fn: 'placePourExercice', module: 'moteur.js' },
  // moteur.js — l'escalier, la série de plus (§14.7, 49-U17)
  { fn: 'marcheProposee', module: 'moteur.js' },
  { fn: 'serieDePlusProposee', module: 'moteur.js' },
  { fn: 'serieDePlusActive', module: 'moteur.js' },
  { fn: 'periodesSerieDePlus', module: 'moteur.js' },
  { fn: 'carteSerieDePlus', module: 'moteur.js' },
  { fn: 'consigneSerieDePlus', module: 'moteur.js' },
  // seance.js — le fantôme, la couverture, les lignes figées, les paris
  { fn: 'fantome', module: 'seance.js',
    motif: /(?:\bSeance|\bS|\bSeance\(\)|\bS\(\)|racine\.THSeance)\s*\.\s*fantome\b/g },
  { fn: 'planDe', module: 'seance.js' },
  { fn: 'couvertureDe', module: 'seance.js' },
  { fn: 'couvertureSeance', module: 'seance.js' },
  { fn: 'figeesDe', module: 'seance.js' },
  { fn: 'observationTenue', module: 'seance.js' },
  { fn: 'peutObserver', module: 'seance.js' },
  { fn: 'parisAObserver', module: 'seance.js' },
  { fn: 'observationsARenvoyer', module: 'seance.js' }
];

// ── LA LISTE D'AUTORISATIONS ────────────────────────────────────────────────
//
// `plan.js` : le coach. Il a le droit d'appeler toutes les fonctions gardées —
// c'est sa raison d'être (`planDeSeance`, MOTEUR §9.13 bis).
const LE_COACH = 'plan.js';
//
// Les AUTRES fichiers, fonction par fonction, chacun avec sa raison. Une
// entrée qui n'a plus d'appel fait échouer le test : la liste dit exactement
// ce qui est, jamais ce qui a été.
//
// ⚠️ Toutes les entrées ci-dessous existaient à la pose de la garde
// (29/09/2026) et sont RAPPORTÉES dans sa PR pour décision : elles ne sont pas
// forcées dans le plan par ce commit.
const AUTORISATIONS = {
  consigneDExercice: {
    'app.js': 'calcule les ENTRÉES du plan (`entrees.consignes`) : le plan n’a pas l’historique ' +
      '(app.js, `consigneDe`) ; et l’étiquette de zone de la page d’exercice, hors séance, où ' +
      'il n’y a pas de plan (app.js, `rendreExercice`).'
  },
  periodesSerieDePlus: {
    'app.js': 'calcule l’ENTRÉE `periodesSerieDePlus` de `consigneDExercice` (les séances où une ' +
      'série de plus était active, dont le niveau se lit sur la routine) — préparer les entrées ' +
      'du plan (app.js, `periodesSerieDePlusDe`, 49-U17).'
  },
  placeDeVolume: {
    'app.js': 'calcule l’ENTRÉE `entrees.volume` du plan, une fois par séance, sur tout ' +
      'l’historique (le plan ne l’a pas) — préparer les entrées du plan (app.js, ' +
      '`volumeDeLaSeance`, 49-U16).'
  },
  suiteDExercice: {
    'app.js': 'calcule l’ENTRÉE `entrees.suites` du plan (la consigne de la prochaine séance, ' +
      'sur l’historique augmenté du jour) : le plan n’a pas l’historique (app.js, `suiteDe`).'
  },
  zoneEnVigueur: {
    'app.js': 'lit la zone CHOISIE dans les lignes `zones` (§9.1.1) pour la passer en ' +
      '`correction` au moteur : une entrée, pas une décision (app.js, `zoneDe`).'
  },
  idDePrediction: {
    'app.js': 'l’identifiant déterministe d’un pari au moment de l’écrire en base : de la ' +
      'persistance, le pari lui-même vient du plan (app.js, `finirPari`).'
  },
  observationSemaineAllegee: {
    'app.js': 'l’observation SANS SÉRIE du pari de la semaine allégée, au moment de l’écrire ' +
      'en base : de la persistance (app.js, `observerEscalier`) ; la règle vit dans le moteur.'
  },
  idDEscalier: {
    'app.js': 'l’identifiant déterministe du pari de l’escalier au moment de l’écrire en base : ' +
      'de la persistance, la carte (ou la marche isolée, 49-U15) vient du plan (app.js, ' +
      '`repondreCarte`, `repondreSchema`, `ecrireReplis`).'
  },
  observationMarche: {
    'app.js': 'l’observation SANS SÉRIE du pari d’une marche isolée (schéma accepté, repli), au ' +
      'moment de l’écrire en base : de la persistance (app.js, `observerEscalier`) ; la règle ' +
      'vit dans le moteur (49-U15).'
  },
  observationDe: {
    'app.js': 'l’observation d’un pari par sa série, au moment de l’écrire en base : de la ' +
      'persistance d’une ligne du plan (app.js, `observerPari`).'
  },
  peutObserver: {
    'app.js': 'la garde d’écriture d’une observation (une ligne observée par une AUTRE série ' +
      'n’est jamais réécrite) : de la persistance (app.js, `observerPari`).'
  },
  parisAObserver: {
    'app.js': 'les paris de la séance à observer, pour la file d’écriture : de la persistance ' +
      '(app.js).'
  },
  observationsARenvoyer: {
    'app.js': 'les observations à renvoyer à la reprise d’une séance : de la persistance (app.js).'
  }
};

// ── LE REGISTRE DES NOTIONS (relevé du 01/10/2026, « un seul coach, un seul câblage ») ──
//
// La garde ci-dessus dit QUI APPELLE une fonction ; le registre dit, NOTION
// PAR NOTION, sa source unique et qui la lit. Une notion du registre :
//   · `module`, `fonction` : sa source — la seule fonction qui la décide ;
//   · `lecteurs` : les fichiers autres que son module qui peuvent l'appeler ;
//   · `par` (facultatif) : les fonctions de son module qui DOIVENT passer par
//     elle (sinon elles la redécident à la main) ;
//   · `parAilleurs` (facultatif) : `{ fichier: [fonctions] }`, les fonctions
//     d'AUTRES fichiers qui doivent passer par elle ;
//   · `interdit` (facultatif) : un littéral qui ne doit plus exister dans son
//     module — la trace d'une décision écrite d'office.
// Chaque PR de la consolidation y a ajouté ses notions ; la PR 7, la
// dernière, le rend complet (les sept PR y figurent, un test le vérifie) et
// bloquant (chaque test ci-dessous exige zéro faute).
const NOTIONS = [
  { notion: 'la feuille « Pourquoi » (ses paragraphes)', pr: 'PR 1',
    module: 'moteur.js', fonction: 'pourquoiConsigne', lecteurs: ['plan.js'],
    raison: 'le plan la rédige sur la consigne qu’il applique (figée, allégée, repli, série de ' +
      'plus) et la pose dans `x.pourquoi` ; l’app la lisait sur une autre, et plantait.' },
  { notion: 'le mot d’ordre de la série restée (« première », « dernière »)', pr: 'PR 1',
    module: 'moteur.js', fonction: 'rangDuReste', lecteurs: [],
    par: ['phraseGrise', 'etatBrutDuPourquoi'],
    interdit: { motif: /(['"])[Tt]a (?:dernière|première) série\1/,
                raison: 'le mot d’ordre écrit d’office (« ta dernière série », le 01/10)' },
    raison: 'l’en-tête et la feuille le lisent sur le rang, par la même fonction : ils ' +
      'disaient « première » et « dernière » pour la même série.' },
  { notion: 'l’exercice fini (toutes ses séries de travail en base)', pr: 'PR 2',
    module: 'seance.js', fonction: 'exerciceFini', lecteurs: ['app.js', 'plan.js'],
    parAilleurs: { 'app.js': ['exerciceFini'], 'plan.js': ['planDeSeance'] },
    raison: 'le plan ouvrait le constat sur ses lignes couvertes, l’app calculait la suite ' +
      'sur toutes les séries de travail : deux définitions, d’accord par accident.' },
  { notion: 'le bloc fini (un superset attend sa fin)', pr: 'PR 2',
    module: 'seance.js', fonction: 'blocFini', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['blocFini'] },
    raison: 'le constat d’un superset attend la fin du bloc ; le bloc se lit sur la même ' +
      'définition de l’exercice fini.' },
  { notion: 'la suite du constat (la consigne de la prochaine séance)', pr: 'PR 2',
    module: 'moteur.js', fonction: 'suiteDExercice', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['suiteDe'] },
    raison: 'une ENTRÉE du plan, calculée avec les options de la consigne ; son cache porte ' +
      'ces options (une zone choisie la recalcule).' },
  { notion: 'le pré-remplissage d’une ligne (ce qui s’écrit en base à la validation d’un champ vide)', pr: 'PR 3',
    module: 'seance.js', fonction: 'fantome', lecteurs: ['plan.js'],
    motif: /(?:\bSeance|\bS|\bSeance\(\)|\bS\(\)|racine\.THSeance)\s*\.\s*fantome\b/g,
    parAilleurs: { 'plan.js': ['preremplir'] },
    raison: 'le plan pose `l.prerempli` sur TOUTES les lignes ; l’app fusionnait la cascade ' +
      'd’avant le plan et le fantôme du plan dans `fantomeDe`.' },
  { notion: 'la grille de la réaction (la ligne proposée, sa fourchette)', pr: 'PR 3',
    module: 'seance.js', fonction: 'planDe', lecteurs: ['plan.js'],
    parAilleurs: { 'plan.js': ['preremplir'] },
    raison: 'l’app refaisait la couverture pour savoir quelle ligne est proposée : le plan ' +
      'le dit (`l.proposee`).' },
  { notion: 'les reps de la dégressive (le milieu de « Vise… »)', pr: 'PR 3',
    module: 'plan.js', fonction: 'repsDeLaDegressive', lecteurs: [],
    par: ['preremplir'],
    raison: 'MOTEUR §9.15.3 (delta 49-38) : la phrase « Vise 6 à 8 » et la ligne disent le ' +
      'même chiffre ; la routine et la fois d’avant ne décident plus des reps de la dégressive.' },
  { notion: 'la place d’une série ajoutée (avant la dégressive qui attend)', pr: 'PR 4',
    module: 'seance.js', fonction: 'placeDeLaSerie', lecteurs: [],
    par: ['ajouterSerie'],
    raison: '« + Série » après une dégressive posait une série de travail DERRIÈRE elle ; la ' +
      'ligne de la série de plus passe par le même geste.' },
  { notion: 'les lignes allégées d’une séance (la semaine allégée appliquée)', pr: 'PR 4',
    module: 'plan.js', fonction: 'lignesARetirer', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['appliquerAllegee', 'allegeePourAjout'] },
    raison: 'à l’ouverture, à l’acceptation ET à l’ajout d’un exercice, la même règle : un ' +
      'exercice ajouté en pleine semaine allégée gardait toutes ses lignes de départ.' },
  { notion: 'l’exercice qu’on vient d’ajouter (absent avant, rien de fait)', pr: 'PR 4',
    module: 'app.js', fonction: 'exerciceAjoute', lecteurs: [],
    par: ['ligneDePlusPourAjout', 'allegeePourAjout'],
    raison: 'la ligne de plus et la semaine allégée s’appliquent au seul exercice ajouté : ' +
      'une définition, sinon l’une toucherait un exercice que l’autre épargne.' },
  { notion: 'la routine figée avec la consigne (héritée d’un remplacement en semaine allégée)', pr: 'PR 4',
    module: 'app.js', fonction: 'routineAFiger', lecteurs: [],
    par: ['consigneDe'],
    raison: 'décision du 02/10/2026 : l’allègement s’applique une fois, sur la routine de ' +
      'l’exercice remplacé ; figer la routine aux lignes déjà allégées allégeait deux fois.' },
  { notion: 'la dernière séance d’un exercice (la meilleure série du jour)', pr: 'PR 5',
    module: 'modele.js', fonction: 'meilleureSerieDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['sommaireExercices', 'rendreExercice'] },
    raison: 'décision du 02/10/2026 : la page d’exercice affichait le palier, Progression la ' +
      'meilleure série — deux nombres pour le même exercice et la même date, à un tap.' },
  { notion: 'le record de charge (la ligne la plus lourde de la table)', pr: 'PR 5',
    module: 'modele.js', fonction: 'recordDeLaTable', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreExercice'] },
    raison: 'décision du 02/10/2026 : un record est un fait, exploration comprise ; la fiche ' +
      'l’écartait et pouvait s’afficher sous la ligne « 1 rep » de la table.' },
  { notion: 'la consigne d’un exercice hors de l’en-tête (étiquette, zone déduite, cible)', pr: 'PR 5',
    module: 'app.js', fonction: 'consigneDeLExercice', lecteurs: [],
    par: ['rendreExercice', 'deduiteDe'],
    raison: 'la page d’exercice recalculait sa consigne avec cinq options de moins ; le menu ' +
      'des zones n’avait pas de zone déduite sans séance.' },
  { notion: 'le palier brut d’une séance (l’analyse du moteur de palier)', pr: 'PR 5',
    module: 'palier.js', fonction: 'analyser', lecteurs: ['modele.js', 'moteur.js'],
    motif: /(?:\bPalier|\bpalier|THPalier)\s*(?:\(\))?\s*\.\s*analyser\b/g,
    raison: 'aucun écran ne lit le palier brut : les faits passent par `Modele`, les mots du ' +
      'coach par la consigne. La page et Progression l’appelaient chacune à part.' },
  { notion: 'la série de travail (le type, `travail` quand il manque)', pr: 'PR 6',
    module: 'modele.js', fonction: 'estTravail', lecteurs: ['seance.js', 'semaine.js', 'plan.js', 'app.js'],
    motif: /\.\s*estTravail\s*\(/g,
    par: ['exercicesFaits', 'tableParReps', 'construireBlocs'],
    interditAilleurs: { motif: /type_serie\s*[!=]==?\s*(['"])travail\1|typeDe\([^()]*\)\s*[!=]==?\s*(['"])travail\2|\|\|\s*(['"])travail\3\s*\)\s*[!=]==?/,
      raison: 'une comparaison à « travail » écrite en dur : passer par `Modele.estTravail` (ou `typeDe`)' },
    raison: 'cinq définitions : une série sans type était du travail pour le moteur et le plan, ' +
      'pas pour les écrans ; la base dit `travail` par défaut.' },
  { notion: 'le compte des séries de travail (la règle du volume)', pr: 'PR 6',
    module: 'semaine.js', fonction: 'compteSeriesTravail', lecteurs: ['modele.js', 'seance.js', 'profil.js', 'routines.js', 'app.js'],
    parAilleurs: { 'modele.js': ['resumerSeance', 'construireBlocs'], 'seance.js': ['compter'],
                   'profil.js': ['statsDe'], 'app.js': ['rendreExercice'] },
    raison: 'décision du 02/10/2026 : la carte, la barre, la page, le détail (« de travail »), le ' +
      'bandeau, la feuille de fin et le profil disent le même nombre ; le tapis n’y entre pas.' },
  { notion: 'l’exercice fait (au moins une série de travail, cardio compris)', pr: 'PR 6',
    module: 'modele.js', fonction: 'exercicesFaits', lecteurs: ['app.js'],
    par: ['resumerSeance'],
    parAilleurs: { 'app.js': ['sommaireExercices', 'calculerDatesExercices'] },
    raison: 'décision du 02/10/2026 : Progression, le profil et la carte comptaient les exercices ' +
      'de trois façons (une ligne de chauffe suffisait au profil).' },
  { notion: 'les séries hors chauffe (« monte en charge », §5.1) — PAS la série de travail', pr: 'PR 7',
    module: 'palier.js', fonction: 'seriesHorsChauffe', lecteurs: [],
    par: ['etatsExercices'],
    raison: 'le travail, les dégressives et les échecs : le compte du Python qui a produit le §5.1. ' +
      'Une autre notion que `estTravail` ; elle portait un nom (`trav`) qui la faisait passer pour elle.' },
  { notion: 'le formateur des nombres et des dates (un seul)', pr: 'PR 7',
    module: 'modele.js', fonction: 'nombreSigne', lecteurs: ['rendu.js', 'app.js', 'profil.js'],
    motif: /\.\s*nombreSigne\s*\(/g,
    interditAilleurs: {
      motif: /\.replace\(\s*(['"])\.\1\s*,\s*(['"]),\2\s*\)|toLocale(?:Date|Time)?String\s*\(|\\u2212|(['"])janv\.?\3|(['"])janvier\4/,
      raison: 'une virgule décimale, une date `toLocale…`, un signe moins ou une liste de mois écrits hors du formateur ' +
        '(`modele.js`)' },
    raison: '`rendu.nombreFr`, `MOIS`, `mmss`, `dateCourte`, `nombreGroupe`, `poids.arrondi`, les mois du ' +
      'calendrier et l’horodatage du rejeu en étaient des copies, chacune avec sa règle.' },
  { notion: 'l’arrondi (symétrique) des nombres affichés', pr: 'PR 7',
    module: 'modele.js', fonction: 'arrondi', lecteurs: ['poids.js'],
    motif: /\.\s*arrondi\s*\(/g,
    par: ['nombreTexte'],
    raison: 'le formateur arrondissait −11,5 vers −11 et +11,5 vers +12 ; le poids, symétriquement. Un seul arrondi.' }
];

const CONSEIL = 'Passe par `planDeSeance` (v2/js/plan.js), ou ajoute ce fichier à la liste ' +
  'AUTORISATIONS de tests/unit/v2-architecture.test.js, avec sa raison, dans une PR qui le justifie.';

// ── LA LECTURE DU SOURCE ────────────────────────────────────────────────────
//
// Les commentaires deviennent des espaces, les chaînes aussi (sauf quand on
// cherche l'accès entre crochets) ; les sauts de ligne restent, pour que les
// numéros de ligne soient ceux de l'éditeur.
function nettoyer(src, garderChaines) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blanc = (c) => (c === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += blanc(src[i]); i++; }
      out += '  '; i += 2;
    } else if (c === '<' && src.startsWith('<!--', i)) {
      while (i < n && !src.startsWith('-->', i)) { out += blanc(src[i]); i++; }
      out += '   '; i += 3;
    } else if (c === '"' || c === '\'' || c === '`') {
      const q = c;
      out += c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += garderChaines ? src[i] + (src[i + 1] || '') : '  '; i += 2; continue; }
        out += garderChaines ? src[i] : blanc(src[i]);
        i++;
      }
      if (i < n) { out += q; i++; }
    } else {
      out += c; i++;
    }
  }
  return out;
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function ligneDe(texte, index) {
  let l = 1;
  for (let i = 0; i < index; i++) if (texte.charCodeAt(i) === 10) l++;
  return l;
}

// Les appels d'une fonction gardée dans un source : `[{ ligne }]`.
function appels(src, g) {
  const trouves = [];
  const code = nettoyer(src, false);
  const motif = g.motif ? new RegExp(g.motif.source, 'g') : new RegExp('\\.\\s*' + echapper(g.fn) + '\\b', 'g');
  let m;
  while ((m = motif.exec(code)) !== null) trouves.push({ ligne: ligneDe(code, m.index) });
  const avecChaines = nettoyer(src, true);
  const crochets = new RegExp('\\[\\s*([\'"`])' + echapper(g.fn) + '\\1\\s*\\]', 'g');
  while ((m = crochets.exec(avecChaines)) !== null) trouves.push({ ligne: ligneDe(avecChaines, m.index) });
  return trouves;
}

function perimetre() {
  const fichiers = fs.readdirSync(path.join(V2, 'js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ nom: f, chemin: path.join(V2, 'js', f) }));
  fichiers.push({ nom: 'index.html', chemin: path.join(V2, 'index.html') });
  return fichiers.map((f) => Object.assign(f, { src: fs.readFileSync(f.chemin, 'utf8') }));
}

// Le relevé : pour chaque fonction gardée, ses appels hors de son module.
function releve(fichiers, gardees) {
  const r = {};
  gardees.forEach((g) => {
    r[g.fn] = {};
    fichiers.forEach((f) => {
      if (f.nom === g.module) return;
      const a = appels(f.src, g);
      if (a.length) r[g.fn][f.nom] = a.map((x) => x.ligne);
    });
  });
  return r;
}

function violations(rel, autorisations) {
  const v = [];
  Object.keys(rel).forEach((fn) => {
    Object.keys(rel[fn]).forEach((fichier) => {
      if (fichier === LE_COACH) return;
      const permis = autorisations[fn] && Object.prototype.hasOwnProperty.call(autorisations[fn], fichier);
      if (!permis) {
        v.push('`' + fn + '` est appelée dans v2/' + (fichier === 'index.html' ? '' : 'js/') + fichier +
          ', ligne' + (rel[fn][fichier].length > 1 ? 's ' : ' ') + rel[fn][fichier].join(', ') +
          '. Seul le plan appelle les calculs du coach. ' + CONSEIL);
      }
    });
  });
  return v;
}

function perimees(rel, autorisations) {
  const v = [];
  Object.keys(autorisations).forEach((fn) => {
    Object.keys(autorisations[fn]).forEach((fichier) => {
      if (!rel[fn] || !rel[fn][fichier]) {
        v.push('AUTORISATIONS.' + fn + '[\'' + fichier + '\'] n’a plus d’appel : retire l’entrée — ' +
          'la liste dit ce qui est, pas ce qui a été.');
      }
    });
  });
  return v;
}

// ── LES TESTS ───────────────────────────────────────────────────────────────

describe('architecture — un seul coach, un seul câblage', () => {
  const FICHIERS = perimetre();
  const REL = releve(FICHIERS, GARDEES);

  test('chaque fonction gardée existe, exportée par le module qui la définit', () => {
    global.self = global;
    require('../../v2/js/modele.js');
    require('../../v2/js/palier.js');
    const modules = { 'moteur.js': require('../../v2/js/moteur.js'), 'seance.js': require('../../v2/js/seance.js') };
    const absentes = GARDEES.filter((g) => typeof modules[g.module][g.fn] !== 'function')
      .map((g) => g.module + ' n’exporte plus `' + g.fn + '` : mets la liste GARDEES à jour.');
    expect(absentes).toEqual([]);
  });

  test('la liste d’autorisations ne nomme que des fonctions gardées, et chaque entrée a sa raison', () => {
    const noms = new Set(GARDEES.map((g) => g.fn));
    Object.keys(AUTORISATIONS).forEach((fn) => {
      expect([fn, noms.has(fn)]).toEqual([fn, true]);
      Object.keys(AUTORISATIONS[fn]).forEach((f) => {
        expect([fn, f, f !== LE_COACH]).toEqual([fn, f, true]);
        const raison = AUTORISATIONS[fn][f];
        expect([fn, f, typeof raison === 'string' && raison.length > 20]).toEqual([fn, f, true]);
      });
    });
  });

  test('⚠️ LA GARDE — seuls le plan et les fichiers autorisés appellent les calculs du coach', () => {
    // Le message dit la fonction, le fichier, la ligne, et quoi faire.
    expect(violations(REL, AUTORISATIONS)).toEqual([]);
  });

  test('la liste d’autorisations dit exactement ce qui est : aucune entrée sans appel', () => {
    expect(perimees(REL, AUTORISATIONS)).toEqual([]);
  });

  test('le plan appelle bien le moteur : la garde lit le vrai câblage, pas un fichier vide', () => {
    ['reactionPour', 'planDeCouverture', 'lignesDePari', 'constatDuJour', 'consigneFigee']
      .forEach((fn) => expect([fn, !!REL[fn][LE_COACH]]).toEqual([fn, true]));
  });
});

// Le corps d'une fonction déclarée `function nom(...) { … }` dans un source
// nettoyé : de son accolade ouvrante à l'accolade qui la ferme.
function corpsDe(code, nom) {
  const m = new RegExp('function\\s+' + echapper(nom) + '\\s*\\(').exec(code);
  if (!m) return null;
  let i = code.indexOf('{', m.index);
  let prof = 0;
  for (let j = i; j < code.length; j++) {
    if (code[j] === '{') prof++;
    else if (code[j] === '}' && --prof === 0) return code.slice(i, j + 1);
  }
  return null;
}

describe('architecture — le registre des notions : une source, des lecteurs', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });

  test('le registre est complet : chacune des sept PR de la consolidation y a ses notions', () => {
    const prs = ['PR 1', 'PR 2', 'PR 3', 'PR 4', 'PR 5', 'PR 6', 'PR 7'];
    expect(prs.filter((pr) => !NOTIONS.some((n) => n.pr === pr))).toEqual([]);
    expect(NOTIONS.filter((n) => prs.indexOf(n.pr) < 0).map((n) => n.notion)).toEqual([]);
  });

  test('chaque notion a sa source, déclarée dans son module, et sa raison', () => {
    NOTIONS.forEach((n) => {
      const code = nettoyer(parNom[n.module].src, false);
      expect([n.notion, !!corpsDe(code, n.fonction)]).toEqual([n.notion, true]);
      expect([n.notion, typeof n.raison === 'string' && n.raison.length > 20]).toEqual([n.notion, true]);
    });
  });

  test('⚠️ hors de son module, une notion ne se lit QUE chez ses lecteurs', () => {
    const fautes = [];
    NOTIONS.forEach((n) => {
      FICHIERS.forEach((f) => {
        if (f.nom === n.module || n.lecteurs.indexOf(f.nom) >= 0) return;
        const a = appels(f.src, { fn: n.fonction, motif: n.motif });
        if (a.length) fautes.push(n.notion + ' : `' + n.fonction + '` appelée dans ' + f.nom + ', ligne(s) ' + a.map((x) => x.ligne).join(', '));
      });
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ dans son module, chaque fonction qui la dit passe par sa source', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.par).forEach((n) => {
      const code = nettoyer(parNom[n.module].src, false);
      n.par.forEach((fn) => {
        const corps = corpsDe(code, fn);
        if (!corps) fautes.push(n.notion + ' : `' + fn + '` n’existe plus — mets le registre à jour');
        else if (!new RegExp('\\b' + echapper(n.fonction) + '\\s*\\(').test(corps)) {
          fautes.push(n.notion + ' : `' + fn + '` ne passe pas par `' + n.fonction + '`');
        }
      });
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ hors de son module, chaque fonction désignée passe par la source', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.parAilleurs).forEach((n) => {
      Object.keys(n.parAilleurs).forEach((fichier) => {
        const code = nettoyer(parNom[fichier].src, false);
        n.parAilleurs[fichier].forEach((fn) => {
          const corps = corpsDe(code, fn);
          if (!corps) fautes.push(n.notion + ' : `' + fn + '` n’existe plus dans ' + fichier + ' — mets le registre à jour');
          else if (!new RegExp('\\.\\s*' + echapper(n.fonction) + '\\s*\\(').test(corps)) {
            fautes.push(n.notion + ' : `' + fn + '` (' + fichier + ') ne passe pas par `' + n.fonction + '`');
          }
        });
      });
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ aucune trace d’une décision écrite d’office', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.interdit).forEach((n) => {
      const avecChaines = nettoyer(parNom[n.module].src, true);
      const m = n.interdit.motif.exec(avecChaines);
      if (m) fautes.push(n.notion + ' : ' + n.interdit.raison + ', ligne ' + ligneDe(avecChaines, m.index));
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ aucune trace hors de son module : la définition n’est écrite qu’une fois (PR 6)', () => {
    const fautes = [];
    NOTIONS.filter((n) => n.interditAilleurs).forEach((n) => {
      FICHIERS.forEach((f) => {
        if (f.nom === n.module) return;
        const avecChaines = nettoyer(f.src, true);
        const motif = new RegExp(n.interditAilleurs.motif.source, 'g');
        let m;
        while ((m = motif.exec(avecChaines)) !== null) {
          fautes.push(n.notion + ' : ' + n.interditAilleurs.raison + ' — ' + f.nom + ', ligne ' + ligneDe(avecChaines, m.index));
        }
      });
    });
    expect(fautes).toEqual([]);
  });

  test('l’interdit du formateur se lit vraiment', () => {
    const n = NOTIONS.filter((x) => x.fonction === 'nombreSigne')[0];
    const voit = (t) => n.interditAilleurs.motif.test(t);
    expect(voit("String(p).replace('.', ',')")).toBe(true);
    expect(voit("d.toLocaleDateString('fr-FR', {})")).toBe(true);
    expect(voit("'\\u2212' + x")).toBe(true);
    expect(voit("var MOIS = ['janv.', 'févr.'];")).toBe(true);
    expect(voit("Modele.nombreSigne(p)")).toBe(false);
  });

  test('l’interdit se lit vraiment : les trois formes écrites en dur se voient, l’appel non', () => {
    const n = NOTIONS.filter((x) => x.interditAilleurs)[0];
    const voit = (t) => n.interditAilleurs.motif.test(t);
    expect(voit("if (s.type_serie !== 'travail') return;")).toBe(true);
    expect(voit('return Seance.typeDe(s) === "travail";')).toBe(true);
    expect(voit("((p.serie.type_serie || 'travail') === 'travail')")).toBe(true);
    expect(voit('if (!Modele.estTravail(s)) return;')).toBe(false);
    expect(voit("type_serie: 'travail',")).toBe(false);
  });

  test('le registre se lit vraiment : une décision écrite d’office et un lecteur de trop se voient', () => {
    const n = NOTIONS[1];
    expect(n.interdit.motif.test('x = c.ligne ? \'une série de plus\' : \'ta dernière série\';')).toBe(true);
    expect(n.interdit.motif.test('\'Ta dernière série a chuté après des séries stables\'')).toBe(false);
    expect(appels('var p = Moteur.pourquoiConsigne(x.consigne);', { fn: 'pourquoiConsigne' })).toHaveLength(1);
    expect(corpsDe('function a(x) { return b(x, { y: 1 }); } function c() {}', 'a')).toBe('{ return b(x, { y: 1 }); }');
  });
});

// La lecture elle-même : sans ces cas, un défaut du lecteur rendrait la garde
// muette sans que rien ne tombe.
describe('architecture — la lecture du source', () => {
  const G = (fn, extra) => Object.assign({ fn, module: 'moteur.js' }, extra || {});
  const FANTOME = GARDEES.filter((g) => g.fn === 'fantome')[0];

  test('les accès par propriété se voient, quel que soit l’alias', () => {
    const src = 'var a = Moteur.reactionPour(x);\nvar b = M.reactionPour(y);\n' +
      'racine.THMoteur.reactionPour(z);\nMoteur().reactionPour(w);\nMoteur[\'reactionPour\'](v);';
    expect(appels(src, G('reactionPour')).map((x) => x.ligne)).toEqual([1, 2, 3, 4, 5]);
  });

  test('les commentaires et les chaînes ne comptent pas, les lignes restent justes', () => {
    const src = '// Moteur.reactionPour(x)\n/* M.reactionPour(\n y) */\nvar s = "Moteur.reactionPour()";\n' +
      'var t = \'M.reactionPour\';\nMoteur.reactionPour(ok);';
    expect(appels(src, G('reactionPour')).map((x) => x.ligne)).toEqual([6]);
  });

  test('un préfixe ne compte pas : `reactionPourTout` n’est pas `reactionPour`', () => {
    expect(appels('Moteur.reactionPourTout(x);', G('reactionPour'))).toEqual([]);
  });

  test('`fantome` : l’appel qualifié par le module compte, le champ et le rappel de la vue non', () => {
    const src = 'Seance.fantome(s, 0, 1);\nvar f = vue.fantome(i, j);\nl.fantome = null;\nS().fantome(a);';
    expect(appels(src, FANTOME).map((x) => x.ligne)).toEqual([1, 4]);
  });

  test('le message d’échec dit la fonction, le fichier, la ligne, et quoi faire', () => {
    const rel = { reactionPour: { 'rendu.js': [12, 40] } };
    const v = violations(rel, {});
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('`reactionPour`');
    expect(v[0]).toContain('v2/js/rendu.js');
    expect(v[0]).toContain('lignes 12, 40');
    expect(v[0]).toContain('planDeSeance');
    expect(v[0]).toContain('AUTORISATIONS');
  });
});
