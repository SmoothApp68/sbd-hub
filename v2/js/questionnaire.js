// v2/js/questionnaire.js — le questionnaire du coach (60-2a).
//
// QUESTIONNAIRE-COACH-V2 §2 et §3 : un parcours d'écrans, ouvert une fois à qui
// ne l'a jamais rempli, qui écrit chaque écran validé. Module PUR : aucune
// dépendance au DOM, au réseau, au stockage, à l'horloge. Il dit QUELS écrans,
// DANS QUEL ORDRE, QUAND « Continuer » s'allume, QUELLES COLONNES chaque écran
// écrit, et QUELS TEXTES il porte — l'écran (`rendu.js`) les dessine, les gestes
// (`app.js`) les branchent.
//
// ⚠️ UN SEUL CHEMIN D'ÉCRITURE (§1.4). Le questionnaire n'est pas un second
// profil : il présente les sections du profil dans un ordre, et ce qu'il écrit
// passe par `Profil.preparerChamps` — la fonction que le Profil appelle aussi.
// Les LISTES (matériel, sexe, rythmes, phases, objectifs…) sont celles de
// `profil.js` : un libellé par valeur, au questionnaire comme au Profil.
//
// ⚠️ AUCUNE RÉPONSE SANS LECTEUR… OU SANS SON NOM (§1.3). Ce que 60-2a ÉCRIT sans
// que rien le lise encore (objectif, priorités, temps) est dit au futur à
// l'écran. 60-2b a ajouté les lecteurs : les sous-lignes disent ce que le code
// FAIT (« Moins » ouvre la carte de « J'ai peu de temps » ; « Ça varie » montre
// la durée des longues séances).
//
// L'ÉCRAN « TON PROGRAMME » (8) existe depuis 60-3, SEULEMENT pour qui n'a aucune
// routine (QUESTIONNAIRE §3). Trois choix : « Garder ce que je fais » (seulement avec au moins
// une séance en base — sans séance, il n'a rien à retrouver) ouvre, après « Commencer », la
// feuille « Tes séances qui reviennent » (8a, ECRAN-SAISIE §7 quindecies.7) ; « Je crée mes
// routines moi-même » mène à la bibliothèque ; « Construis-le-moi » (60-4) ouvre l'écran 8b
// (les jours, la zone à ménager) puis, après « Commencer », l'aperçu du programme construit
// (QUESTIONNAIRE §5 bis). L'écran 8 a donc toujours deux choix au moins : il n'est plus
// caché sans séance (60-3b le cachait).

