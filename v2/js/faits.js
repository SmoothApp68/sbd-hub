// v2/js/faits.js — le module des faits (58-1, « un seul fil »).
//
// Les FAITS que les écrans lisent — et que le jeu lira — assemblés à UN
// endroit : les séances avec leurs séries, celles d'un exercice, les records
// d'une séance, d'un mois, de la séance en cours, le dernier record, la
// semaine affichée, les exercices faits et leur date — et, depuis 60-2a, ce que
// les séances savent de la personne (`ceQueJeSais`), que le questionnaire du coach
// MONTRE au lieu de le demander. Ils vivaient dans
// `app.js`, au milieu de l'état de l'écran : le jeu n'aurait pu les lire qu'en
// les recopiant.
//
// ⚠️ UN DÉPLACEMENT, PAS UNE RÉÉCRITURE. Chaque fonction garde le corps
// qu'elle avait dans `app.js` ; ce qu'elle lisait de l'état de l'écran arrive
// en argument, et c'est tout ce qui a changé :
//
//   · `c` — LE CORPUS : `{ seances, series, exercices, seriesDe(id),
//     catalogue(), journal }` — ce que `app.js` appelait `local.seances`,
//     `local.series`, `local.exercices`, `seriesDe` et `catalogueIndexe` ;
//     `journal` (58-2) : les lignes du journal des records (`local.records`) ;
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
    var Periode = racine.THPeriode, Moteur = racine.THMoteur;

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
        // 58-2 — `serieId` : le journal écrit une ligne par série et par type.
        out.push({ seanceId: se.id, serieId: x.id, debut: se.debut, slug: x.exercise_slug,
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

    // ── Le journal des records (MOTEUR §9.23, 58-2) ─────────────────────────
    //
    // Chaque record battu s'écrit UNE fois dans la table `records` (v2_061,
    // v2_062) : une ligne par série et par type. ⚠️ LE JOURNAL NE CALCULE RIEN.
    // Une ligne est ce que `recordsBattus` a constaté, recopié aux colonnes de
    // la table : la valeur, l'ancien record et sa date, les reps d'une « charge
    // pour N reps », la charge d'un « reps à charge », l'unité d'un volume, la
    // fenêtre des 12 mois. Aucun champ n'est déduit ici d'autre chose que de ce
    // record-là, de sa série et de sa séance.
    //
    // Les trois champs propres à un type (`reps`, `charge`, `unite`) sont à
    // `null` ailleurs : un lot part en UNE requête, et PostgREST veut les mêmes
    // colonnes sur chaque ligne.
    function ligneDuJournal(r, serie, seance, userId) {
      var vide = function (v) { return v === undefined ? null : v; };
      return {
        user_id: userId || null,
        set_id: serie.id,
        session_id: seance.id,
        exercise_slug: serie.exercise_slug,
        type: r.type,
        valeur: r.valeur,
        reps: vide(r.reps),
        charge: vide(r.charge),
        unite: vide(r.unite),
        ancien: vide(r.ancien),
        ancien_le: vide(r.ancien_le),
        sur_douze_mois: !!r.douzeMois,
        battu_le: seance.debut
      };
    }

    // Les lignes de la séance qu'on TERMINE — ou qu'on corrige en Édition : les
    // records de chaque série par `recordsDeLaSerie`, la fonction de la médaille
    // et de la feuille « Terminer ». Aucun recalcul à part : la feuille affiche
    // ce que le journal garde.
    function journalDuJour(c, seance, userId) {
      if (!seance) return [];
      var v = seanceDesRecords(seance), out = [];
      seance.exercices.forEach(function (exo, i) {
        (exo.series || []).forEach(function (s, j) {
          recordsDeLaSerie(c, seance, i, j, v).forEach(function (r) {
            out.push(ligneDuJournal(r, { id: s.id, exercise_slug: exo.exercise_slug }, seance, userId));
          });
        });
      });
      return out;
    }

    // Les lignes d'une séance PASSÉE (le remplissage de l'historique, une fois) :
    // `recordsDeLaSeance`, la fonction du bilan du mois et du dernier record.
    function journalDeLaSeance(c, se, userId) {
      var out = [];
      recordsDeLaSeance(c, se).forEach(function (m) {
        m.records.forEach(function (r) {
          out.push(ligneDuJournal(r, { id: m.serieId, exercise_slug: m.slug }, se, userId));
        });
      });
      return out;
    }

    // ⚠️ LA LECTURE DU JOURNAL — la seule. Le jeu (et plus tard le social) lit
    // le journal ICI, jamais un recalcul ; il ne s'écrit que par la file
    // d'envoi (`app.js`, `poserJournal`). `c.journal` : les lignes du magasin
    // local `records`. `filtre` : `{ slug, seance, type, depuis, jusqua }`,
    // tous facultatifs (`depuis`/`jusqua` bornent `battu_le`, comparés comme
    // des instants). Rend des copies, de la plus ancienne à la plus récente ;
    // à date égale, dans l'ordre de la phrase de la médaille (§9.23).
    var ORDRE_DES_TYPES = ['charge_a_reps', 'reps_a_charge', 'charge_max', 'cap', 'un_rm_estime',
                           'volume_seance', 'duree_s', 'distance_m'];
    function recordsDuJournal(c, filtre) {
      var f = filtre || {};
      var instant = function (x) { var t = Date.parse(x); return isNaN(t) ? null : t; };
      var depuis = f.depuis ? instant(f.depuis) : null, jusqua = f.jusqua ? instant(f.jusqua) : null;
      return (c.journal || []).filter(function (l) {
        if (!l) return false;
        if (f.slug && l.exercise_slug !== f.slug) return false;
        if (f.seance && l.session_id !== f.seance) return false;
        if (f.type && l.type !== f.type) return false;
        var t = instant(l.battu_le);
        if (depuis !== null && (t === null || t < depuis)) return false;
        if (jusqua !== null && (t === null || t > jusqua)) return false;
        return true;
      }).map(function (l) { return Object.assign({}, l); }).sort(function (a, b) {
        var ta = instant(a.battu_le) || 0, tb = instant(b.battu_le) || 0;
        if (ta !== tb) return ta - tb;
        return ORDRE_DES_TYPES.indexOf(a.type) - ORDRE_DES_TYPES.indexOf(b.type);
      });
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

    // ── Ce que les séances savent de la personne (60-2a) ────────────────────
    //
    // QUESTIONNAIRE-COACH-V2 §1 : « rien de ce que les séries savent n'est
    // DEMANDÉ : c'est MONTRÉ ». L'écran « Ce que je sais » et l'écran « Temps et
    // matériel » (la durée habituelle) lisent ce fait-ci, une fois : aucun écran
    // ne recompte ses séances.
    //
    //   · `seances`, `depuis` : toutes les séances terminées (une randonnée est
    //     une séance) et la date de la première ;
    //   · `rythme` : les séances des 84 derniers jours ÷ 12 semaines, arrondi au
    //     plus proche — `null` sous 1 par semaine ;
    //   · `dureeMin` : la MÉDIANE des durées (fin − début) des séances des 84
    //     derniers jours qui ONT une heure de fin, arrondie à 5 min — `null`
    //     sans durée. Les séances importées n'en ont pas toujours : on ne leur
    //     en invente pas (`Moteur.finEffective` est une borne de zone, pas une
    //     durée) ;
    //   · `maximums` : la charge la plus lourde de chacune des barres demandées
    //     (`barres` : des slugs, dans l'ordre voulu), par la fonction des records
    //     (MOTEUR §9.23) — celle de la page d'exercice ; seulement les barres
    //     faites ;
    //   · `autres` : les noms (catalogue, en minuscules) des SORTIES — sans
    //     charge, mesurées en durée ou en distance, hors gainage et planches, qui
    //     portent un muscle — faites dans ces 84 jours, trois au plus, les plus
    //     fréquentes d'abord.
    //
    // `aujourdhui` : le jour de l'ouverture, passé (jamais l'horloge).
    var JOURS_DU_RYTHME = 84, SEMAINES_DU_RYTHME = 12, PAS_DE_DUREE = 5, AUTRES_MAX = 3;
    var MS_PAR_MINUTE = 60000;
    function ceQueJeSais(c, aujourdhui, barres) {
      var index = c.catalogue();
      var seances = (c.seances || []).filter(function (s) {
        return s && s.debut && !isNaN(new Date(s.debut).getTime());
      });
      var premiere = null;
      seances.forEach(function (s) {
        var d = new Date(s.debut);
        if (!premiere || d < premiere) premiere = d;
      });

      var fenetre = Periode.fenetres(JOURS_DU_RYTHME, aujourdhui).courante;
      var recentes = seances.filter(function (s) { return Periode.dans(s.debut, fenetre); });
      var parSemaine = Math.round(recentes.length / SEMAINES_DU_RYTHME);

      var durees = [];
      recentes.forEach(function (s) {
        if (!s.fin) return;
        var minutes = (new Date(s.fin) - new Date(s.debut)) / MS_PAR_MINUTE;
        if (isFinite(minutes) && minutes > 0) durees.push(minutes);
      });
      var mediane = Moteur.mediane(durees);
      var arrondie = mediane === null ? null : Math.round(mediane / PAS_DE_DUREE) * PAS_DE_DUREE;

      var maximums = [];
      (barres || []).forEach(function (slug) {
        var pour = seancesDuSlug(c, slug);
        if (!pour.length) return;
        var lourde = Modele.recordsDeLExercice(pour, aujourdhui, Modele.optionsDeRecord(index[slug] || null)).lourde;
        if (lourde && lourde.charge > 0) maximums.push({ slug: slug, charge: lourde.charge });
      });

      var comptes = {};
      recentes.forEach(function (s) {
        var deja = {};
        c.seriesDe(s.id).forEach(function (x) {
          if (!x || !Modele.estTravail(x) || deja[x.exercise_slug]) return;
          var exo = index[x.exercise_slug];
          if (!Modele.estExerciceSortie(exo) || Semaine.porteDuVolume(exo)) return;
          deja[x.exercise_slug] = true;
          comptes[x.exercise_slug] = (comptes[x.exercise_slug] || 0) + 1;
        });
      });
      var autres = Object.keys(comptes).map(function (slug) {
        return { nom: Modele.nomCourt(Modele.nommer(index, slug)), fois: comptes[slug] };
      }).sort(function (a, b) {
        return b.fois - a.fois || a.nom.localeCompare(b.nom, 'fr');
      }).slice(0, AUTRES_MAX).map(function (a) { return a.nom; });

      return {
        seances: seances.length,
        depuis: premiere,
        rythme: parSemaine >= 1 ? parSemaine : null,
        dureeMin: arrondie !== null && arrondie >= PAS_DE_DUREE ? arrondie : null,
        maximums: maximums,
        autres: autres
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
      journalDuJour: journalDuJour,
      journalDeLaSeance: journalDeLaSeance,
      recordsDuJournal: recordsDuJournal,
      semaineDe: semaineDe,
      datesDesExercices: datesDesExercices,
      compterExercices: compterExercices,
      ceQueJeSais: ceQueJeSais,
      oublierDates: oublierDates
    };
  }

  var api = { creer: creer };
  racine.THFaits = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
