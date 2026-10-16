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
    'groupe_superset', 'validee_a', 'rang', 'repos_s',
    // §9.20 (51-3, migration `v2_056`) — la marque « douleur » de la série, et
    // l'occurrence de son exercice dans la séance (uuid ; NULL pour une ligne
    // importée ou d'avant la colonne).
    'douleur', 'occurrence'
  ];
  // Lues, jamais écrites : le serveur les pose lui-même.
  var COLONNES_SET_EN_PLUS = ['created_at', 'modifie_a'];

  // 69 (ECRAN-PROFIL §2.4 quater) — `source_ref`, la référence d'import
  // (`hevy:<id>`), lue ET écrite : sans elle, une séance importée ne se
  // reconnaîtrait pas au prochain import, et sa correction l'effacerait.
  var COLONNES_SESSION = [
    'id', 'user_id', 'debut', 'fin', 'titre', 'note', 'salle', 'routine_id',
    'source', 'source_ref', 'statut'
  ];
  // `salle_norme` est GÉNÉRÉE : lue pour l'affichage, jamais envoyée.
  var COLONNES_SESSION_EN_PLUS = ['created_at', 'salle_norme'];

  function copie(o) { return Object.assign({}, o); }

  // Recopie la séance en ne clonant QUE la branche touchée. Une séance fait
  // quelques dizaines de séries : le coût est nul, et l'immuabilité vaut mieux
  // qu'une micro-économie sur un écran qu'on écrit sur disque à chaque geste.
  // ── L'OCCURRENCE D'UN EXERCICE DANS LA SÉANCE ───────────────────────────
  //
  // Un même exercice peut figurer DEUX FOIS dans une séance — le tapis en
  // échauffement puis en cardio, le couché en ouverture puis en finition
  // (mesuré par Claude.ai : 151 séances sur 611 chez Aurélien). Chaque entrée
  // de `seance.exercices` porte donc son identifiant d'occurrence,
  // `occurrence`, posé UNE FOIS — à la première construction qui la voit, sur
  // l'identifiant de sa première série (`o-<id>`) — puis gardé tel quel, quoi
  // qu'on fasse de ses séries ou de sa place. Il vit dans le brouillon de
  // l'appareil, jamais en base (`sets` n'a pas de colonne pour lui) : une
  // séance reprise depuis la base en reçoit un neuf, et ses paris s'y
  // rattachent par la série qu'ils observent (`parisDeLOccurrence`).
  function avecOccurrences(exercices) {
    var vu = false;
    var sortie = (exercices || []).map(function (e, i) {
      if (!e || e.occurrence) return e;
      vu = true;
      var s0 = (e.series || [])[0];
      return Object.assign({}, e, { occurrence: 'o-' + (s0 && s0.id ? s0.id : (e.exercise_slug || 'x') + '-' + i) });
    });
    return vu ? sortie : exercices;
  }

  function avecExercices(seance, exercices) {
    return Object.assign({}, seance, { exercices: avecOccurrences(exercices) });
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
  // ⚠️ LA SÉANCE REPRODUIT CHAQUE LIGNE PROGRAMMÉE, AVEC SON TYPE (ch. 43).
  //
  // Avant `v2_042_routine_sets`, la routine ne portait qu'un ENTIER : démarrer
  // fabriquait N séries de travail identiques, et une rampe d'échauffement
  // 15-10-5-1 était tout simplement impossible à programmer. Une séance démarrée
  // depuis une routine arrive maintenant avec ses chauffes et ses dégressives
  // déjà en place.
  //
  // ⚠️ LE TYPE ET LES REPS VISÉES ; LA CHARGE DE DÉPART SEULEMENT COMME
  // INTENTION (§7 quindecies.3, chantier 52). La routine dit la structure, le
  // moteur dit les charges : `charge_cible_kg` descend sur la ligne pour que
  // le coach et le fantôme la LISENT, et elle ne sert que la première fois
  // qu'un exercice est fait — ensuite, le coach décide seul.
  //
  // Une routine sans aucune ligne programmée donne une série vide plutôt qu'un
  // exercice sans rien : un exercice à zéro série ne se saisit pas.
  function exerciceDepuisRoutine(e, idSerie) {
    var programmees = (e && e.series) || [];
    var series = programmees.map(function (p) {
      var ligne = serieVide(idSerie);
      ligne.type_serie = (p && p.type_serie) || 'travail';
      // ⚠️ `p.reps`, PAS `p.reps_visees` — ET LES DEUX NOMS SONT JUSTES.
      // La ligne de routine arrive au vocabulaire de la SAISIE
      // (`THRoutines.enSaisie`), parce que l'éditeur de routine est l'écran de
      // séance et l'édite telle quelle. En séance, la même valeur change de
      // rôle : ce qui était la case qu'on remplit devient la cible qu'on vise,
      // donc elle passe dans `reps_visees` et la case part vide.
      ligne.reps_visees = (!p || p.reps === undefined) ? null : p.reps;
      // ⚠️ LA CHARGE DE DÉPART DESCEND, ET NE SERT QUE LA PREMIÈRE FOIS
      // (§7 quindecies.3, chantier 52). Le fantôme est une CASCADE — ce qu'on
      // vient de taper, le plan du coach, la dernière séance, puis la charge de
      // départ, sur un exercice JAMAIS FAIT seulement (plus « faute de séance
      // au même rang »). Le coach part d'elle la première fois (MOTEUR §9.21).
      ligne.charge_cible_kg = (!p || p.charge_kg === undefined) ? null : p.charge_kg;
      // ECRAN-SAISIE §7 septendecies.3 (54-1) — la durée et la distance d'un
      // cardio descendent aussi, en INTENTION : « tapis, 7 min / 600 m ».
      ligne.duree_cible_s = (!p || p.duree_s === undefined) ? null : p.duree_s;
      ligne.distance_cible_m = (!p || p.distance_m === undefined) ? null : p.distance_m;
      return ligne;
    });
    if (!series.length) series.push(serieVide(idSerie));
    return {
      exercise_slug: e.exercise_slug,
      routine_exercise_id: e.id === undefined ? null : e.id,
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
        // §9.20 — l'occurrence et la marque relues de la base (une séance
        // reprise), jamais recopiées dans une séance refaite : c'est une autre
        // séance.
        var occ = o.vider ? null : uuidDOccurrence(exo.series.length ? exo.series[0].occurrence : null);
        var marque = !o.vider && exo.series.some(function (l) { return l.douleur === true; });
        acc.push(Object.assign({
          exercise_slug: exo.slug,
          // `sets` ne porte pas la ligne de routine : une séance reprise ou
          // refaite n'en dépend plus, et c'est juste — elle a pu diverger.
          routine_exercise_id: null,
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
        }, occ ? { occurrence: 'o-' + occ } : {}, marque ? { douleur: true } : {}));
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
    return avecProvenance(normaliserGroupes({
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
    }), session);
  }

  // 69 — LA PROVENANCE SUIT LA SÉANCE ROUVERTE. Une séance Hevy corrigée en
  // Édition repartait en `'app'` (`ligneSession` l'écrivait en dur) : trois
  // séances d'août en portent la trace. `source` et `source_ref` sont recopiées
  // de la ligne lue quand elle les porte.
  function avecProvenance(seance, session) {
    var o = Object.assign({}, seance);
    if (session.source !== undefined && session.source !== null) o.source = session.source;
    if (session.source_ref !== undefined) o.source_ref = session.source_ref;
    return o;
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
  // ⚠️ `reps_visees` ET `charge_cible_kg` SONT DES INTENTIONS, PAS DES
  // OBSERVATIONS (chantiers 43 et 44). Elles viennent de `routine_sets` et
  // servent au FANTÔME ; elles n'ont aucune colonne dans `sets` et
  // `COLONNES_SET` ne les laisse donc pas partir. Elles sont LUES — c'est
  // l'inverse exact du champ écrit que personne ne relit.
  function serieVide(idSerie) {
    return {
      id: typeof idSerie === 'function' ? idSerie() : (idSerie || null),
      type_serie: 'travail',
      charge_kg: null, reps: null, duree_s: null, distance_m: null,
      rpe: null, ressenti: null, note: null,
      validee_a: null, repos_s: null, reps_visees: null, charge_cible_kg: null,
      // ECRAN-SAISIE §7 septendecies.3 (54-1) — la durée et la distance d'un
      // cardio de routine : des INTENTIONS, comme `reps_visees`, lues par le
      // fantôme et jamais écrites (`COLONNES_SET` ne les connaît pas).
      duree_cible_s: null, distance_cible_m: null
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

  // ⚠️ DEUX MANQUES, UNE SEULE QUESTION : « ai-je vraiment les séries de cette
  // séance ? » (chantier 47)
  //
  //   · AUCUNE série en cache — la synchronisation initiale ne les a pas encore
  //     apportées. Mesuré en base le 18/09 : 0 séance vide sur 1 235, sorties
  //     comprises. Une séance sans série n'est donc pas un fait, c'est un
  //     MANQUE — et c'est la règle que `THModele.resumerSeance` appelle
  //     `incomplet` depuis le chantier 40 ;
  //   · des séries SANS PROVENANCE — un cache écrit par une version d'avant,
  //     où `source` manque (chantier 34, D1).
  //
  // Les deux rendent une modification DESTRUCTRICE : la séance rouverte est
  // vide, et « Enregistrer » pose `remplacerSeries(id, [])`, ce qui efface en
  // base les séries qu'on n'avait pas encore reçues.
  //
  // ⚠️ ET ELLES SE POSAIENT À UN ENDROIT SUR DEUX. La carte de la liste refusait
  // son menu sur la première (`rendu.js`, `r.incomplet`) ; la garde de
  // `modifierSeance` ne voyait que la seconde — et `provenanceIncomplete([])`
  // rend FAUX, parce qu'elle parle de la provenance de séries qui existent.
  // Une séance dont RIEN n'était arrivé passait donc entre les deux gardes.
  // C'est `CADRAGE-V2` §2 undecies dans sa forme la plus coûteuse : pas du code
  // dupliqué, une règle appliquée à un endroit sur deux.
  //
  // Une seule porte, désormais, et les trois surfaces la franchissent : la
  // carte, le détail, et la garde de la réouverture.
  function seriesIncompletes(series) {
    var liste = series || [];
    return liste.length === 0 || provenanceIncomplete(liste);
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
  // ⚠️ L'INTENTION VA SUR LA LIGNE, PLUS SUR L'EXERCICE (chantier 43). Le
  // fantôme lit `reps_visees` de SA série : la poser sur l'exercice la
  // rendrait invisible, c'est-à-dire un champ écrit que personne ne relit.
  // §9.13 (49-C) — `options.series` : le nombre de séries de travail posées
  // d'emblée (`THPlan.seriesDeDepart`), une par défaut. ⚠️ Plus d'une série demande
  // un `idSerie` FONCTION : une chaîne ne fait qu'un identifiant, et deux
  // séries qui le partageraient heurteraient `sets_pkey`.
  function seriesInitiales(idSerie, o) {
    var nb = Number(o.series);
    if (!isFinite(nb) || nb < 1 || Math.floor(nb) !== nb) nb = 1;
    if (typeof idSerie !== 'function') nb = 1;
    var series = [];
    for (var i = 0; i < nb; i++) {
      var s = serieVide(idSerie);
      if (o.reps_visees !== undefined) s.reps_visees = o.reps_visees;
      series.push(s);
    }
    return series;
  }

  function ajouterExercice(seance, slug, idSerie, options) {
    var o = options || {};
    var exos = seance.exercices.concat([{
      exercise_slug: slug,
      routine_exercise_id: null,
      repos_cible_s: o.repos_cible_s === undefined ? null : o.repos_cible_s,
      note: texteOuNul(o.note),
      // Un exercice ajouté en séance est un bloc d'un seul : on ne groupe pas
      // ici (§5 du chantier 27).
      groupe_superset: null,
      series: seriesInitiales(idSerie, o)
    }]);
    return avecExercices(seance, exos);
  }

  // « + Série » — la nouvelle série de travail se place APRÈS LA DERNIÈRE
  // SÉRIE DE TRAVAIL, avant les dégressives qui terminent l'exercice,
  // tant qu'aucune n'est faite (consolidation 4/7) : une
  // dégressive se fait sur la dernière série de travail, une série ajoutée
  // ensuite ne doit pas la laisser au milieu. Sans dégressive en attente en
  // fin d'exercice, la série s'ajoute à la fin, comme avant.
  function placeDeLaSerie(series) {
    var i = series.length;
    while (i > 0 && series[i - 1] && series[i - 1].type_serie === 'degressive') {
      // Une dégressive déjà faite : la séquence est entamée, on ajoute à la fin.
      if (series[i - 1].validee_a) return series.length;
      i--;
    }
    if (i === series.length) return i;
    for (var j = i - 1; j >= 0; j--) {
      if (series[j] && estTravail(series[j])) return i;
    }
    return series.length;
  }

  function ajouterSerie(seance, iExo, idSerie) {
    var exos = seance.exercices.slice();
    var exo = copie(exos[iExo]);
    var place = placeDeLaSerie(exo.series);
    exo.series = exo.series.slice(0, place).concat([serieVide(idSerie)], exo.series.slice(place));
    exos[iExo] = exo;
    return avecExercices(seance, exos);
  }

  // MOTEUR §14 (111) — « Ajouter une dégressive » : la dégressive proposée par
  // le coach, une ligne typée dégressive APRÈS les séries de l'exercice (elle
  // suit la dernière série de travail) ; charge et reps vides : le plan la
  // remplit (§9.15.3). Jamais écrite dans une série existante.
  function ajouterDegressive(seance, iExo, idSerie) {
    var exos = seance.exercices.slice();
    var exo = copie(exos[iExo]);
    var s = serieVide(idSerie);
    s.type_serie = 'degressive';
    exo.series = exo.series.concat([s]);
    exos[iExo] = exo;
    return avecExercices(seance, exos);
  }

  // MOTEUR §9.15.2 (49-U10) — « Ajouter » : les chauffes proposées par le
  // coach, typées échauffement, AU-DESSUS des séries de travail (avant la
  // première ; en tête s'il n'y en a pas). Une ligne par marche, avec ses reps
  // visées ; la charge reste vide : le plan la remplit, comme pour une routine.
  // `lignes` : `[[charge, reps]]`, la proposition telle que le plan la porte.
  function insererChauffes(seance, iExo, lignes, idSerie) {
    var exos = seance.exercices.slice();
    var exo = copie(exos[iExo]);
    var series = exo.series.slice();
    var a = 0;
    while (a < series.length && !estTravail(series[a])) a++;
    if (a === series.length) a = 0;
    var neuves = (lignes || []).map(function (q) {
      var s = serieVide(idSerie);
      s.type_serie = 'echauffement';
      s.reps_visees = q && q[1] !== undefined ? q[1] : null;
      return s;
    });
    exo.series = series.slice(0, a).concat(neuves, series.slice(a));
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

  // ⚠️ DÉPLACER EXPLICITEMENT EFFACE LA MÉMOIRE DES RANGS LUS (chantier 35, D2).
  //
  // Le chantier 34 garde les rangs d'origine tant qu'ils sont TOUS connus et
  // TOUS distincts — pour qu'une séance importée qu'on n'a fait que rouvrir ne
  // soit pas renumérotée, ce qui aplatirait les 53 supersets entrelacés de la
  // base. Cette garde couvrait trop large : après un déplacement, les rangs
  // d'origine sont toujours tous connus et tous distincts. Ils décrivaient
  // simplement l'ANCIEN ordre — et c'est lui qui repartait en base, intact.
  // Mesuré au banc : « Monter le bloc » bougeait le bloc à l'écran, et la base
  // ne bougeait pas d'un rang.
  //
  // La distinction n'est pas dans les nombres, elle est dans le GESTE :
  // enregistrer sans rien changer ne renumérote rien ; déplacer explicitement
  // s'écrit. Un geste qui change l'ORDRE ou le GROUPEMENT oublie donc les rangs
  // lus — ils ne décrivent plus cette séance — et `rangsDeSortie` renumérote
  // depuis la position, ce qu'il sait déjà faire.
  function oublierRangsOrigine(seance) {
    if (!seance || !seance.exercices) return seance;
    return Object.assign({}, seance, {
      exercices: seance.exercices.map(function (e) {
        return Object.assign({}, e, {
          series: (e.series || []).map(function (s) {
            return Object.assign({}, s, { rang_origine: null });
          })
        });
      })
    });
  }

  // §5.5 — Déplacer agit sur le BLOC entier, jamais sur une de ses branches :
  // sortir un exercice d'un superset est un autre geste (§5.8). L'appelant sait
  // où vont les blocs ; ce module ne fait que réaliser le mouvement. `ou` est
  // l'indice, dans le tableau D'ORIGINE, devant lequel la tranche vient se
  // placer.
  function deplacerVers(seance, indices, ou) {
    var idx = (indices || []).slice().sort(function (a, b) { return a - b; });
    if (!idx.length) return seance;
    return oublierRangsOrigine(
      normaliserGroupes(avecExercices(seance, bouger(seance.exercices, idx, ou))));
  }

  // ⚠️ RÉORDONNER EN UNE FOIS (§7 vicies, chantier 46). Le mode Réorganiser
  // bouge PLUSIEURS blocs avant d'enregistrer : rejouer une suite de
  // `deplacerVers` reviendrait à recalculer des indices qui ont bougé entre
  // deux, et c'est exactement le genre de décalage d'un cran qui a coûté le
  // commentaire de `bouger`. On pose donc l'ordre voulu d'un seul coup.
  //
  // `tranches` est une liste de TRANCHES d'indices — un bloc par tranche, dans
  // l'ordre voulu. Un superset est une tranche de plusieurs : il se déplace
  // d'un tenant sans que cette fonction ait à le savoir (chantier 28).
  //
  // ⚠️ MÊME SORTIE QUE `deplacerVers` : groupes renumérotés depuis la nouvelle
  // adjacence, rangs d'origine OUBLIÉS (chantier 35, D2). Sans l'oubli, l'ordre
  // affiché changerait et la base garderait l'ancien — le défaut exact que D2 a
  // corrigé.
  //
  // Une tranche inconnue, un indice répété ou un oubli rendent la séance
  // INCHANGÉE : on ne devine pas un ordre partiel, on refuse.
  function reordonnerBlocs(seance, tranches) {
    var exos = (seance && seance.exercices) || [];
    var plat = [];
    (tranches || []).forEach(function (t) {
      (t || []).forEach(function (i) { plat.push(i); });
    });
    if (plat.length !== exos.length) return seance;
    var vus = {};
    for (var k = 0; k < plat.length; k++) {
      var i = plat[k];
      if (typeof i !== 'number' || i < 0 || i >= exos.length || vus[i]) return seance;
      vus[i] = true;
    }
    var neufs = plat.map(function (i) { return exos[i]; });
    return oublierRangsOrigine(normaliserGroupes(avecExercices(seance, neufs)));
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
    return oublierRangsOrigine(
      normaliserGroupes(avecExercices(seance, bouger(exos, b, apres))));
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
    // ⚠️ ET LES RANGS NE S'OUBLIENT QUE S'IL BOUGE VRAIMENT (chantier 35).
    // À deux, le superset se dissout sans que rien ne change de place : la
    // séance n'a pas été réordonnée, donc les rangs lus la décrivent toujours,
    // et les jeter renumérterait une séance que personne n'a déplacée. La
    // campagne de mutations l'a montré — retirer l'oubli ici ne cassait rien,
    // parce que le seul cas testé passait par `grouperBlocs`, qui avait déjà
    // oublié les rangs.
    if (bloc.length <= 2) return normaliserGroupes(avecExercices(seance, exos));
    exos = bouger(exos, [iExo], bloc[bloc.length - 1] + 1);
    return oublierRangsOrigine(normaliserGroupes(avecExercices(seance, exos)));
  }

  // ══ « MACHINE PRISE » (MOTEUR §9.19, chantier 51) ═══════════════════════
  //
  // D'abord « Plus tard » : l'exercice prévu, un peu plus loin. Sinon un frère,
  // avec sa propre consigne. Deux fonctions pures, comme les gestes ci-dessus :
  // elles disent OÙ va le bloc et QUELS frères proposer ; le geste lui-même est
  // `reordonnerBlocs` (déplacer) ou `remplacerExercice` (un frère), déjà là.
  //
  // `blocs` : `[{ id, exercices: [{ slug, travail_valide }] }]`, dans l'ordre
  // de la séance. `travail_valide` : une série de travail du bloc est validée.
  // Rend `{ possible: true, ordre: [id…] }`, ou `{ possible: false, raison }` —
  // « dernier » (rien derrière lui) ou « commencé » (on ne coupe pas un
  // exercice commencé : seul le frère reste).
  //
  // ⚠️ LE BLOC PASSE JUSTE APRÈS LE BLOC SUIVANT, ET C'EST TOUT. Un superset est
  // un bloc : il bouge en entier, sans que cette fonction ait à le savoir. Le
  // geste se répète — deux fois, il recule de deux. La consigne ne change pas :
  // la charge ne dépend pas de la position (mesuré, 2 089 cas), et §12 bis
  // interdit une règle d'ordre sans mesure.
  function plusTard(blocs, i) {
    var liste = blocs || [];
    var bloc = liste[i];
    if (!bloc || i >= liste.length - 1) return { possible: false, raison: 'dernier' };
    var commence = (bloc.exercices || []).some(function (e) { return !!(e && e.travail_valide); });
    if (commence) return { possible: false, raison: 'commencé' };
    var ordre = liste.map(function (b) { return b.id; });
    ordre[i] = liste[i + 1].id;
    ordre[i + 1] = bloc.id;
    return { possible: true, ordre: ordre };
  }

  // Les frères à proposer pour `slug` : même `mouvement` au catalogue
  // (`THModele.freresDe`, la seule lecture de la colonne), lui excepté.
  //
  // `catalogue` : l'index du catalogue (`{ slug: { nom, mouvement } }`).
  // `faits` : `{ slug: fait }`, le dernier chiffre de chaque frère — CE QUE DIT
  // « Dernière séance » sur sa page d'exercice, calculé par l'appelant avec la
  // même fonction (jamais ici : ce module ne lit pas l'historique). Un frère
  // absent de `faits` n'a jamais été fait (« Première fois ici »).
  // `presents` : les slugs déjà dans la séance.
  //
  // L'ORDRE : d'abord ceux qui ne sont pas déjà dans la séance ; parmi eux,
  // ceux qui ont un historique, le plus récent d'abord, puis les autres par
  // nom — ceux que le matériel de la personne n'a pas (`horsMateriel(slug)`,
  // facultatif, 60-1) passant APRÈS les autres, jamais retirés. Un frère déjà
  // dans la séance reste proposé, à la fin : il y serait une seconde
  // occurrence, libre (§9.13 bis).
  function freresProposes(slug, catalogue, faits, presents, horsMateriel) {
    return exercicesProposes(racine.THModele.freresDe(catalogue || {}, slug), catalogue, faits, presents, horsMateriel);
  }

  // MOTEUR §13.6 bis (67A) — AU PLUS 5 EXERCICES DE LA MÊME FAMILLE sous les frères : assez pour trouver une machine
  // libre, pas assez pour noyer les frères (une famille compte jusqu'à 40 abdos). Le catalogue garde le reste
  // (« Chercher dans le catalogue »). Une convention de l'app (C).
  var COUSINS_PROPOSES = 5;

  // L'ORDRE DE PRÉSENTATION d'une liste d'exercices de remplacement — celui des frères (ci-dessus), et, depuis 67A,
  // celui de la même famille (MOTEUR §13.6 bis, `Modele.cousinsDe`) : une seule règle, jamais recopiée.
  function exercicesProposes(slugs, catalogue, faits, presents, horsMateriel) {
    var index = catalogue || {};
    var connus = faits || {};
    var ici = {};
    (presents || []).forEach(function (s) { ici[s] = true; });
    // 60-1 — LE MATÉRIEL RANGE : un frère que le matériel de la personne n'a
    // pas passe après les autres, jamais retiré. Un frère qu'elle a déjà fait
    // n'est jamais rétrogradé : c'est son historique qui parle. À côté de la
    // liste, pas dedans : la forme `{ slug, fait, deja_dans_la_seance }` est
    // celle des cas de référence (`cas-51-2`).
    var hors = {};
    var liste = (slugs || []).map(function (s) {
      hors[s] = !connus[s] && typeof horsMateriel === 'function' && !!horsMateriel(s);
      return { slug: s, fait: connus[s] || null, deja_dans_la_seance: !!ici[s] };
    });
    var nom = function (s) { return racine.THModele.nommer(index, s); };
    var quand = function (f) { var t = new Date(f.date).getTime(); return isNaN(t) ? -Infinity : t; };
    return liste.sort(function (a, b) {
      if (a.deja_dans_la_seance !== b.deja_dans_la_seance) return a.deja_dans_la_seance ? 1 : -1;
      if (!a.fait !== !b.fait) return a.fait ? -1 : 1;
      if (hors[a.slug] !== hors[b.slug]) return hors[a.slug] ? 1 : -1;
      if (a.fait && b.fait && quand(a.fait) !== quand(b.fait)) return quand(b.fait) - quand(a.fait);
      return nom(a.slug).localeCompare(nom(b.slug), 'fr') || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
    });
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
  // Le nouveau hérite du SLOT — repos cible, groupe de superset — et des
  // lignes que l'ancien N'A PAS ENCORE FAITES, avec leurs types (une chauffe non
  // faite reste une chauffe), vides : rien de plus (prérequis d'« adapter »,
  // 04/10/2026). Avant, il recevait autant de lignes que l'ancien en avait,
  // faites et chauffes comprises, toutes en travail : 3 séries faites sur 4,
  // et la séance passait de 4 à 7 lignes. « Faite » se lit comme partout
  // (`partEnBase`, chantier 35) : une série importée est faite sans
  // `validee_a`. Il hérite du reste de rien d'autre. Pas la note (« barre basse » ne veut rien dire
  // sur une presse), pas les reps visées (la routine les prescrivait pour
  // l'ancien mouvement), pas `routine_exercise_id` : ce n'est plus cette ligne
  // de routine.
  function remplacerExercice(seance, iExo, slug, idSerie) {
    var ancien = (seance.exercices || [])[iExo];
    if (!ancien || !slug) return seance;
    var faites = (ancien.series || []).filter(function (s) { return partEnBase(s); });
    var restantes = (ancien.series || []).filter(function (s) { return !partEnBase(s); });
    var neuf = {
      exercise_slug: slug,
      routine_exercise_id: null,
      repos_cible_s: ancien.repos_cible_s === undefined ? null : ancien.repos_cible_s,
      note: null,
      groupe_superset: ancien.groupe_superset === undefined ? null : ancien.groupe_superset,
      series: []
    };
    restantes.forEach(function (s) {
      var ligne = serieVide(idSerie);
      ligne.type_serie = s.type_serie || 'travail';
      neuf.series.push(ligne);
    });
    // Un exercice sans ligne ne se saisit pas : tout était fait, il en reçoit une.
    if (!neuf.series.length) neuf.series.push(serieVide(idSerie));

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
      repos_cible_s: o.repos_cible_s === undefined ? null : o.repos_cible_s,
      note: texteOuNul(o.note),
      groupe_superset: null,
      series: seriesInitiales(idSerie, o)
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

  // Combien de séries FAITES dans une tranche — ce que la confirmation de
  // suppression doit annoncer, parce qu'une suppression silencieuse de travail
  // fait est exactement ce qu'on s'interdit.
  //
  // ⚠️ `validee_a` NE SUFFIT PAS, ET C'EST UNE SUPPRESSION SILENCIEUSE (ch. 35,
  // D3). Les 28 103 séries importées l'ont à NULL : sur une séance rouverte en
  // correction, ce compte rendait 0, donc la question n'était JAMAIS posée, donc
  // trois semaines de travail partaient sur un seul tap. `partEnBase` dit la
  // vraie chose — « cette série existe, elle a été faite » — qu'elle porte une
  // date de validation ou qu'elle vienne de la base.
  // ⚠️ ET IL COMPTE DES LIGNES, PAS DES SÉRIES DE TRAVAIL (chantier 39, C1).
  //
  // Partout ailleurs, « série » veut dire série de TRAVAIL — les chauffes n'en
  // sont pas. Mais un écran qui annonce une suppression dit ce qu'il va
  // VRAIMENT effacer : six lignes partent, il annonce six lignes. Le compte
  // n'est donc pas le même, et c'est voulu — d'où le détail, qui évite qu'un
  // nombre nu se lise comme les autres.
  function compterAEffacer(seance, indices) {
    var idx = (indices || []).slice();
    var lignes = 0, chauffes = 0;
    ((seance && seance.exercices) || []).forEach(function (e, i) {
      if (idx.indexOf(i) < 0) return;
      (e.series || []).forEach(function (s) {
        if (!partEnBase(s)) return;
        lignes++;
        if (typeDe(s) === 'echauffement') chauffes++;
      });
    });
    return { lignes: lignes, chauffes: chauffes };
  }

  // ── Saisie ──────────────────────────────────────────────────────────────
  // ⚠️ LES COLONNES `integer` DE `sets`, ET CE QU'ELLES REFUSENT (ch. 36, D6).
  //
  // `sets.reps` et `sets.duree_s` sont `integer` et ne portent AUCUN CHECK :
  // rien ne les bornait, ni en base, ni dans l'app, et le champ de saisie est
  // un `type="text"` sans `max`. Onze chiffres dépassent `int4` → `22003` ;
  // au-delà de 1e21, le nombre part en notation exponentielle dans le JSON →
  // `22P02`, code DÉFINITIF, file morte.
  //
  // `distance_m` et `charge_kg` sont `numeric` — sans précision déclarée, donc
  // sans dépassement possible. C'est la différence qui compte, et elle se lit
  // dans le schéma, pas dans l'intuition : « c'est un nombre » ne dit pas si la
  // base l'acceptera.
  //
  // Les plafonds sont GÉNÉREUX, pas justes : ils écartent l'absurde sans
  // prétendre dire ce qui est physiologiquement plausible. 104 reps existent en
  // base sur une vraie série, et une randonnée dépasse l'heure — borner à
  // `REPS_MAX` de routine (100) ou à `sets_repos_borne` (3600) effacerait des
  // données réelles. On borne pour que la base accepte, rien de plus.
  var REPS_MAX_SERIE = 9999;
  var DUREE_MAX_S = 86400;          // 24 h

  // La lecture d'un nombre tapé est celle du formateur (`THModele.lireNombre`,
  // correctif du 03/10/2026) : elle relit tout ce qu'il affiche, le vrai signe
  // moins compris. Une copie locale relisait « −25 » comme rien.
  function nombreOuNul(v) { return racine.THModele.lireNombre(v); }

  // Ramène dans [0, max]. `null` traverse — « non renseigné » n'est pas zéro.
  function plafonne(n, max) {
    if (n === null) return null;
    return Math.min(max, Math.max(0, n));
  }

  // Un entier positif ou rien, après conversion depuis l'unité de SAISIE.
  //
  // `facteur` est ce qui sépare ce qu'on tape de ce que porte la colonne : on
  // saisit une rando en minutes et en kilomètres, la base stocke des secondes
  // et des mètres. Une valeur négative n'existe pas — une durée ni une distance
  // ne se comptent à rebours — et on la rejette plutôt que de la stocker.
  function entierOuNul(v, facteur, max) {
    var n = nombreOuNul(v);
    if (n === null) return null;
    var e = Math.round(n * (facteur || 1));
    if (e < 0) return null;
    return max === undefined ? e : Math.min(max, e);
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
  // ⚠️ UNE SEULE EXPRESSION PAR COLONNE, ET DEUX APPELANTS (chantier 37).
  //
  // La saisie passe par `modifierSerie` ; la RÉPARATION d'une file déjà bloquée
  // passe par `bornerLigne`. Les deux doivent borner à l'identique, sinon une
  // entrée réparée repartirait avec une valeur que la saisie n'aurait jamais
  // produite — et on aurait trois jeux de règles pour deux colonnes.
  function repsBornees(v) {
    var r = nombreOuNul(v);
    return r === null ? null : plafonne(Math.round(r), REPS_MAX_SERIE);
  }
  function dureeBornee(v) { return entierOuNul(v, 1, DUREE_MAX_S); }

  // ⚠️ BORNER UNE LIGNE DÉJÀ CALCULÉE, ET DIRE SI ÇA A CHANGÉ QUELQUE CHOSE.
  //
  // Une entrée `sets` de la file porte des lignes figées au moment du geste,
  // donc calculées AVANT le correctif du chantier 36 : les rejouer telles quelles
  // échouerait à l'identique. C'est la différence avec une intention
  // `routine_exos`, dont les bornes s'appliquent à la VIDANGE.
  //
  // Le drapeau `change` n'est pas cosmétique : il décide si on a le droit de
  // lever le blocage. Une entrée refusée en `23514` pour une raison qu'aucune
  // borne ne touche — un `type_serie` inconnu, un `rpe` hors plage — ne doit PAS
  // être débloquée : elle échouerait à l'identique, et le déblocage masquerait
  // le vrai défaut derrière une nouvelle tentative.
  function bornerLigne(ligne) {
    if (!ligne || typeof ligne !== 'object') return { ligne: ligne, change: false };
    var c = {}, change = false;
    if ('reps' in ligne) {
      c.reps = repsBornees(ligne.reps);
      if (c.reps !== ligne.reps) change = true;
    }
    if ('duree_s' in ligne) {
      c.duree_s = dureeBornee(ligne.duree_s);
      if (c.duree_s !== ligne.duree_s) change = true;
    }
    return change ? { ligne: Object.assign({}, ligne, c), change: true }
                  : { ligne: ligne, change: false };
  }

  function modifierSerie(seance, iExo, iSerie, champs) {
    var c = {};
    if ('charge_kg' in champs) c.charge_kg = nombreOuNul(champs.charge_kg);
    if ('reps' in champs) c.reps = repsBornees(champs.reps);
    if ('duree' in champs) c.duree_s = dureeBornee(champs.duree);
    if ('duree_s' in champs) c.duree_s = dureeBornee(champs.duree_s);
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
  //
  // ⚠️ « METTRE À JOUR UNE ROUTINE » DEPUIS UNE SÉANCE PASSÉE (ECRAN-SAISIE
  // §7 quindecies.4, chantier 52) PASSE ICI, PAS AILLEURS. `options.series` :
  // la personne a CHOISI cette séance comme modèle et voit l'aperçu avant
  // d'écrire — la raison du §6.3 (« une séance écourtée amputerait la
  // routine ») ne tient plus. Une ligne dont la STRUCTURE a changé (le nombre
  // ou le type de ses séries, dans l'ordre) prend celle de la séance, reps
  // comprises comme repères, et l'écart `series` le dit ; une structure égale
  // garde les lignes de la routine telles quelles, reps et charges de départ
  // comprises. Un exercice ajouté garde ses lignes au lieu de lignes vides.
  // Sans l'option — la question de fin de séance —, rien ne change.
  function ecartsRoutine(seance, routine, options) {
    var o = options || {};
    var vide = { ecarts: [], voulues: [] };
    if (!seance || !routine || !routine.id) return vide;
    if (seance.routine_id !== routine.id) return vide;

    var lignes = (routine.exercices || []).slice()
      .sort(function (a, b) { return (a.rang || 0) - (b.rang || 0); });
    var parId = {};
    lignes.forEach(function (e) { if (e && e.id) parId[e.id] = e; });

    var changees = [];
    // 99 (MOTEUR §9.24) — un exercice ajouté pour la semaine qui déraille est pour cette semaine seulement : la
    // question de fin ne propose jamais de l'écrire dans la routine.
    var voulues = (seance.exercices || []).filter(function (exo) { return !(exo && exo.ajout); }).map(function (exo, iVoulue) {
      var ligne = (exo.routine_exercise_id && parId[exo.routine_exercise_id]) || null;
      if (o.series) {
        var deSeance = (exo.series || []).map(structureDeLigne);
        var garder = ligne && formeDesSeries(ligne.series) === formeDesSeries(deSeance);
        if (ligne && !garder) changees.push({ i: iVoulue, avant: ligne.series || [], apres: deSeance });
      }
      return {
        id: ligne ? ligne.id : (exo.routine_exercise_id || null),
        exercise_slug: exo.exercise_slug,
        // ⚠️ LES SÉRIES PROGRAMMÉES PASSENT, ELLES NE S'EFFACENT PAS (ch. 43).
        // `planEcritures` REMPLACE les lignes de chaque exercice : envoyer une
        // liste vide ici viderait `routine_sets` d'une routine à chaque report
        // de fin de séance. On rend donc ce que la routine porte déjà — et,
        // pour un exercice AJOUTÉ en séance qui n'a pas de ligne de routine, on
        // le déduit de ce qui a été fait, types compris. Même forme qu'avant,
        // où l'entier était repris de la routine ou compté sur la séance.
        series: o.series
          ? (garder ? (ligne.series || []) : deSeance)
          : ligne ? (ligne.series || []) : (exo.series || []).map(function (x) {
            return { type_serie: (x && x.type_serie) || 'travail', reps: null };
          }),
        repos_cible_s: exo.repos_cible_s === undefined ? null : exo.repos_cible_s,
        note: texteOuNul(exo.note),
        groupe_superset: exo.groupe_superset === undefined ? null : exo.groupe_superset
      };
    });

    // §9.18 (51-1 ter) — LES EXERCICES ENLEVÉS PAR LE RACCOURCI RESTENT DANS LA
    // ROUTINE. La séance raccourcie n'en a plus trace, mais la question de fin
    // ne propose jamais de les retirer (ECRAN-SAISIE §6.3) — et une mise à jour
    // demandée pour une autre raison ne doit pas les effacer en silence : ils
    // reprennent leur place, et leur superset, dans ce qui serait écrit.
    var retires = (seance.raccourcie && seance.raccourcie.retires) || [];
    if (retires.length) voulues = avecRetires(voulues, lignes, retires);

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
    voulues.forEach(function (v, i) {
      if (!v.id || idsAvant.indexOf(v.id) < 0) {
        // Avec `series`, l'aperçu a besoin de la ligne voulue (ses séries, son
        // repos) : l'écart dit laquelle. La question de fin n'en a pas besoin.
        ecarts.push(o.series ? { type: 'ajoute', exercise_slug: v.exercise_slug, i: i }
          : { type: 'ajoute', exercise_slug: v.exercise_slug });
      }
    });
    // §7 quindecies.4 — la structure changée d'une ligne gardée (option `series`).
    changees.forEach(function (c) {
      ecarts.push({ type: 'series', exercise_slug: voulues[c.i].exercise_slug, i: c.i,
                    avant: compteDesSeries(c.avant), apres: compteDesSeries(c.apres) });
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

  // La STRUCTURE d'une ligne, au vocabulaire de la saisie : son type et ses
  // repères (reps, durée, distance). Jamais sa charge — « Mettre à jour »
  // n'écrit aucune charge (§7 quindecies.4).
  function structureDeLigne(x) {
    return { type_serie: (x && x.type_serie) || 'travail',
             reps: x && x.reps !== undefined ? x.reps : null,
             charge_kg: null,
             duree_s: x && x.duree_s !== undefined ? x.duree_s : null,
             distance_m: x && x.distance_m !== undefined ? x.distance_m : null };
  }

  // La forme d'une suite de séries : leurs types, dans l'ordre. Les reps sont
  // des repères — 8 programmées et 7 faites ne sont pas une autre structure.
  function formeDesSeries(series) {
    return (series || []).map(function (x) { return (x && x.type_serie) || 'travail'; }).join('|');
  }

  // Ce que l'aperçu dit d'une suite de séries : les séries (tout sauf les
  // chauffes), dont les dégressives, et les chauffes à part.
  function compteDesSeries(series) {
    var c = { series: 0, chauffes: 0, degressives: 0 };
    (series || []).forEach(function (x) {
      var t = (x && x.type_serie) || 'travail';
      if (t === 'echauffement') c.chauffes++;
      else { c.series++; if (t === 'degressive') c.degressives++; }
    });
    return c;
  }

  // Les lignes de routine retirées par le raccourci, remises à leur place —
  // après la dernière ligne de la routine qui les précédait et que la séance
  // garde —, et les supersets qu'elles partageaient refaits : la séance avait
  // dissous un groupe devenu seul (§7 decies), la routine, elle, le garde. Les
  // groupes se renumérotent par blocs contigus, comme `normaliserGroupes`.
  function avecRetires(voulues, lignes, retires) {
    var estRetire = {}, rangDe = {}, touches = {};
    retires.forEach(function (id) { estRetire[id] = true; });
    lignes.forEach(function (l, k) {
      if (!l || !l.id) return;
      rangDe[l.id] = k;
      if (estRetire[l.id] && l.groupe_superset !== null && l.groupe_superset !== undefined) touches[l.groupe_superset] = true;
    });
    var cleDe = function (ligne, groupe) {
      if (ligne && ligne.groupe_superset !== null && ligne.groupe_superset !== undefined && touches[ligne.groupe_superset]) {
        return 'r' + ligne.groupe_superset;
      }
      return groupe === null || groupe === undefined ? null : 's' + groupe;
    };
    var parId = {};
    lignes.forEach(function (l) { if (l && l.id) parId[l.id] = l; });
    var liste = voulues.map(function (v) {
      return { v: v, cle: cleDe(v.id ? parId[v.id] : null, v.groupe_superset) };
    });
    lignes.forEach(function (l, k) {
      if (!l || !estRetire[l.id] || liste.some(function (x) { return x.v.id === l.id; })) return;
      var pos = 0;
      liste.forEach(function (x, j) {
        if (x.v.id && rangDe[x.v.id] !== undefined && rangDe[x.v.id] < k) pos = j + 1;
      });
      liste.splice(pos, 0, { v: {
        id: l.id, exercise_slug: l.exercise_slug, series: l.series || [],
        repos_cible_s: l.repos_cible_s === undefined ? null : l.repos_cible_s,
        note: texteOuNul(l.note),
        groupe_superset: l.groupe_superset === undefined ? null : l.groupe_superset
      }, cle: cleDe(l, null) });
    });
    var n = 0, i = 0, sortie = [];
    while (i < liste.length) {
      var j = i;
      while (liste[i].cle !== null && j + 1 < liste.length && liste[j + 1].cle === liste[i].cle) j++;
      var g = j > i ? ++n : null;
      for (var k2 = i; k2 <= j; k2++) sortie.push(Object.assign({}, liste[k2].v, { groupe_superset: g }));
      i = j + 1;
    }
    return sortie;
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
  //
  // ⚠️ `source` PART AUSSI, SINON LE GESTE NE FAIT RIEN (chantier 35, D3).
  // `partEnBase` garde en base ce qui VIENT de la base — c'est la protection du
  // chantier 34, et elle est juste. Mais depuis que ces séries s'affichent comme
  // faites, l'utilisateur peut les dévalider : sans retirer `source`, la ligne
  // resterait « venue de la base », donc en base, et la case se recocherait à la
  // réouverture. Un geste qui ne fait rien est pire qu'un geste absent.
  //
  // `source: null` dit exactement ce qui vient de se passer : cette ligne ne
  // vient plus de la base. Revalidée, elle repart comme une ligne de l'app
  // (`lignes()` écrit `source || 'app'`) — ce qu'elle est devenue.
  function devalider(seance, iExo, iSerie) {
    return avecSerie(seance, iExo, iSerie, { validee_a: null, repos_s: null, source: null });
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

  // `travail` : les séries de travail FAITES, sur la règle unique
  // (`THSemaine.compteSeriesTravail`, celle de la carte, de la barre et de
  // la page d'exercice — PR 6 de la consolidation). « Faite » est
  // `partEnBase` : validée, ou importée — une séance importée rouverte en
  // modification disait « 0 série de travail » quand sa carte en disait 23.
  // `exercices` : le catalogue, pour la règle du volume (le tapis ne compte
  // pas) ; sans lui, rien n'est retranché.
  function compter(seance, exercices) {
    var plat = toutesLesSeries(seance);
    var faites = plat.filter(function (p) { return partEnBase(p.serie); })
      .map(function (p) { return Object.assign({}, p.serie, { exercise_slug: p.exo.exercise_slug }); });
    return {
      series: plat.length,
      validees: plat.filter(function (p) { return !!p.serie.validee_a; }).length,
      travail: racine.THSemaine.compteSeriesTravail(faites, exercices)
    };
  }

  // ══ LA DURÉE DE LA BARRE DE SÉANCE (62, ECRAN-SAISIE §7 octies bis) ══════
  //
  // ⚠️ ELLE SE RECALCULE TOUJOURS DEPUIS `debut`, JAMAIS PAR UN COMPTEUR QU'ON
  // INCRÉMENTE. Une app mise en veille puis rouverte, un minuteur du navigateur
  // retardé de deux minutes : un compteur aurait dérivé, une soustraction ne le
  // peut pas. C'est la règle du chronomètre de repos (`depuis`), appliquée ici.
  //
  // Les minutes sont ARRONDIES, comme l'était le bandeau avant la barre (le
  // texte « N min » ne change pas d'un octet) : une date invalide ou une date
  // d'avant le départ — horloge réglée à la main — valent zéro, jamais un
  // nombre négatif ni « NaN min ».
  function minutesEcoulees(debut, maintenant) {
    var d = debut ? new Date(debut) : null;
    if (!d || isNaN(d.getTime())) return 0;
    var t = maintenant === undefined ? Date.now() : Number(maintenant);
    if (!isFinite(t)) return 0;
    return Math.max(0, Math.round((t - d.getTime()) / 60000));
  }

  // Dans combien de millisecondes `minutesEcoulees` change-t-elle de valeur ?
  // Le rafraîchissement se pose EXACTEMENT là : ni une seconde trop tôt (un
  // réveil pour rien), ni une demi-minute trop tard (une durée qui retarde).
  // Borné à une seconde par le bas — une horloge étrange ne fait pas tourner le
  // minuteur à vide — et à une minute et demie par le haut.
  var MARGE_MINUTE_MS = 50;
  function delaiProchaineMinute(debut, maintenant) {
    var d = debut ? new Date(debut) : null;
    var t = maintenant === undefined ? Date.now() : Number(maintenant);
    if (!d || isNaN(d.getTime()) || !isFinite(t)) return 60000;
    var ecoule = t - d.getTime();
    var m = Math.max(0, Math.round(ecoule / 60000));
    var delai = (m + 0.5) * 60000 - ecoule + MARGE_MINUTE_MS;
    return Math.min(90000, Math.max(1000, delai));
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

  // ⚠️ CE QUE LE CACHE DE LECTURE DOIT OUBLIER (chantier 35, D1).
  //
  // Le pendant local de `Donnees.remplacerSeries` : celui-là met la BASE à
  // l'image de la séance, celui-ci dit ce que le CACHE doit en retirer. Sans
  // lui, une série supprimée restait dans le cache pour toujours — `sets` se
  // synchronise à l'INCRÉMENT (`created_at`/`modifie_a`) et une ligne effacée ne
  // revient par définition jamais dire qu'elle n'est plus là. L'écran la
  // remontrait, et la correction suivante la RÉÉCRIRAIT en base.
  //
  // ⚠️ LE PÉRIMÈTRE EST LA SÉANCE, ET RIEN QU'ELLE. Une série d'une AUTRE
  // séance n'est jamais candidate : elle n'est pas dans `lignes(seance)` par
  // construction, et la confondre viderait le cache de tout le reste.
  function idsRetires(seriesEnCache, seance) {
    if (!seance) return [];
    var gardes = {};
    lignes(seance).forEach(function (l) { gardes[l.id] = true; });
    return (seriesEnCache || []).filter(function (s) {
      return s && s.session_id === seance.id && !gardes[s.id];
    }).map(function (s) { return s.id; });
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
          repos_s: p.serie.repos_s,
          // §9.20 — la marque de l'OCCURRENCE, sur chacune de ses séries (déjà
          // validées et à venir) : une donnée de la série, la charge et les reps
          // ne changent pas. Toujours envoyée : `false` efface une marque.
          douleur: occurrenceDouloureuse(p.exo),
          occurrence: uuidDOccurrence(p.exo.occurrence)
        };
      });
  }

  // §9.20 (51-3) — L'OCCURRENCE EST-ELLE MARQUÉE « DOULEUR » ? La marque est
  // posée sur l'occurrence (`marquerDouleur`) ; une occurrence relue depuis la
  // base la tient de ses séries. La seule lecture de la marque en séance : le
  // plan (I33), l'envoi et l'écran passent par elle.
  function occurrenceDouloureuse(exo) {
    if (!exo) return false;
    if (exo.douleur === true) return true;
    return (exo.series || []).some(function (s) { return !!s && s.douleur === true; });
  }

  // « J'ai mal » (§9.20) : l'occurrence `iExo` porte la marque, pour la séance.
  // Ses séries déjà validées la reçoivent aussi (elles repartent en base par la
  // file, comme une série corrigée) ; leurs charges et leurs reps ne changent pas.
  function marquerDouleur(seance, iExo) {
    var exos = (seance.exercices || []).slice();
    var exo = exos[iExo];
    if (!exo || exo.douleur === true) return seance;
    exos[iExo] = Object.assign({}, exo, { douleur: true,
      series: (exo.series || []).map(function (sr) { return Object.assign({}, sr, { douleur: true }); }) });
    return avecExercices(seance, exos);
  }

  // La carte de reprise (§9.20) : le choix fait dans CETTE séance, par
  // exercice — « avant », ou « leger » avec le repli figé au choix. Il vit dans
  // le brouillon (la séance n'a pas de colonne pour lui) ; « Sans coach cette
  // fois » n'est pas un choix rangé ici : c'est la marque (`marquerDouleur`).
  function choisirReprise(seance, slug, choix) {
    var r = {};
    Object.keys(seance.reprises || {}).forEach(function (k) { r[k] = seance.reprises[k]; });
    r[slug] = choix;
    return Object.assign({}, seance, { reprises: r });
  }

  // L'identifiant d'occurrence de l'app est `o-<uuid>` (l'identifiant de sa
  // première série) ; la colonne `sets.occurrence` est un uuid. On écrit le
  // uuid, et NULL pour une occurrence qui n'en porte pas (un exercice posé sans
  // série) : la relecture retombe alors sur le regroupement par voisinage.
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function uuidDOccurrence(occurrence) {
    var o = typeof occurrence === 'string' ? occurrence.replace(/^o-/, '') : '';
    return UUID.test(o) ? o : null;
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
      salle: null, routine_id: null, statut: EN_COURS, source: 'hevy', source_ref: 'hevy:sonde',
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
      // ⚠️ 69 — LA PROVENANCE D'UNE SÉANCE NE SE RÉÉCRIT PAS, comme celle de ses
      // séries (`lignes`). Elle était écrite `'app'` en dur : une séance Hevy
      // retouchée en Édition passait en `app` (les 3 séances d'août en `app`
      // avec une référence `hevy:`), et une séance importée serait partie en
      // `app`.
      source: seance.source || 'app',
      // La référence d'import (`hevy:<id>`), qu'une correction recopie telle
      // quelle (`reprendre`). Toujours envoyée, comme les autres colonnes.
      // ⚠️ Fenêtre connue : une ligne d'un cache écrit AVANT cette version ne
      // la porte pas ; corrigée hors ligne avant la première synchronisation
      // (qui relit `sessions` en entier), elle l'écrirait à null. L'anti-doublon
      // reconnaît encore la séance à la minute de son début.
      source_ref: seance.source_ref === undefined ? null : seance.source_ref,
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
  // ══ CE QU'ON VIENT DE TAPER — PAR TYPE, ET SEULEMENT SI ÇA DÉVIE ═════════
  //
  // ⚠️ DÉFAUT CONSTATÉ SUR DEVICE LE 17/09, APRÈS LE CHANTIER 45 : valider une
  // CHAUFFE à 20 kg propageait 20 kg en fantôme sur toutes les séries
  // suivantes, séries de travail comprises — qui étaient pourtant déjà
  // pré-remplies avec la bonne charge.
  //
  // ⚠️ TROISIÈME FOIS QUE LE MÊME DÉFAUT REVIENT. Le chantier 38 a posé la
  // règle « par type » sur le niveau 2 de la cascade (`correspondant`), le
  // chantier 39 l'a étendue à la colonne « précédent » de `rendu.js`. Le
  // niveau 1 ne l'avait JAMAIS reçue : il remontait la dernière valeur saisie
  // quel que soit son type. Une règle appliquée à un endroit sur deux finit
  // toujours par se rappeler à nous — c'est le §2 undecies.
  //
  //   Ce qui est tapé sur une chauffe propage aux CHAUFFES.
  //   Ce qui est tapé sur une série de travail propage au TRAVAIL.
  //
  // ── ET UNE SECONDE RÈGLE, MESURÉE ───────────────────────────────────────
  //
  // 54 % des séance-exercices d'aurel_br portent une charge qui VARIE entre
  // les séries (2 021 sur 3 730) — typiquement `122,5 · 122,5 · 125`. Valider
  // la première série écrasait donc la mémoire par rang plus d'une fois sur
  // deux : la 3ᵉ ligne proposait 122,5 au lieu de 125, et l'utilisateur qui
  // « valide sans rien taper quand c'est juste » (§3 bis.3) perdait sa montée.
  //
  //   `derniereSaisie` ne prime que lorsqu'elle DIFFÈRE de ce que la séance
  //   précédente portait au MÊME RANG. Retaper ce qui était déjà proposé n'est
  //   pas une déviation : il n'y a rien à propager.
  //
  // ⚠️ ON NE DÉCALE PAS LA RAMPE de l'écart constaté (130 → 130 → 132,5) :
  // écarté explicitement au chantier 46. Reporter un écart sur des séries
  // qu'on n'a pas faites est une PRESCRIPTION, donc le territoire du moteur.
  // Ici, tout reste factuel — 130 tapé propage 130, à plat.
  //
  // ⚠️ SANS SÉANCE PRÉCÉDENTE, tout ce qu'on tape dévie : il n'y a rien à quoi
  // être égal. Le premier jour sur un exercice, la propagation est donc pleine
  // — c'est le seul fait dont on dispose.
  function memeValeur(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    var na = Number(a), nb = Number(b);
    if (isFinite(na) && isFinite(nb)) return na === nb;
    return a === b;
  }

  // ⚠️ CE QUE LA LIGNE PROPOSAIT (§7 unvicies, précisé le 19/09/2026) : le
  // plan du moteur là où il couvre la ligne, la dernière séance ailleurs. C'est
  // la RÉFÉRENCE de la déviation, et rien d'autre. Sans elle, valider 125 sur
  // la 1re série quand la dernière séance y portait 122,5 « déviait », donc
  // propageait 125 sur la ligne du test — qui perdait ses 130.
  //
  // Une charge NULLE dans le plan (« le cran au-dessus ») ne propose rien :
  // la référence retombe sur la dernière séance, comme pour un champ que le
  // plan ne porte pas (durée, distance).
  function proposition(liste, k, champ, prec, plan) {
    var p = plan && plan[k];
    if (p && p[champ] !== null && p[champ] !== undefined) return p[champ];
    var ref = correspondant(liste, k, prec);
    return ref && ref[champ] !== undefined ? ref[champ] : null;
  }

  // Remonte la dernière valeur saisie pour CE champ, sur CET exercice, dans
  // CETTE séance — sur une série du MÊME TYPE, et seulement si elle dévie.
  function derniereSaisie(exo, iSerie, champ, prec, plan) {
    var liste = (exo && exo.series) || [];
    var type = typeDe(liste[iSerie]);
    for (var k = iSerie - 1; k >= 0; k--) {
      if (!liste[k] || typeDe(liste[k]) !== type) continue;
      var v = liste[k][champ];
      if (v === null || v === undefined) continue;
      // ⚠️ LA COMPARAISON SE FAIT AU RANG DE LA SÉRIE SOURCE, pas à celui de
      // la série qu'on remplit : la question est « ce qui a été tapé là
      // dévie-t-il ? », et `proposition` répond déjà, par type, pour n'importe
      // quel rang. Une seule règle d'alignement dans tout le fichier.
      var ref = proposition(liste, k, champ, prec, plan);
      if (ref !== null && memeValeur(ref, v)) return null;
      if (champ === 'charge_kg' && plan && accepteLaProposition(plan[k], v)) return null;
      return v;
    }
    return null;
  }

  // ⚠️ LE FANTÔME S'ALIGNE PAR TYPE, JAMAIS PAR POSITION (chantier 38, D9).
  //
  // Il lisait `prec.series[iSerie]` — la série de MÊME INDICE la fois
  // précédente, chauffes comprises. Séance d'avant `40(W) · 70(W) · 120 · 120 ·
  // 120`, séance d'aujourd'hui sans chauffe : le fantôme de la PREMIÈRE SÉRIE
  // DE TRAVAIL valait 40 kg. Et comme le §3 bis.3 vend explicitement « valider
  // sans rien taper quand c'est juste », l'utilisateur faisait exactement ce que
  // l'app lui proposait — et écrivait une charge d'échauffement comme charge de
  // travail, qui nourrit ensuite le palier et le volume.
  //
  // Mesuré en base le 15/09 sur 7 458 enchaînements d'un même exercice d'une
  // séance à la suivante : 197 ont MOINS d'échauffements que la fois d'avant,
  // dont 128 aucun du tout. 2,6 % — pas un cas de bord : ça arrive chaque fois
  // qu'on s'échauffe moins parce qu'on a déjà travaillé le même muscle avant.
  //
  // ⚠️ AVEC LE MÊME NOMBRE DE CHAUFFES DES DEUX CÔTÉS, aligner par indice et
  // aligner par type donnent EXACTEMENT le même fantôme. C'est le seul cas
  // qu'on teste spontanément, et c'est ce qui a laissé passer le défaut.
  //
  // La règle : la Nᵉ série d'un type s'aligne sur la Nᵉ série du MÊME type. Elle
  // vaut pour les quatre — une dégressive ne propose pas une charge de travail,
  // et une série d'échec ne propose pas une dégressive.
  // La série de travail et le type par défaut : UNE définition, dans
  // `THModele` (PR 6 de la consolidation). Lue à l'appel.
  function typeDe(serie) { return racine.THModele.typeDe(serie); }
  function estTravail(serie) { return racine.THModele.estTravail(serie); }

  // ── « L'EXERCICE EST FINI » : UNE SEULE DÉFINITION (relevé du 01/10/2026, PR 2) ──
  //
  // Toutes les séries de TRAVAIL de l'exercice, dans toute la séance (un
  // exercice présent deux fois compte ses deux occurrences), sont en base. Le
  // plan la lit pour ouvrir le constat ; l'app, pour calculer la suite et pour
  // l'afficher. Elles le décidaient chacune de leur côté : le plan sur les
  // lignes qu'il couvre, l'app sur toutes les séries de travail — d'accord
  // seulement parce que les deux conditions s'ajoutaient. Pure.
  function exerciceFini(seance, slug) {
    var travail = [];
    ((seance && seance.exercices) || []).forEach(function (exo) {
      if (!exo || exo.exercise_slug !== slug) return;
      (exo.series || []).forEach(function (s) { if (estTravail(s)) travail.push(s); });
    });
    return travail.length > 0 && travail.every(function (s) { return partEnBase(s); });
  }

  // §3.9 (48b-6b-2) — LE BLOC : un superset est UN bloc, et son constat attend
  // la fin du bloc. Le bloc, c'est `groupe_superset` : deux exercices le
  // partagent, ou chacun est seul. ⚠️ `null` NE GROUPE PAS — deux exercices
  // hors superset ont tous deux `null` et ne forment pas un bloc à eux deux.
  function slugsDuBloc(seance, slug) {
    var exos = (seance && seance.exercices) || [];
    var groupe, trouve = false;
    exos.forEach(function (exo) {
      if (!exo || exo.exercise_slug !== slug) return;
      groupe = exo.groupe_superset === undefined ? null : exo.groupe_superset;
      trouve = true;
    });
    if (!trouve) return [];
    if (groupe === null) return [slug];
    var sortie = [];
    exos.forEach(function (exo) {
      if (!exo || exo.groupe_superset !== groupe) return;
      if (sortie.indexOf(exo.exercise_slug) < 0) sortie.push(exo.exercise_slug);
    });
    return sortie;
  }

  // Le bloc est fini quand CHACUN de ses exercices l'est — la même définition.
  function blocFini(seance, slug) {
    var liste = slugsDuBloc(seance, slug);
    return liste.length > 0 && liste.every(function (s) { return exerciceFini(seance, s); });
  }

  // ⚠️ ELLE PREND LA LISTE DES SÉRIES, PAS L'EXERCICE (chantier 39). Deux
  // appelants la partagent désormais : `fantome`, qui a le modèle, et la colonne
  // « précédent » de `rendu.js`, qui n'a que le bloc d'affichage. Une seule règle,
  // un seul code — c'est ce qui garantit que les deux ne se contrediront plus.
  function correspondant(series, iSerie, prec) {
    if (!prec || !prec.series) return null;
    var liste = series || [];
    var type = typeDe(liste[iSerie]);

    // Le rang de cette série DANS SON TYPE, aujourd'hui.
    var rang = 0;
    for (var k = 0; k < iSerie; k++) {
      if (typeDe(liste[k]) === type) rang++;
    }

    // La série de même rang, dans le même type, la fois précédente.
    var vus = 0;
    for (var j = 0; j < prec.series.length; j++) {
      if (typeDe(prec.series[j]) !== type) continue;
      if (vus === rang) return prec.series[j];
      vus++;
    }
    // ⚠️ PAS DE CORRESPONDANT, PAS DE FANTÔME. Les trois cas — plus de séries
    // qu'avant, aucune série de ce type la fois d'avant, première fois sur
    // l'exercice — se répondent d'une seule règle. Reporter la dernière valeur
    // connue serait une PRÉDICTION, et c'est exactement ce qui a créé ce défaut :
    // une valeur qu'on n'a pas mesurée, proposée comme si on l'avait mesurée.
    // Rien n'est prédit ici ; le moteur parlera au chantier 5.
    return null;
  }

  // ── §7 septendecies.3 — LE PLAN : ce que le moteur propose, série par série ──
  //
  // Un tableau aligné sur `exo.series` : `null` là où le moteur ne dit rien,
  // `{ charge_kg, reps }` là où il couvre.
  //
  // ⚠️ LE PLAN VIT À CÔTÉ DE LA SÉANCE, JAMAIS DEDANS. Il se dérive à chaque
  // rendu depuis la consigne (mémoïsée dans `app.js`) et la liste actuelle
  // des séries ; il ne devient JAMAIS une propriété d'une série — ni en
  // mémoire, ni dans IndexedDB, ni dans la file. `COLONNES_SET` ne change pas.
  // Une intention n'est pas une observation.
  //
  // Une charge NULLE (« le cran au-dessus ») reste nulle dans le plan : la
  // charge retombe au rang suivant de la cascade, les reps restent proposées.
  //
  // ══ §9.13 (49-C, 26/09/2026) — LA SÉANCE EN COURS FAIT FOI ═══════════════
  //
  // La consigne couvre TOUTES les séries de travail de la séance, telles
  // qu'elles sont à chaque instant — celles de la routine, celles qu'on ajoute
  // ou retire, celles de « + Série ». `n` n'est plus qu'une proposition de
  // départ (`THPlan.seriesDeDepart`). L'alignement « sur les n dernières » du 19/09
  // laissait une série de la routine hors consigne quand la routine en
  // comptait plus que la dernière séance (constaté sur l'appareil le 26/09 :
  // aucune réaction même à 20 reps), écrivait un pari pour une série
  // inexistante quand elle en comptait moins, et faisait glisser les paris à
  // chaque ajout ou retrait.
  //
  // Trois règles, et leur ordre compte :
  //   1. UNE SÉRIE VALIDÉE EST FIGÉE. Son rang et sa ligne (ligne, test,
  //      proposition du coach, retour) sont ceux qu'elle affichait à sa
  //      validation — relus dans SON pari (`figeesDe`), donc identiques après
  //      un rechargement de l'app.
  //   2. PARMI LES AUTRES, les `k` dernières reçoivent `haut`, moins les
  //      tests déjà faits : ajouter une série non validée déplace le test sur
  //      la nouvelle dernière ; une série ajoutée APRÈS le test fait reçoit la
  //      ligne. Retirer une série non validée ne touche à rien de ce qui est fait.
  //   3. LE RANG d'une série non figée est le plus petit entier libre à partir
  //      de sa position : jamais celui d'une série figée, même après le retrait
  //      d'une série faite plus haut. C'est le rang que portera son pari.
  //
  // Une montée en charge se déclare en échauffement (§9.13) : une série plus
  // légère notée en travail reçoit la consigne comme les autres.
  //
  // Rend, pour chaque série : `null`, ou `{ position, rang, role, charge_kg,
  // reps, figee }` — `position` est son index dans le plan de la réaction
  // (les séries couvertes, dans l'ordre), `figee` la ligne figée ou `null`.
  var ROLES_FIGES = { ligne: true, haut: true, coach: true, retour: true, elan: true };

  function couvertureSeance(series, consigne, figees) {
    var liste = series || [];
    var sortie = liste.map(function () { return null; });
    if (!consigne || !consigne.n) return sortie;
    var gel = figees || {};
    var travail = [];
    liste.forEach(function (s, i) { if (estTravail(s)) travail.push(i); });
    var figeeDe = function (i) {
      var s = liste[i];
      return s && s.id && partEnBase(s) && gel[s.id] ? gel[s.id] : null;
    };
    var k = consigne.haut ? (Number(consigne.haut.k) || 0) : 0;
    var couvre = typeof consigne.couvre === 'number' && consigne.couvre >= 1 ? consigne.couvre : null;
    var testsFaits = travail.filter(function (i) {
      var f = figeeDe(i);
      return !!f && f.role === 'haut';
    }).length;
    var libres = travail.filter(function (i) { return !figeeDe(i); });
    var reste = Math.max(0, k - testsFaits);
    var roles = {};
    // §14.7 (49-U17) — LA SÉRIE DE PLUS : la routine compte `routine` séries ;
    // les séries de travail AU-DELÀ (la ligne en plus, et ce qu'on ajoute
    // ensuite) suivent les lignes de la routine, à la charge et à la visée de
    // la ligne, JAMAIS un test (I24). Le test reste sur la routine.
    var plus = consigne.serieDePlus && typeof consigne.serieDePlus.routine === 'number'
      ? consigne.serieDePlus.routine : null;
    var ajoutee = function (i) { return plus !== null && travail.indexOf(i) >= plus; };
    var libresRoutine = libres.filter(function (i) { return !ajoutee(i); });
    libres.forEach(function (i) { roles[i] = 'ligne'; });
    libresRoutine.forEach(function (i, j) { roles[i] = j >= libresRoutine.length - reste ? 'haut' : 'ligne'; });

    // Les rangs figés d'abord : aucun rang libre ne peut les reprendre.
    var pris = {};
    travail.forEach(function (i) { var f = figeeDe(i); if (f) pris[f.rang] = true; });
    var position = 0;
    travail.forEach(function (i) {
      var f = figeeDe(i);
      var role = f ? f.role : roles[i];
      var ligne = f ? f.ligne : null;
      var source = role === 'haut' ? consigne.haut : consigne.ligne;
      // §9.13 (49-U18, 01/10/2026) — UNE LIGNE DE TRAVAIL QUE LA CONSIGNE NE
      // COUVRE PAS PREND LA CHARGE DU COACH, JAMAIS UNE VALEUR D'UNE ANCIENNE
      // SÉANCE : sans ligne basse (« rejoint », « tout passe »), la ligne prend
      // la charge et la visée de la ligne haute, sans en être un test ; sans
      // ligne haute, l'inverse. Laissée hors plan, elle reprenait la 1re série
      // de la séance d'avant (le couché du 01/10 à 88 kg, le hip thrust du
      // 30/09 à 52,7), sans pari. La ligne en plus de la série de plus en est
      // un cas (§14.7).
      if (!f && !source) source = role === 'haut' ? consigne.ligne : consigne.haut;
      // Une consigne sans aucune ligne ne couvre pas cette série : on
      // n'invente pas une valeur pour remplir un rang.
      if (!f && !source) return;
      // §14.4 (49-U14) — LA SEMAINE ALLÉGÉE ne couvre que les premières séries
      // (`couvre` : 60 % de la routine) ; les autres ne sont pas proposées.
      if (!f && couvre !== null && position >= couvre) return;
      var rang;
      if (f) {
        rang = f.rang;
      } else {
        rang = position + 1;
        while (pris[rang]) rang++;
        pris[rang] = true;
      }
      var charge = f ? ligne.charge : source.charge;
      var vise = f ? ligne.vise : source.vise;
      sortie[i] = {
        position: position,
        rang: rang,
        role: role,
        charge_kg: charge === null || charge === undefined ? null : charge,
        reps: vise === null || vise === undefined ? null : vise,
        figee: f ? ligne : null,
        ajoutee: ajoutee(i)
      };
      position++;
    });
    return sortie;
  }

  // La même couverture, réduite à ce que lisent le fantôme et les tests d'avant
  // 49-C : le rang, la charge, les reps.
  function couvertureDe(series, consigne, figees) {
    return couvertureSeance(series, consigne, figees).map(function (c) {
      return c ? { rang: c.rang, charge_kg: c.charge_kg, reps: c.reps } : null;
    });
  }

  // ⚠️ LES LIGNES FIGÉES SE RELISENT DANS LES PARIS (§9.11, 49-C). Chaque
  // série couverte écrit son pari à sa validation, avec ce que sa ligne
  // affichait : c'est la seule mémoire qui survit à un rechargement — elle est
  // dans IndexedDB et en base, pas dans la mémoire de la page. Une série
  // validée est figée par le pari qui la désigne (`set_observe`).
  //
  // `paris` : ceux de CETTE séance et de CET exercice. Plusieurs paris sur une
  // même série (une séance ouverte avant 49-C : le pari de l'ouverture et celui
  // du coach) : la plus haute révision dit ce que la ligne affichait.
  //
  // Un pari d'avant 49-C ne porte pas `role` : on le relit par l'ancienne
  // règle, celle qui l'avait écrit — les `k` derniers rangs au haut.
  // ── L'OCCURRENCE COACHÉE ET LES PARIS D'UNE OCCURRENCE ──────────────────
  //
  // Le coach suit UNE occurrence d'un exercice dans la séance ; les autres sont
  // libres — ni ligne du coach, ni pari, ni message —, leurs séries comptent
  // comme d'habitude pour le volume et l'historique. Laquelle : la PREMIÈRE
  // dans l'ordre de la séance, tant qu'aucune n'a de pari ; dès qu'une
  // occurrence porte des paris de la séance, c'est ELLE, où qu'elle soit. Sans
  // cette seconde moitié, poser le même exercice au-dessus de celui qu'on
  // vient de commencer (ou l'y déplacer) passait le coach à l'autre : ses
  // lignes figées se défigeaient (I4) et ses paris observés restaient sans
  // ligne (I7). Rend l'indice, ou -1.
  function occurrenceCoachee(seance, slug, paris) {
    var exos = (seance && seance.exercices) || [];
    var premiere = -1;
    for (var i = 0; i < exos.length; i++) {
      if (!exos[i] || exos[i].exercise_slug !== slug) continue;
      if (premiere < 0) premiere = i;
      if (parisDeLOccurrence(paris, seance, i).length) return i;
    }
    return premiere;
  }

  // La première dans l'ordre : celle à qui revient un pari d'avant la règle.
  function premiereOccurrence(exercices, slug) {
    var exos = exercices || [];
    for (var i = 0; i < exos.length; i++) if (exos[i] && exos[i].exercise_slug === slug) return i;
    return -1;
  }

  // Les paris de l'occurrence `iExo`, parmi ceux de la séance. Un pari porte
  // l'occurrence qui l'a écrit (`fondement.occurrence`) :
  //   · connue de la séance → il est à elle, et à elle seule ;
  //   · inconnue (séance reprise depuis la base : ses occurrences ont un
  //     identifiant neuf) ou absente (pari écrit avant cette règle) → la série
  //     qu'il observe dit à qui il est ;
  //   · sans série observée : un pari d'avant la règle appartient à la
  //     première occurrence (il n'y en avait qu'une à coacher) ; un pari d'une
  //     occurrence qui n'est plus dans la séance n'appartient à personne — il
  //     ne doit pas figer les lignes d'une autre.
  function parisDeLOccurrence(paris, seance, iExo) {
    var exos = (seance && seance.exercices) || [];
    var exo = exos[iExo];
    if (!exo) return [];
    var slug = exo.exercise_slug;
    var connues = {}, serieA = {};
    exos.forEach(function (e, k) {
      if (!e) return;
      if (e.occurrence) connues[e.occurrence] = true;
      (e.series || []).forEach(function (s) { if (s && s.id) serieA[s.id] = k; });
    });
    var premiere = premiereOccurrence(exos, slug);
    return (paris || []).filter(function (l) {
      if (!l || l.exercise_slug !== slug || !l.fondement || l.fondement.seance !== seance.id) return false;
      var o = l.fondement.occurrence;
      if (o && connues[o]) return o === exo.occurrence;
      if (l.set_observe && Object.prototype.hasOwnProperty.call(serieA, l.set_observe)) return serieA[l.set_observe] === iExo;
      return !o && iExo === premiere;
    });
  }

  function figeesDe(paris, series, consigne) {
    var parSerie = {};
    (paris || []).forEach(function (l) {
      if (!l || !l.set_observe || !l.fondement) return;
      var avant = parSerie[l.set_observe];
      var rev = Number(l.fondement.revision) || 0;
      if (!avant || rev > (Number(avant.fondement.revision) || 0)) parSerie[l.set_observe] = l;
    });
    var sortie = {};
    (series || []).forEach(function (s) {
      if (!s || !s.id || !partEnBase(s) || !parSerie[s.id]) return;
      var l = parSerie[s.id];
      var f = l.fondement;
      var rang = Number(f.rang);
      if (!isFinite(rang) || rang < 1) return;
      var rev = Number(f.revision) || 0;
      var role = ROLES_FIGES[f.role] === true ? f.role : null;
      if (role === null) {
        if (rev >= 1) {
          role = 'coach';
        } else {
          var n = consigne ? Number(consigne.n) || 0 : 0;
          var k = consigne && consigne.haut ? Number(consigne.haut.k) || 0 : 0;
          role = rang > n - k ? 'haut' : 'ligne';
        }
      }
      var charge = f.charge === undefined ? null : f.charge;
      var bornes = l.borne_basse !== null && l.borne_basse !== undefined &&
        l.borne_haute !== null && l.borne_haute !== undefined ? [l.borne_basse, l.borne_haute] : null;
      sortie[s.id] = {
        rang: rang,
        role: role,
        ligne: {
          charge: charge,
          vise: l.valeur_predite === undefined ? null : l.valeur_predite,
          // §9.14 bis (68A) — une ligne d'élan se fige comme une ligne du coach :
          // sa charge, la fourchette de la zone, sa source.
          zone: role === 'coach' || role === 'elan' ? bornes : null,
          // §9.14 ter (68B) — une ligne « à fond » se fige avec sa source, son
          // rôle gardé (`ligne`, `haut`, `retour`) : elle n'est plus la consigne.
          source: f.source === 'a_fond' && role !== 'coach' && role !== 'elan' ? 'a_fond'
            : (role === 'coach' || role === 'elan' || role === 'retour' ? role : 'consigne'),
          sourceAvant: f.source === 'a_fond' && role !== 'coach' && role !== 'elan'
            ? (role === 'retour' ? 'retour' : 'consigne') : undefined,
          charges: role === 'coach'
            ? (Array.isArray(f.charges) && f.charges.length ? f.charges.slice() : [charge]) : null,
          sourceHaut: role === 'coach' && f.source !== undefined ? f.source : null
        }
      };
    });
    return sortie;
  }

  // §9.13 (49-C) — le nombre de séries proposé au départ, hors routine, vit
  // désormais dans le plan (`THPlan.seriesDeDepart`, 49-U6) : il lit la consigne.

  // ══ §9.11 (49-8) — UNE OBSERVATION NE CHANGE JAMAIS DE SÉRIE ═════════════
  //
  // `couvertureDe` recalcule les rangs sur la liste ACTUELLE, alignée par la
  // fin : une série ajoutée (« + Série ») ou supprimée plus haut les fait
  // glisser. Sans garde, la série qui prend un rang remplaçait l'observation
  // déjà faite par une autre — un test tenu devenait « autre chose tenté »,
  // ou un test raté (diagnostic du 26/09/2026). La table qui doit dire si le
  // moteur a eu raison gardait un fait faux.
  //
  // Deux règles, et le rang n'est toujours pas figé (§9.13, piste 2, à
  // trancher avant l'escalier isolé) :
  //   · une ligne observée reste sur SA série tant que celle-ci existe et
  //     reste en base — corriger ou dévalider LA MÊME série refait le calcul ;
  //   · une série n'observe qu'UN rang : déjà reliée à un pari d'un autre
  //     rang, elle ne s'attache pas au rang qu'elle vient de prendre.
  // Mieux vaut un pari non observé qu'un pari faux.
  function observationTenue(setObserve, series) {
    if (!setObserve) return false;
    return (series || []).some(function (s) {
      return !!s && s.id === setObserve && partEnBase(s);
    });
  }

  function peutObserver(ligne, serie, series) {
    var sienne = ligne && ligne.set_observe;
    if (!sienne || (serie && sienne === serie.id)) return true;
    return !observationTenue(sienne, series);
  }

  // Les paris qu'une série doit (re)lire : les siens d'abord, quel que soit
  // leur rang aujourd'hui ; puis ceux du rang qu'elle porte, si elle n'en sert
  // pas déjà un autre et si leur observation n'appartient pas à une autre
  // série encore en base. `rang` vaut null quand la série n'est plus couverte.
  function parisAObserver(paris, serie, rang, series) {
    var id = serie && serie.id;
    var liste = (paris || []).filter(function (l) { return l && l.fondement; });
    var siens = id ? liste.filter(function (l) { return l.set_observe === id; }) : [];
    var ailleurs = siens.some(function (l) { return l.fondement.rang !== rang; });
    if (rang === null || rang === undefined || ailleurs) return siens;
    return siens.concat(liste.filter(function (l) {
      return l.fondement.rang === rang && siens.indexOf(l) < 0 && peutObserver(l, serie, series);
    }));
  }

  // §9.11 (27/09/2026) — LE RATTRAPAGE À « TERMINER » : les paris de CETTE
  // séance dont la copie locale porte une observation (`set_observe`) sur une
  // série qui y est encore validée. Ils seront renvoyés, tels quels — l'envoi
  // est idempotent. Pur : les paris et la séance en entrée, une liste en sortie
  // (les lignes elles-mêmes), rien d'autre.
  function observationsARenvoyer(paris, seance) {
    if (!seance || !seance.id) return [];
    var enBase = {};
    (seance.exercices || []).forEach(function (exo) {
      ((exo && exo.series) || []).forEach(function (s) {
        if (s && s.id && partEnBase(s)) enBase[s.id] = true;
      });
    });
    return (paris || []).filter(function (l) {
      return !!l && !!l.id && !!l.fondement && l.fondement.seance === seance.id &&
        !!l.set_observe && enBase[l.set_observe] === true;
    });
  }

  // §9.14 (49-R2) — LE PLAN COURANT, quand la réaction est branchée. `reaction`
  // est `reactionPour(...).plan` : une ligne par série couverte, dans l'ordre,
  // validées comprises (49-C : par POSITION, plus par rang). La couverture dit
  // QUELLE série est à quelle position ; la réaction dit ce que cette position
  // propose MAINTENANT. `figees` : les lignes figées (`figeesDe`).
  //
  // ⚠️ LA LIGNE PROPOSÉE N'A PAS DE FANTÔME DE REPS (ECRAN §3.2, 25/09/2026).
  // `reps: null`, `proposee: true` et la fourchette pour l'indication : valider
  // à vide enregistrerait le bas de la zone, la montée « tiendrait » toujours
  // et le pari serait jugé exact d'office.
  function planDe(series, consigne, reaction, figees) {
    var palier = consigne && consigne.ligne && consigne.ligne.charge !== null &&
      consigne.ligne.charge !== undefined ? consigne.ligne.charge
      : (consigne ? consigne.palier : null);
    return couvertureSeance(series, consigne, figees).map(function (c) {
      if (!c) return null;
      var p = reaction && reaction[c.position];
      if (!p) return { charge_kg: c.charge_kg, reps: c.reps };
      if (p.source === 'coach') {
        return { charge_kg: p.charge === undefined ? null : p.charge, reps: null,
                 proposee: true, fourchette: p.zone ? p.zone.slice() : null,
                 palier: palier === undefined ? null : palier };
      }
      // §9.14 bis (68A) — une ligne d'élan : la charge, les reps à taper.
      if (p.source === 'elan') {
        return { charge_kg: p.charge === undefined ? null : p.charge, reps: null,
                 fourchette: p.zone ? p.zone.slice() : null };
      }
      return { charge_kg: p.charge === undefined ? null : p.charge,
               reps: p.vise === undefined ? null : p.vise };
    });
  }

  // §9.14 (P3, P10) — une charge tapée sur la ligne proposée, ÉGALE OU
  // SUPÉRIEURE à la charge proposée (au-dessus du palier quand le cran n'a pas
  // de chiffre), est une ACCEPTATION : la réaction fixe la suite, le rang 1 ne
  // la propage pas. Inférieure, c'est un refus, et elle se propage comme
  // n'importe quelle déviation.
  function accepteLaProposition(p, v) {
    var n = Number(v);
    if (!p || !p.proposee || v === null || v === undefined || !isFinite(n)) return false;
    if (p.charge_kg !== null && p.charge_kg !== undefined) return n >= Number(p.charge_kg);
    return p.palier !== null && p.palier !== undefined && n > Number(p.palier);
  }

  // ECRAN §3 bis.3 bis (prompts 100 puis 105, 15/10/2026) — AUCUNE SÉRIE NE SE
  // VALIDE AVEC UNE CASE OBLIGATOIRE VIDE. Une seule règle pour toutes les
  // cases : au ✓, chaque case du gabarit (charge, reps, durée, distance, selon
  // la mesure) vaut ce qui est tapé, sinon le chiffre gris du coach (le
  // fantôme) ; ni l'un ni l'autre, elle MANQUE et la série ne se valide pas.
  // Rend les cases manquantes, dans l'ordre de la ligne (`g.champs`) — la
  // première est celle où le clavier s'ouvre ; `[]` : rien ne manque.
  // Tous types de série (une chauffe ou une dégressive attend aussi ses
  // chiffres). Exemptés : le lest et l'aide (vide = sans lest, sans aide — la
  // case de charge seule ; les reps restent dues), et le gabarit inconnu (on ne
  // sait pas ce que l'exercice mesure : on n'empêche rien).
  function casesManquantes(g, serie, f) {
    if (!g || g.inconnue || !g.champs) return [];
    var vide = function (v) { return v === null || v === undefined || v === '' || !isFinite(Number(v)); };
    return g.champs.filter(function (nom) {
      if (nom === 'charge_kg' && g.nature) return false;
      var c = racine.THModele.champDeMesure(nom);
      var cle = c ? c.cle : nom;
      return vide(serie && serie[cle]) && vide(f && f[cle]);
    });
  }

  function fantome(seance, iExo, iSerie, prec, plan) {
    var exo = seance.exercices[iExo];
    var ligne = correspondant(exo.series, iSerie, prec);

    var propre = exo.series[iSerie];
    var propose = (plan && plan[iSerie]) || null;

    // ⚠️ LE FANTÔME EST UNE CASCADE À QUATRE NIVEAUX (§7 septendecies.3), et
    // l'ordre est la décision :
    //
    //   1. ce qu'on vient de taper dans la séance — MÊME TYPE, et seulement
    //      si ça DÉVIE de ce que la ligne proposait (chantier 46, puis 48b)
    //   2. LE PLAN du moteur, là où il couvre la ligne (48b-5b-2)
    //   3. la dernière séance, même type, même rang (chantier 38)
    //   4. `charge_cible_kg` — la charge de départ, sur un exercice JAMAIS FAIT
    //      seulement (§7 quindecies.3, chantier 52)
    //
    // Le moteur se place AU-DESSUS de la dernière séance et EN DESSOUS de la
    // saisie : ce qu'on vient de taper reste souverain — « ta saisie fait
    // foi » —, mais entre une proposition et un souvenir, c'est la proposition
    // qui parle. La colonne « précédent », elle, ne lit toujours que le passé.
    var charge = derniereSaisie(exo, iSerie, 'charge_kg', prec, plan);
    if (charge === null && propose && propose.charge_kg !== null) charge = propose.charge_kg;
    // §9.15.3 (49-U18, 01/10/2026) — UNE DÉGRESSIVE NE REPREND JAMAIS LA
    // CHARGE D'UNE ANCIENNE SÉANCE : sa charge vient du coach (`THPlan`), et
    // à la barre il la laisse vide (« Pas de dégressive à la barre »). Le
    // curl EZ du 01/10 reprenait les 15 kg de la fois d'avant là où le plan ne
    // plaçait pas la dégressive.
    if (charge === null && ligne && typeDe(propre) !== 'degressive') charge = ligne.charge_kg;
    // §7 quindecies.3 (52-1) — « jamais fait » : aucune séance de l'historique
    // ne porte cet exercice (`prec` nul). Déjà fait, la charge de départ se tait,
    // même sans séance au même rang : c'est le coach qui décide.
    if ((charge === null || charge === undefined) && propre && !prec) {
      charge = propre.charge_cible_kg;
    }

    // ⚠️ LES REPS SUIVENT LE MÊME ORDRE : le plan d'abord (48b-5b-2, tranché
    // le 20/09/2026), puis l'INTENTION DE **CETTE** LIGNE (ch. 43), puis la
    // fois d'avant. « Vise 5 » en jaune et un fantôme à 8 sur la même ligne
    // seraient deux voix ; `reps_visees` est le pendant de `charge_cible_kg`,
    // une intention de routine qui parle quand le moteur se tait.
    var reps = propose ? propose.reps : null;
    // La ligne proposée : AUCUN repli, ni la routine ni la fois d'avant — ses
    // reps se tapent (§9.14, ECRAN §3.2).
    var aTaper = !!(propose && propose.proposee);
    if (!aTaper && (reps === null || reps === undefined) && propre) reps = propre.reps_visees;
    if (!aTaper && (reps === null || reps === undefined) && ligne) reps = ligne.reps;

    // La durée et la distance suivent les reps (ECRAN-SAISIE §7 septendecies.3,
    // 54-1) : ce qu'on vient de taper dans la séance, puis LA ROUTINE
    // (`duree_cible_s`, `distance_cible_m`, descendues par
    // `exerciceDepuisRoutine`), puis ce qu'on a fait au même rang la dernière
    // fois. « Les reps, c'est la routine » : la durée d'un cardio est de même nature.
    var duree = derniereSaisie(exo, iSerie, 'duree_s', prec);
    if (duree === null && propre && propre.duree_cible_s !== null && propre.duree_cible_s !== undefined) {
      duree = propre.duree_cible_s;
    }
    if (duree === null && ligne) duree = ligne.duree_s;
    var distance = derniereSaisie(exo, iSerie, 'distance_m', prec);
    if (distance === null && propre && propre.distance_cible_m !== null && propre.distance_cible_m !== undefined) {
      distance = propre.distance_cible_m;
    }
    if (distance === null && ligne) distance = ligne.distance_m;

    return {
      charge_kg: charge === undefined ? null : charge,
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

  // ⚠️ LA BORNE BASSE EST ZÉRO, ET ELLE VEUT DIRE « FINI » (§7 tervicies, ch. 49).
  //
  // Le chantier 47 refusait de descendre sous la borne. C'était la bonne règle
  // sur le MAUVAIS OBJET : elle protège le repos PRESCRIT — une consigne, qui
  // ne se règle qu'à la molette et dont la désactivation est un geste explicite
  // (§7 sexdecies.3) — et elle avait été posée sur le repos EN COURS, qui est
  // un décompte. Quatre appuis sur « −15 » pendant un repos de 60 s veulent
  // dire « arrête-toi maintenant », pas « refuse-moi ». C'est ce que fait
  // n'importe quel minuteur.
  //
  // Cette fonction redevient donc de l'ARITHMÉTIQUE BORNÉE, et rien d'autre :
  // elle rend une valeur dans [0, REPOS_MAX]. C'est `reposTermine` qui dit ce
  // que zéro signifie, et `rendreChrono` qui en tire la conséquence — au même
  // endroit, exactement, que pour un décompte arrivé à zéro tout seul.
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
  // ══ CE QUI ARME LE CHRONOMÈTRE (§7 novodecies) ═══════════════════════════
  //
  // ⚠️ DÉFAUT CONSTATÉ SUR DEVICE LE 17/09, APRÈS LE CHANTIER 44 : un repos
  // désactivé faisait quand même partir le chronomètre, qui comptait sans but.
  //
  // La cause n'était PAS la confusion `NULL`/zéro soupçonnée — le branchement
  // lisait bien `null`, et l'affichait (« cible — »). Il armait quand même :
  // l'armement n'était conditionné par RIEN. `chrono` devenait un objet non
  // nul, donc la barre s'affichait ; et comme le prédicat d'arrêt d'alors
  // (`reposFige`, fondue depuis dans `reposTermine`) rendait faux sans cible,
  // l'intervalle d'une seconde ne s'arrêtait jamais.
  //
  // La décision vit donc ICI, en une fonction pure, plutôt que dans une
  // condition au point d'appel : c'est la seule forme qu'une mutation peut
  // tuer, et le test du chantier 44 n'en tuait aucune — il vérifiait le
  // STOCKAGE de `null` et prétendait dans son nom vérifier l'armement.
  //
  // Zéro n'arme pas non plus : `routine_exos_repos_borne` commence à 5 s, donc
  // un zéro ne peut venir que d'un défaut — et « 0:00 de repos » serait une
  // prescription, pas une absence.
  // ⚠️ L'EXTINCTION N'EST PAS L'ARMEMENT (§7 tervicies, toujours vrai) — mais
  // l'extinction, elle, n'a qu'UNE forme : voir `reposTermine` plus bas.
  //
  //   · `cibleArmable` répond « ce repos doit-il COMMENCER ? » — un repos JAMAIS
  //     PRESCRIT (`null`) n'arme rien, et c'est le défaut que le chantier 45 a
  //     fermé ;
  //   · `reposTermine` répond « ce repos est-il FINI ? », et elle couvre les DEUX
  //     façons d'y arriver — le décompte arrivé à zéro tout seul comme le
  //     « −15 » qui l'y pousse.
  //
  // ⚠️ `reposEcoule(cible)` A DISPARU AU CHANTIER 51. Elle ne regardait que la
  // cible, donc elle ne voyait qu'UN des deux chemins vers zéro — celui du
  // geste. C'est exactement le défaut que ce chantier ferme.

  function cibleArmable(cible) {
    var n = nombreOuNul(cible);
    if (n === null || !(n > 0)) return null;
    return n;
  }

  function echeanceAtteinte(cible, secondes, dejaSonne) {
    if (dejaSonne) return false;
    var c = Number(cible) || 0;
    if (c <= 0) return false;
    return (Number(secondes) || 0) >= c;
  }

  // ══ LE REPOS FINI — UNE RÈGLE, UN ENDROIT (§7 quinvicies, ch. 51) ════════
  //
  // ⚠️ DÉFAUT CONSTATÉ SUR DEVICE APRÈS LA PR #290 : « −15 » jusqu'à zéro faisait
  // disparaître la barre, mais un décompte qui arrivait à zéro TOUT SEUL la
  // laissait figée. Deux chemins vers le même état, un seul l'éteignait —
  // parce que l'extinction était branchée sur le GESTE (`ajusterRepos`) et non
  // sur l'ÉTAT. Même maladie que le fantôme au 39, le volume au 40,
  // `derniereSaisie` au 46 et `cibleArmable` au 47 : une règle appliquée à un
  // endroit sur deux (CADRAGE-V2 §2 undecies).
  //
  // La règle juste est UNE : LE DÉCOMPTE À ZÉRO ÉTEINT LA BARRE, QUELLE QUE SOIT
  // LA FAÇON D'Y ARRIVER. Un « −15 » n'est qu'un moyen d'y arriver plus vite ;
  // ce n'est pas un second comportement.
  //
  // Elle se LIT donc du restant, et de rien d'autre — `secondesRestantes` couvre
  // déjà les deux chemins : `s >= c` (arrivé seul) comme `c <= 0` (raccourci à
  // zéro, ou repos désactivé en cours de route). Deux prédicats se sont fondus
  // ici, et chacun ne voyait qu'un chemin.
  //
  // ⚠️ CE QUI FINIT EST L'AFFICHAGE, JAMAIS LA MESURE. `repos_s` se calcule à la
  // validation suivante, depuis l'écart entre deux `validee_a` (`valider`
  // ci-dessus) : il porte le repos RÉEL, même s'il a duré trois fois la cible.
  // La barre s'en va, l'observation continue.
  function reposTermine(cible, secondes) {
    return secondesRestantes(cible, secondes) === 0;
  }

  // ══ UN COMPTE À REBOURS, PAS UN CHRONOMÈTRE (§7 quatervicies, ch. 50) ═══
  //
  // Le grand nombre de la barre était le temps ÉCOULÉ : il montait de 0:00 vers
  // la cible, écrite en petit à côté. Entre deux séries, personne ne se demande
  // depuis combien de temps il souffle — il se demande COMBIEN IL LUI RESTE. Le
  // montant faisait faire la soustraction de tête.
  //
  // ⚠️ ET ÇA REND LE §7 TERVICIES LISIBLE : « −15 » fait maintenant DESCENDRE le
  // grand nombre, et la barre s'en va quand il atteint zéro. Avant, le même
  // geste faisait MONTER le nombre vers une cible qui, elle, descendait — deux
  // mouvements opposés pour un seul appui.
  //
  // ⚠️ LA MESURE N'EST PAS TOUCHÉE, ET C'EST LE POINT. `repos_s` se calcule à la
  // validation suivante, depuis l'écart entre deux `validee_a` (`valider`) : il
  // porte le repos RÉEL, même s'il a duré trois fois la cible. On change ce
  // qu'on MONTRE, jamais ce qu'on observe.
  //
  // Sans cible, il ne reste rien à décompter : zéro. Le cas ne se produit plus
  // depuis le chantier 45 — `demarrerChrono` passe par `cibleArmable`, donc tout
  // chronomètre vivant a une cible > 0 — mais la fonction reste TOTALE : elle
  // répond pour toute entrée plutôt que de rendre un nombre qui n'a pas de sens.
  function secondesRestantes(cible, secondes) {
    var c = Number(cible) || 0;
    if (c <= 0) return 0;
    var s = Number(secondes) || 0;
    return s >= c ? 0 : c - s;
  }

  // ══ 84 (12/10/2026) — UNE SÉANCE VIVANTE D'UN AUTRE APPAREIL ═══════════
  //
  // ECRAN-SAISIE §7 duovicies.1 ter. Une séance `en_cours` d'un autre appareil
  // est VIVANTE si sa dernière série validée (`validee_a`), à défaut son début,
  // date de MOINS de 45 minutes : on ne la ferme ni ne la reprend sans demander.
  // Au-delà, elle est ABANDONNÉE (plantage, téléphone éteint) et se traite comme
  // avant. Pourquoi 45 : sur les vraies séances, 99 % des repos entre deux
  // séries validées durent moins de 21 minutes, le plus long 31.
  //
  // Pures : « maintenant » est un PARAMÈTRE, jamais l'horloge.
  var MINUTES_VIVANTE = 45;

  // L'instant de la dernière activité : la plus récente `validee_a` des séries,
  // sinon le début de la séance. `null` si rien n'est lisible.
  function derniereActivite(ligne, series) {
    var t = null;
    (series || []).forEach(function (s) {
      var v = s ? Date.parse(s.validee_a) : NaN;
      if (!isNaN(v) && (t === null || v > t)) t = v;
    });
    if (t === null && ligne) {
      var d = Date.parse(ligne.debut);
      if (!isNaN(d)) t = d;
    }
    return t === null ? null : new Date(t).toISOString();
  }

  // Vivante : `en_cours`, et une activité de moins de 45 minutes (strict).
  function estVivante(ligne, series, maintenantIso) {
    if (!ligne || ligne.statut !== 'en_cours') return false;
    var a = derniereActivite(ligne, series);
    var m = Date.parse(maintenantIso);
    if (a === null || isNaN(m)) return false;
    return m - Date.parse(a) < MINUTES_VIVANTE * 60 * 1000;
  }

  // Les mots des deux feuilles (la maquette 84, au mot près). `cas` : 'reprendre'
  // (j'ouvre l'app, pas de séance ici) ou 'commencer' (je commence une séance).
  // L'heure, à l'heure du téléphone (`THModele.heureMinute`).
  function feuilleAutreAppareil(ligne, series, cas) {
    var aSerie = (series || []).some(function (s) { return s && !isNaN(Date.parse(s.validee_a)); });
    var heure = racine.THModele.heureMinute(derniereActivite(ligne, series));
    var titreSeance = ligne && ligne.titre ? ligne.titre : 'Séance';
    var fait = titreSeance + ' · ' + (aSerie ? 'dernière série à ' : 'commencée à ') + heure + '.';
    if (cas === 'commencer') {
      return { titre: 'Une séance est en cours sur un autre appareil',
               aide: fait + ' Une seule séance à la fois : la terminer pour commencer celle-ci ?',
               libelle: 'La terminer et commencer', libelleAnnuler: 'Annuler' };
    }
    return { titre: 'Une séance est en cours sur un autre appareil', aide: fait,
             libelle: 'La continuer ici', libelleAnnuler: 'Pas maintenant' };
  }

  var api = {
    MINUTES_VIVANTE: MINUTES_VIVANTE,
    derniereActivite: derniereActivite,
    estVivante: estVivante,
    feuilleAutreAppareil: feuilleAutreAppareil,
    TYPES: TYPES, RESSENTIS: RESSENTIS,
    PAS_REPOS: PAS_REPOS,
    ajusterCible: ajusterCible,
    cibleArmable: cibleArmable,
    echeanceAtteinte: echeanceAtteinte,
    reposTermine: reposTermine,
    secondesRestantes: secondesRestantes,
    EN_COURS: EN_COURS, TERMINEE: TERMINEE, REPOS_MAX: REPOS_MAX,
    REPOS_CIBLE_MIN: REPOS_CIBLE_MIN, REPOS_CIBLE_MAX: REPOS_CIBLE_MAX,
    SALLE_MAX: SALLE_MAX,
    creer: creer,
    serieVide: serieVide,
    ajouterExercice: ajouterExercice,
    ajouterSerie: ajouterSerie,
    ajouterDegressive: ajouterDegressive,
    insererChauffes: insererChauffes,
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
    reordonnerBlocs: reordonnerBlocs,
    grouperBlocs: grouperBlocs,
    degrouperExercice: degrouperExercice,
    plusTard: plusTard,
    occurrenceDouloureuse: occurrenceDouloureuse,
    marquerDouleur: marquerDouleur,
    choisirReprise: choisirReprise,
    uuidDOccurrence: uuidDOccurrence,
    freresProposes: freresProposes,
    exercicesProposes: exercicesProposes,
    COUSINS_PROPOSES: COUSINS_PROPOSES,
    remplacerExercice: remplacerExercice,
    insererExercice: insererExercice,
    retirerExercices: retirerExercices,
    compterAEffacer: compterAEffacer,
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
    seriesIncompletes: seriesIncompletes,
    partEnBase: partEnBase,
    exerciceFini: exerciceFini,
    blocFini: blocFini,
    slugsDuBloc: slugsDuBloc,
    REPS_MAX_SERIE: REPS_MAX_SERIE,
    DUREE_MAX_S: DUREE_MAX_S,
    plafonne: plafonne,
    repsBornees: repsBornees,
    dureeBornee: dureeBornee,
    bornerLigne: bornerLigne,
    oublierRangsOrigine: oublierRangsOrigine,
    idsRetires: idsRetires,
    semerIdentifiants: semerIdentifiants,
    toutesLesSeries: toutesLesSeries,
    compter: compter,
    minutesEcoulees: minutesEcoulees,
    delaiProchaineMinute: delaiProchaineMinute,
    lignes: lignes,
    ligneSession: ligneSession,
    precedent: precedent,
    correspondant: correspondant,
    derniereSaisie: derniereSaisie,
    fantome: fantome,
    casesManquantes: casesManquantes,
    planDe: planDe,
    couvertureDe: couvertureDe,
    couvertureSeance: couvertureSeance,
    typeDe: typeDe,
    figeesDe: figeesDe,
    occurrenceCoachee: occurrenceCoachee,
    parisDeLOccurrence: parisDeLOccurrence,
    observationTenue: observationTenue,
    peutObserver: peutObserver,
    parisAObserver: parisAObserver,
    observationsARenvoyer: observationsARenvoyer
  };

  racine.THSeance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
