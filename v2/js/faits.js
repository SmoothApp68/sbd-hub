// v2/js/faits.js — le module des faits (58-1, « un seul fil »).
//
// Les FAITS que les écrans lisent — et que le jeu lira — assemblés à UN
// endroit : les séances avec leurs séries, celles d'un exercice, les records
// d'une séance, d'un mois, de la séance en cours, le dernier record, la
// semaine affichée, les exercices faits et leur date — et, depuis 60-2a, ce que
// les séances savent de la personne (`ceQueJeSais`), que le questionnaire du coach
// MONTRE au lieu de le demander ; depuis 60-3, les faits du programme déduit
// (`programmeDeduit`) ; depuis 60-4, l'historique du programme construit
// (`historiqueDesExercices`) ; depuis 64A, les faits du jeu (`faitsDuJeu`) ; depuis 66A, le fait des
// barres du bilan (`barresDuBilan`), que « Le coach relit ta semaine » lit ; depuis 66C, les habitudes (`habitudes`),
// que le générateur v2 complète. Ils vivaient dans
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

    // ── Le programme déduit (60-3, QUESTIONNAIRE-COACH-V2 §5) ────────────────
    //
    // Les séances qui reviennent : la RÈGLE vit dans `routines.js`
    // (`seancesQuiReviennent`) ; ce module lui assemble ses faits — les séances
    // avec leurs séries (`seancesAvecSeries`, le même groupement que le bilan,
    // AVEC SON MÉMO : une correction qui garde le nombre de séances et de séries
    // n'y entre qu'au prochain chargement, comme pour le bilan), leur titre (lu
    // à chaque appel), et la mesure du catalogue de chaque exercice. La règle
    // elle-même n'a pas de mémo : la feuille la lit une fois, à l'ouverture.
    function programmeDeduit(c) {
      var index = c.catalogue() || {}, mesures = {}, titres = {};
      Object.keys(index).forEach(function (slug) { mesures[slug] = index[slug] ? index[slug].mesure || null : null; });
      (c.seances || []).forEach(function (s) { if (s && s.id) titres[s.id] = s.titre === undefined ? null : s.titre; });
      var seances = seancesAvecSeries(c).map(function (s) {
        return { id: s.id, debut: s.debut, titre: titres[s.id] === undefined ? null : titres[s.id], series: s.series };
      });
      return racine.THRoutines.seancesQuiReviennent(seances, mesures);
    }

    // ── La dernière séance de la personne (66D, QUESTIONNAIRE-COACH-V2 §5 quater.5) ──
    //
    // Le début de sa séance datée la plus récente (`seancesAvecSeries`, avec son mémo) : là où finit SA
    // fenêtre (`Routines.fenetreDeLaPersonne`), celle de l'historique des exercices et des habitudes — et, pour
    // « Construis-le-moi », la semaine jusqu'à laquelle le fait du coach se lit. `null` sans séance datée.
    function seancesDatees(c) {
      return seancesAvecSeries(c).filter(function (s) { return s && s.debut && !isNaN(new Date(s.debut).getTime()); });
    }
    function derniereSeance(c) {
      var datees = seancesDatees(c);
      if (!datees.length) return null;
      return datees.reduce(function (m, s) { return new Date(s.debut) > new Date(m) ? s.debut : m; }, datees[0].debut);
    }

    // ── L'historique du programme construit (60-4, QUESTIONNAIRE-COACH-V2 §5 bis) ──
    //
    // Par exercice, le nombre de SÉANCES où il a au moins une série de travail, sur la fenêtre de la personne : les
    // 84 jours qui finissent à SA dernière séance (`Routines.fenetreDeLaPersonne`, la même que le programme déduit —
    // jamais « aujourd'hui »). Le générateur (`Generateur.generer`) en tire l'ordre de ses candidats : le plus fait
    // d'abord, et un exercice déjà fait n'est jamais rétrogradé par le matériel. Les séances sont celles du bilan
    // (`seancesAvecSeries`, avec son mémo) ; la série de travail, la définition unique (`Modele.estTravail`).
    function historiqueDesExercices(c) {
      var datees = seancesDatees(c);
      if (!datees.length) return {};
      var fenetre = racine.THRoutines.fenetreDeLaPersonne(derniereSeance(c));
      var compte = {};
      datees.forEach(function (s) {
        if (!Periode.dans(s.debut, fenetre)) return;
        var vus = {};
        (s.series || []).forEach(function (x) {
          if (!x || !x.exercise_slug || vus[x.exercise_slug] || !Modele.estTravail(x)) return;
          vus[x.exercise_slug] = true;
          compte[x.exercise_slug] = (compte[x.exercise_slug] || 0) + 1;
        });
      });
      return compte;
    }

    // ── Les habitudes (66C, QUESTIONNAIRE-COACH-V2 §5 quater.2) ──
    //
    // Sur la fenêtre du programme déduit (`Routines.fenetreDeLaPersonne` : les 84 jours qui finissent à la DERNIÈRE
    // séance, jamais « aujourd'hui »). Une séance COMPTE si elle a la signature du programme déduit
    // (`Routines.signatureDeSeance`, lue au même endroit, jamais recopiée). Les séries comptées ensuite : la série de
    // travail (`Modele.estTravail`) ; les sorties (le cardio du jeu) jamais.
    //   · `seances_par_semaine` : la médiane, sur les semaines (lundi → dimanche, heure locale) qui ont au moins une
    //     séance comptée, du nombre de séances comptées ;
    //   · `taille_de_seance` : la médiane du nombre de séries de travail par séance comptée ;
    //   · `reps[slug]` : la médiane des reps (plus de 0) de ses séries de travail ;
    //   · `series[slug]` : la médiane, sur les séances comptées où il a une série de travail, de leur nombre.
    // La médiane : `Moteur.mediane`, arrondie comme le programme déduit (`Routines.arrondiDeduit`, .5 vers le haut).
    // `null` sans séance comptée. Convention de l'app (K) : aucune donnée publiée ne définit « habituel ».
    function habitudes(c) {
      var Routines = racine.THRoutines;
      var index = c.catalogue() || {}, mesures = {};
      Object.keys(index).forEach(function (slug) { mesures[slug] = index[slug] ? index[slug].mesure || null : null; });
      var datees = seancesDatees(c);
      if (!datees.length) return null;
      var fenetre = Routines.fenetreDeLaPersonne(derniereSeance(c));
      var comptees = datees.filter(function (s) {
        return Periode.dans(s.debut, fenetre) && Routines.signatureDeSeance(s, mesures) !== null;
      });
      if (!comptees.length) return null;
      var mediane = function (v) { return Routines.arrondiDeduit(Moteur.mediane(v)); };
      var parSemaine = {}, tailles = [], reps = {}, series = {};
      comptees.forEach(function (s) {
        var lundi = Semaine.bornesSemaine(s.debut).lundi.getTime();
        parSemaine[lundi] = (parSemaine[lundi] || 0) + 1;
        var n = 0, parExo = {};
        (s.series || []).forEach(function (x) {
          if (!x || !x.exercise_slug || !Modele.estTravail(x)) return;
          var f = index[x.exercise_slug];
          if (Modele.estExerciceSortie(f) && !Semaine.porteDuVolume(f)) return;
          n++;
          parExo[x.exercise_slug] = (parExo[x.exercise_slug] || 0) + 1;
          var r = x.reps === null || x.reps === undefined || x.reps === '' ? NaN : Number(x.reps);
          if (isFinite(r) && r > 0) (reps[x.exercise_slug] || (reps[x.exercise_slug] = [])).push(r);
        });
        tailles.push(n);
        Object.keys(parExo).forEach(function (slug) { (series[slug] || (series[slug] = [])).push(parExo[slug]); });
      });
      var medianes = function (o) {
        var sortie = {};
        Object.keys(o).sort().forEach(function (slug) { sortie[slug] = mediane(o[slug]); });
        return sortie;
      };
      return {
        seances_par_semaine: mediane(Object.keys(parSemaine).map(function (k) { return parSemaine[k]; })),
        taille_de_seance: mediane(tailles),
        reps: medianes(reps),
        series: medianes(series)
      };
    }

    // ── 60-4 — Les séances faites depuis les routines d'un dossier (la carte « Passer en cycles », MOTEUR §9.22) ──
    //
    // Le nombre de séances TERMINÉES, commencées à partir de `depuis` (la date de création du programme), qui portent
    // l'une des routines de `idsRoutines` (`routine_id`) et au moins une série de travail. Le dossier n'est pas dans la
    // séance : l'appartenance se lit sur les routines d'AUJOURD'HUI (supprimer une routine fait perdre le lien à ses
    // séances, `ON DELETE SET NULL`). Sans date lisible ou sans routine, zéro.
    function seancesDesRoutines(c, idsRoutines, depuis) {
      var ids = {};
      (idsRoutines || []).forEach(function (id) { if (id) ids[id] = true; });
      // `new Date(null)` est le 1ᵉʳ janvier 1970 : une date absente ne veut pas dire « depuis toujours ».
      var t0 = depuis === null || depuis === undefined || depuis === '' ? NaN : new Date(depuis).getTime();
      if (isNaN(t0)) return 0;
      return (c.seances || []).filter(function (s) {
        if (!s || !s.routine_id || !ids[s.routine_id] || !s.debut) return false;
        if (new Date(s.debut).getTime() < t0) return false;
        return (c.seriesDe(s.id) || []).some(function (x) { return Modele.estTravail(x); });
      }).length;
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

    // ── Les faits du jeu (64A, JEU-V1 §8) ───────────────────────────────────
    //
    // L'entrée de `THJeu.etatDuJeu`, assemblée avec ce que ce module sait déjà :
    // les séances terminées (`{ id, debut }`), leurs séries — SEULEMENT celles
    // des séances de `c.seances` (le cache peut porter les séries d'une séance
    // en cours ou orpheline ; `seriesDe` et les exercices faits filtrent déjà
    // ainsi) —, le catalogue, le journal des records, les maximums des barres
    // (`ceQueJeSais`) et le compte des exercices faits.
    //
    // ⚠️ UN SEUL FIL : les faits nourrissent le jeu, ils ne le lisent pas — ce
    // module n'appelle pas le jeu. Les barres des caps ronds sont nommées ICI,
    // une fois (JEU-V1 §5) ; le jeu traite les maximums qu'il reçoit.
    //
    // ── LA SÉANCE EN COURS (64B, JEU-V1 §8, la feuille « Terminer ») ──
    // `enCours = { seance, ligne, lignes }` : le brouillon, sa ligne de séance
    // terminée et ses séries AU FORMAT DES LIGNES ÉCRITES (`Seance.ligneSession`,
    // `Seance.lignes`, calculés par l'écran — aucun convertisseur ici). L'entrée
    // est alors celle qu'on aurait si la séance était terminée : la séance
    // remplace sa copie éventuelle du cache, ses séries remplacent celles que le
    // cache porterait déjà (jamais deux fois), le journal reçoit ses records
    // (`journalDuJour`, ceux que la feuille affiche). Les maximums et les
    // exercices faits se calculent sur un corpus qui l'INCLUT, par une INSTANCE À
    // PART (`creer()`) : les mémos de celle-ci (clé « séances | séries »,
    // `datesExercices` à oubli explicite) ne voient jamais ce corpus-là. Rien
    // n'est écrit. Sans `enCours`, rien ne change.
    var BARRES_DU_JEU = ['developpe_couche_barre', 'squat_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre'];
    function corpusAvecLaSeance(c, enCours) {
      var id = enCours.seance.id;
      return {
        seances: [enCours.ligne].concat((c.seances || []).filter(function (s) { return s && s.id !== id; })),
        series: (c.series || []).filter(function (x) { return x && x.session_id !== id; }).concat(enCours.lignes),
        exercices: c.exercices,
        seriesDe: function (sid) { return sid === id ? enCours.lignes : c.seriesDe(sid); },
        catalogue: c.catalogue,
        journal: c.journal
      };
    }
    function faitsDuJeu(c, aujourdhui, enCours) {
      var ici = enCours && enCours.seance ? enCours : null;
      var idIci = ici ? ici.seance.id : null;
      var seances = (c.seances || []).filter(function (s) { return s && (!ici || s.id !== idIci); })
        .map(function (s) { return { id: s.id, debut: s.debut }; });
      if (ici) seances.push({ id: idIci, debut: ici.seance.debut });
      var ids = {};
      seances.forEach(function (s) { ids[s.id] = true; });
      var series = (c.series || []).filter(function (x) {
        return x && (!ici || x.session_id !== idIci) && Object.prototype.hasOwnProperty.call(ids, x.session_id);
      });
      var journal = recordsDuJournal(c);
      var avec = null;
      if (ici) {
        series = series.concat(ici.lignes || []);
        journal = journal.concat(journalDuJour(c, ici.seance, null));
        var corpus = corpusAvecLaSeance(c, ici), aPart = creer();
        avec = { maximums: aPart.ceQueJeSais(corpus, aujourdhui, BARRES_DU_JEU).maximums,
                 exercicesFaits: aPart.compterExercices(corpus).faits };
      }
      return {
        aujourdhui: aujourdhui,
        seances: seances,
        series: series,
        catalogue: c.catalogue(),
        journal: journal,
        maximums: avec ? avec.maximums : ceQueJeSais(c, aujourdhui, BARRES_DU_JEU).maximums,
        exercicesFaits: avec ? avec.exercicesFaits : compterExercices(c).faits
      };
    }

    // ── Le fait des barres du bilan (66A, QUESTIONNAIRE-COACH-V2 §5 ter.2) ──
    //
    // Ce que « Le coach relit ta semaine » montre de chacune des quatre barres,
    // dans l'ordre de la spec. Une barre n'y est que si elle a au moins une
    // série de travail (`Modele.estTravail`) :
    //
    //   · `record` : `{ charge, date }` — `Modele.recordsDeLExercice(...).lourde`,
    //     comme « Ce que je sais » et la page de l'exercice (jamais un estimé) ;
    //     `date` : le jour local `AAAA-MM-JJ` de sa séance ;
    //   · `recent` : la meilleure série de travail des 28 derniers jours (la plus
    //     lourde, puis le plus de reps, puis la plus récente ; au moins 1 rep),
    //     `{ charge, reps, date }`, ou `null` ;
    //   · `semaines` : les semaines (lundi → dimanche, heure locale) des 26
    //     dernières semaines qui ont une série de travail de la barre — de 0 à 26 ;
    //   · `lourdes` : ses séries de travail de 1 à 6 reps sur ces 26 semaines ;
    //   · `variantes` : les séries de travail, sur ces 26 semaines, des variantes
    //     À LA BARRE — même `mouvement`, `equipement = 'barre'`, autre exercice :
    //     ses frères (`Modele.freresDe`) à la barre.
    //
    // « Les 28 derniers jours » : `Periode.fenetres(28, aujourdhui).courante`, du
    // minuit d'il y a 27 jours à la fin d'aujourd'hui (aujourd'hui compris).
    // « Les 26 dernières semaines » (66A bis, décidé le 10/10/2026) : du lundi
    // d'il y a 25 semaines (`Semaine.decalerSemaine` du lundi de la semaine
    // d'aujourd'hui) à la même fin — 26 semaines du calendrier, jamais 27 : une
    // fenêtre de 182 jours en touchait 27, sauf un dimanche. `semaines`,
    // `lourdes` et `variantes` la lisent toutes les trois.
    // `aujourdhui` : passé (jamais l'horloge).
    var BARRES_DU_BILAN = ['squat_barre', 'developpe_couche_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre'];
    var JOURS_RECENTS = 28, SEMAINES_DU_BILAN = 26, REPS_LOURDES_MAX = 6;
    function barresDuBilan(c, aujourdhui) {
      var index = c.catalogue() || {};
      var recente = Periode.fenetres(JOURS_RECENTS, aujourdhui).courante;
      var bilan = { debut: Semaine.decalerSemaine(Semaine.bornesSemaine(aujourdhui).lundi, 1 - SEMAINES_DU_BILAN).lundi,
                    fin: recente.fin };
      // Les séries de travail d'un exercice, chacune avec le début de sa séance.
      var travailDe = function (slug) {
        var out = [];
        seancesDuSlug(c, slug).forEach(function (s) {
          s.series.forEach(function (x) { if (Modele.estTravail(x)) out.push({ serie: x, debut: s.debut }); });
        });
        return out;
      };
      var nombre = function (x, champ) {
        var v = x[champ];
        return v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v);
      };
      var sortie = {};
      BARRES_DU_BILAN.forEach(function (slug) {
        var siennes = travailDe(slug);
        if (!siennes.length) return;

        var lourde = Modele.recordsDeLExercice(seancesDuSlug(c, slug), aujourdhui, Modele.optionsDeRecord(index[slug] || null)).lourde;
        var record = lourde && lourde.charge !== null && lourde.charge > 0
          ? { charge: lourde.charge, date: Moteur.jourCivil(lourde.date) } : null;

        var recent = null;
        siennes.forEach(function (t) {
          if (!Periode.dans(t.debut, recente)) return;
          var charge = nombre(t.serie, 'charge_kg'), reps = nombre(t.serie, 'reps');
          if (charge === null || reps === null || reps < 1) return;
          if (!recent || charge > recent.charge || (charge === recent.charge && (reps > recent.reps ||
              (reps === recent.reps && new Date(t.debut) > new Date(recent.debut))))) {
            recent = { charge: charge, reps: reps, debut: t.debut };
          }
        });

        var semaines = {}, lourdes = 0;
        siennes.forEach(function (t) {
          if (!Periode.dans(t.debut, bilan)) return;
          semaines[Semaine.bornesSemaine(t.debut).lundi.getTime()] = true;
          var reps = nombre(t.serie, 'reps');
          if (reps !== null && reps >= 1 && reps <= REPS_LOURDES_MAX) lourdes++;
        });

        // Les variantes à la barre : ses frères (`Modele.freresDe`, la seule lecture de `mouvement`) à la barre.
        var variantes = 0;
        Modele.freresDe(index, slug).forEach(function (autre) {
          if (!index[autre] || index[autre].equipement !== 'barre') return;
          travailDe(autre).forEach(function (t) { if (Periode.dans(t.debut, bilan)) variantes++; });
        });

        sortie[slug] = {
          record: record,
          recent: recent ? { charge: recent.charge, reps: recent.reps, date: Moteur.jourCivil(recent.debut) } : null,
          semaines: Object.keys(semaines).length,
          lourdes: lourdes,
          variantes: variantes
        };
      });
      return sortie;
    }

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
      programmeDeduit: programmeDeduit,
      historiqueDesExercices: historiqueDesExercices,
      habitudes: habitudes,
      derniereSeance: derniereSeance,
      seancesDesRoutines: seancesDesRoutines,
      oublierDates: oublierDates,
      faitsDuJeu: faitsDuJeu,
      BARRES_DU_JEU: BARRES_DU_JEU,
      barresDuBilan: barresDuBilan,
      BARRES_DU_BILAN: BARRES_DU_BILAN
    };
  }

  var api = { creer: creer };
  racine.THFaits = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
