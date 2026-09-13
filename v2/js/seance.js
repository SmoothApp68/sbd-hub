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
    return {
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
    };
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

  function serieVide(idSerie) {
    return {
      id: typeof idSerie === 'function' ? idSerie() : null,
      type_serie: 'travail',
      charge_kg: null, reps: null, duree_s: null, distance_m: null,
      rpe: null, ressenti: null, note: null,
      validee_a: null, repos_s: null
    };
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
  function ecartsRoutine(seance, routine) {
    if (!seance || !routine || !routine.id) return [];
    if (seance.routine_id !== routine.id) return [];
    var parId = {};
    (routine.exercices || []).forEach(function (e) { if (e && e.id) parId[e.id] = e; });

    var ecarts = [];
    (seance.exercices || []).forEach(function (exo) {
      var ligne = exo && exo.routine_exercise_id && parId[exo.routine_exercise_id];
      if (!ligne) return;
      var champs = {};
      var reposRoutine = ligne.repos_cible_s === undefined ? null : ligne.repos_cible_s;
      var noteRoutine = texteOuNul(ligne.note);
      var reposSeance = exo.repos_cible_s === undefined ? null : exo.repos_cible_s;
      var noteSeance = texteOuNul(exo.note);
      if (reposSeance !== reposRoutine) champs.repos_cible_s = reposSeance;
      if (noteSeance !== noteRoutine) champs.note = noteSeance;
      if (!Object.keys(champs).length) return;
      ecarts.push({
        id: ligne.id,
        exercise_slug: exo.exercise_slug,
        champs: champs,
        repos_avant: reposRoutine,
        note_avant: noteRoutine
      });
    });
    return ecarts;
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
  // Les séries VALIDÉES seulement. Les autres n'ont pas le droit d'exister en
  // base, et elles n'ont rien à y faire : une case vide n'est pas une donnée.
  function lignes(seance) {
    return toutesLesSeries(seance)
      .filter(function (p) { return !!p.serie.validee_a; })
      .map(function (p) {
        return {
          id: p.serie.id,
          session_id: seance.id,
          user_id: seance.user_id,
          exercise_slug: p.exo.exercise_slug,
          source: 'app',
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
          rang: p.rang,
          repos_s: p.serie.repos_s
        };
      });
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
    valider: valider,
    devalider: devalider,
    derniereValidation: derniereValidation,
    terminer: terminer,
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