(function (racine) {
  'use strict';

  function Profil() { return racine.THProfil; }
  function Poids() { return racine.THPoids; }
  function Modele() { return racine.THModele; }
  function Generateur() { return racine.THGenerateur; }
  function Moteur() { return racine.THMoteur; }

  var INSECABLE = ' ';

  // ── Les écrans, dans l'ordre ─────────────────────────────────────────────
  var BIENVENUE = 'bienvenue', ANCIENNETE = 'anciennete', SAIT = 'sait';
  var SALLE = 'salle', ZONE = 'zone', RAIDES = 'raides', RECENTE = 'recente';   // 194-1 : RAIDES, les zones raides (facultatif)
  //   // 187 : où tu t'entraînes, une zone à ménager, une série récente
  var TOI = 'toi', BUT = 'but', PRIORITES = 'priorites', TEMPS = 'temps', PROGRAMME = 'programme';
  var CONSTRUIT = 'construit';   // l'écran 8b (60-4) : « Construis-le-moi »
  var COACH = 'coach', RECAP = 'recap';
  var DEPART = 'depart';   // 195 : « Où tu en es » — quatre chiffres, seulement en objectif Calisthénie
  var ECRANS = [BIENVENUE, ANCIENNETE, SAIT, SALLE, ZONE, RAIDES, RECENTE, TOI, BUT, DEPART, PRIORITES, TEMPS, PROGRAMME, CONSTRUIT,
                COACH, RECAP];

  // L'écran 3a (« Ce que je sais ») ET l'écran 3b (« Sans historique ») : l'un
  // OU l'autre. 3a si la personne a au moins une séance en base et n'a pas
  // répondu « je débute » ; 3b sinon. `contexte` :
  // `{ aDesSeances: bool, historique: 'import' | 'non_note' | 'debutant' | null,
  //    aDesRoutines: bool | null }`.
  //
  // L'écran 8 (« Ton programme », 60-3) : SEULEMENT quand on SAIT que la personne
  // n'a aucune routine (`aDesRoutines === false`), avec ou sans séance (60-4 : « Construis-le-moi »
  // lui donne toujours deux choix). Les routines vivent en ligne : tant qu'on ne les a pas lues
  // (`null`, hors ligne), l'écran n'existe pas — qui a déjà ses routines ne se voit jamais
  // proposer ses anciennes séances, et la ligne de Routines sert à tout le monde.
  // L'écran 8b (« Construis-le-moi », 60-4) suit l'écran 8 quand ce choix est fait
  // (`contexte.programme === 'construis'`) : la barre de progression le compte alors.
  function aUnHistorique(contexte) {
    var c = contexte || {};
    return !!c.aDesSeances && c.historique !== 'debutant';
  }

  // 187 (A5) — « Une série récente ? » : pour qui s'entraîne depuis un an ou plus et n'a aucune séance en base.
  var DEPUIS_UN_AN = ['1_a_3_ans', '3_a_5_ans', 'plus_5_ans'];
  function aUneAnnee(contexte) { return !!contexte && DEPUIS_UN_AN.indexOf(contexte.depuis) >= 0; }

  function ecransVisibles(contexte) {
    var avec = aUnHistorique(contexte);
    return ECRANS.filter(function (id) {
      if (id === SAIT) return avec;
      if (id === DEPART) return !!contexte && contexte.objectif === 'calisthenie';
      if (id === RECENTE) return aUneAnnee(contexte) && !(contexte && contexte.aDesSeances);
      if (id === PROGRAMME) return !!contexte && contexte.aDesRoutines === false;
      if (id === CONSTRUIT) return !!contexte && contexte.aDesRoutines === false && contexte.programme === 'construis';
      return true;
    });
  }

  // La barre de progression compte les écrans VISIBLES : `rang` part de 0, et
  // le premier écran est à 0 %, le dernier à 100 %.
  function progression(visibles, id) {
    var i = visibles.indexOf(id);
    var total = visibles.length;
    return { rang: i < 0 ? 0 : i, total: total,
             pourcent: total > 1 && i >= 0 ? Math.round(100 * i / (total - 1)) : 0 };
  }

  function ecranSuivant(visibles, id) {
    var i = visibles.indexOf(id);
    return i >= 0 && i < visibles.length - 1 ? visibles[i + 1] : null;
  }

  function ecranPrecedent(visibles, id) {
    var i = visibles.indexOf(id);
    return i > 0 ? visibles[i - 1] : null;
  }

  // ── Les réponses en cours ────────────────────────────────────────────────
  //
  // Un brouillon par écran : il part de ce qui est DÉJÀ en base (§1.2 — « ce
  // que la personne a déjà donné est pré-rempli : elle vérifie, elle ne
  // retape pas ») et ne s'écrit qu'à « Continuer ».

  function coachDe(profil) {
    var p = profil || {};
    return p.intention === 'entretien' ? 'carnet' : Profil().rythmeDe(p);
  }

  function anneeDe(dateNaissance) {
    var m = /^(\d{4})-/.exec(String(dateNaissance || ''));
    return m ? Number(m[1]) : null;
  }

  // La phase telle qu'on la RELIT à l'écran. « Je ne sais pas » écrit le vide (60-2c) : une phase
  // vide AVEC une date de confirmation est une réponse, « Je ne sais pas » — sans elle, rouvrir le
  // questionnaire la ferait passer pour « jamais répondu » et « Continuer » resterait éteint.
  function phaseSaisie(profil) {
    var v = profil && profil.phase;
    if (Profil().PHASES_EN_BASE.indexOf(v) >= 0) return v;   // les phases du profil, une liste (124)
    return profil && profil.phase_confirmee_le ? 'inconnue' : null;
  }

  // 187 (A1, A2) — UNE question d'ancienneté : « Je commence » (`historique_declare = debutant`,
  // `anciennete = moins_1_an`) ou une fourchette d'`anciennete`. Une question de plus : les séances sont-elles notées
  // quelque part ? « Hevy ou Strong » = `import`, « Non » = `non_note` ; « Dans mes notes » n'est pas encore une réponse.
  var COMMENCE = 'commence', NOTEES_IMPORT = 'import', NOTEES_NON = 'non';
  function depuisDe(p) {
    if (p.historique_declare === 'debutant') return COMMENCE;
    return Profil().libelleDe(Profil().ANCIENNETES, p.anciennete) ? p.anciennete : null;
  }
  function noteesDe(p) {
    if (p.historique_declare === 'import') return NOTEES_IMPORT;
    return p.historique_declare === 'non_note' ? NOTEES_NON : null;
  }
  // Les colonnes suivent la réponse : une seule vérité (`depuis`, `notees`), les deux colonnes en sont déduites.
  function synchroniserAnciennete(r) {
    if (r.depuis === COMMENCE) { r.anciennete = Profil().ANCIENNETE_DEBUTANT; r.historique = 'debutant'; r.notees = null; }
    else if (r.depuis) {
      r.anciennete = r.depuis;
      r.historique = r.notees === NOTEES_IMPORT ? 'import' : r.notees === NOTEES_NON ? 'non_note' : null;
    }
    return r;
  }

  // 187 (A3) — les haltères de Ma salle, quand ils tiennent en UNE tranche (« jusqu'à 40 kg, de 2 en 2 ») ; plusieurs
  // tranches se règlent dans le Profil, et le questionnaire n'y touche pas.
  function halteresDe(profil) {
    var salle = Profil().salleDe(profil), h = salle && salle.halteres;
    if (!h) return { max: null, pas: null };
    if (Array.isArray(h)) return h.length === 1 ? { max: h[0].jusqua, pas: h[0].pas } : { max: null, pas: null };
    return { max: h.max, pas: h.pas };
  }
  function salleASeulesTranches(profil) {
    var h = Profil().salleDe(profil), x = h && h.halteres;
    return !!(x && Array.isArray(x) && x.length > 1);
  }

  function departDe(p, k) {
    var d = Profil().departCalisthenieValide(p && p.depart_calisthenie);
    return d && d[k] !== undefined ? d[k] : null;
  }
  // `contexte.poids` : la dernière pesée (un nombre), ou `null`.
  function reponsesInitiales(profil, contexte) {
    var p = profil || {}, c = contexte || {};
    var nul = function (v) { return v === undefined ? null : v; };
    return {
      historique: nul(p.historique_declare),
      anciennete: nul(p.anciennete),
      depuis: depuisDe(p),
      notees: noteesDe(p),
      seances: nul(p.seances_par_semaine),
      duree: nul(p.duree_seance_min),
      sexe: nul(p.sexe),
      annee: anneeDe(p.date_naissance),
      taille: nul(p.taille_cm),
      poids: nul(c.poids),
      objectif: nul(p.objectif),
      // 195 — le départ déjà écrit (`depart_calisthenie`) : un chiffre par champ, `null` = pas dit.
      dep_tractions: departDe(p, 'tractions'), dep_pompes: departDe(p, 'pompes'), dep_dips: departDe(p, 'dips'),
      dep_pistol: departDe(p, 'pistol'),
      phase: phaseSaisie(p),
      priorites: Array.isArray(p.priorites) ? p.priorites.slice() : null,
      temps: nul(p.temps_reponse),
      materiel: nul(p.materiel),
      halteresMax: halteresDe(p).max,
      halteresPas: halteresDe(p).pas,
      // 190 — le plus petit disque (kg par côté) et la barre de traction (`true`, `false`), `null` : pas dit / « Je ne sais pas ».
      plusPetitDisque: Profil().plusPetitDisqueDe(p),
      barreTraction: Profil().barreTractionDe(p),
      programme: Profil().libelleDe(Profil().PROGRAMMES, p.programme_choix) ? p.programme_choix : null,
      menager: Profil().zonesAMenagerValides(p.zones_a_menager) || [],
      // 194-1 — `null` : pas répondu ; `[]` : aucune.
      raides: Profil().zonesRaidesValides(p.zones_raides),
      coach: coachDe(p)
    };
  }

  // LES JOURS DE « CONSTRUIS-LE-MOI » (60-4) : 2 à 6, les bornes du générateur (jamais recopiées). Ceux que
  // la personne a déjà dits (`seances_par_semaine`, par 3b ou le Profil) d'abord, bornés ; sinon le rythme que
  // l'écran 3a lui a montré (`faits.rythme`), arrondi et borné ; sinon rien — elle choisit.
  function joursValides(n) {
    var G = Generateur();
    return typeof n === 'number' && Math.floor(n) === n && n >= G.JOURS_MIN && n <= G.JOURS_MAX;
  }
  function joursPrecoches(rep, faits) {
    var G = Generateur();
    var borne = function (x) { return Math.max(G.JOURS_MIN, Math.min(G.JOURS_MAX, Math.round(x))); };
    var declares = rep && Number(rep.seances);
    if (declares >= 1) return borne(declares);
    var rythme = faits && Number(faits.rythme);
    return rythme >= 1 ? borne(rythme) : null;
  }

  // 116 (audit du 16/10/2026, 03 #10) — UNE VALEUR DÉCLARÉE N'EST PAS RÉÉCRITE PAR SA PRÉ-COCHE. Le Profil permet 1 à
  // 14 séances par semaine (`profiles_rythme_borne`), l'écran 8b 2 à 6 (le générateur) : 7 déclarées arrivaient
  // pré-cochées à 6, et « Continuer » (ou « Voir mon programme », « Refaire ») ÉCRIVAIT 6 à la place du 7. Le brouillon
  // garde donc la marque de la pré-coche bornée (`joursBornes`) : tant que la personne ne touche pas les puces, la
  // colonne n'est pas écrite (le programme se construit sur la valeur bornée, `Generateur.bornerJours`). Une copie.
  function precocherJours(rep, faits) {
    var r = Object.assign({}, rep);
    if (joursValides(r.seances)) return r;
    var jours = joursPrecoches(r, faits);
    if (jours === null) return r;
    if (Number(r.seances) >= 1) r.joursBornes = jours;
    r.seances = jours;
    return r;
  }
  // Le nombre de séances à écrire : `undefined` (rien) quand c'est la pré-coche bornée d'une valeur déclarée.
  function seancesAEcrire(r) {
    return r.joursBornes !== undefined && r.joursBornes === r.seances ? undefined : r.seances;
  }

  // « Continuer » : actif partout, SAUF aux écrans qui ont une réponse
  // obligatoire — 2 (l'historique), 5 (l'objectif ET la phase), 8 (le chemin du
  // programme, §1.3 : « tout est facultatif sauf le chemin du programme »), 8b (les jours de
  // « Construis-le-moi ») et 9 (le coach). Tout le reste est facultatif : sans réponse, rien n'est écrit.
  function ecranPret(id, rep) {
    var r = rep || {};
    if (id === ANCIENNETE) return !!r.depuis && (r.depuis === COMMENCE || !!r.notees);
    if (id === SALLE) return true;
    if (id === BUT) return !!r.objectif && !!r.phase;
    if (id === PROGRAMME) return !!r.programme;
    if (id === CONSTRUIT) return joursValides(r.seances);
    if (id === COACH) return !!r.coach;
    return true;
  }

  // ── Ce que chaque écran ÉCRIT ────────────────────────────────────────────
  //
  // Une écriture par écran validé ; « ‹ Retour » n'écrit rien. Les colonnes
  // passent toutes par `Profil.preparerChamps` (rien qui n'ait changé n'est
  // écrit, une valeur hors liste ne part pas). La PESÉE de l'écran « Toi » est à
  // part : elle va dans `body_weight_log`, par la file.
  //
  // « Me ménager · Normal · Me pousser » sont les rythmes du Profil, sous leurs
  // noms du Profil (Me ménager · Normal · Me pousser) — un seul langage ; « Juste un
  // carnet » est `intention = 'entretien'`, le rythme est gardé.
  function coachEnChamps(coach) {
    if (coach === 'carnet') return { intention: 'entretien' };
    if (coach === 'prudent' || coach === 'normal' || coach === 'franc') {
      return { intention: 'progresser', rythme_progression: coach };
    }
    return {};
  }

  // `contexte` : `{ pesees: lignes de body_weight_log, jour: 'AAAA-MM-JJ',
  // maintenant: Date }`. Rend `{ champs, pesee }` : les colonnes du profil à
  // écrire (un objet vide : rien à écrire) et la pesée à poser, ou `null`.
  function champsDeLEcran(id, rep, profil, contexte) {
    var r = rep || {}, c = contexte || {};
    var entrees = null, pesee = null, extra = {};
    if (id === ANCIENNETE) entrees = { anciennete: r.anciennete, historique_declare: r.historique };
    else if (id === TOI) {
      entrees = { sexe: r.sexe, annee_naissance: r.annee, taille_cm: r.taille };
      pesee = Poids().peseeAEcrire(c.pesees, r.poids, c.jour);
    } else if (id === BUT) entrees = { objectif: r.objectif, phase: r.phase };
    else if (id === DEPART) {
      entrees = { depart_calisthenie: { tractions: r.dep_tractions, pompes: r.dep_pompes, dips: r.dep_dips, pistol: r.dep_pistol } };
    }
    else if (id === PRIORITES) entrees = { priorites: r.priorites };
    else if (id === TEMPS) {
      // `duree_seance_min` : seulement si la personne l'a CHANGÉE — la médiane
      // qu'on lui montre n'est pas une réponse.
      // 60-2c : « Moins en ce moment » demande combien — la puce touchée EST la durée visée
      // (même colonne, même écriture) ; sans puce, la durée reste ce qu'elle était.
      entrees = { temps_reponse: r.temps,
                  duree_seance_min: r.temps === 'moins' && r.dureeMoins ? r.dureeMoins : r.duree };
    } else if (id === PROGRAMME) entrees = { programme_choix: r.programme };
    else if (id === SALLE) {
      entrees = { materiel: r.materiel };
      var salle = salleAEcrire(r, profil);
      if (salle !== undefined) extra.ma_salle = salle;
    } else if (id === ZONE) entrees = { zones_a_menager: r.menager };
    else if (id === RAIDES) entrees = Array.isArray(r.raides) ? { zones_raides: r.raides } : null;
    else if (id === RECENTE) entrees = null;   // rien en base : les séries partent au programme construit (`seriesRecentes`)
    else if (id === CONSTRUIT) entrees = { seances_par_semaine: seancesAEcrire(r) };
    else if (id === COACH) entrees = coachEnChamps(r.coach);
    else if (id === RECAP) entrees = { fait: true };
    return {
      champs: entrees ? Object.assign(Profil().preparerChamps(profil, entrees, c.maintenant), extra) : {},
      pesee: pesee
    };
  }

  // 187 (A3) — « Ajuster Ma salle » : les haltères (jusqu'à, de … en …), écrits dans `profiles.ma_salle` PAR la
  // fonction du Profil (`champsSalle`) — les barres, les élastiques déjà déclarés ne sont pas touchés. Rien quand rien
  // n'est dit, quand la salle a plusieurs tranches, ou quand la salle écrite serait la même.
  // 190 — AVEC LE PLUS PETIT DISQUE ET LA BARRE DE TRACTION (les deux lignes de `Profil.lignesMateriel`, le même éditeur que la
  // feuille « Ma salle » du Profil) : le brouillon part de la salle écrite, reçoit les trois réponses, et la salle est celle que
  // `champsSalle` normalise. « Je ne sais pas » (`null`) RETIRE la clé : si c'était la seule chose déclarée, la salle redevient
  // `NULL`. Rend `undefined` quand rien ne change (rien à écrire), sinon la salle à écrire (un objet, ou `null`).
  function salleAEcrire(r, profil) {
    var P = Profil(), b = P.brouillonSalle(profil);
    if (r.halteresMax > 0 && r.halteresPas > 0 && !salleASeulesTranches(profil)) {
      b.halteres = [{ jusqua: r.halteresMax, pas: r.halteresPas, pasChoisi: true }];
    }
    b.plus_petit_disque = typeof r.plusPetitDisque === 'number' ? r.plusPetitDisque : null;
    b.barre_traction = typeof r.barreTraction === 'boolean' ? r.barreTraction : null;
    var champs = P.champsSalle(b);
    if (!champs) return undefined;
    var avant = P.salleDe(profil);
    return JSON.stringify(avant) === JSON.stringify(champs.ma_salle) ? undefined : champs.ma_salle;
  }

  // Ce qui vient d'être ÉCRIT est la durée visée : le brouillon la rejoint (60-2c). « Moins en ce moment »
  // l'écrit depuis `dureeMoins`, que `rep.duree` ne connaît pas — sans cela, « Retour » puis une autre
  // réponse montrerait l'habituelle (ou l'ancienne durée) pendant que la base garde la puce, et la
  // prochaine écriture la remplacerait en silence. Une COPIE, comme `appliquerChoix`.
  function apresEcriture(rep, champs) {
    var r = Object.assign({}, rep);
    var d = champs ? champs.duree_seance_min : undefined;
    if (d !== undefined && d !== null) r.duree = d;
    return r;
  }

  // Une priorité qu'on touche : on l'ajoute, ou on la retire ; trois au plus
  // (la quatrième est sans effet) ; « Pas de priorité » (`[]`) est une réponse
  // qui vide la liste.
  function basculerPriorite(liste, cle) { return Profil().basculerPriorite(liste, cle); }

  // Un choix touché, appliqué aux réponses en cours (une COPIE) : les noms de
  // réponse que l'écran connaît, et rien d'autre — un geste qui vise une clé
  // inconnue est sans effet.
  var CHOIX = ['depuis', 'notees', 'seances', 'duree', 'dureeMoins', 'sexe', 'objectif', 'phase',
               'temps', 'materiel', 'programme', 'coach', 'halteresMax', 'halteresPas', 'salleOuverte', 'dep_pistol'];

  function appliquerChoix(rep, cle, valeur) {
    var r = Object.assign({}, rep);
    if (cle === 'priorite') r.priorites = basculerPriorite(r.priorites, valeur);
    else if (cle === 'aucune') r.priorites = [];
    else if (cle === 'zone') r.menager = Profil().basculerZone(r.menager, valeur);
    else if (cle === 'raide') r.raides = Profil().basculerZoneRaide(r.raides, valeur);
    else if (cle === 'duree') {
      // 137 — « Plus » ne porte pas de durée : elle ouvre le champ des minutes. Une durée déjà au-delà des
      // puces est gardée ; sinon rien n'est en réponse tant que la personne n'a pas tapé ses minutes.
      if (valeur === 'plus') {
        r.dureePlus = true;
        if (!(typeof r.duree === 'number' && r.duree >= DUREE_PLUS_MIN)) r.duree = null;
      } else { r.duree = valeur; r.dureePlus = false; }
    } else if (cle === 'notees' && valeur !== NOTEES_IMPORT && valeur !== NOTEES_NON) {
      // 187 — « Dans mes notes » est annoncé (« Bientôt »), ce n'est pas encore une réponse : sans effet.
      return r;
    } else if (cle === 'plus_petit_disque' || cle === 'barre_traction') {
      // 190 — les deux lignes de Ma salle : le geste du Profil (`poserReglageMateriel`), sur les réponses en cours.
      var b = Profil().poserReglageMateriel({ plus_petit_disque: r.plusPetitDisque, barre_traction: r.barreTraction }, cle, valeur);
      r.plusPetitDisque = b.plus_petit_disque;
      r.barreTraction = b.barre_traction;
    } else if (CHOIX.indexOf(cle) >= 0) {
      r[cle] = valeur;
      if (cle === 'depuis' || cle === 'notees') synchroniserAnciennete(r);
      if (cle === 'seances') delete r.joursBornes;   // 116 — une puce touchée : la valeur est une réponse
    }
    return r;
  }

  // Un champ tapé (l'année, la taille, le poids) lu en nombre. `lireNombre` est
  // passée (le lecteur unique des nombres tapés, `modele.js`, vit chez l'écran) ;
  // `aujourdhui` borne l'année. Rend `{ valeur, erreur }` : un champ vide n'est
  // pas une erreur (tout est facultatif), un nombre hors bornes n'est pas une
  // réponse — la phrase le dit, et la valeur reste `null`. Les bornes sont celles
  // du Profil et de la base, jamais d'autres.
  function lireChamp(cle, texte, lireNombre, aujourdhui) {
    var t = String(texte === null || texte === undefined ? '' : texte).trim();
    if (t === '') return { valeur: null, erreur: null };
    var n = lireNombre(t);
    var P = Profil();
    var rec = /^rec_(sq|co|so|mi)_(kg|reps)$/.exec(cle);
    if (rec) {
      if (rec[2] === 'kg') {
        var kg = n !== null && n > 0 && n <= RECENTE_KG_MAX ? Math.round(n * 100) / 100 : null;
        return { valeur: kg, erreur: kg === null ? 'Une charge entre 0 et ' + RECENTE_KG_MAX + ' kg.' : null };
      }
      var reps = n !== null && Math.floor(n) === n && n >= 1 && n <= RECENTE_REPS_MAX ? n : null;
      return { valeur: reps, erreur: reps === null ? 'Un nombre de reps entre 1 et ' + RECENTE_REPS_MAX + '.' : null };
    }
    var dep = /^dep_(tractions|pompes|dips)$/.exec(cle);
    if (dep) {
      var bm = { tractions: 100, pompes: 300, dips: 100 }[dep[1]];
      var dv = n !== null && Math.floor(n) === n && n >= 0 && n <= bm ? n : null;
      return { valeur: dv, erreur: dv === null ? 'Un nombre entre 0 et ' + bm + '.' : null };
    }
    if (cle === 'annee') {
      var annee = n !== null && Math.floor(n) === n && P.naissanceValide(n + '-01-01', aujourdhui) !== null ? n : null;
      return { valeur: annee, erreur: annee === null ? 'Une année de naissance plausible.' : null };
    }
    if (cle === 'taille') {
      var taille = n === null ? null : P.tailleValide(n);
      return { valeur: taille, erreur: taille === null ? 'Une taille entre ' + P.TAILLE_MIN + ' et ' + P.TAILLE_MAX + ' cm.' : null };
    }
    if (cle === 'duree') {
      // 137 — « Plus » : de 95 min à la borne de la base. Hors bornes : la phrase, rien n'est écrit.
      var duree = n !== null && Math.floor(n) === n && n >= DUREE_PLUS_MIN && n <= P.DUREE_MAX ? n : null;
      return { valeur: duree, erreur: duree === null
        ? 'Une durée entre ' + DUREE_PLUS_MIN + ' et ' + P.DUREE_MAX + ' min.' : null };
    }
    if (cle === 'poids') {
      var W = Poids();
      var poids = n === null ? null : W.poidsValide(n);
      return { valeur: poids, erreur: poids === null ? 'Un poids entre ' + W.POIDS_MIN + ' et ' + W.POIDS_MAX + ' kg.' : null };
    }
    return { valeur: null, erreur: null };
  }

  // ── Les chiffres montrés ─────────────────────────────────────────────────

  function en(n, unite) { return n + INSECABLE + unite; }

  // Les séances (« 164 séances · depuis mai 2025 »), le rythme, la durée
  // habituelle, les maximums aux barres, les autres activités : ce que dit
  // `faits.ceQueJeSais`, mis en mots. Une ligne dont le fait manque n'existe pas.
  // Les barres et leur nom court : écrits une fois, dans `THModele` (124, audit du 16/10/2026, 06 #16).
  var BARRES = racine.THModele.BARRES_DE_CE_QUE_JE_SAIS;
  var NOMS_DES_BARRES = racine.THModele.NOM_DE_BARRE;

  function majuscule(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function lignesDeCeQueJeSais(f) {
    var lignes = [];
    if (!f) return lignes;
    var depuis = f.depuis ? Modele().moisAnnee(f.depuis) : '';
    lignes.push({ libelle: 'Historique',
      valeur: f.seances + (f.seances > 1 ? ' séances' : ' séance') + (depuis ? ' · depuis ' + depuis : '') });
    if (f.rythme) lignes.push({ libelle: 'Rythme (12 dernières semaines)', valeur: 'environ ' + f.rythme + ' par semaine' });
    if (f.dureeMin) lignes.push({ libelle: 'Durée habituelle', valeur: '≈' + INSECABLE + en(f.dureeMin, 'min') });
    if (f.maximums && f.maximums.length) {
      lignes.push({
        libelle: majuscule(f.maximums.map(function (m) { return NOMS_DES_BARRES[m.slug] || m.slug; }).join(' · ')),
        valeur: f.maximums.map(function (m) { return Modele().nombreSigne(m.charge); }).join(' · ') + INSECABLE + 'kg'
      });
    }
    if (f.autres && f.autres.length) lignes.push({ libelle: 'Autres activités', valeur: f.autres.join(', ') });
    return lignes;
  }

  // Deux durées, qu'il ne faut pas confondre (relevé de la relecture du 07/10) :
  //   · l'HABITUELLE — la médiane des séances (`faits.dureeMin`) : un FAIT, celui du
  //     titre « Tes séances durent environ 75 min. » ; la personne ne le corrige pas ;
  //   · la VISÉE — `duree_seance_min` : ce que la ligne « Durée visée » montre, ce que
  //     la feuille coche, ce que le récapitulatif dit. La réponse de la personne
  //     (ou celle déjà en base) d'abord, sinon l'habituelle. Montrer l'habituelle
  //     par-dessus une réponse faisait dire « 75 min » à l'écran pendant que la
  //     base écrivait 60.
  // `null` : on la lui demande.
  function dureeHabituelle(faits) {
    return faits && faits.dureeMin ? faits.dureeMin : null;
  }
  function dureeMontree(rep, faits) {
    if (rep && rep.duree) return rep.duree;
    return dureeHabituelle(faits);
  }

  // ── Les textes et la forme de chaque écran ───────────────────────────────
  //
  // `etat` : `{ rep, faits, profil, aDesSeances, textes, erreurs }`. `textes` :
  // ce qui est TAPÉ dans les champs (le brouillon des chiffres est un nombre, le
  // champ garde le texte). `erreurs` : `{ champ: phrase }`.
  var PUCES_SEANCES = [2, 3, 4, 5, 6].map(function (n) { return { cle: n, libelle: n === 6 ? '6+' : String(n) }; });
  // 137 (audit du 16/10, 03 #11 ; décision du 22/10) — « PLUS » NE VAUT PLUS 120 : choisie, elle demande COMBIEN,
  // juste dessous (un champ de 95 à `Profil.DUREE_MAX`, la borne de la base). 120 min aurait été inventé. Sans
  // minutes tapées, « Plus » n'écrit rien pour la durée.
  var DUREE_PLUS_MIN = 95;
  // Les quatre durées sont celles de « Moins en ce moment » (`Profil.DUREES_DE_MOINS`) : une liste, un endroit.
  function pucesDeDuree() {
    return Profil().DUREES_DE_MOINS.map(function (n) {
      return { cle: n, libelle: n + ' min' };
    }).concat([{ cle: 'plus', libelle: 'Plus' }]);
  }

  // « Plus » est choisie quand la personne l'a touchée, ou quand la durée en réponse est déjà au-delà des puces.
  function plusChoisie(rep) {
    return !!(rep && (rep.dureePlus || (typeof rep.duree === 'number' && rep.duree >= DUREE_PLUS_MIN)));
  }

  // Les puces de la durée, et — « Plus » choisie — « Combien de minutes ? » juste dessous (un bloc `champs`).
  function blocsDeLaDuree(etat, titre) {
    var rep = etat.rep, erreurs = etat.erreurs || {};
    var plus = plusChoisie(rep);
    var blocs = [{ type: 'puces', cle: 'duree', titre: titre, valeur: plus ? 'plus' : rep.duree, options: pucesDeDuree() }];
    if (plus) {
      blocs.push({ type: 'champs', champs: [
        { cle: 'duree', libelle: 'Combien de minutes ?', unite: 'min', mode: 'numeric',
          valeur: texteDe(etat, 'duree', typeof rep.duree === 'number' && rep.duree >= DUREE_PLUS_MIN ? rep.duree : null),
          erreur: erreurs.duree || null, aide: null }
      ] });
    }
    return blocs;
  }

  var SOUS_NOTEES = {
    import: 'J’importe ton fichier ici : je connaîtrai tes charges dès la première séance.',
    notes: 'Bientôt : colle tes notes, je te propose les séances à valider une par une.'
  };
  var DEPUIS = [
    { cle: COMMENCE, libelle: 'Je commence' },
    { cle: 'moins_1_an', libelle: 'Moins d’un an' },
    { cle: '1_a_3_ans', libelle: '1 à 3 ans' },
    { cle: '3_a_5_ans', libelle: '3 à 5 ans' },
    { cle: 'plus_5_ans', libelle: 'Plus de 5 ans' }
  ];
  var SOUS_TEMPS = {
    moins: 'Je te proposerai des séances plus courtes',
    varie: 'Je te montrerai la durée des longues séances'
  };
  var SOUS_PHASE = { inconnue: 'Je compte comme maintien' };
  // L'écran 8 : les sous-lignes de la maquette v4, ce que le code fait de la réponse.
  var SOUS_PROGRAMME = {
    deduit: 'Je retrouve tes séances qui reviennent et j’en fais tes routines',
    moi: 'L’éditeur de routines, à ton rythme',
    construis: 'Quelques questions de plus, et je te propose un programme'
  };

  function avecSous(liste, sous) {
    return liste.map(function (o) {
      var x = { cle: o.cle, libelle: o.libelle };
      if (sous[o.cle]) x.sous = sous[o.cle];
      return x;
    });
  }

  // Ce que le champ affiche : ce qui y est TAPÉ, sinon la valeur déjà connue.
  // `decimal` : le poids (« 84,5 ») passe par le formateur unique des nombres.
  function texteDe(etat, cle, nombre, decimal) {
    var t = etat.textes && etat.textes[cle];
    if (t !== undefined && t !== null) return t;
    if (nombre === null || nombre === undefined) return '';
    return decimal ? Modele().nombreSigne(nombre) : String(nombre);
  }

  function ecranBienvenue() {
    return {
      id: BIENVENUE, etape: 'Bienvenue',
      titre: 'Je suis ton coach. Deux minutes pour te connaître.',
      voix: 'Je te propose la charge de chaque série et je te dis pourquoi. Tu décides toujours.',
      blocs: [
        { type: 'faits', lignes: [
          { libelle: 'Tes données', valeur: 'depuis quand, et ce que je sais déjà' },
          { libelle: 'Ta salle', valeur: 'où, et ta zone à ménager' },
          { libelle: 'Toi', valeur: '4 réponses, facultatives' },
          { libelle: 'Ton but', valeur: 'objectif, phase, priorités' },
          { libelle: 'Ton coach', valeur: 'comment je te parle' }
        ] },
        { type: 'note', texte: 'Tout se change ensuite dans Profil.' }
      ]
    };
  }

  function ecranAnciennete(etat) {
    var rep = etat.rep;
    var blocs = [{ type: 'puces', cle: 'depuis', valeur: rep.depuis, options: DEPUIS }];
    if (rep.depuis && rep.depuis !== COMMENCE) {
      blocs.push({ type: 'options', cle: 'notees', titre: 'Tes séances sont notées quelque part ?', valeur: rep.notees,
        options: [
          { cle: NOTEES_IMPORT, libelle: 'Oui, dans Hevy ou Strong', sous: SOUS_NOTEES.import },
          { cle: 'notes', libelle: 'Dans mes notes', sous: SOUS_NOTEES.notes, desactive: true, pastille: 'Bientôt' },
          { cle: NOTEES_NON, libelle: 'Non' }
        ] });
    }
    return {
      id: ANCIENNETE, etape: 'Tes données',
      titre: 'Tu t’entraînes depuis combien de temps ?',
      voix: null,
      blocs: blocs
    };
  }

  function ecranSait(etat) {
    return {
      id: SAIT, etape: 'Tes données',
      titre: 'Voici ce que tes séances me disent.',
      voix: null,
      blocs: [{ type: 'faits', lignes: lignesDeCeQueJeSais(etat.faits) }]
    };
  }


  // ── 187 (A3) — « Où tu t'entraînes ? » ────────────────────────────────────────
  // Chaque salle avec sa sous-ligne, reprise du Profil (`MATERIELS`). « Ajuster Ma salle », replié, donne les crans
  // des haltères, le plus petit disque et la barre de traction (190, v2_119 : `profiles.ma_salle`, écrit par `Profil.champsSalle`).
  var PUCES_HALTERES_MAX = [10, 20, 30, 40, 50, 60];
  var PUCES_HALTERES_PAS = [1, 2, 2.5, 5];
  function pucesDe(valeurs, unite) {
    return valeurs.map(function (v) { return { cle: v, libelle: Modele().nombreSigne(v) + (unite ? INSECABLE + unite : '') }; });
  }
  function phraseDeLaSalle(rep) {
    var dit = [];
    if (rep.halteresMax > 0 && rep.halteresPas > 0) {
      dit.push('Haltères jusqu’à ' + en(rep.halteresMax, 'kg') + ', de ' + Modele().nombreSigne(rep.halteresPas) + ' en ' +
               Modele().nombreSigne(rep.halteresPas));
    }
    // 190 — ce qui est réglé, tel quel (le même résumé que le Profil).
    var materiel = Profil().resumeSalle({ ma_salle: { plus_petit_disque: rep.plusPetitDisque, barre_traction: rep.barreTraction } });
    if (materiel) dit.push(materiel);
    return dit.length ? dit.join('. ') + '.' : 'Rien de réglé : je pars de disques de 1,25 kg.';
  }
  function ecranSalle(etat) {
    var rep = etat.rep;
    var plusieurs = salleASeulesTranches(etat.profil);
    var ajuster = plusieurs
      ? [{ type: 'note', texte: 'Tes haltères ont plusieurs séries de tranches : ils se règlent dans Profil, Ma salle.' }]
      : [{ type: 'puces', cle: 'halteresMax', titre: 'Haltères jusqu’à', valeur: rep.halteresMax, options: pucesDe(PUCES_HALTERES_MAX, 'kg') },
         { type: 'puces', cle: 'halteresPas', titre: 'De combien en combien', valeur: rep.halteresPas, options: pucesDe(PUCES_HALTERES_PAS, 'kg') }];
    ajuster.push({ type: 'note', texte: 'Je note la charge des haltères par haltère.' });
    // 190 — le plus petit disque et la barre de traction : les lignes de `Profil.lignesMateriel`, comme dans « Ma salle ».
    Profil().lignesMateriel({ plus_petit_disque: rep.plusPetitDisque, barre_traction: rep.barreTraction }).forEach(function (l) {
      ajuster.push({ type: 'puces', cle: l.cle, titre: l.titre, valeur: l.valeur, options: l.options });
      ajuster.push({ type: 'note', texte: l.aide });
    });
    return {
      id: SALLE, etape: 'Ta salle',
      titre: 'Où tu t’entraînes ?',
      voix: null,
      blocs: [
        { type: 'options', cle: 'materiel', valeur: rep.materiel,
          options: Profil().MATERIELS.map(function (m) { return { cle: m.cle, libelle: m.libelle, sous: m.sous }; }) },
        { type: 'replie', cle: 'salleOuverte', libelle: 'Ajuster Ma salle', ouvert: !!rep.salleOuverte,
          resume: phraseDeLaSalle(rep), blocs: ajuster }
      ]
    };
  }

  // ── 187 (A4) — « Une zone à ménager ? », posée à tout le monde ────────────────
  function ecranZone(etat) {
    var rep = etat.rep;
    var zones = Profil().ZONES_A_MENAGER.concat([{ cle: 'aucune', libelle: 'Aucune' }]);
    var choisies = Array.isArray(rep.menager) ? rep.menager : [];
    return {
      id: ZONE, etape: 'Ton corps · facultatif',
      titre: 'Une zone à ménager ?',
      voix: 'Je ne te proposerai pas de série lourde dessus, et « J’ai mal » sera à portée de main.',
      blocs: [{ type: 'puces', cle: 'zone', multiple: true, valeurs: choisies.length ? choisies : ['aucune'], options: zones }]
    };
  }

  // ── 194-1 — « Des zones raides ? », facultative ──────────────────────────────────────────────────────────────
  function ecranRaides(etat) {
    var rep = etat.rep;
    var zones = Profil().ZONES_RAIDES.concat([{ cle: 'aucune', libelle: 'Aucune' }]);
    var choisies = Array.isArray(rep.raides) ? (rep.raides.length ? rep.raides : ['aucune']) : [];
    return {
      id: RAIDES, etape: 'Ton corps \u00b7 facultatif',
      titre: 'Des zones raides ?',
      voix: 'Celles où tu manques d\u2019amplitude. Je t\u2019ajoute un bloc court en fin de séance pour elles\u00a0; deux zones au plus.',
      blocs: [{ type: 'puces', cle: 'raide', multiple: true, valeurs: choisies, options: zones }]
    };
  }

  // ── 187 (A5) — « Une série récente ? », facultative ───────────────────────────
  // Une série, pas un « max » : charge × reps, pour chacune des quatre barres. Elle devient la charge de départ de la
  // barre (`charge_cible_kg`, MOTEUR §9.21) ; sans elle, la première séance la trouve avec la personne (§9.21, calage).
  var RECENTES = [
    { cle: 'sq', slug: 'squat_barre', nom: 'Squat' },
    { cle: 'co', slug: 'developpe_couche_barre', nom: 'Couché' },
    { cle: 'so', slug: 'souleve_de_terre_barre', nom: 'Soulevé' },
    { cle: 'mi', slug: 'developpe_militaire_barre', nom: 'Militaire' }
  ];
  var RECENTE_KG_MAX = 600, RECENTE_REPS_MAX = 30;
  // Les séries données EN ENTIER (charge ET reps), dans l'ordre des barres : `[{ slug, nom, kg, reps }]`.
  // `depart` : la charge de départ de la barre — la charge de la série récente, ramenée au cran de la barre en dessous
  // (le pas de la barre, `Moteur.pasDeLaBarre` : 2,5 kg sans disque déclaré ; jamais au-dessus de ce que la personne a fait). Ni 1RM estimé, ni pourcentage, ni poids du corps : une série
  // faite, rien de deviné. Dès la première série validée, le coach décide seul (MOTEUR §9.21).
  // 190 — le cran de la barre est celui du moteur, jamais une valeur écrite ici : `plusPetitDisque` (kg par côté) est la réponse
  // en cours de l'écran « Où tu t'entraînes ? », pas encore forcément écrite en base.
  function departDeLaSerie(kg, plusPetitDisque) {
    var pas = Moteur().pasDeLaBarre(plusPetitDisque);
    return Math.round(Math.floor(kg / pas + 1e-9) * pas * 100) / 100;
  }
  function seriesRecentes(rep) {
    var r = rep || {};
    return RECENTES.filter(function (x) { return r['rec_' + x.cle + '_kg'] > 0 && r['rec_' + x.cle + '_reps'] >= 1; })
      .map(function (x) {
        return { slug: x.slug, nom: x.nom, kg: r['rec_' + x.cle + '_kg'], reps: r['rec_' + x.cle + '_reps'],
                 depart: departDeLaSerie(r['rec_' + x.cle + '_kg'], r.plusPetitDisque) };
      });
  }
  function ecranRecente(etat) {
    var rep = etat.rep, erreurs = etat.erreurs || {};
    var champs = [];
    RECENTES.forEach(function (x) {
      champs.push({ cle: 'rec_' + x.cle + '_kg', libelle: x.nom, unite: 'kg', mode: 'decimal',
        valeur: texteDe(etat, 'rec_' + x.cle + '_kg', rep['rec_' + x.cle + '_kg'] || null, true),
        erreur: erreurs['rec_' + x.cle + '_kg'] || null, aide: null });
      champs.push({ cle: 'rec_' + x.cle + '_reps', libelle: x.nom + ', reps', unite: 'reps', mode: 'numeric',
        valeur: texteDe(etat, 'rec_' + x.cle + '_reps', rep['rec_' + x.cle + '_reps'] || null),
        erreur: erreurs['rec_' + x.cle + '_reps'] || null, aide: null });
    });
    return {
      id: RECENTE, etape: 'Ta force · facultatif',
      titre: 'Une série récente ?',
      voix: 'Si tu t’en souviens, ta première séance aura de vraies charges. Sinon, on les trouve ensemble.',
      blocs: [{ type: 'champs', champs: champs }]
    };
  }

  function ecranToi(etat) {
    var rep = etat.rep, erreurs = etat.erreurs || {};
    return {
      id: TOI, etape: 'Toi · facultatif',
      titre: 'Qui es-tu ?',
      voix: 'Ce que tu m’as déjà donné est rempli : vérifie seulement.',
      blocs: [
        { type: 'puces', cle: 'sexe', valeur: rep.sexe, options: Profil().SEXES },
        { type: 'champs', champs: [
          { cle: 'annee', libelle: 'Année de naissance', unite: null, mode: 'numeric',
            valeur: texteDe(etat, 'annee', rep.annee), erreur: erreurs.annee || null,
            // 116 (audit du 16/10/2026, 03 #9), puis 191 (30/10/2026) : l'année a un lecteur — la prudence de montée
            // (`THMoteur.prudenceDeMontee`, QUESTIONNAIRE §1.3). Elle ne change JAMAIS la charge de départ : la phrase le dit.
            aide: 'Elle règle la prudence de tes montées de charge, jamais ta charge de départ.' },
          { cle: 'taille', libelle: 'Taille', unite: 'cm', mode: 'numeric',
            valeur: texteDe(etat, 'taille', rep.taille), erreur: erreurs.taille || null,
            aide: 'Je ne m’en sers pas encore. Avec ton poids, elle pourra aider à choisir tes charges de départ.' },
          { cle: 'poids', libelle: 'Poids', unite: 'kg', mode: 'decimal',
            valeur: texteDe(etat, 'poids', rep.poids, true), erreur: erreurs.poids || null,
            aide: 'Tractions, dips et pompes, et ta force rapportée à ton poids.' }
        ] }
      ]
    };
  }

  function ecranBut(etat) {
    var rep = etat.rep;
    return {
      id: BUT, etape: 'Ton but',
      titre: 'Ton objectif principal ?',
      voix: null,
      blocs: [
        { type: 'puces', cle: 'objectif', valeur: rep.objectif, options: Profil().OBJECTIFS },
        { type: 'options', cle: 'phase', titre: 'Et en ce moment, côté alimentation ?',
          valeur: rep.phase, options: avecSous(Profil().PHASES, SOUS_PHASE) }
      ]
    };
  }

  // 195 — « Où tu en es » : quatre chiffres, pas une séance de test. Un champ laissé vide ou « Je ne sais pas » : le coach part d'une
  // marche prudente et ajuste en deux séances. Les marches de départ se lisent sur la table du générateur, jamais ici.
  var PISTOL = [{ cle: true, libelle: 'Oui' }, { cle: false, libelle: 'Non' }];
  function ecranDepart(etat) {
    var rep = etat.rep, erreurs = etat.erreurs || {};
    var champ = function (cle, libelle) {
      return { cle: cle, libelle: libelle, unite: 'reps', mode: 'numeric', valeur: texteDe(etat, cle, rep[cle]),
               erreur: erreurs[cle] || null, aide: null };
    };
    var marches = Generateur().departDeCalisthenie({ tractions: rep.dep_tractions, pompes: rep.dep_pompes, dips: rep.dep_dips, pistol: rep.dep_pistol });
    var nom = function (s) { return (etat.catalogue && etat.catalogue[s] && etat.catalogue[s].nom) || s; };
    return {
      id: DEPART, etape: 'Où tu en es · facultatif',
      titre: 'Où tu en es ?',
      voix: 'Quatre chiffres, pas une séance de test. « Je ne sais pas » : je pars d’une marche prudente et je t’ajuste en deux séances.',
      blocs: [
        { type: 'champs', champs: [champ('dep_tractions', 'Tractions strictes, d’affilée'), champ('dep_pompes', 'Pompes, d’affilée'),
                                    champ('dep_dips', 'Dips aux barres, d’affilée')] },
        { type: 'puces', cle: 'dep_pistol', titre: 'Squat sur une jambe (pistol)', valeur: rep.dep_pistol, options: PISTOL },
        { type: 'faits', titre: 'Tes marches de départ', lignes: [
          { libelle: 'Tractions', valeur: marches.tractions.map(nom).join(' · ') },
          { libelle: 'Pompes', valeur: marches.pompes.map(nom).join(' · ') },
          { libelle: 'Dips', valeur: marches.dips.map(nom).join(' · ') },
          { libelle: 'Jambes', valeur: marches.jambes.map(nom).join(' · ') } ] }
      ]
    };
  }

  function ecranPriorites(etat) {
    var rep = etat.rep;
    var choix = Array.isArray(rep.priorites) ? rep.priorites : [];
    var enSeche = rep.phase === 'seche';
    return {
      id: PRIORITES, etape: 'Ton but',
      titre: 'Où veux-tu progresser en priorité ?',
      // En sèche, le coach le dit : on garde ses charges, on spécialise en prise
      // de masse (§3, écran 6). Un exercice prioritaire, oui.
      voix: enSeche
        ? 'En sèche, je garde surtout tes charges : une priorité musculaire attendra ta prochaine prise de masse. Un exercice prioritaire, oui.'
        : 'Jusqu’à trois.',
      blocs: [
        { type: 'puces', cle: 'priorite', titre: 'Des exercices', multiple: true, valeurs: choix,
          options: Profil().EXERCICES_PRIORITAIRES },
        { type: 'puces', cle: 'priorite', titre: 'Ou des muscles', multiple: true, valeurs: choix,
          options: Profil().musclesPrioritaires() },
        { type: 'puces', cle: 'aucune', multiple: true,
          valeurs: Array.isArray(rep.priorites) && rep.priorites.length === 0 ? ['aucune'] : [],
          options: [{ cle: 'aucune', libelle: 'Pas de priorité' }] }
      ]
    };
  }

  function ecranTemps(etat) {
    var rep = etat.rep;
    var habituelle = dureeHabituelle(etat.faits);
    var visee = dureeMontree(rep, etat.faits);
    var blocs = [];
    // 187 (A6) — la durée n'est plus rendue comme un fait : le titre est la question. Sans durée connue (ni
    // séances ni réponse), les puces de la durée la demandent d'abord.
    var titre = 'Combien de temps pour t’entraîner, en ce moment ?';
    if (!habituelle && !visee) blocsDeLaDuree(etat, 'Une séance dure en général').forEach(function (b) { blocs.push(b); });
    // 60-2c : « Moins en ce moment », choisi, demande combien JUSTE DESSOUS — quatre puces, la
    // même fonction que la feuille du Profil. Les autres réponses gardent la ligne « Durée visée ».
    var options = avecSous(Profil().TEMPS_REPONSES, SOUS_TEMPS);
    var moins = rep.temps === 'moins';
    if (moins) {
      options.forEach(function (o) {
        if (o.cle === 'moins') o.apres = Profil().pucesDeMoins(rep.duree, habituelle, rep.dureeMoins);
      });
    }
    blocs.push({ type: 'options', cle: 'temps', valeur: rep.temps, options: options });
    // La durée VISÉE : celle du Profil (`duree_seance_min`), ou l'habituelle tant
    // que la personne n'a rien dit. Elle ouvre la feuille du Profil.
    if (visee && !moins) blocs.push({ type: 'ligne', cle: 'duree', libelle: 'Durée visée', valeur: en(visee, 'min') });
    return { id: TEMPS, etape: 'Ton temps', titre: titre, voix: null, blocs: blocs };
  }

  // L'écran 8 (60-3) : les trois chemins. « Garder ce que je fais » n'est proposé qu'avec au moins une
  // séance en base (60-4) : sans elle, il n'aurait rien à retrouver ; les deux autres le sont toujours.
  function ecranProgramme(etat) {
    var options = avecSous(Profil().PROGRAMMES, SOUS_PROGRAMME).filter(function (o) {
      return o.cle !== 'deduit' || !!etat.aDesSeances;
    });
    return {
      id: PROGRAMME, etape: 'Ton programme',
      titre: 'Comment veux-tu t’entraîner ?',
      voix: null,
      blocs: [{ type: 'options', cle: 'programme', valeur: etat.rep.programme, options: options }]
    };
  }

  // L'écran 8b (60-4, QUESTIONNAIRE §3 et §5 bis) : « Construis-le-moi ». Deux questions : les jours (2 à 6,
  // pré-cochés) et une zone à ménager (une ou plusieurs, ou aucune). La voix dit ce que le coach en fait.
  function ecranConstruit(etat) {
    var rep = etat.rep, G = Generateur(), jours = [];
    for (var n = G.JOURS_MIN; n <= G.JOURS_MAX; n++) jours.push({ cle: n, libelle: String(n) });
    return {
      id: CONSTRUIT, etape: 'Ton programme',
      titre: 'Combien de jours par semaine, réalistement ?',
      voix: null,
      blocs: [
        { type: 'puces', cle: 'seances', valeur: rep.seances, options: jours },
        { type: 'voix', texte: 'Ta zone à ménager, je la garde : l’exercice et toutes ses séries, sans série lourde.' }
      ]
    };
  }

  function ecranCoach(etat) {
    var options = Profil().RYTHMES.map(function (r) { return { cle: r.cle, libelle: r.libelle, sous: r.phrase }; });
    options.push({ cle: 'carnet', libelle: Profil().libelleDe(Profil().INTENTIONS, 'entretien'),
                   sous: 'Je me tais : aucune proposition, aucune phrase.' });
    return {
      id: COACH, etape: 'Ton coach',
      titre: 'Comment veux-tu être coaché ?',
      voix: null,
      blocs: [{ type: 'options', cle: 'coach', valeur: etat.rep.coach, options: options }]
    };
  }

  // Le récapitulatif : chaque ligne se change d'un tap (`ecran` : l'écran où
  // elle se répond), et on y REVIENT.
  function ecranRecap(etat) {
    var rep = etat.rep, P = Profil();
    // « Je ne sais pas » écrit une phase vide que le coach compte « maintien » : le récapitulatif
    // le dit (« Maintien (par défaut) »), au mot près comme le Profil — pas « Je ne sais pas ».
    var phase = rep.phase === 'inconnue' ? P.LIBELLE_PHASE_VIDE : (rep.phase ? P.libelleDe(P.PHASES, rep.phase) : null);
    var priorites = Array.isArray(rep.priorites)
      ? (rep.priorites.length ? rep.priorites.map(function (c) { return libelleDePriorite(c); }).join(', ') : 'Pas de priorité')
      : null;
    // « Moins en ce moment » : la durée dite est la puce touchée (ou la durée déjà déclarée) — jamais
    // l'habituelle, qui est un fait et que rien n'écrit.
    var duree = rep.temps === 'moins' ? (rep.dureeMoins || rep.duree || null) : dureeMontree(rep, etat.faits);
    var temps = rep.temps ? P.libelleDe(P.TEMPS_REPONSES, rep.temps) : null;
    var tempsTexte = [duree ? en(duree, 'min') : null, temps ? temps.charAt(0).toLowerCase() + temps.slice(1) : null]
      .filter(Boolean).join(' · ');
    var coach = rep.coach === 'carnet' ? P.libelleDe(P.INTENTIONS, 'entretien') : P.libelleDe(P.RYTHMES, rep.coach);
    var tiret = '—';
    // La ligne « Programme » : seulement si l'écran 8 est du parcours (60-3).
    var visibles = etat.visibles || ecransVisibles({ aDesSeances: etat.aDesSeances, historique: rep.historique,
                                                    programme: rep.programme, depuis: rep.depuis });
    var choixProgramme = (rep.programme && P.libelleDe(P.PROGRAMMES, rep.programme)) || tiret;
    // « Construis-le-moi · 4 jours » : les jours de l'écran 8b suivent le choix.
    if (rep.programme === 'construis' && visibles.indexOf(CONSTRUIT) >= 0 && joursValides(rep.seances)) {
      choixProgramme += ' · ' + en(rep.seances, 'jours');
    }
    // 195 — « Où tu en es » : seulement si l'écran est du parcours (objectif Calisthénie) ; « — » pour ce qui n'est pas dit.
    var ou = function (v, unite) { return typeof v === 'number' ? v + INSECABLE + unite : null; };
    var departTexte = [ou(rep.dep_tractions, 'tractions'), ou(rep.dep_pompes, 'pompes'), ou(rep.dep_dips, 'dips'),
      rep.dep_pistol === true ? 'pistol : oui' : rep.dep_pistol === false ? 'pistol : non' : null].filter(Boolean).join(' · ');
    var depart = visibles.indexOf(DEPART) >= 0
      ? [{ libelle: 'Où tu en es', valeur: departTexte || tiret, ecran: DEPART }]
      : [];
    var programme = visibles.indexOf(PROGRAMME) >= 0
      ? [{ libelle: 'Programme', valeur: choixProgramme, ecran: PROGRAMME }]
      : [];
    return {
      id: RECAP, etape: 'C’est noté',
      titre: 'Voici ce que j’ai compris.',
      voix: rep.coach === 'carnet'
        ? 'Je me tais. Un geste dans Profil si tu veux mes propositions.'
        : (etat.aDesSeances
          // 184 (C1) : « je te propose tes charges » n'est vrai que s'il existe un historique (séances,
          // import, carnet) d'où le coach peut les tirer. Sans lui, la première séance n'a aucune charge à
          // proposer : le coach le dit tel quel.
          ? 'À ta première séance, je te propose tes charges. Tu peux toujours taper autre chose.'
          : 'À ta première séance, on trouve ta charge ensemble. Tu peux toujours taper autre chose.'),
      blocs: [{ type: 'resume', lignes: [
        { libelle: 'But d’entraînement', valeur: (rep.objectif && P.libelleDe(P.OBJECTIFS, rep.objectif)) || tiret, ecran: BUT },
        { libelle: 'Phase', valeur: phase || tiret, ecran: BUT }
      ].concat(depart, [
        { libelle: 'Priorités', valeur: priorites || tiret, ecran: PRIORITES },
        { libelle: 'Temps', valeur: tempsTexte || tiret, ecran: TEMPS },
        { libelle: 'Matériel', valeur: (rep.materiel && P.libelleDe(P.MATERIELS, rep.materiel)) || tiret, ecran: SALLE },
        // 190 — ce qui est réglé dans « Ajuster Ma salle » ; « — » quand c'est « Je ne sais pas ».
        { libelle: 'Plus petit disque', valeur: typeof rep.plusPetitDisque === 'number'
            ? Modele().nombreSigne(rep.plusPetitDisque) + INSECABLE + 'kg' : tiret, ecran: SALLE },
        { libelle: 'Barre de traction', valeur: rep.barreTraction === true ? 'Oui' : rep.barreTraction === false ? 'Non' : tiret, ecran: SALLE },
        { libelle: 'Zone à ménager', valeur: zonesTexte(rep.menager), ecran: ZONE },
        { libelle: 'Zones raides', valeur: Array.isArray(rep.raides) ? (rep.raides.length ? rep.raides.map(function (z) { return Profil().libelleDe(Profil().ZONES_RAIDES, z) || z; }).join(', ') : 'Aucune') : tiret, ecran: RAIDES }
      ]).concat(programme, [
        { libelle: 'Coach', valeur: coach || tiret, ecran: COACH }
      ]) }].concat(premiereSeance(rep, etat))
    };
  }

  // 187 (A7) — « Ta première séance » : le récapitulatif DIT VRAI, exercice par exercice. Des charges proposées quand
  // on en a (un historique, ou une série récente donnée), « on la trouve ensemble » pour le reste, et la zone à ménager.
  var TON_ARTICLE = { epaule: 'Ton épaule', dos: 'Ton dos', genou: 'Ton genou', coude: 'Ton coude', hanche: 'Ta hanche' };
  function zonesTexte(menager) {
    var l = Array.isArray(menager) ? menager : [];
    if (!l.length) return 'Aucune';
    return l.map(function (z) { return Profil().libelleDe(Profil().ZONES_A_MENAGER, z) || z; }).join(', ');
  }
  function listeEt(noms) {
    return noms.length < 2 ? noms.join('') : noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1];
  }
  function premiereSeance(rep, etat) {
    if (rep.coach === 'carnet') return [];
    var lignes = [];
    var recentes = seriesRecentes(rep);
    var sansSeance = !etat.aDesSeances;
    if (!sansSeance) {
      lignes.push({ libelle: 'Tes exercices', valeur: 'je te propose tes charges, d’après tes séances.' });
    } else {
      if (recentes.length) {
        lignes.push({ libelle: majuscule(listeEt(recentes.map(function (x) { return x.nom.toLowerCase(); }))),
                      valeur: 'je te propose tes charges, à partir de tes séries récentes.' });
      }
      lignes.push({ libelle: recentes.length ? 'Les autres exercices' : 'Tous les exercices',
                    valeur: 'on trouve ta charge ensemble à la première séance, en 2 ou 3 séries qui comptent.' });
    }
    (Array.isArray(rep.menager) ? rep.menager : []).forEach(function (z) {
      lignes.push({ libelle: TON_ARTICLE[z] || z, valeur: 'pas de série lourde dessus.' });
    });
    return [{ type: 'faits', titre: 'Ta première séance', lignes: lignes }];
  }

  function libelleDePriorite(cle) { return Profil().libelleDePriorite(cle); }

  var FABRIQUES = {};
  FABRIQUES[BIENVENUE] = ecranBienvenue;
  FABRIQUES[ANCIENNETE] = ecranAnciennete;
  FABRIQUES[SAIT] = ecranSait;
  FABRIQUES[SALLE] = ecranSalle;
  FABRIQUES[ZONE] = ecranZone;
  FABRIQUES[RAIDES] = ecranRaides;
  FABRIQUES[RECENTE] = ecranRecente;
    FABRIQUES[TOI] = ecranToi;
  FABRIQUES[BUT] = ecranBut;
  FABRIQUES[DEPART] = ecranDepart;
  FABRIQUES[PRIORITES] = ecranPriorites;
  FABRIQUES[TEMPS] = ecranTemps;
  FABRIQUES[PROGRAMME] = ecranProgramme;
  FABRIQUES[CONSTRUIT] = ecranConstruit;
  FABRIQUES[COACH] = ecranCoach;
  FABRIQUES[RECAP] = ecranRecap;

  // La vue d'un écran : ce que `Rendu.rendreQuestionnaire` dessine, et rien de
  // plus. Le bouton du bas dit « C'est parti » au premier écran, « Commencer »
  // au dernier, « Continuer » ailleurs. `etat.visibles` : les écrans visibles,
  // dans l'ordre.
  function vueDe(id, etat) {
    var e = etat || {};
    var fabrique = FABRIQUES[id];
    if (!fabrique) return null;
    var vue = fabrique(e);
    var visibles = e.visibles || ecransVisibles({ aDesSeances: e.aDesSeances, historique: e.rep && e.rep.historique,
                                                 programme: e.rep && e.rep.programme, depuis: e.rep && e.rep.depuis, objectif: e.rep && e.rep.objectif });
    var rang = visibles.indexOf(id);
    vue.progression = progression(visibles, id);
    vue.retour = rang > 0;
    vue.bouton = {
      libelle: rang === 0 ? 'C’est parti' : rang === visibles.length - 1 ? 'Commencer'
        : id === ANCIENNETE && e.rep && e.rep.notees === NOTEES_IMPORT && e.rep.depuis !== COMMENCE ? 'Importer mon fichier' : 'Continuer',
      actif: ecranPret(id, e.rep)
    };
    // 60-4 — « Refaire mon programme » (Profil) rejoue l'écran 8b SEUL : pas de barre, pas de « Plus tard », un
    // retour qui ramène au Profil, et un bouton qui dit où il mène (le même que sur la maquette de l'écran).
    if (e.refaire && id === CONSTRUIT) {
      vue.progression = null;
      vue.sansPlusTard = true;
      vue.retour = true;
      vue.bouton.libelle = 'Voir mon programme';
    }
    return vue;
  }

  var api = {
    ECRANS: ECRANS, BIENVENUE: BIENVENUE, ANCIENNETE: ANCIENNETE, SAIT: SAIT, COMMENCE: COMMENCE, DEPUIS: DEPUIS, SALLE: SALLE, ZONE: ZONE, RAIDES: RAIDES, RECENTE: RECENTE, RECENTES: RECENTES,
    seriesRecentes: seriesRecentes, phraseDeLaSalle: phraseDeLaSalle,
    TOI: TOI, BUT: BUT, DEPART: DEPART, PRIORITES: PRIORITES, TEMPS: TEMPS, PROGRAMME: PROGRAMME, CONSTRUIT: CONSTRUIT,
    COACH: COACH, RECAP: RECAP,
    BARRES: BARRES, PUCES_SEANCES: PUCES_SEANCES, get PUCES_DUREES() { return pucesDeDuree(); }, DUREE_PLUS_MIN: DUREE_PLUS_MIN, plusChoisie: plusChoisie,
    aUnHistorique: aUnHistorique,
    joursValides: joursValides, joursPrecoches: joursPrecoches, precocherJours: precocherJours,
    ecransVisibles: ecransVisibles,
    progression: progression,
    ecranSuivant: ecranSuivant,
    ecranPrecedent: ecranPrecedent,
    reponsesInitiales: reponsesInitiales,
    coachDe: coachDe,
    ecranPret: ecranPret,
    coachEnChamps: coachEnChamps,
    champsDeLEcran: champsDeLEcran,
    basculerPriorite: basculerPriorite,
    appliquerChoix: appliquerChoix, apresEcriture: apresEcriture,
    lireChamp: lireChamp,
    lignesDeCeQueJeSais: lignesDeCeQueJeSais,
    dureeMontree: dureeMontree, dureeHabituelle: dureeHabituelle,
    vueDe: vueDe
  };

  racine.THQuestionnaire = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
