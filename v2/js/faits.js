// v2/js/faits.js — le module des faits (58-1, « un seul fil »).
//
// Les FAITS que les écrans lisent — et que le jeu lira — assemblés à UN
// endroit : les séances avec leurs séries, celles d'un exercice, les records
// d'une séance, d'un mois, de la séance en cours, le dernier record, la
// semaine affichée, les exercices faits et leur date. Ils vivaient dans
// `app.js`, au milieu de l'état de l'écran : le jeu n'aurait pu les lire qu'en
// les recopiant.
//
// ⚠️ UN DÉPLACEMENT, PAS UNE RÉÉCRITURE. Chaque fonction garde le corps
// qu'elle avait dans `app.js` ; ce qu'elle lisait de l'état de l'écran arrive
// en argument, et c'est tout ce qui a changé :
//
//   · `c` — LE CORPUS : `{ seances, series, exercices, seriesDe(id),
//     catalogue() }` — ce que `app.js` appelait `local.seances`,
//     `local.series`, `local.exercices`, `seriesDe` et `catalogueIndexe` ;
//   · `seance` — la séance EN COURS (ou `null`), là où une fonction la lisait ;
//   · `lundi` — la semaine affichée, pour la semaine.
//
// Les règles, elles, ne sont pas ici : la série de travail, les records, la
// semaine, le volume, le bilan d'un mois vivent dans `modele.js`,
// `semaine.js`, `bilan.js` — ce module les APPELLE, il ne les recopie pas.
//
// ⚠️ LES MÉMOS VIVENT ICI, avec leur clé d'état explicite — la même qu'avant :
// le nombre de séances et de séries du corpus (et, pour l'historique d'un
// exercice en séance, la séance en cours). Les dates des exercices faits
// gardent leur oubli explicite (`oublierDates`), appelé là où `app.js`
// remettait `datesExercices` à `null`. Un mémo par instance (`creer()`) :
// l'app en crée une ; un test, la sienne.
//
// Pur : aucun accès au DOM, au réseau, au stockage.

