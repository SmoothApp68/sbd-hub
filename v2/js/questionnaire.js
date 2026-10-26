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

  var INSECABLE = ' ';

  // ── Les écrans, dans l'ordre ─────────────────────────────────────────────
  var BIENVENUE = 'bienvenue', DONNEES = 'donnees', SAIT = 'sait', SANS_HISTORIQUE = 'sans_historique';
  var TOI = 'toi', BUT = 'but', PRIORITES = 'priorites', TEMPS = 'temps', PROGRAMME = 'programme';
  var CONSTRUIT = 'construit';   // l'écran 8b (60-4) : « Construis-le-moi »
  var COACH = 'coach', RECAP = 'recap';
  var ECRANS = [BIENVENUE, DONNEES, SAIT, SANS_HISTORIQUE, TOI, BUT, PRIORITES, TEMPS, PROGRAMME, CONSTRUIT,
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

  function ecransVisibles(contexte) {
    var avec = aUnHistorique(contexte);
    return ECRANS.filter(function (id) {
      if (id === SAIT) return avec;
      if (id === SANS_HISTORIQUE) return !avec;
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

  // `contexte.poids` : la dernière pesée (un nombre), ou `null`.
  function reponsesInitiales(profil, contexte) {
    var p = profil || {}, c = contexte || {};
    var nul = function (v) { return v === undefined ? null : v; };
    return {
      historique: nul(p.historique_declare),
      anciennete: nul(p.anciennete),
      seances: nul(p.seances_par_semaine),
      duree: nul(p.duree_seance_min),
      sexe: nul(p.sexe),
      annee: anneeDe(p.date_naissance),
      taille: nul(p.taille_cm),
      poids: nul(c.poids),
      objectif: nul(p.objectif),
      phase: phaseSaisie(p),
      priorites: Array.isArray(p.priorites) ? p.priorites.slice() : null,
      temps: nul(p.temps_reponse),
      materiel: nul(p.materiel),
      programme: Profil().libelleDe(Profil().PROGRAMMES, p.programme_choix) ? p.programme_choix : null,
      menager: Profil().zonesAMenagerValides(p.zones_a_menager) || [],
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
    if (id === DONNEES) return !!r.historique;
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
  // noms du Profil (Prudent · Normal · Franc) — un seul langage ; « Juste un
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
    var entrees = null, pesee = null;
    if (id === DONNEES) entrees = { historique_declare: r.historique };
    else if (id === SANS_HISTORIQUE) {
      entrees = { anciennete: r.anciennete, seances_par_semaine: seancesAEcrire(r), duree_seance_min: r.duree };
    } else if (id === TOI) {
      entrees = { sexe: r.sexe, annee_naissance: r.annee, taille_cm: r.taille };
      pesee = Poids().peseeAEcrire(c.pesees, r.poids, c.jour);
    } else if (id === BUT) entrees = { objectif: r.objectif, phase: r.phase };
    else if (id === PRIORITES) entrees = { priorites: r.priorites };
    else if (id === TEMPS) {
      // `duree_seance_min` : seulement si la personne l'a CHANGÉE — la médiane
      // qu'on lui montre n'est pas une réponse.
      // 60-2c : « Moins en ce moment » demande combien — la puce touchée EST la durée visée
      // (même colonne, même écriture) ; sans puce, la durée reste ce qu'elle était.
      entrees = { temps_reponse: r.temps, materiel: r.materiel,
                  duree_seance_min: r.temps === 'moins' && r.dureeMoins ? r.dureeMoins : r.duree };
    } else if (id === PROGRAMME) entrees = { programme_choix: r.programme };
    else if (id === CONSTRUIT) entrees = { seances_par_semaine: seancesAEcrire(r), zones_a_menager: r.menager };
    else if (id === COACH) entrees = coachEnChamps(r.coach);
    else if (id === RECAP) entrees = { fait: true };
    return {
      champs: entrees ? Profil().preparerChamps(profil, entrees, c.maintenant) : {},
      pesee: pesee
    };
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
  var CHOIX = ['historique', 'anciennete', 'seances', 'duree', 'dureeMoins', 'sexe', 'objectif', 'phase',
               'temps', 'materiel', 'programme', 'coach'];

  function appliquerChoix(rep, cle, valeur) {
    var r = Object.assign({}, rep);
    if (cle === 'priorite') r.priorites = basculerPriorite(r.priorites, valeur);
    else if (cle === 'aucune') r.priorites = [];
    else if (cle === 'zone') r.menager = Profil().basculerZone(r.menager, valeur);
    else if (cle === 'duree') {
      // 137 — « Plus » ne porte pas de durée : elle ouvre le champ des minutes. Une durée déjà au-delà des
      // puces est gardée ; sinon rien n'est en réponse tant que la personne n'a pas tapé ses minutes.
      if (valeur === 'plus') {
        r.dureePlus = true;
        if (!(typeof r.duree === 'number' && r.duree >= DUREE_PLUS_MIN)) r.duree = null;
      } else { r.duree = valeur; r.dureePlus = false; }
    } else if (CHOIX.indexOf(cle) >= 0) {
      r[cle] = valeur;
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

  var SOUS_HISTORIQUE = {
    import: 'Hevy, Strong',
    non_note: 'Trois questions de plus',
    debutant: 'Je pars de zéro avec toi, prudemment'
  };
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
          { libelle: 'Tes données', valeur: 'ce que je sais déjà' },
          { libelle: 'Toi', valeur: '4 réponses, facultatives' },
          { libelle: 'Ton but', valeur: 'objectif, phase, priorités' },
          { libelle: 'Ton coach', valeur: 'comment je te parle' }
        ] },
        { type: 'note', texte: 'Tout se change ensuite dans Profil.' }
      ]
    };
  }

  function ecranDonnees(etat) {
    return {
      id: DONNEES, etape: 'Tes données',
      titre: 'Tu as déjà un historique d’entraînement ?',
      voix: 'C’est lui qui me dit le plus de choses sur toi.',
      blocs: [{ type: 'options', cle: 'historique', valeur: etat.rep.historique,
                options: avecSous(Profil().HISTORIQUES, SOUS_HISTORIQUE) }]
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

  function ecranSansHistorique(etat) {
    var rep = etat.rep;
    var sansSeance = rep.historique === 'import' && !etat.aDesSeances;
    return {
      id: SANS_HISTORIQUE, etape: 'Tes données',
      titre: 'Depuis quand t’entraînes-tu régulièrement ?',
      // 69 (K2) — l'import existe : la phrase dit où le trouver (ECRAN-PROFIL §2.4 quater).
      voix: sansSeance ? 'Tu pourras importer tes séances depuis Profil, « Importer depuis Hevy ». Ces trois réponses suffisent pour commencer.' : null,
      blocs: [
        { type: 'options', cle: 'anciennete', valeur: rep.anciennete, options: Profil().ANCIENNETES },
        { type: 'puces', cle: 'seances', titre: 'Combien de séances par semaine ?',
          valeur: rep.seances, options: PUCES_SEANCES }
      ].concat(blocsDeLaDuree(etat, 'Combien de temps par séance ?'))
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
            // 116 (audit du 16/10/2026, 03 #9) — rien ne lit l'âge ni la taille (le programme construit ne pose jamais
            // de charge, QUESTIONNAIRE §5 bis) : la phrase dit ce qui est vrai, sans promettre.
            aide: 'Je ne m’en sers pas encore. Elle pourra régler la prudence de tes charges de départ.' },
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
    var titre;
    if (habituelle || visee) {
      // Avec des séances, le titre dit ce qu'elles montrent ; sans, ce que la
      // personne a déjà répondu (« jamais les deux »).
      titre = 'Tes séances durent environ ' + en(habituelle || visee, 'min') + '.';
    } else {
      titre = 'Combien de temps dure une séance, en général ?';
      blocsDeLaDuree(etat, null).forEach(function (b) { blocs.push(b); });
    }
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
    blocs.push({ type: 'puces', cle: 'materiel', titre: 'Où t’entraînes-tu ?',
                 valeur: rep.materiel, options: Profil().MATERIELS.map(function (m) {
                   return { cle: m.cle, libelle: m.libelle };
                 }) });
    return { id: TEMPS, etape: 'Temps et matériel', titre: titre, voix: null, blocs: blocs };
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
    var zones = Profil().ZONES_A_MENAGER.concat([{ cle: 'aucune', libelle: 'Aucune' }]);
    var choisies = Array.isArray(rep.menager) ? rep.menager : [];
    return {
      id: CONSTRUIT, etape: 'Ton programme',
      titre: 'Combien de jours par semaine, réalistement ?',
      voix: null,
      blocs: [
        { type: 'puces', cle: 'seances', valeur: rep.seances, options: jours },
        { type: 'puces', cle: 'zone', titre: 'Une zone à ménager ?', multiple: true,
          valeurs: choisies.length ? choisies : ['aucune'], options: zones },
        { type: 'voix', texte: 'Je garde l’exercice et toutes ses séries, sans série lourde. Rien en séance : ' +
                                'si ça fait mal, « J’ai mal » est là.' }
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
                                                    programme: rep.programme });
    var choixProgramme = (rep.programme && P.libelleDe(P.PROGRAMMES, rep.programme)) || tiret;
    // « Construis-le-moi · 4 jours » : les jours de l'écran 8b suivent le choix.
    if (rep.programme === 'construis' && visibles.indexOf(CONSTRUIT) >= 0 && joursValides(rep.seances)) {
      choixProgramme += ' · ' + en(rep.seances, 'jours');
    }
    var programme = visibles.indexOf(PROGRAMME) >= 0
      ? [{ libelle: 'Programme', valeur: choixProgramme, ecran: PROGRAMME }]
      : [];
    return {
      id: RECAP, etape: 'C’est noté',
      titre: 'Voici ce que j’ai compris.',
      voix: rep.coach === 'carnet'
        ? 'Je me tais. Un geste dans Profil si tu veux mes propositions.'
        : 'À ta première séance, je te propose tes charges. Tu peux toujours taper autre chose.',
      blocs: [{ type: 'resume', lignes: [
        { libelle: 'But d’entraînement', valeur: (rep.objectif && P.libelleDe(P.OBJECTIFS, rep.objectif)) || tiret, ecran: BUT },
        { libelle: 'Phase', valeur: phase || tiret, ecran: BUT },
        { libelle: 'Priorités', valeur: priorites || tiret, ecran: PRIORITES },
        { libelle: 'Temps', valeur: tempsTexte || tiret, ecran: TEMPS },
        { libelle: 'Matériel', valeur: (rep.materiel && P.libelleDe(P.MATERIELS, rep.materiel)) || tiret, ecran: TEMPS }
      ].concat(programme, [
        { libelle: 'Coach', valeur: coach || tiret, ecran: COACH }
      ]) }]
    };
  }

  function libelleDePriorite(cle) { return Profil().libelleDePriorite(cle); }

  var FABRIQUES = {};
  FABRIQUES[BIENVENUE] = ecranBienvenue;
  FABRIQUES[DONNEES] = ecranDonnees;
  FABRIQUES[SAIT] = ecranSait;
  FABRIQUES[SANS_HISTORIQUE] = ecranSansHistorique;
  FABRIQUES[TOI] = ecranToi;
  FABRIQUES[BUT] = ecranBut;
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
                                                 programme: e.rep && e.rep.programme });
    var rang = visibles.indexOf(id);
    vue.progression = progression(visibles, id);
    vue.retour = rang > 0;
    vue.bouton = {
      libelle: rang === 0 ? 'C’est parti' : rang === visibles.length - 1 ? 'Commencer' : 'Continuer',
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
    ECRANS: ECRANS, BIENVENUE: BIENVENUE, DONNEES: DONNEES, SAIT: SAIT, SANS_HISTORIQUE: SANS_HISTORIQUE,
    TOI: TOI, BUT: BUT, PRIORITES: PRIORITES, TEMPS: TEMPS, PROGRAMME: PROGRAMME, CONSTRUIT: CONSTRUIT,
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
