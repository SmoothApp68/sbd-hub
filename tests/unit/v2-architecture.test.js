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
  // moteur.js — le mode d'un exercice, la carte du lest, le départ lesté (§9.17, 50-1)
  { fn: 'modeEnVigueur', module: 'moteur.js' },
  { fn: 'intentionDe', module: 'moteur.js' },
  { fn: 'carteLestTitre', module: 'moteur.js' },
  { fn: 'carteLestDetail', module: 'moteur.js' },
  { fn: 'consigneDepartLeste', module: 'moteur.js' },
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
  // moteur.js — les frères (§13.6, 49-U20)
  { fn: 'frereQuiProgresse', module: 'moteur.js' },
  { fn: 'phraseFrere', module: 'moteur.js' },
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
  // moteur.js — le report de charge au changement de zone (§9.10, 53-1)
  { fn: 'reportDeZone', module: 'moteur.js' },
  { fn: 'consigneRepli', module: 'moteur.js' },
  { fn: 'phraseRepli', module: 'moteur.js' },
  { fn: 'observationMarche', module: 'moteur.js' },
  // moteur.js — la règle de volume, la place pour une série de plus (§14.6, 49-U16)
  { fn: 'placeDeVolume', module: 'moteur.js' },
  { fn: 'placePourExercice', module: 'moteur.js' },
  { fn: 'musclesParPriorite', module: 'moteur.js' },
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
  { fn: 'observationsARenvoyer', module: 'seance.js' },
  // generateur.js — le programme construit (QUESTIONNAIRE-COACH-V2 §5 bis, 60-4). `generer` et `pourquoi` sont des
  // noms courants : on ne garde que l'appel qualifié par le module.
  { fn: 'generer', module: 'generateur.js',
    motif: /(?:\bGenerateur|\bGenerateur\(\)|racine\.THGenerateur)\s*\.\s*generer\b/g },
  { fn: 'neVeuxPas', module: 'generateur.js' },
  { fn: 'remplacePar', module: 'generateur.js' },
  { fn: 'pourquoi', module: 'generateur.js',
    motif: /(?:\bGenerateur|\bGenerateur\(\)|racine\.THGenerateur)\s*\.\s*pourquoi\b/g },
  { fn: 'carteCycles', module: 'generateur.js' },
  // generateur.js — « Le coach relit ta semaine » (66A, QUESTIONNAIRE-COACH-V2 §5 ter) : l'écran (66B) lira la
  // relecture, il ne la refait pas ; ses invariants (R1-R4) se vérifient par le module.
  { fn: 'relireSemaine', module: 'generateur.js' },
  { fn: 'verifierRelecture', module: 'generateur.js' }
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
  periodeAllegee: {
    'app.js': 'MOTEUR §9.18 (51-1 ter) : l’écran de la ROUTINE, avant toute séance — donc sans plan — ' +
      'dit si une semaine allégée est en cours, pour taire « J’ai peu de temps » et afficher la durée ' +
      'allégée ; la même lecture des cartes que `escalierDuPlan` (app.js, `semaineAllegeeEnCours`).'
  },
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
      '`volumeDeLaSeance`, 49-U16). 66B : une seule fonction, `volumeDuCoach(avant)`, appelée par ' +
      '`volumeDeLaSeance` (le début de la séance) et par l’entrée de « Le coach relit ta semaine » (maintenant, ' +
      'QUESTIONNAIRE §5 ter.4 bis) — le même fait, jamais recalculé autrement.'
  },
  suiteDExercice: {
    'app.js': 'calcule l’ENTRÉE `entrees.suites` du plan (la consigne de la prochaine séance, ' +
      'sur l’historique augmenté du jour) : le plan n’a pas l’historique (app.js, `suiteDe`).'
  },
  zoneEnVigueur: {
    'app.js': 'lit la zone CHOISIE dans les lignes `zones` (§9.1.1) pour la passer en ' +
      '`correction` au moteur : une entrée, pas une décision (app.js, `zoneDe`).'
  },
  modeEnVigueur: {
    'app.js': 'lit le mode CHOISI d’un exercice dans les lignes `modes` (§9.17) pour le passer ' +
      'au plan (`entrees.modes`) et à la consigne : une entrée, pas une décision (app.js, `modeDe`).'
  },
  intentionDe: {
    'app.js': 'compose l’intention d’UN exercice (celle du profil, puis son mode, §9.17) pour la ' +
      'passer à `consigneDExercice` : une entrée, pas une décision (app.js, `intentionDeLExercice`).'
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
  },
  // ── 60-4 — LE PROGRAMME CONSTRUIT (QUESTIONNAIRE-COACH-V2 §5 bis) ─────────
  generer: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 bis (60-4) : le générateur est un calcul du PROGRAMME, avant toute séance — ' +
      'donc sans plan. L’app compose (`entreeDuProgramme` lit le profil et les faits, `ouvrirApercuProgramme` appelle ' +
      'le générateur une fois) ; elle ne décide ni un exercice, ni une série, ni des reps.'
  },
  neVeuxPas: {
    'app.js': 'ECRAN-SAISIE §7 quindecies.9 (60-4) : « Je n’en veux pas » dans l’aperçu change SEULE la place touchée, ' +
      'par la règle du générateur (`ecarterDansLeProgramme`) ; l’écran n’invente pas le remplaçant.'
  },
  remplacePar: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 bis (60-4) : « Remplacer » dans l’aperçu — l’exercice choisi prend la place ' +
      '(`poserDansLeProgramme`) avec les séries de la place et les reps que la règle du générateur donne à CET exercice.'
  },
  pourquoi: {
    'app.js': 'QUESTIONNAIRE-COACH-V2 §5 bis (60-4) : la ligne « pourquoi » d’une carte de l’aperçu est un fait du ' +
      'générateur, recalculé après chaque changement (`lectureDuProgramme`) ; l’écran n’additionne aucune série.'
  },
  carteCycles: {
    'app.js': 'MOTEUR §9.22 (60-4) : la carte « Passer en cycles » de Saisie lit la règle du générateur ' +
      '(`carteCyclesDuProfil`) : l’objectif, les jours depuis la création, les séances du dossier, un dossier déjà ' +
      'programme, « Juste un carnet », « Pas maintenant » — l’écran ne compte et ne compare rien lui-même.'
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
    parAilleurs: { 'app.js': ['sommaireExercices', 'derniereSeanceDe'] },
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
    module: 'modele.js', fonction: 'estTravail', lecteurs: ['seance.js', 'semaine.js', 'plan.js', 'app.js', 'bilan.js', 'faits.js', 'routines.js', 'jeu.js', 'generateur.js'],
    motif: /\.\s*estTravail\s*\(/g,
    par: ['exercicesFaits', 'tableParReps', 'construireBlocs'],
    interditAilleurs: { motif: /type_serie\s*[!=]==?\s*(['"])travail\1|typeDe\([^()]*\)\s*[!=]==?\s*(['"])travail\2|\|\|\s*(['"])travail\3\s*\)\s*[!=]==?/,
      raison: 'une comparaison à « travail » écrite en dur : passer par `Modele.estTravail` (ou `typeDe`)' },
    raison: 'cinq définitions : une série sans type était du travail pour le moteur et le plan, ' +
      'pas pour les écrans ; la base dit `travail` par défaut.' },
  { notion: 'le compte des séries de travail (la règle du volume)', pr: 'PR 6',
    module: 'semaine.js', fonction: 'compteSeriesTravail', lecteurs: ['modele.js', 'seance.js', 'profil.js', 'routines.js', 'app.js', 'bilan.js'],
    parAilleurs: { 'modele.js': ['resumerSeance', 'construireBlocs'], 'seance.js': ['compter'], 'bilan.js': ['bilanDuMois'],
                   'profil.js': ['statsDe'], 'app.js': ['rendreExercice'] },
    raison: 'décision du 02/10/2026 : la carte, la barre, la page, le détail (« de travail »), le ' +
      'bandeau, la feuille de fin et le profil disent le même nombre ; le tapis n’y entre pas.' },
  { notion: 'l’exercice fait (au moins une série de travail, cardio compris)', pr: 'PR 6',
    module: 'modele.js', fonction: 'exercicesFaits', lecteurs: ['app.js', 'faits.js'],
    // 64A : l'APPEL, pas le champ — `entree.exercicesFaits` (JEU-V1 §8) est un nombre que le jeu lit, pas un
    // second calcul (même forme que `estTravail`).
    motif: /\.\s*exercicesFaits\s*\(/g,
    par: ['resumerSeance'],
    parAilleurs: { 'app.js': ['sommaireExercices'], 'faits.js': ['datesDesExercices'] },
    raison: 'décision du 02/10/2026 : Progression, le profil et la carte comptaient les exercices ' +
      'de trois façons (une ligne de chauffe suffisait au profil).' },
  { notion: 'les séries hors chauffe (« monte en charge », §5.1) — PAS la série de travail', pr: 'PR 7',
    module: 'palier.js', fonction: 'seriesHorsChauffe', lecteurs: [],
    par: ['etatsExercices'],
    raison: 'le travail, les dégressives et les échecs : le compte du Python qui a produit le §5.1. ' +
      'Une autre notion que `estTravail` ; elle portait un nom (`trav`) qui la faisait passer pour elle.' },
  { notion: 'le formateur des nombres et des dates (un seul)', pr: 'PR 7',
    module: 'modele.js', fonction: 'nombreSigne', lecteurs: ['rendu.js', 'app.js', 'profil.js', 'questionnaire.js'],
    motif: /\.\s*nombreSigne\s*\(/g,
    interditAilleurs: {
      motif: /\.replace\(\s*(['"])\.\1\s*,\s*(['"]),\2\s*\)|toLocale(?:Date|Time)?String\s*\(|\\u2212|(['"])janv\.?\3|(['"])janvier\4/,
      raison: 'une virgule décimale, une date `toLocale…`, un signe moins ou une liste de mois écrits hors du formateur ' +
        '(`modele.js`)' },
    raison: '`rendu.nombreFr`, `MOIS`, `mmss`, `dateCourte`, `nombreGroupe`, `poids.arrondi`, les mois du ' +
      'calendrier et l’horodatage du rejeu en étaient des copies, chacune avec sa règle.' },
  { notion: 'l’arrondi (symétrique) des nombres affichés', pr: 'PR 7',
    module: 'modele.js', fonction: 'arrondi', lecteurs: ['poids.js', 'generateur.js'],
    motif: /\.\s*arrondi\s*\(/g,
    par: ['nombreTexte'],
    raison: 'le formateur arrondissait −11,5 vers −11 et +11,5 vers +12 ; le poids, symétriquement. Un seul arrondi. ' +
      '66A : la jauge d’une barre de la relecture (§5 ter.3) est cet arrondi, à 2 décimales.' },
  // Après la consolidation, les notions d'un chantier portent son geste.
  { notion: 'la lecture d’un nombre tapé (l’inverse du formateur, tous les signes moins)', pr: 'correctif 03/10/2026',
    module: 'modele.js', fonction: 'lireNombre', lecteurs: ['seance.js', 'routines.js', 'app.js'],
    motif: /\.\s*lireNombre\s*\(/g,
    parAilleurs: { 'seance.js': ['nombreOuNul'], 'routines.js': ['decimalOuNul'] },
    interditAilleurs: { motif: /\.replace\(\s*(['"]),\1\s*,\s*(['"])\.\2\s*\)/,
                        raison: 'une virgule décimale relue hors de `lireNombre` : une seconde lecture des nombres' },
    raison: 'le champ réaffiche une assistance avec le vrai signe moins (U+2212) que la copie de ' +
      '`seance.js` ne relisait pas : retoucher les reps d’une série à « −25 » effaçait sa charge.' },
  { notion: 'les frères d’un exercice (même `mouvement` au catalogue, MOTEUR §13.6)', pr: '49-U20',
    module: 'modele.js', fonction: 'freresDe', lecteurs: ['app.js', 'seance.js', 'faits.js', 'generateur.js'],
    parAilleurs: { 'app.js': ['freresPourLeMoteur', 'faitsDesFreres'], 'seance.js': ['freresProposes'],
                   'faits.js': ['barresDuBilan'], 'generateur.js': ['relecture'] },
    interditAilleurs: { motif: /\.\s*mouvement\b|\[\s*(['"`])mouvement\1\s*\]/,
                        raison: '`mouvement` lu ailleurs que dans `freresDe` : une seconde définition des frères' },
    raison: 'les frères sont les exercices de même `mouvement` — pas de même `famille`, plus large ; ' +
      'une seule lecture de la colonne, sinon deux écrans auraient deux listes de frères. 66A : les variantes à la ' +
      'barre du bilan (QUESTIONNAIRE §5 ter.2) sont ses frères à la barre — `faits.js` (le fait) et `generateur.js` ' +
      '(la relecture : le lourd en premier, la poussée, le squat à déplacer) les lisent ici, sans relire `mouvement`.' },
  { notion: 'la version lestée d’un exercice libre (`parent` au catalogue, MOTEUR §9.17)', pr: '50-U1',
    module: 'modele.js', fonction: 'lesteDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['optionsDeConsigne', 'entreesDuPlan'] },
    interditAilleurs: { motif: /\.\s*parent\b|\[\s*(['"`])parent\1\s*\]/,
                        raison: '`parent` lu ailleurs que dans `lesteDe` et `parentDe` : une seconde définition du lesté' },
    raison: '« J’ai du lest » met la version lestée à la place de l’exercice libre : la carte ne ' +
      'promet que ce que le catalogue sait livrer, et une seule lecture de la colonne le dit.' },
  { notion: 'l’exercice libre d’une version lestée (le départ à 2,5 kg, MOTEUR §8.4)', pr: '50-U1',
    module: 'modele.js', fonction: 'parentDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['optionsDeConsigne'] },
    raison: 'la première fois qu’un exercice lesté se fait, il part de la zone de l’exercice libre ; ' +
      'l’app donne au moteur cet exercice, par la même lecture du catalogue que la carte.' },
  { notion: 'le matériel effectif d’un exercice (une charge ajoutée est du lest, cran 2,5 kg)', pr: '50-U1',
    module: 'moteur.js', fonction: 'equipementEffectif', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['optionsDeConsigne', 'entreesDuPlan'] },
    raison: 'le catalogue dit `equipement` ; la consigne, les chauffes et la dégressive lisent le ' +
      'MATÉRIEL EFFECTIF : sans lui, le lesté prenait le cran de la salle ou celui d’une barre.' },
  { notion: 'l’aide (tapée en positif, rangée en négatif)', pr: '50-U1',
    module: 'modele.js', fonction: 'rangerAide', lecteurs: ['rendu.js', 'app.js'],
    parAilleurs: { 'app.js': ['validerSerie'] },
    interditAilleurs: { motif: /-\s*Math\.abs\s*\(/,
                        raison: 'un signe d’aide posé à la main hors de `rangerAide` : une seconde règle du signe' },
    raison: 'MOTEUR §9.17 : le signe d’une aide se pose à UN endroit — la saisie et le pré-remplissage ' +
      'que la validation écrit. Une aide qui entre en positif se lit comme une charge.' },
  { notion: 'le frère qui progresse pendant le blocage (MOTEUR §13.6)', pr: '49-U20',
    module: 'moteur.js', fonction: 'frereQuiProgresse', lecteurs: [],
    par: ['frereDuBlocage'],
    raison: 'la règle (un progrès après le dernier progrès de l’exercice bloqué, un meilleur en hausse, ' +
      'la même zone pour la flèche) se décide une fois ; le plan ne lit que son résultat, figé avec la consigne.' },
  { notion: 'la durée estimée d’une routine (MOTEUR §9.18)', pr: '51-U1',
    module: 'moteur.js', fonction: 'dureeEstimee', lecteurs: ['app.js'],
    par: ['raccourcirRoutine'],
    parAilleurs: { 'app.js': ['tempsDeLaRoutine'] },
    raison: 'une seule fonction pour la durée affichée sur la routine, la durée allégée et la carte ; ' +
      'ses constantes sont des valeurs par défaut, définies une fois (`DUREE_PAR_DEFAUT`).' },
  { notion: 'le raccourci d’une routine (« J’ai peu de temps », MOTEUR §9.18)', pr: '51-U1',
    module: 'moteur.js', fonction: 'raccourcirRoutine', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['montrerCarteRaccourci'] },
    raison: 'le coach coupe les dernières séries, pas les muscles : la carte et la séance raccourcie ' +
      'lisent le même résultat, jamais une seconde règle à l’écran.' },
  { notion: 'la dernière séance d’un exercice, sur sa page et sous un frère de « Machine prise »', pr: '51-U2',
    module: 'app.js', fonction: 'derniereSeanceDe', lecteurs: [],
    par: ['rendreExercice', 'faitsDesFreres'],
    raison: 'MOTEUR §9.19 : le fait sous un frère est « Dernière séance » de sa page d’exercice, par la ' +
      'même fonction — un second calcul dirait un autre chiffre que la page, à un tap.' },
  { notion: '« Plus tard » de « Machine prise » (le bloc passe après le suivant, MOTEUR §9.19)', pr: '51-U2',
    module: 'seance.js', fonction: 'plusTard', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['vueMachinePrise'] },
    raison: 'où va le bloc, et quand « Plus tard » est absent (dernier bloc, exercice commencé), se ' +
      'décide une fois ; l’écran déplace par `reordonnerBlocs`, sans toucher à la consigne.' },
  { notion: 'les frères proposés par « Machine prise » (et leur ordre, MOTEUR §9.19)', pr: '51-U2',
    module: 'seance.js', fonction: 'freresProposes', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['freresDe'] },
    raison: 'les frères pas encore dans la séance d’abord, l’historique le plus récent, puis par nom ; ' +
      'un frère déjà présent à la fin — une règle, que la feuille affiche sans la refaire. 60-4 : UNE liste pour ' +
      '« Machine prise », « Remplacer » (l’éditeur et l’aperçu du programme) et « Je n’en veux pas » (`freresDe`).' },
  { notion: 'la séance neutre (§7.6), déduite ou DÉCLARÉE par la marque « douleur » (MOTEUR §9.20)', pr: '51-U3',
    module: 'moteur.js', fonction: 'sansPalierRetenues', lecteurs: [],
    par: ['contratDe'],
    raison: 'une séance marquée ne vote pas pour la charge et reste une présence pour le rythme : ' +
      'le même chemin que la séance sans travail dans la zone, pas une seconde notion.' },
  { notion: 'la séance-exercice douloureuse (une série marquée, dans le contrat)', pr: '51-U3',
    module: 'moteur.js', fonction: 'seanceDouloureuse', lecteurs: [],
    par: ['contratDe'],
    raison: 'MOTEUR §9.20 : une seule série marquée rend la séance-exercice douloureuse ; le contrat ' +
      'le lit une fois, et `sansPalierRetenues` en fait une séance neutre.' },
  { notion: 'l’occurrence marquée « douleur » en séance (sans coach, I33)', pr: '51-U3',
    module: 'seance.js', fonction: 'occurrenceDouloureuse', lecteurs: ['plan.js'],
    par: ['lignes'],
    parAilleurs: { 'plan.js': ['planDeSeance'] },
    raison: 'le plan (sans coach), l’envoi (`sets.douleur` sur chaque série) et l’écran lisent la même ' +
      'marque : posée sur l’occurrence, tenue de ses séries quand la séance est relue.' },
  { notion: 'la reprise après une séance douloureuse (la carte, la zone suivante, le repli)', pr: '51-U3',
    module: 'moteur.js', fonction: 'reprisePour', lecteurs: [],
    par: ['consigneDExercice'],
    raison: 'MOTEUR §9.20 : la carte se décide sur la dernière séance, figée avec la consigne ; « Plus ' +
      'léger » passe par la zone suivante et le report (§9.10, 53-1), sinon les replis existants, ' +
      'jamais une charge à part.' },
  { notion: 'le repli de la reprise longue (§9.9 : le cran en dessous, 10 % au plus)', pr: '51-U3',
    module: 'moteur.js', fonction: 'repliDeReprise', lecteurs: [],
    par: ['consigneFigee', 'repliDeLaRepriseLongue'],
    raison: '51-3 bis : « Plus léger » le réutilise quand le repli de §14.5 n’existe pas — la règle de ' +
      '§9.9 appelée par sa fonction, jamais recopiée (une charge de repli calculée à part serait une seconde règle).' },
  { notion: 'la structure d’une séance en routine (« En faire une routine », ECRAN-SAISIE §7 quindecies.4)', pr: '52-U1',
    module: 'routines.js', fonction: 'routineDepuisSeance', lecteurs: ['app.js'],
    par: ['routineDeduite'],
    parAilleurs: { 'app.js': ['structureDeLaSeance'] },
    raison: 'la nouvelle routine et la mise à jour lisent la même structure (blocs du détail, supersets, ' +
      'reps repères, repos et leur origine, jamais une charge) : un second découpage dirait une autre routine.' },
  { notion: 'un nom libre de routine (« (2) », « (copie) », l’index `lower(btrim(nom))`)', pr: '52-U1',
    module: 'routines.js', fonction: 'nomLibre', lecteurs: ['app.js'],
    par: ['routineDepuisSeance'],
    parAilleurs: { 'app.js': ['demanderDuplication'] },
    raison: 'une seule fonction pour le nom d’une routine créée depuis une séance et d’une copie : ' +
      'la comparaison est celle de l’index de la base, sinon l’écriture se ferait refuser.' },
  { notion: 'la copie d’une routine (« Dupliquer », par le chemin de création)', pr: '52-U1',
    module: 'routines.js', fonction: 'copieDeRoutine', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['dupliquerRoutine'] },
    raison: 'une routine NEUVE que `enregistrer` crée comme les autres (rang suivant, annulation) ; ' +
      'aucun identifiant partagé : l’originale ne peut pas être touchée.' },
  { notion: 'un polyarticulaire (au moins 3 muscles) : le raccourci et les repos par défaut', pr: '52-U1',
    module: 'moteur.js', fonction: 'estPolyarticulaire', lecteurs: ['routines.js', 'generateur.js'],
    par: ['raccourcirRoutine'],
    parAilleurs: { 'routines.js': ['routineDepuisSeance'], 'generateur.js': ['relecture'] },
    raison: 'les repos par défaut d’« En faire une routine » sont les classes de « J’ai peu de temps » : ' +
      'une définition, lue aux deux endroits. 66A : la relecture de la semaine (§5 ter.4) la lit aussi — l’isolation ' +
      'avant la barre, et les séries que la sèche peut retirer (jamais un polyarticulaire).' },
  { notion: 'les écarts d’une séance avec une routine (§6.3, et « Mettre à jour » depuis une séance)', pr: '52-U1',
    module: 'seance.js', fonction: 'ecartsRoutine', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreFeuilleFin', 'apercuMiseAJour'] },
    raison: '« Mettre à jour une routine » passe par la question de fin de séance — les mêmes écarts, le ' +
      'même aperçu, la même écriture —, pas par un second mécanisme (ECRAN-SAISIE §7 quindecies.4).' },
  { notion: 'l’écriture d’une routine mise à jour depuis une séance (la file, comme la fin de séance)', pr: '52-U1',
    module: 'app.js', fonction: 'reporterSurRoutine', lecteurs: [],
    par: ['terminerSeance', 'apercuMiseAJour'],
    raison: 'une intention posée dans la file, recalculée à la vidange : la fin de séance et « Mettre à ' +
      'jour » écrivent par le même chemin, jamais par l’éditeur.' },
  { notion: 'un exercice jamais fait (la charge de départ ne sert que là, MOTEUR §9.21)', pr: '52-U1',
    module: 'app.js', fonction: 'jamaisFait', lecteurs: [],
    par: ['chargeDansLEditeur', 'chargeDeDepartDe'],
    raison: 'l’éditeur (« Charge de départ » ou « le coach décide ») et la charge passée au coach lisent la ' +
      'même définition : sans elle, l’éditeur promettrait un départ que le coach ignore.' },
  { notion: 'la consigne de la charge de départ, la première fois (MOTEUR §9.21)', pr: '52-U1',
    module: 'moteur.js', fonction: 'departDeRoutine', lecteurs: [],
    par: ['consigneDExercice'],
    raison: 'seulement sur « Première fois ici », en charge × reps : la routine donne un point de départ, ' +
      'et dès qu’il y a des données le coach décide seul.' },
  { notion: 'le report de charge au changement de zone (MOTEUR §9.10 : la plus basse de la charge tenue et de l’estimation, au bas de la zone)', pr: '53-U1',
    module: 'moteur.js', fonction: 'reportDeZone', lecteurs: [],
    par: ['reportSur'],
    interditAilleurs: { motif: /\/\s*\(?\s*30\b|\bREPORT_EPLEY\b/,
                        raison: 'une estimation (« n/30 ») écrite hors du moteur : un second calcul du report' },
    raison: 'une seule règle pour tout changement de zone — la correction à l’étiquette, la reprise ' +
      '« Plus léger », demain un bloc : l’estimation reste en coulisse, seule la charge arrondie en sort.' },
  { notion: 'le report sur le contrat d’un exercice (ses séances non neutres, le cran du moteur)', pr: '53-U1',
    module: 'moteur.js', fonction: 'reportSur', lecteurs: [],
    par: ['consigneNouvelleZone', 'reprisePour'],
    raison: 'la consigne d’une nouvelle zone et « Plus léger » lisent les mêmes séances et le même cran ' +
      '(`chargeVoisine`) : la charge proposée à la carte est celle que la consigne pose ensuite (I35).' },
  { notion: 'la consigne d’une nouvelle zone (l’état `nouvelle_zone`)', pr: '53-U1',
    module: 'moteur.js', fonction: 'consigneNouvelleZone', lecteurs: [],
    par: ['consigneDExercice'],
    raison: 'une étape de la consigne, une seule fois, comme les départs : tout ce qui suit (le plan, ' +
      'la réaction, la suite, le repli) lit la consigne reportée, jamais une charge à part.' },
  // 53-2 (MOTEUR §9.22) — les programmes à cycles : une fonction par notion.
  { notion: 'la semaine du bloc (« semaine k sur N », au calendrier, jamais en séances)', pr: '53-U2',
    module: 'moteur.js', fonction: 'semaineDuBloc', lecteurs: [],
    par: ['badgeDuBloc', 'exercicesEnBloc'],
    raison: 'le badge et « Changer de schéma » lisent la même semaine : le coach ne commente pas l’assiduité.' },
  { notion: 'le début de la décharge planifiée (la dernière semaine du bloc)', pr: '53-U2',
    module: 'moteur.js', fonction: 'debutDecharge', lecteurs: [],
    par: ['dechargePlanifiee', 'carteAllegeeAutorisee', 'dechargeDuJour', 'periodesDecharge'],
    raison: 'la décharge, la carte qui se tait et les périodes du compteur partent du même jour.' },
  { notion: 'la décharge planifiée a lieu (pas de cumul avec une semaine allégée, 14 jours)', pr: '53-U2',
    module: 'moteur.js', fonction: 'dechargePlanifiee', lecteurs: [],
    par: ['dechargeDuJour', 'periodesDecharge'],
    raison: 'MOTEUR §14.4 : une réduction s’applique une fois — le plan (la décharge du jour) et le compteur ' +
      '(ses périodes) le décident par la même règle.' },
  { notion: 'la décharge planifiée du jour (la semaine allégée posée par le programme, sans carte)', pr: '53-U2',
    module: 'moteur.js', fonction: 'dechargeDuJour', lecteurs: ['plan.js', 'app.js'],
    parAilleurs: { 'plan.js': ['escalierDuPlan'], 'app.js': ['semaineAllegeeEnCours'] },
    raison: 'le plan (la séance allégée, le bandeau) et la bibliothèque (la durée allégée) disent la même semaine.' },
  { notion: 'la carte d’une semaine allégée se tait autour d’une décharge planifiée', pr: '53-U2',
    module: 'moteur.js', fonction: 'carteAllegeeAutorisee', lecteurs: [],
    par: ['carteAutorisee'],
    raison: 'la mémoire de l’escalier (`carteAutorisee`) est la seule porte de la carte : la règle y entre, une fois.' },
  { notion: 'les lignes de zone d’un bloc (une par exercice, datées du début, origine « bloc »)', pr: '53-U2',
    module: 'moteur.js', fonction: 'zonesPosees', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['creerBloc'] },
    raison: 'MOTEUR §9.1.2 amendé : la déclaration la plus récente l’emporte — un bloc écrit des lignes datées, ' +
      'lues par `zoneEnVigueur` et `correctionAu` comme les autres ; jamais un troisième étage.' },
  { notion: 'la ligne de zone en vigueur à un instant (la déclaration la plus récente)', pr: '53-U2',
    module: 'moteur.js', fonction: 'ligneDeZoneAu', lecteurs: ['app.js'],
    par: ['zoneEnVigueur', 'correctionAu', 'lignesDArret'],
    parAilleurs: { 'app.js': ['ligneDeZoneDe'] },
    raison: 'une seule lecture des lignes de zone : la séance d’aujourd’hui, une séance passée, et l’arrêt d’un ' +
      'programme (`lignesDArret`, 53-2 ter) lisent la même ligne.' },
  { notion: 'la consigne d’une séance passée, lue à sa fin (la zone qu’elle a vraiment eue)', pr: '54-U1',
    module: 'moteur.js', fonction: 'consigneDeLaSeance', lecteurs: [],
    par: ['zoneDeLaSeance', 'compteurDe'],
    interdit: { motif: /correctionAu\([^)]*\.debut\b/,
                raison: 'la zone d’une séance passée relue à son début (une zone changée pendant la séance ' +
                  'n’y serait pas, 54-0 E)' },
    raison: 'MOTEUR §12.2 bis : une zone changée à l’étiquette pendant la séance est celle de la séance — ' +
      'le compteur et la zone d’une séance la lisent au même instant, sa fin.' },
  { notion: 'la zone d’une séance passée (report, compteur, repli de l’escalier)', pr: '54-U1',
    module: 'moteur.js', fonction: 'zoneDeLaSeance', lecteurs: [],
    par: ['zoneDeLaDerniere', 'consigneDExercice'],
    raison: 'le report de §9.10 et le repli de §14.5 lisaient la zone au début, le compteur à la fin : ' +
      'trois lectures, une règle à deux endroits — une seule fonction désormais.' },
  { notion: 'le bloc suivant (une règle fixe : Mix ↔ Lourd, mêmes durée et exercices, une décharge)', pr: '53-U2',
    module: 'moteur.js', fonction: 'blocSuivant', lecteurs: ['app.js'],
    par: ['carteFinDeBloc'],
    parAilleurs: { 'app.js': ['ouvrirProgramme', 'commencerBlocSuivant'] },
    raison: 'MOTEUR §9.22 : jamais déduit du bloc passé (§20.1) — la carte, « Commencer » et « Ajuster » proposent ' +
      'le même bloc.' },
  { notion: 'les exercices d’un bloc par défaut (les barres polyarticulaires du dossier)', pr: '53-U2',
    module: 'moteur.js', fonction: 'exercicesParDefaut', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouvrirProgramme'] },
    raison: 'une barre, au moins 3 muscles (`estPolyarticulaire`) : la définition du raccourci, lue une fois.' },
  { notion: 'le bilan d’un bloc (première et dernière charge de travail, paris tenus, hors décharge)', pr: '53-U2',
    module: 'moteur.js', fonction: 'bilanDuBloc', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['bilanDe'] },
    raison: 'la carte de fin de bloc et l’observation du pari de programme lisent le même bilan.' },
  { notion: '« Plus léger, plus de reps » appliqué à la consigne (le report de §9.10, sinon le repli de §14.5 ou de §9.9)', pr: '51-U3',
    module: 'moteur.js', fonction: 'consignePlusLegere', lecteurs: ['plan.js'],
    parAilleurs: { 'plan.js': ['planDeSeance'] },
    raison: 'le plan n’applique « Plus léger » que par elle : la ligne du repli choisi, sans ligne haute, ' +
      'et le repli d’escalier par `consigneRepli` (qu’I22 vérifie).' },
  { notion: 'la zone suivante en reps (« Plus léger, plus de reps »)', pr: '51-U3',
    module: 'moteur.js', fonction: 'zonePlusDeReps', lecteurs: [],
    par: ['reprisePour'],
    raison: 'lourd → mix → hypertrophie → volume → séries longues, dans l’ordre de la table des ' +
      'zones : une définition, que la carte et la correction de zone lisent.' },
  { notion: 'les séries par muscle (un principal la série entière, un secondaire pour moitié, un stabilisateur pour un quart)', pr: '55-U1',
    module: 'semaine.js', fonction: 'volumeParMuscle', lecteurs: ['bilan.js'],
    par: ['semainesDeVolume', 'volumeParZone'],
    parAilleurs: { 'bilan.js': ['bilanDuMois'] },
    raison: 'REGLE-VOLUME et MOTEUR §9.23 (H2, #371) : le bloc Volume et le bilan du mois comptent les séries ' +
      'par muscle par la même fonction — deux définitions d’une même grandeur, c’est ce que UN-SEUL-FIL interdit.' },
  // ── 65 — LE POIDS D'UN MUSCLE (REGLE-VOLUME §1 bis, v2_069) : une table, lue par le coach et le jeu ──
  { notion: 'le poids d’un muscle dans une série (principal 1, secondaire ½, stabilisateur ¼)', pr: '65-U1',
    module: 'semaine.js', fonction: 'musclesPonderes', lecteurs: ['jeu.js', 'generateur.js'],
    par: ['volumeParMuscle', 'apportsParMuscle'],
    raison: 'REGLE-VOLUME §1 bis (65) : UNE table de poids (`POIDS_DES_MUSCLES`), lue par le coach (le volume, la fenêtre ' +
      '« d’où vient ce chiffre ») et par le jeu (les points des muscles) ; une seconde table finirait par dire autre chose. ' +
      '66A : la relecture de la semaine (§5 ter.1) compte les séries d’une routine par muscle avec ces poids.' },
  { notion: 'la fin effective d’une séance (sans heure de fin : 3 h au plus, jamais après la suivante)', pr: '55-U1',
    module: 'moteur.js', fonction: 'finEffective', lecteurs: [],
    par: ['consigneDeLaSeance'],
    raison: 'MOTEUR §12.2 bis (G2) : la zone d’une séance se lit à sa fin ; sans heure de fin, une borne, ' +
      'une fois — sinon une zone changée entre deux séances comptait pour la précédente.' },
  { notion: 'la table par reps cumulée (la charge la plus lourde pour au moins N reps)', pr: '55-U1',
    module: 'modele.js', fonction: 'tableCumulee', lecteurs: [],
    par: ['tableParReps', 'recordsBattus', 'recordsDeLExercice'],
    raison: 'MOTEUR §9.23, ECRAN §7 bis.16 (« cumulée, jamais brute ») : la médaille, le tableau des records, ' +
      'le record de charge de la page et le chiffre d’une ligne déduite lisent la même table.' },
  { notion: 'les records d’un exercice à une date (le périmètre de la médaille)', pr: '55-U1',
    module: 'modele.js', fonction: 'recordsDeLExercice', lecteurs: ['app.js', 'faits.js'],
    par: ['tableauDesRecords'],
    parAilleurs: { 'app.js': ['rendreExercice'], 'faits.js': ['ceQueJeSais'] },
    raison: 'MOTEUR §9.23 : le record de charge de la page, son 1RM estimé et le tableau des records lisent ' +
      'la même table cumulée, sur le même périmètre que la médaille (12 mois pour un matériel de salle). ' +
      '60-2a : « Ce que je sais » montre le maximum de chaque barre par cette même fonction — jamais une seconde.' },
  { notion: 'le périmètre d’un record (12 mois pour un matériel de salle, toute la vie ailleurs)', pr: '55-U1',
    module: 'modele.js', fonction: 'seancesDuPerimetre', lecteurs: ['app.js'],
    par: ['recordsDeLExercice'],
    parAilleurs: { 'app.js': ['rendreExercice'] },
    raison: 'MOTEUR §9.23 et ECRAN §7 quater.3 (H3, #371) : le tableau des records, le record de charge et la ' +
      'table par reps d’une page lisent le même périmètre — une page n’en montre jamais deux.' },
  { notion: 'le 1RM estimable (3 à 10 reps, une charge soulevée, jamais au poids du corps)', pr: '55-U1',
    module: 'modele.js', fonction: 'estimable1RM', lecteurs: [],
    par: ['recordsBattus', 'recordsDeLExercice'],
    raison: 'ECRAN §7 bis.15 : hors de 3 à 10 reps, l’estimation n’est pas fiable ; la médaille et la page ' +
      'disent la même plage.' },
  { notion: 'les records battus par une série (et l’ancien record, avec sa date)', pr: '55-U1',
    module: 'modele.js', fonction: 'recordsBattus', lecteurs: ['faits.js'],
    parAilleurs: { 'faits.js': ['recordsDeLaSerie', 'recordsDeLaSeance'] },
    raison: 'MOTEUR §9.23 : un record est un fait ; une seule fonction décide ce qu’une série bat, ' +
      'la médaille en séance, la feuille « Terminer » et Progression la lisent.' },
  { notion: 'la phrase de la médaille ([gras, gris])', pr: '55-U1',
    module: 'modele.js', fonction: 'phraseDeRecord', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['medailleSurLigne'] },
    raison: 'MOTEUR §9.23 : les mots de la médaille, une fois — le cap rond, la charge pour N reps, le 1RM ' +
      'estimé, le volume, la durée, et le record d’avant avec sa date.' },
  { notion: 'le 1RM estimé (Epley)', pr: '55-U1',
    module: 'moteur.js', fonction: 'unRMEpley', lecteurs: ['modele.js'],
    par: ['reportDeZone'],
    parAilleurs: { 'modele.js': ['recordsBattus', 'recordsDeLExercice'] },
    raison: 'MOTEUR §9.10 et §9.23 : l’estimation du report et le record « 1RM estimé » lisent la même ' +
      'formule — jamais recopiée.' },
  { notion: 'la fenêtre des 12 mois d’un matériel (machines, poulies, haltères, Smith)', pr: '55-U1',
    module: 'moteur.js', fonction: 'plancherDuMateriel', lecteurs: ['modele.js'],
    par: ['chargeVoisine'],
    parAilleurs: { 'modele.js': ['recordsBattus', 'seancesDuPerimetre'] },
    raison: 'MOTEUR §10.2 et §9.23 : la charge voisine du coach et les records comparent sur la même ' +
      'liste de matériels et la même fenêtre — un seul câblage.' },
  { notion: 'l’occurrence coachée d’un exercice (la première, ou celle qui porte ses paris)', pr: 'correctif 04/10/2026',
    module: 'seance.js', fonction: 'occurrenceCoachee', lecteurs: ['plan.js', 'app.js'],
    parAilleurs: { 'plan.js': ['planDeSeance'], 'app.js': ['occurrenceLibre'] },
    raison: 'prérequis d’« adapter » : un exercice deux fois dans la séance, le coach en suit une ; ' +
      'le plan et l’écran (en-tête, étiquette, constat) le décident par la même règle.' },
  { notion: 'les paris d’une occurrence (un exercice deux fois, sans paris mélangés)', pr: 'correctif 04/10/2026',
    module: 'seance.js', fonction: 'parisDeLOccurrence', lecteurs: ['plan.js', 'app.js'],
    parAilleurs: { 'plan.js': ['planDeSeance', 'verifierPlan'], 'app.js': ['dejaNote', 'observerSerie'] },
    raison: 'prérequis d’« adapter » : le plan, I7, « déjà noté » et l’observation lisaient les paris par ' +
      '(séance, exercice) — la seconde occurrence se serait figée sur les paris de la première.' }
,
  // ── 58-1 — LE MODULE DES FAITS (`faits.js`, « un seul fil ») ─────────────
  // L'assemblage des faits quittait `app.js` : un écran les LIT, il ne les
  // assemble plus (la garde « un fait ne se déclare que dans `faits.js` »,
  // plus bas, refuse une seconde déclaration ailleurs).
  { notion: 'les séances avec leurs séries (le cache groupé par séance, trié par rang)', pr: '58-U1',
    module: 'faits.js', fonction: 'seancesAvecSeries', lecteurs: ['app.js'],
    par: ['seancesDuSlug', 'recordsDuMois', 'dernierRecord', 'programmeDeduit'],
    parAilleurs: { 'app.js': ['bilanDuMoisDe'] },
    raison: 'UN-SEUL-FIL : le bilan du mois, ses records et le dernier record lisent le même groupement, ' +
      'avec le même mémo — un second groupement dirait une autre séance.' },
  { notion: 'les séances d’un exercice, pour ses records (`{ id, debut, series }`)', pr: '58-U1',
    module: 'faits.js', fonction: 'seancesDuSlug', lecteurs: [],
    par: ['recordsDeLaSeance'],
    raison: 'MOTEUR §9.23 : une série passée se compare aux séances de son exercice, lues une fois ' +
      'par état du cache ; seul le module des faits les assemble.' },
  { notion: 'les séances d’un exercice, pour le coach et sa page (`{ seance, series }`)', pr: '58-U1',
    module: 'faits.js', fonction: 'seancesDeLExercice', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['derniereSeanceDe', 'consigneDe', 'suiteDe', 'rendreExercice'] },
    raison: 'la consigne, la suite, « Dernière séance » et la page d’exercice lisent le même historique ' +
      'd’un exercice ; un second assemblage dans l’écran pourrait en oublier une séance.' },
  { notion: 'les records d’une séance passée (ses séries médaillées)', pr: '58-U1',
    module: 'faits.js', fonction: 'recordsDeLaSeance', lecteurs: [],
    par: ['recordsDuMois', 'dernierRecord', 'journalDeLaSeance'],
    raison: 'MOTEUR §9.23 : un record est un fait ; le mois et le dernier record lisent les records ' +
      'd’une séance par la même fonction, au même mémo.' },
  { notion: 'les records d’un mois (dans l’ordre des séances)', pr: '58-U1',
    module: 'faits.js', fonction: 'recordsDuMois', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProgression', 'rendreMois', 'rendreRecordsDuMois'] },
    raison: 'MOTEUR §9.23 : le bloc Records, le bilan du mois et la liste des records du mois disent ' +
      'le même compte — le jeu les lira là aussi.' },
  { notion: 'le dernier record (la dernière série médaillée)', pr: '58-U1',
    module: 'faits.js', fonction: 'dernierRecord', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProgression'] },
    raison: 'MOTEUR §9.23 : « Le dernier » du bloc Records est un fait, assemblé une fois.' },
  { notion: 'l’historique d’un exercice pendant la séance (sans la séance en cours)', pr: '58-U1',
    module: 'faits.js', fonction: 'historiqueDesRecords', lecteurs: [],
    par: ['recordsDeLaSerie'],
    raison: 'MOTEUR §9.23 : la médaille compare une série à l’historique sans la séance en cours, ' +
      'lu une fois par exercice et par état.' },
  { notion: 'la séance en cours telle que les records la lisent (ses séries validées)', pr: '58-U1',
    module: 'faits.js', fonction: 'seanceDesRecords', lecteurs: [],
    par: ['recordsDeLaSerie', 'recordsDuJour'],
    raison: 'MOTEUR §9.23 : la médaille et la feuille « Terminer » lisent les mêmes séries validées, ' +
      'dans le même ordre.' },
  { notion: 'les records d’une série de la séance en cours (la médaille)', pr: '58-U1',
    module: 'faits.js', fonction: 'recordsDeLaSerie', lecteurs: ['app.js'],
    par: ['recordsDuJour', 'journalDuJour'],
    parAilleurs: { 'app.js': ['medailleSurLigne'] },
    raison: 'MOTEUR §9.23 : la médaille sous une rangée et la feuille « Terminer » lisent le même ' +
      'calcul.' },
  { notion: 'les records du jour (la feuille « Terminer »)', pr: '58-U1',
    module: 'faits.js', fonction: 'recordsDuJour', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreFeuilleFin'] },
    raison: 'MOTEUR §9.23 : les records d’une séance qu’on termine — le jeu les lira à « Terminer ».' },
  { notion: 'la semaine affichée (ses jours, séances, séries, bilan, zones)', pr: '58-U1',
    module: 'faits.js', fonction: 'semaineDe', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['semaineCourante'] },
    raison: 'UN-SEUL-FIL : Séances, Progression et la vue Volume lisent la même semaine ; l’écran ne ' +
      'retient que le lundi affiché.' },
  { notion: 'les exercices faits et la date de leur dernière séance', pr: '58-U1',
    module: 'faits.js', fonction: 'datesDesExercices', lecteurs: ['app.js'],
    par: ['compterExercices'],
    parAilleurs: { 'app.js': ['rendreMesExercices'] },
    raison: 'PR 6 : « fait » a une définition (`exercicesFaits`) ; sa date et son compte s’assemblent ' +
      'une fois, avec leur oubli explicite.' },
  { notion: 'le compte des exercices faits (le profil)', pr: '58-U1',
    module: 'faits.js', fonction: 'compterExercices', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProfilEcran'] },
    raison: 'PR 6 : le profil dit « N déjà faits » par le même balayage que Mes exercices.' },
  // ── 58-2 — LE JOURNAL DES RECORDS (MOTEUR §9.23, `v2_061`, `v2_062`) ──────
  // Le journal ne calcule rien : ses lignes sortent des deux fonctions des
  // records d'une séance, et il se LIT ici, nulle part ailleurs. Il s'écrit
  // par la file seule (garde « un seul écrivain », plus bas).
  { notion: 'les lignes du journal de la séance qu’on termine ou qu’on corrige', pr: '58-U2',
    module: 'faits.js', fonction: 'journalDuJour', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ecrireJournalDeSeance'] },
    raison: 'MOTEUR §9.23 (58-2) : le journal garde ce que la feuille « Terminer » affiche — la même ' +
      'fonction (`recordsDeLaSerie`), aucun recalcul à part, à « Terminer » comme en Édition.' },
  { notion: 'les lignes du journal d’une séance passée (le remplissage de l’historique)', pr: '58-U2',
    module: 'faits.js', fonction: 'journalDeLaSeance', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['remplirJournal'] },
    raison: 'MOTEUR §9.23 (58-2) : l’historique se remplit une fois, avec la fonction des records ' +
      'd’une séance passée — celle du bilan et du dernier record.' },
  { notion: 'la lecture du journal des records (le jeu, plus tard le social)', pr: '58-U2',
    module: 'faits.js', fonction: 'recordsDuJournal', lecteurs: [],
    raison: 'MOTEUR §9.23 (58-2) : les lecteurs lisent le journal, jamais un recalcul — et le lisent ' +
      'ici. Aucun écran ne le lit encore : le jeu viendra.' },
  // ── 60-2a — LE QUESTIONNAIRE DU COACH MONTRE, IL NE DEMANDE PAS ───────────
  { notion: 'ce que les séances savent de la personne (historique, rythme, durée habituelle, maximums, autres activités)', pr: '60-U1',
    module: 'faits.js', fonction: 'ceQueJeSais', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['actualiserFaitsDuQuestionnaire', 'dureeHabituelleDesSeances'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §1.2 : rien de ce que les séries savent n’est demandé, c’est montré — ' +
      'l’écran « Ce que je sais » et la durée habituelle de l’écran « Temps » lisent ce fait, aucun ne recompte.' },
  // ── 60-2a — « JUSTE UN CARNET » SE TAIT PARTOUT, D'UNE SEULE VOIX ─────────
  { notion: 'le silence du coach au profil (« Juste un carnet », MOTEUR I13 : le plan, la semaine allégée annoncée, le badge et la carte de fin de bloc)', pr: '60-U2',
    module: 'moteur.js', fonction: 'coachSeTait', lecteurs: ['plan.js', 'app.js'],
    parAilleurs: { 'plan.js': ['planDeSeance', 'verifierSilenceDuProgramme'],
                   'app.js': ['semaineAllegeeEnCours', 'programmeDuDossierCalcule', 'rendreBandeauPhase'] },
    // La forme écrite à la main, hors du moteur : l'intention du PROFIL comparée à
    // « entretien » (`profil.intention === 'entretien'`), ou `intentionDe` appelée
    // avec le profil seul (`intentionDe(profil && profil.intention, null)`).
    interditAilleurs: { motif: /\bprofil\s*(?:&&\s*profil\s*)?\.\s*intention\s*[!=]==?\s*(['"])entretien\1|\bintentionDe\s*\(\s*profil\b[^()]*,\s*null\s*\)/,
      raison: 'le silence du coach au profil se lit par `Moteur.coachSeTait`, jamais par un second test de `intention` écrit à la main' },
    raison: 'MOTEUR I13 (précisé le 07/10/2026, 60-2a) : au profil « Juste un carnet », le plan, la semaine ' +
      'allégée annoncée sur une routine, le badge de bloc et la carte de fin de bloc lisent le MÊME fait. ' +
      'Le badge et la carte vivent hors de `planDeSeance` : un second test de l’intention les aurait fait diverger.' },
  { notion: 'la préparation des champs d’une réponse du profil (objectif daté, phase datée, année, priorités, « fait »)', pr: '60-U3',
    module: 'profil.js', fonction: 'preparerChamps', lecteurs: ['questionnaire.js', 'app.js'],
    parAilleurs: { 'questionnaire.js': ['champsDeLEcran'], 'app.js': ['ecrireReponse'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §6 : le questionnaire (un écran à la fois) et le Profil (une ligne à la ' +
      'fois) écrivent la même chose — `objectif_depuis` suit un objectif qui change, une réponse inchangée ' +
      'n’écrit rien. Deux préparations auraient fini par dater différemment.' },
  // ── 60-2b — LES LECTEURS DE L'OBJECTIF ────────────────────────────────────
  { notion: 'la zone proposée pour le premier bloc d’un programme (elle suit l’objectif, MOTEUR §9.22)', pr: '60-U4',
    module: 'moteur.js', fonction: 'zoneDuPremierBloc', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouvrirProgramme'] },
    raison: 'MOTEUR §9.22 (60-2b) : Force et Les deux proposent Lourd, le reste Mix. `ouvrirProgramme` écrivait ' +
      'Mix d’office ; la règle vit dans le moteur, l’écran ne la recopie pas.' },
  { notion: 'l’objectif gelé de la séance (lu une fois, avec la phase ; entre dans le fondement des paris, I40)', pr: '60-U5',
    module: 'profil.js', fonction: 'objectifGele', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['objectifDeLaSeance'] },
    raison: 'MOTEUR §9.16 (60-2b) : jumeau de la phase gelée. Lu en direct, un changement d’objectif dans Profil ' +
      'en pleine séance ferait dériver les paris d’une même séance (I40) ; `null` est une valeur, pas une absence.' },
  { notion: 'les priorités gelées de la séance (lues une fois, avec la phase ; décident la place d’un muscle prioritaire)', pr: '60-U6',
    module: 'profil.js', fonction: 'prioritesGelees', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['prioritesDeLaSeance'] },
    raison: 'MOTEUR §14.6 (60-2b) : jumelle de la phase gelée. Lues en direct, cocher une priorité dans Profil en ' +
      'pleine séance ferait apparaître ou disparaître une carte de série de plus (I12 : le mémo du plan ne voit pas le profil).' },
  { notion: 'le rappel de phase (une phase déclarée dont la dernière réponse date de 42 jours ou plus)', pr: '60-U7',
    module: 'profil.js', fonction: 'rappelDePhase', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreBandeauPhase'] },
    raison: 'MOTEUR §9.16 (60-2b) : le seuil des 42 jours et le choix de la date (`phase_confirmee_le`, sinon ' +
      '`phase_depuis`) vivent dans une règle pure ; le bandeau de Saisie la lit, il ne recalcule pas l’âge d’une phase.' },
  { notion: 'ce que la réponse « temps » déclenche sur une routine (la carte d’office pour « moins », l’ambre pour « varie »)', pr: '60-U8',
    module: 'moteur.js', fonction: 'reponseDeTemps', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['tempsDeLaRoutine'] },
    raison: 'MOTEUR §9.18 (60-2b) : la condition (durée visée déclarée, estimation au-dessus, pas de carnet) et ce que chaque ' +
      'réponse en fait vivent dans le moteur ; `tempsDeLaRoutine` la lit, ni l’écran ni la rangée ne comparent une durée à la main.' },
  // ── 60-3 — LE PROGRAMME DÉDUIT (QUESTIONNAIRE-COACH-V2 §5) ────────────────
  { notion: 'les séances qui reviennent (la règle du programme déduit : fenêtre, signature, regroupement, médianes, nom, récence)', pr: '60-U9',
    module: 'routines.js', fonction: 'seancesQuiReviennent', lecteurs: ['faits.js'],
    parAilleurs: { 'faits.js': ['programmeDeduit'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 (60-3) : le portage de `deduire()` (`deduit60b.py`), prouvé par ses cas. ' +
      'Une seule règle : l’écran 8 et la ligne de Routines ouvrent la même feuille, sur les mêmes routines.' },
  { notion: 'les faits du programme déduit (les séances, leur titre, leurs séries, la mesure de chaque exercice)', pr: '60-U9',
    module: 'faits.js', fonction: 'programmeDeduit', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['ouvrirSeancesQuiReviennent'] },
    raison: 'UN-SEUL-FIL (60-3) : la règle reçoit ses faits du module des faits, le groupement du bilan ; ' +
      'un écran qui assemblerait ses séances à part pourrait en oublier une.' },
  { notion: 'la structure d’une routine déduite (celle de « En faire une routine »)', pr: '60-U9',
    module: 'routines.js', fonction: 'routineDeduite', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['creerDansUnDossier'] },
    raison: 'ECRAN-SAISIE §7 quindecies.7 (60-3) : chaque routine cochée devient la structure de « En faire une ' +
      'routine » — les mêmes blocs, les mêmes repos et leur origine, jamais une charge. Pas une seconde règle des repos.' },
  // ── 60-3 — « REMPLACER » DANS L'ÉDITEUR (ECRAN-SAISIE §7 quindecies.8) ───
  { notion: 'le remplaçant d’un exercice de routine (à sa place, son groupe, ses séries, sans la charge de départ)', pr: '60-U10',
    module: 'routines.js', fonction: 'exerciceRemplace', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['remplacerDansLEditeur'] },
    raison: 'ES §7 quindecies.8 (60-3) : le frère et le catalogue remplacent par la même fonction — même rang, même ' +
      'superset (§7 decies), mêmes séries et repos, la charge de départ retirée (MOTEUR §9.21).' },
  // ── 60-3b — LE PSEUDO TRAVERSE LA CONFIRMATION D'E-MAIL (ECRAN-PROFIL §3.1) ─
  { notion: 'le pseudo posé à la création de la ligne de profil (celui de la page, sinon celui des données du compte)', pr: '60-U11',
    module: 'profil.js', fonction: 'pseudoDeLInscription', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['chargerProfil'] },
    raison: 'ECRAN-PROFIL §3.1 (60-3b) : le lien de confirmation s’ouvre souvent dans une autre page, où la mémoire ' +
      'de l’inscription n’existe plus. UN SEUL ENDROIT choisit — et valide : les données d’un compte sont modifiables ' +
      'par son propriétaire, un pseudo qui n’en est pas un est ignoré.' },
  { notion: 'la ligne « Pseudo » du Profil (et sa phrase « pris entre-temps »)', pr: '60-U11',
    module: 'profil.js', fonction: 'lignePseudo', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['rendreProfilEcran'] },
    raison: 'ECRAN-PROFIL §3.1 (60-3b) : la phrase « Ce pseudo vient d’être pris » se dit tant qu’aucun pseudo n’est ' +
      'posé ; elle vit avec la ligne, l’écran ne la compose pas.' },
  // ── 60-4 — LE PROGRAMME CONSTRUIT (QUESTIONNAIRE-COACH-V2 §5 bis) ─────────
  { notion: 'la fenêtre de la personne (les 84 jours qui finissent à SA dernière séance, pas aujourd’hui)', pr: '60-U12',
    module: 'routines.js', fonction: 'fenetreDeLaPersonne', lecteurs: ['faits.js'],
    par: ['seancesQuiReviennent'],
    raison: 'QUESTIONNAIRE-COACH-V2 §5 (60-3) : le programme déduit et l’historique du programme construit (60-4) ' +
      'lisent la MÊME fenêtre ; deux fenêtres écrites à la main finiraient par ne plus se recouvrir.' },
  { notion: 'l’historique du programme construit (par exercice, le nombre de séances de travail sur la fenêtre de la personne)', pr: '60-U12',
    module: 'faits.js', fonction: 'historiqueDesExercices', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['entreeDuProgramme'] },
    raison: 'QUESTIONNAIRE-COACH-V2 §5 bis (60-4) : le générateur ordonne ses candidats par ce que la personne fait ' +
      'le plus ; le fait vit dans le module des faits (58-1) et le générateur le REÇOIT, il ne relit pas les séances.' },
  { notion: 'les exercices écartés en fin de liste (le catalogue, les frères de « Machine prise » et de « Remplacer »)', pr: '60-U14',
    module: 'profil.js', fonction: 'ecartesALaFin', lecteurs: ['app.js'],
    par: ['rangerParMateriel'],
    parAilleurs: { 'app.js': ['freresDe'] },
    raison: 'ECRAN-SAISIE §7 quindecies.9 (60-4) : un exercice écarté passe en fin de liste, jamais caché, avec la mention ' +
      '« écarté » — la règle « range, ne cache jamais » du matériel, composée, pas un second tri : le catalogue passe par ' +
      '`rangerParMateriel`, les frères par `freresDe`.' },
  { notion: 'la carte « Passer en cycles » (Force ou Les deux, 21 jours, 6 séances du dossier, une seule fois)', pr: '60-U15',
    module: 'generateur.js', fonction: 'carteCycles', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['carteCyclesDuProfil'] },
    raison: 'MOTEUR §9.22 (60-4) : les seuils (21 jours, 6 séances), l’objectif et les silences se décident une fois, dans le ' +
      'générateur ; la carte de Saisie lit son verdict, comme le rappel de phase lit `rappelDePhase`.' },
  { notion: 'les séances faites depuis les routines d’un dossier (le compte de la carte « Passer en cycles »)', pr: '60-U15',
    module: 'faits.js', fonction: 'seancesDesRoutines', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['carteCyclesDuProfil'] },
    raison: 'UN-SEUL-FIL (60-4) : l’appartenance d’une séance à un dossier se lit sur `routine_id`, dans le module des faits ; ' +
      'un écran qui compterait à part pourrait compter une séance importée ou une séance d’avant la création.' },
  { notion: 'les jours calendaires écoulés depuis la création du programme construit', pr: '60-U15',
    module: 'profil.js', fonction: 'joursDepuis', lecteurs: ['app.js', 'generateur.js'],
    parAilleurs: { 'app.js': ['carteCyclesDuProfil'] },
    raison: 'MOTEUR §9.22 (60-4) : 21 jours CALENDAIRES (le changement d’heure ne les change pas), la même arithmétique que ' +
      'le rappel de phase (`jourCalendaire`) — pas une soustraction de millisecondes à l’écran. 66A : « pas encore ' +
      'dépassé » (§5 ter.3, un record d’au moins 12 mois) se compte de même.' },
  { notion: 'la durée que le programme construit doit tenir (la durée déclarée, avec « C’est mon maximum », « Moins en ce moment » ou « Ça varie »)', pr: '60-U13',
    module: 'moteur.js', fonction: 'cibleDuProgramme', lecteurs: ['app.js'],
    parAilleurs: { 'app.js': ['raccourcirLeProgramme'] },
    raison: 'MOTEUR §9.18 (G8, 60-4) : quelles réponses de temps font raccourcir le programme, et à quelle durée, se décide ' +
      'une fois dans le moteur ; l’app lit le résultat et passe par `raccourcirRoutine`, elle ne teste pas `temps_reponse`.' },
  // ── 64A — LE JEU (JEU-V1) : il lit les faits, le coach ne le lit jamais ───
  { notion: 'les faits du jeu (séances, séries de travail, catalogue, journal, maximums des barres, exercices faits)', pr: '64-U1',
    module: 'faits.js', fonction: 'faitsDuJeu', lecteurs: ['app.js'],
    raison: 'JEU-V1 §8 (64A) : le jeu lit les faits, il ne les recompte pas — son entrée s’assemble une fois, dans le ' +
      'module des faits, avec les fonctions qu’il a déjà (le journal, les maximums, les exercices faits). 64B : l’écran ' +
      'du jeu (`app.js`) l’assemble pour l’onglet et, avec la séance en cours, pour la feuille « Terminer ».' },
  { notion: 'l’état du jeu (série et gels, muscles, XP, niveau, succès, titres, cadres, le plus proche)', pr: '64-U1',
    module: 'jeu.js', fonction: 'etatDuJeu', lecteurs: ['app.js'],
    raison: 'JEU-V1 (64A) : un seul calcul du jeu, pur, depuis l’historique ; aucun écran ne le refait. 64B : `app.js` ' +
      'le calcule (avec sa mémoire) pour l’onglet Jeu, le Profil et la feuille « Terminer » ; le rendu reçoit l’état.' },
  // ── 64B — LES ÉCRANS DU JEU (JEU-V1 §9) : un écran ne refait ni la vitrine, ni l'apport, ni « le plus proche » ──
  // `motif` : l'APPEL seulement — `vue.vitrine`, `jeu.apport`, `vue.jauges` sont des champs que le rendu lit.
  { notion: 'la description d’un succès (catégorie, palier, rareté, points)', pr: '64-U2',
    module: 'jeu.js', fonction: 'descriptionDuSucces', lecteurs: ['app.js'], motif: /\.\s*descriptionDuSucces\s*\(/g,
    raison: 'JEU-V1 §9.5 : tirée des tables du module ; l’écran nomme un succès (vitrine, feuille) sans recopier les paliers.' },
  { notion: 'la vitrine (trois succès, les plus rares, à égalité le plus tard)', pr: '64-U2',
    module: 'jeu.js', fonction: 'vitrine', lecteurs: ['app.js'], motif: /\.\s*vitrine\s*\(/g,
    raison: 'JEU-V1 §9.3 : la vitrine est automatique ; un écran qui la referait pourrait en choisir d’autres.' },
  { notion: 'l’apport d’une séance (XP, niveau, muscles qui montent, succès gagnés, points)', pr: '64-U2',
    module: 'jeu.js', fonction: 'apport', lecteurs: ['app.js'], motif: /\.\s*apport\s*\(/g,
    raison: 'JEU-V1 §9.4 : la feuille « Terminer » compare deux états du jeu par le module, jamais à la main.' },
  { notion: 'le plus proche (les trois plus grands `fait`)', pr: '64-U2',
    module: 'jeu.js', fonction: 'lesPlusProches', lecteurs: ['app.js'], motif: /\.\s*lesPlusProches\s*\(/g,
    raison: 'JEU-V1 §9.2 : un écran qui prendrait les trois premiers de la liste dirait autre chose que le jeu.' },
  { notion: 'les succès par catégorie (obtenus, total, prochain)', pr: '64-U2',
    module: 'jeu.js', fonction: 'parCategorie', lecteurs: ['app.js'], motif: /\.\s*parCategorie\s*\(/g,
    raison: 'JEU-V1 §9.2 : les totaux viennent des tables du module (la randonnée compte la grande sortie).' },
  { notion: 'les titres et les cadres détaillés (obtenus, affiché, le muscle le plus bas)', pr: '64-U2',
    module: 'jeu.js', fonction: 'titresEtCadresDetailles', lecteurs: ['app.js'], motif: /\.\s*titresEtCadresDetailles\s*\(/g,
    raison: 'JEU-V1 §9.2 : Succès et Déblocages lisent le jeu, ils ne recomptent pas les titres.' },
  { notion: 'les jauges (la part faite du niveau en cours)', pr: '64-U2',
    module: 'jeu.js', fonction: 'jauges', lecteurs: ['app.js'], motif: /\.\s*jauges\s*\(/g,
    raison: 'JEU-V1 §9.2 : le coût d’un niveau reste dans le module ; l’écran ne le recalcule pas.' },
  { notion: 'les tables du jeu, en lecture (paliers, raretés, titres, cadres, gels)', pr: '64-U2',
    module: 'jeu.js', fonction: 'tables', lecteurs: ['app.js'], motif: /\bJeu\s*\.\s*tables\s*\(/g,
    raison: 'JEU-V1 §9.5 : une copie des tables du module — les vues disent les conditions sans les recopier.' },
  { notion: 'le jeu allumé (`profiles.jeu_actif`, absent = allumé)', pr: '64-U2',
    module: 'profil.js', fonction: 'jeuActif', lecteurs: ['app.js'],
    raison: 'JEU-V1 §9.1 : l’onglet, le Profil, la feuille et la garde des routes lisent le même fait ; un second test ' +
      'de `jeu_actif === false` écrit à la main dirait autre chose au premier démarrage (colonne absente).' },
  // ── 66A — LE COACH RELIT TA SEMAINE (QUESTIONNAIRE-COACH-V2 §5 ter) ───────
  { notion: 'le fait des barres du bilan (record, série récente, semaines, séries lourdes, variantes à la barre)', pr: '66-U1',
    module: 'faits.js', fonction: 'barresDuBilan', lecteurs: [],
    raison: 'QUESTIONNAIRE-COACH-V2 §5 ter.2 (66A) : la relecture de la semaine REÇOIT ce fait, elle ne relit pas les ' +
      'séances ; le record est celui de la page de l’exercice (`recordsDeLExercice(...).lourde`). Aucun lecteur encore : ' +
      'l’écran de 66B (`app.js`) assemblera l’entrée.' },
  { notion: 'le repère squat ÷ couché, par sexe (la barre en retard, Force et Les deux)', pr: '66-U1',
    module: 'generateur.js', fonction: 'relireSemaine', lecteurs: [],
    raison: 'QUESTIONNAIRE-COACH-V2 §5 ter.3 (66A) : 1,2 pour un homme, 1,6 pour une femme — le bas des moyennes de ' +
      'compétition (van den Hoek et al. 2024, J Sci Med Sport) ; une table (`RATIO_SQUAT_COUCHE`), lue par la seule ' +
      'relecture, jamais hors Force et Les deux (R4). Aucun lecteur encore : l’écran de 66B lira la relecture.' }
];

// ── 58-1 — UN FAIT NE SE DÉCLARE QUE DANS `faits.js` ─────────────────────────
// Les noms des faits assemblés par le module : aucun autre fichier servi ne
// déclare une fonction de ce nom. Un écran qui reconstruirait « son »
// `dernierRecord` à côté du module se voit ici, même s'il n'appelle rien.
const FAITS = NOTIONS.filter((n) => n.module === 'faits.js').map((n) => n.fonction);

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
    const modules = { 'moteur.js': require('../../v2/js/moteur.js'), 'seance.js': require('../../v2/js/seance.js'),
      'generateur.js': require('../../v2/js/generateur.js') };
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
    // Après la consolidation (49-U20) : une notion porte le geste du chantier
    // qui l'a introduite (« 49-U20 »), ou la date d'un correctif hors chantier
    // (« correctif 03/10/2026 », le signe moins de l'assistance).
    expect(NOTIONS.filter((n) => prs.indexOf(n.pr) < 0 && !/^\d+-U\d+$/.test(n.pr) &&
      !/^correctif \d{2}\/\d{2}\/\d{4}$/.test(n.pr)).map((n) => n.notion)).toEqual([]);
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

  test('l’interdit des frères se lit vraiment : `mouvement` lu hors de `freresDe` se voit, la colonne nommée non', () => {
    const n = NOTIONS.filter((x) => x.fonction === 'freresDe')[0];
    const voit = (t) => n.interditAilleurs.motif.test(t);
    expect(voit('if (a.mouvement === b.mouvement) return true;')).toBe(true);
    expect(voit("var m = e['mouvement'];")).toBe(true);
    expect(voit("select('slug, nom, mouvement')")).toBe(false);
    expect(voit('Modele.freresDe(index, slug)')).toBe(false);
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

  test('l’interdit du silence du coach se lit vraiment : un second test de l’intention se voit, l’appel au fait non', () => {
    const n = NOTIONS.filter((x) => x.fonction === 'coachSeTait')[0];
    const voit = (t) => n.interditAilleurs.motif.test(t);
    expect(voit("if (profil && profil.intention === 'entretien') return {};")).toBe(true);
    expect(voit("if (profil.intention !== \"entretien\") return;")).toBe(true);
    expect(voit("if (Moteur.intentionDe(profil && profil.intention, null) === 'entretien') return false;")).toBe(true);
    expect(voit('if (Moteur.coachSeTait(profil && profil.intention)) return {};')).toBe(false);
    expect(voit("var i = Moteur.intentionDe(profil && profil.intention, modeDe(slug));")).toBe(false);
    expect(voit("if (plan.intention === 'entretien') {")).toBe(false);   // le VÉRIFICATEUR lit le plan, pas le profil
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

describe('architecture — le module des faits : un fait ne se déclare que dans faits.js (58-1)', () => {
  const FICHIERS = perimetre();

  test('les faits du module : vingt-deux (treize en 58-1, trois du journal en 58-2, un du questionnaire en 60-2a, un du programme déduit en 60-3, deux du programme construit en 60-4, un du jeu en 64A, un du bilan en 66A), chacun déclaré et exporté par faits.js', () => {
    global.self = global;
    require('../../v2/js/modele.js');
    require('../../v2/js/semaine.js');
    require('../../v2/js/bilan.js');
    require('../../v2/js/palier.js');
    require('../../v2/js/moteur.js');
    require('../../v2/js/seance.js');
    require('../../v2/js/periode.js');
    const instance = require('../../v2/js/faits.js').creer();
    expect(FAITS.length).toBe(22);
    expect(FAITS.filter((fn) => typeof instance[fn] !== 'function')).toEqual([]);
  });

  test('⚠️ aucun autre fichier servi ne déclare une fonction d’un fait', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'faits.js') return;
      const code = nettoyer(f.src, false);
      FAITS.forEach((fn) => {
        if (corpsDe(code, fn) !== null) fautes.push('`' + fn + '` est déclarée dans ' + f.nom + ' : un fait s’assemble dans faits.js, l’écran le lit.');
      });
    });
    expect(fautes).toEqual([]);
  });

  // ⚠️ LE PIÈGE DU HISSAGE (trouvé par le banc des routines, 58-1). Un `var
  // faits = 0;` local dans `rendreMesExercices` masquait l'instance du module :
  // hissé, il valait `undefined` à l'appel de `faits.datesDesExercices(…)`, et
  // « Tous mes exercices » restait vide. Dans app.js, `faits` et `corpus` ne se
  // déclarent qu'une fois — ni variable locale, ni paramètre du même nom.
  const MASQUES = (code, nom) => {
    const re = new RegExp('\\b(?:var|let|const)\\s+' + nom + '\\b|\\bfunction\\s*\\w*\\s*\\(([^)]*)\\)', 'g');
    let n = 0, m;
    while ((m = re.exec(code)) !== null) {
      if (m[1] === undefined) n++;
      else if (new RegExp('\\b' + nom + '\\b').test(m[1])) n++;
    }
    return n;
  };

  test('⚠️ dans app.js, `faits` et `corpus` ne se redéclarent pas (aucun masque de l’instance)', () => {
    const app = FICHIERS.filter((f) => f.nom === 'app.js')[0];
    const code = nettoyer(app.src, false);
    expect(MASQUES(code, 'faits')).toBe(1);
    expect(MASQUES(code, 'corpus')).toBe(0);
    expect(corpsDe(code, 'corpus')).not.toBeNull();
  });

  test('la garde du masque voit une variable locale et un paramètre', () => {
    expect(MASQUES('var faits = THFaits.creer();\nfunction f() { var faits = 0; }', 'faits')).toBe(2);
    expect(MASQUES('var faits = THFaits.creer();\nfunction f(a, faits) {}', 'faits')).toBe(2);
    expect(MASQUES('var faits = THFaits.creer();\nfunction f() { return faits.dernierRecord(c); }', 'faits')).toBe(1);
  });

  test('la garde voit vraiment une seconde déclaration', () => {
    const code = nettoyer('function dernierRecord() { return null; }\nvar x = faits.dernierRecord(c);', false);
    expect(corpsDe(code, 'dernierRecord')).not.toBeNull();
    expect(corpsDe(nettoyer('var x = faits.dernierRecord(c);', false), 'dernierRecord')).toBeNull();
  });
});

// ── 64A — LE COACH NE LIT JAMAIS LE JEU (JEU-V1 §1) ─────────────────────────
// Un seul fil, sans boucle : les faits nourrissent le coach ET le jeu ; le coach
// ne lit jamais le jeu, le jeu ne lit jamais le coach (ni plan, ni consigne, ni
// pari). `THJeu` n'apparaît que chez les lecteurs du jeu — son module seul en
// 64A ; 64B y inscrira l'écran, avec sa raison. Le source est lu commentaires
// retirés, chaînes GARDÉES (`racine['THJeu']` se voit).
// `{ fichier: raison }` — élargir est un geste conscient, avec sa raison (64B).
const LECTEURS_DU_JEU = {
  'jeu.js': 'le module du jeu lui-même.',
  'app.js': '64B (JEU-V1 §9) : l’ÉCRAN du jeu — l’onglet et ses sous-vues, le Profil, la feuille « Terminer ». Il ' +
    'calcule l’état (`etatDuJeu`, `apport`) et ses lectures, et passe des données au rendu, qui ne nomme pas le jeu.'
};
const LE_JEU_NE_NOMME_PAS = /\b(?:THPlan|THMoteur|THPalier|planDeSeance|prediction)\b/;
const nommeLeJeu = (src) => {
  const code = nettoyer(src, true);
  const lignes = [];
  const re = /\bTHJeu\b/g;
  let m;
  while ((m = re.exec(code)) !== null) lignes.push(ligneDe(code, m.index));
  return lignes;
};
const nommeLeCoach = (src) => LE_JEU_NE_NOMME_PAS.exec(nettoyer(src, true));

// 64B — LES FICHIERS DU COACH NE NOMMENT NI LE JEU NI SES FAITS. Le plan et le moteur (la consigne, la réaction),
// le palier, la semaine et le bilan (les faits du coach), la séance, le générateur, les routines, le
// questionnaire et la période (les autres voix du coach). Le coach ne parle jamais du jeu (JEU-V1 §1.1).
const FICHIERS_DU_COACH = ['plan.js', 'moteur.js', 'palier.js', 'semaine.js', 'bilan.js', 'seance.js',
  'generateur.js', 'routines.js', 'questionnaire.js', 'periode.js'];
const NOMME_LE_JEU_OU_SES_FAITS = /\b(?:THJeu|faitsDuJeu)\b/;
const coachNommeLeJeu = (src) => NOMME_LE_JEU_OU_SES_FAITS.exec(nettoyer(src, true));

describe('architecture — le coach ne lit jamais le jeu, le jeu ne lit jamais le coach (64A)', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });

  test('⚠️ `THJeu` n’apparaît que chez les lecteurs du jeu', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(LECTEURS_DU_JEU, f.nom)) return;
      const l = nommeLeJeu(f.src);
      if (l.length) fautes.push('`THJeu` nommé dans ' + f.nom + ', ligne(s) ' + l.join(', ') + ' : le coach ne lit ' +
        'jamais le jeu. Un écran qui l’affiche s’inscrit dans LECTEURS_DU_JEU, avec sa raison.');
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ le jeu ne nomme rien du coach (plan, moteur, palier, prédiction)', () => {
    const m = nommeLeCoach(parNom['jeu.js'].src);
    expect(m ? '`' + m[0] + '` nommé dans jeu.js' : null).toBeNull();
  });

  test('la garde lit le vrai câblage : le module du jeu existe et se nomme lui-même', () => {
    expect(nommeLeJeu(parNom['jeu.js'].src).length).toBeGreaterThan(0);
    expect(Object.keys(LECTEURS_DU_JEU).every((f) => !!parNom[f])).toBe(true);
    // Chaque lecteur a sa raison, et chacun nomme vraiment le jeu (la liste dit ce qui est).
    Object.keys(LECTEURS_DU_JEU).forEach((f) => {
      expect([f, typeof LECTEURS_DU_JEU[f] === 'string' && LECTEURS_DU_JEU[f].length > 10]).toEqual([f, true]);
      expect([f, nommeLeJeu(parNom[f].src).length > 0]).toEqual([f, true]);
    });
  });

  test('⚠️ 64B — aucun fichier du coach ne nomme `THJeu` ni `faitsDuJeu`', () => {
    const fautes = FICHIERS_DU_COACH.map((f) => {
      expect([f, !!parNom[f]]).toEqual([f, true]);
      const m = coachNommeLeJeu(parNom[f].src);
      return m ? '`' + m[0] + '` nommé dans ' + f : null;
    }).filter(Boolean);
    expect(fautes).toEqual([]);
  });

  test('64B — la garde du coach mord : un `faitsDuJeu` glissé dans moteur.js et un `THJeu` dans semaine.js se voient', () => {
    expect(coachNommeLeJeu(parNom['moteur.js'].src + '\nvar e = faits.faitsDuJeu(c, j);\n')).not.toBeNull();
    expect(coachNommeLeJeu(parNom['semaine.js'].src + '\nvar J = racine[\'THJeu\'];\n')).not.toBeNull();
    expect(coachNommeLeJeu(parNom['moteur.js'].src + '\n// faitsDuJeu, en commentaire\n')).toBeNull();
  });

  test('l’interdit se lit vraiment : un `THJeu` glissé dans plan.js et un `THMoteur` glissé dans jeu.js se voient', () => {
    const plan = parNom['plan.js'].src;
    expect(nommeLeJeu(plan)).toEqual([]);
    expect(nommeLeJeu(plan + '\nvar etat = racine.THJeu.etatDuJeu(e);\n').length).toBe(1);
    expect(nommeLeJeu(plan + '\nvar j = racine[\'THJeu\'];\n').length).toBe(1);
    expect(nommeLeJeu(plan + '\n// racine.THJeu, en commentaire\n')).toEqual([]);
    const jeu = parNom['jeu.js'].src;
    expect(nommeLeCoach(jeu)).toBeNull();
    expect(nommeLeCoach(jeu + '\nvar M = racine.THMoteur;\n')).not.toBeNull();
    ['THPlan.x', 'THPalier.y', 'planDeSeance(a)', 'Moteur.prediction(b)'].forEach((x) =>
      expect([x, nommeLeCoach(jeu + '\n' + x + ';\n') !== null]).toEqual([x, true]));
    expect(nommeLeCoach(jeu + '\n/* THMoteur, en commentaire */\n')).toBeNull();
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

// ── 55-1 — UNE FONCTION, UN NOM, PAR MODULE ─────────────────────────────────
//
// Deux déclarations du même nom dans un même module : la seconde efface la
// première, en silence. Le 06/10/2026, `bilanDe(mois)` (le bilan du mois) a
// effacé `bilanDe(bloc)` (le bilan de fin de bloc) dans `app.js` — la carte
// de fin de bloc s'est vidée, et seul le banc « cycles » l'a vu.
describe('architecture — aucune fonction de premier niveau déclarée deux fois dans un module', () => {
  const fs = require('fs');
  const path = require('path');
  const dossier = path.join(__dirname, '../../v2/js');
  test('chaque module v2 : un nom, une déclaration', () => {
    const fautes = [];
    fs.readdirSync(dossier).filter((f) => f.endsWith('.js')).forEach((f) => {
      const src = fs.readFileSync(path.join(dossier, f), 'utf8');
      const vus = {};
      const re = /^  (?:async )?function (\w+)\s*\(/gm;
      let m;
      while ((m = re.exec(src))) vus[m[1]] = (vus[m[1]] || 0) + 1;
      Object.keys(vus).filter((k) => vus[k] > 1).forEach((k) => fautes.push(f + ' : ' + k + ' (' + vus[k] + ' fois)'));
    });
    expect(fautes).toEqual([]);
  });
  test('la garde voit vraiment un doublon', () => {
    const re = /^  (?:async )?function (\w+)\s*\(/gm;
    const src = '  function a() {}\n  function a(x) {}\n    function b() {}\n';
    const noms = [];
    let m;
    while ((m = re.exec(src))) noms.push(m[1]);
    expect(noms).toEqual(['a', 'a']);
  });
});

// ── 58-2 — LE JOURNAL DES RECORDS : LU DANS `faits.js`, ÉCRIT PAR LA SEULE FILE ──
//
// La lecture est au registre (`recordsDuJournal`, lecteurs : aucun hors du
// module). L'écriture a UN chemin, et cette garde refuse un second écrivain :
//   · en base, une seule fonction touche `records` en écriture —
//     `THDonnees.ajouterRecords`, un ajout qui ignore les doublons ;
//   · elle n'est appelée que par la vidange de la file (`app.js`, `executer`) ;
//   · une entrée du journal ne se pose que par `poserJournal` (`app.js`).
describe('architecture — le journal des records : un seul écrivain (58-2)', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });
  const ECRITURE_RECORDS = /from\(\s*(['"])records\1\s*\)[\s\S]{0,120}?\.\s*(insert|upsert|update|delete)\s*\(/g;
  const compter = (texte, re) => (texte.match(new RegExp(re.source, 'g')) || []).length;

  test('⚠️ en base, `records` ne s’écrit que dans `ajouterRecords` (donnees.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      const code = nettoyer(f.src, true);
      const n = compter(code, ECRITURE_RECORDS);
      if (f.nom !== 'donnees.js') { if (n) fautes.push(f.nom + ' écrit `records` (' + n + ')'); return; }
      const corps = corpsDe(code, 'ajouterRecords');
      if (!corps) { fautes.push('ajouterRecords absente de donnees.js'); return; }
      if (compter(corps, ECRITURE_RECORDS) !== 1 || n !== 1) fautes.push('donnees.js : ' + n + ' écriture(s) de `records`, dont ' + compter(corps, ECRITURE_RECORDS) + ' dans ajouterRecords');
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ et c’est un ajout qui IGNORE les doublons — jamais un upsert qui modifie', () => {
    const corps = corpsDe(nettoyer(parNom['donnees.js'].src, true), 'ajouterRecords');
    expect(corps).toMatch(/onConflict:\s*'set_id,type'/);
    expect(corps).toMatch(/ignoreDuplicates:\s*true/);
  });

  test('⚠️ `ajouterRecords` n’est appelée que par la vidange (`executer`, app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'donnees.js') return;
      const a = appels(f.src, { fn: 'ajouterRecords' });
      if (!a.length) return;
      if (f.nom !== 'app.js') { fautes.push(f.nom + ' appelle ajouterRecords'); return; }
      const corps = corpsDe(nettoyer(f.src, false), 'executer');
      const dedans = corps ? (corps.match(/\.\s*ajouterRecords\s*\(/g) || []).length : 0;
      if (dedans !== a.length) fautes.push('app.js appelle ajouterRecords hors d’executer');
    });
    expect(fautes).toEqual([]);
    expect(appels(parNom['app.js'].src, { fn: 'ajouterRecords' }).length).toBe(1);
  });

  test('⚠️ une entrée du journal ne se pose que par `poserJournal` (app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'attente.js') return;
      const code = nettoyer(f.src, false);
      const n = (code.match(/\bAJOUTER\b/g) || []).length;
      if (!n) return;
      const corps = f.nom === 'app.js' ? corpsDe(code, 'poserJournal') : null;
      const dedans = corps ? (corps.match(/\bAJOUTER\b/g) || []).length : 0;
      if (dedans !== n) fautes.push(f.nom + ' pose une entrée du journal hors de poserJournal');
    });
    expect(fautes).toEqual([]);
  });

  test('la garde se lit vraiment : un second écrivain se voit', () => {
    const code = nettoyer("client().from('records').upsert(l);\nclient().from('records').select('id');", true);
    expect(compter(code, ECRITURE_RECORDS)).toBe(1);
    expect(compter(nettoyer("client().from(\"records\")\n  .delete().eq('id', x);", true), ECRITURE_RECORDS)).toBe(1);
  });
});

// ── 60-2a — LA PESÉE : ÉCRITE PAR LA SEULE FILE, ET CE QUI LA FUSIONNE ────────
//
// `body_weight_log` n'était que lue ; le questionnaire en écrit une. L'écriture a
// UN chemin, comme le journal des records, et cette garde refuse un second
// écrivain :
//   · en base, une seule fonction touche la table en écriture —
//     `THDonnees.enregistrerPesee`, un upsert sur (`user_id`, `date`) qui
//     FUSIONNE (deux pesées le même jour n'en font qu'une, la dernière l'emporte) ;
//   · elle n'est appelée que par la vidange de la file (`app.js`, `executer`) ;
//   · une entrée de la file ne se pose que par `poserPesee` (`app.js`).
describe('architecture — la pesée : un seul écrivain (60-2a)', () => {
  const FICHIERS = perimetre();
  const parNom = {};
  FICHIERS.forEach((f) => { parNom[f.nom] = f; });
  const ECRITURE_PESEES = /from\(\s*(['"])body_weight_log\1\s*\)[\s\S]{0,120}?\.\s*(insert|upsert|update|delete)\s*\(/g;
  const compter = (texte, re) => (texte.match(new RegExp(re.source, 'g')) || []).length;

  test('⚠️ en base, `body_weight_log` ne s’écrit que dans `enregistrerPesee` (donnees.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      const code = nettoyer(f.src, true);
      const n = compter(code, ECRITURE_PESEES);
      if (f.nom !== 'donnees.js') { if (n) fautes.push(f.nom + ' écrit `body_weight_log` (' + n + ')'); return; }
      const corps = corpsDe(code, 'enregistrerPesee');
      if (!corps) { fautes.push('enregistrerPesee absente de donnees.js'); return; }
      if (compter(corps, ECRITURE_PESEES) !== 1 || n !== 1) {
        fautes.push('donnees.js : ' + n + ' écriture(s) de `body_weight_log`, dont ' + compter(corps, ECRITURE_PESEES) + ' dans enregistrerPesee');
      }
    });
    expect(fautes).toEqual([]);
  });

  test('⚠️ et c’est un upsert qui FUSIONNE sur (user_id, date) — jamais un ajout qui ignore les doublons', () => {
    const corps = corpsDe(nettoyer(parNom['donnees.js'].src, true), 'enregistrerPesee');
    expect(corps).toMatch(/onConflict:\s*'user_id,date'/);
    expect(corps).not.toMatch(/ignoreDuplicates/);
  });

  test('⚠️ `enregistrerPesee` n’est appelée que par la vidange (`executer`, app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'donnees.js') return;
      const a = appels(f.src, { fn: 'enregistrerPesee' });
      if (!a.length) return;
      if (f.nom !== 'app.js') { fautes.push(f.nom + ' appelle enregistrerPesee'); return; }
      const corps = corpsDe(nettoyer(f.src, false), 'executer');
      const dedans = corps ? (corps.match(/\.\s*enregistrerPesee\s*\(/g) || []).length : 0;
      if (dedans !== a.length) fautes.push('app.js appelle enregistrerPesee hors d’executer');
    });
    expect(fautes).toEqual([]);
    expect(appels(parNom['app.js'].src, { fn: 'enregistrerPesee' }).length).toBe(1);
  });

  test('⚠️ une entrée de la file pour une pesée ne se pose que par `poserPesee` (app.js)', () => {
    const fautes = [];
    FICHIERS.forEach((f) => {
      if (f.nom === 'attente.js') return;
      const code = nettoyer(f.src, false);
      // `Attente.PESEES` se lit aussi à l'exécution (`executer`) et à la
      // synchronisation (`protegees`) : ce qui est interdit, c'est de POSER
      // une entrée de cette table ailleurs que dans `poserPesee`.
      const poses = (code.match(/table:\s*Attente\.PESEES\b/g) || []).length;
      if (!poses) return;
      const corps = f.nom === 'app.js' ? corpsDe(code, 'poserPesee') : null;
      const dedans = corps ? (corps.match(/table:\s*Attente\.PESEES\b/g) || []).length : 0;
      if (dedans !== poses) fautes.push(f.nom + ' pose une entrée de pesée hors de poserPesee');
    });
    expect(fautes).toEqual([]);
    expect(corpsDe(nettoyer(parNom['app.js'].src, false), 'poserPesee')).toMatch(/table:\s*Attente\.PESEES\b/);
  });

  test('la garde se lit vraiment : un second écrivain se voit, une lecture non', () => {
    const code = nettoyer("client().from('body_weight_log').upsert(l);\nclient().from('body_weight_log').select('id');", true);
    expect(compter(code, ECRITURE_PESEES)).toBe(1);
    expect(compter(nettoyer("client().from(\"body_weight_log\")\n  .delete().eq('id', x);", true), ECRITURE_PESEES)).toBe(1);
    expect(compter(nettoyer("return client().from('body_weight_log').select('id, date, poids_kg, source');", true), ECRITURE_PESEES)).toBe(0);
  });
});