(function (racine) {
  'use strict';

  function creer() {
    var Modele = racine.THModele, Semaine = racine.THSemaine, Bilan = racine.THBilan, Seance = racine.THSeance;

    // ── Les séances et leurs séries (55-1, `app.js` `seancesAvecSeries`) ────
    //
    // Les séances avec leurs séries, une fois par état du cache : le bilan, ses
    // records et le dernier record les relisent.
    var memoSeancesBilan = { cle: null, liste: [] };
    function seancesAvecSeries(c) {
      var cle = (c.seances || []).length + '|' + (c.series || []).length;
      if (memoSeancesBilan.cle !== cle) {
        memoSeancesBilan = { cle: cle, liste: (c.seances || []).filter(Boolean).map(function (s) {
          return { id: s.id, debut: s.debut, fin: s.fin || null, series: Modele.trierParRang(c.seriesDe(s.id)) };
        }) };
      }
      return memoSeancesBilan.liste;
    }

    // Toutes les séances qui portent un exercice (la séance en cours n'y est
    // pas : elle n'est dans le cache qu'une fois terminée).
    var memoParSlug = { cle: null, parSlug: {} };
    function seancesDuSlug(c, slug) {
      var cle = (c.seances || []).length + '|' + (c.series || []).length;
      if (memoParSlug.cle !== cle) memoParSlug = { cle: cle, parSlug: {} };
      if (!memoParSlug.parSlug[slug]) {
        memoParSlug.parSlug[slug] = seancesAvecSeries(c).map(function (s) {
          return { id: s.id, debut: s.debut, series: s.series.filter(function (x) { return x && x.exercise_slug === slug; }) };
        }).filter(function (g) { return g.series.length > 0; });
      }
      return memoParSlug.parSlug[slug];
    }

    // Les séances qui portent cet exercice, de la plus récente à la plus
    // ancienne : `c.seances` est déjà rangée ainsi (invariant de
    // `rangerSeances`, app.js), on ne retrie pas ce qui est trié. La forme que
    // lit le coach (`{ seance, series }`, `app.js` `seancesDeLExercice`).
    function seancesDeLExercice(c, slug) {
      return c.seances.map(function (s) {
        var siennes = c.seriesDe(s.id).filter(function (x) {
          return x && x.exercise_slug === slug;
        });
        return siennes.length ? { seance: s, series: siennes } : null;
      }).filter(Boolean);
    }

    // ── Les records (MOTEUR §9.23, 55-1) ────────────────────────────────────
    //
    // Les séries médaillées d'une séance PASSÉE : chacune comparée aux séances
    // d'avant et aux séries d'avant dans la séance — la même règle qu'en séance.
    var memoRecordsSeance = { cle: null, parId: {} };
    function recordsDeLaSeance(c, se) {
      var cle = (c.seances || []).length + '|' + (c.series || []).length;
      if (memoRecordsSeance.cle !== cle) memoRecordsSeance = { cle: cle, parId: {} };
      if (memoRecordsSeance.parId[se.id]) return memoRecordsSeance.parId[se.id];
      var index = c.catalogue(), out = [];
      se.series.forEach(function (x, k) {
        if (!x || !Modele.estTravail(x)) return;
        var r = Modele.recordsBattus(seancesDuSlug(c, x.exercise_slug), se, k, Modele.optionsDeRecord(index[x.exercise_slug] || null));
        if (!r.length) return;
        var nom = Modele.nomCourt(index[x.exercise_slug] ? index[x.exercise_slug].nom : x.exercise_slug);
        out.push({ seanceId: se.id, debut: se.debut, slug: x.exercise_slug,
                   nom: nom.charAt(0).toUpperCase() + nom.slice(1), mesure: Modele.formatMesure(x), records: r });
      });
      memoRecordsSeance.parId[se.id] = out;
      return out;
    }

    // Les records d'un mois, dans l'ordre des séances.
    function recordsDuMois(c, mois) {
      var out = [];
      Bilan.seancesDuMois(seancesAvecSeries(c), mois).slice().sort(function (a, b) {
        return String(a.debut).localeCompare(String(b.debut));
      }).forEach(function (se) { recordsDeLaSeance(c, se).forEach(function (r) { out.push(r); }); });
      return out;
    }

    // Le dernier record : la dernière série médaillée de la séance la plus
    // récente qui en a une (`c.seances` est rangée de la plus récente à la
    // plus ancienne).
    function dernierRecord(c) {
      var liste = seancesAvecSeries(c);
      for (var i = 0; i < liste.length; i++) {
        var r = recordsDeLaSeance(c, liste[i]);
        if (r.length) return r[r.length - 1];
      }
      return null;
    }

    // ── Les records de la séance EN COURS (la médaille, la feuille « Terminer ») ──
    //
    // Rien n'est écrit en base : la médaille se RECALCULE à chaque rendu, donc
    // dévalider la retire, et corriger une charge la refait.
    //
    // L'historique d'un exercice ne change pas pendant la séance : il se lit une
    // fois par exercice, et se relit quand la séance ou le cache changent.
    var memoRecords = { cle: null, parSlug: {} };
    function historiqueDesRecords(c, seance, slug) {
      var cle = (seance ? seance.id : '') + '|' + (c.seances || []).length + '|' + (c.series || []).length;
      if (memoRecords.cle !== cle) memoRecords = { cle: cle, parSlug: {} };
      if (!memoRecords.parSlug[slug]) {
        memoRecords.parSlug[slug] = (c.seances || []).filter(function (s) {
          return s && (!seance || s.id !== seance.id);
        }).map(function (s) {
          return { debut: s.debut, series: c.seriesDe(s.id).filter(function (x) { return x && x.exercise_slug === slug; }) };
        }).filter(function (g) { return g.series.length > 0; });
      }
      return memoRecords.parSlug[slug];
    }

    // La séance en cours telle que les records la lisent : ses séries VALIDÉES,
    // dans l'ordre de la séance, et la position de chacune.
    function seanceDesRecords(seance) {
      var series = [], positions = {};
      (seance ? seance.exercices : []).forEach(function (exo, i) {
        (exo.series || []).forEach(function (s, j) {
          if (!Seance.partEnBase(s)) return;
          positions[i + ':' + j] = series.length;
          series.push(Object.assign({}, s, { exercise_slug: exo.exercise_slug }));
        });
      });
      return { debut: seance ? seance.debut : null, series: series, positions: positions };
    }

    function recordsDeLaSerie(c, seance, iExo, iSerie, lue) {
      var v = lue || seanceDesRecords(seance);
      var k = v.positions[iExo + ':' + iSerie];
      if (k === undefined) return [];
      var slug = v.series[k].exercise_slug;
      return Modele.recordsBattus(historiqueDesRecords(c, seance, slug), v, k,
        Modele.optionsDeRecord(c.catalogue()[slug] || null));
    }

    // Les records du jour, pour la feuille « Terminer » : une ligne par série
    // médaillée, « Développé couché 130 kg × 4 ».
    function recordsDuJour(c, seance) {
      if (!seance) return [];
      var v = seanceDesRecords(seance), index = c.catalogue(), out = [];
      seance.exercices.forEach(function (exo, i) {
        (exo.series || []).forEach(function (s, j) {
          if (!recordsDeLaSerie(c, seance, i, j, v).length) return;
          var nom = Modele.nomCourt(index[exo.exercise_slug] ? index[exo.exercise_slug].nom : exo.exercise_slug);
          out.push({ nom: nom.charAt(0).toUpperCase() + nom.slice(1), mesure: Modele.formatMesure(s) });
        });
      });
      return out;
    }

    // ── La semaine affichée (`app.js` `semaineCourante`) ────────────────────
    //
    // Tout ce que les deux onglets lisent de la semaine affichée. Une seule
    // source : passer de Séances à Progression conserve la semaine. `lundi` :
    // la semaine affichée (l'écran la retient, `lundiAffiche`).
    function semaineDe(c, lundi) {
      var bornes = Semaine.bornesSemaine(lundi);
      var jours = Semaine.repartirParJour(c.seances, bornes.lundi);
      var seances = jours.reduce(function (acc, j) { return acc.concat(j.seances); }, []);
      var series = seances.reduce(function (acc, s) { return acc.concat(c.seriesDe(s.id)); }, []);
      return {
        bornes: bornes, jours: jours, seances: seances, series: series,
        bilan: Semaine.bilanSemaine(seances, series, c.exercices),
        zones: Semaine.volumeParZone(series, c.exercices)
      };
    }

    // ── Les exercices faits et leur date (`app.js` `calculerDatesExercices`) ──
    //
    // Le tri se fait sur la DERNIÈRE séance où l'exercice apparaît. Un balayage
    // des 28 000 séries, fait UNE FOIS à l'ouverture de l'écran et gardé : le
    // refaire à chaque frappe de la recherche rendrait le champ poussif.
    //
    // ⚠️ L'OUBLI RESTE EXPLICITE, comme avant : `oublierDates()` là où l'écran
    // remettait `datesExercices` à `null` (le corpus a changé, le compte part).
    var datesExercices = null;
    function datesDesExercices(c) {
      var parSeance = {};
      (c.seances || []).forEach(function (s) {
        if (s && s.id && s.debut) parSeance[s.id] = s.debut;
      });
      // PR 6 — un exercice « fait » a au moins une SÉRIE DE TRAVAIL (cardio
      // compris), pas une ligne de n'importe quel type : la définition unique
      // (`Modele.exercicesFaits`), celle de Progression. Sa date est la plus
      // récente de ces séances-là.
      var dates = Modele.exercicesFaits(c.series, parSeance);
      datesExercices = dates;
      return dates;
    }
    function compterExercices(c) {
      var dates = datesExercices || datesDesExercices(c);
      return { total: (c.exercices || []).length, faits: Object.keys(dates).length };
    }
    function oublierDates() { datesExercices = null; }

    return {
      seancesAvecSeries: seancesAvecSeries,
      seancesDuSlug: seancesDuSlug,
      seancesDeLExercice: seancesDeLExercice,
      recordsDeLaSeance: recordsDeLaSeance,
      recordsDuMois: recordsDuMois,
      dernierRecord: dernierRecord,
      historiqueDesRecords: historiqueDesRecords,
      seanceDesRecords: seanceDesRecords,
      recordsDeLaSerie: recordsDeLaSerie,
      recordsDuJour: recordsDuJour,
      semaineDe: semaineDe,
      datesDesExercices: datesDesExercices,
      compterExercices: compterExercices,
      oublierDates: oublierDates
    };
  }

  var api = { creer: creer };
  racine.THFaits = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
