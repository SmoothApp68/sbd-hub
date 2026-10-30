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
// que le générateur v2 complète ; depuis 75, « Ton parcours » (`entreeDuParcours`, `parcoursDe`),
// que Progression lit ; depuis 95, les bilans de période (`entreeDuBilan`, `bilanDePeriode`, `faitsDuJeuDeLaPeriode`),
// que « Ton année » lit ; depuis 126, les faits de la recherche d'exercice (`seancesParExercice`,
// `exercicesDeLaRoutine`, `exercicesRecents`), que le catalogue lit. Ils vivaient dans
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

    // 89 (SOCIAL-V1 « Étage 2 ») — MES SÉRIES COMPTÉES, la forme des fonctions sociales de la base (v2_079) :
    // `{ session_id, debut, exercise_slug, charge_kg, reps }`, séries `travail`, charge > 0, reps > 0 (la règle de
    // `Bilan.volumeKg`). `de`, `a` : des jours civils `AAAA-MM-JJ` inclus, ou null ; `slug` : un exercice, ou null.
    // Le social compare mes chiffres à ceux d'un ami avec les MÊMES fonctions (`social.js`) : la règle est ici, une fois.
    function seriesComptees(c, de, a, slug) {
      var out = [];
      seancesAvecSeries(c).forEach(function (s) {
        var j = s.debut ? Moteur.jourCivil(new Date(s.debut)) : null;
        if (!j || (de && j < de) || (a && j > a)) return;
        s.series.forEach(function (x) {
          if (!x || (slug && x.exercise_slug !== slug) || !Modele.estTravail(x)) return;
          var ch = Number(x.charge_kg), r = Number(x.reps);
          if (!(ch > 0) || !(r > 0)) return;
          out.push({ session_id: s.id, debut: s.debut, exercise_slug: x.exercise_slug, charge_kg: ch, reps: r });
        });
      });
      return out;
    }

    // ── 90 (SOCIAL-V1 « Guilde ») — LES NOMBRES DE MA GUILDE, calculés ici, publiés tels quels (`guilde_scores`) ──
    //
    // LE RECORD QUI COMPTE (décision du 14/10/2026) : une ligne du journal (`recordsDuJournal`) d'un des six types
    // `TYPES_DE_LA_GUILDE` — jamais `un_rm_estime` (une estimation). 22/10/2026 : `volume_seance` COMPTE, comme les autres
    // (décision d'Aurélien, revient sur l'exclusion du 14/10 : rare, un fait, sans jugement) ; une
    // série « à fond » compte, c'est un fait. Sa série (celle qui porte la médaille de volume) :
    //   · sans pari de consigne relié par `set_observe` (séance importée, série sans proposition) : elle COMPTE —
    //     sans consigne, il n'y a rien à dépasser ;
    //   · avec un pari relié : le pari de la plus haute révision ; elle compte à la charge proposée ou en dessous
    //     (au centième) ; une proposition sans chiffre (« le cran au-dessus », `fondement.charge` nul) : elle compte
    //     (la règle « suivie » de MOTEUR §12 : toute charge au-dessus du palier) ; une série sans charge : elle compte.
    // Un record se compte par SÉRIE (une médaille par série, comme le fil). `paris` : les paris connus (`predictions`).
    var TYPES_DE_LA_GUILDE = ['charge_a_reps', 'reps_a_charge', 'charge_max', 'cap', 'volume_seance', 'duree_s', 'distance_m',
                              'allure', 'marche', 'denivele_m', 'etages'];
    function recordsSansDepasser(c, paris, de, a) {
      var series = {}, parSerie = {};
      seancesAvecSeries(c).forEach(function (s) { s.series.forEach(function (x) { if (x && x.id) series[x.id] = x; }); });
      (paris || []).forEach(function (p) {
        // 109 (MOTEUR §9.25) — un pari d'objectif n'est pas une proposition de charge : il ne compte pas ici.
        if (!p || !p.set_observe || !p.exercise_slug || p.module === Moteur.MODULE_ESCALIER ||
            p.module === Moteur.MODULE_OBJECTIF || !p.fondement) return;
        var d = parSerie[p.set_observe];
        if (!d || (Number(p.fondement.revision) || 0) > (Number(d.fondement.revision) || 0)) parSerie[p.set_observe] = p;
      });
      var vus = {}, out = [];
      recordsDuJournal(c).forEach(function (l) {
        if (TYPES_DE_LA_GUILDE.indexOf(l.type) < 0 || !l.set_id || vus[l.set_id]) return;
        var j = l.battu_le ? Moteur.jourCivil(new Date(l.battu_le)) : null;
        if (!j || (de && j < de) || (a && j > a)) return;
        var pari = parSerie[l.set_id], serie = series[l.set_id];
        var propose = pari && pari.fondement.charge !== null && pari.fondement.charge !== undefined ? Number(pari.fondement.charge) : null;
        var faite = serie && serie.charge_kg !== null && serie.charge_kg !== undefined ? Number(serie.charge_kg) : null;
        if (pari && propose !== null && isFinite(propose) && faite !== null && isFinite(faite) &&
          Math.round(faite * 100) > Math.round(propose * 100)) return;
        vus[l.set_id] = true;
        out.push({ set_id: l.set_id, session_id: l.session_id, exercise_slug: l.exercise_slug, jour: j });
      });
      return out;
    }

    // Mes nombres de la semaine et du mois en cours, la forme de `guilde_scores` (v2_080) :
    //   · `seances` : mes séances de la semaine (lundi → dimanche, heure locale) qui portent une série de musculation
    //     (121, suite du 119 : `Semaine.estSerieDeMusculation` — ni une randonnée, ni un tapis seul) ;
    //   · `prevues` : `profiles.seances_par_semaine` (`declarees`), sinon la médiane de l'historique — `habitudes`, la
    //     fonction du programme déduit, jamais recopiée ; 0 sans rien ;
    //   · `records_semaine` : mes séries médaillées sans dépasser la charge proposée, dans la semaine ;
    //   · `exercices` : les exercices faits dans au moins 2 séances du mois (séries de musculation, 121) ; `exercices_record` :
    //     ceux d'entre eux qui ont au moins un record sans dépasser la charge proposée dans le mois ;
    //   · 120 (D3, décision du 16/10/2026) — `series_semaine` : mes séries de MUSCULATION de la semaine
    //     (`Semaine.estSerieDeMusculation`, la règle du compte des séries de travail, 119 : ni le tapis, ni la
    //     randonnée) ; `series_moyenne` : leur moyenne sur les 4 semaines pleines d'AVANT (lundi → dimanche, heure
    //     locale), au centième. « CE QUI EXISTE » : seulement les semaines depuis celle de ma première série de
    //     musculation — une semaine sans séance après elle compte 0, une semaine d'avant mon premier pas ne compte pas
    //     (elle n'est pas un 0, je n'étais pas là) ; sans aucune semaine d'avant, 0 (je n'ajoute rien à l'objectif).
    //     La guilde additionne (`guilde_semaine`, v2_093) : sa cible est la somme de nos moyennes.
    var SEMAINES_DU_DEFI = 4;
    function scoresDeGuilde(c, paris, declarees, maintenant) {
      var m = maintenant || new Date();
      var b = Semaine.bornesSemaine(m);
      var lundi = Moteur.jourCivil(b.lundi), dimanche = Moteur.jourCivil(b.dimanche);
      var premier = Moteur.jourCivil(new Date(m.getFullYear(), m.getMonth(), 1));
      var dernier = Moteur.jourCivil(new Date(m.getFullYear(), m.getMonth() + 1, 0));
      var index = (c.catalogue && c.catalogue()) || {};
      var lundiDe = function (j) { var x = Semaine.bornesSemaine(new Date(j + 'T12:00:00')); return x ? Moteur.jourCivil(x.lundi) : null; };
      var avant = [];
      for (var k = 1; k <= SEMAINES_DU_DEFI; k++) {
        avant.push(Moteur.jourCivil(new Date(b.lundi.getFullYear(), b.lundi.getMonth(), b.lundi.getDate() - 7 * k)));
      }
      var seances = 0, parExo = {}, seriesParSemaine = {}, premierLundi = null;
      seancesAvecSeries(c).forEach(function (s) {
        var j = s.debut ? Moteur.jourCivil(new Date(s.debut)) : null;
        if (!j) return;
        // 121 (suite du 119, audit du 16/10/2026) — les séances et les exercices du mois sont ceux de la
        // MUSCULATION, comme les séries : une randonnée, un tapis seul ne font ni une séance de la guilde ni un
        // exercice de sa Progression (`Semaine.estSerieDeMusculation`, une seule règle).
        var muscu = s.series.filter(function (x) { return x && x.exercise_slug && Semaine.estSerieDeMusculation(x, index[x.exercise_slug]); });
        if (!muscu.length) return;
        var l = lundiDe(j);
        if (l && l <= lundi) {
          seriesParSemaine[l] = (seriesParSemaine[l] || 0) + muscu.length;
          if (premierLundi === null || l < premierLundi) premierLundi = l;
        }
        if (j >= lundi && j <= dimanche) seances++;
        if (j >= premier && j <= dernier) {
          muscu.forEach(function (x) { (parExo[x.exercise_slug] = parExo[x.exercise_slug] || {})[s.id] = true; });
        }
      });
      var d = Number(declarees);
      var prevues = Number.isInteger(d) && d >= 1 && d <= 14 ? d : null;
      if (prevues === null) { var h = habitudes(c); prevues = h && h.seances_par_semaine ? Math.min(14, Math.round(h.seances_par_semaine)) : 0; }
      var duMois = recordsSansDepasser(c, paris, premier, dernier);
      var avecRecord = {};
      duMois.forEach(function (r) { avecRecord[r.exercise_slug] = true; });
      var exercices = Object.keys(parExo).filter(function (k) { return Object.keys(parExo[k]).length >= 2; });
      var comptees = avant.filter(function (l) { return premierLundi !== null && l >= premierLundi; });
      var moyenne = comptees.length
        ? Math.round(comptees.reduce(function (t, l) { return t + (seriesParSemaine[l] || 0); }, 0) / comptees.length * 100) / 100
        : 0;
      return {
        semaine: lundi, seances: seances, prevues: prevues,
        series_semaine: seriesParSemaine[lundi] || 0, series_moyenne: moyenne,
        records_semaine: duMois.filter(function (r) { return r.jour >= lundi && r.jour <= dimanche; }).length +
          (lundi < premier ? recordsSansDepasser(c, paris, lundi, Moteur.jourCivil(new Date(m.getFullYear(), m.getMonth(), 0))).length : 0),
        mois: premier, exercices: exercices.length,
        exercices_record: exercices.filter(function (k) { return avecRecord[k]; }).length
      };
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

    // 149 (MOTEUR §9.17 ter) — LES TENUES MAX D'UNE FIGURE : pour chaque séance faite qui porte l'exercice, sa meilleure
    // tenue de TRAVAIL (la plus longue `duree_s` d'une série de travail) — « le max de la dernière fois » du coach et la
    // matière de la carte « marche suivante » en secondes. Rend `[{ seance, debut, max }]`, de la plus ancienne à la plus
    // récente ; une séance sans tenue de travail chiffrée n'y est pas. La séance en cours n'y est pas (le cache ne la
    // porte qu'une fois terminée). Un fait : rien n'est formaté ni jugé ici.
    function tenuesDeLExercice(c, slug) {
      var out = [];
      seancesDeLExercice(c, slug).forEach(function (g) {
        var max = null;
        g.series.forEach(function (x) {
          if (!x || !Modele.estTravail(x)) return;
          var d = Number(x.duree_s);
          if (x.duree_s !== null && x.duree_s !== undefined && isFinite(d) && d > 0 && (max === null || d > max)) max = d;
        });
        if (max !== null) out.push({ seance: g.seance.id, debut: g.seance.debut, max: max });
      });
      return out.reverse();
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
        var r = Modele.recordsBattus(seancesDuSlug(c, x.exercise_slug), se, k, optionsDesRecords(c, x.exercise_slug));
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

    // 153 (B) — les options des records d'un exercice : son matériel (la fenêtre), et de quoi lire une MARCHE (le
    // catalogue, et — à la demande seulement — toutes les séances d'avant, tous exercices : une seule lecture par
    // corpus). `Modele.recordsBattus` filtre sur la date de la série.
    var memoToutes = { cle: null, liste: null };
    function toutesLesSeancesPourMarche(c) {
      var cle = (c.seances || []).length + '|' + (c.series || []).length;
      if (memoToutes.cle !== cle) {
        memoToutes = { cle: cle, liste: seancesAvecSeries(c).map(function (s) { return { id: s.id, debut: s.debut, series: s.series }; }) };
      }
      return memoToutes.liste;
    }
    function optionsDesRecords(c, slug) {
      var index = c.catalogue();
      return Object.assign({}, Modele.optionsDeRecord(index[slug] || null),
        { marche: { index: index, passees: function () { return toutesLesSeancesPourMarche(c); } } });
    }
    function nomCompletDuCatalogue(c) {
      var index = c.catalogue();
      return function (slug) { return index[slug] ? index[slug].nom : slug; };
    }

    function recordsDeLaSerie(c, seance, iExo, iSerie, lue) {
      var v = lue || seanceDesRecords(seance);
      var k = v.positions[iExo + ':' + iSerie];
      if (k === undefined) return [];
      var slug = v.series[k].exercise_slug;
      return Modele.recordsBattus(historiqueDesRecords(c, seance, slug), v, k, optionsDesRecords(c, slug));
    }

    // Les records du jour : une ligne par série médaillée, « Développé couché
    // 130 kg × 4 ». 71 — `options.avecPhrase` : la phrase de la médaille
    // (`Modele.phraseDeRecord` : `[gras, gris]`, le gris disant l'ancien record
    // et sa date), pour le récap de fin de séance. Sans l'option, la forme est
    // celle d'avant, octet pour octet.
    function recordsDuJour(c, seance, options) {
      if (!seance) return [];
      var avecPhrase = !!(options && options.avecPhrase);
      var v = seanceDesRecords(seance), index = c.catalogue(), out = [];
      seance.exercices.forEach(function (exo, i) {
        (exo.series || []).forEach(function (s, j) {
          var r = recordsDeLaSerie(c, seance, i, j, v);
          if (!r.length) return;
          var nom = Modele.nomCourt(index[exo.exercise_slug] ? index[exo.exercise_slug].nom : exo.exercise_slug);
          var ligne = { nom: nom.charAt(0).toUpperCase() + nom.slice(1), mesure: Modele.formatMesure(s) };
          if (avecPhrase) ligne.phrase = Modele.phraseDeRecord(r, nom, seance.debut, nomCompletDuCatalogue(c));
          out.push(ligne);
        });
      });
      return out;
    }

    // ══ LE RÉCAP DE FIN DE SÉANCE (71, ECRAN-SAISIE §7 septies.4 bis) ════════
    //
    // ⚠️ IL CÂBLE, IL NE RECOPIE RIEN. Chaque chiffre vient de la fonction qui
    // le dit ailleurs : les séries de travail (`Seance.compter`, celle du
    // bandeau et de la feuille), le volume (`Bilan.volumeKg`, celle du bilan du
    // mois), les séries par muscle (`Semaine.volumeParMuscle`, celle du bloc
    // Volume), les records (`recordsDuJour`, celle de la médaille), les paris
    // (`Bilan.compterParis` et `Bilan.phraseParis`, celles du bilan du mois),
    // la comparaison (`Bilan.phraseComparaison`). Il n'écrit rien.
    //   `seance` : la séance terminée (le modèle de l'app) ;
    //   `paris`  : `[{ seance, exercice, predite, observee }]` — les paris de
    //              consigne connus (`app.js` `parisDeConsigneConnus`).
    var MUSCLES_DU_RECAP = 5;
    function recapDeLaSeance(c, seance, paris) {
      if (!seance) return null;
      var exercices = c.exercices || [];
      var faites = Seance.toutesLesSeries(seance).filter(function (p) { return Seance.partEnBase(p.serie); })
        .map(function (p) { return Object.assign({}, p.serie, { exercise_slug: p.exo.exercise_slug }); });
      var parSlug = {}, ordre = [];
      faites.forEach(function (x) {
        if (!parSlug[x.exercise_slug]) { parSlug[x.exercise_slug] = []; ordre.push(x.exercise_slug); }
        parSlug[x.exercise_slug].push(x);
      });
      // 119 (F9) — la tuile « exercices » : les exercices de musculation (une définition par usage, au registre).
      var exosFaits = Semaine.exercicesDeMusculation(faites, exercices);
      var volume = Bilan.volumeKg(faites);
      var muscles = Semaine.volumeParMuscle(faites, exercices);
      var reste = muscles.slice(MUSCLES_DU_RECAP);
      var debut = Date.parse(seance.debut), fin = Date.parse(seance.fin);
      var index = c.catalogue();
      var nomDe = function (slug) {
        var n = Modele.nomCourt(index[slug] ? index[slug].nom : slug);
        return n.charAt(0).toUpperCase() + n.slice(1);
      };
      // Les paris de CETTE séance, et la phrase aux chiffres tels quels.
      var siens = (paris || []).filter(function (q) { return q && q.seance === seance.id; });
      var comptes = Bilan.compterParis(siens);
      var lignesParis = [];
      if (comptes.verifies) {
        ordre.forEach(function (slug) {
          var verifies = siens.filter(function (q) {
            return q.exercice === slug && q.observee !== null && q.observee !== undefined &&
              isFinite(Number(q.observee)) && isFinite(Number(q.predite));
          });
          if (!verifies.length) return;
          var vises = [];
          verifies.forEach(function (q) {
            if (!Bilan.estTenu(q) && vises.indexOf(Number(q.predite)) < 0) vises.push(Number(q.predite));
          });
          lignesParis.push({ slug: slug, nom: nomDe(slug), fait: faitDeLExercice(parSlug[slug]),
                             vise: vises.length ? vises.map(String).join(', ') : null });
        });
      }
      return {
        id: seance.id,
        titre: seance.titre || null,
        debut: seance.debut,
        fin: seance.fin || null,
        duree_min: isNaN(debut) || isNaN(fin) || fin < debut ? null : Math.round((fin - debut) / 60000),
        series: Seance.compter(seance, exercices).travail,
        volume_kg: volume,
        volume_texte: Bilan.tonnesDuRecap(volume),
        exercices: exosFaits.length,
        phraseVolume: Bilan.phraseComparaison(volume, seance.id),
        muscles: {
          premiers: muscles.slice(0, MUSCLES_DU_RECAP).map(function (m) { return { libelle: m.libelle, series: m.series }; }),
          autres: reste.length ? { n: reste.length,
            series: Math.round(reste.reduce(function (t, m) { return t + m.series; }, 0) * 100) / 100 } : null
        },
        // 119 (E12) — le cardio et les sorties (des séries de travail qui ne sont pas de la musculation) : ce qui a été
        // fait, dans sa mesure (`faitDeLExercice` → `Modele.formatMesure`).
        cardio: ordre.filter(function (slug) {
          return exosFaits.indexOf(slug) < 0 && parSlug[slug].some(function (x) { return Modele.estTravail(x); });
        }).map(function (slug) { return { slug: slug, nom: nomDe(slug), fait: faitDeLExercice(parSlug[slug]) }; }),
        records: recordsDuJour(c, seance, { avecPhrase: true }),
        paris: comptes.verifies ? {
          verifies: comptes.verifies, tenus: comptes.tenus,
          phrase: Bilan.phraseParis(comptes.verifies, comptes.tenus, { telsQuels: true }),
          lignes: lignesParis
        } : null,
        note: seance.note || null
      };
    }

    // Ce qui a été fait sur un exercice, ses séries de travail dans l'ordre :
    // « 90 kg × 10, 10, 10 » ; une charge qui change, « 32 kg × 12 · 36 kg × 10 » ;
    // sans charge, les reps (« 9, 9, 8, 7 ») ; une durée ou une distance, la
    // mesure de chaque série (`Modele.formatMesure`).
    // 133 (audit 130 #10, décidé le 21/10/2026) — une charge de 0 kg EST une charge, le poids du corps :
    // « poids du corps × 12, 12 », écrit par le formateur unique, comme le journal et la médaille (elle se disait
    // « 12, 12 » ici, « 0 kg × 12 » au journal).
    function faitDeLExercice(series) {
      var travail = (series || []).filter(function (x) { return Modele.estTravail(x); });
      var paquets = [];
      travail.forEach(function (x) {
        var aCharge = x.charge_kg !== null && x.charge_kg !== undefined && x.charge_kg !== '' && isFinite(Number(x.charge_kg));
        var aReps = x.reps !== null && x.reps !== undefined;
        // 132 (ECRAN-SAISIE §3 ter.6) — une série notée par nom se groupe par son élastique : « Noir × 12, 12 · Rouge × 10 ».
        var nom = x.elastique !== null && x.elastique !== undefined ? x.elastique : null;
        var cle = nom !== null && aReps ? 'e' + nom : aCharge && aReps ? 'c' + Number(x.charge_kg) : aReps ? 'r' : null;
        var dernier = paquets[paquets.length - 1];
        if (cle && dernier && dernier.cle === cle) { dernier.reps.push(x.reps); return; }
        paquets.push({ cle: cle, serie: x, reps: aReps ? [x.reps] : [] });
      });
      return paquets.map(function (p) {
        if (p.cle === 'r') return p.reps.join(', ');
        if (p.cle && p.cle.charAt(0) === 'e') return Modele.affichageElastique({ elastique: p.serie.elastique, reps: p.reps.join(', ') });
        if (p.cle) return Modele.formatMesure({ charge_kg: p.serie.charge_kg }) + ' \u00d7 ' + p.reps.join(', ');
        return Modele.formatMesure(p.serie);
      }).join(' \u00b7 ');
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
        palier_m: vide(r.palier_m),
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
    //
    // 120 (D1, audit du 16/10/2026) — « La force estimée reste, comme progression […] ; elle sort des records, des
    // médailles, du fil et de l'XP ; les records sont les vraies barres. » Les lignes `un_rm_estime` écrites avant
    // restent en base, immuables (`records_immuable`) : ELLES SONT IGNORÉES ICI, à la lecture — la seule, donc le jeu,
    // le récap de fin de séance et tout lecteur à venir ne les voient plus. `medaillesDuSocial` (le fil) aussi.
    var ORDRE_DES_TYPES = ['charge_a_reps', 'reps_a_charge', 'charge_max', 'cap',
                           'volume_seance', 'duree_s', 'distance_m', 'allure', 'denivele_m', 'etages', 'marche'];
    var TYPES_HORS_RECORDS = ['un_rm_estime'];
    function estUnRecord(l) { return !!l && TYPES_HORS_RECORDS.indexOf(l.type) < 0; }
    function recordsDuJournal(c, filtre) {
      var f = filtre || {};
      var instant = function (x) { var t = Date.parse(x); return isNaN(t) ? null : t; };
      var depuis = f.depuis ? instant(f.depuis) : null, jusqua = f.jusqua ? instant(f.jusqua) : null;
      return (c.journal || []).filter(function (l) {
        if (!estUnRecord(l)) return false;
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

    // ── Les médailles d'une séance d'une AUTRE personne (87, SOCIAL-V1) ─────
    //
    // `lignes` : ce que rend `social_records_seance` (le journal des records de
    // cette séance, colonnes autorisées : `set_id`, `battu_le`, `exercise_slug`,
    // `type`, `valeur`, `charge`, `reps`, `unite`). LA RÈGLE DE LA MÉDAILLE, ICI
    // AUSSI : une médaille par SÉRIE médaillée (comme `recordsDeLaSeance`), quel
    // que soit le nombre de ses records ; ses types dans l'ordre de la phrase
    // (`ORDRE_DES_TYPES`). Rien n'est recalculé : la mesure se relit sur la ligne
    // qui la porte (« 80 kg × 5 »), le nom sur le catalogue.
    function mesureDuRecord(ls) {
      var de = function (t) { return ls.filter(function (l) { return l.type === t; })[0] || null; };
      var l;
      if ((l = de('charge_a_reps'))) return { charge_kg: l.valeur, reps: l.reps };
      if ((l = de('reps_a_charge'))) return { charge_kg: l.charge, reps: l.valeur };
      if ((l = de('duree_s'))) return { duree_s: l.valeur };
      if ((l = de('distance_m'))) return { distance_m: l.valeur };
      if ((l = de('denivele_m'))) return { denivele_m: l.valeur };
      if ((l = de('etages'))) return { etages: l.valeur };
      if ((l = de('charge_max')) || (l = de('cap'))) return { charge_kg: l.valeur };
      return null;
    }
    function medaillesDuSocial(c, lignes) {
      var index = (c && c.catalogue && c.catalogue()) || {};
      var parSerie = {}, ordre = [];
      (lignes || []).forEach(function (l) {
        // 120 (D1) — une ligne `un_rm_estime` n'est pas un record : une série médaillée par elle seule n'a pas de
        // médaille (audit 05 #2 : « 1 record » dans le fil).
        if (!estUnRecord(l) || !l.set_id) return;
        if (!parSerie[l.set_id]) { parSerie[l.set_id] = []; ordre.push(l.set_id); }
        parSerie[l.set_id].push(l);
      });
      var instant = function (x) { var t = Date.parse(x); return isNaN(t) ? 0 : t; };
      return ordre.map(function (id, rang) {
        var ls = parSerie[id].slice().sort(function (a, b) {
          return ORDRE_DES_TYPES.indexOf(a.type) - ORDRE_DES_TYPES.indexOf(b.type);
        });
        var slug = ls[0].exercise_slug;
        var nom = Modele.nomCourt(index[slug] ? index[slug].nom : slug);
        var serie = mesureDuRecord(ls);
        return { serieId: id, slug: slug, battu_le: ls[0].battu_le || null, rang: rang,
                 nom: nom.charAt(0).toUpperCase() + nom.slice(1),
                 mesure: serie ? Modele.formatMesure(serie) : null,
                 types: ls.map(function (l) { return l.type; }) };
      }).sort(function (a, b) { return instant(a.battu_le) - instant(b.battu_le) || a.rang - b.rang; });
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

    // ── 145 (ECRAN-SAISIE §7 quater.7) — « Tes échelles cette semaine » ──────
    //
    // Les exercices D'ÉCHELLE (le catalogue : `Modele.echelleDe`) travaillés pendant la semaine qui commence à `lundi`
    // (lundi → dimanche, heure locale — comme `semaineDe`), leurs séries de travail (`Modele.estTravail`) de cette
    // semaine et de la semaine d'avant, et la MARCHE FRANCHIE : la première série de travail de la vie sur un rang plus
    // haut que tout ce qui précédait la semaine. Rend, l'échelle travaillée le plus récemment d'abord :
    //   `[{ echelle, derniere, exercices: { slug: { semaine: [séries], avant: [séries] } },
    //       nouvelle: { slug, ancienne: { slug, series } | null } | null }]`
    // `exercices` ne porte que les exercices travaillés cette semaine ; `nouvelle.ancienne.series` : les séries de
    // travail de la dernière séance de l'ancienne marche avant la semaine. Rien de la semaine sans exercice d'échelle :
    // `[]`. Une séance en cours n'y est pas. Le fait ne formate rien et ne juge rien : l'app écrit les meilleures séries
    // par le formateur unique, `Modele.vueEchellesDeLaSemaine` compose la carte.
    function echellesDeLaSemaine(c, lundi) {
      var b = Semaine.bornesSemaine(lundi);
      if (!b) return [];
      var avant = Semaine.decalerSemaine(b.lundi, -1);
      var index = Modele.indexerExercices(c.exercices || []);
      var enCours = {};
      (c.seances || []).forEach(function (s) { if (s && s.id && s.statut === 'en_cours') enCours[s.id] = true; });
      var datees = seancesDatees(c).filter(function (s) { return !enCours[s.id]; }).slice().sort(function (x, y) {
        return new Date(x.debut) - new Date(y.debut);
      });
      var parEchelle = {}, ordre = [];
      datees.forEach(function (s) {
        var d = new Date(s.debut);
        if (d > b.dimanche) return;
        var zone = d >= b.lundi ? 'semaine' : d >= avant.lundi ? 'avant' : 'ancien';
        var duJour = {};
        (s.series || []).forEach(function (x) {
          var exo = x && x.exercise_slug ? index[x.exercise_slug] : null;
          var E = exo ? Modele.echelleDe(exo) : null;
          if (E === null || !Modele.estTravail(x)) return;
          var r = parEchelle[E];
          if (!r) { r = parEchelle[E] = { echelle: E, derniere: null, exercices: {}, avantLaSemaine: {} }; ordre.push(E); }
          var slug = x.exercise_slug;
          if (zone === 'semaine') {
            var e = r.exercices[slug] || (r.exercices[slug] = { semaine: [], avant: [], derniere: null });
            e.semaine.push(x);
            e.derniere = s.debut;
            if (r.derniere === null || new Date(s.debut) > new Date(r.derniere)) r.derniere = s.debut;
          } else {
            (duJour[E + '|' + slug] = duJour[E + '|' + slug] || { E: E, slug: slug, debut: s.debut, series: [] }).series.push(x);
            if (zone === 'avant') {
              var e2 = r.exercices[slug] || (r.exercices[slug] = { semaine: [], avant: [], derniere: null });
              e2.avant.push(x);
            }
          }
        });
        // La dernière séance de chaque exercice AVANT la semaine (la séance d'avant remplace la précédente).
        Object.keys(duJour).forEach(function (k) { parEchelle[duJour[k].E].avantLaSemaine[duJour[k].slug] = duJour[k]; });
      });
      var out = [];
      ordre.forEach(function (E) {
        var r = parEchelle[E];
        if (r.derniere === null) return;
        var travailles = Object.keys(r.exercices).filter(function (s) { return r.exercices[s].semaine.length > 0; });
        var exercices = {};
        travailles.forEach(function (s) { exercices[s] = { semaine: r.exercices[s].semaine, avant: r.exercices[s].avant }; });
        // La marche franchie : un rang plus haut que tout ce qui précédait la semaine (et il y avait un « avant »).
        var pre = Object.keys(r.avantLaSemaine);
        var nouvelle = null;
        if (pre.length) {
          var ancien = Modele.marcheLaPlusHaute(index, pre, function (s) { return r.avantLaSemaine[s].debut; });
          var nouveau = Modele.marcheLaPlusHaute(index, travailles, function (s) { return r.exercices[s].derniere; });
          if (Modele.estPlusHaute(index, nouveau, ancien)) {
            nouvelle = { slug: nouveau, ancienne: { slug: ancien, series: r.avantLaSemaine[ancien].series } };
          }
        }
        out.push({ echelle: E, derniere: r.derniere, exercices: exercices, nouvelle: nouvelle });
      });
      return out.sort(function (x, y) { return new Date(y.derniere) - new Date(x.derniere); });
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
    //   · `dureeMin` : la MÉDIANE des durées (fin − début) des séances DE
    //     MUSCULATION (122, la règle du 119) des 84 derniers jours qui ONT une
    //     heure de fin, arrondie à 5 min — `null`
    //     sans durée. Les séances importées n'en ont pas toujours : on ne leur
    //     en invente pas (`Moteur.finEffective` est une borne de zone, pas une
    //     durée) ;
    //   · `maximums` : la charge la plus lourde de chacune des barres demandées
    //     (`barres` : des slugs, dans l'ordre voulu), par la fonction des records
    //     (MOTEUR §9.23) — celle de la page d'exercice ; seulement les barres
    //     faites ;
    //   · `autres` : les noms (catalogue, en minuscules) des SORTIES — le cardio
    //     (`Modele.estExerciceSortie`, 133 : jamais un étirement), hors ce qui
    //     porte un muscle — faites dans ces 84 jours, trois au plus, les plus
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
        // 122 (suite du 119, audit du 16/10/2026) — LA DURÉE HABITUELLE EST CELLE DES SÉANCES DE MUSCULATION
        // (`Semaine.estSeanceDeMusculation`, la règle de « à la salle ») : une randonnée de 2 h ou une séance
        // d'escalade ne la tirent plus. Le nombre de séances et le rythme, eux, comptent toujours les sorties.
        if (!Semaine.estSeanceDeMusculation(c.seriesDe ? c.seriesDe(s.id) : [], index)) return;
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

    // 188-2 (MOTEUR §9.27 bis) — LES CHUTES DE REPS d'un exercice : pour chacune de ses `n` dernières séances qui ont au moins trois
    // séries de travail à la MÊME charge pour la 1re et la 3e (sinon la baisse n'est pas celle de la fatigue), la part de reps
    // perdue de la série 1 à la série 3, `(reps1 − reps3) / reps1`. Les plus récentes d'abord. Une série « ne compte pas » est
    // écartée. Un fait : la règle du repos (`Moteur.reposAConseiller`) le lit, elle ne le recalcule pas.
    function chutesDeReps(c, slug, n) {
      var datees = seancesDatees(c).slice().sort(function (a, b) { return new Date(b.debut) - new Date(a.debut); });
      var sortie = [];
      for (var i = 0; i < datees.length && sortie.length < n; i++) {
        var travail = (datees[i].series || []).filter(function (x) {
          return x && x.exercise_slug === slug && Modele.estTravail(x) && x.hors_calcul !== true && Number(x.reps) > 0;
        });
        if (travail.length < 3) continue;
        travail = travail.map(function (x, k) { return { x: x, k: k }; }).sort(function (a, b) {
          var ra = typeof a.x.rang === 'number' ? a.x.rang : a.k, rb = typeof b.x.rang === 'number' ? b.x.rang : b.k;
          return ra - rb;
        }).map(function (o) { return o.x; });
        var s1 = travail[0], s3 = travail[2];
        if (Math.abs((Number(s3.charge_kg) || 0) - (Number(s1.charge_kg) || 0)) > 1e-9) continue;
        sortie.push(Math.round((Number(s1.reps) - Number(s3.reps)) / Number(s1.reps) * 10000) / 10000);
      }
      return sortie;
    }

    // ── Les habitudes (66C, QUESTIONNAIRE-COACH-V2 §5 quater.2) ──
    //
    // Sur la fenêtre du programme déduit (`Routines.fenetreDeLaPersonne` : les 84 jours qui finissent à la DERNIÈRE
    // séance, jamais « aujourd'hui »). Une séance COMPTE si elle a la signature du programme déduit
    // (`Routines.signatureDeSeance`, lue au même endroit, jamais recopiée). Les séries comptées ensuite : la série de
    // travail (`Modele.estTravail`) ; jamais une série qui ne porte pas de volume (`Semaine.porteDuVolume` : le cardio,
    // un étirement — 133b).
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
          // 133b (22/10/2026) — une série qui ne porte pas de volume (le cardio, un étirement) n'est pas une habitude
          // de musculation : la règle du volume, pas celle de la sortie (un étirement n'est plus une sortie).
          if (f && !Semaine.porteDuVolume(f)) return;
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

    // ── 99 (MOTEUR §9.24) — LA SEMAINE DU PROGRAMME : ce qui a été fait ─────
    //
    // La semaine qui déraille lit ici ce qui a été FAIT : les séances des 14 derniers jours (le jour civil, la
    // routine, les exercices de leurs séries de travail — la récupération et « a eu lieu ») et le volume de la
    // semaine par muscle (la règle du volume, `Semaine.volumeParMuscle`). `enCours` : la séance en cours, si elle
    // existe (elle a lieu). `jour` : 'AAAA-MM-JJ', passé (jamais l'horloge).
    var JOURS_DE_RECUPERATION = 14;
    function semaineDuProgramme(c, jour, enCours) {
      var cc = enCours ? corpusAvecLaSeance(c, enCours) : c;
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(jour || ''));
      if (!m) return { seances: [], volume: {} };
      var j0 = new Date(+m[1], +m[2] - 1, +m[3]);
      var depuis = Moteur.jourCivil(new Date(j0.getFullYear(), j0.getMonth(), j0.getDate() - JOURS_DE_RECUPERATION));
      var lundi = Moteur.jourCivil(Semaine.bornesSemaine(j0).lundi);
      var seances = [], series = [];
      (cc.seances || []).forEach(function (s) {
        if (!s || !s.debut) return;
        var js = Moteur.jourCivil(new Date(s.debut));
        if (!js || js < depuis || js > jour) return;
        var travail = (cc.seriesDe(s.id) || []).filter(function (x) { return x && Modele.estTravail(x); });
        if (js >= lundi) series = series.concat(travail);
        var slugs = {};
        travail.forEach(function (x) { slugs[x.exercise_slug] = true; });
        seances.push({ jour: js, routine_id: s.routine_id || null, slugs: Object.keys(slugs) });
      });
      var volume = {};
      Semaine.volumeParMuscle(series, cc.exercices).forEach(function (v) { volume[v.muscle] = v.series; });
      return { seances: seances, volume: volume };
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

    // ── 126 (ECRAN-SAISIE §7 quindecies.11) — les faits de la recherche d'exercice ──
    //
    // « Déjà fait, le plus fait d'abord » demande un NOMBRE DE SÉANCES, pas une date. La même définition de « fait »
    // que partout (`Modele.exercicesFaits` : au moins une série de travail, cardio compris), appliquée séance par
    // séance, sur les séances qui ont un début (celles que `datesDesExercices` compte : un exercice a un nombre si et
    // seulement s'il a une date). Chaque séance : `{ id, debut, routine_id, slugs }`, ses exercices faits dans l'ordre
    // des séries. Un balayage, gardé par la clé « séances | séries » (la même que `seancesAvecSeries`).
    var memoFaitesParSeance = { cle: null, liste: [] };
    function exercicesFaitsParSeance(c) {
      var cle = (c.seances || []).length + '|' + (c.series || []).length;
      if (memoFaitesParSeance.cle !== cle) {
        var liste = [], routineDe = {};
        (c.seances || []).forEach(function (x) { if (x && x.id) routineDe[x.id] = x.routine_id || null; });
        seancesAvecSeries(c).forEach(function (s) {
          if (!s.id || !s.debut) return;
          liste.push({ id: s.id, debut: s.debut, routine_id: routineDe[s.id] || null,
                       slugs: Object.keys(Modele.exercicesFaits(s.series)) });
        });
        memoFaitesParSeance = { cle: cle, liste: liste };
      }
      return memoFaitesParSeance.liste;
    }

    // `{ slug: nombre de séances où il est fait }`, toute l'histoire.
    var memoSeancesParExercice = { cle: null, compte: {} };
    function seancesParExercice(c) {
      var cle = (c.seances || []).length + '|' + (c.series || []).length;
      if (memoSeancesParExercice.cle !== cle) {
        var compte = {};
        exercicesFaitsParSeance(c).forEach(function (s) {
          s.slugs.forEach(function (x) { compte[x] = (compte[x] || 0) + 1; });
        });
        memoSeancesParExercice = { cle: cle, compte: compte };
      }
      return memoSeancesParExercice.compte;
    }

    // Les exercices faits dans les séances passées d'UNE routine (`sessions.routine_id`), le plus fréquent d'abord ;
    // à égalité, le plus récent, puis le slug. `sauf` : l'identifiant de la séance en cours (jamais comptée).
    function exercicesDeLaRoutine(c, routineId, sauf) {
      if (!routineId) return [];
      var compte = {}, dernier = {};
      exercicesFaitsParSeance(c).forEach(function (s) {
        if (s.routine_id !== routineId || (sauf && s.id === sauf)) return;
        s.slugs.forEach(function (x) {
          compte[x] = (compte[x] || 0) + 1;
          if (!dernier[x] || s.debut > dernier[x]) dernier[x] = s.debut;
        });
      });
      return Object.keys(compte).sort(function (a, b) {
        return compte[b] - compte[a] || (dernier[a] < dernier[b] ? 1 : dernier[a] > dernier[b] ? -1 : 0) ||
          (a < b ? -1 : a > b ? 1 : 0);
      });
    }

    // La séance libre : `recents`, les derniers exercices faits, le plus récent d'abord (dans une même séance, le
    // dernier fait d'abord) ; `plusFaits`, les plus faits sur les 3 derniers mois (le nombre de séances), à égalité le
    // plus récent, puis le slug. Les listes entières : l'écran retire ce qui est déjà là, puis en garde 5.
    var MOIS_DES_PLUS_FAITS = 3;
    function exercicesRecents(c, maintenant, sauf) {
      var m = new Date(maintenant || Date.now());
      var depuis = new Date(m.getTime()); depuis.setMonth(depuis.getMonth() - MOIS_DES_PLUS_FAITS);
      var seances = exercicesFaitsParSeance(c).filter(function (s) { return !(sauf && s.id === sauf); })
        .slice().sort(function (a, b) { return a.debut < b.debut ? 1 : a.debut > b.debut ? -1 : 0; });
      var recents = [], vu = {}, compte = {}, dernier = {};
      seances.forEach(function (s) {
        s.slugs.slice().reverse().forEach(function (x) { if (!vu[x]) { vu[x] = true; recents.push(x); } });
        var t = new Date(s.debut).getTime();
        if (isNaN(t) || t < depuis.getTime() || t > m.getTime()) return;
        s.slugs.forEach(function (x) {
          compte[x] = (compte[x] || 0) + 1;
          if (!dernier[x] || s.debut > dernier[x]) dernier[x] = s.debut;
        });
      });
      var plusFaits = Object.keys(compte).sort(function (a, b) {
        return compte[b] - compte[a] || (dernier[a] < dernier[b] ? 1 : dernier[a] > dernier[b] ? -1 : 0) ||
          (a < b ? -1 : a > b ? 1 : 0);
      });
      return { recents: recents, plusFaits: plusFaits };
    }

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
    // Les barres de « Ce que je sais » (le couché d'abord), écrites une fois dans `THModele` (124).
    var BARRES_DU_JEU = Modele.BARRES_DE_CE_QUE_JE_SAIS;
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
    // 182 — `sans` (facultatif) : l'identifiant d'une séance que le cache porte déjà (relue après un rechargement en
    // pleine séance) et que l'état « avant » ne doit PAS compter : sinon « avant » la contient, et l'apport de la séance
    // (`Jeu.apport(avant, apres).xp`) vaut 0. Une INSTANCE À PART, sur un corpus sans la séance, ses séries ni ses records.
    function corpusSansLaSeance(c, id) {
      return {
        seances: (c.seances || []).filter(function (s) { return s && s.id !== id; }),
        series: (c.series || []).filter(function (x) { return x && x.session_id !== id; }),
        exercices: c.exercices,
        seriesDe: function (sid) { return sid === id ? [] : c.seriesDe(sid); },
        catalogue: c.catalogue,
        journal: (c.journal || []).filter(function (l) { return !l || l.session_id !== id; })
      };
    }
    function faitsDuJeu(c, aujourdhui, enCours, sans) {
      if (sans && !(enCours && enCours.seance)) {
        var dedans = (c.seances || []).some(function (s) { return s && s.id === sans; }) ||
          (c.series || []).some(function (x) { return x && x.session_id === sans; });
        if (dedans) return creer().faitsDuJeu(corpusSansLaSeance(c, sans), aujourdhui);
      }
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
        // 153 (D) — la plus grande distance d'une série de travail, par sport (course, nage, velo) : le jeu ne lit pas les séries.
        distances: Modele.distancesMaxParSport(series),
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
    var BARRES_DU_BILAN = Modele.BARRES;   // les quatre barres, dans l'ordre de la spec (`THModele`, 124)
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

    // ── 75 — « Ton parcours » (ECRAN-SAISIE §7 bis.14 ter) ──────────────────
    //
    // L'entrée de `THParcours.parcours`, assemblée ici, et le parcours calculé, mémorisé : les séries DE TRAVAIL
    // (`Modele.estTravail`) des séances terminées, chacune avec le jour de sa séance ; le catalogue ; les priorités
    // (`Profil.prioritesDe`) et le sexe du profil ; aujourd'hui. Le JOUR est le jour civil local (`Moteur.jourCivil`),
    // celui de toute l'app (le mois écoulé, les records, la relecture) — l'appareil vit à Paris.
    //
    // ⚠️ SA MÉMOIRE : le nombre de séances et de séries du corpus, le jour, les priorités, le sexe — et le catalogue,
    // comparé par référence. Ouvrir Progression ne recalcule rien tant que rien de cela ne bouge. Rien n'est écrit.
    var memoParcours = { cle: null, catalogue: null, parcours: null };
    function entreeDuParcours(c, aujourdhui, profil) {
      var Profil = racine.THProfil;
      var index = c.catalogue() || {};
      var series = [];
      (c.seances || []).forEach(function (s) {
        if (!s || !s.id || !s.debut || s.statut === 'en_cours') return;
        var jour = Moteur.jourCivil(s.debut);
        if (!jour) return;
        (c.seriesDe(s.id) || []).forEach(function (x) {
          if (!x || !x.exercise_slug || !Modele.estTravail(x)) return;
          series.push({ debut: jour, seance: s.id, slug: x.exercise_slug,
                        reps: x.reps === undefined ? null : x.reps, charge: x.charge_kg === undefined ? null : x.charge_kg });
        });
      });
      return {
        aujourdhui: Moteur.jourCivil(aujourdhui),
        sexe: profil && typeof profil.sexe === 'string' ? profil.sexe : null,
        priorites: Profil ? Profil.prioritesDe(profil) : [],
        catalogue: Object.keys(index).map(function (slug) { return index[slug]; }),
        series: series
      };
    }
    function parcoursDe(c, aujourdhui, profil) {
      var Profil = racine.THProfil, catalogue = c.catalogue();
      var cle = (c.seances || []).length + '|' + (c.series || []).length + '|' + Moteur.jourCivil(aujourdhui) + '|' +
        (Profil ? Profil.prioritesDe(profil) : []).join(',') + '|' + (profil && profil.sexe);
      if (memoParcours.cle !== cle || memoParcours.catalogue !== catalogue) {
        memoParcours = { cle: cle, catalogue: catalogue,
                         parcours: racine.THParcours.parcours(entreeDuParcours(c, aujourdhui, profil)) };
      }
      return memoParcours.parcours;
    }

    // ── 95 — LES BILANS DE PÉRIODE (BILANS-V1, « Ton année ») ─────────────────
    //
    // L'entrée de `THBilans.bilanDeLaPeriode`, assemblée ici, et le bilan calculé, mémorisé : les séances TERMINÉES
    // jusqu'à la fin de la période (l'avant compte : « la plus lourde de ta vie », la comparaison), chacune avec son
    // jour civil, son titre et ses séries (brutes : le moteur les filtre par `Modele.estTravail`) ; le catalogue ; les
    // pesées au jour civil (`Poids.normaliser`) ; les paris de consigne observés (l'écran les passe :
    // `{ date, predite, observee }`, la date est le début de la séance du pari).
    //
    // ⚠️ SA MÉMOIRE : le nombre de séances et de séries, la période, le jour, le nombre de pesées et de paris, le
    // catalogue (par référence). Rien n'est écrit.
    function entreeDuBilan(c, periode, aujourdhui, autres) {
      var o = autres || {};
      var Poids = racine.THPoids;
      var seances = [];
      (c.seances || []).forEach(function (s) {
        if (!s || !s.id || !s.debut || s.statut === 'en_cours') return;
        var jour = Moteur.jourCivil(s.debut);
        if (!jour || jour > periode.fin) return;
        seances.push({ id: s.id, jour: jour, titre: s.titre || null, series: Modele.trierParRang(c.seriesDe(s.id) || []) });
      });
      seances.sort(function (a, b) { return a.jour < b.jour ? -1 : (a.jour > b.jour ? 1 : 0); });
      var index = c.catalogue() || {};
      var auj = Moteur.jourCivil(aujourdhui);
      return {
        periode: periode,
        aujourdhui: auj,
        seances: seances,
        salle: tempsALaSalle(c, periode.debut, auj && auj < periode.fin ? auj : periode.fin),
        exercices: Object.keys(index).map(function (slug) { return index[slug]; }),
        pesees: (Poids ? Poids.normaliser(o.pesees || []) : []).map(function (p) {
          return { jour: Moteur.jourCivil(p.date), poids: p.poids };
        }),
        paris: (o.paris || []).filter(function (q) { return q && q.date; }).map(function (q) {
          return { jour: Moteur.jourCivil(q.date), predite: q.predite, observee: q.observee };
        })
      };
    }
    // 97 — LES HEURES ET LES JOURS À LA SALLE d'une période (BILANS-V1, décision du 15/10/2026) : un FAIT, jamais
    // comparé à une autre période. `de`, `a` : des jours civils `AAAA-MM-JJ` inclus (heure de l'appareil, Paris).
    // Les jours : les jours civils distincts qui ont une séance terminée (deux séances le même jour : un jour). Les
    // heures : la somme des durées des séances terminées qui ont une fin après leur début ; une séance de plus de 5 h
    // (une séance oubliée ouverte) n'entre pas dans les heures, mais son jour compte. Rend `{ jours, minutes }`.
    // 119 (audit du 16/10/2026, décision du 15/10 complétée le 16/10) — SEULES LES SÉANCES DE MUSCULATION
    // (`Semaine.estSeanceDeMusculation` : au moins une série de travail d'un exercice qui porte du volume) : une
    // randonnée, un vélo ou un tapis seul ne comptent ni en heures ni en jours ; une séance mixte compte en entier.
    var SALLE_DUREE_MAX_MS = 5 * 3600000;
    function tempsALaSalle(c, de, a) {
      var jours = {}, ms = 0;
      var index = (c.catalogue && c.catalogue()) || {};
      (c.seances || []).forEach(function (s) {
        if (!s || !s.id || !s.debut || s.statut === 'en_cours') return;
        var jour = Moteur.jourCivil(s.debut);
        if (!jour || (de && jour < de) || (a && jour > a)) return;
        if (!Semaine.estSeanceDeMusculation(c.seriesDe ? c.seriesDe(s.id) : [], index)) return;
        jours[jour] = true;
        var t0 = Date.parse(s.debut), t1 = s.fin ? Date.parse(s.fin) : NaN;
        if (isFinite(t0) && isFinite(t1) && t1 > t0 && t1 - t0 <= SALLE_DUREE_MAX_MS) ms += t1 - t0;
      });
      return { jours: Object.keys(jours).length, minutes: Math.round(ms / 60000) };
    }

    // Une mémoire PAR PÉRIODE : le sommaire lit l'année écoulée, puis (hors production) l'année en cours.
    var memoBilans = {};
    function bilanDePeriode(c, periode, aujourdhui, autres) {
      var o = autres || {}, catalogue = c.catalogue();
      var cle = (c.seances || []).length + '|' + (c.series || []).length + '|' +
        Moteur.jourCivil(aujourdhui) + '|' + (o.pesees || []).length + '|' + (o.paris || []).length;
      var ici = periode.type + ':' + periode.cle, m = memoBilans[ici];
      if (!m || m.cle !== cle || m.catalogue !== catalogue) {
        m = memoBilans[ici] = { cle: cle, catalogue: catalogue,
                                bilan: racine.THBilans.bilanDeLaPeriode(entreeDuBilan(c, periode, aujourdhui, o)) };
      }
      return m.bilan;
    }

    // Les faits du jeu au début et à la fin d'une période (l'écran du jeu du bilan) : `faitsDuJeu` sur le corpus
    // réduit aux séances d'avant le premier jour, puis à celles jusqu'au dernier (aujourd'hui s'il vient avant), par
    // des INSTANCES À PART (`creer()`) — les mémos de celle-ci ne voient jamais un corpus réduit. Le journal des
    // records suit la même borne. Rien n'est écrit ; l'écran passe ces faits à `Jeu.etatDuJeu`.
    function corpusJusquA(c, jour) {
      var ids = {};
      var seances = (c.seances || []).filter(function (s) {
        var j = s && s.debut ? Moteur.jourCivil(s.debut) : null;
        var garde = !!j && j <= jour;
        if (garde) ids[s.id] = true;
        return garde;
      });
      return {
        seances: seances,
        series: (c.series || []).filter(function (x) { return x && Object.prototype.hasOwnProperty.call(ids, x.session_id); }),
        exercices: c.exercices,
        seriesDe: function (sid) { return Object.prototype.hasOwnProperty.call(ids, sid) ? c.seriesDe(sid) : []; },
        catalogue: c.catalogue,
        journal: (c.journal || []).filter(function (l) {
          var j = l && l.battu_le ? Moteur.jourCivil(l.battu_le) : null;
          return !j || j <= jour;
        })
      };
    }
    function faitsDuJeuDeLaPeriode(c, periode, aujourdhui) {
      var auj = Moteur.jourCivil(aujourdhui);
      var fin = auj && auj < periode.fin ? auj : periode.fin;
      var veille = function (j) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j);
        var d = new Date(+m[1], +m[2] - 1, +m[3] - 1);
        return Moteur.jourCivil(d);
      };
      var aMinuit = function (j) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j);
        return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
      };
      var avant = veille(periode.debut);
      return {
        debut: creer().faitsDuJeu(corpusJusquA(c, avant), aMinuit(avant)),
        fin: creer().faitsDuJeu(corpusJusquA(c, fin), aMinuit(fin))
      };
    }

    // ── 131 (ECRAN-SAISIE §3 ter.5, écran 5) — « CE QUI MANQUE À TES SÉANCES » ──────────────────────────────
    //
    // Ce qui est devenu possible à noter : les séries de travail des séances terminées dont un champ en plus du
    // catalogue est vide (le D+ d'une randonnée, les étages d'un escalier : `Modele.champsDeSerie`, au-delà des champs
    // de la mesure), et les séries de Vélo d'Appartement, Spinning et Rameur sans distance (passés en
    // `distance_temps` par v2_101). Groupé par (exercice, colonne) — la clé « slug:colonne » de
    // `profiles.completer_refus` : un groupe refusé (« Je ne sais plus ») n'y est plus, pour de bon. Dans chaque
    // groupe, de la plus récente à la plus ancienne ; les groupes, par leur série la plus récente. ⚠️ SANS MÉMO : une
    // correction change la VALEUR d'une série sans changer le nombre de séries, la clé des autres mémos ; un balayage
    // du corpus coûte moins qu'une carte qui garderait une ligne déjà complétée.
    var A_DISTANCE = ['velo_machine', 'spinning', 'rameur'];
    function ceQuiManque(c, refus) {
      var refuses = {};
      (Array.isArray(refus) ? refus : []).forEach(function (r) { if (typeof r === 'string') refuses[r] = true; });
      var index = c.catalogue() || {};
      var parCle = {}, liste = [];
      var vide = function (v) { return v === null || v === undefined || v === ''; };
      (c.seances || []).forEach(function (s) {
        if (!s || !s.id || !s.debut || s.statut === 'en_cours') return;
        c.seriesDe(s.id).forEach(function (x) {
          if (!x || !Modele.estTravail(x)) return;
          var exo = index[x.exercise_slug];
          if (!exo) return;
          var g = Modele.gabaritDe(exo);
          var noms = Modele.champsDeSerie(exo).slice(g.champs.length);
          if (A_DISTANCE.indexOf(x.exercise_slug) >= 0 && g.mesure === 'distance_temps') noms = noms.concat(['distance_km']);
          noms.forEach(function (nom) {
            var champ = Modele.champDeMesure(nom);
            if (!champ || !vide(x[champ.cle])) return;
            var k = x.exercise_slug + ':' + champ.cle;
            if (refuses[k]) return;
            if (!parCle[k]) {
              parCle[k] = { cle: k, slug: x.exercise_slug, colonne: champ.cle, champ: nom, nom: exo.nom || x.exercise_slug,
                            lignes: [] };
              liste.push(parCle[k]);
            }
            parCle[k].lignes.push({ serieId: x.id, seanceId: s.id, debut: s.debut, rang: x.rang || 0, serie: x });
          });
        });
      });
      var recent = function (a, b) {
        return String(b.debut).localeCompare(String(a.debut)) || (a.rang - b.rang);
      };
      liste.forEach(function (gr) {
        gr.lignes.sort(recent);
        var seances = {};
        gr.lignes.forEach(function (l) { seances[l.seanceId] = true; });
        gr.seances = Object.keys(seances).length;
      });
      liste.sort(function (a, b) { return recent(a.lignes[0], b.lignes[0]); });
      return liste;
    }

    // ── 185 — LA VRAISEMBLANCE D'UNE SÉRIE (décision d'Aurélien du 29/10/2026) ───────────────────────────────────────
    //
    // « Une saisie n'est pas forcément vraie. » AVANT qu'une série s'écrive, une fonction PURE regarde ce qui vient d'être
    // tapé contre ce que l'exercice a toujours été (son historique), la consigne du jour et la série d'avant, et rend
    // `null` (rien à dire) ou UNE question : `{ genre, texte, boutons }`. Elle ne bloque jamais : chaque bouton dit
    // ce que l'écran écrit ensuite (`action`) — l'écran exécute, il ne décide rien. Les seuils sont ceux de la maquette
    // validée (maquette-saisie-vraisemblance-v1.html) ; ils sont des constantes nommées, une fois.
    //
    //   saisie    { charge, reps, type, equipement }   — ce qui est tapé (ou grisé par le coach), type = `type_serie`
    //   contexte  { historique : [{ series }]          — les séances d'AVANT de l'exercice (`seancesDeLExercice`)
    //               seance     : [serie]               — les séries déjà VALIDÉES de l'exercice dans la séance du jour
    //               cible      : reps visées | null    — la consigne du jour (reps)
    //               chargeVisee: kg | null             — la consigne du jour (charge)
    //               confirmations : { genre : n }      — les « Oui » déjà donnés sur CET exercice (apprentissage)
    //             }
    var SEUIL_SEANCES_VRAISEMBLANCE = 3;     // avant 3 séances de l'exercice : seulement l'absurde
    var HAUSSE_RELATIVE = 0.15, HAUSSE_ABSOLUE_KG = 10, HAUSSE_ABSOLUE_HALTERE_KG = 4;
    var DOUBLE_HALTERES_MIN = 1.8, DOUBLE_HALTERES_MAX = 2.2;
    var BAISSE_RELATIVE = 0.35, BAISSE_ABSOLUE_KG = 10;
    var REPS_PLAFOND_CIBLE = 2.5, REPS_MOITIE = 0.5;
    var RECORD_ECART_RELATIF = 0.20;          // la question du record : plus de 20 % au-dessus du meilleur
    var CONFIRMATIONS_POUR_APPRENDRE = 2;     // deux « Oui » au même genre sur le même exercice : on ne le demande plus
    var EPSILON = 1e-9;                       // 100 × 1,15 vaut 114,99999… : une borne PILE n'est pas dépassée
    var GENRES_DE_QUESTION = ['hausse', 'double_halteres', 'baisse', 'zero', 'reps_haut', 'reps_bas'];

    function nombreOuNul(v) {
      if (v === null || v === undefined || v === '') return null;
      var n = Number(v);
      return isFinite(n) ? n : null;
    }
    function bouton(texte, action, principal, valeur) {
      var b = { texte: texte, action: action, principal: principal === true };
      if (valeur !== undefined) b.valeur = valeur;
      return b;
    }
    // Les séries d'un exercice qui font une référence : du travail, une charge, hors des séries « Non, ne compte pas »
    // (`estTravail` les écarte).
    function seriesDeReference(liste) {
      return (liste || []).filter(function (x) {
        var kg = x ? nombreOuNul(x.charge_kg) : null;
        return !!x && Modele.estTravail(x) && kg !== null && kg > 0;
      });
    }
    // Le meilleur de l'exercice : la plus lourde charge de travail de l'historique ET des séries déjà validées du jour
    // (une charge confirmée plus tôt dans la séance n'est plus une surprise).
    function meilleurDeLExercice(historique, deLaSeance) {
      var meilleur = null;
      (historique || []).forEach(function (g) {
        seriesDeReference(g && g.series).forEach(function (x) {
          var kg = Number(x.charge_kg);
          if (meilleur === null || kg > meilleur) meilleur = kg;
        });
      });
      seriesDeReference(deLaSeance).forEach(function (x) {
        var kg = Number(x.charge_kg);
        if (meilleur === null || kg > meilleur) meilleur = kg;
      });
      return meilleur;
    }
    function seancesFaites(historique) {
      return (historique || []).filter(function (g) { return seriesDeReference(g && g.series).length > 0; }).length;
    }
    // L'habitude : la charge la plus lourde de la dernière séance de l'exercice qui a du travail (l'historique arrive de
    // la plus récente à la plus ancienne, comme `seancesDeLExercice`).
    function habitudeDeLExercice(historique) {
      for (var i = 0; i < (historique || []).length; i++) {
        var l = seriesDeReference(historique[i] && historique[i].series);
        if (l.length) return Math.max.apply(null, l.map(function (x) { return Number(x.charge_kg); }));
      }
      return null;
    }
    // Une correction plausible pour des reps démesurées : le dernier chiffre en trop (100 -> 10, 30 -> 3), tant qu'elle
    // reste dans la fourchette crédible. Sinon, rien : seuls « Oui » et « Corriger » restent.
    function repsPlausible(reps, plafond) {
      var c = Math.floor(reps / 10);
      return reps >= 20 && c >= 1 && c <= plafond ? c : null;
    }

    function vraisemblanceDeLaSerie(saisie, contexte) {
      var s = saisie || {}, c = contexte || {};
      var reps = nombreOuNul(s.reps), charge = nombreOuNul(s.charge);
      var type = s.type || 'travail';

      // Des reps négatives ou décimales : refusées sur place, sans question, à tout moment.
      if (reps !== null && (reps < 0 || Math.floor(reps) !== reps)) {
        return { genre: 'reps_invalides', refus: true,
                 texte: reps < 0 ? 'Les reps ne peuvent pas être négatives.' : 'Les reps sont un nombre entier.', boutons: [] };
      }

      var historique = c.historique || [];
      var aSesHabitudes = seancesFaites(historique) >= SEUIL_SEANCES_VRAISEMBLANCE;
      var confirmations = c.confirmations || {};
      var question = function (genre, texte, boutons) {
        if ((nombreOuNul(confirmations[genre]) || 0) >= CONFIRMATIONS_POUR_APPRENDRE) return null;
        return { genre: genre, texte: texte, boutons: boutons };
      };
      var cible = nombreOuNul(c.cible);

      // L'absurde, pour tous : des reps au-delà de 2,5 fois la cible (la cible d'une série de travail).
      var travaille = Modele.estTravail({ type_serie: type, reps: reps });   // la lecture UNE : un échec à 1 rep ou plus est du travail
      if (reps !== null && travaille && cible !== null && cible > 0 && reps > REPS_PLAFOND_CIBLE * cible) {
        var corrige = repsPlausible(reps, Math.floor(REPS_PLAFOND_CIBLE * cible));
        var bs = [bouton('Oui, ' + Modele.nombreTexte(reps), 'garder', corrige === null)];
        if (corrige !== null) bs.push(bouton(Modele.nombreTexte(corrige), 'reps', true, corrige));
        bs.push(bouton('Corriger', 'corriger'));
        return question('reps_haut', Modele.nombreTexte(reps) + ' reps ? La cible : ' + Modele.nombreTexte(cible) + '.', bs);
      }
      if (!aSesHabitudes) return null;

      var haltere = s.equipement === 'haltere';
      var meilleur = meilleurDeLExercice(historique, c.seance);
      var habitude = habitudeDeLExercice(historique);

      if (charge !== null && charge > 0) {
        // Les haltères à environ deux fois l'habitude : le total tapé à la place de la charge par haltère.
        if (haltere && type !== 'echauffement' && type !== 'test') {
          var refs = [habitude, meilleur].filter(function (r) { return r !== null && r > 0; });
          var estDouble = refs.some(function (r) {
            var q = charge / r;
            return q >= DOUBLE_HALTERES_MIN - EPSILON && q <= DOUBLE_HALTERES_MAX + EPSILON && charge - r > HAUSSE_ABSOLUE_HALTERE_KG + EPSILON;
          });
          if (estDouble) {
            var moitie = Math.round(charge / 2 * 100) / 100;
            // Appris : on ne redemande pas, et la hausse ci-dessous dirait la même chose.
            return question('double_halteres', Modele.charge(charge) + ' : par haltère, ou les deux ensemble ?', [
              bouton(Modele.nombreTexte(moitie) + ' par haltère', 'charge', true, moitie),
              bouton(Modele.nombreTexte(charge) + ' par haltère', 'garder')
            ]);
          }
        }
        // Une charge très au-dessus du meilleur : plus de 15 % ET plus de 10 kg (4 kg par haltère).
        if (meilleur !== null && type !== 'echauffement' && type !== 'test') {   // 186 — un test déclaré se sait au-dessus du meilleur
          var seuilAbsolu = haltere ? HAUSSE_ABSOLUE_HALTERE_KG : HAUSSE_ABSOLUE_KG;
          if (charge > meilleur * (1 + HAUSSE_RELATIVE) + EPSILON && charge - meilleur > seuilAbsolu + EPSILON) {
            return question('hausse', Modele.charge(charge) + ' ? Ton meilleur ici : ' + Modele.charge(meilleur) + '.', [
              bouton('Oui, ' + Modele.nombreTexte(charge), 'garder', true),
              bouton('Corriger', 'corriger')
            ]);
          }
        }
        // Une baisse : plus de 35 % ET plus de 10 kg sous la consigne du jour (à défaut, la série d'avant) ; jamais pour
        // une chauffe ni une dégressive, qui descendent exprès.
        if (type !== 'echauffement' && type !== 'degressive') {
          var ref = nombreOuNul(c.chargeVisee), origine = 'consigne';
          if (ref === null || ref <= 0) {
            var avant = seriesDeReference(c.seance), derniere = avant.length ? avant[avant.length - 1] : null;
            ref = derniere ? Number(derniere.charge_kg) : null;
            origine = 'avant';
          }
          if (ref !== null && ref > 0 && charge < ref * (1 - BAISSE_RELATIVE) - EPSILON && ref - charge > BAISSE_ABSOLUE_KG + EPSILON) {
            return question('baisse', Modele.charge(charge) + ' ? ' + (origine === 'consigne' ? 'Ta consigne : ' : 'Ta série d’avant : ') +
              Modele.charge(ref) + '.', [bouton('Oui, ' + Modele.nombreTexte(charge), 'garder', true), bouton('Corriger', 'corriger')]);
          }
        }
      }

      if (reps !== null) {
        // 0 rep : une tentative manquée, jamais « ton niveau est 0 ».
        if (reps === 0 && Modele.estTravail({ type_serie: type, reps: 0 })) {   // un 0 déjà tagué « échec » est déjà une tentative manquée
          return question('zero', '0 rep : tu l’as manquée ?', [
            bouton('Oui, manquée', 'manquee', true), bouton('J’ai eu mal', 'mal'), bouton('Corriger', 'corriger')]);
        }
        // Moins de la moitié de la série d'avant du même exercice, à la même charge.
        if (reps > 0 && travaille && charge !== null) {
          var memes = seriesDeReference(c.seance).filter(function (x) {
            return Math.abs(Number(x.charge_kg) - charge) < 0.005 && nombreOuNul(x.reps) !== null && Number(x.reps) > 0;
          });
          var prec = memes.length ? memes[memes.length - 1] : null;
          if (prec && reps < REPS_MOITIE * Number(prec.reps)) {
            return question('reps_bas', Modele.nombreTexte(reps) + ' reps ? Ta série d’avant : ' + Modele.nombreTexte(Number(prec.reps)) + '.',
              [bouton('Oui, ' + Modele.nombreTexte(reps), 'garder', true), bouton('Corriger', 'corriger')]);
          }
        }
      }
      return null;
    }

    // Le cas 5 de la maquette : une hausse CONFIRMÉE qui dépasse le meilleur de plus de 20 % ne s'inscrit pas au journal
    // des records (immuable) sans un mot de plus. Rend `null` ou `{ genre: 'record', texte, boutons, ecart }`. Le meilleur
    // est celui d'AVANT cette série (l'historique et les séries validées du jour qui la précèdent).
    function questionDuRecord(serie, contexte) {
      var s = serie || {}, c = contexte || {};
      var charge = nombreOuNul(s.charge), reps = nombreOuNul(s.reps);
      if (charge === null || charge <= 0 || reps === null || reps < 1) return null;
      if (!Modele.estTravail({ type_serie: s.type, reps: reps })) return null;
      var historique = c.historique || [];
      if (seancesFaites(historique) < SEUIL_SEANCES_VRAISEMBLANCE) return null;
      var meilleur = meilleurDeLExercice(historique, c.seance);
      if (meilleur === null) return null;
      var haltere = s.equipement === 'haltere';
      if (!(charge > meilleur * (1 + RECORD_ECART_RELATIF) + EPSILON && charge - meilleur > (haltere ? HAUSSE_ABSOLUE_HALTERE_KG : HAUSSE_ABSOLUE_KG) + EPSILON)) return null;
      var ecart = Math.round((charge - meilleur) * 100) / 100;
      return { genre: 'record', ecart: ecart,
               texte: 'Record à ' + Modele.charge(charge) + ' × ' + Modele.nombreTexte(reps) + ', ' + Modele.charge(ecart) + ' de plus que ton meilleur. Je l’inscris ?',
               boutons: [bouton('Oui, c’est un record', 'garder', true), bouton('Non, ne compte pas', 'hors_calcul')] };
    }

    return {
      entreeDuBilan: entreeDuBilan,
      tempsALaSalle: tempsALaSalle,
      bilanDePeriode: bilanDePeriode,
      faitsDuJeuDeLaPeriode: faitsDuJeuDeLaPeriode,
      entreeDuParcours: entreeDuParcours,
      parcoursDe: parcoursDe,
      seancesAvecSeries: seancesAvecSeries,
      seriesComptees: seriesComptees,
      recordsSansDepasser: recordsSansDepasser,
      scoresDeGuilde: scoresDeGuilde,
      TYPES_DE_LA_GUILDE: TYPES_DE_LA_GUILDE,
      seancesDuSlug: seancesDuSlug,
      seancesDeLExercice: seancesDeLExercice,
      tenuesDeLExercice: tenuesDeLExercice,
      recordsDeLaSeance: recordsDeLaSeance,
      recordsDuMois: recordsDuMois,
      dernierRecord: dernierRecord,
      historiqueDesRecords: historiqueDesRecords,
      seanceDesRecords: seanceDesRecords,
      recordsDeLaSerie: recordsDeLaSerie,
      recordsDuJour: recordsDuJour,
      recapDeLaSeance: recapDeLaSeance,
      faitDeLExercice: faitDeLExercice,
      ceQuiManque: ceQuiManque,
      journalDuJour: journalDuJour,
      journalDeLaSeance: journalDeLaSeance,
      recordsDuJournal: recordsDuJournal,
      vraisemblanceDeLaSerie: vraisemblanceDeLaSerie,
      questionDuRecord: questionDuRecord,
      GENRES_DE_QUESTION: GENRES_DE_QUESTION,
      CONFIRMATIONS_POUR_APPRENDRE: CONFIRMATIONS_POUR_APPRENDRE,
      medaillesDuSocial: medaillesDuSocial,
      semaineDe: semaineDe,
      echellesDeLaSemaine: echellesDeLaSemaine,
      datesDesExercices: datesDesExercices,
      exercicesFaitsParSeance: exercicesFaitsParSeance,
      seancesParExercice: seancesParExercice,
      exercicesDeLaRoutine: exercicesDeLaRoutine,
      exercicesRecents: exercicesRecents,
      compterExercices: compterExercices,
      ceQueJeSais: ceQueJeSais,
      programmeDeduit: programmeDeduit,
      historiqueDesExercices: historiqueDesExercices,
      chutesDeReps: chutesDeReps,
      habitudes: habitudes,
      derniereSeance: derniereSeance,
      seancesDesRoutines: seancesDesRoutines,
      semaineDuProgramme: semaineDuProgramme,
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
