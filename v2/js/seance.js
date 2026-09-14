// v2/js/seance.js — la séance en cours. Module PUR.
//
// Aucun DOM, aucun réseau, aucun IndexedDB : la séance est une VALEUR, et
// chaque geste rend une nouvelle valeur. C'est ce qui rend l'ensemble testable
// sans navigateur — et c'est surtout ce qui permet de l'écrire entière sur le
// disque après chaque geste, sans se demander ce qui a changé.
//
// ══ CE QUE LA BASE IMPOSE, RELEVÉ AU SCHÉMA ════════════════════════════════
//
//   sets_validee_si_saisie   source <> 'app' OR validee_a IS NOT NULL
//     → une série non validée NE PEUT PAS être insérée. Pré-créer les lignes
//       vides d'une routine au démarrage est mécaniquement impossible, et c'est
//       tant mieux : la chronologie ne peut plus être fausse dès le premier
//       jour. Les séries vides vivent donc EN LOCAL uniquement.
//
//   sets_rang_positif        rang >= 1        (et non 0)
//   sets_rang_unique         UNIQUE (session_id, rang) DEFERRABLE INITIALLY DEFERRED
//   sets_type_serie_ok       echauffement | travail | degressive | echec
//   sets_ressenti_ok         reste_3_plus | reste_2 | reste_1 | reste_0
//   sets_rpe_ok              rpe > 0 AND rpe <= 10
//   sets_repos_borne         repos_s BETWEEN 0 AND 3600
//   sets_source_ok           app | hevy | import | collage
//   sessions_statut_ok       en_cours | terminee   — DÉFAUT 'terminee'
//
// ⚠️ `sessions.statut` vaut **'terminee' par défaut**. Une séance créée sans
// statut explicite serait immédiatement réputée finie et polluerait
// l'historique et le moteur. On l'écrit toujours.

