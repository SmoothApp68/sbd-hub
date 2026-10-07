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
// l'écran. 60-2b ajoute les lecteurs.
//
// L'ÉCRAN « TON PROGRAMME » (8, 8a, 8b) N'EXISTE PAS ICI : sans programme déduit
// ni générateur, sa réponse n'aurait pas de lecteur (60-3).

(function (racine) {
  'use strict';

  function Profil() { return racine.THProfil; }
  function Poids() { return racine.THPoids; }
  function Modele() { return racine.THModele; }

  var INSECABLE = ' ';

  // ── Les écrans, dans l'ordre ─────────────────────────────────────────────
  var BIENVENUE = 'bienvenue', DONNEES = 'donnees', SAIT = 'sait', SANS_HISTORIQUE = 'sans_historique';
  var TOI = 'toi', BUT = 'but', PRIORITES = 'priorites', TEMPS = 'temps', COACH = 'coach', RECAP = 'recap';
  var ECRANS = [BIENVENUE, DONNEES, SAIT, SANS_HISTORIQUE, TOI, BUT, PRIORITES, TEMPS, COACH, RECAP];

  // L'écran 3a (« Ce que je sais ») ET l'écran 3b (« Sans historique ») : l'un
  // OU l'autre. 3a si la personne a au moins une séance en base et n'a pas
  // répondu « je débute » ; 3b sinon. `contexte` :
  // `{ aDesSeances: bool, historique: 'import' | 'non_note' | 'debutant' | null }`.
  function aUnHistorique(contexte) {
    var c = contexte || {};
    return !!c.aDesSeances && c.historique !== 'debutant';
  }

  function ecransVisibles(contexte) {
    var avec = aUnHistorique(contexte);
    return ECRANS.filter(function (id) {
      if (id === SAIT) return avec;
      if (id === SANS_HISTORIQUE) return !avec;
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

  function phaseSaisie(profil) {
    var v = profil && profil.phase;
    return v === 'prise_de_masse' || v === 'maintien' || v === 'seche' ? v : null;
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
      coach: coachDe(p)
    };
  }

  // « Continuer » : actif partout, SAUF aux écrans qui ont une réponse
  // obligatoire — 2 (l'historique), 5 (l'objectif ET la phase) et 9 (le coach).
  // Tout le reste est facultatif (§1.3) : sans réponse, rien n'est écrit.
  function ecranPret(id, rep) {
    var r = rep || {};
    if (id === DONNEES) return !!r.historique;
    if (id === BUT) return !!r.objectif && !!r.phase;
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
      entrees = { anciennete: r.anciennete, seances_par_semaine: r.seances, duree_seance_min: r.duree };
    } else if (id === TOI) {
      entrees = { sexe: r.sexe, annee_naissance: r.annee, taille_cm: r.taille };
      pesee = Poids().peseeAEcrire(c.pesees, r.poids, c.jour);
    } else if (id === BUT) entrees = { objectif: r.objectif, phase: r.phase };
    else if (id === PRIORITES) entrees = { priorites: r.priorites };
    else if (id === TEMPS) {
      // `duree_seance_min` : seulement si la personne l'a CHANGÉE — la médiane
      // qu'on lui montre n'est pas une réponse.
      entrees = { temps_reponse: r.temps, materiel: r.materiel, duree_seance_min: r.duree };
    } else if (id === COACH) entrees = coachEnChamps(r.coach);
    else if (id === RECAP) entrees = { fait: true };
    return {
      champs: entrees ? Profil().preparerChamps(profil, entrees, c.maintenant) : {},
      pesee: pesee
    };
  }

  // Une priorité qu'on touche : on l'ajoute, ou on la retire ; trois au plus
  // (la quatrième est sans effet) ; « Pas de priorité » (`[]`) est une réponse
  // qui vide la liste.
  function basculerPriorite(liste, cle) {
    var l = Array.isArray(liste) ? liste.slice() : [];
    var i = l.indexOf(cle);
    if (i >= 0) { l.splice(i, 1); return l; }
    if (l.length >= Profil().PRIORITES_MAX) return l;
    l.push(cle);
    return l;
  }

  // ── Les chiffres montrés ─────────────────────────────────────────────────

  function en(n, unite) { return n + INSECABLE + unite; }

  // Les séances (« 164 séances · depuis mai 2025 »), le rythme, la durée
  // habituelle, les maximums aux barres, les autres activités : ce que dit
  // `faits.ceQueJeSais`, mis en mots. Une ligne dont le fait manque n'existe pas.
  var BARRES = ['developpe_couche_barre', 'squat_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre'];
  var NOMS_DES_BARRES = { developpe_couche_barre: 'couché', squat_barre: 'squat',
                          souleve_de_terre_barre: 'soulevé', developpe_militaire_barre: 'militaire' };

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

  // La durée que l'écran « Temps et matériel » montre : la durée habituelle
  // des séances (`faits.ceQueJeSais`), sinon celle que la personne a déjà
  // donnée — jamais les deux. `null` : on la lui demande.
  function dureeMontree(rep, faits) {
    if (faits && faits.dureeMin) return faits.dureeMin;
    return rep && rep.duree ? rep.duree : null;
  }

  // ── Les textes et la forme de chaque écran ───────────────────────────────
  //
  // `etat` : `{ rep, faits, profil, aDesSeances, textes, erreurs }`. `textes` :
  // ce qui est TAPÉ dans les champs (le brouillon des chiffres est un nombre, le
  // champ garde le texte). `erreurs` : `{ champ: phrase }`.
  var PUCES_SEANCES = [2, 3, 4, 5, 6].map(function (n) { return { cle: n, libelle: n === 6 ? '6+' : String(n) }; });
  var PUCES_DUREES = [45, 60, 75, 90, 120].map(function (n) {
    return { cle: n, libelle: n === 120 ? 'Plus' : n + ' min' };
  });

  var SOUS_HISTORIQUE = {
    import: 'Hevy, Strong',
    non_note: 'Trois questions de plus',
    debutant: 'Je pars de zéro avec toi, prudemment'
  };
  var SOUS_TEMPS = {
    moins: 'Je te proposerai des séances plus courtes',
    varie: 'Je te demanderai ton temps avant les longues séances'
  };
  var SOUS_PHASE = { inconnue: 'Je compte comme maintien' };

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
      voix: sansSeance ? 'L’import dans l’app arrive plus tard. Ces trois réponses suffisent pour commencer.' : null,
      blocs: [
        { type: 'options', cle: 'anciennete', valeur: rep.anciennete, options: Profil().ANCIENNETES },
        { type: 'puces', cle: 'seances', titre: 'Combien de séances par semaine ?',
          valeur: rep.seances, options: PUCES_SEANCES },
        { type: 'puces', cle: 'duree', titre: 'Combien de temps par séance ?',
          valeur: rep.duree, options: PUCES_DUREES }
      ]
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
            aide: 'Elle servira à régler la prudence de tes charges de départ, quand je construirai ton programme.' },
          { cle: 'taille', libelle: 'Taille', unite: 'cm', mode: 'numeric',
            valeur: texteDe(etat, 'taille', rep.taille), erreur: erreurs.taille || null,
            aide: 'Avec ton poids, ta corpulence : elle servira à tes charges de départ, quand je construirai ton programme.' },
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
    var duree = dureeMontree(rep, etat.faits);
    var blocs = [];
    var titre;
    if (duree) {
      titre = 'Tes séances durent environ ' + en(duree, 'min') + '.';
    } else {
      titre = 'Combien de temps dure une séance, en général ?';
      blocs.push({ type: 'puces', cle: 'duree', valeur: rep.duree, options: PUCES_DUREES });
    }
    blocs.push({ type: 'options', cle: 'temps', valeur: rep.temps,
                 options: avecSous(Profil().TEMPS_REPONSES, SOUS_TEMPS) });
    // La durée VISÉE : celle du Profil (`duree_seance_min`), ou la durée
    // habituelle qu'on vient de montrer. Elle ouvre la feuille du Profil.
    if (duree) blocs.push({ type: 'ligne', cle: 'duree', libelle: 'Durée visée', valeur: en(duree, 'min') });
    blocs.push({ type: 'puces', cle: 'materiel', titre: 'Où t’entraînes-tu ?',
                 valeur: rep.materiel, options: Profil().MATERIELS.map(function (m) {
                   return { cle: m.cle, libelle: m.libelle };
                 }) });
    return { id: TEMPS, etape: 'Temps et matériel', titre: titre, voix: null, blocs: blocs };
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
    var phase = rep.phase ? P.libelleDe(P.PHASES, rep.phase) : null;
    var priorites = Array.isArray(rep.priorites)
      ? (rep.priorites.length ? rep.priorites.map(function (c) { return libelleDePriorite(c); }).join(', ') : 'Pas de priorité')
      : null;
    var duree = dureeMontree(rep, etat.faits);
    var temps = rep.temps ? P.libelleDe(P.TEMPS_REPONSES, rep.temps) : null;
    var tempsTexte = [duree ? en(duree, 'min') : null, temps ? temps.charAt(0).toLowerCase() + temps.slice(1) : null]
      .filter(Boolean).join(' · ');
    var coach = rep.coach === 'carnet' ? P.libelleDe(P.INTENTIONS, 'entretien') : P.libelleDe(P.RYTHMES, rep.coach);
    var tiret = '—';
    return {
      id: RECAP, etape: 'C’est noté',
      titre: 'Voici ce que j’ai compris.',
      voix: rep.coach === 'carnet'
        ? 'Je me tais. Un geste dans Profil si tu veux mes propositions.'
        : 'À ta première séance, je te propose tes charges. Tu peux toujours taper autre chose.',
      blocs: [{ type: 'resume', lignes: [
        { libelle: 'Objectif', valeur: (rep.objectif && P.libelleDe(P.OBJECTIFS, rep.objectif)) || tiret, ecran: BUT },
        { libelle: 'Phase', valeur: phase || tiret, ecran: BUT },
        { libelle: 'Priorités', valeur: priorites || tiret, ecran: PRIORITES },
        { libelle: 'Temps', valeur: tempsTexte || tiret, ecran: TEMPS },
        { libelle: 'Matériel', valeur: (rep.materiel && P.libelleDe(P.MATERIELS, rep.materiel)) || tiret, ecran: TEMPS },
        { libelle: 'Coach', valeur: coach || tiret, ecran: COACH }
      ] }]
    };
  }

  function libelleDePriorite(cle) {
    var P = Profil();
    return P.libelleDe(P.EXERCICES_PRIORITAIRES, cle) || P.libelleDe(P.musclesPrioritaires(), cle) || cle;
  }

  var FABRIQUES = {};
  FABRIQUES[BIENVENUE] = ecranBienvenue;
  FABRIQUES[DONNEES] = ecranDonnees;
  FABRIQUES[SAIT] = ecranSait;
  FABRIQUES[SANS_HISTORIQUE] = ecranSansHistorique;
  FABRIQUES[TOI] = ecranToi;
  FABRIQUES[BUT] = ecranBut;
  FABRIQUES[PRIORITES] = ecranPriorites;
  FABRIQUES[TEMPS] = ecranTemps;
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
    var visibles = e.visibles || ecransVisibles({ aDesSeances: e.aDesSeances, historique: e.rep && e.rep.historique });
    var rang = visibles.indexOf(id);
    vue.progression = progression(visibles, id);
    vue.retour = rang > 0;
    vue.bouton = {
      libelle: rang === 0 ? 'C’est parti' : rang === visibles.length - 1 ? 'Commencer' : 'Continuer',
      actif: ecranPret(id, e.rep)
    };
    return vue;
  }

  var api = {
    ECRANS: ECRANS, BIENVENUE: BIENVENUE, DONNEES: DONNEES, SAIT: SAIT, SANS_HISTORIQUE: SANS_HISTORIQUE,
    TOI: TOI, BUT: BUT, PRIORITES: PRIORITES, TEMPS: TEMPS, COACH: COACH, RECAP: RECAP,
    BARRES: BARRES, PUCES_SEANCES: PUCES_SEANCES, PUCES_DUREES: PUCES_DUREES,
    aUnHistorique: aUnHistorique,
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
    lignesDeCeQueJeSais: lignesDeCeQueJeSais,
    dureeMontree: dureeMontree,
    vueDe: vueDe
  };

  racine.THQuestionnaire = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
