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

  // ⚠️ LISTE BLANCHE des colonnes de `sets` que cet écran écrit. Ce qui n'y
  // figure pas ne part pas : tempo, élastique, note et superset appartiennent à
  // d'autres chantiers, et `elastique_norme`/`salle_norme` sont GÉNÉRÉES —
  // les écrire ferait échouer la requête.
  var CHAMPS_SERIE = ['id', 'session_id', 'user_id', 'exercise_slug', 'source',
                      'type_serie', 'charge_kg', 'reps', 'rpe', 'ressenti',
                      'validee_a', 'rang', 'repos_s'];

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

  function exerciceDepuisRoutine(e, idSerie) {
    var n = Math.max(1, Math.min(20, Number(e.series) || 1));
    var series = [];
    for (var i = 0; i < n; i++) series.push(serieVide(idSerie));
    return {
      exercise_slug: e.exercise_slug,
      reps_visees: e.reps_visees === undefined ? null : e.reps_visees,
      repos_cible_s: e.repos_cible_s === undefined ? null : e.repos_cible_s,
      series: series
    };
  }

  function serieVide(idSerie) {
    return {
      id: typeof idSerie === 'function' ? idSerie() : null,
      type_serie: 'travail',
      charge_kg: null, reps: null, rpe: null, ressenti: null,
      validee_a: null, repos_s: null
    };
  }

  // ── Structure ───────────────────────────────────────────────────────────
  function ajouterExercice(seance, slug, idSerie, options) {
    var o = options || {};
    var exos = seance.exercices.concat([{
      exercise_slug: slug,
      reps_visees: o.reps_visees === undefined ? null : o.reps_visees,
      repos_cible_s: o.repos_cible_s === undefined ? null : o.repos_cible_s,
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

  function modifierSerie(seance, iExo, iSerie, champs) {
    var c = {};
    if ('charge_kg' in champs) c.charge_kg = nombreOuNul(champs.charge_kg);
    if ('reps' in champs) {
      var r = nombreOuNul(champs.reps);
      c.reps = r === null ? null : Math.round(r);
    }
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
          rpe: p.serie.rpe,
          ressenti: p.serie.ressenti,
          validee_a: p.serie.validee_a,
          rang: p.rang,
          repos_s: p.serie.repos_s
        };
      });
  }

  function ligneSession(seance) {
    return {
      id: seance.id,
      user_id: seance.user_id,
      debut: seance.debut,
      fin: seance.fin,
      titre: seance.titre,
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
            return { charge_kg: x.charge_kg, reps: x.reps, type_serie: x.type_serie };
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
  function fantome(seance, iExo, iSerie, prec) {
    var exo = seance.exercices[iExo];
    var charge = null;
    for (var k = iSerie - 1; k >= 0; k--) {
      if (exo.series[k].charge_kg !== null && exo.series[k].charge_kg !== undefined) {
        charge = exo.series[k].charge_kg; break;
      }
    }
    var ligne = prec && prec.series ? prec.series[iSerie] : null;
    if (charge === null && ligne) charge = ligne.charge_kg;
    var reps = exo.reps_visees;
    if ((reps === null || reps === undefined) && ligne) reps = ligne.reps;
    return { charge_kg: charge, reps: reps === undefined ? null : reps };
  }

  var api = {
    TYPES: TYPES, RESSENTIS: RESSENTIS, CHAMPS_SERIE: CHAMPS_SERIE,
    EN_COURS: EN_COURS, TERMINEE: TERMINEE, REPOS_MAX: REPOS_MAX,
    creer: creer,
    serieVide: serieVide,
    ajouterExercice: ajouterExercice,
    retirerExercice: retirerExercice,
    ajouterSerie: ajouterSerie,
    retirerSerie: retirerSerie,
    modifierSerie: modifierSerie,
    changerType: changerType,
    definirEffort: definirEffort,
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