(function (racine) {
  'use strict';

  var TYPES = ['travail', 'echauffement', 'degressive', 'echec'];
  var RESSENTIS = ['reste_3_plus', 'reste_2', 'reste_1', 'reste_0'];
  var EN_COURS = 'en_cours', TERMINEE = 'terminee';
  var REPOS_MAX = 3600;
  // Bornes relevées sur les CHECK de la base, pas supposées :
  //   routine_exos_repos_borne   repos_cible_s NULL ou 5 à 1800
  //   sessions_salle_non_vide    salle NULL ou 1 à 60 caractères
  var REPOS_CIBLE_MIN = 5, REPOS_CIBLE_MAX = 1800;
  var SALLE_MAX = 60;

  // ⚠️ LISTE BLANCHE des colonnes de `sets` que cet écran écrit. Ce qui n'y
  // figure pas ne part pas : tempo, élastique et superset appartiennent à
  // d'autres chantiers, et `elastique_norme`/`salle_norme` sont GÉNÉRÉES —
  // les écrire ferait échouer la requête. `note` en fait partie depuis le
  // chantier 26 (§7 septies.1) ; elle est projetée par `noteDeSerie`.
  // ⚠️ `CHAMPS_SERIE` a été SUPPRIMÉE ici au chantier 24. Posée au chantier 22
  // comme « liste blanche des colonnes envoyées », elle était exportée et
  // **lue par personne** — `lignes()` construit sa ligne à la main. Le banc de
  // mutation l'a établi : la retirer ne faisait tomber aucun test, ni unitaire
  // ni d'écran. Une liste blanche que rien n'applique n'est pas une garantie,
  // c'est une garantie APPARENTE — exactement le piège n° 2 de
  // `SCHEMA-REEL.md`, la valeur écrite dont personne ne se sert. La seule
  // source des colonnes envoyées est `lignes()`, plus bas.

  // ══ LES COLONNES, DÉCLARÉES UNE SEULE FOIS ═══════════════════════════════
  //
  // ⚠️ CE QUI S'ÉCRIT DOIT SE RELIRE. C'est la cause du chantier 34, et elle
  // n'était pas dans les trois colonnes oubliées : elle était dans le fait que
  // DEUX listes existaient, l'une dans ce fichier (ce que `lignes()` envoie),
  // l'autre dans `donnees.js` (ce que le `select` demande), et que rien ne les
  // reliait. La seconde était plus COURTE de trois colonnes — `user_id`,
  // `ressenti`, `repos_s` — et un écart de cette forme ne peut produire qu'une
  // chose : la valeur part en base, ne revient pas, et la correction suivante
  // la réécrit à null. Trois pertes de données pour une liste mal recopiée.
  //
  // `donnees.js` CONSTRUIT désormais ses `select` à partir d'ici. La liste lue
  // est donc un SUR-ENSEMBLE de la liste écrite par construction : l'écart
  // n'est plus corrigé, il est devenu impossible. Et `verifierColonnes()`
  // (plus bas) compare ce que `lignes()` émet RÉELLEMENT à cette déclaration,
  // au démarrage — parce qu'une déclaration que le code contourne serait
  // exactement la garantie apparente que ce dépôt traque.
  //
  // Ce qui n'y figure pas ne part PAS : `elastique_norme` et `salle_norme` sont
  // GÉNÉRÉES (les écrire fait échouer la requête), `poids_corps_kg`,
  // `elastique` et les `tempo_*` appartiennent à d'autres chantiers. Le SDK
  // pose `?columns=` avec l'union des clés envoyées, donc une colonne absente
  // de la charge utile n'est NI insérée NI mise à jour : elle garde sa valeur.
  var COLONNES_SET = [
    'id', 'session_id', 'user_id', 'exercise_slug', 'source', 'type_serie',
    'charge_kg', 'reps', 'duree_s', 'distance_m', 'rpe', 'ressenti', 'note',
    'groupe_superset', 'validee_a', 'rang', 'repos_s'
  ];
  // Lues, jamais écrites : le serveur les pose lui-même.
  var COLONNES_SET_EN_PLUS = ['created_at', 'modifie_a'];

  var COLONNES_SESSION = [
    'id', 'user_id', 'debut', 'fin', 'titre', 'note', 'salle', 'routine_id',
    'source', 'statut'
  ];
  // `salle_norme` est GÉNÉRÉE : lue pour l'affichage, jamais envoyée.
  var COLONNES_SESSION_EN_PLUS = ['created_at', 'salle_norme'];

  function copie(o) { return Object.assign({}, o); }

  // Recopie la séance en ne clonant QUE la branche touchée. Une séance fait
  // quelques dizaines de séries : le coût est nul, et l'immuabilité vaut mieux
  // qu'une micro-économie sur un écran qu'on écrit sur disque à chaque geste.
  function avecExercices(seance, exercices) {
    return Object.assign({}, seance, { exercices: exercices });
  }

  function avecSerie(seance, iExo, iSerie, champs) {
    var exos = seance.exercices.slice();
    var exo = copie(exos[iExo]);
    exo.series = exo.series.slice();
    exo.series[iSerie] = Object.assign({}, exo.series[iSerie], champs);
    exos[iExo] = exo;
    return avecExercices(seance, exos);
  }

  // ── Créer ───────────────────────────────────────────────────────────────
  //
  // `id` est fabriqué par l'appelant (uuid v4). C'est lui qui rend l'envoi
  // idempotent : la même séance envoyée deux fois écrase la même ligne.
  function creer(options) {
    var o = options || {};
    // ⚠️ NORMALISÉE À LA CRÉATION (§7 decies). Une routine peut porter un
    // `groupe_superset` à UN seul exercice — 13 blocs dans cet état ont été
    // trouvés en base et nettoyés par `v2_041`. Sans ce passage, la séance le
    // recopierait, puis `lignes()` le réécrirait dans `sets` : l'état interdit
    // se recréerait tout seul, depuis une routine ancienne.
    return normaliserGroupes({
      id: o.id,
      user_id: o.userId || null,
      debut: o.debut || new Date().toISOString(),
      fin: null,
      titre: o.titre || null,
      routine_id: (o.routine && o.routine.id) || null,
      statut: EN_COURS,
      // La structure vient de la routine, JAMAIS les charges (ECRAN-SAISIE §1.1).
      exercices: ((o.routine && o.routine.exercices) || []).map(function (e) {
        return exerciceDepuisRoutine(e, o.idSerie);
      })
    });
  }

  // ⚠️ `routine_exercise_id` est la SEULE jointure fiable vers la ligne de
  // routine dont cet exercice est issu. Le slug ne suffit pas : rien n'interdit
  // le même exercice deux fois dans une routine, et la question de fin (§6)
  // écrirait alors sur la mauvaise ligne. Un exercice ajouté en séance n'en a
  // pas — c'est une déviation de structure, hors périmètre de ce chantier.
  //
  // `note` vient de `routine_exercises.note` : c'est ce qui fait qu'une note
  // SUIT l'exercice quand on réutilise la routine (§7 septies.1).
  function exerciceDepuisRoutine(e, idSerie) {
    var n = Math.max(1, Math.min(20, Number(e.series) || 1));
    var series = [];
    for (var i = 0; i < n; i++) series.push(serieVide(idSerie));
    return {
      exercise_slug: e.exercise_slug,
      routine_exercise_id: e.id === undefined ? null : e.id,
      reps_visees: e.reps_visees === undefined ? null : e.reps_visees,
      repos_cible_s: e.repos_cible_s === undefined ? null : e.repos_cible_s,
      note: texteOuNul(e.note),
      // Le superset VIENT de la routine, il ne se crée pas en séance (§5 du
      // chantier 27 : grouper appartient au chantier de la déviation).
      groupe_superset: e.groupe_superset === undefined ? null : e.groupe_superset,
      series: series
    };
  }

  // ══ LES GESTES SUR UNE SÉANCE TERMINÉE (§7 octies) ═══════════════════════
  //
  // ⚠️ LES DEUX PARTENT DES *BLOCS*, PAS DES LIGNES BRUTES. Recomposer des
  // exercices depuis `sets` demande de savoir où un bloc commence et quelles
  // lignes appartiennent à quelle branche — c'est exactement le travail de
  // `THModele.construireBlocs`, qui rend déjà le détail. En écrire une seconde
  // version ici, c'est deux découpages à tenir d'accord : l'appelant passe les
  // blocs, comme il passe déjà les tours faits à `avancerTours`.

  function exercicesDepuisBlocs(blocs, options) {
    var o = options || {};
    return (blocs || []).reduce(function (acc, bloc) {
      bloc.exercices.forEach(function (exo) {
        // La note d'exercice est PROJETÉE sur chaque série à l'écriture
        // (`noteDeSerie`). Au retour, une note partagée par toutes les lignes
        // est donc la note de l'exercice ; sinon elle appartient aux lignes.
        var notes = exo.series.map(function (s) { return texteOuNul(s.note); });
        var commune = notes.length && notes.every(function (n) { return n === notes[0]; })
          ? notes[0] : null;
        acc.push({
          exercise_slug: exo.slug,
          // `sets` ne porte pas la ligne de routine : une séance reprise ou
          // refaite n'en dépend plus, et c'est juste — elle a pu diverger.
          routine_exercise_id: null,
          reps_visees: null,
          repos_cible_s: null,
          note: commune,
          // §7 decies — le numéro est recopié tel quel, et c'est
          // `normaliserGroupes` (en sortie des deux fonctions ci-dessous) qui
          // dissout les groupes à un seul exercice. ⚠️ Un `bloc.superset ? … :
          // null` a été écrit ici puis RETIRÉ : la campagne de mutation l'a
          // montré strictement équivalent — une seconde garde devant celle qui
          // fait le travail ne protège de rien et laisse croire l'inverse.
          groupe_superset: bloc.groupe === undefined ? null : bloc.groupe,
          series: exo.series.map(function (ligne) {
            // Refaire reprend la STRUCTURE et les notes, jamais les charges :
            // le moteur décide des charges (§1, §7 septies.1).
            if (o.vider) {
              var vide = serieVide(o.idSerie);
              vide.type_serie = ligne.type_serie || 'travail';
              return vide;
            }
            return {
              id: ligne.id,
              // ⚠️ DEUX CHAMPS QUI NE S'AFFICHENT PAS ET QUI COMPTENT (ch. 34).
              // `source` dit d'où vient la ligne — c'est lui qui décide si elle
              // doit EXISTER en base (voir `partEnBase`) ; `rang_origine` porte
              // le rang lu en base, pour ne pas renuméroter une séance qu'on
              // n'a fait que rouvrir. Ni l'un ni l'autre n'est une colonne du
              // modèle affiché : `lignes()` les traduit, `rendu.js` les ignore.
              source: ligne.source === undefined ? null : ligne.source,
              rang_origine: typeof ligne.rang === 'number' ? ligne.rang : null,
              type_serie: ligne.type_serie || 'travail',
              charge_kg: ligne.charge_kg === undefined ? null : ligne.charge_kg,
              reps: ligne.reps === undefined ? null : ligne.reps,
              duree_s: ligne.duree_s === undefined ? null : ligne.duree_s,
              distance_m: ligne.distance_m === undefined ? null : ligne.distance_m,
              rpe: ligne.rpe === undefined ? null : ligne.rpe,
              ressenti: ligne.ressenti === undefined ? null : ligne.ressenti,
              note: commune === null ? texteOuNul(ligne.note) : null,
              validee_a: ligne.validee_a || null,
              repos_s: ligne.repos_s === undefined ? null : ligne.repos_s
            };
          })
        });
      });
      return acc;
    }, []);
  }

  // ROUVRIR une séance terminée pour la corriger (§7 octies.2).
  //
  // ⚠️ ELLE RESTE `terminee`, ET SA FIN NE BOUGE PAS. La repasser `en_cours`
  // la ferait sortir des totaux et du relevé pendant l'édition (§7 quinquies,
  // filtre du chantier 23) : les chiffres de la semaine changeraient sous les
  // yeux, et une app tuée au milieu laisserait la séance invisible dans
  // l'historique jusqu'à ce qu'on pense à la rouvrir. Corriger une séance ne
  // doit pas la faire disparaître.
  function reprendre(session, blocs) {
    if (!session) return null;
    return normaliserGroupes({
      id: session.id,
      user_id: session.user_id || null,
      debut: session.debut,
      fin: session.fin || null,
      titre: session.titre || null,
      routine_id: session.routine_id || null,
      salle: session.salle || null,
      note: session.note || null,
      statut: session.statut || TERMINEE,
      exercices: exercicesDepuisBlocs(blocs)
    });
  }

  // REFAIRE une séance (§7 octies.3) — ce n'est pas une copie dans l'historique,
  // c'est un DÉMARRAGE : une troisième entrée vers la saisie, à côté de la
  // routine et de la séance vide. La structure et les notes reviennent, aucune
  // charge ne revient.
  function refaire(options) {
    var o = options || {};
    return normaliserGroupes({
      id: o.id,
      user_id: o.userId || null,
      debut: o.debut || new Date().toISOString(),
      fin: null,
      titre: o.titre || null,
      // La routine d'origine n'est PAS reprise : refaire une séance, ce n'est
      // pas dérouler la routine, et la question de fin (§6) n'aurait rien de
      // sensé à comparer.
      routine_id: null,
      statut: EN_COURS,
      exercices: exercicesDepuisBlocs(o.blocs, { vider: true, idSerie: o.idSerie })
    });
  }

  // ⚠️ UNE CHAÎNE EST UN IDENTIFIANT VALIDE (chantier 33). Ce contrat
  // n'acceptait qu'une FONCTION et rendait `null` pour tout le reste :
  // `ajouterSerie` et `ajouterExercice` lui passaient `uuid()`, donc une
  // chaîne, donc toute série ajoutée À LA MAIN naissait sans identité. Elle
  // partait ensuite en base où `sets.id` est uuid NOT NULL — 23502, que la
  // file classe DÉFINITIF — et l'entrée se bloquait avec toute la file
  // derrière elle. Corriger les deux appelants aurait laissé la mine armée
  // pour le prochain : c'est le contrat qui était faux.
  function serieVide(idSerie) {
    return {
      id: typeof idSerie === 'function' ? idSerie() : (idSerie || null),
      type_serie: 'travail',
      charge_kg: null, reps: null, duree_s: null, distance_m: null,
      rpe: null, ressenti: null, note: null,
      validee_a: null, repos_s: null
    };
  }

  function sansIdentifiant(serie) { return !serie || !serie.id; }

  // ⚠️ UN CACHE ÉCRIT PAR LA VERSION D'AVANT NE PORTE PAS `source` (ch. 34).
  // Rouvrir une telle séance en correction la ferait passer pour absente de la
  // base — c'est le défaut qu'on vient de corriger, rejoué depuis le disque.
  // Pur et exporté : c'est `app.js` qui décide quoi en faire, mais c'est ici
  // que la règle est éprouvable.
  function provenanceIncomplete(series) {
    var liste = series || [];
    return liste.length > 0 && liste.some(function (s) { return !s || s.source === undefined; });
  }

  // ⚠️ AUCUNE SÉRIE NE DOIT EXISTER SANS IDENTIFIANT (chantier 33).
  //
  // On SÈME plutôt que de refuser : la série est déjà faite, et du travail fait
  // est irrécupérable. Refuser ici perdrait ce qu'on essaie de sauver.
  //
  // Rend la séance INCHANGÉE, à l'identité près, quand rien ne manque : l'appel
  // est donc gratuit sur le chemin normal, et sûr à répéter. C'est ce qui
  // permet de l'appeler depuis la sauvegarde, par où passe chaque geste.
  function semerIdentifiants(seance, idSerie) {
    if (!seance || !seance.exercices) return seance;
    var change = false;
    var exos = seance.exercices.map(function (exo) {
      if (!exo || !exo.series || !exo.series.some(sansIdentifiant)) return exo;
      change = true;
      var neuf = copie(exo);
      neuf.series = exo.series.map(function (serie) {
        if (!sansIdentifiant(serie)) return serie;
        return Object.assign({}, serie, { id: serieVide(idSerie).id });
      });
      return neuf;
    });
    return change ? avecExercices(seance, exos) : seance;
  }

  // Un texte saisi, ou rien. `''` n'est PAS une valeur : une note vide est une
  // absence de note, et `sessions_salle_non_vide` (CHECK, 1 à 60 caractères)
  // refuserait la chaîne vide — la séance ne monterait alors plus jamais.
  function texteOuNul(v, max) {
    if (v === null || v === undefined) return null;
    var t = String(v).trim();
    if (!t) return null;
    // ⚠️ ON TRONQUE PLUTÔT QUE DE REFUSER. Un dépassement de borne remonte en
    // 23514, que la file classe DÉFINITIVE : la séance serait perdue pour une
    // salle trop longue. Perdre trois caractères vaut mieux que perdre la
    // séance — et le champ porte déjà un `maxlength` qui rend le cas théorique.
    return (max && t.length > max) ? t.slice(0, max) : t;
  }

  // ── Structure ───────────────────────────────────────────────────────────
  function ajouterExercice(seance, slug, idSerie, options) {
    var o = options || {};
    var exos = seance.exercices.concat([{
      exercise_slug: slug,
      routine_exercise_id: null,
      reps_visees: o.reps_visees === undefined ? null : o.reps_visees,
      repos_cible_s: o.repos_cible_s === undefined ? null : o.repos_cible_s,
      note: texteOuNul(o.note),
      // Un exercice ajouté en séance est un bloc d'un seul : on ne groupe pas
      // ici (§5 du chantier 27).
      groupe_superset: null,
      series: [serieVide(idSerie)]
    }]);
    return avecExercices(seance, exos);
  }

  function retirerExercice(seance, iExo) {
    var exos = seance.exercices.slice();
    exos.splice(iExo, 1);
    return avecExercices(seance, exos);
  }

  function ajouterSerie(seance, iExo, idSerie) {
    var exos = seance.exercices.slice();
    var exo = copie(exos[iExo]);
    exo.series = exo.series.concat([serieVide(idSerie)]);
    exos[iExo] = exo;
    return avecExercices(seance, exos);
  }

  function retirerSerie(seance, iExo, iSerie) {
    var exos = seance.exercices.slice();
    var exo = copie(exos[iExo]);
    exo.series = exo.series.slice();
    exo.series.splice(iSerie, 1);
    exos[iExo] = exo;
    return avecExercices(seance, exos);
  }

  // ══ LA DÉVIATION — ÉDITION DE LISTE, PAS CALCUL (§5.1) ═══════════════════
  //
  // « Le moteur ne sait même pas qu'il y a eu déviation. » Tout ce qui suit
  // déplace, groupe et remplace des entrées d'un tableau ; rien n'y calcule,
  // rien n'y suppose, et aucune de ces fonctions ne connaît la notion de bloc.
  // Les indices de bloc arrivent de l'appelant (`THModele.blocsDeSeance`) —
  // même règle que `avancerTours`, et c'est ce qui garde ce module pur.
  //
  // ⚠️ UN SUPERSET EST UNE SUITE CONTIGUË. `THModele.memeBloc` compare des
  // lignes VOISINES : deux exercices du même groupe séparés par un troisième
  // ne forment plus un bloc. Chaque geste ci-dessous préserve donc la
  // contiguïté, et `normaliserGroupes` la rétablit quoi qu'il arrive.

  // Renumérote les groupes d'après la SEULE chose qui compte : qui est collé à
  // qui. Une suite d'au moins deux exercices de même groupe devient un bloc
  // numéroté ; un exercice isolé perd son groupe (§5.9 — « un superset tombé à
  // un seul exercice cesse d'être un superset »).
  //
  // ⚠️ LES MARQUES DE TOUR PARTENT AVEC. `seance.tours` est indexé par numéro de
  // groupe : renuméroter sans les jeter ferait pointer la marque d'un bloc sur
  // un autre. On les efface, et l'appelant les re-sème depuis l'état courant
  // (`avancerTours`) — le repère se reconstruit tout seul, à un cran près : une
  // dévalidation suivie d'un regroupement perd le point haut. C'est un
  // indicateur, pas une donnée ; le prix est juste.
  function normaliserGroupes(seance) {
    var exos = (seance.exercices || []).slice();
    var n = 0, i = 0;
    while (i < exos.length) {
      var j = i;
      var g = exos[i].groupe_superset;
      while (j + 1 < exos.length && g !== null && g !== undefined &&
             exos[j + 1].groupe_superset === g) j++;
      var neuf = (j > i) ? ++n : null;
      for (var k = i; k <= j; k++) {
        if (exos[k].groupe_superset !== neuf) {
          exos[k] = Object.assign({}, exos[k], { groupe_superset: neuf });
        }
      }
      i = j + 1;
    }
    var s = avecExercices(seance, exos);
    if (s.tours) { s = Object.assign({}, s); delete s.tours; }
    return s;
  }

  // Extrait une tranche d'exercices et la réinsère ailleurs. Toutes les
  // structures du chantier se ramènent à ça.
  function bouger(exos, indices, ou) {
    var pris = indices.map(function (i) { return exos[i]; });
    var reste = exos.filter(function (_, i) { return indices.indexOf(i) < 0; });
    // `ou` est compté dans le tableau D'ORIGINE : on le corrige du nombre
    // d'entrées retirées AVANT lui, sinon un déplacement vers le bas atterrit
    // toujours un cran trop haut.
    var decalage = indices.filter(function (i) { return i < ou; }).length;
    var cible = Math.max(0, Math.min(reste.length, ou - decalage));
    return reste.slice(0, cible).concat(pris, reste.slice(cible));
  }

  // §5.5 — Déplacer agit sur le BLOC entier, jamais sur une de ses branches :
  // sortir un exercice d'un superset est un autre geste (§5.8). L'appelant sait
  // où vont les blocs ; ce module ne fait que réaliser le mouvement. `ou` est
  // l'indice, dans le tableau D'ORIGINE, devant lequel la tranche vient se
  // placer.
  function deplacerVers(seance, indices, ou) {
    var idx = (indices || []).slice().sort(function (a, b) { return a - b; });
    if (!idx.length) return seance;
    return normaliserGroupes(avecExercices(seance, bouger(seance.exercices, idx, ou)));
  }

  // §5.7 — Grouper est une opération sur une PAIRE de blocs. Le second vient se
  // coller au premier et les deux prennent le même groupe.
  //
  // ⚠️ CE QUI EST DÉJÀ SAISI NE SE PERD PAS. On ne touche qu'à l'ordre et au
  // numéro de groupe : les séries, leurs validations, leurs notes et le repos
  // cible voyagent avec leur exercice, intacts.
  function grouperBlocs(seance, indicesA, indicesB) {
    var a = (indicesA || []).slice().sort(function (x, y) { return x - y; });
    var b = (indicesB || []).slice().sort(function (x, y) { return x - y; });
    if (!a.length || !b.length) return seance;
    if (a.some(function (i) { return b.indexOf(i) >= 0; })) return seance;

    // Un numéro provisoire, unique : `normaliserGroupes` renumérotera derrière.
    var g = 0;
    (seance.exercices || []).forEach(function (e) {
      var v = Number(e.groupe_superset);
      if (isFinite(v) && v > g) g = v;
    });
    g++;

    var exos = seance.exercices.map(function (e, i) {
      if (a.indexOf(i) < 0 && b.indexOf(i) < 0) return e;
      return Object.assign({}, e, { groupe_superset: g });
    });
    // B se pose juste APRÈS A, dans l'ordre où on les a tapés.
    var apres = a[a.length - 1] + 1;
    return normaliserGroupes(avecExercices(seance, bouger(exos, b, apres)));
  }

  // §5.8 — Dégrouper agit sur UN exercice, jamais sur le bloc entier. Il sort et
  // se place JUSTE APRÈS son bloc d'origine : il ne remonte pas en fin de séance.
  function degrouperExercice(seance, iExo, indicesBloc) {
    var bloc = (indicesBloc || []).slice().sort(function (a, b) { return a - b; });
    if (bloc.indexOf(iExo) < 0 || bloc.length < 2) return seance;
    var exos = seance.exercices.map(function (e, i) {
      return i === iExo ? Object.assign({}, e, { groupe_superset: null }) : e;
    });
    // Il ne se dépose derrière son bloc QUE s'il reste un bloc derrière lui.
    // À deux, le superset se dissout en entier (§5.9) : plus rien ne retient
    // l'ordre, et faire passer le sortant derrière l'autre réordonnerait la
    // séance sans que personne l'ait demandé.
    if (bloc.length > 2) exos = bouger(exos, [iExo], bloc[bloc.length - 1] + 1);
    return normaliserGroupes(avecExercices(seance, exos));
  }

  // ── Remplacer (§5.2) ────────────────────────────────────────────────────
  //
  // « Remplacer est un ajouter suivi d'un sauter, en gardant la position. »
  // Et « sauter » n'existe pas : un exercice sans série validée n'est pas dans
  // la séance enregistrée.
  //
  // D'où la règle, qui tombe du §5.2 sans rien inventer :
  //
  //   · l'ancien N'A RIEN de validé → il n'a jamais eu lieu : il disparaît ;
  //   · l'ancien A des séries validées → elles RESTENT, sous son nom, et ses
  //     lignes vides partent. On ne récrit pas du travail réellement fait sous
  //     un autre exercice : ce serait une donnée fausse, pas un raccourci.
  //
  // Le nouveau hérite du SLOT — repos cible, groupe de superset, nombre de
  // lignes — et de rien d'autre. Pas la note (« barre basse » ne veut rien dire
  // sur une presse), pas les reps visées (la routine les prescrivait pour
  // l'ancien mouvement), pas `routine_exercise_id` : ce n'est plus cette ligne
  // de routine.
  function remplacerExercice(seance, iExo, slug, idSerie) {
    var ancien = (seance.exercices || [])[iExo];
    if (!ancien || !slug) return seance;
    var faites = (ancien.series || []).filter(function (s) { return !!s.validee_a; });
    var n = Math.max(1, (ancien.series || []).length);
    var neuf = {
      exercise_slug: slug,
      routine_exercise_id: null,
      reps_visees: null,
      repos_cible_s: ancien.repos_cible_s === undefined ? null : ancien.repos_cible_s,
      note: null,
      groupe_superset: ancien.groupe_superset === undefined ? null : ancien.groupe_superset,
      series: []
    };
    for (var i = 0; i < n; i++) neuf.series.push(serieVide(idSerie));

    var exos = seance.exercices.slice();
    if (faites.length) {
      exos[iExo] = Object.assign({}, ancien, { series: faites });
      exos.splice(iExo + 1, 0, neuf);
    } else {
      exos[iExo] = neuf;
    }
    return normaliserGroupes(avecExercices(seance, exos));
  }

  // Ajouter un exercice APRÈS un bloc (§5 bis). L'ajout en fin de séance reste
  // `ajouterExercice` — c'est le même geste, sans position.
  function insererExercice(seance, apres, slug, idSerie, options) {
    var o = options || {};
    var exos = seance.exercices.slice();
    exos.splice(Math.max(0, Math.min(exos.length, apres)), 0, {
      exercise_slug: slug,
      routine_exercise_id: null,
      reps_visees: o.reps_visees === undefined ? null : o.reps_visees,
      repos_cible_s: o.repos_cible_s === undefined ? null : o.repos_cible_s,
      note: texteOuNul(o.note),
      groupe_superset: null,
      series: [serieVide(idSerie)]
    });
    return normaliserGroupes(avecExercices(seance, exos));
  }

  // Supprimer un bloc entier, ou une seule de ses branches. Les deux passent
  // par la même porte : une liste d'indices.
  function retirerExercices(seance, indices) {
    var idx = (indices || []).slice();
    var exos = (seance.exercices || []).filter(function (_, i) { return idx.indexOf(i) < 0; });
    return normaliserGroupes(avecExercices(seance, exos));
  }

  // Combien de séries validées dans une tranche — ce que la confirmation de
  // suppression doit annoncer, parce qu'une suppression silencieuse de travail
  // fait est exactement ce qu'on s'interdit.
  function compterValidees(seance, indices) {
    var idx = (indices || []).slice();
    var n = 0;
    (seance.exercices || []).forEach(function (e, i) {
      if (idx.indexOf(i) < 0) return;
      (e.series || []).forEach(function (s) { if (s.validee_a) n++; });
    });
    return n;
  }

  // ── Saisie ──────────────────────────────────────────────────────────────
  function nombreOuNul(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  // Un entier positif ou rien, après conversion depuis l'unité de SAISIE.
  //
  // `facteur` est ce qui sépare ce qu'on tape de ce que porte la colonne : on
  // saisit une rando en minutes et en kilomètres, la base stocke des secondes
  // et des mètres. Une valeur négative n'existe pas — une durée ni une distance
  // ne se comptent à rebours — et on la rejette plutôt que de la stocker.
  function entierOuNul(v, facteur) {
    var n = nombreOuNul(v);
    if (n === null) return null;
    var e = Math.round(n * (facteur || 1));
    return e < 0 ? null : e;
  }

  // Les clés d'entrée nomment le CHAMP DE SAISIE, pas la colonne : `distance_km`
  // arrive de la grille `distance_temps`, `duree` des grilles `temps` et
  // `distance_temps`. Une seule table les relie (`THModele.CHAMPS_MESURE`) ;
  // ici on applique, on ne redécide pas.
  //
  // `duree` arrive DÉJÀ EN SECONDES : le pavé de chronométrage (chantier 25)
  // fait la conversion, et il n'y a plus qu'une seule unité de durée. Le
  // `duree_min` du chantier 24, avec son facteur 60, a disparu avec la règle
  // « l'unité suit la mesure » qu'il servait.
  function modifierSerie(seance, iExo, iSerie, champs) {
    var c = {};
    if ('charge_kg' in champs) c.charge_kg = nombreOuNul(champs.charge_kg);
    if ('reps' in champs) {
      var r = nombreOuNul(champs.reps);
      c.reps = r === null ? null : Math.round(r);
    }
    if ('duree' in champs) c.duree_s = entierOuNul(champs.duree, 1);
    if ('duree_s' in champs) c.duree_s = entierOuNul(champs.duree_s, 1);
    if ('distance_m' in champs) c.distance_m = entierOuNul(champs.distance_m, 1);
    if ('distance_km' in champs) c.distance_m = entierOuNul(champs.distance_km, 1000);
    return avecSerie(seance, iExo, iSerie, c);
  }

  function changerType(seance, iExo, iSerie, type) {
    if (TYPES.indexOf(type) < 0) return seance;
    return avecSerie(seance, iExo, iSerie, { type_serie: type });
  }

  // ⚠️ RPE et ressenti sont EXCLUSIFS, et c'est un choix.
  //
  // Les deux mesurent la même chose — la proximité de l'échec — dans deux
  // langues. Les autoriser ensemble ouvrirait la question « lequel fait foi »
  // le jour où ils se contredisent (RPE 7 et « il m'en restait 0 »), et
  // personne n'aurait la réponse. La colonne EFFORT n'en affiche qu'un de toute
  // façon : 40 px ne tiennent pas deux valeurs.
  //
  // Choisir l'un EFFACE l'autre. C'est la seule règle qui ne puisse pas mentir.
  function definirEffort(seance, iExo, iSerie, effort) {
    var e = effort || {};
    if (e.rpe !== undefined && e.rpe !== null && e.rpe !== '') {
      var n = nombreOuNul(e.rpe);
      if (n === null || n <= 0 || n > 10) return seance;
      return avecSerie(seance, iExo, iSerie, { rpe: n, ressenti: null });
    }
    if (e.ressenti) {
      if (RESSENTIS.indexOf(e.ressenti) < 0) return seance;
      return avecSerie(seance, iExo, iSerie, { ressenti: e.ressenti, rpe: null });
    }
    return avecSerie(seance, iExo, iSerie, { rpe: null, ressenti: null });
  }

  // ── La note, et le repos cible ──────────────────────────────────────────
  //
  // ══ LA NOTE EST UNE NOTE D'EXERCICE (§7 septies.1) ═══════════════════════
  //
  // Relevé en base : sur 196 couples séance-exercice portant une note, 185
  // portent EXACTEMENT la même sur toutes leurs séries. La note de Hevy est une
  // note d'exercice, dupliquée sur chaque série à l'export.
  //
  // On garde ce modèle SANS table nouvelle : la note vit UNE FOIS sur
  // l'exercice, et `lignes()` la projette sur chaque série au moment d'écrire.
  // Une série ajoutée après coup la reçoit donc sans rien recopier — c'est la
  // conséquence directe de n'avoir qu'une source.
  //
  // Les 11 couples (5 %) qui portent des notes réellement différentes d'une
  // série à l'autre restent possibles : `serie.note`, quand elle existe, GAGNE
  // sur celle de l'exercice. Le cas existe en base, il ne se supprime pas.
  function avecExercice(seance, iExo, champs) {
    var exos = seance.exercices.slice();
    exos[iExo] = Object.assign({}, exos[iExo], champs);
    return avecExercices(seance, exos);
  }

  function definirNoteExercice(seance, iExo, texte) {
    return avecExercice(seance, iExo, { note: texteOuNul(texte) });
  }

  function definirNoteSerie(seance, iExo, iSerie, texte) {
    return avecSerie(seance, iExo, iSerie, { note: texteOuNul(texte) });
  }

  // Le repos cible se change EN SÉANCE (§7 septies.2), et rien n'est écrit dans
  // la routine à ce moment-là — la question se pose à la fin (§6).
  //
  // Bornes de `routine_exos_repos_borne` : 5 à 1800, ou NULL. On les applique
  // ICI, alors que la séance n'a aucune contrainte là-dessus, parce que cette
  // valeur est exactement celle qui PEUT partir dans la routine à la fin. Une
  // valeur que la routine refuserait n'a pas à exister en séance.
  function definirReposCible(seance, iExo, secondes) {
    var n = nombreOuNul(secondes);
    if (n !== null) {
      n = Math.round(n);
      if (n < REPOS_CIBLE_MIN || n > REPOS_CIBLE_MAX) return seance;
    }
    return avecExercice(seance, iExo, { repos_cible_s: n });
  }

  // ── Ce que l'écran de fin déclare (§7 septies.4) ────────────────────────
  //
  // ⚠️ `salle_norme` est GÉNÉRÉE : elle n'apparaît nulle part ici, et l'écrire
  // ferait échouer la requête entière. La salle se DÉCLARE, elle ne se déduit
  // pas — c'est la doctrine posée quand la colonne a été créée.
  function decrire(seance, champs) {
    var c = champs || {};
    var maj = {};
    if ('titre' in c) maj.titre = texteOuNul(c.titre);
    if ('note' in c) maj.note = texteOuNul(c.note);
    if ('salle' in c) maj.salle = texteOuNul(c.salle, SALLE_MAX);
    return Object.assign({}, seance, maj);
  }

  // ── Les écarts avec la routine (§6) ─────────────────────────────────────
  //
  // UNE SEULE QUESTION, À LA FIN, et seulement s'il y a vraiment un écart :
  // « une séance conforme n'ouvre aucune question, sinon la question devient un
  // bruit qu'on tape sans lire » (§6.2).
  //
  // Ce chantier ne connaît que deux écarts — le repos cible et la note. La
  // déviation de STRUCTURE (exercice remplacé, ajouté, réordonné) est hors
  // périmètre : un exercice sans `routine_exercise_id` n'est donc pas comparé,
  // il est ignoré.
  // Rend :
  //
  //   { ecarts: [ {type, ...} ],     ce qu'on montre, en français
  //     voulues: [ ligne de routine ] }   ce qu'on écrit si on reporte
  //
  // `voulues` est la routine TELLE QUE LA SÉANCE VIENT DE SE FAIRE. Elle est
  // toujours calculée, même sans écart — c'est `ecarts` qui décide si la
  // question se pose, et lui seul (§6.2 : une séance conforme n'ouvre aucune
  // question).
  //
  // ⚠️ LE NOMBRE DE SÉRIES NE SE REPORTE PAS (§6.3). Une ligne qui existe déjà
  // garde CELUI DE LA ROUTINE : « une séance écourtée par manque de temps
  // amputerait la routine pour toujours ». Un exercice ajouté n'a pas de valeur
  // de référence — on prend son nombre de lignes, qui est ce qu'on a prévu de
  // faire, pas ce qu'on a eu le temps de faire.
  function ecartsRoutine(seance, routine) {
    var vide = { ecarts: [], voulues: [] };
    if (!seance || !routine || !routine.id) return vide;
    if (seance.routine_id !== routine.id) return vide;

    var lignes = (routine.exercices || []).slice()
      .sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); });
    var parId = {};
    lignes.forEach(function (e) { if (e && e.id) parId[e.id] = e; });

    var voulues = (seance.exercices || []).map(function (exo) {
      var ligne = (exo.routine_exercise_id && parId[exo.routine_exercise_id]) || null;
      return {
        id: ligne ? ligne.id : (exo.routine_exercise_id || null),
        exercise_slug: exo.exercise_slug,
        series: ligne ? ligne.series : (exo.series || []).length,
        reps_visees: ligne ? ligne.reps_visees : (exo.reps_visees === undefined ? null : exo.reps_visees),
        repos_cible_s: exo.repos_cible_s === undefined ? null : exo.repos_cible_s,
        note: texteOuNul(exo.note),
        groupe_superset: exo.groupe_superset === undefined ? null : exo.groupe_superset
      };
    });

    var ecarts = [];

    // ── Les écarts de RÉGLAGE, ligne à ligne (repos et note) ──────────────
    voulues.forEach(function (v) {
      var ligne = v.id ? parId[v.id] : null;
      if (!ligne) return;
      var reposAvant = ligne.repos_cible_s === undefined ? null : ligne.repos_cible_s;
      var noteAvant = texteOuNul(ligne.note);
      if (v.repos_cible_s !== reposAvant) {
        ecarts.push({ type: 'repos', exercise_slug: v.exercise_slug,
                      avant: reposAvant, apres: v.repos_cible_s });
      }
      if (v.note !== noteAvant) {
        ecarts.push({ type: 'note', exercise_slug: v.exercise_slug, apres: v.note });
      }
    });

    // ── Les écarts de STRUCTURE (§6.2) ───────────────────────────────────
    //
    // Retirés, ajoutés, puis — seulement si la composition est restée la même —
    // l'ordre. Annoncer « déplacé » en plus de « retiré » sur la même séance
    // dirait deux fois la même chose : quand la composition change, l'ordre n'a
    // plus de sens à comparer.
    var idsAvant = lignes.map(function (e) { return e.id; });
    var idsApres = voulues.map(function (v) { return v.id; }).filter(Boolean);

    lignes.forEach(function (e) {
      if (idsApres.indexOf(e.id) < 0) {
        ecarts.push({ type: 'retire', exercise_slug: e.exercise_slug });
      }
    });
    voulues.forEach(function (v) {
      if (!v.id || idsAvant.indexOf(v.id) < 0) {
        ecarts.push({ type: 'ajoute', exercise_slug: v.exercise_slug });
      }
    });

    var memeComposition = idsApres.length === voulues.length &&
      idsApres.length === idsAvant.length &&
      idsApres.every(function (id) { return idsAvant.indexOf(id) >= 0; });
    if (memeComposition) {
      if (idsApres.join('|') !== idsAvant.join('|')) ecarts.push({ type: 'ordre' });
      // Le GROUPEMENT se compare par la FORME, pas par les numéros : un
      // superset renuméroté d'un cran n'est pas une déviation. Et il ne se
      // compare qu'à composition égale — ajouter un exercice change forcément
      // la forme, et le dire deux fois n'apprend rien.
      if (formeDesGroupes(lignes) !== formeDesGroupes(voulues)) {
        ecarts.push({ type: 'groupement' });
      }
    }

    return { ecarts: ecarts, voulues: voulues };
  }

  // « A A B · · C C » — les positions groupées ensemble, sans leurs numéros.
  function formeDesGroupes(liste) {
    var vus = {}, n = 0;
    return (liste || []).map(function (e) {
      var g = e.groupe_superset;
      if (g === null || g === undefined) return '.';
      if (vus[g] === undefined) vus[g] = ++n;
      return String(vus[g]);
    }).join('|');
  }

  // ── Valider ─────────────────────────────────────────────────────────────
  //
  // `validee_a` s'écrit ICI, à la validation, JAMAIS à l'insertion (§7.4).
  // La base l'impose désormais ; on l'écrit quand même explicitement, parce
  // qu'une garantie qu'on ne s'applique pas à soi-même finit par sauter
  // ailleurs.
  //
  // `repos_s` est le repos AVANT cette série : le temps écoulé depuis la
  // validation précédente. Le temps d'exécution n'y entre donc pas — la valeur
  // est juste PAR CONSTRUCTION, et non déduite d'un écart qui contiendrait les
  // deux (§7 ter.1).
  function valider(seance, iExo, iSerie, maintenant) {
    var t = maintenant instanceof Date ? maintenant : new Date(maintenant || Date.now());
    var precedente = derniereValidation(seance);
    var repos = null;
    if (precedente) {
      var s = Math.round((t.getTime() - precedente.getTime()) / 1000);
      // Au-delà d'une heure, ce n'est plus un repos : c'est une interruption.
      // On rend NULL plutôt que de plafonner à 3600 — un chiffre faux se
      // propage, une absence se voit.
      repos = (s >= 0 && s <= REPOS_MAX) ? s : null;
    }
    return avecSerie(seance, iExo, iSerie, {
      validee_a: t.toISOString(), repos_s: repos
    });
  }

  // Dévalider RETIRE la ligne de la base (§2.3 du prompt) : une série non
  // validée ne peut pas y exister. `repos_s` part avec elle — il décrivait un
  // intervalle qui n'a plus de fin.
  function devalider(seance, iExo, iSerie) {
    return avecSerie(seance, iExo, iSerie, { validee_a: null, repos_s: null });
  }

  // Dévalider puis revalider RÉÉCRIT `validee_a` (§7.5) : la série a été refaite
  // plus tard, elle ne garde pas sa place d'origine dans les tours.

  function derniereValidation(seance) {
    var max = null;
    toutesLesSeries(seance).forEach(function (s) {
      if (!s.serie.validee_a) return;
      var d = new Date(s.serie.validee_a);
      if (isNaN(d.getTime())) return;
      if (!max || d.getTime() > max.getTime()) max = d;
    });
    return max;
  }

  function terminer(seance, fin) {
    var t = fin instanceof Date ? fin : new Date(fin || Date.now());
    return Object.assign({}, seance, { statut: TERMINEE, fin: t.toISOString() });
  }

  // ── Le tour atteint d'un superset (§2.7) ────────────────────────────────
  //
  // ⚠️ MONOTONE, ET C'EST TOUTE LA RAISON DE SON EXISTENCE.
  //
  // « Le tour avance quand toutes ses séries de travail sont validées, dans
  // n'importe quel ordre. **Dévalider ne fait pas reculer le tour** — asymétrie
  // assumée. » Une valeur qui se recalcule entièrement à chaque rendu
  // reculerait ; il faut donc une marque, et une marque qui ne descend jamais.
  //
  // Elle vit sur la séance — donc dans le brouillon, donc elle survit à l'app
  // tuée — et **nulle part ailleurs** : ni dans `lignes()`, ni dans
  // `ligneSession()`. Ce n'est pas une donnée de la séance, c'est où l'on en
  // est. Les étiquettes A1/B1, elles, ne sont stockées nulle part (§2.4) : elles
  // se recalculent à l'affichage.
  //
  // `faits` arrive déjà calculé (`THModele.toursFaitsParGroupe`) : ce module
  // reste pur et ignore tout des blocs.
  function avancerTours(seance, faits) {
    var f = faits || {};
    var tours = Object.assign({}, seance.tours || {});
    var change = false;
    Object.keys(f).forEach(function (cle) {
      var n = Number(f[cle]) || 0;
      if (n > (tours[cle] || 0)) { tours[cle] = n; change = true; }
    });
    return change ? Object.assign({}, seance, { tours: tours }) : seance;
  }

  function tourAtteint(seance, groupe) {
    if (groupe === null || groupe === undefined) return 0;
    return ((seance && seance.tours) || {})[String(groupe)] || 0;
  }

  // ── Lecture à plat ──────────────────────────────────────────────────────
  //
  // L'ordre d'affichage : exercice par exercice, série par série. C'est lui qui
  // donne le `rang`, et le rang commence à 1 (`sets_rang_positif`).
  function toutesLesSeries(seance) {
    var plat = [];
    (seance.exercices || []).forEach(function (exo, iExo) {
      (exo.series || []).forEach(function (serie, iSerie) {
        plat.push({ exo: exo, serie: serie, iExo: iExo, iSerie: iSerie, rang: plat.length + 1 });
      });
    });
    return plat;
  }

  function compter(seance) {
    var plat = toutesLesSeries(seance);
    return {
      series: plat.length,
      validees: plat.filter(function (p) { return !!p.serie.validee_a; }).length,
      travail: plat.filter(function (p) {
        return !!p.serie.validee_a && p.serie.type_serie === 'travail';
      }).length
    };
  }

  // ── Ce qui part en base ─────────────────────────────────────────────────
  //
  // ⚠️ « VALIDÉE » N'EST PAS LE BON CRITÈRE, ET ÇA A COÛTÉ LE CORPUS ENTIER.
  //
  // Ce filtre ne retenait que `validee_a`. Or les 28 103 séries importées ont
  // `validee_a` À NULL — la contrainte `sets_validee_si_saisie` ne l'exige que
  // pour `source = 'app'`. Pour une séance importée, `lignes()` rendait donc
  // une liste VIDE ; `remplacerSeries` lit « absente de la liste » comme
  // « supprimée » ; et le geste « Modifier » effaçait les 23 séries de la
  // séance, en silence, avec un 201 et un « À jour » à l'écran.
  //
  // La question n'est pas « cette série a-t-elle été validée ? » mais
  // « cette série doit-elle EXISTER en base ? ». Deux raisons, et deux
  // seulement : elle a été validée dans l'app, ou elle VIENT de la base.
  // Une série importée a été faite ; `validee_a` dit seulement qu'on ne sait
  // pas quand.
  //
  // Une case vide jamais validée reste dehors — c'était vrai et ça le reste :
  // elle n'a pas de `source`, elle ne vient de nulle part.
  function partEnBase(serie) {
    if (!serie) return false;
    if (serie.validee_a) return true;
    // `source` ne vaut quelque chose que si la ligne a été LUE en base.
    return !!serie.source && serie.source !== 'app';
  }

  // ⚠️ LES RANGS D'ORIGINE, QUAND ILS SONT TOUS LÀ ET TOUS DISTINCTS.
  //
  // `toutesLesSeries` numérote par POSITION DANS LE MODÈLE. Or le modèle d'une
  // séance importée est reconstruit par `construireBlocs`, qui GROUPE par
  // exercice tant qu'aucune chronologie n'existe — mesuré : 53 blocs de la base
  // sont entrelacés (A1 B1 A2 B2) contre 1 031 groupés. Renuméroter par
  // position aplatirait ces 53 blocs, sur 47 séances : une altération
  // silencieuse de l'ordre enregistré, à l'occasion d'une simple correction.
  //
  // On garde donc les rangs lus en base quand la séance est intacte, et on
  // renumérote dès qu'elle ne l'est plus (une série ajoutée n'a pas de rang
  // d'origine, une série retirée en laisse un absent). La règle est la même
  // dans les deux cas : les rangs doivent être TOUS connus et TOUS distincts,
  // sinon on repart de 1 — `sets_rang_positif` et `sets_rang_unique` ne
  // tolèrent rien d'autre.
  function rangsDeSortie(plat) {
    var portes = plat.map(function (p) { return p.serie.rang_origine; });
    var tous = portes.every(function (r) { return typeof r === 'number' && r >= 1; });
    var distincts = new Set(portes).size === portes.length;
    // ⚠️ LE REPLI EST LA POSITION DANS L'ÉNUMÉRATION COMPLÈTE, PAS DANS LA
    // LISTE FILTRÉE. Dévalider une série ne RESSERRE pas les rangs (§7.5) :
    // la ligne dévalidée quitte la base mais garde sa place dans la séance, et
    // celles qui la suivent ne bougent pas. Renuméroter sur la liste filtrée
    // ferait bouger le rang d'une série que personne n'a touchée.
    return (tous && distincts) ? portes : plat.map(function (p) { return p.rang; });
  }

  function lignes(seance) {
    var plat = toutesLesSeries(seance).filter(function (p) { return partEnBase(p.serie); });
    var rangs = rangsDeSortie(plat);
    // ⚠️ L'UNICITÉ, PAS SEULEMENT LA PRÉSENCE (chantier 34, défaut D4).
    //
    // La garde du chantier 33 vérifiait qu'un identifiant existe. Elle ne
    // vérifiait pas qu'il soit UNIQUE — et depuis que `serieVide` accepte une
    // chaîne, une boucle qui lui passe la même chaîne produit N séries portant
    // la MÊME clé primaire. `sets_pkey` répond 23505, code DÉFINITIF, donc la
    // file se bloque et la séance est perdue. Sauvé jusqu'ici par la seule
    // discipline des sites d'appel : c'est la définition d'une garantie
    // apparente, et c'est la dernière porte avant le fil.
    var vus = {};
    plat.forEach(function (p) {
      if (sansIdentifiant(p.serie)) {
        throw new Error('Série sans identifiant (' + p.exo.exercise_slug +
          ', rang ' + p.rang + ') : elle ne peut pas être envoyée.');
      }
      if (vus[p.serie.id]) {
        throw new Error('Deux séries portent le même identifiant (' + p.serie.id +
          ', ' + p.exo.exercise_slug + ') : elles ne peuvent pas être envoyées.');
      }
      vus[p.serie.id] = true;
    });
    return plat
      .map(function (p, i) {
        return {
          id: p.serie.id,
          session_id: seance.id,
          user_id: seance.user_id,
          exercise_slug: p.exo.exercise_slug,
          // ⚠️ LA PROVENANCE NE SE RÉÉCRIT PAS. Corriger une charge ne rend pas
          // la série « saisie dans l'app » : elle reste ce qu'elle est. Et la
          // repasser en `'app'` exigerait un `validee_a`
          // (`sets_validee_si_saisie`), qu'une ligne importée n'a pas — 23514,
          // définitif, file bloquée.
          source: p.serie.source || 'app',
          type_serie: p.serie.type_serie || 'travail',
          charge_kg: p.serie.charge_kg,
          reps: p.serie.reps,
          // Toujours envoyées, y compris à null : la mesure décide de ce qui
          // est REMPLI, pas de ce qui est ENVOYÉ. Omettre la colonne laisserait
          // une valeur périmée en base après un changement d'exercice.
          duree_s: p.serie.duree_s === undefined ? null : p.serie.duree_s,
          distance_m: p.serie.distance_m === undefined ? null : p.serie.distance_m,
          rpe: p.serie.rpe,
          ressenti: p.serie.ressenti,
          // La note de l'EXERCICE, projetée sur chaque série — c'est la forme
          // que la base porte déjà (185 couples sur 196). Une note propre à la
          // série la remplace quand elle existe : les 11 couples restants.
          // Toujours envoyée, y compris à null, pour la même raison que la
          // durée et la distance — omettre la colonne laisserait une valeur
          // périmée en base après une note effacée.
          note: noteDeSerie(p.exo, p.serie),
          // ⚠️ SANS ELLE, LE SUPERSET DISPARAÎT À L'ENREGISTREMENT. La séance
          // s'afficherait entrelacée pendant qu'on la fait, puis en exercices
          // séparés au détail — deux lectures contradictoires de la même
          // séance. `groupe_superset` n'est pas écrit par un geste : il vient
          // de la routine et il la suit jusqu'en base.
          groupe_superset: p.exo.groupe_superset === undefined ? null : p.exo.groupe_superset,
          validee_a: p.serie.validee_a,
          rang: rangs[i],
          repos_s: p.serie.repos_s
        };
      });
  }

  // ⚠️ LA DÉCLARATION NE DOIT PAS POUVOIR ÊTRE CONTOURNÉE (chantier 34).
  //
  // `donnees.js` construit ses `select` depuis `COLONNES_SET`/`COLONNES_SESSION`,
  // donc la liste LUE est un sur-ensemble de la liste DÉCLARÉE par construction.
  // Reste l'autre moitié de l'écart : `lignes()` et `ligneSession()` construisent
  // leur objet à la main, et rien n'obligerait une colonne ajoutée là à entrer
  // aussi dans la déclaration. C'est exactement par là que `ressenti` et
  // `repos_s` sont entrés en écriture sans entrer en lecture.
  //
  // On compare donc ce qui est ÉMIS à ce qui est DÉCLARÉ, sur une séance-sonde,
  // et on lève. Au démarrage, avant la moindre écriture — un écart découvert au
  // premier enregistrement se paierait en données.
  // Sorti de `verifierColonnes` pour être éprouvé sur de VRAIS écarts : une
  // vérification qu'on ne peut tester que sur du code juste ne prouve pas
  // qu'elle sait dire non.
  function ecartDeColonnes(quoi, emises, declarees) {
    var ecarts = [];
    emises.forEach(function (c) {
      if (declarees.indexOf(c) < 0) ecarts.push(quoi + ' : « ' + c + ' » est ÉCRITE et non déclarée');
    });
    declarees.forEach(function (c) {
      if (emises.indexOf(c) < 0) ecarts.push(quoi + ' : « ' + c + ' » est déclarée et jamais écrite');
    });
    return ecarts;
  }

  function verifierColonnes() {
    var sonde = {
      id: 's', user_id: 'u', debut: 'd', fin: null, titre: null, note: null,
      salle: null, routine_id: null, statut: EN_COURS,
      exercices: [{
        exercise_slug: 'x', groupe_superset: null, note: null,
        series: [Object.assign(serieVide('sonde'), {
          validee_a: 'v', source: 'app', rang_origine: 1
        })]
      }]
    };
    var ecarts = ecartDeColonnes('sets', Object.keys(lignes(sonde)[0] || {}), COLONNES_SET)
      .concat(ecartDeColonnes('sessions', Object.keys(ligneSession(sonde)), COLONNES_SESSION));
    if (ecarts.length) {
      throw new Error('Colonnes désaccordées — ce qui s\'écrit ne se relira pas : ' +
        ecarts.join(' · '));
    }
    return true;
  }

  function noteDeSerie(exo, serie) {
    var propre = texteOuNul(serie && serie.note);
    if (propre !== null) return propre;
    return texteOuNul(exo && exo.note);
  }

  function ligneSession(seance) {
    return {
      id: seance.id,
      user_id: seance.user_id,
      debut: seance.debut,
      fin: seance.fin,
      titre: texteOuNul(seance.titre),
      // §7 septies.4 — déclarées à l'écran de fin. `salle_norme` est GÉNÉRÉE et
      // n'apparaît PAS ici : l'envoyer ferait échouer la requête.
      note: texteOuNul(seance.note),
      salle: texteOuNul(seance.salle, SALLE_MAX),
      routine_id: seance.routine_id,
      source: 'app',
      // Toujours explicite : le défaut de la colonne est 'terminee'.
      statut: seance.statut || EN_COURS
    };
  }

  // ── Le précédent, et les valeurs fantômes ───────────────────────────────
  //
  // La colonne « précédent » est FACTUELLE (§3.4) : ce qui a été fait la
  // dernière fois, série par série. C'est elle qui porte la rampe — 100, 110,
  // 120, 120 se lit en face de chaque ligne. Le moteur n'a rien à prédire.
  //
  // On cherche la séance la plus récente qui contient cet exercice, en
  // excluant celle qui est en cours.
  function precedent(slug, seances, seriesDe, saufId) {
    for (var i = 0; i < (seances || []).length; i++) {
      var s = seances[i];
      if (!s || s.id === saufId) continue;
      var series = (seriesDe(s.id) || [])
        .filter(function (x) { return x && x.exercise_slug === slug; })
        .sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); });
      if (series.length) {
        return {
          seance: s,
          series: series.map(function (x) {
            return { charge_kg: x.charge_kg, reps: x.reps,
                     duree_s: x.duree_s, distance_m: x.distance_m,
                     type_serie: x.type_serie };
          })
        };
      }
    }
    return null;
  }

  // Ce qui s'affiche en gris dans un champ vide. DEUX sources, toutes deux
  // FACTUELLES — rien n'est prédit ici, le moteur parlera au chantier 5 :
  //
  //   1. la dernière charge saisie sur CET exercice dans CETTE séance. « Tu
  //      viens de mettre 100 » est un fait, pas une suggestion ;
  //   2. à défaut, ce qui a été fait au même rang la dernière fois.
  //
  // Les reps visées de la routine servent de fantôme de reps — c'est une
  // intention déclarée, pas un calcul.
  // Remonte la dernière valeur saisie pour CE champ, sur CET exercice, dans
  // CETTE séance.
  function derniereSaisie(exo, iSerie, champ) {
    for (var k = iSerie - 1; k >= 0; k--) {
      var v = exo.series[k][champ];
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }

  function fantome(seance, iExo, iSerie, prec) {
    var exo = seance.exercices[iExo];
    var ligne = prec && prec.series ? prec.series[iSerie] : null;

    var charge = derniereSaisie(exo, iSerie, 'charge_kg');
    if (charge === null && ligne) charge = ligne.charge_kg;

    var reps = exo.reps_visees;
    if ((reps === null || reps === undefined) && ligne) reps = ligne.reps;

    // La durée et la distance suivent la MÊME règle que la charge : ce qu'on
    // vient de faire dans la séance, à défaut ce qu'on a fait au même rang la
    // dernière fois. Aucune intention déclarée n'existe pour elles — la routine
    // ne porte que `reps_visees`, jamais une durée visée.
    var duree = derniereSaisie(exo, iSerie, 'duree_s');
    if (duree === null && ligne) duree = ligne.duree_s;
    var distance = derniereSaisie(exo, iSerie, 'distance_m');
    if (distance === null && ligne) distance = ligne.distance_m;

    return {
      charge_kg: charge,
      reps: reps === undefined ? null : reps,
      duree_s: duree === undefined ? null : duree,
      distance_m: distance === undefined ? null : distance
    };
  }

  // ── Le repos : la cible et son échéance ─────────────────────────────────
  //
  // La cible vient de la routine (`repos_cible_s`), et une cible mal réglée est
  // le cas courant : on l'ajuste par pas de 15 s, en séance, sans rien
  // enregistrer. Le réglage vaut pour le repos en cours, pas pour la routine —
  // corriger la routine depuis la salle serait une décision prise en trois
  // secondes et gardée pour toujours.
  var PAS_REPOS = 15;

  function ajusterCible(cible, delta) {
    var base = Number(cible) || 0;
    var n = base + (Number(delta) || 0);
    if (n < 0) n = 0;
    if (n > REPOS_MAX) n = REPOS_MAX;
    return n;
  }

  // À l'échéance : UNE SEULE FOIS. Pas de décompte qui presse, pas d'alarme au
  // dépassement, rien qui se répète — le chronomètre informe, il ne commande
  // pas (§7 ter.3). Une cible à zéro ne sonne jamais : zéro veut dire
  // « pas de cible », pas « tout de suite ».
  function echeanceAtteinte(cible, secondes, dejaSonne) {
    if (dejaSonne) return false;
    var c = Number(cible) || 0;
    if (c <= 0) return false;
    return (Number(secondes) || 0) >= c;
  }

  // ══ LE CHRONOMÈTRE S'ARRÊTE À L'ÉCHÉANCE (§7 septies.3) ══════════════════
  //
  // Il ne compte pas au-delà. Un compteur qui continue de monter après la cible
  // est un décompte qui presse, et le chronomètre informe — il ne commande pas
  // (§7 ter.3).
  //
  // ⚠️ CE QUI EST FIGÉ EST L'AFFICHAGE, JAMAIS LA MESURE. `repos_s` se calcule
  // à la validation suivante, depuis l'écart entre deux `validee_a` (`valider`
  // ci-dessus) : il porte le repos RÉEL, même s'il a duré trois fois la cible.
  // Geler l'un n'a aucun effet sur l'autre, et c'est le point — on arrête de
  // montrer, on n'arrête pas d'observer.
  //
  // Sans cible, rien ne fige : zéro veut dire « pas de cible », et un
  // chronomètre libre compte tant qu'on le regarde.
  function reposFige(cible, secondes) {
    var c = Number(cible) || 0;
    if (c <= 0) return false;
    return (Number(secondes) || 0) >= c;
  }

  function secondesAffichees(cible, secondes) {
    var s = Number(secondes) || 0;
    return reposFige(cible, s) ? (Number(cible) || 0) : s;
  }

  var api = {
    TYPES: TYPES, RESSENTIS: RESSENTIS,
    PAS_REPOS: PAS_REPOS,
    ajusterCible: ajusterCible,
    echeanceAtteinte: echeanceAtteinte,
    reposFige: reposFige,
    secondesAffichees: secondesAffichees,
    EN_COURS: EN_COURS, TERMINEE: TERMINEE, REPOS_MAX: REPOS_MAX,
    REPOS_CIBLE_MIN: REPOS_CIBLE_MIN, REPOS_CIBLE_MAX: REPOS_CIBLE_MAX,
    SALLE_MAX: SALLE_MAX,
    creer: creer,
    serieVide: serieVide,
    ajouterExercice: ajouterExercice,
    retirerExercice: retirerExercice,
    ajouterSerie: ajouterSerie,
    retirerSerie: retirerSerie,
    modifierSerie: modifierSerie,
    changerType: changerType,
    definirEffort: definirEffort,
    definirNoteExercice: definirNoteExercice,
    definirNoteSerie: definirNoteSerie,
    definirReposCible: definirReposCible,
    decrire: decrire,
    ecartsRoutine: ecartsRoutine,
    avancerTours: avancerTours,
    tourAtteint: tourAtteint,
    normaliserGroupes: normaliserGroupes,
    reprendre: reprendre,
    refaire: refaire,
    deplacerVers: deplacerVers,
    grouperBlocs: grouperBlocs,
    degrouperExercice: degrouperExercice,
    remplacerExercice: remplacerExercice,
    insererExercice: insererExercice,
    retirerExercices: retirerExercices,
    compterValidees: compterValidees,
    valider: valider,
    devalider: devalider,
    derniereValidation: derniereValidation,
    terminer: terminer,
    COLONNES_SET: COLONNES_SET,
    COLONNES_SET_EN_PLUS: COLONNES_SET_EN_PLUS,
    COLONNES_SESSION: COLONNES_SESSION,
    COLONNES_SESSION_EN_PLUS: COLONNES_SESSION_EN_PLUS,
    verifierColonnes: verifierColonnes,
    ecartDeColonnes: ecartDeColonnes,
    provenanceIncomplete: provenanceIncomplete,
    partEnBase: partEnBase,
    semerIdentifiants: semerIdentifiants,
    toutesLesSeries: toutesLesSeries,
    compter: compter,
    lignes: lignes,
    ligneSession: ligneSession,
    precedent: precedent,
    fantome: fantome
  };

  racine.THSeance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
